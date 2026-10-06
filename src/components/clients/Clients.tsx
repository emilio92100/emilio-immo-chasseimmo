'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { signalerEchec, verifie } from '@/lib/ecritures';
import { toutLire } from '@/lib/registre';
import { supabase, genererReference, addJournal } from '@/lib/supabase';
import { jetonEspace } from '@/lib/jeton';
import type { Client, StatutClient } from '@/lib/supabase';
import styles from './Clients.module.css';
import AvatarContact from '@/components/contacts/AvatarContact';
import { conjointDe, nomFoyer } from '@/lib/foyer';
import EnteteRubrique, { PictoClients } from '@/components/shared/EnteteRubrique';
import {
  BasculeCriteres, classesCrit, colonnesCriteres, CorpsCriteres, CRIT_VIDE, ecrireModeCrit,
  etapesCriteres, FriseCriteres, lireModeCrit,
} from '@/components/shared/CriteresRecherche';
import type { CritForm, ModeCrit } from '@/components/shared/CriteresRecherche';
import { intentions, prendreIntentionNouveauClient, signalerMaj, EVT_NOUVEAU_CLIENT, EVT_DEMANDE_VUE, demanderNouveauBien, annoncerVue, vueDemandee } from '@/lib/intentions';
import {
  TYPES_CONTACT, colonneContactAbsente, estAcheteur, estArchive, estPro, lirePro, reventePossible, sansCriteres, structurePropre, typeDe, typesDe,
  type InfosPro, type TypeContact,
} from '@/lib/contacts';
import { ChampsPro, ChoixTypes, EnteteContacts, LigneContact, Puce, type BienDuContact } from '@/components/contacts/ChampsContact';
import ChoixSource from '@/components/contacts/ChoixSource';
import ImportImmoFacile from '@/components/contacts/ImportImmoFacile';
import { Ic } from '@/components/documents/ApercuActe';
import { colonneSourceAbsente, libelleSource, sourceDe } from '@/lib/sources';
import { TABLE_DEMANDES, type PreRemplissage } from '@/lib/demandes-site';
import cc from '@/components/contacts/Contacts.module.css';
import dd from '@/components/documents/Documents.module.css';
import FiltresAcheteurs, { FILTRES_A_VIDES, correspond, nbFiltresA, type FiltresA } from './FiltresAcheteurs';
import PageRelances from '@/components/pages/PageRelances';
import { estTri } from '@/lib/relances';
import { AvecCase, BarreSelection, ConfirmerLot, STYLE_CHOISI, type Avancement } from '@/components/shared/Selection';
import { archiverContact, effacerContact, empecheSuppression } from '@/lib/supprimer-contacts';
import { FenetreMail, type ContactMail } from '@/components/pages/PageMail';
import { retirerFicheOuverte } from '@/components/layout/FichesOuvertes';

const STATUTS = [
  { key: 'tous',        label: 'Tous',       color: '' },
  { key: 'prospect',    label: 'Prospects',  color: '#8b5cf6' },
  { key: 'actif',       label: 'Actifs',     color: '#10b981' },
  { key: 'suspendu',    label: 'Suspendus',  color: '#f59e0b' },
  { key: 'bien_trouve', label: 'Finalisés',  color: '#3b82f6' },
  { key: 'perdu',       label: 'Perdus',     color: '#ef4444' },
];

/* ── Les catégories de la page Contacts (V3.14) ──
   Les acheteurs (et, parmi eux, ceux dont la recherche n'a pas encore de
   critères), puis un type par catégorie. Les acheteurs ont leur tableau
   détaillé ; « Tous » et les autres types, une liste d'une ligne par
   contact, la même pour tous. */
type Categorie = 'tous' | 'acheteur' | 'non_filtre' | Exclude<TypeContact, 'acheteur'> | 'archives' | 'tri';
/* Les pastilles des tuiles, sur le bandeau bleu : les couleurs des types,
   éclaircies pour qu'on les voie (le bleu d'un notaire disparaissait). */
const TEINTE_BANDEAU: Record<TypeContact, string> = {
  acheteur: '#34d399', vendeur: '#e0c57a', vendeur_signe: '#86efac', proprietaire: '#fb923c', notaire: '#a9bce0',
  confrere: '#b79cff', gardien: '#5fd4e8', partenaire: '#cbd5e1',
};
/* L'ordre des tuiles (V3.24) : « Tous », puis les trois du menu de gauche
   (acheteurs, vendeurs, propriétaires), puis le reste. Une tuile à zéro ne
   s'affiche pas, sauf si c'est elle qu'on regarde (voir plus bas). */
const PRINCIPAUX: TypeContact[] = ['acheteur', 'vendeur', 'proprietaire'];
const CATEGORIES: { cle: Categorie; lib: string; couleur?: string }[] = [
  { cle: 'tous', lib: 'Tous' },
  ...PRINCIPAUX.map(k => ({ cle: k as Categorie, lib: typeDe(k).pluriel, couleur: TEINTE_BANDEAU[k] })),
  { cle: 'non_filtre', lib: 'Acheteurs non filtrés', couleur: '#94a3b8' },
  ...TYPES_CONTACT.filter(t => !PRINCIPAUX.includes(t.k)).map(t => ({ cle: t.k as Categorie, lib: t.pluriel, couleur: TEINTE_BANDEAU[t.k] })),
];
/* V3.77 (Alexandre : « qu'on voie direct au début, en lisant de gauche à
   droite, les propriétaires, ensuite vendeurs, ensuite acheteurs, ensuite
   gardiens ou autre ; à la fin Tri à faire, Archivés, Tous ») : les types
   d'abord, puis le groupe de fin, tout à droite. */
/* V3.78 (« propriétaire au début, vendeur et acheteur, ensuite gardien,
   vendeur signé ou autre ») : les trois du métier, puis le reste. */
const ORDRE_TUILES: Categorie[] = ['proprietaire', 'vendeur', 'acheteur', 'gardien', 'vendeur_signe', 'non_filtre', 'notaire', 'confrere', 'partenaire'];
const FIN_TUILES: Categorie[] = ['tri', 'tous', 'archives'];
/* V3.78 (« à côté de Acheteurs, une petite flèche, on clique et on choisit
   les autres types ; on ne met pas tout sur la même ligne ») : ceux-ci
   passent dans « Autres types ▾ », chacun dès qu'il a un contact. */
const MENU_TUILES: Categorie[] = ['gardien', 'vendeur_signe', 'non_filtre', 'notaire', 'confrere', 'partenaire'];
/* V3.76 : la tuile du tri d'après l'import. */
const TUILE_TRI: { cle: Categorie; lib: string; couleur?: string } = { cle: 'tri', lib: 'Tri à faire', couleur: '#fbbf24' };
/* Les catégories d'une vue (« vendeur », « acheteur+proprietaire »…) ; rien de
   reconnu : « Tous ». */
function lireCats(v: string | null): Categorie[] {
  const l = (v || '').split('+').filter((k): k is Categorie => k === 'archives' || k === 'tri' || CATEGORIES.some(x => x.cle === k));
  return l.length ? l : ['tous'];
}
/* L'emoji des blocs propres à un type, dans la fenêtre de création (les
   autres blocs en ont un). */

/* La « chaleur du client » a été retirée : elle se remplissait à la création
   et n'était plus jamais lue — ni affichée dans la liste, ni dans la fiche,
   ni utilisée par la veille. Le statut du dossier dit déjà où on en est. */

/* Les cinq états d'un dossier, avec ce qu'ils veulent dire. Mêmes libellés
   que le menu de statut de la fiche : un seul vocabulaire. */
const ETATS_NOUVEAU: { cle: string; nom: string; quand: string; point: string }[] = [
  { cle: 'prospect',    nom: 'Prospect',    quand: 'Premier contact, rien de signé', point: '#8b5cf6' },
  { cle: 'actif',       nom: 'Actif',       quand: 'Recherche en cours',             point: '#10b981' },
  { cle: 'suspendu',    nom: 'Suspendu',    quand: 'En pause, à reprendre plus tard', point: '#f59e0b' },
  { cle: 'bien_trouve', nom: 'Bien trouvé', quand: 'Acquisition faite, dossier clos', point: '#3b82f6' },
  { cle: 'perdu',       nom: 'Perdu',       quand: 'Ne cherche plus avec nous',       point: '#ef4444' },
];

const statutBadge: Record<string, { label: string; color: string; bg: string }> = {
  prospect:    { label: '● Prospect',   color: '#8b5cf6', bg: '#f5f3ff' },
  actif:       { label: '● Actif',      color: '#10b981', bg: '#ecfdf5' },
  suspendu:    { label: '⏸ Suspendu',   color: '#f59e0b', bg: '#fffbeb' },
  bien_trouve: { label: '✓ Finalisé',   color: '#3b82f6', bg: '#eff6ff' },
  perdu:       { label: '✗ Perdu',      color: '#ef4444', bg: '#fef2f2' },
};

/* Le client et ce qui nous lie à lui. Les critères de recherche vivent à
   part, dans le formulaire partagé avec la fiche. */
const initForm = {
  prenom: '', nom: '',
  /* Monsieur, Madame, ou un couple (deux personnes : la 2e signe le mandat
     avec son propre lien). Rien de choisi : la fiche se crée comme avant. */
  civilite: '' as '' | 'Monsieur' | 'Madame', couple: false,
  c2_civilite: '' as '' | 'Monsieur' | 'Madame', c2_prenom: '', c2_nom: '', c2_email: '', c2_tel: '',
  adresse_rue: '', adresse_cp: '', adresse_ville: '',
  email1: '', email2: '', tel1: '', tel2: '',
  statut: 'prospect' as StatutClient,
  statut_occupation: '', bien_actuel_type: '', bien_actuel_surface: '',
  bien_actuel_valeur: '', bien_actuel_a_vendre: false, bien_actuel_notes: '',
  bien_actuel_adresse: '', bien_actuel_meme_adresse: true,
  sans_mandat: false,
  /* Vides : un champ pré-rempli se confondait avec un champ déjà saisi (V3.23). */
  mandat_date_signature: '', mandat_duree: '', mandat_honoraires: '',
  notes: '',
  /* V3.14 : qui est ce contact, ce qui est propre à son métier, et la suite. */
  types: [] as TypeContact[],
  pro: {} as InfosPro,
  /* Un acheteur dont on n'a pas encore pris les critères : « non filtré ». */
  critPlusTard: false,
  /* Un vendeur, un propriétaire : ouvrir tout de suite « Nouveau bien ». */
  creerBien: true,
  /* D'où il vient (V3.23) : facultatif, voir src/lib/sources.ts. */
  source: '', source_detail: '',
};

/* Monsieur ou Madame, pour une personne du couple. */
function Civilite({ v, onV }: { v: string; onV: (c: 'Monsieur' | 'Madame') => void }) {
  return (
    <div className="nc-civ">
      {(['Monsieur', 'Madame'] as const).map(c => (
        <button type="button" key={c} data-on={v === c} onClick={() => onV(c)}>{c}</button>
      ))}
    </div>
  );
}

/* Une section du formulaire (V3.23) : une icône dessinée dans la couleur du
   type de contact, un titre, une précision. Les émoji des titres rendaient
   différemment d'un téléphone à l'autre. */
type Teinte = { c: string; fond: string };
const MARINE: Teinte = { c: '#34496e', fond: '#eef2f8' };
const OR: Teinte = { c: '#a07c28', fond: '#fbf6e9' };
function Bloc({ ic, titre, petit, teinte = MARINE, children }: { ic: string; titre: string; petit?: string; teinte?: Teinte; children: React.ReactNode }) {
  return (
    <section className="nc-bloc">
      <div className="nc-bloc-t">
        <span className="nc-bloc-ic" style={{ background: teinte.fond, color: teinte.c }}><Ic n={ic} t={17} /></span>
        <b>{titre}</b>
        {petit && <small>{petit}</small>}
      </div>
      <div className="nc-bloc-corps">{children}</div>
    </section>
  );
}
/* L'icône de la section propre à un métier (ChampsPro). */
const IC_PRO: Record<string, string> = { 'Son agence': 'agence', 'Son étude': 'balance', 'L’immeuble': 'immeuble', 'Son activité': 'outil', 'Sa société': 'immeuble' };

