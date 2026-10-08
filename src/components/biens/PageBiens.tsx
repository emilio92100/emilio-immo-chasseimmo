'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { euros } from '@/lib/mandat';
import { EVT_DEMANDE_VUE, EVT_NOUVEAU_BIEN, annoncerVue, prendreNouveauBien, signalerMaj, vueDemandee } from '@/lib/intentions';
import { EN_COURS, ETAPES_VENTE, etapeDe, nomProprio, titreBien, villeAffichee, type BienVente, type EtapeVente, type SuiviVente } from '@/lib/biens-vente';
/* V3.88 : les étapes d'un bien terminé, qui s'archive (comme sa fiche). */
const ARCHIVABLES: string[] = ['vendu', 'retire', 'annonce_type'];
import { issueDe, visitePasseeParis } from '@/lib/visites';
import EnteteRubrique from '@/components/shared/EnteteRubrique';
import { Ic } from '@/components/documents/ApercuActe';
import CarteBien, { LigneBien, honorairesVente } from './CarteBien';
import EditeurBien from './EditeurBien';
import FicheBien from './FicheBien';
import { FenMandat, FenNouveau } from './FenetresBien';
import ImportBiensIF from './ImportBiensIF';
import RepriseDiffusion from './RepriseDiffusion';
import { etatDiffusion } from '@/lib/diffusion';
import SqueletteFiche from '@/components/shared/SqueletteFiche';
import FiltresBiens, { FILTRES_VIDES, filtrer, trier, type Filtres, type Tri } from './FiltresBiens';
import { MESSAGE_SQL, SEUIL_CORRESPOND, acheteursPour, brouillonVide, instantPasse, type VisiteRow, chargerListe, creerBien, donneesProprio, ficheClient, mandatsParBien, marquerVendeur, nomClient, poserDansBien, supprimerBien, supprimerBrouillon, majBien as ecrireBien, MESSAGE_VENDU_SUPPR, type ListeBiens } from './outils';
import { BarreSelection, CaseSelection, ConfirmerLot, type Avancement } from '@/components/shared/Selection';
import { CIBLES_ETAPE, FenEnvoiLot, RaisonEtape, bloqueEtape, passerEtape, type CibleEtape } from './LotBiens';
import { aererTexte, texteEnBloc } from '@/lib/annonce-texte';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';

/* ═══ Biens ═══════════════════════════════════════════════════════════════
   Les biens qu'Alexandre vend ou pourrait vendre pour un propriétaire : un
   projet à suivre, une estimation, un mandat, jusqu'à la vente. La liste en
   cartes, avec une catégorie par étape ; la fiche d'un bien ; son éditeur
   plein écran. « Nouveau bien » demande d'abord où il en est. Le bien ouvert
   vit dans l'URL (?page=biens&bien=…) : un F5 ou le bouton Précédent y
   ramènent. */

type Filtre = 'tout' | EtapeVente | 'archives' | 'diffusion';
const ORDRE: EtapeVente[] = ['mandat', 'offre', 'compromis', 'estimation', 'a_suivre', 'suspendu', 'vendu', 'retire', 'annonce_type'];
/* V3.80 (Alexandre : « trop de sous-catégories, on ne comprend pas trop ;
   mandat en cours en premier, ensuite estimation, et c'est tout ; les restes,
   un petit bouton pour filtrer ») : deux tuiles sur la ligne, les autres
   étapes dans « Autres étapes ▾ », « Tous » et « Archivés » à droite.
   « Mandats en cours » compte aussi les biens sous offre et sous compromis :
   leur mandat court toujours. */
const PRINCIPALES: EtapeVente[] = ['mandat', 'estimation'];
const AUTRES: EtapeVente[] = ['offre', 'compromis', 'a_suivre', 'suspendu', 'vendu', 'retire', 'annonce_type'];
const dansEtape = (x: BienVente, f: EtapeVente) => (f === 'mandat' ? EN_COURS.includes(x.etape) : x.etape === f);
/* V3.96 (Alexandre : « dans les onglets, diffusion en cours ») : tout ce qui
   est en ligne, quelle que soit l'étape. */
const enLigne = (x: BienVente) => etatDiffusion(x).enLigne;
/* V3.130 (Alexandre : « ajouter mandat en cours, annonce type, pour
   classer ») : dans « Diffusion en cours », les vrais biens en vente d'un
   côté, les annonces type de l'autre. */
type SousDiff = 'tous' | 'mandats' | 'annonces';
const dansSousDiff = (x: BienVente, k: SousDiff) => k === 'tous' || (k === 'annonces') === (x.etape === 'annonce_type');
const AIDE_DIFF: Record<Exclude<SousDiff, 'annonces'>, string> = {
  tous: 'Tout ce qui est en ligne, quelle que soit l’étape.',
  mandats: 'Les vrais biens à vendre, en ligne : en vente, sous offre, sous compromis, ou diffusés à une autre étape.',
};
/* « Annonces type », ce que c'est (Alexandre : « une petite précision de à
   quoi correspond ce filtre »), sous la catégorie et sous la pastille. */
function ExpliAnnonceType() {
  return (
    <div className={b.expliAnnonce}>
      <span className={b.expliAnnonceIc}><Ic n="megaphone" t={16} /></span>
      <span>
        <b>{'Les annonces type'}</b>
        {' : des annonces pour faire venir des acheteurs, sans vrai bien à vendre derrière. Un bien proche de celui qu’on ne peut pas diffuser, ou un ancien mandat gardé en ligne. Ni visite ni offre dessus : un acheteur intéressé se suit sur sa propre fiche.'}
      </span>
    </div>
  );
}
const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const lireBienUrl = () => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('bien'));
function ecrireBienUrl(id: string | null) {
  const p = new URLSearchParams(window.location.search);
  if (id) p.set('bien', id); else p.delete('bien');
  p.set('page', 'biens');
  const url = `${window.location.pathname}?${p.toString()}`;
  if (url !== window.location.pathname + window.location.search) window.history.pushState(null, '', url);
}

