'use client';
import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';

/**
 * « Découvrir » — les nouveaux biens, un par un (V3.44).
 *
 * Un bien à la fois : ses photos d'abord (on les fait glisser au doigt, à la
 * souris, ou avec les flèches), puis la réponse, d'un geste sur le curseur ou
 * d'un appui sur « Pas pour moi » / « Ça me plaît ». La question qui suit
 * (« Qu'est-ce qui vous a plu ? »…) reprend exactement les pastilles de la
 * fiche : le commentaire part au CRM sous la même forme qu'avant.
 *
 * Trois règles qui ne se voient pas, et qui comptent :
 *   — seuls les biens nouveaux, sans réponse, passent ici. « Consultés » et
 *     « Mes derniers biens » restent en liste et sur la carte ;
 *   — une réponse ne part chez le conseiller qu'au bout de cinq secondes :
 *     tant que l'anneau doré tourne, « Annuler mon dernier choix ? » la
 *     reprend sans que rien n'ait été écrit. Si la page passe en arrière-plan
 *     ou se ferme avant, elle part tout de suite (keepalive) ;
 *   — regarder une carte n'est pas « ouvrir » le bien : rien n'est envoyé
 *     avant la réponse. Le client qui s'en va au milieu retrouve donc, au
 *     retour, les biens restants là où il les a laissés. C'est le serveur qui
 *     note le bien « vu » au moment de la réponse (route « retour »).
 *
 * Ce fichier ne lit rien d'EspaceClient : tout ce qui vient de l'espace
 * (la fiche, les pastilles, l'enregistrement, le mandat) arrive par les props.
 * EspaceClient, lui, en reprend la galerie pour la fiche ouverte d'ici.
 */

export type BienDecouverte = {
  id: string; titre: string; secteur: string; prix: number | null;
  surface: number | null; pieces: number | null; chambres: number | null;
  photos: string[]; etat: string; avis: string | null; commentaire: string | null;
  description: string | null;
  terrasse?: boolean; balcon?: boolean; jardin?: boolean; parking?: boolean;
  ascenseur?: boolean; cave?: boolean; gardien?: boolean;
  cuisineEquipee?: boolean; clim?: boolean; traversant?: boolean;
};

export type AvisDecouverte = 'refuse' | 'interesse' | 'souhaite_visiter';
type Reponse = { id: string; avis: AvisDecouverte; commentaire: string };
type Sortie = null | 'gauche' | 'droite' | 'haut';
export type ActionsFiche = { onRetour: () => void; onRepondre: (a: AvisDecouverte) => void; colonne: boolean };

type Props = {
  /** Tous les biens de l'espace, tels qu'ils sont à l'instant (l'état vivant). */
  biens: BienDecouverte[];
  /** Les biens à passer, dans l'ordre, figés à l'ouverture. */
  depart: string[];
  /** Les pastilles de réponse de l'espace (PASTILLES) : mêmes mots, mêmes dessins. */
  pastilles: Record<string, { i: string; n: string }[]>;
  Ico: (p: { n: string; t?: number }) => React.ReactElement | null;
  /** « 82 » pour « 82 % de vos critères », ou null. */
  note: (id: string) => number | null;
  /** « Nouveau · hier ». */
  quand: (id: string) => string;
  /** La fiche complète d'un bien, en mode découverte. */
  fiche: (id: string, actions: ActionsFiche) => React.ReactNode;
  /** « Voir le bien » : le conseiller voit que la fiche a été ouverte. */
  onVoir?: (id: string) => void;
  /** Envoie la réponse (après les cinq secondes). false : pas partie. */
  enregistrer: (id: string, avis: AvisDecouverte, commentaire: string, garder: boolean) => Promise<boolean>;
  /** Un mandat est à signer avant toute demande de visite. */
  visiteBloquee: () => boolean;
  /** La demande de visite par le chemin habituel : signature d'abord. */
  demanderVisite: (id: string, commentaire: string) => void;
  /** La pile « Échap » de l'espace (useEchap). */
  useEchap: (actif: boolean, onEchap: () => void) => void;
  /** vers : l'onglet à ouvrir en sortant (« consultes »), ou rien. */
  onFermer: (vers?: string) => void;
};

/* Identiques à EspaceClient (SEP_PASTILLES, SEP_LIBRE) : c'est la forme que
   le CRM relit, et que la fiche rerange en pastilles (RetourLu). */
const SEP_PASTILLES = ' · ';
const SEP_LIBRE = ' — ';
const ANNUL_MS = 5000;

const BLEU = '#1b365d', VERT = '#15803d', ROUGE = '#b42318', OR = '#c9a84c';

const FEUILLES: Record<AvisDecouverte, { tag: string; t: string; p: string; ph: string; btn: string; passer: string }> = {
  refuse: {
    tag: 'Pas pour moi',
    t: 'Qu’est-ce qui n’a pas convenu ?',
    p: 'Choisissez une ou plusieurs raisons : c’est ce qui nous permet d’écarter ce type de bien pour la suite.',
    ph: 'Ex : trop sombre, rue trop passante, cuisine trop petite…',
    btn: 'Envoyer mon retour', passer: 'Passer sans donner de raison',
  },
  interesse: {
    tag: 'Ça me plaît',
    t: 'Qu’est-ce qui vous a plu ?',
    p: 'Choisissez ce qui compte, un ou plusieurs. Plus c’est précis, plus les biens suivants lui ressembleront.',
    ph: 'Ex : la luminosité, le séjour, le quartier…',
    btn: 'Envoyer mon avis', passer: 'Passer',
  },
  souhaite_visiter: {
    tag: 'Je veux visiter',
    t: 'Quelles sont vos disponibilités ?',
    p: 'Choisissez un ou plusieurs créneaux. Votre conseiller s’organise pour vous y accompagner et revient vers vous avec le rendez-vous.',
    ph: 'Ex : jeudi après 18 h, samedi matin…',
    btn: 'Envoyer mes disponibilités', passer: 'Envoyer sans préciser',
  },
};
const AVIS_OK: AvisDecouverte[] = ['refuse', 'interesse', 'souhaite_visiter'];

const EUR = (n?: number | null) =>
  n == null ? '—' : n.toLocaleString('fr-FR').replace(/[  ]/g, ' ') + ' €';

/* Le mélange de deux couleurs : le bouton rond passe du bleu au vert (ou au
   rouge) à mesure qu'il avance, au lieu de changer d'un coup. */
function melange(a: string, c: string, t: number) {
  const h = (x: string) => [1, 3, 5].map(k => parseInt(x.slice(k, k + 2), 16));
  const A = h(a), C = h(c);
  return '#' + A.map((v, k) => Math.round(v + (C[k] - v) * t).toString(16).padStart(2, '0')).join('');
}
const borne = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function vibre(ms: number) { try { navigator.vibrate?.(ms); } catch { /* iPhone, ou refusé */ } }

/* Les petits dessins propres à cet écran. Les autres (pastilles, croix,
   coche, calendrier, crayon) viennent de la table T de l'espace, par Ico. */
function Svg({ d, t = 18, l = 2.2 }: { d: string[]; t?: number; l?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={l}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block', flex: '0 0 auto' }}>
      {d.map((x, k) => <path key={k} d={x} />)}
    </svg>
  );
}
const D_GAUCHE = ['M15 5l-7 7 7 7'];
const D_DROITE = ['M9 5l7 7-7 7'];
const D_FLECHE = ['M5 12h14', 'M13 6l6 6-6 6'];
const D_CROIX = ['M6 6l12 12', 'M18 6L6 18'];
const D_COCHE = ['M5 12.5l4.5 4.5L19 7.5'];
const D_ANNULER = ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'];
const D_MAIN = ['M10 13V4.5a1.5 1.5 0 0 1 3 0V11', 'M13 10.5a1.5 1.5 0 0 1 3 0V12', 'M16 11.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.2a5 5 0 0 1-3.9-1.9L5 15.4a1.5 1.5 0 0 1 2.2-2l1.8 1.6'];
const D_CAL = ['M4.5 6h15a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z', 'M3.5 10.5h17', 'M8 3.5v4', 'M16 3.5v4'];
const D_MAISON = ['M3 21h18', 'M5 21V9.5L12 4l7 5.5V21', 'M10 21v-6h4v6'];

/* Ordinateur : deux colonnes à partir de 1024 px. */
function useLarge() {
  const [large, setLarge] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(min-width:1024px)').matches);
  useEffect(() => {
    const m = window.matchMedia?.('(min-width:1024px)');
    if (!m) return;
    const suivre = () => setLarge(m.matches);
    suivre();
    m.addEventListener?.('change', suivre);
    return () => m.removeEventListener?.('change', suivre);
  }, []);
  return large;
}

/* ══ La galerie qui glisse ══════════════════════
   Une bande de photos qu'on déplace d'un bloc : elle suit le doigt (ou la
   souris), résiste au bout, et se pose sur la photo voisine passé 50 px.
   Les flèches font le même trajet, avec la même courbe. Utilisée sur la
   carte, à gauche sur ordinateur, et en tête de la fiche ouverte d'ici.

   Seules les photos proches sont chargées (deux de chaque côté) : un bien
   en a parfois quarante, et la carte suivante attend. */
