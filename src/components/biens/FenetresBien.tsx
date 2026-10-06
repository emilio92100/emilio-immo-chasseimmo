'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import AvatarContact, { personneDe } from '@/components/contacts/AvatarContact';
import { createPortal } from 'react-dom';
import { euros, jourParis } from '@/lib/mandat';
import { num, txt, PERSONNE_VIDE } from '@/lib/actes';
import {
  argentBien, avantMandat, dateLongue as jourSuivi, estimationFaite, etapeDe, honorairesPour, montantActuel, pourcent, pretPourEstimer, texteEstimation, titreBien,
  type BienVente, type Donnees, type EtapeVente, type SuiviVente,
} from '@/lib/biens-vente';
import { Croix, Ic } from '@/components/documents/ApercuActe';
import { signalerEchec } from '@/lib/ecritures';
import { SaisieNombre, lireClients } from './ChampsBien';
import {
  ajouterSuivi, annulerMandatNote, changerEtape, cloreRelancesEstimation, estimationMiseDeCote, noterRdvEstimation, planifierEstimation, poserDansBien, type FaitRdv, cloreRappelsCompromis, cloreRelanceOffre, compromisTombe, creerNotaire, deposerPiece, enregistrerBien, enregistrerOffre, eurosSuivi, lireNotaires,
  corrigerActe, creneauxPris, deplacerVisiteCRM, deplacerVisiteLibre, creerFicheProprio, donneesProprio, doublonsContact, marquerVendeur, finaliserAcquereur, finaliserTransactionsAcquereur, ligneNotaires, lireNotaire, majPrixDansAnnonces, majSuivi, modifierOffre, nomClient, notaireDepuisContact, noterJalon, nouvelleVente, offresTombees, retirerAutresAcceptees, annulerVisitesPrevues, solderDemandesDuBien, pauseAcquereur, poserRappels, refuserAutresOffres, vendeurSigne, visiteAcheteur, visiteExterne,
  type CleRappel, type ClientMini, type CreneauPris, type VisiteRow, type ContactNotaire, type NotaireChoisi, type Rappel, type RechercheMini, type SuiteTombe,
} from './outils';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';

/* ═══ Les fenêtres de la fiche d'un bien ══════════════════════════════════
   Les changements d'étape (mandat, offre, compromis, vente, pause,
   retrait), le prix, une visite, une note. Chacune écrit ce qu'il faut et
   rend la main à la fiche, qui se recharge. Posées sur <body> : la page
   qui les contient est animée (transform), un élément fixe y serait
   prisonnier. */

/* La date du jour, à l'heure de Paris (pas en temps universel). V3.50 :
   c'était l'heure de l'appareil, malgré ce que disait ce commentaire. */
const aujourdhui = () => jourParis();
export const plusJours = (ymd: string, n: number) => {
  const x = new Date(`${ymd || aujourdhui()}T12:00:00`);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};

export function Fenetre({ sur, couleur, titre, sous, occupe, onFermer, children, pied, large, vive }: {
  sur?: string; couleur?: string; titre: string; sous?: string; occupe?: boolean;
  onFermer: () => void; children: ReactNode; pied: ReactNode; large?: boolean;
  /* `vive` : les choix avec leurs dessins et leurs animations (V3.16). */
  vive?: boolean;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !occupe) onFermer(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [occupe, onFermer]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className={s.fenetre} style={{ zIndex: 1000 }} onClick={e => { if (e.target === e.currentTarget && !occupe) onFermer(); }}>
      <div className={s.fenetreIn} style={large ? { width: 'min(760px, 100%)' } : undefined} role="dialog" aria-modal="true" aria-label={titre}>
        <div className={s.fenTete}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            {sur && <div className={b.surTitre}>{couleur && <span className={b.point} style={{ background: couleur }} />}{sur}</div>}
            <h3>{titre}</h3>
            {sous && <p>{sous}</p>}
          </div>
          <button type="button" className={s.panFermer} aria-label="Fermer" disabled={occupe} onClick={onFermer}><Croix /></button>
        </div>
        <div className={`${s.fenCorps} ${vive ? s.saisieVive : ''}`}>{children}</div>
        <div className={s.fenPied}>{pied}</div>
      </div>
    </div>,
    document.body,
  );
}

function Ch({ lib, children, large }: { lib: string; children: ReactNode; large?: boolean }) {
  return <label className={b.chF} style={large ? { gridColumn: '1 / -1' } : undefined}><span>{lib}</span>{children}</label>;
}
/* Pour des boutons (Pills) : pas de <label>, qui renverrait son clic au
   premier bouton. */
function ChG({ lib, children }: { lib: string; children: ReactNode }) {
  return <div className={b.chF} role="group" aria-label={lib}><span>{lib}</span>{children}</div>;
}
function Pills<T extends string>({ options, v, onChange }: { options: { v: T; l: string; ic?: string }[]; v: T | ''; onChange: (x: T) => void }) {
  return (
    <div className={s.pills} role="radiogroup">
      {options.map(o => (
        <button key={o.v} type="button" role="radio" aria-checked={v === o.v} className={`${s.pill} ${v === o.v ? s.pillOn : ''}`} onClick={() => onChange(o.v)}>{o.ic && <Ic n={o.ic} t={15} />}{o.l}</button>
      ))}
    </div>
  );
}
const Erreur = ({ t }: { t: string }) => (t ? <div className={s.erreur}>{t}</div> : null);
const resume = (bien: BienVente) => [titreBien(bien.donnees || {}), bien.ville, bien.prix ? `affiché ${euros(bien.prix)}` : ''].filter(Boolean).join(' · ');

/* ══ Choisir un acheteur ═════════════════════════════════════════════════
   D'abord ceux qui connaissent déjà le bien, puis ceux qui correspondent ;
   on peut chercher n'importe quel client (sa recherche active vient avec). */
export type OptionAcheteur = { cle: string; clientId: string; rechercheId: string | null; nom: string; sous: string; note?: number };
export type ChoixA = { mode: 'crm'; o: OptionAcheteur } | { mode: 'libre'; nom: string; tel: string } | null;

