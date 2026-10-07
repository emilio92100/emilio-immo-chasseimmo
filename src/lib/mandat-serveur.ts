/* ══ Le mandat, côté serveur : numéros, état, envoi des mails ═══════════════

   Serveur uniquement (clé service). Trois choses ici :

   1. La RÉSERVE DE NUMÉROS. Alexandre réserve d'avance quelques numéros dans
      son registre ImmoFacile (le registre unique de l'agence) et les colle dans
      le CRM. Quand un client signe seul, sans mandat préparé, l'espace prend le
      premier libre. Deux lignes de `parametres` :
        · mandat_numeros_reserve     « 1001, 1002, 1003 »
        · mandat_modele_approuve_le  l'instant où Alexandre a approuvé le mandat
                                     type — c'est la signature de l'agence pour
                                     tous les mandats pris sur la réserve.
      Sans approbation, la réserve ne sert pas : personne ne signe à la place
      d'Alexandre.

   2. L'ÉTAT du mandat d'une recherche, tel que l'espace et les routes le
      voient (voir etatMandat() dans src/lib/mandat.ts).

   3. L'envoi des mails (Mailjet), avec pièce jointe.

   Tout est écrit pour marcher AVANT que le SQL soit passé : une colonne ou
   une table absente se lit comme « rien de préparé », jamais comme une panne.
   ════════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { etatMandat, horsMandat, rechercheDepuis, jourParis, forfaitDe, tauxDe, finRetractationPour, memeNumero, DUREE, HONORAIRES_TAUX, type EtatMandat, type Contenu } from './mandat';
import { contenuApresAvenants } from './actes/avenant-recherche';
import { argentRecherche, TYPES_BIEN } from './actes/mandat-recherche';
import { num, txt, liste, plusMois } from './actes/commun';
import {
  signatairesEspace, laSienne, retracteEnLigne, modeDoc, COLONNES_SIGNATAIRES,
  type FicheEspace, type LigneSignataire, type SignataireEspace, type EtatSignataire, type ModeDoc,
} from './documents-espace';
import { alerteMailActive } from './alertes';
import { lireDepart } from './registre';
import { enveloppeMail } from '@/lib/mail-charte';

export const CLE_RESERVE = 'mandat_numeros_reserve';
export const CLE_APPROBATION = 'mandat_modele_approuve_le';
export const RESERVE_ALERTE = 2;   // on prévient Alexandre quand il en reste ce nombre

export function lireNumeros(v: string | null | undefined): string[] {
  return String(v || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
}

/* `registre` (V3.18) : le registre des mandats du CRM est démarré. Il
   remplace la réserve : chaque client qui signe seul y prend le numéro
   suivant, sans limite ; l'approbation du mandat type reste exigée.
   `premier` : son premier numéro (ceux d'avant viennent de l'ancien
   registre). `registreKo` : il n'a pas pu être lu — on ne se rabat surtout
   pas sur la réserve, on réessaie plus tard. */
export type Reserve = { numeros: string[]; approuveLe: string | null; brut: string | null; registre: boolean; premier: number | null; registreKo?: string };
export async function lireReserve(sb: SupabaseClient): Promise<Reserve> {
  const [{ data, error }, reg] = await Promise.all([
    sb.from('parametres').select('cle, valeur').in('cle', [CLE_RESERVE, CLE_APPROBATION]),
    lireDepart(sb),
  ]);
  const registre = !!reg.depart;
  const premier = reg.depart ? Number(reg.depart.premier_numero) : null;
  const ko = reg.erreur ? { registreKo: reg.erreur } : {};
  if (error || !data) return { numeros: [], approuveLe: null, brut: null, registre, premier, ...ko };
  const brut = (data.find(x => x.cle === CLE_RESERVE)?.valeur as string | null) ?? null;
  const approuveLe = (data.find(x => x.cle === CLE_APPROBATION)?.valeur as string | null) || null;
  return { numeros: lireNumeros(brut), approuveLe, brut, registre, premier, ...ko };
}


/* Un client peut-il signer seul, sans numéro préparé ? Le mandat type
   approuvé (ou ce mandat proposé), et un numéro à prendre : dans le
   registre s'il est démarré, sinon dans la réserve. */
