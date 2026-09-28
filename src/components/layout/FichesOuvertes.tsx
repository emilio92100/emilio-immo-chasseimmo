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
       aussi quel bien est à l'écran (EVT_BIEN_ACTIF) pour l'allumer ;
     · la carte : PageCarte, quand on ouvre une fiche depuis elle — un clic
       sur son bloc la rouvre là où on l'avait laissée (V3.27).

   Les blocs se rangent à la main : on en attrape un et on le fait glisser
   (au doigt : un appui un peu long, puis glisser). L'ordre est gardé. */

export type FicheOuverte = {
  k: 'contact' | 'bien' | 'carte';
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
    return Array.isArray(v) ? v.filter(x => x && (x.k === 'contact' || x.k === 'bien' || x.k === 'carte') && typeof x.id === 'string').slice(0, MAX_FICHES) : [];
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

/* Ranger les blocs : où en est le glissement. `de` : la place de départ ;
   `vers` : celle où il tomberait si on lâchait maintenant ; `dx` : de combien
   il a suivi le pointeur ; `pas` : la largeur d'un bloc et de son écart. */
type Glisse = { de: number; vers: number; dx: number; pas: number; centres: number[]; x0: number; actif: boolean };

export default function FichesOuvertes({ fiches, active, onOuvrir, onFermer, onToutFermer, onRanger }: {
  fiches: FicheOuverte[];
  active: { k: FicheOuverte['k']; id: string } | null;
  onOuvrir: (f: FicheOuverte) => void;
  onFermer: (f: FicheOuverte) => void;
  onToutFermer: () => void;
  /* Le nouvel ordre, une fois un bloc déplacé. */
  onRanger?: (l: FicheOuverte[]) => void;
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

  /* ── Ranger en faisant glisser ──
     À la souris, le glissement commence dès que le pointeur a bougé de
     quelques pixels (un clic reste un clic). Au doigt, la bande défile
     déjà sous le doigt : il faut un appui d'un tiers de seconde, puis
     glisser — le téléphone vibre quand le bloc est « attrapé ». Pendant le
     glissement, les autres blocs s'écartent pour lui faire place ; près
     d'un bord, la bande défile d'elle-même. */
  const [glisse, setGlisse] = useState<Glisse | null>(null);
  const [pose, setPose] = useState(false);            // l'instant du lâcher, sans animation
  const apresGlisse = useRef(false);                  // le clic qui suit un glissement ne compte pas
  const fichesRef = useRef(fiches);
  fichesRef.current = fiches;
  useEffect(() => {
    if (!pose) return;
    let b = 0;
    const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setPose(false)); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, [pose]);

  const debut = (e: React.PointerEvent, i: number) => {
    const el = liste.current;
    if (!el || !onRanger || fichesRef.current.length < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest(`.${styles.croix}`)) return;
    const enContenu = (x: number) => x - el.getBoundingClientRect().left + el.scrollLeft;
    const blocs = Array.from(el.children) as HTMLElement[];
    const centres = blocs.map(b => enContenu(b.getBoundingClientRect().left) + b.offsetWidth / 2);
    const ecart = parseFloat(getComputedStyle(el).columnGap) || 8;
    const etat: Glisse = { de: i, vers: i, dx: 0, pas: blocs[i].offsetWidth + ecart, centres, x0: enContenu(e.clientX), actif: false };
    const doigt = e.pointerType !== 'mouse';
    const y0 = e.clientY;
    const attraper = () => {
      etat.actif = true;
      setGlisse({ ...etat });
      if (doigt) { try { navigator.vibrate?.(14); } catch { /* pas de vibreur */ } }
    };
    const appui = doigt ? setTimeout(attraper, 320) : null;
    const bouge = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = enContenu(ev.clientX) - etat.x0;
      if (!etat.actif) {
        /* Au doigt, bouger avant la fin de l'appui, c'est faire défiler. */
        if (doigt) { if (Math.abs(dx) > 8 || Math.abs(ev.clientY - y0) > 8) fin(); return; }
        if (Math.abs(dx) < 6) return;
        attraper();
      }
      const r = el.getBoundingClientRect();
      if (ev.clientX < r.left + 36) el.scrollLeft -= 12;
      else if (ev.clientX > r.right - 36) el.scrollLeft += 12;
      etat.dx = enContenu(ev.clientX) - etat.x0;
      const centre = etat.centres[etat.de] + etat.dx;
      etat.vers = etat.centres.filter((c, j) => j !== etat.de && c < centre).length;
      setGlisse({ ...etat });
    };
    /* Le doigt qui glisse ne doit plus faire défiler la page. */
    const bloquer = (ev: TouchEvent) => { if (etat.actif && ev.cancelable) ev.preventDefault(); };
    const fin = () => {
      if (appui) clearTimeout(appui);
      window.removeEventListener('pointermove', bouge);
      window.removeEventListener('pointerup', lacher);
      window.removeEventListener('pointercancel', fin);
      el.removeEventListener('touchmove', bloquer);
      if (etat.actif) {
        apresGlisse.current = true;
        setTimeout(() => { apresGlisse.current = false; }, 0);
        setPose(true);
      }
      setGlisse(null);
    };
    const lacher = () => {
      if (etat.actif && etat.vers !== etat.de) {
        const n = [...fichesRef.current];
        const [x] = n.splice(etat.de, 1);
        n.splice(etat.vers, 0, x);
        onRanger(n);
      }
      fin();
    };
    window.addEventListener('pointermove', bouge);
    window.addEventListener('pointerup', lacher);
    window.addEventListener('pointercancel', fin);
    el.addEventListener('touchmove', bloquer, { passive: false });
  };
  /* Où se tient chaque bloc pendant le glissement. */
  const place = (j: number): React.CSSProperties | undefined => {
    if (!glisse?.actif) return undefined;
    const { de, vers, dx, pas } = glisse;
    if (j === de) return { transform: `translateX(${dx}px)` };
    if (de < vers && j > de && j <= vers) return { transform: `translateX(${-pas}px)` };
    if (vers < de && j >= vers && j < de) return { transform: `translateX(${pas}px)` };
    return undefined;
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
      {/* Quand des fiches dépassent d'un côté, la bande s'y estompe en douceur
          au lieu d'être tranchée net (V3.28). */}
      <div className={`${styles.liste} ${glisse?.actif ? styles.enGlisse : ''} ${pose ? styles.pose : ''} ${cache.droite ? styles.fonduD : ''} ${cache.gauche ? styles.fonduG : ''}`} ref={liste}>
        {fiches.map((f, j) => {
          const on = !!active && active.k === f.k && active.id === f.id;
          const tenu = !!glisse?.actif && glisse.de === j;
          return (
            <div key={`${f.k}:${f.id}`} data-cle={`${f.k}:${f.id}`} className={`${styles.fiche} ${on ? styles.on : ''} ${tenu ? styles.tenu : ''}`}
              style={place(j)} onPointerDown={e => debut(e, j)} onDragStart={e => e.preventDefault()}
              onContextMenu={e => { const pt = (e.nativeEvent as unknown as { pointerType?: string }).pointerType; if (glisse?.actif || (pt && pt !== 'mouse')) e.preventDefault(); }}>
              <button type="button" className={styles.ouvrir} onClick={() => { if (!apresGlisse.current) onOuvrir(f); }} aria-current={on ? 'page' : undefined}
                title={`${f.sous ? `${f.titre} · ${f.sous}` : f.titre}${onRanger && fiches.length > 1 ? ' — glisser pour ranger' : ''}`}>
                {f.k === 'contact'
                  ? <AvatarContact c={f.personne || { prenom: f.titre }} teinte={TEINTES[f.statut || 'actif'] || TEINTES.actif} taille={26} />
                  : f.k === 'carte'
                  ? <span className={`${styles.vignette} ${styles.vignetteCarte}`}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6l6-2.5 6 2.5 6-2.5v14.5l-6 2.5-6-2.5-6 2.5z" /><path d="M9 3.5v14.5" /><path d="M15 6v14.5" /></svg>
                    </span>
                  : <span className={styles.vignette}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {f.photo ? <img src={f.photo} alt="" draggable={false} /> : (
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
