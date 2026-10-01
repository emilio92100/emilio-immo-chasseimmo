'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { euros, jourParis } from '@/lib/mandat';
import { EVT_DEMANDE_VUE, EVT_NOUVEAU_BIEN, annoncerVue, prendreNouveauBien, signalerMaj, vueDemandee } from '@/lib/intentions';
import { EN_COURS, ETAPES_VENTE, etapeDe, nomProprio, titreBien, type BienVente, type EtapeVente } from '@/lib/biens-vente';
import EnteteRubrique from '@/components/shared/EnteteRubrique';
import { Ic } from '@/components/documents/ApercuActe';
import CarteBien, { LigneBien, honorairesVente } from './CarteBien';
import EditeurBien from './EditeurBien';
import FicheBien from './FicheBien';
import { FenNouveau } from './FenetresBien';
import FiltresBiens, { FILTRES_VIDES, filtrer, trier, type Filtres, type Tri } from './FiltresBiens';
import { MESSAGE_SQL, SEUIL_CORRESPOND, acheteursPour, chargerListe, creerBien, donneesProprio, mandatsParBien, marquerVendeur, nomClient, type ListeBiens } from './outils';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';

/* ═══ Biens ═══════════════════════════════════════════════════════════════
   Les biens qu'Alexandre vend ou pourrait vendre pour un propriétaire : un
   projet à suivre, une estimation, un mandat, jusqu'à la vente. La liste en
   cartes, avec une catégorie par étape ; la fiche d'un bien ; son éditeur
   plein écran. « Nouveau bien » demande d'abord où il en est. Le bien ouvert
   vit dans l'URL (?page=biens&bien=…) : un F5 ou le bouton Précédent y
   ramènent. */

type Filtre = 'tout' | EtapeVente | 'archives';
const ORDRE: EtapeVente[] = ['mandat', 'offre', 'compromis', 'estimation', 'a_suivre', 'suspendu', 'vendu', 'retire'];
/* Les catégories toujours montrées ; « En pause » et « Retirés » seulement
   quand il y en a. */
const CATEGORIES: EtapeVente[] = ['a_suivre', 'estimation', 'mandat', 'offre', 'compromis', 'vendu'];
const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const lireBienUrl = () => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('bien'));
function ecrireBienUrl(id: string | null) {
  const p = new URLSearchParams(window.location.search);
  if (id) p.set('bien', id); else p.delete('bien');
  p.set('page', 'biens');
  const url = `${window.location.pathname}?${p.toString()}`;
  if (url !== window.location.pathname + window.location.search) window.history.pushState(null, '', url);
}

