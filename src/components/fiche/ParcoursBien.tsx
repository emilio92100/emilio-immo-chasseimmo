'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { programmerRelance, cloturerRelancesAuto } from '@/lib/relances';
import { lienEspace, lienBienPublic } from '@/lib/jeton';

/**
 * Briques partagées par les onglets Veille, Sélection et Présentés.
 *
 *  <Icone>          jeu de pictos au trait
 *  <Vignettes>      bandeau de photos carrées + visionneuse
 *  <Specs>          surface / pièces / chambres / séjour… en pictos
 *  <BandeauMarche>  ancienneté, baisses de prix et diffuseurs, en volets dépliants
 *  <diffuseurs>     la liste des agences d'un même bien, dédoublonnée et triée par prix
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
      .emi-ligne { transition: box-shadow .16s ease, border-color .16s ease }
      .emi-ligne:hover { box-shadow: 0 1px 2px rgba(16,24,40,.05), 0 8px 20px -14px rgba(16,24,40,.45) }

      /* ── bandeau de photos ─────────────────────────────── */
      .emi-vignette { position:relative; flex:1 1 0; min-width:88px; max-width:158px; aspect-ratio:1/1;
        border-radius:12px; overflow:hidden; background:#e8edf3; cursor:zoom-in; border:none; padding:0;
        transition: transform .24s cubic-bezier(.16,1,.3,1), box-shadow .24s ease }
      .emi-vignette img { width:100%; height:100%; object-fit:cover; display:block;
        transition: transform .5s cubic-bezier(.16,1,.3,1), filter .24s ease }
      .emi-vignette:hover { transform: translateY(-3px); box-shadow: 0 12px 24px -12px rgba(16,24,40,.5); z-index:2 }
      .emi-vignette:hover img { transform: scale(1.07) }
      .emi-bande { display:flex; gap:7px; align-items:stretch }
      /* Le bouton « Voir le plan », posé sur le bas du bandeau de photos. */
      .emi-voir-plan { display:inline-flex; align-items:center; gap:7px; background:rgba(255,255,255,.96); color:#1a2332;
        border:none; border-radius:20px; padding:7px 13px; font-size:12px; font-weight:800; cursor:pointer;
        font-family:inherit; box-shadow:0 6px 16px -8px rgba(16,24,40,.55); transition: transform .18s ease }
      .emi-voir-plan:hover { transform: translateY(-1px) }

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
        border-radius:13px 13px 0 0; padding:11px 16px 12px; font-size:13.5px; font-weight:600;
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

      /* ─── La barre du suivi, sur fond bleu profond ───
         Le contraste fait le travail : au-dessus le brief du client, en dessous
         ce qu'on fait pour lui. On ne les confond plus. */
      .emi-onglets.sombre .emi-onglet { color:rgba(255,255,255,.66) }
      .emi-onglets.sombre .emi-onglet:hover { color:#fff; background:rgba(255,255,255,.09) }
      .emi-onglets.sombre .emi-onglet[data-actif="true"] { color:${NAVY}; background:#f7f9fc; border-color:transparent }
      /* Le filet doré du haut faisait doublon avec le blanc de l'onglet, qui
         suffit à dire lequel est ouvert. */
      .emi-onglets.sombre .emi-onglet[data-actif="true"]::before { display:none }
      .emi-onglets.sombre .emi-compteur { background:rgba(255,255,255,.15); color:#fff }
      .emi-onglets.sombre .emi-onglet[data-actif="true"] .emi-compteur { background:rgba(26,35,50,.1); color:${NAVY} }

      /* Le raccord de l'onglet au panneau. Deux quarts de cercle peints dans la
         couleur du panneau, de part et d'autre : l'onglet cesse d'être un
         rectangle posé là, il se fond dans la page comme un intercalaire. */
      .emi-onglets.sombre .emi-onglet[data-actif="true"]::after {
        content:""; position:absolute; bottom:0; left:-11px; right:-11px; height:11px;
        pointer-events:none;
        background:
          radial-gradient(circle at 0 0, transparent 11px, #f7f9fc 11.5px) left bottom / 11px 11px no-repeat,
          radial-gradient(circle at 100% 0, transparent 11px, #f7f9fc 11.5px) right bottom / 11px 11px no-repeat;
      }
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
  lien: ['M10.4 13.6a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 1 0-6-6l-1.5 1.5', 'M13.6 10.4a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 1 0 6 6l1.5-1.5'],
  coche: ['m4 12.5 5 5L20 6.5'],
  carte: ['M3.5 4.5h7v7h-7z', 'M13.5 4.5h7v7h-7z', 'M3.5 14.5h7v5h-7z', 'M13.5 14.5h7v5h-7z'],
  lignes: ['M3.5 6.5h17', 'M3.5 12h17', 'M3.5 17.5h17'],
  envoyer: ['M21.4 2.6 2.6 10.3l7.2 2.9 2.9 7.2z', 'M21.4 2.6 9.8 13.2'],
  alerte: ['M12 9v4.2', 'M12 17.2h.01', 'M10.3 3.9 2.4 17.6A1.9 1.9 0 0 0 4 20.5h16a1.9 1.9 0 0 0 1.6-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0z'],
  /* Les pictos de la version téléphone : barre du bas, menu, fiche. */
  accueil: ['M3.5 10.6 12 3.8l8.5 6.8', 'M5.8 9v10.2a1.3 1.3 0 0 0 1.3 1.3h9.8a1.3 1.3 0 0 0 1.3-1.3V9', 'M9.8 20.5v-5.6h4.4v5.6'],
  clients: ['c:9,8,3.4', 'M2.8 19.8a6.2 6.2 0 0 1 12.4 0', 'M15.6 4.9a3.3 3.3 0 0 1 0 6.3', 'M17.8 13.8a5.8 5.8 0 0 1 3.4 6'],
  plus: ['M12 5v14', 'M5 12h14'],
  cloche: ['M6.2 16.8V11a5.8 5.8 0 0 1 11.6 0v5.8l1.7 2H4.5z', 'M10 21.2h4'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  fermer: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  activite: ['M3.5 20.5h17', 'M7 17v-5', 'M12 17V6.5', 'M17 17v-8'],
  reglages: ['M4 6.5h9', 'M18.5 6.5H20', 'c:15.8,6.5,2.2', 'M4 12h3', 'M11.5 12H20', 'c:9.2,12,2.2', 'M4 17.5h11', 'c:17.2,17.5,2.2'],
  retour: ['M19 12H5.5', 'm11.5 18-6-6 6-6'],
  corbeille: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12', 'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'],
  note: ['M5 4.5h14a1 1 0 0 1 1 1v10.2L15.7 20H5a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z', 'M15.5 20v-3.8a.7.7 0 0 1 .7-.7H20', 'M8 9h8', 'M8 12.5h5'],
  /* Les équipements d'un bien, le marché, la note. */
  ascenseur: ['M6 3.5h12a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5z', 'm9 9.5 3-3 3 3', 'm9 14.5 3 3 3-3'],
  cave: ['M3.5 20.5h5v-4.3h4.3v-4.3h4.3V7.6h3.4', 'M3.5 20.5V17'],
  parking: ['M6 3.5h12a2.5 2.5 0 0 1 2.5 2.5v12a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5z', 'M10 16.5v-9h3.2a2.7 2.7 0 0 1 0 5.4H10'],
  boussole: ['c:12,12,9', 'm15.6 8.4-2.3 4.9-4.9 2.3 2.3-4.9z'],
  traversant: ['M3.5 12h17', 'm7.5 8-4 4 4 4', 'm16.5 8 4 4-4 4'],
  cle: ['c:8,15.5,4.2', 'm11 12.5 8.8-8.8', 'm16.8 6.7 2.4 2.4', 'm14.6 8.9 1.9 1.9'],
  arbre: ['M12 21v-5.5', 'M12 3.5a5.5 5.5 0 0 0-4.6 8.5A3.8 3.8 0 0 0 9.5 18.9h5A3.8 3.8 0 0 0 16.6 12 5.5 5.5 0 0 0 12 3.5z'],
  cadenas: ['M6 10.5h12a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19v-7A1.5 1.5 0 0 1 6 10.5z', 'M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7'],
  courbe: ['M3.5 20.5h17', 'm4.5 15.5 4.7-4.7 3.6 2.8 6.7-7.1', 'M15.5 6.5h4v4'],
  cible: ['c:12,12,9', 'c:12,12,5.2', 'c:12,12,1.4'],
  moins: ['M6 12h12'],
  /* Les photos d'un bien : les réorganiser, en retirer. */
  photos: ['M4 6.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'c:9,10,1.6', 'm20 15-4.5-4.5L7 19.5'],
  /* Le plan d'un bien. */
  plan: ['M3.5 5.5h17v13h-17z', 'M10.5 5.5v13', 'M3.5 12h7', 'M10.5 10h10'],
  poignee: ['c:9,6.5,1', 'c:15,6.5,1', 'c:9,12,1', 'c:15,12,1', 'c:9,17.5,1', 'c:15,17.5,1'],
  etoile: ['m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'],
  remettre: ['M4 12a8 8 0 1 0 2.4-5.7', 'M4 4.5v4h4'],
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
    <div className="emi-voile" data-nu={nu ? 'true' : undefined} onClick={onFerme}
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

export function Vignettes({ photos, plans, max = 7, coinGauche, coinDroit }: {
  photos: string[]; plans?: string[]; max?: number; coinGauche?: React.ReactNode; coinDroit?: React.ReactNode;
}) {
  const [lb, setLb] = useState<number | null>(null);
  /* Le plan ne se mêle pas aux photos : un bouton « Voir le plan », posé sur le
     bas du bandeau, l'ouvre en grand sur fond blanc — un plan se lit trait par
     trait, pas sur du noir. */
  const [lbPlan, setLbPlan] = useState<number | null>(null);
  const nettes = (photos || []).filter(Boolean);
  const lesPlans = (plans || []).filter(Boolean);
  const visibles = nettes.slice(0, max);
  const reste = nettes.length - visibles.length;
  const boutonPlan = lesPlans.length > 0 && (
    <div style={{ position: 'absolute', bottom: 10, left: 24, zIndex: 3 }}>
      <button type="button" className="emi-voir-plan" onClick={() => setLbPlan(0)}>
        <Icone nom="plan" taille={15} epaisseur={2} />{lesPlans.length > 1 ? `Voir les plans · ${lesPlans.length}` : 'Voir le plan'}
      </button>
    </div>
  );
  const visionneusePlan = lbPlan !== null && (
    <Visionneuse photos={lesPlans} depart={lbPlan} onFerme={() => setLbPlan(null)} clair />
  );

  if (!nettes.length) {
    return (
      <>
        <div style={{ padding: '14px 16px 0', position: 'relative' }}>
          <div style={{ height: 96, borderRadius: 12, background: '#f1f5f9', border: `1px dashed ${BORD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12.5, fontWeight: 600 }}>
            Pas de photo dans l&apos;annonce
          </div>
          {boutonPlan}
        </div>
        {visionneusePlan}
      </>
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
        {boutonPlan}
      </div>
      {lb !== null && <Visionneuse photos={nettes} depart={lb} onFerme={() => setLb(null)} />}
      {visionneusePlan}
    </>
  );
}

function Visionneuse({ photos, depart, onFerme, clair }: { photos: string[]; depart: number; onFerme: () => void; clair?: boolean }) {
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
        <img src={photos[i]} alt="" style={{ width: '100%', maxHeight: '76vh', objectFit: 'contain', borderRadius: 16, display: 'block', ...(clair ? { background: '#fff', padding: 14, boxSizing: 'border-box' as const } : {}) }} />
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
              opacity: n === i ? 1 : .55, transition: 'all .2s ease', flex: '0 0 auto', background: clair ? '#fff' : '#000',
            }}>
            <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: clair ? 'contain' : 'cover' }} />
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

/* Une tuile porte trois états, et c'est là tout l'intérêt :
     'ok'    — la tuile répond à un critère que le client a posé  → vert, coché
     'sous'  — elle est en dessous de ce critère                  → ambre, avec l'écart
     rien    — c'est une information, elle ne décide de rien      → neutre
   Sans recherche passée, tout reste neutre : le comportement d'avant. */
export type EtatCritere = 'ok' | 'sous';

const TONS_TUILE = {
  or: { bg: '#fdfaf1', bd: '#ecdcb4', ic: OR, val: NAVY, lib: '#9aa8bd' },
  neutre: { bg: '#f7f9fc', bd: BORD, ic: '#7b8ba3', val: NAVY, lib: '#9aa8bd' },
  ok: { bg: '#f0fdf4', bd: '#bbf7d0', ic: '#16a34a', val: '#15803d', lib: '#15803d' },
  sous: { bg: '#fffbeb', bd: '#fde68a', ic: '#d97706', val: '#b45309', lib: '#92400e' },
};

function Tuile({ icone, contenu, val, lib, ton, etat, note }: {
  icone?: string; contenu?: React.ReactNode; val: React.ReactNode; lib: string;
  ton?: 'or' | 'neutre'; etat?: EtatCritere; note?: string;
}) {
  const t = TONS_TUILE[etat ?? (ton === 'or' ? 'or' : 'neutre')];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9,
      background: t.bg, border: `1px solid ${t.bd}`,
      borderRadius: 13, padding: '7px 13px 7px 8px', minWidth: 0,
    }}>
      <span style={{
        width: 31, height: 31, borderRadius: 10, background: 'white',
        border: `1px solid ${t.bd}`, color: t.ic,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{contenu ?? (icone ? <Icone nom={icone} /> : null)}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: t.val, lineHeight: 1.15, letterSpacing: -.2, whiteSpace: 'nowrap' }}>{val}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 800, color: t.lib, textTransform: 'uppercase', letterSpacing: .7, marginTop: 1, whiteSpace: 'nowrap' }}>
          {note || lib}
          {etat === 'ok' && <span style={{ display: 'flex' }}><Icone nom="coche" taille={10} epaisseur={3} /></span>}
        </span>
      </span>
    </div>
  );
}

/** Confronte le bien aux chiffres que le client a posés. Rien d'inventé :
    un critère absent de la recherche ne juge rien. */
export function jugeSpecs(p: any, r: any): Record<string, EtatCritere> {
  const e: Record<string, EtatCritere> = {};
  if (!r) return e;
  const n = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));
  const cmp = (v: number | null, min: number | null) => (v && min ? (v >= min ? 'ok' : 'sous') : undefined);

  const s = cmp(n(p.surface), n(r.surface_min)); if (s) e.surface = s;
  const c = cmp(n(p.nb_chambres), n(r.chambres_min)); if (c) e.chambres = c;
  const j = cmp(n(p.surface_sejour), n(r.surface_sejour_min)); if (j) e.sejour = j;
  const a = cmp(n(p.annee_construction), n(r.annee_construction_min)); if (a) e.annee = a;
  const x = cmp(n(p.surface_exterieur), n(r.exterieur_surface_min)); if (x) e.exterieur = x;

  if (p.etage !== null && p.etage !== undefined) {
    const et = Number(p.etage);
    const plafond = n(r.etage_max_sans_ascenseur);
    if (r.rdc_exclu && et === 0) e.etage = 'sous';
    else if (!p.ascenseur && plafond !== null && et > plafond) e.etage = 'sous';
    else if (r.rdc_exclu || plafond !== null) e.etage = 'ok';
  }

  if (p.dpe && r.dpe_max) {
    const ordre = 'ABCDEFG';
    const i = ordre.indexOf(String(p.dpe).toUpperCase().slice(0, 1));
    const max = ordre.indexOf(String(r.dpe_max).toUpperCase().slice(0, 1));
    if (i >= 0 && max >= 0) e.dpe = i <= max ? 'ok' : 'sous';
  }
  return e;
}

/** « 3,5 % en dessous » — l'écart, pas la valeur brute. */
function ecartPct(v: any, min: any) {
  const a = Number(v), b = Number(min);
  if (!isFinite(a) || !isFinite(b) || !b) return undefined;
  const d = ((a - b) / b) * 100;
  if (Math.abs(d) < 0.05) return undefined;
  return `${d < 0 ? '−' : '+'} ${Math.abs(d).toFixed(1).replace('.', ',')} %`;
}

export function Specs({ p, recherche }: { p: any; recherche?: any }) {
  const t: React.ReactNode[] = [];
  const k = (n: string) => `sp-${n}`;
  const e = jugeSpecs(p, recherche);

  if (p.surface) t.push(
    <Tuile key={k('s')} icone="surface" val={`${p.surface} m²`} lib="Surface" ton="or"
      etat={e.surface} note={e.surface === 'sous' ? ecartPct(p.surface, recherche?.surface_min) : undefined} />
  );
  if (p.nb_pieces) t.push(<Tuile key={k('p')} icone="pieces" val={p.nb_pieces} lib={p.nb_pieces > 1 ? 'Pièces' : 'Pièce'} />);
  if (p.nb_chambres) t.push(
    <Tuile key={k('c')} icone="lit" val={p.nb_chambres} lib={p.nb_chambres > 1 ? 'Chambres' : 'Chambre'} etat={e.chambres} />
  );
  if (p.surface_sejour) t.push(
    <Tuile key={k('j')} icone="sofa" val={`${p.surface_sejour} m²`} lib="Séjour" etat={e.sejour} />
  );
  if (p.etage != null) t.push(
    <Tuile key={k('e')} icone="immeuble"
      val={p.etage === 0 ? 'RDC' : `${p.etage}ᵉ`}
      lib={p.etage_total ? `sur ${p.etage_total}` : 'Étage'} etat={e.etage} />
  );
  if (p.surface_exterieur) t.push(
    <Tuile key={k('x')} icone="soleil" ton="or" val={`${p.surface_exterieur} m²`}
      lib={p.terrasse ? 'Terrasse' : p.jardin ? 'Jardin' : 'Balcon'} etat={e.exterieur} />
  );
  if (p.annee_construction) t.push(
    <Tuile key={k('a')} icone="calendrier" val={p.annee_construction} lib="Immeuble" etat={e.annee} />
  );
  if (p.nb_lots) t.push(<Tuile key={k('l')} icone="lots" val={p.nb_lots} lib="Lots" />);
  /* Les charges sont un chiffre, pas un équipement : elles ont leur tuile. */
  if (Number(p.charges_trimestrielles) > 0) t.push(
    <Tuile key={k('ch')} icone="euro" val={`${Math.round(Number(p.charges_trimestrielles) * 4).toLocaleString('fr-FR')} €`} lib="Charges / an" />
  );

  const lettre = (v: string, lab: string, etat?: EtatCritere) => {
    const L = String(v).toUpperCase().slice(0, 1);
    const c = DPE_COULEURS[L];
    if (!c) return null;
    return (
      <Tuile key={k(lab)} lib={lab} val={L} etat={etat}
        contenu={<span style={{ background: c.bg, color: c.fg, width: 22, height: 22, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800 }}>{L}</span>} />
    );
  };
  if (p.dpe) { const n = lettre(p.dpe, 'DPE', e.dpe); if (n) t.push(n); }
  if (p.ges) { const n = lettre(p.ges, 'GES'); if (n) t.push(n); }

  if (!t.length) return null;
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{t}</div>;
}

/* ══ Les équipements : ce que le bien a, rangé au même endroit ══
   Exposition, traversant, ascenseur, cave, parking ne sont pas des
   arguments de vente : ce sont des faits. Ils montent ici, sous les
   tuiles, au lieu de traîner dans le texte des points forts.
   Doré et coché = le client l'a demandé dans sa recherche — la
   légende le dit sur la carte, pour ne pas avoir à s'en souvenir. */

/** Le client l'a-t-il demandé ? Coché dans la recherche, ou noté
    « souhaité » / « indispensable ». */
function demande(recherche: any, cle: string) {
  return !!recherche?.[cle] || !!recherche?.exigences?.[cle];
}

export function LigneBien({ p, recherche }: { p: any; recherche?: any }) {
  const items: { texte: string; icone: string; voulu?: boolean }[] = [];
  const texte = `${p.titre || ''} ${p.description || ''}`.toLowerCase();

  if (texte.includes('traversant')) items.push({ texte: 'Traversant', icone: 'traversant' });
  if (p.exposition) {
    /* « sud,ouest » dans la recherche, « Sud-Ouest » dans l'annonce : on
       compare mot à mot, sinon un sud-ouest ne répond jamais à « sud ». */
    const vises = String(recherche?.exposition_souhaitee || '').toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
    const a = String(p.exposition).toLowerCase();
    items.push({ texte: `Exposé ${p.exposition}`, icone: 'boussole', voulu: vises.some(v => a.includes(v) || v.includes(a)) });
  }
  if (p.ascenseur) items.push({ texte: 'Ascenseur', icone: 'ascenseur', voulu: demande(recherche, 'ascenseur') });
  if (p.cave) items.push({ texte: 'Cave', icone: 'cave', voulu: demande(recherche, 'cave') });
  if (p.parking) items.push({ texte: p.nb_parking > 1 ? `${p.nb_parking} parkings` : 'Parking', icone: 'parking', voulu: demande(recherche, 'parking') });
  if (p.terrasse && !p.surface_exterieur) items.push({ texte: 'Terrasse', icone: 'soleil', voulu: demande(recherche, 'terrasse') || demande(recherche, 'exterieur') });
  if (p.balcon && !p.surface_exterieur) items.push({ texte: 'Balcon', icone: 'soleil', voulu: demande(recherche, 'balcon') || demande(recherche, 'exterieur') });
  if (p.jardin && !p.surface_exterieur) items.push({ texte: 'Jardin', icone: 'arbre', voulu: demande(recherche, 'jardin') || demande(recherche, 'exterieur') });
  if (p.gardien) items.push({ texte: 'Gardien', icone: 'cle', voulu: demande(recherche, 'gardien') });

  if (!items.length) return null;
  const duDore = items.some(it => it.voulu);
  return (
    <div className="emi-equipements" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#9aa8bd', textTransform: 'uppercase', letterSpacing: 1 }}>Équipements</span>
        {duDore && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#a17d2c' }}>
            <span style={{ display: 'flex', width: 14, height: 14, borderRadius: '50%', background: OR, color: 'white', alignItems: 'center', justifyContent: 'center' }}>
              <Icone nom="coche" taille={9} epaisseur={3.4} />
            </span>
            demandé par le client
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map((it, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 11px 5px 8px', borderRadius: 999, fontSize: 12.5,
            fontWeight: it.voulu ? 700 : 600,
            background: it.voulu ? '#fdfaf1' : 'white',
            border: `1px solid ${it.voulu ? '#e6d29f' : BORD}`,
            color: it.voulu ? '#8a6d24' : '#475569',
          }}>
            <span style={{ display: 'flex', color: it.voulu ? OR : '#94a3b8' }}><Icone nom={it.icone} taille={15} epaisseur={1.9} /></span>
            <span>{it.texte}</span>
            {it.voulu && (
              <span style={{ display: 'flex', width: 14, height: 14, borderRadius: '50%', background: OR, color: 'white', alignItems: 'center', justifyContent: 'center', marginLeft: 1 }}>
                <Icone nom="coche" taille={9} epaisseur={3.4} />
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ══ Détaillé / Compact ════════════════════════════════════════
   Vingt biens en cartes pleines, c'est dix écrans de défilement et
   plus aucune vue d'ensemble. Le mode compact ramène chaque bien à
   une ligne : de quoi le reconnaître et décider, le reste au clic.
   Le choix se retient par onglet, d'une visite à l'autre. */

export function useAffichage(cle: string) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    try { setCompact(window.localStorage.getItem('emi-affichage-' + cle) === 'compact'); } catch { /* navigation privée */ }
  }, [cle]);
  const basculer = useCallback((v: boolean) => {
    setCompact(v);
    try { window.localStorage.setItem('emi-affichage-' + cle, v ? 'compact' : 'detaille'); } catch { /* idem */ }
  }, [cle]);
  return [compact, basculer] as const;
}

export function BasculeAffichage({ compact, onChange }: { compact: boolean; onChange: (v: boolean) => void }) {
  const bouton = (actif: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: 'none', borderRadius: 16, padding: '5px 11px',
    background: actif ? 'white' : 'transparent',
    color: actif ? NAVY : '#8b98a9',
    boxShadow: actif ? '0 1px 3px rgba(16,24,40,.13)' : 'none',
    fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
  });
  return (
    <div role="group" aria-label="Affichage de la liste"
      style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 19, background: '#eef2f8', border: `1px solid ${BORD}` }}>
      <button type="button" onClick={() => onChange(false)} style={bouton(!compact)} aria-pressed={!compact}>
        <Icone nom="carte" taille={13} epaisseur={2} />Détaillé
      </button>
      <button type="button" onClick={() => onChange(true)} style={bouton(compact)} aria-pressed={compact}>
        <Icone nom="lignes" taille={13} epaisseur={2} />Compact
      </button>
    </div>
  );
}

/** « 88 m² · 3 ch. · 4ᵉ · DPE C » — le bien en une ligne de chiffres. */
export function resumeSpecs(b: any): string {
  const p: string[] = [];
  if (b?.surface) p.push(`${b.surface} m²`);
  if (b?.nb_chambres) p.push(`${b.nb_chambres} ch.`);
  else if (b?.nb_pieces) p.push(`${b.nb_pieces} p.`);
  if (b?.etage !== null && b?.etage !== undefined) p.push(Number(b.etage) === 0 ? 'RDC' : `${b.etage}ᵉ`);
  if (b?.surface_exterieur) p.push(`${b.surface_exterieur} m² ext.`);
  if (b?.annee_construction) p.push(String(b.annee_construction));
  if (b?.dpe) p.push(`DPE ${String(b.dpe).toUpperCase().slice(0, 1)}`);
  return p.join(' · ');
}

/** Une ligne de liste : photo, titre, chiffres, prix, et les actions à droite. */
export function LigneCompacte({ photo, numero, titre, lieu, specs, prix, sousPrix, badge, accent, onOuvrir, actions, coche }: {
  photo?: string | null; numero?: number; titre: string; lieu?: string | null; specs?: string;
  prix?: string; sousPrix?: string | null; badge?: React.ReactNode; accent?: string;
  onOuvrir?: () => void; actions?: React.ReactNode;
  /** La case de la colonne de gauche, pour envoyer plusieurs biens d'un coup. */
  coche?: { actif: boolean; onBascule: () => void };
}) {
  const choisi = !!coche?.actif;
  return (
    <div className="emi-ligne" data-coche={coche ? (choisi ? 'oui' : 'non') : undefined} style={{
      display: 'flex', alignItems: 'center', gap: 12, minWidth: 0,
      background: choisi ? '#fffdf7' : 'white', border: `1px solid ${choisi ? OR : BORD}`, borderRadius: 13,
      borderLeft: accent ? `4px solid ${accent}` : `1px solid ${choisi ? OR : BORD}`,
      boxShadow: choisi ? '0 0 0 3px rgba(201,168,76,.16)' : 'none',
      padding: '8px 12px 8px 10px', transition: 'background .14s, border-color .14s, box-shadow .14s',
    }}>
      {coche && (
        <CaseACocher actif={choisi} onClick={coche.onBascule}
          titre={choisi ? `Décocher « ${titre} »` : `Cocher « ${titre} » pour l'envoyer avec d'autres`} />
      )}
      {numero !== undefined && (
        <span className="emi-ligne-num" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          width: 22, height: 22, borderRadius: 7, background: '#f1f5f9', color: '#64748b',
          fontSize: 11, fontWeight: 800,
        }}>{String(numero).padStart(2, '0')}</span>
      )}

      {photo
        ? <img src={photo} alt="" style={{ width: 54, height: 42, objectFit: 'cover', borderRadius: 8, flexShrink: 0, background: '#eef2f8' }} />
        : <span style={{ width: 54, height: 42, borderRadius: 8, flexShrink: 0, background: '#eef2f8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b6c1d1' }}>
            <Icone nom="maison" taille={16} />
          </span>}

      <button type="button" className="emi-ligne-titre" onClick={onOuvrir} disabled={!onOuvrir}
        style={{
          flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2,
          background: 'none', border: 'none', padding: 0, textAlign: 'left',
          fontFamily: 'inherit', cursor: onOuvrir ? 'pointer' : 'default',
        }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: NAVY, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '100%' }}>
          {titre}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', fontSize: 11.5, color: '#64748b' }}>
          {lieu && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{lieu}</span>}
          {badge}
        </span>
      </button>

      {specs && (
        <span className="emi-ligne-specs" style={{ flexShrink: 0, fontSize: 12, color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{specs}</span>
      )}

      {prix && (
        <span className="emi-ligne-prix" style={{ flexShrink: 0, textAlign: 'right', minWidth: 96 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: OR, letterSpacing: -.3, lineHeight: 1.2 }}>{prix}</span>
          {sousPrix && <span style={{ display: 'block', fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>{sousPrix}</span>}
        </span>
      )}

      {actions && <span className="emi-ligne-actions" style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>{actions}</span>}
    </div>
  );
}

/** Un bouton d'action réduit à son icône, pour les lignes compactes. */
export function BoutonIcone({ icone, titre, onClick, href, ton = 'neutre' }: {
  icone: string; titre: string; onClick?: () => void; href?: string; ton?: 'neutre' | 'or';
}) {
  const dore = ton === 'or';
  const st: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 9, cursor: 'pointer', textDecoration: 'none',
    background: dore ? OR : 'white', color: dore ? 'white' : '#64748b',
    border: `1px solid ${dore ? OR : BORD}`, fontFamily: 'inherit', padding: 0,
  };
  const contenu = <Icone nom={icone} taille={15} epaisseur={1.9} />;
  if (href) return <a href={href} target="_blank" rel="noreferrer" title={titre} aria-label={titre} style={st}>{contenu}</a>;
  return <button type="button" onClick={onClick} title={titre} aria-label={titre} style={st}>{contenu}</button>;
}

/** Une case à cocher : marine quand elle est cochée, la coche en or.
 *  `partiel` = une partie seulement de la liste est cochée (le trait). */
export function CaseACocher({ actif, partiel, onClick, titre, taille = 20 }: {
  actif: boolean; partiel?: boolean; onClick: () => void; titre: string; taille?: number;
}) {
  const plein = actif || !!partiel;
  return (
    <button type="button" role="checkbox" aria-checked={partiel && !actif ? 'mixed' : actif}
      aria-label={titre} title={titre} className="emi-coche"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        width: taille + 12, height: taille + 12, margin: -6, padding: 0,
        background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      }}>
      <span style={{
        width: taille, height: taille, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: `1.5px solid ${plein ? NAVY : '#c3ccda'}`, background: plein ? NAVY : 'white', color: OR,
        boxShadow: plein ? 'none' : 'inset 0 1px 2px rgba(16,24,40,.06)', transition: 'all .14s',
      }}>
        {actif ? <Icone nom="coche" taille={taille - 6} epaisseur={3} />
          : partiel ? <Icone nom="moins" taille={taille - 6} epaisseur={3} /> : null}
      </span>
    </button>
  );
}

/* ══ Honoraires : ce qu'on propose d'office ════════════════════
   Le mandat de recherche en cours fixe les honoraires convenus avec le
   client (« 3,5 % TTC », « 5 000 € TTC ») : c'est eux qu'on propose.
   Un bien dont tu as déjà fixé les honoraires garde les siens — un
   geste négocié bien par bien ne doit pas s'effacer. Sans l'un ni
   l'autre : 3 %. */

export type TypeHono = 'pourcentage' | 'fixe';
export type HonoMandat = { type: TypeHono; val: number; texte: string };

/** Les honoraires du mandat, s'il y en a un en cours et qu'on sait les lire. */
export function honorairesDuMandat(r: any): HonoMandat | null {
  if (!r || r.sans_mandat) return null;
  if (!r.mandat_date_signature && !r.mandat_date_expiration) return null;
  if (r.mandat_date_expiration) {
    const fin = new Date(r.mandat_date_expiration);
    if (!isNaN(fin.getTime()) && fin.getTime() + 86400000 < Date.now()) return null;   // expiré
  }
  const texte = String(r.mandat_honoraires || '').trim();
  if (!texte) return null;
  const serre = texte.replace(/[\s  ]/g, '');
  const pct = serre.match(/(\d+(?:[.,]\d+)?)%/);
  if (pct) {
    const v = parseFloat(pct[1].replace(',', '.'));
    return v > 0 && v < 30 ? { type: 'pourcentage', val: v, texte } : null;
  }
  const milliers = serre.match(/(\d+(?:[.,]\d+)?)k/i);
  if (milliers) {
    const v = Math.round(parseFloat(milliers[1].replace(',', '.')) * 1000);
    return v > 0 ? { type: 'fixe', val: v, texte } : null;
  }
  const euros = serre.match(/(\d[\d.]*(?:,\d{1,2})?)(?:€|eur)/i) || serre.match(/^(\d[\d.]*(?:,\d{1,2})?)/);
  if (euros) {
    /* « 5.000 » est un millier, « 3.5 » une décimale. */
    const brut = euros[1];
    const v = /^\d+\.\d{1,2}$/.test(brut) ? parseFloat(brut) : parseFloat(brut.replace(/\./g, '').replace(',', '.'));
    if (v >= 100) return { type: 'fixe', val: Math.round(v), texte };
    if (v > 0 && v < 30) return { type: 'pourcentage', val: v, texte };
  }
  return null;
}

/** D'où partent les honoraires d'un bien : les siens, sinon le mandat, sinon 3 %. */
export function honorairesDepart(bien: any, mandat: HonoMandat | null): { type: TypeHono; valeur: string } {
  const v = Number(bien?.commission_val);
  if (isFinite(v) && v > 0) return { type: bien.commission_type === 'fixe' ? 'fixe' : 'pourcentage', valeur: String(v) };
  if (mandat) return { type: mandat.type, valeur: String(mandat.val) };
  return { type: 'pourcentage', valeur: '3' };
}

export function montantHonoraires(base: number, type: TypeHono, valeur: string | number): number {
  const v = parseFloat(String(valeur).replace(',', '.')) || 0;
  return type === 'pourcentage' ? Math.round(base * (v / 100)) : Math.round(v);
}

const pctFr = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' %';

/** « dont 24 600 € d'honoraires · 3 % » — le rappel sous le prix d'un bien envoyé. */
export function libelleHonoraires(b: any): string | null {
  const vendeur = Number(b?.prix_vendeur) || 0;
  const acq = Number(b?.prix_acquereur) || 0;
  const h = acq && vendeur ? acq - vendeur : 0;
  if (h <= 0) return null;
  const montant = `dont ${h.toLocaleString('fr-FR')} € d'honoraires`;
  if (b.commission_type === 'pourcentage' && Number(b.commission_val) > 0) return `${montant} · ${pctFr(Number(b.commission_val))}`;
  if (b.commission_type === 'fixe') return `${montant} · forfait, ${pctFr((h / vendeur) * 100)}`;
  return `${montant} · ${pctFr((h / vendeur) * 100)}`;
}

/** La ligne « Mandat en cours : 3,5 % TTC » des fenêtres d'envoi, avec de quoi
 *  revenir aux honoraires du mandat si le bien en porte d'autres. */
function RappelMandat({ mandat, applique, onAppliquer, pour }: {
  mandat: HonoMandat | null; applique: boolean; onAppliquer: () => void; pour?: string;
}) {
  if (!mandat) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12,
      background: applique ? '#fdfaf1' : 'white', border: `1px solid ${applique ? '#ecdcb4' : BORD}`,
      borderRadius: 10, padding: '7px 11px', fontSize: 12.5, color: '#64748b',
    }}>
      <span style={{ display: 'inline-flex', color: '#a17d2c' }}><Icone nom="liste" taille={14} epaisseur={1.9} /></span>
      <span style={{ flex: '1 1 200px' }}>
        {applique ? 'Honoraires du mandat en cours' : 'Mandat en cours'}&nbsp;: <b style={{ color: NAVY }}>{mandat.texte}</b>
      </span>
      {!applique && (
        <button type="button" onClick={onAppliquer}
          style={{ background: NAVY, color: 'white', border: 'none', borderRadius: 8, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {pour ? `Appliquer ${pour}` : 'Appliquer'}
        </button>
      )}
    </div>
  );
}

/* ══ L'appréciation : ce bien vaut-il un coup de fil ═══════════
   C'est la ligne qu'Alexandre lit en premier. Le mot vient de la
   veille (`verdict`) ; à défaut il se déduit de la note, avec les
   mêmes paliers que ModaleScore. */

export type Verdict = 'priorite' | 'appeler' | 'reserve' | 'ecarter';

const VERDICTS: Record<Verdict, { mot: string; bg: string }> = {
  priorite: { mot: 'À appeler en priorité', bg: '#15803d' },
  appeler: { mot: 'À appeler', bg: '#16a34a' },
  reserve: { mot: 'Sous réserve', bg: '#d97706' },
  ecarter: { mot: 'À écarter', bg: '#dc2626' },
};

export function verdictDe(p: any): Verdict {
  const v = String(p?.verdict || '').toLowerCase().trim();
  if (v === 'priorite' || v === 'appeler' || v === 'reserve' || v === 'ecarter') return v;
  const s = Number(p?.score);
  if (!isFinite(s)) return 'appeler';
  if (s >= 85) return 'priorite';
  if (s >= 70) return 'appeler';
  if (s >= 50) return 'reserve';
  return 'ecarter';
}

/** Une ligne d'attention qui commence par ⚠️ ou « À ÉCARTER » n'est pas
    une vérification : c'est un point qui bloque. Elle sort du lot. */
const BLOQUANT = /^\s*(⚠️|⚠|!!|à\s*écarter|a\s*ecarter)/i;
const sansMarque = (t: any) => String(t).replace(/^\s*(⚠️|⚠|!!)\s*/, '').trim();

export function partagePoints(p: any) {
  const att: any[] = Array.isArray(p?.points_attention) ? p.points_attention : [];
  return {
    atouts: (Array.isArray(p?.points_forts) ? p.points_forts : []).map(String),
    verifier: att.filter(x => !BLOQUANT.test(String(x))).map(String),
    bloquants: att.filter(x => BLOQUANT.test(String(x))).map(sansMarque),
  };
}

export function Appreciation({ p }: { p: any }) {
  const v = VERDICTS[verdictDe(p)];
  const { atouts } = partagePoints(p);
  const phrase = p?.appreciation || atouts[0] || null;
  if (!phrase) return null;
  return (
    <div className="emi-avis" style={{
      display: 'flex', gap: 13, alignItems: 'flex-start',
      padding: '12px 15px', borderRadius: 12, background: '#fdfcf7', borderLeft: `3px solid ${OR}`,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, marginTop: 1,
        padding: '4px 11px', borderRadius: 999, background: v.bg,
        fontSize: 11.5, fontWeight: 800, color: 'white', whiteSpace: 'nowrap',
      }}>
        <Icone nom="coche" taille={12} epaisseur={2.8} />{v.mot}
      </span>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, fontWeight: 600, color: NAVY }}>{phrase}</p>
    </div>
  );
}

/* ══ Le bilan : trois compteurs, le détail au clic ═════════════ */

const TONS_BILAN = {
  vert: { pastille: '#16a34a', titre: '#15803d', bd: '#bbf7d0', bg: '#f0fdf4', num: '#dcfce7', texte: '#334155' },
  ambre: { pastille: '#d97706', titre: '#b45309', bd: '#fde68a', bg: '#fffbeb', num: '#fef3c7', texte: '#334155' },
  rouge: { pastille: '#dc2626', titre: '#b91c1c', bd: '#fecaca', bg: '#fef2f2', num: '#fee2e2', texte: '#7f1d1d' },
};
type TonBilan = keyof typeof TONS_BILAN;

function Compteur({ ton, titre, items, ouvert, onClick }: {
  ton: TonBilan; titre: string; items: string[]; ouvert: boolean; onClick: () => void;
}) {
  const c = TONS_BILAN[ton];
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', gap: 7, textAlign: 'left', fontFamily: 'inherit',
      padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
      background: ouvert ? c.bg : 'white', border: `1px solid ${c.bd}`,
      boxShadow: ouvert ? '0 3px 10px -5px rgba(26,35,50,.45)' : 'none',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.pastille, flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: c.titre }}>{titre}</span>
        <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 800, color: c.pastille }}>{items.length}</span>
        <span className="emi-chevron" data-ouvert={ouvert} style={{ color: c.pastille, display: 'flex' }}>
          <Icone nom="chevron" taille={12} epaisseur={2.4} />
        </span>
      </span>
      <span style={{
        fontSize: 12, lineHeight: 1.45, color: ton === 'rouge' ? c.texte : '#475569',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {items.slice(0, 2).join(' · ')}
      </span>
    </button>
  );
}

function ListeNumerotee({ items, ton }: { items: string[]; ton: TonBilan }) {
  const c = TONS_BILAN[ton];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: items.length > 3 ? 'repeat(auto-fit, minmax(min(270px, 100%), 1fr))' : '1fr',
      gap: '7px 26px',
    }}>
      {items.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, borderRadius: 6, flexShrink: 0, marginTop: 1,
            background: c.num, color: c.titre, fontSize: 10, fontWeight: 800,
          }}>{i + 1}</span>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#334155' }}>{t}</p>
        </div>
      ))}
    </div>
  );
}