export function signeSansNumero(r: Pick<Reserve, 'numeros' | 'approuveLe' | 'registre'>, proposeLe?: unknown): boolean {
  const accord = !!r.approuveLe || (r.registre && typeof proposeLe === 'string' && !!proposeLe);
  return accord && (r.registre || r.numeros.length > 0);
}

/* Prendre le premier numéro libre de la réserve. On réécrit la liste en
   vérifiant qu'elle n'a pas bougé entre-temps (deux clients qui signent à la
   même seconde ne prennent pas le même numéro) ; trois essais suffisent. */
export async function prendreNumero(sb: SupabaseClient): Promise<{ numero: string; restants: number; approuveLe: string } | null> {
  for (let essai = 0; essai < 3; essai++) {
    const r = await lireReserve(sb);
    if (!r.approuveLe || !r.numeros.length || r.brut === null) return null;
    const [numero, ...reste] = r.numeros;
    const { data, error } = await sb.from('parametres')
      .update({ valeur: reste.join(', '), updated_at: new Date().toISOString() })
      .eq('cle', CLE_RESERVE).eq('valeur', r.brut).select('cle');
    if (!error && data && data.length === 1) return { numero, restants: reste.length, approuveLe: r.approuveLe };
  }
  return null;
}

/* L'état vu par l'espace : un numéro préparé sur la recherche, OU une
   réserve approuvée et non vide, suffisent pour proposer la signature. */
export async function etatServeur(sb: SupabaseClient, recherche: Record<string, unknown>): Promise<EtatMandat> {
  const e = etatMandat(recherche as Parameters<typeof etatMandat>[0]);
  if (e !== 'sans_numero') return e;
  const r = await lireReserve(sb);
  return signeSansNumero(r, recherche.mandat_propose_le) ? 'a_signer' : 'sans_numero';
}

/* Un mandat de recherche préparé dans la rubrique Documents (V3.32), pas
   encore signé par tous : en préparation (brouillon) ou prêt (à signer à la
   main, sur place, ou parti en signature en ligne). Tant qu'il est là,
   l'espace ne propose pas le mandat en ligne — ce serait un second mandat
   pour la même recherche (src/lib/coherence.ts). Table ou colonne absente :
   null.

   `lien` : SON lien personnel de signature, quand il doit encore signer et
   que ce lien vaut encore — jamais celui de son conjoint (V3.55 : Paul
   ouvrait la page de Claire, et le code partait chez elle). C'est lui, et
   lui seul, qui bloque une demande de visite (l'espace et /api/espace/retour
   le lisent ici tous les deux). Signé par lui, en attente d'un autre : plus
   de lien, la visite passe — comme le mandat signé à plusieurs dans
   l'espace, qui l'engage dès sa signature.

   `qui` : sa fiche (ses adresses, celle de son conjoint, son prénom), ou
   une simple liste d'adresses, toutes à lui. */
export type MandatDocument = {
  id: string; statut: 'brouillon' | 'pret'; titre: string; numero: string | null;
  mode: ModeDoc; lance: boolean;
  lien: string | null;
  vous: EtatSignataire | null;
  signataires: SignataireEspace[];
};
export async function mandatDocumentEnRoute(sb: SupabaseClient, rechercheId: string, qui: FicheEspace | null | undefined): Promise<MandatDocument | null> {
  /* `*` : une colonne pas encore créée ne fait jamais échouer la lecture. */
  const { data, error } = await sb.from('documents').select('*')
    .eq('modele', 'mandat_recherche').eq('recherche_id', rechercheId).in('statut', ['brouillon', 'pret'])
    .order('updated_at', { ascending: false }).limit(5);
  if (error || !data?.length) return null;
  const docs = data as { id: string; statut: 'brouillon' | 'pret'; titre: string | null; numero?: string | null; donnees?: Record<string, unknown> | null; signature?: unknown }[];
  /* V3.56 : parmi plusieurs « à faire signer », celui qui est parti en
     signature d'abord (une copie finalisée à côté n'est pas celui qu'il
     signe). */
  const doc = docs.find(x => x.statut === 'pret' && !!x.signature) || docs.find(x => x.statut === 'pret') || docs[0];
  /* V3.56 : les signataires seulement quand la signature est lancée
     (`documents.signature`), comme lireDocumentsEspace. Un arrêt resté à
     moitié (le document vidé, ses lignes encore « invite ») ne lui donne ni
     un lien mort, ni une demande de visite bloquée. */
  let signataires: SignataireEspace[] = [];
  if (doc.statut === 'pret' && doc.signature) {
    const { data: sigs, error: eS } = await sb.from('documents_signataires').select(COLONNES_SIGNATAIRES).eq('document_id', doc.id);
    if (!eS && sigs) signataires = signatairesEspace(sigs as LigneSignataire[], qui);
  }
  const vous = signataires.find(s => s.qui === 'vous') || null;
  const numero = (typeof doc.numero === 'string' && doc.numero.trim()) || (typeof doc.donnees?.numero === 'string' && doc.donnees.numero.trim()) || null;
  return {
    id: doc.id, statut: doc.statut, titre: doc.titre || 'Mandat de recherche', numero,
    mode: modeDoc(doc.donnees, doc.signature), lance: !!doc.signature,
    lien: vous?.etat === 'a_signer' ? vous.lien : null,
    vous: vous?.etat || null,
    signataires,
  };
}

