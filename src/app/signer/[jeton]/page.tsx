import type { Metadata, Viewport } from 'next';
import { createClient } from '@supabase/supabase-js';
import SignatureCosignataire, { type DonneesSigner } from '@/components/signer/SignatureCosignataire';
import { lireCos, lienValide, dansLeMandat, finRetractationDe, type Co, type LigneMandat } from '@/lib/cosignature';
import { lireIdentiteAgence, IDENTITE_DEFAUT } from '@/lib/agence';
import { masquerEmail, type Mandant } from '@/lib/mandat';

/**
 * La page d'un co-signataire : espace.emilio-immo.com/signer/<jeton>.
 *
 * Le conjoint (ou un co-acquéreur) que le premier signataire a ajouté en
 * signant. Pas d'espace, pas de compte : ce lien est sa seule porte, et il
 * ne montre que le mandat. Publique dans src/proxy.ts ; la base se lit ici,
 * côté serveur, avec la clé service (AGENTS.md §3.4).
 */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Votre mandat de recherche — Emilio Immobilier',
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
  if (!brut) return <SignatureCosignataire d={introuvable()} />;
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
