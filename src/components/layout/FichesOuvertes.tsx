'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import AvatarContact, { type Teinte } from '@/components/contacts/AvatarContact';
import styles from './FichesOuvertes.module.css';

/* ═══ Les fiches ouvertes, en bas de l'écran ══════════════════════════════
   Chaque contact et chaque bien qu'on ouvre prend place dans une barre en
   bas : on passe de l'un à l'autre d'un clic, sans repasser par la liste ni
   refaire la recherche. La croix le retire de la barre (la fiche, elle, ne
   bouge pas). La barre est gardée dans le navigateur : elle survit à un F5.

   Qui la remplit ?
     · les contacts : AppLayout, à chaque ouverture d'une fiche ;
     · les biens : FicheBien, à son ouverture (EVT_FICHE_OUVERTE), et il dit
       aussi quel bien est à l'écran (EVT_BIEN_ACTIF) pour l'allumer. */

export type FicheOuverte = {
  k: 'contact' | 'bien';
  id: string;
  titre: string;
  sous?: string;
  /* Un contact : de quoi dessiner son avatar. Un bien : sa photo. */
  personne?: { prenom?: string | null; nom?: string | null; civilite?: string | null; couple?: boolean | null; conjoint?: unknown; types?: unknown };
  statut?: string | null;
  photo?: string | null;
};

export const EVT_FICHE_OUVERTE = 'emilio:fiche-ouverte';
export const EVT_BIEN_ACTIF = 'emilio:bien-actif';
export function signalerFicheOuverte(f: FicheOuverte) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<FicheOuverte>(EVT_FICHE_OUVERTE, { detail: f }));
}
export function signalerBienActif(id: string | null) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<string | null>(EVT_BIEN_ACTIF, { detail: id }));
}

/* La mémoire du navigateur : une commodité, jamais indispensable. */
const CLE = 'fiches.ouvertes';
export const MAX_FICHES = 10;
export function lireFiches(): FicheOuverte[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLE) || '[]');
    return Array.isArray(v) ? v.filter(x => x && (x.k === 'contact' || x.k === 'bien') && typeof x.id === 'string').slice(0, MAX_FICHES) : [];
  } catch { return []; }
}
export function ecrireFiches(l: FicheOuverte[]) {
  try { localStorage.setItem(CLE, JSON.stringify(l)); } catch { /* sans mémoire */ }
}
/* Ajoute (ou met à jour) une fiche : elle garde sa place si elle y est
   déjà ; sinon elle arrive au bout, et la plus ancienne part au-delà de dix. */
export function ajouterFiche(l: FicheOuverte[], f: FicheOuverte): FicheOuverte[] {
  const i = l.findIndex(x => x.k === f.k && x.id === f.id);
  if (i >= 0) { const n = [...l]; n[i] = { ...l[i], ...f }; return n; }
  const n = [...l, f];
  return n.length > MAX_FICHES ? n.slice(n.length - MAX_FICHES) : n;
}

const TEINTES: Record<string, Teinte> = {
  actif: { bg: '#ecfdf5', fg: '#0f7a4f' }, prospect: { bg: '#f5f3ff', fg: '#6d28d9' },
  suspendu: { bg: '#fffbeb', fg: '#b45309' }, bien_trouve: { bg: '#eff6ff', fg: '#1d4ed8' },
  perdu: { bg: '#fef2f2', fg: '#b91c1c' },
};

export default function FichesOuvertes({ fiches, active, onOuvrir, onFermer, onToutFermer }: {
  fiches: FicheOuverte[];
  active: { k: 'contact' | 'bien'; id: string } | null;
  onOuvrir: (f: FicheOuverte) => void;
  onFermer: (f: FicheOuverte) => void;
  onToutFermer: () => void;
}) {
  /* Quand elles ne tiennent pas toutes : des flèches pour faire défiler, et
     à droite le nombre de fiches cachées. On le recompte à chaque défilement
     et à chaque changement de taille. */
  const liste = useRef<HTMLDivElement>(null);
  const [cache, setCache] = useState({ gauche: 0, droite: 0 });
  const mesurer = useCallback(() => {
    const el = liste.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let gauche = 0, droite = 0;
    for (const ch of Array.from(el.children) as HTMLElement[]) {
      const c = ch.getBoundingClientRect();
      if (c.right > r.right + 2) droite++;
      else if (c.left < r.left - 2) gauche++;
    }
    setCache(x => (x.gauche === gauche && x.droite === droite ? x : { gauche, droite }));
  }, []);
  useEffect(() => {
    mesurer();
    const el = liste.current;
    if (!el) return;
    el.addEventListener('scroll', mesurer, { passive: true });
    window.addEventListener('resize', mesurer);
    return () => { el.removeEventListener('scroll', mesurer); window.removeEventListener('resize', mesurer); };
  }, [mesurer, fiches.length]);
  /* La fiche à l'écran reste visible dans la barre. */
  const cleActive = active ? `${active.k}:${active.id}` : '';
  useEffect(() => {
    if (!cleActive) return;
    liste.current?.querySelector<HTMLElement>(`[data-cle="${cleActive}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [cleActive]);
  const defiler = (sens: 1 | -1) => {
    const el = liste.current;
    if (el) el.scrollBy({ left: sens * Math.max(160, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  if (!fiches.length) return null;
  return (
    <nav className={styles.barre} aria-label="Fiches ouvertes">
      <span className={styles.titre}>Fiches ouvertes<i>{fiches.length}</i></span>
      {cache.gauche > 0 && (
        <button type="button" className={styles.fleche} onClick={() => defiler(-1)} aria-label={`Voir les ${cache.gauche} fiche${cache.gauche > 1 ? 's' : ''} à gauche`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
          <b>{cache.gauche}</b>
        </button>
      )}
      <div className={styles.liste} ref={liste}>
        {fiches.map(f => {
          const on = !!active && active.k === f.k && active.id === f.id;
          return (
            <div key={`${f.k}:${f.id}`} data-cle={`${f.k}:${f.id}`} className={`${styles.fiche} ${on ? styles.on : ''}`}>
              <button type="button" className={styles.ouvrir} onClick={() => onOuvrir(f)} aria-current={on ? 'page' : undefined} title={f.sous ? `${f.titre} · ${f.sous}` : f.titre}>
                {f.k === 'contact'
                  ? <AvatarContact c={f.personne || { prenom: f.titre }} teinte={TEINTES[f.statut || 'actif'] || TEINTES.actif} taille={26} />
                  : <span className={styles.vignette}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {f.photo ? <img src={f.photo} alt="" /> : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 10.5 12 4l8.5 6.5" /><path d="M5.5 9v10.5h13V9" /><path d="M10 19.5v-5h4v5" /></svg>
                      )}
                    </span>}
                <span className={styles.textes}>
                  <b>{f.titre}</b>
                  {f.sous && <small>{f.sous}</small>}
                </span>
              </button>
              <button type="button" className={styles.croix} onClick={() => onFermer(f)} aria-label={`Retirer ${f.titre} de la barre`}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
          );
        })}
      </div>
      {cache.droite > 0 && (
        <button type="button" className={styles.fleche} onClick={() => defiler(1)} aria-label={`Voir les ${cache.droite} autre${cache.droite > 1 ? 's' : ''} fiche${cache.droite > 1 ? 's' : ''}`}>
          <b>{`+${cache.droite}`}</b>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      )}
      {fiches.length > 1 && <button type="button" className={styles.tout} onClick={onToutFermer}>Tout fermer</button>}
    </nav>
  );
}
