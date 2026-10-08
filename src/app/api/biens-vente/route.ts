import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { envoyerMail, echappe, type PieceJointe } from '@/lib/mandat-serveur';
import { ecritServeur } from '@/lib/ecritures';
import { enveloppeMail, MAIL as CHARTE } from '@/lib/mail-charte';
import { CLES_MAIL, conseillerDe, personnaliser } from '@/lib/mail-variables';
import { bienPourSite } from '@/lib/flux-site';
import { lienBienPublic } from '@/lib/jeton';
import { avantMandat, type BienVente } from '@/lib/biens-vente';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Les fichiers privés d'un bien en vente (rubrique « Biens en vente ») : les
 * diagnostics, les pièces de la copropriété, le titre de propriété, une offre
 * signée. Jamais les photos : elles sont publiques (bucket « photos-vente »),
 * le CRM les dépose lui-même.
 *
 * Même serrure que /api/documents : le bucket « mandats » est privé, cette
 * route donne un droit de dépôt d'un seul fichier à un chemin qu'elle choisit,
 * et le fichier part directement du navigateur vers le stockage.
 *
 * Protégée par le code d'accès, comme le reste du CRM (src/proxy.ts).
 *
 *   POST { action: 'depot', id, cle, ext }   →  { ok, chemin, jeton }
 *   POST { action: 'lien', chemin, nom? }    →  { ok, url }   (5 minutes)
 *   POST { action: 'retirer', chemin }       →  { ok }
 *   POST { action: 'tout', id }              →  { ok, n }     (le bien est supprimé)
 *   POST { action: 'envoyer', id, destinataires, sujet, message, pieces }
 *                                            →  { ok, mode, envoyes, avertissements }
 *
 *   POST { action: 'presenter', ids, destinataires, objet, corps }
 *                                            →  { ok, envoyes, avertissements }
 *
 * « presenter » (V3.121) : un ou plusieurs biens envoyés par simple mail à
 * quelqu'un qui n'a pas d'espace — une personne hors du CRM (Alexandre :
 * « quelqu'un rencontré dans la rue »), ou un contact sans recherche
 * ouverte. Chaque bien en carte : sa photo, ce que dit l'annonce, son prix
 * (pas avant le mandat), et un bouton « Voir le bien ». Noté dans
 * l'historique de chaque bien, et dans le Suivi du contact s'il est au CRM.
 * V3.131 : le bouton mène à la fiche publique du bien (/bien/<id>, la même
 * page que le « Partager » de l'espace acheteur), qu'il soit sur le site ou
 * non. Avant, il menait à sa page sur emilio-immo.com, et seulement s'il y
 * était publié.
 *
 * « envoyer » (V3.30) : des pièces du dossier partent par mail, depuis
 * l'onglet Documents du bien. Un mail par destinataire, au nom d'Alexandre.
 * Jusqu'à 10 Mo en tout, les fichiers sont joints ; au-delà (un DDT complet
 * dépasse vite), le mail porte des liens de téléchargement valables 7 jours
 * — Mailjet refuse un message de plus de 15 Mo, et le base64 grossit d'un
 * tiers. Ensuite : une ligne « envoi » dans l'historique du bien, et une
 * ligne dans le Suivi de chaque contact du CRM qui l'a reçu.
 *
 * Tout vit sous biens-vente/<id du bien>/ : la route refuse le reste.
 */

const BUCKET = 'mandats';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT = new Set(['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp']);
const CHEMIN = /^biens-vente\/[0-9a-f-]{36}\/[a-z0-9]+-\d+\.[a-z]+$/i;

