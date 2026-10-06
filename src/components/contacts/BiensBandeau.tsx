'use client';

/* ═══ Ses biens, dans le bandeau bleu d'une fiche (V3.84) ═══════════════════
   Le rang « Ses biens » vivait dans la fiche d'un vendeur ou d'un
   propriétaire (FicheContact, V3.32–V3.59). Alexandre (V3.84) : « pourquoi,
   sur un client, on est obligé de descendre en bas pour voir s'il a des biens
   qui lui appartiennent ? Sur certains, ça s'affiche directement dans le bloc
   bleu ». C'était la fiche d'un vendeur ; un acheteur qui vend aussi avait
   « Ses biens » replié tout en bas de la Vue d'ensemble. Le chargement et le
   rang sont ici, partagés par les deux fiches : FicheContact et FicheClient. */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Ic } from '@/components/documents/ApercuActe';
import { etapeDe, lirePhotos, titreBien } from '@/lib/biens-vente';
import { euros } from '@/lib/mandat';
import { libelleVisites } from '@/lib/visites';
import c from './Contacts.module.css';

export type BienHero = { id: string; etape: string; titre: string | null; prix: number | null; photo?: string | null; donnees?: Record<string, unknown> | null };

/* Les visites et les offres sur ses biens (V3.33) : le nombre, ce qui se
   dit en dessous (« dont 1 à venir », « en attente de réponse »), et bien
   par bien pour ouvrir le bon. */
export type ActiviteVente = {
  /* Faites (la date est passée) et prévues : jamais « 3 visites » tout court (V3.33). */
  faites: number; prevues: number; derniereVisite: string | null; prochaineVisite: string | null;
  offres: number; enAttente: number; acceptee: number;
  parBien: Record<string, { f: number; p: number; o: number }>;
};
export const VENTE_VIDE: ActiviteVente = { faites: 0, prevues: 0, derniereVisite: null, prochaineVisite: null, offres: 0, enAttente: 0, acceptee: 0, parBien: {} };
const pl = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/* Ses biens (pas archivés), le nombre d'archivés, et les visites et offres
   sur eux (V3.32). Lus une fois par contact. */
export function useBiensBandeau(clientId: string): { biens: BienHero[] | null; archives: number; vente: ActiviteVente } {
  const [biensH, setBiensH] = useState<BienHero[] | null>(null);
  const [nbArchives, setNbArchives] = useState(0);
  const [vo, setVo] = useState<ActiviteVente>(VENTE_VIDE);
  useEffect(() => {
    let vivant = true;
    (async () => {
      const { data, error } = await supabase.from('biens_vente').select('*').eq('client_id', clientId).order('updated_at', { ascending: false });
      if (!vivant) return;
      const l = (error ? [] : data || []) as (BienHero & { archive?: boolean | null })[];
      setBiensH(l.filter(b => !b.archive));
      setNbArchives(l.filter(b => b.archive).length);
      if (!l.length) return;
      const { data: sv } = await supabase.from('biens_vente_suivi').select('bien_id, type, statut, le').in('bien_id', l.map(b => b.id)).in('type', ['visite', 'offre']);
      if (!vivant) return;
      const rows = (sv || []) as { bien_id: string; type: string; statut: string | null; le: string | null }[];
      const visites = rows.filter(r => r.type === 'visite' && r.statut !== 'annulee');
      const offres = rows.filter(r => r.type === 'offre');
      /* Faite : marquée faite, ou sa date est passée (comme la fiche du bien).
         Prévue : à venir, et pas encore passée. */
      const maintenant = Date.now();
      const passee = (r: { statut: string | null; le: string | null }) => r.statut === 'faite' || (!!r.le && Date.parse(r.le) < maintenant);
      const faites = visites.filter(passee);
      const prevues = visites.filter(r => !passee(r));
      const datesF = faites.filter(r => r.le).map(r => String(r.le)).sort();
      const datesP = prevues.filter(r => r.le).map(r => String(r.le)).sort();
      const parBien: ActiviteVente['parBien'] = {};
      const de = (id: string) => parBien[id] || (parBien[id] = { f: 0, p: 0, o: 0 });
      for (const r of faites) de(r.bien_id).f++;
      for (const r of prevues) de(r.bien_id).p++;
      for (const r of offres) de(r.bien_id).o++;
      setVo({
        faites: faites.length, prevues: prevues.length, derniereVisite: datesF[datesF.length - 1] || null, prochaineVisite: datesP[0] || null,
        offres: offres.length, enAttente: offres.filter(r => r.statut === 'en_attente' || r.statut === 'contre').length, acceptee: offres.filter(r => r.statut === 'acceptee').length,
        parBien,
      });
    })();
    return () => { vivant = false; };
  }, [clientId]);
  return { biens: biensH, archives: nbArchives, vente: vo };
}

