import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { HOTE_ESPACE } from '@/lib/jeton';

/**
 * La carte d'identité de l'espace, lue par le téléphone au moment où le client
 * l'ajoute à son écran d'accueil.
 *
 * Elle est faite sur mesure pour chaque dossier : c'est elle qui dit au
 * téléphone quelle page ouvrir quand on tape l'icône. Un manifeste commun
 * ramènerait tout le monde à la racine du site — donc nulle part.
 *
 * Les deux adresses de l'espace cohabitent, et le manifeste suit celle par
 * laquelle le client est arrivé :
 *   espace.emilio-immo.com/dupont-k3n8vq2fab   →  start_url  /dupont-k3n8vq2fab
 *   <le site>/espace/<les 64 caractères>       →  start_url  /espace/<jeton>
 */

export const dynamic = 'force-dynamic';

export async function GET(
  requete: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const hote = (requete.headers.get('host') || '').toLowerCase().split(':')[0];
  const court = hote === HOTE_ESPACE;
  const racine = court ? `/${token}` : `/espace/${token}`;

  const manifeste = {
    name: 'Ma recherche — Emilio Immobilier',
    /* Le nom sous l'icône : douze caractères, pas plus, sinon le téléphone le
       coupe au milieu d'un mot. */
    short_name: 'Ma recherche',
    description: 'Les biens retenus pour vous, vos critères et vos visites.',
    lang: 'fr',
    dir: 'ltr',
    /* Le client retombe sur SON espace, déjà identifié : le lien est le mot de
       passe, et il est ici, rangé dans l'icône. */
    start_url: `${racine}?depuis=accueil`,
    scope: court ? '/' : '/espace/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f4f6fa',
    theme_color: '#1a2332',
    icons: [
      { src: '/icone?t=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icone?t=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      /* Android découpe l'icône en rond : il lui faut une version prévue pour. */
      { src: '/icone?t=512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  return NextResponse.json(manifeste, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      /* Le jeton est dedans : ce fichier ne doit dormir dans aucun cache
         partagé, seulement dans le téléphone du client. */
      'Cache-Control': 'private, no-store',
    },
  });
}
