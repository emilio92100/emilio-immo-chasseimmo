'use client';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Depliant from '@/components/shared/Depliant';
import { PastillePli } from '@/components/shared/Pli';
import { Ic } from '@/components/documents/ApercuActe';
import { supabase } from '@/lib/supabase';
import { CLES_MAIL, signatureDe } from '@/lib/mail-variables';
import {
  estPerso, lignesDossier, lireDossier, lireFichiers, lirePiecesPerso,
  type Donnees, type FichierBien, type LigneDossier, type PieceDossier,
} from '@/lib/biens-vente';
import { Anneau } from './OngletsBien';
import { jourParis } from '@/lib/mandat';
import { demanderDocuments, deposerPiece, envoyerDocuments, ouvrirPiece, retirerPiece, type DestDocuments } from './outils';
import x from './DossierBien.module.css';
import Curseur from '@/components/shared/Curseur';

/* ═══ Le dossier d'un bien, dans l'onglet Documents (V3.30, V3.31) ═════════
   Alexandre : « le dossier diagnostic et pièces, c'est sur une seule ligne,
   très moche », et « avoir un parcours intuitif où je mets les documents,
   c'est enregistré, et je peux les envoyer au client ».

   · Déposer : on glisse (ou on choisit) un ou plusieurs fichiers. Le CRM
     devine ce que c'est d'après le nom (« DPE_Iena.pdf » → le DPE) ; on
     corrige si besoin, puis « Enregistrer » : chaque fichier part dans le
     stockage privé du bien (bucket « mandats », biens-vente/<id>/), la ligne
     passe « Reçu », datée du jour. Ce qui n'est pas une ligne du dossier va
     dans « Autres documents », sous le nom qu'on lui donne.
   · Un dossier de diagnostics en UN seul fichier (V3.31) : « Dossier de
     diagnostics complet » ; on coche ce qu'il contient (DPE, amiante,
     plomb…). Le fichier n'est gardé qu'une fois (`donnees.fichiers`, sorte
     'ddt') ; chaque diagnostic couvert passe « Reçu » et pointe vers lui
     (`dossier[k].dans`). Il s'affiche en tête des diagnostics, avec ce qu'il
     couvre ; « Ce qu'il contient » se corrige à tout moment.
   · Ses propres pièces (V3.31) : « + Ajouter une pièce » dans chaque groupe,
     avec le nom qu'on veut (Kbis de la SCI, statuts, bail…) —
     `donnees.piecesPerso`. Elles se renomment et se retirent ; les autres
     documents se renomment aussi.
   · Le dossier : une ligne par pièce, rangées par groupe (V3.90 ; avant,
     une tuile par pièce). Où elle en est, et le geste qui va avec.
   · Envoyer : on coche les fichiers (ou « Envoyer des documents… »), une
     fenêtre récapitule à qui, l'objet, le message (déjà écrit, modifiable)
     et les pièces ; le mail part au nom d'Alexandre (/api/biens-vente,
     « envoyer »), et l'envoi est noté dans l'historique du bien et dans le
     Suivi du contact. */

const GROUPES: { k: LigneDossier['groupe'] | 'autres'; l: string; ic: string }[] = [
  { k: 'diag', l: 'Le logement · diagnostics', ic: 'eclair' },
  { k: 'copro', l: 'L’immeuble · copropriété', ic: 'immeuble' },
  { k: 'vendeur', l: 'Le vendeur', ic: 'personne' },
  { k: 'autres', l: 'Autres documents', ic: 'dossier' },
];
/* Des idées de pièces à ajouter, par groupe : un clic les pose. */
const IDEES: Record<LigneDossier['groupe'], string[]> = {
  diag: ['Diagnostic radon', 'Attestation de surface (loi Boutin)', 'Rapport de repérage avant travaux'],
  copro: ['Relevés de charges (4 derniers trimestres)', 'Convocation à la prochaine AG', 'État daté', 'Attestation du syndic'],
  vendeur: ['Pièces d’identité des vendeurs', 'Livret de famille, contrat de mariage ou de PACS', 'Plans du bien', 'Garanties décennales et dommages-ouvrage', 'Prêt en cours (pour la mainlevée)', 'Attestation d’entretien de la chaudière', 'Attestation d’assurance habitation', 'Contrat de gestion locative'],
};
const IDEES_SCI = ['Kbis de la SCI', 'Statuts de la SCI', 'PV d’AG de la SCI autorisant la vente'];
const VIDE: PieceDossier = { etat: '', date: '', chemin: '', nom: '' };
const AUTRE = '__autre';
const DDT = '__ddt';
const TITRE_DDT = 'Dossier de diagnostic technique';
const aujourdhui = () => jourParis();
const idNeuf = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const tailleFr = (o?: number) => (!o ? '' : o >= 1_000_000 ? `${String(Math.round(o / 100_000) / 10).replace('.', ',')} Mo` : `${Math.max(1, Math.round(o / 1000))} ko`);
const dateFr = (ymd: string) => {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};
const EXT_OK = /\.(pdf|jpe?g|png|heic|webp)$/i;
const CLE_REPLIS = 'emilio.dossier.replis';
const MAX_JOINTS = 10_000_000;
/* « DPE, amiante, plomb » : la liste courte de ce que couvre un DDT. */
const enMinuscule = (t: string) => (/^[A-Z]{2,}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));

/* Ce qu'est un fichier, d'après son nom. Rien de sûr : une proposition. */
const DEVINE: [RegExp, string][] = [
  [/\bddt\b|dossier.{0,6}diagnostic|diagnostics?\s+(techniques?|immobiliers?)|\bdiags\b|rapport.{0,6}diagnostics/, DDT],
  [/\bdpe\b|performance.{0,3}energ/, 'dpe'], [/amiante|\bdapp\b|\bdta\b/, 'amiante'], [/plomb|\bcrep\b/, 'plomb'],
  [/electri|\belec\b/, 'electricite'], [/\bgaz\b/, 'gaz'], [/termite/, 'termites'], [/\berp\b|\besris\b|etat.{0,5}risques|risques/, 'erp'],
  [/carrez|mesurage/, 'carrez'], [/assainissement|\bspanc\b/, 'assainissement'], [/merule/, 'merule'], [/bruit|aerodrome|\bpeb\b/, 'bruit'],
  [/audit/, 'audit'], [/reglement|etat.{0,4}descriptif|\bedd\b/, 'reglement'], [/\bpv\b|proces.{0,3}verbal|assemblee|\bag\b|\bago\b/, 'pvag'],
  [/fiche.{0,3}synth/, 'fiche'], [/carnet/, 'carnet'], [/pre.{0,2}etat/, 'preetat'], [/\bdtg\b|\bpppt\b|pluriannuel/, 'dtg'],
  [/titre|attestation.{0,5}propriete|acte.{0,5}(vente|achat|propriete)/, 'titre'], [/taxe|fonciere/, 'taxe'], [/facture/, 'factures'],
];
function deviner(nom: string, lignes: LigneDossier[]): string {
  const n = sansAccent(nom).replace(/[_.-]+/g, ' ');
  /* Une pièce ajoutée à la main, dont le nom est dans celui du fichier. */
  const perso = lignes.find(l => estPerso(l.k) && sansAccent(l.l).length > 3 && n.includes(sansAccent(l.l)));
  if (perso) return perso.k;
  for (const [r, k] of DEVINE) if (r.test(n)) return k === AUTRE || k === DDT || lignes.some(l => l.k === k) ? k : AUTRE;
  return AUTRE;
}
const titreDeFichier = (nom: string) => nom.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_]+/g, ' ').trim();

type ARanger = { id: string; f: File; cle: string; titre: string; contient: string[]; etat: 'attente' | 'envoi' | 'ok' | 'ko'; erreur?: string };
export type PieceEnvoi = { cle: string; titre: string; chemin: string; nom: string; taille?: number };
export type DestPropose = DestDocuments & { cle: string; role: string };
type Maj = (cle: string, v: unknown) => void;

/* Des pastilles à cocher : ce que contient un dossier de diagnostics. */
function Contenu({ lignes, on, onBasculer, desactive }: { lignes: LigneDossier[]; on: string[]; onBasculer: (k: string) => void; desactive?: boolean }) {
  return (
    <div className={x.contenu} role="group" aria-label="Ce que contient le fichier">
      {lignes.map(l => (
        <button key={l.k} type="button" className={x.puce} aria-pressed={on.includes(l.k)} disabled={desactive} onClick={() => onBasculer(l.k)}>
          <span className={x.puceCoche}><Ic n="check" t={10} e={3.4} /></span>{l.l}
        </button>
      ))}
    </div>
  );
}

/* ══ LE DOSSIER ════════════════════════════════════════════════════════════
   V3.90 (maquette validée par Alexandre) : une ligne par pièce, au lieu des
   tuiles et de leurs trois boutons Reçu / Demandé / Non concerné. Chaque
   ligne dit où en est la pièce (reçu le…, demandé il y a 16 jours, expiré)
   et propose le geste qui va avec : Voir, Relancer, Demander, Déposer, Le
   refaire ; le reste dans « ⋯ ». Les non concernés se replient en une ligne
   grise au bas de leur groupe. En tête, « Ce qu'il faut pour ce bien »,
   d'après la fiche. « Demander » ouvre la fenêtre de demande, la pièce déjà
   cochée : on en coche d'autres, un seul mail part. */

/* La validité d'un diagnostic, en mois, depuis sa date (celle de la ligne). */
const VALIDITE: Record<string, number> = { dpe: 120, electricite: 36, gaz: 36, termites: 6, erp: 6 };
/* Au bout d'une semaine sans réponse, « Relancer ». */
const RELANCE_JOURS = 7;
export type StatutPiece = 'recu' | 'expire' | 'demande' | 'relance' | 'afaire' | 'tard' | 'nc';
const plusMois = (ymd: string, n: number) => {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};
const joursDepuis = (ymd: string) => {
  const t = Date.parse(`${ymd.slice(0, 10)}T12:00:00`);
  return isNaN(t) ? null : Math.max(0, Math.round((Date.parse(`${aujourdhui()}T12:00:00`) - t) / 86400000));
};
const ilYa = (ymd: string) => {
  const j = joursDepuis(ymd);
  return j === null ? '' : j === 0 ? 'aujourd’hui' : j === 1 ? 'hier' : j < 30 ? `il y a ${j} jours` : `le ${dateFr(ymd)}`;
};
/* La fin de validité d'une pièce reçue (vide : pas de limite). */
export const finValidite = (k: string, p: PieceDossier) => (VALIDITE[k] && p.etat === 'recu' && p.date ? plusMois(p.date, VALIDITE[k]) : '');
/* Où en est une pièce. La date d'une demande : `demandeLe`, ou la date posée
   par la visite sur place (VisiteSurPlace) quand elle l'a demandée. */
