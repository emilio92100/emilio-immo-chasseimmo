import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Client avec la clé SERVICE (accès Storage en écriture)
function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) throw new Error('Variables Supabase manquantes');
  return createClient(url, serviceKey);
}

export async function POST(req: NextRequest) {
  try {
    const { photos, bien_id } = await req.json();
    if (!photos?.length || !bien_id) {
      return NextResponse.json({ urls: [], error: 'Paramètres manquants' });
    }

    const supabase = getSupabaseService();
    const BUCKET = 'photos-biens';
    const uploadedUrls: string[] = [];

    for (const photoUrl of photos) {
      try {
        // Si déjà dans Supabase Storage, garder tel quel
        if (photoUrl.includes('supabase.co/storage')) {
          uploadedUrls.push(photoUrl);
          continue;
        }

        // Télécharger l'image depuis l'URL externe
        const res = await fetch(photoUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmilioImmo/1.0)' },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          // Si on ne peut pas télécharger, garder l'URL originale
          uploadedUrls.push(photoUrl);
          continue;
        }

        const contentType = res.headers.get('content-type') || 'image/jpeg';
        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
        const buffer = await res.arrayBuffer();

        // Nom de fichier unique : bien_id + timestamp + index
        const filename = `${bien_id}/${Date.now()}-${uploadedUrls.length}.${ext}`;

        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(filename, buffer, {
            contentType,
            upsert: false,
          });

        if (error) {
          console.error('Upload error:', error.message);
          uploadedUrls.push(photoUrl); // fallback URL originale
          continue;
        }

        // Récupérer l'URL publique Supabase
        const { data: { publicUrl } } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(filename);

        uploadedUrls.push(publicUrl);

      } catch (e) {
        // En cas d'erreur sur une photo, garder l'URL originale
        uploadedUrls.push(photoUrl);
      }
    }

    return NextResponse.json({ urls: uploadedUrls });

  } catch (e: any) {
    return NextResponse.json({ urls: [], error: e.message });
  }
}