/* La catégorie d'une vue (« estimation »…) ; rien de reconnu : les mandats
   en cours (V3.80 : « quand on arrive, on arrive sur mandat en cours »). */
const lireFiltre = (v: string | null): Filtre =>
  v === 'tout' || v === 'archives' || v === 'diffusion' || ETAPES_VENTE.some(e => e.k === v) ? v as Filtre : 'mandat';

/* « C'est vendu » : le bandeau qui le confirme, en haut de la liste (V3.47). */
export function BandeauVendu({ titre, texte, onFiche, onVendus, onFermer }: { titre: string; texte: string; onFiche: () => void; onVendus: () => void; onFermer: () => void }) {
  return (
    <div className={b.annonceVente} role="status">
      <span className={b.annonceVenteIc}><Ic n="cle" t={20} /></span>
      <div className={b.annonceVenteTx}>
        <b>{`Vendu ! ${titre}`}</b>
        <span>{texte || 'Le bien est rangé dans « Vendus ».'}</span>
      </div>
      <div className={b.annonceVenteBtns}>
        <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={onFiche}>Voir la fiche</button>
        <button type="button" className={s.btn} onClick={onVendus}>Voir les vendus</button>
        <button type="button" className={b.annonceVenteX} aria-label="Fermer" onClick={onFermer}><Ic n="croix" t={14} /></button>
      </div>
    </div>
  );
}

