'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './EnteteRubrique.module.css';

/* L'en-tête d'une rubrique (Visites, Mes clients) : le titre et ses chiffres
   dans un seul bloc. Les chiffres sont des filtres — on clique sur « À venir »,
   la liste en dessous ne montre plus que les visites à venir.

   Il remplace trois choses qui se répétaient : le titre posé seul, la ligne
   grise « 8 clients · 5 actifs · 2 prospects », et les pastilles de filtre
   avec leur petit compteur. Un chiffre, un seul endroit.

   Sur ordinateur : un bandeau bleu compact, aux couleurs de la fiche client,
   les chiffres en pastilles sur une ligne, le filtre en cours en blanc — il
   se détache de la liste claire sans prendre de place. Sur téléphone : une carte blanche compacte, la
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
  /* « Tous », en tête de rangée (V3.24) : sa petite icône dorée, un trait
     qui la sépare des catégories. */
  tete?: boolean;
  ic?: ReactNode;
  /* V3.77 : la première du groupe de fin (« Tri à faire », « Tous »,
     « Archivés »), poussé tout à droite sur ordinateur. */
  fin?: boolean;
  /* V3.77 : « Archivés », d'un autre style que les catégories (bord en
     pointillés, sa boîte d'archives). */
  archive?: boolean;
  /* V3.78 : rangée dans le menu « Autres types ▾ » plutôt que sur la ligne
     (Alexandre : « une petite flèche, on clique et on choisit les autres
     types : gardien, notaire, partenaire… ; on ne met pas tout sur la même
     ligne »). Le bouton se place juste avant le groupe de fin. */
  menu?: boolean;
};

/* V3.136 : Ctrl + clic (⌘ sur Mac, ou Maj) ajoute une tuile à celles déjà
   allumées, là où les tuiles se cumulent (Contacts). Un clic simple va sur
   la tuile seule. */
