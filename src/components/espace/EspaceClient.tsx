'use client';
import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { QUARTIERS, searchCommune, type CpSuggestion } from '@/lib/secteurs';
import ArretPicker, { PastilleArret } from '@/components/shared/ArretPicker';
import type { Arret } from '@/lib/arrets';

/**
 * L'espace acheteur, côté navigateur.
 * Toutes les écritures passent par /api/espace/*, qui revérifie le lien.
 */

/* ══ types ════════════════════════════════════════ */
type Bien = {
  id: string; titre: string; secteur: string; prix: number | null;
  surface: number | null; pieces: number | null; chambres: number | null;
  etage: number | null; etageTotal: number | null; expo: string | null;
  dpe: string | null; ges: string | null; annee: number | null;
  description: string | null; photos: string[];
  terrasse?: boolean; balcon?: boolean; jardin?: boolean; parking?: boolean;
  ascenseur?: boolean; cave?: boolean; gardien?: boolean;
  cuisineEquipee?: boolean; clim?: boolean; traversant?: boolean;
  sejour?: number | null; exterieur?: number | null;
  surfaceTerrasse?: number | null; surfaceBalcon?: number | null;
  nbParking?: number | null;
  charges?: number | null; taxe?: number | null;
  chauffage?: string | null; lots?: number | null;
  pdfUrl: string | null; envoyeLe: string | null; vuLe: string | null;
  avis: string | null; commentaire: string | null; retourLe: string | null;
  /* 'client' s'il a répondu ici, 'conseiller' si Alexandre l'a noté pour lui
     après un appel. Ce n'est pas un détail : on ne présente pas à quelqu'un
     comme « son commentaire » une phrase qu'il n'a pas écrite. */
  retourPar?: string | null;
  etat: string;
};
type Criteres = {
  budgetMin: number | null; budgetMax: number | null;
  surfaceMin: number | null; surfaceMax: number | null; surfaceSejourMin: number | null;
  piecesMin: number | null; piecesMax: number | null; chambresMin: number | null;
  secteurs: string[];
  typeBien: string | null; typesBien: string[];
  etatSouhaite: string | null; anneeMin: number | null;
  etageMin: number | null; etageMax: number | null;
  rdcExclu: boolean; dernierEtage: boolean; etageMaxSansAscenseur: number | null;
  exposition: string;
  equip: string[]; exigences: Record<string, string>;
  cuisineType: string | null; exterieurSurfaceMin: number | null;
  dpeMax: string | null;
  apport: number | null; financement: string | null; urgence: string | null;
  notes: string;
  transportMinutes: number | null; transportLignes: string[]; transportArrets: Arret[];
};
type Props = {
  token: string;
  client: { prenom: string; nom: string; reference: string; jours: number | null };
  criteres: Criteres;
  biens: Bien[];
  passage: {
    quand: string | null; lues: number | null; proposees: number | null; ecartees: number | null;
    /* Les cumuls depuis l'ouverture du dossier, tous passages confondus. */
    totalLues?: number; totalRetenues?: number; totalEcartees?: number; nbPassages?: number;
  } | null;
  semaine: { quand: string | null; lues: number }[];
  /* Les visites calées et pas encore passées, la plus proche en premier. */
  visites: { id: string; date: string; heure: string | null; titre: string; adresse: string; bienId: string | null }[];
};

/* ══ outils ═══════════════════════════════════════ */
const EUR = (n?: number | null) =>
  n == null ? '—' : n.toLocaleString('fr-FR').replace(/[  ]/g, ' ') + ' €';
/* Les descriptions d'annonces arrivent souvent d'un bloc, sans le moindre
   saut de ligne. On respire pour le lecteur : on coupe d'abord sur les sauts
   existants, puis on regroupe les phrases par paquets. On ne touche jamais
   aux mots — seulement à l'air entre eux. */
const decoupeTexte = (t?: string | null): string[] => {
  if (!t || !t.trim()) return [];
  const doubles = t.split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
  const source = doubles.length > 1 ? doubles : t.split(/\n+/).map(x => x.trim()).filter(Boolean);
  const sortie: string[] = [];
  for (const bloc of source) {
    if (bloc.length <= 300) { sortie.push(bloc); continue; }
    const phrases = bloc.match(/[^.!?\u2026]+[.!?\u2026]+\s*|[^.!?\u2026]+$/g) || [bloc];
    let courant = '';
    for (const ph of phrases) {
      courant += ph;
      if (courant.length >= 200) { sortie.push(courant.trim()); courant = ''; }
    }
    if (courant.trim()) sortie.push(courant.trim());
  }
  return sortie;
};
const MOIS = ['janv.','févr.','mars','avril','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const JOURS = ['D','L','M','M','J','V','S'];

function depuis(d?: string | null) {
  if (!d) return '';
  const x = new Date(d); if (isNaN(x.getTime())) return '';
  const h = (Date.now() - x.getTime()) / 3600000;
  if (h < 1) return "à l'instant";
  if (h < 5) return `il y a ${Math.round(h)} h`;
  if (x.toDateString() === new Date().toDateString()) return "aujourd'hui";
  if (h < 48) return 'hier';
  return `${x.getDate()} ${MOIS[x.getMonth()]}`;
}
/* Le bandeau dit la même chose partout : « Actualisé à 19 h 05 » le jour même,
   « Actualisé le 14 sept. à 19 h 05 » ensuite. Pas de vocabulaire différent
   entre le téléphone et l'ordinateur — c'est la même phrase pour tout le monde. */
function actualiseLe(d?: string | null) {
  if (!d) return '';
  const x = new Date(d); if (isNaN(x.getTime())) return '';
  const h = 'à ' + x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
  if (x.toDateString() === new Date().toDateString()) return h;
  return `le ${x.getDate()} ${MOIS[x.getMonth()]} ${h}`;
}


const DPEC: Record<string, string> = { A:'#319834', B:'#4ab84a', C:'#a8d84a', D:'#f7e017', E:'#f5b912', F:'#ee8235', G:'#e2231a' };
const AVIS: Record<string, { e: string; n: string; c: string }> = {
  interesse: { e: '👍', n: 'Ça me plaît', c: 'oui' },
  souhaite_visiter: { e: '👀', n: 'Je veux visiter', c: 'visite' },
  refuse: { e: '👎', n: 'Pas pour moi', c: 'non' },
};
/* Pour l'affichage seulement : « visite » n'est pas un choix du client,
   c'est le chasseur qui l'a posé en saisissant son compte rendu. */
const ETIQ: Record<string, { e: string; n: string; c: string }> = {
  ...AVIS,
  visite: { e: '🏠', n: 'Visite effectuée', c: 'fait' },
};
/* Après le clic sur un avis, on ne laisse pas un champ vide et muet :
   on dit au client à quoi servira ce qu'il écrit, et ce qu'on attend de lui.
   C'est ce qui fait la différence entre 10 % et 60 % de retours écrits. */
const SUITE_AVIS: Record<string, { t: string; p: string; ph: string; btn: string }> = {
  interesse: {
    t: 'Qu’est-ce qui vous a plu ?',
    p: 'Plus vous êtes précis, plus les biens suivants ressembleront à celui-là. Et si vous voulez le visiter, dites-le-nous ici.',
    ph: 'Ex : la luminosité, le séjour, le quartier… et si je veux le visiter.',
    btn: 'Envoyer mon avis',
  },
  souhaite_visiter: {
    t: 'Quelles sont vos disponibilités ?',
    p: 'Votre conseiller organise la visite avec l’agence ou le propriétaire. Donnez-lui deux ou trois créneaux, il revient vers vous avec un rendez-vous.',
    ph: 'Ex : jeudi après 18 h, vendredi midi, samedi matin…',
    btn: 'Envoyer mes disponibilités',
  },
  refuse: {
    t: 'Qu’est-ce qui n’a pas convenu ?',
    p: 'C’est l’information la plus utile de toutes : elle nous permet d’écarter ce type de bien et d’affiner votre recherche. Même une phrase suffit.',
    ph: 'Ex : trop sombre, rue trop passante, cuisine trop petite, pas de vrai extérieur…',
    btn: 'Envoyer mon retour',
  },
};

/* Les cases de rangement de « Mes derniers biens consultés », dans l'ordre
   où elles comptent pour le client : ce qu'il attend de faire d'abord, puis
   ce qu'il a aimé, et seulement à la fin ce qu'il a écarté.
   « visite » vient du CRM (compte rendu de visite saisi par le chasseur). */
const GROUPES: { id: string; e: string; court: string; titre: string; ton: string; note?: string }[] = [
  { id: 'attente', e: '⏳', court: 'En attente', titre: 'En attente de votre avis', ton: 'c-or',
    note: 'Vous les avez ouverts sans nous dire ce que vous en pensiez. Un mot suffit — c’est ce qui oriente la suite de la recherche.' },
  { id: 'souhaite_visiter', e: '👀', court: 'À visiter', titre: 'Je veux visiter', ton: 'c-prune',
    note: 'Votre conseiller organise les visites. Envoyez-lui vos disponibilités si ce n’est pas déjà fait.' },
  { id: 'visite', e: '🏠', court: 'Visités', titre: 'Visite effectuée', ton: 'c-bleu' },
  { id: 'interesse', e: '👍', court: 'Ça me plaît', titre: 'Ça me plaît', ton: 'c-vert',
    note: 'Ce que vous gardez de côté. Dites-nous si vous voulez en visiter un, votre conseiller s’en occupe.' },
  { id: 'refuse', e: '👎', court: 'Pas pour moi', titre: 'Pas pour moi', ton: 'c-brique',
    note: 'Ce que vous écartez compte autant que ce que vous gardez : c’est ce qui affine vos critères.' },
];
const groupeDe = (b: Bien) => (b.avis && GROUPES.some(g => g.id === b.avis) ? b.avis : 'attente');

/* Les secteurs sont écrits par le CRM sous la forme « Quartier (Ville) »,
   ou « Ville » seule quand toute la ville est prise. On relit ce format —
   on n'invente aucune liste ici, elle vient de src/lib/secteurs.ts. */
const normVille = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const lireSecteur = (label: string) => {
  const m = label.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  return m ? { quartier: m[1].trim(), ville: m[2].trim() } : { quartier: null as string | null, ville: label.trim() };
};
const grouperSecteurs = (liste: string[]) => {
  const villes: { ville: string; quartiers: string[] }[] = [];
  for (const s of liste) {
    const { ville, quartier } = lireSecteur(s);
    let v = villes.find(x => normVille(x.ville) === normVille(ville));
    if (!v) { v = { ville, quartiers: [] }; villes.push(v); }
    if (quartier && !v.quartiers.some(q => normVille(q) === normVille(quartier))) v.quartiers.push(quartier);
  }
  return villes;
};
const cpDeVille = (ville: string) =>
  Object.keys(QUARTIERS).find(cp => normVille(QUARTIERS[cp].ville) === normVille(ville)) || null;


/* Mêmes intitulés que le CRM : ce que le client lit ici est ce qu'Alexandre voit. */
const TYPES_E: [string, string][] = [
  ['Appartement', '🏢'], ['Maison', '🏡'], ['Loft', '🏗️'],
  ['Duplex', '🪜'], ['Terrain', '🌱'], ['Autre', '✳️'],
];
const ICONE_TYPE: Record<string, string> = Object.fromEntries(TYPES_E);
const ETATS_E: [string, string, string][] = [
  ['a_renover', 'À rénover', '🔨'], ['travaux_legers', 'Travaux légers', '🧰'],
  ['bon_etat', 'Bon état', '✨'], ['refait_neuf', 'Refait à neuf', '💎'],
];
const CUISINES_E: [string, string, string][] = [
  ['', 'Indifférent', '🤷'], ['ouverte', 'Ouverte sur le séjour', '🍽️'], ['separee', 'Séparée', '🚪'],
];
const EXPO_E: [string, string, string][] = [['sud','Sud','☀️'],['est','Est','🌅'],['ouest','Ouest','🌇'],['nord','Nord','❄️'],['traversant','Traversant','↔️']];
/* clé technique (colonne en base) ↔ libellé lisible ↔ emoji */
const EQUIP_E: [string, string, string][] = [
  ['parking','Parking','🅿️'], ['cave','Cave','📦'], ['balcon','Balcon','🌿'],
  ['terrasse','Terrasse','☀️'], ['jardin','Jardin','🌳'], ['ascenseur','Ascenseur','🛗'],
  ['gardien','Gardien','👮'],
];
const URGENCES_E: [string, string, string][] = [
  ['immediate', 'Immédiate', '🔥'], ['3_mois', 'Sous 3 mois', '⏱️'],
  ['6_mois', 'Sous 6 mois', '📆'], ['annee', "Dans l'année", '🗓️'],
];
const FINANCEMENTS_E: [string, string, string][] = [
  ['cash', 'Cash', '💵'], ['pret_valide', 'Prêt validé', '✅'],
  ['pret_en_cours', 'Prêt en cours', '⏳'], ['a_monter', 'Prêt à monter', '📝'],
  ['pret_relais', 'Prêt relais', '🔁'],
  ['mixte_cash_pret', 'Mixte · cash + prêt', '🔀'],
  ['mixte_cash_relais', 'Mixte · cash + prêt relais', '🔀'],
  ['mixte_pret_relais', 'Mixte · prêt + prêt relais', '🔀'],
];
const LETTRES_DPE = ['A','B','C','D','E','F','G'];
/* Une valeur du récapitulatif : petite carte avec son icône, plutôt qu'une ligne nue. */
function Fait({ ico, lib, val }: { ico: string; lib: string; val: React.ReactNode }) {
  return (
    <div className="fait">
      <span className="fi">{ico}</span>
      <span className="ft"><i>{lib}</i><b>{val}</b></span>
    </div>
  );
}

/* Un champ nombre : vide par défaut, jamais d'exemple grisé pris pour une valeur. */
function ChampNum({ val, onChange, suffixe, aide }: {
  val: string; onChange: (v: string) => void; suffixe?: string; aide?: string;
}) {
  return (
    <div className="champ-n">
      <input type="number" inputMode="numeric" value={val} onChange={(e) => onChange(e.target.value)} />
      {suffixe ? <span className="sfx">{suffixe}</span> : null}
      {aide ? <span className="aide">{aide}</span> : null}
    </div>
  );
}

/* Le petit « ? » posé après un intitulé de chiffre. */
function BtnAide({ cle, onAide }: { cle: string; onAide: (c: string) => void }) {
  return (
    <button type="button" className="aide-pt" aria-label="Que veut dire ce chiffre ?"
      onClick={(e) => { e.stopPropagation(); onAide(cle); }}>?</button>
  );
}

/* En-tête d'une catégorie, côté acheteur : pastille d'icône + titre lisible. */
function CatE({ ico, titre, sous, children }: { ico: string; titre: string; sous?: string; children: React.ReactNode }) {
  return (
    <div className="bloc cat">
      <div className="cat-h">
        <span className="cat-i"><Ico n={ico} t={19} /></span>
        <span className="cat-tt"><b>{titre}</b>{sous ? <i>{sous}</i> : null}</span>
      </div>
      {children}
    </div>
  );
}

/* Une pastille d'équipement : dorée et marquée quand c'est indispensable. */
function PastilleE({ texte, fort }: { texte: string; fort?: boolean }) {
  return <span className={'past' + (fort ? ' indis' : ' or')}>{texte}{fort ? <i className="mk">indispensable</i> : null}</span>;
}

const T: Record<string, string[]> = {
  /* Les équipements du bien : un trait, pas un pictogramme chargé — ils se
     lisent à 34 px dans une pastille, pas en pleine page. */
  terrasse:['M3 15h18','M3 21h18','M4.5 15v6','M9.5 15v6','M14.5 15v6','M19.5 15v6'],
  jardin:['c:12,9,5','M12 14v7','M8.6 17.4 12 18.8l3.4-1.4'],
  parking:['M4 16.5h16','M6.2 16.5v2','M17.8 16.5v2','M5.6 16.5v-4l1.9-4.2h9l1.9 4.2v4','M5.6 12.5h12.8'],
  cave:['M4 19.5h4v-4h4v-4h4v-4h4','M4 19.5V17'],
  ascenseur:['M6.2 3.5h11.6v17H6.2z','m10 10 2-2.6 2 2.6','m10 14 2 2.6 2-2.6'],
  gardien:['M12 3.4 5.2 6.3v5.4c0 4.1 2.8 7.4 6.8 8.5 4-1.1 6.8-4.4 6.8-8.5V6.3z'],
  cuisine:['M3.6 6.6h16.8v11.4H3.6z','M3.6 13.4h16.8','c:8.4,10,1.5','c:15.6,10,1.5'],
  clim:['M12 3.4v17.2','M4.5 7.8 19.5 16.2','M19.5 7.8 4.5 16.2','m9.2 5.2 2.8 2 2.8-2','m9.2 18.8 2.8-2 2.8 2'],
  traversant:['M3.2 12h17.6','m7.4 7.8-4 4.2 4 4.2','m16.6 7.8 4 4.2-4 4.2'],
  etoile:['M12 2.8l2.5 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.2l-5.2 2.8 1.1-5.9-4.3-4.1 5.9-.8z'],
  horloge:['c:12,12,9','M12 7.4V12l3.2 2'],
  graph:['M3 20h18','M6 20V12','M11 20V6.5','M16 20v-5','M21 20v-9'],
  cible:['c:12,12,9','c:12,12,4.6','c:12,12,.9'],
  fleche:['m9.5 6 6 6-6 6'], retour:['m14 6-6 6 6 6'],
  croix:['M6.5 6.5l11 11','M17.5 6.5l-11 11'], check:['m5 13 5 5L20 6'],
  tel:['M6.2 3h3.1l1.5 3.9-2 1.3a13.4 13.4 0 0 0 6.9 6.9l1.3-2 3.9 1.5v3.1a1.9 1.9 0 0 1-2.1 1.9A17.6 17.6 0 0 1 3.1 5.1 1.9 1.9 0 0 1 5 3z'],
  lieu:['M12 21.5S19 15 19 10a7 7 0 1 0-14 0c0 5 7 11.5 7 11.5z','c:12,10,2.6'],
  crayon:['M12.5 20H21','M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6 3.4 19.8l1.2-4z'],
  loupe:['c:10.8,10.8,7','m20.5 20.5-4.7-4.7'],
  euro:['M17 6.5A6.5 6.5 0 0 0 7.5 12 6.5 6.5 0 0 0 17 17.5','M4 10.5h8','M4 13.5h8'],
  maison:['M3 21h18','M5 21V9.5L12 4l7 5.5V21','M10 21v-6h4v6'],
  verrou:['M5 11.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z','M8 9.5V7a4 4 0 0 1 8 0v2.5'],
  pdf:['M12 3v12','m7.5 11 4.5 4.5 4.5-4.5','M4 20h16'],
  partage:['M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7','M12 3v13','m7.5 7.5 4.5-4.5 4.5 4.5'],
  mail:['M3.6 6.6h16.8v10.8H3.6z','m3.6 7 8.4 5.9 8.4-5.9'],
  regle:['M3 8.5h18v7H3z','M7 8.5v3','M11 8.5v3','M15 8.5v3','M19 8.5v3'],
  calendrier:['M4.5 6h15a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z','M3.5 10.5h17','M8 3.5v4','M16 3.5v4'],
  immeuble:['M4 21V4h9v17','M13 10h7v11','M7 8h2','M7 12h2','M7 16h2','M16 14h1','M16 18h1'],
  etincelle:['M11 3l1.7 4.6L17 9.3l-4.3 1.7L11 15.6 9.3 11 5 9.3l4.3-1.7z','M18 15l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z'],
  eclair:['M13 2 4.8 13.4h5.9L9.8 22 19.2 10.4H13z'],
  train:['M7.5 4h9a3 3 0 0 1 3 3v6.5a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z','M4.5 10h15','M8.6 13.6h.01','M15.4 13.6h.01','M8.5 16.5 6.5 20','M15.5 16.5l2 3.5'],
  note:['M6.5 3h8l4.5 4.5V20a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z','M14.5 3v4.5H19','M9 12.5h6','M9 16h4'],
};

/* Le chasseur qui suit le dossier — affiché en haut de l'espace. */
const AGENT = {
  nom: 'Alexandre Rogelet',
  role: 'Votre conseiller · Emilio Immobilier',
  tel: '06 58 95 76 32',
  telUrl: '+33658957632',
  mail: 'arogelet@emilio-immo.com',
};
function Ico({ n, t = 22 }: { n: string; t?: number }) {
  const d = T[n]; if (!d) return null;
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: '0 0 auto' }}>
      {d.map((x, i) => x.startsWith('c:')
        ? (([cx, cy, r]) => <circle key={i} cx={cx} cy={cy} r={r} />)(x.slice(2).split(','))
        : <path key={i} d={x} />)}
    </svg>
  );
}

/* Échap ferme la couche la plus haute : plein écran, puis pop-up, puis feuille.
   Une petite pile suffit — le dernier inscrit est celui qui répond. */
const PILE_ECHAP: Array<() => void> = [];
function useEchap(actif: boolean, onEchap: () => void) {
  useEffect(() => {
    if (!actif) return;
    PILE_ECHAP.push(onEchap);
    const auClavier = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (PILE_ECHAP[PILE_ECHAP.length - 1] === onEchap) { e.stopPropagation(); onEchap(); }
    };
    window.addEventListener('keydown', auClavier);
    return () => {
      const i = PILE_ECHAP.lastIndexOf(onEchap);
      if (i >= 0) PILE_ECHAP.splice(i, 1);
      window.removeEventListener('keydown', auClavier);
    };
  }, [actif, onEchap]);
}

