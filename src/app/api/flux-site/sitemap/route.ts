import { lireBiensSite } from '@/lib/flux-site-serveur';

/* ═══ Le plan des biens pour Google (V3.92) ════════════════════════════════
   www.emilio-immo.com/sitemap-biens.xml est réécrit vers cette route
   (vercel.json du site). Un bien publié sur le site y entre tout seul ; un
   bien vendu, retiré ou dépublié en sort tout seul. Mêmes adresses que les
   pages du site : /biens/<numéro ImmoFacile ou référence du CRM>. */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SITE = 'https://www.emilio-immo.com';
const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET() {
  let urls = '';
  try {
    const { biens } = await lireBiensSite();
    urls = biens.map(p => `  <url>
    <loc>${echapper(`${SITE}/biens/${encodeURIComponent(p.id)}`)}</loc>${p.dateAdded ? `
    <lastmod>${p.dateAdded}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');
  } catch (e) {
    /* Un plan vide ferait oublier les pages à Google : on lui dit de repasser. */
    console.error('[flux-site/sitemap]', (e as Error).message);
    return new Response('', { status: 503, headers: { 'Retry-After': '3600' } });
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600', 'Access-Control-Allow-Origin': '*' } });
}
