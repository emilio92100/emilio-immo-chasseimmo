/* ══ Signer un document en ligne ou sur place ═══════════════════════════════

   Serveur uniquement (clé service). Un document de la rubrique Documents
   (mandat de vente, avenant, mandat de recherche, offre d'achat, bon de
   visite) se signe à la main, en ligne ou sur place : c'est la question
   « Comment sera-t-il signé ? » de son éditeur (`donnees.signature`).

   En ligne : quand Alexandre envoie les liens, chaque signataire reçoit le
   sien (espace.emilio-immo.com/signer/<jeton>), demande son code, signe au
   doigt. Sur place : sur l'écran d'Alexandre, chacun son tour, avec un code
   reçu sur sa propre adresse. Dans les deux cas, l'agence signe au moment où
   Alexandre lance la signature, avec la signature rangée dans le dossier
   privé (`agence/signature.png`).

   Une ligne par signataire dans `documents_signataires` :

     attendu  sur place : il signera sur l'écran d'Alexandre
     invite   son lien est parti, on l'attend
     signe    il a signé
     annule   la signature a été arrêtée (ou il a été remplacé)

   Le document est « signé » quand plus personne n'est attendu : il est
   alors refait avec toutes les signatures, scellé (empreinte SHA-256,
   certificat), envoyé à chacun, et rangé (documents.signe_chemin). En
   ligne, chaque signature scelle aussi une version intermédiaire, que le
   signataire reçoit ; sur place, le scellement se fait une fois, à la fin,
   pendant que l'écran montre chaque étape.
   ════════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { modele, pdfDocument, txt, num, aRetractation, demandeExpresse, type Donnees, type Modele, type CaseSignature } from './actes';
import { pdfSigne, type SignataireCertif, type CadreSigne } from './mandat-pdf';
import { dateLongue, dateCourte, heureParis, masquerEmail, DELAI_COSIGNATURE } from './mandat';
import { envoyerMail, gabarit, echappe, ALERTES, CRM } from './mandat-serveur';
import { HOTE_ESPACE, partieAleatoire, poignee } from './jeton';
import { IDENTITE_DEFAUT, type IdentiteAgence } from './agence';

export const BUCKET = 'mandats';
export const SIGNATURE_AGENCE = 'agence/signature.png';

export type StatutSig = 'attendu' | 'invite' | 'signe' | 'annule';
export type PersonneSig = { civilite: string; prenom: string; nom: string; email: string; telephone: string; adresse: string };
export type SigDoc = {
  id: string; document_id: string; cle: string; rang: number; role: string; nom: string;
  mode: 'en_ligne' | 'sur_place'; statut: StatutSig; personne: PersonneSig;
  jeton: string | null; lien_expire_le: string | null; invite_le: string | null; ouvert_le: string | null;
  relances: number; relance_le: string | null;
  code_hash: string | null; code_expire_le: string | null; code_essais: number; codes_envoyes: number; code_envoye_le: string | null;
  signe_le: string | null; ip: string | null; appareil: string | null; email_verifie: string | null; griffe_chemin: string | null;
  deroule: { t: string; x: string }[];
};
/* Ce que la signature électronique écrit sur le document (colonne
   `documents.signature`). */
export type SignatureDoc = {
  mode: 'en_ligne' | 'sur_place';
  lance_le: string; agence_le: string;
  deroule: { t: string; x: string }[];
  /* La dernière version scellée, et celles d'avant. */
  empreinte?: string; version?: string; versions?: { x: string; empreinte: string }[];
  seul_chemin?: string; scelle_chemin?: string; scelle_le?: string;
  /* La version complète : assemblée, scellée, envoyée, rangée. */
  assemble_chemin?: string; assemble_le?: string;
  complet_le?: string; envoye_le?: string; classe_le?: string;
};
export type DocSigne = {
  id: string; modele: string; statut: string; titre: string | null; numero: string | null;
  donnees: Donnees; identite: IdentiteAgence | null;
  client_id: string | null; recherche_id: string | null; bien_id: string | null;
  pdf_chemin: string | null; signe_chemin: string | null; signe_le: string | null;
  signature: SignatureDoc | null;
};

export const nomSig = (s: Pick<SigDoc, 'personne' | 'nom'>) => `${s.personne.prenom} ${s.personne.nom}`.trim() || s.nom;
export const lienSigner = (jeton: string) => `https://${HOTE_ESPACE}/signer/${jeton}`;
export const jetonSigner = (p: Pick<PersonneSig, 'prenom' | 'nom'>) => `${poignee(p.prenom, p.nom) || 'signer'}-${partieAleatoire(16)}`;
export const lienValide = (s: SigDoc) => !!s.lien_expire_le && Date.parse(s.lien_expire_le) > Date.now();
export const actif = (s: SigDoc) => s.statut !== 'annule';
export const attendu = (s: SigDoc) => s.statut === 'attendu' || s.statut === 'invite';

