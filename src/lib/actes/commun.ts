/* ═══ Documents juridiques : ce que tous les modèles partagent ═════════════
   Un document = un modèle (mandat de vente, bon de visite, offre d'achat…)
   + ses réponses (`donnees`, un objet plat enregistré dans la table
   `documents`). Chaque modèle sait :
     · poser ses questions, en étapes (les champs ci-dessous) ;
     · rédiger son texte (des Partie, les mêmes que le mandat de recherche :
       l'écran et le PDF les dessinent de la même façon) ;
     · dire ce qui manque avant de le finaliser.

   Les textes sont écrits pour Emilio, à partir de la loi (loi Hoguet,
   décret du 20 juillet 1972, Code de la consommation, Code civil) : rien
   n'est repris d'un éditeur de formulaires. ⚠️ Ils doivent être relus par
   l'avocat d'Alexandre avant le premier usage avec un vrai client.

   Isomorphe : lu par le CRM (écran, PDF dans le navigateur). */

import {
  euros, enLettres, jourFr, type Partie, type Bloc, type Fiche, type Icone, type Resume,
} from '@/lib/mandat';
import { IDENTITE_DEFAUT, type IdentiteAgence } from '@/lib/agence';

export type Donnees = Record<string, unknown>;

/* ── Une personne (vendeur, acquéreur, visiteur) ── */
export type Personne = {
  civilite: 'Madame' | 'Monsieur' | '';
  prenom: string; nom: string; nomNaissance: string;
  naissanceDate: string; naissanceLieu: string;
  adresse: string; email: string; telephone: string;
};
export const PERSONNE_VIDE: Personne = {
  civilite: '', prenom: '', nom: '', nomNaissance: '', naissanceDate: '', naissanceLieu: '', adresse: '', email: '', telephone: '',
};
export function lirePersonne(x: unknown): Personne {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const s = (v: unknown, max = 200) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  return {
    civilite: o.civilite === 'Madame' || o.civilite === 'Monsieur' ? o.civilite : '',
    prenom: s(o.prenom, 60), nom: s(o.nom, 80), nomNaissance: s(o.nomNaissance, 80),
    naissanceDate: s(o.naissanceDate, 10), naissanceLieu: s(o.naissanceLieu, 80),
    adresse: s(o.adresse), email: s(o.email, 120).toLowerCase(), telephone: s(o.telephone, 30),
  };
}
export function lirePersonnes(x: unknown): Personne[] {
  return Array.isArray(x) ? x.map(lirePersonne) : [];
}
/* « Madame Claire MARTIN » */
export function nomComplet(p: Personne): string {
  const n = [p.prenom, p.nom.toUpperCase()].filter(Boolean).join(' ');
  return [p.civilite, n].filter(Boolean).join(' ') || '…';
}
/* « Claire Martin », pour les listes et les en-têtes. */
export function nomCourt(p: Personne): string {
  const cap = (t: string) => t.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, m => m.toUpperCase());
  return [p.prenom, cap(p.nom)].filter(Boolean).join(' ') || '…';
}
/* « M. et Mme Martin », « Mme Laurent », « Indivision Roux ». */
export function nomsCourts(l: Personne[]): string {
  const ps = l.filter(p => p.nom || p.prenom);
  if (!ps.length) return '…';
  const cap = (t: string) => t.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, m => m.toUpperCase());
  const abr = (p: Personne) => (p.civilite === 'Madame' ? 'Mme' : p.civilite === 'Monsieur' ? 'M.' : p.prenom);
  if (ps.length === 2 && ps[0].nom && ps[0].nom.toLowerCase() === ps[1].nom.toLowerCase()) {
    const [a, b] = ps[0].civilite === 'Madame' && ps[1].civilite === 'Monsieur' ? [ps[1], ps[0]] : [ps[0], ps[1]];
    return `${abr(a)} et ${abr(b)} ${cap(a.nom)}`;
  }
  if (ps.length > 2) return `${ps.length} propriétaires`;
  return ps.map(p => `${abr(p)} ${cap(p.nom)}`.trim()).join(' et ');
}
/* Les lignes d'une fiche : naissance, adresse, contact. */
export function lignesPersonne(p: Personne): string[] {
  const nee = p.civilite === 'Madame' ? 'Née' : p.civilite === 'Monsieur' ? 'Né' : 'Né(e)';
  const naissance = p.naissanceDate
    ? `${nee}${p.nomNaissance && p.nomNaissance.toLowerCase() !== p.nom.toLowerCase() ? ` ${p.nomNaissance.toUpperCase()}` : ''} le ${jourFr(p.naissanceDate)}${p.naissanceLieu ? ` à ${p.naissanceLieu}` : ''}`
    : '';
  return [
    naissance,
    p.adresse ? `Demeurant ${p.adresse}` : '',
    [p.telephone, p.email].filter(Boolean).join(' · '),
  ].filter(Boolean);
}
/* « Monsieur Paul MARTIN, 3 rue de la Paix, 75002 Paris » : une personne
   telle que le registre des mandats l'inscrit (V3.18). */
