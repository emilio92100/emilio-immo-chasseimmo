import { NextRequest, NextResponse } from 'next/server';
import { lienPropre, siteDe } from '@/lib/annonces-client';
import { lireAnnonce } from '@/lib/extraction-annonce';
import { pagePublique } from '@/lib/page-publique';
import { apercuDe, base, ficheNette, limite, rechercheDuJeton, signer } from '@/lib/agences-serveur';

/**
 * Le lien pour les agences (V3.197) : lire l'annonce qu'une agence colle.
 *
 *   POST /api/agences/lire  { token, url }
 *     → { ok, etat: 'ok' | 'partielle' | 'echec', apercu, fiche, signature }
 *
 * La page montre aussitôt ce qui a été lu (« Annonce lue · 3 pièces 52 m² ·
 * 265 000 € · 8 photos ») ; rien n'est enregistré ici. La fiche revient avec
 * l'envoi (api/agences/proposer), signée : on ne relit pas l'annonce.
 *
 * L'adresse vient d'un inconnu : la page est téléchargée par `pagePublique`,
 * qui refuse toute adresse interne. Publique dans src/proxy.ts ; le jeton
 * d'une recherche ouverte fait la serrure.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const token = String(body?.token || '');
    const sb = base();
    const r = await rechercheDuJeton(sb, token);
    if (!r) return NextResponse.json({ ok: false, error: 'lien' }, { status: 401 });
    if (r.ferme) return NextResponse.json({ ok: false, error: 'ferme' }, { status: 410 });
    /* Vingt lectures par quart d'heure et par lien : large pour une agence. */
    if (!limite(`lire:${token}`, 20, 15 * 60_000)) return NextResponse.json({ ok: false, error: 'trop' }, { status: 429 });

    const url = lienPropre(body?.url);
    if (!url) return NextResponse.json({ ok: false, error: 'adresse' }, { status: 400 });

    const lu = await lireAnnonce(url, pagePublique);
    const fiche = ficheNette(lu.bien);
    fiche.url = url;
    fiche.source_portail = siteDe(url)?.nom || 'Agence';
    const utile = !!(fiche.prix_vendeur || fiche.surface || fiche.nb_pieces);
    const etat = lu.partial === false && utile ? 'ok' : utile ? 'partielle' : 'echec';
    if (etat === 'echec') {
      /* Rien de lisible : on ne garde que le lien (le titre deviné de l'adresse ne vaut rien). */
      return NextResponse.json({ ok: true, etat, apercu: null, fiche: null, signature: null });
    }
    return NextResponse.json({ ok: true, etat, apercu: apercuDe(fiche), fiche, signature: signer(token, url, fiche) });
  } catch (e) {
    console.error('[agences/lire]', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: 'erreur' }, { status: 500 });
  }
}
