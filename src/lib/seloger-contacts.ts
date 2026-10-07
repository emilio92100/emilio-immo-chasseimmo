import type { BienVente } from '@/lib/biens-vente';
import { titreBien } from '@/lib/biens-vente';
import type { CategorieDemande, Provenance } from '@/lib/demandes-site';
import { idSite } from '@/lib/flux-site';
import { idJinka } from '@/lib/poliris';

/* ═══ Les demandes des acquéreurs SeLoger, Logic-Immo, Belles Demeures (V3.100) ═
   L'API « Seeker Leads » v1 d'AVIV rend les demandes de contact reçues par
   l'agence sur ses annonces et sur sa page agence. Chacune devient une ligne
   de `contact_submissions`, la table de « Demandes Internet », avec sa
   provenance (`source`) et son numéro chez AVIV (`lead_id`, pour ne jamais
   l'ajouter deux fois). La relève : lib/seloger-contacts-serveur.ts.

   Quatre sortes de demandes :
     CLASSIFIED      sur une annonce           → « Info sur un bien »
     CALL_TRACKING   un appel suivi            → « Info sur un bien »
     AGENCY          sur la page de l'agence   → vendre : « Estimation »,
                                                 acheter : « Accompagnement »,
                                                 le reste : « Demande générale »
     PROPERTY_SEARCH une recherche transmise   → acheteur : « Accompagnement »,
                                                 vendeur : « Estimation »

   Isomorphe : aucune dépendance au serveur ni au navigateur. */

/* ── Ce qu'envoie AVIV (le nécessaire, le reste est ignoré) ─────────────── */
type Tel = { type?: string | null; number?: string | null; verified?: boolean | null };
export type LeadAviv = {
  metadata: {
    leadId: string; ingestionDate: number; portal?: string | null; TTL?: number | null;
    leadCategory?: string | null; seekerIntention?: string | null;
  };
  contactRequest?: {
    firstName?: string | null; lastName?: string | null; email?: string | null;
    phoneNumbers?: Tel[] | null; message?: string | null; isOwner?: boolean | null;
  } | null;
  /* Une annonce (CLASSIFIED, CALL_TRACKING) ou une recherche (PROPERTY_SEARCH). */
  property?: {
    classifiedId?: string | null; offererEstateId?: string | null; offererMarketingKey?: string | null;
    estateType?: string[] | null;
    rooms?: { numberOfRoomsMin?: number | null; numberOfRoomsMax?: number | null } | null;
    spaces?: { spaceMin?: number | null; spaceMax?: number | null } | null;
    budget?: { amountMin?: number | null; amountMax?: number | null } | null;
    geo?: { city?: string | null; postalCodes?: string[] | null; departments?: string[] | null } | null;
  } | null;
  callDetails?: { seekerPhoneNumber?: string | null; isVoiceMail?: boolean | null; duration?: number | null; status?: string | null } | null;
  distributionType?: string[] | null;
};

/* ── La ligne de « Demandes Internet » ─────────────────────────────────── */
export type LigneDemande = {
  lead_id: string; source: Provenance; form_type: CategorieDemande;
  name: string; email: string; phone: string | null; message: string | null;
  budget: string | null; property_type: string | null; desired_location: string | null; desired_surface: string | null;
  property_ref: string | null; property_title: string | null;
  created_at: string; statut: 'nouveau' | 'traite'; statut_le: string | null;
  /* Déjà « annoncée » : SeLoger envoie son propre mail à l'agence, le CRM
     n'en ajoute pas un second (api/demandes-site/notifier). */
  notifie_le: string;
};

/* Le portail d'où vient la demande (les codes d'AVIV) → la provenance du CRM. */
export function provenanceLead(portail: string | null | undefined): Provenance {
  const p = String(portail || '').toUpperCase();
  if (p.startsWith('LI')) return 'logicimmo';            // LIM, LIC, LIN : Logic-Immo
  if (p.startsWith('BDS') || p.startsWith('LUX')) return 'bellesdemeures';
  return 'seloger';                                       // SLG, SLN, SLC, BCM, et l'inconnu
}
const NOM_PORTAIL: Record<Provenance, string> = { site: 'le site', seloger: 'SeLoger', logicimmo: 'Logic-Immo', bellesdemeures: 'Belles Demeures' };
export const nomPortail = (p: Provenance) => NOM_PORTAIL[p];

