/* ══ Signer à plusieurs : le conjoint, les co-acquéreurs ═══════════════════

   Serveur uniquement (clé service). Le premier signataire — celui qui a
   l'espace — ajoute son conjoint ou un co-acquéreur au moment de signer.
   Chacun reçoit ensuite SON lien (espace.emilio-immo.com/signer/<jeton>) et,
   quand il le demande, SON code. Le mandat engage chacun dès qu'il signe ;
   il est complet quand plus personne n'est attendu.

   Une ligne par co-signataire dans `mandats_cosignataires`, rattachée à la
   ligne de signature du mandat (`mandats_signatures`) :

     prevu    saisi par le premier signataire, qui n'a pas encore signé
     invite   le premier a signé : son lien est parti, on l'attend
     signe    il a signé à son tour
     decline  « Je ne suis pas concerné par cet achat »
     annule   Alexandre a clos l'invitation (ou le premier a renoncé)
     retracte il a signé, puis renoncé dans les 14 jours

   La ligne du mandat passe de 'en_cours' à 'partiel' à la première
   signature, puis à 'signe' quand plus personne n'est attendu. À chaque
   signature, le PDF est refait et scellé : chaque version garde son
   empreinte, reprise dans le certificat de la suivante.
   ════════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { PDFDocument } from 'pdf-lib';
import {
  redigerMandat, resumeMandat, dateLongue, dateCourte, heureParis, finRetractationPour, DELAI_COSIGNATURE, RETRACTATION_JOURS,
  type Mandant, type Contenu, type Societe,
} from './mandat';
import { pdfMandat, pdfSigne, type SignataireCadre, type SignataireCertif } from './mandat-pdf';
import { envoyerMail, gabarit, echappe } from './mandat-serveur';
import { HOTE_ESPACE, partieAleatoire, poignee } from './jeton';
import type { IdentiteAgence } from './agence';

export const BUCKET = 'mandats';
export const SIGNATURE_AGENCE = 'agence/signature.png';

export type StatutCo = 'prevu' | 'invite' | 'signe' | 'decline' | 'annule' | 'retracte';
export type Co = {
  id: string; signature_id: string; recherche_id: string | null; rang: number; statut: StatutCo;
  saisi: Mandant; personne: Mandant;
  jeton: string | null; lien_expire_le: string | null; invite_le: string | null; ouvert_le: string | null;
  relances: number; relance_le: string | null;
  code_hash: string | null; code_expire_le: string | null; code_essais: number; codes_envoyes: number; code_envoye_le: string | null;
  signe_le: string | null; ip: string | null; appareil: string | null; email_verifie: string | null;
  execution_immediate?: boolean | null;
  griffe_chemin: string | null; decline_le: string | null; retracte_le: string | null;
  deroule: { t: string; x: string }[];
};
export type LigneMandat = {
  id: string; recherche_id: string; client_id: string | null; numero: string; statut: string;
  mandant: Mandant; societe?: Societe | null; contenu: Contenu & { agenceLe?: string | null; source?: string; identite?: IdentiteAgence; versions?: { x: string; empreinte: string }[]; version?: string };
  signe_le: string | null; ip: string | null; appareil: string | null; empreinte: string | null;
  execution_immediate: boolean | null; email_verifie: string | null; griffe_chemin?: string | null;
  pdf_chemin: string | null; pdf_mandat_chemin: string | null; deroule: { t: string; x: string }[];
};

export const nomDe = (m: Pick<Mandant, 'prenom' | 'nom'>) => `${m.prenom} ${m.nom}`.trim();
export const lienSigner = (jeton: string) => `https://${HOTE_ESPACE}/signer/${jeton}`;
export const jetonSigner = (m: Pick<Mandant, 'prenom' | 'nom'>) => `${poignee(m.prenom, m.nom) || 'signer'}-${partieAleatoire(16)}`;
/* Ceux qui font partie du mandat signé par le premier : tous, sauf les
   « prévus » d'un mandat qui n'est pas encore signé. */