export function GalerieGlisse({ photos, p, onP, onTouche, variante = 'carte', haut }: {
  photos: string[]; p?: number; onP?: (n: number) => void; onTouche?: (n: number) => void;
  variante?: 'carte' | 'fiche' | 'grand'; haut?: React.ReactNode;
}) {
  const n = photos.length;
  const [pi, setPi] = useState(0);
  const idx = borne(p ?? pi, 0, Math.max(0, n - 1));
  const aller = useCallback((k: number) => {
    const v = borne(k, 0, Math.max(0, n - 1));
    if (onP) onP(v); else setPi(v);
  }, [n, onP]);
  const [dx, setDx] = useState(0);
  const [glisse, setGlisse] = useState(false);
  const geste = useRef<{ x: number; y: number; id: number; parti: boolean; dx: number } | null>(null);
  const [charges, setCharges] = useState<Set<number>>(() => new Set([0, 1, 2]));
  useEffect(() => {
    setCharges(s => {
      const voulues = [idx - 2, idx - 1, idx, idx + 1, idx + 2].filter(k => k >= 0 && k < n);
      if (voulues.every(k => s.has(k))) return s;
      const x = new Set(s); voulues.forEach(k => x.add(k)); return x;
    });
  }, [idx, n]);

  const annule = () => { geste.current = null; setGlisse(false); setDx(0); };
  const bas = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    geste.current = { x: e.clientX, y: e.clientY, id: e.pointerId, parti: false, dx: 0 };
  };
  const bouge = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = geste.current;
    if (!g || g.id !== e.pointerId) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) { annule(); return; }
    const ddx = e.clientX - g.x, ddy = e.clientY - g.y;
    if (!g.parti) {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
      /* Un geste vertical n'est pas pour nous : la page défile. */
      if (Math.abs(ddy) > Math.abs(ddx)) { geste.current = null; return; }
      g.parti = true;
      setGlisse(true);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sans effet */ }
    }
    g.dx = ddx;
    setDx(ddx);
  };
  const leve = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = geste.current;
    geste.current = null;
    if (!g || g.id !== e.pointerId) return;
    if (!g.parti) { onTouche?.(idx); return; }
    let k = idx;
    if (g.dx < -50 && idx < n - 1) k = idx + 1;
    if (g.dx > 50 && idx > 0) k = idx - 1;
    setGlisse(false); setDx(0);
    aller(k);
  };

  if (!n) {
    return (
      <div className={'dg dg-' + variante}>
        <div className="dg-vide"><Svg d={D_MAISON} t={44} l={1.6} /></div>
        {haut}
      </div>
    );
  }
  const auBout = (idx === 0 && dx > 0) || (idx === n - 1 && dx < 0);
  const decale = glisse ? (auBout ? dx / 3 : dx) : 0;
  return (
    <div className={'dg dg-' + variante + (glisse ? ' tient' : '') + (onTouche ? ' zoom' : '')}
      onPointerDown={bas} onPointerMove={bouge} onPointerUp={leve} onPointerCancel={annule}>
      <div className="dg-bande" style={{
        transform: `translate3d(calc(${-idx * 100}% + ${decale}px), 0, 0)`,
        transition: glisse ? 'none' : 'transform .45s cubic-bezier(.22,.8,.3,1)',
      }}>
        {photos.map((u, k) => (
          <div className="dg-c" key={k}>
            {charges.has(k) ? <img src={u} alt="" draggable={false} decoding="async" /> : null}
          </div>
        ))}
      </div>
      {n > 1 && n <= 20 && (
        <div className="dg-segs" aria-hidden="true">
          {photos.map((_, k) => <span key={k} className={k <= idx ? 'on' : ''} />)}
        </div>
      )}
      {haut}
      {n > 1 && <span className="dg-n tab">{`${idx + 1} / ${n}`}</span>}
      {n > 1 && (
        <>
          <button type="button" className={'dg-f g' + (idx > 0 ? '' : ' cache')} aria-label="Photo précédente"
            tabIndex={idx > 0 ? 0 : -1} onClick={() => aller(idx - 1)}><Svg d={D_GAUCHE} t={variante === 'grand' ? 20 : 18} l={2.4} /></button>
          <button type="button" className={'dg-f d' + (idx < n - 1 ? '' : ' cache')} aria-label="Photo suivante"
            tabIndex={idx < n - 1 ? 0 : -1} onClick={() => aller(idx + 1)}><Svg d={D_DROITE} t={variante === 'grand' ? 20 : 18} l={2.4} /></button>
        </>
      )}
    </div>
  );
}

/* ══ Le curseur de réponse ══════════════════════
   Un bouton rond au milieu d'une piste. Au repos, il se balance doucement
   et un anneau doré s'en échappe : on comprend qu'il se déplace. Dès qu'on
   le touche, tout s'arrête et il suit le doigt ; sa couleur glisse vers le
   rouge à gauche, vers le vert à droite, et la piste se teinte avec lui.
   Lâché au-delà du seuil, il répond. Les deux mots restent des boutons :
   les toucher fait glisser le rond jusqu'au bout, lentement. */
function Curseur({ cible, doux, repos, verrou, onLache, onMot, Ico }: {
  cible: -1 | 0 | 1; doux: boolean; repos: boolean; verrou: boolean;
  onLache: (sens: -1 | 1) => void; onMot: (sens: -1 | 1) => void;
  Ico: Props['Ico'];
}) {
  const piste = useRef<HTMLDivElement | null>(null);
  const [max, setMax] = useState(143);
  useLayoutEffect(() => {
    const el = piste.current;
    if (!el) return;
    const mesurer = () => { if (el.clientWidth) setMax(Math.max(60, el.clientWidth / 2 - 40)); };
    mesurer();
    if (typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(mesurer);
    o.observe(el);
    return () => o.disconnect();
  }, []);
  const [kx, setKx] = useState(0);
  const [glisse, setGlisse] = useState(false);
  const geste = useRef<{ x0: number; id: number; passe: boolean } | null>(null);
  const seuil = max * 0.77;

  const bas = (e: React.PointerEvent<HTMLDivElement>) => {
    if (verrou || (e.pointerType === 'mouse' && e.button !== 0)) return;
    geste.current = { x0: e.clientX, id: e.pointerId, passe: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sans effet */ }
    setKx(0); setGlisse(true);
  };
  const bouge = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = geste.current;
    if (!g || g.id !== e.pointerId) return;
    const v = borne(e.clientX - g.x0, -max, max);
    /* Une petite vibration au passage du seuil : « là, ça répond ». */
    const passe = Math.abs(v) > seuil;
    if (passe !== g.passe) { g.passe = passe; if (passe) vibre(14); }
    setKx(v);
  };
  const leve = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = geste.current;
    geste.current = null;
    if (!g || g.id !== e.pointerId) return;
    const v = borne(e.clientX - g.x0, -max, max);
    setGlisse(false);
    if (v > seuil) onLache(1);
    else if (v < -seuil) onLache(-1);
  };
  const annule = () => { geste.current = null; setGlisse(false); };

  const pos = glisse ? kx : cible * max;
  const t = Math.min(1, Math.abs(pos) / (max * 0.85));
  const vers = pos >= 0 ? VERT : ROUGE;
  const couleur = melange(BLEU, vers, t);
  const bord = melange(OR, vers, t);
  const dure = glisse ? 'none' : doux
    ? 'transform 1.1s cubic-bezier(.4,0,.2,1)'
    : 'transform .32s cubic-bezier(.2,.7,.3,1)';
  const teinte = glisse ? 'none' : doux ? 'opacity 1.1s ease' : 'opacity .35s ease';
  const fond = glisse ? 'none' : doux ? 'background-color 1.1s ease, border-color 1.1s ease' : 'background-color .3s ease, border-color .3s ease';
  return (
    <div className={'dec-cur' + (repos && !glisse ? ' repos' : '')} ref={piste}>
      <span className="dec-cur-t g" style={{ opacity: borne(-pos / max, 0, 1), transition: teinte }} />
      <span className="dec-cur-t d" style={{ opacity: borne(pos / max, 0, 1), transition: teinte }} />
      <button type="button" className="dec-cur-m g" disabled={verrou} onClick={() => onMot(-1)}>
        <Ico n="croix" t={18} /><span>Pas pour moi</span>
      </button>
      <button type="button" className="dec-cur-m d" disabled={verrou} onClick={() => onMot(1)}>
        <span>Ça me plaît</span><Ico n="check" t={18} />
      </button>
      <span className="dec-halo" aria-hidden="true" />
      <div className="dec-rond" aria-hidden="true"
        style={{ transform: `translate3d(${pos}px, 0, 0)`, transition: dure }}
        onPointerDown={bas} onPointerMove={bouge} onPointerUp={leve} onPointerCancel={annule}>
        <span className="dec-rond-in" style={{ background: couleur, borderColor: bord, transition: fond }}>
          <span className="dec-ch g"><Svg d={['M14 6l-5 6 5 6']} t={12} l={2.6} /></span>
          <Svg d={D_MAIN} t={26} l={2} />
          <span className="dec-ch d"><Svg d={['M10 6l5 6-5 6']} t={12} l={2.6} /></span>
        </span>
      </div>
    </div>
  );
}