const ajoute = (e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => e.ctrlKey || e.metaKey || e.shiftKey;

/* ── « Autres types ▾ » : les tuiles `menu`, dans une liste qui s'ouvre.
   Posée sur la page (portail, position fixe) : la rangée défile au doigt sur
   téléphone et couperait une liste ouverte à l'intérieur. ── */
function MenuAutres({ tuiles, actif, onChoisir, lib }: { tuiles: Tuile[]; actif: string | string[]; onChoisir: (cle: string, ajouter?: boolean) => void; lib: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const bouton = useRef<HTMLButtonElement | null>(null);
  const liste = useRef<HTMLDivElement | null>(null);
  const estOn = (k: string) => (Array.isArray(actif) ? actif.includes(k) : k === actif);
  const allumees = tuiles.filter(t => estOn(t.cle));
  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: Event) => {
      const t = e.target as Node | null;
      if (t && (bouton.current?.contains(t) || liste.current?.contains(t))) return;
      setOuvert(false);
    };
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    /* La page défile ou change de taille : la liste fermée plutôt que
       décollée de son bouton. */
    const bouge = (e: Event) => {
      if (e.target instanceof Node && liste.current?.contains(e.target)) return;
      setOuvert(false);
    };
    document.addEventListener('mousedown', fermer);
    document.addEventListener('touchstart', fermer);
    document.addEventListener('keydown', touche);
    window.addEventListener('resize', bouge);
    window.addEventListener('scroll', bouge, true);
    return () => {
      document.removeEventListener('mousedown', fermer);
      document.removeEventListener('touchstart', fermer);
      document.removeEventListener('keydown', touche);
      window.removeEventListener('resize', bouge);
      window.removeEventListener('scroll', bouge, true);
    };
  }, [ouvert]);
  function basculer() {
    if (ouvert) { setOuvert(false); return; }
    const r = bouton.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 268)) });
    setOuvert(true);
  }
  const un = allumees.length === 1 ? allumees[0] : null;
  return (
    <>
      <button ref={bouton} type="button" aria-haspopup="true" aria-expanded={ouvert} aria-pressed={allumees.length > 0} onClick={basculer}
        className={`${styles.tuile} ${styles.autres} ligne-entre ${allumees.length ? styles.on : ''}`}>
        {un && <span className={styles.n}>{un.n}</span>}
        <span className={styles.lib}>
          {un?.couleur && <span className={styles.point} style={{ background: un.couleur }} />}
          <span>{un ? un.lib : allumees.length > 1 ? `${lib} · ${allumees.length}` : lib}</span>
          <svg className={styles.chevron} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ transform: ouvert ? 'rotate(180deg)' : undefined }}><path d="m6 9.5 6 6 6-6" /></svg>
        </span>
      </button>
      {ouvert && pos && typeof document !== 'undefined' && createPortal(
        <div ref={liste} className={styles.menu} role="menu" style={{ top: pos.top, left: pos.left }}>
          {tuiles.map(t => {
            const on = estOn(t.cle);
            return (
              <button key={t.cle} type="button" role="menuitemcheckbox" aria-checked={on} className={`${styles.menuL} ${on ? styles.menuOn : ''}`}
                onClick={e => { onChoisir(t.cle, ajoute(e)); setOuvert(false); }}>
                <span className={styles.menuPoint} style={{ background: t.couleur || '#cbd5e1' }} />
                <span className={styles.menuLib}>{t.lib}</span>
                <span className={styles.menuN}>{t.n}</span>
                <span className={styles.menuCoche} aria-hidden="true">
                  {on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 12.5 5 5 10-11" /></svg>}
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

export default function EnteteRubrique({
  titre, icone, phrase, phraseOrdi = false, recherche, bouton, bouton2, tuiles, actif, onChoisir, label, libMenu = 'Autres types', defiler = true, aCheval = false, arrondi = false,
}: {
  titre: string;
  icone: ReactNode;
  /* V3.160 : au téléphone, le bloc garde ses coins arrondis, à 10 px des
     bords, au lieu d'aller d'un bord à l'autre (Contacts). */
  arrondi?: boolean;
  phrase?: string;
  /* V3.136 : une phrase qui ne vaut que sur ordinateur (« Ctrl + clic… »),
     cachée au téléphone. */
  phraseOrdi?: boolean;
  recherche?: { valeur: string; onChange: (v: string) => void; placeholder: string; label: string };
  /* V3.146 (Visites, « Organiser une visite » — Alexandre : « un joli bouton
     qui flotte un peu ») : `vedette`, le geste principal de la page, doré,
     qui flotte doucement ; `ic` remplace le « + ». */
  bouton?: { lib: string; onClick: () => void; ic?: ReactNode; vedette?: boolean };
  /* Un second bouton, plus discret, avant le premier (V3.61 : « Importer
     depuis ImmoFacile »). `court` : son libellé sur téléphone. */
  bouton2?: { lib: string; court?: string; ic?: ReactNode; onClick: () => void };
  tuiles: Tuile[];
  /* Une tuile allumée, ou plusieurs quand elles se cumulent (Contacts). */
  actif: string | string[];
  /* `ajouter` : Ctrl, ⌘ ou Maj tenu pendant le clic (V3.136). */
  onChoisir: (cle: string, ajouter?: boolean) => void;
  label: string;
  /* Le nom du bouton qui ouvre les tuiles `menu` (V3.80 : « Autres étapes »
     dans Biens). */
  libMenu?: string;
  /* Au téléphone, amener la tuile allumée en vue (V3.77). Relances (V3.82)
     s'en passe : « Tout » est au bout, et les tuiles qui pressent (en retard,
     aujourd'hui) doivent rester visibles à l'arrivée. */
  defiler?: boolean;
  /* V3.131 (Alexandre, dans Biens : « que ça chevauche un peu la partie
     bleue… pour faire plus joli », comme les onglets de la fiche d'un bien) :
     sur ordinateur, les tuiles passent dans une barre blanche posée à cheval
     sur le bas du bandeau. Au téléphone, rien ne change. */
  aCheval?: boolean;
}) {
  /* V3.77 : sur téléphone, la rangée défile au doigt ; la tuile allumée
     (« Tous » est maintenant en fin de rangée) vient se montrer. */
  const rangee = useRef<HTMLDivElement | null>(null);
  const cleActive = Array.isArray(actif) ? actif.join('+') : actif;
  useEffect(() => {
    const r = rangee.current;
    if (!defiler || !r || r.scrollWidth <= r.clientWidth + 2) return;
    const on = r.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!on) return;
    const g = on.offsetLeft - r.offsetLeft, d = g + on.offsetWidth;
    /* 36 px : la tuile reste hors du fondu du bord (V3.152, Defilement.tsx). */
    if (g < r.scrollLeft || d > r.scrollLeft + r.clientWidth) r.scrollLeft = Math.max(0, d - r.clientWidth + 36);
  }, [cleActive, tuiles.length, defiler]);

  /* V3.132 (Alexandre : « quand on va sur diffusion en cours, ça ne fait pas
     un slide joli avec une transition entre chaque onglet ; c'est brut ») :
     dans la barre à cheval, la pastille bleue glisse d'une tuile à l'autre,
     comme celle des onglets de la fiche d'un bien. Elle se recale si une
     tuile change de largeur (un nombre qui arrive, « Autres étapes » qui
     prend le nom de l'étape choisie). Au premier affichage, elle se pose
     sans glisser. */
  const [glisse, setGlisse] = useState<{ x: number; y: number; l: number; h: number } | null>(null);
  const [anime, setAnime] = useState(false);
  const cleTuiles = tuiles.map(t => `${t.cle}:${t.n}`).join('|');
  /* V3.136 (Alexandre, sur Contacts : « la partie bleue ne se met pas sur
     vendeur ») : la pastille ne sait se poser que sur une tuile. Quand
     plusieurs sont allumées (Ctrl + clic), elle s'efface et chacune reprend
     son propre fond bleu — avant, la seconde restait blanche, son nom écrit
     en blanc : on ne voyait plus que « 162 • ». */
  const plusieurs = Array.isArray(actif) && tuiles.filter(t => actif.includes(t.cle)).length > 1;
  useLayoutEffect(() => {
    const r = rangee.current;
    if (!aCheval || !r || plusieurs) return;
    /* La position ne change que si elle a bougé : un `setGlisse` à
       l'identique redessinait l'en-tête pour rien à chaque mesure. */
    const caler = () => {
      const on = r.querySelector<HTMLElement>('button[aria-pressed="true"]');
      const g = on ? { x: on.offsetLeft, y: on.offsetTop, l: on.offsetWidth, h: on.offsetHeight } : null;
      setGlisse(v => (v && g && v.x === g.x && v.y === g.y && v.l === g.l && v.h === g.h ? v : g));
    };
    caler();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(caler) : null;
    if (ro) { ro.observe(r); r.querySelectorAll('button').forEach(b => ro.observe(b)); }
    return () => ro?.disconnect();
  }, [aCheval, cleActive, cleTuiles, plusieurs]);
  useEffect(() => {
    if (!glisse || anime) return;
    const id = requestAnimationFrame(() => setAnime(true));
    return () => cancelAnimationFrame(id);
  }, [glisse, anime]);
  return (
    <section className={`${styles.bloc} ${aCheval && tuiles.length > 0 ? styles.cheval : ''} ${arrondi ? styles.arrondi : ''}`}>
      {aCheval && tuiles.length > 0 && <span className={styles.lueurs} aria-hidden="true" />}
      <div className={styles.haut}>
        <div className={styles.titreZone}>
          <span className={styles.icone} aria-hidden="true">{icone}</span>
          <div className={styles.titreTextes}>
            <h1 className={styles.titre}>{titre}</h1>
            {phrase && <p className={`${styles.phrase} ${phraseOrdi ? styles.phraseOrdi : ''}`}>{phrase}</p>}
          </div>
        </div>
        {(recherche || bouton || bouton2) && (
          <div className={styles.outils}>
            {recherche && (
              <label className={styles.recherche}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7" /><path d="m20.5 20.5-4.7-4.7" /></svg>
                <input value={recherche.valeur} onChange={e => recherche.onChange(e.target.value)}
                  placeholder={recherche.placeholder} aria-label={recherche.label} />
              </label>
            )}
            {bouton2 && (
              <button type="button" className={styles.bouton2} onClick={bouton2.onClick} title={bouton2.lib}>
                {bouton2.ic}
                <span className={bouton2.court ? styles.long : undefined}>{bouton2.lib}</span>
                {bouton2.court && <span className={styles.court}>{bouton2.court}</span>}
              </button>
            )}
            {bouton && (
              <button type="button" className={`${styles.bouton} ${bouton.vedette ? styles.vedette : ''}`} onClick={bouton.onClick}>
                {bouton.ic
                  ? <span className={styles.boutonIc} aria-hidden="true">{bouton.ic}</span>
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>}
                <span>{bouton.lib}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {tuiles.length > 0 && <div ref={rangee} className={`${styles.rangee} ${plusieurs ? styles.plusieurs : ''}`} role="group" aria-label={label} data-defile="fondu">
        {aCheval && glisse && !plusieurs && (
          <span className={`${styles.glisse} ${anime ? styles.glisseAnime : ''}`} aria-hidden="true"
            style={{ transform: `translate(${glisse.x}px, ${glisse.y}px)`, width: glisse.l, height: glisse.h }} />
        )}
        {(() => {
          /* V3.78 : les tuiles `menu` sortent de la ligne ; « Autres types ▾ »
             prend leur place, juste avant le groupe de fin. */
          const dansMenu = tuiles.filter(t => t.menu);
          const ligne = tuiles.filter(t => !t.menu);
          const iFin = ligne.findIndex(t => t.fin);
          const avant = iFin < 0 ? ligne : ligne.slice(0, iFin);
          const apres = iFin < 0 ? [] : ligne.slice(iFin);
          const tuile = (t: Tuile, i: number) => {
          const on = Array.isArray(actif) ? actif.includes(t.cle) : t.cle === actif;
          const vide = t.n === 0 && !on;
          const alerte = !!t.alerte && t.n > 0 && !on;
          return (
            /* Une tuile qui apparaît (la liste vient d'être lue) arrive en
               douceur, à la suite des autres (V3.25). */
            <button key={t.cle} type="button" aria-pressed={on} onClick={e => onChoisir(t.cle, ajoute(e))}
              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              className={`${styles.tuile} ligne-entre ${on ? styles.on : ''} ${vide ? styles.vide : ''} ${alerte ? styles.alerte : ''} ${t.tete ? styles.tete : ''} ${t.fin ? styles.fin : ''} ${t.archive ? styles.arch : ''}`}>
              {t.tete && t.ic && <span className={styles.teteIc} aria-hidden="true">{t.ic}</span>}
              {t.archive && (
                <span className={styles.archIc} aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 4.5h17v4h-17z" /><path d="M5 8.5v10.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5" /><path d="M10 12.5h4" /></svg>
                </span>
              )}
              <span className={styles.n}>{t.n}</span>
              <span className={styles.lib}>
                {t.couleur && <span className={styles.point} style={{ background: t.couleur }} />}
                <span>{t.lib}</span>
              </span>
            </button>
          );
          };
          return (
            <>
              {avant.map(tuile)}
              {dansMenu.length > 0 && <MenuAutres tuiles={dansMenu} actif={actif} onChoisir={onChoisir} lib={libMenu} />}
              {apres.map((t, i) => tuile(t, avant.length + 1 + i))}
            </>
          );
        })()}
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
