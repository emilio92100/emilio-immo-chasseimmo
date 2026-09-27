import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Les fichiers des documents juridiques (Documents juridiques, dans le CRM).
 *
 * Le bucket « mandats » est privé. Le navigateur n'y écrit pas lui-même :
 * cette route, côté serveur et avec la clé SERVICE, lui donne un droit de
 * dépôt d'un seul fichier, à un chemin qu'elle choisit. Le fichier part
 * ensuite directement du navigateur vers le stockage — un exemplaire signé
 * scanné peut peser plusieurs mégaoctets, trop pour passer par ici.
 *
 * Protégée par le code d'accès, comme le reste du CRM (src/proxy.ts).
 *
 *   POST { action: 'depot', id, genre: 'pdf' | 'signe', ext }  →  { ok, chemin, jeton }
 *   POST { action: 'lien', chemin, nom? }                      →  { ok, url }   (5 minutes)
 *   POST { action: 'retirer', id }                             →  { ok, n }     (tous ses fichiers)
 *
 * Tout vit sous documents/<id du document>/ : la route refuse le reste.
 */

const BUCKET = 'mandats';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT = new Set(['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp']);

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
      const genre = body.genre === 'signe' ? 'signe' : body.genre === 'pdf' ? 'pdf' : '';
      const ext = String(body.ext || '').toLowerCase().replace(/[^a-z]/g, '');
      if (!UUID.test(id)) return ko('Document inconnu');
      if (!genre) return ko('Genre de fichier inconnu');
      if (!EXT.has(ext)) return ko('Format refusé : PDF, JPG ou PNG');
      /* Le document doit exister : on ne dépose rien pour un identifiant inventé. */
      const { data: doc, error: eDoc } = await sb.from('documents').select('id').eq('id', id).maybeSingle();
      if (eDoc) return ko(eDoc.message, 500);
      if (!doc) return ko('Document introuvable', 404);
      const chemin = `documents/${id}/${genre}-${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(chemin);
      if (error || !data) return ko(error?.message || 'Dépôt impossible', 500);
      return NextResponse.json({ ok: true, chemin: data.path, jeton: data.token });
    }

    if (action === 'lien') {
      const chemin = String(body.chemin || '');
      if (!/^documents\/[0-9a-f-]{36}\/[a-z]+-\d+\.[a-z]+$/i.test(chemin)) return ko('Chemin refusé');
      const nom = String(body.nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
      const { data, error } = await sb.storage.from(BUCKET)
        .createSignedUrl(chemin, 300, nom ? { download: nom } : undefined);
      if (error || !data) return ko(error?.message || 'Fichier introuvable', 404);
      return NextResponse.json({ ok: true, url: data.signedUrl });
    }

    if (action === 'retirer') {
      const id = String(body.id || '');
      if (!UUID.test(id)) return ko('Document inconnu');
      const { data, error } = await sb.storage.from(BUCKET).list(`documents/${id}`, { limit: 100 });
      if (error) return ko(error.message, 500);
      const chemins = (data || []).map(f => `documents/${id}/${f.name}`);
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
