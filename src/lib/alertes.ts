import type { SupabaseClient } from '@supabase/supabase-js';

/* ═══ Les alertes mail d'Alexandre ══════════════════════════════════════
   Tous les mails que le CRM lui envoie à lui (expéditeur « Emilio · CRM »),
   et le réglage qui permet d'en couper chacun : Paramètres → Alertes mail.

   Le réglage tient dans UNE ligne de `parametres` : clé « alertes_mail »,
   valeur JSON qui ne liste que les alertes coupées — { "visite": false }.
   Tout ce qui n'y figure pas reste envoyé. Et dans le doute (valeur
   illisible, base injoignable), on envoie : une alerte de trop vaut mieux
   qu'une alerte perdue.

   Ce fichier est lu des deux côtés : par les routes qui envoient (via
   alerteMailActive) et par l'écran des Paramètres (la liste ALERTES_MAIL).
   Une alerte ajoutée un jour se déclare ici, et nulle part ailleurs. */

export const CLE_ALERTES = 'alertes_mail';

export type CleAlerte =
  | 'visite' | 'visite_offre' | 'visite_avis'
  | 'mandat_question' | 'mandat_numero' | 'mandat_signe' | 'mandat_renonce' | 'mandat_depasse'
  | 'point_auto_recap';

export type Alerte = {
  cle: CleAlerte;
  groupe: 'clients' | 'mandats' | 'auto';
  titre: string;
  /* L'objet du mail tel qu'il arrive dans la boîte. */
  objet: string;
  quand: string;
  /* Où le retrouver dans le CRM quand le mail est coupé. */
  crm: string;
  /* Les cas où il part quand même : un problème qu'il faut régler. */
  sauf?: string;
};

export const ALERTES_MAIL: Alerte[] = [
  {
    cle: 'visite', groupe: 'clients', titre: 'Un client veut visiter',
    objet: '👀 Paul Martin veut visiter · 4 pièces 106 m²…',
    quand: 'Il clique sur « Je veux visiter » depuis son espace. Une seule fois par bien.',
    crm: 'Une relance du jour dans Relances et sur le tableau de bord, et une ligne dans son suivi.',
  },
  {
    cle: 'visite_offre', groupe: 'clients', titre: 'Un client veut faire une offre',
    objet: '💶 Paul Martin veut faire une offre · 4 pièces 106 m²…',
    quand: 'Après une visite, il répond « Je veux faire une offre » depuis son espace, avec son prix s’il en a un en tête.',
    crm: 'Une relance à l’heure même, en tête de Relances, et l’issue sur la visite (onglet Visites de sa fiche).',
  },
  {
    cle: 'visite_avis', groupe: 'clients', titre: 'Son avis après une visite',
    objet: '🤔 Paul Martin réfléchit · 4 pièces 106 m²…',
    quand: 'Après une visite, il répond depuis son espace : il veut revoir le bien, il hésite, ou ce n’est pas pour lui.',
    crm: 'L’issue et ses raisons sur la visite (onglet Visites de sa fiche). Revoir : une relance du jour. Il hésite : une relance à J+3.',
  },
  {
    cle: 'mandat_question', groupe: 'mandats', titre: 'Une question sur le mandat',
    objet: '📞 Paul Martin a une question sur son mandat',
    quand: 'Il demande à être rappelé avant de signer.',
    crm: 'Une relance du jour, et une ligne dans son suivi.',
  },
  {
    cle: 'mandat_numero', groupe: 'mandats', titre: 'Un numéro de mandat attribué',
    objet: 'N° 4322 attribué à Paul Martin (signature en cours)',
    quand: 'Il commence à signer et un numéro est pris dans ta réserve. C’est le rappel de le reporter dans le registre ImmoFacile.',
    crm: 'Le numéro sur sa fiche (bloc Mandat), et une ligne dans son suivi.',
    sauf: 'il ne te reste presque plus de numéros d’avance, ou la fiche n’a pas pu garder le numéro.',
  },
  {
    cle: 'mandat_signe', groupe: 'mandats', titre: 'Un mandat signé',
    objet: '✍️ Paul Martin a signé son mandat (n° 4322)',
    quand: 'Il signe son mandat en ligne. Le PDF signé est joint au mail.',
    crm: 'Le mandat signé sur sa fiche, avec son PDF, et une ligne dans son suivi.',
    sauf: 'sa copie n’a pas pu lui être envoyée, la fiche n’a pas pu être mise à jour, ou sa recherche dépasse déjà le mandat.',
  },
  {
    cle: 'mandat_renonce', groupe: 'mandats', titre: 'Un mandat rétracté',
    objet: '↩️ Paul Martin a renoncé à son mandat (n° 753)',
    quand: 'Il exerce son droit de rétractation en ligne.',
    crm: 'Le bloc Mandat de sa fiche, et une ligne dans son suivi.',
    sauf: 'la fiche n’a pas pu être mise à jour.',
  },
  {
    cle: 'mandat_depasse', groupe: 'mandats', titre: 'Une recherche qui dépasse le mandat',
    objet: '⚠️ Paul Martin : sa recherche dépasse son mandat (n° 4322)',
    quand: 'Il change ses critères au-delà de ce que couvre son mandat signé (budget, secteur…).',
    crm: 'Une relance du jour, et une ligne dans son suivi.',
  },
  {
    cle: 'point_auto_recap', groupe: 'auto', titre: 'Le récapitulatif du point automatique',
    objet: '📨 Point automatique : 2 mails envoyés',
    quand: 'Les matins où des mails « Où en est votre recherche ? » sont partis.',
    crm: 'Une ligne dans le suivi de chaque client concerné.',
    sauf: 'un mail n’a pas pu partir chez un client.',
  },
];

/* Les alertes coupées, lues depuis la valeur enregistrée. */
export function alertesCoupees(valeur: string | null | undefined): Set<CleAlerte> {
  const out = new Set<CleAlerte>();
  if (!valeur) return out;
  try {
    const o = JSON.parse(valeur);
    if (o && typeof o === 'object') {
      for (const a of ALERTES_MAIL) if (o[a.cle] === false) out.add(a.cle);
    }
  } catch { /* illisible : on n'en coupe aucune */ }
  return out;
}

export function valeurAlertes(coupees: Set<CleAlerte>): string {
  const o: Record<string, boolean> = {};
  for (const a of ALERTES_MAIL) if (coupees.has(a.cle)) o[a.cle] = false;
  return JSON.stringify(o);
}

/* Côté serveur, juste avant d'envoyer : Alexandre veut-il ce mail ? */
export async function alerteMailActive(sb: SupabaseClient, cle: CleAlerte): Promise<boolean> {
  try {
    const { data, error } = await sb.from('parametres').select('valeur').eq('cle', CLE_ALERTES).maybeSingle();
    if (error) { console.error('[alertes] lecture du réglage', error.message); return true; }
    return !alertesCoupees(data?.valeur as string | null).has(cle);
  } catch (e) {
    console.error('[alertes] lecture du réglage', e);
    return true;
  }
}