/* Le dernier mandat de recherche de la rubrique Documents signé pour cette
   recherche (à la main, en ligne ou sur place). Absent ou illisible : null. */
export type MandatDocumentSigne = { id: string; client_id: string | null; numero: string | null; donnees: Record<string, unknown>; signature: unknown; signe_le: string; signe_chemin: string | null };
/* V3.56 : `numero` (celui noté sur la recherche) : parmi plusieurs signés
   (un mandat renouvelé, l'ancien pas annulé), celui qui le porte ; sinon le
   plus récemment signé, comme avant. */
export async function mandatDocumentSigne(sb: SupabaseClient, rechercheId: string, numero?: string | null): Promise<MandatDocumentSigne | null> {
  const { data, error } = await sb.from('documents').select('*')
    .eq('modele', 'mandat_recherche').eq('recherche_id', rechercheId).eq('statut', 'signe')
    .order('signe_le', { ascending: false, nullsFirst: false }).limit(10);
  const numeroDe = (x: Record<string, unknown>) => {
    const dn = x.donnees && typeof x.donnees === 'object' ? x.donnees as Record<string, unknown> : {};
    return (typeof x.numero === 'string' && x.numero.trim()) || (typeof dn.numero === 'string' && dn.numero.trim()) || null;
  };
  const lignes = (!error && data ? data : []) as Record<string, unknown>[];
  const d = (numero ? lignes.find(x => memeNumero(numeroDe(x), numero)) : undefined) || lignes[0] || null;
  if (!d || typeof d.signe_le !== 'string' || !d.signe_le) return null;
  const donnees = d.donnees && typeof d.donnees === 'object' ? d.donnees as Record<string, unknown> : {};
  const numeroDoc = numeroDe(d);
  return {
    id: String(d.id), client_id: typeof d.client_id === 'string' ? d.client_id : null, numero: numeroDoc, donnees,
    signature: d.signature ?? null, signe_le: d.signe_le, signe_chemin: typeof d.signe_chemin === 'string' ? d.signe_chemin : null,
  };
}

/* ══ Renoncer en ligne à un mandat de recherche de la rubrique Documents ══
   V3.56. Le mandat signé dans l'espace a sa renonciation en ligne depuis le
   début (obligatoire depuis le 19 juin 2026 pour un contrat conclu sur une
   interface en ligne : /api/espace/mandat, étape « renoncer »). Celui de la
   rubrique Documents, signé en ligne avec son lien, l'a maintenant aussi.

   Il y a droit quand le document a été signé EN LIGNE (pas à la main, pas
   sur place sur l'écran d'Alexandre), et par LUI : sa propre ligne de
   signataire (laSienne : à l'une de ses adresses), signée en ligne. Le délai
   se compte exactement comme pour le mandat signé dans l'espace : 14 jours
   après SA signature, prolongés si un autre signe pendant qu'ils courent
   (finRetractationPour). Le statut du document, sa recherche et son client
   sont vérifiés par l'appelant. Pas de droit, ou lecture impossible : null.
   L'heure n'est pas regardée ici : `fin` dit jusqu'à quand. */
