import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { modele, modeSignature, electronique, type CaseSignature } from '@/lib/actes';
import { dateCourte, heureParis } from '@/lib/mandat';
import { appareilDe } from '@/lib/mandat-serveur';
import { ecritServeur } from '@/lib/ecritures';
import {
  lireSignataires, casesDe, jetonSigner, envoyerLien, inviter, envoyerCode, validerSignature, sceller, assembler, envoyerExemplaire,
  classer, lireFichier, nomSig, actif, attendu, emailValide, nomDocument, ALERTES, envoyerMail, gabarit, echappe, lienCrmDocument,
  finLien, offreFinie,
  type DocSigne, type SigDoc, type SignatureDoc, type PersonneSig,
} from '@/lib/signature-documents';
import { solderRelancesSignature } from '@/lib/documents-relances';

/**
 * La signature en ligne ou sur place d'un document (Documents juridiques).
 * Protégée par le code d'accès, comme le reste du CRM (src/proxy.ts) : c'est
 * Alexandre qui appelle, depuis son écran. Le signataire en ligne, lui, passe
 * par /api/signer, avec son jeton.
 *
 *   { action: 'lancer', id, signataires: [{ cle, email }] }
 *        l'agence signe ; en ligne, chacun reçoit son lien ; sur place, on
 *        attend chacun devant l'écran
 *   { action: 'renvoyer', id, sig, email? }
 *        son lien, à nouveau (neuf si l'adresse change ou s'il a expiré) ;
 *        sur place, « il signera plus tard » : un lien lui part
 *   { action: 'annuler', id, pourquoi? }
 *        la signature s'arrête : les liens ne marchent plus, le document
 *        redevient « à faire signer ». `pourquoi: 'annulation'` : arrêtée
 *        parce que le document est annulé (V3.50), le Suivi le dit
 *   { action: 'code', id, sig, email }                     (sur place)
 *   { action: 'signer', id, sig, code, griffe, accepte }  (sur place)
 *   { action: 'finaliser', id, etape }                     (sur place, à la fin)
 *        etape : verifier · assembler · sceller · envoyer · classer — les
 *        étapes réelles que l'écran montre une à une
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ko = (erreur: string, status = 400, plus: Record<string, unknown> = {}) => NextResponse.json({ ok: false, erreur, ...plus }, { status });

function base(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

async function charger(sb: SupabaseClient, id: string): Promise<DocSigne | null> {
  const { data } = await sb.from('documents').select('*').eq('id', id).maybeSingle();
  return (data as DocSigne) || null;
}

/* Ce qu'Alexandre a saisi pour un signataire, rapproché de son cadre. */
function personneDe(c: CaseSignature, saisi: Record<string, unknown> | undefined): PersonneSig {
  const p = c.personne;
  const s = (v: unknown, max = 120) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  return {
    civilite: p?.civilite || '', prenom: s(saisi?.prenom) || p?.prenom || '', nom: s(saisi?.nom) || p?.nom || '',
    email: (s(saisi?.email) || p?.email || '').toLowerCase(), telephone: s(saisi?.telephone, 30) || p?.telephone || '', adresse: p?.adresse || '',
  };
}

