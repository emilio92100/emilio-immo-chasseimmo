import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { copierPhotosImmoFacile } from '@/lib/photos-immofacile';

export const runtime = 'nodejs';
export const maxDuration = 60;

/* ═══ Copier chez nous les photos d'un bien repris d'ImmoFacile (V3.79) ═══════
   L'import des biens (ImportBiensIF.tsx) envoie, bien par bien, les adresses
   de ses photos chez ImmoFacile. Le serveur les télécharge et les dépose
   dans le bucket public `photos-vente`, sous `<id du bien>/`, comme une
   photo ajoutée à la main (deposerPhoto) : la fiche les garde même quand
   ImmoFacile s'arrête.

   Le navigateur ne peut pas les lire lui-même (ImmoFacile ne l'autorise pas
   depuis une autre adresse) ; le serveur, si. Il ne lit QUE les images
   d'ImmoFacile : https, l'hôte media.immo-facile.com, un chemin d'image du
   catalogue, une vraie image (reconnue à ses premiers octets), 15 Mo au
   plus, aucune redirection suivie. Tout le reste est refusé.

   Protégée par le code d'accès, comme le reste du CRM (src/proxy.ts).
     POST { id, urls: string[] (12 au plus) }
       →  { ok, photos: ({ url, chemin } | null)[] }   (une sortie par entrée, dans l'ordre) */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAR_APPEL = 12;
const ko = (erreur: string, status = 400) => NextResponse.json({ ok: false, erreur }, { status });

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return ko('Variables Supabase manquantes', 500);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return ko('Requête illisible'); }
  const id = typeof body.id === 'string' ? body.id : '';
  const urls = Array.isArray(body.urls) ? body.urls.slice(0, MAX_PAR_APPEL) : [];
  if (!UUID.test(id) || !urls.length) return ko('Paramètres manquants');
  const sb = createClient(url, cle, { auth: { persistSession: false } });

  /* V3.95 : la copie elle-même est dans lib/photos-immofacile.ts (partagée
     avec /api/diffusion/creer). */
  const photos = await copierPhotosImmoFacile(sb, id, urls);
  return NextResponse.json({ ok: true, photos });
}
