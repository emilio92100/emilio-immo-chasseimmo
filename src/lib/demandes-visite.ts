import { supabase } from '@/lib/supabase';

/* ── Les demandes de visite en attente ───────────────────────────────
   Quand un client appuie sur « Je souhaite le visiter » dans son espace, la
   route /api/espace/retour écrit une ligne au journal (type « retour_client »,
   titre « 👀 Il veut visiter — depuis son espace », avec le bien et ses
   disponibilités) et passe le bien en « souhaite_visiter ».

   Une demande reste en attente tant que :
   - le bien est toujours marqué « souhaite_visiter » (s'il a changé d'avis,
     ou si la visite a eu lieu, le bien a changé d'état) ;
   - aucune visite ne lui répond : une visite « à venir » sur ce bien, ou une
     visite faite depuis la demande. Une visite annulée ne compte pas : la
     demande revient, il faut toujours lui trouver une date ;
   - le client est toujours actif (un dossier clos ne demande plus rien).

   La page Visites en fait sa rubrique « Demandes de visite », et le menu
   en tire sa pastille rouge. Une seule source pour les deux. */

export type DemandeVisite = {
  id: string;               // la ligne du journal
  quand: string;            // la date de la demande
  dispos: string | null;    // ce qu'il a écrit : disponibilités, remarque
  rechercheId: string | null;
  bien: {
    id: string; titre: string | null; ville: string | null; quartier: string | null;
    photos: string[] | null; prix: number | null; surface: number | null; nb_pieces: number | null;
  };
  client: any;              // la ligne complète : la fiche s'ouvre avec
};

export async function chargerDemandesVisite(): Promise<DemandeVisite[]> {
  const { data: lignes, error } = await supabase.from('journal')
    .select('id, client_id, bien_id, recherche_id, description, created_at')
    .eq('type', 'retour_client').ilike('titre', '%veut visiter%')
    .not('bien_id', 'is', null)
    .order('created_at', { ascending: false }).limit(300);
  if (error || !lignes?.length) return [];

  /* Une demande par bien : la plus récente (il a pu cliquer deux fois). */
  const parBien = new Map<string, any>();
  for (const l of lignes) if (l.bien_id && !parBien.has(l.bien_id)) parBien.set(l.bien_id, l);
  const ids = [...parBien.keys()];

  const [{ data: biens, error: eB }, { data: visites, error: eV }] = await Promise.all([
    supabase.from('biens')
      .select('id, titre, ville, quartier, photos, prix_acquereur, prix_vendeur, surface, nb_pieces, badge_retour')
      .in('id', ids),
    supabase.from('visites').select('bien_id, statut, date_visite').in('bien_id', ids).neq('statut', 'annulee'),
  ]);
  if (eB || eV) return [];

  const repondue = (bienId: string, depuis: string) => (visites || []).some((v: any) =>
    v.bien_id === bienId && (v.statut === 'a_venir'
      || (v.statut === 'effectuee' && String(v.date_visite || '').slice(0, 10) >= depuis.slice(0, 10))));

  const enAttente = (biens || []).filter((b: any) =>
    b.badge_retour === 'souhaite_visiter' && !repondue(b.id, parBien.get(b.id).created_at));
  if (!enAttente.length) return [];

  const idsClients = [...new Set(enAttente.map((b: any) => parBien.get(b.id).client_id).filter(Boolean))];
  const { data: clients, error: eC } = await supabase.from('clients').select('*').in('id', idsClients);
  if (eC) return [];
  const client = new Map((clients || []).map((c: any) => [c.id, c]));

  return enAttente
    .map((b: any) => {
      const l = parBien.get(b.id);
      return {
        id: l.id, quand: l.created_at, dispos: l.description || null, rechercheId: l.recherche_id || null,
        bien: {
          id: b.id, titre: b.titre, ville: b.ville, quartier: b.quartier, photos: b.photos,
          prix: b.prix_acquereur || b.prix_vendeur || null, surface: b.surface, nb_pieces: b.nb_pieces,
        },
        client: client.get(l.client_id),
      };
    })
    .filter((d: DemandeVisite) => d.client && d.client.statut === 'actif')
    /* La plus ancienne d'abord : c'est celle qui attend depuis le plus longtemps. */
    .sort((a: DemandeVisite, b: DemandeVisite) => a.quand.localeCompare(b.quand));
}

/* Une visite vient d'être calée sur ces biens : la relance « Veut visiter »
   posée par l'espace n'a plus d'objet, on la solde — sinon elle resterait en
   rouge dans Relances alors que la visite est dans l'agenda. On ne touche
   qu'à celles-là (type rappel_client, note « Veut visiter — <titre> »).
   Rend le message d'erreur, ou null. */
export async function solderRelancesVisite(clientId: string, titres: (string | null | undefined)[]): Promise<string | null> {
  const echappe = (t: string) => t.replace(/[\\%_]/g, (c) => '\\' + c);
  for (const t of new Set(titres.map((x) => x || 'un bien'))) {
    const { error } = await supabase.from('relances').update({ statut: 'cloturee' })
      .eq('client_id', clientId).eq('type', 'rappel_client').eq('statut', 'en_attente')
      .ilike('note', `Veut visiter — ${echappe(t)}%`);
    if (error) return error.message;
  }
  return null;
}
