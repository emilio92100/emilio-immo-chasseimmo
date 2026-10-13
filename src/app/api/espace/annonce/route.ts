import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ecritServeur } from '@/lib/ecritures';
import { AIMES, PHOTOS_MAX, lienPropre, siteDe, titreAnnonce, tableAbsente, annoncePourEspace } from '@/lib/annonces-client';

/**
 * « Une annonce repérée ? » — le client l'envoie depuis son espace (V3.184).
 *
 *   POST /api/espace/annonce  { token, url?, photos?: data:image/…[], aime?: string[], mot? }
 *
 * Un lien, ou au moins une photo (une affiche en vitrine, un panneau « À
 * vendre »). Le serveur ne va JAMAIS lire le lien : il le range tel quel, et
 * c'est Alexandre qui l'ouvre depuis le CRM (« Remplir la fiche »). Une route
 * publique qui irait chercher n'importe quelle adresse donnée par un
 * inconnu serait une porte ouverte.
 *
 * Le même lien déjà envoyé, ou déjà dans ses biens : rien ne s'enregistre,
 * on lui dit où il est. Une ligne au Suivi (Messages), une relance (comme un
 * message), et l'annonce dans l'onglet Veille de sa fiche.
 *
 * La route est publique (src/proxy.ts, /api/espace/) : le lien fait la serrure.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BUCKET = 'photos-biens';
/* Les photos sont réduites dans son navigateur (1 600 px) : quelques
   centaines de Ko. La limite est large, mais elle existe. */
const MAX_OCTETS = 6 * 1024 * 1024;
/* Quinze annonces par jour et par recherche : bien au-delà d'un usage
   normal, assez bas pour qu'un lien ne remplisse pas l'onglet Veille. */
const PAR_JOUR = 15;

function base() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

const nettoie = (s: unknown, max = 600) =>
  typeof s === 'string' ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '';

