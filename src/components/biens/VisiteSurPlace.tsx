'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { euros, jourParis } from '@/lib/mandat';
import { num, liste, txt } from '@/lib/actes';
import {
  ATOUTS_BIEN, ATOUTS_PIECE, DEFAUTS_BIEN, DELAIS, ETAPES_BIEN, ETATS_PIECE, PIECES_TUILES, SOLS,
  etapeDe, lireDossier, lignesDossier, lirePhotos, lirePieces, m2, nomExpo, pictoPiece, titreBien,
  type BienVente, type ChampBien as TChamp, type Donnees, type Piece, type Photo,
} from '@/lib/biens-vente';
import { Ic } from '@/components/documents/ApercuActe';
import { ChampBien, SaisieNombre, habitable, nomLibre, nouvelId } from './ChampsBien';
import { deposerPhoto, enregistrerBien, noterVisiteFaite } from './outils';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';

/* ═══ La visite sur place — le mode tablette (V3.16) ══════════════════════
   Chez le propriétaire, la tablette à la main : plein écran, de gros
   boutons, un écran à la fois. Le bien et son propriétaire, les chiffres,
   les pièces une à une (surface, exposition, état, sol, ce qu'elle a, une
   photo prise sur place), l'intérieur et l'extérieur, ce qu'on retient, et
   la fin de visite (ce qu'il faut demander au propriétaire, et la suite).

   Rien ne se perd : chaque touche s'enregistre (0,7 s après), et se garde
   aussi sur la tablette. Sans réseau (une cave, un parking), la visite
   continue ; l'envoi repart dès que le réseau revient, photos comprises.

   Les questions viennent de la fiche du bien (ETAPES_BIEN) : une seule
   définition, deux façons de la remplir. */

type Suite = 'estimation' | 'mandat' | 'document' | undefined;
type Enreg = 'ok' | 'attente' | 'encours' | 'horsligne' | { erreur: string };

const ECRANS: { id: string; t: string; court: string; ic: string }[] = [
  { id: 'qui', t: 'Le bien et son propriétaire', court: 'Le bien', ic: 'maison' },
  { id: 'chiffres', t: 'Les chiffres', court: 'Chiffres', ic: 'regle' },
  { id: 'pieces', t: 'Pièce par pièce', court: 'Pièces', ic: 'plan' },
  { id: 'autour', t: 'L’intérieur et l’extérieur', court: 'Intérieur, extérieur', ic: 'canape' },
  { id: 'acces', t: 'Pour les visites', court: 'Accès', ic: 'cle' },
  { id: 'retenir', t: 'Ce qu’on retient', court: 'À retenir', ic: 'etoile' },
  { id: 'fin', t: 'Fin de visite', court: 'Fin', ic: 'check' },
];

/* Les questions de la fiche, par leur clé (une clé peut avoir deux
   définitions : « etages », niveaux d'une maison ou étages d'un immeuble). */
const TOUS: TChamp[] = ETAPES_BIEN.flatMap(e => e.champs);
const defs = (cles: string[]) => cles.flatMap(k => TOUS.filter(c => c.cle === k && c.t !== 'titre'));
const CHAMPS: Record<string, string[]> = {
  qui: ['typeBien', 'adresse', 'cp', 'ville', 'quartier', 'lot', 'motif', 'delai'],
  surfaces: ['surface', 'carrez', 'sejour', 'terrain'],
  compteurs: ['pieces', 'chambres', 'sdb', 'salleseau', 'wc', 'niveaux', 'etages', 'etage'],
  immeuble: ['annee', 'immeuble'],
  interieur: ['etat', 'cuisine', 'cuisineEquip', 'chauffageMode', 'chauffageEnergie', 'chauffageEmetteurs', 'eauChaude', 'equipements'],
  exterieur: ['annexes', 'surfBalcon', 'surfTerrasse', 'surfLoggia', 'surfJardin', 'surfCave', 'nbParking', 'expo', 'vue', 'visAVis'],
  /* V3.16 : les indications de visite se notent sur place. */
  occupation: ['occupation', 'loyer', 'finBail', 'disponible'],
  cles: ['cles', 'trousseau'],
  acces: ['accesBas', 'interphone', 'digicode', 'porte', 'accesAscenseur', 'itineraire', 'annexesNum'],
  surPlace: ['contactNom', 'contactTel', 'creneaux', 'consignes'],
  /* Ce qu'on demande au propriétaire : les travaux, les sinistres, la copro. */
  logement: ['travauxFaits', 'sinistre', 'sinistres'],
  copro: ['copro', 'coproVotes', 'coproFaits', 'coproAVenir'],
};
const cleDraft = (id: string) => `emi-visite-${id}`;
/* La date du jour, à l'heure de Paris (V3.50 : c'était l'heure de la tablette). */
const aujourdhui = () => jourParis();

