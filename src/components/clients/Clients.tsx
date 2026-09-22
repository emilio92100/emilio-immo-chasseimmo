'use client';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase, genererReference, addJournal } from '@/lib/supabase';
import { jetonEspace } from '@/lib/jeton';
import type { Client, StatutClient } from '@/lib/supabase';
import styles from './Clients.module.css';
import {
  BasculeCriteres, classesCrit, CorpsCriteres, CRIT_VIDE, ecrireModeCrit,
  etapesCriteres, FriseCriteres, lireModeCrit,
} from '@/components/shared/CriteresRecherche';
import type { CritForm, ModeCrit } from '@/components/shared/CriteresRecherche';
import { prendreIntentionNouveauClient, signalerMaj, EVT_NOUVEAU_CLIENT } from '@/lib/intentions';

const STATUTS = [
  { key: 'tous',        label: 'Tous',       color: '' },
  { key: 'prospect',    label: 'Prospects',  color: '#8b5cf6' },
  { key: 'actif',       label: 'Actifs',     color: '#10b981' },
  { key: 'suspendu',    label: 'Suspendus',  color: '#f59e0b' },
  { key: 'bien_trouve', label: 'Finalisés',  color: '#3b82f6' },
  { key: 'perdu',       label: 'Perdus',     color: '#ef4444' },
];

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
  adresse_rue: '', adresse_cp: '', adresse_ville: '',
  email1: '', email2: '', tel1: '', tel2: '',
  statut: 'prospect' as StatutClient,
  statut_occupation: '', bien_actuel_type: '', bien_actuel_surface: '',
  bien_actuel_valeur: '', bien_actuel_a_vendre: false, bien_actuel_notes: '',
  bien_actuel_adresse: '', bien_actuel_meme_adresse: true,
  sans_mandat: false,
  mandat_date_signature: '', mandat_duree: '3', mandat_honoraires: '3,5% TTC',
  notes: '',
};