export const dansLeMandat = (c: Co) => c.statut !== 'prevu';
export const attendu = (c: Co) => c.statut === 'invite';
export const lienValide = (c: Co) => !!c.lien_expire_le && Date.parse(c.lien_expire_le) > Date.now();

export async function lireCos(sb: SupabaseClient, signatureId: string): Promise<Co[]> {
  const { data, error } = await sb.from('mandats_cosignataires').select('*')
    .eq('signature_id', signatureId).order('rang', { ascending: true });
  if (error || !data) return [];
  return data as Co[];
}

/* Ceux qui ne sont pas partie au mandat : ils ont décliné, ou leur
   invitation a été close. */
export const absent = (c: Co) => c.statut === 'decline' || c.statut === 'annule';
const aSigne = (c: Co) => c.statut === 'signe' || c.statut === 'retracte';

/* Jusqu'à quand un signataire peut renoncer : 14 jours après SA signature,
   prolongés si un autre signe pendant qu'ils courent (le texte le dit).
   `qui` : l'id du co-signataire ; absent, c'est le premier signataire. */
export function finRetractationDe(l: Pick<LigneMandat, 'signe_le'>, cos: Co[], qui?: string): Date | null {
  const soi = qui ? cos.find(c => c.id === qui)?.signe_le : l.signe_le;
  if (!soi) return null;
  const autres = [l.signe_le, ...cos.filter(aSigne).map(c => c.signe_le)];
  return finRetractationPour(soi, autres);
}

/* ── Les mails ─────────────────────────────────────────────────────────── */

const bouton = (href: string, texte: string) =>
  `<a href="${href}" style="display:inline-block;margin:6px 0 4px;background:#E68B23;color:#13243D;text-decoration:none;padding:13px 22px;border-radius:12px;font-weight:800;font-size:15px">${echappe(texte)}</a>`;

/* L'invitation, et ses deux rappels (2 et 7 jours). Ton simple : c'est
   Alexandre qui écrit, de la part de quelqu'un qu'elle connaît. */
