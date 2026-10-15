'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase, addJournal } from '@/lib/supabase';
import { verifie, signalerEchec } from '@/lib/ecritures';
import { Icone, Appreciation, BilanBien, OR } from './ParcoursBien';
import FenetreBien, { BoutonPied, Ressort, InfoPied } from './FenetreBien';
import { siteDe } from '@/lib/annonces-client';
import { aUneAnalyse, sansAnalyse, type Analyse } from '@/lib/analyse-bien';
import {
  lienAgences, messageAgence, quiPropose, resumePourAgence, tableAgencesAbsente, type PropositionAgence,
} from '@/lib/agences-lien';
import {
  agencesDuClient, creerJeton, envoyerMailAgence, estMobile, lienMail, lienSms, lireOuCreerJeton, mailValide, messagePour, noterEnvoi,
  type AgenceConnue, type Canal, type Destinataire, type Jeton,
} from '@/lib/lien-agences-envois';
import { nombre, rapprocher, villeDeLAdresse, type Rapprochement, type Repere } from '@/lib/meme-bien';
import s from './AnnoncesClient.module.css';
import a from './PropositionsAgences.module.css';

/**
 * « Proposés par des agences » — dans l'onglet Veille (V3.197).
 *
 * Alexandre : « quand une agence me dit d'aller voir sur son site, qu'elle
 * puisse me l'envoyer et que ça arrive direct dans la veille, et que moi je
 * puisse écarter ou pas ». Les biens arrivent par le lien de la recherche
 * (page /proposer/<jeton>), déjà lus et analysés par le serveur
 * (api/agences/proposer) : une note, une phrase, les atouts, ce qu'il faut
 * vérifier — comme la veille.
 *   Retenir  → le bien est créé en Sélection, avec l'agence et son numéro.
 *   Écarter  → il ne revient plus ; l'agence n'en sait rien.
 * En tête : « Lien pour les agences » (le lien, le message à envoyer par SMS
 * ou par mail, ce que l'agence voit, « Couper ce lien »).
 *
 * Sans le SQL (outils/sql/lien-agences.sql) : une ligne le dit, rien d'autre.
 *
 * V3.198 — « Sans doute le même bien » : un bien envoyé sous un autre lien
 * que celui qu'Alexandre a déjà (son dossier, la Veille, une annonce du
 * client, une autre agence) est rapproché par sa surface, sa ville, ses
 * pièces et son prix (src/lib/meme-bien.ts). Une ligne le dit sur la carte.
 */

const couleurNote = (n: number) => (n >= 85 ? '#16a34a' : n >= 70 ? OR : n >= 50 ? '#d97706' : '#dc2626');
const lienCourt = (u: string) => u.replace(/^https?:\/\/(www\d?\.)?/i, '').replace(/\/$/, '');
const pad = (n: number) => String(n).padStart(2, '0');

