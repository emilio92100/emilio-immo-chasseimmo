import { createHash, timingSafeEqual } from 'crypto';
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

/* V3.143b — les premiers essais ont été refusés (401). Pour savoir pourquoi
   sans montrer de secret : le GET d'essai donne l'empreinte de chaque clé
   (six caractères de son SHA-256, à comparer à celle de la clé affichée dans
   Ringover) et ce qu'on sait du dernier refus. Une signature faite avec la
   clé de « Contact Call » est acceptée aussi : c'est une clé de Ringover. */
const empreinte = (k?: string) => (k ? createHash('sha256').update(k.trim()).digest('hex').slice(0, 6) : null);
let dernierRefus: Record<string, unknown> | null = null;
/* V3.143c — la signature des recherches n'est pas celle des appels (toujours
   401 avec les bonnes clés, empreintes vérifiées). La serrure qui ne dépend
   pas de Ringover : la clé dans l'adresse qu'on lui donne
   (`…/api/ringover/recherche?cle=<la clé de Contact search>`), comme pour
   SeLoger. Elle n'est visible que dans le tableau de bord de Ringover, où la
   clé est déjà affichée. */
function cleDansAdresse(donnee: string | null, cle: string | undefined): boolean {
  const d = String(donnee || '').trim(), k = String(cle || '').trim();
  if (!d || !k || d.length !== k.length) return false;
  return timingSafeEqual(Buffer.from(d), Buffer.from(k));
}

export async function POST(req: NextRequest) {
  const cle = process.env.RINGOVER_CLE_RECHERCHE;
  const jeton = req.headers.get('x-ringover-webhook-signature') || req.headers.get('authorization');
  if (!cleDansAdresse(req.nextUrl.searchParams.get('cle'), cle) && !signatureValide(jeton, cle) && !signatureValide(jeton, process.env.RINGOVER_CLE_CONTACT)) {
    let alg: unknown = null;
    try { alg = (JSON.parse(Buffer.from(String(jeton || '').replace(/^Bearer\s+/i, '').split('.')[0], 'base64url').toString('utf8')) as { alg?: unknown }).alg; } catch { /* pas un JWT */ }
    dernierRefus = { le: new Date().toISOString(), jeton: !!jeton, enTetes: [...req.headers.keys()].filter(k => /ringover|signature|authorization/i.test(k)), alg };
    console.error('[ringover] recherche : signature absente ou refusée', cle ? '' : '(RINGOVER_CLE_RECHERCHE absente de Vercel)', JSON.stringify(dernierRefus));
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
    return NextResponse.json({ ok: true, clePosee: !!process.env.RINGOVER_CLE_RECHERCHE, empreintes: { recherche: empreinte(process.env.RINGOVER_CLE_RECHERCHE), contact: empreinte(process.env.RINGOVER_CLE_CONTACT) }, dernierRefus, q, n: r.length, resultats: r });
  } catch (e) {
    return NextResponse.json({ ok: false, erreur: (e as Error).message }, { status: 500 });
  }
}
