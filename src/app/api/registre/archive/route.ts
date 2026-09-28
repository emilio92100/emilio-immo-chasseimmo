import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { archiverRegistre } from '@/lib/registre-archive';

/* ═══ L'archive du registre, à la demande (V3.18) ═══════════════════════
   Depuis Documents › Registre des mandats : « M'envoyer l'archive ». Route
   du CRM (protégée par le cookie, voir src/proxy.ts), qui lit le registre
   avec la clé du serveur. Le 1er du mois, la même chose part toute seule
   (voir /api/mandat/relances). */
export async function POST() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  try {
    const r = await archiverRegistre(sb);
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ ok: false, erreur: (e as Error).message }, { status: 500 });
  }
}
