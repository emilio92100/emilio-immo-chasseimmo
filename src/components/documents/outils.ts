/* ═══ Documents juridiques : la table, les fichiers, la finalisation ═══════
   Tout ce que la page et l'éditeur font avec Supabase, au même endroit, et
   chaque écriture remonte son erreur (AGENTS.md §3.2).

   Un document vit en trois temps :
     · brouillon  — les réponses s'enregistrent au fil de la saisie ;
     · pret       — « À faire signer » : le PDF est figé dans le stockage,
                    avec l'identité de l'agence du jour ; plus rien ne bouge
                    tant qu'on ne le repasse pas en brouillon ;
     · signe      — l'exemplaire signé est déposé (scan ou photo).
   Et `annule`, qui garde la trace sans rien effacer.

   Signé en ligne ou sur place (`donnees.signature`), le document reste
   « À faire signer » pendant que les signatures arrivent : `signature`
   dit quand Alexandre l'a lancée, et `documents_signataires` qui a signé.
   Il passe « Signé » tout seul, avec l'exemplaire scellé. */

import { supabase } from '@/lib/supabase';
import { CLE_IDENTITE, lireIdentite, type IdentiteAgence } from '@/lib/agence';
import { STATUTS, modele, pdfDocument, type Categorie, type Donnees, type Modele, type Statut } from '@/lib/actes';
import { inscrire, noterAnnulation, noterCorrection, noterSignature, type LigneRegistre, type RaisonFin } from '@/lib/registre';
import { signalerEchec, verifie } from '@/lib/ecritures';
import { lirePro } from '@/lib/contacts';
import { juridiqueDepuis } from '@/lib/actes/delegation';
import { mandatSigneSurBien } from '@/lib/mandat-bien';
import { avenantSigneSurBien } from '@/lib/documents-avenant-bien';
import { jourParis } from '@/lib/mandat';
import { pourEspaceAcheteur } from '@/lib/documents-espace';

export type DocumentRow = {
  id: string;
  modele: string;
  categorie: Categorie;
  statut: Statut;
  titre: string | null;
  sous_titre: string | null;
  badge: string | null;
  numero: string | null;
  donnees: Donnees;
  identite: IdentiteAgence | null;
  client_id: string | null;
  recherche_id: string | null;
  bien_id: string | null;
  pdf_chemin: string | null;
  signe_chemin: string | null;
  finalise_le: string | null;
  signe_le: string | null;
  annule_le: string | null;
  created_at: string;
  updated_at: string;
  /* Signé en ligne ou sur place : lancé quand, et la dernière version
     scellée (voir src/lib/signature-documents.ts). Absente avant le SQL. */
  signature?: {
    mode: 'en_ligne' | 'sur_place'; lance_le: string; agence_le: string;
    scelle_chemin?: string; scelle_le?: string; complet_le?: string; envoye_le?: string; classe_le?: string;
    envoi_le?: string;
  } | null;
  /* Les projets envoyés en relecture, avant la signature (V3.40), du plus
     ancien au plus récent. Absente avant outils/sql/documents-envois.sql. */
  envois?: EnvoiProjet[] | null;
};

/* Un projet envoyé (V3.40) : le PDF « projet non signé », à qui, quand. */
export type EnvoiProjet = {
  le: string; a: { email: string; nom: string }[]; sujet: string; message?: string; fichier: string; echecs?: string[];
  /* V3.145 : l'offre d'achat signée, envoyée à l'agence du vendeur (pas un projet). */
  offre?: boolean;
};
export type DestProjet = { email: string; nom: string; prenom: string; famille: string };

/* Un signataire, tel que le CRM le lit (documents_signataires). */
export type SignataireRow = {
  id: string; document_id: string; cle: string; rang: number; role: string; nom: string;
  mode: 'en_ligne' | 'sur_place'; statut: 'attendu' | 'invite' | 'signe' | 'annule';
  personne: { civilite?: string; prenom: string; nom: string; email: string; telephone?: string };
  invite_le: string | null; ouvert_le: string | null; relances: number; lien_expire_le: string | null;
  signe_le: string | null; code_envoye_le: string | null;
};
export const nomSignataire = (x: Pick<SignataireRow, 'personne' | 'nom'>) => `${x.personne.prenom || ''} ${x.personne.nom || ''}`.trim() || x.nom;

/* La table des signataires n'existe pas encore (SQL pas encore passé). */
export const tableSignaturesAbsente = (message: string) => /documents_signataires|column .*signature.* does not exist|Could not find the .*signature/i.test(message);

/* V3.50 : le document a bougé depuis l'ouverture de la page. */
export const CHANGE_ENTRE_TEMPS = 'Ce document a changé entre-temps (signé ou modifié ailleurs). Recharge la page pour voir où il en est.';

