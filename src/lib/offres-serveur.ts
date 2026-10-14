/* ═══ Le fil d'une offre, côté serveur (V3.189) ═════════════════════════════

   Ce que chaque étape d'une offre écrit autour d'elle — les relances, le
   bien, la transaction, les mails — et ce que l'espace du client en lit.
   Serveur uniquement (clé service). Voir src/lib/offres.ts pour le fil
   lui-même (états, mots, historique).

   ⚠️ N'importe pas src/lib/signature-documents.ts : c'est lui qui appelle
   ce fichier (classer → offreSigneeParTous).
   ════════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  lireSuivi, etatDeOffre, filDuBien, offreCourante, totalOffre, prixOffre, envoisOffre, finOffre, totalContre, contreDepassee,
  historiqueFil, visiblePourClient, rangVisible, brouillonCrmVivant, TETES_OFFRE, ENCOURS,
  estAgence, lienAgence, avecAgence, appliquerLignes, idsLignesAgence, COLONNES_LIGNE_AGENCE,
  type DocOffre, type SuiviOffre, type ReponseVendeur, type OffreEspace, type SaisieOffre, type LigneAgence,
} from './offres';
import { signatairesEspace, COLONNES_SIGNATAIRES, type LigneSignataire, type FicheEspace } from './documents-espace';
import { lirePersonnes, num, txt, type Donnees } from './actes/commun';
import { envoyerMail, echappe, ALERTES, CRM } from './mandat-serveur';
import { enveloppeMail, MAIL } from './mail-charte';
import { lienEspace } from './jeton';
import { alerteMailActive } from './alertes';
import { apresReponse, echangesDe, montantActuel, titreBien as titreVente, type SuiviVente } from './biens-vente';

const EUR = (x: number) => `${Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} €`;
const jourParis = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);
const JOUR = (iso: string) => {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }) : '';
};
const COLONNES_DOC = 'id, modele, statut, donnees, created_at, signe_le, envois, signature, bien_id, client_id, recherche_id, titre';

/* ── Lire ── */

export async function lireOffre(sb: SupabaseClient, id: string): Promise<DocOffre | null> {
  const { data, error } = await sb.from('documents').select(COLONNES_DOC).eq('id', id).eq('modele', 'offre_achat').maybeSingle();
  if (error) throw new Error('L’offre n’a pas pu être lue : ' + error.message);
  return (data as DocOffre | null) || null;
}
/** Le fil de ce client sur ce bien. */
export async function lireFil(sb: SupabaseClient, clientId: string, bienId: string): Promise<DocOffre[]> {
  const { data, error } = await sb.from('documents').select(COLONNES_DOC)
    .eq('modele', 'offre_achat').eq('client_id', clientId).eq('bien_id', bienId).neq('statut', 'annule');
  if (error) throw new Error('Les offres de ce bien n’ont pas pu être lues : ' + error.message);
  return filDuBien((data || []) as DocOffre[], bienId);
}
/* V3.190 — Les offres sur un bien de l'agence, lues avec leur ligne de la
   fiche du bien (avecAgence, src/lib/offres.ts) : c'est elle qui dit la
   réponse du vendeur. Une lecture ratée rend les offres telles quelles. */
export async function avecLignesAgence<T extends DocOffre>(sb: SupabaseClient, docs: T[]): Promise<T[]> {
  const ids = idsLignesAgence(docs);
  if (!ids.length) return docs;
  const { data, error } = await sb.from('biens_vente_suivi').select(COLONNES_LIGNE_AGENCE).in('id', ids);
  if (error) { console.error('[offres] lignes du bien', error.message); return docs; }
  return appliquerLignes(docs, (data || []) as LigneAgence[]);
}
/** Le fil, tel que le client et le CRM le voient (avec la fiche du bien). */
export async function lireFilVue(sb: SupabaseClient, clientId: string, bienId: string): Promise<DocOffre[]> {
  return avecLignesAgence(sb, await lireFil(sb, clientId, bienId));
}
export async function lireOffreVue(sb: SupabaseClient, id: string): Promise<DocOffre | null> {
  const doc = await lireOffre(sb, id);
  return doc ? (await avecLignesAgence(sb, [doc]))[0] : null;
}
async function titreDuBien(sb: SupabaseClient, bienId: string | null | undefined): Promise<string> {
  if (!bienId) return 'un bien';
  const { data } = await sb.from('biens').select('titre, ville, type_bien').eq('id', bienId).maybeSingle();
  const b = data as { titre?: string | null; ville?: string | null; type_bien?: string | null } | null;
  return b?.titre || [b?.type_bien, b?.ville].filter(Boolean).join(' — ') || 'un bien';
}

/* ── Écrire le suivi ──
   Lu puis réécrit, seulement `donnees.suivi` : le texte de l'offre ne
   bouge pas, et `updated_at` (quand le texte a changé) non plus. */
export async function majSuivi(sb: SupabaseClient, id: string, fn: (s: SuiviOffre) => SuiviOffre): Promise<string | null> {
  const { data, error } = await sb.from('documents').select('donnees').eq('id', id).maybeSingle();
  if (error || !data) return error?.message || 'offre introuvable';
  const d = ((data as { donnees?: Donnees | null }).donnees || {}) as Donnees;
  const brut = d.suivi && typeof d.suivi === 'object' ? d.suivi as Record<string, unknown> : {};
  const suivi = { ...brut, ...fn(lireSuivi(d)) };
  const { error: e2 } = await sb.from('documents').update({ donnees: { ...d, suivi } }).eq('id', id);
  return e2 ? e2.message : null;
}
/* Quelques champs posés dans `donnees`, relue juste avant (le texte de
   l'offre ne bouge pas). */
async function poserDansDonnees(sb: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await sb.from('documents').select('donnees').eq('id', id).maybeSingle();
  if (error || !data) return error?.message || 'offre introuvable';
  const d = ((data as { donnees?: Donnees | null }).donnees || {}) as Donnees;
  const { error: e2 } = await sb.from('documents').update({ donnees: { ...d, ...patch } }).eq('id', id);
  return e2 ? e2.message : null;
}

/* ── Les relances ──
   Reconnues à leur début (TETES_OFFRE) et au titre du bien : une seule
   ouverte à la fois pour un même geste sur un même bien. */
const echappeLike = (t: string) => t.replace(/[\\%_]/g, c => '\\' + c);
export async function solderRelancesOffre(sb: SupabaseClient, clientId: string | null | undefined, titre: string, tetes: string[]): Promise<string | null> {
  if (!clientId) return null;
  for (const tete of tetes) {
    const { error } = await sb.from('relances').update({ statut: 'cloturee' })
      .eq('client_id', clientId).eq('statut', 'en_attente').ilike('note', `${tete} — ${echappeLike(titre)}%`);
    if (error) return error.message;
  }
  return null;
}
async function poserRelanceOffre(sb: SupabaseClient, o: { clientId: string; rechercheId: string | null; tete: string; titre: string; detail?: string; echeance?: Date }): Promise<string | null> {
  const pb = await solderRelancesOffre(sb, o.clientId, o.titre, [o.tete]);
  if (pb) return pb;
  const { error } = await sb.from('relances').insert({
    client_id: o.clientId, recherche_id: o.rechercheId, type: 'rappel_client', statut: 'en_attente',
    date_echeance: (o.echeance || new Date()).toISOString(),
    note: `${o.tete} — ${o.titre}${o.detail ? ` · ${o.detail}` : ''}`.slice(0, 600),
  });
  return error ? error.message : null;
}
/* Les relances « Veut faire une offre — <bien> » nées de son avis après la
   visite : l'offre est là (comme solderRelancesRetourVisite côté CRM). */
