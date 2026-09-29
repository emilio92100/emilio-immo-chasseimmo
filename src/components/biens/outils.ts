'use client';
import { conseilMandat, mandatVenteEnCours, phraseMandat } from '@/lib/coherence';
import { supabase, genererReference } from '@/lib/supabase';
import { jetonEspace } from '@/lib/jeton';
import { programmerRelance } from '@/lib/relances';
import { signalerEchec } from '@/lib/ecritures';
import { modele, aujourdhui, PERSONNE_VIDE, type Personne } from '@/lib/actes';
import { correspondance, criteresDepuisRecherche, type Correspondance } from '@/lib/correspondance';
import { conjointDe } from '@/lib/foyer';
import { colonneContactAbsente, typesDe } from '@/lib/contacts';
import {
  argentBien, colonnesBien, contexteDocument, lirePhotos, nomProprioActe, personneDepuisClient, referenceSuivante, tableAbsente, titreBien,
  typeCompatible, versBienAcheteur, versCorrespondance, versMandatVente,
  type BienVente, type Donnees, type EtapeVente, type Photo, type SuiviVente,
} from '@/lib/biens-vente';
import { colonnesListe, identiteDuJour } from '@/components/documents/outils';

/* ═══ Biens en vente : les lectures et les écritures ══════════════════════
   Tout ce qui touche à la base pour la rubrique, au même endroit. Chaque
   écriture remonte son erreur (AGENTS.md §3.2) : une fonction qui échoue
   lève une Error au message lisible, l'écran l'affiche. */

export type ClientMini = {
  id: string; prenom: string | null; nom: string | null; statut: string | null;
  civilite?: string | null; couple?: boolean | null; conjoint?: unknown; adresse?: string | null;
  emails: string[] | null; telephones: string[] | null;
  /* Ce qui est propre au type (V3.14) ; « Sa société » y vit (V3.30). */
  pro?: unknown;
};
export type RechercheMini = Record<string, unknown> & { id: string; client_id: string; nom?: string | null; active?: boolean | null; type_bien?: string | null; budget_max?: number | null };
/* La copie d'un bien en vente dans le dossier d'un acheteur (table biens). */
export type Copie = Record<string, unknown> & {
  id: string; client_id: string; recherche_id: string | null; bien_vente_id: string; etape?: string | null;
  envoye_le: string | null; badge_retour: string | null; created_at: string; vu_le?: string | null;
  retour_client?: string | null; retour_le?: string | null;
};
export type VisiteRow = Record<string, unknown> & {
  id: string; bien_id: string; client_id: string; recherche_id: string | null; statut: string; created_at: string;
  date_visite: string | null; heure: string | null; issue?: string | null; avis_client?: string | null; commentaire?: string | null;
};
export type DocLie = {
  id: string; modele: string; statut: string; titre: string | null; created_at: string; updated_at: string;
  signe_le: string | null; finalise_le: string | null; client_id: string | null;
  /* V3.32 : l'exemplaire signé (scellé en ligne ou sur place, ou le scan
     d'une signature à la main) et le mode de signature. */
  signe_chemin?: string | null;
  /* Le mode et, en ligne ou sur place, quand la signature est partie. */
  signature?: { mode?: string; lance_le?: string; agence_le?: string } | null;
  donnees?: Record<string, unknown> | null; numero?: string | null; categorie?: string; annule_le?: string | null;
};

const CLIENT_COLS = 'id, prenom, nom, statut, civilite, couple, conjoint, adresse, emails, telephones, pro';
export const nomClient = (c?: { prenom?: string | null; nom?: string | null } | null) => `${c?.prenom || ''} ${c?.nom || ''}`.trim() || 'Client';
export const initiales = (t: string) => t.split(/[\s-]+/).filter(Boolean).slice(0, 2).map(x => x[0]!.toUpperCase()).join('') || '·';

/* Le SQL pas encore passé : un seul message, clair. */
export const MESSAGE_SQL = 'La rubrique n’est pas encore installée : ouvre Supabase › SQL Editor, colle le contenu du fichier outils/sql/biens-vente.sql, lance-le, puis recharge cette page.';
const lever = (quoi: string, m: string): never => { throw new Error(tableAbsente(m) ? MESSAGE_SQL : `${quoi} : ${m}`); };

/* ══ La liste ══════════════════════════════════════════════════════════ */
export type ListeBiens = {
  biens: BienVente[]; suivi: SuiviVente[]; copies: Copie[]; visites: VisiteRow[];
  clients: Record<string, ClientMini>; recherches: RechercheMini[];
};