export function personneRegistre(p: Personne): string {
  return [nomComplet(p), p.adresse.trim()].filter(Boolean).join(', ');
}

export function fichePersonne(p: Personne, ic: Icone = 'personne', pied?: string): Fiche {
  const l = lignesPersonne(p);
  return { ic, titre: nomComplet(p), lignes: l.length ? l : ['Identité, naissance, adresse : à compléter.'], ...(pied ? { pied } : {}) };
}

/* ── Les champs d'une étape ─────────────────────────────────────────────
   L'éditeur les dessine ; `si` les montre ou les cache selon les réponses
   déjà données ; `requis` les fait figurer dans « ce qui manque ». */
/* `ic` : le pictogramme affiché à l'écran (voir components/documents/pictos.ts
   et ICONES) ; il ne s'imprime jamais. */
export type Option = { v: string; l: string; aide?: string; ic?: string };
type Base = { cle: string; lib: string; aide?: string; exemple?: string; large?: boolean; requis?: boolean; si?: (d: Donnees) => boolean; ic?: string };
export type Champ =
  | (Base & { t: 'texte' | 'zone' | 'date' | 'heure' })
  | (Base & { t: 'nombre' | 'euros'; unite?: string })
  | (Base & { t: 'choix'; options: Option[]; tuiles?: boolean })
  | (Base & { t: 'cases'; options: Option[] })
  /* `complet` : naissance et adresse demandées (un vendeur, un acquéreur ;
     pas le gérant d'une société). */
  | (Base & { t: 'personnes'; min: number; max: number; un: string; complet?: boolean | ((d: Donnees) => boolean);
      /* Le libellé du bouton d'ajout (« Ajouter un propriétaire »). */
      ajouter?: (d: Donnees) => string;
      /* Le nombre attendu selon les réponses (un couple : deux), et le nom
         d'une carte (« Le gérant » pour une société). */
      bornes?: (d: Donnees) => { min: number; max: number }; nomCarte?: (d: Donnees, i: number) => string })
  /* Une liste de lignes à colonnes, avec « + Ajouter » (les lots d'une
     copropriété). La valeur : un tableau d'objets { colonne: texte }. */
  | (Base & { t: 'lignes'; un: string; max: number;
      colonnes: { cle: string; lib: string; exemple?: string; nombre?: boolean; suffixe?: (d: Donnees) => string }[];
      /* Le pictogramme d'une ligne, d'après ce qu'on y a écrit (une cave, un parking…). */
      icone?: (ligne: Record<string, string>) => string })
  | { t: 'titre'; cle: string; lib: string; aide?: string; si?: (d: Donnees) => boolean; ic?: string }
  /* Un encadré « Ce qu'il te faut » qui change avec les réponses : ce qu'il
     faut remplir, les pièces à demander. Jamais imprimé. */
  | { t: 'guide'; cle: string; si?: (d: Donnees) => boolean; titre: (d: Donnees) => string; points: (d: Donnees) => { ic?: string; x: string }[] };
/* `vers` : la rubrique du document que l'aperçu montre pendant l'étape ;
   `reperesApres` : le champ après lequel l'éditeur place les repères. */
/* `court` : le libellé du fil des étapes, quand le titre est long (V3.18). */
export type Etape = { id: string; titre: string; court?: string; sous: string; champs: Champ[]; vers?: string; reperesApres?: string; ic?: string };

