/* ═══ L'annonce pour SeLoger et Belles Demeures (V3.98) ════════════════════
   SeLoger reçoit les annonces par son API « Aviv Classified » (v4) : une
   annonce par appel, en JSON, au fil des changements du CRM
   (lib/seloger-serveur.ts). SeLoger la reprend d'office sur Logic-Immo ;
   Belles Demeures est un autre « portail » de la même API (`BD`), coché
   bien par bien.

   Ici, rien que la traduction d'un bien du CRM en annonce, au format du
   schéma (l'OpenAPI d'AVIV, `AvivClassified`). Isomorphe.

   Ce qui sort, et ce qui ne sort pas :
     · l'identifiant de l'annonce chez SeLoger (`offererEstateId`) ne change
       jamais : le numéro ImmoFacile pour un bien repris, sinon la référence
       du CRM — le même que pour Jinka (lib/poliris.ts, `idJinka`) ;
     · l'adresse et la position partent, comme ImmoFacile les envoyait :
       SeLoger s'en sert pour la carte et la recherche, et montre la
       position floutée dans le quartier (`PARTIAL`) ; ce qu'il affiche de
       l'adresse se règle dans MySeLogerPRO (« Localisation des biens ») ;
     · le contact de l'agence (le standard et l'adresse de l'agence, ceux
       que SeLoger avait déjà) ;
     · les mentions ALUR : honoraires (qui paie, combien, le barème),
       copropriété, DPE ;
     · jamais le propriétaire, les notes, les codes, les consignes. */

import { liste, num, txt } from '@/lib/actes';
import { argentBien, lirePhotos, type BienVente } from '@/lib/biens-vente';
import { diffuseSur } from '@/lib/diffusion';
import { bienPourSite, gpsFiche } from '@/lib/flux-site';
import { idJinka } from '@/lib/poliris';

export const SELOGER_LOGICIEL = 'EmilioImmoCRM';
export const SELOGER_VERSION_LOGICIEL = '3.98';
const BAREME = 'https://www.emilio-immo.com/honoraires';
/* Le contact que SeLoger affichait avec les annonces d'ImmoFacile (relevé
   dans leur comparaison du 6 octobre). */
const CONTACT = { companyName: 'Emilio Immobilier', phoneNumber: '01 84 80 14 00', email: 'agence@emilio-immo.com' };

/* « 12 bis Rue Edouard Detaille, 92100 Boulogne » → numéro et rue. */
export function rueEtNumero(adresse: string): { houseNumber: string; street: string } {
  const t = adresse.replace(/,?\s*\d{5}\b.*$/, '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(\d+\s*(?:bis|ter|quater|[a-d])?)\b[\s,]*(.+)$/i);
  return m ? { houseNumber: m[1].replace(/\s+/g, ' ').trim(), street: m[2].trim() } : { houseNumber: '', street: t };
}

export type Portail = 'SL' | 'BD';
type Json = Record<string, unknown>;

/* Le même identifiant que chez Jinka : il ne change jamais. */
export const idSeLoger = (b: Pick<BienVente, 'id' | 'reference' | 'donnees'>) => idJinka(b);

/* Les portails d'un bien : SeLoger (et donc Logic-Immo), Belles Demeures. */
export function portailsDe(b: Pick<BienVente, 'etape' | 'archive' | 'donnees'>): Portail[] {
  const p: Portail[] = [];
  if (diffuseSur(b, 'seloger')) p.push('SL');
  if (diffuseSur(b, 'bd')) p.push('BD');
  return p;
}

/* ── Petits outils ─────────────────────────────────────────────────────── */
const positif = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined);
const entierPositif = (n: number | null | undefined) => { const x = positif(n); return x === undefined ? undefined : Math.round(x); };
const arrondi = (n: number | undefined, c = 2) => (n === undefined ? undefined : Math.round(n * 10 ** c) / 10 ** c);
const jour = (x: unknown) => { const m = String(x || '').match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : undefined; };
const oui = (x: boolean) => (x ? 'YES' : undefined);
/* Retire les clés vides, en profondeur : le schéma refuse un objet vide là
   où il attend des valeurs, et une clé absente vaut mieux qu'un zéro. */
