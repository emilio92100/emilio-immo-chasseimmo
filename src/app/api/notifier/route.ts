import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { reveiller, pushConfigure } from '@/lib/push';

/**
 * « Préviens le client, un bien vient de partir. »
 *
 * Appelée par le CRM au moment où un bien passe en « Présentés ». Elle n'est
 * PAS sous /api/espace/ — et c'est volontaire : /api/espace/ est public, alors
 * qu'ici seul Alexandre doit pouvoir déclencher un envoi. Le portail (voir
 * src/proxy.ts) exige donc le cookie d'accès au CRM.
 *
 * Elle ne dit pas quoi afficher : le texte est calculé au dernier moment par
 * /api/espace/push/contenu, juste avant que la notification apparaisse.
 *
 * Elle ne fait jamais échouer l'envoi du bien : si les clés manquent, si le
 * client n'a pas activé les notifications, si Apple répond mal — on répond
 * quand même, et le CRM continue son chemin.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function base() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    if (!pushConfigure()) {
      return NextResponse.json({ ok: true, prevenus: 0, raison: 'clés VAPID absentes' });
    }

    const { recherche_id } = await req.json();
    if (typeof recherche_id !== 'string' || !recherche_id) {
      return NextResponse.json({ ok: false, error: 'recherche_id manquant' }, { status: 400 });
    }

    const supabase = base();

    /* ⚠️ On réveille les appareils DU CLIENT, pas ceux d'une recherche.
       Depuis que l'espace appartient au client (voir src/lib/espace.ts), il
       n'installe qu'une seule application pour tout son dossier : elle est
       enregistrée sous la recherche qu'il regardait ce jour-là. Chercher par
       recherche_id ne préviendrait donc personne pour la deuxième recherche.
       Le texte de la notification, lui, est calculé au dernier moment par
       /api/espace/push/contenu, qui regarde tout le dossier. */
    const { data: recherche } = await supabase
      .from('recherches').select('client_id').eq('id', recherche_id).maybeSingle();
    if (!recherche?.client_id) return NextResponse.json({ ok: true, prevenus: 0 });

    const { data: abonnements } = await supabase
      .from('push_abonnements').select('id, endpoint').eq('client_id', recherche.client_id);

    const liste = abonnements || [];
    if (liste.length === 0) return NextResponse.json({ ok: true, prevenus: 0 });

    /* Tous les appareils en même temps : le client a souvent son téléphone et
       son ordinateur, parfois son conjoint en plus. */
    const resultats = await Promise.all(liste.map(async (a) => ({
      id: a.id, etat: await reveiller(a.endpoint),
    })));

    /* Un appareil « périmé » est un espace désinstallé ou un navigateur
       réinitialisé : sa ligne ne servira plus jamais, on l'efface au passage
       plutôt que de réessayer tous les jours. */
    const perimes = resultats.filter((r) => r.etat === 'perime').map((r) => r.id);
    if (perimes.length) {
      await supabase.from('push_abonnements').delete().in('id', perimes);
    }

    const ok = resultats.filter((r) => r.etat === 'ok');
    if (ok.length) {
      await supabase.from('push_abonnements')
        .update({ dernier_ok: new Date().toISOString(), echecs: 0 })
        .in('id', ok.map((r) => r.id));
    }

    return NextResponse.json({
      ok: true,
      prevenus: ok.length,
      perimes: perimes.length,
      echecs: resultats.filter((r) => r.etat === 'erreur').length,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
