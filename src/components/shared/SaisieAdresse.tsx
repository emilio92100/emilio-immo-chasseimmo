'use client';
/* ═══ Une adresse proposée pendant la frappe (V3.174) ═══════════════════════
   La base adresse nationale (data.geopf.fr), comme pour les biens et les
   contacts : on tape le début, on choisit dans la liste, et « rue, code
   postal ville » s'écrit d'un coup, sans faute. Une ville seule (on a tapé
   un code postal) donne « code postal ville ». Partagé par l'étude d'un
   notaire (« Nouveau notaire », « Son étude »), l'agence d'un confrère,
   l'immeuble d'un gardien. Au niveau du module (AGENTS.md §2.4). */
import { useEffect, useRef, useState } from 'react';
import { Ic } from '@/components/documents/ApercuActe';
import s from './SaisieAdresse.module.css';

export type AdresseChoisie = { label?: string; name?: string; postcode?: string; city?: string; type?: string };
type Proposee = { properties?: AdresseChoisie };
export function adresseProposee(p: NonNullable<Proposee['properties']>): string {
  const ville = [p.postcode, p.city].filter(Boolean).join(' ');
  if (p.type === 'municipality') return ville || p.label || '';
  return [p.name || p.label || '', ville].filter(Boolean).join(', ');
}

export default function SaisieAdresse({ v, onChange, onChoisir, classeChamp, placeholder = 'Tape le début : 12 rue de Silly…', etiquette, id, off }: {
  v: string; onChange: (x: string) => void;
  /* V3.175 : une adresse en plusieurs cases (la rue, le code postal, la
     ville — les documents juridiques) : la proposition choisie, à ranger. */
  onChoisir?: (p: AdresseChoisie) => void;
  /* La classe des champs du formulaire qui l'accueille, pour lui ressembler. */
  classeChamp?: string; placeholder?: string; etiquette?: string; id?: string; off?: boolean;
}) {
  const [sug, setSug] = useState<Proposee[]>([]);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const derniere = useRef('');
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);
  const taper = (x: string) => {
    onChange(x);
    derniere.current = x;
    if (minuterie.current) clearTimeout(minuterie.current);
    if (x.trim().length < 4) { setSug([]); return; }
    minuterie.current = setTimeout(async () => {
      try {
        const r = await fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(x)}&limit=5&autocomplete=1`);
        const j = await r.json();
        if (derniere.current === x) setSug(Array.isArray(j.features) ? j.features : []);
      } catch { setSug([]); }
    }, 250);
  };
  const choisir = (f: Proposee) => {
    if (onChoisir) onChoisir(f.properties || {});
    else onChange(adresseProposee(f.properties || {}));
    derniere.current = '';
    setSug([]);
  };
  return (
    <div className={s.adr}>
      <input id={id} className={classeChamp} value={v} autoComplete="off" placeholder={placeholder} aria-label={etiquette} disabled={off}
        onChange={e => taper(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setSug([]); }} onBlur={() => setTimeout(() => setSug([]), 180)} />
      {sug.length > 0 && (
        <ul className={s.sug} role="listbox" aria-label="Adresses proposées">
          {sug.map((f, i) => {
            const p = f.properties || {};
            return (
              <li key={i}>
                <button type="button" role="option" aria-selected={false} onMouseDown={e => e.preventDefault()} onClick={() => choisir(f)}>
                  <Ic n="lieu" t={15} />
                  <span><b>{p.name || p.label}</b><small>{[p.postcode, p.city].filter(Boolean).join(' ')}</small></span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
