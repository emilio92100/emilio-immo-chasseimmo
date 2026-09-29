'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { euros } from '@/lib/mandat';
import { conjointDe } from '@/lib/foyer';
import { txt, lirePersonnes, PERSONNE_VIDE, type Personne } from '@/lib/actes';
import {
  EXPOSITIONS, NIVEAUX, PIECES_GROUPES, PIECES_TUILES, lirePieces, lirePhotos, lireDossier, lignesDossier, pictoPiece,
  brouillonAnnonce, controleAnnonce, passoire, estChampActe, personneDepuisClient, m2, lireObservations,
  type ChampBien, type Donnees, type Observation, type Piece, type Photo, type PieceDossier,
} from '@/lib/biens-vente';
import { ChampActe, manquesEtape } from '@/components/documents/ChampsActe';
import { Croix, Ic } from '@/components/documents/ApercuActe';
import { creerFicheProprio, deposerPhoto, deposerPiece, marquerVendeur, nomClient, ouvrirPiece, retirerPhoto, retirerPiece, type ClientMini } from './outils';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';

/* ═══ Les champs propres aux biens en vente ═══════════════════════════════
   En plus de ceux des documents juridiques (ChampActe) : les lettres du DPE
   et du GES, les pièces une à une, les photos, le dossier, le propriétaire
   et l'annonce. Tous au niveau du module (AGENTS.md §2.4). */

/* `v` peut être une fonction de la valeur d'avant : deux photos envoyées
   coup sur coup s'ajoutent l'une après l'autre, sans s'écraser. */
type Maj = (cle: string, v: unknown) => void;
type Suite<T> = (avant: unknown) => T;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/* Les couleurs officielles des étiquettes. */
export const COULEURS: Record<'dpe' | 'ges', Record<string, { f: string; t: string }>> = {
  dpe: {
    A: { f: '#009c6d', t: '#fff' }, B: { f: '#52b153', t: '#fff' }, C: { f: '#a3cf5a', t: '#1f3a12' }, D: { f: '#f4e70f', t: '#4a4200' },
    E: { f: '#f0b40f', t: '#4a3300' }, F: { f: '#eb8235', t: '#fff' }, G: { f: '#d7221f', t: '#fff' },
  },
  ges: {
    A: { f: '#f6edfd', t: '#5b2a86' }, B: { f: '#e4c7fa', t: '#5b2a86' }, C: { f: '#d6aaf4', t: '#4c1d95' }, D: { f: '#cb95f3', t: '#fff' },
    E: { f: '#ba72ec', t: '#fff' }, F: { f: '#a74dea', t: '#fff' }, G: { f: '#8a19df', t: '#fff' },
  },
};
const LETTRES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/* ── Un nombre court (surface d'une pièce) : on tape « 12,5 » librement ── */
const lireNb = (t: string): number | null => {
  const x = t.replace(/[\s\u00a0\u202f€]/g, '').replace(',', '.');
  if (!x) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const ecrireNb = (n: number | null, euros = false) => (n === null ? '' : euros
  ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n).replace(/[\u202f\u00a0]/g, ' ')
  : String(n).replace('.', ','));

export function SaisieNombre({ id, v, onChange, unite, off, ph, euros = false, auto = false, lib }: {
  id?: string; v: number | null; onChange: (n: number | null) => void; unite?: string; off: boolean; ph?: string; euros?: boolean;
  auto?: boolean; lib?: string;
}) {
  /* Pendant la frappe, le texte tel qu'il est tapé ; sinon, le nombre mis en forme. */
  const [saisie, setSaisie] = useState<string | null>(null);
  return (
    <div className={s.unite}>
      <input id={id} className={s.input} inputMode="decimal" autoComplete="off" disabled={off} value={saisie ?? ecrireNb(v, euros)} placeholder={ph} autoFocus={auto} aria-label={lib}
        onFocus={() => setSaisie(ecrireNb(v, euros))} onBlur={() => setSaisie(null)}
        onChange={e => { setSaisie(e.target.value); onChange(lireNb(e.target.value)); }}
        style={unite ? { paddingRight: 22 + unite.length * 7.5 } : undefined} />
      {unite && <span>{unite}</span>}
    </div>
  );
}

/* ── DPE / GES : sept lettres à cliquer ── */
function ChampLettres({ genre, v, onChange, off, lib }: { genre: 'dpe' | 'ges'; v: unknown; onChange: (x: string) => void; off: boolean; lib: string }) {
  return (
    <div className={b.lettresL} role="radiogroup" aria-label={lib}>
      {LETTRES.map(l => {
        const c = COULEURS[genre][l];
        const on = v === l;
        return (
          <button key={l} type="button" role="radio" aria-checked={on} disabled={off} className={`${b.lettre} ${on ? b.lettreOn : ''}`}
            style={{ background: c.f, color: c.t }} onClick={() => onChange(on ? '' : l)}>{l}</button>
        );
      })}
    </div>
  );
}

/* ══ Les pièces : niveau · pièce · surface · exposition · commentaire ════ */
const HORS_HABITABLE = new Set(PIECES_GROUPES.filter(g => g.g === 'Annexes' || g.g === 'Extérieur').flatMap(g => g.l));
export const habitable = (p: Piece) => p.niveau !== 'Extérieur' && !HORS_HABITABLE.has(p.nom.replace(/\s+\d+$/, ''));
/* Les pièces principales, celles qui font « un 3 pièces » : séjour, salon,
   salle à manger, bureau, chambres. L'entrée, la cuisine, les salles d'eau,
   les WC et les dégagements comptent dans la surface habitable, pas dans le
   nombre de pièces. Un séjour double en vaut deux. */
