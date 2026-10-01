'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import AvatarContact, { personneDe } from '@/components/contacts/AvatarContact';
import { createPortal } from 'react-dom';
import { euros } from '@/lib/mandat';
import { num, txt } from '@/lib/actes';
import {
  argentBien, avantMandat, dateLongue as jourSuivi, estimationFaite, etapeDe, honorairesPour, montantActuel, pourcent, pretPourEstimer, texteEstimation, titreBien,
  type BienVente, type Donnees, type EtapeVente, type SuiviVente,
} from '@/lib/biens-vente';
import { Croix, Ic } from '@/components/documents/ApercuActe';
import { signalerEchec } from '@/lib/ecritures';
import { SaisieNombre, lireClients } from './ChampsBien';
import {
  ajouterSuivi, annulerMandatNote, changerEtape, cloreRappelsCompromis, cloreRelanceOffre, compromisTombe, creerNotaire, deposerPiece, enregistrerBien, enregistrerOffre, eurosSuivi, lireNotaires,
  finaliserAcquereur, ligneNotaires, lireNotaire, majSuivi, modifierOffre, nomClient, notaireDepuisContact, noterJalon, pauseAcquereur, poserRappels, refuserAutresOffres, vendeurSigne, visiteAcheteur, visiteExterne,
  type CleRappel, type ClientMini, type ContactNotaire, type NotaireChoisi, type Rappel, type RechercheMini, type SuiteTombe,
} from './outils';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';

/* ═══ Les fenêtres de la fiche d'un bien ══════════════════════════════════
   Les changements d'étape (mandat, offre, compromis, vente, pause,
   retrait), le prix, une visite, une note. Chacune écrit ce qu'il faut et
   rend la main à la fiche, qui se recharge. Posées sur <body> : la page
   qui les contient est animée (transform), un élément fixe y serait
   prisonnier. */

