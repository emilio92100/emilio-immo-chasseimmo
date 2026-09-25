/* ══ Le mandat de recherche, signé en ligne depuis l'espace client ══════════

   Ce fichier est la SEULE source du texte du mandat. L'espace l'affiche au
   client avant qu'il signe (« Lire le mandat complet »), et le serveur en
   tire le PDF au moment de la signature : ce que le client a lu est donc
   exactement ce qu'il signe. Aucune dépendance serveur ici — il est importé
   des deux côtés.

   Le texte reprend le modèle Modelo d'Alexandre (« Mandat de recherche simple
   d'un bien à acquérir », via ImmoFacile), avec les réponses qu'il a choisies :

     · mandat NON exclusif ;
     · durée « inférieure à 3 mois avec tacite reconduction » : 30 jours,
       renouvelés par périodes de 30 jours, 365 jours au plus ;
     · honoraires proportionnels, 2,5 % TTC (le barème de l'agence), à la
       charge de l'acquéreur, payés le jour de l'acte. Alexandre peut proposer
       moins depuis la fiche (colonne recherches.mandat_taux), jamais plus :
       le barème affiché est un maximum ;
     · pas de clause pénale : dans un mandat de recherche, elle n'est valable
       que si le bien est identifié précisément (adresse) — Modelo le signale
       lui-même. Le mandat protège Alexandre autrement : 12 mois sans pouvoir
       traiter en direct avec un vendeur présenté, conjoint compris ;
     · comptes rendus après chaque visite ;
     · client consommateur : information précontractuelle, médiateur, 14 jours
       de rétractation, renonciation possible en ligne (obligatoire depuis le
       19 juin 2026 pour un contrat conclu sur une interface en ligne).

   ⚠️ Le numéro du mandat est celui qu'Alexandre RÉSERVE dans son registre
   ImmoFacile. Il n'y a qu'un registre pour toute l'agence : un second registre
   « maison » rendrait le mandat nul et les honoraires non dus (Cass. 1re civ.,
   10 décembre 2014, n° 13-24.352). Le numéro doit figurer sur le mandat AVANT
   la signature : sans lui, l'espace ne propose pas de signer.
   ════════════════════════════════════════════════════════════════════════ */

export const AGENCE = {
  nom: 'EMILIO IMMOBILIER',
  adresse: '10 avenue Kléber',
  cp: '75016',
  ville: 'Paris',
  tel: '01 84 80 14 00',
  mail: 'agence@emilio-immo.com',
  site: 'www.emilio-immo.com',
  societe: 'RT CONSEILS',
  forme: 'SAS au capital de 1 000 €',
  siege: '10 avenue Kléber, 75016 Paris',
  rcs: 'RCS de Nanterre n° 884 141 201',
  carte: 'CPI 9201 2020 000 045 344',
  carteMention: '« Transactions sur immeubles et fonds de commerce »',
  carteDelivree: 'la CCI Paris Île-de-France',
  tva: 'FR34884141201',
  assureur: 'MMA Entreprise',
  assureurAdresse: '85 route de la Reine, 92100 Boulogne-Billancourt',
  police: '146511983',
} as const;

/* Qui signe pour l'agence, et à quel titre — tel qu'Alexandre l'a demandé. */
export const SIGNATAIRE = {
  nom: 'Alexandre Rogelet',
  qualite: 'responsable des transactions immobilières',
} as const;

/* Le médiateur de la consommation. Obligatoire (art. L612-1 du Code de la
   consommation) : Alexandre doit y avoir ADHÉRÉ avant la première signature.
   S'il en choisit un autre, c'est ici, et nulle part ailleurs, qu'on le change. */
export const MEDIATEUR = {
  nom: 'Association MEDIMMOCONSO',
  adresse: '1 allée du Parc de Mesemena, Bât. A, CS 25222, 44505 La Baule Cedex',
  site: 'www.medimmoconso.fr',
} as const;

export const HONORAIRES_TAUX = 2.5;          // % TTC du prix de vente : le barème, donc le maximum
export const DUREE = { initiale: 30, periode: 30, total: 365, preavisTerme: 8, preavisLibre: 15 } as const;
export const RETRACTATION_JOURS = 14;

/* ── Le taux des honoraires ─────────────────────────────────────────────
   2,5 % par défaut. Alexandre peut en proposer un plus bas à un client
   (1,5 %, 2 %…) depuis sa fiche : c'est une remise sur son barème, permise.
   Plus haut, non : les honoraires pratiqués ne peuvent pas dépasser le
   barème affiché. Toute valeur absente, illisible ou trop haute retombe donc
   sur le barème. Arrondi au centième (« 1,75 % »). */
export function tauxDe(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > HONORAIRES_TAUX) return HONORAIRES_TAUX;
  return Math.round(n * 100) / 100;
}

/* ── L'argent : les honoraires tiennent DANS le budget du client ──────────
   Le budget que le client donne est un total, honoraires compris. Le mandat
   fixe donc un prix maximum HORS honoraires, tel que prix + honoraires
   retombe sur son budget : à 2,5 %, on divise par 1,025 (et non « budget
   moins 2,5 % », qui laisserait le total un peu en dessous). Arrondi au
   millier inférieur. */
export function prixMaximum(budget: number | null | undefined, taux: number = HONORAIRES_TAUX): number | null {
  if (!budget || !Number.isFinite(budget) || budget <= 0) return null;
  const brut = budget / (1 + tauxDe(taux) / 100);
  return Math.floor(brut / 1000) * 1000;
}
export function honorairesPour(prix: number | null | undefined, taux: number = HONORAIRES_TAUX): number | null {
  if (!prix || !Number.isFinite(prix)) return null;
  return Math.round((prix * tauxDe(taux)) / 100);
}

/* Les montants s'écrivent avec une espace insécable normale : l'espace fine
   de toLocaleString n'existe pas dans les polices du PDF. */
export const euros = (n: number) =>
  Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ') + ' €';
export const tauxCourt = (taux: number = HONORAIRES_TAUX) => String(tauxDe(taux)).replace('.', ',') + ' %';
export const tauxTexte = (taux: number = HONORAIRES_TAUX) => tauxCourt(taux) + ' TTC';

/* ── Les nombres en toutes lettres (orthographe traditionnelle) ──────────
   « huit cent soixante-dix-huit mille », « quatre-vingt mille »,
   « deux cents millions », « vingt et un mille neuf cent cinquante ». */
