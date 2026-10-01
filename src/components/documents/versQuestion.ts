import type { Champ, Donnees, Etape } from '@/lib/actes';

/* ═══ De l'aperçu à la question ═══════════════════════════════════════════
   Un clic sur un passage de l'aperçu ramène à la question qui l'a écrit
   (V3.46). Aucun modèle n'a à le déclarer : on cherche, dans le texte du
   passage, les réponses déjà données (un nom, une adresse, un prix, une
   date…) ; la plus longue trouvée désigne la question. Rien de reconnu :
   la rubrique du passage décide (l'étape qui la rédige), et à défaut la
   rubrique d'avant.

   Pur et isomorphe : testé hors du navigateur (banc d'essai). */

export type Cible = {
  etape: number;
  /* La question, ou null : le haut de l'étape. */
  cle: string | null;
  /* Dans une liste (une personne, un lot) : la ligne et la case. */
  sous?: { i: number; k: string };
};

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/* Minuscules, apostrophes droites, une seule espace (les espaces fines et
   insécables des montants comprises). */
export const normaliser = (t: string) =>
  t.normalize('NFC').toLowerCase().replace(/[’‘`´]/g, '\'').replace(/[\s  ]+/g, ' ').trim();

/* « 2026-09-30 » → « 30 septembre 2026 » et « 30/09/2026 ». */
function dates(v: unknown): string[] {
  const m = typeof v === 'string' ? v.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (!m) return [];
  const j = Number(m[3]);
  const mois = MOIS[Number(m[2]) - 1];
  return [...(mois ? [`${j === 1 ? '1er' : j} ${mois} ${m[1]}`] : []), `${m[3]}/${m[2]}/${m[1]}`];
}

/* Un montant ou une surface, tels que le document les écrit (« 1 175 000 »,
   « 80,21 »). Les petits nombres (3 mois, 12 %) se retrouvent partout : ils
   ne désignent rien. */
function nombres(v: unknown): string[] {
  const n = typeof v === 'number' ? v
    : typeof v === 'string' && v.trim() ? Number(v.replace(/[\s  €%]/g, '').replace(',', '.')) : NaN;
  if (!Number.isFinite(n)) return [];
  const t = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
  return normaliser(t).length >= 4 ? [t] : [];
}

/* Un long texte (une clause, une description) se retrouve aussi par
   morceaux : l'aperçu peut n'en montrer qu'une partie. */
function morceaux(x: string): string[] {
  const t = x.trim();
  if (!t) return [];
  const phrases = t.split(/(?<=[.!?;])\s+|\n+/).map(p => p.trim()).filter(p => p.length >= 16);
  return phrases.length > 1 ? [t, ...phrases] : [t];
}

/* `n` : un nombre mis en forme, qui compte dès quatre signes (« 9 980 ») ;
   un texte n'en dit assez qu'à partir de six (« 75016 » est partout). */
type Valeur = { x: string; n?: true; sous?: { i: number; k: string } };
const CLES_PERSONNE = ['adresse', 'email', 'telephone', 'naissanceLieu', 'nomNaissance'] as const;

/* Ce qu'une question a déjà répondu, en textes à chercher. */
function valeurs(c: Champ, d: Donnees): Valeur[] {
  if (c.t === 'titre' || c.t === 'guide') return [];
  const v = d[c.cle];
  switch (c.t) {
    case 'texte':
    case 'zone':
      return typeof v === 'string' ? morceaux(v).map(x => ({ x })) : [];
    case 'date':
      return dates(v).map(x => ({ x }));
    case 'nombre':
    case 'euros':
      return nombres(v).map(x => ({ x, n: true as const }));
    case 'personnes': {
      if (!Array.isArray(v)) return [];
      const out: Valeur[] = [];
      v.forEach((p, i) => {
        const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
        const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
        const nom = [s('prenom'), s('nom')].filter(Boolean).join(' ');
        if (nom) out.push({ x: nom, sous: { i, k: s('prenom') ? 'prenom' : 'nom' } });
        if (s('nom')) out.push({ x: s('nom'), sous: { i, k: 'nom' } });
        for (const k of CLES_PERSONNE) if (s(k)) out.push({ x: s(k), sous: { i, k } });
        for (const x of dates(o.naissanceDate)) out.push({ x, sous: { i, k: 'naissanceDate' } });
      });
      return out;
    }
    case 'lignes': {
      if (!Array.isArray(v)) return [];
      const out: Valeur[] = [];
      v.forEach((r, i) => {
        const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
        for (const col of c.colonnes) {
          const x = typeof o[col.cle] === 'string' ? (o[col.cle] as string).trim() : '';
          if (x) out.push({ x, sous: { i, k: col.cle } });
        }
      });
      return out;
    }
    default:
      return [];
  }
}

/* Le passage contient-il la réponse en entier ? « 1 000 » n'est pas dans
   « 51 000 € » ni dans « 1 000 000 » ; « Martin » n'est pas dans « Martinez ». */
const LETTRE = /[\p{L}\p{N}]/u;
function contient(t: string, n: string, nombre: boolean): boolean {
  for (let i = t.indexOf(n); i >= 0; i = t.indexOf(n, i + 1)) {
    const av = t.charAt(i - 1), av2 = t.charAt(i - 2), ap = t.charAt(i + n.length), ap2 = t.charAt(i + n.length + 1);
    const libre = nombre
      ? !/[\d,.]/.test(av) && !(av === ' ' && /\d/.test(av2)) && !/\d/.test(ap) && !(/[ ,.]/.test(ap) && /\d/.test(ap2))
      : !LETTRE.test(av) && !LETTRE.test(ap);
    if (libre) return true;
  }
  return false;
}

/* La part du passage qu'une réponse explique : sa longueur si le passage la
   contient. Un long texte que l'aperçu coupe (« … », le résumé) se retrouve
   par un long morceau du passage, compté à moitié : une tournure courante
   (« prix de présentation ») ne doit pas l'emporter sur un vrai montant.
   Trop court, ça ne prouve rien. */
function score(v: Valeur, t: string, morceauxT: string[]): number {
  const n = normaliser(v.x);
  if (n.length < (v.n ? 4 : 6)) return 0;
  if (contient(t, n, !!v.n)) return n.length;
  if (n.length >= 40) {
    let best = 0;
    for (const m of morceauxT) if (m.length >= 40 && m.length > best && n.includes(m)) best = m.length;
    return Math.floor(best / 2);
  }
  return 0;
}

/* Les rubriques qu'aucune étape ne rédige en propre, et la question qui
   les écrit (d'abord celle qui existe dans ce modèle). */
const RUBRIQUES: Record<string, string[]> = {
  'il a été convenu ce qui suit': ['type'],
  'pouvoirs': ['pouvoirs'],
  'droit de rétractation': ['execution'],
  'informations': ['infoJointe', 'numero'],
};

const vue = (c: Champ, d: Donnees) => c.t !== 'titre' && c.t !== 'guide' && (!c.si || c.si(d));

function trouverCle(etapes: Etape[], d: Donnees, cle: string): Cible | null {
  for (let i = 0; i < etapes.length; i++) {
    if (etapes[i].champs.some(c => c.cle === cle && vue(c, d))) return { etape: i, cle };
  }
  return null;
}

/* Une rubrique seule : la question qui l'écrit, une question du même nom
   (« Clause particulière », « Durée »), ou l'étape qui la montre. */
function parRubrique(etapes: Etape[], d: Donnees, titre: string): Cible | null {
  const t = normaliser(titre);
  if (!t) return null;
  for (const cle of RUBRIQUES[t] || []) {
    const r = trouverCle(etapes, d, cle);
    if (r) return r;
  }
  for (let i = 0; i < etapes.length; i++) {
    const c = etapes[i].champs.find(x => vue(x, d) && 'lib' in x && normaliser(x.lib) === t);
    if (c) return { etape: i, cle: c.cle };
  }
  const i = etapes.findIndex(e => e.vers && normaliser(e.vers) === t);
  return i >= 0 ? { etape: i, cle: null } : null;
}

/* Le passage cliqué → la question. `rubriques` : les titres des rubriques
   du document, dans l'ordre (vides comprises) ; `ou` : l'index de celle du
   passage, ou -1 (la page de garde, le résumé) ; `titre` : le titre propre
   du passage, quand il en a un (une carte du résumé : « Durée »). */
export function chercherQuestion(etapes: Etape[], d: Donnees, passage: string, rubriques: string[], ou: number, titre?: string): Cible {
  const t = normaliser(passage);
  const morceauxT = t.split(/[·…\n]| : |\(|\)/).map(x => x.trim()).filter(Boolean);
  const rubrique = ou >= 0 ? normaliser(rubriques[ou] || '') : '';

  /* La réponse la plus longue l'emporte ; à égalité, la première, et un
     petit avantage à l'étape qui rédige la rubrique du passage. */
  let meilleur: Cible | null = null;
  let haut = 0;
  for (let i = 0; i < etapes.length; i++) {
    const e = etapes[i];
    const bonus = rubrique && e.vers && normaliser(e.vers) === rubrique ? 3 : 0;
    for (const c of e.champs) {
      if (!vue(c, d)) continue;
      for (const v of valeurs(c, d)) {
        const sc = score(v, t, morceauxT);
        if (sc > 0 && sc + bonus > haut) {
          haut = sc + bonus;
          meilleur = { etape: i, cle: c.cle, ...(v.sous ? { sous: v.sous } : {}) };
        }
      }
    }
  }
  if (meilleur) return meilleur;

  if (titre) {
    const r = parRubrique(etapes, d, titre);
    if (r) return r;
  }
  for (let j = ou; j >= 0; j--) {
    const r = parRubrique(etapes, d, rubriques[j] || '');
    if (r) return r;
  }
  return { etape: 0, cle: null };
}
