import { createClient } from '@supabase/supabase-js'
import { signalerEchec, verifie } from './ecritures'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseKey)

/* « offre_ecrite » : ancien statut, plus proposé par aucun menu mais encore
   présent sur des fiches (FicheClient le ramène à « actif »). */
export type StatutClient = 'prospect' | 'actif' | 'suspendu' | 'bien_trouve' | 'perdu' | 'offre_ecrite'
export type ChaleurClient = 'tres_chaud' | 'interesse' | 'tiede' | 'froid'

export interface Recherche {
  id: string
  client_id: string
  nom: string
  active: boolean
  type_bien?: string
  budget_min?: number
  budget_max?: number
  surface_min?: number
  surface_max?: number
  nb_pieces_min?: number
  nb_pieces_max?: number
  chambres_min?: number
  surface_sejour_min?: number
  secteurs: string[]
  transport_minutes?: number
  transport_lignes?: string[]
  transport_arrets?: { nom: string; ville: string; lignes: string[]; minutes?: number }[]
  etage_min?: number
  etage_max?: number
  rdc_exclu?: boolean
  dernier_etage?: boolean
  dpe_max?: string
  annee_construction_min?: number
  etat_souhaite?: string
  exposition_souhaitee?: string
  parking?: boolean
  cave?: boolean
  balcon?: boolean
  terrasse?: boolean
  jardin?: boolean
  ascenseur?: boolean
  gardien?: boolean
  interphone?: boolean
  historique_vu_le?: string
  /* Posé par /api/send-mail quand le mail de bienvenue est parti. C'est lui
     qui grise le bouton : le mail de mise en route ne s'envoie qu'une fois. */
  bienvenue_envoye_le?: string
  exigences?: Record<string, 'souhaite' | 'indispensable'>
  etage_max_sans_ascenseur?: number
  cuisine_type?: string
  exterieur_surface_min?: number
  digicode?: boolean
  urgence?: string
  financement?: string
  apport?: number
  sans_mandat?: boolean
  mandat_date_signature?: string
  mandat_duree?: number
  mandat_honoraires?: string
  mandat_date_expiration?: string
  /* Le mandat signé en ligne (voir src/lib/mandat.ts) : le numéro réservé
     dans le registre ImmoFacile, son type, et quand Alexandre l'a proposé. */
  mandat_numero?: string | null
  mandat_type?: string | null
  mandat_propose_le?: string | null
  /* Le taux des honoraires proposé (2,5 % au plus : le barème). Vide = 2,5 %. */
  mandat_taux?: number | null
  /* Ou un forfait en euros TTC, qui remplace le taux. Vide = pas de forfait. */
  mandat_forfait?: number | null
  notes?: string
  created_at: string
  updated_at: string
}
export type BadgeRetour = 'propose' | 'interesse' | 'souhaite_visiter' | 'visite' | 'offre_faite' | 'refuse'

export interface Client {
  id: string
  reference: string
  prenom: string
  nom: string
  /* Le lien permanent de son espace acheteur. Un seul par client, quel que
     soit le nombre de recherches ouvertes ensuite (voir src/lib/espace.ts).
     Les jetons posés sur les recherches restent valables : ce sont les liens
     déjà envoyés, et ils retombent tout seuls sur celui-ci. */
  token_espace?: string
  /* Une personne ou un couple (src/lib/foyer.ts) : colonnes du SQL
     « signature-plusieurs », absentes avant qu'il soit lancé. */
  civilite?: string | null
  couple?: boolean | null
  conjoint?: unknown
  adresse?: string
  emails: string[]
  telephones: string[]
  statut: StatutClient
  chaleur: ChaleurClient
  raison_perte?: string
  notes?: string
  statut_occupation?: string
  bien_actuel_type?: string
  bien_actuel_surface?: number
  bien_actuel_valeur?: number
  bien_actuel_a_vendre?: boolean
  bien_actuel_notes?: string
  type_bien?: string
  budget_min?: number
  budget_max?: number
  surface_min?: number
  surface_max?: number
  nb_pieces_min?: number
  nb_pieces_max?: number
  chambres_min?: number
  secteurs: string[]
  parking?: boolean
  cave?: boolean
  balcon?: boolean
  terrasse?: boolean
  jardin?: boolean
  ascenseur?: boolean
  gardien?: boolean
  interphone?: boolean
  digicode?: boolean
  rdc_exclu?: boolean
  dernier_etage?: boolean
  etage_min?: number
  etage_max?: number
  dpe_max?: string
  annee_construction_min?: number
  etat_souhaite?: string
  exposition_souhaitee?: string
  surface_sejour_min?: number
  urgence?: string
  financement?: string
  apport?: number
  est_vendeur: boolean
  /* Les types de contact (acheteur, vendeur, notaire…), ce qui est propre à
     chacun, et l'archive : colonnes du SQL « types-contact » (V3.14), absentes
     avant qu'il soit lancé. Voir src/lib/contacts.ts. */
  types?: string[] | null
  pro?: Record<string, unknown> | null
  archive?: boolean | null
  mandat_date_signature?: string
  mandat_duree?: number
  mandat_honoraires?: string
  mandat_date_expiration?: string
  created_at: string
  updated_at: string
}

