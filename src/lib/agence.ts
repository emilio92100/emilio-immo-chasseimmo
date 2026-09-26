/* ═══ L'identité de l'agence ═════════════════════════════════════════════
   Ce que les documents impriment sur l'agence : la société, la carte, la
   garantie, l'assurance, le médiateur, qui signe. Alexandre la tient à jour
   dans Paramètres › Agence ; le mandat de recherche la lit au moment où le
   client signe, et chaque document à venir fera de même.

   Trois règles :
     · ce qui est signé ne bouge pas : le PDF est créé et rangé à la
       signature. Changer l'adresse demain ne touche aucun mandat signé ;
     · ce qui part ensuite prend l'identité du jour de la signature ;
     · rien ne part incomplet : un champ obligatoire ne s'enregistre pas vide,
       et s'il manquait quand même, c'est la valeur d'origine qui s'imprime.

   Rangement : deux lignes de la table `parametres` (couples clé / valeur,
   pas de SQL à passer) :
     agence_identite             l'identité, en JSON
     agence_identite_historique  chaque modification, datée, avec l'ancienne
                                 et la nouvelle valeur (la plus récente
                                 d'abord)

   Isomorphe : lu par le CRM, l'espace client et le serveur. */

import type { SupabaseClient } from '@supabase/supabase-js';

export const CLE_IDENTITE = 'agence_identite';
export const CLE_HISTORIQUE = 'agence_identite_historique';

export type Fonds = 'non' | 'garantie';

export type IdentiteAgence = {
  /* Identité */
  nom: string; societe: string; forme: string; siege: string; rcs: string; tva: string;
  /* Carte professionnelle */
  carte: string; carteMention: string; carteDelivree: string; carteFin: string;
  /* L'argent des clients */
  fonds: Fonds; garant: string; garantAdresse: string; garantMontant: string; sequestre: string;
  /* Assurance */
  assureur: string; assureurAdresse: string; police: string;
  /* Médiateur de la consommation */
  mediateurNom: string; mediateurAdresse: string; mediateurSite: string;
  /* Qui signe pour l'agence */
  signataireNom: string; signataireQualite: string;
  /* Coordonnées */
  adresse: string; cp: string; ville: string; tel: string; mail: string; site: string;
  /* Le reste de ce que demandent les modèles de mandat */
  orias: string; banque: string; reseau: string;
};

/* L'identité d'origine : celle qui était écrite dans le code du mandat avant
   cette fiche. Tant qu'Alexandre ne change rien, les documents restent
   exactement les mêmes. */
export const IDENTITE_DEFAUT: IdentiteAgence = {
  nom: 'Emilio Immobilier',
  societe: 'RT CONSEILS',
  forme: 'SAS au capital de 1 000 €',
  siege: '10 avenue Kléber, 75016 Paris',
  rcs: 'RCS de Nanterre n° 884 141 201',
  tva: 'FR34884141201',
  carte: 'CPI 9201 2020 000 045 344',
  carteMention: 'Transactions sur immeubles et fonds de commerce',
  carteDelivree: 'la CCI Paris Île-de-France',
  carteFin: '',
  fonds: 'non',
  garant: '', garantAdresse: '', garantMontant: '', sequestre: '',
  assureur: 'MMA Entreprise',
  assureurAdresse: '85 route de la Reine, 92100 Boulogne-Billancourt',
  police: '146511983',
  mediateurNom: 'Association MEDIMMOCONSO',
  mediateurAdresse: '1 allée du Parc de Mesemena, Bât. A, CS 25222, 44505 La Baule Cedex',
  mediateurSite: 'www.medimmoconso.fr',
  signataireNom: 'Alexandre ROGELET',
  signataireQualite: 'responsable des transactions immobilières',
  adresse: '10 avenue Kléber',
  cp: '75016',
  ville: 'Paris',
  tel: '01 84 80 14 00',
  mail: 'agence@emilio-immo.com',
  site: 'www.emilio-immo.com',
  orias: '', banque: '', reseau: '',
};

/* ── Les champs, bloc par bloc : la page Paramètres, la vérification et
   l'historique lisent tous cette liste. `requis` : imprimé dans le mandat,
   il ne peut pas rester vide. ── */
