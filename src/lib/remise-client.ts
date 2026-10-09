/* ═══ Le mail est-il arrivé ? Côté navigateur (V3.151) ═══════════════════
   Voir src/lib/remise-mail.ts. Les routes d'envoi rendent `remise` : les
   mails partis. Ici, on demande /api/mail/remise jusqu'à la réponse de chaque
   messagerie — d'abord vite (la plupart répondent en quelques secondes), puis
   de plus en plus espacé. */

export type RemiseClient = { id: string; email: string; nom?: string; objet?: string; clientId?: string | null; rechercheId?: string | null };
export type EtatRemiseClient = { id: string; etat: 'remis' | 'refuse' | 'attente'; raison: string; statut: string };

/* Un envoi à suivre, pour les cartes en bas de l'écran (SuiviRemises).
   `discret` : seulement si le mail est refusé (un écran l'a déjà suivi). */
export const EVT_REMISE = 'emi-remise';
export type DemandeSuivi = { remises: RemiseClient[]; discret?: boolean };
export function suivreRemises(remises: RemiseClient[], discret = false) {
  if (!remises.length || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DemandeSuivi>(EVT_REMISE, { detail: { remises, discret } }));
}

/* L'en-tête d'un écran qui suit lui-même ses envois (« Envoyer ce bien ») :
   les cartes du bas ne s'en mêlent pas. */
export const REMISE_SUIVIE: Record<string, string> = { 'x-remise-suivie': '1' };

/* Les `remise` d'une réponse, tels quels (rien si elle n'en a pas). */
export function remisesDe(j: unknown): RemiseClient[] {
  const l = (j as { remise?: unknown } | null)?.remise;
  return Array.isArray(l) ? l.filter((x): x is RemiseClient => !!x && typeof (x as RemiseClient).id === 'string' && typeof (x as RemiseClient).email === 'string') : [];
}

export async function lireRemises(l: RemiseClient[]): Promise<EtatRemiseClient[]> {
  const r = await fetch('/api/mail/remise', { method: 'POST', headers: { 'Content-Type': 'application/json', ...REMISE_SUIVIE }, body: JSON.stringify({ remises: l }) });
  const j = await r.json().catch(() => null) as { etats?: EtatRemiseClient[] } | null;
  return Array.isArray(j?.etats) ? j!.etats : [];
}

const dormir = (ms: number) => new Promise(ok => setTimeout(ok, ms));

/* Jusqu'à ce que chaque messagerie ait répondu, ou `budget` ms. */
export async function attendreRemises(l: RemiseClient[], budget = 20_000, surChaque?: (etats: Map<string, EtatRemiseClient>) => void): Promise<Map<string, EtatRemiseClient>> {
  const etats = new Map<string, EtatRemiseClient>();
  const debut = Date.now();
  let pause = 1_500;
  for (;;) {
    const reste = l.filter(x => (etats.get(x.id)?.etat || 'attente') === 'attente');
    if (!reste.length || Date.now() - debut + pause > budget) break;
    await dormir(pause);
    pause = Math.min(pause + 750, 4_000);
    try {
      for (const e of await lireRemises(reste)) etats.set(e.id, e);
      surChaque?.(new Map(etats));
    } catch { /* on repose la question au tour suivant */ }
  }
  return etats;
}
