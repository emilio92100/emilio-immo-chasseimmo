import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

/* ═══ Ranger chez nous les photos d'une annonce ═══════════════════════════
   Les photos d'une annonce lue ailleurs (veille, import d'un lien) sont
   téléchargées ici, puis déposées dans le bucket public `photos-biens`.

   V3.43 : le serveur allait chercher n'importe quelle adresse trouvée dans la
   page de l'annonce, sans rien regarder. Une annonce piégée pouvait lui
   faire lire une adresse interne, ou déposer chez nous un fichier qui n'est
   pas une image, ou un fichier énorme. Maintenant :
   - seulement http(s), vers une adresse publique (pas localhost, pas un
     réseau privé), vérifiée à chaque redirection (trois au plus) ;
   - une vraie image (JPEG, PNG, WebP, GIF, AVIF), reconnue à ses premiers
     octets, de 15 Mo au plus ;
   - un chemin de rangement sans détour possible (`bien_id` contrôlé).
   Ce qui n'est pas rangé chez nous (un plan en PDF, une adresse refusée ou
   illisible, au-delà de 40 photos) garde son adresse d'origine, comme avant :
   le serveur ne va simplement pas la chercher.
   Une entrée = une sortie, dans le même ordre : la fiche d'un bien (FicheClient)
   apparie les deux listes par leur rang.

   V3.107 : une photo peut aussi arriver toute faite, en « data URI »
   (data:image/jpeg;base64,…) — c'est le cas d'une photo recadrée dans le
   navigateur ou débarrassée d'un logo par la veille. Depuis la V3.43, ces
   photos étaient renvoyées telles quelles, sans être rangées (constaté le
   2 octobre). Elles passent maintenant les mêmes contrôles qu'une photo
   téléchargée : une vraie image, reconnue à ses premiers octets, de 15 Mo au
   plus. Rien n'est téléchargé pour elles : aucune adresse n'est suivie. */

export const maxDuration = 60;

const BUCKET = 'photos-biens';
const MAX_OCTETS = 15 * 1024 * 1024;
const REDIRECTIONS = 3;
/* uuid, « veille/<uuid>/<horodatage> », « veille/<uuid>/plans-<horodatage> » :
   des lettres, chiffres, tirets, soulignés, et au plus quatre étages. */
const DOSSIER = /^[A-Za-z0-9_-]{1,80}(\/[A-Za-z0-9_-]{1,80}){0,3}$/;

// Client avec la clé SERVICE (accès Storage en écriture)
function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) throw new Error('Variables Supabase manquantes');
  return createClient(url, serviceKey);
}

/* Déjà une photo à nous : l'adresse publique de notre propre bucket. */
function dejaChezNous(u: string): boolean {
  try {
    const x = new URL(u);
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://invalide');
    return x.origin === base.origin && x.pathname.startsWith(`/storage/v1/object/public/${BUCKET}/`);
  } catch { return false; }
}

/* Une adresse IP privée, locale ou réservée. */
function ipInterne(ip: string): boolean {
  const v = ip.toLowerCase();
  if (isIP(v) === 4) {
    const [a, b] = v.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (isIP(v) === 6) {
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    return m ? ipInterne(m[1]) : false;
  }
  return true;
}

/* L'adresse peut-elle être lue par le serveur ? */
async function adresseSure(u: string): Promise<URL | null> {
  let x: URL;
  try { x = new URL(u); } catch { return null; }
  if (x.protocol !== 'https:' && x.protocol !== 'http:') return null;
  if (x.username || x.password) return null;
  const hote = x.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hote || hote === 'localhost' || /\.(local|localhost|internal|lan|home)$/.test(hote)) return null;
  try {
    const ips = isIP(hote) ? [hote] : (await lookup(hote, { all: true })).map(a => a.address);
    if (!ips.length || ips.some(ipInterne)) return null;
  } catch { return null; }
  return x;
}

