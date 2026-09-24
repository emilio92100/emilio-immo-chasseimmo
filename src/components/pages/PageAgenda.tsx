'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ModaleRappelVisite, libelleRappel, envoyerMailVisites } from '@/components/shared/RappelVisite';
import { nommerRecherche, resumerRecherche } from '@/lib/espace';
import { prendreDemandeRendezVous } from '@/lib/intentions';
import { supabase, addJournal } from '@/lib/supabase';

/**
 * L'agenda du CRM (maquette A : petit calendrier à gauche, semaine au centre).
 *
 * Il ne crée pas une deuxième vérité : il LIT ce qui existe déjà.
 *   - les visites viennent de la table `visites` — la même que la page
 *     Visites, la fiche client et l'espace du client. Une visite créée ici y
 *     apparaît partout ; une visite planifiée depuis une fiche apparaît ici ;
 *   - les autres rendez-vous (client, appel, signature, estimation, perso)
 *     vivent dans `rendez_vous` (voir agenda-rendez-vous.sql) ;
 *   - la bande « À faire » montre ce que le CRM sait déjà : relances dues,
 *     offre / compromis / acte, fin du délai SRU, fin de mandat.
 *
 * « Me le rappeler » pose une relance (page Relances) la veille ou le jour
 * même. « Prévenir le client » part par /api/send-mail, en mail simple.
 */

const NAVY = '#1a2332', OR = '#c9a84c', OR_FONCE = '#8a6a1f', BORD = '#e3e8f0', LIGNE = '#eef1f6';
const DOUX = '#5b6678', PALE = '#8d99ab', FOND = '#f4f6fa', AUJ_FOND = '#fcfaf3', CHOISI = '#eef1f7';
const JAK = "'Plus Jakarta Sans', system-ui, sans-serif";

type TypeRdv = 'visite' | 'client' | 'appel' | 'signature' | 'estimation' | 'perso';
const TYPES: Record<TypeRdv, { nom: string; fond: string; trait: string; encre: string; point: string; ico: string }> = {
  visite: { nom: 'Visite', fond: '#fbf4e1', trait: '#ecdcae', encre: '#5f450c', point: '#c9a84c', ico: 'maison' },
  client: { nom: 'Rendez-vous client', fond: '#e9edf5', trait: '#cdd5e4', encre: '#1a2332', point: '#1a2332', ico: 'personne' },
  appel: { nom: 'Appel · visio', fond: '#eaf1fe', trait: '#c8d9fb', encre: '#1e3a8a', point: '#2563eb', ico: 'visio' },
  signature: { nom: 'Signature', fond: '#e5f4ec', trait: '#bfe3cf', encre: '#0b5e41', point: '#0f8a5f', ico: 'stylo' },
  estimation: { nom: 'Estimation', fond: '#f1ecfb', trait: '#dccff6', encre: '#4c1d95', point: '#7c3aed', ico: 'estimer' },
  perso: { nom: 'Personnel', fond: '#f2f4f7', trait: '#dfe4eb', encre: '#475569', point: '#94a3b8', ico: 'lune' },
};
const ORDRE: TypeRdv[] = ['visite', 'client', 'appel', 'signature', 'estimation', 'perso'];
const FAIT = { fond: '#f5f6f9', trait: '#e6e9ef', encre: '#7d899b' };
/* Une visite passée dont le compte rendu n'est pas fait reste visible, en
   ambre : c'est une chose à faire, pas une chose finie. */
const A_FAIRE = { fond: '#fff1d9', trait: '#efc178', encre: '#8a4b0f' };
function teinte(e: Ev) { return e.crAFaire ? A_FAIRE : e.fait ? FAIT : TYPES[e.type]; }

type Genre = 'relance' | 'signature' | 'mandat' | 'visite';
const TACHES: Record<Genre, { fond: string; encre: string; trait: string }> = {
  relance: { fond: '#fff6e3', encre: '#8a4b0f', trait: '#f3dcae' },
  signature: { fond: '#e5f4ec', encre: '#0b5e41', trait: '#bfe3cf' },
  mandat: { fond: '#e9edf5', encre: '#1a2332', trait: '#cdd5e4' },
  visite: { fond: '#fbf4e1', encre: '#5f450c', trait: '#ecdcae' },
};

/* La grille horaire : de 7 h à 22 h. On arrive défilé sur 9 h 30. */
const H0 = 7, H1 = 22, PX = 48;

/* ══ Icônes (dessinées, pas d'émoji) ═══════════════════════════ */
const TR: Record<string, string[]> = {
  plus: ['M12 5v14', 'M5 12h14'],
  chevG: ['m15 6-6 6 6 6'],
  chevD: ['m9 6 6 6-6 6'],
  chevB: ['m6 9.5 6 6 6-6'],
  horloge: ['c:12,12,9', 'M12 7.5V12l3 2'],
  personne: ['c:12,8,4', 'M4.5 20a7.5 7.5 0 0 1 15 0'],
  lieu: ['M12 21.5S19 15 19 10a7 7 0 1 0-14 0c0 5 7 11.5 7 11.5z', 'c:12,10,2.6'],
  tel: ['M5.2 3.5h3.2l1.6 4.2-2.1 1.3a12.6 12.6 0 0 0 7.1 7.1l1.3-2.1 4.2 1.6v3.2a1.9 1.9 0 0 1-2.1 1.9A17 17 0 0 1 3.3 5.6a1.9 1.9 0 0 1 1.9-2.1z'],
  coche: ['m4 12.5 5 5L20 6.5'],
  fermer: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  route: ['M5 19.5 12 4l7 15.5-7-4z'],
  crayon: ['M12.5 20H21', 'M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6 3.4 19.8l1.2-4z'],
  dossier: ['M3 6.6a2 2 0 0 1 2-2h4.2l2.2 2.6H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  cloche: ['M6.2 16.8V11a5.8 5.8 0 0 1 11.6 0v5.8l1.7 2H4.5z', 'M10 21.2h4'],
  maison: ['M3 21h18', 'M5 21V9.5L12 4l7 5.5V21', 'M10 21v-6h4v6'],
  mail: ['M3 7.2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'm3.6 7.6 8.4 5.8 8.4-5.8'],
  calendrier: ['M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  note: ['M6 3.5h9l4 4v13H6z', 'M14.5 3.5v4.5H19', 'M9 12.5h6', 'M9 16h4'],
  corbeille: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12', 'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'],
  visio: ['M3.5 7.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z', 'm15.5 10.5 5-3v9l-5-3'],
  stylo: ['M4 20l4-1 11-11-3-3L5 16z', 'M14 7l3 3'],
  estimer: ['M4 20V10l8-6 8 6v10', 'M9 20v-5h6v5', 'M15 3.5h4v4'],
  lune: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  alerte: ['M12 9v4.2', 'M12 17.2h.01', 'M10.3 3.9 2.4 17.6A1.9 1.9 0 0 0 4 20.5h16a1.9 1.9 0 0 0 1.6-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0z'],
};

function Ic({ n, t = 16, ep = 2 }: { n: string; t?: number; ep?: number }) {
  const traits = TR[n];
  if (!traits) return null;
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ep}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      {traits.map((d, i) => {
        if (d.startsWith('c:')) { const [cx, cy, r] = d.slice(2).split(',').map(Number); return <circle key={i} cx={cx} cy={cy} r={r} />; }
        return <path key={i} d={d} />;
      })}
    </svg>
  );
}

/* ══ Dates ═════════════════════════════════════════════════════ */
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const LETTRES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const pad = (n: number) => (n < 10 ? '0' : '') + n;
const cleDe = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const depuisCle = (k: string) => { const [y, m, j] = k.split('-').map(Number); return new Date(y, (m || 1) - 1, j || 1); };
const plusJours = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const lundiDe = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const maj = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const numJour = (d: Date) => (d.getDate() === 1 ? '1er' : String(d.getDate()));
const jourLong = (d: Date) => `${JOURS[d.getDay()]} ${numJour(d)} ${MOIS[d.getMonth()]}`;
const heureFr = (d: Date) => `${d.getHours()} h ${pad(d.getMinutes())}`.replace(' h 00', ' h');
/* « 2 jours et 1 h » pour un rendez-vous sur plusieurs jours. */
const dureeLongue = (m: number) => {
  if (m < 1440) return duree(m);
  const j = Math.floor(m / 1440), r = m % 1440;
  return `${j} jour${j > 1 ? 's' : ''}${r ? ` et ${duree(r)}` : ''}`;
};
const duree = (m: number) => { const h = Math.floor(m / 60), n = m % 60; return h ? `${h} h${n ? ' ' + pad(n) : ''}` : `${n} min`; };
const nomDe = (c: any) => (c ? `${c.prenom || ''} ${c.nom || ''}`.trim() : '');
const pl = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const rdv = (n: number) => `${n} rendez-vous`;

/* ══ Ce que l'agenda affiche ═══════════════════════════════════ */
type Ev = {
  cle: string; source: 'visite' | 'rdv'; ids: string[]; type: TypeRdv; titre: string;
  debut: Date; fin: Date; jour: string; qui: string; lieu: string; contact: string; notes: string;
  biens: { id: string; titre: string; photo?: string }[];
  clientId: string | null; rechercheId: string | null;
  fait: boolean; crAFaire: boolean; details: any; relanceId: string | null;
  /* Rendez-vous sur plusieurs jours, découpé jour par jour pour l'affichage :
     `suite` quand ce morceau ne commence pas le premier jour, `finReelle`
     pour dire jusqu'à quand il dure. */
  suite?: boolean; finReelle?: Date;
};
type Tache = { cle: string; jour: string; titre: string; genre: Genre; clientId: string | null };
type Dossier = {
  rechercheId: string; clientId: string; nom: string; prenom: string; emails: string[]; libelle: string;
  /* Pour le choix du client : le nom de la recherche, son résumé, et sa
     date (les plus récentes d'abord quand on n'a rien tapé). */
  recherche: string; resume: string; plusieurs: boolean; cree: string;
};

function lieuDuBien(b: any): string {
  return b?.adresse || b?.adresse_probable || [b?.quartier, b?.ville].filter(Boolean).join(', ') || '';
}

/* ══ Les rendez-vous sur plusieurs jours ═════════════════════════
   Un salon, des congés, une visite longue : il apparaît sur chacun de ses
   jours. Le premier depuis son heure, les suivants depuis le matin
   (« suite »), le dernier jusqu'à son heure. */
function dernierJour(e: Ev): string { return cleDe(new Date(Math.max(e.debut.getTime(), e.fin.getTime() - 1))); }
function couvre(e: Ev, k: string): boolean { return k >= e.jour && k <= dernierJour(e); }
function joursCouverts(e: Ev): string[] {
  const fin = dernierJour(e), l: string[] = [];
  for (let d = depuisCle(e.jour), i = 0; i < 62; i++, d = plusJours(d, 1)) { const k = cleDe(d); l.push(k); if (k >= fin) break; }
  return l;
}
function duJour(evs: Ev[], k: string): Ev[] {
  const out: Ev[] = [];
  for (const e of evs) {
    if (!couvre(e, k)) continue;
    if (dernierJour(e) === e.jour) { out.push(e); continue; }
    const d = depuisCle(k);
    const debut = k === e.jour ? e.debut : new Date(d.getFullYear(), d.getMonth(), d.getDate(), H0, 0);
    const finJ = k === dernierJour(e) ? e.fin : new Date(d.getFullYear(), d.getMonth(), d.getDate(), H1, 0);
    out.push({ ...e, debut, fin: finJ > debut ? finJ : new Date(debut.getTime() + 30 * 60000), jour: k, suite: k !== e.jour, finReelle: e.fin });
  }
  return out.sort((a, b) => a.debut.getTime() - b.debut.getTime());
}

function construire(visites: any[], rdvs: any[], relances: any[], transactions: any[], recherches: any[], clientsParId: Record<string, any>, maintenant: Date) {
  const evs: Ev[] = [];
  const taches: Tache[] = [];

  /* Une ligne de visite par bien : on les regroupe par client, jour et heure
     pour n'avoir qu'un bloc « 3 visites · Julien Marchand ». */
  const groupes: Record<string, any[]> = {};
  for (const v of visites) {
    if (!v.date_visite || v.statut === 'annulee') continue;
    const jour = String(v.date_visite).slice(0, 10);
    const qui = nomDe(v.clients) || nomDe(clientsParId[v.client_id]);
    if (!v.heure) {
      taches.push({ cle: 'vh-' + v.id, jour, titre: `Visite à caler · ${qui || v.biens?.titre || 'bien'}`, genre: 'visite', clientId: v.client_id || null });
      continue;
    }
    const k = `${v.client_id}|${jour}|${String(v.heure).slice(0, 5)}`;
    (groupes[k] ||= []).push(v);
  }
  for (const [k, lot] of Object.entries(groupes)) {
    const v0 = lot[0];
    const jour = String(v0.date_visite).slice(0, 10);
    const [h, m] = String(v0.heure).slice(0, 5).split(':').map(Number);
    const debut = depuisCle(jour); debut.setHours(h || 10, m || 0, 0, 0);
    const fin = new Date(debut.getTime() + (Number(v0.duree_min) || 60) * 60000);
    const qui = nomDe(v0.clients) || nomDe(clientsParId[v0.client_id]);
    const biens = lot.map(v => ({ id: v.bien_id, titre: v.biens?.titre || v.biens?.ville || 'Bien', photo: v.biens?.photos?.[0] }));
    const toutesFaites = lot.every(v => v.statut === 'effectuee');
    evs.push({
      cle: 'v-' + k, source: 'visite', ids: lot.map(v => v.id), type: 'visite',
      titre: lot.length > 1 ? `${lot.length} visites · ${qui}` : `Visite · ${biens[0].titre}`,
      debut, fin, jour, qui, lieu: lieuDuBien(v0.biens), contact: v0.contact_agence || '', notes: v0.commentaire && !toutesFaites ? v0.commentaire : '',
      biens, clientId: v0.client_id || null, rechercheId: v0.recherche_id || null,
      fait: fin <= maintenant, crAFaire: fin <= maintenant && lot.some(v => v.statut === 'a_venir'),
      details: { rappelLe: lot.map(v => v.rappel_envoye_le).filter(Boolean).sort().pop() || null }, relanceId: v0.rappel_relance_id || null,
    });
  }

  for (const r of rdvs) {
    if (r.statut === 'annule') continue;
    const debut = new Date(r.debut), fin = new Date(r.fin);
    if (isNaN(debut.getTime())) continue;
    const type = (ORDRE.includes(r.type) ? r.type : 'client') as TypeRdv;
    evs.push({
      cle: 'r-' + r.id, source: 'rdv', ids: [r.id], type, titre: r.titre || TYPES[type].nom,
      debut, fin: isNaN(fin.getTime()) ? new Date(debut.getTime() + 3600000) : fin, jour: cleDe(debut),
      qui: nomDe(r.clients) || nomDe(clientsParId[r.client_id]) || r.details?.proprietaire || '',
      lieu: r.lieu || '', contact: r.details?.telephone || '', notes: r.notes || '', biens: [],
      clientId: r.client_id || null, rechercheId: r.recherche_id || null,
      fait: fin <= maintenant, crAFaire: false, details: r.details || {}, relanceId: r.relance_id || null,
    });
  }

  /* Les relances dues. Celles qu'on a posées comme rappel d'un rendez-vous
     ne se répètent pas : le rendez-vous est déjà dans la grille. */
  for (const r of relances) {
    if (!r.date_echeance) continue;
    if (String(r.note || '').startsWith('Rendez-vous :')) continue;
    const c = clientsParId[r.client_id];
    taches.push({ cle: 'rel-' + r.id, jour: cleDe(new Date(r.date_echeance)), titre: `Relance · ${nomDe(c) || 'client'}`, genre: 'relance', clientId: r.client_id || null });
  }
  for (const t of transactions) {
    const qui = nomDe(clientsParId[t.client_id]);
    const pose = (d: any, titre: string, genre: Genre) => { if (d) taches.push({ cle: `tx-${t.id}-${titre}`, jour: String(d).slice(0, 10), titre: `${titre} · ${qui}`, genre, clientId: t.client_id || null }); };
    pose(t.offre_date, 'Offre', 'signature');
    pose(t.compromis_date, 'Compromis', 'signature');
    pose(t.sru_date_fin, 'Fin du délai SRU', 'signature');
    pose(t.acte_date_prevue, 'Acte prévu', 'signature');
  }
  for (const r of recherches) {
    if (!r.mandat_date_expiration || r.sans_mandat) continue;
    taches.push({ cle: 'm-' + r.id, jour: String(r.mandat_date_expiration).slice(0, 10), titre: `Fin du mandat · ${nomDe(clientsParId[r.client_id])}`, genre: 'mandat', clientId: r.client_id || null });
  }
  evs.sort((a, b) => a.debut.getTime() - b.debut.getTime());
  return { evs, taches };
}

/* Des rendez-vous qui se chevauchent se partagent la largeur de la colonne. */
function disposer(evs: Ev[]): (Ev & { col: number; cols: number })[] {
  const tri = [...evs].sort((a, b) => a.debut.getTime() - b.debut.getTime() || b.fin.getTime() - a.fin.getTime());
  const out: (Ev & { col: number; cols: number })[] = [];
  let groupe: Ev[] = []; let finGroupe = 0;
  const vider = () => {
    const fins: number[] = [];
    const places = groupe.map(e => {
      let c = fins.findIndex(f => f <= e.debut.getTime());
      if (c === -1) { c = fins.length; fins.push(0); }
      fins[c] = e.fin.getTime();
      return { e, c };
    });
    places.forEach(p => out.push({ ...p.e, col: p.c, cols: fins.length }));
    groupe = []; finGroupe = 0;
  };
  for (const e of tri) {
    if (groupe.length && e.debut.getTime() >= finGroupe) vider();
    groupe.push(e); finGroupe = Math.max(finGroupe, e.fin.getTime());
  }
  if (groupe.length) vider();
  return out;
}

const topDe = (d: Date) => Math.max(0, Math.min((H1 - H0) * PX, ((d.getHours() + d.getMinutes() / 60) - H0) * PX));

function useEtroit() {
  const [etroit, setEtroit] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const maj_ = () => setEtroit(mq.matches);
    maj_(); mq.addEventListener('change', maj_);
    return () => mq.removeEventListener('change', maj_);
  }, []);
  return etroit;
}