export function BilanBien({ p }: { p: any }) {
  const [ouvert, setOuvert] = useState<null | TonBilan>(null);
  const { atouts, verifier, bloquants } = partagePoints(p);
  if (!atouts.length && !verifier.length && !bloquants.length) return null;

  const bascule = (v: TonBilan) => () => setOuvert(o => (o === v ? null : v));
  const visibles = [
    atouts.length ? ('vert' as const) : null,
    verifier.length ? ('ambre' as const) : null,
    bloquants.length ? ('rouge' as const) : null,
  ].filter(Boolean) as TonBilan[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div className="emi-bilan" style={{ display: 'grid', gridTemplateColumns: `repeat(${visibles.length}, minmax(0, 1fr))`, gap: 9 }}>
        {!!atouts.length && (
          <Compteur ton="vert" titre="Atouts" items={atouts} ouvert={ouvert === 'vert'} onClick={bascule('vert')} />
        )}
        {!!verifier.length && (
          <Compteur ton="ambre" titre="À vérifier avant d'appeler" items={verifier} ouvert={ouvert === 'ambre'} onClick={bascule('ambre')} />
        )}
        {!!bloquants.length && (
          <Compteur ton="rouge" titre="À trancher" items={bloquants} ouvert={ouvert === 'rouge'} onClick={bascule('rouge')} />
        )}
      </div>

      <div className="emi-volet" data-ouvert={!!ouvert}>
        <div>
          <div style={{ background: '#fafcff', border: `1px solid ${BORD}`, borderRadius: 12, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: ouvert ? TONS_BILAN[ouvert].titre : '#9aa8bd' }}>
              {ouvert === 'vert' && `Les ${atouts.length} atouts`}
              {ouvert === 'ambre' && `Les ${verifier.length} points à vérifier avant d'appeler`}
              {ouvert === 'rouge' && (bloquants.length > 1 ? `Les ${bloquants.length} points à trancher` : 'Le point à trancher')}
            </span>
            {ouvert === 'vert' && <ListeNumerotee items={atouts} ton="vert" />}
            {ouvert === 'ambre' && <ListeNumerotee items={verifier} ton="ambre" />}
            {ouvert === 'rouge' && <ListeNumerotee items={bloquants} ton="rouge" />}
          </div>
        </div>
      </div>
    </div>
  );
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
    /* les lignes « diffuseur » disent qui vend et à quel prix, pas comment le
       prix a bougé : elles n'entrent pas dans la courbe. */
    .filter((x: any) => x?.type !== 'diffuseur')
    .map((x: any) => ({ date: String(x?.date ?? x?.d ?? ''), prix: Number(x?.prix ?? x?.p ?? x?.price) }))
    .filter((x: PointPrix) => x.date && isFinite(x.prix) && x.prix > 0)
    .sort((a: PointPrix, b: PointPrix) => a.date.localeCompare(b.date));
  if (pts.length >= 2) return pts;

  const out: PointPrix[] = [];
  /* ⚠️ `new Date(null)` ne renvoie pas une date invalide : il renvoie le
     1er janvier 1970. Sans ce garde-fou, une date absente s'affichait
     « 1 janv. 1970 » au lieu de laisser la place au repli sur aujourd'hui. */
  const iso = (d: any) => {
    if (d === null || d === undefined || d === '') return '';
    const x = new Date(d);
    return isNaN(x.getTime()) ? '' : x.toISOString().slice(0, 10);
  };
  const prixActuel = Number(p?.prix ?? p?.prix_vendeur);
  if (p?.date_publication && p?.prix_initial) out.push({ date: iso(p.date_publication), prix: Number(p.prix_initial) });
  if (prixActuel > 0) out.push({ date: iso(p?.date_derniere_baisse) || new Date().toISOString().slice(0, 10), prix: prixActuel });
  const ok = out.filter(x => x.date && isFinite(x.prix) && x.prix > 0);
  return ok.length >= 2 && ok[0].prix !== ok[1].prix ? ok : pts;
}

