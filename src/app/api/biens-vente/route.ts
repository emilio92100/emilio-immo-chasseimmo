import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Les fichiers privés d'un bien en vente (rubrique « Biens en vente ») : les
 * diagnostics, les pièces de la copropriété, le titre de propriété, une offre
 * signée. Jamais les photos : elles sont publiques (bucket « photos-vente »),
 * le CRM les dépose lui-même.
 *
 * Même serrure que /api/documents : le bucket « mandats » est privé, cette
 * route donne un droit de dépôt d'un seul fichier à un chemin qu'elle choisit,
 * et le fichier part directement du navigateur vers le stockage.
 *
 * Protégée par le code d'accès, comme le reste du CRM (src/proxy.ts).
 *
 *   POST { action: 'depot', id, cle, ext }   →  { ok, chemin, jeton }
 *   POST { action: 'lien', chemin, nom? }    →  { ok, url }   (5 minutes)
 *   POST { action: 'retirer', chemin }       →  { ok }
 *   POST { action: 'tout', id }              →  { ok, n }     (le bien est supprimé)
 *
 * Tout vit sous biens-vente/<id du bien>/ : la route refuse le reste.
 */

const BUCKET = 'mandats';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT = new Set(['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp']);
const CHEMIN = /^biens-vente\/[0-9a-f-]{36}\/[a-z0-9]+-\d+\.[a-z]+$/i;

const ko = (erreur: string, status = 400) => NextResponse.json({ ok: false, erreur }, { status });

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return ko('Variables Supabase manquantes', 500);
  const sb = createClient(url, cle, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return ko('Requête illisible'); }
  const action = String(body.action || '');

  try {
    if (action === 'depot') {
      const id = String(body.id || '');
      const quoi = String(body.cle || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
      const ext = String(body.ext || '').toLowerCase().replace(/[^a-z]/g, '');
      if (!UUID.test(id)) return ko('Bien inconnu');
      if (!quoi) return ko('Pièce inconnue');
      if (!EXT.has(ext)) return ko('Format refusé : PDF, JPG ou PNG');
      /* Le bien doit exister : on ne dépose rien pour un identifiant inventé. */
      const { data: bien, error: eBien } = await sb.from('biens_vente').select('id').eq('id', id).maybeSingle();
      if (eBien) return ko(eBien.message, 500);
      if (!bien) return ko('Bien introuvable', 404);
      const chemin = `biens-vente/${id}/${quoi}-${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(chemin);
      if (error || !data) return ko(error?.message || 'Dépôt impossible', 500);
      return NextResponse.json({ ok: true, chemin: data.path, jeton: data.token });
    }

    if (action === 'lien') {
      const chemin = String(body.chemin || '');
      if (!CHEMIN.test(chemin)) return ko('Chemin refusé');
      const nom = String(body.nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
      const { data, error } = await sb.storage.from(BUCKET)
        .createSignedUrl(chemin, 300, nom ? { download: nom } : undefined);
      if (error || !data) return ko(error?.message || 'Fichier introuvable', 404);
      return NextResponse.json({ ok: true, url: data.signedUrl });
    }

    if (action === 'retirer') {
      const chemin = String(body.chemin || '');
      if (!CHEMIN.test(chemin)) return ko('Chemin refusé');
      const { error } = await sb.storage.from(BUCKET).remove([chemin]);
      if (error) return ko(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    if (action === 'tout') {
      const id = String(body.id || '');
      if (!UUID.test(id)) return ko('Bien inconnu');
      const { data, error } = await sb.storage.from(BUCKET).list(`biens-vente/${id}`, { limit: 200 });
      if (error) return ko(error.message, 500);
      const chemins = (data || []).map(f => `biens-vente/${id}/${f.name}`);
      if (chemins.length) {
        const { error: e2 } = await sb.storage.from(BUCKET).remove(chemins);
        if (e2) return ko(e2.message, 500);
      }
      return NextResponse.json({ ok: true, n: chemins.length });
    }

    return ko('Action inconnue');
  } catch (e) {
    return ko((e as Error).message || 'Erreur', 500);
  }
}