export type Bloc = 'identite' | 'carte' | 'fonds' | 'assurance' | 'mediateur' | 'signataire' | 'coordonnees' | 'autres';
export type Champ = {
  cle: Exclude<keyof IdentiteAgence, 'fonds'>;
  lib: string; bloc: Bloc; requis?: boolean; aide?: string; exemple?: string;
  type?: 'date' | 'email'; max?: number; large?: boolean;
  /* Seulement quand l'agence détient des fonds. */
  siGarantie?: boolean;
};

export const BLOCS: { id: Bloc; titre: string; e: string; sert: string }[] = [
  { id: 'identite', titre: 'Identité', e: '🏢', sert: 'L’en-tête de chaque document et la fiche « le mandataire ».' },
  { id: 'carte', titre: 'Carte professionnelle', e: '🪪', sert: 'Obligatoire sur tout mandat. Le CRM te prévient deux mois avant l’échéance.' },
  { id: 'fonds', titre: 'Argent des clients', e: '🔐', sert: 'Ce que le mandat dit des fonds que l’agence reçoit, ou pas.' },
  { id: 'assurance', titre: 'Assurance', e: '🛡️', sert: 'La responsabilité civile professionnelle citée dans le mandat.' },
  { id: 'mediateur', titre: 'Médiateur', e: '⚖️', sert: 'Obligatoire avec un client particulier. Tu dois y avoir adhéré.' },
  { id: 'signataire', titre: 'Signataire', e: '✍️', sert: 'Qui signe pour l’agence, et sa signature manuscrite.' },
  { id: 'coordonnees', titre: 'Coordonnées', e: '📍', sert: 'Le pied des documents, le formulaire de rétractation et la ville de signature.' },
  { id: 'autres', titre: 'Autres mentions', e: '📎', sert: 'Ce que certains modèles de mandat de vente demandent. Rien ne s’imprime s’ils sont vides.' },
];

export const CHAMPS: Champ[] = [
  { cle: 'nom', lib: 'Nom commercial', bloc: 'identite', requis: true, max: 80 },
  { cle: 'societe', lib: 'Raison sociale', bloc: 'identite', requis: true, max: 80 },
  { cle: 'forme', lib: 'Forme et capital', bloc: 'identite', requis: true, exemple: 'SAS au capital de 1 000 €', max: 80 },
  { cle: 'rcs', lib: 'Immatriculation', bloc: 'identite', requis: true, exemple: 'RCS de Nanterre n° 884 141 201', max: 80 },
  { cle: 'siege', lib: 'Siège social', bloc: 'identite', requis: true, max: 160, large: true },
  { cle: 'tva', lib: 'TVA intracommunautaire', bloc: 'identite', max: 30 },

  { cle: 'carte', lib: 'Numéro', bloc: 'carte', requis: true, exemple: 'CPI 9201 2020 000 045 344', max: 40 },
  { cle: 'carteFin', lib: 'Valable jusqu’au', bloc: 'carte', type: 'date', aide: 'Trois ans après sa délivrance ou son dernier renouvellement.' },
  { cle: 'carteMention', lib: 'Mention', bloc: 'carte', requis: true, max: 120, large: true },
  { cle: 'carteDelivree', lib: 'Délivrée par', bloc: 'carte', requis: true, aide: 'Tel que ça se lit après « délivrée par ».', max: 120, large: true },

  { cle: 'garant', lib: 'Garant', bloc: 'fonds', siGarantie: true, max: 120 },
  { cle: 'garantMontant', lib: 'Montant garanti', bloc: 'fonds', siGarantie: true, exemple: '120 000 €', max: 40 },
  { cle: 'garantAdresse', lib: 'Adresse du garant', bloc: 'fonds', siGarantie: true, max: 160, large: true },
  { cle: 'sequestre', lib: 'Compte séquestre', bloc: 'fonds', siGarantie: true, aide: 'La banque et le numéro du compte où les fonds sont déposés.', max: 160, large: true },

  { cle: 'assureur', lib: 'Assureur', bloc: 'assurance', requis: true, max: 80 },
  { cle: 'police', lib: 'Numéro de police', bloc: 'assurance', requis: true, max: 40 },
  { cle: 'assureurAdresse', lib: 'Adresse de l’assureur', bloc: 'assurance', max: 160, large: true },

  { cle: 'mediateurNom', lib: 'Nom', bloc: 'mediateur', requis: true, max: 120 },
  { cle: 'mediateurSite', lib: 'Site', bloc: 'mediateur', requis: true, max: 80 },
  { cle: 'mediateurAdresse', lib: 'Adresse', bloc: 'mediateur', requis: true, max: 200, large: true },

  { cle: 'signataireNom', lib: 'Nom', bloc: 'signataire', requis: true, aide: 'Le nom de famille en capitales, comme sur tout acte.', max: 80 },
  { cle: 'signataireQualite', lib: 'Qualité', bloc: 'signataire', requis: true, max: 120 },

  { cle: 'adresse', lib: 'Adresse', bloc: 'coordonnees', requis: true, max: 120, large: true },
  { cle: 'cp', lib: 'Code postal', bloc: 'coordonnees', requis: true, max: 10 },
  { cle: 'ville', lib: 'Ville', bloc: 'coordonnees', requis: true, aide: 'Aussi la ville de « Fait à … » sur les mandats.', max: 60 },
  { cle: 'tel', lib: 'Téléphone', bloc: 'coordonnees', requis: true, max: 30 },
  { cle: 'mail', lib: 'E-mail', bloc: 'coordonnees', requis: true, type: 'email', max: 120 },
  { cle: 'site', lib: 'Site', bloc: 'coordonnees', max: 80 },

  { cle: 'orias', lib: 'Numéro ORIAS', bloc: 'autres', max: 40 },
  { cle: 'reseau', lib: 'Réseau ou enseigne', bloc: 'autres', max: 80 },
  { cle: 'banque', lib: 'Lien avec une banque ou un assureur', bloc: 'autres', max: 160, large: true },
];

