'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';

/**
 * Briques partagées par les onglets Veille, Sélection et Présentés.
 *
 *  <Icone>          jeu de pictos au trait
 *  <Vignettes>      bandeau de photos carrées + visionneuse
 *  <Specs>          surface / pièces / chambres / séjour… en pictos
 *  <BandeauMarche>  ancienneté + baisses de prix, avec volet dépliant et graphique
 *  <Modale>         fenêtre plein écran, rendue hors du conteneur
 *  <Frise>          chronologie d'un bien
 *  <ModaleObservation> / <ModaleEnvoi> / <ModaleScore>
 */

export const NAVY = '#1a2332';
export const OR = '#c9a84c';
export const BORD = '#e3e8f0';

/* ══ Styles globaux, injectés une seule fois ═══════════════════ */

export function StylesEmilio() {
  return (
    <style>{`
      @keyframes emiVoile { from { opacity: 0 } to { opacity: 1 } }
      @keyframes emiPanneau { from { opacity: 0; transform: translateY(14px) scale(.975) } to { opacity: 1; transform: none } }
      @keyframes emiEntree { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
      @keyframes emiPouls { 0%,100% { opacity:.4; transform:scale(.75) } 50% { opacity:1; transform:scale(1.2) } }
      .emi-voile { animation: emiVoile .2s ease both }
      .emi-fenetre { animation: emiPanneau .3s cubic-bezier(.16,1,.3,1) both }
      .emi-panneau { animation: emiEntree .32s cubic-bezier(.16,1,.3,1) both }
      .emi-panneau > * { animation: emiEntree .38s cubic-bezier(.16,1,.3,1) both }
      .emi-pouls { width:7px; height:7px; border-radius:50%; background:${OR}; display:inline-block; animation: emiPouls 1.9s ease-in-out infinite }
      @keyframes emiArrivee { from { opacity:0; transform: translateY(16px) } to { opacity:1; transform:none } }
      .emi-arrivee { animation: emiArrivee .52s cubic-bezier(.16,1,.3,1) both }
      @media (prefers-reduced-motion: reduce) { .emi-arrivee { animation-duration: .01ms } }
      .emi-carte { transition: box-shadow .24s ease, transform .24s ease, border-color .24s ease }
      .emi-carte:hover { box-shadow: 0 2px 4px rgba(16,24,40,.05), 0 20px 44px -24px rgba(16,24,40,.38) }

      /* ── bandeau de photos ─────────────────────────────── */
      .emi-vignette { position:relative; flex:1 1 0; min-width:88px; max-width:158px; aspect-ratio:1/1;
        border-radius:12px; overflow:hidden; background:#e8edf3; cursor:zoom-in; border:none; padding:0;
        transition: transform .24s cubic-bezier(.16,1,.3,1), box-shadow .24s ease }
      .emi-vignette img { width:100%; height:100%; object-fit:cover; display:block;
        transition: transform .5s cubic-bezier(.16,1,.3,1), filter .24s ease }
      .emi-vignette:hover { transform: translateY(-3px); box-shadow: 0 12px 24px -12px rgba(16,24,40,.5); z-index:2 }
      .emi-vignette:hover img { transform: scale(1.07) }
      .emi-bande { display:flex; gap:7px; align-items:stretch }

      /* ── volet dépliant ────────────────────────────────── */
      .emi-volet { display:grid; grid-template-rows:0fr; opacity:0;
        transition: grid-template-rows .4s cubic-bezier(.16,1,.3,1), opacity .3s ease, margin-top .4s cubic-bezier(.16,1,.3,1) }
      .emi-volet[data-ouvert="true"] { grid-template-rows:1fr; opacity:1; margin-top:9px }
      .emi-volet > div { overflow:hidden; min-height:0 }
      .emi-chevron { transition: transform .32s cubic-bezier(.16,1,.3,1); display:inline-block }
      .emi-chevron[data-ouvert="true"] { transform: rotate(180deg) }

      /* ── puce cliquable du bandeau marché ──────────────── */
      .emi-puce { display:inline-flex; align-items:center; gap:6px; border-radius:9px; padding:5px 10px;
        font-size:12px; font-weight:700; font-family:inherit; cursor:pointer; white-space:nowrap;
        transition: all .18s cubic-bezier(.16,1,.3,1) }
      .emi-puce:hover { transform: translateY(-1px) }

      /* ── onglets ───────────────────────────────────────── */
      /* L'onglet actif descend d'un pixel sur la bordure du panneau : les deux
         se touchent, on est « dedans ». Le liseré doré marque l'onglet choisi. */
      .emi-onglet { position:relative; display:inline-flex; align-items:center; gap:8px; background:transparent;
        border:1px solid transparent; border-bottom:none; margin-bottom:-1px;
        border-radius:11px 11px 0 0; padding:11px 16px 12px; font-size:13.5px; font-weight:600;
        color:#64748b; cursor:pointer; font-family:inherit; white-space:nowrap;
        transition: background .28s cubic-bezier(.16,1,.3,1), color .28s cubic-bezier(.16,1,.3,1) }
      .emi-onglet:hover { color:${NAVY}; background:rgba(255,255,255,.62) }
      .emi-onglet[data-actif="true"] { color:${NAVY}; font-weight:800; background:#f7f9fc;
        border-color:${BORD}; padding-top:9px }
      .emi-onglet[data-actif="true"]::before { content:""; position:absolute; left:-1px; right:-1px; top:-1px;
        height:3px; border-radius:3px 3px 0 0; background:${OR} }
      .emi-compteur { background:rgba(148,163,184,.18); color:#64748b; border-radius:20px; padding:1px 8px; font-size:11.5px; font-weight:800; transition: all .32s cubic-bezier(.16,1,.3,1) }
      .emi-onglet[data-actif="true"] .emi-compteur { background:rgba(26,35,50,.1); color:${NAVY} }
      .emi-onglet .emi-compteur.dore { background:${OR}; color:#fff }
    `}</style>
  );
}

/* ══ Pictos ════════════════════════════════════════════════════ */

