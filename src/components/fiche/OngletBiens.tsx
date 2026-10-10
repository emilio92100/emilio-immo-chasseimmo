'use client';
import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { effacerPhotosBien } from '@/lib/photos';
import { verifie } from '@/lib/ecritures';
import {
  ModaleObservation, ModaleEnvoi, CARTE, StylesEmilio, Icone, NAVY, OR, BORD,
  ModaleScore, ModaleEnvoiGroupe, CaseACocher, honorairesDuMandat, libelleHonoraires,
  ModalePhotos, ModaleHonoraires,
} from './ParcoursBien';
import Cascade from '@/components/shared/Cascade';
import Curseur from '@/components/shared/Curseur';
import FenetreBien, { LigneListe, BasLigne, BoutonBas, BoutonPied, LienPied, Ressort, BoutonVite } from './FenetreBien';
import { prixDuBien } from '@/lib/honoraires-bien';
import { lireIndispo, motifIndispo, remettreDispo } from '@/lib/biens-indispo';
import FenetreIndispo from './FenetreIndispo';

/* V3.165 : le picto de chaque réponse (plus d'émoji dans les nouvelles lignes). */
const ICONES_R: Record<string, string> = {
  propose: 'horloge', interesse: 'etoile', souhaite_visiter: 'oeil', visite: 'cle',
  offre_faite: 'euro', refuse: 'fermer', indispo: 'cadenas',
};

/**
 * Deux onglets pour un seul composant :
 *
 *   mode="selection" → ce que tu as retenu, pas encore envoyé
 *   mode="presentes" → ce que le client a reçu
 */

const RETOURS: Record<string, { l: string; c: string; bg: string; bd: string; i: string }> = {
  propose: { l: 'En attente de retour', c: '#64748b', bg: '#f7f9fc', bd: BORD, i: '⏳' },
  interesse: { l: 'Ça lui plaît', c: '#059669', bg: '#ecfdf5', bd: '#a7f3d0', i: '👍' },
  souhaite_visiter: { l: 'Veut visiter', c: '#7c3aed', bg: '#f5f3ff', bd: '#ddd6fe', i: '👀' },
  visite: { l: 'Visité', c: '#7c3aed', bg: '#f5f3ff', bd: '#ddd6fe', i: '🔑' },
  offre_faite: { l: 'Offre faite', c: '#b45309', bg: '#fffbeb', bd: '#fde68a', i: '✍️' },
  refuse: { l: 'Pas pour lui', c: '#dc2626', bg: '#fef2f2', bd: '#fecaca', i: '👎' },
  /* V3.164 : un bien trouvé ailleurs, vendu ou retiré, d'après l'agence ou le vendeur. */
  indispo: { l: 'Plus disponible', c: '#475569', bg: '#f1f5f9', bd: '#cbd5e1', i: '🔒' },
};

/* Un bien présenté reste présenté : c'est son historique. Mais dans l'onglet,
   il se range selon ce que le client en a dit, et ce qui appelle une action
   de ta part passe devant. « En attente » n'est pas une réponse : c'est un
   silence, et c'est ce qui relance. */
const GROUPES_P: { id: string; titre: string; note?: string }[] = [
  { id: 'souhaite_visiter', titre: 'Il veut visiter', note: 'À caler en priorité : contacte l’agence ou le vendeur.' },
  { id: 'interesse', titre: 'Ça lui plaît', note: 'Tiède ou chaud : un appel tranche souvent plus vite qu’un message.' },
  { id: 'propose', titre: 'En attente de son retour', note: 'Il ne s’est pas encore prononcé. Relance au bout de deux ou trois jours.' },
  { id: 'offre_faite', titre: 'Offre faite' },
  { id: 'visite', titre: 'Visite effectuée' },
  { id: 'refuse', titre: 'Pas pour lui', note: 'Lis la raison : c’est elle qui affine la recherche suivante.' },
  { id: 'indispo', titre: 'Plus disponible', note: 'Vendus, sous compromis ou retirés : il le voit aussi dans son espace, avec ton mot.' },
];
/* V3.164 : « Plus disponible » l'emporte sur son retour (il ne demande plus rien). */
const groupeP = (b: { badge_retour?: string | null; indispo?: unknown }) =>
  (lireIndispo(b.indispo) ? 'indispo' : b.badge_retour && GROUPES_P.some(g => g.id === b.badge_retour) ? b.badge_retour : 'propose');

/* Retirer un bien est rare et sans retour : le bouton se voit quand on le
   cherche, jamais assez pour être cliqué de travers. */
function LienRetirer({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title="Retirer ce bien du dossier"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
        color: '#c3ccda', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        padding: '4px 2px', transition: 'color .12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; }}
      onMouseLeave={e => { e.currentTarget.style.color = '#c3ccda'; }}>
      <IconeCorbeille /> Retirer
    </button>
  );
}