/* ══ La question qui suit la réponse ════════════
   Les pastilles d'abord (un geste), le mot libre seulement s'il le demande.
   « Envoyer » reste éteint tant qu'il n'a rien choisi ni écrit : c'est
   « Passer » qui enregistre la réponse sans raison. */
function Question({ avis, bien, photo, pastilles, Ico, onEnvoyer, onPasser, onVersVisite }: {
  avis: AvisDecouverte; bien: BienDecouverte; photo: string | null;
  pastilles: Props['pastilles']; Ico: Props['Ico'];
  onEnvoyer: (choix: string[], mot: string) => void; onPasser: () => void; onVersVisite: () => void;
}) {
  const [choix, setChoix] = useState<string[]>([]);
  const [ecrire, setEcrire] = useState(false);
  const [mot, setMot] = useState('');
  const F = FEUILLES[avis];
  const peut = choix.length > 0 || !!mot.trim();
  const basculer = (n: string) => setChoix(l => (l.includes(n) ? l.filter(x => x !== n) : [...l, n]));
  return (
    <>
      <div className="dec-q-poignee" aria-hidden="true" />
      <div className="dec-q-tete">
        <span className="dec-q-mini">{photo ? <img src={photo} alt="" draggable={false} /> : <Svg d={D_MAISON} t={22} l={1.8} />}</span>
        <span className="dec-q-bien">
          <b>{bien.titre}</b>
          <span>{[EUR(bien.prix), bien.secteur].filter(Boolean).join(' · ')}</span>
        </span>
        <span className={'dec-q-tag ' + avis}>{F.tag}</span>
      </div>
      <div className="dec-q-txt">
        <h2>{F.t}</h2>
        <p>{F.p}</p>
      </div>
      <div className="dec-chips">
        {(pastilles[avis] || []).map(x => {
          const on = choix.includes(x.n);
          return (
            <button key={x.n} type="button" className={'dec-chip' + (on ? ' on' : '')} aria-pressed={on}
              onClick={() => { vibre(10); basculer(x.n); }}>
              <Ico n={x.i} t={18} /><span>{x.n}</span>
            </button>
          );
        })}
      </div>
      {ecrire ? (
        <label className="dec-mot">
          <span>Un mot pour votre conseiller</span>
          <textarea rows={3} value={mot} maxLength={400} placeholder={F.ph} autoFocus
            onChange={e => setMot(e.target.value)} />
        </label>
      ) : (
        <button type="button" className="dec-ajout" onClick={() => setEcrire(true)}>
          <Ico n="crayon" t={16} /><span>Ajouter un mot</span>
        </button>
      )}
      {avis === 'interesse' && (
        <button type="button" className="dec-vv" onClick={onVersVisite}>
          <span className="dec-vv-i"><Svg d={D_CAL} t={20} l={2} /></span>
          <span className="dec-vv-t"><b>{'Vous voulez le visiter ?'}</b><span>Donnez vos disponibilités, votre conseiller organise la visite.</span></span>
          <Svg d={D_DROITE} t={18} />
        </button>
      )}
      <div className="dec-q-pied">
        <button type="button" className="dec-envoyer" disabled={!peut}
          onClick={() => { if (peut) onEnvoyer(choix, mot); }}>{F.btn}</button>
        <button type="button" className="dec-passer" onClick={onPasser}>{F.passer}</button>
      </div>
    </>
  );
}

