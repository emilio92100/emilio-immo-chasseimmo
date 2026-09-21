'use client';
import { useState, useRef, useLayoutEffect } from 'react';

/* Même traitement que dans l'espace acheteur : les descriptions d'annonces
   arrivent souvent d'un seul bloc, sans le moindre saut de ligne. On les
   respire en paragraphes, puis on replie ce qui dépasse. On ne touche jamais
   aux mots — seulement à l'air entre eux. */

const ENCRE = '#1a2332';
const OR = '#c9a84c';
const PLUME = '#64748b';

function enParagraphes(texte: string): string[] {
  const t = (texte || '').trim();
  if (!t) return [];
  const doubles = t.split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
  const source = doubles.length > 1 ? doubles : t.split(/\n+/).map(x => x.trim()).filter(Boolean);
  const sortie: string[] = [];
  for (const bloc of source) {
    if (bloc.length <= 300) { sortie.push(bloc); continue; }
    const phrases = bloc.match(/[^.!?…]+[.!?…]+\s*|[^.!?…]+$/g) || [bloc];
    let courant = '';
    for (const ph of phrases) {
      courant += ph;
      if (courant.length >= 200) { sortie.push(courant.trim()); courant = ''; }
    }
    if (courant.trim()) sortie.push(courant.trim());
  }
  return sortie;
}

export default function AboutPliable({ text }: { text: string }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [hauteur, setHauteur] = useState(0);
  const paras = enParagraphes(text);

  useLayoutEffect(() => {
    if (ref.current) setHauteur(ref.current.scrollHeight);
  }, [text]);

  /* Le rendu serveur ne mesure rien : sans repère, le texte s'afficherait en
     entier puis se replierait d'un coup à l'hydratation. On présume donc sur
     sa longueur, et la mesure réelle prend le relais dès qu'elle existe. */
  const long = hauteur ? hauteur > 176 : text.trim().length > 420;

  return (
    <div>
      <div
        ref={ref}
        style={{
          overflow: 'hidden',
          transition: 'max-height .42s cubic-bezier(.16,1,.3,1)',
          maxHeight: long ? (ouvert ? hauteur : 176) : undefined,
          WebkitMaskImage: long && !ouvert ? 'linear-gradient(#000 58%, transparent 100%)' : undefined,
          maskImage: long && !ouvert ? 'linear-gradient(#000 58%, transparent 100%)' : undefined,
        }}
      >
        {paras.map((p, i) => (
          <p key={i} style={{ fontSize: 15, color: ENCRE, lineHeight: 1.75, margin: i === 0 ? 0 : '14px 0 0' }}>{p}</p>
        ))}
      </div>

      {long && (
        <button
          type="button"
          onClick={() => setOuvert(v => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 8, padding: '7px 0',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, fontWeight: 800,
            color: OR, letterSpacing: '.2px',
          }}
        >
          {ouvert ? 'Réduire' : 'Lire la suite'}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={PLUME}
            strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{
              display: 'block',
              transform: ouvert ? 'rotate(180deg)' : 'none',
              transition: 'transform .4s cubic-bezier(.16,1,.3,1)',
            }}>
            <path d="m6 9.5 6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
