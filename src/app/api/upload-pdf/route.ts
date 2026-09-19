import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Dépôt d'une fiche PDF client.
 *
 * Le navigateur n'a pas le droit d'écrire dans le Storage (politique RLS sur
 * les fichiers) : c'est cette route, côté serveur, qui le fait avec la clé
 * SERVICE. Elle est protégée par le code d'accès comme le reste du CRM
 * (voir src/proxy.ts).
 *
 * POST { bien_id, base64, nom?, message? }  →  { ok, url }
 */

export const maxDuration = 60;

const BUCKET = 'photos-biens';

export async function POST(req: NextRequest) {
  try {
    const { bien_id, base64, nom, message } = await req.json();

    if (!bien_id || !base64) {
      return NextResponse.json({ ok: false, error: 'bien_id et base64 sont obligatoires' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return NextResponse.json({ ok: false, error: 'Variables Supabase manquantes' }, { status: 500 });
    }
    const supabase = createClient(url, serviceKey);

    const octets = Buffer.from(String(base64), 'base64');
    if (!octets.length) {
      return NextResponse.json({ ok: false, error: 'PDF vide' }, { status: 400 });
    }

    const nomPropre = String(nom || 'fiche.pdf')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .slice(0, 120);
    const chemin = `pdf/${bien_id}/${Date.now()}-${nomPropre}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(chemin, octets, { contentType: 'application/pdf', upsert: true });

    if (error) {
      await supabase.from('biens')
        .update({ pdf_statut: 'echec', pdf_message: error.message })
        .eq('id', bien_id);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(chemin);

    const { error: majErr } = await supabase.from('biens').update({
      pdf_statut: 'pret',
      pdf_pret_le: new Date().toISOString(),
      pdf_url: pub.publicUrl,
      pdf_message: message || null,
    }).eq('id', bien_id);

    if (majErr) {
      return NextResponse.json({ ok: false, error: majErr.message, url: pub.publicUrl }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url: pub.publicUrl, octets: octets.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
