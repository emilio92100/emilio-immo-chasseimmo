/* ══ Le chauffage d'un bien, en trois cases (V3.171) ══
   Alexandre (10 octobre 2026) : « si c'est marqué chauffage collectif, bah,
   par radiateur ou au sol ou au plafond […]. Quand c'est individuel, mettre
   si c'est électrique, si c'est au gaz ».

   - `chauffage`           : collectif ou individuel
   - `source_energie`      : l'énergie
   - `chauffage_emetteurs` : ce qui diffuse la chaleur dans les pièces

   Les mêmes colonnes sur `biens` et `veille_propositions` (SQL :
   outils/sql/chauffage.sql). Les anciennes valeurs de `chauffage`
   (« Central », « Électrique ») restent lisibles. */

export const CHAUFFAGE_MODES = ['Collectif', 'Individuel'];
export const CHAUFFAGE_ENERGIES = ['Gaz', 'Électrique', 'Pompe à chaleur', 'Fioul', 'Bois', 'Réseau urbain', 'Solaire'];
export const CHAUFFAGE_EMETTEURS = ['Radiateurs', 'Plancher chauffant', 'Plafond chauffant', 'Convecteurs', 'Air pulsé', 'Poêle'];

/** Les listes d'un menu : les choix du CRM, plus la valeur déjà enregistrée
    si elle n'en fait pas partie (une ancienne saisie ne disparaît pas). */
export function optionsAvec(liste: string[], valeur: unknown): string[] {
  const v = String(valeur ?? '').trim();
  return v && !liste.includes(v) ? [...liste, v] : liste;
}

const propre = (v: unknown) => String(v ?? '').trim();

/** Une valeur lue dans un texte, ramenée au mot du menu quand elle y est
    (« gaz » → « Gaz »), gardée telle quelle sinon ; vide → null. */
export function versListe(liste: string[], valeur: unknown): string | null {
  const v = propre(valeur);
  if (!v || v.toLowerCase() === 'null') return null;
  const sansAccent = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return liste.find(l => sansAccent(l) === sansAccent(v)) || v;
}

/** « Collectif, gaz, par radiateurs » — ce qui est rempli, dans cet ordre.
    Vide si rien n'est rempli. */
export function texteChauffage(b: { chauffage?: unknown; source_energie?: unknown; chauffage_emetteurs?: unknown } | null | undefined): string {
  if (!b) return '';
  const mode = propre(b.chauffage);
  const energie = propre(b.source_energie);
  const emetteurs = propre(b.chauffage_emetteurs);
  const minuscule = (m: string) => m.charAt(0).toLowerCase() + m.slice(1);
  const morceaux: string[] = [];
  if (mode) morceaux.push(mode);
  /* « Électrique, électrique » : l'ancien mode valait déjà l'énergie. */
  if (energie && energie.toLowerCase() !== mode.toLowerCase()) morceaux.push(minuscule(energie));
  if (emetteurs) morceaux.push(`par ${minuscule(emetteurs)}`);
  const texte = morceaux.join(', ');
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** Les trois champs d'un objet (proposition de la veille, bien), seulement
    ceux qui sont remplis : une écriture qui n'en a pas n'y touche pas. */
export function champsChauffage(p: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cle of ['chauffage', 'source_energie', 'chauffage_emetteurs']) {
    const v = propre(p?.[cle]);
    if (v) out[cle] = v;
  }
  return out;
}
