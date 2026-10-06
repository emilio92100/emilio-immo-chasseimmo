import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_BADGE, badgeValide } from '@/lib/badge';
import { ecritServeur } from '@/lib/ecritures';
import { baseServeur } from '@/lib/flux-site-serveur';
import { ANNONCES_JINKA, FLUX_IMMOFACILE, lireFluxImmoFacile, rapprocher, type BienARapprocher } from '@/lib/flux-immofacile';
import { SUPPORTS_DEFAUT, etapeDiffusee, lireDiffusion, nouvelleDiffusion } from '@/lib/diffusion';

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

   V3.94 : un bien qui porte le numéro d'une annonce sans lui ressembler (ou
   qu'un autre bien a pris) le perd, avec la position qui venait d'elle
   (`delies`). Relancer la reprise corrige donc un mauvais lien. Les
   changements d'un même bien partent en une seule écriture.

   V3.95 (Alexandre : « s'ils n'étaient pas dans le flux, autant les mettre
   sans diffusion ») : un bien en vente, sous offre, sous compromis ou
   annonce type, qu'aucune annonce d'ImmoFacile ne reprend et qui n'a pas
   encore de réglage, passe en « Non diffusé » — la situation d'aujourd'hui.
   Les supports par défaut sont gardés cochés : un clic le met en ligne.

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
  const { liens, seules, delier } = rapprocher(annonces, biens);

  /* Ce qui change, bien par bien : d'abord les numéros à retirer, puis les
     liens à poser, sur la même copie de la fiche. */
  const fiches = new Map<string, { d: Record<string, unknown>; ecrit: string[] }>();
  const fiche = (id: string) => {
    let f = fiches.get(id);
    if (!f) { f = { d: { ...(biens.find(x => x.id === id)!.donnees || {}) }, ecrit: [] }; fiches.set(id, f); }
    return f;
  };
  const memePoint = (g: unknown, lat: number | null, lng: number | null) => {
    const p = g as { lat?: unknown; lon?: unknown } | null;
    return !!p && lat !== null && lng !== null && Math.abs(Number(p.lat) - lat) < 1e-6 && Math.abs(Number(p.lon) - lng) < 1e-6;
  };
  for (const x of delier) {
    const f = fiche(x.bienId);
    delete f.d.idImmofacile;
    f.ecrit.push('numéro retiré');
    if (memePoint(f.d.gps, x.annonce.lat, x.annonce.lng)) { delete f.d.gps; f.ecrit.push('position retirée'); }
  }
  for (const l of liens) {
    const f = fiche(l.bienId);
    if (String(f.d.idImmofacile || '') !== l.annonce.affId) { f.d.idImmofacile = l.annonce.affId; f.ecrit.push('numéro'); }
    if (!f.d.gps && l.annonce.lat !== null && l.annonce.lng !== null) { f.d.gps = { lat: l.annonce.lat, lon: l.annonce.lng }; f.ecrit.push('position'); }
    if (!lireDiffusion(f.d)) {
      const chezJinka = ANNONCES_JINKA.has(l.annonce.affId);
      f.d.diffusion = nouvelleDiffusion(true, { site: true, seloger: chezJinka, bd: false, jinka: chezJinka });
      f.ecrit.push('diffusion');
    }
  }

  /* Pas en ligne chez ImmoFacile, pas encore réglé : « Non diffusé ». */
  const relie = new Set(liens.map(l => l.bienId));
  const nonDiffuses: string[] = [];
  for (const b of biens) {
    if (b.archive || relie.has(b.id) || !etapeDiffusee(b.etape)) continue;
    const f = fiche(b.id);
    if (lireDiffusion(f.d)) continue;
    f.d.diffusion = nouvelleDiffusion(false, SUPPORTS_DEFAUT);
    f.ecrit.push('non diffusé');
    nonDiffuses.push(b.id);
  }

  const avertissements: string[] = [];
  const echecs = new Set<string>();
  for (const [id, f] of fiches) {
    if (!f.ecrit.length) continue;
    const b = biens.find(x => x.id === id)!;
    const ok = await ecritServeur(`Le bien ${b.reference || b.id}`, sb.from('biens_vente').update({ donnees: f.d, updated_at: new Date().toISOString() }).eq('id', id), avertissements);
    if (!ok) echecs.add(id);
  }
  const relies = liens.filter(l => !echecs.has(l.bienId)).map(l => {
    const b = biens.find(x => x.id === l.bienId)!;
    return { id: b.id, reference: b.reference, titre: b.titre, numero: l.annonce.affId, par: l.par, ecrit: (fiches.get(b.id)?.ecrit || []).filter(e => !e.includes('retir')) };
  });
  const delies = delier.filter(x => !echecs.has(x.bienId)).map(x => {
    const b = biens.find(y => y.id === x.bienId)!;
    return { id: b.id, reference: b.reference, titre: b.titre, numero: x.annonce.affId, annonce: x.annonce.titre, archive: b.archive };
  });
  return NextResponse.json({
    ok: true, lus: annonces.length, relies, delies,
    nonDiffuses: nonDiffuses.filter(id => !echecs.has(id)).map(id => { const b = biens.find(x => x.id === id)!; return { id, reference: b.reference, titre: b.titre }; }),
    seules: seules.map(a => ({ numero: a.affId, titre: a.titre, prix: a.prix, cp: a.cp, ville: a.ville })),
    ...(avertissements.length ? { avertissements } : {}),
  });
}
