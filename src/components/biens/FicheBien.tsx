'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { euros } from '@/lib/mandat';
import { num, txt, liste, STATUTS, modele } from '@/lib/actes';
import { ISSUES, issueDe, type Issue } from '@/lib/visites';
import CompteRenduVisite, { enregistrerCompteRendu } from '@/components/shared/CompteRenduVisite';
import {
  ETAPES_BIEN, PARCOURS, argentBien, controleAnnonce, dateCourte, etapeDe, etageTexte, joursAvant,
  lireDossier, lignesDossier, lirePhotos, lirePieces, m2, nomExpo, nomProprio, passoire, pourcent, titreBien,
  type BienVente, type Donnees, type EtapeVente, type SuiviVente,
} from '@/lib/biens-vente';
import { Ic } from '@/components/documents/ApercuActe';
import { Anneau, NOM_MANDAT, prixCarte } from './CarteBien';
import { COULEURS, ChampDossier, habitable } from './ChampsBien';
import {
  FenCompromis, FenMandat, FenNote, FenOffre, FenPrix, FenRaison, FenVendu, FenVisite, type OptionAcheteur,
} from './FenetresBien';
import {
  SEUIL_CORRESPOND, SEUIL_LISTE, acheteursPour, annulerVisiteCRM, annulerVisiteLibre, chargerFiche, creerDocument, enregistrerBien,
  envoyerDansEspace, ficheClient, initiales, majBien, majSuivi, nomClient, ouvrirPiece, supprimerBien, supprimerSuivi,
  type Acheteur, type ClientMini, type Copie, type DetailBien, type ListeBiens, type PourDocument, type VisiteRow,
} from './outils';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';

/* ═══ La fiche d'un bien en vente ═════════════════════════════════════════
   Le bandeau (photo, prix, étape), puis six onglets :
   · Vue d'ensemble : les acheteurs qui correspondent, l'essentiel du bien,
     les dernières visites et offres ; à droite le mandat, le propriétaire,
     la visite (codes, clés), les notes, le dossier.
   · Le bien : tout le détail, bloc par bloc (surfaces, pièces, immeuble,
     intérieur, extérieur, énergie, copropriété, charges et taxes, prix),
     les pièces une à une, les photos, l'annonce.
   · Visites et offres · Acheteurs · Documents · Historique (tout ce qui
     s'est passé sur le bien, du mandat aux comptes rendus).
   Chaque bloc a son « Modifier », qui ouvre l'éditeur à la bonne étape. */

type Onglet = 'apercu' | 'bien' | 'visites' | 'acheteurs' | 'documents' | 'historique';
type Fen =
  | { k: 'mandat' } | { k: 'offre' } | { k: 'compromis' } | { k: 'vendu' } | { k: 'prix' } | { k: 'visite' } | { k: 'note' }
  | { k: 'raison'; etape: EtapeVente; titre: string; sur: string };

/* ── Les mots des listes de choix, lus dans le formulaire ── */
const OPTIONS: Record<string, Record<string, string>> = {};
for (const e of ETAPES_BIEN) for (const c of e.champs) if (c.t === 'choix' || c.t === 'cases') OPTIONS[c.cle] = Object.fromEntries(c.options.map(o => [o.v, o.l]));
const lib = (d: Donnees, cle: string) => { const v = d[cle]; return typeof v === 'string' && v ? OPTIONS[cle]?.[v] || v : ''; };
const libs = (d: Donnees, cle: string) => liste(d, cle).map(v => OPTIONS[cle]?.[v] || v);
const ouiNon = (x: boolean) => (x ? 'Oui' : 'Non');
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
const STATUT_OFFRE: Record<string, { l: string; ton: string }> = {
  en_attente: { l: 'En attente de réponse', ton: 'e_or' }, acceptee: { l: 'Acceptée', ton: 'e_vert' }, refusee: { l: 'Refusée', ton: 'e_rouge' },
  contre: { l: 'Contre-offre', ton: 'e_bleu' }, retiree: { l: 'Retirée', ton: 'e_gris' },
};