/* La catégorie d'une vue (« estimation »…) ; rien de reconnu : « Tous ». */
const lireFiltre = (v: string | null): Filtre =>
  v === 'tout' || v === 'archives' || ETAPES_VENTE.some(e => e.k === v) ? v as Filtre : 'tout';

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
  const [edition, setEdition] = useState<{ bien: BienVente; etape?: string; nouveau?: boolean } | null>(null);
  const [cree, setCree] = useState(false);
  const [choixDepart, setChoixDepart] = useState(false);
  const [erreurDepart, setErreurDepart] = useState('');
  /* « Créer son bien » depuis la fiche d'un contact : le propriétaire est déjà choisi. */
  const [pour, setPour] = useState<string | null>(null);
  /* V3.47 : « C'est vendu » ramène sur les mandats en cours, avec ce bandeau
     qui confirme la vente (Alexandre : « qu'on ait l'impression que l'action
     a bien été prise en compte »). Il s'efface seul au bout de 20 s. */
  const [annonce, setAnnonce] = useState<{ id: string; titre: string; texte: string } | null>(null);
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
    setOuvert(id);
    ecrireBienUrl(id);
    document.querySelector('main')?.scrollTo({ top: 0 });
    document.querySelector('.crm-app > div')?.scrollTo({ top: 0 });
  };
  const majBien = useCallback((r: BienVente) => {
    setListe(l => (l ? { ...l, biens: l.biens.some(x => x.id === r.id) ? l.biens.map(x => (x.id === r.id ? r : x)) : [r, ...l.biens] } : l));
  }, []);

  async function nouveau(etape: EtapeVente) {
    if (!liste) return;
    setCree(true); setErreurDepart('');
    try {
      const c = pour ? liste.clients[pour] : null;
      const r = await creerBien(liste.biens.map(x => x.reference), etape, c ? donneesProprio(c) : {});
      if (c) void marquerVendeur(c.id);
      majBien(r);
      setChoixDepart(false); setPour(null);
      setEdition({ bien: r, nouveau: true });
    } catch (e) { setErreurDepart((e as Error).message); }
    setCree(false);
  }

  /* Ce que chaque carte affiche : acheteurs, visites, offres. */
  const parBien = useMemo(() => {
    const m: Record<string, { acheteurs: number; visites: number; prevues: number; offres: number }> = {};
    if (!liste) return m;
    /* Prévue : à venir et pas encore passée ; le reste est fait (V3.33). */
    const auj = jourParis();
    for (const x of liste.biens) {
      const copies = liste.copies.filter(c => c.bien_vente_id === x.id);
      const ids = new Set(copies.map(c => c.id));
      const enVente = !['vendu', 'retire'].includes(x.etape);
      m[x.id] = {
        acheteurs: enVente ? acheteursPour(x, liste.recherches, liste.clients, copies).filter(a => a.corr.note >= SEUIL_CORRESPOND).length : 0,
        visites: liste.suivi.filter(s2 => s2.bien_id === x.id && s2.type === 'visite' && s2.statut !== 'annulee').length
          + liste.visites.filter(v => ids.has(v.bien_id) && v.statut !== 'annulee').length,
        prevues: liste.suivi.filter(s2 => s2.bien_id === x.id && s2.type === 'visite' && s2.statut === 'a_venir' && (!s2.le || String(s2.le).slice(0, 10) >= auj)).length
          + liste.visites.filter(v => ids.has(v.bien_id) && v.statut === 'a_venir' && (!v.date_visite || String(v.date_visite).slice(0, 10) >= auj)).length,
        offres: liste.suivi.filter(s2 => s2.bien_id === x.id && s2.type === 'offre').length,
      };
    }
    return m;
  }, [liste]);

  /* Où en est le mandat de chaque bien dans Documents (V3.42). */
  const mandats = useMemo(() => (liste ? mandatsParBien(liste) : {}), [liste]);

  const biens = liste?.biens || [];
  const actifs = biens.filter(x => !x.archive);
  const archives = biens.filter(x => x.archive);
  const q = sansAccent(cherche.trim());
  const proprioDe = (x: BienVente) => (x.client_id && liste?.clients[x.client_id] ? nomClient(liste.clients[x.client_id]) : '');
  const trouves = (filtre === 'archives' ? archives : actifs).filter(x => !q || sansAccent([
    x.titre, x.adresse, x.ville, x.quartier, x.code_postal, x.reference, x.mandat_numero, nomProprio(x.donnees || {}), proprioDe(x),
  ].filter(Boolean).join(' ')).includes(q));
  /* Les filtres fins comptent comme la recherche : les nombres des
     catégories les suivent. */
  const cherches = filtrer(trouves, fins);
  const dansCategorie = (x: BienVente) => filtre === 'tout' || filtre === 'archives' || x.etape === filtre;
  const parEtape = (p: BienVente, r: BienVente) => ORDRE.indexOf(p.etape) - ORDRE.indexOf(r.etape) || r.updated_at.localeCompare(p.updated_at);
  const visibles = trier(cherches.filter(dansCategorie), tri, parEtape);
  const avantFiltres = trouves.filter(dansCategorie).length;
  const n = (e: EtapeVente) => cherches.filter(x => x.etape === e).length;

  const exclus = actifs.filter(x => EN_COURS.includes(x.etape) && x.mandat_type === 'exclusif').length;
  const honoCompromis = actifs.filter(x => x.etape === 'compromis').reduce((t, x) => t + (honorairesVente(x, (liste?.suivi || []).filter(s2 => s2.bien_id === x.id)) || 0), 0);
  const phrase = [
    exclus ? `${exclus} exclusivité${exclus > 1 ? 's' : ''}` : '',
    honoCompromis ? `${euros(honoCompromis)} d’honoraires sous compromis` : '',
  ].filter(Boolean).join(' · ') || 'Tes biens, du premier contact avec le propriétaire à la signature chez le notaire.';

  const bienOuvert = ouvert && liste ? biens.find(x => x.id === ouvert) || null : null;

  const editeur = edition && typeof document !== 'undefined' && createPortal(
    <EditeurBien key={edition.bien.id} bien={edition.bien} etapeDepart={edition.etape} nouveau={edition.nouveau}
      suivi={(liste?.suivi || []).filter(x => x.bien_id === edition.bien.id)} nbAcheteurs={parBien[edition.bien.id]?.acheteurs || 0}
      nbVisites={parBien[edition.bien.id]?.visites || 0} nbPrevues={parBien[edition.bien.id]?.prevues || 0} nbOffres={parBien[edition.bien.id]?.offres || 0}
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
        <FicheBien key={bienOuvert.id} bien={bienOuvert} liste={liste} onRetour={() => ouvrir(null)} onMaj={majBien}
          onSupprime={id => { setListe(l => (l ? { ...l, biens: l.biens.filter(x => x.id !== id) } : l)); ouvrir(null); }}
          onModifier={etape => setEdition({ bien: bienOuvert, etape })} onNavigate={onNavigate} onRecharger={() => { void charger(); }}
          onOuvrir={id => ouvrir(id)}
          onVendu={(r, texte) => { setAnnonce({ id: r.id, titre: r.titre || titreBien(r.donnees || {}), texte }); setFiltre('mandat'); ouvrir(null); }} />
        {editeur}
      </>
    );
  }

  const installer = erreur === MESSAGE_SQL;
  return (
    <div className={s.page}>
      <EnteteRubrique titre="Biens" icone={<Ic n="maison" t={22} />} phrase={phrase}
        recherche={biens.length > 0 ? { valeur: cherche, onChange: setCherche, placeholder: 'Adresse, ville, propriétaire, n° de mandat…', label: 'Chercher un bien' } : undefined}
        bouton={installer ? undefined : { lib: 'Nouveau bien', onClick: () => { setErreurDepart(''); setPour(null); setChoixDepart(true); } }}
        label="Filtrer par catégorie" actif={filtre} onChoisir={k => setFiltre(k as Filtre)}
        tuiles={biens.length === 0 ? [] : [
          { cle: 'tout', lib: 'Tous', n: filtre === 'archives' ? actifs.length : cherches.length, tete: true, ic: <Ic n="maison" t={14} e={2.1} /> },
          ...[...CATEGORIES, 'suspendu' as const, 'retire' as const].map(k => etapeDe(k)).filter(e => CATEGORIES.includes(e.k) || n(e.k) > 0)
            .map(e => ({ cle: e.k, lib: e.pluriel, n: filtre === 'archives' ? actifs.filter(x => x.etape === e.k).length : n(e.k), couleur: e.c })),
          ...(archives.length ? [{ cle: 'archives', lib: 'Archivés', n: archives.length, couleur: '#cbd5e1' }] : []),
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

      {liste && !installer && biens.length > 0 && (
        <FiltresBiens biens={filtre === 'archives' ? archives : actifs} f={fins} onF={setFins} tri={tri} onTri={setTri} n={visibles.length} total={avantFiltres}
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
            return (
              <Rendu key={x.id} bien={x} suivi={liste.suivi.filter(s2 => s2.bien_id === x.id)} proprio={proprioDe(x)}
                nbAcheteurs={parBien[x.id]?.acheteurs || 0} nbVisites={parBien[x.id]?.visites || 0} nbPrevues={parBien[x.id]?.prevues || 0} nbOffres={parBien[x.id]?.offres || 0}
                mandat={mandats[x.id] || null} onClick={() => ouvrir(x.id)} />
            );
          })}
        </div>
      ))}
      {editeur}
      {choixDepart && <FenNouveau occupe={cree} erreur={erreurDepart} pour={pour && liste?.clients[pour] ? nomClient(liste.clients[pour]) : ''}
        onFermer={() => { if (!cree) { setChoixDepart(false); setPour(null); } }} onChoisir={e => { void nouveau(e); }} />}
    </div>
  );
}