function net<T>(o: T): T | undefined {
  if (Array.isArray(o)) { const l = o.map(net).filter(x => x !== undefined); return (l.length ? l : undefined) as T | undefined; }
  if (o && typeof o === 'object') {
    const out: Json = {};
    for (const [k, v] of Object.entries(o as Json)) { const x = net(v); if (x !== undefined) out[k] = x; }
    return (Object.keys(out).length ? out : undefined) as T | undefined;
  }
  return o === null || o === '' ? undefined : o;
}

/* ── Les codes du schéma ──────────────────────────────────────────────── */
const TYPE: Record<string, { estateType: string; sous?: Json }> = {
  appartement: { estateType: 'APARTMENT' },
  duplex: { estateType: 'APARTMENT', sous: { apartment: 'MULTI_STOREY' } },
  studio: { estateType: 'APARTMENT', sous: { apartment: 'STUDIO' } },
  loft: { estateType: 'APARTMENT', sous: { apartment: 'LOFT' } },
  maison: { estateType: 'HOUSE' },
  immeuble: { estateType: 'HOUSE', sous: { house: 'APARTMENT_HOUSE' } },
  terrain: { estateType: 'PLOT' },
  local: { estateType: 'OFFICE' },
  parking: { estateType: 'PARKING' },
  autre: { estateType: 'MISCELLANEOUS' },
};
const ORIENTATION: Record<string, string> = {
  N: 'NORTH', NE: 'NORTH_EAST', E: 'EAST', SE: 'SOUTH_EAST', S: 'SOUTH', SO: 'SOUTH_WEST', O: 'WEST', NO: 'NORTH_WEST',
};
const ETAT: Record<string, string> = {
  a_renover: 'NEED_OF_RENOVATION', travaux_legers: 'WELL_KEPT', bon_etat: 'WELL_KEPT', refait_neuf: 'FULLY_RENOVATED',
};
const SOURCE_ENERGIE: Record<string, string> = { gaz: 'gas', electrique: 'electric', fioul: 'oil', bois: 'wood', urbain: 'districtHeating' };

/* Le DPE : sa version se déduit de sa date (avant ou après juillet 2021). */
function dpe(d: BienVente['donnees'], energyClass?: string, gesClass?: string): Json | undefined {
  const statut = String(d.dpeStatut || '');
  if (statut === 'vierge') return { certificateType: 'EMPTY' };
  if (statut === 'non') return { certificateType: 'NOT_APPLICABLE' };
  const date = jour(d.dpeDate);
  const lettre = (x?: string) => (x && /^[A-G]$/.test(x) ? x : undefined);
  const c = {
    overallEnergyNeed: entierPositif(num(d, 'dpeValeur')),
    efficiencyClass: lettre(energyClass),
    GHGEmission: entierPositif(num(d, 'gesValeur')),
    GHGEmissionClass: lettre(gesClass),
    releaseDate: date,
    energyConsumptionCostMin: entierPositif(num(d, 'coutMin')),
    energyConsumptionCostMax: entierPositif(num(d, 'coutMax')),
    yearOfConsumptionCostEstimation: entierPositif(num(d, 'coutAnnee')),
  };
  if (!c.efficiencyClass && !c.overallEnergyNeed) return undefined;
  return { certificateType: date && date < '2021-07-01' ? 'DPE_V01_2011' : 'DPE_V07_2021', ...c };
}

/* ── Une annonce ───────────────────────────────────────────────────────── */
export type AnnonceSeLoger = { portals: Portail[]; data: Json; specific?: Json; media?: Json[] };

