/* ═══ Le chiffre d'affaires, lu dans les dossiers ═══════════════════════════
   Le tableau de bord et « Mon activité » affichaient `0 €` en dur (§6.8 et
   §6.9). Le chiffre se lit maintenant là où il est saisi :

   · la chasse : une transaction clôturée (« Acte signé — clôturer ») porte
     ses honoraires HT (`transactions.honoraires_ht`, saisis à l'étape Acte)
     et sa date d'acte (`acte_date_prevue`) ;
   · la vente : un bien passé « Vendu » garde, dans son historique, les
     honoraires encaissés TTC et la date de l'acte (`biens_vente_suivi`,
     type `etape`, statut `vendu`). Ramenés en HT au même taux que la fiche
     client (÷ 1,2).

   Un honoraire non saisi ne compte pas : le chiffre dit ce qui est écrit,
   jamais une estimation. Une table absente (SQL des biens pas passé) ne
   bloque rien, elle ne compte simplement pas. */
import { supabase } from '@/lib/supabase';

export type Encaisse = { quand: string | null; ht: number; source: 'chasse' | 'vente'; clientId: string | null; titre: string };

const nombre = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/* Une table absente (SQL pas encore passé) ne compte simplement pas ; toute
   autre erreur de lecture se dit (V3.50) : une session expirée affichait
   « 0 € » comme si de rien n'était. */
const absente = (e: { message?: string; code?: string } | null) =>
  !!e && (e.code === '42P01' || /does not exist|n'existe pas/i.test(e.message || ''));
function verif(quoi: string, e: { message?: string; code?: string } | null): boolean {
  if (!e) return true;
  if (absente(e)) return false;
  throw new Error(`${quoi} : ${e.message || 'lecture impossible'}`);
}

type LigneVente = { bien_id: string; statut: string; donnees: Record<string, unknown> | null; created_at: string };

/* Les biens de l'agence vendus, avec leurs honoraires comptés : la dernière
   fois qu'ils sont passés « Vendu », c'est elle qui fait foi. */
async function ventesAgence(): Promise<{ lignes: Encaisse[]; comptes: Set<string> }> {
  const [bv, sv] = await Promise.all([
    supabase.from('biens_vente').select('id, titre, client_id, vendu_le').eq('etape', 'vendu'),
    supabase.from('biens_vente_suivi').select('bien_id, statut, donnees, created_at').eq('type', 'etape').eq('statut', 'vendu')
      .order('created_at', { ascending: false }),
  ]);
  const lignes: Encaisse[] = [];
  const comptes = new Set<string>();
  if (!verif('Les biens vendus', bv.error) || !verif('L’historique des ventes', sv.error)) return { lignes, comptes };
  for (const b of (bv.data || []) as { id: string; titre: string | null; client_id: string | null; vendu_le: string | null }[]) {
    const l = ((sv.data || []) as LigneVente[]).find(x => x.bien_id === b.id);
    const ttc = nombre(l?.donnees?.hono);
    if (ttc === null || ttc <= 0) continue;
    const quand = b.vendu_le || (typeof l?.donnees?.acte === 'string' ? l.donnees.acte : null);
    lignes.push({ quand, ht: ttc / 1.2, source: 'vente', clientId: b.client_id, titre: b.titre || 'Vente' });
    comptes.add(b.id);
  }
  return { lignes, comptes };
}

/* Les biens de la chasse qui sont en fait des biens de l'agence (une copie
   portant `bien_vente_id`) : leur vente se compte déjà côté agence. Une
   transaction ouverte aussi côté acheteur ne doit pas la compter deux fois
   (V3.50). */
async function copiesAgence(bienIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(bienIds.filter(Boolean)));
  if (!ids.length) return {};
  const { data, error } = await supabase.from('biens').select('id, bien_vente_id').in('id', ids);
  if (!verif('Les biens des transactions', error)) return {};
  return Object.fromEntries(((data || []) as { id: string; bien_vente_id: string | null }[])
    .filter(x => x.bien_vente_id).map(x => [x.id, x.bien_vente_id as string]));
}

/* Les clients perdus ou archivés parmi ceux-là. Une colonne `archive`
   absente (SQL pas passé) : on relit sans elle. */
async function clientsClos(ids: string[]): Promise<Set<string>> {
  const l = Array.from(new Set(ids.filter(Boolean)));
  if (!l.length) return new Set();
  let r = await supabase.from('clients').select('id, statut, archive').in('id', l);
  if (r.error) r = await supabase.from('clients').select('id, statut').in('id', l) as typeof r;
  verif('Les clients des transactions', r.error);
  return new Set(((r.data || []) as { id: string; statut: string | null; archive?: boolean | null }[])
    .filter(c => c.statut === 'perdu' || c.archive === true).map(c => c.id));
}