export type LigneRenonce = LigneSignataire & {
  id: string; mode?: string | null; email_verifie?: string | null;
  personne: { prenom?: unknown; nom?: unknown; email?: unknown } | null;
  deroule?: { t: string; x: string }[] | null;
};
export type Renonciation = { soi: LigneRenonce; autres: LigneRenonce[]; fin: Date };
export async function renonciationDocument(sb: SupabaseClient, doc: { id: string; donnees?: unknown; signature?: unknown }, qui: FicheEspace | null | undefined): Promise<Renonciation | null> {
  const lance = doc.signature && typeof doc.signature === 'object' ? (doc.signature as { mode?: unknown }).mode : null;
  if (lance !== 'en_ligne' || modeDoc(doc.donnees, doc.signature) !== 'en_ligne') return null;
  const { data, error } = await sb.from('documents_signataires').select('*').eq('document_id', doc.id);
  if (error || !data?.length) return null;
  const lignes = data as LigneRenonce[];
  const soi = laSienne(lignes, qui);
  if (!soi || soi.statut !== 'signe' || !soi.signe_le || (soi.mode && soi.mode !== 'en_ligne')) return null;
  const signes = lignes.filter(l => l.statut === 'signe' && !!l.signe_le);
  return { soi, autres: signes.filter(l => l.id !== soi.id), fin: finRetractationPour(soi.signe_le, signes.map(l => l.signe_le)) };
}

/* Le dernier mandat de recherche de la rubrique Documents de cette
   recherche, s'il a été rétracté en ligne par le client (retracteEnLigne).
   Pour que « Mon mandat de recherche » le dise. Absent : null. */
export type MandatDocumentRetracte = { id: string; client_id: string | null; numero: string | null; signe_le: string | null; signe_chemin: string | null; retracte_le: string };
export async function mandatDocumentRetracte(sb: SupabaseClient, rechercheId: string): Promise<MandatDocumentRetracte | null> {
  const { data, error } = await sb.from('documents').select('*')
    .eq('modele', 'mandat_recherche').eq('recherche_id', rechercheId).eq('statut', 'annule')
    .order('annule_le', { ascending: false, nullsFirst: false }).limit(1);
  const d = !error && data?.[0] ? data[0] as Record<string, unknown> : null;
  const le = retracteEnLigne(d);
  if (!d || !le) return null;
  const donnees = d.donnees && typeof d.donnees === 'object' ? d.donnees as Record<string, unknown> : {};
  return {
    id: String(d.id), client_id: typeof d.client_id === 'string' ? d.client_id : null,
    numero: (typeof d.numero === 'string' && d.numero.trim()) || (typeof donnees.numero === 'string' && donnees.numero.trim()) || null,
    signe_le: typeof d.signe_le === 'string' ? d.signe_le : null, signe_chemin: typeof d.signe_chemin === 'string' ? d.signe_chemin : null,
    retracte_le: le,
  };
}

/* Deux numéros de mandat sont-ils le même (« 1 024 » et « 1024 ») ? Défini
   dans src/lib/mandat.ts (le navigateur s'en sert aussi). */
export { memeNumero };

/* Ce que borne un mandat de Documents signé, sous la forme du contenu figé
   d'un mandat signé dans l'espace (pour horsMandat) : le prix d'achat
   maximum hors honoraires, les honoraires, les secteurs et les types de
   bien cités. Et sa fin : la durée (ou la limite totale, quand il se
   poursuit par périodes), comptée depuis le jour de la signature — comme
   surRecherche l'écrit dans la recherche. */
function contenuDocument(d: Record<string, unknown>): Contenu {
  const a = argentRecherche(d);
  const forfait = forfaitDe(a.forfait);
  const taux = forfait ? HONORAIRES_TAUX : tauxDe(a.taux);
  /* « Autre » coché sans précision reste « Autre » (V3.56) : la case « Autre »
     de l'espace y entre, au lieu d'être signalée hors mandat. */
  const types = liste(d, 'types').map(v => (v === 'autre' ? txt(d, 'typeAutre') || 'Autre' : TYPES_BIEN.find(t => t.v === v)?.l || '')).filter(Boolean);
  return {
    recherche: {
      typeBien: types.join(', ') || null, piecesMin: num(d, 'pieces'), chambresMin: num(d, 'chambres'), surfaceMin: num(d, 'surface'),
      secteurs: txt(d, 'secteurs').split(/\s*[,;\n]\s*/).map(x => x.trim()).filter(Boolean), budget: null, taux, forfait,
    },
    prixMax: a.prix, honoraires: a.honoraires, taux, forfait, duree: DUREE,
  };
}
function finDocument(d: Record<string, unknown>, signeLe: string): number {
  const total = d.dureeMode === 'prorogation' ? (num(d, 'dureeMax') ?? 12) : (num(d, 'duree') ?? 12);
  const fin = plusMois(jourParis(signeLe), Math.round(total));
  return fin ? Date.parse(`${fin}T23:59:59Z`) : NaN;
}