export function GraphePrix({ points, hauteur = 148 }: { points: PointPrix[]; hauteur?: number }) {
  /* Le dessin prend la largeur réelle de sa boîte : avec une largeur fixe,
     il rapetissait sur téléphone jusqu'à rendre les dates illisibles. */
  const boite = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(640);
  useEffect(() => {
    const el = boite.current;
    if (!el) return;
    const maj = () => { const w = Math.round(el.getBoundingClientRect().width); if (w > 0) setLargeur(Math.max(280, w)); };
    maj();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(maj);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length < 2) return null;
  const L = largeur, H = hauteur, hg = 14, hd = 14, ht = 24, hb = 26;

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
    <div ref={boite}>
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
    </div>
  );
}

/* ══ Les diffuseurs d'un même bien ═════════════════════════════
   Un bien est souvent porté par plusieurs agences, à des prix et
   avec des honoraires différents. La veille les dépose dans
   `historique_prix`, chaque entrée pouvant porter `agence` et `url`.
   On reconstruit ici la liste, dédoublonnée et triée du moins cher
   au plus cher — c'est le moins cher qu'Alexandre appelle en premier. */
export type Diffuseur = { agence: string; prix?: number; date?: string; url?: string };

export function diffuseurs(p: any): Diffuseur[] {
  const brut = Array.isArray(p?.historique_prix) ? p.historique_prix : [];

  /* Deux sortes de lignes cohabitent dans `historique_prix` :
       — la courbe du prix   { date, prix }
       — les diffuseurs      { type: 'diffuseur', agence, prix, date, url }
     Dès que la veille a marqué les diffuseurs, on ne lit qu'eux : sinon une
     baisse de prix signée d'une agence compterait pour une agence de plus.
     Sans marquage (fiches déposées avant), on retombe sur l'ancienne règle :
     toute ligne qui porte un nom d'agence. */
  const marquees = brut.filter((x: any) => x?.type === 'diffuseur');
  const source = marquees.length ? marquees : brut;
  const vus = new Map<string, Diffuseur>();

  for (const x of source) {
    const nom = String(x?.agence ?? x?.a ?? '').trim();
    if (!nom) continue;
    const cle = nom.toLowerCase();
    const prix = Number(x?.prix ?? x?.p);
    const neuf: Diffuseur = {
      agence: nom,
      prix: isFinite(prix) && prix > 0 ? prix : undefined,
      date: x?.date ? String(x.date) : undefined,
      url: x?.url ? String(x.url) : undefined,
    };
    const ancien = vus.get(cle);
    vus.set(cle, ancien
      ? { agence: ancien.agence, prix: neuf.prix ?? ancien.prix, date: ancien.date ?? neuf.date, url: ancien.url ?? neuf.url }
      : neuf);
  }

  /* L'agence de l'annonce retenue, si l'historique ne la cite pas.
     Le champ ne porte pas le même nom des deux côtés : `agence` dans la
     veille, `agence_nom` une fois le bien passé en Sélection. Pareil pour
     le lien. On accepte les deux, sinon le volet reste vide côté Sélection. */
  const mandat = String(p?.agence ?? p?.agence_nom ?? '').trim();
  const lienRetenu = p?.url || p?.lien || undefined;
  if (mandat && !vus.has(mandat.toLowerCase())) {
    vus.set(mandat.toLowerCase(), {
      agence: mandat,
      prix: Number(p?.prix ?? p?.prix_vendeur) > 0 ? Number(p?.prix ?? p?.prix_vendeur) : undefined,
      url: lienRetenu,
    });
  }

  // à défaut d'URL propre, l'agence du mandat renvoie vers l'annonce retenue
  const out = [...vus.values()];
  if (mandat && lienRetenu) {
    const principal = out.find(d => d.agence.toLowerCase() === mandat.toLowerCase());
    if (principal && !principal.url) principal.url = lienRetenu;
  }

  return out.sort((a, b) => (a.prix ?? Number.MAX_SAFE_INTEGER) - (b.prix ?? Number.MAX_SAFE_INTEGER));
}

