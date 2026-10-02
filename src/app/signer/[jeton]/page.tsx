import type { Metadata, Viewport } from 'next';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import SignatureCosignataire, { type DonneesSigner } from '@/components/signer/SignatureCosignataire';
import SignatureDocument, { type DonneesSignerDoc } from '@/components/signer/SignatureDocument';
import { modele, aRetractation, demandeExpresse } from '@/lib/actes';
import * as SD from '@/lib/signature-documents';
import { lireCos, lienValide, dansLeMandat, finRetractationDe, type Co, type LigneMandat } from '@/lib/cosignature';
import { lireIdentiteAgence, IDENTITE_DEFAUT } from '@/lib/agence';
import { masquerEmail, type Mandant } from '@/lib/mandat';
import { lienEspace } from '@/lib/jeton';
import { adressesClient } from '@/lib/mandat-serveur';

/**
 * La page d'un co-signataire : espace.emilio-immo.com/signer/<jeton>.
 *
 * Le même lien sert aux documents de la rubrique Documents envoyés pour
 * signature en ligne (mandat de vente, avenant, offre…) : un jeton qui
 * n'est pas celui d'un co-signataire est cherché dans
 * `documents_signataires` (voir pageDocument, plus bas).
 *
 * Le conjoint (ou un co-acquéreur) que le premier signataire a ajouté en
 * signant. Pas d'espace, pas de compte : ce lien est sa seule porte, et il
 * ne montre que le mandat. Publique dans src/proxy.ts ; la base se lit ici,
 * côté serveur, avec la clé service (AGENTS.md §3.4).
 */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Votre signature — Emilio Immobilier',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: '#1a2332' };

const TEL_AGENT = '06 58 95 76 32';
/* Un code parti il y a moins d'un quart d'heure. */
const recent = (iso: string) => Date.now() - Date.parse(iso) < 15 * 60_000;
const VIDE: Mandant = { civilite: '', prenom: '', nom: '', naissanceDate: '', naissanceLieu: '', adresse: '', email: '', telephone: '' };

export default async function PageSigner({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const introuvable = (): DonneesSigner => ({
    jeton, etat: 'introuvable', numero: '', moi: VIDE, premier: VIDE, premierLe: new Date().toISOString(), membres: [], rang: 0, signes: [],
    recherche: { typeBien: null, piecesMin: null, chambresMin: null, surfaceMin: null, secteurs: [], budget: null },
    identite: IDENTITE_DEFAUT, execution: null, code: null, signeLe: null, fin: null, complet: false, expire: null, tel: TEL_AGENT,
  });
  if (!/^[a-z0-9-]{12,80}$/.test(jeton)) return <SignatureCosignataire d={introuvable()} />;

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: brut } = await sb.from('mandats_cosignataires').select('*').eq('jeton', jeton).maybeSingle();
  if (!brut) {
    const doc = await pageDocument(sb, jeton);
    return doc ? <SignatureDocument d={doc} /> : <SignatureCosignataire d={introuvable()} />;
  }
  const co = brut as Co;
  const { data: lb } = await sb.from('mandats_signatures').select('*').eq('id', co.signature_id).maybeSingle();
  if (!lb || !lb.signe_le) return <SignatureCosignataire d={introuvable()} />;
  const l = lb as LigneMandat;
  const cos = await lireCos(sb, l.id);
  const membres = cos.filter(dansLeMandat);
  const rang = Math.max(0, membres.findIndex(c => c.id === co.id));
  const identite = l.contenu.identite || await lireIdentiteAgence(sb);
  const fin = finRetractationDe(l, cos, co.id);

  const etat: DonneesSigner['etat'] = l.statut === 'retracte' ? 'fin'
    : co.statut === 'invite' ? (l.statut !== 'partiel' ? 'fin' : lienValide(co) ? 'invite' : 'expire')
    : co.statut === 'prevu' ? 'introuvable'
    : co.statut;

  /* V3.43 : un lien qui ne sert plus (expiré, refusé, mandat fini) montre
     son message, et rien d'autre : ni le mandat, ni les coordonnées des
     signataires (naissance, adresse, e-mail, téléphone). Avant, tout partait
     quand même dans la page, seulement caché à l'écran. */
  if (etat !== 'invite' && etat !== 'signe') {
    return <SignatureCosignataire d={{
      ...introuvable(), etat, numero: l.numero, identite,
      moi: { ...VIDE, civilite: co.personne.civilite, prenom: co.personne.prenom },
      premier: { ...VIDE, civilite: l.mandant.civilite, prenom: l.mandant.prenom, nom: l.mandant.nom },
    }} />;
  }

  const d: DonneesSigner = {
    jeton, etat, numero: l.numero, moi: co.personne, premier: l.mandant, premierLe: l.signe_le as string,
    membres: membres.map(c => c.personne), rang,
    signes: [l.signe_le, ...membres.map(c => (c.statut === 'signe' || c.statut === 'retracte' ? c.signe_le : null))],
    recherche: l.contenu.recherche, identite, execution: l.execution_immediate,
    code: co.statut === 'invite' && co.code_hash && co.code_envoye_le && recent(co.code_envoye_le)
      ? { le: co.code_envoye_le, email: masquerEmail(co.personne.email) } : null,
    signeLe: co.signe_le, fin: fin ? fin.toISOString() : null, complet: l.statut === 'signe', expire: co.lien_expire_le, tel: TEL_AGENT,
  };
  return <SignatureCosignataire d={d} />;
}

