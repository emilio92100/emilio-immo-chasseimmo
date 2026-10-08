/* ═══ Ringover : qui appelle ? (V3.141) ═══════════════════════════════════

   Alexandre : « quand quelqu'un m'appelle sur Ringover, savoir s'il est
   connu, qu'il fasse le lien avec mon CRM, avec tous les numéros que je
   mets ».

   C'est le webhook « Contact Call » de Ringover (Développeur › Webhooks) : à
   chaque appel, entrant ou sortant, Ringover demande à notre adresse
   (/api/ringover/contact) qui est ce numéro. On répond avec le nom, une
   ligne sous le nom — la seule que Ringover montre pendant l'appel (V3.142) :
   le type, puis son bien en vente ou sa recherche (« Vendeur · En vente ·
   Appart. 2 p. · 38,11 m² · Boulogne-Billancourt ») —, quelques lignes en
   plus (`data`, que Ringover ne semble pas afficher) et le lien de sa fiche. Ringover l'affiche dans son application, même si
   le contact n'y a jamais été enregistré. Un numéro inconnu : 404, Ringover
   affiche le numéro, comme avant.

   Le numéro se compare sur ses 9 derniers chiffres : « 06 62 86 32 06 »,
   « +33 6 62 86 32 06 » et « 33662863206 » (ce que Ringover envoie) sont le
   même. Tous les numéros de la fiche comptent, et celui de la personne 2
   d'un couple (`conjoint.telephone`, voir lib/foyer.ts).

   La serrure : Ringover signe chaque appel (en-tête
   X-Ringover-Webhook-Signature, un JWT HS512) avec la clé affichée dans sa
   partie « Contact Call ». Cette clé vit dans Vercel, RINGOVER_CLE_CONTACT ;
   sans elle, tout est refusé : l'adresse est publique (src/proxy.ts), et
   sans serrure n'importe qui pourrait demander à qui est un numéro.
   ════════════════════════════════════════════════════════════════════════ */

import { createHmac, timingSafeEqual } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { typesDe, typeDe, ligneContact } from '@/lib/contacts';
import { conjointDe } from '@/lib/foyer';
import { etapeDe, titreBien, type Donnees } from '@/lib/biens-vente';
import { euros } from '@/lib/mandat';

export const crmUrl = () => (process.env.NEXT_PUBLIC_CRM_URL || 'https://crm.emilio-immo.com').replace(/\/+$/, '');

/* ── Le numéro : ses 9 derniers chiffres (rien en dessous de 9) ── */
export function cleNumero(t: unknown): string {
  const d = String(t ?? '').replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : '';
}

/* ── La signature de Ringover : un JWT HS512, signé avec la clé ── */
const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
export function signatureValide(jeton: string | null | undefined, cle: string | null | undefined): boolean {
  const j = String(jeton || '').replace(/^Bearer\s+/i, '').trim();
  const k = String(cle || '').trim();
  if (!j || !k) return false;
  const [h, p, s] = j.split('.');
  if (!h || !p || !s) return false;
  try {
    const entete = JSON.parse(b64url(h).toString('utf8')) as { alg?: string };
    if (entete.alg !== 'HS512') return false;
  } catch { return false; }
  const attendu = createHmac('sha512', k).update(`${h}.${p}`).digest();
  const recu = b64url(s);
  if (recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) return false;
  /* Un jeton daté et périmé (une minute de marge) : refusé. */
  try {
    const charge = JSON.parse(b64url(p).toString('utf8')) as { exp?: unknown };
    if (typeof charge.exp === 'number' && charge.exp * 1000 < Date.now() - 60_000) return false;
  } catch { /* pas de charge lisible : la signature suffit */ }
  return true;
}

/* ── Les contacts, gardés une minute entre deux appels ── */
type ClientLu = {
  id: string; prenom: string | null; nom: string | null; telephones: string[] | null;
  couple?: boolean | null; conjoint?: unknown; types?: unknown; pro?: unknown; archive?: boolean | null; adresse?: string | null;
};
const COLS = 'id, prenom, nom, telephones, couple, conjoint, types, pro, archive, adresse';
const COLS_SIMPLES = 'id, prenom, nom, telephones, types, pro, archive, adresse';
let cache: { le: number; liste: ClientLu[] } | null = null;

