'use client';
import { Children, Fragment, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { euros } from '@/lib/mandat';
import { ISSUES, type Issue } from '@/lib/visites';
import { ETATS_PIECE, echangesDe, etapeDe, m2, montantActuel, nomExpo, pictoPiece, type BienVente, type Photo, type Piece, type Reponse, type SuiviVente } from '@/lib/biens-vente';
import { Ic } from '@/components/documents/ApercuActe';
import Depliant from '@/components/shared/Depliant';
import { BoutonPli, PastillePli } from '@/components/shared/Pli';
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
  /* V3.45 : avec l'année (« 12 févr. 2026 ») — Alexandre : « il n'y a pas l'année ». */
  return isNaN(x.getTime()) ? '' : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
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
/* Sa petite icône (V3.32, Alexandre : « que ce soit plus vivant ») : trouvée
   par le mot de la ligne, teintée de la couleur de la carte. Un mot inconnu :
   un point discret, pour garder l'alignement. */
const IC_KV: Record<string, string> = {
  'État': 'etincelle', 'Cuisine': 'cuisine', 'Chauffage': 'radiateur', 'Par': 'convecteur', 'Eau chaude': 'ballon',
  'Étage': 'escalier', 'Niveaux': 'escalier', 'Ascenseur': 'ascenseur', 'Construction': 'calendrier', 'N° de lot': 'lots', 'Cadastre': 'carte',
  'Lots': 'lots', 'Procédure en cours': 'balance', 'Syndic': 'personne', 'Fonds de travaux': 'outil',
  'Balcon': 'balcon', 'Terrasse': 'parasol', 'Jardin': 'fleur', 'Cave': 'cave', 'Parking': 'parking', 'Loggia': 'loggia',
  'Exposition': 'boussole', 'Vue': 'horizon', 'Vis-à-vis': 'oeil',
  'Charges': 'euro', 'Elles comprennent': 'liste', 'Taxe foncière': 'fiscal', 'Loyer (bien loué)': 'bail', 'Fin du bail': 'calendrier',
  'Estimation': 'regle', 'Fourchette': 'regle', 'Prix conseillé': 'etiquette', 'Prix affiché': 'etiquette', 'Net vendeur': 'banque',
  'Honoraires': 'pourcent', 'Prix au m²': 'regle', 'Le propriétaire espère': 'personne', 'Le propriétaire espérait': 'personne',
  'Diagnostic fait le': 'calendrier', 'Coût estimé': 'euro',
};
export function Kv({ l, v, alerte, ic }: { l: string; v: ReactNode; alerte?: boolean; ic?: string }) {
  if (v === '' || v === null || v === undefined || v === false) return null;
  const long = typeof v === 'string' && v.length > 38;
  const picto = ic || IC_KV[l];
  return (
    <div className={`${o.kv} ${long ? o.kvLong : ''} ${alerte ? o.kvAlerte : ''}`}>
      <span className={o.kvL}><i className={o.kvIc} aria-hidden="true">{picto ? <Ic n={picto} t={14} e={2} /> : <em />}</i>{l}</span>
      <b>{v}</b>
    </div>
  );
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
      {texte && <Depliant ouvert={lire} ecart={10}><div className={o.annonceTexte}>{texte}</div></Depliant>}
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
  /* V3.45 : l'année sous le mois. */
  return (
    <div className={o.date} data-sorte={sorte} aria-label={ok ? x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date à fixer'}>
      <small>{jour}</small><b>{ok ? x.getDate() : '?'}</b><small>{mois}</small>{ok && <em>{x.getFullYear()}</em>}
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

/* ── Une offre (refaite en V3.45) ───────────────────────────────────────
   Alexandre : « il est où le bouton pour la faire passer en compromis, ou
   dire si l'offre a été acceptée ? », « l'offre écrite, on ne comprend
   pas », puis « s'il y a quatre contre-offres, ça fait quatre blocs ? ».
   Un bloc par acquéreur. À gauche : le montant sur la table, l'acquéreur, la
   négociation ligne à ligne. À droite : les quatre étapes, UNE question
   « Et maintenant ? » et ses réponses, puis le document que l'acquéreur
   signe — facultatif, l'offre est déjà notée. Sur un écran étroit, les deux
   moitiés se suivent. */
export type DocOffre = { etat: 'prepa' | 'pret' | 'signe'; detail: string; onOuvrir: () => void; onPdf?: () => void };
export type InfosCompromis = { signe?: string; sru?: string; pretLimite?: string; acte?: string; prix?: number | null; venduLe?: string | null };
export type ActionsOffre = {
  /* Une réponse : accepte, contre-offre, nouvelle proposition, refus… */
  onReponse: (r: Reponse) => void;
  /* Préparer le document (ou rouvrir celui déjà commencé : `doc`). */
  onDoc: () => void;
  doc?: DocOffre | null;
  /* L'offre signée jointe (scan, PDF) : la voir, en joindre une. */
  onPiece?: () => void;
  onJoindre?: (f: File) => void;
  onModifier?: () => void;
  onCompromis?: () => void;
  onVendu?: () => void;
  /* Cette offre est celle du compromis : ses dates. */
  compromis?: InfosCompromis | null;
};

export const dateAn = (iso: string | null | undefined) => {
  if (!iso) return '';
  const x = jourMidi(iso);
  return isNaN(x.getTime()) ? '' : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/^1 /, '1er ');
};
const dateAnCourt = (iso: string) => {
  const x = jourMidi(iso);
  return isNaN(x.getTime()) ? '' : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};
const finDe = (d: Record<string, unknown>) => [
  d.financement === 'comptant' ? 'comptant' : d.financement === 'relais' ? 'prêt relais' : d.financement === 'pret' ? 'avec un prêt' : '',
  typeof d.apport === 'number' && d.apport > 0 ? `apport ${euros(d.apport)}` : '',
  typeof d.pret === 'number' && d.pret > 0 ? `prêt ${euros(d.pret)}` : '',
].filter(Boolean).join(', ');
const sorteOffre = (st: string, compromis: boolean, vendu: boolean) =>
  st === 'acceptee' ? (vendu ? 'vendu' : compromis ? 'compromis' : 'acceptee') : st === 'contre' ? 'contre' : st === 'refusee' || st === 'retiree' ? 'fermee' : 'attente';
/* « 495 000 », « 495.000 », « 495 000 € » : 495000. Un point suivi de trois
   chiffres sépare des milliers ; moins de 1 000 €, c'est une faute de frappe. */
const lireMontant = (t: string) => {
  const n = Number(t.replace(/[\s\u00a0\u202f€]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 1000 ? n : NaN;
};

export function CarteOffreB({ o: x, prix, a, replie, onPli }: {
  o: SuiviVente; prix: number | null; a: ActionsOffre;
  /* Repliée sur une ligne (V3.45) : l'acquéreur, le montant, où elle en est. */
  replie?: boolean; onPli?: () => void;
}) {
  const d = (x.donnees || {}) as Record<string, unknown>;
  const st = x.statut || 'en_attente';
  const c = a.compromis || null;
  const sorte = sorteOffre(st, !!c, !!c?.venduLe);
  const ouverte = sorte === 'attente' || sorte === 'contre';
  const echanges = echangesDe(x);
  const negocie = echanges.length > 1;
  /* Sous compromis ou vendu : le prix noté au compromis. */
  const actuel = (sorte === 'compromis' || sorte === 'vendu') && c?.prix ? c.prix : montantActuel(x);
  const ecart = actuel && prix ? ((actuel - prix) / prix) * 100 : null;
  const jusquau = typeof d.jusquau === 'string' ? d.jusquau : '';
  const j = jusquau ? -(joursDepuis(jusquau) ?? 0) : null;
  const fin = finDe(d);
  /* La saisie d'un montant : la contre-offre du vendeur, ou la nouvelle
     proposition de l'acquéreur. */
  const [saisie, setSaisie] = useState<{ k: 'contre' | 'propose'; v: string } | null>(null);
  const PUCE: Record<string, { l: string; fond: string; c: string }> = {
    attente: { l: negocie ? 'Au vendeur de répondre' : 'En attente de la réponse du vendeur', fond: '#fbf6e9', c: '#7a5d1c' },
    contre: { l: 'À l’acquéreur de répondre', fond: '#eff6ff', c: '#1d4ed8' },
    acceptee: { l: 'Acceptée', fond: '#dcfce7', c: '#15803d' },
    compromis: { l: 'Compromis signé', fond: '#dcfce7', c: '#15803d' },
    vendu: { l: 'Vendu', fond: '#dcfce7', c: '#15803d' },
    fermee: { l: st === 'retiree' ? 'Retirée par l’acquéreur' : 'Refusée', fond: '#f1f5f9', c: '#475569' },
  };
  const p = PUCE[sorte];
  /* Les quatre étapes : reçue, réponse (ou négociation), acceptée, compromis. */
  const rang = { attente: 1, contre: 1, acceptee: 3, compromis: 4, vendu: 4, fermee: 0 }[sorte];
  const pas = ['Reçue', negocie || sorte === 'contre' ? 'Négociation' : 'Réponse du vendeur', 'Acceptée', 'Compromis signé'];
  function valider() {
    if (!saisie) return;
    const n = lireMontant(saisie.v);
    if (!Number.isFinite(n) || n <= 0) return;
    setSaisie(null);
    a.onReponse({ k: saisie.k, montant: n });
  }
  const dernier = echanges[echanges.length - 1];
  const pieceJointe = typeof d.chemin === 'string' && !!d.chemin;
  const puceEcart = ecart !== null && (
    <span className={o.puce} style={ecart < 0 ? (ouverte ? { background: '#fef2f2', color: '#b91c1c' } : { background: '#f1f5f9', color: '#475569' }) : { background: '#dcfce7', color: '#15803d' }}>
      {Math.abs(ecart) < 0.05 ? 'au prix' : ecart < 0 ? `−${pctFr(-ecart)} du prix` : `+${pctFr(ecart)} au-dessus du prix`}
    </span>
  );
  if (replie && onPli) {
    return (
      <button type="button" className={`${o.offre} ${o.offreLigne}`} data-ouverte={ouverte ? 'oui' : 'non'} data-sorte={sorte} aria-expanded={false} onClick={onPli}>
        <span className={`${o.puce} ${sorte === 'attente' ? o.pulse : ''}`} style={{ background: p.fond, color: p.c }}>{p.l}</span>
        <b className={o.offreLigneQui}>{x.qui || 'Un acquéreur'}</b>
        <b className={o.offreLigneM}>{euros(actuel)}</b>
        {puceEcart}
        {negocie && <span className={o.offreLigneN}>{`${echanges.length - 1} contre-proposition${echanges.length > 2 ? 's' : ''}`}</span>}
        <PastillePli ouvert={false} voir="Déplier" />
        <span className={o.offreLigneLe}>{`Reçue le ${dateAn(x.le)}`}</span>
      </button>
    );
  }
  return (
    <div className={o.offre} data-ouverte={ouverte ? 'oui' : 'non'} data-sorte={sorte}>
      <div className={o.offreIn}>
        {/* ── À gauche : l'offre, et sa négociation ── */}
        <div className={o.offreG}>
          <div className={o.offreT}>
            <span className={`${o.puce} ${sorte === 'attente' ? o.pulse : ''}`} style={{ background: p.fond, color: p.c }}>{p.l}</span>
            {onPli && <BoutonPli ouvert onClick={onPli} />}
            <span className={o.offreLe}>{`Reçue le ${dateAn(x.le)}`}</span>
          </div>
          <div className={o.montant}>
            <b>{euros(actuel)}</b>
            {puceEcart}
            {a.onModifier && <button type="button" className={o.offreModif} onClick={a.onModifier} aria-label="Corriger l’offre" title="Corriger l’offre"><Ic n="crayon" t={14} /></button>}
          </div>
          <span className={o.qui}><b>{x.qui || 'Un acquéreur'}</b>{fin ? ` · ${fin}` : ''}{typeof d.conditions === 'string' && d.conditions ? ` · ${d.conditions}` : ''}</span>
          {x.commentaire && <span className={o.qui}>{x.commentaire}</span>}
          {negocie && (
            <ol className={o.echanges} aria-label="La négociation">
              {echanges.map((e, i) => (
                <li key={i} data-par={e.par}>
                  <span className={o.echD}>{dateAnCourt(e.le)}</span>
                  <span className={o.echL}>{i === 0 ? 'Offre de l’acquéreur' : e.par === 'vendeur' ? 'Contre-offre du vendeur' : 'Nouvelle proposition de l’acquéreur'}</span>
                  <b>{euros(e.montant)}</b>
                </li>
              ))}
              {(sorte === 'acceptee' || sorte === 'compromis' || sorte === 'vendu') && (
                <li data-par="accord"><span className={o.echD}>{typeof d.reponse_le === 'string' ? dateAnCourt(d.reponse_le) : ''}</span><span className={o.echL}>Accord</span><b>{euros(actuel)}</b></li>
              )}
            </ol>
          )}
        </div>

        {/* ── À droite : où on en est, et la suite ── */}
        <div className={o.offreD}>
          {rang > 0 && (
            <ol className={o.frise4} aria-label="Où en est l’offre">
              {pas.map((t, i) => {
                const etat = i < rang ? 'fait' : i === rang ? 'ici' : 'apres';
                return (
                  <li key={t} className={o.ofPas} data-etat={etat}>
                    <span>{etat === 'fait' ? <Ic n="check" t={12} e={3} /> : <i>{i + 1}</i>}</span>
                    {t}
                  </li>
                );
              })}
            </ol>
          )}

          {sorte !== 'fermee' && (
            <div className={o.suite} data-sorte={sorte}>
              {sorte === 'attente' && (
                <>
                  <b className={o.suiteQ}>{negocie ? `Le vendeur accepte ${euros(dernier.montant)} ?` : 'Le vendeur a répondu ?'}</b>
                  {jusquau && j !== null && !negocie && (
                    <span className={o.delai} data-retard={j < 0 ? 'oui' : 'non'}>
                      <Ic n="horloge" t={15} />
                      <span>{j < 0 ? `Réponse attendue le ${dateAn(jusquau)} · délai dépassé de ${-j} jour${-j > 1 ? 's' : ''}`
                        : `Réponse attendue avant le ${dateAn(jusquau)} · ${j === 0 ? 'aujourd’hui' : j === 1 ? 'demain' : `dans${NBSP}${j}${NBSP}jours`}`}</span>
                    </span>
                  )}
                  {saisie ? <SaisieMontant k={saisie.k} v={saisie.v} onChange={v => setSaisie({ ...saisie, v })} onValider={valider} onAnnuler={() => setSaisie(null)} /> : (
                    <div className={o.offreBtns}>
                      <button type="button" className={`${o.act} ${o.actVert}`} onClick={() => a.onReponse({ k: 'accepte' })}><Ic n="check" t={13} e={2.6} />Il accepte</button>
                      <button type="button" className={o.act} onClick={() => setSaisie({ k: 'contre', v: '' })}>Contre-offre…</button>
                      <button type="button" className={`${o.act} ${o.actRouge}`} onClick={() => a.onReponse({ k: 'refuse' })}>Il refuse</button>
                    </div>
                  )}
                  <div className={o.petits}>
                    <button type="button" className={o.petit} onClick={() => a.onReponse({ k: 'retire' })}>L’acquéreur retire son offre</button>
                  </div>
                </>
              )}
              {sorte === 'contre' && (
                <>
                  <b className={o.suiteQ}>{`L’acquéreur accepte ${euros(dernier.montant)} ?`}</b>
                  {saisie ? <SaisieMontant k={saisie.k} v={saisie.v} onChange={v => setSaisie({ ...saisie, v })} onValider={valider} onAnnuler={() => setSaisie(null)} /> : (
                    <div className={o.offreBtns}>
                      <button type="button" className={`${o.act} ${o.actVert}`} onClick={() => a.onReponse({ k: 'accepte' })}><Ic n="check" t={13} e={2.6} />Il accepte</button>
                      <button type="button" className={o.act} onClick={() => setSaisie({ k: 'propose', v: '' })}>Nouvelle proposition…</button>
                      <button type="button" className={`${o.act} ${o.actRouge}`} onClick={() => a.onReponse({ k: 'renonce' })}>Il renonce</button>
                    </div>
                  )}
                </>
              )}
              {sorte === 'acceptee' && (
                <>
                  <b className={o.suiteQ}>Prochaine étape : le compromis, chez le notaire</b>
                  <span className={o.suiteTx}>Une fois signé, le bien passe « Sous compromis » et le CRM calcule les dates : rétractation, prêt, acte.</span>
                  {a.onCompromis && <button type="button" className={`${o.act} ${o.actOr} ${o.suiteBtn}`} onClick={a.onCompromis}>Le compromis est signé<Ic n="fleche" t={14} e={2.4} /></button>}
                  <div className={o.petits}>
                    <button type="button" className={o.petit} onClick={() => a.onReponse({ k: 'rouvrir' })}>Annuler l’acceptation</button>
                  </div>
                </>
              )}
              {(sorte === 'compromis' || sorte === 'vendu') && c && (
                <>
                  <b className={o.suiteQ}>{sorte === 'vendu' ? `Vendu le ${dateAn(c.venduLe)}` : 'Le compromis est signé'}</b>
                  <div className={o.dates}>
                    {[
                      { l: 'Compromis signé le', v: c.signe },
                      { l: 'Rétractation jusqu’au', v: c.sru },
                      { l: 'Condition de prêt jusqu’au', v: c.pretLimite },
                      { l: sorte === 'vendu' ? 'Acte signé le' : 'Acte prévu le', v: sorte === 'vendu' ? c.venduLe || c.acte : c.acte },
                    ].filter(y => y.v).map(y => {
                      const passe = (joursDepuis(String(y.v)) ?? -1) > 0;
                      return <div key={y.l} data-passe={passe ? 'oui' : 'non'}><small>{y.l}</small><b>{dateAn(String(y.v))}</b></div>;
                    })}
                  </div>
                  {sorte === 'compromis' && a.onVendu && <button type="button" className={`${o.act} ${o.actOr} ${o.suiteBtn}`} onClick={a.onVendu}>La vente est signée<Ic n="fleche" t={14} e={2.4} /></button>}
                </>
              )}
            </div>
          )}
          {sorte === 'fermee' && (
            <div className={o.petits}>
              <button type="button" className={o.petit} onClick={() => a.onReponse({ k: 'rouvrir' })}>Remettre en attente</button>
            </div>
          )}

          {/* ── Le document, à part : facultatif, l'offre est déjà notée. ── */}
          <DocDeLOffre a={a} piece={pieceJointe ? String(d.nom || 'Offre signée') : ''} />
        </div>
      </div>
    </div>
  );
}

function SaisieMontant({ k, v, onChange, onValider, onAnnuler }: { k: 'contre' | 'propose'; v: string; onChange: (t: string) => void; onValider: () => void; onAnnuler: () => void }) {
  const n = lireMontant(v);
  return (
    <div className={o.contre}>
      <label>
        <span>{k === 'contre' ? 'La contre-offre du vendeur' : 'La nouvelle proposition de l’acquéreur'}</span>
        <span className={o.contreCh}>
          <input inputMode="numeric" autoFocus value={v} placeholder="Ex : 495 000" onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onValider(); if (e.key === 'Escape') onAnnuler(); }} />
          <i>€</i>
        </span>
      </label>
      <button type="button" className={`${o.act} ${o.actMarine}`} disabled={!Number.isFinite(n) || n <= 0} onClick={onValider}><Ic n="check" t={13} e={2.6} />Noter</button>
      <button type="button" className={o.act} onClick={onAnnuler}>Annuler</button>
    </div>
  );
}

/* Le document de l'offre, en une ligne : facultatif. */
function DocDeLOffre({ a, piece }: { a: ActionsOffre; piece: string }) {
  const doc = a.doc || null;
  const ETAT = { prepa: { l: 'En préparation', c: '#7a5d1c', f: '#fbf6e9' }, pret: { l: 'À faire signer', c: '#1d4ed8', f: '#eff6ff' }, signe: { l: 'Signée', c: '#15803d', f: '#dcfce7' } };
  return (
    <div className={o.docOffre}>
      <div className={o.docOffreT}>
        <Ic n="plume" t={15} />
        <b>L’offre écrite</b>
        <small>{piece || doc?.etat === 'signe' ? 'signée par l’acquéreur' : doc ? 'à faire signer par l’acquéreur' : 'à faire signer par l’acquéreur · facultatif'}</small>
      </div>
      {piece && (
        <div className={o.docOffreL}>
          <span className={o.puce} style={{ background: '#dcfce7', color: '#15803d' }}>Jointe</span>
          <span>{piece}</span>
          {a.onPiece && <button type="button" className={o.act} onClick={a.onPiece}><Ic n="oeil" t={13} />Voir</button>}
        </div>
      )}
      {doc && (
        <div className={o.docOffreL}>
          <span className={o.puce} style={{ background: ETAT[doc.etat].f, color: ETAT[doc.etat].c }}>{ETAT[doc.etat].l}</span>
          <span>{doc.detail}</span>
          <button type="button" className={o.act} onClick={doc.onOuvrir}>Ouvrir</button>
          {doc.onPdf && <button type="button" className={o.act} onClick={doc.onPdf}><Ic n="telecharger" t={13} />PDF</button>}
        </div>
      )}
      {!piece && !doc ? (
        <div className={o.docOffreBtns}>
          <button type="button" className={o.act} onClick={a.onDoc}><Ic n="plume" t={13} />La préparer</button>
          {a.onJoindre && <JoindreOffre onJoindre={a.onJoindre} t="Joindre la version signée" />}
        </div>
      ) : a.onJoindre && doc?.etat !== 'signe' ? (
        <div className={o.petits}><JoindreOffre onJoindre={a.onJoindre} t={piece ? 'Remplacer le fichier joint' : 'Joindre la version signée sur papier'} petit /></div>
      ) : null}
    </div>
  );
}
function JoindreOffre({ onJoindre, t, petit }: { onJoindre: (f: File) => void; t: string; petit?: boolean }) {
  return (
    <label className={petit ? o.petit : o.act} style={{ cursor: 'pointer' }}>
      <Ic n="trombone" t={13} />{t}
      <input type="file" accept=".pdf,image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onJoindre(f); }} />
    </label>
  );
}

/* ══ DOCUMENTS ══════════════════════════════════════════════════════════ */
/* Les documents de la vente, dans l'ordre (V3.32) : le mandat, les bons de
   visite, les offres, le compromis. Chacun dit s'il est fait (vert), à faire
   (or), en cours, libre (on en fait quand on veut) ou pour plus tard (gris). */
export type EtapeDoc = {
  k: string; ic: string; titre: string; etat: 'fait' | 'afaire' | 'encours' | 'libre' | 'plustard';
  statut: string; detail?: string; actions?: ReactNode;
  /* Une précision en pastille : « Signature électronique », « Signé à la main »… */
  puce?: string;
  /* Sous la ligne, sur toute la largeur : qui a signé, qui on attend (V3.32). */
  suite?: ReactNode;
};
export function EtapesDocs({ etapes }: { etapes: EtapeDoc[] }) {
  return (
    <ol className={o.edocs}>
      {etapes.map(x => (
        <li key={x.k} className={o.edoc} data-etat={x.etat}>
          <span className={o.edocRond} aria-hidden="true">{x.etat === 'fait' ? <Ic n="check" t={15} e={3} /> : <Ic n={x.ic} t={16} />}</span>
          <div className={o.edocTx}>
            <b>{x.titre}</b>
            <span className={o.edocStatut}>{x.statut}{x.puce && <i className={o.edocPuce}>{x.puce}</i>}</span>
            {x.detail && <small>{x.detail}</small>}
          </div>
          {x.actions && <div className={o.edocActs}>{x.actions}</div>}
          {x.suite && <div className={o.edocSuite}>{x.suite}</div>}
        </li>
      ))}
    </ol>
  );
}
/* La synthèse, quand les documents de la vente sont repliés (V3.33).
   Alexandre : « pouvoir replier les documents de la vente pour ne pas qu'ils
   prennent tout, avoir juste une synthèse, et le dossier de diagnostics plus
   facilement accessible ». Une pastille par étape, la couleur de son état ;
   un clic déplie le détail. */
export function SyntheseDocs({ etapes, onOuvrir }: { etapes: EtapeDoc[]; onOuvrir: () => void }) {
  return (
    <div className={o.edSyn}>
      {etapes.map(x => (
        <button key={x.k} type="button" className={o.edSynC} data-etat={x.etat} onClick={onOuvrir} title="Voir le détail">
          <span className={o.edSynRond} aria-hidden="true">{x.etat === 'fait' ? <Ic n="check" t={13} e={3} /> : <Ic n={x.ic} t={14} />}</span>
          <span className={o.edSynTx}><b>{x.titre}</b><small>{x.statut}</small></span>
        </button>
      ))}
    </div>
  );
}
/* ── Le récapitulatif d'une étape (V3.32) ──────────────────────────────
   Alexandre : « le mandat de vente, suivi d'un avenant, un deuxième
   avenant… plusieurs bons de visite, les offres : que ce soit bien à jour ».
   Sous une étape, ses documents dans l'ordre où ils sont venus : un point
   vert signé, or en signature, gris en préparation ; un avenant est rangé
   sous son mandat. Un clic l'ouvre dans Documents ; « PDF » : le signé. */
export type MaillonDoc = {
  id: string; titre: string; detail: string; etat: 'signe' | 'attente' | 'prepa';
  retrait?: boolean; onOuvrir: () => void; onPdf?: () => void;
};
export function ChaineDocs({ items }: { items: MaillonDoc[] }) {
  if (!items.length) return null;
  return (
    <ol className={o.chaine}>
      {items.map(x => (
        <li key={x.id} className={o.maillon} data-etat={x.etat} data-retrait={x.retrait ? 'oui' : undefined}>
          <span className={o.maillonPt} aria-hidden="true">{x.etat === 'signe' ? <Ic n="check" t={11} e={3.2} /> : null}</span>
          <button type="button" className={o.maillonTx} onClick={x.onOuvrir} title="Ouvrir dans Documents">
            <b>{x.titre}</b><small>{x.detail}</small>
          </button>
          {x.onPdf && <button type="button" className={o.maillonPdf} onClick={x.onPdf} title="L’exemplaire signé"><Ic n="doc" t={13} />PDF</button>}
        </li>
      ))}
    </ol>
  );
}
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