/* ── Un bloc de questions de la fiche, en grand ── */
function Questions({ cles, d, maj, bienId, titre, ic }: { cles: string[]; d: Donnees; maj: (c: string, v: unknown) => void; bienId: string; titre?: string; ic?: string }) {
  const l = defs(cles).filter(c => !c.si || c.si(d));
  if (!l.length) return null;
  return (
    <section className={b.vBloc}>
      {titre && <h3 className={b.vBlocT}>{ic && <span><Ic n={ic} t={18} /></span>}{titre}</h3>}
      <div className={s.grille}>
        {l.map(c => <Fragment key={`${c.cle}:${'lib' in c ? c.lib : ''}`}><ChampBien c={c} d={d} maj={maj} off={false} bienId={bienId} /></Fragment>)}
      </div>
    </section>
  );
}

/* ── Des pastilles à cocher (plusieurs), avec « + autre » ── */
function Pastilles({ options, v, onChange, ton = 'or' }: { options: string[]; v: string[]; onChange: (x: string[]) => void; ton?: 'or' | 'rouge' }) {
  const [autre, setAutre] = useState('');
  const toutes = [...options, ...v.filter(x => !options.includes(x))];
  const basculer = (x: string) => onChange(v.includes(x) ? v.filter(y => y !== x) : [...v, x]);
  return (
    <div className={b.vPast}>
      {toutes.map(x => (
        <button key={x} type="button" className={`${b.vPastB} ${v.includes(x) ? (ton === 'rouge' ? b.vPastRouge : b.vPastOn) : ''}`} aria-pressed={v.includes(x)} onClick={() => basculer(x)}>
          {v.includes(x) && <Ic n="check" t={14} e={3} />}{x}
        </button>
      ))}
      <form className={b.vAutre} onSubmit={e => { e.preventDefault(); const t = autre.trim(); if (t && !v.includes(t)) onChange([...v, t]); setAutre(''); }}>
        <input className={s.input} value={autre} onChange={e => setAutre(e.target.value)} placeholder="Autre…" aria-label="Ajouter" />
        <button type="submit" className={b.vPastB} disabled={!autre.trim()}><Ic n="plus" t={14} e={2.6} />Ajouter</button>
      </form>
    </div>
  );
}

/* ── La boussole : huit directions autour du centre ── */
const ROSE: { v: string; x: number; y: number }[] = [
  { v: 'NO', x: 0, y: 0 }, { v: 'N', x: 1, y: 0 }, { v: 'NE', x: 2, y: 0 },
  { v: 'O', x: 0, y: 1 }, { v: 'E', x: 2, y: 1 },
  { v: 'SO', x: 0, y: 2 }, { v: 'S', x: 1, y: 2 }, { v: 'SE', x: 2, y: 2 },
];
function Boussole({ v, onChange }: { v: string; onChange: (x: string) => void }) {
  return (
    <div className={b.vRose} role="radiogroup" aria-label="Exposition">
      {ROSE.map(r => (
        <button key={r.v} type="button" role="radio" aria-checked={v === r.v} title={nomExpo(r.v)}
          className={`${b.vRoseB} ${v === r.v ? b.vRoseOn : ''}`} style={{ gridColumn: r.x + 1, gridRow: r.y + 1 }}
          onClick={() => onChange(v === r.v ? '' : r.v)}>{r.v}</button>
      ))}
      <span className={b.vRoseC} style={{ gridColumn: 2, gridRow: 2 }}><Ic n="boussole" t={22} /></span>
    </div>
  );
}

