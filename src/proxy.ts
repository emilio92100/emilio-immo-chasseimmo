import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIE_BADGE, badgeValide } from '@/lib/badge';

/**
 * Portail d'accès au CRM.
 *
 * Next 16 : ce fichier s'appelle proxy.ts (ex-middleware.ts).
 * Il doit être placé dans src/, au même niveau que le dossier app/.
 *
 * Tout est protégé SAUF :
 *  - /login et /api/login          (sinon on boucle)
 *  - /bien/...                     (fiches publiques envoyées aux clients)
 *  - /espace/...                   (l'espace acheteur, protégé par son propre lien)
 *  - /api/espace/...               (ce que cet espace écrit : chaque route vérifie le lien)
 *  - /api/point-auto/envoi         (l'envoi quotidien, appelé par Vercel : protégé par CRON_SECRET)
 *  - /api/mandat/relances          (les rappels aux co-signataires, idem : CRON_SECRET)
 *  - /signer/... et /api/signer     (le lien personnel d'un co-signataire : protégé par son jeton)
 *  - les fichiers statiques
 */

const COOKIE = COOKIE_BADGE;

// Chemins accessibles sans code
/* /api/point-auto/envoi : l'envoi quotidien du point automatique, appelé par
   Vercel qui n'a pas le cookie. Sa serrure à lui, c'est CRON_SECRET. */
const PUBLIC_PATHS = ['/login', '/api/login', '/api/point-auto/envoi', '/api/mandat/relances', '/api/signer'];
const PUBLIC_PREFIXES = ['/bien/', '/espace/', '/api/espace/', '/signer/'];

/* Le sous-domaine de l'espace acheteur. Tout le monde vit sur le même projet
   Vercel : c'est le nom d'hôte qui décide de ce qu'on sert. */
const HOTE_ESPACE = 'espace.emilio-immo.com';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /* 0. Les liens courts.
   *
   *    Le client reçoit espace.emilio-immo.com/dupont-k3n8vq2fab, quarante
   *    caractères au lieu de cent cinq. Ce chemin-là n'existe pas dans
   *    l'application : on le réécrit en /espace/<jeton>, sans redirection —
   *    l'adresse courte reste affichée dans son navigateur, c'est tout
   *    l'intérêt.
   *
   *    Réécrire, pas rediriger : une redirection ferait clignoter la longue
   *    adresse dans la barre, et c'est précisément ce qu'on veut lui épargner.
   */
  const hote = (request.headers.get('host') || '').toLowerCase().split(':')[0];
  if (hote === HOTE_ESPACE) {
    /* Une adresse sans jeton ne mène nulle part : on renvoie vers le site. */
    if (pathname === '/') {
      return NextResponse.redirect('https://www.emilio-immo.com');
    }
    /* Ce qui porte déjà son vrai chemin, ce qui sert l'application, et tout
       fichier reconnaissable à son extension passent sans être touchés. */
    const technique =
      pathname.startsWith('/espace/') ||
      /* La fiche publique d'un bien vit aussi sur ce domaine : c'est l'adresse
         qu'un client envoie à un proche quand il partage un bien. Sans cette
         ligne, /bien/<id> était réécrit en /espace/bien/<id> et ne menait
         nulle part — et les liens partaient donc sur l'adresse Vercel. */
      pathname.startsWith('/bien/') ||
      /* Le lien personnel d'un co-signataire (conjoint, co-acquéreur) :
         espace.emilio-immo.com/signer/<jeton>. */
      pathname.startsWith('/signer/') ||
      pathname.startsWith('/api/') ||
      pathname.startsWith('/_next/') ||
      /\.[a-z0-9]+$/i.test(pathname);
    if (!technique) {
      const url = request.nextUrl.clone();
      url.pathname = `/espace${pathname}`;
      return NextResponse.rewrite(url);
    }
  }

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

  // 3. Le badge posé par /api/login : signé, daté (src/lib/badge.ts, V3.33)
  if (await badgeValide(request.cookies.get(COOKIE)?.value)) return NextResponse.next();

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

/*
 * ⚠️ Les fichiers du dossier public/ doivent être exclus, eux aussi.
 *
 * Sans ça, le logo ne s'affiche nulle part sur les pages publiques : quand
 * next/image optimise /logo_high_resolution_white.png, il va le rechercher par
 * une requête HTTP sur le site lui-même — requête qui repasse ici, sans
 * cookie, et qui est redirigée vers /login. L'optimiseur reçoit une page HTML
 * au lieu d'une image, et l'image reste vide.
 *
 * /icone en fait partie, pour la même raison : c'est l'icône que le client pose
 * sur son écran d'accueil. Si elle passait par le portail, son téléphone
 * recevrait la page de connexion à la place de l'image, et afficherait un carré
 * gris à la place du logo.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon|icone|apple-icon|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|bmp|pdf|txt|xml|json|webmanifest|css|js|map|woff|woff2|ttf|otf|eot|mp4|webm)$).*)',
  ],
};
