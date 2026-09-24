'use client';
import { useState, useEffect, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import {
  Frise, ModaleObservation, ModaleEnvoi, Chip, BoutonLien, CARTE,
  Vignettes, Specs, BandeauMarche, StylesEmilio, Icone, Action, NAVY, OR, BORD,
  useAffichage, BasculeAffichage, LigneCompacte, BoutonIcone, resumeSpecs,
  NotesVeille, ModaleScore, ModaleEnvoiGroupe, CaseACocher, honorairesDuMandat, libelleHonoraires,
  ModalePhotos,
} from './ParcoursBien';

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
];
const groupeP = (b: { badge_retour?: string | null }) =>
  (b.badge_retour && GROUPES_P.some(g => g.id === b.badge_retour) ? b.badge_retour : 'propose');

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
}

export default function OngletBiens({ clientId, rechercheId, client, mode, onChange, onMail, onFiche, onVisite, onMailGroupe, rafraichir = 0 }: Props) {
  const [biens, setBiens] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);
  const [frise, setFrise] = useState<string | null>(null);
  const [obs, setObs] = useState<any>(null);
  const [envoi, setEnvoi] = useState<any>(null);
  const [tick, setTick] = useState(0);
  const [filtreP, setFiltreP] = useState('tout');   // onglet « Présentés » : quel retour afficher
  const [compact, setCompact] = useAffichage('biens-' + mode);  // détaillé ou une ligne par bien
  /* La note de la veille suit le bien : sa fenêtre s'ouvre ici aussi, et la
     recherche sert à dire ce que le bien coche d'office. */
  const [scoreOuvert, setScoreOuvert] = useState<any>(null);
  const [recherche, setRecherche] = useState<any>(null);
  /* Les biens cochés pour partir ensemble (onglet Sélection). */
  const [coches, setCoches] = useState<string[]>([]);
  const [envoiGroupe, setEnvoiGroupe] = useState<any[] | null>(null);
  /* Le bien dont on réorganise les photos. */
  const [photosDe, setPhotosDe] = useState<any>(null);

  const charger = useCallback(async () => {
    if (!rechercheId) return;
    setChargement(true);
    const { data } = await supabase
      .from('biens')
      .select('*')
      .eq('recherche_id', rechercheId)
      .eq('etape', mode === 'selection' ? 'selection' : 'presente')
      .order(mode === 'selection' ? 'created_at' : 'envoye_le', { ascending: false, nullsFirst: false });
    setBiens(data || []);
    /* Un bien parti en « Présentés » ou retiré n'est plus coché. */
    setCoches(cs => cs.filter(id => (data || []).some((b: any) => b.id === id)));
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

  const recharge = () => { setTick(t => t + 1); onChange?.(); };

  async function demanderPdf(bienId: string) {
    await supabase.from('biens').update({
      pdf_statut: 'demande', pdf_demande_le: new Date().toISOString(),
      pdf_url: null, pdf_message: null,
    }).eq('id', bienId);
    recharge();
  }

  async function renvoyerEnSelection(bienId: string) {
    await supabase.from('biens').update({ etape: 'selection', envoye_le: null, canal_envoi: null }).eq('id', bienId);
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

    await supabase.from('veille_propositions').update({
      statut: 'ecarte', bien_id: null,
      motif_ecart: saisi.trim() || (mode === 'selection' ? 'Retiré de la sélection' : 'Retiré du dossier'),
      decide_le: new Date().toISOString(),
    }).eq('bien_id', b.id);

    const photos: string[] = [...(b.photos || []), ...(b.plans || [])].filter((p: string) => typeof p === 'string' && p.includes('supabase.co/storage'));
    if (photos.length > 0) {
      const chemins = photos.map(u => (u.match(/photos-biens\/(.+)$/) || [])[1]).filter(Boolean) as string[];
      if (chemins.length > 0) { try { await supabase.storage.from('photos-biens').remove(chemins); } catch { /* le retrait prime */ } }
    }

    const { error } = await supabase.from('biens').delete().eq('id', b.id);
    if (error) { alert('Impossible de retirer ce bien : ' + error.message); return; }
    recharge();
  }

  const euros = (n: any) => (n == null ? '—' : Number(n).toLocaleString('fr-FR') + ' €');

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
        <span style={{ fontSize: 16 }}>{r.i}</span>
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 7 : 14 }}>
      <StylesEmilio />

      <div className="emi-arrivee" style={{ display: 'flex', alignItems: 'baseline', gap: 11, flexWrap: 'wrap' }}>
        <span className="emi-titre-onglet" style={{ fontSize: 19, fontWeight: 800, color: NAVY, letterSpacing: -.3 }}>
          {biens.length} bien{biens.length > 1 ? 's' : ''} {mode === 'selection' ? 'en sélection' : 'présenté' + (biens.length > 1 ? 's' : '')}
        </span>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          {mode === 'selection' ? 'Fixe tes honoraires et envoie. La fiche soignée est facultative.' : 'Rangés selon ce que le client en a dit.'}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {mode === 'presentes' && repondus > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 20, padding: '5px 13px', fontSize: 12.5, fontWeight: 800 }}>
              💬 {repondus} retour{repondus > 1 ? 's' : ''} reçu{repondus > 1 ? 's' : ''}
            </span>
          )}
          <BasculeAffichage compact={compact} onChange={setCompact} />
        </span>
      </div>

      {groupable && (
        <div className="emi-tout-cocher" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '0 0 0 11px', minHeight: 30 }}>
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

      {mode === 'presentes' && groupesVisibles.length > 1 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          {[{ id: 'tout', titre: 'Tout', n: biens.length }, ...groupesVisibles.map(g => ({ id: g.id, titre: g.titre, n: parGroupe[g.id].length }))].map(f => {
            const actif = filtreP === f.id;
            const r = RETOURS[f.id];
            return (
              <button type="button" key={f.id} onClick={() => setFiltreP(f.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 20, padding: '7px 13px',
                  fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${actif ? NAVY : BORD}`, background: actif ? NAVY : 'white',
                  color: actif ? 'white' : '#64748b', transition: 'all .12s',
                }}>
                {r ? <span>{r.i}</span> : null}{f.titre}
                <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 20, padding: '1px 7px', background: actif ? 'rgba(255,255,255,.18)' : '#f1f5f9', color: actif ? 'white' : '#94a3b8' }}>{f.n}</span>
              </button>
            );
          })}
        </div>
      )}

      {affiches.map((b, idx) => {
        const r = RETOURS[b.badge_retour] || RETOURS.propose;
        const ouvert = frise === b.id;
        const prixAff = b.prix_acquereur || b.prix_vendeur;
        // BandeauMarche lit `prix` : on lui donne le prix vendeur, celui du marché
        const marche = { ...b, prix: b.prix_vendeur, agence: b.agence_nom, portail: b.source_portail };
        const atouts: React.ReactNode[] = [];
        if (b.terrasse && !b.surface_exterieur) atouts.push(<Chip key="t" ton="or">Terrasse</Chip>);
        if (b.balcon && !b.surface_exterieur) atouts.push(<Chip key="b">Balcon</Chip>);
        if (b.jardin && !b.surface_exterieur) atouts.push(<Chip key="j">Jardin</Chip>);
        if (b.parking) atouts.push(<Chip key="p">{b.nb_parking > 1 ? `${b.nb_parking} parkings` : 'Parking'}</Chip>);
        if (b.ascenseur) atouts.push(<Chip key="a">Ascenseur</Chip>);
        if (b.cave) atouts.push(<Chip key="c">Cave</Chip>);
        if (b.est_particulier) atouts.push(<Chip key="x" ton="vert">Particulier</Chip>);

        const aRepondu = mode === 'presentes' && b.badge_retour && b.badge_retour !== 'propose';

        /* ── affichage compact : une ligne, et tout le reste au clic ── */
        if (compact) {
          return (
            <Fragment key={b.id}>
              {enTeteDe(b, idx)}
              <LigneCompacte
                photo={(b.photos || [])[0]}
                numero={idx + 1}
                titre={b.titre || `${b.type_bien || 'Bien'} — ${b.ville || ''}`}
                lieu={b.adresse || b.adresse_probable || b.quartier || b.ville}
                specs={resumeSpecs(b)}
                prix={euros(prixAff)}
                sousPrix={libelleHonoraires(b)
                  || (prixAff && b.surface ? `${Math.round(prixAff / Number(b.surface)).toLocaleString('fr-FR')} €/m²` : null)}
                coche={groupable ? { actif: coches.includes(b.id), onBascule: () => basculer(b.id) } : undefined}
                accent={mode === 'presentes' ? r.c : undefined}
                badge={mode === 'presentes' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: r.bg, color: r.c, border: `1px solid ${r.bd}`, borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 800 }}>
                    {r.i} {r.l}
                  </span>
                ) : b.pdf_statut === 'pret' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 800 }}>
                    📄 fiche prête
                  </span>
                ) : undefined}
                onOuvrir={() => onFiche(b.id)}
                actions={
                  <>
                    {b.url && <BoutonIcone icone="lien" titre="Ouvrir l'annonce d'origine" href={b.url} />}
                    {(b.photos || []).length > 0 && <BoutonIcone icone="photos" titre="Réorganiser les photos" onClick={() => setPhotosDe(b)} />}
                    <BoutonIcone icone="crayon" titre="Ouvrir le détail du bien" onClick={() => onFiche(b.id)} />
                    {mode === 'selection'
                      ? <BoutonIcone icone="envoyer" titre="Envoyer au client" ton="or" onClick={() => setEnvoi(b)} />
                      : <BoutonIcone icone="calendrier" titre="Planifier une visite" onClick={() => onVisite(b.id)} />}
                    <button type="button" onClick={() => retirer(b)} title="Retirer ce bien du dossier"
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 30, height: 30, borderRadius: 9, background: 'white',
                        border: `1px solid ${BORD}`, color: '#c3ccda', cursor: 'pointer',
                        fontFamily: 'inherit', transition: 'color .12s, border-color .12s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#c3ccda'; e.currentTarget.style.borderColor = BORD; }}>
                      <IconeCorbeille taille={15} />
                    </button>
                  </>
                }
              />
            </Fragment>
          );
        }

        return (
          <Fragment key={b.id}>
          {enTeteDe(b, idx)}
          <div className="emi-carte emi-arrivee"
            style={{
              ...CARTE, animationDelay: Math.min(idx, 6) * 55 + 'ms',
              ...(groupable && coches.includes(b.id) ? { borderColor: OR, boxShadow: `0 0 0 3px rgba(201,168,76,.18), ${CARTE.boxShadow}` } : {}),
              transition: 'border-color .14s, box-shadow .14s',
            }}>

            <Vignettes photos={b.photos || []} plans={b.plans || []}
              coinGauche={mode === 'presentes'
                ? <span style={{ background: r.bg, color: r.c, border: `1px solid ${r.bd}`, borderRadius: 20, padding: '4px 12px', fontSize: 11.5, fontWeight: 800, boxShadow: '0 4px 12px -6px rgba(16,24,40,.5)' }}>{r.i} {r.l}</span>
                : undefined}
              coinDroit={(b.photos || []).length > 0 ? (
                <button type="button" className="emi-reorg" onClick={() => setPhotosDe(b)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,.95)', color: NAVY, border: 'none', borderRadius: 20, padding: '7px 13px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 16px -8px rgba(16,24,40,.55)' }}>
                  <Icone nom="photos" taille={14} epaisseur={2} />
                  {`Réorganiser · ${(b.photos || []).length}`}
                </button>
              ) : undefined} />

            {/* Le retour du client se lit AVANT la fiche, pas en bas en petit :
                c'est l'information qui décide de ce que tu fais ensuite. */}
            {aRepondu && (
              <div style={{ background: r.bg, borderBottom: `1px solid ${r.bd}`, borderLeft: `4px solid ${r.c}`, padding: '13px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 17, lineHeight: 1 }}>{r.i}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: r.c, letterSpacing: -.2 }}>{r.l}</span>
                  {b.retour_le && <span style={{ fontSize: 12.5, color: '#94a3b8', fontWeight: 600 }}>· {depuisQuand(b.retour_le)}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#a9b6c8' }}>
                    Retour du client
                  </span>
                </div>
                {b.retour_client ? (
                  <div style={{ marginTop: 9, fontSize: 14.5, lineHeight: 1.6, color: NAVY, fontWeight: 600 }}>
                    « {b.retour_client} »
                  </div>
                ) : (
                  <div style={{ marginTop: 7, fontSize: 13, color: '#94a3b8', lineHeight: 1.55 }}>
                    Il n&apos;a pas laissé de mot.{b.badge_retour === 'refuse' ? ' Un appel dirait ce qui a bloqué — c’est ce qui manque pour affiner la recherche.' : ''}
                  </div>
                )}
              </div>
            )}

            {/* ── titre, adresse, prix ─────────────────────── */}
            <div className="emi-tete-carte" style={{ padding: '15px 18px 0', display: 'flex', gap: 18, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 220, flex: '1 1 320px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {groupable && (
                  <span style={{ paddingTop: 3 }}>
                    <CaseACocher actif={coches.includes(b.id)} onClick={() => basculer(b.id)}
                      titre={coches.includes(b.id) ? 'Décocher ce bien' : 'Cocher ce bien pour l’envoyer avec d’autres'} />
                  </span>
                )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="emi-titre-bien" style={{ fontSize: 18, fontWeight: 800, color: NAVY, lineHeight: 1.3, letterSpacing: -.2 }}>
                  {b.titre || `${b.type_bien || 'Bien'} — ${b.ville || ''}`}
                </div>
                {(b.adresse || b.adresse_probable || b.quartier || b.ville) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 13.5, color: '#64748b', flexWrap: 'wrap' }}>
                    <span style={{ color: '#a9b6c8', display: 'flex' }}><Icone nom="lieu" taille={15} /></span>
                    <span style={{ fontWeight: 600 }}>
                      {b.adresse || b.adresse_probable || b.quartier || b.ville}
                      {b.situation ? ` — ${b.situation}` : ''}
                    </span>
                  </div>
                )}
              </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <div className="emi-prix-bien" style={{ fontSize: 25, fontWeight: 800, color: OR, letterSpacing: -.8, lineHeight: 1.1 }}>{euros(prixAff)}</div>
                {libelleHonoraires(b)
                  ? <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{libelleHonoraires(b)}</div>
                  : prixAff && b.surface
                    ? <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{Math.round(prixAff / Number(b.surface)).toLocaleString('fr-FR')} €/m²</div>
                    : null}
                {mode === 'presentes' && b.envoye_le && (
                  <div style={{ fontSize: 11.5, color: '#a9b6c8' }}>
                    envoyé le {new Date(b.envoye_le).toLocaleDateString('fr-FR')}
                    {b.canal_envoi ? ` · ${b.canal_envoi === 'mail' ? 'mail' : b.canal_envoi === 'whatsapp' ? 'WhatsApp' : 'lien'}` : ''}
                  </div>
                )}
                {mode === 'presentes' && (
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: b.nb_vues ? '#2563eb' : '#cbd5e1' }}>
                    {b.nb_vues ? `👁️ ouvert ${b.nb_vues} fois par le client` : '👁️ jamais ouvert'}
                  </div>
                )}
              </div>
            </div>

            {/* ── caractéristiques, marché, retour ─────────── */}
            <div className="emi-corps-carte" style={{ padding: '13px 18px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              <Specs p={b} />
              <BandeauMarche p={marche} />

              {/* en mode sélection, l'observation du chasseur reste ici */}
              {!aRepondu && b.retour_client && (
                <div style={{ background: r.bg, border: `1px solid ${r.bd}`, borderLeft: `3px solid ${r.c}`, borderRadius: 11, padding: '9px 13px', fontSize: 13.5, color: r.c, fontStyle: 'italic' }}>
                  « {b.retour_client} »
                  {b.retour_le && <span style={{ fontStyle: 'normal', opacity: .6, fontSize: 11.5 }}> — {new Date(b.retour_le).toLocaleDateString('fr-FR')}</span>}
                </div>
              )}

              {atouts.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>{atouts}</div>
              )}

              {b.pdf_message && (
                <div style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', lineHeight: 1.5 }}>
                  {b.pdf_message}
                </div>
              )}

              {/* ce que la veille en disait : ça reste, et ça reste ici */}
              <NotesVeille p={b} onScore={() => setScoreOuvert(b)} />
            </div>

            {/* ── pied de carte : les actions ──────────────── */}
            <div className="emi-pied" style={{
              borderTop: `1px solid ${BORD}`, background: '#fbfcfe', padding: '11px 18px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {b.url && <BoutonLien href={b.url}>↗&nbsp; Annonce d&apos;origine</BoutonLien>}
                <BoutonLien onClick={() => onFiche(b.id)}>✎&nbsp; Détail</BoutonLien>
                <BoutonLien onClick={() => setFrise(ouvert ? null : b.id)} actif={ouvert}>
                  ◷&nbsp; {ouvert ? 'Masquer le parcours' : 'Parcours du bien'}
                </BoutonLien>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {mode === 'selection' ? (
                  <>
                    {b.pdf_statut === 'pret' && b.pdf_url ? (
                      <Action href={b.pdf_url} ton="neutre">📄&nbsp; Fiche prête — consulter</Action>
                    ) : b.pdf_statut === 'demande' ? (
                      <Action ton="neutre" disabled>⏳&nbsp; En attente · prochaine session</Action>
                    ) : (
                      <Action onClick={() => demanderPdf(b.id)} ton="neutre">📄&nbsp; Demander une fiche soignée</Action>
                    )}
                    <Action onClick={() => setEnvoi(b)} ton="or">📤&nbsp; Envoyer</Action>
                    <LienRetirer onClick={() => retirer(b)} />
                  </>
                ) : (
                  <>
                    {b.pdf_url && <Action href={b.pdf_url} ton="neutre">📄&nbsp; Le PDF</Action>}
                    <Action onClick={() => onVisite(b.id)} ton="violet">📅&nbsp; Planifier une visite</Action>
                    <Action onClick={() => setObs(b)} ton="navy">💬&nbsp; Noter son retour</Action>
                    <button type="button" onClick={() => renvoyerEnSelection(b.id)}
                      style={{ background: 'none', border: 'none', color: '#a9b6c8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Remettre en sélection
                    </button>
                    <LienRetirer onClick={() => retirer(b)} />
                  </>
                )}
              </div>
            </div>

            <div className="emi-volet" data-ouvert={ouvert}>
              <div>
                <div style={{ borderTop: `1px solid ${BORD}`, background: '#fbfcfe', padding: '16px 18px 12px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#9aa8bd', textTransform: 'uppercase', letterSpacing: .9, marginBottom: 9 }}>
                    Parcours du bien
                  </div>
                  {ouvert && <Frise bienId={b.id} rafraichir={tick} />}
                </div>
              </div>
            </div>
          </div>
          </Fragment>
        );
      })}

      {/* De la place sous le dernier bien : la barre ne doit pas le cacher. */}
      {groupable && coches.length > 0 && <div aria-hidden="true" style={{ height: 64 }} />}
      {groupable && coches.length > 0 && !envoi && !envoiGroupe && (
        <BarreGroupe n={coches.length} onEnvoyer={envoyerCoches} onVider={() => setCoches([])} />
      )}

      {scoreOuvert && <ModaleScore p={scoreOuvert} recherche={recherche} onFerme={() => setScoreOuvert(null)} />}
      {obs && (
        <ModaleObservation bien={obs} clientId={clientId} onFerme={() => setObs(null)} onEnregistre={recharge} />
      )}
      {envoi && (
        <ModaleEnvoi bien={envoi} clientId={clientId} client={client} mandat={mandat}
          onFerme={() => setEnvoi(null)} onEnvoye={recharge} onMail={onMail} />
      )}
      {photosDe && (
        <ModalePhotos bien={photosDe} onFerme={() => setPhotosDe(null)} onEnregistre={recharge} />
      )}
      {envoiGroupe && (
        <ModaleEnvoiGroupe biens={envoiGroupe} clientId={clientId} client={client} recherche={recherche}
          onFerme={() => setEnvoiGroupe(null)} onEnvoye={recharge} onMailGroupe={onMailGroupe} />
      )}
    </div>
  );
}
