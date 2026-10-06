'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Ic } from './ApercuActe';
import s from './Documents.module.css';
import b from '@/components/biens/Biens.module.css';

/* ═══ Le fil des étapes d'un éditeur (biens, documents) ══════════════════
   Il défile quand il ne tient pas, avec deux flèches ; l'étape en cours
   reste à l'écran. Partagé depuis la V3.18 (il vivait dans EditeurBien).
   V3.80 (Alexandre : « quand on fait étape suivante ou retour, il faut que
   le mouvement soit fluide, sur l'onglet en haut aussi ; là c'est trop
   brut ») : le fond marine de l'étape en cours glisse d'une étape à
   l'autre au lieu de sauter. */
export default function FilEtapes({ children, actif }: { children: React.ReactNode; actif: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [bords, setBords] = useState({ g: false, d: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mesurer = () => setBords({ g: el.scrollLeft > 4, d: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    el.addEventListener('scroll', mesurer, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', mesurer); };
  }, []);
  const premier = useRef(true);
  useEffect(() => {
    const el = ref.current;
    const x = el?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!el || !x) return;
    const behavior: ScrollBehavior = premier.current ? 'auto' : 'smooth';
    premier.current = false;
    const g = x.offsetLeft - 40, dr = x.offsetLeft + x.offsetWidth + 40;
    if (g < el.scrollLeft) el.scrollTo({ left: g, behavior });
    else if (dr > el.scrollLeft + el.clientWidth) el.scrollTo({ left: dr - el.clientWidth, behavior });
  }, [actif]);
  /* La pastille : mesurée sur l'étape en cours ; posée sans glisser au
     premier affichage, puis elle glisse. */
  const [pos, setPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [anime, setAnime] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mesurer = () => {
      const x = el.querySelector<HTMLElement>('[aria-current="step"]');
      setPos(p => {
        if (!x) return null;
        const n = { x: x.offsetLeft, y: x.offsetTop, w: x.offsetWidth, h: x.offsetHeight };
        return p && p.x === n.x && p.y === n.y && p.w === n.w && p.h === n.h ? p : n;
      });
    };
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    Array.from(el.children).forEach(c => ro.observe(c));
    return () => ro.disconnect();
  }, [actif]);
  useEffect(() => {
    const t = requestAnimationFrame(() => setAnime(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const pousser = (sens: 1 | -1) => ref.current?.scrollBy({ left: sens * 280, behavior: 'smooth' });
  return (
    <div className={b.fil}>
      {bords.g && <button type="button" className={`${b.filFleche} ${b.filG}`} aria-label="Étapes précédentes" onClick={() => pousser(-1)}><Ic n="gauche" t={16} e={2.4} /></button>}
      <nav ref={ref} className={`${s.edPas} ${b.edPas}`} aria-label="Étapes" data-pastille={pos ? 'oui' : undefined}>
        {pos && <span className={`${b.filPastille} ${anime ? b.filPastilleAnime : ''}`} aria-hidden="true" style={{ width: pos.w, height: pos.h, transform: `translate(${pos.x}px, ${pos.y}px)` }} />}
        {children}
      </nav>
      {bords.d && <button type="button" className={`${b.filFleche} ${b.filD}`} aria-label="Étapes suivantes" onClick={() => pousser(1)}><Ic n="droite" t={16} e={2.4} /></button>}
    </div>
  );
}
