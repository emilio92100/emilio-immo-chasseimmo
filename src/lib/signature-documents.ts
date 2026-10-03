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
     annule   la signature a été arrêtée (ou il a été remplacé). V3.55 : la
              ligne garde son jeton, pour que son lien dise « Alexandre a
              arrêté la signature » au lieu de « ce lien ne mène nulle part »

   V3.55 : `documents.signature` est LA serrure. Lancer la réserve d'abord
   (une écriture qui ne passe que si elle est vide), arrêter la vide d'abord,
   et toute écriture qui suit une signature (version scellée, fin, rangement)
   exige qu'elle soit encore celle du même lancement (`lance_le`) : une
   signature arrêtée entre-temps ne revient jamais toute seule.

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
import { noterSignature } from './registre';
import { mandatSigneSurBien } from './mandat-bien';
import { avenantSigneSurBien } from './documents-avenant-bien';
import { solderRelancesSignature } from './documents-relances';
import { finValiditeOffre } from './actes/offre-achat';

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
  /* V3.56 : l'heure à laquelle la fin a été réservée (`complet_le`, lui,
     est l'heure de la dernière signature). Une réservation de plus de dix
     minutes jamais rangée est bloquée : la signature peut alors s'arrêter. */
  complet_pris_le?: string;
  /* V3.57 : l'envoi de la version complète à chacun a commencé (écrit juste
     avant le premier e-mail, en ligne comme sur place). Dès lors, plus rien
     ne se rend ni ne s'arrête : chacun a peut-être déjà reçu le document
     signé par tous ; « Tout le monde a signé : finaliser » le range. */
  envoi_le?: string;
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

/* V3.50 : une lecture ratée lève une erreur. Avant, elle rendait une liste
   vide : plus personne n'était « attendu », et le document pouvait passer
   « signé » sans aucune signature. */
export async function lireSignataires(sb: SupabaseClient, docId: string): Promise<SigDoc[]> {
  const { data, error } = await sb.from('documents_signataires').select('*').eq('document_id', docId).order('rang', { ascending: true });
  if (error || !data) throw new Error('Les signataires n’ont pas pu être lus' + (error ? ' : ' + error.message : '.'));
  return data as SigDoc[];
}

/* V3.50 : une offre d'achat ne se signe plus après sa date de validité. */
export const offreFinie = (m: Pick<Modele, 'id'>, d: Donnees): Date | null => {
  if (m.id !== 'offre_achat') return null;
  const fin = finValiditeOffre(d);
  return fin && fin.getTime() <= Date.now() ? fin : null;
};
/* La fin d'un lien tout neuf : quinze jours, mais pas au-delà de la
   validité d'une offre d'achat (V3.50 : le lien valait 15 jours, l'offre 5). */