const TRAITS: Record<string, string[]> = {
  surface: ['M4 9V5a1 1 0 0 1 1-1h4', 'M20 9V5a1 1 0 0 0-1-1h-4', 'M4 15v4a1 1 0 0 0 1 1h4', 'M20 15v4a1 1 0 0 1-1 1h-4'],
  pieces: ['M3 3h18v18H3z', 'M3 10h8', 'M11 3v18'],
  lit: ['M2 18v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6', 'M2 15h20', 'M6 10V8a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2', 'M2 18v2', 'M22 18v2'],
  sofa: ['M5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4', 'M3 13a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5H3z', 'M6 18v2', 'M18 18v2'],
  immeuble: ['M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16', 'M3 21h18', 'M9.5 7h1', 'M13.5 7h1', 'M9.5 11h1', 'M13.5 11h1', 'M9.5 15h1', 'M13.5 15h1'],
  calendrier: ['M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  soleil: ['c:12,12,4', 'M12 4V2', 'M12 22v-2', 'M4 12H2', 'M22 12h-2', 'M5.6 5.6 4.2 4.2', 'M19.8 4.2l-1.4 1.4', 'M5.6 18.4l-1.4 1.4', 'M18.4 18.4l1.4 1.4'],
  lots: ['M12 2 2 7l10 5 10-5z', 'M2 12l10 5 10-5', 'M2 17l10 5 10-5'],
  horloge: ['c:12,12,9', 'M12 7.5V12l3 2'],
  baisse: ['M22 17 14 9l-4 4-8-8', 'M16 17h6v-6'],
  maison: ['M3 21h18', 'M5 21V9.5L12 4l7 5.5V21', 'M10 21v-6h4v6'],
  lieu: ['M12 21.5S19 15 19 10a7 7 0 1 0-14 0c0 5 7 11.5 7 11.5z', 'c:12,10,2.6'],
  info: ['c:12,12,9.2', 'M12 16.5V11', 'M12 7.8h.01'],
  chevron: ['m6 9.5 6 6 6-6'],
  tel: ['M6.2 3h3.1l1.5 3.9-2 1.3a13.4 13.4 0 0 0 6.9 6.9l1.3-2 3.9 1.5v3.1a1.9 1.9 0 0 1-2.1 1.9A17.6 17.6 0 0 1 3.1 5.1 1.9 1.9 0 0 1 5 3z'],
  mail: ['M3 7.2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'm3.6 7.6 8.4 5.8 8.4-5.8'],
  crayon: ['M12.5 20H21', 'M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6 3.4 19.8l1.2-4z'],
  etiquette: ['M20.6 13.4 13 21a2 2 0 0 1-2.8 0L3.6 14.4A2 2 0 0 1 3 13V5a2 2 0 0 1 2-2h8a2 2 0 0 1 1.4.6l6.2 6.2a2 2 0 0 1 0 2.8z', 'c:7.6,7.6,1.3'],
  euro: ['M17 6.5A6.5 6.5 0 0 0 7.5 12 6.5 6.5 0 0 0 17 17.5', 'M4 10.5h8', 'M4 13.5h8'],
  loupe: ['c:10.8,10.8,7', 'm20.5 20.5-4.7-4.7'],
  liste: ['M8.6 4.6H6a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6.6a2 2 0 0 0-2-2h-2.6', 'M8.6 2.8h6.8v3.6H8.6z', 'M8.5 11.5h7', 'M8.5 15.5h4.5'],
  envoi: ['M21.4 2.6 2.6 10.3l7.2 2.9 2.9 7.2z', 'M21.4 2.6 9.8 13.2'],
  mallette: ['M3 9.4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 7.4V5.6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.8', 'M3 13.4h18'],
  dossier: ['M3 6.6a2 2 0 0 1 2-2h4.2l2.2 2.6H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
};

export function Icone({ nom, taille = 17, epaisseur = 1.7 }: { nom: string; taille?: number; epaisseur?: number }) {
  const traits = TRAITS[nom];
  if (!traits) return null;
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={epaisseur} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block' }}>
      {traits.map((t, i) => {
        if (t.startsWith('c:')) {
          const [cx, cy, r] = t.slice(2).split(',');
          return <circle key={i} cx={cx} cy={cy} r={r} />;
        }
        return <path key={i} d={t} />;
      })}
    </svg>
  );
}

/* ══ Fenêtre ═══════════════════════════════════════════════════ */

export function Modale({ children, onFerme, largeur = 560, nu }: { children: React.ReactNode; onFerme: () => void; largeur?: number; nu?: boolean }) {
  const [monte, setMonte] = useState(false);
  useEffect(() => {
    setMonte(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFerme(); };
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [onFerme]);

  if (!monte) return null;

  return createPortal(
    <div className="emi-voile" onClick={onFerme}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: nu ? 'rgba(8,12,20,.9)' : 'rgba(12,18,30,.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, overflowY: 'auto',
      }}>
      <div className="emi-fenetre" onClick={(e) => e.stopPropagation()}
        style={{
          background: nu ? 'transparent' : 'white', borderRadius: 22, width: '100%', maxWidth: largeur,
          boxShadow: nu ? 'none' : '0 32px 80px rgba(12,18,30,.4)', overflow: nu ? 'visible' : 'hidden',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", margin: 'auto',
        }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

/* ══ Briques visuelles ═════════════════════════════════════════ */

const DPE_COULEURS: Record<string, { bg: string; fg: string }> = {
  A: { bg: '#319834', fg: '#fff' }, B: { bg: '#4ab84a', fg: '#fff' },
  C: { bg: '#a8d84a', fg: NAVY }, D: { bg: '#f7e017', fg: NAVY },
  E: { bg: '#f5b912', fg: NAVY }, F: { bg: '#ee8235', fg: '#fff' },
  G: { bg: '#e2231a', fg: '#fff' },
};

export function Dpe({ lettre, label = 'DPE' }: { lettre?: string | null; label?: string }) {
  if (!lettre) return null;
  const L = String(lettre).toUpperCase().slice(0, 1);
  const c = DPE_COULEURS[L];
  if (!c) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f7f9fc', border: `1px solid ${BORD}`, borderRadius: 7, padding: '2px 7px 2px 3px', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>
      <span style={{ background: c.bg, color: c.fg, borderRadius: 5, width: 17, height: 17, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800 }}>{L}</span>
      {label}
    </span>
  );
}

export function Chip({ children, ton = 'neutre' }: { children: React.ReactNode; ton?: 'neutre' | 'vert' | 'or' | 'ambre' | 'violet' | 'rouge' }) {
  const t = {
    neutre: { bg: '#f7f9fc', fg: '#64748b', bd: BORD },
    vert: { bg: '#f0fdf4', fg: '#15803d', bd: '#bbf7d0' },
    or: { bg: '#fdfaf1', fg: '#a17d2c', bd: '#ecdcb4' },
    ambre: { bg: '#fffbeb', fg: '#92400e', bd: '#fde68a' },
    violet: { bg: '#f5f3ff', fg: '#7c3aed', bd: '#ddd6fe' },
    rouge: { bg: '#fef2f2', fg: '#b91c1c', bd: '#fecaca' },
  }[ton];
  return <span style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, padding: '3px 9px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</span>;
}

export function BoutonLien({ children, onClick, href, actif }: { children: React.ReactNode; onClick?: () => void; href?: string; actif?: boolean }) {
  const st: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: actif ? NAVY : '#f7f9fc', color: actif ? 'white' : '#475569',
    border: `1px solid ${actif ? NAVY : BORD}`, borderRadius: 9, padding: '5px 11px',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    textDecoration: 'none', transition: 'all .16s ease',
  };
  const surv = (e: any, entre: boolean) => { if (!actif) e.currentTarget.style.background = entre ? '#eef2f7' : '#f7f9fc'; };
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" style={st} onMouseEnter={e => surv(e, true)} onMouseLeave={e => surv(e, false)}>{children}</a>;
  return <button type="button" onClick={onClick} style={st} onMouseEnter={e => surv(e, true)} onMouseLeave={e => surv(e, false)}>{children}</button>;
}

export const CARTE: React.CSSProperties = {
  background: 'white', border: `1px solid ${BORD}`, borderRadius: 18, overflow: 'hidden',
  boxShadow: '0 1px 2px rgba(16,24,40,.04), 0 10px 26px -20px rgba(16,24,40,.28)',
};

/* conservé pour compatibilité, plus utilisé par les cartes */
export const GRILLE_CARTE: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '196px minmax(0, 1fr) 172px', alignItems: 'stretch',
};

/* ══ Bandeau de photos carrées + visionneuse ═══════════════════ */

export function Vignettes({ photos, max = 7, coinGauche, coinDroit }: {
  photos: string[]; max?: number; coinGauche?: React.ReactNode; coinDroit?: React.ReactNode;
}) {
  const [lb, setLb] = useState<number | null>(null);
  const nettes = (photos || []).filter(Boolean);
  const visibles = nettes.slice(0, max);
  const reste = nettes.length - visibles.length;

  if (!nettes.length) {
    return (
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ height: 96, borderRadius: 12, background: '#f1f5f9', border: `1px dashed ${BORD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12.5, fontWeight: 600 }}>
          Pas de photo dans l&apos;annonce
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: '14px 16px 0', position: 'relative' }}>
        <div className="emi-bande">
          {visibles.map((u, i) => {
            const dernier = i === visibles.length - 1 && reste > 0;
            return (
              <button key={u + i} type="button" className="emi-vignette" onClick={() => setLb(i)}
                aria-label={`Photo ${i + 1}`}>
                <img src={u} alt="" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
                {dernier && (
                  <span style={{
                    position: 'absolute', inset: 0, background: 'rgba(12,18,30,.62)', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 17, fontWeight: 800, letterSpacing: -.4, backdropFilter: 'blur(1px)',
                  }}>+{reste + 1}</span>
                )}
              </button>
            );
          })}
        </div>
        {coinGauche && <div style={{ position: 'absolute', top: 22, left: 24, zIndex: 3 }}>{coinGauche}</div>}
        {coinDroit && <div style={{ position: 'absolute', top: 22, right: 24, zIndex: 3 }}>{coinDroit}</div>}
      </div>
      {lb !== null && <Visionneuse photos={nettes} depart={lb} onFerme={() => setLb(null)} />}
    </>
  );
}

function Visionneuse({ photos, depart, onFerme }: { photos: string[]; depart: number; onFerme: () => void }) {
  const [i, setI] = useState(depart);
  const aller = useCallback((d: number) => setI((n) => (n + d + photos.length) % photos.length), [photos.length]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') aller(1);
      if (e.key === 'ArrowLeft') aller(-1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [aller]);

  const fleche = (cote: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', [cote]: -6,
    width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,.14)', color: 'white',
    border: '1px solid rgba(255,255,255,.22)', cursor: 'pointer', fontSize: 21, fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, backdropFilter: 'blur(6px)', zIndex: 3,
  } as React.CSSProperties);

  return (
    <Modale onFerme={onFerme} largeur={1040} nu>
      <div style={{ position: 'relative' }}>
        <img src={photos[i]} alt="" style={{ width: '100%', maxHeight: '76vh', objectFit: 'contain', borderRadius: 16, display: 'block' }} />
        {photos.length > 1 && (
          <>
            <button type="button" onClick={() => aller(-1)} style={fleche('left')} aria-label="Précédente">‹</button>
            <button type="button" onClick={() => aller(1)} style={fleche('right')} aria-label="Suivante">›</button>
          </>
        )}
        <div style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(8,12,20,.6)', color: 'white', borderRadius: 20, padding: '5px 13px', fontSize: 12.5, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
          {i + 1} / {photos.length}
        </div>
      </div>
      <div className="emi-bande" style={{ marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        {photos.slice(0, 14).map((u, n) => (
          <button key={u + n} type="button" onClick={() => setI(n)}
            style={{
              width: 58, height: 58, borderRadius: 10, overflow: 'hidden', padding: 0, cursor: 'pointer',
              border: n === i ? `2px solid ${OR}` : '2px solid rgba(255,255,255,.18)',
              opacity: n === i ? 1 : .55, transition: 'all .2s ease', flex: '0 0 auto', background: '#000',
            }}>
            <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </button>
        ))}
      </div>
    </Modale>
  );
}

/* ══ Galerie avec fondu (conservée, fiche publique) ════════════ */

export function Galerie({ photos, hauteur = 168, coin }: { photos: string[]; hauteur?: number; coin?: React.ReactNode }) {
  const [idx, setIdx] = useState(0);
  const total = photos.length;
  const aller = (d: number) => setIdx((i) => (i + d + total) % total);

  return (
    <div className="emi-galerie" style={{ position: 'relative', background: '#e8edf3', minHeight: hauteur, overflow: 'hidden' }}>
      {photos.map((u, i) => (
        <img key={u + i} src={u} alt=""
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            opacity: i === idx ? 1 : 0, transition: 'opacity .38s cubic-bezier(.4,0,.2,1)',
          }}
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
      ))}
      {total > 1 && (
        <div style={{ position: 'absolute', bottom: 9, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4 }}>
          {photos.slice(0, 10).map((_, i) => (
            <button key={i} type="button" onClick={() => setIdx(i)} aria-label={`Photo ${i + 1}`} style={{
              width: i === idx ? 14 : 5, height: 5, borderRadius: 3, border: 'none', padding: 0, cursor: 'pointer',
              background: i === idx ? 'white' : 'rgba(255,255,255,.55)',
              transition: 'width .3s cubic-bezier(.16,1,.3,1), background .3s ease',
            }} />
          ))}
        </div>
      )}
      {total > 1 && (
        <button type="button" onClick={() => aller(1)} aria-label="Photo suivante" style={{
          position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', width: 26, height: 26,
          borderRadius: '50%', background: 'rgba(15,23,42,.55)', color: 'white', border: 'none', cursor: 'pointer',
          fontSize: 16, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}>›</button>
      )}
      {coin}
    </div>
  );
}

/* ══ Caractéristiques en pictos ════════════════════════════════ */

function Tuile({ icone, contenu, val, lib, ton }: {
  icone?: string; contenu?: React.ReactNode; val: React.ReactNode; lib: string; ton?: 'or' | 'neutre';
}) {
  const dore = ton === 'or';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9,
      background: dore ? '#fdfaf1' : '#f7f9fc',
      border: `1px solid ${dore ? '#ecdcb4' : BORD}`,
      borderRadius: 13, padding: '7px 13px 7px 8px', minWidth: 0,
    }}>
      <span style={{
        width: 31, height: 31, borderRadius: 10, background: 'white',
        border: `1px solid ${dore ? '#ecdcb4' : BORD}`, color: dore ? OR : '#7b8ba3',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{contenu ?? (icone ? <Icone nom={icone} /> : null)}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: NAVY, lineHeight: 1.15, letterSpacing: -.2, whiteSpace: 'nowrap' }}>{val}</span>
        <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#9aa8bd', textTransform: 'uppercase', letterSpacing: .7, marginTop: 1, whiteSpace: 'nowrap' }}>{lib}</span>
      </span>
    </div>
  );
}

export function Specs({ p }: { p: any }) {
  const t: React.ReactNode[] = [];
  const k = (n: string) => `sp-${n}`;

  if (p.surface) t.push(<Tuile key={k('s')} icone="surface" val={`${p.surface} m²`} lib="Surface" ton="or" />);
  if (p.nb_pieces) t.push(<Tuile key={k('p')} icone="pieces" val={p.nb_pieces} lib={p.nb_pieces > 1 ? 'Pièces' : 'Pièce'} />);
  if (p.nb_chambres) t.push(<Tuile key={k('c')} icone="lit" val={p.nb_chambres} lib={p.nb_chambres > 1 ? 'Chambres' : 'Chambre'} />);
  if (p.surface_sejour) t.push(<Tuile key={k('j')} icone="sofa" val={`${p.surface_sejour} m²`} lib="Séjour" />);
  if (p.etage != null) t.push(
    <Tuile key={k('e')} icone="immeuble"
      val={p.etage === 0 ? 'RDC' : `${p.etage}ᵉ`}
      lib={p.etage_total ? `sur ${p.etage_total}` : 'Étage'} />
  );
  if (p.surface_exterieur) t.push(
    <Tuile key={k('x')} icone="soleil" ton="or" val={`${p.surface_exterieur} m²`}
      lib={p.terrasse ? 'Terrasse' : p.jardin ? 'Jardin' : 'Balcon'} />
  );
  if (p.annee_construction) t.push(<Tuile key={k('a')} icone="calendrier" val={p.annee_construction} lib="Immeuble" />);
  if (p.nb_lots) t.push(<Tuile key={k('l')} icone="lots" val={p.nb_lots} lib="Lots" />);

  const lettre = (v: string, lab: string) => {
    const L = String(v).toUpperCase().slice(0, 1);
    const c = DPE_COULEURS[L];
    if (!c) return null;
    return (
      <Tuile key={k(lab)} lib={lab} val={L}
        contenu={<span style={{ background: c.bg, color: c.fg, width: 22, height: 22, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800 }}>{L}</span>} />
    );
  };
  if (p.dpe) { const n = lettre(p.dpe, 'DPE'); if (n) t.push(n); }
  if (p.ges) { const n = lettre(p.ges, 'GES'); if (n) t.push(n); }

  if (!t.length) return null;
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{t}</div>;
}

/* ══ Marché : ancienneté, baisses, graphique ═══════════════════ */

const MOIS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function jour(d: any) {
  const x = new Date(d);
  if (isNaN(x.getTime())) return '—';
  return `${x.getDate()} ${MOIS[x.getMonth()]} ${x.getFullYear()}`;
}
function courtJour(d: any) {
  const x = new Date(d);
  if (isNaN(x.getTime())) return '';
  return `${MOIS[x.getMonth()].replace('.', '')} ${String(x.getFullYear()).slice(2)}`;
}
export function anciennete(d: any) {
  if (!d) return null;
  const m = Math.round((Date.now() - new Date(d).getTime()) / 2.628e9);
  if (isNaN(m)) return null;
  if (m < 1) return "moins d'un mois";
  if (m === 1) return '1 mois';
  if (m < 24) return `${m} mois`;
  const a = Math.floor(m / 12); const r = m % 12;
  return r >= 6 ? `${a} ans et demi` : `${a} ans`;
}

export type PointPrix = { date: string; prix: number };

/** Reconstruit une série exploitable, même si Yanport n'a donné que le prix initial. */
export function seriePrix(p: any): PointPrix[] {
  const brut = Array.isArray(p?.historique_prix) ? p.historique_prix : [];
  const pts: PointPrix[] = brut
    .map((x: any) => ({ date: String(x?.date ?? x?.d ?? ''), prix: Number(x?.prix ?? x?.p ?? x?.price) }))
    .filter((x: PointPrix) => x.date && isFinite(x.prix) && x.prix > 0)
    .sort((a: PointPrix, b: PointPrix) => a.date.localeCompare(b.date));
  if (pts.length >= 2) return pts;

  const out: PointPrix[] = [];
  const iso = (d: any) => { const x = new Date(d); return isNaN(x.getTime()) ? '' : x.toISOString().slice(0, 10); };
  if (p?.date_publication && p?.prix_initial) out.push({ date: iso(p.date_publication), prix: Number(p.prix_initial) });
  if (p?.prix) out.push({ date: iso(p.date_derniere_baisse) || new Date().toISOString().slice(0, 10), prix: Number(p.prix) });
  const ok = out.filter(x => x.date && isFinite(x.prix) && x.prix > 0);
  return ok.length >= 2 && ok[0].prix !== ok[1].prix ? ok : pts;
}

export function GraphePrix({ points, hauteur = 148 }: { points: PointPrix[]; hauteur?: number }) {
  if (points.length < 2) return null;
  const L = 640, H = hauteur, hg = 14, hd = 14, ht = 24, hb = 26;

  const t0 = new Date(points[0].date).getTime();
  const tFin = Math.max(new Date(points[points.length - 1].date).getTime(), Date.now());
  const span = Math.max(tFin - t0, 86400000);
  const prix = points.map(p => p.prix);
  const pMin = Math.min(...prix), pMax = Math.max(...prix);
  const marge = Math.max((pMax - pMin) * 0.25, pMax * 0.012);

  const X = (d: string | number) => hg + ((new Date(d).getTime() - t0) / span) * (L - hg - hd);
  const Y = (v: number) => ht + (1 - (v - (pMin - marge)) / ((pMax + marge) - (pMin - marge))) * (H - ht - hb);

  // courbe en escalier : le prix tient jusqu'à la baisse suivante
  let d = `M ${X(points[0].date).toFixed(1)} ${Y(points[0].prix).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${X(points[i].date).toFixed(1)} ${Y(points[i - 1].prix).toFixed(1)}`;
    d += ` L ${X(points[i].date).toFixed(1)} ${Y(points[i].prix).toFixed(1)}`;
  }
  d += ` L ${X(Date.now()).toFixed(1)} ${Y(points[points.length - 1].prix).toFixed(1)}`;
  const aire = `${d} L ${X(Date.now()).toFixed(1)} ${(H - hb).toFixed(1)} L ${X(points[0].date).toFixed(1)} ${(H - hb).toFixed(1)} Z`;

  const id = 'g' + Math.abs(points[0].prix + points.length);
  const dernier = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${L} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={OR} stopOpacity=".26" />
          <stop offset="100%" stopColor={OR} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={hg} y1={H - hb} x2={L - hd} y2={H - hb} stroke={BORD} strokeWidth="1" />
      <path d={aire} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={OR} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => {
        const x = X(p.date), y = Y(p.prix);
        const fin = i === points.length - 1;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={fin ? 5.5 : 4.5} fill="white" stroke={fin ? NAVY : OR} strokeWidth="2.4" />
            <text x={Math.min(Math.max(x, 34), L - 34)} y={H - hb + 16} textAnchor="middle"
              fontSize="11" fontWeight="600" fill="#94a3b8" fontFamily="inherit">{courtJour(p.date)}</text>
          </g>
        );
      })}
      <text x={Math.min(Math.max(X(points[0].date), 40), L - 40)} y={Y(points[0].prix) - 12} textAnchor="middle"
        fontSize="12" fontWeight="800" fill="#94a3b8" fontFamily="inherit">
        {Math.round(points[0].prix / 1000)} k€
      </text>
      <text x={Math.min(Math.max(X(dernier.date), 40), L - 40)} y={Y(dernier.prix) + 20} textAnchor="middle"
        fontSize="12.5" fontWeight="800" fill={NAVY} fontFamily="inherit">
        {Math.round(dernier.prix / 1000)} k€
      </text>
    </svg>
  );
}

function Puce({ children, icone, onClick, ouvert, ton = 'neutre' }: {
  children: React.ReactNode; icone?: string; onClick?: () => void; ouvert?: boolean;
  ton?: 'neutre' | 'vert' | 'or';
}) {
  const t = {
    neutre: { bg: 'white', fg: '#475569', bd: BORD, ic: '#94a3b8' },
    vert: { bg: '#f0fdf4', fg: '#15803d', bd: '#bbf7d0', ic: '#16a34a' },
    or: { bg: '#fdfaf1', fg: '#a17d2c', bd: '#ecdcb4', ic: OR },
  }[ton];
  const contenu = (
    <>
      {icone && <span style={{ color: t.ic, display: 'flex' }}><Icone nom={icone} taille={14} epaisseur={1.9} /></span>}
      {children}
      {onClick && <span className="emi-chevron" data-ouvert={!!ouvert} style={{ color: t.ic, display: 'flex' }}><Icone nom="chevron" taille={13} epaisseur={2.2} /></span>}
    </>
  );
  const st: React.CSSProperties = {
    background: ouvert ? NAVY : t.bg, color: ouvert ? 'white' : t.fg,
    border: `1px solid ${ouvert ? NAVY : t.bd}`,
    boxShadow: ouvert ? '0 6px 16px -8px rgba(26,35,50,.9)' : 'none',
  };
  if (!onClick) return <span className="emi-puce" style={{ ...st, cursor: 'default' }}>{contenu}</span>;
  return <button type="button" className="emi-puce" onClick={onClick} style={st}>{contenu}</button>;
}

export function BandeauMarche({ p }: { p: any }) {
  const [ouvert, setOuvert] = useState<null | 'date' | 'prix'>(null);
  const pts = seriePrix(p);
  const baisse = p.prix_initial && p.prix ? Number(p.prix_initial) - Number(p.prix) : 0;
  const baissePct = baisse > 0 && p.prix_initial ? (baisse / Number(p.prix_initial)) * 100 : 0;
  const nbBaisses = p.nb_baisses || Math.max(pts.length - 1, 0);
  const aDuPrix = pts.length >= 2 || nbBaisses > 0;

  if (!p.date_publication && !nbBaisses && !p.nb_agences && !p.agence && !p.portail) return null;

  const bascule = (v: 'date' | 'prix') => setOuvert(o => (o === v ? null : v));

  return (
    <div style={{ background: '#f7f9fc', border: `1px solid ${BORD}`, borderRadius: 14, padding: '9px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#9aa8bd', textTransform: 'uppercase', letterSpacing: 1, marginRight: 2 }}>Marché</span>

        {p.date_publication && (
          <Puce icone="horloge" onClick={() => bascule('date')} ouvert={ouvert === 'date'}>
            en ligne depuis {anciennete(p.date_publication)}
          </Puce>
        )}

        {aDuPrix && (
          <Puce icone="baisse" ton={baissePct >= 8 ? 'vert' : 'neutre'}
            onClick={() => bascule('prix')} ouvert={ouvert === 'prix'}>
            {nbBaisses > 0 ? `${nbBaisses} baisse${nbBaisses > 1 ? 's' : ''}` : 'Historique du prix'}
            {baisse > 0 && ` · − ${baisse.toLocaleString('fr-FR')} €`}
          </Puce>
        )}

        {p.nb_agences ? (
          <Puce icone="maison" ton={p.nb_agences >= 3 ? 'vert' : 'neutre'}>
            {p.nb_agences} agence{p.nb_agences > 1 ? 's' : ''}
          </Puce>
        ) : null}
        {p.agence && <Puce>{p.agence}</Puce>}
        {p.portail && <Puce>{p.portail}</Puce>}
      </div>

      {/* volet : la date exacte */}
      <div className="emi-volet" data-ouvert={ouvert === 'date'}>
        <div>
          <div style={{ background: 'white', border: `1px solid ${BORD}`, borderRadius: 12, padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: 22 }}>
            <Ligne lib="Première mise en ligne" val={jour(p.date_publication)} />
            <Ligne lib="Sur le marché depuis" val={anciennete(p.date_publication) || '—'} />
            {p.date_derniere_baisse && <Ligne lib="Dernier changement de prix" val={jour(p.date_derniere_baisse)} />}
            {p.agence && <Ligne lib="Mandat" val={p.agence} />}
          </div>
        </div>
      </div>

      {/* volet : l'historique du prix */}
      <div className="emi-volet" data-ouvert={ouvert === 'prix'}>
        <div>
          <div style={{ background: 'white', border: `1px solid ${BORD}`, borderRadius: 12, padding: '12px 14px 8px' }}>
            {pts.length >= 2 ? (
              <>
                <GraphePrix points={pts} />
                <div style={{ marginTop: 6 }}>
                  {pts.map((x, i) => {
                    const d = i === 0 ? 0 : x.prix - pts[i - 1].prix;
                    const pc = i === 0 || !pts[i - 1].prix ? 0 : (d / pts[i - 1].prix) * 100;
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '7px 2px',
                        borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', fontSize: 13,
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: i === 0 ? '#cbd5e1' : d < 0 ? '#16a34a' : '#ef4444', flexShrink: 0 }} />
                        <span style={{ color: '#64748b', minWidth: 112 }}>{jour(x.date)}</span>
                        <span style={{ fontWeight: 800, color: NAVY, minWidth: 104 }}>{x.prix.toLocaleString('fr-FR')} €</span>
                        {i === 0
                          ? <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>prix de mise en ligne</span>
                          : <span style={{ fontWeight: 700, color: d < 0 ? '#15803d' : '#b91c1c' }}>
                              {d < 0 ? '−' : '+'} {Math.abs(d).toLocaleString('fr-FR')} €
                              <span style={{ fontWeight: 600, opacity: .7 }}> ({pc > 0 ? '+' : ''}{pc.toFixed(1).replace('.', ',')} %)</span>
                            </span>}
                      </div>
                    );
                  })}
                </div>
                {baisse > 0 && (
                  <div style={{ marginTop: 6, borderTop: `2px solid ${BORD}`, paddingTop: 9, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#9aa8bd', textTransform: 'uppercase', letterSpacing: .8 }}>
                      Depuis la mise en ligne
                    </span>
                    <span style={{ fontSize: 15.5, fontWeight: 800, color: '#15803d' }}>
                      − {baisse.toLocaleString('fr-FR')} €
                      <span style={{ fontSize: 13, fontWeight: 700, opacity: .75 }}> ({baissePct.toFixed(1).replace('.', ',')} %)</span>
                    </span>
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#b6c1d1', marginTop: 8, marginBottom: 4 }}>Source : Yanport</div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#94a3b8', padding: '6px 0 10px' }}>
                {nbBaisses > 0
                  ? `Yanport signale ${nbBaisses} baisse${nbBaisses > 1 ? 's' : ''}, mais le détail n'a pas encore été récupéré. La prochaine veille le complétera.`
                  : "Aucun historique de prix récupéré pour l'instant."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Ligne({ lib, val }: { lib: string; val: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#9aa8bd', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 3 }}>{lib}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{val}</div>
    </div>
  );
}

/* ══ Onglets glissants ═════════════════════════════════════════ */

export function Onglets({ items, actif, onChange }: {
  items: { id: string; icone: string; nom: string; compte?: number | null; dore?: boolean }[];
  actif: string; onChange: (id: string) => void;
}) {
  return (
    <div style={{
      display: 'flex', gap: 3, flexWrap: 'wrap', background: '#eef2f7',
      border: `1px solid ${BORD}`, borderBottom: 'none',
      borderRadius: '16px 16px 0 0', padding: '6px 6px 0', marginBottom: 0,
    }}>
      {items.map(t => (
        <button key={t.id} type="button" className="emi-onglet" data-actif={actif === t.id}
          onClick={() => onChange(t.id)}>
          {actif === t.id && <span className="emi-pouls" />}
          <span style={{ display: 'flex', opacity: actif === t.id ? 1 : .62 }}>
            <Icone nom={t.icone} taille={16} epaisseur={actif === t.id ? 2 : 1.8} />
          </span>
          <span>{t.nom}</span>
          {t.compte != null && t.compte > 0 && (
            <span className={`emi-compteur${t.dore && actif !== t.id ? ' dore' : ''}`}>{t.compte}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ══ Chronologie ═══════════════════════════════════════════════ */

const PUCES: Record<string, { c: string; l: string; i: string }> = {
  veille_trouve: { c: '#94a3b8', l: 'Trouvé par la veille', i: '🔎' },
  bien_ajoute: { c: '#3b82f6', l: 'Retenu', i: '📋' },
  envoi_bien: { c: OR, l: 'Envoyé au client', i: '📤' },
  retour_client: { c: '#10b981', l: 'Retour du client', i: '💬' },
  visite: { c: '#8b5cf6', l: 'Visite planifiée', i: '📅' },
  compte_rendu_visite: { c: '#8b5cf6', l: 'Compte-rendu de visite', i: '🔑' },
  offre_faite: { c: '#ef4444', l: 'Offre', i: '✍️' },
  espace_fiche: { c: '#3b82f6', l: 'Fiche consultée', i: '👁️' },
  espace_partage: { c: '#0ea5e9', l: 'Fiche partagée', i: '↗️' },
};

export function Frise({ bienId, rafraichir }: { bienId: string; rafraichir?: number }) {
  const [lignes, setLignes] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    setChargement(true);
    const [j, v, e] = await Promise.all([
      supabase.from('journal').select('*').eq('bien_id', bienId).order('created_at', { ascending: false }),
      supabase.from('visites').select('*').eq('bien_id', bienId).order('date_visite', { ascending: false }),
      supabase.from('espace_evenements').select('*').eq('bien_id', bienId)
        .in('type', ['fiche', 'partage']).order('created_at', { ascending: false }),
    ]);
    const dv = (v.data || []).map((x: any) => ({
      id: 'v-' + x.id,
      type: x.statut === 'effectuee' ? 'compte_rendu_visite' : 'visite',
      titre: x.statut === 'effectuee' ? `Visite effectuée${x.note_etoiles ? ' · ' + '⭐'.repeat(x.note_etoiles) : ''}` : 'Visite planifiée',
      description: x.commentaire || null,
      created_at: x.date_visite || x.created_at,
    }));
    const de = (e.data || []).map((x: any) => ({
      id: 'e-' + x.id,
      type: x.type === 'partage' ? 'espace_partage' : 'espace_fiche',
      titre: x.type === 'partage' ? 'Fiche partagée par le client' : 'Fiche consultée par le client',
      description: x.type === 'partage' ? x.detail : null,
      created_at: x.created_at,
    }));
    setLignes([...(j.data || []), ...dv, ...de].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    setChargement(false);
  }, [bienId]);

  useEffect(() => { charger(); }, [charger, rafraichir]);

  if (chargement) return <div style={{ padding: '14px 0', color: '#94a3b8', fontSize: 13 }}>Chargement…</div>;
  if (!lignes.length) return <div style={{ padding: '14px 0', color: '#94a3b8', fontSize: 13 }}>Aucune étape enregistrée pour l&apos;instant.</div>;

  return (
    <div style={{ position: 'relative', paddingLeft: 26 }}>
      <div style={{ position: 'absolute', left: 10, top: 10, bottom: 10, width: 2, background: BORD, borderRadius: 2 }} />
      {lignes.map((l, n) => {
        const p = PUCES[l.type] || { c: '#cbd5e1', l: l.type, i: '•' };
        const d = new Date(l.created_at);
        return (
          <div key={l.id} style={{ position: 'relative', paddingBottom: n === lignes.length - 1 ? 2 : 16 }}>
            <span style={{
              position: 'absolute', left: -26, top: 1, width: 22, height: 22, borderRadius: '50%',
              background: 'white', border: `2px solid ${p.c}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 10,
            }}>{p.i}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{l.titre || p.l}</span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })} · {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {l.description && (
              <div style={{ fontSize: 13, color: '#475569', marginTop: 3, lineHeight: 1.6, fontStyle: 'italic' }}>« {l.description} »</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ══ Score ═════════════════════════════════════════════════════ */

export function ModaleScore({ p, onFerme }: { p: any; onFerme: () => void }) {
  const score = p.score ?? 0;
  const teinte = score >= 85 ? '#10b981' : score >= 70 ? OR : '#94a3b8';
  const mention = score >= 85 ? 'Coche tout ce qui compte' : score >= 70 ? 'Mérite un regard' : 'À la limite';

  const Lgn = ({ icone, titre, texte, couleur }: any) => (
    <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: `${couleur}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{icone}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: couleur, marginBottom: 2 }}>{titre}</div>
        <div style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.6 }}>{texte}</div>
      </div>
    </div>
  );

  return (
    <Modale onFerme={onFerme} largeur={520}>
      <div style={{ background: NAVY, padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 66, height: 66, borderRadius: 18, background: teinte, color: 'white',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          boxShadow: `0 8px 22px -8px ${teinte}`,
        }}>
          <span style={{ fontSize: 23, fontWeight: 800, lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: 10, opacity: .8, fontWeight: 700 }}>/ 100</span>
        </div>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: OR, textTransform: 'uppercase', letterSpacing: 1 }}>Score de correspondance</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'white', marginTop: 4 }}>{mention}</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>
            {p.titre || `${p.type_bien || 'Bien'} — ${p.ville || ''}`}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Lgn icone="🎯" titre="La base" couleur="#3b82f6"
          texte="Les critères durs de la recherche : budget, surface, nombre de chambres, secteur. Un bien qui n'en coche pas un ne remonte pas jusqu'ici." />
        {!!p.points_forts?.length && (
          <Lgn icone="✓" titre="Ce qui rapporte des points" couleur="#15803d" texte={p.points_forts.join(' · ')} />
        )}
        {!!p.points_attention?.length && (
          <Lgn icone="!" titre="Ce qui en coûte" couleur="#b45309" texte={p.points_attention.join(' · ')} />
        )}
      </div>

      <div style={{ padding: '16px 24px', background: '#fbfcfe', borderTop: `1px solid ${BORD}` }}>
        <div style={{ display: 'flex', gap: 9, marginBottom: 13 }}>
          {[
            { min: '85+', t: 'Coche tout', c: '#10b981' },
            { min: '70–85', t: 'Un point accroche', c: OR },
            { min: '< 70', t: 'Non proposé', c: '#cbd5e1' },
          ].map(x => (
            <div key={x.min} style={{ flex: 1, textAlign: 'center', background: 'white', border: `1px solid ${(score >= 85 && x.min === '85+') || (score >= 70 && score < 85 && x.min === '70–85') ? x.c : BORD}`, borderRadius: 11, padding: '9px 6px' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: x.c }}>{x.min}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{x.t}</div>
            </div>
          ))}
        </div>
        <button type="button" onClick={onFerme}
          style={{ width: '100%', background: NAVY, color: 'white', border: 'none', borderRadius: 11, padding: '11px 0', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Compris
        </button>
      </div>
    </Modale>
  );
}

/* ══ Observation ═══════════════════════════════════════════════ */

const AVIS = [
  { id: 'interesse', label: 'Ça lui plaît', icone: '👍', couleur: '#10b981', fond: '#ecfdf5', bordure: '#a7f3d0', badge: 'interesse' },
  { id: 'souhaite_visiter', label: 'Il veut visiter', icone: '👀', couleur: '#8b5cf6', fond: '#f5f3ff', bordure: '#ddd6fe', badge: 'souhaite_visiter' },
  { id: 'refuse', label: 'Pas pour lui', icone: '👎', couleur: '#ef4444', fond: '#fef2f2', bordure: '#fecaca', badge: 'refuse' },
];

const SUGGESTIONS: Record<string, string[]> = {
  interesse: ['La terrasse lui plaît', 'Bon rapport surface/prix', 'Le quartier lui convient'],
  souhaite_visiter: ['Veut visiter rapidement', 'Disponible en fin de semaine'],
  refuse: ['Trop sombre', 'Séjour trop petit', 'Trop de travaux', 'Rue trop passante', "Pas d'extérieur", 'Hors budget'],
};

export function ModaleObservation({ bien, clientId, onFerme, onEnregistre }: { bien: any; clientId: string; onFerme: () => void; onEnregistre: () => void; }) {
  const [avis, setAvis] = useState<string | null>(null);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const choisi = AVIS.find(a => a.id === avis);

  useEffect(() => { if (choisi) ref.current?.focus(); }, [choisi]);

  async function enregistrer() {
    if (!avis || envoi) return;
    setEnvoi(true);
    const a = AVIS.find(x => x.id === avis)!;
    await supabase.from('biens').update({
      badge_retour: a.badge, retour_client: texte.trim() || a.label, retour_le: new Date().toISOString(),
    }).eq('id', bien.id);
    await supabase.from('journal').insert({
      client_id: clientId, bien_id: bien.id, recherche_id: bien.recherche_id,
      type: 'retour_client', titre: `${a.icone} ${a.label}`, description: texte.trim() || null, metadata: {},
    });
    setEnvoi(false); onEnregistre(); onFerme();
  }

  return (
    <Modale onFerme={onFerme} largeur={540}>
      <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${BORD}`, display: 'flex', gap: 14, alignItems: 'center' }}>
        {bien.photos?.[0] && <img src={bien.photos[0]} alt="" style={{ width: 50, height: 50, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Retour du client</div>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: NAVY, marginTop: 3 }}>
            {bien.titre || `${bien.type_bien || 'Bien'} — ${bien.ville || ''}`}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 17 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {AVIS.map(a => {
            const actif = avis === a.id;
            return (
              <button key={a.id} type="button" onClick={() => setAvis(a.id)}
                style={{
                  flex: 1, background: actif ? a.fond : '#fbfcfe',
                  border: `2px solid ${actif ? a.couleur : BORD}`, borderRadius: 15,
                  padding: '17px 8px', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  transform: actif ? 'translateY(-3px)' : 'none',
                  boxShadow: actif ? `0 10px 22px -10px ${a.couleur}` : 'none',
                  transition: 'all .2s cubic-bezier(.16,1,.3,1)',
                }}>
                <span style={{ fontSize: 28, lineHeight: 1 }}>{a.icone}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: actif ? a.couleur : '#64748b' }}>{a.label}</span>
              </button>
            );
          })}
        </div>

        {choisi && (
          <div className="emi-panneau" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(SUGGESTIONS[choisi.id] || []).map(s => (
                <button key={s} type="button" onClick={() => setTexte(s)}
                  style={{
                    background: texte === s ? choisi.fond : '#f7f9fc',
                    border: `1px solid ${texte === s ? choisi.bordure : BORD}`,
                    color: texte === s ? choisi.couleur : '#64748b',
                    borderRadius: 20, padding: '5px 12px', fontSize: 12.5, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                  }}>{s}</button>
              ))}
            </div>
            <textarea ref={ref} value={texte} onChange={e => setTexte(e.target.value)} rows={3}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enregistrer(); }}
              placeholder="Ses mots à lui, si tu veux les garder…"
              style={{ border: `1px solid ${BORD}`, borderRadius: 12, padding: '11px 13px', fontSize: 14, color: NAVY, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
            <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span>🔎</span>{' '}La veille relit ça demain matin pour affiner la recherche.
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '14px 24px', borderTop: `1px solid ${BORD}`, background: '#fbfcfe', display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
        <button type="button" onClick={onFerme} style={btnSecondaire}>Annuler</button>
        <button type="button" onClick={enregistrer} disabled={!avis || envoi}
          style={{ ...btnPrincipal, background: avis ? NAVY : '#cbd5e1', cursor: avis ? 'pointer' : 'default' }}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </Modale>
  );
}

/* ══ Envoi ═════════════════════════════════════════════════════ */

export function ModaleEnvoi({ bien, clientId, client, onFerme, onEnvoye, onMail }: {
  bien: any; clientId: string; client: any; onFerme: () => void; onEnvoye: () => void; onMail: (bienId: string) => void;
}) {
  const [type, setType] = useState<'pourcentage' | 'fixe'>(bien.commission_type === 'fixe' ? 'fixe' : 'pourcentage');
  const [valeur, setValeur] = useState<string>(bien.commission_val ? String(bien.commission_val) : (bien.commission_type === 'fixe' ? '25000' : '3'));
  const [envoi, setEnvoi] = useState(false);
  const [copie, setCopie] = useState(false);

  const base = Number(bien.prix_vendeur) || 0;
  const v = parseFloat(String(valeur).replace(',', '.')) || 0;
  const honoraires = type === 'pourcentage' ? Math.round(base * (v / 100)) : Math.round(v);
  const total = base + honoraires;
  const pctEq = base > 0 ? (honoraires / base) * 100 : 0;

  async function marquer(canal: string) {
    setEnvoi(true);
    await supabase.from('biens').update({
      etape: 'presente', envoye_le: new Date().toISOString(), canal_envoi: canal,
      commission_type: type, commission_val: v, prix_acquereur: total, badge_retour: 'propose',
    }).eq('id', bien.id);
    await supabase.from('journal').insert({
      client_id: clientId, bien_id: bien.id, recherche_id: bien.recherche_id, type: 'envoi_bien',
      titre: `Envoyé au client · ${canal === 'mail' ? 'mail' : canal === 'whatsapp' ? 'WhatsApp' : 'lien'}`,
      description: `Prix présenté ${total.toLocaleString('fr-FR')} € — dont ${honoraires.toLocaleString('fr-FR')} € d'honoraires de chasse`,
      metadata: {},
    });
    setEnvoi(false); onEnvoye();
  }

  /* Choisir « par mail » n'est pas envoyer : ça ouvre la fenêtre de rédaction,
     et on peut encore annuler. On n'enregistre donc que les honoraires qu'on
     vient de fixer ; le passage en « Présenté » se fait à l'envoi réel. */
  async function enregistrerPrix() {
    setEnvoi(true);
    await supabase.from('biens').update({
      commission_type: type, commission_val: v, prix_acquereur: total,
    }).eq('id', bien.id);
    setEnvoi(false);
  }

  /* Le lien envoyé est toujours la fiche vivante, jamais le PDF : c'est la
     seule page où le client peut répondre. Le PDF reste téléchargeable depuis
     son espace, mais il ne remplace pas le lien. */
  const lien = typeof window !== 'undefined' ? `${window.location.origin}/bien/${bien.id}` : '';

  async function viaWhatsapp() {
    const txt = `Bonjour ${client?.prenom || ''}, voici un bien qui correspond à votre recherche :\n\n${bien.titre || ''}\n${bien.surface ? bien.surface + ' m²' : ''}${bien.nb_pieces ? ' · ' + bien.nb_pieces + ' pièces' : ''}\nPrix : ${total.toLocaleString('fr-FR')} € tout compris\n\n${lien}`;
    await marquer('whatsapp');
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
    onFerme();
  }
  async function viaLien() {
    try { await navigator.clipboard.writeText(lien); setCopie(true); } catch { /* ignore */ }
    await marquer('lien'); setTimeout(onFerme, 800);
  }
  async function viaMail() { await enregistrerPrix(); onFerme(); onMail(bien.id); }

  const canal = (icone: string, titre: string, sous: string, action: () => void, teinte: string) => (
    <button type="button" onClick={action} disabled={envoi}
      style={{
        display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left',
        background: 'white', border: `1.5px solid ${BORD}`, borderRadius: 14, padding: '13px 15px',
        cursor: envoi ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'all .18s cubic-bezier(.16,1,.3,1)',
      }}
      onMouseEnter={e => { if (!envoi) { e.currentTarget.style.borderColor = teinte; e.currentTarget.style.transform = 'translateX(4px)'; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = BORD; e.currentTarget.style.transform = 'none'; }}>
      <span style={{ width: 38, height: 38, borderRadius: 11, background: `${teinte}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0 }}>{icone}</span>
      <span style={{ flexGrow: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: NAVY }}>{titre}</span>
        <span style={{ display: 'block', fontSize: 12.5, color: '#94a3b8', marginTop: 1 }}>{sous}</span>
      </span>
      <span style={{ color: '#cbd5e1', fontSize: 19 }}>›</span>
    </button>
  );

  const bascule = (id: 'pourcentage' | 'fixe', label: string) => {
    const actif = type === id;
    return (
      <button type="button" onClick={() => { setType(id); setValeur(id === 'pourcentage' ? '3' : '25000'); }}
        style={{
          flex: 1, background: actif ? 'white' : 'transparent', color: actif ? NAVY : '#94a3b8',
          border: 'none', borderRadius: 9, padding: '8px 0', fontSize: 13, fontWeight: actif ? 800 : 600,
          cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: actif ? '0 2px 6px rgba(16,24,40,.14)' : 'none', transition: 'all .2s cubic-bezier(.16,1,.3,1)',
        }}>{label}</button>
    );
  };

  return (
    <Modale onFerme={onFerme} largeur={545}>
      <div style={{ background: NAVY, padding: '20px 24px', display: 'flex', gap: 14, alignItems: 'center' }}>
        {bien.photos?.[0] && <img src={bien.photos[0]} alt="" style={{ width: 54, height: 54, borderRadius: 13, objectFit: 'cover', flexShrink: 0 }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: OR, textTransform: 'uppercase', letterSpacing: 1 }}>
            Envoyer à {client?.prenom || 'votre client'}
          </div>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: 'white', marginTop: 3, lineHeight: 1.3 }}>
            {bien.titre || `${bien.type_bien || 'Bien'} — ${bien.ville || ''}`}
          </div>
        </div>
      </div>

      <div style={{ padding: '18px 24px', borderBottom: `1px solid ${BORD}`, background: '#fbfcfe' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5, color: '#64748b', marginBottom: 14 }}>
          <span>Prix de l&apos;annonce</span>
          <span style={{ fontWeight: 700, color: NAVY, fontSize: 15 }}>{base.toLocaleString('fr-FR')} €</span>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 9 }}>
          Tes honoraires de chasse
        </div>

        <div style={{ display: 'flex', gap: 11, alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', background: '#eef2f7', borderRadius: 11, padding: 3, width: 180, flexShrink: 0 }}>
            {bascule('pourcentage', '% du prix')}
            {bascule('fixe', 'Montant fixe')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexGrow: 1 }}>
            <input type="number" step={type === 'pourcentage' ? '0.1' : '500'} min="0" value={valeur}
              onChange={e => setValeur(e.target.value)}
              style={{ width: '100%', border: `1.5px solid ${BORD}`, borderRadius: 11, padding: '10px 13px', fontSize: 15, fontWeight: 700, color: NAVY, fontFamily: 'inherit', textAlign: 'right', outline: 'none' }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#64748b', width: 14 }}>{type === 'pourcentage' ? '%' : '€'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5, color: '#64748b', marginBottom: 13 }}>
          <span>Soit</span>
          <span style={{ fontWeight: 700, color: NAVY }}>
            + {honoraires.toLocaleString('fr-FR')} €
            {type === 'fixe' && base > 0 && <span style={{ color: '#94a3b8', fontWeight: 500, fontSize: 12.5 }}> ({pctEq.toFixed(1)} %)</span>}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, borderTop: `2px solid ${BORD}` }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: .8 }}>Prix présenté</span>
          <span style={{ fontSize: 26, fontWeight: 800, color: OR, letterSpacing: -.6 }}>{total.toLocaleString('fr-FR')} €</span>
        </div>
        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4, textAlign: 'right' }}>tout compris, honoraires de chasse inclus</div>
      </div>

      <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {canal('✉️', 'Par mail', 'Ouvre ta fenêtre d’envoi habituelle', viaMail, '#3b82f6')}
        {canal('💬', 'WhatsApp', 'Message pré-rempli avec le lien', viaWhatsapp, '#25d366')}
        {canal('🔗', copie ? 'Lien copié ✓' : 'Copier le lien', bien.pdf_url ? 'Le PDF client' : 'La fiche du bien', viaLien, OR)}
      </div>

      <div style={{ padding: '13px 24px', borderTop: `1px solid ${BORD}`, background: '#fbfcfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Le bien passera dans « Présentés »</span>
        <button type="button" onClick={onFerme} style={btnSecondaire}>Fermer</button>
      </div>
    </Modale>
  );
}

const btnSecondaire: React.CSSProperties = {
  background: 'white', border: `1px solid ${BORD}`, color: '#64748b', borderRadius: 11,
  padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};
const btnPrincipal: React.CSSProperties = {
  background: NAVY, color: 'white', border: 'none', borderRadius: 11,
  padding: '10px 22px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};

/* ══ Le lien de l'espace acheteur ══════════════════════════════ */

const EVT: Record<string, { i: string; l: string; c: string }> = {
  ouverture: { i: '🔓', l: 'A ouvert son espace', c: '#3b82f6' },
  fiche:     { i: '👁️', l: 'A consulté', c: '#3b82f6' },
  avis:      { i: '💬', l: 'A donné son avis', c: '#10b981' },
  partage:   { i: '↗️', l: 'A partagé une fiche', c: '#0ea5e9' },
  message:   { i: '✉️', l: 'A écrit un message', c: OR },
  criteres:  { i: '🎯', l: 'A modifié ses critères', c: '#8b5cf6' },
};

export function LienEspace({ recherche, client }: { recherche: any; client: any }) {
  const [copie, setCopie] = useState(false);
  const [ouvertures, setOuvertures] = useState<number | null>(null);
  const [deplie, setDeplie] = useState(false);
  const [evts, setEvts] = useState<any[] | null>(null);

  const token = recherche?.token_espace;
  const url = token && typeof window !== 'undefined' ? `${window.location.origin}/espace/${token}` : '';

  useEffect(() => {
    if (!recherche?.id) return;
    supabase.from('espace_evenements')
      .select('id', { count: 'exact', head: true })
      .eq('recherche_id', recherche.id).eq('type', 'ouverture')
      .then(({ count }) => setOuvertures(count ?? 0));
  }, [recherche?.id]);

  useEffect(() => {
    if (!deplie || evts || !recherche?.id) return;
    supabase.from('espace_evenements').select('*')
      .eq('recherche_id', recherche.id)
      .order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => setEvts(data || []));
  }, [deplie, evts, recherche?.id]);

  if (!token) {
    return (
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 14px', fontSize: 12.5, color: '#92400e', fontWeight: 600 }}>
        Cette recherche n&apos;a pas encore de lien d&apos;espace — lance la migration SQL de l&apos;espace acheteur.
      </div>
    );
  }

  const copier = async () => {
    try { await navigator.clipboard.writeText(url); setCopie(true); setTimeout(() => setCopie(false), 2200); } catch { /* ignore */ }
  };

  const whatsapp = () => {
    const txt = `Bonjour ${client?.prenom || ''}, voici votre espace de recherche, il est à jour tous les matins :\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
  };

  const derniere = recherche.espace_ouvert_le ? new Date(recherche.espace_ouvert_le) : null;
  const quand = derniere
    ? (derniere.toDateString() === new Date().toDateString()
        ? `ouvert aujourd'hui à ${derniere.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
        : `ouvert le ${derniere.toLocaleDateString('fr-FR')}`)
    : 'jamais ouvert';

  return (
    <div style={{
      background: 'white', border: `1px solid ${BORD}`, borderRadius: 13,
      boxShadow: '0 1px 2px rgba(16,24,40,.04)', overflow: 'hidden',
    }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 13px' }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: '#9aa8bd', textTransform: 'uppercase', letterSpacing: 1 }}>
        Espace client
      </span>
      <code style={{
        fontSize: 11.5, color: '#64748b', background: '#f7f9fc', border: `1px solid ${BORD}`,
        borderRadius: 7, padding: '4px 9px', maxWidth: 190, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace',
      }}>/espace/{String(token).slice(0, 12)}…</code>

      <button type="button" onClick={copier} style={btnEspace(copie ? '#ecfdf5' : '#f7f9fc', copie ? '#059669' : '#475569', copie ? '#a7f3d0' : BORD)}>
        {copie ? '✓ Copié' : 'Copier le lien'}
      </button>
      <button type="button" onClick={whatsapp} style={btnEspace('#f0fdf4', '#15803d', '#bbf7d0')}>WhatsApp</button>
      <a href={url} target="_blank" rel="noopener noreferrer" style={btnEspace('#f7f9fc', '#475569', BORD)}>Ouvrir</a>

      <button type="button" onClick={() => setDeplie(d => !d)}
        style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7,
          background: derniere ? '#f0fdf4' : '#f7f9fc', border: `1px solid ${derniere ? '#bbf7d0' : BORD}`,
          borderRadius: 9, padding: '5px 11px', fontSize: 12, fontWeight: 700,
          color: derniere ? '#15803d' : '#94a3b8', cursor: 'pointer', fontFamily: 'inherit',
        }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: derniere ? '#10b981' : '#cbd5e1' }} />
        {quand}{ouvertures ? ` · ${ouvertures} visite${ouvertures > 1 ? 's' : ''}` : ''}
        <span style={{ transition: 'transform .25s', transform: deplie ? 'rotate(180deg)' : 'none', display: 'inline-flex' }}>
          <Icone nom="chevron" taille={13} epaisseur={2.2} />
        </span>
      </button>
    </div>

    {deplie && (
      <div style={{ borderTop: `1px solid ${BORD}`, background: '#fbfcfe', padding: '12px 15px', maxHeight: 340, overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#9aa8bd', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          Ce qu&apos;il a fait dans son espace
        </div>
        {evts === null && <div style={{ fontSize: 13, color: '#94a3b8' }}>Chargement…</div>}
        {evts?.length === 0 && (
          <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
            Il n&apos;a jamais ouvert son espace. Envoie-lui le lien par WhatsApp.
          </div>
        )}
        {evts?.map((e) => {
          const t = EVT[e.type] || { i: '•', l: e.type, c: '#94a3b8' };
          const d = new Date(e.created_at);
          /* Avant on n'affichait que l'heure le jour même, et que la date les
             autres jours : impossible de savoir si « 18:00 » c'était ce soir
             ou la semaine dernière. Maintenant on donne les deux. */
          const auj = d.toDateString() === new Date().toDateString();
          const hier = new Date(Date.now() - 86400000).toDateString() === d.toDateString();
          const quand = (auj ? "aujourd'hui" : hier ? 'hier' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }))
            + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          return (
            <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 0', borderTop: `1px solid #f1f5f9` }}>
              <span style={{ fontSize: 13, width: 18, flexShrink: 0 }}>{t.i}</span>
              <span style={{ minWidth: 0, flexGrow: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{t.l}</span>
                {e.detail && <span style={{ fontSize: 13, color: '#475569' }}> — {e.detail}</span>}
              </span>
              <span style={{ fontSize: 11.5, color: '#94a3b8', flexShrink: 0, fontWeight: 600 }}>
                {quand}
              </span>
            </div>
          );
        })}
      </div>
    )}
    </div>
  );
}

function btnEspace(bg: string, fg: string, bd: string): React.CSSProperties {
  return {
    background: bg, color: fg, border: `1px solid ${bd}`, borderRadius: 9, padding: '5px 11px',
    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 5,
  };
}

/* ══ Bouton d'action de carte ══════════════════════════════════ */

export function Action({ children, onClick, href, ton = 'neutre', disabled }: {
  children: React.ReactNode; onClick?: () => void; href?: string;
  ton?: 'navy' | 'or' | 'neutre' | 'violet'; disabled?: boolean;
}) {
  const t = {
    navy: { bg: NAVY, fg: 'white', bd: NAVY },
    or: { bg: OR, fg: 'white', bd: OR },
    violet: { bg: '#f5f3ff', fg: '#7c3aed', bd: '#ddd6fe' },
    neutre: { bg: 'white', fg: '#475569', bd: BORD },
  }[ton];
  const st: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, borderRadius: 11,
    padding: '9px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
    textDecoration: 'none', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap',
    opacity: disabled ? .5 : 1, transition: 'transform .16s ease, box-shadow .16s ease, background .16s ease',
  };
  const surv = (e: any, entre: boolean) => {
    if (disabled) return;
    e.currentTarget.style.transform = entre ? 'translateY(-1.5px)' : 'none';
    e.currentTarget.style.boxShadow = entre ? '0 10px 20px -12px rgba(16,24,40,.6)' : 'none';
  };
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" style={st} onMouseEnter={e => surv(e, true)} onMouseLeave={e => surv(e, false)}>{children}</a>;
  return <button type="button" onClick={onClick} disabled={disabled} style={st} onMouseEnter={e => surv(e, true)} onMouseLeave={e => surv(e, false)}>{children}</button>;
}
