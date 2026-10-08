'use client';
import { conseilMandat, mandatVenteEnCours, phraseMandat } from '@/lib/coherence';
import { addJournal, supabase, genererReference } from '@/lib/supabase';
import { jetonEspace } from '@/lib/jeton';
import { programmerRelance, solderRelancesAcheteur } from '@/lib/relances';
import { annulerVisites } from '@/lib/annuler-visites';
import { solderRelancesRetourVisite, solderRelancesVisite } from '@/lib/demandes-visite';
import { visitePasseeParis } from '@/lib/visites';
import { signalerEchec } from '@/lib/ecritures';
import { toutLire } from '@/lib/registre';
import { modele, aujourdhui, lirePersonnes, PERSONNE_VIDE, type Personne } from '@/lib/actes';
import { correspondance, criteresDepuisRecherche, grouperSecteurs, type Correspondance } from '@/lib/correspondance';
import { raisonEcart, type RaisonEcart } from '@/lib/ecart-acheteur';
import { conjointDe } from '@/lib/foyer';
import { ETAPES_EN_VENTE, TYPES_CONTACT, acheteurEnCours, colonneContactAbsente, typesDe, typesSelonBiens } from '@/lib/contacts';
import {
  ETAPES_BIEN, apresReponse, argentBien, avantMandat, colonnesBien, contexteDocument, dateLongue, lirePhotos, montantActuel, nomProprioActe, personneDepuisClient, prixCopie, referenceSuivante, tableAbsente, titreBien,
  typeCompatible, versBienAcheteur, versCorrespondance, versMandatVente,
  type BienVente, type Donnees, type EtapeVente, type EtatMandatDoc, type Photo, type SuiviVente,
} from '@/lib/biens-vente';
import { colonnesListe, identiteDuJour, mandatDepuis, preparerDepuis } from '@/components/documents/outils';
import { retirerMandatDuBien, type RetraitMandat } from '@/lib/mandat-bien';
import { cleAdresse } from '@/lib/carte';

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
  /* V3.112 : pour savoir qui est un acheteur en cours (lus par chargerListe). */
  types?: unknown; archive?: boolean | null;
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
  /* V3.125 : les recherches « en attente » des prospects et des acheteurs en
     pause (leur veille ne tourne pas : `active` à false). Le rapprochement
     les regarde ; la veille, les alertes et le point automatique, non. */
  recherchesAttente?: RechercheMini[];
  /* Les mandats de vente de Documents, hors annulés (V3.42). */
  mandats?: MandatListe[];
};

/* ── Les mandats de vente de Documents, pour la liste (V3.42) ──
   La liste disait « Mandat en cours » pour un bien « En vente » dont le
   mandat était encore en rédaction. Elle lit maintenant où en est celui de
   chaque bien : quelques colonnes, sans les réponses. Une lecture qui
   échoue n'empêche pas la liste de s'afficher (elle retombe sur l'étape). */
export type MandatListe = EtatMandatDoc & { bien: string | null; created_at: string };
async function lireMandatsListe(): Promise<MandatListe[]> {
  type Rep = { data: unknown[] | null; error: { message: string } | null };
  const lire = (cols: string): PromiseLike<Rep> => supabase.from('documents').select(cols)
    .eq('modele', 'mandat_vente').neq('statut', 'annule').limit(1000) as unknown as PromiseLike<Rep>;
  /* `signature` n'existe qu'après le SQL de la signature en ligne. */
  let r = await lire('id, statut, numero, created_at, bien:donnees->>bienVenteId, signature');
  if (r.error && /signature/.test(r.error.message)) r = await lire('id, statut, numero, created_at, bien:donnees->>bienVenteId');
  if (r.error) { console.error('[biens] les mandats de Documents :', r.error.message); return []; }
  return ((r.data || []) as unknown as { id: string; statut: string; numero: string | null; created_at: string; bien: string | null; signature?: unknown }[])
    .filter(x => x.statut === 'brouillon' || x.statut === 'pret' || x.statut === 'signe')
    .map(x => ({ id: x.id, statut: x.statut as EtatMandatDoc['statut'], numero: x.numero, created_at: x.created_at, bien: x.bien, enSignature: !!x.signature }));
}

/* Le mandat de chaque bien : celui qui porte son identifiant, ou celui
   rattaché au bien (biens_vente.document_id). En route d'abord (à signer,
   puis en préparation), sinon signé ; à rang égal, le plus récent. */
export function mandatsParBien(l: ListeBiens): Record<string, EtatMandatDoc> {
  const RANG: Record<string, number> = { pret: 0, brouillon: 1, signe: 2 };
  const rattache = new Map(l.biens.filter(x => x.document_id).map(x => [x.document_id as string, x.id]));
  const out: Record<string, MandatListe> = {};
  for (const m of l.mandats || []) {
    const bien = m.bien || rattache.get(m.id);
    if (!bien) continue;
    const deja = out[bien];
    if (!deja || RANG[m.statut] < RANG[deja.statut] || (RANG[m.statut] === RANG[deja.statut] && m.created_at > deja.created_at)) out[bien] = m;
  }
  return out;
}

/* Les contacts, avec leurs types et l'archive (V3.112 : le rapprochement d'un
   bien regarde tous les acheteurs en cours). Sans ces colonnes (avant leur
   SQL), comme avant. */
async function lireClientsListe() {
  const r = await toutLire<ClientMini>((de, a) => supabase.from('clients').select(`${CLIENT_COLS}, types, archive`).order('id').range(de, a));
  return r.erreur && colonneContactAbsente(r.erreur) ? toutLire<ClientMini>((de, a) => supabase.from('clients').select(CLIENT_COLS).order('id').range(de, a)) : r;
}

export async function chargerListe(): Promise<ListeBiens> {
  /* Par pages de 1 000 (V3.33) : Supabase plafonne chaque requête à 1 000
     lignes, quoi que dise .limit(). Au-delà, des acheteurs, des visites ou
     des lignes d'historique manquaient sans le moindre message. */
  const [b, s, c, r, cl, ra] = await Promise.all([
    toutLire<BienVente>((de, a) => supabase.from('biens_vente').select('*').order('updated_at', { ascending: false }).order('id').range(de, a)),
    toutLire<SuiviVente>((de, a) => supabase.from('biens_vente_suivi').select('*').order('le', { ascending: false }).order('id').range(de, a)),
    toutLire<Copie>((de, a) => supabase.from('biens').select('id, bien_vente_id, client_id, recherche_id, etape, envoye_le, badge_retour, created_at, vu_le, retour_client, retour_le').not('bien_vente_id', 'is', null).order('id').range(de, a)),
    toutLire<RechercheMini>((de, a) => supabase.from('recherches').select('*').eq('active', true).order('id').range(de, a)),
    lireClientsListe(),
    toutLire<RechercheMini>((de, a) => supabase.from('recherches').select('*').eq('active', false).order('id').range(de, a)),
  ]);
  if (b.erreur) lever('Les biens n’ont pas pu être lus', b.erreur);
  if (s.erreur) lever('Le suivi des biens n’a pas pu être lu', s.erreur);
  if (c.erreur) lever('Les acheteurs des biens n’ont pas pu être lus', /bien_vente_id/.test(c.erreur) ? 'biens_vente' : c.erreur);
  const copies = c.data;
  /* Les visites des copies, par paquets de 100 identifiants : une liste plus
     longue ne tient plus dans l'adresse de la requête. */
  const ids = copies.map(x => x.id);
  const paquets: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) paquets.push(ids.slice(i, i + 100));
  const lus = await Promise.all(paquets.map(p => supabase.from('visites').select('*').in('bien_id', p)));
  const visites: VisiteRow[] = [];
  for (const v of lus) {
    if (v.error) lever('Les visites n’ont pas pu être lues', v.error.message);
    visites.push(...((v.data || []) as VisiteRow[]));
  }
  const clients = Object.fromEntries(cl.data.map(x => [x.id, x]));
  return {
    biens: b.data, suivi: s.data, copies, visites,
    recherches: r.erreur ? [] : r.data,
    recherchesAttente: ra.erreur ? [] : ra.data.filter(x => enAttente(clients[x.client_id])),
    clients,
    mandats: await lireMandatsListe(),
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
  let l = (a.data || []) as DocLie[];
  const lie = m.data as DocLie | null;
  if (lie && !l.some(x => x.id === lie.id)) l = [lie, ...l];
  /* Les avenants, courriers de reconduction et délégations faits à partir de
     ses mandats (V3.32) : reliés par le numéro du mandat — ceux d'avant la
     V3.32 ne portaient pas le bien. */
  const numeros = [...new Set([
    ...l.filter(x => x.modele === 'mandat_vente' && x.statut !== 'annule').map(x => String(x.numero || '').trim()),
    String((b.donnees || {}).mandatNumero || b.mandat_numero || '').trim(),
  ].filter(Boolean))];
  if (numeros.length) {
    const { data, error } = await supabase.from('documents').select(cols).in('modele', ['avenant_vente', 'courrier_reconduction', 'delegation'])
      .in('donnees->>mandatNumero', numeros).order('created_at', { ascending: false }).limit(40);
    if (!error) for (const x of (data || []) as DocLie[]) if (!l.some(y => y.id === x.id)) l.push(x);
  }
  return l.sort((p, q) => q.created_at.localeCompare(p.created_at));
}

/* ══ L'avenant au mandat de vente, depuis « Changer le prix » (V3.32) ═════
   Le mandat signé du bien, ses avenants déjà signés (preparerDepuis), puis ce
   qui change : le prix, les honoraires. Un brouillon, relié au bien, à
   relire et à faire signer dans Documents. */
export async function creerAvenantVente(b: BienVente, mandatId: string, x: {
  prix?: number | null; hono?: { charge: unknown; honoMode: unknown; taux: unknown; forfait: unknown } | null;
}): Promise<string> {
  const m = modele('avenant_vente');
  if (!m) throw new Error('Le modèle d’avenant est introuvable.');
  const choix = await mandatDepuis('d-' + mandatId);
  const identite = await identiteDuJour();
  const base = await preparerDepuis(m, choix, identite);
  const objets = [...(x.prix ? ['prix'] : []), ...(x.hono ? ['honoraires'] : [])];
  const donnees = {
    ...base, bienVenteId: b.id, objets: objets.length ? objets : ['prix'],
    ...(x.prix ? { nouveauPrix: x.prix } : {}),
    ...(x.hono ? { charge2: x.hono.charge, honoMode2: x.hono.honoMode, taux2: x.hono.taux ?? null, forfait2: x.hono.forfait ?? null } : {}),
  };
  const { data, error } = await supabase.from('documents').insert({
    modele: m.id, categorie: m.categorie, statut: 'brouillon', donnees, ...colonnesListe(m, donnees),
    client_id: choix.client_id || null, bien_id: choix.bien_id || null, recherche_id: null,
  }).select('id').single();
  if (error || !data) throw new Error('L’avenant n’a pas pu être préparé : ' + (error?.message || 'rien n’est revenu'));
  return (data as { id: string }).id;
}

/* Le Suivi des contacts qui parle du bien (V3.29) : une action notée chez un
   acheteur avec « Concerne un bien » (journal.bien_id = sa copie du bien), et
   ce qu'on note chez le propriétaire (son Suivi général : ni recherche, ni
   bien). Seulement ce qu'Alexandre écrit lui-même ou ce que le client dit :
   les présentations, visites et envois ont déjà leur ligne dans l'historique. */
export type LigneJournal = {
  id: string; client_id: string | null; recherche_id: string | null; bien_id: string | null;
  type: string; titre: string | null; description: string | null; created_at: string;
  metadata?: Record<string, unknown> | null;
};
export const TYPES_JOURNAL_BIEN = ['appel', 'rdv', 'rdv_planifie', 'note', 'relance_manuelle', 'envoi_externe', 'email_libre', 'message_client', 'demande_rappel'];
const COLS_JOURNAL = 'id, client_id, recherche_id, bien_id, type, titre, description, created_at, metadata';

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
  /* V3.50 : une ligne écrite par le CRM pour UN de ses biens (l'estimation,
     le point vendeur) ne s'affiche que sur celui-là. */
  const chezProprio = ((p.data || []) as LigneJournal[]).filter(j => !j.bien_id && !j.recherche_id && j.client_id === b.client_id
    && !(j.metadata && typeof j.metadata.bien_vente_id === 'string' && j.metadata.bien_vente_id !== b.id));
  const vus = new Set<string>();
  return [...chezAcheteurs, ...chezProprio].filter(j => !vus.has(j.id) && !!vus.add(j.id));
}

/* V3.50 : une seule façon d'annuler une visite d'acheteur (annulerVisites) :
   son rappel se ferme, son Suivi le dit. Avant, ici, seul le statut changeait. */
export async function annulerVisiteCRM(id: string): Promise<number> {
  return annulerVisites([id]);
}
export async function annulerVisiteLibre(v: SuiviVente): Promise<void> {
  await majSuivi(v.id, { statut: 'annulee' });
  const rdv = (v.donnees || {}).rdv_id;
  if (typeof rdv === 'string' && rdv) {
    const { error } = await supabase.from('rendez_vous').update({ statut: 'annule' }).eq('id', rdv);
    if (error) signalerEchec('La visite est annulée, mais son rendez-vous dans l’agenda', error.message);
  }
}
/* Les visites encore prévues d'un bien qui se vend ou se retire (V3.48) :
   celles des acheteurs suivis (table visites, sur leur copie du bien) et
   celles hors CRM (le suivi du bien). Elles s'annulent — le rendez-vous de
   l'agenda aussi —, l'acheteur le lit dans son Suivi et ne la voit plus dans
   son espace. Rend le nombre de visites annulées ; jamais bloquant. */
/* V3.50 : seulement celles encore à venir, jour ET heure, à l'heure de
   Paris — une visite de ce matin, déjà faite, reste « compte rendu à faire »
   au lieu de devenir « Visite annulée » dans le Suivi de l'acheteur. Celles
   des acheteurs suivis passent par annulerVisites (leur rappel se ferme). */
export async function annulerVisitesPrevues(b: BienVente, pourquoi: string): Promise<number> {
  const maintenant = Date.now();
  let n = 0;
  try {
    const { data: libres, error } = await supabase.from('biens_vente_suivi').select('*').eq('bien_id', b.id).eq('type', 'visite').eq('statut', 'a_venir');
    if (error) signalerEchec('Les visites prévues', error.message);
    for (const v of (libres || []) as SuiviVente[]) {
      const t = Date.parse(v.le || '');
      if (Number.isFinite(t) && t <= maintenant) continue;
      try { await annulerVisiteLibre(v); n++; } catch (e) { signalerEchec('Une visite prévue', (e as Error).message); }
    }
    const { data: copies, error: e1 } = await supabase.from('biens').select('id').eq('bien_vente_id', b.id);
    if (e1) signalerEchec('Les visites des acheteurs', e1.message);
    const ids = ((copies || []) as { id: string }[]).map(x => x.id);
    if (ids.length) {
      const { data: vis, error: e2 } = await supabase.from('visites').select('id, date_visite, heure').in('bien_id', ids).eq('statut', 'a_venir');
      if (e2) signalerEchec('Les visites des acheteurs', e2.message);
      const aVenir = ((vis || []) as { id: string; date_visite: string | null; heure: string | null }[])
        .filter(v => !v.date_visite || !visitePasseeParis(v));
      if (aVenir.length) n += await annulerVisites(aVenir.map(v => v.id), { pourquoi });
    }
  } catch (e) { signalerEchec('Les visites prévues', (e as Error).message); }
  return n;
}

/* V3.50 — Un bien vendu ou retiré : les demandes des acheteurs sur ce bien
   (« Veut visiter — », « Veut faire une offre — », « Veut revoir — », « Il
   réfléchit — ») n'ont plus d'objet. Sans elles, elles restaient dans les
   Relances alors que la demande avait quitté Visites › Demandes. Jamais
   bloquant. Pas pour une mise en pause : la vente peut reprendre. */
export async function solderDemandesDuBien(b: BienVente): Promise<void> {
  try {
    const { data, error } = await supabase.from('biens').select('client_id, titre').eq('bien_vente_id', b.id);
    if (error) { signalerEchec('Les demandes des acheteurs sur ce bien', error.message); return; }
    for (const c of (data || []) as { client_id: string | null; titre: string | null }[]) {
      if (!c.client_id) continue;
      const e1 = await solderRelancesVisite(c.client_id, [c.titre]);
      const e2 = await solderRelancesRetourVisite(c.client_id, [c.titre]);
      if (e1 || e2) signalerEchec('Les demandes des acheteurs sur ce bien', (e1 || e2) as string);
    }
  } catch (e) { signalerEchec('Les demandes des acheteurs sur ce bien', (e as Error).message); }
}

/* Un horodatage déjà passé (une visite hors CRM : `le` porte son jour et son heure). */
export const instantPasse = (iso: string | null | undefined): boolean => {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) && t <= Date.now();
};

/* ── Déplacer une visite (V3.50) ──
   Alexandre : une visite décalée se refaisait (annuler, replanifier), et
   celle avec quelqu'un hors du CRM ne se déplaçait nulle part. */