export async function lireSignataires(sb: SupabaseClient, docId: string): Promise<SigDoc[]> {
  const { data, error } = await sb.from('documents_signataires').select('*').eq('document_id', docId).order('rang', { ascending: true });
  if (error || !data) return [];
  return data as SigDoc[];
}

/* Les cadres du document, l'agence comprise. */
export function casesDe(m: Modele, doc: Pick<DocSigne, 'donnees' | 'identite'>): CaseSignature[] {
  return m.cases ? m.cases(doc.donnees, doc.identite || IDENTITE_DEFAUT) : [];
}

/* Le document, en une expression de phrase : « l’avenant n° 1 au mandat de
   recherche n° 4412 », « votre offre d’achat du 12 rue des Lilas ». */
export function nomDocument(m: Modele, d: Donnees): { le: string; du: string; court: string } {
  const n = txt(d, 'numero'), mn = txt(d, 'mandatNumero'), no = num(d, 'avenantNo') || 1;
  const adresse = [txt(d, 'adresse'), txt(d, 'ville')].filter(Boolean).join(', ');
  switch (m.id) {
    case 'mandat_vente': return { le: `le mandat de vente${n ? ` n° ${n}` : ''}`, du: `du mandat de vente${n ? ` n° ${n}` : ''}`, court: 'le mandat' };
    case 'avenant_vente': return { le: `l’avenant n° ${no} au mandat de vente${mn ? ` n° ${mn}` : ''}`, du: `de l’avenant n° ${no} au mandat de vente${mn ? ` n° ${mn}` : ''}`, court: 'l’avenant' };
    case 'mandat_recherche': return { le: `le mandat de recherche${n ? ` n° ${n}` : ''}`, du: `du mandat de recherche${n ? ` n° ${n}` : ''}`, court: 'le mandat' };
    case 'avenant_recherche': return { le: `l’avenant n° ${no} au mandat de recherche${mn ? ` n° ${mn}` : ''}`, du: `de l’avenant n° ${no} au mandat de recherche${mn ? ` n° ${mn}` : ''}`, court: 'l’avenant' };
    case 'offre_achat': return { le: `l’offre d’achat${adresse ? ` pour le ${adresse}` : ''}`, du: `de l’offre d’achat${adresse ? ` pour le ${adresse}` : ''}`, court: 'l’offre' };
    case 'bon_visite': return { le: `le bon de visite${adresse ? ` du ${adresse}` : ''}`, du: `du bon de visite${adresse ? ` du ${adresse}` : ''}`, court: 'le bon de visite' };
    default: return { le: `le document « ${m.entete(d)} »`, du: `du document « ${m.entete(d)} »`, court: 'le document' };
  }
}
/* Le nom du fichier joint : « Avenant-1-au-mandat-4412.pdf ». */
export function nomFichierPdf(m: Modele, d: Donnees): string {
  return (m.entete(d) || m.titre).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/n°\s*/gi, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) + '.pdf';
}

/* ── Les mails ─────────────────────────────────────────────────────────── */

const bouton = (href: string, texte: string) =>
  `<a href="${href}" style="display:inline-block;margin:6px 0 4px;background:#c9a84c;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:12px;font-weight:800;font-size:15px">${echappe(texte)}</a>`;
const sansCourbes = (t: string) => t.replace(/’/g, "'");

/* L'invitation, et ses deux rappels (2 et 7 jours). Le dernier dit combien
   de jours il reste avant que le lien ne marche plus. */
