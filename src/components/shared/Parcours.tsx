'use client';
/* ═══ Son parcours (V3.122) : l'étape des critères, et son bloc dans la fiche ═
   Les données et les listes : src/lib/parcours.ts. Maquette validée par
   Alexandre (8 octobre) : des pastilles toutes prêtes, chacune avec son
   icône, condensées ; « Autre chose » pour ajouter la sienne. */

import { useState } from 'react';
import {
  DEFAUTS_PARCOURS, DEPUIS_PARCOURS, ICONES_PARCOURS, PLU_PARCOURS, VISITES_PARCOURS,
  iconeDefaut, iconePlu, libDepuis, libVisites, parcoursVide, type Parcours,
} from '@/lib/parcours';
import p from './Parcours.module.css';

export function IcoP({ d, t = 14, e = 2.1 }: { d: string; t?: number; e?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={e} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      <path d={d} />
    </svg>
  );
}
const I = ICONES_PARCOURS;

/* « Autre chose » : la pastille pointillée qui s'ouvre en champ. */
function Autre({ ouvert, onOuvrir, onAjouter, exemple, label }: { ouvert: boolean; onOuvrir: () => void; onAjouter: (t: string) => void; exemple: string; label: string }) {
  const [t, setT] = useState('');
  const ajouter = () => { onAjouter(t.trim()); setT(''); };
  if (!ouvert) return <button type="button" className={p.autre} onClick={onOuvrir}><IcoP d={I.plus} t={13} e={2.6} />{'Autre chose'}</button>;
  return (
    <span className={p.autreChamp}>
      <input className={p.autreIn} value={t} autoFocus placeholder={exemple} aria-label={label}
        onChange={e => setT(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouter(); } if (e.key === 'Escape') { e.stopPropagation(); onAjouter(''); } }} />
      <button type="button" className={p.autreOk} onClick={ajouter}>{t.trim() ? 'Ajouter' : 'Fermer'}</button>
    </span>
  );
}

