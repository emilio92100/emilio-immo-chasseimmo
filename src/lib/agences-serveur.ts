import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { codeValide, jetonValide, rechercheFermee } from '@/lib/agences-lien';

/* ═══ Le lien pour les agences, côté serveur (V3.197) ═════════════════════
   Ce que partagent la page /proposer/<jeton> et les routes /api/agences/ :
   la serrure (le jeton d'une recherche ouverte), la fiche lue gardée
   intacte entre « lire » et « proposer » (signée), les photos déposées, et
   une limite de débit. Serveur seulement (clé service, AGENTS.md §3.4). */

export function base(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

export type RechercheAgence = { recherche: Record<string, any>; client: { id: string; statut?: string | null; archive?: boolean | null } | null; ferme: boolean };

/** La recherche d'un lien d'agence, et si son dossier est encore ouvert. `null` : lien inconnu ou coupé. */
export async function rechercheDuJeton(sb: SupabaseClient, jeton: unknown): Promise<RechercheAgence | null> {
  if (!jetonValide(jeton)) return null;
  const { data: r, error } = await sb.from('recherches').select('*').eq('token_agences', jeton).maybeSingle();
  if (error || !r) return null;
  const { data: c } = await sb.from('clients').select('id, statut, archive').eq('id', r.client_id).maybeSingle();
  const client = (c as RechercheAgence['client']) || null;
  return { recherche: r, client, ferme: rechercheFermee(client) };
}

/* ── La fiche lue, gardée intacte entre « lire » et « proposer » ──
   La page renvoie la fiche avec sa signature : une fiche retouchée en route
   ne passe pas (le serveur relit l'annonce). */
const secret = () => `agences:${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_URL || 'emilio'}`;
export function signer(jeton: string, url: string, fiche: unknown): string {
  return createHmac('sha256', secret()).update(`${jeton}\n${url}\n${JSON.stringify(fiche)}`).digest('base64url');
}
export function signatureValide(jeton: string, url: string, fiche: unknown, sig: unknown): boolean {
  if (typeof sig !== 'string' || !sig) return false;
  const attendu = Buffer.from(signer(jeton, url, fiche));
  const recu = Buffer.from(sig);
  return attendu.length === recu.length && timingSafeEqual(attendu, recu);
}

/* ── La fiche lue, réduite à ce que `biens` connaît ── */
const TEXTES = ['titre', 'type_bien', 'ville', 'code_postal', 'quartier', 'adresse', 'situation', 'exposition', 'dpe', 'ges',
  'chauffage', 'source_energie', 'chauffage_emetteurs', 'etat_general', 'agence_nom', 'agence_tel', 'description', 'source_portail', 'url'];
const NOMBRES = ['surface', 'surface_sejour', 'nb_pieces', 'nb_chambres', 'nb_salles_bain', 'nb_wc', 'etage', 'etage_total', 'annee_construction',
  'dpe_conso', 'ges_emissions', 'prix_vendeur', 'charges_trimestrielles', 'taxe_fonciere', 'surface_balcon', 'surface_terrasse'];
const CASES = ['parking', 'balcon', 'terrasse', 'jardin', 'cave', 'ascenseur', 'gardien', 'cuisine_equipee', 'climatisation', 'traversant'];

export function ficheNette(b: unknown): Record<string, unknown> {
  const x = b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const k of TEXTES) {
    const v = x[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, k === 'description' ? 6000 : 300);
  }
  for (const k of NOMBRES) {
    const n = typeof x[k] === 'number' ? (x[k] as number) : typeof x[k] === 'string' ? Number(String(x[k]).replace(',', '.')) : NaN;
    if (Number.isFinite(n) && n >= 0 && n < 1e9) out[k] = n;
  }
  for (const k of CASES) if (x[k] === true) out[k] = true;
  const photos = (Array.isArray(x.photos) ? x.photos : [])
    .filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u) && u.length < 1000).slice(0, 20);
  if (photos.length) out.photos = photos;
  return out;
}

/** Ce que la page montre de l'annonce lue. */
export function apercuDe(f: Record<string, unknown>) {
  const n = (k: string) => (typeof f[k] === 'number' ? (f[k] as number) : null);
  const photos = Array.isArray(f.photos) ? (f.photos as string[]) : [];
  return {
    titre: (f.titre as string) || null, prix: n('prix_vendeur'), surface: n('surface'), pieces: n('nb_pieces'),
    chambres: n('nb_chambres'), etage: n('etage'), ville: (f.ville as string) || null,
    balcon: !!f.balcon, terrasse: !!f.terrasse, jardin: !!f.jardin,
    photos: photos.length, photo: photos[0] || null,
  };
}

