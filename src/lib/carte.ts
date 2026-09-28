/* ═══ La carte : trouver une adresse, et ne la chercher qu'une fois (V3.26) ═══
   Le fond de carte est celui d'OpenFreeMap (style « Bright », tiré
   d'OpenStreetMap) : gratuit, sans clé, sans limite, usage commercial
   permis, à condition de le mentionner — la petite ligne grise en bas.

   Les positions viennent du géocodeur de l'IGN (la Géoplateforme, qui a
   repris l'API Adresse de data.gouv.fr en 2025). Une adresse cherchée une
   fois est gardée dans la table `geocodes` (outils/sql/carte.sql), quel que
   soit le contact ou le bien qui la porte : la carte suivante ne la cherche
   plus. Une adresse modifiée sur une fiche est une nouvelle clé.

   Ce fichier sert au CRM (dans le navigateur, avec la session d'Alexandre)
   comme à l'espace acheteur (sur le serveur, avec la clé du serveur). */

export const STYLE_CARTE = 'https://tiles.openfreemap.org/styles/bright';
export const MENTION_CARTE = '© OpenFreeMap · OpenStreetMap';
/* Boulogne-Billancourt : le centre d'une carte vide, et la ville vers
   laquelle le géocodeur penche quand une adresse ne dit pas sa ville. */
export const CENTRE: [number, number] = [2.2399, 48.8397];
export const URL_GEOCODAGE = 'https://data.geopf.fr/geocodage/search';

export type Precision = 'housenumber' | 'street' | 'locality' | 'municipality' | 'aucun';
export type Position = { lat: number; lng: number; precision: Precision; libelle: string | null };

/* La clé d'une adresse : sans accents, sans ponctuation, en minuscules. « 12,
   rue de Silly » et « 12 Rue de Silly » sont la même adresse. */