/* ══ composant ════════════════════════════════════ */
export default function EspaceClient({ token, client, criteres, biens: biensInit, passage, semaine, visites }: Props) {
  const [vue, setVue] = useState('accueil');
  const [biens, setBiens] = useState(biensInit);
  const [crit, setCrit] = useState(criteres);
  const [feuille, setFeuille] = useState<React.ReactNode>(null);
  const [ouvert, setOuvert] = useState(false);
  const [variante, setVariante] = useState('');

  const envoyer = useCallback(async (route: string, corps: Record<string, unknown>) => {
    try {
      const r = await fetch('/api/espace/' + route, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...corps }),
      });
      return await r.json();
    } catch { return { ok: false }; }
  }, [token]);

  const montrer = (n: React.ReactNode, v = '') => { setFeuille(n); setVariante(v); setOuvert(true); };
  const fermer = () => { setOuvert(false); setTimeout(() => { setFeuille(null); setVariante(''); }, 320); };
  const aller = (v: string) => { setVue(v); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const fermerRef = useCallback(() => {
    setOuvert(false);
    setTimeout(() => { setFeuille(null); setVariante(''); }, 320);
  }, []);
  useEchap(ouvert, fermerRef);

  const parEtat = (e: string) => biens.filter(b => b.etat === e);
  const neufs = parEtat('neuf'), vus = parEtat('vu'), donnes = parEtat('avis');
  const [filtreC, setFiltreC] = useState('tout');   // filtre de « Mes derniers biens consultés »

  /* ── ouverture d'une fiche ── */
  function ouvrirBien(b: Bien) {
    if (b.etat === 'neuf') {
      setBiens(l => l.map(x => x.id === b.id ? { ...x, etat: 'vu', vuLe: new Date().toISOString() } : x));
    }
    /* Chaque ouverture compte, pas seulement la première : c'est ce qui dit
       à Alexandre qu'un bien a été rouvert trois fois dans la semaine. */
    envoyer('vue', { bien_id: b.id });
    montrer(<FicheBien b={b} client={client} onFermer={fermer}
      onAvis={enregistrerAvis} onPartager={partagerBien} />, 'fiche');
  }

  async function enregistrerAvis(b: Bien, avis: string, commentaire: string) {
    setBiens(l => l.map(x => x.id === b.id
      ? { ...x, avis, commentaire, etat: 'avis', retourLe: new Date().toISOString() } : x));
    await envoyer('retour', { bien_id: b.id, avis, commentaire });
    montrer(<GrandOk
      titre="C'est noté, merci"
      texte={avis === 'refuse'
        ? "Votre retour part directement dans votre dossier. Les prochaines propositions en tiendront compte pour ne plus vous montrer ce type de bien."
        : avis === 'souhaite_visiter'
          ? "Alexandre est prévenu. Il vous rappelle pour caler la visite."
          : "Alexandre est prévenu. Il va vous en chercher d'autres dans le même esprit."}
      rappel="Chacun de vos retours est relu, et oriente les propositions suivantes."
      onFermer={fermer} />, 'pleine');
  }

  /* Le partage s'ouvre par-dessus la fiche, en pop-up : on ne perd pas le bien
     de vue, et le résultat de l'envoi s'affiche dans la pop-up elle-même. */
  const partagerBien = useCallback(async (b: Bien, mail: string) => {
    const r = await envoyer('partage', { bien_id: b.id, destinataire: mail });
    return !!r?.ok;
  }, [envoyer]);

  /* La présentation s'ouvre une seule fois par appareil. Le petit délai laisse
     la page se poser : elle arrive comme un accueil, pas comme une interruption. */
  const CLE_BIENVENUE = 'emilio_bienvenue';
  const ouvrirBienvenue = useCallback(() => {
    montrer(<Bienvenue client={client} onFermer={() => {
      try { localStorage.setItem(CLE_BIENVENUE, '1'); } catch { /* stockage indisponible */ }
      fermer();
    }} />, 'pleine');
  }, [client]);

  useEffect(() => {
    let deja = true;
    try { deja = localStorage.getItem(CLE_BIENVENUE) === '1'; } catch { deja = false; }
    if (deja) return;
    const t = setTimeout(() => ouvrirBienvenue(), 900);
    return () => clearTimeout(t);
  }, [ouvrirBienvenue]);

  /* Les mails envoyés au client pointent sur /espace/<jeton>?bien=<id> : il
     arrive directement sur le bien dont on lui parle, pas sur l'accueil à
     chercher lequel c'est. On n'ouvre qu'une fois, et on nettoie l'adresse
     pour qu'un rafraîchissement ne rouvre pas la fiche par surprise. */
  const bienOuvert = useRef(false);
  useEffect(() => {
    if (bienOuvert.current) return;
    let vise = '';
    try { vise = new URLSearchParams(window.location.search).get('bien') || ''; } catch { return; }
    if (!vise) return;
    bienOuvert.current = true;
    const cible = biensInit.find(b => b.id === vise);
    try { window.history.replaceState(null, '', window.location.pathname); } catch { /* sans effet */ }
    if (!cible) return;
    const t = setTimeout(() => ouvrirBien(cible), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biensInit]);

  /* « Mes critères ont évolué » ne mène plus directement à l'assistant : on
     demande d'abord au client ce qu'il préfère. Certains veulent corriger un
     chiffre eux-mêmes, d'autres veulent en parler — les deux sont légitimes,
     et lui laisser le choix évite qu'il traverse neuf étapes pour dire une
     chose qui tient en une phrase au téléphone. */
  function ouvrirCriteres() {
    montrer(<ChoixCriteres onFermer={fermer}
      onModifier={ouvrirModifCriteres} onRappel={demanderRappel} />);
  }

  /* Une demande de rappel : le créneau suffit. Le numéro est celui du dossier,
     on ne le redemande pas — ce serait une friction pour rien. */
  async function demanderRappel(creneau: string) {
    const r = await envoyer('rappel', { creneau });
    const quand = creneau === 'matin' ? 'le matin'
      : creneau === 'apres_midi' ? "l'après-midi" : 'en fin de journée';
    if (r && r.ok === false) {
      /* Déjà demandé aujourd'hui, ou envoi qui n'est pas passé : dans les deux
         cas on ne fait pas croire au client que c'est reparti une fois de plus. */
      montrer(<GrandOk titre="Votre demande est déjà partie"
        texte="Votre conseiller en a déjà été prévenu : il vous rappelle. Inutile de redemander, votre demande n'est pas perdue."
        rappel={'Si c\'est urgent, vous pouvez l\'appeler directement au <b>' + AGENT.tel + '</b>.'}
        onFermer={fermer} />, 'pleine');
      return;
    }
    montrer(<GrandOk titre="C'est noté, il vous rappelle"
      texte={"Votre conseiller est prévenu que vous souhaitez être rappelé " + quand
        + ". Il vous appelle sur le numéro de votre dossier."}
      rappel="En attendant, la recherche se poursuit chaque jour sur vos critères actuels."
      onFermer={fermer} />, 'pleine');
  }

  /* Dire que la recherche est finie doit être simple et sans gêne : trois
     réponses, un mot si on veut. Rien ne se ferme ici — le conseiller rappelle
     d'abord, il clôture ensuite. */
  function ouvrirFinRecherche() {
    montrer(<FinRecherche onFermer={fermer} onChoisir={declarerFin} />);
  }

  async function declarerFin(motif: string, mot: string) {
    const r = await envoyer('fin', { motif, mot });
    if (r && r.ok === false) {
      montrer(<GrandOk titre="C'est déjà noté"
        texte="Votre conseiller en a déjà été prévenu. Il vous rappelle pour en parler avec vous — inutile de le signaler à nouveau."
        rappel={'Si c\'est urgent, vous pouvez l\'appeler directement au <b>' + AGENT.tel + '</b>.'}
        onFermer={fermer} />, 'pleine');
      return;
    }
    const suite = motif === 'pause'
      ? "Votre recherche est mise de côté le temps qu'il vous faut. Votre conseiller vous rappelle pour en convenir avec vous, et votre espace reste accessible."
      : "Votre conseiller vous rappelle pour en parler et clôturer votre dossier proprement. Votre espace reste accessible en attendant.";
    montrer(<GrandOk titre={motif === 'pause' ? "C'est noté, on met en pause" : 'Merci de nous avoir prévenus'}
      texte={suite}
      rappel="Rien n'est définitif tant que vous n'en avez pas parlé ensemble."
      onFermer={fermer} />, 'pleine');
  }

  function ouvrirModifCriteres() {
    montrer(<ModifCriteres crit={crit} onFermer={fermer} onEnregistrer={async (nv: Criteres, changements: string[], demandeNote: string) => {
      setCrit(nv);
      await envoyer('criteres', { criteres: nv });
      /* La note est celle du chasseur : le client ne la réécrit pas, il demande. */
      if (demandeNote) await envoyer('message', { texte: 'Demande sur la note de la recherche : ' + demandeNote });
      montrer(<GrandOk titre="C'est enregistré, merci"
        texte="Merci d'avoir pris le temps de mettre à jour vos critères. Votre conseiller en est informé : il les intègre à votre recherche, et les biens qui vous seront proposés à partir de maintenant tiendront compte de ces changements. Si un point mérite d'être précisé de vive voix, il vous rappelle."
        rappel={[
          changements.length ? '<b>Ce qui a changé :</b><br>' + changements.join(' · ') : 'Votre conseiller est prévenu du changement.',
          demandeNote ? 'Votre demande concernant ses précisions lui a également été transmise.' : '',
        ].filter(Boolean).join('<br><br>')}
        onFermer={fermer} />);
    }} />, 'pleine');
  }

  function ouvrirMessage() {
    montrer(<Message onFermer={fermer} onEnvoi={async (texte: string) => {
      await envoyer('message', { texte });
      montrer(<GrandOk titre="Votre message est bien parti"
        texte="Votre conseiller vient d'en être informé. Il le lit et vous recontacte rapidement pour en parler avec vous."
        rappel="En attendant, la recherche se poursuit chaque jour sur vos critères actuels."
        onFermer={fermer} />);
    }} />);
  }

  const maxLues = Math.max(1, ...semaine.map(s => s.lues));

  return (
    <>
      <style>{CSS}</style>

      <div className="chapeau">
        <div className="dedans">
          <div className="marque">
            <span className="motmarque">EMILIO IMMOBILIER</span>
            <span className="confid">Espace privé</span>
          </div>

          <div className="rangee">
            <div className="ident">
              <div className="mono">{(client.prenom[0] || '') + (client.nom[0] || '')}</div>
              <div>
                <h1>{client.prenom} {client.nom}</h1>
                <div className="ref">
                  Dossier {client.reference}{client.jours ? ` · suivi depuis ${client.jours} jours` : ''}
                </div>
              </div>
            </div>

            <div className="agent">
              <div className="agent-id">
                <span className="agent-sur">Suivi par</span>
                <b>{AGENT.nom}</b>
                <span className="agent-role">{AGENT.role}</span>
              </div>
              {/* Sur téléphone, la pastille de veille se glisse sur la même ligne que
                  l'agent : une ligne gagnée sur un écran où tout compte. */}
              {passage?.quand && (
                <div className="veilleligne"><span className="pouls" />
                  {/* un seul bloc de texte : sinon le « gap » du flex écarte chaque mot */}
                  <span>Actualisé {actualiseLe(passage.quand)}</span></div>
              )}
              <div className="agent-act">
                <a className="act" href={'tel:' + AGENT.telUrl}><Ico n="tel" t={15} /><span>Appeler</span></a>
                <a className="act fant" href={'mailto:' + AGENT.mail}><Ico n="mail" t={15} /><span>Écrire</span></a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="page">
        <div className="vue" key={vue}>
          {vue === 'accueil' && (
            <Accueil client={client} crit={crit} neufs={neufs} vus={vus} donnes={donnes}
              passage={passage} semaine={semaine} maxLues={maxLues} aller={aller} visites={visites}
              token={token}
              onBienvenue={ouvrirBienvenue}
              onFin={ouvrirFinRecherche}
              onAide={(c: string) => montrer(<Explication a={AIDES[c]} onFermer={fermer} />, 'pleine')} />
          )}
          {vue === 'neufs' && (
            <Vue icone="etoile" titre="Nouveaux biens pour vous" aller={aller}
              sous={neufs.length
                ? `${neufs.length} bien${neufs.length > 1 ? 's' : ''} retenu${neufs.length > 1 ? 's' : ''} pour vous depuis votre dernière visite, du plus récent au plus ancien. Ouvrez-les, puis dites-moi ce que vous en pensez.`
                : 'Rien de nouveau depuis votre dernière visite. Votre dossier est repris chaque jour, vous n\'êtes pas en attente.'}>
              <Liste biens={neufs} onOuvrir={ouvrirBien}
                vide="Rien de nouveau pour le moment.<br>Nous cherchons pour vous tous les jours : dès qu'un bien correspond à ce que vous voulez, il s'affiche ici." />
              {/* Le détail du travail de la veille n'a de sens que s'il a donné
                  quelque chose. Sinon on dit l'inverse, mais on le dit. */}
              {neufs.length > 0 && !!passage?.lues && (
                <div className="relance" style={{ marginTop: 16 }}><Ico n="loupe" t={18} />
                  <span>Ces biens sont ceux qui ont passé tous vos critères, sur {passage.lues} annonces lues lors du dernier passage.</span>
                </div>
              )}
              {/* « Aucun nouveau bien » ne veut pas dire « aucun bien retenu » :
                  si le dernier passage en a retenu, ils sont simplement déjà ouverts.
                  Dire le contraire serait faux, et le client le verrait tout de suite. */}
              {neufs.length === 0 && !!passage?.lues && (
                <div className="relance" style={{ marginTop: 16 }}><Ico n="loupe" t={18} />
                  {passage.proposees ? (
                    <span>Lors du dernier passage, {passage.lues}{' '}annonces ont été passées en revue
                      sur vos critères et {passage.proposees} bien{passage.proposees > 1 ? 's ont été retenus' : ' a été retenu'}{' '}pour vous.
                      Vous {passage.proposees > 1 ? 'les ' : "l'"}avez déjà ouvert{passage.proposees > 1 ? 's' : ''}&nbsp;:
                      {passage.proposees > 1 ? ' ils vous attendent' : ' il vous attend'} dans «&nbsp;Mes derniers biens consultés&nbsp;».</span>
                  ) : (
                    <span>Lors du dernier passage, {passage.lues}{' '}annonces ont été passées en revue sur vos critères.
                      Aucune n&apos;a passé tous vos critères cette fois-ci&nbsp;— mieux vaut ne rien vous envoyer
                      que de vous faire perdre du temps.</span>
                  )}
                </div>
              )}
            </Vue>
          )}
          {vue === 'consultes' && (() => {
            const ouverts = [...vus, ...donnes];
            const par: Record<string, Bien[]> = {};
            ouverts.forEach(b => { const g = groupeDe(b); (par[g] ||= []).push(b); });
            const visibles = GROUPES.filter(g => (par[g.id] || []).length > 0);
            const montres = filtreC === 'tout' ? visibles : visibles.filter(g => g.id === filtreC);
            return (
            <Vue icone="horloge" titre="Mes derniers biens consultés" aller={aller}
              sous="Tout ce que vous avez déjà ouvert, du plus récent au plus ancien, avec vos retours.">
              {ouverts.length === 0 ? (
                <div className="vide-sec">Vous n&apos;avez encore ouvert aucun bien.<br />Ils se rangeront ici au fur et à mesure, avec vos retours.</div>
              ) : (<>
                <div className="filtres">
                  <button className={'fc' + (filtreC === 'tout' ? ' on' : '')} onClick={() => setFiltreC('tout')}>
                    Tout <i>{ouverts.length}</i>
                  </button>
                  {visibles.map(g => (
                    <button key={g.id} className={'fc' + (filtreC === g.id ? ' on' : '')} onClick={() => setFiltreC(g.id)}>
                      <span className="fe">{g.e}</span>{g.court} <i>{par[g.id].length}</i>
                    </button>
                  ))}
                </div>
                {/* Une catégorie = une carte à sa couleur : titre, explication et
                    biens dans le même cadre. On ne confond plus deux sections. */}
                {montres.map(g => (
                  <div className={'gr-cadre ' + g.ton} key={g.id}>
                    <div className="gr-tete">
                      <span className="ge">{g.e}</span>
                      <h3>{g.titre}</h3>
                      <span className="gn">{par[g.id].length}</span>
                    </div>
                    {g.note && <div className="gr-note">{g.note}</div>}
                    <Liste biens={par[g.id]} onOuvrir={ouvrirBien} vide="" sansEtiq />
                  </div>
                ))}
              </>)}
            </Vue>
            );
          })()}
          {vue === 'marche' && (
            <Marche passage={passage} semaine={semaine} maxLues={maxLues} aller={aller} biens={biens} crit={crit}
              onAide={(c: string) => montrer(<Explication a={AIDES[c]} onFermer={fermer} />, 'pleine')} />
          )}
          {vue === 'recherche' && (
            <Recherche crit={crit} aller={aller} onCriteres={ouvrirCriteres} onMessage={ouvrirMessage} />
          )}
        </div>

        <div className="pied">
          <b>Emilio Immobilier</b><br />
          Numéro de carte professionnelle&nbsp;: CPI 9201 2020 000 045 344<br />
          Chasse immobilière sur mesure · Paris &amp; Hauts-de-Seine
        </div>
      </div>

      <div className={'voile' + (ouvert ? ' on' : '')} onClick={fermer} />
      <div className={'feuille' + (ouvert ? ' on' : '') + (variante ? ' ' + variante : '')}
        role="dialog" aria-modal="true">
        {!variante && <div className="poignee" />}{feuille}
      </div>
    </>
  );
}

/* ══ accueil ══════════════════════════════════════ */
function Accueil({ client, crit, neufs, vus, donnes, passage, semaine, maxLues, aller, onBienvenue, onAide, onFin, visites, token }: any) {
  const dernier = donnes[0] || vus[0];
  return (
    <div className="accueil">
      <div className="col-a">
      {/* Une visite calée passe avant tout le reste : c'est la seule chose de
          cet écran qui a une heure et une date. */}
      {visites?.length > 0 && <ProchaineVisite v={visites[0]} autres={visites.length - 1} token={token} />}

      <div className="bandeau-chiffres">
        <div className="bc"><div className="n or tab"><span className="nv">{neufs.length}<BtnAide cle="decouvrir" onAide={onAide} /></span></div>
          <div className="l">à découvrir</div></div>
        {/* Le total du dossier, pas le dernier passage : ce chiffre ne redescend
            jamais, il dit le travail fourni depuis le début. */}
        <div className="bc"><div className="n tab"><span className="nv">{(passage?.totalLues ?? passage?.lues)?.toLocaleString('fr-FR') ?? '—'}<BtnAide cle="lues" onAide={onAide} /></span></div>
          <div className="l">annonces lues</div></div>
        <div className="bc"><div className="n tab"><span className="nv">{client.jours ?? '—'}<BtnAide cle="jours" onAide={onAide} /></span></div>
          <div className="l">jours de suivi</div></div>
      </div>
      </div>

      <div className="col-b">
      <div className="sep"><span>Votre espace</span><i />
        <button type="button" className="lien-aide" onClick={onBienvenue}>Comment ça marche&nbsp;?</button>
      </div>

      <div className="grille">
        <button className={'case' + (neufs.length ? ' phare' : '')} onClick={() => aller('neufs')}>
          <div className="tete-case">
            <span className="ico"><Ico n="etoile" /></span>
            {!!neufs.length && <span className="badge">{neufs.length}</span>}
          </div>
          <div><h3>Nouveaux biens pour vous</h3>
            <p>{neufs.length ? `${neufs.length} bien${neufs.length > 1 ? 's' : ''} retenu${neufs.length > 1 ? 's' : ''} depuis votre dernière visite` : 'Sélection à jour'}</p></div>
          {neufs.length > 0 && (
            <div className="apercu">
              {neufs.slice(0, 2).map((b: Bien) => (
                <span className="apl" key={b.id}>
                  <span className="pt">{b.photos[0] ? <img src={b.photos[0]} alt="" /> : '▣'}</span>
                  <span className="et"><b>{EUR(b.prix)}</b><i>{b.surface ? b.surface + ' m²' : b.titre.slice(0, 22)}</i></span>
                </span>
              ))}
            </div>
          )}
          <div className="pied-case">
            <span style={{ fontSize: 13, fontWeight: 700 }}>{neufs.length ? 'Les découvrir' : 'Revoir la sélection'}</span>
            <span className="chev"><Ico n="fleche" t={18} /></span></div>
        </button>

        <button className="case" onClick={() => aller('consultes')}>
          <div className="tete-case"><span className="ico"><Ico n="horloge" t={21} /></span>
            {!!(vus.length || donnes.length) && <span className={'badge' + (vus.length ? '' : ' gris')}>{vus.length || donnes.length}</span>}</div>
          <div><h3>Mes derniers biens consultés</h3>
            {vus.length ? (
              /* Une demande d'action ne se met pas en gris clair : elle s'annonce. */
              <span className="alerte-avis">⏳ {vus.length} bien{vus.length > 1 ? 's' : ''} attend{vus.length > 1 ? 'ent' : ''} votre avis</span>
            ) : (
              <p>{donnes.length
                ? `${donnes.length} bien${donnes.length > 1 ? 's' : ''} déjà ouvert${donnes.length > 1 ? 's' : ''}, avec vos retours`
                : 'Vos avis et vos retours'}</p>
            )}</div>
          {/* Un intitulé d'avis tout seul (« Je veux visiter ») ne veut rien dire :
              on dit de quel bien il s'agit et qu'il s'agit de SON retour. */}
          {dernier && (
            <div className="apercu">
              <span className="apl"><span className="pt">▣</span>
                <span className="et"><b>{dernier.avis && ETIQ[dernier.avis]
                  ? `${ETIQ[dernier.avis].e} ${ETIQ[dernier.avis].n}`
                  : 'Votre avis est attendu'}</b></span></span>
              <span className="apl-s">{dernier.avis ? 'Votre dernier retour · ' : 'Dernier bien ouvert · '}{dernier.titre}</span>
            </div>
          )}
          <div className="pied-case"><span /><span className="chev"><Ico n="fleche" t={18} /></span></div>
        </button>

        {/* Ordre de lecture sur mobile : ce sur quoi on agit en tête, côte à
            côte ; ce qu'on consulte en dessous, sur toute la largeur. Le rappel
            des critères et le graphe du marché ont besoin de la ligne entière
            pour rester lisibles — à mi-largeur, leur texte se casse en quatre. */}
        <button className="case large" onClick={() => aller('recherche')}>
          <div className="tete-case"><span className="ico"><Ico n="cible" /></span></div>
          <div><h3>Rappel de ma recherche</h3>
            <p>{crit.budgetMax ? `Jusqu'à ${EUR(crit.budgetMax)}` : 'Budget à préciser'}
              {crit.surfaceMin ? ` · ${crit.surfaceMin} m² minimum` : ''}
              {crit.piecesMin ? ` · ${crit.piecesMin} pièces` : ''}</p></div>
          <div className="pied-case">
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--plume)' }}>Vos critères ont changé&nbsp;? Modifiez-les ici</span>
            <span className="chev"><Ico n="fleche" t={18} /></span></div>
        </button>

        {/* Juste sous le rappel de sa recherche : c'est là qu'on y pense, pas
            tout en bas de page. Le trait pointillé dit que ce n'est pas une
            case comme les autres — on n'y clique pas par hasard. */}
        <button className="fin-recherche" onClick={onFin}>
          <span className="fr-ico">🏁</span>
          <span className="fr-txt">
            <b>Ma recherche est terminée</b>
            <i>Vous avez trouvé&nbsp;? Vous souhaitez faire une pause&nbsp;? Dites-le-nous.</i>
          </span>
          <span className="chev"><Ico n="fleche" t={17} /></span>
        </button>
        <button className="case large" onClick={() => aller('marche')}>
          <div className="tete-case"><span className="ico"><Ico n="graph" t={21} /></span></div>
          <div><h3>Le marché sur vos critères</h3>
            <p>{semaine.reduce((s: number, x: any) => s + x.lues, 0)} annonces lues cette semaine</p></div>
          <div className="apm">
            <div className="apm-t">Annonces lues · 7 derniers jours</div>
            <div className="mini">{semaine.map((d: any, i: number) => (
              <i key={i} className={i === semaine.length - 1 ? 'fort' : ''}
                style={{ height: Math.max(8, d.lues / maxLues * 100) + '%', animationDelay: i * .05 + 's' }} />
            ))}</div>
          </div>
          <div className="pied-case"><span /><span className="chev"><Ico n="fleche" t={18} /></span></div>
        </button>

      </div>

      </div>

      <div className="col-c">
      <div className="sep"><span>Votre conseiller</span><i /></div>
      <div className="chasseur">
        <div className="av">AR</div>
        <div><h4>Alexandre Rogelet</h4><p>Il cherche pour vous au quotidien</p></div>
        <a className="tel" href="tel:0658957632"><Ico n="tel" t={15} /> Appeler</a>
      </div>

      <div className="engage" style={{ marginTop: 12 }}>
        <div className="t">Mon engagement</div>
        <div><span className="k"><Ico n="check" t={15} /></span><span>Une recherche menée chaque jour&nbsp;: les principaux portails immobiliers, notre carnet d&apos;adresses de confrères et de partenaires, et notre base off-market.</span></div>
        <div><span className="k"><Ico n="check" t={15} /></span><span>Tout bien qui passe vos critères arrive ici dans la journée, avant qu&apos;il ne circule.</span></div>
        <div><span className="k"><Ico n="check" t={15} /></span><span>Chacun de vos retours est relu, et oriente les propositions suivantes.</span></div>
      </div>

      <div className="avis-lien" style={{ marginTop: 12 }}><Ico n="lieu" t={16} />
        <span><b style={{ color: 'var(--encre)' }}>Ce lien est le vôtre.</b>{' '}Il vous ouvre votre espace sans mot de passe
          — gardez-le pour vous, ou transmettez-le à votre conjoint ou à un proche qui suit le projet avec vous&nbsp;:
          il verra exactement la même chose.</span></div>
      </div>
    </div>
  );
}

/* ══ briques de vue ═══════════════════════════════ */
function Vue({ icone, titre, sous, aller, children }: any) {
  return (
    <>
      <button className="retour" onClick={() => aller('accueil')}><Ico n="retour" t={17} /> Retour à l&apos;accueil</button>
      <div>
        <div className="tete-vue"><span className="ico"><Ico n={icone} /></span><h2>{titre}</h2></div>
        {sous && <p className="sous-vue">{sous}</p>}
      </div>
      {children}
    </>
  );
}

/* `sansEtiq` : dans « Mes derniers biens consultés », la catégorie est déjà
   écrite en grand au-dessus du groupe. La répéter sur chaque carte fait doublon. */
function Liste({ biens, onOuvrir, vide, sansEtiq }: { biens: Bien[]; onOuvrir: (b: Bien) => void; vide: string; sansEtiq?: boolean }) {
  if (!biens.length) return vide ? <div className="vide-sec" dangerouslySetInnerHTML={{ __html: vide }} /> : null;
  return (
    <div className="liste">
      {biens.map(b => {
        const a = b.avis ? ETIQ[b.avis] : null;
        /* Une carte en hauteur : la bande de photos, puis le titre, puis le
             prix, puis le commentaire. L'ancienne grille « vignette | texte »
             s'étirait dès qu'un commentaire s'ajoutait, et la vignette flottait
             au milieu d'un grand vide blanc. */
          const vues = (b.photos || []).slice(0, 3);
          const cases = vues.length ? vues : [null];
          return (
          <button key={b.id} className={'bien' + (b.etat === 'neuf' ? ' neuf' : '')} onClick={() => onOuvrir(b)}>
            <span className={'bande-ph n' + cases.length}>
              {cases.map((ph, i) => (
                <span className="ph" key={i}>
                  {ph ? <img src={ph} alt="" /> : <span className="ph-vide">▣</span>}
                </span>
              ))}
            </span>
            <span className="corps-bien">
              <span className="haut-bien">
                {sansEtiq ? null : b.etat === 'neuf'
                  ? <span className="etiq neuf">Nouveau</span>
                  : b.etat === 'avis' && a
                    ? <span className={'etiq ' + a.c}>{a.e} {a.n}</span>
                    : <span className="etiq vu">Vu</span>}
                <span className="dat">{depuis(b.envoyeLe)}</span>
                <span className="fleche"><Ico n="fleche" t={18} /></span>
              </span>
              <h4>{b.titre}</h4>
              <span className="meta">{[
                b.surface && b.surface + ' m²', b.pieces && b.pieces + ' pièces',
                b.chambres && b.chambres + ' chambres', b.secteur,
              ].filter(Boolean).join(' · ')}</span>
              <span className="prix tab">{EUR(b.prix)}</span>
              {b.etat === 'avis' && b.commentaire && (
                /* Ce que le client a écrit lui appartient : on l'annonce et on le
                   rend lisible, au lieu d'une ligne grise en italique tout en bas. */
                <span className={'mon-com ' + (a ? a.c : '')}>
                  <span className="mc-t">{b.retourPar === 'conseiller'
                    ? 'Noté par votre conseiller' : 'Votre commentaire'}</span>
                  <span className="mc-c">« {b.commentaire} »</span>
                </span>
              )}
            </span>
          </button>
          );
      })}
    </div>
  );
}

function Marche({ passage, semaine, maxLues, aller, biens, crit, onAide }: any) {
  const total = semaine.reduce((s: number, x: any) => s + x.lues, 0);
  const lues = passage?.totalLues ?? 0;
  /* Le nombre de biens retenus, c'est le nombre de biens posés dans l'espace,
     point. Pas le compteur interne de la veille : les deux se mettent à
     diverger dès qu'un bien est ajouté à la main, et le client se retrouvait
     avec deux chiffres différents sur la même page. */
  const ret = (biens || []).length;
  /* Les écartées se déduisent, elles ne se lisent pas : un second compteur
     finirait par ne plus tomber juste avec les deux autres, et le client
     verrait trois nombres qui ne s'additionnent pas. */
  const ecart = Math.max(0, lues - ret);
  const sur = ret > 0 ? Math.round(lues / ret) : 0;

  const avecPrix = (biens || []).filter((b: Bien) => b.prix && b.prix > 0);
  const prix = avecPrix.map((b: Bien) => b.prix as number).sort((a: number, z: number) => a - z);
  const auM2 = avecPrix.filter((b: Bien) => b.surface && b.surface > 0)
    .map((b: Bien) => Math.round((b.prix as number) / (b.surface as number)));
  const moyM2 = auM2.length ? Math.round(auM2.reduce((t: number, x: number) => t + x, 0) / auM2.length) : 0;
  const bmax = crit?.budgetMax || 0;
  const sous = bmax ? prix.filter((x: number) => x <= bmax).length : 0;

  return (
    <Vue icone="graph" titre="Le marché sur vos critères" aller={aller}>
      <div className="intro-m">
        <span className="im-i"><Ico n="loupe" t={18} /></span>
        <span>Chaque jour, nous parcourons ce qui sort sur vos secteurs et dans votre budget&nbsp;:
          portails immobiliers, confrères et partenaires, base off-market. Voici ce que ça donne.</span>
      </div>

      {/* ── Le travail depuis l'ouverture ── */}
      {lues > 0 && (
        <div className="gr-cadre c-net">
          <div className="gr-tete">
            <span className="ge or"><Ico n="loupe" t={16} /></span>
            <h3>Le travail depuis l&apos;ouverture</h3>
          </div>
          <div className="tuiles">
            <div className="tu">
              <span className="tu-i"><Ico n="note" t={19} /></span>
              <span className="tu-c">
                <b className="tab"><span className="nv">{lues.toLocaleString('fr-FR')}<BtnAide cle="lues" onAide={onAide} /></span></b>
                <span>annonce{lues > 1 ? 's' : ''} lue{lues > 1 ? 's' : ''} pour vous</span></span></div>
            <div className="tu gris">
              <span className="tu-i"><Ico n="croix" t={19} /></span>
              <span className="tu-c">
                <b className="tab"><span className="nv">{ecart.toLocaleString('fr-FR')}<BtnAide cle="ecartees" onAide={onAide} /></span></b>
                <span>écartée{ecart > 1 ? 's' : ''} avant vous</span></span></div>
            <div className="tu or">
              <span className="tu-i"><Ico n="etoile" t={19} /></span>
              <span className="tu-c">
                <b className="tab"><span className="nv">{ret.toLocaleString('fr-FR')}<BtnAide cle="retenus" onAide={onAide} /></span></b>
                <span>bien{ret > 1 ? 's' : ''} retenu{ret > 1 ? 's' : ''} pour vous</span></span></div>
          </div>
          {sur > 1 && (
            <div className="gr-note">
              <span>Les trois chiffres s&apos;additionnent&nbsp;:{' '}
                <b>{lues.toLocaleString('fr-FR')}</b>{' '}annonces lues,{' '}
                <b>{ecart.toLocaleString('fr-FR')}</b>{' '}qui ne vous correspondaient pas,{' '}
                <b>{ret.toLocaleString('fr-FR')}</b>{' '}
                déposée{ret > 1 ? 's' : ''} dans votre espace. Soit{' '}
                <b>une annonce retenue sur {sur.toLocaleString('fr-FR')}</b>.</span>
            </div>
          )}
        </div>
      )}

      {/* ── La dernière recherche ── */}
      <div className="gr-cadre c-net">
        <div className="gr-tete">
          <span className="ge"><Ico n="cible" t={16} /></span>
          <h3>La dernière recherche</h3>
          {passage?.quand && <span className="gn">{depuis(passage.quand)}</span>}
        </div>
        <div className="entonnoir">
          {(() => {
            const l = passage?.lues ?? 0;
            const ec = passage?.ecartees ?? 0;
            const re = passage?.proposees ?? 0;
            const pc = (n: number) => (l ? Math.max(5, Math.round((n / l) * 100)) : 0);
            return (
              <>
                <div className="ent">
                  <div className="ent-h"><b className="tab">{l || '—'}</b>
                    <span>annonce{l > 1 ? 's' : ''} lue{l > 1 ? 's' : ''} lors de cette recherche</span></div>
                  <div className="ent-b"><i style={{ width: '100%' }} /></div>
                </div>
                <div className="ent">
                  <div className="ent-h"><b className="tab pale">{ec || '—'}</b>
                    <span className="nv-l">écartée{ec > 1 ? 's' : ''}<BtnAide cle="ecartees" onAide={onAide} /></span></div>
                  <div className="ent-b"><i className="pale" style={{ width: pc(ec) + '%' }} /></div>
                </div>
                <div className="ent">
                  <div className="ent-h"><b className="tab or">{re || '—'}</b>
                    <span className="or">retenue{re > 1 ? 's' : ''} ce jour-là, et ajoutée{re > 1 ? 's' : ''} à votre espace</span></div>
                  <div className="ent-b"><i className="or" style={{ width: pc(re) + '%' }} /></div>
                </div>
              </>
            );
          })()}
        </div>
        <div className="gr-note">
          {/* Une ligne, pas un paragraphe : le détail est derrière le « ? » de
              « écartées », juste au-dessus. La page se lit d'un coup d'œil. */}
          <span>Vos critères guident la recherche, ils ne l&apos;enferment pas&nbsp;: il nous arrive
            d&apos;aller au-delà quand un bien le mérite.</span>
        </div>
      </div>

      {/* ── Les biens retenus ── */}
      {prix.length >= 2 && (
        <div className="gr-cadre c-net">
          <div className="gr-tete">
            <span className="ge"><Ico n="maison" t={16} /></span>
            <h3>Les biens retenus pour vous</h3>
            <span className="gn">{ret}</span>
          </div>
          <div className="tuiles">
            <div className="tu">
              <span className="tu-i"><Ico n="euro" t={19} /></span>
              <span className="tu-c"><b className="tab">{EUR(prix[0])}</b><span>le moins cher</span></span></div>
            <div className="tu">
              <span className="tu-i"><Ico n="euro" t={19} /></span>
              <span className="tu-c"><b className="tab">{EUR(prix[prix.length - 1])}</b><span>le plus cher</span></span></div>
            {moyM2 > 0 && (
              <div className="tu">
                <span className="tu-i"><Ico n="regle" t={19} /></span>
                <span className="tu-c">
                  <b className="tab"><span className="nv">{moyM2.toLocaleString('fr-FR')} €<BtnAide cle="m2" onAide={onAide} /></span></b>
                  <span>du m² en moyenne</span></span></div>
            )}
          </div>
          <div className="gr-note">
            <span>Ces trois chiffres viennent des biens déposés dans votre espace, et sont recalculés
              à chaque nouveau bien&nbsp;: ils ne peuvent pas être périmés.
              {bmax > 0 && (sous === prix.length
                ? <> Tous tiennent dans votre budget de <b>{EUR(bmax)}</b>.</>
                : <> <b>{sous} sur {prix.length}</b> tiennent dans votre budget de {EUR(bmax)}&nbsp;; les autres
                  vous ont été montrés parce qu&apos;ils le valaient.</>)}</span>
          </div>
        </div>
      )}

      {/* ── Le rythme ── */}
      <div className="gr-cadre c-net">
        <div className="gr-tete">
          <span className="ge"><Ico n="calendrier" t={16} /></span>
          <h3>Jour après jour</h3>
          <BtnAide cle="rythme" onAide={onAide} />
        </div>
        {semaine.length > 1 ? (
          <>
            <div className="gr-note"><span><b>{total.toLocaleString('fr-FR')} annonces</b>{' '}parcourues
              sur les {semaine.length}{' '}derniers jours de recherche. Chaque barre, c&apos;est ce que nous avons
              regardé ce jour-là sur vos secteurs et votre budget&nbsp;; la dorée est celle
              d&apos;aujourd&apos;hui.</span></div>
            <div className="barres">
              {semaine.map((d: any, i: number) => {
                const j = d.quand ? JOURS[new Date(d.quand).getDay()] : '·';
                return (
                  <span className={'barre' + (i === semaine.length - 1 ? ' auj' : '')} key={i}>
                    <b>{d.lues || '—'}</b>
                    <i style={{ height: Math.max(4, (d.lues / maxLues) * 100) + '%', animationDelay: i * 0.06 + 's' }} />
                    <span>{j}</span>
                  </span>
                );
              })}
            </div>
          </>
        ) : (
          /* Une section vide inquiète plus qu'elle n'informe : on dit pourquoi. */
          <div className="vide-doux">
            <span className="vd-i"><Ico n="graph" t={26} /></span>
            <b>Le graphique arrive à la deuxième recherche</b>
            <span>Il faut au moins deux journées de recherche pour dessiner une courbe.
              Revenez demain&nbsp;: vous verrez ici, jour par jour, combien d&apos;annonces ont été
              parcourues pour vous.</span>
          </div>
        )}
      </div>
    </Vue>
  );
}

