/* ═══ Ce que l'IA lit d'une recherche, sans rien de nominatif ═══════════
   V3.186 : sorti de api/rapprochement-ia (V3.122), à l'identique, pour que
   l'analyse d'une annonce envoyée par le client (api/analyse-bien) lise
   EXACTEMENT le même dossier : ses critères et ses indispensables, ses
   précisions, « Son parcours », ce que ses visites ont appris, ses comptes
   rendus, ce qu'il a dit des biens montrés, les annonces écartées et leur
   motif. Ni nom, ni téléphone, ni adresse.

   Serveur seulement (clé de service) : le navigateur ne l'importe jamais. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { lireParcours, texteParcours } from '@/lib/parcours';
import { apprisDe } from '@/lib/visites';

export const plein = (v: unknown) => v !== null && v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length);
export function garder(o: Record<string, unknown>, cles: string[]): Record<string, unknown> {
  const x: Record<string, unknown> = {};
  for (const k of cles) if (plein(o[k])) x[k] = o[k];
  return x;
}
export const court = (t: unknown, n: number) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export const CLES_RECHERCHE = [
  'type_bien', 'budget_min', 'budget_max', 'surface_min', 'surface_max', 'surface_sejour_min', 'nb_pieces_min', 'nb_pieces_max', 'chambres_min',
  'secteurs', 'transport_minutes', 'etage_min', 'etage_max', 'etage_max_sans_ascenseur', 'rdc_exclu', 'dernier_etage', 'exposition_souhaitee',
  'etat_souhaite', 'annee_construction_min', 'dpe_max', 'cuisine_type', 'exterieur_surface_min', 'exigences', 'parking', 'cave', 'balcon',
  'terrasse', 'jardin', 'ascenseur', 'gardien', 'urgence', 'notes',
];

/** Ce que le dossier garde de ses visites, de ses retours et des écarts. */
export type MemoireRecherches = {
  visites: Record<string, unknown>[];
  retours: Record<string, unknown>[];
  ecarts: Record<string, unknown>[];
};

/** Les visites, les retours sur les biens montrés et les annonces écartées
    de ces recherches, lus en une fois. */
export async function memoireRecherches(sb: SupabaseClient, ids: string[]): Promise<MemoireRecherches> {
  const [{ data: vs }, { data: cs }, { data: ps }] = await Promise.all([
    sb.from('visites').select('recherche_id, statut, issue, avis_client, motifs, aime, retenir, commentaire, mot_client, date_visite').in('recherche_id', ids).neq('statut', 'annulee').order('date_visite', { ascending: false }),
    sb.from('biens').select('recherche_id, titre, ville, badge_retour, retour_client, retour_le').in('recherche_id', ids).not('retour_client', 'is', null).order('retour_le', { ascending: false }),
    sb.from('veille_propositions').select('recherche_id, motif_ecart').in('recherche_id', ids).eq('statut', 'ecarte').not('motif_ecart', 'is', null).limit(300),
  ]);
  return {
    visites: (vs || []) as Record<string, unknown>[],
    retours: (cs || []) as Record<string, unknown>[],
    ecarts: (ps || []) as Record<string, unknown>[],
  };
}

/** Le dossier d'une recherche, tel que l'IA le lit. */
export function dossierRecherche(r: Record<string, unknown>, m: MemoireRecherches): Record<string, unknown> {
  const rid = String(r.id);
  const visites = m.visites.filter(v => v.recherche_id === rid);
  const appris = apprisDe(visites as Parameters<typeof apprisDe>[0], (r.appris_masques as string[] | null) || []);
  const x: Record<string, unknown> = garder(r, CLES_RECHERCHE);
  if (Array.isArray(r.transport_arrets) && r.transport_arrets.length) {
    x.arrets = (r.transport_arrets as { nom?: string; minutes?: number }[]).map(a => `${a.nom || ''}${a.minutes ? ` (${a.minutes} min à pied)` : ''}`);
  }
  const parcours = texteParcours(lireParcours(r.parcours));
  if (parcours) x.son_parcours = parcours;
  if (appris.eviter.length) x.ses_visites_refusees_pour = appris.eviter.slice(0, 8).map(a => `${a.t}${a.n > 1 ? ` (${a.n} fois)` : ''}`);
  if (appris.aime.length) x.ses_visites_lui_ont_plu_pour = appris.aime.slice(0, 8).map(a => `${a.t}${a.n > 1 ? ` (${a.n} fois)` : ''}`);
  const crs = visites.map(v => [court(v.commentaire, 300), court(v.mot_client, 200)].filter(Boolean).join(' — ')).filter(Boolean).slice(0, 6);
  if (crs.length) x.comptes_rendus = crs;
  const retours = m.retours.filter(c => c.recherche_id === rid).slice(0, 8)
    .map(c => `${court(c.titre || c.ville, 60)} : ${court(c.retour_client, 220)}${c.badge_retour === 'refuse' ? ' (pas pour lui)' : ''}`);
  if (retours.length) x.ce_quil_a_dit_des_biens_montres = retours;
  const ecarts = [...new Set(m.ecarts.filter(p => p.recherche_id === rid).map(p => court(p.motif_ecart, 140)).filter(Boolean))].slice(0, 10);
  if (ecarts.length) x.annonces_ecartees_pour = ecarts;
  return x;
}
