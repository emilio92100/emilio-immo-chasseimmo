'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { euros } from '@/lib/mandat';
import { num, txt } from '@/lib/actes';
import {
  argentBien, avantMandat, etapeDe, honorairesPour, pourcent, titreBien,
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

const aujourdhui = () => new Date().toISOString().slice(0, 10);
export const plusJours = (ymd: string, n: number) => {
  const x = new Date(`${ymd || aujourdhui()}T12:00:00`);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};

export function Fenetre({ sur, couleur, titre, sous, occupe, onFermer, children, pied, large }: {
  sur?: string; couleur?: string; titre: string; sous?: string; occupe?: boolean;
  onFermer: () => void; children: ReactNode; pied: ReactNode; large?: boolean;
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
        <div className={s.fenCorps}>{children}</div>
        <div className={s.fenPied}>{pied}</div>
      </div>
    </div>,
    document.body,
  );
}

function Ch({ lib, children, large }: { lib: string; children: ReactNode; large?: boolean }) {
  return <label className={b.chF} style={large ? { gridColumn: '1 / -1' } : undefined}><span>{lib}</span>{children}</label>;
}
function Pills<T extends string>({ options, v, onChange }: { options: { v: T; l: string }[]; v: T | ''; onChange: (x: T) => void }) {
  return (
    <div className={s.pills} role="radiogroup">
      {options.map(o => (
        <button key={o.v} type="button" role="radio" aria-checked={v === o.v} className={`${s.pill} ${v === o.v ? s.pillOn : ''}`} onClick={() => onChange(o.v)}>{o.l}</button>
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
                  <span className={`${b.avatar} ${b.avatarPetit}`}>{o.nom.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()}</span>
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
   Le choix décide des questions de l'éditeur : un bien « à suivre » n'a que
   le propriétaire, le bien et les notes ; une estimation n'a ni mandat, ni
   annonce, ni visite. */
const DEPARTS: { k: EtapeVente; ic: string; t: string; s: string }[] = [
  { k: 'a_suivre', ic: 'drapeau', t: 'À suivre', s: 'Un propriétaire pense vendre. Pas encore d’estimation : lui, son bien, tes notes.' },
  { k: 'estimation', ic: 'regle', t: 'Une estimation', s: 'Le rendez-vous est pris ou fait : le bien en détail, la fourchette, l’avis de valeur. Pas encore de mandat.' },
  { k: 'mandat', ic: 'plume', t: 'Un mandat signé', s: 'Il est en vente : tout, jusqu’à l’annonce et la visite.' },
];
export function FenNouveau({ occupe, erreur, pour, onFermer, onChoisir }: { occupe: boolean; erreur: string; pour?: string; onFermer: () => void; onChoisir: (e: EtapeVente) => void }) {
  return (
    <Fenetre sur={pour ? `Le bien de ${pour}` : undefined} titre="Nouveau bien : où en est-il ?" sous="Le formulaire ne pose que les questions utiles à cette étape. Les autres arrivent quand le bien avance." occupe={occupe} onFermer={onFermer}
      pied={<button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>}>
      <div className={b.departs}>
        {DEPARTS.map(x => (
          <button key={x.k} type="button" className={b.depart} disabled={occupe} onClick={() => onChoisir(x.k)}>
            <span className={b.departIc} style={{ color: etapeDe(x.k).c }}><Ic n={x.ic} t={20} /></span>
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

/* ══ Un bien à suivre passe à l'estimation ═══════════════════════════════ */
export function FenEstimation({ bien, onFermer, onFait }: { bien: BienVente; onFermer: () => void; onFait: (b: BienVente) => void }) {
  const d = bien.donnees || {};
  const [rdv, setRdv] = useState(txt(d, 'rdvEstimation'));
  const [note, setNote] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  async function valider() {
    setOccupe(true); setErreur('');
    try {
      const { bien: r } = await changerEtape(bien, 'estimation', { donnees: { ...d, rdvEstimation: rdv }, commentaire: note.trim() || undefined, infos: rdv ? { rdv } : {} });
      onFait(r);
    } catch (e) { setErreur((e as Error).message); setOccupe(false); }
  }
  return (
    <Fenetre sur="Le bien passe « Estimation »" couleur={etapeDe('estimation').c} titre="On passe à l’estimation" sous={resume(bien)} occupe={occupe} onFermer={onFermer}
      pied={<><button type="button" className={s.btn} disabled={occupe} onClick={onFermer}>Annuler</button>
        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={occupe} onClick={valider}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : 'Passer à l’estimation'}</button></>}>
      <Ch lib="Rendez-vous d’estimation (facultatif)"><input className={s.input} type="date" value={rdv} onChange={e => setRdv(e.target.value)} /></Ch>
      <Ch lib="Commentaire (facultatif)"><textarea className={s.input} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Ce qu’il attend, ce qu’il faut préparer" /></Ch>
      <div className={b.calc}>Sa fiche s’ouvre aux questions de l’estimation : l’intérieur, les pièces, l’énergie, la copropriété, la fourchette.</div>
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
  const [raison, setRaison] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  async function valider() {
    if (!type) { setErreur('Choisis le type de mandat.'); return; }
    setOccupe(true); setErreur('');
    try {
      const donnees: Donnees = { ...d, mandatType: type, mandatNumero: numero.trim(), mandatDate: date, mandatFin: finM, ...(prix ? { prix } : {}) };
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
      </div>
      <div className={b.groupe}>
        <div className={b.groupeT}><Ic n="etiquette" t={14} />Le prix affiché</div>
        <SaisieNombre v={prix} euros unite="€" off={false} onChange={setPrix} ph="Honoraires compris s’ils sont à la charge de l’acquéreur" />
      </div>
      {reprise && <Ch lib="Pourquoi (pour l’historique)"><input className={s.input} value={raison} onChange={e => setRaison(e.target.value)} placeholder="Ex : l’offre est tombée, le vendeur reprend la vente" /></Ch>}
      <Erreur t={erreur} />
    </Fenetre>
  );
}

/* ══ Une offre est arrivée ═════════════════════════════════════════════ */
export function FenOffre({ bien, options, recherches, proprio, onFermer, onFait }: {
  bien: BienVente; options: OptionAcheteur[]; recherches: RechercheMini[]; proprio: ClientMini | null;
  onFermer: () => void; onFait: (b: BienVente | null) => void;
}) {
  const a = argentBien(bien.donnees || {});
  const [choix, setChoix] = useState<ChoixA>(null);
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
      {etape === 'suspendu' && <Ch lib="Reprise prévue le"><input className={s.input} type="date" value={reprise} onChange={e => setReprise(e.target.value)} /></Ch>}
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
