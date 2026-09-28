'use client';
import { useEffect, useState } from 'react';
import { EVT_ECHEC, type Echec } from '@/lib/ecritures';
import styles from './AppLayout.module.css';

/* ═══ « Ce n'a pas pu être enregistré » (V3.17) ═══════════════════════════
   Chaque écriture vérifiée qui échoue (voir src/lib/ecritures.ts) envoie un
   événement ; il s'affiche ici, en rouge, en bas de l'écran, avec la raison.
   Il reste jusqu'à ce qu'on le ferme : un échec ne doit pas passer
   inaperçu. Trois au plus à la fois ; le même message ne s'empile pas. */

export default function Avertissements() {
  const [liste, setListe] = useState<Echec[]>([]);
  useEffect(() => {
    const recevoir = (e: Event) => {
      const x = (e as CustomEvent<Echec>).detail;
      if (!x) return;
      setListe(l => [...l.filter(y => y.quoi !== x.quoi || y.detail !== x.detail), x].slice(-3));
    };
    window.addEventListener(EVT_ECHEC, recevoir);
    return () => window.removeEventListener(EVT_ECHEC, recevoir);
  }, []);
  if (!liste.length) return null;
  return (
    <div className={styles.echecs} role="alert" aria-live="assertive">
      {liste.map(x => (
        <div key={`${x.quoi}-${x.le}`} className={styles.echec}>
          <span className={styles.echecIc} aria-hidden="true">!</span>
          <div>
            <b>{`${x.quoi} : pas enregistré.`}</b>
            {x.detail && <small>{x.detail}</small>}
          </div>
          <button type="button" aria-label="Fermer ce message" onClick={() => setListe(l => l.filter(y => y !== x))}>✕</button>
        </div>
      ))}
    </div>
  );
}