async function solderVeutOffrir(sb: SupabaseClient, clientId: string, titre: string): Promise<string | null> {
  const { error } = await sb.from('relances').update({ statut: 'cloturee' })
    .eq('client_id', clientId).eq('type', 'rappel_client').eq('statut', 'en_attente').ilike('note', `Veut faire une offre — ${echappeLike(titre)}%`);
  return error ? error.message : null;
}

async function journal(sb: SupabaseClient, l: { client_id: string; recherche_id?: string | null; bien_id?: string | null; type: string; titre: string; description?: string | null; metadata?: Record<string, unknown> }) {
  const { error } = await sb.from('journal').insert(l);
  if (!error) return;
  /* Un type que la base refuse (liste fermée) : gardé sous « statut_change ». */
  if ((error as { code?: string }).code === '23514' && l.type !== 'statut_change') {
    const { error: e2 } = await sb.from('journal').insert({ ...l, type: 'statut_change', metadata: { ...(l.metadata || {}), type_voulu: l.type } });
    if (e2) console.error('[offres] journal', e2.message);
    return;
  }
  console.error('[offres] journal', error.message);
}

/* Le bien dans Présentés : « Offre faite » tant qu'une offre court, et de
   nouveau « Visité » quand elle s'arrête sans accord. */
async function badgeBien(sb: SupabaseClient, bienId: string | null | undefined, badge: 'offre_faite' | 'visite') {
  if (!bienId) return;
  const q = sb.from('biens').update({ badge_retour: badge }).eq('id', bienId);
  const { error } = badge === 'visite' ? await q.eq('badge_retour', 'offre_faite') : await q;
  if (error) console.error('[offres] badge du bien', error.message);
}

/* ── Les étapes ── */

/** L'offre part en signature (lancée du CRM) : elle prend la suite de la
    précédente, et « Offre à relire » a sa réponse. */
export async function offrePartieEnSignature(sb: SupabaseClient, doc: { id: string; donnees: Donnees | null; client_id: string | null; bien_id: string | null }): Promise<string | null> {
  const s = lireSuivi(doc.donnees);
  const pbs: string[] = [];
  if (s.precedente) {
    const pb = await majSuivi(sb, s.precedente, x => (x.remplacee_le ? x : { ...x, remplacee_le: new Date().toISOString() }));
    if (pb) pbs.push('l’offre précédente : ' + pb);
  }
  const titre = await titreDuBien(sb, doc.bien_id);
  const pb = await solderRelancesOffre(sb, doc.client_id, titre, [TETES_OFFRE.relire, TETES_OFFRE.contre]);
  if (pb) pbs.push('relances : ' + pb);
  return pbs.length ? pbs.join(' ; ') : null;
}

/** Signée par tous (appelé par classer) : la relance « à envoyer », le bien
    passe « Offre faite », la précédente est remplacée. */
export async function offreSigneeParTous(sb: SupabaseClient, doc: { id: string; donnees: Donnees | null; client_id: string | null; recherche_id: string | null; bien_id: string | null }): Promise<string | null> {
  if (!doc.client_id) return null;
  const pbs: string[] = [];
  let d: Donnees = doc.donnees || {};
  const s = lireSuivi(d);
  /* Close (sans suite) ou remplacée entre-temps : elle ne repart pas. */
  if (s.close || s.remplacee_le) return null;
  /* V3.190 : l'offre écrite depuis la fiche d'un bien de l'agence (« Préparer
     une offre ») : sa ligne est déjà dans les offres du bien. Rien à
     envoyer, rien à relier (la V3.189 posait à tort « à envoyer »). */
  if (estAgence(d) && !doc.bien_id) return null;
  /* Une offre du CRM sur un bien de l'agence, écrite avant la V3.190 (sans
     son lien au bien en vente) : on le retrouve par le bien du client. */
  if (!estAgence(d) && doc.bien_id) {
    const { data: b } = await sb.from('biens').select('bien_vente_id').eq('id', doc.bien_id).maybeSingle();
    const vente = (b as { bien_vente_id?: string | null } | null)?.bien_vente_id;
    if (vente) {
      const pb = await poserDansDonnees(sb, doc.id, { bienVenteId: vente });
      if (pb) pbs.push('le lien au bien en vente : ' + pb);
      else d = { ...d, bienVenteId: vente };
    }
  }
  if (s.precedente) {
    const pb = await majSuivi(sb, s.precedente, x => (x.remplacee_le ? x : { ...x, remplacee_le: new Date().toISOString() }));
    if (pb) pbs.push('l’offre précédente : ' + pb);
  }
  const titre = await titreDuBien(sb, doc.bien_id);
  const total = totalOffre(d);
  const pb1 = await solderRelancesOffre(sb, doc.client_id, titre, [TETES_OFFRE.relire, TETES_OFFRE.contre]);
  if (pb1) pbs.push(pb1);
  /* Un bien de l'agence : l'offre rejoint les offres de sa fiche, où Alexandre
     note la réponse du vendeur. Si ça rate, « Offre signée, à envoyer » le
     lui dit, et « Son offre » propose de l'y ajouter. */
  const lie = estAgence(d) ? await relierOffreAgence(sb, { ...doc, donnees: d }) : null;
  if (lie?.pb) pbs.push('les offres du bien : ' + lie.pb);
  if (!lie?.relie) {
    const pb2 = await poserRelanceOffre(sb, {
      clientId: doc.client_id, rechercheId: doc.recherche_id, tete: TETES_OFFRE.envoyer, titre,
      detail: lie
        ? `${total ? `${EUR(total)} · ` : ''}à ajouter aux offres de la fiche du bien, depuis « Son offre » (${lie.pb})`
        : total ? `${EUR(total)} frais d’agence compris${prixOffre(d) !== total ? ` (${EUR(prixOffre(d) || 0)} pour le vendeur)` : ''}` : undefined,
    });
    if (pb2) pbs.push('relance « à envoyer » : ' + pb2);
  }
  const pb3 = await solderVeutOffrir(sb, doc.client_id, titre);
  if (pb3) pbs.push(pb3);
  await badgeBien(sb, doc.bien_id, 'offre_faite');
  /* Le mail « Signé par tous » (alerte document_signe, signature-documents.ts)
     prévient déjà Alexandre, le PDF joint : pas de second mail ici. */
  return pbs.length ? pbs.join(' ; ') : null;
}

/** Envoyée à l'agence : « à envoyer » a sa réponse ; une relance pour la
    veille de la fin de validité (« relancer l'agence »). */
