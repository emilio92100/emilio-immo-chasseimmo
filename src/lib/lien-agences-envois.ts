import { supabase, addJournal } from '@/lib/supabase';
import { verifie } from '@/lib/ecritures';
import { jetonAgences, tableAgencesAbsente } from '@/lib/agences-lien';

/* ═══ Envoyer le lien à une agence, et s'en souvenir (V3.198) ═════════════
   Alexandre : « est-ce que je sais quand le lien a été envoyé ? est-ce que
   je peux le renvoyer à une même agence si elle ne l'a pas reçu ? », puis
   « si les informations de l'agence sont déjà renseignées, ça reprend, ou
   c'est à moi de retaper ? ». Maquettes 5 et 6 du canevas « Le lien pour
   les agences », validées le 15 octobre.

   Deux endroits pour l'envoyer, une seule mémoire :
   - la fenêtre « Lien pour les agences » (onglet Veille) : les agences de
     ce client, retrouvées dans ses biens, ses suivis, sa Veille et chez
     celles qui ont déjà proposé (`agencesDuClient`) ;
   - « Mon suivi avec l'agence » d'un bien présenté : son contact.
   Un appui sur SMS ou Mail ouvre le téléphone ou la messagerie, destinataire,
   message et lien remplis ; le CRM note l'envoi à ce moment-là (il ne peut
   pas savoir si le message est vraiment parti). La note va au journal du
   client, `metadata.lien_agences = true` (quel que soit le type que la base
   accepte, addJournal), et, depuis un bien, dans son suivi : une note,
   jamais montrée au client (l'espace ne lit que les appels). */

export type Canal = 'sms' | 'mail' | 'copie';
export type Destinataire = { nom: string; interlocuteur?: string | null; tel?: string | null; email?: string | null };
export type Envoi = Destinataire & { le: string; canal: Canal };

/* ── Le lien de la recherche : lu, ou créé la première fois ── */
export type Jeton = { jeton: string } | { absent: true } | { erreur: string };
export async function lireOuCreerJeton(rechercheId: string): Promise<Jeton> {
  const { data, error } = await supabase.from('recherches').select('token_agences').eq('id', rechercheId).maybeSingle();
  if (error) return tableAgencesAbsente(error) ? { absent: true } : { erreur: error.message };
  const t = (data as { token_agences?: string | null } | null)?.token_agences || null;
  return t ? { jeton: t } : creerJeton(rechercheId);
}
export async function creerJeton(rechercheId: string): Promise<Jeton> {
  const nouveau = jetonAgences();
  const { data, error } = await supabase.from('recherches').update({ token_agences: nouveau }).eq('id', rechercheId).select('token_agences');
  if (error) return tableAgencesAbsente(error) ? { absent: true } : { erreur: error.message };
  if (!data?.length) return { erreur: 'aucune ligne modifiée : recharge la page.' };
  return { jeton: nouveau };
}

/* ── Les coordonnées ── */
const chiffres = (t: unknown) => String(t || '').replace(/\D/g, '');
/** Un portable français : 06, 07, +33 6, +33 7. Un fixe ne reçoit pas de SMS. */
export const estMobile = (tel: unknown) => /^(0|33|0033)[67]\d{8}$/.test(chiffres(tel));
export const mailValide = (m: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(m || '').trim());

/** « Bonjour, » → « Bonjour Julien, » ou « Bonjour M. Arnaud, ». */
export function messagePour(message: string, interlocuteur?: string | null): string {
  const i = String(interlocuteur || '').trim();
  if (!i || !/^Bonjour,/.test(message)) return message;
  const civil = /^(M\.|Mme|Mlle|Monsieur|Madame)\s/i.test(i);
  return message.replace(/^Bonjour,/, `Bonjour ${civil ? i : i.split(/\s+/)[0]},`);
}
export const lienSms = (tel: string, message: string) => `sms:${String(tel).replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(message)}`;
export const lienMail = (email: string, message: string) =>
  `mailto:${String(email).trim()}?subject=${encodeURIComponent('Un bien pour mon client')}&body=${encodeURIComponent(message)}`;

export const quiEst = (d: Destinataire) => [d.nom, d.interlocuteur].map(x => String(x || '').trim()).filter(Boolean).join(' · ') || 'une agence';
const parCanal = (c: Canal) => (c === 'sms' ? 'par SMS' : c === 'mail' ? 'par mail' : 'message copié');