/* Ce qui est encaissé : les actes signés. Lève une erreur si la lecture
   échoue — l'écran le dit au lieu d'afficher 0 €. */
export async function honorairesEncaisses(): Promise<Encaisse[]> {
  const [tx, agence] = await Promise.all([
    supabase.from('transactions').select('*').eq('etape_actuelle', 'finalise'),
    ventesAgence(),
  ]);
  verif('Les transactions', tx.error);
  const lignes: Encaisse[] = [...agence.lignes];
  const txs = (tx.data || []) as Record<string, unknown>[];
  const copies = await copiesAgence(txs.map(t => t.bien_id as string));
  for (const t of txs) {
    const surAgence = copies[t.bien_id as string];
    if (surAgence && agence.comptes.has(surAgence)) continue;
    const ht = nombre(t.honoraires_ht) ?? (nombre(t.honoraires_ttc) !== null ? (nombre(t.honoraires_ttc) as number) / 1.2 : null);
    if (ht === null || ht <= 0) continue;
    const quand = (t.acte_date_prevue || t.updated_at || t.created_at || null) as string | null;
    lignes.push({ quand, ht, source: 'chasse', clientId: (t.client_id as string) || null, titre: 'Transaction' });
  }
  return lignes;
}

/* Ce qui est attendu (V3.50) : les compromis signés, acte pas encore passé.
   Côté agence, les honoraires du compromis (TTC, ramenés en HT) ; côté
   chasse, les transactions au compromis ou à l'acte qui portent des
   honoraires. `quand` est la date d'acte prévue (null si non saisie). */
export async function honorairesPrevus(): Promise<Encaisse[]> {
  const [bv, sv, tx] = await Promise.all([
    supabase.from('biens_vente').select('id, titre, client_id').eq('etape', 'compromis').eq('archive', false),
    supabase.from('biens_vente_suivi').select('bien_id, statut, donnees, created_at').eq('type', 'etape').eq('statut', 'compromis')
      .order('created_at', { ascending: false }),
    supabase.from('transactions').select('*').in('etape_actuelle', ['compromis', 'acte']),
  ]);
  const lignes: Encaisse[] = [];
  const enCompromis = new Set<string>();
  if (verif('Les biens sous compromis', bv.error) && verif('L’historique des ventes', sv.error)) {
    for (const b of (bv.data || []) as { id: string; titre: string | null; client_id: string | null }[]) {
      const l = ((sv.data || []) as LigneVente[]).find(x => x.bien_id === b.id);
      const ttc = nombre(l?.donnees?.hono);
      if (ttc === null || ttc <= 0) continue;
      lignes.push({ quand: typeof l?.donnees?.acte === 'string' ? l.donnees.acte : null, ht: ttc / 1.2, source: 'vente', clientId: b.client_id, titre: b.titre || 'Vente' });
      enCompromis.add(b.id);
    }
  }
  verif('Les transactions', tx.error);
  const txs = (tx.data || []) as Record<string, unknown>[];
  const copies = await copiesAgence(txs.map(t => t.bien_id as string));
  /* Un dossier perdu ou archivé n'attend plus rien, même si sa transaction
     est restée ouverte : même règle que « Transactions en cours ». */
  const clos = await clientsClos(txs.map(t => t.client_id as string));
  for (const t of txs) {
    if (clos.has(t.client_id as string)) continue;
    const surAgence = copies[t.bien_id as string];
    if (surAgence && enCompromis.has(surAgence)) continue;
    const ht = nombre(t.honoraires_ht) ?? (nombre(t.honoraires_ttc) !== null ? (nombre(t.honoraires_ttc) as number) / 1.2 : null);
    if (ht === null || ht <= 0) continue;
    lignes.push({ quand: (t.acte_date_prevue as string) || null, ht, source: 'chasse', clientId: (t.client_id as string) || null, titre: 'Transaction' });
  }
  return lignes;
}

/* Le mois d'une date, à l'heure de Paris (V3.50 : c'était l'heure de
   l'appareil). Une date seule (« 2026-09-30 ») se lit telle quelle. */
const FMT_MOIS = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' });
export function moisDe(iso: string | null): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.slice(0, 7);
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : FMT_MOIS.format(d).slice(0, 7);
}

export function moisCourant(): string {
  return FMT_MOIS.format(new Date()).slice(0, 7);
}

export const eurosRonds = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
