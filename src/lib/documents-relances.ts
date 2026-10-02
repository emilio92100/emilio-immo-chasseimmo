/* ═══ Les relances « n'a pas signé dans les 15 jours » (V3.50) ═════════════
   Quand un lien de signature expire, le rappel du matin
   (/api/mandat/relances) pose une relance à Alexandre : « X n'a pas signé
   <le document> dans les 15 jours : nouveau lien, ou signature arrêtée ? ».
   Elle restait ouverte pour toujours, même une fois le document signé, la
   signature arrêtée, un nouveau lien parti ou l'invitation close. Elle se
   ferme maintenant avec la suite.

   La relance n'a pas de colonne qui la relie au document : on la reconnaît
   à sa note (« <qui> n'a pas signé <le document> … »). Navigateur et
   serveur : la base se lit par le client reçu. Rend le message d'erreur, ou
   null. */

import type { SupabaseClient } from '@supabase/supabase-js';

/* `quoi` : le document tel que la note le cite (« le mandat de vente n° 12 »,
   « le mandat n° 4412 » pour un co-signataire) ; `qui` : un seul signataire
   (son nouveau lien), sinon toutes celles de ce document. */
export async function solderRelancesSignature(sb: SupabaseClient, o: { clientId: string | null | undefined; quoi: string; qui?: string }): Promise<string | null> {
  if (!o.clientId || !o.quoi) return null;
  const { data, error } = await sb.from('relances').select('id, note')
    .eq('client_id', o.clientId).eq('type', 'rappel_client').eq('statut', 'en_attente').ilike('note', '%n\'a pas signé%');
  if (error) return error.message;
  /* L'espace après le nom du document : « n° 12 » ne prend pas « n° 123 ». */
  const motif = `n'a pas signé ${o.quoi} `;
  const ids = ((data || []) as { id: string; note: string | null }[])
    .filter(r => { const n = String(r.note || ''); return n.includes(motif) && (!o.qui || n.startsWith(`${o.qui} ${motif}`)); })
    .map(r => r.id);
  if (!ids.length) return null;
  const { error: e2 } = await sb.from('relances').update({ statut: 'cloturee' }).in('id', ids).eq('statut', 'en_attente');
  return e2 ? e2.message : null;
}
