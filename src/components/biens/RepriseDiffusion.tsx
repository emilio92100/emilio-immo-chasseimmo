'use client';
import { useState } from 'react';
import { Ic } from '@/components/documents/ApercuActe';
import { etatDiffusion } from '@/lib/diffusion';
import type { BienVente } from '@/lib/biens-vente';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';

/* ═══ Reprendre d'ImmoFacile la diffusion des biens (V3.92) ════════════════
   Un bandeau de la liste des biens, tant que des biens en vente sont « À
   régler » (lib/diffusion.ts). Un clic lit le flux d'ImmoFacile et règle
   d'un coup ce qui y est déjà (/api/diffusion/reprise) : le numéro de chaque
   bien (l'adresse de sa page sur le site), sa position, et sa diffusion —
   le site, Jinka et SeLoger pour les biens que Jinka connaît. Belles
   Demeures reste à cocher sur chaque bien concerné.

   V3.94 : la reprise corrige aussi un mauvais lien (un numéro ImmoFacile
   posé sur un bien qui ne ressemble pas à l'annonce) et le dit. Le bandeau
   revient avec ?page=biens&reprise=1, même quand plus rien n'est à régler :
   pour relancer la reprise après avoir corrigé une fiche. */

type Resultat = {
  ok: boolean; erreur?: string; lus?: number;
  relies?: { id: string; reference: string | null; titre: string | null; numero: string; par: string; ecrit: string[] }[];
  seules?: { numero: string; titre: string; prix: number | null; cp: string; ville: string }[];
  delies?: { id: string; reference: string | null; titre: string | null; numero: string; annonce: string; archive: boolean }[];
  avertissements?: string[];
};

const euros = (n: number | null) => (n ? `${new Intl.NumberFormat('fr-FR').format(n)} €` : '');

export default function RepriseDiffusion({ biens, onFait }: { biens: BienVente[]; onFait: () => void }) {
  const [etat, setEtat] = useState<'repos' | 'lecture' | 'fait'>('repos');
  const [res, setRes] = useState<Resultat | null>(null);
  const [cache, setCache] = useState(false);
  const aRegler = biens.filter(x => etatDiffusion(x).ton === 'regler').length;
  const force = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('reprise');
  if (cache || (etat === 'repos' && aRegler === 0 && !force)) return null;

  async function lancer() {
    setEtat('lecture');
    try {
      const r = await fetch('/api/diffusion/reprise', { method: 'POST' });
      const j = await r.json() as Resultat;
      setRes(j);
      if (j.ok) onFait();
    } catch (e) {
      setRes({ ok: false, erreur: (e as Error).message });
    }
    setEtat('fait');
  }

  const regles = (res?.relies || []).filter(x => x.ecrit.includes('diffusion')).length;
  const relies = res?.relies?.length || 0;
  return (
    <div className={b.aerer} role="status">
      <span className={b.aererIc}><Ic n="megaphone" t={16} e={2.1} /></span>
      {etat === 'fait' && res ? (
        res.ok ? (
          <span className={b.aererTx}>
            <b>{`${relies} bien${relies > 1 ? 's' : ''} retrouvé${relies > 1 ? 's' : ''} dans le flux d’ImmoFacile${regles ? `, ${regles} réglé${regles > 1 ? 's' : ''}` : ''}.`}</b>
            <span>{'Leur numéro ImmoFacile est gardé (l’adresse de leur page sur ton site). Belles Demeures reste à cocher toi-même sur les biens concernés, avec le bouton de diffusion de leur fiche.'}</span>
            {(res.delies || []).filter(x => !x.archive).length > 0 && (
              <span className={b.repriseSeules}>
                {`Lien corrigé : ${res.delies!.filter(x => !x.archive).map(x => `${x.titre || x.reference || 'un bien'} ne correspond pas à l’annonce n° ${x.numero}${x.annonce ? ` (${x.annonce})` : ''}`).join(' ; ')}.`}
              </span>
            )}
            {(res.seules || []).length > 0 && (
              <span className={b.repriseSeules}>
                {`Pas retrouvé${res.seules!.length > 1 ? 's' : ''} dans le CRM : `}
                {res.seules!.map(x => [x.titre || `Bien n° ${x.numero}`, [x.cp, x.ville].filter(Boolean).join(' '), euros(x.prix)].filter(Boolean).join(' · ')).join(' ; ')}
              </span>
            )}
            {aRegler > 0 && <span>{`Encore ${aRegler} bien${aRegler > 1 ? 's' : ''} « À régler » : ouvre-les pour choisir leurs supports.`}</span>}
            {(res.avertissements || []).length > 0 && <span className={b.repriseSeules}>{`Pas enregistré : ${res.avertissements!.join(' ; ')}`}</span>}
          </span>
        ) : (
          <span className={b.aererTx}><b>La reprise n’a pas pu se faire.</b><span>{res.erreur || 'Erreur inconnue.'}</span></span>
        )
      ) : (
        <span className={b.aererTx}>
          <b>{aRegler ? `${aRegler} bien${aRegler > 1 ? 's' : ''} en vente n’${aRegler > 1 ? 'ont' : 'a'} pas encore leur diffusion réglée.` : 'Relancer la reprise d’ImmoFacile'}</b>
          <span>{'Je peux reprendre d’ImmoFacile ce qui est déjà en ligne : ton site, Jinka et SeLoger, et le numéro de chaque bien (l’adresse de sa page sur ton site). Rien de ce que tu as déjà réglé n’est touché.'}</span>
        </span>
      )}
      {etat !== 'fait' && (
        <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={etat === 'lecture'} onClick={() => { void lancer(); }}>
          {etat === 'lecture' ? <><span className={b.repriseRond} aria-hidden="true" />Lecture d’ImmoFacile…</> : <><Ic n="telecharger" t={15} />Reprendre d’ImmoFacile</>}
        </button>
      )}
      {etat !== 'lecture' && <button type="button" className={b.annonceVenteX} aria-label="Fermer" onClick={() => setCache(true)}><Ic n="croix" t={14} /></button>}
    </div>
  );
}