export const LIB_FONDS: Record<Fonds, string> = {
  non: 'L’agence ne reçoit aucun fonds',
  garantie: 'L’agence détient des fonds, avec une garantie financière',
};

/* ── Lire ce qui est enregistré ──
   Un champ absent (ligne écrite avant qu'il existe) prend la valeur
   d'origine ; un champ obligatoire vide aussi, pour que rien ne s'imprime
   incomplet. */
export function lireIdentite(v: unknown): IdentiteAgence {
  let o: Record<string, unknown> = {};
  if (typeof v === 'string' && v.trim()) { try { const p = JSON.parse(v); if (p && typeof p === 'object') o = p; } catch { o = {}; } }
  else if (v && typeof v === 'object') o = v as Record<string, unknown>;
  const id: IdentiteAgence = { ...IDENTITE_DEFAUT };
  for (const c of CHAMPS) {
    const x = o[c.cle];
    if (typeof x !== 'string') continue;
    const t = x.replace(/\s+/g, ' ').trim().slice(0, c.max || 200);
    if (c.requis && !t) continue;
    (id as Record<string, string>)[c.cle] = t;
  }
  if (o.fonds === 'garantie' || o.fonds === 'non') id.fonds = o.fonds;
  if (id.carteFin && !/^\d{4}-\d{2}-\d{2}$/.test(id.carteFin)) id.carteFin = '';
  return id;
}

/* Ce qui manque avant d'enregistrer : champ par champ, pour le dire sous le
   champ lui-même. */
export function aRevoir(id: IdentiteAgence): Partial<Record<keyof IdentiteAgence, string>> {
  const out: Partial<Record<keyof IdentiteAgence, string>> = {};
  for (const c of CHAMPS) {
    const v = String(id[c.cle] || '').trim();
    if (c.requis && !v) out[c.cle] = 'Imprimé dans tes mandats : il ne peut pas rester vide.';
    else if (c.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) out[c.cle] = 'Une adresse e-mail valide.';
    else if (c.type === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) out[c.cle] = 'Une date au format JJ/MM/AAAA.';
  }
  if (id.fonds === 'garantie') {
    if (!id.garant.trim()) out.garant = 'Obligatoire quand l’agence détient des fonds.';
    if (!id.garantMontant.trim()) out.garantMontant = 'Obligatoire quand l’agence détient des fonds.';
  }
  return out;
}

