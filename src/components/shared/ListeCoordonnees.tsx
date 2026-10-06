'use client';

/* ═══ Tous les numéros, tous les e-mails d'un contact (V3.89) ════════════
   Alexandre : « sur un client je vois trois numéros, et quand je fais
   Modifier le contact, je n'en vois que deux. »

   L'import ImmoFacile garde tous les numéros et tous les e-mails d'un
   contact (jusqu'à quatre). Les formulaires n'avaient que deux cases : le
   troisième ne se voyait pas, et « Enregistrer » l'effaçait.

   Ici, une ligne par numéro (ou par e-mail), autant qu'il en faut :
   · « + Ajouter un numéro » ouvre une ligne vide, le curseur dedans ;
   · la croix retire une ligne (il en reste toujours une, vide au besoin) ;
   · l'étoile fait passer un numéro en premier : le premier est le
     principal (c'est lui qui part dans les mails, les actes, l'espace).

   `nettoyer` rend la liste à enregistrer : sans les vides, sans les
   doublons, dans l'ordre affiché. */

import { useEffect, useId, useRef } from 'react';
import { Ic } from '@/components/documents/ApercuActe';
import s from './ListeCoordonnees.module.css';

export type GenreCoord = 'tel' | 'mail';

/* La liste à montrer dans le formulaire : tout ce que la fiche a, ou une
   ligne vide. */
export function lignesDe(valeurs?: (string | null)[] | null): string[] {
  const l = (valeurs || []).filter((x): x is string => !!x && !!x.trim());
  return l.length ? l : [''];
}

/* La liste à enregistrer. Un e-mail s'écrit en minuscules. */
export function nettoyer(lignes: string[], genre: GenreCoord): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const brut of lignes) {
    const v = genre === 'mail' ? brut.trim().toLowerCase() : brut.trim();
    if (!v) continue;
    const cle = genre === 'mail' ? v : v.replace(/[^\d+]/g, '');
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push(v);
  }
  return out;
}

export function ListeCoordonnees({ genre, valeurs, onChange, etiquette, classeBloc, classeEtiquette, classeChamp }: {
  genre: GenreCoord;
  valeurs: string[];
  onChange: (v: string[]) => void;
  etiquette: string;
  classeBloc?: string;
  classeEtiquette?: string;
  /* La classe des champs du formulaire qui l'accueille, pour lui ressembler. */
  classeChamp?: string;
}) {
  const id = useId();
  const liste = valeurs.length ? valeurs : [''];
  const plusieurs = liste.length > 1;
  const ce = genre === 'tel' ? 'ce numéro' : 'cet e-mail';
  const le = genre === 'tel' ? 'le numéro' : 'l’e-mail';

  /* Une ligne ajoutée : le curseur y va. */
  const boite = useRef<HTMLUListElement>(null);
  const avant = useRef(liste.length);
  const ajoutee = useRef(false);
  useEffect(() => {
    if (ajoutee.current && liste.length > avant.current) {
      const champs = boite.current?.querySelectorAll('input');
      champs?.[champs.length - 1]?.focus();
    }
    ajoutee.current = false;
    avant.current = liste.length;
  }, [liste.length]);

  const maj = (i: number, v: string) => onChange(liste.map((x, j) => (j === i ? v : x)));
  const retirer = (i: number) => { const r = liste.filter((_, j) => j !== i); onChange(r.length ? r : ['']); };
  const enPremier = (i: number) => onChange([liste[i], ...liste.filter((_, j) => j !== i)]);
  const ajouter = () => { ajoutee.current = true; onChange([...liste, '']); };
  const derniereVide = !liste[liste.length - 1].trim();

  return (
    <div className={`${s.bloc} ${classeBloc || ''}`} role="group" aria-labelledby={`${id}-t`}>
      <span id={`${id}-t`} className={`${s.titre} ${classeEtiquette || ''}`}>{etiquette}</span>
      <ul className={s.liste} ref={boite}>
        {liste.map((v, i) => (
          <li key={i} className={s.ligne}>
            <span className={s.champ}>
              <input className={`${s.in} ${classeChamp || ''}`} type={genre === 'mail' ? 'email' : 'tel'} value={v}
                aria-label={i === 0 ? `${etiquette} : principal` : `${etiquette} : ${i + 1}e`}
                inputMode={genre === 'tel' ? 'tel' : 'email'} autoComplete="off"
                placeholder={i === 0 ? (genre === 'tel' ? 'Numéro' : 'Adresse e-mail') : (genre === 'tel' ? 'Autre numéro' : 'Autre adresse')}
                style={plusieurs && i === 0 ? { paddingRight: 82 } : undefined}
                onChange={e => maj(i, e.target.value)} />
              {plusieurs && i === 0 && <span className={s.principal}>Principal</span>}
            </span>
            {/* La place de l'étoile, pour que les champs s'alignent. */}
            {plusieurs && i === 0 && <span className={s.bouton} aria-hidden="true" />}
            {plusieurs && i > 0 && (
              <button type="button" className={s.bouton} title={`En faire ${le} principal`} aria-label={`En faire ${le} principal`} onClick={() => enPremier(i)}>
                <Ic n="etoile" t={15} e={2} />
              </button>
            )}
            {(plusieurs || !!v) && (
              <button type="button" className={`${s.bouton} ${s.retirer}`} title={`Retirer ${ce}`} aria-label={`Retirer ${ce}`} onClick={() => retirer(i)}>
                <Ic n="croix" t={14} e={2.3} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!derniereVide && (
        <button type="button" className={s.ajouter} onClick={ajouter}>
          <Ic n="plus" t={14} e={2.4} /><span>{genre === 'tel' ? 'Ajouter un numéro' : 'Ajouter un e-mail'}</span>
        </button>
      )}
    </div>
  );
}
