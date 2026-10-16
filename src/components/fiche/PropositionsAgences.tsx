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
  ORIGINES, agencesDuClient, canalLong, creerJeton, envoyerMailAgence, estMobile, lienMail, lienSms, lireOuCreerJeton, mailValide, messagePourAgence, noterContact, noterEnvoi, quandEnvoi,
  type AgenceConnue, type Canal, type Destinataire, type Jeton,
} from '@/lib/lien-agences-envois';
import { mailLienAgence } from '@/lib/mail-agence';
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
 *
 * V3.202 — Le PDF (maquette 14) : sa première page en image, « PDF · 4 p. »,
 * « Ouvrir le PDF » (un lien de quelques minutes, api/lien-agences/pdf) ;
 * « Lecture du PDF… » le temps que le serveur le lise, « Lire le PDF » s'il
 * n'y est pas arrivé. « Après ton mail du 14 oct. » : la proposition est
 * venue par le lien qu'Alexandre a envoyé à cette personne (le code).
 * Dans la fenêtre du lien, chaque envoi à une personne précise porte son
 * code ; « Copier le lien » reste le lien simple.
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

/* V3.202 */
const lienPdf = (id: string) => `/api/lien-agences/pdf?id=${encodeURIComponent(id)}`;
const taillePdf = (o: number) => (o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`);
/** « Après ton mail du 14 oct. » */
function phraseEnvoi(e: PropositionAgence['envoi']): string | null {
  if (!e?.le) return null;
  const d = new Date(e.le);
  if (isNaN(d.getTime())) return null;
  const quoi = e.canal === 'sms' ? 'ton SMS' : e.canal === 'mail' ? 'ton mail' : 'ton message';
  return `Après ${quoi} du ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}