export async function offreEnvoyee(sb: SupabaseClient, doc: { id: string; donnees: Donnees | null; client_id: string | null; recherche_id: string | null; bien_id: string | null }): Promise<string | null> {
  if (!doc.client_id) return null;
  const pbs: string[] = [];
  const titre = await titreDuBien(sb, doc.bien_id);
  const pb = await solderRelancesOffre(sb, doc.client_id, titre, [TETES_OFFRE.envoyer]);
  if (pb) pbs.push(pb);
  const fin = finOffre(doc.donnees);
  const s = lireSuivi(doc.donnees);
  if (fin && !s.reponse) {
    /* La veille au matin ; pour une offre qui finit demain ou avant : maintenant. */
    const veille = new Date(fin.getTime() - 86_400_000);
    veille.setUTCHours(7, 0, 0, 0);
    const pb2 = await poserRelanceOffre(sb, {
      clientId: doc.client_id, rechercheId: doc.recherche_id, tete: TETES_OFFRE.reponse, titre,
      detail: `valable jusqu’au ${JOUR(fin.toISOString())} : relancer l’agence si elle n’a pas répondu`,
      echeance: veille.getTime() > Date.now() ? veille : new Date(),
    });
    if (pb2) pbs.push(pb2);
  }
  await badgeBien(sb, doc.bien_id, 'offre_faite');
  return pbs.length ? pbs.join(' ; ') : null;
}

/* ── Un bien de l'agence : l'offre rejoint la fiche du bien (V3.190) ──
   Ce que fait « Une offre est arrivée » sur la fiche du bien
   (enregistrerOffre, src/components/biens/outils.ts), côté serveur :
     · la ligne de l'offre (`biens_vente_suivi`, type 'offre', en attente du
       vendeur). Après une contre-proposition ou un refus, la MÊME ligne :
       une proposition de plus dans ses échanges (un acquéreur = un bloc,
       V3.45) ;
     · la relance du propriétaire « réponse à donner », le jour où l'offre
       expire — tout de suite quand la contre-proposition du vendeur est
       acceptée (Alexandre note l'accord sur la fiche du bien) ;
     · le bien passe « Sous offre » s'il était en vente (comme la case
       cochée d'office de la fenêtre) ;
     · une ligne dans le Suivi du vendeur et dans celui de l'acquéreur.
   Puis l'offre garde son lien (`lienAgence`). Rejouable : une ligne qui
   porte déjà cette offre n'est pas reprise une seconde fois. */
