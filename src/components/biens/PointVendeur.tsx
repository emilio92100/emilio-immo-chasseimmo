'use client';
import { useState } from 'react';
import { euros, jourParis } from '@/lib/mandat';
import { txt } from '@/lib/actes';
import { argentBien, dateLongue, montantActuel, titreBien, type BienVente, type SuiviVente } from '@/lib/biens-vente';
import type { Issue } from '@/lib/visites';
import { Ic } from '@/components/documents/ApercuActe';
import { Fenetre } from './FenetresBien';
import { ajouterSuivi, nomClient, poserDansBien, type ClientMini } from './outils';
import { addJournal } from '@/lib/supabase';
import { signalerEchec } from '@/lib/ecritures';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';

/* ═══ Le point vendeur (V3.50) ═════════════════════════════════════════════
   Alexandre faisait le point avec ses vendeurs de tête : combien de visites,
   ce qu'en ont dit les acheteurs, les offres. Ici, un texte prêt à envoyer,
   écrit simplement, depuis le dernier point (ou la mise en vente) : les
   visites faites et leurs retours, celles à venir, les offres, le prix. Il se
   retouche, se copie, et « Noter comme envoyé » le range dans le Suivi du
   propriétaire et l'historique du bien (`donnees.dernierPointVendeur`).
   Pas d'envoi par mail d'ici : il n'existe pas encore, côté biens, de mail
   libre propre à un contact (envoyerDocuments exige des pièces jointes). */

export type VisitePoint = {
  ymd: string; heure: string; qui: string; source: 'crm' | 'libre'; statut: 'a_venir' | 'faite' | 'annulee';
  issue: Issue | null; motifs: string[]; commentaire: string; passee: boolean;
};

/* « Paul Martin » → « Paul M. » : le vendeur n'a pas besoin du nom entier. */
/* V3.50 : pareil pour un visiteur hors CRM (« Couple Nguyen (SeLoger) » →
   « Couple N. ») : ce qu'on a noté entre parenthèses reste chez nous. */
