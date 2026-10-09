'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { euros, jourParis } from '@/lib/mandat';
import { lienBienPublic } from '@/lib/jeton';
import { num, txt, liste, modele, modeSignature, lirePersonnes } from '@/lib/actes';
import { ISSUES, issueDe, visitePasseeParis, type Issue } from '@/lib/visites';
import CompteRenduVisite, { enregistrerCompteRendu } from '@/components/shared/CompteRenduVisite';
import {
  ETAPES_BIEN, PARCOURS, permisBien, apresReponse, argentBien, montantActuel, avantMandat, controleAnnonce, mentionsAnnonce, villeAffichee, dateCourte, dateLongue, etapeDe, etageTexte, joursAvant,
  lireDossier, lireObservations, lirePhotos, lirePieces, m2, nomExpo, nomProprio, passoire, pourcent, titreBien,
  type BienVente, type Donnees, type EtapeVente, type Observation, type Reponse, type SuiviVente,
} from '@/lib/biens-vente';
import { Ic } from '@/components/documents/ApercuActe';
import { NOM_MANDAT, prixCarte } from './CarteBien';
import { COULEURS, ChampPhotos } from './ChampsBien';
import VisiteSurPlace from './VisiteSurPlace';
import { reformulerAnnonce } from './annonce-ia';
import { BarreOnglets, CorpsOnglet } from '@/components/shared/OngletsGlissants';
import {
  FenAnnulerMandat, FenCompromis, FenCompromisTombe, FenDefinirEstimation, FenDeplacerVisite, FenGuide, FenNouvelleVente, FenEstimation, FenMandat, FenNote, FenOffre, FenPrix, FenRaison, FenVendu, FenVisite, JaugeEstimation, lireEstim,
  type ChoixA, type CycleEstimation, type OptionAcheteur,
} from './FenetresBien';
import type { ChoixGuide } from './FenetresBien';
import {
  SEUIL_CORRESPOND, SEUIL_LISTE, acheteursTries, fiable, recherchesRappro, annulerVisiteCRM, annulerVisiteLibre, chargerFiche, cloreRelanceOffre, creerAvenantVente, creerDocument, enregistrerBien,
  MESSAGE_VENDU_SUPPR, cloreRelancesEstimation, creerFicheAcheteur, creerFicheProprio, deposerPiece, doublonsContact, ficheClient, personneVide, joindreCompromis, joindreOffreSignee, ligneNotaires, lireNotaire, majBien, majSuivi, marquerVendeur, nomClient, noterAcceptationAnnulee, noterOffreAcceptee, retirerAutresAcceptees, ouvrirPiece, supprimerBien, triBien, supprimerSuivi,
  type Acheteur, type ClientMini, type Copie, type DetailBien, type DocLie, type ListeBiens, type NotaireChoisi, type PourDocument, type VisiteRow,
} from './outils';
import { exemplaireManquant, lienFichier, nomFichier, type DocumentRow } from '@/components/documents/outils';
import FenetreSigne from '@/components/documents/FenetreSigne';
import SuiviSignature, { lireSuivis, type Suivi } from '@/components/documents/SuiviSignature';
import { DocsParEtat, depuisDoc } from '@/components/documents/DocumentsDuClient';
import { mandatVenteEnCours } from '@/lib/coherence';
import { etapeAvantMandat } from '@/lib/mandat-bien';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';
import { signalerFicheOuverte, signalerBienActif } from '@/components/layout/FichesOuvertes';
import { lirePro, lireStructure } from '@/lib/contacts';
import { issueAppel } from '@/components/fiche/FriseSuivi';
import { lireOngletBien, oublierOngletBien } from '@/lib/intentions';
import { retenirPlace, useHauteur, usePlace } from '@/lib/place-fiche';
import { CarteAcheteurs, FenEnvoiAcheteurs, modeAcheteurs, teinte } from './AcheteursBien';
import { RapprochementBien, lireSeance, resumeSeance } from './RapprochementBien';
import { FenEnvoiLot } from './LotBiens';
import { DossierBien, type DestPropose } from './DossierBien';
import { PastilleProprio } from './PastilleProprio';
import { visitePourCarte } from './pour-visite';
import { OngletVisitesOffres } from './VisitesOffres';
import { FenPointVendeur } from './PointVendeur';
import FenDiffusion from './FenDiffusion';
import { etapeDiffusee, etatDiffusion, lireDiffusion, nomsSupports, supportDe, supportsCoches } from '@/lib/diffusion';
import Depliant from '@/components/shared/Depliant';
import { BoutonPli, PastillePli } from '@/components/shared/Pli';
import {
  ADecrire, BoutonAct, BtnTuile, CarteAnnonce, Col, Encart, Famille, Familles, HistoriqueBien,
  ChaineDocs, EtapesDocs, SyntheseDocs, Kv, Lettres, ListeTravaux, Note, OngletSurfaces, Puces, parcoursDe, type EtapeDoc,
  dateAn, type AVenirBien, type DocOffre, type EvtBien, type InfosCompromis, type MaillonDoc, type NotaireCarte, type SurfacesBien, type VisiteCarte,
} from './OngletsBien';
import NoteRiche from '@/components/shared/NoteRiche';
import { BlocDernierement, BlocProchaines, CartePourLaVisite, CarteVisites, Kpis, ParcoursEstimation, type Jalon, type ProchaineVisite, type Recent, type Repartition } from './VueBien';

/* ═══ La fiche d'un bien ══════════════════════════════════════════════════
   Le bandeau (photo, prix, étape), puis sept onglets :
   · Vue d'ensemble (V3.29, VueBien.tsx) : quatre cartes — le mandat (ou le
     rendez-vous et l'estimation avant lui), les acheteurs, les visites et
     offres, le propriétaire —, le bien en bref, puis les prochaines visites
     et « Dernièrement » ; dessous, la visite (codes, clés), le dossier, le
     propriétaire en détail, les notes. Avant le mandat, « Qui pourrait
     l'acheter » (sans envoi) et l'estimation.
   · Acheteurs (V3.29, AcheteursBien.tsx) : ceux qui correspondent, appeler,
     SMS, mail, et « Sélection ou envoi… ».
   · Le bien (V3.29, OngletsBien.tsx) : l'annonce et les photos en haut,
     puis une carte par famille, chacune de sa couleur, et les pièces, en
     liste ou en cartes.
   · Photos : ajouter, ranger, légender, sans passer par l'éditeur.
   · Visites et offres, Documents, Historique (V3.29, OngletsBien.tsx) : la
     date en pavé, l'offre et ses étapes ; une tuile par sorte de document
     et le dossier avec son anneau ; la frise du Suivi, avec le parcours du
     bien et ses chiffres.
   Chaque bloc a son « Modifier », qui ouvre l'éditeur à la bonne étape. */

/* V3.91 : Surfaces est une sous-rubrique de « Le bien » (SousVue), plus un onglet. */
type Onglet = 'apercu' | 'photos' | 'bien' | 'visites' | 'acheteurs' | 'documents' | 'historique';
type Fen =
  | { k: 'mandat' } | { k: 'estimation' } | { k: 'estim' } | { k: 'offre'; pour?: ChoixA; existante?: SuiviVente } | { k: 'compromis'; offre?: string; existant?: SuiviVente } | { k: 'tombe' } | { k: 'revente' } | { k: 'vendu'; correction?: boolean } | { k: 'prix' } | { k: 'visite'; pour?: ChoixA } | { k: 'note' }
  | { k: 'deplacer'; v: VisiteU } | { k: 'point' }
  | { k: 'raison'; etape: EtapeVente; titre: string; sur: string } | { k: 'acheteurs'; liste: Acheteur[] } | { k: 'annulerMandat'; vers?: EtapeVente }
  | { k: 'diffusion'; premiere?: boolean };

