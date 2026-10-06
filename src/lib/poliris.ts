/* ═══ Le fichier POLIRIS 4.12 pour Jinka (V3.97) ═══════════════════════════
   Jinka relève les annonces des agences dans un fichier au format POLIRIS
   (celui de SeLoger), déposé en SFTP (lib/jinka-serveur.ts). Ce que Rémi
   Bruder, de Jinka, a demandé le 28 septembre 2026 :

     · `Annonces.csv`, une ligne par annonce, sans ligne d'en-tête ; chaque
       champ entre guillemets, séparé du suivant par `!#` ; ISO-8859-1 ;
     · seul dans une archive zip, sans sous-dossier ;
     · TOUTES les annonces actives à chaque dépôt (une annonce absente est
       retirée chez eux) ;
     · une annonce reconnue par son identifiant technique, le champ 175,
       qui ne change jamais : pour les annonces déjà chez eux, le numéro
       ImmoFacile du bien (`idImmofacile`) ; sinon la référence du CRM ;
     · le champ 2 (la référence) toujours rempli ; le 1, `emilioimmo` ;
     · les photos par leurs adresses HTTPS publiques (champs 85 à 93, 164 à
       174, 264 à 273) ;
     · très recommandés : la position (298, 299), le DPE et le GES (176 à
       179) avec la date du DPE (324), les mentions ALUR (honoraires,
       copropriété) ;
     · le 301 : `4.12`.

   Ici, rien que du texte : quels biens partent (`diffuseSur(b, 'jinka')`),
   et leurs lignes. Isomorphe : le serveur l'envoie, le CRM peut le montrer.
   Rien de ce qui est privé ne sort : ni le propriétaire, ni l'adresse
   exacte, ni les notes, ni les consignes de visite. */

import { liste, num, txt } from '@/lib/actes';
import { argentBien, lirePhotos, type BienVente } from '@/lib/biens-vente';
import { diffuseSur } from '@/lib/diffusion';
import { bienPourSite, gpsFiche } from '@/lib/flux-site';

export const POLIRIS_VERSION = '4.12';
export const POLIRIS_AGENCE = 'emilioimmo';
export const POLIRIS_NB_CHAMPS = 335;
const BAREME = 'https://www.emilio-immo.com/honoraires';

/* ── Le texte, tel que le format l'accepte ──────────────────────────────── */
/* ISO-8859-1 ne connaît ni ’ ni œ ni € ni … : on les remplace par leurs
   équivalents ; tout autre caractère hors de l'alphabet latin-1 perd son
   accent ou disparaît. Les guillemets deviennent des apostrophes, les
   retours à la ligne des <BR> (seule balise permise). */
const REMPLACER: Record<string, string> = {
  '\u2019': "'", '\u2018': "'", '\u201a': "'", '\u201c': "'", '\u201d': "'", '\u201e': "'",
  '\u0153': 'oe', '\u0152': 'OE', '\u20ac': 'euros', '\u2026': '...', '\u2013': '-', '\u2014': '-', '\u2011': '-', '\u2022': '-',
  '\u202f': ' ', '\u2009': ' ', '\u2007': ' ', '\u200b': '', '\u2028': ' ', '\u2029': ' ', '\u2113': 'l',
};
export function latin1(t: string): string {
  let out = '';
  for (const c of String(t ?? '').normalize('NFC')) {
    if (REMPLACER[c] !== undefined) { out += REMPLACER[c]; continue; }
    if (c.charCodeAt(0) <= 0xff) { out += c; continue; }
    const sans = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (sans.length && [...sans].every(x => x.charCodeAt(0) <= 0xff)) out += sans;
  }
  return out;
}
export function champ(v: unknown, max?: number): string {
  if (v === null || v === undefined || v === false) return '';
  let t = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  t = latin1(t).replace(/"/g, "'").replace(/\r\n?|\n/g, '<BR>').replace(/[\u0000-\u001f]/g, ' ').trim();
  if (max && t.length > max) {
    /* Couper sans laisser un <BR> à moitié. */
    t = t.slice(0, max).replace(/<B?R?$/, '').trimEnd();
  }
  return t;
}
const ouiNon = (x: boolean | null | undefined) => (x === true ? 'OUI' : x === false ? 'NON' : '');
const dateFr = (iso: unknown) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};
const decimal = (n: number | null | undefined, chiffres = 2) =>
  typeof n === 'number' && Number.isFinite(n) ? String(Math.round(n * 10 ** chiffres) / 10 ** chiffres) : '';
