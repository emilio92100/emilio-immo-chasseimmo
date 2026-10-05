'use client';
import { useState, useEffect, useRef } from 'react';
import AvatarContact from '@/components/contacts/AvatarContact';
import { supabase } from '@/lib/supabase';
import { delaiRelance, echeanceDans } from '@/lib/relances';
import { verifie } from '@/lib/ecritures';
import { signalerMaj, demanderOuvertureFiche, ouvertureDepuisRelance, demanderOngletBien } from '@/lib/intentions';
import { chargerAlertesRappro, mandatVu, plusTardAcheteur, type AlerteRappro } from '@/lib/alertes-rappro';
import ChoixDate from '@/components/shared/ChoixDate';

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
 */

const NAVY = '#34496e', OR = '#c9a84c', OR_FONCE = '#8a6a1f', BORD = '#e3e8f0', LIGNE = '#eef1f6';
const DOUX = '#5b6678', PALE = '#8d99ab';
const JAK = "'Plus Jakarta Sans', system-ui, sans-serif";

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

/* ── D'où vient une relance ───────────────────────────────────── */
/* `fort` : ce qui passe avant tout le reste du jour — un client qui veut
   faire une offre. L'étiquette est alors pleine, en or. */
type Origine = { lib: string; ico: string; fort?: boolean };
const veutOffrir = (r: any) => String(r.note || '').startsWith('Veut faire une offre');
function origineDe(r: any, typeAction?: string | null): Origine {
  if (r.type === 'auto') return { lib: 'Biens présentés', ico: 'envoi' };
  if (r.type === 'message_client') return { lib: 'Message du client', ico: 'bulle' };
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

type Filtre = 'tout' | 'retard' | 'aujourdhui' | 'semaine';
/* Voir plus loin que la semaine (V3.71). */
type Periode = { k: '30' | '60' | 'date' | 'entre'; du: string; au: string };

/* Un chiffre qui monte jusqu'à sa valeur à l'arrivée. */
function Compteur({ n }: { n: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now(); const de = 0;
    const pas = (t: number) => {
      const k = Math.min(1, (t - t0) / 650);
      setV(Math.round(de + (n - de) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(pas);
    };
    raf = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return <>{v}</>;
}

export default function PageRelances({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [relances, setRelances] = useState<any[]>([]);
  const [liens, setLiens] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>('tout');
  const [periode, setPeriode] = useState<Periode | null>(null);
  /* Reporter posait une date toute faite sans rien demander : on choisit
     désormais la date, et la ligne se range sous nos yeux. */
  const [report, setReport] = useState<{ id: string; date: string } | null>(null);
  /* « C'est fait » : la carte s'efface, et un bandeau permet d'annuler. */
  const [partantes, setPartantes] = useState<Record<string, boolean>>({});
  const [annulable, setAnnulable] = useState<{ id: string; nom: string } | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Les rapprochements à faire (V3.29) : un acheteur ou un mandat qui vient
     d'arriver, et ce qui leur correspond déjà. */
  const [alertes, setAlertes] = useState<AlerteRappro[]>([]);
  const [alerteEnCours, setAlerteEnCours] = useState('');
  const [toutesAlertes, setToutesAlertes] = useState(false);

  useEffect(() => { charger(); chargerAlertesRappro().then(setAlertes).catch(() => setAlertes([])); }, []);
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);

  async function charger() {
    const { data, error } = await supabase
      .from('relances')
      /* Le client entier : « Ouvrir la fiche » a besoin de l'objet complet. */
      .select('*, clients(*)')
      .eq('statut', 'en_attente')
      .order('date_echeance', { ascending: true });
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
    setAnnulable({ id: r.id, nom: r.clients ? `${r.clients.prenom} ${r.clients.nom}`.trim() : 'la relance' });
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setAnnulable(null), 6000);
    setTimeout(() => { setRelances(l => l.filter(x => x.id !== r.id)); signalerMaj(); }, 420);
  }

  async function annuler() {
    if (!annulable) return;
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
  /* Dans chaque groupe, « Veut faire une offre » passe en tête ; le reste
     garde l'ordre des échéances. */
  const enTete = (l: any[]) => [...l.filter(veutOffrir), ...l.filter(r => !veutOffrir(r))];
  const retard = enTete(relances.filter(r => jourDe(r.date_echeance) < auj));
  const duJour = enTete(relances.filter(r => jourDe(r.date_echeance) === auj));
  const avenir = relances.filter(r => jourDe(r.date_echeance) > auj);
  const demain = plusJours(1), dansSept = plusJours(7);
  const semaine = avenir.filter(r => jourDe(r.date_echeance) <= dansSept);
  const plusLoin = avenir.length - semaine.length;
  /* Les relances d'une période (bornes comprises), de la plus proche à la plus lointaine. */
  const entre = (du: string, au: string) => relances.filter(r => { const k = jourDe(r.date_echeance); return k >= du && k <= au; });
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
    setFiltre('tout');
  }

  /* Les groupes affichés, du plus pressé au plus lointain : jusqu'à la fin
     de la semaine ; une période choisie, rangée par semaine. */
  const groupes: { id: string; titre: string; couleur: string; liste: any[] }[] = [];
  if (periode) {
    const l = enTete(entre(periode.du, periode.au));
    if (periode.du === periode.au) groupes.push({ id: 'jour', titre: `Le ${dateLongue(periode.du)}`, couleur: '#2563eb', liste: l });
    else {
      const parSemaine = new Map<string, typeof l>();
      for (const r of [...l].sort((a, b) => jourDe(a.date_echeance).localeCompare(jourDe(b.date_echeance)))) {
        const k = lundiDe(jourDe(r.date_echeance));
        if (!parSemaine.has(k)) parSemaine.set(k, []);
        parSemaine.get(k)!.push(r);
      }
      for (const [k, liste] of parSemaine) groupes.push({ id: `s${k}`, titre: k === lundiDe(auj) ? 'Semaine en cours' : `Semaine du ${dateCourte(k)}`, couleur: '#2563eb', liste: enTete(liste) });
    }
  } else {
    if (filtre === 'tout' || filtre === 'retard') groupes.push({ id: 'retard', titre: 'En retard', couleur: '#dc2626', liste: retard });
    if (filtre === 'tout' || filtre === 'aujourdhui') groupes.push({ id: 'auj', titre: 'Aujourd’hui', couleur: '#d97706', liste: duJour });
    if (filtre === 'tout' || filtre === 'semaine') {
      groupes.push({ id: 'demain', titre: 'Demain', couleur: '#2563eb', liste: avenir.filter(r => jourDe(r.date_echeance) === demain) });
      groupes.push({ id: 'semaine', titre: 'Cette semaine', couleur: '#2563eb', liste: avenir.filter(r => { const k = jourDe(r.date_echeance); return k > demain && k <= dansSept; }) });
    }
  }
  const visibles = groupes.filter(g => g.liste.length > 0);
  const nbPeriode = periode ? entre(periode.du, periode.au).length : 0;

  const cartes: { id: Filtre; titre: string; n: number; sous: string; ico: string; encre: string; fond: string; trait: string }[] = [
    { id: 'retard', titre: 'En retard', n: retard.length, sous: retard.length ? 'à rattraper en premier' : 'rien en retard', ico: 'alerte', encre: '#b91c1c', fond: '#fef2f2', trait: '#fecaca' },
    { id: 'aujourdhui', titre: 'Aujourd’hui', n: duJour.length, sous: duJour.length ? 'prévues pour ce jour' : 'rien de prévu', ico: 'cloche', encre: '#b45309', fond: '#fff7e6', trait: '#fde3b0' },
    { id: 'semaine', titre: 'Cette semaine', n: semaine.length, sous: semaine.length ? `d’ici le ${dateCourte(dansSept)}${plusLoin ? ` · ${plusLoin} plus loin` : ''}` : plusLoin ? `rien d’ici le ${dateCourte(dansSept)} · ${plusLoin} plus loin` : 'rien de programmé', ico: 'calendrier', encre: '#1d4ed8', fond: '#eff6ff', trait: '#cfe0fd' },
  ];

  let rang = 0;
  return (
    <div className="rl-page" style={{ padding: '28px 28px 40px', display: 'flex', flexDirection: 'column', gap: 22, fontFamily: "'DM Sans', system-ui, sans-serif", color: NAVY }}>
      <style>{`
        @keyframes rlEntre{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes rlPart{to{opacity:0;transform:translateX(24px) scale(.98);max-height:0;margin-bottom:-10px;padding-top:0;padding-bottom:0}}
        @keyframes rlBandeau{from{opacity:0;transform:translate(-50%,16px)}to{opacity:1;transform:translate(-50%,0)}}
        @keyframes rlPouls{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.45)}60%{box-shadow:0 0 0 7px rgba(220,38,38,0)}}
        .rl-entre{animation:rlEntre .45s cubic-bezier(.2,.9,.3,1) both}
        .rl-carte{transition:transform .18s cubic-bezier(.2,.9,.3,1),box-shadow .18s ease,border-color .18s ease}
        .rl-carte:hover{transform:translateY(-2px);box-shadow:0 16px 30px -22px rgba(16,24,40,.45)}
        .rl-ligne{transition:box-shadow .18s ease,border-color .18s ease;max-height:400px}
        .rl-ligne:hover{box-shadow:0 14px 28px -22px rgba(16,24,40,.5);border-color:#d7deea}
        .rl-ligne[data-partante]{animation:rlPart .42s cubic-bezier(.4,0,.2,1) both;overflow:hidden}
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
        @media (prefers-reduced-motion: reduce){.rl-entre,.rl-ligne[data-partante]{animation:none}}
        @media (max-width: 760px){
          .rl-page{padding:16px 12px 96px !important;gap:16px !important}
          .rl-cartes{grid-template-columns:repeat(3,minmax(0,1fr)) !important;gap:8px !important}
          .rl-carte{padding:10px !important;border-radius:16px !important;flex-direction:column !important;align-items:flex-start !important;gap:6px !important}
          .rl-carte-sous{display:none !important}
          .rl-ligne{flex-wrap:wrap !important}
          .rl-actions{width:100%;justify-content:stretch !important}
          .rl-al{grid-template-columns:40px minmax(0,1fr);gap:12px;padding:14px}
          .rl-al-ic{width:40px;height:40px;border-radius:12px}
          .rl-al-btns{grid-column:1 / -1}
          .rl-al-btns > button{flex:1 1 0}
          .rl-actions > button{flex:1 1 0;padding:0 8px !important;white-space:nowrap}
          .rl-long{display:none}
          .rl-court{display:inline !important}
          .rl-titre{font-size:22px !important}
          .rl-periode > span:first-child{width:100%}
          /* Un cran plus petit sur téléphone, au niveau du tableau de bord :
             les lignes étaient écrites trop gros. */
          .rl-carte-n{font-size:22px !important}
          .rl-carte-ico{width:26px !important;height:26px !important}
          .rl-ligne{gap:11px !important;padding:11px 12px 11px 15px !important;border-radius:16px !important}
          .rl-av{width:36px !important;height:36px !important;border-radius:11px !important;font-size:13px !important}
          .rl-nom{font-size:14px !important}
          .rl-note{font-size:12.5px !important}
          .rl-actions > button{height:34px !important;font-size:12.5px !important;border-radius:11px !important}
        }
      `}</style>

      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 className="rl-titre" style={{ margin: 0, fontFamily: JAK, fontSize: 28, fontWeight: 800, letterSpacing: -.5 }}>Relances</h1>
        <p style={{ margin: 0, fontSize: 14, color: PALE }}>Les clients à recontacter cette semaine, du plus pressé au moins pressé. Plus loin : choisis une période.</p>
      </header>

      {alertes.length > 0 && (
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

      {!loading && (
        <div className="rl-cartes" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {cartes.map((c, i) => {
            const actif = !periode && filtre === c.id;
            return (
              <button key={c.id} type="button" className="rl-carte rl-entre" aria-pressed={actif} onClick={() => { setPeriode(null); setFiltre(f => (f === c.id && !periode ? 'tout' : c.id)); }}
                style={{ animationDelay: `${i * 70}ms`, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 18, border: `1.5px solid ${actif ? c.encre : c.n ? c.trait : BORD}`, background: c.n ? c.fond : 'white', color: NAVY, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', boxShadow: actif ? `0 0 0 4px ${c.fond}` : 'none', opacity: (periode || filtre !== 'tout') && !actif ? .6 : 1 }}>
                <span className={`rl-carte-ico${c.id === 'retard' && c.n ? ' rl-pouls' : ''}`} style={{ width: 42, height: 42, borderRadius: 13, background: 'white', color: c.n ? c.encre : PALE, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${c.n ? c.trait : BORD}`, flexShrink: 0 }}><Ic n={c.ico} t={19} ep={2.1} /></span>
                <b className="rl-carte-n" style={{ fontFamily: JAK, fontSize: 32, fontWeight: 800, lineHeight: 1, color: c.n ? c.encre : '#b6c0cf', fontVariantNumeric: 'tabular-nums', minWidth: 24 }}><Compteur n={c.n} /></b>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 800 }}>{c.titre}</span>
                  <span className="rl-carte-sous" style={{ fontSize: 12, color: DOUX, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{actif ? 'filtré · cliquer pour tout revoir' : c.sous}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Plus loin que la semaine (V3.71) : une période, ou un jour, ou entre deux dates. */}
      {!loading && relances.length > 0 && (
        <div className="rl-periode rl-entre" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 16, background: periode ? '#f5f8ff' : 'white', border: `1px solid ${periode ? '#cfe0fd' : BORD}` }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#1d4ed8', marginRight: 4 }}><Ic n="calendrier" t={14} ep={2.1} />Voir plus loin</span>
          {PERIODES.map(x => {
            const actif = periode?.k === x.k;
            const n = x.k === '30' || x.k === '60' ? entre(x.du, x.au).length : null;
            return (
              <button key={x.k} type="button" className="rl-appui" aria-pressed={actif} onClick={() => choisirPeriode(x.k)}
                style={{ height: 32, padding: '0 12px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, border: `1px solid ${actif ? '#1d4ed8' : '#d6e2f5'}`, background: actif ? '#1d4ed8' : 'white', color: actif ? 'white' : NAVY, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span>{x.lib}</span>
                {n !== null && <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 20, background: actif ? 'rgba(255,255,255,.2)' : '#eff6ff', color: actif ? 'white' : '#1d4ed8' }}>{n}</span>}
              </button>
            );
          })}
          {periode?.k === 'date' && (
            <ChoixDate compact valeur={periode.du} placeholder="Choisir le jour" onChange={v => v && setPeriode({ k: 'date', du: v, au: v })} />
          )}
          {periode?.k === 'entre' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 12.5, fontWeight: 700, color: DOUX }}>
              <span>du</span>
              <ChoixDate compact valeur={periode.du} placeholder="Début" onChange={v => v && setPeriode(p => (p ? { ...p, du: v, au: p.au < v ? v : p.au } : p))} />
              <span>au</span>
              <ChoixDate compact valeur={periode.au} min={periode.du} placeholder="Fin" onChange={v => v && setPeriode(p => (p ? { ...p, au: v < p.du ? p.du : v } : p))} />
            </span>
          )}
          {periode && (
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 12px' }}>
              <span style={{ fontSize: 12.5, color: DOUX }}>{`${nbPeriode > 1 ? `${nbPeriode} relances` : nbPeriode === 1 ? '1 relance' : 'Aucune relance'} ${periode.du === periode.au ? `le ${dateCourte(periode.du)}` : `du ${dateCourte(periode.du)} au ${dateCourte(periode.au)}`}`}</span>
              <button type="button" onClick={() => setPeriode(null)} style={{ background: 'none', border: 'none', padding: 0, color: '#1d4ed8', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Revenir à la semaine</button>
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: PALE, fontSize: 13.5 }}>Chargement…</div>
      ) : relances.length === 0 ? (
        <div className="rl-entre" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '44px 24px', borderRadius: 22, background: 'linear-gradient(180deg, #f0fdf6 0%, #ffffff 100%)', border: '1px solid #cdeedd', textAlign: 'center' }}>
          <span style={{ width: 62, height: 62, borderRadius: 20, background: '#dcfce8', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="coche" t={30} ep={2.4} /></span>
          <b style={{ fontFamily: JAK, fontSize: 19, fontWeight: 800 }}>Tout est à jour</b>
          <span style={{ fontSize: 13.5, color: DOUX, lineHeight: 1.55, maxWidth: 440 }}>Aucune relance en attente. Une relance se programme toute seule quand un bien part chez un client, et se clôture dès qu’il répond.</span>
        </div>
      ) : visibles.length === 0 ? (
        <div className="rl-entre" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '34px 24px', borderRadius: 20, background: 'white', border: `1px solid ${BORD}`, textAlign: 'center' }}>
          <span style={{ width: 50, height: 50, borderRadius: 16, background: '#fbf4e1', color: OR_FONCE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="soleil" t={24} ep={1.9} /></span>
          <b style={{ fontFamily: JAK, fontSize: 16, fontWeight: 800 }}>{periode ? 'Aucune relance sur cette période' : 'Rien ici'}</b>
          {!periode && filtre === 'tout' && plusLoin > 0 && <span style={{ fontSize: 13.5, color: DOUX }}>{`Rien d’ici le ${dateCourte(dansSept)}. ${plusLoin > 1 ? `${plusLoin} relances sont prévues plus loin` : '1 relance est prévue plus loin'} : choisis une période juste au-dessus.`}</span>}
          {(periode || filtre !== 'tout') && <button type="button" className="rl-appui" onClick={() => { setFiltre('tout'); setPeriode(null); }} style={{ marginTop: 4, height: 36, padding: '0 14px', borderRadius: 11, border: `1px solid ${BORD}`, background: 'white', color: NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Revenir aux relances de la semaine</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {visibles.map(g => (
            <section key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 800, letterSpacing: 1.1, textTransform: 'uppercase', color: g.couleur }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.couleur }} />
                <span>{g.titre}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: g.couleur, background: `${g.couleur}14`, borderRadius: 20, padding: '1px 8px', letterSpacing: 0 }}>{g.liste.length}</span>
              </div>
              {g.liste.map(r => {
                const k = jourDe(r.date_echeance);
                const e = ecart(k, auj);
                const tag = e < 0 ? { lib: `${-e} j de retard`, encre: '#b91c1c', fond: '#fef2f2' }
                  : e === 0 ? { lib: 'Aujourd’hui', encre: '#b45309', fond: '#fff7e6' }
                  : e === 1 ? { lib: 'Demain', encre: '#1d4ed8', fond: '#eff6ff' }
                  : { lib: `Dans ${e} jours`, encre: '#475569', fond: '#f1f5f9' };
                const o = origineDe(r, liens[r.id]);
                const c = r.clients;
                const nom = c ? `${c.prenom || ''} ${c.nom || ''}`.trim() : 'Client supprimé';
                const ouvert = report?.id === r.id;
                return (
                  <div key={r.id} className="rl-entre" style={{ animationDelay: `${120 + (rang++) * 45}ms` }}>
                    <div className="rl-ligne" data-partante={partantes[r.id] ? '' : undefined}
                      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px 14px 18px', borderRadius: 18, background: 'white', border: `1px solid ${ouvert ? '#ecdcae' : BORD}`, overflow: 'hidden' }}>
                      <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: tag.encre, opacity: .85 }} />
                      <AvatarContact c={c || { prenom: nom }} teinte={{ bg: NAVY, fg: OR }} className="rl-av" libre style={{ width: 44, height: 44, borderRadius: 14 }} />
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 240px', minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <b className="rl-nom" style={{ fontFamily: JAK, fontSize: 15.5, fontWeight: 800 }}>{nom}</b>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: tag.encre, background: tag.fond, borderRadius: 20, padding: '3px 9px' }}>
                            {e < 0 && <span className="rl-pouls" style={{ width: 6, height: 6, borderRadius: '50%', background: tag.encre }} />}{tag.lib}
                          </span>
                        </span>
                        <span className="rl-note" style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, fontSize: 13, color: DOUX }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: 11.5, fontWeight: o.fort ? 800 : 700, color: o.fort ? NAVY : OR_FONCE, background: o.fort ? OR : '#fbf4e1', borderRadius: 8, padding: '2px 8px' }}><Ic n={o.ico} t={12} ep={2.2} />{o.lib}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{r.note && r.note !== o.lib ? r.note : ''}</span>
                        </span>
                        <span style={{ fontSize: 11.5, color: PALE }}>{`prévue le ${dateCourte(k)}`}</span>
                      </span>
                      <span className="rl-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, justifyContent: 'flex-end' }}>
                        {c && (
                          <button type="button" className="rl-appui" onClick={() => ouvrirFiche(r)} title="Ouvrir la fiche, au bon onglet"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 12, border: `1px solid ${BORD}`, background: 'white', color: NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            <span className="rl-long">Ouvrir la fiche</span><span className="rl-court">Fiche</span><Ic n="fleche" t={14} ep={2.2} />
                          </button>
                        )}
                        <button type="button" className="rl-appui" onClick={() => ouvrirReport(r.id)} aria-expanded={ouvert}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, padding: '0 13px', borderRadius: 12, border: `1px solid ${ouvert ? OR : BORD}`, background: ouvert ? '#fffaf0' : 'white', color: ouvert ? OR_FONCE : NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          <Ic n="report" t={14} ep={2.2} />Reporter
                        </button>
                        <button type="button" className="rl-appui" onClick={() => fait(r)}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 12, border: 'none', background: NAVY, color: 'white', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                          <Ic n="coche" t={15} ep={2.6} />C’est fait
                        </button>
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
                );
              })}
            </section>
          ))}
        </div>
      )}

      {annulable && (
        <div role="status" style={{ position: 'fixed', left: '50%', bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))', transform: 'translate(-50%,0)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px 10px 16px', borderRadius: 16, background: NAVY, color: 'white', boxShadow: '0 20px 40px -18px rgba(10,15,24,.6)', animation: 'rlBandeau .3s cubic-bezier(.2,.9,.3,1) both', maxWidth: 'calc(100vw - 24px)' }}>
          <span style={{ width: 26, height: 26, borderRadius: 9, background: 'rgba(16,185,129,.2)', color: '#6ee7b7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="coche" t={15} ep={2.6} /></span>
          <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{`Relance de ${annulable.nom} clôturée.`}</span>
          <button type="button" onClick={annuler} style={{ height: 32, padding: '0 12px', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.12)', color: OR, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Annuler</button>
        </div>
      )}
    </div>
  );
}
