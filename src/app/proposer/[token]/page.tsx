import type { Metadata, Viewport } from 'next';
import PageAgence from '@/components/agences/PageAgence';
import { resumePourAgence } from '@/lib/agences-lien';
import { base, rechercheDuJeton } from '@/lib/agences-serveur';

/**
 * Le lien pour les agences : espace.emilio-immo.com/proposer/<jeton> (V3.197).
 *
 * Une agence y propose un bien pour un client d'Alexandre. Elle voit un
 * résumé SANS NOM de la recherche (src/lib/agences-lien.ts). Publique dans
 * src/proxy.ts ; la base se lit ici, côté serveur, avec la clé service
 * (AGENTS.md §3.4). Un lien coupé, ou un dossier fermé : la page le dit.
 */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Proposer un bien — Emilio Immobilier',
  description: 'Proposez un bien à Alexandre Rogelet pour son client.',
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: '/logos/e-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/logos/e-180.png', sizes: '180x180' }],
  },
};
export const viewport: Viewport = { themeColor: '#22497D' };

export default async function PageProposer({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await rechercheDuJeton(base(), token).catch(() => null);
  if (!r) return <PageAgence etat="inconnu" />;
  if (r.ferme) return <PageAgence etat="ferme" />;
  return <PageAgence etat="ouvert" token={token} resume={resumePourAgence(r.recherche)} />;
}
