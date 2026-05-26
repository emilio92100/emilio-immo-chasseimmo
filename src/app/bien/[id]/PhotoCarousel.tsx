'use client';
import { useState } from 'react';

const BLEU = '#1a2332';
const DORE = '#c9a84c';

export default function PhotoCarousel({ photos }: { photos: string[] }) {
  const [current, setCurrent] = useState(0);
  const [showFullGallery, setShowFullGallery] = useState(false);

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

  const next = () => setCurrent(c => (c + 1) % photos.length);
  const prev = () => setCurrent(c => (c - 1 + photos.length) % photos.length);

  return (
    <>
      <div style={{ position: 'relative', height: 420, background: '#1a2332', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[current]}
          alt={`Photo ${current + 1}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />

        {/* Badge coup de cœur */}
        <div style={{ position: 'absolute', top: 16, left: 16, background: DORE, color: BLEU, padding: '5px 12px', borderRadius: 3, fontSize: 10, fontWeight: 500, letterSpacing: 1.5 }}>
          ✨ COUP DE CŒUR DU CHASSEUR
        </div>

        {/* Compteur */}
        <button
          onClick={() => setShowFullGallery(true)}
          style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(26,35,50,0.85)', color: 'white', padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer', backdropFilter: 'blur(8px)', fontFamily: 'inherit' }}
        >
          📷 {current + 1} / {photos.length} · Voir tout
        </button>

        {/* Navigation */}
        {photos.length > 1 && (
          <>
            <button
              onClick={prev}
              aria-label="Photo précédente"
              style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: BLEU, fontFamily: 'inherit' }}
            >
              ‹
            </button>
            <button
              onClick={next}
              aria-label="Photo suivante"
              style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: BLEU, fontFamily: 'inherit' }}
            >
              ›
            </button>
          </>
        )}

        {/* Dots indicators */}
        {photos.length > 1 && photos.length <= 10 && (
          <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                aria-label={`Photo ${i + 1}`}
                style={{ width: i === current ? 24 : 8, height: 8, background: i === current ? DORE : 'rgba(255,255,255,0.5)', border: 'none', borderRadius: 4, cursor: 'pointer', transition: 'width 0.2s' }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal galerie complète */}
      {showFullGallery && (
        <div
          onClick={() => setShowFullGallery(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflow: 'auto' }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setShowFullGallery(false); }}
            style={{ position: 'fixed', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', fontSize: 20, fontFamily: 'inherit', zIndex: 10000 }}
            aria-label="Fermer"
          >
            ✕
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, maxWidth: 1200, width: '100%' }}
          >
            {photos.map((url, i) => (
              <div key={i} style={{ position: 'relative', paddingBottom: '70%', overflow: 'hidden', borderRadius: 4, background: '#1a2332' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Photo ${i + 1}`}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
