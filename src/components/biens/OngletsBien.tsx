'use client';
import { Children, Fragment, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { euros } from '@/lib/mandat';
import { ISSUES, type Issue } from '@/lib/visites';
import { ETATS_PIECE, etapeDe, m2, nomExpo, pictoPiece, type BienVente, type Photo, type Piece, type SuiviVente } from '@/lib/biens-vente';
import { Ic } from '@/components/documents/ApercuActe';
import { COULEURS, habitable, nbPrincipales } from './ChampsBien';
import f from '@/components/fiche/FriseSuivi.module.css';
import o from './OngletsBien.module.css';

/* ═══ Les onglets d'un bien, refaits (V3.29) ════════════════════════════
   Maquettes validées par Alexandre (canevas, planches 13 à 17), codées ici ;
   FicheBien.tsx prépare les données et branche les actions.
   · Le bien : l'annonce (un anneau dit où elle en est) et les photos, puis
     une carte par famille, chacune de sa couleur (l'intérieur en bleu,
     l'immeuble en violet, la copropriété en sarcelle…), puis les pièces,
     en liste ou en cartes — le choix est gardé dans ce navigateur.
   · Visites et offres : la date en pavé, « À venir · Passées · Toutes » ;
     l'offre avec son écart au prix, ses étapes et le délai de réponse.
   · Documents : une tuile par sorte de document, puis le dossier des
     diagnostics avec son anneau.
   · Historique : la frise du Suivi d'un contact (mêmes styles,
     FriseSuivi.module.css), « À venir » en haut, et à côté le parcours du
     bien et ses chiffres. */

/* ── Petits outils ── */
const NBSP = ' ';
const jourMidi = (iso: string) => new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
const joursDepuis = (iso: string) => {
  const x = jourMidi(iso);
  if (isNaN(x.getTime())) return null;
  const a = new Date(); a.setHours(12, 0, 0, 0);
  const b = new Date(x); b.setHours(12, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
};
const dateCourteMois = (iso: string) => {
  const x = jourMidi(iso);
  return isNaN(x.getTime()) ? '' : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};
/* « aujourd'hui », « hier », « il y a 4 jours », « le 20 sept. » */
export const ilYa = (iso: string) => {
  const n = joursDepuis(iso);
  if (n === null) return '';
  if (n <= 0) return 'aujourd’hui';
  if (n === 1) return 'hier';
  if (n < 7) return `il y a ${n} jours`;
  return `le ${dateCourteMois(iso)}`;
};
const heureFr = (h: string) => (h ? h.slice(0, 5).replace(':', ' h ') : '');
const capitale = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const pctFr = (x: number) => `${String(Math.round(x * 10) / 10).replace('.', ',')}${NBSP}%`;

/* ── L'anneau : une part remplie, un mot au centre ── */
export function Anneau({ part, taille = 64, ep = 7, c = '#c9a84c', fond = '#fdf3d8', texte, texteC = '#7a5d1c', label }: {
  part: number; taille?: number; ep?: number; c?: string; fond?: string; texte: string; texteC?: string; label: string;
}) {
  const r = (taille - ep) / 2 - 1;
  const circ = 2 * Math.PI * r;
  const plein = Math.max(0, Math.min(1, part)) * circ;
  const m = taille / 2;
  return (
    <svg className={o.anneau} width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} role="img" aria-label={label}>
      <circle cx={m} cy={m} r={r} fill="none" stroke={fond} strokeWidth={ep} />
      {plein > 0.5 && (
        <circle className={o.anneauPlein} cx={m} cy={m} r={r} fill="none" stroke={c} strokeWidth={ep} strokeLinecap="round"
          strokeDasharray={`${plein} ${circ}`} transform={`rotate(-90 ${m} ${m})`} style={{ ['--circ' as string]: String(circ) } as CSSProperties} />
      )}
      <text x={m} y={m + taille / 13} textAnchor="middle" fill={texteC} style={{ font: `800 ${Math.round(taille / 4.9)}px 'Plus Jakarta Sans', sans-serif` }}>{texte}</text>
    </svg>
  );
}

/* ══ LE BIEN ════════════════════════════════════════════════════════════ */
export type Ton = 'bleu' | 'violet' | 'sarcelle' | 'vert' | 'ambre' | 'ardoise' | 'or';
const TONS: Record<Ton, { fond: string; c: string; ic: string; icC: string }> = {
  bleu: { fond: '#eff4fb', c: '#2d5c8f', ic: '#2d5c8f', icC: '#fff' },
  violet: { fond: '#f5f3ff', c: '#6d28d9', ic: '#6d28d9', icC: '#fff' },
  sarcelle: { fond: '#f0fdfa', c: '#0f766e', ic: '#0d9488', icC: '#fff' },
  vert: { fond: '#f0fdf4', c: '#15803d', ic: '#16a34a', icC: '#fff' },
  ambre: { fond: '#fffbeb', c: '#b45309', ic: '#d97706', icC: '#fff' },
  ardoise: { fond: '#f1f5f9', c: '#334155', ic: '#475569', icC: '#fff' },
  or: { fond: '#fbf6e9', c: '#7a5d1c', ic: '#c9a84c', icC: '#1a2332' },
};

/* Une famille : l'en-tête de sa couleur, puis ses lignes. */
export function Famille({ ton, ic, titre, onModifier, children }: { ton: Ton; ic: string; titre: string; onModifier?: () => void; children: ReactNode }) {
  const t = TONS[ton];
  return (
    <section className={o.fam} style={{ ['--fam' as string]: t.c, ['--famFond' as string]: t.fond, ['--famIc' as string]: t.ic, ['--famIcC' as string]: t.icC } as CSSProperties}>
      <div className={o.famT}>
        <span className={o.famIc}><Ic n={ic} t={16} e={2} /></span>
        <b>{titre}</b>
        {onModifier && <button type="button" onClick={onModifier}>Modifier</button>}
      </div>
      <div className={o.famC}>{children}</div>
    </section>
  );
}
/* Une ligne : le mot à gauche, la valeur à droite. Vide : rien.
   Une valeur longue (une phrase, pas un chiffre) passe sous le mot, calée à
   gauche, en texte normal (V3.30) : en gras et calée à droite, elle faisait
   une colonne de trois mots par ligne. */
export function Kv({ l, v, alerte }: { l: string; v: ReactNode; alerte?: boolean }) {
  if (v === '' || v === null || v === undefined || v === false) return null;
  const long = typeof v === 'string' && v.length > 38;
  return <div className={`${o.kv} ${long ? o.kvLong : ''} ${alerte ? o.kvAlerte : ''}`}><span>{l}</span><b>{v}</b></div>;
}
/* Une petite liste de travaux : le quoi en gras, le quand et le mot dessous. */
export function ListeTravaux({ titre, l }: { titre: string; l: { id: string; t: string; s: string }[] }) {
  if (!l.length) return null;
  return (
    <div className={o.travaux}>
      <span className={o.travauxT}>{titre}</span>
      <ul>{l.map(x => <li key={x.id}><b>{x.t}</b>{x.s && <small>{x.s}</small>}</li>)}</ul>
    </div>
  );
}
export function Puces({ l }: { l: string[] }) {
  if (!l.length) return null;
  return <div className={o.puces}>{l.map(x => <span key={x}>{x}</span>)}</div>;
}
export const ADecrire = ({ t = 'À décrire.' }: { t?: string }) => <div className={o.aDecrire}>{t}</div>;
export const Note = ({ children }: { children: ReactNode }) => <div className={o.note}>{children}</div>;
export const Encart = ({ children }: { children: ReactNode }) => <div className={o.encart}>{children}</div>;

/* L'énergie : les sept lettres, celle du bien relevée. */
export function Lettres({ genre, v, titre }: { genre: 'dpe' | 'ges'; v: string; titre: string }) {
  return (
    <div className={o.ech}>
      <div className={o.echT}>{titre}</div>
      {v ? (
        <div className={o.echL} role="img" aria-label={`${titre} : classe ${v}`}>
          {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(l => (
            <span key={l} className={l === v ? o.ici : undefined} style={{ background: COULEURS[genre][l].f, color: COULEURS[genre][l].t }}>{l}</span>
          ))}
        </div>
      ) : <div className={o.echVide}>Classe à saisir</div>}
    </div>
  );
}

/* L'annonce : où elle en est, en un anneau. */
export function CarteAnnonce({ texte, mentions, onEcrire }: { texte: string; mentions: { ok: boolean; l: string }[]; onEcrire: () => void }) {
  const [lire, setLire] = useState(false);
  const [copie, setCopie] = useState(false);
  const manque = mentions.filter(x => !x.ok);
  /* Le texte compte pour 60 %, les mentions obligatoires pour le reste :
     une annonce pas écrite ne dépasse jamais 40 %. */
  const part = (texte ? 0.6 : 0) + (mentions.length ? (0.4 * mentions.filter(x => x.ok).length) / mentions.length : 0.4);
  const pct = Math.round(part * 100);
  const liste = manque.map(x => x.l.charAt(0).toLowerCase() + x.l.slice(1)).join(', ');
  const phrase = !texte
    ? `Pas encore écrite. L’éditeur en propose un brouillon à partir de la fiche.${manque.length ? ` Il manque ${manque.length} mention${manque.length > 1 ? 's' : ''} obligatoire${manque.length > 1 ? 's' : ''} : ${liste}.` : ''}`
    : manque.length
      ? `Texte prêt, ${texte.length} caractères. Il manque ${manque.length} mention${manque.length > 1 ? 's' : ''} obligatoire${manque.length > 1 ? 's' : ''} : ${liste}.`
      : `Prête à publier : le texte, ${texte.length} caractères, et toutes les mentions obligatoires.`;
  return (
    <div className={o.annonce}>
      <div className={o.annonceL}>
        <Anneau part={part} texte={`${pct}${NBSP}%`} label={`Annonce complète à ${pct} pour cent`}
          c={pct === 100 ? '#16a34a' : '#c9a84c'} fond={pct === 100 ? '#dcfce7' : '#fdf3d8'} texteC={pct === 100 ? '#15803d' : '#7a5d1c'} />
        <div className={o.annonceTx}><b>L’annonce</b><span>{phrase}</span></div>
        <button type="button" className={`${o.act} ${texte ? '' : o.actMarine}`} onClick={onEcrire}>{texte ? 'Modifier' : 'Écrire l’annonce'}</button>
      </div>
      {texte && (
        <div className={o.acts}>
          <button type="button" className={o.lienOr} onClick={() => setLire(!lire)}>{lire ? 'Masquer le texte' : 'Lire le texte'}</button>
          <span style={{ flex: 1 }} />
          <button type="button" className={o.act} onClick={() => { navigator.clipboard?.writeText(texte).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1600); }).catch(() => {}); }}>
            <Ic n={copie ? 'check' : 'copier'} t={13} />{copie ? 'Copié' : 'Copier le texte'}
          </button>
        </div>
      )}
      {texte && lire && <div className={o.annonceTexte}>{texte}</div>}
    </div>
  );
}