const entier = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? String(Math.round(n)) : '');
const positif = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);

/* ── Les codes du format ─────────────────────────────────────────────────── */
const TYPE: Record<string, string> = {
  appartement: 'Appartement', duplex: 'Appartement', studio: 'Appartement', loft: 'Lof/atelier/surface',
  maison: 'Maison/villa', immeuble: 'Immeuble', terrain: 'Terrain', local: 'Local', parking: 'Parking/box', autre: 'Inconnu',
};
const SOUS_TYPE: Record<string, string> = { duplex: 'Duplex' };

/* Le chauffage : la grille de codes du format (annexe « Types de chauffage »). */
function chauffage(mode: string, energie: string): string {
  const e = { gaz: 512, electrique: 2048, fioul: 1024 }[energie] || 0;
  if (energie === 'pac') return '16384';
  if (mode === 'collectif') return String(4096 + e);
  if (mode === 'individuel') return String(8192 + e);
  return e ? String(e) : '';
}
/* La cuisine : 2 américaine, 3 séparée, 5 coin cuisine, 6 américaine équipée,
   7 séparée équipée, 8 coin cuisine équipé, 9 équipée. */
function cuisine(c: string, equip: string): string {
  const eq = equip === 'equipee' || equip === 'amenagee';
  if (c === 'independante') return eq ? '7' : '3';
  if (c === 'ouverte' || c === 'semiOuverte') return eq ? '6' : '2';
  if (c === 'kitchenette') return eq ? '8' : '5';
  return eq ? '9' : '';
}

/* ── L'identifiant technique (champ 175) ────────────────────────────────── */
/* Ne change jamais : le numéro ImmoFacile pour un bien repris (Jinka le
   connaît déjà), sinon la référence du CRM (30 caractères au plus). */
export function idJinka(b: Pick<BienVente, 'id' | 'reference' | 'donnees'>): string {
  const d = b.donnees || {};
  const n = typeof d.idImmofacile === 'string' || typeof d.idImmofacile === 'number' ? String(d.idImmofacile).trim() : '';
  return (n || (b.reference || '').trim() || b.id.replace(/-/g, '')).slice(0, 30);
}

