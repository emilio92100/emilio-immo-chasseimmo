/* ═══ L'analyse d'un bien par rapport à une recherche (V3.186) ═══════════
   Alexandre, pour les annonces que le client envoie depuis son espace :
   « la lecture par le lien, plus poussée… comme ça, c'est calculé, etc.
   Comme si c'était une veille ».

   À « Enregistrer la fiche », le CRM demande à api/analyse-bien ce que la
   veille dirait de ce bien pour CE client : une note sur 100, un verdict,
   une phrase (l'appréciation), les atouts et les points d'attention, avec
   les règles de la veille. Ils sont gardés dans la fiche et suivent le bien
   à « Retenir » (colonnes score, verdict, appreciation, points_forts,
   points_attention de `biens`), comme pour un bien trouvé par la veille.
   Notes de travail : l'espace du client ne les lit jamais.

   Ce fichier ne lit ni n'écrit la base : il appelle la route. */

export type VerdictAnalyse = 'priorite' | 'appeler' | 'reserve' | 'ecarter';

export type Analyse = {
  score: number;
  verdict: VerdictAnalyse;
  appreciation: string;
  points_forts: string[];
  points_attention: string[];
};

/** Les colonnes de `biens` que l'analyse remplit. */
export const CHAMPS_ANALYSE = ['score', 'verdict', 'appreciation', 'points_forts', 'points_attention'] as const;

/** La fiche porte-t-elle déjà une analyse ? */
export function aUneAnalyse(f: Record<string, unknown> | null | undefined): boolean {
  if (!f) return false;
  const n = Number(f.score);
  return f.score !== null && f.score !== undefined && f.score !== '' && isFinite(n);
}

/** La fiche sans son analyse (pour en refaire une, ou si elle a échoué). */
export function sansAnalyse<T extends Record<string, unknown>>(f: T): T {
  const x: Record<string, unknown> = { ...f };
  for (const k of CHAMPS_ANALYSE) delete x[k];
  return x as T;
}

/** Demande l'analyse au serveur. Ne jette jamais : rend l'erreur, en clair. */
export async function analyserFiche(rechercheId: string, fiche: Record<string, unknown>, annonceId?: string | null):
  Promise<{ ok: true; analyse: Analyse } | { ok: false; erreur: string }> {
  try {
    const r = await fetch('/api/analyse-bien', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recherche_id: rechercheId, bien: fiche, annonce_id: annonceId || null }),
    });
    const d = await r.json().catch(() => null) as { ok?: boolean; analyse?: Analyse; erreur?: string } | null;
    if (!r.ok || !d?.ok || !d.analyse) return { ok: false, erreur: d?.erreur || `le serveur a répondu ${r.status}` };
    return { ok: true, analyse: d.analyse };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message || 'pas de réponse' };
  }
}