// Carte de section pour le formulaire en étapes
function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fafbfd', border: '1px solid #eef1f6', borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#1a2332', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 14 }}>{titre}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  );
}

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
type TriCle = 'nom' | 'modif' | 'creation' | 'budget';
type Tri = { cle: TriCle; sens: 'asc' | 'desc' };
const TRIS: { cle: TriCle; nom: string; court: string; note: string; sensDefaut: 'asc' | 'desc' }[] = [
  { cle: 'nom',      nom: 'Nom du client',         court: 'Nom',            note: 'de A à Z',                  sensDefaut: 'asc' },
  { cle: 'modif',    nom: 'Dernière modification', court: 'Dernière modif.', note: 'le plus récent en haut',   sensDefaut: 'desc' },
  { cle: 'creation', nom: 'Date de création',      court: 'Création',       note: 'le dernier arrivé en haut', sensDefaut: 'desc' },
  { cle: 'budget',   nom: 'Budget',                court: 'Budget',         note: 'du plus élevé au plus bas', sensDefaut: 'desc' },
];

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
const PA_FORT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13.5, fontWeight: 800, color: '#1a2332' };
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
  const k = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1).replace('.', ',')} M€` : `${Math.round(n / 1000)} k€`;
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
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(initForm);
  const [crit, setCrit] = useState<CritForm>(CRIT_VIDE);
  const [step, setStep] = useState(0);
  /* Les critères se remplissent d'un bloc ou catégorie par catégorie — le
     choix se retient d'un écran à l'autre, comme dans la fiche. */
  const [modeCrit, setModeCrit] = useState<ModeCrit>('tout');
  const [etapeCrit, setEtapeCrit] = useState(0);
  const [sensCrit, setSensCrit] = useState<1 | -1>(1);
  const [adrSug, setAdrSug] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function openModal() {
    setForm(initForm); setCrit(CRIT_VIDE);
    setStep(0); setEtapeCrit(0); setSensCrit(1);
    setError(''); setAdrSug([]); setShowModal(true);
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

    /* Sauf s'il n'y a aucun dossier actif : ouvrir sur un écran vide alors que
       la base est pleine donnerait l'impression que le CRM a tout perdu. */
    if (!replieFiltre.current) {
      replieFiltre.current = true;
      if (merged.length > 0 && !merged.some(c => c.statut === 'actif')) setFiltre('tous');
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
        if (!e || e.dernierContact) return;
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

  const filtered = clients.filter(c => {
    const matchStatut = filtre === 'tous' || c.statut === filtre;
    const q = search.toLowerCase();
    const matchSearch = !search ||
      c.prenom.toLowerCase().includes(q) ||
      c.nom.toLowerCase().includes(q) ||
      c.reference.toLowerCase().includes(q) ||
      (c.emails || []).some(e => e.toLowerCase().includes(q)) ||
      (c.secteurs || []).some(s => s.toLowerCase().includes(q));
    return matchStatut && matchSearch;
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.prenom.trim() && !form.nom.trim()) { setError('Renseignez au moins un prénom ou un nom'); setStep(0); return; }
    setSaving(true); setError('');
    try {
      const reference = await genererReference();
      const emails = [form.email1, form.email2].filter(Boolean);
      const telephones = [form.tel1, form.tel2].filter(Boolean);
      const adresse = [form.adresse_rue, [form.adresse_cp, form.adresse_ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      const ent = (v: string) => (v ? parseInt(v) : null);

      const { data, error: err } = await supabase.from('clients').insert({
        reference, prenom: form.prenom || '', nom: form.nom || '',
        adresse: adresse || null,
        emails, telephones, statut: form.statut,
        statut_occupation: form.statut_occupation || null,
        bien_actuel_a_vendre: form.bien_actuel_a_vendre,
        bien_actuel_type: form.bien_actuel_a_vendre ? (form.bien_actuel_type || null) : null,
        bien_actuel_surface: form.bien_actuel_a_vendre && form.bien_actuel_surface ? parseInt(form.bien_actuel_surface) : null,
        bien_actuel_valeur: form.bien_actuel_a_vendre && form.bien_actuel_valeur ? parseInt(form.bien_actuel_valeur) : null,
        bien_actuel_adresse: form.bien_actuel_a_vendre && !form.bien_actuel_meme_adresse ? (form.bien_actuel_adresse || null) : null,
        bien_actuel_notes: form.bien_actuel_a_vendre ? (form.bien_actuel_notes || null) : null,
        notes: form.notes || null,
        est_vendeur: false,
      }).select().single();

      if (err) throw err;
      if (data) {
        // Créer la 1ère recherche du client avec tous les critères
        /* Exactement les colonnes qu'écrit « Enregistrer » depuis la fiche :
           une recherche créée ici et une recherche modifiée là-bas sont la
           même chose. C'est la raison d'être du formulaire partagé. */
        await supabase.from('recherches').insert({
          client_id: data.id,
          nom: 'Recherche principale',
          /* Le lien court de l'espace acheteur, posé dès la création :
             espace.emilio-immo.com/dupont-k3n8vq2fab (voir src/lib/jeton.ts). */
          token_espace: jetonEspace(form.prenom, form.nom),
          active: form.statut === 'actif',
          type_bien: crit.types_bien.length ? crit.types_bien.join(', ') : null,
          budget_min: ent(crit.budget_min), budget_max: ent(crit.budget_max),
          surface_min: ent(crit.surface_min), surface_max: ent(crit.surface_max),
          nb_pieces_min: ent(crit.nb_pieces_min), nb_pieces_max: ent(crit.nb_pieces_max),
          chambres_min: ent(crit.chambres_min),
          surface_sejour_min: ent(crit.surface_sejour_min),
          secteurs: crit.secteurs,
          transport_minutes: ent(crit.transport_minutes),
          transport_lignes: crit.transport_lignes,
          transport_arrets: crit.transport_arrets,
          etage_min: ent(crit.etage_min), etage_max: ent(crit.etage_max),
          etage_max_sans_ascenseur: ent(crit.etage_max_sans_ascenseur),
          rdc_exclu: crit.rdc_exclu, dernier_etage: crit.dernier_etage,
          dpe_max: crit.dpe_max || null,
          annee_construction_min: ent(crit.annee_min),
          etat_souhaite: crit.etat_souhaite || null,
          exposition_souhaitee: crit.exposition_souhaitee || null,
          cuisine_type: crit.cuisine_type || null,
          exterieur_surface_min: ent(crit.exterieur_surface_min),
          parking: crit.parking, cave: crit.cave, balcon: crit.balcon,
          terrasse: crit.terrasse, jardin: crit.jardin,
          ascenseur: crit.ascenseur, gardien: crit.gardien,
          interphone: crit.interphone, digicode: crit.digicode,
          exigences: crit.exigences,
          urgence: crit.urgence || null,
          financement: crit.financement || null,
          apport: ent(crit.apport),
          sans_mandat: form.sans_mandat,
          mandat_date_signature: form.sans_mandat ? null : (form.mandat_date_signature || null),
          mandat_duree: form.sans_mandat ? null : ent(form.mandat_duree),
          mandat_honoraires: form.sans_mandat ? null : (form.mandat_honoraires || null),
          notes: crit.notes || null,
        });
        await addJournal(data.id, 'creation', 'Dossier créé', `Référence : ${reference}`);
      }
      setShowModal(false);
      setForm(initForm); setCrit(CRIT_VIDE);
      fetchClients(); signalerMaj();
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
      default:
        return sens * (ts(a) - ts(b));
    }
  });

  const nbParStatut = (s: string) => s === 'tous' ? clients.length : clients.filter(c => c.statut === s).length;

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Mes Clients</h1>
          <p className={styles.sub}>{clients.length} clients · {clients.filter(c => c.statut === 'actif').length} actifs · {clients.filter(c => c.statut === 'prospect').length} prospects</p>
        </div>
        <button className={styles.btnPrimary} onClick={openModal}>+ Nouveau client</button>
      </div>

      {/* FILTRES */}
      <div className={styles.filtres}>
        <div className={styles.filtreGroup}>
          {STATUTS.map(s => (
            <button
              key={s.key}
              className={`${styles.filtreBtn} ${filtre === s.key ? styles.filtreBtnActive : ''}`}
              onClick={() => setFiltre(s.key)}
            >
              {s.label}
              <span className={styles.filtreBadge}>{nbParStatut(s.key)}</span>
            </button>
          ))}
        </div>
        <div className={styles.searchBox}>
          <span>🔍</span>
          <input
            type="text"
            placeholder="Nom, email, secteur, référence..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* LISTE */}
      {loading ? (
        <div className={styles.loading}>Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>👥</div>
          <div className={styles.emptyTitle}>{search || filtre !== 'tous' ? 'Aucun client trouvé' : 'Aucun client pour l\'instant'}</div>
          <div className={styles.emptySub}>{!search && filtre === 'tous' && 'Cliquez sur "+ Nouveau client" pour commencer'}</div>
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

          <div className={styles.list} key={`${filtre}:${search}`}>
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
                    <span className={styles.avatar} style={{ background: t.bg, color: t.fg, boxShadow: `inset 0 0 0 2px ${t.trait}` }}>
                      {(client.prenom?.[0] || client.nom?.[0] || '?').toUpperCase()}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className={styles.nom} title={`${client.prenom} ${client.nom}`} style={clos ? { color: '#6b7a90' } : undefined}>{client.prenom} {client.nom}</span>
                      <span className={styles.ref}>
                        {client.reference?.replace('EMI-2026-', 'EMI-') || client.reference}
                        {/* Une couleur seule ne se comprend pas : on la nomme. */}
                        {(client.statut as string) !== 'actif' && (
                          <span className={styles.etiquette} style={{ color: t.fg, background: t.bg, border: `1px solid ${t.trait}` }}>
                            {ETIQUETTE[client.statut] || client.statut}
                          </span>
                        )}
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
                          <span className={styles.ficheNom}>{client.prenom} {client.nom}</span>
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
        const GRANDES = [
          { ico: '👤', nom: 'Le client',    sous: 'Qui il est, comment le joindre' },
          { ico: '🎯', nom: 'Sa recherche', sous: 'Ce qu\'il cherche, et où' },
          { ico: '📋', nom: 'Le mandat',    sous: 'Ce qui vous lie, vos notes' },
        ];
        const etapesCrit = etapesCriteres(crit, setCrit);
        const nbC = etapesCrit.length;
        const iC = Math.min(Math.max(etapeCrit, 0), nbC - 1);
        const surCriteres = step === 1 && modeCrit === 'etapes';
        const nomRempli = !!(form.prenom.trim() || form.nom.trim());

        const allerC = (n: number) => { setSensCrit(n > iC ? 1 : -1); setEtapeCrit(Math.max(0, Math.min(nbC - 1, n))); };
        const changerMode = (m: ModeCrit) => { setModeCrit(m); setEtapeCrit(0); setSensCrit(1); ecrireModeCrit(m); };
        const allerGrande = (n: number) => { setError(''); setEtapeCrit(0); setSensCrit(1); setStep(Math.max(0, Math.min(2, n))); };

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
        const dernierCran = step === 2;

        return (
          <div className={styles.modalOverlay} style={{ animation: 'crmFadeIn 0.2s ease' }}>
            <style>{`
              @keyframes crmFadeIn { from { opacity: 0; } to { opacity: 1; } }
              @keyframes crmPopIn { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
              @keyframes ncEntre { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
              .crm-select { -webkit-appearance: none; -moz-appearance: none; appearance: none; background-color: #fff !important; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23c9a84c' d='M6 8L0 0h12z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 16px center; padding: 11px 38px 11px 14px !important; border-radius: 12px !important; border: 1.5px solid #e3e8f0 !important; font-size: 13.5px !important; font-weight: 600; color: #1a2332; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s; box-shadow: 0 1px 2px rgba(0,0,0,0.03); }
              .crm-select:hover { border-color: #cbd5e1 !important; }
              .crm-select:focus { border-color: #c9a84c !important; background-color: #fff !important; box-shadow: 0 0 0 3px rgba(201,168,76,0.12); outline: none; }

              /* Le rail des trois temps */
              .nc-rail { display: flex; gap: 0; margin-top: 18px; }
              .nc-pas { flex: 1 1 0; min-width: 0; background: none; border: none; padding: 0 0 2px; font-family: inherit; text-align: left; cursor: pointer; }
              .nc-pas:disabled { cursor: default; }
              .nc-barre { height: 4px; border-radius: 4px; background: #e3e8f0; margin-right: 6px; transition: background .3s ease; }
              .nc-pas[data-etat="fait"] .nc-barre { background: #c9a84c; }
              .nc-pas[data-etat="ici"] .nc-barre { background: #1a2332; }
              .nc-lig { display: flex; align-items: baseline; gap: 6px; margin-top: 7px; }
              .nc-lig b { font-size: 11.5px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: .6px; }
              .nc-pas[data-etat="fait"] .nc-lig b { color: #a9822f; }
              .nc-pas[data-etat="ici"] .nc-lig b { color: #1a2332; }
              .nc-lig i { font-style: normal; font-size: 11.5px; color: #b4bfcd; }
              @media (max-width: 720px) { .nc-lig i { display: none; } }

              .nc-corps { animation: ncEntre .26s cubic-bezier(.22,.9,.3,1) both; }

              /* Le statut : cinq cartes plutôt qu'une liste déroulante — on voit
                 ce que chaque état veut dire au lieu de le deviner. */
              .nc-etats { display: grid; grid-template-columns: repeat(auto-fit, minmax(178px, 1fr)); gap: 8px; }
              .nc-etat { display: flex; align-items: flex-start; gap: 9px; padding: 10px 12px; border-radius: 12px; border: 1.5px solid #e3e8f0; background: #fff; cursor: pointer; font-family: inherit; text-align: left; transition: border-color .14s, background .14s, transform .12s; }
              .nc-etat:hover { transform: translateY(-1px); }
              .nc-etat[data-on="true"] { border-color: #1a2332; background: #f8fafc; }
              .nc-etat u { text-decoration: none; width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
              .nc-etat b { display: block; font-size: 13.5px; font-weight: 700; color: #1a2332; }
              .nc-etat span { display: block; font-size: 11.5px; color: #8593a8; margin-top: 1px; line-height: 1.4; }
            `}</style>

            <div className={styles.modal} style={{ maxWidth: 940, width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '93vh', animation: 'crmPopIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)' }}>

              {/* ── En-tête ── */}
              <div style={{ padding: '20px 26px 0', position: 'relative', flexShrink: 0 }}>
                <button onClick={() => setShowModal(false)} style={{ position: 'absolute', top: 16, right: 18, background: '#f1f5f9', border: 'none', borderRadius: 10, width: 32, height: 32, cursor: 'pointer', color: '#64748b', fontSize: 15 }}>✕</button>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', paddingRight: 46 }}>
                  <div style={{ flexGrow: 1, minWidth: 0 }}>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1a2332', letterSpacing: -0.4 }}>
                      {nomRempli ? `${form.prenom} ${form.nom}`.trim() : 'Nouveau client'}
                    </h2>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{GRANDES[step].sous}</div>
                  </div>
                  {step === 1 && <BasculeCriteres mode={modeCrit} onMode={changerMode} />}
                </div>

                <div className="nc-rail">
                  {GRANDES.map((g, i) => (
                    <button key={g.nom} type="button" className="nc-pas"
                      data-etat={i < step ? 'fait' : i === step ? 'ici' : 'avenir'}
                      disabled={i > step && !nomRempli}
                      onClick={() => allerGrande(i)}>
                      <div className="nc-barre" />
                      <div className="nc-lig"><b>{g.ico} {g.nom}</b>{i === step && <i>{i + 1}/3</i>}</div>
                    </button>
                  ))}
                </div>

                {/* La frise porte son propre retrait : on annule celui du bloc. */}
                {surCriteres && <div style={{ margin: '0 -22px' }}><FriseCriteres etapes={etapesCrit} i={iC} onAller={allerC} /></div>}
              </div>

              {/* ── Corps ── */}
              <div style={{ padding: '20px 26px', overflowY: 'auto', flex: 1 }}>
                {error && <div className={styles.errorBox} style={{ marginBottom: 16 }}>{error}</div>}

                <div key={`${step}-${surCriteres ? iC : 'x'}`} className="nc-corps">

                  {/* ═══ 1 · LE CLIENT ═══ */}
                  {step === 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <Bloc titre="👤 Identité">
                        <div className={styles.formRow}>
                          <div className={styles.formGroup}><label className={styles.label}>Prénom</label><input className={styles.input} value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} placeholder="Sophie" autoFocus /></div>
                          <div className={styles.formGroup}><label className={styles.label}>Nom</label><input className={styles.input} value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Martin" /></div>
                        </div>
                        <div className={styles.formGroup} style={{ position: 'relative' }}>
                          <label className={styles.label}>📍 Adresse actuelle</label>
                          <input className={styles.input} value={form.adresse_rue} onChange={e => searchAdresse(e.target.value)} placeholder="12 rue de la Paix…" autoComplete="off" />
                          {adrSug.length > 0 && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'white', border: '1px solid #e3e8f0', borderRadius: 12, marginTop: 4, overflow: 'hidden', boxShadow: '0 10px 30px rgba(15,22,35,.14)' }}>
                              {adrSug.map((f: any, i: number) => (
                                <button type="button" key={i} onClick={() => pickAdresse(f)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 13px', border: 'none', borderBottom: i < adrSug.length - 1 ? '1px solid #f1f5f9' : 'none', background: 'white', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: '#1a2332' }}>
                                  {f.properties?.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className={styles.formRow}>
                          <div className={styles.formGroup}><label className={styles.label}>Code postal</label><input className={styles.input} value={form.adresse_cp} onChange={e => setForm({ ...form, adresse_cp: e.target.value })} placeholder="75002" /></div>
                          <div className={styles.formGroup}><label className={styles.label}>Ville</label><input className={styles.input} value={form.adresse_ville} onChange={e => setForm({ ...form, adresse_ville: e.target.value })} placeholder="Paris" /></div>
                        </div>
                      </Bloc>

                      <Bloc titre="📞 Contact">
                        <div className={styles.formRow}>
                          <div className={styles.formGroup}><label className={styles.label}>✉️ Email principal</label><input className={styles.input} type="email" value={form.email1} onChange={e => setForm({ ...form, email1: e.target.value })} placeholder="sophie@gmail.com" /></div>
                          <div className={styles.formGroup}><label className={styles.label}>✉️ Email secondaire</label><input className={styles.input} type="email" value={form.email2} onChange={e => setForm({ ...form, email2: e.target.value })} placeholder="s.martin@travail.fr" /></div>
                        </div>
                        <div className={styles.formRow}>
                          <div className={styles.formGroup}><label className={styles.label}>📱 Téléphone principal</label><input className={styles.input} value={form.tel1} onChange={e => setForm({ ...form, tel1: e.target.value })} placeholder="06 12 34 56 78" /></div>
                          <div className={styles.formGroup}><label className={styles.label}>☎️ Téléphone secondaire</label><input className={styles.input} value={form.tel2} onChange={e => setForm({ ...form, tel2: e.target.value })} placeholder="01 98 76 54 32" /></div>
                        </div>
                      </Bloc>

                      <Bloc titre="🎚️ Où en est ce dossier">
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
                            ? '🔍 La veille cherchera pour ce client dès la création du dossier.'
                            : '⏸️ Aucune veille tant que le dossier n\'est pas « Actif ». Vous pourrez basculer le statut à tout moment depuis sa fiche.'}
                        </div>
                      </Bloc>

                      <Bloc titre="🏠 Sa situation aujourd'hui">
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Statut d&apos;occupation</label>
                          <select className={`${styles.input} crm-select`} value={form.statut_occupation} onChange={e => setForm({ ...form, statut_occupation: e.target.value })}>
                            <option value="">Non précisé</option>
                            <option value="proprietaire">🔑 Propriétaire</option>
                            <option value="locataire">🏠 Locataire</option>
                            <option value="heberge">👨‍👩‍👧 Hébergé</option>
                            <option value="autre">Autre</option>
                          </select>
                        </div>
                        <button type="button" onClick={() => setForm({ ...form, bien_actuel_a_vendre: !form.bien_actuel_a_vendre })} style={{ ...pill(form.bien_actuel_a_vendre, '#ea580c', '#fff7ed', '#ea580c'), alignSelf: 'flex-start' }}>
                          {form.bien_actuel_a_vendre ? '✓ ' : ''}🏷️ Un bien à vendre en parallèle (mandat potentiel)
                        </button>
                        {form.bien_actuel_a_vendre && (
                          <>
                            <div className={styles.formRow}>
                              <div className={styles.formGroup}><label className={styles.label}>Type de bien</label><input className={styles.input} value={form.bien_actuel_type} onChange={e => setForm({ ...form, bien_actuel_type: e.target.value })} placeholder="Appartement 3P" /></div>
                              <div className={styles.formGroup}><label className={styles.label}>Surface (m²)</label><input className={styles.input} type="number" value={form.bien_actuel_surface} onChange={e => setForm({ ...form, bien_actuel_surface: e.target.value })} placeholder="65" /></div>
                            </div>
                            <div className={styles.formGroup}><label className={styles.label}>Valeur estimée (€)</label><input className={styles.input} type="number" value={form.bien_actuel_valeur} onChange={e => setForm({ ...form, bien_actuel_valeur: e.target.value })} placeholder="450000" /></div>
                            <button type="button" onClick={() => setForm({ ...form, bien_actuel_meme_adresse: !form.bien_actuel_meme_adresse })} style={{ ...pill(form.bien_actuel_meme_adresse, '#0ea5e9', '#f0f9ff', '#0ea5e9'), alignSelf: 'flex-start' }}>
                              {form.bien_actuel_meme_adresse ? '✓ ' : ''}📍 À la même adresse que le contact
                            </button>
                            {!form.bien_actuel_meme_adresse && (
                              <div className={styles.formGroup}><label className={styles.label}>Adresse du bien à vendre</label><input className={styles.input} value={form.bien_actuel_adresse} onChange={e => setForm({ ...form, bien_actuel_adresse: e.target.value })} placeholder="12 rue de la Paix, 75002 Paris" /></div>
                            )}
                            <div className={styles.formGroup}><label className={styles.label}>Précisions</label><textarea className={styles.textarea} value={form.bien_actuel_notes} onChange={e => setForm({ ...form, bien_actuel_notes: e.target.value })} placeholder="État, étage, contexte de vente…" rows={2} /></div>
                          </>
                        )}
                      </Bloc>
                    </div>
                  )}

                  {/* ═══ 2 · SA RECHERCHE ═══ */}
                  {step === 1 && (
                    <div className={modeCrit === 'etapes' ? classesCrit.critCorps : undefined}
                      style={modeCrit === 'tout' ? { display: 'flex', flexDirection: 'column', gap: 14 } : undefined}>
                      <CorpsCriteres etapes={etapesCrit} mode={modeCrit} i={iC} sens={sensCrit} />
                    </div>
                  )}

                  {/* ═══ 3 · LE MANDAT ═══ */}
                  {step === 2 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <Bloc titre="📋 Mandat de recherche">
                        <button type="button" onClick={() => setForm({ ...form, sans_mandat: !form.sans_mandat })} style={{ ...pill(form.sans_mandat, '#3b82f6', '#eff6ff', '#1e40af'), alignSelf: 'flex-start' }}>
                          {form.sans_mandat ? '✓ ' : ''}Recherche sans mandat signé
                        </button>
                        {!form.sans_mandat && (
                          <>
                            <div className={styles.formRow}>
                              <div className={styles.formGroup}><label className={styles.label}>📅 Date de signature</label><input className={styles.input} type="date" value={form.mandat_date_signature} onChange={e => setForm({ ...form, mandat_date_signature: e.target.value })} /></div>
                              <div className={styles.formGroup}><label className={styles.label}>⏳ Durée (mois)</label><input className={styles.input} type="number" value={form.mandat_duree} onChange={e => setForm({ ...form, mandat_duree: e.target.value })} placeholder="3" /></div>
                            </div>
                            <div className={styles.formGroup}><label className={styles.label}>💶 Honoraires convenus</label><input className={styles.input} value={form.mandat_honoraires} onChange={e => setForm({ ...form, mandat_honoraires: e.target.value })} placeholder="3,5% TTC" /></div>
                          </>
                        )}
                      </Bloc>

                      <Bloc titre="🗒️ Notes internes">
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Pour vous seul — le client ne les voit pas</label>
                          <textarea className={styles.textarea} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={4} placeholder="Comment il est arrivé, ce qu'il a dit au téléphone, ce qu'il ne faut pas oublier…" />
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.55 }}>
                          Les notes <b>visibles par le client</b> se remplissent à l&apos;étape « Sa recherche », tout en bas.
                        </div>
                      </Bloc>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Pied ── */}
              <div style={{ padding: '14px 26px', borderTop: '1px solid #f1f5f9', background: '#fbfcfe', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
                <button type="button" className={styles.btnSecondary} onClick={revenir}>
                  {step === 0 ? 'Annuler' : '← Précédent'}
                </button>
                <span style={{ flexGrow: 1 }} />
                {!dernierCran && (
                  <button type="button" className={styles.btnSecondary} disabled={saving || !nomRempli}
                    style={{ opacity: nomRempli ? 1 : 0.45 }}
                    title="Crée le dossier avec ce qui est déjà rempli — le reste se complète depuis la fiche"
                    onClick={handleCreate}>
                    {saving ? '…' : 'Créer maintenant'}
                  </button>
                )}
                {dernierCran ? (
                  <button type="button" className={styles.btnPrimary} disabled={saving} onClick={handleCreate}>
                    {saving ? 'Création…' : '✓ Créer le dossier'}
                  </button>
                ) : (
                  <button type="button" className={styles.btnPrimary} onClick={continuer}>Continuer →</button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