export function cleAdresse(a: string): string {
  return a.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/* Une adresse qui vaut la peine d'être cherchée : au moins quelques lettres. */
export const adresseUtile = (a?: string | null): a is string => !!a && a.replace(/[^\p{L}\d]/gu, '').length >= 5;

/* « 12 rue de Silly », « 92100 », « Boulogne-Billancourt » → une seule ligne,
   sans répéter le code postal ou la ville déjà écrits dans l'adresse. */
export function composerAdresse(adresse?: string | null, cp?: string | null, ville?: string | null): string {
  const a = (adresse || '').trim();
  if (!a) return '';
  const bas = cleAdresse(a);
  const reste = [cp, ville].map(x => (x || '').trim()).filter(x => x && !bas.includes(cleAdresse(x)));
  return [a, ...reste].join(' ');
}

/* Assez précis pour être posé sur la carte : le numéro, la rue, un lieu-dit.
   La ville seule ne dit rien de l'endroit. */
export const assezPrecis = (p: Position | null | undefined): p is Position => !!p && (p.precision === 'housenumber' || p.precision === 'street' || p.precision === 'locality');

/* Chercher une adresse. `null` : introuvable (on le retient). Une panne du
   service lève une erreur (on ne retient rien, on réessaiera). */
export async function geocoder(q: string, signal?: AbortSignal): Promise<Position | null> {
  const u = `${URL_GEOCODAGE}?q=${encodeURIComponent(q)}&limit=1&lat=${CENTRE[1]}&lon=${CENTRE[0]}`;
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error(`géocodeur : ${r.status}`);
  const j = await r.json() as { features?: { geometry?: { coordinates?: number[] }; properties?: { score?: number; type?: string; label?: string } }[] };
  const f = j.features?.[0];
  const xy = f?.geometry?.coordinates;
  const p = f?.properties || {};
  if (!f || !xy || xy.length < 2 || (p.score ?? 0) < 0.4) return null;
  const precision: Precision = p.type === 'housenumber' || p.type === 'street' || p.type === 'locality' || p.type === 'municipality' ? p.type : 'locality';
  return { lng: xy[0], lat: xy[1], precision, libelle: p.label || null };
}

/* ── La mémoire des adresses ─────────────────────────────────────────────── */
type Ligne = { cle: string; adresse: string | null; lat: number | null; lng: number | null; precision: string; score?: number | null; libelle: string | null; cherche_le: string };
/* Un client Supabase, quel qu'il soit (navigateur ou serveur) : on n'a
   besoin que de lire et d'écrire une table. */
type Base = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const tableGeocodesAbsente = (m: string) => /geocodes|relation .* does not exist|schema cache/i.test(m);
/* Une adresse introuvable se recherche au bout de deux mois : le géocodeur
   apprend les rues nouvelles. */
const RECHERCHER_APRES = 60 * 24 * 3600 * 1000;

export type Placement = {
  positions: Map<string, Position>;   // par clé, les adresses trouvées (même la ville seule)
  introuvables: Set<string>;           // les clés que le géocodeur ne connaît pas
  tableAbsente: boolean;               // le SQL n'est pas passé : rien n'est gardé
  erreurLecture: string | null;
  aEcrire: Ligne[];                    // les nouvelles positions, à garder
};

/* Placer une liste d'adresses : la mémoire d'abord, le géocodeur pour le
   reste (quatre à la fois, le service en accepte cinquante par seconde).
   `surPosition` est appelé à chaque adresse trouvée, pour que la carte se
   remplisse au fur et à mesure au lieu d'attendre la dernière. */
export async function placerAdresses(base: Base, adresses: string[], o: {
  surPosition?: (cle: string, p: Position | null) => void;
  /* La mémoire lue : ce qui était déjà connu est posé, le reste se cherche. */
  surMemoireLue?: (aChercher: number) => void;
  surProgres?: (fait: number, total: number) => void;
  signal?: AbortSignal;
} = {}): Promise<Placement> {
  const parCle = new Map<string, string>();
  for (const a of adresses) if (adresseUtile(a)) { const k = cleAdresse(a); if (k && !parCle.has(k)) parCle.set(k, a); }
  const cles = [...parCle.keys()];
  const res: Placement = { positions: new Map(), introuvables: new Set(), tableAbsente: false, erreurLecture: null, aEcrire: [] };
  const connues = new Map<string, Ligne>();
  for (let i = 0; i < cles.length; i += 100) {
    const { data, error } = await base.from('geocodes').select('*').in('cle', cles.slice(i, i + 100));
    if (error) {
      if (tableGeocodesAbsente(error.message)) res.tableAbsente = true;
      else res.erreurLecture = error.message;
      break;
    }
    for (const l of (data || []) as Ligne[]) connues.set(l.cle, l);
  }
  const maintenant = Date.now();
  const aChercher: string[] = [];
  for (const k of cles) {
    const l = connues.get(k);
    if (l && l.lat !== null && l.lng !== null && l.precision !== 'aucun') {
      const p: Position = { lat: l.lat, lng: l.lng, precision: l.precision as Precision, libelle: l.libelle };
      res.positions.set(k, p);
      o.surPosition?.(k, p);
    } else if (l && maintenant - new Date(l.cherche_le).getTime() < RECHERCHER_APRES) {
      res.introuvables.add(k);
      o.surPosition?.(k, null);
    } else aChercher.push(k);
  }
  o.surMemoireLue?.(aChercher.length);
  let fait = 0;
  o.surProgres?.(fait, aChercher.length);
  let i = 0;
  const ouvrier = async () => {
    while (i < aChercher.length && !o.signal?.aborted) {
      const k = aChercher[i++];
      const adresse = parCle.get(k) || k;
      try {
        const p = await geocoder(adresse, o.signal);
        if (p) res.positions.set(k, p); else res.introuvables.add(k);
        res.aEcrire.push({ cle: k, adresse, lat: p?.lat ?? null, lng: p?.lng ?? null, precision: p?.precision || 'aucun', libelle: p?.libelle || null, cherche_le: new Date().toISOString() });
        o.surPosition?.(k, p);
      } catch { /* service indisponible : rien n'est retenu, on réessaiera */ }
      o.surProgres?.(++fait, aChercher.length);
    }
  };
  await Promise.all([ouvrier(), ouvrier(), ouvrier(), ouvrier()]);
  return res;
}

/* Garder les nouvelles positions, par paquets. Rend le message d'erreur,
   ou null. */
export async function garderPositions(base: Base, lignes: Ligne[]): Promise<string | null> {
  for (let i = 0; i < lignes.length; i += 50) {
    const { error } = await base.from('geocodes').upsert(lignes.slice(i, i + 50), { onConflict: 'cle' });
    if (error) return error.message;
  }
  return null;
}

/* ── Petits outils de carte ──────────────────────────────────────────────── */
/* Un cercle de `m` mètres autour d'un point, pour une couche GeoJSON. */
export function cercle(lng: number, lat: number, m: number, pas = 48): [number, number][] {
  const dLat = m / 111_320, dLng = m / (111_320 * Math.cos((lat * Math.PI) / 180));
  const l: [number, number][] = [];
  for (let i = 0; i <= pas; i++) {
    const a = (i / pas) * Math.PI * 2;
    l.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
  }
  return l;
}

/* Décaler un point d'une distance fixe, dans une direction tirée de `graine`
   (toujours la même pour un même bien) : le centre d'une zone approximative
   ne tombe jamais sur l'immeuble. */
export function decaler(lng: number, lat: number, graine: string, m: number): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < graine.length; i++) { h ^= graine.charCodeAt(i); h = Math.imul(h, 16777619); }
  const a = ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
  const r = m * (0.55 + (((h >>> 12) % 1000) / 1000) * 0.45);
  return [lng + (Math.cos(a) * r) / (111_320 * Math.cos((lat * Math.PI) / 180)), lat + (Math.sin(a) * r) / 111_320];
}

/* L'itinéraire, dans l'application de cartes du téléphone ou dans Google Maps. */
export const lienItineraire = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;
