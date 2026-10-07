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

  const gps = await positionsBiens(sb, brut);

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

/* La position de chaque bien. Pour le site, Jinka et SeLoger (V3.97).

   V3.100 (Jinka, Rémi Bruder, 7 octobre : le 68 avenue d'Iéna, Paris 16e,
   envoyé avec un point près de Fréjus, à 700 km) : la position gardée dans
   la fiche (`donnees.gps`) vient de la suggestion d'adresse choisie pendant
   la frappe, et elle n'était jamais revue si l'adresse, le code postal ou la
   ville changeaient ensuite. Désormais, chaque adresse est aussi cherchée
   (une fois, gardée dans `geocodes`), avec son code postal et sa ville, et
   le résultat n'est cru que s'il tombe dans ce code postal (ou au moins ce
   département). Puis :
     · la fiche et l'adresse d'accord (moins de 3 km) : la fiche, plus précise ;
     · en désaccord : l'adresse, si elle est trouvée au numéro ou à la rue ;
       sinon, aucun point — mieux vaut pas de point qu'un point faux ;
     · pas d'adresse cherchable : la fiche, seulement si elle tombe en France. */
const RAYON_KM = 3;
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}
/* La France métropolitaine, Corse comprise : un garde-fou grossier. */
const enFrance = (p: { lat: number; lng: number }) => p.lat > 41.2 && p.lat < 51.2 && p.lng > -5.3 && p.lng < 9.7;
/* Le résultat du géocodeur est-il dans le bon code postal ? Son libellé le
   porte (« 68 Avenue d'Iéna 75016 Paris »). Paris, Lyon, Marseille : un
   arrondissement voisin passe (même département) ; ailleurs aussi, car une
   commune peut avoir plusieurs codes postaux. */
function bonCodePostal(libelle: string | null, cp: string): boolean {
  const c = cp.replace(/\s/g, '');
  if (!/^\d{5}$/.test(c)) return true;              // pas de code postal sûr : on ne peut pas vérifier
  const trouve = /\b(\d{5})\b/.exec(libelle || '')?.[1];
  if (!trouve) return false;
  const dep = (x: string) => (x.startsWith('97') ? x.slice(0, 3) : x.slice(0, 2));
  return trouve === c || dep(trouve) === dep(c);
}

export async function positionsBiens(sb: ReturnType<typeof baseServeur>, brut: BienVente[]): Promise<Map<string, { lat: number; lng: number }>> {
  const gps = new Map<string, { lat: number; lng: number }>();
  const aPlacer = new Map<string, { adresse: string; cp: string }>();   // id du bien → adresse complète
  for (const b of brut) {
    const d = b.donnees || {};
    const adresse = typeof d.adresse === 'string' ? d.adresse : b.adresse || '';
    const cp = String(b.code_postal || (typeof d.cp === 'string' ? d.cp : '') || '').trim();
    const ville = String(b.ville || (typeof d.ville === 'string' ? d.ville : '') || '').trim();
    /* Une adresse sans code postal ni ville se perdrait n'importe où en France. */
    if (adresseUtile(adresse) && (cp || ville)) aPlacer.set(b.id, { adresse: composerAdresse(adresse, cp, ville), cp });
  }
  let positions = new Map<string, { lat: number; lng: number; precision: string; libelle: string | null }>();
  if (aPlacer.size) {
    try {
      const res = await placerAdresses(sb, [...aPlacer.values()].map(x => x.adresse));
      positions = res.positions;
      if (res.aEcrire.length && !res.tableAbsente) await garderPositions(sb, res.aEcrire);
    } catch { /* le géocodeur ne répond pas : on s'en tient aux fiches (en France) */ }
  }
  for (const b of brut) {
    const fiche = gpsFiche(b);
    const a = aPlacer.get(b.id);
    const p = a ? positions.get(cleAdresse(a.adresse)) : undefined;
    const adresseSure = p && bonCodePostal(p.libelle, a!.cp) ? p : null;
    const precise = adresseSure && adresseSure.precision !== 'municipality' ? adresseSure : null;
    if (fiche && adresseSure) {
      if (distanceKm(fiche, adresseSure) <= RAYON_KM) gps.set(b.id, fiche);
      else if (precise) gps.set(b.id, { lat: precise.lat, lng: precise.lng });
      else if (distanceKm(fiche, adresseSure) <= 15) gps.set(b.id, fiche);   // la ville seule : la fiche y est, on la garde
      else console.warn(`[positions] ${b.reference || b.id} : la position de la fiche est à ${Math.round(distanceKm(fiche, adresseSure))} km de son adresse, pas de point.`);
    } else if (fiche) {
      if (enFrance(fiche)) gps.set(b.id, fiche);
    } else if (precise) gps.set(b.id, { lat: precise.lat, lng: precise.lng });
  }
  return gps;
}
