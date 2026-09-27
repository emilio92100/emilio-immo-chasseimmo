'use client';
import { useEffect, useState } from 'react';
import styles from './AppLayout.module.css';

/* ═══ « Une nouvelle version du CRM est prête » ═══════════════════════════
   Un onglet, ou l'application posée sur l'écran d'accueil du téléphone, ne
   se recharge pas tout seul après une mise en ligne : Alexandre voyait
   l'ancienne fenêtre « Nouveau client » alors que la nouvelle était en
   ligne. On compare la version de ce code (gravée à la construction, voir
   next.config.ts) à celle du serveur : au retour sur l'onglet, et toutes les
   dix minutes. Différentes : un bandeau propose de recharger. */

const ICI = process.env.EMI_VERSION || '';

export default function NouvelleVersion() {
  const [prete, setPrete] = useState(false);
  useEffect(() => {
    if (!ICI) return;
    let vivant = true;
    const verifier = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (vivant && typeof j.v === 'string' && j.v && j.v !== ICI) setPrete(true);
      } catch { /* hors ligne : on réessaiera */ }
    };
    const t0 = setTimeout(verifier, 4000);
    const tous = setInterval(verifier, 10 * 60 * 1000);
    document.addEventListener('visibilitychange', verifier);
    window.addEventListener('focus', verifier);
    return () => {
      vivant = false;
      clearTimeout(t0); clearInterval(tous);
      document.removeEventListener('visibilitychange', verifier);
      window.removeEventListener('focus', verifier);
    };
  }, []);
  if (!prete) return null;
  return (
    <div className={styles.version} role="status">
      <span>Une nouvelle version du CRM est prête.</span>
      <button type="button" onClick={() => window.location.reload()}>Recharger</button>
    </div>
  );
}
