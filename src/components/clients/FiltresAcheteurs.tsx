'use client';
import { useEffect, useState } from 'react';
import { Ic } from '@/components/documents/ApercuActe';
import { SaisieNombre } from '@/components/biens/ChampsBien';
import s from '@/components/documents/Documents.module.css';
import b from '@/components/biens/Biens.module.css';
import l from './FiltresAcheteurs.module.css';

/* ═══ Les acheteurs, par ce qu'ils cherchent (V3.75) ══════════════════════
   Alexandre : « tous ceux qui recherchent un trois chambres, un quatre
   chambres, tant de mètres carrés minimum ». La même barre que pour les
   biens (FiltresBiens) : chaque bouton ouvre son petit panneau, ce qui est
   choisi s'écrit sur le bouton.

   On filtre sur CE QU'IL DEMANDE (sa recherche active, fusionnée sur la
   ligne par Clients.tsx) : « 3 chambres », c'est qu'il demande au moins
   3 chambres ; « surface de 80 à 100 m² », que le minimum qu'il demande
   est entre 80 et 100 m². Un acheteur qui n'a pas rempli ce critère
   n'apparaît pas tant que le filtre est posé : le panneau le dit.

   Et sur la même ligne (Alexandre : « trop de lignes, c'est très moche ») :
   le statut du dossier et son logement, qui étaient deux rangées de
   boutons au-dessus, avec « Tous » et « Toutes situations » qui ne
   filtraient rien et des statuts à 0 toujours affichés. Une seule ligne
   « Affiner », comme pour les biens. */

export type FiltresA = {
  types: string[]; pieces: number[]; chambres: number[];
  surfMin: number | null; surfMax: number | null; budMin: number | null; budMax: number | null; villes: string[];
};
export const FILTRES_A_VIDES: FiltresA = { types: [], pieces: [], chambres: [], surfMin: null, surfMax: null, budMin: null, budMax: null, villes: [] };
export const nbFiltresA = (f: FiltresA) =>
  (f.types.length ? 1 : 0) + (f.pieces.length ? 1 : 0) + (f.chambres.length ? 1 : 0) + (f.surfMin || f.surfMax ? 1 : 0)
  + (f.budMin || f.budMax ? 1 : 0) + (f.villes.length ? 1 : 0);

/* Ce qu'on lit d'un acheteur (les colonnes de sa recherche). */
type Acheteur = {
  type_bien?: unknown; nb_pieces_min?: unknown; nb_pieces_max?: unknown; chambres_min?: unknown;
  surface_min?: unknown; budget_min?: unknown; budget_max?: unknown; secteurs?: unknown;
};
const nombre = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };
const typesDe = (c: Acheteur) => String(c.type_bien || '').split(',').map(x => x.trim()).filter(Boolean);
/* Les secteurs sont stockés « Quartier (Ville) » : on ne garde que les villes. */
const villesDe = (c: Acheteur) => [...new Set((Array.isArray(c.secteurs) ? c.secteurs : []).map(x => { const m = String(x).match(/\((.+?)\)$/); return (m ? m[1] : String(x)).trim(); }).filter(Boolean))];
/* Les pièces qu'il demande : son minimum, sinon son maximum. */
const piecesDe = (c: Acheteur) => nombre(c.nb_pieces_min) ?? nombre(c.nb_pieces_max);
const chambresDe = (c: Acheteur) => nombre(c.chambres_min);
const surfaceDe = (c: Acheteur) => nombre(c.surface_min);
const budgetDe = (c: Acheteur) => nombre(c.budget_max) ?? nombre(c.budget_min);
/* 5 pièces = 5 et plus ; 4 chambres = 4 et plus. */
const PLUS_PIECES = 5, PLUS_CHAMBRES = 4;
/* V3.78 : la recherche dans les villes, sans tenir compte des accents ni
   des majuscules (« boul » trouve « Boulogne-Billancourt »). */
const sansAccents = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/* Les villes montrées d'un coup, sans recherche tapée. */
const MAX_VILLES = 30;
const egal = (v: number | null, k: number, plus: number) => !!v && (k >= plus ? v >= plus : v === k);

export function correspond(c: Acheteur, f: FiltresA): boolean {
  if (f.types.length) {
    const t = typesDe(c).map(x => x.toLowerCase());
    if (!f.types.some(x => t.includes(x.toLowerCase()))) return false;
  }
  if (f.pieces.length && !f.pieces.some(k => egal(piecesDe(c), k, PLUS_PIECES))) return false;
  if (f.chambres.length && !f.chambres.some(k => egal(chambresDe(c), k, PLUS_CHAMBRES))) return false;
  if (f.surfMin || f.surfMax) {
    const m = surfaceDe(c);
    if (!m || (f.surfMin && m < f.surfMin) || (f.surfMax && m > f.surfMax)) return false;
  }
  if (f.budMin || f.budMax) {
    const p = budgetDe(c);
    if (!p || (f.budMin && p < f.budMin) || (f.budMax && p > f.budMax)) return false;
  }
  if (f.villes.length) {
    const v = villesDe(c).map(x => x.toLowerCase());
    if (!f.villes.some(x => v.includes(x.toLowerCase()))) return false;
  }
  return true;
}

