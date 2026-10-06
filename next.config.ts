import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* La version de cette mise en ligne, gravée dans le code à la
     construction (le commit sur Vercel). Le CRM la compare à celle du
     serveur pour proposer « Recharger » après une mise en ligne : un
     téléphone gardait sinon l'ancienne version des heures (voir
     src/components/layout/NouvelleVersion.tsx). */
  env: {
    EMI_VERSION: process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`,
  },
  /* V3.97 : le dépôt SFTP chez Jinka (lib/jinka-serveur.ts) passe par ssh2,
     qui charge des modules natifs facultatifs : on le laisse à Node plutôt
     que de l'empaqueter. */
  serverExternalPackages: ['ssh2', 'ssh2-sftp-client'],
  /* V3.33 : trois en-têtes de sécurité sur toutes les pages.
     · aucune page (le CRM, l'espace, la signature) ne peut être affichée
       dans le cadre d'un autre site : on ne peut plus faire cliquer un
       client sur « Je signe » à travers une page piégée ;
     · le navigateur ne devine pas le type d'un fichier ;
     · une adresse qui porte un lien personnel (/espace/<jeton>) ne part
       pas en entier chez les sites qu'on ouvre depuis la page. */
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};

export default nextConfig;
