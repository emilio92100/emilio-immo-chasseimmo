'use client';
import { useEffect, useState } from 'react';
import { EVT_SUCCES, type Succes as Annonce } from '@/lib/succes';
import { Ic } from '@/components/documents/ApercuActe';
import s from './Succes.module.css';

/* ═══ « C'est fait », en haut à droite (V3.174) ═══════════════════════════
   Voir src/lib/succes.ts. Une carte par annonce (trois au plus), au-dessus
   de toute fenêtre ; elle s'en va seule au bout de quatre secondes et demie
   (la barre du bas le montre), ou d'un appui. Le mouvement est le sien :
   `data-emi-anim="non"` pour que src/lib/mouvement.ts ne la prenne pas pour
   un menu. */
const DUREE = 4500;

export default function Succes() {
  const [liste, setListe] = useState<Annonce[]>([]);
  useEffect(() => {
    const recevoir = (e: Event) => {
      const x = (e as CustomEvent<Annonce>).detail;
      if (!x) return;
      setListe(l => [...l.filter(y => y.titre !== x.titre || y.detail !== x.detail), x].slice(-3));
      setTimeout(() => setListe(l => l.filter(y => y.le !== x.le)), DUREE);
    };
    window.addEventListener(EVT_SUCCES, recevoir);
    return () => window.removeEventListener(EVT_SUCCES, recevoir);
  }, []);
  if (!liste.length) return null;
  return (
    <div className={s.pile} role="status" aria-live="polite" data-emi-anim="non">
      {liste.map(x => (
        <button key={x.le} type="button" className={s.carte} data-emi-anim="non" onClick={() => setListe(l => l.filter(y => y !== x))} aria-label={`${x.titre}. Fermer`}>
          <span className={s.ic} aria-hidden="true">
            {x.ic ? <Ic n={x.ic} t={17} /> : null}
            <span className={s.coche}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            </span>
          </span>
          <span className={s.tx}>
            <b>{x.titre}</b>
            {x.detail && <small>{x.detail}</small>}
          </span>
          <span className={s.temps} style={{ animationDuration: `${DUREE}ms` }} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