export function finLien(m: Pick<Modele, 'id'>, d: Donnees, le: string): string {
  const quinze = Date.parse(le) + DELAI_COSIGNATURE * 86_400_000;
  const offre = m.id === 'offre_achat' ? finValiditeOffre(d) : null;
  return new Date(offre ? Math.min(quinze, offre.getTime()) : quinze).toISOString();
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

/* V3.61 — la signature arrêtée, ou le document annulé : chacun de ceux qui
   avaient reçu leur lien (ou déjà signé) est prévenu par e-mail. Alexandre :
   « ce n'est pas à moi de les avertir ; il faut qu'ils soient prévenus quand
   j'arrête une signature en cours, pour tout type de document ». Des mots
   simples, au nom d'Alexandre : la signature est interrompue (ou le document
   annulé), le lien ne marche plus, rien à faire ; une signature déjà faite
   ne compte plus. */
export function mailArret(o: { s: SigDoc; m: Modele; d: Donnees; annulation: boolean }) {
  const { s } = o;
  const doc = nomDocument(o.m, o.d);
  const adresse = [txt(o.d, 'adresse'), txt(o.d, 'ville')].filter(Boolean).join(', ');
  const precis = adresse && !doc.le.includes(adresse) ? ` (${adresse})` : '';
  const Doc = doc.le.charAt(0).toUpperCase() + doc.le.slice(1);
  const prenom = s.personne.prenom || nomSig(s);
  const aSigne = s.statut === 'signe';
  /* « L'offre d'achat a été annulée » : le seul modèle au féminin. */
  const e = o.m.id === 'offre_achat' ? 'e' : '';
  const sujet = o.annulation ? `${Doc} a été annulé${e}` : `${Doc} : la signature est interrompue`;
  const p1 = o.annulation
    ? `${Doc}${precis} a été annulé${e}.`
    : `La signature en ligne ${doc.du}${precis} a été interrompue.`;
  const p2 = o.annulation
    ? `Le lien de signature que vous avez reçu ne fonctionne plus, et il n’y a plus rien à signer.${aSigne ? ' Votre signature n’est donc pas prise en compte.' : ''}`
    : `Le lien que vous avez reçu ne fonctionne plus : vous n’avez rien à faire pour le moment.${aSigne ? ' La signature que vous aviez déjà faite n’est plus prise en compte.' : ''}`;
  const p3 = o.annulation ? '' : 'Si le document doit être signé à nouveau, vous recevrez un nouveau lien par e-mail.';
  return {
    sujet,
    texte: `Bonjour ${prenom},\n\n${sansCourbes(p1)}\n\n${sansCourbes(p2)}${p3 ? `\n\n${sansCourbes(p3)}` : ''}\n\nUne question ? Répondez à ce message, ou appelez Alexandre.\n\nAlexandre Rogelet — Emilio Immobilier`,
    html: gabarit(o.annulation ? 'Document annulé' : 'Signature interrompue', `<p>Bonjour ${echappe(prenom)},</p>
      <p>${echappe(p1)}</p>
      <p>${echappe(p2)}</p>
      ${p3 ? `<p>${echappe(p3)}</p>` : ''}`,
      'Une question ? Répondez à ce message, ou appelez Alexandre.'),
  };
}

/* Qui prévenir : ceux qui avaient leur lien, ou qui ont déjà signé (en ligne
   ou sur place). Pas celui qui devait signer sur place et n'a encore rien
   reçu. Rend les noms prévenus et les envois ratés. */
export const aPrevenir = (sigs: SigDoc[]) => sigs.filter(x => (x.statut === 'invite' || x.statut === 'signe') && emailValide(x.personne.email || ''));
export async function prevenirArret(sigs: SigDoc[], m: Modele, d: Donnees, annulation: boolean): Promise<{ prevenus: string[]; echecs: string[] }> {
  const prevenus: string[] = [], echecs: string[] = [];
  for (const x of aPrevenir(sigs)) {
    const mail = mailArret({ s: x, m, d, annulation });
    const e = await envoyerMail({ a: x.personne.email, nomA: nomSig(x), sujet: mail.sujet, texte: mail.texte, html: mail.html, repondreA: 'agence@emilio-immo.com' });
    if (e) echecs.push(`${nomSig(x)} : ${e}`); else prevenus.push(nomSig(x));
  }
  return { prevenus, echecs };
}

/* Un lien tout neuf : nouveau jeton, quinze jours (ou `expire`, voir
   finLien) ; l'ancien ne mène plus nulle part. Rend les champs à écrire. */
export function lienNeuf(s: SigDoc, le: string, note?: string, expire?: string): Partial<SigDoc> {
  return {
    statut: 'invite', mode: 'en_ligne', jeton: jetonSigner(s.personne), invite_le: le,
    lien_expire_le: expire || new Date(Date.parse(le) + DELAI_COSIGNATURE * 86_400_000).toISOString(),
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
    ? lienNeuf(s, le, o.note, finLien(m, d, le))
    : {
      relance_le: le,
      ...(o.rappel ? { relances: o.rappel } : {}),
      deroule: [...(s.deroule || []), { t: le, x: `${o.note || (o.rappel ? `Rappel n° ${o.rappel} envoyé` : 'Lien renvoyé')} (${s.personne.email})` }],
    };
  /* V3.55 : seulement s'il est encore attendu. La signature arrêtée au même
     moment (sa ligne passée « annule ») ne repart pas avec un lien neuf. */
  const { data, error } = await sb.from('documents_signataires').update(maj).eq('id', s.id).in('statut', ['invite', 'attendu']).select('*').maybeSingle();
  if (error) return { erreur: error.message, s };
  if (!data) return { erreur: ARRETEE, s };
  const x = data as SigDoc;
  return { erreur: await envoyerLien(x, m, d, neuf ? 0 : o.rappel || 0), s: x };
}

/* L'erreur d'une signature arrêtée entre-temps (V3.55) : le signataire lit
   « Alexandre a arrêté la signature », Alexandre « recharge la page ». */
export const ARRETEE = 'arrete';

/* La signature est-elle toujours celle du même lancement ? Arrêtée (vide),
   relancée (autre `lance_le`), ou le document sorti de « à faire signer » :
   non. */
export function memeLancement(doc: Pick<DocSigne, 'statut' | 'signature'> | null, sd: Pick<SignatureDoc, 'lance_le'>): boolean {
  return !!doc && doc.statut === 'pret' && !!doc.signature && doc.signature.lance_le === sd.lance_le;
}
export async function relireDocument(sb: SupabaseClient, id: string): Promise<DocSigne | null> {
  const { data, error } = await sb.from('documents').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('Le document n’a pas pu être relu : ' + error.message);
  return (data as DocSigne) || null;
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
  }).eq('id', s.id).in('statut', ['invite', 'attendu']).select('*').maybeSingle();
  if (error) return { erreur: 'enregistrement', statut: 500, plus: { detail: error.message } };
  /* V3.55 : la signature a été arrêtée pendant qu'il demandait son code. */
  if (!data) return { erreur: ARRETEE, statut: 409 };
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
  /* V3.43 : l'essai est réservé AVANT de comparer le code, et seulement si
     personne ne l'a pris entre-temps (compare puis écrit, en une requête).
     Des essais envoyés tous en même temps lisaient « 0 essai » et passaient
     tous : la limite de cinq ne tenait pas. Un double clic ne signe plus
     deux fois non plus. */
  const essais = s.code_essais + 1;
  const { data: resa, error: eR } = await sb.from('documents_signataires').update({ code_essais: essais })
    .eq('id', s.id).eq('code_essais', s.code_essais).select('id');
  if (eR) return { erreur: 'enregistrement', statut: 500, plus: { detail: eR.message } };
  if (!resa?.length || !egal(hacher(code, s.id), s.code_hash)) {
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
      /* V3.43 : le certificat ne dit « tracée » que si le tracé est rangé. */
      ...(png ? [{ t: le, x: griffe ? 'Signature tracée à l’écran' : 'Signature tracée à l’écran, mais le tracé n’a pas pu être conservé' }] : []),
      { t: le, x: `Code saisi et validé (${tentative})` },
      { t: le, x: `Case cochée : « ${accepte} »` },
      ...(demande ? [{ t: le, x: `Case à part cochée : « ${demande} »` }] : []),
    ],
  };
  /* V3.55 : seulement s'il est encore attendu. Arrêtée par Alexandre pendant
     qu'il signait (sa ligne est passée « annule ») : rien n'est noté, et il
     le lit. */
  const { data, error } = await sb.from('documents_signataires').update(maj).eq('id', s.id).in('statut', ['invite', 'attendu']).select('*').maybeSingle();
  if (error) return { erreur: 'enregistrement', statut: 500, plus: { detail: error.message } };
  if (!data) return { erreur: ARRETEE, statut: 409 };
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
    : `Votre signature est enregistrée. Vous trouverez ci-joint ${doc.le} tel qu’il est signé aujourd’hui, avec son certificat. Vous recevrez la version complète dès que ${o.attendus.length
      /* V3.57 : « Claire et Marc l’auront signé », jamais « l’aura » au pluriel. */
      ? `${o.attendus.length > 1 ? `${o.attendus.slice(0, -1).join(', ')} et ${o.attendus[o.attendus.length - 1]}` : o.attendus[0]} l’${o.attendus.length > 1 ? 'auront' : 'aura'} signé`
      : 'les autres signataires l’auront signé'}.`;
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
   recherche (ou son avenant) met à jour le bloc Mandat de sa recherche, un
   mandat de vente la fiche de son bien (V3.42), un avenant de vente aussi
   (V3.50) ; une ligne va dans le suivi du client. Rend les problèmes
   rencontrés. `echecs` : ceux d'avant (un exemplaire non parti), dits dans
   la ligne du suivi.
   V3.50 : seulement s'il est encore « à faire signer ». Déjà classé (deux
   derniers signataires au même moment), rien n'est refait : ni registre,
   ni fiche, ni suivi. */
