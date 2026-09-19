import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Portail d'accès au CRM.
 *
 * Next 16 : ce fichier s'appelle proxy.ts (ex-middleware.ts).
 * Il doit être placé dans src/, au même niveau que le dossier app/.
 *
 * Tout est protégé SAUF :
 *  - /login et /api/login          (sinon on boucle)
 *  - /bien/...                     (fiches publiques envoyées aux clients)
 *  - les fichiers statiques
 */

const COOKIE = 'emilio_acces';

// Chemins accessibles sans code
const PUBLIC_PATHS = ['/login', '/api/login'];
const PUBLIC_PREFIXES = ['/bien/'];

async function sha256(texte: string): Promise<string> {
  const data = new TextEncoder().encode(texte);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Chemins publics
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // 2. Le code doit être configuré côté serveur
  const code = process.env.EMILIO_ACCESS_CODE;
  if (!code) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '?erreur=config';
    return NextResponse.redirect(url);
  }

  // 3. Comparaison du cookie avec l'empreinte du code
  const attendu = await sha256(code);
  const recu = request.cookies.get(COOKIE)?.value;

  if (recu && recu.length === attendu.length) {
    // comparaison à temps constant
    let diff = 0;
    for (let i = 0; i < attendu.length; i++) {
      diff |= attendu.charCodeAt(i) ^ recu.charCodeAt(i);
    }
    if (diff === 0) return NextResponse.next();
  }

  // 4. Accès refusé
  //    Les routes API répondent 401 ; les pages redirigent vers /login.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname !== '/' ? `?suite=${encodeURIComponent(pathname)}` : '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|robots.txt|sitemap.xml).*)'],
};