/* Les réponses qui reviennent partout, avec leur dessin (V3.18). */
export const ouiNon = (oui = 'Oui', non = 'Non'): Option[] => [{ v: 'oui', l: oui, ic: 'check' }, { v: 'non', l: non, ic: 'croix' }];
export const IC_RYTHME: Record<string, string> = { visite: 'cle', semaine: 'chrono', quinzaine: 'calendrier', mois: 'lune' };
export const HONO_MODES: Option[] = [{ v: 'taux', l: 'Un pourcentage', ic: 'pourcent' }, { v: 'forfait', l: 'Un forfait', ic: 'euro' }];
export const TANTIEMES_BASES: Option[] = [
  { v: '1000', l: '1 000 (millièmes)', ic: 'lots' }, { v: '10000', l: '10 000', ic: 'lots' }, { v: '100000', l: '100 000', ic: 'lots' },
  /* Une copropriété au total moins rond (2 347, 9 856…) : « Sur combien ? »
     s'ouvre dessous (V3.38, champ `tantiemesTotal`). */
  { v: 'autre', l: 'Un autre total', ic: 'plume' },
];

/* Ce que le CRM connaît déjà au moment de créer un document. */
export type Contexte = {
  client?: { id: string; prenom?: string; nom?: string; adresse?: string | null; emails?: string[] | null; telephones?: string[] | null } | null;
  bien?: {
    id: string; titre?: string | null; adresse?: string | null; code_postal?: string | null; ville?: string | null; quartier?: string | null;
    type_bien?: string | null; surface?: number | null; nb_pieces?: number | null; etage?: number | null;
    prix_acquereur?: number | null; prix_vendeur?: number | null; agence_nom?: string | null; description?: string | null;
    /* V3.145 : ses honoraires et son vendeur (l'offre d'achat les reprend). */
    commission_type?: string | null; commission_val?: number | null; bien_vente_id?: string | null; est_particulier?: boolean | null;
  } | null;
  visite?: { date_visite?: string | null; heure?: string | null } | null;
  /* La recherche choisie (une ligne de `recherches`), pour un mandat de
     recherche : le bien recherché, le budget, le taux s'en déduisent. */
  recherche?: Record<string, unknown> | null;
  identite: IdentiteAgence;
};

/* Le document d'où l'on part (un mandat signé, pour un avenant ou le
   courrier de reconduction). */
export type Source = { id: string; modele: string; donnees: Donnees; numero: string | null; signe_le: string | null; finalise_le: string | null };

export type Categorie = 'mandats_vente' | 'mandats_recherche' | 'offres' | 'bons_visite' | 'courriers' | 'delegations';
export type Statut = 'brouillon' | 'pret' | 'signe' | 'annule';

/* `lettre` : un courrier, sans page de garde ni résumé (l'en-tête de
   l'agence est en haut de la première page). */
export type Garde = { titre: string; sous: string; etiquette: string; pour?: string; ics?: Icone[]; lettre?: boolean };

/* Un repère de l'éditeur, sous les questions d'une étape : un calcul
   (« Net vendeur : 652 381 € ») ou une mise en garde. Jamais imprimé. */
export type Repere = { l: string; v: string; ton?: 'alerte' | 'ok' };