export async function chargerListe(): Promise<ListeBiens> {
  const [b, s, c, r, cl] = await Promise.all([
    supabase.from('biens_vente').select('*').order('updated_at', { ascending: false }).limit(500),
    supabase.from('biens_vente_suivi').select('*').order('le', { ascending: false }).limit(3000),
    supabase.from('biens').select('id, bien_vente_id, client_id, recherche_id, etape, envoye_le, badge_retour, created_at, vu_le, retour_client, retour_le').not('bien_vente_id', 'is', null).limit(3000),
    supabase.from('recherches').select('*').eq('active', true).limit(1000),
    supabase.from('clients').select(CLIENT_COLS).limit(3000),
  ]);
  if (b.error) lever('Les biens n’ont pas pu être lus', b.error.message);
  if (s.error) lever('Le suivi des biens n’a pas pu être lu', s.error.message);
  if (c.error) lever('Les acheteurs des biens n’ont pas pu être lus', /bien_vente_id/.test(c.error.message) ? 'biens_vente' : c.error.message);
  const copies = (c.data || []) as Copie[];
  let visites: VisiteRow[] = [];
  if (copies.length) {
    const v = await supabase.from('visites').select('*').in('bien_id', copies.map(x => x.id).slice(0, 900));
    if (v.error) lever('Les visites n’ont pas pu être lues', v.error.message);
    visites = (v.data || []) as VisiteRow[];
  }
  return {
    biens: (b.data || []) as BienVente[], suivi: (s.data || []) as SuiviVente[], copies, visites,
    recherches: r.error ? [] : (r.data || []) as RechercheMini[],
    clients: Object.fromEntries(((cl.data || []) as ClientMini[]).map(x => [x.id, x])),
  };
}

/* Les documents juridiques d'un bien : ceux créés depuis sa fiche portent
   son identifiant dans leurs réponses ; le mandat peut aussi y être rattaché
   à la main (biens_vente.document_id). */
