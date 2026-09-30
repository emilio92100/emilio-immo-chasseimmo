import { supabase } from '@/lib/supabase';

/* ═══ Les photos d'un bien d'acheteur, hébergées chez nous ═════════════════
   V3.33. Un bien retenu depuis la veille, ou posé en sélection par le
   rapprochement, reprend TELLES QUELLES les photos de la proposition
   (bucket `photos-biens`) : ce sont les mêmes fichiers, parfois partagés par
   plusieurs dossiers. Les effacer en retirant le bien cassait la proposition,
   que « Remettre » fait pourtant revenir, et les autres biens qui s'en
   servaient.

   Règle : on n'efface les fichiers que si plus aucune proposition ni aucun
   bien ne s'en sert. À appeler APRÈS l'écriture de la ligne (suppression du
   bien, ou nouvelle liste de photos). Dans le doute (lecture impossible), on
   garde : un fichier en trop ne gêne personne, un fichier en moins se voit. */

/** Les adresses que nous hébergeons, parmi celles d'un bien. V3.43 :
    l'adresse est lue en entier (notre serveur Supabase, le chemin public du
    bucket), plus seulement « contient supabase.co/storage » : une adresse
    piégée venue d'une annonce (…?u=https://….supabase.co/storage/…/photos-biens/<fichier
    d'un autre bien>) aurait fait effacer la photo d'un autre bien. */
const PREFIXE = '/storage/v1/object/public/photos-biens/';
function hebergees(urls: unknown[]): string[] {
  let origine = '';
  try { origine = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin; } catch { return []; }
  return urls.filter((u): u is string => {
    if (typeof u !== 'string') return false;
    try { const x = new URL(u); return x.origin === origine && x.pathname.startsWith(PREFIXE) && !x.search; } catch { return false; }
  });
}
/* Le chemin du fichier dans le bucket, tiré du chemin de l'adresse. */
const cheminDe = (u: string) => { try { return decodeURIComponent(new URL(u).pathname.slice(PREFIXE.length)); } catch { return ''; } };

/** Vrai si une ligne de `table` a encore cette photo (ou si on ne peut pas le savoir). */
async function encoreUtilisee(table: 'biens' | 'veille_propositions', url: string): Promise<boolean> {
  /* La colonne est un tableau : on essaie les deux écritures possibles
     (tableau Postgres, puis JSON) ; si aucune ne passe, on garde. */
  for (const v of [`{"${url}"}`, JSON.stringify([url])]) {
    const { data, error } = await supabase.from(table).select('id').filter('photos', 'cs', v).limit(1);
    if (!error) return !!(data && data.length);
  }
  return true;
}

/** Efface du stockage des photos de bien que plus personne n'utilise. */
export async function effacerPhotosBien(urls: unknown[]): Promise<void> {
  const liste = hebergees(urls);
  if (!liste.length) return;
  /* Les photos d'un même bien viennent toutes du même endroit (une
     proposition de la veille, ou un dépôt à la main) : la première suffit
     pour savoir si le lot est partagé. */
  if (await encoreUtilisee('veille_propositions', liste[0])) return;
  if (await encoreUtilisee('biens', liste[0])) return;
  const chemins = liste.map(cheminDe).filter(x => !!x && !x.includes('..'));
  for (let i = 0; i < chemins.length; i += 100) {
    const { error } = await supabase.storage.from('photos-biens').remove(chemins.slice(i, i + 100));
    if (error) console.error('[photos] effacement', error.message);
  }
}

/** Plusieurs biens d'un coup (une recherche, un client supprimés) : chacun
    son lot, six à la fois. À appeler une fois les biens effacés de la base. */
export async function effacerPhotosDeBiens(lot: { photos?: unknown; plans?: unknown }[]): Promise<void> {
  const lots = lot.map(b => [...(Array.isArray(b?.photos) ? b.photos : []), ...(Array.isArray(b?.plans) ? b.plans : [])]).filter(l => hebergees(l).length);
  for (let i = 0; i < lots.length; i += 6) await Promise.all(lots.slice(i, i + 6).map(effacerPhotosBien));
}