// Style d'une pastille toggle (active/inactive)
function pill(active: boolean, borderActive: string, bgActive: string, colorActive: string): React.CSSProperties {
  return { padding: '7px 14px', borderRadius: 20, border: `1px solid ${active ? borderActive : '#e2e8f0'}`, background: active ? bgActive : 'white', color: active ? colorActive : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' };
}

/* Le temps qu'il faut rester sur une ligne avant que la bulle n'apparaisse.
   Trois secondes : on peut parcourir la liste des yeux sans rien déclencher,
   la bulle ne vient que si on s'arrête vraiment sur un dossier.
   C'est le seul endroit à changer si le délai te paraît trop long ou trop court. */
const DELAI_BULLE = 3000;

/* La bulle se pose sur <body>. Dans la page, un parent qui porte une
   animation devient le repère des éléments « position: fixed » : la bulle
   s'affichait alors décalée, très loin du curseur. */
function Portail({ children }: { children: React.ReactNode }) {
  const [pret, setPret] = useState(false);
  useEffect(() => { setPret(true); }, []);
  if (!pret) return null;
  return createPortal(children, document.body);
}

type StatDossier = {
  biens: number; visites: number; offres: number;
  relance?: { date: string; note: string | null };
  dernierContact?: string;
  dernierTitre?: string;
  /* Qui a bougé en dernier : toi, ou l'acheteur depuis son espace. */
  dernierCote?: 'moi' | 'client';
};

/* Ce que l'acheteur fait depuis son espace passe par le même journal que tes
   propres gestes. On les distingue : un dossier où le client vient de réagir
   attend une réponse, ce n'est pas la même chose qu'un dossier que tu viens
   toi-même de mettre à jour. */
const EVT_CLIENT = new Set(['retour_client', 'message_client', 'demande_rappel', 'partage_client']);
function venantDuClient(type: string, titre: string) {
  return EVT_CLIENT.has(type) || /depuis son espace|par le client/i.test(titre || '');
}
type TriCle = 'nom' | 'modif' | 'creation' | 'budget' | 'situation';
type Tri = { cle: TriCle; sens: 'asc' | 'desc' };
const TRIS: { cle: TriCle; nom: string; court: string; note: string; sensDefaut: 'asc' | 'desc' }[] = [
  { cle: 'nom',      nom: 'Nom du client',         court: 'Nom',            note: 'de A à Z',                  sensDefaut: 'asc' },
  { cle: 'modif',    nom: 'Dernière modification', court: 'Dernière modif.', note: 'le plus récent en haut',   sensDefaut: 'desc' },
  { cle: 'creation', nom: 'Date de création',      court: 'Création',       note: 'le dernier arrivé en haut', sensDefaut: 'desc' },
  { cle: 'budget',   nom: 'Budget',                court: 'Budget',         note: 'du plus élevé au plus bas', sensDefaut: 'desc' },
  { cle: 'situation', nom: 'Propriétaires d’abord', court: 'Propriétaires', note: 'revente possible, puis propriétaires', sensDefaut: 'desc' },
];

/* ── La situation du client aujourd'hui ──
   Un acheteur propriétaire est un mandat vendeur en puissance : c'est lui
   qu'on veut repérer d'un coup d'œil, et pouvoir faire remonter. */
type Situation = 'vendeur' | 'proprietaire' | 'locataire' | 'inconnue';
function situationDe(c: any): Situation {
  const s = c.statut_occupation;
  /* La case « revente possible » vaut propriétaire, même si le statut n'a
     pas été choisi dans la liste : elle se coche indépendamment. */
  /* V3.50 : sauf chez un vendeur signé (il a vendu, la case est restée). */
  if (reventePossible(c)) return 'vendeur';
  if (s === 'proprietaire') return 'proprietaire';
  if (s === 'locataire' || s === 'heberge' || s === 'autre') return 'locataire';
  return 'inconnue';
}
const RANG_SITUATION: Record<Situation, number> = { vendeur: 3, proprietaire: 2, inconnue: 1, locataire: 0 };
const OCCUPATION: Record<string, string> = { locataire: 'Locataire', heberge: 'Hébergé', autre: 'Autre situation' };
const SITUATIONS: { key: string; label: string }[] = [
  { key: 'toutes',       label: 'Toutes situations' },
  { key: 'proprietaire', label: 'Propriétaires' },
  { key: 'vendeur',      label: 'Revente possible' },
  { key: 'locataire',    label: 'Non propriétaires' },
  { key: 'inconnue',     label: 'À renseigner' },
];
const D_CLE = <><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3.5" /><path d="M16.5 7l3 3" /><path d="M14.5 9l2 2" /></>;
const normer = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/* ── Un contact qui existe peut-être déjà (V3.50) ──
   Avant de créer : même e-mail, même téléphone (les 9 derniers chiffres :
   « 06 12… », « +33 6 12… » et « 0612… » se valent), ou même prénom et nom.
   Les deux personnes d'un couple comptent. Comme « Créer la fiche contact »
   des demandes du site. */
type FormDoublon = { prenom: string; nom: string; email1: string; email2: string; c2_email: string; tel1: string; tel2: string; c2_tel: string };
const finTel = (t: unknown) => String(t ?? '').replace(/\D/g, '').slice(-9);
const nomNet = (p?: string | null, n?: string | null) => normer(`${p || ''} ${n || ''}`).replace(/[^a-z0-9]+/g, ' ').trim();
/* Ce qui a été tapé : si ça change, l'avertissement ne vaut plus. */
const cleDoublon = (f: FormDoublon) => [f.prenom, f.nom, f.email1, f.email2, f.c2_email, f.tel1, f.tel2, f.c2_tel].map(x => x.trim().toLowerCase()).join('|');
function trouverDoublon(f: FormDoublon, liste: Client[]): Client | null {
  const mails = [f.email1, f.email2, f.c2_email].map(x => x.trim().toLowerCase()).filter(x => x.includes('@'));
  const tels = [f.tel1, f.tel2, f.c2_tel].map(finTel).filter(x => x.length === 9);
  const nom = f.prenom.trim() && f.nom.trim() ? nomNet(f.prenom, f.nom) : '';
  const nomInverse = nom ? nomNet(f.nom, f.prenom) : '';
  const parNom: Client[] = [];
  for (const c of liste) {
    const j = conjointDe(c.conjoint);
    const sesMails = [...(c.emails || []), j?.email].map(x => String(x || '').trim().toLowerCase()).filter(Boolean);
    const sesTels = [...(c.telephones || []), j?.telephone].map(finTel).filter(x => x.length === 9);
    if (mails.some(m => sesMails.includes(m)) || tels.some(t => sesTels.includes(t))) return c;
    const n = nomNet(c.prenom, c.nom);
    if (nom && n && (n === nom || n === nomInverse)) parNom.push(c);
  }
  return parNom[0] || null;
}

type DetailDossier = {
  journal: { titre: string; type: string; date: string } | null;
  espaceOuvertures: number;
};

/* Combien de jours nous séparent de cette date — négatif si elle est passée. */
function joursJusqua(iso: string) {
  const d = new Date(iso); d.setHours(12, 0, 0, 0);
  const a = new Date(); a.setHours(12, 0, 0, 0);
  return Math.round((d.getTime() - a.getTime()) / 86400000);
}
function joursDepuis(iso: string) { return -joursJusqua(iso); }

function ilYA(iso: string) {
  const j = joursDepuis(iso);
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return 'hier';
  if (j < 31) return `il y a ${j} j`;
  const m = Math.round(j / 30.4);
  return m < 12 ? `il y a ${m} mois` : `il y a ${Math.round(j / 365)} an${j >= 730 ? 's' : ''}`;
}

/* Une durée, sans « il y a » devant. */
function duree(j: number) {
  if (j < 31) return `${j} j`;
  const m = Math.round(j / 30.4);
  return m < 12 ? `${m} mois` : `${Math.round(j / 365)} an${j >= 730 ? 's' : ''}`;
}

/* Le signal : une seule phrase, celle qui compte le plus pour ce dossier.
   L'ordre décide aussi du tri — ce qui presse remonte.

   « Rien depuis … » se lit dans le journal du dossier : appels, mails, biens
   envoyés, retours, visites, changements de statut. Ouvrir une fiche pour la
   consulter n'écrit rien — sinon le compteur repartirait à zéro chaque fois
   qu'on regarde, et il ne voudrait plus rien dire. */
type Signal = { texte: string; color: string; bg: string; rang: number; aide: string };
function signalDe(client: any, st: StatDossier | undefined): Signal {
  if (st?.relance) {
    const j = joursJusqua(st.relance.date);
    const aide = `Relance prévue le ${new Date(st.relance.date).toLocaleDateString('fr-FR')}${st.relance.note ? ` — ${st.relance.note}` : ''}`;
    if (j < 0) return { texte: `🔔 Relance en retard`, color: '#be123c', bg: '#fff1f2', rang: 0, aide };
    if (j === 0) return { texte: `🔔 Relance aujourd'hui`, color: '#be123c', bg: '#fff1f2', rang: 1, aide };
    if (j <= 7) return { texte: `Relance dans ${j} j`, color: '#b45309', bg: '#fffbeb', rang: 2, aide };
    return { texte: `Relance le ${new Date(st.relance.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`, color: '#64748b', bg: '#f5f8fc', rang: 4, aide };
  }
  /* Pas de mandat du tout : rien à signaler. Un dossier sans mandat n'est pas
     un dossier au mandat expiré. */
  if (client.mandat_date_expiration && !client.sans_mandat) {
    const j = joursJusqua(client.mandat_date_expiration);
    const aide = `Mandat jusqu'au ${new Date(client.mandat_date_expiration).toLocaleDateString('fr-FR')}`;
    if (j < 0) return { texte: '⚠️ Mandat expiré', color: '#b91c1c', bg: '#fef2f2', rang: 3, aide };
    if (j < 15) return { texte: `Mandat · ${j} j`, color: '#b45309', bg: '#fffbeb', rang: 3, aide };
  }
  if ((client.statut as string) === 'bien_trouve') {
    return { texte: 'Dossier clos', color: '#1d4ed8', bg: '#eff6ff', rang: 8, aide: 'Bien trouvé — dossier terminé' };
  }
  if (st?.dernierContact) {
    const j = joursDepuis(st.dernierContact);
    const quand = j <= 0 ? "aujourd'hui" : j === 1 ? 'hier' : `il y a ${duree(j)}`;
    const aide = `${st.dernierTitre || 'Dernier mouvement'} — ${new Date(st.dernierContact).toLocaleDateString('fr-FR')}`;

    /* L'acheteur a bougé : ça appelle une réponse, ça ne se confond pas avec
       une mise à jour que tu as faite toi-même. */
    if (st.dernierCote === 'client') {
      return { texte: `Le client a réagi ${quand}`, color: '#6d28d9', bg: '#f5f3ff', rang: j <= 3 ? 1.5 : 5.5, aide };
    }
    if (j <= 1) return { texte: `Mis à jour ${quand}`, color: '#0f7a4f', bg: '#ecfdf5', rang: 6, aide };

    /* Un dossier actif sans le moindre geste depuis six semaines refroidit :
       ce n'est pas une alerte, mais ça doit se voir. */
    if (j > 45 && (client.statut as string) === 'actif') {
      return { texte: `Rien depuis ${duree(j)}`, color: '#b45309', bg: '#fffbeb', rang: 5, aide };
    }
    return { texte: `Mis à jour ${quand}`, color: '#7b8798', bg: '#f5f8fc', rang: 6, aide };
  }
  return { texte: `Créé il y a ${duree(joursDepuis(client.created_at))}`, color: '#7b8798', bg: '#f5f8fc', rang: 7, aide: 'Aucun événement enregistré sur ce dossier' };
}

/* ── La colonne Recherche : une pastille par critère, picto compris ──
   Le texte brut « Appartement · 4 pièces, 75 m² minimum » se lisait mot à mot.
   Trois pastilles se reconnaissent à la forme et à la couleur, sans lire. */

function Ico({ d, c = '#8593a8', t = 13 }: { d: React.ReactNode; c?: string; t?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke={c}
      strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{d}</svg>
  );
}
const D_TYPE = <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10V20h13V10" /></>;
const D_PIECES = <><rect x="4" y="3" width="13" height="18" rx="1.5" /><circle cx="13.5" cy="12" r="1" /></>;
const D_SURFACE = <><path d="M4 20h16" /><path d="M4 20V8" /><path d="M20 20V8" /><path d="M4 8h16" /></>;
const D_CHAMBRE = <><path d="M4 21V8l8-5 8 5v13" /><path d="M10 21v-6h4v6" /></>;

const PA_BASE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 9,
  padding: 'var(--pa-p, 4px 10px 4px 8px)', fontSize: 'var(--pa-t, 12.5px)', fontWeight: 700, whiteSpace: 'nowrap',
};
const PA_TYPE: React.CSSProperties = { ...PA_BASE, background: '#eef4fb', border: '1px solid #dbe7f6', color: '#2d5c8f' };
const PA_NOMBRE: React.CSSProperties = { ...PA_BASE, background: '#f8fafc', border: '1px solid #eef2f7', color: '#45566e' };
const PA_FORT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 'var(--pa-f, 13.5px)', fontWeight: 800, color: 'var(--emilio)' };
const PA_FAIBLE: React.CSSProperties = { fontSize: 'var(--pa-n, 11px)', color: '#a3b0c2', fontWeight: 600 };

/* Deux types tiennent sur une ligne, au-delà on compte. */
function texteType(v: unknown) {
  const l = String(v || '').split(',').map(x => x.trim()).filter(Boolean);
  if (l.length === 0) return 'Type à préciser';
  const court = (x: string) => /^appartements?$/i.test(x) ? 'Appart.' : x;
  if (l.length === 1) return l[0];
  if (l.length === 2) return `${court(l[0])} ou ${court(l[1]).toLowerCase()}`;
  return `${court(l[0])} +${l.length - 1}`;
}

/* Un intervalle : « 4 », « 4 – 5 », « 4 min », « 4 max ». */
function borne(min: unknown, max: unknown) {
  if (min && max) return { valeur: `${min} – ${max}`, note: '' };
  if (min) return { valeur: String(min), note: 'min' };
  if (max) return { valeur: String(max), note: 'max' };
  return null;
}

/* La recherche, en une phrase — gardée pour l'infobulle de la ligne. */
function phraseRecherche(c: any) {
  const bouts: string[] = [];
  if (c.type_bien) bouts.push(String(c.type_bien));
  const p = c.nb_pieces_min && c.nb_pieces_max ? `${c.nb_pieces_min} – ${c.nb_pieces_max} pièces`
    : c.nb_pieces_min ? `${c.nb_pieces_min} pièces minimum`
      : c.nb_pieces_max ? `${c.nb_pieces_max} pièces maximum` : '';
  const su = c.surface_min && c.surface_max ? `${c.surface_min} – ${c.surface_max} m²`
    : c.surface_min ? `${c.surface_min} m² minimum`
      : c.surface_max ? `${c.surface_max} m² maximum` : '';
  if (p && su) {
    const memeFin = (f: string) => p.endsWith(f) && su.endsWith(f);
    bouts.push(memeFin(' minimum') || memeFin(' maximum')
      ? `${p.replace(/ (minimum|maximum)$/, '')}, ${su}`
      : `${p}, ${su}`);
  } else if (p || su) bouts.push(p || su);
  return bouts.join(' · ') || 'Critères à préciser';
}

function budgetCourt(c: any) {
  /* Le montant en entier, jamais « 1,5 M€ » ni « 380 k€ » (V3.21). */
  const k = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
  if (c.budget_min && c.budget_max) return k(c.budget_max);
  if (c.budget_max) return k(c.budget_max);
  if (c.budget_min) return `dès ${k(c.budget_min)}`;
  return '—';
}

/* Les secteurs sont stockés « Quartier (Ville) » : on ne garde que les villes. */
function villesDe(secteurs: string[] | undefined) {
  return [...new Set((secteurs || []).map(x => { const m = x.match(/\((.+?)\)$/); return m ? m[1].trim() : x; }))];
}

const ETIQUETTE: Record<string, string> = {
  prospect: 'Prospect', actif: 'Actif', suspendu: 'Suspendu',
  bien_trouve: 'Finalisé', perdu: 'Perdu',
};

const TEINTE: Record<string, { bg: string; fg: string; trait: string }> = {
  prospect:    { bg: '#f5f3ff', fg: '#6d28d9', trait: '#ddd6fe' },
  actif:       { bg: '#ecfdf5', fg: '#0f7a4f', trait: '#a7e8c6' },
  suspendu:    { bg: '#fffbeb', fg: '#b45309', trait: '#fde68a' },
  bien_trouve: { bg: '#eff6ff', fg: '#1d4ed8', trait: '#bcd4fb' },
  perdu:       { bg: '#fef2f2', fg: '#b91c1c', trait: '#fecaca' },
};

