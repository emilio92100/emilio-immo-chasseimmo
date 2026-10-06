import type { SupabaseClient } from '@supabase/supabase-js';

/* ═══ Copier chez nous une photo d'ImmoFacile (V3.79, mis en commun en V3.95) ═
   Pour /api/biens-vente/photos-immofacile (l'import des fiches) et
   /api/diffusion/creer (un bien créé depuis le flux). Le serveur télécharge
   l'image et la dépose dans le bucket public `photos-vente`, sous
   `<id du bien>/`, comme une photo ajoutée à la main.

   Il ne lit QUE les images d'ImmoFacile : https, l'hôte media.immo-facile.com,
   un chemin d'image du catalogue (sans ce qui suit « ? »), une vraie image
   (reconnue à ses premiers octets), 15 Mo au plus, aucune redirection
   suivie. Tout le reste est refusé. Serveur seulement. */

const BUCKET = 'photos-vente';
const HOTE = 'media.immo-facile.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_OCTETS = 15 * 1024 * 1024;
const MAX_PAR_APPEL = 12;

function adresse(u: unknown): URL | null {
  if (typeof u !== 'string') return null;
  let x: URL;
  try { x = new URL(u); } catch { return null; }
  if (x.protocol !== 'https:' || x.hostname !== HOTE || x.username || x.password || x.port) return null;
  if (!/^\/[\w/.-]+\/catalog\/images\/[\w/.-]+\.(jpe?g|png|webp)$/i.test(x.pathname) || x.pathname.includes('..')) return null;
  return new URL(`https://${HOTE}${x.pathname}`);
}

function typeImage(o: Uint8Array): { type: string; ext: string } | null {
  if (o.length < 12) return null;
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return { type: 'image/png', ext: 'png' };
  const txt = (de: number, n: number) => String.fromCharCode(...Array.from(o.slice(de, de + n)));
  if (txt(0, 4) === 'RIFF' && txt(8, 4) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  return null;
}

async function lireAuPlus(res: Response, max: number): Promise<Uint8Array | null> {
  if (Number(res.headers.get('content-length') || 0) > max || !res.body) return null;
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


export type PhotoCopiee = { url: string; chemin: string };

export async function copierPhotoImmoFacile(sb: SupabaseClient, id: string, u: unknown, rang: number): Promise<PhotoCopiee | null> {
  const x = adresse(u);
  if (!x) return null;
  try {
    const r = await fetch(x.toString(), { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { Accept: 'image/*', 'User-Agent': 'Mozilla/5.0 (compatible; EmilioImmo/1.0)' } });
    if (!r.ok) return null;
    const octets = await lireAuPlus(r, MAX_OCTETS);
    const img = octets ? typeImage(octets) : null;
    if (!octets || !img) return null;
    const chemin = `${id}/if-${Date.now()}-${rang}-${Math.random().toString(36).slice(2, 6)}.${img.ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(chemin, octets, { contentType: img.type, upsert: false });
    if (error) { console.error('[photos-immofacile]', error.message); return null; }
    return { url: sb.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl, chemin };
  } catch (e) { console.error('[photos-immofacile]', (e as Error).message); return null; }
}

/* Trois à la fois, une sortie par entrée, dans l'ordre. */
export async function copierPhotosImmoFacile(sb: SupabaseClient, id: string, urls: unknown[]): Promise<(PhotoCopiee | null)[]> {
  const photos: (PhotoCopiee | null)[] = new Array(urls.length).fill(null);
  for (let i = 0; i < urls.length; i += 3) {
    const lot = await Promise.all(urls.slice(i, i + 3).map((u, k) => copierPhotoImmoFacile(sb, id, u, i + k)));
    lot.forEach((p, k) => { photos[i + k] = p; });
  }
  return photos;
}
