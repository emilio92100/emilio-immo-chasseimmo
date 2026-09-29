/* ═══ Les alertes de rapprochement (V3.29) ═══════════════════════════════════
   Deux cas, affichés en tête de la page Relances :
   · « Un acheteur arrive » : une recherche ouverte depuis moins de trois
     semaines, et un ou plusieurs de vos mandats lui correspondent (70 % et
     plus), pas encore dans son dossier. Elle disparaît dès qu'un
     rapprochement est fait pour lui (ligne `rapprochement` du journal).
   · « Un mandat arrive » : un bien passé en vente depuis moins de trois
     semaines, et des acheteurs suivis qui lui correspondent sans l'avoir.
     Elle disparaît quand on ouvre ses acheteurs.

   Rien de nouveau en base : tout se calcule à la lecture. « Plus tard » la
   met de côté une semaine ; c'est noté dans les `donnees` du bien en vente
   (`alerteAcheteurs`, `alertesRecherches`), qui acceptent tout. */

import { supabase } from '@/lib/supabase';
import { signalerEchec, verifie } from '@/lib/ecritures';
import { correspondance, criteresDepuisRecherche } from '@/lib/correspondance';
import { titreBien, typeCompatible, versCorrespondance, type BienVente } from '@/lib/biens-vente';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ligne = Record<string, any>;

const FENETRE = 21 * 86400000;
const REPOS = 7 * 86400000;
const SEUIL = 70;

export type MandatAlerte = { id: string; titre: string; ville: string; note: number };
export type AlerteRappro =
  | { k: 'acheteur'; cle: string; le: string; client: Ligne; recherche: Ligne; mandats: MandatAlerte[] }
  | { k: 'mandat'; cle: string; le: string; bien: BienVente; titre: string; n: number; meilleure: number; noms: string[] };

const recent = (iso: unknown, ms: number) => typeof iso === 'string' && Date.now() - Date.parse(iso) < ms;
const nom = (c: Ligne | undefined) => [c?.prenom, c?.nom].filter(Boolean).join(' ') || 'Un acheteur';

export async function chargerAlertesRappro(): Promise<AlerteRappro[]> {
  const depuis = new Date(Date.now() - FENETRE).toISOString();
  const [m, r, cl, co, j] = await Promise.all([
    supabase.from('biens_vente').select('*').eq('archive', false).eq('etape', 'mandat'),
    supabase.from('recherches').select('*').eq('active', true).limit(1000),
    supabase.from('clients').select('id, prenom, nom, statut').limit(3000),
    supabase.from('biens').select('id, bien_vente_id, recherche_id').not('bien_vente_id', 'is', null).limit(5000),
    supabase.from('journal').select('recherche_id, created_at').eq('type', 'rapprochement').gte('created_at', depuis),
  ]);
  if (m.error || r.error || cl.error || co.error) return [];
  const mandats = (m.data || []) as BienVente[];
  const clients: Record<string, Ligne> = Object.fromEntries(((cl.data || []) as Ligne[]).map(c => [c.id, c]));
  const suivi = (id: string) => ['actif', 'prospect'].includes(String(clients[id]?.statut || ''));
  const recherches = ((r.data || []) as Ligne[]).filter(x => suivi(x.client_id));
  const deja = new Set(((co.data || []) as Ligne[]).map(x => `${x.bien_vente_id}|${x.recherche_id}`));
  const rapproches = ((j.data || []) as Ligne[]);
  const crit: Record<string, ReturnType<typeof criteresDepuisRecherche>> = {};
  const critDe = (x: Ligne) => (crit[x.id] ||= criteresDepuisRecherche(x));
  const note = (b: BienVente, x: Ligne) => {
    if (b.client_id && b.client_id === x.client_id) return 0;
    if (!typeCompatible(b.donnees?.typeBien, x.type_bien)) return 0;
    return correspondance(versCorrespondance(b), critDe(x))?.note || 0;
  };
  const out: AlerteRappro[] = [];

  /* Un acheteur arrive */
  for (const x of recherches.filter(y => recent(y.created_at, FENETRE))) {
    if (rapproches.some(y => y.recherche_id === x.id && String(y.created_at) >= String(x.created_at))) continue;
    const l: MandatAlerte[] = [];
    for (const b of mandats) {
      if (deja.has(`${b.id}|${x.id}`)) continue;
      const repos = (b.donnees?.alertesRecherches as Record<string, string> | undefined)?.[x.id];
      if (recent(repos, REPOS)) continue;
      const n = note(b, x);
      if (n >= SEUIL) l.push({ id: b.id, titre: titreBien(b.donnees || {}), ville: b.ville || '', note: n });
    }
    if (l.length) out.push({ k: 'acheteur', cle: `a-${x.id}`, le: String(x.created_at), client: clients[x.client_id], recherche: x, mandats: l.sort((p, q) => q.note - p.note) });
  }

  /* Un mandat arrive */
  for (const b of mandats) {
    const debut = b.en_vente_le || b.etape_le;
    if (!recent(debut, FENETRE)) continue;
    const vu = b.donnees?.alerteAcheteurs as { le?: string; fin?: boolean } | undefined;
    if (vu?.fin || recent(vu?.le, REPOS)) continue;
    const l = recherches
      .filter(x => !deja.has(`${b.id}|${x.id}`))
      .map(x => ({ x, n: note(b, x) }))
      .filter(y => y.n >= SEUIL)
      .sort((p, q) => q.n - p.n);
    if (l.length) out.push({ k: 'mandat', cle: `m-${b.id}`, le: String(debut), bien: b, titre: titreBien(b.donnees || {}), n: l.length, meilleure: l[0].n, noms: l.slice(0, 3).map(y => nom(clients[y.x.client_id])) });
  }

  return out.sort((p, q) => q.le.localeCompare(p.le));
}

/* Écrire dans les `donnees` d'un bien sans perdre ce qui vient d'y changer :
   relues juste avant. */
async function noter(bienId: string, maj: (d: Ligne) => Ligne): Promise<boolean> {
  const { data, error } = await supabase.from('biens_vente').select('donnees').eq('id', bienId).single();
  if (error || !data) { signalerEchec('L’alerte', error?.message || 'bien introuvable'); return false; }
  const d = ((data as Ligne).donnees || {}) as Ligne;
  return verifie('L’alerte', supabase.from('biens_vente').update({ donnees: maj(d) }).eq('id', bienId).select('id'), { ligne: true });
}

export async function plusTardAcheteur(a: Extract<AlerteRappro, { k: 'acheteur' }>): Promise<boolean> {
  const le = new Date().toISOString();
  let ok = true;
  for (const m of a.mandats) {
    ok = (await noter(m.id, d => ({ ...d, alertesRecherches: { ...(d.alertesRecherches || {}), [a.recherche.id]: le } }))) && ok;
  }
  return ok;
}

/* « Plus tard » : une semaine ; « Voir les acheteurs » : pour de bon. */
export function mandatVu(a: Extract<AlerteRappro, { k: 'mandat' }>, pourDeBon: boolean): Promise<boolean> {
  return noter(a.bien.id, d => ({ ...d, alerteAcheteurs: { le: new Date().toISOString(), ...(pourDeBon ? { fin: true } : {}) } }));
}