/** Noter l'envoi : au journal, et dans le suivi du bien quand il part de là. */
export async function noterEnvoi(o: {
  clientId: string; rechercheId: string; prenom?: string | null; dest: Destinataire; canal: Canal; bienId?: string | null;
}): Promise<boolean> {
  const d = o.dest;
  const metadata = {
    lien_agences: true, canal: o.canal, agence: d.nom.trim(),
    interlocuteur: d.interlocuteur?.trim() || null, tel: d.tel?.trim() || null, email: d.email?.trim() || null,
  };
  const titre = o.canal === 'copie'
    ? `🔗 Lien pour les agences : message copié pour ${quiEst(d)}`
    : `🔗 Lien pour les agences envoyé à ${quiEst(d)}, ${parCanal(o.canal)}`;
  const ok = await addJournal(o.clientId, 'lien_agences', titre.slice(0, 300), [d.tel, d.email].filter(Boolean).join(' · ') || undefined, metadata,
    { rechercheId: o.rechercheId, bienId: o.bienId || null });
  if (o.bienId) {
    const pour = String(o.prenom || '').trim() || 'ton client';
    const texte = o.canal === 'copie'
      ? `Message du lien pour ${pour} copié, pour l’envoyer à ${d.interlocuteur || d.nom}.`
      : `Envoi du lien pour ${pour}, ${parCanal(o.canal)} : l’agence peut y proposer ses autres biens.`;
    await verifie('L’envoi dans le suivi du bien', supabase.from('suivis_agence').insert({
      bien_id: o.bienId, recherche_id: o.rechercheId, client_id: o.clientId, genre: 'note', avec: 'agence',
      contact: { nom: metadata.agence || undefined, interlocuteur: metadata.interlocuteur || undefined, tel: metadata.tel || undefined, email: metadata.email || undefined },
      texte,
    }).select('id'), { ligne: true });
  }
  return ok;
}

/** Les envois de ce lien pour cette recherche, du plus récent au plus ancien. */
export async function envoisDuLien(rechercheId: string): Promise<Envoi[]> {
  const { data, error } = await supabase.from('journal').select('created_at, metadata').eq('recherche_id', rechercheId)
    .contains('metadata', { lien_agences: true }).order('created_at', { ascending: false }).limit(300);
  if (error) { console.error('[lien pour les agences] envois', error.message); return []; }
  return ((data || []) as { created_at: string; metadata: any }[]).map(x => ({
    le: x.created_at, canal: (['sms', 'mail', 'copie'].includes(x.metadata?.canal) ? x.metadata.canal : 'copie') as Canal,
    nom: String(x.metadata?.agence || ''), interlocuteur: x.metadata?.interlocuteur || null, tel: x.metadata?.tel || null, email: x.metadata?.email || null,
  }));
}

/* ── Les agences de ce client ──
   Rapprochées par leur nom, leur numéro ou leur mail : « CENTURY 21 -
   Montparnasse » et « Century 21 Montparnasse » ne font qu'une. */
/** D'où le CRM la connaît, du plus parlant au moins parlant. */
export type Origine = 'presente' | 'selection' | 'suivi' | 'veille' | 'propose' | 'envoi';
const ORDRE_ORIGINES: Origine[] = ['presente', 'selection', 'suivi', 'veille', 'propose', 'envoi'];
export const ORIGINES: Record<Origine, string> = {
  presente: 'Agence d’un bien présenté', selection: 'Agence d’un bien de sa Sélection', suivi: 'Notée dans un de tes suivis',
  veille: 'Agence d’un bien de sa Veille', propose: 'Elle t’a proposé un bien', envoi: 'Ajoutée à la main',
};
export type AgenceConnue = {
  cle: string; nom: string; interlocuteur: string | null; tel: string | null; email: string | null;
  envois: Envoi[]; proposes: number; dernier: string;
  /** la première de ORDRE_ORIGINES qu'elle a */
  origine: Origine;
};
type Trace = Destinataire & { le: string; envoi?: Envoi; propose?: boolean; origine: Origine };

const normNom = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const plusRecent = (a: string, b: string) => (a > b ? a : b);

