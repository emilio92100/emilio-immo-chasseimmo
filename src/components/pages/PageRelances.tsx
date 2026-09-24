'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { delaiRelance, echeanceDans } from '@/lib/relances';
import { signalerMaj, demanderOuvertureFiche, ouvertureDepuisRelance } from '@/lib/intentions';
import ChoixDate from '@/components/shared/ChoixDate';

/*
 * Les relances : qui recontacter, et quand.
 *
 * En haut, trois compteurs qui servent aussi de filtres (en retard,
 * aujourd'hui, à venir). Dessous, les relances rangées par échéance, chacune
 * avec son origine (biens présentés, un appel, une note, un message du
 * client…). « Ouvrir la fiche » arrive au bon endroit : l'onglet Présentés
 * pour une relance automatique, le Suivi sur l'action qui l'a créée sinon.
 */

const NAVY = '#1a2332', OR = '#c9a84c', OR_FONCE = '#8a6a1f', BORD = '#e3e8f0', LIGNE = '#eef1f6';
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

/* ── D'où vient une relance ───────────────────────────────────── */
type Origine = { lib: string; ico: string };
function origineDe(r: any, typeAction?: string | null): Origine {
  if (r.type === 'auto') return { lib: 'Biens présentés', ico: 'envoi' };
  if (r.type === 'message_client') return { lib: 'Message du client', ico: 'bulle' };
  if (r.type === 'rappel_client') return { lib: 'Demande de rappel', ico: 'tel' };
  if (typeAction === 'appel') return { lib: 'Après un appel', ico: 'tel' };
  if (typeAction === 'rdv') return { lib: 'Après un rendez-vous', ico: 'personne' };
  if (typeAction === 'note') return { lib: 'Note', ico: 'note' };
  if (typeAction === 'email_libre') return { lib: 'Après un mail', ico: 'mail' };
  if (typeAction === 'envoi_externe') return { lib: 'Après un envoi', ico: 'envoi' };
  if (String(r.note || '').startsWith('Rendez-vous :')) return { lib: 'Rappel d’agenda', ico: 'calendrier' };
  return { lib: 'Relance manuelle', ico: 'cloche' };
}