export async function POST(req: NextRequest) {
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
    if (action === 'lancer') {
      if (doc.statut !== 'pret') return ko('etat', 409, { statut: doc.statut });
      if (!electronique(d)) return ko('papier', 409);
      if (finOffre) return ko('offre_expiree', 409, { fin: finOffre.toISOString() });
      const mode = modeSignature(d) as 'en_ligne' | 'sur_place';
      const lus = await lire();
      if (!lus) return ko('lecture', 503);
      const deja = lus.filter(actif);
      if (deja.length) return ko('deja', 409);
      const cases = casesDe(m, doc).filter(c => !c.agence);
      if (!cases.length) return ko('personne', 400);
      const saisis: Record<string, Record<string, unknown>> = {};
      for (const x of Array.isArray(body.signataires) ? body.signataires : []) if (x && typeof x.cle === 'string') saisis[x.cle] = x;
      const personnes = cases.map(c => personneDe(c, saisis[c.cle]));
      const champs: Record<string, string> = {};
      personnes.forEach((p, i) => {
        if (!emailValide(p.email)) champs[cases[i].cle] = 'Une adresse e-mail valide';
        else if (personnes.some((q, j) => j < i && q.email === p.email)) champs[cases[i].cle] = 'Chacun signe avec sa propre adresse';
      });
      if (Object.keys(champs).length) return ko('emails', 400, { champs });
      const le = new Date().toISOString();
      const lignes = cases.map((c, i) => {
        const p = personnes[i];
        const enLigne = mode === 'en_ligne';
        return {
          document_id: doc.id, cle: c.cle, rang: i + 1, role: c.qui, nom: c.nom, mode, personne: p,
          statut: enLigne ? 'invite' : 'attendu',
          jeton: enLigne ? jetonSigner(p) : null,
          /* Quinze jours, ou moins pour une offre d'achat (sa validité). */
          lien_expire_le: enLigne ? finLien(m, d, le) : null,
          invite_le: enLigne ? le : null,
          deroule: [{ t: le, x: enLigne ? `Lien personnel envoyé à ${p.email}` : 'Attendu pour signer sur place' }],
          relances: 0, code_essais: 0, codes_envoyes: 0,
        };
      });
      const { data: rows, error } = await sb.from('documents_signataires').insert(lignes).select('*');
      if (error || !rows) return ko('enregistrement', 500, { detail: error?.message });
      const sd: SignatureDoc = {
        mode, lance_le: le, agence_le: le,
        deroule: [{ t: le, x: mode === 'en_ligne'
          ? 'Document signé pour l’agence et adressé aux signataires, chacun par son lien personnel'
          : 'Document signé pour l’agence ; signature sur place ouverte' }],
      };
      const { error: e2 } = await sb.from('documents').update({ signature: sd, updated_at: le }).eq('id', doc.id);
      if (e2) {
        /* Les liens créés juste avant ne doivent pas rester valables. */
        await ecritServeur('L’annulation des liens', sb.from('documents_signataires').update({ statut: 'annule', jeton: null }).eq('document_id', doc.id));
        return ko('enregistrement', 500, { detail: e2.message });
      }
      const echecs: string[] = [];
      if (mode === 'en_ligne') {
        for (const s of (rows as SigDoc[]).sort((a, b) => a.rang - b.rang)) {
          const e = await envoyerLien(s, m, d, 0);
          if (e) echecs.push(`${nomSig(s)} : ${e}`);
        }
      }
      await journal(mode === 'en_ligne' ? `📨 ${m.titre} envoyé pour signature en ligne` : `✍️ ${m.titre} : signature sur place ouverte`,
        `${doc.titre || ''}${mode === 'en_ligne' ? ` · liens envoyés à ${personnes.map(p => p.email).join(', ')}` : ''}${echecs.length ? `\n⚠️ Non envoyé : ${echecs.join(' ; ')}` : ''}`);
      return NextResponse.json({ ok: true, signataires: rows, signature: sd, echecs });
    }

    const lus = await lire();
    if (!lus) return ko('lecture', 503);
    const sigs = lus;
    const sd = doc.signature;
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
      if (email && sigs.some(x => x.id !== s.id && actif(x) && x.personne.email.toLowerCase() === email)) return ko('email_pris', 400);
      let x = s;
      const change = !!email && email !== s.personne.email.toLowerCase();
      if (change) {
        const le = new Date().toISOString();
        const { data, error } = await sb.from('documents_signataires').update({
          personne: { ...s.personne, email }, deroule: [...(s.deroule || []), { t: le, x: `Adresse e-mail corrigée par l’agence : ${email} (l’ancien lien ne fonctionne plus)` }],
        }).eq('id', s.id).select('*').single();
        if (error || !data) return ko('enregistrement', 500, { detail: error?.message });
        x = data as SigDoc;
      }
      const r = await inviter(sb, x, m, d, { nouveau: change || s.statut === 'attendu', note: s.statut === 'attendu' ? 'Signera plus tard, par son lien' : undefined });
      if (r.erreur) return ko('mail', 502, { detail: r.erreur });
      await journal(`📨 Lien de signature ${s.statut === 'attendu' ? 'envoyé' : 'renvoyé'} à ${nomSig(r.s)}`, `${doc.titre || ''} · ${r.s.personne.email}`);
      /* V3.50 : sa relance « n'a pas signé dans les 15 jours » a sa réponse. */
      const eR = await solderRelancesSignature(sb, { clientId: doc.client_id, quoi: nomDocument(m, d).le, qui: nomSig(s) });
      if (eR) console.error('[documents/signature] relance du lien expiré', eR);
      return NextResponse.json({ ok: true, signataire: r.s });
    }

    /* ── Arrêter la signature ────────────────────────────────────── */
    if (action === 'annuler') {
      if (doc.statut !== 'pret') return ko('etat', 409);
      const le = new Date().toISOString();
      const { error } = await sb.from('documents_signataires').update({ statut: 'annule', jeton: null, code_hash: null }).eq('document_id', doc.id).neq('statut', 'annule');
      if (error) return ko('enregistrement', 500, { detail: error.message });
      const { error: e2 } = await sb.from('documents').update({ signature: null, updated_at: le }).eq('id', doc.id);
      if (e2) return ko('enregistrement', 500, { detail: e2.message });
      const signes = sigs.filter(s => s.statut === 'signe');
      const annulation = body.pourquoi === 'annulation';
      await journal(`⏹️ Signature arrêtée${annulation ? ', document annulé' : ''} : ${m.titre}`, `${doc.titre || ''}${signes.length ? ` · ${signes.map(nomSig).join(', ')} avai${signes.length > 1 ? 'ent' : 't'} déjà signé` : ''} · les liens ne fonctionnent plus${annulation ? ' · personne n’a été prévenu par e-mail' : ''}`);
      /* V3.50 : les relances « n'a pas signé dans les 15 jours » n'ont plus d'objet. */
      const eR = await solderRelancesSignature(sb, { clientId: doc.client_id, quoi: nomDocument(m, d).le });
      if (eR) console.error('[documents/signature] relance du lien expiré', eR);
      return NextResponse.json({ ok: true });
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
      const r = await validerSignature(sb, s, m, d, { code: String(body.code || ''), griffe: body.griffe, ip, appareil, surPlace: true, demande: body.demande === true });
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
      if (etape === 'verifier') {
        if (doc.statut === 'signe') return NextResponse.json({ ok: true, deja: true });
        const manquent = membres.filter(attendu);
        if (manquent.length) return ko('attendus', 409, { noms: manquent.map(nomSig) });
        const sansCode = signes.filter(s => !(s.deroule || []).some(e => /^Code saisi et validé/.test(e.x)));
        if (sansCode.length) return ko('preuves', 409, { noms: sansCode.map(nomSig) });
        return NextResponse.json({ ok: true, n: signes.length, detail: signes.map(s => `${nomSig(s)} · ${dateCourte(s.signe_le!)} à ${heureParis(s.signe_le!)}`) });
      }
      if (etape === 'assembler') {
        if (doc.statut === 'signe') return NextResponse.json({ ok: true, deja: true });
        const a = await assembler(sb, doc, sigs);
        if ('erreur' in a) return ko(a.erreur, a.erreur === 'attendus' ? 409 : 500);
        const { error } = await sb.from('documents').update({ signature: { ...sd, assemble_chemin: a.chemin, assemble_le: new Date().toISOString() } }).eq('id', doc.id);
        if (error) return ko('enregistrement', 500, { detail: error.message });
        return NextResponse.json({ ok: true, pages: a.pages });
      }
      if (etape === 'sceller') {
        if (doc.statut === 'signe') return NextResponse.json({ ok: true, deja: true, empreinte: sd.empreinte || '' });
        const seul = sd.assemble_chemin ? await lireFichier(sb, sd.assemble_chemin) : null;
        const sc = await sceller(sb, doc, sigs, { seul });
        if ('erreur' in sc) return ko(sc.erreur, 500);
        if (!sc.complet) return ko('attendus', 409);
        const le = signes.map(s => s.signe_le as string).sort().pop() || new Date().toISOString();
        const { error } = await sb.from('documents').update({ signature: { ...sc.maj, complet_le: le } }).eq('id', doc.id);
        if (error) return ko('enregistrement', 500, { detail: error.message });
        return NextResponse.json({ ok: true, empreinte: sc.empreinte, pages: sc.nbPages });
      }
      if (etape === 'envoyer') {
        if (!sd.scelle_chemin || !sd.complet_le) return ko('pas_scelle', 409);
        if (sd.envoye_le) return NextResponse.json({ ok: true, deja: true, a: signes.map(nomSig) });
        const pdf = await lireFichier(sb, sd.scelle_chemin);
        if (!pdf) return ko('stockage', 500);
        const echecs: string[] = [];
        for (const s of signes) {
          const e = await envoyerExemplaire({ s, m, d, signe: pdf, complet: true, attendus: [] });
          if (e) echecs.push(`${nomSig(s)} : ${e}`);
        }
        const { error } = await sb.from('documents').update({ signature: { ...sd, envoye_le: new Date().toISOString() } }).eq('id', doc.id);
        if (error) return ko('enregistrement', 500, { detail: error.message });
        if (echecs.length) {
          await envoyerMail({ a: ALERTES(), deLaPartDe: 'crm', sujet: `⚠️ Exemplaire non envoyé : ${doc.titre || m.titre}`,
            texte: `Le document signé sur place n'a pas pu être envoyé à : ${echecs.join(' ; ')}.\n\n${lienCrmDocument(doc)}`,
            html: gabarit('Exemplaire non envoyé', `<p>Le document signé sur place n’a pas pu être envoyé à : ${echappe(echecs.join(' ; '))}.</p>`) });
        }
        return NextResponse.json({ ok: true, a: signes.filter(s => !echecs.some(e => e.startsWith(nomSig(s)))).map(s => s.personne.email), echecs });
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