export async function classer(sb: SupabaseClient, doc: DocSigne, sd: SignatureDoc, le: string, o: { echecs?: string[] } = {}): Promise<string[]> {
  const m = modele(doc.modele);
  const pbs: string[] = [];
  /* V3.55 : et seulement si la signature est encore celle de ce lancement
     (arrêtée entre-temps, il ne passe pas « Signé »). */
  const { data: classe, error } = await sb.from('documents').update({
    statut: 'signe', signe_le: le, signe_chemin: sd.scelle_chemin || null, signature: { ...sd, classe_le: new Date().toISOString() }, updated_at: new Date().toISOString(),
  }).eq('id', doc.id).eq('statut', 'pret').eq('signature->>lance_le', sd.lance_le).select('id');
  if (error) { pbs.push('document : ' + error.message); return pbs; }
  if (!classe?.length) return pbs;
  /* La relance « n'a pas signé dans les 15 jours » n'a plus d'objet. */
  if (m) {
    const eR = await solderRelancesSignature(sb, { clientId: doc.client_id, quoi: nomDocument(m, doc.donnees).le });
    if (eR) pbs.push('relance du lien expiré : ' + eR);
  }
  /* Le registre des mandats (V3.18) : « Signé » sur la ligne du mandat,
     ou l'avenant sur celle de son mandat. */
  const pbR = await noterSignature(sb, {
    modele: doc.modele, document_id: doc.id, titre: doc.titre || m?.titre || 'Document',
    mandatNumero: typeof doc.donnees?.mandatNumero === 'string' ? doc.donnees.mandatNumero : undefined,
    comment: sd.mode === 'sur_place' ? 'sur place' : 'en ligne', quand: `${dateCourte(le)} à ${heureParis(le)}`,
  });
  if (pbR) pbs.push(pbR);
  /* Un mandat de vente (V3.42) : la fiche de son bien passe « En vente »,
     avec le n°, le type, les dates, le prix et les honoraires du mandat. */
  if (doc.modele === 'mandat_vente') {
    const jourB = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(le));
    const pbB = await mandatSigneSurBien(sb, doc, jourB);
    if (pbB) pbs.push(pbB);
  }
  /* V3.50 : un avenant de vente change le prix, les honoraires ou la fin
     sur la fiche du bien. */
  if (doc.modele === 'avenant_vente') {
    const jourB = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(le));
    const pbB = await avenantSigneSurBien(sb, doc, jourB);
    if (pbB) pbs.push(pbB);
  }
  if (m?.surRecherche && doc.recherche_id) {
    const jour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(le));
    const { error: e2 } = await sb.from('recherches').update(m.surRecherche(doc.donnees, jour)).eq('id', doc.recherche_id);
    if (e2) pbs.push('bloc Mandat de la recherche : ' + e2.message);
  }
  if (doc.client_id) {
    const { error: e3 } = await sb.from('journal').insert({
      client_id: doc.client_id, type: 'mandat',
      titre: `✍️ ${m?.titre || 'Document'} signé ${sd.mode === 'sur_place' ? 'sur place' : 'en ligne'}`,
      description: [doc.numero ? `n° ${doc.numero}` : '', doc.titre || '', `signé par tous le ${dateCourte(le)} à ${heureParis(le)}`].filter(Boolean).join(' · ')
        + ([...(o.echecs || []), ...pbs].length ? `\n⚠️ ${[...(o.echecs || []), ...pbs].join(' ; ')}` : ''),
      metadata: { document_id: doc.id },
    });
    if (e3) pbs.push('suivi du client : ' + e3.message);
  }
  return pbs;
}

