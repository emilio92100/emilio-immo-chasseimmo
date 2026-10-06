'use client';

/* ═══ Clore la relance en attente, en notant une action (V3.83) ═════════════
   Alexandre : « si, depuis la fiche, je note un appel avec la prochaine
   relance dans cinq jours, est-ce que la relance indiquée dans l'onglet
   Relances disparaît ? Il faut que ça communique. »

   Avant, non : « Traiter » (page Relances) clôturait la relance, mais une
   action notée depuis la fiche en créait une nouvelle et laissait l'ancienne
   en attente. Cette case la propose : les relances de ce contact encore en
   attente, cochées d'office quand elles sont dues (aujourd'hui ou en retard)
   ou quand la fiche a été ouverte depuis elle. Une relance à venir reste
   décochée : l'appel d'aujourd'hui ne la règle pas forcément. Rien ne se
   ferme avant « Ajouter au journal », et seulement si l'action est notée. */

import { Ic } from '@/components/documents/ApercuActe';
import s from './CloreRelances.module.css';

export type RelanceAttente = { id: string; date_echeance: string; note: string | null };

/* L'écart en jours avec aujourd'hui : négatif = en retard. */
export function ecartJours(iso: string): number {
  const auj = new Date(); auj.setHours(12, 0, 0, 0);
  const d = new Date(iso); d.setHours(12, 0, 0, 0);
  return Math.round((d.getTime() - auj.getTime()) / 86400000);
}

/* Cochées d'office : celles qui sont dues, et celle d'où l'on vient. */
export function relancesACocher(liste: RelanceAttente[], visee?: string | null): string[] {
  return liste.filter(r => ecartJours(r.date_echeance) <= 0 || r.id === visee).map(r => r.id);
}

function quand(j: number): { lib: string; ton: 'retard' | 'jour' | 'avenir' } {
  if (j < 0) return { lib: `En retard de ${-j} j`, ton: 'retard' };
  if (j === 0) return { lib: 'Aujourd’hui', ton: 'jour' };
  if (j === 1) return { lib: 'Demain', ton: 'avenir' };
  return { lib: `Dans ${j} j`, ton: 'avenir' };
}

export default function CloreRelances({ relances, cochees, onChange, nouvelle = false }: {
  relances: RelanceAttente[];
  cochees: string[];
  onChange: (ids: string[]) => void;
  /* Une prochaine relance est choisie plus bas : la phrase le dit. */
  nouvelle?: boolean;
}) {
  if (!relances.length) return null;
  const n = cochees.filter(id => relances.some(r => r.id === id)).length;
  const plusieurs = relances.length > 1;
  const pied = n === 0
    ? (plusieurs
      ? `Elles restent dans « Relances », à leur date${nouvelle ? ', en plus de la nouvelle' : ''}.`
      : `Elle reste dans « Relances », à sa date${nouvelle ? ', en plus de la nouvelle' : ''}.`)
    : n === 1
      ? (plusieurs ? 'La relance cochée sort de « Relances » dès que l’action est ajoutée.' : 'Elle sort de « Relances » dès que l’action est ajoutée.')
      : `Les ${n} relances cochées sortent de « Relances » dès que l’action est ajoutée.`;

  return (
    <div className={s.bloc} data-coche={n > 0 ? 'oui' : 'non'}>
      <span className={s.tete}><Ic n="alarme" t={14} />{plusieurs ? `${relances.length} relances en attente` : 'Relance en attente'}</span>
      <div className={s.liste}>
        {relances.map(r => {
          const on = cochees.includes(r.id);
          const q = quand(ecartJours(r.date_echeance));
          const date = new Date(r.date_echeance).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
          return (
            <button key={r.id} type="button" role="checkbox" aria-checked={on} className={s.ligne} data-on={on ? 'oui' : 'non'}
              onClick={() => onChange(on ? cochees.filter(x => x !== r.id) : [...cochees, r.id])}>
              <span className={s.case} aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <span className={s.texte}>
                <span className={s.l1}>
                  <b>{`Clore la relance du ${date}`}</b>
                  <em className={s.quand} data-ton={q.ton}>{q.lib}</em>
                </span>
                {r.note && <span className={s.note}>{r.note}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <span key={`${n}-${nouvelle}`} className={s.pied}>{pied}</span>
    </div>
  );
}
