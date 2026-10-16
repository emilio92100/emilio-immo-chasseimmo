import { NextRequest, NextResponse } from 'next/server';
import { BUCKET_PDF, PDF_MAX } from '@/lib/agences-lien';
import { base, limite, rechercheDuJeton } from '@/lib/agences-serveur';

/**
 * Le PDF d'une agence (V3.202) : où le déposer.
 *
 *   POST /api/agences/pdf  { token, taille } → { ok, chemin, url } | { ok: false, error }
 *
 * Rend un lien d'envoi signé (2 heures) vers le dossier PRIVÉ `agences-pdf`,
 * sous <recherche>/<uuid>.pdf : la page envoie le PDF tout droit à Supabase
 * (Vercel refuse plus de 4,5 Mo par requête), puis api/agences/proposer
 * vérifie qu'il est arrivé. 20 Mo au plus.
 *
 * Publique (src/proxy.ts, /api/agences/) : le jeton d'une recherche ouverte
 * fait la serrure, comme pour proposer.
 */

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const token = String(body?.token || '');
    const taille = Number(body?.taille) || 0;
    const sb = base();
    const r = await rechercheDuJeton(sb, token);
    if (!r) return NextResponse.json({ ok: false, error: 'lien' }, { status: 401 });
    if (r.ferme) return NextResponse.json({ ok: false, error: 'ferme' }, { status: 410 });
    if (!limite(`pdf:${token}`, 20, 15 * 60_000)) return NextResponse.json({ ok: false, error: 'trop' }, { status: 429 });
    if (taille <= 0) return NextResponse.json({ ok: false, error: 'pdf' }, { status: 400 });
    if (taille > PDF_MAX) return NextResponse.json({ ok: false, error: 'pdf_lourd' }, { status: 413 });

    const chemin = `${r.recherche.id}/${crypto.randomUUID()}.pdf`;
    const { data, error } = await sb.storage.from(BUCKET_PDF).createSignedUploadUrl(chemin);
    if (error || !data?.signedUrl) {
      console.error('[agences/pdf]', error?.message || 'pas de lien');
      /* Le dossier n'existe pas encore (SQL pas passé) : on le dit. */
      const absent = /bucket|not.?found/i.test(error?.message || '');
      return NextResponse.json({ ok: false, error: absent ? 'pdf_indisponible' : 'pdf' }, { status: absent ? 503 : 500 });
    }
    return NextResponse.json({ ok: true, chemin, url: data.signedUrl });
  } catch (e) {
    console.error('[agences/pdf]', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: 'pdf' }, { status: 500 });
  }
}
