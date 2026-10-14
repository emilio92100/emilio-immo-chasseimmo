import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { modele, surPlaceSansCode } from '@/lib/actes';
import { dateCourte, heureParis } from '@/lib/mandat';
import { appareilDe } from '@/lib/mandat-serveur';
import { ecritServeur } from '@/lib/ecritures';
import {
  lireSignataires, inviter, envoyerCode, validerSignature, sceller, assembler, envoyerExemplaire,
  classer, lireFichier, nomSig, actif, attendu, emailValide, nomDocument, ALERTES, envoyerMail, gabarit, echappe, lienCrmDocument,
  offreFinie, ARRETEE, prevenirArret, validerSansCode, signeSansCodeFait, codeValideFait, lancerSignature,
  type DocSigne, type SigDoc, type SignatureDoc,
} from '@/lib/signature-documents';
import { offrePartieEnSignature } from '@/lib/offres-serveur';
import { signeSansCode } from '@/lib/signature-sans-code';
import { COOKIE_BADGE, badgeValide } from '@/lib/badge';
import { solderRelancesSignature } from '@/lib/documents-relances';
import { avecRemises } from '@/lib/remise-mail';

/**
 * La signature en ligne ou sur place d'un document (Documents juridiques).
 * Protégée par le code d'accès, comme le reste du CRM (src/proxy.ts) : c'est
 * Alexandre qui appelle, depuis son écran. Le signataire en ligne, lui, passe
 * par /api/signer, avec son jeton.
 *
 *   { action: 'lancer', id, signataires: [{ cle, email }] }
 *        l'agence signe ; en ligne, chacun reçoit son lien ; sur place, on
 *        attend chacun devant l'écran. V3.55 : le document se réserve
 *        d'abord (deux onglets, deux clics : un seul passe), et un autre
 *        document du même genre déjà en signature pour la même chose
 *        l'arrête (« concurrent », voir autreEnSignature). V3.56 : tout
 *        échec avant l'enregistrement des signataires rend la réservation ;
 *        si elle ne se rend pas : « reserve » (Arrêter la signature la libère)
 *   { action: 'renvoyer', id, sig, email? }
 *        son lien, à nouveau (neuf si l'adresse change ou s'il a expiré) ;
 *        sur place, « il signera plus tard » : un lien lui part
 *   { action: 'annuler', id, pourquoi?, prevenir? }   → { prevenus, echecs }
 *        la signature s'arrête : les liens ne marchent plus, le document
 *        redevient « à faire signer ». `pourquoi: 'annulation'` : arrêtée
 *        parce que le document est annulé (V3.50), le Suivi le dit.
 *        V3.55 : le document d'abord (une écriture qui ne passe que sur ce
 *        lancement, pas encore terminé), puis les signataires, qui gardent
 *        leur jeton : leur lien dit « Alexandre a arrêté la signature ».
 *        Aussi sur un brouillon resté avec sa signature ouverte (avant la
 *        V3.55, « Modifier » depuis une page pas à jour le permettait).
 *        V3.56 : une fin réservée depuis plus de dix minutes et jamais
 *        rangée (scellement raté) ne bloque plus l'arrêt. V3.57 : mais dès
 *        que la version complète part à chacun, plus d'arrêt (« envoye »).
 *        V3.61 : ceux qui avaient leur lien ou avaient signé sont prévenus
 *        par e-mail (mailArret), sauf `prevenir: false`
 *   { action: 'code', id, sig, email }                     (sur place)
 *   { action: 'signer', id, sig, code, griffe, accepte }  (sur place)
 *        V3.154 : le bon de visite sur place se signe SANS code (pas de
 *        `code`) — seulement si la règle de src/lib/signature-sans-code.ts
 *        le permet (bon de visite, « Sur place », signataire attendu sur
 *        place, badge du CRM revérifié ici). Tout le reste exige le code.
 *   { action: 'finaliser', id, etape }                     (sur place, à la fin)
 *        etape : verifier · assembler · sceller · envoyer · classer — les
 *        étapes réelles que l'écran montre une à une
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* V3.56 : au-delà, une fin réservée et jamais rangée est bloquée (voir annuler). */
const FIN_BLOQUEE_MS = 10 * 60_000;
const ko = (erreur: string, status = 400, plus: Record<string, unknown> = {}) => NextResponse.json({ ok: false, erreur, ...plus }, { status });