export type Modele = {
  id: string;
  categorie: Categorie;
  titre: string;                     // « Mandat de vente »
  description: string;               // une ligne pour la bibliothèque
  /* Le pictogramme de la carte (PICTOS de l'écran ou ICONES du PDF). */
  ic: string;
  signataires: string;               // « Le ou les vendeurs, puis l'agence »
  etapes: Etape[];
  defaut: (c: Contexte) => Donnees;
  /* « Mandat exclusif · M. et Mme Martin » */
  titreDoc: (d: Donnees) => string;
  /* L'adresse ou le bien, sous le titre dans les listes. */
  sousTitre: (d: Donnees) => string;
  /* Le nom sur la page de garde. */
  pour: (d: Donnees) => string;
  rediger: (d: Donnees, id: IdentiteAgence) => Partie[];
  resume: (d: Donnees) => Resume;
  garde: (d: Donnees) => Garde;
  entete: (d: Donnees) => string;
  /* Ce qui manque avant de finaliser (en mots simples). */
  manques: (d: Donnees) => string[];
  /* Le numéro du registre des mandats est-il exigé ? */
  numero?: boolean;
  /* Ce que le registre des mandats inscrit pour ce mandat (V3.18) : sa
     nature, son type, les mandants (noms et adresses) et son objet. */
  registre?: (d: Donnees) => { nature: 'vente' | 'recherche'; type_mandat: string; mandants: string; objet: string };
  /* Pour la liste : le type (« Exclusif »), s'il y a lieu. */
  badge?: (d: Donnees) => string | null;
  /* Les repères de l'éditeur pour une étape (voir Repere). */
  reperes?: (d: Donnees, etape: string) => Repere[];
  /* Une fois signé, les dates à ne pas manquer (voir Echeance). */
  echeances?: (d: Donnees, signeLe: string) => Echeance[];
  /* Ce que « Nouveau document » propose de choisir après le client : un
     de ses biens (par défaut), une de ses recherches, ou un de ses mandats
     déjà finalisés (un avenant, un courrier part d'un mandat). */
  lien?: 'bien' | 'recherche' | 'mandat';
  /* Partir d'un mandat : les modèles acceptés, et les réponses qu'on en
     tire (noms, bien, numéro, dates). `echeance` : pour le courrier de
     reconduction, la date de l'échéance visée. */
  deriver?: { de: string[]; fn: (src: Source, id: IdentiteAgence, o?: { echeance?: string }) => Donnees };
  /* Signé : ce que le document écrit sur sa recherche (le bloc Mandat de la
     fiche client). `jour` : AAAA-MM-JJ. */
  surRecherche?: (d: Donnees, jour: string) => Record<string, unknown>;
  /* Un avenant déjà signé au même mandat (`precedent`) : ce qu'il a changé
     devient la situation actuelle de celui qu'on prépare. */
  enchainer?: (d: Donnees, precedent: Donnees) => Donnees;
  /* Une fois tout repris (mandat, avenants signés, client, recherche du
     moment) : ce qui s'en déduit — ce qui a changé, coché d'avance. */
  preparer?: (d: Donnees) => Donnees;
  /* Un document qui part d'un mandat sans en être l'avenant (la délégation,
     V3.18) : le modèle d'avenant dont les exemplaires signés à ce mandat
     s'appliquent, pour partir du prix, des honoraires et de la fin à jour. */
  avenantsDe?: (d: Donnees) => string | null;
  /* Entre professionnels (la délégation) : jamais montré au client dans son
     espace, même s'il est rangé sur sa fiche. */
  interne?: boolean;
  /* Un courrier qu'on envoie (pas un contrat qu'on fait signer) : la liste
     dit « À envoyer » et « Envoyé », et la preuve d'envoi remplace
     l'exemplaire signé. */
  courrier?: boolean;
  /* Ceux qui signent, dans l'ordre des cadres, l'agence comprise (voir
     CaseSignature). Sans lui, le document ne se signe qu'à la main. */
  cases?: (d: Donnees, id: IdentiteAgence) => CaseSignature[];
  /* La case que coche chaque signataire en ligne ou sur place, à la place
     de la mention manuscrite (« Bon pour offre d'achat au prix de… »).
     `cle` : son cadre (le conjoint ne coche pas la même chose que le
     mandant). */
  accepter?: (d: Donnees, cle?: string) => string;
  /* V3.145 : un rappel pour celui qui signe (pas l'agence), à l'écran avant
     de signer et dans son mail de confirmation — jamais dans le document.
     L'offre d'achat y met son total, frais d'agence compris. */
  rappel?: (d: Donnees) => { titre: string; valeur: string; detail: string } | null;
  /* V3.145 : ce qui se déduit des réponses, recalculé par l'éditeur à chaque
     changement (`cle` : le champ qui vient de bouger ; '' à l'ouverture).
     L'offre d'achat en tire le prix proposé au vendeur, depuis le total que
     le client veut mettre, frais d'agence compris. */
  deduire?: (d: Donnees, cle: string) => Donnees;
};

/* ── Comment le document est signé ──────────────────────────────────────
   À la main (imprimé, « mots rayés nuls », scanné ensuite), en ligne
   (chacun reçoit son lien par e-mail) ou sur place (sur l'écran de
   l'agence, chacun son tour). Les deux derniers sont une signature
   électronique : le même texte, sans mention manuscrite, des cadres qui
   disent qui a signé et quand, et un certificat. Un document enregistré
   avant cette question se signe à la main. */
export type ModeSignature = 'papier' | 'en_ligne' | 'sur_place';
export const modeSignature = (d: Donnees): ModeSignature => (d.signature === 'en_ligne' || d.signature === 'sur_place' ? d.signature : 'papier');
export const electronique = (d: Donnees) => modeSignature(d) !== 'papier';
/* Où il est signé. En ligne, c'est à distance, quoi qu'on ait coché avant. */
export const lieuDe = (d: Donnees): string => (modeSignature(d) === 'en_ligne' ? 'distance' : typeof d.lieu === 'string' ? d.lieu : '');