/* Ses biens, sur toute la largeur du bandeau (V3.33) : côte à côte, à parts
   égales (un seul prend toute la place et dit tout sur une ligne). */
export function BiensHero({ biens, vente, onBien, onCreerBien }: {
  biens: BienHero[]; vente: ActiviteVente; onBien: (id: string, onglet?: string) => void; onCreerBien: () => void;
}) {
  /* V3.59 : « Ses biens » n'est plus répété sous le bandeau (Alexandre : « on
     a déjà l'info sur la partie bleue ») ; au-delà de quatre, « + N autres »
     les déplie ici même. */
  const [tous, setTous] = useState(false);
  if (!biens.length) {
    return (
      <div className={c.biensRang} id="biens-hero">
        <button type="button" className={c.heroBienVide} onClick={onCreerBien}><Ic n="plus" t={14} e={2.4} /><span>Créer son bien : estimation, mandat, tout y est</span></button>
      </div>
    );
  }
  const montres = biens.length > 4 && !tous ? biens.slice(0, 3) : biens;
  return (
    <div className={c.biensZone} id="biens-hero">
    <div className={`${c.biensRang} ${biens.length === 1 ? c.biensSeul : ''}`}>
      {montres.map(b => {
        const e = etapeDe(b.etape);
        const d = (b.donnees || {}) as Record<string, unknown>;
        const photo = b.photo || lirePhotos(d.photos)[0]?.url || '';
        const n = vente.parBien[b.id];
        const activite = [libelleVisites(n?.f || 0, n?.p || 0), n?.o ? pl(n.o, 'offre', 'offres') : ''].filter(Boolean);
        /* Seul, il a la place : ses visites et offres en pastilles à droite.
           Côte à côte, elles suivent l'étape et le prix. */
        const seul = biens.length === 1;
        return (
          <button key={b.id} type="button" className={c.heroBien} onClick={() => onBien(b.id)} title="Ouvrir la fiche du bien">
            <span className={c.heroBienPh}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {photo ? <img src={photo} alt="" /> : <Ic n="maison" t={16} />}
            </span>
            <span className={c.heroBienTx}>
              <b>{b.titre || titreBien(d as Parameters<typeof titreBien>[0]) || 'Son bien'}</b>
              <small><i style={{ background: e.c }} />{`${e.lib}${b.prix ? ` · ${euros(b.prix)}` : ''}${!seul && activite.length ? ` · ${activite.join(' · ')}` : ''}`}</small>
            </span>
            {seul && activite.length > 0 && <span className={c.heroBienAct}>{activite.map(a => <em key={a}>{a}</em>)}</span>}
            <Ic n="droite" t={14} e={2.2} />
          </button>
        );
      })}
      {biens.length > 4 && !tous && (
        <button type="button" className={`${c.heroBien} ${c.heroBienPlus}`} onClick={() => setTous(true)}>
          <span className={c.heroBienTx}><b>{`+ ${biens.length - 3} autres biens`}</b><small>les voir tous ici</small></span>
          <Ic n="bas" t={14} e={2.2} />
        </button>
      )}
    </div>
    <button type="button" className={c.heroBienAjout} onClick={onCreerBien} title="Créer un autre bien pour ce contact"><Ic n="plus" t={14} e={2.4} /><span>Nouveau bien</span></button>
    </div>
  );
}
