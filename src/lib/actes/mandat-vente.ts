/* ═══ Le mandat de vente : simple, semi-exclusif ou exclusif ══════════════
   Un seul modèle, trois formes. Ce qui change de l'une à l'autre (tableau
   de l'étude « CRM Emilio ») :

                          simple        semi-exclusif          exclusif
     vendre seul          oui           oui (honoraires        non
                                        réduits ou nuls)
     autre agence         oui           non                    non
     clause pénale        non           en option              en option, en
                                                               caractères très
                                                               apparents
     fin après 3 mois     15 jours de préavis par recommandé (art. 78 du
                          décret du 20 juillet 1972), pour les trois

   Mentions exigées : le numéro du registre des mandats (art. 72 du décret),
   la durée limitée (art. 7 de la loi Hoguet), les honoraires et qui les
   paie (art. 6), les actions promises et la façon de rendre compte quand
   le mandat est exclusif (art. 6, loi ALUR), l'information précontractuelle,
   le médiateur et le droit de rétractation quand le mandat est signé hors
   de l'agence ou à distance (Code de la consommation, L111-1, L221-5,
   L221-18, L612-1). Une reconduction par périodes appelle l'information de
   l'article L215-1.

   ⚠️ Texte écrit pour Emilio, à faire relire par l'avocat d'Alexandre
   avant le premier usage. */

import { euros, type Partie, type Bloc, type Fiche, type Resume } from '@/lib/mandat';
import { lignesMandataire, phraseFonds, type IdentiteAgence } from '@/lib/agence';
import { BAREME_VENTE } from '@/lib/mandat';
import {
  P, Pp, eurosLettres, nbLettres, pourcent, jourLong, aujourdhui, txt, num, liste, vrai, lignes, couper,
  lirePersonnes, nomComplet, nomsCourts, fichePersonne, lignesPersonne, blocsInformations, ficheAgence,
  PERSONNE_VIDE, plusMois, veille, annexeL215, blocsSignature, manquesSignature, lieuDe, modeSignature, electronique, CHAMP_SIGNATURE, MANQUE_EXECUTION,
  ouiNon, IC_RYTHME, HONO_MODES, TANTIEMES_BASES, personneRegistre,
  type Donnees, type Modele, type Etape, type Contexte, type Personne, type Repere, type Echeance, type CaseSignature,
} from './commun';

export type TypeMandat = 'simple' | 'semi' | 'exclusif';
export const TYPES: Record<TypeMandat, { court: string; nom: string; maj: string }> = {
  simple: { court: 'Simple', nom: 'simple', maj: 'NON EXCLUSIF' },
  semi: { court: 'Semi-exclusif', nom: 'semi-exclusif', maj: 'SEMI-EXCLUSIF' },
  exclusif: { court: 'Exclusif', nom: 'exclusif', maj: 'EXCLUSIF' },
};
export const typeDe = (d: Donnees): TypeMandat => (d.type === 'semi' || d.type === 'exclusif' ? d.type : 'simple');
/* Les clauses de l'article 78 du décret (exclusivité, engagement exclusif,
   clause de suite, clause pénale), en caractères très apparents : en
   CAPITALES, pour se distinguer des encadrés ordinaires. */
const MAJ = (t: string) => t.toLocaleUpperCase('fr-FR');

/* Les actions que l'Agence promet : cases à cocher, dans cet ordre. */
export const ACTIONS: { v: string; ic: string; l: string; titre: string; x: string }[] = [
  { v: 'estimation', ic: 'courbe', l: 'Avis de valeur', titre: 'Estimer', x: 'Remettre au MANDANT un avis de valeur argumenté, fondé sur les ventes récentes du secteur.' },
  { v: 'photos', ic: 'photo', l: 'Photos professionnelles', titre: 'Photographier', x: 'Réaliser des photographies du bien, à la charge de l’Agence.' },
  { v: 'visite_virtuelle', ic: 'cube', l: 'Visite virtuelle', titre: 'Visite virtuelle', x: 'Réaliser une visite virtuelle du bien, à la charge de l’Agence.' },
  { v: 'dossier', ic: 'doc', l: 'Dossier de présentation', titre: 'Présenter', x: 'Rédiger une description et un dossier de présentation du bien, remis aux acquéreurs sérieux.' },
  { v: 'site', ic: 'globe', l: 'Site de l’agence', titre: 'Publier', x: 'Publier une annonce sur le site internet de l’Agence.' },
  { v: 'portails', ic: 'megaphone', l: 'Portails immobiliers', titre: 'Diffuser', x: 'Diffuser l’annonce sur les principaux portails immobiliers.' },
  { v: 'reseaux', ic: 'partage', l: 'Réseaux sociaux', titre: 'Faire connaître', x: 'Présenter le bien sur les réseaux sociaux de l’Agence.' },
  { v: 'fichier', ic: 'groupe', l: 'Fichier acquéreurs', titre: 'Proposer', x: 'Proposer le bien aux acquéreurs du fichier de l’Agence dont la recherche correspond.' },
  { v: 'vitrine', ic: 'vitrine', l: 'Vitrine', titre: 'Afficher', x: 'Afficher le bien en vitrine de l’Agence.' },
  { v: 'panneau', ic: 'panneau', l: 'Panneau « À vendre »', titre: 'Signaler', x: 'Poser un panneau « À vendre », avec l’accord du MANDANT et, le cas échéant, de la copropriété.' },
  { v: 'visites', ic: 'cle', l: 'Visites accompagnées', titre: 'Faire visiter', x: 'Organiser et accompagner chaque visite, après avoir vérifié l’identité des visiteurs et, autant que possible, leur capacité de financement.' },
  { v: 'offres', ic: 'accord', l: 'Transmission des offres', titre: 'Négocier', x: 'Transmettre au MANDANT, par écrit et sans délai, toute offre reçue, et l’accompagner dans la négociation.' },
  { v: 'suivi', ic: 'plume', l: 'Suivi jusqu’à l’acte', titre: 'Accompagner jusqu’à l’acte', x: 'Réunir les pièces nécessaires, préparer l’avant-contrat avec le notaire et suivre le dossier jusqu’à la signature de l’acte authentique.' },
];
const ACTIONS_DEFAUT = ['estimation', 'photos', 'dossier', 'site', 'portails', 'fichier', 'visites', 'offres', 'suivi'];

export const RYTHMES: Record<string, string> = {
  visite: 'après chaque visite',
  semaine: 'chaque semaine',
  quinzaine: 'toutes les deux semaines',
  mois: 'chaque mois',
};

const REGIMES: Record<string, string> = {
  communaute: 'mariés sans contrat, sous le régime de la communauté réduite aux acquêts',
  separation: 'mariés sous le régime de la séparation de biens',
  universelle: 'mariés sous le régime de la communauté universelle',
  participation: 'mariés sous le régime de la participation aux acquêts',
};

/* ── Les calculs d'argent ──
   À la charge de l'acquéreur, le prix affiché comprend les honoraires : le
   taux s'applique au prix net vendeur (usage courant), et le net vendeur
   s'obtient en divisant. À la charge du vendeur, le taux s'applique au prix
   de vente et vient en déduction. Arrondis à l'euro. */
export type Argent = { prix: number | null; net: number | null; honoraires: number | null; taux: number | null; forfait: number | null; charge: 'acquereur' | 'vendeur' };
export function argent(d: Donnees): Argent {
  const prix = num(d, 'prix');
  const charge = d.charge === 'vendeur' ? 'vendeur' : 'acquereur';
  const forfait = d.honoMode === 'forfait' ? num(d, 'forfait') : null;
  const taux = d.honoMode === 'forfait' ? null : num(d, 'taux');
  if (!prix || prix <= 0) return { prix: null, net: null, honoraires: forfait, taux, forfait, charge };
  let honoraires: number | null = null, net: number | null = null;
  if (forfait) { honoraires = Math.round(forfait); net = prix - (honoraires || 0); }
  else if (taux !== null && taux >= 0) {
    if (charge === 'acquereur') { net = Math.round(prix / (1 + taux / 100)); honoraires = prix - net; }
    else { honoraires = Math.round((prix * taux) / 100); net = prix - honoraires; }
  }
  return { prix, net, honoraires, taux, forfait, charge };
}

/* Le mandat est-il soumis au droit de rétractation ? Signé hors de
   l'agence ou à distance, avec un particulier : oui. */
export const retractation = (d: Donnees) => lieuDe(d) === 'domicile' || lieuDe(d) === 'distance';

/* Ce que le registre des mandats inscrit (V3.18). */
export function registreVente(d: Donnees): { nature: 'vente'; type_mandat: string; mandants: string; objet: string } {
  const vs = vendeursDe(d).filter(p => p.nom.trim() || p.prenom.trim());
  const mandants = d.qui === 'sci'
    ? [[txt(d, 'sciNom'), txt(d, 'sciForme')].filter(Boolean).join(', '), txt(d, 'sciSiege') ? `siège ${txt(d, 'sciSiege')}` : '', txt(d, 'sciRcs'),
      vs[0] ? `représentée par ${nomComplet(vs[0])}` : ''].filter(Boolean).join(', ')
    : vs.map(personneRegistre).join(' ; ');
  const prix = num(d, 'prix');
  const objet = [objetVente(d), prix ? `prix de présentation ${euros(prix)}` : ''].filter(Boolean).join(' · ');
  return { nature: 'vente', type_mandat: typeDe(d), mandants, objet };
}
/* Le bien, en une ligne : adresse, description, lots (le registre, la
   délégation). */