/* Le numéro de dossier est la première chose qu'un client voit en haut de son
   espace. « EMI-2026-001 » annonce qu'il est le premier de l'année ; on démarre
   donc à 100, ce qui ne dit rien de la taille du portefeuille.

   Le numéro suivant est le plus grand numéro de l'année plus un (V3.43 :
   plus de tri sur la chaîne, qui cassait passé 999). */
const PREMIER_DOSSIER = 100

export async function genererReference(): Promise<string> {
  const annee = new Date().getFullYear()
  /* V3.43 : le plus grand NUMÉRO de l'année, lu sur toutes les références
     (par pages de 1 000), et plus la dernière dans l'ordre alphabétique :
     « 1000 » se rangeait avant « 999 », et la référence suivante aurait
     resservi un numéro déjà pris. */
  let max = 0
  for (let de = 0; de < 50_000; de += 1000) {
    const { data, error } = await supabase
      .from('clients')
      .select('reference')
      .like('reference', `EMI-${annee}-%`)
      .order('id')
      .range(de, de + 999)
    if (error) break
    for (const x of data || []) {
      const n = parseInt(String((x as { reference?: string }).reference || '').split('-')[2], 10)
      if (Number.isFinite(n) && n > max) max = n
    }
    if (!data || data.length < 1000) break
  }
  if (!max) return `EMI-${annee}-${PREMIER_DOSSIER}`
  const num = max + 1
  /* Filet : si d'anciens dossiers sont restés en dessous de 100, le suivant
     repart quand même à 100 au lieu de continuer la vieille série. */
  return `EMI-${annee}-${String(Math.max(num, PREMIER_DOSSIER)).padStart(3, '0')}`
}

/* Une ligne dans l'historique du client. Vérifiée depuis la V3.17 : un échec
   s'affiche (« L'historique du client : pas enregistré »), sans arrêter ce
   qui vient d'être fait — l'action elle-même est déjà enregistrée.
   Un type que la base ne connaît pas (sa liste fermée, code 23514) : la
   ligne est gardée sous « statut_change », le type voulu en metadata —
   comme le fait déjà la suppression d'une recherche. Mieux qu'une ligne
   perdue, et pas d'alerte pour rien. */
/* `lien` (V3.20) : la recherche et le bien dont parle la ligne. Sans eux, la
   ligne appartient au client entier et s'affiche dans le Suivi de toutes ses
   recherches ; avec, dans celui de sa recherche seulement (§6.17). */
export async function addJournal(
  clientId: string, type: string, titre: string,
  description?: string, metadata?: Record<string, unknown>,
  lien?: { rechercheId?: string | null; bienId?: string | null }
): Promise<boolean> {
  const ligne = {
    client_id: clientId, type, titre, description, metadata: metadata || {},
    ...(lien?.rechercheId ? { recherche_id: lien.rechercheId } : {}),
    ...(lien?.bienId ? { bien_id: lien.bienId } : {}),
  }
  const { error } = await supabase.from('journal').insert(ligne)
  if (!error) return true
  if ((error as { code?: string }).code === '23514' && type !== 'statut_change') {
    return verifie('L’historique du client', supabase.from('journal').insert({
      ...ligne, type: 'statut_change', metadata: { ...ligne.metadata, type_voulu: type },
    }))
  }
  signalerEchec('L’historique du client', error.message)
  return false
}

export interface Relance {
  id: string
  client_id: string
  bien_id?: string
  type: 'auto' | 'manuelle'
  statut: 'en_attente' | 'cloturee' | 'reportee'
  date_echeance: string
  note?: string
  resultat?: string
  created_at: string
}