export function mailInvitation(o: { s: SigDoc; m: Modele; d: Donnees; lien: string; expire: string; rappel?: 0 | 1 | 2 }) {
  const { s, lien } = o;
  const doc = nomDocument(o.m, o.d);
  const fin = dateLongue(o.expire);
  const reste = Math.ceil((Date.parse(o.expire) - Date.now()) / 86_400_000);
  const encore = reste >= 2 ? `encore ${reste} jours, jusqu’au ${fin}` : `jusqu’au ${fin}`;
  const Doc = doc.le.charAt(0).toUpperCase() + doc.le.slice(1);
  const sujet = o.rappel === 2 ? `Dernier rappel : ${doc.le} attend votre signature`
    : o.rappel ? `Rappel : ${doc.le} attend votre signature`
    : `${Doc} : votre signature`;
  const intro = o.rappel === 2
    ? `${Doc} attend toujours votre signature. C’est notre dernier rappel : votre lien de signature est valable ${encore}. Passé cette date, il ne fonctionnera plus.`
    : o.rappel
    ? `${Doc} attend toujours votre signature.`
    : `Alexandre Rogelet, d’Emilio Immobilier, vous adresse ${doc.le} à signer.`;
  const valable = o.rappel === 2 ? '' : ` et valable jusqu’au ${fin}`;
  const prenom = s.personne.prenom || nomSig(s);
  return {
    sujet,
    texte: `Bonjour ${prenom},\n\n${sansCourbes(intro)}\n\nVous pourrez le relire en entier, puis le signer en ligne :\n${lien}\n\nCe lien est personnel${sansCourbes(valable)}. Le code de signature ne vous est envoyé que lorsque vous le demandez, et il est valable 15 minutes.\n\nUne question ? Répondez à ce message, ou appelez Alexandre.\n\nAlexandre Rogelet — Emilio Immobilier`,
    html: gabarit('Un document à signer', `<p>Bonjour ${echappe(prenom)},</p>
      <p>${echappe(intro)}</p>
      <p>Vous pourrez le relire en entier, puis le signer en ligne&nbsp;:</p>
      <p>${bouton(lien, 'Relire et signer')}</p>
      <p style="font-size:13px;color:#64748b">Ce lien est personnel${echappe(valable)}. Le code de signature ne vous est envoyé que lorsque vous le demandez, et il est valable 15 minutes.</p>`,
      'Une question ? Répondez à ce message, ou appelez Alexandre.'),
  };
}

/* Un lien tout neuf : nouveau jeton, quinze jours ; l'ancien ne mène plus
   nulle part. Rend les champs à écrire. */
export function lienNeuf(s: SigDoc, le: string, note?: string): Partial<SigDoc> {
  return {
    statut: 'invite', mode: 'en_ligne', jeton: jetonSigner(s.personne), invite_le: le,
    lien_expire_le: new Date(Date.parse(le) + DELAI_COSIGNATURE * 86_400_000).toISOString(),
    relances: 0, relance_le: null, code_hash: null, code_essais: 0, codes_envoyes: 0, code_envoye_le: null,
    deroule: [...(s.deroule || []), { t: le, x: `${note ? note + ' · ' : ''}Lien personnel envoyé à ${s.personne.email}` }],
  };
}

/* Envoie son lien (invitation, ou rappel n° 1 / n° 2). */
export async function envoyerLien(s: SigDoc, m: Modele, d: Donnees, rappel: 0 | 1 | 2 = 0): Promise<string | null> {
  if (!s.jeton || !s.lien_expire_le) return 'lien absent';
  const x = mailInvitation({ s, m, d, lien: lienSigner(s.jeton), expire: s.lien_expire_le, rappel });
  return envoyerMail({ a: s.personne.email, nomA: nomSig(s), sujet: x.sujet, texte: x.texte, html: x.html, repondreA: 'agence@emilio-immo.com' });
}

/* Renvoie son lien (le même s'il vaut encore, sinon un neuf), ou un rappel.
   Enregistre, puis envoie. */
export async function inviter(sb: SupabaseClient, s: SigDoc, m: Modele, d: Donnees, o: { nouveau?: boolean; rappel?: 0 | 1 | 2; note?: string } = {}): Promise<{ erreur: string | null; s: SigDoc }> {
  const le = new Date().toISOString();
  const neuf = o.nouveau || !s.jeton || !lienValide(s) || s.statut !== 'invite';
  const maj: Partial<SigDoc> = neuf
    ? lienNeuf(s, le, o.note)
    : {
      relance_le: le,
      ...(o.rappel ? { relances: o.rappel } : {}),
      deroule: [...(s.deroule || []), { t: le, x: `${o.note || (o.rappel ? `Rappel n° ${o.rappel} envoyé` : 'Lien renvoyé')} (${s.personne.email})` }],
    };
  const { data, error } = await sb.from('documents_signataires').update(maj).eq('id', s.id).select('*').single();
  if (error || !data) return { erreur: error?.message || 'enregistrement', s };
  const x = data as SigDoc;
  return { erreur: await envoyerLien(x, m, d, neuf ? 0 : o.rappel || 0), s: x };
}

