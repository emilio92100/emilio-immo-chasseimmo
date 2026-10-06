import { createClient } from '@supabase/supabase-js';
import { composerAdresse, adresseUtile, cleAdresse, placerAdresses, garderPositions } from '@/lib/carte';
import { diffuseSur } from '@/lib/diffusion';
import { bienPourSite, gpsFiche, type BienSite } from '@/lib/flux-site';
import type { BienVente } from '@/lib/biens-vente';

/* ═══ Les biens publiés sur le site, lus côté serveur (V3.92) ══════════════
   Pour /api/flux-site (le JSON du site) et /api/flux-site/sitemap (le plan
   que lit Google). La clé de service lit la base : ces routes sont publiques
   (src/proxy.ts) et ne rendent que ce que `bienPourSite` laisse sortir.

   Un bien sans position dans sa fiche est placé par son adresse, comme sur
   la carte du CRM (src/lib/carte.ts) : une adresse cherchée une fois est
   gardée dans `geocodes`. L'adresse elle-même ne sort jamais. */

export function baseServeur() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export async function lireBiensSite(): Promise<{ biens: BienSite[]; brut: BienVente[] }> {
  const sb = baseServeur();
  /* V3.96 : toutes les étapes — un bien retiré ou vendu peut être diffusé
     quand même, à la demande d'Alexandre (lib/diffusion.ts). */
  const { data, error } = await sb.from('biens_vente').select('*').eq('archive', false);
  if (error) throw new Error(error.message);
  const brut = ((data || []) as BienVente[]).filter(b => diffuseSur(b, 'site'));

  const gps = new Map<string, { lat: number; lng: number }>();
  const aPlacer = new Map<string, string>();   // id du bien → adresse
  for (const b of brut) {
    const g = gpsFiche(b);
    if (g) { gps.set(b.id, g); continue; }
    const d = b.donnees || {};
    const adresse = typeof d.adresse === 'string' ? d.adresse : b.adresse || '';
    if (adresseUtile(adresse)) aPlacer.set(b.id, composerAdresse(adresse, b.code_postal || (typeof d.cp === 'string' ? d.cp : ''), b.ville || (typeof d.ville === 'string' ? d.ville : '')));
  }
  if (aPlacer.size) {
    try {
      const res = await placerAdresses(sb, [...aPlacer.values()]);
      for (const [id, a] of aPlacer) {
        const p = res.positions.get(cleAdresse(a));
        if (p && p.precision !== 'municipality') gps.set(id, { lat: p.lat, lng: p.lng });
      }
      if (res.aEcrire.length && !res.tableAbsente) await garderPositions(sb, res.aEcrire);
    } catch { /* le géocodeur ne répond pas : ces biens n'auront pas de point sur la carte du site */ }
  }

  /* V3.94 : deux fiches ne partagent jamais une adresse sur le site. Si
     deux biens portent le même numéro ImmoFacile (un doublon dans le CRM),
     le plus ancien le garde, l'autre prend sa référence du CRM. */
  const vus = new Set<string>();
  const biens = [...brut].sort((x, y) => (x.created_at || '').localeCompare(y.created_at || ''))
    .map(b => {
      const s = bienPourSite(b, gps.get(b.id) || null);
      if (vus.has(s.id)) s.id = vus.has(b.reference || '') || !b.reference ? b.id : b.reference;
      vus.add(s.id);
      return s;
    })
    .sort((x, y) => y.dateAdded.localeCompare(x.dateAdded));
  return { biens, brut };
}
