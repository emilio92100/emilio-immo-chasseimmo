import { supabase } from '@/lib/supabase';

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

    const existante = await relanceAutoEnCours(clientId, rechercheId);
    if (existante) {
      await supabase.from('relances')
        .update({ date_echeance: quand, note }).eq('id', existante);
      return;
    }
    await supabase.from('relances').insert({
      client_id: clientId, recherche_id: rechercheId,
      type: 'auto', statut: 'en_attente',
      date_echeance: quand, note,
    });
  } catch {
    /* Une relance qui ne se crée pas ne doit jamais faire échouer un envoi
       qui, lui, est bien parti. */
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
    await q;
  } catch {
    /* Sans effet : la relance restera à clôturer à la main. */
  }
}