const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const jourAgenda = (d: Date) => `${JOURS_FR[d.getDay()]} ${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS_FR[d.getMonth()]}`;
const ymdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/* Avec un acheteur suivi : la visite (jour, heure ; le rappel du client
   repart), son rappel dans les Relances suit la nouvelle date, et son Suivi
   le dit. */
export async function deplacerVisiteCRM(b: BienVente, v: VisiteRow, x: { date: string; heure: string; duree?: number }): Promise<void> {
  const avant = { date: String(v.date_visite || '').slice(0, 10), heure: String(v.heure || '').slice(0, 5) };
  const patch = { date_visite: x.date, heure: x.heure || null, ...(x.duree ? { duree_min: x.duree } : {}) };
  /* Seule la durée change : le rappel déjà envoyé reste juste, rien d'autre à faire. */
  const bouge = x.date !== avant.date || (x.heure || '') !== avant.heure;
  let r = await supabase.from('visites').update(bouge ? { ...patch, rappel_envoye_le: null } : patch).eq('id', v.id).eq('statut', 'a_venir').select('id');
  /* `rappel_envoye_le` n'existe qu'après le SQL du rappel de visite. */
  if (r.error && /rappel_envoye_le/.test(r.error.message)) r = await supabase.from('visites').update(patch).eq('id', v.id).eq('statut', 'a_venir').select('id');
  if (r.error) lever('La visite n’a pas pu être déplacée', r.error.message);
  if (!(r.data || []).length) throw new Error('La visite n’a pas pu être déplacée : elle n’est plus prévue (faite ou annulée entre-temps). Recharge la fiche.');
  /* Son rappel (« Rendez-vous : Visite … »), à la même distance de la visite qu'avant. */
  const relId = typeof v.rappel_relance_id === 'string' ? v.rappel_relance_id : '';
  if (relId && bouge) {
    try {
      /* Un rappel partagé par une tournée de plusieurs visites (agenda) reste
         à sa place : les autres visites gardent leur date. */
      const { data: autres, error: eA } = await supabase.from('visites').select('id').eq('rappel_relance_id', relId).eq('statut', 'a_venir').neq('id', v.id).limit(1);
      if (eA) throw new Error(eA.message);
      const { data: rel, error } = autres?.length ? { data: null, error: null } : await supabase.from('relances').select('id, date_echeance, note').eq('id', relId).maybeSingle();
      if (error) throw new Error(error.message);
      if (rel) {
        const ancienne = rel.date_echeance ? new Date(rel.date_echeance as string) : null;
        const ecart = ancienne && avant.date ? Math.round((new Date(`${avant.date}T12:00:00`).getTime() - new Date(`${ymdLocal(ancienne)}T12:00:00`).getTime()) / 86_400_000) : 1;
        const quand = new Date(`${x.date}T12:00:00`);
        quand.setDate(quand.getDate() - Math.max(0, Math.min(7, ecart)));
        const aMidi = new Date(); aMidi.setHours(12, 0, 0, 0);
        if (ymdLocal(quand) < ymdLocal(new Date())) quand.setTime(aMidi.getTime());
        const debut = new Date(`${x.date}T${x.heure || '12:00'}:00`);
        const note = String(rel.note || '').includes(' · ')
          ? String(rel.note).replace(/ · [^·]*$/, ` · ${jourAgenda(debut)} à ${x.heure || '?'}`)
          : String(rel.note || `Rendez-vous : Visite · ${b.titre || titreBien(b.donnees || {})} · ${jourAgenda(debut)} à ${x.heure || '?'}`);
        const u = await supabase.from('relances').update({ statut: 'en_attente', date_echeance: quand.toISOString(), note }).eq('id', relId);
        if (u.error) throw new Error(u.error.message);
      }
    } catch (e) { signalerEchec('La visite est déplacée, mais son rappel dans tes Relances', (e as Error).message); }
  }
  const titre = b.titre || titreBien(b.donnees || {});
  const aH = (h: string) => (h ? ` à ${h.replace(':', ' h ')}` : '');
  if (x.date === avant.date && (x.heure || '') === avant.heure) return;
  await addJournal(v.client_id, 'visite_planifiee', `📅 Visite déplacée — ${titre}`,
    `Le ${dateLongue(x.date)}${aH(x.heure)}${avant.date ? ` (au lieu du ${dateLongue(avant.date)}${aH(avant.heure)})` : ''}`,
    { bien_vente_id: b.id }, { rechercheId: v.recherche_id, bienId: v.bien_id });
}
/* Avec quelqu'un hors du CRM : sa ligne dans l'historique du bien, et son
   rendez-vous dans l'agenda s'il en a un. */
export async function deplacerVisiteLibre(b: BienVente, v: SuiviVente, x: { date: string; heure: string; duree: number }): Promise<SuiviVente> {
  const debut = new Date(`${x.date}T${x.heure || '12:00'}:00`);
  if (isNaN(debut.getTime())) throw new Error('La date ou l’heure de la visite est illisible.');
  const d = (v.donnees || {}) as Record<string, unknown>;
  const ligne = await majSuivi(v.id, { le: debut.toISOString(), donnees: { ...d, duree: x.duree } });
  const rdv = typeof d.rdv_id === 'string' ? d.rdv_id : '';
  if (rdv) {
    const r = await supabase.from('rendez_vous').update({ debut: debut.toISOString(), fin: new Date(debut.getTime() + (x.duree || 45) * 60000).toISOString() }).eq('id', rdv);
    if (r.error) signalerEchec('La visite est déplacée, mais son rendez-vous dans l’agenda', r.error.message);
  }
  return ligne;
}

/* ── Un créneau déjà pris ? (V3.50) ──
   Comme l'agenda : ce qui chevauche le créneau ce jour-là — les visites des
   acheteurs, les rendez-vous, les visites hors CRM sans rendez-vous. Rend
   des lignes à afficher (« Visite · Paul Martin à 18 h ») ; une lecture qui
   échoue ne rend rien (ce n'est qu'un avertissement). */
export type CreneauPris = { debut: Date; fin: Date; titre: string };
export async function creneauxPris(date: string, heure: string, duree: number, sauf: { visite?: string; suivi?: string } = {}): Promise<CreneauPris[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(heure)) return [];
  const debut = new Date(`${date}T${heure.slice(0, 5)}:00`);
  const fin = new Date(debut.getTime() + (duree || 45) * 60000);
  const jour0 = new Date(`${date}T00:00:00`), jour1 = new Date(jour0.getTime() + 86_400_000);
  /* La visite hors CRM qu'on déplace : son propre rendez-vous d'agenda ne
     la gêne pas (V3.50 — elle s'annonçait « déjà prise » par elle-même). */
  let rdvSauf = '';
  if (sauf.suivi) {
    const { data } = await supabase.from('biens_vente_suivi').select('donnees').eq('id', sauf.suivi).maybeSingle();
    const r0 = (data?.donnees as Record<string, unknown> | null)?.rdv_id;
    if (typeof r0 === 'string') rdvSauf = r0;
  }
  const [vis, rdv, sv] = await Promise.all([
    supabase.from('visites').select('id, date_visite, heure, duree_min, clients(prenom, nom), biens(titre, ville)').eq('date_visite', date).eq('statut', 'a_venir'),
    supabase.from('rendez_vous').select('id, titre, debut, fin, statut').gte('debut', jour0.toISOString()).lt('debut', jour1.toISOString()),
    supabase.from('biens_vente_suivi').select('id, le, qui, donnees').eq('type', 'visite').eq('statut', 'a_venir').gte('le', jour0.toISOString()).lt('le', jour1.toISOString()),
  ]);
  const out: CreneauPris[] = [];
  const chevauche = (a: Date, z: Date) => a < fin && z > debut;
  for (const v of ((vis.error ? [] : vis.data) || []) as unknown as { id: string; heure: string | null; duree_min: number | null; clients?: { prenom?: string | null; nom?: string | null } | null; biens?: { titre?: string | null; ville?: string | null } | null }[]) {
    if (v.id === sauf.visite || !v.heure) continue;
    const a = new Date(`${date}T${String(v.heure).slice(0, 5)}:00`), z = new Date(a.getTime() + (v.duree_min || 60) * 60000);
    if (chevauche(a, z)) out.push({ debut: a, fin: z, titre: `Visite · ${nomClient(v.clients)}${v.biens?.titre ? ` (${v.biens.titre})` : ''}` });
  }
  for (const r of ((rdv.error ? [] : rdv.data) || []) as { id: string; titre: string | null; debut: string; fin: string | null; statut: string | null }[]) {
    if (r.statut === 'annule' || (rdvSauf && r.id === rdvSauf)) continue;
    const a = new Date(r.debut), z = r.fin ? new Date(r.fin) : new Date(a.getTime() + 3_600_000);
    if (chevauche(a, z)) out.push({ debut: a, fin: z, titre: r.titre || 'Un rendez-vous' });
  }
  for (const x of ((sv.error ? [] : sv.data) || []) as { id: string; le: string; qui: string | null; donnees: Record<string, unknown> | null }[]) {
    if (x.id === sauf.suivi || (x.donnees && typeof x.donnees.rdv_id === 'string' && x.donnees.rdv_id)) continue;
    const a = new Date(x.le), z = new Date(a.getTime() + (Number(x.donnees?.duree) || 45) * 60000);
    if (chevauche(a, z)) out.push({ debut: a, fin: z, titre: `Visite · ${x.qui || 'hors CRM'}` });
  }
  return out.sort((p, q) => p.debut.getTime() - q.debut.getTime());
}
export async function ficheClient(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  if (error || !data) throw new Error('La fiche du client n’a pas pu être ouverte.' + (error ? ` ${error.message}` : ''));
  return data as Record<string, unknown>;
}

/* ══ Les acheteurs qui correspondent ══════════════════════════════════════
   La même note que dans l'espace de l'acheteur (src/lib/correspondance.ts),
   sur ses recherches actives, hors propriétaire.

   V3.99 (Alexandre : « ça me met des noms alors que je n'ai rien prévu, je ne
   suis pas convaincu ») : une recherche qui ne dit pas son budget ET son
   secteur n'était jugée que sur le reste : trois critères suffisaient pour
   sortir à 100 % sur n'importe quel bien. Elle passe « À compléter » (`rang`
   'incomplet') ; les compteurs (onglet, liste des biens, envoi groupé) ne
   comptent que les 'ok'.

   V3.112 (Alexandre : « les prospects, il faut les mettre aussi dans
   correspondre… tous ceux qui sont dans la case acheteur, sauf ceux qui sont
   archivés ou ceux qui ont trouvé ») : tout acheteur en cours compte
   (`acheteurSuivi`) — un contact acheteur, pas archivé, ni « Bien trouvé » ni
   « Perdu ». Un prospect correspond comme un actif ; son statut s'affiche à
   côté de son nom. */
export type RangAcheteur = 'ok' | 'incomplet';
export type Acheteur = {
  recherche: RechercheMini; client: ClientMini; corr: Correspondance; copie: Copie | null; rang: RangAcheteur; manque: string[];
  /* V3.112 : proposé quand même depuis « Pas montrés » — la raison, pour la fenêtre d'envoi. */
  horsListe?: string;
};
export const SEUIL_CORRESPOND = 70;
export const SEUIL_LISTE = 50;
/* Ce qui manque à une recherche pour être jugée : « budget », « secteur ». */
export function manqueRecherche(r: RechercheMini): string[] {
  const m: string[] = [];
  if (!(Number(r.budget_max) > 0)) m.push('budget');
  const sect = (r as Record<string, unknown>).secteurs;
  if (!Array.isArray(sect) || !sect.some(x => String(x || '').trim())) m.push('secteur');
  return m;
}
export const fiable = (x: Acheteur) => x.rang === 'ok';
/* V3.125 — Alexandre : « j'ai l'impression qu'il va chercher juste ceux qui
   sont en acheteur actif, et pas prospect ». La recherche d'un prospect naît
   « en attente » (`active` à false : sa veille attend qu'il passe Actif), et
   celle d'un acheteur en pause s'arrête avec lui. Le rapprochement, qui est
   un geste d'Alexandre, les regarde quand même ; une recherche arrêtée d'un
   acheteur actif (close, son bien trouvé) reste dehors. */
export const STATUTS_ATTENTE = ['prospect', 'suspendu'];
export const enAttente = (c: { statut?: unknown } | null | undefined) => !!c && STATUTS_ATTENTE.includes(String(c.statut || ''));
export const rechercheOuverte = (r: RechercheMini, c: ClientMini | null | undefined) => r.active !== false || enAttente(c);
/* Toutes les recherches que le rapprochement regarde. */
export function recherchesRappro(l: Pick<ListeBiens, 'recherches' | 'recherchesAttente'>): RechercheMini[] {
  const deja = new Set(l.recherches.map(r => r.id));
  return [...l.recherches, ...(l.recherchesAttente || []).filter(r => !deja.has(r.id))];
}
/* Un acheteur à qui l'on peut proposer un bien (V3.112). */
export const acheteurSuivi = (c: ClientMini | null | undefined): c is ClientMini =>
  !!c && acheteurEnCours(c) && !['bien_trouve', 'perdu'].includes(String(c.statut || ''));
/* Son statut, quand ce n'est pas « Actif » : à côté de son nom. */
export const STATUT_ACHETEUR: Record<string, string> = { prospect: 'Prospect', suspendu: 'En pause', offre_ecrite: 'Offre écrite' };
const copieDuBien = (b: BienVente, r: RechercheMini, copies: Copie[]) => copies.find(y => y.bien_vente_id === b.id && y.recherche_id === r.id) || null;

/* V3.45 : un critère essentiel nettement raté écarte l'acheteur, quelle que
   soit sa note (src/lib/ecart-acheteur.ts). */
export type Ecarte = { acheteur: Acheteur; raison: RaisonEcart };
export function acheteursTries(b: BienVente, recherches: RechercheMini[], clients: Record<string, ClientMini>, copies: Copie[]): { retenus: Acheteur[]; ecartes: Ecarte[] } {
  if (!b.donnees?.typeBien && !b.prix) return { retenus: [], ecartes: [] };
  const bc = versCorrespondance(b);
  const retenus: Acheteur[] = [];
  const ecartes: Ecarte[] = [];
  for (const r of recherches) {
    const c = clients[r.client_id];
    if (!rechercheOuverte(r, c)) continue;
    if (!acheteurSuivi(c)) continue;
    if (b.client_id && r.client_id === b.client_id) continue;
    if (!typeCompatible(b.donnees?.typeBien, r.type_bien)) continue;
    const cr = criteresDepuisRecherche(r);
    const corr = correspondance(bc, cr);
    if (!corr) continue;
    const manque = manqueRecherche(r);
    const x: Acheteur = { recherche: r, client: c, corr, copie: copieDuBien(b, r, copies), rang: manque.length ? 'incomplet' : 'ok', manque };
    const raison = raisonEcart(corr, bc, cr);
    if (raison) ecartes.push({ acheteur: x, raison });
    else retenus.push(x);
  }
  return { retenus: retenus.sort((x, y) => y.corr.note - x.corr.note), ecartes };
}
/* Ceux qui correspondent pour de bon : budget et secteur dits. */
export function acheteursPour(b: BienVente, recherches: RechercheMini[], clients: Record<string, ClientMini>, copies: Copie[]): Acheteur[] {
  return acheteursTries(b, recherches, clients, copies).retenus.filter(fiable);
}
/* V3.111 — Un client choisi à la main, dans l'envoi de plusieurs biens
   (Alexandre : « on ne peut pas choisir un client… il n'y a rien qui
   explique »). Ni seuil ni écart : c'est lui qui choisit. Sa note quand elle
   se calcule (le bon type de bien, trois critères comparables), sinon
   SANS_NOTE : l'écran n'affiche alors pas de pourcentage, l'historique non
   plus (noteJournal). */
export const SANS_NOTE = -1;
export function acheteurChoisi(b: BienVente, r: RechercheMini, c: ClientMini, copies: Copie[]): Acheteur {
  const corr = typeCompatible(b.donnees?.typeBien, r.type_bien) ? correspondance(versCorrespondance(b), criteresDepuisRecherche(r)) : null;
  const manque = manqueRecherche(r);
  return { recherche: r, client: c, corr: corr || { note: SANS_NOTE, lignes: [] }, copie: copieDuBien(b, r, copies), rang: manque.length ? 'incomplet' : 'ok', manque };
}
/* « · correspondance 82 % » dans l'historique du client ; rien sans note. */
export const noteJournal = (n: number) => (n >= 0 ? ` · correspondance ${n} %` : '');

/* ══ Le rapprochement d'un bien : tout le tri (V3.112) ════════════════════
   Alexandre : « je ne comprends pas… il faut mieux présenter, mieux
   expliquer ». Chaque recherche ouverte d'un acheteur en cours (hors
   propriétaire) tombe dans UNE case : correspond (70 % et plus), en partie
   (50 à 69 %), à compléter (sans budget ou sans secteur, 50 % et plus), ou
   pas montrée, avec sa raison. Les cases s'additionnent : leur somme est le
   nombre de recherches regardées (`total`). Les pas montrées sont rangées
   par raison, les plus proches d'abord (`ordre`). */