/* ── Les mots des listes de choix, lus dans le formulaire ── */
const OPTIONS: Record<string, Record<string, string>> = {};
for (const e of ETAPES_BIEN) for (const c of e.champs) if (c.t === 'choix' || c.t === 'cases') OPTIONS[c.cle] = Object.fromEntries(c.options.map(o => [o.v, o.l]));
const lib = (d: Donnees, cle: string) => { const v = d[cle]; return typeof v === 'string' && v ? OPTIONS[cle]?.[v] || v : ''; };
const libs = (d: Donnees, cle: string) => liste(d, cle).map(v => OPTIONS[cle]?.[v] || v);
const eur = (n: number | null | undefined) => (n ? euros(n) : '');
const jourCourt = (iso: string) => {
  const x = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (isNaN(x.getTime())) return '';
  const t = x.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const BADGES: Record<string, { l: string; ton: string }> = {
  propose: { l: 'Présenté, sans réponse', ton: 'e_gris' }, interesse: { l: 'Ça lui plaît', ton: 'e_or' }, souhaite_visiter: { l: 'Veut visiter', ton: 'e_bleu' },
  visite: { l: 'A visité', ton: 'e_bleu' }, offre_faite: { l: 'A fait une offre', ton: 'e_or' }, refuse: { l: 'Pas pour lui', ton: 'e_rouge' },
};

/* ── Petits morceaux ── */
function Bloc({ ic, titre, action, children, large, id }: { ic: string; titre: ReactNode; action?: ReactNode; children: ReactNode; large?: boolean; id?: string }) {
  return (
    <section className={`${b.bloc} ${large ? b.large : ''}`} id={id}>
      <div className={b.blocT}><span className={b.blocIc}><Ic n={ic} t={15} /></span><h3>{titre}</h3>{action}</div>
      {children}
    </section>
  );
}
const Modifier = ({ onClick, lib: l = 'Modifier' }: { onClick: () => void; lib?: string }) => <button type="button" className={b.lien} onClick={onClick}>{l}</button>;

/* ── Les visites, toutes sources confondues ── */
type VisiteU = {
  cle: string; source: 'crm' | 'libre'; ymd: string; heure: string; qui: string; clientId: string | null; rechercheId: string | null;
  statut: 'a_venir' | 'faite' | 'annulee'; issue: Issue | null; commentaire: string; crm?: VisiteRow; libre?: SuiviVente; copie?: Copie;
};
function visitesDe(det: DetailBien, clients: Record<string, ClientMini>): VisiteU[] {
  const l: VisiteU[] = [];
  for (const v of det.visites) {
    const copie = det.copies.find(c => c.id === v.bien_id);
    l.push({
      cle: 'v-' + v.id, source: 'crm', ymd: String(v.date_visite || '').slice(0, 10), heure: String(v.heure || '').slice(0, 5),
      qui: nomClient(clients[v.client_id]), clientId: v.client_id, rechercheId: v.recherche_id,
      statut: v.statut === 'annulee' ? 'annulee' : v.statut === 'effectuee' ? 'faite' : 'a_venir',
      issue: issueDe(v), commentaire: v.statut === 'effectuee' ? String(v.commentaire || '') : '', crm: v, copie,
    });
  }
  for (const x of det.suivi.filter(y => y.type === 'visite')) {
    const iso = new Date(x.le);
    /* V3.50 : le jour à l'heure de Paris (`le` est en temps universel : une
       visite à 0 h 30 tombait la veille). */
    l.push({
      cle: 's-' + x.id, source: 'libre', ymd: isNaN(iso.getTime()) ? x.le.slice(0, 10) : jourParis(iso), heure: isNaN(iso.getTime()) ? '' : heureParis(iso),
      /* V3.50 : « Créer sa fiche » relie le visiteur à son contact (client_id). */
      qui: x.qui || 'Visiteur', clientId: x.client_id || null, rechercheId: null,
      statut: x.statut === 'annulee' ? 'annulee' : x.statut === 'faite' ? 'faite' : 'a_venir',
      issue: x.avis && x.avis in ISSUES ? (x.avis as Issue) : null, commentaire: x.commentaire || '', libre: x,
    });
  }
  return l.sort((p, q) => `${q.ymd}${q.heure}`.localeCompare(`${p.ymd}${p.heure}`));
}
/* Les jours écoulés depuis une date (« 2026-09-16 » ou un horodatage). */
const joursDepuisIso = (iso: string) => {
  const x = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  return isNaN(x.getTime()) ? 0 : Math.max(0, Math.round((Date.now() - x.getTime()) / 86_400_000));
};
/* V3.50 : à l'heure de Paris. Avant, l'heure de Paris était comparée au
   temps universel : une visite restait « à venir » une à deux heures après
   son heure. */
const passee = (v: VisiteU) => v.statut === 'faite' || (!!v.ymd && visitePasseeParis({ date_visite: v.ymd, heure: v.heure || null }));
/* « 14:30 », à l'heure de Paris. */
const heureParis = (d: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
/* Le moment d'une visite (jour et heure de Paris, l'appareil étant à Paris)
   en horodatage, pour la ranger parmi les autres lignes de l'historique. */
const instantVisite = (ymd: string, heure: string | null | undefined, sinon: string) => {
  const x = new Date(`${ymd}T${String(heure || '12:00').slice(0, 5)}:00`);
  return isNaN(x.getTime()) ? sinon : x.toISOString();
};

/* ══ LE BANDEAU ═══════════════════════════════════════════════════════════ */
export function Bandeau({ bien, detail, surCarte, cote }: { bien: BienVente; detail: DetailBien | null; surCarte?: () => void; cote?: ReactNode }) {
  const d = bien.donnees || {};
  const photos = lirePhotos(d.photos);
  const a = argentBien(d);
  const prix = prixCarte(bien);
  const i = PARCOURS.indexOf(bien.etape);
  const derniere = detail?.suivi.find(x => x.type === 'etape' && x.statut === bien.etape);
  const raison = String((derniere?.donnees as Record<string, unknown> | undefined)?.raison || '');
  const adresse = [txt(d, 'adresse'), [txt(d, 'cp'), txt(d, 'ville')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return (
    <div className={b.hero}>
      <div className={b.heroImg}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photos[0] ? <img src={photos[0].url} alt={photos[0].legende || ''} /> : <span className={b.imgVide}><Ic n="photo" t={28} />Pas encore de photo</span>}
        {photos.length > 1 && <span className={b.heroNb}><Ic n="photo" t={12} />{photos.length}</span>}
      </div>
      <div className={`${b.heroTxt} ${cote ? b.heroTxtCote : ''}`}>
        <div className={b.heroBadges}>
          {bien.mandat_type && !cote && <span className={b.badgeOr}>{NOM_MANDAT[bien.mandat_type]?.toUpperCase()}{bien.mandat_numero && <i>{` · n° ${bien.mandat_numero}`}</i>}</span>}
          {bien.reference && <span className={b.ref}>{`Réf. ${bien.reference}`}</span>}
          {/* V3.79 : un bien repris d'ImmoFacile garde sa référence d'origine. */}
          {txt(d, 'refImmofacile') && <span className={b.ref}>{`ImmoFacile n° ${txt(d, 'refImmofacile')}`}</span>}
        </div>
        <h1 className={b.heroT}>{titreBien(d)}</h1>
        {(adresse || txt(d, 'quartier')) && (
          <div className={b.heroAdr}>
            <span>{[adresse, txt(d, 'quartier')].filter(Boolean).join(' · ')}</span>
            {surCarte && (!!txt(d, 'adresse') || (!!d.gps && typeof d.gps === 'object')) && (
              <button type="button" className="bouton-carte bouton-carte-sombre" onClick={surCarte}><Ic n="carte" t={14} e={2} /><span>Voir sur la carte</span></button>
            )}
          </div>
        )}
        <div className={b.heroPrix}>
          <b>{prix.t}</b>
          {avantMandat(bien.etape) && a.prix && (num(d, 'estimBasse') || num(d, 'estimHaute')) ? <span>{`prix conseillé ${euros(a.prix)}`}</span>
            : a.prix && a.hono !== null && a.net ? <span>{a.acq ? `honoraires ${euros(a.hono)} TTC inclus · net vendeur ${euros(a.net)}` : `honoraires ${euros(a.hono)} TTC à la charge du vendeur · net vendeur ${euros(a.net)}`}</span> : null}
        </div>
        {cote}
        {i >= 0 && (
          <div className={b.stepMobile} aria-hidden="true">
            <div className={b.stepBarres} style={{ gridTemplateColumns: `repeat(${PARCOURS.length}, 1fr)` }}>{PARCOURS.map((k, j) => <span key={k} className={j <= i ? b.stepPlein : undefined} />)}</div>
            <div className={b.stepTxt}><span><b>{etapeDe(bien.etape).court}</b>{` · étape ${i + 1} sur ${PARCOURS.length}`}</span>{i < PARCOURS.length - 1 && <span>{`Ensuite : ${etapeDe(PARCOURS[i + 1]).court.toLowerCase()}`}</span>}</div>
          </div>
        )}
        {i >= 0 ? (
          <div className={b.stepper} aria-label="Étapes de la vente">
            {PARCOURS.map((k, j) => (
              <span key={k} style={{ display: 'contents' }}>
                {j > 0 && <span className={b.stepTrait} />}
                <span className={`${b.step} ${j < i ? b.stepOk : j === i ? b.stepOn : ''}`}>
                  <span className={b.stepRond}>{j < i && <Ic n="check" t={10} e={3.4} />}</span>{k === 'mandat' && j === i && !txt(d, 'mandatDate') ? 'En vente' : etapeDe(k).lib}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <span className={b.heroHors}><span className={b.point} style={{ background: etapeDe(bien.etape).c }} />{[etapeDe(bien.etape).lib, raison].filter(Boolean).join(' · ')}</span>
        )}
      </div>
    </div>
  );
}

/* ══ L'ESSENTIEL DU BIEN ══════════════════════════════════════════════════ */
function exterieurCourt(d: Donnees): string {
  const ann = liste(d, 'annexes');
  const s2 = (k: string, l: string) => (num(d, k) ? `${l} ${m2(num(d, k) as number)}` : '');
  const avec = [ann.includes('terrasse') && (s2('surfTerrasse', 'Terrasse') || 'Terrasse'), ann.includes('balcon') && (s2('surfBalcon', 'Balcon') || 'Balcon'),
    ann.includes('jardin') && (s2('surfJardin', 'Jardin') || 'Jardin'), ann.includes('loggia') && (s2('surfLoggia', 'Loggia') || 'Loggia')].filter(Boolean) as string[];
  /* V3.81 : « Parking +1 » plutôt que « Parking, Cave » coupé en « Parking, Ca… ». */
  const l = libs(d, 'annexes');
  return avec[0] || (l.length ? `${l[0]}${l.length > 1 ? ` +${l.length - 1}` : ''}` : 'Aucun');
}
/* Le bien en bref : des tuiles à icône, seulement ce qui est rempli.
   V3.80 (Alexandre : « le bien en bref, mettre que sur une seule ligne ») :
   les sept faits qui comptent, sur une ligne — surface, pièces et chambres
   ensemble, étage, extérieur, exposition, DPE, charges (ou taxe foncière
   pour une maison). Les salles d'eau, l'année de construction : dans
   « Le bien ». */
const PICTO_ANNEXE: Record<string, string> = { balcon: 'balcon', terrasse: 'parasol', loggia: 'balcon', jardin: 'terrain', cave: 'cave', parking: 'parking', box: 'voiture', garage: 'voiture', piscine: 'eau' };
function Faits({ d, vide }: { d: Donnees; vide?: ReactNode }) {
  const enImm = !['maison', 'terrain'].includes(String(d.typeBien || ''));
  const asc = liste(d, 'immeuble').includes('ascenseur');
  const n = (k: string) => num(d, k);
  const ann = liste(d, 'annexes');
  const icExt = PICTO_ANNEXE[['terrasse', 'jardin', 'balcon', 'loggia'].find(x => ann.includes(x)) || ann[0] || ''] || 'terrain';
  /* V3.30 : chaque tuile a sa teinte (la même famille que dans « Le bien »),
     sur fond blanc : sur le gris de la page, les tuiles grises se perdaient. */
  type Ton = 'or' | 'bleu' | 'violet' | 'cyan' | 'ardoise' | 'vert' | 'ambre';
  const items: { ic: string; v: string; l: string; dpe?: string; ton: Ton }[] = [];
  const pl = (x: number, mot: string) => `${x} ${mot}${x > 1 ? 's' : ''}`;
  if (n('surface')) items.push({ ic: 'regle', ton: 'or', v: m2(n('surface') as number), l: n('carrez') ? `Carrez ${m2(n('carrez') as number)}` : 'Habitable' });
  else if (n('terrain')) items.push({ ic: 'terrain', ton: 'vert', v: m2(n('terrain') as number), l: 'Terrain' });
  const ch = n('chambres');
  if (n('pieces')) items.push({ ic: 'plan', ton: 'bleu', v: pl(n('pieces') as number, 'pièce'), l: ch ? `dont ${pl(ch, 'chambre')}` : n('sejour') ? `Séjour ${m2(n('sejour') as number)}` : 'Pièces' });
  else if (ch) items.push({ ic: 'lit', ton: 'violet', v: pl(ch, 'chambre'), l: 'Chambres' });
  if (enImm && n('etage') !== null) items.push({ ic: asc ? 'ascenseur' : 'escalier', ton: 'ardoise', v: etageTexte(n('etage'), n('etages')).replace(' étage', ''), l: (n('niveaux') || 0) >= 2 ? (n('niveaux') === 2 ? 'En duplex' : n('niveaux') === 3 ? 'En triplex' : `Sur ${n('niveaux')} niveaux`) : n('etage') === 0 ? (asc ? 'Avec ascenseur' : 'Étage') : asc ? 'Avec ascenseur' : 'Sans ascenseur' });
  else if (enImm && (n('niveaux') || 0) >= 2) items.push({ ic: 'escalier', ton: 'ardoise', v: n('niveaux') === 2 ? 'Duplex' : n('niveaux') === 3 ? 'Triplex' : `${n('niveaux')} niveaux`, l: `Sur ${n('niveaux')} niveaux` });
  if (!enImm && n('etages')) items.push({ ic: 'escalier', ton: 'ardoise', v: n('etages') === 1 ? 'Plain-pied' : pl(n('etages') as number, 'niveau'), l: n('etages') === 1 ? 'Un seul niveau' : 'Niveaux' });
  if (d.typeBien === 'terrain' && d.constructible) items.push({ ic: 'terrain', ton: 'vert', v: d.constructible === 'oui' ? 'Constructible' : d.constructible === 'partiel' ? 'En partie' : 'Non constructible', l: d.viabilise === 'oui' ? 'Viabilisé' : d.viabilise === 'non' ? 'Non viabilisé' : 'Terrain' });
  if (ann.length) items.push({ ic: icExt, ton: 'vert', v: exterieurCourt(d), l: ['terrasse', 'jardin', 'balcon', 'loggia'].some(x => ann.includes(x)) ? 'Extérieur' : 'Annexes' });
  if (d.expo) items.push({ ic: 'boussole', ton: 'ambre', v: d.expo === 'traversant' ? 'Traversant' : nomExpo(d.expo).replace(/^./, x => x.toUpperCase()), l: 'Exposition' });
  if (d.dpe) items.push({ ic: '', ton: 'ambre', dpe: String(d.dpe), v: n('dpeValeur') ? `${n('dpeValeur')} kWh` : `Classe ${d.dpe}`, l: n('dpeValeur') ? 'DPE, m² par an' : 'DPE' });
  else if (d.dpeStatut === 'vierge') items.push({ ic: 'eclair', ton: 'ambre', v: 'Vierge', l: 'DPE' });
  if (n('chargesAn')) items.push({ ic: 'lots', ton: 'ardoise', v: `${euros((n('chargesAn') as number) / 12)}`, l: 'Charges / mois' });
  else if (n('taxeFonciere')) items.push({ ic: 'fiscal', ton: 'ardoise', v: euros(n('taxeFonciere') as number), l: 'Taxe foncière' });
  if (!items.length) return <div className={b.vide}>{vide || 'Les caractéristiques du bien s’afficheront ici.'}</div>;
  return (
    <div className={b.faits}>
      {items.map((x, i) => (
        <div key={x.l + x.v} className={b.fait} data-ton={x.ton} style={{ animationDelay: `${Math.min(i, 10) * 0.035}s` }}>
          {x.dpe
            ? <span className={b.faitDpe} style={{ background: COULEURS.dpe[x.dpe]?.f, color: COULEURS.dpe[x.dpe]?.t }}>{x.dpe}</span>
            : <span className={b.faitIc}><Ic n={x.ic} t={19} /></span>}
          <div><b>{x.v}</b><small>{x.l}</small></div>
        </div>
      ))}
    </div>
  );
}
/* Le bien en bref, dans sa carte blanche : un lien vers les surfaces, un
   « Modifier ». */
function BlocBref({ d, onSurfaces, onModifier }: { d: Donnees; onSurfaces: () => void; onModifier: () => void }) {
  return (
    <section className={b.bref} aria-label="Le bien en bref">
      <div className={b.brefT}>
        <h3>Le bien en bref</h3>
        <button type="button" className={`${b.lien} ${b.lienOr}`} onClick={onSurfaces}><Ic n="regle" t={14} />Surfaces et pièces</button>
        <Modifier onClick={onModifier} />
      </div>
      <Faits d={d} vide="Surface, pièces, étage, extérieur… : « Modifier » pour les saisir." />
    </section>
  );
}

const dateLongueCourt = (ymd: string) => {
  const x = new Date(`${ymd}T12:00:00`);
  return isNaN(x.getTime()) ? ymd : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

/* « Le propriétaire » n'a plus de bloc en bas de la Vue d'ensemble (V3.31) :
   il doublait la carte du haut, qui reprend ce qu'il disait en plus
   (pourquoi il vend, son délai, venu par, son notaire). */

/* « Les indications de visite » n'ont plus de bloc en bas de la Vue
   d'ensemble (V3.32) : la carte « Pour la visite » les porte, en haut, avant
   comme après le mandat. */

/* Une liste de travaux ou de sinistres (V3.31) : chaque ligne numérotée, la
   nature en gras, la date dans une pastille à droite (dessous, sur le
   téléphone), la précision en dessous.
   Déclarée au niveau du module (AGENTS.md §2.4). */
function ListeObs({ l }: { l: Observation[] }) {
  return (
    <ol className={b.obsL}>
      {l.map((o, i) => (
        <li key={o.id}>
          <span className={b.obsN}>{i + 1}</span>
          <span className={b.obsNom}>
            <b>{o.nature || 'À préciser'}</b>
            {o.enCours !== undefined && <em className={`${b.obsTag} ${o.enCours ? b.obsTagRouge : ''}`}>{o.enCours ? 'en cours' : 'réglé'}</em>}
          </span>
          {o.quand && <span className={b.obsDate}><Ic n="calendrier" t={13} />{o.quand}</span>}
          {o.note && <small className={b.obsNote}>{o.note}</small>}
        </li>
      ))}
    </ol>
  );
}

/* Les observations (V3.16) : les travaux, les sinistres, les PV d'AG, les
   notes. Pour Alexandre seul ; un sinistre en cours passe en rouge, en haut.
   V3.30 : sur toute la largeur, et le texte libre rangé en blocs qui se
   replient (NoteRiche).
   V3.31 : rangées comme dans « Modifier » — « Le logement », « La
   copropriété », « Tes notes » — chacune dans sa carte, et chaque texte libre
   sous le même nom que son champ (« Autres remarques sur les travaux ») :
   un bloc « Travaux » tout seul, sous la liste des travaux réalisés, ne
   disait pas ce qu'il était. */
function BlocObservations({ d, onModifier }: { d: Donnees; onModifier: () => void }) {
  const copro = d.copro === 'oui';
  const sinistres = lireObservations(d.sinistres);
  const enCours = sinistres.filter(x => x.enCours);
  const faits = lireObservations(d.travauxFaits);
  const sin = d.sinistre === 'oui' ? sinistres : [];
  const coproL = copro ? [
    { t: 'Gros travaux votés', ic: 'accord', l: lireObservations(d.coproVotes) },
    { t: 'Gros travaux réalisés', ic: 'check', l: lireObservations(d.coproFaits) },
    { t: 'Gros travaux à venir', ic: 'horloge', l: lireObservations(d.coproAVenir) },
  ].filter(g => g.l.length) : [];
  const remT = txt(d, 'travaux');
  const remC = copro ? txt(d, 'travauxVotes') : '';
  const notes = txt(d, 'notes');
  const secT = useMemo(() => [{ texte: remT }], [remT]);
  const secC = useMemo(() => [{ texte: remC }], [remC]);
  const secN = useMemo(() => [{ texte: notes }], [notes]);
  const logement = faits.length > 0 || sin.length > 0 || !!remT || d.sinistre === 'non';
  const coproOk = coproL.length > 0 || !!remC;
  /* De longues notes (un dossier fourni) prennent toute la largeur, en colonnes. */
  const notesLongues = notes.length > 420 || /\n[ \t]*\n/.test(notes);
  const vide = !logement && !coproOk && !notes;
  const titre = (t: string, ic: string, n?: number) => (
    <div className={b.obsT}><Ic n={ic} t={14} /><span>{t}</span>{n ? <i>{n}</i> : null}</div>
  );
  return (
    <Bloc ic="loupe" titre="Observations et notes" action={<Modifier onClick={onModifier} />} large>
      {d.sinistre === 'oui' && enCours.length > 0 && (
        <div className={b.obsAlerte}><Ic n="info" t={16} /><span>{`Sinistre en cours : ${enCours.map(x => [x.nature || 'à préciser', x.quand].filter(Boolean).join(', ')).join(' ; ')}`}</span></div>
      )}
      {!vide && (
        <div className={b.obsParts}>
          {logement && (
            <section className={b.obsPart}>
              <div className={b.obsPartT}><span className={b.obsPartIc}><Ic n="outil" t={16} /></span><span><b>Le logement</b><small>Travaux et sinistres</small></span></div>
              {d.sinistre === 'non' && <span className={b.obsOk}><Ic n="check" t={15} e={2.6} />Aucun sinistre, à sa connaissance</span>}
              {faits.length > 0 && <div className={b.obsS}>{titre('Travaux réalisés', 'outil', faits.length)}<ListeObs l={faits} /></div>}
              {sin.length > 0 && <div className={b.obsS}>{titre('Les sinistres', 'eau', sin.length)}<ListeObs l={sin} /></div>}
              {remT && <div className={b.obsS}>{titre('Autres remarques sur les travaux', 'crayon')}<NoteRiche sections={secT} hauteur={200} colonnes={false} /></div>}
            </section>
          )}
          {coproOk && (
            <section className={b.obsPart}>
              <div className={b.obsPartT}><span className={b.obsPartIc}><Ic n="lots" t={16} /></span><span><b>La copropriété</b><small>Ce que disent les PV d’AG</small></span></div>
              {coproL.map(g => <div key={g.t} className={b.obsS}>{titre(g.t, g.ic, g.l.length)}<ListeObs l={g.l} /></div>)}
              {remC && <div className={b.obsS}>{titre('Autres remarques sur la copropriété', 'crayon')}<NoteRiche sections={secC} hauteur={200} colonnes={false} /></div>}
            </section>
          )}
          {notes && (
            <section className={`${b.obsPart} ${notesLongues ? b.obsPartLarge : ''}`}>
              <div className={b.obsPartT}><span className={b.obsPartIc}><Ic n="cadenas" t={16} /></span><span><b>Tes notes</b><small>Notes internes</small></span></div>
              <NoteRiche sections={secN} hauteur={notesLongues ? 320 : 200} colonnes={notesLongues} />
            </section>
          )}
        </div>
      )}
      {vide && <div className={b.vide}>Les travaux, un sinistre, ce que disent les PV d’AG, tes notes : « Modifier » pour les noter.</div>}
      <div className={b.pied}>Visibles par toi seul, jamais dans un espace client ni une annonce. Présentes à chaque étape du bien, de « À suivre » jusqu’à la vente.</div>
    </Bloc>
  );
}

/* « Le dossier » n'est plus résumé dans la Vue d'ensemble (V3.31) : il
   doublait l'onglet Documents, où tout se fait. */

/* ── « Chez le propriétaire ? » dans le bandeau (V3.31) ──
   Avant le mandat seulement (à suivre, estimation) : la visite sur place,
   tablette en main, pièce par pièce. Elle était un bloc doré en bas de la Vue
   d'ensemble et un bouton en haut ; la voilà dans le vide à droite du
   bandeau, visible depuis tous les onglets. Faite : « Reprendre ». */
function CoteVisite({ d, onOuvrir }: { d: Donnees; onOuvrir: () => void }) {
  const le = txt(d, 'visiteLe');
  return (
    <div className={b.heroCote}>
      <div className={b.heroCoteT}>
        <span className={b.heroCoteIc}><Ic n="tablette" t={18} /></span>
        <span><b>{le ? 'La visite sur place' : 'Chez le propriétaire ?'}</b><small>{le ? `Faite le ${dateLongueCourt(le)}` : 'Pièce par pièce, tablette en main'}</small></span>
      </div>
      <button type="button" className={b.heroCoteBtn} onClick={onOuvrir}>{le ? 'Reprendre la visite' : 'Commencer la visite'}</button>
    </div>
  );
}

/* ══ Le bien vendu, dans le bandeau (V3.47) ═══════════════════════════════
   Alexandre : « avoir une mention : vendu le, par, pour — qu'on le voie
   d'entrée de jeu ». La date de l'acte, le prix, le vendeur et l'acquéreur ;
   et la suite : une nouvelle vente du même bien, des années plus tard. */
export function CoteVendu({ bien, ligne, vendeur, suite, onRevente, onSuite, onCorriger }: {
  bien: BienVente; ligne: SuiviVente | null; vendeur: string;
  suite: { id: string; reference: string | null } | null; onRevente: () => void; onSuite: (id: string) => void;
  /* V3.50 : la date, le prix, les honoraires de l'acte, à corriger. */
  onCorriger?: () => void;
}) {
  const d = (ligne?.donnees || {}) as Record<string, unknown>;
  const acte = (typeof d.acte === 'string' && d.acte) || bien.vendu_le || '';
  const prix = typeof d.prix === 'number' ? d.prix : null;
  const acq = typeof d.acquereur === 'string' ? d.acquereur : '';
  const v = (typeof d.vendeur === 'string' && d.vendeur) || vendeur;
  return (
    <div className={`${b.heroCote} ${b.heroMandat} ${b.heroVendu}`}>
      <div className={b.heroCoteT}>
        <span className={b.heroCoteIc}><Ic n="cle" t={17} /></span>
        <span><b>{acte ? `Vendu le ${dateLongue(acte)}` : 'Vendu'}</b><small>{prix ? `${euros(prix)} · acte authentique` : 'Acte authentique'}</small></span>
      </div>
      <div className={b.heroMandatL}>
        {v && <span>{`Vendeur : ${v}`}</span>}
        {acq && <span>{`Acquéreur : ${acq}`}</span>}
        {suite
          ? <button type="button" className={b.heroMandatLien} onClick={() => onSuite(suite.id)}>{`Revendu : voir la nouvelle fiche${suite.reference ? ` (${suite.reference})` : ''}`}</button>
          : <button type="button" className={b.heroMandatLien} onClick={onRevente}>Une nouvelle vente de ce bien…</button>}
        {onCorriger && <button type="button" className={b.heroMandatLien} onClick={onCorriger}>Corriger l’acte…</button>}
      </div>
    </div>
  );
}

/* Le mandat, dans le bandeau (V3.32) : la grosse carte « Le mandat » de la
   Vue d'ensemble prenait une place entière pour trois lignes. Ici, discret :
   le type et le numéro, signé le, jusqu'au, et le temps qui reste.
   V3.42 : pas encore signé, il le dit (« en préparation », « en signature »,
   d'après Documents) au lieu de « Mandat en cours ». */
function CoteMandat({ bien, d, enRoute, onModifier, onDoc, onPreparer, onDejaSigne }: {
  bien: BienVente; d: Donnees; enRoute: DocLie | null;
  onModifier: () => void; onDoc: (id: string) => void; onPreparer: () => void; onDejaSigne: () => void;
}) {
  const type = bien.mandat_type ? NOM_MANDAT[bien.mandat_type] || '' : d.mandatType ? NOM_MANDAT[String(d.mandatType)] || '' : '';
  const numero = txt(d, 'mandatNumero') || bien.mandat_numero || '';
  const signe = txt(d, 'mandatDate'), fin = txt(d, 'mandatFin');
  const reste = joursAvant(fin);
  const pause = bien.etape === 'suspendu';
  if (!signe && bien.etape === 'mandat') {
    const ed = (enRoute?.donnees || {}) as Donnees;
    const typeDoc = NOM_MANDAT[String(ed.type || '')] || '';
    const etat = !enRoute ? 'Mandat pas encore signé' : enRoute.statut === 'brouillon' ? 'Mandat en préparation'
      : enRoute.signature ? 'Mandat en signature' : 'Mandat prêt à signer';
    const sous = enRoute ? [typeDoc || 'Mandat', enRoute.numero ? `n° ${enRoute.numero}` : ''].filter(Boolean).join(' · ') : 'Rien dans Documents pour l’instant';
    return (
      <div className={`${b.heroCote} ${b.heroMandat}`}>
        <div className={b.heroCoteT}>
          <span className={b.heroCoteIc}><Ic n="plume" t={17} /></span>
          <span><b>{etat}</b><small>{sous}</small></span>
        </div>
        <div className={`${b.heroMandatL} ${b.heroMandatLiens}`}>
          {enRoute
            ? <button type="button" className={b.heroMandatLien} onClick={() => onDoc(enRoute.id)}>{enRoute.statut === 'brouillon' ? 'Continuer le mandat' : 'Ouvrir dans Documents'}</button>
            : <button type="button" className={b.heroMandatLien} onClick={onPreparer}>Préparer le mandat</button>}
          <button type="button" className={b.heroMandatLien} onClick={onDejaSigne}>Déjà signé ?</button>
        </div>
      </div>
    );
  }
  return (
    <div className={`${b.heroCote} ${b.heroMandat}`}>
      <div className={b.heroCoteT}>
        <span className={b.heroCoteIc}><Ic n="plume" t={17} /></span>
        <span><b>{pause ? 'Mandat · vente en pause' : 'Mandat en cours'}</b><small>{[type || 'Mandat', numero ? `n° ${numero}` : ''].filter(Boolean).join(' · ')}</small></span>
      </div>
      <div className={b.heroMandatL}>
        {signe ? <span>{`Signé le ${dateCourte(signe)}`}</span> : <button type="button" className={b.heroMandatLien} onClick={onModifier}>Noter la date de signature</button>}
        {fin && <span>{`Jusqu’au ${dateCourte(fin)}`}{reste !== null && <i data-ton={reste < 0 ? 'rouge' : reste <= 15 ? 'or' : ''}>{reste < 0 ? ' · terminé' : ` · encore ${reste} j`}</i>}</span>}
      </div>
    </div>
  );
}

/* Les indications de visite pour la carte « Pour la visite » : depuis la
   V3.134 dans ./pour-visite, partagées avec l'agenda. */

/* ── Le parcours de l'estimation (V3.31, maquette B) ──
   À la place de la carte « Le rendez-vous d'estimation » et du bloc
   « L'estimation » du bas. Un jalon franchi plus loin coche ceux d'avant
   (une estimation donnée sans visite sur place notée ne laisse pas la visite
   « en cours » pour toujours). Dessous : le montant quand il est donné, ce
   qu'on a retenu de la visite, puis « Ensuite : … ». */
const jourSemaine = (ymd: string) => {
  const x = new Date(`${ymd}T12:00:00`);
  return isNaN(x.getTime()) ? ymd : x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};
function BlocParcours({ bien, onDefinir, onEstimation, onMandat, onDocuments }: {
  bien: BienVente; onDefinir: () => void; onEstimation: () => void; onMandat: () => void; onDocuments: () => void;
}) {
  const d = bien.donnees || {};
  const suivre = bien.etape === 'a_suivre';
  const rdv = txt(d, 'rdvEstimation');
  const heureRdv = txt(d, 'rdvEstimationHeure');
  const j = joursAvant(rdv);
  const visite = txt(d, 'visiteLe');
  const e = lireEstim(d);
  const fait = !!(e.basse || e.haute || e.prix);
  const avis = txt(d, 'avisEnvoye');
  const surf = num(d, 'carrez') || num(d, 'surface');
  const fourchette = e.basse && e.haute ? `${euros(e.basse).replace(/\s€$/, '')} – ${euros(e.haute)}` : e.basse || e.haute ? euros((e.basse || e.haute) as number) : '';
  const brut = [!!rdv, !!visite, fait, !!avis, false];
  const ok = brut.map((x, i) => x || (i < 4 && brut.slice(i + 1, 4).some(Boolean)));
  const courant = ok.findIndex(x => !x);
  const etat = (i: number): Jalon['etat'] => (ok[i] ? 'fait' : i === courant ? 'encours' : 'avenir');
  /* V3.50 : avec l'heure, quand elle est notée (le rendez-vous est alors dans l'agenda). */
  const quandRdv = rdv ? [`${dateCourte(rdv)}${heureRdv ? ` à ${heureRdv.replace(':', ' h ')}` : ''}`, j === null ? '' : j === 0 ? 'aujourd’hui' : j > 0 ? `dans ${j} jour${j > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') : ok[0] ? 'sans date notée' : 'à prendre';
  const jalons: Jalon[] = [
    { cle: 'rdv', l: rdv ? 'Rendez-vous pris' : 'Le rendez-vous', ic: 'calendrier', v: quandRdv, etat: etat(0) },
    { cle: 'visite', l: 'Visite sur place', ic: 'tablette', v: visite ? `faite le ${dateCourte(visite)}` : ok[1] ? 'pas notée' : rdv ? 'le jour du rendez-vous' : 'chez le propriétaire', etat: etat(1) },
    { cle: 'montant', l: 'Le montant', ic: 'etiquette', v: fait ? (e.prix ? `${euros(e.prix)} conseillé` : fourchette) : 'la fourchette, le prix conseillé', etat: etat(2) },
    { cle: 'avis', l: 'L’avis de valeur', ic: 'envoyer', v: avis ? `envoyé le ${dateCourte(avis)}` : 'à envoyer au propriétaire', etat: etat(3) },
    { cle: 'mandat', l: 'Le mandat', ic: 'plume', v: 'signé : le bien passe « En vente »', etat: etat(4) },
  ];
  let ensuite = '';
  let action: { l: string; onClick: () => void } | undefined;
  if (suivre) { ensuite = 'le propriétaire y réfléchit. Quand il se décide, passe le bien à l’estimation.'; action = { l: 'Passer à l’estimation', onClick: onEstimation }; }
  else if (!rdv && !fait) { ensuite = 'fixer le rendez-vous d’estimation avec le propriétaire.'; action = { l: 'Noter le rendez-vous', onClick: onDefinir }; }
  else if (!fait) { ensuite = rdv && j !== null && j > 0 ? `la visite chez le propriétaire, ${jourSemaine(rdv)}${heureRdv ? ` à ${heureRdv.replace(':', ' h ')}` : ''}. Après elle, la fourchette et le prix conseillé.` : 'la fourchette et le prix conseillé.'; action = { l: 'Définir l’estimation', onClick: onDefinir }; }
  else if (!avis) { ensuite = 'envoyer l’avis de valeur au propriétaire, puis noter la date.'; action = { l: 'Avis de valeur envoyé', onClick: onDefinir }; }
  else { ensuite = 'le mandat, prérempli avec le bien, le propriétaire et le prix, dans l’onglet Documents.'; action = { l: 'Préparer le mandat', onClick: onDocuments }; }
  const atouts = liste(d, 'visiteAtouts'), defauts = liste(d, 'visiteDefauts');
  const note = txt(d, 'visiteNote');
  return (
    <ParcoursEstimation titre={suivre ? 'Le projet, jusqu’au mandat' : 'Le parcours de l’estimation'} jalons={jalons} ensuite={ensuite} action={action} onDejaSigne={onMandat}>
      {fait && (
        <div className={b.estimVue}>
          {fourchette && <div className={b.estimVueF}><small>Fourchette</small><b>{fourchette}</b></div>}
          {e.prix ? <div className={b.estimVueP}><small>Prix conseillé</small><b>{euros(e.prix)}</b>{surf ? <i>{`${euros(Math.round(e.prix / surf))} / m²`}</i> : null}</div> : null}
          <JaugeEstimation e={e} />
          {e.souhaite ? <div className={b.estimVueS}><Ic n="personne" t={14} /><span>{`Le propriétaire espère ${euros(e.souhaite)}`}{e.prix ? <b>{` · ${e.souhaite >= e.prix ? '+' : '−'}${pourcent(Math.abs(Math.round(((e.souhaite - e.prix) / e.prix) * 1000) / 10))}`}</b> : null}</span></div> : null}
          <button type="button" className={b.lien} onClick={onDefinir}>Modifier l’estimation</button>
        </div>
      )}
      {!fait && e.souhaite ? <div className={b.estimVueS}><Ic n="personne" t={14} /><span>{`Le propriétaire espère ${euros(e.souhaite)}`}</span></div> : null}
      {(atouts.length > 0 || defauts.length > 0 || note) && (
        <div className={b.retenu}>
          <span className={b.retenuT}>Retenu de la visite</span>
          {atouts.length > 0 && <div className={b.tags}>{atouts.map(x => <span key={x} className={`${b.tag} ${b.tagIc}`}><Ic n="etoile" t={12} />{x}</span>)}</div>}
          {defauts.length > 0 && <div className={b.tags}>{defauts.map(x => <span key={x} className={`${b.tag} ${b.tagRouge}`}>{x}</span>)}</div>}
          {note && <p className={b.vEntreeNote}>{note}</p>}
        </div>
      )}
    </ParcoursEstimation>
  );
}

/* « 1er étage sur 5 », « 5e étage sur 5 · dernier étage », « Rez-de-chaussée ·
   immeuble de 5 étages » : l'étage, avec le nombre d'étages s'il est noté (V3.32). */
const etageLong = (e: number | null, tot: number | null) => {
  if (e === null) return '';
  if (e === 0) return tot ? `Rez-de-chaussée · immeuble de ${tot} étage${tot > 1 ? 's' : ''}` : 'Rez-de-chaussée';
  return tot && e === tot ? `${etageTexte(e, tot)} · dernier étage` : etageTexte(e, tot);
};

/* ══ ONGLET « LE BIEN » (V3.29, OngletsBien.tsx) ══════════════════════════
   L'annonce et les photos en haut, puis une carte par famille, chacune de sa
   couleur, puis les pièces, en liste ou en cartes. */
/* V3.48 : la loggia avait sa surface dans la fiche, mais pas ici. */
const SURF_ANNEXE: Record<string, string> = { balcon: 'surfBalcon', terrasse: 'surfTerrasse', loggia: 'surfLoggia', jardin: 'surfJardin', cave: 'surfCave', parking: 'nbParking' };

/* ══ ONGLET « SURFACES » (V3.30, OngletsBien.tsx) ═══════════════════════════ */
const PICTO_ANN: Record<string, string> = { balcon: 'balcon', terrasse: 'parasol', jardin: 'terrain', cave: 'cave', loggia: 'loggia', parking: 'parking', box: 'box', garage: 'voiture', piscine: 'piscine' };
/* « l’appartement du 68 avenue d’Iéna » : pour le message d'envoi des documents. */
const LE_TYPE: Record<string, string> = { appartement: 'l’appartement', maison: 'la maison', duplex: 'le duplex', studio: 'le studio', loft: 'le loft', terrain: 'le terrain', local: 'le local', parking: 'le parking', immeuble: 'l’immeuble' };
function lieuDe(d: Donnees): string {
  const t = LE_TYPE[String(d.typeBien || '')] || 'le bien';
  const adr = txt(d, 'adresse'), ville = txt(d, 'ville');
  return adr ? (/^\d/.test(adr) ? `${t} du ${adr}` : `${t}, ${adr}`) : ville ? `${t} à ${ville}` : t;
}
function surfacesDe(d: Donnees): SurfacesBien {
  const ann = liste(d, 'annexes');
  const annexes: SurfacesBien['annexes'] = [];
  for (const v of ann) {
    const cle = SURF_ANNEXE[v];
    const n = cle ? num(d, cle) : null;
    const l = OPTIONS.annexes?.[v] || v;
    if (v === 'parking') annexes.push({ ic: PICTO_ANN.parking, l: n ? 'Parking' : 'Nombre de places non saisi', v: n ? `${n} place${n > 1 ? 's' : ''}` : 'Parking' });
    /* Box, garage, piscine n'ont pas de surface à saisir : pas de « surface non saisie ». */
    else annexes.push({ ic: PICTO_ANN[v] || 'plan', l: n ? l : cle ? 'Surface non saisie' : 'Annexe', v: n ? m2(n) : l });
  }
  /* V3.90 : la date du mesurage Carrez, s'il est reçu dans le dossier. */
  const carrez = lireDossier(d.dossier).carrez;
  const typeB = String(d.typeBien || '');
  return {
    surface: num(d, 'surface'), carrez: num(d, 'carrez'), sejour: num(d, 'sejour'), terrain: num(d, 'terrain'),
    carrezAttendu: d.copro === 'oui', chambres: num(d, 'chambres'), pieces: num(d, 'pieces'), annexes,
    etage: num(d, 'etage'), etages: num(d, 'etages'), ascenseur: liste(d, 'immeuble').includes('ascenseur'), expo: txt(d, 'expo'),
    maison: typeB === 'maison' || typeB === 'terrain', carrezLe: carrez?.etat === 'recu' ? carrez.date : '', lots: txt(d, 'annexesNum'),
  };
}

/* V3.79 (Alexandre : « plutôt que tout l'un sous l'autre, des onglets par
   caractéristique, si on veut afficher juste l'élément ; que ce soit fluide,
   joli, avec des icônes ») : une rangée de sous-onglets en tête — « Tout »
   (la vue d'ensemble d'avant, les cartes en colonnes), puis une carte à la
   fois, en grand, ses lignes sur deux colonnes. Mêmes cartes, même ordre. */
export type SousVue = 'tout' | 'surfaces' | 'interieur' | 'immeuble' | 'exterieur' | 'quartier' | 'energie' | 'copro' | 'prix';
/* Les sous-onglets, leur icône dans la couleur de leur carte. « Tout » en
   premier (V3.81). V3.81 : ils vivent dans le tiroir de la barre des
   rubriques (FicheBien), plus dans l'onglet lui-même. */
export function vuesDuBien(d: Donnees, avant: boolean): { k: SousVue; l: string; ic: string; c: string }[] {
  const enImm = !['maison', 'terrain'].includes(String(d.typeBien || ''));
  return [
    { k: 'tout', l: 'Tout', ic: 'maison', c: '#c9a84c' },
    /* V3.99 (Alexandre : « le prix est trop à droite, mettez-le tout à
       gauche, à côté de Surfaces ») : juste après « Tout ». */
    { k: 'prix', l: avant ? 'Estimation et prix' : 'Prix', ic: 'etiquette', c: '#a9822f' },
    /* V3.91 (Alexandre : « il y a beaucoup d'onglets ») : l'onglet Surfaces
       devient une sous-rubrique de « Le bien », la même page (OngletSurfaces). */
    { k: 'surfaces', l: 'Surfaces', ic: 'regle', c: '#475569' },
    { k: 'interieur', l: 'Intérieur', ic: 'canape', c: '#2d5c8f' },
    { k: 'immeuble', l: enImm ? 'Immeuble' : 'Maison', ic: enImm ? 'immeuble' : 'maison', c: '#6d28d9' },
    { k: 'exterieur', l: 'Extérieur', ic: 'terrain', c: '#16a34a' },
    { k: 'quartier', l: 'Quartier', ic: 'carte', c: '#0891b2' },
    { k: 'energie', l: 'Énergie', ic: 'eclair', c: '#d97706' },
    { k: 'copro', l: d.copro === 'non' ? 'Charges et taxes' : 'Copropriété et charges', ic: 'lots', c: '#0d9488' },
  ];
}
const FR_NB = (n: number) => String(n).replace('.', ',');
export function OngletBien({ bien, vue = 'tout', onModifier, onSurfaces, onEstimation, onAnnonce }: { bien: BienVente; vue?: SousVue; onModifier: (etape: string) => void; onSurfaces: () => void; onEstimation: () => void; onAnnonce?: (titre: string, texte: string) => void }) {
  const d = bien.donnees || {};
  const a = argentBien(d);
  const enImm = !['maison', 'terrain'].includes(String(d.typeBien || ''));
  const imm = liste(d, 'immeuble');
  const pieces = lirePieces(d.detailPieces);
  const avant = avantMandat(bien.etape);
  const chargesAn = num(d, 'chargesAn');
  const surf = num(d, 'carrez') || num(d, 'surface');
  const M = (e: string) => () => onModifier(e);
  /* V3.107 — « etape:@champ » : chaque ligne mène droit à son champ dans
     l'éditeur ; « etape:t-… », chaque « Modifier » à sa partie. */
  const A = (etape: string, champ: string) => () => onModifier(`${etape}:@${champ}`);
  const large = vue !== 'tout';
  const chauffage = [lib(d, 'chauffageMode'), lib(d, 'chauffageEnergie').toLowerCase()].filter(Boolean).join(', ');
  const cuisine = [lib(d, 'cuisine'), lib(d, 'cuisineEquip').toLowerCase()].filter(Boolean).join(', ');
  const equip = libs(d, 'equipements');
  /* Les fenêtres : « Double vitrage, aluminium » (V3.79). */
  const fenetres = [lib(d, 'vitrage'), lib(d, 'menuiseries').toLowerCase()].filter(Boolean).join(', ');
  const volets = d.volets === 'aucun' ? 'aucun' : [lib(d, 'volets'), lib(d, 'voletsMateriau').replace(/^(?!PVC)./, c => c.toLowerCase())].filter(Boolean).join(', ').replace(/^./, c => c.toUpperCase());
  const videInt = !d.etat && !chauffage && !cuisine && !equip.length && !fenetres && !volets && !txt(d, 'interieurNote') && !txt(d, 'travaux');
  /* Les gros travaux votés (la liste de l'étape Copropriété) et les
     remarques libres : « Autres remarques sur la copropriété » dans
     l'éditeur. Jusqu'à la V3.29, ces remarques s'affichaient ici sous le mot
     « Travaux votés », en gras, calées à droite : un paragraphe entier
     tenait dans une colonne de trois mots. */
  const votes = d.copro === 'oui' ? lireObservations(d.coproVotes) : [];
  const remarquesCopro = d.copro === 'oui' ? txt(d, 'travauxVotes') : '';
  const ann = liste(d, 'annexes');
  const nbPark = num(d, 'nbParking');
  /* Les annexes sans ligne à elles (loggia, box, piscine…, ou sans surface) : en pastilles. */
  const annPuces = ann.filter(v => !SURF_ANNEXE[v] || !num(d, SURF_ANNEXE[v])).map(v => OPTIONS.annexes?.[v] || v);
  const videExt = !ann.length && !d.expo && !lib(d, 'vue') && !txt(d, 'exterieurNote');
  const cout = num(d, 'coutMin') && num(d, 'coutMax') ? `${euros(num(d, 'coutMin') as number).replace(/\s€$/, '')} à ${euros(num(d, 'coutMax') as number)} par an` : '';
  const dpeV = num(d, 'dpeValeur');
  const gesV = num(d, 'gesValeur');
  const fr = (n: number) => String(n).replace('.', ',');
  /* La construction : « 1930 · pierre de taille » (V3.79). */
  const construction = [num(d, 'annee') ? String(num(d, 'annee')) : '', txt(d, 'constructionType').toLowerCase()].filter(Boolean).join(' · ');
  /* Le quartier (V3.79) : la proximité, repris d'ImmoFacile ou saisi. */
  const minutes = (k: string) => (num(d, k) ? `${FR_NB(num(d, k) as number)} min` : '');
  const quartierLignes = [
    { l: 'Quartier', v: txt(d, 'quartier'), c: 'quartier' },
    { l: 'Commerces', v: num(d, 'proxCommerces') ? `à ${FR_NB(num(d, 'proxCommerces') as number)} km` : '', c: 'proxCommerces' },
    { l: 'École', v: minutes('proxEcole'), c: 'proxEcole' }, { l: 'Bus', v: minutes('proxBus'), c: 'proxBus' },
    { l: 'Métro', v: minutes('proxMetro'), c: 'proxMetro' }, { l: 'Tramway', v: minutes('proxTram'), c: 'proxTram' }, { l: 'RER, train', v: minutes('proxRer'), c: 'proxRer' },
  ];
  const videQuartier = !quartierLignes.some(x => x.v) && !txt(d, 'situation');

  const interieur = (
    <Famille key="int" ton="bleu" ic="canape" titre="L’intérieur" onModifier={M('interieur')} large={large}>
      <Kv l="État" v={lib(d, 'etat')} aller={A('interieur', 'etat')} />
      <Kv l="Cuisine" v={cuisine} aller={A('interieur', 'cuisine')} />
      <Kv l="Chauffage" v={chauffage} aller={A('interieur', 'chauffageMode')} />
      <Kv l="Par" v={lib(d, 'chauffageEmetteurs')} aller={A('interieur', 'chauffageEmetteurs')} />
      <Kv l="Eau chaude" v={lib(d, 'eauChaude')} aller={A('interieur', 'eauChaude')} />
      <Kv l="Fenêtres" v={fenetres} aller={A('interieur', 'vitrage')} />
      <Kv l="Volets" v={volets} aller={A('interieur', 'volets')} />
      <Puces l={equip} />
      {txt(d, 'travaux') && <Note><b>Autres remarques sur les travaux :</b>{` ${txt(d, 'travaux')}`}</Note>}
      {txt(d, 'interieurNote') && <Note>{txt(d, 'interieurNote')}</Note>}
      {videInt && <ADecrire />}
    </Famille>
  );
  const immeuble = (
    <Famille key="imm" ton="violet" ic={enImm ? 'immeuble' : 'maison'} titre={enImm ? 'L’immeuble' : 'La maison'} onModifier={M(enImm ? 'bien:t-imm' : 'bien:t-constr')} large={large}>
      {enImm && <Kv l="Étage" v={etageLong(num(d, 'etage'), num(d, 'etages'))} aller={A('bien', 'etage')} />}
      {!enImm && <Kv l="Niveaux" v={num(d, 'etages') ?? ''} aller={A('bien', 'etages')} />}
      {enImm && <Kv l="Ascenseur" v={d.typeBien ? (imm.includes('ascenseur') ? 'oui' : 'non') : ''} aller={A('bien', 'immeuble')} />}
      <Kv l="Construction" v={construction} aller={A('bien', 'annee')} />
      <Kv l="Standing" v={lib(d, 'standing')} aller={A('bien', 'standing')} />
      {enImm && <Kv l="Parties communes" v={lib(d, 'etatCommuns').toLowerCase()} aller={A('bien', 'etatCommuns')} />}
      <Kv l="Extérieur, façade" v={lib(d, 'etatExterieur').toLowerCase()} aller={A('bien', 'etatExterieur')} />
      <Kv l="Style" v={txt(d, 'style')} aller={A('bien', 'style')} />
      {!enImm && <Kv l="Mitoyenneté" v={lib(d, 'mitoyennete').toLowerCase()} aller={A('bien', 'mitoyennete')} />}
      {!enImm && <Kv l="Assainissement" v={lib(d, 'assainissement').toLowerCase().replace(/^tout/, 'Tout')} aller={A('bien', 'assainissement')} />}
      <Kv l="N° de lot" v={txt(d, 'lot')} aller={A('bien', 'lot')} />
      <Kv l="Cadastre" v={txt(d, 'cadastre')} aller={A('bien', 'cadastre')} />
      <Puces l={libs(d, 'immeuble').filter((x, i) => imm[i] !== 'ascenseur')} />
      {!d.typeBien && !construction && !imm.length && <ADecrire />}
    </Famille>
  );
  const copro = (
    <Famille key="copro" ton="sarcelle" ic="lots" titre="Copropriété" onModifier={M('copro')} large={large}>
      {d.copro === 'oui' ? (
        <>
          <Kv l="Lots" v={num(d, 'lots') ? `${num(d, 'lots')}${num(d, 'lotsHabitation') ? ` dont ${num(d, 'lotsHabitation')} d’habitation` : ''}` : ''} aller={A('copro', 'lots')} />
          <Kv l="Procédure en cours" v={d.procedure === 'oui' ? txt(d, 'procedureNature') || 'oui' : d.procedure === 'non' ? 'aucune' : ''} alerte={d.procedure === 'oui'} aller={A('copro', 'procedure')} />
          <Kv l="Syndic" v={txt(d, 'syndic')} aller={A('copro', 'syndic')} />
          <Kv l="Fonds de travaux" v={eur(num(d, 'fondsTravaux'))} aller={A('copro', 'fondsTravaux')} />
          {votes.length > 0 && (
            <ListeTravaux titre="Gros travaux votés" l={votes.map(o => ({ id: o.id, t: o.nature || 'À préciser', s: [o.quand, o.note].filter(Boolean).join(' · ') }))} />
          )}
          {remarquesCopro && (
            <div className={b.remarques}>
              <span className={b.remarquesT}>Autres remarques sur la copropriété</span>
              <NoteRiche sections={[{ texte: remarquesCopro }]} hauteur={150} colonnes={false} />
            </div>
          )}
        </>
      ) : d.copro === 'non' ? <Note>Pas de copropriété.</Note> : <ADecrire t="À renseigner." />}
    </Famille>
  );
  const exterieur = (
    <Famille key="ext" ton="vert" ic="terrain" titre="Extérieur et annexes" onModifier={M('exterieur')} large={large}>
      <Kv l="Balcon" v={num(d, 'surfBalcon') ? m2(num(d, 'surfBalcon') as number) : ''} aller={A('exterieur', 'surfBalcon')} />
      <Kv l="Terrasse" v={num(d, 'surfTerrasse') ? m2(num(d, 'surfTerrasse') as number) : ''} aller={A('exterieur', 'surfTerrasse')} />
      <Kv l="Jardin" v={num(d, 'surfJardin') ? m2(num(d, 'surfJardin') as number) : ''} aller={A('exterieur', 'surfJardin')} />
      <Kv l="Cave" v={num(d, 'surfCave') ? m2(num(d, 'surfCave') as number) : ''} aller={A('exterieur', 'surfCave')} />
      <Kv l="Parking" v={nbPark ? `${nbPark} place${nbPark > 1 ? 's' : ''}` : ''} aller={A('exterieur', 'nbParking')} />
      <Kv l="Stationnement" v={lib(d, 'stationnement').toLowerCase()} aller={A('exterieur', 'stationnement')} />
      <Kv l="Exposition" v={d.expo ? (d.expo === 'traversant' ? 'traversant' : nomExpo(d.expo).toLowerCase()) : ''} aller={A('exterieur', 'expo')} />
      <Kv l="Vue" v={lib(d, 'vue').toLowerCase()} aller={A('exterieur', 'vue')} />
      <Kv l="Vis-à-vis" v={lib(d, 'visAVis').toLowerCase()} aller={A('exterieur', 'visAVis')} />
      <Puces l={annPuces} />
      {txt(d, 'exterieurNote') && <Note>{txt(d, 'exterieurNote')}</Note>}
      {videExt && <ADecrire />}
    </Famille>
  );
  const quartier = videQuartier && !large ? null : (
    <Famille key="quartier" ton="ciel" ic="carte" titre="Le quartier" onModifier={M('bien:t-prox')} large={large}>
      {quartierLignes.map(x => <Kv key={x.l} l={x.l} v={x.v} aller={A('bien', x.c)} />)}
      {txt(d, 'situation') && <Note>{txt(d, 'situation')}</Note>}
      {videQuartier && <ADecrire t="À renseigner : les commerces, l’école, les transports, la situation." />}
    </Famille>
  );
  const energie = !avant || d.dpe || d.dpeStatut || large ? (
    <Famille key="energie" ton="ambre" ic="eclair" titre="L’énergie" onModifier={M('energie')} large={large}>
      {d.dpeStatut === 'vierge' ? <Note>DPE vierge.</Note> : d.dpeStatut === 'non' ? <Note>Non soumis au DPE.</Note> : (
        <>
          <Lettres genre="dpe" v={String(d.dpe || '')} titre={`DPE${dpeV ? ` · ${fr(dpeV)} kWh/m²/an` : ''}`} />
          <Lettres genre="ges" v={String(d.ges || '')} titre={`GES${gesV ? ` · ${fr(gesV)} kg CO₂/m²/an` : ''}`} />
          <Kv l="Diagnostic fait le" v={txt(d, 'dpeDate') ? dateLongueCourt(txt(d, 'dpeDate')) : d.dpeStatut === 'encours' ? 'commandé' : ''} aller={A('energie', 'dpeDate')} />
          <Kv l="Coût estimé" v={cout} aller={A('energie', 'coutMin')} />
          <Kv l="N° ADEME" v={txt(d, 'dpeNumero')} aller={A('energie', 'dpeNumero')} />
          {passoire(d) && <Encart>Classe F ou G : logement à consommation énergétique excessive. L’annonce doit le dire.</Encart>}
        </>
      )}
    </Famille>
  ) : null;
  const charges = (
    <Famille key="charges" ton="ardoise" ic="lignes" titre="Charges et taxes" onModifier={M('copro:t-fin')} large={large}>
      <Kv l="Charges" v={chargesAn ? `${euros(chargesAn)} par an · ${euros(chargesAn / 12)} par mois` : ''} aller={A('copro', 'chargesAn')} />
      <Kv l="Elles comprennent" v={libs(d, 'chargesInclus').join(', ').toLowerCase()} aller={A('copro', 'chargesInclus')} />
      <Kv l="Taxe foncière" v={num(d, 'taxeFonciere') ? `${euros(num(d, 'taxeFonciere') as number)} par an` : ''} aller={A('copro', 'taxeFonciere')} />
      <Kv l="Loyer (bien loué)" v={num(d, 'loyer') ? `${euros(num(d, 'loyer') as number)} par mois` : ''} aller={A('pratique', 'loyer')} />
      <Kv l="Fin du bail" v={txt(d, 'finBail') ? dateLongueCourt(txt(d, 'finBail')) : ''} aller={A('pratique', 'finBail')} />
      {!chargesAn && !num(d, 'taxeFonciere') && !num(d, 'loyer') && <ADecrire t="À renseigner." />}
    </Famille>
  );
  const fourchetteE = num(d, 'estimBasse') || num(d, 'estimHaute') ? [eur(num(d, 'estimBasse')), eur(num(d, 'estimHaute'))].filter(Boolean).join(' à ') : '';
  const conseille = num(d, 'prixConseille');
  const ecart = conseille && a.prix && conseille !== a.prix ? Math.round(((a.prix - conseille) / conseille) * 1000) / 10 : null;
  const histoEstim = [
    { l: 'Fourchette', v: fourchetteE },
    { l: 'Prix conseillé', v: conseille ? `${euros(conseille)}${ecart !== null ? ` · affiché ${ecart > 0 ? '+' : '−'}${pourcent(Math.abs(ecart))}` : ''}` : '' },
    { l: 'Le propriétaire espérait', v: eur(num(d, 'prixSouhaite')) },
  ].filter(x => x.v);
  const prix = (
    /* Avant le mandat, « Modifier » ouvre la fenêtre de l'estimation (rendez-vous,
       fourchette, prix conseillé, avis de valeur), comme le parcours de la Vue
       d'ensemble, et non tout l'éditeur (V3.31). */
    <Famille key="prix" ton="or" ic="etiquette" titre={avant ? 'Estimation et prix' : 'Prix et honoraires'} onModifier={avant ? onEstimation : M('prix:t-prix')} large={large}>
      {avant && <Kv l="Estimation" v={fourchetteE} aller={onEstimation} />}
      <Kv l={avant ? 'Prix conseillé' : 'Prix affiché'} v={eur(a.prix)} aller={avant ? onEstimation : A('prix', 'prix')} />
      <Kv l="Net vendeur" v={eur(a.net)} aller={avant ? onEstimation : A('prix', 'prix')} />
      <Kv l="Honoraires" v={a.hono !== null ? `${euros(a.hono)} TTC, à la charge ${a.acq ? 'de l’acquéreur' : 'du vendeur'}${a.taux ? ` · ${pourcent(a.taux)}` : ''}` : ''} aller={avant ? onEstimation : A('prix', 'honoMode')} />
      <Kv l="Prix au m²" v={a.prix && surf ? euros(a.prix / surf) : ''} aller={avant ? onEstimation : A('prix', 'prix')} />
      {avant && <Kv l="Le propriétaire espère" v={eur(num(d, 'prixSouhaite'))} aller={onEstimation} />}
      {!a.prix && !num(d, 'estimBasse') && !num(d, 'estimHaute') && <ADecrire t="À renseigner." />}
      {/* Après le mandat, ce qui avait été estimé reste lisible (V3.32). */}
      {!avant && histoEstim.length > 0 && (
        <div className={b.histoEstim}>
          <span className={b.histoEstimT}>{txt(d, 'avisEnvoye') ? `L’estimation · avis de valeur du ${dateCourte(txt(d, 'avisEnvoye'))}` : 'L’estimation, avant le mandat'}</span>
          {histoEstim.map(x => <Kv key={x.l} l={x.l} v={x.v} />)}
        </div>
      )}
    </Famille>
  );

  /* Les cartes de chaque sous-onglet. */
  const CARTES: Record<SousVue, ReactNode[]> = {
    tout: [], surfaces: [], interieur: [interieur], immeuble: [immeuble], exterieur: [exterieur], quartier: [quartier],
    energie: [energie], copro: [copro, charges], prix: [prix],
  };
  const ordre = vuesDuBien(d, avant).map(x => x.k);
  return (
    <Col>
      <CorpsOnglet k={vue} ordre={ordre}>
        {vue === 'tout' ? (
          <Col>
            {/* Plus de bande de photos ici (V3.31) : elles sont dans l'onglet Photos. */}
            {/* À toutes les étapes (V3.81), l'estimation comprise. */}
            <CarteAnnonce titre={txt(d, 'annonceTitre')} texte={txt(d, 'annonceTexte')} mentions={controleAnnonce(d)} mentionsTexte={mentionsAnnonce(d)} onEcrire={M('annonce')} onReformuler={onAnnonce ? x => reformulerAnnonce(d, x) : undefined} onAppliquer={onAnnonce} />
            {/* V3.99 : le prix en tête, comme dans les sous-rubriques. */}
            <Familles>
              {prix}
              {interieur}
              {immeuble}
              {copro}
              {exterieur}
              {quartier}
              {energie}
              {charges}
            </Familles>
          </Col>
        ) : (
          <div className={b.vueSeule}>{(CARTES[vue] || []).filter(Boolean)}</div>
        )}
      </CorpsOnglet>

      <button type="button" className={b.versSurfaces} onClick={onSurfaces}>
        <span className={b.versSurfacesIc}><Ic n="regle" t={18} /></span>
        <span><b>Les surfaces et les pièces</b><small>{pieces.length ? `${pieces.length} pièce${pieces.length > 1 ? 's' : ''} saisie${pieces.length > 1 ? 's' : ''}${surf ? ` · ${m2(surf)}` : ''} · dans la rubrique Surfaces` : 'Pièce par pièce, dans la rubrique Surfaces'}</small></span>
        <Ic n="droite" t={16} e={2.4} />
      </button>
    </Col>
  );
}

/* ══ ONGLET « HISTORIQUE » (V3.29 : la frise du Suivi, OngletsBien.tsx) ═══ */
type Evt = EvtBien;
const PUCE_OFFRE: Record<string, EvtBien['puce']> = {
  en_attente: { l: 'En attente de réponse', c: '#7a5d1c', fond: '#fbf6e9', bord: '#ecdcb0' },
  contre: { l: 'Contre-offre', c: '#1d4ed8', fond: '#eff6ff', bord: '#bfdbfe' },
  acceptee: { l: 'Acceptée', c: '#15803d', fond: '#ecfdf3', bord: '#bbf0cf' },
  refusee: { l: 'Refusée', c: '#475569', fond: '#f1f5f9', bord: '#e2e8f0' },
  retiree: { l: 'Retirée', c: '#475569', fond: '#f1f5f9', bord: '#e2e8f0' },
};
const PUCE_CR: EvtBien['puce'] = { l: 'Compte rendu à faire', c: '#c2410c', fond: '#fff7ed', bord: '#fed7aa' };
const puceIssue = (i: Issue | null): EvtBien['puce'] => (i ? { l: ISSUES[i].crm, c: ISSUES[i].couleur, fond: ISSUES[i].fond, bord: ISSUES[i].trait } : undefined);

/* V3.150 — comment le bien est parti chez l'acheteur (la colonne
   `canal_envoi` de sa copie). Envoyé par mail, il est aussi dans son espace
   (la copie passe « Présenté ») ; « lien » : seulement dans l'espace. */
const CANAL_ENVOI: Record<string, string> = { mail: 'Envoyé par mail', whatsapp: 'Envoyé par WhatsApp' };

export function evenements(bien: BienVente, det: DetailBien, clients: Record<string, ClientMini>): Evt[] {
  const l: Evt[] = [];
  const maj = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  /* V3.150 (Alexandre : « le petit icône avec l'avatar, qu'on puisse cliquer
     sur l'acheteur en question ») : la personne de la ligne, son avatar, et
     un clic ouvre sa fiche. */
  const chezLui = (id: string | null | undefined): Evt['chez'] => {
    if (!id || !clients[id]) return undefined;
    const t = teinte(id);
    return { id, l: nomClient(clients[id]), c: clients[id], t: { bg: t.f, fg: t.t } };
  };
  l.push({ cle: 'creation', le: bien.created_at, ic: 'plus', ton: 'ic_gris', titre: `Bien créé${bien.reference ? ` · ${bien.reference}` : ''}`, genre: 'etapes', discret: true });
  for (const x of det.suivi) {
    const d = (x.donnees || {}) as Record<string, unknown>;
    const str = (k: string) => (typeof d[k] === 'string' ? String(d[k]) : '');
    if (x.type === 'etape') {
      const e = x.statut as EtapeVente;
      let titre = etapeDe(e).lib, detail = '';
      let puce: EvtBien['puce'];
      if (d.annule === true) {
        /* V3.42 : un mandat retiré de la fiche (noté par erreur), ou le bien
           revenu en arrière avant la signature. */
        titre = str('numero') ? `Mandat n° ${str('numero')} retiré de la fiche` : `Revenu « ${etapeDe(e).lib} »`;
        detail = str('numero') ? `Le bien revient « ${etapeDe(e).lib} »` : '';
      } else if (d.depuis === 'revente') {
        /* V3.47 : la nouvelle vente d'un bien déjà vendu. */
        titre = 'Nouvelle vente de ce bien';
        detail = str('venteAvant') ? `La description reprend la fiche ${str('venteAvant')}, vendue avant.` : '';
      } else if ((e === 'mandat' || e === 'retire') && (d.compromisTombe === true || d.de === 'compromis' || d.de === 'offre')) {
        /* V3.47 : le compromis (ou l'offre) est tombé ; le bien repart en vente, ou il est retiré. */
        titre = `${d.de === 'offre' ? 'Offre tombée' : 'Compromis tombé'} — ${e === 'retire' ? 'retiré de la vente' : 'remis en vente'}`;
        detail = str('raison') ? `Pourquoi : ${str('raison')}` : '';
      } else if (e === 'mandat') {
        /* Signé dans Documents (V3.42) : la fiche a suivi toute seule. */
        /* V3.48 : `reprise` (FenMandat) dit si c'est une remise en vente ; un
           bien créé directement « En vente » n'a pas encore de mandat noté. */
        const signe = d.reprise === false || (d.reprise !== true && (d.source === 'documents' || d.de === 'estimation' || d.de === 'a_suivre' || (d.de === 'mandat' && !!str('date'))));
        titre = d.depuis === 'creation' && !str('date') ? 'Créé directement « En vente »' : signe ? `Mandat signé${str('numero') ? ` · n° ${str('numero')}` : ''}` : 'Remis en vente';
        if (signe && str('type')) puce = str('type') === 'exclusif'
          ? { l: 'Exclusif', c: '#e8c96a', fond: '#1a2332', bord: '#1a2332' }
          : { l: NOM_MANDAT[str('type')] || str('type'), c: '#34496e', fond: '#eef2f8', bord: '#dbe3ef' };
        detail = [str('fin') ? `jusqu’au ${dateCourte(str('fin'))}` : '', typeof d.prix === 'number' ? `prix ${euros(d.prix)}` : '', d.source === 'documents' ? 'noté depuis Documents' : ''].filter(Boolean).join(' · ');
      } else if (e === 'offre') { titre = 'Passé sous offre'; detail = typeof d.montant === 'number' ? `${str('qui')} · ${euros(d.montant)}` : ''; }
      else if (e === 'compromis') {
        /* V3.47 : la date de signature, l'acquéreur, les dates qui comptent, les notaires. */
        titre = `Compromis signé${str('signe') ? ` le ${dateLongue(str('signe'))}` : ''}${typeof d.prix === 'number' ? ` · ${euros(d.prix)}` : ''}`;
        detail = [
          str('acquereur') ? `Acquéreur : ${str('acquereur')}` : '',
          maj([str('sru') ? `rétractation jusqu’au ${dateCourte(str('sru'))}` : '', str('pretLimite') ? `prêt jusqu’au ${dateCourte(str('pretLimite'))}` : '', str('acte') ? `acte prévu le ${dateCourte(str('acte'))}` : ''].filter(Boolean).join(' · ')),
          ligneNotaires(lireNotaire(d.notaireVendeur), lireNotaire(d.notaireAcquereur)) || '',
        ].filter(Boolean).join('\n');
      } else if (e === 'vendu') {
        /* V3.47 : l'acte authentique, qui a vendu, qui a acheté — comme dans le Suivi des contacts. */
        const vendeur = str('vendeur') || (bien.client_id && clients[bien.client_id] ? nomClient(clients[bien.client_id]) : '');
        titre = `Vendu — acte authentique${str('acte') ? ` le ${dateLongue(str('acte'))}` : ''}${typeof d.prix === 'number' ? ` · ${euros(d.prix)}` : ''}`;
        detail = [
          [vendeur ? `Vendeur : ${vendeur}` : '', str('acquereur') ? `Acquéreur : ${str('acquereur')}` : ''].filter(Boolean).join(' · '),
          ligneNotaires(lireNotaire(d.notaireVendeur), lireNotaire(d.notaireAcquereur)) || '',
          /* V3.50 : TTC, comme ils sont saisis (le chiffre d'affaires les compte HT). */
          d.sansHonoraires === true || d.hono === 0 ? 'Vente sans honoraires' : typeof d.hono === 'number' ? `Honoraires : ${euros(d.hono)} TTC` : '',
        ].filter(Boolean).join('\n');
      }
      else if (e === 'suspendu') { titre = 'Vente en pause'; detail = [str('raison'), str('reprise') ? `reprise le ${dateCourte(str('reprise'))}` : ''].filter(Boolean).join(' · '); }
      else if (e === 'retire') { titre = 'Retiré de la vente'; detail = str('raison'); }
      else if (e === 'estimation') {
        /* V3.50 : une estimation reprise de zéro le dit ; le rendez-vous a son heure. */
        titre = d.nouveauCycle === true ? 'Estimation reprise' : d.de === 'a_suivre' ? 'Passé à l’estimation' : 'Revenu à l’estimation';
        detail = str('rdv') ? `rendez-vous le ${dateCourte(str('rdv'))}${str('heure') ? ` à ${str('heure').replace(':', ' h ')}` : ''}` : '';
      }
      else if (e === 'a_suivre') {
        titre = d.de === 'estimation' ? 'Projet mis en attente' : 'Remis « à suivre »';
        detail = [str('raison'), str('reprise') ? `à recontacter vers le ${dateCourte(str('reprise'))}` : ''].filter(Boolean).join(' · ');
      }
      l.push({ cle: x.id, le: x.le, ic: d.annule === true ? 'retour' : e === 'vendu' ? 'check' : e === 'retire' ? 'archive' : e === 'suspendu' || (e === 'a_suivre' && d.de === 'estimation') ? 'pause' : 'drapeau', ton: d.annule === true ? 'ic_gris' : e === 'vendu' ? 'ic_emilio' : e === 'retire' ? 'ic_rouge' : 'ic_vert', titre, detail: [detail, x.commentaire].filter(Boolean).join('\n'), genre: 'etapes', puce });
    } else if (x.type === 'prix') {
      /* V3.32 : les honoraires peuvent changer avec le prix, ou seuls. */
      const prixBouge = typeof d.ancien !== 'number' || d.ancien !== x.montant;
      const hono = typeof d.honoApres === 'number' ? `honoraires ${typeof d.honoAvant === 'number' ? `${euros(d.honoAvant)} → ` : ''}${euros(d.honoApres)} TTC` : '';
      const prixT = `${typeof d.ancien === 'number' ? `${euros(d.ancien)} → ` : ''}${euros(x.montant || 0)}`;
      l.push({ cle: x.id, le: x.le, ic: 'etiquette', ton: 'ic_violet',
        titre: hono && prixBouge ? `Prix et honoraires changés : ${prixT}` : hono ? `Honoraires changés : ${hono.replace(/^honoraires /, '')}` : `Prix changé : ${prixT}`,
        detail: [hono && prixBouge ? hono.charAt(0).toUpperCase() + hono.slice(1) : '', x.commentaire || ''].filter(Boolean).join(' · '), genre: 'etapes' });
    } else if (x.type === 'note') {
      /* V3.50 : les lignes que le CRM écrit lui-même (l'estimation, l'avis de
         valeur, l'acte corrigé, le point vendeur) ont leur titre, et ne se
         suppriment pas comme une note. */
      const sans = (t: string) => (x.commentaire || '').replace(t, '').trim();
      if (d.acteCorrige === true) l.push({ cle: x.id, le: x.le, ic: 'crayon', ton: 'ic_violet', titre: 'Acte corrigé', detail: sans('Acte corrigé :'), genre: 'etapes' });
      else if (d.avis === true) l.push({ cle: x.id, le: x.le, ic: 'envoyer', ton: 'ic_violet', titre: 'Avis de valeur envoyé', detail: x.commentaire || '', genre: 'etapes' });
      else if (d.cycleEstimation === true) l.push({ cle: x.id, le: x.le, ic: 'retour', ton: 'ic_gris', titre: 'Nouvelle estimation : la précédente est gardée ici', detail: x.commentaire || '', genre: 'etapes' });
      else if (d.pointVendeur === true) l.push({ cle: x.id, le: x.le, ic: 'megaphone', ton: 'ic_or', titre: 'Point vendeur envoyé', detail: x.commentaire || '', genre: 'etapes' });
      else if (d.pasPourLui === true) l.push({ cle: x.id, le: x.le, ic: 'groupe', ton: 'ic_gris', genre: 'acheteurs', titre: `Pas pour ${x.qui || 'cet acheteur'} : écarté du rapprochement`, detail: 'Il n’est plus proposé dans les rapprochements de ce bien. « Le remettre », depuis l’onglet Rapprochement.' });
      else if (d.rapprochement === true) {
        /* V3.125 : un rapprochement, gardé daté (onglet Rapprochement). */
        const se = lireSeance(x);
        const n = se?.total || 0;
        l.push({ cle: x.id, le: x.le, ic: 'groupe', ton: 'ic_or', genre: 'acheteurs',
          titre: se && se.lignes.length ? `Rapprochement : ${resumeSeance(se.lignes)}` : 'Rapprochement : personne ne passe le premier tri',
          detail: `${n} ${n > 1 ? 'recherches ouvertes' : 'recherche ouverte'}${se?.lignes.length ? `, ${se.lignes.length} ${se.lignes.length > 1 ? 'relues' : 'relue'} en détail` : ''} · le détail est dans l’onglet Rapprochement` });
      }
      else if (d.estimation === true) l.push({ cle: x.id, le: x.le, ic: 'etiquette', ton: 'ic_violet', titre: d.avant ? 'Estimation revue' : 'Estimation', detail: sans('Estimation :'), genre: 'etapes' });
      else l.push({ cle: x.id, le: x.le, ic: 'bulle', ton: 'ic_gris', titre: 'Note', detail: x.commentaire || '', genre: 'notes', suppr: x.id });
    } else if (x.type === 'offre') {
      l.push({ cle: x.id, le: x.le, ic: 'euro', ton: 'ic_or', titre: `Offre de ${euros(x.montant || 0)} · ${x.qui || 'un acquéreur'}`,
        detail: [str('jusquau') ? `Valable jusqu’au ${dateCourte(str('jusquau'))}` : '', str('conditions')].filter(Boolean).join(' · '), genre: 'offres', puce: PUCE_OFFRE[x.statut || 'en_attente'] });
      if (str('reponse_le') && x.statut && x.statut !== 'en_attente') {
        l.push({ cle: x.id + '-r', le: `${str('reponse_le')}T18:00:00`, ic: x.statut === 'acceptee' ? 'check' : 'euro', ton: x.statut === 'acceptee' ? 'ic_vert' : 'ic_gris',
          titre: `Réponse à l’offre de ${x.qui || 'l’acquéreur'} : ${(PUCE_OFFRE[x.statut]?.l || x.statut).toLowerCase()}`, detail: [x.statut === 'contre' && typeof d.contre === 'number' ? `Contre-offre du vendeur à ${euros(d.contre)}` : '', x.statut === 'acceptee' && montantActuel(x) !== x.montant ? `Accord à ${euros(montantActuel(x))}` : '', x.commentaire || ''].filter(Boolean).join(' · '), genre: 'offres' });
      }
    } else if (x.type === 'envoi') {
      /* Des pièces du dossier envoyées par mail (V3.30). */
      const pieces = Array.isArray(d.pieces) ? (d.pieces as unknown[]).map(String) : [];
      /* Le projet d'un document, envoyé en relecture avant la signature (V3.40). */
      const projet = d.projet === true;
      /* V3.51 : une demande de documents (sans pièce jointe). */
      const demandes = Array.isArray(d.demandes) ? (d.demandes as unknown[]).map(String) : [];
      /* V3.121 : le bien présenté par simple mail (hors du CRM, ou un contact sans recherche). */
      if (d.presentation === true) {
        l.push({ cle: x.id, le: x.le, ic: 'mail', ton: 'ic_or', genre: 'acheteurs', titre: `Présenté par mail à ${x.qui || 'un contact'}`,
          detail: d.lien === true ? 'Avec le lien de sa page sur le site' : 'Avec sa photo et sa description', puce: { l: 'Mail simple', c: '#7a5d1c', fond: '#fbf6e9', bord: '#ecdcb0' }, chez: chezLui(x.client_id) });
        continue;
      }
      if (d.demande === true) {
        l.push({ cle: x.id, le: x.le, ic: 'liste', ton: 'ic_or', genre: 'documents', titre: `Documents demandés à ${x.qui || 'un contact'}`,
          detail: demandes.join(', '), puce: { l: `${demandes.length} document${demandes.length > 1 ? 's' : ''}`, c: '#7a5d1c', fond: '#fbf6e9', bord: '#ecdcb0' } });
        continue;
      }
      l.push({ cle: x.id, le: x.le, ic: 'envoyer', ton: 'ic_or', genre: 'documents', titre: `${projet ? 'Projet envoyé' : 'Documents envoyés'} à ${x.qui || 'un contact'}`,
        detail: [projet ? x.commentaire || '' : pieces.join(', '), d.mode === 'liens' ? 'en liens de téléchargement (7 jours)' : ''].filter(Boolean).join(' · '),
        puce: projet ? { l: 'Projet non signé', c: '#7a5d1c', fond: '#fbf6e9', bord: '#ecdcb0' } : { l: `${pieces.length} document${pieces.length > 1 ? 's' : ''}`, c: '#7a5d1c', fond: '#fbf6e9', bord: '#ecdcb0' } });
    } else if (x.type === 'visite') {
      const iss = x.avis && x.avis in ISSUES ? (x.avis as Issue) : null;
      const passe = x.statut === 'faite' || x.le < new Date().toISOString();
      l.push({ cle: x.id, le: x.le, ic: 'cle', ton: 'ic_bleu',
        titre: x.statut === 'annulee' ? `Visite annulée · ${x.qui || ''}` : passe ? `Visite · ${x.qui || 'un visiteur'}` : `Visite prévue · ${x.qui || 'un visiteur'}`,
        detail: [x.commentaire, str('tel')].filter(Boolean).join(' · '), genre: 'visites', discret: x.statut === 'annulee',
        puce: x.statut === 'annulee' ? undefined : iss ? puceIssue(iss) : passe ? PUCE_CR : undefined });
    }
  }
  for (const c of det.copies) {
    const nom = nomClient(clients[c.client_id]);
    const canal = CANAL_ENVOI[String(c.canal_envoi || '')];
    if (c.envoye_le || c.created_at) {
      l.push({ cle: 'p-' + c.id, le: c.envoye_le || c.created_at, ic: c.envoye_le && canal ? 'mail' : 'envoyer', ton: 'ic_or', genre: 'acheteurs',
        titre: c.envoye_le ? `Présenté à ${nom}` : `Mis dans la sélection de ${nom}`,
        /* V3.150 : « Dans son espace » pour un bien parti par mail, c'était faux. */
        detail: c.envoye_le ? (canal ? `${canal} · le bien est aussi dans son espace` : 'Dans son espace, avec la note de correspondance') : 'Rien ne lui est encore envoyé',
        puce: c.vu_le ? { l: 'Fiche ouverte', c: '#0f766e', fond: '#f0fdfa', bord: '#99f6e4' } : undefined, chez: chezLui(c.client_id) });
    }
    if (c.vu_le) l.push({ cle: 'o-' + c.id, le: c.vu_le, ic: 'oeil', ton: 'ic_gris', titre: `${nom} a ouvert la fiche`, genre: 'acheteurs', discret: true });
    if (c.retour_le && c.retour_client) l.push({ cle: 'r-' + c.id, le: c.retour_le, ic: 'bulle', ton: 'ic_bleu', titre: `${nom} a répondu`, detail: c.retour_client, genre: 'acheteurs', chez: chezLui(c.client_id) });
  }
  for (const v of det.visites) {
    const nom = nomClient(clients[v.client_id]);
    const iss = issueDe(v);
    const le = v.date_visite ? instantVisite(String(v.date_visite).slice(0, 10), v.heure, v.created_at) : v.created_at;
    const passe = v.statut === 'effectuee' || (!!v.date_visite && visitePasseeParis(v));
    l.push({ cle: 'vis-' + v.id, le, ic: 'cle', ton: 'ic_bleu', genre: 'visites',
      titre: v.statut === 'annulee' ? `Visite annulée · ${nom}` : passe ? `Visite · ${nom}` : `Visite prévue · ${nom}`,
      detail: v.statut === 'effectuee' ? String(v.commentaire || '') : '', discret: v.statut === 'annulee',
      puce: v.statut === 'annulee' ? undefined : iss ? puceIssue(iss) : passe ? PUCE_CR : undefined, chez: v.statut === 'annulee' ? undefined : chezLui(v.client_id) });
  }
  for (const x of det.docs) {
    const m = modele(x.modele);
    l.push({ cle: 'd-' + x.id, le: x.created_at, ic: 'plume', ton: 'ic_gris', titre: `Document préparé : ${x.titre || m?.titre || 'document'}`, genre: 'documents', discret: true });
    if (x.signe_le) l.push({ cle: 'ds-' + x.id, le: x.signe_le, ic: 'check', ton: 'ic_vert', titre: `Document signé : ${x.titre || m?.titre || 'document'}`, genre: 'documents' });
  }
  /* Le Suivi des contacts qui parle du bien (V3.29) : chez un acheteur, une
     action notée avec « Concerne un bien » ; chez le propriétaire, son Suivi. */
  const LIB_J: Record<string, string> = {
    appel: 'Appel', rdv: 'Rendez-vous', rdv_planifie: 'Rendez-vous prévu', note: 'Note', relance_manuelle: 'Relance', envoi_externe: 'Envoi',
    email_libre: 'Mail', message_client: 'Message', demande_rappel: 'Demande de rappel',
  };
  const IC_J: Record<string, string> = { appel: 'tel', rdv: 'calendrier', rdv_planifie: 'calendrier', note: 'bulle', relance_manuelle: 'horloge', message_client: 'mail', demande_rappel: 'tel' };
  const GENERIQUES = ['appel passé', 'rdv physique', 'note', 'relance manuelle', 'envoi externe', 'email envoyé', 'appel reçu'];
  const copieDe = new Map(det.copies.map(c => [c.id, c]));
  for (const j of det.journal || []) {
    const cl = j.client_id ? clients[j.client_id] : undefined;
    const nom = nomClient(cl);
    const proprio = !j.bien_id;
    const issue = j.type === 'appel' ? issueAppel(j.titre) : null;
    const tj = (j.titre || '').trim();
    const generique = !tj || GENERIQUES.includes(tj.toLowerCase()) || !!issue;
    const lib = issue?.k === 'recu' ? 'Appel reçu' : LIB_J[j.type] || 'Action';
    const titre = j.type === 'message_client' ? `${nom} a écrit` : j.type === 'demande_rappel' ? `${nom} demande à être rappelé` : `${lib} · ${nom}`;
    l.push({
      cle: 'j-' + j.id, le: j.created_at, ic: IC_J[j.type] || 'bulle', ton: 'ic_bleu', genre: 'contacts', titre,
      detail: [generique ? '' : tj, j.description || ''].filter(Boolean).join(' — '),
      puce: issue && issue.k !== 'recu' ? { l: issue.lib, c: issue.c, fond: issue.bg, bord: issue.bord } : undefined,
      chez: j.client_id ? { ...chezLui(j.client_id), id: j.client_id, l: proprio ? `Dans le Suivi de ${nom} · propriétaire` : `Dans le Suivi de ${nom} · acheteur${j.bien_id && copieDe.get(j.bien_id)?.etape === 'selection' ? ', bien en sélection' : ''}` } : undefined,
    });
  }
  /* Une visite prévue et pas encore passée est dans « À venir », pas dans l'histoire. */
  const maintenant = new Date().toISOString();
  return l.filter(e => e.le && !(e.genre === 'visites' && e.titre.startsWith('Visite prévue') && e.le > maintenant)).sort((p, q) => q.le.localeCompare(p.le));
}

/* ══ LA FICHE ═════════════════════════════════════════════════════════════ */
export default function FicheBien({ bien: depart, liste, onRetour, retourLib = 'Biens', onMaj, onSupprime, onModifier, onNavigate, onRecharger, onVendu, onOuvrir }: {
  bien: BienVente; liste: ListeBiens;
  /* V3.138 : « Agenda » quand le bien a été ouvert depuis l'agenda. */
  onRetour: () => void; retourLib?: string; onMaj: (b: BienVente) => void; onSupprime: (id: string) => void;
  onModifier: (etape?: string) => void; onNavigate: (page: string, data?: unknown) => void; onRecharger: () => void;
  /* V3.47 : la vente signée ramène à la liste, avec un bandeau qui le dit. */
  onVendu?: (b: BienVente, texte: string) => void;
  /* V3.47 : ouvrir une autre fiche (la nouvelle vente d'un bien vendu). */
  onOuvrir?: (id: string) => void;
}) {
  const [bien, setBien] = useState<BienVente>(depart);
  useEffect(() => { setBien(depart); }, [depart]);
  /* La barre des fiches ouvertes (en bas de l'écran) : ce bien y prend
     place, et s'y allume tant qu'il est à l'écran. */
  const titreBarre = titreBien(bien.donnees || {});
  const villeBarre = villeAffichee(txt(bien.donnees || {}, 'ville') || bien.ville || '', txt(bien.donnees || {}, 'cp') || bien.code_postal);
  const photoBarre = lirePhotos((bien.donnees || {}).photos)[0]?.url || null;
  useEffect(() => {
    signalerFicheOuverte({ k: 'bien', id: bien.id, titre: titreBarre, sous: villeBarre || bien.reference || undefined, photo: photoBarre });
  }, [bien.id, titreBarre, villeBarre, photoBarre, bien.reference]);
  useEffect(() => {
    signalerBienActif(bien.id);
    return () => signalerBienActif(null);
  }, [bien.id]);
  const [detail, setDetail] = useState<DetailBien | null>(null);
  const [erreur, setErreur] = useState('');
  /* « Voir les acheteurs » depuis une alerte : la fiche s'ouvre sur l'onglet (V3.29).
     V3.121 (Alexandre : « quand je retourne sur le bien, il se remet dans
     Vue d'ensemble ») : sinon, elle reprend l'onglet et la hauteur où on
     l'avait laissée (lib/place-fiche.ts). */
  const clePlace = `bien:${depart.id}`;
  const place = usePlace(clePlace);
  const [demande] = useState(() => (typeof window === 'undefined' ? null : lireOngletBien(depart.id)));
  const [onglet, setOnglet] = useState<Onglet>(() => {
    if (demande === 'acheteurs' || demande === 'visites' || demande === 'historique' || demande === 'documents') return demande;
    const p = String(place?.onglet || '');
    return (['photos', 'bien', 'visites', 'acheteurs', 'documents', 'historique'] as string[]).includes(p) ? (p as Onglet) : 'apercu';
  });
  /* Le sous-onglet de « Le bien » (V3.81 : il vit dans le tiroir de la
     barre des rubriques, gardé quand on change de rubrique et qu'on revient). */
  const [sousVue, setSousVue] = useState<SousVue>(() => (!demande && typeof place?.sous === 'string' && place.sous ? (place.sous as SousVue) : 'tout'));
  useEffect(() => { oublierOngletBien(); }, []);
  useEffect(() => { retenirPlace(clePlace, { onglet, sous: sousVue }); }, [clePlace, onglet, sousVue]);
  const [menu, setMenu] = useState<'etape' | 'plus' | null>(null);
  const [guide, setGuide] = useState<{ titre: string; texte: string; choix: ChoixGuide[] } | null>(null);
  const [fen, setFen] = useState<Fen | null>(null);
  /* V3.55 : l'exemplaire signé à la main d'un document du bien, déposé d'ici. */
  const [depotSigne, setDepotSigne] = useState<DocumentRow | null>(null);
  const [cr, setCr] = useState<VisiteU | null>(null);
  const [message, setMessage] = useState<{ t: string; ok: boolean } | null>(null);
  /* V3.131 : la fiche publique du bien, un lien qui ne change jamais. */
  async function copierLienPublic() {
    const lien = lienBienPublic(bien.id);
    try { await navigator.clipboard.writeText(lien); setMessage({ t: `Lien copié : ${lien}`, ok: true }); }
    catch { setMessage({ t: `Copie impossible ici. Le lien : ${lien}`, ok: false }); }
  }
  const [visite, setVisite] = useState(false);
  /* Onglet Documents (V3.32) : la liste de tous les documents préparés, repliée. */
  const [listeDocsOuverte, setListeDocsOuverte] = useState(false);
  /* Les documents de la vente, repliés en une synthèse (V3.33) : le choix est
     gardé dans ce navigateur. Replié par défaut : le dossier de diagnostics,
     juste en dessous, reste à portée. */
  const [docsVenteOuvert, setDocsVenteOuvert] = useState(() => {
    try { return typeof window !== 'undefined' && window.localStorage.getItem('emi-docs-vente') === 'ouvert'; } catch { return false; }
  });
  const basculerDocsVente = (v: boolean) => {
    setDocsVenteOuvert(v);
    try { window.localStorage.setItem('emi-docs-vente', v ? 'ouvert' : 'replie'); } catch { /* le choix ne sera pas gardé, rien de grave */ }
  };
  /* Le mandat signé hors du CRM (V3.32) : son scan, joint au bien. */
  const champMandat = useRef<HTMLInputElement>(null);
  const [depotMandat, setDepotMandat] = useState(false);
  const d = bien.donnees || {};

  const charger = useCallback(async () => {
    try { setDetail(await chargerFiche(bien)); setErreur(''); } catch (e) { setErreur((e as Error).message); }
  }, [bien]);
  /* La hauteur laissée : rendue une fois la fiche lue, sur le même onglet. */
  useHauteur(clePlace, place, !!detail, !demande && !!place && String(place.onglet || 'apercu') === onglet);
  const premier = useRef(false);
  useEffect(() => {
    if (premier.current) return;
    premier.current = true;
    let vivant = true;
    chargerFiche(depart).then(x => { if (vivant) setDetail(x); }).catch(e => { if (vivant) setErreur((e as Error).message); });
    return () => { vivant = false; };
  }, [depart]);

  const apres = useCallback(async (r?: BienVente | null) => {
    setFen(null);
    if (r) { setBien(r); onMaj(r); }
    await charger();
    onRecharger();
  }, [charger, onMaj, onRecharger]);

  /* V3.45 : ceux qui ratent nettement un critère essentiel sont écartés (outils.ts). */
  /* V3.125 : avec les recherches en attente des prospects et des acheteurs en pause. */
  const rechRappro = useMemo(() => recherchesRappro(liste), [liste]);
  const tries = useMemo(() => acheteursTries(bien, rechRappro, liste.clients, detail?.copies || []), [bien, rechRappro, liste, detail]);
  const acheteurs = tries.retenus;
  /* V3.112 : l'onglet « Rapprochement » — tout le tri de la base (outils.ts). */
  const tri = useMemo(() => triBien(bien, rechRappro, liste.clients, detail?.copies || []), [bien, rechRappro, liste, detail]);
  /* « Un autre client… » : la fenêtre d'envoi avec la recherche par nom (LotBiens). */
  const [envoiAutre, setEnvoiAutre] = useState(false);
  const proprio = bien.client_id ? liste.clients[bien.client_id] || null : null;
  const recherchesProprio = proprio ? liste.recherches.filter(r => r.client_id === proprio.id) : [];
  const visites = useMemo(() => (detail ? visitesDe(detail, liste.clients) : []), [detail, liste.clients]);
  const offres = useMemo(() => (detail?.suivi || []).filter(x => x.type === 'offre').sort((x, y) => y.le.localeCompare(x.le)), [detail]);
  const evts = useMemo(() => (detail ? evenements(bien, detail, liste.clients) : []), [bien, detail, liste.clients]);
  const options: OptionAcheteur[] = useMemo(() => {
    const out: OptionAcheteur[] = [];
    for (const c of detail?.copies || []) {
      const cl = liste.clients[c.client_id];
      if (!cl || out.some(o => o.rechercheId === c.recherche_id)) continue;
      const v = visites.find(x => x.clientId === c.client_id && x.statut !== 'annulee');
      out.push({ cle: 'c-' + c.id, clientId: c.client_id, rechercheId: c.recherche_id, nom: nomClient(cl), sous: v ? `Visite le ${dateCourte(v.ymd)}` : `Bien présenté le ${dateCourte(c.envoye_le || c.created_at)}` });
    }
    for (const a of acheteurs.filter(x => x.corr.note >= SEUIL_LISTE)) {
      if (out.some(o => o.rechercheId === a.recherche.id)) continue;
      out.push({ cle: 'r-' + a.recherche.id, clientId: a.client.id, rechercheId: a.recherche.id, nom: nomClient(a.client), sous: `Correspond à ${a.corr.note} %`, note: a.corr.note });
    }
    return out;
  }, [detail, liste.clients, acheteurs, visites]);

  async function ouvrirClient(id: string) {
    try { onNavigate('fiche', await ficheClient(id)); } catch (e) { alert((e as Error).message); }
  }
  async function faireDocument(x: PourDocument) {
    setMessage({ t: 'Préparation du document…', ok: true });
    try {
      /* Un mandat déjà en préparation (V3.32) : on le reprend plutôt que
         d'en commencer un second. Signé, `creerDocument` refuse et dit pourquoi. */
      if (x.modele === 'mandat_vente') {
        const enCours = await mandatVenteEnCours(bien);
        if (enCours?.documentId && enCours.etat !== 'signe') {
          setMessage({ t: 'Un mandat est déjà en préparation pour ce bien : il s’ouvre.', ok: true });
          onNavigate('documents', { ouvrir: enCours.documentId });
          return;
        }
      }
      const id = await creerDocument(bien, x);
      onNavigate('documents', { ouvrir: id });
    } catch (e) { setMessage({ t: (e as Error).message, ok: false }); }
  }
  const ouvrirDoc = (id: string) => onNavigate('documents', { ouvrir: id });
  /* L'exemplaire signé d'un document du CRM (scellé en ligne ou sur place,
     ou le scan d'une signature à la main), à retélécharger (V3.32). */
  async function ouvrirSigne(x: { signe_chemin?: string | null; titre: string | null; signature?: { mode?: string } | null }) {
    if (!x.signe_chemin) return;
    const onglet = window.open('', '_blank');
    try {
      const url = await lienFichier(x.signe_chemin, nomFichier({ titre: x.titre }, x.signature ? '-signe' : ''));
      (onglet || window).location.assign(url);
    } catch (e2) {
      onglet?.close();
      setMessage({ t: 'L’exemplaire signé n’a pas pu être ouvert : ' + (e2 as Error).message, ok: false });
    }
  }
  /* Le scan d'un mandat signé ailleurs (papier, autre logiciel) : gardé avec
     le bien, dans `donnees.mandatFichier`. */
  async function joindreMandat(f: File) {
    setDepotMandat(true);
    try {
      const r = await deposerPiece(bien.id, 'mandatsigne', f);
      majDonnees('mandatFichier', { chemin: r.chemin, nom: r.nom, taille: f.size, le: jourParis() });
      setMessage({ t: 'Le mandat signé est joint au bien.', ok: true });
    } catch (e2) { setMessage({ t: (e2 as Error).message, ok: false }); }
    setDepotMandat(false);
  }

  /* La réponse à une offre (V3.45) : acceptée, contre-offre, nouvelle
     proposition, refus… La négociation s'allonge dans la même offre
     (`apresReponse`, src/lib/biens-vente.ts). Une réponse clôt la relance
     « réponse à donner » du propriétaire. */
  async function repondreOffre(o: SuiviVente, r: Reponse) {
    /* V3.48 : une seule offre acceptée à la fois. L'autre passe « retirée »,
       après confirmation. */
    const autres = r.k === 'accepte' ? offres.filter(y => y.id !== o.id && y.statut === 'acceptee') : [];
    if (autres.length && !confirm(`L’offre de ${autres.map(y => y.qui || 'un acquéreur').join(', ')} était déjà acceptée. Elle passera « retirée ». Continuer ?`)) return;
    try {
      if (autres.length) await retirerAutresAcceptees(bien, offres, o.id);
      const { statut, donnees } = apresReponse(o, r, jourParis());
      const maj = await majSuivi(o.id, { statut, donnees });
      if (r.k !== 'rouvrir') await cloreRelanceOffre(bien, o);
      /* Acceptée : une ligne dans le Suivi du vendeur et de l'acquéreur ;
         l'acceptation annulée aussi (V3.47). */
      if (r.k === 'accepte') await noterOffreAcceptee(bien, maj);
      if (r.k === 'rouvrir' && o.statut === 'acceptee') await noterAcceptationAnnulee(bien, maj);
      await apres();
    } catch (e) { setMessage({ t: (e as Error).message, ok: false }); }
  }
  async function joindreLeCompromis(l: SuiviVente, f: File) {
    setMessage({ t: 'Envoi du compromis signé…', ok: true });
    try { await joindreCompromis(bien, l, f); setMessage({ t: 'Le compromis signé est joint.', ok: true }); await apres(); }
    catch (e) { setMessage({ t: (e as Error).message, ok: false }); }
  }
  async function joindreOffre(o: SuiviVente, f: File) {
    setMessage({ t: 'Envoi de l’offre signée…', ok: true });
    try { await joindreOffreSignee(bien, o, f); setMessage({ t: 'L’offre signée est jointe.', ok: true }); await apres(); }
    catch (e) { setMessage({ t: (e as Error).message, ok: false }); }
  }
  async function annulerVisite(v: VisiteU) {
    if (!confirm(`Annuler la visite de ${v.qui} ?`)) return;
    try {
      if (v.crm) await annulerVisiteCRM(v.crm.id); else if (v.libre) await annulerVisiteLibre(v.libre);
      await apres();
    } catch (e) { setMessage({ t: (e as Error).message, ok: false }); }
  }
  /* L'acheteur d'une 2e visite (V3.50) : celui de la première. */
  function deuxiemeVisite(v: VisiteU, opt?: OptionAcheteur): ChoixA {
    if (opt) return { mode: 'crm', o: opt };
    if (v.source === 'crm' && v.clientId) return { mode: 'crm', o: { cle: 'c-' + v.clientId, clientId: v.clientId, rechercheId: v.rechercheId, nom: v.qui, sous: `Première visite le ${dateCourte(v.ymd)}` } };
    return { mode: 'libre', nom: v.qui, tel: String((v.libre?.donnees as Record<string, unknown> | undefined)?.tel || '') };
  }
  /* « Créer sa fiche » (V3.50) : un visiteur hors CRM devient un contact
     (acheteur, prospect), relié à sa visite ; sa fiche s'ouvre. S'il est déjà
     dans les contacts (même téléphone, même nom), on propose d'ouvrir celle-là. */
  async function creerFicheVisiteur(v: VisiteU) {
    if (!v.libre) return;
    const tel = String((v.libre.donnees as Record<string, unknown> | undefined)?.tel || '');
    const nomV = v.qui.replace(/\s*\([^)]*\)\s*$/, '').trim() || v.qui;
    const p = personneVide(nomV);
    try {
      const deja = doublonsContact(Object.values(liste.clients), { prenom: p.prenom, nom: p.nom, email: '', telephone: tel });
      if (deja.length && confirm(`${nomClient(deja[0])} est déjà dans tes contacts${deja[0].telephones?.[0] ? ` (${deja[0].telephones[0]})` : ''}.\n\nRelier la visite à sa fiche et l’ouvrir ?`)) {
        await majSuivi(v.libre.id, { client_id: deja[0].id });
        await ouvrirClient(deja[0].id);
        return;
      }
      if (!confirm(`Créer la fiche de ${nomV}${tel ? ` (${tel})` : ''} dans tes contacts, en acheteur ?`)) return;
      const c = await creerFicheAcheteur({ ...p, telephone: tel });
      await majSuivi(v.libre.id, { client_id: c.id });
      onRecharger();
      await ouvrirClient(c.id);
    } catch (e) { setMessage({ t: (e as Error).message, ok: false }); }
  }
  function bonDeVisite(v: VisiteU) {
    const cl = v.clientId ? liste.clients[v.clientId] : null;
    const [prenom, ...reste] = v.qui.split(' ');
    faireDocument({
      modele: 'bon_visite', clientId: v.clientId, rechercheId: v.rechercheId, visite: { date: v.ymd, heure: v.heure },
      personne: cl ? { civilite: '', prenom: cl.prenom || '', nom: cl.nom || '', nomNaissance: '', naissanceDate: '', naissanceLieu: '', adresse: cl.adresse || '', email: cl.emails?.[0] || '', telephone: cl.telephones?.[0] || '' }
        : { civilite: '', prenom: reste.length ? prenom : '', nom: reste.length ? reste.join(' ') : v.qui, nomNaissance: '', naissanceDate: '', naissanceLieu: '', adresse: '', email: '', telephone: String(v.libre?.donnees?.tel || '') },
    });
  }
  /* Le document d'une offre (V3.45) : celui déjà commencé s'ouvre, au lieu
     d'en créer un nouveau à chaque clic. */
  function offreEcrite(o: SuiviVente, deja?: DocLie | null) {
    if (deja) { ouvrirDoc(deja.id); return; }
    const cl = o.client_id ? liste.clients[o.client_id] : null;
    faireDocument({
      modele: 'offre_achat', clientId: o.client_id, rechercheId: o.recherche_id, offre: o,
      personne: cl ? { civilite: '', prenom: cl.prenom || '', nom: cl.nom || '', nomNaissance: '', naissanceDate: '', naissanceLieu: '', adresse: cl.adresse || '', email: cl.emails?.[0] || '', telephone: cl.telephones?.[0] || '' } : null,
    });
  }
  async function archiverBien() {
    try {
      const r = await majBien(bien.id, { archive: !bien.archive });
      /* V3.50 : archivé, ses relances d'estimation n'ont plus d'objet. */
      if (r.archive) await cloreRelancesEstimation(bien);
      setMenu(null); await apres(r);
    } catch (e) { setMessage({ t: (e as Error).message, ok: false }); }
  }
  async function supprimer() {
    setMenu(null);
    /* V3.50 : un bien vendu porte la vente du chiffre d'affaires : on l'archive. */
    if (bien.etape === 'vendu') {
      setGuide({ titre: 'Ce bien est vendu', texte: MESSAGE_VENDU_SUPPR, choix: bien.archive ? [] : [
        { l: 'Archiver', s: 'Il quitte la liste, retrouvable dans « Archivés » ; la vente reste comptée', ic: 'archive', c: '#475569', f: '#f8fafc', go: () => { setGuide(null); void archiverBien(); } },
      ] });
      return;
    }
    if (!confirm('Supprimer ce bien, ses photos, son dossier et son historique ?\n\nLes acheteurs à qui il a été présenté le gardent dans leur dossier. Cette suppression est définitive : pour le ranger simplement, archive-le.')) return;
    try { await supprimerBien(bien); onSupprime(bien.id); } catch (e) { setMessage({ t: (e as Error).message, ok: false }); }
  }

  /* Le dossier se coche depuis la fiche : chaque clic s'enregistre, dans l'ordre. */
  const file = useRef<Promise<unknown>>(Promise.resolve());
  /* V3.43 : seules les clés changées partent, posées sur la fiche relue en
     base. Une clé dont l'enregistrement a échoué (connexion coupée) repart
     avec le clic suivant : sinon elle restait à l'écran sans jamais
     atteindre la base, puis disparaissait au retour du clic suivant. */
  const aReprendre = useRef<Set<string>>(new Set());
  const enregistrerDansLOrdre = useCallback((id: string, donnees: Donnees, avant: Donnees) => {
    file.current = file.current.then(() => {
      const reprises = Array.from(aReprendre.current);
      const base: Donnees = { ...avant };
      for (const k of reprises) base[k] = { '\u0000a_reprendre': true };
      const tentees = Array.from(new Set([...Object.keys(donnees), ...Object.keys(base)]))
        .filter(k => JSON.stringify(donnees[k]) !== JSON.stringify(base[k]));
      return enregistrerBien(id, donnees, base)
        .then(r => { for (const k of reprises) aReprendre.current.delete(k); onMaj(r); })
        .catch(e => { for (const k of tentees) aReprendre.current.add(k); setMessage({ t: (e as Error).message, ok: false }); });
    });
  }, [onMaj]);
  const majDonnees = useCallback((cle: string, v: unknown) => {
    setBien(prev => {
      const n = { ...prev, donnees: { ...(prev.donnees || {}), [cle]: typeof v === 'function' ? (v as (avant: unknown) => unknown)(prev.donnees?.[cle]) : v } };
      enregistrerDansLOrdre(n.id, n.donnees, prev.donnees || {});
      return n;
    });
  }, [enregistrerDansLOrdre]);

  /* ── Le menu d'étape : ce qui peut arriver ensuite ── */
  type Choix = { t: string; s: string; c: string; go: () => void; danger?: boolean };
  const raison = (etape: EtapeVente, titre: string, sur: string) => () => setFen({ k: 'raison', etape, titre, sur });
  const suite: Choix[] = [];
  const e = bien.etape;
  /* V3.91 : où part l'annonce (le bouton du bandeau, sa fenêtre). */
  const diff = etatDiffusion(bien);
  /* « Surfaces » vit dans le tiroir de « Le bien » depuis la V3.91. */
  const voirSurfaces = () => { setOnglet('bien'); setSousVue('surfaces'); };
  /* V3.48 : ce que l'étape permet (lib/biens-vente.ts, permisBien). */
  const p = permisBien(bien);
  if (e === 'a_suivre') {
    suite.push({ t: 'On passe à l’estimation…', s: 'Le bien passe « Estimation »', c: etapeDe('estimation').c, go: () => setFen({ k: 'estimation' }) });
    suite.push({ t: 'Le mandat est signé…', s: 'Le bien passe « En vente »', c: etapeDe('mandat').c, go: () => setFen({ k: 'mandat' }) });
    suite.push({ t: 'Le propriétaire renonce…', s: 'Retiré, gardé dans l’historique', c: etapeDe('retire').c, go: raison('retire', 'Le propriétaire renonce', 'Le bien passe « Retiré »') });
  }
  if (e === 'estimation') {
    suite.push({ t: 'Le mandat est signé…', s: 'Le bien passe « En vente »', c: etapeDe('mandat').c, go: () => setFen({ k: 'mandat' }) });
    /* V3.32 : le propriétaire veut attendre, sans renoncer. Le bien repasse
       « À suivre » ; l'estimation reste gardée, et l'on reprend d'un clic. */
    suite.push({ t: 'Le propriétaire veut attendre…', s: 'En attente : le bien repasse « À suivre »', c: etapeDe('a_suivre').c, go: raison('a_suivre', 'Mettre le projet en attente', 'Le bien repasse « À suivre »') });
    suite.push({ t: 'Le vendeur renonce…', s: 'Retiré, gardé dans l’historique', c: etapeDe('retire').c, go: raison('retire', 'Retirer de la vente', 'Le bien passe « Retiré »') });
  }
  if (e === 'mandat') {
    suite.push({ t: 'Une offre est arrivée…', s: 'Le bien passe « Sous offre »', c: etapeDe('offre').c, go: () => setFen({ k: 'offre' }) });
    suite.push({ t: 'Mettre la vente en pause…', s: 'Le vendeur fait une pause', c: etapeDe('suspendu').c, go: raison('suspendu', 'Mettre la vente en pause', 'Le bien passe « En pause »') });
    suite.push({ t: 'Changer le prix ou les honoraires…', s: 'Garde l’historique', c: '#8b5cf6', go: () => setFen({ k: 'prix' }) });
    suite.push({ t: 'Mandat terminé sans vente…', s: 'Expiré, retiré, vendu par un autre', c: etapeDe('retire').c, go: raison('retire', 'Mandat terminé sans vente', 'Le bien passe « Retiré »') });
  }
  /* V3.42 : un mandat noté par erreur (un test, le mauvais bien), ou le bien
     passé « En vente » avant la signature : il revient en arrière, sans
     passer par Supabase. */
  /* V3.130 (Alexandre : « ce n'est pas un mandat, c'est juste une annonce
     type… je ne sais pas où je change ») : l'annonce type ne se choisissait
     qu'à la création. Un bien en vente y passe ici — le mandat quitte la
     fiche, l'annonce reste diffusée (FenAnnulerMandat, `vers`). */
  if (e === 'mandat' || e === 'suspendu') {
    suite.push({ t: 'C’est une annonce type…', s: 'Pas un vrai mandat : juste une annonce à diffuser', c: etapeDe('annonce_type').c, go: () => setFen({ k: 'annulerMandat', vers: 'annonce_type' }) });
  }
  if (e === 'a_suivre' || e === 'estimation') {
    suite.push({ t: 'C’est une annonce type…', s: 'Pas un vrai bien à vendre : juste une annonce à diffuser', c: etapeDe('annonce_type').c, go: raison('annonce_type', 'En faire une annonce type', 'Le bien passe « Annonce type »') });
  }
  /* Un ancien mandat qu'on garde en ligne comme annonce type : le mandat
     fini quitte la fiche (il reste dans l'historique et dans Documents). */
  if (e === 'retire' && !bien.archive) {
    suite.push({ t: 'En faire une annonce type…', s: 'Pour la garder en ligne, sans mandat', c: etapeDe('annonce_type').c,
      go: txt(d, 'mandatDate') ? () => setFen({ k: 'annulerMandat', vers: 'annonce_type' }) : raison('annonce_type', 'En faire une annonce type', 'Le bien passe « Annonce type »') });
  }
  if (e === 'annonce_type') {
    suite.push({ t: 'Changer le prix…', s: 'Garde l’historique', c: '#8b5cf6', go: () => setFen({ k: 'prix' }) });
    suite.push({ t: 'C’est un vrai mandat…', s: 'Le mandat est signé : le bien passe « En vente »', c: etapeDe('mandat').c, go: () => setFen({ k: 'mandat' }) });
  }
  if (e === 'mandat' || e === 'suspendu') {
    suite.push(txt(d, 'mandatDate')
      ? { t: 'Annuler ce mandat…', s: 'Noté par erreur : il quitte la fiche', c: '#dc2626', go: () => setFen({ k: 'annulerMandat' }), danger: true }
      : { t: 'Le mandat n’est pas encore signé…', s: 'Le bien revient à l’estimation', c: etapeDe('estimation').c, go: () => setFen({ k: 'annulerMandat' }) });
  }
  if (e === 'offre') {
    suite.push({ t: 'Le compromis est signé…', s: 'Le bien passe « Sous compromis »', c: etapeDe('compromis').c, go: () => setFen({ k: 'compromis' }) });
    suite.push({ t: 'Une autre offre…', s: 'Elles s’affichent côte à côte', c: etapeDe('offre').c, go: () => setFen({ k: 'offre' }) });
    suite.push({ t: 'L’offre est tombée…', s: 'Le bien repasse « En vente »', c: etapeDe('mandat').c, go: () => setFen({ k: 'mandat' }) });
    /* V3.48 : directement depuis « Sous offre » (avant : deux étapes). */
    suite.push({ t: 'Le vendeur retire le bien…', s: 'Retiré, gardé dans l’historique', c: etapeDe('retire').c, go: raison('retire', 'Le vendeur retire le bien', 'Le bien passe « Retiré »') });
    suite.push({ t: 'Changer le prix ou les honoraires…', s: 'Garde l’historique', c: '#8b5cf6', go: () => setFen({ k: 'prix' }) });
  }
  if (e === 'compromis') {
    suite.push({ t: 'La vente est signée…', s: 'Le bien passe « Vendu »', c: etapeDe('vendu').c, go: () => setFen({ k: 'vendu' }) });
    /* V3.47 : sa propre fenêtre — le bien repasse en vente ou il est retiré,
       la recherche de l'acquéreur reprend, reste en pause ou s'arrête. */
    suite.push({ t: 'Le compromis est tombé…', s: 'En vente ou retiré ; et l’acquéreur ?', c: '#dc2626', go: () => setFen({ k: 'tombe' }) });
  }
  /* Retiré avant tout mandat (le vendeur avait renoncé à l'estimation) : on
     reprend l'estimation, ou le mandat est signé ; « Remettre en vente » ne
     voulait rien dire (V3.32). */
  const jamaisEnVente = e === 'retire' && !bien.en_vente_le && !txt(d, 'mandatDate');
  /* V3.50 : une estimation déjà faite (mise en attente, ou retirée avant le
     mandat) qu'on reprend : son ancien parcours partira dans l'historique. */
  const dejaEstime = (detail?.suivi || []).some(x => x.type === 'etape' && x.statut === 'estimation');
  const cycleAvant: CycleEstimation | null = (e === 'a_suivre' || e === 'retire') && dejaEstime && (txt(d, 'rdvEstimation') || txt(d, 'visiteLe') || txt(d, 'avisEnvoye'))
    ? { rdv: txt(d, 'rdvEstimation'), visite: txt(d, 'visiteLe'), avis: txt(d, 'avisEnvoye') } : null;
  if (jamaisEnVente) {
    suite.push({ t: 'Reprendre l’estimation…', s: 'Le bien repasse « Estimation »', c: etapeDe('estimation').c, go: () => setFen({ k: 'estimation' }) });
    suite.push({ t: 'Le mandat est signé…', s: 'Le bien passe « En vente »', c: etapeDe('mandat').c, go: () => setFen({ k: 'mandat' }) });
  } else if (e === 'suspendu' || e === 'retire') {
    suite.push({ t: 'Remettre en vente…', s: 'Le bien repasse « En vente »', c: etapeDe('mandat').c, go: () => setFen({ k: 'mandat' }) });
    if (e === 'suspendu') suite.push({ t: 'Mandat terminé sans vente…', s: 'Expiré, retiré, vendu par un autre', c: etapeDe('retire').c, go: raison('retire', 'Mandat terminé sans vente', 'Le bien passe « Retiré »') });
  }
  /* V3.47 : le bien revient à la vente, des années plus tard. */
  if (e === 'vendu') suite.push({ t: 'Une nouvelle vente de ce bien…', s: 'Nouvelle fiche, même description', c: etapeDe('estimation').c, go: () => setFen({ k: 'revente' }) });
  /* V3.50 : une date, un prix ou des honoraires de l'acte saisis à tort se
     corrigent, sans repasser par une étape (le chiffre d'affaires les lit). */
  if (e === 'vendu') suite.push({ t: 'Corriger l’acte…', s: 'La date, le prix, les honoraires', c: etapeDe('vendu').c, go: () => setFen({ k: 'vendu', correction: true }) });
  /* V3.79 : une annonce type se range quand elle ne sert plus. */
  if (e === 'vendu' || e === 'retire' || e === 'annonce_type') suite.push({ t: bien.archive ? 'Sortir des archives' : 'Archiver', s: bien.archive ? 'Il revient dans la liste' : 'Il quitte la liste, retrouvable dans « Archivés »', c: '#94a3b8', go: archiverBien });
  /* ── L'accompagnement (V3.48) ──
     Alexandre : « tout doit être bridé, mais je dois être accompagné : qu'un
     message me dise quoi faire ». Une visite, une offre, un changement de
     prix, un envoi aux acheteurs ou un archivage que l'étape ne permet pas
     ouvre FenGuide : ce qui se passe, et les gestes qui y mènent. Sous
     compromis ou en pause, on peut aussi continuer quand même. */
  type Geste = 'visite' | 'offre' | 'prix' | 'presenter' | 'archiver';
  const QUOI: Record<Geste, string> = { visite: 'organiser une visite', offre: 'noter une offre', prix: 'changer le prix', presenter: 'envoyer le bien à des acheteurs', archiver: 'l’archiver' };
  const garde = (quoi: Geste, go: () => void) => () => {
    const puis = (f: () => void) => () => { setGuide(null); f(); };
    const ch = {
      mandat: { l: 'Le mandat est signé…', s: 'Le bien passe « En vente »', ic: 'plume', c: '#059669', f: '#ecfdf5', go: puis(() => setFen({ k: 'mandat' })) },
      preparer: { l: 'Préparer le mandat', s: 'Dans Documents, prérempli avec le bien et le propriétaire', ic: 'doc', c: '#2d5c8f', f: '#eff4fb', go: puis(() => { void faireDocument({ modele: 'mandat_vente' }); }) },
      estim: { l: 'Définir l’estimation…', s: 'La fourchette et le prix conseillé', ic: 'euro', c: '#7c3aed', f: '#f5f3ff', go: puis(() => setFen({ k: 'estim' })) },
      remettre: { l: jamaisEnVente ? 'Le mandat est signé…' : 'Remettre en vente…', s: 'Le bien repasse « En vente »', ic: 'etiquette', c: '#059669', f: '#ecfdf5', go: puis(() => setFen({ k: 'mandat' })) },
      revente: { l: 'Une nouvelle vente de ce bien…', s: 'Nouvelle fiche, même description, nouveau propriétaire', ic: 'cle', c: '#7c3aed', f: '#f5f3ff', go: puis(() => setFen({ k: 'revente' })) },
      tombe: { l: 'Le compromis est tombé…', s: 'Le bien repasse en vente, ou il est retiré', ic: 'retour', c: '#dc2626', f: '#fef2f2', go: puis(() => setFen({ k: 'tombe' })) },
      offreTombee: { l: 'L’offre est tombée…', s: 'Le bien repasse « En vente »', ic: 'retour', c: '#dc2626', f: '#fef2f2', go: puis(() => setFen({ k: 'mandat' })) },
      termine: { l: 'Mandat terminé sans vente…', s: 'Expiré, retiré, vendu par un autre', ic: 'archive', c: '#b4532a', f: '#fdf2ec', go: puis(raison('retire', 'Mandat terminé sans vente', 'Le bien passe « Retiré »')) },
      renonce: { l: 'Le propriétaire renonce…', s: 'Retiré, gardé dans l’historique', ic: 'archive', c: '#b4532a', f: '#fdf2ec', go: puis(raison('retire', 'Le propriétaire renonce', 'Le bien passe « Retiré »')) },
      desarchiver: { l: 'Sortir des archives', s: 'Il revient dans la liste', ic: 'archive', c: '#475569', f: '#f8fafc', go: puis(() => { void archiverBien(); }) },
      continuer: { l: 'Continuer quand même', s: '', ic: 'fleche', c: '#475569', f: '#f8fafc', go: puis(go) },
    };
    const g = (titre: string, texte: string, choix: ChoixGuide[]) => setGuide({ titre, texte, choix });
    if (quoi === 'archiver') {
      if (p.archiver) return go();
      return g('Un bien en cours ne s’archive pas', `Archiver range un bien terminé. Celui-ci est « ${etapeDe(e).lib} » : s’il ne se vendra pas, passe-le d’abord « Retiré » ; il s’archivera ensuite.`,
        avant ? [ch.renonce] : e === 'offre' ? [ch.offreTombee] : e === 'compromis' ? [ch.tombe] : [ch.termine]);
    }
    if (bien.archive) return g('Ce bien est archivé', `Pour ${QUOI[quoi]}, sors-le d’abord des archives.`, [ch.desarchiver]);
    /* V3.79 : une annonce type sert à faire venir des acheteurs ; ni visite,
       ni offre, ni envoi ne se font sur elle. */
    if (e === 'annonce_type' && quoi !== 'prix') {
      return g('C’est une annonce type', `Elle sert à faire venir des acheteurs, sans montrer le vrai bien. Pour ${QUOI[quoi]}, passe par le vrai bien ou par la fiche de l’acheteur.`, []);
    }
    /* V3.112 : avant le mandat, présenter le bien reste possible (comme depuis
       la liste des biens, V3.111) — après un mot sur le prix. */
    if (avant && quoi === 'presenter') {
      return g('Ce bien n’est pas encore sous mandat', 'Tu peux déjà le présenter à un acheteur : il le verra sans prix (le prix conseillé de l’estimation reste entre toi et le vendeur). Le prix arrivera chez lui à la signature du mandat.',
        [{ ...ch.continuer, l: 'Le présenter quand même', s: 'Dans sa sélection, son espace ou par mail' }, ch.mandat]);
    }
    /* V3.146 (Alexandre : « si c'est en estimation ou à suivre, laisser la
       possibilité de quand même planifier la visite ») : avant le mandat, une
       visite se planifie au choix, comme une présentation (V3.112). Elle va
       dans l'agenda, la page Visites, l'historique du bien, et le Suivi de
       l'acheteur s'il est dans le CRM. */
    if (avant && quoi === 'visite') {
      return g('Ce bien n’est pas encore sous mandat', 'Tu peux quand même organiser la visite : elle va dans l’agenda, la page Visites et l’historique du bien. Avec un acheteur suivi, le bien entre dans son dossier, sans prix tant que le mandat n’est pas signé.',
        [{ ...ch.continuer, l: 'Planifier la visite quand même', s: 'Un acheteur suivi, ou quelqu’un hors du CRM' }, ch.mandat]);
    }
    if (avant) {
      return quoi === 'prix'
        ? g('Ce bien n’est pas encore en vente', 'Avant le mandat, c’est l’estimation qui donne le prix conseillé. Le prix affiché se fixe à la signature du mandat.', [ch.estim, ch.mandat])
        : g('Ce bien n’est pas encore en vente', `Pour ${QUOI[quoi]}, il faut d’abord le mandat signé : les visites, les offres et les envois aux acheteurs viennent après.`, [ch.mandat, ch.preparer]);
    }
    if (e === 'vendu') {
      return quoi === 'prix'
        ? g(`Ce bien a été vendu${bien.vendu_le ? ` le ${dateLongue(bien.vendu_le)}` : ''}`, 'Le prix est celui de l’acte : il ne change plus. Si le bien revient à la vente, la nouvelle fiche aura son propre prix.', [ch.revente])
        : g(`Ce bien a été vendu${bien.vendu_le ? ` le ${dateLongue(bien.vendu_le)}` : ''}`, `Pour ${QUOI[quoi]}, il faut une nouvelle vente de ce bien : une nouvelle fiche, avec le nouveau propriétaire. Cette vente-ci reste telle quelle.`, [ch.revente]);
    }
    if (e === 'retire') return g('Ce bien est retiré de la vente', `Pour ${QUOI[quoi]}, remets-le d’abord en vente.`, [ch.remettre]);
    if (e === 'compromis') {
      const t = quoi === 'offre' ? 'Une offre de secours reste possible : elle se note à côté, sans toucher au compromis.'
        : quoi === 'visite' ? 'Une visite reste possible (une contre-visite de l’acquéreur, un acheteur de secours). Si le compromis est tombé, dis-le d’abord : le bien repassera en vente.'
          : quoi === 'prix' ? 'Le prix de vente est celui du compromis (« Modifier » sur sa carte). Changer le prix affiché ne touche pas au compromis.'
            : 'Les acheteurs verront le bien « Sous compromis ». Si le compromis est tombé, dis-le d’abord.';
      return g('Le bien est sous compromis', t, [{ ...ch.continuer, s: quoi === 'offre' ? 'Noter l’offre de secours' : '' }, ch.tombe]);
    }
    if (e === 'suspendu') return g('La vente est en pause', `Pour ${QUOI[quoi]}, tu peux la remettre en vente, ou continuer quand même.`, [ch.remettre, ch.continuer]);
    go();
  };
  const ouvrirVisite = garde('visite', () => setFen({ k: 'visite' }));
  /* V3.139 (Alexandre : « envoyer ce bien, à côté de Modifier ; un pop-up avec
     les différents choix ») : la fenêtre d'envoi de « Un autre client… »
     (LotBiens) — un client du CRM par son nom ou son téléphone, ou une
     adresse e-mail hors du CRM. En vente, ou avant le mandat (sans prix) ;
     pas en pause, vendu, retiré, ni pour une annonce type. */
  const envoyable = ['vente', 'avant'].includes(modeAcheteurs(e)) && e !== 'annonce_type';
  const ouvrirEnvoi = garde('presenter', () => setEnvoiAutre(true));
  /* Les visites encore prévues : la vente, le retrait, la pause proposent de les annuler. */
  const prevues = visites.filter(v => v.statut === 'a_venir' && !passee(v)).map(v => ({ qui: v.qui, le: v.ymd }));
  const ouvrirOffre = garde('offre', () => setFen({ k: 'offre' }));

  const et = etapeDe(e);
  /* V3.50 : le point vendeur, pendant la vente seulement (en vente, sous
     offre, sous compromis) — pas sur un bien vendu, retiré ou archivé. */
  const pointVendeur = (e === 'mandat' || e === 'offre' || e === 'compromis') && !bien.archive;
  const visitesAVenir = visites.filter(v => v.statut === 'a_venir' && !passee(v));
  /* La prochaine, pour la carte « Visites et offres » (V3.32). */
  const prochaineVisite = (() => {
    const x = [...visitesAVenir].sort((p, q) => `${p.ymd}${p.heure || ''}`.localeCompare(`${q.ymd}${q.heure || ''}`))[0];
    if (!x) return '';
    const jd = new Date(`${x.ymd}T12:00:00`);
    const jour = isNaN(jd.getTime()) ? '' : jd.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    return [jour, x.heure ? x.heure.replace(':', ' h ').replace(/ 00$/, '') : '', x.qui].filter(Boolean).join(' · ');
  })();
  const nbVisites = visites.filter(v => v.statut !== 'annulee').length;
  const offresOuvertes = offres.filter(o => o.statut === 'en_attente' || o.statut === 'contre');
  const docsLies = detail?.docs || [];
  /* Où en sont les signatures (V3.32) : qui a signé, qui on attend, pour les
     documents partis en signature. Relu après un geste (lien renvoyé…). */
  const [suivisLus, setSuivisLus] = useState<{ cle: string; s: Record<string, Suivi> }>({ cle: '', s: {} });
  const [tourSuivis, setTourSuivis] = useState(0);
  const cleSuivis = docsLies.filter(x => x.statut === 'pret' && x.signature).map(x => x.id).join(',');
  useEffect(() => {
    if (!cleSuivis) return;
    let vivant = true;
    lireSuivis({ docs: docsLies as unknown as DocumentRow[] })
      .then(r => { if (vivant) setSuivisLus({ cle: cleSuivis, s: r }); }, e => { if (vivant) setMessage({ t: (e as Error).message, ok: false }); });
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleSuivis, tourSuivis]);
  const suivis = cleSuivis && suivisLus.cle === cleSuivis ? suivisLus.s : {};
  const nbPhotos = lirePhotos(d.photos).length;
  const avant = avantMandat(e);
  /* V3.81 : la pastille du propriétaire et les gestes du bien partagent une
     ligne. Trop étroite pour tous les boutons (la pastille garde 200 px),
     Modifier, Visite, Note et Point vendeur passent dans « ⋯ », où ils sont
     déjà. La largeur des gestes se mesure quand ils sont tous visibles.
     V3.99 : l'étape et la diffusion rejoignent la pastille. Trop serré, en
     deux temps : d'abord la diffusion dit « En ligne » au lieu de
     « Diffusion en cours » (1), puis Modifier et Note gardent leur icône (2). */
  const cheval = useRef<HTMLDivElement>(null);
  const largeurGestes = useRef({ plein: 0, gain: 0 });
  const [serre, setSerre] = useState<0 | 1 | 2>(0);
  useLayoutEffect(() => {
    const el = cheval.current;
    if (!el) return;
    const mesurer = () => {
      const g = el.querySelector<HTMLElement>('[data-gestes]');
      const st = el.querySelector<HTMLElement>('[data-statut]');
      if (!g) return;
      if (!el.dataset.serre) {
        const long = el.querySelector<HTMLElement>('[data-dlong]')?.offsetWidth || 0;
        largeurGestes.current = { plein: g.scrollWidth + (st ? st.scrollWidth + 12 : 0), gain: Math.max(0, long - 60) };
      }
      const { plein, gain } = largeurGestes.current;
      /* La pastille du propriétaire garde son nom entier tant qu'il tient en
         340 px : sa largeur, plus ce que les points de suite cachent. */
      const pastille = el.querySelector<HTMLElement>(`.${b.proprioCheval}`);
      const nom = el.querySelector<HTMLElement>(`.${b.pProprioTx} > b`);
      const proprioPlein = pastille ? pastille.offsetWidth + (nom ? nom.scrollWidth - nom.clientWidth : 0) : 212;
      const dispo = el.clientWidth - Math.min(340, Math.max(212, proprioPlein)) - 12;
      setSerre(plein <= dispo ? 0 : plein - gain <= dispo ? 1 : 2);
    };
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, [avant, pointVendeur, e, diff.ton, diff.supports.length]);
  /* L'ordre voulu par Alexandre (V3.30) : Vue d'ensemble, Photos, Le bien,
     Surfaces, puis Acheteurs, Documents, Historique. V3.91 (« il y a beaucoup
     d'onglets ») : sept au lieu de huit — « Vue d'ensemble » devient
     « Résumé », Surfaces passe dans le tiroir de « Le bien ». */
  const ONGLETS: { k: Onglet; l: string; n?: number; ic: string }[] = [
    { k: 'apercu', l: 'Résumé', ic: 'oeil' }, { k: 'photos', l: 'Photos', n: nbPhotos, ic: 'photo' }, { k: 'bien', l: 'Le bien', ic: 'maison' },
    /* V3.146 : avant le mandat, l'onglet vient dès qu'une visite a été planifiée. */
    ...((avant && !visites.length) || e === 'annonce_type' ? [] : [{ k: 'visites' as Onglet, l: 'Visites et offres', n: nbVisites + offres.length, ic: 'cle' }]),
    /* V3.126 : sans chiffre — le compte en chiffres (avant toute relecture)
       contredisait le résultat du rapprochement (Alexandre : « rien affiché »). */
    { k: 'acheteurs', l: 'Rapprochement', ic: 'cible' },
    { k: 'documents', l: 'Documents', n: docsLies.length, ic: 'plume' }, { k: 'historique', l: 'Historique', ic: 'historique' },
  ];

  const blocNotes = <BlocObservations d={d} onModifier={() => onModifier('observations')} />;

  /* ── La Vue d'ensemble (V3.29) : les quatre cartes, puis le détail ── */
  const mode = modeAcheteurs(e);
  const persP = (Array.isArray(d.proprietaires) ? d.proprietaires : []) as Record<string, string>[];
  /* Il agit pour une société (V3.32) : la personne en titre, et dessous
     « Associée de la SCI AVIENA » — sa société vient du bien (« Une SCI ») ou
     de sa fiche (« Sa société »). */
  const structP = proprio ? lireStructure(lirePro(proprio.pro).structure) : null;
  const socP = (d.qui === 'sci' && txt(d, 'sciNom')) || structP?.denomination || '';
  const p0 = persP.find(p => p && (p.prenom || p.nom));
  const personneP = proprio ? nomClient(proprio) : p0 ? [p0.prenom, p0.nom].filter(Boolean).join(' ') : '';
  const pourP = socP && personneP ? { nom: socP, role: (structP?.qualite || '').split(/[,·(]/)[0].trim() } : null;
  const nomP = pourP ? personneP : nomProprio(d) || (proprio ? nomClient(proprio) : '');
  const telP = proprio?.telephones?.[0] || persP.find(p => p?.telephone)?.telephone || '';
  const plurielP = d.qui === 'couple' || d.qui === 'indivision' || persP.filter(p => p && (p.nom || p.prenom)).length > 1;
  /* Une société qui vend : on dit qui est l'interlocuteur (V3.30). */
  const interlocuteur = !pourP && d.qui === 'sci' && proprio && nomP !== nomClient(proprio) ? `${proprio.civilite === 'Madame' ? 'Interlocutrice' : 'Interlocuteur'} : ${nomClient(proprio)}` : '';
  const motifP = [lib(d, 'motif'), lib(d, 'delai')].filter(Boolean).join(' · ');
  const sousP = interlocuteur || (recherchesProprio.length ? (plurielP ? 'cherchent aussi à acheter' : 'cherche aussi à acheter') : motifP);
  const mailP = proprio?.emails?.[0] || persP.find(p => p?.email)?.email || '';
  /* Ce que disait le bloc « Le propriétaire » du bas (retiré en V3.31) ; dans
     le panneau de la pastille depuis la V3.54. */
  const plusP = [sousP !== motifP ? motifP : '', lib(d, 'origine') ? `Venu par : ${lib(d, 'origine').toLowerCase()}` : '', txt(d, 'notaire') ? `Notaire : ${txt(d, 'notaire')}` : ''].filter(Boolean).join(' · ');
  /* « Retirer du bien » (V3.31) : comme dans l'éditeur, le bien n'a plus de
     propriétaire (ni fiche reliée, ni nom, ni coordonnées) ; sa fiche reste
     dans les contacts. V3.54 : depuis la croix de la pastille, qui a déjà
     demandé confirmation ; elle repasse aussitôt à « À renseigner ». */
  const retirerProprio = () => {
    setBien(prev => {
      const donnees = { ...(prev.donnees || {}), clientId: '', proprietaires: [], proprioNouveau: false, proprioSans: false, qui: '', sciNom: '' };
      const n = { ...prev, client_id: null, donnees };
      enregistrerDansLOrdre(n.id, donnees, prev.donnees || {});
      return n;
    });
  };
  /* « Créer sa fiche » (V3.54), depuis la pastille : un propriétaire saisi sur
     le bien sans fiche dans les contacts (les biens d'avant la V3.30) devient
     un contact « vendeur », relié au bien — comme « Créer sa fiche » dans
     l'éditeur. S'il y est déjà (même e-mail, même téléphone, mêmes prénom et
     nom), on propose de relier celui-là plutôt que d'en créer un second.
     L'enregistrement attendu, la liste se relit : la pastille passe à
     « Sa fiche ». */
  const p0Saisi = lirePersonnes(d.proprietaires).find(x => x.nom || x.prenom) || null;
  const creerFicheProprioBien = async () => {
    if (!p0Saisi) { onModifier('proprio'); return; }
    const net = { ...p0Saisi, prenom: p0Saisi.prenom.trim(), nom: p0Saisi.nom.trim(), telephone: p0Saisi.telephone.trim(), email: p0Saisi.email.trim().toLowerCase() };
    const qui = [net.prenom, net.nom].filter(Boolean).join(' ');
    try {
      const deja = doublonsContact(Object.values(liste.clients), net)[0] || null;
      let c: ClientMini;
      let relie = false;
      if (deja && confirm(`${nomClient(deja)} est déjà dans tes contacts${[deja.telephones?.[0], deja.emails?.[0]].filter(Boolean).length ? ` (${[deja.telephones?.[0], deja.emails?.[0]].filter(Boolean).join(' · ')})` : ''}.\n\nRelier sa fiche à ce bien, plutôt que d’en créer une seconde ?`)) {
        c = deja; relie = true;
      } else {
        if (deja && !confirm(`Créer quand même une nouvelle fiche pour ${qui} ?`)) return;
        c = await creerFicheProprio(net);
      }
      const avantD = bien.donnees || {};
      setBien(prev => ({ ...prev, client_id: c.id, donnees: { ...(prev.donnees || {}), clientId: c.id, proprioNouveau: false, proprioSans: false } }));
      enregistrerDansLOrdre(bien.id, { ...avantD, clientId: c.id, proprioNouveau: false, proprioSans: false }, avantD);
      await file.current;
      /* V3.137 : son type suit l'étape du bien (Vendeur s'il est en vente,
         Propriétaire sinon) — une fois le bien relié, pas avant. */
      await marquerVendeur(c.id);
      onRecharger();
      setMessage({ t: relie ? `La fiche de ${nomClient(c)} est reliée à ce bien.` : `La fiche de ${nomClient(c)} est créée dans tes contacts et reliée à ce bien.`, ok: true });
    } catch (e) { setMessage({ t: (e as Error).message, ok: false }); }
  };
  const faites = visites.filter(v => v.statut !== 'annulee' && passee(v));
  const compte = (x: Issue | null) => faites.filter(v => v.issue === x).length;
  const pl = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);
  const repartition: Repartition = [
    { n: compte('offre'), c: ISSUES.offre.couleur, l: pl(compte('offre'), 'veut faire une offre', 'veulent faire une offre') },
    { n: compte('revoir'), c: ISSUES.revoir.couleur, l: 'à revoir' },
    { n: compte('reflexion'), c: ISSUES.reflexion.couleur, l: 'en réflexion' },
    { n: compte('non'), c: ISSUES.non.couleur, l: pl(compte('non'), 'pas pour lui', 'pas pour eux') },
    { n: compte(null), c: '#dfe5ee', l: pl(compte(null), 'compte rendu à faire', 'comptes rendus à faire') },
  ];
  const noteDe = (rechercheId: string | null) => acheteurs.find(x => x.recherche.id === rechercheId)?.corr.note;
  const versProchaine = (v: VisiteU, etat: string, ton: ProchaineVisite['ton']): ProchaineVisite => {
    const n = noteDe(v.rechercheId);
    return {
      cle: v.cle, ymd: v.ymd, heure: v.heure, qui: v.qui, clientId: v.clientId, etat, ton,
      sous: v.source === 'crm' ? `Acheteur suivi${n ? ` · ${n} % de ses critères` : ''}` : 'Hors CRM',
    };
  };
  const prochaines: ProchaineVisite[] = [
    ...[...visitesAVenir].reverse().slice(0, 3).map(v => versProchaine(v, 'À venir', 'bleu')),
    ...faites.filter(v => !v.issue && v.statut !== 'faite').slice(0, 2).map(v => versProchaine(v, 'Compte rendu à faire', 'or')),
  ].slice(0, 4);
  const TEINTE: Record<string, string> = { ic_or: '#c9a84c', ic_vert: '#16a34a', ic_bleu: '#2563eb', ic_violet: '#7c3aed', ic_rouge: '#dc2626', ic_gris: '#94a3b8', ic_emilio: '#34496e' };
  const recents: Recent[] = evts.slice(0, 4).map(x => {
    const det = (x.detail || '').split('\n')[0];
    return { cle: x.cle, le: x.le, titre: x.titre, c: TEINTE[x.ton] || '#94a3b8', detail: det.length > 90 ? `${det.slice(0, 88)}…` : det || undefined };
  });
  /* Les dossiers où le bien est, sans que l'acheteur soit dans la liste (sa
     recherche a changé, ou il n'est plus actif). */
  const horsListe = (detail?.copies || []).filter(c => !acheteurs.some(x => x.recherche.id === c.recherche_id && x.corr.note >= SEUIL_LISTE));

  /* ── Visites et offres (V3.29, OngletsBien.tsx) ── */
  const visitesCartes: VisiteCarte[] = visites.map(v => {
    const dl = (v.libre?.donnees || {}) as Record<string, unknown>;
    const et = typeof v.crm?.note_etoiles === 'number' ? v.crm.note_etoiles : typeof dl.etoiles === 'number' ? dl.etoiles : null;
    return {
      cle: v.cle, ymd: v.ymd, heure: v.heure, qui: v.qui, source: v.source, statut: v.statut, issue: v.issue, commentaire: v.commentaire,
      passee: passee(v), note: v.source === 'crm' ? noteDe(v.rechercheId) ?? null : null, etoiles: et ? Math.max(0, Math.min(5, Math.round(et))) : null,
    };
  });
  const rangOffre = (x: SuiviVente) => (x.statut === 'en_attente' || x.statut === 'contre' || !x.statut ? 0 : x.statut === 'acceptee' ? 1 : 2);
  const offresTriees = [...offres].sort((x, y) => rangOffre(x) - rangOffre(y) || y.le.localeCompare(x.le));

  /* ── Documents de la vente (V3.32) ──
     Alexandre : « Mandat signé, et il est dans les documents à signer ? Je
     ne comprends pas le workflow. » Les tuiles côte à côte ne disaient pas
     l'ordre, ni ce qui était fait. Désormais une liste, dans l'ordre de la
     vente — le mandat, les bons de visite, les offres, le compromis —, et pour
     chacun : fait (vert), à faire (or), en cours, ou plus tard (gris), avec
     ses boutons. */
  const docsDe = (m: string) => docsLies.filter(x => x.modele === m);
  const mandats = docsDe('mandat_vente');
  /* Le mandat en route (V3.32) : parti en signature d'abord, sinon celui en
     préparation. Un mandat annulé n'est plus « en préparation ». */
  const mandatEnRoute = mandats.find(x => x.statut === 'pret') || mandats.find(x => x.statut === 'brouillon') || null;
  const suiviMandat = mandatEnRoute ? suivis[mandatEnRoute.id] : undefined;
  const prevuMandat = mandatEnRoute ? modeSignature((mandatEnRoute.donnees || {}) as Record<string, unknown>) : 'papier';
  /* Un mandat signé puis annulé ne compte plus (V3.42). */
  const mandatSigne = mandats.find(x => x.signe_le && x.statut === 'signe') || null;
  const signeLe = mandatSigne?.signe_le || txt(d, 'mandatDate');
  const typeMandat = d.mandatType ? (NOM_MANDAT[String(d.mandatType)] || '').toLowerCase() : '';
  const enMandat = !avant && !!signeLe;
  const finMandat = txt(d, 'mandatFin');
  const jFin = joursAvant(finMandat);
  const argent = argentBien(d);
  const detailMandat = [
    txt(d, 'mandatNumero') || bien.mandat_numero ? `N° ${txt(d, 'mandatNumero') || bien.mandat_numero}` : '',
    finMandat ? `jusqu’au ${dateCourte(finMandat)}${jFin !== null ? (jFin >= 0 ? ` (dans ${jFin} j)` : ' (terminé)') : ''}` : '',
    argent.hono !== null ? `honoraires ${euros(argent.hono)} TTC, à la charge ${argent.acq ? 'de l’acquéreur' : 'du vendeur'}` : '',
  ].filter(Boolean).join(' · ');
  /* Les annulés ne comptent plus (V3.32). */
  const vivants = (l: DocLie[]) => l.filter(x => x.statut !== 'annule');
  const parDate = (p: DocLie, q: DocLie) => p.created_at.localeCompare(q.created_at);
  const offresDocs = vivants(docsDe('offre_achat'));
  /* V3.45 : le document de chaque offre — relié par `offreSuiviId` ; ceux
     d'avant, par l'acquéreur et le montant. */
  const docDeLOffre = (o: SuiviVente): DocLie | null => {
    const relies = offresDocs.filter(x => x.donnees?.offreSuiviId === o.id).sort((p, q) => q.created_at.localeCompare(p.created_at));
    if (relies.length) return relies[0];
    return offresDocs.find(x => !x.donnees?.offreSuiviId && !!o.montant && Number(x.donnees?.prix) === o.montant && (!o.client_id || x.client_id === o.client_id)) || null;
  };
  const docOffre = (x: DocLie): DocOffre => {
    const sv = suivis[x.id];
    return {
      etat: x.statut === 'signe' ? 'signe' : x.statut === 'pret' ? 'pret' : 'prepa',
      detail: x.statut === 'signe' ? `Signée le ${dateAn(x.signe_le || x.updated_at)}`
        : x.statut === 'pret' ? (sv ? sv.titre : 'Prête, à faire signer à l’acquéreur') : `Commencée le ${dateAn(x.created_at)}`,
      onOuvrir: () => ouvrirDoc(x.id),
      onPdf: x.statut === 'signe' && x.signe_chemin ? () => { void ouvrirSigne(x); } : undefined,
    };
  };
  /* Le compromis signé sur cette offre : ses dates, et la vente. */
  const lignesCompromis = (detail?.suivi || []).filter(x => x.type === 'etape' && x.statut === 'compromis').sort((p, q) => q.le.localeCompare(p.le));
  /* V3.47 : la vente signée (le bandeau), l'acquéreur retenu (une nouvelle vente le propose comme propriétaire). */
  const ligneVendu = (detail?.suivi || []).filter(x => x.type === 'etape' && x.statut === 'vendu').sort((p, q) => q.le.localeCompare(p.le))[0] || null;
  const offreRetenue = (() => {
    const id = (lignesCompromis[0]?.donnees as Record<string, unknown> | undefined)?.offre;
    const acc = offres.filter(y => y.statut === 'acceptee');
    return offres.find(y => y.id === id) || (acc.length === 1 ? acc[0] : null);
  })();
  const vs = (d as Record<string, unknown>).venteSuivante as { id?: string; reference?: string | null } | undefined;
  const venteSuivante = vs?.id && liste.biens.some(x => x.id === vs.id) ? { id: vs.id, reference: vs.reference || null } : null;
  const compromisDe = (o: SuiviVente): InfosCompromis | null => {
    if (e !== 'compromis' && e !== 'vendu') return null;
    /* Le dernier compromis seulement : un compromis tombé puis refait sur
       une autre offre ne doit pas laisser deux cartes « Compromis signé ». */
    const l = lignesCompromis[0];
    if (!l || (l.donnees?.offre ? l.donnees.offre !== o.id : offres.filter(y => y.statut === 'acceptee').length !== 1)) return null;
    const c = (l.donnees || {}) as Record<string, unknown>;
    const t = (k: string) => (typeof c[k] === 'string' && c[k] ? String(c[k]) : undefined);
    /* Les notaires (V3.45) : les contacts choisis ; sinon le texte d'avant
       (« Son notaire » du bien, le notaire de l'acquéreur écrit à la main). */
    const carte = (role: NotaireCarte['role'], n: NotaireChoisi | null): NotaireCarte | null => {
      if (!n) return null;
      const vif = n.id ? liste.clients[n.id] : null;
      return {
        role, nom: n.nom, etude: n.etude, tel: (vif?.telephones || []).find(Boolean) || n.tel, email: (vif?.emails || []).find(Boolean) || n.email,
        onFiche: n.id ? () => ouvrirClient(n.id!) : undefined,
      };
    };
    const notaires = [
      carte('vendeur', lireNotaire(c.notaireVendeur) || (txt(d, 'notaire') ? { id: null, nom: txt(d, 'notaire') } : null)),
      carte('acquereur', lireNotaire(c.notaireAcquereur) || (t('notaireAcq') ? { id: null, nom: t('notaireAcq')! } : null)),
    ].filter((x): x is NotaireCarte => !!x);
    const ids = (c.rappels && typeof c.rappels === 'object' ? c.rappels : {}) as Record<string, unknown>;
    const dates = (c.rappelsLe && typeof c.rappelsLe === 'object' ? c.rappelsLe : {}) as Record<string, unknown>;
    const rappels = Object.keys(ids).filter(k => typeof dates[k] === 'string').map(k => ({ cle: k, le: String(dates[k]) })).sort((p, q) => p.le.localeCompare(q.le));
    const chemin = t('chemin');
    return {
      signe: t('signe') || l.le.slice(0, 10), sru: t('sru'), pretLimite: t('pretLimite'), acte: t('acte'), prix: typeof c.prix === 'number' ? c.prix : null,
      venduLe: e === 'vendu' ? bien.vendu_le : null, hono: typeof c.hono === 'number' ? c.hono : null, notaires, rappels,
      piece: chemin ? String(c.nom || 'compromis.pdf') : undefined,
      onPiece: chemin ? () => ouvrirPiece(chemin, String(c.nom || 'compromis.pdf')) : undefined,
      onJoindre: f => { void joindreLeCompromis(l, f); },
      onCompleter: () => setFen({ k: 'compromis', existant: l }),
    };
  };
  /* Corriger une offre : l'acquéreur déjà choisi. */
  const choixPour = (o: SuiviVente): ChoixA => {
    const opt = o.client_id ? options.find(y => y.clientId === o.client_id && (!o.recherche_id || y.rechercheId === o.recherche_id)) : undefined;
    if (opt) return { mode: 'crm', o: opt };
    if (o.client_id) return { mode: 'crm', o: { cle: 'c-' + o.client_id, clientId: o.client_id, rechercheId: o.recherche_id, nom: o.qui || 'Acquéreur', sous: 'L’acquéreur de cette offre' } };
    return { mode: 'libre', nom: o.qui || '', tel: '' };
  };
  const bons = vivants(docsDe('bon_visite'));
  /* Le récapitulatif de chaque étape (V3.32) : ses documents dans l'ordre,
     l'avenant sous son mandat, chacun avec son état. */
  const maillon = (x: DocLie, titre: string, o: { retrait?: boolean; avant?: string } = {}): MaillonDoc => {
    const sv = suivis[x.id];
    const mode = x.signature?.mode === 'en_ligne' ? 'en ligne' : x.signature?.mode === 'sur_place' ? 'sur place' : 'à la main';
    const etat = x.statut === 'signe' ? `signé le ${dateCourte(x.signe_le || x.updated_at)}, ${mode}`
      : x.statut === 'pret' ? (sv ? sv.titre.toLowerCase() : x.signature ? 'en signature' : 'prêt, à faire signer') : 'en préparation';
    /* V3.55 : signé à la main, l'exemplaire pas encore déposé. */
    const manque = exemplaireManquant(x as unknown as DocumentRow) ? 'exemplaire signé à déposer' : '';
    const detail = [o.avant || '', etat, manque].filter(Boolean).join(' · ');
    return {
      id: x.id, titre, retrait: o.retrait, detail: detail.charAt(0).toUpperCase() + detail.slice(1),
      etat: x.statut === 'signe' ? 'signe' : x.statut === 'pret' ? 'attente' : 'prepa',
      onOuvrir: () => ouvrirDoc(x.id),
      onPdf: x.statut === 'signe' && x.signe_chemin ? () => { void ouvrirSigne(x); } : undefined,
    };
  };
  /* Ce qu'un avenant change : « prix 829 000 €, honoraires, jusqu'au 15 mars ». */
  const changeAvenant = (x: DocLie) => {
    const dd = (x.donnees || {}) as Donnees;
    const obj = Array.isArray(dd.objets) ? (dd.objets as string[]) : [];
    return [
      obj.includes('prix') && num(dd, 'nouveauPrix') ? `prix ${euros(num(dd, 'nouveauPrix') as number)}` : obj.includes('prix') ? 'prix' : '',
      obj.includes('honoraires') ? (dd.honoMode2 === 'forfait' && num(dd, 'forfait2') ? `honoraires ${euros(num(dd, 'forfait2') as number)}` : 'honoraires') : '',
      obj.includes('duree') && txt(dd, 'finNouvelle') ? `jusqu’au ${dateCourte(txt(dd, 'finNouvelle'))}` : obj.includes('duree') ? 'durée' : '',
      obj.includes('bien') ? 'le bien' : '', obj.includes('engagements') ? 'tes actions' : '', obj.includes('autre') ? 'autre' : '',
    ].filter(Boolean).join(', ');
  };
  const mandatsVivants = vivants(mandats).sort(parDate);
  const suitesMandat = vivants([...docsDe('avenant_vente'), ...docsDe('courrier_reconduction')]).sort(parDate);
  const chaineMandat: MaillonDoc[] = [
    ...mandatsVivants.map(x => maillon(x, `Mandat${x.numero ? ` n° ${x.numero}` : ''}`)),
    ...suitesMandat.map(x => x.modele === 'avenant_vente'
      ? maillon(x, `Avenant n° ${num((x.donnees || {}) as Donnees, 'avenantNo') || 1}`, { retrait: mandatsVivants.length > 0, avant: changeAvenant(x) })
      : maillon(x, 'Courrier de reconduction', { retrait: mandatsVivants.length > 0 })),
  ];
  const sansPrefixe = (t: string | null, p: RegExp) => (t || '').replace(p, '').trim();
  const bonsSignes = bons.filter(x => x.signe_le).length;
  const nbSt = (k: string) => offres.filter(x => (x.statut || 'en_attente') === k).length;
  const resumeOffres = [
    nbSt('en_attente') + nbSt('contre') ? `${nbSt('en_attente') + nbSt('contre')} en attente de réponse` : '',
    nbSt('acceptee') ? `${nbSt('acceptee')} acceptée${nbSt('acceptee') > 1 ? 's' : ''}` : '',
    nbSt('refusee') ? `${nbSt('refusee')} refusée${nbSt('refusee') > 1 ? 's' : ''}` : '',
    nbSt('retiree') ? `${nbSt('retiree')} retirée${nbSt('retiree') > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ');
  /* V3.48 : le compromis en cours seulement — un compromis tombé ne compte plus. */
  const signeC = (lignesCompromis[0]?.donnees as Record<string, unknown> | undefined)?.signe;
  const compromisLe = e === 'compromis' || e === 'vendu' ? (typeof signeC === 'string' && signeC) || lignesCompromis[0]?.le || '' : '';
  const accepte = offres.some(x => x.statut === 'acceptee');
  const compromisSigne = e === 'compromis' || e === 'vendu';
  /* Comment le mandat a été signé, et où retrouver l'exemplaire signé (V3.32). */
  const modeSig = mandatSigne?.signature?.mode;
  const fichierMandat = (d.mandatFichier && typeof d.mandatFichier === 'object' ? d.mandatFichier : null) as { chemin?: string; nom?: string } | null;
  const commentSigne = mandatSigne
    ? modeSig === 'en_ligne' ? 'Signature électronique' : modeSig === 'sur_place' ? 'Signé sur la tablette' : 'Signé à la main'
    : fichierMandat?.chemin ? 'Signé hors du CRM · scan joint' : 'Signé hors du CRM';
  const telechargeMandat = mandatSigne?.signe_chemin ? () => { void ouvrirSigne(mandatSigne); }
    : fichierMandat?.chemin ? () => { void ouvrirPiece(String(fichierMandat.chemin), String(fichierMandat.nom || 'mandat-signe.pdf')); } : null;
  /* V3.55 : signé à la main dans Documents, son exemplaire pas encore déposé
     (ni scan joint au bien). */
  const mandatSansExemplaire = !!mandatSigne && !telechargeMandat && exemplaireManquant(mandatSigne as unknown as DocumentRow);
  /* « Déjà signé ? » (V3.48) : avant la mise en vente, la fenêtre du mandat
     (le bien passe « En vente ») ; plus loin (sous offre, compromis, vendu,
     en pause), on note seulement le mandat dans la fiche — l'étape ne bouge
     pas. Avant, la fenêtre du mandat ramenait un bien sous compromis « En vente ». */
  const dejaSigne = avant || e === 'mandat' || (e === 'retire' && !bien.en_vente_le) ? () => setFen({ k: 'mandat' }) : () => onModifier('prix:t-mandat');
  const etapesDocs: EtapeDoc[] = [
    enMandat || mandatSigne ? {
      k: 'mandat', ic: 'plume', titre: 'Le mandat de vente', etat: 'fait', puce: commentSigne,
      statut: `Signé le ${dateCourte(signeLe)}${typeMandat ? ` · ${typeMandat}` : ''}`,
      detail: [detailMandat, !telechargeMandat && !mandatSigne ? 'Joins le scan du mandat signé pour le retrouver ici.' : '',
        mandatSansExemplaire ? 'Exemplaire signé à déposer : garde-le ici, avec le mandat.' : ''].filter(Boolean).join(' · ') || undefined,
      actions: <>
        {telechargeMandat && <BoutonAct marine onClick={telechargeMandat}><Ic n="telecharger" t={13} />Le mandat signé</BoutonAct>}
        {mandatSansExemplaire && <BoutonAct or onClick={() => setDepotSigne(mandatSigne as unknown as DocumentRow)}><Ic n="trombone" t={13} />Déposer l’exemplaire signé</BoutonAct>}
        {mandats.length > 0 && <BtnTuile onClick={() => ouvrirDoc((mandatSigne || mandats[0]).id)}>Voir dans Documents</BtnTuile>}
        {/* Signé ailleurs : le scan, pour pouvoir le retélécharger. */}
        {!mandatSigne && <BtnTuile onClick={() => champMandat.current?.click()}>{depotMandat ? 'Envoi…' : fichierMandat?.chemin ? 'Remplacer le scan' : <><Ic n="trombone" t={12} />Joindre le mandat signé</>}</BtnTuile>}
        {/* Signé dans le CRM mais pas encore noté : le bien passe en vente. */}
        {avant && <BoutonAct or onClick={() => setFen({ k: 'mandat' })}>Passer le bien en vente</BoutonAct>}
        {!avant && !mandats.length && <BtnTuile onClick={() => onModifier('prix:t-mandat')}>Modifier</BtnTuile>}
        {/* Noté par erreur (V3.42) : il quitte la fiche. */}
        {!mandatSigne && ['mandat', 'suspendu'].includes(e) && <BtnTuile onClick={() => setFen({ k: 'annulerMandat' })}>Annuler ce mandat</BtnTuile>}
      </>,
      /* Le mandat, puis ses avenants (V3.32). */
      suite: suitesMandat.length ? <ChaineDocs items={chaineMandat} /> : undefined,
    } : mandatEnRoute ? {
      /* Parti en signature (V3.32) : où elle en est, et qui a signé, dépliable. */
      k: 'mandat', ic: 'plume', titre: 'Le mandat de vente', etat: 'encours',
      statut: mandatEnRoute.statut === 'brouillon' ? 'En préparation : à terminer, puis à faire signer'
        : mandatEnRoute.signature ? (mandatEnRoute.signature.mode === 'sur_place' ? 'Signature sur place commencée' : 'Envoyé pour signature')
          : prevuMandat === 'en_ligne' ? 'Prêt : les liens de signature ne sont pas encore partis'
            : prevuMandat === 'sur_place' ? 'Prêt : à faire signer sur place' : 'Prêt : à faire signer à la main',
      detail: mandatEnRoute.statut === 'pret' && mandatEnRoute.signature?.lance_le
        ? `Le ${dateCourte(mandatEnRoute.signature.lance_le)}${mandatEnRoute.signature.mode !== 'sur_place' && suiviMandat && suiviMandat.signes < suiviMandat.total ? ' · un rappel part tout seul à 2 jours, puis à 7 jours' : ''}`
        : `Commencé le ${dateCourte(mandatEnRoute.created_at)}`,
      actions: <><BoutonAct or onClick={() => ouvrirDoc(mandatEnRoute.id)}>{mandatEnRoute.signature ? 'Ouvrir dans Documents' : 'Continuer le mandat'}</BoutonAct>{!mandatEnRoute.signature && <BtnTuile onClick={dejaSigne}>Déjà signé ?</BtnTuile>}</>,
      suite: suiviMandat ? <SuiviSignature suivi={suiviMandat} onFait={() => setTourSuivis(t => t + 1)} /> : undefined,
    } : {
      k: 'mandat', ic: 'plume', titre: 'Le mandat de vente', etat: 'afaire', statut: 'À préparer',
      detail: 'Prérempli avec le bien, le propriétaire, le prix et les honoraires. Signé ailleurs (papier, autre logiciel) : « Déjà signé ? ».',
      actions: <><BoutonAct or onClick={() => faireDocument({ modele: 'mandat_vente' })}><Ic n="plume" t={13} />Préparer le mandat</BoutonAct><BtnTuile onClick={dejaSigne}>Déjà signé ?</BtnTuile></>,
    },
    avant ? { k: 'bons', ic: 'calendrier', titre: 'Les bons de visite', etat: 'plustard', statut: 'Après le mandat', detail: 'Un par visite, prérempli avec l’acheteur et le bien : il protège tes honoraires.' } : {
      k: 'bons', ic: 'calendrier', titre: 'Les bons de visite', etat: bons.length ? (bonsSignes === bons.length ? 'fait' : 'encours') : 'libre',
      statut: bons.length ? (() => {
        const aSigner = bons.filter(x => x.statut === 'pret').length, prepa = bons.filter(x => x.statut === 'brouillon').length;
        return [bonsSignes ? `${bonsSignes} signé${bonsSignes > 1 ? 's' : ''}` : '', aSigner ? `${aSigner} à faire signer` : '', prepa ? `${prepa} en préparation` : ''].filter(Boolean).join(' · ');
      })() : 'Aucun pour l’instant',
      detail: 'Un par visite, prérempli avec l’acheteur et le bien : il protège tes honoraires.',
      suite: bons.length ? <ChaineDocs items={[...bons].sort(parDate).map(x => {
        const dv = txt((x.donnees || {}) as Donnees, 'dateVisite');
        return maillon(x, sansPrefixe(x.titre, /^Bon de visite\s*·\s*/) || 'Bon de visite', { avant: dv ? `visite du ${dateCourte(dv)}` : '' });
      })} /> : undefined,
      actions: <>{bons.length > 0 && <BtnTuile onClick={() => ouvrirDoc(bons[0].id)}>Voir</BtnTuile>}<BtnTuile onClick={() => faireDocument({ modele: 'bon_visite' })}><Ic n="plus" t={12} e={2.6} />Nouveau bon</BtnTuile></>,
    },
    avant ? { k: 'offres', ic: 'euro', titre: 'Les offres d’achat', etat: 'plustard', statut: 'Après le mandat', detail: 'Le document que l’acquéreur signe, prérempli avec lui et le bien.' } : {
      k: 'offres', ic: 'euro', titre: 'Les offres d’achat', etat: offresOuvertes.length ? 'encours' : accepte ? 'fait' : 'libre',
      statut: resumeOffres || (offresDocs.length ? `${offresDocs.length} offre${offresDocs.length > 1 ? 's' : ''} préparée${offresDocs.length > 1 ? 's' : ''}` : 'Aucune pour l’instant'), detail: 'Le document que l’acquéreur signe, prérempli avec lui et le bien. Les réponses du vendeur se notent sur la carte de l’offre, dans « Visites et offres ».',
      suite: offresDocs.length ? <ChaineDocs items={[...offresDocs].sort(parDate).map(x => maillon(x, sansPrefixe(x.titre, /^Offre d’achat\s*·\s*/) || 'Offre d’achat'))} /> : undefined,
      actions: <>{offresDocs.length > 0 && <BtnTuile onClick={() => ouvrirDoc(offresDocs[0].id)}>Voir</BtnTuile>}<BtnTuile onClick={() => faireDocument({ modele: 'offre_achat' })}><Ic n="plus" t={12} e={2.6} />Préparer une offre</BtnTuile></>,
    },
    compromisSigne ? { k: 'compromis', ic: 'doc', titre: 'Le compromis', etat: 'fait', statut: compromisLe ? `Signé le ${dateCourte(compromisLe)}` : 'Signé', detail: 'Rédigé et signé chez le notaire.' }
      : accepte ? { k: 'compromis', ic: 'doc', titre: 'Le compromis', etat: 'afaire', statut: 'Une offre est acceptée : à signer chez le notaire', detail: 'Une fois signé, le bien passe « Sous compromis ».', actions: <BoutonAct or onClick={() => setFen({ k: 'compromis' })}>Compromis signé</BoutonAct> }
        : { k: 'compromis', ic: 'doc', titre: 'Le compromis', etat: 'plustard', statut: 'Quand une offre sera acceptée', detail: 'Rédigé et signé chez le notaire.' },
  ];
  /* ── Documents : à qui les envoyer (V3.30) — le propriétaire (et son
     conjoint), les autres propriétaires saisis, puis les acheteurs du bien. ── */
  const destsDocs: DestPropose[] = [];
  const ajouteDest = (x: DestPropose) => { if (x.email && !destsDocs.some(y => y.email.toLowerCase() === x.email.toLowerCase())) destsDocs.push(x); };
  if (proprio) {
    ajouteDest({ cle: 'p-' + proprio.id, nom: nomClient(proprio), email: proprio.emails?.find(Boolean) || '', clientId: proprio.id, role: socP ? `Pour ${socP}` : nomP && nomP !== nomClient(proprio) ? `Pour ${nomP}` : 'Propriétaire' });
    const j = proprio.couple && proprio.conjoint && typeof proprio.conjoint === 'object' ? proprio.conjoint as Record<string, string> : null;
    if (j?.email) ajouteDest({ cle: 'pj-' + proprio.id, nom: [j.prenom, j.nom].filter(Boolean).join(' '), email: j.email, clientId: proprio.id, role: 'Propriétaire' });
  }
  persP.forEach((p, i) => { if (p?.email) ajouteDest({ cle: 'pp-' + i, nom: [p.prenom, p.nom].filter(Boolean).join(' '), email: p.email, role: 'Propriétaire' }); });
  for (const c of detail?.copies || []) {
    const cl = liste.clients[c.client_id];
    if (cl) ajouteDest({ cle: 'a-' + c.id, nom: nomClient(cl), email: cl.emails?.find(Boolean) || '', clientId: cl.id, rechercheId: c.recherche_id, role: c.envoye_le ? 'Acheteur · bien présenté' : 'Acheteur · en sélection' });
  }
  for (const o of offres) {
    const cl = o.client_id ? liste.clients[o.client_id] : null;
    if (cl) ajouteDest({ cle: 'o-' + o.id, nom: nomClient(cl), email: cl.emails?.find(Boolean) || '', clientId: cl.id, rechercheId: o.recherche_id, role: 'Acheteur · a fait une offre' });
  }

  /* ── Historique : ce qui arrive, et les chiffres de la vente ── */
  const aVenirHisto: AVenirBien[] = [
    ...visitesAVenir.map(v => {
      const n = v.source === 'crm' ? noteDe(v.rechercheId) : undefined;
      return { cle: 'av-' + v.cle, genre: 'visites' as const, titre: `Visite · ${v.qui}`, tri: `${v.ymd}${v.heure}`,
        detail: v.source === 'crm' ? `Acheteur suivi${n ? `, ${n} % de ses critères` : ''}` : 'Hors CRM',
        quand: [v.ymd ? jourCourt(v.ymd) : '', v.heure ? v.heure.replace(':', ' h ') : ''].filter(Boolean).join(', ') };
    }),
    ...offresOuvertes.filter(x => typeof x.donnees?.jusquau === 'string' && x.donnees.jusquau).map(x => ({
      cle: 'ao-' + x.id, genre: 'offres' as const, titre: `Réponse à l’offre de ${euros(x.montant || 0)}`, tri: `${String(x.donnees.jusquau)}23:59`,
      detail: `${x.qui || 'L’acquéreur'} attend la réponse`, quand: `avant le ${dateCourte(String(x.donnees.jusquau))}`,
    })),
  ].sort((p, q) => q.tri.localeCompare(p.tri)).map(x => ({ cle: x.cle, genre: x.genre, titre: x.titre, detail: x.detail, quand: x.quand }));
  const debutVente = bien.en_vente_le || txt(d, 'mandatDate');
  const joursVente = debutVente ? joursDepuisIso(debutVente) : 0;
  const presentes = (detail?.copies || []).filter(c => c.envoye_le).length;
  const ouvertes = (detail?.copies || []).filter(c => c.vu_le).length;
  const chiffresVente = avant || !debutVente ? null : {
    titre: joursVente ? `En ${joursVente} jour${joursVente > 1 ? 's' : ''} de vente` : 'Depuis la mise en vente',
    l: [
      { n: faites.length, l: `visite${faites.length > 1 ? 's' : ''} faite${faites.length > 1 ? 's' : ''}` },
      { n: offres.length, l: `offre${offres.length > 1 ? 's' : ''}` },
      { n: presentes, l: `acheteur${presentes > 1 ? 's' : ''} présenté${presentes > 1 ? 's' : ''}` },
      { n: ouvertes, l: `fiche${ouvertes > 1 ? 's' : ''} ouverte${ouvertes > 1 ? 's' : ''} par eux` },
    ],
    note: 'De quoi faire le point avec le propriétaire, chiffres à l’appui.',
  };

  return (
    <div className={b.fiche}>
      <div className={b.ficheBarre}>
        <button type="button" className={b.retour} onClick={onRetour}><Ic n="retour" t={16} />{retourLib}</button>
      </div>

      {/* V3.53 : à qui est ce bien, sur tous les onglets. La pastille est à
          cheval sur le haut du bandeau, comme les rubriques sur le bas.
          V3.81 (Alexandre : « les boutons, il faut les descendre au même
          niveau que propriétaire, à droite, qu'ils empiètent sur l'encadré
          bleu ; on ne les trouve pas ») : les gestes du bien la rejoignent, à
          droite, sur la même ligne. */}
      <div ref={cheval} className={`${b.chevalHaut} ${serre ? b.chevalCourt : ''} ${serre === 2 ? b.chevalSerre : ''}`} data-serre={serre ? 'oui' : undefined}>
      <div className={b.proprioCheval}>
        <PastilleProprio nom={nomP} pluriel={plurielP} personne={proprio} societe={d.qui === 'sci' && !pourP} pour={pourP} sous={sousP} plus={plusP} tel={telP} mail={mailP}
          onFiche={proprio ? () => ouvrirClient(proprio.id) : undefined} onRenseigner={() => onModifier('proprio')}
          onCreerFiche={!proprio && p0Saisi ? creerFicheProprioBien : undefined} onRetirer={nomP || proprio ? retirerProprio : undefined} onApres={() => { void apres(); }} />
      </div>
        {/* V3.99 (Alexandre : « Mandat en cours, on le mettrait pas à côté du
            nom du propriétaire ? » ; « une connexion entre mandat en cours et
            diffusion, qu'ils aillent bien ensemble ; la diffusion en cours
            toujours en vert ») : l'étape et la diffusion d'un seul tenant,
            juste après la pastille du propriétaire. Une moitié par geste :
            l'étape ouvre son menu, la diffusion sa fenêtre. */}
        <div className={b.statutBien} data-statut="" style={{ ['--etC' as string]: et.c } as React.CSSProperties}>
          <button type="button" className={b.statutEtape} aria-haspopup="menu" aria-expanded={menu === 'etape'} onClick={() => setMenu(menu === 'etape' ? null : 'etape')}
            title={`Étape : ${et.lib}`} aria-label={`Étape : ${et.lib}, changer`}>
            <span className={`${b.point} ${b.pointVivant}`} style={{ background: et.c, ['--halo' as string]: et.c } as React.CSSProperties} /><span className={b.etLong}>{e === 'mandat' && !txt(d, 'mandatDate') ? 'En vente' : et.lib}</span><span className={b.etCourt}>{et.court}</span>{bien.archive ? <span className={b.etArchive}>archivé</span> : null}<Ic n="bas" t={14} e={2.6} />
          </button>
          {/* V3.91 : vert, il part ; ambre, il est à régler ; gris, il ne part pas (lib/diffusion.ts). */}
          {diff.concerne && (
            <button type="button" className={b.statutDiff} data-ton={diff.ton} onClick={() => setFen({ k: 'diffusion' })}
              title={`${diff.lib} · ${diff.detail}`} aria-label={`Diffusion : ${diff.lib}. ${diff.detail} Régler`}>
              <span className={b.diffPoint} />
              <span className={b.diffLong} data-dlong="">{diff.ton === 'on' ? 'Diffusion en cours' : diff.ton === 'regler' ? 'Diffusion à régler' : diff.ton === 'pause' ? 'Diffusion en pause' : 'Non diffusé'}</span>
              <span className={b.diffCourt}>{diff.ton === 'on' ? 'En ligne' : diff.ton === 'regler' ? 'À régler' : diff.ton === 'pause' ? 'En pause' : 'Hors ligne'}</span>
              {diff.ton === 'on' && diff.supports.length > 0 && (
                <span className={b.diffLogos} aria-hidden="true">
                  {diff.supports.map(k => {
                    const x = supportDe(k);
                    return <i key={k} style={{ ['--sC' as string]: x.c } as React.CSSProperties}>{k === 'site' ? <Ic n="globe" t={11} e={2.4} /> : x.court}</i>;
                  })}
                </span>
              )}
            </button>
          )}
          {menu === 'etape' && (
            <div className={`${b.menu} ${b.menuGauche}`} role="menu">
              <div className={b.menuT}>{suite.length ? 'Ensuite' : 'Étape'}</div>
              {suite.map(x => (
                <button key={x.t} type="button" role="menuitem" className={`${b.menuItem} ${x.danger ? b.menuDanger : ''}`} onClick={() => { setMenu(null); x.go(); }}>
                  <span className={b.point} style={{ background: x.c }} /><span><b>{x.t}</b><small>{x.s}</small></span>
                </button>
              ))}
            </div>
          )}
        </div>
        {menu && <div className={b.voileMenu} onClick={() => setMenu(null)} />}
        {/* V3.99 (« Modifier, Note… que ça soit collé ») : les trois gestes
            d'un seul bloc, séparés d'un trait. Au téléphone, les icônes. */}
        <div className={b.barreActions} data-gestes="">
          <div className={b.gestes} role="group" aria-label="Gestes du bien">
            <button type="button" className={`${b.geste} ${envoyable ? b.gesteModif : ''}`} onClick={() => onModifier()} aria-label="Modifier la fiche"><Ic n="crayon" t={15} /><span className={b.gesteTx}>Modifier</span></button>
            {envoyable && <button type="button" className={`${b.geste} ${b.gesteEnvoi}`} onClick={ouvrirEnvoi} aria-label="Envoyer ce bien"><Ic n="envoyer" t={15} /><span className={b.gesteTx}>Envoyer</span></button>}
            {/* La note, en un clic (V3.81) ; Visite et Point vendeur sont dans « ⋯ ». */}
            <button type="button" className={`${b.geste} ${b.gesteNote}`} onClick={() => setFen({ k: 'note' })} aria-label="Ajouter une note"><Ic n="bulle" t={15} /><span className={b.gesteTx}>Note</span></button>
            <button type="button" className={`${b.geste} ${b.gestePlus}`} aria-label="Plus d’actions" aria-haspopup="menu" aria-expanded={menu === 'plus'} onClick={() => setMenu(menu === 'plus' ? null : 'plus')}><Ic n="points" t={16} e={2.6} /></button>
          </div>
          {menu === 'plus' && (
            <div className={b.menu} role="menu">
              <button type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); onModifier(); }}><Ic n="crayon" t={16} /><span><b>Modifier la fiche</b><small>Étape par étape ou tout sur une page</small></span></button>
              {envoyable && <button type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); ouvrirEnvoi(); }}><Ic n="envoyer" t={16} /><span><b>Envoyer ce bien</b><small>Un client du CRM, ou une adresse e-mail</small></span></button>}
              <button type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); ouvrirVisite(); }}><Ic n="cle" t={16} /><span><b>Planifier une visite</b><small>Un acheteur suivi, ou quelqu’un hors du CRM</small></span></button>
              <button type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); ouvrirOffre(); }}><Ic n="euro" t={16} /><span><b>Enregistrer une offre</b><small>Montant, financement, validité</small></span></button>
              <button type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); garde('prix', () => setFen({ k: 'prix' }))(); }}><Ic n="etiquette" t={16} /><span><b>Changer le prix ou les honoraires</b><small>L’ancien reste dans l’historique</small></span></button>
              {/* V3.96 : aussi hors des étapes de vente, pour le diffuser quand même. */}
              {!bien.archive && <button type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); setFen({ k: 'diffusion' }); }}><Ic n="megaphone" t={16} /><span><b>Diffusion de l’annonce</b><small>{diff.concerne ? `${diff.lib} · ${diff.detail}` : 'Non diffusé à cette étape · le diffuser quand même'}</small></span></button>}
              <button type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); void copierLienPublic(); }}><Ic n="copier" t={16} /><span><b>Copier le lien de la fiche</b><small>{avant ? 'La fiche publique, sans prix avant le mandat' : 'La fiche publique, à coller dans un message'}</small></span></button>
              <button type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); setFen({ k: 'note' }); }}><Ic n="bulle" t={16} /><span><b>Ajouter une note</b><small>Dans l’historique du bien</small></span></button>
              {pointVendeur && <button type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); setFen({ k: 'point' }); }}><Ic n="megaphone" t={16} /><span><b>Point vendeur</b><small>{txt(d, 'dernierPointVendeur') ? `Le dernier : le ${dateLongue(txt(d, 'dernierPointVendeur'))}` : 'Visites, retours, offres : le texte prêt à envoyer'}</small></span></button>}
              <div className={b.menuSep} />
              {<button type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); garde('archiver', () => { void archiverBien(); })(); }}><Ic n="archive" t={16} /><span><b>{bien.archive ? 'Sortir des archives' : 'Archiver'}</b><small>{bien.archive ? 'Il revient dans la liste' : 'Il quitte la liste, sans rien perdre'}</small></span></button>}
              <button type="button" role="menuitem" className={`${b.menuItem} ${b.menuDanger}`} onClick={supprimer}><Ic n="corbeille" t={16} /><span><b>Supprimer</b><small>Définitif : photos, dossier, historique</small></span></button>
            </div>
          )}
        </div>
      </div>

      <Bandeau bien={bien} detail={detail} surCarte={() => onNavigate('carte', { focus: `b:${bien.id}` })}
        cote={avant ? <CoteVisite d={d} onOuvrir={() => setVisite(true)} />
          : ['mandat', 'offre', 'compromis', 'suspendu'].includes(e) ? <CoteMandat bien={bien} d={d} enRoute={mandatEnRoute} onModifier={() => onModifier('prix:t-mandat')}
            onDoc={ouvrirDoc} onPreparer={() => { void faireDocument({ modele: 'mandat_vente' }); }} onDejaSigne={() => setFen({ k: 'mandat' })} />
          : e === 'vendu' ? <CoteVendu bien={bien} ligne={ligneVendu} vendeur={proprio ? nomClient(proprio) : nomProprio(d)} suite={venteSuivante}
            onRevente={() => setFen({ k: 'revente' })} onSuite={id => onOuvrir?.(id)} onCorriger={() => setFen({ k: 'vendu', correction: true })} /> : undefined} />

      {/* Les rubriques, à cheval sur le bas du bandeau : elles en sortent.
          La pastille glisse d'un onglet à l'autre, le contenu arrive en
          fondu (V3.28, src/components/shared/OngletsGlissants.tsx). */}
      {/* V3.81 (Alexandre : « pas la flèche ; un bloc qui devient commun,
          avec les petites sous-catégories, toujours animé ») : « Le bien »
          ouvre un tiroir marine sous la barre, dans le même cadre ; l'onglet
          allumé descend jusqu'à lui, ils ne font qu'un. */}
      <div className={b.ongletsCheval} data-tiroir={onglet === 'bien' ? 'oui' : undefined}>
        <BarreOnglets label="Rubriques du bien" className={`${b.ongletsHaut} ${onglet === 'bien' ? b.ongletsAttache : ''}`} actif={onglet} onChoisir={setOnglet}
          onglets={ONGLETS.map(o => ({ k: o.k, l: o.l, n: o.n, ic: <Ic n={o.ic} t={15} /> }))} />
        <Depliant ouvert={onglet === 'bien'}>
          <div className={b.tiroir}>
            <BarreOnglets label="Les caractéristiques du bien" className={b.sousOnglets} actif={sousVue} onChoisir={setSousVue}
              onglets={vuesDuBien(d, avant).map(x => ({ k: x.k, l: <span className={b.sousOngletL}>{x.l}</span>, ic: <span className={b.sousOngletIc} style={{ ['--sousC' as string]: x.c } as React.CSSProperties}><Ic n={x.ic} t={16} e={2.1} /></span> }))} />
          </div>
        </Depliant>
      </div>

      {message && <div className={message.ok ? s.note : s.erreur}>{message.t}</div>}
      {erreur && <div className={s.erreur}>{erreur}</div>}

      <CorpsOnglet k={onglet} ordre={ONGLETS.map(o => o.k)}>
      {onglet === 'apercu' && (
        <div className={b.col}>
          {/* Avant le mandat (V3.31, maquette B) : le parcours de l'estimation
              sur toute la largeur, puis la visite, les acheteurs. */}
          {avant && (
            <BlocParcours bien={bien} onDefinir={() => setFen({ k: 'estim' })} onEstimation={() => setFen({ k: 'estimation' })}
              onMandat={() => setFen({ k: 'mandat' })} onDocuments={() => setOnglet('documents')} />
          )}
          {/* Le bien en bref d'abord (V3.32, Alexandre : « qu'on voie
              rapidement ce que c'est ») ; avant le mandat, juste sous le parcours. */}
          <BlocBref d={d} onSurfaces={voirSurfaces} onModifier={() => onModifier('bien')} />
          {/* Après le mandat (V3.32) : le mandat est dans le bandeau, les
              acheteurs dans leur onglet ; « Pour la visite » remonte ici. */}
          {/* V3.54 : la carte « Le propriétaire » est partie (Alexandre : « ça ne
              sert à rien, on a déjà la partie en haut ») — la pastille du
              bandeau dit tout, sur tous les onglets. */}
          {/* V3.133 (Alexandre : enlever « Visites et offres » des annonces
              type) : ni visite ni offre sur une annonce type ; à la place, ce
              qu'elle est, et si elle est en ligne. */}
          {e === 'annonce_type' ? (
            <div className={b.expliAnnonce}>
              <span className={b.expliAnnonceIc}><Ic n="megaphone" t={16} /></span>
              <span>
                <b>{'Une annonce type'}</b>
                {` : elle sert à faire venir des acheteurs, sans vrai bien à vendre derrière. Ni visite ni offre ici : un acheteur intéressé se suit sur sa propre fiche. ${diff.enLigne ? `En ligne ${diff.detail.replace(/^Sur /, 'sur ')}` : 'Pas encore en ligne : « Diffusion de l’annonce », dans le menu ⋯.'}`}
              </span>
            </div>
          ) : (
          <Kpis n={avant || e !== 'vendu' ? 2 : 1}>
            {!avant && <CarteVisites nbVisites={nbVisites} nbAVenir={visitesAVenir.length} nbOffres={offresOuvertes.length} repartition={repartition} prochaine={prochaineVisite}
              onVoir={() => setOnglet('visites')} onVisite={ouvrirVisite} onOffre={ouvrirOffre} />}
            {(avant || e !== 'vendu') && <CartePourLaVisite {...visitePourCarte(d)} onModifier={() => onModifier('pratique')} />}
            {avant && <CarteAcheteurs acheteurs={acheteurs} mode={mode} onVoir={() => setOnglet('acheteurs')} />}
          </Kpis>
          )}
          {offresOuvertes.map(o => (
            <div key={o.id} className={b.encart}><b>{`Offre de ${o.qui || 'un acquéreur'} : ${euros(o.montant || 0)}`}</b>{typeof o.donnees?.jusquau === 'string' && o.donnees.jusquau ? ` · réponse attendue le ${dateCourte(String(o.donnees.jusquau))}` : ''}</div>
          ))}
          {/* « Qui pourrait l'acheter » n'est plus répété ici (V3.30) : la carte
              « Acheteurs potentiels » juste au-dessus dit combien, et qui ; la
              liste entière est dans l'onglet Acheteurs. */}
          {/* Les observations juste sous les cartes (V3.31), et non plus en bas de page. */}
          {blocNotes}
          {e === 'annonce_type' || (avant && !prochaines.length) ? <BlocDernierement items={recents} onTout={() => setOnglet('historique')} /> : (
            <div className={b.deuxEgal}>
              <div className={b.col}>
                <BlocProchaines items={prochaines} onVoir={() => setOnglet('visites')} onAjouter={ouvrirVisite} onFiche={ouvrirClient} />
              </div>
              <div className={b.col}>
                <BlocDernierement items={recents} onTout={() => setOnglet('historique')} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* V3.91 : Surfaces, sous-rubrique de « Le bien ». Entre les autres
          sous-rubriques, OngletBien fait lui-même glisser ses cartes ; vers
          Surfaces et retour, la page arrive en fondu. */}
      {onglet === 'bien' && (
        <div key={sousVue === 'surfaces' ? 'surfaces' : 'bien'} className={b.vueEntre}>
          {sousVue === 'surfaces'
            ? <OngletSurfaces s={surfacesDe(d)} pieces={lirePieces(d.detailPieces)} onPieces={() => onModifier('pieces')} onBien={() => onModifier('bien:t-surf')} />
            : <OngletBien bien={bien} vue={sousVue} onModifier={onModifier} onSurfaces={voirSurfaces} onEstimation={() => setFen({ k: 'estim' })} onAnnonce={(t, x) => { majDonnees('annonceTitre', t); majDonnees('annonceTexte', x); }} />}
        </div>
      )}

      {onglet === 'photos' && (
        <Bloc ic="photo" titre={<>{'Les photos'}<i>{nbPhotos ? ` · ${nbPhotos}` : ''}</i></>}>
          <p className={b.sous}>La première est la photo principale : elle illustre la carte, la fiche et l’annonce. Les flèches les rangent, l’étoile en fait la principale, la légende se tape sous chaque photo.</p>
          <ChampPhotos d={d} maj={majDonnees} off={false} bienId={bien.id} grand />
        </Bloc>
      )}

      {onglet === 'visites' && (
        !detail ? <div className={b.vide}>Chargement…</div> : (
          /* Refait en V3.32 (VisitesOffres.tsx) : les deux gestes en haut,
             ce qui reste à faire, les prochaines visites, puis l'historique. */
          <OngletVisitesOffres visites={visitesCartes} offres={offresTriees} prix={argentBien(d).prix} compromis={e === 'compromis' || e === 'vendu'}
            onVisite={ouvrirVisite} onOffre={ouvrirOffre}
            actVisite={cle => {
              const v = visites.find(y => y.cle === cle);
              if (!v) return null;
              const opt = v.clientId ? options.find(y => y.clientId === v.clientId && (!v.rechercheId || y.rechercheId === v.rechercheId)) : undefined;
              return {
                onCR: () => setCr(v), onAnnuler: () => annulerVisite(v), onDoc: () => bonDeVisite(v),
                onFiche: v.clientId ? () => ouvrirClient(v.clientId!) : undefined,
                /* V3.50 : déplacer une visite encore prévue (pas sur un bien vendu, retiré ou archivé). */
                onDeplacer: p.repondreOffre && v.statut === 'a_venir' && !v.issue ? () => setFen({ k: 'deplacer', v }) : undefined,
                /* « À revoir » : la 2e visite, l'acheteur déjà choisi. */
                onRevoir: v.issue === 'revoir' && v.statut !== 'annulee' ? garde('visite', () => setFen({ k: 'visite', pour: deuxiemeVisite(v, opt) })) : undefined,
                /* Hors CRM : sa fiche, en un clic. */
                onCreerFiche: v.source === 'libre' && !v.clientId && v.statut !== 'annulee' ? () => { void creerFicheVisiteur(v); } : undefined,
                /* Il veut faire une offre : la fenêtre s'ouvre sur lui (s'il
                   n'en a pas déjà fait une). */
                onOffre: offres.some(o => (v.clientId && o.client_id === v.clientId) || (!!o.qui && o.qui === v.qui)) ? undefined
                  : garde('offre', () => setFen({ k: 'offre', pour: opt ? { mode: 'crm', o: opt } : { mode: 'libre', nom: v.qui, tel: '' } })),
              };
            }}
            actOffre={x => {
              const doc = docDeLOffre(x);
              return {
                onReponse: p.repondreOffre ? r => repondreOffre(x, r) : undefined,
                onDoc: () => offreEcrite(x, doc),
                doc: doc ? docOffre(doc) : null,
                onPiece: typeof x.donnees?.chemin === 'string' && x.donnees.chemin ? () => ouvrirPiece(String(x.donnees.chemin), String(x.donnees.nom || 'offre.pdf')) : undefined,
                onJoindre: f => joindreOffre(x, f),
                onModifier: e === 'vendu' || e === 'retire' ? undefined : () => setFen({ k: 'offre', existante: x, pour: choixPour(x) }),
                onCompromis: e === 'offre' || e === 'mandat' || e === 'suspendu' ? () => setFen({ k: 'compromis', offre: x.id }) : undefined,
                onVendu: e === 'compromis' ? () => setFen({ k: 'vendu' }) : undefined,
                compromis: x.statut === 'acceptee' ? compromisDe(x) : null,
              };
            }}
            encart={bien.etape === 'offre' && offres.length > 0 && !offresOuvertes.length && !offres.some(x => x.statut === 'acceptee') ? (
              <>{'Plus aucune offre en cours. '}<button type="button" className={b.lien} onClick={() => setFen({ k: 'mandat' })}>Remettre le bien en vente</button></>
            ) : undefined} />
        )
      )}

      {onglet === 'acheteurs' && (
        <div className={b.col}>
          <RapprochementBien key={(detail?.copies || []).map(c => `${c.id}${c.etape || ''}`).join()} bien={bien} tri={tri} mode={mode} copies={detail?.copies || []}
            suivi={detail?.suivi || []}
            onSuivi={(ajout, retrait) => setDetail(d2 => (d2 ? { ...d2, suivi: [...(ajout ? [ajout] : []), ...d2.suivi.filter(y => y.id !== retrait && y.id !== ajout?.id)] } : d2))}
            onFiche={ouvrirClient}
            onAgir={mode === 'vente' || mode === 'avant' ? l => garde('presenter', () => setFen({ k: 'acheteurs', liste: l }))() : undefined}
            onAutre={mode === 'vente' || mode === 'avant' ? garde('presenter', () => setEnvoiAutre(true)) : undefined} />
          {horsListe.length > 0 && (
            <Bloc ic="envoyer" titre={<>{'Aussi dans leur dossier'}<i>{` · ${horsListe.length}`}</i></>}>
              <p className={b.sous}>Ils ont ce bien dans leur dossier, mais leur recherche ne lui correspond plus assez, ou ils ne sont plus suivis.</p>
              <div className={b.fil}>
                {horsListe.map(c => {
                  const cl = liste.clients[c.client_id];
                  const bd = c.badge_retour && c.etape !== 'selection' ? BADGES[c.badge_retour] : null;
                  return (
                    <div key={c.id} className={b.carteV} style={{ marginTop: 8 }}>
                      <div className={b.carteVT}>
                        <button type="button" className={b.lien} style={{ padding: 0, fontSize: 14.5 }} onClick={() => ouvrirClient(c.client_id)}>{nomClient(cl)}</button>
                        <small>{c.etape === 'selection' ? `dans sa sélection depuis le ${dateCourte(c.created_at)}` : `présenté le ${dateCourte(c.envoye_le || c.created_at)}${c.vu_le ? ' · fiche ouverte' : ''}`}</small>
                        {bd && <span className={`${b.etiq} ${b[bd.ton]}`}>{bd.l}</span>}
                      </div>
                      {c.retour_client && <div className={b.offreEcart}>{c.retour_client}</div>}
                    </div>
                  );
                })}
              </div>
            </Bloc>
          )}
        </div>
      )}

      {onglet === 'documents' && (
        <div className={b.col}>
        {/* Les documents de la vente (V3.32) : dans l'ordre, chacun avec son
            état et ses boutons ; tous les documents préparés, dépliables. */}
        <section className={b.docsVente}>
          {/* Repliable (V3.33) : replié, une pastille par étape ; déplié, le
              détail, chacun avec ses boutons, et tous les documents préparés. */}
          <div className={b.docsVenteT}>
            {/* « Voir le détail » à côté du titre, pas tout à droite (V3.33). */}
            <div className={b.docsVenteLigne}>
              <h3>Les documents de la vente</h3>
              <BoutonPli ouvert={docsVenteOuvert} onClick={() => basculerDocsVente(!docsVenteOuvert)} />
            </div>
            {docsVenteOuvert && <p>Dans l’ordre : le mandat, un bon par visite, les offres, le compromis. Chacun se prépare prérempli avec le bien, le propriétaire, le prix et les honoraires, et reste relié au bien.</p>}
          </div>
          {detail?.erreurDocs && <div className={s.erreur}>{detail.erreurDocs}</div>}
          <input ref={champMandat} type="file" accept=".pdf,image/*" hidden onChange={ev => { const f = ev.target.files?.[0]; if (f) void joindreMandat(f); ev.target.value = ''; }} />
          {!docsVenteOuvert && <SyntheseDocs etapes={etapesDocs} onOuvrir={() => basculerDocsVente(true)} />}
          <Depliant ouvert={docsVenteOuvert} ecart={6}>
          <EtapesDocs etapes={etapesDocs} />
          {docsLies.length > 0 && (
            <div className={b.docsPrep}>
              <button type="button" className={b.docsPrepT} aria-expanded={listeDocsOuverte} onClick={() => setListeDocsOuverte(v => !v)}>
                <span>{`Tous les documents préparés pour ce bien · ${docsLies.length}`}</span>
                <PastillePli ouvert={listeDocsOuverte} voir="Voir la liste" />
              </button>
              <Depliant ouvert={listeDocsOuverte}>
                <div className={b.docsPrepListe}>
                  {/* Rangés par état, comme sur la fiche d'un contact (V3.32) :
                      en attente de signature (avec qui a signé), en préparation,
                      signés (avec le PDF signé), annulés. */}
                  <DocsParEtat elements={docsLies.map(x => ({ ...depuisDoc(x as unknown as DocumentRow), titre: x.titre || modele(x.modele)?.titre || 'Document' }))}
                    suivis={suivis} onOuvrir={ouvrirDoc} onFait={() => { setTourSuivis(t => t + 1); void apres(); }} />
                </div>
              </Depliant>
            </div>
          )}
          </Depliant>
        </section>
        {/* Le dossier sur toute la largeur, en tuiles (V3.30) : déposer,
            ranger, cocher, envoyer. */}
        <DossierBien bienId={bien.id} d={d} maj={majDonnees} destinataires={destsDocs} lieu={lieuDe(d)} etape={bien.etape} onMessage={m => { setMessage(m); void apres(); }} />
        </div>
      )}

      {onglet === 'historique' && (
        <HistoriqueBien evts={evts} aVenir={aVenirHisto} parcours={parcoursDe(bien, detail?.suivi || [])} chiffres={chiffresVente}
          erreur={detail?.erreurJournal} onFiche={id => { void ouvrirClient(id); }}
          onNote={() => setFen({ k: 'note' })}
          onSuppr={async id => {
            if (!confirm('Supprimer cette note ?')) return;
            try { await supprimerSuivi(id); await apres(); } catch (e2) { setMessage({ t: (e2 as Error).message, ok: false }); }
          }} />
      )}
      </CorpsOnglet>

      {/* ── Les fenêtres ── */}
      {depotSigne && typeof document !== 'undefined' && createPortal(
        <FenetreSigne doc={depotSigne} onFermer={() => setDepotSigne(null)} onFait={() => { setDepotSigne(null); void apres(); }} />,
        document.body)}
      {/* V3.91 : le mandat vient d'être signé et rien n'est encore réglé : la
          fenêtre de diffusion s'ouvre (Alexandre : « à chaque mandat, je
          choisis sur quel portail le diffuser, j'ai juste à cocher »). */}
      {fen?.k === 'mandat' && <FenMandat bien={bien} offres={offres} onFermer={() => setFen(null)} onFait={r => {
        void apres(r).then(() => { if (r && etapeDiffusee(r.etape) && !lireDiffusion(r.donnees)) setFen({ k: 'diffusion', premiere: true }); });
      }} />}
      {fen?.k === 'diffusion' && <FenDiffusion bien={bien} premiere={fen.premiere} onFermer={() => setFen(null)} onEnregistrer={x => {
        majDonnees('diffusion', x);
        setFen(null);
        const l = supportsCoches(x.supports);
        setMessage({ ok: true, t: !x.actif ? 'Diffusion coupée : l’annonce ne part nulle part.' : l.length ? `Diffusion enregistrée : ${nomsSupports(l)}.` : 'Diffusion enregistrée, sans support coché : rien ne part.' });
      }} />}
      {fen?.k === 'estimation' && <FenEstimation bien={bien} reprise={cycleAvant} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {fen?.k === 'estim' && <FenDefinirEstimation bien={bien} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {/* La visite sur place : à sa sortie, la fiche se recharge, et la suite
          choisie s'ouvre (l'estimation, le mandat signé, le mandat à signer). */}
      {visite && <VisiteSurPlace bien={bien} onFermer={(r, suite) => {
        setVisite(false);
        void apres(r).then(() => {
          if (suite === 'estimation') setFen({ k: 'estimation' });
          else if (suite === 'mandat') setFen({ k: 'mandat' });
          else if (suite === 'document') void faireDocument({ modele: 'mandat_vente' });
        });
      }} />}
      {fen?.k === 'offre' && <FenOffre bien={bien} pour={fen.pour} existante={fen.existante} options={options} recherches={liste.recherches} proprio={proprio} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {fen?.k === 'compromis' && <FenCompromis bien={bien} offres={offres} choisie={fen.offre} existant={fen.existant} clientsNoms={Object.fromEntries(Object.values(liste.clients).map(x => [x.id, nomClient(x)]))} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {guide && <FenGuide titre={guide.titre} sur={`${etapeDe(e).lib}${bien.archive ? ' · archivé' : ''}`} couleur={etapeDe(e).c} texte={guide.texte} choix={guide.choix} onFermer={() => setGuide(null)} />}
      {fen?.k === 'revente' && <FenNouvelleVente bien={bien} references={liste.biens.map(x => x.reference)} acquereur={offreRetenue?.client_id ? liste.clients[offreRetenue.client_id] || null : null}
        onFermer={() => setFen(null)} onFait={r => { setFen(null); onMaj(r); onRecharger(); onOuvrir?.(r.id); }} />}
      {fen?.k === 'tombe' && <FenCompromisTombe bien={bien} compromis={lignesCompromis[0] || null} offres={offres} prevues={prevues} clientsNoms={Object.fromEntries(Object.values(liste.clients).map(x => [x.id, nomClient(x)]))} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {fen?.k === 'vendu' && <FenVendu bien={bien} compromis={lignesCompromis[0] || null} offres={offres} proprio={proprio} prevues={prevues} onFermer={() => setFen(null)}
        correction={fen.correction ? { ligne: ligneVendu } : null}
        onFait={(r, texte) => {
          if (!onVendu || fen.correction) { void apres(r); return; }
          setFen(null); onMaj(r); onRecharger(); onVendu(r, texte);
        }} />}
      {fen?.k === 'prix' && <FenPrix bien={bien} mandatSigne={!!mandatSigne && ['mandat', 'offre', 'suspendu'].includes(e)} onFermer={() => setFen(null)}
        onFait={async (r, x) => {
          await apres(r);
          /* L'avenant au mandat, prérempli (V3.32) : on l'ouvre dans Documents. */
          if (x?.avenant && mandatSigne) {
            try {
              const id = await creerAvenantVente(r, mandatSigne.id, { prix: x.avenant.prix, hono: x.avenant.hono as Parameters<typeof creerAvenantVente>[2]['hono'] });
              onNavigate('documents', { ouvrir: id });
            } catch (e2) { setMessage({ t: (e2 as Error).message, ok: false }); }
          }
        }} />}
      {/* V3.134 : les recherches en attente aussi (un prospect, un acheteur en pause) — sinon « n'a pas de recherche active ». */}
      {fen?.k === 'visite' && <FenVisite bien={bien} options={options} recherches={recherchesRappro(liste)} pour={fen.pour} onFermer={() => setFen(null)} onFait={() => apres()} />}
      {fen?.k === 'deplacer' && <FenDeplacerVisite bien={bien} v={{ qui: fen.v.qui, ymd: fen.v.ymd, heure: fen.v.heure, crm: fen.v.crm, libre: fen.v.libre }} onFermer={() => setFen(null)} onFait={() => apres()} />}
      {fen?.k === 'point' && <FenPointVendeur bien={bien} proprio={proprio} offres={offres} suivi={detail?.suivi || []} presentes={(detail?.copies || []).filter(c => c.envoye_le).length}
        visites={visites.map(v => ({ ymd: v.ymd, heure: v.heure, qui: v.qui, source: v.source, statut: v.statut, issue: v.issue, passee: passee(v),
          motifs: Array.isArray(v.crm?.motifs) ? (v.crm?.motifs as string[]) : Array.isArray((v.libre?.donnees as Record<string, unknown> | undefined)?.motifs) ? ((v.libre?.donnees as Record<string, unknown>).motifs as string[]) : [],
          commentaire: v.commentaire }))}
        onFermer={() => setFen(null)} onFait={r => { setMessage({ t: 'Le point vendeur est noté.', ok: true }); void apres(r); }} />}
      {fen?.k === 'note' && <FenNote bien={bien} onFermer={() => setFen(null)} onFait={() => apres()} />}
      {fen?.k === 'raison' && <FenRaison bien={bien} etape={fen.etape} titre={fen.titre} sur={fen.sur} prevues={prevues} offres={offres} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {fen?.k === 'annulerMandat' && (
        <FenAnnulerMandat bien={bien} depuis={etapeAvantMandat(detail?.suivi || [])} vers0={fen.vers} enRoute={!!mandatEnRoute}
          signeDoc={mandatSigne && !(fen.vers === 'annonce_type' && bien.etape === 'retire') ? { id: mandatSigne.id, numero: mandatSigne.numero || null } : null}
          onFermer={() => setFen(null)} onFait={r => apres(r)} onDocuments={id => { setFen(null); ouvrirDoc(id); }} />
      )}
      {envoiAutre && (
        <FenEnvoiLot biens={[bien]} liste={liste} nomBien={x => x.titre || titreBien(x.donnees || {})}
          onFermer={() => setEnvoiAutre(false)} onFait={() => { void apres(); }}
          onFiche={id => { setEnvoiAutre(false); void ouvrirClient(id); }} />
      )}
      {fen?.k === 'acheteurs' && (
        <FenEnvoiAcheteurs bien={bien} choisis={fen.liste} onFermer={() => setFen(null)}
          onFait={m => { setMessage(m); void apres(); }}
          onFiche={id => { setFen(null); void ouvrirClient(id); }} />
      )}

      {cr && (
        <CompteRenduVisite
          visite={cr.crm || { issue: cr.issue, motifs: (cr.libre?.donnees as Record<string, unknown>)?.motifs || [], aime: (cr.libre?.donnees as Record<string, unknown>)?.aime || [], note_etoiles: (cr.libre?.donnees as Record<string, unknown>)?.etoiles || 0, commentaire: cr.commentaire, statut: cr.statut === 'faite' ? 'effectuee' : 'a_venir' }}
          titre={titreBien(d)} sous={[cr.qui, cr.ymd ? jourCourt(cr.ymd) : ''].filter(Boolean).join(' · ')}
          prenom={cr.clientId ? liste.clients[cr.clientId]?.prenom || undefined : undefined}
          onFermer={() => setCr(null)}
          onValider={async x => {
            let err: string | null = null;
            if (cr.crm) {
              err = await enregistrerCompteRendu(cr.crm, x, { clientId: cr.crm.client_id, rechercheId: cr.crm.recherche_id, bienTitre: titreBien(d), badgeActuel: cr.copie?.badge_retour });
            } else if (cr.libre) {
              try {
                await majSuivi(cr.libre.id, { statut: 'faite', avis: x.issue, commentaire: x.commentaire || null, donnees: { ...cr.libre.donnees, motifs: x.motifs, aime: x.aime, etoiles: x.etoiles } });
              } catch (e2) { err = (e2 as Error).message; }
            }
            if (!err) { setCr(null); await apres(); }
            return err;
          }} />
      )}
    </div>
  );
}
