/* ═══ Le rapprochement (V3.29) ═══════════════════════════════════════════
   Depuis la fiche d'un acheteur : trouver, parmi les mandats de l'agence et
   les biens que les veilles ont trouvés pour les autres clients, ceux qui
   répondent à SA recherche. Une seule règle de note, celle de l'espace
   (src/lib/correspondance.ts) : 70 % et plus « correspondent », 50 à 69 %
   « en partie », en dessous on ne montre rien.

   Ce qui est déjà dans son dossier (sélection, présentés) est mis de côté.
   Le bien choisi entre dans son dossier à l'étape « selection », avec son
   `recherche_id` (AGENTS.md §3.1) : il apparaît dans l'onglet Sélection, et
   le mail d'envoi habituel le fait passer « Présenté ». */

import { supabase } from '@/lib/supabase';
import { correspondance, criteresDepuisRecherche, type BienCorr, type Correspondance } from '@/lib/correspondance';
import { versCorrespondance, typeCompatible, versBienAcheteur, titreBien, lirePhotos, type BienVente } from '@/lib/biens-vente';
import { SEUIL_LISTE } from '@/components/biens/outils';
import { signalerEchec } from '@/lib/ecritures';

export type SourceRappro = 'mandats' | 'veilles' | 'deux';
/* En jours ; 0 = depuis le début. */
export type PeriodeVeille = 30 | 90 | 180 | 0;
export const PERIODES: { k: PeriodeVeille; l: string }[] = [
  { k: 30, l: '1 mois' }, { k: 90, l: '3 mois' }, { k: 180, l: '6 mois' }, { k: 0, l: 'Depuis le début' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ligne = Record<string, any>;

export type Trouve = {
  cle: string;
  source: 'mandat' | 'veille';
  titre: string;
  lieu: string;
  prix: number | null;
  photo: string | null;
  photos: string[];
  url: string | null;
  surface: number | null; pieces: number | null; chambres: number | null;
  corr: Correspondance;
  /* Un mandat : le bien en vente. Une veille : la proposition d'origine. */
  vente?: BienVente;
  prop?: Ligne;
  /* Veille : pour qui elle l'a trouvé, et quand. */
  pour?: string;
  le?: string;
};

const nb = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
};
const depuis = (jours: PeriodeVeille) => (jours ? new Date(Date.now() - jours * 86400000).toISOString() : null);

/* Une annonce (proposition de veille ou bien d'un dossier) lue par la note. */
export function corrDepuisAnnonce(p: Ligne): BienCorr {
  return {
    prix: nb(p.prix ?? p.prix_acquereur), ville: p.ville || null, quartier: p.quartier || null,
    surface: nb(p.surface), pieces: nb(p.nb_pieces), chambres: nb(p.nb_chambres), sejour: nb(p.surface_sejour),
    etage: nb(p.etage), etageTotal: nb(p.etage_total), expo: p.exposition || null, dpe: p.dpe || null, annee: nb(p.annee_construction),
    terrasse: !!p.terrasse, balcon: !!p.balcon, jardin: !!p.jardin, parking: !!p.parking,
    ascenseur: !!p.ascenseur, cave: !!p.cave, gardien: !!p.gardien,
    exterieur: nb(p.surface_exterieur),
  };
}

/* Le type d'une annonce (« Appartement », « Maison »…) face à ceux de la
   recherche. Une recherche sans type accepte tout ; une annonce sans type
   n'est pas écartée pour ça. */
function typeAnnonceOk(t: unknown, typesRecherche: string | null | undefined): boolean {
  const l = String(typesRecherche || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const v = String(t || '').trim().toLowerCase();
  if (!l.length || !v) return true;
  if (l.includes(v)) return true;
  return ['duplex', 'loft', 'studio', 'triplex'].includes(v) && l.includes('appartement');
}

/* La ligne à poser dans `biens` pour une proposition de veille — exactement
   les colonnes qu'écrit « Retenir » dans l'onglet Veille (OngletVeille). */
export function bienDepuisProposition(p: Ligne, clientId: string, rechercheId: string): Ligne {
  return {
    client_id: clientId, recherche_id: rechercheId, url: p.url || null,
    titre: p.titre, ville: p.ville, code_postal: p.code_postal,
    quartier: p.quartier || null, adresse: p.adresse || p.adresse_probable || null,
    adresse_probable: p.adresse_probable || null, situation: p.situation || null,
    type_bien: p.type_bien, surface: p.surface, nb_pieces: p.nb_pieces, nb_chambres: p.nb_chambres,
    surface_sejour: p.surface_sejour || null, surface_exterieur: p.surface_exterieur || null,
    etage: p.etage, etage_total: p.etage_total, annee_construction: p.annee_construction,
    exposition: p.exposition || null, dpe: p.dpe || null, ges: p.ges || null,
    parking: p.parking || false, nb_parking: p.nb_parking || null,
    balcon: p.balcon || false, terrasse: p.terrasse || false,
    jardin: p.jardin || false, cave: p.cave || false, ascenseur: p.ascenseur || false,
    gardien: p.gardien || false, description: p.description, prix_vendeur: p.prix,
    commission_type: 'pourcentage', commission_val: null, prix_acquereur: p.prix,
    nb_lots: p.nb_lots, photos: p.photos || [],
    charges_trimestrielles: p.charges_trimestrielles ?? null, taxe_fonciere: p.taxe_fonciere ?? null,
    ...(p.charges_comprises ? { charges_comprises: p.charges_comprises } : {}),
    ...(Array.isArray(p.plans) && p.plans.length ? { plans: p.plans } : {}),
    source_portail: p.portail || 'Veille', agence_nom: p.agence || null, badge_retour: 'propose',
    etape: 'selection', yanport_id: p.yanport_id || null, est_particulier: p.est_particulier || false,
    date_publication: p.date_publication || p.date_annonce || null, prix_initial: p.prix_initial || null,
    nb_baisses: p.nb_baisses || null, nb_agences: p.nb_agences || null,
    historique_prix: p.historique_prix || [], date_derniere_baisse: p.date_derniere_baisse || null,
    score: p.score ?? null, points_forts: p.points_forts || null, points_attention: p.points_attention || null,
    verdict: p.verdict ?? null, appreciation: p.appreciation ?? null,
  };
}

/* Combien il y a à comparer : pour les cartes de la fenêtre de choix. */
export async function compterSources(rechercheId: string, clientId: string): Promise<{ mandats: number; veilles: Record<number, number> }> {
  const veilles: Record<number, number> = {};
  const [m, ...v] = await Promise.all([
    supabase.from('biens_vente').select('id, client_id').eq('archive', false).eq('etape', 'mandat'),
    ...PERIODES.map(p => {
      let q = supabase.from('veille_propositions').select('id', { count: 'exact', head: true })
        .neq('recherche_id', rechercheId).in('statut', ['nouveau', 'retenu']);
      const d = depuis(p.k);
      if (d) q = q.gte('created_at', d);
      return q;
    }),
  ]);
  PERIODES.forEach((p, i) => { veilles[p.k] = (v[i] as { count: number | null }).count ?? 0; });
  const mandats = ((m.data || []) as { client_id: string | null }[]).filter(x => x.client_id !== clientId).length;
  return { mandats, veilles };
}

/* Les mandats en cours qui lui correspondent (70 % et plus) : pour le
   bandeau de la Vue d'ensemble, sans rien lancer. */
export type MandatOk = { id: string; titre: string; ville: string; note: number };
export async function mandatsPour(recherche: Ligne, clientId: string): Promise<{ n: number; meilleure: number; liste: MandatOk[] }> {
  const { data, error } = await supabase.from('biens_vente').select('*').eq('archive', false).eq('etape', 'mandat');
  if (error || !data) return { n: 0, meilleure: 0, liste: [] };
  const deja = await dejaDansLeDossier(recherche.id);
  const crit = criteresDepuisRecherche(recherche);
  const liste: MandatOk[] = [];
  for (const b of data as BienVente[]) {
    if (b.client_id === clientId || deja.ventes.has(b.id)) continue;
    if (!typeCompatible(b.donnees?.typeBien, recherche.type_bien)) continue;
    const c = correspondance(versCorrespondance(b), crit);
    if (c && c.note >= 70) liste.push({ id: b.id, titre: b.titre || titreBien(b.donnees || {}), ville: b.ville || '', note: c.note });
  }
  liste.sort((a, b) => b.note - a.note);
  return { n: liste.length, meilleure: liste[0]?.note || 0, liste };
}

async function dejaDansLeDossier(rechercheId: string): Promise<{ urls: Set<string>; ventes: Set<string> }> {
  const { data } = await supabase.from('biens').select('id, url, bien_vente_id').eq('recherche_id', rechercheId);
  const urls = new Set<string>(), ventes = new Set<string>();
  for (const x of (data || []) as Ligne[]) {
    if (x.url) urls.add(String(x.url));
    if (x.bien_vente_id) ventes.add(String(x.bien_vente_id));
  }
  return { urls, ventes };
}

export async function rapprocher(recherche: Ligne, clientId: string, source: SourceRappro, periode: PeriodeVeille)
  : Promise<{ trouves: Trouve[]; compares: number; dejaLa: number }> {
  const crit = criteresDepuisRecherche(recherche);
  const deja = await dejaDansLeDossier(recherche.id);
  const trouves: Trouve[] = [];
  let compares = 0, dejaLa = 0;

  if (source !== 'veilles') {
    const { data, error } = await supabase.from('biens_vente').select('*').eq('archive', false).eq('etape', 'mandat');
    if (error) throw new Error(`Les mandats n’ont pas pu être lus : ${error.message}`);
    for (const b of (data || []) as BienVente[]) {
      if (b.client_id === clientId) continue;
      compares++;
      if (!typeCompatible(b.donnees?.typeBien, recherche.type_bien)) continue;
      const corr = correspondance(versCorrespondance(b), crit);
      if (!corr || corr.note < SEUIL_LISTE) continue;
      if (deja.ventes.has(b.id)) { dejaLa++; continue; }
      const d = b.donnees || {};
      const photos = lirePhotos(d.photos).map(p => p.url).filter(Boolean);
      trouves.push({
        cle: `m-${b.id}`, source: 'mandat', vente: b,
        titre: b.titre || titreBien(d), lieu: [b.quartier, b.ville].filter(Boolean).join(' · '),
        prix: b.prix, photo: photos[0] || b.photo || null, photos, url: null,
        surface: b.surface, pieces: b.nb_pieces, chambres: b.nb_chambres, corr,
      });
    }
  }

  if (source !== 'mandats') {
    let q = supabase.from('veille_propositions').select('*')
      .neq('recherche_id', recherche.id).in('statut', ['nouveau', 'retenu'])
      .order('created_at', { ascending: false }).limit(2000);
    const d = depuis(periode);
    if (d) q = q.gte('created_at', d);
    const { data, error } = await q;
    if (error) throw new Error(`Les veilles n’ont pas pu être lues : ${error.message}`);
    const props = (data || []) as Ligne[];
    /* Pour qui chaque veille l'a trouvé : le prénom du client. */
    const rIds = [...new Set(props.map(p => p.recherche_id).filter(Boolean))];
    const rs = rIds.length ? (await supabase.from('recherches').select('id, client_id').in('id', rIds)).data || [] : [];
    const cIds = [...new Set((rs as Ligne[]).map(r => r.client_id).filter(Boolean))];
    const cs = cIds.length ? (await supabase.from('clients').select('id, prenom, nom').in('id', cIds)).data || [] : [];
    const nomDe: Record<string, string> = {};
    for (const r of rs as Ligne[]) {
      const c = (cs as Ligne[]).find(x => x.id === r.client_id);
      if (c) nomDe[r.id] = [c.prenom, c.nom].filter(Boolean).join(' ');
    }
    /* Une même annonce trouvée pour plusieurs clients : une seule fois. */
    const vus = new Set<string>();
    for (const p of props) {
      const cle = String(p.url || p.yanport_id || `${p.titre}|${p.prix}|${p.ville}`);
      if (vus.has(cle)) continue;
      vus.add(cle);
      compares++;
      if (!typeAnnonceOk(p.type_bien, recherche.type_bien)) continue;
      const corr = correspondance(corrDepuisAnnonce(p), crit);
      if (!corr || corr.note < SEUIL_LISTE) continue;
      if (p.url && deja.urls.has(String(p.url))) { dejaLa++; continue; }
      const photos = (Array.isArray(p.photos) ? p.photos : []).filter((x: unknown) => typeof x === 'string' && x);
      trouves.push({
        cle: `v-${p.id}`, source: 'veille', prop: p,
        titre: p.titre || [p.type_bien, p.nb_pieces ? `${p.nb_pieces} pièces` : '', p.surface ? `${p.surface} m²` : ''].filter(Boolean).join(' · ') || 'Annonce',
        lieu: [p.quartier, p.ville].filter(Boolean).join(' · '),
        prix: nb(p.prix), photo: photos[0] || null, photos, url: p.url || null,
        surface: nb(p.surface), pieces: nb(p.nb_pieces), chambres: nb(p.nb_chambres), corr,
        pour: nomDe[p.recherche_id] || undefined, le: p.created_at,
      });
    }
  }

  trouves.sort((a, b) => b.corr.note - a.corr.note || (a.source === b.source ? 0 : a.source === 'mandat' ? -1 : 1));
  return { trouves, compares, dejaLa };
}

/* Poser un bien trouvé dans le dossier de l'acheteur, à l'étape Sélection.
   Rend l'id de la ligne `biens`. */
export async function poserEnSelection(t: Trouve, clientId: string, rechercheId: string): Promise<string> {
  let ligne: Ligne;
  if (t.source === 'mandat' && t.vente) {
    const { data: ex } = await supabase.from('biens').select('id').eq('bien_vente_id', t.vente.id).eq('recherche_id', rechercheId).limit(1);
    if (ex?.length) return String(ex[0].id);
    ligne = {
      ...versBienAcheteur(t.vente, { clientId, rechercheId, quand: new Date().toISOString() }),
      etape: 'selection', envoye_le: null, canal_envoi: null, badge_retour: 'propose',
    };
  } else if (t.prop) {
    if (t.url) {
      const { data: ex } = await supabase.from('biens').select('id').eq('recherche_id', rechercheId).eq('url', t.url).limit(1);
      if (ex?.length) return String(ex[0].id);
    }
    ligne = bienDepuisProposition(t.prop, clientId, rechercheId);
  } else throw new Error('Bien introuvable');

  let { data, error } = await supabase.from('biens').insert(ligne).select('id').single();
  /* Comme « Retenir » (OngletVeille) : sans les colonnes récentes si la base ne les a pas encore. */
  if (error && /verdict|appreciation/i.test(error.message || '')) {
    delete ligne.verdict; delete ligne.appreciation;
    ({ data, error } = await supabase.from('biens').insert(ligne).select('id').single());
  }
  if (error || !data) throw new Error(`« ${t.titre} » n’a pas pu être ajouté : ${error?.message || 'réponse vide'}`);
  const id = String((data as Ligne).id);
  const { error: eJ } = await supabase.from('journal').insert({
    client_id: clientId, recherche_id: rechercheId, bien_id: id, type: 'rapprochement_bien',
    titre: t.source === 'mandat' ? 'Mis en sélection · un de vos mandats' : 'Mis en sélection · trouvé par une veille',
    description: `${t.titre}${t.prix ? ` · ${t.prix.toLocaleString('fr-FR')} €` : ''} · correspondance ${t.corr.note} %${t.pour ? ` · trouvé pour ${t.pour}` : ''}`,
    metadata: t.vente ? { bien_vente_id: t.vente.id } : { veille_proposition_id: t.prop?.id },
  });
  if (eJ) signalerEchec('Le bien est dans sa sélection, mais l’historique du client', eJ.message);
  return id;
}

/* Le rapprochement lui-même, noté au Suivi : c'est ce qui permet de dire
   « Dernier rapprochement le 29 septembre » sur la fiche. */
export async function noterRapprochement(clientId: string, rechercheId: string, n: number, source: SourceRappro, periode: PeriodeVeille): Promise<void> {
  const ou = source === 'mandats' ? 'vos mandats' : source === 'veilles' ? 'les veilles' : 'vos mandats et les veilles';
  const p = source === 'mandats' ? '' : ` (${PERIODES.find(x => x.k === periode)?.l.toLowerCase() || ''})`;
  const { error } = await supabase.from('journal').insert({
    client_id: clientId, recherche_id: rechercheId, type: 'rapprochement',
    titre: `Rapprochement · ${n} bien${n > 1 ? 's' : ''} trouvé${n > 1 ? 's' : ''}`,
    description: `Dans ${ou}${p}.`, metadata: { source, periode, n },
  });
  if (error) signalerEchec('Le rapprochement est fait, mais son historique', error.message);
}