export type RaisonCache = RaisonEcart | 'loin' | 'type' | 'peu';
export const RAISONS_CACHE: Record<RaisonCache, { lib: string; sous: string }> = {
  secteur: { lib: 'Autre secteur', sous: 'Le bien n’est pas dans les villes qu’ils cherchent.' },
  type: { lib: 'Autre type de bien', sous: 'Ils cherchent autre chose.' },
  budget: { lib: 'Trop cher pour eux', sous: 'Plus de 10 % au-dessus de leur budget.' },
  surface: { lib: 'Trop petit', sous: 'Moins de 90 % de la surface qu’ils demandent.' },
  chambres: { lib: 'Pas assez de chambres', sous: 'Il leur en faut davantage.' },
  indispensable: { lib: 'Il manque un indispensable', sous: 'Un équipement qu’ils exigent n’y est pas.' },
  loin: { lib: 'Trop loin de leurs critères', sous: 'Moins de 50 % : trop de critères ne collent pas.' },
  peu: { lib: 'Trop peu de critères', sous: 'Leur recherche n’en dit pas assez pour comparer.' },
};
export type Cache = { raison: RaisonCache; recherche: RechercheMini; client: ClientMini; note: number | null; detail: string; ordre: number };
export type TriBien = { total: number; vide: boolean; bons: Acheteur[]; partiels: Acheteur[]; incomplets: Acheteur[]; caches: Cache[] };

function detailEcart(raison: RaisonEcart, corr: Correspondance, bc: ReturnType<typeof versCorrespondance>, cr: ReturnType<typeof criteresDepuisRecherche>): { detail: string; ordre: number } {
  if (raison === 'budget' && cr.budgetMax && bc.prix) {
    const plus = Math.round((bc.prix / cr.budgetMax - 1) * 100);
    return { detail: `+${plus} % · jusqu’à ${eurosSuivi(cr.budgetMax)}`, ordre: plus };
  }
  if (raison === 'secteur') {
    const villes = [...new Set(grouperSecteurs(cr.secteurs || []).map(v => v.ville))];
    return { detail: villes.slice(0, 3).join(', ') + (villes.length > 3 ? '…' : ''), ordre: -corr.note };
  }
  if (raison === 'surface') return { detail: cr.surfaceMin ? `${cr.surfaceMin} m² minimum` : '', ordre: -corr.note };
  if (raison === 'chambres') return { detail: cr.chambresMin ? `${cr.chambresMin} chambres minimum` : '', ordre: -corr.note };
  const manque = corr.lignes.filter(l => l.poids === 3 && l.etat === 'non').map(l => l.lib.toLowerCase());
  return { detail: manque.length ? `sans ${manque.join(', ')}` : '', ordre: -corr.note };
}

export function triBien(b: BienVente, recherches: RechercheMini[], clients: Record<string, ClientMini>, copies: Copie[]): TriBien {
  const t: TriBien = { total: 0, vide: !b.donnees?.typeBien && !b.prix, bons: [], partiels: [], incomplets: [], caches: [] };
  const bc = versCorrespondance(b);
  for (const r of recherches) {
    const c = clients[r.client_id];
    if (!rechercheOuverte(r, c)) continue;
    if (!acheteurSuivi(c)) continue;
    if (b.client_id && r.client_id === b.client_id) continue;
    t.total++;
    if (t.vide) continue;
    const cacher = (raison: RaisonCache, note: number | null, detail: string, ordre: number) => t.caches.push({ raison, recherche: r, client: c, note, detail, ordre });
    if (!typeCompatible(b.donnees?.typeBien, r.type_bien)) { cacher('type', null, r.type_bien ? `cherche : ${String(r.type_bien).toLowerCase()}` : '', 0); continue; }
    const cr = criteresDepuisRecherche(r);
    const corr = correspondance(bc, cr);
    if (!corr) { cacher('peu', null, 'pas assez de critères à comparer', 0); continue; }
    const raison = raisonEcart(corr, bc, cr);
    if (raison) { const d = detailEcart(raison, corr, bc, cr); cacher(raison, corr.note, d.detail, d.ordre); continue; }
    if (corr.note < SEUIL_LISTE) { cacher('loin', corr.note, `${corr.note} % de ses critères`, -corr.note); continue; }
    const manque = manqueRecherche(r);
    const x: Acheteur = { recherche: r, client: c, corr, copie: copieDuBien(b, r, copies), rang: manque.length ? 'incomplet' : 'ok', manque };
    if (manque.length) t.incomplets.push(x);
    else if (corr.note >= SEUIL_CORRESPOND) t.bons.push(x);
    else t.partiels.push(x);
  }
  const parNote = (p: Acheteur, q: Acheteur) => q.corr.note - p.corr.note;
  t.bons.sort(parNote); t.partiels.sort(parNote); t.incomplets.sort(parNote);
  t.caches.sort((p, q) => p.ordre - q.ordre);
  return t;
}

/* ══ Le bien ═══════════════════════════════════════════════════════════ */
/* Un bien neuf, à l'étape choisie au départ (à suivre, estimation, mandat).
   Un mandat déjà signé laisse sa ligne dans l'historique.
   V3.50 : créé avec son propriétaire, une ligne dans le Suivi de celui-ci
   (sauf `sansSuivi` : « Un mandat signé », dont la fenêtre du mandat écrit
   la ligne une fois validée). */
export async function creerBien(references: (string | null)[], etape: EtapeVente = 'estimation', donnees: Donnees = {}, o: { sansSuivi?: boolean } = {}): Promise<BienVente> {
  const maintenant = new Date().toISOString();
  const { data, error } = await supabase.from('biens_vente').insert({
    reference: referenceSuivante(references), etape, titre: 'Nouveau bien', etape_le: maintenant,
    ...(Object.keys(donnees).length ? { ...colonnesBien(donnees), titre: 'Nouveau bien' } : {}),
    donnees,
    ...(etape === 'mandat' ? { en_vente_le: maintenant } : {}),
  }).select().single();
  if (error) lever('Le bien n’a pas pu être créé', error.message);
  if (etape === 'mandat') await ajouterSuivi({ bien_id: (data as BienVente).id, type: 'etape', statut: 'mandat', donnees: { de: 'creation', depuis: 'creation' } });
  const proprio = (data as BienVente).client_id;
  if (proprio && !o.sansSuivi) await noterProprioRelie(data as BienVente, proprio, true);
  return data as BienVente;
}

/* ══ Une nouvelle vente d'un bien déjà vendu (V3.47) ═══════════════════
   Alexandre : « si dans 5 ans le bien revient à la vente, est-ce qu'il faut
   recréer un bien ou partir de celui-là ? ». Une nouvelle fiche, qui reprend
   la description du bien (adresse, surfaces, pièces, intérieur, extérieur,
   diagnostics, copropriété, observations) ; le propriétaire, le prix, le
   mandat, les infos de visite, l'annonce et les photos repartent de zéro.
   La vente d'avant reste telle quelle — son historique, ses honoraires —
   et les deux fiches se citent (`venteAvant`, `venteSuivante`). */
const PARTIES_REPRISES = ['bien', 'interieur', 'exterieur', 'pieces', 'energie', 'copro', 'observations'];
export async function nouvelleVente(b: BienVente, references: (string | null)[], o: { proprio: ClientMini | null; etape: 'a_suivre' | 'estimation' }): Promise<BienVente> {
  const ancien = (b.donnees || {}) as Donnees;
  const cles = new Set<string>(['gps', ...ETAPES_BIEN.filter(e => PARTIES_REPRISES.includes(e.id)).flatMap(e => e.champs.map(c => (c as { cle?: string }).cle || '')).filter(Boolean)]);
  const d: Donnees = {};
  /* Les notes de l'ancien vendeur (« pas sous… ») restent sur l'ancienne fiche. */
  for (const k of Object.keys(ancien)) if (cles.has(k) && !k.startsWith('t-') && k !== 'notes') d[k] = ancien[k];
  if (o.proprio) Object.assign(d, donneesProprio(o.proprio));
  d.venteAvant = { id: b.id, reference: b.reference || null, venduLe: b.vendu_le || null };
  const maintenant = new Date().toISOString();
  const { data, error } = await supabase.from('biens_vente').insert({
    reference: referenceSuivante(references), etape: o.etape, etape_le: maintenant, ...colonnesBien(d), donnees: d,
  }).select().single();
  if (error) lever('La nouvelle vente n’a pas pu être créée', error.message);
  const neuf = data as BienVente;
  try { await ajouterSuivi({ bien_id: neuf.id, type: 'etape', statut: o.etape, donnees: { de: 'creation', depuis: 'revente', venteAvant: b.reference || '' } }); }
  catch (e) { signalerEchec('L’historique de la nouvelle vente', (e as Error).message); }
  if (o.proprio) { await marquerVendeur(o.proprio.id); await noterProprioRelie(neuf, o.proprio.id, true); }
  /* L'ancienne fiche dit qu'il y a une suite. */
  try {
    const { data: frais, error: e1 } = await supabase.from('biens_vente').select('donnees').eq('id', b.id).maybeSingle();
    if (e1) throw new Error(e1.message);
    const dd = { ...(((frais as { donnees?: Donnees } | null)?.donnees) || ancien), venteSuivante: { id: neuf.id, reference: neuf.reference || null } };
    const { error: e2 } = await supabase.from('biens_vente').update({ donnees: dd }).eq('id', b.id);
    if (e2) throw new Error(e2.message);
  } catch (e) { signalerEchec('Le lien vers la nouvelle vente', (e as Error).message); }
  return neuf;
}

/* Les réponses à écrire : celles de la base, relues maintenant, avec
   seulement ce que l'écran a changé depuis `base` (V3.43). */
async function fusion(id: string, d: Donnees, base: Donnees): Promise<Donnees> {
  const cles = Array.from(new Set([...Object.keys(d), ...Object.keys(base)]));
  const changees = cles.filter(k => JSON.stringify(d[k]) !== JSON.stringify(base[k]));
  const { data: frais, error } = await supabase.from('biens_vente').select('donnees').eq('id', id).maybeSingle();
  if (error) lever('Le bien n’a pas pu être relu avant l’enregistrement', error.message);
  const out: Donnees = { ...(((frais as { donnees?: Donnees } | null)?.donnees) || base) };
  for (const k of changees) { if (d[k] === undefined) delete out[k]; else out[k] = d[k]; }
  return out;
}

/* Enregistrer la fiche (V3.43). `base` : les réponses telles que cet écran
   les avait reçues (ou telles qu'il les a enregistrées la dernière fois).
   Seules les clés qu'il a changées depuis sont posées sur la fiche relue en
   base ; les autres restent comme elles y sont. Avant, chaque clic réécrivait
   toutes les réponses depuis l'écran : la fiche ouverte sur l'ordinateur
   effaçait ce que la tablette venait d'enregistrer (la visite sur place), ou
   le mandat que la signature en ligne venait d'y noter. Sans `base`, tout est
   réécrit, comme avant. */
/* V3.50 : `rdvGere` — la fenêtre a déjà planifié le rendez-vous d'estimation
   (planifierEstimation) : l'éditeur, lui, ne donne qu'une date, et l'agenda
   suit ici. Les jalons de l'estimation (l'avis de valeur envoyé, le
   propriétaire relié) se notent ici, quel que soit l'écran qui les pose. */
export async function enregistrerBien(id: string, d: Donnees, base?: Donnees | null, o: { rdvGere?: boolean } = {}): Promise<BienVente> {
  let aEcrire = base ? await fusion(id, d, base) : d;
  const change = (k: string) => !!base && JSON.stringify(d[k] ?? '') !== JSON.stringify(base[k] ?? '');
  const cols = colonnesBien(aEcrire);
  /* Une date complète seulement : un champ date en cours de frappe passe par
     des valeurs vides ou absurdes, qui annuleraient le rendez-vous. Pour
     l'annuler, c'est la fenêtre de l'estimation (ou l'agenda). */
  if (base && !o.rdvGere && change('rdvEstimation') && dateValide(d.rdvEstimation)) aEcrire = await suivreRdvEditeur({ id, client_id: cols.client_id, titre: cols.titre, reference: null }, aEcrire, txtD(base, 'rdvEstimation'));
  const { data, error } = await supabase.from('biens_vente').update({
    donnees: aEcrire, ...colonnesBien(aEcrire), updated_at: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) lever('Le bien n’a pas pu être enregistré', error.message);
  let row = data as BienVente;
  await repercuterPrix(id, aEcrire, row.etape);
  /* V3.48 : un autre propriétaire relié (ou plus personne). */
  const ancien = base && typeof base.clientId === 'string' && base.clientId ? base.clientId : null;
  const nouveau = row.client_id || null;
  if (ancien && ancien !== nouveau) await changementProprio(row, ancien, nouveau);
  /* V3.50 : un premier propriétaire relié — une ligne dans son Suivi (« Nouveau
     bien à vendre » si la fiche a été créée il y a peu). */
  else if (base && !ancien && nouveau) await noterProprioRelie(row, nouveau, Date.now() - Date.parse(row.created_at || '') < 6 * 3_600_000);
  /* V3.50 : l'avis de valeur, une date posée ou changée (complète et
     plausible) — après l'enregistrement, pour ne rien noter d'un bien qui
     n'a pas été enregistré. Sa relance est gardée avec le bien. */
  if (change('avisEnvoye') && dateValide(d.avisEnvoye)) {
    try {
      const rel = await avisEnvoye(row, aEcrire, d.avisEnvoye);
      if (rel || txtD(aEcrire, 'relanceAvis')) row = await poserDansBien(id, { relanceAvis: rel });
    } catch (e) { signalerEchec('L’avis de valeur', (e as Error).message); }
  }
  /* La date de l'avis effacée (une erreur de saisie) : sa relance « faire le
     point » n'a plus d'objet. */
  else if (change('avisEnvoye') && !txtD(d, 'avisEnvoye') && txtD(base || {}, 'avisEnvoye')) {
    try {
      await cloreRelancesEstimation({ ...row, donnees: aEcrire }, 'avis');
      if (txtD(aEcrire, 'relanceAvis')) row = await poserDansBien(id, { relanceAvis: '' });
    } catch (e) { signalerEchec('La relance de l’avis de valeur', (e as Error).message); }
  }
  return row;
}

/* Le propriétaire change en cours de route (V3.48) : les relances en
   attente de ce bien (réponse à une offre, rappels du compromis) passent au
   nouveau ; l'ancien n'est plus « vendeur » s'il n'a pas d'autre bien en
   vente ; les deux Suivis le disent. Jamais bloquant. */
async function changementProprio(b: BienVente, ancien: string, nouveau: string | null): Promise<void> {
  const titre = b.titre || titreBien(b.donnees || {});
  try {
    if (nouveau) {
      const { data: lignes, error } = await supabase.from('biens_vente_suivi').select('type, statut, donnees').eq('bien_id', b.id).in('type', ['offre', 'etape']);
      if (error) signalerEchec('Les relances du bien', error.message);
      const ids = new Set<string>();
      /* V3.50 : les relances de l'estimation (faire le point, recontacter) aussi. */
      for (const k of ['relanceAvis', 'relanceReprise']) { const v = (b.donnees || {})[k]; if (typeof v === 'string' && v) ids.add(v); }
      for (const l of (lignes || []) as { type: string; statut: string | null; donnees: Record<string, unknown> | null }[]) {
        const d = l.donnees || {};
        if (l.type === 'offre' && typeof d.relance_id === 'string' && d.relance_id) ids.add(d.relance_id);
        if (l.type === 'etape' && l.statut === 'compromis' && d.rappels && typeof d.rappels === 'object') {
          for (const v of Object.values(d.rappels as Record<string, unknown>)) if (typeof v === 'string' && v) ids.add(v);
        }
      }
      if (ids.size) {
        const r = await supabase.from('relances').update({ client_id: nouveau }).in('id', Array.from(ids)).eq('client_id', ancien).eq('statut', 'en_attente');
        if (r.error) signalerEchec('Les relances du bien, chez le nouveau propriétaire', r.error.message);
      }
    }
    /* V3.137 : l'ancien et le nouveau propriétaire prennent le type que
       leurs biens leur donnent (Vendeur si l'un est en vente, Propriétaire
       sinon). Le bien est déjà relié au nouveau en base. */
    await marquerVendeur(ancien);
    if (nouveau) await marquerVendeur(nouveau);
    await addJournal(ancien, 'statut_change', `🏠 N’est plus le propriétaire de ${titre}`, nouveau ? 'Un autre propriétaire a été relié au bien.' : 'Le bien n’a plus de propriétaire relié.');
    if (nouveau) await addJournal(nouveau, 'statut_change', `🏠 Propriétaire de ${titre}`, 'Relié au bien en cours de route : les relances du bien passent chez lui.');
  } catch (e) { signalerEchec('Le changement de propriétaire', (e as Error).message); }
}

/* Le prix suit chez les acheteurs (V3.33). Un bien présenté à un acheteur
   est COPIÉ dans son dossier (table `biens`, versBienAcheteur), prix compris :
   son espace et la page /bien/<id> lisent la copie. Sans ceci, une baisse de
   prix restait invisible pour tous ceux qui avaient déjà reçu le bien.
   Ne touche que les copies dont le prix diffère : quand rien n'a changé (la
   plupart des enregistrements), aucune ligne n'est écrite.
   V3.113 : `etape` — avant le mandat, les copies n'ont pas de prix
   (prixCopie) ; le prix leur arrive quand le bien passe sous mandat. */
export async function repercuterPrix(id: string, d: Donnees, etape?: string | null): Promise<void> {
  const p = prixCopie(d, etape);
  const differe = (['prix_acquereur', 'prix_vendeur', 'commission_val'] as const)
    .map(c => (p[c] === null || p[c] === undefined ? `${c}.not.is.null` : `${c}.is.null,${c}.neq.${p[c]}`)).join(',');
  const { error } = await supabase.from('biens').update(p).eq('bien_vente_id', id).or(differe);
  if (error && !/bien_vente_id/.test(error.message)) signalerEchec('Le nouveau prix chez les acheteurs qui ont reçu le bien', error.message);
}

/* Le prix a changé (V3.48) : le texte de l'annonce chez les acheteurs qui
   ont reçu le bien (leur copie, `description`) le cite peut-être encore. */
export async function majPrixDansAnnonces(bienId: string, vieux: string, neuf: string): Promise<void> {
  if (!vieux || vieux === neuf) return;
  const { data, error } = await supabase.from('biens').select('id, description').eq('bien_vente_id', bienId);
  if (error) { if (!/bien_vente_id/.test(error.message)) signalerEchec('Le prix dans l’annonce des acheteurs', error.message); return; }
  for (const c of (data || []) as { id: string; description: string | null }[]) {
    if (!c.description || !c.description.includes(vieux)) continue;
    const r = await supabase.from('biens').update({ description: c.description.split(vieux).join(neuf) }).eq('id', c.id);
    if (r.error) signalerEchec('Le prix dans l’annonce des acheteurs', r.error.message);
  }
}

/* Quelques clés de `donnees`, posées sur la fiche relue en base (V3.50) : un
   id de relance, une date de point vendeur. Rien d'autre ne bouge. */
export async function poserDansBien(id: string, patch: Donnees): Promise<BienVente> {
  const out = await fusion(id, patch, {});
  const { data, error } = await supabase.from('biens_vente').update({ donnees: out, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) lever('Le bien n’a pas pu être enregistré', error.message);
  return data as BienVente;
}

export async function majBien(id: string, patch: Partial<BienVente>): Promise<BienVente> {
  const { data, error } = await supabase.from('biens_vente').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) lever('Le bien n’a pas pu être modifié', error.message);
  return data as BienVente;
}

/* Un bien tout juste créé et refermé sans rien dedans ne reste pas. */
/* Un nouveau bien laissé vide se supprime à la fermeture. V3.48 : « vide »
   veut dire vraiment rien — avant, des pièces détaillées, un document du
   dossier ou une note ne comptaient pas, et le bien partait avec. Seuls les
   réglages par défaut (qui vend, à la charge de qui…) ne comptent pas. */
const CLES_SANS_CONTENU = ['qui', 'proprioNouveau', '_stade', 'charge', 'honoMode', 'dpeStatut'];
const rempli = (v: unknown): boolean => v === true || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && !!v.trim())
  || (Array.isArray(v) && v.some(rempli)) || (!!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v as Record<string, unknown>).some(rempli));
