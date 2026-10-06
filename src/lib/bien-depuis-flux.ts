/* ═══ Un bien du CRM, à partir d'une annonce du flux d'ImmoFacile (V3.95) ═══
   Pour une annonce en ligne chez ImmoFacile qu'aucune fiche du CRM ne
   reprend : le 6 octobre, le 3 pièces à 669 000 € (annonce 56527064), que
   l'import des fiches avait manqué parce qu'ImmoFacile donnait son numéro
   court (312) à un autre bien. La route /api/diffusion/creer écrit la fiche
   préparée ici.

   Ce que le flux dit, chacun à sa place dans la fiche, avec les mêmes
   traductions que l'import des fiches (lib/import-biens-immofacile.ts) ;
   ce qui n'a pas de case va aux notes, dans un bloc « Repris de l'annonce
   ImmoFacile n° … ». Le flux ne donne ni le propriétaire ni le numéro de
   mandat : Alexandre les relie dans la fiche.

   Le numéro ImmoFacile (`idImmofacile`) est gardé : l'adresse de sa page sur
   le site ne change pas. Pas de `refImmofacile` : le numéro court est celui
   qui prête à confusion. Isomorphe, sans base. */

import type { Donnees } from '@/lib/actes';
import { balise, section } from '@/lib/flux-immofacile';
import { dateImmo } from '@/lib/import-immofacile';
import {
  chauffageDe, cuisineDe, etatDe, expoDe, fenetresDe, mandatTypeDe, texteNet, typeBienDe, villeDe, voletsDe, voletsMateriauDe, vueDe,
} from '@/lib/import-biens-immofacile';

/* La section qui dit le type du bien (<APPARTEMENT>, <MAISON>…). */
const SECTIONS_TYPE = ['APPARTEMENT', 'MAISON', 'IMMEUBLE', 'TERRAIN', 'PARKING', 'LOFT', 'LOCAL', 'BUREAU', 'COMMERCE', 'FONDS', 'PROPRIETE', 'CHATEAU', 'DIVERS'];

