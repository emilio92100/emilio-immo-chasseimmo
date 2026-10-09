'use client';
import { useEffect, useState } from 'react';
import { num } from '@/lib/actes';
import { TYPES_BIEN, villeAffichee, type BienVente } from '@/lib/biens-vente';
import { txt } from '@/lib/actes';
import { Ic } from '@/components/documents/ApercuActe';
import { COULEURS, SaisieNombre } from './ChampsBien';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';
import l from '@/components/clients/FiltresAcheteurs.module.css';

/* ═══ Affiner la liste des biens (V3.16) ══════════════════════════════════
   Une ligne sous les catégories : le type, la surface, les pièces, le
   budget, le DPE au plus, et l'ordre (étape, prix croissant ou
   décroissant, surface, les plus récents). Chaque bouton ouvre son petit
   panneau juste en dessous ; ce qui est choisi s'écrit sur le bouton. */

export type Tri = 'etape' | 'prixC' | 'prixD' | 'surface' | 'recents';
export type Filtres = {
  types: string[]; pieces: number[]; dpeMax: string;
  surfMin: number | null; surfMax: number | null; budMin: number | null; budMax: number | null;
  /* V3.80 (Alexandre : « dans Affiner, je n'ai pas Ville ; faire pareil que
     pour les contacts ») : « Paris 16e », « Boulogne-Billancourt »… */
  villes: string[];
};
export const FILTRES_VIDES: Filtres = { types: [], pieces: [], dpeMax: '', surfMin: null, surfMax: null, budMin: null, budMax: null, villes: [] };
export const nbFiltres = (f: Filtres) =>
  (f.types.length ? 1 : 0) + (f.pieces.length ? 1 : 0) + (f.dpeMax ? 1 : 0) + (f.surfMin || f.surfMax ? 1 : 0) + (f.budMin || f.budMax ? 1 : 0) + (f.villes.length ? 1 : 0);

const LETTRES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const TRIS: { v: Tri; l: string; ic: string }[] = [
  { v: 'etape', l: 'Par étape', ic: 'lignes' }, { v: 'prixC', l: 'Prix croissant', ic: 'haut' }, { v: 'prixD', l: 'Prix décroissant', ic: 'bas' },
  { v: 'surface', l: 'Surface, la plus grande d’abord', ic: 'regle' }, { v: 'recents', l: 'Les plus récents', ic: 'historique' },
];

/* Le prix d'un bien pour trier et filtrer : l'affiché, sinon le milieu de
   la fourchette d'estimation. */
export function prixDe(x: BienVente): number | null {
  const d = x.donnees || {};
  const p = x.prix ?? num(d, 'prix');
  if (p) return p;
  const a = num(d, 'estimBasse'), h = num(d, 'estimHaute');
  return a && h ? (a + h) / 2 : a || h || null;
}
const surfaceDe = (x: BienVente) => x.surface ?? num(x.donnees || {}, 'surface') ?? num(x.donnees || {}, 'carrez');
const piecesDe = (x: BienVente) => x.nb_pieces ?? num(x.donnees || {}, 'pieces');
const typeDe = (x: BienVente) => x.type_bien || (typeof x.donnees?.typeBien === 'string' ? x.donnees.typeBien : '');
/* La ville telle que la carte l'écrit (« Paris 16e »). */
export const villeDe = (x: BienVente) => villeAffichee(x.ville || txt(x.donnees || {}, 'ville'), x.code_postal || txt(x.donnees || {}, 'cp'));
const sansAccents = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const MAX_VILLES = 30;

export function filtrer(l: BienVente[], f: Filtres): BienVente[] {
  return l.filter(x => {
    if (f.types.length && !f.types.includes(typeDe(x))) return false;
    if (f.villes.length && !f.villes.includes(villeDe(x))) return false;
    if (f.pieces.length) {
      const n = piecesDe(x);
      if (!n || !f.pieces.some(k => (k >= 5 ? n >= 5 : n === k))) return false;
    }
    if (f.surfMin || f.surfMax) {
      const m = surfaceDe(x);
      if (!m || (f.surfMin && m < f.surfMin) || (f.surfMax && m > f.surfMax)) return false;
    }
    if (f.budMin || f.budMax) {
      const p = prixDe(x);
      if (!p || (f.budMin && p < f.budMin) || (f.budMax && p > f.budMax)) return false;
    }
    if (f.dpeMax) {
      const l2 = String(x.donnees?.dpe || '');
      if (!LETTRES.includes(l2) || LETTRES.indexOf(l2) > LETTRES.indexOf(f.dpeMax)) return false;
    }
    return true;
  });
}

/* `parEtape` : l'ordre de la liste d'avant (le mandat d'abord, puis le plus
   récemment touché). Les biens sans prix ou sans surface vont à la fin. */