/** « aujourd'hui à 18 h 40 », « hier à 9 h 05 », « le 12 octobre » */
function quandPropose(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const h = `${d.getHours()} h ${pad(d.getMinutes())}`;
  const j = Math.round((new Date(new Date().toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (j === 0) return `aujourd’hui à ${h}`;
  if (j === 1) return `hier à ${h}`;
  return `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
}

type EtatAnalyse = { etat: 'encours' } | { etat: 'erreur'; erreur: string };

const court = (t: string) => (t.length > 64 ? `${t.slice(0, 62).trim()}…` : t);

/* Un bien proposé par une agence, vu par le rapprochement. */
function repereAgence(p: PropositionAgence, ou: string): Repere {
  const f: Record<string, any> = p.fiche && typeof p.fiche === 'object' ? p.fiche : {};
  return {
    cle: `agence:${p.id}`, ou, titre: court(String(f.titre || `le bien de ${p.agence || 'une agence'}`)), url: p.url || f.url || null,
    prix: nombre(f.prix_acquereur ?? f.prix_vendeur ?? p.prix), surface: nombre(f.surface ?? p.surface), pieces: nombre(f.nb_pieces),
    ville: f.ville || villeDeLAdresse(p.adresse || f.adresse), rang: 3,
  };
}

/* Tout ce qu'Alexandre a déjà pour cette recherche, pour « Sans doute le même
   bien ». Une lecture qui échoue retire seulement ses repères (rien n'est écrit). */
async function chargerReperes(rechercheId: string, propositions: PropositionAgence[]): Promise<Repere[]> {
  const [b, v, c] = await Promise.all([
    supabase.from('biens').select('id, titre, ville, adresse, url, surface, nb_pieces, prix_vendeur, prix_acquereur, etape').eq('recherche_id', rechercheId).limit(500),
    supabase.from('veille_propositions').select('id, url, titre, ville, adresse, prix, surface, nb_pieces, statut, bien_id').eq('recherche_id', rechercheId).limit(1000),
    supabase.from('annonces_client').select('*').eq('recherche_id', rechercheId).limit(300),
  ]);
  for (const [quoi, r] of [['biens', b], ['veille', v], ['annonces du client', c]] as const) {
    if (r.error) console.error(`[même bien] ${quoi}`, r.error.message);
  }
  const biens = (b.data || []) as Record<string, any>[];
  const dansLeDossier = new Set(biens.map(x => x.id as string));
  const out: Repere[] = biens.map(x => ({
    cle: `bien:${x.id}`, ou: x.etape === 'presente' ? 'dans ses Présentés' : 'dans sa Sélection',
    titre: court(String(x.titre || 'un bien de son dossier')), url: x.url || null,
    prix: nombre(x.prix_acquereur ?? x.prix_vendeur), surface: nombre(x.surface), pieces: nombre(x.nb_pieces),
    ville: x.ville || villeDeLAdresse(x.adresse), rang: 0,
  }));
  for (const x of (v.data || []) as Record<string, any>[]) {
    if (x.bien_id && dansLeDossier.has(x.bien_id)) continue;
    out.push({
      cle: `veille:${x.id}`, ou: x.statut === 'ecarte' ? 'écarté dans la Veille' : 'dans la Veille',
      titre: court(String(x.titre || 'un bien de la Veille')), url: x.url || null,
      prix: nombre(x.prix), surface: nombre(x.surface), pieces: nombre(x.nb_pieces), ville: x.ville || villeDeLAdresse(x.adresse), rang: 1,
    });
  }
  for (const x of (c.data || []) as Record<string, any>[]) {
    if (x.bien_id && dansLeDossier.has(x.bien_id)) continue;
    const f: Record<string, any> = x.fiche && typeof x.fiche === 'object' ? x.fiche : {};
    out.push({
      cle: `client:${x.id}`, ou: x.statut === 'ecarte' ? 'envoyé par le client, écarté' : 'envoyé par le client',
      titre: court(String(f.titre || 'son annonce')), url: x.url || null,
      prix: nombre(f.prix_acquereur ?? f.prix_vendeur), surface: nombre(f.surface), pieces: nombre(f.nb_pieces),
      ville: f.ville || villeDeLAdresse(f.adresse), rang: 2,
    });
  }
  for (const p of propositions) {
    if (p.bien_id && dansLeDossier.has(p.bien_id)) continue;
    const qui = p.agence || 'une agence';
    out.push(repereAgence(p, p.statut === 'ecarte' ? `proposé par ${qui}, écarté` : p.statut === 'nouveau' ? `aussi proposé par ${qui}` : `proposé par ${qui}`));
  }
  return out;
}

async function demanderAnalyse(rechercheId: string, fiche: Record<string, unknown>, propositionId: string):
  Promise<{ ok: true; analyse: Analyse } | { ok: false; erreur: string }> {
  try {
    const r = await fetch('/api/analyse-bien', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recherche_id: rechercheId, bien: fiche, proposition_id: propositionId }),
    });
    const d = await r.json().catch(() => null) as { ok?: boolean; analyse?: Analyse; erreur?: string } | null;
    if (!r.ok || !d?.ok || !d.analyse) return { ok: false, erreur: d?.erreur || `le serveur a répondu ${r.status}` };
    return { ok: true, analyse: d.analyse };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message || 'pas de réponse' };
  }
}

export default function PropositionsAgences({ clientId, rechercheId, recherche, prenom, onChange }: {
  clientId: string; rechercheId: string;
  /** V3.198 : le prénom du client, pour « Les agences de Didier » et la note dans le suivi */
  prenom?: string | null;
  /** la recherche (son résumé pour l'agence, et les couleurs de « Voir en grand ») */
  recherche?: any;
  onChange?: () => void;
}) {
  const [liste, setListe] = useState<PropositionAgence[] | null>(null);
  const [ecartees, setEcartees] = useState<PropositionAgence[]>([]);
  const [stats, setStats] = useState({ biens: 0, agences: 0 });
  const [absent, setAbsent] = useState(false);
  const [voirEcartees, setVoirEcartees] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [dit, setDit] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, EtatAnalyse>>({});
  const [grand, setGrand] = useState<{ id: string; i: number } | null>(null);
  const [messageGrand, setMessageGrand] = useState<string | null>(null);
  const [fenetreLien, setFenetreLien] = useState(false);
  const [reperes, setReperes] = useState<Repere[]>([]);
  const minuteur = useRef<number | undefined>(undefined);

  const charger = useCallback(async () => {
    if (!rechercheId) return;
    const { data, error } = await supabase.from('propositions_agences').select('*').eq('recherche_id', rechercheId)
      .order('created_at', { ascending: false }).limit(200);
    if (error) {
      if (tableAgencesAbsente(error)) setAbsent(true); else console.error('[propositions des agences]', error.message);
      setListe([]); return;
    }
    const l = (data || []) as PropositionAgence[];
    setAbsent(false);
    setListe(l.filter(p => p.statut === 'nouveau'));
    setEcartees(l.filter(p => p.statut === 'ecarte').slice(0, 30));
    setStats({ biens: l.length, agences: new Set(l.map(p => String(p.agence || '').trim().toLowerCase()).filter(Boolean)).size });
    if (l.some(p => p.statut === 'nouveau')) setReperes(await chargerReperes(rechercheId, l));
  }, [rechercheId]);
  useEffect(() => { void charger(); }, [charger]);
  useEffect(() => () => window.clearTimeout(minuteur.current), []);
  const annoncer = (m: string) => {
    setDit(m);
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => setDit(null), 3500);
  };

  /* L'analyse, si celle du serveur n'est pas passée (ou à refaire). */
  async function analyser(p: PropositionAgence) {
    const f = p.fiche && typeof p.fiche === 'object' ? p.fiche : null;
    if (!f) return;
    setAnalyses(m => ({ ...m, [p.id]: { etat: 'encours' } }));
    const r = await demanderAnalyse(rechercheId, sansAnalyse(f), p.id);
    if (!r.ok) { setAnalyses(m => ({ ...m, [p.id]: { etat: 'erreur', erreur: r.erreur } })); return; }
    const ok = await verifie('L’analyse du bien proposé', supabase.from('propositions_agences')
      .update({ fiche: { ...sansAnalyse(f), ...r.analyse } }).eq('id', p.id).select('id'), { ligne: true });
    setAnalyses(m => { const x = { ...m }; if (ok) delete x[p.id]; else x[p.id] = { etat: 'erreur', erreur: 'elle n’a pas été enregistrée' }; return x; });
    await charger();
  }

  async function ecarter(p: PropositionAgence) {
    if (enCours) return;
    setEnCours(p.id);
    const ok = await verifie('L’écart du bien proposé', supabase.from('propositions_agences').update({
      statut: 'ecarte', decide_le: new Date().toISOString(),
    }).eq('id', p.id).select('id'), { ligne: true });
    if (ok) {
      await addJournal(clientId, 'proposition_agence', `🏢 Bien proposé par ${p.agence || 'une agence'}, écarté — ${p.fiche?.titre || ''}`,
        'L’agence n’en est pas prévenue.', { proposition_agence_id: p.id }, { rechercheId });
      setMessageGrand('Écarté.');
      annoncer('Écarté : il ne reviendra plus.');
    }
    setEnCours(null);
    await charger(); onChange?.();
  }

  /* « Retenir » : la fiche devient un bien de sa Sélection, avec son analyse,
     l'agence et son numéro. Le même lien déjà dans le dossier : rattaché. */
  async function retenir(p: PropositionAgence) {
    if (enCours) return;
    const f: Record<string, any> = { ...(p.fiche && typeof p.fiche === 'object' ? p.fiche : {}) };
    setEnCours(p.id);
    let bienId: string | null = null;
    const url = f.url || p.url || null;
    /* V3.198 : le même lien, écrit autrement (« www. », « / » final), déjà dans son dossier. */
    const meme = rapprocher(repereAgence(p, ''), reperes);
    if (meme?.lien && meme.repere.cle.startsWith('bien:')) bienId = meme.repere.cle.slice(5);
    if (url && !bienId) {
      const { data: ex } = await supabase.from('biens').select('id').eq('recherche_id', rechercheId).eq('url', url).maybeSingle();
      if (ex) bienId = (ex as { id: string }).id;
    }
    const deja = !!bienId;
    if (!bienId) {
      const aPoser: Record<string, any> = {
        ...f, url, client_id: clientId, recherche_id: rechercheId, etape: 'selection', badge_retour: 'propose',
        titre: f.titre || [p.agence, p.surface ? `${p.surface} m²` : ''].filter(Boolean).join(' · ') || 'Bien proposé par une agence',
        adresse: f.adresse || p.adresse || null,
        prix_vendeur: f.prix_vendeur || p.prix || null,
        surface: f.surface || p.surface || null,
        photos: Array.isArray(f.photos) && f.photos.length ? f.photos : (p.photos || []),
        agence_nom: p.agence || f.agence_nom || null,
        agence_tel: p.tel || f.agence_tel || null,
        source_portail: f.source_portail || p.portail || p.agence || 'Agence',
      };
      let { data: b, error } = await supabase.from('biens').insert(aPoser).select('id').single();
      /* `verdict` et `appreciation` sont récents côté `biens` (AnnoncesClient). */
      if (error && /verdict|appreciation/i.test(error.message || '')) {
        delete aPoser.verdict; delete aPoser.appreciation;
        ({ data: b, error } = await supabase.from('biens').insert(aPoser).select('id').single());
      }
      if (error || !b) { signalerEchec('Le bien proposé par l’agence', error?.message || 'aucune ligne créée'); setEnCours(null); return; }
      bienId = (b as { id: string }).id;
      const note = aUneAnalyse(f) ? ` · note ${Math.round(Number(f.score))}/100` : '';
      await addJournal(clientId, 'bien_ajoute', `🏠 Bien ajouté — ${aPoser.titre} (proposé par ${p.agence || 'une agence'}${note})`,
        [url || '', [quiPropose(p), p.tel, p.email].filter(Boolean).join(' · '), p.mot ? `« ${p.mot} »` : '', f.appreciation || ''].filter(Boolean).join('\n'),
        undefined, { rechercheId, bienId });
    }
    const ok = await verifie('Le bien proposé, retenu', supabase.from('propositions_agences').update({
      statut: 'retenu', bien_id: bienId, decide_le: new Date().toISOString(),
    }).eq('id', p.id).select('id'), { ligne: true });
    setEnCours(null);
    await charger(); onChange?.();
    if (ok) {
      annoncer(deja ? 'Ce bien était déjà dans son dossier : rattaché.' : `Retenu : « ${f.titre || 'le bien'} » est dans Sélection.`);
      setMessageGrand(deja ? 'Déjà dans son dossier : rattaché.' : 'Retenu : il passe dans Sélection.');
    }
  }

  async function remettre(p: PropositionAgence) {
    await verifie('La remise du bien proposé', supabase.from('propositions_agences').update({ statut: 'nouveau', decide_le: null }).eq('id', p.id).select('id'), { ligne: true });
    await charger(); onChange?.();
  }

  if (!liste) return null;

  const fiches = liste.map(p => ({ ...(p.fiche || {}), id: p.id, _prop: p }));
  const memes = new Map<string, Rapprochement | null>(liste.map(p => [p.id, rapprocher(repereAgence(p, ''), reperes)]));
  const ligneMeme = (id: string) => {
    const m = memes.get(id);
    return m ? <span className={a.meme}><Icone nom="copie" taille={15} epaisseur={2.1} /><span>{m.phrase}</span></span> : null;
  };
  const idxGrand = grand
    ? (() => { const j = fiches.findIndex(x => x.id === grand.id); return j >= 0 ? j : Math.min(grand.i, fiches.length - 1); })()
    : -1;
  const ouvrir = (id: string) => { setMessageGrand(null); setGrand({ id, i: Math.max(0, fiches.findIndex(x => x.id === id)) }); };
  const allerA = (j: number) => { const x = fiches[j]; if (x) setGrand({ id: x.id, i: j }); };

  const blocAnalyse = (p: PropositionAgence, f: Record<string, any>) => {
    const st = analyses[p.id];
    if (st?.etat === 'encours') {
      return <div className={s.analyse} data-etat="encours" role="status"><span className={s.rond} aria-hidden="true" /><span>{'Analyse par rapport à sa recherche… (une vingtaine de secondes)'}</span></div>;
    }
    if (aUneAnalyse(f)) {
      const n = Math.round(Number(f.score));
      return (
        <div className={s.avis}>
          <div className={s.avisLigne}>
            <button type="button" className={s.noteA} style={{ ['--c' as string]: couleurNote(n) }} onClick={() => ouvrir(p.id)}
              title="Voir l’analyse en grand" aria-label={`Note ${n} sur 100 : voir l’analyse en grand`}>
              <b>{n}</b><small>/100</small>
            </button>
            <div className={s.avisTexte}><Appreciation p={f} /></div>
          </div>
          <BilanBien p={f} />
        </div>
      );
    }
    if (st?.etat === 'erreur') {
      return (
        <div className={s.analyse} data-etat="erreur">
          <Icone nom="alerte" taille={15} epaisseur={2.1} />
          <span>{`L’analyse n’a pas pu se faire : ${st.erreur}`}</span>
          <button type="button" className={s.relancer} onClick={() => { void analyser(p); }}>Relancer</button>
        </div>
      );
    }
    /* Le serveur l'analyse juste après l'envoi : quelques minutes sans note, c'est qu'elle n'est pas passée. */
    const recent = Date.now() - new Date(p.created_at).getTime() < 2 * 60_000;
    if (recent && (p.lecture === 'ok' || p.lecture === 'partielle')) {
      return <div className={s.analyse} data-etat="encours" role="status"><span className={s.rond} aria-hidden="true" /><span>{'Analyse en cours sur le serveur… rouvre l’onglet dans un instant.'}</span></div>;
    }
    return (
      <button type="button" className={s.analyser} onClick={() => { void analyser(p); }}>
        <Icone nom="loupe" taille={15} epaisseur={2.1} />{'Analyser par rapport à sa recherche'}
      </button>
    );
  };

  return (
    <section className={s.bloc} aria-label="Biens proposés par des agences">
      <div className={s.tete}>
        <span className={a.teteIcV}><Icone nom="immeuble" taille={17} epaisseur={2} /></span>
        <b className={s.titre}>Proposés par des agences</b>
        {liste.length > 0 && <span className={a.nbV}>{liste.length}</span>}
        {ecartees.length > 0 && (
          <button type="button" className={s.lienEc} onClick={() => setVoirEcartees(v => !v)} aria-expanded={voirEcartees}>
            {voirEcartees ? 'Masquer les écartés' : `${ecartees.length} écarté${ecartees.length > 1 ? 's' : ''}`}
          </button>
        )}
        <button type="button" className={a.lienBtn} style={ecartees.length ? undefined : { marginLeft: 'auto' }} onClick={() => setFenetreLien(true)}>
          <Icone nom="lien" taille={15} epaisseur={2.2} />Lien pour les agences
        </button>
      </div>
      {absent ? (
        <div className={a.barre}><span className={a.absent}>{'À activer : un petit SQL à passer dans Supabase, outils/sql/lien-agences.sql.'}</span></div>
      ) : liste.length === 0 ? (
        <div className={a.barre}>
          <span className={a.barreTx}>{'Quand une agence te dit d’aller voir sur son site, envoie-lui ce lien : elle y colle son annonce, et le bien arrive ici, lu et analysé.'}</span>
        </div>
      ) : null}
      {dit && <div className={s.dit} role="status">{dit}</div>}

      {liste.map(p => {
        const f: Record<string, any> = p.fiche && typeof p.fiche === 'object' ? p.fiche : {};
        const vues: string[] = Array.isArray(f.photos) && f.photos.length ? f.photos.filter(Boolean) : (p.photos || []).filter(Boolean);
        const prixF = Number(f.prix_acquereur || f.prix_vendeur || p.prix) || null;
        const puces = [
          f.surface || p.surface ? `${f.surface || p.surface} m²` : null, f.nb_pieces ? `${f.nb_pieces} p.` : null,
          f.nb_chambres ? `${f.nb_chambres} ch.` : null,
          f.etage != null && f.etage !== '' ? (Number(f.etage) === 0 ? 'RDC' : Number(f.etage) === 1 ? '1er étage' : `${f.etage}e étage`) : null,
          f.dpe ? `DPE ${f.dpe}` : null,
        ].filter((x): x is string => !!x);
        const site = siteDe(p.url);
        const prenom = String(p.interlocuteur || '').trim().split(/\s+/)[0] || '';
        const analyseEnCours = analyses[p.id]?.etat === 'encours';
        return (
          <div key={p.id} className={s.carte} style={{ borderLeftColor: '#7c3aed' }} data-attente={enCours === p.id ? 'oui' : undefined}>
            <div className={s.haut}>
              <span className={s.photo} data-vide={vues[0] ? undefined : 'oui'}>
                {vues[0] ? <img src={vues[0]} alt="" loading="lazy" /> : <span className={s.sans}><Icone nom="immeuble" taille={22} /></span>}
                {vues.length > 1 && <span className={s.nbPh}><Icone nom="photos" taille={11} epaisseur={2.2} />{vues.length}</span>}
              </span>
              <div className={s.texte}>
                <span className={s.ligne1}>
                  <b>{f.titre || 'Bien proposé'}</b>
                  {p.lecture === 'echec' && <span className={s.etiq} data-ton="photo">Annonce non lue</span>}
                  {p.lecture === 'sans_lien' && <span className={s.etiq} data-ton="photo">Sans lien</span>}
                  <span className={s.quand}>{quandPropose(p.created_at)}</span>
                </span>
                <span className={s.fiche}>
                  {(f.quartier || f.ville || p.adresse) && <span className={s.lieu}><Icone nom="lieu" taille={13} />{[f.quartier, f.ville].filter(Boolean).join(', ') || p.adresse}</span>}
                  {prixF && <b className={s.prixF}>{`${prixF.toLocaleString('fr-FR')} €`}</b>}
                  {puces.length > 0 && <span className={s.puces}>{puces.map(x => <span key={x} className={s.puce}>{x}</span>)}</span>}
                </span>
                <span className={a.qui}>
                  <Icone nom="immeuble" taille={14} epaisseur={2.1} />
                  <span>{quiPropose(p)}</span>
                  {p.tel && <a href={`tel:${p.tel.replace(/[^\d+]/g, '')}`}>{p.tel}</a>}
                  {p.email && <a href={`mailto:${p.email}`}>{p.email}</a>}
                </span>
                {ligneMeme(p.id)}
                {p.mot && <span className={a.motA}><i>Son mot</i><span>{`« ${p.mot} »`}</span></span>}
                {(p.lecture === 'echec' || p.lecture === 'sans_lien') && (
                  <span className={a.nonLue}>{p.lecture === 'echec'
                    ? `${site?.nom || 'Le site'} n’a pas laissé lire l’annonce : ouvre-la pour voir le détail. Retenu, le bien part avec ce que l’agence a écrit.`
                    : 'Pas d’annonce en ligne : ses photos et ce qu’elle a écrit.'}</span>
                )}
                {(p.lecture === 'ok' || p.lecture === 'partielle') && blocAnalyse(p, f)}
                {p.url && <a className={s.url} href={p.url} target="_blank" rel="noopener noreferrer" title={p.url}>{lienCourt(p.url)}</a>}
              </div>
            </div>
            <div className={s.pied}>
              {p.url && <a className={s.bouton} href={p.url} target="_blank" rel="noopener noreferrer"><Icone nom="lien" taille={15} epaisseur={2} />Ouvrir l’annonce</a>}
              <button type="button" className={s.bouton} onClick={() => ouvrir(p.id)}><Icone nom="agrandir" taille={15} epaisseur={2} />Voir en grand</button>
              {p.tel && <a className={s.bouton} href={`tel:${p.tel.replace(/[^\d+]/g, '')}`}><Icone nom="tel" taille={15} epaisseur={2} />{prenom ? `Appeler ${prenom}` : 'Appeler'}</a>}
              <span className={s.ressort} />
              <button type="button" className={s.bouton} data-ton="rouge" onClick={() => { void ecarter(p); }} disabled={!!enCours}>Écarter</button>
              <button type="button" className={s.bouton} data-ton="or" onClick={() => { void retenir(p); }} disabled={!!enCours || analyseEnCours}
                title={analyseEnCours ? 'L’analyse est en cours : elle suivra le bien.' : undefined}>
                <Icone nom="coche" taille={15} epaisseur={2.2} />Retenir
              </button>
            </div>
          </div>
        );
      })}

      {voirEcartees && ecartees.map(p => (
        <div key={p.id} className={s.ecartee}>
          <span className={s.ecTitre}>{p.fiche?.titre || 'Bien proposé'}</span>
          <span className={s.ecRep}>{`${quiPropose(p)} · ${quandPropose(p.created_at)}`}</span>
          {p.url && <a className={s.ecLien} href={p.url} target="_blank" rel="noopener noreferrer">Voir</a>}
          <button type="button" className={s.ecLien} onClick={() => { void remettre(p); }}>Remettre</button>
        </div>
      ))}

      {grand && idxGrand >= 0 && fiches[idxGrand] && (
        <FenetreBien biens={fiches} index={idxGrand} onIndex={allerA} onFermer={() => { setGrand(null); setMessageGrand(null); }}
          recherche={recherche} message={messageGrand}
          prix={b => {
            const pr = Number(b.prix_acquereur || b.prix_vendeur) || null;
            return { montant: pr, dessous: pr && b.surface ? <span>{`${Math.round(pr / Number(b.surface)).toLocaleString('fr-FR')} €/m²`}</span> : null };
          }}
          bandeau={b => {
            const p = b._prop as PropositionAgence;
            return (
              <div className={a.motA} style={{ marginTop: 0 }}>
                <i>{`Proposé par ${quiPropose(p)} · ${quandPropose(p.created_at)}`}</i>
                {p.mot ? <span>{`« ${p.mot} »`}</span> : <span className={s.vide}>Pas de mot.</span>}
                {(p.tel || p.email) && <small>{[p.tel, p.email].filter(Boolean).join(' · ')}</small>}
                {ligneMeme(p.id)}
              </div>
            );
          }}
          pied={b => {
            const p = b._prop as PropositionAgence;
            return (
              <>
                <InfoPied>{`${b.type_bien || 'Bien'}${b.code_postal ? ` · ${b.code_postal}` : ''} · proposé par ${p.agence || 'une agence'}`}</InfoPied>
                <Ressort />
                <BoutonPied ton="rouge" onClick={() => { void ecarter(p); }} disabled={!!enCours}>Écarter</BoutonPied>
                <BoutonPied ton="or" onClick={() => { void retenir(p); }} disabled={!!enCours || analyses[p.id]?.etat === 'encours'}>Retenir</BoutonPied>
              </>
            );
          }} />
      )}

      {fenetreLien && (
        <FenetreLien clientId={clientId} rechercheId={rechercheId} prenom={prenom} recherche={recherche} stats={stats} absent={absent}
          onFermer={() => setFenetreLien(false)} />
      )}
    </section>
  );
}

/* ═══ La fenêtre « Le lien pour les agences » ═════════════════════════════
   V3.198 (maquette 6) : les agences de ce client, déjà connues du CRM, avec
   leur numéro ou leur mail ; un appui sur SMS ou Mail ouvre le message
   rempli, et l'envoi est noté (« Envoyé aujourd'hui · SMS »). Une agence
   pas encore connue s'ajoute en bas, une fois. src/lib/lien-agences-envois.ts */

const AGENCES_VUES = 6;
const pad2 = (n: number) => String(n).padStart(2, '0');
function quandCourt(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const j = Math.round((new Date(new Date().toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (j === 0) return `aujourd’hui à ${d.getHours()} h ${pad2(d.getMinutes())}`;
  if (j === 1) return 'hier';
  return `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}
const canalCourt = (c: Canal) => (c === 'sms' ? 'SMS' : c === 'mail' ? 'mail' : 'copié');

function FenetreLien({ clientId, rechercheId, prenom, recherche, stats, absent, onFermer }: {
  clientId: string; rechercheId: string; prenom?: string | null; recherche?: any;
  stats: { biens: number; agences: number }; absent: boolean; onFermer: () => void;
}) {
  const [jeton, setJeton] = useState<string | null | undefined>(undefined);
  const [manque, setManque] = useState(absent);
  const [message, setMessage] = useState('');
  const [dit, setDit] = useState<string | null>(null);
  const [coupe, setCoupe] = useState(false);
  const [travail, setTravail] = useState(false);
  const [agences, setAgences] = useState<AgenceConnue[] | null>(null);
  const [tout, setTout] = useState(false);
  const [autre, setAutre] = useState({ nom: '', interlocuteur: '', contact: '' });
  const [erreurAutre, setErreurAutre] = useState<string | null>(null);
  /* Le joli mail : en cours (la clé de l'agence), ou parti en erreur (la messagerie à la place). */
  const [envoiMail, setEnvoiMail] = useState<string | null>(null);
  const [secours, setSecours] = useState<{ dest: Destinataire; erreur: string } | null>(null);
  const champContact = useRef<HTMLInputElement>(null);
  const minuteurDit = useRef<number | undefined>(undefined);
  const pour = String(prenom || '').trim();

  const dire = (m: string) => {
    setDit(m);
    window.clearTimeout(minuteurDit.current);
    minuteurDit.current = window.setTimeout(() => setDit(null), 3000);
  };
  useEffect(() => () => window.clearTimeout(minuteurDit.current), []);

  const recevoir = useCallback((r: Jeton) => {
    if ('jeton' in r) { setJeton(r.jeton); setMessage(messageAgence(r.jeton)); setCoupe(false); return; }
    setJeton(null);
    if ('absent' in r) setManque(true); else signalerEchec('Le lien pour les agences', r.erreur);
  }, []);
  const creer = useCallback(async () => {
    setTravail(true);
    recevoir(await creerJeton(rechercheId));
    setTravail(false);
  }, [rechercheId, recevoir]);

  useEffect(() => {
    let vivant = true;
    (async () => { const r = await lireOuCreerJeton(rechercheId); if (vivant) recevoir(r); })();
    return () => { vivant = false; };
  }, [rechercheId, recevoir]);

  const chargerAgences = useCallback(async () => { setAgences(await agencesDuClient(rechercheId)); }, [rechercheId]);
  useEffect(() => { void chargerAgences(); }, [chargerAgences]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFermer]);

  async function copier(t: string, quoi: string) {
    try { await navigator.clipboard.writeText(t); dire(`${quoi} copié.`); return true; } catch { dire('La copie n’a pas marché : sélectionne le texte et copie-le.'); return false; }
  }
  async function couper() {
    if (!window.confirm('Couper ce lien ? Les agences qui l’ont ne pourront plus rien envoyer pour ce client. Tu pourras en créer un nouveau.')) return;
    setTravail(true);
    const ok = await verifie('La coupure du lien', supabase.from('recherches').update({ token_agences: null }).eq('id', rechercheId).select('id'), { ligne: true });
    setTravail(false);
    if (ok) { setJeton(null); setCoupe(true); }
  }

  /* L'envoi : le lien (sms:, mailto:) s'ouvre tout seul ; ici, on le note. */
  async function noter(dest: Destinataire, canal: Canal) {
    const ok = await noterEnvoi({ clientId, rechercheId, prenom, dest, canal });
    if (ok) dire(canal === 'copie' ? `Message copié pour ${dest.interlocuteur || dest.nom} : c’est noté.` : `Envoi à ${dest.interlocuteur || dest.nom} noté.`);
    await chargerAgences();
  }
  /* Le joli mail, envoyé par le CRM (après un « oui ») ; s'il ne part pas,
     la messagerie d'Alexandre reste possible, avec le message simple. */
  async function mailer(dest: Destinataire, cle: string): Promise<boolean> {
    if (!dest.email || envoiMail) return false;
    if (!window.confirm(`Envoyer le mail du lien à ${dest.interlocuteur ? `${dest.interlocuteur} (${dest.email})` : dest.email} ?`)) return false;
    setSecours(null); setEnvoiMail(cle);
    const r = await envoyerMailAgence(rechercheId, dest);
    setEnvoiMail(null);
    if (!r.ok) { setSecours({ dest, erreur: r.erreur }); return false; }
    await noterEnvoi({ clientId, rechercheId, prenom, dest, canal: 'mail' });
    dire(`Mail envoyé à ${dest.interlocuteur || dest.nom}.`);
    await chargerAgences();
    return true;
  }
  async function copierPour(dest: Destinataire) {
    if (await copier(messagePour(message, dest.interlocuteur), 'Message')) await noter(dest, 'copie');
  }
  function completer(g: AgenceConnue) {
    setAutre({ nom: g.nom, interlocuteur: g.interlocuteur || '', contact: '' });
    setErreurAutre(null);
    window.setTimeout(() => champContact.current?.focus(), 0);
  }

  const resume = recherche ? resumePourAgence(recherche) : null;
  const voit = resume ? [...resume.puces, resume.budget?.toLowerCase(), ...resume.important.map(x => x.charAt(0).toLowerCase() + x.slice(1))].filter(Boolean).join(' · ') : '';
  const lien = jeton ? lienAgences(jeton) : '';
  const liste = agences || [];
  const vues = tout ? liste : liste.slice(0, AGENCES_VUES);
  const envoyees = liste.filter(g => g.envois.some(e => e.canal !== 'copie')).length;

  /* « + Une autre agence » : un portable donne le SMS, une adresse le mail. */
  const c = autre.contact.trim();
  const autreDest: Destinataire = { nom: autre.nom.trim(), interlocuteur: autre.interlocuteur.trim() || null, tel: mailValide(c) ? null : c || null, email: mailValide(c) ? c : null };
  const autreCanal: Canal | null = mailValide(c) ? 'mail' : estMobile(c) ? 'sms' : null;
  const autreHref = autreCanal === 'sms' ? lienSms(c, messagePour(message, autreDest.interlocuteur)) : undefined;

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className={a.voile} onClick={e => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className={a.fenetre} role="dialog" aria-modal="true" aria-label="Le lien pour les agences">
        <div className={a.fTete}>
          <span className={a.fIc} aria-hidden="true"><Icone nom="lien" taille={19} epaisseur={2} /></span>
          <div style={{ minWidth: 0 }}>
            <h2>Le lien pour les agences</h2>
            <p>{pour ? `Recherche de ${pour} · le même lien pour toutes les agences` : 'Le même lien pour toutes les agences qui travaillent pour ce client'}</p>
          </div>
          <button type="button" className={a.fFermer} onClick={onFermer} aria-label="Fermer"><Icone nom="fermer" taille={16} epaisseur={2.4} /></button>
        </div>
        <div className={a.fCorps}>
          {manque ? (
            <div className={a.coupe}>{'À activer d’abord : un petit SQL à passer dans Supabase (SQL Editor), outils/sql/lien-agences.sql.'}</div>
          ) : coupe ? (
            <div className={a.coupe}>
              <span>{'Lien coupé : les agences qui l’avaient tombent sur « Cette recherche n’est plus ouverte ».'}</span>
              <button type="button" className={a.btnFort} onClick={() => { void creer(); }} disabled={travail}>Créer un nouveau lien</button>
            </div>
          ) : !jeton ? (
            <div className={a.aide}>{travail ? 'Création du lien…' : 'Lecture du lien…'}</div>
          ) : (
            <>
              <div className={a.ligneLien}>
                <span className={a.lienTxt} title={lien}>{lien.replace(/^https:\/\//, '')}</span>
                <button type="button" className={a.btnFort} onClick={() => { void copier(lien, 'Lien'); }}>Copier le lien</button>
              </div>
              {dit && <div className={a.dit} role="status">{dit}</div>}

              <div className={a.agences}>
                <span className={a.lib}>{`Les agences de ${pour || 'ce client'}${liste.length ? ` · ${liste.length}` : ''}`}</span>
                {agences === null ? (
                  <span className={a.aide}>{'Recherche des agences de ses biens…'}</span>
                ) : liste.length === 0 ? (
                  <span className={a.aide}>{'Aucune agence notée pour l’instant dans ses biens ni dans tes suivis : ajoute-la juste en dessous.'}</span>
                ) : vues.map(g => {
                  const dernier = g.envois[0];
                  const dest: Destinataire = { nom: g.nom, interlocuteur: g.interlocuteur, tel: g.tel, email: g.email };
                  const msg = messagePour(message, g.interlocuteur);
                  const mobile = !!g.tel && estMobile(g.tel);
                  const coord = [g.tel, g.email].filter(Boolean).join(' · ');
                  const envoye = dernier ? `${dernier.canal === 'copie' ? 'copié' : 'envoyé'} ${quandCourt(dernier.le)}${dernier.canal === 'copie' ? '' : ` par ${canalCourt(dernier.canal)}`}${g.envois.length > 1 ? ` (${g.envois.length} fois)` : ''}` : '';
                  return (
                    <div key={g.cle} className={a.agence}>
                      <span className={a.agTx}>
                        <b>{g.interlocuteur ? `${g.nom} · ${g.interlocuteur}` : g.nom}</b>
                        <small>{[coord || 'Pas de numéro ni de mail noté', g.proposes && envoye ? envoye : ''].filter(Boolean).join(' · ')}</small>
                      </span>
                      {g.proposes > 0
                        ? <span className={a.puceEtat} data-ton="prune">{`A proposé ${g.proposes} bien${g.proposes > 1 ? 's' : ''}`}</span>
                        : dernier
                          ? <span className={a.puceEtat} data-ton="vert">{envoye.charAt(0).toUpperCase() + envoye.slice(1)}</span>
                          : <span className={a.puceEtat}>Pas encore envoyé</span>}
                      <span className={a.agBtns}>
                        {mobile && <a className={a.btnMini} href={lienSms(g.tel!, msg)} onClick={() => { void noter(dest, 'sms'); }}><Icone nom="mobile" taille={14} epaisseur={2.1} />SMS</a>}
                        {g.email && <button type="button" className={a.btnMini} disabled={!!envoiMail} onClick={() => { void mailer(dest, g.cle); }}><Icone nom="mail" taille={14} epaisseur={2.1} />{envoiMail === g.cle ? 'Envoi…' : 'Mail'}</button>}
                        {!mobile && !g.email && g.tel && <button type="button" className={a.btnMini} onClick={() => { void copierPour(dest); }} title="Un fixe ne reçoit pas de SMS : copie le message pour l’envoyer autrement"><Icone nom="copie" taille={14} epaisseur={2.1} />Copier</button>}
                        {!g.tel && !g.email && <button type="button" className={a.btnMini} data-ton="doux" onClick={() => completer(g)}><Icone nom="plus" taille={14} epaisseur={2.1} />Son numéro</button>}
                      </span>
                    </div>
                  );
                })}
                {secours && (
                  <div className={a.secours} role="alert">
                    <span>{`Le mail à ${secours.dest.email} n’est pas parti : ${secours.erreur}`}</span>
                    <a className={a.btn} href={lienMail(secours.dest.email || '', messagePour(message, secours.dest.interlocuteur))}
                      onClick={() => { const d = secours.dest; setSecours(null); void noter(d, 'mail'); }}><Icone nom="mail" taille={14} epaisseur={2.1} />Ouvrir ma messagerie à la place</a>
                  </div>
                )}
                {liste.length > AGENCES_VUES && (
                  <button type="button" className={a.plus} onClick={() => setTout(t => !t)} aria-expanded={tout}>
                    {tout ? 'Moins d’agences' : liste.length - AGENCES_VUES === 1 ? 'Voir l’autre agence' : `Voir les ${liste.length - AGENCES_VUES} autres agences`}
                  </button>
                )}
              </div>

              <div className={a.autre}>
                <span className={a.autreT}><Icone nom="plus" taille={14} epaisseur={2.4} />Une autre agence</span>
                <div className={a.autreGrille}>
                  <label className={a.champ}><span>Agence</span>
                    <input value={autre.nom} onChange={e => { setAutre(x => ({ ...x, nom: e.target.value })); setErreurAutre(null); }} placeholder="Orpi Vanves" maxLength={120} autoComplete="off" /></label>
                  <label className={a.champ}><span>{'Nom '}<i>(facultatif)</i></span>
                    <input value={autre.interlocuteur} onChange={e => setAutre(x => ({ ...x, interlocuteur: e.target.value }))} placeholder="Marc Lenoir" maxLength={120} autoComplete="off" /></label>
                  <label className={a.champ}><span>Portable ou mail</span>
                    <input ref={champContact} value={autre.contact} onChange={e => { setAutre(x => ({ ...x, contact: e.target.value })); setErreurAutre(null); }} placeholder="06 12 34 56 78" maxLength={160} autoComplete="off" inputMode="email" /></label>
                </div>
                <div className={a.autrePied}>
                  <span className={a.aide}>{erreurAutre || (c && !autreCanal ? 'Un portable (06, 07) pour un SMS, ou une adresse mail.' : autreCanal === 'mail' ? 'Le mail part mis en page, de ta part ; l’agence rejoint la liste.' : 'Le SMS s’ouvre rempli ; l’agence rejoint la liste.')}</span>
                  {autreCanal === 'mail' ? (
                    <button type="button" className={a.btnFort} disabled={!!envoiMail}
                      onClick={() => {
                        if (!autreDest.nom) { setErreurAutre('Le nom de l’agence d’abord.'); return; }
                        void mailer(autreDest, 'autre').then(ok => { if (ok) setAutre({ nom: '', interlocuteur: '', contact: '' }); });
                      }}>
                      <Icone nom="mail" taille={15} epaisseur={2.1} />{envoiMail === 'autre' ? 'Envoi…' : 'Envoyer le mail'}
                    </button>
                  ) : autreHref ? (
                    <a className={a.btnFort} href={autreHref}
                      onClick={e => {
                        if (!autreDest.nom) { e.preventDefault(); setErreurAutre('Le nom de l’agence d’abord.'); return; }
                        void noter(autreDest, 'sms').then(() => setAutre({ nom: '', interlocuteur: '', contact: '' }));
                      }}>
                      <Icone nom="mobile" taille={15} epaisseur={2.1} />Envoyer par SMS
                    </a>
                  ) : (
                    <button type="button" className={a.btnFort} disabled>Envoyer</button>
                  )}
                </div>
              </div>

              <details className={a.details}>
                <summary>Voir ou modifier le message</summary>
                <label className={a.cache} htmlFor="msg-agence">Le message envoyé aux agences</label>
                <textarea id="msg-agence" className={a.zone} rows={6} value={message} onChange={e => setMessage(e.target.value)} />
                <span className={a.aide}>{'Ce message part par SMS (ou se copie). « Bonjour, » prend le prénom de la personne quand il est connu ; le lien est cliquable. Le mail, lui, part mis en page aux couleurs d’Emilio, avec ce que cherche le client et un bouton « Proposer un bien ».'}</span>
                <div className={a.boutons}>
                  <button type="button" className={a.btn} onClick={() => { void copier(message, 'Message'); }}><Icone nom="copie" taille={14} epaisseur={2.1} />Copier le message</button>
                </div>
              </details>

              {voit && (
                <div className={a.voit}>
                  <span className={a.lib}>{'Ce que l’agence voit'}</span>
                  <span className={a.voitTx}>{voit}</span>
                  <span className={a.aide}>{'Jamais son nom, ni ses précisions, ni ses biens déjà vus.'}</span>
                </div>
              )}
              <div className={a.bas}>
                <span className={a.stats}>{[
                  envoyees ? `Envoyé à ${envoyees} agence${envoyees > 1 ? 's' : ''}` : 'Pas encore envoyé',
                  stats.biens ? (() => { const n = stats.agences || 1; return `${n} agence${n > 1 ? 's ont' : ' a'} proposé ${stats.biens} bien${stats.biens > 1 ? 's' : ''}`; })() : '',
                ].filter(Boolean).join(' · ')}</span>
                <button type="button" className={a.couper} onClick={() => { void couper(); }} disabled={travail}>Couper ce lien</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