/* ══ La page ═══════════════════════════════════════════════════ */

type Modale = { mode: 'nouveau'; jour: string; heure: string; rechercheId?: string } | { mode: 'modifier'; ev: Ev } | null;

export default function PageAgenda({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const etroit = useEtroit();
  const [maintenant, setMaintenant] = useState(() => new Date());
  const [vue, setVue] = useState<'jour' | 'semaine' | 'mois'>('semaine');
  const [jour, setJour] = useState(() => cleDe(new Date()));
  const [masques, setMasques] = useState<Partial<Record<TypeRdv, boolean>>>({});
  const [selCle, setSelCle] = useState<string | null>(null);
  const [modale, setModale] = useState<Modale>(null);
  const [rappelDe, setRappelDe] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [tableAbsente, setTableAbsente] = useState(false);
  const [brut, setBrut] = useState<{ visites: any[]; rdvs: any[]; relances: any[]; transactions: any[]; recherches: any[]; clients: any[] }>({ visites: [], rdvs: [], relances: [], transactions: [], recherches: [], clients: [] });

  /* La ligne rouge avance toute seule. */
  useEffect(() => { const t = setInterval(() => setMaintenant(new Date()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { if (etroit) setVue(v => (v === 'semaine' ? 'jour' : v)); }, [etroit]);

  const charger = useCallback(async () => {
    const [v, r, rel, tx, rech, cl] = await Promise.all([
      supabase.from('visites').select('*, clients(id, prenom, nom), biens(id, titre, ville, quartier, adresse, adresse_probable, photos)'),
      supabase.from('rendez_vous').select('*'),
      supabase.from('relances').select('*').eq('statut', 'en_attente'),
      supabase.from('transactions').select('*'),
      supabase.from('recherches').select('*'),
      supabase.from('clients').select('id, prenom, nom, statut, emails'),
    ]);
    /* Tant que le SQL de l'agenda n'a pas été lancé, la table n'existe pas :
       les visites s'affichent quand même, on prévient pour le reste. */
    setTableAbsente(!!r.error);
    setBrut({ visites: v.data || [], rdvs: r.data || [], relances: rel.data || [], transactions: tx.data || [], recherches: rech.data || [], clients: cl.data || [] });
    setChargement(false);
  }, []);
  useEffect(() => { charger(); }, [charger]);
  useEffect(() => {
    if (chargement) return;
    /* Venu de la fiche d'un client (« Créer un rendez-vous ») : la fenêtre
       s'ouvre tout de suite, son dossier déjà choisi. */
    const id = prendreDemandeRendezVous();
    if (id) {
      const n = new Date(); const suiv = Math.min(20, Math.max(8, n.getHours() + 1));
      setModale({ mode: 'nouveau', jour: cleDe(n), heure: `${pad(suiv)}:00`, rechercheId: id });
    }
  }, [chargement]);

  const clientsParId = useMemo(() => Object.fromEntries(brut.clients.map(c => [c.id, c])), [brut.clients]);
  const { evs, taches } = useMemo(
    () => construire(brut.visites, brut.rdvs, brut.relances, brut.transactions, brut.recherches, clientsParId, maintenant),
    [brut, clientsParId, maintenant],
  );
  const dossiers: Dossier[] = useMemo(() => {
    const parClient: Record<string, number> = {};
    brut.recherches.forEach(r => { parClient[r.client_id] = (parClient[r.client_id] || 0) + 1; });
    return brut.recherches
      .map(r => ({ r, c: clientsParId[r.client_id] }))
      .filter(x => x.c && x.c.statut !== 'perdu')
      .map(({ r, c }) => ({
        rechercheId: r.id, clientId: c.id, nom: nomDe(c), prenom: c.prenom || nomDe(c),
        emails: (c.emails || []).filter(Boolean),
        libelle: parClient[c.id] > 1 ? `${nomDe(c)} — ${r.nom || 'Recherche'}` : nomDe(c),
        recherche: nommerRecherche(r, 1), resume: resumerRecherche(r), plusieurs: parClient[c.id] > 1, cree: String(r.created_at || ''),
      }))
      .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
  }, [brut.recherches, clientsParId]);

  const visibles = evs.filter(e => !masques[e.type]);
  const auj = cleDe(maintenant);
  const dJour = depuisCle(jour);
  const lundi = lundiDe(dJour);
  const semaine = [0, 1, 2, 3, 4, 5, 6].map(i => cleDe(plusJours(lundi, i)));
  const sel = selCle ? evs.find(e => e.cle === selCle) || null : null;

  const deLaSemaine = visibles.filter(e => semaine.some(k => couvre(e, k)));
  const debutMois = new Date(dJour.getFullYear(), dJour.getMonth(), 1);
  const premierDuMois = cleDe(new Date(dJour.getFullYear(), dJour.getMonth(), 1)), dernierDuMois = cleDe(new Date(dJour.getFullYear(), dJour.getMonth() + 1, 0));
  const duMois = visibles.filter(e => e.jour <= dernierDuMois && dernierJour(e) >= premierDuMois);
  const compter = (l: Ev[], t: TypeRdv) => l.filter(e => e.type === t).length;

  let titre = '', sous = '';
  if (vue === 'jour') {
    titre = maj(jourLong(dJour));
    const liste = duJour(visibles, jour);
    const p = liste.find(e => e.debut > maintenant);
    sous = `${rdv(liste.length)}${p ? ` · le prochain à ${hhmm(p.debut)}` : ''}`;
  } else if (vue === 'semaine') {
    const a = depuisCle(semaine[0]), b = depuisCle(semaine[6]);
    titre = a.getMonth() === b.getMonth() ? `${a.getDate()} – ${b.getDate()} ${MOIS[b.getMonth()]} ${b.getFullYear()}` : `${a.getDate()} ${MOIS[a.getMonth()]} – ${b.getDate()} ${MOIS[b.getMonth()]}`;
    sous = `${deLaSemaine.length} rendez-vous · ${pl(compter(deLaSemaine, 'visite'), 'visite')} · ${pl(compter(deLaSemaine, 'signature'), 'signature')}`;
  } else {
    titre = maj(`${MOIS[dJour.getMonth()]} ${dJour.getFullYear()}`);
    sous = `${duMois.length} rendez-vous dans le mois · ${pl(compter(duMois, 'visite'), 'visite')} · ${pl(compter(duMois, 'signature'), 'signature')}`;
  }

  const decaler = (sens: number) => {
    setSelCle(null);
    if (vue === 'jour') setJour(cleDe(plusJours(dJour, sens)));
    else if (vue === 'semaine') setJour(cleDe(plusJours(dJour, 7 * sens)));
    else setJour(cleDe(new Date(dJour.getFullYear(), dJour.getMonth() + sens, 1)));
  };
  const allerJour = (k: string) => { setJour(k); setVue('jour'); setSelCle(null); };

  /* Le compte rendu se fait dans la page Visites : on y va, visite ouverte. */
  const compteRendu = (ev: Ev) => {
    try { window.sessionStorage.setItem('emi-cr', ev.ids[0]); } catch { /* sans effet */ }
    onNavigate('visites');
  };
  const ouvrirDossier = async (clientId: string | null) => {
    if (!clientId) return;
    const { data, error } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle();
    if (error || !data) { alert("Le dossier n'a pas pu être ouvert."); return; }
    onNavigate('fiche', data);
  };

  async function annuler(ev: Ev) {
    const quoi = ev.source === 'visite' ? (ev.ids.length > 1 ? `ces ${ev.ids.length} visites` : 'cette visite') : 'ce rendez-vous';
    if (!window.confirm(`Annuler ${quoi} du ${jourLong(ev.debut)} à ${hhmm(ev.debut)} ?\n\n${ev.source === 'visite' ? 'Elle disparaît aussi de l’espace du client.' : 'Il sort de ton agenda.'}`)) return;
    const { error } = ev.source === 'visite'
      ? await supabase.from('visites').update({ statut: 'annulee' }).in('id', ev.ids)
      : await supabase.from('rendez_vous').update({ statut: 'annule' }).in('id', ev.ids);
    if (error) { alert("L'annulation n'a pas pu être enregistrée.\n\n" + error.message); return; }
    if (ev.relanceId) {
      const r = await supabase.from('relances').update({ statut: 'cloturee' }).eq('id', ev.relanceId);
      if (r.error) alert("C'est annulé, mais son rappel est resté dans tes Relances : clos-le à la main.\n\n" + r.error.message);
    }
    if (ev.clientId) await addJournal(ev.clientId, ev.source === 'visite' ? 'visite_annulee' : 'rdv_annule', `✕ ${ev.titre} — annulé`, `${maj(jourLong(ev.debut))} à ${hhmm(ev.debut)}`);
    setSelCle(null); charger();
  }

  const crAFaire = evs.filter(e => e.crAFaire).sort((a, b) => b.debut.getTime() - a.debut.getTime());
  const prochains = visibles.filter(e => e.debut > maintenant).slice(0, 3);
  const aujListe = duJour(visibles, auj);
  const suivant = aujListe.find(e => e.debut > maintenant);
  const resume = `${rdv(aujListe.length)} aujourd’hui${suivant ? `, le prochain à ${hhmm(suivant.debut)}.` : '.'}`;
  /* Les compteurs de la légende portent sur la période affichée, types
     masqués compris : on voit ce qu'on cache. */
  const dansPeriode = (e: Ev) => vue === 'jour' ? couvre(e, jour)
    : vue === 'semaine' ? semaine.some(k => couvre(e, k))
    : e.jour <= dernierDuMois && dernierJour(e) >= premierDuMois;
  const legende = ORDRE.map(t => ({ t, n: evs.filter(e => e.type === t && dansPeriode(e)).length }));

  /* Sans heure donnée : l'heure pleine suivante si c'est aujourd'hui (entre
     8 h et 20 h), 10 h sinon. */
  const nouveau = (j?: string, h?: string) => {
    const k = j || jour;
    const suiv = Math.min(20, Math.max(8, maintenant.getHours() + 1));
    setModale({ mode: 'nouveau', jour: k, heure: h || (k === auj ? `${pad(suiv)}:00` : '10:00') });
  };

  const commun = { maintenant, onVoirEv: (e: Ev) => setSelCle(e.cle) };

  if (chargement) {
    return <div style={{ padding: 40, color: PALE, fontSize: 14 }}>Chargement de l’agenda…</div>;
  }

  return (
    <div className="ag-page" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: NAVY }}>
      <StylesAgenda />
      {tableAbsente && (
        <div style={{ margin: etroit ? '12px 14px 0' : '20px 28px 0', display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13, lineHeight: 1.5 }}>
          <Ic n="alerte" t={17} />
          <span>{'Les visites s’affichent déjà. Pour créer les autres rendez-vous (client, appel, signature…), lance une fois le SQL « agenda-rendez-vous.sql » dans Supabase.'}</span>
        </div>
      )}

      {etroit ? (
        <VueTelephone
          vue={vue} setVue={v => { setVue(v); setSelCle(null); }} jour={jour} setJour={k => { setJour(k); setSelCle(null); }}
          semaine={semaine} evs={visibles} taches={taches} auj={auj} titre={titre} decaler={decaler}
          aujourdhui={() => setJour(auj)} onNouveau={() => nouveau()} {...commun} />
      ) : (
        <div style={{ display: 'flex', gap: 22, padding: '22px 28px 28px', alignItems: 'flex-start' }}>
          <Rail
            maintenant={maintenant} jour={jour} setJour={k => { setJour(k); setSelCle(null); }} evs={visibles} resume={resume}
            legende={legende} masques={masques} basculer={t => setMasques(m => ({ ...m, [t]: !m[t] }))}
            prochains={prochains} crAFaire={crAFaire} onNouveau={() => nouveau()} onVoirEv={e => { setJour(e.jour); setSelCle(e.cle); }} onCR={compteRendu} />
          <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <h1 style={{ margin: 0, fontFamily: JAK, fontSize: 26, fontWeight: 800, letterSpacing: -.5 }}>{titre}</h1>
                <div style={{ fontSize: 13, color: DOUX, marginTop: 3 }}>{sous}</div>
              </div>
              <Navigation decaler={decaler} aujourdhui={() => { setJour(auj); setSelCle(null); }} />
              <Segment vue={vue} setVue={v => { setVue(v); setSelCle(null); }} />
            </header>
            {vue === 'semaine' && <VueSemaine semaine={semaine} evs={visibles} taches={taches} auj={auj} onJour={allerJour} onCreneau={nouveau} {...commun} />}
            {vue === 'jour' && <VueJour jour={jour} evs={visibles} taches={taches} auj={auj} onCreneau={nouveau} {...commun} />}
            {vue === 'mois' && <VueMois debutMois={debutMois} evs={visibles} taches={taches} auj={auj} jourSel={jour} onJour={allerJour} />}
          </main>
        </div>
      )}

      {sel && (
        <Detail ev={sel} etroit={etroit} onFerme={() => setSelCle(null)}
          onModifier={() => { setModale({ mode: 'modifier', ev: sel }); setSelCle(null); }}
          onAnnuler={() => annuler(sel)} onCR={() => compteRendu(sel)} onDossier={() => ouvrirDossier(sel.clientId)}
          onRappel={() => setRappelDe(sel.ids[0])} />
      )}
      {rappelDe && (
        <ModaleRappelVisite visiteId={rappelDe} onFerme={() => setRappelDe(null)} onEnvoye={() => { setRappelDe(null); charger(); }} />
      )}
      {modale && (
        <ModaleRdv modale={modale} dossiers={dossiers} relances={brut.relances} tableAbsente={tableAbsente} evs={evs}
          onFerme={() => setModale(null)} onEnregistre={() => { setModale(null); charger(); }} />
      )}
    </div>
  );
}

/* ══ Les styles partagés (animations, survols, téléphone) ══════ */
function StylesAgenda() {
  return (
    <style>{`
      @keyframes agVue{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      @keyframes agEv{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}
      @keyframes agTiroir{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:none}}
      @keyframes agFeuille{from{transform:translateY(60px);opacity:.4}to{transform:none;opacity:1}}
      @keyframes agVoile{from{opacity:0}to{opacity:1}}
      @keyframes agPouls{0%{box-shadow:0 0 0 0 rgba(214,84,60,.55)}70%{box-shadow:0 0 0 10px rgba(214,84,60,0)}100%{box-shadow:0 0 0 0 rgba(214,84,60,0)}}
      .ag-vue{animation:agVue .38s cubic-bezier(.2,.9,.3,1) both}
      .ag-ev{animation:agEv .45s cubic-bezier(.2,.9,.3,1) both;transition:transform .18s cubic-bezier(.2,.9,.3,1),box-shadow .18s ease}
      .ag-ev:hover{transform:translateY(-2px);box-shadow:0 12px 26px -14px rgba(20,28,42,.55);z-index:4}
      .ag-appui{transition:transform .15s ease,background-color .15s ease,box-shadow .15s ease}
      .ag-appui:hover{transform:translateY(-1px)}
      .ag-appui:active{transform:scale(.98)}
      .ag-case{transition:background-color .15s ease}
      .ag-case:hover{background-color:#f8f9fc !important}
      .ag-seg{transition:transform .38s cubic-bezier(.34,1.4,.5,1)}
      .ag-maintenant{position:absolute;left:0;right:0;height:2px;background:#d6543c;z-index:5;pointer-events:none}
      .ag-maintenant::before{content:"";position:absolute;left:-5px;top:-4px;width:10px;height:10px;border-radius:50%;background:#d6543c;animation:agPouls 2.2s ease-out infinite}
      .ag-tiroir{animation:agTiroir .42s cubic-bezier(.2,.9,.3,1) both}
      .ag-feuille{animation:agFeuille .38s cubic-bezier(.22,.9,.3,1) both}
      .ag-voile{animation:agVoile .25s ease both}
      @keyframes agSection{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
      @keyframes agPanneau{from{opacity:0;transform:translateY(-6px) scale(.985)}to{opacity:1;transform:none}}
      .ag-section{animation:agSection .45s cubic-bezier(.2,.9,.3,1) both}
      .ag-panneau{animation:agPanneau .26s cubic-bezier(.2,.9,.3,1) both;transform-origin:top center}
      .ag-champ{transition:border-color .15s ease,box-shadow .15s ease,background-color .15s ease}
      .ag-champ:hover:not(:focus):not(:disabled){border-color:#cfd7e3 !important}
      .ag-champ:focus{border-color:${OR} !important;box-shadow:0 0 0 4px rgba(201,168,76,.16);background:#fff !important}
      .ag-champ-bouton{transition:border-color .15s ease,box-shadow .2s ease,background-color .2s ease,transform .15s ease}
      .ag-champ-bouton:hover:not([data-ouvert]){border-color:#cfd7e3 !important;transform:translateY(-1px)}
      .ag-jour{transition:background-color .12s ease,transform .12s ease}
      .ag-jour:hover:not(:disabled):not([aria-pressed="true"]){background:#f1f4f9 !important}
      .ag-jour:active:not(:disabled){transform:scale(.94)}
      @media (prefers-reduced-motion: reduce){.ag-section,.ag-panneau{animation:none}}
      @media (max-width: 760px){.ag-heure-ligne{grid-template-columns:1fr !important;gap:6px !important}}
      .ag-grille-defil::-webkit-scrollbar{width:8px}.ag-grille-defil::-webkit-scrollbar-thumb{background:#dde3ec;border-radius:8px}
    `}</style>
  );
}

function Navigation({ decaler, aujourdhui }: { decaler: (s: number) => void; aujourdhui: () => void }) {
  const rond: React.CSSProperties = { width: 40, height: 40, borderRadius: 12, border: `1px solid ${BORD}`, background: 'white', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: 'inherit' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button type="button" className="ag-appui" aria-label="Période précédente" onClick={() => decaler(-1)} style={rond}><Ic n="chevG" t={17} /></button>
      <button type="button" className="ag-appui" onClick={aujourdhui} style={{ ...rond, width: 'auto', padding: '0 15px', fontSize: 13, fontWeight: 700 }}>Aujourd’hui</button>
      <button type="button" className="ag-appui" aria-label="Période suivante" onClick={() => decaler(1)} style={rond}><Ic n="chevD" t={17} /></button>
    </div>
  );
}

function Segment({ vue, setVue, largeur = 84 }: { vue: string; setVue: (v: 'jour' | 'semaine' | 'mois') => void; largeur?: number }) {
  const vues: { id: 'jour' | 'semaine' | 'mois'; lib: string }[] = [{ id: 'jour', lib: 'Jour' }, { id: 'semaine', lib: 'Semaine' }, { id: 'mois', lib: 'Mois' }];
  const i = vues.findIndex(v => v.id === vue);
  return (
    <div style={{ position: 'relative', display: 'flex', padding: 4, background: '#e8ecf3', borderRadius: 14, flexShrink: 0 }}>
      <span className="ag-seg" style={{ position: 'absolute', top: 4, left: 4, width: largeur, height: 36, borderRadius: 10, background: 'white', boxShadow: '0 2px 10px -3px rgba(16,24,40,.28)', transform: `translateX(${i * largeur}px)` }} />
      {vues.map(v => (
        <button key={v.id} type="button" onClick={() => setVue(v.id)} aria-pressed={vue === v.id}
          style={{ position: 'relative', width: largeur, height: 36, border: 'none', background: 'transparent', borderRadius: 10, fontSize: 13, fontWeight: 700, color: vue === v.id ? NAVY : '#6b778a', cursor: 'pointer', fontFamily: 'inherit' }}>{v.lib}</button>
      ))}
    </div>
  );
}

function Etiquette({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: PALE }}>{children}</div>;
}

/* ══ La colonne de gauche ══════════════════════════════════════ */
function Rail({ maintenant, jour, setJour, evs, resume, legende, masques, basculer, prochains, crAFaire, onNouveau, onVoirEv, onCR }: {
  maintenant: Date; jour: string; setJour: (k: string) => void; evs: Ev[]; resume: string;
  legende: { t: TypeRdv; n: number }[]; masques: Partial<Record<TypeRdv, boolean>>; basculer: (t: TypeRdv) => void;
  prochains: Ev[]; crAFaire: Ev[]; onNouveau: () => void; onVoirEv: (e: Ev) => void; onCR: (e: Ev) => void;
}) {
  const [mois, setMois] = useState(() => { const d = depuisCle(jour); return new Date(d.getFullYear(), d.getMonth(), 1); });
  useEffect(() => { const d = depuisCle(jour); setMois(m => (m.getMonth() === d.getMonth() && m.getFullYear() === d.getFullYear() ? m : new Date(d.getFullYear(), d.getMonth(), 1))); }, [jour]);
  const debut = lundiDe(mois);
  const nbCases = Math.ceil((((mois.getDay() + 6) % 7) + new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate()) / 7) * 7;
  const jours = new Set(evs.flatMap(joursCouverts));
  const auj = cleDe(maintenant);
  return (
    <aside style={{ width: 272, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontFamily: JAK, fontSize: 11, fontWeight: 800, letterSpacing: 1.8, color: OR_FONCE, textTransform: 'uppercase' }}>Agenda</div>
        <div style={{ fontFamily: JAK, fontSize: 21, fontWeight: 800, letterSpacing: -.3 }}>{maj(jourLong(maintenant))}</div>
        <div style={{ fontSize: 13, color: DOUX, lineHeight: 1.5 }}>{resume}</div>
      </div>
      <button type="button" className="ag-appui" onClick={onNouveau}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 46, borderRadius: 14, border: 'none', background: OR, color: NAVY, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 10px 22px -12px rgba(201,168,76,.9)' }}>
        <Ic n="plus" t={17} ep={2.4} />Nouveau rendez-vous
      </button>

      <div style={{ background: 'white', border: `1px solid ${BORD}`, borderRadius: 18, padding: '14px 12px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 8px' }}>
          <b style={{ fontFamily: JAK, fontSize: 14 }}>{maj(`${MOIS[mois.getMonth()]} ${mois.getFullYear()}`)}</b>
          <span style={{ display: 'flex', gap: 2 }}>
            <button type="button" aria-label="Mois précédent" onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() - 1, 1))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', color: DOUX, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="chevG" t={15} /></button>
            <button type="button" aria-label="Mois suivant" onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', color: DOUX, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="chevD" t={15} /></button>
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2, textAlign: 'center' }}>
          {LETTRES.map(l => <span key={l} style={{ fontSize: 10, fontWeight: 700, color: PALE, padding: '3px 0' }}>{l.slice(0, 1)}</span>)}
          {Array.from({ length: nbCases }, (_, i) => {
            const d = plusJours(debut, i); const k = cleDe(d);
            const estAuj = k === auj, choisi = k === jour, hors = d.getMonth() !== mois.getMonth();
            return (
              <button key={k} type="button" onClick={() => setJour(k)} aria-label={maj(jourLong(d))}
                style={{ height: 34, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, background: estAuj ? OR : choisi ? CHOISI : 'transparent', color: estAuj ? NAVY : hors ? '#b9c2d0' : NAVY, fontWeight: estAuj || choisi ? 800 : 500 }}>
                {d.getDate()}
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: jours.has(k) ? (estAuj ? NAVY : OR_FONCE) : 'transparent' }} />
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Etiquette>Types · sur la période</Etiquette>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {legende.map(({ t, n }) => {
            const actif = !masques[t];
            return (
              <button key={t} type="button" onClick={() => basculer(t)} aria-pressed={actif}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px', border: 'none', background: 'transparent', borderRadius: 9, cursor: 'pointer', opacity: actif ? 1 : .45, color: NAVY, fontFamily: 'inherit' }}>
                <span style={{ width: 16, height: 16, boxSizing: 'border-box', borderRadius: 5, background: actif ? TYPES[t].point : 'transparent', border: `1.5px solid ${TYPES[t].point}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                  {actif && <Ic n="coche" t={11} ep={3} />}
                </span>
                <span style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 600 }}>{TYPES[t].nom}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: PALE, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {crAFaire.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 12px 10px', borderRadius: 16, background: '#fff8e8', border: '1px solid #f3dcae' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#8a4b0f', fontSize: 12.5, fontWeight: 800 }}>
            <Ic n="note" t={15} />{`${pl(crAFaire.length, 'compte rendu')} à faire`}
          </div>
          {crAFaire.slice(0, 3).map(e => (
            <button key={e.cle} type="button" className="ag-appui" onClick={() => onCR(e)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, padding: '7px 10px', borderRadius: 10, border: '1px solid #f3dcae', background: 'white', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: NAVY }}>
              <b style={{ fontSize: 12.5, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.titre}</b>
              <span style={{ fontSize: 11.5, color: DOUX }}>{`${maj(jourLong(e.debut))} · ${e.qui}`}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Etiquette>À venir</Etiquette>
        {prochains.length === 0 && <span style={{ fontSize: 12.5, color: PALE }}>Rien de prévu pour l’instant.</span>}
        {prochains.map(e => (
          <button key={e.cle} type="button" className="ag-appui" onClick={() => onVoirEv(e)}
            style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 10px', border: `1px solid ${LIGNE}`, borderRadius: 12, background: 'white', cursor: 'pointer', textAlign: 'left', color: NAVY, fontFamily: 'inherit' }}>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 58 }}>
              <b style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{hhmm(e.debut)}</b>
              <span style={{ fontSize: 10.5, color: PALE }}>{e.jour === cleDe(maintenant) ? 'Aujourd’hui' : e.jour === cleDe(plusJours(maintenant, 1)) ? 'Demain' : `${maj(JOURS[e.debut.getDay()].slice(0, 3))}. ${e.debut.getDate()}`}</span>
            </span>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: TYPES[e.type].point, flexShrink: 0 }} />
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <b style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.titre}</b>
              <span style={{ fontSize: 11.5, color: DOUX, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.qui || TYPES[e.type].nom}</span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

/* ══ Un bloc de rendez-vous dans la grille ═════════════════════ */
function Bloc({ e, onVoir, large, rang }: { e: Ev & { col: number; cols: number }; onVoir: (e: Ev) => void; large?: boolean; rang: number }) {
  const t = TYPES[e.type];
  const c = teinte(e);
  const top = topDe(e.debut) + 2;
  const h = Math.max(24, topDe(e.fin) - topDe(e.debut) - 4);
  const grand = h >= 44;
  const largeur = 100 / e.cols;
  const pos: React.CSSProperties = {
    position: 'absolute', top, height: h, left: `calc(${e.col * largeur}% + ${large ? 10 : 4}px)`, width: `calc(${largeur}% - ${large ? 20 : 8}px)`,
    boxSizing: 'border-box', borderRadius: large ? 12 : 10, border: `1px solid ${c.trait}`, background: c.fond, color: c.encre,
    textAlign: 'left', cursor: 'pointer', overflow: 'hidden', fontFamily: 'inherit', animationDelay: `${40 + rang * 35}ms`,
  };
  const etroit = !large && e.cols >= 2;
  /* Le compte rendu à faire se reconnaît à sa petite feuille, à la place
     du point de couleur. */
  const point = e.crAFaire
    ? <span style={{ display: 'flex', flexShrink: 0 }}><Ic n="note" t={large ? 13 : 11} ep={2.4} /></span>
    : etroit ? null : <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.point, flexShrink: 0 }} />;
  /* Combien de lignes de titre tiennent sous l'heure, et reste-t-il de la
     place pour le client ou le lieu ? */
  const lignes = Math.max(1, Math.floor((h - 26) / 15));
  const sousLigne = grand && !!(e.qui || e.lieu) && (large || lignes >= 2);
  const lignesTitre = large || etroit ? 1 : sousLigne ? lignes - 1 : lignes;

  /* Un rendez-vous court (une demi-heure) tient sur une seule ligne :
     l'heure puis le titre, coupé proprement s'il déborde. */
  if (!grand && !large) {
    return (
      <button type="button" className="ag-ev" onClick={ev => { ev.stopPropagation(); onVoir(e); }} title={`${hhmm(e.debut)} ${e.titre}`}
        style={{ ...pos, display: 'flex', alignItems: 'center', gap: 5, padding: '0 7px', whiteSpace: 'nowrap', fontSize: 11 }}>
        {point}
        <span style={{ fontWeight: 700, opacity: .85, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{e.suite ? 'suite' : hhmm(e.debut)}</span>
        <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{e.titre}</span>
      </button>
    );
  }

  return (
    <button type="button" className="ag-ev" onClick={ev => { ev.stopPropagation(); onVoir(e); }} title={`${hhmm(e.debut)} ${e.titre}`}
      style={{
        ...pos, display: 'flex', flexDirection: large ? 'row' : 'column', alignItems: large ? (grand ? 'flex-start' : 'center') : 'stretch', gap: large ? 14 : 2,
        padding: large ? (grand ? '7px 12px' : '0 12px') : '5px 8px',
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: large ? 12 : 10.5, fontWeight: 700, opacity: .9, whiteSpace: 'nowrap', minWidth: large ? 96 : 0, fontVariantNumeric: 'tabular-nums' }}>
        {point}
        {e.suite ? (large ? `suite – ${e.finReelle && cleDe(e.finReelle) === e.jour ? hhmm(e.fin) : 'toute la journée'}` : 'suite') : large ? `${hhmm(e.debut)} – ${hhmm(e.fin)}` : hhmm(e.debut)}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{
          fontSize: large ? 14 : 12, fontWeight: 700, lineHeight: large ? 1.3 : '15px', fontFamily: large ? JAK : 'inherit', overflow: 'hidden',
          ...(lignesTitre === 1
            ? { whiteSpace: 'nowrap', textOverflow: 'ellipsis' }
            : { display: '-webkit-box', WebkitLineClamp: lignesTitre, WebkitBoxOrient: 'vertical' as const }),
        }}>{e.titre}</span>
        {sousLigne && (
          <span style={{ fontSize: large ? 12 : 11, opacity: .8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {large ? [e.qui, e.lieu].filter(Boolean).join(' · ') : (e.qui || e.lieu)}
          </span>
        )}
      </span>
      {large && (e.crAFaire || e.fait) && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 20, background: e.crAFaire ? '#ffffff' : '#eef1f6', color: e.crAFaire ? '#8a4b0f' : DOUX }}>
          <Ic n={e.crAFaire ? 'note' : 'coche'} t={12} ep={2.4} />{e.crAFaire ? 'Compte rendu à faire' : 'Passé'}
        </span>
      )}
    </button>
  );
}

/* Un rendez-vous sur plusieurs jours : une barre dans la ligne du haut de
   chaque jour qu'il couvre, plutôt qu'un bloc dans la grille des heures
   (il la mangerait en entier). */
function PuceLongue({ e, onVoir, petit }: { e: Ev; onVoir: (e: Ev) => void; petit?: boolean }) {
  const c = teinte(e);
  const dernier = !!e.finReelle && cleDe(e.finReelle) === e.jour;
  const quand = !e.suite ? `dès ${hhmm(e.debut)}` : dernier ? `jusqu’à ${hhmm(e.fin)}` : 'toute la journée';
  return (
    <button type="button" className="ag-appui" onClick={ev => { ev.stopPropagation(); onVoir(e); }} title={`${e.titre} · ${quand}`}
      style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', minWidth: 0, boxSizing: 'border-box', padding: petit ? '3px 7px' : '5px 10px', borderRadius: 7, border: `1px solid ${c.trait}`, borderLeft: `3px solid ${TYPES[e.type].point}`, background: c.fond, color: c.encre, fontSize: petit ? 10.5 : 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{e.titre}</span>
      {!petit && <span style={{ fontWeight: 600, opacity: .75, whiteSpace: 'nowrap', flexShrink: 0 }}>{quand}</span>}
    </button>
  );
}

function PuceTache({ t, petit }: { t: Tache; petit?: boolean }) {
  const c = TACHES[t.genre];
  return (
    <span title={t.titre} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: petit ? 10.5 : 11.5, fontWeight: 700, padding: petit ? '3px 7px' : '4px 10px', borderRadius: 7, background: c.fond, color: c.encre, border: `1px solid ${c.trait}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
      <Ic n={t.genre === 'relance' ? 'cloche' : t.genre === 'signature' ? 'stylo' : t.genre === 'visite' ? 'maison' : 'dossier'} t={petit ? 11 : 12} ep={2.2} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titre}</span>
    </span>
  );
}

/* La colonne des heures, à gauche de la grille. */
function Heures() {
  return (
    <div style={{ position: 'relative' }}>
      {Array.from({ length: H1 - H0 - 1 }, (_, i) => H0 + i + 1).map(h => (
        <span key={h} style={{ position: 'absolute', right: 10, top: (h - H0) * PX - 7, fontSize: 10.5, fontWeight: 600, color: PALE, fontVariantNumeric: 'tabular-nums' }}>{`${pad(h)}:00`}</span>
      ))}
    </div>
  );
}

const lignesHeures = `repeating-linear-gradient(to bottom, ${LIGNE} 0, ${LIGNE} 1px, transparent 1px, transparent ${PX}px)`;

/* Un clic dans le vide d'une colonne propose un rendez-vous à cette heure-là. */
function creneauDe(ev: React.MouseEvent<HTMLDivElement>): string {
  const r = ev.currentTarget.getBoundingClientRect();
  const h = H0 + Math.floor(((ev.clientY - r.top) / PX) * 2) / 2;
  const hh = Math.max(H0, Math.min(H1 - 1, Math.floor(h)));
  return `${pad(hh)}:${h % 1 ? '30' : '00'}`;
}

function useDefilementInitial(maintenant: Date) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    /* On arrive toujours sur 9 h 30 (demandé par Alexandre : 8 h, c'est
       trop tôt), et la ligne rouge dit où on en est. */
    ref.current?.scrollTo({ top: (9.5 - H0) * PX - 6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

/* ══ Semaine ═══════════════════════════════════════════════════ */
function VueSemaine({ semaine, evs, taches, auj, maintenant, onVoirEv, onJour, onCreneau }: {
  semaine: string[]; evs: Ev[]; taches: Tache[]; auj: string; maintenant: Date;
  onVoirEv: (e: Ev) => void; onJour: (k: string) => void; onCreneau: (j: string, h: string) => void;
}) {
  const defil = useDefilementInitial(maintenant);
  const colonnes = '56px repeat(7, minmax(0, 1fr))';
  return (
    <section className="ag-vue" style={{ background: 'white', border: `1px solid ${BORD}`, borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: colonnes, borderBottom: `1px solid ${BORD}` }}>
        <div />
        {semaine.map(k => {
          const d = depuisCle(k), estAuj = k === auj;
          const n = duJour(evs, k).length;
          return (
            <button key={k} type="button" className="ag-appui" onClick={() => onJour(k)} aria-label={`Voir le ${jourLong(d)}`}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', border: 'none', borderLeft: `1px solid ${LIGNE}`, background: estAuj ? AUJ_FOND : 'white', cursor: 'pointer', textAlign: 'left', color: NAVY, fontFamily: 'inherit', minWidth: 0 }}>
              <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: JAK, fontSize: 17, fontWeight: 800, background: estAuj ? OR : 'transparent', color: NAVY }}>{d.getDate()}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: estAuj ? OR_FONCE : PALE }}>{JOURS[d.getDay()].slice(0, 3)}</span>
                <span style={{ fontSize: 11.5, color: PALE, whiteSpace: 'nowrap' }}>{n ? `${n} rdv` : 'libre'}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: colonnes, borderBottom: `1px solid ${BORD}` }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: .2, color: PALE, textTransform: 'uppercase', padding: '11px 0 0 7px' }}>Journée</div>
        {semaine.map(k => (
          <div key={k} style={{ minHeight: 32, boxSizing: 'border-box', padding: 5, display: 'flex', flexDirection: 'column', gap: 4, borderLeft: `1px solid ${LIGNE}`, background: k === auj ? AUJ_FOND : 'white', minWidth: 0 }}>
            {duJour(evs, k).filter(e => e.finReelle).map(e => <PuceLongue key={e.cle} e={e} onVoir={onVoirEv} petit />)}
            {taches.filter(t => t.jour === k).map(t => <PuceTache key={t.cle} t={t} petit />)}
          </div>
        ))}
      </div>
      <div ref={defil} className="ag-grille-defil" style={{ maxHeight: 'calc(100vh - 290px)', minHeight: 360, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: colonnes, height: (H1 - H0) * PX }}>
          <Heures />
          {semaine.map((k, ci) => {
            const places = disposer(duJour(evs, k).filter(e => !e.finReelle));
            return (
              <div key={k} onClick={ev => onCreneau(k, creneauDe(ev))} title="Cliquer pour ajouter un rendez-vous"
                style={{ position: 'relative', borderLeft: `1px solid ${LIGNE}`, backgroundColor: k === auj ? AUJ_FOND : 'white', backgroundImage: lignesHeures, cursor: 'copy' }}>
                {places.map((e, i) => <Bloc key={e.cle} e={e} onVoir={onVoirEv} rang={ci * 2 + i} />)}
                {k === auj && maintenant.getHours() >= H0 && maintenant.getHours() < H1 && <div className="ag-maintenant" style={{ top: topDe(maintenant) }} />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ══ Jour ══════════════════════════════════════════════════════ */
function VueJour({ jour, evs, taches, auj, maintenant, onVoirEv, onCreneau }: {
  jour: string; evs: Ev[]; taches: Tache[]; auj: string; maintenant: Date; onVoirEv: (e: Ev) => void; onCreneau: (j: string, h: string) => void;
}) {
  const defil = useDefilementInitial(maintenant);
  const liste = duJour(evs, jour);
  const places = disposer(liste.filter(e => !e.finReelle));
  const longs = liste.filter(e => e.finReelle);
  const tJ = taches.filter(t => t.jour === jour);
  return (
    <section className="ag-vue" key={jour} style={{ background: 'white', border: `1px solid ${BORD}`, borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: `1px solid ${BORD}`, flexWrap: 'wrap', minHeight: 26 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: DOUX }}>{liste.length ? rdv(liste.length) : 'Aucun rendez-vous'}</span>
        {longs.map(e => <span key={e.cle} style={{ display: 'flex', maxWidth: 360, minWidth: 0 }}><PuceLongue e={e} onVoir={onVoirEv} /></span>)}
        {tJ.map(t => <PuceTache key={t.cle} t={t} />)}
      </div>
      <div ref={defil} className="ag-grille-defil" style={{ maxHeight: 'calc(100vh - 250px)', minHeight: 360, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr)', height: (H1 - H0) * PX }}>
          <Heures />
          <div onClick={ev => onCreneau(jour, creneauDe(ev))} title="Cliquer pour ajouter un rendez-vous"
            style={{ position: 'relative', borderLeft: `1px solid ${LIGNE}`, backgroundColor: jour === auj ? AUJ_FOND : 'white', backgroundImage: lignesHeures, cursor: 'copy' }}>
            {places.map((e, i) => <Bloc key={e.cle} e={e} onVoir={onVoirEv} large rang={i} />)}
            {jour === auj && maintenant.getHours() >= H0 && maintenant.getHours() < H1 && <div className="ag-maintenant" style={{ top: topDe(maintenant) }} />}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══ Mois ══════════════════════════════════════════════════════ */
function VueMois({ debutMois, evs, taches, auj, jourSel, onJour }: {
  debutMois: Date; evs: Ev[]; taches: Tache[]; auj: string; jourSel: string; onJour: (k: string) => void;
}) {
  const debut = lundiDe(debutMois);
  const nbCases = Math.ceil((((debutMois.getDay() + 6) % 7) + new Date(debutMois.getFullYear(), debutMois.getMonth() + 1, 0).getDate()) / 7) * 7;
  return (
    <section className="ag-vue" style={{ background: 'white', border: `1px solid ${BORD}`, borderRadius: 20, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: `1px solid ${BORD}` }}>
        {LETTRES.map(l => <span key={l} style={{ padding: '11px 12px', fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: PALE }}>{l}</span>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridAutoRows: 'minmax(128px, auto)' }}>
        {Array.from({ length: nbCases }, (_, i) => {
          const d = plusJours(debut, i); const k = cleDe(d);
          const liste = duJour(evs, k);
          const t = taches.filter(x => x.jour === k);
          const hors = d.getMonth() !== debutMois.getMonth(), estAuj = k === auj;
          return (
            <button key={k} type="button" className="ag-case" onClick={() => onJour(k)} aria-label={`${maj(jourLong(d))}${liste.length ? `, ${liste.length} rendez-vous` : ''}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, padding: 8, boxSizing: 'border-box', border: 'none', borderRight: `1px solid ${LIGNE}`, borderBottom: `1px solid ${LIGNE}`, background: estAuj ? AUJ_FOND : hors ? '#fafbfd' : 'white', boxShadow: k === jourSel && !estAuj ? `inset 0 0 0 2px ${NAVY}` : 'none', textAlign: 'left', cursor: 'pointer', overflow: 'hidden', opacity: hors ? .55 : 1, color: NAVY, fontFamily: 'inherit', minWidth: 0, animation: `agEv .35s cubic-bezier(.2,.9,.3,1) ${20 + i * 10}ms both` }}>
              <span style={{ alignSelf: 'flex-start', minWidth: 26, height: 26, padding: '0 7px', boxSizing: 'border-box', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: JAK, fontSize: 13, fontWeight: estAuj ? 800 : 700, background: estAuj ? OR : 'transparent' }}>
                {d.getDate() === 1 ? `1 ${MOIS[d.getMonth()].slice(0, 4)}.` : d.getDate()}
              </span>
              {t.slice(0, 1).map(x => <PuceTache key={x.cle} t={x} petit />)}
              {liste.slice(0, 3).map(e => {
                const c = teinte(e);
                return (
                  <span key={e.cle} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, padding: '3px 6px', borderRadius: 6, background: c.fond, color: c.encre, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: TYPES[e.type].point, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${e.suite ? 'suite' : hhmm(e.debut)} ${e.qui || e.titre}`}</span>
                  </span>
                );
              })}
              {liste.length > 3 && <span style={{ fontSize: 10.5, fontWeight: 700, color: DOUX, paddingLeft: 6 }}>{`+ ${liste.length - 3} autre${liste.length - 3 > 1 ? 's' : ''}`}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ══ Le détail d'un rendez-vous ════════════════════════════════ */
function Detail({ ev, etroit, onFerme, onModifier, onAnnuler, onCR, onDossier, onRappel }: {
  ev: Ev; etroit: boolean; onFerme: () => void; onModifier: () => void; onAnnuler: () => void; onCR: () => void; onDossier: () => void; onRappel: () => void;
}) {
  const [monte, setMonte] = useState(false);
  useEffect(() => { setMonte(true); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFerme(); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [onFerme]);
  if (!monte) return null;
  const t = TYPES[ev.type];
  const ligne = (ico: string, fort: string, fin: string) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: 13.5 }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: CHOISI, color: DOUX, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n={ico} t={16} /></span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingTop: 1, minWidth: 0 }}><b style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{fort}</b><span style={{ fontSize: 12, color: PALE }}>{fin}</span></span>
    </div>
  );
  const bouton: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, padding: '0 14px', borderRadius: 12, border: `1px solid ${BORD}`, background: 'white', color: NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', fontFamily: 'inherit' };
  const itineraire = ev.lieu && !/^(visio|téléphone)/i.test(ev.lieu) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.lieu)}` : '';
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9990, fontFamily: "'DM Sans', system-ui, sans-serif", color: NAVY }}>
      <StylesAgenda />
      <button type="button" className="ag-voile" aria-label="Fermer le détail" onClick={onFerme} style={{ position: 'absolute', inset: 0, border: 'none', background: 'rgba(10,15,24,.28)', cursor: 'default' }} />
      <section className={etroit ? 'ag-feuille' : 'ag-tiroir'} role="dialog" aria-label="Détail du rendez-vous"
        style={etroit
          ? { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88dvh', overflowY: 'auto', background: 'white', borderRadius: '24px 24px 0 0', padding: '10px 20px calc(22px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 -20px 50px -20px rgba(10,15,24,.4)' }
          : { position: 'absolute', top: 0, right: 0, bottom: 0, width: 400, maxWidth: '100%', boxSizing: 'border-box', overflowY: 'auto', background: 'white', boxShadow: '-24px 0 60px -30px rgba(16,24,40,.45)', padding: '26px 26px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {etroit && <span style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 4, background: '#d5dbe5' }} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 20, background: t.fond, color: t.encre, fontSize: 12, fontWeight: 800 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.point }} />{t.nom}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 20, background: ev.crAFaire ? '#fff6e3' : ev.fait ? '#eef1f6' : '#fdf6e3', color: ev.crAFaire ? '#8a4b0f' : DOUX }}>
            {ev.crAFaire ? 'Compte rendu à faire' : ev.fait ? 'Passé' : 'À venir'}
          </span>
          <button type="button" aria-label="Fermer" onClick={onFerme} style={{ marginLeft: 'auto', width: 36, height: 36, borderRadius: 11, border: `1px solid ${BORD}`, background: 'white', color: DOUX, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Ic n="fermer" t={15} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 style={{ margin: 0, fontFamily: JAK, fontSize: 21, fontWeight: 800, lineHeight: 1.25, letterSpacing: -.3 }}>{ev.titre}</h2>
          <span style={{ fontSize: 13, color: DOUX }}>{dernierJour(ev) !== ev.jour
            ? `Du ${jourLong(ev.debut)} à ${hhmm(ev.debut)} au ${jourLong(ev.fin)} à ${hhmm(ev.fin)}`
            : `${maj(jourLong(ev.debut))} · ${hhmm(ev.debut)} – ${hhmm(ev.fin)} (${duree(Math.round((ev.fin.getTime() - ev.debut.getTime()) / 60000))})`}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {ev.qui && ligne('personne', ev.qui, ev.type === 'estimation' ? 'Propriétaire' : 'Client')}
          {ev.lieu && ligne('lieu', ev.lieu, 'Lieu')}
          {ev.contact && ligne('tel', ev.contact, ev.source === 'visite' ? 'Contact sur place' : 'Téléphone')}
          {ev.details?.mode && ligne(ev.details.mode === 'visio' ? 'visio' : 'tel', ev.details.mode === 'visio' ? 'Visio' : 'Téléphone', 'Comment')}
          {ev.details?.etape && ligne('stylo', ({ offre: 'Offre d’achat', compromis: 'Compromis de vente', acte: 'Acte authentique' } as Record<string, string>)[ev.details.etape] || ev.details.etape, 'Signature')}
        </div>
        {ev.biens.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Etiquette>{ev.biens.length > 1 ? `${ev.biens.length} biens à visiter` : 'Bien visité'}</Etiquette>
            {ev.biens.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 7, borderRadius: 12, border: `1px solid ${LIGNE}` }}>
                <span style={{ width: 52, height: 40, borderRadius: 9, overflow: 'hidden', background: '#eef2f8', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b6c1d1' }}>
                  {b.photo ? <img src={b.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Ic n="maison" t={16} />}
                </span>
                <b style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.titre}</b>
              </div>
            ))}
          </div>
        )}
        {ev.notes && (
          <div style={{ padding: '11px 13px', borderRadius: 13, background: CHOISI, fontSize: 13, lineHeight: 1.55, color: DOUX, whiteSpace: 'pre-line' }}>{ev.notes}</div>
        )}
        {ev.source === 'visite' && !ev.fait && ev.clientId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 14, background: ev.details?.rappelLe ? '#ecfdf5' : '#fffaf0', border: `1px solid ${ev.details?.rappelLe ? '#bfe3cf' : '#ecdcae'}` }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: 'white', color: ev.details?.rappelLe ? '#0b5e41' : OR_FONCE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n={ev.details?.rappelLe ? 'coche' : 'mail'} t={16} ep={ev.details?.rappelLe ? 2.6 : 2} /></span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 13, color: ev.details?.rappelLe ? '#0b5e41' : NAVY }}>{ev.details?.rappelLe ? libelleRappel(ev.details.rappelLe) : 'Pas encore de rappel au client'}</b>
              <span style={{ fontSize: 11.5, color: DOUX }}>{ev.details?.rappelLe ? 'Tu peux le renvoyer si besoin.' : 'Un mail avec l’heure et l’adresse de ses visites du jour.'}</span>
            </span>
            <button type="button" className="ag-appui" onClick={onRappel} style={{ height: 36, padding: '0 13px', borderRadius: 10, border: 'none', background: ev.details?.rappelLe ? 'white' : NAVY, color: ev.details?.rappelLe ? NAVY : 'white', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>{ev.details?.rappelLe ? 'Renvoyer' : 'Envoyer'}</button>
          </div>
        )}
        <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {ev.crAFaire && (
            <button type="button" className="ag-appui" onClick={onCR} style={{ ...bouton, gridColumn: 'span 2', background: OR, borderColor: OR, color: NAVY, fontWeight: 800 }}><Ic n="note" t={15} />Faire le compte rendu</button>
          )}
          {itineraire && <a className="ag-appui" href={itineraire} target="_blank" rel="noopener noreferrer" style={bouton}><Ic n="route" t={15} />Itinéraire</a>}
          {ev.clientId && <button type="button" className="ag-appui" onClick={onDossier} style={bouton}><Ic n="dossier" t={15} />Le dossier</button>}
          {!ev.fait && <button type="button" className="ag-appui" onClick={onModifier} style={bouton}><Ic n="crayon" t={15} />Modifier</button>}
          {!ev.fait && <button type="button" className="ag-appui" onClick={onAnnuler} style={{ ...bouton, color: '#b42318' }}><Ic n="corbeille" t={15} />Annuler</button>}
        </div>
      </section>
    </div>,
    document.body,
  );
}

/* ══ Téléphone ═════════════════════════════════════════════════ */
function VueTelephone({ vue, setVue, jour, setJour, semaine, evs, taches, auj, titre, decaler, aujourdhui, onNouveau, maintenant, onVoirEv }: {
  vue: 'jour' | 'semaine' | 'mois'; setVue: (v: 'jour' | 'semaine' | 'mois') => void; jour: string; setJour: (k: string) => void;
  semaine: string[]; evs: Ev[]; taches: Tache[]; auj: string; titre: string; decaler: (s: number) => void; aujourdhui: () => void;
  onNouveau: () => void; maintenant?: Date; onVoirEv: (e: Ev) => void;
}) {
  const dJour = depuisCle(jour);
  const carte = (e: Ev, i: number) => {
    const c = teinte(e);
    return (
      <button key={e.cle} type="button" className="ag-ev" onClick={() => onVoirEv(e)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 16, border: `1px solid ${c.trait}`, background: c.fond, color: c.encre, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', animationDelay: `${40 + i * 45}ms` }}>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 50, fontVariantNumeric: 'tabular-nums' }}>
          <b style={{ fontFamily: JAK, fontSize: 15 }}>{e.suite ? 'Suite' : hhmm(e.debut)}</b>
          <span style={{ fontSize: 11, opacity: .75 }}>{e.finReelle ? `→ ${JOURS[e.finReelle.getDay()].slice(0, 3)}. ${e.finReelle.getDate()}` : duree(Math.round((e.fin.getTime() - e.debut.getTime()) / 60000))}</span>
        </span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: TYPES[e.type].point, flexShrink: 0 }} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          <b style={{ fontSize: 14, lineHeight: 1.3 }}>{e.titre}</b>
          <span style={{ fontSize: 12, opacity: .8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[e.qui, e.lieu].filter(Boolean).join(' · ')}</span>
        </span>
        {e.crAFaire ? <span style={{ display: 'flex', color: '#8a4b0f' }}><Ic n="note" t={16} /></span> : e.fait ? <span style={{ display: 'flex', opacity: .6 }}><Ic n="coche" t={16} ep={2.6} /></span> : null}
      </button>
    );
  };
  const listeDe = (k: string) => duJour(evs, k);
  /* Aujourd'hui, la ligne rouge de l'ordinateur devient un repère entre ce
     qui est passé et ce qui vient. */
  const cartesDe = (k: string) => {
    const l = listeDe(k);
    const cartes = l.map(carte);
    if (k !== auj || !maintenant || !l.length) return cartes;
    const i = l.findIndex(e => e.debut > maintenant);
    cartes.splice(i === -1 ? cartes.length : i, 0, (
      <div key="maintenant" aria-label={`Il est ${hhmm(maintenant)}`} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '-1px 0' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#d6543c', fontVariantNumeric: 'tabular-nums' }}>{hhmm(maintenant)}</span>
        <span style={{ position: 'relative', flex: 1, height: 2, borderRadius: 2, background: '#d6543c' }}>
          <span style={{ position: 'absolute', left: -1, top: -3, width: 8, height: 8, borderRadius: '50%', background: '#d6543c' }} />
        </span>
      </div>
    ));
    return cartes;
  };
  const debutMois = new Date(dJour.getFullYear(), dJour.getMonth(), 1);
  const debutGrille = lundiDe(debutMois);
  const nbCases = Math.ceil((((debutMois.getDay() + 6) % 7) + new Date(debutMois.getFullYear(), debutMois.getMonth() + 1, 0).getDate()) / 7) * 7;

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ padding: '12px 14px 10px', display: 'flex', flexDirection: 'column', gap: 11, background: 'white', borderBottom: `1px solid ${BORD}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: JAK, fontSize: 10.5, fontWeight: 800, letterSpacing: 1.8, textTransform: 'uppercase', color: OR_FONCE }}>Agenda</div>
            <h1 style={{ margin: 0, fontFamily: JAK, fontSize: 20, fontWeight: 800, letterSpacing: -.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titre}</h1>
          </div>
          <button type="button" aria-label="Période précédente" onClick={() => decaler(-1)} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${BORD}`, background: 'white', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="chevG" t={17} /></button>
          <button type="button" onClick={aujourdhui} style={{ height: 40, padding: '0 12px', borderRadius: 12, border: `1px solid ${BORD}`, background: 'white', color: NAVY, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit' }}>Auj.</button>
          <button type="button" aria-label="Période suivante" onClick={() => decaler(1)} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${BORD}`, background: 'white', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="chevD" t={17} /></button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}><Segment vue={vue} setVue={setVue} largeur={Math.floor((Math.min(typeof window !== 'undefined' ? window.innerWidth : 390, 420) - 36) / 3)} /></div>
        {vue !== 'mois' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
            {semaine.map(k => {
              const d = depuisCle(k), estAuj = k === auj, choisi = k === jour;
              const pts = listeDe(k).slice(0, 4);
              return (
                <button key={k} type="button" onClick={() => { setJour(k); if (vue === 'semaine') setVue('jour'); }} aria-label={maj(jourLong(d))}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '7px 0 6px', borderRadius: 14, border: `1px solid ${choisi ? OR : BORD}`, background: choisi ? '#fffaf0' : 'white', color: NAVY, fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: estAuj ? OR_FONCE : PALE }}>{JOURS[d.getDay()].slice(0, 3)}</span>
                  <span style={{ width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: JAK, fontSize: 15, fontWeight: 800, background: estAuj ? OR : 'transparent' }}>{d.getDate()}</span>
                  <span style={{ display: 'flex', gap: 2, height: 5 }}>{pts.map(e => <span key={e.cle} style={{ width: 5, height: 5, borderRadius: '50%', background: TYPES[e.type].point }} />)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ padding: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 10 }} key={vue + jour} className="ag-vue">
        {vue === 'jour' && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <b style={{ fontFamily: JAK, fontSize: 15 }}>{maj(jourLong(dJour))}</b>
              <span style={{ fontSize: 12, color: DOUX }}>{listeDe(jour).length ? rdv(listeDe(jour).length) : 'Journée libre'}</span>
            </div>
            {taches.filter(t => t.jour === jour).map(t => <div key={t.cle} style={{ display: 'flex' }}><PuceTache t={t} /></div>)}
            {cartesDe(jour)}
            {listeDe(jour).length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '36px 0', color: PALE }}>
                <Ic n="calendrier" t={28} ep={1.6} /><b style={{ color: DOUX, fontSize: 14 }}>Rien de prévu</b>
              </div>
            )}
          </>
        )}
        {vue === 'semaine' && semaine.map(k => {
          const d = depuisCle(k); const l = listeDe(k); const t = taches.filter(x => x.jour === k);
          return (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, color: k === auj ? OR_FONCE : NAVY }}>
                <b style={{ fontFamily: JAK, fontSize: 15 }}>{k === auj ? 'Aujourd’hui' : maj(JOURS[d.getDay()])}</b>
                <span style={{ fontSize: 12, color: PALE }}>{`${numJour(d)} ${MOIS[d.getMonth()]}`}</span>
              </div>
              {t.map(x => <div key={x.cle} style={{ display: 'flex' }}><PuceTache t={x} /></div>)}
              {l.length === 0 && t.length === 0 && <span style={{ fontSize: 12.5, color: PALE }}>Rien de prévu.</span>}
              {cartesDe(k)}
            </div>
          );
        })}
        {vue === 'mois' && (
          <>
            <div style={{ background: 'white', border: `1px solid ${BORD}`, borderRadius: 18, padding: '10px 8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', textAlign: 'center', marginBottom: 4 }}>
                {LETTRES.map(l => <span key={l} style={{ fontSize: 10, fontWeight: 800, color: PALE, textTransform: 'uppercase' }}>{l.slice(0, 1)}</span>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2 }}>
                {Array.from({ length: nbCases }, (_, i) => {
                  const d = plusJours(debutGrille, i); const k = cleDe(d);
                  const pts = listeDe(k).slice(0, 4); const estAuj = k === auj, choisi = k === jour;
                  return (
                    <button key={k} type="button" onClick={() => setJour(k)} aria-label={maj(jourLong(d))}
                      style={{ height: 48, border: 'none', borderRadius: 12, background: 'transparent', boxShadow: choisi && !estAuj ? `inset 0 0 0 1.5px ${NAVY}` : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: d.getMonth() !== dJour.getMonth() ? .45 : 1, color: NAVY, fontFamily: 'inherit' }}>
                      <span style={{ width: 28, height: 28, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: estAuj || choisi ? 800 : 600, background: estAuj ? OR : 'transparent' }}>{d.getDate()}</span>
                      <span style={{ display: 'flex', gap: 2, height: 5 }}>{pts.map(e => <span key={e.cle} style={{ width: 5, height: 5, borderRadius: '50%', background: TYPES[e.type].point }} />)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <b style={{ fontFamily: JAK, fontSize: 15 }}>{maj(jourLong(dJour))}</b>
            {taches.filter(t => t.jour === jour).map(t => <div key={t.cle} style={{ display: 'flex' }}><PuceTache t={t} /></div>)}
            {cartesDe(jour)}
            {listeDe(jour).length === 0 && <span style={{ fontSize: 12.5, color: PALE }}>Rien de prévu ce jour-là.</span>}
          </>
        )}
      </div>

      <BoutonFlottant onClick={onNouveau} />
    </div>
  );
}

/* Le « + » doré, posé sur la page elle-même : un ancêtre animé (transform)
   piégerait un position:fixed. Il se cale au-dessus de la barre d'onglets. */
function BoutonFlottant({ onClick }: { onClick: () => void }) {
  const [monte, setMonte] = useState(false);
  useEffect(() => { setMonte(true); }, []);
  if (!monte) return null;
  return createPortal(
    <button type="button" className="ag-appui" aria-label="Nouveau rendez-vous" onClick={onClick}
      style={{ position: 'fixed', right: 18, bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))', width: 56, height: 56, borderRadius: 18, border: 'none', background: OR, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 28px -12px rgba(201,168,76,.95)', zIndex: 50, cursor: 'pointer' }}>
      <Ic n="plus" t={24} ep={2.4} />
    </button>,
    document.body,
  );
}

/* ══ Créer / modifier un rendez-vous ═══════════════════════════ */

const CHAMP: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 48, padding: '0 14px', borderRadius: 14, border: `1.5px solid ${BORD}`, background: '#fbfcfe', color: NAVY, fontSize: 14, fontWeight: 600, outline: 'none', fontFamily: 'inherit' };
/* Les durées proposées. « Journée » cale aussi le début à 9 h. */
const DUREES: { v: number; lib: string }[] = [
  { v: 30, lib: '30 min' }, { v: 60, lib: '1 h' }, { v: 90, lib: '1 h 30' }, { v: 120, lib: '2 h' },
  { v: 240, lib: 'Demi-journée' }, { v: 540, lib: 'Journée' },
];

function Libelle({ texte, aide }: { texte: string; aide?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: DOUX }}>
      {texte}{aide ? <span style={{ fontWeight: 600, color: PALE, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>{aide}</span> : null}
    </div>
  );
}

function Puces<T extends string | number>({ options, valeur, onChange }: { options: { v: T; lib: string }[]; valeur: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => {
        const actif = o.v === valeur;
        return (
          <button key={String(o.v)} type="button" className="ag-appui" onClick={() => onChange(o.v)} aria-pressed={actif}
            style={{ height: 38, padding: '0 14px', borderRadius: 11, border: `1.5px solid ${actif ? NAVY : BORD}`, background: actif ? NAVY : 'white', color: actif ? 'white' : NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{o.lib}</button>
        );
      })}
    </div>
  );
}

/* ══ Le choix du client ════════════════════════════════════════
   Un champ de recherche plutôt qu'un menu déroulant : avec beaucoup de
   dossiers, on tape trois lettres et on choisit. Sans rien taper, les
   dossiers les plus récents. */
const sansAccent = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const initiales = (nom: string) => nom.split(/\s+/).filter(Boolean).slice(0, 2).map(m => m[0]).join('').toUpperCase() || '?';

function Pastille({ nom, taille = 38 }: { nom: string; taille?: number }) {
  return (
    <span style={{ width: taille, height: taille, borderRadius: taille * .32, background: NAVY, color: OR, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: JAK, fontSize: taille * .36, fontWeight: 800, letterSpacing: .3 }}>{initiales(nom)}</span>
  );
}

function ChoixDossier({ dossiers, valeur, fige, onChange }: { dossiers: Dossier[]; valeur: string; fige: boolean; onChange: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [actif, setActif] = useState(0);
  const choisi = dossiers.find(d => d.rechercheId === valeur) || null;

  if (choisi) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 14, border: `1.5px solid ${OR}`, background: '#fffaf0' }}>
        <Pastille nom={choisi.nom} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{choisi.nom}</b>
          <span style={{ fontSize: 12, color: DOUX, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[choisi.recherche, choisi.resume].filter(Boolean).join(' · ') || 'Recherche en cours'}</span>
        </span>
        {!fige && (
          <button type="button" onClick={() => { onChange(''); setQ(''); }}
            style={{ height: 34, padding: '0 12px', borderRadius: 10, border: `1px solid ${BORD}`, background: 'white', color: NAVY, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Changer</button>
        )}
      </div>
    );
  }

  const t = sansAccent(q.trim());
  const liste = t
    ? dossiers.filter(d => sansAccent(`${d.nom} ${d.recherche} ${d.resume}`).includes(t)).slice(0, 8)
    : [...dossiers].sort((a, b) => b.cree.localeCompare(a.cree)).slice(0, 5);
  const choisir = (d: Dossier) => { onChange(d.rechercheId); setQ(''); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: PALE, display: 'flex', pointerEvents: 'none' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7" /><path d="m20.5 20.5-4.7-4.7" /></svg>
        </span>
        <input className="ag-champ" value={q} autoComplete="off" placeholder="Tape le nom du client…" aria-label="Chercher un client"
          onChange={e => { setQ(e.target.value); setActif(0); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActif(i => Math.min(liste.length - 1, i + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActif(i => Math.max(0, i - 1)); }
            else if (e.key === 'Enter' && liste[actif]) { e.preventDefault(); choisir(liste[actif]); }
          }}
          style={{ ...CHAMP, paddingLeft: 40 }} />
      </div>
      <div role="listbox" aria-label="Dossiers" style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${BORD}`, borderRadius: 14, background: 'white', overflow: 'hidden' }}>
        <span style={{ padding: '8px 12px 4px', fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: PALE }}>{t ? (liste.length ? `${liste.length === 8 ? '8 premiers' : liste.length} résultat${liste.length > 1 ? 's' : ''}` : 'Aucun dossier') : 'Dossiers récents'}</span>
        {t && liste.length === 0 && <span style={{ padding: '4px 12px 12px', fontSize: 12.5, color: DOUX }}>{`Aucun client ne correspond à « ${q.trim()} ».`}</span>}
        {liste.map((d, i) => (
          <button key={d.rechercheId} type="button" role="option" aria-selected={i === actif} onClick={() => choisir(d)} onMouseEnter={() => setActif(i)}
            style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 12px', border: 'none', borderTop: i ? `1px solid ${LIGNE}` : 'none', background: i === actif ? '#f6f8fc' : 'white', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: NAVY }}>
            <Pastille nom={d.nom} taille={34} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.nom}</b>
              <span style={{ fontSize: 11.5, color: DOUX, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[d.plusieurs ? d.recherche : '', d.resume].filter(Boolean).join(' · ') || d.recherche}</span>
            </span>
            {d.emails.length === 0 && <span title="Pas d’adresse mail" style={{ fontSize: 10.5, fontWeight: 700, color: PALE, flexShrink: 0 }}>sans mail</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ══ Les pièces de la fenêtre « Nouveau rendez-vous » ═════════════
   Des sections numérotées qui entrent l'une après l'autre, des champs avec
   leur icône, et des sélecteurs maison pour la date et l'heure : le champ
   du navigateur était minuscule et différent sur chaque appareil. */

function Section({ n, ico, titre, aide, rang, children }: { n: number; ico: string; titre: string; aide?: string; rang: number; children: React.ReactNode }) {
  return (
    <section className="ag-section" style={{ animationDelay: `${60 + rang * 70}ms`, background: 'white', border: `1px solid ${BORD}`, borderRadius: 18, padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 1px 2px rgba(16,24,40,.04), 0 12px 28px -24px rgba(16,24,40,.35)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ position: 'relative', width: 34, height: 34, borderRadius: 11, background: '#fbf4e1', color: OR_FONCE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ic n={ico} t={16} ep={2.1} />
          <span style={{ position: 'absolute', top: -5, right: -5, width: 17, height: 17, borderRadius: '50%', background: NAVY, color: OR, fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: JAK }}>{n}</span>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <b style={{ fontFamily: JAK, fontSize: 15, fontWeight: 800 }}>{titre}</b>
          {aide && <span style={{ fontSize: 12, color: PALE }}>{aide}</span>}
        </span>
      </header>
      {children}
    </section>
  );
}

/* Un champ texte avec son icône à gauche. */
function ChampIcone({ ico, children }: { ico: string; children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 14, top: 14, color: PALE, display: 'flex', pointerEvents: 'none' }}><Ic n={ico} t={17} /></span>
      {children}
    </div>
  );
}

/* Le « champ » de la date ou de l'heure : un gros bouton qui dit la valeur
   en clair, et s'ouvre sur son sélecteur juste dessous. */
function BoutonChamp({ ico, valeur, aide, ouvert, onClick, etiquette }: { ico: string; valeur: string; aide?: string; ouvert: boolean; onClick: () => void; etiquette: string }) {
  return (
    <button type="button" className="ag-champ-bouton" aria-expanded={ouvert} aria-label={etiquette} onClick={onClick} data-ouvert={ouvert || undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 58, padding: '8px 14px 8px 9px', boxSizing: 'border-box', borderRadius: 15, border: `1.5px solid ${ouvert ? OR : BORD}`, background: ouvert ? '#fffaf0' : '#fbfcfe', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: NAVY, boxShadow: ouvert ? '0 0 0 4px rgba(201,168,76,.14)' : 'none' }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: ouvert ? OR : '#fbf4e1', color: ouvert ? NAVY : OR_FONCE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background .2s ease, color .2s ease' }}><Ic n={ico} t={18} ep={2} /></span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
        <b style={{ fontFamily: JAK, fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valeur}</b>
        {aide && <span style={{ fontSize: 12, color: DOUX, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{aide}</span>}
      </span>
      <span className="ag-chevron" style={{ color: PALE, display: 'flex', transform: ouvert ? 'rotate(180deg)' : 'none', transition: 'transform .3s cubic-bezier(.2,.9,.3,1)' }}><Ic n="chevB" t={17} /></span>
    </button>
  );
}

/* Un panneau qui s'ouvre se montre en entier : la fenêtre défile jusqu'à lui. */
function useMontrer<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
    return () => clearTimeout(t);
  }, []);
  return ref;
}

/* Le calendrier : un mois, les jours déjà chargés marqués d'un point, et des
   raccourcis. Choisir un jour referme le panneau. */
function PanneauCalendrier({ valeur, onChoisir, min, occupes }: { valeur: string; onChoisir: (k: string) => void; min?: string; occupes: Record<string, number> }) {
  const [mois, setMois] = useState(() => { const d = depuisCle(valeur || cleDe(new Date())); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const auj = cleDe(new Date());
  const debut = lundiDe(mois);
  const nbCases = Math.ceil((((mois.getDay() + 6) % 7) + new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate()) / 7) * 7;
  const lundiProchain = plusJours(lundiDe(new Date()), 7);
  const raccourcis = [
    { lib: 'Aujourd’hui', k: auj },
    { lib: 'Demain', k: cleDe(plusJours(new Date(), 1)) },
    { lib: 'Lundi prochain', k: cleDe(lundiProchain) },
  ].filter(r => !min || r.k >= min);
  const fl: React.CSSProperties = { width: 34, height: 34, borderRadius: 10, border: `1px solid ${BORD}`, background: 'white', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
  const ref = useMontrer<HTMLDivElement>();
  return (
    <div ref={ref} className="ag-panneau" style={{ border: `1px solid ${BORD}`, borderRadius: 16, background: 'white', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 18px 40px -26px rgba(16,24,40,.45)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {raccourcis.map(r => (
          <button key={r.lib} type="button" className="ag-appui" onClick={() => onChoisir(r.k)}
            style={{ height: 32, padding: '0 12px', borderRadius: 10, border: `1px solid ${r.k === valeur ? OR : BORD}`, background: r.k === valeur ? '#fffaf0' : 'white', color: NAVY, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{r.lib}</button>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flex: '0 0 auto' }}>
          <button type="button" className="ag-appui" aria-label="Mois précédent" onClick={() => setMois(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} style={fl}><Ic n="chevG" t={16} /></button>
          <b style={{ fontFamily: JAK, fontSize: 14, fontWeight: 800, minWidth: 128, textAlign: 'center' }}>{maj(`${MOIS[mois.getMonth()]} ${mois.getFullYear()}`)}</b>
          <button type="button" className="ag-appui" aria-label="Mois suivant" onClick={() => setMois(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} style={fl}><Ic n="chevD" t={16} /></button>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {LETTRES.map(l => <span key={l} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 800, letterSpacing: .6, color: PALE, textTransform: 'uppercase', paddingBottom: 2 }}>{l}</span>)}
        {Array.from({ length: nbCases }, (_, i) => {
          const d = plusJours(debut, i); const k = cleDe(d);
          const hors = d.getMonth() !== mois.getMonth(), choisi = k === valeur, estAuj = k === auj;
          const interdit = !!min && k < min;
          const n = occupes[k] || 0;
          return (
            <button key={k} type="button" className="ag-jour" disabled={interdit} onClick={() => onChoisir(k)} aria-pressed={choisi} aria-label={`${maj(jourLong(d))}${n ? `, ${rdv(n)}` : ''}`}
              style={{ position: 'relative', height: 42, borderRadius: 12, border: estAuj && !choisi ? `1.5px solid ${OR}` : '1.5px solid transparent', background: choisi ? NAVY : 'transparent', color: choisi ? OR : interdit ? '#cfd6e0' : NAVY, opacity: hors && !choisi ? .45 : 1, fontFamily: JAK, fontSize: 14, fontWeight: choisi || estAuj ? 800 : 600, cursor: interdit ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {d.getDate()}
              {n > 0 && <span style={{ position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2 }}>{Array.from({ length: Math.min(3, n) }, (_, j) => <span key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: choisi ? OR : '#9aa7b9' }} />)}</span>}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: 11.5, color: PALE }}>Les points disent combien de rendez-vous ce jour-là.</span>
    </div>
  );
}

/* L'heure : les heures de la journée par moments, puis les minutes. Une
   heure déjà prise ce jour-là porte un point. Choisir les minutes referme. */
function PanneauHeure({ valeur, onChoisir, onFini, prises }: { valeur: string; onChoisir: (h: string) => void; onFini: () => void; prises: Set<number> }) {
  const [hh, mm] = (valeur || '10:00').split(':').map(Number);
  const moments: { lib: string; heures: number[] }[] = [
    { lib: 'Matin', heures: [7, 8, 9, 10, 11, 12] },
    { lib: 'Après-midi', heures: [13, 14, 15, 16, 17] },
    { lib: 'Soir', heures: [18, 19, 20, 21] },
  ];
  const minutes = [0, 15, 30, 45].includes(mm) ? [0, 15, 30, 45] : [0, 15, 30, 45, mm].sort((a, b) => a - b);
  const ref = useMontrer<HTMLDivElement>();
  const puce = (actif: boolean): React.CSSProperties => ({ position: 'relative', height: 40, borderRadius: 11, border: `1.5px solid ${actif ? NAVY : BORD}`, background: actif ? NAVY : 'white', color: actif ? OR : NAVY, fontFamily: JAK, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' });
  return (
    <div ref={ref} className="ag-panneau" style={{ border: `1px solid ${BORD}`, borderRadius: 16, background: 'white', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 18px 40px -26px rgba(16,24,40,.45)' }}>
      {moments.map(m => (
        <div key={m.lib} className="ag-heure-ligne" style={{ display: 'grid', gridTemplateColumns: '92px 1fr', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: PALE }}>{m.lib}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 6 }}>
            {m.heures.map(h => (
              <button key={h} type="button" className="ag-appui" aria-pressed={h === hh} onClick={() => onChoisir(`${pad(h)}:${pad(mm || 0)}`)} title={prises.has(h) ? 'Tu as déjà un rendez-vous à cette heure-là' : undefined} style={puce(h === hh)}>
                {`${h} h`}
                {prises.has(h) && <span style={{ position: 'absolute', top: 5, right: 6, width: 6, height: 6, borderRadius: '50%', background: h === hh ? OR : '#d6543c' }} />}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="ag-heure-ligne" style={{ display: 'grid', gridTemplateColumns: '92px 1fr', alignItems: 'center', gap: 10, paddingTop: 12, borderTop: `1px dashed ${BORD}` }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: PALE }}>Minutes</span>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${minutes.length}, minmax(0, 1fr))`, gap: 6 }}>
          {minutes.map(m => (
            <button key={m} type="button" className="ag-appui" aria-pressed={m === mm} onClick={() => { onChoisir(`${pad(hh)}:${pad(m)}`); onFini(); }} style={puce(m === mm)}>{`${hh} h ${pad(m)}`}</button>
          ))}
        </div>
      </div>
      <span style={{ fontSize: 11.5, color: PALE, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d6543c' }} />déjà un rendez-vous à cette heure-là</span>
    </div>
  );
}

function Interrupteur({ actif, onChange, titre, sous, desactive }: { actif: boolean; onChange: () => void; titre: string; sous: string; desactive?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={actif} onClick={desactive ? undefined : onChange} disabled={desactive}
      style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '12px 14px', borderRadius: 14, border: `1.5px solid ${BORD}`, background: 'white', cursor: desactive ? 'default' : 'pointer', textAlign: 'left', color: NAVY, fontFamily: 'inherit', opacity: desactive ? .55 : 1 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}><b style={{ fontSize: 13.5 }}>{titre}</b><span style={{ fontSize: 12, color: DOUX }}>{sous}</span></span>
      <span style={{ width: 44, height: 26, borderRadius: 26, background: actif ? '#0f8a5f' : '#cbd3df', position: 'relative', flexShrink: 0, transition: 'background .2s ease' }}>
        <span style={{ position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: '50%', background: 'white', boxShadow: '0 2px 5px rgba(16,24,40,.25)', transform: `translateX(${actif ? 18 : 0}px)`, transition: 'transform .25s cubic-bezier(.34,1.4,.5,1)' }} />
      </span>
    </button>
  );
}

const ETAPES: Record<string, string> = { offre: 'Signature de l’offre', compromis: 'Signature du compromis', acte: 'Signature de l’acte' };

/* Le mail au client : court, en clair, sans mot de métier. */
function texteMail(o: { type: TypeRdv; prenom: string; debut: Date; lieu: string; biens: { titre: string; lieu: string }[]; mode: string; etape: string }) {
  const quand = `${jourLong(o.debut)} à ${heureFr(o.debut)}`;
  let objet = '', phrase = '';
  if (o.type === 'visite') {
    /* La liste des biens n'est pas dans le texte : le mail « vos visites »
       la montre dessous, avec photo, adresse et itinéraire. */
    objet = `${o.biens.length > 1 ? `${o.biens.length} visites confirmées` : 'Visite confirmée'} · ${quand}`;
    phrase = o.biens.length > 1
      ? `Je vous confirme nos ${o.biens.length} visites du ${quand}. Le programme est juste en dessous, avec les adresses.`
      : `Je vous confirme notre visite du ${quand}. L’adresse est juste en dessous.`;
    phrase += `\n\nVous ${o.biens.length > 1 ? 'les' : 'la'} retrouverez aussi dans votre espace.`;
  } else if (o.type === 'appel') {
    objet = `${o.mode === 'visio' ? 'Visio' : 'Appel'} prévu · ${quand}`;
    phrase = o.mode === 'visio'
      ? `Notre échange en visio est prévu le ${quand}. Je vous enverrai le lien un peu avant.`
      : `Je vous appellerai le ${quand}, comme convenu.`;
  } else if (o.type === 'signature') {
    const quoi = ({ offre: 'la signature de l’offre', compromis: 'la signature du compromis', acte: 'la signature de l’acte' } as Record<string, string>)[o.etape] || 'la signature';
    objet = `${maj(quoi)} · ${quand}`;
    phrase = `Je vous confirme le rendez-vous pour ${quoi}, le ${quand}${o.lieu ? `, ${o.lieu}` : ''}.`;
  } else {
    objet = `Rendez-vous confirmé · ${quand}`;
    phrase = `Je vous confirme notre rendez-vous du ${quand}${o.lieu ? `, ${o.lieu}` : ''}.`;
  }
  const corps = `Bonjour ${o.prenom},\n\n${phrase}\n\nN'hésitez pas à m'appeler si le moindre changement s'impose.\n\nÀ très vite,\nAlexandre ROGELET\nEmilio Immobilier\n06 58 95 76 32`;
  return { objet: maj(objet), corps };
}

type Formulaire = {
  type: TypeRdv; rechercheId: string; choisis: Record<string, boolean>; date: string; heure: string; duree: number;
  titre: string | null; lieu: string | null; contact: string | null; notes: string; rappel: string; prevenir: boolean;
  mode: string; etape: string; proprietaire: string; telephone: string;
};

function ModaleRdv({ modale, dossiers, relances, tableAbsente, evs, onFerme, onEnregistre }: {
  modale: NonNullable<Modale>; dossiers: Dossier[]; relances: any[]; tableAbsente: boolean; evs: Ev[]; onFerme: () => void; onEnregistre: () => void;
}) {
  const ev = modale.mode === 'modifier' ? modale.ev : null;
  const init = useMemo<Formulaire>(() => {
    if (ev) {
      const minutes = Math.round((ev.fin.getTime() - ev.debut.getTime()) / 60000);
      const rel = ev.relanceId ? relances.find(r => r.id === ev.relanceId) : null;
      let rappel = 'aucun';
      if (rel?.date_echeance) rappel = cleDe(new Date(rel.date_echeance)) === ev.jour ? 'jour' : 'veille';
      return {
        type: ev.type, rechercheId: ev.rechercheId || '', choisis: Object.fromEntries(ev.biens.map(b => [b.id, true])) as Record<string, boolean>,
        date: ev.jour, heure: hhmm(ev.debut), duree: minutes, titre: ev.titre, lieu: ev.lieu,
        contact: ev.contact, notes: ev.notes, rappel, prevenir: false,
        mode: ev.details?.mode || 'tel', etape: ev.details?.etape || 'compromis',
        proprietaire: ev.details?.proprietaire || '', telephone: ev.details?.telephone || '',
      };
    }
    return {
      type: 'visite', rechercheId: modale.mode === 'nouveau' ? modale.rechercheId || '' : '', choisis: {},
      date: modale.mode === 'nouveau' ? modale.jour : cleDe(new Date()), heure: modale.mode === 'nouveau' ? modale.heure : '10:00',
      duree: 60, titre: null, lieu: null, contact: null, notes: '',
      rappel: 'veille', prevenir: false, mode: 'tel', etape: 'compromis', proprietaire: '', telephone: '',
    };
  }, [ev, modale, relances]);
  const [f, setF] = useState<Formulaire>(init);
  const [biens, setBiens] = useState<any[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [monte, setMonte] = useState(false);
  useEffect(() => { setMonte(true); }, []);
  const maj_ = (o: Partial<Formulaire>) => setF(x => ({ ...x, ...o }));
  /* Un seul sélecteur ouvert à la fois : date, heure, ou la fin. */
  const [panneau, setPanneau] = useState<null | 'date' | 'heure' | 'finDate' | 'finHeure'>(null);
  const basculer = (q: 'date' | 'heure' | 'finDate' | 'finHeure') => setPanneau(x => (x === q ? null : q));
  /* « Personnalisé » : la fin se règle à la main, sur plusieurs jours si
     besoin. Ouvert d'office pour un rendez-vous dont la durée ne tombe sur
     aucun des choix proposés. */
  const [perso, setPerso] = useState(() => !DUREES.some(d => d.v === init.duree));

  const dossier = dossiers.find(d => d.rechercheId === f.rechercheId) || null;
  const avecDossier = f.type !== 'perso' && f.type !== 'estimation';

  /* Les biens du dossier : ceux de la Sélection et des Présentés. */
  useEffect(() => {
    if (!f.rechercheId || f.type !== 'visite') { setBiens([]); return; }
    let vivant = true;
    supabase.from('biens').select('id, titre, ville, quartier, adresse, adresse_probable, photos, etape, badge_retour, agence_nom, prix_acquereur, prix_vendeur')
      .eq('recherche_id', f.rechercheId).in('etape', ['selection', 'presente'])
      .then(({ data }) => { if (vivant) setBiens(data || []); });
    return () => { vivant = false; };
  }, [f.rechercheId, f.type]);

  const choisis = biens.filter(b => f.choisis[b.id]);
  const nom = dossier?.nom || '';
  let titreAuto = '', lieuAuto = '';
  if (f.type === 'visite') {
    titreAuto = choisis.length > 1 ? `${choisis.length} visites · ${nom}` : choisis.length === 1 ? `Visite · ${choisis[0].titre || choisis[0].ville || 'bien'}` : (nom ? `Visite · ${nom}` : 'Visite');
    lieuAuto = choisis.length ? lieuDuBien(choisis[0]) : '';
  } else if (f.type === 'client') { titreAuto = nom ? `Rendez-vous · ${nom}` : 'Rendez-vous client'; lieuAuto = 'Agence Emilio'; }
  else if (f.type === 'appel') { titreAuto = `${f.mode === 'visio' ? 'Visio' : 'Appel'}${nom ? ` · ${nom}` : ''}`; lieuAuto = f.mode === 'visio' ? 'Visio' : 'Téléphone'; }
  else if (f.type === 'signature') { titreAuto = `${ETAPES[f.etape]}${nom ? ` · ${nom}` : ''}`; lieuAuto = ''; }
  else if (f.type === 'estimation') { titreAuto = `Estimation${f.proprietaire ? ` · ${f.proprietaire}` : ''}`; lieuAuto = ''; }
  else { titreAuto = 'Créneau bloqué'; lieuAuto = ''; }
  const titre = f.titre !== null ? f.titre : titreAuto;
  const lieu = f.lieu !== null ? f.lieu : lieuAuto;
  const contact = f.contact !== null ? f.contact : (choisis[0]?.agence_nom || '');

  const [hh, mm] = (f.heure || '10:00').split(':').map(Number);
  const debut = depuisCle(f.date || cleDe(new Date())); debut.setHours(hh || 0, mm || 0, 0, 0);
  const fin = new Date(debut.getTime() + f.duree * 60000);
  const surPlusieurs = cleDe(new Date(fin.getTime() - 1)) !== cleDe(debut);
  const changerFin = (k: string, h: string) => {
    const [a, b] = h.split(':').map(Number);
    const x = depuisCle(k); x.setHours(a || 0, b || 0, 0, 0);
    maj_({ duree: Math.max(15, Math.round((x.getTime() - debut.getTime()) / 60000)) });
  };
  const choisirDuree = (v: number) => {
    setPerso(false);
    maj_(v === 540 ? { duree: 540, heure: '09:00' } : { duree: v });
  };
  /* Ce qui est déjà dans l'agenda : un point par jour chargé dans le
     calendrier, un point rouge sur les heures prises, et l'alerte si le
     nouveau rendez-vous en chevauche un autre. */
  const autres = evs.filter(e => !ev || e.cle !== ev.cle);
  const occupes: Record<string, number> = {};
  autres.forEach(e => joursCouverts(e).forEach(k => { occupes[k] = (occupes[k] || 0) + 1; }));
  const duJourChoisi = duJour(autres, f.date || cleDe(new Date()));
  const prises = new Set<number>();
  duJourChoisi.forEach(e => { for (let h = e.debut.getHours(); h < Math.max(e.debut.getHours() + 1, e.fin.getHours() + (e.fin.getMinutes() ? 1 : 0)); h++) prises.add(h); });
  const chevauche = autres.filter(e => e.debut < fin && e.fin > debut).sort((a, b) => a.debut.getTime() - b.debut.getTime());
  const ecartJours = Math.round((depuisCle(f.date || cleDe(new Date())).getTime() - depuisCle(cleDe(new Date())).getTime()) / 86400000);
  const relatif = ecartJours === 0 ? 'Aujourd’hui' : ecartJours === 1 ? 'Demain' : ecartJours === -1 ? 'Hier' : ecartJours > 1 ? `Dans ${ecartJours} jours` : `Il y a ${-ecartJours} jours`;
  const peutPrevenir = avecDossier && !!dossier && dossier.emails.length > 0;
  const mail = peutPrevenir ? texteMail({ type: f.type, prenom: dossier!.prenom, debut, lieu, biens: choisis.map(b => ({ titre: b.titre || b.ville || 'Bien', lieu: lieuDuBien(b) })), mode: f.mode, etape: f.etape }) : null;
  const rdvImpossible = f.type !== 'visite' && tableAbsente;

  const effets: string[] = [`Ajouté à ton agenda le ${jourLong(debut)} à ${hhmm(debut)}.`];
  if (f.type === 'visite') effets.push('Visible aussi dans la page Visites et dans l’espace du client.');
  if (avecDossier && dossier) effets.push(`Noté dans le suivi du dossier de ${dossier.nom}.`);
  /* Le rappel tombe à midi, la veille ou le jour même. Une veille déjà
     passée (rendez-vous pris pour aujourd'hui) devient aujourd'hui : sinon
     il arriverait directement « en retard » dans les Relances. */
  const quandRappel = new Date(debut);
  if (f.rappel === 'veille') quandRappel.setDate(quandRappel.getDate() - 1);
  quandRappel.setHours(12, 0, 0, 0);
  const rappelRamene = cleDe(quandRappel) < cleDe(new Date());
  if (rappelRamene) { const a = new Date(); a.setHours(12, 0, 0, 0); quandRappel.setTime(a.getTime()); }
  if (avecDossier && dossier && f.rappel !== 'aucun') {
    effets.push(`Un rappel t’attend dans tes Relances ${rappelRamene ? 'dès aujourd’hui' : f.rappel === 'veille' ? 'la veille' : 'le jour même'}.`);
  }
  if (f.prevenir && mail) effets.push(`${dossier!.prenom} reçoit un mail de confirmation.`);

  async function enregistrer() {
    if (!f.date || !f.heure) { alert('Indique la date et l’heure.'); return; }
    if (avecDossier && !dossier && !(ev && ev.source === 'visite')) { alert('Choisis le dossier du client.'); return; }
    if (f.type === 'visite' && !ev && !choisis.length) { alert('Coche au moins un bien à visiter.'); return; }
    if (!titre.trim()) { alert('Donne un titre au rendez-vous.'); return; }
    if (rdvImpossible) { alert('Lance d’abord le SQL de l’agenda dans Supabase (agenda-rendez-vous.sql).'); return; }
    setEnvoi(true);
    const jourTxt = `${jourLong(debut)} à ${hhmm(debut)}`;

    /* 1. Le rappel, dans les Relances. */
    let relanceId: string | null = ev?.relanceId || null;
    let relanceNeuve: string | null = null;
    let visitesCreees: string[] = [];
    if (avecDossier && dossier) {
      const quand = quandRappel;
      const note = `Rendez-vous : ${titre} · ${jourTxt}`;
      if (relanceId && f.rappel === 'aucun') {
        const r = await supabase.from('relances').update({ statut: 'cloturee' }).eq('id', relanceId);
        if (r.error) { setEnvoi(false); alert("Le rappel n'a pas pu être retiré.\n\n" + r.error.message); return; }
        relanceId = null;
      } else if (relanceId) {
        const r = await supabase.from('relances').update({ date_echeance: quand.toISOString(), note }).eq('id', relanceId);
        if (r.error) { setEnvoi(false); alert("Le rappel n'a pas pu être déplacé.\n\n" + r.error.message); return; }
      } else if (f.rappel !== 'aucun') {
        const { data, error } = await supabase.from('relances').insert({
          client_id: dossier.clientId, recherche_id: dossier.rechercheId, type: 'manuelle', statut: 'en_attente',
          date_echeance: quand.toISOString(), note,
        }).select('id').single();
        if (error) { setEnvoi(false); alert("Le rappel n'a pas pu être créé.\n\n" + error.message); return; }
        relanceId = data?.id || null;
        relanceNeuve = relanceId;
      }
    }
    /* Si le rendez-vous échoue, le rappel qu'on vient de poser ne doit pas
       rester seul dans les Relances. */
    const echec = async (texte: string) => {
      if (relanceNeuve) await supabase.from('relances').delete().eq('id', relanceNeuve);
      setEnvoi(false); alert(texte);
    };

    /* 2. Le rendez-vous lui-même. */
    if (f.type === 'visite') {
      if (ev) {
        const { error } = await supabase.from('visites').update({
          date_visite: f.date, heure: f.heure, duree_min: f.duree, contact_agence: contact || null, commentaire: f.notes || null, rappel_relance_id: relanceId,
        }).in('id', ev.ids);
        if (error) { await echec("La visite n'a pas pu être modifiée.\n\n" + error.message); return; }
      } else {
        const { data: creees, error } = await supabase.from('visites').insert(choisis.map(b => ({
          client_id: dossier!.clientId, recherche_id: dossier!.rechercheId, bien_id: b.id, statut: 'a_venir',
          date_visite: f.date, heure: f.heure, duree_min: f.duree, contact_agence: contact || null,
          commentaire: f.notes || null, rappel_relance_id: relanceId,
        }))).select('id');
        visitesCreees = (creees || []).map((x: any) => x.id);
        if (error) {
          await echec("La visite n'a pas pu être créée.\n\n" + error.message + (/duree_min|rappel_relance_id/.test(error.message) ? '\n\nLance d’abord le SQL de l’agenda dans Supabase (agenda-rendez-vous.sql).' : ''));
          return;
        }
        /* Comme depuis la fiche : le bien passe en « veut visiter », sauf
           s'il est déjà plus loin (visité, offre faite). */
        const aMarquer = choisis.filter(b => !['visite', 'offre_faite'].includes(b.badge_retour)).map(b => b.id);
        if (aMarquer.length) {
          const r = await supabase.from('biens').update({ badge_retour: 'souhaite_visiter' }).in('id', aMarquer);
          if (r.error) alert("La visite est enregistrée, mais le bien n'a pas pu passer en « veut visiter ».\n\n" + r.error.message);
        }
        await addJournal(dossier!.clientId, 'visite_planifiee',
          choisis.length > 1 ? `📅 Visite planifiée — ${choisis.length} biens : ${choisis.map(b => b.titre || b.ville).join(' · ')}` : `📅 Visite planifiée — ${choisis[0].titre || choisis[0].ville || ''}`,
          `Le ${debut.toLocaleDateString('fr-FR')} à ${f.heure}${contact ? ` · Contact : ${contact}` : ''}`);
      }
    } else {
      const ligne = {
        type: f.type, titre: titre.trim(), debut: debut.toISOString(), fin: fin.toISOString(), lieu: lieu || null, notes: f.notes || null,
        client_id: avecDossier ? dossier?.clientId || null : null, recherche_id: avecDossier ? dossier?.rechercheId || null : null,
        details: { mode: f.type === 'appel' ? f.mode : undefined, etape: f.type === 'signature' ? f.etape : undefined, proprietaire: f.type === 'estimation' ? f.proprietaire || undefined : undefined, telephone: f.type === 'estimation' ? f.telephone || undefined : undefined },
        relance_id: relanceId,
      };
      const { error } = ev
        ? await supabase.from('rendez_vous').update(ligne).in('id', ev.ids)
        : await supabase.from('rendez_vous').insert(ligne);
      if (error) { await echec("Le rendez-vous n'a pas pu être enregistré.\n\n" + error.message); return; }
      if (!ev && avecDossier && dossier) await addJournal(dossier.clientId, 'rdv_planifie', `📅 ${titre.trim()}`, `Le ${debut.toLocaleDateString('fr-FR')} à ${f.heure}${lieu ? ` · ${lieu}` : ''}`);
    }

    /* 3. Le mail au client. Le rendez-vous est déjà enregistré : un échec ici
       ne l'annule pas, on le dit simplement. */
    const idsVisites = f.type === 'visite' ? (ev ? ev.ids : visitesCreees) : [];
    if (f.prevenir && mail && dossier && idsVisites.length) {
      /* Une visite : le mail « vos visites » (photo, adresse, itinéraire),
         qui note aussi la date d'envoi sur chaque visite. */
      const r = await envoyerMailVisites({ clientId: dossier.clientId, rechercheId: dossier.rechercheId, visitesIds: idsVisites, objet: mail.objet, corps: mail.corps });
      if (r.erreur) alert(`La visite est bien enregistrée, mais le mail n'est pas parti.\n\n${r.erreur}\n\nTu peux le renvoyer depuis la page Visites.`);
      else if (r.avertissement) alert(`La visite est enregistrée et le mail est parti, mais sa date n'a pas pu être notée.\n\nLance le SQL rappel-visites.sql dans Supabase.`);
    } else if (f.prevenir && mail && dossier) {
      try {
        const res = await fetch('/api/send-mail', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_ids: [dossier.clientId], recherche_id: dossier.rechercheId, objet: mail.objet, corps: mail.corps, mode: 'libre' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) alert(`Le rendez-vous est bien enregistré, mais le mail n'est pas parti.\n\n${data.error || (data.results || []).find((r: any) => !r.success)?.error || 'Erreur inconnue'}`);
      } catch (e) {
        alert(`Le rendez-vous est bien enregistré, mais le mail n'est pas parti.\n\n${(e as Error).message}`);
      }
    }
    setEnvoi(false);
    onEnregistre();
  }

  /* Un clic à côté, ou la touche Échap, ne ferme PAS la fenêtre : ce qui
     était commencé serait perdu. Seuls ✕ et « Annuler » la ferment. La
     fenêtre bouge un peu et le pied de page le rappelle. */
  const [retenue, setRetenue] = useState(0);
  const feuille = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!retenue) return;
    /* Relancer la secousse à chaque clic, sans redessiner le formulaire. */
    const el = feuille.current;
    if (el) { el.removeAttribute('data-retenue'); void el.offsetWidth; el.setAttribute('data-retenue', ''); }
    const t = setTimeout(() => setRetenue(0), 2600);
    return () => clearTimeout(t);
  }, [retenue]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setRetenue(Date.now()); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, []);
  if (!monte) return null;

  const typesDispo = ev ? (ev.source === 'visite' ? ['visite'] as TypeRdv[] : ORDRE.filter(t => t !== 'visite')) : ORDRE;

  return createPortal(
    <div className="ag-voile ag-modale-fond" style={{ position: 'fixed', inset: 0, zIndex: 9995, background: 'rgba(14,20,30,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'DM Sans', system-ui, sans-serif", color: NAVY }}
      onClick={e => { if (e.target === e.currentTarget) setRetenue(Date.now()); }}>
      <StylesAgenda />
      <style>{`
        @keyframes agRetenue{0%,100%{transform:none}20%{transform:translateX(-7px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(2px)}}
        .ag-modale[data-retenue]{animation:agRetenue .42s ease both !important}
        @media (prefers-reduced-motion: reduce){.ag-modale[data-retenue]{animation:none !important}}
        @media (max-width: 760px){
          .ag-modale-fond{padding:0 !important;align-items:flex-end !important}
          .ag-modale{border-radius:22px 22px 0 0 !important;max-height:96dvh !important;height:auto !important}
          .ag-modale-corps{flex-direction:column !important;overflow-y:auto !important}
          .ag-modale-apercu{width:auto !important;border-left:none !important;border-top:1px solid ${BORD};flex:none !important;overflow:visible !important}
          .ag-modale-form{flex:none !important;overflow:visible !important;padding:14px 12px 20px !important}
          .ag-quand{grid-template-columns:1fr !important}
          .ag-modale-types{grid-template-columns:repeat(2, minmax(0, 1fr)) !important}
          .ag-modale-pied{padding-bottom:calc(14px + env(safe-area-inset-bottom, 0px)) !important}
          .ag-modale-pied > span{flex-basis:100% !important}
          .ag-modale-pied > button{flex:1 1 0}
        }
      `}</style>
      <section ref={feuille} className="ag-modale ag-feuille" role="dialog" aria-modal="true" aria-label={ev ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}
        style={{ width: '100%', maxWidth: 1040, height: 'min(820px, 94dvh)', background: 'white', borderRadius: 24, boxShadow: '0 40px 100px -30px rgba(10,15,24,.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', background: NAVY, color: 'white', flexShrink: 0 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(201,168,76,.16)', color: OR, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="calendrier" t={19} ep={1.9} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.6, textTransform: 'uppercase', color: OR }}>Agenda</div>
            <b style={{ fontFamily: JAK, fontSize: 19, fontWeight: 800 }}>{ev ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}</b>
          </div>
          <button type="button" aria-label="Fermer" onClick={onFerme} style={{ width: 38, height: 38, borderRadius: 11, border: 'none', background: 'rgba(255,255,255,.1)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Ic n="fermer" t={15} /></button>
        </header>

        <div className="ag-modale-corps" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <div className="ag-modale-form" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '18px 20px 26px', display: 'flex', flexDirection: 'column', gap: 14, background: '#f5f7fa' }}>
            <Section n={1} ico="calendrier" titre="Quel rendez-vous" rang={0}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="ag-modale-types" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  {typesDispo.map(k => {
                    const t = TYPES[k], actif = f.type === k;
                    return (
                      <button key={k} type="button" className="ag-appui" aria-pressed={actif}
                        onClick={() => maj_({ type: k, titre: null, lieu: null, duree: k === 'appel' ? 30 : k === 'visite' || k === 'signature' ? 60 : f.duree })}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, height: 50, padding: '0 12px', borderRadius: 14, border: `1.5px solid ${actif ? t.point : BORD}`, background: actif ? t.fond : 'white', color: actif ? t.encre : NAVY, cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', boxShadow: actif ? `0 10px 22px -16px ${t.point}` : 'none' }}>
                        <span style={{ width: 30, height: 30, borderRadius: 9, background: actif ? t.point : '#f1f4f8', color: actif ? 'white' : DOUX, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n={t.ico} t={16} /></span>
                        {t.nom}
                      </button>
                    );
                  })}
                </div>
                {rdvImpossible && <span style={{ fontSize: 12.5, color: '#92400e' }}>Ce type de rendez-vous s’enregistrera une fois le SQL de l’agenda lancé dans Supabase.</span>}
              </div>
              {f.type === 'appel' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><Libelle texte="Comment" /><Puces options={[{ v: 'tel', lib: 'Téléphone' }, { v: 'visio', lib: 'Visio' }]} valeur={f.mode} onChange={v => maj_({ mode: v, titre: null, lieu: null })} /></div>
              )}
              {f.type === 'signature' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><Libelle texte="Quelle signature" /><Puces options={[{ v: 'offre', lib: 'Offre' }, { v: 'compromis', lib: 'Compromis' }, { v: 'acte', lib: 'Acte' }]} valeur={f.etape} onChange={v => maj_({ etape: v, titre: null })} /></div>
              )}
              {f.type === 'estimation' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Libelle texte="Propriétaire" /><input className="ag-champ" value={f.proprietaire} onChange={e => maj_({ proprietaire: e.target.value, titre: null })} placeholder="M. et Mme Roche" style={CHAMP} aria-label="Propriétaire" /></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Libelle texte="Téléphone" /><input className="ag-champ" value={f.telephone} onChange={e => maj_({ telephone: e.target.value })} placeholder="06 …" style={CHAMP} aria-label="Téléphone du propriétaire" /></div>
                </div>
              )}
            </Section>

            {avecDossier && (
              <Section n={2} ico="personne" titre="Pour quel client" aide="Le rendez-vous se range dans sa fiche." rang={1}>
                <ChoixDossier dossiers={dossiers} valeur={f.rechercheId} fige={!!ev && ev.source === 'visite'}
                  onChange={id => maj_({ rechercheId: id, choisis: {}, titre: null, lieu: null, contact: null })} />
              {f.type === 'visite' && dossier && !ev && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Libelle texte="Biens à visiter" aide={choisis.length ? `${choisis.length} choisi${choisis.length > 1 ? 's' : ''} · Sélection et Présentés` : 'Sélection et Présentés'} />
                  {biens.length === 0 && <span style={{ fontSize: 12.5, color: PALE }}>Ce dossier n’a pas encore de bien en Sélection ou en Présentés.</span>}
                  {biens.map(b => {
                    const actif = !!f.choisis[b.id];
                    const prix = b.prix_acquereur || b.prix_vendeur;
                    return (
                      <button key={b.id} type="button" className="ag-appui" aria-pressed={actif}
                        onClick={() => maj_({ choisis: { ...f.choisis, [b.id]: !actif }, titre: null, lieu: null, contact: null })}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 12px 7px 7px', borderRadius: 14, border: `1.5px solid ${actif ? OR : BORD}`, background: actif ? '#fffaf0' : 'white', cursor: 'pointer', textAlign: 'left', color: NAVY, fontFamily: 'inherit' }}>
                        <span style={{ width: 54, height: 42, borderRadius: 9, overflow: 'hidden', background: '#eef2f8', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b6c1d1' }}>
                          {b.photos?.[0] ? <img src={b.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Ic n="maison" t={16} />}
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
                          <b style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.titre || b.ville || 'Bien'}</b>
                          <span style={{ fontSize: 12, color: DOUX }}>{[prix ? `${Number(prix).toLocaleString('fr-FR')} €` : '', b.etape === 'presente' ? 'Présenté' : 'En sélection'].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span style={{ width: 22, height: 22, boxSizing: 'border-box', borderRadius: 7, border: `1.5px solid ${actif ? OR : '#c3ccda'}`, background: actif ? OR : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>{actif && <Ic n="coche" t={13} ep={3} />}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {f.type === 'visite' && (dossier || ev) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Libelle texte="Contact sur place" aide="l’agence ou le vendeur" />
                  <ChampIcone ico="tel">
                    <input className="ag-champ" value={contact} onChange={e => maj_({ contact: e.target.value })} placeholder="Agence du Parc · M. Lambert, 06 …" style={{ ...CHAMP, paddingLeft: 42 }} aria-label="Contact sur place" />
                  </ChampIcone>
              </div>
            )}
              </Section>
            )}

            <Section n={avecDossier ? 3 : 2} ico="horloge" titre="Quand" rang={2}
              aide={surPlusieurs ? `Du ${jourLong(debut)} à ${hhmm(debut)} au ${jourLong(fin)} à ${hhmm(fin)}` : `${maj(jourLong(debut))}, de ${hhmm(debut)} à ${hhmm(fin)}`}>
              <div className="ag-quand" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                <BoutonChamp ico="calendrier" etiquette="Date" ouvert={panneau === 'date'} onClick={() => basculer('date')}
                  valeur={maj(jourLong(debut))} aide={relatif} />
                <BoutonChamp ico="horloge" etiquette="Heure" ouvert={panneau === 'heure'} onClick={() => basculer('heure')}
                  valeur={heureFr(debut)} aide={surPlusieurs ? 'heure de début' : `jusqu’à ${heureFr(fin)}`} />
              </div>
              {panneau === 'date' && <PanneauCalendrier valeur={f.date} occupes={occupes} onChoisir={k => { maj_({ date: k }); setPanneau(null); }} />}
              {panneau === 'heure' && <PanneauHeure valeur={f.heure} prises={prises} onChoisir={h => maj_({ heure: h })} onFini={() => setPanneau(null)} />}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Libelle texte="Durée" aide={surPlusieurs ? `sur ${joursCouverts({ debut, fin, jour: cleDe(debut) } as Ev).length} jours` : `fin à ${hhmm(fin)}`} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {DUREES.map(o => {
                    const actif = !perso && o.v === f.duree;
                    return (
                      <button key={o.v} type="button" className="ag-appui" onClick={() => choisirDuree(o.v)} aria-pressed={actif}
                        style={{ height: 40, padding: '0 15px', borderRadius: 12, border: `1.5px solid ${actif ? NAVY : BORD}`, background: actif ? NAVY : 'white', color: actif ? 'white' : NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{o.lib}</button>
                    );
                  })}
                  <button type="button" className="ag-appui" aria-pressed={perso} onClick={() => { setPerso(true); setPanneau(null); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 15px', borderRadius: 12, border: `1.5px ${perso ? 'solid' : 'dashed'} ${perso ? OR : '#c9d2de'}`, background: perso ? '#fffaf0' : 'white', color: perso ? '#8a6a1f' : NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Ic n="crayon" t={14} />Personnalisé
                  </button>
                </div>
              </div>

              {perso && (
                <div className="ag-panneau" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 16, background: '#fffaf0', border: '1px solid #f0e2bd' }}>
                  <Libelle texte="Fin" aide="sur plusieurs jours si besoin" />
                  <div className="ag-quand" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    <BoutonChamp ico="calendrier" etiquette="Date de fin" ouvert={panneau === 'finDate'} onClick={() => basculer('finDate')}
                      valeur={maj(jourLong(fin))} aide={surPlusieurs ? `${joursCouverts({ debut, fin, jour: cleDe(debut) } as Ev).length} jours` : 'le même jour'} />
                    <BoutonChamp ico="horloge" etiquette="Heure de fin" ouvert={panneau === 'finHeure'} onClick={() => basculer('finHeure')}
                      valeur={heureFr(fin)} aide={`durée : ${dureeLongue(f.duree)}`} />
                  </div>
                  {panneau === 'finDate' && <PanneauCalendrier valeur={cleDe(fin)} min={f.date} occupes={occupes} onChoisir={k => { changerFin(k, hhmm(fin)); setPanneau(null); }} />}
                  {panneau === 'finHeure' && <PanneauHeure valeur={hhmm(fin)} prises={new Set()} onChoisir={h => changerFin(cleDe(fin), h)} onFini={() => setPanneau(null)} />}
                </div>
              )}

              {chevauche.length > 0 && (
                <div className="ag-panneau" role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 13, background: '#fff4ed', border: '1px solid #f6d3bd', color: '#9a3412', fontSize: 12.5, lineHeight: 1.45 }}>
                  <span style={{ display: 'flex', flexShrink: 0, marginTop: 1 }}><Ic n="alerte" t={16} /></span>
                  <span>{`Ça chevauche ${chevauche.length > 1 ? `${chevauche.length} rendez-vous` : 'un rendez-vous'} : ${chevauche.slice(0, 2).map(e => `${e.titre} (${hhmm(e.debut)} – ${hhmm(e.fin)})`).join(', ')}.`}</span>
                </div>
              )}
            </Section>

            <Section n={avecDossier ? 4 : 3} ico="crayon" titre="Titre, lieu et notes" rang={3}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Libelle texte="Titre" aide="proposé tout seul, tu peux le changer" />
                <ChampIcone ico="crayon">
                  <input className="ag-champ" value={titre} onChange={e => maj_({ titre: e.target.value })} style={{ ...CHAMP, paddingLeft: 42, fontSize: 15, fontWeight: 700 }} aria-label="Titre" />
                </ChampIcone>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Libelle texte="Lieu" aide={f.type === 'visite' && choisis.length ? 'repris du bien' : undefined} />
                <ChampIcone ico="lieu">
                  <input className="ag-champ" value={lieu} onChange={e => maj_({ lieu: e.target.value })} placeholder="Adresse, agence, visio…" style={{ ...CHAMP, paddingLeft: 42, opacity: f.type === 'visite' ? .8 : 1 }} aria-label="Lieu" disabled={f.type === 'visite'} />
                </ChampIcone>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Libelle texte="Notes" aide="pour toi seul, le client ne les voit pas" />
                <ChampIcone ico="note">
                  <textarea className="ag-champ" rows={3} value={f.notes} onChange={e => maj_({ notes: e.target.value })} placeholder="Code d’entrée, étage, points à vérifier sur place…" aria-label="Notes"
                    style={{ ...CHAMP, height: 'auto', minHeight: 92, padding: '13px 14px 13px 42px', lineHeight: 1.5, resize: 'vertical', fontWeight: 500 }} />
                </ChampIcone>
              </div>
            </Section>

            {avecDossier && dossier && (
              <Section n={5} ico="cloche" titre="Rappel et client" rang={4}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Libelle texte="Me le rappeler" aide="dans tes Relances" />
                  <Puces options={[{ v: 'aucun', lib: 'Aucun rappel' }, { v: 'veille', lib: 'La veille' }, { v: 'jour', lib: 'Le jour même' }]} valeur={f.rappel} onChange={v => maj_({ rappel: v })} />
                </div>
                <Interrupteur actif={f.prevenir && peutPrevenir} onChange={() => maj_({ prevenir: !f.prevenir })} desactive={!peutPrevenir}
                  titre={`Prévenir ${dossier.prenom} par mail`}
                  sous={!peutPrevenir ? 'Pas d’adresse mail dans sa fiche' : f.prevenir ? 'Un mail de confirmation part à l’enregistrement' : f.type === 'visite' ? 'Rien ne part. Tu pourras envoyer le rappel plus tard, depuis Visites' : 'Rien ne part : allume-le pour envoyer une confirmation'} />
              </Section>
            )}
          </div>

          <aside className="ag-modale-apercu" style={{ width: 340, flexShrink: 0, boxSizing: 'border-box', background: 'white', borderLeft: `1px solid ${BORD}`, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Etiquette>Aperçu</Etiquette>
              <b style={{ fontFamily: JAK, fontSize: 15 }}>{maj(jourLong(debut))}</b>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 14, background: TYPES[f.type].fond, border: `1.5px solid ${TYPES[f.type].point}`, color: TYPES[f.type].encre, display: 'flex', flexDirection: 'column', gap: 3, transition: 'background-color .3s ease, border-color .3s ease' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 800 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: TYPES[f.type].point }} />{surPlusieurs ? `${JOURS[debut.getDay()].slice(0, 3)}. ${debut.getDate()}, ${hhmm(debut)} → ${JOURS[fin.getDay()].slice(0, 3)}. ${fin.getDate()}, ${hhmm(fin)}` : `${hhmm(debut)} – ${hhmm(fin)}`}
              </span>
              <b style={{ fontSize: 14, lineHeight: 1.3 }}>{titre || '—'}</b>
              {lieu && <span style={{ fontSize: 12, opacity: .85 }}>{lieu}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <Etiquette>À l’enregistrement</Etiquette>
              {effets.map(x => (
                <div key={x} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, lineHeight: 1.45 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 7, background: '#e5f4ec', color: '#0f8a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="coche" t={13} ep={3} /></span>
                  <span>{x}</span>
                </div>
              ))}
            </div>
            {f.prevenir && mail && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 16, background: 'white', border: `1px solid ${BORD}` }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: DOUX }}><Ic n="mail" t={14} />{`Ce que reçoit ${dossier!.prenom}`}</span>
                <b style={{ fontSize: 13.5, lineHeight: 1.4 }}>{mail.objet}</b>
                <span style={{ fontSize: 12.5, color: DOUX, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{mail.corps}</span>
                {f.type === 'visite' && choisis.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 10, borderTop: `1px dashed ${BORD}` }}>
                    {choisis.map(b => (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        {b.photos?.[0] ? <img src={b.photos[0]} alt="" style={{ width: 40, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} /> : <span style={{ width: 40, height: 32, borderRadius: 6, background: NAVY, flexShrink: 0 }} />}
                        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <b style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${heureFr(debut)} · ${b.titre || b.ville || 'Bien'}`}</b>
                          <span style={{ fontSize: 11.5, color: PALE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lieuDuBien(b) || 'Pas d’adresse sur le bien'}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>

        <footer className="ag-modale-pied" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '14px 24px', borderTop: `1px solid ${BORD}`, background: '#fbfcfe', flexShrink: 0 }}>
          <span role="status" style={{ fontSize: 12.5, color: retenue ? '#b45309' : DOUX, fontWeight: retenue ? 700 : 400, flex: '1 1 200px' }}>{retenue ? 'Pour fermer sans enregistrer, appuie sur Annuler.' : avecDossier && dossier ? `Rangé dans le dossier de ${dossier.nom}.` : avecDossier ? 'Choisis le dossier du client.' : 'Rendez-vous sans dossier client.'}</span>
          <button type="button" onClick={onFerme} style={{ height: 44, padding: '0 18px', borderRadius: 12, border: `1px solid ${BORD}`, background: 'white', color: DOUX, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
          <button type="button" onClick={enregistrer} disabled={envoi}
            style={{ height: 44, padding: '0 22px', borderRadius: 12, border: 'none', background: OR, color: NAVY, fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: envoi ? 'default' : 'pointer', fontFamily: 'inherit', opacity: envoi ? .7 : 1, boxShadow: '0 12px 24px -12px rgba(201,168,76,.95)' }}>
            <Ic n="coche" t={16} ep={2.6} />{envoi ? 'Enregistrement…' : ev ? 'Enregistrer les changements' : 'Enregistrer dans l’agenda'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
