import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_BADGE, badgeValide } from '@/lib/badge';
import { rechercheRingover, signatureValide } from '@/lib/ringover-serveur';

/* ═══ Ringover · « Contact search » : chercher dans le CRM (V3.143) ══════
   Voir lib/ringover-serveur.ts.

   POST signé par Ringover (X-Ringover-Webhook-Signature, la clé de Vercel
     RINGOVER_CLE_RECHERCHE) → les contacts qui correspondent à ce qu'il a
     tapé (`data.query_search`), avec leurs numéros ; [] si aucun.
   GET derrière le badge du CRM, `?q=martin` → ce que Ringover recevrait, et
     si la clé est posée dans Vercel : pour essayer sans Ringover.

   Publique dans src/proxy.ts (Ringover n'a pas le cookie du CRM) : la
   serrure est ici, la signature ou le badge. */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const cle = process.env.RINGOVER_CLE_RECHERCHE;
  const jeton = req.headers.get('x-ringover-webhook-signature') || req.headers.get('authorization');
  if (!signatureValide(jeton, cle)) {
    console.error('[ringover] recherche : signature absente ou refusée', cle ? '' : '(RINGOVER_CLE_RECHERCHE absente de Vercel)');
    return NextResponse.json({ erreur: 'non_autorise' }, { status: 401 });
  }
  let corps: { data?: { query_search?: unknown } } | null = null;
  try { corps = await req.json(); } catch { return NextResponse.json({ erreur: 'corps_illisible' }, { status: 400 }); }
  try {
    return NextResponse.json(await rechercheRingover(String(corps?.data?.query_search ?? '')));
  } catch (e) {
    console.error('[ringover] recherche :', (e as Error).message);
    return NextResponse.json({ erreur: 'lecture' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!(await badgeValide(req.cookies.get(COOKIE_BADGE)?.value))) return NextResponse.json({ ok: false, erreur: 'non_autorise' }, { status: 401 });
  const q = req.nextUrl.searchParams.get('q') || '';
  try {
    const r = await rechercheRingover(q);
    return NextResponse.json({ ok: true, clePosee: !!process.env.RINGOVER_CLE_RECHERCHE, q, n: r.length, resultats: r });
  } catch (e) {
    return NextResponse.json({ ok: false, erreur: (e as Error).message }, { status: 500 });
  }
}