/* ── Une annonce ─────────────────────────────────────────────────────────── */
export function lignePoliris(b: BienVente, gps?: { lat: number; lng: number } | null): string[] {
  const d = b.donnees || {};
  const s = bienPourSite(b, gps ?? gpsFiche(b));
  const a = argentBien(d);
  const annexes = liste(d, 'annexes');
  const immeuble = liste(d, 'immeuble');
  const eq = liste(d, 'equipements');
  const expo = String(d.expo || '');
  const photos = lirePhotos(d.photos).map(p => p.url).filter(u => /^https:\/\//.test(u)).slice(0, 30);
  const typeBien = String(d.typeBien || b.type_bien || '');
  const f: string[] = new Array(POLIRIS_NB_CHAMPS).fill('');
  const mettre = (rang: number, v: unknown, max?: number) => { f[rang - 1] = champ(v, max); };

  mettre(1, POLIRIS_AGENCE);
  mettre(2, b.reference || idJinka(b), 20);
  mettre(3, 'Vente');
  mettre(4, TYPE[typeBien] || 'Appartement');
  mettre(5, s.postalCode, 5);
  mettre(6, s.city, 50);
  mettre(7, 'France');
  if (txt(d, 'quartier')) mettre(9, txt(d, 'quartier'), 64);
  mettre(11, entier(s.price));
  /* Les honoraires : le taux TTC à la charge de l'acquéreur, sur le prix
     hors honoraires ; 0 quand c'est le vendeur qui paie. */
  mettre(15, a.acq && a.taux !== null ? decimal(a.taux) : '0');
  mettre(16, decimal(positif(num(d, 'surface')) ?? positif(s.surface)));
  mettre(17, decimal(positif(num(d, 'terrain'))));
  mettre(18, entier(positif(s.rooms) ?? 1));
  mettre(19, entier(positif(s.bedrooms)));
  mettre(20, s.title, 64);
  mettre(21, s.description, 4000);
  if (typeof s.floor === 'number') mettre(24, entier(s.floor));
  mettre(25, entier(positif(s.totalFloors)));
  mettre(26, eq.includes('meuble') ? 'OUI' : '');
  mettre(27, entier(positif(s.yearBuilt)));
  mettre(29, entier(positif(num(d, 'sdb'))));
  mettre(30, entier(positif(num(d, 'salleseau'))));
  mettre(31, entier(positif(num(d, 'wc'))));
  mettre(33, chauffage(String(d.chauffageMode || ''), String(d.chauffageEnergie || '')));
  mettre(34, cuisine(String(d.cuisine || ''), String(d.cuisineEquip || '')));
  if (expo && expo !== 'traversant') {
    mettre(35, ouiNon(expo.includes('S')));
    mettre(36, ouiNon(expo.includes('E')));
    mettre(37, ouiNon(expo.includes('O')));
    mettre(38, ouiNon(expo.includes('N')));
  }
  if (annexes.includes('balcon')) { mettre(39, '1'); mettre(40, decimal(positif(num(d, 'surfBalcon')))); }
  mettre(41, ouiNon(immeuble.includes('ascenseur') || null));
  mettre(42, ouiNon(annexes.includes('cave') || null));
  const park = positif(num(d, 'nbParking')) ?? (annexes.some(x => x === 'parking') ? 1 : null);
  mettre(43, entier(annexes.includes('box') || annexes.includes('garage') ? null : park));
  mettre(44, entier(annexes.includes('box') || annexes.includes('garage') ? park : null));
  mettre(45, ouiNon(immeuble.includes('digicode') || null));
  mettre(46, ouiNon(immeuble.includes('interphone') || null));
  mettre(47, ouiNon(immeuble.includes('gardien') || null));
  mettre(48, ouiNon(annexes.includes('terrasse') || null));
  mettre(61, ouiNon(eq.includes('alarme') || null));
  mettre(63, ouiNon(eq.includes('calme') || null));
  mettre(64, ouiNon(eq.includes('clim') || null));
  mettre(65, ouiNon(annexes.includes('piscine') || null));
  mettre(66, ouiNon(eq.includes('pmr') || null));
  mettre(68, ouiNon(eq.includes('cheminee') || null));
  mettre(73, ouiNon(eq.includes('placards') || null));
  mettre(78, ouiNon(d.vue === 'degagee' || null));
  mettre(81, ouiNon(typeBien === 'duplex' || null));
  mettre(83, s.exclusive ? 'OUI' : 'NON');
  /* Les photos : 1 à 9, puis 10 à 20, puis 21 à 30. */
  photos.forEach((u, i) => mettre(i < 9 ? 85 + i : i < 20 ? 164 + (i - 9) : 264 + (i - 20), u, 256));
  mettre(108, s.postalCode, 5);
  mettre(109, s.city, 50);
  mettre(112, txt(d, 'mandatNumero') || b.mandat_numero || '', 15);
  mettre(113, dateFr(d.mandatDate));
  mettre(175, idJinka(b));
  /* Le DPE : la classe, ou « VI » (vierge), « NS » (non soumis). */
  const statutDpe = String(d.dpeStatut || '');
  if (statutDpe === 'vierge' || statutDpe === 'non') {
    mettre(177, statutDpe === 'vierge' ? 'VI' : 'NS');
    mettre(179, statutDpe === 'vierge' ? 'VI' : 'NS');
  } else {
    mettre(176, entier(positif(num(d, 'dpeValeur'))));
    mettre(177, s.energyClass || '');
    mettre(178, entier(positif(num(d, 'gesValeur'))));
    mettre(179, s.gesClass || '');
  }
  if (SOUS_TYPE[typeBien]) mettre(181, SOUS_TYPE[typeBien]);
  mettre(191, ouiNon(eq.includes('parquet') || null));
  mettre(216, decimal(positif(num(d, 'sejour'))));
  /* ALUR : la copropriété. */
  if (d.copro === 'oui' || d.copro === 'non') {
    mettre(258, d.copro === 'oui' ? 'OUI' : 'NON');
    if (d.copro === 'oui') {
      mettre(259, entier(positif(num(d, 'lots'))));
      mettre(260, decimal(positif(num(d, 'chargesAn'))));
      if (d.procedure === 'oui' || d.procedure === 'non') mettre(261, d.procedure === 'oui' ? 'OUI' : 'NON');
      if (d.procedure === 'oui') mettre(262, txt(d, 'procedureNature'), 128);
    }
  }
  if (typeof s.latitude === 'number' && typeof s.longitude === 'number') {
    mettre(298, decimal(s.latitude, 6));
    mettre(299, decimal(s.longitude, 6));
  }
  mettre(301, POLIRIS_VERSION);
  /* ALUR : qui paie les honoraires, et le prix hors honoraires acquéreur. */
  mettre(302, a.acq ? '1' : '2');
  if (a.acq && a.net) mettre(303, entier(a.net));
  mettre(307, BAREME, 256);
  const dpeDate = dateFr(d.dpeDate);
  if (dpeDate && statutDpe !== 'vierge' && statutDpe !== 'non') {
    mettre(324, dpeDate);
    mettre(325, String(d.dpeDate) >= '2021-07-01' ? 'DPE_v07-2021' : 'DPE_v01-2011');
  }
  mettre(326, decimal(positif(num(d, 'coutMin'))));
  mettre(327, decimal(positif(num(d, 'coutMax'))));
  mettre(328, entier(positif(num(d, 'coutAnnee'))));
  if (annexes.includes('terrasse')) mettre(329, decimal(positif(num(d, 'surfTerrasse'))));
  return f;
}

/* ── Le fichier ──────────────────────────────────────────────────────────── */
export type FichierPoliris = { csv: string; ids: string[]; biens: { id: string; reference: string | null; jinka: string }[]; avertissements: string[] };

export function fichierPoliris(biens: BienVente[], gps?: Map<string, { lat: number; lng: number }>): FichierPoliris {
  const lignes: string[] = [];
  const ids: string[] = [];
  const retenus: FichierPoliris['biens'] = [];
  const avertissements: string[] = [];
  /* Le plus ancien d'abord : en cas de doublon d'identifiant, il le garde. */
  for (const b of [...biens].sort((x, y) => (x.created_at || '').localeCompare(y.created_at || ''))) {
    if (!diffuseSur(b, 'jinka')) continue;
    const f = lignePoliris(b, gps?.get(b.id) || null);
    const id = f[174];
    const nom = b.reference || b.titre || b.id;
    if (ids.includes(id)) { avertissements.push(`${nom} : même identifiant qu’un autre bien (${id}), laissé de côté`); continue; }
    const manque = [[5, 'code postal'], [6, 'ville'], [11, 'prix'], [20, 'titre'], [21, 'texte de l’annonce']].filter(([r]) => !f[(r as number) - 1]).map(([, l]) => l);
    if (manque.length) { avertissements.push(`${nom} : il manque ${manque.join(', ')}, laissé de côté`); continue; }
    if (!f[84]) avertissements.push(`${nom} : aucune photo`);
    ids.push(id);
    retenus.push({ id: b.id, reference: b.reference, jinka: id });
    lignes.push(f.map(x => `"${x}"`).join('!#'));
  }
  return { csv: lignes.length ? `${lignes.join('\r\n')}\r\n` : '', ids, biens: retenus, avertissements };
}