export async function agencesDuClient(rechercheId: string): Promise<AgenceConnue[]> {
  const veilleAvecTel = () => supabase.from('veille_propositions').select('agence, agence_tel, est_particulier, created_at').eq('recherche_id', rechercheId).eq('statut', 'nouveau').limit(500);
  const [b, s, pa, envois, v0] = await Promise.all([
    supabase.from('biens').select('agence_nom, agence_tel, est_particulier, etape, created_at').eq('recherche_id', rechercheId).limit(500),
    supabase.from('suivis_agence').select('avec, contact, created_at').eq('recherche_id', rechercheId).limit(1000),
    supabase.from('propositions_agences').select('agence, interlocuteur, tel, email, created_at').eq('recherche_id', rechercheId).limit(500),
    envoisDuLien(rechercheId),
    veilleAvecTel(),
  ]);
  /* `agence_tel` vient d'outils/sql/veille-agence-tel.sql : sans lui, le nom seul. */
  let v: { data: any[] | null; error: { message: string } | null } = v0;
  if (v0.error) v = await supabase.from('veille_propositions').select('agence, est_particulier, created_at').eq('recherche_id', rechercheId).eq('statut', 'nouveau').limit(500);
  for (const [quoi, r] of [['biens', b], ['suivis', s], ['propositions', pa], ['veille', v]] as const) {
    if (r.error) console.error(`[agences du client] ${quoi}`, r.error.message);
  }

  const traces: Trace[] = [];
  for (const x of (b.data || []) as any[]) if (!x.est_particulier && x.agence_nom) traces.push({ nom: x.agence_nom, tel: x.agence_tel, le: x.created_at || '', origine: x.etape === 'presente' ? 'presente' : 'selection' });
  for (const x of (s.data || []) as any[]) {
    const c = x.contact && typeof x.contact === 'object' ? x.contact : {};
    if ((x.avec === 'agence' || !x.avec) && c.nom) traces.push({ nom: c.nom, interlocuteur: c.interlocuteur, tel: c.tel, email: c.email, le: x.created_at || '', origine: 'suivi' });
  }
  for (const x of (v.data || []) as any[]) if (!x.est_particulier && x.agence) traces.push({ nom: x.agence, tel: x.agence_tel || null, le: x.created_at || '', origine: 'veille' });
  for (const x of (pa.data || []) as any[]) if (x.agence) traces.push({ nom: x.agence, interlocuteur: x.interlocuteur, tel: x.tel, email: x.email, le: x.created_at || '', propose: true, origine: 'propose' });
  for (const e of envois) if (e.nom) traces.push({ ...e, le: e.le, envoi: e, origine: 'envoi' });

  /* Les regroupements : une clé par nom, par numéro, par mail. */
  const groupes: (AgenceConnue & { cles: Set<string> })[] = [];
  const index = new Map<string, number>();
  for (const t of traces.sort((p, q) => (p.le < q.le ? -1 : 1))) {
    const nom = String(t.nom || '').trim();
    if (!nom) continue;
    const cles = [`n:${normNom(nom)}`];
    const tel = chiffres(t.tel).slice(-9);
    if (tel.length === 9) cles.push(`t:${tel}`);
    const mail = String(t.email || '').trim().toLowerCase();
    if (mailValide(mail)) cles.push(`e:${mail}`);
    const trouves = Array.from(new Set(cles.map(k => index.get(k)).filter((i): i is number => i !== undefined)));
    let g: (typeof groupes)[number];
    if (!trouves.length) {
      g = { cle: cles[0], nom, interlocuteur: null, tel: null, email: null, envois: [], proposes: 0, dernier: t.le, origine: t.origine, cles: new Set() };
      groupes.push(g);
    } else {
      g = groupes[trouves[0]];
      for (const i of trouves.slice(1)) {
        const autre = groupes[i];
        if (autre === g) continue;
        autre.cles.forEach(k => g.cles.add(k));
        g.envois.push(...autre.envois); g.proposes += autre.proposes; g.dernier = plusRecent(g.dernier, autre.dernier);
        if (ORDRE_ORIGINES.indexOf(autre.origine) < ORDRE_ORIGINES.indexOf(g.origine)) g.origine = autre.origine;
        g.tel ||= autre.tel; g.email ||= autre.email; g.interlocuteur ||= autre.interlocuteur;
        groupes[i] = g;
      }
    }
    cles.forEach(k => g.cles.add(k));
    g.cles.forEach(k => index.set(k, groupes.indexOf(g)));
    /* Le plus récent l'emporte : un numéro corrigé dans un suivi remplace l'ancien. */
    g.nom = nom.length >= 3 ? nom : g.nom;
    if (t.interlocuteur?.trim()) g.interlocuteur = t.interlocuteur.trim();
    if (t.tel?.trim()) g.tel = t.tel.trim();
    if (mailValide(t.email)) g.email = String(t.email).trim();
    if (t.envoi) g.envois.push(t.envoi);
    if (t.propose) g.proposes += 1;
    if (ORDRE_ORIGINES.indexOf(t.origine) < ORDRE_ORIGINES.indexOf(g.origine)) g.origine = t.origine;
    g.dernier = plusRecent(g.dernier, t.le);
  }
  const uniques = Array.from(new Set(groupes));
  return uniques.map(({ cles: _cles, ...g }) => ({ ...g, envois: g.envois.sort((p, q) => (p.le < q.le ? 1 : -1)) }))
    .sort((p, q) => {
      const jp = p.tel || p.email ? 0 : 1, jq = q.tel || q.email ? 0 : 1;
      return jp - jq || (p.dernier < q.dernier ? 1 : -1);
    });
}

/** V3.198 — Le joli mail (maquettes 7 et 8), envoyé par le CRM au nom
    d'Alexandre : src/app/api/lien-agences/mail. Rien n'est noté ici : à
    l'appelant de noter l'envoi s'il est parti. */
export async function envoyerMailAgence(rechercheId: string, dest: Destinataire): Promise<{ ok: true } | { ok: false; erreur: string }> {
  try {
    const r = await fetch('/api/lien-agences/mail', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recherche_id: rechercheId, email: dest.email, agence: dest.nom, interlocuteur: dest.interlocuteur || null }),
    });
    const d = await r.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!r.ok || !d?.ok) return { ok: false, erreur: d?.error || `le serveur a répondu ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message || 'pas de réponse' };
  }
}
