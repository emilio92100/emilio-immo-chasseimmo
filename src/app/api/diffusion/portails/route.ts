import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_BADGE, badgeValide } from '@/lib/badge';
import { deposerJinka, lireEtatJinka, preparerJinka } from '@/lib/jinka-serveur';
import { codesSeLoger, deposerSeLoger, environnementSeLoger, lireEtatSeLoger, preparerSeLoger, statutsSeLoger } from '@/lib/seloger-serveur';

/* ═══ Envoyer les annonces aux portails (V3.97 : Jinka ; V3.98 : SeLoger) ══
   POST (le CRM, derrière le badge) → { jinka, seloger }
     Le CRM l'appelle quand quelque chose change (components/layout/
     EnvoiPortails.tsx) : Jinka ne reçoit un nouveau fichier que s'il a
     changé ; SeLoger ne reçoit que les annonces qui ont changé.
     { forcer: true } renvoie tout, même sans changement.
   GET avec l'en-tête du cron de Vercel (CRON_SECRET) → la nuit, par
     sécurité : le fichier complet chez Jinka, et les écarts chez SeLoger.
   GET derrière le badge → l'état des deux, et ce que contiendrait le
     prochain envoi ;
       `?fichier=csv`      Annonces.csv de Jinka, à télécharger ;
       `?seloger=annonces` les annonces SeLoger telles qu'envoyées (JSON) ;
       `?seloger=statuts`  où en est chaque annonce chez SeLoger.

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

/* Les deux envois, côte à côte : l'un qui échoue n'empêche pas l'autre. */
async function envoyer(forcerJinka: boolean, forcerSeLoger: boolean) {
  const [jinka, seloger] = await Promise.all([
    deposerJinka({ forcer: forcerJinka }).catch(e => ({ ok: false, erreur: (e as Error).message, annonces: 0, avertissements: [], etat: null })),
    deposerSeLoger({ forcer: forcerSeLoger }).catch(e => ({ ok: false, erreur: (e as Error).message, env: environnementSeLoger(), annonces: 0, crees: 0, modifies: 0, retires: 0, erreurs: [], avertissements: [] })),
  ]);
  if (!jinka.ok) console.error('[portails] Jinka :', jinka.erreur);
  if (!seloger.ok) console.error('[portails] SeLoger :', seloger.erreur);
  return { ok: jinka.ok && seloger.ok, jinka, seloger };
}

export async function POST(req: NextRequest) {
  if (!(await parBadge(req))) return NextResponse.json({ ok: false, erreur: 'non_autorise' }, { status: 401 });
  let forcer = false;
  try { forcer = !!((await req.json()) as { forcer?: unknown }).forcer; } catch { /* corps vide */ }
  return NextResponse.json(await envoyer(forcer, forcer));
}

export async function GET(req: NextRequest) {
  /* La nuit : Jinka reçoit tout (il retire ce qui manque) ; SeLoger, seulement
     ce qui a changé — le renvoyer en entier chaque nuit ne servirait à rien. */
  if (parCron(req)) return NextResponse.json(await envoyer(true, false));
  if (!(await parBadge(req))) return NextResponse.json({ ok: false, erreur: 'non_autorise' }, { status: 401 });

  const q = req.nextUrl.searchParams;
  if (q.get('fichier') === 'csv') {
    const f = await preparerJinka();
    return new Response(new Uint8Array(f.octets), { headers: {
      'Content-Type': 'text/csv; charset=iso-8859-1',
      'Content-Disposition': 'attachment; filename="Annonces.csv"',
      'Cache-Control': 'no-store',
    } });
  }
  if (q.get('seloger') === 'annonces') {
    const lot = await preparerSeLoger();
    return NextResponse.json({ ok: true, env: environnementSeLoger(), annonces: lot.annonces, avertissements: lot.avertissements });
  }
  if (q.get('seloger') === 'statuts') return NextResponse.json(await statutsSeLoger());

  const [f, etat, lot, etatSL] = await Promise.all([preparerJinka(), lireEtatJinka(), preparerSeLoger(), lireEtatSeLoger()]);
  return NextResponse.json({
    ok: true,
    jinka: {
      codes: !!(process.env.JINKA_SFTP_HOTE && process.env.JINKA_SFTP_UTILISATEUR && process.env.JINKA_SFTP_MOT_DE_PASSE),
      annonces: f.ids.length, aJour: etat?.empreinte === f.empreinte, avertissements: f.avertissements,
      biens: f.biens, dernier: etat ? { le: etat.le, annonces: etat.annonces, zip: etat.zip } : null,
    },
    seloger: {
      codes: codesSeLoger(), env: environnementSeLoger(),
      annonces: lot.annonces.length,
      aEnvoyer: lot.annonces.filter(x => etatSL.annonces[x.id]?.empreinte !== lot.empreintes.get(x.id)).length,
      enLigne: Object.keys(etatSL.annonces).length,
      avertissements: lot.avertissements,
      biens: lot.annonces.map(x => ({ id: x.bienId, reference: x.reference, seloger: x.id, portails: x.portails, classifiedId: etatSL.annonces[x.id]?.classifiedId || null })),
      dernier: etatSL.dernier || null,
    },
  });
}