/* Le code à 6 chiffres, à SON adresse. */
export function mailCode(o: { s: SigDoc; m: Modele; d: Donnees; code: string; minutes: number }) {
  const doc = nomDocument(o.m, o.d);
  const joli = `${o.code.slice(0, 3)} ${o.code.slice(3)}`;
  const prenom = o.s.personne.prenom || nomSig(o.s);
  return {
    sujet: `Votre code de signature : ${o.code}`,
    texte: `Bonjour ${prenom},\n\nVoici votre code pour signer ${sansCourbes(doc.le)} : ${joli}\n\nIl est valable ${o.minutes} minutes. Saisissez-le vous-même, et ne le communiquez à personne.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.\n\nAlexandre Rogelet — Emilio Immobilier`,
    html: gabarit('Votre code de signature', `<p>Bonjour ${echappe(prenom)},</p>
      <p>Voici votre code pour signer ${echappe(doc.le)} :</p>
      <div style="margin:16px 0;font-size:32px;font-weight:800;letter-spacing:8px;color:#1a2332">${joli}</div>
      <p>Il est valable ${o.minutes} minutes. Saisissez-le vous-même, et ne le communiquez à personne.</p>`,
      'Si vous n’êtes pas à l’origine de cette demande, ignorez simplement ce message.'),
  };
}

/* ── Le code, puis la signature ────────────────────────────────────────── */

export const CODE_MINUTES = 15;
const CODE_ESSAIS = 5;
const CODES_MAX = 6;
const ECART_ENVOIS_S = 45;
const secret = () => process.env.SUPABASE_SERVICE_ROLE_KEY || 'emilio-mandat';
const hacher = (code: string, id: string) => createHash('sha256').update(`${code}:${id}:${secret()}`).digest('hex');
const egal = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export const emailValide = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
export type Refus = { erreur: string; statut: number; plus?: Record<string, unknown> };

/* Un code à 6 chiffres part à SON adresse (sur place, il peut la corriger
   devant Alexandre : c'est elle qui l'identifie). Les 15 minutes courent à
   partir de là. */
export async function envoyerCode(sb: SupabaseClient, s: SigDoc, tous: SigDoc[], m: Modele, d: Donnees, o: { email?: string; surPlace?: boolean } = {}): Promise<Refus | { email: string; s: SigDoc }> {
  if (s.statut !== 'invite' && s.statut !== 'attendu') return { erreur: 'etat', statut: 409 };
  const email = (o.email ?? s.personne.email).trim().toLowerCase();
  if (!emailValide(email)) return { erreur: 'email', statut: 400 };
  if (tous.some(x => x.id !== s.id && actif(x) && x.personne.email.toLowerCase() === email)) return { erreur: 'email_pris', statut: 400 };
  if (s.code_envoye_le && Date.now() - Date.parse(s.code_envoye_le) < ECART_ENVOIS_S * 1000) return { erreur: 'attendre', statut: 429 };
  const remise = !s.code_envoye_le || Date.now() - Date.parse(s.code_envoye_le) > 3_600_000;
  if (!remise && s.codes_envoyes >= CODES_MAX) return { erreur: 'quota', statut: 429 };
  const le = new Date().toISOString();
  const deroule = [...(s.deroule || [])];
  if (email !== s.personne.email.toLowerCase()) deroule.push({ t: le, x: `Adresse e-mail corrigée${o.surPlace ? ' sur place' : ''} : ${email}` });
  deroule.push({ t: le, x: `${s.code_envoye_le ? 'Nouveau code' : 'Code à 6 chiffres'} envoyé à ${email}${o.surPlace ? ' (signature sur place)' : ''}` });
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const personne = { ...s.personne, email };
  const { data, error } = await sb.from('documents_signataires').update({
    personne, code_hash: hacher(code, s.id), code_expire_le: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
    code_essais: 0, codes_envoyes: remise ? 1 : s.codes_envoyes + 1, code_envoye_le: le, deroule,
  }).eq('id', s.id).select('*').single();
  if (error || !data) return { erreur: 'enregistrement', statut: 500, plus: { detail: error?.message } };
  const x = data as SigDoc;
  const mail = mailCode({ s: x, m, d, code, minutes: CODE_MINUTES });
  const e = await envoyerMail({ a: email, nomA: nomSig(x), deLaPartDe: 'agence', sujet: mail.sujet, texte: mail.texte, html: mail.html });
  if (e) return { erreur: 'mail', statut: 502 };
  return { email: masquerEmail(email), s: x };
}

/* Il a saisi son code, coché la case, tracé sa signature : on vérifie le
   code, on range le tracé, on enregistre la signature et ses preuves. Le
   PDF, lui, se refait après (voir sceller). */
