import { NextResponse } from 'next/server';

/**
 * L'icône de l'espace acheteur, celle qui se pose sur l'écran d'accueil du
 * client (V3.29) : le « E » d'Emilio, blanc sur le bleu de l'agence.
 *
 * Les images sont rangées dans public/logos/ (les originaux d'Alexandre y
 * sont aussi). Le manifeste et l'enveloppe de l'espace y pointent
 * directement ; cette adresse reste pour ce qui la connaît déjà — les
 * notifications (public/sw.js) et les icônes posées avant la V3.29 :
 *   /icone?t=180           l'iPhone (apple-touch-icon)
 *   /icone?t=192           Android, dans la liste des applications
 *   /icone?t=512           Android, l'écran d'ouverture
 *   /icone?t=96&mono=1     la silhouette de la barre d'état d'Android : le E
 *                          seul, sans fond (Android ne garde que la forme)
 *
 * ⚠️ Ce chemin est volontairement hors du portail d'accès (voir le matcher de
 * src/proxy.ts) : une icône doit rester publique, sinon le téléphone reçoit la
 * page de connexion à la place de l'image, et l'écran d'accueil affiche un
 * carré gris.
 */

export function GET(requete: Request) {
  const params = new URL(requete.url).searchParams;
  const t = Number(params.get('t'));
  const fichier = params.get('mono') === '1' ? 'e-silhouette-96.png'
    : t === 180 ? 'e-180.png'
      : t === 192 || t === 96 ? 'e-192.png'
        : 'e-512.png';
  return NextResponse.redirect(new URL(`/logos/${fichier}`, requete.url), 307);
}
