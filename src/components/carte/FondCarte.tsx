'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as CarteML } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { STYLE_CARTE, MENTION_CARTE, CENTRE } from '@/lib/carte';

/* ═══ Le fond de carte (V3.26) ═════════════════════════════════════════════
   OpenFreeMap « Bright », dessiné par MapLibre. La bibliothèque (lourde) ne
   se charge qu'à l'ouverture d'une carte, jamais avec le reste du CRM ou de
   l'espace. Les commerces et les numéros de rue sont effacés : la carte ne
   montre que les rues, les quartiers, et ce que nous y posons.

   La carte apparaît en fondu, une fois ses premières rues dessinées : jamais
   un carré gris qui se remplit par morceaux. La mention d'OpenFreeMap, due,
   reste toute petite, en gris, dans un coin. */

export type MapLibre = typeof import('maplibre-gl');
const PAS_CHARGEE = 'La carte n’a pas pu se charger.';

export default function FondCarte({ centre = CENTRE, zoom = 13, className, mention = 'bas-gauche', surPrete, surErreur, interactif = true }: {
  centre?: [number, number];
  zoom?: number;
  className?: string;
  mention?: 'bas-gauche' | 'bas-droite' | 'haut-droite' | 'sous-filtres' | 'aucune';
  /* Appelé une fois, la carte prête : c'est là qu'on pose couches et repères. */
  surPrete: (carte: CarteML, ml: MapLibre) => void | (() => void);
  surErreur?: (m: string) => void;
  interactif?: boolean;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const [prete, setPrete] = useState(false);
  const [panne, setPanne] = useState(false);
  const rappel = useRef(surPrete);
  rappel.current = surPrete;
  const rappelErreur = useRef(surErreur);
  rappelErreur.current = surErreur;

  useEffect(() => {
    let vivant = true;
    let carte: CarteML | null = null;
    let nettoyer: void | (() => void);
    let obs: ResizeObserver | null = null;
    (async () => {
      let ml: MapLibre;
      try { ml = (await import('maplibre-gl')).default as unknown as MapLibre; }
      catch {
        if (vivant) { setPanne(true); rappelErreur.current?.(PAS_CHARGEE); }
        return;
      }
      if (!vivant || !boite.current) return;
      carte = new ml.Map({
        container: boite.current, style: STYLE_CARTE, center: centre, zoom,
        attributionControl: false, interactive: interactif, dragRotate: false, pitchWithRotate: false,
        touchPitch: false, maxZoom: 18.5, minZoom: 5, fadeDuration: 180,
      });
      carte.touchZoomRotate.disableRotation();
      carte.on('error', e => {
        /* Une tuile qui manque ne casse rien ; le style qui ne vient pas, si. */
        if (!carte?.isStyleLoaded() && vivant && !prete) { setPanne(true); rappelErreur.current?.((e?.error as Error)?.message || 'Le fond de carte ne répond pas.'); }
      });
      carte.on('load', () => {
        if (!vivant || !carte) return;
        for (const l of carte.getStyle().layers || []) {
          if (/poi|housenumber/.test(l.id)) carte.setLayoutProperty(l.id, 'visibility', 'none');
        }
        nettoyer = rappel.current(carte, ml);
        /* Le fondu attend les premières rues dessinées. */
        carte.once('idle', () => { if (vivant) setPrete(true); });
        setTimeout(() => { if (vivant) setPrete(true); }, 1600);
      });
      obs = new ResizeObserver(() => carte?.resize());
      obs.observe(boite.current);
    })();
    return () => {
      vivant = false;
      obs?.disconnect();
      if (typeof nettoyer === 'function') nettoyer();
      carte?.remove();
    };
    // La carte se crée une fois ; le centre et le zoom de départ ne la recréent pas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden', background: '#eef1f5' }}>
      <div ref={boite} style={{ position: 'absolute', inset: 0, opacity: prete ? 1 : 0, transition: 'opacity .55s ease' }} />
      {!prete && !panne && <div className="carte-attente" aria-hidden="true" />}
      {panne && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#64748b', font: "600 14px 'DM Sans', sans-serif" }}>
          La carte ne répond pas pour l’instant. Réessaie dans un moment.
        </div>
      )}
      {mention !== 'aucune' && (
        <span className={`carte-mention carte-mention-${mention}`}>{MENTION_CARTE}</span>
      )}
    </div>
  );
}