export async function validerSignature(sb: SupabaseClient, s: SigDoc, m: Modele, d: Donnees, o: {
  code: string; griffe: unknown; ip: string; appareil: string; surPlace?: boolean; demande?: boolean;
}): Promise<Refus | { s: SigDoc }> {
  const code = String(o.code || '').replace(/\D/g, '');
  if (code.length !== 6) return { erreur: 'code', statut: 400 };
  /* La demande de commencer tout de suite, cochée par lui-même (voir
     demandeExpresse) : sans elle, pas de signature. */
  const demande = demandeExpresse(m, d, s.cle);
  if (demande && o.demande !== true) return { erreur: 'demande', statut: 400 };
  if (s.statut === 'signe') return { erreur: 'deja', statut: 409 };
  if ((s.statut !== 'invite' && s.statut !== 'attendu') || !s.code_hash) return { erreur: 'recommencer', statut: 409 };
  if (s.code_essais >= CODE_ESSAIS) return { erreur: 'trop', statut: 429 };
  if (!s.code_expire_le || Date.parse(s.code_expire_le) < Date.now()) return { erreur: 'expire', statut: 410 };
  if (!egal(hacher(code, s.id), s.code_hash)) {
    const essais = s.code_essais + 1;
    await sb.from('documents_signataires').update({ code_essais: essais }).eq('id', s.id);
    return { erreur: 'code', statut: 400, plus: { restants: Math.max(0, CODE_ESSAIS - essais) } };
  }
  const le = new Date().toISOString();
  const png = lireGriffe(o.griffe);
  const griffe = await rangerGriffe(sb, s.document_id, s.cle, png);
  const tentative = s.code_essais === 0 ? '1re tentative' : `${s.code_essais + 1}e tentative`;
  const accepte = m.accepter ? m.accepter(d, s.cle) : 'J’ai lu le document en entier et je l’accepte.';
  const maj = {
    statut: 'signe' as const, signe_le: le, ip: o.ip, appareil: o.appareil, email_verifie: s.personne.email, griffe_chemin: griffe,
    code_hash: null, code_essais: s.code_essais + 1,
    deroule: [...(s.deroule || []),
      ...(o.surPlace ? [{ t: le, x: 'Signé sur place, sur l’écran de l’agence' }] : []),
      ...(png ? [{ t: le, x: 'Signature tracée à l’écran' }] : []),
      { t: le, x: `Code saisi et validé (${tentative})` },
      { t: le, x: `Case cochée : « ${accepte} »` },
      ...(demande ? [{ t: le, x: `Case à part cochée : « ${demande} »` }] : []),
    ],
  };
  const { data, error } = await sb.from('documents_signataires').update(maj).eq('id', s.id).select('*').single();
  if (error || !data) return { erreur: 'enregistrement', statut: 500, plus: { detail: error?.message } };
  return { s: data as SigDoc };
}

/* ── Le PDF, refait avec les signatures ────────────────────────────────── */

async function lireFichier(sb: SupabaseClient, chemin: string | null | undefined): Promise<Uint8Array | null> {
  if (!chemin) return null;
  try {
    const { data } = await sb.storage.from(BUCKET).download(chemin);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  } catch { return null; }
}

/* La signature tracée au doigt : un PNG en data URL, borné. */
export function lireGriffe(v: unknown): Uint8Array | null {
  if (typeof v !== 'string' || !v.startsWith('data:image/png;base64,') || v.length >= 600_000) return null;
  const o = Buffer.from(v.slice(22), 'base64');
  return o.length > 200 && o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47 ? new Uint8Array(o) : null;
}
export async function rangerGriffe(sb: SupabaseClient, docId: string, cle: string, png: Uint8Array | null): Promise<string | null> {
  if (!png) return null;
  const chemin = `documents/${docId}/griffe-${Date.now()}.png`;
  const { error } = await sb.storage.from(BUCKET).upload(chemin, png, { contentType: 'image/png', upsert: false });
  return error ? null : chemin;
}

/* Le déroulé du certificat : celui de l'agence, puis celui de chaque
   signataire, fondus dans l'ordre du temps. Chaque ligne dit de qui elle
   parle. */
export function derouleCommun(doc: DocSigne, sigs: SigDoc[], identite: IdentiteAgence): { t: string; x: string }[] {
  return [
    ...(doc.signature?.deroule || []).map(e => ({ t: e.t, x: `${identite.signataireNom} (l’agence) · ${e.x}` })),
    ...sigs.filter(actif).flatMap(s => (s.deroule || []).map(e => ({ t: e.t, x: `${nomSig(s)} · ${e.x}` }))),
  ].sort((a, b) => a.t.localeCompare(b.t));
}