/* Une case du tableau de marché : un intitulé, un chiffre qui se lit de
   loin, une précision. Elle s'ouvre sur son détail quand il y en a un. */
function CaseMarche({ icone, titre, valeur, detail, ton = 'neutre', onClick, ouvert }: {
  icone: string; titre: string; valeur: React.ReactNode; detail?: React.ReactNode;
  ton?: 'neutre' | 'vert'; onClick?: () => void; ouvert?: boolean;
}) {
  const t = ton === 'vert'
    ? { bg: '#f0fdf4', bd: '#bbf7d0', ic: '#16a34a', val: '#15803d', det: '#15803d' }
    : { bg: 'white', bd: '#e1e8f1', ic: '#8a9ab0', val: NAVY, det: '#8190a5' };
  /* Sur ordinateur, trois cases côte à côte ; sur téléphone, trois lignes
     (crm-mobile.css) : l'intitulé à gauche, le chiffre à droite. */
  const contenu = (
    <>
      <span className="emi-case-tete" style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, paddingRight: onClick ? 16 : 0 }}>
        <span style={{ display: 'flex', color: ouvert ? OR : t.ic }}><Icone nom={icone} taille={13} epaisseur={2} /></span>
        <span className="emi-case-titre" style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: .8, textTransform: 'uppercase', color: ouvert ? 'rgba(255,255,255,.62)' : '#9aa8bd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{titre}</span>
      </span>
      {onClick && (
        <span className="emi-chevron emi-case-chev" data-ouvert={!!ouvert} style={{ position: 'absolute', top: 10, right: 10, display: 'flex', color: ouvert ? OR : '#b6c1d1' }}>
          <Icone nom="chevron" taille={12} epaisseur={2.4} />
        </span>
      )}
      <span className="emi-case-val" style={{ fontSize: 17, fontWeight: 800, color: ouvert ? 'white' : t.val, letterSpacing: -.3, lineHeight: 1.15 }}>{valeur}</span>
      {detail && <span className="emi-case-det" style={{ fontSize: 11.5, fontWeight: 700, color: ouvert ? 'rgba(255,255,255,.7)' : t.det, lineHeight: 1.35 }}>{detail}</span>}
    </>
  );
  const st: React.CSSProperties = {
    position: 'relative',
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minWidth: 0,
    textAlign: 'left', fontFamily: 'inherit', padding: '10px 11px 11px', borderRadius: 12,
    background: ouvert ? NAVY : t.bg, border: `1px solid ${ouvert ? NAVY : t.bd}`,
    boxShadow: ouvert ? '0 8px 18px -10px rgba(26,35,50,.9)' : '0 1px 2px rgba(16,24,40,.04)',
    transition: 'background .2s ease, border-color .2s ease, box-shadow .2s ease',
  };
  if (!onClick) return <div className="emi-case" style={st}>{contenu}</div>;
  return <button type="button" className="emi-case" onClick={onClick} aria-expanded={!!ouvert} style={{ ...st, cursor: 'pointer' }}>{contenu}</button>;
}