export function mailInvitation(o: { co: Mandant; premier: Mandant; premierLe: string | null; lien: string; expire: string; rappel?: 0 | 1 | 2 }) {
  const { co, premier, lien, expire } = o;
  const p = premier.prenom, pn = nomDe(premier);
  const il = premier.civilite === 'Madame' ? 'elle' : 'il', Il = premier.civilite === 'Madame' ? 'Elle' : 'Il';
  const indiquee = co.civilite === 'Madame' ? 'indiquée' : 'indiqué';
  const concerne = co.civilite === 'Madame' ? 'concernée' : 'concerné';
  const fin = dateLongue(expire);
  /* Le second rappel (7 jours) est le dernier : il dit combien de jours il
     reste avant que le lien ne marche plus. */
  const reste = Math.ceil((Date.parse(expire) - Date.now()) / 86_400_000);
  const encore = reste >= 2 ? `encore ${reste} jours, jusqu’au ${fin}` : `jusqu’au ${fin}`;
  const signeLe = o.premierLe ? ` le ${dateLongue(o.premierLe)}` : '';
  const sujet = o.rappel === 2 ? `Dernier rappel : ${p} attend toujours votre signature`
    : o.rappel ? `Rappel : ${p} attend votre signature sur votre mandat de recherche`
    : `${p} vous invite à signer votre mandat de recherche`;
  const introTexte = o.rappel === 2
    ? `${pn} a signé votre mandat de recherche${signeLe}, et il ne manque plus que votre signature. C'est notre dernier rappel : votre lien de signature est valable ${encore.replace(/’/g, "'")}. Passé cette date, il ne fonctionnera plus.`
    : o.rappel
    ? `${pn} a signé votre mandat de recherche${signeLe}. Il ne manque plus que votre signature pour qu'il soit complet.`
    : `${pn} a signé aujourd'hui le mandat de recherche qu'${il} confie à Alexandre Rogelet, d'Emilio Immobilier, pour votre projet d'achat. ${Il} vous a ${indiquee} comme co-acquéreur : le mandat sera complet avec votre signature.`;
  const intro = o.rappel === 2
    ? `<p>${echappe(pn)} a signé votre mandat de recherche${echappe(signeLe)}, et il ne manque plus que votre signature.</p>
      <p>C’est notre <b>dernier rappel</b> : votre lien de signature est valable <b>${echappe(encore)}</b>. Passé cette date, il ne fonctionnera plus.</p>`
    : o.rappel
    ? `<p>${echappe(pn)} a signé votre mandat de recherche${echappe(signeLe)}. Il ne manque plus que votre signature pour qu’il soit complet.</p>`
    : `<p><b>${echappe(pn)}</b> a signé aujourd’hui le mandat de recherche qu’${il} confie à Alexandre Rogelet, d’Emilio Immobilier, pour votre projet d’achat. ${Il} vous a ${indiquee} comme co-acquéreur : le mandat sera complet avec votre signature.</p>`;
  /* Au dernier rappel, la date est déjà dite plus haut. */
  const valable = o.rappel === 2 ? '' : ` et valable jusqu’au ${fin}`;
  return {
    sujet,
    texte: `Bonjour ${co.prenom},\n\n${introTexte}\n\nVous pourrez le relire en entier, vérifier vos informations et signer, en deux minutes :\n${lien}\n\nCe lien est personnel${valable.replace(/’/g, "'")}. Le code de signature ne vous est envoyé que lorsque vous le demandez, et il est valable 15 minutes.\n\nVous n'êtes pas ${concerne} par cet achat ? Ouvrez le lien et choisissez « Je ne suis pas ${concerne} » : ${p} et Alexandre seront prévenus.\n\nAlexandre Rogelet — Emilio Immobilier`,
    html: gabarit('Votre mandat de recherche', `<p>Bonjour ${echappe(co.prenom)},</p>
      ${intro}
      <p>Vous pourrez le relire en entier, vérifier vos informations et signer, en deux minutes&nbsp;:</p>
      <p>${bouton(lien, 'Relire et signer le mandat')}</p>
      <p style="font-size:13px;color:#5B6B80">Ce lien est personnel${echappe(valable)}. Le code de signature ne vous est envoyé que lorsque vous le demandez, et il est valable 15 minutes.</p>`,
      `Vous n’êtes pas ${concerne} par cet achat ? Ouvrez le lien et choisissez « Je ne suis pas ${concerne} » : ${echappe(p)} et Alexandre seront prévenus.`),
  };
}

/* Un lien tout neuf : nouveau jeton, nouveau délai de quinze jours ;
   l'ancien lien, s'il y en avait un, ne mène plus nulle part. Rend les
   champs à écrire — rien n'est enregistré ici. */
export function lienNeuf(co: Co, le: string, note?: string): Partial<Co> {
  return {
    statut: 'invite', jeton: jetonSigner(co.personne), invite_le: le,
    lien_expire_le: new Date(Date.parse(le) + DELAI_COSIGNATURE * 86_400_000).toISOString(),
    relances: 0, relance_le: null, code_hash: null, code_essais: 0, codes_envoyes: 0, code_envoye_le: null,
    deroule: [...(co.deroule || []), { t: le, x: `${note ? note + ' · ' : ''}Lien personnel envoyé à ${co.personne.email}` }],
  };
}

/* Le mail de son lien : invitation, ou rappel n° 1 / n° 2. */
export async function envoyerLien(c: Co, l: Pick<LigneMandat, 'mandant' | 'signe_le'>, rappel: 0 | 1 | 2 = 0): Promise<string | null> {
  if (!c.jeton || !c.lien_expire_le) return 'lien absent';
  const m = mailInvitation({ co: c.personne, premier: l.mandant, premierLe: l.signe_le, lien: lienSigner(c.jeton), expire: c.lien_expire_le, rappel });
  return envoyerMail({ a: c.personne.email, nomA: nomDe(c.personne), sujet: m.sujet, texte: m.texte, html: m.html, repondreA: 'agence@emilio-immo.com' });
}