const nb = (t: string): number | null => {
  const x = Number(String(t || '').replace(/\s/g, '').replace(',', '.'));
  return t && Number.isFinite(x) ? x : null;
};
const positif = (t: string) => { const x = nb(t); return x !== null && x > 0 ? x : null; };
const oui = (t: string) => /^(1|oui|true|o)$/i.test(String(t || '').trim());
const lettre = (t: string) => { const x = String(t || '').trim().toUpperCase(); return /^[A-G]$/.test(x) ? x : ''; };
const euros = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n)} €`;

export type BienDuFlux = { donnees: Donnees; photos: string[]; titre: string; affId: string };

export function bienDepuisFlux(bloc: string): BienDuFlux {
  const info = section(bloc, 'info_generales');
  const vente = section(bloc, 'vente');
  const loc = section(bloc, 'localisation');
  const alur = section(bloc, 'alur');
  const affId = balise(info, 'aff_id');
  /* <LOCAL_COMMERCIAL> oui, <LOCALISATION> non : après le nom, « _ » ou rien. */
  const nomType = SECTIONS_TYPE.find(s => new RegExp(`<${s}(?:_[A-Z_]+)?(?:\\s[^>]*)?>`, 'i').test(bloc)) || '';
  const tagType = nomType ? (bloc.match(new RegExp(`<(${nomType}(?:_[A-Z_]+)?)(?:\\s[^>]*)?>`, 'i')) || [])[1] || nomType : '';
  const bien = tagType ? section(bloc, tagType) : '';
  const v = (nom: string) => balise(bien, nom);
  const d: Donnees = {};
  const notes: string[] = [];

  /* Le bien. */
  const typeBien = typeBienDe(nomType);
  if (typeBien) d.typeBien = typeBien;
  const cp = balise(loc, 'code_postal');
  if (balise(loc, 'adresse')) d.adresse = balise(loc, 'adresse');
  if (cp) d.cp = cp;
  const ville = villeDe(balise(loc, 'ville'), cp);
  if (ville) d.ville = ville;
  const lat = nb(balise(loc, 'latitude')), lng = nb(balise(loc, 'longitude'));
  if (lat && lng) d.gps = { lat, lon: lng };

  const surface = positif(v('surface_habitable'));
  if (surface) d.surface = surface;
  if (positif(v('surface_sejour'))) d.sejour = positif(v('surface_sejour'));
  if (positif(v('surface_terrain'))) d.terrain = positif(v('surface_terrain'));
  if (positif(v('nbre_pieces'))) d.pieces = positif(v('nbre_pieces'));
  if (positif(v('nbre_chambres'))) d.chambres = positif(v('nbre_chambres'));
  if (positif(v('nbre_salle_bain'))) d.sdb = positif(v('nbre_salle_bain'));
  if (positif(v('nbre_salle_eau'))) d.salleseau = positif(v('nbre_salle_eau'));
  if (positif(v('nbre_wc'))) d.wc = positif(v('nbre_wc'));
  const etage = nb(v('num_etage'));
  if (etage !== null && v('num_etage')) d.etage = etage;
  if (positif(v('nbre_etage'))) d.etages = positif(v('nbre_etage'));
  if ((positif(v('nbre_niveaux')) || 0) > 1) d.niveaux = positif(v('nbre_niveaux'));
  if (positif(v('annee_construction'))) d.annee = positif(v('annee_construction'));

  /* L'intérieur. */
  const etatSource = v('etat_interieur') || v('etat_general');
  const etat = etatDe(etatSource);
  if (etat) d.etat = etat; else if (etatSource) notes.push(`État : ${etatSource}`);
  const cu = cuisineDe(v('cuisine'));
  if (cu.cuisine) d.cuisine = cu.cuisine;
  if (cu.equip) d.cuisineEquip = cu.equip;
  const chf = chauffageDe(v('chauffage'), v('mecanisme_chauffage'), v('mode_chauffage'));
  if (chf.mode) d.chauffageMode = chf.mode;
  if (chf.energie) d.chauffageEnergie = chf.energie;
  if (chf.emetteurs) d.chauffageEmetteurs = chf.emetteurs;
  const fe = fenetresDe(v('fenetre'));
  if (fe.vitrage) d.vitrage = fe.vitrage;
  if (fe.menuiseries) d.menuiseries = fe.menuiseries;
  const vo = voletsDe(v('volets')), vm = voletsMateriauDe(v('volets'));
  if (vo) d.volets = vo;
  if (vm && vo !== 'aucun') d.voletsMateriau = vm;
  const eq: string[] = [];
  if (oui(v('calme'))) eq.push('calme');
  if (oui(v('clair'))) eq.push('lumineux');
  if (fe.vitrage === 'double') eq.push('doubleVitrage');
  if (vo === 'electriques') eq.push('voletsElec');
  if (eq.length) d.equipements = eq;
  if (v('vue')) { const vu = vueDe(v('vue')); if (vu) d.vue = vu; d.exterieurNote = `Vue : ${v('vue')}`; }

  /* L'immeuble, l'extérieur. */
  const imm: string[] = [];
  if (oui(v('ascenseur'))) imm.push('ascenseur');
  if (oui(v('gardien'))) imm.push('gardien');
  if (oui(v('digicode'))) imm.push('digicode');
  if (oui(v('interphone')) || oui(v('visiophone'))) imm.push('interphone');
  if (imm.length) d.immeuble = imm;
  const ann: string[] = [];
  if ((positif(v('nbre_balcon')) || 0) > 0) ann.push('balcon');
  if ((positif(v('nbre_terrasse')) || 0) > 0) ann.push('terrasse');
  if (oui(v('jardin'))) ann.push('jardin');
  if ((positif(v('nbre_caves')) || 0) > 0) ann.push('cave');
  const park = (positif(v('nbre_parking')) || 0) + (positif(v('nbre_box')) || 0) + (positif(v('nbre_garage')) || 0);
  if (park > 0) { ann.push('parking'); d.nbParking = park; }
  if (ann.length) d.annexes = ann;

  /* L'énergie. */
  const dpe = lettre(v('consommationenergetique')), ges = lettre(v('gazeffetdeserre'));
  if (dpe || ges) d.dpeStatut = 'fait';
  if (dpe) d.dpe = dpe;
  if (ges) d.ges = ges;
  if (positif(v('conso_annuel_energie'))) d.dpeValeur = positif(v('conso_annuel_energie'));
  if (positif(v('valeur_ges'))) d.gesValeur = positif(v('valeur_ges'));
  if (dateImmo(v('date_dpe'))) d.dpeDate = dateImmo(v('date_dpe'));

  /* La copropriété, les charges. */
  if (balise(alur, 'copropriete')) d.copro = /^oui$/i.test(balise(alur, 'copropriete')) ? 'oui' : 'non';
  if (positif(balise(alur, 'nb_lots'))) d.lots = positif(balise(alur, 'nb_lots'));
  if (positif(balise(alur, 'charges_annuelles'))) d.chargesAn = Math.round(positif(balise(alur, 'charges_annuelles'))!);
  const proc = balise(alur, 'nom_procedure');
  if (balise(alur, 'procedures') === '0' || /pas de proc/i.test(proc)) d.procedure = 'non';
  else if (proc) { d.procedure = 'oui'; d.procedureNature = proc; }
  if (positif(balise(vente, 'taxe_fonciere'))) d.taxeFonciere = Math.round(positif(balise(vente, 'taxe_fonciere'))!);

  /* Le prix, les honoraires, le mandat. */
  const prix = positif(balise(vente, 'prix'));
  if (prix) d.prix = Math.round(prix);
  const honoVen = positif(balise(vente, 'montant_hono_vendeur')) ?? positif(v('honoraires_vendeur'));
  const honoAcq = positif(balise(vente, 'montant_hono_acquereur')) ?? positif(balise(vente, 'honoraires_acquereur')) ?? positif(v('honoraires_acquereur'));
  const charge = balise(vente, 'charge_honoraires');
  if (/acqu/i.test(charge) || (!charge && honoAcq)) { d.charge = 'acquereur'; if (honoAcq) { d.honoMode = 'forfait'; d.forfait = Math.round(honoAcq); } }
  else if (/vendeur/i.test(charge) || honoVen) { d.charge = 'vendeur'; if (honoVen) { d.honoMode = 'forfait'; d.forfait = Math.round(honoVen); } }
  const tm = balise(vente, 'type_mandat');
  const mType = /^s$/i.test(tm) ? 'simple' : /^e$/i.test(tm) ? 'exclusif' : mandatTypeDe(tm);
  if (mType) d.mandatType = mType;
  if (balise(vente, 'num_mandat')) d.mandatNumero = balise(vente, 'num_mandat');
  const mDate = dateImmo(balise(vente, 'date_mandat') || v('date_premier_mandat'));
  if (mDate) d.mandatDate = mDate;
  const mFin = dateImmo(v('date_echeance_mandat'));
  if (mFin) d.mandatFin = mFin;
  if (positif(v('prix_mandat')) && positif(v('prix_mandat')) !== prix) notes.push(`Prix au mandat : ${euros(positif(v('prix_mandat'))!)}`);
  if (v('date_premier_mandat') && dateImmo(v('date_premier_mandat')) !== mDate) notes.push(`Premier mandat le ${v('date_premier_mandat')}`);

  /* La visite. */
  if (v('consignes_visite')) d.consignes = v('consignes_visite');

  /* L'annonce. */
  const titre = texteNet(balise(section(bloc, 'intitule'), 'fr'));
  const texte = texteNet(balise(section(bloc, 'commentaires'), 'fr'));
  if (titre) d.annonceTitre = titre;
  if (texte) d.annonceTexte = texte;
  if (v('observations_web')) notes.push(`Observations : ${texteNet(v('observations_web'))}`);

  /* Les pièces. */
  const pieces: Record<string, unknown>[] = [];
  const reP = /<piece(?:\s[^>]*)?>([\s\S]*?)<\/piece>/gi;
  let m: RegExpExecArray | null;
  while ((m = reP.exec(section(bloc, 'pieces'))) !== null) {
    const nom = balise(m[1], 'type_piece');
    if (!nom) continue;
    pieces.push({ id: `if${pieces.length}`, niveau: '', nom, surface: positif(balise(m[1], 'surface_piece')), expo: expoDe(balise(m[1], 'exposition_piece')).replace('traversant', ''), note: balise(m[1], 'description_piece') });
  }
  if (pieces.length) d.detailPieces = pieces;
  const sejour = pieces.find(p => /s[ée]jour|salon/i.test(String(p.nom)) && p.expo);
  if (sejour) d.expo = sejour.expo;

  /* Les photos, dans l'ordre d'ImmoFacile (copiées par la route). */
  const photos: string[] = [];
  const reI = /<img(?:\s[^>]*)?>([\s\S]*?)<\/img>/gi;
  while ((m = reI.exec(section(bloc, 'images'))) !== null) { const u = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim(); if (u) photos.push(u); }

  /* Les notes, et les numéros. */
  d.idImmofacile = affId;
  const cree = balise(info, 'date_creation');
  d.notes = [`Repris de l’annonce ImmoFacile n° ${affId}${cree ? ` (créée le ${cree.slice(0, 10).split('-').reverse().join('/')})` : ''} :`, ...notes.map(l => `· ${l}`),
    '· Le propriétaire et le numéro de mandat ne sont pas dans l’annonce : à compléter.'].join('\n');
  return { donnees: d, photos, titre: titre || `Bien n° ${affId}`, affId };
}
