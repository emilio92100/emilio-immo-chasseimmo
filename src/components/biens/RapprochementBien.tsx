'use client';
/* ═══ Le rapprochement d'un bien (V3.112 → V3.125) ══════════════════════════
   L'onglet « Rapprochement » de la fiche d'un bien.

   V3.125 — Alexandre : « quand j'appuie sur rapprochement, il y a la
   question qui, dans la base, pourrait acheter cet appartement, et ensuite
   juste le bouton… qu'on affiche les résultats, pas avant… que le
   rapprochement fasse le travail au moment où j'appuie. Dès que c'est fait,
   ça crée une ligne "Rapprochement" à cette date, je clique et je vois ce qui
   a été fait… un autre jour, une autre ligne… déplier, replier ». Puis :
   « que les résultats soient bien présentés… les plus, les moins, le score
   potentiel de chaque personne mis à côté ».

   De haut en bas :
   · la question, ce que fait le rapprochement, « Comment ça marche ? » à
     déplier, et un seul bouton. Aucun chiffre ni liste avant le clic ;
   · au clic, les étapes à l'écran : le premier tri en chiffres (outils.ts,
     triBien), puis la relecture de chaque dossier qui passe
     (RapprochementIA.tsx, route /api/rapprochement-ia) ;
   · chaque rapprochement devient une ligne datée, gardée dans l'historique
     du bien (`biens_vente_suivi`, type « note », `donnees.rapprochement`) :
     le dernier déplié, les précédents repliés. Dedans : Oui, À voir, puis
     Non replié ; pour chacun sa note de potentiel, la phrase, les plus et
     les moins. Rien n'est coché d'office : « Cocher les oui » ;
   · « Écartées au premier tri », replié, avec « Lui envoyer quand même » ;
   · le pied : combien de cochés, « Un autre client… », « Envoyer… ». */

import { useEffect, useMemo, useRef, useState } from 'react';
import { lirePlace, retenirPlace } from '@/lib/place-fiche';
import { IcoP } from '@/components/shared/Parcours';
import { AvecScore, AvisDetail, ETINCELLE, IconeAvis, MOT_IA, Progression, analyserIA, compareIA, dateRappro, fr, type AvisIA } from './RapprochementIA';
import AvatarContact from '@/components/contacts/AvatarContact';
import { Ic } from '@/components/documents/ApercuActe';
import { euros } from '@/lib/mandat';
import type { BienVente, SuiviVente } from '@/lib/biens-vente';
import { Illu, etat, mailDe, sansEspaces, telDe, teinte, type ModeAcheteurs } from './AcheteursBien';
import {
  RAISONS_CACHE, STATUT_ACHETEUR, acheteurChoisi, ajouterSuivi, estPasPourLui, nomClient, supprimerSuivi,
  type Acheteur, type Cache, type Copie, type RaisonCache, type TriBien,
} from './outils';
import r from './RapprochementBien.module.css';

const presente = (c: Copie | null | undefined) => !!c && c.etape !== 'selection';
const pl = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);
const pause = (ms: number) => new Promise(ok => setTimeout(ok, ms));
const CHEVRON = 'm6 9 6 6 6-6';

const ICONE_CACHE: Record<RaisonCache, string> = {
  secteur: 'lieu', type: 'maison', budget: 'euro', surface: 'regle', chambres: 'lit', indispensable: 'cadenas', loin: 'cible', peu: 'info',
};

/* ── Une séance de rapprochement, gardée dans l'historique du bien ── */
export type LigneSeance = { r: string; c: string; nom: string; v: AvisIA['v']; s: number; t: string; p: string[]; m: string[]; n: number };
export type Seance = { id: string; le: string; total: number; tries: number; manquent: number; erreur: string; lignes: LigneSeance[]; gardee: boolean };
export const estSeance = (x: SuiviVente) => x.type === 'note' && (x.donnees as Record<string, unknown> | null)?.rapprochement === true;
export function lireSeance(x: SuiviVente): Seance | null {
  if (!estSeance(x)) return null;
  const d = x.donnees as Record<string, unknown>;
  const lignes = (Array.isArray(d.lignes) ? d.lignes : []).filter((l): l is LigneSeance =>
    !!l && typeof l === 'object' && typeof (l as LigneSeance).r === 'string' && ['oui', 'a_voir', 'non'].includes(String((l as LigneSeance).v)));
  return { id: x.id, le: x.le, total: Number(d.total) || 0, tries: Number(d.tries) || 0, manquent: Number(d.manquent) || 0, erreur: String(d.erreur || ''), lignes, gardee: true };
}
/* « 3 oui · 2 à voir · 4 non » */
export function resumeSeance(l: { v: AvisIA['v'] }[]): string {
  const n = (v: AvisIA['v']) => l.filter(x => x.v === v).length;
  return `${n('oui')} oui · ${n('a_voir')} à voir · ${n('non')} non`;
}
const SOUS: Record<AvisIA['v'], string> = {
  oui: 'Ils peuvent être intéressés : à proposer en premier.',
  a_voir: 'Ça peut leur plaire : un point est à vérifier avec eux.',
  non: 'Le rapprochement les écarte : la raison est écrite pour chacun.',
};

