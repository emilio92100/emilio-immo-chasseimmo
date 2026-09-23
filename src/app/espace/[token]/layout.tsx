import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { HOTE_ESPACE } from '@/lib/jeton';

/**
 * L'enveloppe de l'espace acheteur.
 *
 * Elle n'ajoute rien à l'écran : elle sert à ce que le téléphone comprenne
 * qu'il a affaire à une application, et non à une page web de plus.
 *
 *   — le manifeste du dossier (l'icône, le nom, la page à rouvrir) ;
 *   — l'icône de l'iPhone, qui ne lit pas le manifeste sur les vieux modèles ;
 *   — la couleur de la barre du haut, en bleu maison plutôt qu'en blanc ;
 *   — l'interdiction d'indexation : un espace privé n'a rien à faire dans Google.
 */

export const viewport: Viewport = {
  themeColor: '#1a2332',
};

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> },
): Promise<Metadata> {
  const { token } = await params;

  /* Le manifeste doit être demandé sur la même adresse que celle qu'affiche le
     navigateur, sinon le téléphone enregistre un raccourci vers l'autre. */
  const entetes = await headers();
  const hote = (entetes.get('host') || '').toLowerCase().split(':')[0];
  const racine = hote === HOTE_ESPACE ? `/${token}` : `/espace/${token}`;

  return {
    title: 'Ma recherche — Emilio Immobilier',
    description: 'Les biens retenus pour vous, vos critères et vos visites.',
    manifest: `${racine}/manifeste`,
    appleWebApp: {
      capable: true,
      /* Le nom sous l'icône, sur l'écran d'accueil. Il tient en douze
         caractères sur Android — au-delà, le téléphone coupe. */
      title: 'Ma recherche',
      /* « default » et non « black-translucent » : la page garde sa place sous
         l'heure et la batterie, au lieu de passer dessous. */
      statusBarStyle: 'default',
    },
    /* La même épingle dans l'onglet du navigateur : le client retrouve son
       espace parmi ses onglets ouverts. Le CRM, lui, garde son « EI ». */
    icons: {
      icon: [{ url: '/icone?t=192', sizes: '192x192', type: 'image/png' }],
      apple: [{ url: '/icone?t=180', sizes: '180x180' }],
    },
    robots: { index: false, follow: false },
  };
}

export default function DispositionEspace({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