/* Les adresses d'un client (et de son conjoint, sur une fiche « couple »). */
export function adressesClient(c: { emails?: unknown; conjoint?: unknown } | null | undefined): string[] {
  const l = Array.isArray(c?.emails) ? (c!.emails as unknown[]) : [];
  const j = c?.conjoint && typeof c.conjoint === 'object' ? (c.conjoint as { email?: unknown }).email : null;
  return [...l, j].filter((e): e is string => typeof e === 'string' && e.includes('@'));
}

/* ── Les mails ── */
const FROM_EMAIL = process.env.MAILJET_FROM_EMAIL || 'arogelet@emilio-immo.com';
const FROM_NAME = process.env.MAILJET_FROM_NAME || 'Alexandre ROGELET — Emilio Immobilier';

export const echappe = (t: string) =>
  String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type PieceJointe = { nom: string; type: string; base64: string };

/* Rend null si tout va bien, sinon le message d'erreur. */
export async function envoyerMail(o: {
  a: string; nomA?: string; sujet: string; texte: string; html: string;
  /* L'expéditeur affiché : Alexandre (par défaut), le CRM (ses alertes), ou
     l'agence seule (le mail du code : un nom neutre, qu'on reconnaît). */
  pj?: PieceJointe[]; deLaPartDe?: 'alexandre' | 'crm' | 'agence'; repondreA?: string;
}): Promise<string | null> {
  const apiKey = process.env.MAILJET_API_KEY, apiSecret = process.env.MAILJET_API_SECRET;
  if (!apiKey || !apiSecret) return 'Mailjet non configuré';
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  try {
    const r = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        Messages: [{
          From: { Email: FROM_EMAIL, Name: o.deLaPartDe === 'crm' ? 'Emilio · CRM' : o.deLaPartDe === 'agence' ? 'Emilio Immobilier' : FROM_NAME },
          To: [{ Email: o.a, ...(o.nomA ? { Name: o.nomA } : {}) }],
          ...(o.repondreA ? { ReplyTo: { Email: o.repondreA } } : {}),
          Subject: o.sujet,
          TextPart: o.texte,
          HTMLPart: o.html,
          ...(o.pj?.length ? { Attachments: o.pj.map(p => ({ ContentType: p.type, Filename: p.nom, Base64Content: p.base64 })) } : {}),
          TrackOpens: 'disabled', TrackClicks: 'disabled',
        }],
      }),
    });
    if (!r.ok) return `Mailjet ${r.status}`;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'envoi impossible';
  }
}

/* Le gabarit commun des mails courts (codes, mandat, signatures, alertes).
   V3.118 : l'enveloppe de la charte (src/lib/mail-charte.ts) — la bande bleue
   au logo Emilio, un filet orange, le titre, puis le texte. */
export function gabarit(titre: string, corpsHtml: string, pied = '') {
  return enveloppeMail({ titre: echappe(titre), corps: corpsHtml, pied });
}

export const ALERTES = () => process.env.ALERTES_EMAIL || FROM_EMAIL;
export const CRM = () => process.env.NEXT_PUBLIC_CRM_URL || 'https://crm.emilio-immo.com';

/* « iPhone · Safari », « Android · Chrome », « Mac · Chrome »… assez pour le
   certificat, sans prétendre à l'exactitude d'un vrai analyseur. */
export function appareilDe(ua: string): string {
  const u = String(ua || '');
  const os = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android'
    : /Mac OS X/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : /Linux/.test(u) ? 'Linux' : 'Appareil inconnu';
  const nav = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /SamsungBrowser/.test(u) ? 'Samsung Internet'
    : /CriOS|Chrome\//.test(u) ? 'Chrome' : /FxiOS|Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'navigateur inconnu';
  const v = u.match(/Version\/(\d+)/)?.[1] || u.match(/(?:Chrome|CriOS|Firefox|FxiOS|Edg)\/(\d+)/)?.[1];
  return `${os} · ${nav}${v ? ' ' + v : ''}`;
}