export function baseServeur(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

async function lireContacts(sb: SupabaseClient): Promise<ClientLu[]> {
  if (cache && Date.now() - cache.le < 60_000) return cache.liste;
  const liste: ClientLu[] = [];
  let cols = COLS;
  for (let de = 0; de < 50_000; de += 1000) {
    let r = await sb.from('clients').select(cols).range(de, de + 999);
    /* Une base où les colonnes du couple n'existent pas encore. */
    if (r.error && cols === COLS && /couple|conjoint/i.test(r.error.message)) {
      cols = COLS_SIMPLES;
      r = await sb.from('clients').select(cols).range(de, de + 999);
    }
    if (r.error) throw new Error(`Les contacts n’ont pas pu être lus : ${r.error.message}`);
    const lot = (r.data || []) as unknown as ClientLu[];
    liste.push(...lot);
    if (lot.length < 1000) break;
  }
  cache = { le: Date.now(), liste };
  return liste;
}

/* ── Qui a ce numéro ── */
export type Trouve = { c: ClientLu; conjoint: boolean };
export function trouverNumero(liste: ClientLu[], numero: string): Trouve[] {
  const cle = cleNumero(numero);
  if (!cle) return [];
  const out: Trouve[] = [];
  for (const c of liste) {
    if ((c.telephones || []).some(t => cleNumero(t) === cle)) { out.push({ c, conjoint: false }); continue; }
    const j = c.couple ? conjointDe(c.conjoint) : null;
    if (j?.telephone && cleNumero(j.telephone) === cle) out.push({ c, conjoint: true });
  }
  /* Les fiches en cours d'abord, la personne 1 avant la personne 2. */
  return out.sort((a, b) => Number(a.c.archive === true) - Number(b.c.archive === true) || Number(a.conjoint) - Number(b.conjoint));
}

/* ── Ce que Ringover affiche ── */
export type ReponseRingover = {
  uuid: string; firstname: string; lastname: string; company: string; url: string;
  data: Record<string, string>; is_shared: boolean;
};

type RechercheLue = { nom?: string | null; type_bien?: string | null; budget_max?: number | null; nb_pieces_min?: number | null; secteurs?: string[] | null; active?: boolean | null };
type BienLu = { titre?: string | null; etape?: string | null; ville?: string | null; donnees?: Donnees | null; archive?: boolean | null };

const phraseRecherche = (r: RechercheLue) => [
  r.type_bien ? String(r.type_bien).charAt(0).toUpperCase() + String(r.type_bien).slice(1) : '',
  r.nb_pieces_min ? `${r.nb_pieces_min} p. et plus` : '',
  r.budget_max ? `jusqu’à ${euros(r.budget_max)}` : '',
  (r.secteurs || []).filter(Boolean).slice(0, 2).join(', '),
].filter(Boolean).join(' · ') || String(r.nom || '').trim() || 'Recherche ouverte';

/* ── V3.142 : la ligne sous le nom, la seule que Ringover montre ──
   Alexandre : « je ne vois pas plus d'infos que le nom ». Ringover
   n'affiche que le nom et `company` pendant l'appel : l'essentiel y passe,
   en court (elle se coupe à droite, la ville en dernier).
   « Vendeur · En vente · Appart. 2 p. · 38,11 m² · Boulogne-Billancourt »,
   « Acheteur · Appart. 3 p.+ · 600 k€ max · Boulogne-Billancourt ». */
export const kEuros = (n: number) => (n >= 1_000_000
  ? `${(Math.round(n / 100_000) / 10).toString().replace('.', ',')} M€`
  : n >= 1000 ? `${Math.round(n / 1000)} k€` : `${n} €`);
const court = (t: string) => t.replace(/\bappartement\b/gi, 'Appart.').replace(/\s*\bpi[eè]ces?\b/gi, ' p.').replace(/\s+/g, ' ').trim();
const EN_VENTE = ['mandat', 'offre', 'compromis', 'suspendu'];
const ligneBien = (b: BienLu) => [
  etapeDe(b.etape).court, court(String(b.titre || '').trim() || titreBien(b.donnees || {})), b.ville || '',
].filter(Boolean).join(' · ');
const ligneRecherche = (r: RechercheLue) => [
  [r.type_bien ? court(String(r.type_bien).charAt(0).toUpperCase() + String(r.type_bien).slice(1)) : '', r.nb_pieces_min ? `${r.nb_pieces_min} p.+` : ''].filter(Boolean).join(' '),
  r.budget_max ? `${kEuros(r.budget_max)} max` : '',
  (r.secteurs || []).filter(Boolean)[0] || '',
].filter(Boolean).join(' · ');

export async function reponsePour(numero: string, sb: SupabaseClient = baseServeur()): Promise<ReponseRingover | null> {
  const trouves = trouverNumero(await lireContacts(sb), numero);
  if (!trouves.length) return null;
  const { c, conjoint } = trouves[0];
  const types = typesDe(c);
  const libTypes = types.map(t => typeDe(t).lib).join(' · ');
  const j = conjoint ? conjointDe(c.conjoint) : null;
  const data: Record<string, string> = { Type: libTypes };
  if (conjoint) data['Fiche'] = `Couple avec ${[c.prenom, c.nom].filter(Boolean).join(' ')}`;

  /* Sa recherche (un acheteur) et son bien (un vendeur, un propriétaire) :
     une lecture qui échoue n'empêche pas d'afficher le nom. */
  const [rech, biens] = await Promise.all([
    types.includes('acheteur')
      ? sb.from('recherches').select('nom, type_bien, budget_max, nb_pieces_min, secteurs, active').eq('client_id', c.id).eq('active', true).limit(2)
      : Promise.resolve({ data: [] as RechercheLue[], error: null }),
    types.some(t => t === 'vendeur' || t === 'proprietaire' || t === 'vendeur_signe')
      ? sb.from('biens_vente').select('titre, etape, ville, donnees, archive').eq('client_id', c.id).eq('archive', false).limit(3)
      : Promise.resolve({ data: [] as BienLu[], error: null }),
  ]);
  const r0 = ((rech.data || []) as RechercheLue[])[0];
  if (r0) data['Recherche'] = phraseRecherche(r0);
  const lesBiens = (biens.data || []) as BienLu[];
  /* La ligne visible : un bien en vente d'abord, sinon sa recherche, sinon
     son bien (une estimation, un projet à suivre). */
  const enVente = lesBiens.find(b => EN_VENTE.includes(String(b.etape || '')));
  const detail = enVente ? ligneBien(enVente) : r0 ? ligneRecherche(r0) : lesBiens[0] ? ligneBien(lesBiens[0]) : '';
  lesBiens.slice(0, 2).forEach((b, i) => {
    const titre = String(b.titre || '').trim() || titreBien(b.donnees || {});
    data[i ? 'Autre bien' : 'Bien'] = [titre, b.ville, etapeDe(b.etape).court].filter(Boolean).join(' · ');
  });
  if (c.archive === true) data['Attention'] = 'Contact archivé';
  if (trouves.length > 1) {
    data['Aussi à ce numéro'] = trouves.slice(1, 3).map(x => {
      const y = x.conjoint ? conjointDe(x.c.conjoint) : null;
      return [y ? y.prenom : x.c.prenom, y ? y.nom : x.c.nom].filter(Boolean).join(' ');
    }).join(', ');
  }

  const prenom = (j ? j.prenom : c.prenom) || '';
  const nom = (j ? j.nom : c.nom) || '';
  return {
    uuid: c.id,
    firstname: prenom,
    lastname: nom || (prenom ? '' : 'Contact sans nom'),
    company: [c.archive === true ? 'Archivé' : '', ligneContact(c) || libTypes, detail].filter(Boolean).join(' · '),
    url: `${crmUrl()}/?page=fiche&client=${encodeURIComponent(c.id)}`,
    data,
    is_shared: true,
  };
}

/* Le numéro de l'autre personne : celui qui appelle (entrant), ou celui
   qu'Alexandre appelle (sortant). */
export function numeroDe(corps: unknown): string {
  const d = (corps && typeof corps === 'object' ? (corps as { data?: unknown }).data : null) as
    { direction?: unknown; from_number?: unknown; to_number?: unknown } | null;
  if (!d) return '';
  return String((d.direction === 'outbound' ? d.to_number : d.from_number) ?? '');
}