export function statutPiece(k: string, p: PieceDossier | undefined, etape: string): StatutPiece {
  if (!p || !p.etat) return k === 'preetat' && etape !== 'offre' && etape !== 'compromis' ? 'tard' : 'afaire';
  if (p.etat === 'nc') return 'nc';
  if (p.etat === 'recu') { const fin = finValidite(k, p); return fin && fin < aujourdhui() ? 'expire' : 'recu'; }
  const depuis = p.relanceLe || p.demandeLe || p.date;
  const j = depuis ? joursDepuis(depuis) : null;
  return j !== null && j >= RELANCE_JOURS ? 'relance' : 'demande';
}
const IC_STATUT: Record<StatutPiece, string> = { recu: 'check', expire: 'info', demande: 'horloge', relance: 'horloge', afaire: 'plus', tard: 'pause', nc: 'oeilBarre' };

/* Le petit menu « ⋯ » d'une ligne. Défini au niveau du module (AGENTS.md §2.4). */
type ChoixLigne = { lib: string; ic: string; onClick?: () => void; fichier?: (f: File) => void; danger?: boolean };
function MenuLigne({ choix, titre }: { choix: ChoixLigne[]; titre: string }) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => { if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false); };
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', dehors);
    document.addEventListener('keydown', touche);
    return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', touche); };
  }, [ouvert]);
  if (!choix.length) return null;
  return (
    <div className={x.menuL} ref={boite}>
      <button type="button" className={x.points} aria-label={`Autres actions : ${titre}`} title="Autres actions" aria-haspopup="menu" aria-expanded={ouvert} onClick={() => setOuvert(o => !o)}>
        <Ic n="points" t={16} e={2.4} />
      </button>
      {ouvert && (
        <div className={x.menuPop} role="menu" aria-label={titre}>
          {choix.map(c => (c.fichier ? (
            <label key={c.lib} className={x.menuChoix} data-danger={c.danger ? 'oui' : undefined}>
              <Ic n={c.ic} t={15} />{c.lib}
              <input type="file" accept=".pdf,image/*" onChange={e => { const f = e.target.files?.[0]; if (f) c.fichier!(f); e.target.value = ''; setOuvert(false); }} />
            </label>
          ) : (
            <button key={c.lib} type="button" role="menuitem" className={x.menuChoix} data-danger={c.danger ? 'oui' : undefined} onClick={() => { setOuvert(false); c.onClick?.(); }}>
              <Ic n={c.ic} t={15} />{c.lib}
            </button>
          )))}
        </div>
      )}
    </div>
  );
}

/* « Ce qu'il faut pour ce bien » : d'après la fiche, ce qui est prêt pour
   mettre en vente, ce qui manque pour le compromis, et ce qui ne s'applique
   sans doute pas (une proposition : un clic la pose, le diagnostiqueur
   confirme). */
const LE_BIEN: Record<string, string> = { appartement: 'Appartement', maison: 'Maison', duplex: 'Duplex', studio: 'Studio', loft: 'Loft', terrain: 'Terrain', local: 'Local', parking: 'Parking', immeuble: 'Immeuble' };
const CLE_GUIDE = 'emilio.dossier.guide';
type Proposition = { k: string; l: string; pourquoi: string };
function propositionsNc(d: Donnees, lignes: LigneDossier[], st: (k: string) => StatutPiece): Proposition[] {
  const annee = Number(d.annee) || 0;
  const cette = Number(aujourdhui().slice(0, 4));
  const out: Proposition[] = [];
  const libre = (k: string) => lignes.some(l => l.k === k) && ['afaire', 'demande', 'relance', 'tard'].includes(st(k));
  if (annee >= 1950 && libre('plomb')) out.push({ k: 'plomb', l: 'Plomb', pourquoi: `construit en ${annee}` });
  if (annee >= 2000 && libre('amiante')) out.push({ k: 'amiante', l: 'Amiante', pourquoi: `construit en ${annee}` });
  if (annee && annee > cette - 15) {
    if (libre('electricite')) out.push({ k: 'electricite', l: 'Électricité', pourquoi: 'installation de moins de 15 ans' });
    if (libre('gaz')) out.push({ k: 'gaz', l: 'Gaz', pourquoi: 'installation de moins de 15 ans' });
  }
  return out;
}
function Guide({ d, lignes, st, onNc, onDemander }: {
  d: Donnees; lignes: LigneDossier[]; st: (k: string) => StatutPiece;
  onNc: (k: string) => void; onDemander: (ks: string[]) => void;
}) {
  const [replie, setReplie] = useState(() => { try { return localStorage.getItem(CLE_GUIDE) === 'replie'; } catch { return false; } });
  const plier = (v: boolean) => { setReplie(v); try { localStorage.setItem(CLE_GUIDE, v ? 'replie' : 'ouvert'); } catch { /* sans mémoire */ } };
  const annee = Number(d.annee) || 0;
  const quoi = `${LE_BIEN[String(d.typeBien || '')] || 'Bien'}${d.copro === 'oui' ? ' en copropriété' : ''}`;
  const fiche = [quoi, annee ? `construit en ${annee}` : '', d.chauffageEnergie === 'gaz' ? 'chauffage au gaz' : '', d.occupation === 'loue' ? 'loué' : ''].filter(Boolean).join(', ');
  const dpe = lignes.some(l => l.k === 'dpe') ? st('dpe') : 'nc';
  const manquent = lignes.filter(l => !['recu', 'nc'].includes(st(l.k)));
  const aDemander = manquent.filter(l => ['afaire', 'expire', 'tard'].includes(st(l.k))).map(l => l.k);
  const props = propositionsNc(d, lignes, st);
  const deja = lignes.filter(l => st(l.k) === 'nc');
  const court = (l: string) => l.replace(/\s*\(.*\)$/, '').replace(/ de la copropriété$/, '');
  return (
    <div className={x.guide}>
      <button type="button" className={x.guideT} aria-expanded={!replie} onClick={() => plier(!replie)}>
        <span className={x.guideIc}><Ic n="boussole" t={17} /></span>
        <span className={x.guideTx}><b>Ce qu’il faut pour ce bien</b><small>{`D’après sa fiche : ${fiche.charAt(0).toLowerCase()}${fiche.slice(1)}.`}</small></span>
        <PastillePli ouvert={!replie} />
      </button>
      <Depliant ouvert={!replie}>
        <div className={x.etapes}>
          <div className={x.et}>
            <small>Pour mettre en vente</small>
            <b>{dpe === 'recu' || dpe === 'nc' ? 'C’est bon' : dpe === 'expire' ? 'Le DPE a expiré' : 'Il manque le DPE'}</b>
            <p>{dpe === 'recu' || dpe === 'nc' ? 'Le DPE suffit pour publier l’annonce.' : 'Il le faut pour publier l’annonce : la classe énergie y figure.'}</p>
            <div className={x.chips}>
              <span className={x.chip} data-ton={dpe === 'recu' || dpe === 'nc' ? 'ok' : 'manque'}>{dpe === 'recu' && <Ic n="check" t={11} e={3} />}DPE</span>
              {(dpe === 'afaire' || dpe === 'expire') && <button type="button" className={x.lien} onClick={() => onDemander(['dpe'])}>Le demander</button>}
            </div>
          </div>
          <div className={x.et}>
            <small>Pour signer le compromis</small>
            <b>{manquent.length ? `Il en manque ${manquent.length}` : 'C’est complet'}</b>
            <p>{manquent.length ? 'Les diagnostics, les pièces de copropriété et celles du vendeur que le notaire demandera.' : 'Tout ce que le notaire demandera est dans le dossier.'}</p>
            {manquent.length > 0 && (
              <div className={x.chips}>
                {manquent.slice(0, 6).map(l => <span key={l.k} className={x.chip} data-ton={st(l.k) === 'expire' ? 'expire' : 'manque'}>{`${court(l.l)}${st(l.k) === 'expire' ? ' expiré' : ''}`}</span>)}
                {manquent.length > 6 && <span className={x.chip} data-ton="manque">{`+ ${manquent.length - 6}`}</span>}
                {aDemander.length > 0 && <button type="button" className={x.lien} onClick={() => onDemander(aDemander)}>{aDemander.length > 1 ? 'Les demander' : 'La demander'}</button>}
              </div>
            )}
          </div>
          <div className={x.et}>
            <small>Pas pour ce bien</small>
            <b>{props.length ? `${props.length} sans doute non concerné${props.length > 1 ? 's' : ''}` : deja.length ? `${deja.length} non concerné${deja.length > 1 ? 's' : ''}` : 'Rien à écarter'}</b>
            <p>{props.length ? 'Proposés d’après la fiche : un clic les écarte, le diagnostiqueur confirme.' : deja.length ? 'Écartés à la main : « ⋯ » sur la ligne pour les rétablir.' : annee ? 'D’après la fiche, tous les diagnostics peuvent s’appliquer.' : 'Renseigne l’année de construction : le CRM proposera ce qui ne s’applique pas.'}</p>
            {(props.length > 0 || deja.length > 0) && (
              <div className={x.chips}>
                {props.map(p => (
                  <button key={p.k} type="button" className={x.chip} data-ton="propose" title={`Marquer « non concerné » : ${p.pourquoi}`} onClick={() => onNc(p.k)}>
                    <Ic n="oeilBarre" t={11} e={2.4} />{`${p.l} · ${p.pourquoi}`}
                  </button>
                ))}
                {deja.map(l => <span key={l.k} className={x.chip} data-ton="nc">{court(l.l)}</span>)}
              </div>
            )}
          </div>
        </div>
      </Depliant>
    </div>
  );
}