/* Les photos : trois, puis « + N ». */
export function BandePhotos({ photos, onVoir }: { photos: Photo[]; onVoir: () => void }) {
  if (!photos.length) {
    return (
      <button type="button" className={o.photosVide} onClick={onVoir}>
        <Ic n="photo" t={24} /><b>Pas encore de photo</b><small>Les ajouter, les ranger, les légender</small>
      </button>
    );
  }
  const vues = photos.slice(0, 4);
  const reste = photos.length - 4;
  return (
    <button type="button" className={o.photos} data-n={vues.length} onClick={onVoir} aria-label={`Voir les ${photos.length} photos`}>
      {vues.map((p, i) => (
        <span key={p.url}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={p.legende || ''} loading="lazy" />
          {i === 3 && reste > 0 && <i>{`+ ${reste}`}</i>}
        </span>
      ))}
    </button>
  );
}

/* ── Les pièces ── */
function tonPiece(ic: string): [string, string] {
  if (['canape', 'table', 'bureau', 'vitrine'].includes(ic)) return ['#eff4fb', '#2d5c8f'];
  if (ic === 'cuisine') return ['#fff7ed', '#c2410c'];
  if (['lit', 'cintre'].includes(ic)) return ['#f5f3ff', '#6d28d9'];
  if (['bain', 'douche', 'wc', 'machine'].includes(ic)) return ['#ecfeff', '#0e7490'];
  if (['balcon', 'parasol', 'terrain'].includes(ic)) return ['#f0fdf4', '#15803d'];
  return ['#f1f5f9', '#475569'];
}
const detailPiece = (p: Piece) => [ETATS_PIECE.find(e => e.v === p.etat)?.l, p.sol, ...(p.atouts || [])].filter(Boolean).join(' · ');
const CLE_VUE = 'emilio.pieces.vue';