export function BandeauMarche({ p }: { p: any }) {
  const [ouvert, setOuvert] = useState<null | 'date' | 'prix' | 'agences'>(null);
  const pts = seriePrix(p);
  const prixActuel = Number(p.prix ?? p.prix_vendeur) || 0;
  const baisse = p.prix_initial && prixActuel ? Number(p.prix_initial) - prixActuel : 0;
  const baissePct = baisse > 0 && p.prix_initial ? (baisse / Number(p.prix_initial)) * 100 : 0;
  const nbBaisses = p.nb_baisses || Math.max(pts.length - 1, 0);
  const aDuPrix = pts.length >= 2 || nbBaisses > 0;

  const agenceMandat = p.agence ?? p.agence_nom ?? null;
  const portail = p.portail ?? p.source_portail ?? null;

  const liste = diffuseurs(p);
  /* Le chiffre affiché est celui de la liste qui s'ouvre : c'est la seule
     façon de ne jamais promettre « 2 agences » sur un volet qui n'en montre
     qu'une. `nb_agences` ne sert que tant que la liste est vide. */
  const nbAgences = liste.length || Number(p.nb_agences) || 0;
  const moinsCher = liste.find(d => typeof d.prix === 'number');
  const ecart = liste.length >= 2 && liste[0].prix && liste[liste.length - 1].prix
    ? Number(liste[liste.length - 1].prix) - Number(liste[0].prix) : 0;

  if (!p.date_publication && !nbBaisses && !nbAgences && !agenceMandat && !portail) return null;

  const bascule = (v: 'date' | 'prix' | 'agences') => setOuvert(o => (o === v ? null : v));
  const k = (n: number) => `${n.toLocaleString('fr-FR')} €`;

  /* Le marché se lit comme un petit tableau de bord, sous un bandeau
     sombre qui le détache du reste de la carte : trois cases, toujours
     les mêmes, au même endroit. Ce sont des données de travail : elles
     restent dans le CRM et ne partent jamais chez le client. */
  return (
    <div className="emi-marche" style={{ border: '1px solid #d8e0eb', borderRadius: 14, overflow: 'hidden', background: '#f3f6fa' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', background: NAVY }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: 'rgba(201,168,76,.16)', color: OR, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icone nom="courbe" taille={14} epaisseur={2.1} />
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'white', letterSpacing: 1.3, textTransform: 'uppercase' }}>Marché</span>
        <span title="Visible dans le CRM seulement, jamais par le client"
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,.5)' }}>
          <Icone nom="cadenas" taille={12} epaisseur={2} />interne
        </span>
      </div>

      <div style={{ padding: 9 }}>
      <div className="emi-marche-grille" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 }}>
        {p.date_publication ? (
          <CaseMarche icone="horloge" titre="En ligne depuis" valeur={anciennete(p.date_publication)}
            detail={`depuis le ${jour(p.date_publication)}`}
            onClick={() => bascule('date')} ouvert={ouvert === 'date'} />
        ) : (
          <CaseMarche icone="horloge" titre="En ligne depuis" valeur="—" detail="date inconnue" />
        )}

        {aDuPrix ? (
          <CaseMarche icone="baisse" titre="Prix" ton={baissePct >= 8 ? 'vert' : 'neutre'}
            valeur={nbBaisses > 0 ? `${nbBaisses} baisse${nbBaisses > 1 ? 's' : ''}` : 'Historique'}
            detail={baisse > 0 ? `− ${k(baisse)} · −${baissePct.toFixed(1).replace('.', ',')} %` : undefined}
            onClick={() => bascule('prix')} ouvert={ouvert === 'prix'} />
        ) : (
          <CaseMarche icone="baisse" titre="Prix" valeur="Inchangé" detail="aucune baisse connue" />
        )}

        {/* Le nombre d'agences s'ouvre sur la liste, et chaque agence y est cliquable. */}
        {nbAgences > 0 ? (
          <CaseMarche icone="maison" titre="Diffusion" ton={nbAgences >= 3 ? 'vert' : 'neutre'}
            valeur={nbAgences === 1 ? 'Exclusivité' : `${nbAgences} agences`}
            detail={ecart > 0 ? `${k(ecart)} d'écart` : nbAgences === 1 && agenceMandat ? String(agenceMandat) : undefined}
            onClick={liste.length ? () => bascule('agences') : undefined} ouvert={ouvert === 'agences'} />
        ) : (
          <CaseMarche icone="maison" titre="Diffusion" valeur="—" detail={portail ? `vu sur ${portail}` : 'agence inconnue'} />
        )}
      </div>

      {/* volet : qui commercialise le bien, et à quel prix */}
      <div className="emi-volet" data-ouvert={ouvert === 'agences'}>
        <div>
          <div style={{ background: 'white', border: `1px solid ${BORD}`, borderRadius: 12, padding: '10px 14px 8px' }}>
            {liste.length ? (
              <>
                {liste.map((d, i) => {
                  const estMandat = agenceMandat && d.agence.toLowerCase() === String(agenceMandat).toLowerCase();
                  const estMoinsCher = liste.length >= 2 && moinsCher && d.agence === moinsCher.agence;
                  const corps = (
                    <>
                      <span className="emi-diff-pt" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: estMoinsCher ? '#16a34a' : '#cbd5e1' }} />
                      <span className="emi-diff-nom" style={{ fontWeight: 800, color: NAVY, flex: '1 1 150px', minWidth: 0, textAlign: 'left' }}>
                        {d.agence}
                        {estMandat && <span style={{ fontWeight: 700, fontSize: 11, color: '#94a3b8' }}> · annonce retenue</span>}
                      </span>
                      {typeof d.prix === 'number' && (
                        <span className="emi-diff-prix" style={{ fontWeight: 800, color: estMoinsCher ? '#15803d' : NAVY, minWidth: 104, textAlign: 'right' }}>
                          {d.prix.toLocaleString('fr-FR')} €
                        </span>
                      )}
                      {d.date && <span className="emi-diff-date" style={{ color: '#94a3b8', fontSize: 12, minWidth: 96, textAlign: 'right' }}>{jour(d.date)}</span>}
                      <span className="emi-diff-lien" style={{ color: d.url ? OR : '#e2e8f0', display: 'flex', flexShrink: 0 }}>
                        <Icone nom="lien" taille={14} epaisseur={2} />
                      </span>
                    </>
                  );
                  const style: React.CSSProperties = {
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', flexWrap: 'wrap', rowGap: 3,
                    padding: '9px 4px', fontSize: 13, background: 'none', color: 'inherit',
                    borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', borderLeft: 0, borderRight: 0, borderBottom: 0,
                    textDecoration: 'none',
                  };
                  return d.url
                    ? <a key={i} className="emi-diff" href={d.url} target="_blank" rel="noreferrer" style={{ ...style, cursor: 'pointer' }}>{corps}</a>
                    : <div key={i} className="emi-diff" style={style} title="Lien non renseigné par la veille">{corps}</div>;
                })}
                {ecart > 0 && (
                  <div style={{ marginTop: 6, borderTop: `2px solid ${BORD}`, paddingTop: 9, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#9aa8bd', textTransform: 'uppercase', letterSpacing: .8 }}>
                      Écart entre diffuseurs
                    </span>
                    <span style={{ fontSize: 15.5, fontWeight: 800, color: '#15803d' }}>{ecart.toLocaleString('fr-FR')} €</span>
                  </div>
                )}
                {portail && (
                  <div style={{ fontSize: 11, color: '#b6c1d1', marginTop: 8, marginBottom: 4 }}>
                    Annonce retenue trouvée sur {portail}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#94a3b8', padding: '6px 0 10px' }}>
                {nbAgences > 1
                  ? `${nbAgences} agences commercialisent ce bien, mais leurs noms n'ont pas encore été récupérés. La prochaine veille les complétera.`
                  : "Le nom de l'agence n'a pas encore été récupéré."}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* volet : la date exacte */}
      <div className="emi-volet" data-ouvert={ouvert === 'date'}>
        <div>
          <div style={{ background: 'white', border: `1px solid ${BORD}`, borderRadius: 12, padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: 22 }}>
            <Ligne lib="Première mise en ligne" val={jour(p.date_publication)} />
            <Ligne lib="Sur le marché depuis" val={anciennete(p.date_publication) || '—'} />
            {p.date_derniere_baisse && <Ligne lib="Dernier changement de prix" val={jour(p.date_derniere_baisse)} />}
            {agenceMandat && <Ligne lib="Mandat" val={agenceMandat} />}
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
                        display: 'flex', alignItems: 'center', gap: 12, padding: '7px 2px', flexWrap: 'wrap', rowGap: 2,
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

export function Onglets({ items, actif, onChange, sombre }: {
  items: { id: string; icone: string; nom: string; compte?: number | null; dore?: boolean }[];
  actif: string; onChange: (id: string) => void;
  /* Sur fond sombre, la barre ne porte plus ni fond ni cadre : c'est le
     bandeau qui l'accueille qui s'en charge. */
  sombre?: boolean;
}) {
  return (
    <div className={sombre ? 'emi-onglets sombre' : 'emi-onglets'} style={sombre ? {
      display: 'flex', gap: 3, flexWrap: 'wrap', padding: 0, marginBottom: 0,
    } : {
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

/* ══ Score ═════════════════════════════════════════════════════
   La note n'est pas calculée par le CRM : c'est la veille qui la pose,
   avec une grille en quatre tranches (le règlement de la veille, « L'indice
   sur 100 »). La fenêtre la rend lisible : où tombe la note, ce que veut
   dire sa tranche, puis une liste à puces par catégorie — la base, ce qui
   rapporte, ce qui en coûte, ce qui bloque. */

const TRANCHES = [
  { min: 85, lib: '85+', mot: 'Coche tout ce qui compte', regle: "Aucun écart avec la recherche. La note monte avec les atouts.", c: '#16a34a' },
  { min: 70, lib: '70–84', mot: 'Mérite un regard', regle: 'Un accroc, qui se dit en une phrase : un peu plus cher, un peu plus petit, un souhait absent.', c: OR },
  { min: 50, lib: '50–69', mot: 'Sous réserve', regle: 'Deux accrocs, ou un « indispensable » qui manque.', c: '#d97706' },
  { min: -Infinity, lib: '< 50', mot: 'Ne passe pas', regle: 'Découvert après coup : le bien ne correspond pas, il est là pour être écarté.', c: '#dc2626' },
];
const trancheDe = (score: number) => TRANCHES.find(t => score >= t.min) || TRANCHES[TRANCHES.length - 1];

const NOMS_EXIGENCES: Record<string, string> = {
  ascenseur: 'Ascenseur', balcon: 'Balcon', terrasse: 'Terrasse', jardin: 'Jardin', parking: 'Parking',
  cave: 'Cave', gardien: 'Gardien', exterieur: 'Extérieur',
};

/** La base : ce qu'un bien doit cocher pour être proposé. On ne dit que ce
    qui se vérifie sur la fiche ; le reste est la règle de la veille. */
function baseDe(p: any, r: any): string[] {
  const out: string[] = [];
  const pl = (n: number, m: string) => `${n} ${m}${n > 1 ? 's' : ''}`;
  if (p.type_bien) out.push(`${p.type_bien}, le type de bien recherché`);
  if (p.nb_chambres && r?.chambres_min) out.push(`${pl(Number(p.nb_chambres), 'chambre')}, pour ${pl(Number(r.chambres_min), 'demandée')}`);
  else if (p.nb_chambres) out.push(`${pl(Number(p.nb_chambres), 'chambre')}, le nombre demandé`);
  out.push(p.ville ? `Dans le secteur recherché — ${p.ville}` : 'Dans le secteur recherché');

  const ex = (r?.exigences || {}) as Record<string, string>;
  const presents = Object.keys(ex)
    .filter(cle => ex[cle] === 'indispensable' && NOMS_EXIGENCES[cle])
    .filter(cle => cle === 'exterieur' ? !!(p.balcon || p.terrasse || p.jardin || Number(p.surface_exterieur) > 0) : !!p[cle])
    .map(cle => NOMS_EXIGENCES[cle]);
  if (presents.length) out.push(`${presents.join(', ')} : indispensable${presents.length > 1 ? 's' : ''}, présent${presents.length > 1 ? 's' : ''}`);
  return out;
}

const TONS_SCORE = {
  bleu: { c: '#2563eb', titre: '#1d4ed8', bg: '#f5f8ff', bd: '#dbe5fb', puce: '#e0e9fd', icone: 'cible', puceIcone: 'coche' },
  vert: { c: '#16a34a', titre: '#15803d', bg: '#f3fbf5', bd: '#cdeed8', puce: '#dcfce7', icone: 'plus', puceIcone: 'plus' },
  ambre: { c: '#d97706', titre: '#b45309', bg: '#fffaf0', bd: '#f8e3b5', puce: '#fef3c7', icone: 'moins', puceIcone: 'moins' },
  rouge: { c: '#dc2626', titre: '#b91c1c', bg: '#fff6f6', bd: '#fbd5d5', puce: '#fee2e2', icone: 'alerte', puceIcone: 'alerte' },
};

function BlocScore({ ton, titre, sous, items, pied }: {
  ton: keyof typeof TONS_SCORE; titre: string; sous?: string; items: string[]; pied?: string;
}) {
  const t = TONS_SCORE[ton];
  return (
    <section style={{ border: `1px solid ${t.bd}`, borderRadius: 14, overflow: 'hidden', background: 'white' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 13px', background: t.bg, borderBottom: `1px solid ${t.bd}` }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: 'white', border: `1px solid ${t.bd}`, color: t.c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icone nom={t.icone} taille={15} epaisseur={2.2} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: t.titre }}>{titre}</span>
            {ton !== 'bleu' && <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 800, color: t.titre, background: 'white', border: `1px solid ${t.bd}`, borderRadius: 99, padding: '1px 8px' }}>{items.length}</span>}
          </div>
          {sous && <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45, marginTop: 2 }}>{sous}</div>}
        </div>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: '4px 0' }}>
        {items.map((x, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 13px', borderTop: i === 0 ? 'none' : '1px solid #f1f5f9' }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', background: t.puce, color: t.c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
              <Icone nom={t.puceIcone} taille={11} epaisseur={2.8} />
            </span>
            <span style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.5, minWidth: 0 }}>{x}</span>
          </li>
        ))}
      </ul>
      {pied && <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, padding: '9px 13px', borderTop: '1px solid #f1f5f9', background: '#fbfcfe' }}>{pied}</div>}
    </section>
  );
}