export default function PageBiens({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [liste, setListe] = useState<ListeBiens | null>(null);
  const [erreur, setErreur] = useState('');
  /* La catégorie : « Tous », ou celle demandée par le menu de gauche (« Mes
     estimations »…), ou celle qu'on avait en quittant la liste (V3.24). */
  const [filtre, setFiltre] = useState<Filtre>(() => lireFiltre(vueDemandee('biens')));
  useEffect(() => { annoncerVue('biens', filtre); }, [filtre]);
  const [sousDiff, setSousDiff] = useState<SousDiff>('tous');
  const [cherche, setCherche] = useState('');
  /* V3.16 : affiner (type, surface, pièces, budget, DPE) et trier. */
  const [fins, setFins] = useState<Filtres>(FILTRES_VIDES);
  const [tri, setTri] = useState<Tri>('etape');
  /* En cartes ou en lignes (V3.17) : gardé d'une visite à l'autre. */
  const [vue, setVue] = useState<'cartes' | 'lignes'>(() => {
    try { return localStorage.getItem('biens.vue') === 'lignes' ? 'lignes' : 'cartes'; } catch { return 'cartes'; }
  });
  const choisirVue = (x: 'cartes' | 'lignes') => { setVue(x); try { localStorage.setItem('biens.vue', x); } catch { /* sans mémoire */ } };
  const [ouvert, setOuvert] = useState<string | null>(null);
  /* V3.80 (Alexandre : « quand on clique sur le bien, il faut que
     l'apparition se fasse jolie ») : la fiche monte en fondu, la liste
     redescend au retour ; un lien direct vers une fiche montre sa
     silhouette le temps de lire la liste. */
  const [retour, setRetour] = useState(false);
  const [attendu] = useState(() => lireBienUrl());
  /* Le menu de gauche change la catégorie alors qu'on est déjà ici : sur
     place, sans recharger ; une fiche de bien ouverte se referme (V3.25). */
  useEffect(() => {
    const demande = (e: Event) => {
      const d = (e as CustomEvent<{ page: string; vue: string }>).detail;
      if (d?.page !== 'biens') return;
      setOuvert(null); ecrireBienUrl(null);
      setFiltre(lireFiltre(d.vue));
    };
    window.addEventListener(EVT_DEMANDE_VUE, demande);
    return () => window.removeEventListener(EVT_DEMANDE_VUE, demande);
  }, []);
  const [edition, setEdition] = useState<{ bien: BienVente; etape?: string; nouveau?: boolean; vus?: string[] } | null>(null);
  /* V3.50 : « Un mandat signé » ouvre la fenêtre du mandat juste après la création. */
  const [mandatNeuf, setMandatNeuf] = useState<{ bien: BienVente; vus: string[] } | null>(null);
  const [cree, setCree] = useState(false);
  const [choixDepart, setChoixDepart] = useState(false);
  const [importIF, setImportIF] = useState(false);
  const [erreurDepart, setErreurDepart] = useState('');
  /* « Créer son bien » depuis la fiche d'un contact : le propriétaire est déjà choisi. */
  const [pour, setPour] = useState<string | null>(null);
  /* V3.47 : « C'est vendu » ramène sur les mandats en cours, avec ce bandeau
     qui confirme la vente (Alexandre : « qu'on ait l'impression que l'action
     a bien été prise en compte »). Il s'efface seul au bout de 20 s. */
  const [annonce, setAnnonce] = useState<{ id: string; titre: string; texte: string } | null>(null);
  /* V3.88 — Cocher plusieurs biens (src/components/shared/Selection.tsx). */
  const [choisis, setChoisis] = useState<Set<string>>(() => new Set());
  const [lot, setLot] = useState<{ quoi: 'supprimer' | 'archiver' | 'desarchiver'; cibles: BienVente[]; ignores: { nom: string; pourquoi: string }[]; avancement: Avancement | null } | null>(null);
  /* V3.89 : « Envoyer à des acheteurs » et « Changer d'étape » (LotBiens.tsx). */
  const [envoiLot, setEnvoiLot] = useState<BienVente[] | null>(null);
  const [etapeLot, setEtapeLot] = useState<{ cible: CibleEtape; cibles: BienVente[]; ignores: { nom: string; pourquoi: string }[]; raison: string; avancement: Avancement | null } | null>(null);
  const basculerChoix = useCallback((id: string) => setChoisis(l => { const n = new Set(l); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const viderChoix = useCallback(() => setChoisis(new Set()), []);
  useEffect(() => {
    if (!annonce) return;
    const t = window.setTimeout(() => setAnnonce(null), 20000);
    return () => window.clearTimeout(t);
  }, [annonce]);

  const charger = useCallback(async () => {
    try {
      const l = await chargerListe();
      setListe(l); setErreur('');
      signalerMaj();
    } catch (e) {
      setErreur((e as Error).message);
      setListe(x => x || { biens: [], suivi: [], copies: [], visites: [], clients: {}, recherches: [] });
    }
  }, []);
  useEffect(() => {
    let vivant = true;
    chargerListe()
      .then(l => {
        if (!vivant) return;
        setListe(l);
        /* Un lien vers un bien qui n'existe plus : on reste sur la liste. */
        const id = lireBienUrl();
        if (id && !l.biens.some(x => x.id === id)) { ecrireBienUrl(null); setOuvert(null); } else setOuvert(id);
        const proprio = prendreNouveauBien();
        if (proprio !== null) { setPour(proprio || null); setChoixDepart(true); }
      })
      .catch(e => { if (vivant) { setErreur((e as Error).message); setListe({ biens: [], suivi: [], copies: [], visites: [], clients: {}, recherches: [] }); } });
    const retour = () => setOuvert(lireBienUrl());
    window.addEventListener('popstate', retour);
    /* « Nouveau bien » du « + », la rubrique déjà ouverte. */
    const demande = () => {
      const proprio = prendreNouveauBien();
      if (proprio !== null) { setErreurDepart(''); setPour(proprio || null); setChoixDepart(true); }
    };
    window.addEventListener(EVT_NOUVEAU_BIEN, demande);
    return () => { vivant = false; window.removeEventListener('popstate', retour); window.removeEventListener(EVT_NOUVEAU_BIEN, demande); };
  }, []);

  const ouvrir = (id: string | null) => {
    setRetour(!id && !!ouvert);
    setOuvert(id);
    ecrireBienUrl(id);
    document.querySelector('main')?.scrollTo({ top: 0 });
    document.querySelector('.crm-app > div')?.scrollTo({ top: 0 });
  };
  const majBien = useCallback((r: BienVente) => {
    setListe(l => (l ? { ...l, biens: l.biens.some(x => x.id === r.id) ? l.biens.map(x => (x.id === r.id ? r : x)) : [r, ...l.biens] } : l));
  }, []);

  /* V3.50 : les biens encore en cours du propriétaire choisi (« Créer son
     bien » depuis sa fiche) : FenNouveau les montre avant d'en créer un autre. */
  const existantsPour = pour && liste ? liste.biens.filter(x => x.client_id === pour && !x.archive && x.etape !== 'vendu') : [];
  async function nouveau(etape: EtapeVente) {
    if (!liste) return;
    setCree(true); setErreurDepart('');
    try {
      /* V3.79 : une annonce type n'a pas de propriétaire. */
      const c = pour && etape !== 'annonce_type' ? liste.clients[pour] : null;
      const vus = existantsPour.map(x => x.id);
      /* « Un mandat signé » (V3.50) : le bien naît à l'estimation, la fenêtre du
         mandat le fait passer « En vente » avec son prix, ses honoraires et son
         propriétaire. Annulée, le bien qu'on venait de créer disparaît. */
      if (etape === 'mandat') {
        const r = await creerBien(liste.biens.map(x => x.reference), 'estimation', c ? donneesProprio(c) : {}, { sansSuivi: true });
        setChoixDepart(false); setPour(null);
        setMandatNeuf({ bien: r, vus });
        setCree(false);
        return;
      }
      const r = await creerBien(liste.biens.map(x => x.reference), etape, c ? donneesProprio(c) : {});
      if (c) await marquerVendeur(c.id);
      majBien(r);
      setChoixDepart(false); setPour(null);
      setEdition({ bien: r, nouveau: true, vus });
    } catch (e) { setErreurDepart((e as Error).message); }
    setCree(false);
  }
  async function abandonnerMandatNeuf() {
    const x = mandatNeuf;
    setMandatNeuf(null);
    if (!x) return;
    try { await supprimerBien(x.bien); } catch (e) { setErreur(`Le bien commencé n’a pas pu être retiré : ${(e as Error).message}`); void charger(); }
  }
  /* Les brouillons vides (V3.50) : « Nouveau bien » ouvert puis laissé, l'onglet
     fermé. Ils ne s'effacent pas tout seuls : on les montre à part, avec
     « Supprimer » — rien de ce qu'ils contiennent ne se perd, ils sont vides. */
  const [brouillonsOuverts, setBrouillonsOuverts] = useState(false);
  async function supprimerBrouillons(l: BienVente[]) {
    for (const x of l) {
      try { await supprimerBrouillon(x); setListe(y => (y ? { ...y, biens: y.biens.filter(z => z.id !== x.id) } : y)); }
      catch (e) { setErreur(`${x.reference || 'Un brouillon'} : ${(e as Error).message}`); }
    }
  }

  /* Ce que chaque carte affiche : acheteurs, visites, offres. */
  const parBien = useMemo(() => {
    const m: Record<string, { acheteurs: number; visites: number; prevues: number; cr: number; offres: number }> = {};
    if (!liste) return m;
    /* Prévue : à venir et pas encore passée (V3.33). V3.50 : jour ET heure, à
       l'heure de Paris ; une visite passée sans compte rendu compte à part
       (« compte rendu à faire »), et non plus comme faite. */
    for (const x of liste.biens) {
      const copies = liste.copies.filter(c => c.bien_vente_id === x.id);
      const ids = new Set(copies.map(c => c.id));
      const enVente = !['vendu', 'retire'].includes(x.etape);
      const libres = liste.suivi.filter(s2 => s2.bien_id === x.id && s2.type === 'visite' && s2.statut !== 'annulee');
      const crm = liste.visites.filter(v => ids.has(v.bien_id) && v.statut !== 'annulee');
      const libreAVenir = (s2: SuiviVente) => s2.statut === 'a_venir' && !instantPasse(s2.le);
      const crmAVenir = (v: VisiteRow) => v.statut === 'a_venir' && (!v.date_visite || !visitePasseeParis(v));
      m[x.id] = {
        acheteurs: enVente ? acheteursPour(x, liste.recherches, liste.clients, copies).filter(a => a.corr.note >= SEUIL_CORRESPOND).length : 0,
        visites: libres.length + crm.length,
        prevues: libres.filter(libreAVenir).length + crm.filter(crmAVenir).length,
        cr: libres.filter(s2 => s2.statut === 'a_venir' && !libreAVenir(s2) && !s2.avis).length
          + crm.filter(v => v.statut === 'a_venir' && !crmAVenir(v) && !issueDe(v)).length,
        offres: liste.suivi.filter(s2 => s2.bien_id === x.id && s2.type === 'offre').length,
      };
    }
    return m;
  }, [liste]);

  /* Où en est le mandat de chaque bien dans Documents (V3.42). */
  const mandats = useMemo(() => (liste ? mandatsParBien(liste) : {}), [liste]);

  const tousBiens = liste?.biens || [];
  const brouillons = useMemo(() => (liste ? liste.biens.filter(x => brouillonVide(x, liste)) : []), [liste]);
  const biens = brouillons.length ? tousBiens.filter(x => !brouillons.includes(x)) : tousBiens;
  const actifs = biens.filter(x => !x.archive);
  const archives = biens.filter(x => x.archive);
  const q = sansAccent(cherche.trim());
  const proprioDe = (x: BienVente) => (x.client_id && liste?.clients[x.client_id] ? nomClient(liste.clients[x.client_id]) : '');
  const trouves = (filtre === 'archives' ? archives : actifs).filter(x => !q || sansAccent([
    x.titre, x.adresse, x.ville, x.quartier, x.code_postal, x.reference, x.mandat_numero, nomProprio(x.donnees || {}), proprioDe(x),
    /* V3.79 : « 74 » ou « immofacile 74 » retrouve le bien repris. */
    typeof x.donnees?.refImmofacile === 'string' ? `immofacile ${x.donnees.refImmofacile}` : '',
  ].filter(Boolean).join(' ')).includes(q));
  /* Les filtres fins comptent comme la recherche : les nombres des
     catégories les suivent. */
  const cherches = filtrer(trouves, fins);
  const dansCategorie = (x: BienVente) => filtre === 'tout' || filtre === 'archives' || (filtre === 'diffusion' ? enLigne(x) && dansSousDiff(x, sousDiff) : dansEtape(x, filtre));
  const parEtape = (p: BienVente, r: BienVente) => ORDRE.indexOf(p.etape) - ORDRE.indexOf(r.etape) || r.updated_at.localeCompare(p.updated_at);
  const visibles = trier(cherches.filter(dansCategorie), tri, parEtape);
  const avantFiltres = trouves.filter(dansCategorie).length;
  const n = (e: EtapeVente) => cherches.filter(x => dansEtape(x, e)).length;
  /* Une recherche qui trouve ailleurs que dans la catégorie ouverte : on le
     dit, avec de quoi tout voir (sinon « 12 rue… » semble introuvable). */
  const ailleurs = q && filtre !== 'tout' && filtre !== 'archives' ? cherches.filter(x => !dansCategorie(x)).length : 0;

  /* V3.80 (Alexandre : « les textes importés s'affichent en bordel ; est-ce
     qu'on peut tout modifier d'un seul trait ») : les annonces reprises
     d'ImmoFacile d'un seul bloc, à mettre en paragraphes d'un clic. Le texte
     d'origine reste dans la fiche (annonceTexteOrigine). */
  const enBloc = useMemo(() => (liste?.biens || []).filter(x => typeof x.donnees?.refImmofacile === 'string' && typeof x.donnees?.annonceTexte === 'string' && texteEnBloc(x.donnees.annonceTexte)), [liste]);
  const [aeration, setAeration] = useState<{ fait: number; total: number; erreurs: number } | null>(null);
  const [aerationCachee, setAerationCachee] = useState(false);
  async function aererTout() {
    const l = enBloc;
    setAeration({ fait: 0, total: l.length, erreurs: 0 });
    let fait = 0, erreurs = 0;
    for (const x of l) {
      const t = String(x.donnees?.annonceTexte || '');
      try {
        const r = await poserDansBien(x.id, { annonceTexte: aererTexte(t), ...(typeof x.donnees?.annonceTexteOrigine === 'string' ? {} : { annonceTexteOrigine: t }) });
        majBien(r);
        fait += 1;
      } catch { erreurs += 1; }
      setAeration({ fait, total: l.length, erreurs });
    }
    if (erreurs) setErreur(`${erreurs} annonce${erreurs > 1 ? 's n’ont' : ' n’a'} pas pu être mise${erreurs > 1 ? 's' : ''} en paragraphes : relance « Les mettre en paragraphes ».`);
  }

  /* V3.88 — Les biens cochés (dans n'importe quelle catégorie), et le geste
     en lot. On archive un bien terminé (vendu, retiré, annonce type) ; on ne
     supprime pas un bien vendu (ses honoraires comptent). */
  const coches = biens.filter(x => choisis.has(x.id));
  const modeChoix = coches.length > 0;
  const nomBien = (x: BienVente) => [x.titre || titreBien(x.donnees || {}), villeAffichee(x.ville, x.code_postal), x.reference].filter(Boolean).join(' · ');
  function preparerLot(quoi: 'supprimer' | 'archiver' | 'desarchiver') {
    const ok = (x: BienVente) => (quoi === 'supprimer' ? x.etape !== 'vendu' : quoi === 'archiver' ? ARCHIVABLES.includes(x.etape) && !x.archive : x.archive);
    const pourquoi = (x: BienVente) => (quoi === 'supprimer' ? 'Vendu : ses honoraires comptent dans ton chiffre d’affaires. Archive-le plutôt.'
      : quoi === 'archiver' ? (x.archive ? 'Déjà archivé.' : `En cours (« ${etapeDe(x.etape).lib} ») : on archive un bien terminé. Passe-le « Retiré » d’abord s’il ne se vendra pas.`)
        : 'Pas archivé.');
    setLot({ quoi, cibles: coches.filter(ok), ignores: coches.filter(x => !ok(x)).map(x => ({ nom: nomBien(x), pourquoi: pourquoi(x) })), avancement: null });
  }
  async function faireLot() {
    if (!lot) return;
    const { quoi, cibles } = lot;
    const av: Avancement = { fait: 0, total: cibles.length, erreurs: [] };
    setLot(x => (x ? { ...x, avancement: { ...av } } : x));
    const partis: string[] = [];
    for (const x of cibles) {
      try {
        if (quoi === 'supprimer') { await supprimerBien(x); setListe(l => (l ? { ...l, biens: l.biens.filter(y => y.id !== x.id) } : l)); }
        else majBien(await ecrireBien(x.id, { archive: quoi === 'archiver' }));
        av.fait += 1; partis.push(x.id);
      } catch (e) {
        const m = (e as Error).message;
        av.erreurs.push(`${nomBien(x)} : ${m === MESSAGE_VENDU_SUPPR ? 'vendu, archive-le plutôt' : m}`);
      }
      setLot(l => (l ? { ...l, avancement: { ...av, erreurs: [...av.erreurs] } } : l));
    }
    setChoisis(l => { const n = new Set(l); partis.forEach(id => n.delete(id)); return n; });
    signalerMaj();
  }

  /* V3.89 — Changer d'étape : ceux qui y passent d'ici, et les autres avec
     leur raison (ce qui demande une décision se fait sur leur fiche). */
  function preparerEtape(cible: CibleEtape) {
    if (!liste) return;
    const raisons = coches.map(x => bloqueEtape(x, cible, liste));
    setEtapeLot({ cible, cibles: coches.filter((_, i) => !raisons[i]), ignores: coches.map((x, i) => ({ nom: nomBien(x), pourquoi: raisons[i] || '' })).filter(x => x.pourquoi), raison: '', avancement: null });
  }
  async function faireEtape() {
    if (!etapeLot) return;
    const { cible, cibles, raison } = etapeLot;
    const av: Avancement = { fait: 0, total: cibles.length, erreurs: [] };
    setEtapeLot(x => (x ? { ...x, avancement: { ...av } } : x));
    for (const x of cibles) {
      try { majBien(await passerEtape(x, cible, raison)); av.fait += 1; }
      catch (e) { av.erreurs.push(`${nomBien(x)} : ${(e as Error).message}`); }
      setEtapeLot(l => (l ? { ...l, avancement: { ...av, erreurs: [...av.erreurs] } } : l));
    }
    void charger();
  }
  async function ouvrirClient(id: string) {
    try { onNavigate('fiche', await ficheClient(id)); } catch (e) { setErreur((e as Error).message); }
  }

  const exclus = actifs.filter(x => EN_COURS.includes(x.etape) && x.mandat_type === 'exclusif').length;
  const honoCompromis = actifs.filter(x => x.etape === 'compromis').reduce((t, x) => t + (honorairesVente(x, (liste?.suivi || []).filter(s2 => s2.bien_id === x.id)) || 0), 0);
  const phrase = [
    exclus ? `${exclus} exclusivité${exclus > 1 ? 's' : ''}` : '',
    honoCompromis ? `${euros(honoCompromis)} d’honoraires TTC sous compromis` : '',
  ].filter(Boolean).join(' · ') || 'Tes biens, du premier contact avec le propriétaire à la signature chez le notaire.';

  const bienOuvert = ouvert && liste ? tousBiens.find(x => x.id === ouvert) || null : null;

  const editeur = edition && typeof document !== 'undefined' && createPortal(
    <EditeurBien key={edition.bien.id} bien={edition.bien} etapeDepart={edition.etape} nouveau={edition.nouveau}
      autres={edition.nouveau ? tousBiens : undefined} vus={edition.vus}
      onOuvrirExistant={id => { const n = edition.bien.id; setEdition(null); setListe(l => (l ? { ...l, biens: l.biens.filter(x => x.id !== n) } : l)); ouvrir(id); }}
      suivi={(liste?.suivi || []).filter(x => x.bien_id === edition.bien.id)} nbAcheteurs={parBien[edition.bien.id]?.acheteurs || 0}
      nbVisites={parBien[edition.bien.id]?.visites || 0} nbPrevues={parBien[edition.bien.id]?.prevues || 0} nbCR={parBien[edition.bien.id]?.cr || 0} nbOffres={parBien[edition.bien.id]?.offres || 0}
      onMaj={majBien}
      onFermer={r => {
        const etaitNouveau = edition.nouveau;
        setEdition(null);
        if (!r) { setListe(l => (l ? { ...l, biens: l.biens.filter(x => x.id !== edition.bien.id) } : l)); return; }
        majBien(r);
        void charger();
        if (etaitNouveau) ouvrir(r.id);
      }} />,
    document.body,
  );

  if (bienOuvert && liste) {
    return (
      <>
        <div key={bienOuvert.id} className="ecran-avant">
        <FicheBien bien={bienOuvert} liste={liste} onRetour={() => ouvrir(null)} onMaj={majBien}
          onSupprime={id => { setListe(l => (l ? { ...l, biens: l.biens.filter(x => x.id !== id) } : l)); ouvrir(null); }}
          onModifier={etape => setEdition({ bien: bienOuvert, etape })} onNavigate={onNavigate} onRecharger={() => { void charger(); }}
          onOuvrir={id => ouvrir(id)}
          onVendu={(r, texte) => { setAnnonce({ id: r.id, titre: r.titre || titreBien(r.donnees || {}), texte }); setFiltre('mandat'); ouvrir(null); }} />
        </div>
        {editeur}
      </>
    );
  }

  if (!liste && attendu) return <SqueletteFiche label="Chargement du bien" />;
  const installer = erreur === MESSAGE_SQL;
  return (
    <div className={`${s.page} ${retour ? 'ecran-arriere' : ''}`}>
      <EnteteRubrique titre="Biens" icone={<Ic n="maison" t={22} />} phrase={phrase}
        recherche={biens.length > 0 ? { valeur: cherche, onChange: setCherche, placeholder: 'Adresse, ville, propriétaire, n° de mandat…', label: 'Chercher un bien' } : undefined}
        bouton={installer ? undefined : { lib: 'Nouveau bien', onClick: () => { setErreurDepart(''); setPour(null); setChoixDepart(true); } }}
        bouton2={installer ? undefined : { lib: 'Importer depuis ImmoFacile', court: 'Importer', ic: <Ic n="telecharger" t={15} />, onClick: () => setImportIF(true) }}
        label="Filtrer par catégorie" actif={filtre} onChoisir={k => setFiltre(k as Filtre)}
        libMenu="Autres étapes"
        tuiles={biens.length === 0 ? [] : [
          /* Les deux étapes du quotidien, puis les autres dans le menu (celles
             qui ont des biens, ou celle qu'on regarde). */
          ...PRINCIPALES.map(k => etapeDe(k))
            .map(e => ({ cle: e.k, lib: e.pluriel, n: filtre === 'archives' ? actifs.filter(x => dansEtape(x, e.k)).length : n(e.k), couleur: e.c })),
          /* V3.96 : ce qui est en ligne, à côté des deux étapes du quotidien. */
          { cle: 'diffusion', lib: 'Diffusion en cours', n: filtre === 'archives' ? actifs.filter(enLigne).length : cherches.filter(enLigne).length, couleur: '#0f7a4f' },
          ...AUTRES.filter(k => (filtre === 'archives' ? actifs.some(x => x.etape === k) : n(k) > 0) || k === filtre).map(k => etapeDe(k))
            .map(e => ({ cle: e.k, lib: e.pluriel, n: filtre === 'archives' ? actifs.filter(x => dansEtape(x, e.k)).length : n(e.k), couleur: e.c, menu: true })),
          { cle: 'tout', lib: 'Tous', n: filtre === 'archives' ? actifs.length : cherches.length, tete: true, fin: true, ic: <Ic n="maison" t={14} e={2.1} /> },
          /* « Archivés » toujours là, même vide : sa place ne bouge pas. */
          { cle: 'archives', lib: 'Archivés', n: archives.length, archive: true },
        ]} />

      {annonce && (
        <BandeauVendu titre={annonce.titre} texte={annonce.texte}
          onFiche={() => { const id = annonce.id; setAnnonce(null); ouvrir(id); }}
          onVendus={() => { setAnnonce(null); setFiltre('vendu'); }} onFermer={() => setAnnonce(null)} />
      )}
      {installer && (
        <div className={s.erreur}><b>Une étape avant de commencer</b>{MESSAGE_SQL}</div>
      )}
      {erreur && !installer && <div className={s.erreur}>{erreur}</div>}
      {brouillons.length > 0 && !installer && (
        <div className={b.brouillons}>
          <div className={b.brouillonsT}>
            <Ic n="info" t={16} />
            <span>{`${brouillons.length > 1 ? `${brouillons.length} brouillons vides` : 'Un brouillon vide'} : « Nouveau bien » ouvert puis laissé, sans rien dedans.`}</span>
            <button type="button" className={b.lien} onClick={() => setBrouillonsOuverts(v => !v)}>{brouillonsOuverts ? 'Replier' : 'Voir'}</button>
            <button type="button" className={`${s.btn} ${b.brouillonsBtn}`} onClick={() => { if (brouillons.length === 1 || confirm(`Supprimer les ${brouillons.length} brouillons vides ?`)) void supprimerBrouillons(brouillons); }}><Ic n="corbeille" t={14} />{brouillons.length > 1 ? 'Tout supprimer' : 'Supprimer'}</button>
          </div>
          {brouillonsOuverts && brouillons.map(x => (
            <div key={x.id} className={b.brouillonL}>
              <span><b>Brouillon vide</b>{` · ${[x.reference, `créé le ${new Date(x.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`].filter(Boolean).join(' · ')}`}</span>
              <button type="button" className={b.lien} onClick={() => ouvrir(x.id)}>Ouvrir</button>
              <button type="button" className={b.lien} onClick={() => { void supprimerBrouillons([x]); }}>Supprimer</button>
            </div>
          ))}
        </div>
      )}

      {liste && !installer && !aerationCachee && (enBloc.length > 0 || aeration) && (
        <div className={b.aerer} role="status">
          <span className={b.aererIc}><Ic n="lignes" t={16} e={2.1} /></span>
          {aeration && aeration.fait + aeration.erreurs >= aeration.total ? (
            <span className={b.aererTx}><b>{`${aeration.fait} annonce${aeration.fait > 1 ? 's mises' : ' mise'} en paragraphes.`}</b>{' Le texte d’origine reste gardé dans chaque fiche.'}</span>
          ) : aeration ? (
            <span className={b.aererTx}><b>{`Mise en paragraphes… ${aeration.fait + aeration.erreurs} sur ${aeration.total}`}</b><i className={b.aererBarre}><i style={{ width: `${((aeration.fait + aeration.erreurs) / aeration.total) * 100}%` }} /></i></span>
          ) : (
            <span className={b.aererTx}><b>{enBloc.length > 1 ? `${enBloc.length} annonces reprises d’ImmoFacile sont d’un seul bloc.` : 'Une annonce reprise d’ImmoFacile est d’un seul bloc.'}</b>{' Les mêmes phrases, regroupées en paragraphes ; rien n’est réécrit.'}</span>
          )}
          {!aeration && <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={() => { void aererTout(); }}>{enBloc.length > 1 ? 'Les mettre en paragraphes' : 'La mettre en paragraphes'}</button>}
          {(!aeration || aeration.fait + aeration.erreurs >= aeration.total) && (
            <button type="button" className={b.annonceVenteX} aria-label="Fermer" onClick={() => { setAerationCachee(true); setAeration(null); }}><Ic n="croix" t={14} /></button>
          )}
        </div>
      )}
      {/* V3.92 : la diffusion des biens en vente, reprise d'ImmoFacile d'un clic (lib/flux-immofacile.ts). */}
      {liste && !installer && <RepriseDiffusion biens={actifs} onFait={() => { void charger(); }} onOuvrir={id => ouvrir(id)} />}
      {liste && !installer && ailleurs > 0 && (
        <div className={b.ailleurs} role="status">
          <Ic n="loupe" t={15} />
          <span>{ailleurs > 1 ? `${ailleurs} autres biens correspondent à « ${cherche.trim()} » dans d’autres étapes.` : `Un autre bien correspond à « ${cherche.trim()} » dans une autre étape.`}</span>
          <button type="button" className={b.lien} onClick={() => setFiltre('tout')}>Voir dans « Tous »</button>
        </div>
      )}
      {liste && !installer && biens.length > 0 && filtre === 'diffusion' && (() => {
        const enL = cherches.filter(enLigne);
        const choix: { k: SousDiff; l: string; n: number; c?: string }[] = [
          { k: 'tous', l: 'Tous', n: enL.length },
          { k: 'mandats', l: 'Mandats', n: enL.filter(x => dansSousDiff(x, 'mandats')).length, c: etapeDe('mandat').c },
          { k: 'annonces', l: 'Annonces type', n: enL.filter(x => dansSousDiff(x, 'annonces')).length, c: etapeDe('annonce_type').c },
        ];
        return (
          <div className={b.sousDiff}>
            <div className={b.sousDiffPills} role="group" aria-label="Classer les biens en ligne">
              {choix.map(x => (
                <button key={x.k} type="button" aria-pressed={sousDiff === x.k} onClick={() => setSousDiff(x.k)}>
                  {x.c && <i className={b.sousDiffPoint} style={{ background: x.c }} />}
                  <span>{x.l}</span><b>{x.n}</b>
                </button>
              ))}
            </div>
            {sousDiff !== 'annonces' && <span className={b.sousDiffAide}><Ic n="megaphone" t={14} /><span>{AIDE_DIFF[sousDiff]}</span></span>}
          </div>
        );
      })()}
      {liste && !installer && biens.length > 0 && (filtre === 'annonce_type' || (filtre === 'diffusion' && sousDiff === 'annonces')) && <ExpliAnnonceType />}
      {liste && !installer && biens.length > 0 && (
        <FiltresBiens biens={(filtre === 'archives' ? archives : actifs).filter(dansCategorie)} f={fins} onF={setFins} tri={tri} onTri={setTri} n={visibles.length} total={avantFiltres}
          vue={vue} onVue={choisirVue} />
      )}

      {!liste ? (
        /* Pendant la lecture : la silhouette des cartes (ou des lignes). */
        <div className={`${vue === 'lignes' ? b.lignesBiens : b.grille} squelette`} aria-busy="true" aria-label="Chargement des biens">
          {[0, 1, 2].map(i => vue === 'lignes'
            ? <div key={i} className="sq-ligne" style={{ animationDelay: `${i * 45}ms` }}><span className="sq-rond" /><span className="sq-txt"><span className="sq-barre" style={{ width: '46%' }} /><span className="sq-barre sq-fine" style={{ width: '30%' }} /></span></div>
            : <div key={i} className="sq-carte" style={{ animationDelay: `${i * 60}ms` }}><span className="sq-photo" /><span className="sq-txt"><span className="sq-barre" style={{ width: '52%' }} /><span className="sq-barre sq-fine" style={{ width: '70%' }} /><span className="sq-barre sq-fine" style={{ width: '40%' }} /></span></div>)}
        </div>
      ) : !installer && (visibles.length === 0 ? (
        <div className={s.liste}>
          <div className={s.vide}>
            <b>{biens.length === 0 ? 'Aucun bien pour l’instant' : 'Rien ici'}</b>
            {biens.length === 0 ? 'Crée ton premier bien : un projet à suivre, une estimation ou un mandat signé. Il s’enregistre au fil de la saisie.' : avantFiltres > 0 ? 'Aucun bien ne correspond à ces filtres : « Effacer » les retire tous.' : 'Aucun bien dans cette catégorie.'}
          </div>
        </div>
      ) : (
        <div className={`${vue === 'lignes' ? b.lignesBiens : b.grille} cascade`} key={`${filtre}:${vue}`}>
          {visibles.map(x => {
            const Rendu = vue === 'lignes' ? LigneBien : CarteBien;
            const on = choisis.has(x.id);
            /* V3.88 : la case, au coin de la photo (au survol, ou dès qu'un bien est coché). */
            return (
              <div key={x.id} className={`${b.selBien} sel-ligne`} data-mode={modeChoix ? 'oui' : 'non'} data-on={on ? 'oui' : 'non'}>
                <Rendu bien={x} suivi={liste.suivi.filter(s2 => s2.bien_id === x.id)} proprio={proprioDe(x)}
                  nbAcheteurs={parBien[x.id]?.acheteurs || 0} nbVisites={parBien[x.id]?.visites || 0} nbPrevues={parBien[x.id]?.prevues || 0} nbCR={parBien[x.id]?.cr || 0} nbOffres={parBien[x.id]?.offres || 0}
                  mandat={mandats[x.id] || null} onClick={() => ouvrir(x.id)} />
                <CaseSelection coin on={on} mode={modeChoix} onBasculer={() => basculerChoix(x.id)} titre={on ? 'Décocher ce bien' : 'Cocher ce bien'} className={vue === 'lignes' ? b.caseLigne : undefined} />
              </div>
            );
          })}
        </div>
      ))}
      {/* La barre de la sélection ne cache pas les derniers biens. */}
      {modeChoix && <div style={{ height: 120 }} aria-hidden="true" />}
      {editeur}
      {/* V3.88 — Les biens cochés : la barre, et ses gestes. */}
      {!lot && !etapeLot && !envoiLot && (
        <BarreSelection n={coches.length} un="bien sélectionné" plusieurs="biens sélectionnés" onVider={viderChoix}
          toutes={visibles.length ? { n: visibles.length + coches.filter(x => !visibles.includes(x)).length, onClick: () => setChoisis(l => new Set([...l, ...visibles.map(x => x.id)])) } : null}
          gestes={[
            /* V3.89 : trois gestes ; l'étape et le reste dans de petits menus. */
            { k: 'envoyer', lib: 'Envoyer à des acheteurs', court: 'Envoyer', ic: 'envoyer', principal: true, onClick: () => setEnvoiLot(coches) },
            { k: 'etape', lib: 'Changer d’étape', court: 'Étape', ic: 'drapeau', menu: CIBLES_ETAPE.map(c => {
              const ok = liste ? coches.filter(x => !bloqueEtape(x, c.k, liste)).length : 0;
              return { k: c.k, lib: c.lib, couleur: etapeDe(c.k).c, onClick: () => preparerEtape(c.k),
                sous: ok === coches.length ? c.sous : ok ? `${ok} sur ${coches.length} peuvent y passer d’ici` : `${coches.length > 1 ? 'Aucun ne peut' : 'Il ne peut pas'} y passer d’ici` };
            }) },
            { k: 'plus', lib: 'Autres actions', ic: 'points', icone: true, menu: [
              coches.every(x => x.archive)
                ? { k: 'desarchiver', lib: 'Sortir des archives', sous: 'Ils reviennent dans la liste', ic: 'archive', onClick: () => preparerLot('desarchiver') }
                : { k: 'archiver', lib: 'Archiver', sous: 'Les biens terminés (vendus, retirés) quittent la liste', ic: 'archive', onClick: () => preparerLot('archiver') },
              { k: 'supprimer', lib: 'Supprimer', sous: 'Définitif : la fiche, ses photos, son suivi', ic: 'corbeille', danger: true, onClick: () => preparerLot('supprimer') },
            ] },
          ]} />
      )}
      {lot && (
        <ConfirmerLot danger={lot.quoi === 'supprimer'}
          titre={lot.quoi === 'supprimer' ? `Supprimer ${lot.cibles.length > 1 ? `${lot.cibles.length} biens` : lot.cibles.length ? '1 bien' : 'ces biens'} ?`
            : lot.quoi === 'archiver' ? `Archiver ${lot.cibles.length > 1 ? `${lot.cibles.length} biens` : lot.cibles.length ? '1 bien' : 'ces biens'} ?`
              : `Sortir ${lot.cibles.length > 1 ? `${lot.cibles.length} biens` : '1 bien'} des archives ?`}
          phrase={lot.quoi === 'supprimer' ? 'C’est définitif : la fiche, ses photos, son suivi et les pièces de son dossier partent avec. Pour le garder sans le voir, archive-le plutôt (une fois vendu ou retiré).'
            : lot.quoi === 'archiver' ? 'Ils quittent la liste et se rangent dans « Archivés », sans rien perdre. Une vente reste comptée.'
              : 'Ils reviennent dans la liste, à leur étape.'}
          liste={lot.cibles.map(nomBien)} ignores={lot.ignores}
          libValider={lot.quoi === 'supprimer' ? `Supprimer définitivement (${lot.cibles.length})` : lot.quoi === 'archiver' ? `Archiver (${lot.cibles.length})` : `Sortir des archives (${lot.cibles.length})`}
          avancement={lot.avancement} onValider={() => { void faireLot(); }} onFermer={() => setLot(null)} />
      )}
      {etapeLot && (
        <ConfirmerLot ic="drapeau"
          titre={`Passer ${etapeLot.cibles.length > 1 ? `${etapeLot.cibles.length} biens` : etapeLot.cibles.length ? '1 bien' : 'ces biens'} « ${etapeDe(etapeLot.cible).court} » ?`}
          phrase={etapeLot.cible === 'retire' ? 'Ils passent « Retiré », gardés dans l’historique. Les demandes des acheteurs sur ces biens se closent.'
            : etapeLot.cible === 'suspendu' ? 'La vente se met en pause. L’envoi aux acheteurs reprendra avec elle.'
              : etapeLot.cible === 'a_suivre' ? 'L’estimation est mise en attente : le bien repasse « À suivre », ce qui a été fait reste gardé.'
                : 'Le bien passe « Estimation ». Le rendez-vous et le montant se posent ensuite depuis sa fiche.'}
          liste={etapeLot.cibles.map(nomBien)} ignores={etapeLot.ignores}
          libValider={`Passer « ${etapeDe(etapeLot.cible).court} » (${etapeLot.cibles.length})`}
          enPlus={etapeLot.cibles.length > 0 && !etapeLot.avancement ? <RaisonEtape cible={etapeLot.cible} v={etapeLot.raison} off={false} onChange={r => setEtapeLot(x => (x ? { ...x, raison: r } : x))} /> : null}
          avancement={etapeLot.avancement} onValider={() => { void faireEtape(); }} onFermer={() => setEtapeLot(null)} />
      )}
      {envoiLot && liste && (
        <FenEnvoiLot biens={envoiLot} liste={liste} nomBien={nomBien} onFermer={() => setEnvoiLot(null)} onFait={() => { void charger(); }}
          onFiche={id => { setEnvoiLot(null); void ouvrirClient(id); }} />
      )}
      {choixDepart && <FenNouveau occupe={cree} erreur={erreurDepart} pour={pour && liste?.clients[pour] ? nomClient(liste.clients[pour]) : ''}
        existants={existantsPour} onOuvrir={id => { setChoixDepart(false); setPour(null); ouvrir(id); }}
        onFermer={() => { if (!cree) { setChoixDepart(false); setPour(null); } }} onChoisir={e => { void nouveau(e); }} />}
      {/* V3.79 : la reprise des biens d'ImmoFacile. */}
      {importIF && <ImportBiensIF onFermer={() => setImportIF(false)} onImporte={() => { void charger(); }} />}
      {mandatNeuf && typeof document !== 'undefined' && <FenMandat bien={mandatNeuf.bien} creation onFermer={() => { void abandonnerMandatNeuf(); }}
        onFait={r => { const vus = mandatNeuf.vus; setMandatNeuf(null); majBien(r); setEdition({ bien: r, nouveau: true, vus }); }} />}
    </div>
  );
}
