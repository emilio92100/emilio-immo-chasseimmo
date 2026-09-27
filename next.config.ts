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
};

export default nextConfig;
