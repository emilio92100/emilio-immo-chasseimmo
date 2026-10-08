/* ═══ Son parcours (V3.122) ═══════════════════════════════════════════════
   Alexandre : « quand je prends les critères d'une personne, je lui demande :
   est-ce que vous visitez depuis longtemps, est-ce que vous avez fait
   beaucoup de visites, qu'est-ce qui n'a pas convenu sur les dernières,
   qu'est-ce qui est revenu souvent… ça peut être un élément important ».

   Une étape des critères (CriteresRecherche, avant « Contexte du projet »)
   et un bloc dans « Sa recherche » (fiche acheteur). Rangé dans
   `recherches.parcours` (jsonb, outils/sql/parcours-rapprochement-ia.sql) :

     { depuis: '3_6', visites: '10_20',
       defauts: { 'Trop sombre': 2, 'Vis-à-vis': 1 },   // 1 : une fois · 2 : revient souvent
       plu: ['Traversant'], note: '…' }

   Une pastille qu'Alexandre ajoute lui-même est un libellé de plus dans
   `defauts` ou `plu` : pas de liste à part.

   ⚠️ Visible d'Alexandre seul : l'espace acheteur ne le lit jamais (la page
   choisit ses colonnes une à une, voir src/app/espace/[token]/page.tsx).
   Le rapprochement intelligent s'en servira. Isomorphe. */

export type Parcours = {
  depuis?: string;
  visites?: string;
  defauts?: Record<string, 1 | 2>;
  plu?: string[];
  note?: string;
};

export const DEPUIS_PARCOURS: [string, string][] = [
  ['debut', 'Il commence'], ['moins_1', 'Moins d’un mois'], ['1_3', '1 à 3 mois'],
  ['3_6', '3 à 6 mois'], ['6_12', '6 mois à 1 an'], ['plus_1', 'Plus d’un an'],
];
export const VISITES_PARCOURS: [string, string][] = [
  ['0', 'Aucune encore'], ['1_5', '1 à 5'], ['5_10', '5 à 10'], ['10_20', '10 à 20'], ['20', 'Plus de 20'],
];

/* Les icônes (traits sur 24 × 24), dessinées pour ces pastilles. */
export const ICONES_PARCOURS: Record<string, string> = {
  lune: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  visavis: 'M3 5h7v15H3zM14 5h7v15h-7zM6.5 9v2M17.5 9v2M6.5 14v2M17.5 14v2',
  oeilBarre: 'M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.4 7.6A17 17 0 0 0 2.5 12s3.5 6 9.5 6c1.5 0 2.9-.4 4.1-1',
  boussole: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
  voiture: 'M5 16v-4l2-5h10l2 5v4zM7 16v2M17 16v2M8 12h8',
  son: 'M4 10v4h3l5 4V6L7 10H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11',
  rdc: 'M3 21h18M6 21V9l6-4 6 4v12M10 21v-6h4v6',
  plan: 'M4 4h16v16H4zM4 11h8M12 4v16M12 15h8',
  reduit: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
  casserole: 'M4 10h16M6 10v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8M9 7V4M15 7V4M12 7V3',
  boite: 'M3 7h18v4H3zM5 11v9h14v-9M10 15h4',
  ascenseur: 'M5 3h14v18H5zM9.5 9.5L12 7l2.5 2.5M9.5 14.5L12 17l2.5-2.5M3 3l18 18',
  escalier: 'M4 20h4v-4h4v-4h4V8h4',
  ticket: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  marteau: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  bain: 'M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM6 12V6a2 2 0 0 1 4 0M6 19l-1 2M18 19l1 2',
  eclair: 'M13 3L5 14h6l-1 7 8-11h-6z',
  thermo: 'M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z',
  lieu: 'M12 21s-6-5.6-6-10a6 6 0 0 1 12 0c0 4.4-6 10-6 10zM12 9a2 2 0 1 0 0 4a2 2 0 1 0 0-4z',
  train: 'M7 3h10a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2zM5 10h14M8 21l2-4M16 21l-2-4',
  ecole: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
  parking: 'M5 3h14v18H5zM10 17V7h3a3 3 0 0 1 0 6h-3',
  arbre: 'M12 21v-5M6 16h12l-6-12z',
  euro: 'M17 6.5A6.5 6.5 0 0 0 7.5 12a6.5 6.5 0 0 0 9.5 5.5M5 10h8M5 14h8',
  etoile: 'M12 4l2.4 5 5.6.8-4 3.9.9 5.5L12 16.6 7.1 19.2 8 13.7 4 9.8l5.6-.8z',
  soleil: 'M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z',
  feuille: 'M5 19c8 0 14-6 14-14C11 5 5 11 5 19zM5 19l7-7',
  traversant: 'M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4',
  oeil: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
  volume: 'M4 10V4h6M20 14v6h-6M4 4l7 7M20 20l-7-7',
  colonnes: 'M4 20h16M6 20V10M10 20V10M14 20V10M18 20V10M3 10h18L12 4z',
  neuf: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  haut: 'M8 21V8h8v13M4 21h16M12 2v3M10 4l2-2 2 2',
  boutique: 'M4 10h16l-1-5H5zM5 10v10h14V10M9 20v-5h6v5',
  // Les titres : boussole (l'étape), calendrier, clé, visage, cœur, bulle, cadenas, retour.
  calendrier: 'M5 6h14v14H5zM5 10h14M9 4v4M15 4v4',
  cle: 'M14 7a3 3 0 1 0 0 .01M11.8 9.2L4 17v3h3v-2h2v-2h2l1.8-1.8',
  bof: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM8.5 15.5c1-1.2 2.2-1.8 3.5-1.8s2.5.6 3.5 1.8M9 9.5h.01M15 9.5h.01',
  coeur: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  bulle: 'M5 5h14v10H9l-4 4z',
  cadenas: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  souvent: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
  plus: 'M12 5v14M5 12h14',
};