/* L'état des cadres, pour le PDF : ceux qui ont signé (avec leur trait),
   et l'agence. */
async function cadres(sb: SupabaseClient, doc: DocSigne, sigs: SigDoc[]): Promise<Record<string, CadreSigne>> {
  const out: Record<string, CadreSigne> = {};
  for (const s of sigs.filter(actif)) {
    out[s.cle] = s.statut === 'signe' && s.signe_le
      ? { le: s.signe_le, griffe: await lireFichier(sb, s.griffe_chemin), surPlace: s.mode === 'sur_place' }
      : { le: null };
  }
  if (doc.signature?.agence_le) out.agence = { le: doc.signature.agence_le };
  return out;
}

export type Scelle = { signe: Uint8Array; seul: Uint8Array; empreinte: string; complet: boolean; maj: SignatureDoc; nbPages: number };

/* Le document tel qu'il est à cet instant, avec ses signatures et son
   certificat. `seul` : la version sans certificat déjà assemblée (l'étape
   « Assemblage » de la signature sur place), réutilisée si le compte des
   pages tombe juste. */
export async function sceller(sb: SupabaseClient, doc: DocSigne, sigs: SigDoc[], o: { seul?: Uint8Array | null } = {}): Promise<Scelle | { erreur: string }> {
  const m = modele(doc.modele);
  if (!m || !doc.signature) return { erreur: 'document' };
  const d = doc.donnees;
  const identite = doc.identite || IDENTITE_DEFAUT;
  const membres = sigs.filter(actif);
  const signes = await cadres(sb, doc, sigs);
  const faits = membres.filter(s => s.statut === 'signe' && s.signe_le);
  const complet = !membres.some(attendu);
  const dernier = faits.map(s => s.signe_le as string).sort().pop() || doc.signature.agence_le;
  const griffeAgence = await lireFichier(sb, SIGNATURE_AGENCE);
  const mention = complet
    ? `Signé électroniquement le ${dateLongue(dernier)}`
    : `Signé par ${faits.map(nomSig).join(', ') || 'l’agence'} · en attente de ${membres.filter(attendu).map(nomSig).join(', ')}`;
  const fabriquer = (certif: number) => pdfDocument(m, d, identite, { signature: {
    signes, dernier, agenceLe: doc.signature!.agence_le, signatureAgence: griffeAgence, pagesEnTout: n => n + certif, mention,
  } });
  const version = `${complet ? 'version complète' : `signée par ${faits.map(nomSig).join(', ')}`}, le ${dateCourte(dernier)}`;
  const precedentes = [...(doc.signature.versions || []), ...(doc.signature.empreinte ? [{ x: doc.signature.version || 'version précédente', empreinte: doc.signature.empreinte }] : [])]
    .filter((v, i, t) => t.findIndex(w => w.empreinte === v.empreinte) === i);
  const cases = casesDe(m, doc);
  const roleDe = (s: SigDoc) => cases.find(c => c.cle === s.cle)?.qui || s.role || 'Signataire';
  const signataires: SignataireCertif[] = membres.map(s => ({
    nom: nomSig(s), adresse: s.personne.adresse || '', email: s.email_verifie || s.personne.email, telephone: s.personne.telephone || '',
    le: s.statut === 'signe' ? s.signe_le : null, ip: s.ip || (s.mode === 'sur_place' ? 'sur place' : ''), appareil: s.appareil || '',
    invite: s.mode === 'en_ligne' ? s.invite_le : null,
  }));
  const retr = aRetractation(m, d);
  const execution = retr && (d.execution === 'oui' || d.execution === 'non')
    ? d.execution === 'oui'
      ? 'Dès la signature, sans attendre la fin du délai de rétractation : chaque mandant l’a demandé expressément, en cochant une case à part avant de signer (article L221-25 du Code de la consommation).'
      : 'À la fin du délai de rétractation, comme le document le prévoit.'
    : undefined;
  const numero = txt(d, 'numero') || txt(d, 'mandatNumero');
  const entete = m.entete(d);
  const certifier = (seul: Uint8Array, empreinte: string, nb: number) => pdfSigne(seul, {
    numero, mandant: { nom: signataires[0]?.nom || m.pour(d), adresse: '', email: signataires[0]?.email || '', telephone: '' },
    signeLe: dernier, ip: '', appareil: '', empreinte,
    deroule: derouleCommun(doc, sigs, identite), executionImmediate: d.execution === 'oui', agenceLe: doc.signature!.agence_le,
    identite, signataires, versions: precedentes,
    doc: {
      entete, titre: entete, court: entete.charAt(0).toLowerCase() + entete.slice(1),
      tampon: m.garde(d).titre.toLocaleUpperCase('fr-FR'),
      roles: membres.map(roleDe), ...(execution ? { execution } : {}),
      note: `Le document signé est scellé : l’empreinte ci-dessus est celle du document seul (pages 1 à ${nb}), conservé à l’identique par l’agence ; la recalculer permet de vérifier qu’aucun mot n’a changé depuis les signatures.${precedentes.length ? ' Les versions précédentes, scellées au fil des signatures, gardent chacune la leur.' : ''}${retr ? ' Le mandant peut se rétracter dans les conditions que le document prévoit, avec le formulaire joint ou par e-mail.' : ''}`,
    },
  });
  let seul = o.seul || await fabriquer(1);
  let nbSeul = (await PDFDocument.load(seul)).getPageCount();
  let empreinte = createHash('sha256').update(seul).digest('hex');
  let signe = await certifier(seul, empreinte, nbSeul);
  let nbCertif = (await PDFDocument.load(signe)).getPageCount() - nbSeul;
  if (nbCertif !== 1) {
    seul = await fabriquer(nbCertif);
    nbSeul = (await PDFDocument.load(seul)).getPageCount();
    empreinte = createHash('sha256').update(seul).digest('hex');
    signe = await certifier(seul, empreinte, nbSeul);
    nbCertif = (await PDFDocument.load(signe)).getPageCount() - nbSeul;
  }
  const t = Date.now();
  const cheminSeul = `documents/${doc.id}/seul-${t}.pdf`, cheminSigne = `documents/${doc.id}/scelle-${t}.pdf`;
  const up1 = await sb.storage.from(BUCKET).upload(cheminSeul, seul, { contentType: 'application/pdf', upsert: false });
  if (up1.error) return { erreur: up1.error.message };
  const up2 = await sb.storage.from(BUCKET).upload(cheminSigne, signe, { contentType: 'application/pdf', upsert: false });
  if (up2.error) return { erreur: up2.error.message };
  return {
    signe, seul, empreinte, complet, nbPages: nbSeul + nbCertif,
    maj: { ...doc.signature, empreinte, version, versions: precedentes, seul_chemin: cheminSeul, scelle_chemin: cheminSigne, scelle_le: new Date().toISOString() },
  };
}