/* ── Une pièce, en grand ── */
function EditeurPiece({ p, l, photos, typeBien, plusieursNiveaux, envoi, onMaj, onRetirer, onPhoto, onSuivante, derniere }: {
  p: Piece; l: Piece[]; photos: Photo[]; typeBien: string; plusieursNiveaux: boolean; envoi: boolean;
  onMaj: (x: Partial<Piece>) => void; onRetirer: () => void; onPhoto: (f: File) => void; onSuivante: () => void; derniere: boolean;
}) {
  const fichier = useRef<HTMLInputElement>(null);
  const niveaux = typeBien === 'maison'
    ? ['Sous-sol', 'Rez-de-chaussée', '1er étage', '2e étage', 'Combles', 'Extérieur']
    : ['Niveau bas', 'Niveau haut', 'Extérieur'];
  return (
    <div className={b.vPiece}>
      <div className={b.vPieceTete}>
        <span className={b.vPieceIc}><Ic n={pictoPiece(p.nom)} t={26} /></span>
        <input className={`${s.input} ${b.vPieceNom}`} value={p.nom} onChange={e => onMaj({ nom: e.target.value })} aria-label="Nom de la pièce" placeholder="Nom de la pièce" />
        <button type="button" className={b.vRetirer} onClick={onRetirer} aria-label="Retirer cette pièce"><Ic n="corbeille" t={18} /></button>
      </div>

      <div className={b.vPieceGrille}>
        <div className={b.vCh}>
          <span className={b.vLib}><Ic n="regle" t={16} />Surface</span>
          <SaisieNombre v={p.surface} onChange={n => onMaj({ surface: n })} unite="m²" off={false} ph="Ex : 12,5" lib="Surface" />
        </div>
        <div className={b.vCh}>
          <span className={b.vLib}><Ic n="boussole" t={16} />Exposition</span>
          <Boussole v={p.expo} onChange={x => onMaj({ expo: x })} />
        </div>
      </div>

      {plusieursNiveaux && (
        <div className={b.vCh}>
          <span className={b.vLib}><Ic n="escalier" t={16} />Niveau</span>
          <div className={s.pills}>
            {niveaux.map(n => <button key={n} type="button" className={`${s.pill} ${p.niveau === n ? s.pillOn : ''}`} onClick={() => onMaj({ niveau: n })}>{n}</button>)}
          </div>
        </div>
      )}

      <div className={b.vCh}>
        <span className={b.vLib}><Ic n="pinceau" t={16} />État</span>
        <div className={b.vEtats}>
          {ETATS_PIECE.map(e => (
            <button key={e.v} type="button" className={`${b.vEtat} ${p.etat === e.v ? b.vEtatOn : ''}`} aria-pressed={p.etat === e.v}
              style={p.etat === e.v ? { borderColor: e.c, background: `${e.c}14` } : undefined} onClick={() => onMaj({ etat: p.etat === e.v ? '' : e.v })}>
              <i style={{ background: e.c }} />{e.l}
            </button>
          ))}
        </div>
      </div>

      <div className={b.vCh}>
        <span className={b.vLib}><Ic n="lignes" t={16} />Sol</span>
        <div className={s.pills}>
          {SOLS.map(x => <button key={x} type="button" className={`${s.pill} ${p.sol === x ? s.pillOn : ''}`} onClick={() => onMaj({ sol: p.sol === x ? '' : x })}>{x}</button>)}
        </div>
      </div>

      <div className={b.vCh}>
        <span className={b.vLib}><Ic n="etoile" t={16} />Ce qu’elle a</span>
        <Pastilles options={ATOUTS_PIECE} v={p.atouts || []} onChange={x => onMaj({ atouts: x })} />
      </div>

      <div className={b.vCh}>
        <span className={b.vLib}><Ic n="crayon" t={16} />Un mot</span>
        <textarea className={s.input} rows={2} value={p.note} onChange={e => onMaj({ note: e.target.value })} placeholder="Ex : placard intégré, ouvre sur le balcon" />
      </div>

      <div className={b.vCh}>
        <span className={b.vLib}><Ic n="photo" t={16} />{`Photos de la pièce${photos.length ? ` · ${photos.length}` : ''}`}</span>
        <div className={b.vPhotos}>
          {photos.map(ph => (
            <span key={ph.url} className={b.vPhoto}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ph.url} alt={ph.legende || p.nom} />
            </span>
          ))}
          <button type="button" className={b.vPhotoAjout} onClick={() => fichier.current?.click()} disabled={envoi}>
            <Ic n="photo" t={24} /><span>{envoi ? 'Envoi…' : 'Prendre une photo'}</span>
          </button>
          <input ref={fichier} type="file" accept="image/*" capture="environment" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ''; }} />
        </div>
      </div>

      <div className={b.vPieceSuite}>
        <button type="button" className={`${s.btn} ${s.btnNavy} ${b.vGros}`} onClick={onSuivante}>
          {derniere ? 'Pièce suivante : en ajouter une' : `Pièce suivante : ${l[l.findIndex(x => x.id === p.id) + 1]?.nom || ''}`}<Ic n="droite" t={18} e={2.4} />
        </button>
      </div>
    </div>
  );
}

