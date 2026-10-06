import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/* ═══ Copier chez nous les photos d'un bien repris d'ImmoFacile (V3.79) ═══════
   L'import des biens (ImportBiensIF.tsx) envoie, bien par bien, les adresses
   de ses photos chez ImmoFacile. Le serveur les télécharge et les dépose
   dans le bucket public `photos-vente`, sous `<id du bien>/`, comme une
   photo ajoutée à la main (deposerPhoto) : la fiche les garde même quand
   ImmoFacile s'arrête.

   Le navigateur ne peut pas les lire lui-même (ImmoFacile ne l'autorise pas
   depuis une autre adresse) ; le serveur, si. Il ne lit QUE les images
   d'ImmoFacile : https, l'hôte media.immo-facile.com, un chemin d'image du
   catalogue, une vraie image (reconnue à ses premiers octets), 15 Mo au
   plus, aucune redirection suivie. Tout le reste est refusé.

   Protégée par le code d'accès, comme le reste du CRM (src/proxy.ts).
     POST { id, urls: string[] (12 au plus) }
       →  { ok, photos: ({ url, chemin } | null)[] }   (une sortie par entrée, dans l'ordre) */

const BUCKET = 'photos-vente';
const HOTE = 'media.immo-facile.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_OCTETS = 15 * 1024 * 1024;
const MAX_PAR_APPEL = 12;
const ko = (erreur: string, status = 400) => NextResponse.json({ ok: false, erreur }, { status });

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

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return ko('Variables Supabase manquantes', 500);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return ko('Requête illisible'); }
  const id = typeof body.id === 'string' ? body.id : '';
  const urls = Array.isArray(body.urls) ? body.urls.slice(0, MAX_PAR_APPEL) : [];
  if (!UUID.test(id) || !urls.length) return ko('Paramètres manquants');
  const sb = createClient(url, cle, { auth: { persistSession: false } });

  const une = async (u: unknown, rang: number): Promise<{ url: string; chemin: string } | null> => {
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
  };

  /* Trois à la fois, une sortie par entrée, dans l'ordre. */
  const photos: ({ url: string; chemin: string } | null)[] = new Array(urls.length).fill(null);
  for (let i = 0; i < urls.length; i += 3) {
    const lot = await Promise.all(urls.slice(i, i + 3).map((u, k) => une(u, i + k)));
    lot.forEach((p, k) => { photos[i + k] = p; });
  }
  return NextResponse.json({ ok: true, photos });
}
