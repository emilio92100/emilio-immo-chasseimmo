'use client';
import { useState, useEffect, useCallback } from 'react';

const BLEU = '#1a2332';
const DORE = '#c9a84c';

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
      <div style={{ height: 420, background: 'linear-gradient(135deg, #6b7c93 0%, #4a5d7e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
          <div style={{ fontSize: 48 }}>📷</div>
          <div style={{ fontSize: 12, marginTop: 8, letterSpacing: 1 }}>Photos en cours d&apos;ajout</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ===== CARROUSEL PRINCIPAL ===== */}
      <div style={{ position: 'relative', height: 440, background: '#1a2332', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[current]}
          alt={`Photo ${current + 1}`}
          onClick={() => setLightbox(current)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
        />

        <button
          onClick={() => setShowGallery(true)}
          style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(26,35,50,0.85)', color: 'white', padding: '7px 15px', borderRadius: 20, fontSize: 11.5, fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          📷 {current + 1} / {photos.length} · Voir tout
        </button>

        {photos.length > 1 && (
          <>
            <button onClick={prev} aria-label="Photo précédente" style={navBtn('left')}>‹</button>
            <button onClick={next} aria-label="Photo suivante" style={navBtn('right')}>›</button>
          </>
        )}

        {photos.length > 1 && photos.length <= 10 && (
          <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
            {photos.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)} aria-label={`Photo ${i + 1}`}
                style={{ width: i === current ? 24 : 8, height: 8, background: i === current ? DORE : 'rgba(255,255,255,0.5)', border: 'none', borderRadius: 4, cursor: 'pointer', transition: 'width 0.2s' }} />
            ))}
          </div>
        )}
      </div>

      {/* ===== GALERIE (grille de vignettes) ===== */}
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
                <img src={url} alt={`Photo ${i + 1}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== PLEIN ÉCRAN ===== */}
      {lightbox !== null && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <button onClick={(e) => { e.stopPropagation(); setLightbox(null); }} aria-label="Fermer"
            style={{ position: 'fixed', top: 16, right: 16, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', fontSize: 22, fontFamily: 'inherit', zIndex: 10001 }}>✕</button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photos[lightbox]} alt={`Photo ${lightbox + 1}`} onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '92vw', maxHeight: '86vh', objectFit: 'contain', borderRadius: 6, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} />

          {photos.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); lbPrev(); }} aria-label="Précédente" style={lbBtn('left')}>‹</button>
              <button onClick={(e) => { e.stopPropagation(); lbNext(); }} aria-label="Suivante" style={lbBtn('right')}>›</button>
            </>
          )}

          <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.85)', fontSize: 13, background: 'rgba(0,0,0,0.5)', padding: '6px 14px', borderRadius: 20 }}>
            {lightbox + 1} / {photos.length}
          </div>
        </div>
      )}
    </>
  );
}

function navBtn(side: 'left' | 'right'): React.CSSProperties {
  return { position: 'absolute', [side]: 16, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: BLEU, fontFamily: 'inherit', lineHeight: 1 };
}

function lbBtn(side: 'left' | 'right'): React.CSSProperties {
  return { position: 'fixed', [side]: 16, top: '50%', transform: 'translateY(-50%)', width: 52, height: 52, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'white', fontFamily: 'inherit', lineHeight: 1, zIndex: 10001 };
}