/* ── L'écran des pièces ── */
function EcranPieces({ d, maj, photosEnAttente, envoyerPhoto }: {
  d: Donnees; maj: (c: string, v: unknown) => void; photosEnAttente: number;
  envoyerPhoto: (f: File, legende: string) => Promise<void>;
}) {
  const l = lirePieces(d.detailPieces);
  const [ouverte, setOuverte] = useState<string | null>(l[0]?.id || null);
  const [envoi, setEnvoi] = useState(false);
  const [ajout, setAjout] = useState(!l.length);
  const [autre, setAutre] = useState('');
  const ecrire = (x: Piece[]) => maj('detailPieces', x);
  const p = l.find(x => x.id === ouverte) || null;
  const plusieursNiveaux = (num(d, 'niveaux') || 0) >= 2 || (d.typeBien === 'maison' && (num(d, 'etages') || 0) >= 2);
  const niveauDefaut = p?.niveau || l[l.length - 1]?.niveau || 'Niveau principal';
  const ajouter = (nom: string) => {
    const n: Piece = { id: nouvelId(), niveau: niveauDefaut, nom: nomLibre(l, nom), surface: null, expo: '', note: '' };
    ecrire([...l, n]); setOuverte(n.id); setAjout(false); setAutre('');
    requestAnimationFrame(() => document.querySelector('[data-visite-corps]')?.scrollTo({ top: 0, behavior: 'smooth' }));
  };
  const majPiece = (x: Partial<Piece>) => {
    if (!p) return;
    /* Renommer une pièce emporte ses photos (rangées sous son nom). */
    if (x.nom !== undefined && x.nom !== p.nom) {
      const ancien = p.nom;
      maj('photos', (avant: unknown) => lirePhotos(avant).map(ph => (ph.legende === ancien ? { ...ph, legende: x.nom as string } : ph)));
    }
    ecrire(l.map(y => (y.id === p.id ? { ...y, ...x } : y)));
  };
  const retirer = () => {
    if (!p || !confirm(`Retirer « ${p.nom || 'cette pièce'} » ?`)) return;
    const i = l.findIndex(x => x.id === p.id);
    const reste = l.filter(x => x.id !== p.id);
    ecrire(reste); setOuverte(reste[Math.min(i, reste.length - 1)]?.id || null); if (!reste.length) setAjout(true);
  };
  const suivante = () => {
    const i = l.findIndex(x => x.id === ouverte);
    if (i < 0 || i >= l.length - 1) { setAjout(true); return; }
    setOuverte(l[i + 1].id);
    document.querySelector('[data-visite-corps]')?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const photo = async (f: File) => {
    if (!p) return;
    setEnvoi(true);
    try { await envoyerPhoto(f, p.nom); } finally { setEnvoi(false); }
  };
  const total = l.filter(habitable).reduce((t, x) => t + (x.surface || 0), 0);
  const declaree = num(d, 'surface');
  const photos = lirePhotos(d.photos);

  return (
    <div className={b.vPieces}>
      <aside className={b.vListe}>
        <div className={b.vListeT}>
          <b>{`${l.length} pièce${l.length > 1 ? 's' : ''}`}</b>
          <span>{total ? `${m2(total)} à vivre${declaree ? ` sur ${m2(declaree)}` : ''}` : 'Les surfaces s’additionnent ici'}</span>
        </div>
        <div className={b.vListeL}>
          {l.map(x => {
            const e = ETATS_PIECE.find(y => y.v === x.etat);
            const nbP = photos.filter(ph => ph.legende === x.nom).length;
            return (
              <button key={x.id} type="button" className={`${b.vListeB} ${x.id === ouverte && !ajout ? b.vListeOn : ''}`} onClick={() => { setOuverte(x.id); setAjout(false); }}>
                <span className={b.vListeIc}><Ic n={pictoPiece(x.nom)} t={18} /></span>
                <span className={b.vListeNom}><b>{x.nom || 'Pièce'}</b><small>{[x.surface ? m2(x.surface) : '', x.expo ? nomExpo(x.expo) : '', nbP ? `${nbP} photo${nbP > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') || 'À remplir'}</small></span>
                {e && <i className={b.vListePoint} style={{ background: e.c }} title={e.l} />}
              </button>
            );
          })}
          <button type="button" className={`${b.vListeB} ${b.vListeAjout} ${ajout ? b.vListeOn : ''}`} onClick={() => setAjout(true)}>
            <span className={b.vListeIc}><Ic n="plus" t={18} e={2.6} /></span><span className={b.vListeNom}><b>Ajouter une pièce</b></span>
          </button>
        </div>
        {photosEnAttente > 0 && <div className={b.vAttente}>{`${photosEnAttente} photo${photosEnAttente > 1 ? 's' : ''} en attente de réseau`}</div>}
      </aside>

      <div className={b.vPieceZone}>
        {ajout || !p ? (
          <div className={b.vAjout}>
            <h3 className={b.vBlocT}><span><Ic n="plus" t={18} e={2.6} /></span>Quelle pièce ?</h3>
            <div className={b.vTuiles}>
              {PIECES_TUILES.map(t => (
                <button key={t} type="button" className={b.vTuile} onClick={() => ajouter(t)}>
                  <span><Ic n={pictoPiece(t)} t={26} /></span>{t}
                </button>
              ))}
            </div>
            <form className={b.vAutre} onSubmit={e => { e.preventDefault(); if (autre.trim()) ajouter(autre.trim()); }}>
              <input className={s.input} value={autre} onChange={e => setAutre(e.target.value)} placeholder="Une autre : mezzanine, véranda…" aria-label="Autre pièce" />
              <button type="submit" className={b.vPastB} disabled={!autre.trim()}><Ic n="plus" t={14} e={2.6} />Ajouter</button>
            </form>
            {l.length > 0 && <button type="button" className={b.lien} onClick={() => setAjout(false)}>Revenir aux pièces</button>}
          </div>
        ) : (
          <EditeurPiece key={p.id} p={p} l={l} photos={photos.filter(ph => ph.legende === p.nom)} typeBien={String(d.typeBien || '')}
            plusieursNiveaux={plusieursNiveaux} envoi={envoi} onMaj={majPiece} onRetirer={retirer} onPhoto={f => { void photo(f); }}
            onSuivante={suivante} derniere={l.findIndex(x => x.id === p.id) === l.length - 1} />
        )}
      </div>
    </div>
  );
}

/* ── La fin de visite ── */
function EcranFin({ bien, d, maj, onFin }: { bien: BienVente; d: Donnees; maj: (c: string, v: unknown) => void; onFin: (x: Suite) => void }) {
  const pieces = lirePieces(d.detailPieces);
  const photos = lirePhotos(d.photos);
  const dossier = lireDossier(d.dossier);
  const lignes = lignesDossier(d).filter(x => dossier[x.k]?.etat !== 'recu' && dossier[x.k]?.etat !== 'nc');
  const demande = (k: string) => dossier[k]?.etat === 'demande';
  const basculer = (k: string) => {
    const p = dossier[k] || { etat: '', date: '', chemin: '', nom: '' };
    maj('dossier', { ...dossier, [k]: { ...p, etat: demande(k) ? '' : 'demande', date: demande(k) ? p.date : aujourdhui() } });
  };
  const total = pieces.filter(habitable).reduce((t, x) => t + (x.surface || 0), 0);
  const atouts = liste(d, 'visiteAtouts'), defauts = liste(d, 'visiteDefauts');
  return (
    <div className={b.vFin}>
      <div className={b.vRecap}>
        <div><b>{pieces.length}</b><span>{`pièce${pieces.length > 1 ? 's' : ''}${total ? ` · ${m2(total)}` : ''}`}</span></div>
        <div><b>{photos.length}</b><span>{`photo${photos.length > 1 ? 's' : ''}`}</span></div>
        <div><b>{atouts.length}</b><span>{`atout${atouts.length > 1 ? 's' : ''}`}</span></div>
        <div><b>{defauts.length}</b><span>{`point${defauts.length > 1 ? 's' : ''} à défendre`}</span></div>
      </div>

      <section className={b.vBloc}>
        <h3 className={b.vBlocT}><span><Ic n="dossier" t={18} /></span>Ce qu’il faut demander au propriétaire</h3>
        <p className={b.vAide}>Coche ce que tu lui demandes : ça passe « demandé » dans le dossier du bien.</p>
        <div className={b.vDemandes}>
          {lignes.map(x => (
            <button key={x.k} type="button" className={`${b.vDemande} ${demande(x.k) ? b.vDemandeOn : ''}`} aria-pressed={demande(x.k)} onClick={() => basculer(x.k)}>
              <span className={b.vCase}>{demande(x.k) && <Ic n="check" t={14} e={3} />}</span>
              <span><b>{x.l}</b>{x.aide && <small>{x.aide}</small>}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={b.vBloc}>
        <h3 className={b.vBlocT}><span><Ic n="droite" t={18} e={2.4} /></span>Et maintenant</h3>
        <div className={b.vSuites}>
          {bien.etape === 'a_suivre' && (
            <button type="button" className={`${b.vSuiteB} ${b.vSuiteOr}`} onClick={() => onFin('estimation')}>
              <Ic n="regle" t={22} /><span><b>Passer en estimation</b><small>La fourchette et le prix conseillé, sur la fiche</small></span>
            </button>
          )}
          <button type="button" className={`${b.vSuiteB} ${bien.etape === 'estimation' ? b.vSuiteOr : ''}`} onClick={() => onFin('mandat')}>
            <Ic n="plume" t={22} /><span><b>Le mandat est signé</b><small>Le prix, les honoraires : le bien passe « En vente »</small></span>
          </button>
          <button type="button" className={b.vSuiteB} onClick={() => onFin('document')}>
            <Ic n="doc" t={22} /><span><b>Préparer le mandat à signer</b><small>Prérempli, à signer sur la tablette ou en ligne</small></span>
          </button>
          <button type="button" className={b.vSuiteB} onClick={() => onFin(undefined)}>
            <Ic n="check" t={22} e={2.4} /><span><b>Terminer la visite</b><small>Tout est enregistré, retour à la fiche</small></span>
          </button>
        </div>
      </section>
    </div>
  );
}

export default function VisiteSurPlace({ bien, onFermer }: { bien: BienVente; onFermer: (r: BienVente, suite?: Suite) => void }) {
  const [row, setRow] = useState<BienVente>(bien);
  /* Un brouillon plus récent que la fiche (la tablette a perdu le réseau,
     ou la page s'est fermée) : on repart de lui. */
  const [d, setD] = useState<Donnees>(() => {
    const base = { ...(bien.donnees || {}) };
    try {
      const x = JSON.parse(localStorage.getItem(cleDraft(bien.id)) || 'null');
      if (x && x.d && x.t > Date.parse(bien.updated_at || '0')) return { ...base, ...x.d };
    } catch { /* sans mémoire locale */ }
    return base;
  });
  const [ecran, setEcran] = useState(0);
  const [enreg, setEnreg] = useState<Enreg>('ok');
  /* Les photos prises sans réseau : gardées ici jusqu'à son retour. */
  const attente = useRef<{ f: File; legende: string }[]>([]);
  const [nbAttente, setNbAttente] = useState(0);
  const corps = useRef<HTMLDivElement>(null);

  const dernier = useRef<Donnees>(d);
  /* Ce que la base avait, vu d'ici (V3.43) : seules les réponses changées
     depuis partent (un brouillon repris compte comme changé). */
  const vu = useRef<Donnees>({ ...(bien.donnees || {}) });
  const aEnregistrer = useRef(false);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVol = useRef<Promise<boolean> | null>(null);

  const enregistrer = useCallback(async (): Promise<boolean> => {
    if (enVol.current) await enVol.current;
    if (!aEnregistrer.current) return true;
    aEnregistrer.current = false;
    setEnreg('encours');
    const p = (async () => {
      try {
        const envoye = dernier.current;
        const r = await enregistrerBien(row.id, envoye, vu.current);
        vu.current = envoye;
        setRow(r);
        if (!aEnregistrer.current) { try { localStorage.removeItem(cleDraft(row.id)); } catch { /* rien */ } }
        setEnreg(aEnregistrer.current ? 'attente' : 'ok');
        return true;
      } catch (e) {
        aEnregistrer.current = true;
        setEnreg(typeof navigator !== 'undefined' && !navigator.onLine ? 'horsligne' : { erreur: (e as Error).message });
        return false;
      }
    })();
    enVol.current = p;
    const ok = await p;
    enVol.current = null;
    return ok;
  }, [row.id]);

  /* V3.50 : la visite est « faite » à la première vraie réponse, et non plus
     à la simple ouverture de l'écran (un coup d'œil sur la tablette cochait
     la visite et le rendez-vous). Ce jour-là, le Suivi du propriétaire le dit. */
  const marque = useRef(!!txt(bien.donnees || {}, 'visiteLe'));
  const maj = useCallback((cle: string, v: unknown) => {
    const ajout: Donnees = {};
    if (!marque.current && cle !== 'visiteLe' && cle !== 'rdvEstimation') {
      marque.current = true;
      if (!txt(dernier.current, 'visiteLe')) {
        ajout.visiteLe = aujourdhui();
        void noterVisiteFaite(bien);
      }
      if (!txt(dernier.current, 'rdvEstimation') && (bien.etape === 'a_suivre' || bien.etape === 'estimation')) ajout.rdvEstimation = aujourdhui();
    }
    setD(prev => {
      const n = { ...prev, ...ajout, [cle]: typeof v === 'function' ? (v as (a: unknown) => unknown)(prev[cle]) : v };
      dernier.current = n;
      try { localStorage.setItem(cleDraft(row.id), JSON.stringify({ t: Date.now(), d: n })); } catch { /* plein ou interdit */ }
      return n;
    });
    aEnregistrer.current = true;
    setEnreg('attente');
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => { void enregistrer(); }, 700);
  }, [enregistrer, row.id, bien]);

  /* Les photos : envoyées tout de suite, ou gardées jusqu'au retour du réseau. */
  const envoyerPhoto = useCallback(async (f: File, legende: string) => {
    try {
      const ph = await deposerPhoto(row.id, f);
      maj('photos', (avant: unknown) => [...lirePhotos(avant), { ...ph, legende }]);
    } catch {
      attente.current = [...attente.current, { f, legende }];
      setNbAttente(attente.current.length);
    }
  }, [row.id, maj]);

  /* Le réseau revient : on renvoie ce qui attendait. Et on réessaie toutes
     les 20 secondes tant que quelque chose n'est pas parti. */
  useEffect(() => {
    const reprendre = () => {
      if (aEnregistrer.current) void enregistrer();
      const l = attente.current;
      if (!l.length) return;
      attente.current = [];
      setNbAttente(0);
      l.forEach(x => { void envoyerPhoto(x.f, x.legende); });
    };
    window.addEventListener('online', reprendre);
    const t = setInterval(() => { if (navigator.onLine) reprendre(); }, 20000);
    return () => { window.removeEventListener('online', reprendre); clearInterval(t); };
  }, [enregistrer, envoyerPhoto]);

  /* Au premier affichage (V3.50) : seulement le brouillon resté sur la
     tablette, s'il est plus récent que la fiche — la date de la visite
     attend la première réponse (maj). */
  const premier = useRef(false);
  useEffect(() => {
    if (premier.current) return;
    premier.current = true;
    if (JSON.stringify(dernier.current) !== JSON.stringify(vu.current)) {
      aEnregistrer.current = true;
      const t = setTimeout(() => { void enregistrer(); }, 0);
      return () => clearTimeout(t);
    }
  }, [enregistrer]);

  async function fermer(suite?: Suite) {
    if (minuterie.current) clearTimeout(minuterie.current);
    const ok = await enregistrer();
    if (!ok && !confirm('La visite n’a pas encore pu partir (pas de réseau ?). Elle reste gardée sur la tablette et partira au prochain enregistrement.\n\nQuitter quand même ?')) return;
    onFermer({ ...row, donnees: dernier.current }, suite);
  }

  const aller = (i: number) => {
    setEcran(Math.max(0, Math.min(ECRANS.length - 1, i)));
    corps.current?.scrollTo({ top: 0 });
  };

  /* L'écran reste allumé pendant la visite, si la tablette le permet. */
  useEffect(() => {
    let verrou: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then(v => { verrou = v; }).catch(() => { /* refusé : tant pis */ });
    return () => { void verrou?.release().catch(() => {}); };
  }, []);

  const texteEnreg = enreg === 'ok' ? 'Enregistré'
    : enreg === 'attente' ? 'Enregistrement…'
      : enreg === 'encours' ? 'Enregistrement…'
        : enreg === 'horsligne' ? 'Sans réseau : gardé sur la tablette'
          : 'Pas encore parti : on réessaie';
  const proprios = (Array.isArray(d.proprietaires) ? d.proprietaires as Record<string, unknown>[] : [])
    .map(p => [p.prenom, p.nom].filter(Boolean).join(' ')).filter(Boolean);
  const tel = (Array.isArray(d.proprietaires) ? d.proprietaires as Record<string, unknown>[] : []).map(p => String(p.telephone || '')).find(Boolean);
  const e = ECRANS[ecran];
  const et = etapeDe(row.etape);
  const nbPieces = lirePieces(d.detailPieces).length;

  const contenu = (
    <div className={`${b.visite} ${s.grandeSaisie} ${s.saisieVive}`} role="dialog" aria-modal="true" aria-label="Visite sur place">
      <header className={b.vBarre}>
        <button type="button" className={b.vQuitter} onClick={() => { void fermer(); }}><Ic n="retour" t={18} /><span>La fiche</span></button>
        <div className={b.vTitre}>
          <b>{titreBien(d)}</b>
          <span><i className={b.point} style={{ background: et.c }} />{`Visite sur place${d.adresse ? ` · ${d.adresse}` : ''}`}</span>
        </div>
        <span className={`${b.vEnreg} ${enreg === 'ok' ? b.vEnregOk : enreg === 'horsligne' || typeof enreg === 'object' ? b.vEnregKo : ''}`} role="status">
          <Ic n={enreg === 'ok' ? 'check' : enreg === 'horsligne' ? 'info' : 'historique'} t={15} e={2.4} />{texteEnreg}
        </span>
      </header>

      <nav className={b.vFil} aria-label="Écrans de la visite">
        {ECRANS.map((x, i) => (
          <button key={x.id} type="button" className={`${b.vFilB} ${i === ecran ? b.vFilOn : i < ecran ? b.vFilFait : ''}`} aria-current={i === ecran ? 'step' : undefined} onClick={() => aller(i)}>
            <span className={b.vFilN}><Ic n={x.ic} t={15} />{i < ecran && <i className={b.pasCoche}><Ic n="check" t={8} e={3.6} /></i>}</span>
            <span className={b.vFilL}>{x.id === 'pieces' && nbPieces ? `${x.court} · ${nbPieces}` : x.court}</span>
          </button>
        ))}
      </nav>

      <div className={b.vCorps} ref={corps} data-visite-corps>
        <div className={`${b.vCorpsIn} ${e.id === 'pieces' ? b.vCorpsLarge : ''}`}>
          <div className={b.vEcranT}>
            <span className={b.vEcranIc}><Ic n={e.ic} t={24} /></span>
            <div><small>{`${ecran + 1} sur ${ECRANS.length}`}</small><h2>{e.t}</h2></div>
          </div>

          {e.id === 'qui' && (
            <>
              {(proprios.length > 0 || tel) && (
                <div className={b.vProprio}>
                  <span className={b.vProprioIc}><Ic n="personne" t={22} /></span>
                  <div><small>Chez</small><b>{proprios.join(' et ') || 'Le propriétaire'}</b></div>
                  {tel && <a className={b.vPastB} href={`tel:${tel.replace(/\s+/g, '')}`}><Ic n="telephone" t={15} />{tel}</a>}
                </div>
              )}
              <Questions cles={CHAMPS.qui} d={d} maj={maj} bienId={row.id} />
            </>
          )}

          {e.id === 'chiffres' && (
            <>
              <Questions cles={CHAMPS.surfaces} d={d} maj={maj} bienId={row.id} titre="Les surfaces" ic="regle" />
              <Questions cles={CHAMPS.compteurs} d={d} maj={maj} bienId={row.id} titre="Les pièces et les étages" ic="plan" />
              <Questions cles={CHAMPS.immeuble} d={d} maj={maj} bienId={row.id} titre="La construction" ic="immeuble" />
            </>
          )}

          {e.id === 'pieces' && (
            <EcranPieces d={d} maj={maj} photosEnAttente={nbAttente} envoyerPhoto={envoyerPhoto} />
          )}

          {e.id === 'autour' && (
            <>
              <Questions cles={CHAMPS.interieur} d={d} maj={maj} bienId={row.id} titre="L’intérieur" ic="canape" />
              <Questions cles={CHAMPS.exterieur} d={d} maj={maj} bienId={row.id} titre="L’extérieur et la vue" ic="soleil" />
            </>
          )}

          {e.id === 'acces' && (
            <>
              <Questions cles={CHAMPS.occupation} d={d} maj={maj} bienId={row.id} titre="Occupé ou libre" ic="porte" />
              <Questions cles={CHAMPS.cles} d={d} maj={maj} bienId={row.id} titre="Les clés" ic="cle" />
              <Questions cles={CHAMPS.acces} d={d} maj={maj} bienId={row.id} titre="Pour arriver jusqu’à la porte" ic="carte" />
              <Questions cles={CHAMPS.surPlace} d={d} maj={maj} bienId={row.id} titre="Sur place" ic="telephone" />
              <p className={b.vAide}>Pour tes prochaines visites, puis celles des acheteurs. Tout se retrouve sur la fiche, dans « Les indications de visite ».</p>
            </>
          )}

          {e.id === 'retenir' && (
            <>
              <section className={b.vBloc}>
                <h3 className={b.vBlocT}><span><Ic n="etoile" t={18} /></span>Ses atouts</h3>
                <Pastilles options={ATOUTS_BIEN} v={liste(d, 'visiteAtouts')} onChange={x => maj('visiteAtouts', x)} />
              </section>
              <section className={b.vBloc}>
                <h3 className={b.vBlocT}><span><Ic n="info" t={18} /></span>Les points à défendre</h3>
                <Pastilles options={DEFAUTS_BIEN} v={liste(d, 'visiteDefauts')} onChange={x => maj('visiteDefauts', x)} ton="rouge" />
              </section>
              <Questions cles={CHAMPS.logement} d={d} maj={maj} bienId={row.id} titre="Travaux et sinistres" ic="outil" />
              <Questions cles={CHAMPS.copro} d={d} maj={maj} bienId={row.id} titre="La copropriété : ce que disent les PV d’AG" ic="lots" />
              <section className={b.vBloc}>
                <h3 className={b.vBlocT}><span><Ic n="euro" t={18} /></span>Ce que le propriétaire a en tête</h3>
                <div className={s.grille}>
                  <div className={b.vCh}>
                    <span className={b.vLib}><Ic n="etiquette" t={16} />Le prix qu’il espère</span>
                    <SaisieNombre v={num(d, 'prixSouhaite')} euros unite="€" off={false} onChange={n => maj('prixSouhaite', n)} ph="Ex : 950 000" lib="Prix espéré" />
                  </div>
                  <div className={b.vCh}>
                    <span className={b.vLib}><Ic n="calendrier" t={16} />Son délai</span>
                    <div className={s.pills}>
                      {DELAIS.map(o => (
                        <button key={o.v} type="button" className={`${s.pill} ${d.delai === o.v ? s.pillOn : ''}`} onClick={() => maj('delai', d.delai === o.v ? '' : o.v)}>{o.ic && <Ic n={o.ic} t={15} />}{o.v === 'libre' ? 'Pas pressé' : o.l}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className={b.vCh} style={{ marginTop: 14 }}>
                  <span className={b.vLib}><Ic n="cadenas" t={16} />Tes notes de visite</span>
                  <textarea className={s.input} rows={4} value={typeof d.visiteNote === 'string' ? d.visiteNote : ''} onChange={x => maj('visiteNote', x.target.value)}
                    placeholder="Ce qu’il a dit, ce qu’il faut retenir. Pour toi seul." />
                </div>
              </section>
              {num(d, 'prixSouhaite') ? <p className={b.vAide}>{`Noté : ${euros(num(d, 'prixSouhaite') as number)} espérés. Il apparaîtra à côté de ta fourchette, sur la fiche.`}</p> : null}
            </>
          )}

          {e.id === 'fin' && <EcranFin bien={row} d={d} maj={maj} onFin={x => { void fermer(x); }} />}
        </div>
      </div>

      <footer className={b.vPied}>
        <button type="button" className={`${s.btn} ${b.vGros}`} disabled={ecran === 0} onClick={() => aller(ecran - 1)}><Ic n="retour" t={18} />{ecran > 0 ? ECRANS[ecran - 1].court : 'Précédent'}</button>
        {ecran < ECRANS.length - 1
          ? <button type="button" className={`${s.btn} ${s.btnNavy} ${b.vGros}`} onClick={() => aller(ecran + 1)}>{`Suivant : ${ECRANS[ecran + 1].court}`}<Ic n="droite" t={18} e={2.4} /></button>
          : <button type="button" className={`${s.btn} ${s.btnOr} ${b.vGros}`} onClick={() => { void fermer(); }}><Ic n="check" t={18} e={2.4} />Terminer la visite</button>}
      </footer>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(contenu, document.body);
}
