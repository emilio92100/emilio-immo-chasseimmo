import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dateCourte, heureParis } from '@/lib/mandat';
import { lireCos, inviter, sceller, envoyerExemplaire, finRetractationDe, nomDe, attendu, lienValide, type LigneMandat, type Co } from '@/lib/cosignature';
import { envoyerMail, gabarit, echappe } from '@/lib/mandat-serveur';
import { ecritServeur } from '@/lib/ecritures';
import { solderRelancesSignature } from '@/lib/documents-relances';
import { avecRemises } from '@/lib/remise-mail';

/**
 * Les gestes d'Alexandre sur un co-signataire, depuis la fiche du CRM
 * (fenêtre « Mandat de recherche »). Protégée par le code d'accès, comme le
 * reste du CRM (src/proxy.ts) ; la clé service fait le reste.
 *
 *   POST { action: 'renvoyer', coId }   son lien, tel quel (un neuf s'il a expiré)
 *   POST { action: 'relancer', coId }   un lien tout neuf, quinze jours de plus
 *   POST { action: 'clore', coId }      on n'attend plus sa signature : le mandat
 *                                       continue avec les seuls signataires (le
 *                                       texte le prévoit), et il est scellé une
 *                                       dernière fois s'il ne manque plus personne
 *
 * V3.50 : un nouveau lien ou l'invitation close répondent à la relance « X
 * n'a pas signé le mandat dans les 15 jours » : elle se ferme.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ko = (erreur: string, status = 400) => NextResponse.json({ ok: false, erreur }, { status });

/* V3.151 : les mails partis sont rendus avec la réponse (`remise`), pour
   vérifier qu'ils sont bien arrivés (src/lib/remise-mail.ts). */
export async function POST(req: NextRequest) { return avecRemises(() => traiterPost(req)); }

