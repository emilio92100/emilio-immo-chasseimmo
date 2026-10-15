import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { jetonValide, rechercheFermee } from '@/lib/agences-lien';

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
