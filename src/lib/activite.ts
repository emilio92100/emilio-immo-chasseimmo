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

export async function honorairesEncaisses(): Promise<Encaisse[]> {
  const [tx, bv, sv] = await Promise.all([
    supabase.from('transactions').select('*').eq('etape_actuelle', 'finalise'),
    supabase.from('biens_vente').select('id, titre, client_id, vendu_le').eq('etape', 'vendu'),
    supabase.from('biens_vente_suivi').select('bien_id, donnees, created_at').eq('type', 'etape').eq('statut', 'vendu')
      .order('created_at', { ascending: false }),
  ]);
  const lignes: Encaisse[] = [];
  for (const t of (tx.data || []) as Record<string, unknown>[]) {
    const ht = nombre(t.honoraires_ht) ?? (nombre(t.honoraires_ttc) !== null ? (nombre(t.honoraires_ttc) as number) / 1.2 : null);
    if (ht === null || ht <= 0) continue;
    const quand = (t.acte_date_prevue || t.updated_at || t.created_at || null) as string | null;
    lignes.push({ quand, ht, source: 'chasse', clientId: (t.client_id as string) || null, titre: 'Transaction' });
  }
  if (!bv.error && !sv.error) {
    for (const b of (bv.data || []) as { id: string; titre: string | null; client_id: string | null; vendu_le: string | null }[]) {
      /* La dernière fois qu'il est passé « Vendu » : c'est elle qui fait foi. */
      const l = (sv.data || []).find((x: { bien_id: string }) => x.bien_id === b.id) as { donnees?: Record<string, unknown> } | undefined;
      const ttc = nombre(l?.donnees?.hono);
      if (ttc === null || ttc <= 0) continue;
      const quand = b.vendu_le || (typeof l?.donnees?.acte === 'string' ? l.donnees.acte : null);
      lignes.push({ quand, ht: ttc / 1.2, source: 'vente', clientId: b.client_id, titre: b.titre || 'Vente' });
    }
  }
  return lignes;
}

/** « 2026-09 » pour une date, en heure de Paris (celle du navigateur). */
export function moisDe(iso: string | null): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.slice(0, 7);
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function moisCourant(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const eurosRonds = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
