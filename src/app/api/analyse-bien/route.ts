import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { court } from '@/lib/dossier-recherche';
import { analyserPourRecherche } from '@/lib/analyse-bien-serveur';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * L'analyse d'un bien pour une recherche, comme la veille (V3.186).
 *
 * Alexandre, pour les annonces que le client envoie depuis son espace :
 * « la lecture par le lien, plus poussée… comme ça, c'est calculé, etc.
 * Comme si c'était une veille ».
 *
 *   POST { recherche_id, bien: <la fiche, colonnes de `biens`>, annonce_id? }
 *        →  { ok, analyse: { score, verdict, appreciation, points_forts, points_attention }, modele, photos }
 *
 * L'IA de Claude lit le même dossier que le rapprochement
 * (lib/dossier-recherche.ts : critères, indispensables, précisions, parcours,
 * visites, comptes rendus, retours, écarts), la fiche du bien et ses photos,
 * et ce que le client en a dit en l'envoyant (son mot, ce qui lui plaît). Elle
 * juge avec les règles de la veille (skill « recherche-immobiliere-emilio » :
 * curseurs, seuils durs, choix, indispensables, tranches de la note).
 *
 * Rien n'est écrit ici : le CRM garde l'analyse dans la fiche de l'annonce.
 * V3.197 : le moteur est dans src/lib/analyse-bien-serveur.ts (le lien pour
 * les agences s'en sert aussi).
 * Rien de nominatif ne part. Protégée par le code d'accès (src/proxy.ts).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ko = (erreur: string, status = 400) => NextResponse.json({ ok: false, erreur }, { status });

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return ko('Variables Supabase manquantes', 500);
  if (!process.env.ANTHROPIC_API_KEY) return ko('La clé de l’analyse (ANTHROPIC_API_KEY) manque dans Vercel', 500);
  const sb = createClient(url, cle, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return ko('Requête illisible'); }
  const rid = String(body.recherche_id || '');
  if (!UUID.test(rid)) return ko('Recherche inconnue');
  const bien = body.bien && typeof body.bien === 'object' ? (body.bien as Record<string, unknown>) : null;
  if (!bien) return ko('Fiche du bien absente');

  /* Ce que le client en a dit en l'envoyant (son annonce, V3.184). */
  const aid = UUID.test(String(body.annonce_id || '')) ? String(body.annonce_id) : null;
  const ditParLui: Record<string, unknown> = {};
  if (aid) {
    const { data } = await sb.from('annonces_client').select('recherche_id, mot, aime, created_at').eq('id', aid).maybeSingle();
    const a = data as { recherche_id?: string; mot?: string | null; aime?: string[] | null; created_at?: string } | null;
    if (a && a.recherche_id === rid) {
      if (a.created_at) ditParLui.envoyee_le = String(a.created_at).slice(0, 10);
      if (a.mot) ditParLui.son_mot = court(a.mot, 600);
      if (Array.isArray(a.aime) && a.aime.length) ditParLui.ce_qui_lui_plait = a.aime;
    }
  }

  /* V3.197 : un bien proposé par une agence (le lien pour les agences) :
     ce que l'agence en a dit, et la consigne qui va avec. */
  const pid = UUID.test(String(body.proposition_id || '')) ? String(body.proposition_id) : null;
  if (pid) {
    const { data } = await sb.from('propositions_agences').select('recherche_id, mot, agence, interlocuteur, adresse').eq('id', pid).maybeSingle();
    const p = data as { recherche_id?: string; mot?: string | null; agence?: string | null; interlocuteur?: string | null; adresse?: string | null } | null;
    if (p && p.recherche_id === rid) {
      const dit: Record<string, unknown> = { agence: [p.agence, p.interlocuteur].filter(Boolean).join(' · ') };
      if (p.mot) dit.son_mot = court(p.mot, 600);
      if (p.adresse) dit.adresse_donnee = p.adresse;
      const ra = await analyserPourRecherche(sb, rid, bien, { source: 'agence', dit });
      if (!ra.ok) return ko(ra.erreur, ra.status);
      return NextResponse.json({ ok: true, analyse: ra.analyse, modele: ra.modele, photos: ra.photos });
    }
  }

  const r = await analyserPourRecherche(sb, rid, bien, { source: 'client', dit: ditParLui });
  if (!r.ok) return ko(r.erreur, r.status);
  return NextResponse.json({ ok: true, analyse: r.analyse, modele: r.modele, photos: r.photos });
}
