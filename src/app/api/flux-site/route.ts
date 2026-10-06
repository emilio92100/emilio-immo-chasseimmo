import { NextResponse } from 'next/server';
import { lireBiensSite } from '@/lib/flux-site-serveur';

/* ═══ Les biens du site emilio-immo.com (V3.92) ════════════════════════════
   GET /api/flux-site → { properties: [...], lastFetched }
   Le même JSON que rendait la fonction `fetch-properties` du site quand elle
   lisait ImmoFacile (src/lib/flux-site.ts). Publique (src/proxy.ts) : elle ne
   rend que les biens que leur fiche publie sur le site, sans rien de privé.
   Le site la lit à chaque visite : une minute de cache chez Vercel, cinq de
   plus pendant qu'il recharge. */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

export async function GET() {
  try {
    const { biens } = await lireBiensSite();
    return NextResponse.json({ properties: biens, lastFetched: new Date().toISOString() }, {
      headers: { ...CORS, 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (e) {
    console.error('[flux-site]', (e as Error).message);
    return NextResponse.json({ error: 'Les biens n’ont pas pu être lus.' }, { status: 500, headers: CORS });
  }
}
