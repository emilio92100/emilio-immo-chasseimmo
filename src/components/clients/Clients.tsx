'use client';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { signalerEchec } from '@/lib/ecritures';
import { supabase, genererReference, addJournal } from '@/lib/supabase';
import { jetonEspace } from '@/lib/jeton';
import type { Client, StatutClient } from '@/lib/supabase';
import styles from './Clients.module.css';
import AvatarContact from '@/components/contacts/AvatarContact';
import { nomFoyer } from '@/lib/foyer';
import EnteteRubrique, { PictoClients } from '@/components/shared/EnteteRubrique';
import {
  BasculeCriteres, classesCrit, CorpsCriteres, CRIT_VIDE, ecrireModeCrit,
  etapesCriteres, FriseCriteres, lireModeCrit,
} from '@/components/shared/CriteresRecherche';
import type { CritForm, ModeCrit } from '@/components/shared/CriteresRecherche';
import { intentions, prendreIntentionNouveauClient, signalerMaj, EVT_NOUVEAU_CLIENT, demanderNouveauBien, annoncerVue, vueDemandee } from '@/lib/intentions';
import {
  TYPES_CONTACT, colonneContactAbsente, estAcheteur, estArchive, estPro, lirePro, sansCriteres, typeDe, typesDe,
  type InfosPro, type TypeContact,
} from '@/lib/contacts';
import { ChampsPro, ChoixTypes, EnteteContacts, LigneContact, Puce, type BienDuContact } from '@/components/contacts/ChampsContact';
import ChoixSource from '@/components/contacts/ChoixSource';
import { Ic } from '@/components/documents/ApercuActe';
import { colonneSourceAbsente, libelleSource, sourceDe } from '@/lib/sources';
import cc from '@/components/contacts/Contacts.module.css';

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
type Categorie = 'tous' | 'acheteur' | 'non_filtre' | Exclude<TypeContact, 'acheteur'> | 'archives';
/* Les pastilles des tuiles, sur le bandeau bleu : les couleurs des types,
   éclaircies pour qu'on les voie (le bleu d'un notaire disparaissait). */