/* ── Petits morceaux ── */
function Li({ l, v, cls }: { l: string; v: ReactNode; cls?: string }) {
  if (v === '' || v === null || v === undefined || v === false) return null;
  return <div className={`${b.li} ${cls || ''}`}><span>{l}</span><b>{v}</b></div>;
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
const passee = (v: VisiteU) => v.statut === 'faite' || (!!v.ymd && `${v.ymd}T${v.heure || '23:59'}` < new Date().toISOString().slice(0, 16));

/* ══ LE BANDEAU ═══════════════════════════════════════════════════════════ */
function Bandeau({ bien, detail }: { bien: BienVente; detail: DetailBien | null }) {
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
        {(adresse || txt(d, 'quartier')) && <div className={b.heroAdr}>{[adresse, txt(d, 'quartier')].filter(Boolean).join(' · ')}</div>}
        <div className={b.heroPrix}>
          <b>{prix.t}</b>
          {a.prix && a.hono !== null && a.net ? <span>{a.acq ? `honoraires ${euros(a.hono)} inclus · net vendeur ${euros(a.net)}` : `honoraires ${euros(a.hono)} à la charge du vendeur`}</span> : null}
        </div>
        {i >= 0 && (
          <div className={b.stepMobile} aria-hidden="true">
            <div className={b.stepBarres}>{PARCOURS.map((k, j) => <span key={k} className={j <= i ? b.stepPlein : undefined} />)}</div>
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

/* ══ LES ACHETEURS QUI CORRESPONDENT ═════════════════════════════════════ */
function detailCorr(a: Acheteur): { t: string; ok: boolean } {
  const pb = a.corr.lignes.filter(l => l.etat !== 'oui');
  if (!pb.length) return { t: `Tout correspond : ${a.corr.lignes.map(l => l.lib.toLowerCase()).slice(0, 5).join(', ')}`, ok: true };
  return { t: pb.slice(0, 2).map(l => `${l.lib} : ${l.valeur}, demandé ${l.demande}`).join(' · '), ok: false };
}

function LigneAcheteur({ a, coche, onCoche, onEnvoyer, onFiche, envoi }: {
  a: Acheteur; coche: boolean; onCoche: () => void; onEnvoyer: () => void; onFiche: () => void; envoi: boolean;
}) {
  const dt = detailCorr(a);
  const statut = String(a.client.statut || '');
  const badge = a.copie?.badge_retour ? BADGES[a.copie.badge_retour] : null;
  return (
    <div className={b.acheteur}>
      <button type="button" className={`${b.coche} ${coche ? b.cocheOn : ''}`} disabled={!!a.copie} aria-pressed={coche} aria-label={`Choisir ${nomClient(a.client)}`} onClick={onCoche}>
        {coche && <Ic n="check" t={13} e={3} />}
      </button>
      <Anneau note={a.corr.note} />
      <div className={b.achTxt}>
        <div className={b.achNom}>
          <button type="button" className={b.lien} style={{ padding: 0, fontSize: 14.5 }} onClick={onFiche}>{nomClient(a.client)}</button>
          {(statut === 'actif' || statut === 'prospect') && <span className={`${b.statutC} ${b['statut_' + statut]}`}>{statut === 'actif' ? 'Actif' : 'Prospect'}</span>}
          {a.recherche.budget_max ? <span>{`jusqu’à ${euros(a.recherche.budget_max)}`}</span> : null}
        </div>
        <div className={`${b.achDetail} ${dt.ok ? b.achOk : ''}`}>{dt.t}</div>
        {a.copie && (
          <div className={b.achEnvoye}>
            {`Dans son espace depuis le ${dateCourte(a.copie.envoye_le || a.copie.created_at)}`}
            {a.copie.vu_le ? ' · il l’a ouvert' : ''}
            {badge ? ` · ${badge.l.charAt(0).toLowerCase()}${badge.l.slice(1)}` : ''}
          </div>
        )}
      </div>
      {!a.copie && <button type="button" className={`${b.mini} ${b.achAction}`} disabled={envoi} onClick={onEnvoyer}><Ic n="envoyer" t={13} />Envoyer dans son espace</button>}
    </div>
  );
}

function BlocAcheteurs({ acheteurs, max, onTout, onEnvoyer, onFiche, nbRecherches }: {
  acheteurs: Acheteur[]; max?: number; onTout?: () => void; nbRecherches: number;
  onEnvoyer: (l: Acheteur[]) => Promise<void>; onFiche: (clientId: string) => void;
}) {
  const liste = acheteurs.filter(a => a.corr.note >= SEUIL_LISTE);
  const bons = liste.filter(a => a.corr.note >= SEUIL_CORRESPOND);
  const [choisis, setChoisis] = useState<string[]>(() => bons.filter(a => !a.copie).slice(0, 3).map(a => a.recherche.id));
  const [envoi, setEnvoi] = useState(false);
  const montres = max ? liste.slice(0, max) : liste;
  const aEnvoyer = liste.filter(a => choisis.includes(a.recherche.id) && !a.copie);
  async function envoyer(l: Acheteur[]) {
    if (!l.length) return;
    if (!confirm(l.length > 1 ? `Envoyer ce bien dans l’espace de ${l.length} acheteurs ?\n\nIl y arrive comme les biens de leur recherche, avec la note de correspondance ; ils sont prévenus sur leur téléphone s’ils l’ont accepté.` : `Envoyer ce bien dans l’espace de ${nomClient(l[0].client)} ?`)) return;
    setEnvoi(true);
    await onEnvoyer(l);
    setChoisis(c => c.filter(x => !l.some(a => a.recherche.id === x)));
    setEnvoi(false);
  }
  return (
    <Bloc ic="cible" titre={<>{'Acheteurs qui correspondent'}<i>{` · ${bons.length}`}</i></>}
      action={max && liste.length > max && onTout ? <Modifier onClick={onTout} lib={`Voir les ${liste.length}`} /> : undefined}>
      <p className={b.sous}>{`Parmi tes ${nbRecherches} recherche${nbRecherches > 1 ? 's' : ''} active${nbRecherches > 1 ? 's' : ''}, calculé avec la même note que dans leur espace.`}</p>
      {liste.length === 0 ? (
        <div className={b.vide}>Aucune recherche ne correspond pour l’instant. La liste se met à jour dès qu’un acheteur est suivi, ou que le prix change.</div>
      ) : (
        <>
          {aEnvoyer.length > 0 && (
            <button type="button" className={`${s.btn} ${s.btnOr}`} style={{ alignSelf: 'flex-start' }} disabled={envoi} onClick={() => envoyer(aEnvoyer)}>
              <Ic n="envoyer" t={15} />{envoi ? 'Envoi…' : aEnvoyer.length > 1 ? `Envoyer aux ${aEnvoyer.length} acheteurs choisis` : `Envoyer à ${nomClient(aEnvoyer[0].client)}`}
            </button>
          )}
          <div className={b.acheteurs}>
            {montres.map(a => (
              <LigneAcheteur key={a.recherche.id} a={a} envoi={envoi} coche={choisis.includes(a.recherche.id)}
                onCoche={() => setChoisis(c => (c.includes(a.recherche.id) ? c.filter(x => x !== a.recherche.id) : [...c, a.recherche.id]))}
                onEnvoyer={() => envoyer([a])} onFiche={() => onFiche(a.client.id)} />
            ))}
          </div>
          <div className={b.pied}>Le bien arrive dans leur espace comme ceux de leur recherche, avec la note. Ceux qui l’ont déjà ne sont pas cochés.</div>
        </>
      )}
    </Bloc>
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
function Chiffres({ d }: { d: Donnees }) {
  const enImm = !['maison', 'terrain'].includes(String(d.typeBien || ''));
  const asc = liste(d, 'immeuble').includes('ascenseur');
  const items: [string, string][] = [
    ['Surface', num(d, 'surface') ? m2(num(d, 'surface') as number) : num(d, 'terrain') ? `Terrain ${m2(num(d, 'terrain') as number)}` : '—'],
    ['Pièces', num(d, 'pieces') ? `${num(d, 'pieces')}${num(d, 'chambres') ? ` dont ${num(d, 'chambres')} ch.` : ''}` : '—'],
    [enImm ? 'Étage' : 'Niveaux', enImm ? (num(d, 'etage') !== null ? `${etageTexte(num(d, 'etage'), num(d, 'etages'))}${asc ? ', asc.' : ''}` : '—') : num(d, 'etages') ? String(num(d, 'etages')) : '—'],
    ['Extérieur', exterieurCourt(d)],
    ['DPE', d.dpeStatut === 'vierge' ? 'Vierge' : d.dpe ? `${d.dpe}${num(d, 'dpeValeur') ? ` · ${num(d, 'dpeValeur')} kWh` : ''}` : '—'],
    ['Charges', num(d, 'chargesAn') ? `${euros((num(d, 'chargesAn') as number) / 12)}/mois` : d.copro === 'non' ? 'Pas de copropriété' : '—'],
    ['Taxe foncière', eur(num(d, 'taxeFonciere')) || '—'],
    ['Construction', num(d, 'annee') ? String(num(d, 'annee')) : '—'],
  ];
  return <div className={b.chiffres}>{items.map(([l, v]) => <div key={l} className={b.chiffre}><span>{l}</span><b>{v}</b></div>)}</div>;
}

function LigneVisite({ v }: { v: VisiteU }) {
  const iss = v.issue ? ISSUES[v.issue] : null;
  const etat = v.statut === 'annulee' ? { t: 'Annulée', c: '#94a3b8' } : iss ? { t: iss.crm, c: iss.couleur } : passee(v) ? { t: 'Compte rendu à faire', c: '#b45309' } : { t: v.heure ? `À ${v.heure.replace(':', ' h ')}` : 'À venir', c: '#2563eb' };
  return (
    <div className={b.ligneV}>
      <span>{v.ymd ? jourCourt(v.ymd) : '—'}</span>
      <span><b>{v.qui}</b>{v.commentaire ? <i>{` · ${v.commentaire}`}</i> : null}</span>
      <span className={b.issue} style={{ color: etat.c }}>{etat.t}</span>
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
      action={mandatDoc ? <Modifier onClick={() => onOuvrirDoc(mandatDoc.id)} lib="Voir le document" /> : bien.etape === 'estimation' ? <Modifier onClick={onMandat} lib="Mandat signé ?" /> : undefined}>
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
  const vide = !['occupation', 'creneaux', 'contactNom', 'digicode', 'porte', 'cles', 'annexesNum', 'consignes', 'interphone'].some(k => d[k]);
  return (
    <Bloc ic="cle" titre="Pour la visite" action={<Modifier onClick={onModifier} />}>
      {vide ? <div className={b.vide}>Occupation, clés, codes, contact sur place : à remplir pour que chaque visite se passe sans appel.</div> : (
        <div className={b.lignes}>
          <Li l="Le bien est" v={[lib(d, 'occupation'), txt(d, 'disponible') ? `disponible ${txt(d, 'disponible')}` : ''].filter(Boolean).join(' · ')} />
          <Li l="Heures de visite" v={txt(d, 'creneaux')} />
          <Li l="Contact sur place" v={[txt(d, 'contactNom'), tel].filter(Boolean).join(' · ') ? <>{[txt(d, 'contactNom'), tel].filter(Boolean).join(' · ')}{tel && <a className={b.lien} style={{ marginLeft: 8 }} href={`tel:${tel.replace(/\s+/g, '')}`}>Appeler</a>}</> : ''} />
          <Li l="Digicode" v={code ? <>{code}<button type="button" className={b.lien} style={{ marginLeft: 8 }} onClick={() => { navigator.clipboard?.writeText(code).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1400); }).catch(() => {}); }}>{copie ? 'Copié' : 'Copier'}</button></> : ''} />
          <Li l="Interphone" v={txt(d, 'interphone')} />
          <Li l="Porte" v={txt(d, 'porte')} />
          <Li l="Clés" v={cles} />
          <Li l="Cave · box" v={txt(d, 'annexesNum')} />
        </div>
      )}
      {txt(d, 'consignes') && <div className={`${b.encart} ${b.encartBleu}`}>{txt(d, 'consignes')}</div>}
      <div className={b.pied}>Visible par toi seul. Reprise dans le rendez-vous de l’agenda pour une visite hors CRM.</div>
    </Bloc>
  );
}

function BlocDossierResume({ d, onVoir }: { d: Donnees; onVoir: () => void }) {
  const doss = lireDossier(d.dossier);
  const lignes = lignesDossier(d);
  const faits = lignes.filter(l => doss[l.k]?.etat === 'recu' || doss[l.k]?.etat === 'nc').length;
  return (
    <Bloc ic="dossier" titre={<>{'Le dossier'}<i>{` · ${faits} sur ${lignes.length}`}</i></>} action={<Modifier onClick={onVoir} lib="+ Déposer" />}>
      <div>
        {lignes.slice(0, 9).map(l => {
          const e = doss[l.k]?.etat || '';
          return (
            <div key={l.k} className={`${b.check} ${e === 'demande' ? b.checkAttente : e === 'nc' ? b.checkNc : ''}`}>
              <span className={`${b.checkK} ${e === 'recu' ? b.kOk : e === 'demande' ? b.kAttente : b.kVide}`}>{e === 'recu' ? <Ic n="check" t={11} e={3} /> : e === 'demande' ? '!' : ''}</span>
              <span>{`${l.l}${e === 'demande' ? ' · demandé' : e === 'nc' ? ' · non concerné' : ''}`}</span>
            </div>
          );
        })}
        {lignes.length > 9 && <button type="button" className={b.lien} onClick={onVoir}>{`Et ${lignes.length - 9} autres`}</button>}
      </div>
    </Bloc>
  );
}

/* ══ ONGLET « LE BIEN » ═══════════════════════════════════════════════════ */
function Echelle({ genre, v, valeur, unite }: { genre: 'dpe' | 'ges'; v: string; valeur: number | null; unite: string }) {
  return (
    <div className={b.echelle}>
      <div className={b.echT}>{genre === 'dpe' ? 'Énergie (DPE)' : 'Climat (GES)'}</div>
      {v ? ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((l, i) => {
        const c = COULEURS[genre][l];
        const on = l === v;
        return (
          <div key={l} className={`${b.echL} ${on ? b.echOn : ''}`}>
            <span className={b.echBarre} style={{ width: `${34 + i * 9}%`, background: c.f, color: c.t }}>{l}</span>
            {on && <span className={b.echVal}>{valeur ? <>{String(valeur).replace('.', ',')}<small>{` ${unite}`}</small></> : 'valeur à saisir'}</span>}
          </div>
        );
      }) : <div className={b.echVide}>Classe à saisir</div>}
    </div>
  );
}

function OngletBien({ bien, onModifier }: { bien: BienVente; onModifier: (etape: string) => void }) {
  const d = bien.donnees || {};
  const a = argentBien(d);
  const enImm = !['maison', 'terrain'].includes(String(d.typeBien || ''));
  const imm = liste(d, 'immeuble');
  const pieces = lirePieces(d.detailPieces);
  const photos = lirePhotos(d.photos);
  const niveaux = Array.from(new Set(pieces.map(p => p.niveau || 'Sans niveau')));
  const totalHab = pieces.filter(habitable).reduce((t, p) => t + (p.surface || 0), 0);
  const ctrl = controleAnnonce(d);
  const dpeFait = d.dpeStatut !== 'vierge' && d.dpeStatut !== 'non';
  const chargesAn = num(d, 'chargesAn');
  const surf = num(d, 'carrez') || num(d, 'surface');
  const M = (e: string) => <Modifier onClick={() => onModifier(e)} />;
  return (
    <div className={b.troisCol}>
      <Bloc ic="regle" titre="Surfaces" action={M('bien')}>
        <div className={b.lignes}>
          <Li l="Habitable" v={num(d, 'surface') ? m2(num(d, 'surface') as number) : ''} />
          <Li l="Loi Carrez" v={num(d, 'carrez') ? m2(num(d, 'carrez') as number) : ''} />
          <Li l="Séjour" v={num(d, 'sejour') ? m2(num(d, 'sejour') as number) : ''} />
          <Li l="Terrain" v={num(d, 'terrain') ? m2(num(d, 'terrain') as number) : ''} />
          <Li l="Balcon" v={num(d, 'surfBalcon') ? m2(num(d, 'surfBalcon') as number) : ''} />
          <Li l="Terrasse" v={num(d, 'surfTerrasse') ? m2(num(d, 'surfTerrasse') as number) : ''} />
          <Li l="Jardin" v={num(d, 'surfJardin') ? m2(num(d, 'surfJardin') as number) : ''} />
          {!num(d, 'surface') && !num(d, 'terrain') && <div className={b.vide}>Surfaces à saisir.</div>}
        </div>
      </Bloc>
      <Bloc ic="plan" titre="Pièces" action={M('bien')}>
        <div className={b.lignes}>
          <Li l="Pièces" v={num(d, 'pieces') ?? ''} />
          <Li l="Chambres" v={num(d, 'chambres') ?? ''} />
          <Li l="Salles de bains" v={num(d, 'sdb') ?? ''} />
          <Li l="Salles d’eau" v={num(d, 'salleseau') ?? ''} />
          <Li l="WC" v={num(d, 'wc') ?? ''} />
          <Li l="Cuisine" v={[lib(d, 'cuisine'), lib(d, 'cuisineEquip').toLowerCase()].filter(Boolean).join(', ')} />
        </div>
      </Bloc>
      <Bloc ic={enImm ? 'immeuble' : 'maison'} titre={enImm ? 'L’immeuble' : 'La maison'} action={M('bien')}>
        <div className={b.lignes}>
          {enImm && <Li l="Étage" v={num(d, 'etage') !== null ? etageTexte(num(d, 'etage'), num(d, 'etages')) : ''} />}
          {!enImm && <Li l="Niveaux" v={num(d, 'etages') ?? ''} />}
          {enImm && <Li l="Ascenseur" v={d.typeBien ? ouiNon(imm.includes('ascenseur')) : ''} />}
          <Li l="Construction" v={num(d, 'annee') ?? ''} />
          <Li l="N° de lot" v={txt(d, 'lot')} />
          <Li l="Cadastre" v={txt(d, 'cadastre')} />
          {imm.length > 0 && <div className={b.tags} style={{ marginTop: 6 }}>{libs(d, 'immeuble').map(x => <span key={x} className={b.tag}>{x}</span>)}</div>}
        </div>
      </Bloc>
      <Bloc ic="canape" titre="L’intérieur" action={M('interieur')}>
        <div className={b.lignes}>
          <Li l="État" v={lib(d, 'etat')} />
          <Li l="Chauffage" v={[lib(d, 'chauffageMode'), lib(d, 'chauffageEnergie').toLowerCase(), lib(d, 'chauffageEmetteurs') ? `par ${lib(d, 'chauffageEmetteurs').toLowerCase()}` : ''].filter(Boolean).join(', ')} />
          <Li l="Eau chaude" v={lib(d, 'eauChaude')} />
        </div>
        {liste(d, 'equipements').length > 0 && <div className={b.tags}>{libs(d, 'equipements').map(x => <span key={x} className={b.tag}>{x}</span>)}</div>}
        {txt(d, 'travaux') && <div className={b.texte}><b>Travaux : </b>{txt(d, 'travaux')}</div>}
        {txt(d, 'interieurNote') && <div className={b.texte}>{txt(d, 'interieurNote')}</div>}
        {!d.etat && !liste(d, 'equipements').length && !txt(d, 'interieurNote') && <div className={b.vide}>À décrire.</div>}
      </Bloc>
      <Bloc ic="terrain" titre="Extérieur et annexes" action={M('exterieur')}>
        {liste(d, 'annexes').length > 0 && <div className={b.tags}>{libs(d, 'annexes').map(x => <span key={x} className={b.tag}>{x}</span>)}</div>}
        <div className={b.lignes}>
          <Li l="Cave" v={num(d, 'surfCave') ? m2(num(d, 'surfCave') as number) : ''} />
          <Li l="Parking" v={num(d, 'nbParking') ? `${num(d, 'nbParking')} place${(num(d, 'nbParking') as number) > 1 ? 's' : ''}` : ''} />
          <Li l="Exposition" v={d.expo ? (d.expo === 'traversant' ? 'Traversant' : nomExpo(d.expo)) : ''} />
          <Li l="Vue" v={lib(d, 'vue')} />
          <Li l="Vis-à-vis" v={lib(d, 'visAVis')} />
        </div>
        {txt(d, 'exterieurNote') && <div className={b.texte}>{txt(d, 'exterieurNote')}</div>}
        {!liste(d, 'annexes').length && !d.expo && <div className={b.vide}>À décrire.</div>}
      </Bloc>
      <Bloc ic="eclair" titre="Énergie" action={M('energie')}>
        {d.dpeStatut === 'vierge' ? <div className={b.texte}>DPE vierge.</div> : d.dpeStatut === 'non' ? <div className={b.texte}>Non soumis au DPE.</div> : (
          <>
            <div className={b.energie}>
              <Echelle genre="dpe" v={String(d.dpe || '')} valeur={num(d, 'dpeValeur')} unite="kWh/m²/an" />
              <Echelle genre="ges" v={String(d.ges || '')} valeur={num(d, 'gesValeur')} unite="kg CO₂/m²/an" />
            </div>
            <div className={b.lignes}>
              <Li l="Diagnostic fait le" v={txt(d, 'dpeDate') ? dateLongueCourt(txt(d, 'dpeDate')) : d.dpeStatut === 'encours' ? 'Commandé' : ''} />
              <Li l="Coût annuel estimé" v={num(d, 'coutMin') && num(d, 'coutMax') ? `${euros(num(d, 'coutMin') as number).replace(' €', '')} – ${euros(num(d, 'coutMax') as number)}${num(d, 'coutAnnee') ? ` (prix ${num(d, 'coutAnnee')})` : ''}` : ''} />
            </div>
            {passoire(d) && <div className={b.encart}>Classe F ou G : logement à consommation énergétique excessive. L’annonce doit le dire.</div>}
          </>
        )}
        {dpeFait && !d.dpe && !d.dpeStatut && <div className={b.vide}>DPE à saisir.</div>}
      </Bloc>
      <Bloc ic="lots" titre="Copropriété" action={M('copro')}>
        {d.copro === 'oui' ? (
          <div className={b.lignes}>
            <Li l="Lots" v={num(d, 'lots') ?? ''} />
            <Li l="Procédure en cours" v={d.procedure === 'oui' ? txt(d, 'procedureNature') || 'Oui' : d.procedure === 'non' ? 'Aucune' : ''} cls={d.procedure === 'oui' ? b.liAlerte : undefined} />
            <Li l="Syndic" v={txt(d, 'syndic')} />
            <Li l="Fonds de travaux" v={eur(num(d, 'fondsTravaux'))} />
            {txt(d, 'travauxVotes') && <div className={b.texte} style={{ paddingTop: 6 }}><b>Travaux : </b>{txt(d, 'travauxVotes')}</div>}
          </div>
        ) : <div className={b.texte}>{d.copro === 'non' ? 'Pas de copropriété.' : 'À renseigner.'}</div>}
      </Bloc>
      <Bloc ic="euro" titre="Charges et taxes" action={M('copro')}>
        <div className={b.lignes}>
          <Li l="Charges de copropriété" v={chargesAn ? `${euros(chargesAn)}/an` : ''} />
          <Li l="Soit par mois" v={chargesAn ? `${euros(chargesAn / 12)}/mois` : ''} />
          <Li l="Elles comprennent" v={libs(d, 'chargesInclus').join(', ')} />
          <Li l="Taxe foncière" v={num(d, 'taxeFonciere') ? `${euros(num(d, 'taxeFonciere') as number)}/an` : ''} />
          <Li l="Loyer (bien loué)" v={num(d, 'loyer') ? `${euros(num(d, 'loyer') as number)}/mois` : ''} />
          <Li l="Fin du bail" v={txt(d, 'finBail') ? dateLongueCourt(txt(d, 'finBail')) : ''} />
          {!chargesAn && !num(d, 'taxeFonciere') && <div className={b.vide}>À renseigner.</div>}
        </div>
      </Bloc>
      <Bloc ic="etiquette" titre="Prix et honoraires" action={M('prix')}>
        <div className={b.lignes}>
          <Li l="Prix affiché" v={eur(a.prix)} />
          <Li l="Honoraires" v={a.hono !== null ? `${euros(a.hono)} TTC · ${a.acq ? 'acquéreur' : 'vendeur'}` : ''} />
          <Li l="Taux" v={a.taux ? pourcent(a.taux) : ''} />
          <Li l="Net vendeur" v={eur(a.net)} />
          <Li l="Prix au m²" v={a.prix && surf ? euros(a.prix / surf) : ''} />
          <Li l="Estimation" v={num(d, 'estimBasse') || num(d, 'estimHaute') ? [eur(num(d, 'estimBasse')), eur(num(d, 'estimHaute'))].filter(Boolean).join(' – ') : ''} />
        </div>
      </Bloc>

      <Bloc ic="plan" titre={<>{'Les pièces'}<i>{pieces.length ? ` · ${pieces.length}` : ''}</i></>} action={M('pieces')} large>
        {pieces.length === 0 ? <div className={b.vide}>Les pièces une à une : niveau, pièce, surface, exposition et commentaire. Elles serviront à la fiche PDF du bien.</div> : (
          <div className={b.tablePieces}>
            {niveaux.map(n => (
              <div key={n}>
                {niveaux.length > 1 || n !== 'Niveau principal' ? <div className={b.niveauT}>{n}</div> : null}
                {pieces.filter(p => (p.niveau || 'Sans niveau') === n).map(p => (
                  <div key={p.id} className={b.pieceL}>
                    <div><b>{p.nom || 'Pièce'}</b>{p.note && <em>{p.note}</em>}</div>
                    <span>{p.surface ? m2(p.surface) : '—'}</span>
                    <i>{p.expo ? nomExpo(p.expo) : ''}</i>
                  </div>
                ))}
              </div>
            ))}
            {totalHab > 0 && <div className={b.totalPieces}><span>Pièces à vivre</span><span>{m2(totalHab)}</span></div>}
          </div>
        )}
      </Bloc>

      <Bloc ic="photo" titre={<>{'Les photos'}<i>{photos.length ? ` · ${photos.length}` : ''}</i></>} action={M('photos')} large>
        {photos.length === 0 ? <div className={b.vide}>Pas encore de photo.</div> : (
          <div className={b.galerie}>
            {photos.map((p, i) => (
              <figure key={p.url}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.legende || `Photo ${i + 1}`} loading="lazy" />
                {p.legende && <figcaption>{p.legende}</figcaption>}
              </figure>
            ))}
          </div>
        )}
      </Bloc>

      <Bloc ic="megaphone" titre="Le texte de l’annonce" action={M('annonce')} large>
        {txt(d, 'annonceTexte') ? <div className={b.texte}>{txt(d, 'annonceTexte')}</div> : <div className={b.vide}>Pas encore écrit. L’éditeur propose un brouillon à partir de la fiche, avec les mentions obligatoires.</div>}
        <div className={b.tags}>
          {ctrl.map(x => <span key={x.l} className={`${b.etiq} ${x.ok ? b.e_vert : b.e_rouge}`}>{x.ok ? <Ic n="check" t={11} e={3} /> : '!'}{x.l}</span>)}
        </div>
      </Bloc>
    </div>
  );
}

/* ══ ONGLET « VISITES ET OFFRES » ═════════════════════════════════════════ */
function CarteOffre({ o, bien, onStatut, onDoc }: { o: SuiviVente; bien: BienVente; onStatut: (statut: string, contre?: number) => void; onDoc: () => void }) {
  const d = (o.donnees || {}) as Record<string, unknown>;
  const a = argentBien(bien.donnees || {});
  const st = STATUT_OFFRE[o.statut || 'en_attente'] || STATUT_OFFRE.en_attente;
  const ecart = o.montant && a.prix ? a.prix - o.montant : null;
  const ouverte = o.statut === 'en_attente' || o.statut === 'contre';
  const fin = d.financement === 'comptant' ? 'Comptant' : d.financement === 'relais' ? 'Prêt relais' : 'Prêt';
  return (
    <div className={b.carteV}>
      <div className={b.carteVT}>
        <span className={b.offreMontant}>{euros(o.montant || 0)}</span>
        <b>{o.qui || 'Acquéreur'}</b>
        <span className={`${b.etiq} ${b[st.ton]}`}>{st.l}</span>
      </div>
      <div className={b.offreEcart}>
        {[`Reçue le ${dateCourte(o.le)}`, typeof d.jusquau === 'string' && d.jusquau ? `valable jusqu’au ${dateCourte(d.jusquau)}` : '',
          ecart !== null && a.prix ? (ecart > 0 ? `${euros(ecart)} sous le prix (−${pourcent((ecart / a.prix) * 100)})` : ecart < 0 ? `${euros(-ecart)} au-dessus du prix` : 'au prix') : '',
          [fin, typeof d.apport === 'number' ? `apport ${euros(d.apport)}` : '', typeof d.pret === 'number' ? `prêt ${euros(d.pret)}` : ''].filter(Boolean).join(', '),
          typeof d.contre === 'number' ? `contre-offre du vendeur à ${euros(d.contre)}` : '',
        ].filter(Boolean).join(' · ')}
      </div>
      {typeof d.conditions === 'string' && d.conditions && <div className={b.offreEcart}>{`Conditions : ${d.conditions}`}</div>}
      <div className={b.carteVActions}>
        {ouverte && <button type="button" className={`${b.mini} ${b.miniOr}`} onClick={() => onStatut('acceptee')}><Ic n="check" t={13} e={2.6} />Acceptée</button>}
        {ouverte && <button type="button" className={b.mini} onClick={() => {
          const t = prompt('Montant de la contre-offre du vendeur, en euros :', o.montant ? String(o.montant) : '');
          const n = t ? Number(t.replace(/[\s  €]/g, '').replace(',', '.')) : NaN;
          if (Number.isFinite(n) && n > 0) onStatut('contre', n);
        }}>Contre-offre…</button>}
        {ouverte && <button type="button" className={b.mini} onClick={() => onStatut('refusee')}>Refusée</button>}
        {ouverte && <button type="button" className={b.mini} onClick={() => onStatut('retiree')}>Retirée</button>}
        {!ouverte && <button type="button" className={b.mini} onClick={() => onStatut('en_attente')}>Remettre en attente</button>}
        <button type="button" className={b.mini} onClick={onDoc}><Ic n="plume" t={13} />L’offre écrite</button>
        {typeof d.chemin === 'string' && d.chemin && <button type="button" className={b.mini} onClick={() => ouvrirPiece(String(d.chemin), String(d.nom || 'offre.pdf'))}><Ic n="trombone" t={13} />L’offre signée</button>}
      </div>
    </div>
  );
}

function CarteVisite({ v, onCR, onAnnuler, onDoc, onFiche }: { v: VisiteU; onCR: () => void; onAnnuler: () => void; onDoc: () => void; onFiche?: () => void }) {
  const iss = v.issue ? ISSUES[v.issue] : null;
  const faite = passee(v);
  return (
    <div className={b.carteV}>
      <div className={b.carteVT}>
        <b>{v.qui}</b>
        <small>{[v.ymd ? jourCourt(v.ymd) : '', v.heure ? `à ${v.heure.replace(':', ' h ')}` : ''].filter(Boolean).join(' ')}</small>
        <span className={`${b.etiq} ${v.source === 'crm' ? b.e_or : b.e_gris}`}>{v.source === 'crm' ? 'Acheteur suivi' : 'Hors CRM'}</span>
        {v.statut === 'annulee' ? <span className={`${b.etiq} ${b.e_gris}`}>Annulée</span>
          : iss ? <span className={b.etiq} style={{ background: iss.fond, color: iss.couleur, borderColor: iss.trait }}>{iss.crm}</span>
            : faite ? <span className={`${b.etiq} ${b.e_or}`}>Compte rendu à faire</span> : <span className={`${b.etiq} ${b.e_bleu}`}>À venir</span>}
      </div>
      {v.commentaire && <div className={b.offreEcart}>{v.commentaire}</div>}
      {v.statut !== 'annulee' && (
        <div className={b.carteVActions}>
          <button type="button" className={`${b.mini} ${faite && !iss ? b.miniOr : ''}`} onClick={onCR}><Ic n="bulle" t={13} />{iss || v.statut === 'faite' ? 'Revoir le compte rendu' : 'Compte rendu'}</button>
          <button type="button" className={b.mini} onClick={onDoc}><Ic n="plume" t={13} />Bon de visite</button>
          {onFiche && <button type="button" className={b.mini} onClick={onFiche}><Ic n="personne" t={13} />Sa fiche</button>}
          {!faite && <button type="button" className={`${b.mini} ${b.miniDanger}`} onClick={onAnnuler}>Annuler</button>}
        </div>
      )}
    </div>
  );
}

/* ══ ONGLET « HISTORIQUE » ════════════════════════════════════════════════ */
type Genre = 'visites' | 'offres' | 'acheteurs' | 'etapes' | 'documents' | 'notes';
type Evt = { cle: string; le: string; ic: string; ton: string; titre: string; detail?: string; genre: Genre; suppr?: string };
const GENRES: { k: Genre | 'tout'; l: string }[] = [
  { k: 'tout', l: 'Tout' }, { k: 'visites', l: 'Visites' }, { k: 'offres', l: 'Offres' }, { k: 'acheteurs', l: 'Acheteurs' },
  { k: 'etapes', l: 'Étapes et prix' }, { k: 'documents', l: 'Documents' }, { k: 'notes', l: 'Notes' },
];

function evenements(bien: BienVente, det: DetailBien, clients: Record<string, ClientMini>): Evt[] {
  const l: Evt[] = [];
  l.push({ cle: 'creation', le: bien.created_at, ic: 'plus', ton: 'ic_gris', titre: `Bien créé${bien.reference ? ` · ${bien.reference}` : ''}`, genre: 'etapes' });
  for (const x of det.suivi) {
    const d = (x.donnees || {}) as Record<string, unknown>;
    const str = (k: string) => (typeof d[k] === 'string' ? String(d[k]) : '');
    if (x.type === 'etape') {
      const e = x.statut as EtapeVente;
      let titre = etapeDe(e).lib, detail = '';
      if (e === 'mandat') {
        titre = d.de === 'estimation' || d.depuis === 'creation' ? `Mandat signé${str('type') ? ` · ${NOM_MANDAT[str('type')] || str('type')}` : ''}${str('numero') ? ` n° ${str('numero')}` : ''}` : 'Remis en vente';
        detail = [str('fin') ? `jusqu’au ${dateCourte(str('fin'))}` : '', typeof d.prix === 'number' ? `prix ${euros(d.prix)}` : ''].filter(Boolean).join(' · ');
      } else if (e === 'offre') { titre = 'Passé sous offre'; detail = typeof d.montant === 'number' ? `${str('qui')} · ${euros(d.montant)}` : ''; }
      else if (e === 'compromis') {
        titre = `Compromis signé${typeof d.prix === 'number' ? ` · ${euros(d.prix)}` : ''}`;
        detail = [str('acquereur'), str('pretLimite') ? `prêt jusqu’au ${dateCourte(str('pretLimite'))}` : '', str('acte') ? `acte le ${dateCourte(str('acte'))}` : ''].filter(Boolean).join(' · ');
      } else if (e === 'vendu') { titre = `Vendu${typeof d.prix === 'number' ? ` · ${euros(d.prix)}` : ''}`; detail = typeof d.hono === 'number' ? `Honoraires : ${euros(d.hono)}` : ''; }
      else if (e === 'suspendu') { titre = 'Vente suspendue'; detail = [str('raison'), str('reprise') ? `reprise le ${dateCourte(str('reprise'))}` : ''].filter(Boolean).join(' · '); }
      else if (e === 'retire') { titre = 'Retiré de la vente'; detail = str('raison'); }
      else if (e === 'estimation') titre = 'Revenu à l’estimation';
      l.push({ cle: x.id, le: x.le, ic: e === 'vendu' ? 'check' : e === 'retire' ? 'archive' : e === 'suspendu' ? 'pause' : 'drapeau', ton: e === 'vendu' ? 'ic_emilio' : e === 'retire' ? 'ic_rouge' : 'ic_vert', titre, detail: [detail, x.commentaire].filter(Boolean).join('\n'), genre: 'etapes' });
    } else if (x.type === 'prix') {
      l.push({ cle: x.id, le: x.le, ic: 'etiquette', ton: 'ic_violet', titre: `Prix changé : ${typeof d.ancien === 'number' ? `${euros(d.ancien)} → ` : ''}${euros(x.montant || 0)}`, detail: x.commentaire || '', genre: 'etapes' });
    } else if (x.type === 'note') {
      l.push({ cle: x.id, le: x.le, ic: 'bulle', ton: 'ic_gris', titre: 'Note', detail: x.commentaire || '', genre: 'notes', suppr: x.id });
    } else if (x.type === 'offre') {
      l.push({ cle: x.id, le: x.le, ic: 'euro', ton: 'ic_or', titre: `Offre de ${x.qui || 'un acquéreur'} : ${euros(x.montant || 0)}`,
        detail: [str('jusquau') ? `Valable jusqu’au ${dateCourte(str('jusquau'))}` : '', str('conditions')].filter(Boolean).join(' · '), genre: 'offres' });
      if (str('reponse_le') && x.statut && x.statut !== 'en_attente') {
        l.push({ cle: x.id + '-r', le: `${str('reponse_le')}T18:00:00`, ic: x.statut === 'acceptee' ? 'check' : 'euro', ton: x.statut === 'acceptee' ? 'ic_vert' : 'ic_gris',
          titre: `Offre de ${x.qui || 'l’acquéreur'} : ${(STATUT_OFFRE[x.statut]?.l || x.statut).toLowerCase()}`, detail: typeof d.contre === 'number' ? `Contre-offre du vendeur à ${euros(d.contre)}` : '', genre: 'offres' });
      }
    } else if (x.type === 'visite') {
      const iss = x.avis && x.avis in ISSUES ? ISSUES[x.avis as Issue] : null;
      l.push({ cle: x.id, le: x.le, ic: 'cle', ton: 'ic_bleu',
        titre: x.statut === 'annulee' ? `Visite annulée · ${x.qui || ''}` : x.statut === 'faite' ? `Visite de ${x.qui || 'un visiteur'}${iss ? ` · ${iss.crm}` : ''}` : `Visite prévue avec ${x.qui || 'un visiteur'}`,
        detail: [x.commentaire, str('tel')].filter(Boolean).join(' · '), genre: 'visites' });
    }
  }
  for (const c of det.copies) {
    const nom = nomClient(clients[c.client_id]);
    if (c.envoye_le || c.created_at) l.push({ cle: 'p-' + c.id, le: c.envoye_le || c.created_at, ic: 'envoyer', ton: 'ic_or', titre: `Présenté à ${nom}`, detail: 'Dans son espace, avec la note de correspondance', genre: 'acheteurs' });
    if (c.vu_le) l.push({ cle: 'o-' + c.id, le: c.vu_le, ic: 'oeil', ton: 'ic_gris', titre: `${nom} a ouvert la fiche`, genre: 'acheteurs' });
    if (c.retour_le && c.retour_client) l.push({ cle: 'r-' + c.id, le: c.retour_le, ic: 'bulle', ton: 'ic_bleu', titre: `${nom} a répondu`, detail: c.retour_client, genre: 'acheteurs' });
  }
  for (const v of det.visites) {
    const nom = nomClient(clients[v.client_id]);
    const iss = issueDe(v);
    const le = v.date_visite ? `${String(v.date_visite).slice(0, 10)}T${String(v.heure || '12:00').slice(0, 5)}:00` : v.created_at;
    l.push({ cle: 'vis-' + v.id, le, ic: 'cle', ton: 'ic_bleu',
      titre: v.statut === 'annulee' ? `Visite annulée · ${nom}` : v.statut === 'effectuee' ? `Visite avec ${nom}${iss ? ` · ${ISSUES[iss].crm}` : ''}` : `Visite prévue avec ${nom}`,
      detail: v.statut === 'effectuee' ? String(v.commentaire || '') : '', genre: 'visites' });
  }
  for (const x of det.docs) {
    const m = modele(x.modele);
    l.push({ cle: 'd-' + x.id, le: x.created_at, ic: 'plume', ton: 'ic_gris', titre: `Document préparé : ${x.titre || m?.titre || 'document'}`, genre: 'documents' });
    if (x.signe_le) l.push({ cle: 'ds-' + x.id, le: x.signe_le, ic: 'check', ton: 'ic_vert', titre: `Document signé : ${x.titre || m?.titre || 'document'}`, genre: 'documents' });
  }
  return l.filter(e => e.le).sort((p, q) => q.le.localeCompare(p.le));
}

function OngletHistorique({ evts, onNote, onSuppr }: { evts: Evt[]; onNote: () => void; onSuppr: (id: string) => void }) {
  const [g, setG] = useState<Genre | 'tout'>('tout');
  const vus = evts.filter(e => g === 'tout' || e.genre === g);
  const mois = (iso: string) => { const t = new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  return (
    <section className={b.bloc}>
      <div className={b.blocT}><span className={b.blocIc}><Ic n="historique" t={15} /></span><h3>Historique du bien</h3><button type="button" className={b.mini} onClick={onNote}><Ic n="plus" t={13} e={2.6} />Ajouter une note</button></div>
      <div className={b.filtres} role="group" aria-label="Filtrer l’historique">
        {GENRES.map(x => {
          const n = x.k === 'tout' ? evts.length : evts.filter(e => e.genre === x.k).length;
          if (x.k !== 'tout' && !n) return null;
          return <button key={x.k} type="button" className={`${b.filtre} ${g === x.k ? b.filtreOn : ''}`} aria-pressed={g === x.k} onClick={() => setG(x.k)}>{x.l}<i>{n}</i></button>;
        })}
      </div>
      <div className={b.histo}>
        {vus.map((e, i) => {
          const m = mois(e.le);
          const titreMois = i === 0 || mois(vus[i - 1].le) !== m ? m : '';
          const quand = new Date(e.le);
          return (
            <div key={e.cle}>
              {titreMois && <div className={b.mois}>{titreMois}</div>}
              <div className={b.evt}>
                <span className={`${b.evtIc} ${b[e.ton]}`}><Ic n={e.ic} t={15} /></span>
                <div className={b.evtTxt}><b>{e.titre}</b>{e.detail && <p>{e.detail}</p>}</div>
                <div className={b.evtDate}>
                  {isNaN(quand.getTime()) ? '' : `${quand.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}${quand.getHours() || quand.getMinutes() ? ` · ${quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
                  {e.suppr && <button type="button" className={b.icBtn} aria-label="Supprimer la note" onClick={() => onSuppr(e.suppr!)}><Ic n="corbeille" t={14} /></button>}
                </div>
              </div>
            </div>
          );
        })}
        {!vus.length && <div className={b.vide}>Rien pour l’instant.</div>}
      </div>
    </section>
  );
}

/* ══ LA FICHE ═════════════════════════════════════════════════════════════ */
export default function FicheBien({ bien: depart, liste, onRetour, onMaj, onSupprime, onModifier, onNavigate, onRecharger }: {
  bien: BienVente; liste: ListeBiens;
  onRetour: () => void; onMaj: (b: BienVente) => void; onSupprime: (id: string) => void;
  onModifier: (etape?: string) => void; onNavigate: (page: string, data?: unknown) => void; onRecharger: () => void;
}) {
  const [bien, setBien] = useState<BienVente>(depart);
  useEffect(() => { setBien(depart); }, [depart]);
  const [detail, setDetail] = useState<DetailBien | null>(null);
  const [erreur, setErreur] = useState('');
  const [onglet, setOnglet] = useState<Onglet>('apercu');
  const [menu, setMenu] = useState<'etape' | 'plus' | null>(null);
  const [fen, setFen] = useState<Fen | null>(null);
  const [cr, setCr] = useState<VisiteU | null>(null);
  const [message, setMessage] = useState<{ t: string; ok: boolean } | null>(null);
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

  async function envoyer(l: Acheteur[]) {
    const r = await envoyerDansEspace(bien, l);
    setMessage(r.erreurs.length
      ? { t: `${r.n} envoi${r.n > 1 ? 's' : ''} fait${r.n > 1 ? 's' : ''}. Erreurs : ${r.erreurs.join(' ; ')}`, ok: false }
      : { t: r.n > 1 ? `Envoyé dans l’espace de ${r.n} acheteurs.` : r.n === 1 ? 'Envoyé dans son espace.' : 'Ils l’avaient déjà.', ok: true });
    await apres();
  }
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
  if (e === 'estimation') {
    suite.push({ t: 'Le mandat est signé…', s: 'Le bien passe « En vente »', c: etapeDe('mandat').c, go: () => setFen({ k: 'mandat' }) });
    suite.push({ t: 'Le vendeur renonce…', s: 'Retiré, gardé dans l’historique', c: etapeDe('retire').c, go: raison('retire', 'Retirer de la vente', 'Le bien passe « Retiré »') });
  }
  if (e === 'mandat') {
    suite.push({ t: 'Une offre est arrivée…', s: 'Le bien passe « Sous offre »', c: etapeDe('offre').c, go: () => setFen({ k: 'offre' }) });
    suite.push({ t: 'Suspendre la vente…', s: 'Le vendeur fait une pause', c: etapeDe('suspendu').c, go: raison('suspendu', 'Suspendre la vente', 'Le bien passe « Suspendu »') });
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
  const ONGLETS: { k: Onglet; l: string; n?: number }[] = [
    { k: 'apercu', l: 'Vue d’ensemble' }, { k: 'bien', l: 'Le bien' },
    { k: 'visites', l: 'Visites et offres', n: nbVisites + offres.length }, { k: 'acheteurs', l: 'Acheteurs', n: acheteurs.filter(a => a.corr.note >= SEUIL_CORRESPOND).length },
    { k: 'documents', l: 'Documents', n: docsLies.length }, { k: 'historique', l: 'Historique' },
  ];

  const blocVisitesResume = (
    <Bloc ic="cle" titre="Visites et offres" action={<Modifier onClick={() => setFen({ k: 'visite' })} lib="+ Visite" />}>
      {offresOuvertes.map(o => (
        <div key={o.id} className={b.encart}><b>{`Offre de ${o.qui || 'un acquéreur'} : ${euros(o.montant || 0)}`}</b>{typeof o.donnees?.jusquau === 'string' && o.donnees.jusquau ? ` · réponse attendue le ${dateCourte(String(o.donnees.jusquau))}` : ''}</div>
      ))}
      {visites.length === 0 ? <div className={b.vide}>Aucune visite pour l’instant.</div> : (
        <div className={b.fil}>{visites.slice(0, 5).map(v => <LigneVisite key={v.cle} v={v} />)}</div>
      )}
      {!offres.length && <div className={b.pied}>Aucune offre pour l’instant.</div>}
      {(visites.length > 5 || offres.length > 0) && <button type="button" className={b.lien} style={{ alignSelf: 'flex-start' }} onClick={() => setOnglet('visites')}>Tout voir</button>}
    </Bloc>
  );

  return (
    <div className={b.fiche}>
      <div className={b.ficheBarre}>
        <button type="button" className={b.retour} onClick={onRetour}><Ic n="retour" t={16} />Biens en vente</button>
        <div className={b.barreActions}>
          <button type="button" className={`${s.btn} ${b.masquable}`} onClick={() => onModifier()}><Ic n="crayon" t={15} />Modifier</button>
          <button type="button" className={`${s.btn} ${b.masquable}`} onClick={() => setFen({ k: 'visite' })}><Ic n="plus" t={15} e={2.4} />Visite</button>
          <button type="button" className={b.btnEtape} aria-haspopup="menu" aria-expanded={menu === 'etape'} onClick={() => setMenu(menu === 'etape' ? null : 'etape')}>
            <span className={b.point} style={{ background: et.c, boxShadow: '0 0 0 3px rgba(255,255,255,.18)' }} /><span className={b.etLong}>{et.lib}</span><span className={b.etCourt}>{et.court}</span>{bien.archive ? ' · archivé' : ''}<Ic n="bas" t={14} e={2.6} />
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

      <Bandeau bien={bien} detail={detail} />

      {message && <div className={message.ok ? s.note : s.erreur}>{message.t}</div>}
      {erreur && <div className={s.erreur}>{erreur}</div>}

      <nav className={b.onglets} aria-label="Rubriques du bien">
        {ONGLETS.map(o => (
          <button key={o.k} type="button" className={`${b.onglet} ${onglet === o.k ? b.ongletOn : ''}`} aria-pressed={onglet === o.k} onClick={() => setOnglet(o.k)}>
            {o.l}{o.n ? <i>{o.n}</i> : null}
          </button>
        ))}
      </nav>

      {onglet === 'apercu' && (
        <div className={b.deuxCol}>
          <div className={b.col}>
            {bien.etape !== 'vendu' && bien.etape !== 'retire' && (
              <BlocAcheteurs acheteurs={acheteurs} max={4} onTout={() => setOnglet('acheteurs')} onEnvoyer={envoyer} onFiche={ouvrirClient} nbRecherches={liste.recherches.length} />
            )}
            <Bloc ic="liste" titre="Le bien" action={<Modifier onClick={() => setOnglet('bien')} lib="Tout le détail" />}>
              <Chiffres d={d} />
            </Bloc>
            {blocVisitesResume}
          </div>
          <div className={b.col}>
            <BlocMandat bien={bien} docs={docsLies} onDoc={faireDocument} onOuvrirDoc={ouvrirDoc} onMandat={() => setFen({ k: 'mandat' })} />
            <BlocProprio bien={bien} proprio={proprio} recherchesProprio={recherchesProprio} onFiche={ouvrirClient} onModifier={() => onModifier('proprio')} />
            <BlocVisite d={d} onModifier={() => onModifier('pratique')} />
            <Bloc ic="cadenas" titre="Notes internes" action={<Modifier onClick={() => onModifier('annonce')} />}>
              {txt(d, 'notes') ? <div className={b.texte}>{txt(d, 'notes')}</div> : <div className={b.vide}>Rien pour l’instant.</div>}
              <div className={b.pied}>Visibles par toi seul, jamais dans un espace client.</div>
            </Bloc>
            <BlocDossierResume d={d} onVoir={() => setOnglet('documents')} />
          </div>
        </div>
      )}

      {onglet === 'bien' && <OngletBien bien={bien} onModifier={onModifier} />}

      {onglet === 'visites' && (
        <div className={b.deuxCol}>
          <div className={b.col}>
            <Bloc ic="cle" titre={<>{'Les visites'}<i>{nbVisites ? ` · ${nbVisites}` : ''}</i></>} action={<button type="button" className={b.mini} onClick={() => setFen({ k: 'visite' })}><Ic n="plus" t={13} e={2.6} />Visite</button>}>
              {!detail ? <div className={b.vide}>Chargement…</div> : visites.length === 0 ? <div className={b.vide}>Aucune visite. Avec un acheteur suivi, elle s’ajoute aussi à son dossier et à l’agenda ; avec quelqu’un hors du CRM, elle peut aller dans l’agenda.</div> : (
                <>
                  {visitesAVenir.length > 0 && <div className={b.sectionT}>À venir</div>}
                  {visitesAVenir.map(v => <CarteVisite key={v.cle} v={v} onCR={() => setCr(v)} onAnnuler={() => annulerVisite(v)} onDoc={() => bonDeVisite(v)} onFiche={v.clientId ? () => ouvrirClient(v.clientId!) : undefined} />)}
                  {visites.length > visitesAVenir.length && <div className={b.sectionT}>Passées</div>}
                  {visites.filter(v => !visitesAVenir.includes(v)).map(v => <CarteVisite key={v.cle} v={v} onCR={() => setCr(v)} onAnnuler={() => annulerVisite(v)} onDoc={() => bonDeVisite(v)} onFiche={v.clientId ? () => ouvrirClient(v.clientId!) : undefined} />)}
                </>
              )}
            </Bloc>
          </div>
          <div className={b.col}>
            <Bloc ic="euro" titre={<>{'Les offres'}<i>{offres.length ? ` · ${offres.length}` : ''}</i></>} action={<button type="button" className={b.mini} onClick={() => setFen({ k: 'offre' })}><Ic n="plus" t={13} e={2.6} />Offre</button>}>
              {offres.length === 0 ? <div className={b.vide}>Aucune offre pour l’instant.</div> : offres.map(o => (
                <CarteOffre key={o.id} o={o} bien={bien} onStatut={(st, c) => statutOffre(o, st, c)} onDoc={() => offreEcrite(o)} />
              ))}
              {bien.etape === 'offre' && offres.length > 0 && !offresOuvertes.length && !offres.some(o => o.statut === 'acceptee') && (
                <div className={b.encart}>{'Plus aucune offre en cours. '}<button type="button" className={b.lien} onClick={() => setFen({ k: 'mandat' })}>Remettre le bien en vente</button></div>
              )}
              {bien.etape === 'offre' && offres.some(o => o.statut === 'acceptee') && (
                <div className={b.encart}>{'Une offre est acceptée : quand le compromis est signé, '}<button type="button" className={b.lien} onClick={() => setFen({ k: 'compromis' })}>passe le bien « Sous compromis »</button></div>
              )}
            </Bloc>
          </div>
        </div>
      )}

      {onglet === 'acheteurs' && (
        <div className={b.deuxCol}>
          <div className={b.col}>
            <BlocAcheteurs acheteurs={acheteurs} onEnvoyer={envoyer} onFiche={ouvrirClient} nbRecherches={liste.recherches.length} />
          </div>
          <div className={b.col}>
            <Bloc ic="envoyer" titre={<>{'Déjà présenté à'}<i>{detail?.copies.length ? ` · ${detail.copies.length}` : ''}</i></>}>
              {!detail?.copies.length ? <div className={b.vide}>Personne pour l’instant.</div> : (
                <div className={b.fil}>
                  {detail.copies.map(c => {
                    const cl = liste.clients[c.client_id];
                    const bd = c.badge_retour ? BADGES[c.badge_retour] : null;
                    return (
                      <div key={c.id} className={b.carteV} style={{ marginTop: 8 }}>
                        <div className={b.carteVT}>
                          <button type="button" className={b.lien} style={{ padding: 0, fontSize: 14.5 }} onClick={() => ouvrirClient(c.client_id)}>{nomClient(cl)}</button>
                          <small>{`le ${dateCourte(c.envoye_le || c.created_at)}${c.vu_le ? ' · fiche ouverte' : ''}`}</small>
                          {bd && <span className={`${b.etiq} ${b[bd.ton]}`}>{bd.l}</span>}
                        </div>
                        {c.retour_client && <div className={b.offreEcart}>{c.retour_client}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Bloc>
          </div>
        </div>
      )}

      {onglet === 'documents' && (
        <div className={b.deuxCol}>
          <div className={b.col}>
            <Bloc ic="plume" titre={<>{'Les documents juridiques'}<i>{docsLies.length ? ` · ${docsLies.length}` : ''}</i></>}>
              <div className={b.carteVActions}>
                <button type="button" className={b.mini} onClick={() => faireDocument({ modele: 'mandat_vente' })}><Ic n="plume" t={13} />Mandat de vente</button>
                <button type="button" className={b.mini} onClick={() => faireDocument({ modele: 'offre_achat' })}><Ic n="euro" t={13} />Offre d’achat</button>
                <button type="button" className={b.mini} onClick={() => faireDocument({ modele: 'bon_visite' })}><Ic n="calendrier" t={13} />Bon de visite</button>
              </div>
              <div className={b.pied}>Préremplis avec le bien, le propriétaire, le prix et les honoraires. Ils s’ouvrent dans Documents, et restent reliés au bien.</div>
              {detail?.erreurDocs && <div className={s.erreur}>{detail.erreurDocs}</div>}
              {docsLies.length === 0 ? <div className={b.vide}>Aucun document pour ce bien.</div> : (
                <div className={b.fil}>
                  {docsLies.map(x => {
                    const st = STATUTS[x.statut] || STATUTS.brouillon;
                    return (
                      <button key={x.id} type="button" className={b.quiL} style={{ marginTop: 6 }} onClick={() => ouvrirDoc(x.id)}>
                        <span className={s.ligneIc}><Ic n={modele(x.modele)?.ic || 'doc'} t={17} /></span>
                        <div><b>{x.titre || modele(x.modele)?.titre || 'Document'}</b><small>{`Créé le ${dateCourte(x.created_at)}${x.signe_le ? ` · signé le ${dateCourte(x.signe_le)}` : ''}`}</small></div>
                        <span className={`${s.statut} ${s['t_' + st.ton]}`}>{st.l}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Bloc>
            <BlocMandat bien={bien} docs={docsLies} onDoc={faireDocument} onOuvrirDoc={ouvrirDoc} onMandat={() => setFen({ k: 'mandat' })} />
          </div>
          <div className={b.col}>
            <Bloc ic="dossier" titre="Le dossier : diagnostics et pièces">
              <ChampDossier d={d} maj={majDonnees} off={false} bienId={bien.id} />
            </Bloc>
          </div>
        </div>
      )}

      {onglet === 'historique' && (
        <OngletHistorique evts={evts} onNote={() => setFen({ k: 'note' })} onSuppr={async id => {
          if (!confirm('Supprimer cette note ?')) return;
          try { await supprimerSuivi(id); await apres(); } catch (e2) { setMessage({ t: (e2 as Error).message, ok: false }); }
        }} />
      )}

      {/* ── Les fenêtres ── */}
      {fen?.k === 'mandat' && <FenMandat bien={bien} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {fen?.k === 'offre' && <FenOffre bien={bien} options={options} recherches={liste.recherches} proprio={proprio} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {fen?.k === 'compromis' && <FenCompromis bien={bien} offres={offres} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {fen?.k === 'vendu' && <FenVendu bien={bien} compromis={(detail?.suivi || []).find(x => x.type === 'etape' && x.statut === 'compromis') || null} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {fen?.k === 'prix' && <FenPrix bien={bien} onFermer={() => setFen(null)} onFait={r => apres(r)} />}
      {fen?.k === 'visite' && <FenVisite bien={bien} options={options} recherches={liste.recherches} onFermer={() => setFen(null)} onFait={() => apres()} />}
      {fen?.k === 'note' && <FenNote bien={bien} onFermer={() => setFen(null)} onFait={() => apres()} />}
      {fen?.k === 'raison' && <FenRaison bien={bien} etape={fen.etape} titre={fen.titre} sur={fen.sur} onFermer={() => setFen(null)} onFait={r => apres(r)} />}

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
