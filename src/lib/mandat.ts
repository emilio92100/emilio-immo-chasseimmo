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
  nom: 'Alexandre ROGELET',   // le nom de famille en capitales, comme sur tout acte
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

export const HONORAIRES_TAUX = 2.5;          // % TTC du prix : le taux proposé quand Alexandre ne choisit rien
export const BAREME = 5;                     // % TTC du prix : le barème de l'agence, donc le maximum
/* 12 mois au plus, fin à tout moment avec 15 jours de préavis. `total` sert
   aux dates (fin du mandat), en jours. */
export const DUREE = { mois: 12, total: 365, preavis: 15 } as const;
export const RETRACTATION_JOURS = 14;

/* ── Le taux des honoraires ─────────────────────────────────────────────
   2,5 % par défaut. Alexandre peut en proposer un autre à un client depuis
   sa fiche, jusqu'à son barème (5 %) : les honoraires pratiqués ne peuvent
   pas le dépasser. Toute valeur absente, illisible ou au-dessus du barème
   retombe sur 2,5 %. Arrondi au centième (« 1,75 % »). */
export function tauxDe(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > BAREME) return HONORAIRES_TAUX;
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

/* ── Ou un forfait ──────────────────────────────────────────────────────
   Alexandre peut aussi proposer un montant fixe, en euros TTC. Son barème
   affiché reste un pourcentage (2,5 %) : un forfait ne peut donc jamais le
   dépasser. Le mandat le dit — « ramené à 2,5 % du prix si le prix est
   inférieur à … » — et le prix maximum se calcule en retirant le forfait
   du budget. Toute valeur absente, nulle ou illisible = pas de forfait. */
export function forfaitDe(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/\s/g, '').replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 5_000_000) return null;
  return Math.round(n);
}
/* Le prix en dessous duquel le forfait dépasserait le barème. */
export const seuilForfait = (forfait: number) => Math.ceil(forfait / (BAREME / 100));

export type Honoraires = { taux?: number | null; forfait?: number | null };
/* Le prix maximum hors honoraires et les honoraires à ce prix, selon le
   mode. Un forfait qui dépasserait le barème au prix maximum (le client a
   baissé son budget) est plafonné, comme le mandat le prévoit. */
export function prixEtHonoraires(budget: number | null | undefined, h: Honoraires): { prixMax: number | null; honoraires: number | null } {
  const f = forfaitDe(h.forfait);
  if (f) {
    if (!budget || !Number.isFinite(budget) || budget <= 0) return { prixMax: null, honoraires: f };
    const pm = Math.floor((budget - f) / 1000) * 1000;
    if (pm > 0 && f <= (pm * BAREME) / 100) return { prixMax: pm, honoraires: f };
    const plafond = prixMaximum(budget, BAREME);
    return { prixMax: plafond, honoraires: honorairesPour(plafond, BAREME) };
  }
  const pm = prixMaximum(budget, tauxDe(h.taux));
  return { prixMax: pm, honoraires: honorairesPour(pm, tauxDe(h.taux)) };
}
/* « 2,5 % TTC » ou « forfait de 20 000 € TTC » : pour les mails et le CRM. */
export function honorairesCourt(h: Honoraires): string {
  const f = forfaitDe(h.forfait);
  return f ? `forfait de ${euros(f)} TTC` : tauxTexte(tauxDe(h.taux));
}
/* « 2,5 % TTC du prix d’achat » ou « forfait de 20 000 € TTC ». */
export function honorairesDuPrix(h: Honoraires): string {
  const f = forfaitDe(h.forfait);
  return f ? `forfait de ${euros(f)} TTC` : `${tauxTexte(tauxDe(h.taux))} du prix d’achat`;
}
/* « 2,27 % » : ce que représente un forfait au prix donné. */
export const pourcentDe = (montant: number, prix: number) =>
  (Math.round((montant / prix) * 10000) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, ' ') + ' %';

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
  /* Ou un forfait, en euros TTC (recherches.mandat_forfait). Présent, il
     remplace le pourcentage ; on le lit toujours par forfaitDe(). */
  forfait?: number | null;
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
  forfait?: number | null;      // absent des mandats signés avant le forfait
  duree: typeof DUREE;
};
export function figerContenu(r: Recherche): Contenu {
  const forfait = forfaitDe(r.forfait);
  const taux = forfait ? HONORAIRES_TAUX : tauxDe(r.taux);
  const { prixMax, honoraires } = prixEtHonoraires(r.budget, { taux, forfait });
  return { recherche: { ...r, taux, forfait }, prixMax, honoraires, taux, forfait, duree: DUREE };
}

