'use client';

/* La présentation de l'espace acheteur (V3.115). Elle s'ouvre toute seule à
   la première visite, puis se retrouve derrière « Comment ça marche ? ».
   Une feuille qui monte du bas (au centre sur ordinateur), six écrans
   « Suivant », une animation par écran ; la croix la ferme pour de bon.
   Aux couleurs et à la police du site emilio-immo.com, à la demande
   d'Alexandre (maquette : canevas « Bienvenue dans l'espace acheteur »,
   variante 1). Aucun mot de métier (AGENTS.md §5), aucun site nommé. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent } from 'react';
import s from './Bienvenue.module.css';

type Ecran = { sur: string; titre: string; texte: string; fort?: string; astuce?: string };

const ecransPour = (prenom: string): Ecran[] => [
  { sur: 'Votre espace personnel', titre: prenom ? `Bienvenue, ${prenom}` : 'Bienvenue',
    texte: 'Ici, tout votre projet d’achat au même endroit. Votre espace est privé et sans mot de passe\u00a0: ce lien vous suffit.' },
  { sur: 'Chaque jour', titre: 'Nous analysons tout le marché pour vous',
    texte: 'Les nouvelles annonces, nos biens en avant-première, ceux de nos partenaires, même ceux qui ne sont pas en ligne\u00a0: tout passe au crible de vos critères.' },
  { sur: 'Vos biens', titre: 'Les biens retenus arrivent ici',
    texte: 'Chacun avec notre avis et sa correspondance avec votre recherche, parfois avant même d’être en ligne. Votre téléphone peut vous prévenir dès qu’un bien arrive.' },
  { sur: 'Votre avis', titre: 'Votre avis affine la recherche',
    texte: 'Au début, les propositions sont assez larges. «\u00a0Ça me plaît\u00a0», «\u00a0Pas pour moi\u00a0», un commentaire\u00a0: tout est lu et pris en compte.',
    fort: 'Plus vous répondez, plus les biens vous ressemblent.' },
  { sur: 'Vos critères', titre: 'Vos critères, en direct',
    texte: 'Un budget qui bouge, une envie de balcon\u00a0? Modifiez vos critères vous-même, à tout moment. Votre conseiller est prévenu aussitôt, et la recherche repart sur vos nouveaux critères.' },
  { sur: 'Vos visites', titre: 'Visites et carte, en un geste',
    texte: 'Proposez vos créneaux depuis la fiche d’un bien\u00a0: votre conseiller confirme, et le rendez-vous s’ajoute à votre agenda. Tous vos biens vous attendent aussi sur une carte.',
    astuce: 'Astuce\u00a0: ajoutez l’espace à l’écran d’accueil de votre téléphone.' },
];
const NB = 6;

/* L'animation est dessinée à 342 × 230 et mise à la largeur de sa place. */
function useEchelle(base: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const maj = () => setK(el.clientWidth > 0 ? el.clientWidth / base : 1);
    maj();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(maj);
    ro.observe(el);
    return () => ro.disconnect();
  }, [base]);
  return [ref, k] as const;
}

const Svg = ({ d, t = 18, w = 2.2, style }: { d: string; t?: number; w?: number; style?: CSSProperties }) => (
  <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}
    strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true"><path d={d} /></svg>
);
const D = {
  cloche: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  coeur: 'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z',
  agenda: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  repere: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  maison: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  oeilBarre: 'M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20',
  reglages: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  check: 'M20 6 9 17l-5-5',
  etincelles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  telephone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
  croix: 'M6 6l12 12M18 6 6 18',
  fleche: 'M5 12h14M13 6l6 6-6 6',
  flecheG: 'M19 12H5M11 6l-6 6 6 6',
  ok: 'M5 12.5l4.5 4.5L19 7.5',
  question: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
};