/* ── L'exemplaire signé à la main (V3.55) ──
   Alexandre : « si c'est fait à l'écrit, sans signature électronique, son
   espace doit être à jour : si côté CRM je dis que c'est signé, c'est signé,
   et c'est à moi de joindre le PDF signé pour qu'il puisse y accéder ».
   Le client retrouve-t-il ce document dans son espace ? Un document d'acheteur
   rattaché à sa fiche : mandat de recherche et ses avenants, offre d'achat,
   bon de visite. Pas une délégation (entre professionnels), ni un document de
   vendeur (pas encore d'espace vendeur), ni un courrier.
   V3.56 : la règle est celle de l'espace lui-même (pourEspaceAcheteur,
   src/lib/documents-espace.ts) : le CRM et l'espace ne peuvent plus dire
   deux choses différentes. */
export function vuDansEspace(row: Pick<DocumentRow, 'modele' | 'client_id'>): boolean {
  return !!row.client_id && pourEspaceAcheteur(row.modele);
}
/* Signé à la main, et son exemplaire signé (scan, PDF) pas encore déposé.
   En ligne ou sur place, l'exemplaire scellé se range tout seul. */
export function exemplaireManquant(row: Pick<DocumentRow, 'modele' | 'statut' | 'signe_chemin' | 'signature'>): boolean {
  return row.statut === 'signe' && !row.signe_chemin && !row.signature && !modele(row.modele)?.courrier;
}
/* La phrase du rappel, la même partout. */
export const rappelExemplaire = (row: Pick<DocumentRow, 'modele' | 'client_id'>) => (vuDansEspace(row)
  ? 'Exemplaire signé à déposer : ton client ne le voit pas encore dans son espace.'
  : 'Exemplaire signé à déposer : garde-le ici, avec le document.');

export async function lireSignataires(docId: string): Promise<SignataireRow[]> {
  const { data, error } = await supabase.from('documents_signataires').select('*').eq('document_id', docId).neq('statut', 'annule').order('rang');
  if (error) throw new Error(error.message);
  return (data || []) as SignataireRow[];
}

/* Les erreurs de la signature, en mots simples. */
const ERREURS_SIGNATURE: Record<string, string> = {
  emails: 'Il manque une adresse e-mail, ou deux signataires ont la même.',
  deja: 'La signature est déjà lancée pour ce document.',
  papier: 'Ce document se signe à la main : repasse-le en brouillon pour choisir « En ligne » ou « Sur place ».',
  etat: 'Le document a changé d’état entre-temps : recharge la page.',
  pas_lance: 'La signature n’est pas lancée.',
  email: 'Cette adresse e-mail ne semble pas juste.',
  email_pris: 'Cette adresse est déjà celle d’un autre signataire : chacun signe avec la sienne.',
  attendre: 'Un code vient de partir : attends quelques secondes avant d’en redemander un.',
  quota: 'Beaucoup de codes demandés d’affilée : réessaie dans une heure.',
  mail: 'Le mail n’a pas pu partir. Vérifie l’adresse, puis réessaie.',
  code: 'Ce code ne correspond pas.',
  expire: 'Ce code a expiré : demandes-en un nouveau.',
  trop: 'Trop d’essais : demande un nouveau code.',
  recommencer: 'Demande un nouveau code pour signer.',
  accepte: 'Il faut cocher la case pour signer.',
  demande: 'Il faut aussi cocher la case « Je demande que l’Agence commence… » pour signer.',
  attendus: 'Quelqu’un doit encore signer.',
  preuves: 'Une signature n’a pas sa preuve de code : elle doit être refaite.',
  pas_scelle: 'Le document n’est pas encore scellé.',
  stockage: 'Le fichier n’a pas pu être rangé. Réessaie dans un instant.',
  /* V3.50 */
  lecture: 'Les signataires n’ont pas pu être lus : rien n’a été fait. Réessaie dans un instant.',
  offre_expiree: 'Cette offre n’est plus valable : sa date de validité est passée, elle ne peut plus être signée. Pour la faire signer, change d’abord sa date de validité (arrête la signature si elle est lancée, puis repasse l’offre en brouillon).',
  /* V3.55 */
  signataire: 'Ce signataire n’est plus attendu : il a signé entre-temps, ou la signature a été arrêtée. Recharge la page.',
  personne: 'Personne à faire signer dans ce document : vérifie les signataires dans l’éditeur.',
  arrete: 'La signature a été arrêtée entre-temps : recharge la page.',
  complet: 'Tout le monde vient de signer : le document est en train de se ranger. Recharge la page dans un instant. S’il reste « en signature », clique sur « Tout le monde a signé : finaliser ».',
  modele: 'Ce document ne se signe pas en ligne.',
  document: 'Ce document est introuvable : il a peut-être été supprimé. Recharge la page.',
  /* V3.57 : la version complète est partie (ou part) à chacun. */
  envoye: 'Chacun a déjà reçu le document signé par tous : la signature ne peut plus être arrêtée. Clique sur « Tout le monde a signé : finaliser » pour le ranger.',
  /* V3.56 : le lancement a échoué, et le document n'a pas pu être libéré. */
  reserve: 'Rien n’est parti, mais le document est resté marqué « en signature ». Clique sur « Arrêter la signature » pour le libérer, puis relance-la.',
};
export class ErreurSignature extends Error {
  code: string; plus: Record<string, unknown>;
  constructor(code: string, message: string, plus: Record<string, unknown>) { super(message); this.code = code; this.plus = plus; }
}
/* Les réponses qui disent que la page n'est plus à jour (V3.55) : on relit
   le document, pour montrer où il en est vraiment. */
