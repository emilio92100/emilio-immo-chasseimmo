'use client';
import { useState } from 'react';

const BLEU = '#1a2332';
const DORE = '#c9a84c';

export default function PhotoCarousel({ photos }: { photos: string[] }) {
  const [current, setCurrent] = useState(0);
  const [showFullGallery, setShowFullGallery] = useState(false);

  if (photos.length === 0) {
    return (
      <div style={{ height: 420, background: 'linear-gradient(135deg, #2c3a52 0%, #1a2332 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
          <i className="ti ti-photo" style={{ fontSize: 40 }} aria-hidden="true" />
          <div style={{ fontSize: 12, marginTop: 8, letterSpacing: 1 }}>Photos en cours d&apos;ajout</div>
        </div>
      </div>
    );
  }

  const next = () => setCurrent(c => (c + 1) % photos.length);
  const prev = () => setCurrent(c => (c - 1 + photos.length) % photos.length);

  return (
    <>
      <div style={{ position: 'relative', height: 420, background: BLEU, overflow: 'hidden' }}>

        {/* PISTE COULISSANTE — toutes les photos côte à côte, on translate */}
        <div
          style={{
            display: 'flex',
            height: '100%',
            transform: `translateX(-${current * 100}%)`,
            transition: 'transform 0.55s cubic-bezier(0.4, 0.0, 0.2, 1)',
          }}
        >
          {photos.map((url, i) => (
            <div key={i} style={{ minWidth: '100%', height: '100%' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Photo ${i + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
          ))}
        </div>

        {/* Compteur + voir tout */}
        <button
          onClick={() => setShowFullGallery(true)}
          style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(26,35,50,0.85)', color: 'white', padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer', backdropFilter: 'blur(8px)', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <i className="ti ti-photo" style={{ fontSize: 14 }} aria-hidden="true" /> {current + 1} / {photos.length} · Voir tout
        </button>

        {/* Navigation */}
        {photos.length > 1 && (
          <>
            <button
              onClick={prev}
              aria-label="Photo précédente"
              style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 42, height: 42, background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: BLEU, fontFamily: 'inherit', boxShadow: '0 2px 10px rgba(26,35,50,0.25)' }}
            >
              <i className="ti ti-chevron-left" style={{ fontSize: 22 }} aria-hidden="true" />
            </button>
            <button
              onClick={next}
              aria-label="Photo suivante"
              style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', width: 42, height: 42, background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: BLEU, fontFamily: 'inherit', boxShadow: '0 2px 10px rgba(26,35,50,0.25)' }}
            >
              <i className="ti ti-chevron-right" style={{ fontSize: 22 }} aria-hidden="true" />
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
                style={{ width: i === current ? 24 : 8, height: 8, background: i === current ? DORE : 'rgba(255,255,255,0.5)', border: 'none', borderRadius: 4, cursor: 'pointer', transition: 'width 0.3s, background 0.3s', padding: 0 }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal galerie complète */}
      {showFullGallery && (
        <div
          onClick={() => setShowFullGallery(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(19,27,39,0.95)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflow: 'auto' }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setShowFullGallery(false); }}
            style={{ position: 'fixed', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', fontFamily: 'inherit', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Fermer"
          >
            <i className="ti ti-x" style={{ fontSize: 20 }} aria-hidden="true" />
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, maxWidth: 1200, width: '100%' }}
          >
            {photos.map((url, i) => (
              <div key={i} style={{ position: 'relative', paddingBottom: '70%', overflow: 'hidden', borderRadius: 10, background: BLEU }}>
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
