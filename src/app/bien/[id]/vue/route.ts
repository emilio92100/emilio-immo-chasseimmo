import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ecritServeur } from '@/lib/ecritures';
import { bienPourSite } from '@/lib/flux-site';
import { titreBien, type BienVente } from '@/lib/biens-vente';
import { CODE_SUIVI, avecVue, destDuCode } from '@/lib/bien-suivi';

/**
 * V3.152 — La page d'un bien ouverte depuis un simple mail.
 *
 *   POST /bien/<id>/vue { d: <code> }  →  { ok, note }
 *
 * Publique, comme la page elle-même (le préfixe /bien/ de src/proxy.ts) :
 * c'est le navigateur de celui qui a reçu le mail qui l'appelle, une fois la
 * page affichée (VueSuivie.tsx). Pas la page côté serveur : les robots qui
 * vérifient les liens des mails, ou qui dessinent l'aperçu d'un lien
 * partagé (WhatsApp…), lisent la page sans l'exécuter — ils ne comptent pas.
 *
 * Le code doit être celui d'un mail parti pour CE bien : il est cherché dans
 * les lignes « envoi » de son historique (`donnees.codes`, posé par
 * /api/biens-vente « presenter »). Une ouverture par jour et par code :
 *   · la date s'ajoute à `donnees.vues` de cette ligne (l'historique du bien
 *     la montre, FicheBien) ;
 *   · le contact du CRM, s'il en est un, reçoit dans son Suivi
 *     « 👀 A ouvert la fiche du bien — <titre> ».
 * Un code inconnu, une base qui ne répond pas : rien, la page n'en sait rien
 * (l'erreur reste dans les journaux du serveur).
 *
 * Le type de la ligne du Suivi : « statut_change », celui des lignes que le
 * CRM note tout seul — la base n'accepte qu'une liste fermée de types
 * (context.md, V3.17). `metadata.vue_bien` la reconnaît.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rien = (note = false) => NextResponse.json({ ok: true, note });
const jourLong = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({})) as { d?: unknown };
    const code = String(body.d || '').trim().toLowerCase();
    if (!UUID.test(id) || !CODE_SUIVI.test(code)) return rien();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !cle) return rien();
    const sb = createClient(url, cle, { auth: { persistSession: false } });

    /* La ligne « envoi » qui porte ce code (les plus récentes d'abord). */
    const { data: lignes, error } = await sb.from('biens_vente_suivi').select('id, le, donnees')
      .eq('bien_id', id).eq('type', 'envoi').order('le', { ascending: false }).limit(200);
    if (error) { console.error('[bien/vue] historique du bien', error.message); return rien(); }
    const ligne = ((lignes || []) as { id: string; le: string | null; donnees: unknown }[]).find(x => destDuCode(x.donnees, code));
    if (!ligne) return rien();
    const dest = destDuCode(ligne.donnees, code)!;

    /* Déjà notée aujourd'hui : rien de plus. */
    const maintenant = new Date();
    const neuf = avecVue(ligne.donnees, code, maintenant);
    if (!neuf) return rien();
    const ok = await ecritServeur('[bien/vue] l’ouverture, dans l’historique du bien',
      sb.from('biens_vente_suivi').update({ donnees: neuf.donnees }).eq('id', ligne.id));
    if (!ok) return rien();

    if (dest.client_id && UUID.test(dest.client_id)) {
      const { data: b, error: eB } = await sb.from('biens_vente').select('*').eq('id', id).maybeSingle();
      if (eB) console.error('[bien/vue] le bien', eB.message);
      const bien = b as BienVente | null;
      const titre = bien ? (bienPourSite(bien, null).title || bien.titre || titreBien(bien.donnees || {})) : 'le bien';
      const avant = neuf.avant;
      await ecritServeur('[bien/vue] le Suivi du contact', sb.from('journal').insert({
        client_id: dest.client_id, recherche_id: dest.recherche_id && UUID.test(dest.recherche_id) ? dest.recherche_id : null,
        type: 'statut_change',
        titre: `👀 A ouvert la fiche du bien — ${titre}`,
        description: [
          ligne.le ? `Par le lien du mail du ${jourLong(ligne.le)}` : 'Par le lien du mail',
          avant.length ? `déjà ouverte ${avant.length > 1 ? `${avant.length} autres jours` : `le ${jourLong(avant[0])}`}` : '',
        ].filter(Boolean).join(' · '),
        metadata: { bien_vente_id: id, lien_code: code, vue_bien: true },
      }));
    }
    return rien(true);
  } catch (e) {
    console.error('[bien/vue]', (e as Error).message);
    return rien();
  }
}