export function trier(l: BienVente[], tri: Tri, parEtape: (p: BienVente, r: BienVente) => number): BienVente[] {
  const fin = (v: number | null, sens: 1 | -1) => (v === null ? Infinity : v * sens);
  const c = [...l];
  if (tri === 'prixC') return c.sort((p, r) => fin(prixDe(p), 1) - fin(prixDe(r), 1) || parEtape(p, r));
  if (tri === 'prixD') return c.sort((p, r) => fin(prixDe(p), -1) - fin(prixDe(r), -1) || parEtape(p, r));
  if (tri === 'surface') return c.sort((p, r) => fin(surfaceDe(p), -1) - fin(surfaceDe(r), -1) || parEtape(p, r));
  if (tri === 'recents') return c.sort((p, r) => r.created_at.localeCompare(p.created_at));
  return c.sort(parEtape);
}

/* ── Ce que chaque bouton dit, une fois choisi ── */
/* Les montants en entier : « 500 000 – 800 000 € », jamais « 500 k » ni « 1,2 M » (V3.21). */
const k = (n: number) => Math.round(n).toLocaleString('fr-FR');
const entre = (a: number | null, z: number | null, u: string, f: (n: number) => string = String) =>
  a && z ? `${f(a)} – ${f(z)} ${u}` : a ? `dès ${f(a)} ${u}` : z ? `jusqu’à ${f(z)} ${u}` : '';
const nomType = (v: string) => TYPES_BIEN.find(t => t.v === v)?.l || v;

type Panneau = 'type' | 'ville' | 'surface' | 'pieces' | 'budget' | 'dpe' | 'tri' | null;

function Puce({ l, on, ic, n, onClick }: { l: string; on: boolean; ic?: string; n?: number; onClick: () => void }) {
  return (
    <button type="button" className={`${s.pill} ${on ? s.pillOn : ''}`} aria-pressed={on} onClick={onClick}
      style={n === 0 && !on ? { opacity: 0.45 } : undefined}>
      {ic && <Ic n={ic} t={15} />}{l}{n !== undefined && <i className={b.affPuceN}>{n}</i>}
    </button>
  );
}

