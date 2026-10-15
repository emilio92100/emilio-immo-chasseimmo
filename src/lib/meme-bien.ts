/* ═══ « Sans doute le même bien » (V3.198) ════════════════════════════════
   Alexandre : « ça peut être un autre lien de la même annonce, non ? ». Une
   agence peut envoyer, depuis son propre site, un bien qu'il a déjà vu sur
   SeLoger, ou qu'une autre agence lui a déjà proposé (mandat simple). Le
   lien diffère : on rapproche alors le bien lui-même.

   Les règles, prudentes exprès (un rapprochement à tort ferait écarter un
   bon bien) :
   - la surface, à 1 m² près (2 % pour les grandes) : sans elle, rien ;
   - la ville : la même, ou l'une précise l'autre (« Paris » et « Paris 15e ») ;
   - le nombre de pièces : le même, quand les deux le disent ;
   - le prix : à 12 % près (deux agences, deux honoraires, une baisse) ;
   - et au moins un appui en plus de la surface : le prix ou les pièces ;
     sans ville connue d'un côté, un prix à 3 % près.
   Le même lien (au « www. » et au « / » final près) passe avant tout.

   Seul Alexandre le voit, sur la carte de la Veille. L'agence, elle, n'est
   prévenue que du même lien (api/agences/proposer) : une ressemblance peut
   se tromper (deux appartements jumeaux dans le même immeuble). */

export type Repere = {
  cle: string;
  /** où il est : « dans sa Sélection », « écarté dans la Veille »… */
  ou: string;
  titre: string;
  url: string | null;
  prix: number | null;
  surface: number | null;
  pieces: number | null;
  ville: string | null;
  /** pour départager : le dossier d'abord, puis la Veille, le client, les agences */
  rang: number;
};
export type Rapprochement = { repere: Repere; lien: boolean; phrase: string };

export const nombre = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(/[\s€m²]/g, '').replace(',', '.')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Le dernier morceau d'une adresse, sans code postal : « 12 rue X, 92170 Vanves » → « Vanves ». */
export function villeDeLAdresse(adresse: unknown): string | null {
  if (typeof adresse !== 'string' || !adresse.includes(',')) return null;
  const v = adresse.split(',').pop()!.replace(/\b\d{5}\b/g, '').trim();
  return v.length >= 2 ? v : null;
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normVille = (v: string) => sansAccents(v).toLowerCase().replace(/\bcedex\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** true : la même ville ; false : deux villes différentes ; null : on ne sait pas. */
function villes(a: string | null, b: string | null): boolean | null {
  if (!a || !b) return null;
  const x = normVille(a), y = normVille(b);
  if (!x || !y) return null;
  return x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `);
}

/** Le lien, ramené à l'essentiel : l'hôte sans « www. », le chemin sans « / » final, la requête gardée. */
export function cleLien(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const x = new URL(u);
    const chemin = x.pathname.replace(/\/+$/, '');
    return `${x.hostname.toLowerCase().replace(/^www\./, '')}${chemin}${x.search}`;
  } catch { return null; }
}

const m2 = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} m²`;
const euros = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ')} €`;

export function rapprocher(cible: Omit<Repere, 'cle' | 'ou' | 'titre' | 'rang'> & { cle: string }, reperes: Repere[]): Rapprochement | null {
  const autres = reperes.filter(r => r.cle !== cible.cle);

  const lc = cleLien(cible.url);
  if (lc) {
    const r = autres.filter(x => cleLien(x.url) === lc).sort((p, q) => p.rang - q.rang)[0];
    if (r) return { repere: r, lien: true, phrase: `Même annonce que « ${r.titre} », ${r.ou}.` };
  }

  let mieux: { r: Repere; note: number; ds: number; dp: number | null } | null = null;
  for (const r of autres) {
    if (!cible.surface || !r.surface) continue;
    const ds = Math.abs(cible.surface - r.surface);
    if (ds > Math.max(1, 0.02 * Math.max(cible.surface, r.surface))) continue;
    const v = villes(cible.ville, r.ville);
    if (v === false) continue;
    const memesPieces = !!(cible.pieces && r.pieces);
    if (memesPieces && cible.pieces !== r.pieces) continue;
    let dp: number | null = null;
    if (cible.prix && r.prix) {
      dp = Math.abs(cible.prix - r.prix) / Math.max(cible.prix, r.prix);
      if (dp > 0.12) continue;
    }
    if (dp === null && !memesPieces) continue;
    if (v === null && (dp === null || dp > 0.03)) continue;
    const note = ds * 10 + (dp ?? 0.06) * 100 + r.rang;
    if (!mieux || note < mieux.note) mieux = { r, note, ds, dp };
  }
  if (!mieux) return null;

  const { r, ds } = mieux;
  const bouts = [ds < 0.5 ? 'même surface' : `${m2(r.surface!)} là-bas pour ${m2(cible.surface!)} ici`];
  if (cible.prix && r.prix) {
    const d = cible.prix - r.prix;
    bouts.push(Math.abs(d) < 1000 ? 'même prix' : `${euros(Math.abs(d))} de ${d < 0 ? 'moins' : 'plus'} ici`);
  } else if (cible.pieces && r.pieces) {
    bouts.push(`${r.pieces} pièce${r.pieces > 1 ? 's' : ''} des deux côtés`);
  }
  return { repere: r, lien: false, phrase: `Sans doute le même bien que « ${r.titre} », ${r.ou} : ${bouts.join(', ')}.` };
}