/* Renvoie son lien (le même s'il est encore valable, sinon un neuf), ou
   un rappel. Enregistre, puis envoie. Rend null si le mail est parti. */
export async function inviter(sb: SupabaseClient, co: Co, l: Pick<LigneMandat, 'mandant' | 'signe_le'>, o: { nouveau?: boolean; rappel?: 0 | 1 | 2; note?: string } = {}): Promise<{ erreur: string | null; co: Co }> {
  const le = new Date().toISOString();
  const neuf = o.nouveau || !co.jeton || !lienValide(co) || co.statut === 'prevu';
  const maj: Partial<Co> = neuf
    ? lienNeuf(co, le, o.note)
    : {
      relance_le: le,
      ...(o.rappel ? { relances: o.rappel } : {}),
      deroule: [...(co.deroule || []), { t: le, x: `${o.note || (o.rappel ? `Rappel n° ${o.rappel} envoyé` : 'Lien renvoyé')} (${co.personne.email})` }],
    };
  const { data, error } = await sb.from('mandats_cosignataires').update(maj).eq('id', co.id).select('*').single();
  if (error || !data) return { erreur: error?.message || 'enregistrement', co };
  const c = data as Co;
  return { erreur: await envoyerLien(c, l, neuf ? 0 : o.rappel || 0), co: c };
}

/* ── Le PDF, refait à chaque signature ─────────────────────────────────── */

/* Le déroulé du certificat : celui du premier signataire, puis celui de
   chaque co-signataire, fondus et remis dans l'ordre du temps. Chaque ligne
   dit de qui elle parle. */
export function derouleCommun(l: LigneMandat, cos: Co[]): { t: string; x: string }[] {
  const p = nomDe(l.mandant);
  const tout = [
    ...(l.deroule || []).map(e => ({ t: e.t, x: `${p} · ${e.x}` })),
    ...cos.filter(dansLeMandat).flatMap(c => (c.deroule || []).map(e => ({ t: e.t, x: `${nomDe(c.personne)} · ${e.x}` }))),
  ];
  return tout.sort((a, b) => a.t.localeCompare(b.t));
}

async function lireFichier(sb: SupabaseClient, chemin: string | null | undefined): Promise<Uint8Array | null> {
  if (!chemin) return null;
  try {
    const { data } = await sb.storage.from(BUCKET).download(chemin);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  } catch { return null; }
}

/* Fabrique le mandat tel qu'il est à cet instant — les signatures déjà
   faites, celles qu'on attend — le scelle, et range les deux fichiers.
   Rend les chemins et l'empreinte ; la ligne du mandat est mise à jour
   (PDF, empreinte, versions précédentes). */