export function DossierBien({ bienId, d, maj, destinataires, lieu, onMessage, etape = '' }: {
  bienId: string; d: Donnees; maj: Maj;
  /* L'étape du bien : le motif proposé d'une demande de documents (V3.51). */
  etape?: string;
  /* Les personnes à qui envoyer : le propriétaire, les acheteurs du bien. */
  destinataires: DestPropose[];
  /* « l'appartement du 68 avenue d'Iéna » : pour le message déjà écrit. */
  lieu: string;
  onMessage: (m: { t: string; ok: boolean }) => void;
}) {
  const lignes = lignesDossier(d);
  const doss = lireDossier(d.dossier);
  const fichiers = lireFichiers(d.fichiers);
  const ddts = fichiers.filter(f => f.sorte === 'ddt');
  const autres = fichiers.filter(f => f.sorte !== 'ddt');
  const diags = lignes.filter(l => l.groupe === 'diag');
  const [filtre, setFiltre] = useState<'tout' | 'reunir' | 'demande' | 'recu'>('tout');
  /* L'envoi : les fichiers à cocher d'office (vide : tous). */
  const [fen, setFen] = useState<string[] | null>(null);
  /* La demande : les pièces déjà cochées, relance ou non, et celles qu'on refait. */
  const [demande, setDemande] = useState<{ depart: string[]; relance: boolean; refaire: string[] } | null>(null);
  const [aRanger, setARanger] = useState<ARanger[]>([]);
  const [occupe, setOccupe] = useState('');
  const [erreur, setErreur] = useState('');
  const [survol, setSurvol] = useState(false);
  /* Un nom en cours de modification (une pièce ajoutée, un autre document). */
  const [nom, setNom] = useState<{ k: string; v: string } | null>(null);
  /* Le groupe où l'on ajoute une pièce, et son nom. */
  const [ajout, setAjout] = useState<{ g: LigneDossier['groupe']; v: string } | null>(null);
  /* Le DDT dont on corrige le contenu. */
  const [contenuDe, setContenuDe] = useState('');
  /* La ligne dont on corrige la date. */
  const [dateDe, setDateDe] = useState('');
  /* Les groupes dont on montre les non concernés. */
  const [ncVus, setNcVus] = useState<string[]>([]);
  /* Les groupes repliés (V3.31) : le choix est gardé dans ce navigateur ;
     sans choix, un groupe complet (tout reçu ou non concerné) se replie seul. */
  const [replis, setReplis] = useState<Record<string, boolean>>(() => {
    try { const v = JSON.parse(localStorage.getItem(CLE_REPLIS) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  });
  const champ = useRef<HTMLInputElement>(null);

  const poser = (k: string, patch: Partial<PieceDossier>) => maj('dossier', (avant: unknown) => {
    const o = lireDossier(avant);
    return { ...o, [k]: { ...(o[k] || VIDE), ...patch } };
  });
  const ddtDe = (k: string) => (doss[k]?.dans ? ddts.find(f => f.id === doss[k].dans) : undefined);
  const couverts = (id: string) => lignes.filter(l => doss[l.k]?.dans === id);
  const st = (k: string) => statutPiece(k, doss[k], etape);
  /* Reçu : la date du jour, sauf une pièce déjà reçue qui garde la sienne
     (une demande gardait sa date de demande comme date de réception). */
  const dateRecu = (k: string) => (doss[k]?.etat === 'recu' && doss[k]?.date ? doss[k].date : aujourdhui());

  /* Les chiffres, sur les pièces qui concernent le bien. */
  const concernes = lignes.filter(l => st(l.k) !== 'nc');
  const nb = (...s: StatutPiece[]) => concernes.filter(l => s.includes(st(l.k))).length;
  const recus = nb('recu'), demandes = nb('demande', 'relance'), aRelancer = nb('relance'), expires = nb('expire'), aFaire = nb('afaire', 'tard');
  const reunir = concernes.length - recus;

  /* Tout ce qui peut partir par mail : les lignes qui ont leur fichier, les
     dossiers de diagnostics (avec ce qu'ils couvrent), les autres documents. */
  const envoyables: PieceEnvoi[] = [
    ...ddts.map(f => {
      const c = lignes.filter(l => doss[l.k]?.dans === f.id).map(l => enMinuscule(l.l));
      return { cle: f.id, titre: `${f.titre || TITRE_DDT}${c.length ? ` (${c.join(', ')})` : ''}`, chemin: f.chemin, nom: f.nom, taille: f.taille };
    }),
    ...lignes.filter(l => doss[l.k]?.chemin).map(l => ({ cle: l.k, titre: l.l, chemin: doss[l.k].chemin, nom: doss[l.k].nom || l.l, taille: doss[l.k].taille })),
    ...autres.map(f => ({ cle: f.id, titre: f.titre || titreDeFichier(f.nom), chemin: f.chemin, nom: f.nom, taille: f.taille })),
  ];

  /* ── Déposer ── */
  /* Ce qu'un DDT couvre d'office : les diagnostics sans fichier et pas « non concerné ». */
  const contenuParDefaut = () => {
    const l = diags.filter(y => doss[y.k]?.etat !== 'nc' && !doss[y.k]?.chemin && !doss[y.k]?.dans).map(y => y.k);
    return l.length ? l : diags.filter(y => doss[y.k]?.etat !== 'nc').map(y => y.k);
  };
  function ajouter(liste: FileList | File[]) {
    setErreur('');
    const l = Array.from(liste);
    const refuses = l.filter(f => !EXT_OK.test(f.name) || f.size > 25_000_000);
    if (refuses.length) setErreur(`${refuses.map(f => f.name).join(', ')} : ${refuses.length > 1 ? 'refusés' : 'refusé'} (PDF, JPG ou PNG, 25 Mo au plus).`);
    const bons = l.filter(f => !refuses.includes(f));
    setARanger(a => [...a, ...bons.map(f => {
      const cle = deviner(f.name, lignes);
      return { id: idNeuf(), f, cle, titre: cle === AUTRE ? titreDeFichier(f.name) : cle === DDT ? TITRE_DDT : '', contient: cle === DDT ? contenuParDefaut() : [], etat: 'attente' as const };
    })]);
  }
  const majRanger = (id: string, patch: Partial<ARanger>) => setARanger(l => l.map(y => (y.id === id ? { ...y, ...patch } : y)));
  function choisirSorte(a: ARanger, v: string) {
    majRanger(a.id, {
      cle: v,
      titre: v === AUTRE ? (a.cle === DDT ? '' : a.titre) || titreDeFichier(a.f.name) : v === DDT ? TITRE_DDT : a.titre,
      contient: v === DDT ? (a.contient.length ? a.contient : contenuParDefaut()) : a.contient,
    });
  }
  function surDepot(e: DragEvent) {
    e.preventDefault(); setSurvol(false);
    if (e.dataTransfer?.files?.length) ajouter(e.dataTransfer.files);
  }
  async function enregistrer() {
    const liste = aRanger.filter(a => a.etat === 'attente' || a.etat === 'ko');
    if (!liste.length) return;
    /* Deux fichiers pour la même ligne : le second remplacerait le premier. */
    const lignesVisees = liste.filter(a => a.cle !== AUTRE && a.cle !== DDT).map(a => a.cle);
    const doublon = lignesVisees.find((k, i) => lignesVisees.indexOf(k) !== i);
    if (doublon) { setErreur(`Deux fichiers pour « ${lignes.find(l => l.k === doublon)?.l} » : le second remplacerait le premier. Range l’un des deux dans « Autre document ».`); return; }
    if (liste.some(a => a.cle === DDT && !a.contient.length)) { setErreur('Coche ce que contient le dossier de diagnostics (DPE, amiante…), ou range-le dans « Autre document ».'); return; }
    setOccupe('depot'); setErreur('');
    let n = 0;
    for (const a of liste) {
      majRanger(a.id, { etat: 'envoi', erreur: undefined });
      try {
        if (a.cle === AUTRE || a.cle === DDT) {
          const r = await deposerPiece(bienId, `${a.cle === DDT ? 'ddt' : 'autre'}${a.id}`, a.f);
          const f: FichierBien = {
            id: a.id, titre: a.titre.trim() || (a.cle === DDT ? TITRE_DDT : titreDeFichier(a.f.name)), chemin: r.chemin, nom: r.nom, taille: a.f.size, le: aujourdhui(),
            ...(a.cle === DDT ? { sorte: 'ddt' as const } : {}),
          };
          maj('fichiers', (avant: unknown) => [...lireFichiers(avant), f]);
          /* Chaque diagnostic couvert passe « Reçu » et pointe vers ce fichier. */
          if (a.cle === DDT) for (const k of a.contient) poser(k, { dans: a.id, etat: 'recu', date: dateRecu(k) });
        } else {
          const ancien = doss[a.cle]?.chemin;
          const r = await deposerPiece(bienId, a.cle, a.f);
          poser(a.cle, { chemin: r.chemin, nom: r.nom, taille: a.f.size, etat: 'recu', date: dateRecu(a.cle) });
          if (ancien) retirerPiece(ancien).catch(() => { /* l'ancien reste au stockage, sans lien */ });
        }
        n++;
        majRanger(a.id, { etat: 'ok' });
      } catch (e) {
        majRanger(a.id, { etat: 'ko', erreur: (e as Error).message });
      }
    }
    setOccupe('');
    if (n) onMessage({ t: `${n} document${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''} dans le dossier du bien.`, ok: true });
    /* Ce qui est passé quitte la liste ; ce qui a échoué y reste, avec son message. */
    setTimeout(() => setARanger(l => l.filter(y => y.etat !== 'ok')), 900);
  }

  async function retirerLigne(k: string) {
    const p = doss[k];
    if (!p?.chemin || !confirm(`Retirer le fichier « ${p.nom} » ?`)) return;
    setOccupe(k); setErreur('');
    try { await retirerPiece(p.chemin); poser(k, { chemin: '', nom: '', taille: undefined }); } catch (e) { setErreur((e as Error).message); }
    setOccupe('');
  }
  async function retirerFichier(f: FichierBien) {
    const c = f.sorte === 'ddt' ? couverts(f.id) : [];
    const suite = c.length ? `\n\nLes ${c.length} diagnostics qu’il couvre repasseront « à demander », sauf ceux qui ont leur propre fichier.` : '';
    if (!confirm(`Retirer « ${f.titre || f.nom} » du dossier ?${suite}`)) return;
    setOccupe(f.id); setErreur('');
    try {
      await retirerPiece(f.chemin);
      maj('fichiers', (avant: unknown) => lireFichiers(avant).filter(y => y.id !== f.id));
      for (const l of c) poser(l.k, doss[l.k]?.chemin ? { dans: '' } : { dans: '', etat: '' });
    } catch (e) { setErreur((e as Error).message); }
    setOccupe('');
  }
  async function deposerSur(k: string, f: File) {
    setOccupe(k); setErreur('');
    try {
      const ancien = doss[k]?.chemin;
      const r = await deposerPiece(bienId, k, f);
      poser(k, { chemin: r.chemin, nom: r.nom, taille: f.size, etat: 'recu', date: st(k) === 'expire' ? aujourdhui() : dateRecu(k) });
      if (ancien) retirerPiece(ancien).catch(() => { /* rien */ });
    } catch (e) { setErreur((e as Error).message); }
    setOccupe('');
  }
  /* Ce que couvre un DDT : un clic ajoute ou retire un diagnostic. */
  function basculerContenu(f: FichierBien, k: string) {
    const p = doss[k] || VIDE;
    if (p.dans === f.id) poser(k, p.chemin ? { dans: '' } : { dans: '', etat: p.etat === 'recu' ? '' : p.etat });
    else poser(k, { dans: f.id, etat: 'recu', date: dateRecu(k) });
  }

  /* ── Ses propres pièces, et les noms ── */
  function ajouterPiece() {
    const l = ajout?.v.trim();
    if (!ajout || !l) return;
    if (lignes.some(y => sansAccent(y.l) === sansAccent(l))) { setErreur(`« ${l} » est déjà dans le dossier.`); return; }
    const k = `perso${idNeuf().slice(1)}`;
    maj('piecesPerso', (avant: unknown) => [...lirePiecesPerso(avant), { k, l, groupe: ajout.g }]);
    setAjout(null); setErreur('');
  }
  async function retirerPerso(k: string, l: string) {
    const p = doss[k];
    if (!confirm(`Retirer « ${l} » du dossier ?${p?.chemin ? '\n\nSon fichier sera supprimé.' : ''}`)) return;
    setOccupe(k); setErreur('');
    try {
      if (p?.chemin) await retirerPiece(p.chemin);
      maj('piecesPerso', (avant: unknown) => lirePiecesPerso(avant).filter(y => y.k !== k));
      maj('dossier', (avant: unknown) => { const o = { ...lireDossier(avant) }; delete o[k]; return o; });
    } catch (e) { setErreur((e as Error).message); }
    setOccupe('');
  }
  function enregistrerNom() {
    if (!nom) return;
    const v = nom.v.trim();
    if (!v) { setNom(null); return; }
    if (estPerso(nom.k)) maj('piecesPerso', (avant: unknown) => lirePiecesPerso(avant).map(y => (y.k === nom.k ? { ...y, l: v } : y)));
    else maj('fichiers', (avant: unknown) => lireFichiers(avant).map(y => (y.id === nom.k ? { ...y, titre: v } : y)));
    setNom(null);
  }
  /* Le nom d'une pièce ajoutée ou d'un document, et son champ pour le
     changer. Une fonction appelée, pas un composant (AGENTS.md §2.4). */
  const nomDe = (k: string, l: string, sous?: ReactNode) => (nom?.k === k ? (
    <div className={x.lgNom}>
      <input className={x.nomEdit} value={nom.v} autoFocus aria-label="Nouveau nom" onChange={e => setNom({ k, v: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter') enregistrerNom(); if (e.key === 'Escape') setNom(null); }} onBlur={enregistrerNom} />
    </div>
  ) : (
    <div className={x.lgNom}><b>{l}</b>{sous && <small>{sous}</small>}</div>
  ));

  /* Demander, relancer, refaire : la fenêtre de demande, ces pièces cochées. */
  const demander = (ks: string[], relance = false) => setDemande({ depart: ks, relance, refaire: ks.filter(k => st(k) === 'expire') });
  /* Relancer : toutes les pièces demandées et pas encore reçues, cochées. */
  const relancer = (k: string) => demander([k, ...lignes.filter(l => l.k !== k && (st(l.k) === 'demande' || st(l.k) === 'relance')).map(l => l.k)], true);

  /* Replié ? Le choix d'Alexandre d'abord ; sinon, replié s'il est complet.
     Un filtre (À réunir, Demandés, Reçus) montre toujours tout. */
  const complet = (g: string) => {
    const ls = lignes.filter(l => l.groupe === g);
    return ls.length > 0 && ls.every(l => ['recu', 'nc'].includes(st(l.k)));
  };
  const replie = (g: string) => filtre === 'tout' && (g in replis ? replis[g] : g !== 'autres' && complet(g));
  const plier = (g: string, v: boolean) => setReplis(r => {
    const n = { ...r, [g]: v };
    try { localStorage.setItem(CLE_REPLIS, JSON.stringify(n)); } catch { /* sans mémoire */ }
    return n;
  });
  const toutPlier = (v: boolean) => {
    const n = Object.fromEntries(GROUPES.map(g => [g.k, v]));
    setReplis(n);
    try { localStorage.setItem(CLE_REPLIS, JSON.stringify(n)); } catch { /* sans mémoire */ }
  };
  /* L'en-tête d'un groupe : un bouton qui le plie ou le déplie, avec ses
     chiffres, et replié, ce qu'il reste à faire. */
  const teteGroupe = (g: (typeof GROUPES)[number], compte: ReactNode, resume: string, part: number | null) => {
    const r = replie(g.k);
    return (
      <button type="button" className={x.groupeT} aria-expanded={!r} onClick={() => plier(g.k, !r)} disabled={filtre !== 'tout'}>
        <span className={x.groupeIc}><Ic n={g.ic} t={15} /></span>
        <span className={x.groupeNom}>{g.l}</span>
        {compte && <i>{compte}</i>}
        {part !== null && <span className={x.groupeJauge} aria-hidden="true"><span style={{ width: `${Math.round(part * 100)}%` }} /></span>}
        {r && resume && <span className={x.groupeResume}>{resume}</span>}
        {filtre === 'tout' && <span className={x.groupePli}><PastillePli ouvert={!r} /></span>}
      </button>
    );
  };
  const resumeDe = (g: string) => {
    const ls = lignes.filter(l => l.groupe === g);
    const n = (...s: StatutPiece[]) => ls.filter(l => s.includes(st(l.k))).length;
    const r = n('recu'), dm = n('demande', 'relance'), ex = n('expire'), af = n('afaire', 'tard');
    return [r ? `${r} reçu${r > 1 ? 's' : ''}` : '', dm ? `${dm} demandé${dm > 1 ? 's' : ''}` : '', ex ? `${ex} expiré${ex > 1 ? 's' : ''}` : '', af ? `${af} à demander` : '', !dm && !ex && !af ? 'tout est réglé' : ''].filter(Boolean).join(' · ');
  };
  const visible = (k: string) => {
    const s = st(k);
    return filtre === 'tout' ? s !== 'nc' : filtre === 'reunir' ? s !== 'recu' && s !== 'nc' : filtre === 'demande' ? s === 'demande' || s === 'relance' : s === 'recu';
  };
  const idees = (g: LigneDossier['groupe']) => [...(g === 'vendeur' && d.qui === 'sci' ? IDEES_SCI : []), ...IDEES[g]]
    .filter(t => !lignes.some(y => sansAccent(y.l) === sansAccent(t))).slice(0, 8);

  /* ── Une ligne du dossier ── */
  const btnDeposer = (k: string, lib = 'Déposer') => (
    <label className={x.btnP} data-occupe={occupe === k ? 'oui' : undefined}>
      <Ic n="telecharger" t={13} e={2.2} />{occupe === k ? 'Envoi…' : lib}
      <input type="file" accept=".pdf,image/*" disabled={occupe === k} onChange={e => { const f = e.target.files?.[0]; if (f) deposerSur(k, f); e.target.value = ''; }} />
    </label>
  );
  const ligne = (l: LigneDossier) => {
    const p = doss[l.k] || VIDE;
    const s = st(l.k);
    const ddt = ddtDe(l.k);
    const chemin = p.chemin || ddt?.chemin || '';
    const perso = estPerso(l.k);
    const fin = finValidite(l.k, p);
    const sous = perso ? 'Ajoutée par toi' : s === 'tard' ? 'Au syndic, une fois l’offre acceptée' : l.aide;
    const depuisDemande = p.demandeLe || (p.etat === 'demande' ? p.date : '');
    /* Où elle en est, en deux lignes. */
    const etatTx: ReactNode = dateDe === l.k ? (
      <label className={x.dateEdit}>
        <span>{VALIDITE[l.k] ? 'Daté du' : 'Reçu le'}</span>
        <input type="date" value={p.date} autoFocus onChange={e => poser(l.k, { date: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setDateDe(''); }} />
        <button type="button" className={x.lien} onClick={() => setDateDe('')}>OK</button>
      </label>
    ) : s === 'recu' ? (
      <><b data-ton="vert">{p.date ? `Reçu le ${dateFr(p.date)}` : 'Reçu'}</b><span>{[ddt ? `dans « ${ddt.titre || TITRE_DDT} »` : p.chemin ? '' : 'sans fichier', fin ? `valable jusqu’au ${dateFr(fin)}` : ''].filter(Boolean).join(' · ')}</span></>
    ) : s === 'expire' ? (
      <><b data-ton="rouge">{`Expiré le ${dateFr(fin)}`}</b><span>{`reçu le ${dateFr(p.date)} · à refaire`}</span></>
    ) : s === 'demande' || s === 'relance' ? (
      <>
        <b data-ton="orange">{p.relanceLe ? `Relancé ${ilYa(p.relanceLe)}` : depuisDemande ? `Demandé ${ilYa(depuisDemande)}` : 'Demandé'}</b>
        <span>{[p.relanceLe && p.demandeLe ? `demandé le ${dateFr(p.demandeLe)}` : '', p.demandeA ? `à ${p.demandeA}` : '', s === 'relance' ? 'pas encore reçu' : ''].filter(Boolean).join(' · ')}</span>
      </>
    ) : s === 'tard' ? <span data-ton="gris">{'Plus tard · une fois l’offre acceptée'}</span>
      : s === 'nc' ? <span data-ton="gris">Non concerné</span>
        : <span data-ton="gris">À demander</span>;
    /* Le geste qui va avec. */
    const actions: ReactNode = s === 'nc' ? (
      <button type="button" className={x.btnP} onClick={() => poser(l.k, { etat: '' })}><Ic n="boucle" t={13} e={2.2} />Rétablir</button>
    ) : s === 'recu' ? (chemin
      ? <button type="button" className={x.btnP} onClick={() => (p.chemin ? ouvrirPiece(p.chemin, p.nom) : ddt && ouvrirPiece(ddt.chemin, ddt.nom))}><Ic n="oeil" t={13} e={2.2} />Voir</button>
      : btnDeposer(l.k)
    ) : s === 'expire' ? (
      <>
        <button type="button" className={x.btnP} data-fort="oui" onClick={() => demander([l.k])}><Ic n="boucle" t={13} e={2.2} />Le refaire</button>
        {chemin && <button type="button" className={x.btnP} onClick={() => (p.chemin ? ouvrirPiece(p.chemin, p.nom) : ddt && ouvrirPiece(ddt.chemin, ddt.nom))}><Ic n="oeil" t={13} e={2.2} />Voir</button>}
      </>
    ) : s === 'relance' ? (
      <><button type="button" className={x.btnP} data-fort="oui" onClick={() => relancer(l.k)}><Ic n="envoyer" t={13} e={2.2} />Relancer</button>{btnDeposer(l.k)}</>
    ) : s === 'demande' ? btnDeposer(l.k)
      : s === 'tard' ? <button type="button" className={x.btnP} onClick={() => demander([l.k])}><Ic n="mail" t={13} e={2.2} />Demander</button>
        : <><button type="button" className={x.btnP} data-fort="oui" onClick={() => demander([l.k])}><Ic n="mail" t={13} e={2.2} />Demander</button>{btnDeposer(l.k)}</>;
    /* Le reste, dans « ⋯ ». */
    const menu: ChoixLigne[] = s === 'nc' ? [] : [
      ...(p.chemin ? [
        { lib: 'Envoyer par mail…', ic: 'envoyer', onClick: () => setFen([p.chemin]) },
        { lib: 'Remplacer le fichier', ic: 'telecharger', fichier: (f: File) => { void deposerSur(l.k, f); } },
      ] : []),
      ...(ddt ? [
        { lib: 'Envoyer le dossier par mail…', ic: 'envoyer', onClick: () => setFen([ddt.chemin]) },
        { lib: 'Pas dans ce dossier de diagnostics', ic: 'croix', onClick: () => basculerContenu(ddt, l.k) },
      ] : []),
      ...(s === 'demande' ? [{ lib: 'Relancer maintenant', ic: 'envoyer', onClick: () => relancer(l.k) }] : []),
      ...(s === 'recu' || s === 'expire' ? [{ lib: VALIDITE[l.k] ? 'Corriger la date du diagnostic' : 'Corriger la date', ic: 'calendrier', onClick: () => setDateDe(l.k) }] : []),
      ...(s !== 'recu' && s !== 'expire' ? [{ lib: 'Marquer reçu, sans fichier', ic: 'check', onClick: () => poser(l.k, { etat: 'recu', date: aujourdhui() }) }] : []),
      ...(s === 'demande' || s === 'relance' ? [{ lib: 'Annuler la demande', ic: 'croix', onClick: () => poser(l.k, { etat: '', demandeLe: '', demandeA: '', relanceLe: '' }) }] : []),
      ...(s === 'recu' && !chemin ? [{ lib: 'Remettre « à demander »', ic: 'boucle', onClick: () => poser(l.k, { etat: '' }) }] : []),
      { lib: 'Non concerné', ic: 'oeilBarre', onClick: () => poser(l.k, { etat: 'nc' }) },
      ...(p.chemin ? [{ lib: 'Retirer le fichier', ic: 'corbeille', danger: true, onClick: () => { void retirerLigne(l.k); } }] : []),
      ...(perso && nom?.k !== l.k ? [
        { lib: 'Renommer', ic: 'crayon', onClick: () => setNom({ k: l.k, v: l.l }) },
        { lib: 'Retirer du dossier', ic: 'corbeille', danger: true, onClick: () => { void retirerPerso(l.k, l.l); } },
      ] : []),
    ];
    return (
      <div key={l.k} className={x.lg} data-st={s}>
        <span className={x.st} data-st={s} aria-hidden="true"><Ic n={IC_STATUT[s]} t={14} e={2.4} /></span>
        {perso ? nomDe(l.k, l.l, sous) : <div className={x.lgNom}><b>{l.l}</b>{sous && <small>{sous}</small>}</div>}
        <div className={x.lgEtat}>{etatTx}</div>
        <div className={x.lgAct}>{actions}<MenuLigne choix={menu} titre={l.l} /></div>
      </div>
    );
  };
  /* Un dossier de diagnostics en un seul fichier : en tête des diagnostics. */
  const ligneDdt = (f: FichierBien) => {
    const c = couverts(f.id);
    const edit = contenuDe === f.id;
    return (
      <div key={f.id} className={`${x.lg} ${x.lgDdt}`} data-st="recu">
        <span className={x.st} data-st="ddt" aria-hidden="true"><Ic n="dossier" t={14} e={2.2} /></span>
        {nomDe(f.id, f.titre || TITRE_DDT, `Un seul fichier pour ${c.length} diagnostic${c.length > 1 ? 's' : ''}${f.taille ? ` · ${tailleFr(f.taille)}` : ''}`)}
        <div className={x.lgEtat}><b data-ton="vert">{f.le ? `Déposé le ${dateFr(f.le)}` : 'Déposé'}</b></div>
        <div className={x.lgAct}>
          <button type="button" className={x.btnP} onClick={() => ouvrirPiece(f.chemin, f.nom)}><Ic n="oeil" t={13} e={2.2} />Voir</button>
          <MenuLigne titre={f.titre || TITRE_DDT} choix={[
            { lib: 'Ce qu’il contient…', ic: 'liste', onClick: () => setContenuDe(edit ? '' : f.id) },
            { lib: 'Envoyer par mail…', ic: 'envoyer', onClick: () => setFen([f.chemin]) },
            { lib: 'Renommer', ic: 'crayon', onClick: () => setNom({ k: f.id, v: f.titre || TITRE_DDT }) },
            { lib: 'Retirer ce fichier', ic: 'corbeille', danger: true, onClick: () => { void retirerFichier(f); } },
          ]} />
        </div>
        <div className={x.lgPlus}>
          {edit ? (
            <>
              <Contenu lignes={diags} on={c.map(l => l.k)} onBasculer={k => basculerContenu(f, k)} />
              <button type="button" className={`${x.btn} ${x.btnMarine}`} onClick={() => setContenuDe('')}><Ic n="check" t={14} e={2.6} />Terminé</button>
            </>
          ) : (
            <div className={x.contenu}>{c.length ? c.map(l => <span key={l.k} className={x.puceLue}><Ic n="check" t={11} e={3} />{l.l}</span>) : <span className={x.aide}>Il ne couvre encore aucun diagnostic : « ⋯ », puis « Ce qu’il contient ».</span>}</div>
          )}
        </div>
      </div>
    );
  };
  /* Un autre document (bail, plan…) : son nom, sa date, Voir. */
  const ligneAutre = (f: FichierBien) => (
    <div key={f.id} className={x.lg} data-st="recu">
      <span className={x.st} data-st="recu" aria-hidden="true"><Ic n="doc" t={14} e={2.2} /></span>
      {nomDe(f.id, f.titre || titreDeFichier(f.nom), tailleFr(f.taille))}
      <div className={x.lgEtat}><b data-ton="vert">{f.le ? `Déposé le ${dateFr(f.le)}` : 'Déposé'}</b></div>
      <div className={x.lgAct}>
        <button type="button" className={x.btnP} onClick={() => ouvrirPiece(f.chemin, f.nom)}><Ic n="oeil" t={13} e={2.2} />Voir</button>
        <MenuLigne titre={f.titre || f.nom} choix={[
          { lib: 'Envoyer par mail…', ic: 'envoyer', onClick: () => setFen([f.chemin]) },
          { lib: 'Renommer', ic: 'crayon', onClick: () => setNom({ k: f.id, v: f.titre || titreDeFichier(f.nom) }) },
          { lib: 'Retirer ce document', ic: 'corbeille', danger: true, onClick: () => { void retirerFichier(f); } },
        ]} />
      </div>
    </div>
  );
  /* « + Ajouter une pièce » au bas d'un groupe, ou son petit formulaire. */
  const ligneAjout = (g: LigneDossier['groupe']) => (filtre !== 'tout' ? null : ajout?.g === g ? (
    <div className={x.lgAjout}>
      <div className={x.lgAjoutL}>
        <input className={x.nomEdit} value={ajout.v} autoFocus placeholder="Ex. : Kbis de la SCI" aria-label="Nom de la pièce"
          onChange={e => setAjout({ g, v: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') ajouterPiece(); if (e.key === 'Escape') setAjout(null); }} />
        <button type="button" className={`${x.btn} ${x.btnMarine}`} disabled={!ajout.v.trim()} onClick={ajouterPiece}><Ic n="check" t={14} e={2.6} />Ajouter</button>
        <button type="button" className={x.lien} onClick={() => setAjout(null)}>Annuler</button>
      </div>
      {idees(g).length > 0 && <div className={x.idees}>{idees(g).map(t => <button key={t} type="button" onClick={() => setAjout({ g, v: t })}>{t}</button>)}</div>}
    </div>
  ) : (
    <button type="button" className={x.lgPlusBtn} onClick={() => { setAjout({ g, v: '' }); setErreur(''); }}>
      <Ic n="plus" t={14} e={2.4} />Ajouter une pièce, avec le nom de ton choix
    </button>
  ));

  return (
    <section className={x.dossier} onDragOver={e => { e.preventDefault(); setSurvol(true); }} onDragLeave={e => { if (e.currentTarget === e.target) setSurvol(false); }} onDrop={surDepot}>
      <div className={x.tete}>
        <Anneau part={concernes.length ? recus / concernes.length : 0} taille={64} ep={7} c="#16a34a" fond="#eef1f6" texteC="#1a2332" texte={`${recus}/${concernes.length}`} label={`${recus} pièces reçues sur ${concernes.length}`} />
        <div className={x.teteTx}>
          <h3>Diagnostics et pièces</h3>
          <div className={x.etats2}>
            <span><i style={{ background: '#16a34a' }} />{`${recus} reçu${recus > 1 ? 's' : ''}`}</span>
            {demandes > 0 && <span><i style={{ background: '#ea7a2b' }} />{`${demandes} demandé${demandes > 1 ? 's' : ''}${aRelancer ? ` · ${aRelancer} à relancer` : ''}`}</span>}
            {expires > 0 && <span><i style={{ background: '#dc2626' }} />{`${expires} expiré${expires > 1 ? 's' : ''}`}</span>}
            {aFaire > 0 && <span><i style={{ background: '#cbd5e1' }} />{`${aFaire} à demander`}</span>}
          </div>
        </div>
        <div className={x.teteBtns}>
          {/* V3.51 : demander au propriétaire ce qui manque, en quelques clics. */}
          <button type="button" className={x.btn} onClick={() => demander([])}>
            <Ic n="mail" t={15} />Demander des documents…
          </button>
          <button type="button" className={x.btn} disabled={!envoyables.length} onClick={() => setFen([])} title={envoyables.length ? undefined : 'Aucun fichier déposé pour l’instant'}>
            <Ic n="envoyer" t={15} />Envoyer des documents…
          </button>
          <button type="button" className={`${x.btn} ${x.btnOr}`} onClick={() => champ.current?.click()}><Ic n="plus" t={15} e={2.4} />Déposer des documents</button>
          <input ref={champ} type="file" multiple accept=".pdf,image/*" hidden onChange={e => { if (e.target.files?.length) ajouter(e.target.files); e.target.value = ''; }} />
        </div>
      </div>

      <Guide d={d} lignes={lignes} st={st} onNc={k => poser(k, { etat: 'nc' })} onDemander={ks => demander(ks)} />

      {/* La zone de dépôt, et ce qui attend d'être rangé. */}
      {aRanger.length === 0 ? (
        <button type="button" className={`${x.zone} ${survol ? x.zoneSurvol : ''}`} onClick={() => champ.current?.click()}>
          <span className={x.zoneIc}><Ic n="telecharger" t={18} /></span>
          <span className={x.zoneTx}>
            <b>{survol ? 'Lâche les fichiers ici' : 'Glisse tes documents ici, ou clique pour les choisir.'}</b>
            <small>Le CRM reconnaît le DPE, l’amiante, les PV d’AG… à leur nom, et les range à leur ligne. Un dossier de diagnostics en un seul fichier aussi. PDF, JPG ou PNG, 25 Mo au plus.</small>
          </span>
        </button>
      ) : (
        <div className={x.ranger}>
          <div className={x.rangerT}>
            <b>{`${aRanger.length} fichier${aRanger.length > 1 ? 's' : ''} à ranger`}</b>
            <span>Vérifie ce que c’est, puis enregistre : chacun va à sa place dans le dossier.</span>
          </div>
          {aRanger.map(a => {
            const fige = a.etat === 'envoi' || a.etat === 'ok';
            return (
              <div key={a.id} className={x.rangerL} data-etat={a.etat} data-ddt={a.cle === DDT ? 'oui' : 'non'}>
                <span className={x.rangerIc}><Ic n={a.etat === 'ok' ? 'check' : a.cle === DDT ? 'dossier' : 'doc'} t={17} e={a.etat === 'ok' ? 2.8 : 1.9} /></span>
                <div className={x.rangerNom}><b>{a.f.name}</b><small>{a.etat === 'envoi' ? 'Envoi…' : a.etat === 'ok' ? 'Enregistré' : a.erreur || tailleFr(a.f.size)}</small></div>
                <div className={x.rangerChoix}>
                  <select value={a.cle} disabled={fige} aria-label={`Ce qu’est ${a.f.name}`} onChange={e => choisirSorte(a, e.target.value)}>
                    <option value={DDT}>Dossier de diagnostics complet (plusieurs en un fichier)…</option>
                    {GROUPES.filter(g => g.k !== 'autres').map(g => {
                      const ls = lignes.filter(l => l.groupe === g.k);
                      return ls.length ? <optgroup key={g.k} label={g.l}>{ls.map(l => <option key={l.k} value={l.k}>{`${l.l}${doss[l.k]?.chemin ? ' (remplace le fichier)' : ''}`}</option>)}</optgroup> : null;
                    })}
                    <option value={AUTRE}>Autre document, avec le nom de mon choix…</option>
                  </select>
                  {(a.cle === AUTRE || a.cle === DDT) && (
                    <input value={a.titre} placeholder={a.cle === DDT ? TITRE_DDT : 'Son nom (ex. : bail, plan du garage)'} disabled={fige}
                      onChange={e => majRanger(a.id, { titre: e.target.value })} aria-label="Nom du document" />
                  )}
                </div>
                <button type="button" className={x.icBtn} aria-label={`Ne pas garder ${a.f.name}`} disabled={a.etat === 'envoi'} onClick={() => setARanger(l => l.filter(y => y.id !== a.id))}><Ic n="croix" t={14} e={2.2} /></button>
                {a.cle === DDT && (
                  <div className={x.rangerDdt}>
                    <div className={x.rangerDdtT}>
                      <b>{`Il contient · ${a.contient.length}`}</b>
                      <button type="button" className={x.lien} disabled={fige} onClick={() => majRanger(a.id, { contient: diags.map(l => l.k) })}>Tout</button>
                      <button type="button" className={x.lien} disabled={fige} onClick={() => majRanger(a.id, { contient: [] })}>Aucun</button>
                    </div>
                    <Contenu lignes={diags} on={a.contient} desactive={fige}
                      onBasculer={k => majRanger(a.id, { contient: a.contient.includes(k) ? a.contient.filter(y => y !== k) : [...a.contient, k] })} />
                    <small>Le fichier n’est gardé qu’une fois ; chaque diagnostic coché passe « Reçu » et renvoie vers lui.</small>
                  </div>
                )}
              </div>
            );
          })}
          <div className={x.rangerPied}>
            <button type="button" className={x.lien} disabled={!!occupe} onClick={() => champ.current?.click()}><Ic n="plus" t={13} e={2.4} />Ajouter d’autres fichiers</button>
            <span style={{ flex: 1 }} />
            <button type="button" className={x.btn} disabled={!!occupe} onClick={() => { setARanger([]); setErreur(''); }}>Annuler</button>
            <button type="button" className={`${x.btn} ${x.btnMarine}`} disabled={!!occupe || !aRanger.some(a => a.etat === 'attente' || a.etat === 'ko')} onClick={enregistrer}>
              <Ic n="check" t={15} e={2.6} />{occupe === 'depot' ? 'Enregistrement…' : `Enregistrer ${aRanger.filter(a => a.etat !== 'ok').length > 1 ? `les ${aRanger.filter(a => a.etat !== 'ok').length} documents` : 'le document'}`}
            </button>
          </div>
        </div>
      )}
      {erreur && <div className={x.erreur}>{erreur}</div>}

      <div className={x.outils}>
        <div className={x.filtres} role="group" aria-label="Filtrer le dossier">
          <Curseur cle={filtre} />
          {([['tout', 'Tout', concernes.length], ['reunir', 'À réunir', reunir], ['demande', 'Demandés', demandes], ['recu', 'Reçus', recus]] as const).map(([k, l, n]) => (
            <button key={k} type="button" aria-pressed={filtre === k} onClick={() => setFiltre(k)}>{l}<i>{n}</i></button>
          ))}
        </div>
        {filtre === 'tout' && (
          <span className={x.plis}>
            <button type="button" className={x.lien} onClick={() => toutPlier(true)}><Ic n="haut" t={13} e={2.4} />Tout replier</button>
            <button type="button" className={x.lien} onClick={() => toutPlier(false)}><Ic n="bas" t={13} e={2.4} />Tout déplier</button>
          </span>
        )}
      </div>

      {GROUPES.map(g => {
        if (g.k === 'autres') {
          if (filtre !== 'tout' && (filtre !== 'recu' || !autres.length)) return null;
          return (
            <div key={g.k} className={x.groupe}>
              {teteGroupe(g, autres.length ? autres.length : null, autres.length ? `${autres.length} document${autres.length > 1 ? 's' : ''}` : 'aucun', null)}
              <Depliant ouvert={!replie(g.k)}><div className={x.lignes}>
                {autres.map(ligneAutre)}
                {filtre === 'tout' && (
                  <button type="button" className={x.lgPlusBtn} onClick={() => champ.current?.click()}>
                    <Ic n="plus" t={14} e={2.4} />Ajouter un document : un bail, un plan… tu choisis son nom
                  </button>
                )}
              </div></Depliant>
            </div>
          );
        }
        const ls = lignes.filter(l => l.groupe === g.k);
        const vus = ls.filter(l => visible(l.k));
        const lesNc = ls.filter(l => st(l.k) === 'nc');
        const lesDdt = g.k === 'diag' && (filtre === 'tout' || filtre === 'recu') ? ddts : [];
        if (!ls.length) return null;
        if (!vus.length && !lesDdt.length && filtre !== 'tout') return null;
        const cons = ls.length - lesNc.length;
        const ok = ls.filter(l => st(l.k) === 'recu').length;
        const ncOuvert = ncVus.includes(g.k);
        return (
          <div key={g.k} className={x.groupe}>
            {teteGroupe(g, `${ok} sur ${cons}`, resumeDe(g.k), cons ? ok / cons : 1)}
            <Depliant ouvert={!replie(g.k)}><div className={x.lignes}>
              {lesDdt.map(ligneDdt)}
              {vus.map(ligne)}
              {filtre === 'tout' && lesNc.length > 0 && (
                <>
                  <div className={x.ncPli}>
                    <Ic n="oeilBarre" t={15} />
                    <span>{`${lesNc.length} non concerné${lesNc.length > 1 ? 's' : ''} :`}</span>
                    <span className={x.ncNoms}>{lesNc.map(l => <span key={l.k}>{l.l}</span>)}</span>
                    <button type="button" className={x.lien} onClick={() => setNcVus(v => (ncOuvert ? v.filter(y => y !== g.k) : [...v, g.k]))}>{ncOuvert ? 'Masquer' : 'Afficher'}</button>
                  </div>
                  {ncOuvert && lesNc.map(ligne)}
                </>
              )}
              {ligneAjout(g.k)}
            </div></Depliant>
          </div>
        );
      })}
      <div className={x.pied}>Les fichiers sont privés : visibles par toi seul, jamais dans un espace client. Ils ne partent que si tu les envoies.</div>

      {demande && (
        <FenDemandeDocuments bienId={bienId} d={d} doss={doss} lignes={lignes} destinataires={destinataires} lieu={lieu} etape={etape}
          depart={demande.depart} relance={demande.relance} refaire={demande.refaire}
          onFermer={() => setDemande(null)}
          onFait={(r, m) => {
            const refaire = demande.refaire;
            const relance = demande.relance;
            setDemande(null);
            /* Les pièces ajoutées pour l'occasion entrent dans le dossier, et
               tout ce qui a été demandé passe « Demandé », daté, avec à qui
               (V3.90). Une relance garde la date de la demande. */
            if (r.nouvelles.length) maj('piecesPerso', (avant: unknown) => [...lirePiecesPerso(avant), ...r.nouvelles]);
            const ks = [...r.cles, ...r.nouvelles.map(n => n.k)];
            const jour = aujourdhui();
            if (ks.length) maj('dossier', (avant: unknown) => {
              const o = lireDossier(avant);
              for (const k of ks) {
                if (o[k]?.etat === 'recu' && !refaire.includes(k)) continue;
                const avantK = o[k] || VIDE;
                const dejaDemande = avantK.etat === 'demande';
                o[k] = {
                  ...avantK, etat: 'demande', demandeA: r.a || avantK.demandeA,
                  ...(relance && dejaDemande ? { relanceLe: jour, demandeLe: avantK.demandeLe || avantK.date || jour } : { demandeLe: jour, relanceLe: undefined }),
                };
              }
              return { ...o };
            });
            onMessage(m);
          }} />
      )}

      {fen && (
        <FenEnvoiDocuments bienId={bienId} pieces={envoyables} depart={fen} destinataires={destinataires} lieu={lieu}
          onFermer={() => setFen(null)}
          onFait={m => { setFen(null); onMessage(m); }} />
      )}
    </section>
  );
}
/* ══ LA FENÊTRE D'ENVOI ════════════════════════════════════════════════════ */
function messageType(prenom: string, lieu: string, titres: string[], signature: string) {
  const liste = titres.map(t => `– ${t}`).join('\n');
  const un = titres.length === 1;
  return `Bonjour${prenom ? ` ${prenom}` : ''},\n\n${un ? 'Voici le document' : 'Voici les documents'} concernant ${lieu || 'le bien'} :\n${liste}\n\nN’hésitez pas à revenir vers moi si vous avez la moindre question.\n\n${signature}`;
}

export function FenEnvoiDocuments({ bienId, pieces, depart, destinataires, lieu, onFermer, onFait }: {
  bienId: string; pieces: PieceEnvoi[]; depart: string[]; destinataires: DestPropose[]; lieu: string;
  onFermer: () => void; onFait: (m: { t: string; ok: boolean }) => void;
}) {
  const [choix, setChoix] = useState<string[]>(() => (depart.length ? depart : pieces.map(p => p.chemin)));
  const [dests, setDests] = useState<string[]>(() => (destinataires[0] ? [destinataires[0].cle] : []));
  const [autre, setAutre] = useState('');
  const [objet, setObjet] = useState(() => `Documents · ${lieu ? lieu.charAt(0).toUpperCase() + lieu.slice(1) : 'votre bien'}`);
  const [signature, setSignature] = useState(() => signatureDe({}));
  const [texte, setTexte] = useState<string | null>(null);
  const [en, setEn] = useState(false);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let vivant = true;
    supabase.from('parametres').select('cle, valeur').in('cle', CLES_MAIL).then(({ data }) => {
      if (vivant && data) setSignature(signatureDe(Object.fromEntries(data.map((r: { cle: string; valeur: string | null }) => [r.cle, r.valeur || '']))));
    });
    return () => { vivant = false; };
  }, []);

  const choisies = pieces.filter(p => choix.includes(p.chemin));
  const lesDests = destinataires.filter(d => dests.includes(d.cle));
  const autreOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(autre.trim());
  const tous: DestDocuments[] = [...lesDests.map(d => ({ email: d.email, nom: d.nom, clientId: d.clientId, rechercheId: d.rechercheId })), ...(autreOk ? [{ email: autre.trim().toLowerCase(), nom: '' }] : [])];
  /* Le prénom de l'accueil : celui du destinataire s'il n'y en a qu'un. */
  const prenom = tous.length === 1 && lesDests.length === 1 ? (lesDests[0].nom.split(' ')[0] || '') : '';
  /* Le message se réécrit tant qu'on n'y a pas touché. */
  const message = texte ?? messageType(prenom, lieu, choisies.map(p => p.titre), signature);
  const connu = choisies.every(p => p.taille);
  const poids = choisies.reduce((t, p) => t + (p.taille || 0), 0);
  const liens = connu && poids > MAX_JOINTS;

  async function envoyer() {
    if (!choisies.length) { setErreur('Choisis au moins un document.'); return; }
    if (!tous.length) { setErreur(autre.trim() ? 'Cette adresse e-mail ne semble pas complète.' : 'Choisis à qui l’envoyer.'); return; }
    setEn(true); setErreur('');
    try {
      const r = await envoyerDocuments({ bienId, destinataires: tous, sujet: objet.trim(), message: message.trim(), pieces: choisies.map(p => ({ chemin: p.chemin, nom: p.nom })) });
      const a = r.envoyes.length > 1 ? `${r.envoyes.length} destinataires` : r.envoyes[0];
      onFait({ t: `${choisies.length > 1 ? `${choisies.length} documents envoyés` : 'Document envoyé'} à ${a}${r.mode === 'liens' ? ', en liens de téléchargement (trop lourds pour des pièces jointes)' : ''}.${r.avertissements.length ? ` ${r.avertissements.join(' · ')}` : ''}`, ok: true });
    } catch (e) {
      setErreur((e as Error).message);
      setEn(false);
    }
  }

  const fen = (
    <div className={x.voile} onMouseDown={e => { if (e.target === e.currentTarget && !en) onFermer(); }}>
      <div className={x.fen} role="dialog" aria-modal="true" aria-label="Envoyer des documents">
        <div className={x.fenTete}>
          <span className={x.fenIc}><Ic n="envoyer" t={20} /></span>
          <div className={x.fenTx}>
            <h2>Envoyer des documents</h2>
            <p>Relis avant d’envoyer : le mail part à ton nom, avec les documents choisis.</p>
          </div>
          <button type="button" className={x.fermer} aria-label="Fermer" disabled={en} onClick={onFermer}><Ic n="croix" t={16} e={2.2} /></button>
        </div>
        <div className={x.fenCorps}>
          <div className={x.bloc}>
            <div className={x.blocT}>À qui</div>
            {destinataires.length > 0 && (
              <div className={x.dests}>
                {destinataires.map(d => {
                  const on = dests.includes(d.cle);
                  return (
                    <button key={d.cle} type="button" className={x.dest} aria-pressed={on} onClick={() => { setDests(l => (on ? l.filter(y => y !== d.cle) : [...l, d.cle])); }}>
                      <span className={x.destCoche}><Ic n="check" t={11} e={3.2} /></span>
                      <span className={x.destTx}><b>{d.nom || d.email}</b><small>{`${d.role} · ${d.email}`}</small></span>
                    </button>
                  );
                })}
              </div>
            )}
            <label className={x.champ}>
              <span>{destinataires.length ? 'Ou une autre adresse' : 'Adresse e-mail'}</span>
              <input type="email" value={autre} placeholder="notaire@etude.fr" onChange={e => setAutre(e.target.value)} />
            </label>
            {!destinataires.length && <small className={x.aide}>Aucune adresse sur la fiche du propriétaire ni des acheteurs du bien : tape-la ici.</small>}
          </div>

          <div className={x.bloc}>
            <div className={x.blocT}>{`Les documents · ${choisies.length} sur ${pieces.length}`}</div>
            <div className={x.pieces}>
              {pieces.map(p => {
                const on = choix.includes(p.chemin);
                return (
                  <button key={p.chemin} type="button" className={x.piece} aria-pressed={on} onClick={() => setChoix(l => (on ? l.filter(y => y !== p.chemin) : [...l, p.chemin]))}>
                    <span className={x.destCoche}><Ic n="check" t={11} e={3.2} /></span>
                    <span className={x.pieceTx}><b>{p.titre}</b><small>{[p.nom !== p.titre ? p.nom : '', tailleFr(p.taille)].filter(Boolean).join(' · ')}</small></span>
                  </button>
                );
              })}
            </div>
            <div className={x.poids} data-liens={liens ? 'oui' : 'non'}>
              <Ic n={liens ? 'info' : 'trombone'} t={14} />
              <span>{!choisies.length ? 'Aucun document choisi.'
                : liens ? `${tailleFr(poids)} : trop lourd pour des pièces jointes. Le mail contiendra des liens de téléchargement, valables 7 jours.`
                  : connu ? `En pièces jointes · ${tailleFr(poids)} en tout.`
                    : 'En pièces jointes (au-delà de 10 Mo, ils partiraient en liens de téléchargement, valables 7 jours).'}</span>
            </div>
          </div>

          <div className={x.bloc}>
            <label className={x.champ}><span>Objet</span><input value={objet} onChange={e => setObjet(e.target.value)} /></label>
            <label className={x.champ}>
              <span>Message{texte !== null && <button type="button" className={x.lien} onClick={() => setTexte(null)}>Revenir au message proposé</button>}</span>
              <textarea rows={11} value={message} onChange={e => setTexte(e.target.value)} />
            </label>
          </div>
          {erreur && <div className={x.erreur}>{erreur}</div>}
        </div>
        <div className={x.fenPied}>
          <button type="button" className={x.btn} disabled={en} onClick={onFermer}>Annuler</button>
          <button type="button" className={`${x.btn} ${x.btnOr}`} disabled={en || !choisies.length || !tous.length} onClick={envoyer}>
            <Ic n="envoyer" t={15} />{en ? 'Envoi…' : tous.length === 1 ? `Envoyer à ${lesDests[0]?.nom.split(' ')[0] || tous[0].email}` : tous.length > 1 ? `Envoyer à ${tous.length} personnes` : 'Envoyer'}
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(fen, document.body);
}

/* ══ DEMANDER DES DOCUMENTS (V3.51) ═══════════════════════════════════════
   Alexandre : « dans l'onglet Documents d'un bien, envoyer une demande de
   documents au client : je sélectionne ce que je souhaite, et il y a un texte
   préfait — suite à nos échanges, voici les documents pour l'estimation ou
   pour la vente ». On coche dans ce qui manque au dossier (ou on ajoute une
   pièce), le motif choisit la phrase, le message se réécrit tant qu'on n'y a
   pas touché. Après l'envoi : les pièces passent « Demandé », la demande est
   notée dans l'historique du bien et le Suivi du propriétaire. */
type Motif = 'estimation' | 'vente' | 'compromis';
const MOTIFS: Record<Motif, { l: string; pour: string; objet: string }> = {
  estimation: { l: 'L’estimation', pour: 'l’estimation', objet: 'Les documents pour l’estimation de votre bien' },
  vente: { l: 'La mise en vente', pour: 'la mise en vente', objet: 'Les documents pour la mise en vente de votre bien' },
  compromis: { l: 'Le compromis', pour: 'la préparation du compromis', objet: 'Les documents pour le compromis' },
};
const motifDe = (etape: string): Motif => (etape === 'a_suivre' || etape === 'estimation' ? 'estimation' : etape === 'compromis' || etape === 'offre' ? 'compromis' : 'vente');
function messageDemande(prenom: string, motif: Motif, lieu: string, titres: string[], signature: string) {
  const un = titres.length === 1;
  return `Bonjour${prenom ? ` ${prenom}` : ''},\n\nSuite à nos échanges, voici ${un ? 'le document dont j’aurais besoin' : 'les documents dont j’aurais besoin'} pour ${MOTIFS[motif].pour} de ${lieu || 'votre bien'} :\n${titres.map(t => `– ${t}`).join('\n')}\n\nVous pouvez ${un ? 'me l’envoyer' : 'me les envoyer'} en réponse à ce mail : un scan ou une photo bien lisible suffit.\n\nJe reste à votre disposition si vous avez la moindre question.\n\n${signature}`;
}
/* V3.90 : relancer une demande restée sans réponse. */
function messageRelance(prenom: string, lieu: string, titres: string[], signature: string) {
  const un = titres.length === 1;
  return `Bonjour${prenom ? ` ${prenom}` : ''},\n\nJe reviens vers vous au sujet ${un ? 'du document' : 'des documents'} pour ${lieu || 'votre bien'} : je n’ai pas encore reçu ${un ? 'celui-ci' : 'ceux-ci'} :\n${titres.map(t => `– ${t}`).join('\n')}\n\nVous pouvez ${un ? 'me l’envoyer' : 'me les envoyer'} en réponse à ce mail : un scan ou une photo bien lisible suffit.\n\nMerci d’avance, et je reste à votre disposition si besoin.\n\n${signature}`;
}
type Extra = { l: string; g: LigneDossier['groupe'] };
/* `a` (V3.90) : à qui la demande est partie, pour la ligne « Demandé … à Paul ». */
export type DemandeFaite = { cles: string[]; nouvelles: { k: string; l: string; groupe: LigneDossier['groupe'] }[]; a: string };

export function FenDemandeDocuments({ bienId, d, doss, lignes, destinataires, lieu, etape, onFermer, onFait, depart = [], relance = false, refaire = [] }: {
  bienId: string; d: Donnees; doss: Record<string, PieceDossier>; lignes: LigneDossier[]; destinataires: DestPropose[]; lieu: string; etape: string;
  onFermer: () => void; onFait: (r: DemandeFaite, m: { t: string; ok: boolean }) => void;
  /* V3.90 : les pièces déjà cochées (le « Demander » d'une ligne), une
     relance (son texte à elle), et les pièces reçues mais expirées à refaire. */
  depart?: string[]; relance?: boolean; refaire?: string[];
}) {
  /* Ce qui manque : ni reçu, ni non concerné, ni couvert par un dossier de
     diagnostics ; plus ce qui est à refaire (expiré). */
  const manquent = lignes.filter(l => refaire.includes(l.k) || (doss[l.k]?.etat !== 'recu' && doss[l.k]?.etat !== 'nc' && !doss[l.k]?.chemin && !doss[l.k]?.dans));
  const proprios = destinataires.filter(y => !y.role.startsWith('Acheteur'));
  const [motif, setMotif] = useState<Motif>(() => motifDe(etape));
  const [choix, setChoix] = useState<string[]>(() => depart.filter(k => manquent.some(l => l.k === k)));
  const [extras, setExtras] = useState<Extra[]>([]);
  const [saisie, setSaisie] = useState('');
  const [dests, setDests] = useState<string[]>(() => (proprios[0] ? [proprios[0].cle] : destinataires[0] ? [destinataires[0].cle] : []));
  const [autre, setAutre] = useState('');
  const [objet, setObjet] = useState<string | null>(null);
  const [signature, setSignature] = useState(() => signatureDe({}));
  const [texte, setTexte] = useState<string | null>(null);
  const [en, setEn] = useState(false);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let vivant = true;
    supabase.from('parametres').select('cle, valeur').in('cle', CLES_MAIL).then(({ data }) => {
      if (vivant && data) setSignature(signatureDe(Object.fromEntries(data.map((r: { cle: string; valeur: string | null }) => [r.cle, r.valeur || '']))));
    });
    return () => { vivant = false; };
  }, []);

  const dejaLa = (t: string) => [...lignes.map(l => l.l), ...extras.map(e => e.l)].some(y => sansAccent(y) === sansAccent(t));
  /* Des idées, comme dans le dossier : ce que le notaire demandera souvent. */
  const idees = [...(d.qui === 'sci' ? IDEES_SCI.map(l => ({ l, g: 'vendeur' as const })) : []),
    ...IDEES.vendeur.map(l => ({ l, g: 'vendeur' as const })), ...(d.copro === 'oui' ? IDEES.copro.map(l => ({ l, g: 'copro' as const })) : [])]
    .filter(i => !dejaLa(i.l)).slice(0, 8);
  function ajouterExtra(l: string, g: LigneDossier['groupe'] = 'vendeur') {
    const t = l.trim();
    if (!t) return;
    if (dejaLa(t)) {
      const ligne = manquent.find(y => sansAccent(y.l) === sansAccent(t));
      if (ligne && !choix.includes(ligne.k)) setChoix(c => [...c, ligne.k]);
      else setErreur(`« ${t} » est déjà dans la liste.`);
      setSaisie('');
      return;
    }
    setExtras(e => [...e, { l: t, g }]); setSaisie(''); setErreur('');
  }
  const basculer = (k: string) => setChoix(c => (c.includes(k) ? c.filter(y => y !== k) : [...c, k]));

  const titres = [...manquent.filter(l => choix.includes(l.k)).map(l => l.l), ...extras.map(e => e.l)];
  const lesDests = destinataires.filter(y => dests.includes(y.cle));
  const autreOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(autre.trim());
  const tous: DestDocuments[] = [...lesDests.map(y => ({ email: y.email, nom: y.nom, clientId: y.clientId, rechercheId: y.rechercheId })), ...(autreOk ? [{ email: autre.trim().toLowerCase(), nom: '' }] : [])];
  const prenom = tous.length === 1 && lesDests.length === 1 ? (lesDests[0].nom.split(' ')[0] || '') : '';
  const message = texte ?? (relance ? messageRelance(prenom, lieu, titres, signature) : messageDemande(prenom, motif, lieu, titres, signature));
  const leObjet = objet ?? (relance ? `Petit rappel · ${MOTIFS[motif].objet.charAt(0).toLowerCase()}${MOTIFS[motif].objet.slice(1)}` : MOTIFS[motif].objet);

  async function envoyer() {
    if (!titres.length) { setErreur('Choisis au moins un document à demander.'); return; }
    if (!tous.length) { setErreur(autre.trim() ? 'Cette adresse e-mail ne semble pas complète.' : 'Choisis à qui l’envoyer.'); return; }
    setEn(true); setErreur('');
    try {
      const r = await demanderDocuments({ bienId, destinataires: tous, sujet: leObjet.trim(), message: message.trim(), demandes: titres });
      const a = r.envoyes.length > 1 ? `${r.envoyes.length} destinataires` : lesDests[0]?.nom || r.envoyes[0];
      const nouvelles = extras.map((e, i) => ({ k: `perso${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 5)}`, l: e.l, groupe: e.g }));
      onFait({ cles: manquent.filter(l => choix.includes(l.k)).map(l => l.k), nouvelles, a: tous.length > 1 ? `${tous.length} personnes` : lesDests[0]?.nom || tous[0]?.email || '' },
        { t: `${relance ? 'Relance envoyée' : titres.length > 1 ? `${titres.length} documents demandés` : 'Document demandé'} à ${a} : ${titres.length > 1 ? 'ils sont' : 'il est'} « Demandé » dans le dossier, avec la date.${r.avertissements.length ? ` ${r.avertissements.join(' · ')}` : ''}`, ok: true });
    } catch (e) {
      setErreur((e as Error).message);
      setEn(false);
    }
  }

  const fen = (
    <div className={x.voile} onMouseDown={e => { if (e.target === e.currentTarget && !en && !titres.length) onFermer(); }}>
      <div className={x.fen} role="dialog" aria-modal="true" aria-label={relance ? 'Relancer une demande' : 'Demander des documents'}>
        <div className={x.fenTete}>
          <span className={x.fenIc}><Ic n={relance ? 'envoyer' : 'mail'} t={20} /></span>
          <div className={x.fenTx}>
            <h2>{relance ? 'Relancer une demande' : 'Demander des documents'}</h2>
            <p>{relance ? 'Les documents demandés et pas encore reçus sont cochés : un seul mail, que tu relis avant qu’il parte.' : 'Coche ce qu’il te faut, autant que tu veux : un seul mail, rédigé tout seul. Tu le relis, puis il part à ton nom.'}</p>
          </div>
          <button type="button" className={x.fermer} aria-label="Fermer" disabled={en} onClick={onFermer}><Ic n="croix" t={16} e={2.2} /></button>
        </div>
        <div className={x.fenCorps}>
          <div className={x.bloc}>
            <div className={x.blocT}>Pour</div>
            <div className={x.filtres} role="group" aria-label="Pour quoi">
              {(Object.keys(MOTIFS) as Motif[]).map(k => (
                <button key={k} type="button" aria-pressed={motif === k} onClick={() => setMotif(k)}>{MOTIFS[k].l}</button>
              ))}
            </div>
          </div>

          <div className={x.bloc}>
            <div className={x.blocT}>{`Les documents à demander · ${titres.length}`}</div>
            {!manquent.length && !extras.length && <small className={x.aide}>Le dossier est complet : ajoute ci-dessous ce que tu veux demander en plus.</small>}
            {GROUPES.filter(g => g.k !== 'autres').map(g => {
              const ls = manquent.filter(l => l.groupe === g.k);
              if (!ls.length) return null;
              const tousOn = ls.every(l => choix.includes(l.k));
              return (
                <div key={g.k} className={x.demGroupe}>
                  <div className={x.demGroupeT}>
                    <span><Ic n={g.ic} t={13} />{g.l}</span>
                    <button type="button" className={x.lien} onClick={() => setChoix(c => (tousOn ? c.filter(k => !ls.some(l => l.k === k)) : Array.from(new Set([...c, ...ls.map(l => l.k)]))))}>{tousOn ? 'Tout décocher' : 'Tout cocher'}</button>
                  </div>
                  <div className={x.demGrille}>
                    {ls.map(l => {
                      const on = choix.includes(l.k);
                      return (
                        <button key={l.k} type="button" className={x.piece} aria-pressed={on} onClick={() => basculer(l.k)}>
                          <span className={x.destCoche}><Ic n="check" t={11} e={3.2} /></span>
                          <span className={x.pieceTx}><b>{l.l}</b>{(doss[l.k]?.etat === 'demande' || l.aide) && <small>{doss[l.k]?.etat === 'demande' ? 'Déjà demandé : à relancer' : l.aide}</small>}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {extras.length > 0 && (
              <div className={x.demGroupe}>
                <div className={x.demGroupeT}><span><Ic n="plus" t={13} />Ajoutés pour cette demande</span></div>
                <div className={x.demGrille}>
                  {extras.map(e => (
                    <button key={e.l} type="button" className={x.piece} aria-pressed onClick={() => setExtras(l => l.filter(y => y.l !== e.l))} title="Retirer de la demande">
                      <span className={x.destCoche}><Ic n="check" t={11} e={3.2} /></span>
                      <span className={x.pieceTx}><b>{e.l}</b><small>Il entrera dans le dossier, « Demandé »</small></span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={x.demAjout}>
              <input value={saisie} placeholder="Un autre document (ex. : plan du garage)" aria-label="Ajouter un document à demander"
                onChange={e => setSaisie(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterExtra(saisie); } }} />
              <button type="button" className={x.btn} disabled={!saisie.trim()} onClick={() => ajouterExtra(saisie)}><Ic n="plus" t={14} e={2.4} />Ajouter</button>
            </div>
            {idees.length > 0 && <div className={x.idees}>{idees.map(i => <button key={i.l} type="button" onClick={() => ajouterExtra(i.l, i.g)}>{i.l}</button>)}</div>}
          </div>

          <div className={x.bloc}>
            <div className={x.blocT}>À qui</div>
            {destinataires.length > 0 && (
              <div className={x.dests}>
                {destinataires.map(y => {
                  const on = dests.includes(y.cle);
                  return (
                    <button key={y.cle} type="button" className={x.dest} aria-pressed={on} onClick={() => { setDests(l => (on ? l.filter(z => z !== y.cle) : [...l, y.cle])); }}>
                      <span className={x.destCoche}><Ic n="check" t={11} e={3.2} /></span>
                      <span className={x.destTx}><b>{y.nom || y.email}</b><small>{`${y.role} · ${y.email}`}</small></span>
                    </button>
                  );
                })}
              </div>
            )}
            <label className={x.champ}>
              <span>{destinataires.length ? 'Ou une autre adresse' : 'Adresse e-mail'}</span>
              <input type="email" value={autre} placeholder="proprietaire@exemple.fr" onChange={e => setAutre(e.target.value)} />
            </label>
            {!destinataires.length && <small className={x.aide}>Pas d’adresse sur la fiche du propriétaire : tape-la ici, ou ajoute-la sur sa fiche.</small>}
          </div>

          <div className={x.bloc}>
            <label className={x.champ}>
              <span>Objet{objet !== null && <button type="button" className={x.lien} onClick={() => setObjet(null)}>Revenir à l’objet proposé</button>}</span>
              <input value={leObjet} onChange={e => setObjet(e.target.value)} />
            </label>
            <label className={x.champ}>
              <span>Message{texte !== null && <button type="button" className={x.lien} onClick={() => setTexte(null)}>Revenir au message proposé</button>}</span>
              <textarea rows={12} value={message} onChange={e => setTexte(e.target.value)} />
            </label>
          </div>
          {erreur && <div className={x.erreur}>{erreur}</div>}
        </div>
        <div className={x.fenPied}>
          <button type="button" className={x.btn} disabled={en} onClick={onFermer}>Annuler</button>
          <button type="button" className={`${x.btn} ${x.btnOr}`} disabled={en || !titres.length || !tous.length} onClick={envoyer}>
            <Ic n="envoyer" t={15} />{en ? 'Envoi…' : tous.length === 1 ? `${relance ? 'Relancer' : 'Envoyer la demande à'} ${lesDests[0]?.nom.split(' ')[0] || tous[0].email}` : tous.length > 1 ? `Envoyer à ${tous.length} personnes` : relance ? 'Relancer' : 'Envoyer la demande'}
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(fen, document.body);
}