/* Tout ce qui suit la dernière signature, d'un seul tenant (en ligne) :
   scellé, envoyé à chacun, rangé.
   V3.50 : deux derniers signataires au même moment arrivaient tous les deux
   ici. La fin se réserve d'abord, en une écriture qui ne passe qu'une fois
   (`complet_le` encore vide) : le second trouve la place prise et s'arrête
   (`deja`), sans second PDF, ni second envoi, ni seconde ligne.
   V3.55 : la réservation exige aussi que la signature soit encore celle de
   ce lancement. Arrêtée au même instant (vide), elle passait, et remettait
   la signature sur un document arrêté : `erreur: 'arrete'`.
   V3.56 : un échec après la réservation (scellement, stockage, document
   pas rangé, exception) la rend : `complet_le` restait posé, et « Arrêter
   la signature » était refusé pour toujours (« le document se range tout
   seul »). « Tout le monde a signé : finaliser » reste le geste qui finit.
   V3.57 : seulement AVANT le premier e-mail. Juste avant d'envoyer, la
   version scellée et la marque `envoi_le` s'écrivent sur le document ;
   ensuite, quoi qu'il arrive (document pas rangé, exception), la
   réservation reste : rendue, elle effaçait la version scellée, et
   « Arrêter » aurait vidé un document que chacun avait déjà reçu signé
   par tous. L'arrêt refuse alors (`envoye`), et « finaliser » range. */
