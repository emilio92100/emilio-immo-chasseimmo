import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { modele, pdfDocument, type Donnees } from '@/lib/actes';
import { noteOffre } from '@/lib/actes/offre-achat';
import { lireIdentiteAgence } from '@/lib/agence';
import { envoyerMail, echappe, type PieceJointe } from '@/lib/mandat-serveur';
import { ecritServeur } from '@/lib/ecritures';
import { CLES_MAIL, conseillerDe, personnaliser } from '@/lib/mail-variables';
import { enveloppeMail } from '@/lib/mail-charte';

/**
 * Les fichiers des documents juridiques (Documents juridiques, dans le CRM).
 *
 * Le bucket « mandats » est privé. Le navigateur n'y écrit pas lui-même :
 * cette route, côté serveur et avec la clé SERVICE, lui donne un droit de
 * dépôt d'un seul fichier, à un chemin qu'elle choisit. Le fichier part
 * ensuite directement du navigateur vers le stockage — un exemplaire signé
 * scanné peut peser plusieurs mégaoctets, trop pour passer par ici.
 *
 * Protégée par le code d'accès, comme le reste du CRM (src/proxy.ts).
 *
 *   POST { action: 'depot', id, genre: 'pdf' | 'signe', ext }  →  { ok, chemin, jeton }
 *   POST { action: 'lien', chemin, nom? }                      →  { ok, url }   (5 minutes)
 *   POST { action: 'retirer', id }                             →  { ok, n }     (tous ses fichiers)
 *   POST { action: 'projet', id, destinataires, sujet, message }
 *                                                →  { ok, envoyes, avertissements, envoi, row }
 *   POST { action: 'offre', id, destinataires, sujet, message }   (V3.145)
 *                                                →  { ok, envoyes, avertissements, envoi, row }
 *
 * Tout vit sous documents/<id du document>/ : la route refuse le reste.
 *
 * « projet » (V3.40) : un brouillon part en relecture, avant toute
 * signature, à qui Alexandre choisit. Le PDF est fabriqué ici, depuis les
 * réponses enregistrées, marqué « PROJET NON SIGNÉ » sur chaque page — le
 * même que « Aperçu PDF ». Un mail par personne, à son prénom ({{prénom}}),
 * au nom d'Alexandre. Ensuite : l'envoi est noté dans le document
 * (`documents.envois`, outils/sql/documents-envois.sql), dans l'historique
 * du bien en vente s'il y en a un, et dans le Suivi de chaque contact du
 * CRM qui l'a reçu. Le document reste un brouillon : on le corrige, on
 * renvoie, sans rien annuler.
 */

export const maxDuration = 60;

const BUCKET = 'mandats';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT = new Set(['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp']);
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ENVOIS_MAX = 50;

const ko = (erreur: string, status = 400) => NextResponse.json({ ok: false, erreur }, { status });

/* « Mandat simple · SCI AVIENA » → « Projet-Mandat-simple-SCI-AVIENA.pdf ».
   Le même calcul que nomProjet() côté écran (EnvoiProjet.tsx). */
const nomProjet = (titre: string) => `Projet-${(titre || 'Document').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[’']/g, '-').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'Document'}.pdf`;

/* La colonne des envois manque : le SQL n'est pas encore passé. */
const colonneEnvoisAbsente = (m: string) => /envois/i.test(m) && /schema cache|does not exist/i.test(m);

type DocProjet = {
  id: string; modele: string; statut: string; titre: string | null; donnees: Donnees | null;
  client_id: string | null; recherche_id: string | null; envois?: unknown; signe_chemin?: string | null;
};
/* « Offre d’achat · M. Martin » → « Offre-d-achat-M-Martin-signe.pdf » : le
   même nom que nomFichier(doc, '-signe') côté écran (documents/outils.ts). */