export function bienVide(d: Donnees): boolean {
  return !Object.entries(d).some(([k, v]) => !CLES_SANS_CONTENU.includes(k) && !k.startsWith('t-') && rempli(v));
}

/* V3.43 : la ligne d'abord, les fichiers ensuite (un fichier en trop ne
   gêne personne, un fichier en moins se voit). Et les photos ne partent pas
   quand des acheteurs ont reçu le bien : leur copie (table biens) montre
   les mêmes fichiers, dans leur espace et sur la page /bien/<id>. */
/* V3.50 : un bien vendu ne se supprime pas — sa ligne « vendu » porte les
   honoraires du chiffre d'affaires. On l'archive. */
export const MESSAGE_VENDU_SUPPR = 'Ce bien est vendu : le supprimer effacerait la vente de ton chiffre d’affaires. Archive-le plutôt.';
export async function supprimerBien(b: BienVente): Promise<void> {
  if (b.etape === 'vendu') throw new Error(MESSAGE_VENDU_SUPPR);
  const partage = await bienPartage(b.id);
  const { error } = await supabase.from('biens_vente').delete().eq('id', b.id);
  if (error) lever('Le bien n’a pas pu être supprimé', error.message);
  /* V3.50 : ses relances d'estimation se closent, son rendez-vous d'estimation
     encore à venir quitte l'agenda. */
  await cloreRelancesEstimation(b);
  const rdv = (b.donnees || {}).rdvEstimationRdv, jour = (b.donnees || {}).rdvEstimation;
  if (typeof rdv === 'string' && rdv && (!dateValide(jour) || jour >= aujourdhui())) {
    const r = await supabase.from('rendez_vous').update({ statut: 'annule' }).eq('id', rdv);
    if (r.error) signalerEchec('Le rendez-vous d’estimation, dans l’agenda', r.error.message);
  }
  const chemins = lirePhotos(b.donnees?.photos).map(p => p.chemin).filter(Boolean);
  if (chemins.length && !partage) {
    const { error: e2 } = await supabase.storage.from('photos-vente').remove(chemins);
    if (e2) signalerEchec('La suppression des photos du bien', e2.message);
  }
  try { await api({ action: 'tout', id: b.id }); } catch (e) { signalerEchec('La suppression des pièces du dossier du bien', (e as Error).message); }
}

/* Le bien a-t-il été présenté ou mis en sélection chez un acheteur ? Dans
   le doute (lecture impossible), oui : on garde les photos. */
async function bienPartage(bienId: string): Promise<boolean> {
  const { data, error } = await supabase.from('biens').select('id').eq('bien_vente_id', bienId).limit(1);
  return !!error || !!(data && data.length);
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
/* V3.126 — « Pas pour lui » : un acheteur écarté à la main des rapprochements
   d'un bien. Une ligne de son suivi (type « note », `donnees.pasPourLui`,
   avec la recherche et le client) : visible dans l'historique, et « Le
   remettre » la supprime. */
export const estPasPourLui = (x: Pick<SuiviVente, 'type' | 'donnees' | 'recherche_id'>) => x.type === 'note' && (x.donnees as Record<string, unknown> | null)?.pasPourLui === true && !!x.recherche_id;
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
  /* Les réponses de la fenêtre sont posées sur la fiche relue en base : seul
     ce qu'elle a changé part (V3.43). */
  const d = o.donnees ? await fusion(b.id, o.donnees, b.donnees || {}) : b.donnees || {};
  const patch: Record<string, unknown> = {
    etape, etape_le: maintenant, updated_at: maintenant,
    ...(o.donnees ? { donnees: d, ...colonnesBien(d) } : {}),
    ...(etape === 'mandat' && !b.en_vente_le ? { en_vente_le: maintenant } : {}),
    ...(etape === 'vendu' ? { vendu_le: o.vendu_le || aujourdhui() } : {}),
  };
  const { data, error } = await supabase.from('biens_vente').update(patch).eq('id', b.id).select().single();
  if (error) lever('L’étape n’a pas pu être changée', error.message);
  /* V3.113 : le bien passe sous mandat (ou y revient d'avant) : le prix
     arrive chez les acheteurs qui l'ont reçu sans prix (ou en repart). */
  if (avantMandat(b.etape) !== avantMandat(etape)) await repercuterPrix(b.id, (data as BienVente).donnees || d, etape);
  const ligne = await ajouterSuivi({
    bien_id: b.id, type: 'etape', statut: etape, commentaire: o.commentaire || null,
    donnees: { de: b.etape, ...(o.infos || {}) },
  });
  /* V3.137 : le bien entre en vente ou en sort — son propriétaire passe
     Vendeur ou redevient Propriétaire (la base le fait aussi, voir
     `marquerVendeur`). Vendu : « La vente est signée » décide. */
  const proprio = (data as BienVente).client_id;
  if (proprio && ETAPES_EN_VENTE.includes(b.etape) !== ETAPES_EN_VENTE.includes(etape)) await marquerVendeur(proprio);
  return { bien: data as BienVente, ligne };
}

/* Annuler un mandat noté par erreur (V3.42) : le mandat quitte la fiche, le
   bien revient à l'étape choisie (src/lib/mandat-bien.ts). */
export async function annulerMandatNote(b: BienVente, o: RetraitMandat): Promise<BienVente> {
  const r = await retirerMandatDuBien(supabase, b, o);
  if (r.avertissement) signalerEchec('La fiche du bien', r.avertissement);
  return r.bien;
}

/* ══ Les acheteurs suivis ══════════════════════════════════════════════
   Présenter le bien = le poser dans le dossier de l'acheteur (table biens,
   étape « presente »), exactement comme un bien trouvé pour lui. Il le voit
   dans son espace, avec la note de correspondance. */
/* V3.134 : exportée — l'agenda s'en sert quand une visite porte sur un bien
   de l'agence qui n'est pas encore dans le dossier de l'acheteur. */
export async function copieDe(b: BienVente, clientId: string, rechercheId: string, badge?: string): Promise<{ copie: Copie; neuve: boolean }> {
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

/* V3.89 : `suite: false` (plusieurs biens d'un coup, depuis la liste) : ni
   relance ni notification ici — une seule par acheteur, posée par l'appelant
   (suiteEnvoi), au lieu d'une par bien. */
export async function envoyerDansEspace(b: BienVente, l: Acheteur[], o: { suite?: boolean } = {}): Promise<{ n: number; erreurs: string[] }> {
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
        description: `${b.titre || titreBien(b.donnees)}${b.prix ? ` · ${b.prix.toLocaleString('fr-FR')} €` : ''}${noteJournal(a.corr.note)}`,
        metadata: { bien_vente_id: b.id },
      });
      if (eJ) signalerEchec('Le bien est présenté, mais l’historique du client', eJ.message);
      if (o.suite !== false) await suiteEnvoi(a.client.id, a.recherche.id, 1);
    } catch (e) {
      erreurs.push(`${nomClient(a.client)} : ${(e as Error).message}`);
    }
  }
  return { n, erreurs };
}

/* Après une présentation : la relance « sans réponse » (une par dossier,
   jamais une par bien) et la notification sur son téléphone, s'il a
   installé son espace et l'a acceptée (on n'attend pas la réponse). */
export async function suiteEnvoi(clientId: string, rechercheId: string, nbBiens: number): Promise<void> {
  await programmerRelance(clientId, rechercheId, nbBiens);
  fetch('/api/notifier', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recherche_id: rechercheId }),
  }).catch(() => { /* sans effet sur l'envoi */ });
}

/* ══ Le mail d'envoi, pour un acheteur, depuis la liste des biens (V3.89) ══
   Alexandre coche plusieurs biens, choisit des acheteurs : chacun reçoit UN
   mail, à son prénom, avec ses biens à lui. Le même chemin que le mail
   d'envoi de sa fiche (FicheClient, saveEnvoiBien) :
   · les biens entrent d'abord dans son dossier (mettreEnSelection) ;
   · /api/send-mail en mode « biens » envoie, remplace {{prénom}}…, et note
     l'envoi (communications) et la ligne « 📤 Sélection envoyée » du Suivi ;
   · puis, le mail parti, chaque bien passe « Présenté » (canal mail), une
     ligne par bien dans son Suivi, la relance et la notification.
   ⚠️ Si saveEnvoiBien change ce qui suit un envoi, le changer ici aussi.
   Lève une erreur lisible si le mail ne part pas : rien n'est marqué
   présenté (les biens restent dans sa sélection). */
export async function envoyerParMail(l: { bien: BienVente; acheteur: Acheteur }[], mail: { objet: string; corps: string }): Promise<number> {
  if (!l.length) return 0;
  const a = l[0].acheteur;
  const ids: string[] = [];
  for (const x of l) {
    const r = await mettreEnSelection(x.bien, [x.acheteur]);
    const id = r.ids[x.acheteur.recherche.id];
    if (!id) throw new Error(r.erreurs[0] || 'un bien n’a pas pu entrer dans son dossier');
    ids.push(id);
  }
  const res = await fetch('/api/send-mail', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_ids: [a.client.id], recherche_id: a.recherche.id, objet: mail.objet, corps: mail.corps, biens_ids: ids, mode: 'biens' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    const detail = data.error || (data.results || []).find((r: { success: boolean; error?: string }) => !r.success)?.error || `erreur ${res.status}`;
    throw new Error(`le mail n’est pas parti (${detail}) ; ${ids.length > 1 ? 'les biens restent' : 'le bien reste'} dans sa sélection`);
  }
  if (data.avertissements?.length) signalerEchec('Le mail est parti, mais son suivi', data.avertissements.join(' ; '));
  const quand = new Date().toISOString();
  for (let i = 0; i < l.length; i++) {
    const { bien: b, acheteur: x } = l[i];
    const r = await supabase.from('biens').update({ etape: 'presente', envoye_le: quand, canal_envoi: 'mail', badge_retour: 'propose' }).eq('id', ids[i]).select('id');
    if (r.error || !r.data?.length) signalerEchec(`Mail parti, mais « ${b.titre || titreBien(b.donnees)} » marqué présenté`, r.error?.message || 'aucune ligne modifiée');
    const { error: eJ } = await supabase.from('journal').insert({
      client_id: x.client.id, recherche_id: x.recherche.id, bien_id: ids[i], type: 'envoi_bien',
      titre: 'Bien de l’agence présenté · mail',
      description: `${b.titre || titreBien(b.donnees)}${b.prix ? ` · ${b.prix.toLocaleString('fr-FR')} €` : ''}${noteJournal(x.corr.note)}`,
      metadata: { bien_vente_id: b.id },
    });
    if (eJ) signalerEchec('Le mail est parti, mais l’historique du client', eJ.message);
  }
  await suiteEnvoi(a.client.id, a.recherche.id, l.length);
  return l.length;
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
        description: `${b.titre || titreBien(b.donnees)}${b.prix ? ` · ${b.prix.toLocaleString('fr-FR')} €` : ''}${noteJournal(a.corr.note)}`,
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
  /* V3.50 : comme l'agenda et la fiche client — sa demande « Veut visiter »
     est servie, et « Veut revoir », « Il réfléchit » aussi ; « Veut faire une
     offre » reste (la visite ne la remplace pas). */
  const titreCopie = String(copie.titre || b.titre || titreBien(b.donnees || {}));
  const e1 = await solderRelancesVisite(clientId, [titreCopie]);
  if (e1) signalerEchec('La visite est notée, mais sa relance « Veut visiter »', e1);
  const e2 = await solderRelancesRetourVisite(clientId, [titreCopie], { garder: 'offre' });
  if (e2) signalerEchec('La visite est notée, mais ses relances de retour de visite', e2);
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
  /* V3.45 : vide tant qu'on ne le sait pas. « Avec un prêt » était mis
     d'office, et s'affichait sur des offres où personne ne l'avait dit. */
  montant: number; recue: string; jusquau: string; financement: 'comptant' | 'pret' | 'relais' | null;
  apport: number | null; pret: number | null; accord: string; conditions: string; fichier: { chemin: string; nom: string } | null;
  /* V3.45 : une offre convenue avant d'être notée — elle arrive acceptée,
     sans relance « réponse à donner ». */
  dejaAcceptee?: boolean;
};

/* La relance « réponse à donner » du propriétaire, posée avec l'offre. */
const noteRelanceOffre = (qui: string, montant: number, titre: string) =>
  `Offre de ${qui} à ${montant.toLocaleString('fr-FR')} € sur ${titre} : réponse à donner aujourd’hui.`;

