/* ═══ Le flux des biens pour le site emilio-immo.com (V3.92) ═══════════════
   Le site lisait les biens d'ImmoFacile, par sa fonction `fetch-properties`
   qui traduisait le flux XML en JSON. Il les lit désormais ici, au même
   format JSON : le site n'a que l'adresse à changer, pas son code
   (dépôt emilio-immo.modernelovable, src/lib/properties.ts).

   Ne part que ce que la fiche dit de publier (lib/diffusion.ts :
   `diffuseSur(bien, 'site')`), et seulement ce qu'une annonce peut dire :
   jamais le propriétaire, l'adresse exacte, les codes, les notes ni le
   mandat. La position sert à la carte du site.

   L'adresse d'un bien sur le site, /biens/<id> : son numéro ImmoFacile pour
   un bien repris (les liens déjà partagés et ceux que Google connaît restent
   bons), sinon sa référence du CRM (EMI-V-2026-014). Isomorphe. */

import { num, txt, liste } from '@/lib/actes';
import { argentBien, lirePhotos, lirePieces, mentionsAnnonce, nomExpo, titreBien, type BienVente } from '@/lib/biens-vente';

/* Le format que lit le site (son interface `Property`). `statut` et
   `mentions` sont en plus : le site peut s'en servir plus tard. */
export type BienSite = {
  id: string; title: string; price: number; city: string; postalCode: string; surface: number; rooms: number; bedrooms: number;
  type: string; description: string; images: string[]; dateAdded: string; exclusive: boolean;
  energyClass?: string; gesClass?: string; orientation?: string; floor?: number; totalFloors?: number; yearBuilt?: number;
  heating?: string; parking?: number; cave?: boolean; balcony?: boolean; terrace?: boolean; elevator?: boolean; guardian?: boolean;
  charges?: number; taxeFonciere?: number; consoEnergie?: number; valeurGes?: number; latitude?: number; longitude?: number;
  garden?: boolean; roomDetails?: { type: string; surface: number; description: string; level: number | null }[];
  statut: 'en_vente' | 'sous_offre' | 'sous_compromis'; mentions: string;
};

export const idSite = (b: Pick<BienVente, 'id' | 'reference' | 'donnees'>): string => {
  const d = b.donnees || {};
  const n = typeof d.idImmofacile === 'string' || typeof d.idImmofacile === 'number' ? String(d.idImmofacile).trim() : '';
  return n || (b.reference || '').trim() || b.id;
};

const TYPE_SITE: Record<string, string> = {
  appartement: 'Appartement', duplex: 'Appartement', studio: 'Appartement', loft: 'Appartement',
  maison: 'Maison', immeuble: 'Immeuble', terrain: 'Terrain', local: 'Local commercial', parking: 'Parking', autre: 'Appartement',
};
const CHAUFFAGE_MODE: Record<string, string> = { individuel: 'Individuel', collectif: 'Collectif' };
const CHAUFFAGE_ENERGIE: Record<string, string> = { gaz: 'gaz', electrique: 'électrique', pac: 'pompe à chaleur', fioul: 'fioul', bois: 'bois', urbain: 'réseau urbain' };

/* « Rez-de-chaussée » → 0, « 2e étage » → 2 ; un niveau sans numéro : rien. */
function niveau(t: string): number | null {
  const s = t.toLowerCase();
  if (/rez/.test(s)) return 0;
  if (/sous-sol/.test(s)) return -1;
  const m = s.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}
const jour = (x: string | null | undefined) => (x && !Number.isNaN(Date.parse(x)) ? new Date(x).toISOString().slice(0, 10) : '');
const positif = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined);