async function traiterPost(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return ko('Variables Supabase manquantes', 500);
  const sb = createClient(url, cle, { auth: { persistSession: false } });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return ko('Requête illisible'); }
  const action = String(body.action || '');
  const coId = String(body.coId || '');
  if (!UUID.test(coId)) return ko('Co-signataire inconnu');

  try {
    const { data: co, error: eCo } = await sb.from('mandats_cosignataires').select('*').eq('id', coId).maybeSingle();
    if (eCo) return ko(eCo.message, 500);
    if (!co) return ko('Co-signataire introuvable', 404);
    const { data: l, error: eL } = await sb.from('mandats_signatures').select('*').eq('id', co.signature_id).maybeSingle();
    if (eL || !l) return ko(eL?.message || 'Mandat introuvable', 404);
    const ligne = l as LigneMandat, c = co as Co;
    if (ligne.statut !== 'partiel' || c.statut !== 'invite') return ko('Il n’est plus attendu : recharge la fiche.', 409);
    const journal = (titre: string, description: string) => ecritServeur('L’historique du client', sb.from('journal').insert({
      client_id: ligne.client_id, recherche_id: ligne.recherche_id, type: 'mandat', titre, description,
      metadata: { signature_id: ligne.id, cosignataire_id: c.id, numero: ligne.numero },
    }));
    /* La relance « n'a pas signé dans les 15 jours » de ce co-signataire (V3.50). */
    const solder = async () => {
      const e = await solderRelancesSignature(sb, { clientId: ligne.client_id, quoi: `le mandat n° ${ligne.numero}`, qui: nomDe(c.personne) });
      if (e) console.error('[mandat/cosignataire] relance du lien expiré', e);
    };

    if (action === 'renvoyer' || action === 'relancer') {
      const r = await inviter(sb, c, ligne, action === 'relancer'
        ? { nouveau: true, note: 'Nouveau lien envoyé par Alexandre' }
        : { note: 'Lien renvoyé par Alexandre' });
      await journal(action === 'relancer' ? `✉️ Nouveau lien envoyé à ${nomDe(c.personne)}` : `✉️ Lien renvoyé à ${nomDe(c.personne)}`,
        `Mandat n° ${ligne.numero} · ${c.personne.email}${r.erreur ? ` — ⚠️ le mail n'est pas parti (${r.erreur})` : ''}`);
      /* Un lien valable (même si le mail n'est pas parti : il peut le copier). */
      if (lienValide(r.co)) await solder();
      if (r.erreur) return ko(`Le mail n’est pas parti : ${r.erreur}. Le lien est à jour : tu peux le copier et l’envoyer toi-même.`, 502);
      return NextResponse.json({ ok: true, co: r.co });
    }

    if (action === 'clore') {
      const le = new Date().toISOString();
      const coC: Co = { ...c, statut: 'annule', code_hash: null,
        deroule: [...(c.deroule || []), { t: le, x: 'Invitation close par l’agence : il n’a pas signé' }] };
      const cos = (await lireCos(sb, ligne.id)).map(x => (x.id === c.id ? coC : x));
      let signe: Uint8Array | null = null;
      if (!cos.some(attendu)) {
        const sc = await sceller(sb, ligne, cos);
        if (!sc.ok) return ko(`Le mandat n’a pas pu être refait : ${sc.erreur}`, 500);
        const { error } = await sb.from('mandats_signatures').update(sc.maj).eq('id', ligne.id);
        if (error) return ko(error.message, 500);
        signe = sc.signe;
      }
      const { error } = await sb.from('mandats_cosignataires').update({ statut: 'annule', code_hash: null, deroule: coC.deroule }).eq('id', c.id);
      if (error) return ko(error.message, 500);
      const p = ligne.mandant;
      let eMail: string | null = null;
      if (signe) eMail = await envoyerExemplaire({ a: p, numero: ligne.numero, signe, complet: true, fin: finRetractationDe(ligne, cos), attendus: [] });
      const eInfo = await envoyerMail({
        a: p.email, nomA: nomDe(p), repondreA: 'agence@emilio-immo.com',
        sujet: `Votre mandat de recherche n° ${ligne.numero} continue sans la signature de ${c.personne.prenom}`,
        texte: `Bonjour ${p.prenom},\n\n${nomDe(c.personne)} n'a pas signé le mandat de recherche n° ${ligne.numero}. Comme le mandat le prévoit, il continue avec vous${signe ? ' : vous en trouverez la version définitive dans un autre message' : ''}.\n\nSi ${c.personne.prenom} souhaite finalement signer, dites-le-moi : je lui enverrai un nouveau lien.\n\nAlexandre Rogelet — Emilio Immobilier`,
        html: gabarit('Votre mandat continue', `<p>Bonjour ${echappe(p.prenom)},</p>
          <p>${echappe(nomDe(c.personne))} n’a pas signé le <b>mandat de recherche n° ${echappe(ligne.numero)}</b>. Comme le mandat le prévoit, il continue avec vous${signe ? ' : vous en trouverez la version définitive dans un autre message' : ''}.</p>
          <p>Si ${echappe(c.personne.prenom)} souhaite finalement signer, dites-le-moi : je lui enverrai un nouveau lien.</p>
          <p>Alexandre Rogelet — Emilio Immobilier</p>`),
      });
      await journal(`🔒 Invitation de ${nomDe(c.personne)} close`,
        `Mandat n° ${ligne.numero} · le ${dateCourte(le)} à ${heureParis(le)}. Il continue avec ${nomDe(p)}${signe ? ' ; version définitive scellée et envoyée' : ''}.${eMail || eInfo ? `\n⚠️ Mail non parti : ${eMail || eInfo}` : ''}`);
      await solder();
      return NextResponse.json({ ok: true, complet: !!signe });
    }

    return ko('Action inconnue');
  } catch (e) {
    console.error('[mandat/cosignataire]', e);
    return ko(e instanceof Error ? e.message : 'Erreur', 500);
  }
}