const PRINCIPALES = new Set(['Séjour', 'Salon', 'Salle à manger', 'Pièce à vivre', 'Bureau', 'Chambre', 'Suite parentale']);
export const nbPrincipales = (l: Piece[]) => l.reduce((n, p) => {
  if (p.niveau === 'Extérieur') return n;
  const base = p.nom.replace(/\s+\d+$/, '');
  return n + (base === 'Séjour double' ? 2 : PRINCIPALES.has(base) ? 1 : 0);
}, 0);
export const nouvelId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* « Chambre », puis « Chambre 2 », « Chambre 3 »… */
export function nomLibre(l: Piece[], nom: string, sauf?: string): string {
  const base = nom.replace(/\s+\d+$/, '');
  const memes = l.filter(p => p.id !== sauf && p.nom.replace(/\s+\d+$/, '') === base);
  return memes.length ? `${base} ${memes.length + 1}` : base;
}

/* Une pièce : son icône (d'après son nom), son nom, son niveau, sa surface,
   son exposition en huit boutons, et un commentaire. */
function CartePiece({ p, off, ouverte, auto, premier, dernier, onOuvrir, onMaj, onBouger, onRetirer, onNom }: {
  p: Piece; off: boolean; ouverte: boolean; auto: boolean; premier: boolean; dernier: boolean;
  onOuvrir: (x: boolean) => void; onMaj: (k: keyof Piece, v: unknown) => void;
  onBouger: (sens: -1 | 1) => void; onRetirer: () => void; onNom: (nom: string) => void;
}) {
  const niveaux = NIVEAUX.includes(p.niveau) || !p.niveau ? NIVEAUX : [p.niveau, ...NIVEAUX];
  return (
    <div className={`${b.pc} ${ouverte ? b.pcOuverte : ''} ${!p.nom ? b.pcSansNom : ''}`}>
      <span className={b.pcIc}><Ic n={pictoPiece(p.nom)} t={21} /></span>
      <div className={b.pcNom}>
        <input className={b.pcNomIn} disabled={off} value={p.nom} placeholder="Nom de la pièce" aria-label="Nom de la pièce"
          onChange={e => onMaj('nom', e.target.value)} />
        {!off && <button type="button" className={b.pcChanger} aria-expanded={ouverte} onClick={() => onOuvrir(!ouverte)}>{ouverte ? 'Fermer' : 'Changer'}</button>}
      </div>
      <select className={`${b.pcNiv} ${b.pcNivPlace}`} disabled={off} value={p.niveau} aria-label="Niveau" onChange={e => onMaj('niveau', e.target.value)}>
        {!p.niveau && <option value="">Niveau…</option>}
        {niveaux.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
      {!off && (
        <div className={b.pcOutils}>
          <button type="button" className={b.icBtn} disabled={premier} aria-label="Monter" title="Monter" onClick={() => onBouger(-1)}><Ic n="haut" t={16} e={2.2} /></button>
          <button type="button" className={b.icBtn} disabled={dernier} aria-label="Descendre" title="Descendre" onClick={() => onBouger(1)}><Ic n="bas" t={16} e={2.2} /></button>
          <button type="button" className={`${b.icBtn} ${b.icBtnDanger}`} aria-label="Retirer la pièce" title="Retirer" onClick={onRetirer}><Ic n="corbeille" t={16} /></button>
        </div>
      )}
      {ouverte && !off && (
        <div className={b.pcChoix}>
          {PIECES_GROUPES.map(g => (
            <div key={g.g} className={b.choixG}>
              <span>{g.g}</span>
              <div className={b.choixL}>
                {g.l.map(x => (
                  <button key={x} type="button" className={`${b.chip} ${p.nom.replace(/\s+\d+$/, '') === x ? b.chipOn : ''}`} onClick={() => onNom(x)}>
                    <Ic n={pictoPiece(x)} t={14} />{x}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className={b.pcBas}>
        <div className={b.pcSurf}><SaisieNombre v={p.surface} unite="m²" off={off} auto={auto} ph="Surface" lib={`Surface ${p.nom || 'de la pièce'}`} onChange={x => onMaj('surface', x)} /></div>
        <div className={b.pcExpo} role="radiogroup" aria-label="Exposition">
          {EXPOSITIONS.map(x => (
            <button key={x.v} type="button" role="radio" aria-checked={p.expo === x.v} title={x.l} disabled={off}
              className={p.expo === x.v ? b.pcExpoOn : undefined} onClick={() => onMaj('expo', p.expo === x.v ? '' : x.v)}>{x.v}</button>
          ))}
        </div>
        <input className={`${s.input} ${b.pcNote}`} disabled={off} value={p.note} placeholder="Un mot pour la fiche : parquet, placard, vue…"
          aria-label="Commentaire" onChange={e => onMaj('note', e.target.value)} />
      </div>
    </div>
  );
}

function ChampPieces({ d, maj, off }: { d: Donnees; maj: Maj; off: boolean }) {
  const l = lirePieces(d.detailPieces);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const defaut = d.typeBien === 'maison' ? 'Rez-de-chaussée' : 'Niveau principal';
  const [niveauAjout, setNiveauAjout] = useState<string>(() => (l.length ? l[l.length - 1].niveau || defaut : defaut));
  const ecrire = (x: Piece[]) => maj('detailPieces', x);
  const ajouter = (nom = '') => {
    const p: Piece = { id: nouvelId(), niveau: niveauAjout, nom: nom ? nomLibre(l, nom) : '', surface: null, expo: '', note: '' };
    ecrire([...l, p]);
    setOuverte(nom ? null : p.id);
    setFocus(nom ? p.id : null);
  };
  const majP = (id: string, k: keyof Piece, v: unknown) => ecrire(l.map(p => (p.id === id ? { ...p, [k]: v } : p)));
  /* Monter, descendre : parmi les pièces du même niveau. */
  const bouger = (i: number, sens: -1 | 1) => {
    let j = i + sens;
    while (j >= 0 && j < l.length && l[j].niveau !== l[i].niveau) j += sens;
    if (j < 0 || j >= l.length) return;
    const x = [...l]; [x[i], x[j]] = [x[j], x[i]]; ecrire(x);
  };
  const hab = l.filter(p => habitable(p) && p.surface);
  const total = hab.reduce((t, p) => t + (p.surface || 0), 0);
  const princ = nbPrincipales(l);
  const declaree = typeof d.surface === 'number' ? d.surface : null;
  const ecart = declaree && total ? Math.abs(total - declaree) / declaree : 0;
  const niveaux = Array.from(new Set(l.map(p => p.niveau || '')));
  const groupes = niveaux.length > 1 || (niveaux[0] && niveaux[0] !== defaut);
  const choixNiveaux = NIVEAUX.includes(niveauAjout) ? NIVEAUX : [niveauAjout, ...NIVEAUX];

  return (
    <div className={b.pieces}>
      {niveaux.map(n => {
        const ps = l.map((p, i) => ({ p, i })).filter(x => (x.p.niveau || '') === n);
        const surf = ps.reduce((t, x) => t + (habitable(x.p) ? x.p.surface || 0 : 0), 0);
        return (
          <div key={n || '-'} className={b.pcGroupe}>
            {groupes && <div className={b.niveauT}><span>{n || 'Sans niveau'}</span><i>{`${ps.length} pièce${ps.length > 1 ? 's' : ''}${surf ? ` · ${m2(surf)}` : ''}`}</i></div>}
            {ps.map(({ p, i }, k) => (
              <CartePiece key={p.id} p={p} off={off} ouverte={ouverte === p.id} auto={focus === p.id} premier={k === 0} dernier={k === ps.length - 1}
                onOuvrir={x => setOuverte(x ? p.id : null)}
                onMaj={(kk, v) => majP(p.id, kk, v)}
                onBouger={sens => bouger(i, sens)}
                onRetirer={() => { if (!p.nom || confirm(`Retirer « ${p.nom} » ?`)) ecrire(l.filter(x => x.id !== p.id)); }}
                onNom={nom => { majP(p.id, 'nom', nomLibre(l, nom, p.id)); setOuverte(null); }} />
            ))}
          </div>
        );
      })}
      {!off && (
        <div className={b.ajoutPiece}>
          <div className={b.ajoutT}>
            <span><Ic n="plus" t={15} e={2.6} />{l.length ? 'Ajouter une pièce' : 'Ajoute les pièces une par une, dans l’ordre de la visite'}</span>
            <label className={b.ajoutNiv}>
              <span>au niveau</span>
              <select className={b.pcNiv} value={niveauAjout} onChange={e => setNiveauAjout(e.target.value)}>
                {choixNiveaux.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
          </div>
          <div className={b.tuilesP}>
            {PIECES_TUILES.map(x => (
              <button key={x} type="button" className={b.tuileP} onClick={() => ajouter(x)}>
                <span><Ic n={pictoPiece(x)} t={20} /></span>{x}
              </button>
            ))}
            <button type="button" className={`${b.tuileP} ${b.tuileAutre}`} onClick={() => ajouter()}>
              <span><Ic n="plus" t={20} e={2.2} /></span>Autre pièce…
            </button>
          </div>
        </div>
      )}
      {l.length > 0 && (
        <div className={b.totaux}>
          <span><b>{l.length}</b>{` pièce${l.length > 1 ? 's' : ''}${niveaux.length > 1 ? ` sur ${niveaux.length} niveaux` : ''}${princ ? ` · dont ${princ} principale${princ > 1 ? 's' : ''}` : ''}`}</span>
          {total > 0 && <span>Surface habitable : <b>{m2(total)}</b></span>}
          {total > 0 && declaree && ecart > 0.03 && <span className={b.totauxAlerte}>{`La surface habitable déclarée est de ${m2(declaree)} : écart de ${m2(Math.abs(total - declaree))}.`}</span>}
        </div>
      )}
    </div>
  );
}

/* ══ Les charges : par an ou par mois, l'autre se calcule ═══════════════ */
function ChampEurosAn({ cle, d, maj, off }: { cle: string; d: Donnees; maj: Maj; off: boolean }) {
  const an = typeof d[cle] === 'number' ? (d[cle] as number) : null;
  const arrondi = (x: number) => Math.round(x * 100) / 100;
  return (
    <div className={b.anMois}>
      <label className={b.anMoisCh}><span>Par an</span><SaisieNombre v={an} euros unite="€/an" off={off} onChange={n => maj(cle, n)} /></label>
      <span className={b.anMoisEgal} aria-hidden="true">=</span>
      <label className={b.anMoisCh}><span>Par mois</span><SaisieNombre v={an !== null ? arrondi(an / 12) : null} euros unite="€/mois" off={off} onChange={n => maj(cle, n === null ? null : arrondi(n * 12))} /></label>
      {an ? <small className={b.anMoisT}>{`soit ${euros(an / 4)} par trimestre`}</small> : null}
    </div>
  );
}

/* ══ Les photos ═════════════════════════════════════════════════════════ */
export function ChampPhotos({ d, maj, off, bienId, grand = false }: { d: Donnees; maj: Maj; off: boolean; bienId: string; grand?: boolean }) {
  const l = lirePhotos(d.photos);
  const [envoi, setEnvoi] = useState<{ n: number; total: number } | null>(null);
  const [erreur, setErreur] = useState('');
  const [survol, setSurvol] = useState(false);

  async function ajouter(fichiers: FileList | File[]) {
    const fs = Array.from(fichiers).filter(f => /^image\//.test(f.type));
    if (!fs.length) return;
    setErreur('');
    for (let i = 0; i < fs.length; i++) {
      setEnvoi({ n: i + 1, total: fs.length });
      try {
        const p = await deposerPhoto(bienId, fs[i]);
        maj('photos', ((avant: unknown) => [...lirePhotos(avant), p]) as Suite<Photo[]>);
      } catch (e) {
        setErreur((e as Error).message);
        break;
      }
    }
    setEnvoi(null);
  }
  const ecrire = (x: Photo[]) => maj('photos', x);
  const bouger = (i: number, j: number) => {
    if (j < 0 || j >= l.length) return;
    const x = [...l]; const [p] = x.splice(i, 1); x.splice(j, 0, p); ecrire(x);
  };
  async function retirer(p: Photo) {
    if (!confirm('Retirer cette photo ?')) return;
    try { await retirerPhoto(p.chemin); maj('photos', ((avant: unknown) => lirePhotos(avant).filter(x => x.url !== p.url)) as Suite<Photo[]>); }
    catch (e) { setErreur((e as Error).message); }
  }

  return (
    <div className={b.pieces}>
      <div className={`${b.photos} ${grand ? b.photosGrand : ''}`}>
        {l.map((p, i) => (
          <div key={p.url} className={b.photo}>
            <div className={b.photoImg}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.legende || `Photo ${i + 1}`} loading="lazy" />
              {i === 0 && <span className={b.principale}>PRINCIPALE</span>}
              {!off && (
                <div className={b.photoOutils}>
                  {i > 0 && <button type="button" title="Mettre en photo principale" aria-label="Mettre en photo principale" onClick={() => bouger(i, 0)}><Ic n="etoile" t={14} /></button>}
                  {i > 0 && <button type="button" title="Avant" aria-label="Déplacer avant" onClick={() => bouger(i, i - 1)}><Ic n="gauche" t={14} e={2.4} /></button>}
                  {i < l.length - 1 && <button type="button" title="Après" aria-label="Déplacer après" onClick={() => bouger(i, i + 1)}><Ic n="droite" t={14} e={2.4} /></button>}
                  <button type="button" title="Retirer" aria-label="Retirer la photo" onClick={() => retirer(p)}><Ic n="corbeille" t={14} /></button>
                </div>
              )}
            </div>
            <input className={b.legende} disabled={off} value={p.legende} placeholder="Légende (séjour, vue…)"
              onChange={e => ecrire(l.map(x => (x.url === p.url ? { ...x, legende: e.target.value } : x)))} />
          </div>
        ))}
        {!off && (
          <label className={`${b.depot} ${survol ? b.depotOn : ''}`}
            onDragOver={e => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)}
            onDrop={e => { e.preventDefault(); setSurvol(false); if (!envoi) ajouter(e.dataTransfer.files); }}>
            <Ic n="photo" t={24} />
            {envoi ? `Envoi ${envoi.n} sur ${envoi.total}…` : 'Ajouter des photos'}
            <small>{envoi ? 'Réduites à 1 920 px avant l’envoi' : 'Glisse-les ici, ou clique. La première est la photo principale.'}</small>
            <input type="file" accept="image/*" multiple disabled={!!envoi} onChange={e => { if (e.target.files) ajouter(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>
      {erreur && <div className={s.erreur}>{erreur}</div>}
    </div>
  );
}

/* ══ Le dossier : diagnostics et pièces à réunir ════════════════════════ */
const VIDE: PieceDossier = { etat: '', date: '', chemin: '', nom: '' };
const GROUPES: { k: 'diag' | 'copro' | 'vendeur'; l: string }[] = [
  { k: 'diag', l: 'Les diagnostics' }, { k: 'copro', l: 'La copropriété' }, { k: 'vendeur', l: 'Du vendeur' },
];

export function ChampDossier({ d, maj, off, bienId }: { d: Donnees; maj: Maj; off: boolean; bienId: string }) {
  const doss = lireDossier(d.dossier);
  const [occupe, setOccupe] = useState('');
  const [erreur, setErreur] = useState('');
  const lignes = lignesDossier(d);
  const poser = (k: string, patch: Partial<PieceDossier>) => maj('dossier', ((avant: unknown) => {
    const x = lireDossier(avant);
    return { ...x, [k]: { ...(x[k] || VIDE), ...patch } };
  }) as Suite<Record<string, PieceDossier>>);
  async function deposer(k: string, f: File) {
    setOccupe(k); setErreur('');
    try {
      const ancien = doss[k]?.chemin;
      const x = await deposerPiece(bienId, k, f);
      poser(k, { chemin: x.chemin, nom: x.nom, etat: 'recu', date: doss[k]?.date || aujourdhui() });
      if (ancien) retirerPiece(ancien).catch(() => { /* l'ancien reste au stockage, sans lien */ });
    } catch (e) { setErreur((e as Error).message); }
    setOccupe('');
  }
  async function retirer(k: string) {
    const p = doss[k];
    if (!p?.chemin || !confirm(`Retirer le fichier « ${p.nom} » ?`)) return;
    setOccupe(k); setErreur('');
    try { await retirerPiece(p.chemin); poser(k, { chemin: '', nom: '' }); } catch (e) { setErreur((e as Error).message); }
    setOccupe('');
  }

  return (
    <div className={b.dossier}>
      {GROUPES.map(g => {
        const ls = lignes.filter(l => l.groupe === g.k);
        if (!ls.length) return null;
        const recus = ls.filter(l => doss[l.k]?.etat === 'recu' || doss[l.k]?.etat === 'nc').length;
        return (
          <div key={g.k} className={b.dosGroupe}>
            <div className={b.dosGroupeT}>{g.l}<span>{`${recus} sur ${ls.length}`}</span></div>
            {ls.map(l => {
              const p = doss[l.k] || VIDE;
              return (
                <div key={l.k} className={b.dosL}>
                  <div className={b.dosNom}><b>{l.l}</b>{l.aide && <small>{l.aide}</small>}</div>
                  <div className={b.dosEtat} role="group" aria-label={l.l}>
                    <button type="button" className={b.dosRecu} aria-pressed={p.etat === 'recu'} disabled={off}
                      onClick={() => poser(l.k, { etat: p.etat === 'recu' ? '' : 'recu', date: p.date || aujourdhui() })}>Reçu</button>
                    <button type="button" className={b.dosDemande} aria-pressed={p.etat === 'demande'} disabled={off}
                      onClick={() => poser(l.k, { etat: p.etat === 'demande' ? '' : 'demande' })}>Demandé</button>
                    <button type="button" aria-pressed={p.etat === 'nc'} disabled={off}
                      onClick={() => poser(l.k, { etat: p.etat === 'nc' ? '' : 'nc' })}>Non concerné</button>
                  </div>
                  {(p.etat === 'recu' || p.chemin) && (
                    <div className={b.dosFichier}>
                      {p.etat === 'recu' && <>
                        <span>Reçu le</span>
                        <input type="date" value={p.date} disabled={off} onChange={e => poser(l.k, { date: e.target.value })} />
                      </>}
                      {p.chemin
                        ? <>
                          <button type="button" className={b.fichierNom} onClick={() => ouvrirPiece(p.chemin, p.nom)}><Ic n="trombone" t={13} /><span>{p.nom || 'Le fichier'}</span></button>
                          {!off && <button type="button" className={b.icBtn} aria-label="Retirer le fichier" disabled={occupe === l.k} onClick={() => retirer(l.k)}><Croix t={13} /></button>}
                        </>
                        : !off && (
                          <label className={b.mini}>
                            <Ic n="trombone" t={13} />{occupe === l.k ? 'Envoi…' : 'Déposer le fichier'}
                            <input type="file" accept=".pdf,image/*" disabled={occupe === l.k} onChange={e => { const f = e.target.files?.[0]; if (f) deposer(l.k, f); e.target.value = ''; }} />
                          </label>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {erreur && <div className={s.erreur}>{erreur}</div>}
      <div className={s.chAide}>Les fichiers sont privés : visibles par toi seul, jamais dans un espace client.</div>
    </div>
  );
}

/* ══ Le propriétaire : sa fiche client ══════════════════════════════════ */
let CLIENTS: Promise<ClientMini[]> | null = null;
export const lireClients = (frais = false) => {
  if (!CLIENTS || frais) {
    CLIENTS = (async () => {
      const { data, error } = await supabase.from('clients').select('id, prenom, nom, statut, civilite, couple, conjoint, adresse, emails, telephones')
        .order('created_at', { ascending: false }).limit(2000);
      if (error) { CLIENTS = null; throw new Error('Les clients n’ont pas pu être lus : ' + error.message); }
      return (data || []) as ClientMini[];
    })();
  }
  return CLIENTS;
};
const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ── L'étape « Le propriétaire » (V3.29) ──
   D'abord une question : « Ce propriétaire est-il déjà dans le CRM ? ». La
   recherche relie sa fiche (et remplit ses coordonnées) ; sinon, « Créer sa
   fiche » ouvre la suite, sur fond clair, et la fiche se crée d'un clic dès
   que son nom est écrit. Tant que rien n'est choisi, la suite de l'étape
   reste grisée (EditeurBien, `proprioOuvert`). */
export const proprioOuvert = (d: Donnees) =>
  !!txt(d, 'clientId') || d.proprioNouveau === true || lirePersonnes(d.proprietaires).some(p => p.nom || p.prenom);

function ChampProprio({ d, maj, off }: { d: Donnees; maj: Maj; off: boolean }) {
  const id = typeof d.clientId === 'string' ? d.clientId : '';
  const [clients, setClients] = useState<ClientMini[] | null>(null);
  const [q, setQ] = useState('');
  const [erreur, setErreur] = useState('');
  const [cree, setCree] = useState(false);
  useEffect(() => {
    let vivant = true;
    lireClients().then(l => { if (vivant) setClients(l); }).catch(e => { if (vivant) { setErreur((e as Error).message); setClients([]); } });
    return () => { vivant = false; };
  }, []);
  const lie = id ? clients?.find(c => c.id === id) || null : null;
  const trouves = clients && q.trim().length >= 2
    ? clients.filter(c => sansAccent(`${c.prenom} ${c.nom} ${c.nom} ${c.prenom}`).includes(sansAccent(q.trim()))).slice(0, 6) : [];
  const personnes = lirePersonnes(d.proprietaires);
  const premier = personnes[0];
  const nomPremier = premier ? [premier.prenom, premier.nom].filter(Boolean).join(' ') : '';
  const nouveau = d.proprioNouveau === true;

  function choisir(c: ClientMini) {
    maj('clientId', c.id);
    maj('proprioNouveau', false);
    /* Relié à un bien comme propriétaire : il devient « vendeur » dans ses contacts. */
    void marquerVendeur(c.id);
    /* Ses coordonnées remplacent ce qui est saisi : d'office si rien ne
       l'est, sinon après accord (un autre nom avait été tapé). */
    const deja = personnes.some(p => p.nom || p.prenom);
    const memeNom = deja && sansAccent(`${premier?.prenom || ''} ${premier?.nom || ''}`).trim() === sansAccent(`${c.prenom || ''} ${c.nom || ''}`).trim();
    if (!deja || (!memeNom && confirm(`Reprendre les coordonnées de la fiche de ${nomClient(c)} à la place de celles déjà saisies ?`))) {
      const j = c.couple ? conjointDe(c.conjoint) : null;
      const l: Personne[] = [personneDepuisClient(c)];
      if (j) l.push({ ...PERSONNE_VIDE, civilite: j.civilite === 'Madame' || j.civilite === 'Monsieur' ? j.civilite : '', prenom: j.prenom || '', nom: j.nom || '', email: j.email || '', telephone: j.telephone || '' });
      maj('proprietaires', l);
      maj('qui', j ? 'couple' : 'personne');
    }
    setQ('');
  }
  /* « Créer sa fiche » : la suite s'ouvre ; ce qui était tapé dans la
     recherche devient son nom (le premier mot en prénom s'il y en a deux). */
  function nouvelleFiche() {
    setErreur('');
    maj('proprioNouveau', true);
    const tape = q.trim().replace(/\s+/g, ' ');
    if (tape && !personnes.some(p => p.nom || p.prenom)) {
      const mots = tape.split(' ');
      const p: Personne = mots.length > 1 ? { ...PERSONNE_VIDE, prenom: mots[0], nom: mots.slice(1).join(' ') } : { ...PERSONNE_VIDE, nom: tape };
      maj('proprietaires', [p]);
      if (!d.qui) maj('qui', 'personne');
    }
    setQ('');
  }
  async function creer() {
    if (!premier || !(premier.nom || premier.prenom)) { setErreur('Écris d’abord son nom, juste en dessous : la fiche se crée à partir de lui.'); return; }
    setCree(true); setErreur('');
    try {
      const c = await creerFicheProprio(premier);
      const l = await lireClients(true);
      setClients(l);
      maj('clientId', c.id);
      maj('proprioNouveau', false);
    } catch (e) { setErreur((e as Error).message); }
    setCree(false);
  }

  if (id) {
    return (
      <div className={b.lie}>
        <span className={b.avatar}>{lie ? `${(lie.prenom || ' ')[0]}${(lie.nom || ' ')[0]}`.trim().toUpperCase() : '…'}</span>
        <div>
          <b>{lie ? nomClient(lie) : clients ? 'Fiche introuvable' : 'Chargement…'}</b>
          <small>{lie ? [lie.telephones?.[0], lie.emails?.[0]].filter(Boolean).join(' · ') || 'Sa fiche client est reliée à ce bien' : ''}</small>
        </div>
        <span className={b.lieOk}><Ic n="check" t={12} e={3} />Fiche reliée</span>
        {!off && <button type="button" className={b.mini} onClick={() => maj('clientId', '')}>Délier</button>}
      </div>
    );
  }
  if (nouveau) {
    return (
      <div className={`${b.question} ${b.questionNouveau}`}>
        <div className={b.questionT}>
          <span className={b.questionIc}><Ic n="plus" t={18} e={2.4} /></span>
          <div><b>Nouvelle fiche client</b><small>Remplis juste en dessous qui vend et son nom. Sa fiche se crée ensuite d’un clic, et se relie au bien.</small></div>
        </div>
        {!off && (
          <div className={b.questionActs}>
            <button type="button" className={`${b.questionBtn} ${b.questionBtnOr}`} disabled={cree || !nomPremier} onClick={creer}>
              <Ic n="check" t={15} e={2.6} />{cree ? 'Création…' : nomPremier ? `Créer la fiche de ${nomPremier}` : 'Créer la fiche (écris d’abord son nom)'}
            </button>
            <button type="button" className={b.questionLien} onClick={() => maj('proprioNouveau', false)}>Il est peut-être déjà dans le CRM : chercher</button>
          </div>
        )}
        {erreur && <div className={s.erreur}>{erreur}</div>}
      </div>
    );
  }
  return (
    <div className={b.question}>
      <div className={b.questionT}>
        <span className={b.questionIc}><Ic n="loupe" t={18} /></span>
        <div><b>Ce propriétaire est-il déjà dans le CRM ?</b><small>Tape son nom : s’il y est, sa fiche se relie au bien et ses coordonnées se remplissent.</small></div>
      </div>
      <div className={b.chercheC}>
        <input className={s.cherche} value={q} disabled={off} placeholder="Nom ou prénom du propriétaire…" onChange={e => setQ(e.target.value)} aria-label="Chercher le propriétaire dans le CRM" />
        {trouves.length > 0 && (
          <div className={s.resultats}>
            {trouves.map(c => (
              <button key={c.id} type="button" className={s.resultat} onClick={() => choisir(c)}>
                <Ic n="personne" t={15} />{nomClient(c)}<small>{c.telephones?.[0] || c.emails?.[0] || ''}</small>
              </button>
            ))}
          </div>
        )}
        {q.trim().length >= 2 && clients && !trouves.length && <div className={s.chAide}>{`Aucun client « ${q.trim()} » dans le CRM.`}</div>}
      </div>
      {!off && (
        <div className={b.questionOu}>
          <span>Il n’est pas encore dans le CRM ?</span>
          <button type="button" className={`${b.questionBtn} ${b.questionBtnOr}`} onClick={nouvelleFiche}>
            <Ic n="plus" t={15} e={2.4} />{q.trim().length >= 2 ? `Créer sa fiche : « ${q.trim()} »` : 'Créer sa fiche'}
          </button>
        </div>
      )}
      {erreur && <div className={s.erreur}>{erreur}</div>}
    </div>
  );
}

/* ══ L'annonce ═══════════════════════════════════════════════════════════ */
function ChampAnnonce({ d, maj, off }: { d: Donnees; maj: Maj; off: boolean }) {
  const v = txt(d, 'annonceTexte');
  const [copie, setCopie] = useState(false);
  const ctrl = controleAnnonce(d);
  const manque = ctrl.filter(x => !x.ok).length;
  return (
    <div className={b.pieces}>
      <div className={b.annonceOutils}>
        {!off && (
          <button type="button" className={b.mini} onClick={() => { if (!v || confirm('Remplacer le texte actuel par un brouillon écrit à partir de la fiche ?')) maj('annonceTexte', brouillonAnnonce(d)); }}>
            <Ic n="plume" t={14} />{v ? 'Réécrire depuis la fiche' : 'Écrire un brouillon depuis la fiche'}
          </button>
        )}
        {v && (
          <button type="button" className={b.mini} onClick={() => { navigator.clipboard?.writeText(v).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1600); }).catch(() => {}); }}>
            <Ic n={copie ? 'check' : 'copier'} t={14} />{copie ? 'Copié' : 'Copier le texte'}
          </button>
        )}
        <span>{v ? `${v.length} caractères` : ''}</span>
      </div>
      <textarea className={s.input} rows={10} disabled={off} value={v} placeholder="Le texte de l’annonce, tel qu’il partira sur les portails."
        onChange={e => maj('annonceTexte', e.target.value)} />
      <ul className={b.controle}>
        <li className={b.controleT}>{manque ? `Mentions obligatoires : ${manque} à compléter dans la fiche` : 'Mentions obligatoires : tout y est'}</li>
        {ctrl.map(x => (
          <li key={x.l}>
            <span className={`${s.k} ${x.ok ? s.kVert : s.kRouge}`} style={{ width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {x.ok ? <Ic n="check" t={11} e={3} /> : <Croix t={11} />}
            </span>
            <span>{x.l}{x.aide && !x.ok && <small>{x.aide}</small>}</span>
          </li>
        ))}
        {passoire(d) && <li><span className={`${s.k} ${s.kOr}`} style={{ width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="info" t={12} /></span><span>Classe F ou G : l’annonce doit porter « Logement à consommation énergétique excessive ». Le brouillon l’écrit.</span></li>}
      </ul>
    </div>
  );
}

/* ── Un nombre entier au – / + (V3.15) ──
   Pièces, chambres, salles d'eau, étage… : un toucher plutôt qu'une frappe,
   et le chiffre reste modifiable au clavier. */
export type Compteur = Extract<ChampBien, { t: 'compteur' }>;
export function ChampCompteur({ c, v, onChange, off }: { c: Compteur; v: unknown; onChange: (n: number | null) => void; off: boolean }) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : null;
  const min = c.min ?? 0, max = c.max ?? 99;
  const [saisie, setSaisie] = useState<string | null>(null);
  const borne = (x: number) => Math.max(min, Math.min(max, x));
  const mot = n !== null && c.mots ? c.mots(n) : '';
  return (
    <div className={b.cpt}>
      <button type="button" className={b.cptBtn} disabled={off || n === null || n <= min} aria-label={`${c.lib} : un de moins`}
        onClick={() => { setSaisie(null); if (n !== null) onChange(borne(n - 1)); }}>−</button>
      <input className={b.cptVal} inputMode="numeric" autoComplete="off" disabled={off} aria-label={c.lib} placeholder="–"
        value={saisie ?? (n === null ? '' : String(n))}
        onFocus={e => e.currentTarget.select()} onBlur={() => setSaisie(null)}
        onChange={e => {
          const t = e.target.value.replace(/\D/g, '').slice(0, 3);
          setSaisie(t);
          onChange(t === '' ? null : borne(parseInt(t, 10)));
        }} />
      <button type="button" className={b.cptBtn} disabled={off || (n !== null && n >= max)} aria-label={`${c.lib} : un de plus`}
        onClick={() => { setSaisie(null); onChange(n === null ? Math.max(min, 1) : borne(n + 1)); }}>+</button>
      {mot && <span className={b.cptMot}>{mot}</span>}
    </div>
  );
}

/* ── L'adresse, proposée pendant la frappe (V3.15) ──
   La base adresse nationale, comme pour les contacts. Un choix remplit la
   rue, le code postal, la ville, et garde la position (pour la carte et
   les ventes autour, plus tard). */
type Suggestion = { properties?: { label?: string; name?: string; postcode?: string; city?: string; context?: string }; geometry?: { coordinates?: number[] } };
function ChampAdresse({ d, maj, off }: { d: Donnees; maj: Maj; off: boolean }) {
  const [sug, setSug] = useState<Suggestion[]>([]);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const derniere = useRef('');
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);
  const taper = (q: string) => {
    maj('adresse', q);
    derniere.current = q;
    if (minuterie.current) clearTimeout(minuterie.current);
    if (q.trim().length < 4) { setSug([]); return; }
    minuterie.current = setTimeout(async () => {
      try {
        const r = await fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=5&autocomplete=1`);
        const j = await r.json();
        if (derniere.current === q) setSug(Array.isArray(j.features) ? j.features : []);
      } catch { setSug([]); }
    }, 250);
  };
  const choisir = (f: Suggestion) => {
    const p = f.properties || {};
    maj('adresse', p.name || p.label || '');
    if (p.postcode) maj('cp', p.postcode);
    if (p.city) maj('ville', p.city);
    const xy = f.geometry?.coordinates;
    if (xy && xy.length === 2) maj('gps', { lon: xy[0], lat: xy[1] });
    derniere.current = '';
    setSug([]);
  };
  return (
    <div className={b.adr}>
      <input id="ch-adresse" className={s.input} disabled={off} autoComplete="off" placeholder="Tape le début : 12 rue de Silly…"
        value={typeof d.adresse === 'string' ? d.adresse : ''} onChange={e => taper(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') setSug([]); }} onBlur={() => setTimeout(() => setSug([]), 180)} />
      {sug.length > 0 && (
        <ul className={b.adrSug} role="listbox" aria-label="Adresses proposées">
          {sug.map((f, i) => (
            <li key={i}>
              <button type="button" role="option" aria-selected={false} onMouseDown={e => e.preventDefault()} onClick={() => choisir(f)}>
                <Ic n="lieu" t={15} />
                <span><b>{f.properties?.name || f.properties?.label}</b><small>{[f.properties?.postcode, f.properties?.city].filter(Boolean).join(' ')}</small></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Un champ de la fiche, quel qu'il soit ── */
/* ── Une liste d'observations (V3.16) : des travaux, un sinistre, ce que
   dit un PV d'AG. Une ligne par fait : sa nature (un clic sur une idée la
   remplit), sa date en clair (« 2022 », « AG de juin 2025 »), un
   commentaire ; pour un sinistre, « réglé » ou « en cours ». ── */
function ChampJournal({ c, v, onChange, off }: { c: Extract<ChampBien, { t: 'journal' }>; v: unknown; onChange: (x: Observation[]) => void; off: boolean }) {
  const l = lireObservations(v);
  const [neuve, setNeuve] = useState<string | null>(null);
  const majL = (id: string, x: Partial<Observation>) => onChange(l.map(o => (o.id === id ? { ...o, ...x } : o)));
  const ajouter = (nature = '') => {
    const id = nouvelId();
    onChange([...l, { id, nature, quand: '', note: '', ...(c.enCours ? { enCours: false } : {}) }]);
    setNeuve(id);
  };
  return (
    <div className={b.jour}>
      {l.map(o => (
        <div key={o.id} className={`${b.jourL} ${o.enCours ? b.jourRouge : ''}`}>
          <span className={b.jourIc}><Ic n={c.ic || 'outil'} t={17} /></span>
          <div className={b.jourCh}>
            <input className={s.input} value={o.nature} disabled={off} placeholder="Nature" aria-label="Nature"
              autoFocus={neuve === o.id && !o.nature} onChange={e => majL(o.id, { nature: e.target.value })} />
            <input className={s.input} value={o.quand} disabled={off} placeholder="Quand : 2022, AG de juin 2025…" aria-label="Quand"
              autoFocus={neuve === o.id && !!o.nature} onChange={e => majL(o.id, { quand: e.target.value })} />
            {c.enCours && (
              <div className={`${s.pills} ${b.jourEtat}`} role="radiogroup" aria-label="Où en est-il ?">
                <button type="button" role="radio" aria-checked={o.enCours === false} disabled={off} className={`${s.pill} ${o.enCours === false ? s.pillOn : ''}`} onClick={() => majL(o.id, { enCours: false })}><Ic n="check" t={15} />Réglé</button>
                <button type="button" role="radio" aria-checked={o.enCours === true} disabled={off} className={`${s.pill} ${o.enCours ? `${s.pillOn} ${b.pillRouge}` : ''}`} onClick={() => majL(o.id, { enCours: true })}><Ic n="info" t={15} />En cours</button>
              </div>
            )}
            <input className={`${s.input} ${b.jourNote}`} value={o.note} disabled={off} placeholder="Commentaire (facultatif)" aria-label="Commentaire"
              onChange={e => majL(o.id, { note: e.target.value })} />
          </div>
          {!off && <button type="button" className={b.jourX} aria-label={`Retirer ${o.nature || 'cette ligne'}`} onClick={() => onChange(l.filter(x => x.id !== o.id))}><Croix t={14} /></button>}
        </div>
      ))}
      {!off && (
        <div className={b.jourAjout}>
          <span>{l.length ? 'Ajouter :' : `Ajouter ${c.un} :`}</span>
          {c.idees.map(i => <button key={i} type="button" className={b.jourIdee} onClick={() => ajouter(i)}><Ic n="plus" t={12} e={2.6} />{i}</button>)}
          <button type="button" className={`${b.jourIdee} ${b.jourAutre}`} onClick={() => ajouter()}><Ic n="plus" t={12} e={2.6} />Autre</button>
        </div>
      )}
    </div>
  );
}

export function ChampBien({ c, d, maj, off, bienId }: { c: ChampBien; d: Donnees; maj: Maj; off: boolean; bienId: string }) {
  if (estChampActe(c)) return <ChampActe c={c} d={d} maj={maj} off={off} />;
  if (c.si && !c.si(d)) return null;
  let controle: React.ReactNode = null;
  if (c.t === 'lettres') controle = <ChampLettres genre={c.genre} v={d[c.cle]} lib={c.lib} off={off} onChange={x => maj(c.cle, x)} />;
  else if (c.t === 'pieces') controle = <ChampPieces d={d} maj={maj} off={off} />;
  else if (c.t === 'photos') controle = <ChampPhotos d={d} maj={maj} off={off} bienId={bienId} />;
  else if (c.t === 'dossier') controle = <ChampDossier d={d} maj={maj} off={off} bienId={bienId} />;
  else if (c.t === 'proprio') controle = <ChampProprio d={d} maj={maj} off={off} />;
  else if (c.t === 'annonce') controle = <ChampAnnonce d={d} maj={maj} off={off} />;
  else if (c.t === 'eurosAn') controle = <ChampEurosAn cle={c.cle} d={d} maj={maj} off={off} />;
  else if (c.t === 'compteur') controle = <ChampCompteur c={c} v={d[c.cle]} off={off} onChange={x => maj(c.cle, x)} />;
  else if (c.t === 'adresse') controle = <ChampAdresse d={d} maj={maj} off={off} />;
  else if (c.t === 'journal') controle = <ChampJournal c={c} v={d[c.cle]} off={off} onChange={x => maj(c.cle, x)} />;
  /* Les pièces et le propriétaire portent leur propre titre. */
  const sansTitre = c.t === 'pieces' || c.t === 'proprio';
  /* Deux compteurs côte à côte ; le reste sur toute la largeur. */
  const large = c.t !== 'compteur';
  /* Les questions à choisir en petites cartes, comme les choix (V3.16). */
  const carte = c.t === 'journal' || c.t === 'lettres';
  return (
    <div className={`${s.ch} ${large ? s.large : b.chCpt} ${carte ? s.chQ : ''}`}>
      {!sansTitre && <div className={s.chLib}>{c.ic && <span className={s.chIc}><Ic n={c.ic} t={14} /></span>}<span>{c.lib}</span></div>}
      {controle}
      {c.aide && <div className={s.chAide}>{c.aide}</div>}
    </div>
  );
}

/* Ce qui manque dans une étape, pour la pastille du fil : les champs
   obligatoires (comme dans les documents), et une pièce sans nom. */
export function manquesBien(champs: ChampBien[], d: Donnees): number {
  let n = manquesEtape(champs.filter(estChampActe), d);
  if (champs.some(c => c.t === 'pieces')) n += lirePieces(d.detailPieces).filter(p => !p.nom).length;
  if (champs.some(c => c.t === 'adresse') && !(typeof d.adresse === 'string' && d.adresse.trim())) n++;
  return n;
}