export async function documentsDuBien(b: BienVente): Promise<DocLie[]> {
  /* « * » (V3.32) : la colonne `signature` n'existe que si le SQL de la
     signature en ligne est passé ; la nommer ferait échouer la lecture. */
  const cols = '*';
  const [a, m] = await Promise.all([
    supabase.from('documents').select(cols).eq('donnees->>bienVenteId', b.id).order('created_at', { ascending: false }).limit(60),
    b.document_id ? supabase.from('documents').select(cols).eq('id', b.document_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (a.error) throw new Error('Les documents du bien n’ont pas pu être lus : ' + a.error.message);
  const l = (a.data || []) as DocLie[];
  const lie = m.data as DocLie | null;
  return lie && !l.some(x => x.id === lie.id) ? [lie, ...l] : l;
}

/* Le Suivi des contacts qui parle du bien (V3.29) : une action notée chez un
   acheteur avec « Concerne un bien » (journal.bien_id = sa copie du bien), et
   ce qu'on note chez le propriétaire (son Suivi général : ni recherche, ni
   bien). Seulement ce qu'Alexandre écrit lui-même ou ce que le client dit :
   les présentations, visites et envois ont déjà leur ligne dans l'historique. */
export type LigneJournal = {
  id: string; client_id: string | null; recherche_id: string | null; bien_id: string | null;
  type: string; titre: string | null; description: string | null; created_at: string;
};
export const TYPES_JOURNAL_BIEN = ['appel', 'rdv', 'rdv_planifie', 'note', 'relance_manuelle', 'envoi_externe', 'email_libre', 'message_client', 'demande_rappel'];
const COLS_JOURNAL = 'id, client_id, recherche_id, bien_id, type, titre, description, created_at';

/* Tout ce que la fiche d'un bien montre, relu à chaque ouverture. */
export type DetailBien = {
  suivi: SuiviVente[]; copies: Copie[]; visites: VisiteRow[]; docs: DocLie[]; erreurDocs: string;
  journal: LigneJournal[]; erreurJournal: string;
};
export async function chargerFiche(b: BienVente): Promise<DetailBien> {
  const [s, c] = await Promise.all([
    supabase.from('biens_vente_suivi').select('*').eq('bien_id', b.id).order('le', { ascending: false }).limit(500),
    supabase.from('biens').select('*').eq('bien_vente_id', b.id).limit(300),
  ]);
  if (s.error) lever('Le suivi du bien n’a pas pu être lu', s.error.message);
  if (c.error) lever('Les acheteurs du bien n’ont pas pu être lus', c.error.message);
  const copies = (c.data || []) as Copie[];
  let visites: VisiteRow[] = [];
  if (copies.length) {
    const v = await supabase.from('visites').select('*').in('bien_id', copies.map(x => x.id));
    if (v.error) lever('Les visites n’ont pas pu être lues', v.error.message);
    visites = (v.data || []) as VisiteRow[];
  }
  let docs: DocLie[] = [], erreurDocs = '';
  try { docs = await documentsDuBien(b); } catch (e) { erreurDocs = (e as Error).message; }
  let journal: LigneJournal[] = [], erreurJournal = '';
  try { journal = await journalDuBien(b, copies); } catch (e) { erreurJournal = (e as Error).message; }
  return { suivi: (s.data || []) as SuiviVente[], copies, visites, docs, erreurDocs, journal, erreurJournal };
}
async function journalDuBien(b: BienVente, copies: Copie[]): Promise<LigneJournal[]> {
  const [a, p] = await Promise.all([
    copies.length
      ? supabase.from('journal').select(COLS_JOURNAL).in('bien_id', copies.map(x => x.id)).in('type', TYPES_JOURNAL_BIEN).order('created_at', { ascending: false }).limit(300)
      : Promise.resolve({ data: [], error: null }),
    b.client_id
      ? supabase.from('journal').select(COLS_JOURNAL).eq('client_id', b.client_id).is('bien_id', null).is('recherche_id', null).in('type', TYPES_JOURNAL_BIEN).order('created_at', { ascending: false }).limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (a.error) throw new Error('Le suivi des acheteurs n’a pas pu être lu : ' + a.error.message);
  if (p.error) throw new Error('Le suivi du propriétaire n’a pas pu être lu : ' + p.error.message);
  const ids = new Set(copies.map(x => x.id));
  const chezAcheteurs = ((a.data || []) as LigneJournal[]).filter(j => j.bien_id && ids.has(j.bien_id));
  const chezProprio = ((p.data || []) as LigneJournal[]).filter(j => !j.bien_id && !j.recherche_id && j.client_id === b.client_id);
  const vus = new Set<string>();
  return [...chezAcheteurs, ...chezProprio].filter(j => !vus.has(j.id) && !!vus.add(j.id));
}

export async function annulerVisiteCRM(id: string): Promise<void> {
  const { error } = await supabase.from('visites').update({ statut: 'annulee' }).eq('id', id);
  if (error) lever('La visite n’a pas pu être annulée', error.message);
}
export async function annulerVisiteLibre(v: SuiviVente): Promise<void> {
  await majSuivi(v.id, { statut: 'annulee' });
  const rdv = (v.donnees || {}).rdv_id;
  if (typeof rdv === 'string' && rdv) {
    const { error } = await supabase.from('rendez_vous').update({ statut: 'annule' }).eq('id', rdv);
    if (error) signalerEchec('La visite est annulée, mais son rendez-vous dans l’agenda', error.message);
  }
}
export async function ficheClient(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  if (error || !data) throw new Error('La fiche du client n’a pas pu être ouverte.' + (error ? ` ${error.message}` : ''));
  return data as Record<string, unknown>;
}

/* ══ Les acheteurs qui correspondent ══════════════════════════════════════
   La même note que dans l'espace de l'acheteur (src/lib/correspondance.ts),
   sur ses recherches actives, clients actifs ou prospects, hors propriétaire. */
export type Acheteur = { recherche: RechercheMini; client: ClientMini; corr: Correspondance; copie: Copie | null };
export const SEUIL_CORRESPOND = 70;
export const SEUIL_LISTE = 50;

export function acheteursPour(b: BienVente, recherches: RechercheMini[], clients: Record<string, ClientMini>, copies: Copie[]): Acheteur[] {
  if (!b.donnees?.typeBien && !b.prix) return [];
  const bc = versCorrespondance(b);
  const out: Acheteur[] = [];
  for (const r of recherches) {
    if (r.active === false) continue;
    const c = clients[r.client_id];
    if (!c || !['actif', 'prospect'].includes(String(c.statut || ''))) continue;
    if (b.client_id && r.client_id === b.client_id) continue;
    if (!typeCompatible(b.donnees?.typeBien, r.type_bien)) continue;
    const corr = correspondance(bc, criteresDepuisRecherche(r));
    if (!corr) continue;
    out.push({ recherche: r, client: c, corr, copie: copies.find(x => x.bien_vente_id === b.id && x.recherche_id === r.id) || null });
  }
  return out.sort((x, y) => y.corr.note - x.corr.note);
}

/* ══ Le bien ═══════════════════════════════════════════════════════════ */
/* Un bien neuf, à l'étape choisie au départ (à suivre, estimation, mandat).
   Un mandat déjà signé laisse sa ligne dans l'historique. */
export async function creerBien(references: (string | null)[], etape: EtapeVente = 'estimation', donnees: Donnees = {}): Promise<BienVente> {
  const maintenant = new Date().toISOString();
  const { data, error } = await supabase.from('biens_vente').insert({
    reference: referenceSuivante(references), etape, titre: 'Nouveau bien', etape_le: maintenant,
    ...(Object.keys(donnees).length ? { ...colonnesBien(donnees), titre: 'Nouveau bien' } : {}),
    donnees,
    ...(etape === 'mandat' ? { en_vente_le: maintenant } : {}),
  }).select().single();
  if (error) lever('Le bien n’a pas pu être créé', error.message);
  if (etape === 'mandat') await ajouterSuivi({ bien_id: (data as BienVente).id, type: 'etape', statut: 'mandat', donnees: { de: 'creation', depuis: 'creation' } });
  return data as BienVente;
}

export async function enregistrerBien(id: string, d: Donnees): Promise<BienVente> {
  const { data, error } = await supabase.from('biens_vente').update({
    donnees: d, ...colonnesBien(d), updated_at: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) lever('Le bien n’a pas pu être enregistré', error.message);
  return data as BienVente;
}

export async function majBien(id: string, patch: Partial<BienVente>): Promise<BienVente> {
  const { data, error } = await supabase.from('biens_vente').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) lever('Le bien n’a pas pu être modifié', error.message);
  return data as BienVente;
}

/* Un bien tout juste créé et refermé sans rien dedans ne reste pas. */
export function bienVide(d: Donnees): boolean {
  return !d.typeBien && !d.adresse && !d.ville && !d.prix && !d.clientId && !lirePhotos(d.photos).length
    && !(Array.isArray(d.proprietaires) && (d.proprietaires as Record<string, unknown>[]).some(p => p && (p.nom || p.prenom)));
}

export async function supprimerBien(b: BienVente): Promise<void> {
  const chemins = lirePhotos(b.donnees?.photos).map(p => p.chemin).filter(Boolean);
  if (chemins.length) {
    const { error } = await supabase.storage.from('photos-vente').remove(chemins);
    if (error) signalerEchec('La suppression des photos du bien', error.message);
  }
  try { await api({ action: 'tout', id: b.id }); } catch (e) { signalerEchec('La suppression des pièces du dossier du bien', (e as Error).message); }
  const { error } = await supabase.from('biens_vente').delete().eq('id', b.id);
  if (error) lever('Le bien n’a pas pu être supprimé', error.message);
}

/* ══ Le suivi ══════════════════════════════════════════════════════════ */
export type NouveauSuivi = Omit<Partial<SuiviVente>, 'id' | 'created_at'> & { bien_id: string; type: SuiviVente['type'] };
export async function ajouterSuivi(x: NouveauSuivi): Promise<SuiviVente> {
  const { data, error } = await supabase.from('biens_vente_suivi').insert({ le: new Date().toISOString(), donnees: {}, ...x }).select().single();
  if (error) lever('Le suivi n’a pas pu être enregistré', error.message);
  return data as SuiviVente;
}
export async function majSuivi(id: string, patch: Partial<SuiviVente>): Promise<SuiviVente> {
  const { data, error } = await supabase.from('biens_vente_suivi').update(patch).eq('id', id).select().single();
  if (error) lever('Le suivi n’a pas pu être modifié', error.message);
  return data as SuiviVente;
}
export async function supprimerSuivi(id: string): Promise<void> {
  const { error } = await supabase.from('biens_vente_suivi').delete().eq('id', id);
  if (error) lever('La ligne n’a pas pu être supprimée', error.message);
}

/* Changer d'étape : la colonne, sa date, et une ligne dans l'historique
   avec ce qui a été saisi (dates du compromis, raison d'un retrait…). */
export async function changerEtape(b: BienVente, etape: EtapeVente, o: {
  infos?: Record<string, unknown>; commentaire?: string; donnees?: Donnees; vendu_le?: string | null;
} = {}): Promise<{ bien: BienVente; ligne: SuiviVente }> {
  const maintenant = new Date().toISOString();
  const d = o.donnees || b.donnees || {};
  const patch: Record<string, unknown> = {
    etape, etape_le: maintenant, updated_at: maintenant,
    ...(o.donnees ? { donnees: d, ...colonnesBien(d) } : {}),
    ...(etape === 'mandat' && !b.en_vente_le ? { en_vente_le: maintenant } : {}),
    ...(etape === 'vendu' ? { vendu_le: o.vendu_le || maintenant.slice(0, 10) } : {}),
  };
  const { data, error } = await supabase.from('biens_vente').update(patch).eq('id', b.id).select().single();
  if (error) lever('L’étape n’a pas pu être changée', error.message);
  const ligne = await ajouterSuivi({
    bien_id: b.id, type: 'etape', statut: etape, commentaire: o.commentaire || null,
    donnees: { de: b.etape, ...(o.infos || {}) },
  });
  return { bien: data as BienVente, ligne };
}

/* ══ Les acheteurs suivis ══════════════════════════════════════════════
   Présenter le bien = le poser dans le dossier de l'acheteur (table biens,
   étape « presente »), exactement comme un bien trouvé pour lui. Il le voit
   dans son espace, avec la note de correspondance. */
async function copieDe(b: BienVente, clientId: string, rechercheId: string, badge?: string): Promise<{ copie: Copie; neuve: boolean }> {
  const { data: deja, error: e1 } = await supabase.from('biens').select('*').eq('bien_vente_id', b.id).eq('recherche_id', rechercheId).limit(1);
  if (e1) lever('Le dossier de l’acheteur n’a pas pu être lu', e1.message);
  if (deja?.length) {
    const c = deja[0] as Copie;
    if (c.etape !== 'selection') return { copie: c, neuve: false };
    /* Mis dans sa sélection plus tôt (V3.29) : il ne l'a pas encore vu. On le
       lui présente maintenant, comme s'il arrivait. */
    const { data: p, error: eP } = await supabase.from('biens')
      .update({ etape: 'presente', envoye_le: new Date().toISOString(), canal_envoi: 'lien', ...(badge ? { badge_retour: badge } : {}) })
      .eq('id', c.id).select().single();
    if (eP || !p) lever('Le bien n’a pas pu être présenté', eP?.message || 'réponse vide');
    return { copie: p as Copie, neuve: true };
  }
  const ligne = { ...versBienAcheteur(b, { clientId, rechercheId, quand: new Date().toISOString() }), ...(badge ? { badge_retour: badge } : {}) };
  const { data, error } = await supabase.from('biens').insert(ligne).select().single();
  if (error) lever('Le bien n’a pas pu être ajouté au dossier de l’acheteur', error.message);
  return { copie: data as Copie, neuve: true };
}

export async function envoyerDansEspace(b: BienVente, l: Acheteur[]): Promise<{ n: number; erreurs: string[] }> {
  const erreurs: string[] = [];
  let n = 0;
  for (const a of l) {
    try {
      const { copie, neuve } = await copieDe(b, a.client.id, a.recherche.id);
      if (!neuve) continue;
      n++;
      const { error: eJ } = await supabase.from('journal').insert({
        client_id: a.client.id, bien_id: copie.id, recherche_id: a.recherche.id, type: 'envoi_bien',
        titre: 'Bien de l’agence présenté · dans son espace',
        description: `${b.titre || titreBien(b.donnees)}${b.prix ? ` · ${b.prix.toLocaleString('fr-FR')} €` : ''} · correspondance ${a.corr.note} %`,
        metadata: { bien_vente_id: b.id },
      });
      if (eJ) signalerEchec('Le bien est présenté, mais l’historique du client', eJ.message);
      await programmerRelance(a.client.id, a.recherche.id, 1);
      fetch('/api/notifier', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recherche_id: a.recherche.id }),
      }).catch(() => { /* sans effet sur l'envoi */ });
    } catch (e) {
      erreurs.push(`${nomClient(a.client)} : ${(e as Error).message}`);
    }
  }
  return { n, erreurs };
}

/* Le mettre dans leur sélection (V3.29) : le bien entre dans leur dossier, à
   l'étape « selection », sans rien leur envoyer. Il partira depuis leur
   fiche, avec le mail d'envoi habituel, ou d'ici avec « Envoyer dans leur
   espace ». Rend l'id de la ligne `biens` de chacun. */
export async function mettreEnSelection(b: BienVente, l: Acheteur[]): Promise<{ n: number; ids: Record<string, string>; erreurs: string[] }> {
  const erreurs: string[] = [];
  const ids: Record<string, string> = {};
  let n = 0;
  for (const a of l) {
    try {
      const { data: deja, error: e1 } = await supabase.from('biens').select('id').eq('bien_vente_id', b.id).eq('recherche_id', a.recherche.id).limit(1);
      if (e1) lever('Son dossier n’a pas pu être lu', e1.message);
      if (deja?.length) { ids[a.recherche.id] = String((deja[0] as { id: string }).id); continue; }
      const ligne = {
        ...versBienAcheteur(b, { clientId: a.client.id, rechercheId: a.recherche.id, quand: new Date().toISOString() }),
        etape: 'selection', envoye_le: null, canal_envoi: null, badge_retour: 'propose',
      };
      const { data, error } = await supabase.from('biens').insert(ligne).select('id').single();
      if (error || !data) lever('Le bien n’a pas pu être ajouté à son dossier', error?.message || 'réponse vide');
      const id = String((data as { id: string }).id);
      ids[a.recherche.id] = id;
      n++;
      const { error: eJ } = await supabase.from('journal').insert({
        client_id: a.client.id, recherche_id: a.recherche.id, bien_id: id, type: 'rapprochement_bien',
        titre: 'Mis en sélection · un de vos mandats',
        description: `${b.titre || titreBien(b.donnees)}${b.prix ? ` · ${b.prix.toLocaleString('fr-FR')} €` : ''} · correspondance ${a.corr.note} %`,
        metadata: { bien_vente_id: b.id },
      });
      if (eJ) signalerEchec('Le bien est dans sa sélection, mais l’historique du client', eJ.message);
    } catch (e) {
      erreurs.push(`${nomClient(a.client)} : ${(e as Error).message}`);
    }
  }
  return { n, ids, erreurs };
}

/* ══ Les visites ═══════════════════════════════════════════════════════ */
export type Creneau = { date: string; heure: string; duree: number; commentaire: string };

/* Avec un acheteur suivi : une visite comme les autres (table visites), sur
   la copie du bien dans son dossier. L'agenda, la page Visites, le compte
   rendu et son espace la voient. */
export async function visiteAcheteur(b: BienVente, clientId: string, rechercheId: string, x: Creneau): Promise<void> {
  const { copie } = await copieDe(b, clientId, rechercheId, 'souhaite_visiter');
  const { error } = await supabase.from('visites').insert({
    client_id: clientId, recherche_id: rechercheId, bien_id: copie.id, statut: 'a_venir',
    date_visite: x.date || null, heure: x.heure || null, duree_min: x.duree || null, commentaire: x.commentaire || null,
  });
  if (error) lever('La visite n’a pas pu être enregistrée', error.message);
  if (!['visite', 'offre_faite'].includes(String(copie.badge_retour || ''))) {
    const r = await supabase.from('biens').update({ badge_retour: 'souhaite_visiter' }).eq('id', copie.id);
    if (r.error) signalerEchec('La visite est notée, mais le bien « souhaite visiter »', r.error.message);
  }
  const { error: eJ } = await supabase.from('journal').insert({
    client_id: clientId, recherche_id: rechercheId, bien_id: copie.id, type: 'visite_planifiee',
    titre: `📅 Visite planifiée — ${b.titre || titreBien(b.donnees)}`,
    description: [x.date ? `Le ${new Date(`${x.date}T12:00:00`).toLocaleDateString('fr-FR')}` : '', x.heure ? `à ${x.heure}` : ''].filter(Boolean).join(' ') || null,
    metadata: { bien_vente_id: b.id },
  });
  if (eJ) signalerEchec('La visite est notée, mais l’historique du client', eJ.message);
}

/* Avec quelqu'un hors du CRM (un appel sur une annonce) : une ligne de
   suivi, et un rendez-vous dans l'agenda si on le demande. */
export async function visiteExterne(b: BienVente, qui: string, tel: string, x: Creneau, agenda: boolean): Promise<SuiviVente> {
  const le = x.date ? new Date(`${x.date}T${x.heure || '12:00'}:00`).toISOString() : new Date().toISOString();
  let rdvId: string | null = null;
  if (agenda && x.date) {
    const debut = new Date(`${x.date}T${x.heure || '10:00'}:00`);
    const fin = new Date(debut.getTime() + (x.duree || 45) * 60000);
    const d = b.donnees || {};
    const lieu = [String(d.adresse || ''), [String(d.cp || ''), String(d.ville || '')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const consignes = [d.digicode ? `Digicode ${d.digicode}` : '', d.porte ? String(d.porte) : '', d.interphone ? `Interphone ${d.interphone}` : '', x.commentaire].filter(Boolean).join(' · ');
    const { data, error } = await supabase.from('rendez_vous').insert({
      type: 'visite', titre: `Visite · ${b.titre || titreBien(d)}`, debut: debut.toISOString(), fin: fin.toISOString(),
      lieu: lieu || null, notes: consignes || null, client_id: null, recherche_id: null,
      details: { proprietaire: qui, telephone: tel || undefined, bien_vente_id: b.id },
    }).select('id').single();
    if (error) lever('Le rendez-vous n’a pas pu être ajouté à l’agenda', error.message);
    rdvId = (data as { id: string }).id;
  }
  return ajouterSuivi({
    bien_id: b.id, type: 'visite', le, qui, statut: 'a_venir', commentaire: x.commentaire || null,
    donnees: { tel, duree: x.duree, rdv_id: rdvId },
  });
}

/* ══ Les offres ════════════════════════════════════════════════════════ */
export type SaisieOffre = {
  qui: string; clientId: string | null; rechercheId: string | null;
  montant: number; recue: string; jusquau: string; financement: 'comptant' | 'pret' | 'relais';
  apport: number | null; pret: number | null; accord: string; conditions: string; fichier: { chemin: string; nom: string } | null;
};

export async function enregistrerOffre(b: BienVente, o: SaisieOffre, proprio: ClientMini | null): Promise<SuiviVente> {
  const ligne = await ajouterSuivi({
    bien_id: b.id, type: 'offre', le: new Date(`${o.recue}T12:00:00`).toISOString(), qui: o.qui,
    client_id: o.clientId, recherche_id: o.rechercheId, montant: o.montant, statut: 'en_attente',
    donnees: {
      jusquau: o.jusquau, financement: o.financement, apport: o.apport, pret: o.pret, accord: o.accord, conditions: o.conditions,
      ...(o.fichier ? { chemin: o.fichier.chemin, nom: o.fichier.nom } : {}),
    },
  });
  /* L'acheteur suivi : une ligne dans son dossier, son bien passe « offre faite ». */
  if (o.clientId && o.rechercheId) {
    const { data: cop } = await supabase.from('biens').select('id').eq('bien_vente_id', b.id).eq('recherche_id', o.rechercheId).limit(1);
    const copieId = cop?.[0]?.id as string | undefined;
    if (copieId) {
      const r = await supabase.from('biens').update({ badge_retour: 'offre_faite' }).eq('id', copieId);
      if (r.error) signalerEchec('L’offre est notée, mais le bien « offre faite » chez l’acheteur', r.error.message);
    }
    const { error: eJ } = await supabase.from('journal').insert({
      client_id: o.clientId, recherche_id: o.rechercheId, ...(copieId ? { bien_id: copieId } : {}), type: 'offre',
      titre: `💶 Offre à ${o.montant.toLocaleString('fr-FR')} € — ${b.titre || titreBien(b.donnees)}`,
      description: o.jusquau ? `Valable jusqu’au ${new Date(`${o.jusquau}T12:00:00`).toLocaleDateString('fr-FR')}` : null,
      metadata: { bien_vente_id: b.id, suivi_id: ligne.id },
    });
    if (eJ) signalerEchec('L’offre est notée, mais l’historique de l’acheteur', eJ.message);
  }
  /* Le propriétaire : une relance le jour où l'offre expire. */
  if (proprio && o.jusquau) {
    const { error } = await supabase.from('relances').insert({
      client_id: proprio.id, type: 'manuelle', statut: 'en_attente',
      date_echeance: new Date(`${o.jusquau}T09:00:00`).toISOString(),
      note: `Offre de ${o.qui} à ${o.montant.toLocaleString('fr-FR')} € sur ${b.titre || 'son bien'} : réponse à donner aujourd’hui.`,
    });
    if (error) signalerEchec('L’offre est notée, mais la relance du propriétaire', error.message);
  }
  return ligne;
}

/* ══ Les photos (bucket public « photos-vente ») ══════════════════════════ */
/* Réduites dans le navigateur avant l'envoi : une photo de téléphone pèse
   4 Mo, 1 920 px de large suffisent à une annonce. */
export async function reduireImage(f: File, max = 1920, qualite = 0.84): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/i.test(f.type)) return f;
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Image illisible')); i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    if (k === 1 && f.size < 900_000) return f;
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, ko) => c.toBlob(bl => (bl ? ok(bl) : ko(new Error('Conversion impossible'))), 'image/jpeg', qualite));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function deposerPhoto(bienId: string, f: File): Promise<Photo> {
  const bl = await reduireImage(f);
  const ext = bl.type === 'image/png' ? 'png' : bl.type === 'image/webp' ? 'webp' : 'jpg';
  const chemin = `${bienId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from('photos-vente').upload(chemin, bl, { contentType: bl.type || 'image/jpeg', upsert: false });
  if (error) throw new Error(/bucket not found/i.test(error.message) ? MESSAGE_SQL : 'La photo n’a pas pu être envoyée : ' + error.message);
  const { data } = supabase.storage.from('photos-vente').getPublicUrl(chemin);
  return { url: data.publicUrl, chemin, legende: '' };
}

export async function retirerPhoto(chemin: string): Promise<void> {
  if (!chemin) return;
  const { error } = await supabase.storage.from('photos-vente').remove([chemin]);
  if (error) throw new Error('La photo n’a pas pu être retirée : ' + error.message);
}

/* ══ Les pièces du dossier (bucket privé, via /api/biens-vente) ══════════ */
async function api<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch('/api/biens-vente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ ok: false, erreur: `Erreur ${r.status}` }));
  if (!j.ok) throw new Error(j.erreur || `Erreur ${r.status}`);
  return j as T;
}
const TYPES: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp' };

export async function deposerPiece(bienId: string, cle: string, f: File): Promise<{ chemin: string; nom: string }> {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (!TYPES[ext]) throw new Error('Format refusé : PDF, JPG ou PNG.');
  if (f.size > 25_000_000) throw new Error('Fichier trop lourd (25 Mo au plus).');
  const { chemin, jeton } = await api<{ chemin: string; jeton: string }>({ action: 'depot', id: bienId, cle, ext });
  const { error } = await supabase.storage.from('mandats').uploadToSignedUrl(chemin, jeton, f, { contentType: TYPES[ext] });
  if (error) throw new Error('Le fichier n’a pas pu être envoyé : ' + error.message);
  return { chemin, nom: f.name };
}
export async function lienPiece(chemin: string, nom?: string): Promise<string> {
  return (await api<{ url: string }>({ action: 'lien', chemin, nom })).url;
}
export async function retirerPiece(chemin: string): Promise<void> {
  await api({ action: 'retirer', chemin });
}
/* Ouvre un fichier privé dans un onglet (l'onglet s'ouvre tout de suite,
   sinon le navigateur bloque la fenêtre). */
export async function ouvrirPiece(chemin: string, nom?: string) {
  const onglet = window.open('', '_blank');
  try {
    const url = await lienPiece(chemin, nom);
    (onglet || window).location.assign(url);
  } catch (e) {
    onglet?.close();
    alert('Le fichier n’a pas pu être ouvert.\n\n' + (e as Error).message);
  }
}

/* Des pièces du dossier, envoyées par mail (V3.30, /api/biens-vente
   « envoyer ») : jointes jusqu'à 10 Mo, en liens de 7 jours au-delà. */
export type DestDocuments = { email: string; nom: string; clientId?: string | null; rechercheId?: string | null };
export async function envoyerDocuments(o: {
  bienId: string; destinataires: DestDocuments[]; sujet: string; message: string; pieces: { chemin: string; nom: string }[];
}): Promise<{ mode: 'pj' | 'liens'; envoyes: string[]; avertissements: string[] }> {
  return api<{ mode: 'pj' | 'liens'; envoyes: string[]; avertissements: string[] }>({
    action: 'envoyer', id: o.bienId, destinataires: o.destinataires, sujet: o.sujet, message: o.message, pieces: o.pieces,
  });
}

/* ══ Le propriétaire ═══════════════════════════════════════════════════ */
/* Sa fiche, créée depuis le bien : le minimum, de type « vendeur » (et pas
   un acheteur « actif » : il ne cherche rien). Avant le SQL des types de
   contact, la colonne `types` manque : on crée sans elle. */
export async function creerFicheProprio(p: Personne): Promise<ClientMini> {
  const reference = await genererReference();
  const ligne = {
    reference, prenom: p.prenom || '', nom: p.nom || '',
    ...(p.civilite ? { civilite: p.civilite } : {}),
    token_espace: jetonEspace(p.prenom, p.nom),
    adresse: p.adresse || null,
    emails: p.email ? [p.email.trim().toLowerCase()] : [], telephones: p.telephone ? [p.telephone.trim()] : [],
    statut: 'prospect', statut_occupation: 'proprietaire', est_vendeur: true,
  };
  let r = await supabase.from('clients').insert({ ...ligne, types: ['vendeur'] }).select(CLIENT_COLS).single();
  if (r.error && colonneContactAbsente(r.error.message)) r = await supabase.from('clients').insert(ligne).select(CLIENT_COLS).single();
  if (r.error) throw new Error('La fiche du propriétaire n’a pas pu être créée : ' + r.error.message);
  return r.data as ClientMini;
}

/* Un contact relié à un bien comme propriétaire devient « vendeur ». Sans la
   colonne des types (avant le SQL), rien à faire. */
export async function marquerVendeur(clientId: string): Promise<void> {
  const { data, error } = await supabase.from('clients').select('types').eq('id', clientId).maybeSingle();
  if (error || !data) return;
  const t = typesDe(data);
  if (t.includes('vendeur')) return;
  const { error: e2 } = await supabase.from('clients').update({ types: [...t, 'vendeur'] }).eq('id', clientId);
  if (e2 && !colonneContactAbsente(e2.message)) signalerEchec('Le type « vendeur » du contact', e2.message);
}

/* Les réponses « propriétaire » d'un bien, tirées de sa fiche : la personne
   (ou le couple) et le lien vers sa fiche. */
export function donneesProprio(c: ClientMini): Donnees {
  const j = c.couple ? conjointDe(c.conjoint) : null;
  const l: Personne[] = [personneDepuisClient(c)];
  if (j) l.push({ ...PERSONNE_VIDE, civilite: j.civilite === 'Madame' || j.civilite === 'Monsieur' ? j.civilite : '', prenom: j.prenom || '', nom: j.nom || '', email: j.email || '', telephone: j.telephone || '' });
  return { clientId: c.id, proprietaires: l, qui: j ? 'couple' : 'personne' };
}

/* Ses recherches à lui : le propriétaire qui rachète ailleurs. */
export async function recherchesDe(clientId: string): Promise<RechercheMini[]> {
  const { data, error } = await supabase.from('recherches').select('*').eq('client_id', clientId).eq('active', true).limit(10);
  if (error) return [];
  return (data || []) as RechercheMini[];
}

/* ══ Les documents juridiques, préremplis depuis le bien ═══════════════ */
export type PourDocument = {
  modele: 'mandat_vente' | 'offre_achat' | 'bon_visite';
  personne?: Personne | null; clientId?: string | null; rechercheId?: string | null;
  visite?: { date: string; heure: string } | null;
  offre?: SuiviVente | null;
};

export async function creerDocument(b: BienVente, x: PourDocument): Promise<string> {
  const m = modele(x.modele);
  if (!m) throw new Error('Modèle introuvable.');
  /* Un seul mandat de vente en cours par bien (V3.32, src/lib/coherence.ts) :
     le dernier garde-fou, quel que soit le chemin qui mène ici. */
  if (x.modele === 'mandat_vente') {
    const enCours = await mandatVenteEnCours(b);
    if (enCours) throw new Error(`${phraseMandat(enCours)} ${conseilMandat(enCours)}`);
  }
  const identite = await identiteDuJour();
  const d = b.donnees || {};
  const a = argentBien(d);
  const base = m.defaut({ identite, client: null, bien: contexteDocument(b), visite: null, recherche: null });
  let donnees: Donnees;
  if (x.modele === 'mandat_vente') {
    donnees = versMandatVente(b, base);
  } else if (x.modele === 'offre_achat') {
    const o = x.offre;
    const od = (o?.donnees || {}) as Record<string, unknown>;
    donnees = {
      ...base, bienVenteId: b.id,
      ...(x.personne ? { acquereurs: [x.personne] } : {}),
      vendeurNom: nomProprioActe(d), agenceVendeur: identite.nom || '',
      prixAffiche: a.prix, forme: a.acq ? 'fai' : 'net', honoVendeur: a.acq ? a.hono : null,
      ...(o?.montant ? { prix: o.montant } : {}),
      ...(typeof od.jusquau === 'string' && od.jusquau ? { validite: od.jusquau } : {}),
      ...(typeof od.apport === 'number' ? { apport: od.apport } : {}),
      ...(od.financement === 'comptant' ? { pret: 'non' } : typeof od.pret === 'number' ? { pret: 'oui', pretMontant: od.pret } : {}),
      notaire: String(d.notaire || base.notaire || ''),
    };
  } else {
    const docs = ['erp', 'dpe', 'fiche', ...(d.copro === 'oui' ? ['copro'] : [])];
    donnees = {
      ...base, bienVenteId: b.id, role: 'vendeur', reference: b.reference || '', agenceVendeur: '', docs,
      ...(x.personne ? { visiteurs: [x.personne] } : {}),
      ...(x.visite?.date ? { dateVisite: x.visite.date } : {}), ...(x.visite?.heure ? { heure: x.visite.heure } : {}),
    };
  }
  const { data, error } = await supabase.from('documents').insert({
    modele: m.id, categorie: m.categorie, statut: 'brouillon', donnees, ...colonnesListe(m, donnees),
    client_id: x.clientId || (x.modele === 'mandat_vente' ? b.client_id : null) || null,
    bien_id: null, recherche_id: x.rechercheId || null,
  }).select('id').single();
  if (error) throw new Error('Le document n’a pas pu être créé : ' + error.message);
  const id = (data as { id: string }).id;
  if (x.modele === 'mandat_vente' && !b.document_id) {
    const r = await supabase.from('biens_vente').update({ document_id: id }).eq('id', b.id);
    if (r.error) signalerEchec('Le mandat est créé, mais son lien avec le bien', r.error.message);
  }
  return id;
}

export const personneVide = (nom = ''): Personne => {
  const [prenom, ...reste] = nom.trim().split(/\s+/);
  return { ...PERSONNE_VIDE, prenom: reste.length ? prenom || '' : '', nom: reste.length ? reste.join(' ') : prenom || '' };
};
export { aujourdhui };