function IconeCorbeille({ taille = 14 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

/* « Il y a deux heures » se lit plus vite qu'une date. */
function depuisQuand(d?: string | null) {
  if (!d) return '';
  const x = new Date(d); if (isNaN(x.getTime())) return '';
  const min = Math.round((Date.now() - x.getTime()) / 60000);
  if (min < 2) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j === 1) return 'hier';
  if (j < 8) return `il y a ${j} jours`;
  return 'le ' + x.toLocaleDateString('fr-FR');
}

/* ══ La barre des biens cochés ═════════════════════════════════
   Elle monte du bas dès qu'un bien est coché, et reste à portée de pouce
   pendant qu'on fait défiler la liste. Posée sur la page (portail) : le
   panneau de l'onglet s'anime avec un transform, qui piégerait un
   `position: fixed`. Sur téléphone, elle se cale au-dessus de la barre
   d'onglets. */
function BarreGroupe({ n, onEnvoyer, onVider }: { n: number; onEnvoyer: () => void; onVider: () => void }) {
  const [monte, setMonte] = useState(false);
  useEffect(() => { setMonte(true); }, []);
  if (!monte) return null;
  return createPortal(
    <div className="emi-barre-groupe" role="region" aria-label="Biens cochés">
      <style>{`
        .emi-barre-groupe{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:80;display:flex;align-items:center;gap:12px;
          background:${NAVY};color:#fff;border-radius:16px;padding:9px 9px 9px 14px;max-width:calc(100vw - 24px);box-sizing:border-box;
          box-shadow:0 18px 40px -12px rgba(12,18,30,.55),0 2px 6px rgba(12,18,30,.2);font-family:'Plus Jakarta Sans',system-ui,sans-serif;
          animation:emiBarreMonte .28s cubic-bezier(.22,.9,.3,1) both}
        @keyframes emiBarreMonte{from{opacity:0;transform:translate(-50%,16px)}to{opacity:1;transform:translate(-50%,0)}}
        .emi-bg-n{min-width:26px;height:26px;border-radius:8px;background:${OR};color:${NAVY};font-weight:800;font-size:13.5px;display:inline-flex;align-items:center;justify-content:center;padding:0 7px;box-sizing:border-box}
        .emi-bg-txt{font-size:13.5px;font-weight:700;white-space:nowrap}
        .emi-bg-vider{background:none;border:none;color:rgba(255,255,255,.62);font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;padding:6px 4px;text-decoration:underline;text-underline-offset:3px;white-space:nowrap}
        .emi-bg-vider:hover{color:#fff}
        .emi-bg-go{display:inline-flex;align-items:center;gap:8px;background:${OR};color:${NAVY};border:none;border-radius:11px;padding:10px 16px;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;white-space:nowrap;margin-left:6px}
        .emi-bg-go:hover{filter:brightness(1.06)}
        @media (max-width:900px){
          .emi-barre-groupe{left:10px;right:10px;transform:none;bottom:calc(74px + env(safe-area-inset-bottom,0px));animation-name:emiBarreMonteM}
          .emi-bg-go{margin-left:auto}
        }
        @media (max-width:520px){ .emi-bg-txt{display:none} }
        @keyframes emiBarreMonteM{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
      `}</style>
      <span className="emi-bg-n">{n}</span>
      <span className="emi-bg-txt">{n > 1 ? 'biens cochés' : 'bien coché'}</span>
      <button type="button" className="emi-bg-vider" onClick={onVider}>Tout décocher</button>
      <button type="button" className="emi-bg-go" onClick={onEnvoyer}>
        <Icone nom="envoyer" taille={16} epaisseur={2} />
        {n > 1 ? `Envoyer les ${n} ensemble` : 'Envoyer ce bien'}
      </button>
    </div>,
    document.body,
  );
}

interface Props {
  clientId: string;
  rechercheId: string;
  client: any;
  mode: 'selection' | 'presentes';
  onChange?: () => void;
  onMail: (bienId: string) => void;
  onFiche: (bienId: string) => void;
  onVisite: (bienId: string) => void;
  /** Envoi groupé par mail : ouvre la fenêtre de mail du dossier avec ces biens. */
  onMailGroupe?: (ids: string[]) => void;
  /** Change quand la fiche vient d'envoyer un mail : la liste se recharge. */
  rafraichir?: number;
  /** V3.129 : le bien à amener à l'écran et à entourer un instant (Visites › « Voir sur sa fiche »). */
  vise?: string | null;
}

export default function OngletBiens({ clientId, rechercheId, client, mode, onChange, onMail, onFiche, onVisite, onMailGroupe, rafraichir = 0, vise = null }: Props) {
  const [biens, setBiens] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);
  const [obs, setObs] = useState<any>(null);
  const [envoi, setEnvoi] = useState<any>(null);
  const [tick, setTick] = useState(0);
  const [filtreP, setFiltreP] = useState('tout');   // onglet « Présentés » : quel retour afficher
  /* La note de la veille suit le bien : sa fenêtre s'ouvre ici aussi, et la
     recherche sert à dire ce que le bien coche d'office. */
  const [scoreOuvert, setScoreOuvert] = useState<any>(null);
  const [recherche, setRecherche] = useState<any>(null);
  /* Les biens cochés pour partir ensemble (onglet Sélection). */
  const [coches, setCoches] = useState<string[]>([]);
  const [envoiGroupe, setEnvoiGroupe] = useState<any[] | null>(null);
  /* Le bien dont on réorganise les photos. */
  const [photosDe, setPhotosDe] = useState<any>(null);
  /* V3.145 : les honoraires d'un bien présenté (inter ou pas), à changer après coup. */
  const [honoDe, setHonoDe] = useState<any>(null);
  /* V3.164 : « Ce bien n'est plus disponible » (FenetreIndispo). */
  const [indispoDe, setIndispoDe] = useState<any>(null);
  /* V3.165 : le bien ouvert en grand (son id, et sa place dans la liste). */
  const [grand, setGrand] = useState<{ id: string; i: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /* Le « Chargement… » ne s'affiche qu'à la première lecture : un
     rechargement (après un envoi, un retour noté) ne doit pas faire
     disparaître la liste — ni la fenêtre ouverte dessus. */
  const dejaLu = useRef(false);
  useEffect(() => { dejaLu.current = false; }, [rechercheId, mode]);

  const charger = useCallback(async () => {
    if (!rechercheId) return;
    if (!dejaLu.current) setChargement(true);
    const { data } = await supabase
      .from('biens')
      .select('*')
      .eq('recherche_id', rechercheId)
      .eq('etape', mode === 'selection' ? 'selection' : 'presente')
      .order(mode === 'selection' ? 'created_at' : 'envoye_le', { ascending: false, nullsFirst: false });
    setBiens(data || []);
    /* Un bien parti en « Présentés » ou retiré n'est plus coché. */
    setCoches(cs => cs.filter(id => (data || []).some((b: any) => b.id === id)));
    dejaLu.current = true;
    setChargement(false);
  }, [rechercheId, mode]);

  /* Relue à chaque rechargement : le mandat a pu changer entre-temps, et ses
     honoraires sont ceux qu'on propose à l'envoi. */
  useEffect(() => {
    if (!rechercheId) return;
    supabase.from('recherches').select('*').eq('id', rechercheId).maybeSingle()
      .then(({ data }) => setRecherche(data || null));
  }, [rechercheId, tick, rafraichir]);

  useEffect(() => { charger(); }, [charger, tick, rafraichir]);

  /* V3.129 (Alexandre : « ouvrir la fiche, que ça renvoie directement sur la
     recherche, présentés, il veut visiter, en se mettant sur le bien en
     question ») : la liste lue, on descend jusqu'au bien, entouré un instant. */
  const [eclaire, setEclaire] = useState<string | null>(null);
  const viseFait = useRef(false);
  useEffect(() => {
    if (!vise || viseFait.current || chargement || !biens.some(b => b.id === vise)) return;
    viseFait.current = true;
    setFiltreP('tout');
    setEclaire(vise);
    /* Sans nettoyage : un rechargement de la liste ne doit pas annuler la descente. */
    window.setTimeout(() => document.getElementById(`bien-${vise}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 700);
    window.setTimeout(() => setEclaire(null), 6000);
  }, [vise, chargement, biens]);

  const recharge = () => { setTick(t => t + 1); onChange?.(); };

  async function demanderPdf(bienId: string) {
    await verifie('La demande de fiche PDF', supabase.from('biens').update({
      pdf_statut: 'demande', pdf_demande_le: new Date().toISOString(),
      pdf_url: null, pdf_message: null,
    }).eq('id', bienId).select('id'), { ligne: true });
    recharge();
  }

  /* V3.164 : de nouveau à vendre — il revient dans ses biens présentés. */
  async function remettre(b: any) {
    if (await remettreDispo({ bien: b, clientId, rechercheId })) { recharge(); }
  }

  async function renvoyerEnSelection(bienId: string) {
    await verifie('Le retour en sélection', supabase.from('biens').update({ etape: 'selection', envoye_le: null, canal_envoi: null }).eq('id', bienId).select('id'), { ligne: true });
    recharge();
  }

  /**
   * Retirer un bien du dossier.
   *
   * Trois précautions, dans cet ordre :
   *   1. une visite calée ou déjà faite bloque le retrait — on ne fait pas
   *      disparaître un bien qui est dans l'agenda ;
   *   2. la proposition de veille repasse en « écartée » AVANT la suppression,
   *      avec un motif : la prochaine veille ne le reproposera pas, et il
   *      reste rattrapable depuis « les écartées » de l'onglet Veille ;
   *   3. les photos et les plans hébergés chez nous partent avec lui, sinon ils
   *      resteraient à occuper du stockage sans que rien ne les affiche.
   */
  async function retirer(b: any) {
    const nom = b.titre || b.ville || 'ce bien';

    const { data: vis } = await supabase.from('visites')
      .select('id').eq('bien_id', b.id).in('statut', ['a_venir', 'effectuee']).limit(1);
    if (vis && vis.length > 0) {
      alert(`« ${nom} » est dans ton agenda.\n\nAnnule d'abord la visite depuis l'onglet Visites, puis retire le bien.`);
      return;
    }

    /* Une seule fenêtre pour confirmer ET dire pourquoi : le motif part dans la
       mémoire de la veille, exactement comme celui du bouton « Écarter ».
       Annuler → on ne fait rien. Valider à vide → on retire sans rien lui
       apprendre. */
    const suite = mode === 'selection'
      ? 'Il repart dans les écartées de la veille : tu pourras le remettre de là si tu changes d’avis.'
      : 'Il a déjà été envoyé au client : il disparaîtra aussi de son espace, avec le retour qu’il a pu laisser.';
    const saisi = window.prompt(
      `Retirer « ${nom} » ?\n\n${suite}\n\nPourquoi ? La prochaine veille le lira et évitera les biens du même genre.\n(Laisse vide et valide si tu préfères ne rien dire.)`,
      '',
    );
    if (saisi === null) return;

    /* Vérifié (V3.17) : si la veille n'a pas noté l'écart, on s'arrête —
       sinon elle reproposerait le bien. */
    if (!(await verifie('Le retrait du bien', supabase.from('veille_propositions').update({
      statut: 'ecarte', bien_id: null,
      motif_ecart: saisi.trim() || (mode === 'selection' ? 'Retiré de la sélection' : 'Retiré du dossier'),
      decide_le: new Date().toISOString(),
    }).eq('bien_id', b.id)))) return;

    /* La ligne d'abord, vérifiée ; les photos ensuite, et seulement si
       personne d'autre ne s'en sert (V3.33) : un bien venu de la veille
       partage ses fichiers avec la proposition, que « Remettre » fait revenir. */
    if (!(await verifie('Le retrait du bien', supabase.from('biens').delete().eq('id', b.id).select('id'), { ligne: true }))) { recharge(); return; }
    await effacerPhotosBien([...(b.photos || []), ...(b.plans || [])]);
    recharge();
  }

  const euros = (n: any) => (n == null ? '—' : Number(n).toLocaleString('fr-FR') + ' €');

  /* Un mot bref dans la fenêtre après un choix, qui s'efface tout seul. */
  const minuteur = useRef<number | undefined>(undefined);
  const dire = (m: string) => {
    setMessage(m);
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => setMessage(null), 2800);
  };
  useEffect(() => () => window.clearTimeout(minuteur.current), []);

  if (chargement) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#b6c1d1', fontSize: 14, minHeight: 200 }}>Chargement…</div>;
  }

  if (biens.length === 0) {
    return (
      <><StylesEmilio /><div className="emi-arrivee" style={{ ...CARTE, padding: '44px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>{mode === 'selection' ? '📋' : '📤'}</div>
        <div style={{ fontWeight: 700, color: NAVY, fontSize: 15, marginBottom: 4 }}>
          {mode === 'selection' ? 'Aucun bien en sélection' : 'Rien n’a encore été envoyé'}
        </div>
        <div style={{ color: '#94a3b8', fontSize: 13 }}>
          {mode === 'selection'
            ? 'Retiens un bien depuis l’onglet Veille et il apparaîtra ici.'
            : 'Les biens que tu envoies depuis la Sélection arrivent dans cet onglet.'}
        </div>
      </div></>
    );
  }

  /* Le rangement de l'onglet « Présentés ». En mode sélection, rien ne change. */
  const parGroupe: Record<string, any[]> = {};
  biens.forEach(b => { const g = groupeP(b); (parGroupe[g] ||= []).push(b); });
  const groupesVisibles = mode === 'presentes' ? GROUPES_P.filter(g => (parGroupe[g.id] || []).length > 0) : [];
  const repondus = biens.filter(b => b.badge_retour && b.badge_retour !== 'propose').length;
  const ordonnes = mode === 'presentes' ? groupesVisibles.flatMap(g => parGroupe[g.id]) : biens;
  const affiches = mode === 'presentes' && filtreP !== 'tout' ? (parGroupe[filtreP] || []) : ordonnes;
  /* Un titre de groupe s'insère au-dessus du premier bien de chaque groupe. */
  const enTeteDe = (b: any, idx: number) => {
    if (mode !== 'presentes' || filtreP !== 'tout') return null;
    const g = groupeP(b);
    if (idx > 0 && groupeP(affiches[idx - 1]) === g) return null;
    const def = GROUPES_P.find(x => x.id === g)!;
    const r = RETOURS[g];
    return (
      <div key={'t-' + g} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: idx === 0 ? '2px 0 -2px' : '16px 0 -2px', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', color: r.c }}><Icone nom={ICONES_R[g] || 'horloge'} taille={17} epaisseur={2.1} /></span>
        <span style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>{def.titre}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: r.c, background: r.bg, border: `1px solid ${r.bd}`, borderRadius: 20, padding: '1px 8px' }}>{parGroupe[g].length}</span>
        {def.note && <span style={{ fontSize: 12.5, color: '#94a3b8', flex: '1 1 260px' }}>{def.note}</span>}
      </div>
    );
  };

  /* Cocher plusieurs biens pour les envoyer ensemble : un seul mail, une
     seule notification. Seulement dans « Sélection », et dès deux biens. */
  const groupable = mode === 'selection' && biens.length >= 2;
  const tout = groupable && coches.length === biens.length;
  const basculer = (id: string) => setCoches(cs => (cs.includes(id) ? cs.filter(x => x !== id) : [...cs, id]));
  const toutBasculer = () => setCoches(tout ? [] : biens.map(b => b.id));
  const envoyerCoches = () => {
    const lot = biens.filter(b => coches.includes(b.id));
    if (lot.length === 1) setEnvoi(lot[0]);
    else if (lot.length > 1) setEnvoiGroupe(lot);
  };
  const mandat = honorairesDuMandat(recherche);

  /* V3.165 : le bien ouvert en grand. On retient son id ET sa place : s'il
     quitte la liste (envoyé, retiré), la fenêtre montre celui qui prend sa
     place — le suivant —, et se ferme quand il n'y a plus rien. */
  const idxGrand = grand
    ? (() => { const j = affiches.findIndex(b => b.id === grand.id); return j >= 0 ? j : Math.min(grand.i, affiches.length - 1); })()
    : -1;
  const ouvrir = (id: string) => setGrand({ id, i: Math.max(0, affiches.findIndex(b => b.id === id)) });
  const allerA = (j: number) => { const b = affiches[j]; if (b) setGrand({ id: b.id, i: j }); };

  /* Ce qui s'écrit sous le prix, dans la ligne comme dans la fenêtre. */
  const sousPrixDe = (b: any) => {
    const prixAff = prixDuBien(b).demande;
    return libelleHonoraires(b, mode === 'presentes')
      || (prixAff && b.surface ? `${Math.round(prixAff / Number(b.surface)).toLocaleString('fr-FR')} €/m²` : null);
  };

  /* Le bas d'une ligne des Présentés : sa réponse, ou son silence, et quoi faire. */
  const basPresente = (b: any) => {
    const x = lireIndispo(b.indispo);
    if (x) {
      return (
        <BasLigne couleur="#475569" fond="#f1f5f9" bord="#cbd5e1" icone="cadenas"
          etat={`Plus disponible · ${motifIndispo(x.motif).l}`}
          mot={x.note ? `Ton mot : « ${x.note} »` : 'Pas de mot laissé : il lit seulement le motif.'} vide={!x.note}
          boutons={<BoutonBas onClick={() => { void remettre(b); }}>Remettre disponible</BoutonBas>} />
      );
    }
    const g = b.badge_retour && RETOURS[b.badge_retour] ? b.badge_retour : 'propose';
    const r = RETOURS[g];
    if (g === 'propose') {
      const canal = b.canal_envoi === 'mail' ? ' par mail' : b.canal_envoi === 'whatsapp' ? ' par WhatsApp' : '';
      const quand = b.envoye_le ? `Envoyé ${depuisQuand(b.envoye_le)}${canal}` : 'Envoyé';
      return (
        <BasLigne couleur="#64748b" fond="#f7f9fc" bord={BORD} icone="horloge" etat="En attente de son retour"
          mot={`${quand} · ${b.nb_vues ? `ouvert ${b.nb_vues} fois` : 'jamais ouvert'}`} vide
          boutons={<BoutonBas onClick={() => setObs(b)}>Noter son retour</BoutonBas>} />
      );
    }
    const par = b.retour_par === 'conseiller' ? 'noté par toi' : 'depuis son espace';
    const quand = [depuisQuand(b.retour_le), par].filter(Boolean).join(', ');
    const aUnMot = !!b.retour_client && b.retour_client !== r.l;
    const visiter = g === 'souhaite_visiter' || g === 'interesse';
    return (
      <BasLigne couleur={r.c} fond={r.bg} bord={r.bd} icone={ICONES_R[g] || 'horloge'} etat={r.l}
        mot={aUnMot
          ? <>{`« ${b.retour_client} »`}{' '}<small>{`· ${quand}`}</small></>
          : <small>{g === 'refuse' ? `Pas de mot · ${quand}. Un appel dirait ce qui a bloqué.` : `Pas de mot · ${quand}`}</small>}
        vide={!aUnMot}
        boutons={<>
          <BoutonBas onClick={() => setObs(b)}>Noter son retour</BoutonBas>
          {visiter && <BoutonBas ton="violet" onClick={() => onVisite(b.id)}>Planifier une visite</BoutonBas>}
        </>} />
    );
  };

  /* Le bas d'une ligne de la Sélection : la fiche soignée, quand elle est en route. */
  const basSelection = (b: any) => {
    if (b.pdf_message) {
      return <BasLigne couleur="#92400e" fond="#fffbeb" bord="#fde68a" icone="alerte" etat="Fiche soignée" mot={b.pdf_message} vide />;
    }
    if (b.pdf_statut === 'pret' && b.pdf_url) {
      return (
        <BasLigne couleur="#15803d" fond="#f0fdf4" bord="#bbf7d0" icone="doc" etat="Fiche soignée prête"
          boutons={<BoutonBas onClick={() => window.open(b.pdf_url, '_blank', 'noopener')}>La consulter</BoutonBas>} />
      );
    }
    if (b.pdf_statut === 'demande') {
      return <BasLigne couleur="#64748b" fond="#f7f9fc" bord={BORD} icone="horloge" etat="Fiche soignée demandée" mot="Elle sera prête à la prochaine session." vide />;
    }
    return undefined;
  };

  /* ── La fenêtre : ce qui change d'un onglet à l'autre ── */
  const bandeauDe = (b: any) => {
    const r = RETOURS[b.badge_retour] || RETOURS.propose;
    const aRepondu = mode === 'presentes' && b.badge_retour && b.badge_retour !== 'propose';
    const x = mode === 'presentes' ? lireIndispo(b.indispo) : null;
    return (
      <>
        {x && (
          <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', color: '#475569' }}><Icone nom="cadenas" taille={16} epaisseur={2.1} /></span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#334155' }}>{`Plus disponible · ${motifIndispo(x.motif).l}`}</span>
              {x.le && <span style={{ fontSize: 12.5, color: '#94a3b8', fontWeight: 600 }}>{`· ${depuisQuand(x.le)}`}</span>}
              <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#94a3b8' }}>Vu dans son espace</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.55, color: x.note ? NAVY : '#94a3b8', fontWeight: x.note ? 600 : 500 }}>
              {x.note ? `Ton mot : « ${x.note} »` : 'Pas de mot laissé : il lit seulement le motif.'}
            </div>
          </div>
        )}
        {aRepondu && (
          <div style={{ background: r.bg, border: `1px solid ${r.bd}`, borderRadius: 14, padding: '13px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', color: r.c }}><Icone nom={ICONES_R[b.badge_retour] || 'horloge'} taille={17} epaisseur={2.1} /></span>
              <span style={{ fontSize: 15, fontWeight: 800, color: r.c }}>{r.l}</span>
              {b.retour_le && <span style={{ fontSize: 12.5, color: '#94a3b8', fontWeight: 600 }}>{`· ${depuisQuand(b.retour_le)}, ${b.retour_par === 'conseiller' ? 'noté par toi' : 'depuis son espace'}`}</span>}
              <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#a9b6c8' }}>Son retour</span>
            </div>
            {b.retour_client && b.retour_client !== r.l ? (
              <div style={{ marginTop: 7, fontSize: 15, lineHeight: 1.6, color: NAVY, fontWeight: 600 }}>{`« ${b.retour_client} »`}</div>
            ) : (
              <div style={{ marginTop: 6, fontSize: 13, color: '#94a3b8', lineHeight: 1.55 }}>
                {b.badge_retour === 'refuse' ? 'Il n’a pas laissé de mot. Un appel dirait ce qui a bloqué : c’est ce qui manque pour affiner la recherche.' : 'Il n’a pas laissé de mot.'}
              </div>
            )}
          </div>
        )}
        {mode === 'selection' && b.pdf_message && (
          <div style={{ fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 14px', lineHeight: 1.5 }}>
            {b.pdf_message}
          </div>
        )}
      </>
    );
  };

  const prixDe = (b: any) => {
    const hono = libelleHonoraires(b, mode === 'presentes');
    const prixAff = prixDuBien(b).demande;
    return {
      montant: prixAff,
      dessous: (
        <>
          {hono
            ? mode === 'presentes' && !b.bien_vente_id
              ? (
                <button type="button" onClick={() => setHonoDe(b)} title="Changer : avec inter, sans inter, particulier"
                  style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 12.5, color: '#64748b', fontWeight: 600, cursor: 'pointer', textAlign: 'inherit' }}>
                  {hono}<span style={{ color: NAVY, fontWeight: 800 }}>{' · Modifier'}</span>
                </button>
              )
              : <span>{hono}</span>
            : prixAff && b.surface ? <span>{`${Math.round(prixAff / Number(b.surface)).toLocaleString('fr-FR')} €/m²`}</span> : null}
          {mode === 'presentes' && b.envoye_le && (
            <span>{`Envoyé le ${new Date(b.envoye_le).toLocaleDateString('fr-FR')}${b.canal_envoi ? ` · ${b.canal_envoi === 'mail' ? 'mail' : b.canal_envoi === 'whatsapp' ? 'WhatsApp' : 'lien'}` : ''}`}</span>
          )}
          {mode === 'presentes' && (
            <span style={{ fontWeight: 700, color: b.nb_vues ? '#2563eb' : '#94a3b8' }}>{b.nb_vues ? `Ouvert ${b.nb_vues} fois par le client` : 'Jamais ouvert'}</span>
          )}
        </>
      ),
    };
  };

  const coinDe = (b: any) => {
    if (mode !== 'presentes') return undefined;
    const g = groupeP(b);
    const r = RETOURS[g] || RETOURS.propose;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: r.bg, color: r.c, border: `1px solid ${r.bd}`, borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 800, boxShadow: '0 4px 12px -6px rgba(16,24,40,.5)' }}>
        <Icone nom={ICONES_R[g] || 'horloge'} taille={14} epaisseur={2.2} />{r.l}
      </span>
    );
  };

  const piedDe = (b: any) => {
    if (mode === 'selection') {
      return (
        <>
          <LienRetirer onClick={() => retirer(b)} />
          <Ressort />
          {b.pdf_statut === 'pret' && b.pdf_url ? (
            <BoutonPied href={b.pdf_url}><Icone nom="doc" taille={16} epaisseur={2} />Fiche prête : la consulter</BoutonPied>
          ) : b.pdf_statut === 'demande' ? (
            <BoutonPied disabled><Icone nom="horloge" taille={16} epaisseur={2} />Fiche demandée</BoutonPied>
          ) : (
            <BoutonPied onClick={() => demanderPdf(b.id)}><Icone nom="doc" taille={16} epaisseur={2} />Demander une fiche soignée</BoutonPied>
          )}
          <BoutonPied ton="or" onClick={() => setEnvoi(b)}><Icone nom="envoyer" taille={16} epaisseur={2} />Envoyer au client</BoutonPied>
        </>
      );
    }
    const indispo = lireIndispo(b.indispo);
    return (
      <>
        {/* V3.164 : un bien trouvé ailleurs (un bien de l'agence suit sa fiche). */}
        {!b.bien_vente_id && !indispo && (
          <LienPied onClick={() => setIndispoDe(b)} titre="Vendu, sous compromis ou retiré, d’après l’agence ou le vendeur">Plus disponible</LienPied>
        )}
        <LienPied onClick={() => renvoyerEnSelection(b.id)}>Remettre en sélection</LienPied>
        <LienRetirer onClick={() => retirer(b)} />
        <Ressort />
        {b.pdf_url && <BoutonPied href={b.pdf_url}><Icone nom="doc" taille={16} epaisseur={2} />Le PDF</BoutonPied>}
        <BoutonPied ton="navy" onClick={() => setObs(b)}><Icone nom="note" taille={16} epaisseur={2} />Noter son retour</BoutonPied>
        {indispo
          ? <BoutonPied onClick={() => { void remettre(b); }}><Icone nom="remettre" taille={16} epaisseur={2} />Remettre disponible</BoutonPied>
          : <BoutonPied ton="violet" onClick={() => onVisite(b.id)}><Icone nom="calendrier" taille={16} epaisseur={2} />Planifier une visite</BoutonPied>}
      </>
    );
  };

  /* Une fenêtre ouverte par-dessus (retour, envoi, photos…) : la grande
     fenêtre reste dessous, ses touches attendent. */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <StylesEmilio />
      {/* V3.129 : le bien qu'on vient voir, entouré en violet un instant. */}
      {eclaire && <style>{`
        .emi-vise { border-color: #7c3aed !important; animation: emiVise 1.6s ease-out 3 !important; }
        @keyframes emiVise { 0% { box-shadow: 0 0 0 0 rgba(124,58,237,.5); } 70%, 100% { box-shadow: 0 0 0 14px rgba(124,58,237,0); } }
        @media (prefers-reduced-motion: reduce) { .emi-vise { animation: none !important; box-shadow: 0 0 0 3px rgba(124,58,237,.35); } }
      `}</style>}

      <div className="emi-arrivee" style={{ display: 'flex', alignItems: 'baseline', gap: 11, flexWrap: 'wrap', marginBottom: 4 }}>
        <span className="emi-titre-onglet" style={{ fontSize: 19, fontWeight: 800, color: NAVY, letterSpacing: -.3 }}>
          {`${biens.length} bien${biens.length > 1 ? 's' : ''} ${mode === 'selection' ? 'en sélection' : 'présenté' + (biens.length > 1 ? 's' : '')}`}
        </span>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          {mode === 'selection' ? 'Ouvre un bien en grand pour le revoir, puis envoie-le.' : 'Rangés selon ce que le client en a dit.'}
        </span>
        {mode === 'presentes' && repondus > 0 && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 20, padding: '5px 13px', fontSize: 12.5, fontWeight: 800 }}>
            <Icone nom="note" taille={14} epaisseur={2.1} />{`${repondus} retour${repondus > 1 ? 's' : ''} reçu${repondus > 1 ? 's' : ''}`}
          </span>
        )}
      </div>

      {groupable && (
        <div className="emi-tout-cocher" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '0 0 0 15px', minHeight: 30 }}>
          <CaseACocher actif={tout} partiel={coches.length > 0 && !tout} onClick={toutBasculer}
            titre={tout ? 'Tout décocher' : 'Tout cocher'} />
          <button type="button" onClick={toutBasculer}
            style={{ background: 'none', border: 'none', padding: '4px 0', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: NAVY, cursor: 'pointer' }}>
            {tout ? 'Tout décocher' : `Tout cocher (${biens.length})`}
          </button>
          <span style={{ fontSize: 12.5, color: '#94a3b8', flex: '1 1 240px' }}>
            {coches.length > 0
              ? `${coches.length} sur ${biens.length} coché${coches.length > 1 ? 's' : ''} : ils partiront ensemble, en un seul mail.`
              : 'Coche plusieurs biens pour les envoyer ensemble : un seul mail, une seule notification.'}
          </span>
        </div>
      )}

      {/* V3.167 : la barre de « Demandes Internet » — la pastille marine
          glisse d'un filtre à l'autre (Curseur), le compteur passe au doré. */}
      {mode === 'presentes' && groupesVisibles.length > 1 && (
        <div className="emi-filtres" data-defile="" role="group" aria-label="Filtrer les biens présentés">
          <Curseur cle={filtreP} />
          {[{ id: 'tout', titre: 'Tout', n: biens.length }, ...groupesVisibles.map(g => ({ id: g.id, titre: g.titre, n: parGroupe[g.id].length }))].map(f => (
            <button type="button" key={f.id} className="emi-filtre" aria-pressed={filtreP === f.id} onClick={() => setFiltreP(f.id)}>
              {f.id !== 'tout' && <Icone nom={ICONES_R[f.id] || 'horloge'} taille={14} epaisseur={2.1} />}{f.titre}<i>{f.n}</i>
            </button>
          ))}
        </div>
      )}

      {/* V3.166 : Tout, Il veut visiter, En attente… — les lignes arrivent en
          cascade quand on change de filtre, comme partout ailleurs (Cascade ;
          V3.167 : elles montent, comme les cartes de « Demandes Internet »). */}
      <Cascade cle={filtreP} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {affiches.map((b, idx) => {
        const r = RETOURS[groupeP(b)] || RETOURS.propose;
        return (
          <Fragment key={b.id}>
            {enTeteDe(b, idx)}
            <LigneListe b={b} id={`bien-${b.id}`} className={eclaire === b.id ? 'emi-vise' : undefined}
              accent={mode === 'presentes' ? r.c : undefined}
              coche={groupable ? { actif: coches.includes(b.id), onBascule: () => basculer(b.id) } : undefined}
              onOuvrir={() => ouvrir(b.id)}
              prix={euros(prixDuBien(b).demande)} sousPrix={sousPrixDe(b)}
              droite={mode === 'selection'
                ? <BoutonVite onClick={() => setEnvoi(b)} titre="Envoyer ce bien au client"><Icone nom="envoyer" taille={15} epaisseur={2} />Envoyer</BoutonVite>
                : undefined}
              bas={mode === 'presentes' ? basPresente(b) : basSelection(b)} />
          </Fragment>
        );
      })}
      </Cascade>

      {/* De la place sous le dernier bien : la barre ne doit pas le cacher. */}
      {groupable && coches.length > 0 && <div aria-hidden="true" style={{ height: 64 }} />}
      {groupable && coches.length > 0 && !envoi && !envoiGroupe && grand === null && (
        <BarreGroupe n={coches.length} onEnvoyer={envoyerCoches} onVider={() => setCoches([])} />
      )}

      {grand && idxGrand >= 0 && (
        <FenetreBien biens={affiches} index={idxGrand} onIndex={allerA} onFermer={() => setGrand(null)}
          recherche={recherche} bandeau={bandeauDe} prix={prixDe} coinPhoto={coinDe} pied={piedDe}
          onFiche={onFiche} onPhotos={b => setPhotosDe(b)} onScore={b => setScoreOuvert(b)} parcours
          message={message} />
      )}

      {scoreOuvert && <ModaleScore p={scoreOuvert} recherche={recherche} onFerme={() => setScoreOuvert(null)} />}
      {obs && (
        <ModaleObservation bien={obs} clientId={clientId} onFerme={() => setObs(null)} onEnregistre={recharge} />
      )}
      {envoi && (
        <ModaleEnvoi bien={envoi} clientId={clientId} client={client} mandat={mandat}
          onFerme={() => setEnvoi(null)} onEnvoye={() => { recharge(); if (grand) dire('Envoyé : il passe dans Présentés.'); }} onMail={onMail} />
      )}
      {indispoDe && (
        <FenetreIndispo bien={indispoDe} clientId={clientId} rechercheId={rechercheId} prenom={client?.prenom}
          onFermer={() => setIndispoDe(null)} onFait={() => { setIndispoDe(null); recharge(); if (grand) dire('Classé dans « Plus disponible ».'); }} />
      )}
      {photosDe && (
        <ModalePhotos bien={photosDe} onFerme={() => setPhotosDe(null)} onEnregistre={recharge} />
      )}
      {honoDe && (
        <ModaleHonoraires bien={honoDe} clientId={clientId} client={client} mandat={mandat}
          onFerme={() => setHonoDe(null)} onEnregistre={recharge} />
      )}
      {envoiGroupe && (
        <ModaleEnvoiGroupe biens={envoiGroupe} clientId={clientId} client={client} recherche={recherche}
          onFerme={() => setEnvoiGroupe(null)} onEnvoye={recharge} onMailGroupe={onMailGroupe} />
      )}
    </div>
  );
}
