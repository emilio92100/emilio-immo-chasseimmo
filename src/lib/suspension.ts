import type { SupabaseClient } from '@supabase/supabase-js';
import { jourParis } from '@/lib/mandat';

/* ═══ Suspendu jusqu'au… — la date de reprise d'un dossier (V3.22) ═════════
   Quand Alexandre passe un acheteur en « Suspendu », une petite fenêtre lui
   propose une date de reprise (facultative). Ce jour-là, le dossier repasse
   tout seul en « Actif », la veille repart sur les recherches qui tournaient
   avant la pause, une ligne s'écrit au journal et une relance lui rappelle
   d'appeler le client.

   La date vit dans `clients.suspension` (jsonb, outils/sql/suspension.sql) :
     { jusqu_au: 'AAAA-MM-JJ', recherches: [id…], le: date de la pause }
   `recherches` : celles qui étaient en marche au moment de la pause. C'est
   elles, et elles seules, que la reprise rallume.

   ⚠️ Un statut qui change autrement (à la main, depuis l'espace du client)
   efface `suspension` : sans ça, une vieille date restée en base réveillerait
   un dossier suspendu plus tard « sans date ».

   Qui fait la reprise ? Trois portes, pour qu'elle ait lieu même si l'une ne
   s'ouvre pas ce jour-là — et un verrou pour qu'elle n'ait lieu qu'une fois :
     · la veille (veilleLire), avant de lire les recherches : le client repris
       le matin même est cherché le matin même ;
     · l'ouverture du CRM (AppLayout) : la fiche est à jour quand on arrive ;
     · la tournée du matin de Vercel (/api/mandat/relances).
   Le verrou : on ne passe à « Actif » qu'un client encore « Suspendu »
   (`.eq('statut', 'suspendu')`), et seul celui qui a vraiment modifié la
   ligne écrit le journal et la relance. Ce fichier est isomorphe. */

export type Suspension = { jusqu_au: string; recherches: string[]; le: string | null };

/* L'erreur d'une base où le SQL n'est pas encore passé. */
export const colonneSuspensionAbsente = (m: string) =>
  /suspension/i.test(m) && /(column|schema cache|could not find)/i.test(m);

export function lireSuspension(c: unknown): Suspension | null {
  const s = (c as { suspension?: unknown } | null)?.suspension as Record<string, unknown> | null | undefined;
  if (!s || typeof s !== 'object') return null;
  const j = typeof s.jusqu_au === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.jusqu_au) ? s.jusqu_au : null;
  if (!j) return null;
  const r = Array.isArray(s.recherches) ? s.recherches.filter((x): x is string => typeof x === 'string') : [];
  return { jusqu_au: j, recherches: r, le: typeof s.le === 'string' ? s.le : null };
}

/* Aujourd'hui + n mois, en date de Paris (« AAAA-MM-JJ »). Le 31 janvier
   + 1 mois donne le dernier jour de février, pas le 3 mars. */
export function dansMois(n: number, depuis: Date = new Date()): string {
  const [a, m, j] = jourParis(depuis).split('-').map(Number);
  const cible = new Date(Date.UTC(a, m - 1 + n, 1));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(j, dernier));
  return cible.toISOString().slice(0, 10);
}

/* « 15 novembre », ou « 15 novembre 2027 » si ce n'est pas cette année. */
export function jourLisible(j: string): string {
  const [a, m, d] = j.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d, 12));
  const annee = a !== Number(jourParis().slice(0, 4));
  return t.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', ...(annee ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}

/* La reprise des dossiers dont la date est arrivée. Ne lève jamais : rend
   les noms repris et les erreurs, à l'appelant de les montrer. */
export async function reprendreSuspendus(sb: SupabaseClient): Promise<{ repris: string[]; erreurs: string[] }> {
  const repris: string[] = [], erreurs: string[] = [];
  try {
    const aujourdhui = jourParis();
    const { data, error } = await sb.from('clients')
      .select('id, prenom, nom, suspension').eq('statut', 'suspendu').not('suspension', 'is', null);
    if (error) {
      /* Colonne absente : le SQL n'est pas passé, il n'y a rien à reprendre. */
      if (!colonneSuspensionAbsente(error.message)) erreurs.push(error.message);
      return { repris, erreurs };
    }

    for (const c of (data || []) as { id: string; prenom: string | null; nom: string | null; suspension: unknown }[]) {
      const s = lireSuspension(c);
      if (!s || s.jusqu_au > aujourdhui) continue;
      const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || 'Client';

      /* Le verrou : seul celui qui fait passer la ligne de « Suspendu » à
         « Actif » continue. Deux portes ouvertes en même temps ne créent
         donc pas deux relances. */
      const { data: pris, error: e1 } = await sb.from('clients')
        .update({ statut: 'actif', suspension: null })
        .eq('id', c.id).eq('statut', 'suspendu').select('id');
      if (e1) { erreurs.push(`${nom} : ${e1.message}`); continue; }
      if (!pris || !pris.length) continue;

      /* Les recherches à rallumer : celles qui tournaient avant la pause.
         Si aucune n'était notée, la plus récemment touchée. */
      let ids = s.recherches;
      if (!ids.length) {
        const { data: r } = await sb.from('recherches').select('id')
          .eq('client_id', c.id).order('updated_at', { ascending: false }).limit(1);
        ids = ((r || []) as { id: string }[]).map(x => x.id);
      }
      if (ids.length) {
        /* `updated_at` rallume aussi la pastille « Recherche en cours » de
           son espace (voir src/app/espace/[token]/page.tsx). */
        const { error: e2 } = await sb.from('recherches')
          .update({ active: true, updated_at: new Date().toISOString() })
          .in('id', ids).eq('client_id', c.id);
        if (e2) erreurs.push(`${nom} — la veille n'a pas pu repartir : ${e2.message}`);
      }

      const le = jourLisible(s.jusqu_au);
      const { error: e3 } = await sb.from('journal').insert({
        client_id: c.id, recherche_id: ids[0] || null, type: 'statut_change',
        titre: '▶️ Reprise automatique — Statut → Actif',
        description: `Le dossier était suspendu jusqu'au ${le}. Il repasse en « Actif » et la veille repart.`,
      });
      if (e3) erreurs.push(`${nom} — l'historique : ${e3.message}`);
      const { error: e4 } = await sb.from('relances').insert({
        client_id: c.id, recherche_id: ids[0] || null, type: 'rappel_client', statut: 'en_attente',
        date_echeance: new Date().toISOString(),
        note: `Reprise du dossier (il était suspendu jusqu'au ${le}) : la veille est repartie. À appeler pour faire le point.`,
      });
      if (e4) erreurs.push(`${nom} — la relance : ${e4.message}`);
      repris.push(nom);
    }
  } catch (e) {
    erreurs.push((e as Error)?.message || 'erreur inconnue');
  }
  return { repris, erreurs };
}
