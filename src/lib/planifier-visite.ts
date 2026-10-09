import { addJournal, supabase } from '@/lib/supabase';
import { signalerEchec, verifie } from '@/lib/ecritures';
import { solderRelancesRetourVisite, solderRelancesVisite } from '@/lib/demandes-visite';

/* ═══ Planifier une visite (V3.129) ═══════════════════════════════════════
   Sorti de la fiche du client (FicheClient, « Planifier une visite ») pour
   que la page Visites cale une visite demandée sans ouvrir la fiche
   (Alexandre : « si on fait planifier une visite, ça ouvre déjà un pop-up et
   je peux organiser directement la visite »). Les deux endroits passent par
   ici : la même vérification, les mêmes écritures, le même Suivi. */

export type BienAVisiter = { id: string; titre?: string | null; ville?: string | null; bien_vente_id?: string | null };

/* V3.50 — Un mandat de l'agence (copie portant `bien_vente_id`) vendu,
   retiré, suspendu ou archivé ne se visite plus : l'espace du client cache
   la visite et refuse sa demande, mais la fiche la laissait caler — elle
   restait dans l'agenda, invisible pour lui. Sous compromis : seulement
   pour une offre de secours, on le demande (une fois par bien, `acceptes`).
   Rend false si on s'arrête. Lecture impossible : on laisse faire (le bien
   a pu être vérifié avant). */
export async function bienVisitable(biens: BienAVisiter[], acceptes: Set<string>): Promise<boolean> {
  const copies = biens.filter(b => b.bien_vente_id);
  if (!copies.length) return true;
  const { data, error } = await supabase.from('biens_vente').select('id, etape, archive')
    .in('id', copies.map(b => b.bien_vente_id as string));
  if (error) return true;
  const ventes = (data || []) as { id: string; etape: string | null; archive: boolean | null }[];
  for (const b of copies) {
    const v = ventes.find(x => x.id === b.bien_vente_id);
    if (!v) continue;
    const nom = b.titre || b.ville || 'Ce bien';
    if (v.etape === 'vendu') { alert(`Ce bien est vendu.\n\n« ${nom} » ne peut plus être visité.`); return false; }
    if (v.archive || v.etape === 'retire' || v.etape === 'suspendu') { alert(`Ce bien n’est plus en vente.\n\n« ${nom} » ne peut plus être visité.`); return false; }
    if (v.etape === 'compromis' && !acceptes.has(b.id)) {
      if (!confirm(`Ce bien est sous compromis : une visite ne sert que pour une offre de secours. Continuer ?\n\n« ${nom} »`)) return false;
      acceptes.add(b.id);
    }
  }
  return true;
}

export type VisiteAPoser = {
  clientId: string; rechercheId: string | null;
  biens: BienAVisiter[];
  /* Les biens déjà visités (une 2e visite), relevés avant l'ajout. */
  revus: string[];
  date: string; heure: string; contact: string; notes: string;
  /* V3.146 : la durée choisie dans « Organiser une visite » (page Visites),
     en minutes ; sans elle, l'agenda compte une heure, comme avant. */
  duree?: number;
};

/* Pose la visite (une ligne par bien, sur le même créneau) et ce qui va
   avec. Rend true si la visite est enregistrée. */
export async function poserVisites(v: VisiteAPoser): Promise<boolean> {
  const ids = v.biens.map(b => b.id);
  const titre = (id: string) => v.biens.find(b => b.id === id)?.titre;
  /* Une ligne de visite par bien, toutes sur le même créneau : la table n'a
     qu'un `bien_id`, et l'agenda comme les comptes rendus raisonnent bien
     par bien. Ce qui est commun — date, heure, contact — est recopié. */
  const { error: errVis } = await supabase.from('visites').insert(ids.map(bien_id => ({
    client_id: v.clientId, recherche_id: v.rechercheId || null, bien_id, statut: 'a_venir',
    date_visite: v.date || null, heure: v.heure || null,
    contact_agence: v.contact || null, commentaire: v.notes || null,
    ...(v.duree ? { duree_min: v.duree } : {}),
  })));
  if (errVis) { alert("La visite n'a pas pu être enregistrée.\n\n" + errVis.message); return false; }
  /* V3.50 : un bien « Offre faite » le reste (même règle que le compte
     rendu, badgeApresVisite). Une 2e visite effaçait l'offre, dans le CRM
     comme dans son espace, alors que la transaction restait ouverte. */
  await verifie('La visite est enregistrée, mais l’état « visite » des biens', supabase.from('biens').update({ badge_retour: 'souhaite_visiter' })
    .in('id', ids).or('badge_retour.is.null,badge_retour.neq.offre_faite'));
  /* S'il l'avait demandée depuis son espace, la demande est servie : la
     relance « Veut visiter » se solde, et la page Visites la range dans
     « À venir ». */
  const errRel = await solderRelancesVisite(v.clientId, ids.map(titre));
  if (errRel) alert("La visite est enregistrée, mais la relance « Veut visiter » n'a pas pu être soldée.\n\n" + errRel);
  /* Une 2e visite répond à « Veut revoir » et « Il réfléchit » ; « Veut
     faire une offre » reste, l'offre n'est pas encore là (V3.50). */
  if (v.revus.length) {
    const errRetour = await solderRelancesRetourVisite(v.clientId, v.revus.map(titre), { garder: 'offre' });
    if (errRetour) signalerEchec('La visite est enregistrée, mais les relances « Veut revoir » de ce bien', errRetour);
  }
  const noms = ids.map(id => { const b = v.biens.find(x => x.id === id); return b?.titre || b?.ville || 'Bien'; }).join(' · ');
  const desc = [v.date ? `Le ${new Date(v.date).toLocaleDateString('fr-FR')}` : '', v.heure ? `à ${v.heure}` : '', v.contact ? `· Contact : ${v.contact}` : ''].filter(Boolean).join(' ');
  await addJournal(v.clientId, 'visite_planifiee',
    ids.length > 1 ? `📅 Visite planifiée — ${ids.length} biens : ${noms}` : `📅 Visite planifiée — ${noms}`,
    desc, undefined, { rechercheId: v.rechercheId });
  return true;
}
