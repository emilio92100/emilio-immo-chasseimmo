/* ═══ Documents juridiques : la table, les fichiers, la finalisation ═══════
   Tout ce que la page et l'éditeur font avec Supabase, au même endroit, et
   chaque écriture remonte son erreur (AGENTS.md §3.2).

   Un document vit en trois temps :
     · brouillon  — les réponses s'enregistrent au fil de la saisie ;
     · pret       — « À faire signer » : le PDF est figé dans le stockage,
                    avec l'identité de l'agence du jour ; plus rien ne bouge
                    tant qu'on ne le repasse pas en brouillon ;
     · signe      — l'exemplaire signé est déposé (scan ou photo).
   Et `annule`, qui garde la trace sans rien effacer. */

import { supabase } from '@/lib/supabase';
import { CLE_IDENTITE, lireIdentite, type IdentiteAgence } from '@/lib/agence';
import { STATUTS, pdfDocument, type Categorie, type Donnees, type Modele, type Statut } from '@/lib/actes';

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
};

/* Le mandat de recherche, signé en ligne depuis l'espace acheteur : il a
   sa propre table (mandats_signatures) ; la page le montre à côté des autres. */
export type MandatRecherche = {
  id: string; numero: string | null; statut: string; signe_le: string | null; retracte_le: string | null;
  pdf_chemin: string | null; client_id: string | null; recherche_id: string | null;
  mandant: { prenom?: string; nom?: string; civilite?: string } | null; created_at: string;
};

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
export async function finaliser(row: DocumentRow, m: Modele, d: Donnees): Promise<DocumentRow> {
  const numero = typeof d.numero === 'string' ? d.numero.trim() : '';
  if (m.numero && numero) {
    const pris = await numeroDejaPris(numero, row.id, m.surRecherche ? row.recherche_id : null);
    if (pris) throw new Error(`Le numéro ${numero} est déjà utilisé par ${pris}. Un numéro du registre ne sert qu’une fois.`);
  }
  const identite = await identiteDuJour();
  const octets = await pdfDocument(m, d, identite);
  const chemin = await deposer(row.id, 'pdf', new Blob([octets as BlobPart], { type: 'application/pdf' }), 'pdf');
  const maintenant = new Date().toISOString();
  const { data, error } = await supabase.from('documents').update({
    ...colonnesListe(m, d), donnees: d, identite, statut: 'pret', pdf_chemin: chemin,
    finalise_le: maintenant, updated_at: maintenant,
  }).eq('id', row.id).select().single();
  if (error) throw new Error('Le PDF est prêt mais le document n’a pas pu être mis à jour : ' + error.message);
  return data as DocumentRow;
}

/* ── Signé : ce que le document écrit ailleurs ──
   Un mandat de recherche papier remplit le bloc Mandat de sa recherche
   (comme une signature en ligne), et laisse une ligne dans le suivi du
   client. Rend un message d'erreur, ou null. */
export async function apresSignature(row: DocumentRow, m: Modele, jour: string): Promise<string | null> {
  if (!m.surRecherche || !row.recherche_id) return null;
  const { error } = await supabase.from('recherches').update(m.surRecherche(row.donnees, jour)).eq('id', row.recherche_id);
  if (error) return 'Le document est bien marqué signé, mais le bloc Mandat de sa recherche n’a pas pu être rempli : ' + error.message + '. Saisis-le à la main dans la fiche client.';
  if (row.client_id) {
    const { error: e2 } = await supabase.from('journal').insert({
      client_id: row.client_id, type: 'mandat', titre: '📋 Mandat de recherche signé (papier)',
      description: [row.numero ? `n° ${row.numero}` : '', row.badge || '', `signé le ${jour.split('-').reverse().join('/')}`].filter(Boolean).join(' · '),
      metadata: { document_id: row.id },
    });
    if (e2) return 'Le mandat est signé et le bloc Mandat rempli, mais la ligne du suivi client n’a pas pu être ajoutée : ' + e2.message;
  }
  return null;
}

/* Annulé après signature : le bloc Mandat de sa recherche se vide, s'il
   porte encore ce mandat (même numéro). */
export async function apresAnnulation(row: DocumentRow, m: Modele): Promise<string | null> {
  if (!m.surRecherche || !row.recherche_id || !row.numero || row.statut !== 'signe') return null;
  const { error } = await supabase.from('recherches').update({
    mandat_date_signature: null, mandat_duree: null, mandat_honoraires: null, mandat_date_expiration: null,
    sans_mandat: true, mandat_numero: null, updated_at: new Date().toISOString(),
  }).eq('id', row.recherche_id).eq('mandat_numero', row.numero);
  return error ? 'Le document est annulé, mais le bloc Mandat de sa recherche n’a pas pu être vidé : ' + error.message : null;
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