/* ══ Le client élargit sa recherche au-delà de son mandat signé ══════════
   Appelé quand il enregistre ses critères depuis son espace. On compare au
   mandat signé la recherche d'avant et celle d'après : seul un écart
   NOUVEAU prévient Alexandre — historique, relance du jour, mail. Le mandat
   signé, c'est celui en cours (V3.56 : choisi comme l'espace le choisit) :
   celui signé dans l'espace (son contenu figé), ou celui de la rubrique
   Documents (V3.55 : ses réponses —
   prix maximum, honoraires, secteurs, types de bien —, qu'il ait été signé
   à la main, en ligne ou sur place). Un mandat saisi à la main dans la fiche
   n'a ni l'un ni l'autre : rien à comparer. Ne lève jamais : une alerte
   ratée ne doit pas bloquer l'enregistrement des critères. */
export async function alerteHorsMandat(sb: SupabaseClient, o: {
  rechercheId: string; clientId: string; avant: Record<string, unknown>; apres: Record<string, unknown>;
}): Promise<void> {
  const [{ data: ligne, error }, { data: rech }] = await Promise.all([
    sb.from('mandats_signatures')
      .select('numero, signe_le, contenu').eq('recherche_id', o.rechercheId).in('statut', ['signe', 'partiel'])
      .order('signe_le', { ascending: false }).limit(1).maybeSingle(),
    /* Toute la ligne : `mandat_numero` n'existe qu'une fois le SQL du mandat passé. */
    sb.from('recherches').select('*').eq('id', o.rechercheId).maybeSingle(),
  ]);
  const numeroRecherche = rech && typeof (rech as { mandat_numero?: unknown }).mandat_numero === 'string'
    ? String((rech as { mandat_numero: string }).mandat_numero).trim() || null : null;
  const doc = await mandatDocumentSigne(sb, o.rechercheId, numeroRecherche).catch(() => null);
  type Signe = { numero: string; signeLe: string; contenu: Contenu; fin: number };
  const espace: Signe | null = !error && ligne?.contenu && ligne.signe_le && (ligne.contenu as Contenu).recherche && Number.isFinite(Date.parse(ligne.signe_le))
    ? { numero: String(ligne.numero ?? ''), signeLe: ligne.signe_le, contenu: ligne.contenu as Contenu, fin: Date.parse(ligne.signe_le) + DUREE.total * 86_400_000 }
    : null;
  const documents: Signe | null = doc && Number.isFinite(Date.parse(doc.signe_le))
    ? { numero: doc.numero || '', signeLe: doc.signe_le, contenu: contenuDocument(doc.donnees), fin: finDocument(doc.donnees, doc.signe_le) }
    : null;
  /* V3.56 : le mandat de référence est choisi comme l'espace choisit le
     mandat en cours (src/app/espace/[token]/page.tsx) : celui de Documents
     s'il porte le numéro noté sur la recherche — ou, sans numéro à comparer,
     s'il est au moins aussi récent que celui signé dans l'espace —, sinon
     celui signé dans l'espace. */
  let ref: Signe | null = espace;
  if (documents) {
    const courant = numeroRecherche && documents.numero
      ? memeNumero(numeroRecherche, documents.numero)
      : !espace || Date.parse(documents.signeLe) >= Date.parse(espace.signeLe);
    if (courant) ref = documents;
  }
  if (!ref) return;
  const sig = { numero: ref.numero || '—', signe_le: ref.signeLe };
  /* Les avenants signés à ce mandat déplacent ses limites (et sa fin). La
     table documents peut manquer : on compare alors au mandat seul.
     V3.56 : ceux de CE mandat seulement (son numéro). Un avenant à un autre
     mandat de la recherche — l'ancien, renouvelé depuis — ne le change pas. */
  const { data: avs } = await sb.from('documents').select('donnees')
    .eq('recherche_id', o.rechercheId).eq('modele', 'avenant_recherche').eq('statut', 'signe');
  const numeroRef = ref.numero;
  const avenants = (avs || []).map(a => (a.donnees || {}) as Record<string, unknown>)
    .filter(a => (numeroRef ? memeNumero(a.mandatNumero, numeroRef) : !String(a.mandatNumero ?? '').trim()));
  const finAvenant = avenants
    .filter(a => Array.isArray(a.objets) && (a.objets as unknown[]).includes('duree') && typeof a.finNouvelle === 'string')
    .map(a => Date.parse(`${a.finNouvelle}T23:59:59Z`)).filter(Number.isFinite);
  const fin = Math.max(Number.isFinite(ref.fin) ? ref.fin : 0, ...finAvenant);
  if (fin < Date.now()) return;
  const contenu = contenuApresAvenants(ref.contenu, avenants);
  const avant = horsMandat(contenu, rechercheDepuis(o.avant));
  const neufs = horsMandat(contenu, rechercheDepuis(o.apres)).filter(e => !avant.includes(e));
  if (!neufs.length) return;

  const { data: client } = await sb.from('clients').select('prenom, nom').eq('id', o.clientId).maybeSingle();
  const nom = client ? `${client.prenom || ''} ${client.nom || ''}`.trim() || 'Un client' : 'Un client';
  const signeLe = new Date(sig.signe_le).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  const lienCrm = `${CRM()}/?page=fiche&client=${encodeURIComponent(o.clientId)}`;
  const quoi = neufs.map(e => `⚠️ ${e}`).join('\n');

  const { error: eJ } = await sb.from('journal').insert({
    client_id: o.clientId, recherche_id: o.rechercheId, type: 'mandat',
    titre: '⚠️ Sa recherche dépasse son mandat signé',
    description: `Mandat n° ${sig.numero} signé le ${signeLe}. Il vient de modifier ses critères :\n${quoi}`,
    metadata: { numero: sig.numero, ecarts: neufs },
  });
  if (eJ) console.error('[mandat] alerte hors mandat, journal', eJ.message);
  /* Colonnes réelles de la table : date_echeance / note / statut. */
  const { error: eR } = await sb.from('relances').insert({
    client_id: o.clientId, recherche_id: o.rechercheId,
    type: 'rappel_client', statut: 'en_attente', date_echeance: new Date().toISOString(),
    note: `À rappeler : sa recherche dépasse son mandat n° ${sig.numero} (${neufs.join(' · ')}). Voir s'il faut un avenant.`.slice(0, 600),
  });
  if (eR) console.error('[mandat] alerte hors mandat, relance', eR.message);
  /* Coupé dans Paramètres → Alertes mail : la relance du jour suffit. */
  if (!(await alerteMailActive(sb, 'mandat_depasse'))) return;
  const eM = await envoyerMail({
    a: ALERTES(), deLaPartDe: 'crm',
    sujet: `⚠️ ${nom} : sa recherche dépasse son mandat (n° ${sig.numero})`,
    texte: `${nom} vient de modifier ses critères depuis son espace. Son mandat n° ${sig.numero}, signé le ${signeLe}, ne couvre peut-être plus toute sa recherche :\n${quoi}\n\nAppelle-le : s'il vise vraiment plus haut ou ailleurs, prépare-lui un avenant depuis sa fiche (Mandat de recherche › Préparer l'avenant) : ce qui a changé y est déjà coché.\n\n${lienCrm}`,
    html: gabarit(`${nom} : sa recherche dépasse son mandat`, `<p><b>${echappe(nom)}</b> vient de modifier ses critères depuis son espace. Son mandat <b>n° ${echappe(String(sig.numero))}</b>, signé le ${signeLe}, ne couvre peut-être plus toute sa recherche :</p>
      ${neufs.map(e => `<p style="color:#b45309">⚠️ ${echappe(e)}</p>`).join('')}
      <p>Appelle-le : s’il vise vraiment plus haut ou ailleurs, prépare-lui un avenant depuis sa fiche (Mandat de recherche › Préparer l’avenant) : ce qui a changé y est déjà coché.</p>
      <a href="${lienCrm}" style="display:inline-block;margin-top:8px;background:#E68B23;color:#13243D;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800">Ouvrir sa fiche</a>`),
  });
  if (eM) console.error('[mandat] alerte hors mandat, mail', eM);
}
