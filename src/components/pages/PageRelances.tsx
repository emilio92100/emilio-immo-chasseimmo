'use client';
import { useState, useEffect, useRef } from 'react';
import AvatarContact from '@/components/contacts/AvatarContact';
import { supabase, addJournal } from '@/lib/supabase';
import { delaiRelance, echeanceDans, estTri, NOTE_TRI, cloreRelancesArchive } from '@/lib/relances';
import { signalerEchec, verifie } from '@/lib/ecritures';
import { signalerMaj, demanderOuvertureFiche, ouvertureDepuisRelance, demanderOngletBien } from '@/lib/intentions';
import { chargerAlertesRappro, mandatVu, plusTardAcheteur, type AlerteRappro } from '@/lib/alertes-rappro';
import ChoixDate from '@/components/shared/ChoixDate';
import FenetreAction from '@/components/contacts/FenetreAction';
import EnteteRubrique from '@/components/shared/EnteteRubrique';

/*
 * Les relances : qui recontacter, et quand.
 *
 * En haut, trois compteurs qui servent aussi de filtres (en retard,
 * aujourd'hui, cette semaine). Dessous, les relances rangées par échéance,
 * jusqu'à la fin de la semaine seulement (V3.71, Alexandre : « pas la peine
 * d'inonder l'onglet ») ; plus loin, une période à choisir : les 30 ou 60
 * prochains jours, un jour précis, ou entre deux dates. Chacune
 * avec son origine (biens présentés, un appel, une note, un message du
 * client…). « Ouvrir la fiche » arrive au bon endroit : l'onglet Présentés
 * pour une relance automatique, le Suivi sur l'action qui l'a créée sinon.
 *
 * V3.73 — « Tri à faire » : les contacts repris d'ImmoFacile sans nouvelles
 * depuis longtemps (NOTE_TRI). Un bloc à part, sous les relances : ils ne
 * comptent ni dans les trois compteurs ni dans les pastilles. Après l'appel,
 * « C'est fait » (il reste) ou « Archiver » (il quitte la liste, retrouvable
 * dans « Archivés »).
 *
 * V3.74 — « Traiter » : noter ce qui s'est passé sans quitter la page
 * (FenetreAction : appel passé, a répondu ou messagerie, les détails, une
 * prochaine relance). Valider écrit la ligne dans le Suivi du client, clôt la
 * relance, et la ligne s'efface ; on passe à la suivante.
 */

const NAVY = '#34496e', OR = '#c9a84c', OR_FONCE = '#8a6a1f', BORD = '#e3e8f0', LIGNE = '#eef1f6';
const DOUX = '#5b6678', PALE = '#8d99ab';
const JAK = "'Plus Jakarta Sans', system-ui, sans-serif";
/* Le temps qu'une ligne met à glisser et à se replier (V3.74), avant de
   quitter la liste pour de bon : la suivante remonte sans saut. */
const REPLI = 520;

/* ── Icônes dessinées ─────────────────────────────────────────── */
const TR: Record<string, string[]> = {
  cloche: ['M6.2 16.8V11a5.8 5.8 0 0 1 11.6 0v5.8l1.7 2H4.5z', 'M10 21.2h4'],
  alerte: ['M12 9v4.2', 'M12 17.2h.01', 'M10.3 3.9 2.4 17.6A1.9 1.9 0 0 0 4 20.5h16a1.9 1.9 0 0 0 1.6-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0z'],
  calendrier: ['M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  soleil: ['c:12,12,4', 'M12 2.5v2', 'M12 19.5v2', 'M4.6 4.6 6 6', 'M18 18l1.4 1.4', 'M2.5 12h2', 'M19.5 12h2', 'M4.6 19.4 6 18', 'M18 6l1.4-1.4'],
  coche: ['m4 12.5 5 5L20 6.5'],
  fleche: ['M5 12h14', 'm13 6 6 6-6 6'],
  horloge: ['c:12,12,9', 'M12 7.5V12l3 2'],
  envoi: ['M21.5 2.5 10.8 13.2', 'M21.5 2.5 15 21.5l-4.2-8.3-8.3-4.2z'],
  tel: ['M5.2 3.5h3.2l1.6 4.2-2.1 1.3a12.6 12.6 0 0 0 7.1 7.1l1.3-2.1 4.2 1.6v3.2a1.9 1.9 0 0 1-2.1 1.9A17 17 0 0 1 3.3 5.6a1.9 1.9 0 0 1 1.9-2.1z'],
  note: ['M6 3.5h9l4 4v13H6z', 'M14.5 3.5v4.5H19', 'M9 12.5h6', 'M9 16h4'],
  personne: ['c:12,8,4', 'M4.5 20a7.5 7.5 0 0 1 15 0'],
  mail: ['M3 7.2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'm3.6 7.6 8.4 5.8 8.4-5.8'],
  bulle: ['M4 5.5h16v10H9l-5 4z'],
  report: ['M4 12a8 8 0 1 0 2.4-5.7', 'M4 4v4.5h4.5'],
  fermer: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  oeil: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'c:12,12,3'],
  euro: ['M17 6.5A6.5 6.5 0 0 0 7.5 12 6.5 6.5 0 0 0 17 17.5', 'M4 10.5h8', 'M4 13.5h8'],
  groupe: ['c:9,8,3.2', 'M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6', 'c:17,9,2.6', 'M16 14.2c2.8.3 5 2.6 5 5.8'],
  drapeau: ['M5 3v18', 'M5 5h13l-2 4 2 4H5'],
  archive: ['M3.5 4.5h17v4h-17z', 'M5 8.5v10.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5', 'M10 12.5h4'],
};
function Ic({ n, t = 16, ep = 2 }: { n: string; t?: number; ep?: number }) {
  const traits = TR[n];
  if (!traits) return null;
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ep} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      {traits.map((d, i) => {
        if (d.startsWith('c:')) { const [cx, cy, r] = d.slice(2).split(',').map(Number); return <circle key={i} cx={cx} cy={cy} r={r} />; }
        return <path key={i} d={d} />;
      })}
    </svg>
  );
}

