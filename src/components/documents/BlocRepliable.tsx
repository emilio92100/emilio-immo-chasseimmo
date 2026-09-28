'use client';
import { useId, useState, type ReactNode } from 'react';
import { Ic } from './ApercuActe';
import s from './Documents.module.css';

/* ═══ Un bloc qui se replie (V3.17) ═══════════════════════════════════════
   « Ses biens », « Ses documents » sur la fiche d'un client : replié, il ne
   montre que son titre, le nombre et un résumé en pastilles ; un clic le
   déplie. La flèche fait un petit signe à l'arrivée pour dire qu'on peut
   l'ouvrir. `action` : un bouton à droite (« + Nouveau document »), qui
   n'ouvre pas le bloc. */
export default function BlocRepliable({ ic, titre, n, resume, action, ouvertAuDebut = false, children }: {
  ic: string; titre: string; n?: number; resume?: ReactNode; action?: ReactNode; ouvertAuDebut?: boolean; children: ReactNode;
}) {
  const [ouvert, setOuvert] = useState(ouvertAuDebut);
  const id = useId();
  return (
    <section className={s.rpBloc} data-ouvert={ouvert ? 'oui' : 'non'}>
      <div className={s.rpTete}>
        <button type="button" className={s.rpBascule} aria-expanded={ouvert} aria-controls={id} onClick={() => setOuvert(o => !o)}
          title={ouvert ? 'Replier' : 'Déplier'}>
          <span className={s.rpIc}><Ic n={ic} t={15} /></span>
          <span className={s.rpTitre}>{titre}</span>
          {typeof n === 'number' && <span className={s.rpN}>{n}</span>}
          {resume && <span className={s.rpResume}>{resume}</span>}
          <span className={s.rpChevron} aria-hidden="true"><Ic n="bas" t={16} e={2.4} /></span>
        </button>
        {action}
      </div>
      <div id={id} className={s.rpCorps} inert={!ouvert}>
        <div className={s.rpCorpsIn}><div className={s.rpCorpsPad}>{children}</div></div>
      </div>
    </section>
  );
}