/* La version complète, sans son certificat : l'étape « Assemblage » de la
   signature sur place. */
export async function assembler(sb: SupabaseClient, doc: DocSigne, sigs: SigDoc[]): Promise<{ seul: Uint8Array; chemin: string; pages: number } | { erreur: string }> {
  const m = modele(doc.modele);
  if (!m || !doc.signature) return { erreur: 'document' };
  const membres = sigs.filter(actif);
  if (membres.some(attendu)) return { erreur: 'attendus' };
  const signes = await cadres(sb, doc, sigs);
  const dernier = membres.map(s => s.signe_le as string).sort().pop() || doc.signature.agence_le;
  const seul = await pdfDocument(m, doc.donnees, doc.identite || IDENTITE_DEFAUT, { signature: {
    signes, dernier, agenceLe: doc.signature.agence_le, signatureAgence: await lireFichier(sb, SIGNATURE_AGENCE),
    pagesEnTout: n => n + 1, mention: `Signé électroniquement le ${dateLongue(dernier)}`,
  } });
  const chemin = `documents/${doc.id}/seul-${Date.now()}.pdf`;
  const up = await sb.storage.from(BUCKET).upload(chemin, seul, { contentType: 'application/pdf', upsert: false });
  if (up.error) return { erreur: up.error.message };
  return { seul, chemin, pages: (await PDFDocument.load(seul)).getPageCount() };
}
export { lireFichier };

/* ── L'exemplaire de chacun ────────────────────────────────────────────── */