export function bienPourSite(b: BienVente, gps?: { lat: number; lng: number } | null): BienSite {
  const d = b.donnees || {};
  const a = argentBien(d);
  const annexes = liste(d, 'annexes');
  const immeuble = liste(d, 'immeuble');
  const texte = txt(d, 'annonceTexte');
  const mentions = mentionsAnnonce(d);
  /* Les mentions légales (prix et honoraires, copropriété, DPE, Géorisques)
     suivent le texte, sauf s'il les porte déjà (une annonce reprise
     d'ImmoFacile les avait souvent). */
  const description = !texte ? mentions : /honoraires/i.test(texte) ? texte : `${texte}\n\n${mentions}`;
  const chauffage = [CHAUFFAGE_MODE[String(d.chauffageMode || '')], CHAUFFAGE_ENERGIE[String(d.chauffageEnergie || '')]].filter(Boolean).join(' ');
  const g = gps || null;
  const out: BienSite = {
    id: idSite(b),
    title: txt(d, 'annonceTitre') || b.titre || titreBien(d),
    price: b.prix ?? a.prix ?? 0,
    city: b.ville || txt(d, 'ville'),
    postalCode: b.code_postal || txt(d, 'cp'),
    surface: b.surface ?? num(d, 'surface') ?? num(d, 'terrain') ?? 0,
    rooms: b.nb_pieces ?? num(d, 'pieces') ?? 0,
    bedrooms: b.nb_chambres ?? num(d, 'chambres') ?? 0,
    type: TYPE_SITE[String(d.typeBien || b.type_bien || '')] || 'Appartement',
    description,
    images: lirePhotos(d.photos).map(p => p.url),
    dateAdded: jour(b.en_vente_le) || jour(b.created_at),
    exclusive: (b.mandat_type || txt(d, 'mandatType')) === 'exclusif',
    statut: b.etape === 'offre' ? 'sous_offre' : b.etape === 'compromis' ? 'sous_compromis' : 'en_vente',
    mentions,
    roomDetails: lirePieces(d.detailPieces).filter(p => p.nom).map(p => ({ type: p.nom, surface: p.surface || 0, description: p.note || '', level: p.niveau ? niveau(p.niveau) : null })),
  };
  /* Ce que la fiche ne sait pas reste absent, plutôt qu'un zéro trompeur. */
  const opt: Partial<BienSite> = {
    energyClass: typeof d.dpe === 'string' && d.dpe ? d.dpe : undefined,
    gesClass: typeof d.ges === 'string' && d.ges ? d.ges : undefined,
    orientation: d.expo ? nomExpo(d.expo) : undefined,
    floor: typeof num(d, 'etage') === 'number' ? (num(d, 'etage') as number) : undefined,
    totalFloors: positif(num(d, 'etages')),
    yearBuilt: positif(num(d, 'annee')),
    heating: chauffage || undefined,
    parking: positif(num(d, 'nbParking')) ?? (annexes.includes('parking') || annexes.includes('box') || annexes.includes('garage') ? 1 : undefined),
    cave: annexes.includes('cave') || undefined,
    balcony: annexes.includes('balcon') || undefined,
    terrace: annexes.includes('terrasse') || undefined,
    garden: annexes.includes('jardin') || undefined,
    elevator: immeuble.includes('ascenseur') || undefined,
    guardian: immeuble.includes('gardien') || undefined,
    charges: positif(num(d, 'chargesAn')),
    taxeFonciere: positif(num(d, 'taxeFonciere')),
    consoEnergie: positif(num(d, 'dpeValeur')),
    valeurGes: positif(num(d, 'gesValeur')),
    latitude: g ? g.lat : undefined,
    longitude: g ? g.lng : undefined,
  };
  for (const [k, v] of Object.entries(opt)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

/* La position gardée dans la fiche (le choix d'une adresse dans l'éditeur, ou
   le flux d'ImmoFacile) : `donnees.gps`, { lat, lon }. */
export function gpsFiche(b: Pick<BienVente, 'donnees'>): { lat: number; lng: number } | null {
  const g = (b.donnees || {}).gps as { lat?: unknown; lon?: unknown; lng?: unknown } | undefined;
  const lat = Number(g?.lat), lng = Number(g?.lon ?? g?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat && lng ? { lat, lng } : null;
}
