// Recherche d'arrêts de transport en Île-de-France.
// Source : open data Île-de-France Mobilités, jeu « arrets-lignes »
// (une ligne par couple arrêt × ligne desservante). API publique, sans clé.

import { ligneDe } from './lignes';

export type Arret = {
  nom: string;
  ville: string;
  lignes: string[];   // identifiants normalisés : « M9 », « RER A », « T2 », « Bus 42 »
  minutes?: number;   // temps à pied maximum accepté jusqu'à cet arrêt
};

const API = 'https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/arrets-lignes/records';

/** « Metro » + « 9 » → « M9 ». Ce qui n'a pas de pastille reste tel quel. */
function normaliser(mode: string, court: string): string | null {
  const c = (court || '').trim();
  if (!c) return null;
  switch ((mode || '').toLowerCase()) {
    case 'metro': return 'M' + c.replace(/B$/i, 'bis');
    case 'rapidtransit': return 'RER ' + c;
    case 'localtrain': return 'Transilien ' + c;
    case 'tramway': return c.toUpperCase().startsWith('T') ? c : 'T' + c;
    case 'bus': case 'noctilien': return 'Bus ' + c;
    default: return null;
  }
}

/** Les lourds d'abord (métro, RER, tram, train), les bus ensuite. */
const rang = (id: string) =>
  id.startsWith('M') ? 0 : id.startsWith('RER') ? 1 : id.startsWith('T') && !id.startsWith('Transilien') ? 2
    : id.startsWith('Transilien') ? 3 : 4;

/**
 * Cherche un arrêt par son nom. Les résultats sont regroupés par
 * arrêt + commune, avec toutes les lignes qui le desservent.
 */
export async function chercherArret(q: string, signal?: AbortSignal): Promise<Arret[]> {
  const t = q.trim();
  if (t.length < 3) return [];
  const url = `${API}?limit=80&select=stop_name,nom_commune,mode,shortname`
    + `&where=${encodeURIComponent(`search(stop_name,"${t.replace(/"/g, '')}")`)}`;

  let lignes: { stop_name: string; nom_commune: string; mode: string; shortname: string }[] = [];
  try {
    const r = await fetch(url, { signal });
    if (!r.ok) return [];
    lignes = (await r.json()).results || [];
  } catch { return []; }

  const parArret = new Map<string, Arret>();
  for (const x of lignes) {
    if (!x.stop_name) continue;
    const cle = `${x.stop_name}__${x.nom_commune || ''}`.toLowerCase();
    let a = parArret.get(cle);
    if (!a) { a = { nom: x.stop_name, ville: x.nom_commune || '', lignes: [] }; parArret.set(cle, a); }
    const id = normaliser(x.mode, x.shortname);
    if (id && !a.lignes.includes(id)) a.lignes.push(id);
  }

  return [...parArret.values()]
    .map(a => ({ ...a, lignes: a.lignes.sort((x, y) => rang(x) - rang(y) || x.localeCompare(y)).slice(0, 8) }))
    .filter(a => a.lignes.length > 0)
    // un arrêt desservi par un mode lourd passe devant un simple arrêt de bus
    .sort((a, b) => rang(a.lignes[0]) - rang(b.lignes[0]) || a.nom.localeCompare(b.nom))
    .slice(0, 8);
}

/** Étiquette courte d'une ligne sans pastille officielle (les bus). */
export const libelleLigne = (id: string) => ligneDe(id) ? id : id.replace(/^Bus /, '');
