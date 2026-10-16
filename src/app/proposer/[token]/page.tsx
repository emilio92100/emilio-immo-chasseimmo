import type { Metadata, Viewport } from 'next';
import PageAgence from '@/components/agences/PageAgence';
import { resumePourAgence } from '@/lib/agences-lien';
import { codeValide } from '@/lib/agences-lien';
import { base, envoiDuCode, rechercheDuJeton } from '@/lib/agences-serveur';

/**
 * Le lien pour les agences : espace.emilio-immo.com/proposer/<jeton> (V3.197).
 *
 * Une agence y propose un bien pour un client d'Alexandre. Elle voit un
 * résumé SANS NOM de la recherche (src/lib/agences-lien.ts). Publique dans
 * src/proxy.ts ; la base se lit ici, côté serveur, avec la clé service
 * (AGENTS.md §3.4). Un lien coupé, ou un dossier fermé : la page le dit.
 *
 * V3.202 — `?de=<code>` : le lien qu'Alexandre a envoyé à une personne
 * précise depuis le CRM. Ce qu'il a noté d'elle (agence, nom, portable,
 * mail) remplit « Vous » ; un code inconnu ne change rien.
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

export default async function PageProposer({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, q] = await Promise.all([params, searchParams]);
  const sb = base();
  const r = await rechercheDuJeton(sb, token).catch(() => null);
  if (!r) return <PageAgence etat="inconnu" />;
  if (r.ferme) return <PageAgence etat="ferme" />;
  const code = typeof q.de === 'string' && codeValide(q.de) ? q.de : null;
  const e = code ? await envoiDuCode(sb, r.recherche.id as string, code).catch(() => null) : null;
  const repris = e ? { agence: e.agence, interlocuteur: e.interlocuteur, tel: e.tel, email: e.email } : null;
  return <PageAgence etat="ouvert" token={token} resume={resumePourAgence(r.recherche)} repris={repris} code={e ? code : null} />;
}