/* L'image, reconnue à ses premiers octets (le type annoncé ne suffit pas). */
function typeImage(o: Uint8Array): { type: string; ext: string } | null {
  if (o.length < 12) return null;
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return { type: 'image/png', ext: 'png' };
  const txt = (de: number, n: number) => String.fromCharCode(...Array.from(o.slice(de, de + n)));
  if (txt(0, 4) === 'RIFF' && txt(8, 4) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  return null;
}

const DATA_URI = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i;
function decoder(u: unknown): { octets: Uint8Array; type: string; ext: string } | null {
  if (typeof u !== 'string') return null;
  const m = DATA_URI.exec(u.replace(/\s+/g, ''));
  if (!m || Math.floor(m[2].length * 3 / 4) > MAX_OCTETS) return null;
  try {
    const octets = new Uint8Array(Buffer.from(m[2], 'base64'));
    if (!octets.length || octets.length > MAX_OCTETS) return null;
    const t = typeImage(octets);
    return t ? { octets, ...t } : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body?.token === 'string' ? body.token : '';
    if (!token || token.length < 12 || token.length > 128) {
      return NextResponse.json({ ok: false, error: 'lien invalide' }, { status: 401 });
    }
    const sb = base();

    /* La serrure : le lien doit exister et l'espace être actif. */
    const { data: recherche } = await sb.from('recherches')
      .select('id, client_id, espace_actif').eq('token_espace', token).maybeSingle();
    if (!recherche || recherche.espace_actif === false) {
      return NextResponse.json({ ok: false, error: 'lien invalide' }, { status: 401 });
    }

    /* Ce qu'il envoie. Un texte qui n'est pas un lien : on le lui dit
       (l'écran le dit déjà, la route revérifie). */
    const brut = typeof body.url === 'string' ? body.url.trim() : '';
    const url = brut ? lienPropre(brut) : null;
    if (brut && !url) return NextResponse.json({ ok: false, error: 'lien' }, { status: 400 });
    const brutes: unknown[] = Array.isArray(body.photos) ? body.photos.slice(0, PHOTOS_MAX) : [];
    const photos = brutes.map(decoder).filter((x): x is NonNullable<ReturnType<typeof decoder>> => !!x);
    if (brutes.length && photos.length < brutes.length) return NextResponse.json({ ok: false, error: 'photo' }, { status: 400 });
    if (!url && !photos.length) return NextResponse.json({ ok: false, error: 'vide' }, { status: 400 });
    const aime = (Array.isArray(body.aime) ? body.aime : []).filter((x: unknown): x is string => typeof x === 'string' && AIMES.includes(x));
    const mot = nettoie(body.mot, 800) || null;

    /* Pas plus de PAR_JOUR par jour. La table absente (SQL pas passé) : on
       le dit, sans rien écrire. */
    const depuis24h = new Date(Date.now() - 86_400_000).toISOString();
    const compte = await sb.from('annonces_client').select('id', { count: 'exact', head: true })
      .eq('recherche_id', recherche.id).gte('created_at', depuis24h);
    if (compte.error) {
      if (tableAbsente(compte.error)) return NextResponse.json({ ok: false, error: 'indisponible' }, { status: 503 });
      console.error('[espace/annonce] compte', compte.error.message);
      return NextResponse.json({ ok: false, error: 'erreur' }, { status: 500 });
    }
    if ((compte.count || 0) >= PAR_JOUR) return NextResponse.json({ ok: false, error: 'trop' }, { status: 429 });

    /* Le même lien, déjà envoyé par lui pour cette recherche, ou déjà dans
       ses biens : rien de nouveau, on lui dit où il est. Un autre lien pour
       le même bien n'est pas reconnu (il faudrait lire les annonces). */
    if (url) {
      const [deja, bien] = await Promise.all([
        sb.from('annonces_client').select('*').eq('recherche_id', recherche.id).eq('url', url)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        sb.from('biens').select('id, titre, photos, etape').eq('recherche_id', recherche.id).eq('url', url).limit(1).maybeSingle(),
      ]);
      if (deja.data) {
        let b = null;
        if (deja.data.bien_id) {
          const r = await sb.from('biens').select('titre, photos, etape').eq('id', deja.data.bien_id).maybeSingle();
          b = r.data || null;
        }
        return NextResponse.json({ ok: true, deja: true, annonce: annoncePourEspace(deja.data, b) });
      }
      if (bien.data?.etape === 'presente') {
        return NextResponse.json({ ok: true, dansVosBiens: bien.data.id });
      }
    }

    /* Les photos d'abord, rangées sous annonces/<id>/ ; la ligne ensuite.
       Une photo qui ne passe pas : rien ne s'enregistre, il réessaie. */
    const id = crypto.randomUUID();
    const deposees: string[] = [];
    const urls: string[] = [];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      const chemin = `annonces/${id}/${i + 1}-${Date.now()}.${p.ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(chemin, p.octets, { contentType: p.type, upsert: false });
      if (error) {
        console.error('[espace/annonce] photo', error.message);
        if (deposees.length) await sb.storage.from(BUCKET).remove(deposees);
        return NextResponse.json({ ok: false, error: 'photo' }, { status: 500 });
      }
      deposees.push(chemin);
      urls.push(sb.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl);
    }

    const ligne = {
      id, client_id: recherche.client_id, recherche_id: recherche.id,
      url, portail: siteDe(url)?.nom || null, photos: urls, aime, mot, statut: 'nouveau',
    };
    const { data: cree, error: eIns } = await sb.from('annonces_client').insert(ligne).select('*').single();
    if (eIns || !cree) {
      console.error('[espace/annonce] enregistrement', eIns?.message);
      if (deposees.length) await sb.storage.from(BUCKET).remove(deposees);
      return NextResponse.json({ ok: false, error: 'enregistrement' }, { status: 500 });
    }

    /* Pour Alexandre : une ligne au Suivi (rangée avec les messages), une
       relance comme pour un message (une seule en attente à la fois), et
       l'événement de l'espace. Secondaires : notés s'ils ne passent pas. */
    const quoi = titreAnnonce({ url, photos: urls });
    const detail = [
      url || `${urls.length} photo${urls.length > 1 ? 's' : ''}, sans lien`,
      aime.length ? `Ce qui lui plaît : ${aime.join(', ').toLowerCase()}` : '',
      mot ? `« ${mot} »` : '',
    ].filter(Boolean).join('\n');
    await ecritServeur('[espace/annonce] journal', sb.from('journal').insert({
      client_id: recherche.client_id, recherche_id: recherche.id,
      type: 'message_client', titre: `📩 Annonce envoyée depuis son espace — ${quoi}`,
      description: detail, metadata: { annonce_id: id },
    }));
    const { count: dejaRelance } = await sb.from('relances').select('id', { count: 'exact', head: true })
      .eq('recherche_id', recherche.id).eq('type', 'message_client').eq('statut', 'en_attente');
    if (!dejaRelance) {
      const demain = new Date(); demain.setDate(demain.getDate() + 1);
      await ecritServeur('[espace/annonce] relance', sb.from('relances').insert({
        client_id: recherche.client_id, recherche_id: recherche.id,
        type: 'message_client', statut: 'en_attente', date_echeance: demain.toISOString(),
        note: `Annonce envoyée depuis l’espace : ${quoi}${mot ? ` — ${mot.slice(0, 140)}` : ''}`,
      }));
    }
    /* espace_evenements a une liste de types fermée : une annonce est un message. */
    await ecritServeur('[espace/annonce] événement', sb.from('espace_evenements').insert({
      recherche_id: recherche.id, client_id: recherche.client_id, bien_id: null,
      type: 'message', detail: `A envoyé une annonce : ${quoi}`.slice(0, 300),
    }));

    return NextResponse.json({ ok: true, annonce: annoncePourEspace(cree, null) });
  } catch (e: unknown) {
    console.error('[espace/annonce]', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: 'erreur' }, { status: 500 });
  }
}