export default function FiltresBiens({ biens, f, onF, tri, onTri, n, total, vue, onVue }: {
  biens: BienVente[]; f: Filtres; onF: (f: Filtres) => void; tri: Tri; onTri: (t: Tri) => void; n: number; total: number;
  vue: 'cartes' | 'lignes'; onVue: (v: 'cartes' | 'lignes') => void;
}) {
  const [ouvert, setOuvert] = useState<Panneau>(null);
  useEffect(() => {
    if (!ouvert) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [ouvert]);
  const [qVille, setQVille] = useState('');
  const basculer = (p: Panneau) => { if (p === 'ville') setQVille(''); setOuvert(o => (o === p ? null : p)); };
  /* Les types proposés : ceux de la liste, et ceux déjà choisis. */
  const presents = new Set(biens.map(typeDe).filter(Boolean));
  const types = TYPES_BIEN.filter(t => presents.has(t.v) || f.types.includes(t.v));
  const actifs = nbFiltres(f);
  /* Les villes des biens, de la plus fréquente à la moins fréquente, et
     celles déjà choisies. */
  const parVille = new Map<string, number>();
  biens.forEach(x => { const v = villeDe(x); if (v) parVille.set(v, (parVille.get(v) || 0) + 1); });
  const villes = [...parVille.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'fr')).map(x => x[0]);
  f.villes.forEach(v => { if (!villes.includes(v)) villes.push(v); });
  const combien = (v: string) => filtrer(biens, { ...f, villes: [v] }).length;
  const plusieurs = (l2: string[], mot: string) => (l2.length === 1 ? l2[0] : l2.length ? `${l2.length} ${mot}` : '');

  const boutons: { p: Exclude<Panneau, null>; l: string; ic: string; v: string }[] = [
    { p: 'type', l: 'Type', ic: 'maison', v: f.types.length === 1 ? nomType(f.types[0]) : f.types.length ? `${f.types.length} types` : '' },
    { p: 'ville', l: 'Ville', ic: 'lieu', v: plusieurs(f.villes, 'villes') },
    { p: 'surface', l: 'Surface', ic: 'regle', v: entre(f.surfMin, f.surfMax, 'm²') },
    { p: 'pieces', l: 'Pièces', ic: 'plan', v: [...f.pieces].sort((x, y) => x - y).map(x => (x >= 5 ? '5+' : String(x))).join(', ') },
    { p: 'budget', l: 'Budget', ic: 'euro', v: entre(f.budMin, f.budMax, '€', k) },
    { p: 'dpe', l: 'DPE', ic: 'eclair', v: f.dpeMax ? (f.dpeMax === 'A' ? 'A' : `A à ${f.dpeMax}`) : '' },
  ];
  const triL = TRIS.find(x => x.v === tri) || TRIS[0];
  const compte = (
    <span className={b.affN}>
      {`${n} bien${n > 1 ? 's' : ''} sur ${total}`}
      <button type="button" className={b.lien} onClick={() => { onF(FILTRES_VIDES); setOuvert(null); }}>Effacer</button>
    </span>
  );

  return (
    <div className={`${b.aff} ${s.saisieVive}`}>
      <div className={b.affL} role="toolbar" aria-label="Affiner la liste" data-defile="fondu">
        <span className={b.affT}><Ic n="cible" t={15} />Affiner</span>
        {boutons.map(x => (
          <button key={x.p} type="button" className={`${b.affB} ${x.v ? b.affOn : ''} ${ouvert === x.p ? b.affOuvert : ''}`}
            aria-expanded={ouvert === x.p} onClick={() => basculer(x.p)}>
            <Ic n={x.ic} t={15} /><span>{x.l}</span>{x.v && <b>{x.v}</b>}<Ic n={ouvert === x.p ? 'haut' : 'bas'} t={13} e={2.4} />
          </button>
        ))}
        <span className={b.affEsp} />
        {actifs > 0 && compte}
        <button type="button" className={`${b.affB} ${b.affTri} ${tri !== 'etape' ? b.affOn : ''} ${ouvert === 'tri' ? b.affOuvert : ''}`}
          aria-expanded={ouvert === 'tri'} onClick={() => basculer('tri')}>
          <Ic n={triL.ic} t={15} /><span>{tri === 'etape' ? 'Trier' : triL.l.split(',')[0]}</span><Ic n={ouvert === 'tri' ? 'haut' : 'bas'} t={13} e={2.4} />
        </button>
        {/* En cartes ou en lignes (V3.17). */}
        <span className={b.affVue} role="group" aria-label="Affichage">
          <button type="button" aria-pressed={vue === 'cartes'} title="En cartes" aria-label="En cartes" onClick={() => onVue('cartes')}><Ic n="cartes" t={16} /></button>
          <button type="button" aria-pressed={vue === 'lignes'} title="En lignes" aria-label="En lignes" onClick={() => onVue('lignes')}><Ic n="lignes" t={16} /></button>
        </span>
      </div>

      {/* Au téléphone, la ligne défile : le compte passe dessous. */}
      {actifs > 0 && <div className={b.affNBas}>{compte}</div>}
      {ouvert && (
        <div className={b.affP}>
          {ouvert === 'type' && (
            <div className={s.pills}>
              {types.length === 0 && <span className={b.vide}>Aucun type saisi sur les biens.</span>}
              {types.map(t => (
                <Puce key={t.v} l={t.l} ic={t.ic} on={f.types.includes(t.v)}
                  onClick={() => onF({ ...f, types: f.types.includes(t.v) ? f.types.filter(x => x !== t.v) : [...f.types, t.v] })} />
              ))}
            </div>
          )}
          {/* La ville (V3.80), comme dans Contacts : on tape, la liste se
              réduit ; Entrée coche la première trouvée. */}
          {ouvert === 'ville' && (() => {
            const q = sansAccents(qVille.trim());
            const trouvees = q ? villes.filter(v => sansAccents(v).includes(q)) : villes;
            const tete = q ? trouvees : trouvees.slice(0, MAX_VILLES);
            const vues = [...f.villes.filter(v => !tete.includes(v)), ...tete];
            const reste = trouvees.length - tete.length;
            return (
              <>
                {villes.length > 0 && (
                  <label className={l.cherche}>
                    <Ic n="loupe" t={15} e={2.2} />
                    <input value={qVille} onChange={e => setQVille(e.target.value)} placeholder={`Chercher parmi ${villes.length} ville${villes.length > 1 ? 's' : ''}…`}
                      aria-label="Chercher une ville" autoFocus={typeof window !== 'undefined' && window.innerWidth > 760}
                      onKeyDown={e => {
                        if (e.key !== 'Enter' || !q || !trouvees.length) return;
                        e.preventDefault();
                        const v = trouvees[0];
                        if (!f.villes.includes(v)) onF({ ...f, villes: [...f.villes, v] });
                        setQVille('');
                      }} />
                    {qVille && <button type="button" className={l.chercheVider} onClick={() => setQVille('')} aria-label="Effacer la recherche"><Ic n="croix" t={13} e={2.4} /></button>}
                  </label>
                )}
                <div className={s.pills}>
                  {villes.length === 0 && <span className={b.vide}>Aucune ville saisie sur ces biens.</span>}
                  {q && trouvees.length === 0 && <span className={b.vide}>{`Aucune ville ne contient « ${qVille.trim()} ».`}</span>}
                  {vues.map(v => <Puce key={v} l={v} n={combien(v)} on={f.villes.includes(v)} onClick={() => onF({ ...f, villes: f.villes.includes(v) ? f.villes.filter(x => x !== v) : [...f.villes, v] })} />)}
                </div>
                {reste > 0 && <p className={b.affAide}>{`Et ${reste} autre${reste > 1 ? 's' : ''} ville${reste > 1 ? 's' : ''} : tape le début du nom pour ${reste > 1 ? 'les' : 'la'} trouver.`}</p>}
              </>
            );
          })()}
          {ouvert === 'surface' && (
            <>
              <div className={s.pills}>
                {([[null, 40, 'Moins de 40 m²'], [40, 70, '40 à 70 m²'], [70, 100, '70 à 100 m²'], [100, 150, '100 à 150 m²'], [150, null, 'Plus de 150 m²']] as const).map(([a, z, l]) => (
                  <Puce key={l} l={l} on={f.surfMin === a && f.surfMax === z} onClick={() => onF({ ...f, surfMin: f.surfMin === a && f.surfMax === z ? null : a, surfMax: f.surfMin === a && f.surfMax === z ? null : z })} />
                ))}
              </div>
              <div className={b.affMM}>
                <label><span>Au moins</span><SaisieNombre v={f.surfMin} unite="m²" off={false} onChange={x => onF({ ...f, surfMin: x })} ph="Min." lib="Surface minimum" /></label>
                <label><span>Au plus</span><SaisieNombre v={f.surfMax} unite="m²" off={false} onChange={x => onF({ ...f, surfMax: x })} ph="Max." lib="Surface maximum" /></label>
              </div>
            </>
          )}
          {ouvert === 'pieces' && (
            <div className={s.pills}>
              {[1, 2, 3, 4, 5].map(x => (
                <Puce key={x} l={x === 1 ? '1 pièce' : x >= 5 ? '5 pièces et plus' : `${x} pièces`} on={f.pieces.includes(x)}
                  onClick={() => onF({ ...f, pieces: f.pieces.includes(x) ? f.pieces.filter(y => y !== x) : [...f.pieces, x] })} />
              ))}
            </div>
          )}
          {ouvert === 'budget' && (
            <>
              <div className={s.pills}>
                {([[null, 300_000], [300_000, 500_000], [500_000, 800_000], [800_000, 1_200_000], [1_200_000, null]] as const).map(([a, z]) => {
                  const l = entre(a, z, '€', k);
                  const on = f.budMin === a && f.budMax === z;
                  return <Puce key={l} l={l} on={on} onClick={() => onF({ ...f, budMin: on ? null : a, budMax: on ? null : z })} />;
                })}
              </div>
              <div className={b.affMM}>
                <label><span>À partir de</span><SaisieNombre v={f.budMin} euros unite="€" off={false} onChange={x => onF({ ...f, budMin: x })} ph="Min." lib="Budget minimum" /></label>
                <label><span>Jusqu’à</span><SaisieNombre v={f.budMax} euros unite="€" off={false} onChange={x => onF({ ...f, budMax: x })} ph="Max." lib="Budget maximum" /></label>
              </div>
              <p className={b.affAide}>Le prix affiché ; avant le mandat, le milieu de la fourchette d’estimation.</p>
            </>
          )}
          {ouvert === 'dpe' && (
            <>
              <div className={b.affDpe} role="radiogroup" aria-label="DPE au plus">
                {LETTRES.map(l => {
                  const dans = !!f.dpeMax && LETTRES.indexOf(l) <= LETTRES.indexOf(f.dpeMax);
                  const c = COULEURS.dpe[l];
                  return (
                    <button key={l} type="button" role="radio" aria-checked={f.dpeMax === l} className={`${b.affDpeL} ${dans ? b.affDpeOn : ''}`}
                      style={{ background: c.f, color: c.t }} onClick={() => onF({ ...f, dpeMax: f.dpeMax === l ? '' : l })}>{l}</button>
                  );
                })}
              </div>
              <p className={b.affAide}>{f.dpeMax ? `Classés de A à ${f.dpeMax}. Les biens sans DPE saisi n’apparaissent pas.` : 'Choisis la classe la plus basse acceptée : D montre A, B, C et D.'}</p>
            </>
          )}
          {ouvert === 'tri' && (
            <div className={s.pills}>
              {TRIS.map(x => <Puce key={x.v} l={x.l} ic={x.ic} on={tri === x.v} onClick={() => { onTri(x.v); setOuvert(null); }} />)}
            </div>
          )}
          <button type="button" className={b.affFermer} onClick={() => setOuvert(null)} aria-label="Fermer ce panneau"><Ic n="haut" t={15} e={2.4} /></button>
        </div>
      )}
    </div>
  );
}
