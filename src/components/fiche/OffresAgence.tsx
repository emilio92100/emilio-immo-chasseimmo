'use client';
/* ══ Ses offres sur les biens de l'agence (V3.172) ════════════════════════
   Alexandre : « quand une offre est créée, l'historique sur la fiche du
   client aussi, avec l'historique s'il y a plusieurs contre-offres ». Une
   offre sur un mandat de l'agence se suit sur la fiche du bien (V3.50) :
   l'onglet Transaction de l'acheteur disait seulement « Aucune transaction
   en cours ». Il la montre maintenant — où elle en est, chaque tour de la
   négociation à sa date —, et un clic ouvre le bien. Rien ne s'y écrit. */
import { supabase } from '@/lib/supabase';
import { echangesDe, montantActuel, type SuiviVente } from '@/lib/biens-vente';
import { euros } from '@/lib/mandat';
import { Ic } from '@/components/documents/ApercuActe';
import s from './OffresAgence.module.css';

/* Les offres de cet acheteur : sur sa recherche ouverte, ou sans recherche. */
export async function lireOffresAgence(clientId: string, rechercheId: string | null): Promise<SuiviVente[]> {
  const { data, error } = await supabase.from('biens_vente_suivi').select('*').eq('type', 'offre').eq('client_id', clientId).order('le', { ascending: false });
  if (error) throw new Error(`Ses offres sur les biens de l’agence n’ont pas pu être lues : ${error.message}`);
  return ((data || []) as SuiviVente[]).filter(o => !rechercheId || !o.recherche_id || o.recherche_id === rechercheId);
}

type Copie = { id: string; bien_vente_id?: string | null; titre?: string | null; ville?: string | null; photos?: string[] | null };

const PUCE: Record<string, { l: string; c: string; f: string }> = {
  en_attente: { l: 'En attente du vendeur', c: '#7a5d1c', f: '#fbf6e9' },
  contre: { l: 'À lui de répondre', c: '#1d4ed8', f: '#eff6ff' },
  acceptee: { l: 'Acceptée', c: '#15803d', f: '#dcfce7' },
  refusee: { l: 'Refusée', c: '#475569', f: '#f1f5f9' },
  retiree: { l: 'Retirée', c: '#475569', f: '#f1f5f9' },
};
const jour = (ymd: string) => {
  const d = new Date(`${(ymd || '').slice(0, 10)}T12:00:00`);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/^1 /, '1er ');
};

export default function OffresAgence({ offres, biens, onBien }: { offres: SuiviVente[]; biens: Copie[]; onBien: (bienVenteId: string) => void }) {
  if (!offres.length) return null;
  return (
    <div className={s.liste}>
      <div className={s.tete}>
        <b>{offres.length > 1 ? 'Ses offres sur les biens de l’agence' : 'Son offre sur un bien de l’agence'}</b>
        <span>Elle se suit sur la fiche du bien : la réponse du vendeur, le compromis, l’acte.</span>
      </div>
      {offres.map(o => {
        const copie = biens.find(b => b.bien_vente_id === o.bien_id);
        const d = (o.donnees || {}) as Record<string, unknown>;
        const st = o.statut || 'en_attente';
        const p = PUCE[st] || PUCE.en_attente;
        const ech = echangesDe(o);
        const actuel = montantActuel(o);
        const fin = st === 'acceptee' || st === 'refusee' || st === 'retiree';
        const reponse = typeof d.reponse_le === 'string' ? d.reponse_le : '';
        const renonce = st === 'retiree' && ech[ech.length - 1]?.par === 'vendeur';
        return (
          <div key={o.id} className={s.carte} data-statut={st}>
            <div className={s.bien}>
              <span className={s.photo}>{copie?.photos?.[0] ? <img src={copie.photos[0]} alt="" /> : <Ic n="maison" t={20} />}</span>
              <span className={s.bienTx}>
                <small>Bien de l’agence</small>
                <b>{copie?.titre || copie?.ville || 'Un bien de l’agence'}</b>
                {copie?.ville && copie?.titre ? <span>{copie.ville}</span> : null}
              </span>
              <span className={s.puce} style={{ color: p.c, background: p.f }}>{p.l}</span>
            </div>
            <div className={s.montant}>
              <b>{euros(actuel)}</b>
              <span>{st === 'acceptee' ? 'prix convenu' : ech.length > 1 ? 'dernière proposition' : `offre faite le ${jour(o.le)}`}</span>
            </div>
            <ol className={s.fil} aria-label="L’historique de l’offre">
              {ech.map((e, i) => (
                <li key={i} data-par={e.par}>
                  <span className={s.point} aria-hidden="true" />
                  <span className={s.date}>{jour(e.le)}</span>
                  <span className={s.quoi}>{i === 0 ? 'Son offre' : e.par === 'vendeur' ? 'Contre-offre du vendeur' : 'Sa nouvelle proposition'}</span>
                  <b>{euros(e.montant)}</b>
                </li>
              ))}
              {fin && (
                <li data-par={st === 'acceptee' ? 'accord' : 'fin'}>
                  <span className={s.point} aria-hidden="true" />
                  <span className={s.date}>{jour(reponse)}</span>
                  <span className={s.quoi}>{st === 'acceptee' ? 'Accord du vendeur' : st === 'refusee' ? 'Refusée par le vendeur' : d.compromisTombe ? 'Compromis tombé' : renonce ? 'Il n’a pas donné suite' : 'Offre retirée'}</span>
                  <b>{st === 'acceptee' ? euros(actuel) : ''}</b>
                </li>
              )}
            </ol>
            <button type="button" className={s.ouvrir} onClick={() => onBien(o.bien_id)}>
              Ouvrir la fiche du bien<Ic n="droite" t={14} e={2.4} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
