'use client';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Un calendrier, plutôt que le champ date du navigateur.
 *
 * Le champ natif n'a ni le même dessin d'un navigateur à l'autre, ni les
 * couleurs de la maison, et il oblige à taper une date au lieu de la voir.
 * Ici on montre le mois, on pointe le jour, et le bouton dit en toutes lettres
 * ce qui a été choisi : « jeudi 25 septembre ».
 */

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const OR = '#c9a84c', OR_FONCE = '#a9822f', ENCRE = '#1a2332';

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function duJour(v: string) {
  const [a, m, j] = v.split('-').map(Number);
  return new Date(a, (m || 1) - 1, j || 1, 12, 0, 0, 0);
}
export function texteDate(v: string, long = true) {
  if (!v) return '';
  return duJour(v).toLocaleDateString('fr-FR',
    long ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' });
}

/* Les jours du mois affiché, précédés des cases vides de la semaine entamée.
   La semaine commence lundi : getDay() rend 0 pour dimanche, d'où le décalage. */
function grille(annee: number, mois: number) {
  const premier = new Date(annee, mois, 1);
  const decalage = (premier.getDay() + 6) % 7;
  const nb = new Date(annee, mois + 1, 0).getDate();
  const cases: (Date | null)[] = Array(decalage).fill(null);
  for (let j = 1; j <= nb; j++) cases.push(new Date(annee, mois, j, 12));
  return cases;
}

export default function ChoixDate({ valeur, onChange, min, placeholder = 'Choisir une date', compact }: {
  valeur: string;
  onChange: (v: string) => void;
  min?: string;
  placeholder?: string;
  compact?: boolean;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [curseur, setCurseur] = useState(() => valeur ? duJour(valeur) : new Date());
  const bouton = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (valeur) setCurseur(duJour(valeur)); }, [valeur]);

  const aujourdhui = iso(new Date());
  const borne = min || '';

  function ouvrir() {
    if (pos) { setPos(null); return; }
    const r = bouton.current?.getBoundingClientRect();
    if (!r) return;
    const largeur = 268, hauteur = 318;
    setPos({
      x: Math.max(12, Math.min(r.left, window.innerWidth - largeur - 12)),
      y: r.bottom + hauteur > window.innerHeight - 12 ? Math.max(12, r.top - hauteur - 6) : r.bottom + 6,
    });
  }

  const cases = grille(curseur.getFullYear(), curseur.getMonth());

  return (
    <>
      <button type="button" ref={bouton} onClick={ouvrir}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 9,
          padding: compact ? '6px 12px' : '9px 14px',
          borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
          fontSize: compact ? 12.5 : 13.5, fontWeight: valeur ? 700 : 600,
          border: `1px solid ${pos ? OR : valeur ? '#e3d3ab' : '#e3e8f0'}`,
          background: valeur ? '#fdfaf1' : 'white',
          color: valeur ? ENCRE : '#94a3b8',
          transition: 'border-color .15s, background .15s',
        }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke={valeur ? OR_FONCE : '#94a3b8'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" />
        </svg>
        <span style={{ textTransform: 'capitalize' }}>{valeur ? texteDate(valeur) : placeholder}</span>
      </button>

      {pos && typeof document !== 'undefined' && createPortal(
        <>
          <div onClick={() => setPos(null)} style={{ position: 'fixed', inset: 0, zIndex: 300 }} />
          <div style={{
            position: 'fixed', left: pos.x, top: pos.y, zIndex: 301, width: 268,
            background: 'white', border: '1px solid #e3e8f0', borderRadius: 15,
            boxShadow: '0 3px 8px rgba(15,22,35,.06), 0 18px 44px rgba(15,22,35,.2)',
            padding: 12, animation: 'calEntre .14s cubic-bezier(.16,1,.3,1)',
          }}>
            <style>{`@keyframes calEntre { from { opacity:0; transform:translateY(-6px) scale(.985) } to { opacity:1; transform:none } }
              .cal-j { border:none; background:transparent; border-radius:9px; height:32px; cursor:pointer;
                font-family:inherit; font-size:13px; font-weight:600; color:${ENCRE}; transition:background .12s, color .12s }
              .cal-j:hover:not(:disabled) { background:#f1f5f9 }
              .cal-j:disabled { color:#cbd5e1; cursor:default }
              .cal-j[data-auj="true"] { color:${OR_FONCE}; font-weight:800 }
              .cal-j[data-pris="true"] { background:${ENCRE}; color:#f2dfa6; font-weight:800 }
              .cal-j[data-pris="true"]:hover { background:#243044 }
              .cal-fl { width:28px; height:28px; border-radius:8px; border:1px solid #e3e8f0; background:white;
                color:#64748b; cursor:pointer; display:inline-flex; align-items:center; justify-content:center }
              .cal-fl:hover { border-color:${OR}; color:${ENCRE} }`}</style>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <button type="button" className="cal-fl"
                onClick={() => setCurseur(d => new Date(d.getFullYear(), d.getMonth() - 1, 1, 12))}>‹</button>
              <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13.5, fontWeight: 800, textTransform: 'capitalize' }}>
                {MOIS[curseur.getMonth()]} {curseur.getFullYear()}
              </span>
              <button type="button" className="cal-fl"
                onClick={() => setCurseur(d => new Date(d.getFullYear(), d.getMonth() + 1, 1, 12))}>›</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
              {JOURS.map((j, i) => (
                <span key={i} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 800, color: '#a3b0c2', textTransform: 'uppercase' }}>{j}</span>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {cases.map((d, i) => {
                if (!d) return <span key={`v${i}`} />;
                const v = iso(d);
                return (
                  <button type="button" key={v} className="cal-j"
                    data-auj={v === aujourdhui} data-pris={v === valeur}
                    disabled={!!borne && v < borne}
                    onClick={() => { onChange(v); setPos(null); }}>
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              <button type="button" onClick={() => { onChange(aujourdhui); setPos(null); }}
                style={{ background: 'none', border: 'none', color: OR_FONCE, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Aujourd&apos;hui
              </button>
              <span style={{ flexGrow: 1 }} />
              {valeur && (
                <button type="button" onClick={() => { onChange(''); setPos(null); }}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Effacer
                </button>
              )}
            </div>
          </div>
        </>,
        document.body)}
    </>
  );
}