/* ── Les photos déposées (un bien qui n'est pas en ligne) ── */
const MAX_OCTETS = 6 * 1024 * 1024;
function typeImage(o: Uint8Array): { type: string; ext: string } | null {
  if (o.length < 12) return null;
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return { type: 'image/png', ext: 'png' };
  const txt = (de: number, k: number) => String.fromCharCode(...Array.from(o.slice(de, de + k)));
  if (txt(0, 4) === 'RIFF' && txt(8, 4) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  return null;
}
const DATA_URI = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i;
export function decoderPhoto(u: unknown): { octets: Uint8Array; type: string; ext: string } | null {
  if (typeof u !== 'string') return null;
  const m = DATA_URI.exec(u.replace(/\s+/g, ''));
  if (!m || Math.floor(m[2].length * 3 / 4) > MAX_OCTETS) return null;
  try {
    const octets = new Uint8Array(Buffer.from(m[2], 'base64'));
    if (!octets.length || octets.length > MAX_OCTETS) return null;
    const t = typeImage(octets);
    return t ? { octets, ...t } : null;
  } catch { return null; }
}

/* ── Une limite de débit, par instance du serveur ──
   Imparfaite (chaque instance compte de son côté), mais elle empêche qu'un
   lien tombé entre de mauvaises mains fasse tourner la lecture en boucle. */
const COMPTEURS = new Map<string, number[]>();
export function limite(cle: string, n: number, fenetreMs: number): boolean {
  const maintenant = Date.now();
  const l = (COMPTEURS.get(cle) || []).filter(t => maintenant - t < fenetreMs);
  if (l.length >= n) { COMPTEURS.set(cle, l); return false; }
  l.push(maintenant);
  COMPTEURS.set(cle, l);
  if (COMPTEURS.size > 5000) COMPTEURS.clear();
  return true;
}

export const nettoie = (s: unknown, max = 600) =>
  typeof s === 'string' ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '';

/* V3.198 — Le même lien, écrit un peu autrement : avec ou sans « www. »,
   avec ou sans « / » final. La requête à la question (`id=…`) est gardée :
   sur certains sites, c'est elle qui désigne l'annonce. */
export function variantesLien(url: string): string[] {
  const out = new Set<string>([url]);
  let u: URL;
  try { u = new URL(url); } catch { return [url]; }
  const hotes = [u.hostname, u.hostname.startsWith('www.') ? u.hostname.slice(4) : `www.${u.hostname}`];
  const chemin = u.pathname.length > 1 && u.pathname.endsWith('/') ? u.pathname.slice(0, -1) : u.pathname;
  const chemins = chemin === '/' ? ['/'] : [chemin, `${chemin}/`];
  for (const h of hotes) for (const c of chemins) {
    const v = new URL(url); v.hostname = h; v.pathname = c;
    out.add(v.toString());
    /* `new URL` remet un « / » après l'hôte : la forme sans, telle qu'un portail l'écrit. */
    if (c === '/' && !v.search) out.add(v.toString().replace(/\/$/, ''));
  }
  return Array.from(out).slice(0, 10);
}

/* V3.198 — Une ligne au journal, côté serveur. Comme addJournal : un type que
   la base refuse (sa liste fermée, code 23514 ; « proposition_agence » n'y
   est peut-être pas) est gardé sous « statut_change », le type voulu en
   metadata. Jamais bloquant : un échec reste dans les journaux du serveur. */
export type LigneJournal = { client_id: string; recherche_id?: string | null; bien_id?: string | null; type: string; titre: string; description?: string | null; metadata?: Record<string, unknown> };
export async function journalServeur(sb: SupabaseClient, quoi: string, ligne: LigneJournal): Promise<void> {
  const { error } = await sb.from('journal').insert(ligne);
  if (!error) return;
  if ((error as { code?: string }).code === '23514' && ligne.type !== 'statut_change') {
    const { error: e2 } = await sb.from('journal').insert({ ...ligne, type: 'statut_change', metadata: { ...(ligne.metadata || {}), type_voulu: ligne.type } });
    if (e2) console.error(`[écriture] ${quoi} : ${e2.message}`);
    return;
  }
  console.error(`[écriture] ${quoi} : ${error.message}`);
}

/* V3.202 — Le code au bout du lien (src/lib/agences-lien.ts) : l'envoi du
   CRM qu'il désigne, noté au journal par noterEnvoi (`metadata.code_lien`).
   Ce qu'Alexandre a noté de la personne remplit « Vous » sur la page.
   `null` : code inconnu pour cette recherche (la page s'ouvre vide). */
export type EnvoiDuCode = { agence: string; interlocuteur: string | null; tel: string | null; email: string | null; le: string; canal: string | null };
export async function envoiDuCode(sb: SupabaseClient, rid: string, code: unknown): Promise<EnvoiDuCode | null> {
  if (!codeValide(code)) return null;
  const { data, error } = await sb.from('journal').select('created_at, metadata').eq('recherche_id', rid)
    .contains('metadata', { code_lien: code }).order('created_at', { ascending: false }).limit(1);
  if (error) { console.error('[agences] code du lien', error.message); return null; }
  const x = (data || [])[0] as { created_at: string; metadata: Record<string, unknown> | null } | undefined;
  const m = x?.metadata || {};
  const t = (k: string, max: number) => (typeof m[k] === 'string' ? String(m[k]).trim().slice(0, max) : '') || null;
  const agence = t('agence', 120);
  if (!x || !agence) return null;
  return { agence, interlocuteur: t('interlocuteur', 120), tel: t('tel', 40), email: t('email', 160), le: x.created_at, canal: t('canal', 10) };
}