export const CHAMP_SIGNATURE: Champ = {
  t: 'choix', cle: 'signature', lib: 'Comment sera-t-il signé ?', ic: 'plume', tuiles: true, options: [
    { v: 'papier', l: 'À la main', aide: 'Imprimé, signé sur papier, puis scanné.', ic: 'plume' },
    { v: 'en_ligne', l: 'En ligne', aide: 'Chacun reçoit son lien par e-mail et signe avec un code.', ic: 'mail' },
    { v: 'sur_place', l: 'Sur place', aide: 'Sur ton écran, chacun son tour, avec un code reçu sur son e-mail.', ic: 'tablette' },
  ],
};

/* Un cadre de signature. `cle` le retrouve d'une version à l'autre (v0,
   v1 : les vendeurs ; conjoint ; a0 : un acquéreur…) ; `personne` : qui
   signe (son nom, son e-mail, pour lui envoyer son lien ou son code) ;
   `agence` : le cadre de l'agence, signé par Alexandre quand il lance la
   signature. */
export type CaseSignature = { cle: string; qui: string; nom: string; lignes: string[]; personne?: Personne; agence?: boolean };

/* « Date et signatures » : à la main, la phrase « Fait à… en N
   exemplaires », les mots rayés et les cadres à remplir ; en ligne ou sur
   place, la façon dont chacun signe et des cadres qui se remplissent au
   fil des signatures. */
export function blocsSignature(d: Donnees, o: { papier: string; mention?: string; cases: CaseSignature[] }): Bloc[] {
  if (!electronique(d)) return [
    P(o.papier),
    Pp('Mots rayés nuls : ______   ·   Lignes rayées nulles : ______'),
    { t: 'sigs', ...(o.mention ? { mention: o.mention } : {}), cases: o.cases.map(c => ({ qui: c.qui, nom: c.nom, lignes: c.lignes })) },
  ];
  const date = txt(d, 'date') ? jourLong(txt(d, 'date')) : '……………';
  const agence = o.cases.some(c => c.agence);
  const ou = modeSignature(d) === 'en_ligne'
    ? `Établi le ${date} et signé électroniquement à distance, chaque signataire depuis son lien personnel.`
    : `Établi à ${txt(d, 'faitA') || '……………'} le ${date} et signé électroniquement sur place, chaque signataire à son tour sur l’écran de l’Agence.`;
  return [
    P(`${ou} La date et l’heure de chaque signature figurent dans son cadre et dans le certificat de signature joint. Chaque partie en reçoit un exemplaire électronique, avec ce certificat.`),
    { t: 'sigs', electronique: true,
      mention: `Chaque signataire${agence ? ', l’Agence exceptée,' : ''} déclare avoir lu le document en cochant la case prévue, puis le signe avec un code à usage unique reçu sur sa propre adresse e-mail et une signature tracée à l’écran.${agence ? ' L’Agence signe par son représentant, au lancement de la signature.' : ''} Articles 1366 et 1367 du Code civil. Le document signé est scellé, et le certificat joint en atteste.`,
      cases: o.cases.map(c => ({ cle: c.cle, qui: c.qui, nom: c.nom, lignes: c.lignes, ...(c.agence ? { agence: true } : {}) })) },
  ];
}

/* Ce qui manque pour signer en ligne ou sur place : un nom dans chaque
   cadre (les e-mails se demandent au moment d'envoyer). */
export function manquesSignature(d: Donnees, cases: CaseSignature[]): string[] {
  if (!electronique(d)) return [];
  const out: string[] = [];
  cases.filter(c => !c.agence).forEach(c => { if (!c.personne || !(c.personne.nom || c.personne.prenom)) out.push(`Le nom de celui qui signe « ${c.qui.toLowerCase()} »`); });
  if (modeSignature(d) === 'sur_place' && d.lieu === 'distance') out.push('Sur place, il n’est pas signé à distance : choisis où (à l’agence, ou chez le client)');
  return out;
}
/* L'exécution avant la fin des 14 jours, quand le document ouvre la
   rétractation : sans case à cocher à la main, il faut la choisir avant. */
export const MANQUE_EXECUTION = 'Commencer avant la fin des 14 jours : oui ou non (en ligne ou sur place, il n’y a pas de case à cocher à la main)';

/* Le document ouvre-t-il 14 jours de rétractation ? On le lit dans le texte
   même : les mandats signés hors de l'agence ou à distance en ont un ;
   jamais les avenants, l'offre d'achat ni le bon de visite. */
export function aRetractation(m: Modele, d: Donnees): boolean {
  return m.rediger(d, IDENTITE_DEFAUT).some(p => p.titre === 'Formulaire de rétractation' || p.sections.some(x => x.titre === 'Droit de rétractation'));
}

