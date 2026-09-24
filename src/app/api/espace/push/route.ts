import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * L'abonnement aux notifications, côté client.
 *
 *   POST { token, abonnement }   le client accepte d'être prévenu
 *   POST { token, retirer: true, endpoint }   il ne veut plus
 *
 * Comme le reste de /api/espace/, la route est publique et c'est le lien qui
 * fait la serrure : sans le bon jeton, on n'enregistre rien.
 */

export const dynamic = 'force-dynamic';

function base() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body?.token === 'string' ? body.token : '';
    if (!token || token.length < 12 || token.length > 128) {
      return NextResponse.json({ ok: false, error: 'lien invalide' }, { status: 401 });
    }

    const supabase = base();

    const { data: recherche } = await supabase
      .from('recherches')
      .select('id, client_id, espace_actif')
      .eq('token_espace', token)
      .maybeSingle();

    if (!recherche || recherche.espace_actif === false) {
      return NextResponse.json({ ok: false, error: 'lien invalide' }, { status: 401 });
    }

    /* ── il se désabonne ── */
    if (body?.retirer) {
      const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
      if (endpoint) {
        await supabase.from('push_abonnements').delete()
          .eq('endpoint', endpoint).eq('recherche_id', recherche.id);
      }
      return NextResponse.json({ ok: true });
    }

    /* ── il s'abonne ── */
    const ab = body?.abonnement;
    const endpoint = typeof ab?.endpoint === 'string' ? ab.endpoint : '';
    if (!endpoint || !endpoint.startsWith('https://')) {
      return NextResponse.json({ ok: false, error: 'abonnement invalide' }, { status: 400 });
    }

    /* Cet appareil était-il déjà inscrit ? L'espace réinscrit l'appareil à
       CHAQUE ouverture quand les notifications sont déjà autorisées (c'est
       voulu : ça répare un abonnement perdu). Mais le dossier ne doit dire
       « a activé les notifications » qu'une fois, la vraie. */
    const { data: deja } = await supabase.from('push_abonnements')
      .select('endpoint').eq('endpoint', endpoint).maybeSingle();

    /* Un appareil qui se réabonne ne doit pas créer une deuxième ligne : on
       écrase la précédente. L'unicité de l'endpoint garantit le reste. */
    await supabase.from('push_abonnements').upsert({
      recherche_id: recherche.id,
      client_id: recherche.client_id,
      endpoint,
      p256dh: ab?.keys?.p256dh || null,
      auth: ab?.keys?.auth || null,
      appareil: String(req.headers.get('user-agent') || '').slice(0, 300),
      echecs: 0,
    }, { onConflict: 'endpoint' });

    /* Pour qu'Alexandre voie dans le dossier que le client a activé les
       notifications — c'est un signal d'engagement, pas un détail technique. */
    if (!deja) {
      try {
        await supabase.from('espace_evenements').insert({
          recherche_id: recherche.id, client_id: recherche.client_id,
          type: 'notifications', detail: 'Le client a activé les notifications',
        });
      } catch { /* le journal ne doit jamais faire échouer l'abonnement */ }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