const PERIMES = ['deja', 'etat', 'pas_lance', 'arrete', 'complet', 'signataire', 'reserve', 'envoye'];
export const pagePerimee = (e: unknown) => e instanceof ErreurSignature && PERIMES.includes(e.code);
export async function appelSignature<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  let r: Response;
  try {
    r = await fetch('/api/documents/signature', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ErreurSignature('reseau', 'Pas de connexion : vérifie le réseau, puis réessaie.', {});
  }
  const j = await r.json().catch(() => null) as (Record<string, unknown> & { ok?: boolean; erreur?: string; detail?: string }) | null;
  if (!r.ok || !j?.ok) {
    const code = String(j?.erreur || `http${r.status}`);
    const detail = typeof j?.detail === 'string' ? j.detail : '';
    const msg = detail && tableSignaturesAbsente(detail)
      ? 'La signature en ligne n’est pas encore installée : lance d’abord le fichier outils/sql/signature-documents.sql dans Supabase › SQL Editor.'
      : code === 'code' && typeof j?.restants === 'number'
        ? (j.restants > 0 ? `Ce code ne correspond pas. Encore ${j.restants} essai${j.restants > 1 ? 's' : ''}.` : ERREURS_SIGNATURE.trop)
        /* V3.55 : un autre document du même genre est déjà en signature ;
           le serveur dit lequel. */
        : code === 'concurrent' && typeof j?.message === 'string' ? j.message
        : code === 'enregistrement' ? `L’enregistrement n’a pas pu se faire${detail ? ` (${detail})` : ''}. Réessaie dans un instant.`
        : ERREURS_SIGNATURE[code] || `Erreur : ${detail || code}`;
    throw new ErreurSignature(code, msg, j || {});
  }
  return j as T;
}

/* Le mandat de recherche, signé en ligne depuis l'espace acheteur : il a
   sa propre table (mandats_signatures) ; la page le montre à côté des autres. */
export type MandatRecherche = {
  id: string; numero: string | null; statut: string; signe_le: string | null; retracte_le: string | null;
  pdf_chemin: string | null; client_id: string | null; recherche_id: string | null;
  mandant: { prenom?: string; nom?: string; civilite?: string } | null; created_at: string;
};

/* L'état d'un mandat de recherche signé en ligne, tel que les listes le
   montrent (V3.50 : un seul calcul pour la rubrique Documents et la fiche
   client, qui ne disaient pas pareil). Signé par une partie seulement
   (« partiel »), il attend encore une signature : « En attente de
   signature », pas « Signé ». */
export function etatMandatEnLigne(x: Pick<MandatRecherche, 'statut' | 'retracte_le'>): Statut {
  return x.retracte_le ? 'annule' : x.statut === 'signe' ? 'signe' : 'pret';
}

/* La table n'existe pas encore (outils/sql/documents.sql pas encore passé). */
export const tableAbsente = (message: string) => /relation .*documents.* does not exist|Could not find the table/i.test(message);

/* Ce que la liste affiche sans relire les réponses : recalculé à chaque
   enregistrement, depuis le modèle. */
export function colonnesListe(m: Modele, d: Donnees) {
  return {
    titre: m.titreDoc(d).slice(0, 200),
    sous_titre: m.sousTitre(d).slice(0, 200) || null,
    badge: m.badge ? m.badge(d) : null,
    numero: typeof d.numero === 'string' && d.numero.trim() ? d.numero.trim().slice(0, 40) : null,
  };
}

/* ── Les fichiers (bucket privé « mandats », dossier documents/) ── */
async function api<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(j?.erreur || `Erreur ${r.status}`);
  return j as T;
}

const TYPES_FICHIER: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp',
};

/* Dépose un fichier et rend son chemin. Le serveur donne un droit de
   dépôt ; le fichier part ensuite directement vers le stockage. */
export async function deposer(id: string, genre: 'pdf' | 'signe', fichier: Blob, ext: string): Promise<string> {
  const e = ext.toLowerCase();
  const { chemin, jeton } = await api<{ chemin: string; jeton: string }>({ action: 'depot', id, genre, ext: e });
  const { error } = await supabase.storage.from('mandats')
    .uploadToSignedUrl(chemin, jeton, fichier, { contentType: TYPES_FICHIER[e] || 'application/octet-stream' });
  if (error) throw new Error(error.message);
  return chemin;
}

/* Un lien de cinq minutes vers un fichier du document. */
export async function lienFichier(chemin: string, nom?: string): Promise<string> {
  const { url } = await api<{ url: string }>({ action: 'lien', chemin, nom });
  return url;
}

/* V3.145 : l'offre d'achat signée part à l'agence du vendeur (ou au vendeur). */
export async function envoyerOffre(o: { id: string; destinataires: string[]; sujet: string; message: string }) {
  return api<{ envoyes: string[]; avertissements: string[]; envoi: EnvoiProjet; row: DocumentRow | null }>({ action: 'offre', ...o });
}