/* ── L'étape des critères ── */
export function EtapeParcours({ valeur, onChange }: { valeur?: Parcours; onChange: (x: Parcours) => void }) {
  const v = valeur || {};
  const [ouvert, setOuvert] = useState<'' | 'd' | 'p'>('');
  const maj = (m: Partial<Parcours>) => onChange({ ...v, ...m });
  const defauts = v.defauts || {};
  const plu = v.plu || [];
  /* Les pastilles ajoutées à la main viennent à la suite des toutes prêtes. */
  const listeD = [...DEFAUTS_PARCOURS.map(x => x.l), ...Object.keys(defauts).filter(l => !DEFAUTS_PARCOURS.some(x => x.l === l))];
  const listeP = [...PLU_PARCOURS.map(x => x.l), ...plu.filter(l => !PLU_PARCOURS.some(x => x.l === l))];
  const basculerD = (l: string) => {
    const d = { ...defauts };
    const n = ((d[l] || 0) + 1) % 3;
    if (n) d[l] = n as 1 | 2; else delete d[l];
    maj({ defauts: d });
  };
  const basculerP = (l: string) => maj({ plu: plu.includes(l) ? plu.filter(x => x !== l) : [...plu, l] });

  return (
    <div className={p.etape}>
      <span className={p.prive}><IcoP d={I.cadenas} t={12} e={2.5} />{'Visible de toi seul, jamais dans son espace'}</span>

      <div className={p.carte}>
        <div className={p.ligne}>
          <span className={p.lab}><IcoP d={I.calendrier} />{'Il cherche depuis'}</span>
          <div className={p.chips}>
            {DEPUIS_PARCOURS.map(([k, l]) => (
              <button key={k} type="button" className={`${p.ch} ${p.chT} ${v.depuis === k ? p.chOn : ''}`} aria-pressed={v.depuis === k}
                onClick={() => maj({ depuis: v.depuis === k ? undefined : k })}>{l}</button>
            ))}
          </div>
        </div>
        <div className={p.ligne}>
          <span className={p.lab}><IcoP d={I.cle} />{'Visites, environ'}</span>
          <div className={p.chips}>
            {VISITES_PARCOURS.map(([k, l]) => (
              <button key={k} type="button" className={`${p.ch} ${p.chT} ${v.visites === k ? p.chOn : ''}`} aria-pressed={v.visites === k}
                onClick={() => maj({ visites: v.visites === k ? undefined : k })}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className={p.carte}>
        <div className={p.tete}>
          <span className={`${p.lab} ${p.labBof}`}><IcoP d={I.bof} />{'Ce qui n’a pas convenu'}</span>
          <span className={p.legende}>{'1 appui : '}<b className={p.leg1}>{'une fois'}</b>{' · 2 : '}<b className={p.leg2}>{'revient souvent'}</b>{' · 3 : retiré'}</span>
        </div>
        <div className={p.chips}>
          {listeD.map(l => {
            const n = defauts[l] || 0;
            return (
              <button key={l} type="button" className={`${p.ch} ${n === 2 ? p.ch2 : n === 1 ? p.ch1 : ''}`} aria-pressed={n > 0}
                title={n === 2 ? 'Revient souvent — un appui de plus pour retirer' : n === 1 ? 'Une fois — un appui de plus : revient souvent' : 'Un appui : une fois'}
                onClick={() => basculerD(l)}>
                <IcoP d={iconeDefaut(l)} /><span>{l}</span>
                {n === 1 && <i className={p.tag1}>{'1×'}</i>}
                {n === 2 && <i className={p.tag2}>{'SOUVENT'}</i>}
              </button>
            );
          })}
          <Autre ouvert={ouvert === 'd'} onOuvrir={() => setOuvert('d')} exemple="Ex. : cuisine sur cour" label="Autre chose qui n’a pas convenu"
            onAjouter={t => { if (t) maj({ defauts: { ...defauts, [t.slice(0, 60)]: defauts[t] || 1 } }); setOuvert(''); }} />
        </div>
      </div>

      <div className={p.carte}>
        <span className={`${p.lab} ${p.labPlu}`}><IcoP d={I.coeur} />{'Ce qui lui a plu'}</span>
        <div className={p.chips}>
          {listeP.map(l => {
            const on = plu.includes(l);
            return (
              <button key={l} type="button" className={`${p.ch} ${on ? p.chP : ''}`} aria-pressed={on} onClick={() => basculerP(l)}>
                <IcoP d={iconePlu(l)} /><span>{l}</span>
              </button>
            );
          })}
          <Autre ouvert={ouvert === 'p'} onOuvrir={() => setOuvert('p')} exemple="Ex. : la cheminée" label="Autre chose qui lui a plu"
            onAjouter={t => { if (t && !plu.includes(t)) maj({ plu: [...plu, t.slice(0, 60)] }); setOuvert(''); }} />
        </div>
      </div>

      <div className={p.carte}>
        <label htmlFor="parcours-mots" className={p.lab}><IcoP d={I.bulle} />{'Ce qu’il raconte, en quelques mots'}</label>
        <textarea id="parcours-mots" className={p.zone} rows={2} value={v.note || ''}
          placeholder="Ex. : une dizaine de visites à Boulogne, toujours déçue par la lumière…"
          onChange={e => maj({ note: e.target.value })} />
      </div>
    </div>
  );
}

/* ── Le bloc de « Sa recherche » ── */
export function BlocParcours({ parcours, onModifier }: { parcours: Parcours; onModifier: () => void }) {
  if (parcoursVide(parcours)) {
    return (
      <div className={p.blocVide}>
        <span className={p.blocVideIc}><IcoP d={I.boussole} t={17} e={2} /></span>
        <span className={p.blocVideTx}>
          <b>{'Son parcours'}</b>
          <small>{'Pas encore noté : depuis quand il cherche, ce qui n’a pas convenu sur ses dernières visites, ce qui lui a plu.'}</small>
        </span>
        <button type="button" className={p.blocBtn} onClick={onModifier}>{'Le remplir'}</button>
      </div>
    );
  }
  const souvent = Object.entries(parcours.defauts || {}).filter(([, n]) => n === 2).map(([l]) => l);
  const unefois = Object.entries(parcours.defauts || {}).filter(([, n]) => n === 1).map(([l]) => l);
  const plu = parcours.plu || [];
  const stats = !!(parcours.depuis || parcours.visites);
  const rangee = (lib: string, ic: string, ton: string, l: string[], ico: (x: string) => string, cls: string) => (
    <div className={p.rangee}>
      <span className={`${p.rangeeT} ${ton}`}><IcoP d={ic} />{lib}</span>
      <div className={p.chips}>
        {l.map(x => <span key={x} className={`${p.pill} ${cls}`}><IcoP d={ico(x)} t={13} />{x}</span>)}
      </div>
    </div>
  );
  return (
    <div className={p.bloc}>
      <div className={p.blocTete}>
        <IcoP d={I.boussole} t={16} e={2.1} />
        <span className={p.blocTitre}>{'SON PARCOURS'}</span>
        <span className={p.blocPrive}><IcoP d={I.cadenas} t={11} e={2.6} />{'Visible de toi seul'}</span>
        <button type="button" className={p.blocModif} onClick={onModifier}>{'Modifier'}</button>
      </div>
      <div className={`${p.blocCorps} ${stats ? '' : p.blocCorpsSeul}`}>
        {stats && (
          <div className={p.stats}>
            {parcours.depuis && <div className={p.stat}><small>{'Cherche depuis'}</small><b>{libDepuis(parcours.depuis)}</b></div>}
            {parcours.visites && <div className={p.stat}><small>{'Visites déjà faites'}</small><b>{libVisites(parcours.visites)}</b></div>}
          </div>
        )}
        <div className={p.rangees}>
          {souvent.length > 0 && rangee('Revient souvent', I.souvent, p.tonSouvent, souvent, iconeDefaut, p.pill2)}
          {unefois.length > 0 && rangee('N’a pas convenu', I.bof, p.tonBof, unefois, iconeDefaut, p.pill1)}
          {plu.length > 0 && rangee('Lui a plu', I.coeur, p.tonPlu, plu, iconePlu, p.pillP)}
          {parcours.note && <div className={p.note}>{`« ${parcours.note} »`}</div>}
        </div>
      </div>
    </div>
  );
}
