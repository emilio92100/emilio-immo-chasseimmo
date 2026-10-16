import { NextRequest, NextResponse } from 'next/server';
import { BUCKET_PDF, type PdfAgence } from '@/lib/agences-lien';
import { base } from '@/lib/agences-serveur';
import { lirePdfProposition } from '@/lib/pdf-agence-serveur';

/**
 * Le PDF qu'une agence a déposé, côté CRM (V3.202).
 *
 *   GET  /api/lien-agences/pdf?id=<proposition>  → le PDF (un lien de 10 minutes)
 *   POST /api/lien-agences/pdf { id }            → le relire (« Lire le PDF »)
 *
 * Le PDF dort dans le dossier PRIVÉ `agences-pdf` : seul le serveur (clé
 * service) sait en faire un lien. ⚠️ Route du CRM, protégée par le code
 * d'accès (src/proxy.ts) : elle n'est PAS sous /api/agences/.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const uuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!uuid(id)) return new NextResponse('Ce PDF est introuvable.', { status: 400 });
  const sb = base();
  const { data, error } = await sb.from('propositions_agences').select('pdf').eq('id', id).maybeSingle();
  const pdf = ((data as { pdf?: PdfAgence | null } | null)?.pdf) || null;
  if (error || !pdf?.chemin) return new NextResponse('Ce PDF est introuvable.', { status: 404 });
  const { data: s, error: e2 } = await sb.storage.from(BUCKET_PDF).createSignedUrl(pdf.chemin, 600);
  if (e2 || !s?.signedUrl) return new NextResponse(`Le PDF n’a pas pu être ouvert : ${e2?.message || 'pas de lien'}`, { status: 502 });
  return NextResponse.redirect(s.signedUrl, 302);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { id?: string } | null;
  const id = String(body?.id || '');
  if (!uuid(id)) return NextResponse.json({ ok: false, erreur: 'La proposition manque.' }, { status: 400 });
  /* La lecture seule : l'analyse, le CRM la lance ensuite (60 s ne suffisent pas toujours aux deux). */
  const r = await lirePdfProposition(base(), id, { analyser: false });
  if (!r.ok) return NextResponse.json({ ok: false, erreur: r.erreur }, { status: 500 });
  return NextResponse.json({ ok: true, lecture: r.lecture });
}