const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const DIZAINES: Record<number, string> = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };
function sous100(n: number): string {
  if (n < 17) return UNITES[n];
  if (n < 20) return 'dix-' + UNITES[n - 10];
  const d = Math.floor(n / 10), u = n % 10;
  if (d <= 6) return u === 0 ? DIZAINES[d] : u === 1 ? `${DIZAINES[d]} et un` : `${DIZAINES[d]}-${UNITES[u]}`;
  if (d === 7) return u === 1 ? 'soixante et onze' : 'soixante-' + sous100(10 + u);
  if (d === 8) return u === 0 ? 'quatre-vingts' : 'quatre-vingt-' + UNITES[u];
  return 'quatre-vingt-' + sous100(10 + u);
}
function sous1000(n: number): string {
  const c = Math.floor(n / 100), r = n % 100;
  if (c === 0) return sous100(r);
  const cent = c === 1 ? 'cent' : `${UNITES[c]} cent`;
  return r ? `${cent} ${sous100(r)}` : (c === 1 ? cent : cent + 's');
}
/* « cents » et « vingts » perdent leur s devant « mille » (un adjectif),
   pas devant « millions » (un nom). */
const sansS = (t: string) => t.replace(/(cent|vingt)s$/, '$1');
export function enLettres(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zéro';
  const m = Math.floor(n / 1_000_000), k = Math.floor((n % 1_000_000) / 1000), r = n % 1000;
  const parts: string[] = [];
  if (m) parts.push(m === 1 ? 'un million' : `${sous1000(m)} millions`);
  if (k) parts.push(k === 1 ? 'mille' : `${sansS(sous1000(k))} mille`);
  if (r) parts.push(sous1000(r));
  return parts.join(' ');
}

/* ── Les dates, toujours à l'heure de Paris ── */
export function dateLongue(iso: string | Date) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(iso));
}
export function dateCourte(iso: string | Date) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(iso));
}
export function heureParis(iso: string | Date, secondes = false) {
  const p = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', ...(secondes ? { second: '2-digit' } : {}),
  }).formatToParts(new Date(iso));
  const v = (t: string) => p.find(x => x.type === t)?.value || '00';
  return secondes ? `${v('hour')} h ${v('minute')} min ${v('second')} s` : `${v('hour')} h ${v('minute')}`;
}
/* « 1985-03-12 » → « 12/03/1985 », sans passer par un fuseau horaire. */
export function jourFr(ymd: string | null | undefined) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(ymd || '');
}

/* ══ Les données d'un mandat ════════════════════════════════════════════ */

export type Mandant = {
  civilite: 'Madame' | 'Monsieur' | '';
  prenom: string;
  nom: string;
  naissanceDate: string;      // AAAA-MM-JJ
  naissanceLieu: string;
  adresse: string;
  email: string;
  telephone: string;
};

export type Recherche = {
  typeBien: string | null;
  piecesMin: number | null;
  chambresMin: number | null;
  surfaceMin: number | null;
  secteurs: string[];
  budget: number | null;      // le budget total du client, honoraires compris
  /* Le taux des honoraires proposé à ce client (recherches.mandat_taux).
     Absent : le barème, 2,5 %. Il voyage avec la recherche parce que c'est
     elle que l'écran et le PDF reçoivent ; on le lit toujours par tauxDe(). */
  taux?: number | null;
};

export type DonneesMandat = {
  numero: string;
  mandant: Mandant | null;              // null tant que le client n'a pas confirmé ses coordonnées
  recherche: Recherche;
  executionImmediate: boolean | null;   // null tant qu'il n'a pas choisi
  signature?: { le: string; email: string } | null;
};

/* Ce qui est figé dans la ligne de signature : le texte ne dépend plus des
   critères du moment, qui peuvent bouger après coup. */
export type Contenu = {
  recherche: Recherche;
  prixMax: number | null;
  honoraires: number | null;
  taux: number;
  duree: typeof DUREE;
};
export function figerContenu(r: Recherche): Contenu {
  const taux = tauxDe(r.taux);
  const prixMax = prixMaximum(r.budget, taux);
  return { recherche: { ...r, taux }, prixMax, honoraires: honorairesPour(prixMax, taux), taux, duree: DUREE };
}

/* L'empreinte de ce que le client a sous les yeux : taux, prix maximum et
   description du bien. L'écran l'envoie avec sa demande de code ; le
   serveur la recalcule sur la fiche du moment. Si Alexandre a changé le
   taux (ou si les critères ont bougé) entre-temps, elles diffèrent, et le
   client relit la nouvelle version avant de signer — jamais l'inverse. */
export function versionMandat(r: Recherche): string {
  const c = figerContenu(r);
  return `${c.taux}|${c.prixMax ?? ''}|${decrireRecherche(r)}`;
}

/* ── La recherche du moment dépasse-t-elle le mandat signé ? ──
   Le mandat est volontairement large (« environ », « ou à proximité »),
   mais trois choses le bornent : le prix maximum, les secteurs cités et le
   type de bien. Si le client monte son budget, ajoute un secteur ou un type
   de bien, un achat peut sortir du mandat — et les honoraires avec. On le
   signale à Alexandre ; lui seul juge s'il faut un nouveau mandat. */
export function horsMandat(signe: Contenu, r: Recherche): string[] {
  const out: string[] = [];
  const n = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const pm = prixMaximum(r.budget, signe.taux);
  if (pm && signe.prixMax && pm > signe.prixMax) {
    out.push(`Prix maximum : ${euros(signe.prixMax)} sur le mandat, ${euros(pm)} avec son budget de ${euros(r.budget || 0)}`);
  }
  const avant = (signe.recherche.secteurs || []).map(n);
  if (avant.length) {
    const nouveaux = r.secteurs.filter(x => !avant.includes(n(x)));
    if (nouveaux.length) out.push(`${nouveaux.length > 1 ? 'Secteurs absents' : 'Secteur absent'} du mandat : ${nouveaux.join(', ')}`);
    else if (!r.secteurs.length) out.push(`Il ne précise plus de secteur (le mandat cite ${signe.recherche.secteurs.join(', ')})`);
  }
  const types = (t: string | null) => String(t || '').split(',').map(x => x.trim()).filter(Boolean);
  const tAvant = types(signe.recherche.typeBien).map(n);
  if (tAvant.length) {
    const nouveaux = types(r.typeBien).filter(x => !tAvant.includes(n(x)));
    if (nouveaux.length) out.push(`Type de bien absent du mandat : ${nouveaux.join(', ').toLowerCase()}`);
    else if (!types(r.typeBien).length) out.push(`Il ne précise plus de type de bien (le mandat dit : ${String(signe.recherche.typeBien).toLowerCase()})`);
  }
  return out;
}