/* L'image, reconnue à ses premiers octets (le type annoncé ne suffit pas). */
function typeImage(o: Uint8Array): { type: string; ext: string } | null {
  const a = (i: number) => o[i];
  if (o.length < 12) return null;
  if (a(0) === 0xff && a(1) === 0xd8 && a(2) === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (a(0) === 0x89 && a(1) === 0x50 && a(2) === 0x4e && a(3) === 0x47) return { type: 'image/png', ext: 'png' };
  if (a(0) === 0x47 && a(1) === 0x49 && a(2) === 0x46) return { type: 'image/gif', ext: 'gif' };
  const txt = (de: number, n: number) => String.fromCharCode(...Array.from(o.slice(de, de + n)));
  if (txt(0, 4) === 'RIFF' && txt(8, 4) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  if (txt(4, 4) === 'ftyp' && /^avi[fs]/.test(txt(8, 4))) return { type: 'image/avif', ext: 'avif' };
  return null;
}

/* Lire la réponse sans dépasser la limite : au-delà, on abandonne. */
async function lireAuPlus(res: Response, max: number): Promise<Uint8Array | null> {
  const annonce = Number(res.headers.get('content-length') || 0);
  if (annonce > max) return null;
  if (!res.body) return null;
  const lecteur = res.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { try { await lecteur.cancel(); } catch { /* rien */ } return null; }
    morceaux.push(value);
  }
  const out = new Uint8Array(total);
  let i = 0;
  for (const m of morceaux) { out.set(m, i); i += m.byteLength; }
  return out;
}

/* Une image envoyée toute faite : data:image/<type>;base64,<données>.
   Seuls les types d'image sont acceptés ; les octets sont revérifiés ensuite
   par typeImage(), comme pour une photo téléchargée. */
const DATA_URI = /^data:image\/(jpeg|jpg|png|webp|gif|avif);base64,([A-Za-z0-9+/=\s]+)$/i;

function decoderDataUri(u: string): { octets: Uint8Array } | 'refuse' | null {
  if (!u.startsWith('data:')) return null;
  const m = DATA_URI.exec(u);
  if (!m) return 'refuse';
  const b64 = m[2].replace(/\s+/g, '');
  /* 4 caractères base64 = 3 octets : on refuse avant de décoder si c'est trop gros. */
  if (Math.floor(b64.length * 3 / 4) > MAX_OCTETS) return 'refuse';
  try {
    const octets = new Uint8Array(Buffer.from(b64, 'base64'));
    if (!octets.length || octets.length > MAX_OCTETS) return 'refuse';
    return { octets };
  } catch {
    return 'refuse';
  }
}

/* Télécharger, en revérifiant l'adresse à chaque redirection. */
async function telecharger(u: string): Promise<{ octets: Uint8Array } | 'refuse' | 'illisible'> {
  let adresse = u;
  for (let n = 0; n <= REDIRECTIONS; n++) {
    const x = await adresseSure(adresse);
    if (!x) return 'refuse';
    const res = await fetch(x.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmilioImmo/1.0)', Accept: 'image/*' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    if (res.status >= 300 && res.status < 400) {
      const suite = res.headers.get('location');
      if (!suite) return 'illisible';
      adresse = new URL(suite, x).toString();
      continue;
    }
    if (!res.ok) return 'illisible';
    const octets = await lireAuPlus(res, MAX_OCTETS);
    return octets ? { octets } : 'illisible';
  }
  return 'illisible';
}

export async function POST(req: NextRequest) {
  try {
    const { photos, bien_id } = await req.json();
    if (!Array.isArray(photos) || !photos.length || typeof bien_id !== 'string' || !DOSSIER.test(bien_id)) {
      return NextResponse.json({ urls: [], error: 'Paramètres manquants' });
    }

    const supabase = getSupabaseService();
    /* Une sortie par entrée, dans l'ordre (voir en tête). */
    const uploadedUrls: unknown[] = [];

    for (const photoUrl of photos) {
      if (uploadedUrls.length >= 40 || typeof photoUrl !== 'string' || !photoUrl) { uploadedUrls.push(photoUrl); continue; }
      try {
        // Déjà dans notre Storage : gardée telle quelle
        if (dejaChezNous(photoUrl)) {
          uploadedUrls.push(photoUrl);
          continue;
        }

        /* Une image toute faite (data URI) : décodée ici, jamais téléchargée.
           Refusée (pas une image, trop grosse), elle reste telle quelle. */
        const r = decoderDataUri(photoUrl) ?? await telecharger(photoUrl);
        /* Refusée (interne, piégée, nom introuvable) ou illisible : pas
           téléchargée, elle garde son adresse d'origine. */
        if (r === 'refuse' || r === 'illisible') { uploadedUrls.push(photoUrl); continue; }
        const img = typeImage(r.octets);
        if (!img) { uploadedUrls.push(photoUrl); continue; }

        // Nom de fichier unique : bien_id + horodatage + rang
        const filename = `${bien_id}/${Date.now()}-${uploadedUrls.length}.${img.ext}`;
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(filename, r.octets, { contentType: img.type, upsert: false });

        if (error) {
          console.error('Upload error:', error.message);
          uploadedUrls.push(photoUrl); // l'adresse d'origine, faute de mieux
          continue;
        }

        const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filename);
        uploadedUrls.push(publicUrl);
      } catch {
        // En cas d'erreur sur une photo, garder l'URL originale
        uploadedUrls.push(photoUrl);
      }
    }

    return NextResponse.json({ urls: uploadedUrls });
  } catch (e) {
    console.error('[upload-photos]', (e as Error).message);
    return NextResponse.json({ urls: [], error: 'Les photos n’ont pas pu être rangées.' });
  }
}
