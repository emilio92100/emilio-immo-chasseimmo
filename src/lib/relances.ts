import { signalerEchec, verifie } from './ecritures';
import { supabase } from '@/lib/supabase';
import { relanceAGarder } from './relances-garder';
export { relanceAGarder };

/**
 * Les relances, côté CRM.
 *
 * Jusqu'ici l'écran Relances promettait qu'une relance apparaissait « J+5
 * après chaque envoi », alors que RIEN n'en créait : le seul J+5 du produit
 * était un clic manuel. Il n'y a pas de serveur de tâches planifiées sur ce
 * projet, donc la relance se programme au moment où l'on sait qu'elle sera
 * due : à l'envoi. Elle se clôture toute seule dès que le client répond.
 *
 * ⚠️ Colonnes réelles de la table : `date_echeance`, `note`, `statut`.
 * Le statut `reportee` est déclaré dans les types mais n'est lu par aucun
 * écran : ne jamais l'écrire, la relance disparaîtrait de partout.
 */

/* Le délai vient des Paramètres, avec 5 jours pour repli — la valeur que
   l'écran de réglages annonce comme recommandée. Il était codé en dur. */
export async function delaiRelance(): Promise<number> {
  try {
    const { data } = await supabase.from('parametres')
      .select('valeur').eq('cle', 'delai_relance_jours').maybeSingle();
    const n = parseInt(String(data?.valeur ?? ''), 10);
    return Number.isFinite(n) && n >= 1 && n <= 90 ? n : 5;
  } catch {
    return 5;
  }
}

/* Midi, et pas l'heure courante : une échéance calculée à 1h du matin heure
   de Paris retombait la veille une fois convertie en UTC, et la relance
   arrivait un jour trop tôt. */
export function echeanceDans(jours: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + jours);
  return d.toISOString();
}

/* Reporter une relance à un autre jour, à midi (V3.85 : depuis la frise du
   Suivi, comme depuis la page Relances). Elle doit encore attendre : une
   relance close entre-temps n'est pas rouverte. */
export async function reporterRelance(id: string, jour: string): Promise<boolean> {
  if (!jour) return false;
  return verifie('Le report de la relance', supabase.from('relances')
    .update({ date_echeance: new Date(`${jour}T12:00:00`).toISOString() })
    .eq('id', id).eq('statut', 'en_attente').select('id'), { ligne: true });
}

async function relanceAutoEnCours(clientId: string, rechercheId: string | null) {
  let q = supabase.from('relances')
    .select('id')
    .eq('client_id', clientId)
    .eq('type', 'auto')
    .eq('statut', 'en_attente');
  if (rechercheId) q = q.eq('recherche_id', rechercheId);
  const { data } = await q.limit(1);
  return data?.[0]?.id as string | undefined;
}

/**
 * Programme la relance qui suit une présentation de biens.
 *
 * Une seule relance par dossier, jamais une par bien : envoyer six biens ne
 * doit pas remplir l'écran de six lignes identiques. Si une relance
 * automatique attend déjà pour cette recherche, on repousse son échéance
 * plutôt que d'en empiler une deuxième.
 */
export async function programmerRelance(
  clientId: string,
  rechercheId: string | null,
  nbBiens: number,
): Promise<void> {
  try {
    const jours = await delaiRelance();
    const quand = echeanceDans(jours);
    const note = nbBiens > 1
      ? `${nbBiens} biens présentés, sans réponse du client`
      : 'Bien présenté, sans réponse du client';

    /* Une relance qui ne se crée pas ne doit jamais faire échouer un envoi
       qui, lui, est bien parti — mais elle doit se voir (V3.17) : un message
       dans le CRM, une ligne dans les journaux du serveur. */
    const existante = await relanceAutoEnCours(clientId, rechercheId);
    if (existante) {
      const { error } = await supabase.from('relances')
        .update({ date_echeance: quand, note }).eq('id', existante);
      if (error) signalerEchec('L’envoi est parti, mais la relance automatique', error.message);
      return;
    }
    const { error } = await supabase.from('relances').insert({
      client_id: clientId, recherche_id: rechercheId,
      type: 'auto', statut: 'en_attente',
      date_echeance: quand, note,
    });
    if (error) signalerEchec('L’envoi est parti, mais la relance automatique', error.message);
  } catch (e) {
    signalerEchec('L’envoi est parti, mais la relance automatique', (e as Error)?.message || '');
  }
}

/**
 * Le client a répondu : la relance automatique n'a plus lieu d'être.
 * On ne touche jamais aux relances manuelles — celles-là, c'est Alexandre
 * qui les a posées, et lui seul décide de les clôturer.
 */
