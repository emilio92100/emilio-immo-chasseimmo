import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_BADGE, badgeValide } from '@/lib/badge';
import { ecritServeur } from '@/lib/ecritures';
import { baseServeur } from '@/lib/flux-site-serveur';
import { ANNONCES_JINKA, FLUX_IMMOFACILE, lireFluxImmoFacile, rapprocher, type BienARapprocher } from '@/lib/flux-immofacile';
import { lireDiffusion, nouvelleDiffusion } from '@/lib/diffusion';

/* ═══ Reprendre d'ImmoFacile ce qui sert à la diffusion (V3.92) ════════════
   POST /api/diffusion/reprise → { ok, lus, relies: [...], seules: [...], erreur? }

   Lit le flux XML d'ImmoFacile (tant qu'il existe) et, pour chaque bien qui
   s'y trouve et se retrouve dans le CRM (src/lib/flux-immofacile.ts) :
     · garde son numéro ImmoFacile (`donnees.idImmofacile`) ;
     · garde sa position (`donnees.gps`) si la fiche n'en a pas ;
     · pose un premier réglage de diffusion si la fiche n'en a pas encore :
       le site ; Jinka et SeLoger s'il est dans la liste de Jinka ; jamais
       Belles Demeures. Un réglage déjà fait n'est jamais touché.
   Relançable : la deuxième fois, il n'y a plus rien à écrire.

   Route du CRM : derrière le badge (proxy.ts), revérifié ici. */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ligne = BienARapprocher & { etape: string; archive: boolean; titre: string | null };

export async function POST(req: NextRequest) {
  if (!(await badgeValide(req.cookies.get(COOKIE_BADGE)?.value))) {
    return NextResponse.json({ ok: false, erreur: 'non_autorise' }, { status: 401 });
  }
  let xml = '';
  try {
    const r = await fetch(FLUX_IMMOFACILE, { cache: 'no-store' });
    if (!r.ok) throw new Error(`ImmoFacile répond ${r.status}`);
    xml = new TextDecoder('iso-8859-1').decode(await r.arrayBuffer());
  } catch (e) {
    return NextResponse.json({ ok: false, erreur: `Le flux d’ImmoFacile n’a pas pu être lu (${(e as Error).message}). Est-il encore en ligne ?` });
  }
  const annonces = lireFluxImmoFacile(xml);
  if (!annonces.length) return NextResponse.json({ ok: false, erreur: 'Le flux d’ImmoFacile est vide : rien à reprendre.' });

  const sb = baseServeur();
  const { data, error } = await sb.from('biens_vente').select('id, reference, etape, archive, titre, code_postal, prix, surface, mandat_numero, donnees');
  if (error) return NextResponse.json({ ok: false, erreur: error.message });
  const biens = (data || []) as Ligne[];
  const { liens, seules } = rapprocher(annonces, biens);

  const avertissements: string[] = [];
  const relies: { id: string; reference: string | null; titre: string | null; numero: string; par: string; ecrit: string[] }[] = [];
  for (const l of liens) {
    const b = biens.find(x => x.id === l.bienId)!;
    const d = { ...(b.donnees || {}) } as Record<string, unknown>;
    const ecrit: string[] = [];
    if (String(d.idImmofacile || '') !== l.annonce.affId) { d.idImmofacile = l.annonce.affId; ecrit.push('numéro'); }
    if (!d.gps && l.annonce.lat !== null && l.annonce.lng !== null) { d.gps = { lat: l.annonce.lat, lon: l.annonce.lng }; ecrit.push('position'); }
    if (!lireDiffusion(d)) {
      const chezJinka = ANNONCES_JINKA.has(l.annonce.affId);
      d.diffusion = nouvelleDiffusion(true, { site: true, seloger: chezJinka, bd: false, jinka: chezJinka });
      ecrit.push('diffusion');
    }
    if (ecrit.length) {
      const ok = await ecritServeur(`Le bien ${b.reference || b.id}`, sb.from('biens_vente').update({ donnees: d, updated_at: new Date().toISOString() }).eq('id', b.id), avertissements);
      if (!ok) continue;
    }
    relies.push({ id: b.id, reference: b.reference, titre: b.titre, numero: l.annonce.affId, par: l.par, ecrit });
  }
  return NextResponse.json({
    ok: true, lus: annonces.length, relies,
    seules: seules.map(a => ({ numero: a.affId, titre: a.titre, prix: a.prix, cp: a.cp, ville: a.ville })),
    ...(avertissements.length ? { avertissements } : {}),
  });
}