/* Le bien recherché, en une phrase. */
export function decrireRecherche(r: Recherche): string {
  const types = String(r.typeBien || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const quoi = types.length ? types.join(' ou ') : 'bien immobilier à usage d’habitation';
  const bouts: string[] = [];
  /* Volontairement « environ » : le mandat décrit l'essentiel, sans
     enfermer la recherche. Un bien de 78 m² trouvé pour un client qui en
     voulait 80 doit rester dans le mandat — sinon c'est la rémunération
     d'Alexandre qui en sort. Les « plus » (balcon, étage, DPE…) ne sont pas
     repris ici : ils vivent dans l'espace et évoluent avec lui. */
  if (r.piecesMin) {
    const ch = r.chambresMin ? `, dont ${r.chambresMin} chambre${r.chambresMin > 1 ? 's' : ''}` : '';
    bouts.push(`de ${r.piecesMin} pièce${r.piecesMin > 1 ? 's' : ''} environ${ch}`);
  } else if (r.chambresMin) {
    bouts.push(`de ${r.chambresMin} chambre${r.chambresMin > 1 ? 's' : ''} environ`);
  }
  if (r.surfaceMin) bouts.push(`d’une surface de ${r.surfaceMin}\u00a0m² environ ou plus`);
  const ou = r.secteurs.length ? `, situé à ${r.secteurs.join(', ').replace(/, ([^,]*)$/, ' ou $1')}, ou à proximité` : '';
  const debut = quoi.charAt(0).toUpperCase() + quoi.slice(1);
  return `${debut}${bouts.length ? ', ' + bouts.join(', ') : ''}${ou}.`;
}

/* La même chose en deux lignes courtes, pour une case : « Appartement ·
   4 pièces et plus » puis « Boulogne-Billancourt, Paris 16e · 80 m² et plus ». */
export function decrireCourt(r: Recherche): { valeur: string; detail: string } {
  const types = String(r.typeBien || '').split(',').map(x => x.trim()).filter(Boolean);
  const quoi = types.length ? types.join(' ou ') : 'Bien à usage d’habitation';
  const pieces = r.piecesMin ? `${r.piecesMin} pièce${r.piecesMin > 1 ? 's' : ''} environ` : '';
  const ou = r.secteurs.length > 2 ? `${r.secteurs.slice(0, 2).join(', ')} et ${r.secteurs.length - 2} autre${r.secteurs.length > 3 ? 's' : ''} secteur${r.secteurs.length > 3 ? 's' : ''}` : r.secteurs.join(', ');
  const surf = r.surfaceMin ? `${r.surfaceMin}\u00a0m² environ` : '';
  return {
    valeur: [quoi.charAt(0).toUpperCase() + quoi.slice(1), pieces].filter(Boolean).join(' · '),
    detail: [ou, surf].filter(Boolean).join(' · ') || 'selon les critères de votre espace',
  };
}

/* L'essentiel du mandat en quatre cases : la page de garde du PDF et le
   récapitulatif de l'espace disent exactement la même chose. */
export type Resume = { titre: string; valeur: string; detail: string }[];
export function resumeMandat(r: Recherche): Resume {
  const c = figerContenu(r);
  return [
    { titre: 'Le bien recherché', ...decrireCourt(r) },
    c.prixMax
      ? { titre: 'Prix maximum', valeur: `${euros(c.prixMax)} hors honoraires`, detail: `soit ${euros(r.budget || 0)} honoraires compris` }
      : { titre: 'Prix maximum', valeur: 'Votre budget', detail: 'tel qu’indiqué dans votre espace' },
    { titre: 'Honoraires', valeur: `${tauxTexte(c.taux)} du prix`, detail: 'réglés le jour de l’acte, chez le notaire' },
    { titre: 'Durée', valeur: `${DUREE.initiale} jours, renouvelables`, detail: `${DUREE.total} jours au plus · ${RETRACTATION_JOURS} jours pour changer d’avis` },
  ];
}

/* ══ Le texte ═══════════════════════════════════════════════════════════
   Un document = des parties ; une partie = des sections ; une section = des
   blocs. C'est tout ce que savent dessiner l'écran et le PDF — et ils le
   dessinent de la même façon : des fiches à icône pour l'information
   précontractuelle, des encadrés pour les phrases qui engagent, une liste
   cochée pour nos engagements, et les longs articles de loi en annexe. */

/* Les icônes, tracées sur une grille de 24 × 24 (traits, pas d'aplats).
   Une seule source : l'écran les met dans un <svg>, le PDF dans un chemin. */
export const ICONES = {
  agence: ['M4 21V6.5L12 3l8 3.5V21', 'M2.5 21h19', 'M9.5 21v-5h5v5', 'M8.5 9h1.5', 'M14 9h1.5', 'M8.5 12.5h1.5', 'M14 12.5h1.5'],
  bouclier: ['M12 3l7 3v5.5c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6z', 'M8.8 12.2l2.2 2.2 4.4-4.6'],
  loupe: ['M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'M15.5 15.5L20.5 20.5'],
  calendrier: ['M4 6h16v15H4z', 'M4 10.5h16', 'M8.5 3.5v4', 'M15.5 3.5v4', 'M8 14.5h2', 'M14 14.5h2', 'M8 17.5h2'],
  euro: ['M17.5 6.5a6.5 6.5 0 1 0 0 11', 'M4.5 10.5h9', 'M4.5 13.5h9'],
  banque: ['M3 9.5L12 4l9 5.5', 'M5 10v8', 'M9.7 10v8', 'M14.3 10v8', 'M19 10v8', 'M3 20.5h18'],
  retour: ['M9 13.5L4.5 9 9 4.5', 'M4.5 9h10a5 5 0 0 1 0 10h-3.5'],
  balance: ['M12 4v16', 'M8 20h8', 'M5 7.5h14', 'M5 7.5L2.5 13.5h5z', 'M19 7.5l-2.5 6h5z'],
  livre: ['M5 5.5a2.5 2.5 0 0 1 2.5-2.5H19v15H7.5A2.5 2.5 0 0 0 5 20.5z', 'M5 20.5A2.5 2.5 0 0 1 7.5 18H19v3H7.5', 'M9 7.5h6'],
  tel: ['M6.2 3h3.1l1.5 3.9-2 1.3a13.4 13.4 0 0 0 6.9 6.9l1.3-2 3.9 1.5v3.1a1.9 1.9 0 0 1-2.1 1.9A17.6 17.6 0 0 1 3.1 5.1 1.9 1.9 0 0 1 5 3z'],
  personne: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4.5 20.5a7.5 7.5 0 0 1 15 0'],
  maison: ['M3.5 11L12 4l8.5 7', 'M5.5 9.5V20h13V9.5', 'M10 20v-5.5h4V20'],
  etiquette: ['M3.5 12.5V4h8.5l9 9-8.5 8.5z', 'M8 7.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z'],
  etoile: ['M12 3.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z'],
  doc: ['M7 3h7l4 4v14H7z', 'M14 3v4h4', 'M10 12h5', 'M10 16h5'],
  cadenas: ['M5.5 11h13v10h-13z', 'M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11', 'M12 15v2.5'],
  info: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12 11v5.5', 'M12 7.8v.4'],
  plume: ['M4 20l4-1 10-10-3-3L5 16z', 'M13 6l3 3'],
  accord: ['M4 12.5l3.5 3.5L14 9.5', 'M10 15.5l1.5 1.5L20 8.5'],
  check: ['M5 12.5l4.2 4.2L19 7'],
} as const;
export type Icone = keyof typeof ICONES;

/* Une fiche : un encart à icône. `note` est la phrase à retenir (en gras,
   soulignée d'or) ; `large` prend toute la largeur ; `pied` ferme la fiche. */
export type Fiche = { ic: Icone; titre: string; lignes: string[]; note?: string; large?: boolean; pied?: string };

export type Bloc =
  | { t: 'p'; x: string; g?: boolean; petit?: boolean }  // un paragraphe (g : il engage → encadré)
  | { t: 'l'; items: string[] }                          // une liste à puces
  | { t: 'coches'; items: string[] }                     // une liste cochée (nos engagements)
  | { t: 'fiches'; items: Fiche[] }                      // des fiches à icône, deux par ligne
  | { t: 'case'; x: string; coche: boolean }             // une case à cocher
  | { t: 'sig' };                                        // le cartouche des signatures
export type Section = { titre?: string; ic?: Icone; blocs: Bloc[] };
/* `court` : son nom dans le sommaire de la page de garde. */
export type Partie = { titre: string; court: string; sous?: string; ic: Icone; sections: Section[] };

const P = (x: string, g = false): Bloc => ({ t: 'p', x, g });

export function titreMandat(numero: string) {
  return `Mandat de recherche non exclusif d’un bien à acquérir n° ${numero || '…'}`;
}

export function redigerMandat(d: DonneesMandat): Partie[] {
  const c = figerContenu(d.recherche);
  const A = AGENCE;
  const m = d.mandant;
  const prix = c.prixMax;
  const hono = c.honoraires;
  const remise = c.taux < HONORAIRES_TAUX;

  /* ─── 1. L'information précontractuelle : tout ce que la loi veut qu'il
     sache avant de signer, en fiches courtes. Rien n'est retiré du modèle,
     tout est dit plus simplement. ─── */
  const info: Partie = {
    titre: 'Information précontractuelle',
    court: 'Information précontractuelle',
    sous: 'Ce qu’il faut savoir avant de signer',
    ic: 'info',
    sections: [
      { blocs: [
        P(`Ce document vous est remis par ${SIGNATAIRE.nom}, ${SIGNATAIRE.qualite}, avant la signature de votre mandat de recherche, comme le prévoit le Code de la consommation.`),
        { t: 'fiches', items: [
          { ic: 'agence', titre: 'Notre agence', lignes: [
            `${A.nom}, exploitée par ${A.societe}, ${A.forme}, ${A.siege} — ${A.rcs}.`,
            `Carte professionnelle ${A.carteMention} n° ${A.carte}, délivrée par ${A.carteDelivree}.`,
            `${A.tel} · ${A.mail} · ${A.site}`,
          ] },
          { ic: 'bouclier', titre: 'Nos garanties', lignes: [
            `Responsabilité civile professionnelle : ${A.assureur}, ${A.assureurAdresse}, police n° ${A.police}, valable en France.`,
            `TVA intracommunautaire : ${A.tva}.`,
          ], note: 'L’Agence ne peut recevoir ni détenir d’autres fonds, effets ou valeurs que ceux représentatifs de sa rémunération.' },
          { ic: 'loupe', titre: 'Notre mission', lignes: [
            'Trouver pour vous un bien à acheter qui correspond à vos critères (type, situation, prix…), précisés dans le mandat.',
            'Mandat simple : vous restez libre de chercher par vous-même et de confier d’autres mandats non exclusifs.',
            'Nous vous rendons compte de nos recherches, avec un compte rendu après chaque visite.',
          ], note: 'Pendant le mandat et les 12 mois qui suivent, vous ne pouvez pas acheter sans l’Agence un bien qu’elle vous a présenté.' },
          { ic: 'calendrier', titre: 'Durée', lignes: [
            `${DUREE.initiale} jours, renouvelés automatiquement par périodes de ${DUREE.periode} jours, ${DUREE.total} jours au plus.`,
            `Vous pouvez y mettre fin à chaque échéance, en prévenant l’Agence ${DUREE.preavisTerme} jours avant.`,
            `Après trois mois, vous pouvez le résilier à tout moment par lettre recommandée avec avis de réception, avec un préavis de ${DUREE.preavisLibre} jours.`,
          ] },
          { ic: 'euro', titre: 'Honoraires', lignes: [
            `${tauxTexte(c.taux)} du prix d’achat, à votre charge, dus seulement si vous achetez grâce à notre intermédiation.`,
            ...(prix && hono ? [`Par exemple, pour un prix de ${euros(prix)} : ${euros(hono)} TTC.`] : []),
            remise
              ? `Taux remisé : notre barème, consultable sur ${A.site}, prévoit ${tauxTexte(HONORAIRES_TAUX)}.`
              : `Notre barème est consultable sur ${A.site}.`,
          ] },
          { ic: 'banque', titre: 'Paiement', lignes: [
            'Le jour de la signature de l’acte authentique de vente, par virement, par l’intermédiaire du notaire chargé de la vente.',
          ], note: 'Aucune somme ne vous est demandée avant.' },
          { ic: 'retour', titre: `Votre droit de rétractation : ${RETRACTATION_JOURS} jours`, large: true, lignes: [
            `Votre mandat étant conclu à distance (article L221-1 du Code de la consommation), vous pouvez vous rétracter sans donner de motif pendant ${RETRACTATION_JOURS} jours. Le délai part du lendemain de la signature et finit à la dernière heure du dernier jour ; s’il finit un samedi, un dimanche ou un jour férié ou chômé, il est prolongé jusqu’au premier jour ouvrable suivant.`,
            'Pour vous rétracter : une déclaration claire, par lettre ou par e-mail, avec le formulaire joint si vous le souhaitez (il n’est pas obligatoire) — ou en ligne depuis votre espace personnel, rubrique « Mon mandat », lien « Renoncer au mandat », pendant tout le délai. Un accusé de réception vous est alors envoyé sans délai par e-mail.',
            'La rétractation met fin aux obligations de chacun.',
            'L’Agence ne commence sa mission qu’à la fin de ce délai, sauf si vous lui demandez expressément de commencer plus tôt, à la signature ou plus tard. Vous gardez alors votre droit de vous rétracter, dans les mêmes conditions, tant que la mission n’est pas entièrement exécutée.',
          ] },
          { ic: 'balance', titre: 'En cas de désaccord', large: true, lignes: [
            'Adressez d’abord une réclamation écrite à l’Agence. Si la réponse ne vous satisfait pas, ou sans réponse sous 30 jours, vous pouvez saisir gratuitement le médiateur de la consommation, inscrit sur la liste des médiateurs agréés par la Commission d’évaluation et de contrôle de la médiation :',
          ], note: `${MEDIATEUR.nom} · ${MEDIATEUR.adresse} · ${MEDIATEUR.site}` },
          { ic: 'livre', titre: 'Le cadre de notre métier', large: true, lignes: [
            'Loi du 2 janvier 1970 (dite loi Hoguet) et son décret d’application du 20 juillet 1972.',
            'Code de déontologie des professionnels de l’immobilier, annexé au décret du 28 août 2015.',
            'Textes consultables gratuitement sur www.legifrance.gouv.fr. La loi applicable est la loi française.',
          ] },
        ] },
      ] },
    ],
  };

  /* ─── 2. Le mandat ─── */
  const naissance = m && m.naissanceDate
    ? `Né${m.civilite === 'Madame' ? 'e' : ''} le ${jourFr(m.naissanceDate)} à ${m.naissanceLieu}` : '';
  const mandant: Fiche = m
    ? { ic: 'personne', titre: `${m.civilite ? m.civilite + ' ' : ''}${m.prenom} ${m.nom.toUpperCase()}`, lignes: [
        ...(naissance ? [naissance] : []),
        `Demeurant ${m.adresse}`,
        `Téléphone : ${m.telephone || '—'} · ${m.email}`,
      ], pied: 'Ci-après « le MANDANT », d’une part,' }
    : { ic: 'personne', titre: 'Vous', lignes: ['Vos nom, date et lieu de naissance, adresse et coordonnées : à l’étape suivante.'], pied: 'Ci-après « le MANDANT », d’une part,' };
  const mandataire: Fiche = { ic: 'agence', titre: A.nom, lignes: [
    `${A.adresse}, ${A.cp} ${A.ville} · ${A.tel} · ${A.mail}`,
    `Exploitée par ${A.societe}, ${A.forme}, siège ${A.siege}, ${A.rcs}, TVA ${A.tva}.`,
    `Carte professionnelle ${A.carteMention} n° ${A.carte}, délivrée par ${A.carteDelivree}.`,
    `RCP : ${A.assureur}, ${A.assureurAdresse}, police n° ${A.police}, sur le territoire national.`,
    `Représentée par ${SIGNATAIRE.nom}, agissant en qualité de ${SIGNATAIRE.qualite}, ayant tous pouvoirs à l’effet des présentes.`,
  ], note: 'Déclare ne pouvoir ni recevoir ni détenir d’autres fonds, effets ou valeurs que ceux représentatifs de sa rémunération.',
  pied: 'Ci-après « l’Agence » ou « le MANDATAIRE », d’autre part,' };

  const prixBloc: Bloc[] = prix
    ? [
      P(`Le prix d’acquisition, hors honoraires, ne pourra excéder ${euros(prix)} (${enLettres(prix)} euros).`, true),
      P(`Augmenté des honoraires prévus ci-dessous, ce montant correspond au budget total de ${euros(d.recherche.budget || 0)}, honoraires compris, indiqué par le MANDANT. Il pourra être modifié à la demande du MANDANT, par écrit, y compris depuis son espace personnel.`),
    ]
    : [P('Le prix d’acquisition, hors honoraires, correspondra au budget indiqué par le MANDANT, tel qu’il figure dans son espace personnel. Il pourra être modifié à sa demande, par écrit, y compris depuis cet espace.')];

  const mandat: Partie = {
    titre: titreMandat(d.numero),
    court: 'Le mandat de recherche',
    sous: 'Mandat simple, non exclusif',
    ic: 'doc',
    sections: [
      { titre: 'Entre les soussignés', blocs: [{ t: 'fiches', items: [mandant, mandataire] }] },
      { titre: 'Il a été convenu et arrêté ce qui suit', blocs: [
        P('Le MANDANT confère au MANDATAIRE, qui accepte, un MANDAT NON EXCLUSIF DE RECHERCHER UN BIEN correspondant à la description qui suit.', true),
      ] },
      { titre: 'Désignation des biens recherchés', ic: 'maison', blocs: [
        P(decrireRecherche(d.recherche), true),
        P('Et, plus généralement, tout bien correspondant aux critères de recherche du MANDANT tels qu’ils figurent dans son espace personnel, et tels qu’ils pourront évoluer à sa demande, ainsi que tout autre bien présenté par le MANDATAIRE que le MANDANT accepterait de visiter.'),
      ] },
      { titre: 'Prix', ic: 'etiquette', blocs: prixBloc },
      { titre: 'Honoraires du mandataire', ic: 'euro', blocs: [
        P(`En cas de réalisation de l’opération, les honoraires de l’Agence seront d’un montant de ${tauxTexte(c.taux)} du prix de vente${prix && hono ? `, soit ${euros(hono)} TTC pour un prix de ${euros(prix)}` : ''}, sauf accord ultérieur entre les parties par avenant aux présentes.`),
        ...(remise ? [P(`Ce taux tient compte d’une remise consentie par l’Agence sur son barème, qui prévoit ${tauxTexte(HONORAIRES_TAUX)} pour une mission de recherche.`)] : []),
        P('Ces honoraires seront à la charge de l’acquéreur, le MANDANT. Ils ne sont pas compris dans le prix d’acquisition indiqué ci-dessus.', true),
        P('Les honoraires seront payables une fois l’acte authentique de vente effectivement signé, et le taux de TVA appliqué sera le taux en vigueur à la date de leur exigibilité. En cas d’exercice d’un droit de préemption, le titulaire de ce droit sera subrogé dans tous les droits et obligations de l’acquéreur ; il sera notamment tenu de régler les honoraires du MANDATAIRE.'),
      ] },
      { titre: 'Durée du mandat', ic: 'calendrier', blocs: [
        P(`Le présent MANDAT, qui prend effet le jour de sa signature, est consenti pour une durée de ${enLettres(DUREE.initiale)} (${DUREE.initiale}) jours. À l’issue de sa durée initiale, il se renouvellera par tacite reconduction, par périodes de ${enLettres(DUREE.periode)} (${DUREE.periode}) jours, sans que la durée totale du mandat puisse dépasser ${enLettres(DUREE.total)} (${DUREE.total}) jours à compter de la date de sa signature.`, true),
        P(`Il pourra être dénoncé pour le terme de la période initiale ou de chaque période de reconduction par chacune des parties, à charge pour celle qui entend y mettre fin d’en aviser l’autre partie ${enLettres(DUREE.preavisTerme).toUpperCase()} jours au moins à l’avance par lettre recommandée avec demande d’avis de réception.`),
        P(`Cependant, passé un délai de trois mois à compter de sa signature, le mandat pourra être dénoncé à tout moment par chacune des parties, à charge pour celle qui entend y mettre fin d’en aviser l’autre partie ${enLettres(DUREE.preavisLibre).toUpperCase()} jours au moins à l’avance par lettre recommandée avec demande d’avis de réception, conformément au deuxième alinéa de l’article 78 du décret du 20 juillet 1972.`, true),
        P('En application de l’article L215-4 du Code de la consommation, les dispositions des articles L215-1 à L215-3 et L241-3 dudit code sont intégralement reproduites en annexe du présent mandat, dont elles font partie.'),
      ] },
      { titre: 'Engagements du mandant', ic: 'personne', blocs: [
        P('Le MANDANT s’engage à exécuter le présent mandat de bonne foi.', true),
        P('Le MANDANT déclare, sous sa propre responsabilité :'),
        { t: 'l', items: [
          'avoir la capacité juridique d’acquérir les biens et ne faire l’objet d’aucune mesure restreignant sa capacité à agir (tutelle, curatelle, etc.) ;',
          'ne pas avoir fait l’objet d’une condamnation à la peine complémentaire d’interdiction d’acquérir, directement ou non, un bien immobilier à usage d’habitation, à d’autres fins que son occupation à titre personnel, prévue par les articles 225-19 du Code pénal, L511-6 du Code de la construction et de l’habitation et L1337-4 du Code de la santé publique ;',
          'ne pas avoir déjà consenti un mandat de recherche exclusif portant sur les mêmes biens à acquérir, non expiré ou non dénoncé.',
        ] },
        P('Le MANDANT autorise le MANDATAIRE :'),
        { t: 'l', items: [
          'à déléguer le présent mandat à tout professionnel choisi par ce dernier et dûment habilité à cet effet ;',
          'à établir tous les actes sous seing privé nécessaires à l’accomplissement des présentes. Le MANDANT s’engage, lors de la signature d’une promesse de vente portant sur les biens recherchés, à verser à titre de dépôt de garantie une somme au plus égale à 10 % du prix de vente.',
        ] },
        P('Le MANDANT s’engage à informer immédiatement le MANDATAIRE s’il accepte une offre d’achat, s’il signe tout contrat préparatoire à l’achat ou s’il achète les biens sans l’intermédiaire du MANDATAIRE, et à lui communiquer à première demande les coordonnées du propriétaire du bien, le prix de l’acquisition, les nom et adresse du notaire chargé d’établir l’acte de vente ainsi que, le cas échéant, les coordonnées de l’intermédiaire qui aura concouru à la réalisation de l’acquisition.'),
        P('Pendant la durée d’exécution du présent mandat et durant les douze mois suivant son expiration ou sa résiliation, le MANDANT s’interdit de traiter directement ou indirectement, en son nom ou sous la forme de toute société dans laquelle il aurait une participation, avec un vendeur dont le bien lui aurait été présenté par le MANDATAIRE ou par un mandataire substitué. Il se porte fort du respect de cette interdiction par son conjoint, son partenaire de PACS, son concubin et toute personne avec laquelle il se porterait acquéreur.', true),
      ] },
      { titre: 'Engagements du mandataire', ic: 'etoile', blocs: [
        P('En conséquence du présent mandat, le MANDATAIRE entreprendra toutes les démarches et toutes les recherches qu’il jugera nécessaires en vue de réaliser la mission confiée. Il s’engage notamment à :'),
        { t: 'coches', items: [
          'Suivre chaque jour l’ensemble des annonces immobilières correspondant aux critères du MANDANT, y compris celles publiées par des particuliers.',
          'Rechercher des biens hors marché auprès de son réseau de confrères.',
          'Solliciter son carnet d’adresses privé.',
          'Visiter les biens susceptibles de correspondre aux critères du MANDANT avant de les lui proposer.',
          'Étudier le dossier de chaque bien avant toute offre : diagnostics, documents de copropriété, charges et travaux votés.',
          'Accompagner le MANDANT dans la négociation du prix.',
          'L’accompagner jusqu’à la signature de l’acte authentique chez le notaire.',
          'Tenir à jour, dans l’espace personnel du MANDANT, le suivi de sa recherche et les biens présentés.',
        ] },
        P('Le MANDATAIRE visitera les biens susceptibles de correspondre aux critères des biens recherchés. Il obtiendra des vendeurs tous les renseignements utiles, ainsi que la communication de tous les certificats et documents imposés par la réglementation.'),
      ] },
      { titre: 'Reddition des comptes', ic: 'doc', blocs: [
        P('Le MANDATAIRE s’engage à tenir informé le MANDANT du suivi de ses recherches et à lui communiquer, après chaque visite d’un bien répondant aux caractéristiques des biens recherchés, un compte rendu mentionnant ses observations éventuelles.'),
      ] },
      { titre: 'Données personnelles', ic: 'cadenas', blocs: [
        P('Les données personnelles du MANDANT, collectées par le MANDATAIRE à l’occasion des présentes, font l’objet des traitements informatiques nécessaires à leur exécution :'),
        { t: 'l', items: [
          'responsable du traitement : le MANDATAIRE ;',
          'finalités : la conclusion, l’exécution et le suivi du mandat, la gestion de la relation contractuelle et commerciale, la communication, la gestion des fichiers clients et prospects, et le respect des obligations légales et réglementaires de l’Agence, notamment en matière de lutte contre le blanchiment de capitaux et le financement du terrorisme ;',
          'fondements : le présent contrat, le respect d’obligations légales ou la poursuite d’intérêts légitimes ;',
          'destinataires : les prestataires informatiques qui en assurent le traitement, l’hébergement et l’archivage, à des fins exclusivement techniques ; les intervenants de l’opération ou de l’exécution d’obligations légales, notamment notaires, diagnostiqueurs, prestataires de lettre recommandée électronique et, le cas échéant, les professionnels de l’immobilier intervenant par délégation de mandat ou partenariat ;',
          'prospection : elles peuvent servir aux opérations de prospection du MANDATAIRE, dans le respect de la réglementation ;',
          'durée de conservation : celle de l’exécution des présentes, augmentée des délais légaux de prescription.',
        ] },
        P(`Le MANDANT dispose des droits d’accès, de rectification, d’effacement, de limitation, d’opposition et, dans les conditions prévues par la réglementation, de portabilité de ses données, en écrivant à ${A.mail} ou à l’adresse de l’Agence. Il peut introduire une réclamation auprès de la CNIL (www.cnil.fr).`),
      ] },
      { titre: 'Démarchage téléphonique', ic: 'tel', blocs: [
        P('Le consommateur est informé qu’il est interdit de le démarcher par téléphone sans son consentement préalable, sauf lorsque cette sollicitation téléphonique effectuée à des fins commerciales intervient dans le cadre de l’exécution d’un contrat en cours au sens du quatrième alinéa de l’article L223-1 du Code de la consommation. Le MANDANT déclare ne pas avoir fait l’objet d’un démarchage non autorisé avant la signature du présent mandat.'),
      ] },
      { titre: 'Information du mandant', ic: 'info', blocs: [
        P('En sa qualité de consommateur, le MANDANT reconnaît avoir reçu du MANDATAIRE, avant la signature du présent mandat, toutes les informations utiles au titre de l’obligation d’information précontractuelle.'),
        P(`En cas de différend, le MANDANT est informé qu’il devra adresser une réclamation écrite au MANDATAIRE. Si la réponse ne le satisfait pas, ou en l’absence de réponse dans un délai de 30 jours, il pourra saisir gratuitement le médiateur de la consommation : ${MEDIATEUR.nom}, ${MEDIATEUR.adresse}, ${MEDIATEUR.site}.`),
      ] },
      { titre: 'Droit de rétractation', ic: 'retour', blocs: [
        P(`Le présent mandat étant conclu à distance, le MANDANT est informé qu’il bénéficie, en application des articles L221-18 et suivants du Code de la consommation, d’un délai de ${enLettres(RETRACTATION_JOURS)} jours pour exercer, sans motif, son droit de rétractation. Il reconnaît avoir reçu du MANDATAIRE, préalablement à la conclusion du présent mandat, les informations prévues par l’article L221-5 dudit code.`, true),
        P('Le délai commence à courir le lendemain de la conclusion du présent mandat et prend fin à l’expiration de la dernière heure du dernier jour. S’il expire un samedi, un dimanche ou un jour férié ou chômé, il est prorogé jusqu’au premier jour ouvrable suivant.'),
        P('S’il souhaite exercer son droit de rétractation, le MANDANT peut utiliser le formulaire de rétractation annexé aux présentes, ou adresser au MANDATAIRE une déclaration écrite claire et dénuée d’ambiguïté. Le mandat ayant été conclu au moyen d’une interface en ligne, il peut également se rétracter depuis son espace personnel, par le lien « Renoncer au mandat » de la rubrique « Mon mandat », disponible pendant toute la durée du délai ; un accusé de réception lui est alors adressé sans délai par courrier électronique.'),
        P('L’exercice du droit de rétractation met fin aux obligations réciproques des parties d’exécuter le contrat.'),
        P('Le MANDANT est informé que le MANDATAIRE ne commencera à exécuter sa mission qu’à l’issue du délai de rétractation, sauf demande expresse de sa part. Dans ce cas, il conserve néanmoins son droit de se rétracter, dans les délais et formes décrits ci-dessus, tant que le MANDATAIRE n’a pas entièrement exécuté le contrat.'),
        { t: 'case', coche: d.executionImmediate === true, x: `Le MANDANT DEMANDE EXPRESSÉMENT au MANDATAIRE de commencer à exécuter le présent mandat dès sa signature, sans attendre la fin du délai de rétractation de ${RETRACTATION_JOURS} jours, et RECONNAÎT qu’après que le MANDATAIRE aura entièrement exécuté le contrat, il ne disposera plus du droit de se rétracter.` },
        { t: 'case', coche: d.executionImmediate === false, x: `Le MANDANT INDIQUE QU’IL NE SOUHAITE PAS que le MANDATAIRE commence à exécuter le présent mandat dès sa signature. L’exécution du mandat débutera après la fin du délai de rétractation de ${RETRACTATION_JOURS} jours, à moins d’une demande expresse ultérieure d’exécution anticipée formulée par le MANDANT.` },
      ] },
      { titre: 'Date et signatures', ic: 'plume', blocs: [
        P(`Fait à Paris${d.signature ? `, le ${dateLongue(d.signature.le)}` : ''}, et signé électroniquement par l’ensemble des parties, chacune d’elles en conservant un exemplaire sur un support durable garantissant l’intégrité de l’acte. Le MANDANT signe depuis son espace personnel, après vérification de son adresse électronique par un code à usage unique ; le détail de la signature figure dans le certificat de signature, en dernière page du présent document.`),
        { t: 'sig' },
      ] },
    ],
  };

  /* ─── 3. L'annexe : les articles que la loi veut voir recopiés mot pour
     mot. Ils gardent leur place dans le mandat, sans l'alourdir. ─── */
  const annexe: Partie = {
    titre: 'Annexe au mandat',
    court: 'Annexe : articles reproduits',
    sous: 'Articles du Code de la consommation reproduits (article L215-4)',
    ic: 'livre',
    sections: [
      { titre: 'Article L215-1', blocs: [
        { t: 'p', petit: true, x: 'Pour les contrats de prestations de services conclus pour une durée déterminée avec une clause de reconduction tacite, le professionnel prestataire de services informe le consommateur par écrit, par lettre nominative ou courrier électronique dédiés, au plus tôt trois mois et au plus tard un mois avant le terme de la période autorisant le rejet de la reconduction, de la possibilité de ne pas reconduire le contrat qu’il a conclu avec une clause de reconduction tacite. Cette information, délivrée dans des termes clairs et compréhensibles, mentionne, dans un encadré apparent, la date limite de non-reconduction.' },
        { t: 'p', petit: true, x: 'Lorsque cette information ne lui a pas été adressée conformément aux dispositions du premier alinéa, le consommateur peut mettre gratuitement un terme au contrat, à tout moment à compter de la date de reconduction. Les avances effectuées après la dernière date de reconduction ou, s’agissant des contrats à durée indéterminée, après la date de transformation du contrat initial à durée déterminée, sont dans ce cas remboursées dans un délai de trente jours à compter de la date de résiliation, déduction faite des sommes correspondant, jusqu’à celle-ci, à l’exécution du contrat.' },
        { t: 'p', petit: true, x: 'Les dispositions du présent article s’appliquent sans préjudice de celles qui soumettent légalement certains contrats à des règles particulières en ce qui concerne l’information du consommateur.' },
      ] },
      { titre: 'Article L215-2', blocs: [
        { t: 'p', petit: true, x: 'Les dispositions du présent chapitre ne sont pas applicables aux exploitants des services d’eau potable et d’assainissement.' },
      ] },
      { titre: 'Article L215-3', blocs: [
        { t: 'p', petit: true, x: 'Les dispositions du présent chapitre sont également applicables aux contrats conclus entre des professionnels et des non-professionnels.' },
      ] },
      { titre: 'Article L241-3', blocs: [
        { t: 'p', petit: true, x: 'Lorsque le professionnel n’a pas procédé au remboursement dans les conditions prévues à l’article L215-1, les sommes dues sont productives d’intérêts au taux légal.' },
      ] },
    ],
  };

  /* ─── 4. Le formulaire de rétractation (obligatoire : sans lui, le délai
     serait prolongé de douze mois, article L221-20). ─── */
  const formulaire: Partie = {
    titre: 'Formulaire de rétractation',
    court: 'Formulaire de rétractation',
    sous: 'À renvoyer uniquement si vous souhaitez vous rétracter',
    ic: 'retour',
    sections: [{ blocs: [
      P('Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du contrat.'),
      P(`À l’attention de : ${A.nom}, ${A.adresse}, ${A.cp} ${A.ville} — ${A.mail} — ${A.tel}`, true),
      { t: 'l', items: [
        `Je vous notifie par la présente ma rétractation du contrat portant sur la prestation de service ci-dessous : ${titreMandat(d.numero)}.`,
        `Conclu le : ${d.signature ? dateCourte(d.signature.le) : '………………'}`,
        `Nom du consommateur : ${m ? `${m.prenom} ${m.nom.toUpperCase()}` : '………………'}`,
        `Adresse du consommateur : ${m ? m.adresse : '………………'}`,
        'Signature du consommateur (uniquement en cas de notification du présent formulaire sur papier) :',
        'Date :',
      ] },
      P('Vous pouvez aussi renoncer en ligne, depuis votre espace personnel : rubrique « Mon mandat », lien « Renoncer au mandat ».'),
    ] }],
  };

  return [info, mandat, annexe, formulaire];
}

/* ══ L'état du mandat d'une recherche ═══════════════════════════════════
   Un seul endroit décide si le client peut demander une visite librement.
     · 'valide'      un mandat signé, pas expiré : rien à demander
     · 'a_signer'    un numéro est réservé : l'espace propose de signer
     · 'sans_numero' rien de préparé : la demande de visite part quand même,
                     et Alexandre est alerté (il doit réserver un numéro) */
export type EtatMandat = 'valide' | 'a_signer' | 'sans_numero';

export function etatMandat(r: {
  mandat_date_signature?: string | null; mandat_date_expiration?: string | null; mandat_numero?: string | null;
}, aujourdhui = new Date().toISOString().slice(0, 10)): EtatMandat {
  const signe = !!r.mandat_date_signature;
  const exp = r.mandat_date_expiration ? String(r.mandat_date_expiration).slice(0, 10) : null;
  if (signe && (!exp || exp >= aujourdhui)) return 'valide';
  return r.mandat_numero && String(r.mandat_numero).trim() ? 'a_signer' : 'sans_numero';
}

/* Jusqu'à quand le client peut renoncer. Le délai part du lendemain de la
   signature et dure 14 jours : signé le 25, il court jusqu'au 9 à minuit,
   heure de Paris. S'il tombe un samedi ou un dimanche, il glisse au lundi.
   Les jours fériés ne sont pas calculés : on arrête toujours un peu plus
   tard que la loi, jamais plus tôt (minuit « heure d'hiver », soit une
   heure de marge l'été). */
export function finRetractation(signeLe: string): Date {
  const jour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(signeLe));
  let fin = Date.parse(jour + 'T12:00:00Z') + RETRACTATION_JOURS * 86_400_000;
  const js = new Date(fin).getUTCDay();          // 6 = samedi, 0 = dimanche
  if (js === 6) fin += 2 * 86_400_000;
  if (js === 0) fin += 86_400_000;
  return new Date(new Date(fin).toISOString().slice(0, 10) + 'T23:59:59+01:00');
}

/* Masquer une adresse : « j•••••@exemple.fr ». */
export function masquerEmail(e: string) {
  const [n, dom] = String(e).split('@');
  if (!dom) return e;
  return `${n.charAt(0)}${'•'.repeat(Math.max(3, Math.min(8, n.length - 1)))}@${dom}`;
}

/* « 2026-09-25 », le jour qu'il est à Paris à cet instant. */
export function jourParis(d: string | Date = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(d));
}

