/**
 * Les repères géographiques du secteur d'Alexandre — Paris et les Hauts-de-Seine.
 *
 * ⚠️ Rien ici ne s'appelle au moment de l'affichage. L'espace client doit s'ouvrir
 * instantanément sur un téléphone : pas de fond de carte à télécharger, pas de
 * bibliothèque, pas de requête. Tout est figé dans ce fichier.
 *
 * Le jour où l'on voudra les vraies silhouettes des communes plutôt que des
 * épingles, il suffira de déposer les contours ici : le composant qui dessine la
 * carte (CarteSecteurs, dans EspaceClient.tsx) ne changera pas d'interface.
 */

/* Le centre officiel de chaque commune, en [longitude, latitude].
   Source : geo.api.gouv.fr, champ « centre », relevé une fois et recopié ici. */
export const CENTRES: Record<string, [number, number]> = {
  // ── Hauts-de-Seine, les 36 communes ──
  antony: [2.2976, 48.7507],
  asnieressurseine: [2.2935, 48.9181],
  bagneux: [2.3093, 48.798],
  boiscolombes: [2.2688, 48.9151],
  boulognebillancourt: [2.2429, 48.8375],
  bourglareine: [2.3167, 48.7801],
  chatenaymalabry: [2.2603, 48.7697],
  chatillon: [2.2887, 48.8031],
  chaville: [2.191, 48.8091],
  clamart: [2.2518, 48.7957],
  clichy: [2.3041, 48.9041],
  colombes: [2.2469, 48.9218],
  courbevoie: [2.2574, 48.8976],
  fontenayauxroses: [2.2876, 48.7895],
  garches: [2.1861, 48.8469],
  lagarennecolombes: [2.2437, 48.9071],
  gennevilliers: [2.288, 48.9319],
  issylesmoulineaux: [2.2628, 48.824],
  levalloisperret: [2.2874, 48.8946],
  malakoff: [2.2943, 48.817],
  marneslacoquette: [2.1689, 48.8286],
  meudon: [2.2288, 48.8028],
  montrouge: [2.3163, 48.8159],
  nanterre: [2.2018, 48.8974],
  neuillysurseine: [2.2651, 48.8862],
  leplessisrobinson: [2.2592, 48.7815],
  puteaux: [2.2384, 48.8824],
  rueilmalmaison: [2.1806, 48.8717],
  saintcloud: [2.2032, 48.844],
  sceaux: [2.2963, 48.776],
  sevres: [2.2056, 48.8223],
  suresnes: [2.2183, 48.871],
  vanves: [2.2869, 48.8214],
  vaucresson: [2.1628, 48.8377],
  villedavray: [2.1759, 48.8215],
  villeneuvelagarenne: [2.3231, 48.9354],

  // ── Paris, les 20 arrondissements ──
  paris1: [2.3359, 48.862],
  paris2: [2.3411, 48.8677],
  paris3: [2.3593, 48.8626],
  paris4: [2.3569, 48.8541],
  paris5: [2.3514, 48.8454],
  paris6: [2.3307, 48.8495],
  paris7: [2.3115, 48.8548],
  paris8: [2.3111, 48.8732],
  paris9: [2.3379, 48.8771],
  paris10: [2.3624, 48.876],
  paris11: [2.3816, 48.8601],
  paris12: [2.4173, 48.8342],
  paris13: [2.3656, 48.8303],
  paris14: [2.323, 48.8297],
  paris15: [2.2937, 48.8417],
  paris16: [2.263, 48.8572],
  paris17: [2.305, 48.8874],
  paris18: [2.3487, 48.8919],
  paris19: [2.3878, 48.8871],
  paris20: [2.3966, 48.8625],
};

/* La silhouette de Paris, en huit sommets : l'enveloppe convexe des centres des
   vingt arrondissements ci-dessus. C'est une approximation assumée — ce n'est
   pas la limite administrative, et rien ne se calcule dessus. Elle sert
   seulement à situer les communes par rapport à la capitale. */
export const PARIS: [number, number][] = [
  [2.263, 48.8572], [2.2937, 48.8417], [2.323, 48.8297], [2.3656, 48.8303],
  [2.4173, 48.8342], [2.3878, 48.8871], [2.3487, 48.8919], [2.305, 48.8874],
];

/* Le cours de la Seine dans l'ouest parisien, du sud d'Issy jusqu'à
   Villeneuve-la-Garenne, puis la traversée de Paris.
   ⚠️ Tracé schématique : les points sont posés pour rester cohérents avec la
   position des communes, ils ne viennent d'aucun relevé. Décor, rien d'autre. */
export const SEINE: [number, number][] = [
  [2.279, 48.818], [2.256, 48.829], [2.233, 48.833], [2.218, 48.843],
  [2.22, 48.856], [2.23, 48.87], [2.242, 48.883], [2.257, 48.895],
  [2.272, 48.908], [2.29, 48.92], [2.305, 48.93],
];
export const SEINE_PARIS: [number, number][] = [
  [2.279, 48.818], [2.295, 48.838], [2.32, 48.848], [2.348, 48.853],
  [2.37, 48.85], [2.4, 48.84],
];

/* « Paris 16ème », « Paris 16e Arrondissement » et « paris 16 » désignent la
   même chose ; « Boulogne-Billancourt » et « boulogne billancourt » aussi. */
export function cleCommune(nom: string): string {
  const s = (nom || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const p = s.match(/paris\s*(\d{1,2})/);
  if (p) return 'paris' + Number(p[1]);
  return s.replace(/[^a-z0-9]/g, '');
}

/* Le centre d'une commune, ou null si elle sort du secteur couvert ici.
   Une commune inconnue ne casse rien : elle n'est simplement pas dessinée. */
export function centreDe(ville: string): [number, number] | null {
  return CENTRES[cleCommune(ville)] || null;
}
