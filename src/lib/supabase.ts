import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseKey)

export type StatutClient = 'prospect' | 'actif' | 'suspendu' | 'bien_trouve' | 'perdu'
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

   Le tri se fait sur la chaîne : avec trois chiffres et un préfixe fixe, c'est
   exact jusqu'à 999. Au-delà, il faudra passer à quatre chiffres — sinon
   « 1000 » se rangerait avant « 999 ». */
const PREMIER_DOSSIER = 100

export async function genererReference(): Promise<string> {
  const annee = new Date().getFullYear()
  const { data } = await supabase
    .from('clients')
    .select('reference')
    .like('reference', `EMI-${annee}-%`)
    .order('reference', { ascending: false })
    .limit(1)
  if (!data || data.length === 0) return `EMI-${annee}-${PREMIER_DOSSIER}`
  const num = parseInt(data[0].reference.split('-')[2], 10) + 1
  /* Filet : si d'anciens dossiers sont restés en dessous de 100, le suivant
     repart quand même à 100 au lieu de continuer la vieille série. */
  return `EMI-${annee}-${String(Math.max(num, PREMIER_DOSSIER)).padStart(3, '0')}`
}

export async function addJournal(
  clientId: string, type: string, titre: string,
  description?: string, metadata?: Record<string, unknown>
) {
  await supabase.from('journal').insert({
    client_id: clientId, type, titre, description, metadata: metadata || {}
  })
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