/* La phrase du haut : seulement ce qui est renseigné, dans l'ordre où on le
   dirait à l'oral. Rien n'est inventé, et ce qui manque ne se dit pas —
   « surface non précisée » n'apprend rien au client. */
const ARTICLE_TYPE: Record<string, string> = {
  appartement: 'un', maison: 'une', loft: 'un', duplex: 'un', terrain: 'un', autre: 'un',
};
/* « Un appartement ou une maison » : chaque type garde son article, et le
   premier prend la majuscule. Un type inconnu du CRM passe au masculin
   plutôt que de disparaître de la phrase. */
function listeTypes(types: string[]): string {
  const bouts = types.map((x, i) => {
    const n = x.toLowerCase();
    const art = ARTICLE_TYPE[n] || 'un';
    return (i === 0 ? art.charAt(0).toUpperCase() + art.slice(1) : art) + ' ' + n;
  });
  if (bouts.length === 1) return bouts[0];
  return bouts.slice(0, -1).join(', ') + ' ou ' + bouts[bouts.length - 1];
}

function morceauxResume(crit: any, villes: { ville: string }[]) {
  const m: { t: string; fort?: boolean }[] = [];
  const types: string[] = crit.typesBien?.length ? crit.typesBien
    : (crit.typeBien ? [crit.typeBien] : []);
  m.push({ t: types.length ? listeTypes(types) : 'Un bien' });
  if (crit.surfaceMin) {
    m.push({ t: " d'au moins " });
    m.push({ t: `${crit.surfaceMin} m²`, fort: true });
  }
  if (crit.chambresMin) {
    m.push({ t: ' avec ' });
    m.push({ t: `${crit.chambresMin} chambre${crit.chambresMin > 1 ? 's' : ''}`, fort: true });
  }
  if (villes.length) {
    const courts = villes.map(v => v.ville.replace(/-sur-Seine$/i, '').replace(/-Billancourt$/i, ''));
    m.push({ t: ', à ' });
    m.push({
      t: courts.length <= 2 ? courts.join(' ou ')
        : `${courts[0]}, ${courts[1]} et ${courts.length - 2} autre${courts.length > 3 ? 's' : ''}`,
      fort: true,
    });
  }
  if (crit.budgetMax) {
    m.push({ t: crit.budgetMin ? ', entre ' : ", jusqu'à " });
    if (crit.budgetMin) { m.push({ t: EUR(crit.budgetMin), fort: true }); m.push({ t: ' et ' }); }
    m.push({ t: EUR(crit.budgetMax), fort: true });
  }
  m.push({ t: '.' });
  return m;
}

function Recherche({ crit, aller, onCriteres, onMessage }: any) {
  /* On n'invente rien : s'il n'y a pas de minimum, on écrit « jusqu'à ». */
  const bmin: number | null = crit.budgetMin || null;
  const bmax: number | null = crit.budgetMax || null;
  const ex: Record<string, string> = crit.exigences || {};
  const expos: string[] = (crit.exposition || '').split(',').map((x: string) => x.trim()).filter(Boolean);
  const types: string[] = crit.typesBien?.length ? crit.typesBien : (crit.typeBien ? [crit.typeBien] : []);
  const iDpe = crit.dpeMax ? LETTRES_DPE.indexOf(crit.dpeMax) : -1;

  /* Les équipements retenus, dans l'ordre du CRM, avec leur niveau. */
  const equips: { texte: string; fort: boolean }[] = [];
  EQUIP_E.forEach(([cle, lib, ico]) => {
    if (crit.equip.includes(lib) || ex[cle]) equips.push({ texte: `${ico} ${lib}`, fort: ex[cle] === 'indispensable' });
  });
  if (ex.exterieur) equips.push({ texte: `🌤️ Extérieur${crit.exterieurSurfaceMin ? ` de ${crit.exterieurSurfaceMin} m² mini` : ''}`, fort: ex.exterieur === 'indispensable' });
  if (crit.cuisineType) equips.push({ texte: `🍳 Cuisine ${crit.cuisineType === 'ouverte' ? 'ouverte' : 'séparée'}`, fort: ex.cuisine === 'indispensable' });

  const etage = [
    crit.etageMin ? `à partir du ${crit.etageMin}e` : '',
    crit.etageMax ? `jusqu'au ${crit.etageMax}e` : '',
    crit.rdcExclu ? 'pas de rez-de-chaussée' : '',
    crit.dernierEtage ? 'dernier étage recherché' : '',
    crit.etageMaxSansAscenseur ? `${crit.etageMaxSansAscenseur}e maximum sans ascenseur` : '',
  ].filter(Boolean);

  const aQuelqueChose = types.length || crit.etatSouhaite || crit.anneeMin;
  const villesResume = grouperSecteurs(crit.secteurs || []);

  return (
    <Vue icone="cible" titre="Rappel de ma recherche" aller={aller}
      sous="Ce qu'Alexandre a noté de votre projet, catégorie par catégorie. Vous pouvez le faire évoluer vous-même à tout moment.">

      {/* 0 — Le rappel en une phrase, avant le détail catégorie par catégorie. */}
      <div className="resume-r">
        <div className="resume-k"><i /> En une phrase</div>
        <p className="resume-p">
          {morceauxResume(crit, villesResume).map((x, i) => x.fort
            ? <b key={i}>{x.t}</b>
            : <span key={i}>{x.t}</span>)}
        </p>
      </div>

      {/* 1 — Le bien recherché */}
      {aQuelqueChose ? (
        <CatE ico="maison" titre="Le bien recherché" sous="type et état">
          {types.length ? <div className="pastilles">{types.map((t: string) => <span className="past or" key={t}>{ICONE_TYPE[t] ? ICONE_TYPE[t] + ' ' : ''}{t}</span>)}</div> : null}
          {(crit.etatSouhaite || crit.anneeMin) && (
            <div className="faits">
              {crit.etatSouhaite && <Fait ico={ETATS_E.find(x => x[0] === crit.etatSouhaite)?.[2] || '✨'} lib="État souhaité" val={(ETATS_E.find(x => x[0] === crit.etatSouhaite)?.[1]) || crit.etatSouhaite} />}
              {crit.anneeMin ? <Fait ico="📅" lib="Construit après" val={<span className="tab">{crit.anneeMin}</span>} /> : null}
            </div>
          )}
        </CatE>
      ) : null}

      {/* 2 — Surfaces & volumes */}
      <CatE ico="regle" titre="Surfaces & volumes" sous="la taille du bien">
        <div className="trio">
          <div className="mini-t"><div className="v tab">{crit.surfaceMin ? crit.surfaceMin + ' m²' : '—'}</div><div className="l">surface min.</div></div>
          <div className="mini-t"><div className="v tab">{crit.piecesMin ?? '—'}</div><div className="l">pièces min.</div></div>
          <div className="mini-t"><div className="v tab">{crit.chambresMin ?? '—'}</div><div className="l">chambres min.</div></div>
        </div>
        {(crit.surfaceMax || crit.surfaceSejourMin || crit.piecesMax) && (
          <div className="faits">
            {crit.surfaceMax ? <Fait ico="📏" lib="Surface maximum" val={<span className="tab">{crit.surfaceMax} m²</span>} /> : null}
            {crit.piecesMax ? <Fait ico="🚪" lib="Pièces maximum" val={<span className="tab">{crit.piecesMax}</span>} /> : null}
            {crit.surfaceSejourMin ? <Fait ico="🛋️" lib="Séjour d’au moins" val={<span className="tab">{crit.surfaceSejourMin} m²</span>} /> : null}
          </div>
        )}
      </CatE>

      {/* 3 — Étage & exposition */}
      {(etage.length || expos.length) ? (
        <CatE ico="immeuble" titre="Étage & exposition" sous="où se trouve le bien dans l'immeuble">
          {etage.length ? <div className="pastilles">{etage.map(e => <span className="past" key={e}>{e}</span>)}</div> : null}
          {expos.length ? (
            <div style={{ marginTop: etage.length ? 12 : 0 }}>
              <div className="ss-t">Exposition souhaitée</div>
              <div className="pastilles">{expos.map(e => {
                const t = EXPO_E.find(x => x[0] === e);
                return <span className="past or" key={e}>{t ? `${t[2]} ${t[1]}` : e}</span>;
              })}</div>
            </div>
          ) : null}
        </CatE>
      ) : null}

      {/* 4 — Équipements */}
      {equips.length ? (
        <CatE ico="etincelle" titre="Équipements" sous="ce qui compte pour vous">
          <div className="pastilles">{equips.map(e => <PastilleE key={e.texte} texte={e.texte} fort={e.fort} />)}</div>
          {equips.some(e => e.fort) && <div className="note-cat">Ce qui est marqué <b>indispensable</b> n&apos;est jamais mis de côté : un bien qui ne l&apos;a pas ne vous est pas présenté.</div>}
        </CatE>
      ) : null}

      {/* 5 — Performance énergétique */}
      {crit.dpeMax ? (
        <CatE ico="eclair" titre="Performance énergétique" sous="la plus mauvaise lettre acceptée">
          <div className="dpe-r">{LETTRES_DPE.map((d, i) => (
            <span key={d} className={'dpe-l' + (i <= iDpe ? ' ok' : '') + (d === crit.dpeMax ? ' pt' : '')}>{d}</span>
          ))}</div>
          <div className="note-cat">Vous gardez <b>{LETTRES_DPE.slice(0, iDpe + 1).join(' ')}</b>{iDpe < 6 ? <> — les logements classés {LETTRES_DPE.slice(iDpe + 1).join(' ')} sont écartés.</> : '.'}</div>
        </CatE>
      ) : null}

      {/* 6 — Où je cherche */}
      {!!crit.secteurs.length && (
        <CatE ico="lieu" titre="Où je cherche" sous="vos communes et quartiers">
          <div className="villes">
            {grouperSecteurs(crit.secteurs).map(v => (
              <div className="ville" key={v.ville}>
                <div className="ville-n"><span className="ville-i"><Ico n="lieu" t={16} /></span>{v.ville}</div>
                {v.quartiers.length
                  ? <div className="pastilles">{v.quartiers.map(q => <span className="past" key={q}>{q}</span>)}</div>
                  : <div className="ville-tout">Toute la ville</div>}
              </div>
            ))}
          </div>
        </CatE>
      )}

      {/* 7 — Transports */}
      {crit.transportArrets?.length ? (
        <CatE ico="train" titre="Transports" sous="vos arrêts et le temps à pied">
          <div className="arrets-v">
            {crit.transportArrets.map((a: Arret, i: number) => (
              <div className="arret-v" key={a.nom + i}>
                <div className="arret-n">{a.nom}
                  <span className="arret-m">à moins de {a.minutes || 10} min à pied</span></div>
                <div className="pastilles" style={{ marginTop: 8, alignItems: 'center' }}>
                  {a.lignes.map(l => <PastilleArret id={l} key={l} t={24} />)}
                </div>
              </div>
            ))}
          </div>
        </CatE>
      ) : crit.transportMinutes ? (
        <CatE ico="train" titre="Transports" sous="temps à pied maximum">
          <div className="gros tab">{crit.transportMinutes} <small>minutes à pied maximum d&apos;une station</small></div>
        </CatE>
      ) : null}

      {/* 8 — Budget */}
      <CatE ico="euro" titre="Budget" sous="votre enveloppe">
        <div className="gros tab">
          {bmin && bmax ? <>{EUR(bmin)} <small>à</small> {EUR(bmax)}</>
            : bmax ? <><small>Jusqu&apos;à</small> {EUR(bmax)}</>
              : bmin ? <><small>À partir de</small> {EUR(bmin)}</>
                : <small>À préciser ensemble</small>}
        </div>
        {(crit.apport || crit.financement) && (
          <div className="faits">
            {crit.apport ? <Fait ico="🏦" lib="Apport" val={<span className="tab">{EUR(crit.apport)}</span>} /> : null}
            {crit.financement && <Fait ico={FINANCEMENTS_E.find(x => x[0] === crit.financement)?.[2] || '💳'} lib="Financement" val={(FINANCEMENTS_E.find(x => x[0] === crit.financement)?.[1]) || crit.financement} />}
          </div>
        )}
      </CatE>

      {/* 9 — Mon projet + la note d'Alexandre, en lecture seule */}
      <CatE ico="note" titre="Mon projet" sous="échéance et précisions">
        {crit.urgence && (
          <div className="faits">
            <Fait ico={URGENCES_E.find(x => x[0] === crit.urgence)?.[2] || '⏱️'} lib="Échéance souhaitée" val={(URGENCES_E.find(x => x[0] === crit.urgence)?.[1]) || crit.urgence} />
          </div>
        )}
        <div className="precisions" style={{ marginTop: crit.urgence ? 14 : 4 }}>
          <div className="k">
            <span><Ico n="crayon" t={13} /> Précisions sur votre recherche</span>
            <span className="cadenas"><Ico n="verrou" t={11} /> Noté par Alexandre</span>
          </div>
          <blockquote className="corps">{crit.notes || 'Aucune précision notée pour l’instant.'}</blockquote>
          <button className="cta-prec" onClick={onMessage}>
            <span><b>Une précision à ajouter ou à retirer&nbsp;?</b>
              <span className="s">Dites-le-lui, il met à jour et vous recontacte.</span></span>
            <span className="chev"><Ico n="fleche" t={18} /></span>
          </button>
        </div>
      </CatE>

      <div className="duo"><button className="btn or" onClick={onCriteres}><Ico n="crayon" t={16} /> Mes critères ont évolué</button></div>
    </Vue>
  );
}
/* Où chercher — une carte par ville, ses quartiers en dessous.
   Même format et mêmes listes que le CRM (src/lib/secteurs.ts) : ce que le
   client coche ici est directement relisible par la chasse. */
