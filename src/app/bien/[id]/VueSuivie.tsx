'use client';

import { useEffect, useRef } from 'react';
import { CODE_SUIVI, PARAM_SUIVI } from '@/lib/bien-suivi';

/* V3.152 — Ouverte depuis un simple mail (/bien/<id>?d=<code>) : la page le
   dit au serveur, une fois affichée, puis retire le code de l'adresse — un
   lien recopié depuis la barre et donné à un proche ne compterait pas comme
   une ouverture de la personne. Rien ne s'affiche, et rien ne bloque la
   page si l'appel échoue. Voir src/app/bien/[id]/vue/route.ts. */
export default function VueSuivie({ id }: { id: string }) {
  const fait = useRef(false);
  useEffect(() => {
    if (fait.current) return;
    fait.current = true;
    try {
      const u = new URL(window.location.href);
      const code = (u.searchParams.get(PARAM_SUIVI) || '').trim().toLowerCase();
      if (!CODE_SUIVI.test(code)) return;
      fetch(`/bien/${encodeURIComponent(id)}/vue`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ d: code }), keepalive: true,
      }).catch(() => { /* sans effet sur la page */ });
      u.searchParams.delete(PARAM_SUIVI);
      window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
    } catch { /* sans effet sur la page */ }
  }, [id]);
  return null;
}
