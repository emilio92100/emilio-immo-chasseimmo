'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { euros } from '@/lib/mandat';
import { signalerMaj } from '@/lib/intentions';
import { ETAPES_VENTE, EN_COURS, nomProprio, type BienVente, type EtapeVente } from '@/lib/biens-vente';
import EnteteRubrique from '@/components/shared/EnteteRubrique';
import { Ic } from '@/components/documents/ApercuActe';
import CarteBien, { honorairesVente } from './CarteBien';
import EditeurBien from './EditeurBien';
import FicheBien from './FicheBien';
import { MESSAGE_SQL, SEUIL_CORRESPOND, acheteursPour, chargerListe, creerBien, nomClient, type ListeBiens } from './outils';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';

/* ═══ Biens en vente ══════════════════════════════════════════════════════
   Les biens qu'Alexandre vend pour un propriétaire, de l'estimation à la
   vente. La liste en cartes, filtrée par étape ; la fiche d'un bien ; son
   éditeur plein écran. Le bien ouvert vit dans l'URL (?page=biens&bien=…) :
   un F5 ou le bouton Précédent y ramènent. */

type Filtre = 'tout' | EtapeVente | 'archives';
const ORDRE: EtapeVente[] = ['mandat', 'offre', 'compromis', 'estimation', 'suspendu', 'vendu', 'retire'];
const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const lireBienUrl = () => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('bien'));
function ecrireBienUrl(id: string | null) {
  const p = new URLSearchParams(window.location.search);
  if (id) p.set('bien', id); else p.delete('bien');
  p.set('page', 'biens');
  const url = `${window.location.pathname}?${p.toString()}`;
  if (url !== window.location.pathname + window.location.search) window.history.pushState(null, '', url);
}