/* Commencer tout de suite, sans attendre les 14 jours : il faut la demande
   expresse du client (article L221-25 du Code de la consommation). Le choix
   écrit d'avance dans le document ne suffit pas : en ligne ou sur place,
   chaque mandant la coche lui-même, dans une case à part, en signant.
   Null : rien à demander (il attend la fin du délai, le document n'ouvre
   pas de rétractation, ou ce cadre n'est pas celui d'un mandant). */
export const DEMANDE_EXPRESSE = 'Je demande que l’Agence commence sa mission dès ma signature, sans attendre la fin du délai de rétractation de 14 jours. Je sais que je garde mon droit de me rétracter pendant ce délai.';
export function demandeExpresse(m: Modele, d: Donnees, cle: string): string | null {
  /* Ni l'agence, ni le conjoint, ni les associés d'une société (V3.39) : ils ne sont pas mandants. */
  if (cle === 'agence' || cle === 'conjoint' || cle.startsWith('associe') || !electronique(d) || d.execution !== 'oui') return null;
  return aRetractation(m, d) ? DEMANDE_EXPRESSE : null;
}

/* Une échéance d'un document signé : la date, et la fenêtre pendant
   laquelle il faut agir (« écrire au vendeur entre le … et le … »). */
export type Echeance = { le: string; quoi: string; du?: string; au?: string };

/* « AAAA-MM-JJ » plus n mois, le jour ramené à la fin du mois si besoin
   (31 janvier + 1 mois = 28 ou 29 février). */