/** La note, en pastille cliquable : la même dans la Veille et une fois le bien retenu. */
export function PastilleScore({ score, onClick }: { score: any; onClick: () => void }) {
  const n = Number(score);
  const fort = n >= 85;
  return (
    <button type="button" onClick={onClick} title="Comment cette note est calculée" aria-label={`Note ${n} sur 100 : voir le détail`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: fort ? '#fdfaf1' : '#f7f9fc', color: fort ? '#a17d2c' : '#64748b',
        border: `1px solid ${fort ? '#ecdcb4' : BORD}`, borderRadius: 20,
        padding: '4px 10px 4px 11px', fontSize: 12, fontWeight: 800,
        cursor: 'pointer', fontFamily: 'inherit',
      }}>
      {n}<span style={{ opacity: .6, fontWeight: 600 }}>/100</span>
      <span style={{ opacity: .7, display: 'flex' }}><Icone nom="info" taille={13} epaisseur={2} /></span>
    </button>
  );
}

export function ModaleScore({ p, recherche, onFerme }: { p: any; recherche?: any; onFerme: () => void }) {
  const score = Math.max(0, Math.min(100, Math.round(Number(p.score ?? 0)) || 0));
  const tr = trancheDe(score);
  const { atouts, verifier, bloquants } = partagePoints(p);
  const base = baseDe(p, recherche);

  /* La jauge : quatre tranches à l'échelle, la note posée dessus. */
  const segments = [
    { de: 0, a: 50, c: '#dc2626' }, { de: 50, a: 70, c: '#d97706' },
    { de: 70, a: 85, c: OR }, { de: 85, a: 100, c: '#16a34a' },
  ];

  /* En largeur sur ordinateur : l'en-tête sur une ligne (la note à gauche,
     la jauge à droite), puis les catégories côte à côte — la base, ce qui
     rapporte, ce qui coûte. Tout se lit d'un coup d'œil, sans défiler. Sur
     téléphone, les colonnes s'empilent d'elles-mêmes. */
  const colonnes: React.ReactNode[] = [
    <BlocScore key="base" ton="bleu" titre="La base" sous="Ce que tout bien proposé coche d'office. Sans ça, il ne serait pas là."
      items={base}
      pied="Le budget et la surface, eux, peuvent déborder un peu quand le bien le vaut : l'écart est alors compté dans « Ce qui en coûte »." />,
  ];
  if (atouts.length) colonnes.push(<BlocScore key="plus" ton="vert" titre="Ce qui rapporte des points" items={atouts} />);
  if (verifier.length || bloquants.length) colonnes.push(
    <div key="moins" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      {!!verifier.length && (
        <BlocScore ton="ambre" titre="Ce qui en coûte"
          sous="Un écart coûte des points. Une information manquante est à vérifier, sans rien retirer."
          items={verifier} />
      )}
      {!!bloquants.length && (
        <BlocScore ton="rouge" titre="Ce qui bloque" sous="À trancher avant de proposer le bien." items={bloquants} />
      )}
    </div>
  );

  return (
    <Modale onFerme={onFerme} largeur={colonnes.length >= 3 ? 1060 : colonnes.length === 2 ? 820 : 560}>
      <div style={{ background: NAVY, padding: '18px 24px 16px', display: 'flex', alignItems: 'center', gap: '16px 32px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15, flex: '1 1 300px', minWidth: 0 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18, background: tr.c, color: 'white',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            boxShadow: `0 8px 22px -8px ${tr.c}`,
          }}>
            <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: 10, opacity: .85, fontWeight: 700 }}>/ 100</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: OR, textTransform: 'uppercase', letterSpacing: 1 }}>Note de correspondance</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'white', marginTop: 3, lineHeight: 1.25 }}>{tr.mot}</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.5)', marginTop: 2, lineHeight: 1.4 }}>
              {p.titre || `${p.type_bien || 'Bien'} — ${p.ville || ''}`}
            </div>
          </div>
        </div>

        <div style={{ flex: '1 1 380px', minWidth: 0 }}>
          <div style={{ position: 'relative', margin: '8px 4px 0', paddingBottom: 18 }}>
            <div style={{ display: 'flex', gap: 3, height: 8 }}>
              {segments.map(sg => {
                const dedans = score >= sg.de && (score < sg.a || (sg.a === 100 && score === 100));
                return <span key={sg.de} style={{ flex: `${sg.a - sg.de} 0 0`, borderRadius: 99, background: sg.c, opacity: dedans ? 1 : .28 }} />;
              })}
            </div>
            <span aria-hidden="true" style={{
              position: 'absolute', top: -5, left: `${score}%`, transform: 'translateX(-50%)',
              width: 18, height: 18, borderRadius: '50%', background: 'white', border: `4px solid ${tr.c}`,
              boxShadow: '0 2px 8px rgba(0,0,0,.35)',
            }} />
            {[0, 50, 70, 85, 100].map(v => (
              <span key={v} style={{
                position: 'absolute', top: 14, left: `${v}%`,
                transform: v === 0 ? 'none' : v === 100 ? 'translateX(-100%)' : 'translateX(-50%)',
                fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,.42)', fontVariantNumeric: 'tabular-nums',
              }}>{v}</span>
            ))}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 9, alignItems: 'flex-start', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 11, padding: '8px 11px' }}>
            <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: tr.c === OR ? OR : 'white', background: tr.c === OR ? 'rgba(201,168,76,.16)' : tr.c, borderRadius: 7, padding: '2px 7px', marginTop: 1 }}>{tr.lib}</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'rgba(255,255,255,.78)' }}>{tr.regle}</span>
          </div>
        </div>
      </div>

      <div style={{
        padding: 16, background: '#f7f9fc', display: 'grid', gap: 12, alignItems: 'start',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(270px, 100%), 1fr))',
      }}>
        {colonnes}
      </div>

      <div className="emi-score-pied" style={{ padding: '0 16px 16px', background: '#f7f9fc', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#94a3b8', flex: '1 1 260px' }}>
          <Icone nom="cadenas" taille={12} epaisseur={2} />
          <span>Note posée par la veille, pour toi seul — jamais montrée au client.</span>
        </div>
        <button type="button" onClick={onFerme}
          style={{ background: NAVY, color: 'white', border: 'none', borderRadius: 11, padding: '11px 34px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>
          Compris
        </button>
      </div>
    </Modale>
  );
}

/* ══ Les notes de la veille, une fois le bien retenu ════════════
   Le bien passe en Sélection puis en Présentés avec ce que la veille en
   disait : la note, l'avis en une phrase, les atouts, ce qu'il reste à
   vérifier. Tout ça reste ici, à Alexandre — l'espace du client ne lit
   aucun de ces champs. */
export function NotesVeille({ p, onScore }: { p: any; onScore: () => void }) {
  const { atouts, verifier, bloquants } = partagePoints(p);
  const aNote = p?.score !== null && p?.score !== undefined && p?.score !== '';
  if (!aNote && !p?.appreciation && !atouts.length && !verifier.length && !bloquants.length) return null;
  return (
    <div className="emi-notes" style={{ display: 'flex', flexDirection: 'column', gap: 9, borderTop: `1px dashed ${BORD}`, paddingTop: 11 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, color: '#9aa8bd', textTransform: 'uppercase', letterSpacing: 1 }}>
          <Icone nom="cadenas" taille={12} epaisseur={2.1} />Notes de la veille
        </span>
        <span style={{ fontSize: 11, color: '#b6c1d1', fontWeight: 600 }}>interne, jamais vu par le client</span>
        {aNote && <span style={{ marginLeft: 'auto' }}><PastilleScore score={p.score} onClick={onScore} /></span>}
      </div>
      <Appreciation p={p} />
      <BilanBien p={p} />
    </div>
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
    /* Ce retour-là vient d'Alexandre, pas du client : il l'a eu au téléphone
       et le saisit à sa place. L'espace acheteur le dira — « le commentaire de
       votre conseiller » — au lieu de faire croire au client qu'il a écrit
       quelque chose qu'il n'a jamais écrit. */
    await supabase.from('biens').update({
      badge_retour: a.badge, retour_client: texte.trim() || a.label,
      retour_le: new Date().toISOString(), retour_par: 'conseiller',
    }).eq('id', bien.id);
    await supabase.from('journal').insert({
      client_id: clientId, bien_id: bien.id, recherche_id: bien.recherche_id,
      type: 'retour_client', titre: `${a.icone} ${a.label} · noté par le conseiller`,
      description: texte.trim() || null, metadata: {},
    });
    /* Le client a répondu : la relance automatique n'a plus d'objet. */
    await cloturerRelancesAuto(clientId, bien.recherche_id);
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

export function ModaleEnvoi({ bien, clientId, client, onFerme, onEnvoye, onMail, mandat = null }: {
  bien: any; clientId: string; client: any; onFerme: () => void; onEnvoye: () => void; onMail: (bienId: string) => void;
  /** Les honoraires du mandat de recherche en cours : proposés d'office. */
  mandat?: HonoMandat | null;
}) {
  const depart = honorairesDepart(bien, mandat);
  const [type, setType] = useState<TypeHono>(depart.type);
  const [valeur, setValeur] = useState<string>(depart.valeur);
  const [envoi, setEnvoi] = useState(false);
  const [copie, setCopie] = useState(false);

  const base = Number(bien.prix_vendeur) || 0;
  const v = parseFloat(String(valeur).replace(',', '.')) || 0;
  const honoraires = montantHonoraires(base, type, valeur);
  const surMandat = !!mandat && mandat.type === type && mandat.val === v;
  const total = base + honoraires;
  const pctEq = base > 0 ? (honoraires / base) * 100 : 0;

  async function marquer(canal: string) {
    setEnvoi(true);
    /* Avant la mise à jour : un bien déjà présenté qu'on renvoie n'est pas une
       nouvelle pour le client, il ne déclenche pas de notification. */
    const neuf = bien.etape !== 'presente';
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
    /* Présenté = en attente d'une réponse : la relance se programme ici. */
    await programmerRelance(clientId, bien.recherche_id, 1);

    /* Notification sur le téléphone du client, s'il l'a autorisée. Sans
       attente et sans message d'erreur : l'envoi est déjà fait. */
    if (neuf && bien.recherche_id) {
      fetch('/api/notifier', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recherche_id: bien.recherche_id }),
      }).catch(() => { /* sans effet sur l'envoi */ });
    }

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
  /* Le domaine d'Emilio, pas celui du CRM : ce lien part chez un client.
     window.location.origin donnait « crm.emilio-immo.com/bien/… », ce qui
     marche mais annonce l'outil interne. */
  const lien = lienBienPublic(bien.id);

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
      <button type="button" onClick={() => { setType(id); setValeur(mandat && mandat.type === id ? String(mandat.val) : id === 'pourcentage' ? '3' : '25000'); }}
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
        <RappelMandat mandat={mandat} applique={surMandat}
          onAppliquer={() => { if (mandat) { setType(mandat.type); setValeur(String(mandat.val)); } }} />

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

/* ══ Envoi groupé ══════════════════════════════════════════════
   Plusieurs biens cochés dans « Sélection » partent ensemble : un seul
   mail, une seule notification sur le téléphone du client (« 3 nouveaux
   biens vous attendent »), une seule relance. Les honoraires se fixent
   ici, pour tous d'un coup ou bien par bien, avant l'envoi. */

type LigneHono = { id: string; type: TypeHono; valeur: string };

export function ModaleEnvoiGroupe({ biens, clientId, client, recherche, onFerme, onEnvoye, onMailGroupe }: {
  biens: any[]; clientId: string; client: any; recherche: any;
  onFerme: () => void; onEnvoye: () => void;
  /** Ouvre la fenêtre de mail du dossier avec ces biens-là, et eux seuls. */
  onMailGroupe?: (ids: string[]) => void;
}) {
  const mandat = honorairesDuMandat(recherche);
  const pourTous = honorairesDepart(null, mandat);
  const [typeG, setTypeG] = useState<TypeHono>(pourTous.type);
  const [valG, setValG] = useState<string>(pourTous.valeur);
  const [lignes, setLignes] = useState<LigneHono[]>(() => biens.map(b => ({ id: b.id, ...honorairesDepart(b, mandat) })));
  const [envoi, setEnvoi] = useState(false);
  const [copie, setCopie] = useState(false);
  const n = biens.length;

  const ligneDe = (id: string) => lignes.find(l => l.id === id) || { id, ...pourTous };
  const calc = (b: any) => {
    const l = ligneDe(b.id);
    const base = Number(b.prix_vendeur) || 0;
    const h = montantHonoraires(base, l.type, l.valeur);
    return { l, base, h, total: base + h, v: parseFloat(String(l.valeur).replace(',', '.')) || 0 };
  };
  const toutAppliquer = (type: TypeHono, valeur: string) => {
    setTypeG(type); setValG(valeur);
    setLignes(ls => ls.map(l => ({ ...l, type, valeur })));
  };
  const changerLigne = (id: string, m: Partial<LigneHono>) => setLignes(ls => ls.map(l => (l.id === id ? { ...l, ...m } : l)));
  const vG = parseFloat(String(valG).replace(',', '.')) || 0;
  const surMandat = !!mandat && lignes.every(l => l.type === mandat.type && (parseFloat(String(l.valeur).replace(',', '.')) || 0) === mandat.val);

  /* Les prix d'abord : c'est ce que le mail et l'espace afficheront. */
  function champsPrix(b: any) {
    const { l, base, total, v } = calc(b);
    return { commission_type: l.type, commission_val: v, ...(base > 0 ? { prix_acquereur: total } : {}) };
  }

  async function enregistrerPrix(): Promise<boolean> {
    for (const b of biens) {
      const { error } = await supabase.from('biens').update(champsPrix(b)).eq('id', b.id);
      if (error) { alert(`Les honoraires de « ${b.titre || 'un bien'} » n'ont pas pu être enregistrés.\n\n${error.message}`); return false; }
    }
    return true;
  }

  /* WhatsApp et lien : pas de fenêtre de mail derrière, les biens passent
     en « Présentés » tout de suite. */
  async function presenter(canal: 'whatsapp' | 'lien'): Promise<boolean> {
    const quand = new Date().toISOString();
    const nomCanal = canal === 'whatsapp' ? 'WhatsApp' : 'lien';
    let journalRate = '';
    for (const b of biens) {
      const { base, h, total } = calc(b);
      const { error } = await supabase.from('biens').update({
        ...champsPrix(b), etape: 'presente', envoye_le: quand, canal_envoi: canal, badge_retour: 'propose',
      }).eq('id', b.id);
      if (error) { alert(`« ${b.titre || 'Un bien'} » n'a pas pu passer en « Présentés ».\n\n${error.message}`); return false; }
      const { error: ej } = await supabase.from('journal').insert({
        client_id: clientId, bien_id: b.id, recherche_id: b.recherche_id, type: 'envoi_bien',
        titre: `Envoyé au client · ${nomCanal} · avec ${n - 1} autre${n > 2 ? 's' : ''}`,
        description: base > 0 ? `Prix présenté ${total.toLocaleString('fr-FR')} € — dont ${h.toLocaleString('fr-FR')} € d'honoraires de chasse` : null,
        metadata: {},
      });
      if (ej) journalRate = ej.message;
    }
    const rid = biens[0]?.recherche_id || recherche?.id || null;
    await programmerRelance(clientId, rid, n);
    /* Une seule notification pour tout le lot : son texte (« 3 nouveaux
       biens… ») est calculé au moment où elle s'affiche. */
    if (rid) {
      fetch('/api/notifier', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recherche_id: rid }),
      }).catch(() => { /* sans effet sur l'envoi */ });
    }
    if (journalRate) alert(`Les biens sont bien envoyés, mais le parcours du bien n'a pas pu le noter.\n\n${journalRate}`);
    return true;
  }

  async function viaMail() {
    setEnvoi(true);
    const ok = await enregistrerPrix();
    setEnvoi(false);
    if (!ok) return;
    onFerme();
    onMailGroupe?.(biens.map(b => b.id));
  }

  async function viaWhatsapp() {
    const corps = biens.map((b, i) => {
      const { total } = calc(b);
      const specs = [b.surface && `${b.surface} m²`, b.nb_pieces && `${b.nb_pieces} pièces`].filter(Boolean).join(' · ');
      return `${i + 1}. ${b.titre || b.ville || 'Bien'}${specs ? `\n${specs}` : ''}${total ? `\nPrix : ${total.toLocaleString('fr-FR')} € tout compris` : ''}\n${lienBienPublic(b.id)}`;
    }).join('\n\n');
    const txt = `Bonjour ${client?.prenom || ''}, voici ${n} biens qui correspondent à votre recherche :\n\n${corps}`;
    /* WhatsApp s'ouvre tout de suite, dans le geste du clic : sur iPhone, une
       fenêtre ouverte après une attente est bloquée. */
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
    setEnvoi(true);
    const ok = await presenter('whatsapp');
    setEnvoi(false);
    if (!ok) return;
    onEnvoye(); onFerme();
  }

  const lienDossier = lienEspace(client?.token_espace || recherche?.token_espace);
  async function viaLien() {
    try { if (lienDossier) { await navigator.clipboard.writeText(lienDossier); setCopie(true); } } catch { /* ignore */ }
    setEnvoi(true);
    const ok = await presenter('lien');
    setEnvoi(false);
    if (!ok) return;
    onEnvoye(); setTimeout(onFerme, 800);
  }

  const bascule = (actif: boolean, onClick: () => void, label: string, petit?: boolean) => (
    <button type="button" onClick={onClick}
      style={{
        flex: 1, background: actif ? 'white' : 'transparent', color: actif ? NAVY : '#94a3b8',
        border: 'none', borderRadius: petit ? 7 : 9, padding: petit ? '5px 0' : '8px 0',
        fontSize: petit ? 12 : 13, fontWeight: actif ? 800 : 600, cursor: 'pointer', fontFamily: 'inherit',
        boxShadow: actif ? '0 2px 6px rgba(16,24,40,.14)' : 'none', transition: 'all .2s cubic-bezier(.16,1,.3,1)',
      }}>{label}</button>
  );
  const defautPour = (t: TypeHono) => (mandat && mandat.type === t ? String(mandat.val) : t === 'pourcentage' ? '3' : '25000');

  const canal = (icone: string, titre: string, sous: string, action: () => void, teinte: string, principal?: boolean) => (
    <button type="button" onClick={action} disabled={envoi}
      style={{
        display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left',
        background: principal ? '#fdfaf1' : 'white', border: `1.5px solid ${principal ? '#ecdcb4' : BORD}`, borderRadius: 14, padding: '12px 15px',
        cursor: envoi ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'all .18s cubic-bezier(.16,1,.3,1)', opacity: envoi ? .6 : 1,
      }}
      onMouseEnter={e => { if (!envoi) { e.currentTarget.style.borderColor = teinte; e.currentTarget.style.transform = 'translateX(4px)'; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = principal ? '#ecdcb4' : BORD; e.currentTarget.style.transform = 'none'; }}>
      <span style={{ width: 38, height: 38, borderRadius: 11, background: `${teinte}18`, color: teinte, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icone nom={icone} taille={19} epaisseur={1.8} />
      </span>
      <span style={{ flexGrow: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: NAVY }}>{titre}</span>
        <span style={{ display: 'block', fontSize: 12.5, color: '#94a3b8', marginTop: 1 }}>{sous}</span>
      </span>
      <span style={{ color: '#cbd5e1', fontSize: 19 }}>›</span>
    </button>
  );

  return (
    <Modale onFerme={onFerme} largeur={640}>
      <div style={{ background: NAVY, padding: '20px 24px', display: 'flex', gap: 16, alignItems: 'center' }}>
        <span style={{ display: 'flex', flexShrink: 0, paddingLeft: 12 }}>
          {biens.slice(0, 3).map((b, i) => (
            <span key={b.id} style={{
              width: 46, height: 46, borderRadius: 12, marginLeft: -12, overflow: 'hidden', flexShrink: 0,
              border: `2px solid ${NAVY}`, background: '#2a3547', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#7f8ca3', transform: `rotate(${(i - 1) * 4}deg)`,
            }}>
              {b.photos?.[0] ? <img src={b.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icone nom="maison" taille={18} />}
            </span>
          ))}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: OR, textTransform: 'uppercase', letterSpacing: 1 }}>
            {`Envoyer à ${client?.prenom || 'votre client'}`}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'white', marginTop: 3, lineHeight: 1.25 }}>
            {`${n} biens en un seul envoi`}
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.62)', marginTop: 3 }}>
            Un seul message, une seule notification sur son téléphone.
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 24px 14px', borderBottom: `1px solid ${BORD}`, background: '#fbfcfe' }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 9 }}>
          {`Tes honoraires de chasse · pour les ${n}`}
        </div>
        <RappelMandat mandat={mandat} applique={surMandat} pour={`aux ${n}`}
          onAppliquer={() => { if (mandat) toutAppliquer(mandat.type, String(mandat.val)); }} />
        <div className="emi-hono-tous" style={{ display: 'flex', gap: 11, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: '#eef2f7', borderRadius: 11, padding: 3, width: 180, flexShrink: 0 }}>
            {bascule(typeG === 'pourcentage', () => toutAppliquer('pourcentage', defautPour('pourcentage')), '% du prix')}
            {bascule(typeG === 'fixe', () => toutAppliquer('fixe', defautPour('fixe')), 'Montant fixe')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 150px' }}>
            <input type="number" step={typeG === 'pourcentage' ? '0.1' : '500'} min="0" value={valG}
              onChange={e => toutAppliquer(typeG, e.target.value)} aria-label="Honoraires pour tous les biens"
              style={{ width: '100%', border: `1.5px solid ${BORD}`, borderRadius: 11, padding: '9px 13px', fontSize: 15, fontWeight: 700, color: NAVY, fontFamily: 'inherit', textAlign: 'right', outline: 'none' }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#64748b', width: 14 }}>{typeG === 'pourcentage' ? '%' : '€'}</span>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 8 }}>
          {`S'applique aux ${n} biens. Un bien à part ? Ajuste-le dans sa ligne.`}
        </div>
      </div>

      <div style={{ padding: '6px 24px 4px' }}>
        {biens.map((b, i) => {
          const { l, base, h, total } = calc(b);
          const aPart = l.type !== typeG || (parseFloat(String(l.valeur).replace(',', '.')) || 0) !== vG;
          return (
            <div key={b.id} className="emi-hono-ligne" style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '11px 0',
              borderTop: i ? `1px solid ${BORD}` : 'none',
            }}>
              <span style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: '#eef2f8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b6c1d1' }}>
                {b.photos?.[0] ? <img src={b.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icone nom="maison" taille={16} />}
              </span>
              <span style={{ flex: '1 1 180px', minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.titre || `${b.type_bien || 'Bien'} — ${b.ville || ''}`}
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                  {base > 0 ? `Annonce ${base.toLocaleString('fr-FR')} € · + ${h.toLocaleString('fr-FR')} €` : 'Prix de l’annonce manquant'}
                  {aPart ? ' · à part' : ''}
                </span>
              </span>
              <span className="emi-hono-droite" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 'auto' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input type="number" step={l.type === 'pourcentage' ? '0.1' : '500'} min="0" value={l.valeur}
                    onChange={e => changerLigne(b.id, { valeur: e.target.value })}
                    aria-label={`Honoraires de ${b.titre || 'ce bien'}`}
                    style={{ width: 78, border: `1.5px solid ${aPart ? OR : BORD}`, borderRadius: 9, padding: '6px 8px', fontSize: 13.5, fontWeight: 700, color: NAVY, fontFamily: 'inherit', textAlign: 'right', outline: 'none' }} />
                  <span style={{ display: 'flex', background: '#eef2f7', borderRadius: 9, padding: 2, width: 62 }}>
                    {bascule(l.type === 'pourcentage', () => changerLigne(b.id, { type: 'pourcentage', valeur: defautPour('pourcentage') }), '%', true)}
                    {bascule(l.type === 'fixe', () => changerLigne(b.id, { type: 'fixe', valeur: defautPour('fixe') }), '€', true)}
                  </span>
                </span>
                <span style={{ textAlign: 'right', minWidth: 104 }}>
                  <span style={{ display: 'block', fontSize: 9.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .8 }}>Prix présenté</span>
                  <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: OR, letterSpacing: -.3 }}>{base > 0 ? `${total.toLocaleString('fr-FR')} €` : '—'}</span>
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ padding: '10px 24px 16px', display: 'flex', flexDirection: 'column', gap: 9, borderTop: `1px solid ${BORD}` }}>
        {onMailGroupe && canal('mail', 'Par mail', `Un seul mail avec les ${n} biens — tu le relis avant de l'envoyer`, viaMail, '#3b82f6', true)}
        {canal('tel', 'WhatsApp', `Un seul message avec les ${n} liens`, viaWhatsapp, '#25d366')}
        {lienDossier && canal('lien', copie ? 'Lien copié ✓' : 'Copier le lien de son espace', `Les ${n} biens y apparaissent tout de suite`, viaLien, OR)}
      </div>

      <div style={{ padding: '13px 24px', borderTop: `1px solid ${BORD}`, background: '#fbfcfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#94a3b8', flex: '1 1 220px' }}>{`Les ${n} biens passeront ensemble dans « Présentés »`}</span>
        <button type="button" onClick={onFerme} style={btnSecondaire}>Fermer</button>
      </div>
    </Modale>
  );
}