/* Ce qui n'a pas convenu, rangé par thème (lumière, calme, agencement,
   immeuble, état, autour, prix) : l'icône dit le thème. */
export const DEFAUTS_PARCOURS: { l: string; ic: string }[] = [
  { l: 'Trop sombre', ic: 'lune' }, { l: 'Vis-à-vis', ic: 'visavis' }, { l: 'Vue bouchée', ic: 'oeilBarre' }, { l: 'Mauvaise exposition', ic: 'boussole' },
  { l: 'Bruit de la rue', ic: 'voiture' }, { l: 'Bruit des voisins', ic: 'son' }, { l: 'Rez-de-chaussée', ic: 'rdc' },
  { l: 'Mauvais agencement', ic: 'plan' }, { l: 'Pièces trop petites', ic: 'reduit' }, { l: 'Petite cuisine', ic: 'casserole' }, { l: 'Peu de rangements', ic: 'boite' },
  { l: 'Sans ascenseur', ic: 'ascenseur' }, { l: 'Parties communes vétustes', ic: 'escalier' }, { l: 'Charges élevées', ic: 'ticket' },
  { l: 'Travaux à prévoir', ic: 'marteau' }, { l: 'Salle de bain à refaire', ic: 'bain' }, { l: 'Électricité à revoir', ic: 'eclair' }, { l: 'DPE F ou G', ic: 'thermo' },
  { l: 'Quartier', ic: 'lieu' }, { l: 'Transports trop loin', ic: 'train' }, { l: 'Écoles trop loin', ic: 'ecole' }, { l: 'Pas de parking', ic: 'parking' }, { l: 'Pas d’extérieur', ic: 'arbre' },
  { l: 'Trop cher pour ce que c’est', ic: 'euro' },
];
export const PLU_PARCOURS: { l: string; ic: string }[] = [
  { l: 'Lumineux', ic: 'soleil' }, { l: 'Calme', ic: 'feuille' }, { l: 'Traversant', ic: 'traversant' }, { l: 'Vue dégagée', ic: 'oeil' },
  { l: 'Beaux volumes', ic: 'volume' }, { l: 'Cachet de l’ancien', ic: 'colonnes' }, { l: 'Rénové', ic: 'neuf' }, { l: 'Un extérieur', ic: 'arbre' },
  { l: 'Étage élevé', ic: 'haut' }, { l: 'Cuisine ouverte', ic: 'casserole' }, { l: 'Proche des transports', ic: 'train' }, { l: 'Quartier vivant', ic: 'boutique' },
];