/* Le projet d'un brouillon, en relecture (V3.40) : le serveur fabrique le
   PDF « projet non signé » depuis les réponses enregistrées, l'envoie à
   chacun, et rend le document à jour (null si la colonne manque encore). */
export async function envoyerProjet(o: { id: string; destinataires: DestProjet[]; sujet: string; message: string }) {
  return api<{ envoyes: string[]; avertissements: string[]; envoi: EnvoiProjet; row: DocumentRow | null }>({ action: 'projet', ...o });
}

export async function retirerFichiers(id: string): Promise<void> {
  await api<{ n: number }>({ action: 'retirer', id });
}

/* Le nom d'un fichier téléchargé : « Mandat-exclusif-M-et-Mme-Martin.pdf ». */
export function nomFichier(row: Pick<DocumentRow, 'titre'>, suffixe = ''): string {
  const base = (row.titre || 'Document').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '-').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return `${base}${suffixe}.pdf`;
}

/* Ouvre un PDF fabriqué ici dans un onglet déjà ouvert (sinon le navigateur
   bloque la fenêtre : elle doit naître du clic, avant l'attente). */
export function montrerPdf(onglet: Window | null, octets: Uint8Array) {
  const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: 'application/pdf' }));
  if (onglet) onglet.location.href = url; else window.location.href = url;
}

/* L'identité de l'agence du jour (Paramètres › Agence). Une erreur de
   lecture arrête tout : on ne fige jamais un document sur une identité
   qu'on n'a pas pu lire. */
export async function identiteDuJour(): Promise<IdentiteAgence> {
  const { data, error } = await supabase.from('parametres').select('valeur').eq('cle', CLE_IDENTITE).maybeSingle();
  if (error) throw new Error('L’identité de l’agence n’a pas pu être lue : ' + error.message);
  return lireIdentite(data?.valeur ?? null);
}

/* ── Partir d'un mandat (avenant, courrier) ──────────────────────────────
   Un mandat « source » : un document signé (mandat de vente, mandat de
   recherche papier) ou un mandat de recherche signé en ligne (sa propre
   table, mandats_signatures). Les deux se présentent pareil à l'écran. */
export type MandatChoix = {
  cle: string;                       // « d-<id> » ou « r-<id> »
  enLigne: boolean;
  id: string;
  modele: string;                    // mandat_vente, mandat_recherche, mandat_en_ligne
  titre: string;
  sous: string;
  numero: string | null;
  statut: string;
  signe_le: string | null;
  finalise_le: string | null;
  client_id: string | null;
  recherche_id: string | null;
  bien_id: string | null;
  donnees: Donnees;                  // vide pour un mandat en ligne : lu au moment de préparer
  client: string;                    // son nom, pour chercher
};

const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const cleRecherche = (x: MandatChoix) => sansAccent(`${x.titre} ${x.sous} ${x.numero || ''} ${x.client}`);

