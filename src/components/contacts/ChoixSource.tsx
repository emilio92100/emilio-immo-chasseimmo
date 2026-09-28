'use client';
import { useId } from 'react';
import { FAMILLES_SOURCE, PLATEFORMES, SOURCES, sourceDe } from '@/lib/sources';
import { Ic } from '@/components/documents/ApercuActe';
import c from './Contacts.module.css';

/* ═══ « D'où vient ce contact ? » ════════════════════════════════════════
   Les sources rangées par famille, un clic pour choisir (un second pour
   enlever). Facultatif : rien de choisi, rien d'enregistré. Recommandation
   demande par qui (les noms des contacts sont proposés), Plateforme
   laquelle, Autre de préciser. Utilisé à la création d'un contact et dans
   « Modifier » de sa fiche. Voir src/lib/sources.ts. */

export default function ChoixSource({ source, detail, onChange, noms = [] }: {
  source: string; detail: string; onChange: (source: string, detail: string) => void; noms?: string[];
}) {
  const liste = useId();
  const s = sourceDe(source);
  return (
    <div className={c.src}>
      <div className={c.srcGrille}>
        {FAMILLES_SOURCE.map(f => (
          <div key={f.k} className={c.srcFam}>
            {f.lib ? <span className={c.srcFamT}>{f.lib}</span> : <span className={c.srcFamT} aria-hidden="true" />}
            <div className={c.srcChips}>
              {SOURCES.filter(x => x.famille === f.k).map(x => {
                const on = x.k === source;
                return (
                  <button key={x.k} type="button" className={`${c.srcChip} ${on ? c.srcChipOn : ''}`} aria-pressed={on}
                    onClick={() => onChange(on ? '' : x.k, '')}>
                    <span className={c.srcIc}><Ic n={on ? 'check' : x.ic} t={14} e={on ? 2.8 : 2} /></span>
                    {x.lib}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {s?.detail && (
        <div className={c.srcDetail}>
          <label className={c.ch} style={{ flex: '1 1 260px' }}>
            <span>{s.question}<em className={c.facult}>{' · facultatif'}</em></span>
            {s.detail === 'plateforme' && (
              <span className={c.pills} style={{ marginBottom: 4 }}>
                {PLATEFORMES.map(p => (
                  <button key={p} type="button" className={`${c.pill} ${detail === p ? c.pillOn : ''}`} onClick={() => onChange(source, detail === p ? '' : p)}>{p}</button>
                ))}
              </span>
            )}
            <input className={c.in} value={detail} onChange={e => onChange(source, e.target.value)}
              list={s.detail === 'contact' ? liste : undefined} autoComplete="off" />
            {s.detail === 'contact' && (
              <datalist id={liste}>{noms.slice(0, 400).map(n => <option key={n} value={n} />)}</datalist>
            )}
          </label>
          {s.detail === 'contact' && <span className={c.pied} style={{ flex: '1 1 200px' }}>Tapez un nom : vos contacts sont proposés. Un nom qui n’y est pas s’écrit tel quel.</span>}
        </div>
      )}
    </div>
  );
}