/* ── La carte professionnelle : valable, bientôt à renouveler, expirée ── */
export type EtatCarte = { etat: 'inconnue' | 'ok' | 'bientot' | 'expiree'; jours: number | null };
export const PREVENIR_JOURS = 60;
export function etatCarte(id: Pick<IdentiteAgence, 'carteFin'>, aujourdhui = new Date().toISOString().slice(0, 10)): EtatCarte {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id.carteFin || '')) return { etat: 'inconnue', jours: null };
  const jours = Math.round((Date.parse(id.carteFin + 'T12:00:00Z') - Date.parse(aujourdhui + 'T12:00:00Z')) / 86_400_000);
  return { etat: jours < 0 ? 'expiree' : jours <= PREVENIR_JOURS ? 'bientot' : 'ok', jours };
}

/* ── Les phrases que les documents impriment ── */
/* « SAS », pour les pieds de page. */
export const formeCourte = (id: IdentiteAgence) => id.forme.trim().split(/\s+/)[0] || '';
export function phraseFonds(id: IdentiteAgence): string {
  if (id.fonds !== 'garantie') return 'Ne reçoit ni ne détient aucuns fonds autres que sa rémunération.';
  return `Garantie financière : ${id.garant}${id.garantAdresse ? `, ${id.garantAdresse}` : ''}, pour ${id.garantMontant}${id.sequestre ? `. Compte séquestre : ${id.sequestre}` : ''}.`;
}
/* La fiche « le mandataire », telle que le mandat l'imprime. */
export function lignesMandataire(id: IdentiteAgence): string[] {
  return [
    `${id.adresse}, ${id.cp} ${id.ville} · ${id.tel} · ${id.mail}`,
    `${id.societe}, ${id.forme}, ${id.rcs}. Carte professionnelle « ${id.carteMention} » n° ${id.carte}, délivrée par ${id.carteDelivree}.`,
    `Responsabilité civile professionnelle : ${id.assureur}, police n° ${id.police}.`,
    `Représentée par ${id.signataireNom}, ${id.signataireQualite}.`,
  ];
}

/* ── L'historique ── */
export type Modif = { le: string; cle: string; lib: string; avant: string; apres: string };
export function lireHistorique(v: unknown): Modif[] {
  if (typeof v !== 'string' || !v.trim()) return [];
  try {
    const l = JSON.parse(v);
    return Array.isArray(l) ? l.filter(x => x && typeof x.le === 'string' && typeof x.lib === 'string') : [];
  } catch { return []; }
}
const BLOC_DE: Record<string, string> = Object.fromEntries(CHAMPS.map(c => [c.cle, BLOCS.find(b => b.id === c.bloc)?.titre || '']));
export function ecarts(avant: IdentiteAgence, apres: IdentiteAgence, le = new Date().toISOString()): Modif[] {
  const out: Modif[] = [];
  if (avant.fonds !== apres.fonds) out.push({ le, cle: 'fonds', lib: 'Argent des clients', avant: LIB_FONDS[avant.fonds], apres: LIB_FONDS[apres.fonds] });
  for (const c of CHAMPS) {
    const a = String(avant[c.cle] || ''), b = String(apres[c.cle] || '');
    if (a !== b) out.push({ le, cle: c.cle, lib: `${BLOC_DE[c.cle]} · ${c.lib}`, avant: a, apres: b });
  }
  return out;
}
export const HISTORIQUE_MAX = 300;

/* ── Côté serveur : l'identité du jour, ou celle d'origine si la lecture
   échoue (un mandat ne doit jamais rester bloqué pour ça). ── */
export async function lireIdentiteAgence(sb: SupabaseClient): Promise<IdentiteAgence> {
  try {
    const { data, error } = await sb.from('parametres').select('valeur').eq('cle', CLE_IDENTITE).maybeSingle();
    if (error) { console.error('[agence] lecture', error.message); return IDENTITE_DEFAUT; }
    return lireIdentite(data?.valeur ?? null);
  } catch (e) {
    console.error('[agence] lecture', e);
    return IDENTITE_DEFAUT;
  }
}
