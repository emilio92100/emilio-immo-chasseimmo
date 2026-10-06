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
   pour relancer la reprise après avoir corrigé une fiche.

   V3.95 : une annonce d'ImmoFacile qu'aucune fiche ne reprend a son bouton
   « Créer dans le CRM » (/api/diffusion/creer) ; les biens qui n'étaient pas
   en ligne passent en « Non diffusé », et le bandeau le dit. */

type Resultat = {
  ok: boolean; erreur?: string; lus?: number;
  relies?: { id: string; reference: string | null; titre: string | null; numero: string; par: string; ecrit: string[] }[];
  seules?: { numero: string; titre: string; prix: number | null; cp: string; ville: string }[];
  delies?: { id: string; reference: string | null; titre: string | null; numero: string; annonce: string; archive: boolean }[];
  nonDiffuses?: { id: string; reference: string | null; titre: string | null }[];
  avertissements?: string[];
};

const euros = (n: number | null) => (n ? `${new Intl.NumberFormat('fr-FR').format(n)} €` : '');

type Creation = { etat: 'envoi' } | { etat: 'fait'; id: string; reference: string; photos: number; existe?: boolean } | { etat: 'erreur'; erreur: string };

export default function RepriseDiffusion({ biens, onFait, onOuvrir }: { biens: BienVente[]; onFait: () => void; onOuvrir?: (id: string) => void }) {
  const [etat, setEtat] = useState<'repos' | 'lecture' | 'fait'>('repos');
  const [res, setRes] = useState<Resultat | null>(null);
  const [cache, setCache] = useState(false);
  const [creations, setCreations] = useState<Record<string, Creation>>({});
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

  async function creer(numero: string) {
    setCreations(c => ({ ...c, [numero]: { etat: 'envoi' } }));
    try {
      const r = await fetch('/api/diffusion/creer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero }) });
      const j = await r.json() as { ok: boolean; erreur?: string; id?: string; reference?: string; photos?: number; existe?: boolean };
      if (!j.ok || !j.id) throw new Error(j.erreur || 'Erreur inconnue.');
      setCreations(c => ({ ...c, [numero]: { etat: 'fait', id: j.id!, reference: j.reference || '', photos: j.photos || 0, existe: j.existe } }));
      onFait();
    } catch (e) {
      setCreations(c => ({ ...c, [numero]: { etat: 'erreur', erreur: (e as Error).message } }));
    }
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
                {`En ligne chez ImmoFacile, mais pas dans le CRM : ${res.seules!.length > 1 ? 'chacun peut être créé d’ici' : 'il peut être créé d’ici'}, avec son texte et ses photos.`}
              </span>
            )}
            {(res.seules || []).map(x => {
              const c = creations[x.numero];
              return (
                <span key={x.numero} className={b.repriseCreer}>
                  <span className={b.repriseCreerTx}>{[x.titre || `Bien n° ${x.numero}`, [x.cp, x.ville].filter(Boolean).join(' '), euros(x.prix)].filter(Boolean).join(' · ')}</span>
                  {!c || c.etat === 'erreur' ? (
                    <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={() => { void creer(x.numero); }}><Ic n="plus" t={15} />Créer dans le CRM</button>
                  ) : c.etat === 'envoi' ? (
                    <span className={b.repriseEnCours}><span className={b.repriseRond} aria-hidden="true" />{'Création, copie des photos…'}</span>
                  ) : (
                    <button type="button" className={s.btn} onClick={() => onOuvrir?.(c.id)}><Ic n="check" t={15} />{`${c.existe ? 'Déjà créé' : 'Créé'} : ${c.reference}${c.existe ? '' : ` · ${c.photos} photo${c.photos > 1 ? 's' : ''}`} · Ouvrir`}</button>
                  )}
                  {c?.etat === 'erreur' && <span className={b.repriseSeules}>{c.erreur}</span>}
                </span>
              );
            })}
            {(res.nonDiffuses || []).length > 0 && (
              <span>{`${res.nonDiffuses!.length} bien${res.nonDiffuses!.length > 1 ? 's' : ''} qui n’étai${res.nonDiffuses!.length > 1 ? 'en' : ''}t pas en ligne chez ImmoFacile ${res.nonDiffuses!.length > 1 ? 'sont passés' : 'est passé'} en « Non diffusé », comme aujourd’hui. Pour en mettre un en ligne : le bouton « Non diffusé » de sa fiche.`}</span>
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