const discret = (nom: string) => {
  const m = nom.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).filter(Boolean);
  return m.length > 1 ? `${m[0]} ${m[m.length - 1].charAt(0).toUpperCase()}.` : (m[0] || 'Un acheteur');
};
const minus = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const etListe = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}` : l[0] || '');
const RETOUR: Record<Issue, string> = {
  offre: 'souhaite faire une offre',
  revoir: 'aimerait revoir le bien',
  reflexion: 'réfléchit',
  non: 'n’a pas donné suite',
};
function retourDe(v: VisitePoint): string {
  const motifs = v.motifs.filter(Boolean).map(minus);
  const avis = v.issue ? `${RETOUR[v.issue]}${motifs.length ? ` (${etListe(motifs)})` : ''}` : '';
  /* Hors CRM : le compte rendu, tel qu'Alexandre l'a écrit. */
  /* Seulement un vrai compte rendu : avant, c'est la note de préparation de
     la visite (« vient avec son père »…), qui ne regarde pas le vendeur. */
  const mot = v.source === 'libre' && v.statut === 'faite' && v.commentaire.trim() ? `« ${v.commentaire.trim()} »` : '';
  return [avis, mot].filter(Boolean).join(' : ') || 'pas encore de retour';
}

const STATUT_OFFRE: Record<string, string> = {
  en_attente: 'en attente de votre réponse', contre: 'vous avez fait une contre-proposition', acceptee: 'acceptée',
  refusee: 'refusée', retiree: 'retirée',
};

export function textePointVendeur(o: {
  bien: BienVente; proprio: ClientMini | null; depuis: string; visites: VisitePoint[]; offres: SuiviVente[];
  prixAvant: number | null; presentes: number;
}): string {
  const d = o.bien.donnees || {};
  const p = o.proprio;
  const bonjour = p?.civilite === 'Madame' || p?.civilite === 'Monsieur' ? `Bonjour ${p.civilite} ${p.nom || ''}`.trim() : `Bonjour${p?.prenom ? ` ${p.prenom}` : ''}`;
  const adresse = txt(d, 'adresse');
  const leBien = adresse ? `votre bien du ${adresse}` : `votre bien${txt(d, 'ville') ? ` à ${txt(d, 'ville')}` : ''}`;
  const depuis = o.depuis ? ` depuis ${o.bien.donnees?.dernierPointVendeur ? 'notre dernier point' : 'sa mise en vente'}, le ${dateLongue(o.depuis)}` : '';
  const lignes: string[] = [`${bonjour},`, '', `Voici où en est la vente de ${leBien}${depuis}.`, ''];

  const faites = o.visites.filter(v => v.statut !== 'annulee' && v.passee && (!o.depuis || v.ymd >= o.depuis)).sort((x, y) => x.ymd.localeCompare(y.ymd));
  const aVenir = o.visites.filter(v => v.statut === 'a_venir' && !v.passee).sort((x, y) => `${x.ymd}${x.heure}`.localeCompare(`${y.ymd}${y.heure}`));
  if (faites.length) {
    lignes.push(faites.length > 1 ? `${faites.length} visites ont eu lieu :` : 'Une visite a eu lieu :');
    for (const v of faites) lignes.push(`- le ${dateLongue(v.ymd)}, ${discret(v.qui)} : ${retourDe(v)}.`);
  } else lignes.push('Il n’y a pas eu de visite sur cette période.');
  if (aVenir.length) lignes.push(aVenir.length > 1 ? `${aVenir.length}${faites.length ? ' autres' : ''} visites sont prévues, la prochaine le ${dateLongue(aVenir[0].ymd)}.` : `Une visite est prévue le ${dateLongue(aVenir[0].ymd)}.`);
  if (o.presentes) lignes.push(`Le bien a aussi été présenté à ${o.presentes > 1 ? `${o.presentes} acheteurs` : 'un acheteur'} que nous accompagnons.`);
  lignes.push('');

  const offres = o.offres.filter(x => !o.depuis || x.le.slice(0, 10) >= o.depuis || x.statut === 'en_attente' || x.statut === 'contre' || x.statut === 'acceptee');
  if (offres.length) {
    lignes.push(offres.length > 1 ? `${offres.length} offres :` : 'Une offre :');
    for (const x of offres) lignes.push(`- ${euros(montantActuel(x))}, reçue le ${dateLongue(x.le.slice(0, 10))} : ${STATUT_OFFRE[x.statut || 'en_attente'] || 'en cours'}.`);
  } else lignes.push('Pas d’offre pour l’instant.');
  lignes.push('');

  const prix = argentBien(d).prix;
  if (prix) lignes.push(o.prixAvant && o.prixAvant !== prix ? `Le prix affiché est passé de ${euros(o.prixAvant)} à ${euros(prix)}.` : `Le prix affiché reste de ${euros(prix)}.`);
  lignes.push('', 'Je reste à votre disposition pour en parler.', '', 'Bien cordialement,');
  return lignes.join('\n');
}

export function FenPointVendeur({ bien, proprio, visites, offres, suivi, presentes, onFermer, onFait }: {
  bien: BienVente; proprio: ClientMini | null; visites: VisitePoint[]; offres: SuiviVente[]; suivi: SuiviVente[]; presentes: number;
  onFermer: () => void; onFait: (b: BienVente) => void;
}) {
  const d = bien.donnees || {};
  const dernier = txt(d, 'dernierPointVendeur');
  const depuis = dernier || txt(d, 'mandatDate') || (bien.en_vente_le ? jourParis(bien.en_vente_le) : '');
  /* Le prix au début de la période : le « ancien » du premier changement de prix après. */
  const premierPrix = suivi.filter(x => x.type === 'prix' && (!depuis || x.le.slice(0, 10) >= depuis)).sort((x, y) => x.le.localeCompare(y.le))[0];
  const prixAvant = premierPrix && typeof (premierPrix.donnees as Record<string, unknown>).ancien === 'number' ? (premierPrix.donnees as Record<string, number>).ancien : null;
  const [texte, setTexte] = useState(() => textePointVendeur({ bien, proprio, depuis, visites, offres, prixAvant, presentes }));
  const [copie, setCopie] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const titre = bien.titre || titreBien(d);
  function copier() {
    navigator.clipboard?.writeText(texte).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1800); })
      .catch(() => setErreur('Le texte n’a pas pu être copié : sélectionne-le et copie-le à la main.'));
  }
  async function noter() {
    setOccupe(true); setErreur('');
    const jour = jourParis();
    try {
      if (bien.client_id) {
        const ok = await addJournal(bien.client_id, 'mail_envoye', `📣 Point vendeur — ${titre}`, texte, { bien_vente_id: bien.id, pointVendeur: true });
        if (!ok) throw new Error('Le point n’a pas pu être noté dans son suivi.');
      }
      const nbV = visites.filter(v => v.statut !== 'annulee' && v.passee && (!depuis || v.ymd >= depuis)).length;
      await ajouterSuivi({ bien_id: bien.id, type: 'note', commentaire: `Envoyé à ${proprio ? nomClient(proprio) : 'le propriétaire'}${depuis ? ` · depuis le ${dateLongue(depuis)}` : ''} · ${nbV} visite${nbV > 1 ? 's' : ''}`, donnees: { pointVendeur: true, depuis, texte } });
      onFait(await poserDansBien(bien.id, { dernierPointVendeur: jour }));
    } catch (e) { signalerEchec('Le point vendeur', (e as Error).message); setErreur((e as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre sur={proprio ? `Pour ${nomClient(proprio)}` : 'Pour le propriétaire'} couleur="#c9a84c" titre="Le point vendeur" large
      sous={dernier ? `Depuis le dernier point, le ${dateLongue(dernier)}` : depuis ? `Depuis la mise en vente, le ${dateLongue(depuis)}` : 'Depuis la mise en vente'}
      occupe={occupe} onFermer={onFermer}
      pied={<>
        <button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Fermer</button>
        <button type="button" className={s.btn} disabled={occupe} onClick={copier}><Ic n={copie ? 'check' : 'copier'} t={15} />{copie ? 'Copié' : 'Copier le texte'}</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={() => { void noter(); }}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : 'Noter comme envoyé'}</button>
      </>}>
      <div className={b.calc}>Les visites et ce qu’en ont dit les acheteurs, les offres, le prix. Relis, retouche, puis copie-le dans ton mail ou ton message.</div>
      <textarea className={s.input} rows={16} value={texte} onChange={e => setTexte(e.target.value)} aria-label="Le texte du point vendeur" />
      <div className={b.calc}>{bien.client_id
        ? '« Noter comme envoyé » le garde dans son suivi et dans l’historique du bien ; le prochain point partira de là.'
        : 'Le propriétaire n’a pas de fiche reliée : le point se garde dans l’historique du bien seulement.'}</div>
      {erreur && <div className={s.erreur}>{erreur}</div>}
    </Fenetre>
  );
}
