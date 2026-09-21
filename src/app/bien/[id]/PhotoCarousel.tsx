'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

/*
 * Le carrousel de la fiche publique.
 *
 * Les photos sont posées côte à côte dans un ruban, et c'est le ruban qu'on
 * déplace. Pendant le geste il suit le doigt au pixel près ; au relâchement il
 * glisse jusqu'à la photo voisine. Remplacer une image par une autre d'un coup,
 * comme avant, donnait un à-coup : on ne voyait pas le mouvement, on voyait un
 * saut. Ce qui rend un glissement agréable, c'est qu'on voie la photo suivante
 * arriver pendant qu'on pousse.
 */

const BLEU = '#1a2332';
const DORE = '#c9a84c';

/* Assez long pour qu'on voie le mouvement, assez court pour ne pas attendre.
   La courbe part vite et freine à l'arrivée : c'est ce qui donne le poids. */
const GLISSE = 'transform .44s cubic-bezier(.22,1,.36,1)';

export default function PhotoCarousel({ photos }: { photos: string[] }) {
  const [current, setCurrent] = useState(0);
  const [showGallery, setShowGallery] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const next = useCallback(() => setCurrent(c => (c + 1) % photos.length), [photos.length]);
  const prev = useCallback(() => setCurrent(c => (c - 1 + photos.length) % photos.length), [photos.length]);
  const lbNext = useCallback(() => setLightbox(i => (i === null ? null : (i + 1) % photos.length)), [photos.length]);
  const lbPrev = useCallback(() => setLightbox(i => (i === null ? null : (i - 1 + photos.length) % photos.length)), [photos.length]);

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowRight') lbNext();
      else if (e.key === 'ArrowLeft') lbPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, lbNext, lbPrev]);

  if (photos.length === 0) {
    return (
      <div style={{ height: 440, background: 'linear-gradient(135deg, #6b7c93 0%, #4a5d7e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
          <div style={{ fontSize: 48 }}>📷</div>
          <div style={{ fontSize: 12, marginTop: 8, letterSpacing: 1 }}>Photos en cours d&apos;ajout</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ═══ LE CARROUSEL ═══ */}
      <Ruban
        photos={photos}
        index={current}
        onIndex={setCurrent}
        hauteur={440}
        fond={BLEU}
        remplir
        onOuvrir={(i) => setLightbox(i)}
      >
        <button
          onClick={() => setShowGallery(true)}
          style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(26,35,50,0.85)', color: 'white', padding: '7px 15px', borderRadius: 20, fontSize: 11.5, fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit', zIndex: 3 }}
        >
          📷 {current + 1} / {photos.length}{' '}· Voir tout
        </button>

        {photos.length > 1 && (
          <>
            <button onClick={prev} aria-label="Photo précédente" style={navBtn('left')}>‹</button>
            <button onClick={next} aria-label="Photo suivante" style={navBtn('right')}>›</button>
          </>
        )}

        {photos.length > 1 && photos.length <= 10 && (
          <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, zIndex: 3 }}>
            {photos.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)} aria-label={`Photo ${i + 1}`}
                style={{ width: i === current ? 24 : 8, height: 8, background: i === current ? DORE : 'rgba(255,255,255,0.5)', border: 'none', borderRadius: 4, cursor: 'pointer', transition: 'width .28s cubic-bezier(.22,1,.36,1), background .28s ease' }} />
            ))}
          </div>
        )}
      </Ruban>

      {/* ═══ LA GRILLE DE VIGNETTES ═══ */}
      {showGallery && (
        <div onClick={() => setShowGallery(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9990, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '64px 20px 20px', overflow: 'auto' }}>
          <button onClick={(e) => { e.stopPropagation(); setShowGallery(false); }} aria-label="Fermer"
            style={{ position: 'fixed', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', width: 42, height: 42, borderRadius: '50%', cursor: 'pointer', fontSize: 20, fontFamily: 'inherit', zIndex: 9991 }}>✕</button>
          <div onClick={(e) => e.stopPropagation()}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, maxWidth: 1200, width: '100%' }}>
            {photos.map((url, i) => (
              <div key={i} onClick={() => setLightbox(i)}
                style={{ position: 'relative', paddingBottom: '68%', overflow: 'hidden', borderRadius: 8, background: '#1a2332', cursor: 'zoom-in' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Photo ${i + 1}`} loading="lazy" decoding="async"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ LE PLEIN ÉCRAN ═══ */}
      {lightbox !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 10000 }}>
          <button onClick={() => setLightbox(null)} aria-label="Fermer"
            style={{ position: 'fixed', top: 16, right: 16, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', fontSize: 22, fontFamily: 'inherit', zIndex: 10002 }}>✕</button>

          {/* Le même ruban, mais l'image entière au lieu d'un cadrage */}
          <Ruban
            photos={photos}
            index={lightbox}
            onIndex={(i) => setLightbox(i)}
            plein
            fond="transparent"
            onFond={() => setLightbox(null)}
          >
            {photos.length > 1 && (
              <>
                <button onClick={lbPrev} aria-label="Précédente" style={lbBtn('left')}>‹</button>
                <button onClick={lbNext} aria-label="Suivante" style={lbBtn('right')}>›</button>
              </>
            )}
          </Ruban>

          <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.85)', fontSize: 13, background: 'rgba(0,0,0,0.5)', padding: '6px 14px', borderRadius: 20, zIndex: 10002 }}>
            {lightbox + 1} / {photos.length}
          </div>
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 *  Le ruban : toutes les photos côte à côte, c'est lui qui se déplace.
 * ══════════════════════════════════════════════════════════════════════ */
function Ruban({
  photos, index, onIndex, hauteur, fond, remplir, plein, onOuvrir, onFond, children,
}: {
  photos: string[];
  index: number;
  onIndex: (i: number) => void;
  hauteur?: number;
  fond: string;
  remplir?: boolean;
  plein?: boolean;
  onOuvrir?: (i: number) => void;
  onFond?: () => void;
  children?: React.ReactNode;
}) {
  const cadre = useRef<HTMLDivElement>(null);
  const depart = useRef({ x: 0, y: 0 });
  const sens = useRef<'' | 'h' | 'v'>('');
  const aGlisse = useRef(false);
  const [decalage, setDecalage] = useState(0);
  const [anime, setAnime] = useState(true);

  const debut = (e: React.TouchEvent) => {
    if (photos.length < 2) return;
    depart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    sens.current = '';
    aGlisse.current = false;
    setAnime(false);
  };

  const pendant = (e: React.TouchEvent) => {
    if (photos.length < 2) return;
    const dx = e.touches[0].clientX - depart.current.x;
    const dy = e.touches[0].clientY - depart.current.y;

    /* On tranche une fois pour toutes au bout de quelques pixels : soit le
       doigt part sur le côté et c'est le carrousel, soit il part vers le haut
       et c'est la page qui défile. On ne reprend pas la main ensuite. */
    if (!sens.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      sens.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (sens.current !== 'h') return;

    aGlisse.current = true;
    /* Aux deux bouts, le ruban résiste au lieu de partir dans le vide :
       on sent qu'il n'y a plus rien derrière. */
    const auBout = (dx > 0 && index === 0) || (dx < 0 && index === photos.length - 1);
    setDecalage(auBout ? dx * 0.32 : dx);
  };

  const fin = () => {
    if (photos.length < 2) return;
    const largeur = cadre.current?.offsetWidth || 320;
    const seuil = Math.max(48, largeur * 0.17);
    setAnime(true);
    if (sens.current === 'h' && Math.abs(decalage) > seuil) {
      if (decalage < 0 && index < photos.length - 1) onIndex(index + 1);
      else if (decalage > 0 && index > 0) onIndex(index - 1);
    }
    setDecalage(0);
    sens.current = '';
  };

  const auClic = (i: number) => {
    /* Un glissement se termine par un relâchement : sans ce garde-fou, il
       ouvrirait le plein écran à chaque fois qu'on change de photo. */
    if (aGlisse.current) { aGlisse.current = false; return; }
    if (onOuvrir) onOuvrir(i);
    else if (onFond) onFond();
  };

  return (
    <div
      ref={cadre}
      onTouchStart={debut}
      onTouchMove={pendant}
      onTouchEnd={fin}
      onTouchCancel={fin}
      style={{
        position: plein ? 'fixed' : 'relative',
        inset: plein ? 0 : undefined,
        height: plein ? undefined : hauteur,
        background: fond,
        overflow: 'hidden',
        touchAction: 'pan-y',
      }}
    >
      <div
        style={{
          display: 'flex',
          height: '100%',
          alignItems: 'center',
          transform: `translate3d(calc(${-index * 100}% + ${decalage}px), 0, 0)`,
          transition: anime ? GLISSE : 'none',
          willChange: 'transform',
        }}
      >
        {photos.map((url, i) => (
          <div key={i} style={{ flex: '0 0 100%', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: plein ? 20 : 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Photo ${i + 1}`}
              onClick={() => auClic(i)}
              draggable={false}
              /* Les voisines immédiates sont chargées d'avance : sans ça, on
                 glisse sur une image encore blanche. Les autres attendent. */
              loading={Math.abs(i - index) <= 1 ? 'eager' : 'lazy'}
              decoding="async"
              style={remplir
                ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in', userSelect: 'none' }
                : { maxWidth: '100%', maxHeight: '86vh', objectFit: 'contain', display: 'block', borderRadius: 6, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', userSelect: 'none' }}
            />
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

function navBtn(side: 'left' | 'right'): React.CSSProperties {
  return { position: 'absolute', [side]: 16, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: BLEU, fontFamily: 'inherit', lineHeight: 1, zIndex: 3 };
}

function lbBtn(side: 'left' | 'right'): React.CSSProperties {
  return { position: 'fixed', [side]: 16, top: '50%', transform: 'translateY(-50%)', width: 52, height: 52, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'white', fontFamily: 'inherit', lineHeight: 1, zIndex: 10002 };
}
