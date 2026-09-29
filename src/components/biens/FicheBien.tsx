'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { euros } from '@/lib/mandat';
import { num, txt, liste, STATUTS, modele } from '@/lib/actes';
import { ISSUES, issueDe, type Issue } from '@/lib/visites';
import CompteRenduVisite, { enregistrerCompteRendu } from '@/components/shared/CompteRenduVisite';
import {
  ETAPES_BIEN, PARCOURS, argentBien, avantMandat, controleAnnonce, dateCourte, etapeDe, etageTexte, joursAvant,
  lireDossier, lignesDossier, lireObservations, lirePhotos, lirePieces, m2, nomExpo, nomProprio, passoire, pourcent, titreBien,
  type BienVente, type Donnees, type EtapeVente, type SuiviVente,
} from '@/lib/biens-vente';
import { Ic } from '@/components/documents/ApercuActe';
import { NOM_MANDAT, prixCarte } from './CarteBien';
import { COULEURS, ChampDossier, ChampPhotos } from './ChampsBien';
import VisiteSurPlace from './VisiteSurPlace';
import { BarreOnglets, CorpsOnglet } from '@/components/shared/OngletsGlissants';
import {
  FenCompromis, FenDefinirEstimation, FenEstimation, FenMandat, FenNote, FenOffre, FenPrix, FenRaison, FenVendu, FenVisite, JaugeEstimation, lireEstim,
  type OptionAcheteur,
} from './FenetresBien';
import {
  SEUIL_CORRESPOND, SEUIL_LISTE, acheteursPour, annulerVisiteCRM, annulerVisiteLibre, chargerFiche, creerDocument, enregistrerBien,
  ficheClient, initiales, majBien, majSuivi, nomClient, ouvrirPiece, supprimerBien, supprimerSuivi,
  type Acheteur, type ClientMini, type Copie, type DetailBien, type ListeBiens, type PourDocument, type VisiteRow,
} from './outils';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';
import { signalerFicheOuverte, signalerBienActif } from '@/components/layout/FichesOuvertes';
import { issueAppel } from '@/components/fiche/FriseSuivi';
import { lireOngletBien, oublierOngletBien } from '@/lib/intentions';
import { CarteAcheteurs, FenEnvoiAcheteurs, ListeAcheteurs, modeAcheteurs } from './AcheteursBien';
import {
  ADecrire, BandePhotos, BoutonAct, BtnTuile, CarteAnnonce, CarteDossier, CarteOffreB, CarteVisiteB, Col, Deux, Encart, Famille, Familles, Haut, HistoriqueBien,
  Kv, LesPieces, Lettres, ListeDocs, ListeVisites, Note, Pile, Puces, TitreSec, Tuile, Tuiles, parcoursDe,
  type AVenirBien, type EvtBien, type VisiteCarte,
} from './OngletsBien';
import { BlocDernierement, BlocProchaines, CarteEstimation, CarteMandat, CarteProprio, CarteVisites, Kpis, type ProchaineVisite, type Recent, type Repartition } from './VueBien';

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