export default function PageBiens({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [liste, setListe] = useState<ListeBiens | null>(null);
  const [erreur, setErreur] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tout');
  const [cherche, setCherche] = useState('');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [edition, setEdition] = useState<{ bien: BienVente; etape?: string; nouveau?: boolean } | null>(null);
  const [cree, setCree] = useState(false);

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
      })
      .catch(e => { if (vivant) { setErreur((e as Error).message); setListe({ biens: [], suivi: [], copies: [], visites: [], clients: {}, recherches: [] }); } });
    const retour = () => setOuvert(lireBienUrl());
    window.addEventListener('popstate', retour);
    return () => { vivant = false; window.removeEventListener('popstate', retour); };
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

  async function nouveau() {
    if (!liste) return;
    setCree(true);
    try {
      const r = await creerBien(liste.biens.map(x => x.reference));
      majBien(r);
      setEdition({ bien: r, nouveau: true });
    } catch (e) { alert((e as Error).message); }
    setCree(false);
  }

  /* Ce que chaque carte affiche : acheteurs, visites, offres. */
  const parBien = useMemo(() => {
    const m: Record<string, { acheteurs: number; visites: number; offres: number }> = {};
    if (!liste) return m;
    for (const x of liste.biens) {
      const copies = liste.copies.filter(c => c.bien_vente_id === x.id);
      const ids = new Set(copies.map(c => c.id));
      const enVente = !['vendu', 'retire'].includes(x.etape);
      m[x.id] = {
        acheteurs: enVente ? acheteursPour(x, liste.recherches, liste.clients, copies).filter(a => a.corr.note >= SEUIL_CORRESPOND).length : 0,
        visites: liste.suivi.filter(s2 => s2.bien_id === x.id && s2.type === 'visite' && s2.statut !== 'annulee').length
          + liste.visites.filter(v => ids.has(v.bien_id) && v.statut !== 'annulee').length,
        offres: liste.suivi.filter(s2 => s2.bien_id === x.id && s2.type === 'offre').length,
      };
    }
    return m;
  }, [liste]);

  const biens = liste?.biens || [];
  const actifs = biens.filter(x => !x.archive);
  const archives = biens.filter(x => x.archive);
  const q = sansAccent(cherche.trim());
  const proprioDe = (x: BienVente) => (x.client_id && liste?.clients[x.client_id] ? nomClient(liste.clients[x.client_id]) : '');
  const cherches = (filtre === 'archives' ? archives : actifs).filter(x => !q || sansAccent([
    x.titre, x.adresse, x.ville, x.quartier, x.code_postal, x.reference, x.mandat_numero, nomProprio(x.donnees || {}), proprioDe(x),
  ].filter(Boolean).join(' ')).includes(q));
  const visibles = cherches
    .filter(x => filtre === 'tout' || filtre === 'archives' || x.etape === filtre)
    .sort((p, r) => ORDRE.indexOf(p.etape) - ORDRE.indexOf(r.etape) || r.updated_at.localeCompare(p.updated_at));
  const n = (e: EtapeVente) => cherches.filter(x => x.etape === e).length;

  const exclus = actifs.filter(x => EN_COURS.includes(x.etape) && x.mandat_type === 'exclusif').length;
  const honoCompromis = actifs.filter(x => x.etape === 'compromis').reduce((t, x) => t + (honorairesVente(x, (liste?.suivi || []).filter(s2 => s2.bien_id === x.id)) || 0), 0);
  const phrase = [
    exclus ? `${exclus} exclusivité${exclus > 1 ? 's' : ''}` : '',
    honoCompromis ? `${euros(honoCompromis)} d’honoraires sous compromis` : '',
  ].filter(Boolean).join(' · ') || 'Les biens que tu vends, de l’estimation à la signature chez le notaire.';

  const bienOuvert = ouvert && liste ? biens.find(x => x.id === ouvert) || null : null;

  const editeur = edition && typeof document !== 'undefined' && createPortal(
    <EditeurBien key={edition.bien.id} bien={edition.bien} etapeDepart={edition.etape} nouveau={edition.nouveau}
      suivi={(liste?.suivi || []).filter(x => x.bien_id === edition.bien.id)} nbAcheteurs={parBien[edition.bien.id]?.acheteurs || 0}
      nbVisites={parBien[edition.bien.id]?.visites || 0} nbOffres={parBien[edition.bien.id]?.offres || 0}
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
          onModifier={etape => setEdition({ bien: bienOuvert, etape })} onNavigate={onNavigate} onRecharger={() => { void charger(); }} />
        {editeur}
      </>
    );
  }

  const installer = erreur === MESSAGE_SQL;
  return (
    <div className={s.page}>
      <EnteteRubrique titre="Biens en vente" icone={<Ic n="maison" t={22} />} phrase={phrase}
        recherche={biens.length > 0 ? { valeur: cherche, onChange: setCherche, placeholder: 'Adresse, ville, propriétaire, n° de mandat…', label: 'Chercher un bien' } : undefined}
        bouton={installer ? undefined : { lib: cree ? 'Création…' : 'Nouveau bien', onClick: () => { if (!cree) void nouveau(); } }}
        label="Filtrer par étape" actif={filtre} onChoisir={k => setFiltre(k as Filtre)}
        tuiles={biens.length === 0 ? [] : [
          { cle: 'tout', lib: 'Tous', n: filtre === 'archives' ? actifs.length : cherches.length },
          ...ETAPES_VENTE.filter(e => ['estimation', 'mandat', 'offre', 'compromis', 'vendu'].includes(e.k) || n(e.k) > 0)
            .map(e => ({ cle: e.k, lib: e.court, n: filtre === 'archives' ? actifs.filter(x => x.etape === e.k).length : n(e.k), couleur: e.c })),
          ...(archives.length ? [{ cle: 'archives', lib: 'Archivés', n: archives.length, couleur: '#cbd5e1' }] : []),
        ]} />

      {installer && (
        <div className={s.erreur}><b>Une étape avant de commencer</b>{MESSAGE_SQL}</div>
      )}
      {erreur && !installer && <div className={s.erreur}>{erreur}</div>}

      {!liste ? (
        <div className={s.liste}><div className={s.vide}>Chargement…</div></div>
      ) : !installer && (visibles.length === 0 ? (
        <div className={s.liste}>
          <div className={s.vide}>
            <b>{biens.length === 0 ? 'Aucun bien en vente pour l’instant' : 'Rien ici'}</b>
            {biens.length === 0 ? 'Crée ton premier bien : étape par étape ou tout sur une page, il s’enregistre au fil de la saisie.' : 'Aucun bien ne correspond à ce filtre.'}
          </div>
        </div>
      ) : (
        <div className={b.grille}>
          {visibles.map(x => (
            <CarteBien key={x.id} bien={x} suivi={liste.suivi.filter(s2 => s2.bien_id === x.id)} proprio={proprioDe(x)}
              nbAcheteurs={parBien[x.id]?.acheteurs || 0} nbVisites={parBien[x.id]?.visites || 0} nbOffres={parBien[x.id]?.offres || 0}
              onClick={() => ouvrir(x.id)} />
          ))}
        </div>
      ))}
      {editeur}
    </div>
  );
}