export async function cloturerRelancesAuto(
  clientId: string,
  rechercheId?: string | null,
): Promise<void> {
  try {
    let q = supabase.from('relances')
      .update({ statut: 'cloturee' })
      .eq('client_id', clientId)
      .eq('type', 'auto')
      .eq('statut', 'en_attente');
    if (rechercheId) q = q.eq('recherche_id', rechercheId);
    const { error } = await q;
    /* Sans effet sur le reste : la relance restera à clôturer à la main, mais on le dit. */
    if (error) signalerEchec('La clôture des relances automatiques', error.message);
  } catch (e) {
    signalerEchec('La clôture des relances automatiques', (e as Error)?.message || '');
  }
}

/* Les relances d'un acheteur dont le dossier se clôt (acte signé, dossier
   clôturé, bien trouvé, perdu). S'il vend aussi un bien avec nous, ses
   relances de vendeur (réponse à une offre, rappels du compromis, notes sans
   recherche) restent : seules celles de ses recherches se soldent (V3.47).
   V3.50 : la fiche acheteur soldait tout, relances de vendeur comprises —
   une seule règle désormais, ici, pour le bien comme pour la fiche. */
export async function solderRelancesAcheteur(clientId: string, rechercheId?: string | null): Promise<void> {
  try {
    const v = await supabase.from('biens_vente').select('id').eq('client_id', clientId).not('etape', 'in', '(vendu,retire)').limit(1);
    if (v.error) signalerEchec('Les biens en vente de l’acheteur', v.error.message);
    let q = supabase.from('relances').select('id, note').eq('client_id', clientId).eq('statut', 'en_attente');
    if (rechercheId) q = q.eq('recherche_id', rechercheId);
    else if (v.error || v.data?.length) q = q.not('recherche_id', 'is', null);
    const { data, error: eL } = await q;
    if (eL) { signalerEchec('Les relances de l’acheteur', eL.message); return; }
    const ids = ((data || []) as { id: string; note: string | null }[]).filter(r => !relanceAGarder(r.note)).map(r => r.id);
    if (!ids.length) return;
    const { error } = await supabase.from('relances').update({ statut: 'cloturee' }).in('id', ids).eq('statut', 'en_attente');
    if (error) signalerEchec('Les relances de l’acheteur', error.message);
  } catch (e) {
    signalerEchec('Les relances de l’acheteur', (e as Error)?.message || '');
  }
}

/* ═══ V3.73 — Le tri d'après l'import ═════════════════════════════════════
   Des contacts repris d'ImmoFacile sans nouvelles depuis longtemps : un
   dernier appel pour savoir s'ils restent dans le fichier. Leur relance
   porte cette note. La page Relances les range à part (« Tri à faire ») et
   les pastilles ne les comptent pas (Alexandre : « pas envie qu'ils se
   mélangent avec les contacts dont les relances sont à jour »). */
export const NOTE_TRI = 'Dernier appel pour faire le tri — ';
export const estTri = (note: unknown) => String(note || '').startsWith(NOTE_TRI);

/* Les relances dues, en retard ou du jour, sans celles du tri : la pastille
   du menu et celle de la barre du haut. Fin de journée, pour que celles du
   jour comptent quelle que soit l'heure. */
export async function compterRelancesDues(): Promise<number> {
  const finDuJour = new Date(); finDuJour.setHours(23, 59, 59, 999);
  const { data } = await supabase.from('relances').select('note')
    .eq('statut', 'en_attente').lte('date_echeance', finDuJour.toISOString()).limit(5000);
  return ((data || []) as { note: string | null }[]).filter(r => !estTri(r.note)).length;
}

/* Archiver un contact (V3.73) : ses relances en attente se ferment — un
   contact rangé dans « Archivés » ne remonte plus dans Relances —, sauf
   celles qu'une clôture ne ferme jamais (un compromis, l'agenda). Rend le
   nombre de relances fermées (pour pouvoir annuler), ou le message d'erreur. */
export async function cloreRelancesArchive(clientId: string): Promise<{ ids: string[]; erreur: string }> {
  try {
    const { data, error } = await supabase.from('relances').select('id, note').eq('client_id', clientId).eq('statut', 'en_attente');
    if (error) return { ids: [], erreur: error.message };
    const ids = ((data || []) as { id: string; note: string | null }[]).filter(r => !relanceAGarder(r.note)).map(r => r.id);
    if (!ids.length) return { ids: [], erreur: '' };
    const rep = await supabase.from('relances').update({ statut: 'cloturee' }).in('id', ids).eq('statut', 'en_attente').select('id');
    if (rep.error) return { ids: [], erreur: rep.error.message };
    return { ids: ((rep.data || []) as { id: string }[]).map(r => r.id), erreur: '' };
  } catch (e) {
    return { ids: [], erreur: (e as Error)?.message || 'erreur inconnue' };
  }
}
