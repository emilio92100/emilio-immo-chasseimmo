/* ═══ Un seul mandat en cours à la fois (V3.32) ═════════════════════════
   Alexandre : « il ne peut pas y avoir deux mandats de vente pour un bien,
   sauf si le premier a été annulé ; sinon, proposer un avenant. Pareil pour
   le mandat de recherche d'un acheteur. »

   Avant, créer un mandat ajoutait une ligne sans rien regarder. Ces deux
   fonctions disent s'il y en a déjà un EN COURS — en préparation, en
   signature, ou signé (ni annulé, ni rétracté) —, et lequel. Elles sont
   appelées partout où un mandat peut naître :
   - un mandat de vente : la fiche du bien (« Préparer le mandat », la visite
     sur place), « Nouveau document » (rubrique Documents, fiche contact),
     « Dupliquer » dans Documents ; et `creerDocument` (biens/outils.ts) refuse
     de lui-même, en dernier garde-fou ;
   - un mandat de recherche : « Nouveau document », « Dupliquer », et
     « Proposer au client » (fiche › Mandat de recherche) quand un mandat de
     Documents est en route. L'espace, lui, ne propose pas son mandat en ligne
     tant qu'un mandat de Documents attend (mandatDocumentEnRoute,
     src/lib/mandat-serveur.ts) ; /api/espace/mandat refuse (« deja »,
     « document »).

   Un avenant n'est jamais bloqué : il modifie le mandat en cours.
   Pour en refaire un vraiment nouveau, on annule d'abord celui en cours
   (« Annuler » dans Documents ; signé hors du CRM : « Mandat terminé sans
   vente » sur le bien, ou effacer le mandat noté sur la recherche). Un bien
   retiré ou vendu n'a plus de mandat qui court. */
import { supabase } from '@/lib/supabase';

export type MandatEnCours = {
  sorte: 'vente' | 'recherche';
  /* Où il en est : en préparation (brouillon), en signature, signé. */
  etat: 'preparation' | 'signature' | 'signe';
  /* « d-<id> » : un document ; « r-<id> » : signé en ligne depuis l'espace ;
     null : noté signé hors du CRM (papier, autre logiciel). */
  cle: string | null;
  documentId: string | null;
  numero: string;
  signeLe: string;
  /* Proposé dans l'espace de l'acheteur (« Faire signer le mandat »), pas
     encore signé : il le voit, il peut le signer à tout moment. */
  propose?: boolean;
};

const EN_COURS = ['brouillon', 'pret', 'signe'];
const RANG: Record<string, number> = { signe: 0, pret: 1, brouillon: 2 };
const etatDe = (statut: string): MandatEnCours['etat'] => (statut === 'signe' ? 'signe' : statut === 'pret' ? 'signature' : 'preparation');
type LigneDoc = { id: string; statut: string; numero: string | null; signe_le: string | null; modele?: string };

/* Le mandat de vente en cours d'un bien, s'il y en a un. */
export async function mandatVenteEnCours(b: {
  id: string; etape?: string | null; document_id?: string | null; mandat_numero?: string | null; donnees?: Record<string, unknown> | null;
}): Promise<MandatEnCours | null> {
  /* Appelé avec le seul identifiant (« Dupliquer ») : le bien est relu. */
  let bien = b;
  if (b.etape === undefined) {
    const r = await supabase.from('biens_vente').select('id, etape, document_id, mandat_numero, donnees').eq('id', b.id).maybeSingle();
    if (r.error) throw new Error('Le bien n’a pas pu être relu : ' + r.error.message);
    if (r.data) bien = r.data as typeof b;
  }
  const { data, error } = await supabase.from('documents').select('id, statut, numero, signe_le')
    .eq('modele', 'mandat_vente').eq('donnees->>bienVenteId', bien.id).in('statut', EN_COURS).limit(20);
  if (error) throw new Error('Les mandats du bien n’ont pas pu être vérifiés : ' + error.message);
  /* Un mandat signé ne court plus quand le bien est retiré (« Mandat terminé
     sans vente ») ou vendu : on peut en signer un nouveau. */
  const fini = ['retire', 'vendu'].includes(String(bien.etape || ''));
  let l = ((data || []) as LigneDoc[]).filter(x => !(fini && x.statut === 'signe'));
  /* Le mandat rattaché à la main (biens_vente.document_id). */
  if (bien.document_id && !l.some(x => x.id === bien.document_id)) {
    const r = await supabase.from('documents').select('id, statut, numero, signe_le, modele').eq('id', bien.document_id).maybeSingle();
    const x = r.data as LigneDoc | null;
    if (!r.error && x && x.modele === 'mandat_vente' && EN_COURS.includes(x.statut) && !(fini && x.statut === 'signe')) l = [...l, x];
  }
  if (l.length) {
    const x = [...l].sort((p, q) => (RANG[p.statut] ?? 9) - (RANG[q.statut] ?? 9))[0];
    return { sorte: 'vente', etat: etatDe(x.statut), cle: 'd-' + x.id, documentId: x.id, numero: x.numero || '', signeLe: x.signe_le || '' };
  }
  /* Noté signé hors du CRM (« Déjà signé ? ») : le bien est en mandat. */
  const d = bien.donnees || {};
  const date = typeof d.mandatDate === 'string' ? d.mandatDate : '';
  if (date && ['mandat', 'offre', 'compromis', 'suspendu'].includes(String(bien.etape || ''))) {
    return { sorte: 'vente', etat: 'signe', cle: null, documentId: null, numero: String(d.mandatNumero || bien.mandat_numero || ''), signeLe: date };
  }
  return null;
}

/* Le mandat de recherche en cours d'une recherche, s'il y en a un : un
   document, un mandat signé (ou en signature) en ligne, ou un mandat papier
   noté sur la recherche. */