function base(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

async function charger(sb: SupabaseClient, id: string): Promise<DocSigne | null> {
  const { data } = await sb.from('documents').select('*').eq('id', id).maybeSingle();
  return (data as DocSigne) || null;
}

/* V3.151 : les mails partis sont rendus avec la réponse (`remise`), pour
   vérifier qu'ils sont bien arrivés (src/lib/remise-mail.ts). */
export async function POST(req: NextRequest) { return avecRemises(() => traiterPost(req)); }

async function traiterPost(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body?.action || '');
    const id = String(body?.id || '');
    if (!UUID.test(id)) return ko('document');
    const sb = base();
    const doc = await charger(sb, id);
    if (!doc) return ko('document', 404);
    const m = modele(doc.modele);
    if (!m || !m.cases) return ko('modele');
    const d = doc.donnees;
    const journal = (titre: string, description: string) => (doc.client_id ? ecritServeur('L’historique du client', sb.from('journal').insert({
      client_id: doc.client_id, type: 'mandat', titre, description, metadata: { document_id: doc.id },
    })) : Promise.resolve(true));
    const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim();
    const appareil = appareilDe(req.headers.get('user-agent') || '');
    /* V3.50 : une offre d'achat passée sa date de validité ne se signe plus. */
    const finOffre = offreFinie(m, d);
    /* V3.50 : une lecture ratée des signataires arrête l'action (avant, une
       liste vide passait pour « plus personne n'est attendu »). */
    const lire = async (): Promise<SigDoc[] | null> => {
      try { return await lireSignataires(sb, doc.id); } catch (e) { console.error('[documents/signature]', (e as Error).message); return null; }
    };

    /* ── Lancer la signature ─────────────────────────────────────── */
    /* V3.189 : le lancement vit dans src/lib/signature-documents.ts
       (lancerSignature), le même pour l'espace du client qui signe seul son
       offre. Mot pour mot ce qu'il y avait ici. */
    if (action === 'lancer') {
      const r = await lancerSignature(sb, doc, body.signataires);
      if ('erreur' in r) return ko(r.erreur, r.statut, r.plus || {});
      const mode = r.signature.mode;
      await journal(mode === 'en_ligne' ? `📨 ${m.titre} envoyé pour signature en ligne` : `✍️ ${m.titre} : signature sur place ouverte`,
        `${doc.titre || ''}${mode === 'en_ligne' ? ` · liens envoyés à ${r.personnes.map(p => p.email).join(', ')}` : ''}${r.echecs.length ? `\n⚠️ Non envoyé : ${r.echecs.join(' ; ')}` : ''}`);
      /* V3.189 : une offre d'achat qui part en signature prend la suite de la
         précédente dans son fil (une contre-proposition qu'elle accepte, une
         nouvelle offre), et la relance « Offre à relire » a sa réponse. */
      if (doc.modele === 'offre_achat') {
        const pb = await offrePartieEnSignature(sb, doc);
        if (pb) console.error('[documents/signature] offre', pb);
      }
      return NextResponse.json({ ok: true, signataires: r.signataires, signature: r.signature, echecs: r.echecs });
    }

    const lus = await lire();
    if (!lus) return ko('lecture', 503);
    const sigs = lus;
    const sd = doc.signature;

    /* ── Arrêter la signature ────────────────────────────────────── */
    if (action === 'annuler') {
      const ouverts = sigs.filter(actif);
      /* « à faire signer » ; ou un brouillon resté avec sa signature ouverte
         (avant la V3.55) : ses liens remarcheraient au prochain « Finaliser ». */
      if (doc.statut !== 'pret' && !(doc.statut === 'brouillon' && (sd || ouverts.length))) return ko('etat', 409, { statut: doc.statut });
      if (!sd && !ouverts.length) return ko('pas_lance', 409);
      const le = new Date().toISOString();
      /* V3.55 : le document d'abord, et seulement s'il est encore dans l'état
         lu, sur ce lancement, pas encore terminé. Le dernier signataire qui
         termine au même instant gagne : le document est signé, rien n'est
         arrêté (avant, ses signataires passaient « annulé » quand même). */
      if (sd) {
        /* V3.57 : l'envoi de la version complète a commencé (`envoi_le`,
           `envoye_le`) : chacun a peut-être déjà reçu le document signé par
           tous. Plus d'arrêt, quel que soit l'âge : « finaliser » le range. */
        if (doc.statut === 'pret' && (sd.envoi_le || sd.envoye_le)) return ko('envoye', 409);
        /* V3.56 : une fin réservée (`complet_le`) depuis plus de dix minutes
           sans que le document soit rangé est restée bloquée (le scellement a
           échoué, la fonction s'est arrêtée en route) : l'arrêt passe, sur
           cette réservation-là exactement. Avant, il était refusé pour
           toujours, avec « le document se range tout seul ». */
        const reserveLe = Date.parse(sd.complet_pris_le || sd.complet_le || '');
        const bloquee = !!sd.complet_le && Number.isFinite(reserveLe) && Date.now() - reserveLe > FIN_BLOQUEE_MS;
        if (sd.complet_le && !bloquee) return ko('complet', 409);
        const arret = sb.from('documents').update({ signature: null, updated_at: le })
          .eq('id', doc.id).eq('statut', doc.statut).eq('signature->>lance_le', sd.lance_le);
        const { data: vide, error: e1 } = await (bloquee ? arret.eq('signature->>complet_le', sd.complet_le as string) : arret.is('signature->>complet_le', null)).select('id');
        if (e1) return ko('enregistrement', 500, { detail: e1.message });
        if (!vide?.length) {
          const frais = await charger(sb, doc.id);
          return frais?.statut === 'signe' || frais?.signature?.complet_le ? ko('complet', 409) : ko('etat', 409, { statut: frais?.statut || null });
        }
      }
      /* Puis les signataires. Ils gardent leur jeton (V3.55) : leur lien dit
         « Alexandre a arrêté la signature », et plus rien ne s'y signe. Le
         code est effacé. */
      const { error } = await sb.from('documents_signataires').update({ statut: 'annule', code_hash: null }).eq('document_id', doc.id).neq('statut', 'annule');
      if (error) return ko('enregistrement', 500, { detail: error.message });
      const signes = sigs.filter(s => s.statut === 'signe');
      const annulation = body.pourquoi === 'annulation';
      /* V3.61 : chacun est prévenu par e-mail (lien reçu, ou déjà signé),
         sauf si Alexandre a décoché « Prévenir les signataires ». */
      const prev = body.prevenir === false ? { prevenus: [] as string[], echecs: [] as string[] } : await prevenirArret(sigs, m, d, annulation);
      const dit = prev.prevenus.length
        ? `${prev.prevenus.length > 1 ? `${prev.prevenus.length} signataires prévenus` : `${prev.prevenus[0]} prévenu`} par e-mail (${prev.prevenus.join(', ')})`
        : body.prevenir === false ? 'personne n’a été prévenu par e-mail (case décochée)' : 'personne à prévenir par e-mail';
      await journal(`⏹️ Signature arrêtée${annulation ? ', document annulé' : ''} : ${m.titre}`, `${doc.titre || ''}${signes.length ? ` · ${signes.map(nomSig).join(', ')} avai${signes.length > 1 ? 'ent' : 't'} déjà signé` : ''} · les liens ne fonctionnent plus · ${dit}${prev.echecs.length ? `\n⚠️ Mail non parti : ${prev.echecs.join(' ; ')}` : ''}`);
      /* V3.50 : les relances « n'a pas signé dans les 15 jours » n'ont plus d'objet. */
      const eR = await solderRelancesSignature(sb, { clientId: doc.client_id, quoi: nomDocument(m, d).le });
      if (eR) console.error('[documents/signature] relance du lien expiré', eR);
      return NextResponse.json({ ok: true, prevenus: prev.prevenus, echecs: prev.echecs });
    }

    if (!sd) return ko('pas_lance', 409);
    const cible = (): SigDoc | null => sigs.find(s => s.id === body.sig && actif(s)) || null;

    /* ── Renvoyer un lien (ou passer du « sur place » au lien) ───── */
    if (action === 'renvoyer') {
      if (doc.statut !== 'pret') return ko('etat', 409);
      if (finOffre) return ko('offre_expiree', 409, { fin: finOffre.toISOString() });
      const s = cible();
      if (!s || !attendu(s)) return ko('signataire', 404);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email && !emailValide(email)) return ko('email', 400);
      /* V3.154 : un visiteur sans adresse (bon de visite sur place) n'a pas de lien à recevoir. */
      if (!email && !emailValide(s.personne.email || '')) return ko('email', 400);
      if (email && sigs.some(x => x.id !== s.id && actif(x) && x.personne.email.toLowerCase() === email)) return ko('email_pris', 400);
      let x = s;
      const change = !!email && email !== s.personne.email.toLowerCase();
      if (change) {
        const le = new Date().toISOString();
        /* V3.55 : seulement s'il est encore attendu (arrêtée au même instant : rien). */
        const { data, error } = await sb.from('documents_signataires').update({
          /* V3.56 : l'ancienne adresse est notée (« au lieu de ») : relancée
             plus tard, la fenêtre « Envoyer les liens » ne reprend cette
             correction que si le document dit encore l'ancienne. */
          personne: { ...s.personne, email }, deroule: [...(s.deroule || []), { t: le, x: `Adresse e-mail corrigée par l’agence : ${email} (au lieu de ${s.personne.email} ; l’ancien lien ne fonctionne plus)` }],
        }).eq('id', s.id).in('statut', ['invite', 'attendu']).select('*').maybeSingle();
        if (error) return ko('enregistrement', 500, { detail: error.message });
        if (!data) return ko(ARRETEE, 409);
        x = data as SigDoc;
      }
      const r = await inviter(sb, x, m, d, { nouveau: change || s.statut === 'attendu', note: s.statut === 'attendu' ? 'Signera plus tard, par son lien' : undefined });
      if (r.erreur === ARRETEE) return ko(ARRETEE, 409);
      if (r.erreur) return ko('mail', 502, { detail: r.erreur });
      await journal(`📨 Lien de signature ${s.statut === 'attendu' ? 'envoyé' : 'renvoyé'} à ${nomSig(r.s)}`, `${doc.titre || ''} · ${r.s.personne.email}`);
      /* V3.50 : sa relance « n'a pas signé dans les 15 jours » a sa réponse. */
      const eR = await solderRelancesSignature(sb, { clientId: doc.client_id, quoi: nomDocument(m, d).le, qui: nomSig(s) });
      if (eR) console.error('[documents/signature] relance du lien expiré', eR);
      return NextResponse.json({ ok: true, signataire: r.s });
    }

    /* ── Sur place : son code, sur SON adresse ───────────────────── */
    if (action === 'code') {
      if (doc.statut !== 'pret') return ko('etat', 409);
      if (finOffre) return ko('offre_expiree', 409, { fin: finOffre.toISOString() });
      const s = cible();
      if (!s) return ko('signataire', 404);
      const r = await envoyerCode(sb, s, sigs, m, d, { email: typeof body.email === 'string' ? body.email : undefined, surPlace: true });
      if ('erreur' in r) return ko(r.erreur, r.statut, r.plus || {});
      return NextResponse.json({ ok: true, email: r.email, signataire: r.s });
    }

    /* ── Sur place : sa signature ────────────────────────────────── */
    if (action === 'signer') {
      if (doc.statut !== 'pret') return ko('etat', 409);
      if (finOffre) return ko('offre_expiree', 409, { fin: finOffre.toISOString() });
      if (body.accepte !== true) return ko('accepte', 400);
      const s = cible();
      if (!s) return ko('signataire', 404);
      /* V3.154 : sans code, seulement quand la règle le permet ; le badge du
         CRM est relu ici même (pas seulement par le portail). Sinon, le code
         reste exigé, comme avant. */
      const sansCode = signeSansCode({
        modele: doc.modele, donnees: d, signature: sd, signataire: s,
        badge: await badgeValide(req.cookies.get(COOKIE_BADGE)?.value),
      });
      const r = sansCode
        ? await validerSansCode(sb, s, m, d, { griffe: body.griffe, ip, appareil, demande: body.demande === true })
        : await validerSignature(sb, s, m, d, { code: String(body.code || ''), griffe: body.griffe, ip, appareil, surPlace: true, demande: body.demande === true });
      if ('erreur' in r) return ko(r.erreur, r.statut, r.plus || {});
      const tous = sigs.map(x => (x.id === r.s.id ? r.s : x));
      const restants = tous.filter(x => actif(x) && attendu(x));
      return NextResponse.json({ ok: true, signeLe: r.s.signe_le, restants: restants.map(x => ({ id: x.id, nom: nomSig(x), mode: x.mode })) });
    }

    /* ── Sur place, à la fin : les étapes, une à une ─────────────── */
    if (action === 'finaliser') {
      const etape = String(body.etape || '');
      const membres = sigs.filter(actif);
      const signes = membres.filter(s => s.statut === 'signe');
      /* V3.55 : chaque étape n'écrit que sur ce lancement-ci, document
         toujours « à faire signer » : arrêtée entre-temps, elle s'arrête là
         (avant, elle remettait la signature sur un document arrêté). */
      const ecrire = async (maj: Record<string, unknown>) => {
        const { data: fait, error } = await sb.from('documents').update(maj).eq('id', doc.id).eq('statut', 'pret').eq('signature->>lance_le', sd.lance_le).select('id');
        if (error) return ko('enregistrement', 500, { detail: error.message });
        return fait?.length ? null : ko(ARRETEE, 409);
      };
      if (etape === 'verifier') {
        if (doc.statut === 'signe') return NextResponse.json({ ok: true, deja: true });
        const manquent = membres.filter(attendu);
        if (manquent.length) return ko('attendus', 409, { noms: manquent.map(nomSig) });
        /* Chaque signature a sa preuve : son code validé, ou (V3.154, le bon
           de visite sur place) sa signature sans code sur l'écran de l'agence. */
        const sansCodeOk = sd.mode === 'sur_place' && surPlaceSansCode(doc.modele, d);
        const sansPreuve = signes.filter(s => !codeValideFait(s) && !(sansCodeOk && s.mode === 'sur_place' && signeSansCodeFait(s)));
        if (sansPreuve.length) return ko('preuves', 409, { noms: sansPreuve.map(nomSig) });
        return NextResponse.json({ ok: true, n: signes.length, sansCode: signes.filter(signeSansCodeFait).length, detail: signes.map(s => `${nomSig(s)} · ${dateCourte(s.signe_le!)} à ${heureParis(s.signe_le!)}`) });
      }
      if (etape === 'assembler') {
        if (doc.statut === 'signe') return NextResponse.json({ ok: true, deja: true });
        const a = await assembler(sb, doc, sigs);
        if ('erreur' in a) return ko(a.erreur, a.erreur === 'attendus' ? 409 : 500);
        const pb = await ecrire({ signature: { ...sd, assemble_chemin: a.chemin, assemble_le: new Date().toISOString() } });
        if (pb) return pb;
        return NextResponse.json({ ok: true, pages: a.pages });
      }
      if (etape === 'sceller') {
        if (doc.statut === 'signe') return NextResponse.json({ ok: true, deja: true, empreinte: sd.empreinte || '' });
        const seul = sd.assemble_chemin ? await lireFichier(sb, sd.assemble_chemin) : null;
        const sc = await sceller(sb, doc, sigs, { seul });
        if ('erreur' in sc) return ko(sc.erreur, 500);
        if (!sc.complet) return ko('attendus', 409);
        const le = signes.map(s => s.signe_le as string).sort().pop() || new Date().toISOString();
        /* `complet_pris_le` (V3.56) : l'heure de cette réservation, pour
           qu'une fin restée bloquée puisse s'arrêter (voir annuler). */
        const pb = await ecrire({ signature: { ...sc.maj, complet_le: le, complet_pris_le: new Date().toISOString() } });
        if (pb) return pb;
        return NextResponse.json({ ok: true, empreinte: sc.empreinte, pages: sc.nbPages });
      }
      if (etape === 'envoyer') {
        if (!sd.scelle_chemin || !sd.complet_le) return ko('pas_scelle', 409);
        if (sd.envoye_le) return NextResponse.json({ ok: true, deja: true, a: signes.map(nomSig) });
        const pdf = await lireFichier(sb, sd.scelle_chemin);
        if (!pdf) return ko('stockage', 500);
        /* V3.57 : la marque « envoi commencé » d'abord : dès le premier
           e-mail, la signature ne s'arrête plus (voir annuler). */
        const envoiLe = sd.envoi_le || new Date().toISOString();
        const pbE = await ecrire({ signature: { ...sd, envoi_le: envoiLe } });
        if (pbE) return pbE;
        const echecs: string[] = [];
        /* V3.154 : un visiteur sans adresse (bon de visite sur place) ne
           reçoit rien ; l'exemplaire reste rangé dans le CRM. */
        const sansAdresse = signes.filter(s => !emailValide(s.personne.email || ''));
        for (const s of signes.filter(x => !sansAdresse.includes(x))) {
          const e = await envoyerExemplaire({ s, m, d, signe: pdf, complet: true, attendus: [] });
          if (e) echecs.push(`${nomSig(s)} : ${e}`);
        }
        const pb = await ecrire({ signature: { ...sd, envoi_le: envoiLe, envoye_le: new Date().toISOString() } });
        if (pb) return pb;
        if (echecs.length) {
          await envoyerMail({ a: ALERTES(), deLaPartDe: 'crm', sujet: `⚠️ Exemplaire non envoyé : ${doc.titre || m.titre}`,
            texte: `Le document signé sur place n'a pas pu être envoyé à : ${echecs.join(' ; ')}.\n\n${lienCrmDocument(doc)}`,
            html: gabarit('Exemplaire non envoyé', `<p>Le document signé sur place n’a pas pu être envoyé à : ${echappe(echecs.join(' ; '))}.</p>`) });
        }
        return NextResponse.json({ ok: true, a: signes.filter(s => !sansAdresse.includes(s) && !echecs.some(e => e.startsWith(nomSig(s)))).map(s => s.personne.email), echecs, sans: sansAdresse.map(nomSig) });
      }
      if (etape === 'classer') {
        if (doc.statut === 'signe') return NextResponse.json({ ok: true, deja: true });
        if (!sd.scelle_chemin || !sd.complet_le) return ko('pas_scelle', 409);
        const pbs = await classer(sb, doc, sd, sd.complet_le);
        if (pbs.length && pbs[0].startsWith('document')) return ko('enregistrement', 500, { detail: pbs.join(' ; ') });
        /* Son espace le montrera (« Vos documents signés ») s'il en a un. */
        let espace = false;
        if (doc.client_id) {
          const { data: c } = await sb.from('clients').select('token_espace').eq('id', doc.client_id).maybeSingle();
          espace = !!(c as { token_espace?: string | null } | null)?.token_espace;
        }
        return NextResponse.json({ ok: true, avertissements: pbs, recherche: !!(m.surRecherche && doc.recherche_id), espace, client: nomDocument(m, d).court });
      }
      return ko('etape');
    }

    return ko('action');
  } catch (e) {
    console.error('[documents/signature]', e);
    return ko('erreur', 500);
  }
}
