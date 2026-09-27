/* ══ Trouver une société dans le registre public ══════════════════════════

   « J'achète via une société » : le client tape le nom de sa SCI ou son
   SIREN, et choisit dans la liste. On remplit pour lui la dénomination, la
   forme, le SIREN, le siège, le greffe quand on le connaît, et sa fonction
   s'il figure parmi les dirigeants. Tout reste modifiable, et il certifie.

   La source : l'API Recherche d'entreprises de l'État
   (recherche-entreprises.api.gouv.fr) — gratuite, sans clé, ouverte aux
   navigateurs (CORS). Elle réunit l'INSEE (Sirene) et le Registre national
   des entreprises. Appelée depuis le navigateur du client, comme l'adresse
   (api-adresse.data.gouv.fr) à la création d'un client.

   Elle ne donne pas le greffe du RCS : on le déduit du département du
   siège quand il n'y en a qu'un (Île-de-France, hors Seine-et-Marne), sinon
   le client l'écrit.
   ════════════════════════════════════════════════════════════════════════ */

export type SocieteTrouvee = {
  siren: string;
  denomination: string;
  forme: string;              // SCI, SARL, SAS… ou « Autre »
  siege: string;              // « 34 rue Louis Pasteur, 92100 Boulogne-Billancourt »
  commune: string;
  rcsVille: string;           // '' quand on ne sait pas
  dirigeants: { nom: string; prenoms: string; qualite: string }[];
};

const API = 'https://recherche-entreprises.api.gouv.fr/search';

/* La forme, depuis le code de catégorie juridique de l'INSEE. */
export function formeDe(code: string): string {
  const c = String(code || '');
  if (c.startsWith('654')) return 'SCI';
  if (c === '5498') return 'EURL';
  if (c.startsWith('54')) return 'SARL';
  if (c === '5710') return 'SAS';
  if (c === '5720') return 'SASU';
  if (c.startsWith('520')) return 'SNC';
  return 'Autre';
}

/* Le greffe, quand le département n'en a qu'un. */
const GREFFES: Record<string, string> = {
  '75': 'Paris', '92': 'Nanterre', '93': 'Bobigny', '94': 'Créteil', '95': 'Pontoise', '78': 'Versailles', '91': 'Évry',
};

/* « 34 RUE LOUIS PASTEUR » → « 34 rue Louis Pasteur » ; « BOULOGNE-BILLANCOURT » → « Boulogne-Billancourt ». */
const PETITS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'sur', 'sous', 'en', 'aux', 'au']);
/* `petits` : à partir de quel mot « de », « des », « la »… restent en
   minuscules (0 pour un nom de voie, 1 pour une commune, jamais pour le
   nom d'une société : « SCI Les Tilleuls »). */
function joli(t: string, petits = 1): string {
  return String(t || '').toLowerCase().split(/(\s+|-|')/).map((m, i) => {
    if (!m.trim() || m === '-' || m === "'" || (petits >= 0 && i >= petits && PETITS.has(m))) return m;
    return m.charAt(0).toUpperCase() + m.slice(1);
  }).join('');
}
const VOIES: Record<string, string> = {
  AV: 'avenue', AVENUE: 'avenue', BD: 'boulevard', BOULEVARD: 'boulevard', RUE: 'rue', PL: 'place', PLACE: 'place',
  ALL: 'allée', ALLEE: 'allée', CHE: 'chemin', CHEMIN: 'chemin', IMP: 'impasse', IMPASSE: 'impasse', QU: 'quai', QUAI: 'quai',
  RTE: 'route', ROUTE: 'route', SQ: 'square', SQUARE: 'square', CRS: 'cours', COURS: 'cours', PAS: 'passage', PASSAGE: 'passage',
  VLA: 'villa', VILLA: 'villa', CITE: 'cité', CI: 'cité', RPT: 'rond-point', SEN: 'sentier', RES: 'résidence',
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adresseDe(s: any): string {
  if (!s) return '';
  const voie = [s.numero_voie, s.indice_repetition, s.type_voie ? VOIES[String(s.type_voie).toUpperCase()] || String(s.type_voie).toLowerCase() : '', joli(s.libelle_voie || '', 0)]
    .filter(Boolean).join(' ').trim();
  const ville = [s.code_postal, joli(s.libelle_commune || '')].filter(Boolean).join(' ');
  if (!voie) return joli(s.adresse || '');
  return [voie, ville].filter(Boolean).join(', ');
}

export async function chercherSocietes(q: string, signal?: AbortSignal): Promise<SocieteTrouvee[]> {
  const t = q.trim();
  if (t.replace(/\s/g, '').length < 3) return [];
  const u = `${API}?q=${encodeURIComponent(t)}&per_page=6&etat_administratif=A`;
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error(`recherche ${r.status}`);
  const j = await r.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Array.isArray(j?.results) ? j.results : []).map((x: any): SocieteTrouvee => ({
    siren: String(x.siren || ''),
    denomination: joli(x.nom_raison_sociale || x.nom_complet || '', -1).replace(/\b(Sci|Sarl|Sas|Sasu|Eurl|Snc)\b/g, m => m.toUpperCase()),
    forme: formeDe(x.nature_juridique),
    siege: adresseDe(x.siege),
    commune: joli(x.siege?.libelle_commune || ''),
    rcsVille: GREFFES[String(x.siege?.departement || '')] || '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dirigeants: (Array.isArray(x.dirigeants) ? x.dirigeants : []).filter((d: any) => d?.type_dirigeant === 'personne physique').map((d: any) => ({
      nom: String(d.nom || ''), prenoms: String(d.prenoms || ''), qualite: String(d.qualite || ''),
    })),
  })).filter((s: SocieteTrouvee) => /^\d{9}$/.test(s.siren));
}

/* Sa fonction dans la société, s'il figure parmi les dirigeants (même nom de
   famille, même prénom quand le registre le donne). */
export function qualiteDe(s: SocieteTrouvee, prenom: string, nom: string): string | null {
  const n = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, ' ').trim();
  const d = s.dirigeants.find(x => n(x.nom).split(/\s+/).includes(n(nom).split(/\s+/)[0] || '§')
    && (!x.prenoms || n(x.prenoms).split(/\s+/).includes(n(prenom).split(/\s+/)[0] || '§')));
  if (!d) return null;
  const q = d.qualite.toLowerCase();
  if (q.startsWith('g')) return 'Gérant';
  if (q.startsWith('pr')) return 'Président';
  if (q.includes('directeur g')) return 'Directeur général';
  return null;
}