/* ── Retrouver le bien d'une annonce ────────────────────────────────────── */
/* L'annonce porte l'identifiant qu'on lui a donné (`offererEstateId` : le
   numéro ImmoFacile du bien, sinon la référence du CRM — lib/seloger.ts) et
   sa référence lisible (`offererMarketingKey`). Celles qu'ImmoFacile a
   envoyées portent son numéro et son numéro court (AFF_NUM, `refImmofacile`),
   que ImmoFacile réutilise : on ne le croit que pour un bien encore actif. */
export type BienConnu = { id: string; idSite: string; titre: string };
export type IndexBiens = Map<string, BienConnu>;
type BienIndexable = Pick<BienVente, 'id' | 'reference' | 'donnees' | 'titre' | 'ville' | 'archive'>;

export function indexerBiens(biens: BienIndexable[]): IndexBiens {
  const m: IndexBiens = new Map();
  const cle = (t: unknown) => String(t ?? '').trim().toLowerCase();
  const fiche = (b: BienIndexable): BienConnu => {
    const t = (b.titre || '').trim() || titreBien(b.donnees || {});
    return { id: b.id, idSite: idSite(b), titre: [t, (b.ville || '').trim()].filter(Boolean).join(' · ') };
  };
  /* Les actifs d'abord : un vieux bien archivé ne prend jamais la place. */
  const tries = [...biens].sort((x, y) => Number(!!x.archive) - Number(!!y.archive));
  const poser = (k: string, b: BienIndexable) => { if (k && !m.has(k)) m.set(k, fiche(b)); };
  for (const b of tries) {
    poser(cle(idJinka(b)), b);
    poser(cle(b.reference), b);
    poser(cle((b.donnees || {}).idImmofacile), b);
  }
  for (const b of tries) if (!b.archive) poser(`court:${cle((b.donnees || {}).refImmofacile)}`, b);
  return m;
}
export function bienDuLead(l: LeadAviv, index: IndexBiens): BienConnu | null {
  const p = l.property || {};
  const cle = (t: unknown) => String(t ?? '').trim().toLowerCase();
  for (const k of [cle(p.offererEstateId), cle(p.offererMarketingKey)]) if (k && index.has(k)) return index.get(k)!;
  const court = cle(p.offererMarketingKey);
  return court && /^\d{1,5}$/.test(court) ? index.get(`court:${court}`) || null : null;
}