const TEINTE_BANDEAU: Record<TypeContact, string> = {
  acheteur: '#34d399', vendeur: '#e0c57a', proprietaire: '#fb923c', notaire: '#a9bce0',
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
const IC_PRO: Record<string, string> = { 'Son agence': 'agence', 'Son étude': 'balance', 'L’immeuble': 'immeuble', 'Son activité': 'outil' };

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
  if (c.bien_actuel_a_vendre) return 'vendeur';
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
  padding: '4px 10px 4px 8px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
};
const PA_TYPE: React.CSSProperties = { ...PA_BASE, background: '#eef4fb', border: '1px solid #dbe7f6', color: '#2d5c8f' };
const PA_NOMBRE: React.CSSProperties = { ...PA_BASE, background: '#f8fafc', border: '1px solid #eef2f7', color: '#45566e' };
const PA_FORT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13.5, fontWeight: 800, color: 'var(--emilio)' };
const PA_FAIBLE: React.CSSProperties = { fontSize: 11, color: '#a3b0c2', fontWeight: 600 };

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
export default function Clients({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  /* Ce que la liste ne savait pas dire : combien de biens, de visites, d'offres,
     et quelle relance attend. Chargé en trois lectures, une fois, au démarrage. */
  const [stats, setStats] = useState<Record<string, StatDossier>>({});

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
  const [cats, setCats] = useState<Categorie[]>(() => {
    const v = (vueDemandee('clients') || '').split('+')
      .filter((k): k is Categorie => k === 'archives' || CATEGORIES.some(x => x.cle === k));
    return v.length ? v : ['tous'];
  });
  useEffect(() => { annoncerVue('clients', cats.join('+')); }, [cats]);
  const choisirCat = (k: Categorie) => setCats(l => {
    if (k === 'tous' || k === 'archives') return [k];
    /* « Acheteurs non filtrés » est une partie des acheteurs : l'un remplace
       l'autre, sinon le second clic ne changerait rien. */
    const base = l.filter(x => x !== 'tous' && x !== 'archives' && !(k === 'acheteur' && x === 'non_filtre') && !(k === 'non_filtre' && x === 'acheteur'));
    const n = base.includes(k) ? base.filter(x => x !== k) : [...base, k];
    return n.length ? n : ['tous'];
  });
  /* Les biens de la rubrique Biens, pour les cartes des vendeurs. */
  const [biensV, setBiensV] = useState<BienDuContact[]>([]);
  /* Le second filtre, croisé avec le premier : « Actifs » + « Propriétaires ». */
  const [filtreSit, setFiltreSit] = useState('toutes');
  const [search, setSearch] = useState('');
  /* Venue du « + » ou de « Nouveau contact » : la fenêtre est ouverte dès
     le premier affichage, sans montrer la liste une fraction de seconde. */
  const [showModal, setShowModal] = useState(() => intentions.nouveauClient);
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

  function openModal() {
    setForm(initForm); setCrit(CRIT_VIDE);
    setStep(0); setEtapeCrit(0); setSensCrit(1);
    setError(''); setAdrSug([]); setAutresCoord(false); setShowModal(true);
  }

  useEffect(() => { setModeCrit(lireModeCrit()); }, []);

  /* « + Nouveau client » de la barre du haut : il ramenait seulement sur cette
     page. Il ouvre maintenant le formulaire — qu'on arrive d'ailleurs (le
     drapeau) ou qu'on soit déjà ici (l'événement). */
  useEffect(() => {
    if (prendreIntentionNouveauClient()) openModal();
    const ouvrir = () => openModal();
    window.addEventListener(EVT_NOUVEAU_CLIENT, ouvrir);
    return () => window.removeEventListener(EVT_NOUVEAU_CLIENT, ouvrir);
  }, []);

  // Autocomplétion d'adresse via l'API officielle adresse.data.gouv.fr
  async function searchAdresse(q: string) {
    setForm(f => ({ ...f, adresse_rue: q }));
    if (q.trim().length < 4) { setAdrSug([]); return; }
    try {
      const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5&type=housenumber`);
      const data = await res.json();
      setAdrSug(data.features || []);
    } catch { setAdrSug([]); }
  }
  function pickAdresse(feat: any) {
    const p = feat.properties;
    setForm(f => ({ ...f, adresse_rue: p.name || p.label, adresse_cp: p.postcode || '', adresse_ville: p.city || '' }));
    setAdrSug([]);
  }

  useEffect(() => { fetchClients(); }, []);

  async function fetchClients() {
    setLoading(true);
    const { data: cl } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    const clientsList = cl || [];

    // V3 : la source de vérité des critères est la table `recherches`, plus `clients.*`.
    // On fusionne sur chaque client les critères de sa recherche d'affichage
    // (active en priorité, sinon la première) pour alimenter les badges du récap.
    const ids = clientsList.map(c => c.id);
    let recherches: any[] = [];
    if (ids.length) {
      const { data: rs } = await supabase
        .from('recherches')
        .select('*')
        .in('client_id', ids)
        .order('created_at', { ascending: true });
      recherches = rs || [];
    }

    const CRIT_FIELDS = ['type_bien', 'budget_min', 'budget_max', 'surface_min', 'surface_max', 'nb_pieces_min', 'nb_pieces_max', 'dpe_max', 'secteurs', 'parking', 'balcon', 'terrasse', 'jardin', 'cave', 'ascenseur'];

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
       jamais calculés. Trois lectures légères suffisent. */
    if (ids.length) {
      const [bi, vi, re, jo] = await Promise.all([
        supabase.from('biens').select('client_id, etape, badge_retour').in('client_id', ids),
        supabase.from('visites').select('client_id').in('client_id', ids),
        supabase.from('relances').select('client_id, date_echeance, note')
          .in('client_id', ids).eq('statut', 'en_attente').order('date_echeance', { ascending: true }),
        supabase.from('journal').select('client_id, created_at, type, titre')
          .in('client_id', ids).order('created_at', { ascending: false }),
      ]);
      const s: Record<string, StatDossier> = {};
      ids.forEach(id => { s[id] = { biens: 0, visites: 0, offres: 0 }; });
      (bi.data || []).forEach((b: any) => {
        const e = s[b.client_id]; if (!e) return;
        if (b.etape === 'presente') e.biens++;
        if (b.badge_retour === 'offre_faite') e.offres++;
      });
      (vi.data || []).forEach((v: any) => { const e = s[v.client_id]; if (e) e.visites++; });
      (re.data || []).forEach((r: any) => { const e = s[r.client_id]; if (e && !e.relance) e.relance = { date: r.date_echeance, note: r.note }; });
      (jo.data || []).forEach((j: any) => {
        const e = s[j.client_id];
        /* Le mail « Où en est votre recherche ? » part tout seul : ce n'est pas
           un geste sur le dossier, il ne doit pas masquer « Rien depuis… ». */
        if (!e || e.dernierContact || j.type === 'point_auto') return;
        e.dernierContact = j.created_at;
        e.dernierTitre = j.titre || '';
        e.dernierCote = venantDuClient(j.type, j.titre) ? 'client' : 'moi';
      });
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
  const nbCat = (k: Categorie) => k === 'tous' ? visibles.length
    : k === 'archives' ? clients.filter(c => estArchive(c)).length
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
    : k === 'acheteur' ? estAcheteur(c)
      : k === 'non_filtre' ? estAcheteur(c) && sansCriteres(c)
        : typesDe(c).includes(k as TypeContact));
  const autres = (avecAcheteurs ? [] : cats.includes('archives') ? clients.filter(c => estArchive(c)) : visibles.filter(dansCats)).filter(trouve)
    .sort((a, b) => String(derniere(b) || '').localeCompare(String(derniere(a) || '')));
  const seul = cats.length === 1 ? cats[0] : null;
  const biensDe = (id: string) => biensV.filter(b => b.client_id === id);

  const filtered = clients.filter(c => {
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
  /* Les compteurs du second filtre suivent le premier : « 3 propriétaires »
     parmi les actifs, pas dans toute la base. */
  const nbParSituation = (k: string) => clients
    .filter(c => estAcheteur(c) && !estArchive(c) && (!seulsNonFiltres || sansCriteres(c)))
    .filter(c => filtre === 'tous' || c.statut === filtre)
    .filter(c => { const s = situationDe(c); return k === 'toutes' || (k === 'proprietaire' ? (s === 'proprietaire' || s === 'vendeur') : s === k); })
    .length;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.types.length) { setError('Choisissez qui est ce contact : acheteur, vendeur, notaire…'); setStep(0); return; }
    if (!form.prenom.trim() && !form.nom.trim()) { setError('Renseignez au moins un prénom ou un nom'); setStep(1); return; }
    const acheteur = form.types.includes('acheteur');
    setSaving(true); setError('');
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
      const pro = Object.fromEntries(Object.entries(form.pro).filter(([, v]) => typeof v === 'string' && v.trim()));
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
          type_bien: cr.types_bien.length ? cr.types_bien.join(', ') : null,
          budget_min: ent(cr.budget_min), budget_max: ent(cr.budget_max),
          surface_min: ent(cr.surface_min), surface_max: ent(cr.surface_max),
          nb_pieces_min: ent(cr.nb_pieces_min), nb_pieces_max: ent(cr.nb_pieces_max),
          chambres_min: ent(cr.chambres_min),
          surface_sejour_min: ent(cr.surface_sejour_min),
          secteurs: cr.secteurs,
          transport_minutes: ent(cr.transport_minutes),
          transport_lignes: cr.transport_lignes,
          transport_arrets: cr.transport_arrets,
          etage_min: ent(cr.etage_min), etage_max: ent(cr.etage_max),
          etage_max_sans_ascenseur: ent(cr.etage_max_sans_ascenseur),
          rdc_exclu: cr.rdc_exclu, dernier_etage: cr.dernier_etage,
          dpe_max: cr.dpe_max || null,
          annee_construction_min: ent(cr.annee_min),
          etat_souhaite: cr.etat_souhaite || null,
          exposition_souhaitee: cr.exposition_souhaitee || null,
          cuisine_type: cr.cuisine_type || null,
          exterieur_surface_min: ent(cr.exterieur_surface_min),
          parking: cr.parking, cave: cr.cave, balcon: cr.balcon,
          terrasse: cr.terrasse, jardin: cr.jardin,
          ascenseur: cr.ascenseur, gardien: cr.gardien,
          interphone: cr.interphone, digicode: cr.digicode,
          exigences: cr.exigences,
          urgence: cr.urgence || null,
          financement: cr.financement || null,
          apport: ent(cr.apport),
          sans_mandat: form.sans_mandat,
          mandat_date_signature: form.sans_mandat ? null : (form.mandat_date_signature || null),
          mandat_duree: form.sans_mandat ? null : ent(form.mandat_duree),
          mandat_honoraires: form.sans_mandat ? null : (form.mandat_honoraires || null),
          notes: cr.notes || null,
        });
        if (eRech) signalerEchec('Le contact est créé, mais sa recherche', `${eRech.message}. Ouvre sa fiche et enregistre ses critères : la recherche se crée alors.`);
        await addJournal(data.id, 'creation', 'Dossier créé', `Référence : ${reference}${libSrc ? ` · source : ${libSrc}` : ''}`);
      }
      setShowModal(false);
      const versBien = !!data && !acheteur && form.creerBien && (form.types.includes('vendeur') || form.types.includes('proprietaire'));
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
  const nbParStatut = (s: string) => s === 'tous' ? acheteursCat.length : acheteursCat.filter(c => c.statut === s).length;

  return (
    <div className={styles.page}>
      {/* L'EN-TÊTE — le titre et les statuts dans un seul bloc. La ligne grise
          « 8 clients · 5 actifs · 2 prospects » a disparu : les mêmes chiffres
          sont dans les tuiles, en grand, et cliquer dessus filtre la liste. */}
      <EnteteRubrique titre="Mes contacts" icone={PictoClients}
        recherche={{ valeur: search, onChange: setSearch, placeholder: 'Nom, e-mail, agence, secteur, référence…', label: 'Chercher un contact' }}
        bouton={{ lib: 'Nouveau contact', onClick: openModal }}
        phrase="Clique plusieurs types pour les voir ensemble."
        label="Filtrer par type de contact" actif={cats} onChoisir={k => choisirCat(k as Categorie)}
        tuiles={[...CATEGORIES, ...(nbCat('archives') ? [{ cle: 'archives' as Categorie, lib: 'Archivés', couleur: '#cbd5e1' }] : [])]
          /* Pas de tuile « 0 » : « Tous » toujours, les autres dès qu'il y a
             quelqu'un dedans — ou si elle est allumée (« Mes propriétaires »
             depuis le menu, alors qu'il n'y en a pas encore). */
          .filter(x => x.cle === 'tous' || nbCat(x.cle) > 0 || cats.includes(x.cle))
          .map(x => ({ cle: x.cle, lib: x.lib, n: nbCat(x.cle), couleur: x.couleur,
            ...(x.cle === 'tous' ? { tete: true, ic: <Ic n="groupe" t={14} e={2.1} /> } : {}) }))} />

      {/* LE DOSSIER DES ACHETEURS — leur statut, puis leur situation */}
      {avecAcheteurs && <div className={styles.situations}>
        <span className={styles.situationsTitre}>Dossier</span>
        {STATUTS.map(s => {
          const actif = filtre === s.key;
          return (
            <button key={s.key} type="button" className={`${styles.sitBtn} ${actif ? styles.sitBtnActif : ''}`} onClick={() => setFiltre(s.key)}>
              {s.color && <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />}
              <span>{s.label}</span>
              <span className={styles.sitBadge}>{nbParStatut(s.key)}</span>
            </button>
          );
        })}
      </div>}
      {avecAcheteurs && <div className={styles.situations}>
        <span className={styles.situationsTitre}>Son logement</span>
        {SITUATIONS.map(s => {
          const actif = filtreSit === s.key;
          return (
            <button key={s.key} type="button"
              className={`${styles.sitBtn} ${actif ? styles.sitBtnActif : ''} ${s.key === 'proprietaire' || s.key === 'vendeur' ? styles.sitBtnOr : ''}`}
              onClick={() => setFiltreSit(actif && s.key !== 'toutes' ? 'toutes' : s.key)}>
              {(s.key === 'proprietaire' || s.key === 'vendeur') && <Ico t={12} d={D_CLE} c={actif ? '#1a2332' : '#9a7d2e'} />}
              <span>{s.label}</span>
              <span className={styles.sitBadge}>{nbParSituation(s.key)}</span>
            </button>
          );
        })}
      </div>}

      {/* LISTE — les acheteurs dans leur tableau détaillé ; « Tous » et les
          autres types, une ligne par contact. */}
      {loading ? (
        <div className={styles.loading}>Chargement...</div>
      ) : (
        <>
          {avecAcheteurs && (
            <div className={cc.section}>
              {filtered.length === 0 ? (
                <div className={styles.empty}>
                  <div className={styles.emptyIcon}>👥</div>
                  <div className={styles.emptyTitle}>{search || filtre !== 'tous' || filtreSit !== 'toutes' || seulsNonFiltres ? 'Aucun acheteur ici' : 'Aucun acheteur pour l\'instant'}</div>
                  <div className={styles.emptySub}>{seulsNonFiltres ? 'Tous tes acheteurs ont leurs critères.' : filtre !== 'tous' ? 'Change de statut, juste au-dessus.' : 'Clique sur « + Nouveau contact » pour commencer.'}</div>
                </div>
              ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Les en-têtes : posés sur le fond, pas dans une barre — ils cadrent
                  l'œil sans transformer la page en tableur. */}
              <div className={styles.entete}>
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

              <div className={styles.list} key={`${filtre}:${filtreSit}:${search}`}>
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
                      className={`${styles.ligne} ligne-entre ${ouvert ? styles.ligneOuverte : ''}`}
                      style={{ animationDelay: `${Math.min(rang, 9) * 28}ms`, ...(clos ? { background: '#fbfcfe' } : {}) }}
                      onClick={() => onNavigate('fiche', client)}
                      onMouseEnter={e => entrer(client.id, e)}
                      onMouseMove={bouger}
                      onMouseLeave={sortir}
                    >
                      <span className={styles.colClient}>
                        {/* Un petit personnage plutôt qu'une initiale (deux pour un couple). */}
                        <AvatarContact c={client as never} teinte={t} className={styles.avatar} />
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
                            const p = borne(client.nb_pieces_min, client.nb_pieces_max);
                            return p ? (
                              <span style={PA_NOMBRE}>
                                <Ico d={D_PIECES} />
                                <span style={PA_FORT}>{p.valeur}</span> pièces
                                {p.note && <span style={PA_FAIBLE}>{p.note}</span>}
                              </span>
                            ) : null;
                          })()}
                          {(() => {
                            const su = borne(client.surface_min, client.surface_max);
                            if (su) return (
                              <span style={PA_NOMBRE}>
                                <Ico d={D_SURFACE} />
                                <span style={PA_FORT}>{su.valeur}</span> m²
                                {su.note && <span style={PA_FAIBLE}>{su.note}</span>}
                              </span>
                            );
                            /* Pas de surface demandée : les chambres disent au moins
                               quelque chose du logement cherché. */
                            return (client as any).chambres_min ? (
                              <span style={PA_NOMBRE}>
                                <Ico d={D_CHAMBRE} />
                                <span style={PA_FORT}>{(client as any).chambres_min}</span> chambres
                                <span style={PA_FAIBLE}>min</span>
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
          {!avecAcheteurs && (autres.length ? (
            <div className={cc.liste}>
              {cats.length > 1 && (
                <div className={cc.cumul}>
                  <span>{cats.map(k => CATEGORIES.find(x => x.cle === k)?.lib).filter(Boolean).join(' + ')}</span>
                  <b>{`${autres.length} contact${autres.length > 1 ? 's' : ''}`}</b>
                  <button type="button" onClick={() => setCats(['tous'])}>Tout revoir</button>
                </div>
              )}
              <EnteteContacts />
              {autres.map(c => <LigneContact key={c.id} x={c} biens={biensDe(c.id)} derniere={derniere(c)} onOuvrir={() => onNavigate('fiche', c)} onBien={id => onNavigate('biens', { bien: id })} />)}
            </div>
          ) : (
            <div className={cc.vide}>
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
                        <span className={styles.ficheAv}>{(client.prenom?.[0] || client.nom?.[0] || '?').toUpperCase()}</span>
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

      {/* ═══ NOUVEAU CLIENT ═══════════════════════════════════════════════
          Trois temps : qui est ce client, ce qu'il cherche, ce qui nous lie.
          Le deuxième reprend, à l'identique, le formulaire de critères de la
          fiche — il n'y a plus deux versions à tenir à jour. */}
      {showModal && (() => {
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
                              : form.types.includes('vendeur') || form.types.includes('proprietaire') ? 'Vendeur ou propriétaire : après ses coordonnées, « Nouveau bien » s’ouvre, lui déjà propriétaire.'
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
      })()}
    </div>
  );
}