/* ── 0 · Bienvenue : la maison au centre, les quatre atouts en orbite ── */
function Scene0() {
  const orbite = [
    { x: '50%', y: '0%', c: '#E68B23', d: D.cloche },
    { x: '100%', y: '50%', c: '#15803d', d: D.coeur },
    { x: '50%', y: '100%', c: '#6d28d9', d: D.agenda },
    { x: '0%', y: '50%', c: '#22497D', d: D.repere },
  ];
  return (
    <div className={s.s0}>
      <div className={`${s.anneau} ${s.tourne60}`} style={{ width: 200, height: 200, margin: '-100px 0 0 -100px' }} />
      <div className={s.anneau} style={{ width: 132, height: 132, margin: '-66px 0 0 -66px' }} />
      <div className={s.orbite}>
        {orbite.map((o, i) => (
          <span key={i} className={s.satellite} style={{ left: o.x, top: o.y, color: o.c }}><Svg d={o.d} t={19} w={2.1} /></span>
        ))}
      </div>
      <span className={s.maisonPulse} />
      <span className={s.maison}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={D.maison} /><path d="M9 21v-6h6v6" stroke="#E68B23" strokeWidth="2.2" />
        </svg>
      </span>
    </div>
  );
}

/* ── 1 · Tout le marché, chaque jour : le balayage tourne, les biens s'allument ── */
function Scene1() {
  const reperes = [
    { x: '30%', y: '34%', c: '#E68B23', r: '0s' }, { x: '72%', y: '28%', c: '#22497D', r: '.9s' },
    { x: '80%', y: '70%', c: '#E68B23', r: '1.8s' }, { x: '24%', y: '74%', c: '#22497D', r: '2.7s' },
    { x: '58%', y: '82%', c: '#E68B23', r: '3.6s' }, { x: '44%', y: '24%', c: '#22497D', r: '4.5s' },
  ];
  const sources = [{ l: 'Nouvelles annonces', r: '.2s' }, { l: 'Biens en avant-première', r: '.45s' }, { l: 'Nos partenaires', r: '.7s' }];
  return (
    <div className={s.s1}>
      <svg width="342" height="230" viewBox="0 0 342 230" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
        <path d="M-10 160 C 60 130, 120 190, 200 150 S 300 110, 360 140" fill="none" stroke="#CFE0F2" strokeWidth="16" strokeLinecap="round" />
        <path d="M0 60 H342 M0 112 H342 M0 196 H342 M52 0 V230 M140 0 V230 M232 0 V230 M300 0 V230" stroke="#fff" strokeWidth="5" />
        <path d="M90 0 L190 230 M260 0 L170 230" stroke="#fff" strokeWidth="3" />
      </svg>
      <div className={s.radar} />
      <div className={s.cercle} style={{ width: 120, height: 120, margin: '-60px 0 0 -60px' }} />
      <div className={s.cercle} style={{ width: 220, height: 220, margin: '-110px 0 0 -110px' }} />
      {reperes.map((p, i) => (
        <span key={i} className={s.repere} style={{ left: p.x, top: p.y, animationDelay: p.r }}>
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" fill={p.c} /><circle cx="12" cy="10" r="3" fill="#fff" /></svg>
        </span>
      ))}
      <span className={s.centre} />
      <div className={s.sources}>
        {sources.map(t => <span key={t.l} className={s.source} style={{ animationDelay: t.r }}><i />{t.l}</span>)}
      </div>
      <span className={s.enCours}><i />Analyse du marché en cours</span>
    </div>
  );
}

/* ── 2 · Les biens arrivent : la notification tombe, la fiche se pose ── */
function Scene2() {
  return (
    <div className={s.s2}>
      <div className={s.carteFond} />
      <div className={s.carteBien}>
        <div className={s.photo}>
          <Svg d={D.maison} t={34} w={1.7} style={{ color: '#8FA3BF' }} />
          <span className={s.pastille} style={{ left: 8, top: 8, height: 20, padding: '0 8px', background: '#E68B23', color: '#fff' }}>Nouveau</span>
          <span className={s.pastille} style={{ right: 8, bottom: 8, height: 22, padding: '0 8px', background: 'rgba(255,255,255,.95)', color: '#13243D' }}>96 % pour vous</span>
        </div>
        <div style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <b className={s.prixL}>895 000 €</b>
          <span className={s.petit}>5 pièces · 118 m² · Clamart</span>
        </div>
      </div>
      <div className={s.notif}>
        <span className={s.cloche}><Svg d={D.cloche} t={17} /></span>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <b style={{ fontSize: 12.5, fontWeight: 800 }}>Un nouveau bien pour vous</b>
          <span className={s.petit}>Clamart · à l’instant</span>
        </span>
      </div>
    </div>
  );
}