const OUVERTES = ['en_attente', 'contre'];
const JOURA = (ymd: string) => {
  const t = new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : '';
};
const fr = (n: number) => Math.round(n).toLocaleString('fr-FR');
function nomsAcquereurs(d: Donnees): string {
  const l = lirePersonnes(d.acquereurs).map(p => `${p.prenom} ${p.nom}`.trim()).filter(Boolean);
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}` : l[0] || '';
}
function conditionsOffre(d: Donnees): string {
  const c = Array.isArray(d.conditions) ? (d.conditions as unknown[]).map(String) : [];
  return [
    c.includes('vente') ? `sous réserve de la vente de son bien${txt(d, 'venteBien') ? ` (${txt(d, 'venteBien')})` : ''}` : '',
    c.includes('autre') && txt(d, 'conditionAutre') ? txt(d, 'conditionAutre') : '',
  ].filter(Boolean).join(' ; ');
}
type VenteLue = { id: string; etape: string; client_id: string | null; titre: string | null; donnees: Donnees | null };
async function lireVente(sb: SupabaseClient, id: string): Promise<VenteLue | null> {
  const { data, error } = await sb.from('biens_vente').select('id, etape, client_id, titre, donnees').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as VenteLue | null) || null;
}
async function clore(sb: SupabaseClient, relanceId: unknown): Promise<string | null> {
  if (typeof relanceId !== 'string' || !relanceId) return null;
  const { error } = await sb.from('relances').update({ statut: 'cloturee' }).eq('id', relanceId).eq('statut', 'en_attente');
  return error ? error.message : null;
}

/** `relie` : l'offre est dans les offres du bien (même avec un souci à côté, dit dans `pb`). */
export type Reliure = { relie: boolean; pb: string | null };
export async function relierOffreAgence(sb: SupabaseClient, doc: { id: string; donnees: Donnees | null; client_id: string | null; recherche_id: string | null; bien_id: string | null }): Promise<Reliure> {
  const d = (doc.donnees || {}) as Donnees;
  const rate = (pb: string): Reliure => ({ relie: false, pb });
  const venteId = txt(d, 'bienVenteId');
  if (!venteId || !doc.bien_id || !doc.client_id) return rate('ce n’est pas une offre sur un bien de l’agence');
  if (lienAgence({ id: doc.id, donnees: d })) return { relie: true, pb: null };
  if (lireSuivi(d).close || lireSuivi(d).remplacee_le) return rate('cette offre est close, ou remplacée par une plus récente');
  const prix = prixOffre(d);
  if (!prix) return rate('le prix de l’offre manque');
  let bv: VenteLue | null;
  try { bv = await lireVente(sb, venteId); } catch (e) { return rate('le bien en vente : ' + (e as Error).message); }
  if (!bv) return rate('le bien en vente est introuvable');
  const titreV = bv.titre || titreVente(bv.donnees || {});
  const s = lireSuivi(d);
  const jour = jourParis();
  const maintenant = new Date().toISOString();
  const qui = nomsAcquereurs(d) || await nomClient(sb, doc.client_id);
  const jusquau = /^\d{4}-\d{2}-\d{2}$/.test(txt(d, 'validite')) ? txt(d, 'validite') : null;
  const infos: Record<string, unknown> = {
    jusquau, financement: d.pret === 'non' ? 'comptant' : d.pret === 'oui' ? 'pret' : null,
    apport: num(d, 'apport'), pret: d.pret === 'oui' ? num(d, 'pretMontant') : null,
    conditions: conditionsOffre(d), documentId: doc.id, origine: s.origine || 'crm',
  };
  const pbs: string[] = [];

  /* Sa ligne d'avant : celle de l'offre qu'elle suit, sinon une offre de lui
     encore ouverte sur ce bien (notée à la main sur la fiche du bien). */
  let ligne: SuiviVente | null = null;
  const indice = txt(d, 'offreSuiviId');
  if (indice) {
    const { data } = await sb.from('biens_vente_suivi').select('*').eq('id', indice).eq('bien_id', venteId).eq('type', 'offre').maybeSingle();
    ligne = (data as SuiviVente | null) || null;
  }
  if (!ligne) {
    const { data, error } = await sb.from('biens_vente_suivi').select('*').eq('bien_id', venteId).eq('type', 'offre').eq('client_id', doc.client_id)
      .order('le', { ascending: false }).limit(10);
    if (error) return rate('les offres du bien n’ont pas pu être lues : ' + error.message);
    const l = (data || []) as SuiviVente[];
    ligne = l.find(x => x.donnees?.documentId === doc.id) || l.find(x => !x.statut || OUVERTES.includes(x.statut)) || null;
  }
  if (ligne && ligne.client_id && ligne.client_id !== doc.client_id) ligne = null;
  const dejaLa = !!ligne && ligne.donnees?.documentId === doc.id;
  /* Il accepte la contre-proposition, et Alexandre a déjà noté l'accord sur
     la fiche du bien (au téléphone) : l'offre signée en est l'écrit — même
     ligne, rien ne repart au vendeur. */
  const accordNote = !!ligne && !dejaLa && ligne.statut === 'acceptee' && !!s.depuisContre;
  const reprise = !!ligne && (dejaLa || accordNote || !ligne.statut || ['en_attente', 'contre', 'refusee'].includes(ligne.statut)
    || (ligne.statut === 'retiree' && !ligne.donnees?.compromisTombe));
  const titreCopie = await titreDuBien(sb, doc.bien_id);
  const lierSeulement = async (l: SuiviVente, i: number): Promise<Reliure> => {
    const pbL = await poserDansDonnees(sb, doc.id, { offreSuiviId: l.id, lienAgence: { suivi: l.id, echange: Math.max(0, i), le: maintenant, doc: doc.id } });
    if (pbL) return rate('le lien de l’offre : ' + pbL);
    const pbE = await solderRelancesOffre(sb, doc.client_id, titreCopie, [TETES_OFFRE.envoyer]);
    return { relie: true, pb: pbE ? 'la relance « à envoyer » : ' + pbE : null };
  };

  let ligneId: string;
  let echange: number;
  let avant: SuiviVente | null = null;
  if (ligne && reprise && dejaLa) {
    /* Un premier essai interrompu : la ligne porte déjà cette offre. */
    const ech = echangesDe(ligne);
    let i = ech.length - 1;
    while (i > 0 && ech[i].par !== 'acquereur') i--;
    return lierSeulement(ligne, i);
  }
  if (ligne && reprise && accordNote) {
    await figerOffreDAvant(sb, ligne, doc.id, pbs);
    const { error } = await sb.from('biens_vente_suivi').update({ donnees: { ...(ligne.donnees || {}), documentId: doc.id } }).eq('id', ligne.id);
    if (error) return rate('la ligne de son offre : ' + error.message);
    const r = await lierSeulement(ligne, echangesDe(ligne).length - 1);
    return { relie: r.relie, pb: [...pbs, r.pb].filter(Boolean).join(' ; ') || null };
  }
  if (ligne && reprise) {
    avant = ligne;
    /* L'offre d'avant garde ce que la ligne lui avait répondu (son historique). */
    await figerOffreDAvant(sb, ligne, doc.id, pbs);
    const { statut, donnees } = apresReponse(ligne, { k: 'propose', montant: prix }, jour);
    const nd = { ...donnees, ...infos };
    const { error } = await sb.from('biens_vente_suivi').update({
      statut, donnees: nd, ...(ligne.client_id ? {} : { client_id: doc.client_id }), ...(ligne.recherche_id ? {} : { recherche_id: doc.recherche_id }),
    }).eq('id', ligne.id);
    if (error) return rate('la ligne de son offre : ' + error.message);
    ligneId = ligne.id;
    echange = Math.max(0, (Array.isArray(nd.echanges) ? nd.echanges.length : 1) - 1);
    ligne = { ...ligne, statut, donnees: nd };
  } else {
    const { data, error } = await sb.from('biens_vente_suivi').insert({
      bien_id: venteId, type: 'offre', le: maintenant, qui, client_id: doc.client_id, recherche_id: doc.recherche_id,
      montant: prix, statut: 'en_attente', commentaire: s.origine === 'espace' ? 'Faite depuis son espace, signée en ligne.' : null,
      donnees: { ...infos, echanges: [{ le: jour, par: 'acquereur', montant: prix }] },
    }).select('*').single();
    if (error || !data) return rate('la ligne de son offre : ' + (error?.message || 'rien n’a été écrit'));
    ligne = data as SuiviVente;
    ligneId = ligne.id;
    echange = 0;
  }

  /* L'offre garde son lien : c'est par lui que le fil lit la fiche du bien. */
  /* Sans lui, la ligne porte quand même l'offre (`documentId`) : « L'ajouter
     aux offres du bien » le repose sans rien refaire. */
  const pbL = await poserDansDonnees(sb, doc.id, { offreSuiviId: ligneId, lienAgence: { suivi: ligneId, echange, le: maintenant, doc: doc.id } });
  if (pbL) pbs.push('le lien de l’offre : ' + pbL);

  /* La relance du propriétaire, gardée avec l'offre (cloreRelanceOffre la clôt à sa réponse). */
  const pbR0 = await clore(sb, avant?.donnees?.relance_id);
  if (pbR0) pbs.push('l’ancienne relance du propriétaire : ' + pbR0);
  if (bv.client_id && (s.depuisContre || (jusquau && jusquau >= jour))) {
    const note = s.depuisContre
      ? `Offre de ${qui} à ${fr(prix)} € sur ${bv.titre || 'son bien'} : la contre-proposition du vendeur est acceptée — note l’accord sur la fiche du bien.`
      : `Offre de ${qui} à ${fr(prix)} € sur ${bv.titre || 'son bien'} : réponse à donner aujourd’hui.`;
    const { data: rel, error: eR } = await sb.from('relances').insert({
      client_id: bv.client_id, type: 'manuelle', statut: 'en_attente',
      date_echeance: s.depuisContre ? maintenant : new Date(`${jusquau}T07:00:00Z`).toISOString(), note,
    }).select('id').single();
    if (eR) pbs.push('la relance du propriétaire : ' + eR.message);
    else if (rel?.id) {
      const { error: eL } = await sb.from('biens_vente_suivi').update({ donnees: { ...(ligne.donnees || {}), relance_id: rel.id } }).eq('id', ligneId);
      if (eL) pbs.push('le lien entre l’offre et sa relance : ' + eL.message);
    }
  }

  /* Le bien passe « Sous offre ». */
  if (bv.etape === 'mandat' || bv.etape === 'suspendu') {
    const { data: passe, error: eE } = await sb.from('biens_vente').update({ etape: 'offre', etape_le: maintenant, updated_at: maintenant })
      .eq('id', bv.id).eq('etape', bv.etape).select('id');
    if (eE) pbs.push('le bien « Sous offre » : ' + eE.message);
    else if (passe?.length) {
      const { error: eS } = await sb.from('biens_vente_suivi').insert({
        bien_id: bv.id, type: 'etape', statut: 'offre', le: maintenant, donnees: { de: bv.etape, offre: ligneId, montant: prix, qui },
      });
      if (eS) pbs.push('l’historique du bien : ' + eS.message);
    }
  }

  /* Le Suivi des deux côtés (comme noterJalon). */
  const nouvelle = !avant;
  const sur = avant ? montantActuel(avant) : 0;
  const repond = avant?.statut === 'contre';
  const fin = d.pret === 'non' ? 'Financement : comptant' : d.pret === 'oui' ? 'Financement : avec un prêt' : null;
  if (bv.client_id) {
    await journal(sb, {
      client_id: bv.client_id, type: 'etape_transaction',
      titre: nouvelle ? `💶 Offre reçue — ${EUR(prix)}` : `💶 Nouvelle proposition — ${EUR(prix)}`,
      description: [
        nouvelle ? `${titreV} · offre de ${qui}, signée le ${JOURA(jour)}` : `${titreV} · ${qui} ${repond ? `répond à la contre-offre de ${EUR(sur)}` : 'fait une nouvelle offre'}`,
        jusquau ? `Valable jusqu’au ${JOURA(jusquau)}` : null, fin,
      ].filter(Boolean).join('\n'),
      metadata: { jalon: nouvelle ? 'offre_recue' : 'negociation', cote: 'vendeur', bien_vente_id: bv.id },
    });
  }
  await journal(sb, {
    client_id: doc.client_id, recherche_id: doc.recherche_id, bien_id: doc.bien_id, type: nouvelle ? 'offre' : 'etape_transaction',
    titre: nouvelle ? `💶 Offre à ${EUR(prix)} — ${titreV}` : `💶 Nouvelle proposition — ${EUR(prix)}`,
    description: [
      nouvelle ? `Signée le ${JOURA(jour)}` : `${titreV} · ${repond ? `en réponse à la contre-offre du vendeur à ${EUR(sur)}` : 'une nouvelle offre'}`,
      jusquau ? `Valable jusqu’au ${JOURA(jusquau)}` : '',
    ].filter(Boolean).join(' · '),
    metadata: { bien_vente_id: bv.id, suivi_id: ligneId, jalon: nouvelle ? 'offre_faite' : 'negociation', cote: 'acquereur', document_id: doc.id },
  });
  /* Ajoutée après coup (« Son offre ») : « Offre signée, à envoyer » a sa réponse. */
  if (!pbL) {
    const pbE = await solderRelancesOffre(sb, doc.client_id, titreCopie, [TETES_OFFRE.envoyer]);
    if (pbE) pbs.push('la relance « à envoyer » : ' + pbE);
  }
  return { relie: !pbL, pb: pbs.length ? pbs.join(' ; ') : null };
}

/* Une nouvelle offre reprend la ligne : celle qu'elle portait jusque-là
   garde, écrit chez elle, ce que la ligne lui avait répondu (une
   contre-proposition, un refus, un retrait) — sinon son historique le
   perdrait, la ligne passant à la suivante. */
async function figerOffreDAvant(sb: SupabaseClient, l: SuiviVente, docId: string, pbs: string[]): Promise<void> {
  const prevId = typeof l.donnees?.documentId === 'string' ? l.donnees.documentId : '';
  if (!prevId || prevId === docId) return;
  let prev: DocOffre | null = null;
  try { prev = await lireOffre(sb, prevId); } catch { return; }
  if (!prev || !lienAgence(prev)) return;
  const brut = prev.donnees?.suivi && typeof prev.donnees.suivi === 'object' ? prev.donnees.suivi as Record<string, unknown> : {};
  /* L'état que la ligne lui donnait, comme si elle était encore la dernière. */
  const nu = { ...prev, donnees: { ...(prev.donnees || {}), suivi: { ...brut, remplacee_le: null, close: null } } };
  const vue = lireSuivi(avecAgence(nu, l as unknown as LigneAgence).donnees);
  if (!vue.reponse && !vue.avant?.length && !vue.close) return;
  const pb = await majSuivi(sb, prevId, x => ({
    ...x,
    ...(!x.reponse && vue.reponse ? { reponse: vue.reponse } : {}),
    ...(!x.avant?.length && vue.avant?.length ? { avant: vue.avant } : {}),
    ...(!x.close && vue.close ? { close: vue.close } : {}),
  }));
  if (pb) pbs.push('l’historique de l’offre d’avant : ' + pb);
}

/* Sans suite, sur un bien de l'agence : sa ligne de la fiche du bien passe
   « retirée » (l'acquéreur renonce à une contre-proposition, ou retire son
   offre), sa relance se clôt, et le Suivi du vendeur le dit. */
async function fermerLigneAgence(sb: SupabaseClient, doc: DocOffre, par: 'client' | 'conseiller'): Promise<string | null> {
  const lien = lienAgence(doc);
  if (!lien) return null;
  const { data, error } = await sb.from('biens_vente_suivi').select('*').eq('id', lien.suivi).maybeSingle();
  if (error) return error.message;
  const l = data as SuiviVente | null;
  /* Une offre plus récente la porte, ou elle est déjà fermée. */
  if (!l || l.donnees?.documentId !== doc.id || (l.statut && !OUVERTES.includes(l.statut))) return null;
  const k = l.statut === 'contre' ? 'renonce' : 'retire';
  const { statut, donnees } = apresReponse(l, { k }, jourParis());
  const { error: e2 } = await sb.from('biens_vente_suivi').update({ statut, donnees }).eq('id', l.id);
  if (e2) return e2.message;
  const pbR = await clore(sb, l.donnees?.relance_id);
  if (pbR) console.error('[offres] relance du propriétaire', pbR);
  let bv: VenteLue | null = null;
  try { bv = await lireVente(sb, l.bien_id); } catch (e) { console.error('[offres] bien en vente', (e as Error).message); }
  if (bv?.client_id) {
    const titreV = bv.titre || titreVente(bv.donnees || {});
    const sur = montantActuel(l);
    await journal(sb, {
      client_id: bv.client_id, type: 'etape_transaction',
      titre: `↩️ ${k === 'renonce' ? 'L’acquéreur renonce' : 'Offre retirée'} — ${EUR(sur)}`,
      description: `${titreV} · ${l.qui || 'l’acquéreur'} ${k === 'renonce' ? 'ne donne pas suite à la contre-offre' : 'retire son offre'}${par === 'client' ? ', depuis son espace' : ''}`,
      metadata: { jalon: 'offre_close', cote: 'vendeur', bien_vente_id: bv.id },
    });
  }
  return null;
}

/* La réponse du vendeur, notée sur la fiche du bien (FicheBien, reponseOffre)
   à une offre qui vient d'un espace : le client reçoit UN mail (comme
   « Réponse du vendeur » du CRM), les relances de son côté suivent, le bien
   redevient « Visité » s'il n'y a pas d'accord. Rien n'est recopié : l'état
   se lit de la ligne (avecAgence). Une réponse déjà dite n'en renvoie pas. */
export async function reponseAgence(sb: SupabaseClient, suiviId: string): Promise<{ mail: boolean; avertissements: string[] }> {
  const avertissements: string[] = [];
  const { data, error } = await sb.from('biens_vente_suivi').select(COLONNES_LIGNE_AGENCE).eq('id', suiviId).maybeSingle();
  if (error) throw new Error('La ligne de l’offre n’a pas pu être lue : ' + error.message);
  const l = data as LigneAgence | null;
  const docId = l && typeof l.donnees?.documentId === 'string' ? l.donnees.documentId : '';
  if (!l || !docId) return { mail: false, avertissements };
  const brut = await lireOffre(sb, docId);
  if (!brut || lienAgence(brut)?.suivi !== l.id) return { mail: false, avertissements };
  const doc = avecAgence(brut, l);
  const s = lireSuivi(doc.donnees);
  if (s.remplacee_le || !visiblePourClient(doc)) return { mail: false, avertissements };
  const etat = etatDeOffre(doc);
  const dl = l.donnees || {};
  const nEch = Array.isArray(dl.echanges) ? dl.echanges.length : 1;
  const cle = `${l.statut || 'en_attente'}:${nEch}`;
  if (lireSuivi(brut.donnees).aviseAgence === cle) return { mail: false, avertissements };
  const titre = await titreDuBien(sb, doc.bien_id);
  const r = s.reponse;
  if (doc.client_id) {
    const pbR = await solderRelancesOffre(sb, doc.client_id, titre, [TETES_OFFRE.reponse, TETES_OFFRE.envoyer, TETES_OFFRE.contre]);
    if (pbR) avertissements.push('relances : ' + pbR);
    if (etat === 'contre' && r?.montant) {
      const dans2 = new Date(Date.now() + 2 * 86_400_000); dans2.setUTCHours(7, 0, 0, 0);
      const pbC = await poserRelanceOffre(sb, {
        clientId: doc.client_id, rechercheId: doc.recherche_id || null, tete: TETES_OFFRE.contre, titre,
        detail: `le vendeur propose ${EUR(r.montant)} : sa réponse ?`, echeance: dans2,
      });
      if (pbC) avertissements.push('relance : ' + pbC);
    }
  }
  if (etat === 'refusee' || etat === 'sans_suite') await badgeBien(sb, doc.bien_id, 'visite');
  let mail = false;
  if (r && (etat === 'contre' || etat === 'acceptee' || etat === 'refusee')) {
    const pbM = await mailClientReponse(sb, doc, r, titre);
    if (pbM) avertissements.push(pbM); else mail = true;
  }
  const pbS = await majSuivi(sb, doc.id, x => ({ ...x, aviseAgence: cle }));
  if (pbS) avertissements.push('l’offre : ' + pbS);
  return { mail, avertissements };
}

/* ── La réponse du vendeur (notée par Alexandre) ── */

export async function noterReponse(sb: SupabaseClient, doc: DocOffre, r: ReponseVendeur): Promise<{ avertissements: string[] }> {
  const avertissements: string[] = [];
  const pb = await majSuivi(sb, doc.id, s => ({ ...s, reponse: r, close: null }));
  if (pb) throw new Error('La réponse n’a pas pu être enregistrée : ' + pb);
  const d = doc.donnees || {};
  const titre = await titreDuBien(sb, doc.bien_id);
  const total = totalOffre(d), prix = prixOffre(d);
  if (doc.client_id) {
    const pbR = await solderRelancesOffre(sb, doc.client_id, titre, [TETES_OFFRE.reponse, TETES_OFFRE.envoyer, TETES_OFFRE.contre]);
    if (pbR) avertissements.push('relances : ' + pbR);
    if (r.statut === 'contre' && r.montant) {
      /* Elle doit répondre : un œil dessus dans deux jours (ou à sa date limite). */
      const dans2 = new Date(Date.now() + 2 * 86_400_000); dans2.setUTCHours(7, 0, 0, 0);
      const limite = r.limite ? new Date(`${r.limite}T07:00:00Z`) : null;
      const pbC = await poserRelanceOffre(sb, {
        clientId: doc.client_id, rechercheId: doc.recherche_id || null, tete: TETES_OFFRE.contre, titre,
        detail: `le vendeur propose ${EUR(r.montant)}, soit ${EUR(totalContre(d, r.montant))} pour elle : sa réponse ?`,
        echeance: limite && limite.getTime() < dans2.getTime() ? (limite.getTime() > Date.now() ? limite : new Date()) : dans2,
      });
      if (pbC) avertissements.push('relance : ' + pbC);
    }
    const ligne = r.statut === 'contre' && r.montant
      ? { titre: `↩️ Contre-proposition du vendeur — ${titre}`, description: `${EUR(r.montant)} pour le vendeur, soit ${EUR(totalContre(d, r.montant))} pour le client, frais d’agence compris${r.limite ? ` · valable jusqu’au ${JOUR(r.limite)}` : ''}${r.note ? `\n${r.note}` : ''}` }
      : r.statut === 'acceptee'
        ? { titre: `🤝 Offre acceptée — ${titre}`, description: `${total ? `${EUR(total)} frais d’agence compris` : ''}${prix && prix !== total ? ` · ${EUR(prix)} pour le vendeur` : ''}${r.note ? `\n${r.note}` : ''}` }
        : { titre: `✕ Offre refusée par le vendeur — ${titre}`, description: r.note || null };
    await journal(sb, { client_id: doc.client_id, recherche_id: doc.recherche_id, bien_id: doc.bien_id, type: 'offre_faite', ...ligne, metadata: { document_id: doc.id, reponse: r.statut } });
  }
  if (r.statut === 'refusee') await badgeBien(sb, doc.bien_id, 'visite');
  if (r.statut === 'acceptee') {
    const pbT = await transactionDepuisOffre(sb, { ...doc, donnees: d });
    if (pbT) avertissements.push(pbT);
  }
  const pbM = await mailClientReponse(sb, { ...doc, donnees: d }, r, titre);
  if (pbM) avertissements.push(pbM);
  return { avertissements };
}

/** « Sans suite » : dit par le client depuis son espace, ou par Alexandre. */
export async function fermerSansSuite(sb: SupabaseClient, doc: DocOffre, par: 'client' | 'conseiller'): Promise<string | null> {
  const pb = await majSuivi(sb, doc.id, s => ({ ...s, close: { le: new Date().toISOString(), par } }));
  if (pb) return pb;
  /* V3.190 : un bien de l'agence — sa ligne sur la fiche du bien se ferme aussi. */
  const pbA = await fermerLigneAgence(sb, doc, par);
  if (pbA) console.error('[offres] offre du bien', pbA);
  const titre = await titreDuBien(sb, doc.bien_id);
  if (doc.client_id) {
    await solderRelancesOffre(sb, doc.client_id, titre, Object.values(TETES_OFFRE));
    await journal(sb, {
      client_id: doc.client_id, recherche_id: doc.recherche_id, bien_id: doc.bien_id, type: 'offre_faite',
      titre: `⏹️ Offre sans suite — ${titre}`,
      description: par === 'client' ? 'Le client ne donne pas suite, depuis son espace.' : 'Noté depuis le CRM.',
      metadata: { document_id: doc.id, sans_suite: par },
    });
  }
  await badgeBien(sb, doc.bien_id, 'visite');
  if (par === 'client' && doc.client_id && await alerteMailActive(sb, 'offre_espace')) {
    const nom = await nomClient(sb, doc.client_id);
    const lien = `${CRM()}/?page=fiche&client=${encodeURIComponent(doc.client_id)}`;
    const bienAgence = lienAgence(doc) ? ' Son offre passe « retirée » sur la fiche du bien.' : '';
    const e = await envoyerMail({
      a: ALERTES(), deLaPartDe: 'crm', sujet: `⏹️ ${nom} ne donne pas suite à son offre · ${titre}`,
      texte: `${nom} ne donne pas suite à son offre pour « ${titre} », depuis son espace.${bienAgence}\n\nOuvrir sa fiche : ${lien}`,
      html: enveloppeMail({ titre: `${echappe(nom)} ne donne pas suite`, mention: 'CRM', corps: `<p style="margin:0 0 14px">${echappe(nom)} ne donne pas suite à son offre pour « ${echappe(titre)} », depuis son espace.${echappe(bienAgence)}</p>${boutonMail(lien, 'Ouvrir sa fiche')}` }),
    });
    if (e) console.error('[offres] alerte sans suite', e);
  }
  return null;
}

async function nomClient(sb: SupabaseClient, clientId: string): Promise<string> {
  const { data } = await sb.from('clients').select('prenom, nom').eq('id', clientId).maybeSingle();
  const c = data as { prenom?: string | null; nom?: string | null } | null;
  return `${c?.prenom || ''} ${c?.nom || ''}`.trim() || 'Le client';
}

/* ── La transaction, quand le vendeur accepte ──
   Alexandre : « s'il est accepté, l'onglet Transaction s'ouvre tout seul ».
   À l'étape « Offre acceptée », avec la 1re offre, les contre-offres de
   chaque côté (prix pour le vendeur) et le prix arrêté. Une transaction
   déjà ouverte sur ce bien (créée à la main) est complétée ; ouverte sur
   un AUTRE bien de la même recherche, on n'y touche pas (on le dit). */
export async function transactionDepuisOffre(sb: SupabaseClient, doc: DocOffre): Promise<string | null> {
  if (!doc.client_id || !doc.recherche_id || !doc.bien_id) return null;
  let fil: DocOffre[];
  try { fil = await lireFil(sb, doc.client_id, doc.bien_id); } catch (e) { return (e as Error).message; }
  const pas: { partie: 'acheteur' | 'vendeur'; montant: number; date: string }[] = [];
  for (const x of fil) {
    const e = etatDeOffre(x);
    if (e === 'brouillon' || e === 'a_relire' || e === 'a_finaliser') continue;
    const p = prixOffre(x.donnees);
    if (p) pas.push({ partie: 'acheteur', montant: p, date: (x.signe_le || x.created_at).slice(0, 10) });
    const r = lireSuivi(x.donnees).reponse;
    if (r?.statut === 'contre' && r.montant) pas.push({ partie: 'vendeur', montant: r.montant, date: r.le.slice(0, 10) });
  }
  const prixFinal = prixOffre(doc.donnees);
  const premiere = pas[0];
  const { data: txs, error } = await sb.from('transactions').select('id, bien_id, etape_actuelle, offre_montant, offre_date, contre_offres').eq('recherche_id', doc.recherche_id);
  if (error) return 'la transaction n’a pas pu être lue : ' + error.message;
  const ouvertes = ((txs || []) as { id: string; bien_id: string | null; etape_actuelle: string | null; offre_montant: unknown; offre_date: unknown; contre_offres: unknown }[])
    .filter(t => t.etape_actuelle !== 'finalise');
  const autre = ouvertes.find(t => t.bien_id && t.bien_id !== doc.bien_id);
  if (autre) return 'une transaction est déjà ouverte sur un autre bien de cette recherche : l’onglet Transaction n’a pas été rempli';
  const titre = await titreDuBien(sb, doc.bien_id);
  const meme = ouvertes.find(t => t.bien_id === doc.bien_id) || ouvertes.find(t => !t.bien_id);
  if (meme) {
    const maj: Record<string, unknown> = { bien_id: doc.bien_id, prix_final: prixFinal };
    if (!meme.etape_actuelle || meme.etape_actuelle === 'offre' || meme.etape_actuelle === 'negociation') maj.etape_actuelle = 'offre_acceptee';
    if (!meme.offre_montant && premiere) { maj.offre_montant = premiere.montant; maj.offre_date = premiere.date; }
    if (!(Array.isArray(meme.contre_offres) && meme.contre_offres.length) && pas.length > 1) maj.contre_offres = pas.slice(1);
    const { error: e2 } = await sb.from('transactions').update(maj).eq('id', meme.id);
    if (e2) return 'la transaction : ' + e2.message;
  } else {
    const ligne = {
      client_id: doc.client_id, recherche_id: doc.recherche_id, bien_id: doc.bien_id, etape_actuelle: 'offre_acceptee',
      prix_final: prixFinal, offre_montant: premiere?.montant ?? null, offre_date: premiere?.date ?? null, contre_offres: pas.slice(1),
    };
    let { error: e3 } = await sb.from('transactions').insert(ligne);
    /* Une colonne inconnue (base plus ancienne) : l'essentiel d'abord. */
    if (e3 && /column|schema cache/i.test(e3.message)) {
      ({ error: e3 } = await sb.from('transactions').insert({ client_id: doc.client_id, recherche_id: doc.recherche_id, bien_id: doc.bien_id, etape_actuelle: 'offre_acceptee' }));
    }
    if (e3) return 'la transaction : ' + e3.message;
    await journal(sb, { client_id: doc.client_id, recherche_id: doc.recherche_id, bien_id: doc.bien_id, type: 'offre_faite', titre: `💼 Transaction ouverte — ${titre}`, description: 'Ouverte toute seule à l’acceptation de son offre, à l’étape « Offre acceptée ».', metadata: { document_id: doc.id } });
  }
  return null;
}

/* ── Le mail au client quand le vendeur répond ──
   Un seul mail par réponse (Alexandre : « pas 40 mails »). Au nom
   d'Alexandre, des mots simples ; l'acceptation, en fête. */
function boutonMail(lien: string, texte: string) {
  return `<a href="${echappe(lien)}" style="display:inline-block;margin-top:6px;background:${MAIL.or};color:#13243D;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:800">${echappe(texte)}</a>`;
}
async function mailClientReponse(sb: SupabaseClient, doc: DocOffre, r: ReponseVendeur, titre: string): Promise<string | null> {
  if (!doc.client_id) return null;
  const { data: c } = await sb.from('clients').select('prenom, emails, token_espace').eq('id', doc.client_id).maybeSingle();
  const cl = c as { prenom?: string | null; emails?: string[] | null; token_espace?: string | null } | null;
  const a = (cl?.emails || []).find(e => /@/.test(String(e || '')));
  if (!a) return 'le client n’a pas d’adresse e-mail : il n’a pas été prévenu par mail';
  const d = doc.donnees || {};
  const base = lienEspace(cl?.token_espace || null, process.env.NEXT_PUBLIC_SITE_URL || 'https://emilio-immo-chasseimmo.vercel.app');
  const lien = base ? `${base}${base.includes('?') ? '&' : '?'}${doc.recherche_id ? `r=${encodeURIComponent(doc.recherche_id)}&` : ''}bien=${encodeURIComponent(doc.bien_id || '')}` : '';
  const prenom = (cl?.prenom || '').trim();
  const bonjour = `Bonjour${prenom ? ` ${prenom}` : ''},`;
  const total = totalOffre(d);
  let sujet = '', titreMail = '', paras: string[] = [], bouton = 'Ouvrir mon espace';
  if (r.statut === 'contre' && r.montant) {
    const tc = totalContre(d, r.montant);
    sujet = 'Le vendeur a répondu à votre offre';
    titreMail = 'Le vendeur a répondu à votre offre';
    paras = [
      bonjour,
      `Le vendeur a répondu à votre offre pour « ${titre} » : il propose ${EUR(tc)}, frais d’agence compris${r.limite ? `, jusqu’au ${JOUR(r.limite)}` : ''}.`,
      'Depuis votre espace, vous pouvez accepter, faire une nouvelle offre ou ne pas donner suite. Je reste disponible si vous voulez en parler.',
    ];
    bouton = 'Voir la réponse du vendeur';
  } else if (r.statut === 'acceptee') {
    /* V3.190 : un accord noté sur la fiche du bien à un autre prix que l'offre. */
    const accord = r.montant || total;
    sujet = '🎉 Félicitations, votre offre est acceptée !';
    titreMail = '🎉 Félicitations, votre offre est acceptée !';
    paras = [
      `${bonjour.replace(/,$/, '')}, félicitations !`,
      `Le vendeur a accepté votre offre${accord ? ` de ${EUR(accord)}, frais d’agence compris,` : ''} pour « ${titre} ». C’est une très belle nouvelle.`,
      'Je vous appelle très vite pour organiser la suite, à commencer par le compromis chez le notaire.',
    ];
  } else {
    sujet = 'Réponse du vendeur à votre offre';
    titreMail = 'Réponse du vendeur à votre offre';
    paras = [
      bonjour,
      `Le vendeur n’a pas retenu votre offre pour « ${titre} ».`,
      'Si vous le souhaitez, vous pouvez en faire une nouvelle depuis votre espace, ou on en parle ensemble. La recherche continue de toute façon.',
    ];
  }
  const signature = 'Alexandre Rogelet — Emilio Immobilier';
  const texte = `${paras.join('\n\n')}${lien ? `\n\n${bouton} : ${lien}` : ''}\n\n${signature}`;
  const corps = `${paras.map(p => `<p style="margin:0 0 14px">${echappe(p)}</p>`).join('')}${lien ? boutonMail(lien, bouton) : ''}<p style="margin:18px 0 0">${echappe(signature)}</p>`;
  const e = await envoyerMail({ a, nomA: prenom || undefined, sujet, texte, html: enveloppeMail({ titre: echappe(titreMail), corps }) });
  return e ? `le mail au client n’est pas parti (${e})` : null;
}

/* ── L'alerte à Alexandre : une offre à relire ── */
export async function alerteOffreARelire(sb: SupabaseClient, doc: { id: string; client_id: string; bien_id: string | null; donnees: Donnees }, titre: string, il = 'Il'): Promise<void> {
  if (!(await alerteMailActive(sb, 'offre_espace'))) return;
  const nom = await nomClient(sb, doc.client_id);
  const total = totalOffre(doc.donnees);
  const lien = `${CRM()}/?page=fiche&client=${encodeURIComponent(doc.client_id)}`;
  const quoi = total ? `${EUR(total)} frais d’agence compris` : 'son offre';
  const e = await envoyerMail({
    a: ALERTES(), deLaPartDe: 'crm',
    sujet: `💶 ${nom} a préparé une offre à relire · ${total ? EUR(total) : titre}`,
    texte: `${nom} a préparé son offre depuis son espace pour « ${titre} » : ${quoi}. ${il} te la confie pour relecture.\n\nRelis-la dans Documents, puis envoie-la pour signature.\n\nOuvrir sa fiche : ${lien}`,
    html: enveloppeMail({
      titre: `💶 ${echappe(nom)} a préparé une offre à relire`, mention: 'CRM',
      corps: `<p style="margin:0 0 10px">Depuis son espace, pour « ${echappe(titre)} » :</p><p style="margin:0 0 14px;font-size:17px;font-weight:800;color:#13243D">${echappe(quoi)}</p><p style="margin:0 0 14px">Relis-la dans Documents, puis envoie-la pour signature. Une relance t’attend en tête de tes Relances.</p>${boutonMail(lien, 'Ouvrir sa fiche')}`,
    }),
  });
  if (e) console.error('[offres] alerte à relire', e);
}

/* ── Ce que l'espace du client lit ── */


function saisieDe(d: Donnees | null | undefined): SaisieOffre | null {
  if (!d) return null;
  const pers = lirePersonnes(d.acquereurs).map(p => ({
    civilite: p.civilite, prenom: p.prenom, nom: p.nom, naissanceDate: p.naissanceDate, naissanceLieu: p.naissanceLieu,
    adresse: p.adresse, email: p.email, telephone: p.telephone,
  }));
  return {
    acquereurs: pers, apport: num(d, 'apport'), pret: d.pret === 'oui' ? 'oui' : d.pret === 'non' ? 'non' : null,
    pretMontant: num(d, 'pretMontant'), pretDuree: num(d, 'pretDuree'), pretTaux: num(d, 'pretTaux'),
    conditions: Array.isArray(d.conditions) ? (d.conditions as unknown[]).map(String) : [],
    venteBien: txt(d, 'venteBien'), conditionAutre: txt(d, 'conditionAutre'), notaire: txt(d, 'notaire'),
  };
}

/** Bien par bien, l'offre du moment telle que l'espace la montre. Ne lève jamais. */
export async function offresPourEspace(sb: SupabaseClient, clientId: string, bienIds: string[], fiche: FicheEspace | null | undefined): Promise<Record<string, OffreEspace>> {
  const out: Record<string, OffreEspace> = {};
  if (!bienIds.length) return out;
  try {
    const { data, error } = await sb.from('documents').select(COLONNES_DOC)
      .eq('modele', 'offre_achat').eq('client_id', clientId).in('bien_id', bienIds.slice(0, 300)).neq('statut', 'annule');
    if (error || !data?.length) return out;
    /* V3.190 : un bien de l'agence, avec la réponse notée sur la fiche du bien. */
    const docs = await avecLignesAgence(sb, data as DocOffre[]);
    const enSignature = docs.filter(x => x.statut === 'pret' && x.signature).map(x => x.id);
    let lignes: LigneSignataire[] = [];
    if (enSignature.length) {
      const { data: l, error: eL } = await sb.from('documents_signataires').select(COLONNES_SIGNATAIRES).in('document_id', enSignature);
      if (!eL && l) lignes = l as LigneSignataire[];
    }
    const maintenant = Date.now();
    for (const bienId of bienIds) {
      const fil = filDuBien(docs, bienId);
      if (!fil.length) continue;
      const visibles = fil.filter(visiblePourClient);
      const courant = offreCourante(visibles, maintenant);
      if (!courant) continue;
      /* Une offre plus récente se prépare chez son conseiller (pas encore partie en signature). */
      const enPreparation = fil.some(x => x.created_at > courant.created_at && !visiblePourClient(x) && brouillonCrmVivant(x, maintenant));
      const d = courant.donnees || {};
      const s = lireSuivi(d);
      const etat = etatDeOffre(courant, maintenant);
      const sigs = courant.statut === 'pret' && courant.signature ? signatairesEspace(lignes.filter(l => l.document_id === courant.id), fiche) : [];
      const moi = sigs.find(x => x.qui === 'vous');
      const fin = finOffre(d);
      const env = envoisOffre(courant);
      const r = s.reponse;
      out[bienId] = {
        id: courant.id, etat, enPreparation, agence: estAgence(d), rang: rangVisible(fil, courant) || 1,
        /* Acceptée à un autre prix (noté sur la fiche du bien) : le prix convenu. */
        total: etat === 'acceptee' && r?.montant ? r.montant : totalOffre(d), prix: prixOffre(d), prixAffiche: num(d, 'prixAffiche'),
        fin: fin ? fin.toISOString() : null, envoyeLe: env.length ? env[env.length - 1].le : null,
        lien: moi && moi.etat === 'a_signer' ? moi.lien : null,
        vousSigne: moi?.etat === 'signe', attendus: sigs.filter(x => x.qui !== 'vous' && x.etat !== 'signe').map(x => x.prenom || x.nom).filter(Boolean),
        contre: r?.statut === 'contre' && r.montant ? { prix: r.montant, total: totalContre(d, r.montant), limite: r.limite || null, depassee: contreDepassee(r, maintenant), le: r.le } : null,
        reponseLe: r?.le || null,
        historique: historiqueFil(visibles, { client: true, maintenant }),
        saisie: saisieDe(d),
      };
    }
  } catch (e) {
    console.error('[offres] espace', e instanceof Error ? e.message : e);
  }
  return out;
}

export { ENCOURS };