/* Les coordonnées du mandant, vérifiées de la même façon à l'écran (pour
   dire tout de suite ce qui manque) et au serveur (qui ne fait confiance à
   personne). Rend le mandant nettoyé, ou la liste des champs à revoir. */
export function validerMandant(x: unknown): { ok: true; mandant: Mandant } | { ok: false; champs: Record<string, string> } {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const m: Mandant = {
    civilite: o.civilite === 'Madame' || o.civilite === 'Monsieur' ? o.civilite : '',
    prenom: txt(o.prenom, 60),
    nom: txt(o.nom, 80),
    naissanceDate: txt(o.naissanceDate, 10),
    naissanceLieu: txt(o.naissanceLieu, 80),
    adresse: txt(o.adresse, 200),
    email: txt(o.email, 120).toLowerCase(),
    telephone: txt(o.telephone, 30),
  };
  const champs: Record<string, string> = {};
  if (!m.civilite) champs.civilite = 'Madame ou Monsieur ?';
  if (m.prenom.length < 1) champs.prenom = 'Votre prénom';
  if (m.nom.length < 1) champs.nom = 'Votre nom';
  const d = m.naissanceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!d) champs.naissanceDate = 'Votre date de naissance';
  else {
    const an = Number(d[1]), age = new Date().getFullYear() - an;
    if (age < 18 || age > 110) champs.naissanceDate = 'Cette date ne semble pas juste';
  }
  if (m.naissanceLieu.length < 2) champs.naissanceLieu = 'Votre ville de naissance';
  if (m.adresse.length < 8) champs.adresse = 'Votre adresse complète';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m.email)) champs.email = 'Une adresse e-mail valide';
  return Object.keys(champs).length ? { ok: false, champs } : { ok: true, mandant: m };
}

/* La recherche telle que le mandat la décrit, lue dans une ligne de
   `recherches` (colonnes du CRM). */
export function rechercheDepuis(r: Record<string, unknown>): Recherche {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    typeBien: typeof r.type_bien === 'string' ? r.type_bien : null,
    piecesMin: num(r.nb_pieces_min),
    chambresMin: num(r.chambres_min),
    surfaceMin: num(r.surface_min),
    secteurs: Array.isArray(r.secteurs) ? (r.secteurs as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    budget: num(r.budget_max),
    taux: tauxDe(r.mandat_taux),
  };
}