/* ══ Les photos d'un bien ══════════════════════════════════════
   Avant l'envoi, Alexandre choisit ce que le client verra : l'ordre (la
   première est la photo principale du mail et de l'espace) et celles qui ne
   partent pas. On glisse une photo pour la déplacer — à la souris, ou au
   doigt par sa poignée, pour que la page défile encore normalement sur
   téléphone. Rien n'est écrit avant « Enregistrer ». */

export function ModalePhotos({ bien, onFerme, onEnregistre }: {
  bien: any; onFerme: () => void; onEnregistre: () => void;
}) {
  const depart: string[] = Array.from(new Set(((bien?.photos || []) as string[]).filter(Boolean)));
  const [ordre, setOrdre] = useState<string[]>(depart);
  const [retirees, setRetirees] = useState<string[]>([]);
  const [tire, setTire] = useState<number | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const tireRef = useRef<number | null>(null);

  const change = ordre.join('\n') !== depart.join('\n');

  function commencer(e: React.PointerEvent, i: number) {
    const cible = e.target as HTMLElement;
    const parPoignee = !!cible.closest('[data-poignee]');
    if (e.pointerType !== 'mouse' && !parPoignee) return;       // au doigt : seulement par la poignée
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!parPoignee && cible.closest('button')) return;           // les boutons de la vignette restent des boutons
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* sans effet */ }
    tireRef.current = i; setTire(i);
  }
  function bouger(e: React.PointerEvent) {
    const de = tireRef.current;
    if (de === null) return;
    const sous = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const case_ = sous?.closest('[data-case-photo]') as HTMLElement | null;
    if (!case_) return;
    const vers = Number(case_.dataset.casePhoto);
    if (isNaN(vers) || vers === de) return;
    setOrdre(o => { const a = [...o]; const [x] = a.splice(de, 1); a.splice(vers, 0, x); return a; });
    tireRef.current = vers; setTire(vers);
  }
  function lacher() { tireRef.current = null; setTire(null); }

  const enPremier = (i: number) => setOrdre(o => { const a = [...o]; const [x] = a.splice(i, 1); a.unshift(x); return a; });
  const retirer = (u: string) => { setOrdre(o => o.filter(x => x !== u)); setRetirees(r => [...r, u]); };
  const remettre = (u: string) => { setRetirees(r => r.filter(x => x !== u)); setOrdre(o => [...o, u]); };

  async function enregistrer() {
    if (!ordre.length && !window.confirm('Retirer toutes les photos de ce bien ?\n\nLe client ne verra plus aucune photo, ni dans le mail ni dans son espace.')) return;
    setEnvoi(true);
    const { error } = await supabase.from('biens').update({ photos: ordre }).eq('id', bien.id);
    if (error) { setEnvoi(false); alert("Les photos n'ont pas pu être enregistrées.\n\n" + error.message); return; }
    /* Les photos retirées que nous hébergeons ne servent plus à rien : on les
       efface du stockage. Un échec ici ne compte pas, le bien est à jour. */
    const chemins = retirees
      .filter(u => u.includes('supabase.co/storage'))
      .map(u => (u.match(/photos-biens\/(.+)$/) || [])[1])
      .filter(Boolean) as string[];
    if (chemins.length) { try { await supabase.storage.from('photos-biens').remove(chemins); } catch { /* sans effet */ } }
    setEnvoi(false); onEnregistre(); onFerme();
  }

  const titre = bien?.titre || `${bien?.type_bien || 'Bien'} — ${bien?.ville || ''}`;
  const pied = `${ordre.length} photo${ordre.length > 1 ? 's' : ''}${retirees.length ? ` · ${retirees.length} retirée${retirees.length > 1 ? 's' : ''}` : ''}`;

  return (
    <Modale onFerme={onFerme} largeur={900}>
      <style>{`
        .emi-ph-grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:12px}
        .emi-ph-case{position:relative;border-radius:14px;overflow:hidden;aspect-ratio:4/3;background:#eef2f8;user-select:none;-webkit-user-select:none;cursor:grab;transition:box-shadow .18s ease,transform .18s ease,outline-color .18s ease;outline:2px solid transparent;outline-offset:2px}
        .emi-ph-case:hover{box-shadow:0 12px 26px -16px rgba(16,24,40,.55)}
        .emi-ph-case[data-tire="oui"]{cursor:grabbing;transform:scale(1.04);outline-color:${OR};box-shadow:0 20px 40px -18px rgba(16,24,40,.6);z-index:2}
        .emi-ph-case img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;-webkit-user-drag:none}
        .emi-ph-bouton{width:32px;height:32px;border-radius:10px;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;background:rgba(255,255,255,.94);color:${NAVY};box-shadow:0 2px 8px rgba(16,24,40,.22);transition:transform .15s ease}
        .emi-ph-bouton:hover{transform:scale(1.08)}
        .emi-ph-poignee{touch-action:none;cursor:grab}
        @keyframes emiPhIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
        .emi-ph-case{animation:emiPhIn .3s cubic-bezier(.2,.9,.3,1) both}
        @media (max-width:760px){
          .emi-ph-grille{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px} .emi-ph-bouton{width:36px;height:36px}
          .emi-ph-pied > span{flex:1 1 100% !important} .emi-ph-pied > button{flex:1 1 0;padding-top:13px !important;padding-bottom:13px !important}
        }
      `}</style>

      <div style={{ background: NAVY, padding: '18px 24px', display: 'flex', gap: 14, alignItems: 'center' }}>
        <span style={{ width: 42, height: 42, borderRadius: 13, background: 'rgba(201,168,76,.16)', color: OR, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icone nom="photos" taille={21} epaisseur={1.8} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: OR, textTransform: 'uppercase', letterSpacing: 1 }}>Photos du bien</div>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: 'white', marginTop: 3, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titre}</div>
        </div>
        <button type="button" onClick={onFerme} aria-label="Fermer"
          style={{ width: 36, height: 36, borderRadius: 11, border: 'none', background: 'rgba(255,255,255,.1)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <Icone nom="fermer" taille={15} epaisseur={2} />
        </button>
      </div>

      <div style={{ padding: '16px 24px 18px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '64vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.55 }}>
          Glisse une photo pour la déplacer. La première est la <b style={{ color: NAVY }}>photo principale</b>{' '}: c’est elle que le client voit en premier, dans le mail comme dans son espace.
        </div>

        {ordre.length > 0 ? (
          <div className="emi-ph-grille" onPointerMove={bouger} onPointerUp={lacher} onPointerCancel={lacher}>
            {ordre.map((u, i) => (
              <div key={u} className="emi-ph-case" data-case-photo={i} data-tire={tire === i ? 'oui' : undefined}
                onPointerDown={e => commencer(e, i)} style={{ animationDelay: Math.min(i, 12) * 25 + 'ms' }}>
                <img src={u} alt={`Photo ${i + 1}`} draggable={false}
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0.25'; }} />
                <span style={{ position: 'absolute', top: 8, left: 8, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: i === 0 ? OR : 'rgba(16,24,40,.62)', color: i === 0 ? NAVY : 'white' }}>
                  {i === 0 ? <><Icone nom="etoile" taille={11} epaisseur={2.4} />Principale</> : i + 1}
                </span>
                <span style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 6 }}>
                  {i > 0 && (
                    <button type="button" className="emi-ph-bouton" onClick={() => enPremier(i)} title="Mettre en photo principale" aria-label={`Mettre la photo ${i + 1} en photo principale`}>
                      <Icone nom="etoile" taille={15} epaisseur={2} />
                    </button>
                  )}
                  <button type="button" className="emi-ph-bouton" onClick={() => retirer(u)} title="Retirer cette photo" aria-label={`Retirer la photo ${i + 1}`} style={{ color: '#b42318' }}>
                    <Icone nom="corbeille" taille={15} epaisseur={2} />
                  </button>
                </span>
                <button type="button" data-poignee className="emi-ph-bouton emi-ph-poignee" aria-label={`Déplacer la photo ${i + 1}`}
                  style={{ position: 'absolute', bottom: 7, left: 7 }}>
                  <Icone nom="poignee" taille={16} epaisseur={2.6} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '34px 10px', textAlign: 'center', color: '#94a3b8', fontSize: 13.5, border: `1.5px dashed ${BORD}`, borderRadius: 14 }}>
            Plus aucune photo : le client n’en verra pas. Remets-en une ci-dessous si c’était une erreur.
          </div>
        )}

        {retirees.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
              {`Retirées · ${retirees.length}`}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {retirees.map(u => (
                <button key={u} type="button" onClick={() => remettre(u)} title="Remettre cette photo"
                  style={{ position: 'relative', width: 104, height: 78, borderRadius: 11, overflow: 'hidden', border: `1px solid ${BORD}`, padding: 0, cursor: 'pointer', background: '#eef2f8' }}>
                  <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(1)', opacity: .5, display: 'block' }} />
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: NAVY }}>
                    <Icone nom="remettre" taille={13} epaisseur={2.4} />Remettre
                  </span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Elles seront effacées pour de bon à l’enregistrement.
            </div>
          </div>
        )}
      </div>

      <div className="emi-ph-pied" style={{ padding: '13px 24px', borderTop: `1px solid ${BORD}`, background: '#fbfcfe', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: '#94a3b8', flex: '1 1 160px' }}>{pied}</span>
        <button type="button" onClick={onFerme} style={btnSecondaire}>Annuler</button>
        <button type="button" onClick={enregistrer} disabled={envoi || (!change && !retirees.length)}
          style={{ ...btnPrincipal, background: change || retirees.length ? OR : '#cbd5e1', color: change || retirees.length ? NAVY : 'white', cursor: change || retirees.length ? 'pointer' : 'default' }}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
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
  notifications: { i: '🔔', l: 'A activé les notifications', c: '#10b981' },
  mandat: { i: '✍️', l: 'Mandat de recherche', c: '#c9a84c' },
};