/* L'icône d'un libellé (une pastille ajoutée à la main : l'étoile). */
export const iconeDefaut = (l: string) => ICONES_PARCOURS[DEFAUTS_PARCOURS.find(x => x.l === l)?.ic || 'etoile'];
export const iconePlu = (l: string) => ICONES_PARCOURS[PLU_PARCOURS.find(x => x.l === l)?.ic || 'etoile'];

const court = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/* Ce qu'on lit de la base, nettoyé : rien d'autre que la forme attendue. */
export function lireParcours(x: unknown): Parcours {
  const o = (x && typeof x === 'object' && !Array.isArray(x) ? x : {}) as Record<string, unknown>;
  const p: Parcours = {};
  if (DEPUIS_PARCOURS.some(([k]) => k === o.depuis)) p.depuis = String(o.depuis);
  if (VISITES_PARCOURS.some(([k]) => k === o.visites)) p.visites = String(o.visites);
  const d = (o.defauts && typeof o.defauts === 'object' && !Array.isArray(o.defauts) ? o.defauts : {}) as Record<string, unknown>;
  const defauts: Record<string, 1 | 2> = {};
  for (const [k, v] of Object.entries(d).slice(0, 60)) {
    const l = court(k, 60);
    if (l && (v === 1 || v === 2)) defauts[l] = v;
  }
  if (Object.keys(defauts).length) p.defauts = defauts;
  const plu = (Array.isArray(o.plu) ? o.plu : []).map(v => court(v, 60)).filter(Boolean).slice(0, 40);
  if (plu.length) p.plu = [...new Set(plu)];
  const note = court(o.note, 4000);
  if (note) p.note = note;
  return p;
}

export const parcoursVide = (p: Parcours | null | undefined) => !p || (!p.depuis && !p.visites && !Object.keys(p.defauts || {}).length && !(p.plu || []).length && !(p.note || '').trim());

/* Deux parcours qui disent la même chose (l'ordre des clés ne compte pas). */
export function memeParcours(a: Parcours | null | undefined, b: Parcours | null | undefined): boolean {
  const x = lireParcours(a), y = lireParcours(b);
  const tri = (d?: Record<string, number>) => JSON.stringify(Object.entries(d || {}).sort(([p], [q]) => p.localeCompare(q)));
  return (x.depuis || '') === (y.depuis || '') && (x.visites || '') === (y.visites || '') && tri(x.defauts) === tri(y.defauts)
    && JSON.stringify([...(x.plu || [])].sort()) === JSON.stringify([...(y.plu || [])].sort()) && (x.note || '') === (y.note || '');
}

export const libDepuis = (k?: string) => DEPUIS_PARCOURS.find(x => x[0] === k)?.[1] || '';
export const libVisites = (k?: string) => VISITES_PARCOURS.find(x => x[0] === k)?.[1] || '';

/* Le parcours en quelques lignes : le Suivi du client, et plus tard le
   rapprochement intelligent. */
export function texteParcours(p: Parcours): string {
  const souvent = Object.entries(p.defauts || {}).filter(([, n]) => n === 2).map(([l]) => l);
  const unefois = Object.entries(p.defauts || {}).filter(([, n]) => n === 1).map(([l]) => l);
  return [
    p.depuis ? `Cherche depuis : ${libDepuis(p.depuis).toLowerCase()}` : '',
    p.visites ? `Visites déjà faites : ${libVisites(p.visites).toLowerCase()}` : '',
    souvent.length ? `Revient souvent : ${souvent.join(', ')}` : '',
    unefois.length ? `N’a pas convenu : ${unefois.join(', ')}` : '',
    (p.plu || []).length ? `Lui a plu : ${(p.plu || []).join(', ')}` : '',
    p.note ? `En quelques mots : ${p.note}` : '',
  ].filter(Boolean).join('\n');
}
