import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_BADGE, badgeValide } from '@/lib/badge';
import { ecritServeur } from '@/lib/ecritures';
import { baseServeur } from '@/lib/flux-site-serveur';
import { FLUX_IMMOFACILE, blocAnnonce } from '@/lib/flux-immofacile';
import { bienDepuisFlux } from '@/lib/bien-depuis-flux';
import { copierPhotosImmoFacile } from '@/lib/photos-immofacile';
import { colonnesBien, referenceSuivante } from '@/lib/biens-vente';
import { SUPPORTS_DEFAUT, nouvelleDiffusion } from '@/lib/diffusion';

/* ═══ Créer dans le CRM un bien en ligne chez ImmoFacile (V3.95) ═══════════
   POST /api/diffusion/creer { numero } → { ok, id, reference, photos, existe? }

   Pour une annonce du flux d'ImmoFacile qu'aucune fiche du CRM ne reprend
   (le bandeau de la reprise la dit « Pas retrouvée dans le CRM ») : la fiche
   est préparée par lib/bien-depuis-flux.ts, créée « En vente » avec la
   référence suivante du CRM, ses photos copiées chez nous, son numéro
   ImmoFacile gardé (l'adresse de sa page sur le site ne change pas), et
   publiée sur le site seulement (les portails se cochent dans la fiche).

   Jamais deux fois : un bien qui porte déjà ce numéro est rendu tel quel.
   Route du CRM : derrière le badge (proxy.ts), revérifié ici. */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await badgeValide(req.cookies.get(COOKIE_BADGE)?.value))) {
    return NextResponse.json({ ok: false, erreur: 'non_autorise' }, { status: 401 });
  }
  let numero = '';
  try { numero = String(((await req.json()) as { numero?: unknown }).numero || '').trim(); } catch { /* corps illisible */ }
  if (!/^\d{4,12}$/.test(numero)) return NextResponse.json({ ok: false, erreur: 'Numéro d’annonce manquant.' }, { status: 400 });

  const sb = baseServeur();
  const { data: tous, error: eTous } = await sb.from('biens_vente').select('id, reference, archive, donnees');
  if (eTous) return NextResponse.json({ ok: false, erreur: eTous.message });
  const deja = (tous || []).find(b => !b.archive && String(((b.donnees || {}) as Record<string, unknown>).idImmofacile || '') === numero);
  if (deja) return NextResponse.json({ ok: true, existe: true, id: deja.id, reference: deja.reference, photos: 0 });

  let xml = '';
  try {
    const r = await fetch(FLUX_IMMOFACILE, { cache: 'no-store' });
    if (!r.ok) throw new Error(`ImmoFacile répond ${r.status}`);
    xml = new TextDecoder('iso-8859-1').decode(await r.arrayBuffer());
  } catch (e) {
    return NextResponse.json({ ok: false, erreur: `Le flux d’ImmoFacile n’a pas pu être lu (${(e as Error).message}).` });
  }
  const bloc = blocAnnonce(xml, numero);
  if (!bloc) return NextResponse.json({ ok: false, erreur: `L’annonce n° ${numero} n’est plus dans le flux d’ImmoFacile.` });
  const f = bienDepuisFlux(bloc);
  const d = { ...f.donnees, diffusion: nouvelleDiffusion(true, { ...SUPPORTS_DEFAUT, seloger: false, jinka: false, bd: false }) } as Record<string, unknown>;

  /* La fiche, « En vente », à la suite des références du CRM. */
  const maintenant = new Date().toISOString();
  const { data: cree, error: eCree } = await sb.from('biens_vente').insert({
    reference: referenceSuivante((tous || []).map(b => b.reference as string | null)), etape: 'mandat', etape_le: maintenant, en_vente_le: maintenant,
    ...colonnesBien(d), donnees: d,
  }).select('id, reference').single();
  if (eCree || !cree) return NextResponse.json({ ok: false, erreur: `Le bien n’a pas pu être créé (${eCree?.message || 'réponse vide'}).` });

  /* Ses photos, copiées chez nous, dans l'ordre d'ImmoFacile. */
  const avertissements: string[] = [];
  const copies = (await copierPhotosImmoFacile(sb, cree.id, f.photos)).filter((p): p is { url: string; chemin: string } => !!p);
  if (copies.length) {
    const photos = copies.map(p => ({ url: p.url, chemin: p.chemin, legende: '' }));
    await ecritServeur('Les photos du bien', sb.from('biens_vente').update({ donnees: { ...d, photos }, photo: photos[0].url }).eq('id', cree.id), avertissements);
  }
  if (copies.length < f.photos.length) avertissements.push(`${f.photos.length - copies.length} photo(s) sur ${f.photos.length} n’ont pas pu être copiées`);

  /* Son historique. */
  await ecritServeur('L’historique du bien', sb.from('biens_vente_suivi').insert([
    { bien_id: cree.id, type: 'note', le: maintenant, commentaire: `Créé depuis l’annonce ImmoFacile n° ${numero}, en ligne sur le site, qu’aucune fiche du CRM ne reprenait.`, donnees: { source: 'immofacile', numero } },
    { bien_id: cree.id, type: 'etape', statut: 'mandat', le: maintenant, donnees: { de: 'creation', depuis: 'immofacile' } },
  ]), avertissements);

  return NextResponse.json({ ok: true, id: cree.id, reference: cree.reference, titre: f.titre, photos: copies.length, ...(avertissements.length ? { avertissements } : {}) });
}