async function relirePdf(id: string): Promise<{ ok: true; lecture: string } | { ok: false; erreur: string }> {
  try {
    const r = await fetch('/api/lien-agences/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    const d = await r.json().catch(() => null) as { ok?: boolean; lecture?: string; erreur?: string } | null;
    if (!r.ok || !d?.ok) return { ok: false, erreur: d?.erreur || `le serveur a répondu ${r.status}` };
    return { ok: true, lecture: d.lecture || '' };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message || 'pas de réponse' };
  }
}

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
  const [lectures, setLectures] = useState<Record<string, EtatAnalyse>>({});
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

  /* V3.202 — Le PDF que le serveur n'a pas lu (ou mal) : le relire, puis l'analyser. */
  async function lirePdf(p: PropositionAgence) {
    setLectures(m => ({ ...m, [p.id]: { etat: 'encours' } }));
    const r = await relirePdf(p.id);
    if (!r.ok) { setLectures(m => ({ ...m, [p.id]: { etat: 'erreur', erreur: r.erreur } })); return; }
    setLectures(m => { const x = { ...m }; delete x[p.id]; return x; });
    const { data } = await supabase.from('propositions_agences').select('*').eq('id', p.id).maybeSingle();
    await charger();
    const np = data as PropositionAgence | null;
    if (np && (np.lecture === 'ok' || np.lecture === 'partielle') && !aUneAnalyse(np.fiche || {})) await analyser(np);
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
        const pdf = p.pdf?.chemin ? p.pdf : null;
        const vig = vues[0] || pdf?.apercu || null;
        const viaEnvoi = phraseEnvoi(p.envoi);
        const recentP = Date.now() - new Date(p.created_at).getTime() < 2 * 60_000;
        const lec = lectures[p.id];
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
              <span className={`${s.photo}${!vues[0] && pdf?.apercu ? ` ${a.photoPdf}` : ''}`} data-vide={vig ? undefined : 'oui'}>
                {vig ? <img src={vig} alt="" loading="lazy" /> : <span className={s.sans}><Icone nom="immeuble" taille={22} /></span>}
                {vues.length > 1 && <span className={s.nbPh}><Icone nom="photos" taille={11} epaisseur={2.2} />{vues.length}</span>}
                {pdf && !vues[0] && <span className={a.badgePdf}>{pdf.pages ? `PDF · ${pdf.pages} p.` : 'PDF'}</span>}
              </span>
              <div className={s.texte}>
                <span className={s.ligne1}>
                  <b>{f.titre || 'Bien proposé'}</b>
                  {p.lecture === 'echec' && <span className={s.etiq} data-ton="photo">Annonce non lue</span>}
                  {p.lecture === 'sans_lien' && <span className={s.etiq} data-ton="photo">Sans lien</span>}
                  {pdf && !p.url && (p.lecture === 'ok' || p.lecture === 'partielle') && <span className={s.etiq} data-ton="deux">Lu dans le PDF</span>}
                  {p.lecture === 'pdf' && <span className={s.etiq} data-ton="photo">{recentP ? 'PDF en lecture' : 'PDF à lire'}</span>}
                  {p.lecture === 'pdf_illisible' && <span className={s.etiq} data-ton="photo">PDF non lu</span>}
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
                  {viaEnvoi && <small className={a.via}>{viaEnvoi}</small>}
                </span>
                {ligneMeme(p.id)}
                {p.mot && <span className={a.motA}><i>Son mot</i><span>{`« ${p.mot} »`}</span></span>}
                {(p.lecture === 'echec' || p.lecture === 'sans_lien') && (
                  <span className={a.nonLue}>{p.lecture === 'echec'
                    ? `${site?.nom || 'Le site'} n’a pas laissé lire l’annonce : ouvre-la pour voir le détail. Retenu, le bien part avec ce que l’agence a écrit.`
                    : 'Pas d’annonce en ligne : ses photos et ce qu’elle a écrit.'}</span>
                )}
                {(p.lecture === 'pdf' || p.lecture === 'pdf_illisible') && (
                  lec?.etat === 'encours' || (p.lecture === 'pdf' && recentP && !lec) ? (
                    <div className={s.analyse} data-etat="encours" role="status"><span className={s.rond} aria-hidden="true" />
                      <span>{lec ? 'Lecture du PDF… (une vingtaine de secondes)' : 'Lecture du PDF en cours sur le serveur… rouvre l’onglet dans un instant.'}</span></div>
                  ) : (
                    <div className={s.analyse} data-etat={lec?.etat === 'erreur' || p.lecture === 'pdf_illisible' ? 'erreur' : undefined}>
                      <Icone nom={p.lecture === 'pdf_illisible' ? 'alerte' : 'doc'} taille={15} epaisseur={2.1} />
                      <span>{lec?.etat === 'erreur' ? `La lecture du PDF n’a pas marché : ${lec.erreur}`
                        : p.lecture === 'pdf_illisible' ? 'Le PDF n’a pas pu être lu automatiquement : ouvre-le. Retenu, le bien part avec ce que l’agence a écrit.'
                          : 'Le PDF n’a pas encore été lu.'}</span>
                      <button type="button" className={s.relancer} onClick={() => { void lirePdf(p); }}>{p.lecture === 'pdf_illisible' ? 'Relire le PDF' : 'Lire le PDF'}</button>
                    </div>
                  )
                )}
                {(p.lecture === 'ok' || p.lecture === 'partielle') && blocAnalyse(p, f)}
                {pdf && (
                  <a className={a.lignePdf} href={lienPdf(p.id)} target="_blank" rel="noopener noreferrer">
                    <Icone nom="doc" taille={15} epaisseur={2.1} /><b>{pdf.nom}</b>
                    <span>{[pdf.pages ? `${pdf.pages} page${pdf.pages > 1 ? 's' : ''}` : null, taillePdf(pdf.taille)].filter(Boolean).join(' · ')}</span>
                  </a>
                )}
                {p.url && <a className={s.url} href={p.url} target="_blank" rel="noopener noreferrer" title={p.url}>{lienCourt(p.url)}</a>}
              </div>
            </div>
            <div className={s.pied}>
              {p.url && <a className={s.bouton} href={p.url} target="_blank" rel="noopener noreferrer"><Icone nom="lien" taille={15} epaisseur={2} />Ouvrir l’annonce</a>}
              {p.pdf?.chemin && <a className={s.bouton} href={lienPdf(p.id)} target="_blank" rel="noopener noreferrer"><Icone nom="doc" taille={15} epaisseur={2} />Ouvrir le PDF</a>}
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
          {p.url ? <a className={s.ecLien} href={p.url} target="_blank" rel="noopener noreferrer">Voir</a>
            : p.pdf?.chemin ? <a className={s.ecLien} href={lienPdf(p.id)} target="_blank" rel="noopener noreferrer">Le PDF</a> : null}
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
                {p.pdf?.chemin && <a className={a.lignePdf} href={lienPdf(p.id)} target="_blank" rel="noopener noreferrer"><Icone nom="doc" taille={15} epaisseur={2.1} /><b>{p.pdf.nom}</b><span>Ouvrir le PDF</span></a>}
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
   V3.200 (maquettes 9 et 10, validées le 15 octobre) — Alexandre : « que ce
   soit plus joli, que je comprenne à qui ça a été envoyé, une fonction
   dépliée ». Une fenêtre large : à gauche le lien, ce que l'agence voit,
   le mail et le SMS ; à droite SES agences, en trois parties qui se
   déplient : « À contacter » (ouverte), « Déjà contactées », « Ont proposé
   des biens ». Un appui : le mail part du CRM, le SMS s'ouvre sur le
   téléphone ; l'envoi est noté (src/lib/lien-agences-envois.ts). */

const PAR_PARTIE = 5;
/* « le 13 oct. à 14 h 20 » et « par mail » : quandEnvoi et canalLong, src/lib/lien-agences-envois.ts (V3.204). */
const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'l', 'd', 'agence', 'immobilier', 'immobiliere', 'immo']);
function initiales(nom: string) {
  const mots = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const utiles = mots.filter(m => !MOTS_VIDES.has(m.toLowerCase()));
  const l = (utiles.length ? utiles : mots).slice(0, 2).map(m => m[0].toUpperCase());
  return l.join('') || '?';
}
const TEINTES: [string, string][] = [['#E8EFF8', '#22497D'], ['#FDF2F8', '#9D174D'], ['#ECFDF5', '#047857'], ['#FFF7ED', '#9A3412'], ['#F5F3FF', '#5B21B6'], ['#F0F9FF', '#075985']];
function teinte(nom: string): [string, string] {
  let h = 0;
  for (const c of nom.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TEINTES[h % TEINTES.length];
}

type Partie = 'contacter' | 'contactees' | 'proposees';

/* V3.201 — Le contact d'une agence, rempli sur place : la personne qui gère le
   dossier, son portable, son mail (chacun sur sa ligne, un mail est long).
   Sans `nomFixe`, le nom de l'agence se tape aussi (« Une autre agence »).
   Au moins un portable ou un mail ; un fixe s'enregistre, sans SMS. */
type ActionsContact = {
  envoiMail: string | null; cle: string;
  /** V3.202 : le message pour CETTE personne (son prénom, le lien avec son code) */
  pour: (d: Destinataire) => string;
  onMail: (d: Destinataire) => Promise<boolean>; onSms: (d: Destinataire) => Promise<void>; onEnregistrer: (d: Destinataire) => Promise<boolean>;
};
function FormContact({ nomFixe, initial, actions, onFini, onAnnuler }: {
  nomFixe?: string; initial?: { interlocuteur?: string | null; tel?: string | null; email?: string | null };
  actions: ActionsContact; onFini: () => void; onAnnuler: () => void;
}) {
  const [nom, setNom] = useState(nomFixe || '');
  const [personne, setPersonne] = useState(initial?.interlocuteur || '');
  const [tel, setTel] = useState(initial?.tel || '');
  const [mail, setMail] = useState(initial?.email || '');
  const [erreur, setErreur] = useState<string | null>(null);
  const premier = useRef<HTMLInputElement>(null);
  useEffect(() => { premier.current?.focus(); premier.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, []);

  const t = tel.trim(), m = mail.trim();
  const mobile = !!t && estMobile(t);
  const mailOk = !!m && mailValide(m);
  const dest: Destinataire = { nom: (nomFixe || nom).trim(), interlocuteur: personne.trim() || null, tel: t || null, email: mailOk ? m : null };
  const verifier = () => {
    if (!dest.nom) { setErreur('Le nom de l’agence d’abord.'); return false; }
    if (m && !mailOk) { setErreur('Ce mail ne semble pas complet.'); return false; }
    return true;
  };
  const aide = erreur
    || (!t && !m ? 'Un portable pour l’envoyer par SMS, un mail pour le mail mis en page — ou les deux.'
      : t && !mobile ? 'Ce numéro est un fixe : pas de SMS possible. Ajoute un mail, ou enregistre-le simplement.'
        : 'Le contact est gardé : la prochaine fois, il sera déjà là.');

  return (
    <div className={a.flForm}>
      <div className={a.flFormGrille} data-fixe={nomFixe ? 'oui' : undefined}>
        {!nomFixe && (
          <label className={a.flChamp}><span>Agence</span>
            <input ref={premier} value={nom} onChange={e => { setNom(e.target.value); setErreur(null); }} placeholder="Orpi Vanves" maxLength={120} autoComplete="off" /></label>
        )}
        <label className={a.flChamp}><span>{'Personne qui gère le dossier '}<i>(facultatif)</i></span>
          <input ref={nomFixe ? premier : undefined} value={personne} onChange={e => setPersonne(e.target.value)} placeholder="Marc Lenoir" maxLength={120} autoComplete="off" /></label>
        <label className={a.flChamp}><span>Portable</span>
          <input value={tel} onChange={e => { setTel(e.target.value); setErreur(null); }} placeholder="06 12 34 56 78" maxLength={40} inputMode="tel" autoComplete="off" /></label>
        <label className={`${a.flChamp} ${a.flChampMail}`}><span>Mail</span>
          <input value={mail} onChange={e => { setMail(e.target.value); setErreur(null); }} placeholder="marc.lenoir@orpi.com" maxLength={160} inputMode="email" autoComplete="off" /></label>
      </div>
      <p className={a.flFormAide} data-erreur={erreur ? 'oui' : undefined}>{aide}</p>
      <div className={a.flFormBtns}>
        {mobile && (
          <a className={a.flBtn} data-ton={mailOk ? 'doux' : undefined} href={lienSms(t, actions.pour(dest))}
            onClick={e => { if (!verifier()) { e.preventDefault(); return; } void actions.onSms(dest).then(onFini); }}>
            <Icone nom="mobile" taille={15} epaisseur={2.1} />Envoyer par SMS
          </a>
        )}
        {mailOk && (
          <button type="button" className={a.flBtn} disabled={!!actions.envoiMail}
            onClick={() => { if (verifier()) void actions.onMail(dest).then(ok => { if (ok) onFini(); }); }}>
            <Icone nom="mail" taille={15} epaisseur={2.1} />{actions.envoiMail === actions.cle ? 'Envoi…' : 'Envoyer le mail'}
          </button>
        )}
        {!mobile && !mailOk && <button type="button" className={a.flBtn} disabled>Envoyer</button>}
        <span className={a.flRessort} />
        <button type="button" className={a.flLienBtn} disabled={!t && !m}
          onClick={() => { if (verifier()) void actions.onEnregistrer(dest).then(ok => { if (ok) onFini(); }); }}>Enregistrer sans envoyer</button>
        <button type="button" className={a.flLienBtn} onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  );
}

/* Une agence : le rond à ses initiales, son nom, où elle en est, les boutons ;
   « Ajouter son contact » (ou le crayon) ouvre le contact sur place. */
function LigneAgence({ g, partie, edition, onEdition, actions, onCopier }: {
  g: AgenceConnue; partie: Partie; edition: boolean; onEdition: (o: boolean) => void;
  actions: ActionsContact; onCopier: (d: Destinataire) => void;
}) {
  const dest: Destinataire = { nom: g.nom, interlocuteur: g.interlocuteur, tel: g.tel, email: g.email };
  const mobile = !!g.tel && estMobile(g.tel);
  const msg = actions.pour(dest);
  const dernier = g.envois[0];
  const re = partie !== 'contacter' && !!dernier;
  const [fond, encre] = teinte(g.nom);
  const contact = [g.interlocuteur, g.tel, g.email].filter(Boolean).join(' · ');
  const sansContact = !g.tel && !g.email;
  return (
    <div className={a.flAgence} data-edition={edition ? 'oui' : undefined}>
      <div className={a.flAgLigne}>
        <span className={a.flRond} style={{ background: fond, color: encre }} aria-hidden="true">{initiales(g.nom)}</span>
        <span className={a.flAgTx}>
          <b>{g.nom}</b>
          <small>{contact || 'Pas de numéro ni de mail noté'}</small>
          {partie === 'contacter' && <span className={a.flOrigine}>{ORIGINES[g.origine]}</span>}
          {partie !== 'contacter' && (
            <span className={a.flEtat}>
              {g.proposes > 0 && <span className={a.flPuce} data-ton="prune">{`A proposé ${g.proposes} bien${g.proposes > 1 ? 's' : ''}`}</span>}
              {dernier && (
                <span className={a.flEnvoi}>
                  <Icone nom="coche" taille={13} epaisseur={2.6} />
                  {`${dernier.canal === 'copie' ? 'Message copié' : 'Lien envoyé'} ${quandEnvoi(dernier.le)}${dernier.canal === 'copie' ? '' : ` ${canalLong(dernier.canal)}`}${g.envois.length > 1 ? ` · ${g.envois.length} envois` : ''}`}
                </span>
              )}
            </span>
          )}
        </span>
        {!edition && (
          <span className={a.flBtns}>
            {!sansContact && (
              <button type="button" className={a.flIco} onClick={() => onEdition(true)} aria-label={`Modifier le contact de ${g.nom}`} title="Modifier le contact">
                <Icone nom="crayon" taille={15} epaisseur={2} />
              </button>
            )}
            {g.email && mobile && (
              <a className={a.flIco} href={lienSms(g.tel!, msg)} onClick={() => { void actions.onSms(dest); }} aria-label={`${re ? 'Renvoyer' : 'Envoyer'} par SMS à ${g.interlocuteur || g.nom}`} title={`${re ? 'Renvoyer' : 'Envoyer'} par SMS`}>
                <Icone nom="mobile" taille={16} epaisseur={2.1} />
              </a>
            )}
            {g.email ? (
              <button type="button" className={a.flBtn} data-ton={re ? 'doux' : undefined} disabled={!!actions.envoiMail} onClick={() => { void actions.onMail(dest); }}>
                <Icone nom="mail" taille={15} epaisseur={2.1} />{actions.envoiMail === actions.cle ? 'Envoi…' : re ? 'Renvoyer le mail' : 'Envoyer le mail'}
              </button>
            ) : mobile ? (
              <a className={a.flBtn} data-ton={re ? 'doux' : undefined} href={lienSms(g.tel!, msg)} onClick={() => { void actions.onSms(dest); }}>
                <Icone nom="mobile" taille={15} epaisseur={2.1} />{re ? 'Renvoyer par SMS' : 'Envoyer par SMS'}
              </a>
            ) : g.tel ? (
              <button type="button" className={a.flBtn} data-ton="doux" onClick={() => onCopier(dest)} title="Un fixe ne reçoit pas de SMS : copie le message pour l’envoyer autrement">
                <Icone nom="copie" taille={15} epaisseur={2.1} />Copier le message
              </button>
            ) : (
              <button type="button" className={a.flBtn} data-ton="pointille" onClick={() => onEdition(true)}>
                <Icone nom="plus" taille={15} epaisseur={2.3} />Ajouter son contact
              </button>
            )}
          </span>
        )}
      </div>
      {edition && (
        <div className={a.flAgForm}>
          <span className={a.flFormTitre}>{sansContact ? `Le contact chez ${g.nom}` : `Modifier le contact chez ${g.nom}`}</span>
          <FormContact nomFixe={g.nom} initial={g} actions={actions} onFini={() => onEdition(false)} onAnnuler={() => onEdition(false)} />
        </div>
      )}
    </div>
  );
}

/* Une partie qui se déplie : son point de couleur, son nombre, les noms quand elle est repliée. */
function PartieAgences({ titre, ton, liste, ouverte, onBascule, aide, vide, children }: {
  titre: string; ton: 'or' | 'vert' | 'prune'; liste: AgenceConnue[]; ouverte: boolean; onBascule: () => void;
  aide: string; vide: string; children: (g: AgenceConnue) => React.ReactNode;
}) {
  const [tout, setTout] = useState(false);
  const vues = tout ? liste : liste.slice(0, PAR_PARTIE);
  const noms = liste.slice(0, 3).map(g => g.nom).join(', ') + (liste.length > 3 ? '…' : '');
  return (
    <section className={a.flPartie} data-ouverte={ouverte ? 'oui' : undefined} data-ton={ton}>
      <button type="button" className={a.flPartieTete} onClick={onBascule} aria-expanded={ouverte}>
        <span className={a.flPoint} aria-hidden="true" />
        <b>{titre}</b>
        <span className={a.flNb}>{liste.length}</span>
        {!ouverte && liste.length > 0 && <span className={a.flNoms}>{noms}</span>}
        <span className={a.flRessort} />
        <span className={a.flDeplier}>{ouverte ? 'Replier' : 'Déplier'}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          style={{ transform: ouverte ? 'rotate(180deg)' : undefined, transition: 'transform .2s ease' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {ouverte && (
        <div className={a.flPartieCorps}>
          <p className={a.flAide}><Icone nom="info" taille={14} epaisseur={2.1} /><span>{aide}</span></p>
          {liste.length === 0 ? <p className={a.flVide}>{vide}</p> : vues.map(g => <div key={g.cle}>{children(g)}</div>)}
          {liste.length > PAR_PARTIE && (
            <button type="button" className={a.flPlus} onClick={() => setTout(t => !t)} aria-expanded={tout}>
              {tout ? 'Moins d’agences' : liste.length - PAR_PARTIE === 1 ? 'Voir l’autre agence' : `Voir les ${liste.length - PAR_PARTIE} autres agences`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* V3.201 — Ce que reçoit l'agence, en grand, par-dessus la fenêtre : le mail
   (vue ordinateur ou téléphone) ou le SMS (une bulle, modifiable). */
function ApercuEnvoi({ type, html, message, onMessage, onCopier, onFermer }: {
  type: 'mail' | 'sms'; html: string; message: string; onMessage: (m: string) => void; onCopier: () => void; onFermer: () => void;
}) {
  const [vue, setVue] = useState<'ordi' | 'tel'>('ordi');
  return createPortal(
    <div className={a.apVoile} onClick={e => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className={a.apFenetre} data-type={type} role="dialog" aria-modal="true" aria-label={type === 'mail' ? 'Le mail que reçoit l’agence' : 'Le SMS que reçoit l’agence'}>
        <div className={a.apTete}>
          <span className={a.apIc} aria-hidden="true"><Icone nom={type === 'mail' ? 'mail' : 'mobile'} taille={18} epaisseur={2.1} /></span>
          <div className={a.flTitre}>
            <h2>{type === 'mail' ? 'Le mail que reçoit l’agence' : 'Le SMS que reçoit l’agence'}</h2>
            <p>{type === 'mail' ? 'Mis en page aux couleurs d’Emilio, envoyé de ta part (arogelet@emilio-immo.com).' : 'Il s’ouvre sur ton téléphone, prêt à envoyer : tu peux le modifier ici.'}</p>
          </div>
          {type === 'mail' && (
            <div className={a.apVues} role="group" aria-label="Voir sur">
              <button type="button" aria-pressed={vue === 'ordi'} onClick={() => setVue('ordi')}>Ordinateur</button>
              <button type="button" aria-pressed={vue === 'tel'} onClick={() => setVue('tel')}>Téléphone</button>
            </div>
          )}
          <button type="button" className={a.fFermer} onClick={onFermer} aria-label="Fermer l’aperçu"><Icone nom="fermer" taille={16} epaisseur={2.4} /></button>
        </div>
        {type === 'mail' ? (
          <div className={a.apCorpsMail}>
            <iframe className={a.apMail} data-vue={vue} title="Aperçu du mail" srcDoc={html} sandbox="" />
            <p className={a.flPetit}>{'« Bonjour, » prend le prénom de la personne au moment de l’envoi (« Bonjour Julien, »).'}</p>
          </div>
        ) : (
          <div className={a.apCorpsSms}>
            <div className={a.apTel}>
              <span className={a.apTelTete}>{'Message · à l’agence'}</span>
              <div className={a.apBulle}>{message}</div>
            </div>
            <div className={a.apEdition}>
              <label className={a.flLib} htmlFor="msg-agence">Modifier le message</label>
              <textarea id="msg-agence" className={a.zone} rows={8} value={message} onChange={e => onMessage(e.target.value)} />
              <span className={a.flPetit}>{'« Bonjour, » prend le prénom de la personne au moment de l’envoi. Le lien est cliquable dans le SMS.'}</span>
              <div className={a.apPied}>
                <button type="button" className={a.btn} onClick={onCopier}><Icone nom="copie" taille={14} epaisseur={2.1} />Copier le message</button>
                <button type="button" className={a.btnFort} onClick={onFermer}>C’est bon</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

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
  const [ouvertes, setOuvertes] = useState<Record<Partie, boolean>>({ contacter: true, contactees: false, proposees: false });
  const [autreOuvert, setAutreOuvert] = useState(false);
  const [edition, setEdition] = useState<string | null>(null);
  const [apercu, setApercu] = useState<null | 'mail' | 'sms'>(null);
  /* Le joli mail : en cours (la clé de l'agence), ou parti en erreur (la messagerie à la place). */
  const [envoiMail, setEnvoiMail] = useState<string | null>(null);
  const [secours, setSecours] = useState<{ dest: Destinataire; erreur: string } | null>(null);
  const minuteurDit = useRef<number | undefined>(undefined);
  const pour = String(prenom || '').trim();
  /* V3.202 — « Montrer ses précisions aux agences » : une copie (recherches.precisions_agences),
     que les agences lisent ; ses précisions (recherches.notes) ne bougent pas. `null` : cachées. */
  const notes = String(recherche?.notes || '').trim();
  const [precAg, setPrecAg] = useState<string | null>(null);
  const [precOuvert, setPrecOuvert] = useState(false);
  const [precTexte, setPrecTexte] = useState('');
  const [precTravail, setPrecTravail] = useState(false);
  useEffect(() => {
    let vivant = true;
    supabase.from('recherches').select('precisions_agences').eq('id', rechercheId).maybeSingle().then(({ data, error }) => {
      if (!vivant || error) return; /* la colonne absente (SQL pas passé) : la case reste décochée */
      const v = (data as { precisions_agences?: string | null } | null)?.precisions_agences;
      const val = typeof v === 'string' && v.trim() ? v : null;
      setPrecAg(val); setPrecOuvert(val !== null); setPrecTexte(val ?? '');
    });
    return () => { vivant = false; };
  }, [rechercheId]);

  const dire = (m: string) => {
    setDit(m);
    window.clearTimeout(minuteurDit.current);
    minuteurDit.current = window.setTimeout(() => setDit(null), 3200);
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

  /* Échap ferme d'abord l'aperçu, puis la fenêtre. */
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (apercu) setApercu(null); else onFermer(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFermer, apercu]);

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

  /* V3.202 — Le message pour cette personne : son prénom, et le lien avec son code. */
  const pourDest = (d: Destinataire) => messagePourAgence(message, jeton, d);

  /* L'envoi : le SMS (sms:) s'ouvre tout seul ; ici, on le note (avec le code). */
  async function noter(dest: Destinataire, canal: Canal) {
    const ok = await noterEnvoi({ clientId, rechercheId, prenom, dest, canal, jeton });
    if (ok) dire(canal === 'copie' ? `Message copié pour ${dest.interlocuteur || dest.nom} : c’est noté.` : `SMS préparé pour ${dest.interlocuteur || dest.nom} : l’envoi est noté.`);
    await chargerAgences();
  }
  async function copierPour(dest: Destinataire) {
    if (await copier(pourDest(dest), 'Message')) await noter(dest, 'copie');
  }
  /* Le joli mail, envoyé par le CRM (après un « oui ») ; s'il ne part pas,
     la messagerie d'Alexandre reste possible, avec le message simple. */
  async function mailer(dest: Destinataire, cle: string): Promise<boolean> {
    if (!dest.email || envoiMail) return false;
    if (!window.confirm(`Envoyer le mail du lien à ${dest.interlocuteur ? `${dest.interlocuteur} (${dest.email})` : dest.email} ?`)) return false;
    setSecours(null); setEnvoiMail(cle);
    const r = await envoyerMailAgence(rechercheId, dest, jeton);
    setEnvoiMail(null);
    if (!r.ok) { setSecours({ dest, erreur: r.erreur }); return false; }
    await noterEnvoi({ clientId, rechercheId, prenom, dest, canal: 'mail', jeton });
    dire(`Mail envoyé à ${dest.interlocuteur || dest.nom}.`);
    await chargerAgences();
    return true;
  }
  async function ecrirePrecisions(v: string | null): Promise<boolean> {
    setPrecTravail(true);
    const ok = await verifie('Les précisions pour les agences', supabase.from('recherches').update({ precisions_agences: v }).eq('id', rechercheId).select('id'), { ligne: true });
    setPrecTravail(false);
    if (ok) { setPrecAg(v); dire(v ? 'Enregistré : les agences lisent ce texte.' : 'Les agences ne voient plus ses précisions.'); }
    return ok;
  }
  function basculerPrecisions(on: boolean) {
    if (on) { setPrecOuvert(true); if (precAg === null) setPrecTexte(notes); return; }
    setPrecOuvert(false);
    if (precAg !== null) void ecrirePrecisions(null);
  }

  async function enregistrer(dest: Destinataire): Promise<boolean> {
    const ok = await noterContact({ clientId, rechercheId, dest });
    if (ok) dire(`Contact de ${dest.nom} enregistré.`);
    await chargerAgences();
    return ok;
  }
  const actions = (cle: string): ActionsContact => ({
    envoiMail, cle, pour: pourDest,
    onMail: d => mailer(d, cle),
    onSms: d => noter(d, 'sms'),
    onEnregistrer: enregistrer,
  });

  const resume = recherche ? resumePourAgence({ ...recherche, precisions_agences: precAg }) : null;
  const lien = jeton ? lienAgences(jeton) : '';
  const liste = agences || [];
  const parties: Record<Partie, AgenceConnue[]> = {
    contacter: liste.filter(g => !g.envois.length && !g.proposes),
    contactees: liste.filter(g => g.envois.length && !g.proposes),
    proposees: liste.filter(g => g.proposes > 0),
  };
  const nbContactees = liste.filter(g => g.envois.length).length;
  const htmlMail = apercu === 'mail' && jeton && resume ? mailLienAgence({ lien, resume }).html : '';

  const ligne = (partie: Partie) => (g: AgenceConnue) => (
    <LigneAgence g={g} partie={partie} edition={edition === g.cle} onEdition={o => setEdition(o ? g.cle : null)}
      actions={actions(g.cle)} onCopier={d => { void copierPour(d); }} />
  );
  const basculer = (k: Partie) => setOuvertes(o => ({ ...o, [k]: !o[k] }));

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className={a.voile} onClick={e => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className={a.flFenetre} role="dialog" aria-modal="true" aria-label="Le lien pour les agences">
        <div className={a.flTete}>
          <span className={a.fIc} aria-hidden="true"><Icone nom="lien" taille={19} epaisseur={2} /></span>
          <div className={a.flTitre}>
            <h2>Le lien pour les agences</h2>
            <p>{pour ? `Recherche de ${pour} · le même lien pour toutes les agences` : 'Le même lien pour toutes les agences de ce client'}</p>
          </div>
          {jeton && !manque && !coupe && (
            <div className={a.flChiffres}>
              <span className={a.flChiffre}><b>{nbContactees}</b><small>{nbContactees > 1 ? 'contactées' : 'contactée'}</small></span>
              <span className={a.flChiffre} data-ton="prune"><b>{stats.biens}</b><small>{stats.biens > 1 ? 'biens reçus' : 'bien reçu'}</small></span>
            </div>
          )}
          <button type="button" className={a.fFermer} onClick={onFermer} aria-label="Fermer"><Icone nom="fermer" taille={16} epaisseur={2.4} /></button>
        </div>

        {manque ? (
          <div className={a.flCorpsUn}><div className={a.coupe}>{'À activer d’abord : un petit SQL à passer dans Supabase (SQL Editor), outils/sql/lien-agences.sql.'}</div></div>
        ) : coupe ? (
          <div className={a.flCorpsUn}>
            <div className={a.coupe}>
              <span>{'Lien coupé : les agences qui l’avaient tombent sur « Cette recherche n’est plus ouverte ».'}</span>
              <button type="button" className={a.btnFort} onClick={() => { void creer(); }} disabled={travail}>Créer un nouveau lien</button>
            </div>
          </div>
        ) : !jeton ? (
          <div className={a.flCorpsUn}><div className={a.aide}>{travail ? 'Création du lien…' : 'Lecture du lien…'}</div></div>
        ) : (
          <div className={a.flCorps}>
            <div className={a.flGauche}>
            {/* ── Le lien ── */}
            <div className={a.flBloc} style={{ order: 1 }}>
              <span className={a.flLib}>Le lien</span>
              <div className={a.flLien}>
                <span title={lien}>{lien.replace(/^https:\/\//, '')}</span>
                <button type="button" onClick={() => { void copier(lien, 'Lien'); }}><Icone nom="copie" taille={14} epaisseur={2.2} />Copier</button>
              </div>
              <span className={a.flPetit}>{`Le même pour toutes les agences${pour ? ` de ${pour}` : ''}. Elles y collent leur annonce : le bien arrive dans sa Veille, analysé.`}</span>
              {dit && <div className={a.dit} role="status">{dit}</div>}
            </div>

            {/* ── Ce que l'agence voit, puis ce qu'elle reçoit (en grand) ── */}
            <div className={a.flBloc} style={{ order: 3 }}>
              <span className={a.flLib}>{'Ce que l’agence voit'}</span>
              {resume && (
                <div className={a.flPastilles}>
                  {resume.puces.map(x => <span key={x} className={a.flPastille}>{x}</span>)}
                  {resume.budget && <span className={a.flPastille} data-ton="or">{resume.budget}</span>}
                  {resume.important.map(x => <span key={x} className={a.flPastille} data-ton="blanc"><Icone nom="coche" taille={12} epaisseur={2.6} />{x}</span>)}
                </div>
              )}
              <label className={a.flCase} data-on={precOuvert ? 'oui' : undefined}>
                <input type="checkbox" checked={precOuvert} onChange={e => basculerPrecisions(e.target.checked)} disabled={precTravail} />
                <span><b>Montrer ses précisions aux agences</b><small>{'Une copie, que tu peux raccourcir'}</small></span>
              </label>
              {precOuvert && (
                <div className={a.flPrec}>
                  <label className={a.flLib} htmlFor="prec-agences">Ce que les agences lisent</label>
                  <textarea id="prec-agences" className={a.zone} rows={5} value={precTexte} maxLength={1500}
                    placeholder={'Ses précisions sont vides : écris ici ce que les agences doivent savoir.'}
                    onChange={e => setPrecTexte(e.target.value)} />
                  <span className={a.flPetit}>{'Repris de ses précisions. Ce que tu changes ici ne touche pas sa recherche.'}</span>
                  <div className={a.flPrecBtns}>
                    <button type="button" className={a.btnFort} disabled={precTravail || !precTexte.trim() || precTexte.trim() === (precAg || '').trim()}
                      onClick={() => { void ecrirePrecisions(precTexte.trim()); }}>{precAg !== null && precTexte.trim() === precAg.trim() ? 'Enregistré' : 'Enregistrer'}</button>
                    {notes && precTexte.trim() !== notes && <button type="button" className={a.btn} onClick={() => setPrecTexte(notes)}>Reprendre ses précisions</button>}
                  </div>
                </div>
              )}
              <span className={a.flPetit}>{precAg !== null ? 'Jamais son nom, ni ses biens déjà vus.' : 'Jamais son nom, ni ses précisions, ni ses biens déjà vus.'}</span>
            </div>
            <div className={a.flBloc} style={{ order: 4 }}>
              <span className={a.flLib}>{'Ce qu’elle reçoit'}</span>
              <button type="button" className={a.flVoir} onClick={() => setApercu('mail')}>
                <span className={a.flVoirIc} aria-hidden="true"><Icone nom="mail" taille={17} epaisseur={2.1} /></span>
                <span className={a.flVoirTx}><b>Voir le mail</b><small>{'Mis en page, envoyé de ta part'}</small></span>
                <Icone nom="chevron" taille={15} epaisseur={2.3} />
              </button>
              <button type="button" className={a.flVoir} onClick={() => setApercu('sms')}>
                <span className={a.flVoirIc} data-ton="bleu" aria-hidden="true"><Icone nom="mobile" taille={17} epaisseur={2.1} /></span>
                <span className={a.flVoirTx}><b>Voir le SMS</b><small>{'Il s’ouvre sur ton téléphone ; modifiable'}</small></span>
                <Icone nom="chevron" taille={15} epaisseur={2.3} />
              </button>
            </div>
            <div className={`${a.flBloc} ${a.flBas}`} style={{ order: 5 }}>
              <button type="button" className={a.couper} onClick={() => { void couper(); }} disabled={travail}>Couper ce lien</button>
            </div>
            </div>

            {/* ── Ses agences ── */}
            <div className={a.flAgences} style={{ order: 2 }}>
              <div className={a.flAgencesTete}>
                <b>Ses agences</b>
                <span>{'celles de ses biens (Sélection, Présentés, Veille), de tes suivis, et celles qui t’ont répondu'}</span>
              </div>
              {agences === null ? (
                <p className={a.flVide}>{'Recherche des agences de ses biens…'}</p>
              ) : (
                <>
                  <PartieAgences titre="Pas encore contactées" ton="or" liste={parties.contacter} ouverte={ouvertes.contacter} onBascule={() => basculer('contacter')}
                    aide={'Elles n’ont pas encore le lien. Le mail part tout de suite, de ta part ; le SMS s’ouvre sur ton téléphone, prêt à envoyer. Pas de numéro ? « Ajouter son contact ».'}
                    vide={liste.length ? 'Toutes les agences connues ont déjà le lien.' : 'Aucune agence notée pour l’instant dans ses biens ni dans tes suivis : ajoute-la juste en dessous.'}>
                    {ligne('contacter')}
                  </PartieAgences>
                  <PartieAgences titre="Déjà contactées" ton="vert" liste={parties.contactees} ouverte={ouvertes.contactees} onBascule={() => basculer('contactees')}
                    aide={'Le lien ne change pas : renvoie-le autant de fois qu’il faut, si une agence ne l’a pas reçu. « Lien envoyé » note ton appui : pour un SMS, le CRM ne voit pas si tu as vraiment appuyé sur Envoyer.'}
                    vide={'Aucune pour l’instant.'}>
                    {ligne('contactees')}
                  </PartieAgences>
                  <PartieAgences titre="Ont proposé des biens" ton="prune" liste={parties.proposees} ouverte={ouvertes.proposees} onBascule={() => basculer('proposees')}
                    aide={'Leurs biens sont dans la Veille de ce client, tout en haut : « Proposés par des agences ».'}
                    vide={'Aucune pour l’instant.'}>
                    {ligne('proposees')}
                  </PartieAgences>
                </>
              )}

              {secours && (
                <div className={a.secours} role="alert">
                  <span>{`Le mail à ${secours.dest.email} n’est pas parti : ${secours.erreur}`}</span>
                  <a className={a.btn} href={lienMail(secours.dest.email || '', pourDest(secours.dest))}
                    onClick={() => { const d = secours.dest; setSecours(null); void noter(d, 'mail'); }}><Icone nom="mail" taille={14} epaisseur={2.1} />Ouvrir ma messagerie à la place</a>
                </div>
              )}

              {!autreOuvert ? (
                <button type="button" className={a.flAutreBtn} onClick={() => setAutreOuvert(true)}><Icone nom="plus" taille={15} epaisseur={2.4} />Une autre agence</button>
              ) : (
                <div className={a.flAutre}>
                  <div className={a.flAutreTete}>
                    <span className={a.flFormTitre}>{'Une agence que le CRM ne connaît pas encore'}</span>
                    <button type="button" className={a.flAutreFermer} onClick={() => setAutreOuvert(false)} aria-label="Fermer"><Icone nom="fermer" taille={13} epaisseur={2.4} /></button>
                  </div>
                  <FormContact actions={actions('autre')} onFini={() => setAutreOuvert(false)} onAnnuler={() => setAutreOuvert(false)} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {apercu && (
        <ApercuEnvoi type={apercu} html={htmlMail} message={message} onMessage={setMessage}
          onCopier={() => { void copier(message, 'Message'); }} onFermer={() => setApercu(null)} />
      )}
    </div>,
    document.body,
  );
}