/* ── Une demande AVIV → une ligne ──────────────────────────────────────── */
const nettoyer = (t: unknown) => String(t ?? '').replace(/\r\n?/g, '\n').trim();
const nombre = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : null);
const fourchette = (a: number | null, b: number | null) => (a && b && a !== b ? `${a} - ${b}` : a || b ? String(b || a) : null);
const TYPES: Record<string, string> = {
  APARTMENT: 'appartement', HOUSE: 'maison', PLOT: 'terrain', BUILDING: 'immeuble',
  OFFICE: 'commerce', TRADING: 'commerce', STORAGE_PRODUCTION: 'commerce',
};
const duree = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}` : `${s} s`);

export function ligneDuLead(l: LeadAviv, index: IndexBiens, o: { traiteeAvant?: number; maintenant?: Date } = {}): LigneDemande {
  const m = l.metadata;
  const source = provenanceLead(m.portal);
  const portail = nomPortail(source);
  const c = l.contactRequest || {};
  const p = l.property || {};
  const cat = String(m.leadCategory || '').toUpperCase();
  const intention = String(m.seekerIntention || '').toUpperCase();
  const sens = (l.distributionType || []).map(x => String(x).toUpperCase());

  const form_type: CategorieDemande =
    cat === 'AGENCY' ? (intention === 'SELL' ? 'estimation' : intention === 'BUY' ? 'mandat_recherche' : 'contact')
      : cat === 'PROPERTY_SEARCH' ? (sens.includes('SELLER') && !sens.includes('BUYER') ? 'estimation' : 'mandat_recherche')
        : (p.offererEstateId || p.offererMarketingKey || p.classifiedId) ? 'rappel_bien' : 'contact';

  const tel = (c.phoneNumbers || []).map(x => nettoyer(x?.number)).find(Boolean) || nettoyer(l.callDetails?.seekerPhoneNumber) || null;
  const nom = [nettoyer(c.firstName), nettoyer(c.lastName)].filter(Boolean).join(' ');

  /* Le message : ce que l'acquéreur a écrit, et ce qu'AVIV sait de plus. */
  const lignes: string[] = [];
  const texte = nettoyer(c.message);
  if (cat === 'CALL_TRACKING' && l.callDetails) {
    const d = l.callDetails;
    const s = nombre(d.duration);
    lignes.push(String(d.status).toUpperCase() === 'ANSWERED'
      ? `Appel reçu depuis ${portail}${s ? `, ${duree(s)}` : ''}.`
      : `Appel manqué depuis ${portail}${d.isVoiceMail ? ', avec un message sur le répondeur' : ''}.`);
  }
  if (form_type === 'mandat_recherche' || form_type === 'estimation') {
    /* Les formulaires rangés lisent « Clé : valeur » : la phrase libre va
       sous « Message ». */
    const r = p.rooms || {};
    const pieces = nombre(r.numberOfRoomsMin) || nombre(r.numberOfRoomsMax);
    if (cat === 'PROPERTY_SEARCH' && pieces) lignes.push(`Pieces : ${pieces >= 5 ? '5+' : pieces}`);
    if (texte) lignes.push(`Message : ${texte.replace(/\n+/g, ' ')}`);
  } else if (texte) lignes.push(texte);
  if (c.isOwner === true && form_type !== 'estimation') lignes.push('Déjà propriétaire d’un bien (indiqué sur le portail).');

  /* Une recherche transmise (PROPERTY_SEARCH) : ses critères, dans les
     colonnes que lit « Demandes Internet ». */
  let budget: string | null = null, property_type: string | null = null, desired_location: string | null = null, desired_surface: string | null = null;
  if (cat === 'PROPERTY_SEARCH') {
    property_type = (p.estateType || []).map(t => TYPES[String(t).toUpperCase()]).find(Boolean) || null;
    budget = fourchette(nombre(p.budget?.amountMin), nombre(p.budget?.amountMax));
    desired_surface = fourchette(nombre(p.spaces?.spaceMin), nombre(p.spaces?.spaceMax));
    const g = p.geo || {};
    desired_location = [nettoyer(g.city), ...(g.postalCodes || []).map(nettoyer)].filter(Boolean).join(', ') || null;
  }

  /* Le bien de l'annonce : son adresse sur le site, et son titre. */
  let property_ref: string | null = null, property_title: string | null = null;
  if (form_type === 'rappel_bien') {
    const b = bienDuLead(l, index);
    property_ref = b?.idSite || nettoyer(p.offererEstateId) || null;
    property_title = b?.titre || (nettoyer(p.offererMarketingKey) ? `Annonce ${nettoyer(p.offererMarketingKey)}` : null);
  }

  const recu = new Date((Number(m.ingestionDate) || 0) * 1000);
  const created_at = Number.isFinite(recu.getTime()) && recu.getTime() > 0 ? recu.toISOString() : (o.maintenant || new Date()).toISOString();
  const traitee = !!o.traiteeAvant && new Date(created_at).getTime() < o.traiteeAvant;
  const maintenant = (o.maintenant || new Date()).toISOString();

  return {
    lead_id: String(m.leadId),
    source, form_type,
    name: nom || (cat === 'CALL_TRACKING' ? `Appel ${portail}` : `Contact ${portail}`),
    email: nettoyer(c.email).toLowerCase(),
    phone: tel,
    message: lignes.join('\n') || null,
    budget, property_type, desired_location, desired_surface,
    property_ref, property_title,
    created_at,
    statut: traitee ? 'traite' : 'nouveau',
    statut_le: traitee ? maintenant : null,
    notifie_le: maintenant,
  };
}
