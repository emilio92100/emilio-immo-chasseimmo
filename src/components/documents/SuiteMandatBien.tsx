'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { etapeDe, titreBien, type BienVente } from '@/lib/biens-vente';
import { lireEtapeAvantMandat, retirerMandatDuBien, terminerMandatDuBien } from '@/lib/mandat-bien';
import { txt } from '@/lib/actes';
import { Croix, Ic } from './ApercuActe';
import type { DocumentRow } from './outils';
import s from './Documents.module.css';

/* ═══ Un mandat de vente annulé ou supprimé : et la fiche du bien ? (V3.42)
   Alexandre : « quand j'annule un mandat, il y a toujours les informations
   du mandat sur les fiches ». Le document annulé, son bien restait « En
   vente », avec le n°, les dates, « fin dans 7 jours ». Maintenant, la
   rubrique Documents demande quoi en faire, en un clic :
   - le mandat est fini (rétractation, fin, vendu par un autre) : le bien
     passe « Retiré », le mandat reste lisible dans son historique ;
   - il avait été fait par erreur : il quitte la fiche, le bien revient à
     l'estimation (src/lib/mandat-bien.ts, comme « Annuler ce mandat » sur
     la fiche) ;
   - ne rien changer.
   Proposé seulement quand la fiche dépend de ce mandat (bienConcerne). */

type Choix = 'termine' | 'erreur' | 'rien';

export default function SuiteMandatBien({ bien, doc, etaitSigne, supprime, onFermer, onFicheBien }: {
  bien: BienVente; doc: DocumentRow;
  /* Le document avait été signé (sinon : en préparation, ou prêt à signer). */
  etaitSigne: boolean;
  /* Un brouillon supprimé, plutôt qu'un document annulé. */
  supprime: boolean;
  onFermer: () => void; onFicheBien: (id: string) => void;
}) {
  const bd = bien.donnees || {};
  const noteSigne = !!txt(bd, 'mandatDate');
  const numero = txt(bd, 'mandatNumero') || bien.mandat_numero || '';
  /* Sous offre ou sous compromis (V3.43) : on ne propose rien d'office. */
  const avance = bien.etape === 'offre' || bien.etape === 'compromis';
  /* « En vente », « En pause », « Sous offre », « Sous compromis ». */
  const etape = etapeDe(bien.etape).court;
  const [choix, setChoix] = useState<Choix>(avance ? 'rien' : etaitSigne ? 'termine' : 'erreur');
  const [travail, setTravail] = useState(false);
  const [erreur, setErreur] = useState('');
  const [fait, setFait] = useState<string | null>(null);
  const titre = titreBien(bd);
  const lieu = [titre, bien.ville].filter(Boolean).join(' · ');
  const quoi = supprime ? 'Mandat supprimé dans Documents' : 'Mandat annulé dans Documents';

  const options: { v: Choix; ic: string; t: string; x: string }[] = [
    etaitSigne
      ? { v: 'termine', ic: 'archive', t: 'Le mandat est terminé', x: 'Rétractation, fin du mandat, vendu par un autre : le bien passe « Retiré ». Son historique garde le mandat.' }
      : { v: 'termine', ic: 'archive', t: 'Le vendeur renonce', x: 'Le bien passe « Retiré », gardé dans l’historique.' },
    noteSigne
      ? { v: 'erreur', ic: 'retour', t: 'Il avait été fait par erreur', x: `Un test, le mauvais bien : ${numero ? `le n° ${numero}` : 'le numéro'}, le type et les dates quittent la fiche, et le bien revient à l’estimation.` }
      : { v: 'erreur', ic: 'retour', t: 'Le bien n’est pas encore en vente', x: 'Aucun mandat signé n’y est noté : il revient à l’estimation, et repassera « En vente » tout seul à la signature du prochain mandat.' },
    { v: 'rien', ic: 'check', t: 'Ne rien changer', x: `La fiche reste « ${etape} », telle quelle. Tu pourras la changer depuis le bien.` },
  ];

  async function valider() {
    if (choix === 'rien') { onFermer(); return; }
    setTravail(true); setErreur('');
    try {
      if (choix === 'termine') {
        await terminerMandatDuBien(supabase, bien, etaitSigne ? quoi : 'Le vendeur renonce');
        setFait('Le bien est passé « Retiré ». Son historique garde le mandat.');
      } else {
        const vers = await lireEtapeAvantMandat(supabase, bien.id);
        const r = await retirerMandatDuBien(supabase, bien, { vers: vers === 'retire' ? 'estimation' : vers, prix: 'conseille', hono: 'garder', raison: quoi, document: doc.id });
        setFait(r.avertissement || `Le mandat a quitté la fiche : le bien est revenu « ${vers === 'a_suivre' ? 'À suivre' : 'Estimation'} ».`);
      }
    } catch (e) { setErreur((e as Error).message); }
    setTravail(false);
  }

  return (
    <div className={s.fenetre} style={{ zIndex: 1000 }} onClick={e => { if (e.target === e.currentTarget && !travail) onFermer(); }}>
      <div className={s.fenetreIn} role="dialog" aria-modal="true" aria-label="Et la fiche du bien ?">
        <div className={s.fenTete}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h3>{fait ? 'La fiche du bien est à jour' : 'Et la fiche du bien ?'}</h3>
            <p>{fait ? lieu : `${lieu} est encore « ${etape} »${numero && noteSigne ? `, avec le mandat n° ${numero}` : ''}. Que devient-il ?`}</p>
          </div>
          <button type="button" className={s.panFermer} aria-label="Fermer" disabled={travail} onClick={onFermer}><Croix /></button>
        </div>
        <div className={s.fenCorps}>
          {fait ? <div className={s.note}>{fait}</div> : options.map(o => (
            <button key={o.v} type="button" className={`${s.choix} ${choix === o.v ? s.choixOn : ''}`} aria-pressed={choix === o.v} onClick={() => setChoix(o.v)}>
              <span className={`${s.suiteIc} ${choix === o.v ? s.suiteIcOn : ''}`}><Ic n={o.ic} t={17} /></span>
              <span><b>{o.t}</b><small>{o.x}</small></span>
            </button>
          ))}
          {erreur && <div className={s.erreur}>{erreur}</div>}
        </div>
        <div className={s.fenPied}>
          {fait ? (
            <>
              <button type="button" className={s.btn} onClick={onFermer}>Fermer</button>
              <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={() => onFicheBien(bien.id)}><Ic n="maison" t={15} />Voir le bien</button>
            </>
          ) : (
            <>
              <button type="button" className={s.btn} disabled={travail} onClick={onFermer}>Plus tard</button>
              <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={travail} onClick={valider}><Ic n="check" t={15} e={2.4} />{travail ? 'Enregistrement…' : 'Valider'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
