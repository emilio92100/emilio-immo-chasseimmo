import { addJournal, supabase } from '@/lib/supabase';
import { signalerEchec } from '@/lib/ecritures';

/* ═══ Annuler une visite : une seule façon de faire (V3.50) ═══════════════
   Avant, chaque écran annulait à sa manière : l'agenda fermait le rappel et
   notait la ligne au Suivi, la page Visites ne faisait que changer le statut,
   la fiche acheteur notait une ligne du mauvais type, la fiche d'un bien
   vendu oubliait le rappel. Résultat : des « Rendez-vous : Visite … » restés
   dans les Relances pour des visites qui n'existaient plus.

   Ici, pour les visites d'acheteurs suivis (table `visites`) :
   1. elles passent « annulée » — seulement celles encore « à venir » : une
      visite faite entre-temps ne se défait pas ;
   2. leur rappel (« Rendez-vous : Visite … », `rappel_relance_id`) se ferme,
      sauf si une autre visite encore prévue s'en sert ;
   3. une ligne « Visite annulée » au Suivi de l'acheteur, dans sa recherche.
   Rend le nombre de visites annulées. Ne lève jamais : un échec se voit
   (message rouge) et l'appelant décide s'il continue. */

type VisiteLue = {
  id: string; client_id: string | null; recherche_id: string | null; bien_id: string | null;
  date_visite: string | null; heure: string | null; rappel_relance_id: string | null;
  biens?: { titre?: string | null; ville?: string | null } | null;
};

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function quand(v: { date_visite: string | null; heure: string | null }): string {
  if (!v.date_visite) return '';
  const [a, m, j] = v.date_visite.slice(0, 10).split('-').map(Number);
  const h = v.heure && /^\d{2}:\d{2}/.test(v.heure) ? ` à ${v.heure.slice(0, 5).replace(':', ' h ')}` : '';
  return `Prévue le ${j} ${MOIS[(m || 1) - 1]} ${a}${h}.`;
}

export async function annulerVisites(ids: string[], o: { pourquoi?: string; journal?: boolean } = {}): Promise<number> {
  const liste = Array.from(new Set(ids.filter(Boolean)));
  if (!liste.length) return 0;
  try {
    const { data, error } = await supabase.from('visites')
      .select('id, client_id, recherche_id, bien_id, date_visite, heure, rappel_relance_id, biens(titre, ville)')
      .in('id', liste).eq('statut', 'a_venir');
    if (error) { signalerEchec('L’annulation de la visite', error.message); return 0; }
    const aAnnuler = (data || []) as unknown as VisiteLue[];
    if (!aAnnuler.length) return 0;

    const maj = await supabase.from('visites').update({ statut: 'annulee' })
      .in('id', aAnnuler.map(v => v.id)).eq('statut', 'a_venir').select('id');
    if (maj.error) { signalerEchec('L’annulation de la visite', maj.error.message); return 0; }
    const faites = new Set(((maj.data || []) as { id: string }[]).map(x => x.id));
    if (!faites.size) {
      signalerEchec('L’annulation de la visite', 'aucune ligne n’a été modifiée. La session a peut-être expiré : recharge la page, puis recommence.');
      return 0;
    }
    const annulees = aAnnuler.filter(v => faites.has(v.id));

    /* Les rappels : fermés quand plus aucune visite prévue ne s'en sert. */
    const rappels = Array.from(new Set(annulees.map(v => v.rappel_relance_id).filter((x): x is string => !!x)));
    if (rappels.length) {
      const encore = await supabase.from('visites').select('rappel_relance_id')
        .in('rappel_relance_id', rappels).eq('statut', 'a_venir');
      if (encore.error) signalerEchec('Le rappel de la visite annulée', encore.error.message);
      else {
        const gardes = new Set(((encore.data || []) as { rappel_relance_id: string | null }[]).map(x => x.rappel_relance_id));
        const aFermer = rappels.filter(r => !gardes.has(r));
        if (aFermer.length) {
          const r = await supabase.from('relances').update({ statut: 'cloturee' }).in('id', aFermer).eq('statut', 'en_attente');
          if (r.error) signalerEchec('C’est annulé, mais le rappel de la visite est resté dans tes Relances', r.error.message);
        }
      }
    }

    if (o.journal !== false) {
      for (const v of annulees) {
        if (!v.client_id) continue;
        const titre = v.biens?.titre || v.biens?.ville || 'le bien';
        await addJournal(v.client_id, 'visite_annulee', `✕ Visite annulée — ${titre}`,
          [quand(v), o.pourquoi || ''].filter(Boolean).join(' '), undefined,
          { rechercheId: v.recherche_id, bienId: v.bien_id });
      }
    }
    return annulees.length;
  } catch (e) {
    signalerEchec('L’annulation de la visite', (e as Error)?.message || '');
    return 0;
  }
}
