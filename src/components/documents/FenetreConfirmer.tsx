'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Croix, Ic } from './ApercuActe';
import s from './Documents.module.css';

/* ═══ Avant un geste qui compte : ce qui va se passer, et la suite (V3.61) ═══
   Alexandre : « pour chaque chose que je veux faire, un petit message de
   rappel qui montre ce qui va être fait, ce que je dois faire ensuite, des
   recommandations, pour m'accompagner avant de valider ». Remplace les
   fenêtres grises du navigateur (confirm) pour : arrêter une signature,
   annuler ou marquer annulé un document, le repasser en brouillon pour le
   modifier, supprimer un brouillon, dupliquer un document en signature.

   Trois parties : « Ce qui va se passer » (la liste des effets, un picto
   chacun ; en rouge ce qui ne se rattrape pas), une case à cocher si le
   geste a une option (prévenir les signataires), « Et ensuite » (la suite
   conseillée), et un conseil en encadré (« tu veux seulement corriger ?
   n'annule pas »). Le bouton dit le geste ; « Ne rien faire » ferme.
   Au niveau du module (AGENTS.md §2.4). Posée sur <body> : l'écran qui
   l'ouvre peut être animé (transform). */

export type PointConfirmer = { ic: string; t: ReactNode; ton?: 'alerte' | 'ok' };

export default function FenetreConfirmer({ titre, intro, ic, points, option, ensuite, conseil, bouton, ton = 'navy', onFermer, onConfirmer }: {
  titre: string;
  intro?: string;
  ic: string;
  /* Ce qui va se passer ; peut dépendre de la case à cocher. */
  points: PointConfirmer[] | ((coche: boolean) => PointConfirmer[]);
  option?: { libelle: string; aide?: string; defaut: boolean };
  ensuite?: PointConfirmer[];
  conseil?: ReactNode;
  bouton: string;
  ton?: 'navy' | 'danger' | 'or';
  onFermer: () => void;
  /* Reçoit la case à cocher. La fenêtre reste ouverte pendant le travail. */
  onConfirmer: (coche: boolean) => void | Promise<void>;
}) {
  const [coche, setCoche] = useState(option?.defaut ?? false);
  const [travail, setTravail] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !travail) onFermer(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFermer, travail]);

  const liste = typeof points === 'function' ? points(coche) : points;
  const classeBouton = ton === 'danger' ? s.btnRouge : ton === 'or' ? s.btnOr : s.btnNavy;

  async function confirmer() {
    setTravail(true);
    try { await onConfirmer(coche); } finally { setTravail(false); }
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className={s.fenetre} onClick={e => { if (e.target === e.currentTarget && !travail) onFermer(); }}>
      <div className={`${s.fenetreIn} ${s.confIn}`} role="dialog" aria-modal="true" aria-label={titre}>
        <div className={s.fenTete}>
          <span className={s.confIc} data-ton={ton}><Ic n={ic} t={19} /></span>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h3>{titre}</h3>
            {intro && <p>{intro}</p>}
          </div>
          <button type="button" className={s.panFermer} aria-label="Fermer" disabled={travail} onClick={onFermer}><Croix /></button>
        </div>
        <div className={s.fenCorps}>
          <div className={s.confBloc}>
            <div className={s.confT}>Ce qui va se passer</div>
            <ul className={s.confListe}>
              {liste.map((p, i) => <li key={i} data-ton={p.ton}><Ic n={p.ic} t={15} /><span>{p.t}</span></li>)}
            </ul>
          </div>
          {option && (
            <label className={s.confOption}>
              <input type="checkbox" checked={coche} disabled={travail} onChange={e => setCoche(e.target.checked)} />
              <span><b>{option.libelle}</b>{option.aide && <small>{option.aide}</small>}</span>
            </label>
          )}
          {ensuite && ensuite.length > 0 && (
            <div className={s.confBloc} data-g="ensuite">
              <div className={s.confT}>Et ensuite</div>
              <ul className={s.confListe}>
                {ensuite.map((p, i) => <li key={i} data-ton={p.ton}><Ic n={p.ic} t={15} /><span>{p.t}</span></li>)}
              </ul>
            </div>
          )}
          {conseil && <div className={s.confConseil}><Ic n="etincelle" t={15} /><span>{conseil}</span></div>}
        </div>
        <div className={s.fenPied}>
          <button type="button" className={s.btn} disabled={travail} onClick={onFermer}>Ne rien faire</button>
          <button type="button" className={`${s.btn} ${classeBouton}`} disabled={travail} onClick={() => { void confirmer(); }}>
            {travail ? 'Un instant…' : bouton}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