export function annonceSeLoger(b: BienVente, gps?: { lat: number; lng: number } | null): AnnonceSeLoger {
  const d = b.donnees || {};
  const g = gps ?? gpsFiche(b);
  const s = bienPourSite(b, g);
  const a = argentBien(d);
  const annexes = liste(d, 'annexes');
  const immeuble = liste(d, 'immeuble');
  const eq = liste(d, 'equipements');
  const typeBien = String(d.typeBien || b.type_bien || '');
  const type = TYPE[typeBien] || TYPE.appartement;
  const photos = lirePhotos(d.photos).map(p => p.url).filter(u => /^https:\/\//.test(u)).slice(0, 30);
  const prix = positif(s.price);

  /* Les honoraires (ALUR) : à la charge de l'acquéreur, le prix les
     comprend et le taux se dit sur le prix hors honoraires ; à la charge du
     vendeur, rien à ajouter. Le barème de l'agence, toujours. */
  const brokerageFee = a.acq
    ? { hasFee: 'YES', feeFor: 'BUYER_OR_TENANT', isFeeIncluded: true, amount: positif(a.hono ?? undefined), feePercentage: arrondi(positif(a.taux ?? undefined)), countrySpecific: { fr: { feeScheduleLink: BAREME } } }
    : { hasFee: 'YES', feeFor: 'SELLER_OR_LANDLORD', isFeeIncluded: true, countrySpecific: { fr: { feeScheduleLink: BAREME } } };

  const park = positif(num(d, 'nbParking')) ?? (annexes.includes('parking') || annexes.includes('box') || annexes.includes('garage') ? 1 : undefined);
  const garage = annexes.includes('box') || annexes.includes('garage');
  const sdb = (positif(num(d, 'sdb')) ?? 0) + (positif(num(d, 'salleseau')) ?? 0);
  const cuisine = String(d.cuisine || '');
  const equipee = d.cuisineEquip === 'equipee' ? 'FULLY_EQUIPPED' : d.cuisineEquip === 'amenagee' ? 'STORAGE' : d.cuisineEquip === 'non' ? 'NONE' : undefined;
  const expo = String(d.expo || '');
  const mandatType = b.mandat_type || txt(d, 'mandatType');
  const energie = String(d.chauffageEnergie || '');

  const { houseNumber, street } = rueEtNumero(txt(d, 'adresse') || b.adresse || '');

  const data: Json = {
    estateType: type.estateType,
    ...(type.sous ? { estateSubType: type.sous } : {}),
    distributionType: 'BUY',
    location: {
      postalcode: s.postalCode || '',
      city: s.city || '',
      street,
      houseNumber,
      country: 'FRA',
      ...(typeof s.floor === 'number' ? { floorNumber: Math.round(s.floor) } : {}),
      ...(g ? { geometry: { type: 'Point', coordinates: [Math.round(g.lng * 1e6) / 1e6, Math.round(g.lat * 1e6) / 1e6] }, mapdisplayprecision: 'PARTIAL' } : {}),
    },
    prices: {
      currency: 'EUR',
      buy: { price: { amount: prix, isVatIncluded: true } },
      brokerageFee,
    },
    spaces: {
      spaceMeasureUnit: 'SQUARE_METER',
      /* SeLoger lit la surface du bien (« Area ») ailleurs que dans la
         surface habitable : la même valeur, aux trois endroits. */
      overallSpace: arrondi(positif(num(d, 'surface')) ?? positif(s.surface)),
      usableFloorSpace: arrondi(positif(num(d, 'surface')) ?? positif(s.surface)),
      plotSpace: arrondi(positif(num(d, 'terrain'))),
      residential: {
        livingSpace: arrondi(positif(num(d, 'surface')) ?? positif(s.surface)),
        livingRoomSpace: arrondi(positif(num(d, 'sejour'))),
        balconySpace: annexes.includes('balcon') ? arrondi(positif(num(d, 'surfBalcon'))) : undefined,
        terraceSpace: annexes.includes('terrasse') ? arrondi(positif(num(d, 'surfTerrasse'))) : undefined,
      },
    },
    structure: {
      rooms: {
        numberOfRooms: positif(s.rooms) ?? 1,
        numberOfBedRooms: entierPositif(s.bedrooms),
        numberOfBathRooms: sdb ? Math.round(sdb) : undefined,
        numberOfToilets: entierPositif(num(d, 'wc')),
        numberOfBalconies: annexes.includes('balcon') ? 1 : undefined,
        numberOfTerraces: annexes.includes('terrasse') ? 1 : undefined,
      },
      building: {
        numberOfFloors: entierPositif(s.totalFloors),
        offeredFloors: typeBien === 'duplex' ? 2 : undefined,
        elevator: immeuble.includes('ascenseur') ? { person: 'YES' } : undefined,
        cellar: oui(annexes.includes('cave') || annexes.includes('sousSol')),
        calm: oui(eq.includes('calme')),
        luminous: oui(eq.includes('lumineux')),
        barrierFree: oui(eq.includes('pmr')),
        kitchen: {
          kitchenType: {
            open: cuisine === 'ouverte' || cuisine === 'semiOuverte' || undefined,
            separated: cuisine === 'independante' || undefined,
            kitchenette: cuisine === 'kitchenette' || undefined,
            /* Équipée ou aménagée : sans lui, SeLoger lit « américaine »
               au lieu de « américaine équipée ». */
            builtIn: equipee === 'FULLY_EQUIPPED' || equipee === 'STORAGE' || undefined,
          },
          kitchenEquipment: equipee,
        },
        window: eq.includes('doubleVitrage') ? { windowMaterial: { insulatedGlazing: 'DOUBLE' } } : undefined,
      },
      parkingLots: park ? (garage ? { garage: Math.round(park) } : { parkingArea: Math.round(park) }) : undefined,
    },
    conditions: {
      yearOfConstruction: entierPositif(s.yearBuilt),
      buildState: ETAT[String(d.etat || '')],
    },
    energy: {
      energyType: {
        heatMethod: d.chauffageMode === 'collectif' ? 'CENTRAL' : d.chauffageMode === 'individuel' ? 'INDIVIDUAL' : undefined,
        energySource: SOURCE_ENERGIE[energie] ? { [SOURCE_ENERGIE[energie]]: true } : undefined,
        energyGeneration: energie === 'pac' ? { heatpump: true } : undefined,
      },
      countrySpecific: { fr: { energyCertificate: dpe(d, s.energyClass, s.gesClass) } },
    },
    features: {
      propertyOrientation: ORIENTATION[expo],
      aircondition: oui(eq.includes('clim')),
      furnished: eq.includes('meuble') ? 'FULL' : undefined,
      wheelchairUse: oui(eq.includes('pmr')),
      garden: annexes.includes('jardin') ? { private: true } : undefined,
      floorCovering: eq.includes('parquet') ? { parquet: 'YES' } : undefined,
      security: {
        buildingIntercom: oui(immeuble.includes('interphone')),
        digitalLock: oui(immeuble.includes('digicode')),
        custodian: oui(immeuble.includes('gardien')),
        intruderAlarm: oui(eq.includes('alarme')),
      },
      residential: {
        chimney: oui(eq.includes('cheminee')),
        loggia: oui(annexes.includes('loggia')),
        veranda: oui(annexes.includes('veranda')),
        swimmingPool: oui(annexes.includes('piscine')),
        closet: oui(eq.includes('placards')),
      },
    },
    texts: {
      headline: { fr: s.title },
      description: { fr: s.description },
    },
    management: {
      useFor: 'LIVING',
      countrySpecific: {
        fr: d.copro === 'oui'
          ? {
            isCondo: true,
            numberOfUnits: entierPositif(num(d, 'lots')),
            operatingCostsPerYear: arrondi(positif(num(d, 'chargesAn'))),
            isSyndicProcedure: d.procedure === 'oui' ? true : d.procedure === 'non' ? false : undefined,
            procedureDetails: d.procedure === 'oui' ? txt(d, 'procedureNature') || undefined : d.procedure === 'non' ? 'Pas de procédure en cours' : undefined,
          }
          : d.copro === 'non' ? { isCondo: false } : undefined,
      },
    },
    countrySpecific: {
      fr: {
        agentMandate: {
          mandateNumber: txt(d, 'mandatNumero') || b.mandat_numero || undefined,
          mandateType: mandatType === 'exclusif' ? 'EXCLUSIVE' : mandatType ? 'SIMPLE' : undefined,
          startDate: jour(d.mandatDate),
          endDate: jour(b.mandat_fin || d.mandatFin),
        },
      },
    },
    metaData: {
      source: {
        sourceSystem: SELOGER_LOGICIEL,
        sourceSystemVersion: SELOGER_VERSION_LOGICIEL,
        offererMarketingKey: b.reference || idSeLoger(b),
        offererEstateId: idSeLoger(b),
      },
    },
  };

  const propre = net(data) as Json;
  /* Les champs que le schéma exige, même vides (la rue, le numéro). */
  const loc = (propre.location || {}) as Json;
  propre.location = { ...loc, street, houseNumber };

  const specific = { gsl: { mainContactPerson: CONTACT } };
  const media = photos.map((url, i) => ({ url, mediaType: 'PICTURE', ...(i === 0 ? { category: 'COVER_PICTURE' } : {}) }));
  return { portals: portailsDe(b), data: propre, specific, ...(media.length ? { media } : {}) };
}

/* ── Le lot du moment ──────────────────────────────────────────────────── */
export type LotSeLoger = {
  annonces: { bienId: string; reference: string | null; id: string; portails: Portail[]; annonce: AnnonceSeLoger }[];
  avertissements: string[];
};

export function lotSeLoger(biens: BienVente[], gps?: Map<string, { lat: number; lng: number }>): LotSeLoger {
  const out: LotSeLoger = { annonces: [], avertissements: [] };
  const vus = new Set<string>();
  /* Le plus ancien d'abord : en cas de doublon d'identifiant, il le garde. */
  for (const b of [...biens].sort((x, y) => (x.created_at || '').localeCompare(y.created_at || ''))) {
    const portails = portailsDe(b);
    if (!portails.length) continue;
    const nom = b.reference || b.titre || b.id;
    const id = idSeLoger(b);
    if (vus.has(id)) { out.avertissements.push(`${nom} : même identifiant qu’un autre bien (${id}), laissé de côté`); continue; }
    const annonce = annonceSeLoger(b, gps?.get(b.id) || null);
    const dt = annonce.data as Json;
    const loc = dt.location as Json;
    const prix = ((dt.prices as Json)?.buy as Json)?.price as Json | undefined;
    const textes = dt.texts as { headline?: { fr?: string }; description?: { fr?: string } } | undefined;
    const manque = [
      [!loc.postalcode, 'code postal'], [!loc.city, 'ville'], [!prix?.amount, 'prix'],
      [!textes?.headline?.fr, 'titre'], [!textes?.description?.fr, 'texte de l’annonce'],
    ].filter(([m]) => m).map(([, l]) => l as string);
    if (manque.length) { out.avertissements.push(`${nom} : il manque ${manque.join(', ')}, laissé de côté`); continue; }
    if (!annonce.media?.length) out.avertissements.push(`${nom} : aucune photo`);
    const energie = ((dt.energy as Json)?.countrySpecific as Json | undefined)?.fr as Json | undefined;
    if (!energie?.energyCertificate) out.avertissements.push(`${nom} : DPE non renseigné`);
    const fee = ((dt.prices as Json)?.brokerageFee || {}) as Json;
    if (fee.feeFor === 'BUYER_OR_TENANT' && !fee.feePercentage) out.avertissements.push(`${nom} : honoraires à la charge de l’acquéreur, sans taux ni montant (à préciser dans la fiche)`);
    vus.add(id);
    out.annonces.push({ bienId: b.id, reference: b.reference, id, portails, annonce });
  }
  return out;
}
