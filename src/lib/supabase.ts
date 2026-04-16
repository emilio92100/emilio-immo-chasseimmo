import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseKey)

export type StatutClient = 'prospect' | 'actif' | 'suspendu' | 'bien_trouve' | 'perdu'
export type ChaleurClient = 'tres_chaud' | 'interesse' | 'tiede' | 'froid'
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
  dpe_max?: string
  annee_construction_min?: number
  est_vendeur: boolean
  mandat_date_signature?: string
  mandat_duree?: number
  mandat_honoraires?: string
  mandat_date_expiration?: string
  created_at: string
  updated_at: string
}

export async function genererReference(): Promise<string> {
  const annee = new Date().getFullYear()
  const { data } = await supabase
    .from('clients')
    .select('reference')
    .like('reference', `EMI-${annee}-%`)
    .order('reference', { ascending: false })
    .limit(1)
  if (!data || data.length === 0) return `EMI-${annee}-001`
  const num = parseInt(data[0].reference.split('-')[2]) + 1
  return `EMI-${annee}-${String(num).padStart(3, '0')}`
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