export async function terminer(sb: SupabaseClient, doc: DocSigne, sigs: SigDoc[]): Promise<{ erreur: string | null; signe?: Uint8Array; echecs: string[]; deja?: boolean }> {
  const m = modele(doc.modele);
  if (!m) return { erreur: 'document', echecs: [] };
  if (!doc.signature) return { erreur: ARRETEE, echecs: [] };
  const sd0 = doc.signature;
  const le = sigs.filter(s => s.statut === 'signe').map(s => s.signe_le as string).sort().pop() || new Date().toISOString();
  const prisLe = new Date().toISOString();
  const { data: pris, error: eP } = await sb.from('documents').update({ signature: { ...sd0, complet_le: le, complet_pris_le: prisLe } })
    .eq('id', doc.id).eq('statut', 'pret').eq('signature->>lance_le', sd0.lance_le).is('signature->>complet_le', null).select('id');
  /* La réservation elle-même échoue : on continue comme avant (classer ne
     passe de toute façon qu'une fois, et seulement sur ce lancement). */
  if (eP) console.error('[signature] réserver la fin du document', eP.message);
  else if (!pris?.length) {
    /* Pas réservée : un autre signataire a fini au même instant (deja), ou
       la signature a été arrêtée. */
    let frais: DocSigne | null = null;
    try { frais = await relireDocument(sb, doc.id); } catch (e) { console.error('[signature] relire après la réservation', (e as Error).message); return { erreur: null, echecs: [], deja: true }; }
    if (frais?.statut === 'signe') return { erreur: null, echecs: [], deja: true };
    if (!memeLancement(frais, doc.signature)) return { erreur: ARRETEE, echecs: [] };
    return { erreur: null, echecs: [], deja: true };
  }
  /* Rendre la réservation : la signature telle qu'avant, sans `complet_le`,
     et seulement si c'est encore la nôtre (même lancement, même fin, pas
     rangé). Ratée, on le note : l'arrêt passera au bout de dix minutes.
     V3.57 : jamais une fois l'envoi commencé (`envoi`). */
  let envoi = false;
  const rendre = async () => {
    if (eP || envoi) return;
    const { error } = await sb.from('documents').update({ signature: sd0 })
      .eq('id', doc.id).eq('statut', 'pret').eq('signature->>lance_le', sd0.lance_le).eq('signature->>complet_le', le);
    if (error) console.error('[signature] rendre la fin réservée', error.message);
  };
  /* La signature du document, sur cette réservation-là seulement. */
  const ecrireSignature = (sd: SignatureDoc) => sb.from('documents').update({ signature: sd })
    .eq('id', doc.id).eq('statut', 'pret').eq('signature->>lance_le', sd0.lance_le).eq('signature->>complet_le', le).select('id');
  try {
    const sc = await sceller(sb, doc, sigs);
    if ('erreur' in sc) { await rendre(); return { erreur: sc.erreur, echecs: [] }; }
    /* V3.57 : avant le premier e-mail, la version scellée et la marque
       « envoi commencé » sur le document. Pas écrites : rien ne part. */
    const marque: SignatureDoc = { ...sc.maj, complet_le: le, complet_pris_le: prisLe, envoi_le: new Date().toISOString() };
    if (!eP) {
      const { data: ecrit, error: eM } = await ecrireSignature(marque);
      if (eM) { await rendre(); return { erreur: 'document : ' + eM.message, echecs: [] }; }
      if (!ecrit?.length) {
        let frais: DocSigne | null = null;
        try { frais = await relireDocument(sb, doc.id); } catch (e2) { console.error('[signature] relire avant l’envoi', (e2 as Error).message); }
        return frais?.statut === 'signe' ? { erreur: null, echecs: [], deja: true } : { erreur: ARRETEE, echecs: [] };
      }
    }
    envoi = true;
    const echecs: string[] = [];
    for (const s of sigs.filter(x => x.statut === 'signe')) {
      const e = await envoyerExemplaire({ s, m, d: doc.donnees, signe: sc.signe, complet: true, attendus: [] });
      if (e) echecs.push(`${nomSig(s)} : ${e}`);
    }
    const maj: SignatureDoc = { ...marque, envoye_le: new Date().toISOString() };
    const pbs = await classer(sb, doc, maj, le, { echecs: [...echecs] });
    /* Le document n'a pas pu passer « Signé » : la réservation RESTE (chacun
       a reçu la version complète). On note au moins la fin de l'envoi ;
       « Tout le monde a signé : finaliser » le range. */
    if (pbs.some(p => p.startsWith('document :')) && !eP) {
      const { error: eE } = await ecrireSignature(maj);
      if (eE) console.error('[signature] noter la fin de l’envoi', eE.message);
    }
    echecs.push(...pbs);
    return { erreur: null, signe: sc.signe, echecs };
  } catch (e) {
    console.error('[signature] terminer', e);
    await rendre();
    return { erreur: (e as Error)?.message || 'erreur', echecs: [] };
  }
}