export type Scelle = {
  ok: true; signe: Uint8Array; empreinte: string; complet: boolean;
  /* Ce qu'il faut écrire sur la ligne du mandat une fois tout le reste
     enregistré : on ne touche la base qu'au dernier moment. */
  maj: { pdf_chemin: string; pdf_mandat_chemin: string; empreinte: string; contenu: LigneMandat['contenu']; statut?: 'signe' };
};
export async function sceller(sb: SupabaseClient, l: LigneMandat, cos: Co[]): Promise<Scelle | { ok: false; erreur: string }> {
  const identite = l.contenu.identite;
  const membres = cos.filter(dansLeMandat);
  const m = l.mandant;
  const parties = redigerMandat({
    numero: l.numero, mandant: m, cosignataires: membres.map(c => c.personne), societe: l.societe || null,
    absents: membres.map(absent), executionsCos: membres.map(c => (aSigne(c) ? c.execution_immediate ?? null : null)),
    recherche: l.contenu.recherche, executionImmediate: l.execution_immediate,
    signature: l.signe_le ? { le: l.signe_le, email: m.email } : null,
  }, identite);
  const griffeAgence = await lireFichier(sb, SIGNATURE_AGENCE);
  const cadres: SignataireCadre[] = [
    { nom: nomDe(m), le: l.signe_le, griffe: await lireFichier(sb, l.griffe_chemin) },
    /* Ceux qui ne sont pas partie au mandat n'ont pas de cadre. */
    ...await Promise.all(membres.filter(c => !absent(c)).map(async c => ({
      nom: nomDe(c.personne),
      le: aSigne(c) ? c.signe_le : null,
      griffe: await lireFichier(sb, c.griffe_chemin),
    }))),
  ];
  const complet = !membres.some(attendu);
  const faits = cadres.filter(c => c.le);
  const dernier = faits.map(c => c.le as string).sort().pop() || l.signe_le || new Date().toISOString();
  const noms = cadres.map(c => c.nom).join(' et ');
  const mention = complet
    ? `Signé électroniquement le ${dateLongue(dernier)}`
    : `Signé par ${faits.map(c => c.nom).join(', ')} · en attente de ${cadres.filter(c => !c.le).map(c => c.nom).join(', ')}`;
  const sig = { mandantNom: noms, le: dernier, email: m.email, agenceLe: l.contenu.agenceLe || null, mandants: cadres };
  /* Le certificat fait souvent deux pages à plusieurs (un bloc par
     signataire, un déroulé plus long) : le pied « 3 / 9 » du mandat doit
     le savoir. On fabrique une fois, on compte, et on refait si besoin. */
  const fabriquer = (certif: number) => pdfMandat(parties, {
    numero: l.numero, mandantNom: noms, resume: resumeMandat(l.contenu.recherche), sig,
    pagesEnTout: n => n + certif, signatureAgence: griffeAgence, identite, mentionGarde: mention,
  });
  /* Chaque version scellée garde son nom (« signée par Paul Martin, le
     27/09/2026 ») : la suivante la cite avec son empreinte. */
  const version = `${complet ? 'version complète' : `signée par ${faits.map(c => c.nom).join(', ')}`}, le ${dateCourte(dernier)}`;
  const versions = [...(l.contenu.versions || []), ...(l.empreinte ? [{ x: l.contenu.version || 'version précédente', empreinte: l.empreinte }] : [])]
    .filter((v, i, t) => t.findIndex(w => w.empreinte === v.empreinte) === i);
  const signataires: SignataireCertif[] = [
    { nom: nomDe(m), adresse: m.adresse, email: l.email_verifie || m.email, telephone: m.telephone, le: l.signe_le, ip: l.ip || '', appareil: l.appareil || '', execution: l.execution_immediate },
    ...membres.map(c => ({
      nom: nomDe(c.personne), adresse: c.personne.adresse, email: c.email_verifie || c.personne.email, telephone: c.personne.telephone,
      le: aSigne(c) ? c.signe_le : null, ip: c.ip || '', appareil: c.appareil || '',
      invite: c.invite_le, refus: absent(c), execution: aSigne(c) ? c.execution_immediate ?? null : null,
    })),
  ];
  const certifier = (seul: Uint8Array, empreinte: string) => pdfSigne(seul, {
    numero: l.numero, mandant: { nom: nomDe(m), adresse: m.adresse, email: m.email, telephone: m.telephone },
    signeLe: l.signe_le || dernier, ip: l.ip || '', appareil: l.appareil || '', empreinte,
    deroule: derouleCommun(l, cos), executionImmediate: !!l.execution_immediate, agenceLe: l.contenu.agenceLe || null,
    identite, signataires, versions,
  });
  let seul = await fabriquer(1);
  let empreinte = createHash('sha256').update(seul).digest('hex');
  let signe = await certifier(seul, empreinte);
  const nbSeul = (await PDFDocument.load(seul)).getPageCount();
  const nbCertif = (await PDFDocument.load(signe)).getPageCount() - nbSeul;
  if (nbCertif !== 1) {
    seul = await fabriquer(nbCertif);
    empreinte = createHash('sha256').update(seul).digest('hex');
    signe = await certifier(seul, empreinte);
  }
  const racine = `${l.recherche_id}/${l.numero}-${Date.now()}`;
  const cheminSeul = `${racine}-mandat.pdf`, cheminSigne = `${racine}-signe.pdf`;
  const up1 = await sb.storage.from(BUCKET).upload(cheminSeul, seul, { contentType: 'application/pdf', upsert: false });
  if (up1.error) return { ok: false, erreur: up1.error.message };
  const up2 = await sb.storage.from(BUCKET).upload(cheminSigne, signe, { contentType: 'application/pdf', upsert: false });
  if (up2.error) return { ok: false, erreur: up2.error.message };
  return {
    ok: true, signe, empreinte, complet,
    maj: {
      pdf_chemin: cheminSigne, pdf_mandat_chemin: cheminSeul, empreinte,
      contenu: { ...l.contenu, versions, version },
      ...(complet ? { statut: 'signe' as const } : {}),
    },
  };
}