function Localisation({ secteurs, onChange }: { secteurs: string[]; onChange: (s: string[]) => void }) {
  const [q, setQ] = useState('');
  const [sug, setSug] = useState<CpSuggestion[]>([]);
  const [libre, setLibre] = useState<Record<string, string>>({});
  const villes = grouperSecteurs(secteurs);

  const chercher = async (v: string) => {
    setQ(v);
    if (v.trim().length < 2) { setSug([]); return; }
    try { setSug((await searchCommune(v)).slice(0, 6)); } catch { setSug([]); }
  };

  /* On réécrit d'un bloc les entrées d'une ville : aucun quartier coché
     signifie « toute la ville ». */
  const majVille = (ville: string, quartiers: string[]) => {
    const autres = secteurs.filter(x => normVille(lireSecteur(x).ville) !== normVille(ville));
    const neufs = quartiers.length ? quartiers.map(x => `${x} (${ville})`) : [ville];
    onChange([...autres, ...neufs].slice(0, 20));
  };
  const retirerVille = (ville: string) =>
    onChange(secteurs.filter(x => normVille(lireSecteur(x).ville) !== normVille(ville)));
  const ajouterVille = (ville: string) => {
    setQ(''); setSug([]);
    if (villes.some(v => normVille(v.ville) === normVille(ville))) return;
    onChange([...secteurs, ville].slice(0, 20));
  };

  return (
    <div className="loc">
      {villes.map(v => {
        const cp = cpDeVille(v.ville);
        const proposes = cp ? QUARTIERS[cp].quartiers : [];
        const tous = [...proposes];
        for (const qt of v.quartiers) if (!tous.some(x => normVille(x) === normVille(qt))) tous.push(qt);
        const coche = (qt: string) => v.quartiers.some(x => normVille(x) === normVille(qt));
        return (
          <div className="loc-ville" key={v.ville}>
            <div className="loc-tete">
              <span className="loc-n">{v.ville}{cp ? <em> · {cp}</em> : null}</span>
              <button type="button" className="loc-x" onClick={() => retirerVille(v.ville)}
                aria-label={`Retirer ${v.ville}`}><Ico n="croix" t={12} /> Retirer</button>
            </div>

            <div className="choix">
              <button type="button" className="ch" aria-pressed={v.quartiers.length === 0}
                onClick={() => majVille(v.ville, [])}>Toute la ville</button>
              {tous.map(qt => (
                <button type="button" key={qt} className="ch" aria-pressed={coche(qt)}
                  onClick={() => majVille(v.ville, coche(qt)
                    ? v.quartiers.filter(x => normVille(x) !== normVille(qt))
                    : [...v.quartiers, qt])}>{qt}</button>
              ))}
            </div>

            <div className="loc-ajout">
              <input value={libre[v.ville] || ''} placeholder={`Autre quartier de ${v.ville}…`}
                onChange={e => setLibre(l => ({ ...l, [v.ville]: e.target.value }))}
                onKeyDown={e => {
                  const val = (libre[v.ville] || '').trim();
                  if (e.key === 'Enter' && val) {
                    e.preventDefault();
                    majVille(v.ville, [...v.quartiers, val]);
                    setLibre(l => ({ ...l, [v.ville]: '' }));
                  }
                }} />
              <button type="button" className="loc-plus" onClick={() => {
                const val = (libre[v.ville] || '').trim();
                if (!val) return;
                majVille(v.ville, [...v.quartiers, val]);
                setLibre(l => ({ ...l, [v.ville]: '' }));
              }}>Ajouter</button>
            </div>
          </div>
        );
      })}

      <div className="loc-ville loc-neuve">
        <div className="loc-n2">Ajouter une ville</div>
        <div className="loc-rech">
          <input value={q} onChange={e => chercher(e.target.value)}
            placeholder="Code postal ou nom de ville — ex. 92200, Neuilly…" />
          {!!sug.length && (
            <div className="loc-sug">
              {sug.map((x, i) => (
                <button type="button" key={x.cp + i} onClick={() => ajouterVille(QUARTIERS[x.cp]?.ville || x.ville)}>
                  <b>{x.cp}</b> {QUARTIERS[x.cp]?.ville || x.ville}
                  {QUARTIERS[x.cp] ? <em>quartiers proposés</em> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══ galerie photos ═══════════════════════════════ */
/* Le défilement est natif (scroll-snap) : c'est le seul qui se comporte
   correctement au doigt sur iOS comme sur Android. L'index suit la
   position réelle de la bande, jamais l'inverse. */
function Galerie({ photos, onAgrandir }: { photos: string[]; onAgrandir: (n: number) => void }) {
  const bande = useRef<HTMLDivElement | null>(null);
  const depart = useRef<{ x: number; y: number } | null>(null);
  const [i, setI] = useState(0);

  const surDefilement = () => {
    const el = bande.current;
    if (!el) return;
    const un = el.firstElementChild as HTMLElement | null;
    const l = un?.clientWidth || el.clientWidth;
    if (!l) return;
    const n = Math.max(0, Math.min(photos.length - 1, Math.round(el.scrollLeft / l)));
    setI((v) => (v === n ? v : n));
  };
  const versPhoto = (n: number) => {
    const el = bande.current;
    if (!el) return;
    const c = el.children[n] as HTMLElement | undefined;
    el.scrollTo({ left: c ? c.offsetLeft : 0, behavior: 'smooth' });
  };

  if (!photos.length) {
    return <div className="photo-h"><span style={{ fontSize: 30 }}>▣</span></div>;
  }

  return (
    <div className="galerie">
      <div className="bande" ref={bande} onScroll={surDefilement}>
        {photos.map((p, n) => (
          <button
            type="button" className="photo-g" key={n}
            aria-label={`Agrandir la photo ${n + 1}`}
            onPointerDown={(e) => { depart.current = { x: e.clientX, y: e.clientY }; }}
            onClick={(e) => {
              // un glissement n'est pas un clic
              const d = depart.current;
              if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 12) return;
              onAgrandir(n);
            }}
          >
            <img src={p} alt="" loading={n < 2 ? 'eager' : 'lazy'} draggable={false} />
          </button>
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <button type="button" className="fl g" aria-label="Photo précédente"
            onClick={() => versPhoto(Math.max(0, i - 1))}><Ico n="retour" t={18} /></button>
          <button type="button" className="fl d" aria-label="Photo suivante"
            onClick={() => versPhoto(Math.min(photos.length - 1, i + 1))}><Ico n="fleche" t={18} /></button>
          <div className="compteur tab"><Ico n="loupe" t={12} />{i + 1}/{photos.length}</div>
          {photos.length <= 8 && (
            <div className="points">{photos.map((_, n) => (
              <button type="button" key={n} onClick={() => versPhoto(n)}
                className={n === i ? 'on' : ''} aria-label={`Photo ${n + 1}`} />
            ))}</div>
          )}
        </>
      )}
    </div>
  );
}

/* Plein écran — rendu dans <body> par portail : la feuille porte un
   transform, et un position:fixed à l'intérieur s'y trouverait enfermé.
   La bande est posée en absolu (inset:0) plutôt qu'en flex:1 — sur iOS
   un flex:1 dans un conteneur fixed peut se résoudre à zéro, et on se
   retrouve avec un écran noir qui ne défile pas. */
function PleinEcran({ photos, depart, onFermer }: { photos: string[]; depart: number; onFermer: () => void }) {
  const bande = useRef<HTMLDivElement | null>(null);
  const cases = useRef<(HTMLDivElement | null)[]>([]);
  const [i, setI] = useState(depart);

  // On se place AVANT la peinture, et par scrollIntoView : poser un
  // scrollLeft à la main se fait ré-aligner par le scroll-snap de Safari.
  useLayoutEffect(() => {
    const el = cases.current[depart];
    if (el) el.scrollIntoView({ inline: 'center', block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEchap(true, onFermer);

  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') cases.current[Math.min(i + 1, photos.length - 1)]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      if (e.key === 'ArrowLeft') cases.current[Math.max(i - 1, 0)]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    };
    window.addEventListener('keydown', auClavier);
    return () => window.removeEventListener('keydown', auClavier);
  }, [i, photos.length]);

  const surDefilement = () => {
    const el = bande.current;
    if (!el || !el.clientWidth) return;
    const n = Math.max(0, Math.min(photos.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
    setI((v) => (v === n ? v : n));
  };

  return createPortal(
    <div className="plein" role="dialog" aria-modal="true">
      <div className="bande-pe" ref={bande} onScroll={surDefilement}>
        {photos.map((p, n) => (
          <div className="photo-pe" key={n} ref={(el) => { cases.current[n] = el; }}>
            <img src={p} alt="" draggable={false} />
          </div>
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <button type="button" className="fl g" aria-label="Photo précédente"
            onClick={() => cases.current[Math.max(0, i - 1)]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })}>
            <Ico n="retour" t={20} /></button>
          <button type="button" className="fl d" aria-label="Photo suivante"
            onClick={() => cases.current[Math.min(photos.length - 1, i + 1)]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })}>
            <Ico n="fleche" t={20} /></button>
        </>
      )}
      <div className="barre-pe">
        <span className="tab">{i + 1} / {photos.length}</span>
        <button type="button" className="ferme-pe" onClick={onFermer} aria-label="Fermer les photos">
          <Ico n="croix" t={15} />
        </button>
      </div>
      {photos.length > 1 && (
        <div className="points-pe">{photos.slice(0, 14).map((_, n) => (
          <span key={n} className={n === i ? 'on' : ''} />
        ))}</div>
      )}
    </div>,
    document.body,
  );
}

/* Bouton d'envoi : tant que ça part, on le dit. */
function BtnEnvoi({ enCours, libelle, enCoursTexte = 'Envoi en cours…', classe = 'btn or', onClick, style }: {
  enCours?: boolean; libelle: React.ReactNode; enCoursTexte?: string; classe?: string;
  onClick?: () => void; style?: React.CSSProperties;
}) {
  return (
    <button type="button" className={classe} disabled={!!enCours} aria-busy={!!enCours}
      onClick={onClick} style={{ marginTop: 14, ...(style || {}) }}>
      {enCours ? <><span className="tourne" aria-hidden="true" />{enCoursTexte}</> : libelle}
    </button>
  );
}

/* ══ feuilles ═════════════════════════════════════ */
function FicheBien({ b, client, onFermer, onAvis, onPartager }: any) {
  /* ⚠️ `avis` vient de `badge_retour`, et un bien présenté mais sans réponse
     y porte déjà 'propose' — ce n'est pas un retour du client, c'est l'état
     de départ. Seules les quatre valeurs d'ETIQ sont de vraies réponses.
     Tester `!!b.avis` figeait la fiche dès la première ouverture. */
  const repondu = !!b.avis && !!ETIQ[b.avis];
  const [avis, setAvis] = useState<string | null>(b.avis && AVIS[b.avis] ? b.avis : null);
  const [com, setCom] = useState(b.commentaire || '');
  /* Un avis déjà parti a été lu, et il a peut-être déjà orienté une
     recherche : on ne le laisse plus bouger. Tant qu'il n'est pas parti,
     le client reste libre de se raviser. */
  const envoye = repondu;
  const etiqRetour = repondu ? ETIQ[b.avis as string] : null;
  const parConseiller = repondu && b.retourPar === 'conseiller';
  const dateRetour = b.retourLe
    ? new Date(b.retourLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    : null;
  const [plein, setPlein] = useState<number | null>(null);
  const [texteOuvert, setTexteOuvert] = useState(false);
  const refTexte = useRef<HTMLDivElement>(null);
  const [hTexte, setHTexte] = useState(0);
  const [partage, setPartage] = useState(false);
  const [bientot, setBientot] = useState(false);
  const [envoiAvis, setEnvoiAvis] = useState(false);
  const photos: string[] = b.photos || [];
  /* Deux rubriques de plus sous la description. Elles se construisent ici
     pour que le rendu reste lisible, et surtout pour qu'une rubrique vide ne
     laisse aucune trace à l'écran — pas de titre orphelin. */
  const inclus: [string, string][] = [];
  if (b.terrasse) inclus.push(['terrasse', 'Terrasse']);
  if (b.balcon) inclus.push(['terrasse', 'Balcon']);
  if (b.jardin) inclus.push(['jardin', 'Jardin']);
  if (b.parking) inclus.push(['parking', b.nbParking && b.nbParking > 1 ? `${b.nbParking} parkings` : 'Parking']);
  if (b.cave) inclus.push(['cave', 'Cave']);
  if (b.ascenseur) inclus.push(['ascenseur', 'Ascenseur']);
  if (b.gardien) inclus.push(['gardien', 'Gardien']);
  if (b.cuisineEquipee) inclus.push(['cuisine', 'Cuisine équipée']);
  if (b.clim) inclus.push(['clim', 'Climatisation']);
  if (b.traversant) inclus.push(['traversant', 'Traversant']);

  /* Les charges se saisissent au trimestre dans le CRM : on l'écrit tel quel
     plutôt que de multiplier par quatre un chiffre dont on n'est pas sûr. */
  const couts: [string, string, string, string][] = [];
  if (b.charges) couts.push(['euro', 'Charges', EUR(b.charges), 'par trimestre']);
  if (b.taxe) couts.push(['immeuble', 'Taxe foncière', EUR(b.taxe), 'par an']);
  if (b.chauffage) couts.push(['eclair', 'Chauffage', b.chauffage, '']);
  if (b.lots) couts.push(['maison', 'Copropriété', String(b.lots), b.lots > 1 ? 'lots' : 'lot']);

  /* La surface d'extérieur est parfois saisie en bloc, parfois balcon par
     terrasse : on prend le total quand il existe, la somme sinon. */
  const ext = b.exterieur || ((b.surfaceTerrasse || 0) + (b.surfaceBalcon || 0)) || null;
  const nb = (v: number) => String(v).replace('.', ',');

  /* La description : en paragraphes, et repliée quand elle est longue. On
     mesure sa hauteur réelle pour que l'ouverture glisse au lieu de sauter. */
  const paras = decoupeTexte(b.description);
  useLayoutEffect(() => {
    if (refTexte.current) setHTexte(refTexte.current.scrollHeight);
  }, [b.id, paras.length]);
  const texteLong = hTexte > 176;

  /* DPE et GES : une lettre colorée dans une carte, comme le reste. */
  const lettre = (v?: string | null) => {
    const k = v ? v.toUpperCase()[0] : '';
    return k && DPEC[k] ? k : null;
  };
  const lDpe = lettre(b.dpe), lGes = lettre(b.ges);

  return (
    <>
      <div className="barre-retour">
        <button type="button" className="retour-f" onClick={onFermer} aria-label="Revenir à la liste">
          <Ico n="retour" t={18} />
        </button>
      </div>
      <Galerie photos={photos} onAgrandir={setPlein} />
      {plein !== null && (
        <PleinEcran photos={photos} depart={plein} onFermer={() => setPlein(null)} />
      )}
      {partage && (
        <ModalePartage b={b} client={client} onFermer={() => setPartage(false)}
          onEnvoyer={(mail: string) => onPartager(b, mail)} />
      )}
      {bientot && <ModaleBientot onFermer={() => setBientot(false)} />}
      <div className="fiche-droite">
      <div className="bandeau-prix">
        <span className="p tab">{EUR(b.prix)}</span>
        {b.prix && b.surface ? <span className="m2 tab">{Math.round(b.prix / b.surface).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} €/m²</span> : null}
      </div>
      <div className="tete-f" style={{ paddingTop: 10 }}>
        <div><h3>{b.titre}</h3>
          {b.secteur && <div className="meta" style={{ color: 'var(--plume)', fontSize: 13, marginTop: 5, display: 'flex', gap: 6, alignItems: 'center' }}>
            <Ico n="lieu" t={13} /> {b.secteur}</div>}</div>
      </div>
      <div className="corps-f">
        <div className="specs">
          {b.surface ? <div className="spec"><div className="v tab">{b.surface} m²</div><div className="l">Surface</div></div> : null}
          {b.pieces ? <div className="spec"><div className="v tab">{b.pieces}</div><div className="l">Pièces</div></div> : null}
          {b.chambres ? <div className="spec"><div className="v tab">{b.chambres}</div><div className="l">Chambres</div></div> : null}
          {b.etage != null ? <div className="spec"><div className="v tab">{b.etage === 0 ? 'RDC' : b.etage + 'e'}{b.etageTotal ? '/' + b.etageTotal : ''}</div><div className="l">Étage</div></div> : null}
          {b.expo ? <div className="spec"><div className="v">{b.expo}</div><div className="l">Exposition</div></div> : null}
          {b.sejour ? <div className="spec"><div className="v tab">{nb(b.sejour)} m²</div><div className="l">Séjour</div></div> : null}
          {ext ? <div className="spec"><div className="v tab">{nb(ext)} m²</div><div className="l">Extérieur</div></div> : null}
          {b.annee ? <div className="spec"><div className="v tab">{b.annee}</div><div className="l">Construction</div></div> : null}
        </div>
        {(lDpe || lGes) && (
          <>
            <label className="lab">Performance énergétique</label>
            <div className="cout">
              {lDpe ? (
                <div className="c">
                  <div className="h"><Ico n="eclair" t={15} /><span className="l">DPE</span></div>
                  <div className="v"><span className="lettre" style={{ background: DPEC[lDpe] }}>{lDpe}</span></div>
                </div>
              ) : null}
              {lGes ? (
                <div className="c">
                  <div className="h"><Ico n="etincelle" t={15} /><span className="l">GES</span></div>
                  <div className="v"><span className="lettre" style={{ background: DPEC[lGes] }}>{lGes}</span></div>
                </div>
              ) : null}
            </div>
          </>
        )}

        {paras.length > 0 && (
          <div className="desc">
            <div ref={refTexte} className="desc-t" data-court={texteLong && !texteOuvert ? '1' : undefined}
              style={texteLong ? { maxHeight: texteOuvert ? hTexte : 176 } : undefined}>
              {paras.map((x, n) => <p className="txt" key={n}>{x}</p>)}
            </div>
            {texteLong && (
              <button type="button" className="plus" onClick={() => setTexteOuvert(o => !o)}>
                <span>{texteOuvert ? 'Réduire' : 'Lire la suite'}</span>
                <span className="ch" data-o={texteOuvert ? '1' : undefined}><Ico n="fleche" t={14} /></span>
              </button>
            )}
          </div>
        )}

        {inclus.length > 0 && (
          <>
            <label className="lab">Ce que le bien comprend</label>
            <div className="incl">{inclus.map(([i, n]) => (
              <div className="ic" key={n}><span className="r"><Ico n={i} t={19} /></span><span className="n">{n}</span></div>
            ))}</div>
          </>
        )}

        {couts.length > 0 && (
          <>
            <label className="lab">Charges et énergie</label>
            <div className="cout">
              {couts.map(([i, l, v, u]) => (
                <div className="c" key={l}>
                  <div className="h"><Ico n={i} t={15} /><span className="l">{l}</span></div>
                  <div className="v tab">{v}{u ? <span className="u">{u}</span> : null}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <label className="lab">{envoye ? 'Votre retour' : 'Qu’en pensez-vous ?'}</label>
        <div className="avis3">
          {Object.entries(AVIS).map(([k, a]) => (
            <button key={k} type="button" className="avis" data-a={a.c}
              data-fige={envoye ? '1' : undefined}
              aria-pressed={avis === k} disabled={envoye}
              onClick={() => setAvis(v => (v === k ? null : k))}>
              <span className="e">{a.e}</span><span className="n">{a.n}</span>
            </button>
          ))}
        </div>

        {/* Le retour est parti : on le montre tel qu'il est parti, et rien
            ne se remodifie ici. Le client qui change d'avis le dit de vive
            voix — c'est plus juste qu'un deuxième retour qui écrase le
            premier sans qu'Alexandre sache lequel comptait. */}
        {envoye && (
          <div className="apres-avis fini">
            <div className="aa-t">{etiqRetour ? `${etiqRetour.e} ${etiqRetour.n}` : 'Retour enregistré'}</div>
            <p className="aa-p">{b.avis === 'visite'
              ? 'Vous avez visité ce bien avec votre conseiller. Son compte rendu est dans votre dossier.'
              : parConseiller
                ? `Votre conseiller a noté ce retour${dateRetour ? ` le ${dateRetour}` : ''}, d’après votre échange. Il oriente déjà la suite de votre recherche.`
                : `Votre conseiller a reçu ce retour${dateRetour ? ` le ${dateRetour}` : ''}. Il oriente déjà la suite de votre recherche.`}</p>
            {b.commentaire ? (
              <>
                <div className="fige-t">{parConseiller ? 'Ce qu’il a retenu' : 'Ce que vous avez écrit'}</div>
                <div className="fige">{b.commentaire}</div>
              </>
            ) : null}
            <p className="aa-n">{parConseiller
              ? 'Ce n’est pas tout à fait ça ? Dites-le à votre conseiller, il corrige.'
              : 'Vous avez changé d’avis sur ce bien ? Dites-le à votre conseiller, il met le dossier à jour.'}</p>
          </div>
        )}

        {!envoye && avis && SUITE_AVIS[avis] && (
          <div className="apres-avis">
            <div className="aa-t">{SUITE_AVIS[avis].t}</div>
            <p className="aa-p">{SUITE_AVIS[avis].p}</p>
            <textarea rows={5} value={com} onChange={e => setCom(e.target.value)}
              placeholder={SUITE_AVIS[avis].ph} />
            <BtnEnvoi enCours={envoiAvis} libelle={SUITE_AVIS[avis].btn} style={{ marginTop: 12 }}
              onClick={async () => { setEnvoiAvis(true); await onAvis(b, avis, com.trim()); }} />
          </div>
        )}
        <div className="duo">
          <button className="btn fant" onClick={() => setPartage(true)}><Ico n="partage" t={16} /> Partager</button>
          {/* Le téléchargement existe toujours à l'écran : quand la fiche est prête
              il l'ouvre, sinon il explique qu'elle arrive. Un bouton qui apparaît
              et disparaît selon les biens est plus déroutant qu'un bouton en attente. */}
          {b.pdfUrl ? (
            <a className="btn fant" href={b.pdfUrl} target="_blank" rel="noopener noreferrer">
              <Ico n="pdf" t={16} /> La fiche PDF</a>
          ) : (
            <button type="button" className="btn fant attente" onClick={() => setBientot(true)}>
              <Ico n="pdf" t={16} /> Télécharger la fiche</button>
          )}
        </div>
      </div>
      </div>
    </>
  );
}

/* Le téléchargement de la fiche n'est pas encore ouvert. Plutôt que de cacher
   le bouton, on dit ce qui arrive : le client sait que le dossier avance, et il
   sait aussi qu'il peut l'obtenir tout de suite en le demandant. */
function ModaleBientot({ onFermer }: { onFermer: () => void }) {
  useEchap(true, onFermer);
  return createPortal(
    <div className="pop" role="dialog" aria-modal="true">
      <div className="pop-voile" onClick={onFermer} />
      <div className="pop-carte">
        <div className="pop-fin">
          <div className="rond-ok"><Ico n="pdf" t={30} /></div>
          <h3>La fiche du bien, bientôt</h3>
          <p>Nous préparons un document à télécharger&nbsp;: les photos, le plan quand il existe,
            les surfaces pièce par pièce, les charges et les diagnostics. De quoi garder le bien
            sous la main, l&apos;imprimer, ou le montrer autour de vous.</p>
          <p>Il sera disponible ici prochainement. En attendant, votre conseiller vous l&apos;envoie
            sur simple demande.</p>
          <button type="button" className="btn or" onClick={onFermer}>C&apos;est noté</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ModalePartage({ b, client, onFermer, onEnvoyer }: any) {
  const [mail, setMail] = useState('');
  const [erreur, setErreur] = useState(false);
  const [copie, setCopie] = useState(false);
  const [etat, setEtat] = useState<'saisie' | 'envoi' | 'ok' | 'ko'>('saisie');
  const lien = typeof window !== 'undefined' ? `${window.location.origin}/bien/${b.id}` : '';

  const fermerSiPossible = useCallback(() => { if (etat !== 'envoi') onFermer(); }, [etat, onFermer]);
  useEchap(true, fermerSiPossible);

  async function partir() {
    if (!/.+@.+\..+/.test(mail.trim())) { setErreur(true); return; }
    setEtat('envoi');
    const ok = await onEnvoyer(mail.trim());
    setEtat(ok ? 'ok' : 'ko');
  }

  return createPortal(
    <div className="pop" role="dialog" aria-modal="true">
      <div className="pop-voile" onClick={() => { if (etat !== 'envoi') onFermer(); }} />
      <div className="pop-carte">
        {etat === 'ok' ? (
          <div className="pop-fin">
            <div className="rond-ok"><Ico n="check" t={32} /></div>
            <h3>La fiche est partie</h3>
            <p>{mail} vient de recevoir la fiche du bien.</p>
            <button className="btn or" onClick={onFermer}>Parfait</button>
          </div>
        ) : (
          <>
            <div className="pop-tete">
              <div><div className="sur">Partager ce bien</div><h3>{b.titre}</h3></div>
              <button className="fermer" onClick={onFermer} aria-label="Fermer" disabled={etat === 'envoi'}>
                <Ico n="croix" t={14} /></button>
            </div>
            <div className="pop-corps">
              <label className="lab" htmlFor="mail-partage">À qui l&apos;envoyer&nbsp;?</label>
              <input id="mail-partage" type="email" autoComplete="email" inputMode="email"
                placeholder="son adresse e-mail" value={mail} disabled={etat === 'envoi'}
                style={erreur ? { borderColor: 'var(--brique)' } : undefined}
                onChange={e => { setMail(e.target.value); setErreur(false); }}
                onKeyDown={e => { if (e.key === 'Enter') partir(); }} />
              {erreur && <div className="err">Il manque une adresse e-mail valide.</div>}

              <div className="ape">
                <div className="ape-t">Aperçu du message</div>
                <div className="ape-l"><span>Objet</span>{client.prenom} vous partage un bien</div>
                <div className="ape-c">Bonjour,<br />Voici un bien que je suis en train de regarder avec
                  mon conseiller immobilier. Dites-moi ce que vous en pensez.<br /><br />
                  <b>{b.titre}</b><br />
                  {[b.surface && b.surface + ' m²', EUR(b.prix)].filter(Boolean).join(' · ')}<br />
                  <span className="lien-ap">{lien}</span><br /><br />{client.prenom}</div>
              </div>

              {etat === 'ko' && <div className="err">L&apos;envoi n&apos;a pas abouti. Réessayez dans un instant, ou copiez le lien.</div>}

              <BtnEnvoi enCours={etat === 'envoi'} onClick={partir}
                libelle={<><Ico n="partage" t={16} /> Envoyer la fiche</>} />

              <div style={{ textAlign: 'center' }}>
                <button className="btn lien" onClick={() => {
                  navigator.clipboard?.writeText(lien);
                  setCopie(true); setTimeout(() => setCopie(false), 1800);
                }}>{copie ? '✓ Lien copié' : 'ou copier le lien'}</button>
              </div>
              <p className="txt mention">Le message part au nom d&apos;Emilio Immobilier.</p>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* « Mes critères ont évolué » — le même parcours que le CRM d'Alexandre,
   mais en neuf étapes, pensées pour un pouce sur un téléphone.
   On peut sauter directement à la catégorie que l'on veut changer. */
function ModifCriteres({ crit, onFermer, onEnregistrer }: any) {
  const [enr, setEnr] = useState(false);
  const [etape, setEtape] = useState(0);
  const [sens, setSens] = useState<1 | -1>(1);
  const [demandeNote, setDemandeNote] = useState('');
  const [t, setT] = useState({
    typesBien: [...(crit.typesBien || [])] as string[],
    etatSouhaite: crit.etatSouhaite || '',
    anneeMin: crit.anneeMin ? String(crit.anneeMin) : '',
    budgetMin: crit.budgetMin || 0,
    budgetMax: crit.budgetMax || 1000000,
    apport: crit.apport ? String(crit.apport) : '',
    financement: crit.financement || '',
    surfaceMin: crit.surfaceMin || 60,
    surfaceMax: crit.surfaceMax ? String(crit.surfaceMax) : '',
    surfaceSejourMin: crit.surfaceSejourMin ? String(crit.surfaceSejourMin) : '',
    piecesMin: crit.piecesMin || 3,
    chambresMin: crit.chambresMin || 2,
    etageMin: crit.etageMin ? String(crit.etageMin) : '',
    etageMax: crit.etageMax ? String(crit.etageMax) : '',
    rdcExclu: !!crit.rdcExclu,
    dernierEtage: !!crit.dernierEtage,
    etageMaxSansAscenseur: crit.etageMaxSansAscenseur ? String(crit.etageMaxSansAscenseur) : '',
    exposition: crit.exposition || '',
    exigences: { ...(crit.exigences || {}) } as Record<string, string>,
    cuisineType: crit.cuisineType || '',
    exterieurSurfaceMin: crit.exterieurSurfaceMin ? String(crit.exterieurSurfaceMin) : '',
    dpeMax: crit.dpeMax || '',
    urgence: crit.urgence || '',
    transportMinutes: crit.transportMinutes || 0,
    arrets: [...(crit.transportArrets || [])] as Arret[],
    secteurs: [...crit.secteurs],
  });

  /* Une borne ne tire plus l'autre : on bloque seulement quand elles se
     croisent, et on retient celle que l'on est en train de bouger. */
  const pas = (cle: string, d: number) => {
    setT(v => {
      const n = { ...v } as any;
      const p = cle === 'surfaceMin' ? 5 : 25000;
      const plancher = cle === 'surfaceMin' ? 20 : (cle === 'budgetMin' ? 0 : 50000);
      n[cle] = Math.max(plancher, n[cle] + d * p);
      if (n.budgetMin && n.budgetMin > n.budgetMax) {
        if (cle === 'budgetMin') n.budgetMin = n.budgetMax; else n.budgetMax = n.budgetMin;
      }
      return n;
    });
  };
  const basculeType = (v: string) =>
    setT(x => ({ ...x, typesBien: x.typesBien.includes(v) ? x.typesBien.filter((y: string) => y !== v) : [...x.typesBien, v] }));
  const expos: string[] = t.exposition.split(',').map((x: string) => x.trim()).filter(Boolean);
  const basculeExpo = (k: string) =>
    setT(x => ({ ...x, exposition: (expos.includes(k) ? expos.filter((y: string) => y !== k) : [...expos, k]).join(', ') }));
  const niv = (k: string) => t.exigences[k] || '';
  const setNiv = (k: string, n: string) => setT(x => {
    const e = { ...x.exigences };
    if (n) e[k] = n; else delete e[k];
    return { ...x, exigences: e };
  });
  const tourner = (k: string) => { const c = ['', 'souhaite', 'indispensable']; setNiv(k, c[(c.indexOf(niv(k)) + 1) % 3]); };

  const num = (cle: string) => (v: string) => setT(x => ({ ...x, [cle]: v }));

  const ETAPES: { id: string; ico: string; titre: string; sous: string; contenu: React.ReactNode }[] = [
    {
      id: 'bien', ico: 'maison', titre: 'Le bien recherché', sous: 'Quel type de bien, dans quel état',
      contenu: (<>
        <label className="lab">Type de bien <i>plusieurs choix possibles</i></label>
        <div className="choix">{TYPES_E.map(([x, i]) => (
          <button key={x} className="ch or" aria-pressed={t.typesBien.includes(x)} onClick={() => basculeType(x)}>{i} {x}</button>))}</div>
        <label className="lab">État souhaité</label>
        <div className="choix">{ETATS_E.map(([k, l, i]) => (
          <button key={k} className="ch" aria-pressed={t.etatSouhaite === k} onClick={() => setT(x => ({ ...x, etatSouhaite: x.etatSouhaite === k ? '' : k }))}>{i} {l}</button>))}</div>
        <label className="lab">📅 Construit après</label>
        <ChampNum val={t.anneeMin} onChange={num('anneeMin')} aide="Laissez vide si l’année n’a pas d’importance" />
      </>),
    },
    {
      id: 'surfaces', ico: 'regle', titre: 'Surfaces & volumes', sous: 'La taille du bien',
      contenu: (<>
        <label className="lab">Surface minimum</label>
        <div className="pas"><button className="rond" onClick={() => pas('surfaceMin', -1)}>−</button>
          <span className="val tab">{t.surfaceMin} m²</span>
          <button className="rond" onClick={() => pas('surfaceMin', 1)}>+</button></div>
        <label className="lab">Surface maximum</label>
        <ChampNum val={t.surfaceMax} onChange={num('surfaceMax')} suffixe="m²" aide="Vide = pas de plafond" />
        <label className="lab">Pièces minimum</label>
        <div className="choix">{[2, 3, 4, 5, 6].map(n => (
          <button key={n} className="ch" aria-pressed={t.piecesMin === n} onClick={() => setT(v => ({ ...v, piecesMin: n }))}>{n}{n === 6 ? '+' : ''}</button>))}</div>
        <label className="lab">Chambres minimum</label>
        <div className="choix">{[1, 2, 3, 4, 5].map(n => (
          <button key={n} className="ch" aria-pressed={t.chambresMin === n} onClick={() => setT(v => ({ ...v, chambresMin: n }))}>{n}{n === 5 ? '+' : ''}</button>))}</div>
        <label className="lab">Séjour d’au moins</label>
        <ChampNum val={t.surfaceSejourMin} onChange={num('surfaceSejourMin')} suffixe="m²" aide="Vide si vous n’avez pas d’exigence sur le séjour" />
      </>),
    },
    {
      id: 'etage', ico: 'immeuble', titre: 'Étage & exposition', sous: 'La place dans l’immeuble et l’orientation',
      contenu: (<>
        <label className="lab">Étage</label>
        <div className="duo-n">
          <div><div className="borne">À partir du</div><ChampNum val={t.etageMin} onChange={num('etageMin')} suffixe="e" /></div>
          <div><div className="borne">Jusqu’au</div><ChampNum val={t.etageMax} onChange={num('etageMax')} suffixe="e" /></div>
        </div>
        <div className="choix" style={{ marginTop: 12 }}>
          <button className="ch" aria-pressed={t.rdcExclu} onClick={() => setT(x => ({ ...x, rdcExclu: !x.rdcExclu }))}>Pas de rez-de-chaussée</button>
          <button className="ch" aria-pressed={t.dernierEtage} onClick={() => setT(x => ({ ...x, dernierEtage: !x.dernierEtage }))}>Dernier étage</button>
        </div>
        <label className="lab">Ascenseur</label>
        <div className="choix">
          <button className={'ch niv' + (niv('ascenseur') ? ' n' + niv('ascenseur') : '')} aria-pressed={!!niv('ascenseur')} onClick={() => tourner('ascenseur')}>
            🛗 Ascenseur{niv('ascenseur') ? <i className="mk">{niv('ascenseur') === 'indispensable' ? 'indispensable' : 'souhaité'}</i> : null}
          </button>
        </div>
        {niv('ascenseur') !== 'indispensable' && (
          <>
            <div className="borne" style={{ marginTop: 12 }}>Sans ascenseur, j’accepte jusqu’au</div>
            <ChampNum val={t.etageMaxSansAscenseur} onChange={num('etageMaxSansAscenseur')} suffixe="e étage" aide="Vide si monter à pied ne vous dérange pas" />
          </>
        )}
        <label className="lab">Exposition souhaitée <i>plusieurs choix possibles</i></label>
        <div className="choix">{EXPO_E.map(([k, l, i]) => (
          <button key={k} className="ch or" aria-pressed={expos.includes(k)} onClick={() => basculeExpo(k)}>{i} {l}</button>))}</div>
      </>),
    },
    {
      id: 'equip', ico: 'etincelle', titre: 'Équipements', sous: 'Ce qui ferait plaisir, et ce sans quoi c’est non',
      contenu: (<>
        <label className="lab">Appuyez une fois pour « souhaité », deux fois pour « indispensable »</label>
        <div className="choix">{EQUIP_E.filter(([k]) => k !== 'ascenseur').map(([k, l, i]) => (
          <button key={k} className={'ch niv' + (niv(k) ? ' n' + niv(k) : '')} aria-pressed={!!niv(k)} onClick={() => tourner(k)}>
            {i} {l}{niv(k) ? <i className="mk">{niv(k) === 'indispensable' ? 'indispensable' : 'souhaité'}</i> : null}
          </button>))}</div>
        <label className="lab">Un extérieur</label>
        <div className="choix">
          <button className={'ch niv' + (niv('exterieur') ? ' n' + niv('exterieur') : '')} aria-pressed={!!niv('exterieur')} onClick={() => tourner('exterieur')}>
            🌤️ Balcon, terrasse ou jardin{niv('exterieur') ? <i className="mk">{niv('exterieur') === 'indispensable' ? 'indispensable' : 'souhaité'}</i> : null}
          </button>
        </div>
        {niv('exterieur') ? (<>
          <div className="borne" style={{ marginTop: 12 }}>D’au moins</div>
          <ChampNum val={t.exterieurSurfaceMin} onChange={num('exterieurSurfaceMin')} suffixe="m²" aide="Vide si la taille importe peu" />
        </>) : null}
        <label className="lab">Cuisine</label>
        <div className="choix">
          {CUISINES_E.map(([k, l, i]) => (
            <button key={k || 'ind'} className="ch" aria-pressed={t.cuisineType === k} onClick={() => setT(x => ({ ...x, cuisineType: k }))}>{i} {l}</button>))}
        </div>
        {t.cuisineType ? (
          <div className="choix" style={{ marginTop: 9 }}>
            {[['souhaite', 'Simple préférence'], ['indispensable', 'Indispensable']].map(([k, l]) => (
              <button key={k} className="ch or" aria-pressed={niv('cuisine') === k} onClick={() => setNiv('cuisine', niv('cuisine') === k ? '' : k)}>{l}</button>))}
          </div>
        ) : null}
      </>),
    },
    {
      id: 'energie', ico: 'eclair', titre: 'Performance énergétique', sous: 'La plus mauvaise lettre que vous acceptez',
      contenu: (<>
        <div className="dpe-choix">{LETTRES_DPE.map(d => {
          const i = LETTRES_DPE.indexOf(t.dpeMax);
          const passe = t.dpeMax ? LETTRES_DPE.indexOf(d) <= i : false;
          return <button key={d} className={'dpe-b' + (passe ? ' ok' : '') + (t.dpeMax === d ? ' pt' : '')}
            onClick={() => setT(x => ({ ...x, dpeMax: x.dpeMax === d ? '' : d }))}>{d}</button>;
        })}</div>
        <p className="txt" style={{ marginTop: 12 }}>
          {t.dpeMax
            ? <>Vous gardez <b>{LETTRES_DPE.slice(0, LETTRES_DPE.indexOf(t.dpeMax) + 1).join(' ')}</b>{LETTRES_DPE.indexOf(t.dpeMax) < 6 ? <> et écartez {LETTRES_DPE.slice(LETTRES_DPE.indexOf(t.dpeMax) + 1).join(' ')}.</> : '.'}</>
            : <>Aucune exigence — toutes les étiquettes passent.</>}
        </p>
      </>),
    },
    {
      id: 'lieu', ico: 'lieu', titre: 'Où je cherche', sous: 'Vos communes, puis vos quartiers',
      contenu: <Localisation secteurs={t.secteurs} onChange={(v) => setT(x => ({ ...x, secteurs: v }))} />,
    },
    {
      id: 'transports', ico: 'train', titre: 'Transports', sous: 'Cherchez un arrêt, puis réglez le temps à pied',
      contenu: <ArretPicker arrets={t.arrets} onChange={(v) => setT(x => ({ ...x, arrets: v }))} minutesDefaut={t.transportMinutes || 10} />,
    },
    {
      id: 'budget', ico: 'euro', titre: 'Budget', sous: 'Votre enveloppe et son financement',
      contenu: (<>
        <div className="borne">Minimum</div>
        <div className="pas"><button className="rond" onClick={() => pas('budgetMin', -1)}>−</button>
          <span className="val tab">{t.budgetMin ? EUR(t.budgetMin) : 'Aucun'}</span>
          <button className="rond" onClick={() => pas('budgetMin', 1)}>+</button></div>
        <div className="borne">Maximum</div>
        <div className="pas"><button className="rond" onClick={() => pas('budgetMax', -1)}>−</button>
          <span className="val tab">{EUR(t.budgetMax)}</span>
          <button className="rond" onClick={() => pas('budgetMax', 1)}>+</button></div>
        <label className="lab">Apport</label>
        <ChampNum val={t.apport} onChange={num('apport')} suffixe="€" aide="Vide si vous préférez ne pas le préciser ici" />
        <label className="lab">Financement</label>
        <div className="choix">{FINANCEMENTS_E.map(([k, l, i]) => (
          <button key={k} className="ch" aria-pressed={t.financement === k} onClick={() => setT(x => ({ ...x, financement: x.financement === k ? '' : k }))}>{i} {l}</button>))}</div>
      </>),
    },
    {
      id: 'projet', ico: 'note', titre: 'Mon projet', sous: 'Votre échéance, et la note d’Alexandre',
      contenu: (<>
        <label className="lab">Échéance souhaitée</label>
        <div className="choix">{URGENCES_E.map(([k, l, i]) => (
          <button key={k} className="ch" aria-pressed={t.urgence === k} onClick={() => setT(x => ({ ...x, urgence: x.urgence === k ? '' : k }))}>{i} {l}</button>))}</div>
        <div className="note-verr">
          <div className="k"><span><Ico n="verrou" t={12} /> Précisions notées par Alexandre</span></div>
          <blockquote className="corps">{crit.notes || 'Aucune précision notée pour l’instant.'}</blockquote>
          <div className="pq">Cette note lui appartient : vous ne pouvez pas la modifier vous-même. Dites-lui ce que vous voudriez y changer, il s’en occupe.</div>
          <textarea rows={3} value={demandeNote} onChange={e => setDemandeNote(e.target.value)}
            placeholder="Ce que je voudrais qu’Alexandre corrige dans cette note… (facultatif)" />
        </div>
      </>),
    },
  ];

  const nb = ETAPES.length;
  const i = Math.min(Math.max(etape, 0), nb - 1);
  const e = ETAPES[i];
  const aller = (n: number) => { setSens(n > i ? 1 : -1); setEtape(Math.max(0, Math.min(nb - 1, n))); };
  /* La frise défile : on ramène toujours l'étape en cours sous les yeux. */
  const friseRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = friseRef.current?.querySelector('.fp.on');
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [i]);

  async function enregistrer() {
    const c: string[] = [];
    if ((t.budgetMin || null) !== (crit.budgetMin || null) || t.budgetMax !== crit.budgetMax) {
      c.push('budget ' + (t.budgetMin ? EUR(t.budgetMin) + ' – ' + EUR(t.budgetMax) : 'jusqu’à ' + EUR(t.budgetMax)));
    }
    if (t.surfaceMin !== crit.surfaceMin) c.push(t.surfaceMin + ' m² minimum');
    if (t.piecesMin !== crit.piecesMin) c.push(t.piecesMin + ' pièces minimum');
    if (t.chambresMin !== crit.chambresMin) c.push(t.chambresMin + ' chambres minimum');
    if (t.typesBien.join() !== (crit.typesBien || []).join()) c.push(t.typesBien.length ? 'type de bien : ' + t.typesBien.join(', ') : 'plus de contrainte de type');
    if (t.secteurs.join() !== crit.secteurs.join()) c.push(t.secteurs.length + ' secteurs');
    if (JSON.stringify(t.exigences) !== JSON.stringify(crit.exigences || {})) c.push('équipements souhaités');
    if ((t.dpeMax || '') !== (crit.dpeMax || '')) c.push(t.dpeMax ? 'DPE ' + t.dpeMax + ' maximum' : 'plus de contrainte de DPE');
    if (t.exposition !== (crit.exposition || '')) c.push('exposition');
    const arretsAvant = (crit.transportArrets || []).map((a: Arret) => a.nom + a.minutes).join();
    if (t.arrets.map(a => a.nom + a.minutes).join() !== arretsAvant) {
      c.push(t.arrets.length
        ? 'transports : ' + t.arrets.map(a => `${a.nom} (${a.minutes || 10} min)`).join(' · ')
        : 'plus de contrainte de transport');
    }
    const nombre = (v: string) => (v.trim() === '' ? null : Number(v));
    setEnr(true);
    await onEnregistrer({
      ...crit, ...t,
      budgetMin: t.budgetMin || null,
      apport: nombre(t.apport), anneeMin: nombre(t.anneeMin),
      surfaceMax: nombre(t.surfaceMax), surfaceSejourMin: nombre(t.surfaceSejourMin),
      etageMin: nombre(t.etageMin), etageMax: nombre(t.etageMax),
      etageMaxSansAscenseur: nombre(t.etageMaxSansAscenseur),
      exterieurSurfaceMin: nombre(t.exterieurSurfaceMin),
      equip: EQUIP_E.filter(([k]) => t.exigences[k]).map(([, l]) => l),
      transportMinutes: t.transportMinutes || null,
      transportArrets: t.arrets,
    }, c, demandeNote.trim());
  }

  return (
    <>
      <div className="tete-f">
        <div><div className="sur">Votre recherche</div><h3>{e.titre}</h3></div>
        <button className="fermer" onClick={onFermer} aria-label="Fermer"><Ico n="croix" t={14} /></button>
      </div>

      <div className="frise-e" ref={friseRef}>
        {ETAPES.map((s, k) => (
          <button key={s.id} type="button" aria-label={s.titre} title={s.titre}
            className={'fp' + (k === i ? ' on' : k < i ? ' fait' : '')} onClick={() => aller(k)}>
            <Ico n={s.ico} t={15} />
            <span>{s.titre}</span>
          </button>
        ))}
      </div>

      <div className="corps-f corps-e">
        <div key={e.id} className={'pan-e ' + (sens === 1 ? 'av' : 'ar')}>
          <p className="sous-e">{e.sous}</p>
          {e.contenu}
        </div>
      </div>

      <div className="nav-e">
        <button className="btn" onClick={() => (i === 0 ? onFermer() : aller(i - 1))}>{i === 0 ? 'Annuler' : '← Précédent'}</button>
        <span className="cpt">{i + 1} / {nb}</span>
        {i < nb - 1
          ? <button className="btn or" onClick={() => aller(i + 1)}>Suivant →</button>
          : <BtnEnvoi enCours={enr} libelle="Enregistrer" enCoursTexte="Enregistrement…" onClick={enregistrer} />}
      </div>
    </>
  );
}
/* Le carrefour de « Mes critères ont évolué » : modifier soi-même, ou être
   rappelé. Le créneau se choisit ici même — ouvrir une deuxième pop-up pour
   trois boutons, c'est une étape de trop. */
/* Trois réponses, jamais une de plus : on ne fait pas remplir un formulaire
   à quelqu'un qui vient nous dire qu'il s'en va. */
function FinRecherche({ onFermer, onChoisir }: any) {
  const [motif, setMotif] = useState('');
  const [mot, setMot] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const CHOIX: [string, string, string][] = [
    ['trouve_avec_vous', "J'ai trouvé, grâce à vous", 'Le bien vient de votre sélection.'],
    ['trouve_ailleurs', "J'ai trouvé par un autre biais", 'Une autre agence, un particulier, une relation.'],
    ['pause', 'Je mets ma recherche en pause', 'Le projet est reporté, sans être abandonné.'],
  ];
  return (
    <>
      <div className="tete-f">
        <div><div className="sur">Votre recherche</div><h3>Votre recherche est terminée&nbsp;?</h3></div>
        <button className="fermer" onClick={onFermer} aria-label="Fermer"><Ico n="croix" t={14} /></button>
      </div>
      <div className="corps-f">
        <p className="txt" style={{ marginTop: 0, color: 'var(--plume)' }}>
          Dites-le-nous en un clic. Votre conseiller vous rappelle pour en parler&nbsp;:
          rien ne se ferme sans vous.
        </p>

        {CHOIX.map(([cle, titre, sous]) => (
          <button key={cle} className="cta-prec" onClick={() => setMotif(cle)}
            style={motif === cle ? { borderColor: 'var(--or)', background: 'var(--or-fond)' } : undefined}>
            <span><b>{titre}</b><span className="s">{sous}</span></span>
            <span className="chev"><Ico n="fleche" t={18} /></span>
          </button>
        ))}

        {motif && (
          <div className="bloc-rappel">
            <div className="lib-rappel">Un mot, si vous voulez en dire plus</div>
            <textarea value={mot} onChange={e => setMot(e.target.value)} rows={3}
              placeholder="Facultatif"
              style={{ width: '100%', border: '1px solid var(--trait)', borderRadius: 12,
                padding: '11px 13px', fontFamily: 'inherit', fontSize: 14,
                color: 'var(--encre)', resize: 'vertical', outline: 'none', background: '#fff' }} />
            <BtnEnvoi enCours={envoi} classe="btn or" libelle="Prévenir mon conseiller"
              enCoursTexte="Envoi en cours…" style={{ marginTop: 12 }}
              onClick={async () => { setEnvoi(true); await onChoisir(motif, mot); }} />
          </div>
        )}
      </div>
    </>
  );
}

function ChoixCriteres({ onFermer, onModifier, onRappel }: any) {
  const [ouvertRappel, setOuvertRappel] = useState(false);
  const [creneau, setCreneau] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const CRENEAUX: [string, string, string][] = [
    ['matin', 'Le matin', '8h – 12h'],
    ['apres_midi', "L'après-midi", '12h – 18h'],
    ['soir', 'En fin de journée', '18h – 20h'],
  ];
  return (
    <>
      <div className="tete-f">
        <div><div className="sur">Votre recherche</div><h3>Comment préférez-vous faire&nbsp;?</h3></div>
        <button className="fermer" onClick={onFermer} aria-label="Fermer"><Ico n="croix" t={14} /></button>
      </div>
      <div className="corps-f">
        <p className="txt" style={{ marginTop: 0, color: 'var(--plume)' }}>
          Deux façons de faire évoluer votre recherche. Les deux arrivent chez votre conseiller.
        </p>

        <button className="cta-prec" onClick={onModifier}>
          <span><b>Je modifie moi-même ma recherche</b>
            <span className="s">Vous reprenez vos critères un par un. Vos changements sont
              transmis à votre conseiller, qui les intègre aussitôt à la recherche.</span></span>
          <span className="chev"><Ico n="fleche" t={18} /></span>
        </button>

        <button className="cta-prec" onClick={() => setOuvertRappel(true)}
          style={ouvertRappel ? { borderColor: 'var(--or)' } : undefined}>
          <span><b>Je souhaite être rappelé</b>
            <span className="s">Votre conseiller vous appelle pour en parler de vive voix,
              et met la recherche à jour avec vous.</span></span>
          <span className="chev"><Ico n="tel" t={18} /></span>
        </button>

        {ouvertRappel && (
          <div className="bloc-rappel">
            <div className="lib-rappel">À quel moment de la journée&nbsp;?</div>
            <div className="creneaux">
              {CRENEAUX.map(([cle, titre, heures]) => (
                <button key={cle} type="button"
                  className={'creneau' + (creneau === cle ? ' pris' : '')}
                  onClick={() => setCreneau(cle)}>
                  <b>{titre}</b><span>{heures}</span>
                </button>
              ))}
            </div>
            <BtnEnvoi enCours={envoi} classe="btn or" libelle="Demander à être rappelé"
              enCoursTexte="Envoi en cours…" style={{ marginTop: 12, opacity: creneau ? 1 : .5 }}
              onClick={async () => { if (!creneau) return; setEnvoi(true); await onRappel(creneau); }} />
          </div>
        )}
      </div>
    </>
  );
}

function Message({ onFermer, onEnvoi }: any) {
  const [txt, setTxt] = useState('');
  const [envoi, setEnvoi] = useState(false);
  return (
    <>
      <div className="tete-f">
        <div><div className="sur">Message</div><h3>Dites-moi tout</h3></div>
        <button className="fermer" onClick={onFermer} aria-label="Fermer"><Ico n="croix" t={14} /></button>
      </div>
      <div className="corps-f">
        <p className="txt" style={{ marginTop: 0, color: 'var(--plume)' }}>Alexandre le reçoit tout de suite et vous rappelle.</p>
        <textarea rows={5} value={txt} onChange={e => setTxt(e.target.value)} autoFocus
          placeholder="Ex : finalement on pourrait regarder un peu plus loin, et on peut monter si le bien est refait." />
        <BtnEnvoi enCours={envoi} classe="btn encre" libelle="Envoyer" style={{ marginTop: 12 }}
          onClick={async () => { if (!txt.trim()) return; setEnvoi(true); await onEnvoi(txt.trim()); }} />
      </div>
    </>
  );
}

const JOURS_L = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/* « Jeudi 25 septembre » plutôt que « 25/09/2026 » : on lit une date de
   rendez-vous comme on la dirait au téléphone. */
function dateLongue(d: string) {
  const x = new Date(d + (d.length <= 10 ? 'T12:00:00' : ''));
  if (isNaN(x.getTime())) return d;
  const t = `${JOURS_L[x.getDay()]} ${x.getDate()} ${MOIS_L[x.getMonth()]}`;
  return t.charAt(0).toUpperCase() + t.slice(1);   // « Mercredi 23 septembre », pas « Mercredi 23 Septembre »
}
function joursAvant(d: string) {
  const x = new Date(d + (d.length <= 10 ? 'T12:00:00' : ''));
  const a = new Date(); a.setHours(12, 0, 0, 0);
  const n = Math.round((x.getTime() - a.getTime()) / 86400000);
  if (n < 0) return null;
  if (n === 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  if (n < 8) return `dans ${n} jours`;
  return null;
}

/* Sur Android, un fichier .ics se télécharge puis il faut aller l'ouvrir :
   pour Google Agenda, un lien direct est bien plus simple. On propose donc
   les deux, chacun fait un seul geste. */
function lienGoogle(v: { date: string; heure: string | null; titre: string; adresse: string }) {
  const hh = v.heure ? String(v.heure).slice(0, 5) : '10:00';
  const debut = new Date(`${String(v.date).slice(0, 10)}T${hh}:00`);
  const fin = new Date(debut.getTime() + 3600000);
  const z = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}T${z(d.getHours())}${z(d.getMinutes())}00`;
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Visite — ' + v.titre,
    dates: `${fmt(debut)}/${fmt(fin)}`,
    details: 'Visite organisée par Emilio Immobilier.\nAlexandre Rogelet · 06 58 95 76 32',
    ctz: 'Europe/Paris',
  });
  if (v.adresse) p.set('location', v.adresse);
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

function ProchaineVisite({ v, autres, token }: { v: any; autres: number; token: string }) {
  const bientot = joursAvant(v.date);
  return (
    <div className="visite-a-venir">
      <div className="vav-t"><Ico n="calendrier" t={15} /> Votre prochaine visite</div>
      <div className="vav-q">
        {dateLongue(v.date)}{v.heure ? ` à ${String(v.heure).slice(0, 5).replace(':', ' h ')}` : ''}
        {bientot && <span className="vav-b">{bientot}</span>}
      </div>
      <div className="vav-b2">{v.titre}</div>
      {v.adresse && <div className="vav-a"><Ico n="lieu" t={13} /> {v.adresse}</div>}
      <div className="vav-ag">
        <span className="vav-ag-t">Ajouter à mon agenda</span>
        <span className="vav-ag-b">
          <a className="vav-ics" href={lienGoogle(v)} target="_blank" rel="noopener noreferrer">Google&nbsp;Agenda</a>
          <a className="vav-ics" href={`/api/espace/agenda?token=${encodeURIComponent(token)}&v=${encodeURIComponent(v.id)}`}>Apple&nbsp;· Outlook</a>
        </span>
      </div>
      {autres > 0 && <div className="vav-p">Et {autres} autre{autres > 1 ? 's' : ''} visite{autres > 1 ? 's' : ''} prévue{autres > 1 ? 's' : ''} ensuite.</div>}
    </div>
  );
}

/* Les trois chiffres de l'accueil ne parlent pas d'eux-mêmes : « 119 annonces
   lues », lues par qui, et pour quoi faire ? Chacun a son explication, derrière
   un point d'interrogation. On dit ce que le chiffre est, et ce qu'il n'est pas. */
const AIDES: Record<string, { ico: string; sur: string; titre: string; texte: string; puces: string[] }> = {
  decouvrir: {
    ico: 'etoile', sur: 'Vos nouveautés', titre: 'Ce que veut dire « à découvrir »',
    texte: "C'est le nombre de biens retenus pour vous que vous n'avez pas encore ouverts.",
    puces: [
      'Dès qu’un bien passe tous vos critères, il arrive ici et le compteur monte.',
      'Il redescend à mesure que vous les ouvrez : ceux-là partent dans « Mes derniers biens consultés ».',
      'À zéro, vous êtes à jour — rien ne vous attend, et rien ne s’est perdu.',
    ],
  },
  lues: {
    ico: 'loupe', sur: 'Le travail de fond', titre: 'Ce que veut dire « annonces lues »',
    texte: "Le nombre d'annonces que nous avons lues pour vous depuis l'ouverture de votre dossier.",
    puces: [
      'Chaque jour, nous passons en revue ce qui sort sur votre secteur : portails, confrères, off-market.',
      'Ce ne sont pas des biens qui vous correspondent : c’est tout ce que nous avons regardé pour en trouver. La grande majorité est écartée.',
      'Ce total ne fait que monter, un peu plus à chaque journée de recherche.',
    ],
  },
  retenus: {
    ico: 'etoile', sur: 'Ce qui vous arrive', titre: 'Ce que veut dire « bien retenu pour vous »',
    texte: "C'est le nombre de biens que nous avons jugés dignes de vous être montrés, et que vous retrouvez dans cet espace.",
    puces: [
      'Un bien n’arrive ici que s’il passe tous vos critères — ou s’il en vaut vraiment la peine, et nous vous disons alors pourquoi.',
      'C’est exactement ce que vous avez sous les yeux : ce chiffre est le nombre de biens présents dans votre espace, ni plus ni moins.',
      'Il monte lentement, et c’est normal : c’est le signe qu’on ne vous envoie pas tout et n’importe quoi.',
    ],
  },
  ecartees: {
    ico: 'croix', sur: 'Le tri', titre: 'Ce que veut dire « écartée »',
    texte: "Une annonce écartée est une annonce que nous avons lue et qui ne méritait pas de vous être présentée.",
    puces: [
      'Le plus souvent, elle s’éloignait trop de ce que vous cherchez : le budget, la surface, le secteur, l’étage.',
      'Mais vos critères ne sont pas une barrière. Quelques mètres carrés de moins, un étage imprévu, un prix un peu au-dessus quand il y a de la négociation à aller chercher : si le reste y est, nous vous le présentons quand même, en vous disant pourquoi.',
      'Nous ne les gardons pas une par une : ce qui est conservé, c’est le compte, pour que vous voyiez le volume de tri fait pour vous.',
      'Si vous trouvez qu’on écarte trop, ou pas assez, dites-le : vos critères se modifient depuis « Rappel de ma recherche ».',
    ],
  },
  m2: {
    ico: 'regle', sur: 'Vos repères', titre: 'Ce que veut dire « du m² en moyenne »',
    texte: "C'est la moyenne du prix au mètre carré des biens présents dans votre espace.",
    puces: [
      'Elle est calculée sur vos biens à vous, pas sur une statistique de quartier : elle dit le prix du marché tel que vous le rencontrez.',
      'Elle est recalculée à chaque bien déposé : elle ne peut pas être périmée.',
      'Elle sert de repère pour situer un bien : nettement en dessous, il y a souvent une raison ; nettement au-dessus, elle doit se justifier.',
    ],
  },
  rythme: {
    ico: 'calendrier', sur: 'Le rythme', titre: 'Ce que montre « jour après jour »',
    texte: "Chaque barre, c'est le nombre d'annonces que nous avons parcourues ce jour-là sur vos critères.",
    puces: [
      'Les barres bougent d’un jour à l’autre : le marché ne sort pas le même volume tous les jours, le lundi et le samedi n’ont rien à voir.',
      'Une barre basse ne veut pas dire qu’on a moins travaillé : elle veut dire qu’il est sorti moins d’annonces à regarder.',
      'La barre dorée est celle d’aujourd’hui.',
    ],
  },
  jours: {
    ico: 'horloge', sur: 'Votre dossier', titre: 'Ce que veut dire « jours de suivi »',
    texte: "C'est le nombre de jours écoulés depuis l'ouverture de votre dossier chez nous.",
    puces: [
      'La recherche est reprise chaque jour depuis cette date, y compris les jours où rien n’est retenu.',
      'Une recherche aboutit rarement en une semaine : compter en jours permet de voir où en est le projet, sans se raconter d’histoires.',
      'Tout ce qui a été fait depuis reste consultable dans « Mes derniers biens consultés ».',
    ],
  },
};

function Explication({ a, onFermer }: { a: typeof AIDES[string]; onFermer: () => void }) {
  return (
    <div className="bienv">
      <div className="bienv-sceau"><Ico n={a.ico} t={28} /></div>
      <div className="bienv-sur">{a.sur}</div>
      <h3>{a.titre}</h3>
      <p>{a.texte}</p>
      <div className="puces">
        {a.puces.map((t, i) => (
          <span key={i}><span className="k"><Ico n="check" t={15} /></span><span>{t}</span></span>
        ))}
      </div>
      <button className="btn or" style={{ marginTop: 22, width: '100%' }} onClick={onFermer}>J&apos;ai compris</button>
    </div>
  );
}

/* La présentation de l'espace. Elle s'ouvre toute seule à la première visite,
   puis se retrouve derrière « Comment ça marche ? ». Elle ne reste pas en
   permanence sur la page d'accueil : on la lit une fois, elle a fait son office. */
function Bienvenue({ client, onFermer }: any) {
  return (
    <div className="bienv">
      <div className="bienv-sceau"><Ico n="cible" t={30} /></div>
      <div className="bienv-sur">Votre espace personnel</div>
      <h3>Bienvenue, {client.prenom}</h3>
      <p>Cet espace a été créé rien que pour votre recherche. Il est privé, il n&apos;y a ni compte
        ni mot de passe&nbsp;: le lien vous suffit, et vous pouvez y revenir quand vous voulez.</p>
      {/* chaque puce = une icône + UN bloc de texte, sinon le flex écarte les mots */}
      <div className="puces">
        <span><span className="k"><Ico n="check" t={15} /></span><span>Nous cherchons pour vous <b>au quotidien</b>, sur les portails, notre carnet d&apos;adresses et notre base off-market.</span></span>
        <span><span className="k"><Ico n="check" t={15} /></span><span>Les biens retenus arrivent ici dès qu&apos;ils sortent&nbsp;— avec ce que nous avons lu, et ce que nous avons écarté.</span></span>
        <span><span className="k"><Ico n="check" t={15} /></span><span>Vos critères sont les vôtres&nbsp;: vous les faites évoluer vous-même, votre conseiller en est informé.</span></span>
        <span><span className="k"><Ico n="check" t={15} /></span><span>Un avis en un clic sur chaque bien&nbsp;— c&apos;est ce qui affine la suite de la recherche.</span></span>
      </div>
      <button className="btn or" style={{ marginTop: 22, width: '100%' }} onClick={onFermer}>J&apos;ai compris</button>
      <div className="bienv-pied">Vous pourrez la revoir à tout moment avec «&nbsp;Comment ça marche&nbsp;?&nbsp;»</div>
    </div>
  );
}

function GrandOk({ titre, texte, rappel, onFermer }: any) {
  return (
    <div className="grandok">
      <div className="rond-ok"><Ico n="check" t={36} /></div>
      <h3>{titre}</h3>
      <p>{texte}</p>
      {rappel && <div className="rappel" dangerouslySetInnerHTML={{ __html: rappel }} />}
      <button className="btn or" style={{ marginTop: 22 }} onClick={onFermer}>Parfait</button>
    </div>
  );
}

/* ══ styles ═══════════════════════════════════════ */
const CSS = `
/* Le CRM verrouille le défilement (html,body overflow:hidden dans globals.css)
   parce que c'est une appli à écran fixe. L'espace client, lui, est une page
   web classique : on rend la main au navigateur. */
html, body{ height:auto !important; min-height:100% !important;
  overflow-x:hidden !important; overflow-y:auto !important;
  -webkit-overflow-scrolling:touch }
:root{
  --encre:#1a2332; --encre2:#2a3a52; --or:#c9a84c; --or-fonce:#a9822f;
  --fond:#f4f6fa; --carte:#fff; --trait:#e3e8f0; --trait-fort:#cfd7e3;
  --plume:#64748b; --plume-clair:#98a4b6;
  --vert:#15803d; --vert-fond:#f0fdf4; --vert-trait:#bbf7d0;
  --prune:#7c3aed; --prune-fond:#f5f3ff; --prune-trait:#ddd6fe;
  --brique:#dc2626; --brique-fond:#fef2f2; --brique-trait:#fecaca;
  --or-fond:#fdfaf1; --or-trait:#ecdcb4;
  --bleu:#2563eb; --bleu-fond:#eff6ff; --bleu-trait:#bfdbfe;
  --ambre:#e0822e; --ambre-clair:#f0a355; --ambre-fond:#fff6ec; --ambre-trait:#f7d5b0;
  --ombre:0 1px 2px rgba(16,24,40,.04), 0 10px 26px -20px rgba(16,24,40,.3);
  --ombre-f:0 2px 4px rgba(16,24,40,.05), 0 20px 44px -24px rgba(16,24,40,.5);
}
*{box-sizing:border-box}
body{margin:0; background:var(--fond); color:var(--encre);
  font-family:'DM Sans','Plus Jakarta Sans',system-ui,-apple-system,sans-serif; font-size:15px; line-height:1.55;
  -webkit-font-smoothing:antialiased}
h1,h2,h3,h4{font-family:'Plus Jakarta Sans',system-ui,sans-serif; letter-spacing:-.4px}
.tab{font-variant-numeric:tabular-nums}
button{font-family:inherit; cursor:pointer; color:inherit; border:none; background:none}
:focus-visible{outline:2px solid var(--or); outline-offset:2px; border-radius:8px}

.chapeau{background:linear-gradient(152deg,#3a5178 0%,#27395a 52%,#2e4166 100%);
  color:#fff; padding:22px 20px 26px; position:relative; overflow:hidden}
.chapeau::after{content:""; position:absolute; top:-130px; right:-80px; width:320px; height:320px;
  border-radius:50%; background:radial-gradient(circle,rgba(201,168,76,.24),transparent 64%)}
.marque{position:relative; display:flex; align-items:center; justify-content:space-between; gap:12px}
.motmarque{font-family:'Plus Jakarta Sans',sans-serif; font-size:11px; font-weight:800; letter-spacing:2.2px; color:var(--or)}
.confid{font-size:9.5px; letter-spacing:1.3px; color:rgba(255,255,255,.42); text-transform:uppercase; font-weight:700}
.chapeau .dedans{position:relative; max-width:680px; margin:0 auto}
.rangee{position:relative; margin-top:18px; display:flex; flex-direction:column; gap:13px}
.ident{position:relative; display:flex; align-items:center; gap:13px}
.mono{width:48px; height:48px; border-radius:50%; background:rgba(255,255,255,.08);
  border:1px solid rgba(201,168,76,.45); display:flex; align-items:center; justify-content:center;
  font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:18px; color:var(--or); flex:0 0 auto}
.ident h1{margin:0; font-size:19.5px; font-weight:800; color:#fff; line-height:1.18; letter-spacing:-.2px}
.ident .ref{font-size:11.5px; color:rgba(255,255,255,.45); margin-top:3px}

/* — le chasseur qui suit le dossier — */
.agent{display:flex; align-items:center; gap:12px;
  background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.14);
  border-radius:16px; padding:11px 12px 11px 14px}
.agent-id{min-width:0; margin-right:auto}
.agent-sur{display:block; font-size:9.5px; letter-spacing:1.3px; text-transform:uppercase;
  color:var(--or); font-weight:800}
.agent-id b{display:block; font-family:'Plus Jakarta Sans',sans-serif; font-size:14.5px;
  font-weight:800; color:#fff; margin-top:3px; line-height:1.2}
.agent-role{display:block; font-size:11px; color:rgba(255,255,255,.45); margin-top:3px}
.agent-act{display:flex; gap:8px; flex:0 0 auto}
.act{display:inline-flex; align-items:center; gap:7px; border-radius:99px; padding:9px 14px;
  font-family:'Plus Jakarta Sans',sans-serif; font-size:12.5px; font-weight:800;
  text-decoration:none; white-space:nowrap; background:var(--or); color:#1a2332;
  border:1px solid transparent; transition:transform .16s cubic-bezier(.16,1,.3,1), background .2s}
.act.fant{background:rgba(255,255,255,.1); border-color:rgba(255,255,255,.2); color:#fff}
.act:active{transform:scale(.96)}
/* Sur téléphone, le chasseur tient sur une seule ligne discrète sous le nom
   du client : il est présent dans toutes les vues, il ne doit pas peser. */
@media(max-width:759px){
  .agent{background:none; border:0; border-top:1px solid rgba(255,255,255,.13);
    border-radius:0; padding:11px 0 0; gap:10px}
  .agent-id{display:flex; align-items:center; gap:7px; flex-wrap:wrap}
  .agent-sur{font-size:9px; letter-spacing:1.1px; color:rgba(255,255,255,.4)}
  .agent-id b{font-size:12.5px; margin-top:0; color:rgba(255,255,255,.92)}
  .agent-role{display:none}
  .agent-act{gap:7px}
  .act{width:33px; height:33px; padding:0; border-radius:50%; justify-content:center}
  .act span{display:none}
}
.veilleligne{position:relative; display:inline-flex; align-items:center; gap:9px;
  background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.15);
  border-radius:99px; padding:7px 15px 7px 12px; font-size:12.5px; color:rgba(255,255,255,.85)}
.veilleligne{white-space:nowrap}
.pouls{width:7px; height:7px; border-radius:50%; background:#5fd39b; flex:0 0 auto;
  box-shadow:0 0 0 0 rgba(95,211,155,.6); animation:pouls 2.6s ease-out infinite}
@keyframes pouls{0%{box-shadow:0 0 0 0 rgba(95,211,155,.5)}70%{box-shadow:0 0 0 9px rgba(95,211,155,0)}100%{box-shadow:0 0 0 0 rgba(95,211,155,0)}}

.page{max-width:680px; margin:0 auto; padding:0 20px 80px}
.accueil{display:block}

/* Les règles grand écran sont regroupées en fin de feuille (voir plus bas). */
@keyframes monte{from{opacity:0; transform:translateY(18px)}to{opacity:1; transform:none}}
.vue > *{animation:monte .5s cubic-bezier(.16,1,.3,1) both}
.vue > *:nth-child(2){animation-delay:.06s} .vue > *:nth-child(3){animation-delay:.12s}
.vue > *:nth-child(4){animation-delay:.18s} .vue > *:nth-child(5){animation-delay:.24s}
.vue > *:nth-child(6){animation-delay:.3s} .vue > *:nth-child(7){animation-delay:.36s}
.vue > *:nth-child(8){animation-delay:.42s} .vue > *:nth-child(9){animation-delay:.48s}
/* ⚠️ La cascade s'arrêtait ici : « Rappel de ma recherche » compte onze blocs,
   et les deux derniers apparaissaient d'un coup, sans décalage. */
.vue > *:nth-child(10){animation-delay:.54s} .vue > *:nth-child(11){animation-delay:.6s}
.vue > *:nth-child(12){animation-delay:.66s} .vue > *:nth-child(13){animation-delay:.72s}

.hero{position:relative; overflow:hidden; margin-top:24px; background:var(--carte);
  border:1px solid var(--trait); border-radius:22px; padding:24px 22px; box-shadow:var(--ombre)}
.hero::before{content:""; position:absolute; top:-90px; right:-70px; width:240px; height:240px;
  border-radius:50%; background:radial-gradient(circle,rgba(201,168,76,.14),transparent 68%)}
.hero::after{content:""; position:absolute; left:0; top:0; bottom:0; width:4px;
  background:linear-gradient(180deg,var(--or),var(--ambre))}
.hero .sur{position:relative; font-size:10px; letter-spacing:1.6px; text-transform:uppercase; color:var(--or-fonce); font-weight:800}
.hero h2{position:relative; margin:9px 0 11px; font-size:26px; font-weight:800; line-height:1.15}
.hero p{position:relative; margin:0; color:var(--plume); font-size:14.5px; line-height:1.7}
.hero p b{color:var(--encre); font-weight:700}
.puces{position:relative; display:flex; flex-direction:column; gap:10px; margin-top:18px; padding-top:18px; border-top:1px solid var(--trait)}
.puces > span{display:flex; align-items:flex-start; gap:10px; font-size:13.5px; color:var(--encre); line-height:1.5}
.puces > span > span:not(.k){display:block; min-width:0}
.puces .k{color:var(--vert); flex:0 0 auto; margin-top:1px}
.prochaine{position:relative; display:inline-flex; align-items:center; gap:9px; margin-top:18px;
  background:var(--vert-fond); border:1px solid var(--vert-trait); border-radius:99px;
  padding:8px 15px 8px 12px; font-size:12.5px; font-weight:700; color:var(--vert)}

.bandeau-chiffres{display:flex; gap:1px; background:var(--trait); border:1px solid var(--trait);
  border-radius:16px; overflow:hidden; margin-top:20px; box-shadow:var(--ombre)}
.bc{flex:1; background:var(--carte); padding:14px 10px; text-align:center}
/* Le « ? » est en exposant, HORS du flux : le chiffre reste donc parfaitement
   centré au-dessus de son intitulé, la pastille déborde simplement à sa droite. */
.bc .n{font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:21px; letter-spacing:-.8px;
  line-height:1; display:block}
.bc .nv{position:relative; display:inline-block}
.bc .nv .aide-pt{position:absolute; left:100%; top:-5px; margin-left:3px}
.bc .n.or{color:var(--or-fonce)}
.bc .l{font-size:10px; letter-spacing:.7px; text-transform:uppercase; color:var(--plume-clair);
  font-weight:700; margin-top:6px}
.aide-pt{width:15px; height:15px; flex:0 0 auto; border-radius:50%; border:1px solid var(--trait-fort);
  background:var(--carte); color:var(--plume-clair); font-family:inherit; font-size:10px; font-weight:800;
  line-height:1; display:inline-flex; align-items:center; justify-content:center; padding:0;
  transition:color .15s, border-color .15s, background .15s}
.aide-pt:hover{color:var(--or-fonce); border-color:var(--or-trait); background:var(--or-fond)}
.sep{display:flex; align-items:center; gap:12px; margin:26px 0 14px}
.sep span{font-size:11px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase; color:var(--plume-clair)}
.sep i{flex:1; height:1px; background:var(--trait)}

.grille{display:grid; grid-template-columns:repeat(2,1fr); gap:12px}
.case{position:relative; background:var(--carte); border:1px solid var(--trait); border-radius:20px;
  padding:18px 17px 16px; text-align:left; box-shadow:var(--ombre); width:100%; overflow:hidden;
  display:flex; flex-direction:column; gap:13px;
  transition:transform .24s cubic-bezier(.16,1,.3,1), box-shadow .24s ease, border-color .24s ease}
.case:hover{transform:translateY(-4px); box-shadow:var(--ombre-f); border-color:var(--trait-fort)}
.case:hover .ico{transform:translateY(-2px) rotate(-4deg)}
.case:hover .chev{transform:translateX(4px)}
.case:active{transform:scale(.982)}
.case.large{grid-column:1 / -1}
.ico{width:44px; height:44px; border-radius:14px; display:flex; align-items:center; justify-content:center;
  background:var(--fond); border:1px solid var(--trait); color:var(--encre2);
  transition:transform .32s cubic-bezier(.34,1.56,.64,1)}
.case h3{margin:0 0 4px; font-size:16px; font-weight:800; line-height:1.28}
.case p{margin:0; font-size:13px; color:var(--plume); line-height:1.5}
.chev{color:var(--plume-clair); transition:transform .24s cubic-bezier(.16,1,.3,1)}
.pied-case{display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:auto}
.case.phare{border-color:var(--ambre-trait); background:linear-gradient(150deg,var(--ambre-fond) 0%,var(--carte) 56%)}
.case.phare .ico{background:linear-gradient(140deg,var(--ambre-clair),var(--ambre)); border-color:var(--ambre);
  color:#fff; box-shadow:0 10px 20px -8px var(--ambre)}
.case.phare::before{content:""; position:absolute; top:-70px; right:-50px; width:190px; height:190px;
  border-radius:50%; background:radial-gradient(circle,rgba(224,130,46,.18),transparent 66%)}
.case.phare .badge{background:var(--ambre); box-shadow:0 6px 16px -4px var(--ambre)}
.case.phare .pied-case span:first-child{color:var(--ambre)}
.tete-case{display:flex; align-items:flex-start; justify-content:space-between; gap:12px; position:relative}
.badge{min-width:26px; height:26px; border-radius:99px; background:var(--or); color:#fff;
  font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:13px;
  display:flex; align-items:center; justify-content:center; padding:0 8px;
  box-shadow:0 6px 16px -5px var(--or); animation:pop .55s cubic-bezier(.34,1.56,.64,1) both}
.badge.gris{background:var(--trait); color:var(--plume); box-shadow:none}
@keyframes pop{from{transform:scale(.3); opacity:0}to{transform:scale(1); opacity:1}}
.apercu{display:flex; flex-direction:column; gap:7px; position:relative}
/* Les cartes du haut font une demi-largeur : l'aperçu n'a qu'environ 105 px.
   « 68 m² · 790 000 € » n'y tient pas d'un bloc et se ferait couper en plein
   milieu du prix. On empile : le prix d'abord, la surface en dessous. */
.apl{display:flex; align-items:center; gap:8px; font-size:12px; color:var(--plume); min-width:0}
.apl .et{min-width:0; display:flex; flex-direction:column; line-height:1.32}
.apl .et i{font-style:normal; font-size:11px; color:var(--plume-clair);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.apl .pt{width:24px; height:24px; border-radius:7px; flex:0 0 auto; font-size:9px; overflow:hidden;
  background:linear-gradient(148deg,#3a5178,#22314c); color:rgba(255,255,255,.5);
  display:flex; align-items:center; justify-content:center}
.apl .pt img{width:100%; height:100%; object-fit:cover}
.apl b{color:var(--encre); font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.apl-s{font-size:11.5px; color:var(--plume-clair); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-left:32px; margin-top:-3px}
.mini{display:flex; align-items:flex-end; gap:4px; height:34px}
.mini i{flex:1; background:var(--or-trait); border-radius:3px 3px 0 0; min-height:4px;
  animation:pousse .7s cubic-bezier(.16,1,.3,1) both; transform-origin:bottom}
.mini i.fort{background:var(--or)}
@keyframes pousse{from{transform:scaleY(.05); opacity:0}to{transform:scaleY(1); opacity:1}}

.chasseur{display:flex; align-items:center; gap:14px; background:var(--carte); border:1px solid var(--trait);
  border-radius:20px; padding:16px; box-shadow:var(--ombre)}
.chasseur .av{width:48px; height:48px; border-radius:50%; background:var(--encre); color:var(--or);
  display:flex; align-items:center; justify-content:center; font-family:'Plus Jakarta Sans',sans-serif;
  font-weight:800; font-size:16px; flex:0 0 auto}
.chasseur h4{margin:0; font-size:15px; font-weight:800}
.chasseur p{margin:2px 0 0; font-size:12.5px; color:var(--plume)}
.tel{margin-left:auto; background:var(--vert-fond); color:var(--vert); border:1px solid var(--vert-trait);
  border-radius:12px; padding:10px 14px; font-weight:800; font-size:13px; text-decoration:none;
  display:inline-flex; align-items:center; gap:7px; font-family:'Plus Jakarta Sans',sans-serif}
.engage{display:flex; flex-direction:column; gap:11px; background:var(--encre); color:var(--fond);
  border-radius:20px; padding:20px; box-shadow:var(--ombre)}
.engage .t{font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:var(--or); font-weight:800}
.engage div{display:flex; gap:11px; align-items:flex-start; font-size:13.5px; line-height:1.55}
.engage .k{color:var(--or); flex:0 0 auto; margin-top:1px}
.avis-lien{background:var(--fond); border:1px dashed var(--trait-fort); border-radius:16px;
  padding:14px 16px; font-size:12.5px; color:var(--plume); line-height:1.65; display:flex; gap:11px; align-items:flex-start}

.retour{display:inline-flex; align-items:center; gap:8px; background:var(--carte); border:1px solid var(--trait);
  border-radius:99px; padding:9px 16px 9px 12px; font-family:'Plus Jakarta Sans',sans-serif;
  font-weight:700; font-size:13.5px; color:var(--encre); margin:22px 0 18px; box-shadow:var(--ombre);
  transition:transform .18s cubic-bezier(.16,1,.3,1), box-shadow .18s, border-color .18s}
.retour:hover{border-color:var(--trait-fort); box-shadow:var(--ombre-f)}
.retour:active{transform:scale(.95)}
.tete-vue{display:flex; align-items:center; gap:13px; margin-bottom:8px}
.tete-vue .ico{width:46px; height:46px; border-radius:15px}
.tete-vue h2{margin:0; font-size:22px; font-weight:800; line-height:1.2}
.sous-vue{color:var(--plume); font-size:14.5px; margin:0 0 22px; line-height:1.65}
.bloc-titre{display:flex; align-items:center; gap:10px; margin:28px 0 13px}
.bloc-titre h3{margin:0; font-size:16px; font-weight:800}
.bloc-titre .n{background:var(--trait); color:var(--plume); border-radius:99px; padding:1px 9px;
  font-size:12px; font-weight:800; font-family:'Plus Jakarta Sans',sans-serif}
.bloc-titre .n.or{background:var(--ambre); color:#fff}

.liste{display:flex; flex-direction:column; gap:11px}
.bien{display:block; background:var(--carte); border:1px solid var(--trait); border-radius:18px;
  padding:0; text-align:left; width:100%; box-shadow:var(--ombre); position:relative; overflow:hidden;
  transition:transform .2s cubic-bezier(.16,1,.3,1), box-shadow .2s ease, border-color .2s ease}
.bien:hover{transform:translateY(-3px); border-color:var(--trait-fort); box-shadow:var(--ombre-f)}
.bien:hover .fleche{transform:translateX(4px)}
.bien:active{transform:scale(.99)}
.bien.neuf{border-color:var(--ambre-trait)}
.bien.neuf::before{content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--ambre); z-index:2}
/* La bande de photos : une à trois vues côte à côte, en haut de la carte. */
/* Hauteur fixe et mosaïque : une grande vue à gauche, deux petites empilées.
   Sans hauteur imposée, les petites tuiles laissaient un vide gris sous elles. */
.bande-ph{display:grid; gap:2px; background:var(--trait); height:158px}
.bande-ph.n1{grid-template-columns:1fr}
.bande-ph.n2{grid-template-columns:1fr 1fr}
.bande-ph.n3{grid-template-columns:1.9fr 1fr; grid-template-rows:1fr 1fr}
.bande-ph.n3 .ph:first-child{grid-row:span 2}
.bande-ph .ph{display:flex; align-items:center; justify-content:center; overflow:hidden; min-height:0;
  background:linear-gradient(148deg,#3a5178,#22314c); color:rgba(255,255,255,.45)}
.bande-ph img{width:100%; height:100%; object-fit:cover; display:block}
@media(min-width:760px){ .bande-ph{height:196px} }
.ph-vide{font-size:20px}
.corps-bien{display:block; padding:12px 14px 14px}
.haut-bien{display:flex; align-items:center; gap:8px; margin-bottom:7px}
.dat{font-size:11px; font-weight:700; color:var(--plume-clair)}
.bien h4{margin:0 0 4px; font-size:15.5px; font-weight:800; line-height:1.3;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden}
.bien .meta{font-size:12.5px; color:var(--plume); display:block; line-height:1.5}
.bien .prix{display:block; font-family:'Plus Jakarta Sans',sans-serif; font-size:19px; font-weight:800;
  color:var(--or-fonce); line-height:1.1; margin-top:9px; letter-spacing:-.5px}
.fleche{margin-left:auto; color:var(--plume-clair); display:flex; transition:transform .2s cubic-bezier(.16,1,.3,1)}
.etiq{display:inline-flex; align-items:center; gap:5px; border-radius:99px; padding:3px 10px;
  font-size:11px; font-weight:800; border:1px solid transparent}
.etiq.neuf{background:var(--ambre); color:#fff}
.etiq.vu{background:var(--bleu-fond); color:var(--bleu); border-color:var(--bleu-trait)}
.etiq.oui{background:var(--vert-fond); color:var(--vert); border-color:var(--vert-trait)}
.etiq.visite{background:var(--prune-fond); color:var(--prune); border-color:var(--prune-trait)}
.etiq.non{background:var(--brique-fond); color:var(--brique); border-color:var(--brique-trait)}
.relance{background:var(--or-fond); border:1px solid var(--or-trait); border-radius:16px;
  padding:14px 16px; font-size:13.5px; color:var(--or-fonce); display:flex; gap:11px; align-items:flex-start; margin-bottom:12px}
.vide-sec{color:var(--plume-clair); font-size:14px; padding:26px 16px; text-align:center;
  background:var(--carte); border:1px dashed var(--trait-fort); border-radius:16px; line-height:1.6}

.note{font-size:14px; color:var(--plume); margin-top:16px; line-height:1.7}
.legende{font-size:12.5px; color:var(--plume-clair); line-height:1.6; margin:10px 0 0}

/* l'aperçu du marché sur la carte d'accueil */
.apm-t{font-size:9.5px; letter-spacing:.8px; text-transform:uppercase; color:var(--plume-clair);
  font-weight:800; margin-bottom:8px}

/* l'entonnoir : lues → écartées → retenues */
.entonnoir{background:var(--carte); border:1px solid var(--trait); border-radius:18px;
  padding:18px; box-shadow:var(--ombre)}
.ent-t{font-size:10.5px; letter-spacing:1.3px; text-transform:uppercase; color:var(--plume-clair);
  font-weight:800; margin-bottom:15px}
.ent + .ent{margin-top:14px}
.ent-h{display:flex; align-items:baseline; gap:9px; font-size:13.5px; color:var(--plume); line-height:1.4}
.ent-h b{font-family:'Plus Jakarta Sans',sans-serif; font-size:21px; font-weight:800;
  letter-spacing:-.7px; color:var(--encre); flex:0 0 auto}
.ent-h b.or, .ent-h .or{color:var(--or-fonce)}
.ent-h b.pale{color:var(--plume-clair)}
.ent-b{height:8px; border-radius:99px; background:var(--fond); margin-top:8px; overflow:hidden}
.ent-b i{display:block; height:100%; border-radius:99px; background:var(--encre2);
  animation:etire .8s cubic-bezier(.16,1,.3,1) both; transform-origin:left}
.ent-b i.pale{background:var(--trait-fort)}
.ent-b i.or{background:linear-gradient(90deg,var(--or),var(--ambre))}
@keyframes etire{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.graphe{background:var(--carte); border:1px solid var(--trait); border-radius:18px; padding:18px; box-shadow:var(--ombre); margin-top:12px}
.barres{display:flex; align-items:flex-end; gap:7px; height:110px; margin-top:14px}
.barre{flex:1; display:flex; flex-direction:column; align-items:center; gap:7px; height:100%; justify-content:flex-end}
.barre i{width:100%; background:var(--or-trait); border-radius:5px 5px 0 0; min-height:5px;
  animation:pousse .8s cubic-bezier(.16,1,.3,1) both; transform-origin:bottom}
.barre.auj i{background:var(--or)}
.barre b{font-family:'Plus Jakarta Sans',sans-serif; font-size:11px; font-weight:800; color:var(--encre)}
.barre span{font-size:10px; color:var(--plume-clair); font-weight:700; text-transform:uppercase}

.bloc{background:var(--carte); border:1px solid var(--trait); border-radius:18px; padding:18px; box-shadow:var(--ombre)}
.bloc + .bloc{margin-top:12px}
.bloc .t{display:flex; align-items:center; gap:9px; font-size:10.5px; letter-spacing:1.3px; text-transform:uppercase;
  color:var(--plume-clair); font-weight:800; margin-bottom:13px}
.gros{font-family:'Plus Jakarta Sans',sans-serif; font-size:26px; font-weight:800; letter-spacing:-1px; line-height:1.1}
.gros small{font-size:14px; font-weight:700; color:var(--plume); letter-spacing:0}
.trio{display:grid; grid-template-columns:repeat(3,1fr); gap:10px}
.mini-t{background:var(--fond); border:1px solid var(--trait); border-radius:14px; padding:13px 8px; text-align:center}
.mini-t .v{font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:18px; letter-spacing:-.5px}
.mini-t .l{font-size:9.5px; letter-spacing:.8px; text-transform:uppercase; color:var(--plume-clair); margin-top:4px; font-weight:700}
.pastilles{display:flex; flex-wrap:wrap; gap:7px}
.past{background:var(--fond); border:1px solid var(--trait); border-radius:99px; padding:6px 13px; font-size:13px; font-weight:600}
.past.or{background:var(--or-fond); border-color:var(--or-trait); color:var(--or-fonce); font-weight:700}
.precisions{background:var(--carte); border:1px solid var(--trait); border-radius:18px; padding:18px; margin-top:12px; box-shadow:var(--ombre)}
.precisions .k{display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;
  font-size:10.5px; letter-spacing:1.3px; text-transform:uppercase;
  color:var(--plume-clair); font-weight:800; margin-bottom:13px}
.precisions .k > span:first-child{display:flex; align-items:center; gap:8px}
.cadenas{display:inline-flex; align-items:center; gap:5px; background:var(--fond);
  border:1px solid var(--trait); border-radius:99px; padding:4px 10px; font-size:9.5px;
  letter-spacing:.7px; color:var(--plume-clair); font-weight:800; text-transform:uppercase}
/* une note citée, pas un champ de saisie : trait doré à gauche, pas de cadre */
.precisions .corps{margin:0; background:none; border:0; border-left:3px solid var(--or-trait);
  border-radius:0; padding:3px 0 3px 16px; font-size:14.5px; line-height:1.78;
  color:var(--encre); white-space:pre-line}
.cta-prec{display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%;
  margin-top:14px; background:var(--or-fond); border:1px solid var(--or-trait); border-radius:14px;
  padding:14px 16px; text-align:left;
  transition:transform .18s cubic-bezier(.16,1,.3,1), box-shadow .18s, border-color .18s}
.cta-prec:hover{border-color:var(--or); box-shadow:var(--ombre-f)}
.cta-prec:hover .chev{transform:translateX(4px)}
.cta-prec:active{transform:scale(.985)}
.cta-prec b{display:block; font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:800; color:var(--or-fonce)}
.cta-prec span.s{display:block; font-size:12.5px; color:var(--plume); margin-top:3px}

/* La phrase de rappel, en tête de « Rappel de ma recherche » */
.resume-r{margin:22px 0 20px; background:var(--carte); border:1px solid var(--trait);
  border-radius:20px; padding:20px 18px 18px; box-shadow:var(--ombre)}
.resume-k{display:flex; align-items:center; gap:7px; font-size:9.5px; letter-spacing:1.8px;
  text-transform:uppercase; font-weight:800; color:var(--or-fonce); margin-bottom:12px}
.resume-k i{width:18px; height:2px; border-radius:2px; background:var(--or); display:block}
.resume-p{margin:0; font-family:'Plus Jakarta Sans',sans-serif; font-size:17.5px; line-height:1.5;
  font-weight:600; letter-spacing:-.3px; color:var(--encre)}
.resume-p b{color:var(--or-fonce); font-weight:800}

/* Le picto de localisation, en face du nom de la commune. La ligne est un
   flex : le carré et le nom sont centrés l'un sur l'autre quoi qu'il arrive,
   même quand un nom passe sur deux lignes. */
.ville-i{flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center;
  width:30px; height:30px; border-radius:10px; background:var(--or-fond);
  border:1px solid var(--or-trait); color:var(--or-fonce)}
/* Les quartiers s'alignent sous le nom, pas sous le picto. */
.ville-n + .pastilles, .ville-n + .ville-tout{margin-left:40px}

/* Le choix du créneau, sous « Je souhaite être rappelé ». Trois cases et rien
   d'autre : on ne demande pas au client d'écrire pour obtenir un appel. */
.fin-recherche{grid-column:1 / -1; display:flex; align-items:center; gap:12px; width:100%;
  background:transparent; border:1.5px dashed var(--trait); border-radius:16px;
  padding:13px 16px; cursor:pointer; font-family:inherit; text-align:left;
  transition:border-color .16s, background .16s}
.fin-recherche:hover{border-color:var(--or); background:var(--or-fond)}
.fin-recherche:active{transform:scale(.99)}
.fin-recherche .fr-ico{font-size:17px; flex-shrink:0}
.fin-recherche .fr-txt{flex-grow:1; min-width:0}
.fin-recherche .fr-txt b{display:block; font-family:'Plus Jakarta Sans',sans-serif;
  font-size:14px; font-weight:800; color:var(--encre)}
.fin-recherche .fr-txt i{display:block; font-style:normal; font-size:12.5px;
  color:var(--plume); margin-top:2px}
.bloc-rappel{margin-top:12px; background:var(--fond); border:1px solid var(--trait);
  border-radius:14px; padding:14px}
.lib-rappel{font-family:'Plus Jakarta Sans',sans-serif; font-size:13px; font-weight:800;
  color:var(--encre); margin-bottom:10px}
.creneaux{display:grid; grid-template-columns:repeat(3,1fr); gap:8px}
.creneau{background:var(--carte); border:1px solid var(--trait); border-radius:12px;
  padding:11px 6px; text-align:center;
  transition:border-color .16s, background .16s, transform .16s cubic-bezier(.16,1,.3,1)}
.creneau:active{transform:scale(.97)}
.creneau b{display:block; font-family:'Plus Jakarta Sans',sans-serif; font-size:12.5px;
  font-weight:800; color:var(--encre)}
.creneau span{display:block; font-size:11.5px; color:var(--plume); margin-top:2px}
.creneau.pris{border-color:var(--or); background:var(--or-fond)}
.creneau.pris b{color:var(--or-fonce)}

.btn{display:inline-flex; align-items:center; justify-content:center; gap:8px; border-radius:14px;
  padding:15px 20px; font-family:'Plus Jakarta Sans',sans-serif; font-size:14.5px; font-weight:800;
  border:1px solid transparent; width:100%; text-decoration:none;
  transition:transform .16s cubic-bezier(.16,1,.3,1), box-shadow .16s ease}
.btn:active{transform:scale(.982)}
.btn.or{background:var(--or); color:#fff; box-shadow:0 12px 24px -12px var(--or)}
.btn.fant{background:var(--carte); color:var(--encre); border-color:var(--trait-fort)}
.btn.encre{background:var(--encre); color:var(--fond)}
.btn.lien{background:none; border:none; color:var(--plume); font-weight:700; font-size:13.5px; padding:12px; width:auto}
.duo{display:flex; gap:10px; margin-top:18px}
.duo .btn{flex:1}

.voile{position:fixed; inset:0; background:rgba(12,17,24,.55); backdrop-filter:blur(3px);
  opacity:0; pointer-events:none; transition:opacity .3s ease; z-index:60}
.voile.on{opacity:1; pointer-events:auto}
.feuille{position:fixed; left:0; right:0; bottom:0; z-index:61; background:var(--carte);
  border-radius:26px 26px 0 0; max-height:92vh; overflow-y:auto; overscroll-behavior:contain;
  transform:translateY(102%); transition:transform .44s cubic-bezier(.16,1,.28,1);
  padding-bottom:calc(22px + env(safe-area-inset-bottom,0px)); box-shadow:0 -12px 40px rgba(12,17,24,.32)}
.feuille.on{transform:translateY(0)}
/* une fiche bien occupe tout l'écran : plus de bandeau de fond au-dessus */
@media(max-width:639px){
  .feuille.pleine, .feuille.fiche{top:0; height:100vh; height:100dvh; max-height:none; border-radius:0;
    padding-bottom:calc(26px + env(safe-area-inset-bottom,0px))}
  .feuille.pleine .grandok{min-height:100dvh; display:flex; flex-direction:column;
    align-items:center; justify-content:center; padding:24px}
}
@media(min-width:640px){
  .feuille{left:50%; right:auto; bottom:auto; top:50%; width:570px; max-height:88vh; border-radius:24px;
    transform:translate(-50%,-44%) scale(.97); opacity:0}
  .feuille.on{transform:translate(-50%,-50%) scale(1); opacity:1}
}
.poignee{width:40px; height:4px; border-radius:99px; background:var(--trait-fort); margin:10px auto 0}
@media(min-width:640px){.poignee{display:none}}
.tete-f{display:flex; align-items:flex-start; justify-content:space-between; gap:14px; padding:16px 20px 12px}
.tete-f h3{margin:0; font-size:19px; font-weight:800; line-height:1.28}
.tete-f .sur{font-size:10px; letter-spacing:1.3px; text-transform:uppercase; color:var(--plume-clair); font-weight:800; margin-bottom:5px}
.fermer{background:var(--fond); border:1px solid var(--trait); border-radius:50%; width:33px; height:33px;
  flex:0 0 auto; color:var(--plume); display:flex; align-items:center; justify-content:center}
.corps-f{padding:0 20px}
.photo-h{position:relative; width:100%; aspect-ratio:3/2; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(148deg,#3a5178,#22314c); color:rgba(255,255,255,.5); overflow:hidden}
.photo-h img{width:100%; height:100%; object-fit:cover}
.points{position:absolute; bottom:10px; left:0; right:0; display:flex; justify-content:center; gap:5px}
.points button{width:6px; height:6px; border-radius:99px; background:rgba(255,255,255,.5); padding:0;
  transition:width .3s cubic-bezier(.16,1,.3,1), background .3s}
.points button.on{width:16px; background:#fff}
/* la pastille reste fine à l'oeil mais large au doigt */
.points button{position:relative}
.points button::after{content:''; position:absolute; inset:-12px}

/* — galerie dans la fiche — */
.galerie{position:relative; background:linear-gradient(148deg,#3a5178,#22314c)}
.bande{display:flex; overflow-x:auto; overflow-y:hidden; scroll-snap-type:x mandatory;
  -webkit-overflow-scrolling:touch; overscroll-behavior-x:contain; scrollbar-width:none}
.bande::-webkit-scrollbar{display:none}
/* scroll-snap-stop:always = une photo par geste, jamais trois d'un coup */
.bande .photo-g{flex:0 0 100%; scroll-snap-align:start; scroll-snap-stop:always;
  width:100%; aspect-ratio:3/2; padding:0; border:0;
  background:transparent; display:block; overflow:hidden; cursor:zoom-in}
.bande .photo-g img{width:100%; height:100%; object-fit:cover; display:block}
/* Sur ordinateur il n'y a pas de doigt : on donne des flèches. */
.fl{display:none; position:absolute; top:50%; transform:translateY(-50%); z-index:3;
  width:38px; height:38px; border-radius:50%; border:0; color:#fff; background:rgba(12,17,24,.5);
  align-items:center; justify-content:center; backdrop-filter:blur(5px);
  transition:background .2s, transform .16s}
.fl.g{left:10px} .fl.d{right:10px}
.fl:hover{background:rgba(12,17,24,.72)}
.fl:active{transform:translateY(-50%) scale(.93)}
@media(hover:hover) and (pointer:fine){ .fl{display:flex} }
.plein .fl{width:46px; height:46px; background:rgba(255,255,255,.14)}
.plein .fl:hover{background:rgba(255,255,255,.26)}
.plein .fl.g{left:18px} .plein .fl.d{right:18px}

.compteur{position:absolute; top:calc(12px + env(safe-area-inset-top,0px)); right:12px; z-index:2;
  display:flex; align-items:center; gap:5px; background:rgba(12,17,24,.5); color:#fff;
  font-size:11.5px; font-weight:700; padding:6px 11px; border-radius:99px;
  backdrop-filter:blur(5px); pointer-events:none}

/* — retour : posé sur la photo et jamais emporté par le défilement —
   un position:fixed se comporterait comme un absolute (la feuille porte un
   transform) et filerait avec le contenu : on passe par un rail collant de
   hauteur nulle, placé en tout premier dans la feuille. */
.barre-retour{position:sticky; top:0; z-index:6; height:0}
.retour-f{position:absolute; z-index:6; top:calc(12px + env(safe-area-inset-top,0px)); left:12px;
  width:42px; height:42px; border-radius:50%; border:0; color:#fff; background:rgba(12,17,24,.48);
  backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center;
  box-shadow:0 8px 20px -8px rgba(0,0,0,.65)}
.retour-f:active{transform:scale(.94)}

/* — plein écran photos — */
.plein{position:fixed; inset:0; z-index:90; background:#0a0e14}
.bande-pe{position:absolute; inset:0; display:flex; overflow-x:auto; overflow-y:hidden;
  scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; touch-action:pan-x;
  overscroll-behavior:contain; scrollbar-width:none}
.bande-pe::-webkit-scrollbar{display:none}
.photo-pe{flex:0 0 100%; width:100%; height:100%; scroll-snap-align:center; scroll-snap-stop:always;
  display:flex; align-items:center; justify-content:center;
  padding:calc(56px + env(safe-area-inset-top,0px)) 0 calc(46px + env(safe-area-inset-bottom,0px))}
.photo-pe img{max-width:100%; max-height:100%; object-fit:contain; display:block}
.barre-pe{position:absolute; top:0; left:0; right:0; z-index:2; display:flex; align-items:center;
  justify-content:space-between; color:#fff; font-size:13px; font-weight:700; pointer-events:none;
  padding:calc(12px + env(safe-area-inset-top,0px)) 14px 18px;
  background:linear-gradient(180deg,rgba(0,0,0,.65),transparent)}
.ferme-pe{pointer-events:auto; width:40px; height:40px; border-radius:50%; background:rgba(255,255,255,.2);
  color:#fff; border:0; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(6px)}
.points-pe{position:absolute; left:0; right:0; bottom:calc(16px + env(safe-area-inset-bottom,0px)); z-index:2;
  display:flex; justify-content:center; gap:5px; pointer-events:none}
.points-pe span{width:6px; height:6px; border-radius:99px; background:rgba(255,255,255,.35);
  transition:width .3s cubic-bezier(.16,1,.3,1), background .3s}
.points-pe span.on{width:16px; background:#fff}

/* — envoi en cours — */
.tourne{width:15px; height:15px; border-radius:50%; display:inline-block;
  border:2px solid rgba(255,255,255,.4); border-top-color:#fff; animation:tourne .7s linear infinite}
.btn.fant .tourne{border-color:rgba(26,35,50,.22); border-top-color:var(--encre)}
@keyframes tourne{to{transform:rotate(360deg)}}
/* En attente : assez présent pour qu'on le voie, assez discret pour qu'on
   comprenne qu'il n'est pas encore tout à fait à nous. */
.btn.fant.attente{color:var(--plume-clair); border-color:var(--trait); border-style:dashed;
  background:var(--fond)}
.btn[disabled]{opacity:.82; cursor:default}
.btn[disabled]:active{transform:none}

/* — pop-up (partage) — */
.pop{position:fixed; inset:0; z-index:95; display:flex; align-items:flex-end; justify-content:center}
.pop-voile{position:absolute; inset:0; background:rgba(10,14,22,.62); backdrop-filter:blur(4px);
  animation:popVoile .26s ease both}
.pop-carte{position:relative; width:100%; max-width:480px; background:var(--carte);
  border-radius:24px 24px 0 0; max-height:92vh; max-height:92dvh; overflow-y:auto;
  overscroll-behavior:contain; box-shadow:0 -14px 44px rgba(12,17,24,.34);
  padding-bottom:calc(18px + env(safe-area-inset-bottom,0px));
  animation:popBas .34s cubic-bezier(.16,1,.28,1) both}
@media(min-width:640px){
  .pop{align-items:center}
  .pop-carte{border-radius:22px; max-height:88vh; animation-name:popCentre;
    box-shadow:0 26px 70px rgba(12,17,24,.34)}
}
@keyframes popVoile{from{opacity:0} to{opacity:1}}
@keyframes popBas{from{transform:translateY(100%)} to{transform:translateY(0)}}
@keyframes popCentre{from{transform:scale(.96); opacity:0} to{transform:scale(1); opacity:1}}
.pop-tete{display:flex; align-items:flex-start; justify-content:space-between; gap:14px; padding:20px 20px 12px}
.pop-tete h3{margin:0; font-size:18px; font-weight:800; line-height:1.3}
.pop-tete .sur{font-size:10px; letter-spacing:1.3px; text-transform:uppercase;
  color:var(--plume-clair); font-weight:800; margin-bottom:5px}
.pop-corps{padding:0 20px}
.pop-fin{text-align:center; padding:28px 24px 10px}
.pop-fin h3{margin:0 0 10px; font-size:20px; font-weight:800}
.pop-fin p{margin:0 0 20px; color:var(--plume); font-size:14.5px; line-height:1.65}
.pop-fin .rond-ok{width:68px; height:68px; border-radius:50%; margin:0 auto 18px; display:flex;
  align-items:center; justify-content:center; background:var(--or-fond); color:var(--or-fonce);
  border:1px solid var(--or-trait)}
.ape{margin-top:14px; border:1px solid var(--trait); border-radius:15px; overflow:hidden; background:var(--fond)}
.ape-t{font-size:10px; letter-spacing:1.1px; text-transform:uppercase; font-weight:800;
  color:var(--plume-clair); padding:12px 14px 0}
.ape-l{display:flex; gap:8px; font-size:13px; padding:9px 14px 0; color:var(--encre); font-weight:700}
.ape-l span{color:var(--plume-clair); font-weight:800; min-width:42px}
.ape-c{font-size:13px; line-height:1.65; color:var(--plume); padding:10px 14px 14px}
.ape-c .lien-ap{color:var(--or-fonce); word-break:break-all}
.err{margin-top:8px; font-size:12.5px; font-weight:700; color:var(--brique)}
.mention{font-size:12.5px; color:var(--plume-clair); text-align:center; margin-bottom:0}
.bandeau-prix{display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding:16px 20px 0}
.bandeau-prix .p{font-family:'Plus Jakarta Sans',sans-serif; font-size:27px; font-weight:800; color:var(--or-fonce); letter-spacing:-1px}
.bandeau-prix .m2{font-size:12.5px; color:var(--plume-clair); font-weight:700}
.specs{display:grid; grid-template-columns:repeat(auto-fit,minmax(86px,1fr)); gap:8px; margin:16px 0 4px}
.spec{background:var(--fond); border:1px solid var(--trait); border-radius:13px; padding:11px 8px; text-align:center}
.spec .v{font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:15px}
.spec .l{font-size:9px; letter-spacing:.9px; text-transform:uppercase; color:var(--plume-clair); margin-top:4px; font-weight:700}
.txt{font-size:14.5px; line-height:1.7; margin:14px 0 0}
.dpe{display:inline-flex; align-items:center; gap:7px; margin-right:14px; margin-top:14px}
.dpe .l{width:26px; height:26px; border-radius:8px; display:flex; align-items:center; justify-content:center;
  font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:14px; color:#1a2332}
.dpe .t{font-size:10.5px; letter-spacing:.9px; text-transform:uppercase; color:var(--plume-clair); font-weight:800}
/* Ce que le bien comprend : une carte par équipement, avec son icône. C'est
   ce que l'acquéreur cherche des yeux en premier — ça mérite de la place. */
.incl{display:grid; grid-template-columns:repeat(auto-fit,minmax(152px,1fr)); gap:9px; margin-top:10px}
.incl .ic{display:flex; align-items:center; gap:11px; background:var(--carte);
  border:1px solid var(--trait); border-radius:15px; padding:11px 13px}
.incl .ic .r{width:34px; height:34px; border-radius:11px; background:var(--fond);
  color:var(--or); display:flex; align-items:center; justify-content:center; flex:0 0 auto}
.incl .ic .n{font-family:'Plus Jakarta Sans',sans-serif; font-weight:700;
  font-size:13.5px; color:var(--encre); line-height:1.25}

/* Ce que le bien coûte à vivre : même grammaire, le chiffre en avant et
   l'unité en dessous, pour qu'on ne confonde pas trimestre et année. */
.cout{display:grid; grid-template-columns:repeat(auto-fit,minmax(152px,1fr)); gap:9px; margin-top:10px}
.cout .c{background:var(--carte); border:1px solid var(--trait); border-radius:15px; padding:13px 14px}
.cout .c .h{display:flex; align-items:center; gap:7px; color:var(--plume-clair)}
.cout .c .l{font-size:9.5px; letter-spacing:1px; text-transform:uppercase; font-weight:800}
.cout .c .v{font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:18px;
  color:var(--encre); margin-top:8px; line-height:1.2}
.cout .c .lettre{display:inline-flex; align-items:center; justify-content:center;
  width:36px; height:36px; border-radius:11px; color:#1a2332;
  font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:18px}
.cout .c .u{display:block; font-family:'Inter',sans-serif; font-size:11px;
  color:var(--plume-clair); font-weight:700; margin-top:3px; letter-spacing:.3px}

/* La description : un pavé de dix lignes décourage la lecture. On n'en montre
   que le début, le bas s'estompe, et « Lire la suite » déroule le reste. */
.desc{margin-top:16px}
.desc-t{overflow:hidden; transition:max-height .42s cubic-bezier(.16,1,.3,1)}
.desc-t[data-court]{-webkit-mask-image:linear-gradient(#000 58%,transparent 100%);
  mask-image:linear-gradient(#000 58%,transparent 100%)}
.desc-t .txt:first-child{margin-top:0}
.plus{display:inline-flex; align-items:center; gap:7px; margin-top:8px; padding:7px 0;
  background:none; border:none; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif;
  font-size:13px; font-weight:800; color:var(--or); letter-spacing:.2px}
.plus .ch{display:flex; transform:rotate(90deg);
  transition:transform .4s cubic-bezier(.16,1,.3,1)}
.plus .ch[data-o]{transform:rotate(-90deg)}

.avis3{display:grid; grid-template-columns:repeat(3,1fr); gap:9px; margin-top:8px}
.avis{background:var(--fond); border:2px solid var(--trait); border-radius:16px; padding:14px 6px;
  display:flex; flex-direction:column; align-items:center; gap:7px;
  transition:transform .22s cubic-bezier(.16,1,.3,1), border-color .2s, background .2s}
.avis .e{font-size:23px; line-height:1}
.avis .n{font-size:12px; font-weight:700; color:var(--plume); text-align:center; line-height:1.3}
.avis:active{transform:scale(.95)}
.avis[aria-pressed="true"]{transform:translateY(-3px)}
.avis[data-a="oui"][aria-pressed="true"]{border-color:var(--vert); background:var(--vert-fond)}
.avis[data-a="oui"][aria-pressed="true"] .n{color:var(--vert)}
.avis[data-a="visite"][aria-pressed="true"]{border-color:var(--prune); background:var(--prune-fond)}
.avis[data-a="visite"][aria-pressed="true"] .n{color:var(--prune)}
.avis[data-a="non"][aria-pressed="true"]{border-color:var(--brique); background:var(--brique-fond)}
.avis[data-a="non"][aria-pressed="true"] .n{color:var(--brique)}
/* Avis envoyé : les trois boutons restent lisibles, le choix garde sa
   couleur, les deux autres s'effacent. Plus rien ne réagit au doigt. */
.avis[data-fige="1"]{cursor:default}
.avis[data-fige="1"]:active{transform:none}
.avis[data-fige="1"][aria-pressed="false"]{opacity:.38}
textarea,input[type="email"]{width:100%; border:1px solid var(--trait-fort); border-radius:13px; padding:13px;
  font-family:inherit; font-size:15px; color:var(--encre); background:var(--fond); resize:vertical}
textarea:focus,input:focus{outline:none; border-color:var(--or); background:var(--carte)}
label.lab{display:block; font-size:10px; letter-spacing:1.3px; text-transform:uppercase;
  color:var(--plume-clair); font-weight:800; margin:18px 0 8px}
.fige{background:var(--fond); border:1px solid var(--trait); border-radius:13px; padding:13px;
  font-size:13.5px; color:var(--plume); line-height:1.65}
.pas{display:flex; align-items:center; justify-content:space-between; gap:10px;
  background:var(--fond); border:1px solid var(--trait); border-radius:14px; padding:8px 10px}
.pas .val{font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:19px; flex:1; text-align:center; letter-spacing:-.5px}
.rond{width:34px; height:34px; border-radius:50%; border:1px solid var(--trait-fort); background:var(--carte);
  font-size:19px; line-height:1; display:flex; align-items:center; justify-content:center; flex:0 0 auto;
  transition:transform .16s cubic-bezier(.16,1,.3,1)}
.rond:active{transform:scale(.87)}
/* — où je cherche : une ville, ses quartiers — */
.villes{display:flex; flex-direction:column; gap:14px}
.ville-n{display:flex; align-items:center; gap:10px;
  font-family:'Plus Jakarta Sans',sans-serif; font-size:16px; font-weight:800;
  color:var(--encre); margin-bottom:10px; letter-spacing:-.2px}
.ville-tout{font-size:13px; color:var(--plume); font-style:italic}
.ville + .ville{border-top:1px solid var(--trait); padding-top:14px}

/* — le sélecteur, dans « Mes critères ont évolué » — */
.loc{display:flex; flex-direction:column; gap:12px}
.loc-ville{background:var(--fond); border:1px solid var(--trait); border-radius:16px; padding:14px}
.loc-tete{display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:11px}
.loc-n{font-family:'Plus Jakarta Sans',sans-serif; font-size:15.5px; font-weight:800; color:var(--encre)}
.loc-n em{font-style:normal; font-size:12px; font-weight:700; color:var(--plume-clair)}
.loc-n2{font-family:'Plus Jakarta Sans',sans-serif; font-size:13.5px; font-weight:800;
  color:var(--plume); margin-bottom:10px}
.loc-x{display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700;
  color:var(--plume-clair); background:var(--carte); border:1px solid var(--trait);
  border-radius:99px; padding:5px 11px}
.loc-x:hover{color:var(--brique); border-color:var(--brique-trait); background:var(--brique-fond)}
.loc-ajout{display:flex; gap:7px; margin-top:10px}
.loc-ajout input{flex:1; border:1px solid var(--trait-fort); border-radius:11px; padding:10px 12px;
  font-size:13.5px; font-family:inherit; background:var(--carte); color:var(--encre)}
.loc-ajout input:focus{outline:none; border-color:var(--or)}
.loc-plus{flex:0 0 auto; border-radius:11px; padding:0 15px; font-size:12.5px; font-weight:800;
  font-family:'Plus Jakarta Sans',sans-serif; background:var(--encre); color:#fff; border:0}
.loc-neuve{border-style:dashed}
.loc-rech{position:relative}
.loc-rech input{width:100%; border:1px solid var(--trait-fort); border-radius:11px; padding:11px 12px;
  font-size:13.5px; font-family:inherit; background:var(--carte); color:var(--encre)}
.loc-rech input:focus{outline:none; border-color:var(--or)}
.loc-sug{position:absolute; left:0; right:0; top:calc(100% + 6px); z-index:4; background:var(--carte);
  border:1px solid var(--trait); border-radius:13px; box-shadow:var(--ombre-f); overflow:hidden}
.loc-sug button{display:flex; align-items:center; gap:9px; width:100%; text-align:left;
  padding:11px 13px; font-size:13.5px; color:var(--encre); background:none; border:0}
.loc-sug button + button{border-top:1px solid var(--trait)}
.loc-sug button:hover{background:var(--fond)}
.loc-sug b{font-weight:800; color:var(--plume)}
.loc-sug em{margin-left:auto; font-style:normal; font-size:10.5px; font-weight:700; color:var(--or-fonce)}

/* — arrêts de transport choisis — */
.arrets-v{display:flex; flex-direction:column; gap:14px}
.arret-v + .arret-v{border-top:1px solid var(--trait); padding-top:14px}
.arret-n{font-family:'Plus Jakarta Sans',sans-serif; font-size:15.5px; font-weight:800; color:var(--encre)}
.arret-m{display:block; font-family:'DM Sans',sans-serif; font-size:12.5px; font-weight:600;
  color:var(--plume); margin-top:3px}
.past-x{margin-left:6px; opacity:.5; background:none; border:0; color:inherit; padding:0;
  display:inline-flex; vertical-align:middle}
.past-x:hover{opacity:1; color:var(--brique)}
.sep-crit{display:flex; align-items:center; gap:12px; margin:24px 0 14px}
.sep-crit span{font-size:10.5px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase;
  color:var(--plume-clair)}
.sep-crit i{flex:1; height:1px; background:var(--trait)}
.rappel-lignes{display:flex; align-items:center; gap:7px; margin-top:9px; font-size:12px;
  color:var(--plume-clair); font-weight:600}
.borne{font-size:10px; letter-spacing:1.1px; text-transform:uppercase; color:var(--plume-clair);
  font-weight:800; margin:12px 0 7px}
.jauge{height:6px; border-radius:99px; background:var(--trait); margin-top:11px; overflow:hidden}
.jauge i{display:block; height:100%; background:var(--or); border-radius:99px;
  transition:width .42s cubic-bezier(.16,1,.3,1), margin-left .42s cubic-bezier(.16,1,.3,1)}
.choix{display:flex; flex-wrap:wrap; gap:7px}
.ch{background:var(--fond); border:1.5px solid var(--trait); border-radius:99px; padding:9px 15px;
  font-size:13.5px; font-weight:700; color:var(--plume);
  transition:transform .2s cubic-bezier(.34,1.56,.64,1), border-color .18s, background .18s, color .18s}
.ch:active{transform:scale(.93)}
.ch[aria-pressed="true"]{background:var(--encre); border-color:var(--encre); color:var(--fond)}
.ch.or[aria-pressed="true"]{background:var(--or); border-color:var(--or); color:#fff}
.grandok{text-align:center; padding:8px 24px 26px}
.grandok .rond-ok{width:76px; height:76px; border-radius:50%; margin:14px auto 20px;
  background:var(--vert-fond); color:var(--vert); display:flex; align-items:center; justify-content:center;
  border:2px solid var(--vert-trait); animation:pop .6s cubic-bezier(.34,1.56,.64,1) both}
.grandok h3{margin:0 0 12px; font-size:22px; font-weight:800; line-height:1.25}
.grandok p{margin:0 auto; max-width:380px; color:var(--plume); font-size:14.5px; line-height:1.7}
.grandok .rappel{margin-top:18px; background:var(--fond); border:1px solid var(--trait); border-radius:14px;
  padding:14px 16px; font-size:13px; color:var(--plume); line-height:1.6}
.grandok .rappel b{color:var(--encre)}
.pied{text-align:center; padding:34px 20px 10px; color:var(--plume-clair); font-size:12px; line-height:1.8}
.pied b{color:var(--plume); font-weight:700}
/* À partir de la tablette, la page s'élargit et le client et son chasseur
   tiennent sur une ligne. Le sous-titre du chasseur saute pour rester compact. */
@media(min-width:760px){
  .chapeau{padding:22px 30px 26px}
  .chapeau .dedans{max-width:900px}
  .page{max-width:900px; padding:0 30px 84px}
  .rangee{flex-direction:row; align-items:center; justify-content:space-between; gap:20px}
  .ident h1{font-size:22px; white-space:nowrap}
  .agent{padding:9px 10px 9px 14px}
  .agent-id b{font-size:13px}
  .agent-role{display:none}
  .act{padding:8px 12px; font-size:12px}
  .sur-dossier{display:inline}
}

/* Sur écran d'ordinateur, la page s'étale au lieu de rester en colonne. */
@media(min-width:1024px){
  .chapeau{padding:24px 40px 28px}
  .chapeau .dedans{max-width:1160px}
  .ident h1{font-size:24px}
  .mono{width:52px; height:52px; font-size:19px}
  .agent{min-width:320px; padding:10px 11px 10px 16px}
  .agent-id b{font-size:13.5px}
  .agent-role{display:block; font-size:10.5px}
  .act{padding:8px 13px; font-size:12px}

  .page{max-width:1160px; padding:0 40px 90px}
  /* Colonne gauche : la présentation, puis le chasseur et l'engagement.
     Colonne droite : les cartes, qui tiennent sur les deux rangées. */
  .accueil{display:grid; grid-template-columns:minmax(0,.94fr) minmax(0,1.06fr);
    column-gap:30px; row-gap:0; align-items:start; margin-top:26px}
  .accueil .col-a{grid-column:1; grid-row:1}
  .accueil .col-c{grid-column:1; grid-row:2}
  .accueil .col-b{grid-column:2; grid-row:1 / span 2}
  .accueil .hero{margin-top:0}
  .accueil .col-b .sep{margin-top:2px}
  .grille{gap:16px}
  /* les listes de biens passent sur deux colonnes */
  .liste{display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; align-items:stretch}
  .sous-vue{max-width:820px}
  .relance{max-width:820px}
}
@media(min-width:1440px){
  .chapeau .dedans{max-width:1280px}
  .page{max-width:1280px}
}

/* La fiche d'un bien sur ordinateur : une largeur confortable, une seule
   colonne qui défile, et en haut une bande de trois photos côte à côte —
   pas une photo géante. */
@media(min-width:900px){
  .feuille.fiche{width:min(1000px,92vw); max-height:86vh; height:auto;
    overflow-y:auto; overscroll-behavior:contain; padding-bottom:26px}
  .feuille.fiche .galerie{border-radius:24px 24px 0 0; overflow:hidden}
  .feuille.fiche .bande{gap:2px}
  .feuille.fiche .bande .photo-g{flex:0 0 calc(33.333% - 2px); aspect-ratio:4/3; cursor:zoom-in}
  .feuille.fiche .retour-f{top:14px; left:14px}
  .feuille.fiche .compteur{top:14px; left:66px; right:auto}
  .feuille.fiche .points{display:none}
  .feuille.fiche .bandeau-prix{padding:22px 26px 0}
  .feuille.fiche .tete-f{padding:14px 26px 12px}
  .feuille.fiche .corps-f{padding:0 26px}
  .feuille.fiche .corps-f .txt{max-width:74ch}
}

@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms !important; transition-duration:.01ms !important}}

/* ═══ Récapitulatif de recherche : une catégorie = un bloc lisible ═══ */
.bloc.cat{padding:0}
.cat + .cat{margin-top:14px}
.cat-h{display:flex; align-items:center; gap:12px; padding:15px 18px;
  border-bottom:1px solid var(--trait); background:linear-gradient(180deg,#fbfcfe,#fff)}
.cat-i{width:38px; height:38px; border-radius:12px; flex:0 0 auto; display:flex;
  align-items:center; justify-content:center; color:#fff;
  background:linear-gradient(140deg,#33486c,#25364f); box-shadow:0 8px 16px -10px rgba(16,24,40,.9)}
.cat-tt{display:flex; flex-direction:column; min-width:0}
.cat-tt b{font-family:'Plus Jakarta Sans',sans-serif; font-size:16.5px; font-weight:800; letter-spacing:-.3px}
.cat-tt i{font-style:normal; font-size:12px; color:var(--plume-clair); margin-top:1px}
.bloc.cat > *:not(.cat-h){padding-left:18px; padding-right:18px}
.bloc.cat > *:not(.cat-h):first-of-type{padding-top:0}
.bloc.cat > .trio, .bloc.cat > .pastilles, .bloc.cat > .gros,
.bloc.cat > .villes, .bloc.cat > .arrets-v, .bloc.cat > .dpe-r{margin-top:15px}
.bloc.cat > *:last-child{padding-bottom:17px}
.ss-t{font-size:10.5px; letter-spacing:1.3px; text-transform:uppercase; color:var(--plume-clair);
  font-weight:800; margin-bottom:8px}
.faits{margin-top:13px; display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:9px}
.fait{display:flex; align-items:center; gap:10px; background:var(--fond); border:1px solid var(--trait);
  border-radius:14px; padding:11px 12px; min-width:0}
.fait .fi{font-size:18px; line-height:1; flex:0 0 auto}
.fait .ft{display:flex; flex-direction:column; min-width:0}
.fait .ft i{font-style:normal; font-size:9.5px; letter-spacing:.9px; text-transform:uppercase;
  color:var(--plume-clair); font-weight:800}
.fait .ft b{font-size:14.5px; font-weight:800; margin-top:2px; overflow-wrap:anywhere}

.note-cat{margin-top:11px; font-size:12.5px; color:var(--plume); line-height:1.55}
.past.indis{background:var(--encre); border-color:var(--or); color:#f2dfa6; font-weight:700}
.past .mk{font-style:normal; font-size:8.5px; letter-spacing:.9px; text-transform:uppercase;
  background:var(--or); color:#fff; border-radius:6px; padding:2px 5px; margin-left:7px}
.dpe-r{display:flex; gap:5px; flex-wrap:wrap}
.dpe-l{width:32px; height:32px; border-radius:9px; display:flex; align-items:center; justify-content:center;
  font-weight:800; font-size:13px; border:1px solid var(--trait); color:var(--plume-clair); background:var(--fond)}
.dpe-l.ok{border-color:var(--vert-trait); background:var(--vert-fond); color:var(--vert)}
.dpe-l.pt{border-color:var(--encre); background:var(--encre); color:#fff}

/* ═══ « Mes critères ont évolué » : l'assistant en neuf étapes ═══ */
.frise-e{display:flex; gap:6px; overflow-x:auto; padding:2px 20px 12px; scrollbar-width:none;
  -webkit-overflow-scrolling:touch}
.frise-e::-webkit-scrollbar{display:none}
.fp{flex:0 0 auto; display:inline-flex; align-items:center; gap:7px; height:36px; padding:0 10px;
  border-radius:99px; border:1.5px solid var(--trait); background:var(--carte); color:var(--plume-clair);
  font-size:12.5px; font-weight:700; max-width:38px; overflow:hidden; white-space:nowrap;
  transition:max-width .3s cubic-bezier(.34,1.25,.64,1), background .2s, color .2s, border-color .2s}
.fp span{opacity:0; transition:opacity .18s .06s}
.fp.on{max-width:260px; border-color:var(--encre); background:var(--encre); color:#fff}
.fp.on span{opacity:1}
.fp.fait{border-color:var(--or-trait); background:var(--or-fond); color:var(--or-fonce)}
.corps-e{overflow-x:hidden; min-height:230px}
.sous-e{margin:0 0 14px; font-size:13.5px; color:var(--plume); line-height:1.5}
@keyframes pan-av{from{opacity:0; transform:translateX(26px)} to{opacity:1; transform:translateX(0)}}
@keyframes pan-ar{from{opacity:0; transform:translateX(-26px)} to{opacity:1; transform:translateX(0)}}
.pan-e.av{animation:pan-av .3s cubic-bezier(.22,.8,.3,1) both}
.pan-e.ar{animation:pan-ar .3s cubic-bezier(.22,.8,.3,1) both}
.nav-e{position:sticky; bottom:0; display:flex; align-items:center; gap:10px; justify-content:space-between;
  padding:12px 20px calc(12px + env(safe-area-inset-bottom,0px)); margin-top:18px;
  background:linear-gradient(180deg,rgba(255,255,255,.72),var(--carte) 42%); border-top:1px solid var(--trait);
  backdrop-filter:blur(6px)}
.nav-e .btn{padding:11px 16px; font-size:14px}
.nav-e .cpt{font-size:11px; font-weight:800; letter-spacing:1.2px; color:var(--or-fonce); white-space:nowrap; flex:0 0 auto}
.nav-e .btn{flex:0 1 auto; white-space:nowrap}
label.lab i{font-style:normal; text-transform:none; letter-spacing:0; font-size:11px;
  color:var(--plume-clair); font-weight:600; margin-left:7px}
.champ-n{position:relative; display:flex; align-items:center; gap:9px; flex-wrap:wrap}
.champ-n input{flex:0 0 118px; width:118px; background:var(--fond); border:1.5px solid var(--trait);
  border-radius:12px; padding:11px 13px; font-size:16px; font-family:inherit; font-weight:700;
  color:var(--encre); outline:none}
.champ-n input:focus{border-color:var(--or)}
.champ-n .sfx{font-size:14px; font-weight:700; color:var(--plume)}
.champ-n .aide{flex:1 1 100%; font-size:11.5px; color:var(--plume-clair)}
.duo-n{display:grid; grid-template-columns:1fr 1fr; gap:12px}
.duo-n > *{min-width:0}
.ch.niv{position:relative}
.ch.niv.nsouhaite{border-color:var(--vert-trait); background:var(--vert-fond); color:var(--vert)}
.ch.niv.nindispensable{border-color:var(--or); background:var(--encre); color:#f2dfa6}
.ch .mk{font-style:normal; font-size:8.5px; letter-spacing:.9px; text-transform:uppercase;
  margin-left:8px; opacity:.9; font-weight:800}
.dpe-choix{display:flex; gap:7px; flex-wrap:wrap}
.dpe-b{width:44px; height:44px; border-radius:13px; border:1.5px solid var(--trait); background:var(--fond);
  color:var(--plume); font-weight:800; font-size:16px}
.dpe-b.ok{border-color:var(--vert-trait); background:var(--vert-fond); color:var(--vert)}
.dpe-b.pt{border-color:var(--encre); background:var(--encre); color:#fff}
.note-verr{margin-top:20px; background:var(--fond); border:1px solid var(--trait); border-radius:16px; padding:14px}
.note-verr .k{display:flex; align-items:center; gap:7px; font-size:10px; letter-spacing:1.2px;
  text-transform:uppercase; color:var(--plume-clair); font-weight:800}
.note-verr .k span{display:inline-flex; align-items:center; gap:6px}
.note-verr .corps{margin:10px 0 0; padding:11px 13px; background:var(--carte); border:1px solid var(--trait);
  border-left:3px solid var(--or); border-radius:12px; font-size:14px; line-height:1.6; color:var(--encre)}
.note-verr .pq{margin-top:10px; font-size:12px; color:var(--plume); line-height:1.5}
.note-verr textarea{width:100%; margin-top:9px; background:var(--carte); border:1.5px solid var(--trait);
  border-radius:12px; padding:11px 13px; font-size:15px; font-family:inherit; color:var(--encre);
  outline:none; resize:vertical}
.note-verr textarea:focus{border-color:var(--or)}


/* ═══ Téléphone : le bandeau ne doit pas manger l'écran ═══
   Il est présent sur toutes les vues, donc chaque pixel qu'il prend est
   un pixel en moins pour les biens. On le réduit franchement. */
@media(max-width:759px){
  .chapeau{padding:11px 16px 12px}
  .chapeau::after{top:-110px; right:-70px; width:230px; height:230px}
  .motmarque{font-size:9.5px; letter-spacing:1.8px}
  .confid{font-size:8.5px; letter-spacing:1px}
  .rangee{margin-top:10px; gap:8px}
  .ident{gap:10px}
  .mono{width:34px; height:34px; font-size:13px; border-width:1px}
  .ident h1{font-size:15.5px; line-height:1.15}
  .ident .ref{font-size:10px; margin-top:1px}
  .agent{padding:8px 0 0; gap:8px}
  .agent-sur{font-size:8.5px; letter-spacing:1px}
  .agent-id b{font-size:11.5px}
  .act{width:29px; height:29px}
  .veilleligne{padding:4px 9px 4px 8px; font-size:10px; gap:5px; min-width:0}
  .agent-id{flex-direction:column; align-items:flex-start; gap:1px}
  .agent{flex-wrap:nowrap}
  .pouls{width:6px; height:6px}
  .page{padding:0 16px 70px}
  .hero{margin-top:14px; padding:18px 16px; border-radius:18px}
  .retour{margin-top:14px}
}


/* ═══ La présentation de l'espace (première visite) ═══ */
.bienv{padding:8px 20px 24px; text-align:center}
.bienv-sceau{width:66px; height:66px; border-radius:50%; margin:6px auto 16px;
  display:flex; align-items:center; justify-content:center; color:var(--or);
  background:var(--or-fond); border:1px solid var(--or-trait)}
.bienv-sur{font-size:10px; letter-spacing:1.6px; text-transform:uppercase; color:var(--or-fonce); font-weight:800}
.bienv h3{margin:8px 0 12px; font-size:25px; font-weight:800; line-height:1.15}
.bienv > p{margin:0; color:var(--plume); font-size:14.5px; line-height:1.7}
.bienv .puces{text-align:left; margin-top:20px; padding-top:18px}
.bienv .puces span{font-size:13.5px}
.bienv .puces b{font-weight:700}
.bienv-pied{margin-top:12px; font-size:11.5px; color:var(--plume-clair)}
@media(min-width:640px){ .bienv{padding:8px 26px 26px} }
@media(max-width:639px){
  .feuille.pleine .bienv{min-height:100dvh; display:flex; flex-direction:column; justify-content:center}
}

/* Le lien discret qui la rouvre, au bout du séparateur « Votre espace ». */
.lien-aide{flex:0 0 auto; font-family:inherit; font-size:11.5px; font-weight:700;
  color:var(--plume-clair); border:1px solid var(--trait); background:var(--carte);
  border-radius:99px; padding:4px 11px; white-space:nowrap; transition:color .15s, border-color .15s}
.lien-aide:hover{color:var(--or-fonce); border-color:var(--or-trait)}


/* ═══ Biens consultés : filtres et groupes ═══ */
/* Un seul bandeau, les choix collés les uns aux autres : c'est un même
   réglage à plusieurs positions, pas six boutons indépendants. */
.filtres{display:flex; gap:2px; overflow-x:auto; margin-bottom:4px; padding:4px;
  background:var(--fond); border:1px solid var(--trait); border-radius:99px;
  scrollbar-width:none; -webkit-overflow-scrolling:touch}
.filtres::-webkit-scrollbar{display:none}
.fc{flex:0 0 auto; display:inline-flex; align-items:center; gap:6px; border-radius:99px;
  padding:8px 14px; font-family:inherit; font-size:12.5px; font-weight:700; white-space:nowrap;
  background:transparent; border:none; color:var(--plume);
  transition:background .18s, color .18s}
.fc:hover{background:rgba(255,255,255,.72); color:var(--encre)}
.fc .fe{font-size:13px; line-height:1}
.fc i{font-style:normal; font-size:11px; font-weight:800; background:rgba(148,163,184,.2);
  color:var(--plume-clair); border-radius:99px; padding:1px 7px}
.fc.on{background:var(--encre); color:#fff; box-shadow:0 4px 10px -6px rgba(16,24,40,.9)}
.fc.on i{background:rgba(255,255,255,.18); color:#fff}
.fc.on:hover{background:var(--encre); color:#fff}
/* Sur un écran étroit, le bandeau passe sur deux lignes plutôt que de cacher
   la moitié des choix derrière un défilement qui ne se voit pas. */
@media(max-width:560px){
  .filtres{flex-wrap:wrap; overflow:visible; border-radius:22px; gap:3px}
  .fc{padding:7px 12px; font-size:12px}
}

/* ═══ Une catégorie de biens consultés = une carte à sa couleur ═══ */
.gr-cadre{border:1px solid var(--trait); border-radius:20px; padding:0 13px 13px;
  background:var(--carte); display:flex; flex-direction:column; gap:11px; overflow:hidden}
.gr-cadre + .gr-cadre{margin-top:16px}
.gr-tete{display:flex; align-items:center; gap:10px; margin:0 -13px; padding:13px 15px;
  border-bottom:1px solid var(--trait)}
.gr-tete .ge{font-size:17px; line-height:1}
.gr-tete h3{margin:0; font-size:15.5px; font-weight:800; letter-spacing:-.2px}
.gr-tete .gn{margin-left:auto; white-space:nowrap; font-size:11.5px; font-weight:800; border-radius:99px; padding:2px 9px;
  background:var(--fond); color:var(--plume)}
.gr-note{font-size:12.5px; line-height:1.55; color:var(--plume); padding:1px 3px 0}

.gr-cadre.c-or{border-color:var(--or-trait); background:var(--or-fond)}
.gr-cadre.c-or .gr-tete{border-color:var(--or-trait); background:rgba(201,168,76,.08)}
.gr-cadre.c-or .gr-tete h3, .gr-cadre.c-or .gr-note{color:var(--or-fonce)}
.gr-cadre.c-or .gn{background:var(--or); color:#fff}

.gr-cadre.c-prune{border-color:var(--prune-trait); background:var(--prune-fond)}
.gr-cadre.c-prune .gr-tete{border-color:var(--prune-trait); background:rgba(124,58,237,.06)}
.gr-cadre.c-prune .gr-tete h3, .gr-cadre.c-prune .gr-note{color:var(--prune)}
.gr-cadre.c-prune .gn{background:var(--prune); color:#fff}

.gr-cadre.c-vert{border-color:var(--vert-trait); background:var(--vert-fond)}
.gr-cadre.c-vert .gr-tete{border-color:var(--vert-trait); background:rgba(21,128,61,.06)}
.gr-cadre.c-vert .gr-tete h3, .gr-cadre.c-vert .gr-note{color:var(--vert)}
.gr-cadre.c-vert .gn{background:var(--vert); color:#fff}

.gr-cadre.c-brique{border-color:var(--brique-trait); background:var(--brique-fond)}
.gr-cadre.c-brique .gr-tete{border-color:var(--brique-trait); background:rgba(220,38,38,.05)}
.gr-cadre.c-brique .gr-tete h3, .gr-cadre.c-brique .gr-note{color:var(--brique)}
.gr-cadre.c-brique .gn{background:var(--brique); color:#fff}

.gr-cadre.c-bleu{border-color:var(--bleu-trait); background:var(--bleu-fond)}
.gr-cadre.c-bleu .gr-tete{border-color:var(--bleu-trait); background:rgba(37,99,235,.06)}
.gr-cadre.c-bleu .gr-tete h3, .gr-cadre.c-bleu .gr-note{color:var(--bleu)}
.gr-cadre.c-bleu .gn{background:var(--bleu); color:#fff}

/* Ce que le client a écrit sur un bien. */
.mon-com{display:block; margin-top:10px; padding:9px 12px; border-radius:12px;
  background:var(--fond); border:1px solid var(--trait); border-left:3px solid var(--trait-fort)}
.mon-com .mc-t{display:block; font-size:9.5px; font-weight:800; letter-spacing:1px;
  text-transform:uppercase; color:var(--plume-clair)}
.mon-com .mc-c{display:block; margin-top:3px; font-size:13.5px; line-height:1.55; color:var(--encre)}
.mon-com.oui{background:var(--vert-fond); border-color:var(--vert-trait); border-left-color:var(--vert)}
.mon-com.oui .mc-t{color:var(--vert)}
.mon-com.visite{background:var(--prune-fond); border-color:var(--prune-trait); border-left-color:var(--prune)}
.mon-com.visite .mc-t{color:var(--prune)}
.mon-com.non{background:var(--brique-fond); border-color:var(--brique-trait); border-left-color:var(--brique)}
.mon-com.non .mc-t{color:var(--brique)}
.mon-com.fait{background:var(--or-fond); border-color:var(--or-trait); border-left-color:var(--or)}
.mon-com.fait .mc-t{color:var(--or-fonce)}

/* La demande d'avis sur la carte d'accueil. */
.alerte-avis{display:inline-flex; align-items:flex-start; gap:6px; margin-top:3px;
  background:var(--ambre-fond); border:1px solid var(--ambre-trait); color:var(--ambre);
  border-radius:12px; padding:6px 10px; font-size:12px; font-weight:800; line-height:1.38}
.case.large .alerte-avis, .vue-large .alerte-avis{border-radius:99px; padding:5px 12px; font-size:12.5px}
.groupe + .groupe{margin-top:26px}
.bloc-titre .ge{font-size:16px; line-height:1}
.etiq.fait{background:var(--or-fond); color:var(--or-fonce); border-color:var(--or-trait)}

/* ═══ Après le choix d'un avis : on invite vraiment à écrire ═══ */
.apres-avis{margin-top:14px; background:var(--fond); border:1px solid var(--trait);
  border-left:3px solid var(--or); border-radius:16px; padding:15px}
.aa-t{font-family:'Plus Jakarta Sans',sans-serif; font-size:15px; font-weight:800; color:var(--encre)}
.aa-p{margin:6px 0 12px; font-size:13px; line-height:1.6; color:var(--plume)}
.apres-avis textarea{width:100%; background:var(--carte); border:1.5px solid var(--trait);
  border-radius:14px; padding:13px 14px; font-size:15px; font-family:inherit; color:var(--encre);
  outline:none; resize:vertical; min-height:108px; line-height:1.6}
.apres-avis textarea:focus{border-color:var(--or)}
.apres-avis.fini{border-left-color:var(--vert)}
.fige-t{font-size:9.5px; letter-spacing:1.1px; text-transform:uppercase; font-weight:800;
  color:var(--plume-clair); margin:2px 0 6px}
.aa-n{margin:12px 0 0; font-size:12.5px; line-height:1.6; color:var(--plume-clair)}


/* ═══ La prochaine visite, en tête de l'accueil ═══ */
.visite-a-venir{position:relative; overflow:hidden; margin-top:18px; background:var(--encre); color:#fff;
  border-radius:20px; padding:16px 18px 17px; box-shadow:0 18px 34px -24px rgba(16,24,40,.95)}
.visite-a-venir::after{content:""; position:absolute; top:-80px; right:-60px; width:210px; height:210px;
  border-radius:50%; background:radial-gradient(circle,rgba(201,168,76,.26),transparent 66%)}
.vav-t{position:relative; display:flex; align-items:center; gap:8px; font-size:10px; font-weight:800;
  letter-spacing:1.4px; text-transform:uppercase; color:var(--or)}
.vav-q{position:relative; display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:9px;
  font-family:'Plus Jakarta Sans',sans-serif; font-size:20px; font-weight:800; letter-spacing:-.4px;
  line-height:1.2}
.vav-b{text-transform:none; font-size:11px; font-weight:800; letter-spacing:.6px; border-radius:99px;
  padding:3px 10px; background:var(--or); color:#1a2332}
.vav-b2{position:relative; margin-top:7px; font-size:14px; font-weight:700; color:rgba(255,255,255,.92); line-height:1.4}
.vav-a{position:relative; display:flex; align-items:center; gap:7px; margin-top:5px; font-size:12.5px;
  color:rgba(255,255,255,.55)}
.vav-ag{position:relative; margin-top:14px; padding-top:13px; border-top:1px solid rgba(255,255,255,.14)}
.vav-ag-t{display:block; font-size:10px; font-weight:800; letter-spacing:1.1px; text-transform:uppercase;
  color:rgba(255,255,255,.5)}
.vav-ag-b{display:flex; gap:8px; flex-wrap:wrap; margin-top:9px}
.vav-ics{display:inline-flex; align-items:center; gap:8px;
  background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.22); color:#fff;
  border-radius:99px; padding:9px 15px; font-size:12.5px; font-weight:700; text-decoration:none;
  transition:background .18s}
.vav-ics:hover{background:rgba(255,255,255,.2)}
.vav-p{position:relative; margin-top:10px; font-size:12px; color:rgba(255,255,255,.5)}


/* ═══ Les bilans de la page « marché » ═══ */
.bilan{background:var(--carte); border:1px solid var(--trait); border-radius:18px; padding:16px 17px;
  box-shadow:var(--ombre)}
.bilan-t{font-size:10.5px; font-weight:800; letter-spacing:1.3px; text-transform:uppercase; color:var(--plume-clair)}
.bilan-g{display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-top:13px}
.bg-c{background:var(--fond); border:1px solid var(--trait); border-radius:14px; padding:12px 11px; text-align:center}
.bg-i{display:flex; align-items:center; justify-content:center; width:32px; height:32px; margin:0 auto 9px;
  border-radius:11px; background:var(--carte); border:1px solid var(--trait); color:var(--plume)}
.bg-c.or .bg-i{background:#fff; border-color:var(--or-trait); color:var(--or-fonce)}
.bg-c b{display:block; font-family:'Plus Jakarta Sans',sans-serif; font-size:19px; font-weight:800;
  letter-spacing:-.6px; line-height:1.1}
.bg-c span{display:block; margin-top:5px; font-size:9.5px; letter-spacing:.8px; text-transform:uppercase;
  color:var(--plume-clair); font-weight:700; line-height:1.35}
.bg-c.or{background:var(--or-fond); border-color:var(--or-trait)}
.bg-c.or b{color:var(--or-fonce)}
.bg-c.or span{color:var(--or-fonce); opacity:.75}
.bilan-r{margin-top:12px; font-size:13px; line-height:1.6; color:var(--plume)}
.bilan-r b{color:var(--encre); font-weight:800}



/* ═══ La page « marché » : des blocs colorés, pas des tableaux blancs ═══ */
/* Le chapeau chevauche la première carte : il la coiffe au lieu de la
   toucher. Sans ça, deux bords se collaient et ça faisait bavure. */
.intro-m{display:flex; gap:12px; align-items:flex-start; margin-top:16px; background:var(--carte);
  border:1px solid var(--trait); border-radius:18px; padding:15px 16px 16px; box-shadow:var(--ombre-f);
  font-size:13.5px; line-height:1.65; color:var(--plume);
  position:relative; z-index:2; margin-bottom:-22px}
.intro-m + .gr-cadre{padding-top:34px}
.im-i{flex:0 0 auto; width:32px; height:32px; border-radius:10px; display:flex;
  align-items:center; justify-content:center; background:var(--fond); color:var(--plume)}

.tuiles{display:grid; grid-template-columns:1fr; gap:9px}
.tu{border-radius:15px; padding:12px 13px; border:1px solid var(--trait); background:var(--carte);
  display:flex; align-items:center; gap:12px;
  background:var(--carte)}
.tu-i{flex:0 0 auto; width:38px; height:38px; border-radius:12px; display:flex;
  align-items:center; justify-content:center; background:rgba(255,255,255,.72)}
.tu-c{min-width:0}
.tu b{display:block; font-family:'Plus Jakarta Sans',sans-serif; font-size:19px; font-weight:800;
  letter-spacing:-.6px; line-height:1.15; color:var(--encre)}
.tu-c > span{display:block; margin-top:3px; font-size:10px; letter-spacing:.7px;
  text-transform:uppercase; font-weight:800; line-height:1.35; color:var(--plume-clair)}
.tu b{color:var(--encre)}
.tu .tu-c > span{color:var(--plume-clair)}
.tu .tu-i{color:var(--plume); background:var(--fond)}
/* l'entonnoir se lit de gauche à droite : lu (encre) → écarté (gris) → retenu (or) */
.tu.gris b{color:var(--plume-clair)}
.tu.gris .tu-i{color:var(--plume-clair)}
/* une seule tuile porte l'or : celle qui dit ce qu'on a retenu pour vous */
.tu.or{background:var(--or-fond); border-color:var(--or-trait)}
.tu.or b{color:var(--or-fonce)}
.tu.or .tu-c > span{color:var(--or-fonce); opacity:.75}
.tu.or .tu-i{color:#fff; background:var(--or)}

.vide-doux{text-align:center; padding:22px 14px 6px}
.vd-i{display:inline-flex; width:54px; height:54px; border-radius:50%; margin-bottom:12px;
  align-items:center; justify-content:center; background:var(--fond); color:var(--plume-clair)}
.vide-doux b{display:block; font-family:'Plus Jakarta Sans',sans-serif; font-size:15px; font-weight:800}
.vide-doux > span:not(.vd-i){display:block; margin-top:7px; font-size:13px; line-height:1.6;
  color:var(--plume); max-width:46ch; margin-left:auto; margin-right:auto}

/* l'entonnoir vit désormais dans une carte de catégorie */
@media(min-width:540px){
  .tuiles{grid-template-columns:repeat(3,1fr)}
  .tu{flex-direction:column; text-align:center; gap:9px; padding:15px 11px 14px}
  .tu-i{width:40px; height:40px}
}
/* ── la carte nette : blanc, filet gris, titre encre ─────────────
   Sur la page du marché, quatre cartes se suivent. Quatre teintes
   différentes, c'était un arc-en-ciel : ici le fond se tait et l'or
   ne souligne que le chiffre qui compte. */
.gr-cadre.c-net{border-color:var(--trait); background:var(--carte); box-shadow:var(--ombre)}
/* La note de bas de carte est un commentaire, pas la suite du contenu :
   un filet et de l'air la détachent de ce qu'elle explique. */
.gr-cadre.c-net .tuiles + .gr-note,
.gr-cadre.c-net .entonnoir + .gr-note{margin-top:15px; padding-top:13px; border-top:1px solid var(--trait)}
.gr-cadre.c-net .gr-tete + .gr-note{margin-top:13px}
/* le « ? » se pose en exposant, à droite du chiffre, sans le décentrer */
.tu .nv, .nv-l{position:relative; display:inline-block}
.tu .nv .aide-pt{position:absolute; left:100%; top:-4px; margin-left:4px}
.nv-l .aide-pt{position:absolute; left:100%; top:-1px; margin-left:5px}
.gr-tete .aide-pt{margin-left:-4px}
.gr-cadre.c-net .gr-tete{border-color:var(--trait); background:none; padding-bottom:12px}
.gr-cadre.c-net .gr-tete h3{color:var(--encre)}
.gr-cadre.c-net .gr-note{color:var(--plume)}
.gr-cadre.c-net .gn{background:var(--encre); color:#fff}
.gr-cadre.c-net .ge{width:28px; height:28px; border-radius:9px; display:flex;
  align-items:center; justify-content:center; background:var(--fond); color:var(--encre2)}
.gr-cadre.c-net .ge.or{background:var(--or); color:#fff}
.gr-cadre .entonnoir{background:none; border:none; padding:0; box-shadow:none}
.gr-cadre .barres{margin-top:12px}

`;