/* ── Dates ────────────────────────────────────────────────────── */
const pad = (n: number) => (n < 10 ? '0' : '') + n;
const cleDe = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusJours = (n: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return cleDe(d); };
const jourDe = (iso: string) => cleDe(new Date(iso));
const ecart = (k: string, auj: string) => Math.round((new Date(`${k}T12:00:00`).getTime() - new Date(`${auj}T12:00:00`).getTime()) / 86400000);
const dateCourte = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const dateLongue = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
/* Le lundi de la semaine d'un jour (« 2026-10-14 » → « 2026-10-12 »). */
const lundiDe = (k: string) => { const d = new Date(`${k}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return cleDe(d); };
const sansAccents = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/* ── D'où vient une relance ───────────────────────────────────── */
/* `fort` : ce qui passe avant tout le reste du jour — un client qui veut
   faire une offre. L'étiquette est alors pleine, en or. */
type Origine = { lib: string; ico: string; fort?: boolean };
const veutOffrir = (r: any) => String(r.note || '').startsWith('Veut faire une offre');
/* V3.76 — Les relances posées par l'import commencent par leur origine et le
   nom du contact (« Prochain contact repris d'ImmoFacile — Claire Martin ·
   Dernier échange… ») : l'étiquette dit l'origine, le nom est juste au-dessus,
   la ligne ne montre que la suite. Sur téléphone, on ne lisait que
   « Prochain contact repris d'Immo… ». */
const PREFIXES: { debut: string; o: Origine }[] = [
  { debut: 'Prochain contact repris d’ImmoFacile — ', o: { lib: 'Repris d’ImmoFacile', ico: 'horloge' } },
  { debut: 'Relance proposée au tri de l’import — ', o: { lib: 'Après le tri', ico: 'drapeau' } },
  { debut: 'Projet de vente — recontacter ', o: { lib: 'Projet de vente', ico: 'personne' } },
];
const prefixeDe = (note: unknown) => PREFIXES.find(p => String(note || '').startsWith(p.debut));
/* La suite d'une note, sans le nom du contact qui l'ouvre (« Claire Martin · … »). */
function sansNom(reste: string, nom: string): string {
  const t = reste.trim();
  if (nom && t === nom) return '';
  return t.replace(/^[^·]*·\s*/, s0 => (nom && s0.trim().replace(/\s*·$/, '') === nom ? '' : s0));
}
function origineDe(r: any, typeAction?: string | null): Origine {
  if (r.type === 'auto') return { lib: 'Biens présentés', ico: 'envoi' };
  if (r.type === 'message_client') return { lib: 'Message du client', ico: 'bulle' };
  const pre = prefixeDe(r.note);
  if (pre) return pre.o;
  if (veutOffrir(r)) return { lib: 'Veut faire une offre', ico: 'euro', fort: true };
  if (String(r.note || '').startsWith('Veut revoir')) return { lib: 'Veut revoir', ico: 'oeil' };
  if (String(r.note || '').startsWith('Il réfléchit')) return { lib: 'Il réfléchit', ico: 'horloge' };
  if (String(r.note || '').startsWith('Veut visiter')) return { lib: 'Veut visiter', ico: 'oeil' };
  if (r.type === 'rappel_client') return { lib: 'Demande de rappel', ico: 'tel' };
  if (typeAction === 'appel') return { lib: 'Après un appel', ico: 'tel' };
  if (typeAction === 'rdv') return { lib: 'Après un rendez-vous', ico: 'personne' };
  if (typeAction === 'note') return { lib: 'Note', ico: 'note' };
  if (typeAction === 'email_libre') return { lib: 'Après un mail', ico: 'mail' };
  if (typeAction === 'envoi_externe') return { lib: 'Après un envoi', ico: 'envoi' };
  if (String(r.note || '').startsWith('Rendez-vous :')) return { lib: 'Rappel d’agenda', ico: 'calendrier' };
  return { lib: 'Relance manuelle', ico: 'cloche' };
}

type Filtre = 'tout' | 'retard' | 'aujourdhui' | 'semaine' | 'plusloin';
/* Voir plus loin que la semaine (V3.71). */
type Periode = { k: '30' | '60' | 'date' | 'entre'; du: string; au: string };

/* V3.76 — Le bloc « Tri à faire » seul (`seulTri`), dans la page Contacts : la
   même liste, les mêmes boutons, sans le reste des relances. Contacts suit
   ce qu'il en reste (`onTri`) pour sa tuile, qui disparaît quand le tri est
   fini, et range tout de suite un contact archivé ici (`onArchive`). */
export default function PageRelances({ onNavigate, seulTri = false, cherche = '', onTri, onArchive, onFini }: {
  onNavigate: (page: string, data?: unknown) => void;
  seulTri?: boolean;
  cherche?: string;
  onTri?: (clientIds: string[]) => void;
  onArchive?: (clientId: string, archive: boolean) => void;
  onFini?: () => void;
}) {
  const [relances, setRelances] = useState<any[]>([]);
  const [liens, setLiens] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>('tout');
  const [periode, setPeriode] = useState<Periode | null>(null);
  /* V3.82 : chercher une relance (nom, téléphone, mail, note). */
  const [q, setQ] = useState('');
  /* Reporter posait une date toute faite sans rien demander : on choisit
     désormais la date, et la ligne se range sous nos yeux. */
  const [report, setReport] = useState<{ id: string; date: string } | null>(null);
  /* « C'est fait » : la carte s'efface, et un bandeau permet d'annuler. */
  const [partantes, setPartantes] = useState<Record<string, boolean>>({});
  /* Un archivage s'annule aussi : le contact revient, ses relances rouvrent. */
  const [annulable, setAnnulable] = useState<{ id: string; nom: string; archive?: { clientId: string; relances: string[] } } | null>(null);
  /* V3.74 : la relance en train d'être traitée (la fenêtre est ouverte). */
  const [traitee, setTraitee] = useState<(typeof relances)[number] | null>(null);
  const [noteFaite, setNoteFaite] = useState('');
  /* La ligne traitée passe au vert un instant, avant de se replier. */
  const [faites, setFaites] = useState<Record<string, boolean>>({});
  /* Chaque bandeau du bas repart de zéro (son entrée, sa sortie). */
  const [toastCle, setToastCle] = useState(0);
  /* Le tri : celles du jour et en retard, ou toutes (V3.73). */
  const [triTout, setTriTout] = useState(false);
  const blocTri = useRef<HTMLElement | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Les rapprochements à faire (V3.29) : un acheteur ou un mandat qui vient
     d'arriver, et ce qui leur correspond déjà. */
  const [alertes, setAlertes] = useState<AlerteRappro[]>([]);
  const [alerteEnCours, setAlerteEnCours] = useState('');
  const [toutesAlertes, setToutesAlertes] = useState(false);

  /* Lu dans charger() : le bloc ne change pas de mode en cours de route. */
  const triSeulement = useRef(seulTri);
  useEffect(() => { charger(); }, []);
  useEffect(() => { if (!seulTri) chargerAlertesRappro().then(setAlertes).catch(() => setAlertes([])); }, [seulTri]);
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);
  /* V3.76 : les contacts qui restent à trier, une fois la liste lue, puis à
     chaque ligne qui s'en va (traitée, archivée, ou revenue par « Annuler »). */
  useEffect(() => {
    if (loading || !onTri) return;
    onTri([...new Set(relances.filter(r => estTri(r.note) && r.clients && r.clients.archive !== true).map(r => String(r.client_id)))]);
  }, [relances, loading, onTri]);

  async function charger() {
    let q = supabase
      .from('relances')
      /* Le client entier : « Ouvrir la fiche » a besoin de l'objet complet. */
      .select('*, clients(*)')
      .eq('statut', 'en_attente');
    /* Dans Contacts, le tri seul : la lecture reste petite. */
    if (triSeulement.current) q = q.like('note', `${NOTE_TRI}%`);
    const { data, error } = await q.order('date_echeance', { ascending: true });
    if (error) { alert(`Les relances n'ont pas pu être chargées.\n\n${error.message}`); setLoading(false); return; }
    const liste = data || [];
    setRelances(liste);
    setLoading(false);
    signalerMaj();
    /* L'action du Suivi qui a posé chaque relance (appel, note, rendez-vous…),
       pour dire d'où elle vient et ouvrir la fiche au bon endroit. */
    const ids = liste.filter(r => r.type !== 'auto').map(r => r.id);
    if (!ids.length) { setLiens({}); return; }
    const { data: j } = await supabase.from('journal').select('id, type, metadata').in('metadata->>relance_id', ids);
    const m: Record<string, string> = {};
    (j || []).forEach((x: any) => { const id = x?.metadata?.relance_id; if (id) m[id] = x.type; });
    setLiens(m);
  }

  /* V3.50 : chaque écriture doit toucher sa relance (`.select('id')`) : sur
     une session expirée, la base fermée ne modifiait rien sans un mot, et
     « C'est fait » avait l'air enregistré. L'échec s'affiche en rouge. */
  async function fait(r: any) {
    if (!(await verifie('La relance clôturée', supabase.from('relances').update({ statut: 'cloturee' }).eq('id', r.id).select('id'), { ligne: true }))) return;
    setPartantes(p => ({ ...p, [r.id]: true }));
    setNoteFaite('');
    setAnnulable({ id: r.id, nom: r.clients ? `${r.clients.prenom} ${r.clients.nom}`.trim() : 'la relance' });
    setToastCle(k => k + 1);
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setAnnulable(null), 6000);
    setTimeout(() => { setRelances(l => l.filter(x => x.id !== r.id)); signalerMaj(); }, REPLI);
  }

  /* Le tri (V3.73) : il ne reste pas dans le fichier. Le contact passe dans
     « Archivés » et ses relances en attente se ferment (cloreRelancesArchive). */
  async function archiver(r: (typeof relances)[number]) {
    const c = r.clients;
    if (!c) return;
    const nom = `${c.prenom || ''} ${c.nom || ''}`.trim() || 'ce contact';
    if (!confirm(`Archiver ${nom} ?\n\nIl quitte la liste des contacts et se range dans « Archivés », où tu le retrouves quand tu veux. Ses relances en attente se ferment.`)) return;
    if (!(await verifie('L’archivage du contact', supabase.from('clients').update({ archive: true, updated_at: new Date().toISOString() }).eq('id', c.id).select('id'), { ligne: true }))) return;
    onArchive?.(c.id, true);
    const { ids, erreur } = await cloreRelancesArchive(c.id);
    if (erreur) signalerEchec('Le contact est archivé, mais ses relances', erreur);
    await addJournal(c.id, 'statut_change', 'Contact archivé', estTri(r.note) ? 'Après le dernier appel pour faire le tri.' : undefined, { archive: true });
    partir(r, true);
    setNoteFaite('');
    setAnnulable({ id: r.id, nom, archive: { clientId: c.id, relances: ids.length ? ids : [r.id] } });
    setToastCle(k => k + 1);
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setAnnulable(null), 6000);
    setTimeout(() => { setRelances(l => l.filter(x => x.id !== r.id && x.client_id !== c.id)); signalerMaj(); }, REPLI);
  }

  /* V3.74 — La fenêtre a écrit la ligne du Suivi (et la prochaine relance
     s'il en fallait une) : la relance traitée se clôt et sa ligne s'efface.
     Pour le tri, « Il ne reste pas » archive le contact au passage. */
  async function traitement(r: (typeof relances)[number], info?: { archiver: boolean }) {
    setTraitee(null);
    const c = r.clients;
    const nom = c ? `${c.prenom || ''} ${c.nom || ''}`.trim() : '';
    /* La ligne passe au vert tout de suite ; si la base refuse, elle revient. */
    const t0 = Date.now();
    setFaites(p => ({ ...p, [r.id]: true }));
    if (!(await verifie('La relance traitée', supabase.from('relances').update({ statut: 'cloturee' }).eq('id', r.id).select('id'), { ligne: true }))) {
      setFaites(p => { const x = { ...p }; delete x[r.id]; return x; });
      charger();
      return;
    }
    if (info?.archiver && c) {
      if (await verifie('L’archivage du contact', supabase.from('clients').update({ archive: true, updated_at: new Date().toISOString() }).eq('id', c.id).select('id'), { ligne: true })) {
        onArchive?.(c.id, true);
        const { erreur } = await cloreRelancesArchive(c.id);
        if (erreur) signalerEchec('Le contact est archivé, mais ses relances', erreur);
        await addJournal(c.id, 'statut_change', 'Contact archivé', estTri(r.note) ? 'Après le dernier appel pour faire le tri.' : undefined, { archive: true });
      }
    }
    setNoteFaite(info?.archiver ? `${nom || 'Le contact'} : noté dans son suivi, et archivé.` : `Noté dans le suivi de ${nom || 'ce contact'}.`);
    setToastCle(k => k + 1);
    if (minuterie.current) clearTimeout(minuterie.current);
    setAnnulable(null);
    minuterie.current = setTimeout(() => setNoteFaite(''), 4500);
    /* Le vert reste un instant, puis la ligne glisse et se replie ; la liste
       se relit ensuite : une prochaine relance posée dans la fenêtre apparaît
       à sa date. */
    const vert = Math.max(0, 520 - (Date.now() - t0));
    setTimeout(() => {
      partir(r, !!info?.archiver);
      setTimeout(() => { setRelances(l => l.filter(x => x.id !== r.id && (!info?.archiver || x.client_id !== c?.id))); signalerMaj(); charger(); }, REPLI);
    }, vert);
  }

  /* Une ligne s'en va : elle seule, ou toutes celles du contact s'il est archivé. */
  function partir(r: (typeof relances)[number], toutLeContact: boolean) {
    setPartantes(p => {
      const n: Record<string, boolean> = { ...p, [r.id]: true };
      if (toutLeContact) relances.forEach(x => { if (x.client_id === r.client_id) n[x.id] = true; });
      return n;
    });
  }

  async function annuler() {
    if (!annulable) return;
    if (annulable.archive) {
      const a = annulable.archive;
      if (!(await verifie('Le contact sorti des archives', supabase.from('clients').update({ archive: false, updated_at: new Date().toISOString() }).eq('id', a.clientId).select('id'), { ligne: true }))) return;
      onArchive?.(a.clientId, false);
      if (!(await verifie('Ses relances rouvertes', supabase.from('relances').update({ statut: 'en_attente' }).in('id', a.relances).select('id')))) return;
      await addJournal(a.clientId, 'statut_change', 'Contact sorti des archives', undefined, { archive: false });
      setAnnulable(null);
      setPartantes({});
      charger();
      return;
    }
    if (!(await verifie('La relance rétablie', supabase.from('relances').update({ statut: 'en_attente' }).eq('id', annulable.id).select('id'), { ligne: true }))) return;
    setAnnulable(null);
    setPartantes(p => { const c = { ...p }; delete c[annulable.id]; return c; });
    charger();
  }

  /* Le report part toujours d'aujourd'hui, jamais de l'ancienne échéance :
     une relance en retard de dix jours doit revenir dans le délai normal. */
  async function ouvrirReport(id: string) {
    if (report?.id === id) { setReport(null); return; }
    const j = await delaiRelance();
    setReport({ id, date: echeanceDans(j).split('T')[0] });
  }

  async function reporter(id: string, jour: string) {
    if (!jour) return;
    if (!(await verifie('Le report de la relance', supabase.from('relances')
      .update({ date_echeance: new Date(`${jour}T12:00:00`).toISOString() }).eq('id', id).select('id'), { ligne: true }))) return;
    setReport(null);
    charger();
  }

  async function alertePlusTard(a: AlerteRappro) {
    setAlerteEnCours(a.cle);
    const ok = a.k === 'acheteur' ? await plusTardAcheteur(a) : await mandatVu(a, false);
    setAlerteEnCours('');
    if (ok) setAlertes(l => l.filter(x => x.cle !== a.cle));
  }
  async function alerteVoir(a: AlerteRappro) {
    setAlerteEnCours(a.cle);
    if (a.k === 'mandat') {
      await mandatVu(a, true);
      demanderOngletBien(a.bien.id, 'acheteurs');
      onNavigate('biens', { bien: a.bien.id });
      return;
    }
    const { data, error } = await supabase.from('clients').select('*').eq('id', a.client.id).maybeSingle();
    setAlerteEnCours('');
    if (error || !data) { alert(`La fiche n'a pas pu être ouverte.${error ? `\n\n${error.message}` : ''}`); return; }
    demanderOuvertureFiche({ clientId: a.client.id, onglet: 'selection', rechercheId: a.recherche.id, rappro: { source: 'mandats', cocher: a.mandats.map(m => m.id) } });
    onNavigate('fiche', data);
  }

  function ouvrirFiche(r: any) {
    if (!r.clients) return;
    demanderOuvertureFiche(ouvertureDepuisRelance(r, liens[r.id]));
    onNavigate('fiche', r.clients);
  }

  const auj = cleDe(new Date());
  /* V3.73 : le tri d'après l'import, à part ; tout le reste se calcule sans lui. */
  const tri = relances.filter(r => estTri(r.note));
  const courantes = relances.filter(r => !estTri(r.note));
  const triDus = tri.filter(r => jourDe(r.date_echeance) <= auj);
  const triPlusTard = tri.length - triDus.length;
  const triVus = triTout ? tri : triDus;
  /* V3.76 : dans Contacts, la recherche du haut de page vaut pour le tri. */
  const qTri = sansAccents(cherche.trim());
  const chiffresTri = qTri.replace(/\D/g, '');
  const triTrouves = !qTri ? tri : tri.filter(r => {
    const c = r.clients || {};
    const tels: string[] = c.telephones || [];
    return sansAccents([c.prenom, c.nom, ...(c.emails || []), ...tels].filter(Boolean).join(' ')).includes(qTri)
      || (chiffresTri.length >= 3 && tels.some(t => String(t).replace(/\D/g, '').includes(chiffresTri)));
  });
  const triGroupes = [
    { id: 'tri-dus', titre: 'À appeler', sous: 'en retard ou aujourd’hui', couleur: '#d97706', liste: triTrouves.filter(r => jourDe(r.date_echeance) <= auj) },
    { id: 'tri-tard', titre: 'Prévus plus tard', sous: 'chacun à sa date', couleur: '#2563eb', liste: triTrouves.filter(r => jourDe(r.date_echeance) > auj) },
  ].filter(g => g.liste.length > 0);
  /* Dans chaque groupe, « Veut faire une offre » passe en tête ; le reste
     garde l'ordre des échéances. */
  const enTete = (l: any[]) => [...l.filter(veutOffrir), ...l.filter(r => !veutOffrir(r))];
  /* V3.82 : la recherche du bandeau vaut pour toutes les relances. */
  const qR = sansAccents(q.trim());
  const chiffresR = qR.replace(/\D/g, '');
  const cherchees = !qR ? courantes : courantes.filter(r => {
    const c = r.clients || {};
    const tels: string[] = c.telephones || [];
    return sansAccents([c.prenom, c.nom, ...(c.emails || []), r.note].filter(Boolean).join(' ')).includes(qR)
      || (chiffresR.length >= 3 && tels.some(t => String(t).replace(/\D/g, '').includes(chiffresR)));
  });
  const retard = enTete(cherchees.filter(r => jourDe(r.date_echeance) < auj));
  const duJour = enTete(cherchees.filter(r => jourDe(r.date_echeance) === auj));
  const avenir = cherchees.filter(r => jourDe(r.date_echeance) > auj);
  const demain = plusJours(1), dansSept = plusJours(7);
  const semaine = avenir.filter(r => jourDe(r.date_echeance) <= dansSept);
  const loin = avenir.filter(r => jourDe(r.date_echeance) > dansSept);
  const plusLoin = loin.length;
  /* Les relances d'une période (bornes comprises), de la plus proche à la plus lointaine. */
  const entre = (du: string, au: string) => cherchees.filter(r => { const k = jourDe(r.date_echeance); return k >= du && k <= au; });
  const PERIODES: { k: Periode['k']; lib: string; du: string; au: string }[] = [
    { k: '30', lib: '30 prochains jours', du: auj, au: plusJours(30) },
    { k: '60', lib: '2 prochains mois', du: auj, au: plusJours(61) },
    { k: 'date', lib: 'Un jour précis', du: demain, au: demain },
    { k: 'entre', lib: 'Entre deux dates', du: auj, au: plusJours(14) },
  ];
  function choisirPeriode(k: Periode['k']) {
    if (periode?.k === k) { setPeriode(null); return; }
    const x = PERIODES.find(y => y.k === k)!;
    setPeriode({ k, du: x.du, au: x.au });
    setFiltre('plusloin');
  }
  const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  /* Par semaine : « Semaine du 13 oct. ». */
  type Rel = (typeof relances)[number];
  const parSemaine = (l: Rel[]) => {
    const m = new Map<string, Rel[]>();
    for (const r of [...l].sort((a, b) => jourDe(a.date_echeance).localeCompare(jourDe(b.date_echeance)))) {
      const k = lundiDe(jourDe(r.date_echeance));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return [...m].map(([k, liste]) => ({ id: `s${k}`, titre: k === lundiDe(auj) ? 'Semaine en cours' : `Semaine du ${dateCourte(k)}`, ico: 'calendrier', couleur: '#64748b', liste: enTete(liste) }));
  };

  /* Les groupes affichés, du plus pressé au plus lointain (V3.82 : la
     semaine jour par jour ; « Plus loin », semaine par semaine, ou la
     période choisie). */
  type Groupe = { id: string; titre: string; sous?: string; ico: string; couleur: string; liste: Rel[] };
  const groupes: Groupe[] = [];
  if (filtre === 'plusloin') {
    if (periode) {
      const l = enTete(entre(periode.du, periode.au));
      if (periode.du === periode.au) groupes.push({ id: 'jour', titre: majuscule(dateLongue(periode.du)), ico: 'calendrier', couleur: '#2563eb', liste: l });
      else groupes.push(...parSemaine(l));
    } else groupes.push(...parSemaine(loin));
  } else {
    if (filtre === 'tout' || filtre === 'retard') groupes.push({ id: 'retard', titre: 'En retard', sous: 'à rattraper en premier', ico: 'alerte', couleur: '#dc2626', liste: retard });
    if (filtre === 'tout' || filtre === 'aujourdhui') groupes.push({ id: 'auj', titre: 'Aujourd’hui', sous: majuscule(dateLongue(auj)), ico: 'soleil', couleur: '#d97706', liste: duJour });
    if (filtre === 'tout' || filtre === 'semaine') {
      for (let n = 1; n <= 7; n++) {
        const k = plusJours(n);
        groupes.push({ id: `j${k}`, titre: n === 1 ? 'Demain' : majuscule(dateLongue(k)), sous: n === 1 ? majuscule(dateLongue(k)) : undefined, ico: 'calendrier', couleur: '#2563eb', liste: enTete(semaine.filter(r => jourDe(r.date_echeance) === k)) });
      }
    }
  }
  const visibles = groupes.filter(g => g.liste.length > 0);
  const nbPeriode = periode ? entre(periode.du, periode.au).length : 0;

  let rang = 0;
  /* Une ligne de relance, du bloc des échéances comme de celui du tri.
     V3.82 (Alexandre : « plus joli, plus moderne ») : une carte plus légère —
     l'avatar cerclé de la couleur de l'échéance, le nom et l'échéance sur la
     première ligne, l'origine et la note sur la seconde ; à droite, « Ouvrir
     la fiche », deux gestes courts et « Traiter » en avant. */
  const ligne = (r: (typeof relances)[number]) => {
    const k = jourDe(r.date_echeance);
    const e = ecart(k, auj);
    const urg = e < 0 ? 'retard' : e === 0 ? 'auj' : e === 1 ? 'demain' : 'plus';
    const tag = e < 0 ? { lib: `${-e} j de retard` }
      : e === 0 ? { lib: 'Aujourd’hui' }
      : e === 1 ? { lib: 'Demain' }
      : { lib: `Dans ${e} jours` };
    const enTri = estTri(r.note);
    const o: Origine = enTri ? { lib: 'Dernier appel', ico: 'drapeau' } : origineDe(r, liens[r.id]);
    const c = r.clients;
    const nom = c ? `${c.prenom || ''} ${c.nom || ''}`.trim() : 'Client supprimé';
    const ouvert = report?.id === r.id;
    /* Le tri et les relances de l'import : la note sans son en-tête, ni le nom qui est juste au-dessus. */
    const pre = prefixeDe(r.note);
    const texte = !r.note || r.note === o.lib ? '' : enTri ? sansNom(String(r.note).slice(NOTE_TRI.length), nom) : pre ? sansNom(String(r.note).slice(pre.debut.length), nom) : r.note;
    return (
      <div key={r.id} className="rl-entre rl-pli" data-partante={partantes[r.id] ? '' : undefined} style={{ animationDelay: `${120 + Math.min(rang++, 12) * 45}ms` }}>
        <div className="rl-pli-in">
        <div className="rl-ligne" data-ok={faites[r.id] ? '' : undefined} data-urg={urg} data-ouvert={ouvert ? '' : undefined}>
          <AvatarContact c={c || { prenom: nom }} teinte={{ bg: NAVY, fg: OR }} className="rl-av" libre style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0 }} />
          <span className="rl-texte">
            <span className="rl-l1">
              <b className="rl-nom">{nom}</b>
              {faites[r.id] ? (
                <span className="rl-ok"><Ic n="coche" t={12} ep={2.8} />Noté dans le suivi</span>
              ) : (
                <span className="rl-tag">{e < 0 && <span className="rl-pouls" />}{tag.lib}</span>
              )}
              <span className="rl-date">{dateCourte(k)}</span>
            </span>
            <span className="rl-note">
              <span className={`rl-orig${o.fort ? ' rl-orig-fort' : ''}`}><Ic n={o.ico} t={12} ep={2.2} />{o.lib}</span>
              {/* Le tri : le motif compte, il tient sur deux lignes. */}
              {texte && <span className={enTri ? 'rl-txt rl-txt-2' : 'rl-txt'}>{texte}</span>}
            </span>
          </span>
          <span className="rl-actions">
            {c && (
              <button type="button" className="rl-b rl-b-fant rl-appui rl-fiche" onClick={() => ouvrirFiche(r)} title="Ouvrir la fiche, au bon onglet">
                <span className="rl-long">Ouvrir la fiche</span><span className="rl-court">Fiche</span><Ic n="fleche" t={14} ep={2.2} />
              </button>
            )}
            <button type="button" className="rl-b rl-appui" onClick={() => ouvrirReport(r.id)} aria-expanded={ouvert} title="Reporter à une autre date">
              <Ic n="report" t={14} ep={2.2} /><span className="rl-b-lib">Reporter</span>
            </button>
            {enTri && c && (
              <button type="button" className="rl-b rl-appui" onClick={() => archiver(r)} title="Il ne reste pas : rangé dans « Archivés », ses relances se ferment">
                <Ic n="archive" t={14} ep={2.1} /><span className="rl-b-lib">Archiver</span>
              </button>
            )}
            <button type="button" className="rl-b rl-appui" onClick={() => fait(r)} title="Clore la relance sans rien noter">
              <Ic n="coche" t={15} ep={2.6} /><span className="rl-b-lib">C’est fait</span>
            </button>
            {/* V3.74 : noter ce qui s'est passé, sans quitter la page. */}
            {c && (
              <button type="button" className="rl-b rl-b-prim rl-appui rl-traiter" onClick={() => { setReport(null); setTraitee(r); }} title="Noter ce qui s’est passé sans quitter la page">
                <Ic n="tel" t={14} ep={2.2} />Traiter
              </button>
            )}
          </span>
        </div>

        {ouvert && report && (
          <div className="rl-entre" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, margin: '6px 0 0', padding: '12px 14px', borderRadius: 16, background: '#fffaf0', border: '1px solid #f0e2bd' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: OR_FONCE, textTransform: 'uppercase', letterSpacing: .9, marginRight: 4 }}>Reporter au</span>
            {([['Demain', 1], ['Dans 3 j', 3], ['Dans 7 j', 7], ['Dans 15 j', 15], ['Dans 1 mois', 30]] as [string, number][]).map(([lib, j]) => {
              const d = plusJours(j);
              const actif = report.date === d;
              return (
                <button key={lib} type="button" className="rl-appui" onClick={() => setReport({ id: r.id, date: d })}
                  style={{ height: 32, padding: '0 12px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, border: `1px solid ${actif ? NAVY : '#e3d3ab'}`, background: actif ? NAVY : 'white', color: actif ? '#f2dfa6' : '#6b6045' }}>{lib}</button>
              );
            })}
            <ChoixDate compact valeur={report.date} min={plusJours(0)} placeholder="Une autre date" onChange={v => v && setReport({ id: r.id, date: v })} />
            <span style={{ flexGrow: 1 }} />
            <button type="button" onClick={() => setReport(null)} style={{ background: 'none', border: 'none', color: '#a08c60', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
            <button type="button" className="rl-appui" onClick={() => reporter(r.id, report.date)}
              style={{ height: 34, background: NAVY, color: 'white', border: 'none', borderRadius: 10, padding: '0 15px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              {`Reporter au ${dateCourte(report.date)}`}
            </button>
          </div>
        )}
        </div>
      </div>
    );
  };

  return (
    <div className={seulTri ? 'rl-seul' : 'rl-page'} style={{ padding: seulTri ? 0 : '28px 28px 40px', display: 'flex', flexDirection: 'column', gap: 22, fontFamily: "'DM Sans', system-ui, sans-serif", color: NAVY }}>
      <style>{`
        @keyframes rlEntre{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes rlToastCourt{0%{opacity:0;transform:translate(-50%,18px) scale(.96)}8%{opacity:1;transform:translate(-50%,0) scale(1)}91%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,12px)}}
        @keyframes rlToastLong{0%{opacity:0;transform:translate(-50%,18px) scale(.96)}6%{opacity:1;transform:translate(-50%,0) scale(1)}93%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,12px)}}
        @keyframes rlPop{0%{opacity:0;transform:scale(.4)}60%{opacity:1;transform:scale(1.18)}100%{opacity:1;transform:scale(1)}}
        @keyframes rlPouls{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.45)}60%{box-shadow:0 0 0 7px rgba(220,38,38,0)}}
        .rl-entre{animation:rlEntre .45s cubic-bezier(.2,.9,.3,1) both}
        /* V3.82 : la carte d'une relance. */
        .rl-ligne{position:relative;display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:16px;background:#fff;border:1px solid #e6ebf2;box-shadow:0 1px 2px rgba(16,24,40,.03);overflow:hidden;transition:box-shadow .25s ease,border-color .25s ease,background-color .25s ease,transform .2s ease}
        .rl-ligne[data-ouvert]{border-color:#ecdcae}
        /* L'avatar cerclé de la couleur de l'échéance. */
        .rl-ligne .rl-av{box-shadow:0 0 0 2px #fff,0 0 0 4px var(--uc,#cbd5e1);margin:4px}
        .rl-ligne[data-urg=retard]{--uc:#ef4444;--uf:#fef2f2;--ut:#b91c1c}
        .rl-ligne[data-urg=auj]{--uc:#f59e0b;--uf:#fff7e6;--ut:#b45309}
        .rl-ligne[data-urg=demain]{--uc:#60a5fa;--uf:#eff6ff;--ut:#1d4ed8}
        .rl-ligne[data-urg=plus]{--uc:#cbd5e1;--uf:#f1f5f9;--ut:#475569}
        .rl-texte{display:flex;flex-direction:column;gap:5px;flex:1 1 280px;min-width:0}
        .rl-l1{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
        .rl-nom{font-family:${JAK};font-size:15px;font-weight:800;color:#1a2332}
        .rl-tag{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:99px;background:var(--uf);color:var(--ut);font-size:11.5px;font-weight:800}
        .rl-tag > .rl-pouls{width:6px;height:6px;border-radius:50%;background:var(--ut)}
        .rl-date{font-size:11.5px;font-weight:600;color:${PALE}}
        .rl-ok{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:800;color:#15803d;background:#dcfce7;border-radius:20px;padding:2px 9px}
        .rl-note{display:flex;align-items:center;gap:7px;min-width:0;font-size:13px;color:${DOUX}}
        .rl-orig{display:inline-flex;align-items:center;gap:5px;flex-shrink:0;padding:2px 8px;border-radius:8px;background:#fbf4e1;color:${OR_FONCE};font-size:11.5px;font-weight:700}
        .rl-orig-fort{background:${OR};color:${NAVY};font-weight:800}
        .rl-txt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .rl-txt-2{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.4}
        .rl-actions{display:flex;align-items:center;gap:6px;flex-shrink:0;justify-content:flex-end}
        .rl-b{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 12px;border-radius:11px;border:1px solid #e3e8f0;background:#fff;color:${NAVY};font:700 13px 'DM Sans',system-ui,sans-serif;cursor:pointer;white-space:nowrap}
        .rl-b:hover{background:#f6f8fb;border-color:#d3dbe7}
        .rl-b[aria-expanded=true]{border-color:${OR};background:#fffaf0;color:${OR_FONCE}}
        .rl-b-fant{border-color:transparent;background:transparent}
        .rl-b-fant:hover{background:#f1f4f9;border-color:transparent}
        .rl-b-prim{background:${NAVY};border-color:${NAVY};color:#fff;font-weight:800;padding:0 15px;box-shadow:0 8px 18px -10px rgba(52,73,110,.85)}
        .rl-b-prim:hover{background:#2b3d5e;border-color:#2b3d5e}
        /* Les groupes : un titre à pastille, puis les cartes le long d'un trait. */
        .rl-groupes{display:flex;flex-direction:column;gap:20px}
        .rl-groupe{display:flex;flex-direction:column;gap:10px}
        .rl-gt{display:flex;align-items:center;gap:10px;min-width:0}
        .rl-gt-ic{width:30px;height:30px;border-radius:10px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--gc) 13%,#fff);color:var(--gc)}
        .rl-gt b{font-family:${JAK};font-size:15px;font-weight:800;color:#1a2332;white-space:nowrap}
        .rl-gt-n{padding:2px 9px;border-radius:99px;background:color-mix(in srgb,var(--gc) 13%,#fff);color:var(--gc);font-size:12px;font-weight:800}
        .rl-gt-sous{font-size:12.5px;font-weight:600;color:${PALE};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rl-gt::after{content:'';flex:1 1 40px;height:1px;background:linear-gradient(90deg,color-mix(in srgb,var(--gc) 35%,transparent),transparent)}
        .rl-gl{display:flex;flex-direction:column;gap:8px;margin-left:14px;padding-left:16px;border-left:2px solid color-mix(in srgb,var(--gc) 22%,transparent)}
        /* « Plus loin » : la barre des périodes. */
        .rl-periode{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border-radius:16px;background:#fff;border:1px solid ${BORD}}
        .rl-periode-t{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#475569;margin-right:2px}
        .rl-puce{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:20px;border:1px solid #dfe5ee;background:#fff;color:${NAVY};font:700 12.5px 'DM Sans',system-ui,sans-serif;cursor:pointer}
        .rl-puce > i{font-style:normal;font-size:11px;font-weight:800;padding:1px 7px;border-radius:20px;background:#f1f5f9;color:#475569}
        .rl-puce[aria-pressed=true]{background:${NAVY};border-color:${NAVY};color:#fff}
        .rl-puce[aria-pressed=true] > i{background:rgba(255,255,255,.18);color:#fff}
        .rl-entre-dates{display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:12.5px;font-weight:700;color:${DOUX}}
        .rl-periode-n{margin-left:auto;font-size:12.5px;color:${DOUX}}
        /* V3.76 : sur un écran moyen (1280), les cinq boutons passent sous le
           texte plutôt que de l'écraser sur trois mots. */
        .rl-ligne{flex-wrap:wrap}
        .rl-actions{margin-left:auto}
        .rl-ligne:hover{box-shadow:0 14px 28px -22px rgba(16,24,40,.5);border-color:#d7deea;transform:translateY(-1px)}
        @media (max-width:1180px){.rl-b-lib{display:none}.rl-actions > .rl-b:not(.rl-b-prim):not(.rl-fiche){width:36px;padding:0}}
        /* V3.74 — Traitée : la ligne passe au vert, puis glisse et se replie
           à sa vraie hauteur (grille 1fr → 0fr) ; celles du dessous remontent
           sans saut. Le dernier d'un groupe emmène son titre. */
        .rl-ligne[data-ok]{border-color:#9fdcb6 !important;background:#f3fcf6 !important;box-shadow:0 0 0 4px rgba(22,163,74,.09)}
        .rl-ok{animation:rlPop .34s cubic-bezier(.2,.9,.3,1) both}
        .rl-pli{display:grid;grid-template-rows:1fr;grid-template-columns:minmax(0,1fr);transition:grid-template-rows .5s cubic-bezier(.4,0,.2,1),margin-top .5s cubic-bezier(.4,0,.2,1)}
        /* V3.76 : min-width aussi. Sans lui, une note longue (« Prochain contact
           repris d'ImmoFacile — … », sur une ligne) élargissait la grille : sur
           téléphone, la ligne débordait de l'écran et les boutons sortaient. */
        .rl-pli-in{min-height:0;min-width:0}
        .rl-pli[data-partante]{grid-template-rows:0fr;margin-top:-10px;pointer-events:none}
        .rl-pli-g[data-partante]{margin-top:-22px}
        .rl-pli[data-partante] > .rl-pli-in{overflow:hidden}
        .rl-pli[data-partante] .rl-ligne{opacity:0;transform:translateX(32px) scale(.98);transition:opacity .34s ease,transform .45s cubic-bezier(.4,0,.2,1),background-color .25s ease,border-color .25s ease}
        .rl-pli-g[data-partante] > .rl-pli-in{opacity:0;transition:opacity .4s ease}
        .rl-toast-court{animation:rlToastCourt 4.5s cubic-bezier(.2,.9,.3,1) both}
        .rl-toast-long{animation:rlToastLong 6s cubic-bezier(.2,.9,.3,1) both}
        .rl-toast-ok{animation:rlPop .4s cubic-bezier(.2,.9,.3,1) .12s both}
        .rl-appui{transition:transform .15s ease,background-color .15s ease,border-color .15s ease,color .15s ease}
        .rl-appui:hover{transform:translateY(-1px)}
        .rl-appui:active{transform:scale(.97)}
        .rl-pouls{animation:rlPouls 1.9s ease-out infinite}
        @media (prefers-reduced-motion: reduce){.rl-al-ping{animation:none}}
        .rl-court{display:none}
        .rl-al{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:16px;align-items:center;padding:16px 18px;border-radius:20px;background:white;border:1px solid #ecdcb0;box-shadow:0 16px 34px -26px rgba(46,65,102,.45)}
        .rl-al-m{border-color:${BORD}}
        .rl-al-ic{width:48px;height:48px;border-radius:15px;display:flex;align-items:center;justify-content:center}
        .rl-al-ping{animation:rlPing 2s ease-out infinite}
        @keyframes rlPing{0%{box-shadow:0 0 0 0 rgba(201,168,76,.5)}80%,100%{box-shadow:0 0 0 10px rgba(201,168,76,0)}}
        @media (prefers-reduced-motion: reduce){.rl-entre,.rl-ok,.rl-toast,.rl-toast-ok{animation:none !important}.rl-pli,.rl-pli .rl-ligne{transition:none !important}}
        @media (max-width: 760px){
          .rl-page{padding:16px 12px 96px !important;gap:16px !important}
          .rl-ligne{flex-wrap:wrap !important}
          .rl-texte{flex-basis:0 !important}
          .rl-actions{width:100%;display:grid !important;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px !important}
          .rl-actions > .rl-traiter{grid-column:1 / -1;order:-1}
          .rl-al{grid-template-columns:40px minmax(0,1fr);gap:12px;padding:14px}
          .rl-al-ic{width:40px;height:40px;border-radius:12px}
          .rl-al-btns{grid-column:1 / -1}
          .rl-al-btns > button{flex:1 1 0}
          .rl-actions > button{flex:1 1 0;padding:0 8px !important;white-space:nowrap}
          .rl-tri{padding:12px 10px 14px !important;border-radius:18px !important}
          .rl-tri .rl-actions{grid-template-columns:1fr 1fr}
          .rl-long{display:none}
          .rl-court{display:inline !important}
          .rl-periode > span:first-child{width:100%}
          .rl-gl{margin-left:0;padding-left:0;border-left:none}
          .rl-gt-sous{display:none}
          .rl-b-lib{display:inline !important}
          .rl-actions > .rl-b:not(.rl-b-prim):not(.rl-fiche){width:auto !important;padding:0 8px !important}
          /* Un cran plus petit sur téléphone, au niveau du tableau de bord :
             les lignes étaient écrites trop gros. */
          .rl-ligne{gap:11px !important;padding:11px 12px 11px 15px !important;border-radius:16px !important}
          .rl-av{width:36px !important;height:36px !important;border-radius:11px !important;font-size:13px !important}
          .rl-nom{font-size:14px !important}
          .rl-note{font-size:12.5px !important;flex-wrap:wrap;row-gap:5px !important}
          /* V3.76 : la note passe sous l'étiquette, sur deux lignes, plutôt que
             coupée après trois mots. */
          .rl-note > .rl-txt{white-space:normal !important;display:-webkit-box !important;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4}
          .rl-ligne{align-items:flex-start !important}
          .rl-actions > button{height:34px !important;font-size:12.5px !important;border-radius:11px !important}
        }
      `}</style>

      {/* V3.82 (Alexandre : « en retard, aujourd'hui, cette semaine, plus
          loin : plus joli, plus moderne ») : le même bandeau que Contacts et
          Biens — le titre, la recherche, et les échéances en tuiles qui
          filtrent ; « Tout » (jusqu'à la fin de la semaine) au bout. */}
      {!seulTri && (
        <EnteteRubrique titre="Relances" icone={<Ic n="cloche" t={22} ep={1.9} />}
          phrase={loading ? 'Les clients à recontacter, du plus pressé au moins pressé.' : retard.length ? `${retard.length > 1 ? `${retard.length} relances en retard` : 'Une relance en retard'} : à rattraper en premier.` : duJour.length ? `${duJour.length > 1 ? `${duJour.length} relances` : 'Une relance'} pour aujourd’hui, rien en retard.` : 'Rien en retard, rien pour aujourd’hui.'}
          recherche={{ valeur: q, onChange: setQ, placeholder: 'Nom, téléphone, note…', label: 'Chercher une relance' }}
          bouton2={tri.length > 0 ? { lib: `Tri à faire · ${triDus.length ? `${triDus.length} à appeler` : 'rien aujourd’hui'}`, court: 'Tri', ic: <Ic n="drapeau" t={15} ep={2.1} />, onClick: () => blocTri.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) } : undefined}
          label="Filtrer les relances" actif={filtre} defiler={false}
          onChoisir={k => { setPeriode(null); setReport(null); setFiltre(k as Filtre); }}
          tuiles={loading ? [] : [
            { cle: 'retard', lib: 'En retard', n: retard.length, couleur: '#dc2626', alerte: true },
            { cle: 'aujourdhui', lib: 'Aujourd’hui', n: duJour.length, couleur: '#d97706' },
            { cle: 'semaine', lib: 'Cette semaine', n: semaine.length, couleur: '#2563eb' },
            { cle: 'plusloin', lib: 'Plus loin', n: plusLoin, couleur: '#94a3b8' },
            { cle: 'tout', lib: 'Tout', n: retard.length + duJour.length + semaine.length, tete: true, fin: true, ic: <Ic n="cloche" t={14} ep={2.1} /> },
          ]} />
      )}

      {!seulTri && alertes.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Rapprochements">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1.3, textTransform: 'uppercase', color: '#a07c28' }}>Rapprochements</span>
            <span style={{ padding: '2px 9px', borderRadius: 99, background: OR, color: '#1a2332', fontFamily: JAK, fontSize: 12, fontWeight: 800 }}>{alertes.length > 1 ? `${alertes.length} nouveaux` : '1 nouveau'}</span>
          </div>
          {alertes.slice(0, toutesAlertes ? alertes.length : 3).map((a, i) => {
            const acheteur = a.k === 'acheteur';
            const nomC = acheteur ? [a.client?.prenom, a.client?.nom].filter(Boolean).join(' ') || 'Un acheteur' : '';
            const m0 = acheteur ? a.mandats[0] : null;
            const titre = acheteur
              ? (a.mandats.length > 1 ? `${nomC} correspond à ${a.mandats.length} de vos mandats, jusqu’à ${m0!.note}\u00a0%` : `${nomC} correspond à votre « ${m0!.titre} »${m0!.ville ? ` à ${m0!.ville}` : ''} · ${m0!.note}\u00a0%`)
              : `Votre mandat « ${a.titre} »${a.bien.ville ? ` à ${a.bien.ville}` : ''} intéresse ${a.n > 1 ? `${a.n} de vos acheteurs` : 'un de vos acheteurs'}`;
            const j = Math.max(0, Math.floor((Date.now() - Date.parse(a.le)) / 86400000));
            const quand = j === 0 ? 'aujourd’hui' : j === 1 ? 'hier' : `il y a ${j} jours`;
            const autres = acheteur ? 0 : a.n - a.noms.length;
            const sous = acheteur
              ? `Sa recherche a été ouverte ${quand}. « Voir » ouvre sa fiche sur les biens trouvés, ${a.mandats.length > 1 ? 'ces mandats déjà cochés' : 'ce mandat déjà coché'}.`
              : `${j === 0 ? 'Passé en vente aujourd’hui' : j === 1 ? 'Passé en vente hier' : `En vente depuis ${j} jours`}${a.noms.length ? ` · ${a.noms.join(', ')}${autres > 0 ? ` et ${autres > 1 ? `${autres} autres` : 'un autre'}` : ''}` : ''}. « Voir les acheteurs » ouvre sa fiche sur l’onglet Acheteurs.`;
            const occupe = alerteEnCours === a.cle;
            return (
              <div key={a.cle} className={`rl-al rl-entre${acheteur ? '' : ' rl-al-m'}`} style={{ animationDelay: `${i * 80}ms` }}>
                <span className={`rl-al-ic${acheteur ? ' rl-al-ping' : ''}`} style={acheteur ? { background: '#fbf6e9', border: '1px solid #ecdcb0', color: '#a07c28' } : { background: '#eef2f8', color: NAVY }}>
                  <Ic n={acheteur ? 'groupe' : 'drapeau'} t={22} ep={2} />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: acheteur ? '#a07c28' : NAVY }}>{acheteur ? 'Un acheteur arrive' : 'Un mandat arrive'}</span>
                  <b style={{ fontFamily: JAK, fontSize: 15.5, fontWeight: 800, color: '#1a2332', lineHeight: 1.35 }}>{titre}</b>
                  <span style={{ fontSize: 13.5, color: DOUX, lineHeight: 1.5 }}>{sous}</span>
                </span>
                <span className="rl-al-btns" style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="rl-appui" disabled={occupe} onClick={() => alertePlusTard(a)}
                    style={{ height: 40, padding: '0 15px', borderRadius: 12, border: `1px solid ${BORD}`, background: 'white', color: NAVY, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Plus tard</button>
                  <button type="button" className="rl-appui" disabled={occupe} onClick={() => alerteVoir(a)}
                    style={{ height: 40, padding: '0 16px', borderRadius: 12, border: 'none', background: NAVY, color: 'white', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>{occupe ? 'Un instant…' : acheteur ? 'Voir' : 'Voir les acheteurs'}</button>
                </span>
              </div>
            );
          })}
          {alertes.length > 3 && (
            <button type="button" className="rl-appui" onClick={() => setToutesAlertes(x => !x)}
              style={{ alignSelf: 'flex-start', height: 34, padding: '0 14px', borderRadius: 11, border: '1px solid #ecdcb0', background: '#fffcf4', color: OR_FONCE, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {toutesAlertes ? 'N’en montrer que trois' : `Voir les ${alertes.length - 3} autres`}
            </button>
          )}
        </section>
      )}

      {/* Plus loin que la semaine (V3.71) : semaine par semaine, ou une
          période — les 30 ou 60 prochains jours, un jour, entre deux dates. */}
      {!seulTri && !loading && filtre === 'plusloin' && (
        <div className="rl-periode rl-entre">
          <span className="rl-periode-t"><Ic n="calendrier" t={14} ep={2.1} />Voir</span>
          <button type="button" className="rl-puce rl-appui" aria-pressed={!periode} onClick={() => setPeriode(null)}>
            <span>Après cette semaine</span><i>{plusLoin}</i>
          </button>
          {PERIODES.map(x => {
            const actif = periode?.k === x.k;
            const n = x.k === '30' || x.k === '60' ? entre(x.du, x.au).length : null;
            return (
              <button key={x.k} type="button" className="rl-puce rl-appui" aria-pressed={actif} onClick={() => choisirPeriode(x.k)}>
                <span>{x.lib}</span>
                {n !== null && <i>{n}</i>}
              </button>
            );
          })}
          {periode?.k === 'date' && (
            <ChoixDate compact valeur={periode.du} placeholder="Choisir le jour" onChange={v => v && setPeriode({ k: 'date', du: v, au: v })} />
          )}
          {periode?.k === 'entre' && (
            <span className="rl-entre-dates">
              <span>du</span>
              <ChoixDate compact valeur={periode.du} placeholder="Début" onChange={v => v && setPeriode(p => (p ? { ...p, du: v, au: p.au < v ? v : p.au } : p))} />
              <span>au</span>
              <ChoixDate compact valeur={periode.au} min={periode.du} placeholder="Fin" onChange={v => v && setPeriode(p => (p ? { ...p, au: v < p.du ? p.du : v } : p))} />
            </span>
          )}
          {periode && <span className="rl-periode-n">{`${nbPeriode > 1 ? `${nbPeriode} relances` : nbPeriode === 1 ? '1 relance' : 'Aucune relance'} ${periode.du === periode.au ? `le ${dateCourte(periode.du)}` : `du ${dateCourte(periode.du)} au ${dateCourte(periode.au)}`}`}</span>}
        </div>
      )}

      {seulTri ? null : loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: PALE, fontSize: 13.5 }}>Chargement…</div>
      ) : courantes.length === 0 ? (
        <div className="rl-entre" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '44px 24px', borderRadius: 22, background: 'linear-gradient(180deg, #f0fdf6 0%, #ffffff 100%)', border: '1px solid #cdeedd', textAlign: 'center' }}>
          <span style={{ width: 62, height: 62, borderRadius: 20, background: '#dcfce8', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="coche" t={30} ep={2.4} /></span>
          <b style={{ fontFamily: JAK, fontSize: 19, fontWeight: 800 }}>Tout est à jour</b>
          <span style={{ fontSize: 13.5, color: DOUX, lineHeight: 1.55, maxWidth: 440 }}>{tri.length ? 'Aucune relance en attente, en dehors du tri juste en dessous.' : 'Aucune relance en attente. Une relance se programme toute seule quand un bien part chez un client, et se clôture dès qu’il répond.'}</span>
        </div>
      ) : visibles.length === 0 ? (
        <div className="rl-entre" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '34px 24px', borderRadius: 20, background: 'white', border: `1px solid ${BORD}`, textAlign: 'center' }}>
          <span style={{ width: 50, height: 50, borderRadius: 16, background: '#fbf4e1', color: OR_FONCE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="soleil" t={24} ep={1.9} /></span>
          <b style={{ fontFamily: JAK, fontSize: 16, fontWeight: 800 }}>{qR ? `Aucune relance ne correspond à « ${q.trim()} »` : periode ? 'Aucune relance sur cette période' : filtre === 'retard' ? 'Rien en retard' : filtre === 'aujourdhui' ? 'Rien pour aujourd’hui' : 'Rien ici'}</b>
          {!qR && !periode && filtre === 'tout' && plusLoin > 0 && <span style={{ fontSize: 13.5, color: DOUX }}>{`Rien d’ici le ${dateCourte(dansSept)}. ${plusLoin > 1 ? `${plusLoin} relances sont prévues plus loin` : '1 relance est prévue plus loin'} : la tuile « Plus loin » les montre.`}</span>}
          {(periode || filtre !== 'tout') && <button type="button" className="rl-appui" onClick={() => { setFiltre('tout'); setPeriode(null); }} style={{ marginTop: 4, height: 36, padding: '0 14px', borderRadius: 11, border: `1px solid ${BORD}`, background: 'white', color: NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Revenir aux relances de la semaine</button>}
        </div>
      ) : (
        <div className="rl-groupes" key={`${filtre}:${periode?.k || ''}`}>
          {visibles.map(g => (
            /* Le dernier qui part emmène son groupe (« En retard »…), en douceur. */
            <div key={g.id} className="rl-pli rl-pli-g" data-partante={g.liste.every(r => partantes[r.id]) ? '' : undefined}><div className="rl-pli-in">
            <section className="rl-groupe" style={{ ['--gc' as string]: g.couleur } as React.CSSProperties}>
              <div className="rl-gt">
                <span className="rl-gt-ic"><Ic n={g.ico} t={15} ep={2.1} /></span>
                <b>{g.titre}</b>
                <span className="rl-gt-n">{g.liste.length}</span>
                {g.sous && <span className="rl-gt-sous">{g.sous}</span>}
              </div>
              <div className="rl-gl">{g.liste.map(r => ligne(r))}</div>
            </section>
            </div></div>
          ))}
        </div>
      )}

      {/* V3.73 — Le tri d'après l'import : à part, sous les relances. */}
      {!seulTri && !loading && tri.length > 0 && (
        <section ref={blocTri} className="rl-tri rl-entre" aria-label="Tri à faire" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 16px 18px', borderRadius: 22, background: '#f6f8fb', border: '1px dashed #d5dde8', scrollMarginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 13, background: 'white', border: '1px solid #dfe5ee', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="drapeau" t={19} ep={2} /></span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <b style={{ fontFamily: JAK, fontSize: 16.5, fontWeight: 800, color: '#1a2332' }}>Tri à faire</b>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>suite à l’import</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#475569', background: 'white', border: '1px solid #dfe5ee', borderRadius: 20, padding: '1px 8px' }}>{tri.length}</span>
              </span>
              <span style={{ fontSize: 13, color: DOUX, lineHeight: 1.5 }}>Des contacts sans nouvelles depuis longtemps : un dernier appel pour savoir s’ils restent dans ton fichier. Ils ne comptent pas dans les relances du dessus.</span>
            </span>
          </div>
          {triVus.length ? triVus.map(r => ligne(r)) : (
            <span style={{ fontSize: 13, color: DOUX, padding: '4px 2px' }}>{`Personne à appeler aujourd’hui. ${triPlusTard > 1 ? `${triPlusTard} appels sont prévus plus tard` : '1 appel est prévu plus tard'}.`}</span>
          )}
          {triPlusTard > 0 && (
            <button type="button" className="rl-appui" onClick={() => setTriTout(x => !x)}
              style={{ alignSelf: 'flex-start', height: 34, padding: '0 14px', borderRadius: 11, border: '1px solid #dfe5ee', background: 'white', color: '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {triTout ? 'Ne garder que ceux du jour' : `Voir aussi les ${triPlusTard > 1 ? `${triPlusTard} prévus plus tard` : 'un prévu plus tard'}`}
            </button>
          )}
        </section>
      )}

      {/* V3.76 — Dans Contacts : le tri seul, ceux à appeler d'abord, puis
          ceux prévus plus tard. Les deux groupes font le chiffre de la tuile. */}
      {seulTri && (loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: PALE, fontSize: 13.5 }}>Chargement…</div>
      ) : tri.length === 0 ? (
        <div className="rl-entre" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '44px 24px', borderRadius: 22, background: 'linear-gradient(180deg, #f0fdf6 0%, #ffffff 100%)', border: '1px solid #cdeedd', textAlign: 'center' }}>
          <span style={{ width: 62, height: 62, borderRadius: 20, background: '#dcfce8', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="coche" t={30} ep={2.4} /></span>
          <b style={{ fontFamily: JAK, fontSize: 19, fontWeight: 800 }}>Tri terminé</b>
          <span style={{ fontSize: 13.5, color: DOUX, lineHeight: 1.55, maxWidth: 460 }}>Tout le monde a eu son dernier appel : ceux qui restent sont dans tes contacts, les autres dans « Archivés ». Cet onglet disparaît dès que tu en choisis un autre.</span>
          {onFini && (
            <button type="button" className="rl-appui" onClick={onFini} style={{ marginTop: 4, height: 38, padding: '0 16px', borderRadius: 12, border: 'none', background: NAVY, color: 'white', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Revoir tous les contacts</button>
          )}
        </div>
      ) : (
        <section className="rl-tri rl-entre" aria-label="Tri à faire" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 16px 18px', borderRadius: 22, background: '#f6f8fb', border: '1px dashed #d5dde8' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 13, background: 'white', border: '1px solid #dfe5ee', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="drapeau" t={19} ep={2} /></span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <b style={{ fontFamily: JAK, fontSize: 16.5, fontWeight: 800, color: '#1a2332' }}>Tri à faire</b>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>suite à l’import</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#475569', background: 'white', border: '1px solid #dfe5ee', borderRadius: 20, padding: '1px 8px' }}>{tri.length}</span>
              </span>
              <span style={{ fontSize: 13, color: DOUX, lineHeight: 1.5 }}>Des contacts sans nouvelles depuis longtemps : un dernier appel pour savoir s’ils restent dans ton fichier. Ce sont les mêmes que dans Relances, en bas de la page.</span>
            </span>
          </div>
          {triGroupes.map(g => (
            <div key={g.id} className="rl-pli rl-pli-g" data-partante={g.liste.every(r => partantes[r.id]) ? '' : undefined}><div className="rl-pli-in">
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 800, letterSpacing: 1.1, textTransform: 'uppercase', color: g.couleur }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.couleur }} />
                <span>{g.titre}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: g.couleur, background: `${g.couleur}14`, borderRadius: 20, padding: '1px 8px', letterSpacing: 0 }}>{g.liste.length}</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0, textTransform: 'none', color: PALE }}>{g.sous}</span>
              </div>
              {g.liste.map(r => ligne(r))}
            </section>
            </div></div>
          ))}
          {!triGroupes.length && (
            <span style={{ fontSize: 13, color: DOUX, padding: '4px 2px' }}>{`Personne ne correspond à « ${cherche.trim()} » dans le tri.`}</span>
          )}
        </section>
      ))}

      {traitee && traitee.clients && (() => {
        const r = traitee, c = r.clients;
        const enTri = estTri(r.note);
        const k = jourDe(r.date_echeance);
        const lib = enTri ? 'Dernier appel pour faire le tri' : origineDe(r, liens[r.id]).lib;
        const texte = enTri ? String(r.note).slice(NOTE_TRI.length) : r.note && r.note !== lib ? r.note : '';
        return (
          <FenetreAction clientId={c.id} prenom={`${c.prenom || ''} ${c.nom || ''}`.trim()} edition={null} typeInitial="appel"
            rechercheId={r.recherche_id || null} titre="Traiter la relance" libelleValider="✓ Valider" proposerArchive={enTri}
            contexte={{ titre: `${lib} · prévue le ${dateCourte(k)}`, texte, telephones: c.telephones || [] }}
            onFermer={() => setTraitee(null)} onFait={info => { void traitement(r, info); }} />
        );
      })()}

      {noteFaite && (
        <div key={toastCle} role="status" className="rl-toast rl-toast-court" style={{ position: 'fixed', left: '50%', bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))', transform: 'translate(-50%,0)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 16, background: NAVY, color: 'white', boxShadow: '0 20px 40px -18px rgba(10,15,24,.6)', maxWidth: 'calc(100vw - 24px)' }}>
          <span className="rl-toast-ok" style={{ width: 26, height: 26, borderRadius: 9, background: 'rgba(16,185,129,.2)', color: '#6ee7b7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="coche" t={15} ep={2.6} /></span>
          <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{noteFaite}</span>
        </div>
      )}

      {annulable && (
        <div key={toastCle} role="status" className="rl-toast rl-toast-long" style={{ position: 'fixed', left: '50%', bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))', transform: 'translate(-50%,0)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px 10px 16px', borderRadius: 16, background: NAVY, color: 'white', boxShadow: '0 20px 40px -18px rgba(10,15,24,.6)', maxWidth: 'calc(100vw - 24px)' }}>
          <span className="rl-toast-ok" style={{ width: 26, height: 26, borderRadius: 9, background: 'rgba(16,185,129,.2)', color: '#6ee7b7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="coche" t={15} ep={2.6} /></span>
          <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{annulable.archive ? `${annulable.nom} archivé.` : `Relance de ${annulable.nom} clôturée.`}</span>
          <button type="button" onClick={annuler} style={{ height: 32, padding: '0 12px', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.12)', color: OR, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Annuler</button>
        </div>
      )}
    </div>
  );
}
