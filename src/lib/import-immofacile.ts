/* ═══ Importer depuis ImmoFacile (V3.61) ═══════════════════════════════════
   Alexandre quitte ImmoFacile (AC3). Plutôt que de payer la reprise, le CRM
   lit l'export « Contacts » d'ImmoFacile (un ou plusieurs .csv) et montre,
   avant d'écrire quoi que ce soit, ce qu'il va créer.

   Ce fichier ne touche à aucune base et ne dépend ni du navigateur ni du
   serveur (bancs d'essai, route, écran) :
     1. lire les fichiers : UTF-8 ou Windows-1252, « ; », champs entre
        guillemets sur plusieurs lignes, la table « actions_description »
        collée sous un export d'un seul contact (ignorée) ;
     2. regrouper une même personne présente deux fois (deux exports, ou
        « Propriétaire » dans l'un et « Demandeur » dans l'autre) ;
     3. traduire les colonnes en critères du CRM (« 2 à 3 » chambres,
        « 1 100 000 € maxi », « 92100 BOULOGNE BILLANCOURT ») ;
     4. valider ce que Claude a lu dans les commentaires (`lireLecture`,
        utilisé par la route ET par l'écran) ;
     5. décider ce qui sera créé (`planifier`) : les rôles, la recherche et
        ses critères cochés, « À savoir », le bien « À suivre », la ligne du
        Suivi ; et ce qui sera complété sur une fiche déjà dans le CRM
        (`completer`).
   Règle de fusion : les colonnes gagnent sur les valeurs structurées, le
   texte ajoute ce qui manque. Les dates d'ImmoFacile ne deviennent jamais des
   dates du CRM : elles sont citées dans le Suivi et dans « À savoir ».

   La lecture du texte : src/app/api/import-immofacile/route.ts.
   L'écriture : src/components/contacts/import-ecriture.ts. */

import type { CritForm, Niveau } from '@/components/shared/CriteresRecherche';
import { typeDe, type TypeContact } from '@/lib/contacts';
import type { SourceContact } from '@/lib/sources';
import { cleCommune } from '@/lib/communes';
import { ecrireMontant } from '@/lib/montant';

/* ══ 1. Le fichier ══════════════════════════════════════════════════════ */

/* Les caractères 0x80 à 0x9F de Windows-1252. Un export « UTF-8 »
   d'ImmoFacile contient le 0x80 de l'euro recopié tel quel (U+0080) : on le
   remet à sa place, et ses voisins avec lui. */
const CP1252: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};
export type Encodage = 'utf-8' | 'windows-1252';
export function decoder(octets: Uint8Array): { texte: string; encodage: Encodage } {
  let texte: string;
  let encodage: Encodage = 'utf-8';
  try { texte = new TextDecoder('utf-8', { fatal: true }).decode(octets); }
  catch { texte = new TextDecoder('windows-1252').decode(octets); encodage = 'windows-1252'; }
  texte = texte.replace(/^﻿/, '').replace(/[\u0080-\u009F]/g, c => CP1252[c.charCodeAt(0)] || '');
  return { texte, encodage };
}

/* Un CSV : séparateur, guillemets doublés, retours à la ligne dans un champ. */
export function lireCsv(texte: string, sep = ';'): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let entre = false;
  let commence = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entre) {
      if (c === '"') {
        if (texte[i + 1] === '"') { champ += '"'; i++; }
        else entre = false;
      } else champ += c;
      continue;
    }
    if (c === '"' && !commence) { entre = true; commence = true; continue; }
    if (c === sep) { ligne.push(champ); champ = ''; commence = false; continue; }
    if (c === '\r') continue;
    if (c === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; commence = false; continue; }
    champ += c; commence = true;
  }
  if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

