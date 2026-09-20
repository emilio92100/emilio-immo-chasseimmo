// Référentiel des lignes de transport d'Île-de-France.
// Couleurs officielles récupérées sur l'open data Île-de-France Mobilités
// (jeu de données « referentiel-des-lignes », champ colourweb_hexa).
// Utilisé par le CRM (critères de recherche) et par l'espace acheteur.

export type Ligne = {
  id: string;          // ce qui est enregistré en base, ex. « M9 », « RER C », « T2 »
  court: string;       // ce qui s'affiche dans la pastille, ex. « 9 », « C », « T2 »
  couleur: string;     // fond de la pastille
  texte: string;       // couleur du chiffre, selon le contraste
  mode: 'metro' | 'rer' | 'tram' | 'transilien';
};

// Le jaune, le vert clair et le bleu ciel demandent un texte sombre.
const SOMBRE = '#1a2332';
const l = (id: string, court: string, couleur: string, mode: Ligne['mode'], sombre = false): Ligne =>
  ({ id, court, couleur, texte: sombre ? SOMBRE : '#fff', mode });

export const LIGNES: Ligne[] = [
  // ── Métro ───────────────────────────────────────────────
  l('M1', '1', '#ffbe00', 'metro', true),
  l('M2', '2', '#0055c8', 'metro'),
  l('M3', '3', '#6e6e00', 'metro'),
  l('M3bis', '3b', '#82c8e6', 'metro', true),
  l('M4', '4', '#a0006e', 'metro'),
  l('M5', '5', '#ff5a00', 'metro'),
  l('M6', '6', '#82dc73', 'metro', true),
  l('M7', '7', '#ff82b4', 'metro', true),
  l('M7bis', '7b', '#82dc73', 'metro', true),
  l('M8', '8', '#d282be', 'metro', true),
  l('M9', '9', '#d2d200', 'metro', true),
  l('M10', '10', '#dc9600', 'metro', true),
  l('M11', '11', '#6e491e', 'metro'),
  l('M12', '12', '#00643c', 'metro'),
  l('M13', '13', '#82c8e6', 'metro', true),
  l('M14', '14', '#640082', 'metro'),
  l('M15', '15', '#aaaaaa', 'metro', true),
  l('M18', '18', '#00a092', 'metro'),

  // ── RER ─────────────────────────────────────────────────
  l('RER A', 'A', '#eb2132', 'rer'),
  l('RER B', 'B', '#5091cb', 'rer'),
  l('RER C', 'C', '#ffcc30', 'rer', true),
  l('RER D', 'D', '#008b5b', 'rer'),
  l('RER E', 'E', '#b94e9a', 'rer'),

  // ── Tramway ─────────────────────────────────────────────
  l('T1', 'T1', '#0055c8', 'tram'),
  l('T2', 'T2', '#a0006e', 'tram'),
  l('T3a', 'T3a', '#ff5a00', 'tram'),
  l('T3b', 'T3b', '#00643c', 'tram'),
  l('T4', 'T4', '#dc9600', 'tram'),
  l('T5', 'T5', '#640082', 'tram'),
  l('T6', 'T6', '#ff0000', 'tram'),
  l('T7', 'T7', '#6e491e', 'tram'),
  l('T8', 'T8', '#6e6e00', 'tram'),
  l('T9', 'T9', '#3c91dc', 'tram'),
  l('T10', 'T10', '#6e6e00', 'tram'),
  l('T11', 'T11', '#ff5a00', 'tram'),
  l('T12', 'T12', '#a50034', 'tram'),
  l('T13', 'T13', '#8d653d', 'tram'),
  l('T14', 'T14', '#00a092', 'tram'),

  // ── Transilien ──────────────────────────────────────────
  l('Transilien H', 'H', '#84653d', 'transilien'),
  l('Transilien J', 'J', '#cec73d', 'transilien', true),
  l('Transilien K', 'K', '#9b9842', 'transilien'),
  l('Transilien L', 'L', '#c4a4cc', 'transilien', true),
  l('Transilien N', 'N', '#00b297', 'transilien'),
  l('Transilien P', 'P', '#f58f53', 'transilien', true),
  l('Transilien R', 'R', '#f49fb3', 'transilien', true),
  l('Transilien U', 'U', '#b6134c', 'transilien'),
  l('Transilien V', 'V', '#9f9825', 'transilien'),
];

export const MODES: { cle: Ligne['mode']; nom: string }[] = [
  { cle: 'metro', nom: 'Métro' },
  { cle: 'rer', nom: 'RER' },
  { cle: 'tram', nom: 'Tramway' },
  { cle: 'transilien', nom: 'Transilien' },
];

/** Retrouve une ligne à partir de ce qui est enregistré en base. */
export const ligneDe = (id: string): Ligne | undefined =>
  LIGNES.find(x => x.id.toLowerCase() === String(id).trim().toLowerCase());

/** Une entrée de transport_lignes est soit une ligne connue, soit un nom de station libre. */
export const estUneLigne = (v: string) => !!ligneDe(v);
