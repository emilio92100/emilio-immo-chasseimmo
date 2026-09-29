'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import AvatarContact, { personneDe } from '@/components/contacts/AvatarContact';
import { createPortal } from 'react-dom';
import { euros } from '@/lib/mandat';
import { num, txt } from '@/lib/actes';
import {
  argentBien, avantMandat, estimationFaite, etapeDe, honorairesPour, pourcent, pretPourEstimer, texteEstimation, titreBien,
  type BienVente, type Donnees, type EtapeVente, type SuiviVente,
} from '@/lib/biens-vente';
import { Croix, Ic } from '@/components/documents/ApercuActe';
import { SaisieNombre, lireClients } from './ChampsBien';
import {
  ajouterSuivi, changerEtape, deposerPiece, enregistrerBien, enregistrerOffre, majSuivi, nomClient, visiteAcheteur, visiteExterne,
  type ClientMini, type RechercheMini,
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
  const [mode, setMode] = useState<'crm' | 'libre'>(choix?.mode === 'libre' || !options.length ? 'libre' : 'crm');
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
    if (t.length < 2) return options.slice(0, 8);
    const dejaLa = options.filter(o => sansAccent(o.nom).includes(t));
    const autres = (clients || []).filter(c => !options.some(o => o.clientId === c.id) && sansAccent(`${c.prenom} ${c.nom} ${c.nom} ${c.prenom}`).includes(t)).slice(0, 6)
      .map(c => {
        const r = recherches.find(x => x.client_id === c.id);
        return { cle: `c-${c.id}`, clientId: c.id, rechercheId: r?.id || null, nom: nomClient(c), sous: r ? `Recherche : ${r.nom || 'en cours'}` : 'Aucune recherche active' };
      });
    return [...dejaLa, ...autres];
  }, [q, options, clients, recherches]);
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
    try { r = await enregistrerBien(bien.id, { ...d, ...versDonnees(e), rdvEstimation: rdv, avisEnvoye: avis }); }
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
  const reprise = !avantMandat(bien.etape);
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
export function FenOffre({ bien, pour, options, recherches, proprio, onFermer, onFait }: {
  bien: BienVente; options: OptionAcheteur[]; recherches: RechercheMini[]; proprio: ClientMini | null;
  onFermer: () => void; onFait: (b: BienVente | null) => void;
  /* Depuis une visite (« Enregistrer son offre », V3.32) : l'acheteur est choisi. */
  pour?: ChoixA;
}) {
  const a = argentBien(bien.donnees || {});
  const [choix, setChoix] = useState<ChoixA>(pour ?? null);
  const [montant, setMontant] = useState<number | null>(null);
  const [recue, setRecue] = useState(aujourdhui());
  const [jusquau, setJusquau] = useState(plusJours(aujourdhui(), 5));
  const [fin, setFin] = useState<'comptant' | 'pret' | 'relais'>('pret');
  const [apport, setApport] = useState<number | null>(null);
  const [pret, setPret] = useState<number | null>(null);
  const [accord, setAccord] = useState('');
  const [conditions, setConditions] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [passer, setPasser] = useState(bien.etape === 'mandat' || bien.etape === 'suspendu');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const ecart = montant && a.prix ? a.prix - montant : null;
  const honoSi = honorairesPour(bien.donnees || {}, montant);
  const netSi = montant && honoSi !== null ? montant - honoSi : null;
  const qui = choix?.mode === 'crm' ? choix.o.nom : choix?.mode === 'libre' ? choix.nom.trim() : '';

  async function valider() {
    if (!qui) { setErreur('Qui fait l’offre ?'); return; }
    if (!montant) { setErreur('Le montant de l’offre ?'); return; }
    setOccupe(true); setErreur('');
    try {
      const f = fichier ? await deposerPiece(bien.id, 'offre', fichier) : null;
      const ligne = await enregistrerOffre(bien, {
        qui, clientId: choix?.mode === 'crm' ? choix.o.clientId : null, rechercheId: choix?.mode === 'crm' ? choix.o.rechercheId : null,
        montant, recue, jusquau, financement: fin, apport, pret: fin === 'comptant' ? null : pret, accord: accord.trim(), conditions: conditions.trim(), fichier: f,
      }, proprio);
      if (passer && bien.etape !== 'offre') {
        const { bien: r } = await changerEtape(bien, 'offre', { infos: { offre: ligne.id, montant, qui } });
        onFait(r);
      } else onFait(null);
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  const proprioNom = proprio ? proprio.prenom || nomClient(proprio) : 'le propriétaire';
  return (
    <Fenetre sur={passer && bien.etape !== 'offre' ? 'Le bien passe « Sous offre »' : 'Une offre de plus'} couleur={etapeDe('offre').c}
      titre="Une offre est arrivée" sous={resume(bien)} occupe={occupe} onFermer={onFermer} large
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : 'Enregistrer l’offre'}</button></>}>
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
        <Ch lib="Financement"><Pills options={[{ v: 'comptant', l: 'Comptant' }, { v: 'pret', l: 'Prêt' }, { v: 'relais', l: 'Prêt relais' }]} v={fin} onChange={setFin} /></Ch>
        <div className={b.g3}>
          <Ch lib="Apport"><SaisieNombre v={apport} euros unite="€" off={false} onChange={setApport} /></Ch>
          {fin !== 'comptant' && <Ch lib="Prêt demandé"><SaisieNombre v={pret} euros unite="€" off={false} onChange={setPret} /></Ch>}
          {fin !== 'comptant' && <Ch lib="Accord de principe"><input className={s.input} value={accord} onChange={e => setAccord(e.target.value)} placeholder="Ex : oui, reçu le 20/09" /></Ch>}
        </div>
        <Ch lib="Conditions particulières"><input className={s.input} value={conditions} onChange={e => setConditions(e.target.value)} placeholder="Ex : aucune ; vente de son bien actuel…" /></Ch>
        <label className={s.fichier}>
          <Ic n="trombone" t={18} />
          <span>{fichier ? <><b>{fichier.name}</b> · sera déposée avec l’offre</> : <>Déposer l’offre signée (PDF ou photo) · <b>facultatif</b></>}</span>
          <input type="file" accept=".pdf,image/*" onChange={e => setFichier(e.target.files?.[0] || null)} />
        </label>
      </div>
      {bien.etape !== 'offre' && (
        <label className={b.caseL}><input type="checkbox" checked={passer} onChange={e => setPasser(e.target.checked)} />Le bien passe « Sous offre » dans la liste</label>
      )}
      <div className={b.reste}>
        <div className={b.resteT}>Le CRM s’occupe du reste</div>
        {proprio && jusquau && <div><Ic n="calendrier" t={15} />{`Une relance le ${new Date(`${jusquau}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} si ${proprioNom} n’a pas répondu`}</div>}
        {!proprio && <div><Ic n="info" t={15} />Relie le propriétaire à sa fiche client pour recevoir une relance à la fin du délai.</div>}
        {choix?.mode === 'crm' && <div><Ic n="personne" t={15} />{`Une ligne dans le suivi de ${choix.o.nom}, son bien passe « offre faite »`}</div>}
        <div><Ic n="historique" t={15} />Les offres s’affichent côte à côte sur la fiche, pour comparer</div>
      </div>
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ══ Le compromis est signé ═════════════════════════════════════════════ */
export function FenCompromis({ bien, offres, onFermer, onFait }: { bien: BienVente; offres: SuiviVente[]; onFermer: () => void; onFait: (b: BienVente) => void }) {
  const d = bien.donnees || {};
  const a = argentBien(d);
  const candidates = offres.filter(o => o.statut !== 'refusee' && o.statut !== 'retiree');
  const meilleure = candidates.find(o => o.statut === 'acceptee') || candidates.sort((x, y) => (y.montant || 0) - (x.montant || 0))[0];
  const [offreId, setOffreId] = useState(meilleure?.id || '');
  const offre = offres.find(o => o.id === offreId) || null;
  const [prix, setPrix] = useState<number | null>(offre?.montant || a.prix);
  const [signe, setSigne] = useState(aujourdhui());
  const [sru, setSru] = useState(plusJours(aujourdhui(), 11));
  const [pretL, setPretL] = useState(plusJours(aujourdhui(), 45));
  const [acte, setActe] = useState(plusJours(aujourdhui(), 90));
  const [notaire, setNotaire] = useState('');
  const hDefaut = (p: number | null) => honorairesPour(d, p) ?? a.hono;
  const [hono, setHono] = useState<number | null>(hDefaut(prix));
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const changerOffre = (id: string) => {
    setOffreId(id);
    const o = offres.find(x => x.id === id);
    if (o?.montant) { setPrix(o.montant); setHono(hDefaut(o.montant)); }
  };
  const majSigne = (x: string) => { setSigne(x); setSru(plusJours(x, 11)); setPretL(plusJours(x, 45)); setActe(plusJours(x, 90)); };
  async function valider() {
    if (!prix) { setErreur('Le prix de vente ?'); return; }
    setOccupe(true); setErreur('');
    try {
      if (offre && offre.statut !== 'acceptee') await majSuivi(offre.id, { statut: 'acceptee', donnees: { ...offre.donnees, reponse_le: aujourdhui() } });
      const { bien: r } = await changerEtape(bien, 'compromis', {
        infos: { offre: offre?.id || null, acquereur: offre?.qui || null, prix, signe, sru, pretLimite: pretL, acte, notaireAcq: notaire.trim(), hono },
      });
      onFait(r);
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre sur="Le bien passe « Sous compromis »" couleur={etapeDe('compromis').c} titre="Le compromis est signé" sous={resume(bien)} occupe={occupe} onFermer={onFermer}
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : 'Enregistrer le compromis'}</button></>}>
      {candidates.length > 0 && (
        <div className={b.groupe}>
          <div className={b.groupeT}><Ic n="personne" t={14} />L’offre retenue</div>
          <div className={b.qui}>
            {candidates.map(o => (
              <button key={o.id} type="button" className={`${b.quiL} ${offreId === o.id ? b.quiOn : ''}`} onClick={() => changerOffre(o.id)}>
                <div><b>{`${o.qui || 'Acquéreur'} · ${euros(o.montant || 0)}`}</b><small>{`Reçue le ${new Date(o.le).toLocaleDateString('fr-FR')}`}</small></div>
                {offreId === o.id && <Ic n="check" t={16} e={2.6} />}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={b.groupe}>
        <div className={b.groupeT}><Ic n="plume" t={14} />Le compromis</div>
        <div className={b.g2}>
          <Ch lib="Prix de vente"><SaisieNombre v={prix} euros unite="€" off={false} onChange={x => { setPrix(x); setHono(hDefaut(x)); }} /></Ch>
          <Ch lib="Signé le"><input className={s.input} type="date" value={signe} onChange={e => majSigne(e.target.value)} /></Ch>
          <Ch lib="Fin du délai de rétractation"><input className={s.input} type="date" value={sru} onChange={e => setSru(e.target.value)} /></Ch>
          <Ch lib="Condition de prêt jusqu’au"><input className={s.input} type="date" value={pretL} onChange={e => setPretL(e.target.value)} /></Ch>
          <Ch lib="Acte prévu le"><input className={s.input} type="date" value={acte} onChange={e => setActe(e.target.value)} /></Ch>
          <Ch lib="Notaire de l’acquéreur"><input className={s.input} value={notaire} onChange={e => setNotaire(e.target.value)} placeholder="Facultatif" /></Ch>
          <Ch lib="Honoraires de l’agence"><SaisieNombre v={hono} euros unite="€ TTC" off={false} onChange={setHono} /></Ch>
        </div>
        <div className={b.calc}>Les dates se calculent depuis la signature : 10 jours de rétractation après la remise de l’acte, 45 jours pour le prêt, l’acte trois mois après. Ajuste-les à ce qui est écrit.</div>
      </div>
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ══ Vendu : l'acte est signé ══════════════════════════════════════════ */
export function FenVendu({ bien, compromis, onFermer, onFait }: { bien: BienVente; compromis: SuiviVente | null; onFermer: () => void; onFait: (b: BienVente) => void }) {
  const c = (compromis?.donnees || {}) as Record<string, unknown>;
  const a = argentBien(bien.donnees || {});
  const [date, setDate] = useState(typeof c.acte === 'string' && c.acte <= aujourdhui() ? c.acte : aujourdhui());
  const [prix, setPrix] = useState<number | null>(typeof c.prix === 'number' ? c.prix : a.prix);
  const [hono, setHono] = useState<number | null>(typeof c.hono === 'number' ? c.hono : a.hono);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  async function valider() {
    setOccupe(true); setErreur('');
    try {
      const { bien: r } = await changerEtape(bien, 'vendu', { vendu_le: date, infos: { prix, hono, acte: date, acquereur: c.acquereur || null } });
      onFait(r);
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre sur="Le bien passe « Vendu »" couleur={etapeDe('vendu').c} titre="La vente est signée" sous={resume(bien)} occupe={occupe} onFermer={onFermer}
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : 'C’est vendu'}</button></>}>
      <div className={b.groupe}>
        <div className={b.g3}>
          <Ch lib="Acte signé le"><input className={s.input} type="date" value={date} onChange={e => setDate(e.target.value)} /></Ch>
          <Ch lib="Prix de vente"><SaisieNombre v={prix} euros unite="€" off={false} onChange={setPrix} /></Ch>
          <Ch lib="Honoraires encaissés"><SaisieNombre v={hono} euros unite="€ TTC" off={false} onChange={setHono} /></Ch>
        </div>
      </div>
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

/* ══ Changer le prix (l'ancien reste dans l'historique) ══════════════════ */
export function FenPrix({ bien, onFermer, onFait }: { bien: BienVente; onFermer: () => void; onFait: (b: BienVente) => void }) {
  const d = bien.donnees || {};
  const ancien = num(d, 'prix');
  const [prix, setPrix] = useState<number | null>(ancien);
  const [note, setNote] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const apres = argentBien({ ...d, prix });
  async function valider() {
    if (!prix || prix === ancien) { onFermer(); return; }
    setOccupe(true); setErreur('');
    try {
      const r = await enregistrerBien(bien.id, { ...d, prix });
      await ajouterSuivi({ bien_id: bien.id, type: 'prix', montant: prix, commentaire: note.trim() || null, donnees: { ancien } });
      onFait(r);
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre sur="Garde l’historique des prix" couleur="#8b5cf6" titre="Changer le prix" sous={resume(bien)} occupe={occupe} onFermer={onFermer}
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : 'Changer le prix'}</button></>}>
      <div className={b.g2}>
        <Ch lib="Prix affiché aujourd’hui"><input className={s.input} disabled value={ancien ? euros(ancien) : '—'} /></Ch>
        <Ch lib="Nouveau prix"><SaisieNombre v={prix} euros unite="€" off={false} onChange={setPrix} /></Ch>
      </div>
      {prix && ancien && prix !== ancien && (
        <div className={b.calc}>
          {prix < ancien ? `Baisse de ${euros(ancien - prix)} (−${pourcent(((ancien - prix) / ancien) * 100)}).` : `Hausse de ${euros(prix - ancien)}.`}
          {apres.net ? <>{' '}Net vendeur : <b>{euros(apres.net)}</b>{apres.hono !== null ? `, honoraires ${euros(apres.hono)}` : ''}.</> : null}
        </div>
      )}
      <Ch lib="Pourquoi (pour l’historique)"><input className={s.input} value={note} onChange={e => setNote(e.target.value)} placeholder="Ex : retours de visite, pas d’offre en 6 semaines" /></Ch>
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
