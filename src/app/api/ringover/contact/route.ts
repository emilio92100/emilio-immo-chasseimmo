import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_BADGE, badgeValide } from '@/lib/badge';
import { numeroDe, reponsePour, signatureValide } from '@/lib/ringover-serveur';

/* ═══ Ringover · « Contact Call » : qui est ce numéro ? (V3.141) ══════════
   Voir lib/ringover-serveur.ts.

   POST signé par Ringover (X-Ringover-Webhook-Signature, la clé de Vercel
     RINGOVER_CLE_CONTACT) → le contact, ou 404 s'il est inconnu.
   GET derrière le badge du CRM, `?numero=06…` → ce que Ringover recevrait,
     et si la clé est posée dans Vercel : pour essayer sans téléphoner.

   Publique dans src/proxy.ts (Ringover n'a pas le cookie du CRM) : la
   serrure est ici, la signature ou le badge. */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const cle = process.env.RINGOVER_CLE_CONTACT;
  const jeton = req.headers.get('x-ringover-webhook-signature') || req.headers.get('authorization');
  if (!signatureValide(jeton, cle)) {
    console.error('[ringover] contact : signature absente ou refusée', cle ? '' : '(RINGOVER_CLE_CONTACT absente de Vercel)');
    return NextResponse.json({ erreur: 'non_autorise' }, { status: 401 });
  }
  let corps: unknown = null;
  try { corps = await req.json(); } catch { return NextResponse.json({ erreur: 'corps_illisible' }, { status: 400 }); }
  try {
    const r = await reponsePour(numeroDe(corps));
    return r ? NextResponse.json(r) : NextResponse.json({}, { status: 404 });
  } catch (e) {
    console.error('[ringover] contact :', (e as Error).message);
    return NextResponse.json({ erreur: 'lecture' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!(await badgeValide(req.cookies.get(COOKIE_BADGE)?.value))) return NextResponse.json({ ok: false, erreur: 'non_autorise' }, { status: 401 });
  const numero = req.nextUrl.searchParams.get('numero') || '';
  try {
    const r = numero ? await reponsePour(numero) : null;
    return NextResponse.json({ ok: true, clePosee: !!process.env.RINGOVER_CLE_CONTACT, numero, connu: !!r, reponse: r });
  } catch (e) {
    return NextResponse.json({ ok: false, erreur: (e as Error).message }, { status: 500 });
  }
}