export function LesPieces({ pieces, onModifier }: { pieces: Piece[]; onModifier: () => void }) {
  /* La fiche ne s'affiche que dans le navigateur (après la lecture de la
     base) : on peut lire le choix gardé dès le premier rendu. */
  const [vue, setVue] = useState<'liste' | 'cartes'>(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem(CLE_VUE) === 'cartes' ? 'cartes' : 'liste'; } catch { return 'liste'; }
  });
  const choisir = (v: 'liste' | 'cartes') => { setVue(v); try { localStorage.setItem(CLE_VUE, v); } catch { /* rien à garder */ } };
  const hab = pieces.filter(habitable);
  const total = hab.reduce((t, p) => t + (p.surface || 0), 0);
  const plusGrande = Math.max(1, ...pieces.map(p => p.surface || 0));
  const niveaux = Array.from(new Set(pieces.map(p => p.niveau || '')));
  const plusieurs = niveaux.length > 1;
  /* Le niveau en tête de ses pièces (V3.31), en liste comme en cartes : dès
     qu'il y en a plusieurs, ou qu'il n'est pas le « Niveau principal » par
     défaut (une maison de plain-pied : « Rez-de-chaussée »). */
  const avecNiveaux = plusieurs || (!!niveaux[0] && niveaux[0] !== 'Niveau principal');
  /* « 3 pièces principales », comme on dit « un 3 pièces » ; sans séjour ni
     chambre saisis, le simple nombre de lignes. */
  const princ = nbPrincipales(pieces);
  const nombre = princ ? `${princ} pièce${princ > 1 ? 's' : ''} principale${princ > 1 ? 's' : ''}` : `${pieces.length} pièce${pieces.length > 1 ? 's' : ''}`;
  const sous = pieces.length ? `${nombre}${total ? ` · ${m2(total)} habitables` : ''}${plusieurs ? ` · ${niveaux.length} niveaux` : ''}` : '';
  const teteNiveau = (n: string, ps: Piece[]) => {
    const surf = ps.filter(habitable).reduce((t, p) => t + (p.surface || 0), 0);
    return (
      <div className={o.niveau}>
        <span className={o.niveauIc}><Ic n={n === 'Extérieur' ? 'terrain' : 'escalier'} t={14} /></span>
        <b>{n || 'Sans niveau'}</b>
        <i>{`${ps.length} pièce${ps.length > 1 ? 's' : ''}${surf ? ` · ${m2(surf)}` : ''}`}</i>
      </div>
    );
  };

  const ligne = (p: Piece) => {
    const ic = pictoPiece(p.nom);
    const [fond, c] = tonPiece(ic);
    const det = detailPiece(p);
    return (
      <div key={p.id} className={o.piece}>
        <span className={o.pieceIc} style={{ background: fond, color: c }}><Ic n={ic} t={18} /></span>
        <b className={o.pieceNom}>{p.nom || 'Pièce'}</b>
        <b className={o.pieceM2}>{p.surface ? m2(p.surface) : '—'}</b>
        <div className={o.jauge}><span style={{ width: `${Math.max(4, ((p.surface || 0) / plusGrande) * 100)}%`, opacity: p.surface ? 1 : 0 }} /></div>
        {p.expo ? <span className={o.expo}><Ic n="boussole" t={11} e={2.2} />{nomExpo(p.expo)}</span> : <span className={o.expoVide}>—</span>}
        <span className={o.pieceMot}>{p.note}{det && <small>{det}</small>}</span>
      </div>
    );
  };
  const carte = (p: Piece, i: number) => {
    const ic = pictoPiece(p.nom);
    const [fond, c] = tonPiece(ic);
    const cote = Math.round(18 + Math.sqrt(p.surface || 4) * 5);
    const mot = [p.note, detailPiece(p)].filter(Boolean).join(' · ');
    return (
      <div key={p.id} className={o.pc} style={{ animationDelay: `${Math.min(i, 12) * 0.05}s`, background: `linear-gradient(180deg, ${fond} 0%, #ffffff 58%)` }}>
        <span className={o.pcPlan} style={{ width: cote, height: cote, color: c }} aria-hidden="true" />
        <span className={o.pcIc} style={{ background: c }}><Ic n={ic} t={18} /></span>
        <b className={o.pcM2}>{p.surface ? m2(p.surface) : '—'}</b>
        <b className={o.pcNom}>{p.nom || 'Pièce'}</b>
        {(p.expo || (p.niveau && !avecNiveaux)) && (
          <div className={o.pcSous}>
            {p.expo && <span className={o.expo}>{nomExpo(p.expo)}</span>}
            {p.niveau && !avecNiveaux && <span>{p.niveau}</span>}
          </div>
        )}
        {mot && <span className={o.pcMot}>{mot}</span>}
      </div>
    );
  };

  return (
    <section className={o.pieces} aria-label="Les pièces">
      <div className={o.piecesT}>
        <b>Les pièces</b>
        <span>{sous}</span>
        {pieces.length > 0 && (
          <div className={o.vues} role="group" aria-label="Affichage des pièces">
            <button type="button" className={o.vue} aria-pressed={vue === 'liste'} onClick={() => choisir('liste')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>Liste
            </button>
            <button type="button" className={o.vue} aria-pressed={vue === 'cartes'} onClick={() => choisir('cartes')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>Cartes
            </button>
          </div>
        )}
        <button type="button" className={o.act} onClick={onModifier}>Modifier</button>
      </div>
      {!pieces.length ? <div className={o.vide}>Les pièces une à une : la pièce, sa surface, son exposition et un mot pour la fiche.</div>
        : vue === 'cartes' ? (
            <div>
              {niveaux.map(n => {
                const ps = pieces.filter(p => (p.niveau || '') === n);
                return (
                  <div key={n || '-'}>
                    {avecNiveaux && teteNiveau(n, ps)}
                    <div className={o.cartes}>{ps.map(carte)}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              {niveaux.map(n => {
                const ps = pieces.filter(p => (p.niveau || '') === n);
                return (
                  <div key={n || '-'}>
                    {avecNiveaux && teteNiveau(n, ps)}
                    <div className={o.liste}>{ps.map(ligne)}</div>
                  </div>
                );
              })}
              {total > 0 && <div className={o.total}><span>Surface habitable</span><b>{m2(total)}</b></div>}
            </div>
          )}
    </section>
  );
}

/* ══ SURFACES (V3.30) ═════════════════════════════════════════════════════
   Un onglet à lui, à la demande d'Alexandre : les pièces étaient tout en bas
   de « Le bien ». En haut, les surfaces qui comptent (habitable, Carrez,
   séjour, terrain) et le contrôle avec la somme des pièces ; puis la
   répartition de la surface ; puis les pièces, en liste ou en cartes ; puis
   les annexes. */
type GenrePiece = 'vie' | 'nuit' | 'cuisine' | 'eau' | 'passage' | 'autre';
const FAMILLES: Record<GenrePiece, { l: string; c: string }> = {
  vie: { l: 'Pièces de vie', c: '#2d5c8f' }, nuit: { l: 'Chambres', c: '#7c3aed' }, cuisine: { l: 'Cuisine', c: '#ea7a2c' },
  eau: { l: 'Eau et WC', c: '#0e98b4' }, passage: { l: 'Entrée, dégagements', c: '#94a3b8' }, autre: { l: 'Le reste', c: '#cbd5e1' },
};
const familleDe = (nom: string): GenrePiece => {
  const ic = pictoPiece(nom);
  if (['canape', 'table', 'bureau', 'vitrine'].includes(ic)) return 'vie';
  if (['lit', 'cintre'].includes(ic)) return 'nuit';
  if (ic === 'cuisine') return 'cuisine';
  if (['bain', 'douche', 'wc', 'machine'].includes(ic)) return 'eau';
  if (['porte', 'couloir', 'escalier'].includes(ic)) return 'passage';
  return 'autre';
};
export type SurfacesBien = {
  surface: number | null; carrez: number | null; sejour: number | null; terrain: number | null;
  carrezAttendu: boolean; chambres: number | null;
  annexes: { ic: string; l: string; v: string }[];
};
export function OngletSurfaces({ s: x, pieces, onPieces, onBien }: { s: SurfacesBien; pieces: Piece[]; onPieces: () => void; onBien: () => void }) {
  const hab = pieces.filter(habitable);
  const somme = Math.round(hab.reduce((t, p) => t + (p.surface || 0), 0) * 100) / 100;
  const princ = nbPrincipales(pieces);
  const ecart = x.surface && somme ? Math.round((somme - x.surface) * 100) / 100 : null;
  const sejourPiece = pieces.find(p => familleDe(p.nom) === 'vie' && /^s[ée]jour|^salon|^pi[eè]ce [àa] vivre/i.test(p.nom))?.surface || null;
  const sejour = x.sejour || sejourPiece;
  /* La répartition : par famille de pièces, sur la somme des pièces habitables. */
  const parts = (Object.keys(FAMILLES) as GenrePiece[]).map(k => ({ k, m: hab.filter(p => familleDe(p.nom) === k).reduce((t, p) => t + (p.surface || 0), 0) })).filter(y => y.m > 0);
  const total = parts.reduce((t, y) => t + y.m, 0);
  const tuiles: { ic: string; l: string; v: string; sous?: ReactNode; ton: string }[] = [];
  tuiles.push({
    ic: 'regle', ton: 'or', l: 'Surface habitable', v: x.surface ? m2(x.surface) : somme ? m2(somme) : '—',
    sous: x.surface && somme
      ? (ecart !== null && Math.abs(ecart) < 0.5
        ? <span className={o.sfOk}><Ic n="check" t={12} e={3} />{'Même total que les pièces'}</span>
        : <span className={o.sfEcart}>{`Pièces : ${m2(somme)} (${ecart! > 0 ? '+' : '−'}${m2(Math.abs(ecart!))})`}</span>)
      : x.surface ? 'Saisie dans la fiche' : somme ? 'Somme des pièces' : 'À saisir',
  });
  if (x.carrezAttendu || x.carrez) tuiles.push({ ic: 'regle', ton: 'bleu', l: 'Loi Carrez', v: x.carrez ? m2(x.carrez) : 'À mesurer', sous: x.carrez ? 'Mesurage du diagnostiqueur' : 'Obligatoire pour vendre un lot de copropriété' });
  if (sejour) tuiles.push({ ic: 'canape', ton: 'bleu', l: 'Séjour', v: m2(sejour), sous: x.surface ? `${Math.round((sejour / x.surface) * 100)} % de la surface` : undefined });
  if (princ || x.chambres) tuiles.push({ ic: 'plan', ton: 'violet', l: 'Pièces', v: princ ? `${princ} pièce${princ > 1 ? 's' : ''}` : '—', sous: x.chambres ? `dont ${x.chambres} chambre${x.chambres > 1 ? 's' : ''}` : undefined });
  if (x.terrain) tuiles.push({ ic: 'terrain', ton: 'vert', l: 'Terrain', v: m2(x.terrain) });
  return (
    <div className={o.col}>
      <section className={o.sf}>
        <div className={o.sfT}>
          <b className={o.titreSec}>Les surfaces</b>
          <button type="button" className={o.act} onClick={onBien}>Modifier</button>
        </div>
        <div className={o.sfTuiles}>
          {tuiles.map((t, i) => (
            <div key={t.l} className={o.sfTuile} data-ton={t.ton} style={{ animationDelay: `${i * 0.05}s` }}>
              <span className={o.sfIc}><Ic n={t.ic} t={20} /></span>
              <small>{t.l}</small>
              <b>{t.v}</b>
              {t.sous && <span className={o.sfSous}>{t.sous}</span>}
            </div>
          ))}
        </div>
        {total > 0 && (
          <div className={o.rep}>
            <div className={o.repT}><b>Comment se partage la surface</b><span>{`sur ${m2(Math.round(total * 100) / 100)} de pièces habitables`}</span></div>
            <div className={o.repBarre} role="img" aria-label={parts.map(y => `${FAMILLES[y.k].l} ${Math.round((y.m / total) * 100)} %`).join(', ')}>
              {parts.map((y, i) => <span key={y.k} style={{ flexGrow: y.m, background: FAMILLES[y.k].c, animationDelay: `${0.1 + i * 0.08}s` }} />)}
            </div>
            <div className={o.repLeg}>
              {parts.map(y => (
                <span key={y.k}><i style={{ background: FAMILLES[y.k].c }} /><b>{FAMILLES[y.k].l}</b>{`${m2(Math.round(y.m * 100) / 100)} · ${Math.round((y.m / total) * 100)}${NBSP}%`}</span>
              ))}
            </div>
          </div>
        )}
      </section>
      <LesPieces pieces={pieces} onModifier={onPieces} />
      {x.annexes.length > 0 && (
        <section className={o.sf}>
          <div className={o.sfT}><b className={o.titreSec}>Les annexes</b><span className={o.sfNote}>Hors surface habitable</span></div>
          <div className={o.annexes}>
            {x.annexes.map(a => <div key={a.l} className={o.annexe}><span><Ic n={a.ic} t={17} /></span><div><b>{a.v}</b><small>{a.l}</small></div></div>)}
          </div>
        </section>
      )}
    </div>
  );
}

/* ══ VISITES ET OFFRES ══════════════════════════════════════════════════ */
export type VisiteCarte = {
  cle: string; ymd: string; heure: string; qui: string; source: 'crm' | 'libre';
  statut: 'a_venir' | 'faite' | 'annulee'; issue: Issue | null; commentaire: string;
  passee: boolean; note?: number | null; etoiles?: number | null;
};
function Pave({ ymd, sorte }: { ymd: string; sorte: 'prochaine' | 'avenir' | 'passee' }) {
  const x = jourMidi(ymd);
  const ok = !!ymd && !isNaN(x.getTime());
  const jour = ok ? x.toLocaleDateString('fr-FR', { weekday: 'short' }).toUpperCase() : '';
  const mois = ok ? x.toLocaleDateString('fr-FR', { month: 'short' }).toUpperCase() : '';
  return (
    <div className={o.date} data-sorte={sorte} aria-label={ok ? x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Date à fixer'}>
      <small>{jour}</small><b>{ok ? x.getDate() : '?'}</b><small>{mois}</small>
    </div>
  );
}
export function CarteVisiteB({ v, prochaine, onCR, onAnnuler, onDoc, onFiche }: {
  v: VisiteCarte; prochaine?: boolean; onCR: () => void; onAnnuler: () => void; onDoc: () => void; onFiche?: () => void;
}) {
  const iss = v.issue ? ISSUES[v.issue] : null;
  const annulee = v.statut === 'annulee';
  const aFaire = v.passee && !annulee && !iss && v.statut !== 'faite';
  const sorte = v.passee || annulee ? 'passee' : prochaine ? 'prochaine' : 'avenir';
  return (
    <div className={o.vis} data-passee={v.passee || annulee ? 'oui' : 'non'} data-annulee={annulee ? 'oui' : 'non'}>
      <Pave ymd={v.ymd} sorte={sorte} />
      <div className={o.visC}>
        <div className={o.visT}>
          <b className={o.visNom}>{v.qui}</b>
          {!v.passee && !annulee && (
            <span className={o.puce} style={v.source === 'crm' ? { background: '#fbf6e9', color: '#7a5d1c' } : { background: '#f1f5f9', color: '#475569' }}>
              {v.source === 'crm' ? `Acheteur suivi${v.note ? ` · ${v.note}${NBSP}%` : ''}` : 'Hors CRM'}
            </span>
          )}
          {annulee && <span className={o.puce} style={{ background: '#f1f5f9', color: '#64748b' }}>Annulée</span>}
          {iss && <span className={o.puce} style={{ background: iss.fond, color: iss.couleur }}>{iss.crm}</span>}
          {aFaire && <span className={`${o.puce} ${o.pulse}`} style={{ background: '#fff7ed', color: '#c2410c' }}>Compte rendu à faire</span>}
          {!!v.etoiles && <span className={o.etoiles} aria-label={`${v.etoiles} étoiles sur 5`}>{'★'.repeat(v.etoiles)}{'☆'.repeat(Math.max(0, 5 - v.etoiles))}</span>}
          {v.heure && <b className={o.visH}>{heureFr(v.heure)}</b>}
        </div>
        {v.commentaire && <span className={o.citation}>{v.passee ? `« ${v.commentaire} »` : v.commentaire}</span>}
        {!annulee && (
          <div className={o.acts}>
            {v.passee && <button type="button" className={`${o.act} ${aFaire ? o.actOr : ''}`} onClick={onCR}>{aFaire ? 'Faire le compte rendu' : 'Revoir le compte rendu'}</button>}
            <button type="button" className={o.act} onClick={onDoc}><Ic n="plume" t={13} />Bon de visite</button>
            {onFiche && <button type="button" className={o.act} onClick={onFiche}><Ic n="personne" t={13} />Sa fiche</button>}
            {!v.passee && <button type="button" className={`${o.act} ${o.actRouge}`} onClick={onAnnuler}>Annuler</button>}
          </div>
        )}
      </div>
    </div>
  );
}

export function ListeVisites({ visites, rendre, onAjouter }: {
  visites: VisiteCarte[]; rendre: (v: VisiteCarte, prochaine: boolean) => ReactNode; onAjouter: () => void;
}) {
  const avenir = visites.filter(v => !v.passee && v.statut !== 'annulee').sort((a, b) => `${a.ymd}${a.heure}`.localeCompare(`${b.ymd}${b.heure}`));
  const passees = visites.filter(v => v.passee || v.statut === 'annulee');
  const [sel, setSel] = useState<'avenir' | 'passees' | 'toutes'>(avenir.length ? 'avenir' : 'toutes');
  const montrerAvenir = sel !== 'passees';
  const montrerPassees = sel !== 'avenir';
  return (
    <div className={o.col} style={{ gap: 10 }}>
      <div className={o.secT}>
        <b className={o.titreSec}>Les visites</b>
        {visites.length > 0 && (
          <div className={o.seg} role="group" aria-label="Quelles visites">
            <button type="button" aria-pressed={sel === 'avenir'} onClick={() => setSel('avenir')}>À venir<i>{avenir.length}</i></button>
            <button type="button" aria-pressed={sel === 'passees'} onClick={() => setSel('passees')}>Passées<i>{passees.length}</i></button>
            <button type="button" aria-pressed={sel === 'toutes'} onClick={() => setSel('toutes')}>Toutes</button>
          </div>
        )}
        <button type="button" className={`${o.act} ${o.actMarine}`} onClick={onAjouter}><Ic n="plus" t={13} e={2.6} />Visite</button>
      </div>
      {!visites.length && <div className={o.vide}>Aucune visite. Avec un acheteur suivi, elle s’ajoute aussi à son dossier et à l’agenda ; avec quelqu’un hors du CRM, elle peut aller dans l’agenda.</div>}
      {montrerAvenir && sel === 'toutes' && avenir.length > 0 && <div className={o.sep}>À venir</div>}
      {montrerAvenir && avenir.map((v, i) => <div key={v.cle}>{rendre(v, i === 0)}</div>)}
      {sel === 'avenir' && !avenir.length && visites.length > 0 && <div className={o.vide}>Aucune visite prévue. « + Visite » en planifie une.</div>}
      {montrerPassees && sel === 'toutes' && passees.length > 0 && <div className={o.sep}>Passées</div>}
      {montrerPassees && passees.map(v => <div key={v.cle}>{rendre(v, false)}</div>)}
      {sel === 'passees' && !passees.length && <div className={o.vide}>Aucune visite passée pour l’instant.</div>}
    </div>
  );
}

/* Une offre : le montant, l'écart au prix, ses étapes, le délai. */
export function CarteOffreB({ o: x, prix, compromis, onStatut, onContre, onDoc, onPiece }: {
  o: SuiviVente; prix: number | null; compromis: boolean;
  onStatut: (statut: string) => void; onContre: () => void; onDoc: () => void; onPiece?: () => void;
}) {
  const d = (x.donnees || {}) as Record<string, unknown>;
  const st = x.statut || 'en_attente';
  const ouverte = st === 'en_attente' || st === 'contre';
  const acceptee = st === 'acceptee';
  const ecart = x.montant && prix ? ((x.montant - prix) / prix) * 100 : null;
  const jusquau = typeof d.jusquau === 'string' ? d.jusquau : '';
  const j = jusquau ? -(joursDepuis(jusquau) ?? 0) : null;
  const fin = d.financement === 'comptant' ? 'comptant' : d.financement === 'relais' ? 'prêt relais' : d.financement === 'pret' ? 'avec un prêt' : '';
  const fin2 = [fin, typeof d.apport === 'number' ? `apport ${euros(d.apport)}` : '', typeof d.pret === 'number' ? `prêt ${euros(d.pret)}` : ''].filter(Boolean).join(', ');
  const PUCE: Record<string, { l: string; fond: string; c: string }> = {
    en_attente: { l: 'En attente de réponse', fond: '#fbf6e9', c: '#7a5d1c' },
    contre: { l: typeof d.contre === 'number' ? `Contre-offre à ${euros(d.contre)}` : 'Contre-offre', fond: '#eff6ff', c: '#1d4ed8' },
    acceptee: { l: 'Acceptée', fond: '#dcfce7', c: '#15803d' },
    refusee: { l: 'Refusée', fond: '#f1f5f9', c: '#475569' },
    retiree: { l: 'Retirée', fond: '#f1f5f9', c: '#475569' },
  };
  const p = PUCE[st] || PUCE.en_attente;
  const reponse = acceptee ? 'fait' : st === 'refusee' || st === 'retiree' ? 'non' : 'ici';
  return (
    <div className={o.offre} data-ouverte={ouverte ? 'oui' : 'non'} data-sorte={acceptee ? 'acceptee' : ouverte ? 'ouverte' : 'fermee'}>
      <div className={o.offreT}>
        <span className={`${o.puce} ${st === 'en_attente' ? o.pulse : ''}`} style={{ background: p.fond, color: p.c }}>{p.l}</span>
        <span>{`reçue ${ilYa(x.le)}`}</span>
      </div>
      <div className={o.montant}>
        <b>{euros(x.montant || 0)}</b>
        {ecart !== null && (
          <span className={o.puce} style={ecart < 0 ? (ouverte ? { background: '#fef2f2', color: '#b91c1c' } : { background: '#f1f5f9', color: '#475569' }) : { background: '#dcfce7', color: '#15803d' }}>
            {Math.abs(ecart) < 0.05 ? 'au prix' : ecart < 0 ? `−${pctFr(-ecart)} du prix` : `+${pctFr(ecart)} au-dessus du prix`}
          </span>
        )}
      </div>
      <span className={o.qui}><b>{x.qui || 'Un acquéreur'}</b>{fin2 ? ` · ${fin2}` : ''}{typeof d.conditions === 'string' && d.conditions ? ` · ${d.conditions}` : ''}</span>
      {x.commentaire && !ouverte && <span className={o.qui}>{x.commentaire}</span>}
      {(ouverte || acceptee) && (
        <div className={o.etapes}>
          <span className={o.etape} data-etat="fait"><span><Ic n="check" t={11} e={3} /></span>Reçue</span>
          <span className={o.trait} data-fait={acceptee ? 'oui' : 'non'} />
          <span className={o.etape} data-etat={reponse}><span>{reponse === 'fait' && <Ic n="check" t={11} e={3} />}</span>{acceptee ? 'Acceptée' : st === 'contre' ? 'Contre-offre' : 'Réponse'}</span>
          <span className={o.trait} data-fait={compromis ? 'oui' : 'non'} />
          <span className={o.etape} data-etat={compromis ? 'fait' : acceptee ? 'ici' : 'apres'}><span>{compromis && <Ic n="check" t={11} e={3} />}</span>Compromis</span>
        </div>
      )}
      {ouverte && jusquau && j !== null && (
        <div className={o.delai} data-retard={j < 0 ? 'oui' : 'non'}>
          <Ic n="horloge" t={15} />
          <span>{j < 0 ? `Réponse attendue le ${jourMidi(jusquau).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} · délai dépassé de ${-j} jour${-j > 1 ? 's' : ''}`
            : `Réponse attendue avant le ${jourMidi(jusquau).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${j === 0 ? 'aujourd’hui' : j === 1 ? 'demain' : `dans${NBSP}${j}${NBSP}jours`}`}</span>
        </div>
      )}
      {ouverte ? (
        <>
          <div className={o.offreBtns}>
            <button type="button" className={`${o.act} ${o.actVert}`} onClick={() => onStatut('acceptee')}><Ic n="check" t={13} e={2.6} />Acceptée</button>
            <button type="button" className={o.act} onClick={onContre}>Contre-offre…</button>
            <button type="button" className={`${o.act} ${o.actRouge}`} onClick={() => onStatut('refusee')}>Refusée</button>
          </div>
          <div className={o.petits}>
            <button type="button" className={o.petit} onClick={() => onStatut('retiree')}>Retirée par l’acquéreur</button>
            <button type="button" className={o.petit} onClick={onDoc}><Ic n="plume" t={13} />L’offre écrite</button>
            {onPiece && <button type="button" className={o.petit} onClick={onPiece}><Ic n="trombone" t={13} />L’offre signée</button>}
          </div>
        </>
      ) : (
        <div className={o.petits}>
          <button type="button" className={o.petit} onClick={() => onStatut('en_attente')}>Remettre en attente</button>
          <button type="button" className={o.petit} onClick={onDoc}><Ic n="plume" t={13} />L’offre écrite</button>
          {onPiece && <button type="button" className={o.petit} onClick={onPiece}><Ic n="trombone" t={13} />L’offre signée</button>}
        </div>
      )}
    </div>
  );
}

/* ══ DOCUMENTS ══════════════════════════════════════════════════════════ */
export function Tuile({ ton = 'blanc', ic, icFond, icC, titre, puce, note, children }: {
  ton?: 'marine' | 'or' | 'blanc' | 'vide'; ic: string; icFond: string; icC: string; titre: string;
  puce?: { l: string; fond: string; c: string } | null; note?: string; children?: ReactNode;
}) {
  return (
    <div className={o.tuile} data-ton={ton}>
      <span className={o.tIc} style={{ background: icFond, color: icC }}><Ic n={ic} t={20} /></span>
      <b>{titre}</b>
      {puce && <span className={o.puce} style={{ background: puce.fond, color: puce.c }}>{puce.l}</span>}
      {note && <span className={o.tuileNote}>{note}</span>}
      {children && <div className={o.acts}>{children}</div>}
    </div>
  );
}
export const Tuiles = ({ children }: { children: ReactNode }) => <div className={o.tuiles}>{children}</div>;
export const BtnTuile = ({ marine, onClick, children }: { marine?: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" className={`${o.act} ${marine ? o.actClair : ''}`} onClick={onClick}>{children}</button>
);
export function ListeDocs({ docs }: { docs: { id: string; ic: string; titre: string; sous: string; statut: ReactNode; ouvrir: () => void }[] }) {
  if (!docs.length) return null;
  return (
    <div className={o.docs}>
      {docs.map(d => (
        <button key={d.id} type="button" className={o.doc} onClick={d.ouvrir}>
          <span><Ic n={d.ic} t={16} /></span>
          <div><b>{d.titre}</b><small>{d.sous}</small></div>
          {d.statut}
        </button>
      ))}
    </div>
  );
}
export function CarteDossier({ recus, demandes, nc, total, children }: { recus: number; demandes: number; nc: number; total: number; children: ReactNode }) {
  const faits = recus + nc;
  const reste = Math.max(0, total - faits - demandes);
  const detail = [`${recus} reçu${recus > 1 ? 's' : ''}`, demandes ? `${demandes} demandé${demandes > 1 ? 's' : ''}` : '', nc ? `${nc} non concerné${nc > 1 ? 's' : ''}` : '', reste ? `${reste} à voir` : ''].filter(Boolean).join(' · ');
  return (
    <div className={o.dossier}>
      <div className={o.dossierT}>
        <Anneau part={total ? faits / total : 0} taille={72} ep={8} c="#16a34a" fond="#eef1f6" texteC="#1a2332" texte={`${faits}/${total}`} label={`${faits} pièces du dossier réglées sur ${total}`} />
        <div><b>Le dossier : diagnostics et pièces</b><span>{detail}</span></div>
      </div>
      {children}
    </div>
  );
}

/* ══ HISTORIQUE ═════════════════════════════════════════════════════════ */
export type GenreEvt = 'visites' | 'offres' | 'acheteurs' | 'contacts' | 'etapes' | 'documents' | 'notes';
export type EvtBien = {
  cle: string; le: string; ic: string; ton: string; titre: string; detail?: string; genre: GenreEvt; suppr?: string;
  /* Une ligne discrète (ce que le CRM note tout seul) plutôt qu'une carte. */
  discret?: boolean; puce?: { l: string; c: string; fond: string; bord: string };
  /* Une ligne venue du Suivi d'un contact : de qui, et un clic ouvre sa fiche. */
  chez?: { id: string; l: string };
};
export type AVenirBien = { cle: string; titre: string; detail?: string; quand: string; genre: 'visites' | 'offres' };
const GENRES: { k: GenreEvt | 'tout'; l: string; c?: string; fond?: string }[] = [
  { k: 'tout', l: 'Tout' },
  { k: 'visites', l: 'Visites', c: '#7c3aed', fond: '#f5f3ff' },
  { k: 'offres', l: 'Offres', c: '#a07c28', fond: '#fbf6e9' },
  { k: 'acheteurs', l: 'Envois', c: '#0d9488', fond: '#f0fdfa' },
  { k: 'contacts', l: 'Contacts', c: '#2563eb', fond: '#eff6ff' },
  { k: 'etapes', l: 'Étapes et prix', c: '#34496e', fond: '#eef2f8' },
  { k: 'documents', l: 'Documents', c: '#64748b', fond: '#f1f5f9' },
  { k: 'notes', l: 'Notes', c: '#475569', fond: '#eef2f7' },
];
const genreDe = (g: GenreEvt) => GENRES.find(x => x.k === g)!;

export type PasParcours = { l: string; quand: string; etat: 'fait' | 'ici' | 'apres' | 'arret' };
/* Le parcours du bien : les étapes franchies, datées d'après l'historique. */
export function parcoursDe(bien: BienVente, suivi: SuiviVente[]): PasParcours[] {
  const ORDRE: { k: string; l: string }[] = [
    { k: 'a_suivre', l: 'À suivre' }, { k: 'estimation', l: 'Estimation' }, { k: 'mandat', l: 'Mandat signé, en vente' },
    { k: 'offre', l: 'Sous offre' }, { k: 'compromis', l: 'Compromis' }, { k: 'vendu', l: 'Vendu' },
  ];
  const e = bien.etape;
  const arret = e === 'suspendu' || e === 'retire';
  /* La première fois que le bien est arrivé à chaque étape. */
  const quandEtape = (k: string) => suivi.filter(x => x.type === 'etape' && x.statut === k).map(x => x.le).sort()[0] || '';
  const ici = arret ? 'mandat' : e;
  const idx = ORDRE.findIndex(x => x.k === ici);
  const pas: PasParcours[] = ORDRE.map((x, i) => {
    let quand = x.k === 'a_suivre' ? bien.created_at : quandEtape(x.k);
    if (x.k === 'mandat' && !quand) quand = bien.en_vente_le || '';
    const etat: PasParcours['etat'] = i < idx || (arret && i === idx) ? 'fait' : i === idx ? 'ici' : 'apres';
    let t = quand ? dateCourteMois(quand) : '';
    if (etat === 'ici' && quand) {
      const n = joursDepuis(quand);
      t = `depuis le ${dateCourteMois(quand)}${n !== null && n > 0 ? `, ${n} jour${n > 1 ? 's' : ''}` : ''}`;
    }
    if (etat === 'apres') t = '';
    return { l: x.l, quand: t, etat };
  });
  /* Une étape passée sans trace (bien créé directement en vente) : pas de date. */
  if (arret) {
    const q = bien.etape_le || quandEtape(e);
    const pos = Math.max(0, ORDRE.findIndex(x => x.k === 'mandat')) + 1;
    pas.splice(pos, 0, { l: etapeDe(e).lib, quand: q ? `depuis le ${dateCourteMois(q)}` : '', etat: 'arret' });
  }
  return pas;
}

export function HistoriqueBien({ evts, aVenir, parcours, chiffres, erreur, onNote, onSuppr, onFiche }: {
  evts: EvtBien[]; aVenir: AVenirBien[]; parcours: PasParcours[];
  chiffres: { titre: string; l: { n: number; l: string }[]; note?: string } | null; erreur?: string;
  onNote: () => void; onSuppr: (id: string) => void; onFiche?: (clientId: string) => void;
}) {
  const [g, setG] = useState<GenreEvt | 'tout'>('tout');
  const vus = evts.filter(e => g === 'tout' || e.genre === g);
  const futur = aVenir.filter(a => g === 'tout' || a.genre === g);
  const mois = (iso: string) => capitale(new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));
  const quand = (iso: string) => {
    const x = new Date(iso);
    if (isNaN(x.getTime())) return '';
    const n = joursDepuis(iso);
    const h = x.getHours() || x.getMinutes() ? `, ${x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')}` : '';
    if (n === 0) return `aujourd’hui${h}`;
    if (n === 1) return `hier${h}`;
    return dateCourteMois(iso);
  };
  /* Un repère sur le trait à chaque changement de mois. */
  const avecMois = vus.map((e, i) => ({ e, m: mois(e.le), nouveau: i === 0 || mois(vus[i - 1].le) !== mois(e.le) }));
  return (
    <div className={o.histo}>
      <div className={f.frise}>
        <div className={f.tete}>
          <div className={f.teteTitre}><b>Historique du bien</b><span>{`${evts.length} élément${evts.length > 1 ? 's' : ''}`}</span></div>
          <div className={f.teteBoutons}><button type="button" className={f.btnAjout} style={{ gridColumn: '1 / -1' }} onClick={onNote}>+ Ajouter une note</button></div>
        </div>
        <div className={f.filtres} role="group" aria-label="Filtrer l’historique">
          {GENRES.map(x => {
            const n = x.k === 'tout' ? evts.length : evts.filter(e => e.genre === x.k).length;
            if (x.k !== 'tout' && !n) return null;
            return (
              <button key={x.k} type="button" className={f.filtre} data-on={g === x.k ? 'oui' : 'non'} aria-pressed={g === x.k} onClick={() => setG(x.k)}>
                {x.c && <i style={{ background: x.c }} />}{x.l}{n > 0 && <b>{n}</b>}
              </button>
            );
          })}
        </div>
        {erreur && <div className={o.erreur}>{erreur}</div>}
        {!vus.length && !futur.length ? (
          <div className={f.vide}><span className={f.videIc}><Ic n="historique" t={22} /></span><b>Rien à afficher</b></div>
        ) : (
          <ol className={f.liste}>
            {futur.length > 0 && <li className={f.repere} data-sorte="avenir"><span className={f.repereRond} /><span className={f.repereTexte}>À venir</span></li>}
            {futur.map(a => {
              const gg = genreDe(a.genre);
              return (
                <li key={a.cle} className={f.ligne} data-sorte="avenir">
                  <span className={f.noeud} data-bord="oui" style={{ color: gg.c, background: gg.fond, borderColor: gg.c, borderStyle: 'dashed' }}><Ic n={a.genre === 'visites' ? 'cle' : 'horloge'} t={16} /></span>
                  <div className={`${f.carte} ${f.carteRelance}`}>
                    <div className={f.carteTete}><span className={f.titre}>{a.titre}</span><span className={f.heure} style={{ color: gg.c, fontWeight: 700 }}>{a.quand}</span></div>
                    {a.detail && <p className={f.sous}>{a.detail}</p>}
                  </div>
                </li>
              );
            })}
            {futur.length > 0 && vus.length > 0 && <li className={f.repere} data-sorte="aujourdhui"><span className={f.repereRond} /><span className={f.repereTexte}>Aujourd’hui</span></li>}
            {avecMois.map(({ e, m, nouveau }) => {
              const gg = genreDe(e.genre);
              const repere = nouveau ? <li className={f.repere}><span className={f.repereRond} /><span className={f.repereTexte}>{m}</span></li> : null;
              const suppr = e.suppr ? <button type="button" className={o.supprNote} aria-label="Supprimer la note" onClick={() => onSuppr(e.suppr!)}><Ic n="corbeille" t={14} /></button> : null;
              if (e.discret) {
                return (<Fragment key={e.cle}>{repere}
                  <li className={`${f.ligne} ${f.discrete}`}>
                    <span className={f.noeudPetit} style={{ color: gg.c, background: gg.fond }}><Ic n={e.ic} t={12} e={2.2} /></span>
                    <div className={f.discreteCorps}>
                      <div className={f.discreteTete}><span className={f.discreteTitre}>{e.titre}</span><span className={f.heure}>{quand(e.le)}</span></div>
                      {e.detail && <p className={f.discreteTexte}>{e.detail}</p>}
                    </div>
                  </li>
                </Fragment>);
              }
              return (<Fragment key={e.cle}>{repere}
                <li className={f.ligne}>
                  <span className={f.noeud} style={{ color: gg.c, background: gg.fond }}><Ic n={e.ic} t={16} /></span>
                  <div className={f.carte}>
                    <div className={f.carteTete}>
                      <span className={f.titre}>{e.titre}</span>
                      {e.puce && <span className={f.pastille} style={{ color: e.puce.c, background: e.puce.fond, borderColor: e.puce.bord }}>{e.puce.l}</span>}
                      <span className={f.heure}>{quand(e.le)}</span>
                      {suppr}
                    </div>
                    {e.detail && <p className={`${f.texte} ${e.genre === 'notes' ? f.citation : ''}`}>{e.detail}</p>}
                    {e.chez && (
                      <div className={f.etiquettes}>
                        {onFiche
                          ? <button type="button" className={o.chez} onClick={() => onFiche(e.chez!.id)} title="Ouvrir sa fiche"><Ic n="personne" t={12} />{e.chez.l}</button>
                          : <span className={f.etAutre}><Ic n="personne" t={12} />{e.chez.l}</span>}
                      </div>
                    )}
                  </div>
                </li>
              </Fragment>);
            })}
          </ol>
        )}
      </div>

      <aside className={o.aside}>
        <div className={o.carteA}>
          <b>Le parcours du bien</b>
          <div className={o.parcours}>
            {parcours.map((p, i) => (
              <div key={p.l} className={o.pas} data-etat={p.etat}>
                <span className={o.pasR}>{p.etat === 'fait' ? <Ic n="check" t={13} e={3} /> : p.etat === 'arret' ? <Ic n="pause" t={12} e={2.6} /> : i + 1}</span>
                <div className={o.pasTx}><b>{p.l}</b>{p.quand && <span>{p.quand}</span>}</div>
              </div>
            ))}
          </div>
        </div>
        {chiffres && (
          <div className={o.carteA}>
            <b>{chiffres.titre}</b>
            <div className={o.chiffres}>{chiffres.l.map(c => <div key={c.l} className={o.chiffre}><b>{c.n}</b><small>{c.l}</small></div>)}</div>
            {chiffres.note && <span className={o.asideNote}>{chiffres.note}</span>}
          </div>
        )}
      </aside>
    </div>
  );
}

/* La mise en page commune : deux colonnes, puis une sous 960 px. */
export const Deux = ({ children }: { children: ReactNode }) => <div className={o.deux}>{children}</div>;
export const Col = ({ children, gap }: { children: ReactNode; gap?: number }) => <div className={o.col} style={gap ? { gap } : undefined}>{children}</div>;
export const TitreSec = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className={o.secT}><b className={o.titreSec}>{children}</b>{action}</div>
);
/* Les cartes de « Le bien », en colonnes (V3.31). En grille, chaque rangée
   prenait la hauteur de sa plus haute carte : une carte courte (« L'intérieur »
   encore à décrire) laissait un grand blanc sous elle. Ici chaque colonne
   empile ses cartes, distribuées dans l'ordre (1re, 2e, 3e colonne, puis on
   recommence) : plus de trou, et une carte qu'on déplie ne fait pas sauter
   les autres d'une colonne à l'autre. 3 colonnes, 2 sous 1 180 px, 1 sous
   720 px (les mêmes seuils que la feuille de style). */
const LARGEURS = ['(max-width: 720px)', '(max-width: 1180px)'];
function suivreLargeur(f: () => void) {
  const l = LARGEURS.map(q => window.matchMedia(q));
  l.forEach(m => m.addEventListener('change', f));
  return () => l.forEach(m => m.removeEventListener('change', f));
}
const nbColonnes = () => (window.matchMedia(LARGEURS[0]).matches ? 1 : window.matchMedia(LARGEURS[1]).matches ? 2 : 3);
export function Familles({ children }: { children: ReactNode }) {
  const n = useSyncExternalStore(suivreLargeur, nbColonnes, () => 3);
  const cartes = Children.toArray(children);
  const colonnes = Array.from({ length: n }, (_, c) => cartes.filter((_, i) => i % n === c));
  return (
    <div className={o.familles} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      {colonnes.map((c, i) => <div key={i} className={o.pile}>{c}</div>)}
    </div>
  );
}
export const Pile = ({ children }: { children: ReactNode }) => <div className={o.pile}>{children}</div>;
export const Haut = ({ seul, children }: { seul?: boolean; children: ReactNode }) => <div className={o.haut} data-seul={seul ? 'oui' : 'non'}>{children}</div>;
export const BoutonAct = ({ marine, or, onClick, children }: { marine?: boolean; or?: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" className={`${o.act} ${marine ? o.actMarine : ''} ${or ? o.actOr : ''}`} onClick={onClick}>{children}</button>
);
