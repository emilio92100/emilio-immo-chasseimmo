'use client';
import type { ReactNode } from 'react';
import styles from './EnteteRubrique.module.css';

/* L'en-tête d'une rubrique (Visites, Mes clients) : le titre et ses chiffres
   dans un seul bloc. Les chiffres sont des filtres — on clique sur « À venir »,
   la liste en dessous ne montre plus que les visites à venir.

   Il remplace trois choses qui se répétaient : le titre posé seul, la ligne
   grise « 8 clients · 5 actifs · 2 prospects », et les pastilles de filtre
   avec leur petit compteur. Un chiffre, un seul endroit.

   Sur ordinateur : un bandeau marine compact, les chiffres en pastilles sur
   une ligne, le filtre en cours en blanc — il se détache de la liste claire
   sans prendre de place. Sur téléphone : une carte blanche compacte, la
   recherche sous le titre, les chiffres en bandeau qui défile au doigt.
   Tout se joue dans EnteteRubrique.module.css. */
export type Tuile = {
  cle: string;
  lib: string;
  n: number;
  /* La pastille de couleur du statut. Absente pour « Tous ». */
  couleur?: string;
  /* Une tuile qui demande une action (ex. « Compte rendu à faire ») : elle
     ressort tant qu'elle n'est pas à zéro. */
  alerte?: boolean;
};

export default function EnteteRubrique({
  titre, icone, phrase, recherche, bouton, tuiles, actif, onChoisir, label,
}: {
  titre: string;
  icone: ReactNode;
  phrase?: string;
  recherche?: { valeur: string; onChange: (v: string) => void; placeholder: string; label: string };
  bouton?: { lib: string; onClick: () => void };
  tuiles: Tuile[];
  actif: string;
  onChoisir: (cle: string) => void;
  label: string;
}) {
  return (
    <section className={styles.bloc}>
      <div className={styles.haut}>
        <div className={styles.titreZone}>
          <span className={styles.icone} aria-hidden="true">{icone}</span>
          <div className={styles.titreTextes}>
            <h1 className={styles.titre}>{titre}</h1>
            {phrase && <p className={styles.phrase}>{phrase}</p>}
          </div>
        </div>
        {(recherche || bouton) && (
          <div className={styles.outils}>
            {recherche && (
              <label className={styles.recherche}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7" /><path d="m20.5 20.5-4.7-4.7" /></svg>
                <input value={recherche.valeur} onChange={e => recherche.onChange(e.target.value)}
                  placeholder={recherche.placeholder} aria-label={recherche.label} />
              </label>
            )}
            {bouton && (
              <button type="button" className={styles.bouton} onClick={bouton.onClick}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                <span>{bouton.lib}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {tuiles.length > 0 && <div className={styles.rangee} role="group" aria-label={label}>
        {tuiles.map(t => {
          const on = t.cle === actif;
          const vide = t.n === 0 && !on;
          const alerte = !!t.alerte && t.n > 0 && !on;
          return (
            <button key={t.cle} type="button" aria-pressed={on} onClick={() => onChoisir(t.cle)}
              className={`${styles.tuile} ${on ? styles.on : ''} ${vide ? styles.vide : ''} ${alerte ? styles.alerte : ''}`}>
              <span className={styles.n}>{t.n}</span>
              <span className={styles.lib}>
                {t.couleur && <span className={styles.point} style={{ background: t.couleur }} />}
                <span>{t.lib}</span>
              </span>
            </button>
          );
        })}
      </div>}
    </section>
  );
}

/* Les deux pictogrammes des rubriques, dessinés au même trait que la barre latérale. */
export const PictoVisites = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.5 10.5 12 4l8.5 6.5" /><path d="M5.5 9v10.5h13V9" /><path d="M10 19.5v-5h4v5" />
  </svg>
);
export const PictoClients = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8.5" r="3.5" /><path d="M2.8 19.5c.7-3.3 3.2-5.2 6.2-5.2s5.5 1.9 6.2 5.2" />
    <path d="M15.5 5.3a3.4 3.4 0 0 1 0 6.4" /><path d="M17.6 14.6c2 .6 3.3 2.3 3.7 4.9" />
  </svg>
);