/* Le signataire d'un document de la rubrique Documents : ce qu'il lit, où
   en sont les autres, son code encore valable. Null : ce n'est pas un jeton
   de document (ou la table n'existe pas encore). */
async function pageDocument(sb: SupabaseClient, jeton: string): Promise<DonneesSignerDoc | null> {
  const { data: brut, error } = await sb.from('documents_signataires').select('*').eq('jeton', jeton).maybeSingle();
  if (error || !brut) return null;
  const s = brut as SD.SigDoc;
  const { data: dr } = await sb.from('documents').select('*').eq('id', s.document_id).maybeSingle();
  const doc = dr as SD.DocSigne | null;
  const m = doc ? modele(doc.modele) : null;
  if (!doc || !m) return null;
  const identite = doc.identite || IDENTITE_DEFAUT;
  const nd = SD.nomDocument(m, doc.donnees);
  /* V3.50 : une lecture ratée ne montre pas un document sans ses
     signataires : « réessayez dans un instant ». */
  let sigs: SD.SigDoc[];
  try { sigs = await SD.lireSignataires(sb, doc.id); } catch (e) {
    console.error('[signer] page, signataires', (e as Error).message);
    return {
      jeton, etat: 'indisponible', entete: m.entete(doc.donnees), le: nd.le, court: nd.court, espace: null,
      moi: { prenom: s.personne.prenom, nom: s.personne.nom || s.nom, email: '' }, role: s.role || 'Signataire', autres: [],
      parties: [], cadres: { etats: {}, moi: s.cle }, resume: [], accepter: '', expresse: null, identite,
      code: null, signeLe: null, complet: false, expire: null, retractation: false, tel: TEL_AGENT,
    };
  }
  const cases = SD.casesDe(m, doc);
  const etats: Record<string, string | null> = {};
  for (const x of sigs.filter(SD.actif)) etats[x.cle] = x.statut === 'signe' ? x.signe_le : null;
  if (doc.signature?.agence_le) etats.agence = doc.signature.agence_le;
  /* V3.50 : une offre d'achat passée sa date de validité ne se signe plus. */
  const finOffre = SD.offreFinie(m, doc.donnees);
  const etat: DonneesSignerDoc['etat'] = s.statut === 'signe' ? 'signe'
    : s.statut !== 'invite' || doc.statut === 'annule' || (doc.statut === 'pret' && !doc.signature) ? 'annule'
    : doc.statut !== 'pret' ? 'fin'
    : finOffre ? 'offre_expiree'
    : SD.lienValide(s) ? 'invite' : 'expire';
  /* V3.43 : le texte du document n'est envoyé que s'il y a quelque chose à
     lire ou à signer (lien valable, ou déjà signé). */
  const actif = etat === 'invite' || etat === 'signe';
  const parties = actif ? m.rediger(doc.donnees, identite) : [];
  /* Son espace, s'il en a un et que c'est bien lui (V3.32) : une fois signé,
     « Revenir à mon espace » — sa demande de visite l'y attend peut-être. */
  let espace: string | null = null;
  if (doc.client_id) {
    const { data: c } = await sb.from('clients').select('*').eq('id', doc.client_id).maybeSingle();
    const cl = c as { token_espace?: string | null; emails?: unknown; conjoint?: unknown } | null;
    const moiEmail = String(s.personne.email || '').trim().toLowerCase();
    if (cl?.token_espace && moiEmail && adressesClient(cl).some(e => e.trim().toLowerCase() === moiEmail)) espace = lienEspace(cl.token_espace) || null;
  }
  return {
    jeton, etat, entete: m.entete(doc.donnees), le: nd.le, court: nd.court, espace,
    moi: { prenom: s.personne.prenom, nom: s.personne.nom || s.nom, email: masquerEmail(s.personne.email) },
    role: cases.find(c => c.cle === s.cle)?.qui || s.role || 'Signataire',
    autres: actif ? sigs.filter(x => SD.actif(x) && x.id !== s.id).map(x => ({ nom: SD.nomSig(x), signe: x.statut === 'signe' })) : [],
    parties, cadres: { etats, moi: s.cle },
    resume: actif ? m.resume(doc.donnees) : [], accepter: m.accepter ? m.accepter(doc.donnees, s.cle) : 'J’ai lu le document en entier et je l’accepte.',
    expresse: demandeExpresse(m, doc.donnees, s.cle),
    identite,
    code: s.statut === 'invite' && s.code_hash && s.code_envoye_le && recent(s.code_envoye_le) ? { le: s.code_envoye_le, email: masquerEmail(s.personne.email) } : null,
    signeLe: s.signe_le, complet: doc.statut === 'signe', expire: s.lien_expire_le,
    /* « 14 jours pour changer d'avis » seulement si le document le dit. */
    retractation: aRetractation(m, doc.donnees), tel: TEL_AGENT,
    finValidite: finOffre ? finOffre.toISOString() : null,
  };
}