export async function mandatRechercheEnCours(rechercheId: string): Promise<MandatEnCours | null> {
  const [a, b, r] = await Promise.all([
    supabase.from('documents').select('id, statut, numero, signe_le').eq('modele', 'mandat_recherche').eq('recherche_id', rechercheId).in('statut', EN_COURS).limit(20),
    supabase.from('mandats_signatures').select('id, numero, statut, signe_le, retracte_le').eq('recherche_id', rechercheId).in('statut', ['signe', 'partiel', 'en_cours']).limit(10),
    /* Toute la ligne : `mandat_propose_le` n'existe qu'après le SQL du mandat en ligne. */
    supabase.from('recherches').select('*').eq('id', rechercheId).maybeSingle(),
  ]);
  if (a.error) throw new Error('Les mandats de la recherche n’ont pas pu être vérifiés : ' + a.error.message);
  const rr = (r.error ? null : r.data) as { mandat_numero?: string | null; mandat_date_signature?: string | null; mandat_date_expiration?: string | null; mandat_propose_le?: string | null } | null;
  /* Arrivé à son terme, le mandat signé ne court plus : on en signe un nouveau
     (un mandat terminé ne se prolonge pas par avenant). */
  const fini = !!rr?.mandat_date_expiration && String(rr.mandat_date_expiration).slice(0, 10) < new Date().toISOString().slice(0, 10);
  const docs = ((a.data || []) as LigneDoc[]).filter(x => !(fini && x.statut === 'signe'));
  const enLigne = ((b.error ? [] : b.data || []) as { id: string; numero: string | null; statut: string; signe_le: string | null; retracte_le: string | null }[])
    .filter(x => !x.retracte_le && !(fini && x.statut !== 'en_cours'));
  const signeEnLigne = enLigne.find(x => x.statut === 'signe' || x.statut === 'partiel');
  const docSigne = docs.find(x => x.statut === 'signe');
  if (docSigne) return { sorte: 'recherche', etat: 'signe', cle: 'd-' + docSigne.id, documentId: docSigne.id, numero: docSigne.numero || '', signeLe: docSigne.signe_le || '' };
  if (signeEnLigne) return { sorte: 'recherche', etat: 'signe', cle: 'r-' + signeEnLigne.id, documentId: null, numero: signeEnLigne.numero || '', signeLe: signeEnLigne.signe_le || '' };
  const doc = [...docs].sort((p, q) => (RANG[p.statut] ?? 9) - (RANG[q.statut] ?? 9))[0];
  if (doc) return { sorte: 'recherche', etat: etatDe(doc.statut), cle: 'd-' + doc.id, documentId: doc.id, numero: doc.numero || '', signeLe: '' };
  const enCours = enLigne.find(x => x.statut === 'en_cours');
  if (enCours) return { sorte: 'recherche', etat: 'signature', cle: 'r-' + enCours.id, documentId: null, numero: enCours.numero || '', signeLe: '' };
  if (rr?.mandat_date_signature && !fini) return { sorte: 'recherche', etat: 'signe', cle: null, documentId: null, numero: rr.mandat_numero || '', signeLe: rr.mandat_date_signature };
  /* Proposé dans son espace (V3.32) : il peut le signer à tout moment. */
  if (rr?.mandat_propose_le && !rr.mandat_date_signature) return { sorte: 'recherche', etat: 'signature', cle: null, documentId: null, numero: rr.mandat_numero || '', signeLe: '', propose: true };
  return null;
}

/* La phrase qui le dit, la même partout. */
export function phraseMandat(x: MandatEnCours): string {
  const quoi = x.sorte === 'vente' ? 'Un mandat de vente' : 'Un mandat de recherche';
  const ou = x.sorte === 'vente' ? 'sur ce bien' : 'pour cette recherche';
  const jour = x.signeLe ? new Date(x.signeLe.length <= 10 ? `${x.signeLe}T12:00:00` : x.signeLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  if (x.propose) return `${quoi} est déjà proposé dans son espace${x.numero ? ` (n° ${x.numero})` : ''} : il ne l’a pas encore signé.`;
  const detail = [x.numero ? `n° ${x.numero}` : '', x.etat === 'signe' ? (jour ? `signé le ${jour}` : 'signé') : x.etat === 'signature' ? 'en cours de signature' : 'en préparation',
    x.cle === null ? 'hors du CRM' : x.cle.startsWith('r-') ? 'en ligne' : ''].filter(Boolean).join(', ');
  return `${quoi} est déjà en cours ${ou} (${detail}).`;
}

/* Ce qu'il faut faire pour en refaire un nouveau. */
export function conseilMandat(x: MandatEnCours): string {
  if (x.propose) return 'Laisse-le le signer, ou retire d’abord la proposition (sa fiche › Mandat de recherche) pour faire un mandat papier à la place.';
  if (x.etat !== 'signe') return 'Reprends-le plutôt que d’en commencer un second. Pour repartir de zéro, annule-le d’abord dans Documents.';
  if (x.cle === null) {
    return x.sorte === 'vente'
      ? 'Pour changer le prix, les honoraires ou la durée : un avenant. Pour en signer un nouveau : d’abord « Mandat terminé sans vente » sur la fiche du bien.'
      : 'Pour changer la recherche ou les honoraires : un avenant. Pour en signer un nouveau : efface d’abord le mandat noté sur sa recherche.';
  }
  return x.sorte === 'vente'
    ? 'Pour changer le prix, les honoraires ou la durée : un avenant. Pour en signer un nouveau : annule d’abord le mandat en cours dans Documents.'
    : 'Pour changer la recherche ou les honoraires : un avenant. Pour en signer un nouveau : annule (ou fais rétracter) d’abord le mandat en cours.';
}