/* La signature tracée au doigt : un PNG en data URL, borné. */
export function lireGriffe(v: unknown): Uint8Array | null {
  if (typeof v !== 'string' || !v.startsWith('data:image/png;base64,') || v.length >= 600_000) return null;
  const o = Buffer.from(v.slice(22), 'base64');
  return o.length > 200 && o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47 ? new Uint8Array(o) : null;
}
export async function rangerGriffe(sb: SupabaseClient, rechercheId: string, numero: string, qui: string, png: Uint8Array | null): Promise<string | null> {
  if (!png) return null;
  const chemin = `${rechercheId}/${numero}-griffe-${qui}-${Date.now()}.png`;
  const { error } = await sb.storage.from(BUCKET).upload(chemin, png, { contentType: 'image/png', upsert: false });
  return error ? null : chemin;
}

/* Le mandat complet, ou la version du moment, à chaque signataire. */
export async function envoyerExemplaire(o: {
  a: Mandant; numero: string; signe: Uint8Array; complet: boolean; fin: Date | null; attendus: string[];
}): Promise<string | null> {
  const pj = [{ nom: `Mandat-de-recherche-${o.numero}.pdf`, type: 'application/pdf', base64: Buffer.from(o.signe).toString('base64') }];
  const fin = o.fin ? ` Vous pouvez y renoncer jusqu’au ${dateLongue(o.fin)} inclus.` : '';
  const finTexte = o.fin ? ` Vous pouvez y renoncer jusqu'au ${dateLongue(o.fin)} inclus.` : '';
  const attente = o.attendus.join(' et ');
  const corps = o.complet
    ? `Votre mandat de recherche n° ${o.numero} est complet : tous les signataires l’ont signé. Vous le trouverez ci-joint, avec son certificat de signature.`
    : `Votre signature est enregistrée. Vous trouverez ci-joint le mandat de recherche n° ${o.numero} tel qu’il est signé aujourd’hui, avec son certificat. Vous recevrez la version complète dès que ${attente} l’aura signé.`;
  return envoyerMail({
    a: o.a.email, nomA: nomDe(o.a), pj, repondreA: 'agence@emilio-immo.com',
    sujet: o.complet ? `Votre mandat de recherche n° ${o.numero}, signé par tous` : `Votre mandat de recherche n° ${o.numero}`,
    texte: `Bonjour ${o.a.prenom},\n\n${corps.replace(/’/g, "'")}\n\nAlexandre Rogelet — Emilio Immobilier\n\n—\nLe mandat joint rappelle votre délai de rétractation de ${RETRACTATION_JOURS} jours et la façon de l'exercer.${finTexte}`,
    html: gabarit('Votre mandat de recherche', `<p>Bonjour ${echappe(o.a.prenom)},</p><p>${echappe(corps)}</p><p>Alexandre Rogelet — Emilio Immobilier</p>`,
      `Le mandat joint rappelle votre délai de rétractation de ${RETRACTATION_JOURS} jours et la façon de l’exercer.${fin}`),
  });
}

export { heureParis, dateCourte };
