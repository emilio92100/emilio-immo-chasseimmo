import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { HOTE_ESPACE } from '@/lib/jeton';
import { ouvrirEspace } from '@/lib/espace';

/**
 * La carte d'identité de l'espace, lue par le téléphone au moment où le client
 * l'ajoute à son écran d'accueil.
 *
 * Elle est faite sur mesure pour chaque dossier : c'est elle qui dit au
 * téléphone quelle page ouvrir quand on tape l'icône. Un manifeste commun
 * ramènerait tout le monde à la racine du site — donc nulle part.
 *
 * ⚠️ C'est le lien du CLIENT qui part dans `start_url`, jamais celui d'une
 * recherche. L'icône posée sur l'écran d'accueil doit survivre à la fin
 * d'une recherche : le jour où Alexandre en supprime une, le client rouvre
 * son espace et tombe sur celle qui reste.
 *
 * Les deux adresses de l'espace cohabitent, et le manifeste suit celle par
 * laquelle le client est arrivé :
 *   espace.emilio-immo.com/dupont-k3n8vq2fab   →  start_url  /dupont-k3n8vq2fab
 *   <le site>/espace/<les 64 caractères>       →  start_url  /espace/<jeton>
 */

export const dynamic = 'force-dynamic';

function base() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function GET(
  requete: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  /* Si le client est arrivé par une ancienne adresse de recherche, on pose
     quand même son lien permanent dans le raccourci : l'application qu'il
     installe aujourd'hui ne dépendra pas d'une recherche en particulier. */
  let jeton = token;
  try {
    const espace = await ouvrirEspace(base(), token);
    if (espace?.jetonClient) jeton = espace.jetonClient;
  } catch { /* le manifeste ne doit jamais empêcher l'installation */ }

  const hote = (requete.headers.get('host') || '').toLowerCase().split(':')[0];
  const court = hote === HOTE_ESPACE;
  const racine = court ? `/${jeton}` : `/espace/${jeton}`;

  const manifeste = {
    /* Court, parce que c'est ce mot-là qu'Android affiche en grand sur l'écran
       d'ouverture, et sous l'icône : au-delà de douze caractères, il coupe.
       « Ma recherche » les fait pile — et c'est le mot du métier, celui que le
       client emploie lui-même. Un client qui en aurait deux ne s'y trompe pas :
       c'est le sélecteur, à l'intérieur, qui dit laquelle il regarde. */
    name: 'Ma recherche',
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
    /* La couleur de l'écran d'ouverture d'Android. Elle est volontairement la
       même que celle de l'écran de chargement (voir loading.tsx) : le passage
       de l'un à l'autre devient invisible, et l'ouverture paraît immédiate. */
    background_color: '#1a2332',
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
