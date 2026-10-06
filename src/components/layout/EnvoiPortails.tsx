'use client';
import { useEffect } from 'react';
import { EVT_MAJ } from '@/lib/intentions';

/* ═══ Envoyer aux portails ce qui a changé (V3.97) ═════════════════════════
   Jinka recommande un dépôt « à chaque modification ». Le CRM n'a pas un
   seul endroit où un bien s'enregistre : alors, tant qu'il est ouvert, il
   demande au serveur de redéposer quand quelque chose vient de changer
   (l'événement EMI « maj », 20 secondes après le dernier), et toutes les
   5 minutes par sécurité. Le serveur compare au dernier dépôt et ne
   renvoie que si le fichier a changé (/api/diffusion/portails). La nuit, le
   cron de Vercel redépose tout. Aucun affichage : en cas d'échec, la
   console seulement, et l'essai suivant rattrape. */

const DELAI = 20_000;
const TOUTES_LES = 5 * 60_000;

export default function EnvoiPortails() {
  useEffect(() => {
    let attente: number | null = null;
    let enCours = false;
    const envoyer = async () => {
      if (enCours || document.hidden) return;
      enCours = true;
      try {
        const r = await fetch('/api/diffusion/portails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const j = await r.json().catch(() => null) as { ok?: boolean; jinka?: { erreur?: string } } | null;
        if (j && !j.ok) console.warn('[portails]', j.jinka?.erreur || 'échec');
      } catch (e) { console.warn('[portails]', (e as Error).message); }
      enCours = false;
    };
    const bientot = () => {
      if (attente) window.clearTimeout(attente);
      attente = window.setTimeout(() => { attente = null; void envoyer(); }, DELAI);
    };
    const premier = window.setTimeout(() => { void envoyer(); }, DELAI);
    const minuterie = window.setInterval(() => { void envoyer(); }, TOUTES_LES);
    window.addEventListener(EVT_MAJ, bientot);
    return () => {
      window.clearTimeout(premier);
      window.clearInterval(minuterie);
      if (attente) window.clearTimeout(attente);
      window.removeEventListener(EVT_MAJ, bientot);
    };
  }, []);
  return null;
}