const nomSigne = (titre: string, ext: string) => `${(titre || 'Document').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[’']/g, '-').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'Document'}-signe.${ext}`;
const TYPE_EXT: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };
type DestProjet = { email: string; nom: string; prenom: string; famille: string };

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return ko('Variables Supabase manquantes', 500);
  const sb = createClient(url, cle, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return ko('Requête illisible'); }
  const action = String(body.action || '');

  try {
    if (action === 'depot') {
      const id = String(body.id || '');
      const genre = body.genre === 'signe' ? 'signe' : body.genre === 'pdf' ? 'pdf' : '';
      const ext = String(body.ext || '').toLowerCase().replace(/[^a-z]/g, '');
      if (!UUID.test(id)) return ko('Document inconnu');
      if (!genre) return ko('Genre de fichier inconnu');
      if (!EXT.has(ext)) return ko('Format refusé : PDF, JPG ou PNG');
      /* Le document doit exister : on ne dépose rien pour un identifiant inventé. */
      const { data: doc, error: eDoc } = await sb.from('documents').select('id').eq('id', id).maybeSingle();
      if (eDoc) return ko(eDoc.message, 500);
      if (!doc) return ko('Document introuvable', 404);
      const chemin = `documents/${id}/${genre}-${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(chemin);
      if (error || !data) return ko(error?.message || 'Dépôt impossible', 500);
      return NextResponse.json({ ok: true, chemin: data.path, jeton: data.token });
    }

    if (action === 'lien') {
      const chemin = String(body.chemin || '');
      if (!/^documents\/[0-9a-f-]{36}\/[a-z]+-\d+\.[a-z]+$/i.test(chemin)) return ko('Chemin refusé');
      const nom = String(body.nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
      /* V3.120 : « Consulter », « Voir » ouvrent le fichier dans l'onglet (le
         navigateur l'affiche, et propose de l'enregistrer). Le lien ne force
         le téléchargement que si on le demande (`telecharger`). Avant, le nom
         du fichier suffisait à le télécharger d'office. */
      const { data, error } = await sb.storage.from(BUCKET)
        .createSignedUrl(chemin, 300, nom && body.telecharger === true ? { download: nom } : undefined);
      if (error || !data) return ko(error?.message || 'Fichier introuvable', 404);
      return NextResponse.json({ ok: true, url: data.signedUrl });
    }

    if (action === 'retirer') {
      const id = String(body.id || '');
      if (!UUID.test(id)) return ko('Document inconnu');
      /* V3.43 : seulement les fichiers d'un brouillon, ou d'un document déjà
         supprimé. Un document prêt, signé ou annulé garde les siens. */
      const { data: doc, error: eDoc } = await sb.from('documents').select('statut').eq('id', id).maybeSingle();
      if (eDoc) return ko(eDoc.message, 500);
      if (doc && (doc as { statut?: string }).statut !== 'brouillon') return ko('Ce document n’est plus un brouillon : ses fichiers restent.', 409);
      const { data, error } = await sb.storage.from(BUCKET).list(`documents/${id}`, { limit: 100 });
      if (error) return ko(error.message, 500);
      const chemins = (data || []).map(f => `documents/${id}/${f.name}`);
      if (chemins.length) {
        const { error: e2 } = await sb.storage.from(BUCKET).remove(chemins);
        if (e2) return ko(e2.message, 500);
      }
      return NextResponse.json({ ok: true, n: chemins.length });
    }

    /* ── Le projet, en relecture, avant toute signature (V3.40) ── */
    if (action === 'projet') {
      const id = String(body.id || '');
      if (!UUID.test(id)) return ko('Document inconnu');
      const sujet = String(body.sujet || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const message = String(body.message || '').replace(/\r\n?/g, '\n').trim().slice(0, 20_000);
      if (!sujet) return ko('L’objet du mail est vide');
      if (!message) return ko('Le message est vide');
      const court = (v: unknown, n: number) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
      const dests: DestProjet[] = (Array.isArray(body.destinataires) ? body.destinataires : []).slice(0, 20).map((x: unknown) => {
        const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
        return { email: court(o.email, 160).toLowerCase(), nom: court(o.nom, 120), prenom: court(o.prenom, 60), famille: court(o.famille, 80) };
      }).filter((x: DestProjet, i: number, l: DestProjet[]) => MAIL.test(x.email) && l.findIndex(y => y.email === x.email) === i);
      if (!dests.length) return ko('Aucune adresse e-mail valable');

      const { data: lu, error: eDoc } = await sb.from('documents').select('*').eq('id', id).maybeSingle();
      if (eDoc) return ko(eDoc.message, 500);
      if (!lu) return ko('Document introuvable', 404);
      const doc = lu as DocProjet;
      if (doc.statut !== 'brouillon') return ko('Ce document n’est plus un brouillon : le projet s’envoie avant la finalisation. Pour le faire signer, passe par sa fiche.', 409);
      const m = modele(doc.modele);
      if (!m) return ko(`Modèle inconnu : « ${doc.modele} »`);
      if (m.courrier) return ko('Un courrier ne s’envoie pas en projet.');
      const d: Donnees = doc.donnees || {};

      /* Le PDF, tel que « Aperçu PDF » le montre : l'identité de l'agence du
         jour, et la marque « PROJET NON SIGNÉ » sur chaque page. */
      const [identite, reglages] = await Promise.all([
        lireIdentiteAgence(sb),
        sb.from('parametres').select('cle, valeur').in('cle', CLES_MAIL),
      ]);
      const conseiller = conseillerDe(Object.fromEntries(((reglages.data || []) as { cle: string; valeur: string | null }[]).map(r => [r.cle, r.valeur || ''])));
      let octets: Uint8Array;
      try { octets = await pdfDocument(m, d, identite, { projet: true }); } catch (e) { return ko(`Le PDF n’a pas pu être préparé : ${(e as Error).message}`, 500); }
      const fichier = nomProjet(doc.titre || m.titre);
      const pj: PieceJointe[] = [{ nom: fichier, type: 'application/pdf', base64: Buffer.from(octets).toString('base64') }];

      /* Un mail par personne : chacun le sien, à son prénom. Sans prénom
         connu, « Bonjour {{prénom}}, » devient « Bonjour, ». */
      const texteDe = (x: DestProjet) => personnaliser(message, { prenom: x.prenom, nom: x.famille }, conseiller).replace(/[ \t]+,/g, ',');
      const envoyes: DestProjet[] = [];
      const echecs: string[] = [];
      for (const dst of dests) {
        const texte = texteDe(dst);
        const paras = texte.split(/\n{2,}/).map(t => `<p style="margin:0 0 14px">${echappe(t).replace(/\n/g, '<br>')}</p>`).join('');
        /* V3.118 : dans l'enveloppe de la charte, le logo Emilio en tête. */
        const html = enveloppeMail({ corps: paras });
        const err = await envoyerMail({ a: dst.email, nomA: dst.nom || undefined, sujet, texte, html, pj });
        if (err) echecs.push(`${dst.email} (${err})`); else envoyes.push(dst);
      }
      if (!envoyes.length) return ko(`Le mail n’est pas parti : ${echecs.join(' · ')}`, 502);

      const avertissements: string[] = echecs.map(e => `Pas parti à ${e}`);
      const le = new Date().toISOString();
      const envoi = {
        le, a: envoyes.map(x => ({ email: x.email, nom: x.nom })), sujet, message: message.slice(0, 5000), fichier,
        ...(echecs.length ? { echecs } : {}),
      };

      /* 1. Dans le document : la liste de ses envois (sans toucher à
            updated_at, qui dit quand le texte a changé). */
      const avant = Array.isArray(doc.envois) ? doc.envois : [];
      let row: unknown = null;
      const maj = await sb.from('documents').update({ envois: [...avant, envoi].slice(-ENVOIS_MAX) }).eq('id', id).select('*').maybeSingle();
      if (maj.error) {
        console.error('[documents] envois', maj.error.message);
        avertissements.push(colonneEnvoisAbsente(maj.error.message)
          ? 'Il n’est pas encore noté dans la fiche du document : lance d’abord le fichier outils/sql/documents-envois.sql dans Supabase › SQL Editor.'
          : `La fiche du document : ${maj.error.message}`);
      } else row = maj.data;

      /* 2. Les contacts du CRM qui l'ont reçu, retrouvés par leur adresse. */
      const adresses = envoyes.map(x => x.email);
      const contactDe: Record<string, string> = {};
      const trouves = await sb.from('clients').select('id, emails').overlaps('emails', adresses);
      if (trouves.error) console.error('[documents] contacts', trouves.error.message);
      for (const c of (trouves.data || []) as { id: string; emails: string[] | null }[]) {
        for (const e of c.emails || []) {
          const k = String(e).trim().toLowerCase();
          if (adresses.includes(k) && !contactDe[k]) contactDe[k] = c.id;
        }
      }
      const titreDoc = doc.titre || m.titre;
      for (const dst of envoyes) {
        const cid = contactDe[dst.email];
        if (!cid) continue;
        await ecritServeur('Le Suivi du contact', sb.from('journal').insert({
          client_id: cid, recherche_id: cid === doc.client_id ? doc.recherche_id : null, type: 'mail_envoye',
          titre: `✉️ Projet envoyé — ${titreDoc}`,
          description: `À : ${dst.email}\nObjet : ${sujet}\n\n${texteDe(dst)}\n\nPièce jointe : ${fichier}`,
          metadata: { document_id: id, projet: true },
        }), avertissements);
      }

      /* 3. L'historique du bien en vente, s'il y en a un. */
      const bienId = typeof d.bienVenteId === 'string' && UUID.test(d.bienVenteId) ? d.bienVenteId : '';
      if (bienId) {
        await ecritServeur('L’historique du bien', sb.from('biens_vente_suivi').insert({
          bien_id: bienId, type: 'envoi', qui: envoyes.map(x => x.nom || x.email).join(', '),
          client_id: envoyes.map(x => contactDe[x.email]).find(Boolean) || null, commentaire: sujet,
          donnees: { a: adresses, pieces: [fichier], mode: 'pj', taille: octets.length, projet: true, document_id: id },
        }), avertissements);
      }

      return NextResponse.json({ ok: true, envoyes: adresses, avertissements, envoi, row });
    }

    /* ── L'offre d'achat signée, à l'agence du vendeur (V3.145) ──
       Le fichier signé tel qu'il est rangé (scellé avec son certificat, ou le
       scan d'une offre signée à la main), en pièce jointe, à qui Alexandre
       tape. Rien d'autre ne part : ses honoraires ne sont pas dans l'offre.
       Noté dans le document (`envois`, avec `offre: true`), dans le Suivi du
       client, et dans celui du confrère s'il est dans le CRM. */
    if (action === 'offre') {
      const id = String(body.id || '');
      if (!UUID.test(id)) return ko('Document inconnu');
      const sujet = String(body.sujet || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const message = String(body.message || '').replace(/\r\n?/g, '\n').trim().slice(0, 20_000);
      if (!sujet) return ko('L’objet du mail est vide');
      if (!message) return ko('Le message est vide');
      const adresses = [...new Set((Array.isArray(body.destinataires) ? body.destinataires : []).slice(0, 10)
        .map((x: unknown) => String(x || '').trim().toLowerCase()).filter((x: string) => MAIL.test(x)))] as string[];
      if (!adresses.length) return ko('Aucune adresse e-mail valable');

      const { data: lu, error: eDoc } = await sb.from('documents').select('*').eq('id', id).maybeSingle();
      if (eDoc) return ko(eDoc.message, 500);
      if (!lu) return ko('Document introuvable', 404);
      const doc = lu as DocProjet;
      if (doc.modele !== 'offre_achat') return ko('Seule une offre d’achat s’envoie ainsi.');
      if (doc.statut !== 'signe') return ko('L’offre n’est pas encore signée par tout le monde : elle part une fois signée.', 409);
      if (!doc.signe_chemin) return ko('L’exemplaire signé n’est pas encore déposé : dépose-le d’abord (scan ou photo), puis envoie.', 409);
      const { data: f, error: eF } = await sb.storage.from(BUCKET).download(doc.signe_chemin);
      if (eF || !f) return ko(`L’exemplaire signé n’a pas pu être lu : ${eF?.message || 'introuvable'}`, 500);
      const octets = new Uint8Array(await f.arrayBuffer());
      const ext = (doc.signe_chemin.split('.').pop() || 'pdf').toLowerCase();
      const fichier = nomSigne(doc.titre || 'Offre d’achat', ext === 'jpeg' ? 'jpg' : ext);
      const pj: PieceJointe[] = [{ nom: fichier, type: TYPE_EXT[ext] || 'application/octet-stream', base64: Buffer.from(octets).toString('base64') }];

      const paras = message.split(/\n{2,}/).map(t => `<p style="margin:0 0 14px">${echappe(t).replace(/\n/g, '<br>')}</p>`).join('');
      const html = enveloppeMail({ corps: paras });
      const envoyes: string[] = [];
      const echecs: string[] = [];
      for (const a of adresses) {
        const err = await envoyerMail({ a, sujet, texte: message, html, pj });
        if (err) echecs.push(`${a} (${err})`); else envoyes.push(a);
      }
      if (!envoyes.length) return ko(`Le mail n’est pas parti : ${echecs.join(' · ')}`, 502);

      const avertissements: string[] = echecs.map(e => `Pas parti à ${e}`);
      const le = new Date().toISOString();
      const envoi = { le, a: envoyes.map(x => ({ email: x, nom: '' })), sujet, message: message.slice(0, 5000), fichier, offre: true, ...(echecs.length ? { echecs } : {}) };
      const avant = Array.isArray(doc.envois) ? doc.envois : [];
      let row: unknown = null;
      const maj = await sb.from('documents').update({ envois: [...avant, envoi].slice(-ENVOIS_MAX) }).eq('id', id).select('*').maybeSingle();
      if (maj.error) {
        console.error('[documents] envois', maj.error.message);
        avertissements.push(colonneEnvoisAbsente(maj.error.message)
          ? 'Il n’est pas encore noté dans la fiche du document : lance d’abord le fichier outils/sql/documents-envois.sql dans Supabase › SQL Editor.'
          : `La fiche du document : ${maj.error.message}`);
      } else row = maj.data;

      const d: Donnees = doc.donnees || {};
      const lieu = [d.adresse, d.ville].filter(x => typeof x === 'string' && x).join(', ');
      const detail = `À : ${envoyes.join(', ')}\nObjet : ${sujet}\n\n${message}\n\nPièce jointe : ${fichier}`;
      if (doc.client_id) {
        /* Pour lui seul (le client ne lit pas le Suivi) : son total et ses honoraires. */
        const note = noteOffre(d);
        await ecritServeur('Le Suivi du client', sb.from('journal').insert({
          client_id: doc.client_id, recherche_id: doc.recherche_id, type: 'mail_envoye',
          titre: `📤 Offre d’achat envoyée${lieu ? ` — ${lieu}` : ''}`, description: `${note ? `💶 ${note}\n\n` : ''}${detail}`,
          metadata: { document_id: id, offre: true },
        }), avertissements);
      }
      /* Le confrère (ou le vendeur), s'il est dans le CRM. */
      const trouves = await sb.from('clients').select('id, emails').overlaps('emails', envoyes);
      if (trouves.error) console.error('[documents] contacts', trouves.error.message);
      const vus = new Set<string>();
      for (const c of (trouves.data || []) as { id: string; emails: string[] | null }[]) {
        if (c.id === doc.client_id || vus.has(c.id)) continue;
        vus.add(c.id);
        await ecritServeur('Le Suivi du contact', sb.from('journal').insert({
          client_id: c.id, recherche_id: null, type: 'mail_envoye',
          titre: `📤 Offre d’achat transmise${lieu ? ` — ${lieu}` : ''}`, description: detail,
          metadata: { document_id: id, offre: true },
        }), avertissements);
      }
      return NextResponse.json({ ok: true, envoyes, avertissements, envoi, row });
    }

    return ko('Action inconnue');
  } catch (e) {
    return ko((e as Error).message || 'Erreur', 500);
  }
}