/* L'empreinte de ce que le client a sous les yeux : taux, prix maximum et
   description du bien. L'écran l'envoie avec sa demande de code ; le
   serveur la recalcule sur la fiche du moment. Si Alexandre a changé le
   taux (ou si les critères ont bougé) entre-temps, elles diffèrent, et le
   client relit la nouvelle version avant de signer — jamais l'inverse. */
export function versionMandat(r: Recherche): string {
  const c = figerContenu(r);
  return `${c.taux}|${c.forfait ?? ''}|${c.prixMax ?? ''}|${decrireRecherche(r)}`;
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
  const pm = prixEtHonoraires(r.budget, { taux: signe.taux, forfait: signe.forfait }).prixMax;
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
    c.forfait
      ? { titre: 'Honoraires', valeur: `${euros(c.forfait)} TTC, au forfait`, detail: 'réglés le jour de l’acte, chez le notaire' }
      : { titre: 'Honoraires', valeur: `${tauxTexte(c.taux)} du prix`, detail: 'réglés le jour de l’acte, chez le notaire' },
    { titre: 'Durée', valeur: `${DUREE.mois} mois au plus`, detail: `vous l’arrêtez quand vous voulez · ${DUREE.preavis} jours de préavis` },
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
  | { t: 'coches'; items: string[] }                     // une liste cochée
  | { t: 'etapes'; items: { titre: string; x: string }[] } // la mission, étape par étape, numérotée
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
  const forfait = c.forfait || null;

  /* ─── Le mandat : droit au but. Tout ce que la loi veut que le client sache
     avant de signer (identité et garanties de l'agence, prix, durée et fin,
     rétractation, médiateur, données) est DANS le mandat, qu'il lit en entier
     avant de signer : pas de document à part. Plus de reconduction tacite
     (12 mois au plus, fin à tout moment) : ni annexe L215, ni double règle
     de résiliation à expliquer. ─── */
  const naissance = m && m.naissanceDate
    ? `Né${m.civilite === 'Madame' ? 'e' : ''} le ${jourFr(m.naissanceDate)} à ${m.naissanceLieu}` : '';
  const mandant: Fiche = m
    ? { ic: 'personne', titre: `${m.civilite ? m.civilite + ' ' : ''}${m.prenom} ${m.nom.toUpperCase()}`, lignes: [
        ...(naissance ? [naissance] : []),
        `Demeurant ${m.adresse}`,
        `${m.telephone ? m.telephone + ' · ' : ''}${m.email}`,
      ], pied: 'Ci-après « le MANDANT »' }
    : { ic: 'personne', titre: 'Vous', lignes: ['Vos nom, date et lieu de naissance, adresse et coordonnées : à l’étape suivante.'], pied: 'Ci-après « le MANDANT »' };
  const mandataire: Fiche = { ic: 'agence', titre: A.nom, lignes: [
    `${A.adresse}, ${A.cp} ${A.ville} · ${A.tel} · ${A.mail}`,
    `${A.societe}, ${A.forme}, ${A.rcs}. Carte professionnelle ${A.carteMention} n° ${A.carte}, délivrée par ${A.carteDelivree}.`,
    `Responsabilité civile professionnelle : ${A.assureur}, police n° ${A.police}.`,
    `Représentée par ${SIGNATAIRE.nom}, ${SIGNATAIRE.qualite}.`,
  ], note: 'Ne reçoit ni ne détient aucuns fonds autres que sa rémunération.',
  pied: 'Ci-après « l’Agence » ou « le MANDATAIRE »' };

  const honoraires: Bloc[] = forfait
    ? [
      P(`Honoraires de l’Agence : forfait de ${euros(forfait)} TTC (${enLettres(forfait)} euros).`, true),
      P(`Conformément au barème de l’Agence (${tauxTexte(BAREME)} du prix), ils ne peuvent dépasser ${tauxCourt(BAREME)} du prix d’achat : si ce prix est inférieur à ${euros(seuilForfait(forfait))}, ils sont ramenés à ${tauxCourt(BAREME)} de ce prix.`),
    ]
    : [P(`Honoraires de l’Agence : ${tauxTexte(c.taux)} du prix d’achat${prix && hono ? `, soit ${euros(hono)} pour un prix de ${euros(prix)}` : ''}.`, true)];

  const mandat: Partie = {
    titre: titreMandat(d.numero),
    court: 'Le mandat de recherche',
    sous: 'Mandat simple, non exclusif',
    ic: 'doc',
    sections: [
      { titre: 'Entre les soussignés', blocs: [{ t: 'fiches', items: [mandant, mandataire] }] },
      { titre: 'Il a été convenu ce qui suit', blocs: [
        P('Le MANDANT confie au MANDATAIRE, qui l’accepte, un mandat NON EXCLUSIF de rechercher un bien à acheter. Il reste libre de chercher lui-même et de confier d’autres mandats non exclusifs.', true),
      ] },
      { titre: 'Le bien recherché', ic: 'maison', blocs: [
        P(decrireRecherche(d.recherche), true),
        P('Ainsi que tout bien correspondant aux critères du MANDANT tels qu’ils figurent, et évoluent, dans son espace personnel.'),
      ] },
      { titre: 'Prix', ic: 'etiquette', blocs: prix
        ? [
          P(`Prix d’achat maximum, hors honoraires : ${euros(prix)} (${enLettres(prix)} euros).`, true),
          P(`Honoraires compris, il correspond au budget de ${euros(d.recherche.budget || 0)} indiqué par le MANDANT, qui peut le modifier depuis son espace personnel.`),
        ]
        : [P('Le prix d’achat, hors honoraires, correspond au budget indiqué par le MANDANT dans son espace personnel, qu’il peut modifier à tout moment.')] },
      { titre: 'Honoraires', ic: 'euro', blocs: [
        ...honoraires,
        P('Ils sont à la charge du MANDANT, en plus du prix, et ne sont dus que si l’achat se réalise grâce à l’Agence. Ils sont payés le jour de la signature de l’acte authentique, par l’intermédiaire du notaire : aucune somme n’est due avant. En cas de préemption, le titulaire du droit de préemption les doit à la place de l’acquéreur.'),
      ] },
      { titre: 'Durée', ic: 'calendrier', blocs: [
        P(`Le mandat prend effet à sa signature et dure ${enLettres(DUREE.mois)} (${DUREE.mois}) mois au plus. Il prend fin de lui-même à ce terme, sans reconduction.`),
        P(`Chaque partie peut y mettre fin à tout moment, par lettre recommandée avec avis de réception ou par e-mail, avec un préavis de ${enLettres(DUREE.preavis)} (${DUREE.preavis}) jours.`, true),
      ] },
      { titre: 'Engagements du mandant', ic: 'personne', blocs: [
        P('Le MANDANT déclare avoir la capacité d’acheter et n’avoir confié aucun mandat exclusif de recherche portant sur les mêmes biens. Il autorise le MANDATAIRE à se faire assister ou substituer par un autre professionnel habilité.'),
        P('S’il achète un bien, avec ou sans le MANDATAIRE, il l’en informe sans délai et lui indique, à sa demande, le vendeur, le prix et le notaire chargé de la vente.'),
        P('Pendant le mandat et les douze mois qui suivent sa fin, le MANDANT s’interdit d’acheter sans le MANDATAIRE, directement ou par personne interposée, un bien que celui-ci lui a présenté. Il s’en porte fort pour son conjoint, son partenaire de PACS, son concubin et toute personne avec qui il achèterait.', true),
      ] },
      { titre: 'Engagements de l’Agence', ic: 'etoile', blocs: [
        P('Le MANDATAIRE s’engage, à chaque étape :'),
        { t: 'etapes', items: [
          { titre: 'Rechercher', x: 'Suivre chaque jour les annonces correspondant aux critères du MANDANT, y compris celles des particuliers ; chercher des biens hors marché auprès de son réseau de confrères et de son carnet d’adresses.' },
          { titre: 'Visiter et sélectionner', x: 'Visiter les biens susceptibles de convenir avant de les proposer, et obtenir des vendeurs les renseignements et documents imposés par la réglementation.' },
          { titre: 'Vérifier', x: 'Étudier le dossier de chaque bien avant toute offre : diagnostics, documents de copropriété, charges et travaux votés.' },
          { titre: 'Négocier', x: 'Accompagner le MANDANT dans la négociation du prix.' },
          { titre: 'Accompagner jusqu’à l’acte', x: 'L’accompagner jusqu’à la signature de l’acte authentique chez le notaire.' },
          { titre: 'Rendre compte', x: 'Tenir à jour, dans l’espace personnel du MANDANT, le suivi de sa recherche et les biens présentés, et lui adresser un compte rendu après chaque visite.' },
        ] },
      ] },
      { titre: 'Droit de rétractation', ic: 'retour', blocs: [
        P(`Le mandat étant conclu à distance, le MANDANT peut se rétracter sans motif pendant ${enLettres(RETRACTATION_JOURS)} (${RETRACTATION_JOURS}) jours à compter du lendemain de sa signature (délai prolongé jusqu’au premier jour ouvrable s’il finit un samedi, un dimanche ou un jour férié) : par écrit, avec le formulaire ci-après s’il le souhaite, ou depuis son espace personnel (« Mon mandat », « Renoncer au mandat »). Il reçoit un accusé de réception par e-mail.`, true),
        P('La mission ne commence qu’à la fin de ce délai, sauf demande expresse du MANDANT ; il garde alors son droit de rétractation tant que la mission n’est pas entièrement exécutée.'),
        { t: 'case', coche: d.executionImmediate === true, x: 'Le MANDANT DEMANDE que la mission commence dès la signature, sans attendre la fin du délai de rétractation, et reconnaît qu’il perdra ce droit une fois la mission entièrement exécutée.' },
        { t: 'case', coche: d.executionImmediate === false, x: 'Le MANDANT préfère que la mission commence à la fin du délai de rétractation.' },
      ] },
      { titre: 'Informations', ic: 'info', blocs: [
        P(`Réclamations : par écrit à l’Agence. Sans réponse satisfaisante sous 30 jours, le MANDANT peut saisir gratuitement le médiateur de la consommation : ${MEDIATEUR.nom}, ${MEDIATEUR.adresse}, ${MEDIATEUR.site}.`),
        P(`Données personnelles : l’Agence les traite pour exécuter le mandat et respecter ses obligations légales, et ne les communique qu’aux intervenants de l’opération. Le MANDANT peut y accéder, les rectifier ou les faire effacer en écrivant à ${A.mail}, et saisir la CNIL (www.cnil.fr).`),
        P('Démarchage téléphonique : le MANDANT peut s’inscrire gratuitement sur la liste d’opposition Bloctel (www.bloctel.gouv.fr).'),
        P('L’Agence exerce sous la loi n° 70-9 du 2 janvier 1970 (dite loi Hoguet), son décret d’application du 20 juillet 1972 et le code de déontologie des professionnels de l’immobilier. Le mandat est soumis à la loi française.'),
      ] },
      { titre: 'Date et signatures', ic: 'plume', blocs: [
        P(`Fait à Paris${d.signature ? `, le ${dateLongue(d.signature.le)}` : ''}. Le MANDANT a lu le mandat en entier avant de le signer, depuis son espace personnel, avec un code à usage unique reçu par e-mail ; le certificat de signature figure en dernière page. Chaque partie en conserve un exemplaire.`),
        { t: 'sig' },
      ] },
    ],
  };

  /* ─── Le formulaire type de rétractation (article L221-5 du Code de la
     consommation) : obligatoire, joint au mandat. ─── */
  const formulaire: Partie = {
    titre: 'Formulaire de rétractation',
    court: 'Formulaire de rétractation',
    sous: 'À renvoyer uniquement si vous souhaitez vous rétracter',
    ic: 'retour',
    sections: [{ blocs: [
      P(`À l’attention de : ${A.nom}, ${A.adresse}, ${A.cp} ${A.ville} — ${A.mail}`, true),
      { t: 'l', items: [
        `Je vous notifie par la présente ma rétractation du contrat portant sur la prestation de service ci-dessous : ${titreMandat(d.numero)}.`,
        `Conclu le : ${d.signature ? dateCourte(d.signature.le) : '………………'}`,
        `Nom du consommateur : ${m ? `${m.prenom} ${m.nom.toUpperCase()}` : '………………'}`,
        `Adresse du consommateur : ${m ? m.adresse : '………………'}`,
        'Signature du consommateur (uniquement en cas de notification du présent formulaire sur papier) :',
        'Date :',
      ] },
      P('Vous pouvez aussi renoncer en ligne, depuis votre espace personnel : « Mon mandat », « Renoncer au mandat ».'),
    ] }],
  };

  return [mandat, formulaire];
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
  if (!d) champs.naissanceDate = /^\d{2}\/\d{2}\/\d{4}$/.test(m.naissanceDate) ? 'Cette date ne semble pas juste' : 'Votre date de naissance, en chiffres : JJ/MM/AAAA';
  else {
    const an = Number(d[1]), age = new Date().getFullYear() - an;
    const x = new Date(Date.UTC(an, Number(d[2]) - 1, Number(d[3])));
    const reelle = x.getUTCMonth() === Number(d[2]) - 1 && x.getUTCDate() === Number(d[3]);
    if (!reelle || age < 18 || age > 110) champs.naissanceDate = 'Cette date ne semble pas juste';
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
    forfait: forfaitDe(r.mandat_forfait),
  };
}