/* ── Ce que chaque bouton dit, une fois choisi ── */
/* Les montants en entier, jamais « 500 k » ni « 1,2 M » (V3.21). */
const k = (n: number) => Math.round(n).toLocaleString('fr-FR');
const entre = (a: number | null, z: number | null, u: string, fmt: (n: number) => string = String) =>
  a && z ? `${fmt(a)} – ${fmt(z)} ${u}` : a ? `dès ${fmt(a)} ${u}` : z ? `jusqu’à ${fmt(z)} ${u}` : '';
const liste = (l: number[], plus: number, u: string) => [...l].sort((x, y) => x - y).map(x => (x >= plus ? `${plus}+` : String(x))).join(', ') + (l.length ? ` ${u}` : '');
const plusieurs = (l: string[], u: string) => (l.length === 1 ? l[0] : l.length ? `${l.length} ${u}` : '');

type Panneau = 'statut' | 'logement' | 'type' | 'pieces' | 'chambres' | 'surface' | 'budget' | 'ville' | null;

/* Un choix unique (le statut, le logement) : sa valeur « tout », ses options et leurs chiffres. */
export type ChoixUnique = {
  v: string; tout: string; onChange: (v: string) => void;
  options: { k: string; l: string; n: number; c?: string; aide?: string; dans?: boolean }[];
};

function Puce({ l, n, on, onClick }: { l: string; n?: number; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`${s.pill} ${on ? s.pillOn : ''}`} aria-pressed={on} onClick={onClick}
      style={n === 0 && !on ? { opacity: 0.45 } : undefined}>
      <span>{l}{n !== undefined && <i style={{ fontStyle: 'normal', marginLeft: 7, color: '#94a3b8', fontWeight: 800 }}>{n}</i>}</span>
    </button>
  );
}