/* Les mandats d'où un modèle peut partir, le plus récent d'abord. */
export async function mandatsPour(m: Modele): Promise<MandatChoix[]> {
  const de = m.deriver?.de || [];
  const papier = de.filter(x => x !== 'mandat_en_ligne');
  const [a, b] = await Promise.all([
    papier.length
      ? supabase.from('documents')
        .select('id, modele, titre, sous_titre, numero, statut, donnees, signe_le, finalise_le, bien_id, recherche_id, client_id')
        .in('modele', papier).in('statut', ['pret', 'signe']).order('updated_at', { ascending: false }).limit(300)
      : Promise.resolve({ data: [], error: null }),
    de.includes('mandat_en_ligne')
      ? supabase.from('mandats_signatures').select('id, numero, statut, signe_le, client_id, recherche_id, mandant, contenu')
        .in('statut', ['signe', 'partiel']).order('signe_le', { ascending: false }).limit(300)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (a.error) throw new Error('Les mandats n’ont pas pu être lus : ' + a.error.message);
  if (b.error) throw new Error('Les mandats signés en ligne n’ont pas pu être lus : ' + b.error.message);
  const docs = (a.data || []) as (Pick<DocumentRow, 'id' | 'modele' | 'titre' | 'sous_titre' | 'numero' | 'statut' | 'donnees' | 'signe_le' | 'finalise_le' | 'bien_id' | 'recherche_id' | 'client_id'>)[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lignes = (b.data || []) as any[];
  const ids = Array.from(new Set([...docs.map(x => x.client_id), ...lignes.map(x => x.client_id)].filter((x): x is string => !!x)));
  const noms: Record<string, string> = {};
  if (ids.length) {
    const { data } = await supabase.from('clients').select('id, prenom, nom').in('id', ids.slice(0, 500));
    for (const c of data || []) noms[c.id as string] = `${c.prenom || ''} ${c.nom || ''}`.trim();
  }
  /* V3.50 : le jour à l'heure de Paris (signé en ligne la nuit, l'heure universelle donnait la veille). */
  const jour = (iso: string | null) => (iso ? jourParis(iso).split('-').reverse().join('/') : '');
  const out: MandatChoix[] = [
    ...docs.map(x => ({
      cle: 'd-' + x.id, enLigne: false, id: x.id, modele: x.modele, titre: x.titre || 'Mandat',
      sous: [x.sous_titre, x.statut === 'signe' ? `signé le ${jour(x.signe_le)}` : 'pas encore signé'].filter(Boolean).join(' · '),
      numero: x.numero, statut: x.statut, signe_le: x.signe_le, finalise_le: x.finalise_le,
      client_id: x.client_id, recherche_id: x.recherche_id, bien_id: x.bien_id, donnees: x.donnees || {},
      client: x.client_id ? noms[x.client_id] || '' : '',
    })),
    ...lignes.map(x => {
      const nom = [x.mandant?.prenom, x.mandant?.nom].filter(Boolean).join(' ') || (x.client_id ? noms[x.client_id] : '') || 'Client';
      const secteurs: string[] = Array.isArray(x.contenu?.recherche?.secteurs) ? x.contenu.recherche.secteurs : [];
      return {
        cle: 'r-' + x.id, enLigne: true, id: x.id as string, modele: 'mandat_en_ligne', titre: `Mandat de recherche · ${nom}`,
        sous: [secteurs.slice(0, 3).join(', '), `signé en ligne le ${jour(x.signe_le)}`].filter(Boolean).join(' · '),
        numero: x.numero || null, statut: 'signe', signe_le: x.signe_le || null, finalise_le: x.signe_le || null,
        client_id: x.client_id || null, recherche_id: x.recherche_id || null, bien_id: null, donnees: {},
        client: x.client_id ? noms[x.client_id] || nom : nom,
      };
    }),
  ];
  /* Une délégation ne part que d'un mandat signé. */
  return out.filter(x => m.id !== 'delegation' || x.statut === 'signe').sort((p, q) => (q.statut === 'signe' ? 1 : 0) - (p.statut === 'signe' ? 1 : 0)
    || String(q.signe_le || q.finalise_le || '').localeCompare(String(p.signe_le || p.finalise_le || '')));
}

/* Le mandat en ligne, relu en entier : ses réponses, et ceux qui l'ont
   signé avec le premier. */
async function donneesEnLigne(id: string): Promise<MandatChoix> {
  const { data, error } = await supabase.from('mandats_signatures').select('*').eq('id', id).maybeSingle();
  if (error || !data) throw new Error('Le mandat signé en ligne n’a pas pu être lu' + (error ? ' : ' + error.message : '.'));
  const c = await supabase.from('mandats_cosignataires').select('personne, statut, rang').eq('signature_id', id).eq('statut', 'signe').order('rang');
  const cos = !c.error && c.data ? c.data.map(x => x.personne as Record<string, string>) : [];
  const { donneesMandatEnLigne } = await import('@/lib/actes/avenant-recherche');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const l = data as any;
  return {
    cle: 'r-' + id, enLigne: true, id, modele: 'mandat_en_ligne', titre: 'Mandat de recherche', sous: '',
    numero: l.numero || null, statut: 'signe', signe_le: l.signe_le || null, finalise_le: l.signe_le || null,
    client_id: l.client_id || null, recherche_id: l.recherche_id || null, bien_id: null,
    donnees: donneesMandatEnLigne(l, cos), client: '',
  };
}

/* Un mandat choisi par la ligne de sa table : un document, ou un mandat
   signé en ligne (« r-<id> »). */
export async function mandatDepuis(cle: string): Promise<MandatChoix> {
  if (cle.startsWith('r-')) return donneesEnLigne(cle.slice(2));
  const { data, error } = await supabase.from('documents').select('*').eq('id', cle.replace(/^d-/, '')).maybeSingle();
  if (error || !data) throw new Error('Le mandat n’a pas pu être lu' + (error ? ' : ' + error.message : '.'));
  const x = data as DocumentRow;
  return {
    cle: 'd-' + x.id, enLigne: false, id: x.id, modele: x.modele, titre: x.titre || 'Mandat', sous: x.sous_titre || '',
    numero: x.numero, statut: x.statut, signe_le: x.signe_le, finalise_le: x.finalise_le,
    client_id: x.client_id, recherche_id: x.recherche_id, bien_id: x.bien_id, donnees: x.donnees || {}, client: '',
  };
}

/* Les réponses d'un document préparé à partir d'un mandat : le modèle
   vierge avec le client et la recherche du moment, ce que le mandat dit,
   puis ce que les avenants déjà signés y ont changé, enfin ce qui s'en
   déduit. Un avenant reçoit son numéro : le suivant de ceux déjà faits à
   ce mandat (hors annulés). */
export async function preparerDepuis(m: Modele, x: MandatChoix, identite: IdentiteAgence, o: { echeance?: string } = {}): Promise<Donnees> {
  if (!m.deriver) throw new Error('Ce modèle ne part pas d’un mandat.');
  const src = x.enLigne && !Object.keys(x.donnees).length ? await donneesEnLigne(x.id) : x;
  const [cl, rech] = await Promise.all([
    src.client_id ? supabase.from('clients').select('id, prenom, nom, adresse, emails, telephones').eq('id', src.client_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    src.recherche_id ? supabase.from('recherches').select('*').eq('id', src.recherche_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (cl.error) throw new Error('Le client n’a pas pu être lu : ' + cl.error.message);
  if (rech.error) throw new Error('La recherche n’a pas pu être lue : ' + rech.error.message);
  let d: Donnees = {
    ...m.defaut({ identite, client: cl.data || null, bien: null, visite: null, recherche: (rech.data as Record<string, unknown>) || null }),
    ...m.deriver.fn({ id: src.id, modele: src.modele, donnees: src.donnees, numero: src.numero, signe_le: src.signe_le, finalise_le: src.finalise_le }, identite, o),
  };
  const numero = typeof d.mandatNumero === 'string' ? d.mandatNumero.trim() : '';
  if ('avenantNo' in d && numero) {
    const avant = await avenantsDuMandat(m.id, numero);
    if (m.enchainer) for (const a of avant.filter(a => a.statut === 'signe')) d = m.enchainer(d, a.donnees || {});
    d.avenantNo = avenantSuivant(avant);
  }
  /* La délégation (V3.18) : le mandat tel que ses avenants signés l'ont
     laissé (prix, honoraires, fin). */
  const av = m.avenantsDe ? modele(m.avenantsDe(d) || '') : null;
  if (av?.enchainer && numero) {
    const { data, error } = await supabase.from('documents').select('donnees')
      .eq('modele', av.id).eq('statut', 'signe').eq('donnees->>mandatNumero', numero);
    if (error) throw new Error('Les avenants signés à ce mandat n’ont pas pu être lus : ' + error.message);
    const signes = ((data || []) as Pick<DocumentRow, 'donnees'>[])
      .sort((p, q) => (Number(p.donnees?.avenantNo) || 0) - (Number(q.donnees?.avenantNo) || 0));
    for (const a of signes) d = av.enchainer(d, a.donnees || {});
  }
  return m.preparer ? m.preparer(d) : d;
}

/* Les avenants déjà faits à un mandat (hors annulés), du premier au dernier. */
export async function avenantsDuMandat(modeleId: string, numero: string): Promise<Pick<DocumentRow, 'id' | 'statut' | 'donnees'>[]> {
  const { data, error } = await supabase.from('documents').select('id, statut, donnees')
    .eq('modele', modeleId).neq('statut', 'annule').eq('donnees->>mandatNumero', numero);
  if (error) throw new Error('Les avenants déjà faits à ce mandat n’ont pas pu être lus : ' + error.message);
  return ((data || []) as Pick<DocumentRow, 'id' | 'statut' | 'donnees'>[])
    .sort((p, q) => (Number(p.donnees?.avenantNo) || 0) - (Number(q.donnees?.avenantNo) || 0));
}
/* Le numéro du prochain avenant : celui qui suit le plus grand déjà fait. */
export const avenantSuivant = (avant: Pick<DocumentRow, 'donnees'>[]) => avant.reduce((n, a) => Math.max(n, Number(a.donnees?.avenantNo) || 0), 0) + 1;

/* Un numéro du registre ne sert qu'une fois : ni sur un autre document
   (hors annulés), ni sur un mandat de recherche. Rend le doublon trouvé.
   `rechercheId` : la recherche du document elle-même (un mandat de
   recherche papier reprend le numéro réservé sur sa recherche). */
export async function numeroDejaPris(numero: string, id: string, rechercheId?: string | null): Promise<string | null> {
  const n = numero.trim();
  if (!n) return null;
  let qr = supabase.from('recherches').select('id').eq('mandat_numero', n);
  if (rechercheId) qr = qr.neq('id', rechercheId);
  const [a, b] = await Promise.all([
    supabase.from('documents').select('id, titre, statut').eq('numero', n).neq('id', id).neq('statut', 'annule').limit(1),
    qr.limit(1),
  ]);
  if (a.error) throw new Error(a.error.message);
  if (b.error) throw new Error(b.error.message);
  if (a.data?.length) return `le document « ${a.data[0].titre || 'sans titre'} »`;
  if (b.data?.length) return 'un mandat de recherche';
  return null;
}

/* ── La finalisation : le PDF figé, l'identité du jour, « À faire signer » ── */
/* `registre` (V3.18) : le registre des mandats est démarré. Le numéro est
   alors pris par lui, maintenant, avant que le PDF soit figé : il figure
   sur le mandat avant toute signature. Refinalisé (repassé en brouillon),
   le mandat garde le sien. */
/* V3.50 : seulement un brouillon. Le même brouillon ouvert dans deux
   onglets : le second « Finaliser » réécrivait le texte et le PDF d'un
   document déjà parti en signature, ou ramenait un document signé à « À
   faire signer ». */
const PLUS_BROUILLON = 'Ce document n’est plus un brouillon : il a été finalisé ou envoyé ailleurs. Recharge la page.';
/* V3.55 : un brouillon qui a encore une signature en ligne ouverte (repassé
   en brouillon depuis une page pas à jour, avant la V3.55). Finalisé, ses
   anciens liens remarcheraient sur le nouveau texte, et les signatures déjà
   faites se poseraient sur une version que personne n'a lue. */
export const SIGNATURE_OUVERTE = 'Une ancienne signature en ligne est encore ouverte sur ce document : ses liens remarcheraient sur le nouveau texte. Arrête-la d’abord, puis finalise.';
export async function signatureOuverte(id: string): Promise<boolean> {
  const { data, error } = await supabase.from('documents_signataires').select('id').eq('document_id', id).neq('statut', 'annule').limit(1);
  if (error) {
    if (tableSignaturesAbsente(error.message)) return false;
    throw new Error('Les signataires n’ont pas pu être vérifiés : ' + error.message);
  }
  return !!data?.length;
}
export async function finaliser(row: DocumentRow, m: Modele, dSaisi: Donnees, o: { registre?: boolean } = {}): Promise<DocumentRow> {
  let d = dSaisi;
  /* Toute la ligne : la colonne `signature` n'existe qu'après son SQL. */
  const { data: avant, error: eAvant } = await supabase.from('documents').select('*').eq('id', row.id).maybeSingle();
  if (eAvant) throw new Error('Le document n’a pas pu être relu : ' + eAvant.message);
  if (!avant || (avant as { statut?: string }).statut !== 'brouillon') throw new Error(PLUS_BROUILLON);
  const avecSignature = 'signature' in (avant as object);
  if ((avant as DocumentRow).signature || await signatureOuverte(row.id)) throw new Error(SIGNATURE_OUVERTE);
  /* La ligne du registre et ce que ce mandat y inscrirait aujourd'hui. */
  let ligne: LigneRegistre | null = null;
  let entree: ReturnType<NonNullable<Modele['registre']>> | null = null;
  if (o.registre && m.registre) {
    entree = m.registre(d);
    ligne = await inscrire(supabase, {
      ...entree, source: 'document', document_id: row.id, client_id: row.client_id, recherche_id: row.recherche_id,
      bien_vente_id: typeof d.bienVenteId === 'string' && d.bienVenteId ? d.bienVenteId : null,
    });
    d = { ...d, numero: String(ligne.numero) };
  }
  const numero = typeof d.numero === 'string' ? d.numero.trim() : '';
  /* Donné par le registre, il est unique par construction : pas de contrôle. */
  if (m.numero && numero && !(o.registre && m.registre)) {
    const pris = await numeroDejaPris(numero, row.id, m.surRecherche ? row.recherche_id : null);
    if (pris) throw new Error(`Le numéro ${numero} est déjà utilisé par ${pris}. Un numéro du registre ne sert qu’une fois.`);
  }
  const identite = await identiteDuJour();
  const octets = await pdfDocument(m, d, identite);
  const chemin = await deposer(row.id, 'pdf', new Blob([octets as BlobPart], { type: 'application/pdf' }), 'pdf');
  const maintenant = new Date().toISOString();
  const maj = supabase.from('documents').update({
    ...colonnesListe(m, d), donnees: d, identite, statut: 'pret', pdf_chemin: chemin,
    finalise_le: maintenant, updated_at: maintenant,
  }).eq('id', row.id).eq('statut', 'brouillon');
  const { data, error } = await (avecSignature ? maj.is('signature', null) : maj).select().maybeSingle();
  if (error) throw new Error('Le PDF est prêt mais le document n’a pas pu être mis à jour : ' + error.message);
  if (!data) throw new Error(PLUS_BROUILLON);
  /* V3.50 : finalisé à nouveau après une correction (un nom, le prix), il
     garde sa ligne du registre, qui ne se réécrit pas : la correction s'y
     ajoute en observation. */
  if (ligne && entree) {
    const pb = await noterCorrection(supabase, ligne, entree);
    if (pb) signalerEchec('Le registre des mandats (correction avant signature)', pb);
  }
  /* Une délégation à un confrère de tes contacts : sa société, sa carte et
     ses garanties restent sur sa fiche, pour la prochaine (V3.19). */
  if (m.id === 'delegation') await retenirConfrere(d, maintenant.slice(0, 10));
  return data as DocumentRow;
}

async function retenirConfrere(d: Donnees, le: string) {
  const id = typeof d.confrereId === 'string' ? d.confrereId : '';
  if (!id) return;
  const { data, error } = await supabase.from('clients').select('pro').eq('id', id).maybeSingle();
  if (error || !data) { signalerEchec('La fiche du confrère', error?.message || 'contact introuvable'); return; }
  const pro = lirePro((data as { pro?: unknown }).pro);
  const agence = typeof d.confNom === 'string' ? d.confNom.trim() : '';
  await verifie('La fiche du confrère', supabase.from('clients')
    .update({ pro: { ...pro, agence: pro.agence || agence, juridique: juridiqueDepuis(d, le) }, updated_at: new Date().toISOString() })
    .eq('id', id).select('id'), { ligne: true });
}

/* ── Signé : ce que le document écrit ailleurs ──
   Un mandat de recherche papier remplit le bloc Mandat de sa recherche
   (comme une signature en ligne), et laisse une ligne dans le suivi du
   client. Un mandat de vente fait passer son bien « En vente » (V3.42,
   src/lib/mandat-bien.ts). Rend un message d'erreur, ou null. */
export async function apresSignature(row: DocumentRow, m: Modele, jour: string): Promise<string | null> {
  /* Le registre des mandats (V3.18) : « Signé » sur la ligne du mandat, ou
     l'avenant sur celle de son mandat. */
  const pbReg = await noterSignature(supabase, {
    modele: row.modele, document_id: row.id, titre: row.titre || m.titre, comment: 'à la main',
    mandatNumero: typeof row.donnees?.mandatNumero === 'string' ? row.donnees.mandatNumero : undefined, quand: jour.split('-').reverse().join('/'),
  });
  /* V3.50 : un avenant de vente signé change aussi la fiche du bien (prix,
     honoraires, fin du mandat). */
  const pbBien = row.modele === 'mandat_vente' ? await mandatSigneSurBien(supabase, row, jour)
    : row.modele === 'avenant_vente' ? await avenantSigneSurBien(supabase, row, jour) : null;
  const pbRegistre = [pbReg, pbBien].filter(Boolean).join(' ') || null;
  /* V3.48 : un mandat de vente signé à la main laisse aussi sa ligne dans le
     Suivi du vendeur (comme la signature en ligne et « Le mandat est signé »). */
  if (row.modele === 'mandat_vente' && row.client_id) {
    const { error: eV } = await supabase.from('journal').insert({
      client_id: row.client_id, type: 'mandat', titre: `📋 Mandat de vente signé le ${jour.split('-').reverse().join('/')} (papier)`,
      description: [row.titre || m.titre, row.numero ? `n° ${row.numero}` : '', row.badge || ''].filter(Boolean).join(' · '),
      metadata: { document_id: row.id, jalon: 'mandat', cote: 'vendeur' },
    });
    if (eV) return [pbRegistre, 'La ligne du suivi du vendeur n’a pas pu être ajoutée : ' + eV.message].filter(Boolean).join(' ');
  }
  if (!m.surRecherche || !row.recherche_id) return pbRegistre;
  const { error } = await supabase.from('recherches').update(m.surRecherche(row.donnees, jour)).eq('id', row.recherche_id);
  /* Le souci du registre, s'il y en a un, n'est jamais masqué par un autre. */
  const et = (x: string) => [x, pbRegistre].filter(Boolean).join(' ');
  if (error) return et('Le document est bien marqué signé, mais le bloc Mandat de sa recherche n’a pas pu être rempli : ' + error.message + '. Saisis-le à la main dans la fiche client.');
  if (row.client_id) {
    const { error: e2 } = await supabase.from('journal').insert({
      client_id: row.client_id, type: 'mandat', titre: `📋 ${m.titre} signé (papier)`,
      description: [row.numero ? `n° ${row.numero}` : '', row.badge || '', `signé le ${jour.split('-').reverse().join('/')}`].filter(Boolean).join(' · '),
      metadata: { document_id: row.id },
    });
    if (e2) return et(`Le document est signé et le bloc Mandat ${m.numero ? 'rempli' : 'mis à jour'}, mais la ligne du suivi client n’a pas pu être ajoutée : ` + e2.message);
  }
  return pbRegistre;
}

/* Annulé après signature : le bloc Mandat de sa recherche se vide, s'il
   porte encore ce mandat (même numéro). Un avenant, lui, n'a pas de numéro
   à lui : l'annuler ne vide rien. `raison` (V3.50) : un mandat signé qui
   s'arrête — rétracté, fini ou annulé —, et le registre le dit. */
export async function apresAnnulation(row: DocumentRow, m: Modele, raison?: RaisonFin): Promise<string | null> {
  const pbRegistre = await noterAnnulation(supabase, {
    modele: row.modele, document_id: row.id, titre: row.titre || m.titre, etaitSigne: row.statut === 'signe',
    mandatNumero: typeof row.donnees?.mandatNumero === 'string' ? row.donnees.mandatNumero : undefined,
    quand: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date()), raison,
  });
  if (!m.surRecherche || !m.numero || !row.recherche_id || !row.numero || row.statut !== 'signe') return pbRegistre;
  const { error } = await supabase.from('recherches').update({
    mandat_date_signature: null, mandat_duree: null, mandat_honoraires: null, mandat_date_expiration: null,
    sans_mandat: true, mandat_numero: null, updated_at: new Date().toISOString(),
  }).eq('id', row.recherche_id).eq('mandat_numero', row.numero);
  return error ? ['Le document est annulé, mais le bloc Mandat de sa recherche n’a pas pu être vidé : ' + error.message, pbRegistre].filter(Boolean).join(' ') : pbRegistre;
}

/* Le libellé d'un état : un courrier est « À envoyer », puis « Envoyé ». */
export function libStatut(statut: Statut, courrier = false): string {
  if (courrier && statut === 'pret') return 'À envoyer';
  if (courrier && statut === 'signe') return 'Envoyé';
  return (STATUTS[statut] || STATUTS.brouillon).l;
}

/* ── Les dates, pour la liste ── */
export function quand(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const jour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);
  const auj = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const hier = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(Date.now() - 86_400_000));
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', ' h ');
  if (jour === auj) return `aujourd’hui à ${heure}`;
  if (jour === hier) return `hier à ${heure}`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: jour.slice(0, 4) === auj.slice(0, 4) ? undefined : 'numeric', timeZone: 'Europe/Paris' });
}