/* La date du jour, à l'heure de Paris (pas en temps universel). */
const aujourdhui = () => new Date().toLocaleDateString('sv-SE');
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
];
export function FenNouveau({ occupe, erreur, pour, onFermer, onChoisir }: { occupe: boolean; erreur: string; pour?: string; onFermer: () => void; onChoisir: (e: EtapeVente) => void }) {
  return (
    <Fenetre sur={pour ? `Le bien de ${pour}` : undefined} titre="Nouveau bien : où en est-il ?" sous="Le formulaire ne pose que les questions utiles à cette étape. Les autres arrivent quand le bien avance." occupe={occupe} onFermer={onFermer}
      pied={<button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>}>
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

/* ══ Un bien à suivre passe à l'estimation ═══════════════════════════════
   Le rendez-vous, et le montant si on l'a déjà (sinon : « Définir
   l'estimation », sur la fiche, quand il viendra). */
export function FenEstimation({ bien, onFermer, onFait }: { bien: BienVente; onFermer: () => void; onFait: (b: BienVente) => void }) {
  const d = bien.donnees || {};
  const [rdv, setRdv] = useState(txt(d, 'rdvEstimation'));
  const [maintenant, setMaintenant] = useState<'oui' | 'non'>(estimationFaite(d) ? 'oui' : 'non');
  const [e, setE] = useState<Estim>(() => lireEstim(d));
  const [note, setNote] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  async function valider() {
    if (maintenant === 'oui' && e.basse && e.haute && e.basse > e.haute) { setErreur('La fourchette basse est au-dessus de la haute.'); return; }
    setOccupe(true); setErreur('');
    const montant = maintenant === 'oui' && (e.basse || e.haute || e.prix);
    try {
      const { bien: r } = await changerEtape(bien, 'estimation', {
        donnees: { ...d, rdvEstimation: rdv, ...(maintenant === 'oui' ? versDonnees(e) : {}) },
        commentaire: [montant ? texteEstimation(e) : '', note.trim()].filter(Boolean).join('\n') || undefined,
        infos: { ...(rdv ? { rdv } : {}), ...(montant ? { basse: e.basse, haute: e.haute, prix: e.prix } : {}) },
      });
      onFait(r);
    } catch (x) { setErreur((x as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre sur="Le bien passe « Estimation »" couleur={etapeDe('estimation').c} titre="On passe à l’estimation" sous={resume(bien)} occupe={occupe} onFermer={onFermer} vive
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : 'Passer à l’estimation'}</button></>}>
      <Ch lib="Rendez-vous d’estimation (facultatif)"><input className={s.input} type="date" value={rdv} onChange={x => setRdv(x.target.value)} /></Ch>
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
   laisse une ligne dans l'historique du bien. */
export function FenDefinirEstimation({ bien, onFermer, onFait }: { bien: BienVente; onFermer: () => void; onFait: (b: BienVente) => void }) {
  const d = bien.donnees || {};
  const avant = lireEstim(d);
  const [e, setE] = useState<Estim>(avant);
  const [rdv, setRdv] = useState(txt(d, 'rdvEstimation'));
  const [avis, setAvis] = useState(txt(d, 'avisEnvoye'));
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const dejaFaite = estimationFaite(d);
  async function valider() {
    if (e.basse && e.haute && e.basse > e.haute) { setErreur('La fourchette basse est au-dessus de la haute.'); return; }
    setOccupe(true); setErreur('');
    let r: BienVente;
    try { r = await enregistrerBien(bien.id, { ...d, ...versDonnees(e), rdvEstimation: rdv, avisEnvoye: avis }, d); }
    catch (x) { setErreur((x as Error).message); setOccupe(false); return; }
    if (avant.basse !== e.basse || avant.haute !== e.haute || avant.prix !== e.prix) {
      try { await ajouterSuivi({ bien_id: bien.id, type: 'note', commentaire: texteEstimation(e), donnees: { estimation: true, basse: e.basse, haute: e.haute, prix: e.prix } }); }
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
      <div className={b.g2}>
        <Ch lib="Rendez-vous d’estimation"><input className={s.input} type="date" value={rdv} onChange={x => setRdv(x.target.value)} /></Ch>
        <div className={b.chF}>
          <span>Avis de valeur envoyé le</span>
          <input className={s.input} type="date" value={avis} onChange={x => setAvis(x.target.value)} aria-label="Avis de valeur envoyé le" />
          {!avis && <button type="button" className={b.lien} style={{ alignSelf: 'flex-start' }} onClick={() => setAvis(aujourdhui())}>Envoyé aujourd’hui</button>}
        </div>
      </div>
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ══ Le mandat est signé (ou : remettre en vente) ═════════════════════════ */
export function FenMandat({ bien, onFermer, onFait }: { bien: BienVente; onFermer: () => void; onFait: (b: BienVente) => void }) {
  const d = bien.donnees || {};
  /* Une reprise : le bien a déjà été en vente, mandat signé. Pas quand il
     est passé « En vente » avant la signature, ni retiré avant tout mandat
     (V3.42) : c'est alors la signature qu'on note. */
  const sansMandat = !txt(d, 'mandatDate') && (bien.etape === 'mandat' || (bien.etape === 'retire' && !bien.en_vente_le));
  const reprise = !avantMandat(bien.etape) && !sansMandat;
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
    setOccupe(true); setErreur('');
    try {
      /* Le prix conseillé à l'estimation est gardé à part (V3.32) : « prix »
         devient le prix affiché, et l'onglet Le bien montre encore ce qui
         avait été estimé. */
      const conseille = num(d, 'prixConseille') ?? (avantMandat(bien.etape) || (bien.etape === 'retire' && !bien.en_vente_le) ? num(d, 'prix') : null);
      const f = scan ? await deposerPiece(bien.id, 'mandatsigne', scan) : null;
      const donnees: Donnees = { ...d, mandatType: type, mandatNumero: numero.trim(), mandatDate: date, mandatFin: finM, prix, ...hono, ...(conseille ? { prixConseille: conseille } : {}),
        ...(f && scan ? { mandatFichier: { chemin: f.chemin, nom: f.nom, taille: scan.size, le: aujourdhui() } } : {}) };
      const { bien: r } = await changerEtape(bien, 'mandat', { donnees, commentaire: raison.trim() || undefined, infos: { type, numero: numero.trim(), date, fin: finM, prix } });
      const titre = bien.titre || titreBien(d);
      /* Le compromis est tombé : ses rappels se closent (V3.45), la recherche
         de l'acquéreur reprend, les deux Suivis le disent (V3.47). */
      if (bien.etape === 'compromis') { await cloreRappelsCompromis(bien.id); await compromisTombe(bien, titre, raison); }
      /* Le mandat signé, dans le Suivi du vendeur (V3.47). */
      if (!reprise && bien.client_id) {
        const sorte = type === 'exclusif' ? 'exclusif' : type === 'semi' ? 'semi-exclusif' : 'simple';
        await noterJalon(bien, 'mandat', { vendeur: {
          clientId: bien.client_id, titre: `📋 Mandat de vente signé le ${jourSuivi(date)}`,
          texte: [titre, `Mandat ${sorte}${numero.trim() ? ` n° ${numero.trim()}` : ''}${finM ? ` · jusqu’au ${jourSuivi(finM)}` : ''}`, `Prix affiché : ${eurosSuivi(prix)}`],
        } });
      }
      onFait(r);
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre sur={reprise ? 'Le bien repasse « En vente »' : 'Le bien passe « En vente »'} couleur={etapeDe('mandat').c}
      titre={reprise ? 'Remettre en vente' : 'Le mandat est signé'} sous={resume(bien)} occupe={occupe} onFermer={onFermer}
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
      {reprise && <Ch lib="Pourquoi (pour l’historique)"><input className={s.input} value={raison} onChange={e => setRaison(e.target.value)} placeholder="Ex : l’offre est tombée, le vendeur reprend la vente" /></Ch>}
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
      if (passer && bien.etape !== 'offre') {
        const { bien: r } = await changerEtape(bien, 'offre', { infos: { offre: ligne.id, montant, qui } });
        onFait(r);
      } else onFait(null);
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  const proprioNom = proprio ? proprio.prenom || nomClient(proprio) : 'le propriétaire';
  const dejaJointe = !!tx(ex.chemin);
  return (
    <Fenetre sur={existante ? `L’offre de ${existante.qui || 'l’acquéreur'}` : passer && bien.etape !== 'offre' ? 'Le bien passe « Sous offre »' : 'Une offre de plus'} couleur={etapeDe('offre').c}
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
      {!existante && bien.etape !== 'offre' && (
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
      for (const k of ['sru', 'pret', 'acte']) o[k] = { on: !!rappelsAvant[k], ...(rappelsLe[k] ? { le: rappelsLe[k] } : {}) };
    }
    return o;
  });
  const rappels = defs.map(x => {
    const c = choixR[x.cle] || {};
    const le = c.le || (x.base ? plusJours(x.base, x.ecart) : '');
    const passe = !!le && le < aujourdhui();
    const on = c.on ?? (!!le && !passe && !!x.client && !(x.cle === 'pret' && comptant));
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
        onFait(null);
        return;
      }
      if (offre && offre.statut !== 'acceptee') await majSuivi(offre.id, { statut: 'acceptee', donnees: { ...offre.donnees, reponse_le: aujourdhui() } });
      const { bien: r, ligne } = await changerEtape(bien, 'compromis', { infos });
      const ids = await poserRappels(liste, {});
      const pause = offre && offre.client_id && pauseAcq ? await pauseAcquereur(offre) : null;
      if (Object.keys(ids).length || pause) {
        try { await majSuivi(ligne.id, { donnees: { ...ligne.donnees, rappels: ids, rappelsLe: rappelsLeNouv, ...(pause ? { acqPause: pause } : {}) } }); }
        catch (e) { signalerEchec('Le compromis : ses rappels et la recherche de l’acquéreur', (e as Error).message); }
      }
      if (refuserAutres && autresOuvertes.length) await refuserAutresOffres(bien, offres, offre?.id || null);
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
      <Section ic="horloge" c="#c2410c" f="#fff7ed" titre="Les rappels, dans tes Relances">
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
      </Section>
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
export function FenCompromisTombe({ bien, compromis, offres, clientsNoms, onFermer, onFait }: {
  bien: BienVente; compromis: SuiviVente | null; offres: SuiviVente[]; clientsNoms?: Record<string, string>;
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
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const choisirRaison = (x: string) => { setRaison(x); if (x === 'Le vendeur se retire') setSuiteBien('retire'); };
  async function valider() {
    setOccupe(true); setErreur('');
    try {
      const { bien: r } = await changerEtape(bien, suiteBien, { infos: { raison: raison.trim(), compromisTombe: true } });
      await cloreRappelsCompromis(bien.id);
      await compromisTombe(bien, titre, raison, { bien: suiteBien, acq: suiteAcq }, compromis);
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
function Trace({ t, s: sous }: { t: string; s: string }) {
  return (
    <div className={b.rappel} data-on="oui" style={{ ['--c' as string]: '#475569', ['--f' as string]: '#f8fafc' } as React.CSSProperties}>
      <div className={b.rappelCase} style={{ cursor: 'default' }}>
        {/* La place de la case, pour que l'icône s'aligne sur celles du dessus. */}
        <span style={{ width: 17, flexShrink: 0 }} aria-hidden="true" />
        <span className={b.dateCIc}><Ic n="historique" t={15} /></span>
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
   du parcours — l'acquéreur « Bien trouvé », le vendeur « Vendeur signé »). */
export function FenVendu({ bien, compromis, offres = [], proprio = null, onFermer, onFait }: {
  bien: BienVente; compromis: SuiviVente | null; onFermer: () => void; onFait: (b: BienVente) => void;
  offres?: SuiviVente[]; proprio?: ClientMini | null;
}) {
  const c = (compromis?.donnees || {}) as Record<string, unknown>;
  const a = argentBien(bien.donnees || {});
  const [date, setDate] = useState(typeof c.acte === 'string' && c.acte <= aujourdhui() ? c.acte : aujourdhui());
  const [prix, setPrix] = useState<number | null>(typeof c.prix === 'number' ? c.prix : a.prix);
  const [hono, setHono] = useState<number | null>(typeof c.hono === 'number' ? c.hono : a.hono);
  const offre = offres.find(o => o.id === c.offre) || (offres.filter(o => o.statut === 'acceptee').length === 1 ? offres.find(o => o.statut === 'acceptee') : undefined) || null;
  const acquereur = offre?.qui || (typeof c.acquereur === 'string' ? c.acquereur : '') || 'l’acquéreur';
  const [finAcq, setFinAcq] = useState(true);
  const [signeV, setSigneV] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const titre = bien.titre || titreBien(bien.donnees || {});
  const nomProprio = proprio ? nomClient(proprio) : '';
  const traces = [proprio || bien.client_id ? `« Vente signée — acte authentique le ${jourSuivi(date)} » chez ${nomProprio || 'le vendeur'}` : '', offre?.client_id ? `« Achat signé » chez ${acquereur}` : ''].filter(Boolean);
  async function valider() {
    setOccupe(true); setErreur('');
    try {
      const { bien: r } = await changerEtape(bien, 'vendu', { vendu_le: date, infos: { prix, hono, acte: date, acquereur: c.acquereur || offre?.qui || null } });
      /* Les rappels du compromis encore en attente n'ont plus d'objet (V3.45). */
      await cloreRappelsCompromis(bien.id);
      const fini = finAcq && offre?.client_id ? await finaliserAcquereur(offre.client_id) : false;
      const vSigne = signeV && proprio ? await vendeurSigne(proprio.id) : false;
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
          texte: [`${titre}${lePrix}`, not, fini ? 'Dossier finalisé (« Bien trouvé ») : la veille s’arrête, ses relances en attente sont soldées.' : null] } : null,
      });
      onFait(r);
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre sur="Le bien passe « Vendu »" couleur={etapeDe('vendu').c} titre="La vente est signée" sous={resume(bien)} occupe={occupe} onFermer={onFermer} large
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : 'C’est vendu'}</button></>}>
      <Section ic="plume" c="#6d28d9" f="#f5f3ff" titre="L’acte">
        <div className={b.g3}>
          <Ch lib="Acte signé le"><input className={s.input} type="date" value={date} onChange={e => setDate(e.target.value)} /></Ch>
          <Ch lib="Prix de vente"><SaisieNombre v={prix} euros unite="€" off={false} onChange={setPrix} /></Ch>
          <Ch lib="Honoraires encaissés"><SaisieNombre v={hono} euros unite="€ TTC" off={false} onChange={setHono} /></Ch>
        </div>
      </Section>
      {(offre?.client_id || proprio || bien.client_id) && (
        <Section ic="fleche" c="#0f766e" f="#f0fdfa" titre="Et ensuite">
          <div className={b.rappels}>
            {offre?.client_id && (
              <Suite on={finAcq} onChange={setFinAcq} ic="check" c="#1d4ed8" f="#eff6ff"
                t={`Dossier de ${acquereur} finalisé : il passe « Bien trouvé »`}
                s="Rangé dans « Finalisés » : la veille s’arrête, ses relances en attente sont soldées." />
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
      <div className={b.calc}>Le bien reste dans la liste, rangé dans « Vendu ». Tu pourras l’archiver quand tu voudras.</div>
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ══ Une étape avec sa raison : pause, retrait, retour en vente ═════════ */
const RAISONS: Partial<Record<EtapeVente, string[]>> = {
  suspendu: ['Le vendeur fait une pause', 'Travaux avant la vente', 'Succession en cours', 'Il attend son achat'],
  a_suivre: ['Il veut attendre', 'Il attend son achat', 'Travaux avant la vente', 'Succession en cours'],
  retire: ['Mandat expiré', 'Vendu par un autre', 'Le vendeur renonce', 'Le vendeur loue finalement'],
};
export function FenRaison({ bien, etape, titre, sur, onFermer, onFait }: {
  bien: BienVente; etape: EtapeVente; titre: string; sur: string; onFermer: () => void; onFait: (b: BienVente) => void;
}) {
  const [raison, setRaison] = useState('');
  const [reprise, setReprise] = useState('');
  const [note, setNote] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  async function valider() {
    setOccupe(true); setErreur('');
    try {
      const { bien: r } = await changerEtape(bien, etape, { commentaire: note.trim() || undefined, infos: { raison: raison.trim(), ...(reprise ? { reprise } : {}) } });
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
      <Ch lib="Commentaire (facultatif)"><textarea className={s.input} rows={2} value={note} onChange={e => setNote(e.target.value)} /></Ch>
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
      const r = await enregistrerBien(bien.id, { ...d, prix, ...(hono || {}) }, d);
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
          {apres.net ? <>{' '}Net vendeur : <b>{euros(apres.net)}</b>{!honoChange && apres.hono !== null ? `, honoraires ${euros(apres.hono)}` : ''}.</> : null}
        </div>
      )}
      <Ch lib="Pourquoi (pour l’historique)"><input className={s.input} value={note} onChange={e => setNote(e.target.value)} placeholder="Ex : retours de visite, pas d’offre en 6 semaines" /></Ch>
      {mandatSigne && (prixChange || honoChange) && (
        <label className={b.caseHono}>
          <input type="checkbox" checked={avenant} onChange={e => setAvenant(e.target.checked)} />
          <span><b>Préparer l’avenant au mandat</b><small>{'Pendant le mandat, un changement de prix ou d’honoraires se signe par un avenant : il sera prérempli dans Documents, à relire et à faire signer.'}</small></span>
        </label>
      )}
      <div className={b.calc}>Les acheteurs à qui le bien a déjà été présenté gardent l’ancien prix dans leur espace : renvoie-le si tu veux qu’ils voient le nouveau.</div>
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ══ Une visite ════════════════════════════════════════════════════════ */
export function FenVisite({ bien, options, recherches, onFermer, onFait }: {
  bien: BienVente; options: OptionAcheteur[]; recherches: RechercheMini[]; onFermer: () => void; onFait: () => void;
}) {
  const [choix, setChoix] = useState<ChoixA>(null);
  const [date, setDate] = useState(aujourdhui());
  const [heure, setHeure] = useState('18:00');
  const [duree, setDuree] = useState(45);
  const [note, setNote] = useState('');
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
      } else {
        await visiteExterne(bien, choix.nom.trim(), choix.tel.trim(), x, agenda);
      }
      onFait();
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre sur="Visite" couleur="#8b5cf6" titre="Planifier une visite" sous={resume(bien)} occupe={occupe} onFermer={onFermer}
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
        <Ch lib="Note (facultatif)"><input className={s.input} value={note} onChange={e => setNote(e.target.value)} placeholder="Ex : vient avec son père ; deuxième visite" /></Ch>
      </div>
      {choix?.mode === 'libre'
        ? <label className={b.caseL}><input type="checkbox" checked={agenda} onChange={e => setAgenda(e.target.checked)} />L’ajouter à l’agenda, avec l’adresse et les codes d’accès</label>
        : <div className={b.calc}>Une visite comme les autres : dans l’agenda, la page Visites et son espace. Le bien s’ajoute à son dossier s’il n’y est pas encore.</div>}
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
