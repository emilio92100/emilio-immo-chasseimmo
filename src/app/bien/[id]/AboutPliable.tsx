'use client';
import { useState } from 'react';

const BLEU = '#1a2332';
const DORE = '#c9a84c';
const TEXTE = '#2f3c52';
const CREME = '#f3eee3';

function toParagraphs(text: string): string[] {
  const t = (text || '').trim();
  if (!t) return [];
  // Respecte les sauts de ligne existants
  if (/\n/.test(t)) return t.split(/\n+/).map(s => s.trim()).filter(Boolean);
  // Sinon, regroupe les phrases par 3 pour aérer
  const phrases = t.match(/[^.!?]+[.!?]+(\s|$)/g)?.map(s => s.trim()) || [t];
  const paras: string[] = [];
  for (let i = 0; i < phrases.length; i += 3) {
    paras.push(phrases.slice(i, i + 3).join(' '));
  }
  return paras;
}

export default function AboutPliable({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const paras = toParagraphs(text);

  return (
    <div>
      <div
        style={{
          position: 'relative',
          maxHeight: open ? 4000 : 168,
          overflow: 'hidden',
          transition: 'max-height 0.45s ease',
        }}
      >
        {paras.map((p, i) => (
          <p key={i} style={{ fontSize: 15, color: TEXTE, lineHeight: 1.8, margin: i === 0 ? '0 0 14px' : '0 0 14px' }}>{p}</p>
        ))}
        {!open && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 70,
              background: `linear-gradient(to bottom, rgba(255,255,255,0), #ffffff)`,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          marginTop: 12,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: CREME,
          color: BLEU,
          border: 'none',
          borderRadius: 10,
          padding: '9px 16px',
          fontSize: 13.5,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {open ? 'Réduire' : 'Lire la suite'}
        <i className={`ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize: 16, color: DORE }} aria-hidden="true" />
      </button>
    </div>
  );
}