export async function envoyerExemplaire(o: {
  s: SigDoc; m: Modele; d: Donnees; signe: Uint8Array; complet: boolean; attendus: string[];
}): Promise<string | null> {
  const doc = nomDocument(o.m, o.d);
  const pj = [{ nom: nomFichierPdf(o.m, o.d), type: 'application/pdf', base64: Buffer.from(o.signe).toString('base64') }];
  const retr = aRetractation(o.m, o.d);
  const Doc = doc.le.charAt(0).toUpperCase() + doc.le.slice(1);
  const corps = o.complet
    ? `${Doc} est signé par tous. Vous le trouverez ci-joint, avec son certificat de signature.`
    : `Votre signature est enregistrée. Vous trouverez ci-joint ${doc.le} tel qu’il est signé aujourd’hui, avec son certificat. Vous recevrez la version complète dès que ${o.attendus.join(' et ')} l’aura signé.`;
  const pied = retr ? 'Le document joint rappelle votre délai de rétractation de 14 jours et la façon de l’exercer.' : 'Gardez ce message : c’est votre exemplaire.';
  const prenom = o.s.personne.prenom || nomSig(o.s);
  return envoyerMail({
    a: o.s.personne.email, nomA: nomSig(o.s), pj, repondreA: 'agence@emilio-immo.com',
    sujet: o.complet ? `${Doc}, signé par tous` : `${Doc} : votre signature est enregistrée`,
    texte: `Bonjour ${prenom},\n\n${sansCourbes(corps)}\n\nAlexandre Rogelet — Emilio Immobilier\n\n—\n${sansCourbes(pied)}`,
    html: gabarit(o.complet ? 'Votre document signé' : 'Votre signature est enregistrée',
      `<p>Bonjour ${echappe(prenom)},</p><p>${echappe(corps)}</p><p>Alexandre Rogelet — Emilio Immobilier</p>`, pied),
  });
}

/* ── Signé par tous : ce que le document écrit ailleurs ────────────────── */

/* Le document passe « Signé », avec son exemplaire scellé ; un mandat de
   recherche (ou son avenant) met à jour le bloc Mandat de sa recherche ;
   une ligne va dans le suivi du client. Rend les problèmes rencontrés. */
export async function classer(sb: SupabaseClient, doc: DocSigne, sd: SignatureDoc, le: string): Promise<string[]> {
  const m = modele(doc.modele);
  const pbs: string[] = [];
  const { error } = await sb.from('documents').update({
    statut: 'signe', signe_le: le, signe_chemin: sd.scelle_chemin || null, signature: { ...sd, classe_le: new Date().toISOString() }, updated_at: new Date().toISOString(),
  }).eq('id', doc.id);
  if (error) { pbs.push('document : ' + error.message); return pbs; }
  if (m?.surRecherche && doc.recherche_id) {
    const jour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(le));
    const { error: e2 } = await sb.from('recherches').update(m.surRecherche(doc.donnees, jour)).eq('id', doc.recherche_id);
    if (e2) pbs.push('bloc Mandat de la recherche : ' + e2.message);
  }
  if (doc.client_id) {
    const { error: e3 } = await sb.from('journal').insert({
      client_id: doc.client_id, type: 'mandat',
      titre: `✍️ ${m?.titre || 'Document'} signé ${sd.mode === 'sur_place' ? 'sur place' : 'en ligne'}`,
      description: [doc.numero ? `n° ${doc.numero}` : '', doc.titre || '', `signé par tous le ${dateCourte(le)} à ${heureParis(le)}`].filter(Boolean).join(' · '),
      metadata: { document_id: doc.id },
    });
    if (e3) pbs.push('suivi du client : ' + e3.message);
  }
  return pbs;
}

/* Tout ce qui suit la dernière signature, d'un seul tenant (en ligne) :
   scellé, envoyé à chacun, rangé. */
export async function terminer(sb: SupabaseClient, doc: DocSigne, sigs: SigDoc[]): Promise<{ erreur: string | null; signe?: Uint8Array; echecs: string[] }> {
  const m = modele(doc.modele);
  if (!m) return { erreur: 'document', echecs: [] };
  const sc = await sceller(sb, doc, sigs);
  if ('erreur' in sc) return { erreur: sc.erreur, echecs: [] };
  const le = sigs.filter(s => s.statut === 'signe').map(s => s.signe_le as string).sort().pop() || new Date().toISOString();
  const echecs: string[] = [];
  for (const s of sigs.filter(x => x.statut === 'signe')) {
    const e = await envoyerExemplaire({ s, m, d: doc.donnees, signe: sc.signe, complet: true, attendus: [] });
    if (e) echecs.push(`${nomSig(s)} : ${e}`);
  }
  const maj: SignatureDoc = { ...sc.maj, complet_le: le, envoye_le: new Date().toISOString() };
  echecs.push(...await classer(sb, doc, maj, le));
  return { erreur: null, signe: sc.signe, echecs };
}

export const lienCrmDocument = (doc: Pick<DocSigne, 'client_id'>) =>
  doc.client_id ? `${CRM()}/?page=fiche&client=${encodeURIComponent(doc.client_id)}` : `${CRM()}/?page=documents`;
export { ALERTES, gabarit, echappe, envoyerMail, bouton };
