/* ═══ Supprimer ou archiver plusieurs contacts d'un coup (V3.88) ═══════════
   La sélection de la liste des contacts (src/components/shared/Selection.tsx).
   Mêmes règles que les fiches (FicheClient : doSupprimerClient ;
   FicheContact : supprimer) :

   · on ne supprime pas un contact relié à un bien de la rubrique Biens, à un
     document, ou qui a une vente signée (elle compte dans le chiffre
     d'affaires) : il est laissé de côté, « archive-le plutôt » ;
   · sinon, tout ce qui pointe vers lui part d'abord, dans l'ordre (comme la
     fiche d'un acheteur : son journal, ses relances, ses rendez-vous, ses
     visites, ses envois, ses transactions, sa veille, ses biens proposés et
     leurs photos, ses recherches), puis la fiche, en vérifiant qu'elle est
     bien partie (la base fermée refuse parfois sans erreur).

   ⚠️ Si une étape est ajoutée à la suppression de FicheClient, l'ajouter ici. */

import { supabase, addJournal } from '@/lib/supabase';
import { effacerPhotosDeBiens } from '@/lib/photos';
import { cloreRelancesArchive } from '@/lib/relances';

const absente = (m: string) => /does not exist|schema cache/i.test(m || '');

/* Pourquoi ce contact ne peut pas être supprimé (null : il peut l'être). */
export async function empecheSuppression(id: string): Promise<string | null> {
  const compter = async (table: string, filtre?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let q = supabase.from(table).select('id', { count: 'exact', head: true }).eq('client_id', id);
    if (filtre) q = filtre(q);
    const { count, error } = await q;
    if (error && !absente(error.message)) throw new Error(error.message);
    return error ? 0 : count || 0;
  };
  try {
    const [biens, docs, ventes] = await Promise.all([
      compter('biens_vente'),
      compter('documents'),
      compter('transactions', q => q.eq('etape_actuelle', 'finalise')),
    ]);
    if (ventes) return 'Une vente signée : elle compte dans ton chiffre d’affaires. Archive-le plutôt.';
    if (biens) return `Propriétaire de ${biens > 1 ? `${biens} biens` : 'un bien'} dans « Biens ». Archive-le plutôt.`;
    if (docs) return `Relié à ${docs > 1 ? `${docs} documents` : 'un document'}. Archive-le plutôt.`;
    return null;
  } catch (e) {
    return `Ce qui lui est relié n’a pas pu être vérifié (${(e as Error).message}).`;
  }
}

/* Tout effacer, dans l'ordre. Lève une erreur claire si une étape échoue :
   rien d'autre n'est touché après elle. */
export async function effacerContact(id: string): Promise<void> {
  const { data: rech } = await supabase.from('recherches').select('id').eq('client_id', id);
  const rIds = ((rech || []) as { id: string }[]).map(r => r.id);
  const { data: lot } = await supabase.from('biens').select('photos, plans').eq('client_id', id);
  const etapes: { quoi: string; faire: () => PromiseLike<{ error: { message: string } | null; data?: unknown }> }[] = [
    { quoi: 'son historique', faire: () => supabase.from('journal').delete().eq('client_id', id) },
    { quoi: 'ses relances', faire: () => supabase.from('relances').delete().eq('client_id', id) },
    { quoi: 'ses rendez-vous', faire: () => supabase.from('rendez_vous').delete().eq('client_id', id) },
    { quoi: 'ses visites', faire: () => supabase.from('visites').delete().eq('client_id', id) },
    { quoi: 'ses envois', faire: () => supabase.from('envois').delete().eq('client_id', id) },
    { quoi: 'ses transactions', faire: () => supabase.from('transactions').delete().eq('client_id', id) },
    { quoi: 'ses propositions de veille', faire: () => supabase.from('veille_propositions').delete().eq('client_id', id) },
    { quoi: 'les événements de son espace', faire: () => supabase.from('espace_evenements').delete().eq('client_id', id) },
    { quoi: 'ses passages de veille', faire: () => (rIds.length ? supabase.from('veille_passages').delete().in('recherche_id', rIds) : Promise.resolve({ error: null })) },
    { quoi: 'ses biens proposés', faire: () => supabase.from('biens').delete().eq('client_id', id) },
    { quoi: 'ses recherches', faire: () => supabase.from('recherches').delete().eq('client_id', id) },
  ];
  for (const e of etapes) {
    const { error } = await e.faire();
    if (error && !absente(error.message)) throw new Error(`arrêté sur ${e.quoi} : ${error.message}`);
  }
  const { data, error } = await supabase.from('clients').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || !(data as unknown[]).length) throw new Error('la base n’a rien effacé (session expirée ? recharge la page)');
  try { await effacerPhotosDeBiens((lot || []) as { photos?: unknown; plans?: unknown }[]); } catch { /* le ménage du stockage ne bloque rien */ }
}

/* Archiver (ou sortir des archives), comme la fiche (basculerArchive) : la
   fiche, sa veille arrêtée, ses relances en attente qui se ferment
   (cloreRelancesArchive), une ligne dans son Suivi. */
export async function archiverContact(id: string, archive: boolean): Promise<void> {
  const { data, error } = await supabase.from('clients').update({ archive, updated_at: new Date().toISOString() }).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || !(data as unknown[]).length) throw new Error('la base n’a rien modifié (session expirée ? recharge la page)');
  if (archive) {
    /* Comme la fiche d'un acheteur : sa veille s'arrête (rien pour un autre contact). */
    const v = await supabase.from('recherches').update({ active: false }).eq('client_id', id);
    if (v.error && !absente(v.error.message)) throw new Error(`archivé, mais sa veille : ${v.error.message}`);
    const { erreur } = await cloreRelancesArchive(id);
    if (erreur) throw new Error(`archivé, mais ses relances : ${erreur}`);
  }
  await addJournal(id, 'statut_change', archive ? 'Contact archivé' : 'Contact sorti des archives',
    archive ? 'Archivé depuis la liste, avec d’autres contacts : la veille est arrêtée et ses relances en attente sont fermées.' : 'Rien n’est remis en marche : choisis son état.', { archive });
}
