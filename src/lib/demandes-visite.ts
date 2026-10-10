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
   - le client est toujours actif (un dossier clos ne demande plus rien) ;
   - pour un bien de l'agence, il est encore en vente (V3.50).

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
    /* V3.129 : un mandat de l'agence — la page Visites vérifie qu'il est encore en vente avant de caler. */
    bien_vente_id?: string | null;
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
      .select('id, titre, ville, quartier, photos, prix_acquereur, prix_vendeur, surface, nb_pieces, badge_retour, bien_vente_id')
      .in('id', ids),
    supabase.from('visites').select('bien_id, statut, date_visite').in('bien_id', ids).neq('statut', 'annulee'),
  ]);
  if (eB || eV) return [];

  /* V3.50 : un bien de l'agence vendu, retiré, suspendu ou archivé ne se
     visite plus. Ses visites prévues s'annulent à la vente, mais le bien
     restait « veut visiter » chez l'acheteur : la demande revenait dans
     Visites › Demandes et dans la pastille rouge du menu. Une lecture qui
     échoue ne retire rien (la demande reste visible, comme avant). */
  const idsVente = [...new Set(((biens || []) as { bien_vente_id?: string | null }[]).map(b => b.bien_vente_id).filter((x): x is string => !!x))];
  const horsVente = new Set<string>();
  if (idsVente.length) {
    const { data: bv, error: eBv } = await supabase.from('biens_vente').select('id, etape, archive').in('id', idsVente);
    if (!eBv) for (const x of (bv || []) as { id: string; etape: string | null; archive: boolean | null }[]) {
      if (x.archive || x.etape === 'vendu' || x.etape === 'retire' || x.etape === 'suspendu') horsVente.add(x.id);
    }
  }

  /* V3.164 : un bien trouvé ailleurs, dit « plus disponible » par Alexandre
     (biens.indispo) : sa demande n'a plus d'objet. Lu à part, sans rien
     bloquer : avant le SQL (outils/sql/biens-indispo.sql), la colonne
     n'existe pas et rien n'est retiré. */
  const indispos = new Set<string>();
  {
    const { data: ind, error: eI } = await supabase.from('biens').select('id, indispo').in('id', ids);
    if (!eI) for (const x of (ind || []) as { id: string; indispo: unknown }[]) if (x.indispo) indispos.add(x.id);
  }
  const repondue = (bienId: string, depuis: string) => (visites || []).some((v: any) =>
    v.bien_id === bienId && (v.statut === 'a_venir'
      || (v.statut === 'effectuee' && String(v.date_visite || '').slice(0, 10) >= depuis.slice(0, 10))));

  const enAttente = (biens || []).filter((b: any) =>
    b.badge_retour === 'souhaite_visiter' && !(b.bien_vente_id && horsVente.has(b.bien_vente_id)) && !indispos.has(b.id)
    && !repondue(b.id, parBien.get(b.id).created_at));
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
          bien_vente_id: b.bien_vente_id || null,
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

/* V3.50 — Les relances nées de l'avis du client après une visite
   (« Veut faire une offre — <bien> », « Veut revoir — <bien> », « Il réfléchit
   — <bien> », posées par /api/espace/visite) ne se fermaient jamais seules.
   Elles se soldent quand la suite arrive : l'offre est enregistrée, une
   2e visite est prévue, ou le compte rendu d'Alexandre change l'issue.
   `garder` : l'issue qui reste d'actualité (sa relance n'est pas touchée).
   Rend le message d'erreur, ou null. */
export const TETES_RETOUR_VISITE = { offre: 'Veut faire une offre', revoir: 'Veut revoir', reflexion: 'Il réfléchit' } as const;
export async function solderRelancesRetourVisite(
  clientId: string,
  titres: (string | null | undefined)[],
  o: { garder?: keyof typeof TETES_RETOUR_VISITE | null } = {},
): Promise<string | null> {
  const echappe = (t: string) => t.replace(/[\\%_]/g, (c) => '\\' + c);
  const tetes = (Object.keys(TETES_RETOUR_VISITE) as (keyof typeof TETES_RETOUR_VISITE)[])
    .filter((k) => k !== o.garder).map((k) => TETES_RETOUR_VISITE[k]);
  for (const t of new Set(titres.map((x) => x || 'un bien'))) {
    for (const tete of tetes) {
      const { error } = await supabase.from('relances').update({ statut: 'cloturee' })
        .eq('client_id', clientId).eq('type', 'rappel_client').eq('statut', 'en_attente')
        .ilike('note', `${tete} — ${echappe(t)}%`);
      if (error) return error.message;
    }
  }
  return null;
}