type Onglet = 'apercu' | 'bien' | 'photos' | 'visites' | 'acheteurs' | 'documents' | 'historique';
type Fen =
  | { k: 'mandat' } | { k: 'estimation' } | { k: 'estim' } | { k: 'offre' } | { k: 'compromis' } | { k: 'vendu' } | { k: 'prix' } | { k: 'visite' } | { k: 'note' }
  | { k: 'raison'; etape: EtapeVente; titre: string; sur: string } | { k: 'acheteurs'; liste: Acheteur[] };

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
function Li({ l, v, cls, ic }: { l: string; v: ReactNode; cls?: string; ic?: string }) {
  if (v === '' || v === null || v === undefined || v === false) return null;
  return <div className={`${b.li} ${ic ? b.liAvecIc : ''} ${cls || ''}`}><span>{ic && <i className={b.liIc}><Ic n={ic} t={15} /></i>}{l}</span><b>{v}</b></div>;
}
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
    l.push({
      cle: 's-' + x.id, source: 'libre', ymd: x.le.slice(0, 10), heure: isNaN(iso.getTime()) ? '' : iso.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      qui: x.qui || 'Visiteur', clientId: null, rechercheId: null,
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
const passee = (v: VisiteU) => v.statut === 'faite' || (!!v.ymd && `${v.ymd}T${v.heure || '23:59'}` < new Date().toISOString().slice(0, 16));

/* ══ LE BANDEAU ═══════════════════════════════════════════════════════════ */
function Bandeau({ bien, detail, surCarte }: { bien: BienVente; detail: DetailBien | null; surCarte?: () => void }) {
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
      <div className={b.heroTxt}>
        <div className={b.heroBadges}>
          {bien.mandat_type && <span className={b.badgeOr}>{NOM_MANDAT[bien.mandat_type]?.toUpperCase()}{bien.mandat_numero && <i>{` · n° ${bien.mandat_numero}`}</i>}</span>}
          {bien.reference && <span className={b.ref}>{`Réf. ${bien.reference}`}</span>}
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
            : a.prix && a.hono !== null && a.net ? <span>{a.acq ? `honoraires ${euros(a.hono)} inclus · net vendeur ${euros(a.net)}` : `honoraires ${euros(a.hono)} à la charge du vendeur`}</span> : null}
        </div>
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
                  <span className={b.stepRond}>{j < i && <Ic n="check" t={10} e={3.4} />}</span>{etapeDe(k).lib}
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
  return avec[0] || (ann.length ? libs(d, 'annexes').slice(0, 2).join(', ') : 'Aucun');
}
/* Le bien en bref : des tuiles à icône, seulement ce qui est rempli. */
const PICTO_ANNEXE: Record<string, string> = { balcon: 'balcon', terrasse: 'parasol', loggia: 'balcon', jardin: 'terrain', cave: 'cave', parking: 'parking', box: 'voiture', garage: 'voiture', piscine: 'eau' };
function Faits({ d, vide }: { d: Donnees; vide?: ReactNode }) {
  const enImm = !['maison', 'terrain'].includes(String(d.typeBien || ''));
  const asc = liste(d, 'immeuble').includes('ascenseur');
  const n = (k: string) => num(d, k);
  const eau = (n('sdb') || 0) + (n('salleseau') || 0);
  const ann = liste(d, 'annexes');
  const icExt = PICTO_ANNEXE[['terrasse', 'jardin', 'balcon', 'loggia'].find(x => ann.includes(x)) || ann[0] || ''] || 'terrain';
  const items: { ic: string; v: string; l: string; dpe?: string }[] = [];
  if (n('surface')) items.push({ ic: 'regle', v: m2(n('surface') as number), l: n('carrez') ? `Carrez ${m2(n('carrez') as number)}` : 'Habitable' });
  else if (n('terrain')) items.push({ ic: 'terrain', v: m2(n('terrain') as number), l: 'Terrain' });
  if (n('pieces')) items.push({ ic: 'plan', v: `${n('pieces')} pièce${(n('pieces') as number) > 1 ? 's' : ''}`, l: n('sejour') ? `Séjour ${m2(n('sejour') as number)}` : 'Pièces' });
  if (n('chambres')) items.push({ ic: 'lit', v: String(n('chambres')), l: (n('chambres') as number) > 1 ? 'Chambres' : 'Chambre' });
  if (eau) items.push({ ic: n('sdb') ? 'bain' : 'douche', v: String(eau), l: eau > 1 ? 'Salles d’eau ou de bains' : n('sdb') ? 'Salle de bains' : 'Salle d’eau' });
  if (enImm && n('etage') !== null) items.push({ ic: asc ? 'ascenseur' : 'escalier', v: etageTexte(n('etage'), n('etages')).replace(' étage', ''), l: n('etage') === 0 ? (asc ? 'Avec ascenseur' : 'Étage') : asc ? 'Étage, avec ascenseur' : 'Étage, sans ascenseur' });
  if (!enImm && n('etages')) items.push({ ic: 'escalier', v: n('etages') === 1 ? 'Plain-pied' : String(n('etages')), l: n('etages') === 1 ? 'Un seul niveau' : 'Niveaux' });
  if (enImm && (n('niveaux') || 0) >= 2) items.push({ ic: 'escalier', v: n('niveaux') === 2 ? 'Duplex' : n('niveaux') === 3 ? 'Triplex' : `${n('niveaux')} niveaux`, l: `Sur ${n('niveaux')} niveaux` });
  if (d.typeBien === 'terrain' && d.constructible) items.push({ ic: 'terrain', v: d.constructible === 'oui' ? 'Constructible' : d.constructible === 'partiel' ? 'En partie' : 'Non constructible', l: d.viabilise === 'oui' ? 'Viabilisé' : d.viabilise === 'non' ? 'Non viabilisé' : 'Terrain' });
  if (ann.length) items.push({ ic: icExt, v: exterieurCourt(d), l: 'Extérieur' });
  if (d.expo) items.push({ ic: 'boussole', v: d.expo === 'traversant' ? 'Traversant' : nomExpo(d.expo).replace(/^./, x => x.toUpperCase()), l: 'Exposition' });
  if (d.dpe) items.push({ ic: '', dpe: String(d.dpe), v: n('dpeValeur') ? `${n('dpeValeur')} kWh` : `Classe ${d.dpe}`, l: 'DPE, par m² et par an' });
  else if (d.dpeStatut === 'vierge') items.push({ ic: 'eclair', v: 'Vierge', l: 'DPE' });
  if (n('chargesAn')) items.push({ ic: 'lots', v: `${euros((n('chargesAn') as number) / 12)}`, l: 'Charges par mois' });
  if (n('taxeFonciere')) items.push({ ic: 'fiscal', v: euros(n('taxeFonciere') as number), l: 'Taxe foncière' });
  if (n('annee')) items.push({ ic: 'calendrier', v: String(n('annee')), l: 'Construction' });
  if (!items.length) return <div className={b.vide}>{vide || 'Les caractéristiques du bien s’afficheront ici.'}</div>;
  return (
    <div className={b.faits}>
      {items.map(x => (
        <div key={x.l + x.v} className={b.fait}>
          {x.dpe
            ? <span className={b.faitDpe} style={{ background: COULEURS.dpe[x.dpe]?.f, color: COULEURS.dpe[x.dpe]?.t }}>{x.dpe}</span>
            : <span className={b.faitIc}><Ic n={x.ic} t={19} /></span>}
          <div><b>{x.v}</b><small>{x.l}</small></div>
        </div>
      ))}
    </div>
  );
}

function BlocMandat({ bien, docs, onDoc, onOuvrirDoc, onMandat }: {
  bien: BienVente; docs: DetailBien['docs']; onDoc: (x: PourDocument) => void; onOuvrirDoc: (id: string) => void; onMandat: () => void;
}) {
  const d = bien.donnees || {};
  const a = argentBien(d);
  const mandatDoc = docs.find(x => x.modele === 'mandat_vente') || null;
  const j = joursAvant(txt(d, 'mandatFin'));
  const excl = d.mandatType === 'exclusif' || d.mandatType === 'semi';
  const statut = mandatDoc ? STATUTS[mandatDoc.statut] : null;
  return (
    <Bloc ic="dossier" titre="Le mandat"
      action={mandatDoc ? <Modifier onClick={() => onOuvrirDoc(mandatDoc.id)} lib="Voir le document" /> : avantMandat(bien.etape) ? <Modifier onClick={onMandat} lib="Mandat signé ?" /> : undefined}>
      <div className={b.lignes}>
        <Li l="Type" v={d.mandatType ? `${NOM_MANDAT[String(d.mandatType)]}${txt(d, 'mandatNumero') ? ` · n° ${txt(d, 'mandatNumero')}` : ''}` : 'Pas encore signé'} />
        <Li l="Signé le" v={txt(d, 'mandatDate') ? dateLongueCourt(txt(d, 'mandatDate')) : ''} />
        <Li l={excl ? 'Exclusivité jusqu’au' : 'Jusqu’au'} v={txt(d, 'mandatFin') ? `${dateLongueCourt(txt(d, 'mandatFin'))}${j !== null ? (j >= 0 ? ` (dans ${j} j)` : ' (terminé)') : ''}` : ''}
          cls={j !== null && j <= 15 ? b.liAlerte : undefined} />
        {excl && <Li l="Ensuite" v="résiliable, préavis 15 j" />}
        <Li l="Honoraires" v={a.hono !== null ? `${euros(a.hono)} TTC · ${a.acq ? 'acquéreur' : 'vendeur'}${a.taux ? ` · ${pourcent(a.taux)}` : ''}` : ''} />
        <Li l="Net vendeur" v={a.net ? euros(a.net) : ''} />
        {statut && mandatDoc && <Li l="Le document" v={statut.l} cls={mandatDoc.statut === 'signe' ? b.liVert : undefined} />}
      </div>
      {!mandatDoc && (
        <button type="button" className={b.mini} style={{ alignSelf: 'flex-start' }} onClick={() => onDoc({ modele: 'mandat_vente' })}>
          <Ic n="plume" t={13} />Préparer le mandat de vente (prérempli)
        </button>
      )}
    </Bloc>
  );
}
const dateLongueCourt = (ymd: string) => {
  const x = new Date(`${ymd}T12:00:00`);
  return isNaN(x.getTime()) ? ymd : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

function BlocProprio({ bien, proprio, recherchesProprio, onFiche, onModifier }: {
  bien: BienVente; proprio: ClientMini | null; recherchesProprio: ListeBiens['recherches']; onFiche: (id: string) => void; onModifier: () => void;
}) {
  const d = bien.donnees || {};
  const pers = (Array.isArray(d.proprietaires) ? d.proprietaires : []) as Record<string, string>[];
  const nom = nomProprio(d) || (proprio ? nomClient(proprio) : '');
  const tel = proprio?.telephones?.[0] || pers.find(p => p?.telephone)?.telephone || '';
  const mail = proprio?.emails?.[0] || pers.find(p => p?.email)?.email || '';
  const r = recherchesProprio[0];
  return (
    <Bloc ic="personne" titre="Le propriétaire" action={proprio ? <Modifier onClick={() => onFiche(proprio.id)} lib="Ouvrir sa fiche" /> : <Modifier onClick={onModifier} />}>
      {nom ? (
        <div className={b.proprio}>
          <span className={b.avatar}>{initiales(nom)}</span>
          <div style={{ minWidth: 0 }}><b>{nom}</b><small>{[tel, mail].filter(Boolean).join(' · ') || 'Pas de coordonnées'}</small></div>
        </div>
      ) : <div className={b.vide}>Pas encore renseigné.</div>}
      {(tel || mail) && (
        <div className={b.contacts}>
          {tel && <a className={b.contact} href={`tel:${tel.replace(/\s+/g, '')}`}><Ic n="telephone" t={14} />Appeler</a>}
          {mail && <a className={b.contact} href={`mailto:${mail}`}><Ic n="mail" t={14} />E-mail</a>}
        </div>
      )}
      <div className={b.lignes}>
        <Li l="Pourquoi il vend" v={lib(d, 'motif')} />
        <Li l="Son délai" v={lib(d, 'delai')} />
        <Li l="Venu par" v={lib(d, 'origine')} />
        <Li l="Son notaire" v={txt(d, 'notaire')} />
      </div>
      {r && <div className={b.encart}><b>{proprio?.prenom ? `${proprio.prenom} cherche aussi à acheter` : 'Il cherche aussi à acheter'}</b>{` : ${r.nom || 'une recherche en cours'}${r.budget_max ? `, jusqu’à ${euros(r.budget_max)}` : ''}. Sa recherche est suivie dans le CRM.`}</div>}
      {!proprio && nom && <div className={b.pied}>Pas de fiche client reliée : « Modifier » pour la créer ou la retrouver.</div>}
    </Bloc>
  );
}

function BlocVisite({ d, onModifier }: { d: Donnees; onModifier: () => void }) {
  const [copie, setCopie] = useState(false);
  const code = txt(d, 'digicode');
  const tel = txt(d, 'contactTel');
  const cles = [lib(d, 'cles'), d.cles === 'agence' && txt(d, 'trousseau') ? `trousseau ${txt(d, 'trousseau')}` : ''].filter(Boolean).join(', ');
  const vide = !['occupation', 'creneaux', 'contactNom', 'digicode', 'porte', 'cles', 'annexesNum', 'consignes', 'interphone', 'itineraire', 'accesAscenseur'].some(k => d[k]) && !liste(d, 'accesBas').length;
  return (
    <Bloc ic="cle" titre="Les indications de visite" action={<Modifier onClick={onModifier} />}>
      {vide ? <div className={b.vide}>Occupé ou libre, clés, codes, contact sur place : à noter dès maintenant, pour ta visite puis celles des acheteurs.</div> : (
        <div className={b.lignes}>
          <Li ic="porte" l="Le bien est" v={[lib(d, 'occupation'), txt(d, 'disponible') ? `disponible ${txt(d, 'disponible')}` : ''].filter(Boolean).join(' · ')} />
          <Li ic="horloge" l="Heures de visite" v={txt(d, 'creneaux')} />
          <Li ic="telephone" l="Contact sur place" v={[txt(d, 'contactNom'), tel].filter(Boolean).join(' · ') ? <>{[txt(d, 'contactNom'), tel].filter(Boolean).join(' · ')}{tel && <a className={b.lien} style={{ marginLeft: 8 }} href={`tel:${tel.replace(/\s+/g, '')}`}>Appeler</a>}</> : ''} />
          <Li ic="clavier" l="Digicode" v={code ? <>{code}<button type="button" className={b.lien} style={{ marginLeft: 8 }} onClick={() => { navigator.clipboard?.writeText(code).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1400); }).catch(() => {}); }}>{copie ? 'Copié' : 'Copier'}</button></> : ''} />
          <Li ic="immeuble" l="En bas" v={libs(d, 'accesBas').join(', ').toLowerCase().replace(/^./, x => x.toUpperCase())} />
          <Li ic="interphone" l="Interphone" v={txt(d, 'interphone')} />
          <Li ic="porte" l="Porte" v={txt(d, 'porte')} />
          <Li ic="ascenseur" l="En sortant de l’ascenseur" v={d.accesAscenseur === 'aucun' ? '' : lib(d, 'accesAscenseur')} />
          <Li ic="cle" l="Clés" v={cles} />
          <Li ic="cave" l="Cave · box" v={txt(d, 'annexesNum')} />
        </div>
      )}
      {txt(d, 'itineraire') && <div className={`${b.encart} ${b.encartBleu}`}><b>Le chemin : </b>{txt(d, 'itineraire')}</div>}
      {txt(d, 'consignes') && <div className={`${b.encart} ${b.encartBleu}`}><b>Consignes : </b>{txt(d, 'consignes')}</div>}
      <div className={b.pied}>Visible par toi seul. Reprise dans le rendez-vous de l’agenda pour une visite hors CRM.</div>
    </Bloc>
  );
}

/* Les observations (V3.16) : les travaux, les sinistres, les PV d'AG, les
   notes. Pour Alexandre seul ; un sinistre en cours passe en rouge, en haut. */