export function RapprochementBien({ bien, tri, mode, copies, suivi, onSuivi, onFiche, onAgir, onAutre }: {
  bien: BienVente; tri: TriBien; mode: ModeAcheteurs; copies: Copie[];
  /* L'historique du bien : ses rapprochements passés (estSeance) et ses
     « Pas pour lui » (estPasPourLui, V3.126). */
  suivi: SuiviVente[];
  /* Une ligne vient d'être ajoutée (ou retirée) : la fiche suit, sans se relire. */
  onSuivi?: (ajout: SuiviVente | null, retrait?: string) => void;
  onFiche: (clientId: string) => void;
  /* « Envoyer… » : la fenêtre des trois choix (FenEnvoiAcheteurs). */
  onAgir?: (l: Acheteur[]) => void;
  /* « Un autre client… » : la fenêtre d'envoi avec la recherche par nom (LotBiens). */
  onAutre?: () => void;
}) {
  const peutEnvoyer = (mode === 'vente' || mode === 'avant') && !!onAgir;
  const ce = (() => {
    const t = String(bien.donnees?.typeBien || '');
    return t === 'maison' ? 'cette maison' : t === 'appartement' || t === 'studio' || t === 'duplex' || t === 'loft' ? 'cet appartement' : t === 'terrain' ? 'ce terrain' : 'ce bien';
  })();
  const [aide, setAide] = useState(false);

  /* V3.121 : de retour d'une fiche client, les rapprochements dépliés et les
     cases cochées sont ceux qu'on avait laissés (lib/place-fiche.ts) — tant
     que rien n'est parti entre-temps : un envoi change les copies, et
     l'onglet repart de zéro. */
  const cleCopies = copies.map(c => `${c.id}${c.etape || ''}`).join();
  const [memoire] = useState(() => {
    const m = lirePlace(`bien:${bien.id}`)?.rappro as { cle?: string; ouverts?: string[] | null; non?: string[]; choisis?: string[] } | undefined;
    return m && m.cle === cleCopies && Array.isArray(m.choisis) ? m : null;
  });
  /* Les rapprochements dépliés ; null : le dernier seulement. */
  const [ouverts, setOuverts] = useState<string[] | null>(() => (Array.isArray(memoire?.ouverts) ? memoire!.ouverts! : null));
  const [nonOuverts, setNonOuverts] = useState<string[]>(() => (Array.isArray(memoire?.non) ? memoire!.non! : []));
  const [choisis, setChoisis] = useState<string[]>(() => memoire?.choisis || []);
  const [anciens, setAnciens] = useState(false);
  const [voirCaches, setVoirCaches] = useState(false);
  const [carres, setCarres] = useState<string[]>([]);
  /* Retenu seulement après un geste d'Alexandre : l'onglet monté une
     première fois sans les copies (la fiche se lit encore) n'efface rien. */
  const touche = useRef(false);
  useEffect(() => {
    if (touche.current) retenirPlace(`bien:${bien.id}`, { rappro: { cle: cleCopies, ouverts, non: nonOuverts, choisis } });
  }, [bien.id, cleCopies, ouverts, nonOuverts, choisis]);

  /* Ceux qui passent le premier tri aujourd'hui, par recherche ; sans ceux
     qu'Alexandre a écartés de ce bien (« Pas pour lui », V3.126). */
  const seances = useMemo(() => suivi.filter(estSeance), [suivi]);
  const ecartes = useMemo(() => suivi.filter(estPasPourLui).sort((p, q) => q.le.localeCompare(p.le)), [suivi]);
  const ecartesIds = useMemo(() => new Set(ecartes.map(x => String(x.recherche_id))), [ecartes]);
  const tous = useMemo(() => [...tri.bons, ...tri.partiels, ...tri.incomplets], [tri]);
  const candidats = useMemo(() => tous.filter(x => !ecartesIds.has(x.recherche.id)), [tous, ecartesIds]);
  const parId = useMemo(() => new Map(tous.map(x => [x.recherche.id, x])), [tous]);

  /* Les rapprochements : ceux de l'historique, et celui qui vient d'être fait. */
  const [locale, setLocale] = useState<Seance | null>(null);
  const toutes = useMemo(() => {
    const l = seances.map(lireSeance).filter((x): x is Seance => !!x);
    if (locale && !l.some(x => x.id === locale.id)) l.push(locale);
    return l.sort((p, q) => q.le.localeCompare(p.le));
  }, [seances, locale]);
  const derniere = toutes[0] || null;
  /* Depuis le dernier : ceux qui passent le premier tri et qu'il n'a pas relus. */
  const nouveaux = derniere ? candidats.filter(x => !derniere.lignes.some(l => l.r === x.recherche.id)).length : 0;

  /* ── Le rapprochement en cours ── */
  const [en, setEn] = useState<{ phase: 'tri' | 'relecture' | 'fin'; tries: number; fait: number } | null>(null);
  const [souci, setSouci] = useState<{ erreur: string; info: string }>({ erreur: '', info: '' });
  const peutLancer = !en && !tri.vide && tri.total > 0;

  async function lancer() {
    if (!peutLancer) return;
    const liste = candidats;
    setSouci({ erreur: '', info: '' });
    /* Le premier tri est instantané : on le laisse lire un instant. */
    setEn({ phase: 'tri', tries: liste.length, fait: 0 });
    await pause(900);
    let avis: Record<string, AvisIA> = {};
    let res = { erreur: '', info: '', manquent: 0 };
    if (liste.length) {
      setEn({ phase: 'relecture', tries: liste.length, fait: 0 });
      res = await analyserIA(liste.map(x => ({ b: bien.id, r: x.recherche.id })), (av, fait) => {
        avis = av[bien.id] || {};
        setEn(e => (e ? { ...e, fait } : e));
      });
    }
    setEn({ phase: 'fin', tries: liste.length, fait: liste.length });
    await pause(450);
    const lignes: LigneSeance[] = liste.filter(x => avis[x.recherche.id]).map(x => {
      const a = avis[x.recherche.id];
      return {
        r: x.recherche.id, c: x.client.id, nom: nomClient(x.client), v: a.v, t: a.r,
        s: typeof a.s === 'number' ? a.s : a.v === 'oui' ? 80 : a.v === 'a_voir' ? 55 : 20,
        p: a.p || [], m: a.m || [], n: x.corr.note,
      };
    });
    /* Rien n'a pu être relu : on le dit, rien n'est gardé. */
    if (liste.length && !lignes.length) {
      setEn(null);
      setSouci({ erreur: `Le rapprochement n’a pas pu relire les dossiers : ${res.erreur || 'erreur inconnue'}. Relance dans un instant.`, info: res.info });
      return;
    }
    const seance: Seance = { id: `ici-${Date.now()}`, le: new Date().toISOString(), total: tri.total, tries: liste.length, manquent: res.manquent, erreur: res.erreur, lignes, gardee: false };
    touche.current = true;
    setLocale(seance); setOuverts(null); setNonOuverts([]); setEn(null); setSouci({ erreur: '', info: res.info });
    window.setTimeout(() => document.getElementById('rb-derniere')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    const donnees: Record<string, unknown> = { rapprochement: true, total: seance.total, tries: seance.tries, manquent: seance.manquent, lignes };
    if (seance.erreur) donnees.erreur = seance.erreur;
    const commentaire = lignes.length
      ? `${resumeSeance(lignes)}, sur ${seance.total} ${pl(seance.total, 'recherche ouverte', 'recherches ouvertes')}`
      : `Personne ne passe le premier tri, sur ${seance.total} ${pl(seance.total, 'recherche ouverte', 'recherches ouvertes')}`;
    try {
      const garde = await ajouterSuivi({ bien_id: bien.id, type: 'note', le: seance.le, commentaire, donnees });
      const id = garde?.id || seance.id;
      setLocale({ ...seance, id, gardee: true });
      onSuivi?.({ ...(garde || {}), id, bien_id: bien.id, type: 'note', le: seance.le, commentaire, donnees } as SuiviVente);
    } catch (e) {
      setSouci(s => ({ ...s, erreur: `Ce rapprochement est à l’écran, mais il n’a pas pu être gardé : ${(e as Error).message}` }));
    }
  }

  /* ── « Pas pour lui » (V3.126) : il ne sera plus proposé sur ce bien ── */
  const [ecartEn, setEcartEn] = useState('');
  async function ecarter(x: Acheteur) {
    if (ecartEn) return;
    setEcartEn(x.recherche.id);
    const nom = nomClient(x.client);
    const commentaire = `${nom} ne sera plus proposé dans les rapprochements de ce bien.`;
    const donnees = { pasPourLui: true };
    try {
      const garde = await ajouterSuivi({ bien_id: bien.id, type: 'note', client_id: x.client.id, recherche_id: x.recherche.id, qui: nom, commentaire, donnees });
      touche.current = true;
      setChoisis(c => c.filter(id => id !== x.recherche.id));
      onSuivi?.({ ...(garde || {}), bien_id: bien.id, type: 'note', client_id: x.client.id, recherche_id: x.recherche.id, qui: nom, commentaire, donnees } as SuiviVente);
    } catch (e) {
      setSouci(s => ({ ...s, erreur: `« Pas pour lui » n’a pas pu être gardé : ${(e as Error).message}` }));
    }
    setEcartEn('');
  }
  async function remettre(ligneId: string) {
    if (ecartEn) return;
    setEcartEn(ligneId);
    try { await supprimerSuivi(ligneId); onSuivi?.(null, ligneId); }
    catch (e) { setSouci(s => ({ ...s, erreur: `Il n’a pas pu être remis : ${(e as Error).message}` })); }
    setEcartEn('');
  }

  /* ── Les cases ── */
  const coches = choisis.map(id => parId.get(id)).filter((x): x is Acheteur => !!x && !presente(x.copie));
  const basculer = (id: string) => { touche.current = true; setChoisis(c => (c.includes(id) ? c.filter(y => y !== id) : [...c, id])); };
  const estOuverte = (id: string, i: number) => (ouverts === null ? i === 0 : ouverts.includes(id));
  const basculerSeance = (id: string, i: number) => {
    touche.current = true;
    setOuverts(o => {
      const base = o ?? (toutes[0] ? [toutes[0].id] : []);
      return estOuverte(id, i) ? base.filter(y => y !== id) : [...base, id];
    });
  };
  const basculerNon = (id: string) => { touche.current = true; setNonOuverts(o => (o.includes(id) ? o.filter(y => y !== id) : [...o, id])); };

  /* Les écartés du premier tri, par raison : la plus nombreuse d'abord. */
  const parRaison = useMemo(() => {
    const m = new Map<RaisonCache, Cache[]>();
    for (const c of tri.caches) m.set(c.raison, [...(m.get(c.raison) || []), c]);
    return [...m.entries()].sort((p, q) => q[1].length - p[1].length);
  }, [tri.caches]);

  /* ── Une personne, dans un rapprochement ── */
  const carte = (l: LigneSeance, k: number) => {
    const x = parId.get(l.r) || null;
    const deja = presente(x?.copie);
    const on = !!x && !deja && choisis.includes(l.r);
    const statut = x ? STATUT_ACHETEUR[String(x.client.statut || '')] : '';
    const tel = x ? telDe(x) : '', mail = x ? mailDe(x) : '';
    const et = x ? etat(x) : null;
    const nom = x ? nomClient(x.client) : l.nom;
    const tt = teinte(l.c);
    const ecarte = ecartes.find(y => y.recherche_id === l.r) || null;
    return (
      <div key={l.r} className={`${r.carte} ${peutEnvoyer ? r.carteEnvoi : ''} ${on ? r.carteOn : ''}`} data-v={l.v} style={{ animationDelay: `${Math.min(k, 8) * 0.035}s` }}>
        {peutEnvoyer && (
          <button type="button" className={`${r.coche} ${on ? r.cocheOn : ''}`} disabled={!x || deja || !!ecarte} aria-pressed={on}
            aria-label={deja ? 'Déjà présenté' : !x ? 'Plus dans ta base' : on ? `Décocher ${nom}` : `Cocher ${nom}`}
            title={deja ? 'Il l’a déjà dans son espace' : !x ? 'Sa recherche ne passe plus le premier tri' : undefined}
            onClick={() => basculer(l.r)}>
            <Ic n="check" t={13} e={3.2} />
          </button>
        )}
        <AvecScore s={l.s} v={l.v}><AvatarContact c={x?.client || { prenom: l.nom }} teinte={{ bg: tt.f, fg: tt.t }} libre /></AvecScore>
        <div className={r.qui}>
          <div className={r.quiL1}>
            <button type="button" className={r.nom} onClick={() => onFiche(l.c)}>{nom}</button>
            {statut && <span className={r.tag}>{statut}</span>}
            {x?.recherche.budget_max ? <span className={r.budget}><Ic n="euro" t={13} />{`jusqu’à ${euros(x.recherche.budget_max)}`}</span> : null}
            {ecarte && <span className={r.tagEcarte}>{'Pas pour lui'}</span>}
          </div>
          <AvisDetail avis={{ v: l.v, r: l.t, s: l.s, p: l.p, m: l.m }} sansMot />
          {et && <span className={et.ton === 'nouveau' ? r.etatNouveau : r.etat}>{et.ton === 'nouveau' && <i className={r.ping} />}{et.t}</span>}
          {!x && <span className={r.parti}>{'Sa recherche est fermée, ou ne passe plus le premier tri.'}</span>}
        </div>
        {x && (
          <div className={r.actions}>
            <div className={r.contacts}>
              {tel && <a className={r.rond} href={`tel:${sansEspaces(tel)}`} aria-label={`Appeler ${nom}`} title={tel}><Ic n="telephone" t={16} /><span className={r.rondTx}>Appeler</span></a>}
              {tel && <a className={r.rond} href={`sms:${sansEspaces(tel)}`} aria-label={`SMS à ${nom}`} title="SMS"><Ic n="bulle" t={16} /><span className={r.rondTx}>SMS</span></a>}
              {mail && <a className={`${r.rond} ${r.rondMail}`} href={`mailto:${mail}`} aria-label={`Mail à ${nom}`} title={mail}><Ic n="mail" t={16} /></a>}
            </div>
            {peutEnvoyer && !ecarte && (
              <button type="button" className={r.agir} onClick={() => onAgir!([x])}>
                <Ic n="envoyer" t={15} />{deja ? 'Renvoyer…' : 'Envoyer…'}
              </button>
            )}
            {ecarte
              ? <button type="button" className={r.pasPour} disabled={!!ecartEn} onClick={() => { void remettre(ecarte.id); }} title="Il sera de nouveau proposé dans les rapprochements de ce bien">{'Le remettre'}</button>
              : <button type="button" className={r.pasPour} disabled={!!ecartEn} onClick={() => { void ecarter(x); }} title="Il ne te sera plus proposé sur ce bien. Tu pourras le remettre.">{ecartEn === x.recherche.id ? '…' : 'Pas pour lui'}</button>}
          </div>
        )}
      </div>
    );
  };

  /* ── Un groupe : Oui, À voir, Non (replié) ── */
  const groupe = (x: Seance, v: AvisIA['v']) => {
    const l = x.lignes.filter(y => y.v === v).sort((p, q) => compareIA({ v: p.v, r: '', s: p.s }, { v: q.v, r: '', s: q.s }));
    if (!l.length) return null;
    const replie = v === 'non' && !nonOuverts.includes(x.id);
    const tete = (
      <>
        <IconeAvis v={v} t={24} />
        <h4>{MOT_IA[v]}</h4>
        <b>{l.length}</b>
        <span className={r.groupeS}>{fr(SOUS[v])}</span>
      </>
    );
    return (
      <div className={r.groupe} data-v={v}>
        {v === 'non'
          ? <button type="button" className={`${r.groupeT} ${r.groupeBtn}`} aria-expanded={!replie} onClick={() => basculerNon(x.id)}>{tete}<span className={r.voir}>{replie ? 'Voir pourquoi' : 'Replier'}<IcoP d={CHEVRON} t={14} e={2.4} /></span></button>
          : <div className={r.groupeT}>{tete}</div>}
        {!replie && <div className={r.cartes}>{l.map((y, k) => carte(y, k))}</div>}
      </div>
    );
  };

  /* ── Un rapprochement, plié ou déplié ── */
  const vueSeance = (x: Seance, i: number) => {
    const ouverte = estOuverte(x.id, i);
    const n = (v: AvisIA['v']) => x.lignes.filter(y => y.v === v).length;
    const ouiPossibles = x.lignes.filter(y => y.v === 'oui').map(y => parId.get(y.r)).filter((y): y is Acheteur => !!y && !presente(y.copie)).map(y => y.recherche.id);
    const tousOui = ouiPossibles.length > 0 && ouiPossibles.every(id => choisis.includes(id));
    return (
      <section key={x.id} id={i === 0 ? 'rb-derniere' : undefined} className={`${r.seance} ${ouverte ? r.seanceOuverte : ''}`} aria-label={`Rapprochement du ${dateRappro(x.le)}`}>
        <button type="button" className={r.seanceT} aria-expanded={ouverte} onClick={() => basculerSeance(x.id, i)}>
          <span className={r.seanceIc}><IcoP d={ETINCELLE} t={17} e={1.9} /></span>
          <span className={r.seanceTx}>
            <b>{`Rapprochement du ${dateRappro(x.le)}`}</b>
            <small>{x.tries
              ? `${x.total} ${pl(x.total, 'recherche ouverte', 'recherches ouvertes')} · ${x.lignes.length} ${pl(x.lignes.length, 'relue', 'relues')} en détail${x.gardee ? '' : ' · pas encore gardé'}`
              : `${x.total} ${pl(x.total, 'recherche ouverte', 'recherches ouvertes')} · personne ne passe le premier tri`}</small>
          </span>
          {x.lignes.length > 0 && (
            <span className={r.comptes}>
              {(['oui', 'a_voir', 'non'] as const).map(v => <span key={v} className={r.compte} data-v={v} data-zero={n(v) ? undefined : 'oui'}><i />{`${n(v)} ${MOT_IA[v].toLowerCase()}`}</span>)}
            </span>
          )}
          <span className={r.chev}><IcoP d={CHEVRON} t={18} e={2.2} /></span>
        </button>
        {ouverte && (
          <div className={r.seanceC}>
            {x.manquent > 0 && (
              <p className={r.alerte}><Ic n="info" t={14} /><span>{`${x.manquent} ${pl(x.manquent, 'dossier n’a', 'dossiers n’ont')} pas pu être ${pl(x.manquent, 'relu', 'relus')}${x.erreur ? ` (${x.erreur})` : ''}. Relance : il reprendra là où il s’est arrêté.`}</span></p>
            )}
            {!x.tries ? (
              <p className={r.seanceVide}>{fr(`Aucune recherche ouverte ne va avec ${ce} : trop cher pour eux, autre secteur, autre type… Regarde « Écartées au premier tri » plus bas, ou choisis toi-même un client.`)}</p>
            ) : (
              <>
                {peutEnvoyer && ouiPossibles.length > 0 && (
                  <div className={r.outils}>
                    <button type="button" className={r.cocherOui} onClick={() => { touche.current = true; setChoisis(c => (tousOui ? c.filter(id => !ouiPossibles.includes(id)) : [...new Set([...c, ...ouiPossibles])])); }}>
                      <Ic n="check" t={14} e={2.8} />{tousOui ? 'Décocher les oui' : `Cocher les oui (${ouiPossibles.length})`}
                    </button>
                    <span>{fr('Rien n’est coché d’office : tu choisis, puis « Envoyer… ».')}</span>
                  </div>
                )}
                {groupe(x, 'oui')}
                {groupe(x, 'a_voir')}
                {groupe(x, 'non')}
              </>
            )}
          </div>
        )}
      </section>
    );
  };

  const MAX_ANCIENS = 4;
  const vues = anciens ? toutes : toutes.slice(0, MAX_ANCIENS + 1);

  return (
    <div className={r.page}>
      {/* La question, et un seul bouton */}
      <section className={r.hero}>
        <div className={r.heroL}>
          <Illu />
          <div className={r.heroTx}>
            <h3>{`Qui, dans ta base, pourrait acheter ${ce} ?`}</h3>
            <p>{fr(tri.total > 1
              ? `Le rapprochement passe en revue les ${tri.total} recherches ouvertes de tes acheteurs, puis relit en détail celles qui peuvent aller : leurs indispensables, leur parcours, leurs comptes rendus de visite, face à toute la fiche du bien. Pour chacun : un avis, une note de potentiel sur 100, ses plus et ses moins.`
              : `Le rapprochement passe en revue les recherches ouvertes de tes acheteurs, puis relit en détail celles qui peuvent aller : leurs indispensables, leur parcours, leurs comptes rendus de visite, face à toute la fiche du bien. Pour chacun : un avis, une note de potentiel sur 100, ses plus et ses moins.`)}</p>
          </div>
        </div>

        {en ? (
          <Progression etapes={[
            { t: 'Le premier tri', etat: en.phase === 'tri' ? 'en' : 'fait',
              d: en.phase === 'tri' ? `Budget, secteur, type, surface : je compare ${ce} à tes ${tri.total} ${pl(tri.total, 'recherche ouverte', 'recherches ouvertes')}.` : en.tries ? `${tri.total} ${pl(tri.total, 'recherche ouverte', 'recherches ouvertes')} : ${en.tries} ${pl(en.tries, 'passe', 'passent')} le premier tri.` : `${tri.total} ${pl(tri.total, 'recherche ouverte', 'recherches ouvertes')} : aucune ne passe le premier tri.` },
            { t: 'La relecture de chaque dossier', etat: en.phase === 'tri' ? 'attente' : en.phase === 'relecture' ? 'en' : 'fait', fait: en.fait, total: en.tries,
              d: en.phase === 'tri' ? 'Indispensables, parcours, comptes rendus de visite, ce qu’ils ont dit des biens montrés.' : !en.tries ? 'Rien à relire.' : en.phase === 'relecture' ? `${Math.min(en.fait, en.tries)} sur ${en.tries} ${pl(en.tries, 'dossier relu', 'dossiers relus')}…` : `${en.tries} ${pl(en.tries, 'dossier relu', 'dossiers relus')}.` },
            { t: 'Le classement', etat: en.phase === 'fin' ? 'en' : 'attente', d: 'Oui, à voir, non : les meilleures chances d’abord.' },
          ]} />
        ) : (
          <div className={r.lancer}>
            <button type="button" className={r.lancerBtn} disabled={!peutLancer} onClick={() => { void lancer(); }}>
              <IcoP d={ETINCELLE} t={18} e={2} />{derniere ? 'Relancer le rapprochement' : 'Lancer le rapprochement'}
            </button>
            <button type="button" className={r.aideBtn} aria-expanded={aide} onClick={() => setAide(a => !a)}>
              <Ic n="info" t={15} />{aide ? 'Fermer' : 'Comment ça marche ?'}
            </button>
            <span className={r.indice}>{fr(tri.vide
              ? 'Renseigne au moins le type de bien ou son prix : sans eux, rien à comparer.'
              : !tri.total
                ? 'Aucune recherche ouverte dans ta base pour l’instant : dès qu’un acheteur sera suivi, tu pourras le lancer.'
                : derniere
                  ? (nouveaux > 0
                    ? `Le dernier date du ${dateRappro(derniere.le)}. Depuis, ${nouveaux} ${pl(nouveaux, 'recherche de plus passe', 'recherches de plus passent')} le premier tri.`
                    : `Le dernier date du ${dateRappro(derniere.le)}. Relancé, il ne relit que ce qui a changé.`)
                  : 'Rien n’est coché ni envoyé : tu choisis ensuite.')}</span>
          </div>
        )}

        {aide && !en && (
          <div className={r.aide}>
            <ol className={r.aideEtapes}>
              <li><b>{'Le premier tri'}</b><span>{'Les recherches ouvertes de tes acheteurs (actifs, prospects, en pause), du même type de bien. Écartées d’office : budget dépassé de plus de 10 %, ville hors de leurs secteurs, surface sous 90 % de leur minimum, pas assez de chambres, un indispensable qui manque.'}</span></li>
              <li><b>{'La relecture'}</b><span>{'Chaque dossier qui passe est relu comme tu le ferais : ses indispensables, ses précisions, son parcours, ses comptes rendus de visite, ce qu’il a dit des biens montrés, face à toute la fiche du bien et ta visite sur place. Ni nom, ni téléphone, ni adresse ne sont lus.'}</span></li>
              <li><b>{'Le résultat'}</b><span>{'Pour chacun, un avis : Oui, À voir ou Non, et une note de potentiel sur 100 : ses chances d’être intéressé. Puis une phrase, ses plus et ses moins. Jusqu’à 7 % au-dessus de son budget, ça se négocie : ce n’est pas un non.'}</span></li>
              <li><b>{'Gardé, daté'}</b><span>{'Chaque rapprochement reste ici, avec sa date, et dans l’historique du bien. Relancé, il ne relit que ce qui a changé : un nouvel acheteur, une recherche modifiée, le bien ou son prix.'}</span></li>
            </ol>
          </div>
        )}
        {souci.erreur && <p className={r.erreur}>{souci.erreur}</p>}
        {souci.info && <p className={r.info}><Ic n="info" t={14} /><span>{souci.info}</span></p>}
        {!peutEnvoyer && (
          <p className={r.verrou}><Ic n="cadenas" t={14} />{mode === 'pause' ? 'Vente en pause : le rapprochement reste possible, l’envoi reprend avec elle.' : mode === 'fini' ? 'Ce bien n’est plus en vente : les rapprochements restent, en lecture.' : 'L’envoi n’est pas possible d’ici.'}</p>
        )}
        {mode === 'avant' && peutEnvoyer && (
          <p className={r.info}><Ic n="info" t={14} /><span>{'Pas encore sous mandat : tu peux déjà le présenter. Il partira sans prix ; le prix arrivera chez l’acheteur à la signature du mandat.'}</span></p>
        )}
        {!toutes.length && onAutre && peutEnvoyer && !en && (
          <button type="button" className={r.autreLien} onClick={onAutre}><Ic n="plus" t={14} e={2.4} />{'Ou choisis toi-même un client'}</button>
        )}
      </section>

      {/* Les rapprochements, du plus récent au plus ancien */}
      {toutes.length > 0 && (
        <div className={r.seances}>
          <div className={r.seancesT}><h4>{toutes.length > 1 ? 'Tes rapprochements' : 'Ton rapprochement'}</h4><span>{toutes.length > 1 ? 'Le plus récent en haut. Clique sur une ligne pour la déplier ou la replier.' : 'Clique sur la ligne pour la replier.'}</span></div>
          {vues.map((x, i) => vueSeance(x, i))}
          {toutes.length > MAX_ANCIENS + 1 && (
            <button type="button" className={r.plus} onClick={() => setAnciens(v => !v)}>{anciens ? 'Replier les plus anciens' : `Voir les ${toutes.length - MAX_ANCIENS - 1} plus anciens`}</button>
          )}
        </div>
      )}

      {/* Écartées au premier tri : en direct, repliées */}
      {toutes.length > 0 && parRaison.length > 0 && (
        <section className={r.caches} aria-label="Écartées au premier tri">
          <button type="button" className={r.cachesT} aria-expanded={voirCaches} onClick={() => setVoirCaches(v => !v)}>
            <span className={r.cachesIc}><Ic n="groupe" t={17} /></span>
            <span className={r.cachesTx}>
              <b>{`Écartées au premier tri · ${tri.caches.length}`}</b>
              <small>{fr(`Elles ont une recherche ouverte, mais ${ce} ne leur va pas : trop cher pour eux, autre secteur, autre type… Le rapprochement ne les relit pas.`)}</small>
            </span>
            <span className={r.voir}>{voirCaches ? 'Replier' : 'Voir'}<IcoP d={CHEVRON} t={14} e={2.4} /></span>
          </button>
          {voirCaches && (
            <div className={r.carres}>
              {parRaison.map(([raison, l]) => {
                const tout = carres.includes(raison);
                const vus = tout ? l : l.slice(0, 2);
                return (
                  <div key={raison} className={r.carre}>
                    <div className={r.carreT}>
                      <span className={r.carreIc}><Ic n={ICONE_CACHE[raison]} t={17} /></span>
                      <strong>{l.length}</strong>
                    </div>
                    <b className={r.carreL}>{RAISONS_CACHE[raison].lib}</b>
                    <span className={r.carreS}>{RAISONS_CACHE[raison].sous}</span>
                    <div className={`${r.carreGens} ${tout ? r.carreGensTout : ''}`}>
                      {vus.map(c => (
                        <div key={c.recherche.id} className={r.gens}>
                          <span className={r.gensTx}>
                            <button type="button" className={r.gensNom} onClick={() => onFiche(c.client.id)}>{nomClient(c.client)}</button>
                            {c.detail ? <small>{c.detail}</small> : null}
                          </span>
                          {peutEnvoyer && (
                            <button type="button" className={r.gensEnvoi} title="Lui proposer quand même ce bien"
                              onClick={() => onAgir!([{ ...acheteurChoisi(bien, c.recherche, c.client, copies), horsListe: [RAISONS_CACHE[raison].lib.toLowerCase(), c.detail].filter(Boolean).join(', ') }])}>Envoyer</button>
                          )}
                        </div>
                      ))}
                    </div>
                    {l.length > 2 && <button type="button" className={r.carrePlus} onClick={() => setCarres(o => (o.includes(raison) ? o.filter(y => y !== raison) : [...o, raison]))}>{tout ? 'Replier' : `Voir les ${l.length}`}</button>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Écartés à la main (« Pas pour lui », V3.126) */}
      {ecartes.length > 0 && (
        <section className={r.ecartes} aria-label="Écartés par toi">
          <div className={r.ecartesT}>
            <b>{`Pas pour eux · ${ecartes.length}`}</b>
            <span>{fr('Tu les as écartés de ce bien : le rapprochement ne les relit plus et ne te les propose plus.')}</span>
          </div>
          {ecartes.map(y => (
            <div key={y.id} className={r.ecarte}>
              <button type="button" className={r.gensNom} onClick={() => y.client_id && onFiche(y.client_id)}>{y.qui || 'Un acheteur'}</button>
              <small>{`écarté le ${dateRappro(y.le)}`}</small>
              <button type="button" className={r.pasPour} disabled={!!ecartEn} onClick={() => { void remettre(y.id); }}>{'Le remettre'}</button>
            </div>
          ))}
        </section>
      )}

      {peutEnvoyer && toutes.length > 0 && (
        <div className={r.pied}>
          <span className={r.piedN}><b>{coches.length}</b>{pl(coches.length, 'acheteur coché', 'acheteurs cochés')}</span>
          <span className={r.piedAide}>{'« Envoyer… » te laisse choisir : dans leur sélection (rien ne part), dans leur espace, ou par mail.'}</span>
          {onAutre && (
            <button type="button" className={r.autre} onClick={onAutre}><Ic n="plus" t={15} e={2.4} />Un autre client…</button>
          )}
          <button type="button" className={r.btnOr} disabled={!coches.length} onClick={() => onAgir!(coches)}>
            <Ic n="envoyer" t={17} />Envoyer…{coches.length > 0 && <b className={r.btnN}>{coches.length}</b>}
          </button>
        </div>
      )}
    </div>
  );
}