/* ── 3 · Votre avis : le doigt touche « Ça me plaît », la justesse monte ── */
function Scene3() {
  return (
    <div className={s.s3}>
      <div className={`${s.ligneBien} ${s.monte}`} style={{ animationDelay: '.05s' }}>
        <span style={{ width: 64, height: 46, borderRadius: 10, background: 'linear-gradient(135deg,#C9D5E6,#E8EFF8)', flexShrink: 0 }} />
        <span style={{ display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 13.5, fontWeight: 800 }}>895 000 €</b><span className={s.petit}>5 pièces · Clamart</span></span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: '#A95808' }}>{'Qu’en pensez-vous\u00a0?'}</span>
      </div>
      <div className={`${s.avis3} ${s.monte}`} style={{ animationDelay: '.2s' }}>
        <span className={`${s.avisB} ${s.appui}`} style={{ background: '#dcfce7', color: '#15803d' }}>
          <Svg d={D.coeur} />Ça me plaît<span className={s.tap} />
        </span>
        <span className={s.avisB} style={{ background: '#ede9fe', color: '#6d28d9' }}><Svg d={D.agenda} />Je veux visiter</span>
        <span className={s.avisB} style={{ background: '#f3e8e6', color: '#8a5a54' }}><Svg d={D.oeilBarre} />Pas pour moi</span>
      </div>
      <div className={`${s.justesse} ${s.monte}`} style={{ animationDelay: '.35s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#46566B' }}>Vos prochains biens vous ressemblent</span>
          <span className={s.chiffres}><b className={s.avant46}>46 %</b><b className={s.apres93}>93 %</b></span>
        </div>
        <span className={s.jauge}><i /></span>
      </div>
    </div>
  );
}

/* ── 4 · Vos critères en direct : le budget glisse, « Balcon » s'allume ── */
function Scene4() {
  return (
    <div className={s.s4}>
      <div className={`${s.criteres} ${s.monte}`} style={{ animationDelay: '.05s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, background: '#E8EFF8', color: '#22497D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Svg d={D.reglages} t={15} /></span>
          <b style={{ fontSize: 13, fontWeight: 800 }}>Mes critères</b>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#5B6B80' }}>Budget maximum</span>
          <span className={s.budget}><b className={s.avantB}>850 000 €</b><b className={s.apresB}>900 000 €</b></span>
        </div>
        <span className={s.glissiere}><i /><span className={s.curseur} /></span>
        <div className={s.puces}>
          <span className={s.puce}>Jardin</span>
          <span className={`${s.puce} ${s.puceVive}`}>+ Balcon</span>
          <span className={s.puce}>Calme</span>
        </div>
      </div>
      <div className={s.prevenu}>
        <span className={s.ok}><Svg d={D.check} t={13} w={3} style={{ color: '#fff' }} /></span>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <b style={{ fontSize: 11.5, fontWeight: 800 }}>Votre conseiller est prévenu</b>
          <span style={{ fontSize: 10.5, color: '#C9D5E6' }}>La recherche suit vos nouveaux critères</span>
        </span>
      </div>
    </div>
  );
}

/* ── 5 · Visites et carte : le rendez-vous s'ajoute, les biens sautillent ── */
function Scene5() {
  const pins = [
    { x: '18%', y: '22%', l: '895 k€', f: '#E68B23', t: '#13243D', r: '0s' },
    { x: '56%', y: '48%', l: '920 k€', f: '#22497D', t: '#fff', r: '.5s' },
    { x: '30%', y: '62%', l: '870 k€', f: '#22497D', t: '#fff', r: '1s' },
  ];
  return (
    <div className={s.s5}>
      <div className={`${s.agenda} ${s.monte}`} style={{ animationDelay: '.05s' }}>
        <div className={s.agendaH}>SAMEDI</div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '6px 8px' }}>
          <b style={{ fontSize: 34, lineHeight: 1, fontWeight: 800 }}>18</b>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#46566B' }}>octobre · 10 h 30</span>
          <span style={{ fontSize: 10.5, color: '#5B6B80' }}>Visite · 5 pièces, Clamart</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8, borderTop: '1px solid #E8EDF3', fontSize: 10.5, fontWeight: 800, color: '#15803d' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path className={s.coche} d={D.check} /></svg>
          Ajouté à votre agenda
        </div>
      </div>
      <div className={`${s.miniCarte} ${s.monte}`} style={{ animationDelay: '.2s' }}>
        <svg width="170" height="202" viewBox="0 0 170 202" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
          <path d="M-10 140 C 40 120, 80 170, 180 120" fill="none" stroke="#CFE0F2" strokeWidth="12" strokeLinecap="round" />
          <path d="M0 50 H170 M0 100 H170 M0 170 H170 M40 0 V202 M100 0 V202 M150 0 V202" stroke="#fff" strokeWidth="4" />
        </svg>
        {pins.map(p => (
          <span key={p.l} className={s.prixPin} style={{ left: p.x, top: p.y, animationDelay: p.r }}>
            <span style={{ background: p.f, color: p.t }}>{p.l}</span><i style={{ background: p.f }} />
          </span>
        ))}
        <span className={s.etiquette}>Vos biens sur la carte</span>
      </div>
    </div>
  );
}