export function LienEspace({ recherche, client }: { recherche: any; client: any }) {
  const [copie, setCopie] = useState(false);
  const [ouvertures, setOuvertures] = useState<number | null>(null);
  const [deplie, setDeplie] = useState(false);
  const [evts, setEvts] = useState<any[] | null>(null);

  /* Le lien qu'on donne au client est le SIEN, pas celui d'une recherche
     (voir src/lib/espace.ts) : il ne bouge pas quand on lui en ouvre une
     deuxième, et il survit à la suppression de la première. Le jeton de la
     recherche ne sert plus qu'en secours, le temps que tous les dossiers
     soient repris. */
  const token = client?.token_espace || recherche?.token_espace;
  /* Les nouveaux jetons donnent l'adresse courte sur espace.emilio-immo.com ;
     les anciens gardent celle sous laquelle le client les a reçus. */
  const url = token ? lienEspace(token) : '';
  const court = !!token && token.length <= 40;

  useEffect(() => {
    if (!recherche?.id) return;
    supabase.from('espace_evenements')
      .select('id', { count: 'exact', head: true })
      .eq('recherche_id', recherche.id).eq('type', 'ouverture')
      .then(({ count }) => setOuvertures(count ?? 0));
  }, [recherche?.id]);

  useEffect(() => {
    if (!deplie || evts || !recherche?.id) return;
    /* « A activé les notifications » : une seule ligne, la première. Jusqu'au
       24 septembre, l'espace en écrivait une à chaque ouverture sur un
       téléphone déjà autorisé — ces doublons ne veulent rien dire et
       noyaient le reste. */
    Promise.all([
      supabase.from('espace_evenements').select('*')
        .eq('recherche_id', recherche.id).neq('type', 'notifications')
        .order('created_at', { ascending: false }).limit(30),
      supabase.from('espace_evenements').select('*')
        .eq('recherche_id', recherche.id).eq('type', 'notifications')
        .order('created_at', { ascending: true }).limit(1),
    ]).then(([a, b]) => setEvts([...(a.data || []), ...(b.data || [])]
      .sort((x: any, y: any) => String(y.created_at).localeCompare(String(x.created_at)))));
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
    <div className="le-barre" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 13px' }}>
      <span className="le-titre" style={{ fontSize: 10, fontWeight: 800, color: '#9aa8bd', textTransform: 'uppercase', letterSpacing: 1 }}>
        Espace client
      </span>
      <code className="le-lien" style={{
        fontSize: 11.5, color: '#64748b', background: '#f7f9fc', border: `1px solid ${BORD}`,
        borderRadius: 7, padding: '4px 9px', maxWidth: 190, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace',
      }} title={url}>{court ? `espace.emilio-immo.com/${token}` : `/espace/${String(token).slice(0, 12)}…`}</code>

      <button type="button" className="le-btn" onClick={copier} style={btnEspace(copie ? '#ecfdf5' : '#f7f9fc', copie ? '#059669' : '#475569', copie ? '#a7f3d0' : BORD)}>
        {copie ? '✓ Copié' : 'Copier le lien'}
      </button>
      <button type="button" className="le-btn" onClick={whatsapp} style={btnEspace('#f0fdf4', '#15803d', '#bbf7d0')}>WhatsApp</button>
      <a className="le-btn" href={url} target="_blank" rel="noopener noreferrer" style={btnEspace('#f7f9fc', '#475569', BORD)}>Ouvrir</a>

      <button type="button" className="le-etat" onClick={() => setDeplie(d => !d)}
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
                {e.detail && e.type !== 'notifications' && <span style={{ fontSize: 13, color: '#475569' }}>{` — ${e.detail}`}</span>}
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
