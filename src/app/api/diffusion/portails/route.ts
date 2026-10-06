import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_BADGE, badgeValide } from '@/lib/badge';
import { deposerJinka, lireEtatJinka, preparerJinka } from '@/lib/jinka-serveur';

/* ═══ Envoyer les annonces aux portails (V3.97 : Jinka) ════════════════════
   POST (le CRM, derrière le badge) → { jinka: ResultatJinka }
     Le CRM l'appelle quand quelque chose change (components/layout/
     EnvoiPortails.tsx) : le dépôt n'a lieu que si le fichier a changé.
     { forcer: true } redépose même sans changement.
   GET avec l'en-tête du cron de Vercel (CRON_SECRET) → redépôt complet, la
     nuit, par sécurité (vercel.json).
   GET derrière le badge → l'état du dernier dépôt et ce que contiendrait le
     prochain ; `?fichier=csv` rend Annonces.csv à télécharger (pour le
     regarder, ou l'envoyer à Jinka).

   Publique dans src/proxy.ts (le cron de Vercel n'a pas le cookie du CRM) :
   la serrure est ici, le badge ou CRON_SECRET. */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const parCron = (req: NextRequest) => {
  const s = process.env.CRON_SECRET;
  return !!s && req.headers.get('authorization') === `Bearer ${s}`;
};
const parBadge = (req: NextRequest) => badgeValide(req.cookies.get(COOKIE_BADGE)?.value);

export async function POST(req: NextRequest) {
  if (!(await parBadge(req))) return NextResponse.json({ ok: false, erreur: 'non_autorise' }, { status: 401 });
  let forcer = false;
  try { forcer = !!((await req.json()) as { forcer?: unknown }).forcer; } catch { /* corps vide */ }
  const jinka = await deposerJinka({ forcer });
  if (!jinka.ok) console.error('[portails] Jinka :', jinka.erreur);
  return NextResponse.json({ ok: jinka.ok, jinka });
}

export async function GET(req: NextRequest) {
  if (parCron(req)) {
    const jinka = await deposerJinka({ forcer: true });
    if (!jinka.ok) console.error('[portails] Jinka (nuit) :', jinka.erreur);
    return NextResponse.json({ ok: jinka.ok, jinka });
  }
  if (!(await parBadge(req))) return NextResponse.json({ ok: false, erreur: 'non_autorise' }, { status: 401 });
  const f = await preparerJinka();
  if (req.nextUrl.searchParams.get('fichier') === 'csv') {
    return new Response(new Uint8Array(f.octets), { headers: {
      'Content-Type': 'text/csv; charset=iso-8859-1',
      'Content-Disposition': 'attachment; filename="Annonces.csv"',
      'Cache-Control': 'no-store',
    } });
  }
  const etat = await lireEtatJinka();
  return NextResponse.json({
    ok: true,
    jinka: {
      codes: !!(process.env.JINKA_SFTP_HOTE && process.env.JINKA_SFTP_UTILISATEUR && process.env.JINKA_SFTP_MOT_DE_PASSE),
      annonces: f.ids.length, aJour: etat?.empreinte === f.empreinte, avertissements: f.avertissements,
      biens: f.biens, dernier: etat ? { le: etat.le, annonces: etat.annonces, zip: etat.zip } : null,
    },
  });
}