/* ── Un seul document du même genre en signature (V3.55) ──────────────────
   Alexandre : « si j'ai lancé une signature et que je redemande la signature
   du même document, est-ce que ça m'arrête ? ». « Dupliquer », ou « Préparer
   une offre » sur le bien, faisaient une copie qui partait en signature à côté
   de l'original : deux offres du même acquéreur pour le même bien, un « Avenant
   n° 2 » pendant que le n° 1 se signe. Avant d'envoyer les liens, on cherche un
   autre document du même modèle, déjà en signature, pour la même chose :
     · mandat de vente : le même bien ;
     · avenant (vente, recherche), délégation : le même mandat (son numéro) —
       une délégation, au même confrère ;
     · mandat de recherche : la même recherche ;
     · offre d'achat : le même bien ET le même acquéreur (deux acquéreurs
       différents sur un même bien, c'est normal) ;
     · bon de visite : le même bien, le même visiteur, le même jour.
   Le bien : son identifiant de bien en vente (`donnees.bienVenteId`), sinon
   celui de la copie de l'acheteur (`bien_id`, rapprochée de son bien en vente
   quand elle en a un), sinon l'adresse — V3.56 : et alors les mêmes
   personnes (fiche client ou e-mail d'un signataire). La personne : la même fiche client,
   sinon une adresse e-mail ou un nom de signataire en commun. Rend l'autre
   document et la phrase qui le nomme, ou null. Une lecture ratée lève. */
