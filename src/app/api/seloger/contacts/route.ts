import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_BADGE, badgeValide } from '@/lib/badge';
import { abonnements, abonner, apercuContacts, cleValide, etatContacts, releverContacts } from '@/lib/seloger-contacts-serveur';

/* ═══ Les demandes SeLoger, Logic-Immo, Belles Demeures (V3.100) ════════════
   Elles vont dans « Demandes Internet » (lib/seloger-contacts-serveur.ts).

   POST derrière le badge → relève maintenant (le CRM ouvert, toutes les
     5 minutes : components/layout/EnvoiPortails.tsx).
     { webhook: 'abonner' } → demande à AVIV de nous prévenir à chaque
     nouvelle demande (une fois, à la main).
   POST avec notre clé (`?cle=`, ou dans un en-tête) → AVIV qui prévient :
     on relève les deux derniers jours.
   GET avec CRON_SECRET → la relève du matin (vercel.json).
   GET derrière le badge → où en est la relève ;
     `?voir=1[&jours=7][&env=sandbox]` ce que rendrait AVIV, sans rien ranger ;
     `?webhook=1` les abonnements en place.

   Publique dans src/proxy.ts (ni le cron ni AVIV n'ont le cookie du CRM) :
   la serrure est ici, le badge, CRON_SECRET ou la clé. */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const parCron = (req: NextRequest) => {
  const s = process.env.CRON_SECRET;
  return !!s && req.headers.get('authorization') === `Bearer ${s}`;
};
const parBadge = (req: NextRequest) => badgeValide(req.cookies.get(COOKIE_BADGE)?.value);
/* La clé d'AVIV : dans l'adresse qu'on lui a donnée, ou dans un en-tête
   (la doc ne dit pas lequel : on les regarde tous). */
const parAviv = (req: NextRequest) =>
  cleValide(req.nextUrl.searchParams.get('cle')) || [...req.headers.values()].some(v => cleValide(v));

export async function POST(req: NextRequest) {
  if (await parBadge(req)) {
    let corps: { forcer?: unknown; webhook?: unknown } = {};
    try { corps = await req.json(); } catch { /* corps vide */ }
    if (corps.webhook === 'abonner') return NextResponse.json(await abonner());
    return NextResponse.json(await releverContacts({ forcer: !!corps.forcer }));
  }
  if (parAviv(req)) {
    const r = await releverContacts({ heures: 48, forcer: true });
    if (!r.ok) console.error('[seloger-contacts] relève sur signal :', r.erreur);
    /* Toujours 200 : un échec de notre côté se rattrape à la relève suivante,
       inutile qu'AVIV insiste. */
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, erreur: 'non_autorise' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (parCron(req)) return NextResponse.json(await releverContacts({ forcer: true }));
  if (!(await parBadge(req))) return NextResponse.json({ ok: false, erreur: 'non_autorise' }, { status: 401 });
  const q = req.nextUrl.searchParams;
  if (q.get('voir')) {
    const env = q.get('env');
    return NextResponse.json(await apercuContacts({
      jours: Number(q.get('jours')) || 7,
      ...(env === 'sandbox' || env === 'production' ? { env } : {}),
    }));
  }
  if (q.get('webhook')) return NextResponse.json(await abonnements());
  return NextResponse.json({ ok: true, ...(await etatContacts()) });
}