export async function enregistrerOffre(b: BienVente, o: SaisieOffre, proprio: ClientMini | null): Promise<SuiviVente> {
  let ligne = await ajouterSuivi({
    bien_id: b.id, type: 'offre', le: new Date(`${o.recue}T12:00:00`).toISOString(), qui: o.qui,
    client_id: o.clientId, recherche_id: o.rechercheId, montant: o.montant, statut: o.dejaAcceptee ? 'acceptee' : 'en_attente',
    donnees: {
      jusquau: o.jusquau, financement: o.financement, apport: o.apport, pret: o.pret, accord: o.accord, conditions: o.conditions,
      ...(o.fichier ? { chemin: o.fichier.chemin, nom: o.fichier.nom } : {}),
      ...(o.dejaAcceptee ? { reponse_le: o.recue } : {}),
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
    /* V3.47 : une carte « offre » dans son Suivi (metadata.jalon), datée du
       jour où elle a été faite ; acceptée d'emblée, elle le dit. */
    const { error: eJ } = await supabase.from('journal').insert({
      client_id: o.clientId, recherche_id: o.rechercheId, ...(copieId ? { bien_id: copieId } : {}), type: 'offre',
      titre: `${o.dejaAcceptee ? '🤝 Offre acceptée' : '💶 Offre'} à ${eurosSuivi(o.montant)} — ${b.titre || titreBien(b.donnees)}`,
      description: [`Faite le ${dateLongue(o.recue)}`, o.dejaAcceptee ? 'Acceptée par le vendeur' : o.jusquau ? `Valable jusqu’au ${dateLongue(o.jusquau)}` : ''].filter(Boolean).join(' · '),
      metadata: { bien_vente_id: b.id, suivi_id: ligne.id, jalon: o.dejaAcceptee ? 'offre_acceptee' : 'offre_faite', cote: 'acquereur' },
    });
    if (eJ) signalerEchec('L’offre est notée, mais l’historique de l’acheteur', eJ.message);
  }
  /* Le vendeur : l'offre reçue, dans son Suivi (V3.47). */
  if (b.client_id) {
    const fin = o.financement === 'comptant' ? 'Financement : comptant' : o.financement === 'pret' ? 'Financement : avec un prêt' : o.financement === 'relais' ? 'Financement : avec un prêt relais' : null;
    await noterJalon(b, o.dejaAcceptee ? 'offre_acceptee' : 'offre_recue', { vendeur: {
      clientId: b.client_id, titre: `${o.dejaAcceptee ? '🤝 Offre acceptée' : '💶 Offre reçue'} — ${eurosSuivi(o.montant)}`,
      texte: [`${b.titre || titreBien(b.donnees || {})} · offre de ${o.qui}, faite le ${dateLongue(o.recue)}`, !o.dejaAcceptee && o.jusquau ? `Valable jusqu’au ${dateLongue(o.jusquau)}` : null, fin],
    } });
  }
  /* Le propriétaire : une relance le jour où l'offre expire. Pas quand le
     délai est déjà passé (une offre notée après coup) : elle tombait tout
     de suite « en retard » (V3.45). Son identifiant est gardé avec l'offre,
     pour la clore dès que le vendeur répond. */
  if (proprio && o.jusquau && o.jusquau >= aujourdhui() && !o.dejaAcceptee) {
    const { data, error } = await supabase.from('relances').insert({
      client_id: proprio.id, type: 'manuelle', statut: 'en_attente',
      date_echeance: new Date(`${o.jusquau}T09:00:00`).toISOString(),
      note: noteRelanceOffre(o.qui, o.montant, b.titre || 'son bien'),
    }).select('id').single();
    if (error) signalerEchec('L’offre est notée, mais la relance du propriétaire', error.message);
    else if (data?.id) {
      /* Sans le lien, la note suffit encore à la retrouver : on le signale quand même. */
      try { ligne = await majSuivi(ligne.id, { donnees: { ...ligne.donnees, relance_id: data.id } }); } catch (e) { signalerEchec('Le lien entre l’offre et sa relance', (e as Error).message); }
    }
  }
  return ligne;
}

/* La relance « réponse à donner » d'une offre : par l'identifiant gardé
   avec elle ; celles d'avant la V3.45, qui ne le gardaient pas, par leur
   note chez le propriétaire. Seulement celles encore en attente. */
async function relancesDeLOffre(b: BienVente, o: SuiviVente): Promise<string[]> {
  const d = (o.donnees || {}) as Record<string, unknown>;
  if (typeof d.relance_id === 'string' && d.relance_id) return [d.relance_id];
  if (!b.client_id || !o.montant) return [];
  const debut = `Offre de ${o.qui || ''} à ${o.montant.toLocaleString('fr-FR')} €`;
  const { data, error } = await supabase.from('relances').select('id, note').eq('client_id', b.client_id).eq('statut', 'en_attente').limit(50);
  if (error) throw new Error(error.message);
  return ((data || []) as { id: string; note: string | null }[]).filter(r => String(r.note || '').startsWith(debut)).map(r => r.id);
}

/* Le vendeur a répondu, le compromis est signé, l'offre est retirée : la
   relance n'a plus d'objet (V3.45). Jamais bloquant : un échec se signale,
   l'action reste faite. */
export async function cloreRelanceOffre(b: BienVente, o: SuiviVente): Promise<void> {
  try {
    const ids = await relancesDeLOffre(b, o);
    if (!ids.length) return;
    const { error } = await supabase.from('relances').update({ statut: 'cloturee' }).in('id', ids).eq('statut', 'en_attente');
    if (error) signalerEchec('La relance de l’offre', error.message);
  } catch (e) { signalerEchec('La relance de l’offre', (e as Error).message); }
}

/* Corriger une offre déjà notée (V3.45) : le montant, les dates, le
   financement, l'acquéreur. La relance suit : retrouvée avec l'offre telle
   qu'elle était, elle prend le nouveau délai et la nouvelle note ; un délai
   déjà passé la clôt ; un délai remis dans le futur la recrée. */
export async function modifierOffre(b: BienVente, o: SuiviVente, x: SaisieOffre): Promise<SuiviVente> {
  const avant = (o.donnees || {}) as Record<string, unknown>;
  const ouverte = !o.statut || o.statut === 'en_attente';
  let ids: string[] = [];
  if (ouverte) { try { ids = await relancesDeLOffre(b, o); } catch (e) { signalerEchec('La relance de l’offre', (e as Error).message); } }
  /* La première ligne de la négociation, c'est l'offre elle-même. */
  const echanges = Array.isArray(avant.echanges) && avant.echanges.length
    ? (avant.echanges as Record<string, unknown>[]).map((e, i) => (i === 0 ? { ...e, montant: x.montant, le: x.recue } : e)) : undefined;
  const donnees: Record<string, unknown> = {
    ...avant, jusquau: x.jusquau, financement: x.financement, apport: x.apport, pret: x.pret, accord: x.accord, conditions: x.conditions,
    ...(x.fichier ? { chemin: x.fichier.chemin, nom: x.fichier.nom } : {}),
    ...(echanges ? { echanges } : {}),
  };
  let ligne = await majSuivi(o.id, {
    le: new Date(`${x.recue}T12:00:00`).toISOString(), qui: x.qui, client_id: x.clientId, recherche_id: x.rechercheId, montant: x.montant, donnees,
  });
  if (!ouverte) return ligne;
  const futur = !!x.jusquau && x.jusquau >= aujourdhui();
  const note = noteRelanceOffre(x.qui, x.montant, b.titre || 'son bien');
  if (ids.length) {
    const { error } = await supabase.from('relances').update(futur ? { date_echeance: new Date(`${x.jusquau}T09:00:00`).toISOString(), note } : { statut: 'cloturee' })
      .in('id', ids).eq('statut', 'en_attente');
    if (error) signalerEchec('L’offre est corrigée, mais sa relance', error.message);
    else if (futur && ids.length === 1 && avant.relance_id !== ids[0]) {
      try { ligne = await majSuivi(o.id, { donnees: { ...ligne.donnees, relance_id: ids[0] } }); } catch (e) { signalerEchec('Le lien entre l’offre et sa relance', (e as Error).message); }
    }
  } else if (futur && b.client_id) {
    const { data, error } = await supabase.from('relances').insert({
      client_id: b.client_id, type: 'manuelle', statut: 'en_attente', date_echeance: new Date(`${x.jusquau}T09:00:00`).toISOString(), note,
    }).select('id').single();
    if (error) signalerEchec('L’offre est corrigée, mais la relance du propriétaire', error.message);
    else if (data?.id) {
      try { ligne = await majSuivi(o.id, { donnees: { ...ligne.donnees, relance_id: data.id } }); } catch (e) { signalerEchec('Le lien entre l’offre et sa relance', (e as Error).message); }
    }
  }
  return ligne;
}

/* ══ Le compromis : les notaires, les rappels, le PDF signé (V3.45) ══════
   Alexandre, devant un compromis : « comment je retrouve les notaires et
   tout ? ». Tout vit dans la ligne « compromis » du suivi
   (`biens_vente_suivi`, type 'etape', statut 'compromis', `donnees`) : rien en
   SQL. Les deux notaires sont des contacts du CRM (type « Notaire »), gardés
   avec leur nom, leur étude, leur téléphone et leur mail au moment du choix. */
export type NotaireChoisi = { id: string | null; nom: string; etude?: string; tel?: string; email?: string };
export type ContactNotaire = { id: string; prenom: string | null; nom: string | null; emails: string[] | null; telephones: string[] | null; pro?: unknown };
export const notaireDepuisContact = (c: ContactNotaire): NotaireChoisi => {
  const pro = (c.pro && typeof c.pro === 'object' ? c.pro : {}) as Record<string, unknown>;
  return {
    id: c.id, nom: nomClient(c), etude: typeof pro.etude === 'string' ? pro.etude : '',
    tel: (c.telephones || []).find(Boolean) || '', email: (c.emails || []).find(Boolean) || '',
  };
};
export const lireNotaire = (x: unknown): NotaireChoisi | null => {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  return typeof o.nom === 'string' && o.nom ? { id: typeof o.id === 'string' ? o.id : null, nom: o.nom, etude: String(o.etude || ''), tel: String(o.tel || ''), email: String(o.email || '') } : null;
};
export async function lireNotaires(): Promise<ContactNotaire[]> {
  const { data, error } = await supabase.from('clients').select('id, prenom, nom, emails, telephones, pro, types').contains('types', ['notaire']).order('nom').limit(300);
  if (error) {
    if (colonneContactAbsente(error.message)) return [];
    throw new Error('Les notaires n’ont pas pu être lus : ' + error.message);
  }
  return (data || []) as ContactNotaire[];
}
export async function creerNotaire(x: { prenom: string; nom: string; etude: string; tel: string; email: string }): Promise<ContactNotaire> {
  const reference = await genererReference();
  const ligne = {
    reference, prenom: x.prenom.trim(), nom: x.nom.trim(), token_espace: jetonEspace(x.prenom, x.nom),
    emails: x.email.trim() ? [x.email.trim().toLowerCase()] : [], telephones: x.tel.trim() ? [x.tel.trim()] : [],
    statut: 'prospect', types: ['notaire'], pro: x.etude.trim() ? { etude: x.etude.trim() } : {},
  };
  const { data, error } = await supabase.from('clients').insert(ligne).select('id, prenom, nom, emails, telephones, pro').single();
  if (error) {
    throw new Error(colonneContactAbsente(error.message)
      ? 'Pour enregistrer un notaire, lance d’abord outils/sql/types-contact.sql dans Supabase.'
      : 'Le notaire n’a pas pu être créé : ' + error.message);
  }
  return data as ContactNotaire;
}

/* Les rappels du compromis, dans les Relances : la fin de la rétractation,
   la condition de prêt, l'acte. Leurs identifiants sont gardés avec le
   compromis (`donnees.rappels`) : une date qui bouge les déplace, une case
   décochée les clôt, la vente signée ou le compromis tombé aussi. */
export type CleRappel = 'sru' | 'pret' | 'acte';
export type Rappel = { cle: CleRappel; on: boolean; le: string; clientId: string | null; note: string };
export async function poserRappels(rappels: Rappel[], avant: Record<string, string>): Promise<Record<string, string>> {
  const apres: Record<string, string> = { ...avant };
  for (const r of rappels) {
    const id = avant[r.cle];
    try {
      if (r.on && r.le && id) {
        const { error } = await supabase.from('relances').update({ date_echeance: new Date(`${r.le}T09:00:00`).toISOString(), note: r.note }).eq('id', id).eq('statut', 'en_attente');
        if (error) signalerEchec('Un rappel du compromis', error.message);
      } else if (r.on && r.le && r.clientId) {
        const { data, error } = await supabase.from('relances').insert({
          client_id: r.clientId, type: 'manuelle', statut: 'en_attente', date_echeance: new Date(`${r.le}T09:00:00`).toISOString(), note: r.note,
        }).select('id').single();
        if (error) signalerEchec('Un rappel du compromis', error.message);
        else if (data?.id) apres[r.cle] = data.id as string;
      } else if (!r.on && id) {
        const { error } = await supabase.from('relances').update({ statut: 'cloturee' }).eq('id', id).eq('statut', 'en_attente');
        if (error) signalerEchec('Un rappel du compromis', error.message);
        delete apres[r.cle];
      }
    } catch (e) { signalerEchec('Un rappel du compromis', (e as Error).message); }
  }
  return apres;
}
/* La vente est signée, ou le compromis est tombé : ses rappels encore en
   attente se closent. Jamais bloquant. */
export async function cloreRappelsCompromis(bienId: string): Promise<void> {
  try {
    const { data, error } = await supabase.from('biens_vente_suivi').select('donnees').eq('bien_id', bienId).eq('type', 'etape').eq('statut', 'compromis')
      .order('le', { ascending: false }).limit(1);
    if (error) { signalerEchec('Les rappels du compromis', error.message); return; }
    const r = ((data?.[0]?.donnees || {}) as Record<string, unknown>).rappels;
    const ids = r && typeof r === 'object' ? Object.values(r as Record<string, unknown>).filter((x): x is string => typeof x === 'string' && !!x) : [];
    if (!ids.length) return;
    const { error: e2 } = await supabase.from('relances').update({ statut: 'cloturee' }).in('id', ids).eq('statut', 'en_attente');
    if (e2) signalerEchec('Les rappels du compromis', e2.message);
  } catch (e) { signalerEchec('Les rappels du compromis', (e as Error).message); }
}
/* Le compromis signé (PDF ou photo), joint à sa ligne. */
export async function joindreCompromis(b: BienVente, ligne: SuiviVente, f: File): Promise<SuiviVente> {
  const r = await deposerPiece(b.id, 'compromis', f);
  return majSuivi(ligne.id, { donnees: { ...(ligne.donnees || {}), chemin: r.chemin, nom: r.nom } });
}

/* ══ Le Suivi des deux côtés (V3.47) ═══════════════════════════════════
   Alexandre : « pour un acheteur qui a acheté : achat signé, acte
   authentique ; pareil pour le vendeur, avec la date et tout — pour qu'on le
   retrouve dans le suivi ». Chaque grande étape de la vente (mandat, offre,
   offre acceptée, compromis, compromis tombé, acte) laisse une ligne chez le
   vendeur (son Suivi général : ni recherche, ni bien) et chez l'acquéreur
   suivi (sa recherche, sur sa copie du bien). La date de l'étape est dans le
   titre : la ligne s'écrit le jour où on la note, pas forcément le jour où
   c'est arrivé. `metadata.jalon` en fait une carte à sa couleur dans la
   frise (FriseSuivi). Jamais bloquant : un échec se dit, l'étape reste faite. */
export type Jalon = 'mandat' | 'offre_faite' | 'offre_recue' | 'offre_acceptee' | 'compromis' | 'compromis_tombe' | 'acte';
export type LigneJalon = { clientId: string; rechercheId?: string | null; titre: string; texte: (string | false | null | undefined)[]; type?: string };
/* L'espace avant « € » est insécable : « 470 000 » et « € » ne se séparent pas en bout de ligne. */
export const eurosSuivi = (n: number) => `${Math.round(n).toLocaleString('fr-FR')}\u00a0€`;
export const nomNotaire = (n: NotaireChoisi | null) => (n ? `${n.nom}${n.etude ? ` (${n.etude})` : ''}` : '');
/* « Notaires : Me Dupont pour le vendeur, Me Martin pour l'acquéreur ». */
export function ligneNotaires(v: NotaireChoisi | null, a: NotaireChoisi | null): string | null {
  if (v && a && v.nom === a.nom) return `Notaire : ${nomNotaire(v)}, pour les deux parties`;
  const l = [v ? `${nomNotaire(v)} pour le vendeur` : '', a ? `${nomNotaire(a)} pour l’acquéreur` : ''].filter(Boolean);
  return l.length ? `${l.length > 1 ? 'Notaires' : 'Notaire'} : ${l.join(', ')}` : null;
}
async function copieChez(bienId: string, rechercheId: string): Promise<string | null> {
  const { data } = await supabase.from('biens').select('id').eq('bien_vente_id', bienId).eq('recherche_id', rechercheId).limit(1);
  return (data?.[0]?.id as string | undefined) || null;
}
export async function noterJalon(b: BienVente, jalon: Jalon, l: { vendeur?: LigneJalon | null; acquereur?: LigneJalon | null }): Promise<void> {
  const cotes: ['vendeur' | 'acquereur', LigneJalon | null | undefined][] = [['vendeur', l.vendeur], ['acquereur', l.acquereur]];
  for (const [cote, x] of cotes) {
    if (!x?.clientId) continue;
    try {
      const rechercheId = cote === 'acquereur' ? x.rechercheId || null : null;
      const bienId = rechercheId ? await copieChez(b.id, rechercheId) : null;
      const texte = x.texte.filter((t): t is string => typeof t === 'string' && !!t.trim()).join('\n');
      await addJournal(x.clientId, x.type || (jalon === 'mandat' ? 'mandat' : 'etape_transaction'), x.titre, texte || undefined,
        { jalon, cote, bien_vente_id: b.id }, { rechercheId, bienId });
    } catch (e) { signalerEchec('Le suivi du contact', (e as Error).message); }
  }
}
/* « Annuler l'acceptation » (V3.47) : les deux Suivis le disent, sous la
   ligne « Offre acceptée » qui reste. */
export async function noterAcceptationAnnulee(b: BienVente, o: SuiviVente): Promise<void> {
  const m = montantActuel(o);
  const titre = b.titre || titreBien(b.donnees || {});
  const ligne = (clientId: string, rechercheId?: string | null) => ({ clientId, rechercheId, titre: `↩️ Acceptation annulée — ${eurosSuivi(m)}`, texte: [`${titre} · l’offre de ${o.qui || 'l’acquéreur'} est de nouveau en discussion`] });
  /* Pas de `jalon` connu de la frise : une ligne discrète. */
  const cotes: [string | null, string | null | undefined][] = [[b.client_id, null], [o.client_id, o.recherche_id]];
  for (const [id, rech] of cotes) {
    if (!id) continue;
    const x = ligne(id, rech);
    try { await addJournal(id, 'etape_transaction', x.titre, x.texte.join('\n'), { jalon: 'annulation', bien_vente_id: b.id }, { rechercheId: rech || null }); }
    catch (e) { signalerEchec('Le suivi du contact', (e as Error).message); }
  }
}
/* Le vendeur accepte une offre (« Accepter », sur sa carte). */
export async function noterOffreAcceptee(b: BienVente, o: SuiviVente): Promise<void> {
  const m = montantActuel(o);
  const titre = b.titre || titreBien(b.donnees || {});
  const depart = o.montant && o.montant !== m ? `Offre de départ : ${eurosSuivi(o.montant)}, acceptée à ${eurosSuivi(m)} après négociation` : null;
  await noterJalon(b, 'offre_acceptee', {
    vendeur: b.client_id ? { clientId: b.client_id, titre: `🤝 Offre acceptée — ${eurosSuivi(m)}`, texte: [`${titre} · offre de ${o.qui || 'l’acquéreur'}`, depart] } : null,
    acquereur: o.client_id ? { clientId: o.client_id, rechercheId: o.recherche_id, titre: `🤝 Offre acceptée — ${eurosSuivi(m)}`, texte: [titre, depart] } : null,
  });
}

/* ══ La fin du parcours (V3.47) ════════════════════════════════════════
   Alexandre : « si le vendeur a signé, avoir un choix : le passer en vendeur
   signé ; l'acheteur pareil, acheteur finalisé ». Chaque geste est proposé
   (case cochée d'office) dans la fenêtre du compromis ou de la vente, et
   jamais bloquant : un échec se dit, l'étape du bien reste faite. */

/* Au compromis : la recherche de l'acquéreur se met en pause — il passe
   « Suspendu », la veille s'arrête, il n'est plus proposé sur les autres
   biens. Ce qu'il était avant est rendu, pour reprendre si le compromis tombe. */
export type PauseAcquereur = { clientId: string; rechercheId: string | null; statutAvant: string | null; activeAvant?: boolean | null };
export async function pauseAcquereur(o: SuiviVente): Promise<PauseAcquereur | null> {
  if (!o.client_id) return null;
  try {
    const { data, error } = await supabase.from('clients').select('statut').eq('id', o.client_id).maybeSingle();
    if (error) { signalerEchec('La recherche de l’acquéreur', error.message); return null; }
    const statutAvant = (data as { statut?: string | null } | null)?.statut || null;
    if (statutAvant !== 'bien_trouve' && statutAvant !== 'perdu') {
      const r = await supabase.from('clients').update({ statut: 'suspendu' }).eq('id', o.client_id);
      if (r.error) signalerEchec('Le statut « Suspendu » de l’acquéreur', r.error.message);
    }
    /* Ce qu'était sa recherche avant (V3.47) : si le compromis tombe, elle
       revient exactement comme avant — déjà en pause, elle y reste. */
    let activeAvant: boolean | null = null;
    if (o.recherche_id) {
      const r0 = await supabase.from('recherches').select('active').eq('id', o.recherche_id).maybeSingle();
      if (!r0.error) activeAvant = (r0.data as { active?: boolean | null } | null)?.active ?? null;
      const r = await supabase.from('recherches').update({ active: false, updated_at: new Date().toISOString() }).eq('id', o.recherche_id);
      if (r.error) signalerEchec('La pause de la recherche de l’acquéreur', r.error.message);
    }
    /* Pas de ligne à part au Suivi : la ligne « Compromis signé » le dit (noterJalon). */
    return { clientId: o.client_id, rechercheId: o.recherche_id || null, statutAvant, activeAvant };
  } catch (e) { signalerEchec('La recherche de l’acquéreur', (e as Error).message); return null; }
}
/* Le compromis est tombé (V3.47). Alexandre : « soit reprendre la recherche
   de l'acheteur — peut-être qu'il n'est plus en recherche —, soit le vendeur
   ne veut plus vendre ». La fenêtre (FenCompromisTombe) a déjà changé
   l'étape du bien (« En vente » ou « Retiré ») ; ici :
     · l'acquéreur : sa recherche reprend (ce qu'il était avant le compromis),
       reste en pause (« Suspendu »), ou s'arrête (dossier clos « A renoncé »,
       comme « Clôturer » sur sa fiche) ;
     · l'offre retenue passe « Compromis tombé » (statut 'retiree' +
       donnees.compromisTombe) : elle ne se propose plus pour un compromis ;
     · une ligne datée dans le Suivi du vendeur et de l'acquéreur.
   Jamais bloquant : un échec se dit, l'étape du bien reste faite. */
export type SuiteTombe = { bien: 'mandat' | 'retire'; acq: 'reprend' | 'pause' | 'arrete' };
export async function compromisTombe(b: BienVente, titre: string, raison: string, suite: SuiteTombe = { bien: 'mandat', acq: 'reprend' }, ligne?: SuiviVente | null): Promise<void> {
  try {
    /* Le compromis : celui que la fenêtre montrait, sinon le dernier noté. */
    let c = (ligne?.donnees || null) as Record<string, unknown> | null;
    if (!c) {
      const { data, error } = await supabase.from('biens_vente_suivi').select('donnees').eq('bien_id', b.id).eq('type', 'etape').eq('statut', 'compromis')
        .order('le', { ascending: false }).limit(1);
      if (error) { signalerEchec('Le compromis tombé', error.message); return; }
      c = (data?.[0]?.donnees || {}) as Record<string, unknown>;
    }
    const p = c.acqPause as PauseAcquereur | undefined;
    const jour = aujourdhui();
    /* L'offre retenue : « Compromis tombé ». Elle dit aussi qui l'avait faite. */
    let offre: SuiviVente | null = null;
    if (typeof c.offre === 'string' && c.offre) {
      const o = await supabase.from('biens_vente_suivi').select('*').eq('id', c.offre).maybeSingle();
      if (o.error) signalerEchec('L’offre du compromis', o.error.message);
      offre = (o.data as SuiviVente | null) || null;
      if (offre && offre.statut === 'acceptee') {
        const r = await supabase.from('biens_vente_suivi').update({ statut: 'retiree', donnees: { ...(offre.donnees || {}), compromisTombe: { le: jour, raison: raison.trim() } } }).eq('id', offre.id);
        if (r.error) signalerEchec('L’offre « compromis tombé »', r.error.message);
      }
    }
    /* L'acquéreur : celui mis en pause, sinon celui de l'offre retenue. */
    const acq: { clientId: string; rechercheId: string | null } | null = p?.clientId ? { clientId: p.clientId, rechercheId: p.rechercheId }
      : offre?.client_id ? { clientId: offre.client_id, rechercheId: offre.recherche_id } : null;
    let phraseAcq: string | null = null;
    let finalise = false;
    if (acq) {
      if (suite.acq === 'reprend' && p?.clientId) {
        /* Comme avant le compromis : déjà « Suspendu », il le reste ; une
           recherche déjà arrêtée ne repart pas (V3.47). */
        if (p.statutAvant !== 'suspendu') {
          const r = await supabase.from('clients').update({ statut: p.statutAvant || 'actif' }).eq('id', p.clientId).eq('statut', 'suspendu');
          if (r.error) signalerEchec('Le statut de l’acquéreur', r.error.message);
        }
        if (p.rechercheId && p.activeAvant !== false) {
          const r2 = await supabase.from('recherches').update({ active: true, updated_at: new Date().toISOString() }).eq('id', p.rechercheId);
          if (r2.error) signalerEchec('La reprise de la recherche de l’acquéreur', r2.error.message);
        }
        phraseAcq = p.statutAvant === 'suspendu' || p.activeAvant === false ? 'Il revient comme avant le compromis (sa recherche était déjà en pause).' : 'Sa recherche reprend : la veille repart.';
      } else if (suite.acq === 'pause') {
        const r = await supabase.from('clients').update({ statut: 'suspendu' }).eq('id', acq.clientId).in('statut', ['actif', 'prospect', 'suspendu']);
        if (r.error) signalerEchec('Le statut « Suspendu » de l’acquéreur', r.error.message);
        if (acq.rechercheId) {
          const r2 = await supabase.from('recherches').update({ active: false, updated_at: new Date().toISOString() }).eq('id', acq.rechercheId);
          if (r2.error) signalerEchec('La pause de la recherche de l’acquéreur', r2.error.message);
        }
        phraseAcq = 'Sa recherche reste en pause (« Suspendu ») : elle reprend depuis sa fiche.';
      } else if (suite.acq === 'arrete') {
        /* Comme « Clôturer le dossier » (FicheClient), motif « A renoncé ». */
        const a = await supabase.from('clients').update({ statut: 'perdu', raison_perte: `A renoncé — compromis tombé${raison.trim() ? ` (${raison.trim()})` : ''}` }).eq('id', acq.clientId);
        if (a.error) signalerEchec('La clôture du dossier de l’acquéreur', a.error.message);
        else {
          finalise = true;
          const r2 = await supabase.from('recherches').update({ active: false }).eq('client_id', acq.clientId);
          if (r2.error) signalerEchec('L’arrêt de la veille de l’acquéreur', r2.error.message);
          await solderRelancesAcheteur(acq.clientId);
          phraseAcq = 'Il arrête sa recherche : dossier clos (« A renoncé »), la veille s’arrête, ses relances en attente sont soldées.';
        }
      }
    }
    const signe = typeof c.signe === 'string' && c.signe ? ` · compromis signé le ${dateLongue(c.signe)}` : '';
    const qui = offre?.qui || (typeof c.acquereur === 'string' ? c.acquereur : '');
    const pourquoi = raison.trim() ? `Pourquoi : ${raison.trim()}` : null;
    await noterJalon(b, 'compromis_tombe', {
      vendeur: b.client_id ? { clientId: b.client_id, titre: '↩️ Compromis tombé', texte: [`${titre}${signe}${qui ? ` avec ${qui}` : ''}`, pourquoi,
        suite.bien === 'retire' ? 'Il ne vend plus : le bien est retiré de la vente.' : 'Le bien est remis en vente.'] } : null,
      acquereur: acq ? { ...acq, type: finalise ? 'dossier_finalise' : undefined, titre: '↩️ Compromis tombé', texte: [`${titre}${signe}`, pourquoi, phraseAcq] } : null,
    });
  } catch (e) { signalerEchec('Le compromis tombé', (e as Error).message); }
}
/* À l'acte : le dossier de l'acquéreur est finalisé (« Bien trouvé »), comme
   « L'acte est signé » d'une chasse (FicheClient) — la veille s'arrête, ses
   relances en attente sont soldées. Sa ligne au Suivi : « Achat signé —
   acte authentique » (noterJalon).
   V3.50 : un acquéreur qui a plusieurs recherches (un achat pour lui, un
   investissement…) ne voit plus TOUTES ses recherches arrêtées. Seule celle
   de l'offre retenue (ou de sa copie du bien) s'arrête ; il passe « Bien
   trouvé » seulement si aucune autre ne reste active. Sans recherche connue,
   comme avant : tout s'arrête. */
export type FinAcquereur = { ok: boolean; bienTrouve: boolean; autres: number };
export async function finaliserAcquereur(clientId: string, o: { rechercheId?: string | null; bienVenteId?: string | null; statutAvant?: string | null } = {}): Promise<FinAcquereur> {
  try {
    let rechercheId = o.rechercheId || null;
    /* L'offre ne dit pas sa recherche : celle de sa copie du bien, si elle est seule. */
    if (!rechercheId && o.bienVenteId) {
      const c = await supabase.from('biens').select('recherche_id').eq('bien_vente_id', o.bienVenteId).eq('client_id', clientId);
      if (c.error) signalerEchec('La recherche de l’acquéreur', c.error.message);
      const ids = Array.from(new Set(((c.data || []) as { recherche_id: string | null }[]).map(x => x.recherche_id).filter((x): x is string => !!x)));
      if (ids.length === 1) rechercheId = ids[0];
    }
    if (rechercheId) {
      const r = await supabase.from('recherches').update({ active: false, updated_at: new Date().toISOString() }).eq('id', rechercheId);
      if (r.error) signalerEchec('L’arrêt de la recherche de l’acquéreur', r.error.message);
      const autres = await supabase.from('recherches').select('id').eq('client_id', clientId).eq('active', true).neq('id', rechercheId);
      if (autres.error) {
        /* Dans le doute, on ne le dit pas « Bien trouvé » : ses autres recherches continuent. */
        signalerEchec('Les autres recherches de l’acquéreur', autres.error.message);
        await solderRelancesAcheteur(clientId, rechercheId);
        return { ok: true, bienTrouve: false, autres: 1 };
      }
      const n = (autres.data || []).length;
      if (n > 0) {
        await solderRelancesAcheteur(clientId, rechercheId);
        /* Mis « Suspendu » au compromis (pauseAcquereur) : ses autres recherches
           continuent, il redevient ce qu'il était. */
        if (o.statutAvant && o.statutAvant !== 'suspendu') {
          const s = await supabase.from('clients').update({ statut: o.statutAvant }).eq('id', clientId).eq('statut', 'suspendu');
          if (s.error) signalerEchec('Le statut de l’acquéreur', s.error.message);
        }
        return { ok: true, bienTrouve: false, autres: n };
      }
    }
    const a = await supabase.from('clients').update({ statut: 'bien_trouve', raison_perte: null }).eq('id', clientId);
    if (a.error) { signalerEchec('Le statut « Bien trouvé » de l’acquéreur', a.error.message); return { ok: false, bienTrouve: false, autres: 0 }; }
    if (!rechercheId) {
      const b = await supabase.from('recherches').update({ active: false }).eq('client_id', clientId);
      if (b.error) signalerEchec('L’arrêt de la veille de l’acquéreur', b.error.message);
    }
    await solderRelancesAcheteur(clientId);
    return { ok: true, bienTrouve: true, autres: 0 };
  } catch (e) { signalerEchec('Le dossier de l’acquéreur', (e as Error).message); return { ok: false, bienTrouve: false, autres: 0 }; }
}

/* V3.50 : la vente signée clôt aussi la transaction que l'acquéreur avait
   ouverte côté chasse sur sa copie du bien (« + Créer une transaction »).
   Elle restait « en cours » pour toujours sur le tableau de bord. Ses
   honoraires ne sont pas touchés : activite.ts ne compte pas deux fois une
   vente de l'agence. Rend le nombre de transactions closes ; jamais bloquant. */
export async function finaliserTransactionsAcquereur(bienId: string, clientId: string, acte: string): Promise<number> {
  try {
    const { data: cop, error } = await supabase.from('biens').select('id').eq('bien_vente_id', bienId).eq('client_id', clientId);
    if (error) { signalerEchec('La transaction de l’acquéreur', error.message); return 0; }
    const ids = ((cop || []) as { id: string }[]).map(x => x.id);
    if (!ids.length) return 0;
    const r = await supabase.from('transactions').update({ etape_actuelle: 'finalise', acte_date_prevue: acte })
      .in('bien_id', ids).eq('client_id', clientId).neq('etape_actuelle', 'finalise').select('id');
    if (r.error) { signalerEchec('La transaction de l’acquéreur', r.error.message); return 0; }
    return (r.data || []).length;
  } catch (e) { signalerEchec('La transaction de l’acquéreur', (e as Error).message); return 0; }
}

/* « Corriger l'acte » (V3.50) : sur un bien vendu, la date de l'acte, le prix
   ou les honoraires saisis à tort (un oubli, une faute de frappe) se
   corrigent. La dernière ligne « vendu » de l'historique est celle que lit le
   chiffre d'affaires (activite.ts) : on la corrige, ainsi que `vendu_le`.
   L'étape ne bouge pas, et le Suivi des contacts n'a pas de nouvelle ligne
   « Vente signée » ; l'historique du bien garde « Acte corrigé : avant → après ». */
export type CorrectionActe = { acte: string; prix: number | null; hono: number | null; sansHonoraires: boolean };
export async function corrigerActe(b: BienVente, ligne: SuiviVente | null, x: CorrectionActe): Promise<BienVente> {
  const avant = (ligne?.donnees || {}) as Record<string, unknown>;
  const acteAvant = (typeof avant.acte === 'string' && avant.acte) || b.vendu_le || '';
  const prixAvant = typeof avant.prix === 'number' ? avant.prix : null;
  const honoAvant = typeof avant.hono === 'number' ? avant.hono : null;
  const apres = { acte: x.acte, prix: x.prix, hono: x.sansHonoraires ? 0 : x.hono, sansHonoraires: x.sansHonoraires };
  if (ligne) await majSuivi(ligne.id, { donnees: { ...avant, ...apres } });
  /* Une vente d'avant sans sa ligne (reprise d'un autre logiciel) : on la crée. */
  else await ajouterSuivi({ bien_id: b.id, type: 'etape', statut: 'vendu', donnees: { de: 'vendu', ...apres, corrige: true } });
  let r = b;
  if (x.acte && x.acte !== b.vendu_le) r = await majBien(b.id, { vendu_le: x.acte });
  const eu = (n: number | null) => (n === null ? 'non renseigné' : n === 0 ? 'sans honoraires' : eurosSuivi(n));
  const changes = [
    acteAvant !== x.acte ? `date ${acteAvant ? dateLongue(acteAvant) : 'non renseignée'} → ${dateLongue(x.acte)}` : '',
    prixAvant !== x.prix ? `prix ${eu(prixAvant)} → ${eu(x.prix)}` : '',
    honoAvant !== apres.hono ? `honoraires ${eu(honoAvant)} → ${eu(apres.hono)}${apres.hono ? ' TTC' : ''}` : '',
  ].filter(Boolean);
  if (changes.length) {
    try {
      await ajouterSuivi({ bien_id: b.id, type: 'note', commentaire: `Acte corrigé : ${changes.join(' · ')}`,
        donnees: { acteCorrige: true, avant: { acte: acteAvant, prix: prixAvant, hono: honoAvant }, apres } });
    } catch (e) { signalerEchec('L’acte est corrigé, mais sa ligne d’historique', (e as Error).message); }
  }
  return r;
}
/* À l'acte : le vendeur passe « Vendeur signé » (il quitte les vendeurs en
   cours, garde ses autres types : acheteur, propriétaire…). La ligne
   « Vente signée — acte authentique » le dit (noterJalon). */
const TYPES_CONTACT_ORDRE = TYPES_CONTACT.map(t => t.k);
export async function vendeurSigne(clientId: string, bienId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('clients').select('types').eq('id', clientId).maybeSingle();
    if (error || !data) { signalerEchec('Le type « Vendeur signé »', error?.message || 'contact introuvable'); return false; }
    /* Un autre de ses biens encore en vente : il reste aussi « Vendeur ».
       V3.137 : « en vente » = mandat, sous offre ou sous compromis. */
    const autres = await supabase.from('biens_vente').select('id').eq('client_id', clientId).neq('id', bienId).in('etape', ETAPES_EN_VENTE).eq('archive', false).limit(1);
    if (autres.error) signalerEchec('Les autres biens du vendeur', autres.error.message);
    const encore = !!autres.data?.length;
    const t: string[] = typesDe(data).filter(x => encore || x !== 'vendeur');
    const types = TYPES_CONTACT_ORDRE.filter(k => k === 'vendeur_signe' || t.includes(k));
    const r = await supabase.from('clients').update({ types }).eq('id', clientId);
    if (r.error) { signalerEchec('Le type « Vendeur signé »', r.error.message); return false; }
    /* V3.50 : « son bien actuel est à vendre » (fiche contact) ne l'est plus —
       sauf s'il a encore un bien en vente avec nous. Sans ça, il restait
       « vendeur » sur la carte et dans la liste des contacts. */
    if (!encore) {
      const v = await supabase.from('clients').update({ bien_actuel_a_vendre: false }).eq('id', clientId).eq('bien_actuel_a_vendre', true);
      if (v.error) signalerEchec('« Son bien est à vendre » sur la fiche du vendeur', v.error.message);
    }
    return true;
  } catch (e) { signalerEchec('Le type « Vendeur signé »', (e as Error).message); return false; }
}
/* Au compromis : une autre offre restée « acceptée » (une offre tombée, ou
   le compromis signé avec un autre) passe « retirée » — deux offres
   acceptées, l'espace de l'acheteur ne saurait plus qui achète (V3.47). */
export async function retirerAutresAcceptees(b: BienVente, offres: SuiviVente[], gardee: string | null): Promise<void> {
  for (const o of offres) {
    if (o.id === gardee || o.statut !== 'acceptee') continue;
    try {
      const { statut, donnees } = apresReponse(o, { k: 'retire' }, aujourdhui());
      await majSuivi(o.id, { statut, donnees });
    } catch (e) { signalerEchec(`L’offre de ${o.qui || 'un acquéreur'}`, (e as Error).message); }
  }
}
/* « L'offre est tombée » (V3.47) : les offres encore en jeu passent
   « retirées », leurs relances « réponse à donner » se closent. */
export async function offresTombees(b: BienVente, offres: SuiviVente[]): Promise<void> {
  for (const o of offres) {
    if (!(o.statut === 'acceptee' || o.statut === 'en_attente' || o.statut === 'contre' || !o.statut)) continue;
    try {
      const { statut, donnees } = apresReponse(o, { k: 'retire' }, aujourdhui());
      await majSuivi(o.id, { statut, donnees });
      await cloreRelanceOffre(b, o);
      await noterOffreFermee(b, o, '↩️ Offre tombée', 'Le bien repasse en vente.');
    } catch (e) { signalerEchec(`L’offre de ${o.qui || 'un acquéreur'}`, (e as Error).message); }
  }
}
/* Au compromis : les autres offres encore ouvertes passent « refusées ». */
export async function refuserAutresOffres(b: BienVente, offres: SuiviVente[], gardee: string | null): Promise<void> {
  for (const o of offres) {
    if (o.id === gardee || !(o.statut === 'en_attente' || o.statut === 'contre' || !o.statut)) continue;
    try {
      const { statut, donnees } = apresReponse(o, { k: 'refuse' }, aujourdhui());
      await majSuivi(o.id, { statut, donnees });
      await cloreRelanceOffre(b, o);
      /* V3.48 : l'acquéreur suivi le lit dans son Suivi. */
      await noterOffreFermee(b, o, '✕ Offre non retenue', 'Le vendeur s’est engagé avec un autre acquéreur.');
    } catch (e) { signalerEchec(`L’offre de ${o.qui || 'un acquéreur'}`, (e as Error).message); }
  }
}
/* Une ligne dans le Suivi de l'acquéreur suivi dont l'offre se ferme (V3.48). */
async function noterOffreFermee(b: BienVente, o: SuiviVente, titre: string, phrase: string): Promise<void> {
  if (!o.client_id) return;
  const t = b.titre || titreBien(b.donnees || {});
  await addJournal(o.client_id, 'etape_transaction', `${titre} — ${eurosSuivi(montantActuel(o))}`, `${t} · ${phrase}`,
    { jalon: 'annulation', cote: 'acquereur', bien_vente_id: b.id }, { rechercheId: o.recherche_id || null });
}

/* L'offre signée par l'acquéreur, jointe après coup (V3.45). */
export async function joindreOffreSignee(b: BienVente, o: SuiviVente, f: File): Promise<SuiviVente> {
  const r = await deposerPiece(b.id, 'offre', f);
  return majSuivi(o.id, { donnees: { ...(o.donnees || {}), chemin: r.chemin, nom: r.nom } });
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

/* Retirer une photo du bien (V3.43) : le fichier reste quand des acheteurs
   ont déjà reçu le bien — leur copie le montre encore. */
export async function retirerPhoto(chemin: string, bienId?: string): Promise<void> {
  if (!chemin) return;
  if (bienId && await bienPartage(bienId)) return;
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
/* V3.51 : demander des documents (sans pièce jointe). */
export async function demanderDocuments(o: {
  bienId: string; destinataires: DestDocuments[]; sujet: string; message: string; demandes: string[];
}): Promise<{ envoyes: string[]; avertissements: string[] }> {
  return api<{ envoyes: string[]; avertissements: string[] }>({
    action: 'demander', id: o.bienId, destinataires: o.destinataires, sujet: o.sujet, message: o.message, demandes: o.demandes,
  });
}
export async function envoyerDocuments(o: {
  bienId: string; destinataires: DestDocuments[]; sujet: string; message: string; pieces: { chemin: string; nom: string }[];
}): Promise<{ mode: 'pj' | 'liens'; envoyes: string[]; avertissements: string[] }> {
  return api<{ mode: 'pj' | 'liens'; envoyes: string[]; avertissements: string[] }>({
    action: 'envoyer', id: o.bienId, destinataires: o.destinataires, sujet: o.sujet, message: o.message, pieces: o.pieces,
  });
}

/* ══ L'estimation : le rendez-vous, l'avis, les relances (V3.50) ═════════
   Alexandre faisait tout deux fois : la date du rendez-vous sur le bien, puis
   le même rendez-vous dans l'agenda, sans lien entre eux ; et rien ne disait,
   dans le Suivi du propriétaire, qu'il avait été vu, estimé, relancé.
   · Le rendez-vous d'estimation est un vrai rendez-vous de l'agenda
     (`rendez_vous`, type 'estimation'), relié au bien par trois clés de
     `donnees` : `rdvEstimation` (AAAA-MM-JJ), `rdvEstimationHeure` (HH:MM) et
     `rdvEstimationRdv` (son id). Le déplacer ou l'annuler ici le déplace ou
     l'annule dans l'agenda ; l'agenda fait de même dans l'autre sens.
     Un bien d'avant (une date sans id) garde sa date, sans rendez-vous, tant
     qu'on ne le replanifie pas.
   · Chaque jalon laisse une ligne dans le Suivi du propriétaire (son Suivi
     général : ni recherche, ni bien) : le bien créé ou relié, le rendez-vous,
     la visite sur place, l'avis de valeur, l'estimation mise de côté.
   · Deux relances chez lui : faire le point une semaine après l'avis, et le
     recontacter à la date notée quand il veut attendre. Elles se closent au
     mandat, au retrait, à l'archivage, à la suppression, et quand une
     nouvelle les remplace. Leurs ids sont gardés dans `donnees`
     (`relanceAvis`, `relanceReprise`) ; à défaut, leur note commence par un
     texte fixe. */
const NOTE_AVIS = 'Avis de valeur envoyé — faire le point avec ';
const NOTE_REPRISE = 'Estimation — recontacter ';
const titreSuivi = (b: { titre?: string | null; reference?: string | null; donnees?: Donnees | null }) =>
  (b.titre && b.titre !== 'Nouveau bien' ? b.titre : '') || (b.donnees && b.donnees.typeBien ? titreBien(b.donnees) : '') || (b.reference ? `réf. ${b.reference}` : 'le bien');
const heureFr = (h: string) => h.slice(0, 5).replace(':', ' h ');
/* Une date complète, et plausible : un champ date tapé au clavier passe par
   « 0002 », « 0020 »… avant d'arriver à « 2026 ». */
export const dateValide = (x: unknown): x is string => typeof x === 'string' && /^(19|20)\d\d-\d\d-\d\d$/.test(x);
/* Le nom du propriétaire, pour un titre ou une relance. */
function nomPourSuivi(d: Donnees, proprio?: { prenom?: string | null; nom?: string | null } | null): string {
  if (d.qui === 'sci' && typeof d.sciNom === 'string' && d.sciNom.trim()) return d.sciNom.trim();
  const p = lirePersonnes(d.proprietaires).find(x => x.nom || x.prenom);
  return (p ? `${p.prenom} ${p.nom}`.trim() : '') || (proprio ? nomClient(proprio) : '');
}
const telPourSuivi = (d: Donnees) => lirePersonnes(d.proprietaires).map(x => x.telephone).find(Boolean) || '';
const lieuDuBienVente = (d: Donnees) => [txtD(d, 'adresse'), [txtD(d, 'cp'), txtD(d, 'ville')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
function txtD(d: Donnees, k: string): string { const v = d[k]; return typeof v === 'string' ? v.trim() : ''; }
/* Une ligne au Suivi du propriétaire, qui dit de quel bien elle parle
   (`metadata.bien_vente_id` : la fiche d'un autre de ses biens ne la montre pas). */
async function suiviProprio(clientId: string | null | undefined, bienId: string, type: string, titre: string, texte: string | null, jalon: string): Promise<void> {
  if (!clientId) return;
  try { await addJournal(clientId, type, titre, texte || undefined, { bien_vente_id: bienId, estimation: jalon }); }
  catch (e) { signalerEchec('Le suivi du propriétaire', (e as Error).message); }
}

/* Le rendez-vous d'estimation : créé, déplacé ou annulé dans l'agenda.
   Rend les trois clés à enregistrer avec le bien (et le fait : créé,
   déplacé, annulé, rien). Une heure manque : la date seule, sans agenda
   (le rendez-vous déjà posé reste à son heure). Lève une erreur lisible si
   l'agenda refuse : rien n'est alors enregistré sur le bien. */
export type FaitRdv = 'cree' | 'deplace' | 'annule' | 'rien';
export async function planifierEstimation(b: BienVente, x: { date: string; heure: string }, d: Donnees = b.donnees || {}): Promise<{ donnees: Donnees; fait: FaitRdv }> {
  const avantDate = txtD(d, 'rdvEstimation'), avantHeure = txtD(d, 'rdvEstimationHeure');
  let rdvId = txtD(d, 'rdvEstimationRdv');
  const heure = /^\d{2}:\d{2}/.test(x.heure) ? x.heure.slice(0, 5) : '';
  const date = dateValide(x.date) ? x.date : '';
  if (!date) {
    if (rdvId) {
      const r = await supabase.from('rendez_vous').update({ statut: 'annule' }).eq('id', rdvId);
      if (r.error) lever('Le rendez-vous d’estimation n’a pas pu être retiré de l’agenda', r.error.message);
    }
    return { donnees: { rdvEstimation: '', rdvEstimationHeure: '', rdvEstimationRdv: '' }, fait: avantDate || rdvId ? 'annule' : 'rien' };
  }
  const h = heure || (rdvId ? avantHeure : '');
  if (!h) return { donnees: { rdvEstimation: date, rdvEstimationHeure: '', rdvEstimationRdv: rdvId }, fait: date !== avantDate ? 'deplace' : 'rien' };
  /* Encore dans l'agenda ? Annulé là-bas entre-temps : on en pose un neuf. */
  if (rdvId) {
    const r0 = await supabase.from('rendez_vous').select('id, statut').eq('id', rdvId).maybeSingle();
    if (r0.error) lever('Le rendez-vous d’estimation n’a pas pu être relu dans l’agenda', r0.error.message);
    if (!r0.data || (r0.data as { statut?: string | null }).statut === 'annule') rdvId = '';
  }
  const debut = new Date(`${date}T${h}:00`);
  if (isNaN(debut.getTime())) lever('Le rendez-vous d’estimation', 'date ou heure illisible');
  const fin = new Date(debut.getTime() + 60 * 60000);
  const nom = nomPourSuivi(d);
  const ligne = {
    type: 'estimation', titre: `Estimation · ${nom || titreSuivi({ ...b, donnees: d })}`, debut: debut.toISOString(), fin: fin.toISOString(),
    lieu: lieuDuBienVente(d) || null, client_id: b.client_id || (typeof d.clientId === 'string' && d.clientId ? d.clientId : null), recherche_id: null,
    details: { bien_vente_id: b.id, proprietaire: nom || undefined, telephone: telPourSuivi(d) || undefined },
  };
  if (rdvId) {
    const r = await supabase.from('rendez_vous').update(ligne).eq('id', rdvId).select('id');
    if (r.error) lever('Le rendez-vous d’estimation n’a pas pu être déplacé dans l’agenda', r.error.message);
    const change = date !== avantDate || h !== avantHeure;
    return { donnees: { rdvEstimation: date, rdvEstimationHeure: h, rdvEstimationRdv: rdvId }, fait: change ? 'deplace' : 'rien' };
  }
  const { data, error } = await supabase.from('rendez_vous').insert({ ...ligne, notes: null, relance_id: null }).select('id').single();
  if (error || !data) lever('Le rendez-vous d’estimation n’a pas pu être ajouté à l’agenda', error?.message || 'réponse vide');
  return { donnees: { rdvEstimation: date, rdvEstimationHeure: h, rdvEstimationRdv: String((data as { id: string }).id) }, fait: 'cree' };
}
/* La ligne du Suivi du propriétaire qui va avec : « 📅 Estimation prévue le … à … — bien ». */
export async function noterRdvEstimation(b: BienVente, fait: FaitRdv, donnees: Donnees): Promise<void> {
  if (fait === 'rien') return;
  const date = txtD(donnees, 'rdvEstimation'), h = txtD(donnees, 'rdvEstimationHeure');
  const t = titreSuivi(b);
  if (fait === 'annule') await suiviProprio(b.client_id, b.id, 'rdv_annule', `✕ Rendez-vous d’estimation annulé — ${t}`, null, 'rdv');
  else await suiviProprio(b.client_id, b.id, 'rdv_planifie', `📅 Estimation prévue le ${dateLongue(date)}${h ? ` à ${heureFr(h)}` : ''} — ${t}`,
    [fait === 'deplace' ? 'Rendez-vous déplacé.' : '', lieuDuBienVente(b.donnees || {})].filter(Boolean).join(' ') || null, 'rdv');
}

/* La date changée dans l'éditeur (« Modifier ») : l'agenda suit, à la même
   heure. */
async function suivreRdvEditeur(b: { id: string; client_id: string | null; titre: string | null; reference: string | null }, d: Donnees, avantDate: string): Promise<Donnees> {
  const rdvId = txtD(d, 'rdvEstimationRdv');
  if (!rdvId) return d;
  try {
    const p = await planifierEstimation({ ...(b as BienVente), donnees: d }, { date: txtD(d, 'rdvEstimation'), heure: txtD(d, 'rdvEstimationHeure') || '10:00' }, { ...d, rdvEstimation: avantDate });
    await noterRdvEstimation({ ...(b as BienVente), donnees: d }, p.fait, p.donnees);
    return { ...d, ...p.donnees };
  } catch (e) { signalerEchec('Le rendez-vous d’estimation dans l’agenda', (e as Error).message); return d; }
}

/* Les relances de l'estimation, chez le propriétaire. `quoi` : celle de
   l'avis, celle de la reprise, ou les deux. Jamais bloquant. */
export async function cloreRelancesEstimation(b: { client_id: string | null; titre?: string | null; reference?: string | null; donnees?: Donnees | null }, quoi: 'avis' | 'reprise' | 'tout' = 'tout'): Promise<void> {
  try {
    const d = b.donnees || {};
    const sortes = quoi === 'tout' ? (['avis', 'reprise'] as const) : [quoi];
    const ids = sortes.map(k => txtD(d, k === 'avis' ? 'relanceAvis' : 'relanceReprise')).filter(Boolean);
    if (ids.length) {
      const r = await supabase.from('relances').update({ statut: 'cloturee' }).in('id', ids).eq('statut', 'en_attente');
      if (r.error) signalerEchec('Les relances de l’estimation', r.error.message);
    }
    /* Celles dont l'id n'a pas été gardé : par leur note, chez le propriétaire. */
    if (b.client_id) {
      const echappe = (t: string) => t.replace(/[\\%_]/g, c => '\\' + c);
      for (const k of sortes) {
        const r = await supabase.from('relances').update({ statut: 'cloturee' }).eq('client_id', b.client_id).eq('statut', 'en_attente')
          .ilike('note', `${echappe(k === 'avis' ? NOTE_AVIS : NOTE_REPRISE)}%· ${echappe(titreSuivi(b))}`);
        if (r.error) signalerEchec('Les relances de l’estimation', r.error.message);
      }
    }
  } catch (e) { signalerEchec('Les relances de l’estimation', (e as Error).message); }
}
/* Une relance de l'estimation, à la date dite (9 h). Celle de la même sorte
   déjà posée se clôt d'abord : jamais deux. Sans propriétaire relié, ou une
   date déjà passée : pas de relance. Rend son id, ou ''. */
export async function poserRelanceEstimation(b: { client_id: string | null; titre?: string | null; reference?: string | null; donnees?: Donnees | null }, quoi: 'avis' | 'reprise', le: string): Promise<string> {
  await cloreRelancesEstimation(b, quoi);
  if (!b.client_id || !dateValide(le) || le < aujourdhui()) return '';
  const nom = nomPourSuivi(b.donnees || {}) || 'le propriétaire';
  const note = `${quoi === 'avis' ? NOTE_AVIS : NOTE_REPRISE}${nom} · ${titreSuivi(b)}`;
  const { data, error } = await supabase.from('relances').insert({
    client_id: b.client_id, type: 'manuelle', statut: 'en_attente', date_echeance: new Date(`${le}T09:00:00`).toISOString(), note,
  }).select('id').single();
  if (error) { signalerEchec('La relance de l’estimation', error.message); return ''; }
  return String((data as { id?: string } | null)?.id || '');
}
export const plusJoursYmd = (ymd: string, n: number) => {
  const x = new Date(`${ymd}T12:00:00`);
  x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/* L'avis de valeur envoyé (une date posée ou changée, où que ce soit) : la
   ligne du Suivi du propriétaire, celle de l'historique du bien, et la
   relance « faire le point » une semaine après. Rend `relanceAvis` à
   enregistrer avec le bien. */
async function avisEnvoye(b: { id: string; client_id: string | null; titre: string | null; reference: string | null }, d: Donnees, avis: string): Promise<string> {
  const basse = typeof d.estimBasse === 'number' ? d.estimBasse : null, haute = typeof d.estimHaute === 'number' ? d.estimHaute : null;
  const prix = typeof d.prix === 'number' ? d.prix : null;
  const fourchette = basse && haute ? `${eurosSuivi(basse)} à ${eurosSuivi(haute)}` : basse || haute ? eurosSuivi((basse || haute) as number) : '';
  const texte = [fourchette, prix ? `prix conseillé ${eurosSuivi(prix)}` : ''].filter(Boolean).join(', ');
  const t = titreSuivi({ ...b, donnees: d });
  await suiviProprio(b.client_id, b.id, 'mail_envoye', `📨 Avis de valeur envoyé — ${t}${texte ? ` : ${texte}` : ''}`, `Envoyé le ${dateLongue(avis)}.`, 'avis');
  try {
    await ajouterSuivi({ bien_id: b.id, type: 'note', commentaire: `Le ${dateLongue(avis)}${texte ? ` : ${texte}` : ''}`, donnees: { avis: true, le: avis, basse, haute, prix } });
  } catch (e) { signalerEchec('L’avis de valeur, dans l’historique du bien', (e as Error).message); }
  return poserRelanceEstimation({ ...b, donnees: d }, 'avis', plusJoursYmd(avis, 7));
}

/* Le bien créé avec son propriétaire, ou un propriétaire relié pour la
   première fois : une ligne dans son Suivi. */
export async function noterProprioRelie(b: { id: string; titre: string | null; reference: string | null; etape: EtapeVente; donnees?: Donnees | null }, clientId: string, cree: boolean): Promise<void> {
  const et = b.etape === 'a_suivre' ? 'projet à suivre' : b.etape === 'estimation' ? 'estimation' : b.etape === 'mandat' ? 'en vente' : '';
  await suiviProprio(clientId, b.id, 'statut_change', `🏠 ${cree ? 'Nouveau bien à vendre' : 'Propriétaire du bien'} — ${titreSuivi(b)}`,
    `${cree ? 'Le bien est créé dans la rubrique Biens' : 'Relié comme propriétaire dans la rubrique Biens'}${et ? ` (${et})` : ''}.`, 'proprio');
}
/* La visite sur place faite (VisiteSurPlace, à la première réponse). */
export async function noterVisiteFaite(b: BienVente): Promise<void> {
  await suiviProprio(b.client_id, b.id, 'rdv', `🏠 Visite d’estimation faite — ${titreSuivi(b)}`, 'Visite sur place, pièce par pièce, notée sur la tablette.', 'visite');
}
/* L'estimation mise de côté (« Le propriétaire veut attendre ») : la ligne
   du Suivi, et la relance « recontacter » à la date notée. L'avis de valeur
   n'appelle plus de « faire le point » : le point est fait. Rend
   `relanceReprise` à enregistrer avec le bien. */
export async function estimationMiseDeCote(b: BienVente, raison: string, reprise: string): Promise<string> {
  await suiviProprio(b.client_id, b.id, 'statut_change', `⏸️ Estimation mise de côté — ${titreSuivi(b)}`,
    [raison.trim() ? `Pourquoi : ${raison.trim()}` : '', dateValide(reprise) ? `À recontacter vers le ${dateLongue(reprise)}.` : ''].filter(Boolean).join('\n') || null, 'attente');
  await cloreRelancesEstimation(b, 'avis');
  return dateValide(reprise) ? poserRelanceEstimation(b, 'reprise', reprise) : '';
}

/* ══ Le propriétaire ═══════════════════════════════════════════════════ */
/* Sa fiche, créée depuis le bien : le minimum, de type « propriétaire »
   (V3.137 ; « vendeur » une fois relié à un bien en vente, voir
   `marquerVendeur`) — et pas un acheteur « actif » : il ne cherche rien.
   Avant le SQL des types de contact, la colonne `types` manque : on crée
   sans elle. */
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
  let r = await supabase.from('clients').insert({ ...ligne, types: ['proprietaire'] }).select(CLIENT_COLS).single();
  if (r.error && colonneContactAbsente(r.error.message)) r = await supabase.from('clients').insert(ligne).select(CLIENT_COLS).single();
  if (r.error) throw new Error('La fiche du propriétaire n’a pas pu être créée : ' + r.error.message);
  return r.data as ClientMini;
}

/* La fiche d'un visiteur venu hors du CRM (V3.50, « Créer sa fiche » sur sa
   visite) : le minimum, comme pour un propriétaire, mais acheteur et
   prospect — sa recherche s'ouvrira depuis sa fiche. */
export async function creerFicheAcheteur(p: Personne): Promise<ClientMini> {
  const reference = await genererReference();
  const ligne = {
    reference, prenom: p.prenom || '', nom: p.nom || '', token_espace: jetonEspace(p.prenom, p.nom),
    emails: p.email ? [p.email.trim().toLowerCase()] : [], telephones: p.telephone ? [p.telephone.trim()] : [],
    statut: 'prospect',
  };
  let r = await supabase.from('clients').insert({ ...ligne, types: ['acheteur'] }).select(CLIENT_COLS).single();
  if (r.error && colonneContactAbsente(r.error.message)) r = await supabase.from('clients').insert(ligne).select(CLIENT_COLS).single();
  if (r.error) throw new Error('La fiche du visiteur n’a pas pu être créée : ' + r.error.message);
  return r.data as ClientMini;
}

/* ── Avant de créer (V3.50) : ce qui existe peut-être déjà ──
   Alexandre créait parfois deux fois le même propriétaire (une fiche venue du
   site, une autre tapée depuis le bien) ou le même bien (un second « Nouveau
   bien » pour la même adresse). On cherche d'abord ; il choisit. */
const sansAccentO = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const cleTel = (t: string) => { const c = String(t || '').replace(/\D/g, ''); return c.length >= 9 ? c.slice(-9) : ''; };
/* Les contacts qui ressemblent à cette personne : même e-mail, même
   téléphone (les 9 derniers chiffres : « 06… » et « +33 6… »), ou mêmes
   prénom et nom. */
export function doublonsContact(clients: ClientMini[], p: { prenom: string; nom: string; email: string; telephone: string }): ClientMini[] {
  const email = p.email.trim().toLowerCase();
  const tel = cleTel(p.telephone);
  const nom = p.nom.trim() ? sansAccentO(`${p.prenom} ${p.nom}`) : '';
  return clients.filter(c => (!!email && (c.emails || []).some(e => String(e || '').trim().toLowerCase() === email))
    || (!!tel && (c.telephones || []).some(t => cleTel(t) === tel))
    || (!!nom && sansAccentO(`${c.prenom || ''} ${c.nom || ''}`) === nom)).slice(0, 3);
}
/* L'adresse d'un bien, pour la comparer à une autre : sans accents ni
   ponctuation, les abréviations dépliées (« av. » = « avenue »). */
const ABREV: Record<string, string> = {
  av: 'avenue', ave: 'avenue', bd: 'boulevard', bld: 'boulevard', boul: 'boulevard', r: 'rue', pl: 'place', all: 'allee', imp: 'impasse',
  fg: 'faubourg', fbg: 'faubourg', st: 'saint', ste: 'sainte', chem: 'chemin', rte: 'route', sq: 'square', crs: 'cours', qu: 'quai', pass: 'passage',
};
export function cleAdresseBien(d: Donnees): { rue: string; cp: string; ville: string } {
  const rue = cleAdresse(txtD(d, 'adresse')).split(' ').filter(Boolean).map(m => ABREV[m] || m).join(' ');
  return { rue, cp: txtD(d, 'cp').replace(/\s/g, ''), ville: cleAdresse(txtD(d, 'ville')) };
}
/* Un autre bien à la même adresse (même rue et numéro, même code postal ou
   même ville), ou au même propriétaire encore en cours (ni vendu, ni archivé). */
export type BienSemblable = { bien: BienVente; pourquoi: 'adresse' | 'proprio' };
export function biensSemblables(d: Donnees, biens: BienVente[], sauf: string, ignores: string[] = []): BienSemblable[] {
  const a = cleAdresseBien(d);
  const adresseOk = a.rue.length >= 6 && /\d/.test(a.rue);
  const proprio = typeof d.clientId === 'string' && d.clientId ? d.clientId : '';
  const out: BienSemblable[] = [];
  for (const x of biens) {
    if (x.id === sauf || ignores.includes(x.id)) continue;
    const bx = cleAdresseBien(x.donnees || {});
    if (adresseOk && bx.rue === a.rue && ((!!a.cp && a.cp === bx.cp) || (!!a.ville && a.ville === bx.ville) || !a.cp || !bx.cp)) { out.push({ bien: x, pourquoi: 'adresse' }); continue; }
    if (proprio && x.client_id === proprio && !x.archive && x.etape !== 'vendu') out.push({ bien: x, pourquoi: 'proprio' });
  }
  return out.slice(0, 3);
}
/* Un brouillon resté vide (V3.50) : « Nouveau bien » ouvert puis laissé
   (l'onglet fermé avant « Terminer »). Strictement vide, créé il y a plus
   de 24 h, sans autre ligne d'historique que sa création, présenté à
   personne, sans document. */
export function brouillonVide(x: BienVente, l: Pick<ListeBiens, 'suivi' | 'copies'>): boolean {
  if (x.archive || x.document_id || !bienVide(x.donnees || {})) return false;
  const t = Date.parse(x.created_at);
  if (!Number.isFinite(t) || Date.now() - t < 86_400_000) return false;
  if (l.suivi.some(y => y.bien_id === x.id && !(y.type === 'etape' && (y.donnees as Record<string, unknown> | null)?.de === 'creation'))) return false;
  return !l.copies.some(c => c.bien_vente_id === x.id);
}
/* La suppression d'un brouillon : refusée s'il a un document dans Documents. */
export async function supprimerBrouillon(x: BienVente): Promise<void> {
  const { data, error } = await supabase.from('documents').select('id').eq('donnees->>bienVenteId', x.id).limit(1);
  if (error) lever('Les documents du bien n’ont pas pu être lus', error.message);
  if (data?.length) throw new Error('Ce bien a un document dans Documents : ouvre sa fiche pour le compléter, ou supprime-le depuis sa fiche.');
  await supprimerBien(x);
}

/* Le type d'un propriétaire suit ses biens (V3.137, voir `typesSelonBiens`
   dans src/lib/contacts.ts) : Vendeur quand un bien est en mandat, sous
   offre ou sous compromis ; Propriétaire sinon. Appelée quand un contact est
   relié à un bien et à chaque changement d'étape fait ici ; la base fait la
   même chose toute seule (outils/sql/vendeurs-en-vente.sql), y compris pour
   un mandat signé en ligne. Le nom est resté : avant la V3.137, tout
   propriétaire relié devenait « vendeur ». Sans la colonne des types (avant
   le SQL des types), rien à faire.
   V3.50 : une lecture qui échoue se dit ; rend `false` sur un échec. */
export async function marquerVendeur(clientId: string): Promise<boolean> {
  const { data, error } = await supabase.from('clients').select('types, archive').eq('id', clientId).maybeSingle();
  if (error) {
    if (colonneContactAbsente(error.message)) return true;
    signalerEchec('Le type « vendeur » du contact', error.message);
    return false;
  }
  if (!data) { signalerEchec('Le type « vendeur » du contact', 'contact introuvable'); return false; }
  /* Un archivé garde ses types (on le retrouve par type parmi les archivés). */
  if ((data as { archive?: boolean | null }).archive === true) return true;
  const { data: biens, error: eB } = await supabase.from('biens_vente').select('etape, archive').eq('client_id', clientId);
  if (eB) { signalerEchec('Le type « vendeur » du contact', `ses biens n’ont pas pu être lus (${eB.message})`); return false; }
  const n = typesSelonBiens(typesDe(data), (biens || []) as { etape: string | null; archive: boolean | null }[]);
  if (!n) return true;
  const { error: e2 } = await supabase.from('clients').update({ types: n }).eq('id', clientId);
  if (e2 && !colonneContactAbsente(e2.message)) { signalerEchec('Le type « vendeur » du contact', e2.message); return false; }
  return true;
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
      /* V3.45 : l'offre du suivi dont il est le document — la carte de
         l'offre le retrouve, au lieu d'en commencer un autre à chaque clic. */
      ...(o?.id ? { offreSuiviId: o.id } : {}),
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