export default function FiltresAcheteurs({ base, f, onF, n, statut, logement }: {
  /* Les acheteurs avant ces critères (statut, logement et recherche texte déjà appliqués). */
  base: Acheteur[]; f: FiltresA; onF: (f: FiltresA) => void; n: number;
  statut: ChoixUnique; logement: ChoixUnique;
}) {
  const [ouvert, setOuvert] = useState<Panneau>(null);
  const [qVille, setQVille] = useState('');
  useEffect(() => {
    if (!ouvert) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [ouvert]);
  const basculer = (p: Panneau) => { if (p === 'ville') setQVille(''); setOuvert(o => (o === p ? null : p)); };
  /* Combien d'acheteurs on aurait avec ce choix, les autres critères gardés. */
  const combien = (g: Partial<FiltresA>) => base.filter(c => correspond(c, { ...f, ...g })).length;
  const actifs = nbFiltresA(f) + (logement.v !== logement.tout ? 1 : 0);
  const libDe = (c: ChoixUnique) => (c.v === c.tout ? '' : c.options.find(o => o.k === c.v)?.l || '');

  /* Les types et les villes proposés : ceux des acheteurs affichés, du plus
     demandé au moins demandé, et ceux déjà choisis. */
  const compte = (vals: string[][]) => {
    const m = new Map<string, number>();
    vals.flat().forEach(v => m.set(v, (m.get(v) || 0) + 1));
    return [...m.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'fr')).map(x => x[0]);
  };
  const types = compte(base.map(typesDe));
  const villes = compte(base.map(villesDe));
  [...f.types].forEach(t => { if (!types.includes(t)) types.push(t); });
  [...f.villes].forEach(v => { if (!villes.includes(v)) villes.push(v); });

  const boutons: { p: Exclude<Panneau, null>; l: string; ic: string; v: string }[] = [
    { p: 'type', l: 'Type', ic: 'maison', v: plusieurs(f.types, 'types') },
    { p: 'pieces', l: 'Pièces', ic: 'plan', v: liste(f.pieces, PLUS_PIECES, 'p.') },
    { p: 'chambres', l: 'Chambres', ic: 'lit', v: liste(f.chambres, PLUS_CHAMBRES, 'ch.') },
    { p: 'surface', l: 'Surface', ic: 'regle', v: entre(f.surfMin, f.surfMax, 'm²') },
    { p: 'budget', l: 'Budget', ic: 'euro', v: entre(f.budMin, f.budMax, '€', k) },
    { p: 'ville', l: 'Ville', ic: 'lieu', v: plusieurs(f.villes, 'villes') },
  ];
  const effacer = <button type="button" className={b.lien} onClick={() => { onF(FILTRES_A_VIDES); logement.onChange(logement.tout); setOuvert(null); }}>Effacer</button>;
  const resultat = <span className={b.affN}>{`${n} acheteur${n > 1 ? 's' : ''}`}{effacer}</span>;
  const basculerDans = <T,>(l: T[], x: T) => (l.includes(x) ? l.filter(y => y !== x) : [...l, x]);

  return (
    <div className={`${b.aff} ${s.saisieVive}`} style={{ margin: '-4px 0 0' }}>
      <div className={`${b.affL} ${l.ligne}`} role="toolbar" aria-label="Affiner la liste des acheteurs">
        <span className={b.affT}><Ic n="cible" t={15} />Affiner</span>
        {([['statut', 'Statut', 'drapeau', statut], ['logement', 'Logement', 'cle', logement]] as const).map(([p, l, ic, c]) => {
          const v = libDe(c);
          return (
            <button key={p} type="button" className={`${b.affB} ${v ? b.affOn : ''} ${ouvert === p ? b.affOuvert : ''}`}
              aria-expanded={ouvert === p} onClick={() => basculer(p)}>
              <Ic n={ic} t={15} /><span>{l}</span>{v && <b>{v}</b>}<Ic n={ouvert === p ? 'haut' : 'bas'} t={13} e={2.4} />
            </button>
          );
        })}
        <span aria-hidden="true" className={l.sep} />
        {/* Alexandre : « bien montrer que ces filtres-là, c'est ce qu'il recherche ». */}
        <span className={b.affT}>Ce qu’il cherche</span>
        {boutons.map(x => (
          <button key={x.p} type="button" className={`${b.affB} ${x.v ? b.affOn : ''} ${ouvert === x.p ? b.affOuvert : ''}`}
            aria-expanded={ouvert === x.p} onClick={() => basculer(x.p)}>
            <Ic n={x.ic} t={15} /><span>{x.l}</span>{x.v && <b>{x.v}</b>}<Ic n={ouvert === x.p ? 'haut' : 'bas'} t={13} e={2.4} />
          </button>
        ))}
        <span className={b.affEsp} />
        {actifs > 0 && resultat}
      </div>

      {/* Au téléphone, la ligne défile : le compte passe dessous. */}
      {actifs > 0 && <div className={b.affNBas}>{resultat}</div>}
      {ouvert && (
        <div className={b.affP}>
          {(ouvert === 'statut' || ouvert === 'logement') && (() => {
            const c = ouvert === 'statut' ? statut : logement;
            const aide = c.options.find(o => o.k === c.v)?.aide;
            return (
              <>
                <div className={s.pills}>
                  {c.options.filter(o => o.k !== c.tout && (o.n > 0 || o.k === c.v)).map(o => (
                    <button key={o.k} type="button" className={`${s.pill} ${c.v === o.k ? s.pillOn : ''}`} aria-pressed={c.v === o.k}
                      onClick={() => { c.onChange(c.v === o.k ? c.tout : o.k); setOuvert(null); }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        {o.c && <i style={{ width: 8, height: 8, borderRadius: '50%', background: o.c, flexShrink: 0 }} />}
                        {o.dans && <span style={{ color: '#94a3b8', fontWeight: 600 }}>{'dont'}</span>}
                        {o.l}
                        <i style={{ fontStyle: 'normal', color: '#94a3b8', fontWeight: 800 }}>{o.n}</i>
                      </span>
                    </button>
                  ))}
                  {(() => {
                    const t = c.options.find(o => o.k === c.tout);
                    return t ? (
                      <button type="button" className={`${s.pill} ${c.v === c.tout ? s.pillOn : ''}`} aria-pressed={c.v === c.tout}
                        onClick={() => { c.onChange(c.tout); setOuvert(null); }}>
                        <span>{t.l}<i style={{ fontStyle: 'normal', marginLeft: 7, color: '#94a3b8', fontWeight: 800 }}>{t.n}</i></span>
                      </button>
                    ) : null;
                  })()}
                </div>
                {aide && <p className={b.affAide}>{aide}</p>}
              </>
            );
          })()}
          {ouvert === 'type' && (
            <div className={s.pills}>
              {types.length === 0 && <span className={b.vide}>Aucun type saisi dans leurs recherches.</span>}
              {types.map(t => <Puce key={t} l={t} n={combien({ types: [t] })} on={f.types.includes(t)} onClick={() => onF({ ...f, types: basculerDans(f.types, t) })} />)}
            </div>
          )}
          {ouvert === 'pieces' && (
            <>
              <div className={s.pills}>
                {[1, 2, 3, 4, 5].map(x => (
                  <Puce key={x} l={x === 1 ? '1 pièce' : x >= PLUS_PIECES ? '5 pièces et plus' : `${x} pièces`} n={combien({ pieces: [x] })}
                    on={f.pieces.includes(x)} onClick={() => onF({ ...f, pieces: basculerDans(f.pieces, x) })} />
                ))}
              </div>
              <p className={b.affAide}>Le nombre de pièces qu’il demande au minimum. Ceux qui n’ont pas donné de nombre de pièces n’apparaissent pas.</p>
            </>
          )}
          {ouvert === 'chambres' && (
            <>
              <div className={s.pills}>
                {[1, 2, 3, 4].map(x => (
                  <Puce key={x} l={x === 1 ? '1 chambre' : x >= PLUS_CHAMBRES ? '4 chambres et plus' : `${x} chambres`} n={combien({ chambres: [x] })}
                    on={f.chambres.includes(x)} onClick={() => onF({ ...f, chambres: basculerDans(f.chambres, x) })} />
                ))}
              </div>
              <p className={b.affAide}>Le nombre de chambres qu’il demande au minimum. Ceux qui n’ont pas donné de nombre de chambres n’apparaissent pas.</p>
            </>
          )}
          {ouvert === 'surface' && (
            <>
              <div className={s.pills}>
                {([[null, 50, 'Moins de 50 m²'], [50, 70, '50 à 70 m²'], [70, 90, '70 à 90 m²'], [90, 120, '90 à 120 m²'], [120, null, 'Plus de 120 m²']] as const).map(([a, z, l]) => {
                  const on = f.surfMin === a && f.surfMax === z;
                  return <Puce key={l} l={l} n={combien({ surfMin: a, surfMax: z })} on={on} onClick={() => onF({ ...f, surfMin: on ? null : a, surfMax: on ? null : z })} />;
                })}
              </div>
              <div className={b.affMM}>
                <label><span>Au moins</span><SaisieNombre v={f.surfMin} unite="m²" off={false} onChange={x => onF({ ...f, surfMin: x })} ph="Min." lib="Surface demandée, au moins" /></label>
                <label><span>Au plus</span><SaisieNombre v={f.surfMax} unite="m²" off={false} onChange={x => onF({ ...f, surfMax: x })} ph="Max." lib="Surface demandée, au plus" /></label>
              </div>
              <p className={b.affAide}>La surface minimum qu’il demande. Ceux qui n’ont pas donné de surface n’apparaissent pas.</p>
            </>
          )}
          {ouvert === 'budget' && (
            <>
              <div className={s.pills}>
                {([[null, 400_000], [400_000, 700_000], [700_000, 1_000_000], [1_000_000, 1_500_000], [1_500_000, null]] as const).map(([a, z]) => {
                  const l = entre(a, z, '€', k);
                  const on = f.budMin === a && f.budMax === z;
                  return <Puce key={l} l={l} n={combien({ budMin: a, budMax: z })} on={on} onClick={() => onF({ ...f, budMin: on ? null : a, budMax: on ? null : z })} />;
                })}
              </div>
              <div className={b.affMM}>
                <label><span>À partir de</span><SaisieNombre v={f.budMin} euros unite="€" off={false} onChange={x => onF({ ...f, budMin: x })} ph="Min." lib="Budget, à partir de" /></label>
                <label><span>Jusqu’à</span><SaisieNombre v={f.budMax} euros unite="€" off={false} onChange={x => onF({ ...f, budMax: x })} ph="Max." lib="Budget, jusqu’à" /></label>
              </div>
              <p className={b.affAide}>Son budget maximum.</p>
            </>
          )}
          {/* V3.78 (Alexandre : « quand il y a beaucoup de villes, une petite
              barre de recherche pour sélectionner plus vite ») : on tape, la
              liste se réduit ; Entrée coche la première trouvée. Les villes
              déjà cochées restent toujours en vue. */}
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
                  {villes.length === 0 && <span className={b.vide}>Aucun secteur saisi dans leurs recherches.</span>}
                  {q && trouvees.length === 0 && <span className={b.vide}>{`Aucune ville ne contient « ${qVille.trim()} ».`}</span>}
                  {vues.map(v => <Puce key={v} l={v} n={combien({ villes: [v] })} on={f.villes.includes(v)} onClick={() => onF({ ...f, villes: basculerDans(f.villes, v) })} />)}
                </div>
                {reste > 0 && <p className={b.affAide}>{`Et ${reste} autre${reste > 1 ? 's' : ''} ville${reste > 1 ? 's' : ''} : tape le début du nom pour ${reste > 1 ? 'les' : 'la'} trouver.`}</p>}
              </>
            );
          })()}
          <button type="button" className={b.affFermer} onClick={() => setOuvert(null)} aria-label="Fermer ce panneau"><Ic n="haut" t={15} e={2.4} /></button>
        </div>
      )}
    </div>
  );
}