function BlocObservations({ d, onModifier }: { d: Donnees; onModifier: () => void }) {
  const copro = d.copro === 'oui';
  const sinistres = lireObservations(d.sinistres);
  const enCours = sinistres.filter(x => x.enCours);
  const groupes = [
    { t: 'Travaux réalisés', ic: 'outil', l: lireObservations(d.travauxFaits) },
    { t: 'Sinistres', ic: 'eau', l: d.sinistre === 'oui' ? sinistres : [] },
    { t: 'Copropriété · travaux votés', ic: 'accord', l: copro ? lireObservations(d.coproVotes) : [] },
    { t: 'Copropriété · travaux réalisés', ic: 'check', l: copro ? lireObservations(d.coproFaits) : [] },
    { t: 'Copropriété · travaux à venir', ic: 'horloge', l: copro ? lireObservations(d.coproAVenir) : [] },
  ].filter(g => g.l.length);
  const notes = txt(d, 'notes');
  const vide = !groupes.length && !notes && !txt(d, 'travaux') && !(copro && txt(d, 'travauxVotes')) && d.sinistre !== 'non';
  return (
    <Bloc ic="loupe" titre="Observations et notes" action={<Modifier onClick={onModifier} />}>
      {d.sinistre === 'oui' && enCours.length > 0 && (
        <div className={b.obsAlerte}><Ic n="info" t={16} /><span>{`Sinistre en cours : ${enCours.map(x => [x.nature || 'à préciser', x.quand].filter(Boolean).join(', ')).join(' ; ')}`}</span></div>
      )}
      {d.sinistre === 'non' && <span className={b.obsOk}><Ic n="check" t={15} e={2.6} />Aucun sinistre, à sa connaissance</span>}
      {groupes.map(g => (
        <div key={g.t} className={b.obsG}>
          <div className={b.obsT}><Ic n={g.ic} t={14} />{g.t}</div>
          <ul className={b.obsL}>
            {g.l.map(o => (
              <li key={o.id}>
                <b>{o.nature || 'À préciser'}</b>
                {o.quand && <span>{o.quand}</span>}
                {o.enCours !== undefined && <em className={`${b.obsTag} ${o.enCours ? b.obsTagRouge : ''}`}>{o.enCours ? 'en cours' : 'réglé'}</em>}
                {o.note && <small>{o.note}</small>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {txt(d, 'travaux') && <div className={b.texte}><b>Travaux : </b>{txt(d, 'travaux')}</div>}
      {copro && txt(d, 'travauxVotes') && <div className={b.texte}><b>Copropriété : </b>{txt(d, 'travauxVotes')}</div>}
      {notes && <div className={b.texte}><b>Notes : </b>{notes}</div>}
      {vide && <div className={b.vide}>Les travaux, un sinistre, ce que disent les PV d’AG, tes notes : « Modifier » pour les noter.</div>}
      <div className={b.pied}>Visibles par toi seul, jamais dans un espace client ni une annonce.</div>
    </Bloc>
  );
}

function BlocDossierResume({ d, onVoir }: { d: Donnees; onVoir: () => void }) {
  const doss = lireDossier(d.dossier);
  const lignes = lignesDossier(d);
  const faits = lignes.filter(l => doss[l.k]?.etat === 'recu' || doss[l.k]?.etat === 'nc').length;
  const reste = lignes.filter(l => doss[l.k]?.etat !== 'recu' && doss[l.k]?.etat !== 'nc');
  const pct = lignes.length ? Math.round((faits / lignes.length) * 100) : 0;
  return (
    <Bloc ic="dossier" titre={<>{'Le dossier'}<i>{` · ${faits} sur ${lignes.length}`}</i></>} action={<Modifier onClick={onVoir} lib="Tout voir" />}>
      <div className={b.jauge} aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      {reste.length === 0 ? <div className={`${b.check}`}><span className={`${b.checkK} ${b.kOk}`}><Ic n="check" t={11} e={3} /></span><span>Tout est réuni.</span></div> : (
        <div>
          <div className={b.sectionT} style={{ marginBottom: 4 }}>{`Encore ${reste.length} à réunir`}</div>
          {reste.slice(0, 6).map(l => {
            const e = doss[l.k]?.etat || '';
            return (
              <div key={l.k} className={`${b.check} ${e === 'demande' ? b.checkAttente : ''}`}>
                <span className={`${b.checkK} ${e === 'demande' ? b.kAttente : b.kVide}`}>{e === 'demande' ? '!' : ''}</span>
                <span>{`${l.l}${e === 'demande' ? ' · demandé' : ''}`}</span>
              </div>
            );
          })}
          {reste.length > 6 && <button type="button" className={b.lien} onClick={onVoir}>{`Et ${reste.length - 6} autres`}</button>}
        </div>
      )}
    </Bloc>
  );
}

/* Avant le mandat : le rendez-vous, la fourchette, l'avis de valeur. */
/* ── La visite sur place : l'entrée (chez le propriétaire, tablette en main)
   et ce qu'on en a retenu. ── */
function BlocVisiteSurPlace({ d, onOuvrir }: { d: Donnees; onOuvrir: () => void }) {
  const le = txt(d, 'visiteLe');
  const atouts = liste(d, 'visiteAtouts'), defauts = liste(d, 'visiteDefauts');
  const note = txt(d, 'visiteNote');
  return (
    <div className={b.vEntree}>
      <div className={b.vEntreeTete}>
        <span className={b.vEntreeIc}><Ic n="tablette" t={24} /></span>
        <div>
          <b>{le ? 'La visite sur place' : 'Chez le propriétaire ?'}</b>
          <span>{le ? `Faite le ${dateLongueCourt(le)} · tu peux la reprendre` : 'Plein écran, pièce par pièce, les photos prises sur place : tout s’enregistre, même sans réseau.'}</span>
        </div>
        <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={onOuvrir}><Ic n="tablette" t={16} />{le ? 'Reprendre' : 'Commencer la visite'}</button>
      </div>
      {(atouts.length > 0 || defauts.length > 0 || note) && (
        <div className={b.vEntreeCorps}>
          {atouts.length > 0 && <div className={b.tags}>{atouts.map(x => <span key={x} className={`${b.tag} ${b.tagIc}`}><Ic n="etoile" t={12} />{x}</span>)}</div>}
          {defauts.length > 0 && <div className={b.tags}>{defauts.map(x => <span key={x} className={`${b.tag} ${b.tagRouge}`}>{x}</span>)}</div>}
          {note && <p className={b.vEntreeNote}>{note}</p>}
        </div>
      )}
    </div>
  );
}

/* Le projet (à suivre) puis l'estimation : où on en est, le montant, et
   le chemin jusqu'au mandat — rendez-vous, visite, montant, avis de
   valeur — qui se coche tout seul (V3.16). */
function BlocEstimation({ bien, onDefinir, onEstimation, onMandat }: { bien: BienVente; onDefinir: () => void; onEstimation: () => void; onMandat: () => void }) {
  const d = bien.donnees || {};
  const rdv = txt(d, 'rdvEstimation');
  const j = joursAvant(rdv);
  const e = lireEstim(d);
  const suivre = bien.etape === 'a_suivre';
  const fait = !!(e.basse || e.haute || e.prix);
  const avis = txt(d, 'avisEnvoye');
  const surf = num(d, 'carrez') || num(d, 'surface');
  const jalons = [
    { l: 'Rendez-vous', ic: 'calendrier', ok: !!rdv, v: rdv ? (j === 0 ? 'aujourd’hui' : dateCourte(rdv)) : 'à prendre' },
    { l: 'Visite', ic: 'tablette', ok: !!txt(d, 'visiteLe'), v: txt(d, 'visiteLe') ? dateCourte(txt(d, 'visiteLe')) : 'à faire' },
    { l: 'Montant', ic: 'etiquette', ok: fait, v: fait ? 'défini' : suivre ? 'à l’estimation' : 'à définir' },
    { l: 'Avis de valeur', ic: 'envoyer', ok: !!avis, v: avis ? dateCourte(avis) : 'à envoyer' },
  ];
  const fourchette = e.basse && e.haute ? `${euros(e.basse).replace(/\s€$/, '')} – ${euros(e.haute)}` : e.basse || e.haute ? euros((e.basse || e.haute) as number) : '';
  return (
    <Bloc ic="regle" titre={suivre ? 'Le projet' : 'L’estimation'} action={!suivre && fait ? <Modifier onClick={onDefinir} /> : undefined}>
      <ol className={b.jalons}>
        {jalons.map(x => (
          <li key={x.l} className={x.ok ? b.jalonOk : undefined}>
            <span className={b.jalonIc}><Ic n={x.ok ? 'check' : x.ic} t={15} e={x.ok ? 2.8 : 1.9} /></span>
            <b>{x.l}</b><small>{x.v}</small>
          </li>
        ))}
      </ol>
      {!suivre && fait && (
        <div className={b.estimVue}>
          {fourchette && <div className={b.estimVueF}><small>Fourchette</small><b>{fourchette}</b></div>}
          {e.prix ? <div className={b.estimVueP}><small>Prix conseillé</small><b>{euros(e.prix)}</b>{surf ? <i>{`${euros(Math.round(e.prix / surf))} / m²`}</i> : null}</div> : null}
          <JaugeEstimation e={e} />
          {e.souhaite ? <div className={b.estimVueS}><Ic n="personne" t={14} /><span>{`Le propriétaire espère ${euros(e.souhaite)}`}{e.prix ? <b>{` · ${e.souhaite >= e.prix ? '+' : '−'}${pourcent(Math.abs(Math.round(((e.souhaite - e.prix) / e.prix) * 1000) / 10))}`}</b> : null}</span></div> : null}
        </div>
      )}
      {!suivre && !fait && (
        <div className={b.estimAppel}>
          <span className={b.estimAppelIc}><Ic n="etiquette" t={20} /></span>
          <div><b>{rdv && (j ?? 1) <= 0 ? 'Le rendez-vous est passé : quel montant ?' : 'Le montant viendra après le rendez-vous'}</b><small>La fourchette et le prix conseillé. Ils s’afficheront sur la carte du bien, à la place de « Estimation à définir ».</small></div>
          <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={onDefinir}><Ic n="plus" t={15} e={2.4} />Définir l’estimation</button>
        </div>
      )}
      {suivre && (
        <div className={b.lignes}>
          <Li ic="personne" l="Prix espéré par le propriétaire" v={eur(e.souhaite)} />
        </div>
      )}
      {suivre && !rdv && <div className={b.vide}>Pas encore de rendez-vous. Tu peux déjà tout décrire (« Modifier », ou la visite sur place) ; le montant se donne en passant à l’estimation.</div>}
      <div className={b.carteVActions}>
        {suivre && <button type="button" className={`${b.mini} ${b.miniOr}`} onClick={onEstimation}><Ic n="regle" t={13} />Passer à l’estimation</button>}
        {!suivre && fait && !avis && <button type="button" className={b.mini} onClick={onDefinir}><Ic n="envoyer" t={13} />Avis de valeur envoyé</button>}
        <button type="button" className={b.mini} onClick={onMandat}><Ic n="plume" t={13} />Le mandat est signé</button>
      </div>
    </Bloc>
  );
}

/* ══ ONGLET « LE BIEN » (V3.29, OngletsBien.tsx) ══════════════════════════
   L'annonce et les photos en haut, puis une carte par famille, chacune de sa
   couleur, puis les pièces, en liste ou en cartes. */
const SURF_ANNEXE: Record<string, string> = { balcon: 'surfBalcon', terrasse: 'surfTerrasse', jardin: 'surfJardin', cave: 'surfCave', parking: 'nbParking' };

function OngletBien({ bien, onModifier, onPhotos }: { bien: BienVente; onModifier: (etape: string) => void; onPhotos: () => void }) {
  const d = bien.donnees || {};
  const a = argentBien(d);
  const enImm = !['maison', 'terrain'].includes(String(d.typeBien || ''));
  const imm = liste(d, 'immeuble');
  const pieces = lirePieces(d.detailPieces);
  const avant = avantMandat(bien.etape);
  const chargesAn = num(d, 'chargesAn');
  const surf = num(d, 'carrez') || num(d, 'surface');
  const M = (e: string) => () => onModifier(e);
  const chauffage = [lib(d, 'chauffageMode'), lib(d, 'chauffageEnergie').toLowerCase()].filter(Boolean).join(', ');
  const cuisine = [lib(d, 'cuisine'), lib(d, 'cuisineEquip').toLowerCase()].filter(Boolean).join(', ');
  const equip = libs(d, 'equipements');
  const sejour = num(d, 'sejour');
  const videInt = !d.etat && !chauffage && !cuisine && !equip.length && !txt(d, 'interieurNote') && !txt(d, 'travaux') && !sejour;
  const ann = liste(d, 'annexes');
  const nbPark = num(d, 'nbParking');
  /* Les annexes sans ligne à elles (loggia, box, piscine…, ou sans surface) : en pastilles. */
  const annPuces = ann.filter(v => !SURF_ANNEXE[v] || !num(d, SURF_ANNEXE[v])).map(v => OPTIONS.annexes?.[v] || v);
  const videExt = !ann.length && !d.expo && !lib(d, 'vue') && !txt(d, 'exterieurNote');
  const cout = num(d, 'coutMin') && num(d, 'coutMax') ? `${euros(num(d, 'coutMin') as number).replace(/\s€$/, '')} à ${euros(num(d, 'coutMax') as number)} par an` : '';
  const dpeV = num(d, 'dpeValeur');
  const gesV = num(d, 'gesValeur');
  const fr = (n: number) => String(n).replace('.', ',');
  const energie = !avant || d.dpe || d.dpeStatut ? (
    <Famille ton="ambre" ic="eclair" titre="L’énergie" onModifier={M('energie')}>
      {d.dpeStatut === 'vierge' ? <Note>DPE vierge.</Note> : d.dpeStatut === 'non' ? <Note>Non soumis au DPE.</Note> : (
        <>
          <Lettres genre="dpe" v={String(d.dpe || '')} titre={`DPE${dpeV ? ` · ${fr(dpeV)} kWh/m²/an` : ''}`} />
          <Lettres genre="ges" v={String(d.ges || '')} titre={`GES${gesV ? ` · ${fr(gesV)} kg CO₂/m²/an` : ''}`} />
          <Kv l="Diagnostic fait le" v={txt(d, 'dpeDate') ? dateLongueCourt(txt(d, 'dpeDate')) : d.dpeStatut === 'encours' ? 'commandé' : ''} />
          <Kv l="Coût estimé" v={cout} />
          {passoire(d) && <Encart>Classe F ou G : logement à consommation énergétique excessive. L’annonce doit le dire.</Encart>}
        </>
      )}
    </Famille>
  ) : null;
  const charges = (
    <Famille ton="ardoise" ic="lignes" titre="Charges et taxes" onModifier={M('copro')}>
      <Kv l="Charges" v={chargesAn ? `${euros(chargesAn)} par an · ${euros(chargesAn / 12)} par mois` : ''} />
      <Kv l="Elles comprennent" v={libs(d, 'chargesInclus').join(', ').toLowerCase()} />
      <Kv l="Taxe foncière" v={num(d, 'taxeFonciere') ? `${euros(num(d, 'taxeFonciere') as number)} par an` : ''} />
      <Kv l="Loyer (bien loué)" v={num(d, 'loyer') ? `${euros(num(d, 'loyer') as number)} par mois` : ''} />
      <Kv l="Fin du bail" v={txt(d, 'finBail') ? dateLongueCourt(txt(d, 'finBail')) : ''} />
      {!chargesAn && !num(d, 'taxeFonciere') && !num(d, 'loyer') && <ADecrire t="À renseigner." />}
    </Famille>
  );
  const prix = (
    <Famille ton="or" ic="etiquette" titre={avant ? 'Estimation et prix' : 'Prix et honoraires'} onModifier={M('prix')}>
      <Kv l="Estimation" v={num(d, 'estimBasse') || num(d, 'estimHaute') ? [eur(num(d, 'estimBasse')), eur(num(d, 'estimHaute'))].filter(Boolean).join(' à ') : ''} />
      <Kv l={avant ? 'Prix conseillé' : 'Prix affiché'} v={eur(a.prix)} />
      <Kv l="Net vendeur" v={eur(a.net)} />
      <Kv l="Honoraires" v={a.hono !== null ? `${euros(a.hono)} TTC, à la charge ${a.acq ? 'de l’acquéreur' : 'du vendeur'}${a.taux ? ` · ${pourcent(a.taux)}` : ''}` : ''} />
      <Kv l="Prix au m²" v={a.prix && surf ? euros(a.prix / surf) : ''} />
      {!a.prix && !num(d, 'estimBasse') && !num(d, 'estimHaute') && <ADecrire t="À renseigner." />}
    </Famille>
  );
  return (
    <Col>
      <Haut seul={avant}>
        {!avant && <CarteAnnonce texte={txt(d, 'annonceTexte')} mentions={controleAnnonce(d)} onEcrire={M('annonce')} />}
        <BandePhotos photos={lirePhotos(d.photos)} onVoir={onPhotos} />
      </Haut>

      <Familles>
        <Famille ton="bleu" ic="canape" titre="L’intérieur" onModifier={M('interieur')}>
          <Kv l="Séjour" v={sejour ? m2(sejour) : ''} />
          <Kv l="État" v={lib(d, 'etat')} />
          <Kv l="Cuisine" v={cuisine} />
          <Kv l="Chauffage" v={chauffage} />
          <Kv l="Par" v={lib(d, 'chauffageEmetteurs')} />
          <Kv l="Eau chaude" v={lib(d, 'eauChaude')} />
          <Puces l={equip} />
          {txt(d, 'travaux') && <Note><b>Travaux :</b>{` ${txt(d, 'travaux')}`}</Note>}
          {txt(d, 'interieurNote') && <Note>{txt(d, 'interieurNote')}</Note>}
          {videInt && <ADecrire />}
        </Famille>
        <Famille ton="violet" ic={enImm ? 'immeuble' : 'maison'} titre={enImm ? 'L’immeuble' : 'La maison'} onModifier={M('bien')}>
          {enImm && <Kv l="Étage" v={num(d, 'etage') !== null ? etageTexte(num(d, 'etage'), num(d, 'etages')) : ''} />}
          {!enImm && <Kv l="Niveaux" v={num(d, 'etages') ?? ''} />}
          {enImm && <Kv l="Ascenseur" v={d.typeBien ? (imm.includes('ascenseur') ? 'oui' : 'non') : ''} />}
          <Kv l="Construction" v={num(d, 'annee') ?? ''} />
          <Kv l="N° de lot" v={txt(d, 'lot')} />
          <Kv l="Cadastre" v={txt(d, 'cadastre')} />
          <Puces l={libs(d, 'immeuble').filter((x, i) => imm[i] !== 'ascenseur')} />
          {!d.typeBien && !num(d, 'annee') && !imm.length && <ADecrire />}
        </Famille>
        <Famille ton="sarcelle" ic="lots" titre="Copropriété" onModifier={M('copro')}>
          {d.copro === 'oui' ? (
            <>
              <Kv l="Lots" v={num(d, 'lots') ?? ''} />
              <Kv l="Procédure en cours" v={d.procedure === 'oui' ? txt(d, 'procedureNature') || 'oui' : d.procedure === 'non' ? 'aucune' : ''} alerte={d.procedure === 'oui'} />
              <Kv l="Syndic" v={txt(d, 'syndic')} />
              <Kv l="Fonds de travaux" v={eur(num(d, 'fondsTravaux'))} />
              <Kv l="Travaux votés" v={txt(d, 'travauxVotes')} />
            </>
          ) : d.copro === 'non' ? <Note>Pas de copropriété.</Note> : <ADecrire t="À renseigner." />}
        </Famille>
        <Famille ton="vert" ic="terrain" titre="Extérieur et annexes" onModifier={M('exterieur')}>
          <Kv l="Balcon" v={num(d, 'surfBalcon') ? m2(num(d, 'surfBalcon') as number) : ''} />
          <Kv l="Terrasse" v={num(d, 'surfTerrasse') ? m2(num(d, 'surfTerrasse') as number) : ''} />
          <Kv l="Jardin" v={num(d, 'surfJardin') ? m2(num(d, 'surfJardin') as number) : ''} />
          <Kv l="Cave" v={num(d, 'surfCave') ? m2(num(d, 'surfCave') as number) : ''} />
          <Kv l="Parking" v={nbPark ? `${nbPark} place${nbPark > 1 ? 's' : ''}` : ''} />
          <Kv l="Exposition" v={d.expo ? (d.expo === 'traversant' ? 'traversant' : nomExpo(d.expo).toLowerCase()) : ''} />
          <Kv l="Vue" v={lib(d, 'vue').toLowerCase()} />
          <Kv l="Vis-à-vis" v={lib(d, 'visAVis').toLowerCase()} />
          <Puces l={annPuces} />
          {txt(d, 'exterieurNote') && <Note>{txt(d, 'exterieurNote')}</Note>}
          {videExt && <ADecrire />}
        </Famille>
        {energie}
        <Pile>{charges}{prix}</Pile>
      </Familles>

      <LesPieces pieces={pieces} onModifier={M('pieces')} />
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

function evenements(bien: BienVente, det: DetailBien, clients: Record<string, ClientMini>): Evt[] {
  const l: Evt[] = [];
  l.push({ cle: 'creation', le: bien.created_at, ic: 'plus', ton: 'ic_gris', titre: `Bien créé${bien.reference ? ` · ${bien.reference}` : ''}`, genre: 'etapes', discret: true });
  for (const x of det.suivi) {
    const d = (x.donnees || {}) as Record<string, unknown>;
    const str = (k: string) => (typeof d[k] === 'string' ? String(d[k]) : '');
    if (x.type === 'etape') {
      const e = x.statut as EtapeVente;
      let titre = etapeDe(e).lib, detail = '';
      let puce: EvtBien['puce'];
      if (e === 'mandat') {
        const signe = d.de === 'estimation' || d.de === 'a_suivre' || d.depuis === 'creation';
        titre = signe ? `Mandat signé${str('numero') ? ` · n° ${str('numero')}` : ''}` : 'Remis en vente';
        if (signe && str('type')) puce = str('type') === 'exclusif'
          ? { l: 'Exclusif', c: '#e8c96a', fond: '#1a2332', bord: '#1a2332' }
          : { l: NOM_MANDAT[str('type')] || str('type'), c: '#34496e', fond: '#eef2f8', bord: '#dbe3ef' };
        detail = [str('fin') ? `jusqu’au ${dateCourte(str('fin'))}` : '', typeof d.prix === 'number' ? `prix ${euros(d.prix)}` : ''].filter(Boolean).join(' · ');
      } else if (e === 'offre') { titre = 'Passé sous offre'; detail = typeof d.montant === 'number' ? `${str('qui')} · ${euros(d.montant)}` : ''; }
      else if (e === 'compromis') {
        titre = `Compromis signé${typeof d.prix === 'number' ? ` · ${euros(d.prix)}` : ''}`;
        detail = [str('acquereur'), str('pretLimite') ? `prêt jusqu’au ${dateCourte(str('pretLimite'))}` : '', str('acte') ? `acte le ${dateCourte(str('acte'))}` : ''].filter(Boolean).join(' · ');
      } else if (e === 'vendu') { titre = `Vendu${typeof d.prix === 'number' ? ` · ${euros(d.prix)}` : ''}`; detail = typeof d.hono === 'number' ? `Honoraires : ${euros(d.hono)}` : ''; }
      else if (e === 'suspendu') { titre = 'Vente en pause'; detail = [str('raison'), str('reprise') ? `reprise le ${dateCourte(str('reprise'))}` : ''].filter(Boolean).join(' · '); }
      else if (e === 'retire') { titre = 'Retiré de la vente'; detail = str('raison'); }
      else if (e === 'estimation') { titre = d.de === 'a_suivre' ? 'Passé à l’estimation' : 'Revenu à l’estimation'; detail = str('rdv') ? `rendez-vous le ${dateCourte(str('rdv'))}` : ''; }
      else if (e === 'a_suivre') titre = 'Remis « à suivre »';
      l.push({ cle: x.id, le: x.le, ic: e === 'vendu' ? 'check' : e === 'retire' ? 'archive' : e === 'suspendu' ? 'pause' : 'drapeau', ton: e === 'vendu' ? 'ic_emilio' : e === 'retire' ? 'ic_rouge' : 'ic_vert', titre, detail: [detail, x.commentaire].filter(Boolean).join('\n'), genre: 'etapes', puce });
    } else if (x.type === 'prix') {
      l.push({ cle: x.id, le: x.le, ic: 'etiquette', ton: 'ic_violet', titre: `Prix changé : ${typeof d.ancien === 'number' ? `${euros(d.ancien)} → ` : ''}${euros(x.montant || 0)}`, detail: x.commentaire || '', genre: 'etapes' });
    } else if (x.type === 'note') {
      l.push({ cle: x.id, le: x.le, ic: 'bulle', ton: 'ic_gris', titre: 'Note', detail: x.commentaire || '', genre: 'notes', suppr: x.id });
    } else if (x.type === 'offre') {
      l.push({ cle: x.id, le: x.le, ic: 'euro', ton: 'ic_or', titre: `Offre de ${euros(x.montant || 0)} · ${x.qui || 'un acquéreur'}`,
        detail: [str('jusquau') ? `Valable jusqu’au ${dateCourte(str('jusquau'))}` : '', str('conditions')].filter(Boolean).join(' · '), genre: 'offres', puce: PUCE_OFFRE[x.statut || 'en_attente'] });
      if (str('reponse_le') && x.statut && x.statut !== 'en_attente') {
        l.push({ cle: x.id + '-r', le: `${str('reponse_le')}T18:00:00`, ic: x.statut === 'acceptee' ? 'check' : 'euro', ton: x.statut === 'acceptee' ? 'ic_vert' : 'ic_gris',
          titre: `Réponse à l’offre de ${x.qui || 'l’acquéreur'} : ${(PUCE_OFFRE[x.statut]?.l || x.statut).toLowerCase()}`, detail: [typeof d.contre === 'number' ? `Contre-offre du vendeur à ${euros(d.contre)}` : '', x.commentaire || ''].filter(Boolean).join(' · '), genre: 'offres' });
      }
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
    if (c.envoye_le || c.created_at) {
      l.push({ cle: 'p-' + c.id, le: c.envoye_le || c.created_at, ic: 'envoyer', ton: 'ic_or', genre: 'acheteurs',
        titre: c.envoye_le ? `Présenté à ${nom}` : `Mis dans la sélection de ${nom}`,
        detail: c.envoye_le ? 'Dans son espace, avec la note de correspondance' : 'Rien ne lui est encore envoyé',
        puce: c.vu_le ? { l: 'Fiche ouverte', c: '#0f766e', fond: '#f0fdfa', bord: '#99f6e4' } : undefined });
    }
    if (c.vu_le) l.push({ cle: 'o-' + c.id, le: c.vu_le, ic: 'oeil', ton: 'ic_gris', titre: `${nom} a ouvert la fiche`, genre: 'acheteurs', discret: true });
    if (c.retour_le && c.retour_client) l.push({ cle: 'r-' + c.id, le: c.retour_le, ic: 'bulle', ton: 'ic_bleu', titre: `${nom} a répondu`, detail: c.retour_client, genre: 'acheteurs' });
  }
  for (const v of det.visites) {
    const nom = nomClient(clients[v.client_id]);
    const iss = issueDe(v);
    const le = v.date_visite ? `${String(v.date_visite).slice(0, 10)}T${String(v.heure || '12:00').slice(0, 5)}:00` : v.created_at;
    const passe = v.statut === 'effectuee' || le < new Date().toISOString();
    l.push({ cle: 'vis-' + v.id, le, ic: 'cle', ton: 'ic_bleu', genre: 'visites',
      titre: v.statut === 'annulee' ? `Visite annulée · ${nom}` : passe ? `Visite · ${nom}` : `Visite prévue · ${nom}`,
      detail: v.statut === 'effectuee' ? String(v.commentaire || '') : '', discret: v.statut === 'annulee',
      puce: v.statut === 'annulee' ? undefined : iss ? puceIssue(iss) : passe ? PUCE_CR : undefined });
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
      chez: j.client_id ? { id: j.client_id, l: proprio ? `Dans le Suivi de ${nom} · propriétaire` : `Dans le Suivi de ${nom} · acheteur${j.bien_id && copieDe.get(j.bien_id)?.etape === 'selection' ? ', bien en sélection' : ''}` } : undefined,
    });
  }
  /* Une visite prévue et pas encore passée est dans « À venir », pas dans l'histoire. */
  const maintenant = new Date().toISOString();
  return l.filter(e => e.le && !(e.genre === 'visites' && e.titre.startsWith('Visite prévue') && e.le > maintenant)).sort((p, q) => q.le.localeCompare(p.le));
}

/* ══ LA FICHE ═════════════════════════════════════════════════════════════ */
export default function FicheBien({ bien: depart, liste, onRetour, onMaj, onSupprime, onModifier, onNavigate, onRecharger }: {
  bien: BienVente; liste: ListeBiens;
  onRetour: () => void; onMaj: (b: BienVente) => void; onSupprime: (id: string) => void;
  onModifier: (etape?: string) => void; onNavigate: (page: string, data?: unknown) => void; onRecharger: () => void;
}) {
  const [bien, setBien] = useState<BienVente>(depart);
  useEffect(() => { setBien(depart); }, [depart]);
  /* La barre des fiches ouvertes (en bas de l'écran) : ce bien y prend
     place, et s'y allume tant qu'il est à l'écran. */
  const titreBarre = titreBien(bien.donnees || {});
  const villeBarre = txt(bien.donnees || {}, 'ville') || bien.ville || '';
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
  /* « Voir les acheteurs » depuis une alerte : la fiche s'ouvre sur l'onglet (V3.29). */
  const [onglet, setOnglet] = useState<Onglet>(() => {
    const o = typeof window === 'undefined' ? null : lireOngletBien(depart.id);
    return o === 'acheteurs' || o === 'visites' || o === 'historique' || o === 'documents' ? o : 'apercu';
  });
  useEffect(() => { oublierOngletBien(); }, []);
  const [menu, setMenu] = useState<'etape' | 'plus' | null>(null);
  const [fen, setFen] = useState<Fen | null>(null);
  const [cr, setCr] = useState<VisiteU | null>(null);
  const [message, setMessage] = useState<{ t: string; ok: boolean } | null>(null);
  const [visite, setVisite] = useState(false);
  const d = bien.donnees || {};

  const charger = useCallback(async () => {
    try { setDetail(await chargerFiche(bien)); setErreur(''); } catch (e) { setErreur((e as Error).message); }
  }, [bien]);
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

  const acheteurs = useMemo(() => acheteursPour(bien, liste.recherches, liste.clients, detail?.copies || []), [bien, liste, detail]);
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
      const id = await creerDocument(bien, x);
      onNavigate('documents', { ouvrir: id });
    } catch (e) { setMessage({ t: (e as Error).message, ok: false }); }
  }
  const ouvrirDoc = (id: string) => onNavigate('documents', { ouvrir: id });

  async function statutOffre(o: SuiviVente, statut: string, contre?: number) {
    try {
      await majSuivi(o.id, { statut, donnees: { ...o.donnees, reponse_le: new Date().toISOString().slice(0, 10), ...(contre ? { contre } : {}) } });
      await apres();
    } catch (e) { setMessage({ t: (e as Error).message, ok: false }); }
  }
  async function annulerVisite(v: VisiteU) {
    if (!confirm(`Annuler la visite de ${v.qui} ?`)) return;
    try {
      if (v.crm) await annulerVisiteCRM(v.crm.id); else if (v.libre) await annulerVisiteLibre(v.libre);
      await apres();
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
  function offreEcrite(o: SuiviVente) {
    const cl = o.client_id ? liste.clients[o.client_id] : null;
    faireDocument({
      modele: 'offre_achat', clientId: o.client_id, rechercheId: o.recherche_id, offre: o,
      personne: cl ? { civilite: '', prenom: cl.prenom || '', nom: cl.nom || '', nomNaissance: '', naissanceDate: '', naissanceLieu: '', adresse: cl.adresse || '', email: cl.emails?.[0] || '', telephone: cl.telephones?.[0] || '' } : null,
    });
  }
  async function archiverBien() {
    try { const r = await majBien(bien.id, { archive: !bien.archive }); setMenu(null); await apres(r); } catch (e) { setMessage({ t: (e as Error).message, ok: false }); }
  }
  async function supprimer() {
    setMenu(null);
    if (!confirm('Supprimer ce bien, ses photos, son dossier et son historique ?\n\nLes acheteurs à qui il a été présenté le gardent dans leur dossier. Cette suppression est définitive : pour le ranger simplement, archive-le.')) return;
    try { await supprimerBien(bien); onSupprime(bien.id); } catch (e) { setMessage({ t: (e as Error).message, ok: false }); }
  }

  /* Le dossier se coche depuis la fiche : chaque clic s'enregistre, dans l'ordre. */
  const file = useRef<Promise<unknown>>(Promise.resolve());
  const majDonnees = useCallback((cle: string, v: unknown) => {
    setBien(prev => {
      const n = { ...prev, donnees: { ...(prev.donnees || {}), [cle]: typeof v === 'function' ? (v as (avant: unknown) => unknown)(prev.donnees?.[cle]) : v } };
      file.current = file.current.then(() => enregistrerBien(n.id, n.donnees).then(r => onMaj(r)).catch(e => setMessage({ t: (e as Error).message, ok: false })));
      return n;
    });
  }, [onMaj]);

  /* ── Le menu d'étape : ce qui peut arriver ensuite ── */
  type Choix = { t: string; s: string; c: string; go: () => void; danger?: boolean };
  const raison = (etape: EtapeVente, titre: string, sur: string) => () => setFen({ k: 'raison', etape, titre, sur });
  const suite: Choix[] = [];
  const e = bien.etape;
  if (e === 'a_suivre') {
    suite.push({ t: 'On passe à l’estimation…', s: 'Le bien passe « Estimation »', c: etapeDe('estimation').c, go: () => setFen({ k: 'estimation' }) });
    suite.push({ t: 'Le mandat est signé…', s: 'Le bien passe « En vente »', c: etapeDe('mandat').c, go: () => setFen({ k: 'mandat' }) });
    suite.push({ t: 'Le propriétaire renonce…', s: 'Retiré, gardé dans l’historique', c: etapeDe('retire').c, go: raison('retire', 'Le propriétaire renonce', 'Le bien passe « Retiré »') });
  }
  if (e === 'estimation') {
    suite.push({ t: 'Le mandat est signé…', s: 'Le bien passe « En vente »', c: etapeDe('mandat').c, go: () => setFen({ k: 'mandat' }) });
    suite.push({ t: 'Le vendeur renonce…', s: 'Retiré, gardé dans l’historique', c: etapeDe('retire').c, go: raison('retire', 'Retirer de la vente', 'Le bien passe « Retiré »') });
  }
  if (e === 'mandat') {
    suite.push({ t: 'Une offre est arrivée…', s: 'Le bien passe « Sous offre »', c: etapeDe('offre').c, go: () => setFen({ k: 'offre' }) });
    suite.push({ t: 'Mettre la vente en pause…', s: 'Le vendeur fait une pause', c: etapeDe('suspendu').c, go: raison('suspendu', 'Mettre la vente en pause', 'Le bien passe « En pause »') });
    suite.push({ t: 'Changer le prix…', s: 'Garde l’historique des prix', c: '#8b5cf6', go: () => setFen({ k: 'prix' }) });
    suite.push({ t: 'Mandat terminé sans vente…', s: 'Expiré, retiré, vendu par un autre', c: etapeDe('retire').c, go: raison('retire', 'Mandat terminé sans vente', 'Le bien passe « Retiré »') });
  }
  if (e === 'offre') {
    suite.push({ t: 'Le compromis est signé…', s: 'Le bien passe « Sous compromis »', c: etapeDe('compromis').c, go: () => setFen({ k: 'compromis' }) });
    suite.push({ t: 'Une autre offre…', s: 'Elles s’affichent côte à côte', c: etapeDe('offre').c, go: () => setFen({ k: 'offre' }) });
    suite.push({ t: 'L’offre est tombée…', s: 'Le bien repasse « En vente »', c: etapeDe('mandat').c, go: () => setFen({ k: 'mandat' }) });
    suite.push({ t: 'Changer le prix…', s: 'Garde l’historique des prix', c: '#8b5cf6', go: () => setFen({ k: 'prix' }) });
  }
  if (e === 'compromis') {
    suite.push({ t: 'La vente est signée…', s: 'Le bien passe « Vendu »', c: etapeDe('vendu').c, go: () => setFen({ k: 'vendu' }) });
    suite.push({ t: 'Le compromis est tombé…', s: 'Le bien repasse « En vente »', c: etapeDe('mandat').c, go: () => setFen({ k: 'mandat' }) });
  }
  if (e === 'suspendu' || e === 'retire') {
    suite.push({ t: 'Remettre en vente…', s: 'Le bien repasse « En vente »', c: etapeDe('mandat').c, go: () => setFen({ k: 'mandat' }) });
    if (e === 'suspendu') suite.push({ t: 'Mandat terminé sans vente…', s: 'Expiré, retiré, vendu par un autre', c: etapeDe('retire').c, go: raison('retire', 'Mandat terminé sans vente', 'Le bien passe « Retiré »') });
  }
  if (e === 'vendu' || e === 'retire') suite.push({ t: bien.archive ? 'Sortir des archives' : 'Archiver', s: bien.archive ? 'Il revient dans la liste' : 'Il quitte la liste, retrouvable dans « Archivés »', c: '#94a3b8', go: archiverBien });

  const et = etapeDe(e);
  const visitesAVenir = visites.filter(v => v.statut === 'a_venir' && !passee(v));
  const nbVisites = visites.filter(v => v.statut !== 'annulee').length;
  const offresOuvertes = offres.filter(o => o.statut === 'en_attente' || o.statut === 'contre');
  const docsLies = detail?.docs || [];
  const nbPhotos = lirePhotos(d.photos).length;
  const avant = avantMandat(e);
  const ONGLETS: { k: Onglet; l: string; n?: number; ic: string }[] = [
    { k: 'apercu', l: 'Vue d’ensemble', ic: 'oeil' }, { k: 'bien', l: 'Le bien', ic: 'maison' }, { k: 'photos', l: 'Photos', n: nbPhotos, ic: 'photo' },
    ...(avant ? [] : [{ k: 'visites' as Onglet, l: 'Visites et offres', n: nbVisites + offres.length, ic: 'cle' }]),
    { k: 'acheteurs', l: 'Acheteurs', n: acheteurs.filter(a => a.corr.note >= SEUIL_CORRESPOND).length, ic: 'cible' },
    { k: 'documents', l: 'Documents', n: docsLies.length, ic: 'plume' }, { k: 'historique', l: 'Historique', ic: 'historique' },
  ];

  const blocNotes = <BlocObservations d={d} onModifier={() => onModifier('observations')} />;

  /* ── La Vue d'ensemble (V3.29) : les quatre cartes, puis le détail ── */
  const mode = modeAcheteurs(e);
  const estim = lireEstim(d);
  const fourchette = estim.basse && estim.haute ? `${euros(estim.basse).replace(/\s€$/, '')} – ${euros(estim.haute)}` : estim.basse || estim.haute ? euros((estim.basse || estim.haute) as number) : '';
  const persP = (Array.isArray(d.proprietaires) ? d.proprietaires : []) as Record<string, string>[];
  const nomP = nomProprio(d) || (proprio ? nomClient(proprio) : '');
  const telP = proprio?.telephones?.[0] || persP.find(p => p?.telephone)?.telephone || '';
  const plurielP = d.qui === 'couple' || d.qui === 'indivision' || persP.filter(p => p && (p.nom || p.prenom)).length > 1;
  const sousP = recherchesProprio.length ? (plurielP ? 'cherchent aussi à acheter' : 'cherche aussi à acheter') : [lib(d, 'motif'), lib(d, 'delai')].filter(Boolean).join(' · ');
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

  /* ── Documents : une tuile par sorte ── */
  const docsDe = (m: string) => docsLies.filter(x => x.modele === m);
  const mandats = docsDe('mandat_vente');
  const mandatSigne = mandats.find(x => x.signe_le) || null;
  const signeLe = mandatSigne?.signe_le || txt(d, 'mandatDate');
  const typeMandat = d.mandatType ? (NOM_MANDAT[String(d.mandatType)] || '').toLowerCase() : '';
  const enMandat = !avant && !!signeLe;
  const tuileMandat = (
    <Tuile ton={enMandat ? 'marine' : 'blanc'} ic="plume" icFond={enMandat ? 'rgba(232,201,106,.16)' : '#eef2f8'} icC={enMandat ? '#e8c96a' : '#34496e'} titre="Mandat de vente"
      puce={enMandat ? { l: `Signé le ${dateCourte(signeLe)}${typeMandat ? ` · ${typeMandat}` : ''}`, fond: 'rgba(74,222,128,.16)', c: '#86efac' }
        : mandats.length ? { l: 'En préparation', fond: '#fbf6e9', c: '#7a5d1c' } : null}
      note={!enMandat && !mandats.length ? 'Prérempli avec le bien, le propriétaire, le prix et les honoraires.' : undefined}>
      {mandats.length > 0 && <BtnTuile marine={enMandat} onClick={() => ouvrirDoc((mandatSigne || mandats[0]).id)}>Voir</BtnTuile>}
      <BtnTuile marine={enMandat} onClick={() => faireDocument({ modele: 'mandat_vente' })}>{mandats.length ? 'Nouveau' : 'Préparer'}</BtnTuile>
    </Tuile>
  );
  const offresDocs = docsDe('offre_achat');
  const bons = docsDe('bon_visite');
  const bonsSignes = bons.filter(x => x.signe_le).length;
  const nbSt = (k: string) => offres.filter(x => (x.statut || 'en_attente') === k).length;
  const resumeOffres = [
    nbSt('en_attente') + nbSt('contre') ? `${nbSt('en_attente') + nbSt('contre')} en attente` : '',
    nbSt('acceptee') ? `${nbSt('acceptee')} acceptée${nbSt('acceptee') > 1 ? 's' : ''}` : '',
    nbSt('refusee') ? `${nbSt('refusee')} refusée${nbSt('refusee') > 1 ? 's' : ''}` : '',
    nbSt('retiree') ? `${nbSt('retiree')} retirée${nbSt('retiree') > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ');
  const compromisLe = (detail?.suivi || []).find(x => x.type === 'etape' && x.statut === 'compromis')?.le || '';
  const accepte = offres.some(x => x.statut === 'acceptee');
  const tuilesVente = (
    <>
      <Tuile ton={offresOuvertes.length ? 'or' : 'blanc'} ic="euro" icFond="#fbf1d6" icC="#a07c28" titre="Offres d’achat"
        puce={resumeOffres ? { l: resumeOffres, fond: '#fbf6e9', c: '#7a5d1c' } : null} note={resumeOffres ? undefined : 'Aucune pour l’instant.'}>
        {offresDocs.length > 0 && <BtnTuile onClick={() => ouvrirDoc(offresDocs[0].id)}>Voir</BtnTuile>}
        <BtnTuile onClick={() => faireDocument({ modele: 'offre_achat' })}>Nouvelle</BtnTuile>
      </Tuile>
      <Tuile ic="calendrier" icFond="#f5f3ff" icC="#6d28d9" titre="Bons de visite"
        puce={bons.length ? { l: [bonsSignes ? `${bonsSignes} signé${bonsSignes > 1 ? 's' : ''}` : '', bons.length - bonsSignes ? `${bons.length - bonsSignes} en préparation` : ''].filter(Boolean).join(' · '), fond: '#f5f3ff', c: '#6d28d9' } : null}
        note={bons.length ? undefined : 'Un par visite, prérempli avec l’acheteur et le bien.'}>
        {bons.length > 0 && <BtnTuile onClick={() => ouvrirDoc(bons[0].id)}>Voir</BtnTuile>}
        <BtnTuile onClick={() => faireDocument({ modele: 'bon_visite' })}>Nouveau</BtnTuile>
      </Tuile>
      {compromisLe || e === 'compromis' || e === 'vendu' ? (
        <Tuile ic="doc" icFond="#eff6ff" icC="#1d4ed8" titre="Compromis" puce={{ l: compromisLe ? `Signé le ${dateCourte(compromisLe)}` : 'Signé', fond: '#eff6ff', c: '#1d4ed8' }} />
      ) : accepte ? (
        <Tuile ton="or" ic="doc" icFond="#fbf1d6" icC="#a07c28" titre="Compromis" note="Une offre est acceptée : quand le compromis est signé, le bien passe « Sous compromis ».">
          <BtnTuile onClick={() => setFen({ k: 'compromis' })}>Compromis signé</BtnTuile>
        </Tuile>
      ) : (
        <Tuile ton="vide" ic="doc" icFond="#f1f5f9" icC="#94a3b8" titre="Compromis" note="S’ouvrira quand une offre sera acceptée." />
      )}
    </>
  );
  const lignesDoss = lignesDossier(d);
  const doss = lireDossier(d.dossier);
  const compteDossier = {
    recus: lignesDoss.filter(l => doss[l.k]?.etat === 'recu').length,
    demandes: lignesDoss.filter(l => doss[l.k]?.etat === 'demande').length,
    nc: lignesDoss.filter(l => doss[l.k]?.etat === 'nc').length,
    total: lignesDoss.length,
  };

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
        <button type="button" className={b.retour} onClick={onRetour}><Ic n="retour" t={16} />Biens</button>
        <div className={b.barreActions}>
          {avant && <button type="button" className={`${s.btn} ${b.btnVisite}`} onClick={() => setVisite(true)}><Ic n="tablette" t={16} /><span className={b.etLong}>Visite sur place</span><span className={b.etCourt}>Visite</span></button>}
          <button type="button" className={`${s.btn} ${b.masquable}`} onClick={() => onModifier()}><Ic n="crayon" t={15} />Modifier</button>
          {!avant && <button type="button" className={`${s.btn} ${b.masquable}`} onClick={() => setFen({ k: 'visite' })}><Ic n="plus" t={15} e={2.4} />Visite</button>}
          {/* La note, en un clic : elle était cachée dans « ⋯ ». */}
          <button type="button" className={`${s.btn} ${b.masquable}`} onClick={() => setFen({ k: 'note' })}><Ic n="bulle" t={15} />Note</button>
          <button type="button" className={b.btnEtape} aria-haspopup="menu" aria-expanded={menu === 'etape'} onClick={() => setMenu(menu === 'etape' ? null : 'etape')}>
            <span className={`${b.point} ${b.pointVivant}`} style={{ background: et.c, ['--halo' as string]: et.c } as React.CSSProperties} /><span className={b.etLong}>{et.lib}</span><span className={b.etCourt}>{et.court}</span>{bien.archive ? ' · archivé' : ''}<Ic n="bas" t={14} e={2.6} />
          </button>
          <button type="button" className={s.btn} aria-label="Plus d’actions" aria-haspopup="menu" aria-expanded={menu === 'plus'} onClick={() => setMenu(menu === 'plus' ? null : 'plus')}><Ic n="points" t={16} e={2.6} /></button>
          {menu && <div className={b.voileMenu} onClick={() => setMenu(null)} />}
          {menu === 'etape' && (
            <div className={b.menu} role="menu">
              <div className={b.menuT}>{suite.length ? 'Ensuite' : 'Étape'}</div>
              {suite.map(x => (
                <button key={x.t} type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); x.go(); }}>
                  <span className={b.point} style={{ background: x.c }} /><span><b>{x.t}</b><small>{x.s}</small></span>
                </button>
              ))}
            </div>
          )}
          {menu === 'plus' && (
            <div className={b.menu} role="menu">
              <button type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); onModifier(); }}><Ic n="crayon" t={16} /><span><b>Modifier la fiche</b><small>Étape par étape ou tout sur une page</small></span></button>
              <button type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); setFen({ k: 'visite' }); }}><Ic n="cle" t={16} /><span><b>Planifier une visite</b><small>Un acheteur suivi, ou quelqu’un hors du CRM</small></span></button>
              <button type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); setFen({ k: 'offre' }); }}><Ic n="euro" t={16} /><span><b>Enregistrer une offre</b><small>Montant, financement, validité</small></span></button>
              <button type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); setFen({ k: 'prix' }); }}><Ic n="etiquette" t={16} /><span><b>Changer le prix</b><small>L’ancien reste dans l’historique</small></span></button>
              <button type="button" role="menuitem" className={b.menuItem} onClick={() => { setMenu(null); setFen({ k: 'note' }); }}><Ic n="bulle" t={16} /><span><b>Ajouter une note</b><small>Dans l’historique du bien</small></span></button>
              <div className={b.menuSep} />
              <button type="button" role="menuitem" className={b.menuItem} onClick={archiverBien}><Ic n="archive" t={16} /><span><b>{bien.archive ? 'Sortir des archives' : 'Archiver'}</b><small>{bien.archive ? 'Il revient dans la liste' : 'Il quitte la liste, sans rien perdre'}</small></span></button>
              <button type="button" role="menuitem" className={`${b.menuItem} ${b.menuDanger}`} onClick={supprimer}><Ic n="corbeille" t={16} /><span><b>Supprimer</b><small>Définitif : photos, dossier, historique</small></span></button>
            </div>
          )}
        </div>
      </div>

      <Bandeau bien={bien} detail={detail} surCarte={() => onNavigate('carte', { focus: `b:${bien.id}` })} />

      {/* Les rubriques, à cheval sur le bas du bandeau : elles en sortent.
          La pastille glisse d'un onglet à l'autre, le contenu arrive en
          fondu (V3.28, src/components/shared/OngletsGlissants.tsx). */}
      <BarreOnglets label="Rubriques du bien" className={b.ongletsCheval} actif={onglet} onChoisir={setOnglet}
        onglets={ONGLETS.map(o => ({ k: o.k, l: o.l, n: o.n, ic: <Ic n={o.ic} t={15} /> }))} />

      {message && <div className={message.ok ? s.note : s.erreur}>{message.t}</div>}
      {erreur && <div className={s.erreur}>{erreur}</div>}

      <CorpsOnglet k={onglet} ordre={ONGLETS.map(o => o.k)}>
      {onglet === 'apercu' && (
        <div className={b.col}>
          <Kpis n={avant ? 3 : 4}>
            {avant
              ? <CarteEstimation rdv={txt(d, 'rdvEstimation')} fourchette={fourchette} prix={estim.prix || null} suivre={e === 'a_suivre'} proprio={nomP}
                  onDefinir={() => setFen({ k: 'estim' })} onEstimation={() => setFen({ k: 'estimation' })} />
              : <CarteMandat type={d.mandatType ? NOM_MANDAT[String(d.mandatType)] || '' : ''} numero={txt(d, 'mandatNumero') || bien.mandat_numero || ''}
                  signe={txt(d, 'mandatDate')} fin={txt(d, 'mandatFin')} onModifier={() => onModifier('prix')} />}
            <CarteAcheteurs acheteurs={acheteurs} mode={mode} onVoir={() => setOnglet('acheteurs')} />
            {!avant && <CarteVisites nbVisites={nbVisites} nbAVenir={visitesAVenir.length} nbOffres={offresOuvertes.length} repartition={repartition} onVoir={() => setOnglet('visites')} />}
            <CarteProprio nom={nomP} sous={sousP} tel={telP} pluriel={plurielP} onFiche={proprio ? () => ouvrirClient(proprio.id) : undefined} onModifier={() => onModifier('proprio')} />
          </Kpis>
          {offresOuvertes.map(o => (
            <div key={o.id} className={b.encart}><b>{`Offre de ${o.qui || 'un acquéreur'} : ${euros(o.montant || 0)}`}</b>{typeof o.donnees?.jusquau === 'string' && o.donnees.jusquau ? ` · réponse attendue le ${dateCourte(String(o.donnees.jusquau))}` : ''}</div>
          ))}
          {avant && <ListeAcheteurs acheteurs={acheteurs} mode={mode} nbRecherches={liste.recherches.length} onFiche={ouvrirClient} max={5} onTout={() => setOnglet('acheteurs')} />}
          <Faits d={d} vide="Surface, pièces, étage, extérieur… : « Modifier » pour les saisir." />
          <div className={b.deuxEgal}>
            <div className={b.col}>
              {avant && <BlocVisiteSurPlace d={d} onOuvrir={() => setVisite(true)} />}
              {avant && <BlocEstimation bien={bien} onDefinir={() => setFen({ k: 'estim' })} onEstimation={() => setFen({ k: 'estimation' })} onMandat={() => setFen({ k: 'mandat' })} />}
              {!avant && <BlocProchaines items={prochaines} onVoir={() => setOnglet('visites')} onAjouter={() => setFen({ k: 'visite' })} onFiche={ouvrirClient} />}
              {e !== 'vendu' && <BlocVisite d={d} onModifier={() => onModifier('pratique')} />}
              {!avant && <BlocDossierResume d={d} onVoir={() => setOnglet('documents')} />}
            </div>
            <div className={b.col}>
              <BlocDernierement items={recents} onTout={() => setOnglet('historique')} />
              <BlocProprio bien={bien} proprio={proprio} recherchesProprio={recherchesProprio} onFiche={ouvrirClient} onModifier={() => onModifier('proprio')} />
              {e === 'estimation' && <BlocDossierResume d={d} onVoir={() => setOnglet('documents')} />}
              {blocNotes}
            </div>
          </div>
        </div>
      )}

      {onglet === 'bien' && <OngletBien bien={bien} onModifier={onModifier} onPhotos={() => setOnglet('photos')} />}

      {onglet === 'photos' && (
        <Bloc ic="photo" titre={<>{'Les photos'}<i>{nbPhotos ? ` · ${nbPhotos}` : ''}</i></>}>
          <p className={b.sous}>La première est la photo principale : elle illustre la carte, la fiche et l’annonce. Les flèches les rangent, l’étoile en fait la principale, la légende se tape sous chaque photo.</p>
          <ChampPhotos d={d} maj={majDonnees} off={false} bienId={bien.id} grand />
        </Bloc>
      )}

      {onglet === 'visites' && (
        <Deux>
          {!detail ? <div className={b.vide}>Chargement…</div> : (
            <ListeVisites visites={visitesCartes} onAjouter={() => setFen({ k: 'visite' })} rendre={(vc, prochaine) => {
              const v = visites.find(x => x.cle === vc.cle);
              if (!v) return null;
              return <CarteVisiteB v={vc} prochaine={prochaine} onCR={() => setCr(v)} onAnnuler={() => annulerVisite(v)} onDoc={() => bonDeVisite(v)} onFiche={v.clientId ? () => ouvrirClient(v.clientId!) : undefined} />;
            }} />
          )}
          <Col gap={10}>
            <TitreSec action={<BoutonAct onClick={() => setFen({ k: 'offre' })}><Ic n="plus" t={13} e={2.6} />Offre</BoutonAct>}>Les offres</TitreSec>
            {offres.length === 0 ? <div className={b.vide}>Aucune offre pour l’instant. « + Offre » l’enregistre : montant, financement, validité.</div> : offresTriees.map(x => (
              <CarteOffreB key={x.id} o={x} prix={argentBien(d).prix} compromis={e === 'compromis' || e === 'vendu'}
                onStatut={st => statutOffre(x, st)}
                onContre={() => {
                  const r = prompt('Montant de la contre-offre du vendeur, en euros :', x.montant ? String(x.montant) : '');
                  const n = r ? Number(r.replace(/[\s  €]/g, '').replace(',', '.')) : NaN;
                  if (Number.isFinite(n) && n > 0) statutOffre(x, 'contre', n);
                }}
                onDoc={() => offreEcrite(x)}
                onPiece={typeof x.donnees?.chemin === 'string' && x.donnees.chemin ? () => ouvrirPiece(String(x.donnees.chemin), String(x.donnees.nom || 'offre.pdf')) : undefined} />
            ))}
            {bien.etape === 'offre' && offres.length > 0 && !offresOuvertes.length && !offres.some(x => x.statut === 'acceptee') && (
              <div className={b.encart}>{'Plus aucune offre en cours. '}<button type="button" className={b.lien} onClick={() => setFen({ k: 'mandat' })}>Remettre le bien en vente</button></div>
            )}
            {bien.etape === 'offre' && offres.some(x => x.statut === 'acceptee') && (
              <div className={b.encart}>{'Une offre est acceptée : quand le compromis est signé, '}<button type="button" className={b.lien} onClick={() => setFen({ k: 'compromis' })}>passe le bien « Sous compromis »</button></div>
            )}
          </Col>
        </Deux>
      )}

      {onglet === 'acheteurs' && (
        <div className={b.col}>
          <ListeAcheteurs key={(detail?.copies || []).map(c => `${c.id}${c.etape || ''}`).join()} acheteurs={acheteurs} mode={mode}
            nbRecherches={liste.recherches.length} onFiche={ouvrirClient}
            onAgir={mode === 'vente' ? l => setFen({ k: 'acheteurs', liste: l }) : undefined} />
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
        <Deux>
          <Col gap={12}>
            <TitreSec>Les documents</TitreSec>
            {detail?.erreurDocs && <div className={s.erreur}>{detail.erreurDocs}</div>}
            <Tuiles>
              {tuileMandat}
              {!avant && tuilesVente}
            </Tuiles>
            <ListeDocs docs={docsLies.map(x => {
              const st = STATUTS[x.statut] || STATUTS.brouillon;
              return {
                id: x.id, ic: modele(x.modele)?.ic || 'doc', titre: x.titre || modele(x.modele)?.titre || 'Document',
                sous: `Créé le ${dateCourte(x.created_at)}${x.signe_le ? ` · signé le ${dateCourte(x.signe_le)}` : ''}`,
                statut: <span className={`${s.statut} ${s.statutFort} ${s['t_' + st.ton]}`}>{st.l}</span>, ouvrir: () => ouvrirDoc(x.id),
              };
            })} />
            <div className={b.pied}>Préremplis avec le bien, le propriétaire, le prix et les honoraires. Ils s’ouvrent dans Documents, et restent reliés au bien.</div>
            <BlocMandat bien={bien} docs={docsLies} onDoc={faireDocument} onOuvrirDoc={ouvrirDoc} onMandat={() => setFen({ k: 'mandat' })} />
          </Col>
          <CarteDossier {...compteDossier}>
            <ChampDossier d={d} maj={majDonnees} off={false} bienId={bien.id} />
          </CarteDossier>
        </Deux>
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
      {fen?.k === 'mandat' && <FenMandat bien={bien} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {fen?.k === 'estimation' && <FenEstimation bien={bien} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
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
      {fen?.k === 'offre' && <FenOffre bien={bien} options={options} recherches={liste.recherches} proprio={proprio} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {fen?.k === 'compromis' && <FenCompromis bien={bien} offres={offres} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {fen?.k === 'vendu' && <FenVendu bien={bien} compromis={(detail?.suivi || []).find(x => x.type === 'etape' && x.statut === 'compromis') || null} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {fen?.k === 'prix' && <FenPrix bien={bien} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {fen?.k === 'visite' && <FenVisite bien={bien} options={options} recherches={liste.recherches} onFermer={() => setFen(null)} onFait={() => apres()} />}
      {fen?.k === 'note' && <FenNote bien={bien} onFermer={() => setFen(null)} onFait={() => apres()} />}
      {fen?.k === 'raison' && <FenRaison bien={bien} etape={fen.etape} titre={fen.titre} sur={fen.sur} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
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