export function plusMois(ymd: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return '';
  const total = Number(m[1]) * 12 + Number(m[2]) - 1 + n;
  const an = Math.floor(total / 12), mois = total % 12;
  const fin = new Date(Date.UTC(an, mois + 1, 0)).getUTCDate();
  const j = Math.min(Number(m[3]), fin);
  return `${an}-${String(mois + 1).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}

/* La veille d'un jour « AAAA-MM-JJ ». */
export function veille(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return '';
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1)).toISOString().slice(0, 10);
}

/* ── Petits outils de lecture des réponses ── */
export const txt = (d: Donnees, k: string) => (typeof d[k] === 'string' ? (d[k] as string).trim() : '');
export const num = (d: Donnees, k: string): number | null => {
  const v = d[k];
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/\s/g, '').replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
};
export const liste = (d: Donnees, k: string): string[] => (Array.isArray(d[k]) ? (d[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []);
export const vrai = (d: Donnees, k: string) => d[k] === 'oui' || d[k] === true;
/* Un texte raccourci au dernier mot entier, avec « … » s'il est coupé. */
export function couper(t: string, n: number): string {
  if (t.length <= n) return t;
  const c = t.slice(0, n).replace(/[\s,;:·-]+\S*$/, '');
  return (c || t.slice(0, n)) + '…';
}
/* Les lignes d'un champ « lignes », nettoyées, sans les lignes vides. */
export function lignes(d: Donnees, k: string): Record<string, string>[] {
  const v = d[k];
  if (!Array.isArray(v)) return [];
  return v.map(x => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const r: Record<string, string> = {};
    for (const [c, y] of Object.entries(o)) if (typeof y === 'string' || typeof y === 'number') r[c] = String(y).replace(/\s+/g, ' ').trim().slice(0, 200);
    return r;
  }).filter(r => Object.values(r).some(Boolean));
}

export const P = (x: string, g = false): Bloc => ({ t: 'p', x, g });
export const Pp = (x: string): Bloc => ({ t: 'p', x, petit: true });
/* Un texte libre (une clause, une précision), tel qu'on l'a tapé : une ligne
   par paragraphe, au lieu d'un seul bloc où les retours à la ligne se
   perdent (V3.52). `avant` : ce qui précède la première ligne (« Précision : »).
   Les montants tapés à la main gardent leurs chiffres ensemble, comme ceux
   que le modèle écrit (« 1 175 000 € » ne se coupe pas en fin de ligne). */
const insecables = (x: string) => x.replace(/(\d) (?=\d{3}(?!\d))/g, '$1\u00a0').replace(/(\d) ([€%])/g, '$1\u00a0$2');
export const lignesLibres = (t: string): string[] => t.split(/\n+/).map(x => insecables(x.replace(/\s+/g, ' ').trim())).filter(Boolean);
export const paragraphes = (t: string, avant = ''): Bloc[] => lignesLibres(t).map((x, i) => P(i === 0 && avant ? `${avant}${x}` : x));
/* « 685 000 € (six cent quatre-vingt-cinq mille euros) » */
export const eurosLettres = (n: number) => `${euros(n)} (${enLettres(n)} euros)`;
/* « 12 » → « douze (12) » */
export const nbLettres = (n: number) => `${enLettres(n)} (${n})`;
export const pourcent = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')} %`;
/* « JJ/MM/AAAA » depuis « AAAA-MM-JJ ». */
export const jour = (ymd: string) => jourFr(ymd);
/* « 27 septembre 2026 » depuis « AAAA-MM-JJ », sans fuseau. */
export function jourLong(ymd: string): string {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${Number(m[3]) === 1 ? '1er' : Number(m[3])} ${mois[Number(m[2]) - 1]} ${m[1]}`;
}
export const aujourdhui = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/* Les données personnelles (RGPD, article 13) : qui traite, pourquoi, sur
   quelle base, qui les reçoit, combien de temps, quels droits. Un seul
   paragraphe, pour que le document reste lisible. */
export function blocDonnees(id: IdentiteAgence): Bloc {
  return P(`Données personnelles : l’Agence, responsable du traitement, utilise les informations recueillies ici pour exécuter le présent document et remplir ses obligations légales (registre des mandats, lutte contre le blanchiment). Elles ne sont communiquées qu’aux personnes qui interviennent dans l’opération (notaires, diagnostiqueurs, confrères, établissements de crédit) et sont conservées cinq ans après la fin de la relation, dix ans pour le registre des mandats. Chacun peut y accéder, les faire rectifier ou effacer, en limiter l’usage, s’y opposer ou en demander une copie, en écrivant à ${id.mail}, et saisir la CNIL (www.cnil.fr).`);
}

/* La section « Informations » : réclamations et médiateur, données,
   blanchiment, démarchage, et les textes applicables cités par leur nom
   (la loi n'impose pas de les recopier : on les nomme). */
export function blocsInformations(id: IdentiteAgence, qui: string, o: { lcbft?: string; textes?: string } = {}): Bloc[] {
  return [
    P(`Réclamations : par écrit à l’Agence. Sans réponse satisfaisante sous 30 jours, ${qui} peut saisir gratuitement le médiateur de la consommation : ${id.mediateurNom}, ${id.mediateurAdresse}, ${id.mediateurSite}.`),
    blocDonnees(id),
    ...(o.lcbft ? [P(`Lutte contre le blanchiment : l’Agence est tenue de vérifier l’identité de ses clients et de s’informer de l’origine des fonds (articles L561-1 et suivants du Code monétaire et financier). ${o.lcbft}`)] : []),
    P(`Démarchage téléphonique : ${qui} peut s’inscrire gratuitement sur la liste d’opposition Bloctel (www.bloctel.gouv.fr).`),
    Pp(`Textes applicables : ${o.textes || 'loi n° 70-9 du 2 janvier 1970 (dite loi Hoguet) et décret n° 72-678 du 20 juillet 1972'} ; code de déontologie des professionnels de l’immobilier. Le présent document est soumis à la loi française.`),
  ];
}

/* La fiche « l'Agence » (mandataire ou intermédiaire). */
export function ficheAgence(id: IdentiteAgence, lignes: string[], note: string | undefined, pied: string): Fiche {
  return { ic: 'agence', titre: id.nom.toUpperCase(), lignes, ...(note ? { note } : {}), pied };
}

/* Le formulaire type de rétractation (annexe de l'article R221-1 du Code
   de la consommation), pour un contrat signé hors de l'agence ou à
   distance. */
export function formulaireType(A: IdentiteAgence, o: { contrat: string; conclu: string; noms: string; adresse: string }): Partie {
  return {
    titre: 'Formulaire de rétractation',
    court: 'Formulaire de rétractation',
    sous: 'À renvoyer uniquement si vous souhaitez vous rétracter',
    ic: 'retour',
    sections: [{ blocs: [
      P(`À l’attention de : ${A.nom.toUpperCase()}, ${A.adresse}, ${A.cp} ${A.ville} — ${A.mail}`, true),
      { t: 'l', items: [
        `Je vous notifie par la présente ma rétractation du contrat portant sur la prestation de service ci-dessous : ${o.contrat}.`,
        `Conclu le : ${o.conclu || '………………'}`,
        `Nom du ou des consommateurs : ${o.noms || '………………'}`,
        `Adresse : ${o.adresse || '………………'}`,
        'Signature (uniquement si ce formulaire est envoyé sur papier) :',
        'Date :',
      ] },
    ] }],
  };
}

/* ── Les articles L215-1 à L215-3 et L241-3 du Code de la consommation ──
   Un mandat qui se poursuit par périodes (reconduction tacite) doit les
   reproduire intégralement (article L215-4). Texte en vigueur depuis le
   1er juin 2023 (L215-1 : 18 août 2022), relevé mot pour mot sur deux
   miroirs de Légifrance en septembre 2026. L215-1-1 est compris : il se
   trouve entre L215-1 et L215-3, et L215-2 y renvoie. À revérifier si la
   loi change. */
const ARTICLES_L215: { n: string; al: string[] }[] = [
  { n: 'Article L215-1', al: [
    'Pour les contrats de prestations de services conclus pour une durée déterminée avec une clause de reconduction tacite, le professionnel prestataire de services informe le consommateur par écrit, par lettre nominative ou courrier électronique dédiés, au plus tôt trois mois et au plus tard un mois avant le terme de la période autorisant le rejet de la reconduction, de la possibilité de ne pas reconduire le contrat qu’il a conclu avec une clause de reconduction tacite. Cette information, délivrée dans des termes clairs et compréhensibles, mentionne, dans un encadré apparent, la date limite de non-reconduction.',
    'Lorsque cette information ne lui a pas été adressée conformément aux dispositions du premier alinéa, le consommateur peut mettre gratuitement un terme au contrat, à tout moment à compter de la date de reconduction.',
    'Les avances effectuées après la dernière date de reconduction ou, s’agissant des contrats à durée indéterminée, après la date de transformation du contrat initial à durée déterminée, sont dans ce cas remboursées dans un délai de trente jours à compter de la date de résiliation, déduction faite des sommes correspondant, jusqu’à celle-ci, à l’exécution du contrat.',
    'Les dispositions du présent article s’appliquent sans préjudice de celles qui soumettent légalement certains contrats à des règles particulières en ce qui concerne l’information du consommateur.',
    'Par exception au premier alinéa du présent article, pour les contrats de fourniture de service de télévision au sens de l’article 2 de la loi n° 86-1067 du 30 septembre 1986 relative à la liberté de communication et pour les contrats de fourniture de services de médias audiovisuels à la demande, le consommateur peut mettre gratuitement un terme au contrat, à tout moment à compter de la première reconduction, dès lors qu’il change de domicile ou que son foyer fiscal évolue.',
  ] },
  { n: 'Article L215-1-1', al: [
    'Lorsqu’un contrat a été conclu par voie électronique ou a été conclu par un autre moyen et que le professionnel, au jour de la résiliation par le consommateur, offre au consommateur la possibilité de conclure des contrats par voie électronique, la résiliation est rendue possible selon cette modalité.',
    'A cet effet, le professionnel met à la disposition du consommateur une fonctionnalité gratuite permettant d’accomplir, par voie électronique, la notification et les démarches nécessaires à la résiliation du contrat. Lorsque le consommateur notifie la résiliation du contrat, le professionnel lui confirme la réception de la notification et l’informe, sur un support durable et dans des délais raisonnables, de la date à laquelle le contrat prend fin et des effets de la résiliation.',
    'Un décret fixe notamment les modalités techniques de nature à garantir une identification du consommateur et un accès facile, direct et permanent à la fonctionnalité mentionnée au deuxième alinéa, telles que ses modalités de présentation et d’utilisation. Il détermine les informations devant être fournies par le consommateur.',
  ] },
  { n: 'Article L215-2', al: [
    'Les dispositions du présent chapitre, à l’exception de l’article L. 215-1-1, ne sont pas applicables aux exploitants des services d’eau potable et d’assainissement.',
  ] },
  { n: 'Article L215-3', al: [
    'Les dispositions du présent chapitre sont également applicables aux contrats conclus entre des professionnels et des non-professionnels.',
  ] },
  { n: 'Article L241-3', al: [
    'Lorsque le professionnel n’a pas procédé au remboursement dans les conditions prévues à l’article L. 215-1, les sommes dues sont productives d’intérêts au taux légal.',
  ] },
];
export function annexeL215(): Partie {
  return {
    titre: 'Annexe : la reconduction du mandat',
    court: 'Annexe · Code de la consommation',
    sous: 'Articles L215-1 à L215-3 et L241-3, reproduits comme l’exige l’article L215-4',
    ic: 'livre',
    sections: ARTICLES_L215.map(a => ({ titre: a.n, blocs: a.al.map(x => Pp(x)) })),
  };
}