export function objetVente(d: Donnees): string {
  const lieu = [txt(d, 'adresse'), [txt(d, 'cp'), txt(d, 'ville')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const lots = estCopro(d) ? lignes(d, 'lots').map(l => l.numero).filter(Boolean) : [];
  return [lieu, couper(txt(d, 'description'), 140), lots.length ? `lot${lots.length > 1 ? 's' : ''} n° ${lots.join(', ')}` : ''].filter(Boolean).join(' · ');
}

export function vendeursDe(d: Donnees): Personne[] {
  const l = lirePersonnes(d.vendeurs);
  const nb = d.qui === 'couple' ? 2 : d.qui === 'personne' || d.qui === 'sci' ? 1 : Math.max(2, l.length);
  const out = l.slice(0, nb);
  while (out.length < nb) out.push({ ...PERSONNE_VIDE });
  return out;
}

const estCopro = (d: Donnees) => d.nature !== 'terrain' && d.copro === 'oui';
/* Une personne mariée qui vend le logement de la famille : son conjoint
   donne son accord (article 215 du Code civil). */
export const aConjoint = (d: Donnees) => d.qui === 'personne' && d.situation === 'marie' && d.logementFamille === 'oui';
export const baseTantiemes = (d: Donnees) => (d.tantiemesBase === '10000' || d.tantiemesBase === '100000' ? String(d.tantiemesBase) : '1000');
/* « 145/1 000es » ; une saisie complète (« 145/10 000es ») est gardée telle quelle. */
export function tantiemes(d: Donnees, v: string): string {
  if (!v) return '';
  if (v.includes('/')) return v;
  return `${v}/${baseTantiemes(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}es`;
}
export function iconeLot(l: Record<string, string>): string {
  const n = (l.nature || '').toLowerCase();
  if (/cave|cellier/.test(n)) return 'cave';
  if (/parking|box|garage|stationnement/.test(n)) return 'parking';
  if (/maison|pavillon/.test(n)) return 'maison';
  if (/appart|logement|studio|duplex|chambre|loft/.test(n)) return 'immeuble';
  return 'lots';
}

/* « Mariée. », « Célibataire. » : la situation d'une personne seule. */
function situationDe(d: Donnees, p: Personne): string {
  const f = p.civilite === 'Madame', h = p.civilite === 'Monsieur';
  const g = (fem: string, masc: string, deux: string) => (f ? fem : h ? masc : deux);
  switch (d.situation) {
    case 'celibataire': return 'Célibataire.';
    case 'marie': return g('Mariée.', 'Marié.', 'Marié(e).');
    case 'pacse': return g('Liée par un pacte civil de solidarité.', 'Lié par un pacte civil de solidarité.', 'Lié(e) par un pacte civil de solidarité.');
    case 'divorce': return g('Divorcée.', 'Divorcé.', 'Divorcé(e).');
    case 'veuf': return g('Veuve.', 'Veuf.', 'Veuf ou veuve.');
    default: return '';
  }
}

/* « Ce qu'il te faut », selon qui vend. */
function guideTitre(d: Donnees): string {
  return d.qui === 'sci' ? 'Une société : ce qu’il te faut'
    : d.qui === 'couple' ? 'Un couple : ce qu’il te faut'
      : d.qui === 'indivision' ? 'Plusieurs propriétaires : ce qu’il te faut'
        : 'Une personne : ce qu’il te faut';
}
function guidePoints(d: Donnees): { ic?: string; x: string }[] {
  if (d.qui === 'sci') return [
    { ic: 'immeuble', x: 'Le nom de la société, sa forme, son siège et son numéro RCS : tout est sur l’extrait Kbis (moins de 3 mois).' },
    { ic: 'personne', x: 'L’identité du gérant qui signe (sa date de naissance n’est pas utile ici).' },
    { ic: 'livre', x: 'Les statuts : ils disent qui a le pouvoir de vendre. S’ils exigent l’accord des associés, demande la décision (procès-verbal) et joins-la au mandat.' },
  ];
  if (d.qui === 'couple') return [
    { ic: 'couple', x: 'L’état civil complet des deux : nom, prénoms, nom de naissance, date et lieu de naissance, adresse.' },
    d.lien === 'maries'
      ? { ic: 'livre', x: 'Le régime matrimonial (livret de famille ou contrat de mariage). Les deux signent le mandat.' }
      : d.lien === 'pacses'
        ? { ic: 'livre', x: 'Pacsés : chacun signe pour sa part du bien. Les deux signent le mandat.' }
        : { ic: 'livre', x: 'Ni mariés ni pacsés : ils sont propriétaires ensemble (en indivision). Les deux signent le mandat, obligatoirement.' },
    { ic: 'plume', x: 'Si l’un ne peut pas être là : une procuration écrite de l’autre, jointe au mandat.' },
  ];
  if (d.qui === 'indivision') return [
    { ic: 'groupe', x: 'Tous les propriétaires, avec leur état civil complet : vendre demande l’accord de chacun, chacun signe.' },
    { ic: 'plus', x: 'Deux fiches sont ouvertes ; « Ajouter un propriétaire » en ajoute d’autres.' },
    { ic: 'balance', x: 'Une succession : note le notaire qui la règle (en bas de l’étape).' },
  ];
  return [
    { ic: 'personne', x: 'Son état civil complet : nom, prénoms, nom de naissance, date et lieu de naissance, adresse.' },
    { ic: 'couple', x: 'Sa situation. Mariée ou marié : si le bien a été acheté pendant le mariage sans contrat, il appartient aux deux — choisis plutôt « Un couple ». Si c’est le logement de la famille, le conjoint donne son accord et signe aussi.' },
  ];
}

/* ══ Les questions ══════════════════════════════════════════════════════
   V3.18 : huit étapes courtes (qui vend, sa situation, le bien, la
   copropriété, le mandat et sa durée, le prix et les honoraires, les
   engagements, la signature), rangées en blocs ; chaque réponse a son
   dessin. Les réponses, les clés et le texte n'ont pas changé. */
const ETAPES: Etape[] = [
  {
    id: 'qui', titre: 'Qui vend', court: 'Qui vend', sous: 'Ce que la fiche client connaissait est déjà rempli.', vers: 'Entre les soussignés', ic: 'personne',
    champs: [
      { t: 'choix', cle: 'qui', lib: 'Qui vend ?', ic: 'personne', tuiles: true, options: [
        { v: 'personne', l: 'Une personne', aide: 'Seule propriétaire du bien.', ic: 'personne' },
        { v: 'couple', l: 'Un couple', aide: 'Mariés, pacsés, ou ni l’un ni l’autre.', ic: 'couple' },
        { v: 'indivision', l: 'Plusieurs propriétaires', aide: 'Une succession, des frères et sœurs…', ic: 'groupe' },
        { v: 'sci', l: 'Une société (SCI)', aide: 'Le gérant signe pour elle.', ic: 'immeuble' },
      ] },
      { t: 'guide', cle: 'g-qui', titre: guideTitre, points: guidePoints },
      { t: 'titre', cle: 't-sci', lib: 'La société', ic: 'immeuble', si: d => d.qui === 'sci' },
      { t: 'texte', cle: 'sciNom', lib: 'Nom de la société', ic: 'immeuble', requis: true, si: d => d.qui === 'sci', exemple: 'SCI DES LILAS' },
      { t: 'texte', cle: 'sciForme', lib: 'Forme et capital', ic: 'doc', si: d => d.qui === 'sci', exemple: 'Société civile immobilière au capital de 1 000 €' },
      { t: 'texte', cle: 'sciSiege', lib: 'Siège social', ic: 'lieu', large: true, requis: true, si: d => d.qui === 'sci' },
      { t: 'texte', cle: 'sciRcs', lib: 'Immatriculation', ic: 'livre', si: d => d.qui === 'sci', exemple: 'RCS de Nanterre n° 123 456 789', aide: 'Sur l’extrait Kbis.' },
      { t: 'titre', cle: 't-vendeurs', lib: 'Les vendeurs', ic: 'couple', aide: 'Leur état civil, tel que l’acte le reprendra.' },
      { t: 'personnes', cle: 'vendeurs', lib: 'Les vendeurs', ic: 'personne', un: 'Vendeur', min: 1, max: 6, complet: d => d.qui !== 'sci',
        bornes: d => (d.qui === 'couple' ? { min: 2, max: 2 } : d.qui === 'indivision' ? { min: 2, max: 6 } : { min: 1, max: 1 }),
        nomCarte: (d, i) => (d.qui === 'sci' ? 'Le gérant qui signe' : d.qui === 'personne' ? 'Le vendeur' : d.qui === 'indivision' ? `Propriétaire ${i + 1}` : `Vendeur ${i + 1}`),
        ajouter: d => (d.qui === 'indivision' ? 'Ajouter un propriétaire' : 'Ajouter un vendeur') },
      { t: 'texte', cle: 'sciPouvoir', lib: 'Qualité du signataire', ic: 'plume', large: true, si: d => d.qui === 'sci', exemple: 'gérant, en vertu des statuts', aide: 'Si les statuts l’exigent, joins la décision des associés qui autorise la vente.' },
    ],
  },
  {
    id: 'situation', titre: 'Sa situation', court: 'Situation', sous: 'Sa situation de famille, qui signe, et ce qu’il faut savoir en plus.', vers: 'Entre les soussignés', ic: 'couple',
    champs: [
      { t: 'titre', cle: 't-famille', lib: 'La famille', ic: 'couple', si: d => d.qui === 'personne' || d.qui === 'couple' },
      { t: 'choix', cle: 'situation', lib: 'Sa situation', ic: 'personne', si: d => d.qui === 'personne', options: [
        { v: 'celibataire', l: 'Célibataire', ic: 'personne' }, { v: 'marie', l: 'Mariée ou marié', ic: 'alliances' }, { v: 'pacse', l: 'Pacsée ou pacsé', ic: 'coeur' },
        { v: 'divorce', l: 'Divorcée ou divorcé', ic: 'rompu' }, { v: 'veuf', l: 'Veuve ou veuf', ic: 'fleur' },
      ] },
      { t: 'choix', cle: 'logementFamille', lib: 'Le bien est-il le logement de la famille ?', ic: 'maison', si: d => d.qui === 'personne' && d.situation === 'marie',
        options: ouiNon(),
        aide: 'Même s’il n’appartient qu’à lui ou à elle, le conjoint doit donner son accord pour vendre le logement de la famille (article 215 du Code civil).' },
      { t: 'texte', cle: 'conjoint', lib: 'Le conjoint, qui donne son accord', ic: 'couple', large: true, requis: true, exemple: 'Madame Claire MARTIN', si: aConjoint },
      { t: 'choix', cle: 'lien', lib: 'Ils sont…', ic: 'couple', si: d => d.qui === 'couple', options: [
        { v: 'maries', l: 'Mariés', ic: 'alliances' }, { v: 'pacses', l: 'Pacsés', ic: 'coeur' }, { v: 'aucun', l: 'Ni l’un ni l’autre', ic: 'couple' },
      ] },
      { t: 'choix', cle: 'regime', lib: 'Sous quel régime ?', ic: 'livre', si: d => d.qui === 'couple' && d.lien === 'maries', options: [
        { v: 'communaute', l: 'Sans contrat (communauté légale)', ic: 'couple' }, { v: 'separation', l: 'Séparation de biens', ic: 'separation' },
        { v: 'universelle', l: 'Communauté universelle', ic: 'globe' }, { v: 'participation', l: 'Participation aux acquêts', ic: 'balance' }, { v: 'autre', l: 'Autre', ic: 'points' },
      ], aide: 'Le régime est écrit dans le livret de famille (ou le contrat de mariage). Sans contrat, un bien acheté pendant le mariage appartient aux deux.' },
      { t: 'texte', cle: 'regimeAutre', lib: 'Précisez le régime', ic: 'plume', large: true, si: d => d.qui === 'couple' && d.lien === 'maries' && d.regime === 'autre' },
      { t: 'choix', cle: 'represente', lib: 'L’un représente l’autre ?', ic: 'plume', si: d => d.qui === 'couple', options: [
        { v: 'non', l: 'Non, les deux signent', ic: 'couple' }, { v: '0', l: 'Le premier représente le second', ic: 'fleche' }, { v: '1', l: 'Le second représente le premier', ic: 'retour' },
      ], aide: 'Seulement avec une procuration écrite, jointe au mandat.' },
      { t: 'titre', cle: 't-plus', lib: 'À savoir aussi', ic: 'info' },
      { t: 'choix', cle: 'fiscal', lib: 'Résidence fiscale en France ?', ic: 'fiscal', options: ouiNon() },
      { t: 'texte', cle: 'notaire', lib: 'Notaire du vendeur', ic: 'balance', large: true, exemple: 'Me Durand, notaire à Boulogne-Billancourt', aide: 'Facultatif. Pour une succession : le notaire qui la règle.' },
      { t: 'zone', cle: 'noteVendeurs', lib: 'Une précision ?', ic: 'plume', large: true, aide: 'Note libre, imprimée sous les vendeurs. Ex : « M. Martin est l’interlocuteur pour les visites. »' },
    ],
  },
  {
    id: 'bien', titre: 'Le bien', court: 'Le bien', sous: 'Ce qui sera vendu, tel que l’acte le décrira.', vers: 'Le bien', ic: 'maison',
    champs: [
      { t: 'choix', cle: 'nature', lib: 'Nature', ic: 'maison', tuiles: true, options: [
        { v: 'appartement', l: 'Appartement', ic: 'immeuble' }, { v: 'maison', l: 'Maison', ic: 'maison' },
        { v: 'terrain', l: 'Terrain', ic: 'terrain' }, { v: 'autre', l: 'Autre', ic: 'plus' },
      ] },
      { t: 'titre', cle: 't-adresse', lib: 'Où il se trouve', ic: 'lieu' },
      { t: 'texte', cle: 'adresse', lib: 'Adresse', ic: 'lieu', large: true, requis: true, exemple: '12 rue des Lilas' },
      { t: 'texte', cle: 'cp', lib: 'Code postal', ic: 'mail', requis: true },
      { t: 'texte', cle: 'ville', lib: 'Ville', ic: 'immeuble', requis: true },
      { t: 'zone', cle: 'description', lib: 'Description', ic: 'doc', large: true, requis: true, exemple: 'un appartement de 4 pièces au 3e étage avec ascenseur : entrée, séjour, cuisine, deux chambres, salle de bains, WC' },
      { t: 'titre', cle: 't-surf', lib: 'Surfaces et cadastre', ic: 'regle' },
      { t: 'nombre', cle: 'surfaceHab', lib: 'Surface habitable', ic: 'regle', unite: 'm²', si: d => d.nature !== 'terrain' && !estCopro(d),
        aide: 'Indicative : hors copropriété, la loi Carrez ne s’applique pas. Si tu l’indiques, elle doit rester exacte.' },
      { t: 'nombre', cle: 'terrain', lib: 'Surface du terrain', ic: 'terrain', unite: 'm²', si: d => d.nature === 'maison' || d.nature === 'terrain' },
      { t: 'texte', cle: 'cadastre', lib: 'Références cadastrales', ic: 'plan', large: true, exemple: 'section AB n° 123', aide: 'Sur l’avis de taxe foncière ou le titre de propriété. Indispensable pour une maison ou un terrain.' },
      { t: 'titre', cle: 't-occ', lib: 'Le jour de la vente', ic: 'cle' },
      { t: 'choix', cle: 'occupation', lib: 'Le bien sera…', ic: 'cle', tuiles: true, options: [
        { v: 'libre', l: 'Libre', ic: 'cle' }, { v: 'vendeur', l: 'Libéré par le vendeur', ic: 'sac' }, { v: 'loue', l: 'Loué', ic: 'bail' },
      ] },
      { t: 'zone', cle: 'bail', lib: 'Le bail', ic: 'bail', large: true, si: d => d.occupation === 'loue', exemple: 'bail d’habitation du 1er mars 2024, loyer de 1 450 € par mois hors charges' },
      { t: 'texte', cle: 'meubles', lib: 'Meubles vendus avec le bien', ic: 'canape', large: true, exemple: 'cuisine équipée' },
      { t: 'zone', cle: 'noteBien', lib: 'Une précision ?', ic: 'plume', large: true },
    ],
  },
  {
    id: 'copro', titre: 'La copropriété', court: 'Copropriété', sous: 'Les lots vendus, leurs tantièmes, la surface Carrez.', vers: 'Le bien', ic: 'immeuble',
    champs: [
      { t: 'guide', cle: 'g-terrain', si: d => d.nature === 'terrain', titre: () => 'Un terrain : rien à remplir ici', points: () => [
        { ic: 'terrain', x: 'Un terrain n’est pas en copropriété. Passe à l’étape suivante.' },
      ] },
      { t: 'choix', cle: 'copro', lib: 'En copropriété ?', ic: 'immeuble', si: d => d.nature !== 'terrain', options: [{ v: 'oui', l: 'Oui', ic: 'immeuble' }, { v: 'non', l: 'Non', ic: 'maison' }],
        aide: 'Une maison peut l’être aussi (maisons groupées autour de parties communes).' },
      { t: 'titre', cle: 't-lots', lib: 'Les lots', ic: 'lots', si: estCopro },
      { t: 'choix', cle: 'tantiemesBase', lib: 'Les tantièmes sont comptés sur', ic: 'pourcent', si: estCopro, options: TANTIEMES_BASES,
        aide: 'C’est le règlement de copropriété qui le fixe : regarde sur le titre de propriété ou un appel de charges.' },
      { t: 'lignes', cle: 'lots', lib: 'Les lots vendus', ic: 'lots', un: 'Lot', max: 12, large: true, si: estCopro, icone: iconeLot, colonnes: [
        { cle: 'numero', lib: 'N° du lot', exemple: '12' },
        { cle: 'nature', lib: 'Ce que c’est', exemple: 'l’appartement, une cave, un parking…' },
        { cle: 'tantiemes', lib: 'Tantièmes', exemple: '145', nombre: true, suffixe: d => `/ ${baseTantiemes(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}` },
      ], aide: 'Un lot par ligne : le logement, puis la cave, le parking…' },
      { t: 'titre', cle: 't-carrez', lib: 'La surface Carrez', ic: 'regle', si: estCopro },
      { t: 'nombre', cle: 'carrez', lib: 'Surface loi Carrez', ic: 'regle', unite: 'm²', si: estCopro, aide: 'Celle du lot principal, mesurée par un professionnel.' },
      { t: 'texte', cle: 'carrezPar', lib: 'Mesurée par', ic: 'personne', si: estCopro, exemple: 'Diag Expert, le 3 septembre 2026' },
    ],
  },
  {
    id: 'mandat', titre: 'Le mandat et sa durée', court: 'Mandat et durée', sous: 'Simple, semi-exclusif ou exclusif, et combien de temps.', vers: 'Durée', ic: 'cadenas',
    champs: [
      { t: 'choix', cle: 'type', lib: 'Quel mandat ?', ic: 'cadenas', tuiles: true, options: [
        { v: 'simple', l: 'Simple', aide: 'Le vendeur reste libre : il vend seul ou par d’autres agences.', ic: 'ouvert' },
        { v: 'semi', l: 'Semi-exclusif', aide: 'Aucune autre agence ; il peut encore vendre seul.', ic: 'bouclier' },
        { v: 'exclusif', l: 'Exclusif', aide: 'Toi seul, pendant la durée du mandat.', ic: 'cadenas' },
      ] },
      { t: 'titre', cle: 't-duree', lib: 'La durée', ic: 'calendrier' },
      { t: 'nombre', cle: 'duree', lib: 'Durée', ic: 'chrono', unite: 'mois', requis: true,
        aide: 'La phrase « passé un délai de trois mois… » (art. 78 du décret de 1972) reste même pour un mandat plus court : la loi l’attache à l’exclusivité, à la clause pénale et à la clause « pas de vente en direct ». Elle ne joue que si le mandat dure plus de trois mois.' },
      { t: 'choix', cle: 'dureeMode', lib: 'À son terme', ic: 'drapeau', tuiles: true, options: [
        { v: 'fixe', l: 'Il prend fin', aide: 'Sans suite : on en signe un autre si besoin.', ic: 'drapeau' },
        { v: 'prorogation', l: 'Il se poursuit', aide: 'Par périodes, jusqu’à une limite totale.', ic: 'boucle' },
      ] },
      { t: 'nombre', cle: 'periode', lib: 'Par périodes de', ic: 'boucle', unite: 'mois', si: d => d.dureeMode === 'prorogation' },
      { t: 'nombre', cle: 'dureeMax', lib: 'Dans la limite de', ic: 'drapeau', unite: 'mois au total', si: d => d.dureeMode === 'prorogation' },
    ],
  },
  {
    id: 'prix', titre: 'Prix et honoraires', court: 'Prix et honoraires', sous: 'Le prix affiché, qui paie les honoraires, et combien.', vers: 'Prix', reperesApres: 'semiMontant', ic: 'euro',
    champs: [
      { t: 'euros', cle: 'prix', lib: 'Prix de présentation', ic: 'etiquette', requis: true, aide: 'Le prix affiché dans les annonces.' },
      { t: 'choix', cle: 'charge', lib: 'Les honoraires sont à la charge…', ic: 'euro', tuiles: true, options: [
        { v: 'acquereur', l: 'De l’acquéreur', aide: 'Compris dans le prix affiché.', ic: 'cle' },
        { v: 'vendeur', l: 'Du vendeur', aide: 'Déduits du prix de vente.', ic: 'maison' },
      ] },
      { t: 'titre', cle: 't-hono', lib: 'Les honoraires', ic: 'euro' },
      { t: 'choix', cle: 'honoMode', lib: 'Honoraires', ic: 'euro', options: HONO_MODES },
      { t: 'nombre', cle: 'taux', lib: 'Taux', ic: 'pourcent', unite: '% TTC', si: d => d.honoMode !== 'forfait', aide: `Ton barème : ${String(BAREME_VENTE).replace('.', ',')} % TTC au plus.` },
      { t: 'euros', cle: 'forfait', lib: 'Forfait', ic: 'euro', unite: '€ TTC', si: d => d.honoMode === 'forfait' },
      { t: 'choix', cle: 'semiDirect', lib: 'S’il vend lui-même, sans intermédiaire', ic: 'bouclier', si: d => d.type === 'semi', options: [
        { v: 'aucun', l: 'Aucun honoraire', ic: 'ouvert' }, { v: 'reduits', l: 'Des honoraires réduits', ic: 'pourcent' },
      ] },
      { t: 'euros', cle: 'semiMontant', lib: 'Honoraires réduits', ic: 'euro', unite: '€ TTC', si: d => d.type === 'semi' && d.semiDirect === 'reduits' },
    ],
  },
  {
    id: 'engagements', titre: 'Engagements', court: 'Engagements', sous: 'Ce que tu fais pour vendre, et comment tu en rends compte.', vers: 'Engagements de l’Agence', ic: 'etoile',
    champs: [
      { t: 'cases', cle: 'actions', lib: 'Ce que tu t’engages à faire', ic: 'etoile', options: ACTIONS.map(a => ({ v: a.v, l: a.l, ic: a.ic })) },
      { t: 'choix', cle: 'rythme', lib: 'Comptes rendus', ic: 'horloge', options: Object.entries(RYTHMES).map(([v, l]) => ({ v, l: l.charAt(0).toUpperCase() + l.slice(1), ic: IC_RYTHME[v] })) },
      { t: 'cases', cle: 'pouvoirs', lib: 'Pouvoirs donnés à l’agence', ic: 'cle', options: [
        { v: 'syndic', l: 'Demander les pièces au syndic', ic: 'immeuble' }, { v: 'cles', l: 'Détenir les clés', ic: 'cle' }, { v: 'delegation', l: 'Déléguer à un confrère', ic: 'accord' },
      ], aide: '« Déléguer à un confrère » est coché d’office : tu pourras confier la vente à un confrère sans avenant.' },
      { t: 'titre', cle: 't-clauses', lib: 'Les clauses', ic: 'balance' },
      { t: 'nombre', cle: 'suite', lib: 'Pas de vente en direct à un acquéreur présenté, pendant le mandat et', ic: 'chrono', unite: 'mois après', aide: '12 mois au plus. Au-delà, plus rien n’est dû.' },
      { t: 'choix', cle: 'memePrix', lib: 'Le même prix dans toutes les agences ?', ic: 'etiquette', si: d => d.type === 'simple', options: ouiNon() },
      { t: 'choix', cle: 'penale', lib: 'Clause pénale', ic: 'balance', si: d => d.type !== 'simple', options: ouiNon(),
        aide: 'S’il ne respecte pas l’exclusivité, il doit une indemnité égale aux honoraires. Elle est imprimée en caractères très apparents, comme la loi l’exige.' },
      /* V3.17 : « ni jointe, ni mentionnée » — le mandat seul, sans la phrase
         qui dit que l'information a été remise. */
      { t: 'choix', cle: 'infoJointe', lib: 'L’information précontractuelle', ic: 'info', options: [
        { v: 'oui', l: 'Jointe au mandat', ic: 'trombone' }, { v: 'non', l: 'Remise à part', ic: 'envoyer' }, { v: 'aucune', l: 'Ni jointe, ni mentionnée', ic: 'croix' },
      ],
        aide: 'Avec un particulier, elle est obligatoire avant la signature, et la phrase du mandat qui dit qu’elle a été remise en est la preuve. « Ni jointe, ni mentionnée » : le mandat seul, à réserver à un mandant qui n’est pas un particulier, ou à qui tu la remets autrement.' },
      /* Ce que le document contiendra, et pourquoi (V3.17) : les annexes ne
         dépendent pas de ce choix, et il faut le voir sans chercher. */
      { t: 'guide', cle: 'g-contenu', titre: () => 'Ce que le document contiendra', points: d => [
        { ic: 'doc', x: 'Le mandat de vente.' },
        ...(d.infoJointe === 'oui' ? [{ ic: 'info', x: 'L’information précontractuelle, jointe.' }]
          : d.infoJointe === 'aucune' ? [{ ic: 'croix', x: 'Pas d’information précontractuelle, et le mandat n’en parle pas.' }]
            : [{ ic: 'info', x: 'Pas d’information précontractuelle jointe : le mandat dit seulement qu’elle a été remise.' }]),
        ...(d.dureeMode === 'prorogation' ? [{ ic: 'boucle', x: 'L’annexe « la reconduction du mandat », parce qu’il se poursuit par périodes (la loi l’exige). Choisis « Il prend fin » dans la durée pour qu’elle parte.' }] : []),
        ...(retractation(d) ? [{ ic: 'retour', x: 'Le formulaire de rétractation, parce qu’il est signé hors de l’agence ou à distance (obligatoire).' }] : []),
      ] },
      { t: 'zone', cle: 'clause', lib: 'Clause particulière', ic: 'plume', large: true, aide: 'Imprimée telle quelle, avant les signatures.' },
    ],
  },
  {
    id: 'signature', titre: 'La signature', court: 'Signature', sous: 'Comment, où, et le numéro du registre.', vers: 'Date et signatures', ic: 'plume',
    champs: [
      CHAMP_SIGNATURE,
      { t: 'choix', cle: 'lieu', lib: 'Où sera-t-il signé ?', ic: 'lieu', tuiles: true, si: d => modeSignature(d) !== 'en_ligne', options: [
        { v: 'agence', l: 'À l’agence', ic: 'agence' }, { v: 'domicile', l: 'Chez le vendeur', ic: 'maison' }, { v: 'distance', l: 'À distance', ic: 'ecran' },
      ], aide: 'Hors de l’agence ou à distance, le vendeur a 14 jours pour se rétracter : le mandat le dit, avec le formulaire.' },
      { t: 'choix', cle: 'execution', lib: 'Commencer avant la fin des 14 jours ?', ic: 'eclair', si: d => retractation(d), options: [
        { v: 'oui', l: 'Oui, il le demande', ic: 'eclair' }, { v: 'non', l: 'Non, il attend', ic: 'horloge' }, { v: '', l: 'Il cochera sur place', ic: 'plume' },
      ], aide: 'En ligne ou sur place, « Oui » lui fait cocher lui-même une case à part en signant : c’est sa demande expresse.' },
      { t: 'titre', cle: 't-registre', lib: 'Le registre et la date', ic: 'livre' },
      { t: 'texte', cle: 'numero', lib: 'N° du registre des mandats', ic: 'livre', requis: true, aide: 'Celui que tu réserves dans ton registre (ImmoFacile). Il doit figurer sur le mandat avant la signature.' },
      { t: 'texte', cle: 'faitA', lib: 'Fait à', ic: 'lieu', requis: true },
      { t: 'date', cle: 'date', lib: 'Le', ic: 'calendrier', requis: true },
    ],
  },
];

/* ══ Le texte ═══════════════════════════════════════════════════════════ */
function rediger(d: Donnees, A: IdentiteAgence): Partie[] {
  const type = typeDe(d);
  const T = TYPES[type];
  const vs = vendeursDe(d);
  const plusieurs = d.qui === 'couple' || d.qui === 'indivision';
  const mandant = plusieurs ? 'le MANDANT (ensemble et solidairement)' : 'le MANDANT';
  const a = argent(d);
  const retr = retractation(d);
  const actions = liste(d, 'actions');
  const pouvoirs = liste(d, 'pouvoirs');
  const suite = num(d, 'suite') ?? 12;
  const duree = num(d, 'duree') ?? 3;
  const periode = num(d, 'periode') ?? 3;
  const dureeMax = num(d, 'dureeMax') ?? 12;
  const numero = txt(d, 'numero');
  const adresse = [txt(d, 'adresse'), [txt(d, 'cp'), txt(d, 'ville')].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  /* ── Les parties ── */
  const fiches: Fiche[] = [];
  if (d.qui === 'sci') {
    const g = vs[0];
    fiches.push({ ic: 'agence', titre: (txt(d, 'sciNom') || 'La société').toUpperCase(), lignes: [
      txt(d, 'sciForme'), txt(d, 'sciSiege') ? `Siège : ${txt(d, 'sciSiege')}` : '', txt(d, 'sciRcs'),
      `Représentée par ${nomComplet(g)}${txt(d, 'sciPouvoir') ? `, ${txt(d, 'sciPouvoir')}` : ''}.`,
      [g.telephone, g.email].filter(Boolean).join(' · '),
    ].filter(Boolean), pied: 'Ci-après « le MANDANT »' });
  } else if (d.qui === 'couple') {
    const [p1, p2] = vs;
    const lien = d.lien === 'maries'
      ? (d.regime === 'autre' ? `mariés sous le régime ${txt(d, 'regimeAutre') || 'indiqué ci-après'}` : REGIMES[String(d.regime)] || 'mariés')
      : d.lien === 'pacses' ? 'liés par un pacte civil de solidarité' : '';
    fiches.push({ ic: 'personne', titre: `${nomComplet(p1)} et ${nomComplet(p2)}`, lignes: [
      ...lignesPersonne(p1).map((l, i) => (i === 0 ? `${p1.prenom || 'Le premier'} : ${l.charAt(0).toLowerCase()}${l.slice(1)}` : l)),
      ...lignesPersonne(p2).map((l, i) => (i === 0 ? `${p2.prenom || 'Le second'} : ${l.charAt(0).toLowerCase()}${l.slice(1)}` : l)),
      ...(lien ? [lien.charAt(0).toUpperCase() + lien.slice(1) + '.'] : []),
    ], pied: 'Ci-après ensemble « le MANDANT », agissant solidairement' });
  } else {
    vs.forEach((p, i) => fiches.push(fichePersonne(p, 'personne',
      vs.length > 1 ? (i === vs.length - 1 ? 'Ci-après ensemble « le MANDANT », agissant solidairement' : undefined) : 'Ci-après « le MANDANT »')));
    const sit = d.qui === 'personne' ? situationDe(d, vs[0]) : '';
    if (sit && fiches[0]) fiches[0] = { ...fiches[0], lignes: [...fiches[0].lignes.filter(l => !/à compléter/.test(l)), sit] };
  }
  fiches.push(ficheAgence(A, lignesMandataire(A), phraseFonds(A), 'Ci-après « l’Agence » ou « le MANDATAIRE »'));

  const entre: Bloc[] = [{ t: 'fiches', items: fiches }];
  const repr = d.qui === 'couple' && (d.represente === '0' || d.represente === '1') ? Number(d.represente) : -1;
  if (repr >= 0) {
    entre.push(Pp(`${nomComplet(vs[repr])} agit tant en son nom personnel qu’au nom de ${nomComplet(vs[1 - repr])}, en vertu d’une procuration écrite annexée au présent mandat.`));
  }
  if (aConjoint(d)) {
    entre.push(P(`Le bien constituant le logement de la famille, ${txt(d, 'conjoint') || '……………'}, conjoint du MANDANT, intervient au présent mandat pour donner son accord à la vente (article 215 du Code civil).`));
  }
  if (txt(d, 'notaire')) entre.push(Pp(`Notaire chargé de la vente pour le MANDANT : ${txt(d, 'notaire')}.`));
  if (d.fiscal === 'non') entre.push(Pp(`${plusieurs ? 'Les vendeurs déclarent' : 'Le vendeur déclare'} ne pas avoir sa résidence fiscale en France : le notaire en tiendra compte pour l’impôt sur la plus-value.`));
  if (txt(d, 'noteVendeurs')) entre.push(P(`Précision : ${txt(d, 'noteVendeurs')}`));

  /* ── L'objet ── */
  const objet: Bloc[] = type === 'exclusif'
    ? [
      P('Le MANDANT confie au MANDATAIRE, qui l’accepte, un mandat EXCLUSIF de rechercher un acquéreur pour le bien désigné ci-après et d’en négocier la vente.', true),
      P(MAJ('Clause d’exclusivité : pendant toute la durée du mandat, le MANDANT s’interdit de vendre le bien, directement ou par un autre intermédiaire.'), true),
    ]
    : type === 'semi'
      ? [
        P('Le MANDANT confie au MANDATAIRE, qui l’accepte, un mandat SEMI-EXCLUSIF de rechercher un acquéreur pour le bien désigné ci-après et d’en négocier la vente.', true),
        P(MAJ('Clause de semi-exclusivité : pendant toute la durée du mandat, le MANDANT s’interdit de confier la vente à un autre intermédiaire ; il reste libre de vendre lui-même, directement, à un acquéreur qui ne lui a été présenté par aucun intermédiaire.'), true),
      ]
      : [P('Le MANDANT confie au MANDATAIRE, qui l’accepte, un mandat NON EXCLUSIF de rechercher un acquéreur pour le bien désigné ci-après et d’en négocier la vente. Le MANDANT reste libre de vendre lui-même ou de confier d’autres mandats non exclusifs.', true)];

  /* ── Le bien ── */
  const nature = String(d.nature || '');
  const bien: Bloc[] = [
    P(`${adresse ? `Situé ${adresse} : ` : ''}${txt(d, 'description') || 'description à compléter'}${/[.!?]$/.test(txt(d, 'description')) ? '' : '.'}`, true),
  ];
  const m2 = (n: number) => `${String(n).replace('.', ',')} m²`;
  if (estCopro(d)) {
    const lots = lignes(d, 'lots');
    const carrez = num(d, 'carrez');
    bien.push(P(`Le bien dépend d’un immeuble soumis au statut de la copropriété${lots.length ? `. Il comprend ${lots.length > 1 ? `les ${nbLettres(lots.length)} lots suivants` : 'le lot suivant'} :` : '.'}`));
    if (lots.length) bien.push({ t: 'l', items: lots.map(l => `Lot n° ${l.numero || '…'}${l.nature ? ` : ${l.nature}` : ''}${l.tantiemes ? `, et les ${tantiemes(d, l.tantiemes)} des parties communes générales` : ''}.`) });
    if (carrez) bien.push(P(`Surface privative au sens de la loi du 10 juillet 1965 (loi Carrez) : ${m2(carrez)}${txt(d, 'carrezPar') ? `, mesurée par ${txt(d, 'carrezPar')}` : ''}.`));
  } else if (nature !== 'terrain' && num(d, 'surfaceHab')) {
    bien.push(P(`Surface habitable : ${m2(num(d, 'surfaceHab') || 0)}, indiquée à titre d’information.`));
  }
  if ((nature === 'maison' || nature === 'terrain') && num(d, 'terrain')) bien.push(P(`Terrain d’une contenance de ${m2(num(d, 'terrain') || 0)}.`));
  if (txt(d, 'cadastre')) bien.push(P(`Références cadastrales : ${txt(d, 'cadastre')}.`));
  bien.push(P(d.occupation === 'loue'
    ? `Le bien est loué${txt(d, 'bail') ? ` (${txt(d, 'bail')})` : ''} : il sera vendu occupé, le bail se poursuivant avec l’acquéreur.`
    : d.occupation === 'vendeur'
      ? 'Le bien est occupé par le MANDANT, qui le libérera au plus tard le jour de la signature de l’acte de vente.'
      : 'Le bien sera libre de toute occupation le jour de la signature de l’acte de vente.'));
  if (txt(d, 'meubles')) bien.push(P(`Sont également vendus avec le bien : ${txt(d, 'meubles')}.`));
  if (txt(d, 'noteBien')) bien.push(P(`Précision : ${txt(d, 'noteBien')}`));

  /* ── Le prix et les honoraires ── */
  const prix: Bloc[] = a.prix
    ? [
      P(`Prix de présentation : ${eurosLettres(a.prix)}${a.charge === 'acquereur' ? ', honoraires de l’Agence compris' : ''}.`, true),
      ...(a.charge === 'acquereur' && a.net ? [P(`Soit un prix net revenant au MANDANT de ${euros(a.net)}.`)] : []),
      P('Le prix ne peut être modifié que d’un commun accord, par avenant écrit signé des parties.'),
    ]
    : [P('Prix de présentation : à compléter.', true)];

  const hono: Bloc[] = [];
  const combien = a.forfait
    ? `un forfait de ${eurosLettres(a.forfait)} TTC`
    : a.taux !== null
      ? `${pourcent(a.taux)} TTC du ${a.charge === 'acquereur' ? 'prix net vendeur' : 'prix de vente'}${a.honoraires ? `, soit ${euros(a.honoraires)} TTC au prix de présentation` : ''}`
      : 'à préciser';
  hono.push(P(`Honoraires de l’Agence : ${combien}, à la charge ${a.charge === 'acquereur' ? 'de l’acquéreur' : 'du MANDANT'}.`, true));
  if (a.charge === 'acquereur') {
    hono.push(P('Ils sont compris dans le prix de présentation, et indiqués dans toute annonce. Si la vente se fait à un autre prix, ils sont calculés de la même façon sur le prix obtenu.'));
  } else {
    hono.push(P('Ils seront réglés par le MANDANT, par l’intermédiaire du notaire, sur le prix de vente. Si la vente se fait à un autre prix, ils sont calculés de la même façon sur le prix obtenu.'));
  }
  if (type === 'semi') {
    hono.push(P(d.semiDirect === 'reduits' && num(d, 'semiMontant')
      ? `Si le MANDANT vend lui-même, à un acquéreur qui ne lui a été présenté par aucun intermédiaire, les honoraires sont ramenés à ${euros(num(d, 'semiMontant') || 0)} TTC.`
      : 'Si le MANDANT vend lui-même, à un acquéreur qui ne lui a été présenté par aucun intermédiaire, aucun honoraire n’est dû.'));
  }
  hono.push(P('Aucune somme n’est due, ni ne peut être versée à l’Agence, avant la signature de l’acte authentique (l’article 6 de la loi du 2 janvier 1970 interdit tout versement avant que l’opération soit effectivement conclue). Les honoraires sont alors réglés par l’intermédiaire du notaire.'));

  /* ── La durée ── */
  const dur: Bloc[] = [];
  if (d.dureeMode === 'prorogation') {
    dur.push(P(`Le mandat prend effet à sa signature pour une durée de ${nbLettres(duree)} mois. À ce terme, il se poursuit par périodes de ${nbLettres(periode)} mois, dans la limite de ${nbLettres(dureeMax)} mois au total, sauf si l’une des parties y met fin. Chaque partie peut s’opposer à cette poursuite par écrit (lettre ou e-mail), au plus tard la veille de l’échéance ; le mandat prend alors fin à l’échéance.`));
    dur.push(P('Avant chaque échéance, au plus tôt trois mois et au plus tard un mois avant, l’Agence rappelle par écrit au MANDANT qu’il peut ne pas poursuivre le mandat (article L215-1 du Code de la consommation, reproduit en annexe avec les articles L215-1-1 à L215-3 et L241-3).'));
  } else {
    dur.push(P(`Le mandat prend effet à sa signature et dure ${nbLettres(duree)} mois. Il prend fin de plein droit à son terme, sans reconduction.`));
  }
  dur.push(P('Passé un délai de trois mois à compter de sa signature, chaque partie peut y mettre fin à tout moment, par lettre recommandée avec avis de réception, avec un préavis de quinze jours (article 78 du décret du 20 juillet 1972).', type !== 'simple'));

  /* ── Les engagements de l'Agence ── */
  const acts = ACTIONS.filter(x => actions.includes(x.v));
  const rythme = RYTHMES[String(d.rythme)] || RYTHMES.semaine;
  const engA: Bloc[] = [
    P('Le MANDATAIRE s’engage à :'),
    { t: 'etapes', items: [
      ...acts.map(x => ({ titre: x.titre, x: x.x })),
      { titre: 'Rendre compte', x: `Informer le MANDANT de chaque visite et de ses suites, et lui adresser un compte rendu écrit de ses actions ${rythme}.` },
    ] },
  ];

  /* ── Les engagements du mandant ── */
  const engM: Bloc[] = [
    P(`Le MANDANT déclare ${plusieurs ? 'être les seuls propriétaires' : 'être seul propriétaire'} du bien et avoir la capacité d’en disposer. Il signale à l’Agence tout droit ou restriction qui pèserait sur le bien (droit de préemption, servitude, hypothèque, procédure en cours).`),
    P(`Il fournit les documents nécessaires à la vente — titre de propriété${estCopro(d) ? ', documents de copropriété' : ''} — et permet les visites aux heures convenues. Il fait établir à ses frais le dossier de diagnostic technique (article L271-4 du Code de la construction et de l’habitation), que l’Agence tient à la disposition des acquéreurs dès les premières visites.`),
    P('Si le bien est soumis à un droit de préemption (de la commune notamment), la vente ne devient définitive qu’après que ce droit a été purgé ; le notaire s’en charge.'),
    P('Il s’interdit de demander à l’Agence d’écarter un acquéreur pour l’un des motifs de discrimination interdits par l’article 225-1 du Code pénal : l’Agence présente le bien à tous, sans distinction.'),
  ];
  if (type === 'exclusif') {
    engM.push(P(MAJ('Il renvoie à l’Agence toute personne qui le contacterait en vue d’acheter le bien, et lui transmet toute proposition reçue.'), true));
  } else if (type === 'semi') {
    engM.push(P(MAJ('Il ne confie la vente à aucun autre intermédiaire pendant la durée du mandat.'), true));
    engM.push(P('S’il vend lui-même, il en informe aussitôt l’Agence par écrit, en indiquant le nom de l’acquéreur, le prix et le notaire chargé de la vente.'));
  } else {
    engM.push(P('S’il vend le bien lui-même ou par un autre intermédiaire, il en informe aussitôt l’Agence par écrit, en indiquant le nom de l’acquéreur, le prix et le notaire chargé de la vente, pour éviter toute double négociation.'));
    if (vrai(d, 'memePrix')) engM.push(P('Il s’engage à proposer le bien au même prix dans toutes les agences auxquelles il en confie la vente.'));
  }
  engM.push(P(MAJ(`Pendant le mandat et les ${nbLettres(suite)} mois qui suivent sa fin, le MANDANT s’interdit de vendre, directement ou par un autre intermédiaire, à un acquéreur que l’Agence lui a présenté ou qui a visité le bien avec elle. S’il le fait, il doit à l’Agence, à titre de clause pénale, une indemnité forfaitaire égale aux honoraires prévus au présent mandat.`), true));

  /* ── Les pouvoirs ── */
  const pvs: string[] = [
    'rechercher des acquéreurs, présenter et faire visiter le bien ;',
    'faire toute publicité utile, avec les photographies et la description du bien ;',
    ...(pouvoirs.includes('syndic') ? ['demander au syndic de copropriété les documents nécessaires à la vente ;'] : []),
    ...(pouvoirs.includes('cles') ? ['détenir les clés du bien pour les visites, contre récépissé ;'] : []),
    ...(pouvoirs.includes('delegation') ? [`déléguer tout ou partie de sa mission à un autre professionnel titulaire de la carte « Transactions sur immeubles et fonds de commerce », pour vendre le bien dans les meilleures conditions, sans frais supplémentaires pour le MANDANT ; l’Agence reste responsable envers lui de la personne qu’elle se substitue (article 1994 du Code civil) et l’informe de toute délégation ;`] : []),
    'transmettre au MANDANT les offres reçues et l’accompagner dans la négociation.',
  ];
  const pouvoirsBlocs: Bloc[] = [
    P('Le MANDANT donne au MANDATAIRE le pouvoir de :'),
    { t: 'l', items: pvs },
    P('L’Agence ne peut pas engager le MANDANT : la vente ne sera conclue qu’avec son accord, sur un avant-contrat qu’il signera lui-même.'),
  ];

  /* ── La partie 1 ── */
  const sections: Partie['sections'] = [
    { titre: 'Entre les soussignés', blocs: entre },
    { titre: 'Il a été convenu ce qui suit', blocs: objet },
    { titre: 'Le bien', ic: 'maison', blocs: bien },
    { titre: 'Prix', ic: 'etiquette', blocs: prix },
    { titre: 'Honoraires', ic: 'euro', blocs: hono },
    { titre: 'Durée', ic: 'calendrier', blocs: dur },
    { titre: 'Engagements de l’Agence', ic: 'etoile', blocs: engA },
    { titre: 'Engagements du mandant', ic: 'personne', blocs: engM },
    { titre: 'Pouvoirs', ic: 'doc', blocs: pouvoirsBlocs },
  ];
  if (type !== 'simple' && vrai(d, 'penale')) {
    const montant = a.honoraires || a.forfait;
    sections.push({ titre: 'Clause pénale', ic: 'balance', blocs: [
      P(`EN CAS DE MANQUEMENT DU MANDANT À ${type === 'exclusif' ? 'L’EXCLUSIVITÉ' : 'SON ENGAGEMENT DE NE CONFIER LA VENTE À AUCUN AUTRE INTERMÉDIAIRE'} OU À L’INTERDICTION DE VENDRE EN DIRECT À UN ACQUÉREUR PRÉSENTÉ PAR L’AGENCE, IL LUI DEVRA, À TITRE DE CLAUSE PÉNALE, UNE INDEMNITÉ FORFAITAIRE ÉGALE AU MONTANT DES HONORAIRES PRÉVUS${montant ? `, SOIT ${euros(montant).toUpperCase()} TTC` : ''}.`, true),
      Pp('Cette indemnité ne se cumule pas avec celle prévue aux engagements du mandant pour un acquéreur présenté par l’Agence. Le juge peut la modérer ou l’augmenter si elle est manifestement excessive ou dérisoire (article 1231-5 du Code civil).'),
    ] });
  }
  if (retr) {
    const ex = d.execution === 'oui' ? true : d.execution === 'non' ? false : null;
    sections.push({ titre: 'Droit de rétractation', ic: 'retour', blocs: [
      P(`Le mandat étant signé ${lieuDe(d) === 'distance' ? 'à distance' : 'hors des locaux de l’Agence'}, le MANDANT peut se rétracter sans avoir à se justifier pendant ${nbLettres(14)} jours à compter du lendemain de sa signature (délai prolongé jusqu’au premier jour ouvrable s’il finit un samedi, un dimanche ou un jour férié), par une déclaration écrite dénuée d’ambiguïté — lettre, e-mail, ou le formulaire joint — adressée à l’Agence, ${A.adresse}, ${A.cp} ${A.ville}, ${A.mail}.`, true),
      P('L’Agence ne commence sa mission qu’à la fin de ce délai, sauf demande expresse du MANDANT. S’il demande qu’elle commence plus tôt, il garde son droit de rétractation tant que la mission n’est pas entièrement exécutée ; aucun honoraire n’est dû s’il se rétracte avant la vente.'),
      { t: 'case', coche: ex === true, x: 'Le MANDANT DEMANDE que la mission commence dès la signature, sans attendre la fin du délai de rétractation.' },
      { t: 'case', coche: ex === false, x: 'Le MANDANT préfère que la mission commence à la fin du délai de rétractation.' },
    ] });
  }
  sections.push({ titre: 'Informations', ic: 'info', blocs: [
    ...(numero ? [P(`Le présent mandat est inscrit sous le numéro ${numero} au registre des mandats de l’Agence.`)] : [P('Numéro au registre des mandats : ……………')]),
    ...(d.infoJointe === 'aucune'
      ? (retr ? [P('Le MANDANT reconnaît avoir reçu, avant de signer, le formulaire de rétractation, qui forme la suite du présent document.')] : [])
      : [P(`Le MANDANT reconnaît avoir reçu, avant de signer, l’information précontractuelle prévue par le Code de la consommation${retr ? ' et le formulaire de rétractation' : ''}${vrai(d, 'infoJointe') ? ', qui forme' + (retr ? 'nt' : '') + ' la suite du présent document' : ''}.`)]),
    ...blocsInformations(A, 'le MANDANT', {
      lcbft: 'Le MANDANT s’engage à lui fournir les justificatifs demandés à ce titre.',
      textes: [
        'loi n° 70-9 du 2 janvier 1970 (dite loi Hoguet, art. 6 et 7) et décret n° 72-678 du 20 juillet 1972 (art. 72 et 78)',
        `Code de la consommation (art. L111-1${d.dureeMode === 'prorogation' ? ', L215-1 à L215-3' : ''}${retr ? ', L221-5, L221-18 et suivants' : ''}, L612-1)`,
        ...(type !== 'simple' && vrai(d, 'penale') ? ['Code civil (art. 1231-5)'] : []),
      ].join(' ; '),
    }),
  ] });
  if (txt(d, 'clause')) sections.push({ titre: 'Clause particulière', ic: 'plume', blocs: [P(txt(d, 'clause'))] });
  const nbEx = (d.qui === 'sci' ? 1 : vs.length) + 1 + (aConjoint(d) ? 1 : 0);
  sections.push({ titre: 'Date et signatures', ic: 'plume', blocs: blocsSignature(d, {
    papier: `Fait à ${txt(d, 'faitA') || '……………'}, le ${txt(d, 'date') ? jourLong(txt(d, 'date')) : '……………'}, en ${nbLettres(nbEx)} exemplaires originaux, dont un remis à chaque partie.`,
    mention: 'Chaque signataire date et signe, précédé de la mention manuscrite « Lu et approuvé, bon pour mandat ».',
    cases: casesVente(d, A),
  }) });

  const parties: Partie[] = [{
    titre: `Mandat de vente ${T.nom}${numero ? ` n° ${numero}` : ''}`,
    court: 'Le mandat de vente',
    sous: type === 'simple' ? 'Mandat simple, non exclusif' : type === 'semi' ? 'Mandat semi-exclusif' : 'Mandat exclusif',
    ic: 'doc',
    sections,
  }];
  if (d.dureeMode === 'prorogation') parties.push(annexeL215());
  if (vrai(d, 'infoJointe')) parties.push(infoPrecontractuelle(d, A));
  if (retr) parties.push(formulaireRetractation(d, A));
  return parties;
}

/* ── L'information précontractuelle (L111-1 et L221-5 du Code de la
   consommation) : ce qu'il faut savoir avant de signer, en fiches. ── */
export function infoPrecontractuelle(d: Donnees, A: IdentiteAgence): Partie {
  const type = typeDe(d);
  const a = argent(d);
  const retr = retractation(d);
  const duree = num(d, 'duree') ?? 3;
  const combien = a.forfait
    ? `Un forfait de ${euros(a.forfait)} TTC`
    : a.taux !== null ? `${pourcent(a.taux)} TTC du ${a.charge === 'acquereur' ? 'prix net vendeur' : 'prix de vente'}${a.honoraires ? ` (${euros(a.honoraires)} TTC au prix de présentation)` : ''}` : 'À préciser';
  return {
    titre: 'Information précontractuelle',
    court: 'Information précontractuelle',
    sous: 'Ce qu’il faut savoir avant de signer',
    ic: 'info',
    sections: [{ blocs: [
      { t: 'fiches', items: [
        { ic: 'agence', titre: 'Qui nous sommes', lignes: [
          `${A.nom} — ${A.societe}, ${A.forme}, ${A.rcs}${A.tva ? `, TVA ${A.tva}` : ''}.`,
          `${A.adresse}, ${A.cp} ${A.ville} · ${A.tel} · ${A.mail}`,
          `Carte professionnelle « ${A.carteMention} » n° ${A.carte}, délivrée par ${A.carteDelivree}.`,
          `Assurance de responsabilité civile professionnelle : ${A.assureur}, police n° ${A.police}.`,
        ], note: phraseFonds(A) },
        { ic: 'loupe', titre: 'Le service proposé', lignes: [
          'Rechercher un acquéreur pour votre bien et en négocier la vente : estimation, présentation et publicité, visites accompagnées, transmission des offres, suivi jusqu’à l’acte chez le notaire.',
          type === 'exclusif' ? 'Mandat exclusif : l’Agence est seule chargée de la vente pendant la durée du mandat.'
            : type === 'semi' ? 'Mandat semi-exclusif : aucune autre agence, mais vous restez libre de vendre vous-même.'
              : 'Mandat simple : vous restez libre de vendre vous-même ou par d’autres agences.',
        ] },
        { ic: 'euro', titre: 'Le prix du service', lignes: [
          `${combien}, à la charge ${a.charge === 'acquereur' ? 'de l’acquéreur' : 'du vendeur'}.`,
          'Dus uniquement si la vente est conclue et signée chez le notaire : rien n’est versé avant.',
          'Si vous vendez sans l’Agence à un acquéreur qu’elle vous a présenté, pendant le mandat et les mois qui suivent, une indemnité égale à ces honoraires est due.',
          `Barème de l’Agence : jusqu’à ${pourcent(BAREME_VENTE)} TTC du prix, affiché à l’Agence et sur son site.`,
        ] },
        { ic: 'calendrier', titre: 'La durée', lignes: [
          d.dureeMode === 'prorogation'
            ? `${duree} mois, puis par périodes de ${num(d, 'periode') ?? 3} mois, dans la limite de ${num(d, 'dureeMax') ?? 12} mois.`
            : `${duree} mois, sans reconduction.`,
          'Après trois mois, chacun peut y mettre fin avec quinze jours de préavis, par lettre recommandée.',
        ] },
        { ic: 'retour', titre: 'Votre droit de rétractation', lignes: retr
          ? ['Signé hors de l’Agence ou à distance, le mandat vous permet de vous rétracter sans motif pendant 14 jours, avec le formulaire joint ou par tout écrit clair.',
            'Vous pouvez demander que la mission commence avant la fin de ce délai.']
          : ['Signé dans les locaux de l’Agence, le mandat n’ouvre pas de droit de rétractation.'] },
        { ic: 'balance', titre: 'En cas de litige', lignes: [
          'Écrivez d’abord à l’Agence. Sans réponse satisfaisante sous 30 jours, vous pouvez saisir gratuitement le médiateur de la consommation :',
          `${A.mediateurNom}, ${A.mediateurAdresse}, ${A.mediateurSite}.`,
        ] },
      ] },
    ] }],
  };
}

export function formulaireRetractation(d: Donnees, A: IdentiteAgence): Partie {
  const vs = vendeursDe(d);
  return {
    titre: 'Formulaire de rétractation',
    court: 'Formulaire de rétractation',
    sous: 'À renvoyer uniquement si vous souhaitez vous rétracter',
    ic: 'retour',
    sections: [{ blocs: [
      P(`À l’attention de : ${A.nom.toUpperCase()}, ${A.adresse}, ${A.cp} ${A.ville} — ${A.mail}`, true),
      { t: 'l', items: [
        `Je vous notifie par la présente ma rétractation du contrat portant sur la prestation de service ci-dessous : mandat de vente${txt(d, 'numero') ? ` n° ${txt(d, 'numero')}` : ''}, pour le bien situé ${[txt(d, 'adresse'), txt(d, 'cp'), txt(d, 'ville')].filter(Boolean).join(' ') || '………………'}.`,
        `Conclu le : ${electronique(d) ? '……………… (la date de la dernière signature, sur le certificat joint)' : txt(d, 'date') ? jourLong(txt(d, 'date')) : '………………'}`,
        `Nom du ou des consommateurs : ${vs.map(nomComplet).join(', ')}`,
        `Adresse : ${vs[0]?.adresse || '………………'}`,
        'Signature (uniquement si ce formulaire est envoyé sur papier) :',
        'Date :',
      ] },
    ] }],
  };
}

/* ── Le résumé de la page de garde ── */
function resume(d: Donnees): Resume {
  const a = argent(d);
  const duree = num(d, 'duree') ?? 3;
  return [
    { titre: 'Le bien', valeur: txt(d, 'adresse') || 'À compléter', detail: couper([txt(d, 'ville'), txt(d, 'description')].filter(Boolean).join(' · '), 110) || '—' },
    { titre: 'Prix de présentation', valeur: a.prix ? euros(a.prix) : 'À compléter',
      detail: a.prix && a.net && a.charge === 'acquereur' ? `honoraires compris · ${euros(a.net)} net vendeur` : a.charge === 'vendeur' ? 'honoraires à la charge du vendeur' : '—' },
    { titre: 'Honoraires', valeur: a.forfait ? `${euros(a.forfait)} TTC` : a.taux !== null ? `${pourcent(a.taux)} TTC` : 'À compléter',
      detail: `à la charge ${a.charge === 'acquereur' ? 'de l’acquéreur' : 'du vendeur'} · dus à l’acte seulement` },
    { titre: 'Durée', valeur: `${duree} mois`, detail: d.dureeMode === 'prorogation' ? `puis par périodes, ${num(d, 'dureeMax') ?? 12} mois au plus` : 'sans reconduction · fin possible après 3 mois' },
  ];
}

/* Les repères de l'éditeur : le calcul des honoraires sous les yeux, et
   ce qui mérite un second regard. */
function reperes(d: Donnees, etape: string): Repere[] {
  const out: Repere[] = [];
  if (etape === 'prix') {
    const a = argent(d);
    if (a.prix) out.push({ l: 'Prix de présentation', v: euros(a.prix) });
    if (a.honoraires !== null && a.prix) out.push({ l: a.forfait ? 'Honoraires (forfait)' : `Honoraires (${pourcent(a.taux || 0)} TTC)`, v: euros(a.honoraires) });
    if (a.net !== null && a.prix) out.push({ l: 'Net vendeur', v: euros(a.net), ton: 'ok' });
    if (!a.forfait && a.taux !== null && a.taux > BAREME_VENTE) out.push({ l: 'Au-dessus de ton barème', v: `Ton barème affiché est de ${pourcent(BAREME_VENTE)} TTC au plus : un taux supérieur ne peut pas être appliqué.`, ton: 'alerte' });
    if (a.forfait && a.prix && a.forfait > (a.prix * BAREME_VENTE) / 100) out.push({ l: 'Au-dessus de ton barème', v: `Ce forfait dépasse ${pourcent(BAREME_VENTE)} du prix.`, ton: 'alerte' });
  }
  /* V3.18 : chaque repère suit la question qu'il commente dans ses étapes. */
  if (etape === 'mandat') {
    const duree = num(d, 'duree');
    if (duree !== null && d.dureeMode === 'prorogation' && (num(d, 'dureeMax') ?? 12) < duree) out.push({ l: 'Durée', v: 'La limite totale est plus courte que la première période.', ton: 'alerte' });
  }
  if (etape === 'signature' && !txt(d, 'numero')) out.push({ l: 'Registre des mandats', v: 'Réserve le numéro avant de faire signer : il doit figurer sur le mandat.', ton: 'alerte' });
  if (etape === 'bien') {
    if ((d.nature === 'maison' || d.nature === 'terrain') && !txt(d, 'cadastre')) out.push({ l: 'Conseil', v: 'Pour une maison ou un terrain, les références cadastrales identifient le bien sans ambiguïté.', ton: 'alerte' });
  }
  if (etape === 'copro') {
    if (estCopro(d) && !lignes(d, 'lots').length) out.push({ l: 'Copropriété', v: 'Indique au moins le lot principal : c’est lui que l’acte vendra.', ton: 'alerte' });
    if (estCopro(d) && !num(d, 'carrez')) out.push({ l: 'Loi Carrez', v: 'La surface Carrez sera obligatoire dans l’avant-contrat : autant la demander dès maintenant.' });
  }
  if (etape === 'engagements' && typeDe(d) === 'exclusif' && !liste(d, 'actions').length) {
    out.push({ l: 'Mandat exclusif', v: 'La loi impose de dire ce que tu feras pour vendre : coche au moins une action.', ton: 'alerte' });
  }
  return out;
}

/* Signé et poursuivi par périodes : avant chaque échéance où il se
   prolonge, le vendeur doit être prévenu par écrit, au plus tôt trois mois
   et au plus tard un mois avant (article L215-1 du Code de la consommation).
   La dernière échéance, celle de la limite totale, n'en demande pas : le
   mandat s'arrête. */
export function echeances(d: Donnees, signeLe: string): Echeance[] {
  const jour = String(signeLe || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return [];
  const duree = num(d, 'duree') ?? 3;
  const out: Echeance[] = [];
  if (d.dureeMode !== 'prorogation') {
    out.push({ le: plusMois(jour, duree), quoi: 'Fin du mandat' });
    return out;
  }
  const periode = Math.max(1, num(d, 'periode') ?? 3), max = num(d, 'dureeMax') ?? 12;
  for (let t = duree; t < max && out.length < 24; t += periode) {
    /* La fenêtre se compte depuis la date limite de refus (la veille de
       l'échéance) : au plus tard un mois avant elle. */
    const limite = veille(plusMois(jour, t));
    out.push({ le: plusMois(jour, t), quoi: 'Le mandat se prolonge', du: plusMois(limite, -3), au: plusMois(limite, -1) });
  }
  out.push({ le: plusMois(jour, max), quoi: 'Fin du mandat (limite totale)' });
  return out;
}

/* Les cadres de signature : chaque vendeur (ou celui qui représente
   l'autre, ou le gérant pour la société), le conjoint qui donne son
   accord, puis l'agence. */
export function casesVente(d: Donnees, A?: IdentiteAgence): CaseSignature[] {
  const vs = vendeursDe(d);
  const repr = d.qui === 'couple' && (d.represente === '0' || d.represente === '1') ? Number(d.represente) : -1;
  const out: CaseSignature[] = d.qui === 'sci'
    ? [{ cle: 'sci', qui: 'Le mandant', nom: txt(d, 'sciNom') || 'La société', lignes: [`Représentée par ${nomComplet(vs[0])}`], personne: vs[0] }]
    : vs.map((p, i): CaseSignature => ({ cle: `v${i}`, qui: 'Le mandant', nom: nomComplet(p), lignes: [] as string[], personne: p }))
      .filter((_, i) => repr < 0 || i === repr)
      .map(c => (repr >= 0 ? { ...c, lignes: [`En son nom et pour ${nomComplet(vs[1 - repr])}, par procuration`] } : c));
  if (aConjoint(d)) out.push({ cle: 'conjoint', qui: 'Le conjoint', nom: txt(d, 'conjoint') || '……………', lignes: ['Pour accord (article 215 du Code civil)'], personne: { ...PERSONNE_VIDE, nom: txt(d, 'conjoint') } });
  if (A) out.push({ cle: 'agence', qui: 'Le mandataire', nom: A.nom.toUpperCase(), lignes: [`Représentée par ${A.signataireNom}, ${A.signataireQualite}`], agence: true });
  return out;
}

function manques(d: Donnees): string[] {
  const out: string[] = [];
  const vs = vendeursDe(d);
  vs.forEach((p, i) => {
    const qui = vs.length > 1 ? `le vendeur ${i + 1}` : d.qui === 'sci' ? 'le gérant' : 'le vendeur';
    if (!p.nom || !p.prenom) out.push(`Le nom de ${qui}`);
    else if (d.qui !== 'sci' && (!p.naissanceDate || !p.naissanceLieu)) out.push(`La date et le lieu de naissance de ${nomComplet(p)}`);
    else if (d.qui !== 'sci' && !p.adresse) out.push(`L’adresse de ${nomComplet(p)}`);
  });
  if (d.qui === 'sci' && (!txt(d, 'sciNom') || !txt(d, 'sciSiege'))) out.push('Le nom et le siège de la société');
  if (d.qui === 'couple' && d.lien === 'maries' && !d.regime) out.push('Le régime matrimonial');
  if (d.qui === 'personne' && !d.situation) out.push('La situation du vendeur (célibataire, marié…)');
  if (aConjoint(d) && !txt(d, 'conjoint')) out.push('Le nom du conjoint qui donne son accord (logement de la famille)');
  if (!txt(d, 'adresse') || !txt(d, 'ville')) out.push('L’adresse du bien');
  if (!txt(d, 'description')) out.push('La description du bien');
  if (!num(d, 'prix')) out.push('Le prix de présentation');
  if (d.honoMode === 'forfait' ? !num(d, 'forfait') : num(d, 'taux') === null) out.push('Les honoraires');
  if (!num(d, 'duree')) out.push('La durée');
  if (d.dureeMode === 'prorogation' && (num(d, 'dureeMax') ?? 12) < (num(d, 'duree') ?? 0)) out.push('Une limite totale au moins égale à la première durée');
  const suite = num(d, 'suite');
  if (suite === null || suite < 1 || suite > 12) out.push('La durée d’interdiction de vendre en direct après le mandat : de 1 à 12 mois');
  if (!txt(d, 'numero')) out.push('Le numéro du registre des mandats');
  if (!txt(d, 'faitA') || !txt(d, 'date')) out.push('Le lieu et la date de signature');
  if (typeDe(d) === 'exclusif' && !liste(d, 'actions').length) out.push('Les actions promises (obligatoires pour un mandat exclusif)');
  if (electronique(d) && retractation(d) && d.execution !== 'oui' && d.execution !== 'non') out.push(MANQUE_EXECUTION);
  out.push(...manquesSignature(d, casesVente(d)));
  return out;
}

function defaut(c: Contexte): Donnees {
  const cl = c.client;
  const p: Personne = { ...PERSONNE_VIDE, prenom: cl?.prenom || '', nom: cl?.nom || '', adresse: cl?.adresse || '', email: cl?.emails?.[0] || '', telephone: cl?.telephones?.[0] || '' };
  const b = c.bien;
  return {
    qui: 'personne', situation: '', logementFamille: 'oui', conjoint: '', lien: 'maries', regime: 'communaute', represente: 'non', fiscal: 'oui', notaire: '',
    vendeurs: [p],
    nature: b?.type_bien && /maison/i.test(b.type_bien) ? 'maison' : 'appartement',
    adresse: b?.adresse || '', cp: b?.code_postal || '', ville: b?.ville || '',
    description: '', copro: b?.type_bien && /maison/i.test(b.type_bien) ? 'non' : 'oui', occupation: 'libre', lots: [], tantiemesBase: '1000',
    surfaceHab: b?.type_bien && /maison/i.test(b.type_bien) && b.surface ? b.surface : null,
    type: 'exclusif', prix: b?.prix_acquereur || null, charge: 'acquereur', honoMode: 'taux', taux: BAREME_VENTE,
    semiDirect: 'aucun',
    duree: 3, dureeMode: 'prorogation', periode: 3, dureeMax: 12,
    signature: 'papier', lieu: 'agence', execution: '', numero: '', faitA: c.identite.ville, date: aujourdhui(),
    actions: ACTIONS_DEFAUT, rythme: 'semaine', pouvoirs: ['syndic', 'delegation'], suite: 12, memePrix: 'non', penale: 'non', infoJointe: 'oui',
  };
}

export const MANDAT_VENTE: Modele = {
  id: 'mandat_vente',
  categorie: 'mandats_vente',
  titre: 'Mandat de vente',
  description: 'Simple, semi-exclusif ou exclusif, avec l’information précontractuelle et, hors de l’agence, le formulaire de rétractation.',
  ic: 'maison',
  signataires: 'Le ou les vendeurs, puis l’agence',
  etapes: ETAPES,
  defaut,
  titreDoc: d => `Mandat ${TYPES[typeDe(d)].nom} · ${d.qui === 'sci' ? txt(d, 'sciNom') || 'SCI' : nomsCourts(vendeursDe(d))}`,
  sousTitre: d => [txt(d, 'adresse'), txt(d, 'ville')].filter(Boolean).join(', '),
  pour: d => (d.qui === 'sci' ? txt(d, 'sciNom') || 'La société' : nomsCourts(vendeursDe(d))),
  rediger,
  resume,
  garde: d => {
    const t = typeDe(d);
    return {
      titre: 'Mandat de vente',
      sous: t === 'simple' ? 'simple, d’un bien à vendre' : t === 'semi' ? 'semi-exclusif, d’un bien à vendre' : 'exclusif, d’un bien à vendre',
      etiquette: `MANDAT ${TYPES[t].maj}${txt(d, 'numero') ? ` · N° ${txt(d, 'numero')}` : ''}`,
      pour: 'ÉTABLI POUR',
      ics: ['maison', 'etiquette', 'euro', 'calendrier'],
    };
  },
  entete: d => `Mandat de vente ${TYPES[typeDe(d)].nom}${txt(d, 'numero') ? ` n° ${txt(d, 'numero')}` : ''}`,
  manques,
  numero: true,
  registre: registreVente,
  badge: d => TYPES[typeDe(d)].court,
  reperes,
  echeances,
  cases: casesVente,
  /* Le conjoint ne devient pas mandant : il donne son accord (article 215). */
  accepter: (d, cle) => (cle === 'conjoint'
    ? 'J’ai lu le mandat en entier et, le bien étant le logement de la famille, je donne mon accord à sa signature (article 215 du Code civil).'
    : 'J’ai lu le mandat en entier, y compris les clauses écrites en capitales, et je l’accepte : bon pour mandat.'),
};
