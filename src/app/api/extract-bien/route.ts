import { NextRequest, NextResponse } from 'next/server';
import { lireAnnonce } from '@/lib/extraction-annonce';

/* V3.186 : la lecture est plus complète (une quarantaine de champs), elle
   prend plus de temps. V3.197 : le moteur est dans src/lib/extraction-annonce.ts
   (le lien pour les agences s'en sert aussi). */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ bien: null, error: 'URL requise' });
    return NextResponse.json(await lireAnnonce(url));
  } catch (e: any) {
    return NextResponse.json({ bien: null, error: e.message });
  }
}