const SCENES = [Scene0, Scene1, Scene2, Scene3, Scene4, Scene5];

function Illustration({ n }: { n: number }) {
  const [ref, k] = useEchelle(342);
  const Scene = SCENES[n] || Scene0;
  return (
    <div ref={ref} className={s.illu}>
      <div className={s.scene} style={{ transform: `scale(${k})` }} aria-hidden="true"><Scene /></div>
    </div>
  );
}

export default function Bienvenue({ prenom, conseiller, auto, onVu, onFini }: {
  prenom: string;
  /* Le prénom du conseiller, sur ordinateur (« Alexandre, votre conseiller »). */
  conseiller?: string;
  /* Ouverte d'elle-même (première visite) : une fois fermée, un mot dit où la retrouver. */
  auto: boolean;
  /* Fermée (la croix, Échap ou « C'est parti ») : elle ne reviendra plus d'elle-même. */
  onVu: () => void;
  /* Tout est fini : la couche peut partir. */
  onFini: () => void;
}) {
  const ecrans = ecransPour((prenom || '').trim());
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [phase, setPhase] = useState<'ouvert' | 'part' | 'note'>('ouvert');
  const fenetre = useRef<HTMLDivElement>(null);
  const toucher = useRef<{ x: number; y: number } | null>(null);
  const e = ecrans[i];
  const dernier = i === NB - 1;

  const fermer = useCallback(() => {
    if (phase !== 'ouvert') return;
    onVu();
    setPhase('part');
    window.setTimeout(() => (auto ? setPhase('note') : onFini()), 380);
  }, [phase, auto, onVu, onFini]);
  const suivant = useCallback(() => {
    if (i === NB - 1) { fermer(); return; }
    setDir(1); setI(i + 1);
  }, [i, fermer]);
  const retour = useCallback(() => {
    if (i === 0) return;
    setDir(-1); setI(i - 1);
  }, [i]);

  /* Au clavier, sur ordinateur : les flèches, et Échap pour fermer. */
  useEffect(() => {
    if (phase !== 'ouvert') return;
    const f = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') fermer();
      else if (ev.key === 'ArrowRight') suivant();
      else if (ev.key === 'ArrowLeft') retour();
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [phase, fermer, suivant, retour]);

  /* Le focus va sur la fenêtre (lecteur d'écran, clavier), pas sur un bouton :
     pas de contour à l'ouverture. */
  useEffect(() => { if (phase === 'ouvert') fenetre.current?.focus({ preventScroll: true }); }, [phase]);

  /* Le mot de fin s'en va seul au bout de quelques secondes. */
  useEffect(() => {
    if (phase !== 'note') return;
    const t = window.setTimeout(onFini, 9000);
    return () => window.clearTimeout(t);
  }, [phase, onFini]);

  if (phase === 'note') {
    return (
      <div className={s.note} role="status">
        <span className={s.noteIco}><Svg d={D.question} t={18} /></span>
        <div className={s.noteTx}>
          <b>La présentation est fermée</b>
          <span>{'Elle ne reviendra plus d’elle-même. Vous la retrouvez à tout moment dans «\u00a0Comment ça marche\u00a0?\u00a0».'}</span>
          <div className={s.noteBtns}>
            <button type="button" className={s.noteBtn} onClick={() => { setI(0); setDir(1); setPhase('ouvert'); }}>La revoir</button>
            <button type="button" className={s.noteBtn} onClick={onFini}>OK</button>
          </div>
        </div>
      </div>
    );
  }

  /* Glisser du doigt : vers la gauche, l'écran suivant ; vers la droite, le précédent. */
  const debutTouche = (ev: TouchEvent) => { const t = ev.touches[0]; toucher.current = { x: t.clientX, y: t.clientY }; };
  const finTouche = (ev: TouchEvent) => {
    const d = toucher.current; toucher.current = null;
    if (!d) return;
    const t = ev.changedTouches[0];
    const dx = t.clientX - d.x, dy = t.clientY - d.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    if (dx < 0) suivant(); else retour();
  };

  const sens = dir > 0 ? s.versD : s.versG;
  const icone = (d: string): ReactNode => <Svg d={d} t={17} w={2.2} />;
  return (
    <div className={`${s.couche}${phase === 'part' ? ' ' + s.part : ''}`}>
      <div className={s.voile} />
      <div ref={fenetre} tabIndex={-1} className={s.feuille} role="dialog" aria-modal="true" aria-label="Bienvenue dans votre espace"
        onTouchStart={debutTouche} onTouchEnd={finTouche}>
        <span className={s.poignee} />
        <div className={s.tete}>
          <div className={s.barres} aria-hidden="true">
            {ecrans.map((_, n) => (
              <span key={n} className={`${s.barre}${n < i ? ' ' + s.faite : n === i ? ' ' + s.courante : ''}`}><i key={n === i ? 'c' + i : 'f'} /></span>
            ))}
          </div>
          <button type="button" className={s.croix} aria-label="Fermer la présentation" onClick={fermer}><Svg d={D.croix} t={15} w={2.6} /></button>
        </div>
        <div className={s.corps} key={i}>
          <div className={s.illuCol}>
            <div className={`${s.illuAnim} ${sens}`}><Illustration n={i} /></div>
            <span className={s.conseiller}><span>{(conseiller || 'A').charAt(0).toUpperCase()}</span>{`${conseiller || 'Alexandre'}, votre conseiller`}</span>
          </div>
          <div className={`${s.textes} ${sens}`}>
            <span className={s.sur}>{e.sur}</span>
            <h2 className={s.titre}>{e.titre}</h2>
            <p className={s.texte}>{e.texte}</p>
            {e.fort && <span className={s.fort}>{icone(D.etincelles)}{e.fort}</span>}
            {e.astuce && <span className={s.astuce}>{icone(D.telephone)}{e.astuce}</span>}
          </div>
        </div>
        <div className={s.pied}>
          <div className={s.boutons}>
            {i > 0 && (
              <button type="button" className={s.retour} onClick={retour}>{icone(D.flecheG)}Retour</button>
            )}
            <button type="button" className={`${s.suivant}${dernier ? ' ' + s.fin : ''}`} onClick={suivant}>
              <span>{dernier ? 'C’est parti' : 'Suivant'}</span>
              <Svg d={dernier ? D.ok : D.fleche} t={18} w={2.4} />
            </button>
          </div>
          <span className={s.bas}>{i === 0 ? `${NB} étapes · 1 minute` : `${i + 1} sur ${NB}`}</span>
        </div>
      </div>
    </div>
  );
}