/* ══ L'écran ════════════════════════════════════ */
export default function Decouverte(props: Props) {
  const { biens, pastilles, Ico, note, quand, fiche, useEchap } = props;
  const P = useRef(props);
  P.current = props;
  const large = useLarge();

  const [file, setFile] = useState<string[]>(props.depart);
  const [i, setI] = useState(0);
  const [reponses, setReponses] = useState<Reponse[]>([]);
  const [p, setP] = useState(0);
  const [sortie, setSortie] = useState<Sortie>(null);
  const [entree, setEntree] = useState(false);
  const [cible, setCible] = useState<-1 | 0 | 1>(0);
  const [doux, setDoux] = useState(false);
  const [verrou, setVerrou] = useState(false);
  /* La question : 'entre' (posée, pas encore montée), 'on', 'sort'. */
  const [question, setQuestion] = useState<AvisDecouverte | null>(null);
  const [qEtat, setQEtat] = useState<'entre' | 'on' | 'sort'>('entre');
  /* La fiche ouverte d'ici (« Voir le bien »). */
  const [voir, setVoir] = useState<'non' | 'entre' | 'on' | 'sort'>('non');
  /* « Annuler mon dernier choix ? » */
  const [annul, setAnnul] = useState<'non' | 'monte' | 'plein' | 'sort'>('non');
  const [visible, setVisible] = useState(false);
  /* Une réponse attend ses cinq secondes : l'espace ne se recharge pas. */
  const [enAttente, setEnAttente] = useState(false);
  /* Le clavier entre dans l'écran. La page cachée dessous est rendue inerte
     par l'espace (inert) : Tab ne s'y promène pas. */
  const racine = useRef<HTMLDivElement | null>(null);
  useEffect(() => { try { racine.current?.focus({ preventScroll: true }); } catch { /* sans effet */ } }, []);

  const parId = useMemo(() => new Map(biens.map(b => [b.id, b])), [biens]);
  const fini = i >= file.length;
  const courant = fini ? undefined : parId.get(file[i]);

  /* Les valeurs que lisent les minuteurs : toujours celles du dernier rendu. */
  const R = useRef({ i, file, courant, verrou, question, voir });
  R.current = { i, file, courant, verrou, question, voir };

  /* ── les minuteurs ── */
  const minuteurs = useRef<Set<number>>(new Set());
  const plus = useCallback((ms: number, f: () => void) => {
    const t = window.setTimeout(() => { minuteurs.current.delete(t); f(); }, ms);
    minuteurs.current.add(t);
    return t;
  }, []);
  const moins = useCallback((t: number) => { window.clearTimeout(t); minuteurs.current.delete(t); }, []);
  const tGeste = useRef<number[]>([]);
  const tAnnul = useRef<number[]>([]);
  const vivant = useRef(true);

  /* ── la réponse en attente (les cinq secondes) ── */
  const attente = useRef<{ r: Reponse; idx: number } | null>(null);
  const valider = useCallback((garder = false) => {
    const a = attente.current;
    if (!a) return;
    attente.current = null;
    /* Partie (au bout des cinq secondes, ou plus tôt : réponse suivante,
       arrière-plan, fermeture) : « Annuler » n'a plus d'objet, la pastille
       s'en va. Sinon elle tournerait encore sans rien pouvoir reprendre. */
    if (vivant.current) {
      tAnnul.current.forEach(moins); tAnnul.current = [];
      setEnAttente(false);
      setAnnul(x => (x === 'non' ? x : 'sort'));
      tAnnul.current.push(plus(440, () => setAnnul('non')));
    }
    const r = a.r;
    void P.current.enregistrer(r.id, r.avis, r.commentaire, garder).catch(() => false).then(ok => {
      /* Pas partie : l'espace l'a dit (« Votre réponse n'est pas partie »).
         Le bien revient en fin de liste, il n'est pas perdu. */
      if (ok || !vivant.current) return;
      setReponses(l => l.filter(x => x !== r));
      setFile(f => [...f, r.id]);
    });
  }, [plus, moins]);

  useEffect(() => {
    vivant.current = true;
    const m = minuteurs.current;
    const t = window.setTimeout(() => setVisible(true), 20);
    document.documentElement.classList.add('dec-ouvert');
    return () => {
      vivant.current = false;
      window.clearTimeout(t);
      m.forEach(x => window.clearTimeout(x));
      m.clear();
      document.documentElement.classList.remove('dec-ouvert');
      try { delete document.documentElement.dataset.decouverte; } catch { /* sans effet */ }
      /* Fermé avant la fin des cinq secondes : la réponse part maintenant. */
      valider(true);
    };
  }, [valider]);

  /* La page passe en arrière-plan (un appel, une autre application) : la
     réponse part tout de suite. Le téléphone peut fermer la page sans
     prévenir, et l'espace se recharge de toute façon au retour. */
  useEffect(() => {
    const vite = () => { if (document.visibilityState === 'hidden') valider(true); };
    const part = () => valider(true);
    document.addEventListener('visibilitychange', vite);
    window.addEventListener('pagehide', part);
    return () => {
      document.removeEventListener('visibilitychange', vite);
      window.removeEventListener('pagehide', part);
    };
  }, [valider]);

  /* Pendant qu'il écrit, et tant qu'une réponse attend son envoi, l'espace
     ne se recharge pas sous ses doigts (voir « se remettre à jour tout seul
     au retour » dans EspaceClient) : la page rechargée relirait le bien
     encore « nouveau », et il le reverrait. */
  useEffect(() => {
    try {
      if (question || enAttente) document.documentElement.dataset.decouverte = 'saisie';
      else delete document.documentElement.dataset.decouverte;
    } catch { /* sans effet */ }
  }, [question, enAttente]);

  /* La première photo du bien suivant, chargée d'avance. */
  useEffect(() => {
    const suivant = parId.get(file[i + 1]);
    if (suivant?.photos?.[0]) { const im = new Image(); im.src = suivant.photos[0]; }
  }, [i, file, parId]);

  /* ── passer au bien suivant (ou revenir sur un bien) ── */
  const montrer = useCallback((n: number) => {
    setI(n); setP(0); setSortie(null); setEntree(true); setCible(0); setDoux(false); setVerrou(false);
    plus(40, () => setEntree(false));
  }, [plus]);

  const lancerAnnulation = useCallback(() => {
    tAnnul.current.forEach(moins); tAnnul.current = [];
    setAnnul('monte');
    tAnnul.current.push(plus(40, () => setAnnul('plein')));
    tAnnul.current.push(plus(ANNUL_MS, () => valider()));
  }, [plus, moins, valider]);

  const suite = useCallback((r: Reponse) => {
    /* La réponse précédente attendait encore : elle part maintenant. */
    valider();
    const idx = R.current.i;
    setReponses(l => [...l, r]);
    attente.current = { r, idx };
    setEnAttente(true);
    montrer(idx + 1);
    lancerAnnulation();
  }, [valider, montrer, lancerAnnulation]);

  const revenir = useCallback(() => {
    const a = attente.current;
    if (!a) return;
    attente.current = null;
    setEnAttente(false);
    tAnnul.current.forEach(moins); tAnnul.current = [];
    tGeste.current.forEach(moins); tGeste.current = [];
    setReponses(l => l.filter(x => x !== a.r));
    montrer(a.idx);
    setAnnul('sort');
    tAnnul.current.push(plus(440, () => setAnnul('non')));
  }, [montrer, plus, moins]);

  /* ── la question ── */
  const qSort = useRef(false);
  const ouvrirQuestion = useCallback((avis: AvisDecouverte) => {
    qSort.current = false;
    setQuestion(avis); setQEtat('entre');
    plus(30, () => setQEtat(e => (e === 'entre' ? 'on' : e)));
  }, [plus]);
  /* Elle redescend, PUIS la suite : un double appui ne passe qu'une fois. */
  const fermerQuestion = useCallback((puis: () => void) => {
    if (qSort.current) return;
    qSort.current = true;
    setQEtat('sort');
    plus(380, () => { setQuestion(null); setQEtat('entre'); qSort.current = false; puis(); });
  }, [plus]);
  /* Le bien revient au centre, comme si rien n'avait été dit. */
  const remettre = useCallback(() => {
    setSortie(null); setCible(0); setDoux(false); setVerrou(false);
  }, []);

  /* ── la fiche ── */
  const tFiche = useRef<number[]>([]);
  const ouvrirFiche = useCallback(() => {
    if (R.current.verrou || R.current.question || !R.current.courant) return;
    tFiche.current.forEach(moins); tFiche.current = [];
    setVoir('entre');
    tFiche.current.push(plus(30, () => setVoir('on')));
    P.current.onVoir?.(R.current.courant.id);
  }, [plus, moins]);
  const fermerFiche = useCallback(() => {
    if (R.current.voir === 'non') return;
    tFiche.current.forEach(moins); tFiche.current = [];
    setVoir('sort');
    tFiche.current.push(plus(320, () => setVoir('non')));
  }, [plus, moins]);

  /* ── répondre ──
     Le rond finit sa course (lentement si on a touché le mot, vite si on l'a
     lâché passé le seuil), PUIS la carte s'en va, PUIS la question monte. */
  const repondre = useCallback((avis: AvisDecouverte, origine: 'glisse' | 'mot' | 'fiche' | 'bouton') => {
    const c = R.current;
    if (c.verrou || c.question || !c.courant) return;
    setVerrou(true);
    vibre(18);
    const sens: Sortie = avis === 'refuse' ? 'gauche' : avis === 'interesse' ? 'droite' : 'haut';
    tGeste.current.forEach(moins); tGeste.current = [];
    if (origine === 'fiche') {
      setSortie(sens);
      fermerFiche();
      ouvrirQuestion(avis);
      return;
    }
    if (avis === 'souhaite_visiter') {
      setSortie('haut');
      tGeste.current.push(plus(320, () => ouvrirQuestion(avis)));
      return;
    }
    setCible(avis === 'refuse' ? -1 : 1);
    setDoux(origine === 'mot');
    let calme = false;
    try { calme = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { /* sans effet */ }
    const course = calme ? 150 : origine === 'mot' ? 1150 : 380;
    tGeste.current.push(plus(course, () => setSortie(sens)));
    tGeste.current.push(plus(course + 320, () => ouvrirQuestion(avis)));
  }, [plus, moins, fermerFiche, ouvrirQuestion]);

  const texte = (choix: string[], mot: string) =>
    [choix.join(SEP_PASTILLES), mot.trim()].filter(Boolean).join(SEP_LIBRE);

  const conclure = useCallback((avis: AvisDecouverte, commentaire: string) => {
    const b = R.current.courant;
    if (!b) return;
    /* Pas de visite sans mandat : la signature d'abord, par le chemin
       habituel de l'espace. Le bien revient au centre pendant ce temps ; il
       s'en ira tout seul quand la demande sera partie (voir plus bas). */
    if (avis === 'souhaite_visiter' && P.current.visiteBloquee()) {
      fermerQuestion(() => {
        valider();
        remettre();
        P.current.demanderVisite(b.id, commentaire);
      });
      return;
    }
    fermerQuestion(() => suite({ id: b.id, avis, commentaire }));
  }, [fermerQuestion, valider, remettre, suite]);

  /* Un bien qui reçoit sa réponse ailleurs pendant qu'il est à l'écran :
     la demande de visite partie juste après la signature du mandat. Il
     s'en va vers le haut, et compte dans le bilan. Un bien disparu (retiré
     entre-temps) est simplement passé. */
  useEffect(() => {
    if (fini) return;
    const id = file[i];
    const b = parId.get(id);
    if (!b) { setI(x => x + 1); return; }
    if (verrou || question || sortie || voir !== 'non') return;
    const repondu = b.etat === 'avis' || (!!b.avis && b.avis !== 'propose');
    if (!repondu) return;
    if (reponses.some(r => r.id === id)) { setI(x => x + 1); return; }
    const avis = AVIS_OK.find(a => a === b.avis);
    setVerrou(true);
    setSortie('haut');
    tGeste.current.push(plus(340, () => {
      if (avis) setReponses(l => [...l, { id, avis, commentaire: b.commentaire || '' }]);
      montrer(i + 1);
    }));
  }, [fini, file, i, parId, verrou, question, sortie, voir, reponses, plus, montrer]);

  /* ── fermer ── */
  const fermer = useCallback((vers?: string) => {
    valider();
    setVisible(false);
    plus(260, () => P.current.onFermer(vers));
  }, [valider, plus]);

  /* Échap : la question d'abord (le bien revient), puis la fiche, puis l'écran. */
  const echap = useRef<() => void>(() => {});
  echap.current = () => {
    if (R.current.question) { fermerQuestion(remettre); return; }
    if (R.current.voir !== 'non') { fermerFiche(); return; }
    fermer();
  };
  const surEchap = useCallback(() => echap.current(), []);
  useEchap(true, surEchap);

  /* Les flèches du clavier font défiler les photos (ordinateur). */
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (R.current.question || !R.current.courant) return;
      const cible = e.target as HTMLElement | null;
      if (cible?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const n = R.current.courant.photos?.length || 0;
      if (e.key === 'ArrowRight') setP(x => Math.min(Math.max(0, n - 1), x + 1));
      if (e.key === 'ArrowLeft') setP(x => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, []);

  /* Les vignettes suivent la photo affichée (ordinateur). Seule leur bande
     défile : scrollIntoView ferait aussi bouger la page cachée dessous. */
  const minis = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const bande = minis.current;
    const el = bande?.children[p] as HTMLElement | undefined;
    if (!bande || !el) return;
    const g = el.offsetLeft - bande.offsetLeft, d = g + el.offsetWidth;
    if (g < bande.scrollLeft + 8) bande.scrollTo({ left: Math.max(0, g - 18), behavior: 'smooth' });
    else if (d > bande.scrollLeft + bande.clientWidth - 8) bande.scrollTo({ left: d - bande.clientWidth + 18, behavior: 'smooth' });
  }, [p]);

  /* ── l'affichage ── */
  const uniques = useMemo(() => [...new Set(file)], [file]);
  const total = uniques.length;
  const rang = Math.min(new Set(file.slice(0, i + 1)).size, total);
  const compteur = fini ? `${total} sur ${total}` : `${rang} sur ${total}`;
  const repos = !!courant && !verrou && !question && !sortie && cible === 0 && voir === 'non';
  const decale = large ? 140 : 440;
  let tf = 'none', op = 1;
  if (sortie === 'gauche') { tf = `translateX(-${decale}px) rotate(${large ? -2 : -5}deg)`; op = 0; }
  if (sortie === 'droite') { tf = `translateX(${decale}px) rotate(${large ? 2 : 5}deg)`; op = 0; }
  if (sortie === 'haut') { tf = 'translateY(-40px) scale(.96)'; op = 0; }
  if (entree) { tf = 'translateY(14px) scale(.96)'; op = 0; }
  const styleCarte: React.CSSProperties = {
    transform: tf, opacity: op,
    transition: entree ? 'none' : 'transform .32s cubic-bezier(.2,.7,.3,1), opacity .32s ease',
  };

  const nb = (a: AvisDecouverte) => reponses.filter(r => r.avis === a).length;
  const fait = reponses.length;
  const pastilleAnnul = annul !== 'non' && !question && voir === 'non' ? (
    <div className={'dec-annul a-' + annul}>
      <button type="button" onClick={revenir}>
        <span className="dec-annul-r">
          <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#e7ebf1" strokeWidth="3" />
            <circle cx="18" cy="18" r="15" fill="none" stroke={OR} strokeWidth="3" strokeLinecap="round"
              strokeDasharray="94.25" strokeDashoffset={annul === 'monte' ? 94.25 : 0}
              style={{ transition: annul === 'plein' ? `stroke-dashoffset ${ANNUL_MS / 1000}s linear` : 'none' }} />
          </svg>
          <Svg d={D_ANNULER} t={16} l={2.3} />
        </span>
        <span>{'Annuler mon dernier choix ?'}</span>
      </button>
    </div>
  ) : null;

  const infos = courant ? (() => {
    const n = note(courant.id);
    const meta = [courant.surface ? `${courant.surface} m²` : '', courant.pieces ? `${courant.pieces} pièce${courant.pieces > 1 ? 's' : ''}` : '', courant.secteur].filter(Boolean).join(' · ');
    return (
      <>
        <div className="dec-l1">
          <b className="dec-prix tab">{EUR(courant.prix)}</b>
          <button type="button" className="dec-voir" onClick={ouvrirFiche}>
            <span>Voir le bien</span><Svg d={D_FLECHE} t={16} />
          </button>
        </div>
        <div className="dec-titre">{courant.titre}</div>
        {meta && <div className="dec-meta">{meta}</div>}
        {n != null && (
          <div className="dec-note">
            <span className="dec-note-b"><i style={{ width: n + '%' }} /></span>
            <span className="tab">{`${n} % de vos critères`}</span>
          </div>
        )}
      </>
    );
  })() : null;

  const visiter = (
    <button type="button" className="dec-visiter" disabled={verrou} onClick={() => repondre('souhaite_visiter', 'bouton')}>
      <Svg d={D_CAL} t={20} l={2} /><span>Je veux le visiter</span>
    </button>
  );
  const curseur = (
    <Curseur cible={cible} doux={doux} repos={repos} verrou={verrou || !!question} Ico={Ico}
      onLache={s => repondre(s < 0 ? 'refuse' : 'interesse', 'glisse')}
      onMot={s => repondre(s < 0 ? 'refuse' : 'interesse', 'mot')} />
  );
  const actions: ActionsFiche = { onRetour: fermerFiche, onRepondre: a => repondre(a, 'fiche'), colonne: large };

  const atouts: string[] = [];
  if (courant) {
    if (courant.chambres) atouts.push(`${courant.chambres} chambre${courant.chambres > 1 ? 's' : ''}`);
    if (courant.terrasse) atouts.push('Terrasse');
    if (courant.balcon) atouts.push('Balcon');
    if (courant.jardin) atouts.push('Jardin');
    if (courant.parking) atouts.push('Parking');
    if (courant.ascenseur) atouts.push('Ascenseur');
    if (courant.cave) atouts.push('Cave');
    if (courant.gardien) atouts.push('Gardien');
    if (courant.traversant) atouts.push('Traversant');
  }

  const ecranFin = (
    <div className="dec-fin">
      <div className="dec-fin-h">
        <span className="dec-fin-ok"><Svg d={D_COCHE} t={30} l={2.6} /></span>
        <h2>{fait === 0 ? 'Vous êtes à jour' : fait === 1 ? 'C’est noté pour ce bien' : `C’est noté pour ces ${fait} biens`}</h2>
        <p>{fait === 0
          ? 'Il n’y a plus de nouveau bien à regarder pour le moment.'
          : nb('souhaite_visiter') > 0
            ? 'Votre conseiller a reçu vos réponses. Pour les visites, il revient vers vous avec un rendez-vous.'
            : 'Votre conseiller a reçu vos réponses. Elles orientent déjà les prochaines propositions.'}</p>
      </div>
      {fait > 0 && (
        <div className="dec-fin-t">
          <div><i style={{ background: BLEU }} /><span>Je veux visiter</span><b className="tab">{nb('souhaite_visiter')}</b></div>
          <div><i style={{ background: VERT }} /><span>Ça me plaît</span><b className="tab">{nb('interesse')}</b></div>
          <div><i style={{ background: ROUGE }} /><span>Pas pour moi</span><b className="tab">{nb('refuse')}</b></div>
          <div className="tot"><span>Au total</span><b className="tab">{fait}</b></div>
        </div>
      )}
      <div className="dec-fin-b">
        <button type="button" className="dec-fin-1" onClick={() => fermer()}>Revenir à mon espace</button>
        {fait > 0 && <button type="button" className="dec-fin-2" onClick={() => fermer('consultes')}>Voir mes biens consultés</button>}
      </div>
      <div className="dec-fin-a" aria-live="polite">{pastilleAnnul}</div>
    </div>
  );

  const photosC = courant?.photos || [];
  const chipNeuf = courant ? <span className="dec-neuf">{quand(courant.id)}</span> : null;

  return (
    <div className={'dec' + (large ? ' pc' : '') + (visible ? ' on' : '')} role="dialog" aria-modal="true" aria-label="Vos nouveaux biens"
      ref={racine} tabIndex={-1}>
      <header className="dec-tete">
        <img className="dec-logo" src="/logos/logo-emilio-800.png" alt="Emilio Immobilier" width={800} height={336} />
        {large ? (
          <>
            <div className="dec-prog">
              <b>Nouveaux biens</b>
              {total > 1 && total <= 12 && (
                <span className="dec-pts" aria-hidden="true">
                  {uniques.map((id, k) => <i key={id} className={fini || k < rang - 1 ? 'pt-fait' : k === rang - 1 ? 'pt-ici' : ''} />)}
                </span>
              )}
              <span className="tab">{compteur}</span>
            </div>
            <button type="button" className="dec-quitter" onClick={() => fermer()}>
              <Svg d={D_GAUCHE} t={18} /><span>Revenir à mon espace</span>
            </button>
          </>
        ) : (
          <div className="dec-tete-d">
            <span className="dec-cpt tab">{compteur}</span>
            <button type="button" className="dec-x" aria-label="Fermer et revenir à mon espace" onClick={() => fermer()}>
              <Svg d={D_CROIX} t={22} />
            </button>
          </div>
        )}
      </header>

      {fini ? ecranFin : courant ? (large ? (
        <div className="dec-scene">
          <div key={courant.id + '|' + i} className="dec-carte" style={styleCarte}>
            <div className="dec-gauche">
              <div className="dec-ph">
                <GalerieGlisse photos={photosC} p={p} onP={setP} variante="grand" haut={chipNeuf} />
              </div>
              {photosC.length > 1 && (
                <div className="dec-minis" ref={minis}>
                  {photosC.map((u, k) => (
                    <button key={k} type="button" className={'dec-mini' + (k === p ? ' on' : '')}
                      aria-label={`Photo ${k + 1}`} onClick={() => setP(k)}>
                      <img src={u} alt="" loading="lazy" draggable={false} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="dec-droite">
              {voir !== 'non' ? (
                <div className={'dec-col-fiche' + (voir === 'on' ? ' on' : '')}>{fiche(courant.id, actions)}</div>
              ) : (
                <div className="dec-col">
                  {infos}
                  {atouts.length > 0 && <div className="dec-atouts">{atouts.map(a => <span key={a}>{a}</span>)}</div>}
                  {courant.description && <p className="dec-extrait">{courant.description}</p>}
                  <div className="dec-vide" />
                  {visiter}
                  {curseur}
                  <div className="dec-pied" aria-live="polite">{pastilleAnnul}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="dec-scene">
          <div key={courant.id + '|' + i} className="dec-carte" style={styleCarte}>
            <div className="dec-ph">
              <GalerieGlisse photos={photosC} p={p} onP={setP} variante="carte" haut={chipNeuf} />
            </div>
            <div className="dec-infos">{infos}</div>
          </div>
          {visiter}
          {curseur}
          <div className="dec-pied" aria-live="polite">{pastilleAnnul}</div>
        </div>
      )) : <div className="dec-scene" />}

      {!large && voir !== 'non' && courant && (
        <div className={'dec-fiche' + (voir === 'on' ? ' on' : '')}>
          <div className="dec-fiche-in">{fiche(courant.id, actions)}</div>
        </div>
      )}

      {question && courant && (
        <div className={'dec-q' + (qEtat === 'on' ? ' on' : '') + (qEtat === 'sort' ? ' sort' : '')}>
          <div className="dec-q-voile" onClick={() => fermerQuestion(remettre)} />
          <div className="dec-q-boite" role="dialog" aria-modal="true" aria-label={FEUILLES[question].t}>
            <Question key={question} avis={question} bien={courant} photo={courant.photos?.[0] || null}
              pastilles={pastilles} Ico={Ico}
              onEnvoyer={(choix, mot) => conclure(question, texte(choix, mot))}
              onPasser={() => conclure(question, '')}
              onVersVisite={() => setQuestion('souhaite_visiter')} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ══ Les styles ═════════════════════════════════
   Posés dans la même balise <style> que ceux de l'espace (voir EspaceClient) :
   les couleurs de base (--encre, --or, --fond…) viennent de là. Le bleu des
   boutons est celui des maquettes validées. */
export const CSS_DECOUVERTE = `
html.dec-ouvert, html.dec-ouvert body{overflow:hidden !important; overscroll-behavior:none}
/* La feuille de l'espace, rangée sous le bas de l'écran, laisse remonter son
   ombre : on l'éteint tant qu'elle est fermée et que « Découvrir » est ouvert. */
html.dec-ouvert .feuille:not(.on){box-shadow:none}
.dec{position:fixed; inset:0; z-index:56; background:#f3f5f8; color:var(--encre);
  display:flex; flex-direction:column; overscroll-behavior:contain;
  padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px);
  opacity:0; transform:translateY(12px); transition:opacity .28s ease, transform .32s cubic-bezier(.22,.8,.3,1)}
.dec.on{opacity:1; transform:none}
.dec:focus{outline:none}
.dec .tab{font-variant-numeric:tabular-nums}
.dec button{font-family:inherit}

/* — l'en-tête — */
.dec-tete{flex:0 0 auto; height:60px; display:flex; align-items:center; justify-content:space-between;
  gap:10px; padding:0 6px 0 18px}
.dec-logo{height:30px; width:auto; display:block}
.dec-tete-d{display:flex; align-items:center; gap:2px}
.dec-cpt{padding:6px 12px; border-radius:999px; background:#fff; border:1px solid #e2e7ee;
  font-size:13px; font-weight:700; white-space:nowrap}
.dec-x{width:44px; height:44px; display:flex; align-items:center; justify-content:center;
  border-radius:50%; color:var(--encre)}

/* — la scène : la carte, le bouton « visiter », le curseur, la place de
   « Annuler mon dernier choix ? ». La photo prend ce qui reste. — */
.dec-scene{flex:1 1 auto; min-height:0; width:100%; max-width:480px; margin:0 auto;
  display:flex; flex-direction:column; gap:10px; padding:2px 12px 0; overflow-y:auto; overflow-x:hidden;
  overscroll-behavior:contain}
/* La carte prend la place qui reste, mais ne rétrécit jamais sous son
   contenu : sur un petit écran, c'est la scène qui défile, rien n'est coupé. */
.dec-carte{flex:1 0 auto; min-height:0; display:flex; flex-direction:column; background:#fff;
  border-radius:28px; overflow:hidden; will-change:transform;
  box-shadow:0 2px 4px rgba(20,35,58,.05), 0 26px 50px -28px rgba(20,35,58,.45)}
.dec-ph{position:relative; flex:1 1 auto; min-height:180px}
/* Posée en absolu : une hauteur en % dans deux flex imbriqués peut valoir
   zéro sur iPhone (voir PleinEcran dans EspaceClient). */
.dec-ph > .dg{position:absolute; inset:0; height:auto}
.dec-infos{flex:0 0 auto; padding:14px 18px 16px; display:flex; flex-direction:column; gap:6px}
.dec-l1{display:flex; align-items:center; justify-content:space-between; gap:8px 24px; flex-wrap:wrap}
.dec-prix{font-family:'Plus Jakarta Sans',sans-serif; font-size:27px; font-weight:800; letter-spacing:-.6px; white-space:nowrap; line-height:1.15}
.dec-voir{flex:0 0 auto; display:flex; align-items:center; gap:8px; min-height:46px; padding:0 18px;
  border:1px solid #d3dcea !important; border-radius:999px; background:#eef2f8; font-size:14.5px; font-weight:700; color:${BLEU}}
.dec-voir:hover{background:#e4eaf3}
.dec-titre{font-size:16px; font-weight:600; line-height:1.3}
.dec-meta{font-size:14px; color:#5b6678; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.dec-note{display:flex; align-items:center; gap:10px; margin-top:2px; font-size:13px; font-weight:600}
.dec-note-b{flex:0 0 72px; height:6px; border-radius:3px; background:#eef1f6; overflow:hidden}
.dec-note-b i{display:block; height:100%; border-radius:3px; background:${OR}}
.dec-neuf{position:absolute; z-index:3; top:26px; left:14px; padding:6px 11px; border-radius:999px;
  background:${OR}; color:#14233a; font-size:12px; font-weight:700; pointer-events:none}

.dec-visiter{flex:0 0 auto; height:52px; display:flex; align-items:center; justify-content:center; gap:10px;
  border:1.5px solid ${BLEU} !important; border-radius:16px; background:#fff; color:${BLEU};
  font-size:15.5px; font-weight:700}
.dec-visiter:hover:not(:disabled){background:#f4f7fb}
.dec-visiter:disabled{opacity:.55}
.dec-pied{flex:0 0 auto; height:62px; display:flex; align-items:center; justify-content:center}

/* — la galerie — */
.dg{position:relative; width:100%; height:100%; overflow:hidden; touch-action:pan-y;
  user-select:none; -webkit-user-select:none; cursor:grab; background:linear-gradient(148deg,#3a5178,#22314c)}
.dg.tient{cursor:grabbing}
.dg.zoom{cursor:zoom-in}
.dg-bande{position:absolute; inset:0; display:flex; will-change:transform}
.dg-c{flex:0 0 100%; width:100%; height:100%; overflow:hidden; background:#dfe5ee}
.dg-c img{width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; -webkit-user-drag:none}
.dg-vide{position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.55)}
.dg-segs{position:absolute; z-index:2; top:12px; left:14px; right:14px; display:flex; gap:4px; pointer-events:none}
.dg-segs span{flex:1 1 0; height:3px; border-radius:2px; background:#fff; opacity:.45; transition:opacity .3s}
.dg-segs span.on{opacity:1}
.dg-n{position:absolute; z-index:3; top:26px; right:14px; padding:6px 11px; border-radius:999px;
  background:rgba(20,35,58,.74); color:#fff; font-size:12px; font-weight:600; pointer-events:none}
.dg-f{position:absolute; z-index:3; top:0; bottom:0; margin:auto 0; width:44px; height:44px; padding:0;
  display:flex; align-items:center; justify-content:center; border-radius:50%;
  background:rgba(255,255,255,.92); color:#14233a; box-shadow:0 4px 12px -6px rgba(20,35,58,.5);
  transition:opacity .25s}
.dg-f.g{left:10px} .dg-f.d{right:10px}
.dg-f.cache{opacity:0; pointer-events:none}
.dg-fiche{height:clamp(240px,42vh,420px)}
.dg-fiche .dg-segs{top:calc(8px + env(safe-area-inset-top,0px))}
.dg-fiche .dg-n{top:auto; bottom:14px}
.dg-grand .dg-segs{top:16px; left:20px; right:20px; gap:5px}
.dg-grand .dg-segs span{height:4px}
.dg-grand .dg-n{top:32px; right:20px; font-size:13px; padding:7px 13px}
.dg-grand .dg-f{width:48px; height:48px}
.dg-grand .dg-f.g{left:18px} .dg-grand .dg-f.d{right:18px}
@media (hover:hover){ .dg-f:hover{background:#fff} }

/* — le curseur — */
.dec-cur{position:relative; flex:0 0 auto; height:80px; border-radius:40px; background:#fff;
  border:1px solid #e2e7ee; box-shadow:0 10px 24px -18px rgba(20,35,58,.4)}
.dec-cur-t{position:absolute; inset:0; border-radius:40px; pointer-events:none; opacity:0}
.dec-cur-t.g{background:#fdecea} .dec-cur-t.d{background:#e7f6ed}
.dec-cur-m{position:absolute; top:8px; bottom:8px; width:calc(50% - 42px); max-width:140px;
  display:flex; align-items:center; gap:6px; border-radius:32px; font-size:14px; font-weight:700; line-height:1.15;
  white-space:nowrap}
.dec-cur-m.g{left:6px; padding-left:12px; color:${ROUGE}}
.dec-cur-m.d{right:6px; padding-right:12px; justify-content:flex-end; text-align:right; color:${VERT}}
.dec-cur-m:disabled{cursor:default}
.dec-halo{position:absolute; top:6px; left:calc(50% - 33px); width:66px; height:66px; border-radius:50%;
  border:3px solid ${OR}; pointer-events:none; opacity:0; transform:scale(.9)}
.dec-cur.repos .dec-halo{animation:dec-halo 2.2s infinite}
.dec-rond{position:absolute; top:6px; left:calc(50% - 33px); width:66px; height:66px; z-index:2;
  touch-action:none; cursor:grab; user-select:none; -webkit-user-select:none; will-change:transform}
.dec-rond:active{cursor:grabbing}
.dec-rond-in{position:absolute; inset:0; border-radius:50%; display:flex; align-items:center; justify-content:center;
  color:#fff; border:3px solid ${OR}; background:${BLEU}; box-shadow:0 10px 22px -8px rgba(20,35,58,.65)}
.dec-cur.repos .dec-rond-in{animation:dec-balance 1.1s cubic-bezier(.45,0,.55,1) -.55s infinite alternate}
.dec-ch{position:absolute; top:0; bottom:0; display:flex; align-items:center; opacity:.8}
.dec-ch.g{left:3px} .dec-ch.d{right:3px}
@keyframes dec-balance{from{transform:translateX(-10px)} to{transform:translateX(10px)}}
@keyframes dec-halo{
  0%{transform:scale(.9); opacity:0; animation-timing-function:ease-out}
  25%{transform:scale(1.22); opacity:.55; animation-timing-function:ease-out}
  75%,100%{transform:scale(1.6); opacity:0}
}

/* — « Annuler mon dernier choix ? » : elle monte, l'anneau doré se remplit
   en cinq secondes, puis elle se resserre vers son centre et s'efface. — */
.dec-annul{display:flex; justify-content:center; transition:transform .4s cubic-bezier(.22,.8,.3,1), opacity .3s ease}
.dec-annul.a-monte{transform:translateY(14px) scale(.94); opacity:0}
.dec-annul.a-plein{transform:none; opacity:1}
.dec-annul.a-sort{transform:scale(.2); opacity:0; transition:transform .42s cubic-bezier(.55,0,.8,.2), opacity .42s ease-in}
.dec-annul button{display:flex; align-items:center; gap:10px; height:50px; padding:0 20px 0 8px;
  border:1px solid #e2e7ee !important; border-radius:999px; background:#fff; color:${BLEU};
  font-size:14.5px; font-weight:700; white-space:nowrap; box-shadow:0 16px 34px -18px rgba(20,35,58,.6)}
.dec-annul-r{position:relative; width:36px; height:36px; display:flex; align-items:center; justify-content:center;
  border-radius:50%; background:#f5f7fa}
.dec-annul-r svg:first-child{position:absolute; left:0; top:0; transform:rotate(-90deg)}
.dec-annul-r svg:last-child{position:relative}

/* — la fiche, ouverte d'ici (téléphone) — */
.dec-fiche{position:fixed; inset:0; z-index:4; background:#fff; overflow-y:auto; overscroll-behavior:contain;
  -webkit-overflow-scrolling:touch; opacity:0; transform:translateX(28px);
  transition:opacity .28s ease, transform .32s cubic-bezier(.22,.8,.3,1)}
.dec-fiche.on{opacity:1; transform:none}
.dec-fiche-in{max-width:680px; margin:0 auto; min-height:100%; display:flex; flex-direction:column}
.dec-fiche-in > .fiche-droite{flex:1 0 auto; display:flex; flex-direction:column}
.dec-fiche-in .corps-f{flex:1 0 auto}
.dec-f-retour{position:absolute; z-index:6; top:calc(12px + env(safe-area-inset-top,0px)); left:12px;
  height:44px; display:flex; align-items:center; gap:4px; padding:0 14px 0 8px; border-radius:999px;
  background:rgba(255,255,255,.94); font-size:14px; font-weight:700; color:#14233a;
  box-shadow:0 4px 12px -6px rgba(20,35,58,.5)}
.dec-f-haut{padding:18px 20px 0}
.dec-f-retour.col{position:static; background:#fff; border:1px solid #d5dce6 !important; box-shadow:none; height:40px}
.dec-f-bas{position:sticky; bottom:0; z-index:7; margin-top:auto; background:#fff; border-top:1px solid #e2e7ee;
  padding:10px 12px calc(12px + env(safe-area-inset-bottom,0px)); display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px}
.dec-f-bas button{min-height:70px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px;
  border-radius:16px; background:#fff; font-size:14.5px; font-weight:700; line-height:1.15; text-align:center; padding:6px 4px}
.dec-f-bas .non{border:1px solid #f3d0cc !important; color:${ROUGE}}
.dec-f-bas .vis{background:${BLEU}; color:#fff}
.dec-f-bas .oui{border:1px solid #c4e6d1 !important; color:${VERT}}

/* — la question — */
.dec-q{position:fixed; inset:0; z-index:8}
.dec-q-voile{position:absolute; inset:0; background:rgba(15,27,45,.5); opacity:0; transition:opacity .4s ease}
.dec-q.on .dec-q-voile{opacity:1}
.dec-q.sort .dec-q-voile{opacity:0; transition:opacity .36s ease}
.dec-q-boite{position:absolute; left:0; right:0; bottom:0; max-height:calc(100% - 24px); overflow-y:auto;
  overscroll-behavior:contain; background:#fff; border-radius:28px 28px 0 0;
  padding:10px 20px calc(18px + env(safe-area-inset-bottom,0px)); display:flex; flex-direction:column; gap:16px;
  box-shadow:0 -20px 40px -24px rgba(20,35,58,.4); transform:translateY(104%);
  transition:transform .5s cubic-bezier(.22,.8,.3,1)}
.dec-q.on .dec-q-boite{transform:none}
.dec-q.sort .dec-q-boite{transform:translateY(104%); transition:transform .36s cubic-bezier(.5,0,.75,0)}
.dec-q-poignee{align-self:center; width:40px; height:4px; border-radius:2px; background:#d5dce6; flex:0 0 auto}
.dec-q-tete{display:flex; align-items:center; gap:12px}
.dec-q-mini{flex:0 0 auto; width:56px; height:56px; border-radius:14px; overflow:hidden; background:#dfe5ee;
  display:flex; align-items:center; justify-content:center; color:#8a97aa}
.dec-q-mini img{width:100%; height:100%; object-fit:cover; display:block}
.dec-q-bien{flex:1 1 auto; min-width:0; display:flex; flex-direction:column}
.dec-q-bien b, .dec-q-bien span{white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.dec-q-bien b{font-size:14.5px}
.dec-q-bien span{font-size:13px; color:#5b6678}
.dec-q-tag{flex:0 0 auto; padding:5px 10px; border-radius:999px; font-size:12px; font-weight:700; white-space:nowrap}
.dec-q-tag.refuse{color:${ROUGE}; background:#fdecea; border:1px solid #f3d0cc}
.dec-q-tag.interesse{color:${VERT}; background:#e7f6ed; border:1px solid #c4e6d1}
.dec-q-tag.souhaite_visiter{color:${BLEU}; background:#eef2f8; border:1px solid #d3dcea}
.dec-q-txt h2{margin:0; font-family:'Plus Jakarta Sans',sans-serif; font-size:22px; font-weight:800; letter-spacing:-.4px; line-height:1.2}
.dec-q-txt p{margin:6px 0 0; font-size:14px; line-height:1.5; color:#5b6678}
.dec-chips{display:flex; flex-wrap:wrap; gap:8px}
.dec-chip{display:flex; align-items:center; gap:6px; min-height:44px; padding:0 15px; border-radius:999px;
  border:1px solid #d5dce6 !important; background:#fff; color:#14233a; font-size:14px; font-weight:600;
  transition:background .2s, color .2s, border-color .2s}
.dec-chip.on{background:${BLEU}; color:#fff; border-color:${BLEU} !important}
.dec-mot{display:flex; flex-direction:column; gap:6px; font-size:13px; font-weight:600; color:#2a3a52}
.dec-mot textarea{font-family:inherit; font-size:16px; padding:10px 12px; border:1px solid #d5dce6; border-radius:14px;
  resize:none; color:#14233a; outline:none}
.dec-mot textarea:focus{border-color:${BLEU}}
.dec-ajout{align-self:flex-start; display:flex; align-items:center; gap:6px; min-height:44px; padding:0 2px;
  font-size:14px; font-weight:700; color:${BLEU}}
.dec-vv{display:flex; align-items:center; gap:12px; min-height:62px; padding:10px 14px; border:1px solid #d3dcea !important;
  border-radius:16px; background:#eef2f8; text-align:left; color:#14233a}
.dec-vv-i{flex:0 0 auto; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  background:${BLEU}; color:#fff}
.dec-vv-t{flex:1 1 auto; display:flex; flex-direction:column}
.dec-vv-t b{font-size:14.5px}
.dec-vv-t span{font-size:13px; color:#5b6678; line-height:1.4}
.dec-q-pied{display:flex; flex-direction:column; gap:4px}
.dec-envoyer{min-height:54px; border-radius:16px; font-size:15.5px; font-weight:700; background:${BLEU}; color:#fff;
  transition:background .25s, color .25s}
.dec-envoyer:disabled{background:#e2e7ee; color:#7d8a9c; cursor:default}
.dec-passer{min-height:44px; font-size:14px; font-weight:600; color:#5b6678}

/* — la fin — */
.dec-fin{flex:1 1 auto; min-height:0; overflow-y:auto; width:100%; max-width:480px; margin:0 auto;
  padding:16px 16px 0; display:flex; flex-direction:column; gap:16px}
.dec-fin-h{background:${BLEU}; border-radius:28px; padding:26px 22px; display:flex; flex-direction:column;
  align-items:center; gap:10px; text-align:center; color:#fff}
.dec-fin-ok{width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  background:${OR}; color:#14233a}
.dec-fin-h h2{margin:4px 0 0; font-family:'Plus Jakarta Sans',sans-serif; font-size:23px; font-weight:800; letter-spacing:-.4px; color:#fff}
.dec-fin-h p{margin:0; font-size:14.5px; line-height:1.5; color:#d8e0eb}
.dec-fin-t{background:#fff; border-radius:22px; padding:6px 18px;
  box-shadow:0 1px 2px rgba(20,35,58,.04), 0 12px 28px -22px rgba(20,35,58,.35)}
.dec-fin-t > div{display:flex; align-items:center; gap:12px; min-height:52px; border-bottom:1px solid #eef1f6}
.dec-fin-t > div:last-child{border-bottom:0}
.dec-fin-t i{width:10px; height:10px; border-radius:50%; flex:0 0 auto}
.dec-fin-t span{flex:1 1 auto; font-size:15px}
.dec-fin-t .tot span{font-weight:700}
.dec-fin-t b{font-size:17px}
.dec-fin-b{display:flex; flex-direction:column; gap:4px}
.dec-fin-1{min-height:54px; border-radius:16px; background:${BLEU}; color:#fff; font-size:15.5px; font-weight:700}
.dec-fin-2{min-height:44px; font-size:14px; font-weight:600; color:#5b6678}
.dec-fin-a{height:62px; flex:0 0 auto; display:flex; align-items:center; justify-content:center}

/* — de la tablette à l'ordinateur : la question devient une fenêtre — */
@media(min-width:640px){
  .dec-q{display:flex; align-items:center; justify-content:center; padding:24px}
  .dec-q-boite{position:relative; left:auto; right:auto; bottom:auto; width:580px; max-width:100%; max-height:calc(100vh - 48px);
    border-radius:26px; padding:28px 30px 24px; gap:18px; box-shadow:0 30px 70px -30px rgba(15,27,45,.6);
    transform:translateY(18px) scale(.97); opacity:0;
    transition:transform .45s cubic-bezier(.22,.8,.3,1), opacity .35s ease}
  .dec-q.on .dec-q-boite{transform:none; opacity:1}
  .dec-q.sort .dec-q-boite{transform:translateY(18px) scale(.97); opacity:0; transition:transform .3s ease-in, opacity .3s ease-in}
  .dec-q-poignee{display:none}
  .dec-q-mini{width:64px; height:64px; border-radius:16px}
  .dec-q-bien b{font-size:16px} .dec-q-bien span{font-size:14px}
  .dec-q-tag{font-size:13px; padding:6px 12px}
  .dec-q-txt h2{font-size:24px} .dec-q-txt p{font-size:15px}
  .dec-q-pied{flex-direction:row-reverse; align-items:center; justify-content:flex-start; gap:10px}
  .dec-envoyer{padding:0 24px; min-height:52px}
  .dec-passer{padding:0 18px; min-height:48px}
}

/* — l'ordinateur : deux colonnes — */
.dec.pc .dec-tete{height:80px; padding:0 max(24px, calc((100% - 1120px) / 2)); display:grid;
  grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)}
.dec.pc .dec-logo{height:38px}
.dec-prog{display:flex; align-items:center; gap:14px}
.dec-prog b{font-family:'Plus Jakarta Sans',sans-serif; font-size:17px; font-weight:800}
.dec-prog > span:last-child{font-size:14px; font-weight:700; color:#5b6678}
.dec-pts{display:flex; gap:5px}
.dec-pts i{width:26px; height:5px; border-radius:3px; background:#d5dce6; transition:background .3s}
.dec-pts i.pt-fait{background:${BLEU}} .dec-pts i.pt-ici{background:${OR}}
.dec-quitter{justify-self:end; display:flex; align-items:center; gap:8px; min-height:44px; padding:0 16px;
  border:1px solid #d5dce6 !important; border-radius:999px; background:#fff; font-size:14px; font-weight:700; color:#14233a}
.dec-quitter:hover{background:#f6f8fb}
.dec.pc .dec-scene{max-width:1168px; padding:0 24px 24px; overflow:visible}
.dec.pc .dec-carte{flex:1 1 auto; min-height:min(520px, calc(100vh - 104px)); max-height:740px; display:grid;
  grid-template-columns:minmax(0,1fr) 440px; border-radius:28px;
  box-shadow:0 2px 4px rgba(20,35,58,.05), 0 30px 60px -36px rgba(20,35,58,.45)}
.dec-gauche{display:flex; flex-direction:column; min-height:0; min-width:0}
.dec.pc .dec-ph{flex:1 1 auto; min-height:0}
.dec-minis{flex:0 0 auto; display:flex; gap:10px; padding:10px 18px; overflow-x:auto; scrollbar-width:thin}
.dec-mini{flex:0 0 auto; width:104px; height:72px; padding:0; border-radius:12px; overflow:hidden;
  border:3px solid transparent !important; opacity:.7; transition:border-color .25s, opacity .25s; background:#dfe5ee}
.dec-mini.on{border-color:${OR} !important; opacity:1}
.dec-mini:hover{opacity:1}
.dec-mini img{width:100%; height:100%; object-fit:cover; display:block}
.dec-droite{position:relative; min-height:0; border-left:1px solid #eef1f6; display:flex; flex-direction:column}
.dec-col{flex:1 1 auto; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:12px; padding:32px 32px 0}
.dec.pc .dec-prix{font-size:34px; letter-spacing:-.8px}
.dec.pc .dec-titre{font-size:20px; font-weight:700; margin-top:4px}
.dec.pc .dec-meta{font-size:15px; white-space:normal}
.dec.pc .dec-note{font-size:13.5px}
.dec.pc .dec-note-b{flex-basis:96px}
.dec-atouts{display:flex; flex-wrap:wrap; gap:6px}
.dec-atouts span{padding:5px 11px; border-radius:999px; background:#f3f5f8; border:1px solid #e2e7ee; font-size:13px; font-weight:500; color:#2a3a52}
.dec-extrait{margin:2px 0 0; font-size:14px; line-height:1.55; color:#2a3a52; display:-webkit-box; -webkit-line-clamp:4;
  -webkit-box-orient:vertical; overflow:hidden; white-space:pre-line}
.dec-vide{flex:1 1 auto; min-height:4px}
.dec.pc .dec-pied{height:58px}
.dec-col-fiche{flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; display:flex; flex-direction:column;
  opacity:0; transition:opacity .25s ease}
.dec-col-fiche.on{opacity:1}
.dec-col-fiche > .fiche-droite{flex:1 0 auto; display:flex; flex-direction:column}
.dec-col-fiche .corps-f{flex:1 0 auto}
.dec-col-fiche .dec-f-bas{padding:12px 24px 18px}
.dec.pc .dec-fin{max-width:560px; padding-top:28px}
.dec.pc .dec-fin-h{padding:30px 28px}
.dec.pc .dec-fin-h h2{font-size:26px}
.dec.pc .dec-fin-b{flex-direction:row-reverse; gap:10px}
.dec.pc .dec-fin-b button{flex:1 1 0; min-height:52px}
.dec.pc .dec-fin-2{border:1px solid #d5dce6 !important; border-radius:16px; background:#fff; color:#14233a; font-size:15px; font-weight:700}
@media (max-height:760px){ .dec.pc .dec-extrait{display:none} }

/* — un téléphone court (iPhone SE, barres du navigateur affichées) : tout
   se resserre un peu pour que la pastille « Annuler » reste visible. — */
@media (max-height:700px){
  .dec:not(.pc) .dec-tete{height:54px}
  .dec:not(.pc) .dec-scene{gap:8px}
  .dec:not(.pc) .dec-ph{min-height:140px}
  .dec:not(.pc) .dec-infos{padding:10px 16px 12px; gap:4px}
  .dec:not(.pc) .dec-prix{font-size:24px}
  .dec:not(.pc) .dec-voir{min-height:42px}
  .dec:not(.pc) .dec-titre{white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .dec:not(.pc) .dec-visiter{height:46px}
  .dec:not(.pc) .dec-pied, .dec:not(.pc) .dec-fin-a{height:56px}
}

@media (prefers-reduced-motion:reduce){
  .dec-cur.repos .dec-halo, .dec-cur.repos .dec-rond-in{animation:none}
  .dec, .dec-fiche, .dec-col-fiche{transition:opacity .2s ease}
  /* L'anneau n'est pas un décor : il dit le temps qu'il reste pour annuler.
     globals.css coupe toutes les transitions ; celle-ci est rétablie. */
  .dec-annul.a-plein .dec-annul-r circle:last-of-type{transition:stroke-dashoffset ${ANNUL_MS / 1000}s linear !important}
}
`;