/* Le titre d'une section de « Tous » : le type, son icône, combien. */
export default function Clients({ onNavigate, fenetre }: {
  onNavigate: (page: string, data?: unknown) => void;
  /* La fenêtre « Nouveau contact » seule, remplie avec une demande du site
     (V3.34) : ni liste, ni lecture des contacts. `onFin` reçoit l'identifiant
     du contact créé, ou null si la fenêtre est fermée sans créer. */
  fenetre?: { pre: PreRemplissage; onFin: (clientId: string | null) => void };
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  /* V3.50 : la lecture des contacts a échoué. Avant, la page disait
     « Aucun contact pour l'instant », comme si la base était vide. */
  const [erreurLecture, setErreurLecture] = useState('');

  /* Ce que la liste ne savait pas dire : combien de biens, de visites, d'offres,
     et quelle relance attend. Chargé en trois lectures, une fois, au démarrage. */
  const [stats, setStats] = useState<Record<string, StatDossier>>({});
  /* V3.76 — « Tri à faire » : les contacts repris d'ImmoFacile qui attendent
     leur dernier appel (une relance NOTE_TRI en attente). Leur tuile se
     montre tant qu'il en reste ; le bloc les traite sur place et tient ce
     compte à jour au fil des appels. */
  const [triIds, setTriIds] = useState<string[]>([]);
  /* V3.77 : dans « Archivés », le type regardé (les vendeurs archivés…). */
  const [typeArch, setTypeArch] = useState<TypeContact | 'tous'>('tous');
  const majTri = useCallback((ids: string[]) => {
    setTriIds(l => (l.length === ids.length && l.every((x, i) => x === ids[i]) ? l : ids));
  }, []);
  const majArchive = useCallback((id: string, archive: boolean) => {
    setClients(l => l.map(c => (c.id === id ? { ...c, archive } : c)));
  }, []);

  /* La carte de survol. Le détail (dernier échange, espace acheteur) n'est lu
     que pour le client survolé, et gardé en mémoire ensuite. */
  const [survol, setSurvol] = useState<{ id: string; x: number; y: number } | null>(null);

  /* Le classement de la liste, retenu dans le navigateur. */
  const [tri, setTri] = useState<Tri>({ cle: 'modif', sens: 'desc' });
  const [menuTri, setMenuTri] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem('emilio.tri.clients');
      if (v) setTri(JSON.parse(v) as Tri);
    } catch { /* navigateur sans stockage : on garde le réglage par défaut */ }
  }, []);
  function classer(cle: TriCle, sensDefaut: 'asc' | 'desc' = 'desc') {
    /* Reprendre le critère déjà actif inverse le sens — c'est ce qu'on attend
       d'un en-tête de tableau. */
    const suivant: Tri = tri.cle === cle
      ? { cle, sens: tri.sens === 'asc' ? 'desc' : 'asc' }
      : { cle, sens: sensDefaut };
    setTri(suivant);
    setMenuTri(false);
    try { localStorage.setItem('emilio.tri.clients', JSON.stringify(suivant)); } catch { /* sans stockage, tant pis */ }
  }
  const [details, setDetails] = useState<Record<string, DetailDossier>>({});
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replieFiltre = useRef(false);
  /* En trois secondes la souris a bougé : on retient sa dernière position,
     dans une référence, pour ne pas redessiner la liste à chaque pixel. */
  const souris = useRef({ x: 0, y: 0 });
  /* On arrive sur les dossiers en cours, pas sur la liste entière : c'est
     eux qu'on vient voir. Les autres onglets restent à un clic. */
  const [filtre, setFiltre] = useState('actif');
  /* Les catégories (types de contact) allumées, au-dessus du statut des
     acheteurs. Elles se cumulent : « Acheteurs » + « Propriétaires » montre
     les deux. « Tous » et « Archivés » sont seuls.
     V3.24 : on arrive sur « Tous », ou sur la catégorie demandée par le menu
     de gauche (« Mes vendeurs »…), ou sur celle qu'on avait en quittant la
     liste pour une fiche. Le menu allume l'entrée de ce qui est affiché. */
  const [cats, setCats] = useState<Categorie[]>(() => lireCats(vueDemandee('clients')));
  /* « Importer depuis ImmoFacile » (V3.61) : la fenêtre, puis les contacts
     qu'elle vient de créer ou de compléter (« Voir les contacts importés »). */
  const [importOuvert, setImportOuvert] = useState(false);
  const [importes, setImportes] = useState<string[] | null>(null);
  /* V3.88 — Les contacts cochés, et le geste en lot en cours. */
  const [choisis, setChoisis] = useState<Set<string>>(() => new Set());
  const [lotMail, setLotMail] = useState<Client[] | null>(null);
  const [lot, setLot] = useState<{ quoi: 'supprimer' | 'archiver' | 'desarchiver'; cibles: Client[]; ignores: { nom: string; pourquoi: string }[]; avancement: Avancement | null; verifie: boolean } | null>(null);
  const basculerChoix = useCallback((id: string) => setChoisis(l => { const n = new Set(l); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const viderChoix = useCallback(() => setChoisis(new Set()), []);
  useEffect(() => { annoncerVue('clients', cats.join('+')); }, [cats]);
  /* Le menu de gauche change la catégorie alors qu'on est déjà ici : sur
     place, sans recharger (V3.25). */
  useEffect(() => {
    const demande = (e: Event) => {
      const d = (e as CustomEvent<{ page: string; vue: string }>).detail;
      if (d?.page === 'clients') { setImportes(null); setCats(lireCats(d.vue)); }
    };
    window.addEventListener(EVT_DEMANDE_VUE, demande);
    return () => window.removeEventListener(EVT_DEMANDE_VUE, demande);
  }, []);
  const choisirCat = (k: Categorie) => setCats(l => {
    if (k === 'tous' || k === 'archives' || k === 'tri') return [k];
    /* « Acheteurs non filtrés » est une partie des acheteurs : l'un remplace
       l'autre, sinon le second clic ne changerait rien. */
    const base = l.filter(x => x !== 'tous' && x !== 'archives' && x !== 'tri' && !(k === 'acheteur' && x === 'non_filtre') && !(k === 'non_filtre' && x === 'acheteur'));
    const n = base.includes(k) ? base.filter(x => x !== k) : [...base, k];
    return n.length ? n : ['tous'];
  });
  /* Les biens de la rubrique Biens, pour les cartes des vendeurs. */
  const [biensV, setBiensV] = useState<BienDuContact[]>([]);
  /* Le second filtre, croisé avec le premier : « Actifs » + « Propriétaires ». */
  const [filtreSit, setFiltreSit] = useState('toutes');
  /* V3.75 : ce qu'ils cherchent (pièces, chambres, surface, budget, ville). */
  const [fa, setFa] = useState<FiltresA>(FILTRES_A_VIDES);
  const [search, setSearch] = useState('');
  /* Venue du « + » ou de « Nouveau contact » : la fenêtre est ouverte dès
     le premier affichage, sans montrer la liste une fraction de seconde. */
  const [showModal, setShowModal] = useState(() => !!fenetre || intentions.nouveauClient);
  const [form, setForm] = useState(initForm);
  const [crit, setCrit] = useState<CritForm>(CRIT_VIDE);
  const [step, setStep] = useState(0);
  /* Les critères se remplissent d'un bloc ou catégorie par catégorie — le
     choix se retient d'un écran à l'autre, comme dans la fiche. */
  const [modeCrit, setModeCrit] = useState<ModeCrit>('tout');
  const [etapeCrit, setEtapeCrit] = useState(0);
  const [sensCrit, setSensCrit] = useState<1 | -1>(1);
  const [adrSug, setAdrSug] = useState<any[]>([]);
  /* Le 2e téléphone et le 2e e-mail : cachés tant qu'on ne les demande pas. */
  const [autresCoord, setAutresCoord] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  /* Un contact qui existe peut-être déjà (V3.50) : trouvé à « Créer », avec
   ce qui était tapé à ce moment-là (`cle`). */
  const [doublon, setDoublon] = useState<{ c: Client; cle: string } | null>(null);
  /* La demande du site d'où vient ce contact (« Créer le contact », V3.34),
     et le contact créé, rendu à la rubrique Demandes du site. */
  const demandeLiee = useRef<string | null>(null);
  const cree = useRef<string | null>(null);

  function openModal() { ouvrirAvec(null); }

  /* Venu d'une demande du site : la fenêtre s'ouvre remplie avec ce que le
     client a donné, et la demande sera reliée au contact une fois créé.
     Depuis la rubrique Demandes du site, « Créer son bien » part décoché :
     on y reste, sauf si Alexandre le coche. */
  function ouvrirAvec(pre: PreRemplissage | null) {
    demandeLiee.current = pre?.demandeId || null;
    cree.current = null;
    setForm(pre ? {
      ...initForm, prenom: pre.prenom, nom: pre.nom, email1: pre.email, tel1: pre.tel,
      types: pre.types, source: 'site', source_detail: pre.source_detail, notes: pre.notes,
      creerBien: !fenetre,
    } : initForm);
    /* V3.50 : une demande « Accompagnement acheteur » garde ce que le client
       a donné (budget, type, surface, pièces…) dans sa recherche. Avant, elle
       repartait vide : « acheteur non filtré », tout était dans les notes. */
    setCrit(pre?.criteres ? { ...CRIT_VIDE, ...pre.criteres } : CRIT_VIDE);
    setStep(0); setEtapeCrit(0); setSensCrit(1); setDoublon(null);
    setError(''); setAdrSug([]); setAutresCoord(false); setShowModal(true);
  }

  useEffect(() => { setModeCrit(lireModeCrit()); }, []);

  /* « + Nouveau client » de la barre du haut : il ramenait seulement sur cette
     page. Il ouvre maintenant le formulaire — qu'on arrive d'ailleurs (le
     drapeau) ou qu'on soit déjà ici (l'événement). */
  useEffect(() => {
    /* La fenêtre seule (demande du site) : elle s'ouvre sur sa demande, et
       laisse l'intention « nouveau client » à la page Contacts. */
    if (fenetre) { ouvrirAvec(fenetre.pre); return; }
    if (prendreIntentionNouveauClient()) openModal();
    const ouvrir = () => openModal();
    window.addEventListener(EVT_NOUVEAU_CLIENT, ouvrir);
    return () => window.removeEventListener(EVT_NOUVEAU_CLIENT, ouvrir);
  }, []);

  // Autocomplétion d'adresse : la Géoplateforme de l'IGN, qui a repris l'API Adresse de data.gouv.fr (V3.26)
  async function searchAdresse(q: string) {
    setForm(f => ({ ...f, adresse_rue: q }));
    if (q.trim().length < 4) { setAdrSug([]); return; }
    try {
      const res = await fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=5&type=housenumber`);
      const data = await res.json();
      setAdrSug(data.features || []);
    } catch { setAdrSug([]); }
  }
  function pickAdresse(feat: any) {
    const p = feat.properties;
    setForm(f => ({ ...f, adresse_rue: p.name || p.label, adresse_cp: p.postcode || '', adresse_ville: p.city || '' }));
    setAdrSug([]);
  }

  useEffect(() => { if (!fenetre) fetchClients(); }, []);

  /* La fenêtre seule se referme (créé, annulé, croix) : on le dit à la
     rubrique qui l'a ouverte. */
  const ouverteUneFois = useRef(false);
  useEffect(() => {
    if (!fenetre) return;
    if (showModal) { ouverteUneFois.current = true; return; }
    if (ouverteUneFois.current) fenetre.onFin(cree.current);
  }, [showModal]);

  async function fetchClients() {
    setLoading(true);
    /* Par pages de 1 000 (V3.33) : au-delà, Supabase coupait sans rien dire. */
    const { data: cl, erreur: eCl } = await toutLire<Client>((de, a) => supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false }).order('id').range(de, a));
    if (eCl) console.error('[contacts] lecture', eCl);
    setErreurLecture(eCl || '');
    const clientsList = cl;

    // V3 : la source de vérité des critères est la table `recherches`, plus `clients.*`.
    // On fusionne sur chaque client les critères de sa recherche d'affichage
    // (active en priorité, sinon la première) pour alimenter les badges du récap.
    const ids = clientsList.map(c => c.id);
    let recherches: any[] = [];
    if (ids.length) {
      const { data: rs } = await toutLire<any>((de, a) => supabase
        .from('recherches')
        .select('*')
        .order('created_at', { ascending: true }).order('id').range(de, a));
      recherches = rs;
    }

    /* V3.75 : `chambres_min` aussi. La pastille des chambres lisait
       `clients.chambres_min`, l'ancienne colonne qui n'est plus tenue à jour. */
    const CRIT_FIELDS = ['type_bien', 'budget_min', 'budget_max', 'surface_min', 'surface_max', 'nb_pieces_min', 'nb_pieces_max', 'chambres_min', 'dpe_max', 'secteurs', 'parking', 'balcon', 'terrasse', 'jardin', 'cave', 'ascenseur'];

    const merged = clientsList.map(c => {
      const rechs = recherches.filter(r => r.client_id === c.id);
      const display = rechs.find(r => r.active) || rechs[0];
      if (!display) return c; // repli sur clients.* si aucune recherche (ne devrait pas arriver)
      const crit: Record<string, unknown> = {};
      for (const f of CRIT_FIELDS) {
        if (display[f] !== undefined && display[f] !== null) crit[f] = display[f];
      }
      /* Le mandat vit sur la recherche depuis la V3. La colonne de même nom
         sur `clients` n'est plus jamais mise à jour : la liste affichait donc
         « mandat expiré » même après l'avoir modifié ou supprimé dans la fiche.
         On lit la recherche, valeurs vides comprises. */
      return {
        ...c, ...crit,
        _espaceOuvertLe: display.espace_ouvert_le || null,
        mandat_date_signature: display.mandat_date_signature ?? null,
        mandat_date_expiration: display.mandat_date_expiration ?? null,
        mandat_duree: display.mandat_duree ?? null,
        mandat_honoraires: display.mandat_honoraires ?? null,
        sans_mandat: display.sans_mandat ?? false,
      };
    });

    setClients(merged);
    setLoading(false);
    supabase.from('biens_vente').select('id, client_id, etape, titre, ville, prix, archive').not('client_id', 'is', null).order('updated_at', { ascending: false })
      .then(({ data, error }) => { if (!error) setBiensV((data || []) as BienDuContact[]); });

    /* Sauf s'il n'y a aucun dossier actif : ouvrir sur un écran vide alors que
       la base est pleine donnerait l'impression que le CRM a tout perdu. */
    if (!replieFiltre.current) {
      replieFiltre.current = true;
      const acheteurs = merged.filter(c => estAcheteur(c));
      if (acheteurs.length > 0 && !acheteurs.some(c => c.statut === 'actif')) setFiltre('tous');
      if (merged.length > 0 && acheteurs.length === 0) setCats(['tous']);
    }

    /* Les compteurs. Jusqu'ici la liste affichait un tiret : ils n'étaient
       jamais calculés. Trois lectures légères suffisent.
       V3.33 : lues par pages de 1 000 — le plafond de Supabase par requête.
       Au-delà, les lignes en trop disparaissaient sans erreur et les compteurs
       mentaient. Plus de liste d'identifiants dans l'adresse non plus : ce
       sont tous les contacts, et avec quelques centaines de fiches l'adresse
       devenait trop longue pour passer. */
    if (ids.length) {
      const [bi, vi, re] = await Promise.all([
        toutLire<any>((de, a) => supabase.from('biens').select('client_id, etape, badge_retour')
          .or('etape.eq.presente,badge_retour.eq.offre_faite').order('id').range(de, a)),
        /* V3.50 : sans les visites annulées, comme la page Visites. */
        toutLire<{ client_id: string; statut: string | null }>((de, a) => supabase.from('visites').select('client_id, statut').order('id').range(de, a)),
        toutLire<any>((de, a) => supabase.from('relances').select('client_id, date_echeance, note')
          .eq('statut', 'en_attente').order('date_echeance', { ascending: true }).order('id').range(de, a)),
      ]);
      const s: Record<string, StatDossier> = {};
      ids.forEach(id => { s[id] = { biens: 0, visites: 0, offres: 0 }; });
      bi.data.forEach((b: any) => {
        const e = s[b.client_id]; if (!e) return;
        if (b.etape === 'presente') e.biens++;
        if (b.badge_retour === 'offre_faite') e.offres++;
      });
      vi.data.forEach(v => { const e = s[v.client_id]; if (e && v.statut !== 'annulee') e.visites++; });
      re.data.forEach((r: any) => { const e = s[r.client_id]; if (e && !e.relance) e.relance = { date: r.date_echeance, note: r.note }; });
      majTri([...new Set((re.data as { client_id: string; note: string | null }[]).filter(r => estTri(r.note) && s[r.client_id]).map(r => String(r.client_id)))]);
      const noter = (j: any) => {
        const e = s[j.client_id];
        if (!e || e.dernierContact) return;
        e.dernierContact = j.created_at;
        e.dernierTitre = j.titre || '';
        e.dernierCote = venantDuClient(j.type, j.titre) ? 'client' : 'moi';
      };
      /* Le dernier geste de chaque dossier : l'historique, du plus récent au
         plus ancien, page par page, jusqu'à ce que chacun ait le sien (cinq
         pages au plus). Le mail « Où en est votre recherche ? » part tout
         seul : ce n'est pas un geste sur le dossier, il ne doit pas masquer
         « Rien depuis… ». */
      const sansGeste = () => ids.filter(id => !s[id].dernierContact);
      for (let de = 0; de < 5000 && sansGeste().length; de += 1000) {
        const { data, error } = await supabase.from('journal').select('client_id, created_at, type, titre')
          .neq('type', 'point_auto').order('created_at', { ascending: false }).order('id').range(de, de + 999);
        if (error || !data) break;
        data.forEach(noter);
        if (data.length < 1000) break;
      }
      /* Un acheteur actif plus ancien que ces pages-là : c'est lui que
         « Rien depuis… » doit signaler, on va chercher sa dernière ligne. */
      const actifsSans = sansGeste().filter(id => { const c = clientsList.find(x => x.id === id); return !!c && c.statut === 'actif' && estAcheteur(c); }).slice(0, 40);
      const derniers = await Promise.all(actifsSans.map(id => supabase.from('journal').select('client_id, created_at, type, titre')
        .eq('client_id', id).neq('type', 'point_auto').order('created_at', { ascending: false }).limit(1)));
      derniers.forEach(r => (r.data || []).forEach(noter));
      setStats(s);
    }
  }

  /* Le détail du survol : la dernière ligne du journal et le nombre de fois
     où le client a ouvert son espace. Une seule fois par client. */
  async function chargerDetail(id: string) {
    if (details[id]) return;
    const [jo, es] = await Promise.all([
      supabase.from('journal').select('titre, type, created_at')
        .eq('client_id', id).order('created_at', { ascending: false }).limit(1),
      supabase.from('espace_evenements').select('id', { count: 'exact', head: true })
        .eq('client_id', id).eq('type', 'ouverture'),
    ]);
    const j = jo.data?.[0] as any;
    setDetails(d => ({ ...d, [id]: {
      journal: j ? { titre: j.titre, type: j.type, date: j.created_at } : null,
      espaceOuvertures: es.count ?? 0,
    } }));
  }

  /* La carte s'ouvre à côté du curseur, pas au bout de la ligne — et une fois
     posée elle ne bouge plus, sinon on ne pourrait pas aller cliquer dedans. */
  const LARGEUR_FICHE = 306, HAUTEUR_FICHE = 340;
  function entrer(id: string, ev: React.MouseEvent) {
    /* Au doigt, il n'y a pas de survol : un toucher ouvre la fiche. Sans ce
       garde-fou, la bulle surgissait trois secondes plus tard sur l'écran
       suivant. */
    if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) return;
    if (minuteur.current) clearTimeout(minuteur.current);
    souris.current = { x: ev.clientX, y: ev.clientY };
    minuteur.current = setTimeout(() => {
      const { x: cx, y: cy } = souris.current;
      let x = cx + 12;
      if (x + LARGEUR_FICHE > window.innerWidth - 12) x = Math.max(12, cx - LARGEUR_FICHE - 12);
      let y = cy - 18;
      if (y + HAUTEUR_FICHE > window.innerHeight - 12) y = Math.max(12, cy - HAUTEUR_FICHE + 18);
      if (y < 12) y = 12;
      setSurvol({ id, x, y });
      chargerDetail(id);
    }, DELAI_BULLE);
  }
  function bouger(ev: React.MouseEvent) { souris.current = { x: ev.clientX, y: ev.clientY }; }
  function sortir() {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setSurvol(null), 130);
  }
  function retenir() { if (minuteur.current) clearTimeout(minuteur.current); }

  /* La recherche vaut pour toutes les catégories. */
  const q0 = normer(search.trim());
  const trouve = (c: Client) => { const p = lirePro(c.pro); return !q0 || normer([c.prenom, c.nom, c.reference, ...(c.emails || []), ...(c.telephones || []),
    p.agence, p.etude, p.immeuble, p.societe, p.metier, p.reseau, c.adresse,
    ...typesDe(c).map(k => typeDe(k).lib)].filter(Boolean).join(' ')).includes(q0) || (c.couple ? normer(nomFoyer(c)).includes(q0) : false); };
  const visibles = clients.filter(c => !estArchive(c));
  const triSet = new Set(triIds);
  const nbCat = (k: Categorie) => k === 'tous' ? visibles.length
    : k === 'archives' ? clients.filter(c => estArchive(c)).length
    : k === 'tri' ? visibles.filter(c => triSet.has(c.id)).length
      : k === 'acheteur' ? visibles.filter(c => estAcheteur(c)).length
        : k === 'non_filtre' ? visibles.filter(c => estAcheteur(c) && sansCriteres(c)).length
          : visibles.filter(c => typesDe(c).includes(k as TypeContact)).length;
  /* Le dernier échange : la dernière ligne du journal, sinon la dernière
     modification de la fiche. */
  const derniere = (c: Client) => stats[c.id]?.dernierContact || (c as { updated_at?: string }).updated_at || (c as { created_at?: string }).created_at || null;
  /* Le tableau détaillé des acheteurs quand on ne regarde que des
     acheteurs ; sinon une ligne par contact, le plus récent en haut. */
  const avecAcheteurs = cats.every(k => k === 'acheteur' || k === 'non_filtre');
  const seulsNonFiltres = avecAcheteurs && !cats.includes('acheteur');
  const dansCats = (c: Client) => cats.some(k => k === 'tous' ? true
    : k === 'tri' ? triSet.has(c.id)
    : k === 'acheteur' ? estAcheteur(c)
      : k === 'non_filtre' ? estAcheteur(c) && sansCriteres(c)
        : typesDe(c).includes(k as TypeContact));
  /* V3.77 : les archivés, par type : les types présents, avec leur nombre. */
  const archives = clients.filter(c => estArchive(c));
  const typesArch = TYPES_CONTACT.map(t => ({ k: t.k, lib: t.pluriel, n: archives.filter(c => typesDe(c).includes(t.k)).length })).filter(t => t.n > 0);
  const typeArchVu = typeArch !== 'tous' && typesArch.some(t => t.k === typeArch) ? typeArch : 'tous';
  const autres = (importes ? clients.filter(c => importes.includes(c.id)) : avecAcheteurs ? [] : cats.includes('archives') ? archives.filter(c => typeArchVu === 'tous' || typesDe(c).includes(typeArchVu)) : visibles.filter(dansCats)).filter(trouve)
    .sort((a, b) => String(derniere(b) || '').localeCompare(String(derniere(a) || '')));
  const seul = cats.length === 1 ? cats[0] : null;
  const biensDe = (id: string) => biensV.filter(b => b.client_id === id);

  /* Les acheteurs du statut, du logement et de la recherche tapée ; puis
     ceux qui demandent ce qu'on a choisi dans « Ce qu'il cherche » (V3.75). */
  const avantCriteres = clients.filter(c => {
    if (!avecAcheteurs || !estAcheteur(c) || estArchive(c)) return false;
    if (seulsNonFiltres && !sansCriteres(c)) return false;
    const matchStatut = filtre === 'tous' || c.statut === filtre;
    const sit = situationDe(c);
    const matchSit = filtreSit === 'toutes'
      || (filtreSit === 'proprietaire' ? (sit === 'proprietaire' || sit === 'vendeur') : sit === filtreSit);
    const q = search.toLowerCase();
    /* Taper « propriétaire » ou « locataire » dans la recherche marche aussi. */
    const motSituation = sit === 'vendeur' ? 'proprietaire revente possible' : sit === 'proprietaire' ? 'proprietaire' : sit === 'locataire' ? normer(OCCUPATION[(c as any).statut_occupation] || '') : '';
    const matchSearch = !search ||
      c.prenom.toLowerCase().includes(q) ||
      /* Le conjoint d'une fiche « couple » se cherche aussi par son prénom. */
      (c.couple ? nomFoyer(c).toLowerCase().includes(q) : false) ||
      c.nom.toLowerCase().includes(q) ||
      c.reference.toLowerCase().includes(q) ||
      (c.emails || []).some(e => e.toLowerCase().includes(q)) ||
      (c.secteurs || []).some(s => s.toLowerCase().includes(q)) ||
      (!!motSituation && motSituation.includes(normer(search.trim())));
    return matchStatut && matchSit && matchSearch;
  });
  const filtered = nbFiltresA(fa) ? avantCriteres.filter(c => correspond(c as never, fa)) : avantCriteres;
  /* Les compteurs du second filtre suivent le premier : « 3 propriétaires »
     parmi les actifs, pas dans toute la base. */
  const nbParSituation = (k: string) => clients
    .filter(c => estAcheteur(c) && !estArchive(c) && (!seulsNonFiltres || sansCriteres(c)))
    .filter(c => filtre === 'tous' || c.statut === filtre)
    .filter(c => { const s = situationDe(c); return k === 'toutes' || (k === 'proprietaire' ? (s === 'proprietaire' || s === 'vendeur') : s === k); })
    .length;

  /* Le contact qui existe peut-être déjà : sa fiche, à la place de la
     création (V3.50). */
  async function ouvrirDoublon(id: string) {
    const { data, error: e } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
    if (e || !data) { setError(e ? `Sa fiche n’a pas pu être ouverte : ${e.message}` : 'Ce contact n’existe plus.'); setDoublon(null); return; }
    setDoublon(null); setShowModal(false); setForm(initForm); setCrit(CRIT_VIDE);
    onNavigate('fiche', data);
  }

  async function handleCreate(e: React.FormEvent, forcer = false) {
    e.preventDefault();
    /* Un double clic ne crée pas deux fiches (V3.50). */
    if (saving) return;
    if (!form.types.length) { setError('Choisissez qui est ce contact : acheteur, vendeur, notaire…'); setStep(0); return; }
    if (!form.prenom.trim() && !form.nom.trim()) { setError('Renseignez au moins un prénom ou un nom'); setStep(1); return; }
    const acheteur = form.types.includes('acheteur');
    setSaving(true); setError('');
    /* V3.50 : avant de créer, un contact qui existe peut-être déjà (même
       e-mail, même téléphone, même nom). Depuis une demande du site, c'est
       déjà fait par la question « Créer la fiche contact ? ». Une lecture
       ratée ne bloque pas la création. */
    const tape: FormDoublon = { ...form, c2_email: form.couple ? form.c2_email : '', c2_tel: form.couple ? form.c2_tel : '' };
    if (!fenetre && !forcer) {
      const { data: tous, erreur: eTous } = await toutLire<Client>((de, a) => supabase.from('clients').select('*').order('id').range(de, a));
      if (eTous) console.error('[contacts] recherche d’un doublon', eTous);
      const d = eTous ? null : trouverDoublon(tape, tous);
      if (d) { setDoublon({ c: d, cle: cleDoublon(tape) }); setSaving(false); return; }
    }
    setDoublon(null);
    try {
      const reference = await genererReference();
      const emails = [form.email1, form.email2].filter(Boolean);
      const telephones = [form.tel1, form.tel2].filter(Boolean);
      const adresse = [form.adresse_rue, [form.adresse_cp, form.adresse_ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      const ent = (v: string) => (v ? parseInt(v) : null);

      const ligne = {
        reference, prenom: form.prenom || '', nom: form.nom || '',
        /* Écrits seulement si Alexandre a choisi : avant le SQL « signature-
           plusieurs », ces colonnes n'existent pas. */
        ...(form.civilite || form.couple ? {
          civilite: form.civilite || null, couple: form.couple,
          conjoint: form.couple ? { civilite: form.c2_civilite, prenom: form.c2_prenom.trim(), nom: form.c2_nom.trim(), email: form.c2_email.trim().toLowerCase(), telephone: form.c2_tel.trim() } : null,
        } : {}),
        /* Le lien de l'espace naît avec le client, pas avec la recherche.
           C'est LE lien qu'on lui enverra : un seul, définitif, même s'il
           ouvre trois recherches par la suite (voir src/lib/espace.ts). */
        token_espace: jetonEspace(form.prenom, form.nom),
        adresse: adresse || null,
        emails, telephones,
        /* Le statut est celui d'un dossier d'achat : un notaire, un vendeur
           n'est pas un acheteur « actif ». */
        statut: acheteur ? form.statut : 'prospect',
        statut_occupation: form.statut_occupation || (form.types.includes('proprietaire') || form.types.includes('vendeur') ? 'proprietaire' : null),
        bien_actuel_a_vendre: form.bien_actuel_a_vendre,
        bien_actuel_type: form.bien_actuel_a_vendre ? (form.bien_actuel_type || null) : null,
        bien_actuel_surface: form.bien_actuel_a_vendre && form.bien_actuel_surface ? parseInt(form.bien_actuel_surface) : null,
        bien_actuel_valeur: form.bien_actuel_a_vendre && form.bien_actuel_valeur ? parseInt(form.bien_actuel_valeur) : null,
        bien_actuel_adresse: form.bien_actuel_a_vendre && !form.bien_actuel_meme_adresse ? (form.bien_actuel_adresse || null) : null,
        bien_actuel_notes: form.bien_actuel_a_vendre ? (form.bien_actuel_notes || null) : null,
        notes: form.notes || null,
        est_vendeur: form.types.includes('vendeur'),
      };
      /* Les champs du métier, et la société qu'il représente (V3.31) si elle a un nom. */
      const soc = structurePropre({ structure: form.pro.structure }).structure;
      const pro = { ...Object.fromEntries(Object.entries(form.pro).filter(([, v]) => typeof v === 'string' && v.trim())), ...(soc ? { structure: soc } : {}) };
      /* La source n'est écrite que si elle a été choisie : avant le SQL
         « source-contact », la colonne n'existe pas. On crée alors le contact
         sans elle, et on le dit. */
      const src = form.source ? { source: form.source, source_detail: form.source_detail.trim() || null } : {};
      const libSrc = libelleSource(form.source, form.source_detail);
      let r = await supabase.from('clients').insert({ ...ligne, ...src, types: form.types, pro }).select().single();
      if (r.error && form.source && colonneSourceAbsente(r.error.message)) {
        r = await supabase.from('clients').insert({ ...ligne, types: form.types, pro }).select().single();
        if (!r.error) signalerEchec('La source du contact', 'lancez d’abord outils/sql/source-contact.sql dans Supabase, puis choisissez-la depuis sa fiche (« Modifier »).');
      }
      if (r.error && colonneContactAbsente(r.error.message)) {
        /* Le SQL des types de contact n'est pas encore passé : un acheteur
           se crée comme avant ; les autres attendent le SQL. */
        if (form.types.length === 1 && acheteur && !Object.keys(pro).length) r = await supabase.from('clients').insert(ligne).select().single();
        else throw new Error('Pour enregistrer un vendeur, un notaire, un confrère…, lance d’abord outils/sql/types-contact.sql dans Supabase.');
      }
      const { data, error: err } = r;

      if (err) throw err;
      /* Le contact vient d'une demande du site : elle lui est reliée, et passe
         en « Traitée » (Demandes du site affiche alors « Voir sa fiche »). */
      if (data && demandeLiee.current) {
        await verifie('Le lien entre la demande du site et ce contact', supabase.from(TABLE_DEMANDES)
          .update({ client_id: data.id, statut: 'traite', statut_le: new Date().toISOString(), is_called: true })
          .eq('id', demandeLiee.current).select('id'), { ligne: true });
        demandeLiee.current = null;
      }
      if (data && !acheteur) {
        await addJournal(data.id, 'creation', 'Contact créé', `${form.types.map(k => typeDe(k).lib).join(', ')} · ${reference}${libSrc ? ` · source : ${libSrc}` : ''}`);
      }
      if (data && acheteur) {
        // Créer la 1ère recherche du client avec tous les critères
        /* Exactement les colonnes qu'écrit « Enregistrer » depuis la fiche :
           une recherche créée ici et une recherche modifiée là-bas sont la
           même chose. C'est la raison d'être du formulaire partagé. */
        /* « Ses critères plus tard » : une recherche vide, l'acheteur est
           « non filtré » tant qu'on ne l'a pas remplie. */
        const cr = form.critPlusTard ? CRIT_VIDE : crit;
        /* Vérifié (V3.17) : un contact sans recherche a une fiche vide et
           aucune veille. Le contact existe déjà : on le dit, et comment
           rattraper (les critères de sa fiche recréent la recherche). */
        const { error: eRech } = await supabase.from('recherches').insert({
          client_id: data.id,
          nom: 'Recherche principale',
          /* L'adresse interne de la recherche. Elle ne s'envoie plus au
             client — c'est le jeton du client, ci-dessus, qu'il reçoit — mais
             les routes /api/espace/ s'en servent pour savoir de quelle
             recherche l'espace parle. */
          token_espace: jetonEspace(form.prenom, form.nom),
          active: form.statut === 'actif',
          /* Les critères : les mêmes colonnes que l'import d'ImmoFacile
             (colonnesCriteres, V3.61). */
          ...colonnesCriteres(cr),
          sans_mandat: form.sans_mandat,
          mandat_date_signature: form.sans_mandat ? null : (form.mandat_date_signature || null),
          mandat_duree: form.sans_mandat ? null : ent(form.mandat_duree),
          mandat_honoraires: form.sans_mandat ? null : (form.mandat_honoraires || null),
        });
        if (eRech) signalerEchec('Le contact est créé, mais sa recherche', `${eRech.message}. Ouvre sa fiche et enregistre ses critères : la recherche se crée alors.`);
        await addJournal(data.id, 'creation', 'Dossier créé', `Référence : ${reference}${libSrc ? ` · source : ${libSrc}` : ''}`);
      }
      const versBien = !!data && !acheteur && form.creerBien && (form.types.includes('vendeur') || form.types.includes('proprietaire'));
      if (fenetre) {
        /* Ouverte depuis une demande du site : on reste dans la rubrique
           (sauf « Créer son bien » coché, qui mène à Biens). */
        cree.current = data?.id || null;
        signalerMaj();
        if (versBien && data) { demanderNouveauBien(data.id); onNavigate('biens'); return; }
        setShowModal(false); setForm(initForm); setCrit(CRIT_VIDE);
        setSaving(false);
        return;
      }
      setShowModal(false);
      setForm(initForm); setCrit(CRIT_VIDE);
      signalerMaj();
      /* Un vendeur : « Nouveau bien » s'ouvre, lui déjà propriétaire. */
      if (versBien && data) { demanderNouveauBien(data.id); onNavigate('biens'); return; }
      fetchClients();
      /* On le montre dans sa catégorie. */
      if (data) setCats([acheteur ? (form.critPlusTard ? 'non_filtre' : 'acheteur') : (form.types.find(k => k !== 'acheteur') as Categorie) || 'tous']);
      /* Un prospect créé pendant qu'on regarde les « Actifs » disparaissait
         aussitôt : on montre son statut. */
      if (data && acheteur && filtre !== 'tous' && filtre !== form.statut) setFiltre('tous');
      if (data && acheteur) setFiltreSit('toutes');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création');
    }
    setSaving(false);
  }

  /* Le classement. Par défaut, le dossier qui a bougé le plus récemment est en
     haut — c'est celui auquel on pense. Le choix est retenu d'une session à
     l'autre : on ne reclasse pas sa liste chaque matin. */
  const ordonne = [...filtered].sort((a, b) => {
    const sens = tri.sens === 'asc' ? 1 : -1;
    const ts = (x: any) => new Date(stats[x.id]?.dernierContact || x.updated_at || x.created_at).getTime();
    const sous = (x: any) => Number(x.budget_max ?? x.budget_min ?? 0);
    switch (tri.cle) {
      case 'nom':
        return sens * `${a.nom || ''} ${a.prenom || ''}`.localeCompare(`${b.nom || ''} ${b.prenom || ''}`, 'fr', { sensitivity: 'base' });
      case 'creation':
        return sens * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case 'budget': {
        const d = sous(a) - sous(b);
        return d !== 0 ? sens * d : `${a.nom}`.localeCompare(`${b.nom}`, 'fr');
      }
      case 'situation': {
        /* À situation égale, le dossier qui a bougé le plus récemment d'abord. */
        const d = RANG_SITUATION[situationDe(a)] - RANG_SITUATION[situationDe(b)];
        return d !== 0 ? sens * d : ts(b) - ts(a);
      }
      default:
        return sens * (ts(a) - ts(b));
    }
  });

  const acheteursCat = clients.filter(c => estAcheteur(c) && !estArchive(c) && (!seulsNonFiltres || sansCriteres(c)));

  /* V3.88 — La sélection : ce qui est affiché (pour « Tout sélectionner »),
     et les contacts cochés, où qu'ils soient. */
  const listeVue: Client[] = avecAcheteurs ? ordonne : (seul === 'tri' ? [] : autres);
  const coches = clients.filter(c => choisis.has(c.id));
  const modeChoix = coches.length > 0;
  const enArchives = !avecAcheteurs && seul === 'archives';
  async function preparerLot(quoi: 'supprimer' | 'archiver' | 'desarchiver') {
    const l = coches;
    if (quoi !== 'supprimer') { setLot({ quoi, cibles: l, ignores: [], avancement: null, verifie: true }); return; }
    /* Avant de supprimer : ce qui l'empêche, contact par contact. */
    setLot({ quoi, cibles: [], ignores: [], avancement: null, verifie: false });
    const raisons = await Promise.all(l.map(c => empecheSuppression(c.id)));
    setLot({ quoi, cibles: l.filter((_, i) => !raisons[i]), ignores: l.map((c, i) => ({ nom: nomFoyer(c) || 'Sans nom', pourquoi: raisons[i] || '' })).filter(x => x.pourquoi), avancement: null, verifie: true });
  }
  async function faireLot() {
    if (!lot) return;
    const { quoi, cibles } = lot;
    const av: Avancement = { fait: 0, total: cibles.length, erreurs: [] };
    setLot(x => (x ? { ...x, avancement: { ...av } } : x));
    const partis: string[] = [];
    for (const c of cibles) {
      try {
        if (quoi === 'supprimer') await effacerContact(c.id);
        else await archiverContact(c.id, quoi === 'archiver');
        av.fait += 1; partis.push(c.id);
      } catch (e) {
        av.erreurs.push(`${nomFoyer(c) || 'Sans nom'} : ${(e as Error).message}`);
      }
      setLot(x => (x ? { ...x, avancement: { ...av, erreurs: [...av.erreurs] } } : x));
    }
    if (quoi === 'supprimer') { setClients(l => l.filter(c => !partis.includes(c.id))); partis.forEach(id => retirerFicheOuverte('contact', id)); }
    else setClients(l => l.map(c => (partis.includes(c.id) ? { ...c, archive: quoi === 'archiver' } : c)));
    setChoisis(l => { const n = new Set(l); partis.forEach(id => n.delete(id)); return n; });
    signalerMaj();
  }
  const nbParStatut = (s: string) => s === 'tous' ? acheteursCat.length : acheteursCat.filter(c => c.statut === s).length;

  /* ═══ NOUVEAU CLIENT ═══════════════════════════════════════════════
     Trois temps : qui est ce client, ce qu'il cherche, ce qui nous lie.
     Le deuxième reprend, à l'identique, le formulaire de critères de la
     fiche — il n'y a plus deux versions à tenir à jour.
     Bâtie ici, avant la page, pour pouvoir s'ouvrir seule (V3.34) : depuis
     une demande du site, « Créer le contact » l'ouvre sans quitter la
     rubrique Demandes du site (prop `fenetre`). */
  const fenetreCreation = showModal && (() => {
        /* Les temps de la création suivent le type : un acheteur a sa
           recherche et son mandat ; un vendeur, un notaire, un confrère… n'ont
           que « qui » et « comment le joindre ». */
        const acheteur = form.types.includes('acheteur');
        const pro = estPro(form.types);
        /* La couleur du formulaire : celle de son type principal (le premier
           qui n'est pas « acheteur », sinon acheteur). */
        const typeP = typeDe(form.types.find(k => k !== 'acheteur') || form.types[0] || 'acheteur');
        const teinte: Teinte = { c: typeP.c, fond: typeP.fond };
        const nomTape = nomFoyer({ prenom: form.prenom, nom: form.nom, couple: form.couple, conjoint: { prenom: form.c2_prenom, nom: form.c2_nom } });
        const quiC = form.prenom.trim() || (form.couple && !pro ? 'eux' : form.civilite === 'Madame' ? 'elle' : 'lui');
        /* La fiche qui se dessine pendant qu'on tape (à gauche ; une bande en
           haut sur téléphone). Elle ne montre que ce qui est saisi. */
        const lieuPro = form.pro.immeuble || form.pro.adresseEtude || form.pro.adresseAgence || form.pro.etude || form.pro.agence || form.pro.societe || '';
        const adresseTapee = [form.adresse_rue, [form.adresse_cp, form.adresse_ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        const srcChoisie = sourceDe(form.source);
        const apercu = (
          <aside className="nc-apercu" aria-label="Aperçu de la fiche">
            <div className="nc-ap-h">
              <AvatarContact c={{ prenom: form.prenom, nom: form.nom, civilite: form.civilite, couple: form.couple && !pro, conjoint: { civilite: form.c2_civilite, prenom: form.c2_prenom }, types: form.types }}
                teinte={{ bg: typeP.fond, fg: typeP.c, trait: 'rgba(255,255,255,.18)' }} taille={62} />
              <div className="nc-ap-txt">
                <div className={`nc-ap-nom${nomTape ? '' : ' vide'}`}>{nomTape || 'Prénom Nom'}</div>
                <div className="nc-ap-types">{form.types.map(k => <Puce key={k} k={k} />)}</div>
              </div>
            </div>
            <div className="nc-ap-b">
              <div className={`nc-ap-l${form.tel1 ? '' : ' vide'}`}><Ic n="telephone" t={15} /><span>{form.tel1 || 'Téléphone'}</span></div>
              <div className={`nc-ap-l${form.email1 ? '' : ' vide'}`}><Ic n="mail" t={15} /><span>{form.email1 || 'E-mail'}</span></div>
              {pro
                ? <div className={`nc-ap-l${lieuPro ? '' : ' vide'}`}><Ic n={IC_PRO[form.types.includes('gardien') ? 'L’immeuble' : form.types.includes('notaire') ? 'Son étude' : form.types.includes('confrere') ? 'Son agence' : 'Son activité']} t={15} /><span>{lieuPro || (form.types.includes('gardien') ? 'Immeuble' : form.types.includes('notaire') ? 'Étude' : form.types.includes('confrere') ? 'Agence' : 'Société')}</span></div>
                : <div className={`nc-ap-l${adresseTapee ? '' : ' vide'}`}><Ic n="lieu" t={15} /><span>{adresseTapee || 'Adresse'}</span></div>}
              {srcChoisie && <div className="nc-ap-src"><Ic n={srcChoisie.ic} t={14} /><span>{libelleSource(form.source, form.source_detail)}</span></div>}
              <div className="nc-aide" style={{ textAlign: 'center' }}>La fiche se dessine au fur et à mesure.</div>
            </div>
          </aside>
        );
        /* Ce qui est propre au type : l'agence d'un confrère, l'étude d'un
           notaire… Juste après l'identité pour un professionnel (c'est ce
           qui compte), après les coordonnées pour un particulier. */
        const champsPro = (
          <ChampsPro types={form.types} pro={form.pro} onChange={x => setForm({ ...form, pro: x })}
            cls={{ row: styles.formRow, group: styles.formGroup, label: styles.label, input: styles.input, bloc: (titre, enfants) => <Bloc key={titre} ic={IC_PRO[titre] || 'dossier'} titre={titre} petit={`ce qui est propre à un ${typeDe(form.types.find(k => k !== 'acheteur') || form.types[0]).lib.toLowerCase()}`} teinte={teinte}>{enfants}</Bloc> }} />
        );
        const GRANDES: { cle: 'type' | 'contact' | 'recherche' | 'mandat'; ico: string; nom: string; sous: string }[] = [
          { cle: 'type', ico: '🏷️', nom: 'Qui est-ce', sous: 'Acheteur, vendeur, notaire, confrère… plusieurs à la fois si besoin' },
          { cle: 'contact', ico: '👤', nom: pro ? 'Ses coordonnées' : 'Le contact', sous: pro ? 'Qui il est, où il travaille, comment le joindre' : 'Qui il est, comment le joindre' },
          ...(acheteur ? [
            { cle: 'recherche' as const, ico: '🎯', nom: 'Sa recherche', sous: 'Ce qu\'il cherche, et où' },
            { cle: 'mandat' as const, ico: '📋', nom: 'Le mandat', sous: 'Ce qui vous lie' },
          ] : []),
        ];
        const pas = GRANDES[Math.min(step, GRANDES.length - 1)].cle;
        const etapesCrit = etapesCriteres(crit, setCrit);
        const nbC = etapesCrit.length;
        const iC = Math.min(Math.max(etapeCrit, 0), nbC - 1);
        const surCriteres = pas === 'recherche' && modeCrit === 'etapes' && !form.critPlusTard;
        const nomRempli = !!(form.prenom.trim() || form.nom.trim());

        const allerC = (n: number) => { setSensCrit(n > iC ? 1 : -1); setEtapeCrit(Math.max(0, Math.min(nbC - 1, n))); };
        const changerMode = (m: ModeCrit) => { setModeCrit(m); setEtapeCrit(0); setSensCrit(1); ecrireModeCrit(m); };
        const allerGrande = (n: number) => {
          if (n > 0 && !form.types.length) { setError('Choisissez d’abord qui est ce contact.'); return; }
          setError(''); setEtapeCrit(0); setSensCrit(1); setStep(Math.max(0, Math.min(GRANDES.length - 1, n)));
        };

        /* « Continuer » avance d'un cran — un cran, c'est une sous-étape des
           critères quand on les remplit une par une, sinon une grande étape. */
        function continuer() {
          if (surCriteres && iC < nbC - 1) { allerC(iC + 1); return; }
          allerGrande(step + 1);
        }
        function revenir() {
          if (surCriteres && iC > 0) { allerC(iC - 1); return; }
          if (step === 0) { setShowModal(false); return; }
          allerGrande(step - 1);
        }
        const dernierCran = step >= GRANDES.length - 1;

        /* Sur <body> : la page qui arrive glisse (animation d'entrée), et la
           fenêtre, dedans, glissait avec elle avant de sauter à sa place. */
        return (
          <Portail>
          <div className={`${styles.modalOverlay} nc-voile`} style={{ animation: 'crmFadeIn 0.2s ease' }}>
            <style>{`
              @keyframes crmFadeIn { from { opacity: 0; } to { opacity: 1; } }
              @keyframes crmPopIn { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
              @keyframes ncEntre { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
              .crm-select { -webkit-appearance: none; -moz-appearance: none; appearance: none; background-color: #fff !important; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23c9a84c' d='M6 8L0 0h12z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 16px center; padding: 11px 38px 11px 14px !important; border-radius: 12px !important; border: 1.5px solid #e3e8f0 !important; font-size: 13.5px !important; font-weight: 600; color: var(--emilio); cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s; box-shadow: 0 1px 2px rgba(0,0,0,0.03); }
              .crm-select:hover { border-color: #cbd5e1 !important; }
              .crm-select:focus { border-color: #c9a84c !important; background-color: #fff !important; box-shadow: 0 0 0 3px rgba(201,168,76,0.12); outline: none; }

              /* Le rail des trois temps */
              .nc-rail { display: flex; gap: 0; margin-top: 18px; }
              .nc-pas { flex: 1 1 0; min-width: 0; background: none; border: none; padding: 0 0 2px; font-family: inherit; text-align: left; cursor: pointer; }
              .nc-pas:disabled { cursor: default; }
              .nc-barre { height: 4px; border-radius: 4px; background: #e3e8f0; margin-right: 6px; transition: background .3s ease; }
              .nc-pas[data-etat="fait"] .nc-barre { background: #c9a84c; }
              .nc-pas[data-etat="ici"] .nc-barre { background: var(--emilio); }
              .nc-lig { display: flex; align-items: baseline; gap: 6px; margin-top: 7px; }
              .nc-lig b { font-size: 11.5px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: .6px; }
              .nc-pas[data-etat="fait"] .nc-lig b { color: #a9822f; }
              .nc-pas[data-etat="ici"] .nc-lig b { color: var(--emilio); }
              .nc-lig i { font-style: normal; font-size: 11.5px; color: #b4bfcd; }
              @media (max-width: 720px) { .nc-lig i { display: none; } }
              .nc-ou { display: none; }

              .nc-corps { animation: ncEntre .26s cubic-bezier(.22,.9,.3,1) both; }

              /* Le statut : cinq cartes plutôt qu'une liste déroulante — on voit
                 ce que chaque état veut dire au lieu de le deviner. */
              .nc-etats { display: grid; grid-template-columns: repeat(auto-fit, minmax(178px, 1fr)); gap: 8px; }
              .nc-etat { display: flex; align-items: flex-start; gap: 9px; padding: 10px 12px; border-radius: 12px; border: 1.5px solid #e3e8f0; background: #fff; cursor: pointer; font-family: inherit; text-align: left; transition: border-color .14s, background .14s, transform .12s; }
              .nc-etat:hover { transform: translateY(-1px); }
              .nc-etat[data-on="true"] { border-color: var(--emilio); background: #f8fafc; }
              .nc-etat u { text-decoration: none; width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
              .nc-etat b { display: block; font-size: 13.5px; font-weight: 700; color: var(--emilio); }
              .nc-etat span { display: block; font-size: 11.5px; color: #8593a8; margin-top: 1px; line-height: 1.4; }

              /* Une personne ou un couple */
              .nc-qui { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; max-width: 460px; }
              .nc-qui-b { justify-content: center; align-items: center; padding: 10px 12px; }
              .nc-couple { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
              @media (max-width: 720px) { .nc-couple { grid-template-columns: 1fr; } }
              .nc-pers { border: 1px solid #e3e8f0; border-radius: 12px; padding: 12px 14px; background: #fff; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
              .nc-pers-t { font-size: 11px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: #a9822f; }
              .nc-civ { display: flex; gap: 6px; }
              .nc-civ button { padding: 6px 12px; border-radius: 9px; font-size: 12.5px; font-weight: 700; border: 1.5px solid #e3e8f0; background: #fff; color: #8593a8; cursor: pointer; font-family: inherit; }
              .nc-civ button[data-on="true"] { border-color: var(--emilio); background: #f8fafc; color: var(--emilio); }
              .nc-note { font-size: 12px; line-height: 1.55; border-radius: 10px; padding: 9px 12px; background: #f8fafc; border: 1px solid #eef1f6; color: #64748b; }

              /* V3.23 — les sections, les champs, l'aperçu */
              .nc-bloc { background: #fff; border: 1px solid #e6ebf2; border-radius: 16px; padding: 16px 18px; box-shadow: 0 1px 2px rgba(15,23,42,.02); min-width: 0; }
              .nc-bloc-t { display: flex; align-items: center; gap: 11px; margin-bottom: 14px; flex-wrap: wrap; }
              .nc-bloc-ic { width: 34px; height: 34px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
              .nc-bloc-t b { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15.5px; font-weight: 800; color: var(--emilio); }
              .nc-bloc-t small { font-size: 12.5px; font-weight: 600; color: #94a3b8; }
              .nc-bloc-corps { display: flex; flex-direction: column; gap: 12px; }
              .nc-fenetre .${styles.input}, .nc-fenetre .${styles.textarea} { background: #fff; border: 1.5px solid #dfe5ee; border-radius: 11px; padding: 11px 13px; font-size: 14px; }
              .nc-fenetre .${styles.input}:focus, .nc-fenetre .${styles.textarea}:focus { border-color: #c9a84c; box-shadow: 0 0 0 3px rgba(201,168,76,.16); }
              .nc-fenetre .${styles.label} { font-size: 12.5px; font-weight: 700; color: #3b4a60; }
              .nc-fenetre .${styles.formRow} { gap: 12px; }
              .nc-fenetre .${styles.formGroup} { gap: 6px; }
              .nc-aide { font-size: 12px; color: #94a3b8; line-height: 1.5; }
              .nc-lien { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; border: none; background: none; padding: 2px 0; font: 700 13px 'DM Sans', sans-serif; color: #a07c28; cursor: pointer; }
              .nc-lien:hover { text-decoration: underline; text-underline-offset: 3px; }
              .nc-deux { display: grid; grid-template-columns: 236px minmax(0, 1fr); gap: 18px; align-items: start; }
              .nc-champs { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
              .nc-apercu { position: sticky; top: 0; border-radius: 18px; overflow: hidden; border: 1px solid #e3e8f0; background: #fff; box-shadow: 0 14px 30px -24px rgba(26,35,50,.6); }
              .nc-ap-h { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 9px; padding: 18px 14px 16px; color: #fff; background: linear-gradient(152deg, #3a5178 0%, #27395a 60%, #2e4166 100%); }
              .nc-ap-txt { display: flex; flex-direction: column; align-items: center; gap: 7px; min-width: 0; max-width: 100%; }
              .nc-ap-nom { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 16.5px; font-weight: 800; line-height: 1.2; overflow-wrap: anywhere; }
              .nc-ap-nom.vide { color: rgba(255,255,255,.45); font-weight: 700; }
              .nc-ap-types { display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; }
              .nc-ap-b { padding: 12px 14px; display: flex; flex-direction: column; gap: 9px; }
              .nc-ap-l { display: flex; align-items: center; gap: 9px; font-size: 13px; color: #3b4a60; min-width: 0; }
              .nc-ap-l svg { color: #a3b0c2; flex-shrink: 0; }
              .nc-ap-l span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
              .nc-ap-l.vide { color: #b4bfcd; }
              .nc-ap-src { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: #fdf8ec; border: 1px solid #efdfb4; font-size: 12.5px; font-weight: 700; color: #7a5d1c; min-width: 0; }
              .nc-ap-src span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
              @media (max-width: 900px) {
                .nc-deux { grid-template-columns: 1fr; gap: 12px; }
                .nc-apercu { position: static; border: none; box-shadow: none; background: none; }
                .nc-ap-h { flex-direction: row; text-align: left; align-items: center; padding: 12px; border-radius: 16px; }
                .nc-ap-h > span:first-child { width: 46px !important; height: 46px !important; }
                .nc-ap-h > span:first-child svg { width: 46px; height: 46px; }
                .nc-ap-txt { align-items: flex-start; }
                .nc-ap-types { justify-content: flex-start; }
                .nc-ap-b { display: none; }
              }
            `}</style>

            <div className={`${styles.modal} nc-fenetre`} style={{ maxWidth: 940, width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '93vh', animation: 'crmPopIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)' }}>

              {/* ── En-tête ── */}
              <div className="nc-tete" style={{ padding: '20px 26px 0', position: 'relative', flexShrink: 0 }}>
                <button className="nc-fermer" aria-label="Fermer" onClick={() => setShowModal(false)} style={{ position: 'absolute', top: 16, right: 18, background: '#f1f5f9', border: 'none', borderRadius: 10, width: 32, height: 32, cursor: 'pointer', color: '#64748b', fontSize: 15 }}>✕</button>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', paddingRight: 46 }}>
                  <div className="nc-titres" style={{ flexGrow: 1, minWidth: 0 }}>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--emilio)', letterSpacing: -0.4 }}>
                      {nomRempli ? nomFoyer({ prenom: form.prenom, nom: form.nom, couple: form.couple, conjoint: { prenom: form.c2_prenom, nom: form.c2_nom } }) : 'Nouveau contact'}
                    </h2>
                    <div className="nc-sous" style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{GRANDES[Math.min(step, GRANDES.length - 1)].sous}</div>
                    {form.types.length > 0 && step > 0 && <div style={{ marginTop: 6 }} className={`${cc.puces} nc-types`}>{form.types.map(k => <Puce key={k} k={k} />)}</div>}
                  </div>
                  {pas === 'recherche' && !form.critPlusTard && <BasculeCriteres mode={modeCrit} onMode={changerMode} />}
                </div>

                <div className="nc-rail">
                  {GRANDES.map((g, i) => (
                    <button key={g.nom} type="button" className="nc-pas"
                      data-etat={i < step ? 'fait' : i === step ? 'ici' : 'avenir'}
                      disabled={i > step && (i > 1 ? !nomRempli : !form.types.length)}
                      onClick={() => allerGrande(i)}>
                      <div className="nc-barre" />
                      <div className="nc-lig"><b>{g.nom}</b>{i === step && <i>{`${i + 1}/${GRANDES.length}`}</i>}</div>
                    </button>
                  ))}
                </div>
                {/* Au téléphone, les libellés du rail sont masqués : l'étape en
                    cours tient sur une ligne. */}
                <div className="nc-ou">{`${GRANDES[Math.min(step, GRANDES.length - 1)].nom} · ${Math.min(step, GRANDES.length - 1) + 1}/${GRANDES.length}`}</div>

                {/* La frise porte son propre retrait : on annule celui du bloc. */}
                {surCriteres && <div className="nc-frise" style={{ margin: '0 -22px' }}><FriseCriteres etapes={etapesCrit} i={iC} onAller={allerC} /></div>}
              </div>

              {/* ── Corps ── */}
              <div className="nc-defil" style={{ padding: '20px 26px', overflowY: 'auto', flex: 1 }}>
                {error && <div className={styles.errorBox} style={{ marginBottom: 16 }}>{error}</div>}

                <div key={`${step}-${surCriteres ? iC : 'x'}`} className="nc-corps">

                  {/* ═══ 0 · QUI EST-CE ═══ */}
                  {pas === 'type' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <Bloc ic="personne" titre="Ce contact est…" petit="un ou plusieurs types">
                        <ChoixTypes v={form.types} onChange={x => { setError(''); setForm({ ...form, types: x }); }} />
                        <div className="nc-note">
                          {form.types.length === 0 ? 'Coche un ou plusieurs types : un propriétaire qui vend et rachète est « vendeur » et « acheteur ».'
                            : form.types.includes('acheteur') ? 'Acheteur : sa recherche et son mandat viennent ensuite. S’il n’a pas encore donné ses critères, il sera « acheteur non filtré ».'
                              : form.types.includes('vendeur') || form.types.includes('proprietaire') ? (form.creerBien ? 'Vendeur ou propriétaire : après ses coordonnées, « Nouveau bien » s’ouvre, lui déjà propriétaire.' : 'Vendeur ou propriétaire : ses coordonnées d’abord. Son bien pourra se créer juste après si vous cochez « Créer son bien ».')
                                : 'Un professionnel : ses coordonnées et son métier, rien de plus. Il se retrouve dans sa catégorie, en haut de la page.'}
                        </div>
                      </Bloc>
                      {/* D'où il vient (V3.23) : facultatif, rien de choisi = rien d'enregistré. */}
                      <Bloc ic="drapeau" titre="D’où vient ce contact ?" petit="facultatif · pour vous rappeler comment vous l’avez eu" teinte={OR}>
                        <ChoixSource source={form.source} detail={form.source_detail} onChange={(so, de) => setForm({ ...form, source: so, source_detail: de })}
                          noms={clients.map(x => nomFoyer(x)).filter(Boolean)} />
                      </Bloc>
                    </div>
                  )}

                  {/* ═══ 1 · LE CONTACT ═══
                      V3.23 : une section par sujet, chacune avec son icône à la
                      couleur du type ; à gauche, la fiche qui se dessine pendant
                      qu'on tape. Aucun champ ne porte d'exemple : un « Sophie »
                      ou un « 06 12 34 56 78 » grisé passait pour déjà rempli. */}
                  {pas === 'contact' && (
                    <div className="nc-deux">
                      {apercu}
                      <div className="nc-champs">
                      <Bloc ic="personne" titre="Qui est-ce" teinte={teinte}>
                        {!pro && <div className="nc-qui">
                          {([['Monsieur', 'Monsieur'], ['Madame', 'Madame'], ['couple', 'Un couple']] as const).map(([k, lib]) => (
                            <button type="button" key={k} className="nc-etat nc-qui-b"
                              data-on={k === 'couple' ? form.couple : !form.couple && form.civilite === k}
                              onClick={() => setForm(k === 'couple' ? { ...form, couple: true } : { ...form, couple: false, civilite: k })}>
                              <b>{lib}</b>
                            </button>
                          ))}
                        </div>}
                        {pro && <Civilite v={form.civilite} onV={v => setForm({ ...form, couple: false, civilite: v })} />}
                        {!form.couple || pro ? (
                          <div className={styles.formRow}>
                            <div className={styles.formGroup}><label className={styles.label}>Prénom</label><input className={styles.input} value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} autoFocus /></div>
                            <div className={styles.formGroup}><label className={styles.label}>Nom</label><input className={styles.input} value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} /></div>
                          </div>
                        ) : (
                          <>
                            <div className="nc-couple">
                              <div className="nc-pers">
                                <div className="nc-pers-t">Personne 1 · contact principal</div>
                                <Civilite v={form.civilite} onV={c => setForm({ ...form, civilite: c })} />
                                <div className={styles.formRow}>
                                  <div className={styles.formGroup}><label className={styles.label}>Prénom</label><input className={styles.input} value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} autoFocus /></div>
                                  <div className={styles.formGroup}><label className={styles.label}>Nom</label><input className={styles.input} value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} /></div>
                                </div>
                                {/* Ses coordonnées ici, comme pour la personne 2 : elles
                                    étaient plus bas, dans « Contact », et on les cherchait. */}
                                <div className={styles.formRow}>
                                  <div className={styles.formGroup}><label className={styles.label}>Téléphone</label><input className={styles.input} type="tel" value={form.tel1} onChange={e => setForm({ ...form, tel1: e.target.value })} /></div>
                                  <div className={styles.formGroup}><label className={styles.label}>E-mail</label><input className={styles.input} type="email" value={form.email1} onChange={e => setForm({ ...form, email1: e.target.value })} /></div>
                                </div>
                              </div>
                              <div className="nc-pers">
                                <div className="nc-pers-t">Personne 2</div>
                                <Civilite v={form.c2_civilite} onV={c => setForm({ ...form, c2_civilite: c })} />
                                <div className={styles.formRow}>
                                  <div className={styles.formGroup}><label className={styles.label}>Prénom</label><input className={styles.input} value={form.c2_prenom} onChange={e => setForm({ ...form, c2_prenom: e.target.value })} /></div>
                                  <div className={styles.formGroup}><label className={styles.label}>Nom</label><input className={styles.input} value={form.c2_nom} onChange={e => setForm({ ...form, c2_nom: e.target.value })} /></div>
                                </div>
                                <div className={styles.formRow}>
                                  <div className={styles.formGroup}><label className={styles.label}>{'Téléphone · facultatif'}</label><input className={styles.input} type="tel" value={form.c2_tel} onChange={e => setForm({ ...form, c2_tel: e.target.value })} /></div>
                                  <div className={styles.formGroup}><label className={styles.label}>E-mail</label><input className={styles.input} type="email" value={form.c2_email} onChange={e => setForm({ ...form, c2_email: e.target.value })} /></div>
                                </div>
                              </div>
                            </div>
                            <div className="nc-note">{'Le mandat en ligne sera préparé à leurs deux noms. La personne 1 reçoit les mails et a l’espace client ; la personne 2 reçoit son propre lien et son propre code pour signer.'}</div>
                          </>
                        )}
                      </Bloc>

                      {/* Le joindre. Un couple a déjà les coordonnées de chacun
                          au-dessus : ici, seulement un numéro commun ou un autre
                          e-mail, à la demande. */}
                      <Bloc ic="telephone" titre="Le joindre" teinte={teinte}>
                        {!(form.couple && !pro) && (
                          <div className={styles.formRow}>
                            <div className={styles.formGroup}><label className={styles.label}>Téléphone</label><input className={styles.input} type="tel" value={form.tel1} onChange={e => setForm({ ...form, tel1: e.target.value })} /></div>
                            <div className={styles.formGroup}><label className={styles.label}>E-mail</label><input className={styles.input} type="email" value={form.email1} onChange={e => setForm({ ...form, email1: e.target.value })} /></div>
                          </div>
                        )}
                        {autresCoord || form.tel2 || form.email2 ? (
                          <div className={styles.formRow}>
                            <div className={styles.formGroup}><label className={styles.label}>{'Autre téléphone · facultatif'}</label><input className={styles.input} type="tel" value={form.tel2} onChange={e => setForm({ ...form, tel2: e.target.value })} /></div>
                            <div className={styles.formGroup}><label className={styles.label}>{'Autre e-mail · facultatif'}</label><input className={styles.input} type="email" value={form.email2} onChange={e => setForm({ ...form, email2: e.target.value })} /></div>
                          </div>
                        ) : (
                          <button type="button" className="nc-lien" onClick={() => setAutresCoord(true)}>
                            <Ic n="plus" t={14} e={2.4} />{form.couple && !pro ? 'Un numéro commun ou un autre e-mail' : 'Un autre téléphone ou e-mail'}
                          </button>
                        )}
                      </Bloc>

                      {/* Un professionnel se joint à son agence, son étude, son
                         immeuble : son adresse est dans la section de son métier. */}
                      {pro ? champsPro : (
                        <Bloc ic="lieu" titre="Son adresse" teinte={teinte}>
                          <div className={styles.formGroup} style={{ position: 'relative' }}>
                            <label className={styles.label}>Adresse</label>
                            <input className={styles.input} value={form.adresse_rue} onChange={e => searchAdresse(e.target.value)} autoComplete="off" />
                            {adrSug.length > 0 && (
                              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'white', border: '1px solid #e3e8f0', borderRadius: 12, marginTop: 4, overflow: 'hidden', boxShadow: '0 10px 30px rgba(15,22,35,.14)' }}>
                                {adrSug.map((f: any, i: number) => (
                                  <button type="button" key={i} onClick={() => pickAdresse(f)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 13px', border: 'none', borderBottom: i < adrSug.length - 1 ? '1px solid #f1f5f9' : 'none', background: 'white', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--emilio)' }}>
                                    {f.properties?.label}
                                  </button>
                                ))}
                              </div>
                            )}
                            <span className="nc-aide">{'Tapez l’adresse : elle se complète toute seule.'}</span>
                          </div>
                          <div className={styles.formRow}>
                            <div className={styles.formGroup}><label className={styles.label}>Code postal</label><input className={styles.input} value={form.adresse_cp} onChange={e => setForm({ ...form, adresse_cp: e.target.value })} /></div>
                            <div className={styles.formGroup}><label className={styles.label}>Ville</label><input className={styles.input} value={form.adresse_ville} onChange={e => setForm({ ...form, adresse_ville: e.target.value })} /></div>
                          </div>
                        </Bloc>
                      )}

                      {!pro && champsPro}

                      {!acheteur && (form.types.includes('vendeur') || form.types.includes('proprietaire')) && (
                        <Bloc ic="maison" titre="Son bien" teinte={teinte}>
                          <button type="button" onClick={() => setForm({ ...form, creerBien: !form.creerBien })} style={{ ...pill(form.creerBien, '#c9a84c', '#fbf6e9', '#8a6a1f'), alignSelf: 'flex-start' }}>
                            {form.creerBien ? '✓ ' : ''}Créer son bien juste après (rubrique Biens)
                          </button>
                          <div className="nc-aide">« Nouveau bien » s’ouvre, lui déjà propriétaire : à suivre, estimation ou mandat signé.</div>
                        </Bloc>
                      )}

                      {acheteur && <Bloc ic="drapeau" titre="Où en est ce dossier" teinte={teinte}>
                        <div className="nc-etats">
                          {ETATS_NOUVEAU.map(e => (
                            <button type="button" key={e.cle} className="nc-etat" data-on={form.statut === e.cle}
                              onClick={() => setForm({ ...form, statut: e.cle as StatutClient })}>
                              <u style={{ background: e.point }} />
                              <span style={{ display: 'block' }}>
                                <b>{e.nom}</b>
                                <span>{e.quand}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: 12, lineHeight: 1.55, borderRadius: 10, padding: '9px 12px',
                          background: form.statut === 'actif' ? '#ecfdf5' : '#f8fafc',
                          border: `1px solid ${form.statut === 'actif' ? '#bbf7d0' : '#eef1f6'}`,
                          color: form.statut === 'actif' ? '#15803d' : '#64748b' }}>
                          {form.statut === 'actif'
                            ? 'La veille cherchera pour ce client dès la création du dossier.'
                            : 'Aucune veille tant que le dossier n\'est pas « Actif ». Vous pourrez basculer le statut à tout moment depuis sa fiche.'}
                        </div>
                      </Bloc>}

                      {acheteur && <Bloc ic="maison" titre="Sa situation aujourd’hui" teinte={teinte}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Statut d&apos;occupation</label>
                          <select className={`${styles.input} crm-select`} value={form.statut_occupation} onChange={e => setForm({ ...form, statut_occupation: e.target.value })}>
                            <option value="">Non précisé</option>
                            <option value="proprietaire">Propriétaire</option>
                            <option value="locataire">Locataire</option>
                            <option value="heberge">Hébergé</option>
                            <option value="autre">Autre</option>
                          </select>
                        </div>
                        <button type="button" onClick={() => setForm({ ...form, bien_actuel_a_vendre: !form.bien_actuel_a_vendre })} style={{ ...pill(form.bien_actuel_a_vendre, '#ea580c', '#fff7ed', '#ea580c'), alignSelf: 'flex-start' }}>
                          {form.bien_actuel_a_vendre ? '✓ ' : ''}Revente possible après l&apos;achat (mandat vendeur potentiel)
                        </button>
                        {form.bien_actuel_a_vendre && (
                          <>
                            <div className={styles.formRow}>
                              <div className={styles.formGroup}><label className={styles.label}>Type de bien</label><input className={styles.input} value={form.bien_actuel_type} onChange={e => setForm({ ...form, bien_actuel_type: e.target.value })} /></div>
                              <div className={styles.formGroup}><label className={styles.label}>Surface (m²)</label><input className={styles.input} type="number" value={form.bien_actuel_surface} onChange={e => setForm({ ...form, bien_actuel_surface: e.target.value })} /></div>
                            </div>
                            <div className={styles.formGroup}><label className={styles.label}>Valeur estimée (€)</label><input className={styles.input} type="number" value={form.bien_actuel_valeur} onChange={e => setForm({ ...form, bien_actuel_valeur: e.target.value })} /></div>
                            <button type="button" onClick={() => setForm({ ...form, bien_actuel_meme_adresse: !form.bien_actuel_meme_adresse })} style={{ ...pill(form.bien_actuel_meme_adresse, '#0ea5e9', '#f0f9ff', '#0ea5e9'), alignSelf: 'flex-start' }}>
                              {form.bien_actuel_meme_adresse ? '✓ ' : ''}À la même adresse que le contact
                            </button>
                            {!form.bien_actuel_meme_adresse && (
                              <div className={styles.formGroup}><label className={styles.label}>Adresse du bien à revendre</label><input className={styles.input} value={form.bien_actuel_adresse} onChange={e => setForm({ ...form, bien_actuel_adresse: e.target.value })} /></div>
                            )}
                            <div className={styles.formGroup}><label className={styles.label}>{'Précisions · facultatif'}</label><textarea className={styles.textarea} value={form.bien_actuel_notes} onChange={e => setForm({ ...form, bien_actuel_notes: e.target.value })} rows={2} /></div>
                          </>
                        )}
                      </Bloc>}

                      <Bloc ic="crayon" titre={`À savoir sur ${quiC}`} petit="pour vous seul" teinte={OR}>
                        <textarea className={styles.textarea} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} />
                        <span className="nc-aide">{acheteur
                          ? 'Son projet, ce qu’il vous a dit, comment vous vous êtes connus… S’affiche en haut de sa fiche, dans « À savoir ». Les précisions que le client verra se remplissent à l’étape « Sa recherche ».'
                          : 'Ce qu’il vous a dit, comment vous vous êtes connus… S’affiche en haut de sa fiche, dans « À savoir ».'}</span>
                      </Bloc>
                      </div>
                    </div>
                  )}

                  {/* ═══ 2 · SA RECHERCHE ═══ */}
                  {pas === 'recherche' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <button type="button" onClick={() => setForm({ ...form, critPlusTard: !form.critPlusTard })} style={{ ...pill(form.critPlusTard, '#64748b', '#f1f5f9', '#34496e'), alignSelf: 'flex-start' }}>
                        {form.critPlusTard ? '✓ ' : ''}Ses critères plus tard : acheteur non filtré
                      </button>
                      {form.critPlusTard ? (
                        <div className="nc-note">Il sera dans « Acheteurs non filtrés » jusqu’à ce que sa recherche ait ses critères : tu les saisiras depuis sa fiche.</div>
                      ) : (
                        <div className={modeCrit === 'etapes' ? classesCrit.critCorps : undefined}
                          style={modeCrit === 'tout' ? { display: 'flex', flexDirection: 'column', gap: 14 } : undefined}>
                          <CorpsCriteres etapes={etapesCrit} mode={modeCrit} i={iC} sens={sensCrit} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ 3 · LE MANDAT ═══ */}
                  {pas === 'mandat' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <Bloc ic="doc" titre="Mandat de recherche" teinte={teinte}>
                        <button type="button" onClick={() => setForm({ ...form, sans_mandat: !form.sans_mandat })} style={{ ...pill(form.sans_mandat, '#3b82f6', '#eff6ff', '#1e40af'), alignSelf: 'flex-start' }}>
                          {form.sans_mandat ? '✓ ' : ''}Recherche sans mandat signé
                        </button>
                        {!form.sans_mandat && (
                          <>
                            <div className={styles.formRow}>
                              <div className={styles.formGroup}><label className={styles.label}>Date de signature</label><input className={styles.input} type="date" value={form.mandat_date_signature} onChange={e => setForm({ ...form, mandat_date_signature: e.target.value })} /></div>
                              <div className={styles.formGroup}><label className={styles.label}>Durée (mois)</label><input className={styles.input} type="number" value={form.mandat_duree} onChange={e => setForm({ ...form, mandat_duree: e.target.value })} /></div>
                            </div>
                            <div className={styles.formGroup}><label className={styles.label}>Honoraires convenus</label><input className={styles.input} value={form.mandat_honoraires} onChange={e => setForm({ ...form, mandat_honoraires: e.target.value })} /></div>
                          </>
                        )}
                      </Bloc>

                    </div>
                  )}
                </div>
              </div>

              {/* ── Pied ── */}
              <div className="nc-pied" style={{ padding: '14px 26px', borderTop: '1px solid #f1f5f9', background: '#fbfcfe', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
                {/* V3.50 : un contact qui existe peut-être déjà. Juste au-dessus
                    des boutons, pour qu'on le voie quelle que soit l'étape. */}
                {doublon && doublon.cle === cleDoublon({ ...form, c2_email: form.couple ? form.c2_email : '', c2_tel: form.couple ? form.c2_tel : '' }) && (
                  <div role="alert" style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px', fontSize: 13, color: '#92400e', lineHeight: 1.45 }}>
                    <span style={{ flex: '1 1 260px', minWidth: 0 }}>
                      {`Ce contact existe peut-être déjà : ${nomFoyer(doublon.c) || 'sans nom'}${[doublon.c.telephones?.[0], doublon.c.emails?.[0]].filter(Boolean).length ? `, ${[doublon.c.telephones?.[0], doublon.c.emails?.[0]].filter(Boolean).join(', ')}` : ''}${estArchive(doublon.c) ? ' (archivé)' : ''}.`}
                    </span>
                    <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className={styles.btnPrimary} disabled={saving} onClick={() => ouvrirDoublon(doublon.c.id)}>Ouvrir sa fiche</button>
                      <button type="button" className={styles.btnSecondary} disabled={saving} onClick={e => handleCreate(e, true)}>Créer quand même</button>
                    </span>
                  </div>
                )}
                {/* Au téléphone : « ← » seul, et pas d'« Annuler » (la croix
                    est en haut) — tout tient sur une ligne. */}
                {step === 0
                  ? <button type="button" className={`${styles.btnSecondary} nc-annuler`} onClick={revenir}>Annuler</button>
                  : <button type="button" className={`${styles.btnSecondary} nc-prec`} onClick={revenir} aria-label="Précédent"><span aria-hidden="true">←</span><span className="nc-mot">{' Précédent'}</span></button>}
                <span style={{ flexGrow: 1 }} />
                {!dernierCran && (
                  <button type="button" className={`${styles.btnSecondary} nc-maint`} disabled={saving || !nomRempli || !form.types.length}
                    style={{ opacity: nomRempli ? 1 : 0.45 }}
                    title="Crée le dossier avec ce qui est déjà rempli — le reste se complète depuis la fiche"
                    onClick={handleCreate}>
                    {saving ? '…' : 'Créer maintenant'}
                  </button>
                )}
                {dernierCran ? (
                  <button type="button" className={`${styles.btnPrimary} nc-suite`} disabled={saving} onClick={handleCreate}>
                    {saving ? 'Création…' : acheteur ? '✓ Créer le dossier' : '✓ Créer le contact'}
                  </button>
                ) : (
                  <button type="button" className={`${styles.btnPrimary} nc-suite`} disabled={step === 0 && !form.types.length} style={step === 0 && !form.types.length ? { opacity: 0.5 } : undefined} onClick={continuer}>Continuer →</button>
                )}
              </div>
            </div>
          </div>
          </Portail>
        );
  })();

  /* Ouverte depuis une demande du site : la fenêtre seule, sans la liste. */
  if (fenetre) return <>{fenetreCreation}</>;

  return (
    <div className={styles.page}>
      {/* L'EN-TÊTE — le titre et les statuts dans un seul bloc. La ligne grise
          « 8 clients · 5 actifs · 2 prospects » a disparu : les mêmes chiffres
          sont dans les tuiles, en grand, et cliquer dessus filtre la liste. */}
      <EnteteRubrique titre="Mes contacts" icone={PictoClients}
        recherche={{ valeur: search, onChange: setSearch, placeholder: 'Nom, e-mail, agence, secteur, référence…', label: 'Chercher un contact' }}
        bouton={{ lib: 'Nouveau contact', onClick: openModal }}
        bouton2={{ lib: 'Importer depuis ImmoFacile', court: 'Importer', ic: <Ic n="telecharger" t={15} />, onClick: () => setImportOuvert(true) }}
        phrase="Clique plusieurs types pour les voir ensemble."
        label="Filtrer par type de contact" actif={cats} onChoisir={k => { setImportes(null); choisirCat(k as Categorie); }}
        tuiles={[...ORDRE_TUILES.map(k => CATEGORIES.find(x => x.cle === k)).filter((x): x is (typeof CATEGORIES)[number] => !!x), TUILE_TRI, CATEGORIES[0], { cle: 'archives' as Categorie, lib: 'Archivés' }]
          /* Pas de tuile « 0 » : « Tous » toujours, les autres dès qu'il y a
             quelqu'un dedans — ou si elle est allumée (« Mes propriétaires »
             depuis le menu, alors qu'il n'y en a pas encore). « Tri à faire »
             (V3.76) suit la même règle : le dernier appel passé, elle reste
             le temps de lire « Tri terminé », puis disparaît. */
          /* V3.78 : « Archivés » toujours là, même vide : sa place ne bouge pas. */
          .filter(x => x.cle === 'tous' || x.cle === 'archives' || nbCat(x.cle) > 0 || cats.includes(x.cle))
          .map((x, i, l) => ({ cle: x.cle, lib: x.lib, n: nbCat(x.cle), couleur: x.couleur, alerte: x.cle === 'tri',
            /* V3.77 : la première du groupe de fin part tout à droite. */
            fin: FIN_TUILES.includes(x.cle) && !FIN_TUILES.includes(l[i - 1]?.cle as Categorie),
            archive: x.cle === 'archives',
            menu: MENU_TUILES.includes(x.cle),
            ...(x.cle === 'tous' ? { tete: true, ic: <Ic n="groupe" t={14} e={2.1} /> } : {}) }))} />

      {/* LES ACHETEURS — une seule ligne « Affiner » (V3.75) : le statut du
          dossier, son logement, puis ce qu'il cherche. Avant : deux rangées de
          boutons (« Dossier », « Son logement ») au-dessus. */}
      {avecAcheteurs && <div className="ligne-entre">
        <FiltresAcheteurs base={avantCriteres as never[]} f={fa} onF={setFa} n={filtered.length}
          statut={{
            v: filtre, tout: 'tous', onChange: setFiltre,
            options: STATUTS.map(x => ({ k: x.key, l: x.key === 'tous' ? 'Tous les statuts' : x.label, n: nbParStatut(x.key), c: x.color || undefined })),
          }}
          logement={{
            v: filtreSit, tout: 'toutes', onChange: setFiltreSit,
            options: SITUATIONS.map(x => ({
              k: x.key, l: x.key === 'toutes' ? 'Tous les logements' : x.label, n: nbParSituation(x.key), dans: x.key === 'vendeur',
              aide: x.key === 'vendeur' ? 'Des propriétaires qui revendront après leur achat : un mandat vendeur possible. Ils sont aussi comptés dans « Propriétaires ».'
                : x.key === 'proprietaire' ? 'Propriétaires de leur logement, revente possible comprise.'
                  : x.key === 'inconnue' ? 'Leur situation n’est pas renseignée : à compléter sur leur fiche.' : undefined,
            })),
          }} />
      </div>}

      {/* LISTE — les acheteurs dans leur tableau détaillé ; « Tous » et les
          autres types, une ligne par contact. */}
      {loading ? (
        /* Pendant la lecture : la silhouette de la liste, plutôt qu'un mot
           seul qui laissait place d'un coup à tout le tableau (V3.25). */
        <div className="squelette" aria-busy="true" aria-label="Chargement des contacts">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="sq-ligne" style={{ animationDelay: `${i * 45}ms` }}>
              <span className="sq-rond" />
              <span className="sq-txt">
                <span className="sq-barre" style={{ width: `${38 + ((i * 17) % 30)}%` }} />
                <span className="sq-barre sq-fine" style={{ width: `${22 + ((i * 23) % 26)}%` }} />
              </span>
              <span className="sq-barre sq-bout" />
            </div>
          ))}
        </div>
      ) : erreurLecture && !clients.length ? (
        <div className={cc.vide}>
          <b>Les contacts n’ont pas pu être lus</b>
          <span style={{ display: 'block' }}>{`${erreurLecture}. Vérifie ta connexion, puis réessaie.`}</span>
          <button type="button" className={styles.btnSecondary} style={{ marginTop: 12 }} onClick={() => fetchClients()}>Réessayer</button>
        </div>
      ) : (
        <>
          {erreurLecture && <div className={styles.errorBox} style={{ marginBottom: 12 }}>{`Une partie des contacts n’a pas pu être lue (${erreurLecture}) : la liste est peut-être incomplète. Recharge la page.`}</div>}
          {avecAcheteurs && (
            <div className={cc.section}>
              {filtered.length === 0 ? (
                <div className={styles.empty}>
                  <div className={styles.emptyIcon}>👥</div>
                  <div className={styles.emptyTitle}>{nbFiltresA(fa) ? 'Aucun acheteur ne demande cela' : search || filtre !== 'tous' || filtreSit !== 'toutes' || seulsNonFiltres ? 'Aucun acheteur ici' : 'Aucun acheteur pour l\'instant'}</div>
                  <div className={styles.emptySub}>{nbFiltresA(fa) ? `Parmi les ${avantCriteres.length} acheteurs de ce statut, aucun ne correspond à « Ce qu’il cherche ».` : seulsNonFiltres ? 'Tous tes acheteurs ont leurs critères.' : filtre !== 'tous' ? 'Change de statut, juste au-dessus.' : 'Clique sur « + Nouveau contact » pour commencer.'}</div>
                  {nbFiltresA(fa) > 0 && <button type="button" className={styles.btnSecondary} style={{ marginTop: 12 }} onClick={() => setFa(FILTRES_A_VIDES)}>Effacer « Ce qu’il cherche »</button>}
                </div>
              ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Les en-têtes : posés sur le fond, pas dans une barre — ils cadrent
                  l'œil sans transformer la page en tableur. */}
              <div className={`${styles.entete} ligne-entre`}>
                <span className={styles.colClient} style={{ position: 'relative', gap: 8 }}>
                  Client
                  {menuTri && <span onClick={() => setMenuTri(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}
                  {/* Le bouton dit l'ordre en cours, pas le mot « Classer » : on veut
                      savoir pourquoi la liste est dans cet ordre sans ouvrir le menu. */}
                  <button className={`${styles.triBtn} ${styles.triBtnActif}`}
                    onClick={() => setMenuTri(v => !v)} title="Choisir l'ordre de la liste">
                    <Ico t={11} c="#ffffff"
                      d={tri.sens === 'asc'
                        ? <><path d="M7 20V4" /><path d="M4 8l3-4 3 4" /><path d="M14 7h6" /><path d="M14 12h5" /><path d="M14 17h3" /></>
                        : <><path d="M7 4v16" /><path d="M4 16l3 4 3-4" /><path d="M14 7h3" /><path d="M14 12h5" /><path d="M14 17h6" /></>} />
                    {TRIS.find(t => t.cle === tri.cle)?.court || 'Classer'}
                  </button>
                  {menuTri && (
                    <span className={styles.triMenu}>
                      {TRIS.map(t => {
                        const actif = tri.cle === t.cle;
                        return (
                          <button key={t.cle} className={styles.triItem} onClick={() => classer(t.cle, t.sensDefaut)}
                            style={actif ? { background: '#fdfaf1' } : undefined}>
                            <span style={{ width: 12, flexShrink: 0, color: '#c9a84c', fontSize: 12 }}>{actif ? '✓' : ''}</span>
                            <span style={{ flexGrow: 1, minWidth: 0 }}>
                              <b>{t.nom}</b>
                              <small>{actif && tri.sens !== t.sensDefaut ? 'ordre inversé' : t.note}</small>
                            </span>
                          </button>
                        );
                      })}
                    </span>
                  )}
                </span>
                <span className={styles.colRech}>Recherche</span>
                <span className={styles.colSect}>Secteur recherché</span>
                <span className={styles.colBud} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7 }}>
                  Budget max
                  <button className={`${styles.triFleche} ${tri.cle === 'budget' ? styles.triBtnActif : ''}`}
                    onClick={() => classer('budget', 'desc')}
                    title={tri.cle === 'budget' && tri.sens === 'asc' ? 'Budgets les plus élevés en haut' : 'Budgets les plus bas en haut'}>
                    <Ico t={11} c={tri.cle === 'budget' ? '#ffffff' : '#8593a8'}
                      d={tri.cle === 'budget' && tri.sens === 'asc'
                        ? <><path d="M12 5v14" /><path d="M6 11l6-6 6 6" /></>
                        : <><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></>} />
                  </button>
                </span>
                <span className={styles.colSig}>Signal</span>
              </div>

              <div className={styles.list} key={`${cats.join('+')}:${filtre}:${filtreSit}:${search}:${JSON.stringify(fa)}`}>
                {ordonne.map((client, rang) => {
                  const st = stats[client.id];
                  const sig = signalDe(client, st);
                  const t = TEINTE[client.statut] || TEINTE.actif;
                  const villes = villesDe(client.secteurs);
                  const clos = (client.statut as string) === 'bien_trouve' || (client.statut as string) === 'perdu';
                  const ouvert = survol?.id === client.id;

                  return (
                    <div
                      key={client.id}
                      className={`${styles.ligne} ligne-entre ${ouvert ? styles.ligneOuverte : ''} sel-ligne`}
                      style={{ animationDelay: `${Math.min(rang, 9) * 28}ms`, ...(clos ? { background: '#fbfcfe' } : {}), ...(choisis.has(client.id) ? STYLE_CHOISI : {}) }}
                      onClick={() => onNavigate('fiche', client)}
                      onMouseEnter={e => entrer(client.id, e)}
                      onMouseMove={bouger}
                      onMouseLeave={sortir}
                    >
                      <span className={styles.colClient}>
                        {/* Un petit personnage plutôt qu'une initiale (deux pour un couple). */}
                        <AvecCase on={choisis.has(client.id)} mode={modeChoix} onBasculer={() => basculerChoix(client.id)} titre={choisis.has(client.id) ? `Décocher ${nomFoyer(client)}` : `Cocher ${nomFoyer(client)}`}>
                          <AvatarContact c={client as never} teinte={t} className={styles.avatar} libre />
                        </AvecCase>
                        <span style={{ minWidth: 0 }}>
                          <span className={styles.nom} title={nomFoyer(client)} style={clos ? { color: '#6b7a90' } : undefined}>{nomFoyer(client)}</span>
                          <span className={styles.ref}>
                            {client.reference?.replace('EMI-2026-', 'EMI-') || client.reference}
                            {/* Une couleur seule ne se comprend pas : on la nomme. */}
                            {(client.statut as string) !== 'actif' && (
                              <span className={styles.etiquette} style={{ color: t.fg, background: t.bg, border: `1px solid ${t.trait}` }}>
                                {ETIQUETTE[client.statut] || client.statut}
                              </span>
                            )}
                            {(() => {
                              /* Il vend aussi un bien (rubrique Biens) : on le dit. */
                              if (typesDe(client).includes('vendeur')) return (
                                <span className={styles.proprio} title="Il vend aussi un bien : voir sa fiche ou la rubrique Biens">
                                  <Ico t={10} d={D_CLE} c="#9a7d2e" />Vendeur aussi
                                </span>
                              );
                              const sit = situationDe(client);
                              if (sit === 'vendeur' || sit === 'proprietaire') return (
                                <span className={`${styles.proprio} ${sit === 'vendeur' ? styles.proprioVend : ''}`}
                                  title={sit === 'vendeur' ? 'Propriétaire, il revendra sans doute son bien après l\u2019achat : mandat vendeur possible' : 'Propriétaire de son logement actuel'}>
                                  <Ico t={10} d={D_CLE} c={sit === 'vendeur' ? '#1a2332' : '#9a7d2e'} />
                                  {sit === 'vendeur' ? 'Revente possible' : 'Propriétaire'}
                                </span>
                              );
                              if (sit === 'locataire') return <span className={styles.occupe}>{OCCUPATION[(client as any).statut_occupation] || 'Locataire'}</span>;
                              return <span className={styles.aRenseigner} title="Situation actuelle non renseignée : à compléter dans la fiche">situation ?</span>;
                            })()}
                          </span>
                        </span>
                      </span>

                      <span className={styles.colRech} title={phraseRecherche(client)}>
                        <span className={styles.pastilles} style={clos ? { opacity: 0.68 } : undefined}>
                          <span style={PA_TYPE}><Ico d={D_TYPE} c="#2d5c8f" />{texteType(client.type_bien)}</span>
                          {(() => {
                            /* V3.75 : les chambres dans la même pastille que les pièces
                               (« 4 pièces · 3 ch. », deux minimums) : on peut filtrer
                               dessus, il faut les voir, sans une quatrième pastille. */
                            const p = borne(client.nb_pieces_min, client.nb_pieces_max);
                            const ch = Number((client as { chambres_min?: unknown }).chambres_min) || 0;
                            if (!p && !ch) return null;
                            if (!p) return (
                              <span style={PA_NOMBRE}>
                                <Ico d={D_CHAMBRE} />
                                <span style={PA_FORT}>{ch}</span> {ch > 1 ? 'chambres' : 'chambre'}
                                <span style={PA_FAIBLE}>min</span>
                              </span>
                            );
                            return (
                              <span style={PA_NOMBRE}>
                                <Ico d={D_PIECES} />
                                <span style={PA_FORT}>{p.valeur}</span> pièces
                                {p.note && (!ch || p.note !== 'min') && <span style={PA_FAIBLE}>{p.note}</span>}
                                {ch > 0 && <>{' · '}<span style={PA_FORT}>{ch}</span>{' ch.'}</>}
                              </span>
                            );
                          })()}
                          {(() => {
                            const su = borne(client.surface_min, client.surface_max);
                            return su ? (
                              <span style={PA_NOMBRE}>
                                <Ico d={D_SURFACE} />
                                <span style={PA_FORT}>{su.valeur}</span> m²
                                {su.note && <span style={PA_FAIBLE}>{su.note}</span>}
                              </span>
                            ) : null;
                          })()}
                        </span>
                      </span>

                      <span className={styles.colSect}>
                        {villes.slice(0, 1).map(v => <span key={v} className={styles.ville}>📍 {v}</span>)}
                        {villes.length > 1 && <span className={styles.villePlus}>+{villes.length - 1}</span>}
                        {villes.length === 0 && <span className={styles.villePlus}>—</span>}
                      </span>

                      <span className={styles.colBud}>
                        <span className={styles.budget} style={clos ? { color: '#8593a8' } : undefined}>{budgetCourt(client)}</span>
                      </span>

                      <span className={styles.colSig}>
                        <span className={styles.signal} title={sig.aide} style={{ color: sig.color, background: sig.bg }}>{sig.texte}</span>
                      </span>

                    </div>
                  );
                })}
              </div>
            </div>
              )}
            </div>
          )}
          {/* V3.77 — « Archivés » : un filtre par type, pour retrouver les vendeurs
              archivés (ou les acheteurs, les propriétaires…) sans tout parcourir. */}
          {!avecAcheteurs && !importes && seul === 'archives' && typesArch.length > 1 && (
            <div className={`${dd.pills} ligne-entre`} role="group" aria-label="Filtrer les archivés par type" style={{ margin: '0 0 12px' }}>
              {[{ k: 'tous' as const, lib: 'Tous les archivés', n: archives.length }, ...typesArch].map(t => (
                <button key={t.k} type="button" className={`${dd.pill} ${typeArchVu === t.k ? dd.pillOn : ''}`} aria-pressed={typeArchVu === t.k} onClick={() => setTypeArch(t.k)}>
                  <span>{t.lib}<i style={{ fontStyle: 'normal', marginLeft: 7, color: typeArchVu === t.k ? 'rgba(255,255,255,.75)' : '#94a3b8', fontWeight: 800 }}>{t.n}</i></span>
                </button>
              ))}
            </div>
          )}
          {/* V3.76 — « Tri à faire » : le bloc de Relances, sur place. */}
          {!avecAcheteurs && !importes && seul === 'tri' ? (
            <div className="ligne-entre">
              <PageRelances onNavigate={onNavigate} seulTri cherche={search} onTri={majTri} onArchive={majArchive} onFini={() => setCats(['tous'])} />
            </div>
          ) : !avecAcheteurs && (autres.length ? (
            /* Une autre catégorie : les lignes arrivent l'une après l'autre. */
            <div className={`${cc.liste} cascade`} key={importes ? 'importes' : cats.join('+')}>
              {importes && (
                <div className={cc.cumul}>
                  <span>Importés d’ImmoFacile</span>
                  <b>{`${autres.length} contact${autres.length > 1 ? 's' : ''}`}</b>
                  <button type="button" onClick={() => setImportes(null)}>Tout revoir</button>
                </div>
              )}
              {!importes && cats.length > 1 && (
                <div className={cc.cumul}>
                  <span>{cats.map(k => CATEGORIES.find(x => x.cle === k)?.lib).filter(Boolean).join(' + ')}</span>
                  <b>{`${autres.length} contact${autres.length > 1 ? 's' : ''}`}</b>
                  <button type="button" onClick={() => setCats(['tous'])}>Tout revoir</button>
                </div>
              )}
              <EnteteContacts />
              {autres.map(c => <LigneContact key={c.id} x={c} biens={biensDe(c.id)} derniere={derniere(c)} onOuvrir={() => onNavigate('fiche', c)} onBien={id => onNavigate('biens', { bien: id })}
                selection={{ on: choisis.has(c.id), mode: modeChoix, onBasculer: () => basculerChoix(c.id) }} />)}
            </div>
          ) : (
            importes ? (
              <div className={cc.vide}>
                <b>Les contacts importés ne sont pas dans la liste</b>
                <span style={{ display: 'block' }}>{search ? 'Efface la recherche, juste au-dessus.' : 'Recharge la page pour relire les contacts.'}</span>
                <button type="button" className={styles.btnSecondary} style={{ marginTop: 12 }} onClick={() => setImportes(null)}>Tout revoir</button>
              </div>
            ) : <div className={cc.vide}>
              <b>{search ? 'Personne ne correspond' : seul === 'archives' ? 'Aucun contact archivé' : seul === 'tous' ? 'Aucun contact pour l’instant' : seul && seul !== 'non_filtre' && seul !== 'acheteur' ? `Aucun ${typeDe(seul).lib.toLowerCase()} pour l’instant` : 'Personne dans ces catégories'}</b>
              {search ? 'Essaie un autre mot.' : seul === 'archives' ? 'Un contact archivé reste ici, hors de la liste.' : seul === 'tous' ? 'Clique sur « + Nouveau contact » pour commencer.' : seul && seul !== 'non_filtre' && seul !== 'acheteur' ? `« + Nouveau contact », puis coche « ${typeDe(seul).lib} ».` : 'Allume d’autres tuiles, ou « Tous ».'}
            </div>
          ))}
        </>
      )}


      {/* ═══ La carte de survol — posée au niveau de la page, à côté du curseur ═══ */}
      {survol && (() => {
            const client = ordonne.find(c => c.id === survol.id);
            if (!client) return null;
            const st = stats[client.id];
            const sig = signalDe(client, st);
            const t = TEINTE[client.statut] || TEINTE.actif;
            const det = details[client.id];
            return (
                    <Portail>
                    <div
                      className={styles.fiche}
                      style={{ left: survol.x, top: survol.y }}
                      onMouseEnter={retenir}
                      onMouseLeave={sortir}
                    >
                      <div className={styles.ficheTete}>
                        <AvatarContact c={client as never} teinte={TEINTE[client.statut] || TEINTE.actif} className={styles.ficheAv} libre />
                        <span style={{ flexGrow: 1, minWidth: 0 }}>
                          <span className={styles.ficheNom}>{nomFoyer(client)}</span>
                          <span className={styles.ficheRef}>{client.reference} · suivi depuis {joursDepuis(client.created_at)} j</span>
                        </span>
                        <span className={styles.ficheStatut} style={{ color: t.fg, background: t.bg, border: `1px solid ${t.trait}` }}>
                          {(statutBadge[client.statut]?.label || '').replace(/^[^ ]+ /, '').toUpperCase()}
                        </span>
                      </div>

                      <div className={styles.ficheCorps}>
                        <div className={styles.ficheChiffres}>
                          <span className={styles.chiffre}><b>{st ? st.biens : '·'}</b><i>Proposés</i></span>
                          <span className={styles.chiffre}><b>{st ? st.visites : '·'}</b><i>Visites</i></span>
                          <span className={`${styles.chiffre} ${styles.chiffreOr}`}><b>{st ? st.offres : '·'}</b><i>Offres</i></span>
                        </div>

                        <div className={styles.ficheTrait} />
                        <div className={styles.ficheRub}>Dernier échange</div>
                        <div className={styles.ficheTxt}>
                          {det === undefined ? 'Lecture…'
                            : det.journal
                              ? <>{det.journal.titre} <span style={{ color: '#a3b0c2' }}>· {ilYA(det.journal.date)}</span></>
                              : 'Aucun échange noté pour l\'instant.'}
                        </div>

                        <div className={styles.ficheTrait} />
                        <div className={styles.ficheRub}>Son espace acheteur</div>
                        <div className={styles.ficheTxt}>
                          {(client as any)._espaceOuvertLe
                            ? <><span className={styles.pastilleVerte} />Ouvert {ilYA((client as any)._espaceOuvertLe)}{det && det.espaceOuvertures > 0 ? ` · ${det.espaceOuvertures} passage${det.espaceOuvertures > 1 ? 's' : ''}` : ''}</>
                            : 'Jamais ouvert.'}
                        </div>

                        <div className={styles.ficheTrait} />
                        <div className={styles.ficheDuo}>
                          <span className={styles.ficheCase} style={st?.relance ? { background: sig.bg, borderColor: sig.color + '33' } : undefined}>
                            <i style={st?.relance ? { color: sig.color } : undefined}>Relance</i>
                            <b style={st?.relance ? { color: sig.color } : undefined}>
                              {st?.relance
                                ? (joursJusqua(st.relance.date) <= 0 ? "Aujourd'hui" : `Dans ${joursJusqua(st.relance.date)} j`)
                                : 'Aucune'}
                            </b>
                          </span>
                          <span className={styles.ficheCase}>
                            <i>Mandat</i>
                            <b>{client.mandat_date_expiration
                              ? (joursJusqua(client.mandat_date_expiration) < 0 ? 'Expiré' : `${joursJusqua(client.mandat_date_expiration)} j restants`)
                              : 'Sans mandat'}</b>
                          </span>
                        </div>

                        <div className={styles.ficheTrait} />
                        <div className={styles.ficheActions}>
                          <button className={`${styles.ficheBtn} ${styles.ficheBtnFort}`}
                            onClick={e => { e.stopPropagation(); onNavigate('fiche', client); }}>Ouvrir la fiche</button>
                          {client.emails?.[0] && (
                            <a className={styles.ficheBtn} href={`mailto:${client.emails[0]}`}
                              onClick={e => e.stopPropagation()} title={client.emails[0]}>✉️</a>
                          )}
                          {client.telephones?.[0] && (
                            <a className={styles.ficheBtn} href={`tel:${client.telephones[0].replace(/\s/g, '')}`}
                              onClick={e => e.stopPropagation()} title={client.telephones[0]}>📞</a>
                          )}
                        </div>
                      </div>
                    </div>
                    </Portail>
                  );
      })()}

      {/* La fenêtre « Nouveau contact », bâtie plus haut (fenetreCreation). */}
      {fenetreCreation}

      {/* La barre de la sélection ne cache pas les derniers contacts. */}
      {modeChoix && <div style={{ height: 120 }} aria-hidden="true" />}
      {/* V3.88 — Les contacts cochés : la barre, et ses gestes. */}
      {!lot && !lotMail && (
        <BarreSelection n={coches.length} un="contact sélectionné" plusieurs="contacts sélectionnés" onVider={viderChoix}
          toutes={listeVue.length ? { n: listeVue.length + coches.filter(c => !listeVue.includes(c)).length, onClick: () => setChoisis(l => new Set([...l, ...listeVue.map(c => c.id)])) } : null}
          gestes={[
            { k: 'mail', lib: 'Envoyer un mail', court: 'Mail', ic: 'mail', principal: true, onClick: () => setLotMail(coches) },
            enArchives || coches.every(c => estArchive(c))
              ? { k: 'desarchiver', lib: 'Sortir des archives', court: 'Désarchiver', ic: 'archive', onClick: () => { void preparerLot('desarchiver'); } }
              : { k: 'archiver', lib: 'Archiver', ic: 'archive', titre: 'Ils quittent la liste, retrouvables dans « Archivés » ; leurs relances en attente se ferment', onClick: () => { void preparerLot('archiver'); } },
            { k: 'supprimer', lib: 'Supprimer', ic: 'corbeille', danger: true, onClick: () => { void preparerLot('supprimer'); } },
          ]} />
      )}
      {lotMail && (
        <FenetreMail contacts={lotMail as unknown as ContactMail[]} onFermer={() => setLotMail(null)} onEnvoye={() => { signalerMaj(); }} />
      )}
      {lot && (
        <ConfirmerLot
          danger={lot.quoi === 'supprimer'}
          titre={!lot.verifie ? 'Vérification…'
            : lot.quoi === 'supprimer' ? `Supprimer ${lot.cibles.length > 1 ? `${lot.cibles.length} contacts` : lot.cibles.length ? '1 contact' : 'ces contacts'} ?`
              : lot.quoi === 'archiver' ? `Archiver ${lot.cibles.length > 1 ? `${lot.cibles.length} contacts` : '1 contact'} ?`
                : `Sortir ${lot.cibles.length > 1 ? `${lot.cibles.length} contacts` : '1 contact'} des archives ?`}
          phrase={!lot.verifie ? 'Je regarde ce qui est relié à chacun (biens, documents, ventes).'
            : lot.quoi === 'supprimer' ? 'C’est définitif : leur fiche, leur historique, leurs relances, leurs recherches et leurs biens proposés partent avec eux. Pour les garder sans les voir, archive-les plutôt.'
              : lot.quoi === 'archiver' ? 'Ils quittent la liste et se rangent dans « Archivés », où tu les retrouves quand tu veux. Leurs relances en attente se ferment.'
                : 'Ils reviennent dans la liste des contacts.'}
          liste={lot.cibles.map(c => nomFoyer(c) || 'Sans nom')} ignores={lot.ignores}
          libValider={lot.quoi === 'supprimer' ? `Supprimer définitivement (${lot.cibles.length})` : lot.quoi === 'archiver' ? `Archiver (${lot.cibles.length})` : `Sortir des archives (${lot.cibles.length})`}
          avancement={lot.avancement} onValider={() => { void faireLot(); }} onFermer={() => setLot(null)} />
      )}

      {/* « Importer depuis ImmoFacile » (V3.61). « Voir les contacts importés » :
          la liste ne montre plus qu'eux, « Tout revoir » la rend entière. */}
      {importOuvert && (
        <ImportImmoFacile onFermer={() => setImportOuvert(false)}
          onImporte={() => { signalerMaj(); fetchClients(); }}
          onVoir={ids => { setImportOuvert(false); setImportes(ids); setCats(['tous']); setSearch(''); }} />
      )}
    </div>
  );
}
