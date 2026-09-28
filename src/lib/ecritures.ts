/* ═══ Les écritures vérifiées (V3.17) ══════════════════════════════════════
   Une écriture Supabase dont on ne lit pas la réponse peut échouer sans un
   mot : c'est ce qui a rendu les relances muettes pendant des semaines
   (AGENTS.md §3.2). Ici, on lit la réponse :
   - une erreur de la base → un message rouge à l'écran (Avertissements,
     posé dans AppLayout), et `false` pour que l'appelant s'arrête ;
   - `ligne: true` : une modification ou une suppression qui DOIT toucher une
     ligne précise ; la base fermée (RLS) refuse parfois sans erreur, en ne
     touchant rien. La requête doit alors finir par `.select('id')`, pour que
     la base dise ce qu'elle a touché.
   Quand tout va bien, rien ne change à l'écran.

   Côté navigateur seulement : les routes du serveur ont leur propre façon
   de répondre (voir `echecServeur` plus bas). */

export const EVT_ECHEC = 'emi-echec-ecriture';
export type Echec = { quoi: string; detail: string; le: number };

type Reponse = { data?: unknown; error: { message: string } | null };

/* Le message : « <quoi> n'a pas pu être enregistré(e) », et la raison. */
export function signalerEchec(quoi: string, detail = '') {
  console.error(`[écriture] ${quoi} : ${detail}`);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<Echec>(EVT_ECHEC, { detail: { quoi, detail, le: Date.now() } }));
}

const PERDUE = 'aucune ligne n’a été modifiée. La session a peut-être expiré : recharge la page, puis recommence.';

/* `true` si l'écriture est passée. Ne lève jamais : un échec est signalé,
   et c'est à l'appelant de s'arrêter (`if (!(await verifie(…))) return;`). */
export async function verifie(quoi: string, requete: PromiseLike<Reponse>, o: { ligne?: boolean } = {}): Promise<boolean> {
  try {
    const { data, error } = await requete;
    if (error) { signalerEchec(quoi, error.message); return false; }
    if (o.ligne && Array.isArray(data) && data.length === 0) { signalerEchec(quoi, PERDUE); return false; }
    return true;
  } catch (e) {
    signalerEchec(quoi, (e as Error)?.message || 'erreur inconnue');
    return false;
  }
}

/* Plusieurs écritures qui vont ensemble (supprimer un dossier et tout ce
   qui s'y rattache) : faites l'une après l'autre, DANS L'ORDRE (une ligne
   rattachée part avant celle qu'elle vise), et on S'ARRÊTE au premier
   échec : l'étape suivante peut dépendre de celle-ci (on met l'historique à
   l'abri avant d'effacer le reste). Un seul message ; `true` seulement si
   toutes sont passées. Les requêtes sont données comme des fonctions : une
   requête Supabase part au moment où on l'attend. */
export async function verifieTout(quoi: string, requetes: (() => PromiseLike<Reponse>)[]): Promise<boolean> {
  for (const q of requetes) {
    let raison = '';
    try {
      const { error } = await q();
      if (error) raison = error.message;
    } catch (e) { raison = (e as Error)?.message || 'erreur inconnue'; }
    if (raison) { signalerEchec(quoi, `${raison} (arrêté là : rien d'autre n'a été touché après cette étape)`); return false; }
  }
  return true;
}

/* ── Côté serveur (routes /api) ──
   Une écriture secondaire (l'historique, une relance) qui échoue ne doit
   pas faire croire au client que sa réponse est perdue : on la note dans
   les journaux du serveur (Vercel), et on la rend dans `avertissements`.
   L'écriture principale, elle, doit faire échouer la route. */
export async function ecritServeur(quoi: string, requete: PromiseLike<Reponse>, avertissements?: string[]): Promise<boolean> {
  try {
    const { error } = await requete;
    if (!error) return true;
    console.error(`[écriture] ${quoi} : ${error.message}`);
    avertissements?.push(`${quoi} : ${error.message}`);
    return false;
  } catch (e) {
    console.error(`[écriture] ${quoi} : ${(e as Error)?.message}`);
    avertissements?.push(`${quoi} : ${(e as Error)?.message}`);
    return false;
  }
}