/* Le séparateur : celui qui revient le plus sur la première ligne. */
function separateur(texte: string): string {
  const l = texte.slice(0, texte.indexOf('\n') > 0 ? texte.indexOf('\n') : 2000);
  const n = (s: string) => l.split(s).length;
  return n(';') >= n(',') && n(';') >= n('\t') ? ';' : n('\t') > n(',') ? '\t' : ',';
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const cleCol = (s: string) => sansAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();
/* Un champ d'une ligne : espaces resserrés. Un texte (commentaire) : les
   lignes gardées, les lignes vides réduites. */
export const net = (s: unknown) => String(s ?? '').replace(/[\s  ]+/g, ' ').trim();
export const netTexte = (s: unknown) => String(s ?? '').replace(/\r\n?/g, '\n').split('\n')
  .map(x => x.replace(/[ \t  ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();

/* Une recherche d'ImmoFacile, colonnes « … 1 », « … 2 »… */
export type RechIF = {
  n: number; precision: string; types: string; transaction: string; secteur: string; cpVilles: string;
  rayon: string; loyerHC: string; loyerCC: string; prix: string[]; pieces: string; chambres: string;
  surface: string; terrain: string; kelquartier: string;
};
/* Une ligne de l'export, telle quelle. */
export type FicheIF = {
  fichier: string; ligne: number;
  associes: string; genre: string; nom: string; prenom: string; suiviPar: string; statut: string; origine: string;
  creeLe: string; raisonSociale: string; telephones: string[]; email: string; adresse: string; cp: string; ville: string;
  residence: string; commentaire: string; situation: string; recherches: RechIF[];
  /* « Accepte les communications par email », « Accepte les propositions de
     biens » : « oui », « non » ou vide. */
  consentMail: string; consentBiens: string;
};
export type FichierLu = {
  nom: string; encodage: Encodage; fiches: FicheIF[];
  /* Les lignes laissées de côté : la table des actions d'un export d'un seul
     contact, les lignes sans nom ni moyen de contact. */
  ignorees: number;
  erreur?: string;
};

const BASES_RECHERCHE: Record<string, keyof Omit<RechIF, 'n' | 'prix'> | 'prix'> = {
  'precision': 'precision', 'type de bien': 'types', 'type de transaction': 'transaction', 'secteur': 'secteur',
  'c.p. ou ville': 'cpVilles', 'dans un rayon': 'rayon', 'loyer mensuel hc': 'loyerHC', 'loyer charges comprises': 'loyerCC',
  'prix': 'prix', 'nombre pieces': 'pieces', 'chambres': 'chambres', 'surface': 'surface', 'surface terrain': 'terrain',
  'kelquartier': 'kelquartier',
};

export function lireFichier(nom: string, octets: Uint8Array): FichierLu {
  const { texte, encodage } = decoder(octets);
  const lignes = lireCsv(texte, separateur(texte));
  const vide: FichierLu = { nom, encodage, fiches: [], ignorees: 0 };
  const iTete = lignes.findIndex(l => { const k = l.map(cleCol); return k.includes('nom') && k.includes('prenom') && (k.includes('statut') || k.includes('commentaires')); });
  if (iTete < 0) return { ...vide, erreur: 'Ce fichier ne ressemble pas à un export de contacts d’ImmoFacile (colonnes Nom, Prénom, Statut introuvables).' };
  const tete = lignes[iTete].map(cleCol);
  const col = (k: string) => tete.indexOf(k);
  const cols = (k: string) => tete.map((x, i) => (x === k ? i : -1)).filter(i => i >= 0);
  /* Les recherches : « Prix 1 », « Chambres 2 »… */
  const numeros = new Set<number>();
  tete.forEach(h => { const m = h.match(/^(.+?) (\d+)$/); if (m && BASES_RECHERCHE[m[1]]) numeros.add(Number(m[2])); });
  const v = (l: string[], i: number) => (i >= 0 && i < l.length ? l[i] : '');
  const fiches: FicheIF[] = [];
  let ignorees = 0;
  for (let i = iTete + 1; i < lignes.length; i++) {
    const l = lignes[i];
    if (!l.some(x => x.trim())) continue;
    /* La table des actions (« actions_description;Date ») : rien de ce qui
       suit n'est un contact. */
    if (cleCol(l[0] || '') === 'actions_description') { ignorees += lignes.slice(i).filter(x => x.some(y => y.trim())).length; break; }
    if (l.length < 4) { ignorees++; continue; }
    const tels = ['telephone', 'telephone2', 'telephone3', 'telephone4'].map(k => net(v(l, col(k)))).filter(Boolean);
    const f: FicheIF = {
      fichier: nom, ligne: i + 1,
      associes: net(v(l, col('contact(s) associe(s)'))), genre: net(v(l, col('genre'))), nom: net(v(l, col('nom'))), prenom: net(v(l, col('prenom'))),
      suiviPar: net(v(l, col('suivi par'))), statut: net(v(l, col('statut'))), origine: net(v(l, col('origine'))),
      creeLe: net(v(l, col('cree le'))), raisonSociale: net(v(l, col('raison sociale'))), telephones: tels,
      email: net(v(l, col('email'))).toLowerCase(), adresse: net(v(l, col('adresse'))), cp: net(v(l, col('code postal'))),
      ville: net(v(l, col('ville'))), residence: net(v(l, col('residence'))), commentaire: netTexte(v(l, col('commentaires'))),
      situation: net(v(l, col('situation'))), recherches: [],
      consentMail: net(v(l, col('accepte les communications par email'))).toLowerCase(),
      consentBiens: net(v(l, col('accepte les propositions de biens'))).toLowerCase(),
    };
    for (const n of [...numeros].sort((a, b) => a - b)) {
      const r: RechIF = { n, precision: '', types: '', transaction: '', secteur: '', cpVilles: '', rayon: '', loyerHC: '', loyerCC: '', prix: [], pieces: '', chambres: '', surface: '', terrain: '', kelquartier: '' };
      for (const [base, cle] of Object.entries(BASES_RECHERCHE)) {
        const idx = cols(`${base} ${n}`);
        if (cle === 'prix') { r.prix = idx.map(k => net(v(l, k))).filter(Boolean); continue; }
        const val = idx.map(k => (cle === 'precision' ? netTexte(v(l, k)) : net(v(l, k)))).find(Boolean) || '';
        (r as Record<string, unknown>)[cle] = val;
      }
      if (r.precision || r.types || r.secteur || r.cpVilles || r.prix.length || r.pieces || r.chambres || r.surface || r.terrain || r.loyerHC || r.loyerCC || r.kelquartier) f.recherches.push(r);
    }
    if (!f.nom && !f.prenom && !f.raisonSociale && !f.email && !f.telephones.length) { ignorees++; continue; }
    fiches.push(f);
  }
  return { nom, encodage, fiches, ignorees };
}

/* ══ 2. Les noms, téléphones, adresses ═════════════════════════════════ */

/* « DUPONT » → « Dupont », « LE GALL » → « Le Gall », « jean-paul » → « Jean-Paul ».
   Un nom déjà écrit avec ses majuscules reste tel quel. */
export function beauNom(s: string): string {
  const t = net(s);
  if (!t || (t !== t.toUpperCase() && t !== t.toLowerCase())) return t;
  return t.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}
export const finTel = (t: unknown) => String(t ?? '').replace(/\D/g, '').slice(-9);
export function beauTel(s: string): string {
  const t = net(s);
  const d = t.replace(/[^\d+]/g, '').replace(/^00/, '+');
  if (/^0\d{9}$/.test(d)) return d.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  if (/^\+33\d{9}$/.test(d)) return `+33 ${d.slice(3, 4)} ${d.slice(4).replace(/(\d{2})(?=\d)/g, '$1 ').trim()}`;
  return t;
}
const mailValide = (m: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m);
export const nomNet = (p?: string | null, n?: string | null) => sansAccents(`${p || ''} ${n || ''}`).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* « M. », « Mme » → la civilité du CRM. « M. et Mme », « MM. » : rien (une
   ligne dans « À savoir »). */
function civiliteDe(g: string): 'Monsieur' | 'Madame' | '' {
  const k = cleCol(g).replace(/\.$/, '');
  if (['m', 'mr', 'monsieur'].includes(k)) return 'Monsieur';
  if (['mme', 'mlle', 'madame', 'mademoiselle', 'mlle.'].includes(k)) return 'Madame';
  return '';
}

/* « Suivi par » : « ROGELET Alexandre » → « Alexandre Rogelet ». */
function nomConseiller(s: string): string {
  const mots = net(s).split(' ').filter(Boolean);
  const nom = mots.filter(m => m.length > 1 && m === m.toUpperCase() && /\p{L}/u.test(m));
  const prenom = mots.filter(m => !nom.includes(m));
  return nom.length && prenom.length ? `${prenom.join(' ')} ${beauNom(nom.join(' '))}` : beauNom(s);
}

/* ══ 3. Les secteurs ═══════════════════════════════════════════════════ */

/* Les 36 communes des Hauts-de-Seine, avec leur code postal principal :
   le nom tel que le CRM l'écrit (SecteurPicker, lib/secteurs.ts). */
const COMMUNES_92: [string, string][] = [
  ['92160', 'Antony'], ['92600', 'Asnières-sur-Seine'], ['92220', 'Bagneux'], ['92270', 'Bois-Colombes'],
  ['92100', 'Boulogne-Billancourt'], ['92340', 'Bourg-la-Reine'], ['92290', 'Châtenay-Malabry'], ['92320', 'Châtillon'],
  ['92370', 'Chaville'], ['92140', 'Clamart'], ['92110', 'Clichy'], ['92700', 'Colombes'], ['92400', 'Courbevoie'],
  ['92260', 'Fontenay-aux-Roses'], ['92380', 'Garches'], ['92250', 'La Garenne-Colombes'], ['92230', 'Gennevilliers'],
  ['92130', 'Issy-les-Moulineaux'], ['92300', 'Levallois-Perret'], ['92240', 'Malakoff'], ['92430', 'Marnes-la-Coquette'],
  ['92190', 'Meudon'], ['92120', 'Montrouge'], ['92000', 'Nanterre'], ['92200', 'Neuilly-sur-Seine'],
  ['92350', 'Le Plessis-Robinson'], ['92800', 'Puteaux'], ['92500', 'Rueil-Malmaison'], ['92210', 'Saint-Cloud'],
  ['92330', 'Sceaux'], ['92310', 'Sèvres'], ['92150', 'Suresnes'], ['92170', 'Vanves'], ['92420', 'Vaucresson'],
  ['92410', 'Ville-d’Avray'], ['92390', 'Villeneuve-la-Garenne'],
];
const PAR_CP: Record<string, string> = { ...Object.fromEntries(COMMUNES_92), '92360': 'Meudon' };
const PAR_CLE: Record<string, string> = Object.fromEntries(COMMUNES_92.map(([, n]) => [cleCommune(n), n]));
/* « Paris 16ème » : l'écriture des secteurs déjà enregistrés (lib/secteurs.ts). */
const arrondissement = (n: number) => `Paris ${n}${n === 1 ? 'er' : 'ème'}`;

/* Un secteur tel qu'ImmoFacile l'écrit (« 92100 BOULOGNE BILLANCOURT »,
   « 75016 PARIS ») ou tel que Claude l'a lu (« Paris 15e », « Issy ») → le
   nom du CRM, ou null s'il n'est pas dans le secteur couvert. */
export function secteurDe(brut: string): string | null {
  const t = net(brut);
  if (!t) return null;
  const cp = (t.match(/\b(\d{5})\b/) || [])[1] || '';
  const reste = net(t.replace(/\b\d{5}\b/, ''));
  const k = cleCommune(reste);
  if (/^75\d{3}$/.test(cp) && (!reste || /^paris/.test(k))) {
    const n = cp === '75116' ? 16 : Number(cp.slice(3));
    return n >= 1 && n <= 20 ? arrondissement(n) : null;
  }
  const p = k.match(/^paris(\d{1,2})$/);
  if (p && Number(p[1]) >= 1 && Number(p[1]) <= 20) return arrondissement(Number(p[1]));
  if (PAR_CLE[k]) return PAR_CLE[k];
  if (cp && PAR_CP[cp] && (!reste || cleCommune(PAR_CP[cp]).startsWith(k.slice(0, 4)))) return PAR_CP[cp];
  /* « Boulogne », « Issy » : le début d'un seul nom. */
  if (k.length >= 4 && k !== 'paris') {
    const l = Object.keys(PAR_CLE).filter(x => x.startsWith(k));
    if (l.length === 1) return PAR_CLE[l[0]];
  }
  return null;
}
/* Une ville pour une adresse : le nom du CRM si on le connaît. */
function beauVille(ville: string, cp: string): string {
  if (/^75\d{3}$/.test(cp) && /^paris/i.test(sansAccents(ville))) return 'Paris';
  return secteurDe(`${cp} ${ville}`) || beauNom(ville);
}

/* ══ 4. D'où vient le contact (lib/sources.ts) ═════════════════════════ */

const PLATEFORMES: [RegExp, string][] = [
  [/se ?loger/, 'SeLoger'], [/jinka/, 'Jinka'], [/leboncoin|bon coin/, 'Leboncoin'], [/bien.?ici/, 'Bien’ici'],
  [/logic.?immo/, 'Logic-Immo'], [/\bpap\b|particulier a particulier/, 'PAP'], [/figaro/, 'Figaro Immobilier'],
  [/belles? demeures?/, 'Belles Demeures'], [/avendrealouer|a vendre a louer/, 'AVendreALouer'], [/explorimmo/, 'Explorimmo'],
  [/green ?acres/, 'Green-Acres'], [/meilleurs ?agents/, 'MeilleursAgents'], [/superimmo/, 'Superimmo'], [/ouestfrance|ouest france/, 'Ouest-France Immo'],
];
export function sourceDepuis(origine: string): { k: SourceContact; detail: string } | null {
  const o = net(origine);
  if (!o) return null;
  const k = sansAccents(o).toLowerCase();
  const pf = PLATEFORMES.find(([re]) => re.test(k));
  if (/zecible|ze cible/.test(k)) return { k: 'zecible', detail: '' };
  if (/maline/.test(k)) return { k: 'maline', detail: '' };
  if (pf) return { k: 'plateforme', detail: pf[1] };
  if (/recommand|parrain|bouche/.test(k)) return { k: 'recommandation', detail: '' };
  if (/ancien client/.test(k)) return { k: 'ancien_client', detail: '' };
  if (/relation/.test(k)) return { k: 'relationnel', detail: '' };
  if (/pige/.test(k)) return { k: 'pige', detail: '' };
  if (/boitage|flyer|prospectus/.test(k)) return { k: 'boitage', detail: '' };
  if (/panneau|vitrine|affiche/.test(k)) return { k: 'panneau', detail: '' };
  if (/facebook|instagram|linkedin|reseau|tiktok/.test(k)) return { k: 'reseaux', detail: '' };
  /* « site », pas « visite » ; « appel », pas « rappel ». */
  if (/\bsite\b|internet|estimation en ligne|\bweb\b/.test(k)) return { k: 'site', detail: '' };
  if (/\bappel|\btelephone|tel entrant/.test(k)) return { k: 'appel_entrant', detail: '' };
  return { k: 'autre', detail: o.slice(0, 80) };
}
/* L'origine telle qu'on la montre (« Prospection - ZECIBLE » → « ZeCible »). */
export function libelleOrigine(origine: string): string {
  const s = sourceDepuis(origine);
  if (!s) return '';
  if (s.k === 'plateforme') return s.detail;
  if (s.k === 'zecible') return 'ZeCible';
  if (s.k === 'autre') return s.detail;
  return net(origine).replace(/\s*\(.*\)$/, '');
}

/* ══ 5. Les colonnes d'une recherche ═══════════════════════════════════ */

export type RechCols = {
  n: number; achat: boolean; location: boolean;
  types: string[]; budgetMin: number | null; budgetMax: number | null;
  surfaceMin: number | null; surfaceMax: number | null; piecesMin: number | null; piecesMax: number | null;
  chambresMin: number | null;
  /* Ce qui n'a pas de case dans le CRM, à écrire dans les précisions. */
  lignes: string[];
  secteurs: string[]; inconnus: string[];
  precision: string;
  /* Au moins un critère rempli dans les colonnes. */
  rempli: boolean;
  /* Pour « Dans ImmoFacile » : les critères en une phrase. */
  resume: string;
};

/* « Propriété », « Hôtel particulier » : des maisons, pour le CRM. */
const TYPES_CRM: [RegExp, string][] = [
  [/^appart/, 'Appartement'], [/^maison|^villa|^pavillon|^propriete|^hotel particulier|^longere|^corps de ferme/, 'Maison'],
  [/^loft/, 'Loft'], [/^duplex|^triplex/, 'Duplex'], [/^terrain/, 'Terrain'],
];
function typesDe(s: string): { types: string[]; lignes: string[] } {
  const types: string[] = []; const lignes: string[] = [];
  for (const brut of s.split(/[,/]| ou /).map(net).filter(Boolean)) {
    const k = sansAccents(brut).toLowerCase();
    const t = TYPES_CRM.find(([re]) => re.test(k));
    if (t) { if (!types.includes(t[1])) types.push(t[1]); continue; }
    if (/^studio/.test(k)) { if (!types.includes('Appartement')) types.push('Appartement'); lignes.push('Studio accepté.'); continue; }
    if (!types.includes('Autre')) types.push('Autre');
    lignes.push(`Type de bien : ${brut.toLowerCase()}.`);
  }
  return { types, lignes };
}
/* Les nombres d'une valeur d'ImmoFacile : « 1 100 000 € maxi », « 3 à 4 »,
   « 40 m2 à 120 m2 ». Le « 2 » de « m2 » n'en est pas un. */
function nombres(s: string): number[] {
  return [...s.replace(/m\s*[2²]/gi, ' ').matchAll(/\d[\d   .]*\d|\d/g)]
    .map(m => parseInt(m[0].replace(/\D/g, ''), 10)).filter(Number.isFinite);
}
/* Les montants d'un prix : « 1 100 000 € maxi », « 1.100.000 », « 850K »,
   « 850 K€ », « 1 100K », « 1,1 M€ », « 1.2 millions ». Un nombre sans unité
   sous 10 000 n'est pas un prix : il tombe (un « 850 » tout seul serait-il
   850 000 € ? on ne devine pas). */
export function montants(s: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:[\s\u00a0\u202f.]\d{3})+|\d+)(?:[,.](\d{1,2})(?!\d))?\s*(k\s*€?|ke\b|m\s*€|m\b|millions?\b|mill?\b)?/gi;
  for (const m of s.matchAll(re)) {
    const entier = Number(m[1].replace(/\D/g, ''));
    const n = Number(`${entier}.${m[2] || '0'}`);
    const u = (m[3] || '').toLowerCase().replace(/\s/g, '');
    const v = /^k/.test(u) ? n * 1000 : /^m/.test(u) ? n * 1000000 : n;
    if (Number.isFinite(v) && v >= 10000) out.push(Math.round(v));
  }
  return out;
}
/* Une borne : « mini » → min, « maxi » → max, « a à b » → les deux. Sans mot,
   `seul` dit ce que vaut un nombre unique. */
function bornes(s: string, seul: 'min' | 'max', lire: (x: string) => number[] = nombres): { min: number | null; max: number | null } {
  const l = lire(s);
  if (!l.length) return { min: null, max: null };
  if (l.length >= 2 && /(^|\s)(à|a|au)(\s|$)|-|entre/i.test(s)) return { min: Math.min(l[0], l[1]), max: Math.max(l[0], l[1]) };
  if (/mini|minimum|\bmin\b|au moins|partir/i.test(s)) return { min: l[0], max: null };
  if (/maxi|maximum|\bmax\b|jusqu/i.test(s)) return { min: null, max: l[0] };
  return seul === 'min' ? { min: l[0], max: null } : { min: null, max: l[0] };
}

export function rechercheDesColonnes(r: RechIF): RechCols {
  const tr = sansAccents(r.transaction).toLowerCase();
  const location = /louer|location/.test(tr) || (!tr && !!(r.loyerHC || r.loyerCC) && !r.prix.length);
  const { types, lignes } = typesDe(r.types);
  let budgetMin: number | null = null, budgetMax: number | null = null;
  for (const p of r.prix) {
    const b = bornes(p, 'max', montants);
    if (b.min !== null) budgetMin = budgetMin === null ? b.min : Math.min(budgetMin, b.min);
    if (b.max !== null) budgetMax = budgetMax === null ? b.max : Math.max(budgetMax, b.max);
  }
  const su = bornes(r.surface, 'min');
  const pi = bornes(r.pieces, 'min');
  const ch = bornes(r.chambres, 'min');
  /* Le CRM n'a que « chambres min » : « 2 à 3 » donne 2, et la phrase va
     dans les précisions. */
  if (ch.min !== null && ch.max !== null && ch.max !== ch.min) lignes.push(`${ch.min} à ${ch.max} chambres.`);
  if (ch.min === null && ch.max !== null) lignes.push(`${ch.max} chambre${ch.max > 1 ? 's' : ''} au plus.`);
  const secteurs: string[] = []; const inconnus: string[] = [];
  for (const s of [...r.cpVilles.split(','), ...r.secteur.split(',')].map(net).filter(Boolean)) {
    const x = secteurDe(s);
    if (x) { if (!secteurs.includes(x)) secteurs.push(x); }
    else if (!inconnus.includes(s)) inconnus.push(s);
  }
  if (inconnus.length) lignes.push(`Secteur : ${inconnus.map(beauNom).join(', ')}.`);
  if (r.rayon) lignes.push(`Dans un rayon de ${r.rayon.replace(/^dans un rayon de\s*/i, '')}.`);
  if (r.kelquartier) lignes.push(`Quartier : ${r.kelquartier}.`);
  if (r.terrain) {
    const t = bornes(r.terrain, 'min');
    if (t.min !== null || t.max !== null) lignes.push(t.min !== null ? `Terrain d’au moins ${ecrireMontant(t.min, ' m²')}.` : `Terrain de ${ecrireMontant(t.max, ' m²')} au plus.`);
  }
  const rempli = !!(types.length || budgetMin || budgetMax || su.min || su.max || pi.min || pi.max || ch.min || ch.max || secteurs.length || inconnus.length);
  const resume = [
    r.transaction && `${r.transaction}`, r.types, r.cpVilles || r.secteur,
    r.pieces && `${r.pieces.trim()} pièces`, r.chambres && `${r.chambres.trim()} chambres`, r.surface && r.surface.trim().replace(/m2/g, 'm²'),
    r.prix[0] && r.prix[0].trim(), r.loyerHC && `loyer ${r.loyerHC}`,
  ].filter(Boolean).join(' · ');
  return {
    n: r.n, achat: !location && rempli, location,
    types, budgetMin, budgetMax, surfaceMin: su.min, surfaceMax: su.max,
    piecesMin: pi.min, piecesMax: pi.max, chambresMin: ch.min,
    lignes, secteurs, inconnus, precision: r.precision, rempli, resume,
  };
}

/* ══ 6. Les contacts, une personne une fois ════════════════════════════ */

export type Contact = {
  cle: string;
  lignes: { fichier: string; ligne: number }[];
  genre: string; civilite: 'Monsieur' | 'Madame' | '';
  prenom: string; nom: string; raisonSociale: string;
  telephones: string[]; emails: string[];
  adresse: string; residence: string; associes: string[];
  /* L'adresse en morceaux, pour le bien « À suivre » quand le texte n'en donne pas. */
  adr: { rue: string; cp: string; ville: string };
  statuts: string[]; origines: string[];
  creeLe: string | null; suiviPar: string;
  commentaires: string[];
  recherches: RechCols[];
  /* Ce qu'il a refusé dans ImmoFacile (« les e-mails », « les propositions
     de biens ») : il ne passe pas « Actif » tout seul. */
  refus: string[];
  /* Un e-mail d'ImmoFacile qui n'en est pas un (« jean.dupont@gmail », une
     virgule) : gardé dans « À savoir », pas dans ses e-mails. */
  mailsInvalides: string[];
  /* Ce que le regroupement a remarqué (même téléphone qu'un autre, sous un
     autre nom) : « À vérifier ». */
  aVoir: string[];
  /* Le téléphone ou l'e-mail de l'agence, recopié sur plusieurs fiches :
     pas repris dans ses coordonnées, cité dans « À savoir ». */
  communs: string[];
};

/* « 18/09/2026 » → « 2026-09-18 ». */
export function dateImmo(s: string): string | null {
  const m = net(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return /^\d{4}-\d\d-\d\d/.test(s) ? s.slice(0, 10) : null;
  const d = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return dateValide(d) ? d : null;
}
export const dateValide = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d\d-\d\d$/.test(d)
  && !Number.isNaN(Date.parse(`${d}T12:00:00`)) && new Date(`${d}T12:00:00`).toISOString().slice(0, 10) === d;

/* Une case « Email » : une adresse, ou deux séparées par une virgule. */
const mailsDe = (s: string) => s.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
function contactDe(f: FicheIF): Contact {
  const cp = f.cp.replace(/\s/g, '');
  const rue = net(f.adresse);
  const ville = f.ville ? beauVille(f.ville, cp) : '';
  const adresse = [rue, [cp, ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const prenom = beauNom(f.prenom);
  const nom = beauNom(f.nom) || (!prenom ? f.raisonSociale : '');
  return {
    cle: `${f.fichier}#${f.ligne}`, lignes: [{ fichier: f.fichier, ligne: f.ligne }],
    genre: f.genre, civilite: civiliteDe(f.genre), prenom, nom, raisonSociale: nom === f.raisonSociale ? '' : f.raisonSociale,
    telephones: f.telephones.filter(t => !telBidon(t)).map(beauTel), emails: mailsDe(f.email).filter(mailValide),
    adresse, residence: f.residence, associes: f.associes ? [f.associes] : [],
    adr: { rue, cp, ville },
    statuts: f.statut ? [f.statut] : [], origines: f.origine ? [f.origine] : [],
    creeLe: dateImmo(f.creeLe), suiviPar: f.suiviPar ? nomConseiller(f.suiviPar) : '',
    commentaires: f.commentaire ? [f.commentaire] : [],
    recherches: f.recherches.map(rechercheDesColonnes),
    refus: [f.consentMail === 'non' ? 'les e-mails' : '', f.consentBiens === 'non' ? 'les propositions de biens' : ''].filter(Boolean),
    mailsInvalides: mailsDe(f.email).filter(m => !mailValide(m)),
    aVoir: [],
    communs: [],
  };
}
const ajouter = <T>(l: T[], x: T[], cle: (v: T) => string = v => String(v)) => {
  for (const v of x) if (!l.some(y => cle(y) === cle(v))) l.push(v);
};
/* Un numéro qui n'en est pas un : « 06 00 00 00 00 », « 06 06 06 06 06 »,
   « 06 12 34 56 78 ». (« 01 45 45 45 45 » peut exister : il reste.) */
export function telBidon(t: string): boolean {
  const d = finTel(t);
  if (d.length < 9) return false;
  const dix = `0${d}`;
  return new Set(d.slice(1)).size === 1 || dix === dix.slice(0, 2).repeat(5) || '0123456789'.includes(d.slice(1)) || '9876543210'.includes(d.slice(1));
}
/* Deux noms complets (prénom et nom) qui ne désignent pas la même personne. */
export function nomsDifferents(a: { prenom?: string | null; nom?: string | null }, b: { prenom?: string | null; nom?: string | null }): boolean {
  if (!net(a.prenom) || !net(a.nom) || !net(b.prenom) || !net(b.nom)) return false;
  const na = nomNet(a.prenom, a.nom);
  return na !== nomNet(b.prenom, b.nom) && na !== nomNet(b.nom, b.prenom);
}
/* Ce qui sert à reconnaître une personne, sans ce qui est partagé : le
   téléphone ou l'e-mail de l'agence recopié sur plusieurs fiches. */
type Communs = { tels: Set<string>; mails: Set<string> };
const sesTels = (c: Contact, x: Communs) => c.telephones.map(finTel).filter(t => t.length === 9 && !x.tels.has(t));
const sesMails = (c: Contact, x: Communs) => c.emails.filter(m => !x.mails.has(m));
function fondre(a: Contact, b: Contact): void {
  a.lignes.push(...b.lignes);
  if (!a.civilite && b.civilite) { a.civilite = b.civilite; a.genre = b.genre; }
  if (!a.prenom && b.prenom) a.prenom = b.prenom;
  if (!a.nom && b.nom) a.nom = b.nom;
  if (!a.raisonSociale) a.raisonSociale = b.raisonSociale;
  ajouter(a.telephones, b.telephones, finTel);
  ajouter(a.emails, b.emails);
  if (!a.adresse) { a.adresse = b.adresse; a.adr = b.adr; }
  if (!a.residence) a.residence = b.residence;
  ajouter(a.associes, b.associes);
  ajouter(a.statuts, b.statuts);
  ajouter(a.origines, b.origines);
  if (b.creeLe && (!a.creeLe || b.creeLe < a.creeLe)) a.creeLe = b.creeLe;
  if (!a.suiviPar) a.suiviPar = b.suiviPar;
  ajouter(a.commentaires, b.commentaires, c => net(c));
  ajouter(a.recherches, b.recherches, r => JSON.stringify({ ...r, n: 0 }));
  ajouter(a.refus, b.refus);
  ajouter(a.mailsInvalides, b.mailsInvalides);
  ajouter(a.aVoir, b.aVoir);
  ajouter(a.communs, b.communs);
}
export type Regroupement = { contacts: Contact[]; fiches: number; fusionnes: number };
export function regrouper(fichiers: FichierLu[]): Regroupement {
  const lus = fichiers.flatMap(f => f.fiches.map(contactDe));
  /* Un téléphone ou un e-mail présent sous trois noms différents ou plus :
     celui de l'agence, ou un numéro de standard. Il ne relie personne. */
  const noms = new Map<string, Set<string>>();
  const note = (k: string, n: string) => { if (!noms.has(k)) noms.set(k, new Set()); noms.get(k)!.add(n); };
  for (const c of lus) {
    /* Une ligne sans nom ne compte pas : trois lignes sans nom avec le même
       e-mail sont la même personne, pas l'agence. */
    const n = nomNet(c.prenom, c.nom);
    if (!n) continue;
    c.telephones.map(finTel).filter(t => t.length === 9).forEach(t => note(`t:${t}`, n));
    c.emails.forEach(m => note(`m:${m}`, n));
  }
  const communs: Communs = { tels: new Set(), mails: new Set() };
  for (const [k, l] of noms) if (l.size >= 3) (k.startsWith('t:') ? communs.tels : communs.mails).add(k.slice(2));
  /* Ce numéro ou cet e-mail n'est pas le sien : il n'entre pas dans ses
     coordonnées (il relierait plus tard n'importe qui à n'importe qui). */
  for (const c of lus) {
    const t = c.telephones.filter(x => communs.tels.has(finTel(x)));
    const m = c.emails.filter(x => communs.mails.has(x));
    if (!t.length && !m.length) continue;
    c.telephones = c.telephones.filter(x => !t.includes(x));
    c.emails = c.emails.filter(x => !m.includes(x));
    c.communs.push(...t, ...m);
  }
  /* La même personne : même prénom et nom (dans un sens ou dans l'autre),
     ou même e-mail, ou même téléphone (9 derniers chiffres). Deux noms
     complets différents ne se fondent jamais : un couple qui partage un fixe
     ou une adresse e-mail reste deux fiches (« À vérifier » le dit). Les
     contacts déjà vus sont rangés par nom, e-mail et téléphone : pas de
     comparaison de chacun avec tous (un export de plusieurs centaines). */
  const contacts: Contact[] = [];
  const parNom = new Map<string, Contact>();
  const parCle = new Map<string, Set<Contact>>();
  const ranger = (y: Contact) => {
    const n = nomNet(y.prenom, y.nom);
    if (n.includes(' ') && !parNom.has(n)) parNom.set(n, y);
    for (const k of [...sesMails(y, communs).map(m => `m:${m}`), ...sesTels(y, communs).map(t => `t:${t}`)]) {
      if (!parCle.has(k)) parCle.set(k, new Set());
      parCle.get(k)!.add(y);
    }
  };
  const qui = (z: Contact) => [z.prenom, z.nom].filter(Boolean).join(' ');
  let fusionnes = 0;
  for (const c of lus) {
    const n = nomNet(c.prenom, c.nom);
    let deja: Contact | null = n.includes(' ') ? parNom.get(n) || parNom.get(nomNet(c.nom, c.prenom)) || null : null;
    if (!deja) {
      const vus = new Set<Contact>();
      for (const k of [...sesMails(c, communs).map(m => `m:${m}`), ...sesTels(c, communs).map(t => `t:${t}`)]) parCle.get(k)?.forEach(y => vus.add(y));
      for (const y of [...vus].sort((u, v) => contacts.indexOf(u) - contacts.indexOf(v))) {
        if (!nomsDifferents(y, c)) { deja = y; break; }
        y.aVoir.push(`Même téléphone ou e-mail que ${qui(c)} dans le fichier : deux fiches séparées.`);
        c.aVoir.push(`Même téléphone ou e-mail que ${qui(y)} dans le fichier : deux fiches séparées.`);
      }
    }
    if (deja) { fondre(deja, c); fusionnes++; ranger(deja); } else { contacts.push(c); ranger(c); }
  }
  /* Des clés neutres : ni nom de fichier (un export d'un seul contact porte
     parfois son nom), ni numéro de ligne, et jamais deux fois la même, même
     avec deux fichiers du même nom. */
  contacts.forEach((c, i) => { c.cle = `k${i + 1}`; });
  return { contacts, fiches: lus.length, fusionnes };
}

/* ══ 7. Ce que Claude lit dans le texte ════════════════════════════════ */

/* Ce que l'écran envoie à la route : ni nom, ni téléphone, ni e-mail. */
export type DemandeLecture = { cle: string; statut: string; creeLe: string | null; criteres: string; precisions: string[]; commentaire: string };
/* Un texte trop long pour une lecture : le début et la fin (les notes les
   plus récentes peuvent être d'un côté ou de l'autre). Le texte entier, lui,
   va toujours dans « À savoir ». */
export const LONG_MAX = 6000;
export function couper(t: string, max = LONG_MAX): string {
  if (t.length <= max) return t;
  const tete = Math.floor(max / 3);
  return `${t.slice(0, tete)}\n[…]\n${t.slice(t.length - (max - tete - 5))}`;
}
export function demandeLecture(c: Contact): DemandeLecture | null {
  const precisions = c.recherches.map(r => r.precision).filter(Boolean).slice(0, 3).map(p => couper(p, 2000));
  const commentaire = couper(c.commentaires.join('\n\n'));
  if (!precisions.length && !commentaire) return null;
  return {
    cle: c.cle, statut: c.statuts.join(' et ') || 'non précisé', creeLe: c.creeLe,
    criteres: c.recherches.map(r => r.resume).filter(Boolean).join(' | ').slice(0, 800) || 'aucun',
    precisions, commentaire,
  };
}

export const CLES_EQUIP = ['parking', 'cave', 'balcon', 'terrasse', 'jardin', 'gardien', 'interphone', 'digicode', 'exterieur', 'ascenseur'] as const;
export type CleEquip = typeof CLES_EQUIP[number];
const NIVEAUX = ['souhaite', 'indispensable'] as const;
const EXPOS = ['sud', 'est', 'ouest', 'nord', 'traversant'] as const;
const ETATS = ['a_renover', 'travaux_legers', 'bon_etat', 'refait_neuf'] as const;
const FINANCEMENTS = ['cash', 'pret_valide', 'pret_en_cours', 'a_monter', 'pret_relais', 'mixte_cash_pret', 'mixte_cash_relais', 'mixte_pret_relais'] as const;
const URGENCES = ['immediate', '3_mois', '6_mois', 'annee'] as const;
const TYPES_RECH = ['Appartement', 'Maison', 'Loft', 'Duplex', 'Terrain', 'Autre'] as const;
const PROJETS = ['aucun', 'apres_achat', 'projet', 'ailleurs', 'vendu'] as const;
export const TYPES_BIEN_VENTE = ['appartement', 'maison', 'duplex', 'studio', 'loft', 'terrain', 'local', 'parking', 'immeuble', 'autre'] as const;

export type LectureRecherche = {
  types: string[]; budgetMin: number | null; budgetMax: number | null;
  surfaceMin: number | null; surfaceMax: number | null; piecesMin: number | null; piecesMax: number | null;
  chambresMin: number | null; secteurs: string[];
  equipements: { cle: CleEquip; niveau: 'souhaite' | 'indispensable' }[];
  rdcExclu: boolean; dernierEtage: boolean; etageMin: number | null; etageMax: number | null; etageMaxSansAscenseur: number | null;
  cuisine: 'ouverte' | 'separee' | null; cuisineNiveau: 'souhaite' | 'indispensable' | null;
  exposition: string[]; etat: string[]; sejourMin: number | null; exterieurMin: number | null; anneeMin: number | null;
  financement: string | null; urgence: string | null; precisions: string[];
};
export type Lecture = {
  cle: string;
  recherche: LectureRecherche | null;
  location: string | null;
  proprietaire: boolean;
  bien: null | {
    type: string | null; surface: number | null; pieces: number | null; chambres: number | null; etage: number | null;
    adresse: string | null; codePostal: string | null; ville: string | null; valeur: number | null; resume: string; notes: string;
  };
  vente: { projet: typeof PROJETS[number]; aSuivre: boolean; rappel: { date: string | null; mois: number | null; annee: number | null; texte: string | null } };
  aSavoir: string[];
  emails: string[]; telephones: string[];
};

const O = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const nb = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(/[\s  €]/g, '').replace(',', '.')) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
};
const tx = (v: unknown, max: number) => (typeof v === 'string' ? net(v).slice(0, max) : '');
/* Une liste rendue par Claude : un tableau, ou (V3.62) une seule chaîne qu'on
   découpe — « "precisions": "Box fermé. Calme." » faisait tout tomber, et la
   fiche arrivait sans ses précisions ni ses lignes « À savoir ». */
const PHRASES = /\n+|(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ«"])/;
const ELEMENTS = /[\n;,]+/;
const liste = (v: unknown, sep: RegExp): unknown[] => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? v.split(sep) : []);
const lst = (v: unknown, max: number, long: number, sep: RegExp = ELEMENTS) => liste(v, sep).map(x => tx(x, long).replace(/^[-–•*]\s*/, '')).filter(Boolean).slice(0, max);
function parmi<T extends string>(v: unknown, ok: readonly T[]): T | null {
  return typeof v === 'string' && (ok as readonly string[]).includes(v) ? v as T : null;
}
const parmiListe = <T extends string>(v: unknown, ok: readonly T[]): T[] => [...new Set(liste(v, /[\s,;|/]+/).map(x => parmi(typeof x === 'string' ? x.trim() : x, ok)).filter((x): x is T => !!x))];
const vrai = (v: unknown) => v === true || v === 'true';

/* Une recherche rendue sans rien dedans (« recherche: {} ») n'en est pas
   une : sinon un propriétaire deviendrait acheteur. */
function rechercheVide(r: LectureRecherche): boolean {
  return !r.types.length && !r.secteurs.length && !r.equipements.length && !r.exposition.length && !r.etat.length && !r.precisions.length
    && !r.rdcExclu && !r.dernierEtage && !r.cuisine && !r.financement && !r.urgence
    && [r.budgetMin, r.budgetMax, r.surfaceMin, r.surfaceMax, r.piecesMin, r.piecesMax, r.chambresMin, r.etageMin, r.etageMax,
      r.etageMaxSansAscenseur, r.sejourMin, r.exterieurMin, r.anneeMin].every(v => v === null);
}

/* La réponse de Claude, nettoyée : tout ce qui n'a pas la bonne forme
   tombe, les nombres hors de bornes plausibles aussi. Jamais d'exception. */
export function lireLecture(x: unknown, cle?: string): Lecture | null {
  const o = O(x);
  /* La clé demandée, telle quelle : jamais réécrite (une clé « nettoyée » ne
     retrouverait plus son contact). */
  const k = cle || (typeof o.cle === 'string' ? o.cle.slice(0, 200) : '');
  if (!k) return null;
  const r0 = o.recherche && typeof o.recherche === 'object' ? O(o.recherche) : null;
  let recherche: LectureRecherche | null = r0 ? {
    types: parmiListe(r0.types, TYPES_RECH),
    budgetMin: nb(r0.budgetMin, 20000, 40000000), budgetMax: nb(r0.budgetMax, 20000, 40000000),
    surfaceMin: nb(r0.surfaceMin, 8, 3000), surfaceMax: nb(r0.surfaceMax, 8, 3000),
    piecesMin: nb(r0.piecesMin, 1, 30), piecesMax: nb(r0.piecesMax, 1, 30), chambresMin: nb(r0.chambresMin, 0, 20),
    secteurs: lst(r0.secteurs, 12, 60),
    /* Un équipement rendu en simple mot (« balcon ») : souhaité. */
    equipements: liste(r0.equipements, ELEMENTS).map(e => (typeof e === 'string'
      ? { cle: parmi(e.trim().toLowerCase(), CLES_EQUIP), niveau: 'souhaite' as const }
      : { cle: parmi(O(e).cle, CLES_EQUIP), niveau: parmi(O(e).niveau, NIVEAUX) || 'souhaite' }))
      .filter((e): e is { cle: CleEquip; niveau: 'souhaite' | 'indispensable' } => !!e.cle)
      .filter((e, i, l) => l.findIndex(y => y.cle === e.cle) === i),
    rdcExclu: vrai(r0.rdcExclu), dernierEtage: vrai(r0.dernierEtage),
    etageMin: nb(r0.etageMin, 0, 60), etageMax: nb(r0.etageMax, 0, 60), etageMaxSansAscenseur: nb(r0.etageMaxSansAscenseur, 0, 20),
    cuisine: parmi(r0.cuisine, ['ouverte', 'separee'] as const), cuisineNiveau: parmi(r0.cuisineNiveau, NIVEAUX),
    exposition: parmiListe(r0.exposition, EXPOS), etat: parmiListe(r0.etat, ETATS),
    sejourMin: nb(r0.sejourMin, 5, 300), exterieurMin: nb(r0.exterieurMin, 1, 5000), anneeMin: nb(r0.anneeMin, 1600, 2100),
    financement: parmi(r0.financement, FINANCEMENTS), urgence: parmi(r0.urgence, URGENCES),
    precisions: lst(r0.precisions, 12, 220, PHRASES),
  } : null;
  /* Deux bornes inversées : on les remet dans l'ordre. */
  if (recherche && rechercheVide(recherche)) recherche = null;
  if (recherche) {
    for (const [a, b] of [['budgetMin', 'budgetMax'], ['surfaceMin', 'surfaceMax'], ['piecesMin', 'piecesMax'], ['etageMin', 'etageMax']] as const) {
      const x1 = recherche[a], x2 = recherche[b];
      if (x1 !== null && x2 !== null && x1 > x2) { recherche[a] = x2; recherche[b] = x1; }
    }
  }
  const b0 = o.bien && typeof o.bien === 'object' ? O(o.bien) : null;
  const bien = b0 ? {
    type: parmi(b0.type, TYPES_BIEN_VENTE), surface: nb(b0.surface, 8, 3000), pieces: nb(b0.pieces, 1, 30), chambres: nb(b0.chambres, 0, 20),
    etage: nb(b0.etage, 0, 60), adresse: tx(b0.adresse, 160) || null, codePostal: (tx(b0.codePostal, 5).match(/^\d{5}$/) || [])[0] || null,
    ville: tx(b0.ville, 60) || null, valeur: nb(b0.valeur, 20000, 40000000), resume: tx(b0.resume, 160), notes: tx(b0.notes, 600),
  } : null;
  const v0 = O(o.vente);
  const rp = O(v0.rappel);
  const date = typeof rp.date === 'string' && dateValide(rp.date) ? rp.date : null;
  return {
    cle: k, recherche, location: tx(o.location, 300) || null, proprietaire: vrai(o.proprietaire),
    bien: bien && (bien.type || bien.surface || bien.adresse || bien.resume) ? bien : null,
    vente: {
      projet: parmi(v0.projet, PROJETS) || 'aucun', aSuivre: vrai(v0.aSuivre),
      rappel: { date, mois: nb(rp.mois, 1, 12), annee: nb(rp.annee, 2000, 2100), texte: tx(rp.texte, 120) || null },
    },
    aSavoir: lst(o.aSavoir, 12, 300, PHRASES),
    emails: lst(o.emails, 4, 120).map(m => m.toLowerCase()).filter(mailValide),
    telephones: lst(o.telephones, 4, 30).filter(t => finTel(t).length === 9).map(beauTel),
  };
}

/* ══ 8. Ce qui sera créé ═══════════════════════════════════════════════ */

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function dateFr(ymd: string | null | undefined): string {
  if (!ymd || !dateValide(ymd.slice(0, 10))) return '';
  const [a, m, j] = ymd.slice(0, 10).split('-').map(Number);
  return `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`;
}
export function aujourdhuiYmd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const ymd = (a: number, m: number, j: number) => `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;

/* La date du rappel. « rappeler en novembre » : le 1er novembre ; le mois
   en cours : aujourd'hui. Un rappel déjà passé (une date, un mois) n'est
   pas repoussé d'un an : il est en retard, donc pour aujourd'hui, et on dit
   quand il était prévu. */
export type Rappel = { date: string; retard: string | null };
export function dateRappel(r: Lecture['vente']['rappel'] | null | undefined, aujourdhui: string): Rappel | null {
  if (!r) return null;
  const [a0, m0] = aujourdhui.split('-').map(Number);
  if (r.date) return r.date >= aujourdhui ? { date: r.date, retard: null } : { date: aujourdhui, retard: `prévu le ${dateFr(r.date)}` };
  if (!r.mois) return null;
  const a = r.annee || a0;
  if (a > a0 || (a === a0 && r.mois > m0)) return { date: ymd(a, r.mois, 1), retard: null };
  if (a === a0 && r.mois === m0) return { date: aujourdhui, retard: null };
  return { date: aujourdhui, retard: `prévu en ${MOIS[r.mois - 1]}${r.annee ? ` ${r.annee}` : ''}` };
}

export type Puce = { id: string; lib: string; ic: string };
export type Extra = Puce & { source: 'colonnes' | 'texte'; on: boolean; long?: boolean };
export type PlanRecherche = {
  nom: string;
  crit: CritForm;
  base: Puce[];
  extras: Extra[];
  titre: string; ligne: string;
};
export type Choix = {
  exclu: boolean;
  proprietaire: boolean | null; acheteur: boolean | null;
  /* Les critères retirés (leur `id`). */
  off: string[];
  aSuivre: boolean | null;
  rappel: string | null;
  /* « Ce n'est pas la même personne » : le doublon trouvé dans le CRM est
     ignoré, une fiche est créée. null : au choix de l'import (un homonyme
     aux coordonnées différentes est créé à part). */
  nouveau: boolean | null;
};
export const CHOIX_VIDE: Choix = { exclu: false, proprietaire: null, acheteur: null, off: [], aSuivre: null, rappel: null, nouveau: null };
/* `passee` : Alexandre n'a pas attendu la lecture (« Ne pas attendre »). */
export type EtatLecture = 'sans_texte' | 'attente' | 'ok' | 'echec' | 'passee';
export type BienActuel = { aVendre: boolean; type: string | null; surface: number | null; valeur: number | null; adresse: string | null; notes: string | null };
export type ASuivre = { donnees: Record<string, unknown>; resume: string; rappel: string | null; rappelTexte: string; retard: string | null };
/* Le rappel de son projet de vente, posé sur le contact (sans fiche bien). */
export type RappelContact = { date: string; retard: string | null; texte: string | null; rappelTexte: string };
export type Plan = {
  exclu: boolean;
  roles: { proprietaire: boolean; acheteur: boolean };
  /* Ni propriétaire, ni acheteur, ni professionnel reconnu : il arrive en
     acheteur (le type par défaut du CRM), sans jamais être « Actif », et ce
     rôle n'est jamais ajouté à une fiche qui existe déjà. */
  force: boolean;
  types: TypeContact[];
  recherches: PlanRecherche[];
  tiree: boolean;
  aSavoir: string;
  occupation: 'proprietaire' | null;
  bienActuel: BienActuel;
  aSuivre: ASuivre | null;
  /* Une fiche bien « À suivre » peut être proposée (un propriétaire). */
  aSuivrePossible: boolean;
  /* Un projet de vente : « Revente possible (mandat vendeur potentiel) ». */
  projetVente: boolean;
  /* Son rappel, sur lui, quand il n'a pas de fiche bien. */
  rappel: RappelContact | null;
  suivi: string;
  location: string | null;
  /* Il ne cherche qu'à louer : pas de recherche d'achat à reprendre. */
  locationSeule: boolean;
  emails: string[]; telephones: string[]; adresse: string;
  source: { k: SourceContact; detail: string } | null;
  /* Ce qui mérite un coup d'œil avant d'importer. */
  aVerifier: string[];
  /* Ceux de `aVerifier` qui parlent de la fiche à créer (son rôle, son
     statut) : sans objet quand il est déjà dans le CRM. */
  verifFiche: string[];
};

const libEquip: Record<CleEquip, string> = {
  parking: 'Parking ou box', cave: 'Cave', balcon: 'Balcon', terrasse: 'Terrasse', jardin: 'Jardin', gardien: 'Gardien',
  interphone: 'Interphone', digicode: 'Digicode', exterieur: 'Un extérieur', ascenseur: 'Ascenseur',
};
const libExpo: Record<string, string> = { sud: 'sud', est: 'est', ouest: 'ouest', nord: 'nord', traversant: 'traversant' };
const libEtat: Record<string, string> = { a_renover: 'à rénover', travaux_legers: 'travaux légers', bon_etat: 'bon état', refait_neuf: 'refait à neuf' };
const libFin: Record<string, string> = {
  cash: 'cash', pret_valide: 'prêt validé', pret_en_cours: 'prêt en cours', a_monter: 'prêt à monter', pret_relais: 'prêt relais',
  mixte_cash_pret: 'cash et prêt', mixte_cash_relais: 'cash et prêt relais', mixte_pret_relais: 'prêt et prêt relais',
};
const libUrg: Record<string, string> = { immediate: 'immédiat', '3_mois': 'sous 3 mois', '6_mois': 'sous 6 mois', annee: 'dans l’année' };
const etageLib = (n: number) => (n === 0 ? 'rez-de-chaussée' : `${n}${n === 1 ? 'er' : 'e'} étage`);
const euros = (n: number) => ecrireMontant(n);
const phrase = (s: string) => {
  const t = net(s).replace(/[\s.;,:/–-]+$/, '');
  if (!t) return '';
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[!?…»)]$/.test(t) ? '' : '.'}`;
};

function critVide(): CritForm {
  return {
    exigences: {}, etage_max_sans_ascenseur: '', cuisine_type: '', exterieur_surface_min: '',
    types_bien: [], budget_min: '', budget_max: '', surface_min: '', surface_max: '',
    nb_pieces_min: '', nb_pieces_max: '', chambres_min: '', secteurs: [],
    transport_minutes: '', transport_lignes: [], transport_arrets: [], notes: '',
    parking: false, balcon: false, terrasse: false, jardin: false, cave: false,
    ascenseur: false, gardien: false, interphone: false, digicode: false,
    rdc_exclu: false, dernier_etage: false, etage_min: '', etage_max: '', dpe_max: '',
    annee_min: '', etat_souhaite: '', exposition_souhaitee: '', surface_sejour_min: '',
    urgence: '', financement: '', apport: '',
  };
}
const s = (n: number | null) => (n === null ? '' : String(n));

/* Les critères en plus, lus dans le texte : chacun une pastille qu'on peut
   retirer, et son effet sur le formulaire. */
type Effet = (c: CritForm) => void;
function extrasDe(l: LectureRecherche): { extra: Omit<Extra, 'on'>; effet: Effet }[] {
  const out: { extra: Omit<Extra, 'on'>; effet: Effet }[] = [];
  const ajoute = (id: string, lib: string, effet: Effet, ic = 'check') => out.push({ extra: { id, lib, ic, source: 'texte' }, effet });
  for (const e of l.equipements) {
    const lib = e.cle === 'exterieur' && l.exterieurMin ? `Un extérieur d’au moins ${l.exterieurMin} m²` : libEquip[e.cle];
    ajoute(`eq:${e.cle}`, e.niveau === 'indispensable' ? `${lib} (indispensable)` : lib, c => {
      c.exigences = { ...c.exigences, [e.cle]: e.niveau as Niveau };
      if (e.cle in c && typeof (c as Record<string, unknown>)[e.cle] === 'boolean') (c as Record<string, unknown>)[e.cle] = true;
      if (e.cle === 'exterieur' && l.exterieurMin) c.exterieur_surface_min = String(l.exterieurMin);
    });
  }
  if (l.rdcExclu) ajoute('rdc', 'Pas de rez-de-chaussée', c => { c.rdc_exclu = true; });
  if (l.dernierEtage) ajoute('dernier', 'Dernier étage', c => { c.dernier_etage = true; });
  if (l.etageMin !== null && l.etageMin > 0) ajoute('etagemin', `À partir du ${etageLib(l.etageMin)}`, c => { c.etage_min = String(l.etageMin); });
  if (l.etageMax !== null) ajoute('etagemax', `Jusqu’au ${etageLib(l.etageMax)}`, c => { c.etage_max = String(l.etageMax); });
  if (l.etageMaxSansAscenseur !== null) ajoute('sansasc', `Sans ascenseur : ${etageLib(l.etageMaxSansAscenseur)} au plus`, c => { c.etage_max_sans_ascenseur = String(l.etageMaxSansAscenseur); });
  if (l.cuisine) ajoute('cuisine', `Cuisine ${l.cuisine === 'ouverte' ? 'ouverte' : 'séparée'}${l.cuisineNiveau === 'indispensable' ? ' (indispensable)' : ''}`, c => {
    c.cuisine_type = l.cuisine || '';
    c.exigences = { ...c.exigences, cuisine: (l.cuisineNiveau || 'souhaite') as Niveau };
  });
  if (l.exposition.length) ajoute('expo', `Exposition ${l.exposition.map(x => libExpo[x]).join(', ')}`, c => { c.exposition_souhaitee = l.exposition.join(', '); });
  if (l.etat.length) ajoute('etat', `État : ${ETATS.filter(x => l.etat.includes(x)).map(x => libEtat[x]).join(', ')}`, c => { c.etat_souhaite = ETATS.filter(x => l.etat.includes(x)).join(','); });
  if (l.sejourMin) ajoute('sejour', `Séjour de ${l.sejourMin} m² min.`, c => { c.surface_sejour_min = String(l.sejourMin); });
  if (l.anneeMin) ajoute('annee', `Construit après ${l.anneeMin}`, c => { c.annee_min = String(l.anneeMin); });
  if (l.financement) ajoute('fin', `Financement : ${libFin[l.financement]}`, c => { c.financement = l.financement || ''; });
  if (l.urgence) ajoute('urg', `Délai : ${libUrg[l.urgence]}`, c => { c.urgence = l.urgence || ''; });
  l.precisions.forEach((p, i) => {
    const t = phrase(p);
    if (t) out.push({ extra: { id: `p:${i}`, lib: t.replace(/\.$/, ''), ic: 'bulle', source: 'texte', long: t.length > 48 }, effet: c => { c.notes = c.notes ? `${c.notes}\n${t}` : t; } });
  });
  return out;
}

function resumeRecherche(c: CritForm): { titre: string; ligne: string; base: Puce[] } {
  const types = c.types_bien;
  const type = types.length === 0 ? 'Type à préciser' : types.length === 1 ? types[0] : `${types[0]} ou ${types.slice(1).join(' ou ').toLowerCase()}`;
  const villes = c.secteurs.length ? c.secteurs.map(x => x.replace(/ème$/, 'e')).join(', ') : 'secteur à préciser';
  const pm = c.nb_pieces_min, px = c.nb_pieces_max;
  const pieces = pm && px && pm !== px ? `${pm} à ${px} pièces` : pm ? `${pm} pièces` : px ? `${px} pièces au plus` : '';
  const ch = c.chambres_min ? `${c.chambres_min} chambre${Number(c.chambres_min) > 1 ? 's' : ''} min.` : '';
  const sf = c.surface_min && c.surface_max ? `${c.surface_min} à ${c.surface_max} m²` : c.surface_min ? `${c.surface_min} m² min.` : c.surface_max ? `${c.surface_max} m² max.` : '';
  const bmax = Number(c.budget_max) || 0, bmin = Number(c.budget_min) || 0;
  const bud = bmax && bmin ? `${euros(bmin)} à ${euros(bmax)}` : bmax ? euros(bmax) : bmin ? `dès ${euros(bmin)}` : '';
  const pc = [pieces, ch].filter(Boolean).join(', ');
  const base: Puce[] = [
    { id: 'type', lib: type, ic: 'maison' },
    { id: 'lieu', lib: c.secteurs.length ? villes : 'Secteur à préciser', ic: 'lieu' },
    ...(pc ? [{ id: 'pieces', lib: pc.replace(', ', ' · '), ic: 'groupe' }] : []),
    ...(sf ? [{ id: 'surface', lib: sf, ic: 'regle' }] : []),
    ...(bud ? [{ id: 'budget', lib: bud, ic: 'euro' }] : []),
  ];
  const vide = !types.length && !c.secteurs.length && !pc && !sf && !bud;
  if (vide) return { titre: 'Sans critères pour l’instant', ligne: 'Acheteur non filtré : ses critères se prennent plus tard.', base };
  return { titre: `${type} · ${villes}`, ligne: [pc, sf, bud].filter(Boolean).join(' · ') || 'Critères à préciser', base };
}

/* La recherche : les colonnes d'abord, le texte pour ce qui manque. */
function planRecherche(nom: string, cols: RechCols | null, lec: LectureRecherche | null, off: string[]): PlanRecherche {
  const c = critVide();
  const n = (a: number | null | undefined, b: number | null | undefined) => (a !== null && a !== undefined ? a : b ?? null);
  const colsRemplies = !!cols?.rempli;
  c.types_bien = cols?.types.length ? [...cols.types] : [...(lec?.types || [])];
  c.budget_min = s(n(cols?.budgetMin, colsRemplies && cols?.budgetMax ? null : lec?.budgetMin));
  c.budget_max = s(n(cols?.budgetMax, lec?.budgetMax));
  c.surface_min = s(n(cols?.surfaceMin, colsRemplies && cols?.surfaceMax ? null : lec?.surfaceMin));
  c.surface_max = s(n(cols?.surfaceMax, colsRemplies && cols?.surfaceMin ? null : lec?.surfaceMax));
  c.nb_pieces_min = s(n(cols?.piecesMin, lec?.piecesMin));
  c.nb_pieces_max = s(n(cols?.piecesMax, colsRemplies && cols?.piecesMin ? null : lec?.piecesMax));
  c.chambres_min = s(n(cols?.chambresMin, lec?.chambresMin));
  /* Les secteurs des colonnes s'il y en a ; sinon ceux du texte. Un nom que
     le CRM ne connaît pas va dans les précisions. */
  const lignesTexte: string[] = [];
  if (cols?.secteurs.length || cols?.inconnus.length) c.secteurs = [...(cols?.secteurs || [])];
  else for (const x of lec?.secteurs || []) {
    const k = secteurDe(x);
    if (k) { if (!c.secteurs.includes(k)) c.secteurs.push(k); }
    else lignesTexte.push(`Secteur : ${x}.`);
  }
  /* Jamais la « Précision » d'ImmoFacile telle quelle : ces notes, le client
     les lit dans son espace. Elle va dans « À savoir » (pour Alexandre seul),
     et seules les phrases réécrites par la lecture arrivent ici. */
  const notes: string[] = [...(cols?.lignes || []), ...lignesTexte];
  c.notes = notes.join('\n');
  const extras: Extra[] = [];
  if (lec) for (const { extra, effet } of extrasDe(lec)) {
    const on = !off.includes(extra.id);
    extras.push({ ...extra, on });
    if (on) effet(c);
  }
  c.notes = net(c.notes) ? c.notes.trim() : '';
  const r = resumeRecherche(c);
  return { nom, crit: c, base: r.base, extras, titre: r.titre, ligne: r.ligne };
}

/* La note « À savoir » : ce qu'ImmoFacile savait de lui, pour Alexandre seul. */
function texteASavoir(c: Contact, lec: Lecture | null, o: { bienEnNote: string; location: string | null; locationSeule: boolean; precisions: string[]; rappelRetard: string }): string {
  const tete = [
    c.creeLe ? `fiche créée le ${dateFr(c.creeLe)}` : 'fiche sans date de création',
    c.suiviPar ? `suivie par ${c.suiviPar}` : '',
    c.origines.length ? `origine « ${c.origines.join(' », « ')} »` : '',
  ].filter(Boolean).join(', ');
  const lignes: string[] = [];
  for (const x of lec?.aSavoir || []) lignes.push(phrase(x));
  if (o.bienEnNote) lignes.push(phrase(`Son bien : ${o.bienEnNote}`));
  if (o.rappelRetard) lignes.push(phrase(o.rappelRetard));
  if (c.refus.length) lignes.push(phrase(`Dans ImmoFacile, a refusé ${c.refus.join(' et ')}`));
  for (const m of c.mailsInvalides) lignes.push(phrase(`E-mail mal écrit dans ImmoFacile : ${m}`));
  if (c.communs.length) lignes.push(phrase(`Présent sur plusieurs fiches d’ImmoFacile (sans doute celui de l’agence), pas repris dans ses coordonnées : ${c.communs.join(', ')}`));
  if (o.location) lignes.push(phrase(`${o.locationSeule ? 'Cherche à louer' : 'Cherche aussi à louer'} : ${o.location}`));
  if (c.genre && !c.civilite) lignes.push(phrase(`Civilité dans ImmoFacile : ${c.genre}`));
  if (c.raisonSociale) lignes.push(phrase(`Société : ${c.raisonSociale}`));
  if (c.residence) lignes.push(phrase(`Résidence : ${c.residence}`));
  for (const a of c.associes) lignes.push(phrase(`Contact associé dans ImmoFacile : ${a}`));
  const blocs = [`Repris d’ImmoFacile : ${tete}.`];
  if (lignes.length) blocs.push(lignes.filter(Boolean).map(x => `– ${x}`).join('\n'));
  /* La précision de sa recherche, telle qu'il l'avait notée, toujours ici et
     jamais dans la recherche (le client la lit dans son espace). */
  if (o.precisions.length) blocs.push(`Précision de sa recherche dans ImmoFacile :\n${o.precisions.map(p => p.replace(/\n+/g, ' / ')).join('\n')}`);
  /* Le commentaire d'origine, entier : rien ne se perd, même si la lecture
     du texte a manqué quelque chose. Une ligne vide ferait un nouveau bloc. */
  const com = c.commentaires.map(x => x.replace(/\n{2,}/g, '\n')).join('\n');
  if (com) blocs.push(`Son commentaire dans ImmoFacile :\n${com}`);
  return blocs.join('\n\n');
}

const TYPE_LIB: Record<string, string> = {
  appartement: 'appartement', maison: 'maison', duplex: 'duplex', studio: 'studio', loft: 'loft', terrain: 'terrain',
  local: 'local', parking: 'parking', immeuble: 'immeuble', autre: 'bien',
};
function resumeBien(b: NonNullable<Lecture['bien']>): string {
  if (b.resume) return b.resume.replace(/[.;\s]+$/, '');
  return [
    b.type ? TYPE_LIB[b.type] : '', b.pieces ? `${b.pieces} pièces` : '', b.surface ? `${b.surface} m²` : '',
    b.etage !== null ? etageLib(b.etage) : '', b.ville || '',
  ].filter(Boolean).join(', ');
}

/* Les statuts d'ImmoFacile → les types du CRM. « Vendeur », « Bailleur » :
   il possède un bien. Un statut inconnu (« Locataire ») ne donne rien. */
const STATUTS: [RegExp, TypeContact][] = [
  [/^(proprietaire|proprio|vendeur|bailleur)/, 'proprietaire'],
  [/^(demandeur|acquereur|acheteur|investisseur)/, 'acheteur'],
  [/^notaire/, 'notaire'], [/^(confrere|agent|agence|mandataire)/, 'confrere'], [/^gardien/, 'gardien'],
  [/^(partenaire|courtier|artisan|diagnostiqueur|syndic|avocat|prestataire|architecte)/, 'partenaire'],
];
const PROS: TypeContact[] = ['notaire', 'confrere', 'gardien', 'partenaire'];
function typesDesStatuts(statuts: string[]): TypeContact[] {
  const out: TypeContact[] = [];
  for (const x of statuts.map(y => sansAccents(y).toLowerCase().trim())) {
    const t = STATUTS.find(([re]) => re.test(x));
    if (t && !out.includes(t[1])) out.push(t[1]);
  }
  return out;
}
/* Les téléphones écrits dans un texte (« 06 12 34 56 78 », « +33 6… »). */
const telsDuTexte = (t: string) => new Set([...t.matchAll(/(?:\+\s?33\s?|0)\s?[1-9](?:[\s.-]?\d{2}){4}/g)].map(m => finTel(m[0])));

export function planifier(c: Contact, lec: Lecture | null, etat: EtatLecture, choix: Choix, aujourdhui: string): Plan {
  const achats = c.recherches.filter(r => r.achat);
  const location = c.recherches.find(r => r.location);
  const statut = typesDesStatuts(c.statuts);
  const autres = PROS.filter(t => statut.includes(t));
  const auto = {
    proprietaire: statut.includes('proprietaire') || !!lec?.proprietaire,
    acheteur: statut.includes('acheteur') || achats.length > 0 || !!lec?.recherche,
  };
  const roles = {
    proprietaire: choix.proprietaire ?? auto.proprietaire,
    acheteur: choix.acheteur ?? auto.acheteur,
  };
  const aVerifier: string[] = [];
  const locationSeule = !!(location || lec?.location) && !achats.some(r => r.rempli) && !lec?.recherche;
  let force = false;
  if (!roles.proprietaire && !roles.acheteur && !autres.length) {
    roles.acheteur = true;
    force = true;
    const qui = c.statuts.length ? `Statut « ${c.statuts.join(' », « ')} » dans ImmoFacile` : 'Sans statut dans ImmoFacile';
    aVerifier.push(locationSeule ? 'Cherche à louer : arrive en acheteur sans critères, à qualifier.' : `${qui}, sans recherche : arrive en acheteur sans critères, à qualifier.`);
  } else if (roles.acheteur && locationSeule && !roles.proprietaire) aVerifier.push('Cherche à louer : pas de critères d’achat à reprendre.');
  if (etat === 'echec') aVerifier.push('Lecture du texte impossible : vérifie.');
  if (etat === 'passee') aVerifier.push('Lecture du commentaire passée : seules les colonnes sont reprises, vérifie.');
  if (c.refus.length && roles.acheteur) aVerifier.push(`A refusé ${c.refus.join(' et ')} dans ImmoFacile : reste à qualifier, rien ne lui part tout seul.`);
  const verifFiche = [...aVerifier.filter(x => !/^Lecture/.test(x))];
  const inconnus = roles.acheteur ? [...new Set(c.recherches.flatMap(r => r.inconnus))] : [];
  if (inconnus.length) aVerifier.push(`Secteur ${inconnus.map(x => `« ${beauNom(x)} »`).join(', ')} pas reconnu : noté dans ses précisions, à préciser.`);
  for (const m of c.mailsInvalides) aVerifier.push(`E-mail mal écrit dans ImmoFacile (« ${m} ») : gardé dans « À savoir ».`);
  aVerifier.push(...c.aVoir);

  /* La recherche (la première), puis les autres recherches d'achat des colonnes. */
  const recherches: PlanRecherche[] = [];
  const tiree = roles.acheteur && !achats.some(r => r.rempli) && !!lec?.recherche;
  if (roles.acheteur) {
    recherches.push(planRecherche('Recherche principale', achats[0] || null, lec?.recherche || null, choix.off));
    achats.slice(1).forEach((r, i) => recherches.push(planRecherche(`Recherche ${i + 2}`, r, null, choix.off)));
  }

  /* Son bien. Un projet de vente (« vente après avoir trouvé », « rappeler
     pour estimation ») pose le rappel noté sur LUI. Pas de fiche dans Biens :
     Alexandre la crée quand il a vu le logement (« Créer aussi sa fiche
     bien » dans les corrections, sinon).
     · Il achète aussi : « Revente possible après l'achat (mandat vendeur
       potentiel) » cochée, avec ce qu'on sait du logement.
     · Il vend seulement (V3.62, Alexandre : « elle souhaitera juste vendre,
       pourquoi revente après achat ? ») : pas cette case, qui parle d'un
       achat. Son logement et son projet vont dans « À savoir ». */
  const v = lec?.vente;
  const b = lec?.bien || null;
  const vend = !!v && (v.projet === 'apres_achat' || v.projet === 'projet' || (v.aSuivre && v.projet !== 'vendu' && v.projet !== 'ailleurs'));
  const projetVente = roles.proprietaire && vend;
  const revente = projetVente && roles.acheteur;
  const bienActuel: BienActuel = revente && b ? {
    aVendre: true, type: b.type ? TYPE_LIB[b.type].replace(/^./, x => x.toUpperCase()) : null, surface: b.surface, valeur: b.valeur,
    adresse: b.adresse ? [b.adresse, [b.codePostal, b.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : null,
    notes: [resumeBien(b), b.notes].filter(Boolean).map(phrase).join(' ') || null,
  } : { aVendre: revente, type: null, surface: null, valeur: null, adresse: null, notes: null };
  /* À la même adresse que lui : le CRM dit « Même adresse que le contact ». */
  const saRue = nomNet(c.adresse.split(',')[0], '');
  if (bienActuel.adresse && saRue.length > 4 && nomNet(bienActuel.adresse, '').startsWith(saRue)) bienActuel.adresse = null;
  const aSuivrePossible = roles.proprietaire;
  /* La fiche bien : seulement si Alexandre la demande. */
  const veutSuivre = roles.proprietaire && choix.aSuivre === true;
  /* Le rappel noté pour son projet de vente. Une date choisie à la main,
     passée : aujourd'hui (une relance ne se pose pas dans le passé). */
  const prevu = projetVente || veutSuivre ? dateRappel(v?.rappel, aujourdhui) : null;
  const main = choix.rappel !== null ? (dateValide(choix.rappel) ? (choix.rappel < aujourdhui ? aujourdhui : choix.rappel) : null) : null;
  const rappel = !(projetVente || veutSuivre) ? null : choix.rappel !== null ? main : prevu?.date || null;
  const retard = choix.rappel !== null ? null : prevu?.retard || null;
  const rappelTexte = !rappel ? 'sans date de rappel' : rappel === aujourdhui ? `rappel aujourd’hui${retard ? ` (en retard, ${retard})` : ''}` : `rappel le ${dateFr(rappel)}`;
  const rappelRetard = rappel && retard ? `Rappel en retard, ${retard} : posé pour aujourd’hui` : '';
  let aSuivre: ASuivre | null = null;
  if (veutSuivre) {
    const d: Record<string, unknown> = {};
    if (b?.type) d.typeBien = b.type;
    if (b?.surface) d.surface = b.surface;
    if (b?.pieces) d.pieces = b.pieces;
    if (b?.chambres !== null && b?.chambres !== undefined) d.chambres = b.chambres;
    if (b?.etage !== null && b?.etage !== undefined) d.etage = b.etage;
    if (b?.adresse) d.adresse = b.adresse;
    if (b?.codePostal) d.cp = b.codePostal;
    const ville = b?.ville ? (secteurDe(b.ville) || beauNom(b.ville)) : '';
    if (ville) d.ville = ville.replace(/^Paris \d.*$/, 'Paris');
    /* Sans adresse dans le texte : celle de sa fiche ImmoFacile, le plus
       souvent celle de son bien (à vérifier, la note le dit). */
    const adrFiche = !b?.adresse && !ville && !b?.codePostal && !!(c.adr.rue || c.adr.ville);
    if (adrFiche) {
      if (c.adr.rue) d.adresse = c.adr.rue;
      if (c.adr.cp) d.cp = c.adr.cp;
      if (c.adr.ville) d.ville = c.adr.ville;
    }
    if (b?.valeur) d.prixSouhaite = b.valeur;
    const notes = [
      `Repris d’ImmoFacile le ${dateFr(aujourdhui)}.`,
      adrFiche ? 'Adresse reprise de sa fiche ImmoFacile : à vérifier.' : '',
      b?.notes ? phrase(b.notes) : '',
      v?.rappel.texte ? phrase(`Rappel noté : ${v.rappel.texte}`) : '',
    ].filter(Boolean).join('\n');
    d.notes = notes;
    aSuivre = { donnees: d, resume: b ? resumeBien(b) : 'son bien (à décrire)', rappel, retard, rappelTexte };
  }
  /* Sans fiche bien, le rappel se pose sur lui (Relances). */
  const rappelContact: RappelContact | null = !aSuivre && rappel ? { date: rappel, retard, texte: v?.rappel.texte || null, rappelTexte } : null;
  /* Pas dans « Revente possible » : son logement, en entier, dans « À savoir ». */
  const bienEnNote = roles.proprietaire && b && !bienActuel.aVendre ? [
    resumeBien(b),
    b.adresse ? [b.adresse, [b.codePostal, b.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '',
    b.valeur ? `en espère ${euros(b.valeur)}` : '',
  ].filter(Boolean).join(', ') + (b.notes ? `. ${phrase(b.notes)}` : '') : '';

  const locTexte = location ? location.resume : lec?.location || null;
  const types: TypeContact[] = [];
  if (roles.acheteur) types.push('acheteur');
  if (aSuivre) types.push('vendeur');
  if (roles.proprietaire) types.push('proprietaire');
  types.push(...autres);

  const source = c.origines.map(sourceDepuis).find(Boolean) || null;
  const suivi = `Fiche reprise d’ImmoFacile le ${dateFr(aujourdhui)}${c.creeLe ? ` (créée le ${dateFr(c.creeLe)} chez ImmoFacile)` : ''}${tiree ? ' · critères repris de son commentaire' : ''}`;
  /* Les e-mails et téléphones lus dans le texte : seulement ceux qui y sont
     vraiment écrits, dans SON texte (une lecture mélangée entre deux
     contacts ne doit rien recopier de l'un chez l'autre). */
  const sonTexte = [...c.commentaires, ...c.recherches.map(r => r.precision)].join('\n');
  const bas = sonTexte.toLowerCase();
  const tels = telsDuTexte(sonTexte);
  const emails = [...c.emails]; ajouter(emails, (lec?.emails || []).filter(m => bas.includes(m)));
  const telephones = [...c.telephones]; ajouter(telephones, (lec?.telephones || []).filter(t => tels.has(finTel(t)) && !telBidon(t)), finTel);
  return {
    exclu: choix.exclu, roles, force, types, recherches, tiree,
    aSavoir: texteASavoir(c, lec, { bienEnNote, location: locTexte, locationSeule, precisions: c.recherches.map(r => r.precision).filter(Boolean), rappelRetard }),
    occupation: roles.proprietaire ? 'proprietaire' : null,
    bienActuel, aSuivre, aSuivrePossible, projetVente, rappel: rappelContact, suivi, location: locTexte, locationSeule,
    emails, telephones, adresse: c.adresse, source, aVerifier, verifFiche,
  };
}

/* ══ 9. Déjà dans le CRM ═══════════════════════════════════════════════ */

export type ClientCRM = {
  id: string; prenom?: string | null; nom?: string | null; emails?: string[] | null; telephones?: string[] | null;
  civilite?: string | null; couple?: boolean | null; conjoint?: unknown; pro?: unknown;
  adresse?: string | null; notes?: string | null; types?: unknown; statut?: string | null;
  statut_occupation?: string | null; bien_actuel_a_vendre?: boolean | null; bien_actuel_type?: string | null;
  bien_actuel_surface?: number | null; bien_actuel_valeur?: number | null; bien_actuel_notes?: string | null;
  source?: string | null; archive?: boolean | null;
};
export type Doublon = {
  client: ClientCRM; raison: 'e-mail' | 'téléphone' | 'nom';
  /* Reconnu par l'e-mail ou le téléphone de la personne 2 de sa fiche. */
  conjoint: boolean;
  /* Même e-mail ou téléphone, mais un autre prénom et nom : un proche (un
     fixe, une adresse familiale), pas lui. Sa fiche est complétée sans y
     recopier ses coordonnées, et « À vérifier » le dit. */
  autreNom: boolean;
  /* Même nom seulement, et des coordonnées des deux côtés qui ne se
     recoupent pas : sans doute un homonyme. Créé à part par défaut. */
  conflit: boolean;
};
/* Les contacts du CRM rangés une fois pour toutes par e-mail, téléphone et
   nom : chercher un doublon ne relit plus toute la liste (un export de
   plusieurs centaines de contacts). */
type Entree = { x: ClientCRM; conjoint: boolean };
export type IndexCRM = { mails: Map<string, Entree[]>; tels: Map<string, Entree[]>; noms: Map<string, ClientCRM[]> };
export function indexerCRM(liste: ClientCRM[]): IndexCRM {
  const idx: IndexCRM = { mails: new Map(), tels: new Map(), noms: new Map() };
  const met = <V>(m: Map<string, V[]>, k: string, v: V) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };
  for (const x of liste) {
    const j = O(x.conjoint);
    for (const m of x.emails || []) { const k = String(m || '').trim().toLowerCase(); if (k) met(idx.mails, k, { x, conjoint: false }); }
    const jm = String(j.email || '').trim().toLowerCase();
    if (jm) met(idx.mails, jm, { x, conjoint: true });
    for (const t of x.telephones || []) { const k = finTel(t); if (k.length === 9) met(idx.tels, k, { x, conjoint: false }); }
    const jt = finTel(j.telephone);
    if (jt.length === 9) met(idx.tels, jt, { x, conjoint: true });
    const n = nomNet(x.prenom, x.nom);
    if (n) met(idx.noms, n, x);
  }
  return idx;
}
/* Comme la création d'un contact (Clients.tsx, trouverDoublon) : même
   e-mail, même téléphone (9 derniers chiffres), personne 2 comprise, sinon
   même prénom et nom. Sa fiche à lui avant celle où il est la personne 2. */
export function chercherDoublon(c: { prenom: string; nom: string; emails: string[]; telephones: string[] }, idx: IndexCRM): Doublon | null {
  const mails = c.emails.map(x => x.trim().toLowerCase()).filter(Boolean);
  const tels = c.telephones.filter(t => !telBidon(t)).map(finTel).filter(x => x.length === 9);
  const choisir = (l: Entree[]): Entree | null => l.find(e => !e.conjoint) || l[0] || null;
  const parMail = choisir(mails.flatMap(m => idx.mails.get(m) || []));
  const e = parMail || choisir(tels.flatMap(t => idx.tels.get(t) || []));
  if (e) {
    /* L'e-mail du couple rangé en personne 2, mais c'est bien lui (même nom
       que la fiche) : pas un proche. */
    const lui = !!net(c.prenom) && !!net(c.nom) && !!net(e.x.prenom) && !!net(e.x.nom) && !nomsDifferents(c, e.x);
    return { client: e.x, raison: parMail ? 'e-mail' : 'téléphone', conjoint: e.conjoint && !lui, autreNom: !e.conjoint && nomsDifferents(c, e.x), conflit: false };
  }
  const nom = c.prenom.trim() && c.nom.trim() ? nomNet(c.prenom, c.nom) : '';
  const inverse = nom ? nomNet(c.nom, c.prenom) : '';
  /* Un nom seul (une société, un nom sans prénom), sans e-mail ni téléphone :
     le même nom seul suffit, sinon le réimport le recréerait. */
  const seul = !nom && c.nom.trim() && !mails.length && !tels.length ? nomNet('', c.nom) : '';
  const x = [nom, inverse, seul].filter(Boolean).flatMap(k => idx.noms.get(k) || [])[0];
  if (!x) return null;
  /* Des coordonnées des deux côtés, aucune en commun (sinon on l'aurait
     trouvé plus haut) : deux personnes qui portent le même nom. */
  const lesSiennes = [...(x.emails || []).filter(Boolean), ...(x.telephones || []).map(finTel).filter(t => t.length === 9)];
  return { client: x, raison: 'nom', conjoint: false, autreNom: false, conflit: (mails.length + tels.length) > 0 && lesSiennes.length > 0 };
}

export const MARQUE_REPRISE = /Repris d[’']ImmoFacile/i;
export type Completion = {
  emails: string[]; telephones: string[]; adresse: string | null;
  types: TypeContact[]; typesAjoutes: TypeContact[];
  occupation: boolean; notes: string | null; source: Plan['source'];
  bienActuel: boolean; recherche: boolean; aSuivre: boolean;
  /* Le rappel de son projet de vente (s'il n'en a pas déjà un : vérifié
     au moment d'écrire). */
  rappel: boolean;
  lignes: string[]; rien: boolean;
  /* Sa fiche ImmoFacile complète la fiche d'un proche : ni ses e-mails, ni
     ses téléphones, ni son adresse n'y sont recopiés. */
  proche: boolean;
};
const ORDRE_TYPES: TypeContact[] = ['acheteur', 'vendeur', 'vendeur_signe', 'proprietaire', 'notaire', 'confrere', 'gardien', 'partenaire'];
/* Ce qui manque sur sa fiche, et rien d'autre.
   · `doublon` : un proche (personne 2, ou même coordonnée sous un autre
     nom) : rien de ses coordonnées n'est recopié, et le bloc « À savoir »
     dit de qui il vient.
   · `memeLot` : une autre fiche ImmoFacile a déjà complété celle-ci pendant
     cet import : son bloc s'ajoute (sinon « Repris d'ImmoFacile » déjà là
     veut dire un réimport, et rien ne s'ajoute).
   · le type « Vendeur » n'est posé qu'avec le bien « À suivre », une fois
     celui-ci créé ; un rôle par défaut (`force`) n'est jamais ajouté. */
export function completer(p: Plan, x: ClientCRM, o: {
  aRecherche: boolean; aBien: boolean; typesActuels: TypeContact[];
  doublon?: Pick<Doublon, 'conjoint' | 'autreNom' | 'raison'> | null; memeLot?: boolean; nomImmo?: string;
}): Completion {
  const proche = !!(o.doublon?.conjoint || o.doublon?.autreNom);
  const j = O(x.conjoint);
  const sesMails = [...(x.emails || []), j.email].map(m => String(m || '').toLowerCase()).filter(Boolean);
  const sesTels = [...(x.telephones || []), j.telephone].map(finTel).filter(t => t.length === 9);
  const emails = proche ? [] : p.emails.filter(m => !sesMails.includes(m.toLowerCase()));
  const telephones = proche ? [] : p.telephones.filter(t => !sesTels.includes(finTel(t)));
  /* Une adresse avec sa rue seulement : « 92100 Boulogne-Billancourt » seul ne vaut pas une adresse. */
  const adresse = !proche && !net(x.adresse) && p.adresse.includes(',') ? p.adresse : null;
  const typesAjoutes = p.types.filter(t => !o.typesActuels.includes(t) && t !== 'vendeur' && !(p.force && t === 'acheteur'));
  const types = ORDRE_TYPES.filter(t => o.typesActuels.includes(t) || typesAjoutes.includes(t));
  const deja = String(x.notes || '').trim();
  const de = proche && o.nomImmo ? `Fiche ImmoFacile de ${o.nomImmo} (${o.doublon?.conjoint ? 'la personne 2 de cette fiche' : `même ${o.doublon?.raison}`}) :\n` : '';
  const notes = deja.includes(p.aSavoir) || (MARQUE_REPRISE.test(deja) && !o.memeLot) ? null : [deja, `${de}${p.aSavoir}`].filter(Boolean).join('\n\n');
  const occupation = p.occupation === 'proprietaire' && !x.statut_occupation;
  const bienActuel = p.bienActuel.aVendre && !x.bien_actuel_a_vendre && !x.bien_actuel_type && !x.bien_actuel_surface && !x.bien_actuel_valeur;
  const recherche = p.roles.acheteur && !p.force && p.recherches.length > 0 && !o.aRecherche;
  const aSuivre = !!p.aSuivre && !o.aBien;
  const rappel = !!p.rappel;
  const source = !x.source && p.source ? p.source : null;
  const lignes: string[] = [];
  if (telephones.length) lignes.push(telephones.length > 1 ? `${telephones.length} téléphones` : 'un téléphone');
  if (emails.length) lignes.push(emails.length > 1 ? `${emails.length} e-mails` : 'un e-mail');
  if (adresse) lignes.push('son adresse');
  if (typesAjoutes.length) lignes.push(`le type ${typesAjoutes.map(t => typeDe(t).lib).join(', ')}`);
  if (occupation) lignes.push('« Propriétaire » dans sa situation');
  if (bienActuel) lignes.push('« Revente possible » et son bien');
  if (recherche) lignes.push('sa recherche');
  if (aSuivre) lignes.push('son bien « À suivre »');
  if (rappel) lignes.push(`un rappel pour sa vente (${p.rappel?.rappelTexte.replace(/^rappel /, '')})`);
  if (source) lignes.push('sa source');
  if (notes) lignes.push('le bloc « Repris d’ImmoFacile » dans « À savoir »');
  return {
    emails, telephones, adresse, types, typesAjoutes, occupation, notes, source, bienActuel, recherche, aSuivre, rappel,
    lignes, rien: lignes.length === 0, proche,
  };
}