const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function ChoixAcheteur({ options, recherches, choix, onChoix, libre }: {
  options: OptionAcheteur[]; recherches: RechercheMini[]; choix: ChoixA; onChoix: (c: ChoixA) => void; libre: string;
}) {
  const [mode, setMode] = useState<'crm' | 'libre'>(choix?.mode === 'crm' ? 'crm' : choix?.mode === 'libre' || !options.length ? 'libre' : 'crm');
  const [q, setQ] = useState('');
  const [clients, setClients] = useState<ClientMini[] | null>(null);
  useEffect(() => {
    if (mode !== 'crm' || clients) return;
    let vivant = true;
    lireClients().then(l => { if (vivant) setClients(l); }).catch(() => { if (vivant) setClients([]); });
    return () => { vivant = false; };
  }, [mode, clients]);
  const liste = useMemo(() => {
    const t = sansAccent(q.trim());
    /* L'acquéreur déjà choisi (une offre qu'on corrige, V3.45) reste en tête. */
    if (t.length < 2) return choix?.mode === 'crm' && !options.some(o => o.cle === choix.o.cle) ? [choix.o, ...options.slice(0, 7)] : options.slice(0, 8);
    const dejaLa = options.filter(o => sansAccent(o.nom).includes(t));
    const autres = (clients || []).filter(c => !options.some(o => o.clientId === c.id) && sansAccent(`${c.prenom} ${c.nom} ${c.nom} ${c.prenom}`).includes(t)).slice(0, 6)
      .map(c => {
        const r = recherches.find(x => x.client_id === c.id);
        return { cle: `c-${c.id}`, clientId: c.id, rechercheId: r?.id || null, nom: nomClient(c), sous: r ? `Recherche : ${r.nom || 'en cours'}` : 'Aucune recherche active' };
      });
    return [...dejaLa, ...autres];
  }, [q, options, clients, recherches, choix]);
  const libreNom = choix?.mode === 'libre' ? choix.nom : '';
  const libreTel = choix?.mode === 'libre' ? choix.tel : '';

  return (
    <div className={b.groupe}>
      <div className={b.groupeT}><Ic n="personne" t={14} />{libre}</div>
      <div className={b.bascule} role="group">
        <button type="button" aria-pressed={mode === 'crm'} onClick={() => { setMode('crm'); onChoix(null); }}>Un acheteur suivi</button>
        <button type="button" aria-pressed={mode === 'libre'} onClick={() => { setMode('libre'); onChoix({ mode: 'libre', nom: '', tel: '' }); }}>Quelqu’un hors du CRM</button>
      </div>
      {mode === 'crm' ? (
        <>
          <input className={s.cherche} value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un client du CRM…" aria-label="Chercher un client" />
          <div className={b.qui}>
            {liste.length === 0 && <div className={b.vide}>{q.trim().length >= 2 ? 'Aucun client à ce nom.' : 'Aucun acheteur ne connaît encore ce bien : cherche-le par son nom.'}</div>}
            {liste.map(o => {
              const on = choix?.mode === 'crm' && choix.o.cle === o.cle;
              return (
                <button key={o.cle} type="button" className={`${b.quiL} ${on ? b.quiOn : ''}`} onClick={() => onChoix({ mode: 'crm', o })}>
                  <AvatarContact c={personneDe(o.nom)} teinte={{ bg: '', fg: '#e7cf8a' }} className={`${b.avatar} ${b.avatarPetit}`} libre />
                  <div><b>{o.nom}</b><small>{o.sous}</small></div>
                  {on && <Ic n="check" t={16} e={2.6} />}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className={b.g2}>
          <Ch lib="Son nom"><input className={s.input} value={libreNom} placeholder="Ex : Couple Nguyen (SeLoger)" onChange={e => onChoix({ mode: 'libre', nom: e.target.value, tel: libreTel })} /></Ch>
          <Ch lib="Son téléphone"><input className={s.input} value={libreTel} inputMode="tel" placeholder="Facultatif" onChange={e => onChoix({ mode: 'libre', nom: libreNom, tel: e.target.value })} /></Ch>
        </div>
      )}
    </div>
  );
}

/* ══ Un nouveau bien : où en est-il ? ════════════════════════════════════
   Le choix décide des questions de l'éditeur : un bien « à suivre » a tout
   sauf le prix ; une estimation ajoute la fourchette et le prix conseillé ;
   le mandat, les honoraires et l'annonce. */
const DEPARTS: { k: EtapeVente; ic: string; t: string; s: string }[] = [
  { k: 'a_suivre', ic: 'drapeau', t: 'À suivre', s: 'Un propriétaire pense vendre : lui, son bien, ta visite. Pas encore de prix.' },
  { k: 'estimation', ic: 'regle', t: 'Une estimation', s: 'Le rendez-vous est pris ou fait : tout le bien, puis la fourchette et le prix conseillé.' },
  { k: 'mandat', ic: 'plume', t: 'Un mandat signé', s: 'Il est en vente : le prix, les honoraires, l’annonce, les visites.' },
  /* V3.79 : sans mandat ni propriétaire, juste la fiche puis l'annonce. */
  { k: 'annonce_type', ic: 'megaphone', t: 'Une annonce type', s: 'Une annonce proche d’un bien qu’on ne peut pas diffuser, pour faire venir des acheteurs. Sans mandat ni propriétaire.' },
];
/* V3.50 : `existants` — le propriétaire a déjà un bien en cours. On le dit
   avant d'en créer un second : « Ouvrir la fiche existante », ou choisir
   l'étape pour créer quand même. */
export function FenNouveau({ occupe, erreur, pour, existants = [], onOuvrir, onFermer, onChoisir }: {
  occupe: boolean; erreur: string; pour?: string; onFermer: () => void; onChoisir: (e: EtapeVente) => void;
  existants?: BienVente[]; onOuvrir?: (id: string) => void;
}) {
  return (
    <Fenetre sur={pour ? `Le bien de ${pour}` : undefined} titre="Nouveau bien : où en est-il ?" sous="Le formulaire ne pose que les questions utiles à cette étape. Les autres arrivent quand le bien avance." occupe={occupe} onFermer={onFermer}
      pied={<button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>}>
      {existants.length > 0 && (
        <div className={`${b.ventile} ${b.ventileManque}`}>
          <Ic n="info" t={16} />
          <span>
            <b>{`${pour || 'Ce propriétaire'} a déjà ${existants.length > 1 ? `${existants.length} biens en cours` : 'un bien en cours'}.`}</b>
            {existants.map(x => (
              <span key={x.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span>{[x.titre || titreBien(x.donnees || {}), x.adresse || x.ville || '', etapeDe(x.etape).court, x.reference || ''].filter(Boolean).join(' · ')}</span>
                {onOuvrir && <button type="button" className={b.lien} disabled={occupe} onClick={() => onOuvrir(x.id)}>Ouvrir la fiche existante</button>}
              </span>
            ))}
            <small className={b.ventileNet} style={{ color: '#92400e' }}>Un autre bien à lui ? Choisis l’étape ci-dessous pour le créer quand même.</small>
          </span>
        </div>
      )}
      <div className={b.departs}>
        {DEPARTS.map(x => (
          <button key={x.k} type="button" className={b.depart} disabled={occupe} onClick={() => onChoisir(x.k)}>
            <span className={b.departIc} style={{ color: etapeDe(x.k).c, background: `${etapeDe(x.k).c}14` }}><Ic n={x.ic} t={22} /></span>
            <span><b>{x.t}</b><small>{x.s}</small></span>
            <Ic n="droite" t={16} e={2.4} />
          </button>
        ))}
      </div>
      {occupe && <div className={s.note}>Création…</div>}
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ══ Le montant de l'estimation (V3.16) ═════════════════════════════════
   La fourchette et le prix conseillé ; en face, ce que le propriétaire
   espère, et le prix au m². Sert au passage en estimation et à « Définir
   l'estimation », depuis la fiche. */
export type Estim = { basse: number | null; haute: number | null; prix: number | null; souhaite: number | null };
export const lireEstim = (d: Donnees): Estim => ({ basse: num(d, 'estimBasse'), haute: num(d, 'estimHaute'), prix: num(d, 'prix'), souhaite: num(d, 'prixSouhaite') });
const versDonnees = (e: Estim): Donnees => ({ estimBasse: e.basse, estimHaute: e.haute, prix: e.prix, prixSouhaite: e.souhaite });
const arrondi = (x: number) => Math.round(x / 1000) * 1000;

/* La fourchette en image : la bande, le prix conseillé, le prix espéré. */
export function JaugeEstimation({ e }: { e: Estim }) {
  if (!e.basse || !e.haute || e.basse > e.haute) return null;
  const vals = [e.basse, e.haute, e.prix, e.souhaite].filter((x): x is number => !!x);
  const min = Math.min(...vals), max = Math.max(...vals);
  const marge = (max - min) * 0.2 || max * 0.04;
  const lo = min - marge, hi = max + marge;
  const pos = (x: number) => ((x - lo) / (hi - lo)) * 100;
  return (
    <div className={b.jEst}>
      <div className={b.jEstPiste}>
        <span className={b.jEstBande} style={{ left: `${pos(e.basse)}%`, width: `${pos(e.haute) - pos(e.basse)}%` }} />
        {e.souhaite ? <span className={b.jEstProprio} style={{ left: `${pos(e.souhaite)}%` }} title="Prix espéré par le propriétaire" /> : null}
        {e.prix ? <span className={b.jEstPrix} style={{ left: `${pos(e.prix)}%` }} title="Prix conseillé" /> : null}
      </div>
      <div className={b.jEstLeg}>
        <span><i className={b.jlBande} />Fourchette</span>
        {e.prix ? <span><i className={b.jlPrix} />Prix conseillé</span> : null}
        {e.souhaite ? <span><i className={b.jlProprio} />Espéré par le propriétaire</span> : null}
      </div>
    </div>
  );
}

function SaisieEstimation({ d, e, onChange }: { d: Donnees; e: Estim; onChange: (e: Estim) => void }) {
  const surf = num(d, 'carrez') || num(d, 'surface');
  const parM2 = (x: number | null) => (x && surf ? `${euros(Math.round(x / surf))} / m²` : '');
  const milieu = e.basse && e.haute && e.basse <= e.haute ? arrondi((e.basse + e.haute) / 2) : null;
  const ecart = e.prix && e.souhaite ? ((e.souhaite - e.prix) / e.prix) * 100 : null;
  const a = argentBien({ ...d, prix: e.prix });
  return (
    <div className={b.estim}>
      <div className={b.estimG}>
        <div className={b.estimCase}>
          <span className={b.estimLib}><Ic n="bas" t={15} />Fourchette basse</span>
          <SaisieNombre v={e.basse} euros unite="€" off={false} onChange={x => onChange({ ...e, basse: x })} ph="Ex : 850 000" lib="Fourchette basse" />
          {parM2(e.basse) && <small>{parM2(e.basse)}</small>}
        </div>
        <div className={b.estimCase}>
          <span className={b.estimLib}><Ic n="haut" t={15} />Fourchette haute</span>
          <SaisieNombre v={e.haute} euros unite="€" off={false} onChange={x => onChange({ ...e, haute: x })} ph="Ex : 900 000" lib="Fourchette haute" />
          {parM2(e.haute) && <small>{parM2(e.haute)}</small>}
        </div>
      </div>
      <div className={b.estimG}>
        <div className={`${b.estimCase} ${b.estimConseil}`}>
          <span className={b.estimLib}><Ic n="etiquette" t={15} />Prix conseillé</span>
          <SaisieNombre v={e.prix} euros unite="€" off={false} onChange={x => onChange({ ...e, prix: x })} ph={milieu ? `Ex : ${euros(milieu)}` : 'Le prix que tu lui conseilles'} lib="Prix conseillé" />
          {!e.prix && milieu ? <button type="button" className={b.lien} style={{ alignSelf: 'flex-start' }} onClick={() => onChange({ ...e, prix: milieu })}>{`Prendre le milieu : ${euros(milieu)}`}</button>
            : parM2(e.prix) ? <small>{parM2(e.prix)}</small> : null}
        </div>
        <div className={b.estimCase}>
          <span className={b.estimLib}><Ic n="personne" t={15} />Espéré par le propriétaire</span>
          <SaisieNombre v={e.souhaite} euros unite="€" off={false} onChange={x => onChange({ ...e, souhaite: x })} ph="S’il l’a dit" lib="Prix espéré par le propriétaire" />
          {ecart !== null && Math.abs(ecart) >= 0.5 ? <small className={ecart > 5 ? b.estimAlerte : undefined}>{`${pourcent(Math.abs(Math.round(ecart * 10) / 10))} ${ecart > 0 ? 'au-dessus' : 'en dessous'} de ton prix conseillé`}</small> : null}
        </div>
      </div>
      {e.basse && e.haute && e.basse > e.haute ? <div className={`${b.ventile} ${b.ventileManque}`}><Ic n="info" t={15} /><span>La fourchette basse est au-dessus de la haute.</span></div> : null}
      <JaugeEstimation e={e} />
      {e.prix && a.hono !== null && a.net ? <div className={b.calc}>{'Avec les honoraires de la fiche : '}<b>{`${euros(a.net)} net vendeur`}</b>{` · ${euros(a.hono)} d’honoraires`}</div> : null}
    </div>
  );
}

/* Pour bien estimer : ce que la fiche dit déjà, ce qui manque. */
function PretPourEstimer({ d }: { d: Donnees }) {
  const l = pretPourEstimer(d);
  const manque = l.filter(x => !x.ok).length;
  return (
    <div className={b.groupe}>
      <div className={b.groupeT}><Ic n="liste" t={14} />{manque ? `Pour bien estimer · ${manque} à compléter` : 'Pour bien estimer · tout y est'}</div>
      <div className={b.pret}>
        {l.map(x => (
          <span key={x.l} className={`${b.pretL} ${x.ok ? b.pretOk : ''}`}>
            <Ic n={x.ok ? 'check' : x.ic} t={14} e={x.ok ? 2.8 : 1.9} />{x.l}
          </span>
        ))}
      </div>
      {manque > 0 && <div className={b.calc}>Ce qui manque se complète dans « Modifier », ou pendant la visite sur place.</div>}
    </div>
  );
}

/* ── Le rendez-vous d'estimation : le jour et l'heure (V3.50) ──
   Il va dans l'agenda (planifierEstimation, outils.ts). Ce qui va se passer
   est dit dessous : ajouté, déplacé, retiré de l'agenda, ou une date passée. */
export type AvantRdv = { date: string; heure: string; rdvId: string };
export const avantRdv = (d: Donnees): AvantRdv => ({ date: txt(d, 'rdvEstimation'), heure: txt(d, 'rdvEstimationHeure'), rdvId: txt(d, 'rdvEstimationRdv') });
/* Une heure à demander : une date nouvelle (ou changée), pas encore passée. */
export const heureManque = (date: string, heure: string, avant: AvantRdv) => !!date && !heure && date >= aujourdhui() && date !== avant.date;
function ChampRdv({ lib, date, heure, onDate, onHeure, avant }: {
  lib: string; date: string; heure: string; onDate: (x: string) => void; onHeure: (x: string) => void; avant: AvantRdv;
}) {
  const passe = !!date && date < aujourdhui();
  const change = date !== avant.date || heure !== avant.heure;
  const mot = !date ? (avant.rdvId ? 'Sans date, le rendez-vous est retiré de ton agenda.' : '')
    : passe ? (date === avant.date ? '' : 'Cette date est passée : un rendez-vous déjà fait ? Il est noté tel quel.')
      : !heure ? (date === avant.date ? 'Sans heure, il n’est pas dans ton agenda : ajoute-la pour l’y mettre.' : 'Il manque l’heure : elle est nécessaire pour mettre le rendez-vous dans ton agenda.')
        : avant.rdvId ? (change ? 'Le rendez-vous se déplace dans ton agenda.' : 'Il est dans ton agenda.')
          : 'Il s’ajoute à ton agenda, avec l’adresse du bien.';
  return (
    <div className={b.chF} role="group" aria-label={lib}>
      <span>{lib}</span>
      <div className={b.g2}>
        <input className={s.input} type="date" value={date} onChange={x => onDate(x.target.value)} aria-label="Le jour" />
        <input className={s.input} type="time" value={heure} onChange={x => onHeure(x.target.value)} aria-label="L’heure" disabled={!date} />
      </div>
      {mot && (passe && date !== avant.date
        ? <div className={`${b.ventile} ${b.ventileManque}`}><Ic n="info" t={15} /><span>{mot}</span></div>
        : <div className={b.calc}>{mot}</div>)}
    </div>
  );
}

/* ══ Un bien à suivre passe à l'estimation ═══════════════════════════════
   Le rendez-vous, et le montant si on l'a déjà (sinon : « Définir
   l'estimation », sur la fiche, quand il viendra).
   V3.50 : le rendez-vous a son heure et va dans l'agenda ; le Suivi du
   propriétaire le dit. `reprise` : le bien a déjà eu une estimation (mise en
   attente, ou retiré avant le mandat) — l'ancien parcours (rendez-vous,
   visite, avis) part dans l'historique et le nouveau repart de zéro, sinon
   la fiche le montrait déjà fait. */
export type CycleEstimation = { rdv: string; visite: string; avis: string };
export function FenEstimation({ bien, reprise = null, onFermer, onFait }: { bien: BienVente; reprise?: CycleEstimation | null; onFermer: () => void; onFait: (b: BienVente) => void }) {
  const d = bien.donnees || {};
  const [repartir, setRepartir] = useState(!!reprise);
  const avant = repartir ? { date: '', heure: '', rdvId: '' } : avantRdv(d);
  const [rdv, setRdv] = useState(reprise ? '' : txt(d, 'rdvEstimation'));
  const [heure, setHeure] = useState(reprise ? '' : txt(d, 'rdvEstimationHeure'));
  const [maintenant, setMaintenant] = useState<'oui' | 'non'>(estimationFaite(d) && !reprise ? 'oui' : 'non');
  const [e, setE] = useState<Estim>(() => lireEstim(d));
  const [note, setNote] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const basculerRepartir = (v: boolean) => {
    setRepartir(v);
    setRdv(v ? '' : txt(d, 'rdvEstimation')); setHeure(v ? '' : txt(d, 'rdvEstimationHeure'));
  };
  async function valider() {
    if (maintenant === 'oui' && e.basse && e.haute && e.basse > e.haute) { setErreur('La fourchette basse est au-dessus de la haute.'); return; }
    if (heureManque(rdv, heure, avant)) { setErreur('Il manque l’heure du rendez-vous : elle est nécessaire pour le mettre dans ton agenda.'); return; }
    setOccupe(true); setErreur('');
    const montant = maintenant === 'oui' && (e.basse || e.haute || e.prix);
    /* Repartir de zéro : l'ancien rendez-vous, la visite et l'avis quittent la fiche. */
    const vide: Donnees = repartir ? { rdvEstimation: '', rdvEstimationHeure: '', rdvEstimationRdv: '', visiteLe: '', avisEnvoye: '' } : {};
    const base: Donnees = { ...d, ...vide };
    let plan: { donnees: Donnees; fait: FaitRdv } = { donnees: {}, fait: 'rien' };
    /* Repartir de zéro avec un ancien rendez-vous encore à venir dans
       l'agenda : il en sort (sinon il y resterait, relié à plus rien). */
    if (repartir && txt(d, 'rdvEstimationRdv') && txt(d, 'rdvEstimation') >= aujourdhui()) {
      try { await planifierEstimation(bien, { date: '', heure: '' }, d); }
      catch (x) { signalerEchec('L’ancien rendez-vous d’estimation, à retirer de l’agenda', (x as Error).message); }
    }
    try {
      if (rdv !== txt(base, 'rdvEstimation') || heure !== txt(base, 'rdvEstimationHeure')) plan = await planifierEstimation(bien, { date: rdv, heure }, base);
    } catch (x) { setErreur((x as Error).message); setOccupe(false); return; }
    try {
      const { bien: r } = await changerEtape(bien, 'estimation', {
        donnees: { ...base, rdvEstimation: rdv, ...plan.donnees, ...(maintenant === 'oui' ? versDonnees(e) : {}) },
        commentaire: [montant ? texteEstimation(e) : '', note.trim()].filter(Boolean).join('\n') || undefined,
        infos: { ...(rdv ? { rdv } : {}), ...(heure && rdv ? { heure } : {}), ...(montant ? { basse: e.basse, haute: e.haute, prix: e.prix } : {}), ...(repartir ? { nouveauCycle: true } : {}) },
      });
      if (repartir && reprise) {
        const t = [reprise.rdv ? `rendez-vous du ${jourSuivi(reprise.rdv)}` : '', reprise.visite ? `visite sur place du ${jourSuivi(reprise.visite)}` : '', reprise.avis ? `avis de valeur du ${jourSuivi(reprise.avis)}` : ''].filter(Boolean).join(' · ');
        try { await ajouterSuivi({ bien_id: bien.id, type: 'note', commentaire: t ? t.charAt(0).toUpperCase() + t.slice(1) : 'L’estimation précédente', donnees: { cycleEstimation: true, ...reprise } }); }
        catch (x) { signalerEchec('L’estimation précédente, dans l’historique', (x as Error).message); }
      }
      /* Le propriétaire est de nouveau dans le projet : la relance « recontacter » n'a plus d'objet. */
      await cloreRelancesEstimation(bien, repartir ? 'tout' : 'reprise');
      await noterRdvEstimation(r, plan.fait, { ...base, ...plan.donnees });
      onFait(r);
    } catch (x) {
      /* L'étape n'a pas changé : le rendez-vous qu'on venait de poser ne reste pas seul dans l'agenda. */
      if (plan.fait === 'cree') { try { await planifierEstimation(bien, { date: '', heure: '' }, { ...base, ...plan.donnees }); } catch (y) { signalerEchec('Le rendez-vous d’estimation, à retirer de l’agenda', (y as Error).message); } }
      setErreur((x as Error).message); setOccupe(false);
    }
  }
  return (
    <Fenetre sur="Le bien passe « Estimation »" couleur={etapeDe('estimation').c} titre={reprise ? 'On reprend l’estimation' : 'On passe à l’estimation'} sous={resume(bien)} occupe={occupe} onFermer={onFermer} vive
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : reprise ? 'Reprendre l’estimation' : 'Passer à l’estimation'}</button></>}>
      {reprise && (
        <label className={b.caseL}>
          <input type="checkbox" checked={repartir} onChange={x => basculerRepartir(x.target.checked)} />
          <span><b>Repartir de zéro</b>{` · ${[reprise.rdv ? `le rendez-vous du ${jourSuivi(reprise.rdv)}` : '', reprise.visite ? `la visite du ${jourSuivi(reprise.visite)}` : '', reprise.avis ? `l’avis de valeur du ${jourSuivi(reprise.avis)}` : ''].filter(Boolean).join(', ')} passent dans l’historique, et le parcours de l’estimation recommence. La description du bien et le montant restent.`}</span>
        </label>
      )}
      <ChampRdv lib="Rendez-vous d’estimation (facultatif)" date={rdv} heure={heure} onDate={setRdv} onHeure={setHeure} avant={avant} />
      <div className={b.groupe}>
        <div className={b.groupeT}><Ic n="euro" t={14} />Le montant de l’estimation</div>
        <Pills options={[{ v: 'oui', l: 'Je le donne maintenant', ic: 'etiquette' }, { v: 'non', l: 'Plus tard, après le rendez-vous', ic: 'horloge' }]} v={maintenant} onChange={setMaintenant} />
        {maintenant === 'oui'
          ? <SaisieEstimation d={d} e={e} onChange={setE} />
          : <div className={b.calc}>Tu le donneras depuis la fiche, avec le bouton <b>« Définir l’estimation »</b>. Il remplacera alors « Estimation à définir » sur la carte du bien.</div>}
      </div>
      <PretPourEstimer d={d} />
      <Ch lib="Commentaire (facultatif)"><textarea className={s.input} rows={2} value={note} onChange={x => setNote(x.target.value)} placeholder="Ce qu’il attend, ce qu’il faut préparer" /></Ch>
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ══ Définir (ou revoir) l'estimation, depuis la fiche ═══════════════════
   Le montant, le rendez-vous, l'avis de valeur. Un changement de montant
   laisse une ligne dans l'historique du bien (V3.50 : avec l'ancien).
   V3.50 : le rendez-vous a son heure et va dans l'agenda ; l'avis de valeur
   envoyé se note dans le Suivi du propriétaire et l'historique du bien, avec
   une relance une semaine après (enregistrerBien). */
export function FenDefinirEstimation({ bien, onFermer, onFait }: { bien: BienVente; onFermer: () => void; onFait: (b: BienVente) => void }) {
  const d = bien.donnees || {};
  const avant = lireEstim(d);
  const avRdv = avantRdv(d);
  const [e, setE] = useState<Estim>(avant);
  const [rdv, setRdv] = useState(avRdv.date);
  const [heure, setHeure] = useState(avRdv.heure);
  const [avis, setAvis] = useState(txt(d, 'avisEnvoye'));
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const dejaFaite = estimationFaite(d);
  const avisNeuf = !!avis && avis !== txt(d, 'avisEnvoye');
  const relanceLe = avisNeuf ? plusJours(avis, 7) : '';
  async function valider() {
    if (e.basse && e.haute && e.basse > e.haute) { setErreur('La fourchette basse est au-dessus de la haute.'); return; }
    if (heureManque(rdv, heure, avRdv)) { setErreur('Il manque l’heure du rendez-vous : elle est nécessaire pour le mettre dans ton agenda.'); return; }
    setOccupe(true); setErreur('');
    let plan: { donnees: Donnees; fait: FaitRdv } = { donnees: {}, fait: 'rien' };
    try {
      if (rdv !== avRdv.date || heure !== avRdv.heure) plan = await planifierEstimation(bien, { date: rdv, heure }, d);
    } catch (x) { setErreur((x as Error).message); setOccupe(false); return; }
    let r: BienVente;
    try { r = await enregistrerBien(bien.id, { ...d, ...versDonnees(e), rdvEstimation: rdv, ...plan.donnees, avisEnvoye: avis }, d, { rdvGere: true }); }
    catch (x) {
      /* Rien n'est enregistré sur le bien : le rendez-vous qu'on venait de poser quitte l'agenda. */
      if (plan.fait === 'cree') { try { await planifierEstimation(bien, { date: '', heure: '' }, { ...d, ...plan.donnees }); } catch (y) { signalerEchec('Le rendez-vous d’estimation, à retirer de l’agenda', (y as Error).message); } }
      setErreur((x as Error).message); setOccupe(false); return;
    }
    await noterRdvEstimation(r, plan.fait, { ...d, ...plan.donnees });
    if (avant.basse !== e.basse || avant.haute !== e.haute || avant.prix !== e.prix) {
      const avantTxt = dejaFaite ? texteEstimation(avant).replace(/^Estimation : /, '') : '';
      try { await ajouterSuivi({ bien_id: bien.id, type: 'note', commentaire: `${texteEstimation(e)}${avantTxt ? ` (avant : ${avantTxt})` : ''}`, donnees: { estimation: true, basse: e.basse, haute: e.haute, prix: e.prix, ...(dejaFaite ? { avant: { basse: avant.basse, haute: avant.haute, prix: avant.prix } } : {}) } }); }
      catch (x) { setErreur(`L’estimation est enregistrée, mais pas sa ligne d’historique : ${(x as Error).message}`); setOccupe(false); return; }
    }
    onFait(r);
  }
  return (
    <Fenetre sur="L’estimation" couleur={etapeDe('estimation').c} titre={dejaFaite ? 'Revoir l’estimation' : 'Définir l’estimation'} sous={resume(bien)} occupe={occupe} onFermer={onFermer} vive
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : 'Enregistrer'}</button></>}>
      <div className={b.groupe}>
        <div className={b.groupeT}><Ic n="euro" t={14} />Le montant</div>
        <SaisieEstimation d={d} e={e} onChange={setE} />
      </div>
      <ChampRdv lib="Rendez-vous d’estimation" date={rdv} heure={heure} onDate={setRdv} onHeure={setHeure} avant={avRdv} />
      <div className={b.g2}>
        <div className={b.chF}>
          <span>Avis de valeur envoyé le</span>
          <input className={s.input} type="date" value={avis} onChange={x => setAvis(x.target.value)} aria-label="Avis de valeur envoyé le" />
          {!avis && <button type="button" className={b.lien} style={{ alignSelf: 'flex-start' }} onClick={() => setAvis(aujourdhui())}>Envoyé aujourd’hui</button>}
          {avisNeuf && (bien.client_id
            ? <div className={b.calc}>{relanceLe >= aujourdhui() ? `Noté dans son suivi, et une relance le ${jourSuivi(relanceLe)} pour faire le point avec lui.` : 'Noté dans son suivi. La semaine est passée : pas de relance.'}</div>
            : <div className={b.calc}>Relie le propriétaire à sa fiche pour garder l’avis dans son suivi et recevoir une relance.</div>)}
        </div>
      </div>
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ── Le propriétaire, choisi dans la fenêtre du mandat (V3.50) ──
   Un mandat se signe avec un propriétaire : sans fiche reliée, son Suivi ne
   gardait aucune trace. On le cherche dans les contacts, ou on le crée ici
   (en vérifiant d'abord qu'il n'existe pas déjà). */
function ChoixProprio({ choisi, onChoisir }: { choisi: ClientMini | null; onChoisir: (c: ClientMini | null) => void }) {
  const [clients, setClients] = useState<ClientMini[] | null>(null);
  const [q, setQ] = useState('');
  const [nouveau, setNouveau] = useState<{ prenom: string; nom: string; tel: string; email: string } | null>(null);
  const [doublons, setDoublons] = useState<ClientMini[]>([]);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    let vivant = true;
    lireClients().then(l => { if (vivant) setClients(l); }).catch(e => { if (vivant) { setClients([]); setErreur((e as Error).message); } });
    return () => { vivant = false; };
  }, []);
  const t = sansAccent(q.trim());
  const liste = t.length >= 2 ? (clients || []).filter(c => sansAccent(`${c.prenom || ''} ${c.nom || ''} ${c.nom || ''} ${c.prenom || ''}`).includes(t)).slice(0, 6) : [];
  async function creer(quandMeme = false) {
    if (!nouveau || !(nouveau.nom.trim() || nouveau.prenom.trim())) { setErreur('Son nom ?'); return; }
    const p = { ...PERSONNE_VIDE, prenom: nouveau.prenom.trim(), nom: nouveau.nom.trim(), telephone: nouveau.tel.trim(), email: nouveau.email.trim().toLowerCase() };
    if (!quandMeme) {
      const l = doublonsContact(clients || [], p);
      if (l.length) { setDoublons(l); return; }
    }
    setOccupe(true); setErreur('');
    try {
      const c = await creerFicheProprio(p);
      setClients(x => [c, ...(x || [])]);
      onChoisir(c); setNouveau(null); setDoublons([]); setQ('');
    } catch (e) { setErreur((e as Error).message); }
    setOccupe(false);
  }
  if (choisi) {
    return (
      <div className={b.qui}>
        <div className={`${b.quiL} ${b.quiOn}`}>
          <AvatarContact c={personneDe(nomClient(choisi))} teinte={{ bg: '', fg: '#e7cf8a' }} className={`${b.avatar} ${b.avatarPetit}`} libre />
          <div><b>{nomClient(choisi)}</b><small>{[choisi.telephones?.[0], choisi.emails?.[0]].filter(Boolean).join(' · ') || 'Fiche du CRM'}</small></div>
          <button type="button" className={b.notaireChanger} onClick={() => onChoisir(null)}>Changer</button>
        </div>
      </div>
    );
  }
  if (nouveau) {
    return (
      <div className={b.notaire}>
        <div className={b.g2}>
          <Ch lib="Prénom"><input className={s.input} value={nouveau.prenom} onChange={e => setNouveau({ ...nouveau, prenom: e.target.value })} /></Ch>
          <Ch lib="Nom"><input className={s.input} value={nouveau.nom} autoFocus onChange={e => setNouveau({ ...nouveau, nom: e.target.value })} /></Ch>
          <Ch lib="Téléphone"><input className={s.input} value={nouveau.tel} inputMode="tel" onChange={e => setNouveau({ ...nouveau, tel: e.target.value })} /></Ch>
          <Ch lib="E-mail"><input className={s.input} value={nouveau.email} inputMode="email" onChange={e => setNouveau({ ...nouveau, email: e.target.value })} /></Ch>
        </div>
        {doublons.length > 0 && (
          <div className={`${b.ventile} ${b.ventileManque}`}>
            <Ic n="info" t={15} />
            <span>
              <b>{doublons.length > 1 ? 'Ces contacts existent peut-être déjà :' : 'Ce contact existe peut-être déjà :'}</b>
              {doublons.map(c => (
                <span key={c.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span>{[nomClient(c), c.telephones?.[0], c.emails?.[0]].filter(Boolean).join(' · ')}</span>
                  <button type="button" className={b.lien} onClick={() => { onChoisir(c); setNouveau(null); setDoublons([]); }}>Utiliser cette fiche</button>
                </span>
              ))}
            </span>
          </div>
        )}
        <Erreur t={erreur} />
        <div className={b.notaireBtns}>
          <button type="button" className={s.btn} disabled={occupe} onClick={() => { setNouveau(null); setDoublons([]); }}>Annuler</button>
          <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={() => { void creer(doublons.length > 0); }}><Ic n="check" t={14} e={2.4} />{occupe ? 'Création…' : doublons.length ? 'Créer quand même' : 'Créer sa fiche'}</button>
        </div>
      </div>
    );
  }
  return (
    <>
      <input className={s.cherche} value={q} onChange={e => setQ(e.target.value)} placeholder={clients === null ? 'Chargement des contacts…' : 'Chercher dans tes contacts : nom ou prénom…'} aria-label="Chercher le propriétaire" />
      {liste.length > 0 && (
        <div className={b.qui}>
          {liste.map(c => (
            <button key={c.id} type="button" className={b.quiL} onClick={() => onChoisir(c)}>
              <AvatarContact c={personneDe(nomClient(c))} teinte={{ bg: '', fg: '#e7cf8a' }} className={`${b.avatar} ${b.avatarPetit}`} libre />
              <div><b>{nomClient(c)}</b><small>{[c.telephones?.[0], c.emails?.[0]].filter(Boolean).join(' · ')}</small></div>
            </button>
          ))}
        </div>
      )}
      {q.trim().length >= 2 && clients && !liste.length && <div className={b.vide}>{`Personne ne s’appelle « ${q.trim()} » dans tes contacts.`}</div>}
      <button type="button" className={b.notaireAjout} onClick={() => {
        const mots = q.trim().split(/\s+/).filter(Boolean);
        setNouveau(mots.length > 1 ? { prenom: mots[0], nom: mots.slice(1).join(' '), tel: '', email: '' } : { prenom: '', nom: mots[0] || '', tel: '', email: '' });
      }}><Ic n="plus" t={13} e={2.6} />Nouveau contact</button>
      <Erreur t={erreur} />
    </>
  );
}

/* ══ Le mandat est signé (ou : remettre en vente) ═════════════════════════
   V3.50 : `creation` — « Nouveau bien › Un mandat signé » passe par ici
   (avant, le bien se créait « En vente » sans prix, sans honoraires, sans
   propriétaire). Le propriétaire y est obligatoire ; ailleurs, sans fiche
   reliée, la fenêtre le propose. */
export function FenMandat({ bien, offres = [], creation = false, onFermer, onFait }: { bien: BienVente; offres?: SuiviVente[]; creation?: boolean; onFermer: () => void; onFait: (b: BienVente) => void }) {
  const d = bien.donnees || {};
  /* « L'offre est tombée » (V3.47) : les offres encore en jeu passent
     « retirées » (case cochée d'office), leurs relances se closent. */
  const enJeu = bien.etape === 'offre' ? offres.filter(o => o.statut === 'acceptee' || o.statut === 'en_attente' || o.statut === 'contre' || !o.statut) : [];
  const [retirerOffres, setRetirerOffres] = useState(true);
  /* Une reprise : le bien a déjà été en vente, mandat signé. Pas quand il
     est passé « En vente » avant la signature, ni retiré avant tout mandat
     (V3.42) : c'est alors la signature qu'on note. */
  const sansMandat = !txt(d, 'mandatDate') && (bien.etape === 'mandat' || (bien.etape === 'retire' && !bien.en_vente_le));
  const reprise = !creation && !avantMandat(bien.etape) && !sansMandat;
  /* Le propriétaire (V3.50) : à relier quand le bien n'en a pas. */
  const demandeProprio = !reprise && !bien.client_id;
  const [proprio, setProprio] = useState<ClientMini | null>(null);
  const [type, setType] = useState<'simple' | 'semi' | 'exclusif' | ''>((d.mandatType as 'simple') || '');
  const [numero, setNumero] = useState(txt(d, 'mandatNumero'));
  const [date, setDate] = useState(txt(d, 'mandatDate') || aujourdhui());
  const [finM, setFinM] = useState(txt(d, 'mandatFin'));
  const [prix, setPrix] = useState<number | null>(num(d, 'prix'));
  /* Les honoraires (V3.15) : à la charge de qui, en % ou au forfait. À la
     charge de l'acquéreur, l'annonce doit donner le % et le prix hors
     honoraires : on les demande ici, au moment où le prix est fixé. */
  const [charge, setCharge] = useState<'acquereur' | 'vendeur'>(d.charge === 'vendeur' ? 'vendeur' : 'acquereur');
  const [honoMode, setHonoMode] = useState<'taux' | 'forfait'>(d.honoMode === 'forfait' ? 'forfait' : 'taux');
  const [taux, setTaux] = useState<number | null>(num(d, 'taux'));
  const [forfait, setForfait] = useState<number | null>(num(d, 'forfait'));
  const [raison, setRaison] = useState('');
  /* Le mandat signé (scan ou PDF), facultatif (V3.32) : gardé avec le bien,
     à retélécharger depuis l'onglet Documents. */
  const [scan, setScan] = useState<File | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const hono: Donnees = { charge, honoMode, ...(honoMode === 'taux' ? { taux } : { forfait }) };
  const a = argentBien({ ...d, prix, ...hono });
  const ventile = !!(a.prix && a.net !== null && a.hono !== null && a.taux !== null && a.net > 0);
  async function valider() {
    if (!type) { setErreur('Choisis le type de mandat.'); return; }
    if (!prix) { setErreur('Écris le prix affiché.'); return; }
    if (charge === 'acquereur' && !ventile) { setErreur('Honoraires à la charge de l’acquéreur : écris le taux ou le forfait. L’annonce doit donner le pourcentage et le prix hors honoraires.'); return; }
    if (creation && demandeProprio && !proprio) { setErreur('Le propriétaire ? Choisis sa fiche, ou crée-la : c’est lui qui signe le mandat.'); return; }
    setOccupe(true); setErreur('');
    try {
      /* Le prix conseillé à l'estimation est gardé à part (V3.32) : « prix »
         devient le prix affiché, et l'onglet Le bien montre encore ce qui
         avait été estimé. */
      const conseille = num(d, 'prixConseille') ?? (avantMandat(bien.etape) || (bien.etape === 'retire' && !bien.en_vente_le) ? num(d, 'prix') : null);
      const f = scan ? await deposerPiece(bien.id, 'mandatsigne', scan) : null;
      const donnees: Donnees = { ...d, mandatType: type, mandatNumero: numero.trim(), mandatDate: date, mandatFin: finM, prix, ...hono, ...(conseille ? { prixConseille: conseille } : {}),
        ...(f && scan ? { mandatFichier: { chemin: f.chemin, nom: f.nom, taille: scan.size, le: aujourdhui() } } : {}),
        ...(proprio ? donneesProprio(proprio) : {}) };
      const { bien: r } = await changerEtape(bien, 'mandat', { donnees, commentaire: raison.trim() || undefined, infos: { type, numero: numero.trim(), date, fin: finM, prix, reprise, ...(creation ? { depuis: 'creation' } : {}) } });
      /* V3.50 : le propriétaire relié ici devient « vendeur » dans ses contacts. */
      const vendeurId = r.client_id || null;
      if (vendeurId && (proprio || creation)) await marquerVendeur(vendeurId);
      const titre = bien.titre || titreBien(d);
      /* Le compromis est tombé : ses rappels se closent (V3.45), la recherche
         de l'acquéreur reprend, les deux Suivis le disent (V3.47). */
      if (bien.etape === 'compromis') { await cloreRappelsCompromis(bien.id); await compromisTombe(bien, titre, raison); }
      if (enJeu.length && retirerOffres) await offresTombees(bien, enJeu);
      /* V3.50 : le mandat est signé — « faire le point » et « recontacter » n'ont plus d'objet. */
      await cloreRelancesEstimation(bien);
      /* Le mandat signé, dans le Suivi du vendeur (V3.47). V3.50 : celui relié ici aussi. */
      if (!reprise && vendeurId) {
        const sorte = type === 'exclusif' ? 'exclusif' : type === 'semi' ? 'semi-exclusif' : 'simple';
        await noterJalon(r, 'mandat', { vendeur: {
          clientId: vendeurId, titre: `📋 Mandat de vente signé le ${jourSuivi(date)}`,
          texte: [titre, `Mandat ${sorte}${numero.trim() ? ` n° ${numero.trim()}` : ''}${finM ? ` · jusqu’au ${jourSuivi(finM)}` : ''}`, `Prix affiché : ${eurosSuivi(prix)}`],
        } });
      }
      onFait(r);
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre sur={creation ? 'Nouveau bien · un mandat signé' : reprise ? 'Le bien repasse « En vente »' : 'Le bien passe « En vente »'} couleur={etapeDe('mandat').c}
      titre={reprise ? 'Remettre en vente' : 'Le mandat est signé'} sous={creation ? 'Le mandat, le prix, les honoraires et le propriétaire : le bien entre « En vente ». La description se remplit juste après.' : resume(bien)} occupe={occupe} onFermer={onFermer}
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : reprise ? 'Remettre en vente' : 'Mettre en vente'}</button></>}>
      <div className={b.groupe}>
        <div className={b.groupeT}><Ic n="plume" t={14} />Le mandat</div>
        <Pills options={[{ v: 'simple', l: 'Simple' }, { v: 'semi', l: 'Semi-exclusif' }, { v: 'exclusif', l: 'Exclusif' }]} v={type} onChange={setType} />
        <div className={b.g3}>
          <Ch lib="N° du registre"><input className={s.input} value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ex : 4331" /></Ch>
          <Ch lib="Signé le"><input className={s.input} type="date" value={date} onChange={e => setDate(e.target.value)} /></Ch>
          <Ch lib={type === 'simple' ? 'Mandat jusqu’au' : 'Exclusivité jusqu’au'}><input className={s.input} type="date" value={finM} onChange={e => setFinM(e.target.value)} /></Ch>
        </div>
        {type && type !== 'simple' && !finM && <button type="button" className={b.lien} style={{ alignSelf: 'flex-start' }} onClick={() => setFinM(plusJours(date, 91))}>Trois mois d’exclusivité : jusqu’au {new Date(`${plusJours(date, 91)}T12:00:00`).toLocaleDateString('fr-FR')}</button>}
        {!reprise && (
          <label className={s.fichier}>
            <Ic n="trombone" t={18} />
            <span>{scan ? <><b>{scan.name}</b>{' · sera joint au bien'}</> : <>{'Le mandat signé (scan ou PDF) · '}<b>facultatif</b></>}</span>
            <input type="file" accept=".pdf,image/*" onChange={e => setScan(e.target.files?.[0] || null)} />
          </label>
        )}
      </div>
      <div className={b.groupe}>
        <div className={b.groupeT}><Ic n="etiquette" t={14} />Le prix et les honoraires</div>
        <SaisieNombre v={prix} euros unite="€" off={false} onChange={setPrix} ph={charge === 'acquereur' ? 'Prix affiché, honoraires compris' : 'Prix affiché'} lib="Prix affiché" />
        <div className={b.g2}>
          <ChG lib="À la charge de"><Pills options={[{ v: 'acquereur', l: 'L’acquéreur' }, { v: 'vendeur', l: 'Le vendeur' }]} v={charge} onChange={setCharge} /></ChG>
          <ChG lib="Honoraires"><Pills options={[{ v: 'taux', l: 'En %' }, { v: 'forfait', l: 'Au forfait' }]} v={honoMode} onChange={setHonoMode} /></ChG>
        </div>
        <div className={b.g2}>
          {honoMode === 'taux'
            ? <Ch lib={charge === 'acquereur' ? 'Taux, du prix net vendeur' : 'Taux'}><SaisieNombre v={taux} unite="% TTC" off={false} onChange={setTaux} ph="Ex : 4" lib="Taux" /></Ch>
            : <Ch lib="Forfait"><SaisieNombre v={forfait} euros unite="€ TTC" off={false} onChange={setForfait} ph="Ex : 15 000" lib="Forfait" /></Ch>}
        </div>
        {/* Ce que l'annonce écrira : la ventilation, obligatoire à la charge
            de l'acquéreur ; le prix seul à la charge du vendeur. */}
        <div className={`${b.ventile} ${charge === 'acquereur' && !ventile ? b.ventileManque : ''}`}>
          <Ic n={charge === 'acquereur' && !ventile ? 'info' : 'megaphone'} t={16} />
          <span>
            {!prix ? 'Écris le prix : l’annonce reprendra la mention légale ici.'
              : charge === 'vendeur' ? `Dans l’annonce : ${euros(prix)}, honoraires à la charge du vendeur.`
                : ventile ? `Dans l’annonce : ${euros(prix)} honoraires inclus, dont ${pourcent(a.taux as number)} TTC à la charge de l’acquéreur (${euros(a.net as number)} hors honoraires).`
                  : 'À la charge de l’acquéreur, l’annonce doit donner le pourcentage et le prix hors honoraires : écris le taux ou le forfait.'}
            {/* Pour toi, pas pour l'annonce (V3.32) : ce que le vendeur touche,
                aussi quand les honoraires sont à sa charge. */}
            {prix && a.net !== null && a.hono !== null && (charge === 'vendeur' || ventile) ? (
              <small className={b.ventileNet}>{`En interne : net vendeur ${euros(a.net)} (${euros(prix)} − ${euros(a.hono)} d’honoraires TTC, soit ${charge === 'vendeur' ? `${pourcent(Math.round((a.hono / prix) * 1000) / 10)} du prix` : `${pourcent(Math.round(((a.hono / (a.net || 1)) * 1000)) / 10)} du net`}).`}</small>
            ) : null}
          </span>
        </div>
      </div>
      {demandeProprio && (
        <div className={b.groupe}>
          <div className={b.groupeT}><Ic n="personne" t={14} />{creation ? 'Le propriétaire' : 'Le propriétaire (sa fiche n’est pas encore reliée)'}</div>
          <ChoixProprio choisi={proprio} onChoisir={setProprio} />
          {!creation && !proprio && <div className={b.calc}>Facultatif ici, mais sans fiche reliée, le mandat ne s’inscrit pas dans son suivi et il ne reçoit pas de relance.</div>}
        </div>
      )}
      {reprise && <Ch lib="Pourquoi (pour l’historique)"><input className={s.input} value={raison} onChange={e => setRaison(e.target.value)} placeholder="Ex : l’offre est tombée, le vendeur reprend la vente" /></Ch>}
      {enJeu.length > 0 && (
        <div className={b.rappels}>
          <Suite on={retirerOffres} onChange={setRetirerOffres} ic="croix" c="#b91c1c" f="#fef2f2"
            t={enJeu.length > 1 ? `Les ${enJeu.length} offres en cours passent « retirées »` : `L’offre de ${enJeu[0].qui || 'l’acquéreur'} passe « retirée »`}
            s={enJeu.map(o => `${o.qui || 'Acquéreur'} · ${euros(prixRetenu(o) || 0)}${o.statut === 'acceptee' ? ' · acceptée' : ''}`).join(' · ')} />
        </div>
      )}
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ══ Une offre est arrivée ═════════════════════════════════════════════ */
export function FenOffre({ bien, pour, existante, options, recherches, proprio, onFermer, onFait }: {
  bien: BienVente; options: OptionAcheteur[]; recherches: RechercheMini[]; proprio: ClientMini | null;
  onFermer: () => void; onFait: (b: BienVente | null) => void;
  /* Depuis une visite (« Enregistrer son offre », V3.32) : l'acheteur est choisi. */
  pour?: ChoixA;
  /* V3.45 : corriger une offre déjà notée (« Modifier l'offre »). */
  existante?: SuiviVente | null;
}) {
  const a = argentBien(bien.donnees || {});
  const ex = (existante?.donnees || {}) as Record<string, unknown>;
  const nb = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const tx = (v: unknown) => (typeof v === 'string' ? v : '');
  const [choix, setChoix] = useState<ChoixA>(pour ?? null);
  const [montant, setMontant] = useState<number | null>(existante?.montant ?? null);
  const [recue, setRecue] = useState(existante ? existante.le.slice(0, 10) : aujourdhui());
  const [jusquau, setJusquau] = useState(existante ? tx(ex.jusquau) : plusJours(aujourdhui(), 5));
  /* V3.45 : rien par défaut. « Prêt » était coché d'office et finissait sur
     la carte (« avec un prêt ») sans que personne ne l'ait dit. */
  const [fin, setFin] = useState<'comptant' | 'pret' | 'relais' | ''>(ex.financement === 'comptant' || ex.financement === 'pret' || ex.financement === 'relais' ? ex.financement : '');
  const [apport, setApport] = useState<number | null>(nb(ex.apport));
  const [pret, setPret] = useState<number | null>(nb(ex.pret));
  const [accord, setAccord] = useState(tx(ex.accord));
  const [conditions, setConditions] = useState(tx(ex.conditions));
  const [fichier, setFichier] = useState<File | null>(null);
  const [passer, setPasser] = useState(!existante && (bien.etape === 'mandat' || bien.etape === 'suspendu'));
  const [dejaAcceptee, setDejaAcceptee] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const ecart = montant && a.prix ? a.prix - montant : null;
  const honoSi = honorairesPour(bien.donnees || {}, montant);
  const netSi = montant && honoSi !== null ? montant - honoSi : null;
  const qui = choix?.mode === 'crm' ? choix.o.nom : choix?.mode === 'libre' ? choix.nom.trim() : '';
  const avecPret = fin === 'pret' || fin === 'relais';
  const dejaPasse = !!jusquau && jusquau < aujourdhui();

  async function valider() {
    if (!qui) { setErreur('Qui fait l’offre ?'); return; }
    if (!montant) { setErreur('Le montant de l’offre ?'); return; }
    setOccupe(true); setErreur('');
    try {
      const f = fichier ? await deposerPiece(bien.id, 'offre', fichier) : null;
      const saisie = {
        qui, clientId: choix?.mode === 'crm' ? choix.o.clientId : null, rechercheId: choix?.mode === 'crm' ? choix.o.rechercheId : null,
        montant, recue, jusquau, financement: fin || null, apport, pret: avecPret ? pret : null, accord: avecPret ? accord.trim() : '', conditions: conditions.trim(), fichier: f,
        dejaAcceptee: !existante && dejaAcceptee,
      };
      if (existante) { await modifierOffre(bien, existante, saisie); onFait(null); return; }
      const ligne = await enregistrerOffre(bien, saisie, proprio);
      if (passer && (bien.etape === 'mandat' || bien.etape === 'suspendu')) {
        const { bien: r } = await changerEtape(bien, 'offre', { infos: { offre: ligne.id, montant, qui } });
        onFait(r);
      } else onFait(null);
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  const proprioNom = proprio ? proprio.prenom || nomClient(proprio) : 'le propriétaire';
  const dejaJointe = !!tx(ex.chemin);
  return (
    <Fenetre sur={existante ? `L’offre de ${existante.qui || 'l’acquéreur'}` : passer && (bien.etape === 'mandat' || bien.etape === 'suspendu') ? 'Le bien passe « Sous offre »' : bien.etape === 'compromis' ? 'Une offre de secours' : 'Une offre de plus'} couleur={etapeDe('offre').c}
      titre={existante ? 'Corriger l’offre' : 'Une offre est arrivée'} sous={resume(bien)} occupe={occupe} onFermer={onFermer} large
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : existante ? 'Enregistrer les corrections' : 'Enregistrer l’offre'}</button></>}>
      <ChoixAcheteur options={options} recherches={recherches} choix={choix} onChoix={setChoix} libre="L’acquéreur" />
      <div className={b.groupe}>
        <div className={b.groupeT}><Ic n="euro" t={14} />L’offre</div>
        <div className={b.g3}>
          <Ch lib="Montant proposé"><SaisieNombre v={montant} euros unite="€" off={false} onChange={setMontant} /></Ch>
          <Ch lib="Reçue le"><input className={s.input} type="date" value={recue} onChange={e => setRecue(e.target.value)} /></Ch>
          <Ch lib="Valable jusqu’au"><input className={s.input} type="date" value={jusquau} onChange={e => setJusquau(e.target.value)} /></Ch>
        </div>
        {ecart !== null && a.prix && (
          <div className={b.calc}>
            {ecart > 0 ? <>Soit <b>{euros(ecart)}</b> sous le prix affiché ({`−${pourcent((ecart / a.prix) * 100)}`}).</> : ecart < 0 ? <>Soit <b>{euros(-ecart)}</b> au-dessus du prix affiché.</> : <>Au prix affiché.</>}
            {netSi !== null && <>{' '}Net vendeur si les honoraires ne bougent pas : <b>{euros(netSi)}</b>.</>}
          </div>
        )}
        <ChG lib="Financement"><Pills options={[{ v: 'comptant', l: 'Comptant' }, { v: 'pret', l: 'Prêt' }, { v: 'relais', l: 'Prêt relais' }]} v={fin} onChange={x => setFin(fin === x ? '' : x)} /></ChG>
        {!fin && <div className={b.calc}>Pas encore dit ? Laisse vide : rien ne s’affichera sur l’offre.</div>}
        <div className={b.g3}>
          <Ch lib="Apport"><SaisieNombre v={apport} euros unite="€" off={false} onChange={setApport} /></Ch>
          {avecPret && <Ch lib="Prêt demandé"><SaisieNombre v={pret} euros unite="€" off={false} onChange={setPret} /></Ch>}
          {avecPret && <Ch lib="Accord de principe"><input className={s.input} value={accord} onChange={e => setAccord(e.target.value)} placeholder="Ex : oui, reçu le 20/09" /></Ch>}
        </div>
        <Ch lib="Conditions particulières"><input className={s.input} value={conditions} onChange={e => setConditions(e.target.value)} placeholder="Ex : aucune ; vente de son bien actuel…" /></Ch>
        <label className={s.fichier}>
          <Ic n="trombone" t={18} />
          <span>{fichier ? <><b>{fichier.name}</b>{' · sera déposée avec l’offre'}</> : dejaJointe ? <>{'L’offre signée est jointe · '}<b>{'la remplacer'}</b></> : <>{'Joindre l’offre signée par l’acquéreur (PDF ou photo) · '}<b>facultatif</b></>}</span>
          <input type="file" accept=".pdf,image/*" onChange={e => setFichier(e.target.files?.[0] || null)} />
        </label>
      </div>
      {!existante && (
        <label className={`${b.caseL} ${b.caseAccord}`} data-on={dejaAcceptee ? 'oui' : 'non'}>
          <input type="checkbox" checked={dejaAcceptee} onChange={e => setDejaAcceptee(e.target.checked)} />
          <span><b>Le vendeur a déjà accepté</b><small>Une offre convenue avant d’être notée : elle arrive acceptée, sans relance. Il restera « Le compromis est signé ».</small></span>
        </label>
      )}
      {/* V3.48 : seulement depuis « En vente » ou « En pause » — une offre de
          secours sous compromis ne défait pas le compromis. */}
      {!existante && (bien.etape === 'mandat' || bien.etape === 'suspendu') && (
        <label className={b.caseL}><input type="checkbox" checked={passer} onChange={e => setPasser(e.target.checked)} />Le bien passe « Sous offre » dans la liste</label>
      )}
      {!existante && (
        <div className={b.reste}>
          <div className={b.resteT}>Le CRM s’occupe du reste</div>
          {dejaAcceptee && <div><Ic n="check" t={15} />L’offre arrive acceptée : sur sa carte, le bouton « Le compromis est signé → »</div>}
          {proprio && jusquau && !dejaPasse && !dejaAcceptee && <div><Ic n="calendrier" t={15} />{`Une relance le ${new Date(`${jusquau}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} si ${proprioNom} n’a pas répondu`}</div>}
          {proprio && dejaPasse && !dejaAcceptee && <div><Ic n="info" t={15} />Le délai de réponse est déjà passé : pas de relance.</div>}
          {!proprio && <div><Ic n="info" t={15} />Relie le propriétaire à sa fiche client pour recevoir une relance à la fin du délai.</div>}
          {choix?.mode === 'crm' && <div><Ic n="personne" t={15} />{`Une ligne dans le suivi de ${choix.o.nom}, son bien passe « offre faite »`}</div>}
          {!dejaAcceptee && <div><Ic n="historique" t={15} />Ensuite, sur la carte de l’offre : la réponse du vendeur, puis le compromis</div>}
        </div>
      )}
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ══ Le compromis est signé ═════════════════════════════════════════════ */
/* Le prix d'une offre : celui convenu au bout de la négociation (V3.45),
   sinon la dernière proposition. */
export const prixRetenu = (o: SuiviVente | null | undefined): number | null => (o ? montantActuel(o) || null : null);
/* ── Choisir un notaire (V3.45) : parmi les contacts « Notaire », ou créé ici. ── */
function ChoixNotaire({ lib, couleur, v, onChange, notaires, onCree }: {
  lib: string; couleur: string; v: NotaireChoisi | null; onChange: (n: NotaireChoisi | null) => void;
  notaires: ContactNotaire[] | null; onCree: (c: ContactNotaire) => void;
}) {
  const [q, setQ] = useState('');
  const [nouveau, setNouveau] = useState<{ prenom: string; nom: string; etude: string; tel: string; email: string } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const t = sansAccent(q.trim());
  const liste = (notaires || []).filter(c => !t || sansAccent(`${c.prenom || ''} ${c.nom || ''} ${(c.pro as { etude?: string } | null)?.etude || ''}`).includes(t)).slice(0, 5);
  async function creer() {
    if (!nouveau || !nouveau.nom.trim()) { setErreur('Son nom ?'); return; }
    setOccupe(true); setErreur('');
    try { const c = await creerNotaire(nouveau); onCree(c); onChange(notaireDepuisContact(c)); setNouveau(null); setQ(''); }
    catch (e) { setErreur((e as Error).message); }
    setOccupe(false);
  }
  return (
    <div className={b.notaire} style={{ ['--c' as string]: couleur } as React.CSSProperties}>
      <div className={b.notaireT}>{lib}</div>
      {v ? (
        <div className={b.notaireChoisi}>
          <span className={b.notaireAv}><Ic n="balance" t={17} /></span>
          <div>
            <b>{v.nom}</b>
            <small>{[v.etude, v.tel, v.email].filter(Boolean).join(' · ') || (v.id ? 'Contact du CRM' : 'Pas encore dans tes contacts')}</small>
          </div>
          <button type="button" className={b.notaireChanger} onClick={() => onChange(null)}>Changer</button>
        </div>
      ) : nouveau ? (
        <div className={b.notaireNouveau}>
          <div className={b.g2}>
            <Ch lib="Prénom"><input className={s.input} value={nouveau.prenom} onChange={e => setNouveau({ ...nouveau, prenom: e.target.value })} placeholder="Facultatif" /></Ch>
            <Ch lib="Nom"><input className={s.input} value={nouveau.nom} onChange={e => setNouveau({ ...nouveau, nom: e.target.value })} placeholder="Ex : Durand" autoFocus /></Ch>
            <Ch lib="Étude" large><input className={s.input} value={nouveau.etude} onChange={e => setNouveau({ ...nouveau, etude: e.target.value })} placeholder="Ex : Étude Durand & Associés, Boulogne" /></Ch>
            <Ch lib="Téléphone"><input className={s.input} value={nouveau.tel} inputMode="tel" onChange={e => setNouveau({ ...nouveau, tel: e.target.value })} /></Ch>
            <Ch lib="E-mail"><input className={s.input} value={nouveau.email} inputMode="email" onChange={e => setNouveau({ ...nouveau, email: e.target.value })} /></Ch>
          </div>
          <Erreur t={erreur} />
          <div className={b.notaireBtns}>
            <button type="button" className={s.btn} disabled={occupe} onClick={() => setNouveau(null)}>Annuler</button>
            <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={creer}><Ic n="check" t={14} e={2.4} />{occupe ? 'Création…' : 'Créer le contact'}</button>
          </div>
        </div>
      ) : (
        <>
          <input className={s.cherche} value={q} onChange={e => setQ(e.target.value)} placeholder={notaires === null ? 'Chargement des notaires…' : 'Chercher dans tes notaires…'} aria-label={`Chercher : ${lib}`} />
          <div className={b.qui}>
            {liste.map(c => {
              const n = notaireDepuisContact(c);
              return (
                <button key={c.id} type="button" className={b.quiL} onClick={() => onChange(n)}>
                  <span className={b.notaireAv}><Ic n="balance" t={15} /></span>
                  <div><b>{n.nom}</b><small>{[n.etude, n.tel].filter(Boolean).join(' · ') || 'Notaire'}</small></div>
                </button>
              );
            })}
            {notaires !== null && !liste.length && <div className={b.vide}>{t ? 'Aucun notaire à ce nom dans tes contacts.' : 'Aucun notaire dans tes contacts pour l’instant.'}</div>}
          </div>
          <button type="button" className={b.notaireAjout} onClick={() => setNouveau({ prenom: '', nom: q.trim(), etude: '', tel: '', email: '' })}><Ic n="plus" t={13} e={2.6} />Nouveau notaire</button>
        </>
      )}
    </div>
  );
}

const dateLongue = (ymd: string) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/* ══ Le compromis est signé — ou on le complète (V3.45) ══════════════════
   Alexandre : « comment je retrouve les éléments des notaires et tout ? »
   et « si on veut modifier, un pop-up qui s'affiche, joli, avec des
   icônes ». La même fenêtre sert aux deux : la signature (le bien passe
   « Sous compromis ») et, ensuite, « Compléter le compromis » depuis la
   carte (`existant` : la ligne du compromis). */
export function FenCompromis({ bien, offres, choisie, existant, clientsNoms, onFermer, onFait }: {
  bien: BienVente; offres: SuiviVente[]; onFermer: () => void; onFait: (b: BienVente | null) => void;
  /* Depuis la carte d'une offre, c'est elle. */
  choisie?: string;
  /* Le compromis déjà enregistré, qu'on complète. */
  existant?: SuiviVente | null;
  /* Les noms des contacts (propriétaire, acquéreur), pour dire où vont les rappels. */
  clientsNoms?: Record<string, string>;
}) {
  const d = bien.donnees || {};
  const a = argentBien(d);
  const ex = (existant?.donnees || {}) as Record<string, unknown>;
  const tx = (k: string) => (typeof ex[k] === 'string' ? String(ex[k]) : '');
  const candidates = offres.filter(o => o.statut !== 'refusee' && o.statut !== 'retiree');
  const meilleure = candidates.find(o => o.id === (tx('offre') || choisie)) || candidates.find(o => o.statut === 'acceptee') || [...candidates].sort((x, y) => (prixRetenu(y) || 0) - (prixRetenu(x) || 0))[0];
  const [offreId, setOffreId] = useState(meilleure?.id || '');
  const offre = offres.find(o => o.id === offreId) || null;
  const [prix, setPrix] = useState<number | null>(typeof ex.prix === 'number' ? ex.prix : prixRetenu(offre) || a.prix);
  const [signe, setSigne] = useState(tx('signe') || aujourdhui());
  const [sru, setSru] = useState(existant ? tx('sru') : plusJours(aujourdhui(), 11));
  const [pretL, setPretL] = useState(existant ? tx('pretLimite') : plusJours(aujourdhui(), 45));
  const [acte, setActe] = useState(existant ? tx('acte') : plusJours(aujourdhui(), 90));
  const hDefaut = (p: number | null) => honorairesPour(d, p) ?? a.hono;
  const [hono, setHono] = useState<number | null>(typeof ex.hono === 'number' ? ex.hono : hDefaut(prix));
  /* Les notaires : ceux déjà choisis ; sinon le texte d'avant (« Son notaire » du bien, le notaire de l'acquéreur écrit à la main). */
  const [notV, setNotV] = useState<NotaireChoisi | null>(lireNotaire(ex.notaireVendeur) || (txt(d, 'notaire') ? { id: null, nom: txt(d, 'notaire') } : null));
  const [notA, setNotA] = useState<NotaireChoisi | null>(lireNotaire(ex.notaireAcquereur) || (tx('notaireAcq') ? { id: null, nom: tx('notaireAcq') } : null));
  const [notaires, setNotaires] = useState<ContactNotaire[] | null>(null);
  useEffect(() => {
    let vivant = true;
    lireNotaires().then(l => { if (vivant) setNotaires(l); }).catch(() => { if (vivant) setNotaires([]); });
    return () => { vivant = false; };
  }, []);
  const ajouteNotaire = (c: ContactNotaire) => setNotaires(l => [...(l || []), c]);

  /* Les rappels : proposés d'après les dates, cochés d'office s'ils sont à venir. */
  const acquereur = offre?.qui || tx('acquereur') || 'l’acquéreur';
  const titre = bien.titre || titreBien(d);
  const pourProprio = bien.client_id || null;
  const pourAcq = offre?.client_id || null;
  const comptant = (offre?.donnees as Record<string, unknown> | undefined)?.financement === 'comptant';
  const rappelsAvant = (ex.rappels && typeof ex.rappels === 'object' ? ex.rappels : {}) as Record<string, string>;
  const rappelsLe = (ex.rappelsLe && typeof ex.rappelsLe === 'object' ? ex.rappelsLe : {}) as Record<string, string>;
  type Def = { cle: CleRappel; ic: string; c: string; f: string; t: string; base: string; ecart: number; client: string | null; note: (le: string) => string };
  const defs: Def[] = [
    { cle: 'sru', ic: 'bouclier', c: '#b45309', f: '#fff7ed', t: 'Vérifier la fin de la rétractation', base: sru, ecart: 1, client: pourProprio || pourAcq,
      note: () => `Compromis ${titre} : le délai de rétractation de ${acquereur} est terminé (${dateLongue(sru)}). Vérifier qu’il ne s’est pas rétracté.` },
    { cle: 'pret', ic: 'banque', c: '#1d4ed8', f: '#eff6ff', t: 'Demander l’accord de prêt', base: pretL, ecart: -7, client: pourAcq || pourProprio,
      note: () => `Compromis ${titre} : la condition de prêt de ${acquereur} expire le ${dateLongue(pretL)}. Demander l’accord de prêt.` },
    { cle: 'acte', ic: 'plume', c: '#6d28d9', f: '#f5f3ff', t: 'Confirmer le rendez-vous de l’acte', base: acte, ecart: -7, client: pourProprio || pourAcq,
      note: () => `Compromis ${titre} : acte prévu le ${dateLongue(acte)}. Confirmer le rendez-vous chez le notaire.` },
  ];
  const [choixR, setChoixR] = useState<Record<string, { on?: boolean; le?: string }>>(() => {
    const o: Record<string, { on?: boolean; le?: string }> = {};
    /* Un compromis qui a déjà ses rappels : on reprend ses choix. Sinon (un
       compromis d'avant, ou noté sans dates), les propositions par défaut. */
    if (existant && Object.keys(rappelsAvant).length) {
      for (const k of ['sru', 'pret', 'acte']) o[k] = { on: !!rappelsAvant[k] };
    }
    return o;
  });
  /* Le bien déjà vendu (un compromis d'avant qu'on complète après coup) :
     plus aucun rappel à poser (V3.47). */
  const dejaVendu = bien.etape === 'vendu';
  /* Une date changée en complétant : le rappel la suit, au lieu de garder
     l'échéance d'avant (V3.47). */
  const basesAvant: Record<string, string> = { sru: tx('sru'), pret: tx('pretLimite'), acte: tx('acte') };
  const rappels = defs.map(x => {
    const c = choixR[x.cle] || {};
    const garde = existant && rappelsLe[x.cle] && x.base === basesAvant[x.cle] ? rappelsLe[x.cle] : '';
    const le = c.le || garde || (x.base ? plusJours(x.base, x.ecart) : '');
    const passe = !!le && le < aujourdhui();
    const on = !dejaVendu && (c.on ?? (!!le && !passe && !!x.client && !(x.cle === 'pret' && comptant)));
    return { ...x, le, passe, on };
  });
  const majR = (k: string, v: { on?: boolean; le?: string }) => setChoixR(o => ({ ...o, [k]: { ...o[k], ...v } }));
  /* Et ensuite (V3.47) : la recherche de l'acquéreur en pause, les autres offres refusées. */
  const autresOuvertes = offres.filter(o => o.id !== offreId && (!o.statut || o.statut === 'en_attente' || o.statut === 'contre'));
  const [pauseAcq, setPauseAcq] = useState(true);
  const [refuserAutres, setRefuserAutres] = useState(true);

  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const changerOffre = (id: string) => {
    setOffreId(id);
    const p = prixRetenu(offres.find(x => x.id === id));
    if (p) { setPrix(p); setHono(hDefaut(p)); }
  };
  const majSigne = (x: string) => { setSigne(x); setSru(plusJours(x, 11)); setPretL(plusJours(x, 45)); setActe(plusJours(x, 90)); };
  async function valider() {
    if (!prix) { setErreur('Le prix de vente ?'); return; }
    if (!signe) { setErreur('La date de signature ?'); return; }
    setOccupe(true); setErreur('');
    try {
      const infos = {
        offre: offre?.id || null, acquereur: offre?.qui || tx('acquereur') || null, prix, signe, sru, pretLimite: pretL, acte, hono,
        notaireVendeur: notV, notaireAcquereur: notA, notaireAcq: notA?.nom || '',
      };
      const liste: Rappel[] = rappels.map(r => ({ cle: r.cle, on: r.on && !!r.le, le: r.le, clientId: r.client, note: r.note(r.le) }));
      const rappelsLeNouv = Object.fromEntries(rappels.filter(r => r.on && r.le).map(r => [r.cle, r.le]));
      if (existant) {
        const ids = await poserRappels(liste, rappelsAvant);
        await majSuivi(existant.id, { donnees: { ...ex, ...infos, rappels: ids, rappelsLe: rappelsLeNouv } });
        if (offre && offre.statut !== 'acceptee') await majSuivi(offre.id, { statut: 'acceptee', donnees: { ...offre.donnees, reponse_le: aujourdhui() } });
        if (offre) await retirerAutresAcceptees(bien, offres, offre.id);
        onFait(null);
        return;
      }
      /* L'étape d'abord : si elle échoue, l'offre ne reste pas « acceptée » sans compromis (V3.47). */
      const { bien: r, ligne } = await changerEtape(bien, 'compromis', { infos });
      if (offre && offre.statut !== 'acceptee') await majSuivi(offre.id, { statut: 'acceptee', donnees: { ...offre.donnees, reponse_le: aujourdhui() } });
      const ids = await poserRappels(liste, {});
      const pause = offre && offre.client_id && pauseAcq ? await pauseAcquereur(offre) : null;
      if (Object.keys(ids).length || pause) {
        try { await majSuivi(ligne.id, { donnees: { ...ligne.donnees, rappels: ids, rappelsLe: rappelsLeNouv, ...(pause ? { acqPause: pause } : {}) } }); }
        catch (e) { signalerEchec('Le compromis : ses rappels et la recherche de l’acquéreur', (e as Error).message); }
      }
      if (refuserAutres && autresOuvertes.length) await refuserAutresOffres(bien, offres, offre?.id || null);
      if (offre) await retirerAutresAcceptees(bien, offres, offre.id);
      /* La relance « réponse à donner » de cette offre n'a plus d'objet. */
      if (offre) await cloreRelanceOffre(bien, offre);
      /* Le compromis, dans le Suivi du vendeur et de l'acquéreur (V3.47) :
         la date de signature, le prix, les dates qui comptent, les notaires. */
      const dates = [sru ? `fin de la rétractation le ${jourSuivi(sru)}` : '', pretL ? `condition de prêt jusqu’au ${jourSuivi(pretL)}` : '', acte ? `acte prévu le ${jourSuivi(acte)}` : '']
        .filter(Boolean).join(' · ');
      const lesDates = dates ? dates.charAt(0).toUpperCase() + dates.slice(1) : null;
      const not = ligneNotaires(notV, notA);
      const quiAcq = offre?.qui || tx('acquereur');
      await noterJalon(bien, 'compromis', {
        vendeur: pourProprio ? { clientId: pourProprio, titre: `✍️ Compromis signé le ${jourSuivi(signe)}`, texte: [`${titre} · ${eurosSuivi(prix)}${quiAcq ? ` · acquéreur : ${quiAcq}` : ''}`, lesDates, not] } : null,
        acquereur: offre?.client_id ? { clientId: offre.client_id, rechercheId: offre.recherche_id, titre: `✍️ Compromis signé le ${jourSuivi(signe)}`,
          texte: [`${titre} · ${eurosSuivi(prix)}`, lesDates, not, pause ? 'Sa recherche est en pause pendant le compromis : la veille s’arrête. Elle reprend si le compromis tombe.' : null] } : null,
      });
      onFait(r);
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  const nomDe = (id: string | null) => (id && clientsNoms?.[id]) || '';
  const DATES = [
    { ic: 'bouclier', c: '#b45309', f: '#fff7ed', lib: 'Fin de la rétractation', aide: '10 jours après la remise du compromis', v: sru, set: setSru },
    { ic: 'banque', c: '#1d4ed8', f: '#eff6ff', lib: 'Condition de prêt jusqu’au', aide: 'En général 45 à 60 jours', v: pretL, set: setPretL },
    { ic: 'plume', c: '#6d28d9', f: '#f5f3ff', lib: 'Acte prévu le', aide: 'Environ trois mois après', v: acte, set: setActe },
  ];
  return (
    <Fenetre sur={existant ? `Le compromis · ${acquereur}` : 'Le bien passe « Sous compromis »'} couleur={etapeDe('compromis').c}
      titre={existant ? 'Compléter le compromis' : 'Le compromis est signé'} sous={resume(bien)} occupe={occupe} onFermer={onFermer} large
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : existant ? 'Enregistrer' : 'Enregistrer le compromis'}</button></>}>
      {candidates.length > 0 && (
        <Section ic="personne" c="#a07c28" f="#fbf6e9" titre="L’offre retenue">
          <div className={b.qui}>
            {candidates.map(o => (
              <button key={o.id} type="button" className={`${b.quiL} ${offreId === o.id ? b.quiOn : ''}`} onClick={() => changerOffre(o.id)}>
                <div><b>{`${o.qui || 'Acquéreur'} · ${euros(prixRetenu(o) || 0)}`}</b><small>{`Reçue le ${new Date(o.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}${o.statut === 'acceptee' ? ' · acceptée' : ''}`}</small></div>
                {offreId === o.id && <Ic n="check" t={16} e={2.6} />}
              </button>
            ))}
          </div>
        </Section>
      )}
      <Section ic="doc" c="#2d5c8f" f="#eff4fb" titre="Le compromis">
        <div className={b.g3}>
          <Ch lib="Signé le"><input className={s.input} type="date" value={signe} onChange={e => majSigne(e.target.value)} /></Ch>
          <Ch lib="Prix de vente"><SaisieNombre v={prix} euros unite="€" off={false} onChange={x => { setPrix(x); setHono(hDefaut(x)); }} /></Ch>
          <Ch lib="Honoraires de l’agence"><SaisieNombre v={hono} euros unite="€ TTC" off={false} onChange={setHono} /></Ch>
        </div>
      </Section>
      <Section ic="calendrier" c="#15803d" f="#f0fdf4" titre="Les dates">
        <div className={b.datesC}>
          {DATES.map(x => (
            <label key={x.lib} className={b.dateC} style={{ ['--c' as string]: x.c, ['--f' as string]: x.f } as React.CSSProperties}>
              <span className={b.dateCT}><span className={b.dateCIc}><Ic n={x.ic} t={15} /></span><span className={b.dateCL}>{x.lib}</span></span>
              <input className={s.input} type="date" value={x.v} onChange={e => x.set(e.target.value)} />
              <small>{x.aide}</small>
            </label>
          ))}
        </div>
        {!existant ? <div className={b.calc}>Calculées depuis la signature : ajuste-les à ce qui est écrit dans le compromis.</div>
          : (!sru || !pretL || !acte) && signe ? (
            <button type="button" className={b.notaireAjout} onClick={() => { if (!sru) setSru(plusJours(signe, 11)); if (!pretL) setPretL(plusJours(signe, 45)); if (!acte) setActe(plusJours(signe, 90)); }}>
              <Ic n="calendrier" t={13} />{`Calculer depuis la signature du ${dateLongue(signe)}`}
            </button>
          ) : null}
      </Section>
      <Section ic="balance" c="#34496e" f="#eef2f8" titre="Les notaires">
        <div className={b.g2}>
          <ChoixNotaire lib="Notaire du vendeur" couleur="#a07c28" v={notV} onChange={setNotV} notaires={notaires} onCree={ajouteNotaire} />
          <ChoixNotaire lib="Notaire de l’acquéreur" couleur="#1d4ed8" v={notA} onChange={setNotA} notaires={notaires} onCree={ajouteNotaire} />
        </div>
      </Section>
      {!dejaVendu && <Section ic="horloge" c="#c2410c" f="#fff7ed" titre="Les rappels, dans tes Relances">
        <div className={b.rappels}>
          {rappels.map(r => (
            <div key={r.cle} className={b.rappel} data-on={r.on ? 'oui' : 'non'} style={{ ['--c' as string]: r.c, ['--f' as string]: r.f } as React.CSSProperties}>
              <label className={b.rappelCase}>
                <input type="checkbox" checked={r.on} disabled={!r.client || !r.le} onChange={e => majR(r.cle, { on: e.target.checked })} />
                <span className={b.dateCIc}><Ic n={r.ic} t={15} /></span>
                <span className={b.rappelTx}>
                  <b>{r.t}</b>
                  <small>{!r.le ? 'Mets d’abord la date au-dessus.' : !r.client ? 'Relie le propriétaire ou l’acquéreur à une fiche du CRM pour recevoir ce rappel.'
                    : r.passe ? 'Cette date est déjà passée.' : r.cle === 'pret' && comptant ? 'Achat comptant : pas forcément utile.' : `Chez ${nomDe(r.client) || 'le contact'}`}</small>
                </span>
              </label>
              <input className={`${s.input} ${b.rappelDate}`} type="date" value={r.le} disabled={!r.on} onChange={e => majR(r.cle, { le: e.target.value })} aria-label={`Date : ${r.t}`} />
            </div>
          ))}
        </div>
      </Section>}
      {!existant && (pourProprio || offre?.client_id || autresOuvertes.length > 0) && (
        <Section ic="fleche" c="#0f766e" f="#f0fdfa" titre="Et ensuite">
          <div className={b.rappels}>
            {offre?.client_id && (
              <Suite on={pauseAcq} onChange={setPauseAcq} ic="pause" c="#b45309" f="#fff7ed"
                t={`Mettre la recherche de ${acquereur} en pause`}
                s="Il passe « Suspendu » : la veille s’arrête, il n’est plus proposé sur tes autres biens. Si le compromis tombe, sa recherche reprend." />
            )}
            {autresOuvertes.length > 0 && (
              <Suite on={refuserAutres} onChange={setRefuserAutres} ic="croix" c="#b91c1c" f="#fef2f2"
                t={autresOuvertes.length > 1 ? `Les ${autresOuvertes.length} autres offres passent en refusées` : `L’offre de ${autresOuvertes[0].qui || 'l’autre acquéreur'} passe en refusée`}
                s={autresOuvertes.map(o => `${o.qui || 'Acquéreur'} · ${euros(prixRetenu(o) || 0)}`).join(' · ')} />
            )}
            {(pourProprio || offre?.client_id) && (
              <Trace t={pourProprio && offre?.client_id ? 'Une ligne datée dans leur suivi' : 'Une ligne datée dans son suivi'}
                s={`« Compromis signé le ${jourSuivi(signe)} », avec le prix, les dates et les notaires, chez ${[pourProprio ? nomDe(pourProprio) || 'le vendeur' : '', offre?.client_id ? nomDe(offre.client_id) || acquereur : ''].filter(Boolean).join(' et chez ')}.`} />
            )}
          </div>
        </Section>
      )}
      <Erreur t={erreur} />
    </Fenetre>
  );
}
/* Les visites encore prévues, quand le bien se vend ou se retire (V3.48) :
   une case cochée d'office pour les annuler. */
export type VisitePrevue = { qui: string; le: string };
function CaseVisites({ prevues, on, onChange }: { prevues: VisitePrevue[]; on: boolean; onChange: (v: boolean) => void }) {
  if (!prevues.length) return null;
  return (
    <Suite on={on} onChange={onChange} ic="calendrier" c="#0f766e" f="#f0fdfa"
      t={prevues.length > 1 ? `Annuler les ${prevues.length} visites prévues` : 'Annuler la visite prévue'}
      s={`${prevues.map(v => `${v.qui}, le ${jourSuivi(v.le)}`).join(' · ')}. Les acheteurs suivis ne ${prevues.length > 1 ? 'les' : 'la'} verront plus dans leur espace.`} />
  );
}
/* Une case « et ensuite » (V3.47) : ce que la fenêtre fait en plus, coché d'office. */
function Suite({ on, onChange, ic, c, f, t, s: sous }: { on: boolean; onChange: (v: boolean) => void; ic: string; c: string; f: string; t: string; s: string }) {
  return (
    <div className={b.rappel} data-on={on ? 'oui' : 'non'} style={{ ['--c' as string]: c, ['--f' as string]: f } as React.CSSProperties}>
      <label className={b.rappelCase}>
        <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
        <span className={b.dateCIc}><Ic n={ic} t={15} /></span>
        <span className={b.rappelTx}><b>{t}</b><small>{sous}</small></span>
      </label>
    </div>
  );
}
/* ══ Le compromis est tombé (V3.47) ═════════════════════════════════════
   Alexandre : « quand on clique sur le compromis est tombé : soit reprendre
   la recherche de l'acheteur — peut-être qu'il n'est plus en recherche —,
   soit le vendeur ne veut plus vendre ». Avant, c'était la fenêtre du mandat
   (« Remettre en vente »), sans autre choix. Maintenant : le pourquoi, ce que
   devient le bien, ce que devient l'acquéreur (compromisTombe). */
const RAISONS_TOMBE = ['Refus de prêt', 'Rétractation de l’acquéreur', 'Condition suspensive non levée', 'Le vendeur se retire'];
export function FenCompromisTombe({ bien, compromis, offres, clientsNoms, prevues = [], onFermer, onFait }: {
  bien: BienVente; compromis: SuiviVente | null; offres: SuiviVente[]; clientsNoms?: Record<string, string>; prevues?: VisitePrevue[];
  onFermer: () => void; onFait: (b: BienVente) => void;
}) {
  const c = (compromis?.donnees || {}) as Record<string, unknown>;
  const enPause = !!(c.acqPause && typeof c.acqPause === 'object' && (c.acqPause as Record<string, unknown>).clientId);
  const offre = offres.find(o => o.id === c.offre) || null;
  const acqId = (enPause ? String((c.acqPause as Record<string, unknown>).clientId) : '') || offre?.client_id || null;
  const acquereur = (acqId && clientsNoms?.[acqId]) || offre?.qui || (typeof c.acquereur === 'string' ? c.acquereur : '') || 'l’acquéreur';
  const vendeur = (bien.client_id && clientsNoms?.[bien.client_id]) || 'le vendeur';
  const prix = argentBien(bien.donnees || {}).prix;
  const titre = bien.titre || titreBien(bien.donnees || {});
  const [raison, setRaison] = useState('');
  const [suiteBien, setSuiteBien] = useState<SuiteTombe['bien']>('mandat');
  const [suiteAcq, setSuiteAcq] = useState<SuiteTombe['acq']>('reprend');
  const [annulerV, setAnnulerV] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const choisirRaison = (x: string) => { setRaison(x); if (x === 'Le vendeur se retire') setSuiteBien('retire'); };
  async function valider() {
    setOccupe(true); setErreur('');
    try {
      const { bien: r } = await changerEtape(bien, suiteBien, { infos: { raison: raison.trim(), compromisTombe: true } });
      await cloreRappelsCompromis(bien.id);
      await compromisTombe(bien, titre, raison, { bien: suiteBien, acq: suiteAcq }, compromis);
      if (suiteBien === 'retire' && annulerV && prevues.length) await annulerVisitesPrevues(bien, 'Le bien est retiré de la vente.');
      if (suiteBien === 'retire') await solderDemandesDuBien(bien);
      onFait(r);
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre sur={suiteBien === 'retire' ? 'Le bien passe « Retiré »' : 'Le bien repasse « En vente »'} couleur="#dc2626"
      titre="Le compromis est tombé" sous={resume(bien)} occupe={occupe} onFermer={onFermer} large
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : 'Valider'}</button></>}>
      <Section ic="info" c="#b91c1c" f="#fef2f2" titre="Pourquoi">
        <Pills options={RAISONS_TOMBE.map(x => ({ v: x, l: x }))} v={RAISONS_TOMBE.includes(raison) ? raison : ''} onChange={choisirRaison} />
        <Ch lib="En quelques mots"><input className={s.input} value={raison} onChange={e => setRaison(e.target.value)} placeholder="Ex : refus de prêt de la deuxième banque" /></Ch>
      </Section>
      <Section ic="maison" c="#a07c28" f="#fbf6e9" titre="Le bien">
        <div className={b.rappels}>
          <Option nom="bien" on={suiteBien === 'mandat'} onChange={() => setSuiteBien('mandat')} ic="etiquette" c="#15803d" f="#f0fdf4"
            t="Il repasse « En vente »" s={`Le mandat continue${prix ? `, au prix affiché de ${euros(prix)}` : ''}. Tu pourras le changer avec « Changer le prix ».`} />
          <Option nom="bien" on={suiteBien === 'retire'} onChange={() => setSuiteBien('retire')} ic="archive" c="#64748b" f="#f1f5f9"
            t={`${vendeur === 'le vendeur' ? 'Le vendeur' : vendeur} ne veut plus vendre`} s="Le bien passe « Retiré », gardé dans l’historique. Il se remet en vente d’un clic." />
          {suiteBien === 'retire' && <CaseVisites prevues={prevues} on={annulerV} onChange={setAnnulerV} />}
        </div>
      </Section>
      {acqId && (
        <Section ic="personne" c="#1d4ed8" f="#eff6ff" titre={`${acquereur}, l’acquéreur`}>
          <div className={b.rappels}>
            <Option nom="acq" on={suiteAcq === 'reprend'} onChange={() => setSuiteAcq('reprend')} ic="loupe" c="#15803d" f="#f0fdf4"
              t="Sa recherche reprend" s={enPause ? 'Il redevient comme avant le compromis : la veille repart et il est de nouveau proposé sur tes biens.' : 'Sa recherche n’avait pas été mise en pause : elle continue.'} />
            <Option nom="acq" on={suiteAcq === 'pause'} onChange={() => setSuiteAcq('pause')} ic="pause" c="#b45309" f="#fff7ed"
              t="Laisser sa recherche en pause" s="Il reste « Suspendu » : tu décideras plus tard, depuis sa fiche." />
            <Option nom="acq" on={suiteAcq === 'arrete'} onChange={() => setSuiteAcq('arrete')} ic="croix" c="#b91c1c" f="#fef2f2"
              t="Il arrête sa recherche" s="Dossier clos, « A renoncé » : la veille s’arrête, ses relances en attente sont soldées. Il se rouvre depuis sa fiche." />
          </div>
        </Section>
      )}
      <div className={b.rappels}>
        <Trace t={bien.client_id && acqId ? 'Une ligne datée dans leur suivi' : 'Une ligne datée dans le suivi'}
          s={`« Compromis tombé », avec le pourquoi${[bien.client_id ? `, chez ${vendeur}` : '', acqId ? `${bien.client_id ? ' et' : ','} chez ${acquereur}` : ''].join('')}. ${offre ? `L’offre de ${offre.qui || acquereur} passe « Compromis tombé ».` : ''}`.trim()} />
      </div>
      <Erreur t={erreur} />
    </Fenetre>
  );
}
/* ══ Une nouvelle vente de ce bien (V3.47) ═════════════════════════════
   Le bien vendu revient à la vente, des années plus tard : une nouvelle
   fiche reprend sa description ; le propriétaire proposé est celui qui
   l'avait acheté (nouvelleVente, outils.ts). */
export function FenNouvelleVente({ bien, references, acquereur, onFermer, onFait }: {
  bien: BienVente; references: (string | null)[]; acquereur: ClientMini | null;
  onFermer: () => void; onFait: (b: BienVente) => void;
}) {
  const [qui, setQui] = useState<'acq' | 'autre'>(acquereur ? 'acq' : 'autre');
  const [etape, setEtape] = useState<'a_suivre' | 'estimation'>('estimation');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const vendu = bien.vendu_le ? jourSuivi(bien.vendu_le) : '';
  async function valider() {
    setOccupe(true); setErreur('');
    try { onFait(await nouvelleVente(bien, references, { proprio: qui === 'acq' ? acquereur : null, etape })); }
    catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre sur={`Vendu${vendu ? ` le ${vendu}` : ''}`} couleur={etapeDe('estimation').c} titre="Une nouvelle vente de ce bien" sous={resume(bien)} occupe={occupe} onFermer={onFermer} large
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Création…' : 'Créer la nouvelle vente'}</button></>}>
      <Section ic="doc" c="#2d5c8f" f="#eff4fb" titre="Ce qui est repris">
        <div className={b.rappels}>
          <Trace seul ic="check" c="#15803d" f="#f0fdf4" t="La description du bien" s="Adresse, surfaces, pièces, intérieur, extérieur, diagnostics, copropriété et observations : tu n’as qu’à vérifier ce qui a changé." />
          <Trace seul ic="boucle" c="#64748b" f="#f8fafc" t="Ce qui repart de zéro" s={`Le prix, le mandat, les infos de visite, l’annonce et les photos. Cette vente-ci reste telle quelle, avec son historique et ses honoraires${bien.reference ? ` (réf. ${bien.reference})` : ''}.`} />
        </div>
      </Section>
      <Section ic="personne" c="#a07c28" f="#fbf6e9" titre="Le propriétaire">
        <div className={b.rappels}>
          {acquereur && (
            <Option nom="qui" on={qui === 'acq'} onChange={() => setQui('acq')} ic="cle" c="#15803d" f="#f0fdf4"
              t={nomClient(acquereur)} s={`Celui qui l’avait acheté${vendu ? ` le ${vendu}` : ''}. Il passe « Vendeur ».`} />
          )}
          <Option nom="qui" on={qui === 'autre'} onChange={() => setQui('autre')} ic="personne" c="#475569" f="#f8fafc"
            t="Quelqu’un d’autre" s="Tu le choisiras dans la fiche, à l’étape « Le propriétaire »." />
        </div>
      </Section>
      <Section ic="drapeau" c="#7c3aed" f="#f5f3ff" titre="Où en est-on">
        <Pills options={[{ v: 'a_suivre', l: 'Un projet à suivre' }, { v: 'estimation', l: 'Une estimation' }]} v={etape} onChange={setEtape} />
      </Section>
      <Erreur t={erreur} />
    </Fenetre>
  );
}
/* Un choix parmi plusieurs (V3.47), dans le style des cases « Et ensuite ». */
function Option({ nom, on, onChange, ic, c, f, t, s: sous }: { nom: string; on: boolean; onChange: () => void; ic: string; c: string; f: string; t: string; s: string }) {
  return (
    <div className={b.rappel} data-on={on ? 'oui' : 'non'} style={{ ['--c' as string]: c, ['--f' as string]: f } as React.CSSProperties}>
      <label className={b.rappelCase}>
        <input type="radio" name={nom} checked={on} onChange={onChange} />
        <span className={b.dateCIc}><Ic n={ic} t={15} /></span>
        <span className={b.rappelTx}><b>{t}</b><small>{sous}</small></span>
      </label>
    </div>
  );
}
/* Ce que la fenêtre note toujours, sans case : la ligne du Suivi (V3.47). */
function Trace({ t, s: sous, ic = 'historique', c = '#475569', f = '#f8fafc', seul = false }: { t: string; s: string; ic?: string; c?: string; f?: string; seul?: boolean }) {
  return (
    <div className={b.rappel} data-on="oui" style={{ ['--c' as string]: c, ['--f' as string]: f } as React.CSSProperties}>
      <div className={b.rappelCase} style={{ cursor: 'default' }}>
        {/* La place de la case, pour que l'icône s'aligne sur celles du dessus. */}
        {!seul && <span style={{ width: 17, flexShrink: 0 }} aria-hidden="true" />}
        <span className={b.dateCIc}><Ic n={ic} t={15} /></span>
        <span className={b.rappelTx}><b>{t}</b><small>{sous}</small></span>
      </div>
    </div>
  );
}
function Section({ ic, c, f, titre, children }: { ic: string; c: string; f: string; titre: string; children: ReactNode }) {
  return (
    <div className={b.fsec} style={{ ['--c' as string]: c, ['--f' as string]: f } as React.CSSProperties}>
      <div className={b.fsecT}><span className={b.fsecIc}><Ic n={ic} t={15} /></span>{titre}</div>
      {children}
    </div>
  );
}

/* ══ Vendu : l'acte est signé ══════════════════════════════════════════ */
/* La vente est signée (V3.47 : en rubriques, comme le compromis, et la fin
   du parcours — l'acquéreur « Bien trouvé », le vendeur « Vendeur signé »).
   V3.50 :
   · les honoraires sont obligatoires (> 0), sauf « Vente sans honoraires »
     coché : une case vide faisait disparaître la vente du chiffre d'affaires ;
     par défaut, ceux du mandat appliqués au prix de vente, recalculés quand le
     prix change (tant qu'Alexandre n'a pas tapé les siens) ;
   · `correction` : « Corriger l'acte » sur un bien déjà vendu — la date, le
     prix, les honoraires, sans rien refaire d'autre (corrigerActe). */
export function FenVendu({ bien, compromis, offres = [], proprio = null, prevues = [], correction, onFermer, onFait }: {
  bien: BienVente; compromis: SuiviVente | null; onFermer: () => void; prevues?: VisitePrevue[];
  /* `texte` : ce qui a été fait, pour le bandeau de la liste (V3.47). */
  onFait: (b: BienVente, texte: string) => void;
  offres?: SuiviVente[]; proprio?: ClientMini | null;
  /* V3.50 : la ligne « vendu » à corriger (ou null : une vente d'avant sans sa ligne). */
  correction?: { ligne: SuiviVente | null } | null;
}) {
  const c = (compromis?.donnees || {}) as Record<string, unknown>;
  const v = (correction?.ligne?.donnees || {}) as Record<string, unknown>;
  const d = bien.donnees || {};
  const a = argentBien(d);
  const auj = aujourdhui();
  const [date, setDate] = useState(correction ? (typeof v.acte === 'string' && v.acte) || bien.vendu_le || auj
    : typeof c.acte === 'string' && c.acte <= auj ? c.acte : auj);
  const prixDepart = correction ? (typeof v.prix === 'number' ? v.prix : null) : typeof c.prix === 'number' ? c.prix : a.prix;
  const [prix, setPrix] = useState<number | null>(prixDepart);
  const honoCalc = (p: number | null) => honorairesPour(d, p);
  /* Les honoraires de départ : ceux de l'acte (correction), sinon ceux du
     compromis, sinon ceux du mandat sur le prix de vente. Un montant qui ne
     sort pas du calcul compte comme tapé à la main : il ne bouge plus. */
  const honoDepart = correction ? (typeof v.hono === 'number' && v.hono > 0 ? v.hono : null)
    : typeof c.hono === 'number' && c.hono > 0 ? c.hono : honoCalc(prixDepart) ?? a.hono;
  const [hono, setHono] = useState<number | null>(honoDepart);
  const [honoTape, setHonoTape] = useState(honoDepart !== null && honoDepart !== honoCalc(prixDepart));
  const [sansHono, setSansHono] = useState(correction ? v.sansHonoraires === true || v.hono === 0 : false);
  const changerPrix = (x: number | null) => {
    setPrix(x);
    if (!honoTape) { const h = honoCalc(x); if (h !== null) setHono(h); }
  };
  const offre = offres.find(o => o.id === c.offre) || (offres.filter(o => o.statut === 'acceptee').length === 1 ? offres.find(o => o.statut === 'acceptee') : undefined) || null;
  const acquereur = offre?.qui || (typeof c.acquereur === 'string' ? c.acquereur : '') || 'l’acquéreur';
  const [finAcq, setFinAcq] = useState(true);
  const [signeV, setSigneV] = useState(true);
  const [annulerV, setAnnulerV] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const titre = bien.titre || titreBien(d);
  const nomProprio = proprio ? nomClient(proprio) : '';
  const traces = [proprio || bien.client_id ? `« Vente signée — acte authentique le ${jourSuivi(date)} » chez ${nomProprio || 'le vendeur'}` : '', offre?.client_id ? `« Achat signé » chez ${acquereur}` : ''].filter(Boolean);
  async function valider() {
    if (!date) { setErreur('La date de l’acte ?'); return; }
    if (!prix) { setErreur('Le prix de vente ?'); return; }
    if (!sansHono && !(hono && hono > 0)) { setErreur('Les honoraires encaissés ? Écris le montant TTC, ou coche « Vente sans honoraires ».'); return; }
    setOccupe(true); setErreur('');
    const honoFinal = sansHono ? 0 : hono;
    if (correction) {
      try {
        const r = await corrigerActe(bien, correction.ligne, { acte: date, prix, hono: honoFinal, sansHonoraires: sansHono });
        onFait(r, '');
      } catch (e) { setErreur((e as Error).message); setOccupe(false); }
      return;
    }
    try {
      /* Ce que l'historique du bien dira (V3.47) : l'acte, le vendeur, l'acquéreur, les notaires. */
      const { bien: r } = await changerEtape(bien, 'vendu', { vendu_le: date, infos: {
        prix, hono: honoFinal, ...(sansHono ? { sansHonoraires: true } : {}), acte: date, acquereur: c.acquereur || offre?.qui || null, vendeur: nomProprio || null,
        notaireVendeur: lireNotaire(c.notaireVendeur), notaireAcquereur: lireNotaire(c.notaireAcquereur),
      } });
      /* Les rappels du compromis encore en attente n'ont plus d'objet (V3.45). */
      await cloreRappelsCompromis(bien.id);
      /* V3.48 : les offres restées ouvertes n'ont plus d'objet (refusées, leurs
         relances closes) ; les visites encore prévues s'annulent. */
      await refuserAutresOffres(bien, offres, offre?.id || null);
      if (annulerV && prevues.length) await annulerVisitesPrevues(bien, 'Le bien est vendu.');
      await solderDemandesDuBien(bien);
      /* V3.50 : sa transaction côté chasse sur ce bien, s'il en avait ouvert une, se clôt. */
      const txCloses = offre?.client_id ? await finaliserTransactionsAcquereur(bien.id, offre.client_id, date) : 0;
      const pause = (c.acqPause && typeof c.acqPause === 'object' ? c.acqPause : {}) as { statutAvant?: string | null };
      const fin = finAcq && offre?.client_id
        ? await finaliserAcquereur(offre.client_id, { rechercheId: offre.recherche_id, bienVenteId: bien.id, statutAvant: pause.statutAvant || null })
        : null;
      const fini = !!fin?.ok && fin.bienTrouve;
      const rechArretee = !!fin?.ok && !fin.bienTrouve;
      const vSigne = signeV && proprio ? await vendeurSigne(proprio.id, bien.id) : false;
      /* L'acte authentique, dans le Suivi des deux (V3.47) : « Vente signée »
         chez le vendeur, « Achat signé » chez l'acquéreur, avec la date. */
      const not = ligneNotaires(lireNotaire(c.notaireVendeur), lireNotaire(c.notaireAcquereur));
      const lePrix = prix ? ` · ${eurosSuivi(prix)}` : '';
      const quiAcq = offre?.qui || (typeof c.acquereur === 'string' ? c.acquereur : '');
      const vendeurId = proprio?.id || bien.client_id;
      await noterJalon(bien, 'acte', {
        vendeur: vendeurId ? { clientId: vendeurId, titre: `🔑 Vente signée — acte authentique le ${jourSuivi(date)}`,
          texte: [`${titre}${lePrix}${quiAcq ? ` · acquéreur : ${quiAcq}` : ''}`, not, vSigne ? 'Il passe en « Vendeur signé ».' : null] } : null,
        acquereur: offre?.client_id ? { clientId: offre.client_id, rechercheId: offre.recherche_id, type: fini ? 'dossier_finalise' : undefined,
          titre: `🔑 Achat signé — acte authentique le ${jourSuivi(date)}`,
          texte: [`${titre}${lePrix}`, not,
            fini ? 'Dossier finalisé (« Bien trouvé ») : la veille s’arrête, ses relances en attente sont soldées.'
              : rechArretee ? 'La recherche de ce bien s’arrête ; ses autres recherches continuent.' : null] } : null,
      });
      /* Le bandeau de la liste : ce qui vient de se passer, en une phrase. */
      onFait(r, [
        `Acte authentique le ${jourSuivi(date)}${prix ? `, ${euros(prix)}` : ''}${quiAcq ? `, à ${quiAcq}` : ''}. Le bien est rangé dans « Vendus ».`,
        vSigne ? `${nomProprio} passe « Vendeur signé ».` : '',
        fini ? `Le dossier de ${acquereur} est finalisé.` : rechArretee ? `La recherche de ${acquereur} pour ce bien s’arrête, ses autres recherches continuent.` : '',
        txCloses ? `Sa transaction sur ce bien est close.` : '',
      ].filter(Boolean).join(' '));
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  const calcule = honoCalc(prix);
  return (
    <Fenetre sur={correction ? `Vendu${bien.vendu_le ? ` le ${jourSuivi(bien.vendu_le)}` : ''}` : 'Le bien passe « Vendu »'} couleur={etapeDe('vendu').c}
      titre={correction ? 'Corriger l’acte' : 'La vente est signée'} sous={resume(bien)} occupe={occupe} onFermer={onFermer} large
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : correction ? 'Enregistrer la correction' : 'C’est vendu'}</button></>}>
      {correction && <div className={b.calc}>Une date, un prix ou des honoraires saisis à tort : corrige-les ici. L’étape ne change pas, et l’historique du bien garde l’ancienne et la nouvelle valeur.</div>}
      <Section ic="plume" c="#6d28d9" f="#f5f3ff" titre="L’acte">
        <div className={b.g3}>
          <Ch lib="Acte signé le"><input className={s.input} type="date" value={date} onChange={e => setDate(e.target.value)} /></Ch>
          <Ch lib="Prix de vente"><SaisieNombre v={prix} euros unite="€" off={false} onChange={changerPrix} /></Ch>
          <Ch lib="Honoraires encaissés (TTC)"><SaisieNombre v={sansHono ? null : hono} euros unite="€ TTC" off={sansHono} ph={sansHono ? 'Sans honoraires' : undefined} onChange={x => { setHono(x); setHonoTape(true); }} /></Ch>
        </div>
        {!sansHono && honoTape && calcule !== null && hono !== calcule && (
          <button type="button" className={b.lien} style={{ alignSelf: 'flex-start' }} onClick={() => { setHono(calcule); setHonoTape(false); }}>{`Reprendre ceux du mandat sur ce prix : ${euros(calcule)} TTC`}</button>
        )}
        {!sansHono && !honoTape && calcule !== null && <div className={b.calc}>Les honoraires du mandat, appliqués au prix de vente. Change-les s’ils ont été négociés.</div>}
        <label className={b.caseL}><input type="checkbox" checked={sansHono} onChange={e => setSansHono(e.target.checked)} />Vente sans honoraires (elle ne compte pas dans ton chiffre d’affaires)</label>
      </Section>
      {!correction && (offre?.client_id || proprio || bien.client_id || prevues.length > 0) && (
        <Section ic="fleche" c="#0f766e" f="#f0fdfa" titre="Et ensuite">
          <div className={b.rappels}>
            <CaseVisites prevues={prevues} on={annulerV} onChange={setAnnulerV} />
            {offre?.client_id && (
              <Suite on={finAcq} onChange={setFinAcq} ic="check" c="#1d4ed8" f="#eff6ff"
                t={`Dossier de ${acquereur} finalisé : il passe « Bien trouvé »`}
                s="Sa recherche s’arrête, ses relances en attente sont soldées. S’il a une autre recherche en cours, elle continue : il ne passe pas « Bien trouvé »." />
            )}
            {proprio && (
              <Suite on={signeV} onChange={setSigneV} ic="cle" c="#15803d" f="#f0fdf4"
                t={`${nomProprio} passe en « Vendeur signé »`}
                s="Il quitte les vendeurs en cours, sans être archivé : un ancien client, pour une recommandation ou un prochain projet." />
            )}
            <Trace t={traces.length > 1 ? 'Une ligne datée dans leur suivi' : 'Une ligne datée dans son suivi'} s={`${traces.join(' · ')}.`} />
          </div>
        </Section>
      )}
      {!correction && <div className={b.calc}>Le bien reste dans la liste, rangé dans « Vendu ». Tu pourras l’archiver quand tu voudras.</div>}
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ══ L'accompagnement (V3.48) ══════════════════════════════════════════
   Alexandre : « si je veux faire une visite sur un bien vendu, qu'un message
   m'indique quoi faire — repasser le bien en vente… ; tout doit être bridé,
   mais je dois être accompagné ». Une action que l'étape ne permet pas ouvre
   cette fenêtre : ce qui se passe, et les gestes qui y mènent. Sous
   compromis ou en pause, on peut aussi « continuer quand même ». */
export type ChoixGuide = { l: string; s?: string; ic: string; c: string; f: string; go: () => void };
export function FenGuide({ titre, sur, couleur, texte, choix, onFermer }: {
  titre: string; sur: string; couleur: string; texte: string; choix: ChoixGuide[]; onFermer: () => void;
}) {
  return (
    <Fenetre sur={sur} couleur={couleur} titre={titre} onFermer={onFermer}
      pied={<button type="button" className={s.btn} onClick={onFermer}>Fermer</button>}>
      <div className={b.guideTx}><Ic n="info" t={18} /><span>{texte}</span></div>
      {choix.length > 0 && (
        <div className={b.rappels}>
          {choix.map(x => (
            <button key={x.l} type="button" className={`${b.rappel} ${b.guideChoix}`} data-on="oui" onClick={x.go}
              style={{ ['--c' as string]: x.c, ['--f' as string]: x.f } as React.CSSProperties}>
              <span className={b.dateCIc}><Ic n={x.ic} t={15} /></span>
              <span className={b.rappelTx}><b>{x.l}</b>{x.s && <small>{x.s}</small>}</span>
              <span className={b.guideFleche}><Ic n="fleche" t={15} e={2.4} /></span>
            </button>
          ))}
        </div>
      )}
    </Fenetre>
  );
}

/* ══ Une étape avec sa raison : pause, retrait, retour en vente ═════════ */
const RAISONS: Partial<Record<EtapeVente, string[]>> = {
  suspendu: ['Le vendeur fait une pause', 'Travaux avant la vente', 'Succession en cours', 'Il attend son achat'],
  a_suivre: ['Il veut attendre', 'Il attend son achat', 'Travaux avant la vente', 'Succession en cours'],
  retire: ['Mandat expiré', 'Vendu par un autre', 'Le vendeur renonce', 'Le vendeur loue finalement'],
};
export function FenRaison({ bien, etape, titre, sur, prevues = [], offres = [], onFermer, onFait }: {
  bien: BienVente; etape: EtapeVente; titre: string; sur: string; onFermer: () => void; onFait: (b: BienVente) => void; prevues?: VisitePrevue[];
  offres?: SuiviVente[];
}) {
  /* V3.50 : l'estimation mise de côté (« Le propriétaire veut attendre »),
     ou le propriétaire qui renonce avant le mandat. */
  const miseDeCote = etape === 'a_suivre' && bien.etape === 'estimation';
  const rdvE = avantRdv(bien.donnees || {});
  const rdvAVenir = (etape === 'a_suivre' || etape === 'retire') && avantMandat(bien.etape) && !!rdvE.rdvId && !!rdvE.date && rdvE.date >= aujourdhui();
  const [annulerRdv, setAnnulerRdv] = useState(true);
  /* Retiré avec des offres encore en jeu (V3.48) : elles passent « retirées ». */
  const enJeu = etape === 'retire' ? offres.filter(o => o.statut === 'acceptee' || o.statut === 'en_attente' || o.statut === 'contre' || !o.statut) : [];
  const [retirerOffres, setRetirerOffres] = useState(true);
  /* Retiré : les visites prévues s'annulent (cochée) ; en pause : à décider (décochée). */
  const [annulerV, setAnnulerV] = useState(etape === 'retire');
  const [raison, setRaison] = useState('');
  const [reprise, setReprise] = useState('');
  const [note, setNote] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  async function valider() {
    setOccupe(true); setErreur('');
    try {
      const sansRdv = rdvAVenir && annulerRdv;
      let { bien: r } = await changerEtape(bien, etape, { commentaire: note.trim() || undefined, infos: { raison: raison.trim(), ...(reprise ? { reprise } : {}) },
        ...(sansRdv ? { donnees: { ...(bien.donnees || {}), rdvEstimation: '', rdvEstimationHeure: '', rdvEstimationRdv: '' } } : {}) });
      if (enJeu.length && retirerOffres) await offresTombees(bien, enJeu);
      if (annulerV && prevues.length && (etape === 'retire' || etape === 'suspendu')) await annulerVisitesPrevues(bien, etape === 'retire' ? 'Le bien est retiré de la vente.' : 'La vente est mise en pause.');
      if (etape === 'retire') await solderDemandesDuBien(bien);
      /* V3.50 : le rendez-vous d'estimation à venir quitte l'agenda. */
      if (sansRdv) {
        try { const p = await planifierEstimation(bien, { date: '', heure: '' }); await noterRdvEstimation(bien, p.fait, p.donnees); }
        catch (x) { signalerEchec('Le rendez-vous d’estimation, dans l’agenda', (x as Error).message); }
      }
      /* V3.50 : mise de côté, la ligne du Suivi et la relance « recontacter » ;
         retiré, les relances de l'estimation se closent. */
      if (miseDeCote) {
        const id = await estimationMiseDeCote(r, raison, reprise);
        if (id) { try { r = await poserDansBien(r.id, { relanceReprise: id }); } catch (x) { signalerEchec('Le lien vers la relance', (x as Error).message); } }
      } else if (etape === 'retire') await cloreRelancesEstimation(bien);
      onFait(r);
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  const choix = RAISONS[etape] || [];
  return (
    <Fenetre sur={sur} couleur={etapeDe(etape).c} titre={titre} sous={resume(bien)} occupe={occupe} onFermer={onFermer}
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : 'Valider'}</button></>}>
      {choix.length > 0 && <Pills options={choix.map(x => ({ v: x, l: x }))} v={raison} onChange={setRaison} />}
      <Ch lib="La raison"><input className={s.input} value={raison} onChange={e => setRaison(e.target.value)} placeholder="En quelques mots" /></Ch>
      {(etape === 'suspendu' || etape === 'a_suivre') && <Ch lib={etape === 'a_suivre' ? 'Le recontacter vers le' : 'Reprise prévue le'}><input className={s.input} type="date" value={reprise} onChange={e => setReprise(e.target.value)} /></Ch>}
      {miseDeCote && reprise && reprise >= aujourdhui() && <div className={b.calc}>{bien.client_id ? `Une relance le ${jourSuivi(reprise)} pour le recontacter, et une ligne dans son suivi.` : 'Relie le propriétaire à sa fiche pour recevoir une relance à cette date.'}</div>}
      {rdvAVenir && (
        <div className={b.rappels}>
          <Suite on={annulerRdv} onChange={setAnnulerRdv} ic="calendrier" c="#7c3aed" f="#f5f3ff"
            t={`Annuler le rendez-vous d’estimation du ${jourSuivi(rdvE.date)}${rdvE.heure ? ` à ${rdvE.heure.replace(':', ' h ')}` : ''}`} s="Il quitte ton agenda, et son suivi le dit." />
        </div>
      )}
      <Ch lib="Commentaire (facultatif)"><textarea className={s.input} rows={2} value={note} onChange={e => setNote(e.target.value)} /></Ch>
      {((etape === 'retire' || etape === 'suspendu') && prevues.length > 0) || enJeu.length > 0 ? (
        <div className={b.rappels}>
          {enJeu.length > 0 && (
            <Suite on={retirerOffres} onChange={setRetirerOffres} ic="croix" c="#b91c1c" f="#fef2f2"
              t={enJeu.length > 1 ? `Les ${enJeu.length} offres en cours passent « retirées »` : `L’offre de ${enJeu[0].qui || 'l’acquéreur'} passe « retirée »`}
              s={enJeu.map(o => `${o.qui || 'Acquéreur'} · ${euros(prixRetenu(o) || 0)}`).join(' · ')} />
          )}
          {(etape === 'retire' || etape === 'suspendu') && <CaseVisites prevues={prevues} on={annulerV} onChange={setAnnulerV} />}
        </div>
      ) : null}
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ══ Annuler un mandat noté par erreur (V3.42) ═══════════════════════════
   Alexandre : « pourquoi je n'ai pas de fonction dans mon CRM, pourquoi je
   suis obligé de passer par Supabase ? ». Un mandat noté sur la fiche pour
   un test, ou sur le mauvais bien : le n°, le type, les dates et le scan
   joint quittent la fiche, le bien revient d'où il venait (l'estimation, en
   général), le prix peut revenir au prix conseillé. L'historique le dit.
   Un mandat signé dans Documents ne s'annule pas d'ici : c'est « Marquer
   annulé » dans Documents, qui propose ensuite quoi faire de la fiche. */
export function FenAnnulerMandat({ bien, depuis, signeDoc, enRoute, onFermer, onFait, onDocuments }: {
  bien: BienVente;
  /* L'étape d'où le bien était parti pour le mandat (etapeAvantMandat). */
  depuis: EtapeVente;
  /* Le mandat signé dans Documents, encore valable : on renvoie vers lui. */
  signeDoc: { id: string; numero: string | null } | null;
  /* Un mandat en préparation dans Documents : il n'est pas touché. */
  enRoute: boolean;
  onFermer: () => void; onFait: (b: BienVente) => void; onDocuments: (id: string) => void;
}) {
  const d = bien.donnees || {};
  const numero = txt(d, 'mandatNumero') || bien.mandat_numero || '';
  const prix = num(d, 'prix');
  const conseille = num(d, 'prixConseille');
  const a = argentBien(d);
  /* Passé « En vente » sans mandat signé noté (créé directement en vente,
     le mandat encore en préparation) : il n'y a rien à effacer, le bien
     revient simplement en arrière. */
  const noteSigne = !!txt(d, 'mandatDate');
  const [vers, setVers] = useState<EtapeVente>(depuis);
  const [choixPrix, setChoixPrix] = useState<'conseille' | 'garder'>('conseille');
  const [hono, setHono] = useState<'garder' | 'effacer'>('garder');
  const [raison, setRaison] = useState(noteSigne ? 'Saisi par erreur' : 'Le mandat n’est pas encore signé');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const fichier = !!(d.mandatFichier && typeof d.mandatFichier === 'object');
  const leMandat = `Le mandat${numero ? ` n° ${numero}` : ''}`;

  if (signeDoc) {
    return (
      <Fenetre sur="Le mandat est signé dans Documents" couleur={etapeDe('mandat').c} titre="Annuler ce mandat" sous={resume(bien)} onFermer={onFermer}
        pied={<><button type="button" className={s.btn} onClick={onFermer}>Fermer</button>
          <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={() => onDocuments(signeDoc.id)}><Ic n="plume" t={15} />Ouvrir dans Documents</button></>}>
        <div className={b.calc}>{`${signeDoc.numero ? `Le mandat n° ${signeDoc.numero}` : 'Ce mandat'} a été signé dans Documents. Pour l’annuler (rétractation, fin du mandat, erreur), ouvre-le dans Documents et choisis « Marquer annulé » : le CRM te demande ensuite quoi faire de cette fiche, la retirer de la vente ou la ramener à l’estimation.`}</div>
      </Fenetre>
    );
  }

  async function valider() {
    setOccupe(true); setErreur('');
    try {
      const r = await annulerMandatNote(bien, { vers, prix: choixPrix, hono, raison });
      onFait(r);
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  const etapes: EtapeVente[] = depuis === 'retire' ? ['estimation', 'a_suivre', 'retire'] : ['estimation', 'a_suivre'];
  const libVers: Record<string, string> = { estimation: 'L’estimation', a_suivre: 'À suivre', retire: 'Retiré' };
  return (
    <Fenetre sur={`Le bien revient « ${etapeDe(vers).lib} »`} couleur={etapeDe(vers).c} titre={noteSigne ? 'Annuler ce mandat' : 'Le mandat n’est pas encore signé'} sous={resume(bien)} occupe={occupe} onFermer={onFermer}
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>{noteSigne ? 'Garder le mandat' : 'Laisser en vente'}</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : noteSigne ? 'Retirer le mandat' : 'Revenir en arrière'}</button></>}>
      <div className={`${b.ventile} ${b.ventileManque}`}>
        <Ic n="info" t={16} />
        <span>{noteSigne
          ? `Pour un mandat noté par erreur : un test, le mauvais bien. ${leMandat}, son type et ses dates${fichier ? ', et le scan joint,' : ''} quittent la fiche. L’historique garde une ligne qui le dit.`
          : 'Le bien est « En vente » alors qu’aucun mandat signé n’y est noté. Il revient en arrière ; il repassera « En vente » tout seul quand le mandat sera signé dans Documents.'}</span>
      </div>
      <ChG lib="Le bien revient à"><Pills options={etapes.map(x => ({ v: x, l: libVers[x] }))} v={vers} onChange={setVers} /></ChG>
      {conseille && prix && conseille !== prix ? (
        <ChG lib="Le prix">
          <Pills options={[{ v: 'conseille', l: `Le prix conseillé : ${euros(conseille)}` }, { v: 'garder', l: `Garder ${euros(prix)}` }]} v={choixPrix} onChange={setChoixPrix} />
        </ChG>
      ) : null}
      {a.hono !== null && (
        <ChG lib={`Les honoraires notés (${euros(a.hono)})`}>
          <Pills options={[{ v: 'garder', l: 'Les garder' }, { v: 'effacer', l: 'Les effacer' }]} v={hono} onChange={setHono} />
        </ChG>
      )}
      {enRoute && <div className={s.note}>Le mandat en préparation dans Documents n’est pas touché : tu pourras le finir et le faire signer.</div>}
      <Ch lib="Pourquoi (pour l’historique)"><input className={s.input} value={raison} onChange={e => setRaison(e.target.value)} placeholder="Ex : saisi pour un test" /></Ch>
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ══ Changer le prix (l'ancien reste dans l'historique) ══════════════════
   V3.32 (Alexandre : « il faut aussi une case honoraires si les honoraires
   changent ») : « Les honoraires changent aussi » ouvre le taux ou le forfait,
   le net vendeur se recalcule, l'historique garde les deux. Pendant un mandat
   signé dans le CRM, « Préparer l'avenant au mandat » fait le brouillon de
   l'avenant, prérempli (nouveau prix, nouveaux honoraires). */
export type ApresPrix = { avenant: { prix: number | null; hono: Donnees | null } | null };
export function FenPrix({ bien, mandatSigne = false, onFermer, onFait }: {
  bien: BienVente;
  /* Un mandat signé dans le CRM : l'avenant peut se préparer d'ici. */
  mandatSigne?: boolean;
  onFermer: () => void; onFait: (b: BienVente, x?: ApresPrix) => void;
}) {
  const d = bien.donnees || {};
  const ancien = num(d, 'prix');
  const avantA = argentBien(d);
  const [prix, setPrix] = useState<number | null>(ancien);
  const [changeHono, setChangeHono] = useState(false);
  const [honoMode, setHonoMode] = useState<'taux' | 'forfait'>(d.honoMode === 'forfait' ? 'forfait' : 'taux');
  const [taux, setTaux] = useState<number | null>(num(d, 'taux'));
  const [forfait, setForfait] = useState<number | null>(num(d, 'forfait'));
  const [avenant, setAvenant] = useState(mandatSigne);
  const [note, setNote] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const hono: Donnees | null = changeHono ? { charge: d.charge || 'acquereur', honoMode, ...(honoMode === 'taux' ? { taux, forfait: null } : { forfait, taux: null }) } : null;
  const apres = argentBien({ ...d, prix, ...(hono || {}) });
  const prixChange = !!prix && prix !== ancien;
  const honoChange = !!hono && apres.hono !== null && apres.hono !== avantA.hono;
  async function valider() {
    if (!prixChange && !honoChange) { onFermer(); return; }
    if (changeHono && apres.hono === null) { setErreur(honoMode === 'taux' ? 'Écris le nouveau taux.' : 'Écris le nouveau forfait.'); return; }
    setOccupe(true); setErreur('');
    try {
      /* V3.48 : le texte de l'annonce qui citait l'ancien prix cite le nouveau,
         chez nous et chez les acheteurs qui ont reçu le bien. */
      const vieux = ancien ? euros(ancien) : '', neuf = prix ? euros(prix) : '';
      const texte = typeof d.annonceTexte === 'string' ? d.annonceTexte : '';
      const annonce = prixChange && vieux && texte.includes(vieux) ? { annonceTexte: texte.split(vieux).join(neuf) } : {};
      const r = await enregistrerBien(bien.id, { ...d, prix, ...(hono || {}), ...annonce }, d);
      if (prixChange && vieux) await majPrixDansAnnonces(bien.id, vieux, neuf);
      /* L'historique dit ce qui a changé (FicheBien, « Prix et honoraires changés »). */
      await ajouterSuivi({
        bien_id: bien.id, type: 'prix', montant: prix, commentaire: note.trim() || null,
        donnees: { ancien, ...(honoChange ? { honoAvant: avantA.hono, honoApres: apres.hono } : {}) },
      });
      onFait(r, { avenant: mandatSigne && avenant ? { prix: prixChange ? prix : null, hono: honoChange ? hono : null } : null });
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre sur="Garde l’historique" couleur="#8b5cf6" titre="Changer le prix ou les honoraires" sous={resume(bien)} occupe={occupe} onFermer={onFermer}
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : honoChange && !prixChange ? 'Changer les honoraires' : honoChange ? 'Changer le prix et les honoraires' : 'Changer le prix'}</button></>}>
      <div className={b.g2}>
        <Ch lib="Prix affiché aujourd’hui"><input className={s.input} disabled value={ancien ? euros(ancien) : '—'} /></Ch>
        <Ch lib="Nouveau prix"><SaisieNombre v={prix} euros unite="€" off={false} onChange={setPrix} /></Ch>
      </div>
      {/* Les honoraires : une case, qui ouvre le taux ou le forfait. */}
      <label className={b.caseHono}>
        <input type="checkbox" checked={changeHono} onChange={e => setChangeHono(e.target.checked)} />
        <span><b>Les honoraires changent aussi</b><small>{avantA.hono !== null ? `Aujourd’hui : ${euros(avantA.hono)} TTC${avantA.taux ? ` (${pourcent(avantA.taux)})` : ''}, à la charge ${avantA.acq ? 'de l’acquéreur' : 'du vendeur'}` : 'Aujourd’hui : pas encore renseignés'}</small></span>
      </label>
      {changeHono && (
        <div className={b.g2}>
          <ChG lib="Honoraires"><Pills options={[{ v: 'taux', l: 'En %' }, { v: 'forfait', l: 'Au forfait' }]} v={honoMode} onChange={setHonoMode} /></ChG>
          {honoMode === 'taux'
            ? <Ch lib={d.charge !== 'vendeur' ? 'Nouveau taux, du prix net vendeur' : 'Nouveau taux'}><SaisieNombre v={taux} unite="% TTC" off={false} onChange={setTaux} ph="Ex : 4" lib="Taux" /></Ch>
            : <Ch lib="Nouveau forfait"><SaisieNombre v={forfait} euros unite="€ TTC" off={false} onChange={setForfait} ph="Ex : 15 000" lib="Forfait" /></Ch>}
        </div>
      )}
      {(prixChange || honoChange) && (
        <div className={b.calc}>
          {prixChange && ancien ? (prix! < ancien ? `Baisse de ${euros(ancien - prix!)} (−${pourcent(((ancien - prix!) / ancien) * 100)}).` : `Hausse de ${euros(prix! - ancien)}.`) : ''}
          {honoChange ? `${prixChange ? ' ' : ''}Honoraires : ${avantA.hono !== null ? `${euros(avantA.hono)} → ` : ''}${euros(apres.hono as number)} TTC.` : ''}
          {apres.net ? <>{' '}Net vendeur : <b>{euros(apres.net)}</b>{!honoChange && apres.hono !== null ? `, honoraires ${euros(apres.hono)} TTC` : ''}.</> : null}
        </div>
      )}
      <Ch lib="Pourquoi (pour l’historique)"><input className={s.input} value={note} onChange={e => setNote(e.target.value)} placeholder="Ex : retours de visite, pas d’offre en 6 semaines" /></Ch>
      {mandatSigne && (prixChange || honoChange) && (
        <label className={b.caseHono}>
          <input type="checkbox" checked={avenant} onChange={e => setAvenant(e.target.checked)} />
          <span><b>Préparer l’avenant au mandat</b><small>{'Pendant le mandat, un changement de prix ou d’honoraires se signe par un avenant : il sera prérempli dans Documents, à relire et à faire signer.'}</small></span>
        </label>
      )}
      <div className={b.calc}>Les acheteurs à qui le bien a été présenté voient le nouveau prix dans leur espace, et dans le texte de l’annonce s’il citait l’ancien.</div>
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ── Ce qui gêne le créneau choisi (V3.50) ──
   Une date passée (une visite déjà faite qu'on note après coup), et ce qui
   occupe déjà ce créneau dans l'agenda : un avertissement, jamais un refus. */
const heureParisMaintenant = () => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
function AlerteCreneau({ date, heure, duree, sauf }: { date: string; heure: string; duree: number; sauf?: { visite?: string; suivi?: string } }) {
  const [pris, setPris] = useState<{ cle: string; l: CreneauPris[] }>({ cle: '', l: [] });
  const cle = `${date}|${heure}|${duree}`;
  const sv = sauf?.visite || '', ss = sauf?.suivi || '';
  useEffect(() => {
    let vivant = true;
    const t = setTimeout(() => {
      creneauxPris(date, heure, duree, { visite: sv || undefined, suivi: ss || undefined })
        .then(l => { if (vivant) setPris({ cle, l }); }).catch(() => { if (vivant) setPris({ cle, l: [] }); });
    }, 300);
    return () => { vivant = false; clearTimeout(t); };
  }, [cle, date, heure, duree, sv, ss]);
  const passe = !!date && (date < aujourdhui() || (date === aujourdhui() && !!heure && heure.slice(0, 5) < heureParisMaintenant()));
  const l = pris.cle === cle ? pris.l : [];
  if (!passe && !l.length) return null;
  const h = (d: Date) => `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`.replace(' h 00', ' h');
  return (
    <div className={`${b.ventile} ${b.ventileManque}`}>
      <Ic n="info" t={15} />
      <span>
        {passe && <>{'Cette date est passée : tu notes une visite déjà faite ? Elle arrivera en « compte rendu à faire ».'}</>}
        {passe && l.length > 0 && <br />}
        {l.length > 0 && `Ce créneau est déjà pris : ${l.map(x => `${x.titre}, de ${h(x.debut)} à ${h(x.fin)}`).join(' ; ')}.`}
      </span>
    </div>
  );
}

/* ══ Une visite ════════════════════════════════════════════════════════
   V3.50 : la date passée et un créneau déjà pris le disent ; le dernier
   acheteur choisi revient d'office (s'il connaît ce bien) ; `pour` : une
   2e visite, l'acheteur déjà choisi. */
const CLE_DERNIER = 'emilio.biens.dernierAcheteur';
const lireDernier = (options: OptionAcheteur[]): ChoixA => {
  try {
    const x = JSON.parse(localStorage.getItem(CLE_DERNIER) || 'null') as { clientId?: string; rechercheId?: string | null } | null;
    const o = x ? options.find(y => y.clientId === x.clientId && (y.rechercheId || null) === (x.rechercheId || null)) : undefined;
    return o ? { mode: 'crm', o } : null;
  } catch { return null; }
};
export function FenVisite({ bien, options, recherches, pour, onFermer, onFait }: {
  bien: BienVente; options: OptionAcheteur[]; recherches: RechercheMini[]; onFermer: () => void; onFait: () => void;
  pour?: ChoixA;
}) {
  const [choix, setChoix] = useState<ChoixA>(() => pour ?? lireDernier(options));
  const [date, setDate] = useState(aujourdhui());
  const [heure, setHeure] = useState('18:00');
  const [duree, setDuree] = useState(45);
  const [note, setNote] = useState(pour ? 'Deuxième visite' : '');
  const [agenda, setAgenda] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  async function valider() {
    if (!choix || (choix.mode === 'libre' && !choix.nom.trim())) { setErreur('Qui visite ?'); return; }
    if (!date) { setErreur('La date de la visite ?'); return; }
    setOccupe(true); setErreur('');
    try {
      const x = { date, heure, duree, commentaire: note.trim() };
      if (choix.mode === 'crm') {
        if (!choix.o.rechercheId) throw new Error(`${choix.o.nom} n’a pas de recherche active : note la visite « hors du CRM », ou ouvre-lui une recherche.`);
        await visiteAcheteur(bien, choix.o.clientId, choix.o.rechercheId, x);
        try { localStorage.setItem(CLE_DERNIER, JSON.stringify({ clientId: choix.o.clientId, rechercheId: choix.o.rechercheId })); } catch { /* sans mémoire, rien de grave */ }
      } else {
        await visiteExterne(bien, choix.nom.trim(), choix.tel.trim(), x, agenda);
      }
      onFait();
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre sur="Visite" couleur="#8b5cf6" titre={pour ? 'Planifier une 2e visite' : 'Planifier une visite'} sous={resume(bien)} occupe={occupe} onFermer={onFermer}
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : 'Enregistrer la visite'}</button></>}>
      <ChoixAcheteur options={options} recherches={recherches} choix={choix} onChoix={setChoix} libre="Qui visite" />
      <div className={b.groupe}>
        <div className={b.groupeT}><Ic n="calendrier" t={14} />Quand</div>
        <div className={b.g3}>
          <Ch lib="Date"><input className={s.input} type="date" value={date} onChange={e => setDate(e.target.value)} /></Ch>
          <Ch lib="Heure"><input className={s.input} type="time" value={heure} onChange={e => setHeure(e.target.value)} /></Ch>
          <Ch lib="Durée"><select className={b.select} value={duree} onChange={e => setDuree(Number(e.target.value))}>{[30, 45, 60, 90].map(x => <option key={x} value={x}>{`${x} min`}</option>)}</select></Ch>
        </div>
        <AlerteCreneau date={date} heure={heure} duree={duree} />
        <Ch lib="Note (facultatif)"><input className={s.input} value={note} onChange={e => setNote(e.target.value)} placeholder="Ex : vient avec son père ; deuxième visite" /></Ch>
      </div>
      {choix?.mode === 'libre'
        ? <label className={b.caseL}><input type="checkbox" checked={agenda} onChange={e => setAgenda(e.target.checked)} />L’ajouter à l’agenda, avec l’adresse et les codes d’accès</label>
        : <div className={b.calc}>Une visite comme les autres : dans l’agenda, la page Visites et son espace. Le bien s’ajoute à son dossier s’il n’y est pas encore.</div>}
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ══ Déplacer une visite (V3.50) ═════════════════════════════════════════
   Depuis sa carte. Un acheteur suivi : la visite, son rappel dans les
   Relances et une ligne « Visite déplacée » dans son Suivi ; hors CRM : sa
   ligne et son rendez-vous de l'agenda. */
export type VisiteADeplacer = { qui: string; ymd: string; heure: string; crm?: VisiteRow; libre?: SuiviVente };
export function FenDeplacerVisite({ bien, v, onFermer, onFait }: { bien: BienVente; v: VisiteADeplacer; onFermer: () => void; onFait: () => void }) {
  const dl = (v.libre?.donnees || {}) as Record<string, unknown>;
  const [date, setDate] = useState(v.ymd || aujourdhui());
  const [heure, setHeure] = useState(v.heure || '');
  const [duree, setDuree] = useState<number>(v.crm ? Number(v.crm.duree_min) || 45 : Number(dl.duree) || 45);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const dureeAvant = v.crm ? Number(v.crm.duree_min) || 45 : Number(dl.duree) || 45;
  const pareil = date === v.ymd && heure === v.heure && duree === dureeAvant;
  async function valider() {
    if (!date) { setErreur('La nouvelle date ?'); return; }
    if (v.libre && !heure) { setErreur('L’heure de la visite ?'); return; }
    if (pareil) { onFermer(); return; }
    setOccupe(true); setErreur('');
    try {
      if (v.crm) await deplacerVisiteCRM(bien, v.crm, { date, heure, duree });
      else if (v.libre) await deplacerVisiteLibre(bien, v.libre, { date, heure, duree });
      onFait();
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre sur="Visite" couleur="#8b5cf6" titre={`Déplacer la visite de ${v.qui}`} sous={resume(bien)} occupe={occupe} onFermer={onFermer}
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : 'Déplacer la visite'}</button></>}>
      <div className={b.calc}>{`Prévue le ${v.ymd ? jourSuivi(v.ymd) : '?'}${v.heure ? ` à ${v.heure.replace(':', ' h ')}` : ''}.`}</div>
      <div className={b.g3}>
        <Ch lib="Nouvelle date"><input className={s.input} type="date" value={date} onChange={e => setDate(e.target.value)} /></Ch>
        <Ch lib="Heure"><input className={s.input} type="time" value={heure} onChange={e => setHeure(e.target.value)} /></Ch>
        <Ch lib="Durée"><select className={b.select} value={duree} onChange={e => setDuree(Number(e.target.value))}>{[30, 45, 60, 90].map(x => <option key={x} value={x}>{`${x} min`}</option>)}</select></Ch>
      </div>
      <AlerteCreneau date={date} heure={heure} duree={duree} sauf={{ visite: v.crm?.id, suivi: v.libre?.id }} />
      <div className={b.calc}>{v.crm
        ? 'Son rappel dans tes Relances suit la nouvelle date, et son suivi dit « Visite déplacée ». Le mail de rappel pourra repartir depuis la page Visites.'
        : typeof dl.rdv_id === 'string' && dl.rdv_id ? 'Son rendez-vous dans l’agenda se déplace aussi.' : 'Elle n’est pas dans l’agenda : seule sa ligne dans l’historique du bien change.'}</div>
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ══ Une note dans l'historique ══════════════════════════════════════════ */
export function FenNote({ bien, onFermer, onFait }: { bien: BienVente; onFermer: () => void; onFait: () => void }) {
  const [t, setT] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  async function valider() {
    if (!t.trim()) { onFermer(); return; }
    setOccupe(true);
    try { await ajouterSuivi({ bien_id: bien.id, type: 'note', commentaire: t.trim() }); onFait(); }
    catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre titre="Ajouter une note" sous="Un appel du vendeur, un retour d’agence, une idée : elle se range dans l’historique du bien." occupe={occupe} onFermer={onFermer}
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />Enregistrer</button></>}>
      <textarea className={s.input} rows={4} autoFocus value={t} onChange={e => setT(e.target.value)} placeholder="Ex : le vendeur accepte de baisser à 870 000 € si une offre arrive avant fin octobre" />
      <Erreur t={erreur} />
    </Fenetre>
  );
}