type Filtre = 'tout' | 'retard' | 'aujourdhui' | 'avenir';

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
  /* Reporter posait une date toute faite sans rien demander : on choisit
     désormais la date, et la ligne se range sous nos yeux. */
  const [report, setReport] = useState<{ id: string; date: string } | null>(null);
  /* « C'est fait » : la carte s'efface, et un bandeau permet d'annuler. */
  const [partantes, setPartantes] = useState<Record<string, boolean>>({});
  const [annulable, setAnnulable] = useState<{ id: string; nom: string } | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { charger(); }, []);
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

  async function fait(r: any) {
    const { error } = await supabase.from('relances').update({ statut: 'cloturee' }).eq('id', r.id);
    if (error) { alert(`La relance n'a pas pu être clôturée.\n\n${error.message}`); return; }
    setPartantes(p => ({ ...p, [r.id]: true }));
    setAnnulable({ id: r.id, nom: r.clients ? `${r.clients.prenom} ${r.clients.nom}`.trim() : 'la relance' });
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setAnnulable(null), 6000);
    setTimeout(() => { setRelances(l => l.filter(x => x.id !== r.id)); signalerMaj(); }, 420);
  }

  async function annuler() {
    if (!annulable) return;
    const { error } = await supabase.from('relances').update({ statut: 'en_attente' }).eq('id', annulable.id);
    if (error) { alert(`La relance n'a pas pu être rétablie.\n\n${error.message}`); return; }
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
    const { error } = await supabase.from('relances')
      .update({ date_echeance: new Date(`${jour}T12:00:00`).toISOString() }).eq('id', id);
    if (error) { alert(`La relance n'a pas pu être reportée.\n\n${error.message}`); return; }
    setReport(null);
    charger();
  }

  function ouvrirFiche(r: any) {
    if (!r.clients) return;
    demanderOuvertureFiche(ouvertureDepuisRelance(r, liens[r.id]));
    onNavigate('fiche', r.clients);
  }

  const auj = cleDe(new Date());
  const retard = relances.filter(r => jourDe(r.date_echeance) < auj);
  const duJour = relances.filter(r => jourDe(r.date_echeance) === auj);
  const avenir = relances.filter(r => jourDe(r.date_echeance) > auj);
  const demain = plusJours(1), dansSept = plusJours(7);

  /* Les groupes affichés, du plus pressé au plus lointain. */
  const groupes: { id: string; titre: string; couleur: string; liste: any[] }[] = [];
  if (filtre === 'tout' || filtre === 'retard') groupes.push({ id: 'retard', titre: 'En retard', couleur: '#dc2626', liste: retard });
  if (filtre === 'tout' || filtre === 'aujourdhui') groupes.push({ id: 'auj', titre: 'Aujourd’hui', couleur: '#d97706', liste: duJour });
  if (filtre === 'tout' || filtre === 'avenir') {
    groupes.push({ id: 'demain', titre: 'Demain', couleur: '#2563eb', liste: avenir.filter(r => jourDe(r.date_echeance) === demain) });
    groupes.push({ id: 'semaine', titre: 'Cette semaine', couleur: '#2563eb', liste: avenir.filter(r => { const k = jourDe(r.date_echeance); return k > demain && k <= dansSept; }) });
    groupes.push({ id: 'tard', titre: 'Plus tard', couleur: '#64748b', liste: avenir.filter(r => jourDe(r.date_echeance) > dansSept) });
  }
  const visibles = groupes.filter(g => g.liste.length > 0);

  const cartes: { id: Filtre; titre: string; n: number; sous: string; ico: string; encre: string; fond: string; trait: string }[] = [
    { id: 'retard', titre: 'En retard', n: retard.length, sous: retard.length ? 'à rattraper en premier' : 'rien en retard', ico: 'alerte', encre: '#b91c1c', fond: '#fef2f2', trait: '#fecaca' },
    { id: 'aujourdhui', titre: 'Aujourd’hui', n: duJour.length, sous: duJour.length ? 'prévues pour ce jour' : 'rien de prévu', ico: 'cloche', encre: '#b45309', fond: '#fff7e6', trait: '#fde3b0' },
    { id: 'avenir', titre: 'À venir', n: avenir.length, sous: avenir.length ? `dont ${avenir.filter(r => jourDe(r.date_echeance) <= dansSept).length} cette semaine` : 'rien de programmé', ico: 'calendrier', encre: '#1d4ed8', fond: '#eff6ff', trait: '#cfe0fd' },
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
        .rl-court{display:none}
        @media (prefers-reduced-motion: reduce){.rl-entre,.rl-ligne[data-partante]{animation:none}}
        @media (max-width: 760px){
          .rl-page{padding:16px 12px 96px !important;gap:16px !important}
          .rl-cartes{grid-template-columns:repeat(3,minmax(0,1fr)) !important;gap:8px !important}
          .rl-carte{padding:10px !important;border-radius:16px !important;flex-direction:column !important;align-items:flex-start !important;gap:6px !important}
          .rl-carte-sous{display:none !important}
          .rl-carte-ico{width:30px !important;height:30px !important}
          .rl-carte-n{font-size:26px !important}
          .rl-ligne{flex-wrap:wrap !important}
          .rl-actions{width:100%;justify-content:stretch !important}
          .rl-actions > button{flex:1 1 0;padding:0 8px !important;white-space:nowrap}
          .rl-long{display:none}
          .rl-court{display:inline !important}
          .rl-titre{font-size:25px !important}
        }
      `}</style>

      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 className="rl-titre" style={{ margin: 0, fontFamily: JAK, fontSize: 28, fontWeight: 800, letterSpacing: -.5 }}>Relances</h1>
        <p style={{ margin: 0, fontSize: 14, color: PALE }}>Les clients à recontacter, du plus pressé au plus lointain.</p>
      </header>

      {!loading && (
        <div className="rl-cartes" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {cartes.map((c, i) => {
            const actif = filtre === c.id;
            return (
              <button key={c.id} type="button" className="rl-carte rl-entre" aria-pressed={actif} onClick={() => setFiltre(f => (f === c.id ? 'tout' : c.id))}
                style={{ animationDelay: `${i * 70}ms`, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 18, border: `1.5px solid ${actif ? c.encre : c.n ? c.trait : BORD}`, background: c.n ? c.fond : 'white', color: NAVY, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', boxShadow: actif ? `0 0 0 4px ${c.fond}` : 'none', opacity: filtre !== 'tout' && !actif ? .6 : 1 }}>
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
          <b style={{ fontFamily: JAK, fontSize: 16, fontWeight: 800 }}>Rien ici</b>
          <button type="button" className="rl-appui" onClick={() => setFiltre('tout')} style={{ marginTop: 4, height: 36, padding: '0 14px', borderRadius: 11, border: `1px solid ${BORD}`, background: 'white', color: NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Voir toutes les relances</button>
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
                const initiales = nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m: string) => m[0]).join('').toUpperCase() || '?';
                const ouvert = report?.id === r.id;
                return (
                  <div key={r.id} className="rl-entre" style={{ animationDelay: `${120 + (rang++) * 45}ms` }}>
                    <div className="rl-ligne" data-partante={partantes[r.id] ? '' : undefined}
                      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px 14px 18px', borderRadius: 18, background: 'white', border: `1px solid ${ouvert ? '#ecdcae' : BORD}`, overflow: 'hidden' }}>
                      <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: tag.encre, opacity: .85 }} />
                      <span style={{ width: 44, height: 44, borderRadius: 14, background: NAVY, color: OR, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: JAK, fontSize: 15, fontWeight: 800 }}>{initiales}</span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 240px', minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <b style={{ fontFamily: JAK, fontSize: 15.5, fontWeight: 800 }}>{nom}</b>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: tag.encre, background: tag.fond, borderRadius: 20, padding: '3px 9px' }}>
                            {e < 0 && <span className="rl-pouls" style={{ width: 6, height: 6, borderRadius: '50%', background: tag.encre }} />}{tag.lib}
                          </span>
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, fontSize: 13, color: DOUX }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: OR_FONCE, background: '#fbf4e1', borderRadius: 8, padding: '2px 8px' }}><Ic n={o.ico} t={12} ep={2.2} />{o.lib}</span>
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
