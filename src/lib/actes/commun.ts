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
import type { IdentiteAgence } from '@/lib/agence';

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
export type Etape = { id: string; titre: string; sous: string; champs: Champ[]; vers?: string; reperesApres?: string; ic?: string };

/* Ce que le CRM connaît déjà au moment de créer un document. */
export type Contexte = {
  client?: { id: string; prenom?: string; nom?: string; adresse?: string | null; emails?: string[] | null; telephones?: string[] | null } | null;
  bien?: {
    id: string; titre?: string | null; adresse?: string | null; code_postal?: string | null; ville?: string | null; quartier?: string | null;
    type_bien?: string | null; surface?: number | null; nb_pieces?: number | null; etage?: number | null;
    prix_acquereur?: number | null; prix_vendeur?: number | null; agence_nom?: string | null; description?: string | null;
  } | null;
  visite?: { date_visite?: string | null; heure?: string | null } | null;
  identite: IdentiteAgence;
};

export type Categorie = 'mandats_vente' | 'mandats_recherche' | 'offres' | 'bons_visite';
export type Statut = 'brouillon' | 'pret' | 'signe' | 'annule';

export type Garde = { titre: string; sous: string; etiquette: string; pour?: string; ics?: Icone[] };

/* Un repère de l'éditeur, sous les questions d'une étape : un calcul
   (« Net vendeur : 652 381 € ») ou une mise en garde. Jamais imprimé. */
export type Repere = { l: string; v: string; ton?: 'alerte' | 'ok' };

export type Modele = {
  id: string;
  categorie: Categorie;
  titre: string;                     // « Mandat de vente »
  description: string;               // une ligne pour la bibliothèque
  ic: Icone;
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
  /* Pour la liste : le type (« Exclusif »), s'il y a lieu. */
  badge?: (d: Donnees) => string | null;
  /* Les repères de l'éditeur pour une étape (voir Repere). */
  reperes?: (d: Donnees, etape: string) => Repere[];
  /* Une fois signé, les dates à ne pas manquer (voir Echeance). */
  echeances?: (d: Donnees, signeLe: string) => Echeance[];
};

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