const ko = (erreur: string, status = 400) => NextResponse.json({ ok: false, erreur }, { status });
const MAX_JOINTS = 10_000_000;
const LIENS_JOURS = 7;
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TYPES: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp' };
const nomPropre = (n: string) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._ -]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'document';
const tailleFr = (o: number) => (o >= 1_000_000 ? `${String(Math.round(o / 100_000) / 10).replace('.', ',')} Mo` : `${Math.max(1, Math.round(o / 1000))} ko`);

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
      const quoi = String(body.cle || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
      const ext = String(body.ext || '').toLowerCase().replace(/[^a-z]/g, '');
      if (!UUID.test(id)) return ko('Bien inconnu');
      if (!quoi) return ko('Pièce inconnue');
      if (!EXT.has(ext)) return ko('Format refusé : PDF, JPG ou PNG');
      /* Le bien doit exister : on ne dépose rien pour un identifiant inventé. */
      const { data: bien, error: eBien } = await sb.from('biens_vente').select('id').eq('id', id).maybeSingle();
      if (eBien) return ko(eBien.message, 500);
      if (!bien) return ko('Bien introuvable', 404);
      const chemin = `biens-vente/${id}/${quoi}-${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(chemin);
      if (error || !data) return ko(error?.message || 'Dépôt impossible', 500);
      return NextResponse.json({ ok: true, chemin: data.path, jeton: data.token });
    }

    if (action === 'lien') {
      const chemin = String(body.chemin || '');
      if (!CHEMIN.test(chemin)) return ko('Chemin refusé');
      const nom = String(body.nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
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
      const chemin = String(body.chemin || '');
      if (!CHEMIN.test(chemin)) return ko('Chemin refusé');
      const { error } = await sb.storage.from(BUCKET).remove([chemin]);
      if (error) return ko(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    if (action === 'tout') {
      const id = String(body.id || '');
      if (!UUID.test(id)) return ko('Bien inconnu');
      const { data, error } = await sb.storage.from(BUCKET).list(`biens-vente/${id}`, { limit: 200 });
      if (error) return ko(error.message, 500);
      const chemins = (data || []).map(f => `biens-vente/${id}/${f.name}`);
      if (chemins.length) {
        const { error: e2 } = await sb.storage.from(BUCKET).remove(chemins);
        if (e2) return ko(e2.message, 500);
      }
      return NextResponse.json({ ok: true, n: chemins.length });
    }


    if (action === 'envoyer') {
      const id = String(body.id || '');
      if (!UUID.test(id)) return ko('Bien inconnu');
      const sujet = String(body.sujet || '').trim().slice(0, 200);
      const message = String(body.message || '').trim().slice(0, 20_000);
      if (!sujet) return ko('L’objet du mail est vide');
      if (!message) return ko('Le message est vide');
      type Dest = { email: string; nom: string; clientId: string | null; rechercheId: string | null };
      const dests: Dest[] = (Array.isArray(body.destinataires) ? body.destinataires : []).slice(0, 10).map((x: unknown) => {
        const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
        return {
          email: String(o.email || '').trim().toLowerCase(), nom: String(o.nom || '').trim().slice(0, 120),
          clientId: UUID.test(String(o.clientId || '')) ? String(o.clientId) : null,
          rechercheId: UUID.test(String(o.rechercheId || '')) ? String(o.rechercheId) : null,
        };
      }).filter((x: Dest, i: number, l: Dest[]) => MAIL.test(x.email) && l.findIndex(y => y.email === x.email) === i);
      if (!dests.length) return ko('Aucune adresse e-mail valable');
      const pieces = (Array.isArray(body.pieces) ? body.pieces : []).slice(0, 20).map((x: unknown) => {
        const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
        return { chemin: String(o.chemin || ''), nom: nomPropre(String(o.nom || '')) };
      });
      if (!pieces.length) return ko('Aucun document choisi');
      if (pieces.some((p: { chemin: string }) => !CHEMIN.test(p.chemin) || !p.chemin.startsWith(`biens-vente/${id}/`))) return ko('Un document n’appartient pas à ce bien');

      const { data: bien, error: eBien } = await sb.from('biens_vente').select('id, titre').eq('id', id).maybeSingle();
      if (eBien) return ko(eBien.message, 500);
      if (!bien) return ko('Bien introuvable', 404);

      /* Les fichiers, lus dans le stockage privé. */
      const fichiers: { nom: string; type: string; octets: Buffer; chemin: string }[] = [];
      for (const p of pieces) {
        const { data, error } = await sb.storage.from(BUCKET).download(p.chemin);
        if (error || !data) return ko(`« ${p.nom} » est introuvable dans le dossier`, 404);
        const ext = (p.chemin.split('.').pop() || '').toLowerCase();
        const nom = /\.[a-z0-9]{2,4}$/i.test(p.nom) ? p.nom : `${p.nom}.${ext}`;
        fichiers.push({ nom, type: TYPES[ext] || 'application/octet-stream', octets: Buffer.from(await data.arrayBuffer()), chemin: p.chemin });
      }
      const total = fichiers.reduce((t, f) => t + f.octets.length, 0);
      const mode: 'pj' | 'liens' = total <= MAX_JOINTS ? 'pj' : 'liens';
      const pj: PieceJointe[] = mode === 'pj' ? fichiers.map(f => ({ nom: f.nom, type: f.type, base64: f.octets.toString('base64') })) : [];
      const liens: { nom: string; url: string; taille: number }[] = [];
      if (mode === 'liens') {
        for (const f of fichiers) {
          const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.chemin, LIENS_JOURS * 86_400, { download: f.nom });
          if (error || !data) return ko(`Le lien de « ${f.nom} » n’a pas pu être créé`, 500);
          liens.push({ nom: f.nom, url: data.signedUrl, taille: f.octets.length });
        }
      }

      /* Le mail : le message tel qu'Alexandre l'a écrit (il porte déjà
         « Bonjour » et la signature), puis les liens s'il y en a. */
      const paras = message.split(/\n{2,}/).map(t => `<p style="margin:0 0 14px">${echappe(t).replace(/\n/g, '<br>')}</p>`).join('');
      const blocLiens = liens.length ? `<div style="margin:18px 0 6px;padding:14px 16px;border:1px solid #E8EDF3;border-radius:12px;background:#F5F8FC">
        <div style="font-size:12px;font-weight:700;letter-spacing:.6px;color:#A95808;margin-bottom:8px">DOCUMENTS À TÉLÉCHARGER · LIENS VALABLES ${LIENS_JOURS} JOURS</div>
        ${liens.map(l => `<div style="margin:6px 0"><a href="${echappe(l.url)}" style="color:#13243D;font-weight:700">${echappe(l.nom)}</a> <span style="color:#8FA3BF;font-size:12px">· ${tailleFr(l.taille)}</span></div>`).join('')}
      </div>` : '';
      /* V3.118 : dans l'enveloppe de la charte, le logo Emilio en tête. */
      const html = enveloppeMail({ corps: `${paras}${blocLiens}` });
      const texte = `${message}${liens.length ? `\n\nDocuments à télécharger (liens valables ${LIENS_JOURS} jours) :\n${liens.map(l => `- ${l.nom} : ${l.url}`).join('\n')}` : ''}`;

      const envoyes: string[] = [];
      const echecs: string[] = [];
      for (const dst of dests) {
        const err = await envoyerMail({ a: dst.email, nomA: dst.nom || undefined, sujet, texte, html, pj });
        if (err) echecs.push(`${dst.email} : ${err}`); else envoyes.push(dst.email);
      }
      if (!envoyes.length) return ko(`Le mail n’est pas parti. ${echecs.join(' · ')}`, 502);

      /* La trace : dans l'historique du bien, et dans le Suivi des contacts. */
      const avertissements: string[] = [...echecs.map(e => `Pas parti à ${e}`)];
      const noms = fichiers.map(f => f.nom);
      const partis = dests.filter(x => envoyes.includes(x.email));
      const qui = partis.map(x => x.nom || x.email).join(', ');
      await ecritServeur('L’historique du bien', sb.from('biens_vente_suivi').insert({
        bien_id: id, type: 'envoi', qui, client_id: partis.find(x => x.clientId)?.clientId || null,
        recherche_id: partis.find(x => x.rechercheId)?.rechercheId || null, commentaire: sujet,
        donnees: { a: envoyes, pieces: noms, mode, taille: total },
      }), avertissements);
      for (const dst of partis.filter(x => x.clientId)) {
        await ecritServeur('Le Suivi du contact', sb.from('journal').insert({
          client_id: dst.clientId, recherche_id: dst.rechercheId, type: 'mail_envoye',
          titre: `✉️ Documents envoyés — ${bien.titre || 'le bien'}`,
          description: `À : ${dst.email}\nObjet : ${sujet}\n\n${message}\n\n${mode === 'pj' ? 'Pièces jointes' : `Liens de téléchargement (${LIENS_JOURS} jours)`} : ${noms.join(', ')}`,
        }), avertissements);
      }
      return NextResponse.json({ ok: true, mode, envoyes, avertissements });
    }

    if (action === 'presenter') {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(x => UUID.test(x)).slice(0, 12);
      if (!ids.length) return ko('Aucun bien à présenter');
      const objet = String(body.objet || '').trim().slice(0, 200);
      const corps = String(body.corps || '').trim().slice(0, 20_000);
      if (!objet) return ko('L’objet du mail est vide');
      if (!corps) return ko('Le message est vide');
      type Dest = { email: string; prenom: string; nom: string; clientId: string | null };
      const dests: Dest[] = (Array.isArray(body.destinataires) ? body.destinataires : []).slice(0, 10).map((x: unknown) => {
        const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
        return {
          email: String(o.email || '').trim().toLowerCase(), prenom: String(o.prenom || '').trim().slice(0, 60), nom: String(o.nom || '').trim().slice(0, 120),
          clientId: UUID.test(String(o.clientId || '')) ? String(o.clientId) : null,
        };
      }).filter((x: Dest, i: number, l: Dest[]) => MAIL.test(x.email) && l.findIndex(y => y.email === x.email) === i);
      if (!dests.length) return ko('Aucune adresse e-mail valable');

      const { data: lus, error: eB } = await sb.from('biens_vente').select('*').in('id', ids);
      if (eB) return ko(eB.message, 500);
      const biens = ids.map(id => ((lus || []) as BienVente[]).find(b => b.id === id)).filter((b): b is BienVente => !!b);
      if (!biens.length) return ko('Bien introuvable', 404);
      const { data: ps } = await sb.from('parametres').select('cle, valeur').in('cle', CLES_MAIL);
      const conseiller = conseillerDe(Object.fromEntries(((ps || []) as { cle: string; valeur: string | null }[]).map(r => [r.cle, r.valeur || ''])));

      /* Ce qu'une annonce peut dire, rien de plus (lib/flux-site.ts). */
      const fiches = biens.map(b => {
        const x = bienPourSite(b, null);
        const prix = !avantMandat(b.etape) && x.price > 0 ? x.price : null;
        const lien = lienBienPublic(b.id);
        const carac = [x.surface ? `${x.surface} m²` : '', x.rooms ? `${x.rooms} pièce${x.rooms > 1 ? 's' : ''}` : '', x.bedrooms ? `${x.bedrooms} chambre${x.bedrooms > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
        const lieu = [b.quartier, x.city].filter(Boolean).join(', ');
        return { b, titre: x.title || 'Le bien', photo: x.images[0] || '', prix, lien, carac, lieu };
      });
      const eur = (n: number) => `${n.toLocaleString('fr-FR')} €`;
      const cartes = fiches.map(f => `<div style="margin:18px 0 0;border:1px solid ${CHARTE.trait};border-radius:14px;background:${CHARTE.fond};overflow:hidden">
        ${f.photo ? `<img src="${echappe(f.photo)}" alt="" width="514" style="width:100%;max-width:514px;height:auto;display:block;border:0" />` : ''}
        <div style="padding:16px 18px 18px">
          <div style="font-weight:800;font-size:16px;line-height:1.35;color:${CHARTE.encre}">${echappe(f.titre)}</div>
          ${f.lieu ? `<div style="color:${CHARTE.plume};margin-top:5px;font-size:13px"><span style="color:${CHARTE.or}">&#9679;</span> ${echappe(f.lieu)}</div>` : ''}
          ${f.carac ? `<div style="color:${CHARTE.plume};margin-top:4px;font-size:13px">${echappe(f.carac)}</div>` : ''}
          ${f.prix ? `<div style="font-weight:800;font-size:20px;color:${CHARTE.encre};margin-top:10px">${eur(f.prix)}</div>` : ''}
          ${f.lien ? `<a href="${echappe(f.lien)}" style="display:inline-block;margin-top:14px;background:${CHARTE.or};color:${CHARTE.encre};text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:700">Voir le bien</a>` : ''}
        </div>
      </div>`).join('');
      const texteBiens = fiches.map(f => [f.titre, [f.lieu, f.carac, f.prix ? eur(f.prix) : ''].filter(Boolean).join(' · '), f.lien].filter(Boolean).join('\n')).join('\n\n');

      const envoyes: string[] = [];
      const echecs: string[] = [];
      for (const dst of dests) {
        /* {{prénom}} : rien pour une adresse hors CRM — « Bonjour, ». */
        const texte = personnaliser(corps, { prenom: dst.prenom, nom: dst.nom }, conseiller).replace(/Bonjour\s+,/g, 'Bonjour,');
        /* Les cartes des biens avant la signature (« Cordialement… »), pas après. */
        const blocs = texte.split(/\n{2,}/);
        let sig = -1;
        blocs.forEach((t, k) => { if (/^(cordialement|bien (à|a) vous|bien cordialement|belle journée|bonne journée|à bientôt|a bientot|sincères salutations)/i.test(t.trim())) sig = k; });
        const para = (t: string) => `<p style="margin:0 0 14px">${echappe(t).replace(/\n/g, '<br>')}</p>`;
        const avant = (sig > 0 ? blocs.slice(0, sig) : blocs).map(para).join('');
        const apres = sig > 0 ? `<div style="margin-top:22px">${blocs.slice(sig).map(para).join('')}</div>` : '';
        const html = enveloppeMail({ corps: `${avant}${cartes}${apres}` });
        const err = await envoyerMail({ a: dst.email, nomA: [dst.prenom, dst.nom].filter(Boolean).join(' ') || undefined, sujet: personnaliser(objet, { prenom: dst.prenom, nom: dst.nom }, conseiller), texte: `${texte}\n\n${texteBiens}`, html, pj: [] });
        if (err) echecs.push(`${dst.email} : ${err}`); else envoyes.push(dst.email);
      }
      if (!envoyes.length) return ko(`Le mail n’est pas parti. ${echecs.join(' · ')}`, 502);

      /* La trace : l'historique de chaque bien, le Suivi des contacts du CRM. */
      const avertissements: string[] = [...echecs.map(e => `Pas parti à ${e}`)];
      const partis = dests.filter(x => envoyes.includes(x.email));
      const qui = partis.map(x => [x.prenom, x.nom].filter(Boolean).join(' ') || x.email).join(', ');
      for (const f of fiches) {
        await ecritServeur('L’historique du bien', sb.from('biens_vente_suivi').insert({
          bien_id: f.b.id, type: 'envoi', qui, client_id: partis.find(x => x.clientId)?.clientId || null, commentaire: objet,
          donnees: { a: envoyes, presentation: true, lien: !!f.lien },
        }), avertissements);
      }
      for (const dst of partis.filter(x => x.clientId)) {
        for (const f of fiches) {
          await ecritServeur('Le Suivi du contact', sb.from('journal').insert({
            client_id: dst.clientId, type: 'envoi_bien',
            titre: 'Bien de l’agence présenté · mail simple',
            description: `${f.titre}${f.prix ? ` · ${eur(f.prix)}` : ''}\nÀ : ${dst.email}${f.lien ? `\n${f.lien}` : ''}`,
            metadata: { bien_vente_id: f.b.id },
          }), avertissements);
        }
      }
      return NextResponse.json({ ok: true, envoyes, avertissements });
    }

    /* ── Demander des documents au propriétaire (V3.51) ──
       Alexandre : « je sélectionne ce que je souhaite, et il y a un texte
       préfait : suite à nos échanges, voici les documents… ». Un mail sans
       pièce jointe, noté dans l'historique du bien et le Suivi du contact. */
    if (action === 'demander') {
      const id = String(body.id || '');
      if (!UUID.test(id)) return ko('Bien inconnu');
      const sujet = String(body.sujet || '').trim().slice(0, 200);
      const message = String(body.message || '').trim().slice(0, 20_000);
      if (!sujet) return ko('L’objet du mail est vide');
      if (!message) return ko('Le message est vide');
      const demandes = (Array.isArray(body.demandes) ? body.demandes : []).map(x => String(x).trim().slice(0, 160)).filter(Boolean).slice(0, 60);
      if (!demandes.length) return ko('Aucun document choisi');
      type Dest = { email: string; nom: string; clientId: string | null; rechercheId: string | null };
      const dests: Dest[] = (Array.isArray(body.destinataires) ? body.destinataires : []).slice(0, 10).map((x: unknown) => {
        const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
        return {
          email: String(o.email || '').trim().toLowerCase(), nom: String(o.nom || '').trim().slice(0, 120),
          clientId: UUID.test(String(o.clientId || '')) ? String(o.clientId) : null,
          rechercheId: UUID.test(String(o.rechercheId || '')) ? String(o.rechercheId) : null,
        };
      }).filter((x: Dest, i: number, l: Dest[]) => MAIL.test(x.email) && l.findIndex(y => y.email === x.email) === i);
      if (!dests.length) return ko('Aucune adresse e-mail valable');
      const { data: bien, error: eBien } = await sb.from('biens_vente').select('id, titre').eq('id', id).maybeSingle();
      if (eBien) return ko(eBien.message, 500);
      if (!bien) return ko('Bien introuvable', 404);

      /* V3.118 : dans l'enveloppe de la charte, le logo Emilio en tête. */
      const html = enveloppeMail({ corps: message.split(/\n{2,}/).map(t => `<p style="margin:0 0 14px">${echappe(t).replace(/\n/g, '<br>')}</p>`).join('') });
      const envoyes: string[] = [];
      const echecs: string[] = [];
      for (const dst of dests) {
        const err = await envoyerMail({ a: dst.email, nomA: dst.nom || undefined, sujet, texte: message, html, pj: [] });
        if (err) echecs.push(`${dst.email} : ${err}`); else envoyes.push(dst.email);
      }
      if (!envoyes.length) return ko(`Le mail n’est pas parti. ${echecs.join(' · ')}`, 502);

      const avertissements: string[] = [...echecs.map(e => `Pas parti à ${e}`)];
      const partis = dests.filter(x => envoyes.includes(x.email));
      const qui = partis.map(x => x.nom || x.email).join(', ');
      await ecritServeur('L’historique du bien', sb.from('biens_vente_suivi').insert({
        bien_id: id, type: 'envoi', qui, client_id: partis.find(x => x.clientId)?.clientId || null,
        recherche_id: partis.find(x => x.rechercheId)?.rechercheId || null, commentaire: sujet,
        donnees: { a: envoyes, demande: true, demandes },
      }), avertissements);
      for (const dst of partis.filter(x => x.clientId)) {
        await ecritServeur('Le Suivi du contact', sb.from('journal').insert({
          client_id: dst.clientId, recherche_id: dst.rechercheId, type: 'mail_envoye',
          titre: `📋 Documents demandés — ${bien.titre || 'le bien'}`,
          description: `À : ${dst.email}\nObjet : ${sujet}\n\n${message}`,
        }), avertissements);
      }
      return NextResponse.json({ ok: true, envoyes, avertissements });
    }

    return ko('Action inconnue');
  } catch (e) {
    return ko((e as Error).message || 'Erreur', 500);
  }
}