const net = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').trim();
const champ = (d: Donnees | null | undefined, k: string) => (d && typeof d[k] === 'string' ? String(d[k]).trim() : '');
const QUI_AUTRE: Record<string, { un: string; pour: string }> = {
  mandat_vente: { un: 'Un autre mandat de vente', pour: 'pour ce bien' },
  avenant_vente: { un: 'Un autre avenant', pour: 'à ce mandat' },
  mandat_recherche: { un: 'Un autre mandat de recherche', pour: 'pour cette recherche' },
  avenant_recherche: { un: 'Un autre avenant', pour: 'à ce mandat' },
  offre_achat: { un: 'Une autre offre d’achat', pour: 'du même acquéreur pour ce bien' },
  bon_visite: { un: 'Un autre bon de visite', pour: 'pour la même visite' },
  delegation: { un: 'Une autre délégation', pour: 'de ce mandat au même confrère' },
};
export async function autreEnSignature(sb: SupabaseClient, doc: DocSigne): Promise<{ autre: DocSigne; phrase: string } | null> {
  const qui = QUI_AUTRE[doc.modele];
  if (!qui) return null;
  const { data, error } = await sb.from('documents').select('*').eq('modele', doc.modele).eq('statut', 'pret')
    .not('signature', 'is', null).neq('id', doc.id).limit(200);
  if (error) throw new Error('Les autres documents en signature n’ont pas pu être lus : ' + error.message);
  const autres = (data || []) as DocSigne[];
  if (!autres.length) return null;
  /* Les copies d'un bien chez un acheteur, rapprochées de leur bien en vente. */
  const copies = [...new Set([doc, ...autres].map(x => x.bien_id).filter((x): x is string => !!x))];
  const venteDe: Record<string, string> = {};
  if (copies.length) {
    const { data: b, error: eB } = await sb.from('biens').select('id, bien_vente_id').in('id', copies.slice(0, 300));
    /* Illisible : chaque copie reste elle-même (l'adresse prend le relais). */
    if (eB) console.error('[signature] copies des biens', eB.message);
    for (const x of (b || []) as { id: string; bien_vente_id?: string | null }[]) if (x.bien_vente_id) venteDe[x.id] = x.bien_vente_id;
  }
  const bienDe = (x: DocSigne) => champ(x.donnees, 'bienVenteId') || (x.bien_id ? venteDe[x.bien_id] || `copie:${x.bien_id}` : '');
  const adresseDe = (x: DocSigne) => { const a = net(champ(x.donnees, 'adresse')), v = net(champ(x.donnees, 'ville')); return a && v ? `${a}|${v}` : ''; };
  /* V3.56 : l'adresse seule ne distingue pas deux lots d'un même immeuble
     (le 5A et le 3B du 12 rue des Lilas). Quand l'un des deux n'a pas
     d'identifiant de bien, il faut la même adresse ET les mêmes personnes :
     la même fiche client, ou un signataire à la même adresse e-mail. */
  const memeBien = (a: DocSigne, b: DocSigne) => {
    const ka = bienDe(a), kb = bienDe(b);
    if (ka && kb) return ka === kb;
    const aa = adresseDe(a);
    return !!aa && aa === adresseDe(b) && memesSignataires(a, b);
  };
  const memesSignataires = (a: DocSigne, b: DocSigne) => {
    if (a.client_id && b.client_id) return a.client_id === b.client_id;
    const eb = personnes(b).emails;
    return personnes(a).emails.some(e => eb.includes(e));
  };
  const personnes = (x: DocSigne) => {
    const m = modele(x.modele);
    const cs = m ? casesDe(m, x).filter(c => !c.agence) : [];
    return {
      emails: cs.map(c => (c.personne?.email || '').trim().toLowerCase()).filter(Boolean),
      /* Prénom et nom, tous les deux : deux « Martin » ne sont pas la même personne. */
      noms: cs.map(c => (c.personne?.prenom && c.personne?.nom ? net(`${c.personne.prenom} ${c.personne.nom}`) : '')).filter(Boolean),
    };
  };
  const moi = personnes(doc);
  const memesPersonnes = (b: DocSigne) => {
    if (doc.client_id && b.client_id) return doc.client_id === b.client_id;
    const p = personnes(b);
    return moi.emails.some(e => p.emails.includes(e)) || moi.noms.some(n => p.noms.includes(n));
  };
  const memeRecherche = (b: DocSigne) => (doc.recherche_id && b.recherche_id ? doc.recherche_id === b.recherche_id : !!doc.client_id && doc.client_id === b.client_id);
  const numero = champ(doc.donnees, 'mandatNumero');
  const memeMandat = (b: DocSigne) => !!numero && numero === champ(b.donnees, 'mandatNumero');
  const pareil = (b: DocSigne): boolean => {
    switch (doc.modele) {
      case 'mandat_vente': return memeBien(doc, b);
      case 'avenant_vente': return numero ? memeMandat(b) : memeBien(doc, b);
      case 'mandat_recherche': return memeRecherche(b);
      case 'avenant_recherche': return numero ? memeMandat(b) : memeRecherche(b);
      case 'offre_achat': return memeBien(doc, b) && memesPersonnes(b);
      case 'bon_visite': return memeBien(doc, b) && memesPersonnes(b) && champ(doc.donnees, 'dateVisite') === champ(b.donnees, 'dateVisite');
      case 'delegation': return memeMandat(b) && champ(doc.donnees, 'confrereId') === champ(b.donnees, 'confrereId');
      default: return false;
    }
  };
  const autre = autres.find(pareil);
  if (!autre) return null;
  const nom = [autre.titre || modele(autre.modele)?.titre || 'Document', autre.numero ? `n° ${autre.numero}` : ''].filter(Boolean).join(', ');
  const depuis = autre.signature?.lance_le ? ` depuis le ${dateCourte(autre.signature.lance_le)}` : '';
  return {
    autre,
    phrase: `${qui.un} ${qui.pour} est déjà en signature${depuis} : « ${nom} ». Arrête d’abord sa signature dans Documents, puis lance celle-ci.`,
  };
}

export const lienCrmDocument = (doc: Pick<DocSigne, 'client_id'>) =>
  doc.client_id ? `${CRM()}/?page=fiche&client=${encodeURIComponent(doc.client_id)}` : `${CRM()}/?page=documents`;
export { ALERTES, gabarit, echappe, envoyerMail, bouton };
