import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import EspaceClient from '@/components/espace/EspaceClient';

/**
 * Espace acheteur — /espace/<token>
 *
 * Aucun compte, aucun mot de passe : le lien EST l'identification.
 * Il est tiré au hasard sur 64 caractères et rangé sur la recherche.
 *
 * Cette page est publique (voir src/proxy.ts). Tout ce qu'elle lit passe
 * par le serveur : le navigateur du client ne reçoit que ce qui le regarde.
 */

export const dynamic = 'force-dynamic';

function base() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, cle);
}

const ETAT = (b: { vu_le?: string | null; badge_retour?: string | null }) => {
  if (!b.vu_le) return 'neuf';
  if (!b.badge_retour || b.badge_retour === 'propose') return 'vu';
  return 'avis';
};

export default async function PageEspace({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 32) notFound();

  const supabase = base();

  const { data: recherche } = await supabase
    .from('recherches')
    .select('*, clients(id, prenom, nom, reference, created_at)')
    .eq('token_espace', token)
    .maybeSingle();

  if (!recherche || recherche.espace_actif === false) notFound();
  const client = (recherche as any).clients;

  const [biensRes, passagesRes, totalRes, visitesRes] = await Promise.all([
    supabase.from('biens').select('*').eq('recherche_id', recherche.id).eq('etape', 'presente')
      .order('envoye_le', { ascending: false, nullsFirst: false }),
    supabase.from('veille_passages').select('*').eq('recherche_id', recherche.id)
      .order('termine_le', { ascending: false, nullsFirst: false }).limit(7),
    /* Tous les passages du dossier, pour le total d'annonces lues. On ne tire
       qu'une colonne d'entiers : même après des années, c'est quelques kilo-octets. */
    supabase.from('veille_passages').select('nb_lues, nb_proposees, nb_ecartees').eq('recherche_id', recherche.id),
    /* Les visites calées et pas encore faites : c'est ce que le client attend
       de voir en premier quand il ouvre son espace. */
    supabase.from('visites').select('*').eq('recherche_id', recherche.id)
      .eq('statut', 'a_venir').order('date_visite', { ascending: true }),
  ]);
  const tous = totalRes.data || [];
  const totalLues = tous.reduce((t, x) => t + (x.nb_lues || 0), 0);
  const totalRetenues = tous.reduce((t, x) => t + (x.nb_proposees || 0), 0);
  const totalEcartees = tous.reduce((t, x) => t + (x.nb_ecartees || 0), 0);
  const nbPassages = tous.length;

  const biens = (biensRes.data || []).map((b) => ({
    id: b.id,
    titre: b.titre || `${b.type_bien || 'Bien'} — ${b.ville || ''}`,
    secteur: [b.quartier || b.adresse_probable, b.ville].filter(Boolean).join(', ') || b.ville || '',
    prix: b.prix_acquereur || b.prix_vendeur,
    surface: b.surface, pieces: b.nb_pieces, chambres: b.nb_chambres,
    etage: b.etage, etageTotal: b.etage_total, expo: b.exposition,
    dpe: b.dpe, ges: b.ges, annee: b.annee_construction,
    description: b.description, photos: b.photos || [],
    terrasse: b.terrasse, balcon: b.balcon, jardin: b.jardin, parking: b.parking,
    ascenseur: b.ascenseur, cave: b.cave,
    pdfUrl: b.pdf_statut === 'pret' ? b.pdf_url : null,
    envoyeLe: b.envoye_le, vuLe: b.vu_le,
    avis: b.badge_retour, commentaire: b.retour_client, retourLe: b.retour_le,
    etat: ETAT(b),
  }));

  /* Une visite sans date ne sert à rien à l'écran, et une visite passée depuis
     plus d'un jour non plus : le compte rendu prend le relais côté CRM. */
  const hier = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const visites = (visitesRes.data || [])
    .filter((v) => v.date_visite && String(v.date_visite).slice(0, 10) >= hier)
    .map((v) => {
      const b = (biensRes.data || []).find((x) => x.id === v.bien_id);
      return {
        id: v.id,
        date: v.date_visite as string,
        heure: (v.heure as string) || null,
        titre: b?.titre || `${b?.type_bien || 'Bien'} — ${b?.ville || ''}`,
        adresse: [b?.adresse || b?.adresse_probable || b?.quartier, b?.ville].filter(Boolean).join(', '),
        bienId: v.bien_id as string | null,
      };
    });

  const passages = passagesRes.data || [];
  const dernier = passages[0] || null;

  const jours = client?.created_at
    ? Math.max(1, Math.round((Date.now() - new Date(client.created_at).getTime()) / 86400000))
    : null;

  // ─── on note le passage, sans spammer le journal ───
  try {
    await supabase.from('recherches')
      .update({ espace_ouvert_le: new Date().toISOString() })
      .eq('id', recherche.id);

    const { data: derniere } = await supabase.from('espace_evenements')
      .select('created_at').eq('recherche_id', recherche.id).eq('type', 'ouverture')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    const recent = derniere && Date.now() - new Date(derniere.created_at).getTime() < 30 * 60 * 1000;
    if (!recent) {
      await supabase.from('espace_evenements').insert({
        recherche_id: recherche.id, client_id: recherche.client_id,
        type: 'ouverture', detail: null,
      });
    }
  } catch { /* le journal ne doit jamais empêcher la page de s'afficher */ }

  return (
    <EspaceClient
      token={token}
      client={{ prenom: client?.prenom || '', nom: client?.nom || '', reference: client?.reference || '', jours }}
      criteres={{
        budgetMin: recherche.budget_min, budgetMax: recherche.budget_max,
        surfaceMin: recherche.surface_min, surfaceMax: recherche.surface_max ?? null,
        surfaceSejourMin: recherche.surface_sejour_min ?? null,
        piecesMin: recherche.nb_pieces_min, piecesMax: recherche.nb_pieces_max ?? null,
        chambresMin: recherche.chambres_min, secteurs: recherche.secteurs || [],
        typeBien: recherche.type_bien,
        typesBien: recherche.type_bien
          ? String(recherche.type_bien).split(',').map((x: string) => x.trim()).filter(Boolean)
          : [],
        etatSouhaite: recherche.etat_souhaite ?? null,
        anneeMin: recherche.annee_construction_min ?? null,
        etageMin: recherche.etage_min ?? null, etageMax: recherche.etage_max ?? null,
        rdcExclu: !!recherche.rdc_exclu, dernierEtage: !!recherche.dernier_etage,
        etageMaxSansAscenseur: recherche.etage_max_sans_ascenseur ?? null,
        exposition: recherche.exposition_souhaitee || '',
        exigences: recherche.exigences || {},
        cuisineType: recherche.cuisine_type ?? null,
        exterieurSurfaceMin: recherche.exterieur_surface_min ?? null,
        dpeMax: recherche.dpe_max ?? null,
        apport: recherche.apport ?? null,
        financement: recherche.financement ?? null,
        urgence: recherche.urgence ?? null,
        transportMinutes: recherche.transport_minutes ?? null,
        transportLignes: recherche.transport_lignes || [],
        transportArrets: recherche.transport_arrets || [],
        equip: [
          recherche.terrasse && 'Terrasse', recherche.balcon && 'Balcon', recherche.jardin && 'Jardin',
          recherche.parking && 'Parking', recherche.ascenseur && 'Ascenseur', recherche.cave && 'Cave',
          recherche.gardien && 'Gardien',
        ].filter(Boolean) as string[],
        notes: recherche.notes || '',
      }}
      biens={biens}
      passage={dernier ? {
        quand: dernier.termine_le, lues: dernier.nb_lues, proposees: dernier.nb_proposees,
        ecartees: dernier.nb_ecartees, totalLues, totalRetenues, totalEcartees, nbPassages,
      } : null}
      semaine={passages.slice().reverse().map((p) => ({
        quand: p.termine_le, lues: p.nb_lues || 0,
      }))}
      visites={visites}
    />
  );
}
