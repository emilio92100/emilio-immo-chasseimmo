'use client';
import { FenetreMail, type ContactMail } from '@/components/pages/PageMail';
import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import AvatarContact from '@/components/contacts/AvatarContact';
import { estArchive, lirePro, lireStructure, reventePossible, typesDe } from '@/lib/contacts';
import { createPortal } from 'react-dom';
import { supabase, addJournal } from '@/lib/supabase';
import { effacerPhotosBien, effacerPhotosDeBiens } from '@/lib/photos';
import { signalerEchec, verifie, verifieTout } from '@/lib/ecritures';
import { programmerRelance, delaiRelance, solderRelancesAcheteur, cloreRelancesArchive, reporterRelance } from '@/lib/relances';
import { annulerVisites } from '@/lib/annuler-visites';
import { lireMontant, ecrireMontant } from '@/lib/montant';
import { visitePassee } from '@/lib/visites';
import { eurosRonds } from '@/lib/activite';
import type { Client, Recherche } from '@/lib/supabase';
import styles from './FicheClient.module.css';
import SecteurPicker from '@/components/shared/SecteurPicker';
import ArretPicker, { PastilleArret } from '@/components/shared/ArretPicker';
import ChoixDate from '@/components/shared/ChoixDate';
import { retirerFicheOuverte } from '@/components/layout/FichesOuvertes';
import { signalerMaj, demanderRendezVous, lireOuvertureFiche, oublierOuvertureFiche, filtreDuSuivi, demanderNouveauBien, demanderOngletBien } from '@/lib/intentions';
import CloreRelances, { relancesACocher } from '@/components/shared/CloreRelances';
import { jetonEspace, BIENS_PAR_MAIL } from '@/lib/jeton';
import { nomFoyer, conjointDe } from '@/lib/foyer';
import {
  BasculeCriteres, CorpsCriteres, CRIT_VIDE, EXPOSITIONS, etapesCriteres,
  FINANCEMENTS, FriseCriteres, ICONE_EXPO, lireModeCrit, ecrireModeCrit,
  texteChoix, texteEtats, URGENCES, CUISINES,
} from '@/components/shared/CriteresRecherche';
import type { CritForm, ModeCrit, Niveau } from '@/components/shared/CriteresRecherche';
import type { Arret } from '@/lib/arrets';
import { solderRelancesVisite, solderRelancesRetourVisite } from '@/lib/demandes-visite';
import { TypesEnLigne } from '@/components/contacts/ChampsContact';
import { BiensHero, useBiensBandeau } from '@/components/contacts/BiensBandeau';
import DocumentsDuClient from '@/components/documents/DocumentsDuClient';
import { colonneSuspensionAbsente, lireSuspension, dansMois, jourLisible } from '@/lib/suspension';
import { ajouterMois, jourParis, joursRestants } from '@/lib/mandat';
import { retracteEnLigne } from '@/lib/documents-espace';
import { CLES_MAIL, signatureDe, personnaliser, conseillerDe } from '@/lib/mail-variables';

/* ══ Le bloc « Critères de recherche » de la fiche ════════════════════════
   Un bandeau sombre pour le client et son enveloppe, puis trois familles :
   le logement, l'immeuble, les transports. Avant, les neuf critères étaient
   posés dans une rangée qui se repliait toute seule — « Transports » et
   « Étage » prenaient toute la largeur, le reste se serrait, et rien ne
   s'alignait. */
const CRIT_CHIP: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,.72)',
  border: '1px solid #efe3c6', borderRadius: 10, padding: '7px 13px',
  fontSize: 13, fontWeight: 600, color: '#6b6045',
};
const CRIT_CHIP_FORT: React.CSSProperties = {
  ...CRIT_CHIP, background: '#ffffff', border: '1px solid #e3d3ab',
  fontSize: 14.5, fontWeight: 800, color: 'var(--emilio)',
};

/* Une fenêtre se pose sur <body>, jamais dans la page.
   Un parent qui porte une animation devient le repère des éléments
   « position: fixed » : la fenêtre se centrait alors au milieu de toute la
   hauteur de la fiche, donc hors de l'écran — on ne voyait plus que le voile
   gris, sans pouvoir fermer. Le portail supprime le problème à la racine. */
function Portail({ children }: { children: React.ReactNode }) {
  const [pret, setPret] = useState(false);
  useEffect(() => { setPret(true); }, []);
  if (!pret) return null;
  return createPortal(children, document.body);
}

/* Un budget se lit toujours en entier, séparateurs compris : « 380 000 € »,
   « 1 500 000 € » — jamais « 380 k€ » ni « 1,5 M€ » (Alexandre, V3.21 :
   le chiffre complet se voit mieux). */
function budgetLisible(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}
function fourchetteBudget(min: number, max: number): string {
  return `${Math.round(min).toLocaleString('fr-FR')} – ${budgetLisible(max)}`;
}

/* Ce qui change dans une recherche mérite d'être raconté : « Budget maxi :
   900 000 € → 950 000 € » en dit plus que « critères modifiés ». Sans ça, une
   modification de critères ne laissait aucune trace au journal, et la liste
   clients continuait d'afficher « rien depuis trois mois ». */
const CHAMPS_SUIVIS: { cle: string; nom: string; fmt?: (v: unknown) => string }[] = [
  { cle: 'type_bien', nom: 'Type' },
  { cle: 'budget_min', nom: 'Budget mini', fmt: (v) => `${Number(v).toLocaleString('fr-FR')} €` },
  { cle: 'budget_max', nom: 'Budget maxi', fmt: (v) => `${Number(v).toLocaleString('fr-FR')} €` },
  { cle: 'surface_min', nom: 'Surface mini', fmt: (v) => `${v} m²` },
  { cle: 'surface_max', nom: 'Surface maxi', fmt: (v) => `${v} m²` },
  { cle: 'nb_pieces_min', nom: 'Pièces mini' },
  { cle: 'nb_pieces_max', nom: 'Pièces maxi' },
  { cle: 'chambres_min', nom: 'Chambres mini' },
  { cle: 'surface_sejour_min', nom: 'Séjour mini', fmt: (v) => `${v} m²` },
  { cle: 'etage_min', nom: 'Étage mini' },
  { cle: 'etage_max', nom: 'Étage maxi' },
  { cle: 'dpe_max', nom: 'DPE maxi' },
  { cle: 'annee_construction_min', nom: 'Construit après' },
  { cle: 'etat_souhaite', nom: 'État', fmt: (v) => texteEtats(String(v)) || 'Pas de préférence' },
  { cle: 'urgence', nom: 'Urgence' },
  { cle: 'financement', nom: 'Financement' },
  { cle: 'apport', nom: 'Apport', fmt: (v) => `${Number(v).toLocaleString('fr-FR')} €` },
];

function resumeChangements(avant: Record<string, unknown> | undefined, apres: Record<string, unknown>) {
  if (!avant) return '';
  const lignes: string[] = [];
  const dit = (v: unknown, fmt?: (x: unknown) => string) =>
    v === null || v === undefined || v === '' ? 'non renseigné' : (fmt ? fmt(v) : String(v));

  for (const c of CHAMPS_SUIVIS) {
    const a = avant[c.cle] ?? null, b = apres[c.cle] ?? null;
    if (a !== b) lignes.push(`${c.nom} : ${dit(a, c.fmt)} → ${dit(b, c.fmt)}`);
  }

  const secA = (avant.secteurs as string[]) || [], secB = (apres.secteurs as string[]) || [];
  if (JSON.stringify(secA) !== JSON.stringify(secB)) {
    const ajoutes = secB.filter(x => !secA.includes(x));
    const retires = secA.filter(x => !secB.includes(x));
    if (ajoutes.length) lignes.push(`Secteurs ajoutés : ${ajoutes.join(', ')}`);
    if (retires.length) lignes.push(`Secteurs retirés : ${retires.join(', ')}`);
  }

  const arrA = JSON.stringify(avant.transport_arrets || []), arrB = JSON.stringify(apres.transport_arrets || []);
  if (arrA !== arrB) lignes.push('Arrêts de transport modifiés');

  const equipements = ['parking', 'cave', 'balcon', 'terrasse', 'jardin', 'ascenseur', 'gardien', 'interphone', 'digicode', 'rdc_exclu', 'dernier_etage'];
  const bouge = equipements.filter(k => !!avant[k] !== !!apres[k]);
  if (bouge.length) lignes.push(`Équipements : ${bouge.join(', ')}`);
  if (JSON.stringify(avant.exigences || {}) !== JSON.stringify(apres.exigences || {})) lignes.push('Niveaux d\'exigence modifiés');
  if ((avant.notes || '') !== (apres.notes || '')) lignes.push('Précisions sur la recherche modifiées');

  return lignes.join(' · ');
}

/* Ce que le client a changé lui-même depuis son espace, ligne par ligne :
   l'ancienne valeur barrée, la nouvelle en gras. Écrit par la route
   /api/espace/criteres dans journal.metadata.changements — une valeur
   ({ l, a, p }, null = rien) ou une liste ({ l, plus, moins }). */
type ChangementCrit =
  | { l: string; a: string | null; p: string | null }
  | { l: string; plus: string[]; moins: string[] };

const BRUIT_CRITERES: Record<string, string> = {
  'Apport': '0\u00a0€', 'Étage minimum': 'rez-de-chaussée', 'Étage maximum': 'rez-de-chaussée',
  'Sans ascenseur, pas au-dessus du': 'rez-de-chaussée',
};
function estBruitCritere(c: ChangementCrit): boolean {
  if ('plus' in c) return false;
  const v = BRUIT_CRITERES[c.l];
  return !!v && ((c.a === null && c.p === v) || (c.p === null && c.a === v));
}

const PASTILLE_DIFF: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
  textTransform: 'uppercase', borderRadius: 6, padding: '2px 6px', marginRight: 6, whiteSpace: 'nowrap',
};

function DiffCriteres({ changements }: { changements: ChangementCrit[] }) {
  return (
    <div style={{ marginTop: 8, border: '1px solid #e8edf4', borderRadius: 11, overflow: 'hidden', background: 'white' }}>
      {changements.map((c, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: 'minmax(96px, 36%) minmax(0, 1fr)', gap: 10,
          padding: '8px 11px', borderTop: i ? '1px solid #f0f3f8' : 'none', fontSize: 12.5, lineHeight: 1.45,
        }}>
          <span style={{ color: '#64748b', fontWeight: 600 }}>{c.l}</span>
          {'plus' in c ? (
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {c.plus.map(x => (
                <span key={'+' + x} style={{ background: '#ecfdf3', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 7, padding: '1px 7px', fontWeight: 700 }}>{`+ ${x}`}</span>
              ))}
              {c.moins.map(x => (
                <span key={'-' + x} style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 7, padding: '1px 7px', textDecoration: 'line-through', textDecorationColor: 'rgba(185,28,28,.45)' }}>{`− ${x}`}</span>
              ))}
            </span>
          ) : c.a === null ? (
            <span><span style={{ ...PASTILLE_DIFF, background: '#dcfce7', color: '#15803d' }}>Ajouté</span><b style={{ color: 'var(--emilio)' }}>{c.p}</b></span>
          ) : c.p === null ? (
            <span><span style={{ ...PASTILLE_DIFF, background: '#fee2e2', color: '#b91c1c' }}>Retiré</span><s style={{ color: '#94a3b8' }}>{c.a}</s></span>
          ) : (
            <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 7px' }}>
              <s style={{ color: '#94a3b8', textDecorationColor: 'rgba(148,163,184,.8)' }}>{c.a}</s>
              <span style={{ color: '#c9a84c', fontWeight: 800 }}>→</span>
              <b style={{ color: 'var(--emilio)' }}>{c.p}</b>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* Clore une recherche, c'est dire pourquoi. « Trouvé ailleurs » et « a
   renoncé » comptent tous deux comme un dossier perdu côté chiffres, mais ce
   n'est pas la même histoire — et c'est cette histoire qu'on veut relire dans
   six mois. */
const MOTIFS_CLOTURE: { cle: string; nom: string; quoi: string; statut: string; point: string }[] = [
  { cle: 'trouve_avec_moi', nom: 'Trouvé avec moi', quoi: 'Le bien a été acquis grâce à la chasse', statut: 'bien_trouve', point: '#10b981' },
  { cle: 'trouve_ailleurs', nom: 'Trouvé ailleurs', quoi: 'Le client a acheté sans passer par nous', statut: 'perdu', point: '#f59e0b' },
  { cle: 'renonce', nom: 'A renoncé', quoi: 'Projet abandonné, reporté, ou plus de nouvelles', statut: 'perdu', point: '#94a3b8' },
  { cle: 'autre', nom: 'Autre raison', quoi: 'À préciser dans la note ci-dessous', statut: 'perdu', point: '#64748b' },
];

/* Les états d'un dossier. Le libellé seul ne suffisait pas : on dit quand
   chacun s'emploie, pour qu'on choisisse sans hésiter. */
const ETATS_CLIENT: { cle: string; nom: string; quand: string; point: string }[] = [
  { cle: 'prospect',    nom: 'Prospect',    quand: 'Premier contact, rien de signé', point: '#8b5cf6' },
  { cle: 'actif',       nom: 'Actif',       quand: 'Recherche en cours',             point: '#10b981' },
  { cle: 'suspendu',    nom: 'Suspendu',    quand: 'En pause, à reprendre plus tard', point: '#f59e0b' },
  { cle: 'bien_trouve', nom: 'Bien trouvé', quand: 'Acquisition faite, dossier clos', point: '#3b82f6' },
  { cle: 'perdu',       nom: 'Perdu',       quand: 'Le client ne cherche plus avec nous', point: '#ef4444' },
];

/* « minimum » en toutes lettres : « min » se confondait avec le chiffre. */
function Mini({ fort }: { fort?: boolean }) {
  return <span style={{ fontSize: 11.5, color: fort ? '#a9822f' : '#94a3b8', fontWeight: 600 }}> minimum</span>;
}

type LigneC = { lib: string; val: React.ReactNode; fort?: boolean };

/* Une colonne de famille : un en-tête teinté, puis ses lignes. */
function FamilleCrit({ titre, couleur, fond, trait, ico, lignes }:
  { titre: string; couleur: string; fond: string; trait: string; ico: React.ReactNode; lignes: LigneC[] }) {
  if (!lignes.length) return null;
  return (
    <div style={{ border: `1px solid ${trait}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ background: fond, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        {ico}
        <span style={{ fontSize: 11, fontWeight: 800, color: couleur, textTransform: 'uppercase', letterSpacing: 0.9 }}>{titre}</span>
      </div>
      <div style={{ padding: '4px 14px 10px' }}>
        {lignes.map((l, i) => (
          <div key={l.lib} style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
            padding: l.fort ? '9px 14px' : '9px 0', margin: l.fort ? '0 -14px' : undefined,
            background: l.fort ? '#fdfaf1' : undefined,
            borderBottom: i === lignes.length - 1 ? 'none' : '1px solid #f1f5f9',
          }}>
            <span style={{ fontSize: 13, color: l.fort ? '#a9822f' : '#64748b', fontWeight: l.fort ? 700 : 600 }}>{l.lib}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: l.fort ? '#a9822f' : 'var(--emilio)' }}>{l.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}



/* Les secteurs d'une recherche, ville par ville (« Courbevoie » puis ses
   quartiers, ou « Toute la ville »), dans leur carte (V3.104). La carte
   tient sur un tiers de la largeur : les quartiers passent sous la ville, en
   retrait et un peu plus petits, pour en tenir deux par ligne. */
const QUARTIER: React.CSSProperties = { fontSize: 12.5, padding: '3px 10px' };
function SecteursListe({ secteurs }: { secteurs: string[] }) {
  const bv: Record<string, string[]> = {};
  secteurs.forEach((s: string) => {
    const m = s.match(/^(.+?)\s*\((.+?)\)$/);
    if (m) { const q = m[1].trim(), v = m[2].trim(); if (!bv[v]) bv[v] = []; bv[v].push(q); }
    else { if (!bv[s]) bv[s] = []; }
  });
  return (
    <>
      {Object.entries(bv).map(([ville, qs]) => (
        <div key={ville} style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 9, background: '#eff4fb', border: '1px solid #d6e3f5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#3b6ea8' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M12 21.5S19 15 19 10a7 7 0 1 0-14 0c0 5 7 11.5 7 11.5z" /><circle cx="12" cy="10" r="2.6" /></svg>
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--emilio)' }}>{ville}</span>
            {qs.length === 0 && <span className={styles.secteurTag} style={QUARTIER}>Toute la ville</span>}
          </div>
          {qs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 36 }}>
              {qs.map(q => <span key={q} className={styles.secteurTag} style={QUARTIER}>{q}</span>)}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

import OngletVeille from './OngletVeille';
import OngletBiens from './OngletBiens';
import MandatEnLigne from './MandatEnLigne';
import PointAuto from './PointAuto';
import OngletVisites from './OngletVisites';
import CompteRenduVisite, { enregistrerCompteRendu, type ValeursCR } from '@/components/shared/CompteRenduVisite';
import { Onglets, StylesEmilio, Icone, LienEspace } from './ParcoursBien';
import FriseSuivi, { ISSUES_APPEL } from './FriseSuivi';
import CarteASavoir from '@/components/contacts/CarteASavoir';
import BlocSociete from '@/components/contacts/BlocSociete';
import Depliant from '@/components/shared/Depliant';
import { Horloge, LigneTuiles, Tuile, Tuiles } from '@/components/shared/Tuiles';
import ChoixSource from '@/components/contacts/ChoixSource';
import { colonneSourceAbsente, libelleSource, MESSAGE_SQL_SOURCE } from '@/lib/sources';
import BoutonCarte from '@/components/carte/BoutonCarte';
import { BarreOnglets, CorpsOnglet } from '@/components/shared/OngletsGlissants';
import Rapprochement from './Rapprochement';
import { mandatsPour, type MandatOk } from '@/lib/rapprochement';
import { ListeCoordonnees, lignesDe, nettoyer } from '@/components/shared/ListeCoordonnees';

/* Les titres que le formulaire « Ajouter une action » écrit tout seul (un
   type, une issue d'appel) : un autre clic peut les remplacer. Un titre tapé
   à la main, lui, n'est jamais écrasé par un changement de type. */
const TITRES_AUTO = new Set<string>(['Appel passé', 'RDV physique', 'Note libre', 'Relance manuelle', 'Envoi externe', 'Email envoyé', ...ISSUES_APPEL.map(x => x.titre)]);
const titreAuto = (t: string) => !t.trim() || TITRES_AUTO.has(t.trim());

const lienEntete: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600,
  color: 'rgba(255,255,255,.88)', textDecoration: 'none', fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const ORDRE_ETAPES = ['offre','negociation','offre_acceptee','compromis','acte'];

/* Chaque étape sait se présenter : son icône, son nom, et la phrase qui dit
   où on en est. Avant, ces informations étaient éparpillées dans le JSX —
   une icône ici, un libellé là — et rien ne disait à quoi servait l'étape. */
const ETAPES_TX: { cle: string; nom: string; quoi: string; icone: string }[] = [
  { cle: 'offre',          nom: 'Offre',          icone: '✍️', quoi: "L'offre est écrite et transmise au vendeur" },
  { cle: 'negociation',    nom: 'Négociation',    icone: '⚖️', quoi: 'Les contre-offres vont et viennent' },
  { cle: 'offre_acceptee', nom: 'Offre acceptée', icone: '🤝', quoi: 'Le prix est arrêté — place au notaire' },
  { cle: 'compromis',      nom: 'Compromis',      icone: '📋', quoi: 'Signé, les délais courent' },
  { cle: 'acte',           nom: 'Acte',           icone: '🔑', quoi: "Dernière ligne droite jusqu'aux clés" },
];

/* Un montant tapé au clavier : vide ou illisible → rien, jamais NaN.
   V3.50 : lu par `lireMontant` (src/lib/montant.ts). L'ancienne lecture ne
   gardait que les chiffres : « 8 333,33 » d'honoraires devenait 833 333 €, et
   le chiffre d'affaires gonflait d'autant. Les champs d'argent de la
   transaction sont des champs texte : « 8 333,33 », « 350 000 », « 850k »
   passent tous. À la sortie du champ, le montant se réécrit en clair. */
const champMontant = (v: unknown) => ecrireMontant(lireMontant(v), '');
function remettreEnForme(e: React.FocusEvent<HTMLInputElement>) {
  const n = lireMontant(e.currentTarget.value);
  if (n !== null) e.currentTarget.value = ecrireMontant(n, '');
}

/* V3.72 — Une adresse proposée pendant la frappe, dans « Modifier le
   contact » comme à sa création : la base adresse nationale, la même que
   pour les biens. Un choix remplit « rue, code postal ville » d'un coup, sans
   faute de frappe ; la carte la retrouve donc à coup sûr. Une ville seule
   (on a tapé un code postal) donne « code postal ville », sans doublon.
   Déclaré hors du rendu : sinon le champ perd le focus à chaque lettre. */
type AdresseProposee = { properties?: { label?: string; name?: string; postcode?: string; city?: string; type?: string } };
function adresseChoisie(p: NonNullable<AdresseProposee['properties']>): string {
  const ville = [p.postcode, p.city].filter(Boolean).join(' ');
  if (p.type === 'municipality') return ville || p.label || '';
  return [p.name || p.label || '', ville].filter(Boolean).join(', ');
}
function ChampAdresseAuto({ etiquette, valeur, onChange }: { etiquette: string; valeur: string; onChange: (v: string) => void }) {
  const [sug, setSug] = useState<AdresseProposee[]>([]);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const derniere = useRef('');
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);
  const taper = (q: string) => {
    onChange(q);
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
  const choisir = (f: AdresseProposee) => {
    onChange(adresseChoisie(f.properties || {}));
    derniere.current = '';
    setSug([]);
  };
  return (
    <div>
      <label className={styles.lbl}>{etiquette}</label>
      <div className={styles.adr}>
        <input className={styles.inp} value={valeur} autoComplete="off" placeholder="Tapez le début : 12 rue de Silly…"
          onChange={e => taper(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setSug([]); }}
          onBlur={() => setTimeout(() => setSug([]), 180)} />
        {sug.length > 0 && (
          <ul className={styles.adrSug} role="listbox" aria-label="Adresses proposées">
            {sug.map((f, i) => {
              const p = f.properties || {};
              const ville = p.type === 'municipality' ? (p.postcode || '') : [p.postcode, p.city].filter(Boolean).join(' ');
              return (
                <li key={i}>
                  <button type="button" role="option" aria-selected={false} onMouseDown={e => e.preventDefault()} onClick={() => choisir(f)}>
                    <b>{p.name || p.label}</b>
                    {ville && <small>{ville}</small>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {sug.length === 0 && <span className={styles.adrAide}>{'Tapez l’adresse et choisissez-la dans la liste.'}</span>}
    </div>
  );
}

/* V3.50 — Un bien d'acheteur qui est en fait un mandat de l'agence (une copie
   portant `bien_vente_id`) : l'offre, le compromis et l'acte se suivent sur
   la fiche du bien, pas dans une transaction de chasse (la vente y compte
   déjà dans le chiffre d'affaires). */
function CarteMandatAgence({ titre, onOuvrir }: { titre?: string | null; onOuvrir: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#fdfaf1', border: '1px solid #ecdcb4', borderRadius: 12, padding: '12px 14px', marginBottom: 14, textAlign: 'left' }}>
      <span style={{ flex: '1 1 240px', minWidth: 0, fontSize: 13, color: '#55647a', lineHeight: 1.55 }}>
        {titre ? <b style={{ display: 'block', color: 'var(--emilio)', fontSize: 13.5, marginBottom: 2 }}>{titre}</b> : null}
        {'Ce bien est un mandat de l’agence : l’offre, le compromis et l’acte se suivent sur la fiche du bien.'}
      </span>
      <button type="button" className={styles.btn} style={{ flexShrink: 0 }} onClick={onOuvrir}>Ouvrir la fiche du bien</button>
    </div>
  );
}

/* Ce que la fenêtre « Acte signé » lit d'une transaction. */
type TxActe = {
  id: string; recherche_id?: string | null; bien_id?: string | null;
  acte_date_prevue?: string | null; honoraires_ht?: unknown; honoraires_ttc?: unknown;
};

/* V3.50 — Les honoraires HT d'une vente signée (comme src/lib/activite.ts) :
   saisis HT, sinon TTC ramenés en HT, sinon rien. */
function honorairesHT(t: { honoraires_ht?: unknown; honoraires_ttc?: unknown }): number {
  const ht = lireMontant(t.honoraires_ht);
  if (ht !== null) return ht;
  const ttc = lireMontant(t.honoraires_ttc);
  return ttc !== null ? ttc / 1.2 : 0;
}

/* Le délai SRU part de la date du compromis — encore faut-il qu'elle existe.
   Sur un champ vidé, l'ancien calcul appelait toISOString() sur une date
   invalide : la page plantait. */
function finSRU(jour: string): string | null {
  const d = new Date(`${jour}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 10 * 86400000).toISOString().slice(0, 10);
}

/* V3.102 — `retourVers` : ouverte depuis Relances, le bouton retour y ramène
   et le dit (« ← Relances »). */
interface Props { client: Client; onBack: () => void; onNavigate: (page: string, data?: unknown) => void; retourVers?: 'relances'; }

function BienFormFields({ bienForm, setBienForm, prixAcq, styles }: { bienForm: any; setBienForm: any; prixAcq: number; styles: any }) {
  const set = (key: string, value: any) => setBienForm((f: any) => ({ ...f, [key]: value }));
  const toggle = (key: string) => setBienForm((f: any) => ({ ...f, [key]: !f[key] }));

  const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#c9a84c', letterSpacing: 1.5, textTransform: 'uppercase', margin: '8px 0 10px', paddingBottom: 6, borderBottom: '1px solid #f1f5f9' };
  const chip = (active: boolean): React.CSSProperties => ({
    padding: '7px 12px',
    borderRadius: 20,
    border: `1.5px solid ${active ? '#c9a84c' : '#e3e8f0'}`,
    background: active ? '#fdf6e3' : 'white',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    color: active ? '#854d0e' : '#64748b',
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    transition: 'all 0.12s',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

      {/* ===== IDENTIFICATION ===== */}
      <div style={sectionTitle}>📍 Identification</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label className={styles.lbl}>Titre du bien</label>
          <input className={styles.inp} value={bienForm.titre||''} onChange={e => set('titre', e.target.value)} placeholder="Ex: Appartement 3 pièces traversant sur jardin" />
        </div>
        <div>
          <label className={styles.lbl}>Type</label>
          <select className={styles.inp} value={bienForm.type_bien||'Appartement'} onChange={e => set('type_bien', e.target.value)}>
            <option>Appartement</option><option>Maison</option><option>Loft</option><option>Studio</option><option>Duplex</option><option>Villa</option><option>Terrain</option><option>Autre</option>
          </select>
        </div>
        <div>
          <label className={styles.lbl}>Source / Portail</label>
          <input className={styles.inp} value={bienForm.source_portail||''} onChange={e => set('source_portail', e.target.value)} placeholder="SeLoger, LogicImmo..." />
        </div>
        <div>
          <label className={styles.lbl}>Ville</label>
          <input className={styles.inp} value={bienForm.ville||''} onChange={e => set('ville', e.target.value)} />
        </div>
        <div>
          <label className={styles.lbl}>Code postal</label>
          <input className={styles.inp} value={bienForm.code_postal||''} onChange={e => set('code_postal', e.target.value)} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label className={styles.lbl}>Quartier <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optionnel)</span></label>
          <input className={styles.inp} value={bienForm.quartier||''} onChange={e => set('quartier', e.target.value)} placeholder="Parchamp–Albert Kahn..." />
        </div>
      </div>

      {/* ===== CARACTÉRISTIQUES ===== */}
      <div style={sectionTitle}>📐 Caractéristiques</div>
      <div className="fc-g4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div>
          <label className={styles.lbl}>Surface m²</label>
          <input className={styles.inp} type="number" value={bienForm.surface||''} onChange={e => set('surface', e.target.value)} />
        </div>
        <div>
          <label className={styles.lbl}>Pièces</label>
          <input className={styles.inp} type="number" value={bienForm.nb_pieces||''} onChange={e => set('nb_pieces', e.target.value)} />
        </div>
        <div>
          <label className={styles.lbl}>Chambres</label>
          <input className={styles.inp} type="number" value={bienForm.nb_chambres||''} onChange={e => set('nb_chambres', e.target.value)} />
        </div>
        <div>
          <label className={styles.lbl}>Sdb / Sdd</label>
          <input className={styles.inp} type="number" value={bienForm.nb_salles_bain||''} onChange={e => set('nb_salles_bain', e.target.value)} />
        </div>
        <div>
          <label className={styles.lbl}>WC</label>
          <input className={styles.inp} type="number" value={bienForm.nb_wc||''} onChange={e => set('nb_wc', e.target.value)} />
        </div>
        <div>
          <label className={styles.lbl}>Étage</label>
          <input className={styles.inp} type="number" value={bienForm.etage||''} onChange={e => set('etage', e.target.value)} placeholder="0=RDC" />
        </div>
        <div>
          <label className={styles.lbl}>Sur</label>
          <input className={styles.inp} type="number" value={bienForm.etage_total||''} onChange={e => set('etage_total', e.target.value)} placeholder="étages total" />
        </div>
        <div>
          <label className={styles.lbl}>Année</label>
          <input className={styles.inp} type="number" value={bienForm.annee_construction||''} onChange={e => set('annee_construction', e.target.value)} placeholder="1981" />
        </div>
        <div>
          <label className={styles.lbl}>Exposition</label>
          <select className={styles.inp} value={bienForm.exposition||''} onChange={e => set('exposition', e.target.value)}>
            <option value="">—</option>
            <option value="nord">Nord</option><option value="sud">Sud</option>
            <option value="est">Est</option><option value="ouest">Ouest</option>
            <option value="nord-sud">Nord-Sud</option><option value="est-ouest">Est-Ouest</option>
            <option value="nord-est">Nord-Est</option><option value="nord-ouest">Nord-Ouest</option>
            <option value="sud-est">Sud-Est</option><option value="sud-ouest">Sud-Ouest</option>
          </select>
        </div>
        <div>
          <label className={styles.lbl}>État général</label>
          <select className={styles.inp} value={bienForm.etat_general||''} onChange={e => set('etat_general', e.target.value)}>
            <option value="">—</option>
            <option value="Neuf">Neuf</option>
            <option value="Rénové">Rénové</option>
            <option value="Bon état">Bon état</option>
            <option value="Entretenu">Entretenu</option>
            <option value="À rafraîchir">À rafraîchir</option>
            <option value="À rénover">À rénover</option>
          </select>
        </div>
        <div className="fc-cache-mobile" style={{ gridColumn: '3/5' }}>
          <label className={styles.lbl} style={{ visibility: 'hidden' }}>spacer</label>
          <div style={{ height: 38 }} />
        </div>
      </div>

      {/* ===== ÉQUIPEMENTS (CHIPS) ===== */}
      <div style={sectionTitle}>✨ Équipements & Caractéristiques</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
        {[
          { key: 'parking', label: '🅿️ Parking' },
          { key: 'ascenseur', label: '🛗 Ascenseur' },
          { key: 'cave', label: '📦 Cave' },
          { key: 'balcon', label: '🌿 Balcon' },
          { key: 'terrasse', label: '🌞 Terrasse' },
          { key: 'jardin', label: '🌳 Jardin' },
          { key: 'gardien', label: '🛡️ Gardien' },
          { key: 'cuisine_equipee', label: '🍳 Cuisine équipée' },
          { key: 'climatisation', label: '❄️ Climatisation' },
          { key: 'traversant', label: '↔️ Traversant' },
        ].map(opt => (
          <button key={opt.key} type="button" onClick={() => toggle(opt.key)} style={chip(!!bienForm[opt.key])}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Surfaces optionnelles si balcon/terrasse cochés */}
      {(bienForm.balcon || bienForm.terrasse) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 6 }}>
          {bienForm.balcon && (
            <div>
              <label className={styles.lbl}>Surface balcon m² <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optionnel)</span></label>
              <input className={styles.inp} type="number" step="0.1" value={bienForm.surface_balcon||''} onChange={e => set('surface_balcon', e.target.value)} />
            </div>
          )}
          {bienForm.terrasse && (
            <div>
              <label className={styles.lbl}>Surface terrasse m² <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optionnel)</span></label>
              <input className={styles.inp} type="number" step="0.1" value={bienForm.surface_terrasse||''} onChange={e => set('surface_terrasse', e.target.value)} />
            </div>
          )}
        </div>
      )}

      {/* ===== PERFORMANCE ÉNERGÉTIQUE ===== */}
      <div style={sectionTitle}>🔋 Performance énergétique</div>
      <div className="fc-g4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div>
          <label className={styles.lbl}>DPE</label>
          <select className={styles.inp} value={bienForm.dpe||''} onChange={e => set('dpe', e.target.value)}>
            <option value="">—</option>
            <option value="A">A</option><option value="B">B</option><option value="C">C</option>
            <option value="D">D</option><option value="E">E</option><option value="F">F</option><option value="G">G</option>
          </select>
        </div>
        <div>
          <label className={styles.lbl}>Conso kWh/m²/an</label>
          <input className={styles.inp} type="number" value={bienForm.dpe_conso||''} onChange={e => set('dpe_conso', e.target.value)} placeholder="292" />
        </div>
        <div>
          <label className={styles.lbl}>GES</label>
          <select className={styles.inp} value={bienForm.ges||''} onChange={e => set('ges', e.target.value)}>
            <option value="">—</option>
            <option value="A">A</option><option value="B">B</option><option value="C">C</option>
            <option value="D">D</option><option value="E">E</option><option value="F">F</option><option value="G">G</option>
          </select>
        </div>
        <div>
          <label className={styles.lbl}>Émissions kg CO₂/m²/an</label>
          <input className={styles.inp} type="number" value={bienForm.ges_emissions||''} onChange={e => set('ges_emissions', e.target.value)} placeholder="64" />
        </div>
        <div>
          <label className={styles.lbl}>Chauffage</label>
          <select className={styles.inp} value={bienForm.chauffage||''} onChange={e => set('chauffage', e.target.value)}>
            <option value="">—</option>
            <option value="Central">Central</option>
            <option value="Individuel">Individuel</option>
            <option value="Collectif">Collectif</option>
            <option value="Électrique">Électrique</option>
          </select>
        </div>
        <div className="fc-auto" style={{ gridColumn: '2/-1' }}>
          <label className={styles.lbl}>Source d&apos;énergie</label>
          <select className={styles.inp} value={bienForm.source_energie||''} onChange={e => set('source_energie', e.target.value)}>
            <option value="">—</option>
            <option value="Gaz">Gaz</option>
            <option value="Électrique">Électrique</option>
            <option value="Fioul">Fioul</option>
            <option value="Pompe à chaleur">Pompe à chaleur</option>
            <option value="Bois">Bois</option>
            <option value="Solaire">Solaire</option>
          </select>
        </div>
      </div>

      {/* ===== PRIX & CHARGES ===== */}
      <div style={sectionTitle}>💰 Prix & Charges</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <div>
          <label className={styles.lbl}>Prix vendeur €</label>
          <input className={styles.inp} type="number" value={bienForm.prix_vendeur||''} onChange={e => set('prix_vendeur', e.target.value)} />
        </div>
        <div>
          <label className={styles.lbl}>Commission</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className={styles.inp} style={{ width: 80 }} value={bienForm.commission_type||'pourcentage'} onChange={e => set('commission_type', e.target.value)}>
              <option value="pourcentage">%</option>
              <option value="montant">€</option>
            </select>
            <input className={styles.inp} type="number" value={bienForm.commission_val||''} onChange={e => set('commission_val', e.target.value)} />
          </div>
        </div>
        <div>
          <label className={styles.lbl}>Prix acquéreur (FAI)</label>
          <div className={styles.inp} style={{ background: '#fef9c3', color: '#854d0e', fontWeight: 700 }}>
            {prixAcq ? `${prixAcq.toLocaleString('fr-FR')}€` : '—'}
          </div>
        </div>
        <div>
          <label className={styles.lbl}>Prix au m²</label>
          <div className={styles.inp} style={{ background: '#f8fafc', color: '#64748b' }}>
            {prixAcq && bienForm.surface ? `${Math.round(prixAcq / parseFloat(bienForm.surface)).toLocaleString('fr-FR')}€/m²` : '—'}
          </div>
        </div>
        <div>
          <label className={styles.lbl}>Charges trimestrielles €</label>
          <input className={styles.inp} type="number" value={bienForm.charges_trimestrielles||''} onChange={e => set('charges_trimestrielles', e.target.value)} placeholder="1050" />
        </div>
        <div>
          <label className={styles.lbl}>Compris dans les charges</label>
          <input className={styles.inp} value={bienForm.charges_comprises||''} onChange={e => set('charges_comprises', e.target.value)} placeholder="chauffage et eau chaude collectifs, gardien" />
        </div>
        <div>
          <label className={styles.lbl}>Taxe foncière annuelle €</label>
          <input className={styles.inp} type="number" value={bienForm.taxe_fonciere||''} onChange={e => set('taxe_fonciere', e.target.value)} placeholder="1393" />
        </div>
      </div>

      {/* ===== AGENCE / VENDEUR ===== */}
      <div style={sectionTitle}>🏢 Agence / Vendeur</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label className={styles.lbl}>Nom agence ou vendeur</label>
          <input className={styles.inp} value={bienForm.agence_nom||''} onChange={e => set('agence_nom', e.target.value)} />
        </div>
        <div>
          <label className={styles.lbl}>Téléphone</label>
          <input className={styles.inp} value={bienForm.agence_tel||''} onChange={e => set('agence_tel', e.target.value)} />
        </div>
      </div>

      {/* ===== DESCRIPTION ===== */}
      <div style={sectionTitle}>📝 Description</div>
      <textarea className={styles.inp} rows={5} value={bienForm.description||''} onChange={e => set('description', e.target.value)} placeholder="Description complète du bien telle qu'envoyée au client..." />

    </div>
  );
}

/* Le formulaire « Modifier le contact », rempli depuis la fiche. La
   personne 2 d'une fiche « couple » y est aussi (src/lib/foyer.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cfDe(client: any) {
  const j = conjointDe(client.conjoint);
  return {
    prenom: client.prenom, nom: client.nom, adresse: client.adresse || '',
    /* Tous les e-mails et tous les numéros, pas seulement deux (V3.89) :
       l'import ImmoFacile en garde jusqu'à quatre. */
    emails: lignesDe(client.emails), tels: lignesDe(client.telephones), statut_occupation: client.statut_occupation || '',
    bien_actuel_type: client.bien_actuel_type || '', bien_actuel_surface: client.bien_actuel_surface?.toString() || '',
    bien_actuel_valeur: client.bien_actuel_valeur?.toString() || '', bien_actuel_a_vendre: client.bien_actuel_a_vendre || false,
    bien_actuel_notes: client.bien_actuel_notes || '', bien_actuel_adresse: client.bien_actuel_adresse || '', bien_actuel_meme_adresse: !client.bien_actuel_adresse,
    civilite: (client.civilite === 'Monsieur' || client.civilite === 'Madame' ? client.civilite : '') as '' | 'Monsieur' | 'Madame',
    couple: !!client.couple,
    c2_civilite: (j?.civilite === 'Monsieur' || j?.civilite === 'Madame' ? j.civilite : '') as '' | 'Monsieur' | 'Madame',
    c2_prenom: j?.prenom || '', c2_nom: j?.nom || '', c2_email: j?.email || '', c2_tel: j?.telephone || '',
    /* D'où vient le contact (V3.23, outils/sql/source-contact.sql). */
    source: (client.source || '') as string, source_detail: (client.source_detail || '') as string,
  };
}

/* ══ L'en-tête de la fiche (V3.29) ═════════════════════════════════════
   Les coordonnées tiennent dans un panneau de trois lignes, posé dans le
   bloc bleu. « Tout voir » le déplie PAR-DESSUS les onglets : le bloc bleu
   ne grandit jamais, quel que soit le nombre de numéros. Dans un couple,
   chaque ligne dit à qui elle est (« Madame », « Monsieur », ou le prénom
   quand les deux ont la même civilité). */
export type Coord = { k: 'tel' | 'mail' | 'adresse'; val: string; qui?: string };

/* Exportées (V3.32) : la fiche des autres contacts a le même panneau. */
export function Coordonnees({ coords, onModifier, pied }: { coords: Coord[]; onModifier: () => void; pied?: React.ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  const [copie, setCopie] = useState('');
  const racine = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => { if (!racine.current?.contains(e.target as Node)) setOuvert(false); };
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', dehors);
    document.addEventListener('keydown', echap);
    return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', echap); };
  }, [ouvert]);
  const copier = async (v: string) => {
    try { await navigator.clipboard.writeText(v); setCopie(v); setTimeout(() => setCopie(c => (c === v ? '' : c)), 1600); } catch { /* le presse-papiers refusé : rien à faire */ }
  };
  const ligne = (c: Coord, i: number) => {
    const ic = c.k === 'tel' ? 'tel' : c.k === 'mail' ? 'mail' : 'lieu';
    const contenu = (
      <>
        <span className={styles.coIc}><Icone nom={ic} taille={14} epaisseur={2} /></span>
        <span className={styles.coVal}>{c.val}</span>
        {c.qui && <em className={styles.coQui}>{`(${c.qui})`}</em>}
      </>
    );
    return (
      <div key={`${c.k}-${c.val}-${i}`} className={styles.coLigne}>
        {c.k === 'adresse'
          ? <span className={styles.coLien}>{contenu}</span>
          : <a className={styles.coLien} href={c.k === 'tel' ? `tel:${c.val.replace(/[^+\d]/g, '')}` : `mailto:${c.val}`}>{contenu}</a>}
        <button type="button" className={styles.coCopie} onClick={() => copier(c.val)}
          aria-label={c.k === 'tel' ? 'Copier le numéro' : c.k === 'mail' ? 'Copier le mail' : 'Copier l’adresse'}
          title={copie === c.val ? 'Copié' : 'Copier'}>
          <Icone nom={copie === c.val ? 'coche' : 'copie'} taille={14} epaisseur={2} />
        </button>
      </div>
    );
  };
  const tels = coords.filter(c => c.k === 'tel');
  const mails = coords.filter(c => c.k === 'mail');
  const adr = coords.filter(c => c.k === 'adresse');
  const deborde = coords.length > 3;
  const tete = (
    <div className={styles.coTete}>
      <span>Coordonnées</span>
      <button type="button" onClick={onModifier}>Modifier</button>
    </div>
  );
  return (
    <div className={styles.coZone} ref={racine}>
      <div className={styles.coPanneau}>
        {tete}
        {coords.length === 0
          ? <div className={styles.coVide}>{'Aucun numéro ni mail. '}<button type="button" onClick={onModifier}>Les ajouter</button></div>
          : coords.slice(0, 3).map(ligne)}
        {/* « Voir sur la carte » : ici tant que tout tient, sinon dans le dépliage. */}
        {!deborde && pied && <div className={styles.coPied}>{pied}</div>}
        {deborde && (
          <button type="button" className={styles.coPlus} aria-expanded={ouvert} onClick={() => setOuvert(true)}>
            <span>{`Tout voir · ${coords.length} coordonnée${coords.length > 1 ? 's' : ''}`}</span>
            <Icone nom="chevron" taille={14} epaisseur={2.2} />
          </button>
        )}
      </div>
      {ouvert && (
        <div className={`${styles.coPanneau} ${styles.coDeplie}`} role="dialog" aria-label="Toutes les coordonnées">
          {tete}
          {tels.length > 0 && <span className={styles.coGroupe}>{tels.length > 1 ? 'Téléphones' : 'Téléphone'}</span>}
          {tels.map(ligne)}
          {mails.length > 0 && <span className={styles.coGroupe}>{mails.length > 1 ? 'Mails' : 'Mail'}</span>}
          {mails.map(ligne)}
          {adr.length > 0 && <span className={styles.coGroupe}>Adresse</span>}
          {adr.map(ligne)}
          {pied && <div className={styles.coPied}>{pied}</div>}
          <button type="button" className={`${styles.coPlus} ${styles.coReduire}`} onClick={() => setOuvert(false)}>
            <span>Réduire</span>
            <Icone nom="chevron" taille={14} epaisseur={2.2} />
          </button>
        </div>
      )}
    </div>
  );
}

/* « il y a 12 min », « il y a 2 h », « hier », « il y a 5 jours ». */
function ilYA(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 2) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j === 1) return 'hier';
  if (j < 31) return `il y a ${j} jours`;
  return `le ${new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
}

/* « Neuilly, Boulogne » : les villes des secteurs, sans leurs quartiers. */
function grouperVilles(secteurs: string[]): string {
  const villes: string[] = [];
  for (const x of secteurs) {
    const m = String(x).match(/\(([^()]+)\)\s*$/);
    const v = (m ? m[1] : String(x)).trim();
    if (v && !villes.includes(v)) villes.push(v);
  }
  return villes.length > 3 ? `${villes.slice(0, 3).join(', ')} et ${villes.length - 3} autre${villes.length > 4 ? 's' : ''}` : villes.join(', ');
}

/* « 8 jours », « 3 mois », « 1 an et 2 mois » : depuis quand on le suit. */
function dureeSuivi(j: number): string {
  if (j <= 0) return 'aujourd’hui';
  if (j === 1) return '1 jour';
  if (j < 45) return `${j} jours`;
  const mois = Math.round(j / 30.44);
  if (mois < 12) return `${mois} mois`;
  const ans = Math.floor(mois / 12), reste = mois % 12;
  return `${ans} an${ans > 1 ? 's' : ''}${reste ? ` et ${reste} mois` : ''}`;
}

/* Les grandes rubriques de la fiche (V3.29), dans l'ordre de la barre. */
type VueFiche = 'ensemble' | 'recherche' | 'rapprochement' | 'espace' | 'documents' | 'suivi';
const ORDRE_VUES: VueFiche[] = ['ensemble', 'recherche', 'rapprochement', 'espace', 'documents', 'suivi'];

export default function FicheClient({ client: init, onBack, onNavigate, retourVers }: Props) {
  /* Arrivée « au bon endroit » (depuis une relance) : l'onglet, le filtre du
     Suivi, la recherche, et l'action à surligner. Voir src/lib/intentions.ts. */
  const [ouverture] = useState(() => lireOuvertureFiche(init.id));
  const [client, setClient] = useState<Client>(init);
  const [recherches, setRecherches] = useState<Recherche[]>([]);
  const [rechercheId, setRechercheId] = useState<string>(ouverture?.rechercheId || '');
  const rechercheActive = recherches.find(r => r.id === rechercheId) || null;
  const cr = rechercheActive || ({ secteurs: [] } as unknown as Recherche);
  /* Deux niveaux depuis la V3.29 : les rubriques de la fiche (Vue
     d'ensemble, Sa recherche, Son espace, Documents, Suivi), et dans « Sa
     recherche », les étapes du dossier (Veille, Sélection, Présentés,
     Visites, Transaction). `setTab` garde son nom et son usage : choisir une
     étape ouvre « Sa recherche », choisir « suivi » ouvre le Suivi. */
  const [tab, setTabBrut] = useState<string>(ouverture?.onglet && ouverture.onglet !== 'suivi' ? ouverture.onglet : 'presentes');
  /* Arrivée par défaut : un contact qui n'est qu'acheteur s'ouvre sur « Sa
     recherche » — c'est pour elle qu'on vient. S'il est aussi vendeur,
     propriétaire, etc., sur « Vue d'ensemble ». */
  const seulAcheteur = !((init as unknown as { types?: string[] | null }).types || []).some(t => t !== 'acheteur');
  const [vue, setVue] = useState<VueFiche>(ouverture?.onglet === 'suivi' ? 'suivi' : ouverture?.onglet ? 'recherche' : seulAcheteur ? 'recherche' : 'ensemble');
  const setTab = useCallback((t: string) => {
    if (t === 'suivi') { setVue('suivi'); return; }
    setTabBrut(t); setVue('recherche');
  }, []);
  /* Le nombre de ses documents, pour l'onglet « Documents ». */
  const [nbDocs, setNbDocs] = useState<number | null>(null);
  useEffect(() => {
    let vivant = true;
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('client_id', init.id)
      .then(({ count, error }) => { if (vivant) setNbDocs(error ? null : count ?? 0); });
    return () => { vivant = false; };
  }, [init.id]);
  /* Le rapprochement (V3.29) : la fenêtre, et les mandats en cours qui
     correspondent déjà à sa recherche (pour le bandeau de la Vue d'ensemble). */
  const [rappro, setRappro] = useState(false);
  const [mandatsOk, setMandatsOk] = useState<{ n: number; meilleure: number; liste: MandatOk[] } | null>(null);
  /* Depuis une alerte (« un acheteur arrive ») ou le petit message après
     l'enregistrement des critères : le rapprochement part tout seul, sur vos
     mandats, ceux-là déjà cochés. Remis à zéro à la fermeture. */
  const [rapproDepart, setRapproDepart] = useState<{ source: 'mandats' | 'veilles' | 'deux'; cocher?: string[] } | null>(null);
  const [toastRappro, setToastRappro] = useState<{ titre: string; texte: string; ids: string[] } | null>(null);
  const [veilleCount, setVeilleCount] = useState(0);

  const chargerVeilleCount = useCallback(async () => {
    if (!rechercheId) { setVeilleCount(0); return; }
    const { count } = await supabase
      .from('veille_propositions')
      .select('id', { count: 'exact', head: true })
      .eq('recherche_id', rechercheId)
      .eq('statut', 'nouveau');
    setVeilleCount(count || 0);
  }, [rechercheId]);

  useEffect(() => { chargerVeilleCount(); }, [chargerVeilleCount]);

  /* ── le filet de sécurité du lien d'espace ──
     Depuis `migration-espace-client.sql`, le lien est rangé sur le client.
     La reprise l'a posé sur tous ceux qui avaient au moins une recherche ;
     restent ceux qui n'en avaient aucune, et ceux créés avant la mise à jour
     du formulaire. On leur en pose un à la première ouverture de leur fiche,
     pour qu'Alexandre ait toujours un lien à copier. */
  useEffect(() => {
    if (!client.id || client.token_espace) return;
    let vivant = true;
    (async () => {
      const jeton = jetonEspace(client.prenom, client.nom);
      const { data } = await supabase.from('clients')
        .update({ token_espace: jeton }).eq('id', client.id).select().single();
      if (vivant && data) setClient(data as Client);
    })();
    return () => { vivant = false; };
  }, [client.id, client.token_espace, client.prenom, client.nom]);
  const [suiviFiltre, setSuiviFiltre] = useState<string>(ouverture?.onglet === 'suivi' ? (ouverture.filtre || 'tout') : 'tout');
  /* Un client à plusieurs recherches : le Suivi montre celle qu'on regarde
     (et ce qui concerne le client entier). Les lignes des autres se
     rajoutent d'un clic, marquées de leur recherche (§6.17). */
  const [suiviToutesPour, setSuiviToutesPour] = useState<string | null>(null);
  /* Venu d'une relance : la ligne visée reste visible, même notée sur une
     autre recherche que celle ouverte. */
  const [ligneVisee, setLigneVisee] = useState<string | null>(null);
  /* La ligne du Suivi à surligner : l'action qui a créé la relance. */
  const [surligne, setSurligne] = useState<string | null>(null);
  const ouvertureFaite = useRef(false);
  useEffect(() => { if (ouverture) oublierOuvertureFiche(); }, [ouverture]);
  /* Sur téléphone, le détail des critères est replié : le suivi du dossier
     (veille, sélection, présentés…) remonte d'autant. Sans effet sur ordinateur. */
  const [critsOuverts, setCritsOuverts] = useState(false);
  const [biens, setBiens] = useState<any[]>([]);
  const [visites, setVisites] = useState<any[]>([]);
  const [transaction, setTransaction] = useState<any>(null);
  const [envois, setEnvois] = useState<any[]>([]);
  const [journal, setJournal] = useState<any[]>([]);
  /* Venu d'une relance : dès que le journal est là, on retrouve l'action qui
     l'a créée, on règle le filtre du Suivi sur son type, on la surligne et on
     l'amène à l'écran. Sans action liée, on descend simplement aux onglets. */
  useEffect(() => {
    if (!ouverture || ouvertureFaite.current || !journal.length) return;
    ouvertureFaite.current = true;
    const j = ouverture.relanceId ? journal.find(x => x?.metadata?.relance_id === ouverture.relanceId) : null;
    if (ouverture.onglet === 'suivi' && j) {
      setSuiviFiltre(filtreDuSuivi(j.type));
      setSurligne(j.id);
      /* L'action notée sur une autre recherche que celle ouverte : on la
         montre quand même, c'est elle qu'on vient voir. */
      setLigneVisee(j.id);
    }
    const t1 = setTimeout(() => {
      const cible = (j && ouverture.onglet === 'suivi' && document.getElementById(`suivi-${j.id}`)) || document.querySelector('.fc-onglets');
      cible?.scrollIntoView({ block: j ? 'center' : 'start', behavior: 'smooth' });
    }, 380);
    const t2 = setTimeout(() => setSurligne(null), 6000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [journal, ouverture]);
  /* Ce que le client a fait de son côté : modifications de critères et messages.
     Le bloc « Critères » porte une pastille tant qu'Alexandre ne les a pas lus. */
  const [histoEvts, setHistoEvts] = useState<any[]>([]);
  const [showHisto, setShowHisto] = useState(false);

  /* Non lus = ce que le client a fait depuis la dernière fois qu'on a ouvert l'historique. */
  const vuLe = rechercheActive?.historique_vu_le ? new Date(rechercheActive.historique_vu_le).getTime() : 0;
  const histoNonVus = histoEvts.filter(e => new Date(e.created_at).getTime() > vuLe).length;

  async function ouvrirHistorique() {
    setShowHisto(true);
    if (!rechercheId || histoNonVus === 0) return;
    const maintenant = new Date().toISOString();
    const { data } = await supabase.from('recherches')
      .update({ historique_vu_le: maintenant }).eq('id', rechercheId).select().single();
    if (data) setRecherches(rs => rs.map(r => (r.id === rechercheId ? (data as Recherche) : r)));
  }
  const [saving, setSaving] = useState(false);

  const [showContact, setShowContact] = useState(false);
  const [showCriteres, setShowCriteres] = useState(false);
  /* Pop-up critères : « tout d'un coup » (scroll) ou « étape par étape » (assistant). */
  const [modeCrit, setModeCrit] = useState<ModeCrit>('tout');
  const [etapeCrit, setEtapeCrit] = useState(0);
  const [sensCrit, setSensCrit] = useState<1 | -1>(1);
  useEffect(() => { setModeCrit(lireModeCrit()); }, []);
  const changerModeCrit = (m: ModeCrit) => { setModeCrit(m); setEtapeCrit(0); setSensCrit(1); ecrireModeCrit(m); };
  const ouvrirCriteres = (etape = 0) => { setEtapeCrit(etape); setSensCrit(1); setShowCriteres(true); };
  const [showMandat, setShowMandat] = useState(false);
  /* La dernière signature en ligne de la recherche affichée. Une
     rétractation se voit sur le bouton du mandat (en rouge, avec une pastille
     « 1 » tant qu'Alexandre n'a pas ouvert la fenêtre) : c'est une
     information qui ne doit pas se perdre dans l'historique. */
  const [derniereSig, setDerniereSig] = useState<{ id: string; numero: string; statut: string; retracte_le: string | null; created_at?: string | null } | null>(null);
  const [sigVue, setSigVue] = useState(true);
  useEffect(() => {
    let vivant = true;
    setDerniereSig(null);
    if (!rechercheId) return;
    supabase.from('mandats_signatures').select('id, numero, statut, retracte_le, created_at')
      .eq('recherche_id', rechercheId).order('created_at', { ascending: false }).limit(1)
      .then(({ data, error }) => {
        if (!vivant || error || !data?.length) return;
        const s = data[0] as { id: string; numero: string; statut: string; retracte_le: string | null; created_at: string | null };
        setDerniereSig(s);
        let vu = true;
        try { vu = !!localStorage.getItem('emilio_retractation_vue_' + s.id); } catch { /* sans effet */ }
        setSigVue(vu);
      });
    return () => { vivant = false; };
  }, [rechercheId, showMandat]);
  /* Un mandat de recherche préparé dans Documents, pas encore signé (V3.32) :
     le bouton du mandat le dit (« envoyé, en attente de signature »), au lieu
     de « non renseigné ». */
  const [docMandatLu, setDocMandatLu] = useState<{ rid: string; doc: { id: string; statut: string; numero: string | null; signature: unknown } | null } | null>(null);
  useEffect(() => {
    let vivant = true;
    if (!rechercheId) return;
    supabase.from('documents').select('*').eq('modele', 'mandat_recherche').eq('recherche_id', rechercheId)
      .in('statut', ['brouillon', 'pret']).order('updated_at', { ascending: false }).limit(3)
      .then(({ data, error }) => {
        if (!vivant) return;
        const l = (error ? [] : data || []) as { id: string; statut: string; numero: string | null; signature: unknown }[];
        /* V3.56 : celui qui est parti en signature d'abord (comme l'espace). */
        setDocMandatLu({ rid: rechercheId, doc: l.find(x => x.statut === 'pret' && !!x.signature) || l.find(x => x.statut === 'pret') || l[0] || null });
      });
    return () => { vivant = false; };
  }, [rechercheId, showMandat]);
  const docMandat = docMandatLu && docMandatLu.rid === rechercheId ? docMandatLu.doc : null;
  /* V3.56 : un mandat de recherche de Documents auquel le client a renoncé
     en ligne, depuis son espace (le dernier annulé de la recherche, s'il
     porte la marque de retracteEnLigne). Le bouton le dit en rouge, comme
     pour le mandat signé dans l'espace. */
  const [docRetracteLu, setDocRetracteLu] = useState<{ rid: string; doc: { id: string; numero: string | null; retracte_le: string } | null; vu: boolean } | null>(null);
  useEffect(() => {
    let vivant = true;
    if (!rechercheId) return;
    supabase.from('documents').select('id, numero, statut, donnees, annule_le').eq('modele', 'mandat_recherche').eq('recherche_id', rechercheId)
      .eq('statut', 'annule').order('annule_le', { ascending: false, nullsFirst: false }).limit(1)
      .then(({ data, error }) => {
        if (!vivant) return;
        const x = (error ? [] : data || [])[0] as { id: string; numero: string | null; statut: string; donnees: unknown } | undefined;
        const le = retracteEnLigne(x);
        let vu = true;
        if (x && le) { try { vu = !!localStorage.getItem('emilio_retractation_vue_d-' + x.id); } catch { /* sans effet */ } }
        setDocRetracteLu({ rid: rechercheId, doc: x && le ? { id: x.id, numero: x.numero, retracte_le: le } : null, vu });
      });
    return () => { vivant = false; };
  }, [rechercheId, showMandat]);
  /* Le plus récent des deux : signé dans l'espace puis rétracté, ou de
     Documents rétracté en ligne — tant qu'aucun mandat n'est noté depuis.
     V3.56 : comme l'espace (page.tsx), celui de Documents ne compte plus
     dès que quelque chose de plus récent est venu : une signature commencée
     dans l'espace, ou une nouvelle proposition. */
  const quandR = (v: string | null | undefined) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : 0; };
  const docRetracte = docRetracteLu?.rid === rechercheId && docRetracteLu.doc && !docMandat
    && quandR(derniereSig?.created_at) <= quandR(docRetracteLu.doc.retracte_le)
    && quandR(cr.mandat_propose_le as string | null | undefined) <= quandR(docRetracteLu.doc.retracte_le)
    ? docRetracteLu.doc : null;
  const retracte = [
    derniereSig?.statut === 'retracte' ? { id: derniereSig.id, numero: derniereSig.numero as string | null, retracte_le: derniereSig.retracte_le, vu: sigVue } : null,
    docRetracte && docRetracteLu ? { ...docRetracte, id: 'd-' + docRetracte.id, vu: docRetracteLu.vu } : null,
  ].filter((x): x is { id: string; numero: string | null; retracte_le: string | null; vu: boolean } => !!x && !cr.mandat_date_signature)
    .sort((a, b) => quandR(b.retracte_le) - quandR(a.retracte_le))[0] || null;
  function ouvrirMandat() {
    setShowMandat(true);
    if (retracte && !retracte.vu) {
      try { localStorage.setItem('emilio_retractation_vue_' + retracte.id, '1'); } catch { /* sans effet */ }
      if (retracte.id.startsWith('d-')) setDocRetracteLu(x => (x ? { ...x, vu: true } : x));
      else setSigVue(true);
    }
  }
  /* Le menu se posait dans la carte d'en-tête, qui rogne ce qui dépasse : il
     était coupé en deux. Il s'ouvre maintenant par-dessus la page, à l'aplomb
     du bouton — d'où la position retenue ici. */
  const [menuStatut, setMenuStatut] = useState<{ x: number; y: number } | null>(null);
  /* « Sa société » ouverte depuis le bandeau, avant qu'elle soit notée (V3.31). */
  const [societeOuverte, setSocieteOuverte] = useState(false);
  /* Chaque « Ajouter » repart d'un formulaire neuf (le bloc reste monté, V3.32). */
  const [cleSoc, setCleSoc] = useState(0);
  /* La carte des critères rogne ce qui dépasse : le menu des recherches se
     pose donc par-dessus la page, à l'aplomb du bouton. */
  const [posRecherche, setPosRecherche] = useState<{ x: number; y: number } | null>(null);
  /* La remise à zéro du suivi : on montre les vrais chiffres avant de demander
     confirmation, parce qu'« êtes-vous sûr ? » ne dit pas ce qu'on perd. */
  const [showReinit, setShowReinit] = useState(false);
  const [reinitEnCours, setReinitEnCours] = useState(false);
  const [reinitStats, setReinitStats] = useState<{
    propositions: number; passages: number; lues: number;
    biens: number; presentes: number; visites: number; envois: number;
    /* V3.50 : une transaction en cours (effacée) ; une vente signée (gardée,
       avec son bien : elle compte dans le chiffre d'affaires). */
    txOuverte: boolean; venteGardee: string | null;
  } | null>(null);
  /* Supprimer le client : la seule action de l'application qui efface une
     personne. Elle compte d'abord, et fait écrire le nom avant d'agir. */
  const [showSupprClient, setShowSupprClient] = useState(false);
  const [supprEnCours, setSupprEnCours] = useState(false);
  const [supprNom, setSupprNom] = useState('');
  const [supprStats, setSupprStats] = useState<{
    recherches: number; biens: number; propositions: number;
    visites: number; envois: number; passages: number; lues: number;
  } | null>(null);
  const [showCloture, setShowCloture] = useState(false);
  /* La petite fenêtre de « Suspendu » : avec ou sans date de reprise. */
  const [suspendre, setSuspendre] = useState<{ choix: 'sans' | '1' | '3' | '6' | 'date'; date: string } | null>(null);
  /* Choisir le bien d'une transaction : à la création, ou pour la corriger. */
  const [showChoixTx, setShowChoixTx] = useState<'creer' | 'changer' | null>(null);
  const [cloture, setCloture] = useState({ motif: 'trouve_avec_moi', note: '' });
  /* V3.50 — La fenêtre « Acte signé » : la date de signature (c'est elle qui
     range la vente dans le chiffre d'affaires), et la clôture qui suit.
     `portee` : l'acte d'une recherche (elle seule s'arrête), ou tout le
     dossier (« Clôturer › Trouvé avec moi » avec une transaction ouverte). */
  const [acte, setActe] = useState<{
    tx: TxActe; date: string; portee: 'recherche' | 'dossier'; raison: string | null; note: string;
  } | null>(null);
  /* V3.50 — Un double clic créait deux transactions : la deuxième faisait
     échouer la lecture de l'onglet, qui affichait « Aucune transaction ». */
  const txEnCreation = useRef(false);
  /* Les biens sous compromis déjà acceptés pour une visite (offre de secours) :
     la question n'est pas reposée à la confirmation de la visite. */
  const compromisAccepte = useRef<Set<string>>(new Set());
  const visiteEnCours = useRef(false);
  const [showBien, setShowBien] = useState(false);
  const [relancesAtt, setRelancesAtt] = useState<{ id: string; date_echeance: string; note: string | null; recherche_id?: string | null }[]>([]);
  /* V3.84 — Ses biens à lui (rubrique Biens), dans le bandeau bleu, comme
     pour un vendeur (« on est obligé de descendre en bas pour voir s'il a des
     biens qui lui appartiennent »). */
  const { biens: sesBiens, archives: sesArchives, vente: venteBiens } = useBiensBandeau(client.id);
  const [delaiJours, setDelaiJours] = useState(5);
  const [showAction, setShowAction] = useState(false);

  const [cf, setCf] = useState(() => cfDe(client));
  const [crit, setCrit] = useState<CritForm>(CRIT_VIDE);
  const [mandat, setMandat] = useState({ date_signature: '', duree: '3', honoraires: '2,5% TTC', date_expiration: '' });
  const [actionF, setActionF] = useState({ type: 'note', titre: '', description: '', bien_id: '', relance: '' });
  /* Modifier une ligne du suivi : on rouvre le même formulaire, en mémorisant
     laquelle. Vide = on en crée une nouvelle. */
  const [actionEdit, setActionEdit] = useState<string | null>(null);
  /* La relance née de cette action, s'il y en a une : c'est elle qu'on
     déplacera, supprimera — ou qu'on créera si elle manquait. */
  const [actionRelanceId, setActionRelanceId] = useState<string | null>(null);
  /* V3.83 — Les relances en attente que cette action règle : elles se
     ferment quand elle est notée (cochées d'office si elles sont dues). */
  const [aClore, setAClore] = useState<string[]>([]);

  /* « Noter un appel » (onglet Suivi) ouvre la même fenêtre, l'appel déjà
     choisi et sans le bloc « Créer un rendez-vous » : il ne reste qu'à dire
     comment ça s'est passé. */
  const [appelDirect, setAppelDirect] = useState(false);
  const notesAction = useRef<HTMLTextAreaElement>(null);
  function nouvelleAction(type: 'note' | 'appel' = 'note') {
    setActionEdit(null); setActionRelanceId(null); setAppelDirect(type === 'appel');
    setActionF({ type, titre: type === 'appel' ? 'Appel passé' : '', description: '', bien_id: '', relance: '' });
    setAClore(relancesACocher(relancesAtt, ouverture?.relanceId));
    setShowAction(true);
  }
  function fermerAction() {
    setShowAction(false); setActionEdit(null); setActionRelanceId(null); setAppelDirect(false); setAClore([]);
    setActionF({ type: 'note', titre: '', description: '', bien_id: '', relance: '' });
  }
  const [url, setUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [bienForm, setBienForm] = useState<any>(null);
  const [bienMode, setBienMode] = useState<'url'|'texte'>('url');
  const [texteAnnonce, setTexteAnnonce] = useState('');
  const [photosInput, setPhotosInput] = useState('');
  const [txData, setTxData] = useState<any>({});
  /* L'étape qu'on REGARDE — pas forcément celle où on en est : le rail permet
     de revenir voir ce qu'on a saisi à l'offre sans défaire quoi que ce soit. */
  const [vueEtape, setVueEtape] = useState<string | null>(null);
  const [coForm, setCoForm] = useState({ partie: 'vendeur', montant: '', date: '' });
  /* Les champs de transaction n'écrivent plus une requête par touche frappée :
     on groupe, on attend une demi-seconde, on envoie une fois. */
  const txPending = useRef<Record<string, any>>({});
  const txTimer = useRef<any>(null);
  const txRef = useRef<any>(null);
  const [showPlanVisite, setShowPlanVisite] = useState(false);
  const [showFicheBien, setShowFicheBien] = useState(false);
  const [showEnvoi, setShowEnvoi] = useState(false);
  const [showMail, setShowMail] = useState(false);
  const [showConfirmEtape, setShowConfirmEtape] = useState(false);
  const [showConfirmDeleteBien, setShowConfirmDeleteBien] = useState(false);
  const [showConfirmVisite, setShowConfirmVisite] = useState<string|null>(null);
  const [pendingBienId, setPendingBienId] = useState('');
  const [ficheBienId, setFicheBienId] = useState('');
  const [editBienForm, setEditBienForm] = useState<any>(null);
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [reformuling, setReformuling] = useState(false);
  const [dragOverIdx, setDragOverIdx] = useState<number|null>(null);
  const dragIdxRef = useRef(-1);
  const [showEnvoiBien, setShowEnvoiBien] = useState(false);
  const [envoiBienId, setEnvoiBienId] = useState('');
  const [envoiBienIds, setEnvoiBienIds] = useState<string[]>([]); // sélection multiple
  /* Envoi groupé depuis « Sélection » : la fenêtre de mail ne propose que les
     biens cochés — ce sont eux dont les honoraires viennent d'être fixés. */
  const [envoiPool, setEnvoiPool] = useState<string[] | null>(null);
  /* Monte d'un cran quand un mail de biens est parti : les onglets Sélection
     et Présentés, qui chargent leurs biens eux-mêmes, se rechargent. */
  const [versionBiens, setVersionBiens] = useState(0);
  useEffect(() => {
    if (!rechercheActive) { setMandatsOk(null); return; }
    let vivant = true;
    mandatsPour(rechercheActive as unknown as Record<string, unknown>, client.id)
      .then(r => { if (vivant) setMandatsOk(r); }).catch(() => { if (vivant) setMandatsOk(null); });
    return () => { vivant = false; };
  }, [rechercheActive, client.id, versionBiens]);
  /* Ouverte depuis la fiche d'un bien (« Envoyer par mail… ») : le mail
     d'envoi habituel s'ouvre sur ce bien dès qu'il est chargé. Depuis une
     alerte : le rapprochement part tout seul (V3.29). */
  const envoiFait = useRef(false);
  useEffect(() => {
    const ids = ouverture?.envoi;
    if (!ids?.length || envoiFait.current) return;
    if (!ids.every(id => biens.some(x => x.id === id))) return;
    envoiFait.current = true;
    openEnvoiMulti(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biens, ouverture]);
  const rapproLu = useRef(false);
  useEffect(() => {
    if (rapproLu.current || !ouverture?.rappro || !rechercheActive) return;
    rapproLu.current = true;
    setRapproDepart(ouverture.rappro);
    setRappro(true);
  }, [ouverture, rechercheActive]);
  useEffect(() => {
    if (!toastRappro) return;
    const t = setTimeout(() => setToastRappro(null), 14000);
    return () => clearTimeout(t);
  }, [toastRappro]);
  const [envoiMode, setEnvoiMode] = useState<'unique' | 'multi' | 'libre'>('unique');
  const [envoiForm, setEnvoiForm] = useState({ destinataires: '', objet: '', corps: '' });
  /* La signature et le modèle « Sélection de biens » des Paramètres (V3.20) :
     ils étaient recopiés en dur, et ce qu'Alexandre y écrivait ne servait à
     rien. Lus une fois, à l'ouverture de la fiche. */
  const reglagesMail = useRef<Record<string, string>>({});
  useEffect(() => {
    supabase.from('parametres').select('cle, valeur').in('cle', CLES_MAIL).then(({ data }) => {
      reglagesMail.current = Object.fromEntries((data || []).map((r: { cle: string; valeur: string | null }) => [r.cle, r.valeur || '']));
    });
  }, []);
  const signatureMail = () => signatureDe(reglagesMail.current);
  const [envoiSending, setEnvoiSending] = useState(false);
  /* La visite dont on fait le compte rendu (null = fenêtre fermée). */
  const [crVisite, setCrVisite] = useState<any>(null);
  /* Une visite se planifie souvent pour plusieurs biens d'affilée : on garde
     une liste, pas un bien unique. La table `visites` n'ayant qu'une colonne
     `bien_id`, on écrit une ligne par bien, toutes sur le même créneau. */
  const [planVisteForm, setPlanVisiteForm] = useState<{ bien_ids: string[]; date: string; heure: string; contact: string; notes: string }>({ bien_ids: [], date: '', heure: '', contact: '', notes: '' });
  const [ajoutVisite, setAjoutVisite] = useState(false);

  useEffect(() => { loadRecherches(); }, [client.id]);
  /* V3.50 : ce qui attendait d'être écrit dans la transaction part AVANT de
     changer de recherche, sur la transaction où on l'a tapé. Sinon le
     minuteur l'écrivait dans la transaction de l'autre recherche, une fois
     chargée — ou le perdait. `flushTx` lit la transaction affichée tout de
     suite, avant le chargement de la nouvelle. */
  useEffect(() => { flushTx(); setVueEtape(null); if (rechercheId) load(); }, [rechercheId]);
  /* Sans transaction, plus rien d'une ancienne ne doit rester affiché. */
  useEffect(() => { txRef.current = transaction; setTxData(transaction || {}); }, [transaction]);
  /* En quittant la fiche, on écrit ce qui attendait encore : sinon la dernière
     frappe — un montant, un nom de notaire — restait dans le vide. */
  useEffect(() => () => { flushTx(); }, []);

  // Synchronise les formulaires critères/mandat avec la recherche active
  useEffect(() => {
    const r = rechercheActive;
    if (!r) return;
    setCrit({
      exigences: (r.exigences || {}) as Record<string, Niveau>,
      etage_max_sans_ascenseur: r.etage_max_sans_ascenseur?.toString() || '',
      cuisine_type: r.cuisine_type || '',
      exterieur_surface_min: r.exterieur_surface_min?.toString() || '',
      types_bien: r.type_bien ? r.type_bien.split(',').map(t => t.trim()).filter(Boolean) : [],
      budget_min: r.budget_min?.toString() || '', budget_max: r.budget_max?.toString() || '',
      surface_min: r.surface_min?.toString() || '', surface_max: r.surface_max?.toString() || '',
      nb_pieces_min: r.nb_pieces_min?.toString() || '', nb_pieces_max: r.nb_pieces_max?.toString() || '',
      chambres_min: r.chambres_min?.toString() || '', secteurs: r.secteurs || [],
      transport_minutes: r.transport_minutes?.toString() || '', transport_lignes: r.transport_lignes || [],
      transport_arrets: (r.transport_arrets || []) as Arret[],
      notes: r.notes || '',
      parking: r.parking || false, balcon: r.balcon || false, terrasse: r.terrasse || false, jardin: r.jardin || false,
      cave: r.cave || false, ascenseur: r.ascenseur || false, gardien: r.gardien || false,
      interphone: r.interphone || false, digicode: r.digicode || false,
      rdc_exclu: r.rdc_exclu || false, dernier_etage: r.dernier_etage || false,
      etage_min: r.etage_min?.toString() || '', etage_max: r.etage_max?.toString() || '',
      dpe_max: r.dpe_max || '', annee_min: r.annee_construction_min?.toString() || '',
      etat_souhaite: r.etat_souhaite || '', exposition_souhaitee: r.exposition_souhaitee || '',
      surface_sejour_min: r.surface_sejour_min?.toString() || '',
      urgence: r.urgence || '', financement: r.financement || '', apport: r.apport?.toString() || '',
    });
    setMandat({
      date_signature: r.mandat_date_signature || '', duree: r.mandat_duree?.toString() || '3',
      honoraires: r.mandat_honoraires || '2,5% TTC', date_expiration: r.mandat_date_expiration || '',
    });
  }, [rechercheId, recherches]);

  async function loadRecherches() {
    const { data } = await supabase.from('recherches').select('*').eq('client_id', client.id).order('created_at', { ascending: true });
    const list = (data || []) as Recherche[];
    setRecherches(list);
    /* garder la recherche affichée si elle existe encore ; sinon la première
       dont la veille tourne, sinon la première tout court — la même règle que
       la liste des contacts et /api/send-mail (V3.20) */
    setRechercheId(prev => (prev && list.some(r => r.id === prev)) ? prev : ((list.find(r => r.active !== false) || list[0])?.id || ''));
  }

  async function creerRecherche() {
    const nom = prompt('Nom de la nouvelle recherche ?', `Recherche ${recherches.length + 1}`);
    if (nom === null) return;
    /* Le lien de l'espace se pose ici, court et lisible. Sans ça, la base en
       fabrique un de 64 caractères — valable, mais impossible à envoyer par
       SMS sans avoir l'air d'un spam. */
    const { data, error } = await supabase.from('recherches').insert({
      client_id: client.id,
      nom: nom.trim() || `Recherche ${recherches.length + 1}`,
      /* La veille ne tourne que pour un client Actif : un Prospect peut
         avoir une recherche ouverte, elle attend qu'il passe en Actif. */
      active: client.statut === 'actif',
      secteurs: [],
      token_espace: jetonEspace(client.prenom, client.nom),
    }).select().single();
    /* Un échec muet ressemble à un bouton mort : on le dit. */
    if (error || !data) {
      alert(`La recherche n'a pas pu être créée.\n\n${error?.message || 'erreur inconnue'}`);
      return;
    }
    if (data) {
      setRecherches(rs => [...rs, data as Recherche]);
      setRechercheId((data as Recherche).id);
      setTab('selection');
      await addJournal(client.id, 'recherche_creee', `🔍 Nouvelle recherche — ${(data as Recherche).nom}`, undefined, undefined, { rechercheId: (data as Recherche).id });
    }
  }

  /* Le mail de bienvenue. Une confirmation avant, parce qu'un mail parti ne
     se rattrape pas ; et la date se pose côté serveur, après l'accusé de
     Mailjet seulement — un échec ne doit pas condamner le bouton. */
  const [envoiBienvenue, setEnvoiBienvenue] = useState(false);

  /* Le client a-t-il déjà reçu son lien pour une AUTRE recherche ? Si oui, le
     bouton ne lui renvoie pas un mail de bienvenue — il n'a rien à réinstaller,
     son espace existe déjà. Il reçoit juste le mot qui dit qu'une nouvelle
     recherche vient de s'ouvrir dedans. */
  const dejaAccueilli = recherches.some(x => x.id !== rechercheActive?.id && !!x.bienvenue_envoye_le);

  async function envoyerBienvenue() {
    if (!rechercheActive || rechercheActive.bienvenue_envoye_le || envoiBienvenue) return;
    const dest = (client.emails || []).filter((e: string) => e && e.includes('@'));
    if (dest.length === 0) {
      alert("Ce client n'a pas d'adresse mail valide.");
      return;
    }
    const quoi = dejaAccueilli
      ? `Prévenir ${dest.join(', ')} que la recherche « ${rechercheActive.nom} » est ouverte ?\n\n`
        + `Il a déjà son espace : le mail lui dit simplement qu'une nouvelle recherche s'y ajoute, `
        + `avec le même lien qu'avant. Il ne peut être envoyé qu'une fois.`
      : `Envoyer le mail de bienvenue à ${dest.join(', ')} ?\n\n`
        + `Il contient le lien de son espace et l'invite à l'installer sur son téléphone. `
        + `Il ne peut être envoyé qu'une fois.`;
    if (!confirm(quoi)) return;
    setEnvoiBienvenue(true);
    try {
      const r = await fetch('/api/send-mail', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_ids: [client.id], recherche_id: rechercheActive.id, mode: 'bienvenue',
          objet: '', corps: '',
        }),
      });
      const d = await r.json();
      if (!d?.success) {
        alert(`Le mail n'est pas parti : ${d?.results?.[0]?.error || d?.error || 'erreur inconnue'}`);
        return;
      }
      if (d.avertissements?.length) signalerEchec('Le mail est parti, mais son suivi', d.avertissements.join(' ; '));
      /* On relit la recherche plutôt que de deviner : c'est le serveur qui a
         posé la date, et c'est elle qui fait foi. */
      const { data } = await supabase.from('recherches').select('*').eq('id', rechercheActive.id).single();
      if (data) setRecherches(rs => rs.map(x => x.id === (data as Recherche).id ? (data as Recherche) : x));
      /* V3.50 : plus de ligne au Suivi ici. Le serveur (/api/send-mail) note
         déjà « 👋 Mail de bienvenue envoyé » quand le mail part : la fiche
         l'écrivait une deuxième fois. */
      load();
    } catch (e) {
      alert(`Le mail n'est pas parti : ${(e as Error).message}`);
    } finally {
      setEnvoiBienvenue(false);
    }
  }

  /* V3.110 — Renvoyer le lien. Alexandre : « le mail de bienvenue, on ne
     peut plus le renvoyer ; avoir un bouton à côté, renvoyer le lien, si un
     client me dit : je ne l'ai pas reçu ». Un mail court, le même lien
     qu'avant ; il ne touche pas au mail de bienvenue. Il se montre dès que le
     client a reçu son lien une fois (pour cette recherche ou une autre). */
  const [envoiLien, setEnvoiLien] = useState(false);
  const [lienRenvoye, setLienRenvoye] = useState(false);
  const aSonLien = recherches.some(x => !!x.bienvenue_envoye_le);
  async function renvoyerLien() {
    if (!rechercheActive || envoiLien) return;
    const dest = (client.emails || []).filter((e: string) => e && e.includes('@'));
    if (dest.length === 0) { alert("Ce client n'a pas d'adresse mail valide."); return; }
    if (!confirm(`Renvoyer à ${dest.join(', ')} le lien de son espace ?\n\n`
      + `Un mail court : le même lien qu'avant, et le rappel pour l'ajouter à l'écran d'accueil de son téléphone.`)) return;
    setEnvoiLien(true);
    try {
      const r = await fetch('/api/send-mail', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: [client.id], recherche_id: rechercheActive.id, mode: 'lien', objet: '', corps: '' }),
      });
      const d = await r.json();
      if (!d?.success) { alert(`Le mail n'est pas parti : ${d?.results?.[0]?.error || d?.error || 'erreur inconnue'}`); return; }
      if (d.avertissements?.length) signalerEchec('Le mail est parti, mais son suivi', d.avertissements.join(' ; '));
      setLienRenvoye(true);
      setTimeout(() => setLienRenvoye(false), 5000);
      /* Le Suivi porte « 🔗 Lien de l'espace renvoyé » (écrit par le serveur). */
      load();
    } catch (e) {
      alert(`Le mail n'est pas parti : ${(e as Error).message}`);
    } finally {
      setEnvoiLien(false);
    }
  }

  async function renommerRecherche() {
    if (!rechercheActive) return;
    const nom = prompt('Renommer la recherche :', rechercheActive.nom);
    if (nom === null || !nom.trim()) return;
    const ancien = rechercheActive.nom;
    const { data, error } = await supabase.from('recherches').update({ nom: nom.trim() }).eq('id', rechercheActive.id).select().maybeSingle();
    if (error || !data) { signalerEchec('Le nouveau nom de la recherche', error?.message || 'aucune ligne n’a été modifiée. La session a peut-être expiré : recharge la page, puis recommence.'); return; }
    if (data) {
      setRecherches(rs => rs.map(r => r.id === rechercheActive.id ? (data as Recherche) : r));
      await addJournal(client.id, 'recherche_renommee', `🔍 Recherche renommée — ${ancien} → ${nom.trim()}`, undefined, undefined, { rechercheId: rechercheActive.id });
    }
  }

  /**
   * Les photos que nous hébergeons ne partent pas avec les lignes de la base.
   * Supprimer un bien sans les enlever laisse des fichiers que plus rien
   * n'affiche et qui continuent d'occuper le stockage — on les efface donc
   * partout où un bien disparaît.
   */
  /* V3.33 : seulement une fois les biens effacés de la base, et seulement les
     fichiers que plus personne n'utilise (une proposition de la veille, ou le
     dossier d'un autre acheteur, peut partager les mêmes, src/lib/photos.ts). */
  function cheminsPhotos(lot: any[]): { photos?: unknown; plans?: unknown }[] {
    return (lot || []).map((b: any) => ({ photos: b?.photos, plans: b?.plans }));
  }

  async function effacerPhotos(lot: { photos?: unknown; plans?: unknown }[]) {
    try { await effacerPhotosDeBiens(lot); }
    catch { /* la suppression des données prime sur le ménage du stockage */ }
  }

  /**
   * Supprimer une recherche.
   *
   * On peut supprimer la DERNIÈRE, désormais. L'espace du client ne dépend
   * plus d'une recherche : son lien est rangé sur lui (voir src/lib/espace.ts),
   * son application reste posée sur son téléphone, et elle rouvrira toute
   * seule le jour où on lui ouvre une nouvelle recherche.
   *
   * Ce qui part : tout ce qui ne parle que de CETTE recherche — ses biens et
   * leurs photos, ses visites et leurs comptes rendus, ses envois, sa
   * transaction, ses relances, tout son travail de veille, et les lignes de
   * journal qui portent son nom ou celui d'un de ses biens.
   *
   * Ce qui reste : le client, et tout ce que le journal dit de LUI — les
   * appels, les notes, les rendez-vous. Ces lignes-là racontent la relation,
   * pas la recherche : elles ne doivent pas disparaître avec elle.
   */
  /* V3.50 — Une vente signée avec ses honoraires compte dans le chiffre
     d'affaires (src/lib/activite.ts) : effacer la recherche ou le client qui
     la porte la faisait disparaître du total, sans un mot. Rend le total HT
     des ventes signées (0 sans vente), ou null si la lecture échoue. */
  async function honorairesSignes(o: { rechercheId?: string } = {}): Promise<number | null> {
    let q = supabase.from('transactions').select('honoraires_ht, honoraires_ttc').eq('etape_actuelle', 'finalise');
    q = o.rechercheId ? q.eq('recherche_id', o.rechercheId) : q.eq('client_id', client.id);
    const { data, error } = await q;
    if (error) return null;
    return ((data || []) as { honoraires_ht?: unknown; honoraires_ttc?: unknown }[])
      .reduce((t, x) => t + Math.max(0, honorairesHT(x)), 0);
  }
  /* Rend true si la suppression peut continuer ; sinon le dit. */
  async function suppressionPermise(o: { rechercheId?: string } = {}): Promise<boolean> {
    const ht = await honorairesSignes(o);
    if (ht === null) {
      alert('La vente de ce dossier n’a pas pu être vérifiée : rien n’est supprimé. Recharge la page, puis recommence.');
      return false;
    }
    if (ht > 0) {
      alert(`Ce dossier a une vente signée (${eurosRonds(ht)} d’honoraires HT) : le supprimer l’effacerait de ton chiffre d’affaires. Archive-le plutôt.`);
      return false;
    }
    /* V3.50 : supprimer la personne entière, alors qu'elle vend aussi un bien
       avec nous, laisserait ce bien sans propriétaire (même règle que la
       fiche d'un contact). Une recherche seule, elle, peut partir. */
    if (!o.rechercheId) {
      const { data, error } = await supabase.from('biens_vente').select('id').eq('client_id', client.id).limit(1);
      if (error) {
        alert('Ses biens en vente n’ont pas pu être vérifiés : rien n’est supprimé. Recharge la page, puis recommence.');
        return false;
      }
      if (data?.length) {
        alert('Cette personne est aussi propriétaire d’un bien suivi dans « Biens » : la supprimer laisserait ce bien sans propriétaire. Archive-la plutôt.');
        return false;
      }
    }
    return true;
  }

  async function supprimerRecherche(r: Recherche) {
    const reste = recherches.filter(x => x.id !== r.id);
    const derniere = reste.length === 0;
    if (!(await suppressionPermise({ rechercheId: r.id }))) return;

    const ok = confirm(
      `Supprimer la recherche « ${r.nom} » ?\n\n` +
      `⚠️ Ses biens et leurs photos, ses visites, ses envois, sa transaction en cours et tout son travail de veille ` +
      `seront supprimés définitivement.\n\n` +
      (derniere
        ? `C'est la dernière recherche de ce client. Sa fiche, son suivi de dossier et le lien ` +
          `de son espace sont conservés : ouvrez-lui une nouvelle recherche et il la retrouvera ` +
          `au même endroit, sans rien réinstaller.\n\n`
        : `Ses autres recherches ne sont pas touchées.\n\n`) +
      `Cette action est irréversible.`,
    );
    if (!ok) return;

    /* Les photos se relèvent AVANT la suppression : après, les lignes qui
       portaient leurs adresses n'existent plus et elles seraient introuvables. */
    const { data: sesBiens } = await supabase.from('biens').select('id, photos').eq('recherche_id', r.id);
    const ids = (sesBiens || []).map((b: any) => b.id);
    const chemins = cheminsPhotos(sesBiens || []);

    /* ⚠️ Le suivi de dossier ne meurt pas avec la recherche.
       Un appel, un rendez-vous, une note, un message du client : ça raconte la
       relation, pas la recherche — même quand la ligne portait le numéro de la
       recherche (le formulaire « Ajouter une action » le pose). On la détache
       donc au lieu de l'effacer : elle remonte au niveau du client et reste
       lisible dans l'onglet Suivi. Tout le reste — biens envoyés, visites,
       critères modifiés, mails — part avec la recherche. */
    const PROTEGES = ['appel', 'rdv', 'note', 'message_client', 'demande_rappel'];
    /* L'ordre compte : on enlève d'abord ce qui pointe vers un bien, le bien
       en dernier, la recherche tout à la fin. Sinon une clé étrangère bloque.
       Chaque étape est vérifiée (V3.17) : au premier échec, on s'arrête avant
       d'effacer les biens et la recherche, et on le dit. */
    const nettoye = await verifieTout('La suppression de la recherche', [
      ...(ids.length > 0 ? [() => supabase.from('journal').update({ bien_id: null, recherche_id: null }).in('bien_id', ids).in('type', PROTEGES)] : []),
      () => supabase.from('journal').update({ recherche_id: null }).eq('recherche_id', r.id).in('type', PROTEGES),
      ...(ids.length > 0 ? [() => supabase.from('journal').delete().in('bien_id', ids)] : []),
      () => supabase.from('journal').delete().eq('recherche_id', r.id),
      () => supabase.from('visites').delete().eq('recherche_id', r.id),
      () => supabase.from('envois').delete().eq('recherche_id', r.id),
      () => supabase.from('transactions').delete().eq('recherche_id', r.id),
      () => supabase.from('relances').delete().eq('recherche_id', r.id),
      () => supabase.from('veille_propositions').delete().eq('recherche_id', r.id),
      () => supabase.from('veille_passages').delete().eq('recherche_id', r.id),
      () => supabase.from('espace_evenements').delete().eq('recherche_id', r.id),
      /* Les notifications appartiennent au client, pas à la recherche : son
         téléphone reste abonné, on le rattache simplement à ce qui reste. */
      derniere
        ? () => supabase.from('push_abonnements').delete().eq('recherche_id', r.id)
        : () => supabase.from('push_abonnements').update({ recherche_id: reste[0].id }).eq('recherche_id', r.id),
    ]);
    if (!nettoye) { load(); return; }

    const { error: eBiens } = await supabase.from('biens').delete().eq('recherche_id', r.id);
    if (eBiens) { alert('Erreur : ' + eBiens.message); return; }
    await effacerPhotos(chemins);

    const { error } = await supabase.from('recherches').delete().eq('id', r.id);
    if (error) { alert('Erreur : ' + error.message); return; }

    /* On garde la trace de la suppression elle-même, au niveau du client :
       sinon le dossier semblerait n'avoir jamais rien contenu. */
    const ligne = {
      client_id: client.id, recherche_id: null,
      titre: `🗑️ Recherche supprimée — ${r.nom}`,
      description: `${ids.length} bien(s) et tout le suivi de cette recherche ont été effacés.`
        + (derniere ? ' C’était la dernière recherche du client ; son espace reste ouvert.' : ''),
      metadata: {},
    };
    const { error: eJournal } = await supabase.from('journal').insert({ ...ligne, type: 'recherche_supprimee' });
    if (eJournal) await verifie('L’historique du client', supabase.from('journal').insert({ ...ligne, type: 'statut_change' }));

    setRecherches(reste);
    if (rechercheId === r.id) { setRechercheId(reste[0]?.id || ''); setTab('selection'); }
    setPosRecherche(null);
    load();
  }

  /**
   * Réinitialiser le suivi d'une recherche.
   *
   * Ce qui part : tout ce qui est attaché à un bien. Les propositions de la
   * veille, les biens retenus et présentés avec leurs photos, les visites et
   * leurs comptes rendus, les envois, la transaction, les relances, et les
   * compteurs de passages de veille.
   *
   * Ce qui reste : le client, ses critères, ses précisions libres, son mandat,
   * le lien de son espace, et tout ce qui dans le journal ne parle pas d'un
   * bien — les appels, les notes, les changements de critères.
   *
   * Au bout : la veille repart comme au premier jour, elle ne connaît plus
   * aucune URL et rouvre tout le stock.
   */
  const TYPES_SUIVI = [
    'bien_ajoute', 'bien_modifie', 'bien_supprime', 'veille_trouve',
    'visite_planifiee', 'visite_effectuee', 'visite_annulee', 'offre_faite', 'offre_ecrite',
    'etape_transaction', 'retour_etape', 'dossier_finalise',
    'mail_envoye', 'envoi_bien', 'compte_rendu_visite',
  ];
  /* Les lignes d'une vente : elles restent quand la vente signée reste. */
  const TYPES_VENTE = ['offre_faite', 'offre_ecrite', 'etape_transaction', 'retour_etape', 'dossier_finalise'];

  /* V3.50 — Les transactions d'une recherche : celles qui sont signées (elles
     restent à la remise à zéro) et les autres. null si la lecture échoue. */
  async function transactionsDe(rid: string): Promise<{ signees: { id: string; bien_id: string | null }[]; ouvertes: number } | null> {
    const { data, error } = await supabase.from('transactions').select('id, bien_id, etape_actuelle').eq('recherche_id', rid);
    if (error) return null;
    const l = (data || []) as { id: string; bien_id: string | null; etape_actuelle: string | null }[];
    return { signees: l.filter(t => t.etape_actuelle === 'finalise'), ouvertes: l.filter(t => t.etape_actuelle !== 'finalise').length };
  }

  async function ouvrirReinit() {
    if (!rechercheId) return;
    setReinitStats(null);
    setShowReinit(true);
    const [props, passages, txs] = await Promise.all([
      supabase.from('veille_propositions').select('*', { count: 'exact', head: true }).eq('recherche_id', rechercheId),
      supabase.from('veille_passages').select('nb_lues').eq('recherche_id', rechercheId),
      transactionsDe(rechercheId),
    ]);
    const signee = txs?.signees[0];
    const bienSigne = signee ? biens.find(b => b.id === signee.bien_id) : null;
    const gardes = new Set((txs?.signees || []).map(t => t.bien_id));
    const partants = biens.filter(b => !gardes.has(b.id));
    setReinitStats({
      txOuverte: txs ? txs.ouvertes > 0 : !!transaction,
      venteGardee: signee ? (bienSigne?.titre || bienSigne?.ville || 'le bien acheté') : null,
      propositions: props.count || 0,
      passages: (passages.data || []).length,
      lues: (passages.data || []).reduce((t, p: any) => t + (p.nb_lues || 0), 0),
      biens: partants.length,
      presentes: partants.filter(b => b.etape === 'presente').length,
      visites: visites.filter((v: any) => v.statut === 'a_venir' || v.statut === 'effectuee').length,
      envois: envois.length,
    });
  }

  async function doReinit() {
    if (!rechercheId || reinitEnCours) return;
    setReinitEnCours(true);
    try {
      const rid = rechercheId;
      /* V3.50 — Une vente signée ne s'efface pas : elle compte dans le chiffre
         d'affaires. Sa transaction reste, le bien acheté aussi (la
         transaction pointe dessus), et les lignes de la vente au Suivi.
         Lecture impossible : on ne touche à rien. */
      const txs = await transactionsDe(rid);
      if (!txs) { alert('La remise à zéro n’a pas commencé : la transaction de cette recherche n’a pas pu être lue. Recharge la page, puis recommence.'); setReinitEnCours(false); return; }
      const garder = new Set(txs.signees.map(t => t.bien_id).filter((x): x is string => !!x));
      const partants = biens.filter(b => !garder.has(b.id));
      const ids = partants.map(b => b.id as string);
      const typesSuivi = txs.signees.length ? TYPES_SUIVI.filter(t => !TYPES_VENTE.includes(t)) : TYPES_SUIVI;

      /* Les photos que nous hébergeons partent avec les biens : sans ça elles
         resteraient à occuper du stockage sans que rien ne les affiche. */
      const chemins = cheminsPhotos(partants);

      /* L'ordre compte : on enlève d'abord ce qui pointe vers un bien, le bien
         en dernier. Sinon une clé étrangère bloque la suppression. */
      /* Chaque étape est vérifiée (V3.17) : au premier échec, on s'arrête
         avant d'effacer les biens, et on le dit. */
      const nettoye = await verifieTout('La remise à zéro', [
        ...(ids.length > 0 ? [() => supabase.from('journal').delete().in('bien_id', ids)] : []),
        () => supabase.from('journal').delete().eq('recherche_id', rid).in('type', typesSuivi),
        /* Les lignes de journal écrites avant qu'on note la recherche n'ont ni
           bien ni recherche. Quand le client n'en a qu'une, elles ne peuvent
           venir que d'elle — on peut les enlever sans risque. */
        ...(recherches.length === 1 ? [() => supabase.from('journal').delete().eq('client_id', client.id).is('recherche_id', null).is('bien_id', null).in('type', typesSuivi)] : []),
        () => supabase.from('visites').delete().eq('recherche_id', rid),
        () => supabase.from('envois').delete().eq('recherche_id', rid),
        /* Seulement les transactions en cours : la vente signée reste. */
        () => supabase.from('transactions').delete().eq('recherche_id', rid).or('etape_actuelle.is.null,etape_actuelle.neq.finalise'),
        () => supabase.from('relances').delete().eq('recherche_id', rid),
        () => supabase.from('veille_propositions').delete().eq('recherche_id', rid),
        () => supabase.from('veille_passages').delete().eq('recherche_id', rid),
      ]);
      if (!nettoye) { setReinitEnCours(false); load(); return; }

      let qBiens = supabase.from('biens').delete().eq('recherche_id', rid);
      if (garder.size) qBiens = qBiens.not('id', 'in', `(${Array.from(garder).join(',')})`);
      const { error } = await qBiens;
      if (error) { alert('La remise à zéro a échoué : ' + error.message); setReinitEnCours(false); return; }
      await effacerPhotos(chemins);

      /* Le compteur d'ouvertures de l'espace repart lui aussi : il comptait des
         visites sur des biens qui n'existent plus. Le lien, lui, ne bouge pas.
         V3.50 : la veille suit l'état du client — elle repart pour un client
         Actif. Après un compromis ou un acte, elle restait arrêtée, alors que
         la fenêtre annonçait « la prochaine veille rouvrira tout le marché ». */
      const veille = client.statut === 'actif';
      if (await verifie('La remise à zéro de la recherche', supabase.from('recherches')
        .update({ espace_ouvert_le: null, active: veille, updated_at: new Date().toISOString() }).eq('id', rid).select('id'), { ligne: true })) {
        setRecherches(rs => rs.map(r => (r.id === rid ? ({ ...r, active: veille } as Recherche) : r)));
      }

      /* On garde la trace de la remise à zéro elle-même, sinon le dossier
         semblerait n'avoir jamais rien contenu. */
      const titre = `♻️ Suivi réinitialisé — ${rechercheActive?.nom || 'recherche'}`;
      const detail = (reinitStats
        ? `${reinitStats.propositions} proposition(s) de veille, ${ids.length} bien(s), ${reinitStats.visites} visite(s) et ${reinitStats.passages} passage(s) effacés. Critères conservés.`
        : 'Critères conservés.') + (txs.signees.length ? ' La vente signée est gardée.' : '');
      const ligne = { client_id: client.id, recherche_id: rid, titre, description: detail, metadata: {} };
      const { error: eJournal } = await supabase.from('journal').insert({ ...ligne, type: 'recherche_reinitialisee' });
      if (eJournal) await verifie('L’historique du client', supabase.from('journal').insert({ ...ligne, type: 'statut_change' }));

      setShowReinit(false);
      setReinitEnCours(false);
      setReinitStats(null);
      setTab('veille');
      load();
      signalerMaj();
    } catch (e: any) {
      alert('La remise à zéro a échoué : ' + (e?.message || e));
      setReinitEnCours(false);
    }
  }

  /**
   * Supprimer un client, pour de bon.
   *
   * Le CRM n'avait aucun moyen de le faire : on pouvait clore un dossier
   * (« perdu », « bien trouvé »), jamais l'effacer. Une fiche créée par erreur,
   * un doublon, un client qui demande l'effacement de ses données — il fallait
   * passer par Supabase à la main.
   *
   * Rien n'est laissé à la base : chaque table est vidée explicitement, dans
   * l'ordre, plutôt que de faire confiance aux suppressions en cascade. Et les
   * photos hébergées partent avec, sinon elles resteraient orphelines dans le
   * stockage.
   */
  async function ouvrirSuppressionClient() {
    /* V3.50 : une vente signée le retient (voir suppressionPermise). */
    if (!(await suppressionPermise())) return;
    setSupprStats(null);
    setShowSupprClient(true);
    const rIds = recherches.map(r => r.id);
    const [nbBiens, nbProps, nbVisites, nbEnvois, passages] = await Promise.all([
      supabase.from('biens').select('*', { count: 'exact', head: true }).eq('client_id', client.id),
      supabase.from('veille_propositions').select('*', { count: 'exact', head: true }).eq('client_id', client.id),
      supabase.from('visites').select('*', { count: 'exact', head: true }).eq('client_id', client.id),
      supabase.from('envois').select('*', { count: 'exact', head: true }).eq('client_id', client.id),
      rIds.length ? supabase.from('veille_passages').select('nb_lues').in('recherche_id', rIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    setSupprStats({
      recherches: recherches.length,
      biens: nbBiens.count || 0,
      propositions: nbProps.count || 0,
      visites: nbVisites.count || 0,
      envois: nbEnvois.count || 0,
      passages: (passages.data || []).length,
      lues: (passages.data || []).reduce((t: number, p: any) => t + (p.nb_lues || 0), 0),
    });
  }

  async function doSupprimerClient() {
    if (supprEnCours) return;
    /* Un dernier garde-fou : on tape le nom. Le reste de l'application ne
       demande jamais ça — ici, c'est la seule action qui efface une personne. */
    const attendu = `${client.prenom} ${client.nom}`.trim();
    if (supprNom.trim().toLowerCase() !== attendu.toLowerCase()) {
      alert(`Pour confirmer, écris exactement : ${attendu}`);
      return;
    }
    setSupprEnCours(true);
    if (!(await suppressionPermise())) { setSupprEnCours(false); return; }
    try {
      const rIds = recherches.map(r => r.id);
      const { data: lot } = await supabase.from('biens').select('photos').eq('client_id', client.id);
      const chemins = cheminsPhotos(lot || []);

      /* On vide ce qui pointe vers autre chose avant ce qui est pointé. */
      const etapes: { quoi: string; faire: () => any }[] = [
        { quoi: 'journal', faire: () => supabase.from('journal').delete().eq('client_id', client.id) },
        { quoi: 'relances', faire: () => supabase.from('relances').delete().eq('client_id', client.id) },
        /* V3.50 : ses rendez-vous restaient dans l'agenda, sans dossier à ouvrir. */
        { quoi: 'rendez-vous', faire: () => supabase.from('rendez_vous').delete().eq('client_id', client.id) },
        { quoi: 'visites', faire: () => supabase.from('visites').delete().eq('client_id', client.id) },
        { quoi: 'envois', faire: () => supabase.from('envois').delete().eq('client_id', client.id) },
        { quoi: 'transactions', faire: () => supabase.from('transactions').delete().eq('client_id', client.id) },
        { quoi: 'propositions de veille', faire: () => supabase.from('veille_propositions').delete().eq('client_id', client.id) },
        { quoi: 'événements de l’espace', faire: () => supabase.from('espace_evenements').delete().eq('client_id', client.id) },
        { quoi: 'passages de veille', faire: () => (rIds.length ? supabase.from('veille_passages').delete().in('recherche_id', rIds) : Promise.resolve({ error: null })) },
        { quoi: 'biens', faire: () => supabase.from('biens').delete().eq('client_id', client.id) },
        { quoi: 'recherches', faire: () => supabase.from('recherches').delete().eq('client_id', client.id) },
        { quoi: 'client', faire: () => supabase.from('clients').delete().eq('id', client.id).select('id') },
      ];

      for (const e of etapes) {
        const { error, data } = await e.faire();
        /* La base fermée refuse parfois sans erreur : la fiche n'a pas bougé. */
        if (!error && e.quoi === 'client' && Array.isArray(data) && data.length === 0) {
          alert('Le client n’a pas été supprimé : la base n’a rien effacé. La session a peut-être expiré : recharge la page, puis recommence.');
          setSupprEnCours(false);
          return;
        }
        /* Une table absente de ce projet ne doit pas bloquer la suppression ;
           une vraie erreur sur le client ou ses biens, si. */
        if (error && !/does not exist|schema cache/i.test(error.message || '')) {
          alert(`La suppression s'est arrêtée sur « ${e.quoi} » :\n\n${error.message}\n\nRien d'autre n'a été touché après cette étape.`);
          setSupprEnCours(false);
          return;
        }
      }

      await effacerPhotos(chemins);
      setShowSupprClient(false);
      setSupprEnCours(false);
      signalerMaj();
      /* V3.50 : il quitte aussi la barre des fiches ouvertes. */
      retirerFicheOuverte('contact', client.id);
      onBack();
    } catch (e: any) {
      alert('La suppression a échoué : ' + (e?.message || e));
      setSupprEnCours(false);
    }
  }

  async function load() {
    const [{ data: b }, { data: v }, { data: t }, { data: e }, { data: j }, { data: h }] = await Promise.all([
      supabase.from('biens').select('*').eq('recherche_id', rechercheId).order('created_at', { ascending: false }),
      supabase.from('visites').select('*').eq('recherche_id', rechercheId).order('date_visite'),
      /* V3.50 : toutes les transactions de la recherche, pas `.maybeSingle()` :
         deux lignes (un double clic) faisaient échouer la lecture, et l'onglet
         affichait « Aucune transaction » — on en créait alors une troisième.
         La plus récente qui n'est pas signée passe devant. */
      supabase.from('transactions').select('*').eq('recherche_id', rechercheId),
      supabase.from('envois').select('*').eq('recherche_id', rechercheId).order('created_at', { ascending: false }),
      supabase.from('journal').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
      supabase.from('espace_evenements').select('*').eq('recherche_id', rechercheId)
        .in('type', ['criteres', 'message']).order('created_at', { ascending: false }).limit(40),
    ]);
    const txs = ((t || []) as { etape_actuelle?: string | null; created_at?: string | null }[])
      .slice().sort((x, y) => String(y.created_at || '').localeCompare(String(x.created_at || '')));
    const tx = txs.find(x => x.etape_actuelle !== 'finalise') || txs[0] || null;
    setBiens(b||[]); setVisites(v||[]); setTransaction(tx); setEnvois(e||[]); setJournal(j||[]);
    setHistoEvts(h||[]);
    /* Les compteurs de la barre de gauche suivent ce qui vient de changer. */
    signalerMaj();
  }

  async function refresh() {
    const { data } = await supabase.from('clients').select('*').eq('id', client.id).single();
    if (data) setClient(data as Client);
  }


  async function saveContact() {
    setSaving(true);
    // Détecter les vrais changements avant de logger
    const newEmails = nettoyer(cf.emails, 'mail');
    const newTels = nettoyer(cf.tels, 'tel');
    const changes: string[] = [];
    if ((client.prenom||'') !== cf.prenom) changes.push(`Prénom : "${client.prenom||'—'}" → "${cf.prenom||'—'}"`);
    if ((client.nom||'') !== cf.nom) changes.push(`Nom : "${client.nom||'—'}" → "${cf.nom||'—'}"`);
    if ((client.adresse||'') !== (cf.adresse||'')) changes.push(`Adresse mise à jour`);
    if (JSON.stringify(nettoyer(client.emails || [], 'mail')) !== JSON.stringify(newEmails)) changes.push(newEmails.length > 1 ? `E-mails : ${newEmails.join(', ')}` : `E-mail : ${newEmails[0] || '—'}`);
    if (JSON.stringify(nettoyer(client.telephones || [], 'tel')) !== JSON.stringify(newTels)) changes.push(newTels.length > 1 ? `Téléphones : ${newTels.join(', ')}` : `Téléphone : ${newTels[0] || '—'}`);
    if (((client as any).statut_occupation||'') !== cf.statut_occupation) changes.push(`Situation actuelle modifiée`);
    /* Une personne ou un couple : écrit seulement si la colonne existe (SQL
       « signature-plusieurs » lancé) ou si Alexandre vient de choisir. */
    const jAvant = conjointDe(client.conjoint);
    const conjoint = cf.couple ? {
      ...(jAvant || {}), civilite: cf.c2_civilite, prenom: cf.c2_prenom.trim(), nom: cf.c2_nom.trim(),
      email: cf.c2_email.trim().toLowerCase(), telephone: cf.c2_tel.trim(),
    } : null;
    const foyer = 'couple' in client || cf.couple || cf.civilite
      ? { civilite: cf.civilite || null, couple: cf.couple, conjoint }
      : {};
    if (!!client.couple !== cf.couple) changes.push(cf.couple ? `Fiche passée en couple (avec ${`${cf.c2_prenom} ${cf.c2_nom}`.trim() || 'une 2e personne'})` : 'Fiche repassée à une seule personne');
    else if (cf.couple && JSON.stringify(jAvant || {}) !== JSON.stringify(conjointDe(conjoint) || {})) changes.push(`Personne 2 mise à jour`);

    const { data, error: eContact } = await supabase.from('clients').update({
      ...foyer,
      prenom: cf.prenom, nom: cf.nom, adresse: cf.adresse||null, emails: newEmails, telephones: newTels,
      statut_occupation: cf.statut_occupation||null,
      bien_actuel_a_vendre: cf.bien_actuel_a_vendre,
      bien_actuel_type: cf.bien_actuel_a_vendre ? (cf.bien_actuel_type||null) : null,
      bien_actuel_surface: cf.bien_actuel_a_vendre && cf.bien_actuel_surface ? parseInt(cf.bien_actuel_surface) : null,
      bien_actuel_valeur: cf.bien_actuel_a_vendre && cf.bien_actuel_valeur ? parseInt(cf.bien_actuel_valeur) : null,
      bien_actuel_adresse: cf.bien_actuel_a_vendre && !cf.bien_actuel_meme_adresse ? (cf.bien_actuel_adresse||null) : null,
      bien_actuel_notes: cf.bien_actuel_a_vendre ? (cf.bien_actuel_notes||null) : null,
    }).eq('id', client.id).select().single();
    if (eContact) {
      setSaving(false);
      alert('Le contact n’a pas pu être enregistré.\n\n' + eContact.message + (/couple|civilite|conjoint/.test(eContact.message) ? '\n\nLance d’abord le fichier SQL « signature-plusieurs.sql » dans Supabase.' : ''));
      return;
    }
    if (data) {
      setClient(data as Client);
      if (changes.length) await addJournal(client.id, 'contact', '✏️ Contact modifié', changes.join('\n'));
    }
    /* La source s'écrit à part, seulement si elle a changé : avant le SQL
       « source-contact », la colonne n'existe pas et le reste doit passer. */
    const avantSrc = client as unknown as { source?: string | null; source_detail?: string | null };
    if ((avantSrc.source || '') !== cf.source || (avantSrc.source_detail || '') !== cf.source_detail.trim()) {
      const src = { source: cf.source || null, source_detail: cf.source ? (cf.source_detail.trim() || null) : null };
      const { error: eSrc } = await supabase.from('clients').update(src).eq('id', client.id);
      if (eSrc) { setSaving(false); alert(colonneSourceAbsente(eSrc.message) ? MESSAGE_SQL_SOURCE : `La source n’a pas été enregistrée.\n\n${eSrc.message}`); return; }
      setClient(c0 => ({ ...(data || c0), ...src } as Client));
    }
    setSaving(false); setShowContact(false);
  }

  /**
   * Enregistrer les critères.
   *
   * ⚠️ Un client peut n'avoir AUCUNE recherche : la dernière vient d'être
   * supprimée. Sa fiche reste ouverte, et c'est voulu. Mais dans cet état,
   * « Enregistrer » n'avait plus de recherche où écrire et ne faisait
   * silencieusement rien — impossible de repartir sans supprimer la fiche.
   *
   * Remplir les critères quand il n'y a plus de recherche, c'est vouloir en
   * ouvrir une : on la crée, exactement comme à la création du client, et on
   * y range ce qui vient d'être saisi.
   */
  async function saveCriteres() {
    setSaving(true);

    let cible = rechercheId;
    if (!cible) {
      const { data: neuve, error: eNeuve } = await supabase.from('recherches').insert({
        client_id: client.id,
        nom: 'Recherche principale',
        active: client.statut === 'actif',
        secteurs: [],
        /* L'adresse interne de la recherche. Le lien envoyé au client, lui,
           est rangé sur le client et n'a pas bougé (voir src/lib/espace.ts). */
        token_espace: jetonEspace(client.prenom, client.nom),
      }).select().single();
      if (eNeuve || !neuve) {
        setSaving(false);
        alert(`La recherche n'a pas pu être créée.\n\n${eNeuve?.message || 'erreur inconnue'}`);
        return;
      }
      cible = (neuve as Recherche).id;
      setRecherches(rs => [...rs, neuve as Recherche]);
      setRechercheId(cible);
      await addJournal(client.id, 'recherche_creee', `🔍 Nouvelle recherche — ${(neuve as Recherche).nom}`, undefined, undefined, { rechercheId: (neuve as Recherche).id });
    }

    const avant = recherches.find(r => r.id === cible) as unknown as Record<string, unknown> | undefined;
    const { data, error } = await supabase.from('recherches').update({
      type_bien: crit.types_bien.length > 0 ? crit.types_bien.join(', ') : null,
      budget_min: crit.budget_min ? parseInt(crit.budget_min) : null,
      budget_max: crit.budget_max ? parseInt(crit.budget_max) : null,
      surface_min: crit.surface_min ? parseInt(crit.surface_min) : null,
      surface_max: crit.surface_max ? parseInt(crit.surface_max) : null,
      nb_pieces_min: crit.nb_pieces_min ? parseInt(crit.nb_pieces_min) : null,
      nb_pieces_max: crit.nb_pieces_max ? parseInt(crit.nb_pieces_max) : null,
      chambres_min: crit.chambres_min ? parseInt(crit.chambres_min) : null,
      secteurs: crit.secteurs, notes: crit.notes || null,
      transport_minutes: crit.transport_minutes ? parseInt(crit.transport_minutes) : null,
      transport_lignes: crit.transport_lignes,
      transport_arrets: crit.transport_arrets,
      parking: crit.parking, cave: crit.cave, balcon: crit.balcon,
      terrasse: crit.terrasse, jardin: crit.jardin, ascenseur: crit.ascenseur,
      gardien: crit.gardien, interphone: (crit as any).interphone || false,
      digicode: (crit as any).digicode || false,
      rdc_exclu: crit.rdc_exclu, dernier_etage: crit.dernier_etage,
      etage_min: crit.etage_min ? parseInt(crit.etage_min) : null,
      etage_max: crit.etage_max ? parseInt(crit.etage_max) : null,
      dpe_max: crit.dpe_max || null,
      annee_construction_min: crit.annee_min ? parseInt(crit.annee_min) : null,
      etat_souhaite: crit.etat_souhaite || null,
      exposition_souhaitee: crit.exposition_souhaitee || null,
      surface_sejour_min: crit.surface_sejour_min ? parseInt(crit.surface_sejour_min) : null,
      exigences: crit.exigences,
      etage_max_sans_ascenseur: crit.etage_max_sans_ascenseur ? parseInt(crit.etage_max_sans_ascenseur) : null,
      cuisine_type: crit.cuisine_type || null,
      exterieur_surface_min: crit.exterieur_surface_min ? parseInt(crit.exterieur_surface_min) : null,
      urgence: crit.urgence || null,
      financement: crit.financement || null,
      apport: crit.apport ? parseInt(crit.apport) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', cible).select().single();
    if (error) {
      /* Sans message, un échec ressemble à « ça n'a pas voulu s'afficher ».
         Le cas le plus courant : une colonne pas encore créée dans Supabase. */
      setSaving(false);
      alert(`Les critères n'ont pas pu être enregistrés.\n\n${error.message}\n\nSi le message parle d'une colonne inconnue, c'est la migration SQL qui n'a pas encore été passée.`);
      return;
    }
    if (data) {
      setRecherches(rs => rs.map(r => r.id === cible ? (data as Recherche) : r));
      const change = resumeChangements(avant, data as unknown as Record<string, unknown>);
      if (change) {
        /* La recherche est notée sur la ligne : la veille lit ce journal pour
           savoir quel critère a bougé depuis son dernier passage, et un client
           peut avoir deux recherches ouvertes. Sans elle, les deux se
           mélangeaient. */
        await verifie('L’historique du client', supabase.from('journal').insert({
          client_id: client.id, recherche_id: cible,
          type: 'criteres_modifies', titre: '🎯 Critères modifiés',
          description: change, metadata: {},
        }));
        load();
        /* Un de vos mandats lui correspond déjà ? On le dit tout de suite
           (V3.29), sans rien lancer. */
        mandatsPour(data as unknown as Record<string, unknown>, client.id).then(r => {
          if (!r.n) return;
          const m = r.liste[0];
          setToastRappro({
            titre: `Recherche de ${[client.prenom, client.nom].filter(Boolean).join(' ')} enregistrée`,
            texte: r.n > 1 ? `${r.n} de vos mandats lui correspondent, jusqu’à ${r.meilleure}\u00a0%.` : `« ${m.titre} »${m.ville ? ` à ${m.ville}` : ''} lui correspond à ${m.note}\u00a0%.`,
            ids: r.liste.map(x => x.id),
          });
        }).catch(() => { /* le bandeau de la Vue d'ensemble le dira */ });
      }
    }
    setSaving(false); setShowCriteres(false);
  }

  async function saveMandat() {
    setSaving(true);
    if (!rechercheId) { setSaving(false); return; }
    /* Vider la date de signature devait pouvoir effacer le mandat. L'ancienne
       expiration restait pourtant en base, et la fiche affichait « expiré »
       indéfiniment. Plus de signature et plus d'expiration saisie : on efface. */
    let exp = mandat.date_expiration;
    /* V3.43 : compté en mois sur la date elle-même (avant : lue en heure
       universelle puis décalée à l'heure de Paris, un jour de moins au
       passage de l'heure d'été, et le 31 août + 6 mois donnait le 3 mars). */
    if (mandat.date_signature && mandat.duree && !exp) exp = ajouterMois(String(mandat.date_signature).slice(0, 10), parseInt(mandat.duree));
    if (!mandat.date_signature && !mandat.date_expiration) exp = '';

    const avaitMandat = !!(recherches.find(r => r.id === rechercheId) as any)?.mandat_date_signature;
    const { data, error } = await supabase.from('recherches').update({ mandat_date_signature: mandat.date_signature||null, mandat_duree: mandat.duree ? parseInt(mandat.duree) : null, mandat_honoraires: mandat.honoraires||null, mandat_date_expiration: exp||null, sans_mandat: !mandat.date_signature && !exp, updated_at: new Date().toISOString() }).eq('id', rechercheId).select().maybeSingle();
    /* Pas enregistré : la fenêtre reste ouverte (V3.17). */
    if (error || !data) { signalerEchec('Le mandat', error?.message || 'aucune ligne n’a été modifiée. La session a peut-être expiré : recharge la page, puis recommence.'); setSaving(false); return; }
    if (data) {
      setRecherches(rs => rs.map(r => r.id === rechercheId ? (data as Recherche) : r));
      const detail = [
        mandat.date_signature ? `signé le ${new Date(mandat.date_signature).toLocaleDateString('fr-FR')}` : null,
        mandat.duree ? `${mandat.duree} mois` : null,
        mandat.honoraires || null,
        exp ? `jusqu'au ${new Date(exp).toLocaleDateString('fr-FR')}` : null,
      ].filter(Boolean).join(' · ');
      await addJournal(client.id, 'mandat', avaitMandat ? '📋 Mandat mis à jour' : '📋 Mandat enregistré', detail || undefined, undefined, { rechercheId });
      load();
    }
    setSaving(false); setShowMandat(false);
  }

  /* Supprimer le mandat : il n'y avait aucun moyen de le faire, et un dossier
     sans mandat restait marqué « expiré » partout, jusque dans la liste. */
  async function supprimerMandat() {
    if (!rechercheId) return;
    if (!confirm('Supprimer le mandat de recherche de ce dossier ?\n\nLes dates, la durée, les honoraires et le numéro seront effacés, et la proposition en ligne retirée. Le dossier sera marqué « sans mandat ».')) return;
    setSaving(true);
    /* V3.50 : le numéro et la date de proposition partent aussi. Ils
       restaient, et l'espace du client affichait de nouveau « Votre mandat
       est prêt » (un numéro sans signature = mandat à signer). */
    const { data, error } = await supabase.from('recherches').update({
      mandat_date_signature: null, mandat_duree: null, mandat_honoraires: null,
      mandat_date_expiration: null, sans_mandat: true,
      mandat_numero: null, mandat_propose_le: null,
      updated_at: new Date().toISOString(),
    }).eq('id', rechercheId).select().maybeSingle();
    if (error || !data) { signalerEchec('La suppression du mandat', error?.message || 'aucune ligne n’a été modifiée. La session a peut-être expiré : recharge la page, puis recommence.'); setSaving(false); return; }
    if (data) {
      setRecherches(rs => rs.map(r => r.id === rechercheId ? (data as Recherche) : r));
      setMandat({ date_signature: '', duree: '3', honoraires: '2,5% TTC', date_expiration: '' });
      await addJournal(client.id, 'mandat', '📋 Mandat supprimé', undefined, undefined, { rechercheId });
      load();
    }
    setSaving(false); setShowMandat(false);
  }

  /* ═══ Clore un dossier acheteur (V3.50) ═══════════════════════════════
     Une seule logique, quelle que soit la porte : « Clôturer la recherche »,
     « Bien trouvé » ou « Perdu » dans le menu d'état, « Acte signé ». Avant,
     chacune faisait à sa façon : le menu ne soldait pas les relances et ne
     notait pas le motif ; la clôture et l'acte soldaient TOUTES les relances
     du client, ses relances de vendeur comprises.
     Ici, dans l'ordre :
     · le client passe « Bien trouvé » ou « Perdu », avec son motif — sauf
       l'acte d'une recherche quand une autre continue : il reste suivi ;
     · la veille s'arrête (sur la seule recherche de l'acte, ou sur toutes) ;
     · ses relances d'acheteur se soldent (celles de vendeur restent) ;
     · ses visites encore à venir sont annulées, rappels compris.
     Au premier échec (dit à l'écran), on s'arrête. `clos` : le client entier
     est clos (et pas seulement une de ses recherches). */
  async function clore(o: { statut: 'bien_trouve' | 'perdu'; raison: string | null; seule?: string | null }): Promise<{ ok: boolean; clos: boolean }> {
    const seule = o.seule || null;
    let clos = true;
    if (seule) {
      /* Une autre recherche continue-t-elle ? Sa veille tourne, ou elle
         attend la fin d'une suspension, ou sa transaction est en cours (sa
         veille est alors en pause depuis le compromis). */
      const enPause = lireSuspension(client)?.recherches || [];
      let autre = recherches.some(r => r.id !== seule && (r.active !== false || enPause.includes(r.id)));
      if (!autre) {
        const { data, error } = await supabase.from('transactions').select('id, etape_actuelle').eq('client_id', client.id).neq('recherche_id', seule);
        if (!error) autre = ((data || []) as { etape_actuelle: string | null }[]).some(t => t.etape_actuelle !== 'finalise');
      }
      clos = !autre;
    }

    if (clos) {
      /* Le statut efface aussi une date de reprise de suspension (comme le
         menu d'état) : base sans la colonne, on écrit le reste. */
      const champs = { statut: o.statut, raison_perte: o.raison };
      let r = await supabase.from('clients').update({ ...champs, suspension: null }).eq('id', client.id).select('id');
      if (r.error && colonneSuspensionAbsente(r.error.message)) r = await supabase.from('clients').update(champs).eq('id', client.id).select('id');
      if (!(await verifie('La clôture du dossier', Promise.resolve(r), { ligne: true }))) return { ok: false, clos };
    }

    const veille = supabase.from('recherches').update({ active: false });
    if (!(await verifie('L’arrêt de la veille', seule && !clos
      ? veille.eq('id', seule).select('id')
      : veille.eq('client_id', client.id).select('id'), { ligne: !!seule && !clos }))) return { ok: false, clos };

    /* Ne lèvent jamais : un échec se dit, la clôture est faite. */
    await solderRelancesAcheteur(client.id, clos ? null : seule);
    let q = supabase.from('visites').select('id, date_visite, heure').eq('client_id', client.id).eq('statut', 'a_venir');
    if (!clos && seule) q = q.eq('recherche_id', seule);
    const { data: prevues, error: eVis } = await q;
    if (eVis) signalerEchec('L’annulation des visites prévues', eVis.message);
    else {
      /* Une visite dont l'heure est passée a peut-être eu lieu : elle reste,
         son compte rendu est encore à faire. */
      const maintenant = new Date();
      const ids = ((prevues || []) as { id: string; date_visite: string | null; heure: string | null }[])
        .filter(v => !visitePassee(v, maintenant)).map(v => v.id);
      if (ids.length) await annulerVisites(ids, { pourquoi: clos ? 'Dossier clôturé.' : 'Recherche terminée.' });
    }
    return { ok: true, clos };
  }

  /* La transaction encore ouverte du client : celle de la recherche
     affichée d'abord. Lecture impossible : celle qui est à l'écran. */
  async function transactionOuverte(): Promise<TxActe | null> {
    const { data, error } = await supabase.from('transactions').select('*').eq('client_id', client.id);
    if (error) return transaction && transaction.etape_actuelle !== 'finalise' ? (transaction as TxActe) : null;
    const l = ((data || []) as (TxActe & { etape_actuelle?: string | null; created_at?: string | null })[])
      .filter(t => t.etape_actuelle !== 'finalise')
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return l.find(t => t.recherche_id === rechercheId) || l[0] || null;
  }

  /* La fenêtre « Acte signé ». La date proposée : celle de l'acte prévu s'il
     est passé (ou aujourd'hui), sinon aujourd'hui — c'est elle qui range la
     vente dans le chiffre d'affaires du mois. */
  function ouvrirActe(tx: TxActe, o: { portee: 'recherche' | 'dossier'; raison: string | null; note: string }) {
    const prevue = typeof tx.acte_date_prevue === 'string' ? tx.acte_date_prevue.slice(0, 10) : '';
    const auj = jourParis();
    setActe({ tx, date: prevue && prevue <= auj ? prevue : auj, ...o });
  }

  async function confirmerActe() {
    if (!acte || saving) return;
    const { tx, date, portee, raison, note } = acte;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { alert('Indique la date de signature de l’acte.'); return; }
    if (date > jourParis()) { alert('L’acte n’est pas encore signé à cette date : choisis le jour de la signature.'); return; }
    setSaving(true);
    if (txRef.current?.id === tx.id) await flushTx();
    if (!(await verifie('L’acte signé', supabase.from('transactions')
      .update({ etape_actuelle: 'finalise', acte_date_prevue: date }).eq('id', tx.id).select('id'), { ligne: true }))) { setSaving(false); load(); return; }
    const rid = tx.recherche_id || rechercheId || null;
    const r = await clore({ statut: 'bien_trouve', raison, seule: portee === 'recherche' ? rid : null });
    if (!r.ok) { setSaving(false); load(); return; }
    const jour = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR');
    if (r.clos) {
      await addJournal(client.id, 'dossier_finalise', '🎉 Acte signé — bien trouvé !',
        `Acte signé le ${jour}. ${note || 'Le dossier est clos : la veille s’arrête et les relances en attente sont soldées.'}`,
        undefined, { rechercheId: rid });
    } else {
      /* Il cherche encore autre chose : la ligne dit quelle recherche s'arrête. */
      const nomR = recherches.find(x => x.id === rid)?.nom || 'cette recherche';
      await addJournal(client.id, 'dossier_finalise', `🎉 Acte signé — recherche « ${nomR} » terminée`,
        `Acte signé le ${jour}. La veille s’arrête sur cette recherche ; ses autres recherches continuent.`,
        undefined, { rechercheId: rid });
    }
    await refresh();
    setActe(null); setShowCloture(false); setCloture({ motif: 'trouve_avec_moi', note: '' });
    setSaving(false); setVueEtape(null);
    loadRecherches(); chargerRelances(); load();
  }

  /* Clôturer : le motif, puis la même sortie que partout (voir `clore`).
     « Trouvé avec moi » alors qu'une transaction est ouverte : c'est un
     acte signé — il passe par la fenêtre de l'acte, pour que la vente compte
     dans le chiffre d'affaires (V3.50 ; elle n'y comptait jamais). */
  async function cloturerDossier() {
    const m = MOTIFS_CLOTURE.find(x => x.cle === cloture.motif);
    if (!m || saving) return;
    const note = cloture.note.trim();
    const raison = note ? `${m.nom} — ${note}` : m.nom;
    setSaving(true);
    await flushTx();
    if (m.statut === 'bien_trouve') {
      const tx = await transactionOuverte();
      if (tx) { setSaving(false); setShowCloture(false); ouvrirActe(tx, { portee: 'dossier', raison, note }); return; }
    }
    const r = await clore({ statut: m.statut === 'bien_trouve' ? 'bien_trouve' : 'perdu', raison });
    if (!r.ok) { setSaving(false); load(); return; }
    await addJournal(client.id, 'dossier_finalise', `🏁 Recherche clôturée — ${m.nom}`, note || undefined);
    await refresh();
    setSaving(false); setShowCloture(false); setCloture({ motif: 'trouve_avec_moi', note: '' });
    loadRecherches(); chargerRelances(); load();
  }

  /* V3.73 — Archiver un acheteur, comme les autres contacts (Alexandre :
     « quand on va dans les archives, on peut tout retrouver d'un coup ») : il
     quitte la liste et se range dans « Archivés ». Sa veille s'arrête (un
     archivé n'est plus cherché) et ses relances en attente se ferment, sauf
     un compromis ou l'agenda. Sortir des archives ne remet rien en marche :
     on choisit son état ensuite. */
  async function basculerArchive() {
    const archiver = !estArchive(client);
    if (archiver && !confirm(`Archiver ${nomFoyer(client) || 'ce contact'} ?\n\nIl quitte la liste des contacts et se range dans « Archivés », où tu le retrouves quand tu veux. Sa veille s’arrête et ses relances en attente se ferment.`)) return;
    const { data, error } = await supabase.from('clients').update({ archive: archiver, updated_at: new Date().toISOString() }).eq('id', client.id).select().maybeSingle();
    if (error || !data) {
      signalerEchec(archiver ? 'L’archivage du contact' : 'La sortie des archives', error?.message || 'aucune ligne n’a été modifiée. La session a peut-être expiré : recharge la page, puis recommence.');
      return;
    }
    setClient(data as Client);
    if (archiver) {
      await verifie('L’arrêt de la veille', supabase.from('recherches').update({ active: false }).eq('client_id', client.id));
      const { erreur } = await cloreRelancesArchive(client.id);
      if (erreur) signalerEchec('Le contact est archivé, mais ses relances', erreur);
    }
    await addJournal(client.id, 'statut_change', archiver ? 'Contact archivé' : 'Contact sorti des archives',
      archiver ? 'La veille est arrêtée et ses relances en attente sont fermées.' : 'Rien n’est remis en marche : choisis son état.', { archive: archiver });
    signalerMaj();
    load();
  }

  async function rouvrirDossier() {
    if (!confirm('Rouvrir ce dossier ?\n\nLe statut repasse à « Actif » et la veille reprend sur cette recherche.')) return;
    setSaving(true);
    const ok = await verifie('La réouverture du dossier', supabase.from('clients').update({ statut: 'actif', raison_perte: null }).eq('id', client.id).select('id'), { ligne: true })
      && (!rechercheId || await verifie('La reprise de la veille', supabase.from('recherches').update({ active: true, updated_at: new Date().toISOString() }).eq('id', rechercheId).select('id'), { ligne: true }));
    if (!ok) { setSaving(false); load(); return; }
    await addJournal(client.id, 'statut_change', '↩️ Dossier rouvert — la veille reprend');
    const { data } = await supabase.from('clients').select('*').eq('id', client.id).maybeSingle();
    if (data) setClient(data as Client);
    setSaving(false); load();
  }

  /* Une transaction ne se lance que sur un bien que le client a vu. On n'écrit
     pas une offre sur un bien qu'il n'a pas visité — et ça évite de chercher
     dans toute la sélection. */
  function biensVisites() {
    /* V3.50 : une visite annulée n'est pas une visite. L'écran disait « 1 bien
       a été visité » et proposait une transaction sur un bien jamais vu. */
    const vus = new Set(visites.filter(v => v.statut === 'a_venir' || v.statut === 'effectuee').map(v => v.bien_id).filter(Boolean));
    return biens.filter(b => vus.has(b.id));
  }
  /* Ceux sur lesquels une transaction de chasse peut porter : pas les mandats
     de l'agence, suivis sur la fiche du bien (V3.50). */
  function biensPourTx() {
    return biensVisites().filter(b => !b.bien_vente_id);
  }

  async function choisirBienTx(bienId: string) {
    /* V3.50 : un clic à la fois. Un double clic créait deux transactions. */
    if (txEnCreation.current) return;
    txEnCreation.current = true;
    setSaving(true);
    try {
      const b = biens.find(x => x.id === bienId);
      const titre = b?.titre || b?.ville || 'bien';
      if (showChoixTx === 'changer' && transaction) {
        const ancien = transaction.bien_id as string | null;
        if (!(await verifie('Le changement de bien de la transaction', supabase.from('transactions').update({ bien_id: bienId }).eq('id', transaction.id).select('id'), { ligne: true }))) return;
        /* V3.50 : les badges suivent l'offre. L'ancien bien gardait « Offre
           faite » (dans son espace aussi) et le nouveau ne l'avait jamais. */
        if (ancien && ancien !== bienId) {
          await verifie('L’ancien bien repassé « visité »', supabase.from('biens').update({ badge_retour: 'visite' }).eq('id', ancien).eq('badge_retour', 'offre_faite'));
        }
        await verifie('Le bien « offre faite »', supabase.from('biens').update({ badge_retour: 'offre_faite' }).eq('id', bienId).select('id'), { ligne: true });
        const err = await solderRelancesRetourVisite(client.id, [b?.titre]);
        if (err) signalerEchec('Les relances « Veut faire une offre » de ce bien', err);
        await addJournal(client.id, 'offre_faite', `Transaction rattachée à ${b?.titre || b?.ville || 'un autre bien'}`, undefined, undefined, { rechercheId: rechercheId || null });
      } else {
        /* Une transaction déjà ouverte en base (un autre onglet, un clic
           d'avant) : on ne la double pas, on l'affiche. */
        const deja = await supabase.from('transactions').select('id, etape_actuelle').eq('recherche_id', rechercheId);
        if (!deja.error && ((deja.data || []) as { etape_actuelle: string | null }[]).some(t => t.etape_actuelle !== 'finalise')) {
          setShowChoixTx(null); load(); return;
        }
        if (!(await verifie('La transaction', supabase.from('transactions').insert({
          client_id: client.id, recherche_id: rechercheId || null,
          bien_id: bienId, etape_actuelle: 'offre',
        })))) return;
        await verifie('Le bien « offre faite »', supabase.from('biens').update({ badge_retour: 'offre_faite' }).eq('id', bienId));
        /* L'offre est là : les relances nées de son avis après la visite
           (« Veut faire une offre », « Veut revoir », « Il réfléchit ») sont
           servies (V3.50 ; elles restaient ouvertes). */
        const err = await solderRelancesRetourVisite(client.id, [b?.titre]);
        if (err) signalerEchec('Les relances « Veut faire une offre » de ce bien', err);
        await addJournal(client.id, 'offre_faite', `💼 Transaction ouverte — ${titre}`, undefined, undefined, { rechercheId: rechercheId || null });
      }
      setShowChoixTx(null);
      chargerRelances();
      load();
    } finally {
      txEnCreation.current = false;
      setSaving(false);
    }
  }

  async function changeStatut(statut: string) {
    // Anti-doublon : ne rien faire si le statut est déjà le même
    if (client.statut === statut) return;
    /* V3.50 : « Bien trouvé » et « Perdu » ferment le dossier. Ils passent
       par la fenêtre de clôture — le motif, puis la même sortie que partout
       (relances, visites, veille, transaction ouverte). Avant, le menu ne
       changeait que le statut. */
    if (statut === 'bien_trouve' || statut === 'perdu') {
      setCloture({ motif: statut === 'bien_trouve' ? 'trouve_avec_moi' : 'trouve_ailleurs', note: '' });
      setShowCloture(true);
      return;
    }
    /* Un statut choisi ici efface la date de reprise d'une suspension : une
       vieille date restée en base réveillerait plus tard un dossier suspendu
       « sans date » (voir src/lib/suspension.ts). Base sans la colonne : on
       écrit le statut seul. */
    let { data, error } = await supabase.from('clients').update({ statut, suspension: null }).eq('id', client.id).select().maybeSingle();
    if (error && colonneSuspensionAbsente(error.message)) {
      ({ data, error } = await supabase.from('clients').update({ statut }).eq('id', client.id).select().maybeSingle());
    }
    if (error || !data) {
      signalerEchec('Le changement de statut', error?.message || 'aucune ligne n’a été modifiée. La session a peut-être expiré : recharge la page, puis recommence.');
      return;
    }
    setClient(data as Client);

    /* Le statut et la veille marchaient chacun de leur côté : la veille lit le
       drapeau « active » de la recherche, que rien ne touchait. Un dossier
       suspendu restait donc cherché tous les jours. Les deux vont désormais
       ensemble — seul « Actif » fait chercher. */
    const chercher = statut === 'actif';
    if (chercher) {
      if (rechercheId) await verifie('La reprise de la veille', supabase.from('recherches').update({ active: true, updated_at: new Date().toISOString() }).eq('id', rechercheId));
    } else {
      await verifie('L’arrêt de la veille', supabase.from('recherches').update({ active: false }).eq('client_id', client.id));
    }
    const nom = ETATS_CLIENT.find(x => x.cle === statut)?.nom || statut;
    await addJournal(client.id, 'statut_change', `Statut → ${nom}`,
      chercher ? 'La veille reprend sur cette recherche.' : 'La veille est arrêtée sur ce dossier.');
    load();
  }

  /* « Suspendu », avec ou sans date de reprise. La veille s'arrête sur toutes
     ses recherches ; celles qui tournaient sont notées, pour que la reprise
     automatique rallume exactement celles-là (src/lib/suspension.ts). Déjà
     suspendu : la même fenêtre change ou retire la date. */
  async function confirmerSuspension() {
    if (!suspendre) return;
    const { choix, date } = suspendre;
    const jusqu = choix === 'sans' ? null : choix === 'date' ? date : dansMois(Number(choix));
    if (choix === 'date' && (!date || date <= jourParis())) {
      alert('Choisis une date de reprise à venir, ou « Sans date ».');
      return;
    }
    const dejaSuspendu = client.statut === 'suspendu';
    const aReprendre = dejaSuspendu
      ? (lireSuspension(client)?.recherches || [])
      : recherches.filter(r => r.active).map(r => r.id);
    const suspension = jusqu ? { jusqu_au: jusqu, recherches: aReprendre, le: new Date().toISOString() } : null;

    setSaving(true);
    let { data, error } = await supabase.from('clients').update({ statut: 'suspendu', suspension }).eq('id', client.id).select().maybeSingle();
    let dateNonNotee = false;
    if (error && colonneSuspensionAbsente(error.message)) {
      ({ data, error } = await supabase.from('clients').update({ statut: 'suspendu' }).eq('id', client.id).select().maybeSingle());
      dateNonNotee = !!jusqu;
    }
    if (error || !data) {
      setSaving(false);
      signalerEchec('La suspension du dossier', error?.message || 'aucune ligne n’a été modifiée. La session a peut-être expiré : recharge la page, puis recommence.');
      return;
    }
    setClient(data as Client);
    if (!dejaSuspendu) {
      await verifie('L’arrêt de la veille', supabase.from('recherches').update({ active: false }).eq('client_id', client.id));
    }
    const avecDate = !!jusqu && !dateNonNotee;
    const le = jusqu ? jourLisible(jusqu) : '';
    await addJournal(client.id, 'statut_change',
      dejaSuspendu
        ? (avecDate ? `⏸️ Reprise prévue le ${le}` : '⏸️ Date de reprise retirée')
        : `Statut → Suspendu${avecDate ? ` jusqu'au ${le}` : ''}`,
      avecDate
        ? `La veille est arrêtée. Le ${le}, le dossier repassera tout seul en « Actif », la veille repartira et une relance rappellera d'appeler le client.`
        : 'La veille est arrêtée sur ce dossier.');
    setSaving(false);
    setSuspendre(null);
    if (dateNonNotee) {
      alert("Le dossier est suspendu, mais la date de reprise n'a pas pu être notée : la base n'a pas encore la colonne.\n\nLance outils/sql/suspension.sql dans Supabase (SQL Editor), puis remets la date depuis « État du dossier ».");
    }
    load();
  }

  async function parseTexte() {
    const texte = texteAnnonce.trim();
    if (texte.length < 30) {
      alert('Veuillez coller le texte de l\'annonce (au moins quelques lignes).');
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch('/api/parse-texte-bien', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texte, url }),
      });
      if (!res.ok) {
        alert(`Erreur serveur : ${res.status}. Vérifiez que le fichier parse-texte-bien/route.ts est bien déployé.`);
        setExtracting(false);
        return;
      }
      const data = await res.json();
      if (data.error) {
        alert(`Erreur : ${data.error}`);
        setExtracting(false);
        return;
      }
      if (data.bien) {
        const photosManual = photosInput.split('\n').map((s: string) => s.trim()).filter((s: string) => s.startsWith('http'));
        // Reformulation automatique de la description dès la création (retire nom d'agence, prix/inclusions)
        let description = data.bien.description || '';
        if (description && description.trim().length >= 20) {
          const ref = await callReformuler(description);
          if (ref.description) description = ref.description;
        }
        setBienForm({
          ...data.bien,
          description,
          url: url || '',
          commission_type: 'pourcentage',
          commission_val: '',
          photos: photosManual.length > 0 ? photosManual : (data.bien.photos || []),
          source_portail: data.bien.source_portail || 'Autre',
          _method: data.method,
        });
      } else {
        alert('Impossible d\'extraire les informations. Essayez de coller plus de texte.');
      }
    } catch (e: any) {
      alert(`Erreur réseau : ${e.message}`);
    }
    setExtracting(false);
  }

  async function extract() {
    if (!url) return;
    setExtracting(true);
    try {
      const res = await fetch('/api/extract-bien', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (data.bien) {
        let description = data.bien.description || '';
        if (description && description.trim().length >= 20) {
          const ref = await callReformuler(description);
          if (ref.description) description = ref.description;
        }
        setBienForm({ ...data.bien, description, url, commission_type: 'pourcentage', commission_val: '', _partial: data.partial, _reason: data.reason });
      }
      else { setBienForm({ url, titre: '', prix_vendeur: '', surface: '', nb_pieces: '', ville: '', description: '', commission_type: 'pourcentage', commission_val: '' }); }
    } catch { setBienForm({ url, titre: '', prix_vendeur: '', surface: '', nb_pieces: '', ville: '', description: '', commission_type: 'pourcentage', commission_val: '' }); }
    setExtracting(false);
  }

  const prixAcq = bienForm ? (bienForm.commission_type === 'pourcentage' ? Math.round((parseFloat(bienForm.prix_vendeur)||0) * (1 + (parseFloat(bienForm.commission_val)||0) / 100)) : (parseFloat(bienForm.prix_vendeur)||0) + (parseFloat(bienForm.commission_val)||0)) : 0;

  async function saveBien() {
    if (!bienForm) return;
    setSaving(true);
    // Vérifier doublon URL seulement si une URL est fournie
    if (bienForm.url && bienForm.url.trim()) {
      const { data: ex } = await supabase.from('biens').select('id').eq('recherche_id', rechercheId).eq('url', bienForm.url.trim()).maybeSingle();
      if (ex) { alert('Ce bien (même URL) est déjà dans la liste !'); setSaving(false); return; }
    }
    // Générer un ID temporaire pour le dossier storage
    const tempId = crypto.randomUUID();
    // Uploader les photos vers Supabase Storage
    const photosStockees = await uploadPhotosToStorage(bienForm.photos || [], tempId);
    const { data: bienInsere, error: erreurBien } = await supabase.from('biens').insert({
      client_id: client.id,
      recherche_id: rechercheId || null,
      /* ⚠️ Sans `etape`, le bien n'apparaît dans AUCUN onglet : Sélection et
         Présentés filtrent tous les deux dessus en dur (OngletBiens.tsx).
         Seul le compteur le voyait, via son repli `(b.etape || 'selection')`
         — d'où un onglet qui affiche « 1 » et reste vide. */
      etape: 'selection',
      url: bienForm.url||null,
      titre: bienForm.titre,
      ville: bienForm.ville,
      code_postal: bienForm.code_postal,
      quartier: bienForm.quartier||null,
      type_bien: bienForm.type_bien,
      surface: parseFloat(bienForm.surface)||null,
      nb_pieces: parseInt(bienForm.nb_pieces)||null,
      nb_chambres: parseInt(bienForm.nb_chambres)||null,
      nb_salles_bain: parseInt(bienForm.nb_salles_bain)||null,
      nb_wc: parseInt(bienForm.nb_wc)||null,
      etage: bienForm.etage !== '' && bienForm.etage !== null && bienForm.etage !== undefined ? parseInt(bienForm.etage) : null,
      etage_total: parseInt(bienForm.etage_total)||null,
      annee_construction: parseInt(bienForm.annee_construction)||null,
      exposition: bienForm.exposition||null,
      // DPE / GES
      dpe: bienForm.dpe || null,
      dpe_conso: parseInt(bienForm.dpe_conso)||null,
      ges: bienForm.ges || null,
      ges_emissions: parseInt(bienForm.ges_emissions)||null,
      chauffage: bienForm.chauffage||null,
      source_energie: bienForm.source_energie||null,
      // Caractéristiques booléennes
      parking: bienForm.parking||false,
      balcon: bienForm.balcon||false,
      terrasse: bienForm.terrasse||false,
      jardin: bienForm.jardin||false,
      cave: bienForm.cave||false,
      ascenseur: bienForm.ascenseur||false,
      gardien: bienForm.gardien||false,
      cuisine_equipee: bienForm.cuisine_equipee||false,
      climatisation: bienForm.climatisation||false,
      traversant: bienForm.traversant||false,
      // Surfaces annexes
      surface_balcon: parseFloat(bienForm.surface_balcon)||null,
      surface_terrasse: parseFloat(bienForm.surface_terrasse)||null,
      // État
      etat_general: bienForm.etat_general||null,
      // Description et prix
      description: bienForm.description,
      prix_vendeur: parseFloat(bienForm.prix_vendeur)||null,
      commission_type: bienForm.commission_type,
      commission_val: parseFloat(bienForm.commission_val)||null,
      prix_acquereur: prixAcq||null,
      charges_trimestrielles: parseInt(bienForm.charges_trimestrielles)||null,
      charges_comprises: (bienForm.charges_comprises || '').trim() || null,
      taxe_fonciere: parseInt(bienForm.taxe_fonciere)||null,
      // Photos et source
      photos: photosStockees,
      source_portail: bienForm.source_portail,
      agence_nom: bienForm.agence_nom,
      agence_tel: bienForm.agence_tel||null,
      badge_retour: 'propose',
    }).select().single();
    /* L'erreur n'était pas relue : le journal s'écrivait et la modale se
       fermait même quand l'insertion avait échoué — le bien n'existait alors
       nulle part, sans que rien ne le dise. */
    if (erreurBien) {
      alert("Le bien n'a pas pu être enregistré : " + erreurBien.message);
      setSaving(false);
      return;
    }
    await addJournal(client.id, 'bien_ajoute', `🏠 Bien ajouté — ${bienForm.titre||bienForm.ville||''}`, bienForm.url||'', undefined, { rechercheId });
    setSaving(false); setShowBien(false); setUrl(''); setBienForm(null); setTexteAnnonce(''); setPhotosInput(''); setBienMode('url'); load();
  }

  async function demanderPdf(bienId: string) {
    await verifie('La demande de fiche PDF', supabase.from('biens').update({
      pdf_statut: 'demande',
      pdf_demande_le: new Date().toISOString(),
      pdf_url: null,
      pdf_message: null,
    }).eq('id', bienId).select('id'), { ligne: true });
    load();
  }

  async function changeBadge(bienId: string, badge: string) {
    if (!(await verifie('L’avis du client sur le bien', supabase.from('biens').update({ badge_retour: badge }).eq('id', bienId).select('id'), { ligne: true }))) { load(); return; }
    if (badge === 'offre_faite' && !transaction) {
      if (await verifie('La transaction', supabase.from('transactions').insert({ client_id: client.id, recherche_id: rechercheId, bien_id: bienId, etape_actuelle: 'offre' }))) {
        await addJournal(client.id, 'offre_faite', 'Offre faite — Transaction ouverte', undefined, undefined, { rechercheId });
      }
    }
    load();
  }

  /* V3.50 — Un mandat de l'agence (copie portant `bien_vente_id`) vendu,
     retiré, suspendu ou archivé ne se visite plus : l'espace du client cache
     la visite et refuse sa demande, mais la fiche la laissait caler — elle
     restait dans l'agenda, invisible pour lui. Sous compromis : seulement
     pour une offre de secours, on le demande. Rend false si on s'arrête.
     Lecture impossible : on laisse faire (le bien a pu être vérifié avant). */
  async function venteAgenceVisitable(ids: string[]): Promise<boolean> {
    const copies = biens.filter(b => ids.includes(b.id) && b.bien_vente_id);
    if (!copies.length) return true;
    const { data, error } = await supabase.from('biens_vente').select('id, etape, archive')
      .in('id', copies.map(b => b.bien_vente_id as string));
    if (error) return true;
    const ventes = (data || []) as { id: string; etape: string | null; archive: boolean | null }[];
    for (const b of copies) {
      const v = ventes.find(x => x.id === b.bien_vente_id);
      if (!v) continue;
      const nom = b.titre || b.ville || 'Ce bien';
      if (v.etape === 'vendu') { alert(`Ce bien est vendu.\n\n« ${nom} » ne peut plus être visité.`); return false; }
      if (v.archive || v.etape === 'retire' || v.etape === 'suspendu') { alert(`Ce bien n’est plus en vente.\n\n« ${nom} » ne peut plus être visité.`); return false; }
      if (v.etape === 'compromis' && !compromisAccepte.current.has(b.id)) {
        if (!confirm(`Ce bien est sous compromis : une visite ne sert que pour une offre de secours. Continuer ?\n\n« ${nom} »`)) return false;
        compromisAccepte.current.add(b.id);
      }
    }
    return true;
  }

  async function planifierVisite(bienId: string) {
    compromisAccepte.current = new Set();
    if (!(await venteAgenceVisitable([bienId]))) return;
    // Vérifier si une visite à venir existe déjà pour ce bien
    const existante = visites.find(v => v.bien_id === bienId && v.statut === 'a_venir');
    if (existante) {
      setShowConfirmVisite(existante.id);
    setPendingBienId(bienId);
    return;
    }
    setPlanVisiteForm({ bien_ids: [bienId], date: '', heure: '', contact: '', notes: '' });
    setAjoutVisite(false);
    setShowPlanVisite(true);
  }

  async function doRemplacerVisite() {
    const visiteId = showConfirmVisite;
    const bienId = pendingBienId;
    /* V3.50 : son rappel (« Rendez-vous : Visite … ») se ferme d'abord. La
       ligne supprimée l'emportait sinon, et le rappel restait dans les
       Relances. Pas de ligne « annulée » au Suivi : elle est remplacée. */
    if (visiteId) await annulerVisites([visiteId], { journal: false });
    if (visiteId && !(await verifie('Le remplacement de la visite', supabase.from('visites').delete().eq('id', visiteId).select('id'), { ligne: true }))) { setShowConfirmVisite(null); return; }
    setShowConfirmVisite(null);
    await load();
    setPlanVisiteForm({ bien_ids: bienId ? [bienId] : [], date: '', heure: '', contact: '', notes: '' });
    setAjoutVisite(false);
    setShowPlanVisite(true);
  }

  async function uploadPhotosToStorage(photos: string[], bienId: string): Promise<string[]> {
    if (!photos || photos.length === 0) return [];
    try {
      const res = await fetch('/api/upload-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos, bien_id: bienId }),
      });
      if (!res.ok) return photos; // fallback
      const data = await res.json();
      return data.urls?.length > 0 ? data.urls : photos;
    } catch {
      return photos; // fallback : garder URLs originales
    }
  }

  async function callReformuler(description: string): Promise<{ description?: string; error?: string }> {
    try {
      const res = await fetch('/api/reformuler-bien', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      return await res.json();
    } catch { return { error: 'network' }; }
  }

  async function reformulerDescription() {
    if (!editBienForm?.description) { alert('Aucune description à reformuler.'); return; }
    setReformuling(true);
    const data = await callReformuler(editBienForm.description);
    if (data.description) {
      setEditBienForm((f: any) => ({ ...f, description: data.description }));
    } else if (data.error === 'no_key') {
      alert('Reformulation indisponible — clé Anthropic non configurée.');
    } else {
      alert(`Reformulation impossible (${data.error || 'erreur inconnue'}).`);
    }
    setReformuling(false);
  }

  function openFicheBien(bienId: string) {
    const b = biens.find(x => x.id === bienId);
    if (!b) return;
    setFicheBienId(bienId);
    setEditBienForm({ ...b, commission_val: b.commission_val ?? '', commission_type: b.commission_type || 'pourcentage' });
    setNewPhotoUrl('');
    setShowFicheBien(true);
  }

  async function saveFicheBien() {
    if (!editBienForm) return;
    setSaving(true);
    // Uploader les nouvelles photos (celles qui ne sont pas encore dans Supabase Storage)
    const photosAUploader = (editBienForm.photos || []).filter((p: string) => !p.includes('supabase.co/storage'));
    const photosDejaStockees = (editBienForm.photos || []).filter((p: string) => p.includes('supabase.co/storage'));
    let photosFinales = editBienForm.photos || [];
    if (photosAUploader.length > 0) {
      const urlsUploadees = await uploadPhotosToStorage(photosAUploader, ficheBienId);
      // Reconstruire dans le bon ordre
      photosFinales = (editBienForm.photos || []).map((p: string) => {
        if (p.includes('supabase.co/storage')) return p;
        const idx = photosAUploader.indexOf(p);
        /* Jamais de trou : sans réponse pour cette photo, elle garde son adresse. */
        return idx >= 0 ? (urlsUploadees[idx] || p) : p;
      });
    }
    const prixAcqEdit = editBienForm.commission_type === 'pourcentage'
      ? Math.round((parseFloat(editBienForm.prix_vendeur)||0) * (1 + (parseFloat(editBienForm.commission_val)||0) / 100))
      : (parseFloat(editBienForm.prix_vendeur)||0) + (parseFloat(editBienForm.commission_val)||0);
    /* V3.50 — Un mandat de l'agence : son prix vient de la fiche du bien
       (et la suit). Recalculé ici, un bien aux honoraires payés par le
       vendeur repassait au prix net : 500 000 € devenaient 475 000 € dans
       l'espace du client. On n'y touche plus. */
    const prix = editBienForm.bien_vente_id ? {} : {
      prix_vendeur: parseFloat(editBienForm.prix_vendeur)||null,
      commission_type: editBienForm.commission_type,
      commission_val: parseFloat(editBienForm.commission_val)||null,
      prix_acquereur: prixAcqEdit||null,
    };
    const enregistre = await verifie('La fiche du bien', supabase.from('biens').update({
      photos: photosFinales,
      titre: editBienForm.titre,
      ville: editBienForm.ville,
      code_postal: editBienForm.code_postal,
      quartier: editBienForm.quartier||null,
      type_bien: editBienForm.type_bien,
      surface: parseFloat(editBienForm.surface)||null,
      nb_pieces: parseInt(editBienForm.nb_pieces)||null,
      nb_chambres: parseInt(editBienForm.nb_chambres)||null,
      nb_salles_bain: parseInt(editBienForm.nb_salles_bain)||null,
      nb_wc: parseInt(editBienForm.nb_wc)||null,
      etage: editBienForm.etage !== '' && editBienForm.etage !== null && editBienForm.etage !== undefined ? parseInt(editBienForm.etage) : null,
      etage_total: parseInt(editBienForm.etage_total)||null,
      annee_construction: parseInt(editBienForm.annee_construction)||null,
      exposition: editBienForm.exposition||null,
      dpe: editBienForm.dpe || null,
      dpe_conso: parseInt(editBienForm.dpe_conso)||null,
      ges: editBienForm.ges || null,
      ges_emissions: parseInt(editBienForm.ges_emissions)||null,
      chauffage: editBienForm.chauffage||null,
      source_energie: editBienForm.source_energie||null,
      parking: editBienForm.parking||false,
      balcon: editBienForm.balcon||false,
      terrasse: editBienForm.terrasse||false,
      jardin: editBienForm.jardin||false,
      cave: editBienForm.cave||false,
      ascenseur: editBienForm.ascenseur||false,
      gardien: editBienForm.gardien||false,
      cuisine_equipee: editBienForm.cuisine_equipee||false,
      climatisation: editBienForm.climatisation||false,
      traversant: editBienForm.traversant||false,
      surface_balcon: parseFloat(editBienForm.surface_balcon)||null,
      surface_terrasse: parseFloat(editBienForm.surface_terrasse)||null,
      etat_general: editBienForm.etat_general||null,
      description: editBienForm.description,
      ...prix,
      charges_trimestrielles: parseInt(editBienForm.charges_trimestrielles)||null,
      charges_comprises: (editBienForm.charges_comprises || '').trim() || null,
      taxe_fonciere: parseInt(editBienForm.taxe_fonciere)||null,
      source_portail: editBienForm.source_portail,
      agence_nom: editBienForm.agence_nom,
      agence_tel: editBienForm.agence_tel,
      url: editBienForm.url||null,
    }).eq('id', ficheBienId).select('id'), { ligne: true });
    /* Pas enregistrée : la fenêtre reste ouverte, rien n'est perdu. */
    if (!enregistre) { setSaving(false); return; }
    await addJournal(client.id, 'bien_modifie', `🏠 Bien modifié — ${editBienForm.titre||editBienForm.ville||''}`, undefined, undefined, { rechercheId });
    setSaving(false); setShowFicheBien(false); load();
  }

  async function deleteBien(bienId: string) {
    setPendingBienId(bienId); setShowConfirmDeleteBien(true);
  }

  async function doDeleteBien() {
    const bienId = pendingBienId;
    setShowConfirmDeleteBien(false);
    const bien = biens.find(b => b.id === bienId);
    /* La ligne d'abord, vérifiée (V3.17) : si la base refuse, les photos
       restent, et on le dit. Avant, les photos partaient même quand le bien
       restait. */
    if (!(await verifie('La suppression du bien', supabase.from('biens').delete().eq('id', bienId).select('id'), { ligne: true }))) { load(); return; }
    /* Ses photos partent avec lui, sauf si une proposition de la veille ou
       un autre dossier s'en sert encore (V3.33). */
    await effacerPhotosBien([...(bien?.photos || []), ...(bien?.plans || [])]);
    await addJournal(client.id, 'bien_supprime', `🗑️ Bien supprimé — ${bien?.titre || bien?.ville || ''}`, undefined, undefined, { rechercheId });
    setShowFicheBien(false); load();
  }

  /* Les biens que la fenêtre « sélection de biens » propose : ceux cochés
     dans l'onglet Sélection si l'envoi vient de là, sinon tous les actifs. */
  const biensDuMail = biens.filter(b => (envoiPool ? envoiPool.includes(b.id) : b.badge_retour !== 'refuse'));

  function openEnvoiBien(bienId: string) {
    const b = biens.find(x => x.id === bienId);
    const emails = client.emails?.filter(Boolean) || [];
    const titre = b?.titre || `${b?.type_bien||'Bien'} — ${b?.ville||''}`;
    setEnvoiBienId(bienId);
    setEnvoiBienIds([bienId]);
    setEnvoiPool(null);
    setEnvoiMode('unique');
    setEnvoiForm({
      destinataires: emails.join(', '),
      objet: `Proposition immobilière — ${titre}`,
      corps: `Bonjour ${client.prenom},

Suite à votre projet de recherche, je suis heureux de vous présenter un bien susceptible de répondre à vos critères.

Vous trouverez ci-dessous l'aperçu et le bouton pour consulter la fiche complète.

N'hésitez pas à me solliciter pour organiser une visite, à m'appeler si vous avez la moindre question, ou à me faire un retour afin d'affiner votre recherche si certains points ne vous conviennent pas.

${signatureMail()}`,
    });
    setShowEnvoiBien(true);
  }

  function openEnvoiMulti(ids?: string[]) {
    const emails = client.emails?.filter(Boolean) || [];
    if (ids && ids.length) {
      // Les biens cochés dans « Sélection », et eux seuls
      setEnvoiBienIds(ids);
      setEnvoiPool(ids);
    } else {
      // Pré-sélectionne tous les biens non refusés
      const biensActifs = biens.filter(b => b.badge_retour !== 'refuse');
      setEnvoiBienIds(biensActifs.map(b => b.id));
      setEnvoiPool(null);
    }
    setEnvoiBienId('');
    setEnvoiMode('multi');
    /* Au-delà de BIENS_PAR_MAIL, le mail n'en détaille que les premiers et
       renvoie vers l'espace pour les suivants : le texte le dit. */
    const nb = ids && ids.length ? ids.length : biens.filter(b => b.badge_retour !== 'refuse').length;
    const phraseDetail = nb > BIENS_PAR_MAIL
      ? `Vous trouverez les ${BIENS_PAR_MAIL} premiers ci-dessous, avec un bouton pour consulter chaque fiche. Les ${nb - BIENS_PAR_MAIL} autres vous attendent dans votre espace.`
      : `Vous trouverez le détail de chacun ci-dessous, avec un bouton pour consulter la fiche complète.`;
    /* Le modèle « Sélection de biens » des Paramètres, s'il est rempli : ses
       variables sont remplacées tout de suite, pour qu'Alexandre relise le
       mail tel qu'il partira. */
    const rg = reglagesMail.current;
    const modele = (rg.template_email_corps || '').trim();
    const pourLui = (t: string) => personnaliser(t, client, conseillerDe(rg));
    /* Le modèle sans signature la reçoit, comme les autres mails. */
    const sig = signatureMail();
    const avecSignature = (t: string) => (t.includes(sig) ? t : `${t.trimEnd()}\n\n${sig}`);
    setEnvoiForm({
      destinataires: emails.join(', '),
      objet: (rg.template_email_objet || '').trim() ? pourLui(rg.template_email_objet) : `Sélection de biens — Vos recherches immobilières`,
      corps: modele ? avecSignature(pourLui(modele)) : `Bonjour ${client.prenom},

Suite à votre projet de recherche, je suis heureux de vous présenter une sélection de biens susceptibles de répondre à vos critères.

${phraseDetail}

N'hésitez pas à me solliciter pour organiser une visite, à m'appeler si vous avez des questions, ou à me faire un retour afin d'affiner votre recherche si certains biens ne vous conviennent pas.

${signatureMail()}`,
    });
    setShowEnvoiBien(true);
  }

  /* V3.51 : le mail libre s'écrit avec la trame de « Nouveau mail »
     (FenetreMail), sans quitter la fiche. */
  async function saveEnvoiBien() {
    if (!envoiForm.destinataires.trim()) { alert('Indiquez un destinataire.'); return; }
    if (!envoiForm.objet.trim()) { alert("L'objet est obligatoire."); return; }
    if (envoiMode !== 'libre' && envoiBienIds.length === 0) { alert('Sélectionnez au moins un bien.'); return; }

    setEnvoiSending(true);
    try {
      const destinataires_override = envoiForm.destinataires.split(',').map(s => s.trim()).filter(Boolean);
      const res = await fetch('/api/send-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_ids: [client.id],
          recherche_id: rechercheId,
          objet: envoiForm.objet,
          corps: envoiForm.corps,
          biens_ids: envoiMode === 'libre' ? undefined : envoiBienIds,
          mode: envoiMode === 'libre' ? 'libre' : 'biens',
          destinataires_override,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        const detail = data.error || (data.results || []).find((r: { success: boolean; error?: string }) => !r.success)?.error || 'Erreur inconnue';
        alert(`Échec d'envoi : ${detail}`);
        setEnvoiSending(false);
        return;
      }
      if (data.avertissements?.length) signalerEchec('Le mail est parti, mais son suivi', data.avertissements.join(' ; '));

      /* C'est ici, et seulement ici, qu'un bien devient « Présenté » : le mail
         est parti pour de bon. Ouvrir la fenêtre puis annuler ne laisse plus
         rien derrière. Un bien déjà présenté qu'on renvoie garde l'avis du
         client — on ne remet pas son badge à zéro. */
      if (envoiMode !== 'libre' && envoiBienIds.length > 0) {
        const quand = new Date().toISOString();
        let duNeuf = false;
        for (const id of envoiBienIds) {
          const b = biens.find(x => x.id === id);
          const neuf = b?.etape !== 'presente';
          if (neuf) duNeuf = true;
          /* Le mail est parti : un échec ici ne l'annule pas, mais il faut le
             savoir (V3.17) — sinon le bien reste « à présenter ». */
          await verifie(`Mail parti, mais « ${b?.titre || b?.ville || 'le bien'} » marqué présenté`, supabase.from('biens').update({
            etape: 'presente', envoye_le: quand, canal_envoi: 'mail',
            ...(neuf ? { badge_retour: 'propose' } : {}),
          }).eq('id', id).select('id'), { ligne: true });
          const prix = Number(b?.prix_acquereur) || Number(b?.prix_vendeur) || 0;
          const hono = prix - (Number(b?.prix_vendeur) || 0);
          /* V3.50 : sur un mandat de l'agence, ce sont ses honoraires à elle. */
          const deQui = b?.bien_vente_id ? 'de l’agence' : 'de chasse';
          await verifie('L’historique du client', supabase.from('journal').insert({
            client_id: client.id, bien_id: id, recherche_id: rechercheId || null, type: 'envoi_bien',
            titre: neuf ? 'Envoyé au client · mail' : 'Renvoyé au client · mail',
            description: prix
              ? `Prix présenté ${prix.toLocaleString('fr-FR')} €${hono > 0 ? ` — dont ${hono.toLocaleString('fr-FR')} € d'honoraires ${deQui}` : ''}`
              : null,
            metadata: {},
          }));
        }
        /* L'envoi vient de partir : la relance est programmée d'office. Elle
           se clôturera toute seule si le client répond avant l'échéance. */
        await programmerRelance(client.id, rechercheId, envoiBienIds.length);

        /* Et le client est prévenu sur son téléphone, s'il a installé son
           espace et accepté les notifications. On n'attend pas la réponse et
           on n'affiche aucune erreur : le mail est parti, c'est l'essentiel.
           Renvoyer un bien déjà présenté ne déclenche rien — ce n'est pas une
           nouvelle pour lui. */
        if (duNeuf) {
          fetch('/api/notifier', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recherche_id: rechercheId }),
          }).catch(() => { /* sans effet sur l'envoi */ });
        }
      }

      setEnvoiSending(false);
      setShowEnvoiBien(false);
      setEnvoiPool(null);
      setVersionBiens(v => v + 1);
      chargerRelances();
      load();
      alert('✅ Mail envoyé avec succès !');
    } catch (e) {
      alert(`Erreur réseau : ${(e as Error).message}`);
      setEnvoiSending(false);
    }
  }

  /* V3.50 : un clic à la fois — un double clic posait deux fois la visite. */
  async function savePlanVisite() {
    if (!planVisteForm.bien_ids.length || visiteEnCours.current) return;
    visiteEnCours.current = true;
    try { await enregistrerVisite(); } finally { visiteEnCours.current = false; }
  }

  async function enregistrerVisite() {
    const { bien_ids, date, heure, contact, notes } = planVisteForm;
    /* V3.50 : un bien ajouté au créneau peut être un mandat de l'agence vendu
       ou sous compromis : même contrôle que pour le premier. */
    if (!(await venteAgenceVisitable(bien_ids))) return;
    /* Les biens déjà visités (une 2e visite), relevés avant l'ajout. */
    const revus = bien_ids.filter(id => visites.some(v => v.bien_id === id && (v.statut === 'effectuee' || v.statut === 'a_venir')));
    /* Une ligne de visite par bien, toutes sur le même créneau : la table n'a
       qu'un `bien_id`, et l'agenda comme les comptes rendus raisonnent bien
       par bien. Ce qui est commun — date, heure, contact — est recopié. */
    const { error: errVis } = await supabase.from('visites').insert(bien_ids.map(bien_id => ({
      client_id: client.id, recherche_id: rechercheId || null, bien_id, statut: 'a_venir',
      date_visite: date || null, heure: heure || null,
      contact_agence: contact || null, commentaire: notes || null,
    })));
    if (errVis) { alert("La visite n'a pas pu être enregistrée.\n\n" + errVis.message); return; }
    /* V3.50 : un bien « Offre faite » le reste (même règle que le compte
       rendu, badgeApresVisite). Une 2e visite effaçait l'offre, dans le CRM
       comme dans son espace, alors que la transaction restait ouverte. */
    await verifie('La visite est enregistrée, mais l’état « visite » des biens', supabase.from('biens').update({ badge_retour: 'souhaite_visiter' })
      .in('id', bien_ids).or('badge_retour.is.null,badge_retour.neq.offre_faite'));
    /* S'il l'avait demandée depuis son espace, la demande est servie : la
       relance « Veut visiter » se solde, et la page Visites la range dans
       « À venir ». */
    const errRel = await solderRelancesVisite(client.id, bien_ids.map(id => biens.find(b => b.id === id)?.titre));
    if (errRel) alert("La visite est enregistrée, mais la relance « Veut visiter » n'a pas pu être soldée.\n\n" + errRel);
    /* Une 2e visite répond à « Veut revoir » et « Il réfléchit » ; « Veut
       faire une offre » reste, l'offre n'est pas encore là (V3.50). */
    if (revus.length) {
      const errRetour = await solderRelancesRetourVisite(client.id, revus.map(id => biens.find(b => b.id === id)?.titre), { garder: 'offre' });
      if (errRetour) signalerEchec('La visite est enregistrée, mais les relances « Veut revoir » de ce bien', errRetour);
    }
    const noms = bien_ids
      .map(id => biens.find(b => b.id === id))
      .map(b => b?.titre || b?.ville || 'Bien')
      .join(' · ');
    const desc = [date ? `Le ${new Date(date).toLocaleDateString('fr-FR')}` : '', heure ? `à ${heure}` : '', contact ? `· Contact : ${contact}` : ''].filter(Boolean).join(' ');
    await addJournal(client.id, 'visite_planifiee',
      bien_ids.length > 1 ? `📅 Visite planifiée — ${bien_ids.length} biens : ${noms}` : `📅 Visite planifiée — ${noms}`,
      desc, undefined, { rechercheId });
    setShowPlanVisite(false); chargerRelances(); load();
  }

  function marquerEffectuee(visiteId: string) {
    const v = visites.find(x => x.id === visiteId);
    if (v) setCrVisite(v);
  }

  /**
   * Une visite qui ne se fera pas.
   *
   * On passe le statut à `annulee` plutôt que de supprimer la ligne : la
   * trace reste en base, et l'espace du client ne lit que `a_venir` et
   * `effectuee` — le rappel « votre prochaine visite » disparaît donc de son
   * côté à la seconde où l'on clique ici.
   *
   * Le badge du bien n'est pas touché : le client voulait le visiter avant, il
   * le veut toujours après. C'est le rendez-vous qui tombe, pas l'envie.
   */
  async function annulerVisite(v: any) {
    const b = biens.find((x: any) => x.id === v.bien_id);
    const nom = b?.titre || b?.ville || 'ce bien';
    const quand = v.date_visite ? ` du ${new Date(v.date_visite).toLocaleDateString('fr-FR')}` : '';
    if (!confirm(`Annuler la visite${quand} — ${nom} ?\n\nElle sort de ton agenda et le rappel disparaît de l'espace du client.`)) return;
    /* V3.50 : la même annulation que partout (src/lib/annuler-visites.ts) —
       vérifiée, son rappel dans les Relances se ferme, et la ligne du Suivi
       est bien une « Visite annulée » (elle se notait « visite planifiée »). */
    await annulerVisites([v.id]);
    chargerRelances();
    load();
  }

  async function saveCompteRendu(x: ValeursCR): Promise<string | null> {
    const v = crVisite;
    if (!v) return 'visite non identifiée';
    const b = biens.find(y => y.id === v.bien_id);
    const err = await enregistrerCompteRendu(v, x, {
      clientId: client.id, rechercheId: rechercheId || v.recherche_id || null,
      bienTitre: b?.titre || b?.ville || 'Bien', badgeActuel: b?.badge_retour,
    });
    if (err) return err;
    setCrVisite(null);
    await load();
    return null;
  }

  async function saveAction() {
    const typeLabels: Record<string, string> = { appel: 'Appel passé', rdv: 'RDV physique', note: 'Note', relance_manuelle: 'Relance manuelle', envoi_externe: 'Envoi externe', email_libre: 'Email envoyé' };
    const titre = actionF.titre.trim() || typeLabels[actionF.type] || 'Action';
    const noteRelance = [titre, actionF.description.trim()].filter(Boolean).join(' — ').slice(0, 300);

    if (actionEdit) {
      /* Vérifié (V3.17) : pas enregistrée, la fenêtre reste ouverte. */
      if (!(await verifie('L’action', supabase.from('journal').update({
        type: actionF.type, titre,
        description: actionF.description || null,
        bien_id: actionF.bien_id || null,
      }).eq('id', actionEdit).select('id'), { ligne: true }))) return;

      const jour = actionF.relance;
      if (actionRelanceId && jour) {
        /* Déplacée : la relance suit la date. L'étiquette affichée sous
           l'action la lit directement, il n'y a rien d'autre à mettre à jour. */
        await verifie('La date de relance', supabase.from('relances')
          .update({ date_echeance: new Date(`${jour}T12:00:00`).toISOString(), note: noteRelance })
          .eq('id', actionRelanceId).eq('statut', 'en_attente'));

      } else if (actionRelanceId && !jour) {
        /* Retirée : on efface la relance et son annonce au suivi. */
        const rid = actionRelanceId, aid = actionEdit;
        await verifieTout('Le retrait de la relance', [
          () => supabase.from('relances').delete().eq('id', rid).eq('statut', 'en_attente'),
          () => supabase.from('journal').delete().eq('type', 'relance_manuelle').eq('metadata->>relance_id', rid),
          () => supabase.from('journal').update({ metadata: {} }).eq('id', aid),
        ]);

      } else if (!actionRelanceId && jour) {
        /* Ajoutée après coup : elle n'existait pas, on la crée et on la relie. */
        const { data: rel, error: eRel } = await supabase.from('relances').insert({
          client_id: client.id, recherche_id: rechercheId || null,
          type: 'manuelle', statut: 'en_attente',
          date_echeance: new Date(`${jour}T12:00:00`).toISOString(),
          note: noteRelance,
        }).select('id').single();
        if (eRel) signalerEchec('La relance', eRel.message);
        if (rel?.id) {
          await verifie('Le lien entre l’action et sa relance', supabase.from('journal').update({ metadata: { relance_id: rel.id } }).eq('id', actionEdit));
        }
      }

      fermerAction();
      load(); chargerRelances();
      return;
    }

    /* Le geste manquant : noter, au moment où on note l'appel, la date à
       laquelle il faudra rappeler. On crée la relance d'abord, pour garder son
       identifiant dans la ligne du suivi — c'est ce lien qui permettra, plus
       tard, de supprimer les deux ensemble. */
    let relanceId: string | null = null;
    if (actionF.relance) {
      /* V3.50 : un client sans recherche n'a pas d'identifiant de recherche —
         « '' » faisait échouer l'écriture (« L'action : pas enregistré »). */
      const { data: rel, error: eRel } = await supabase.from('relances').insert({
        client_id: client.id,
        recherche_id: rechercheId || null,
        type: 'manuelle',
        statut: 'en_attente',
        date_echeance: new Date(`${actionF.relance}T12:00:00`).toISOString(),
        note: noteRelance,
      }).select('id').single();
      /* La relance n'est pas partie : on le dit, et on s'arrête — la fenêtre
         reste ouverte avec ce qui a été tapé. */
      if (eRel) { signalerEchec('La relance', eRel.message); return; }
      relanceId = rel?.id || null;
    }

    const noteOk = await verifie('L’action', supabase.from('journal').insert({
      client_id: client.id,
      recherche_id: rechercheId || null,
      type: actionF.type,
      titre,
      description: actionF.description || null,
      bien_id: actionF.bien_id || null,
      metadata: relanceId ? { relance_id: relanceId } : {},
    }));
    /* L'action n'est pas notée : on retire la relance créée juste avant, pour
       qu'un nouvel essai n'en fasse pas une deuxième. La fenêtre reste ouverte. */
    if (!noteOk) {
      if (relanceId) await verifie('La relance créée avec l’action', supabase.from('relances').delete().eq('id', relanceId));
      chargerRelances(); return;
    }

    /* V3.83 — La relance que cet échange règle sort de « Relances », comme
       avec « Traiter » là-bas. L'action est notée : un refus ici s'affiche en
       rouge sans la défaire. */
    const aFermer = aClore.filter(id => relancesAtt.some(r => r.id === id));
    if (aFermer.length) {
      await verifie(aFermer.length > 1 ? 'Les relances closes' : 'La relance close', supabase.from('relances').update({ statut: 'cloturee' }).in('id', aFermer).eq('statut', 'en_attente').select('id'));
    }
    if (aFermer.length || relanceId) signalerMaj();

    fermerAction(); load(); chargerRelances();
  }

  /* Seules les lignes que tu as saisies toi-même se modifient. Un « Bien
     ajouté » ou un « Statut → Actif » raconte ce qui s'est passé : le
     réécrire fausserait l'histoire du dossier. */
  const TYPES_MODIFIABLES = new Set(['appel', 'rdv', 'note', 'relance_manuelle', 'envoi_externe', 'email_libre']);

  async function modifierAction(j: any) {
    /* La date de relance ne se devine pas depuis le journal : on lit la
       relance elle-même, pour pouvoir la déplacer dans le formulaire. */
    const rid = (j.metadata?.relance_id as string | undefined) || null;
    let jour = '';
    if (rid) {
      const { data } = await supabase.from('relances')
        .select('date_echeance, statut').eq('id', rid).maybeSingle();
      if (data && data.statut === 'en_attente') {
        const d = new Date(data.date_echeance);
        jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }
    setActionEdit(j.id);
    setActionRelanceId(jour ? rid : null);
    setActionF({
      type: j.type || 'note',
      titre: j.titre || '',
      description: j.description || '',
      bien_id: j.bien_id || '',
      relance: jour,
    });
    setShowAction(true);
  }

  async function supprimerAction(j: any) {
    /* Une action peut avoir posé une relance. Les deux partent ensemble, sans
       seconde question : une relance dont l'action n'existe plus n'a plus de
       raison d'être, et deux confirmations pour un geste, c'est une de trop.
       Une relance déjà clôturée n'est pas touchée : c'est de l'histoire. */
    const relanceId = j.metadata?.relance_id as string | undefined;
    let quand = '';
    if (relanceId) {
      const { data } = await supabase.from('relances')
        .select('date_echeance, statut').eq('id', relanceId).maybeSingle();
      if (data && data.statut === 'en_attente') {
        quand = new Date(data.date_echeance).toLocaleDateString('fr-FR');
      }
    }

    const texte = `Supprimer « ${j.titre} » du suivi ?\n\nCette ligne disparaît définitivement de l'historique du dossier.`
      + (quand ? `\nLa relance prévue le ${quand} est supprimée avec elle.` : '');
    if (!confirm(texte)) return;

    if (relanceId) {
      if (quand) await verifie('La suppression de la relance', supabase.from('relances').delete().eq('id', relanceId).eq('statut', 'en_attente'));
      chargerRelances();
      /* Une action avec relance laisse DEUX lignes au suivi : l'action, et le
         « 🔔 Relance prévue le… » qui l'accompagne. Les deux portent le même
         identifiant de relance — on les efface ensemble, sinon la seconde
         restait seule à annoncer une relance qui n'existe plus. */
      await verifie('La suppression de l’action', supabase.from('journal').delete().eq('client_id', client.id).eq('metadata->>relance_id', relanceId));
    }
    await verifie('La suppression de l’action', supabase.from('journal').delete().eq('id', j.id).select('id'), { ligne: !relanceId });
    load();
  }

  /* ═══ La transaction ═══ */

  async function flushTx() {
    clearTimeout(txTimer.current);
    const lot = txPending.current;
    txPending.current = {};
    const id = txRef.current?.id;
    if (!id || Object.keys(lot).length === 0) return;
    let r = await supabase.from('transactions').update(lot).eq('id', id).select('id');
    /* V3.50 : les montants gardent leurs centimes. Si une colonne n'accepte
       que des nombres entiers, on réessaie à l'euro près plutôt que de tout
       perdre. */
    if (r.error && /type (integer|bigint|smallint)/i.test(r.error.message)) {
      const arrondi = Object.fromEntries(Object.entries(lot).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : v]));
      r = await supabase.from('transactions').update(arrondi).eq('id', id).select('id');
    }
    await verifie('La transaction', Promise.resolve(r), { ligne: true });
  }

  function saveTxField(field: string, value: any) {
    setTxData((prev: any) => ({ ...prev, [field]: value }));
    txPending.current[field] = value;
    clearTimeout(txTimer.current);
    txTimer.current = setTimeout(() => { flushTx(); }, 550);
  }

  /* La veille est un drapeau posé sur la recherche — c'est `recherches.active`
     que lit le robot pour savoir où chercher. Un compromis signé n'a pas
     besoin de trois mois de propositions : on met en pause, sans clôturer,
     parce qu'un compromis peut tomber et qu'un clic doit suffire à repartir. */
  async function veilleTx(active: boolean, pourquoi: string) {
    if (!rechercheId) return;
    /* `updated_at` n'est pas décoratif ici : l'espace du client s'en sert pour
       savoir si une déclaration de fin de recherche est encore d'actualité.
       Relancer la veille rallume sa pastille « Recherche en cours ». */
    if (!(await verifie(active ? 'La reprise de la veille' : 'La mise en pause de la veille', supabase.from('recherches')
      .update({ active, updated_at: new Date().toISOString() }).eq('id', rechercheId).select('id'), { ligne: true }))) return;
    setRecherches(rs => rs.map(r => r.id === rechercheId ? ({ ...r, active } as Recherche) : r));
    await addJournal(client.id, 'statut_change',
      active ? '🔍 Veille relancée' : '⏸️ Veille mise en pause', pourquoi, undefined, { rechercheId });
  }

  async function avancerEtape(prochaine: string) {
    if (!transaction) return;
    await flushTx();
    const e = ETAPES_TX.find(x => x.cle === prochaine);
    if (!(await verifie('Le passage à l’étape suivante', supabase.from('transactions').update({ etape_actuelle: prochaine }).eq('id', transaction.id).select('id'), { ligne: true }))) { load(); return; }
    /* Un seul type au journal. Avant, l'identifiant de l'étape SERVAIT de type
       — « compromis », « acte »… des types que ni les filtres du suivi ni les
       icônes ne connaissaient, et qui s'allongeaient à chaque étape. */
    await addJournal(client.id, 'etape_transaction',
      `${e?.icone || '💼'} Transaction → ${e?.nom || prochaine}`, e?.quoi, undefined, { rechercheId });
    if (prochaine === 'compromis') {
      await veilleTx(false, "Compromis signé : inutile de continuer à proposer des biens. La veille repart d'un clic si le compromis tombe.");
    }
    setVueEtape(null); setTxData({});
    load();
  }

  async function reculerEtape() {
    setShowConfirmEtape(true);
  }

  async function doReculerEtape() {
    if (!transaction) return;
    await flushTx();
    const cur = transaction.etape_actuelle;
    /* « finalise » ne fait pas partie de l'ordre des étapes : l'ancien calcul
       tombait sur -1 et sortait sans rien faire — un dossier finalisé ne
       pouvait plus reculer. */
    const prec = cur === 'finalise' ? 'acte' : ORDRE_ETAPES[ORDRE_ETAPES.indexOf(cur) - 1];
    if (!prec) { setShowConfirmEtape(false); return; }
    if (!(await verifie('Le retour à l’étape précédente', supabase.from('transactions').update({ etape_actuelle: prec }).eq('id', transaction.id).select('id'), { ligne: true }))) { setShowConfirmEtape(false); load(); return; }
    if (cur === 'finalise') {
      /* On défait la clôture : le dossier redevient un dossier en cours. La
         veille, elle, reste en pause — on est toujours à l'acte. */
      await verifie('La réouverture du dossier', supabase.from('clients').update({ statut: 'actif', raison_perte: null }).eq('id', client.id));
      const { data } = await supabase.from('clients').select('*').eq('id', client.id).maybeSingle();
      if (data) setClient(data as Client);
    }
    if (cur === 'compromis') await veilleTx(true, 'Retour avant le compromis — la recherche reprend.');
    await addJournal(client.id, 'retour_etape', `↩️ Retour → ${ETAPES_LABELS[prec] || prec}`, undefined, undefined, { rechercheId });
    setShowConfirmEtape(false); setVueEtape(null); setTxData({});
    load();
  }

  /* L'acte signé, c'est la même sortie que « Clôturer le dossier ». Le bouton
     écrivait seulement `statut = bien_trouve` : la veille continuait de
     tourner et les relances tombaient sur un client qui avait ses clés.
     V3.50 : il ouvre la fenêtre « Acte signé » — la date de la signature à
     confirmer (elle range la vente dans le chiffre d'affaires du mois ; une
     date prévue jamais corrigée la rangeait au mauvais mois), et un mot si
     les honoraires manquent. La suite : `confirmerActe`, puis `clore`. */
  async function finaliserTransaction() {
    if (!transaction || saving) return;
    await flushTx();
    ouvrirActe({ ...transaction, ...txData } as TxActe, { portee: 'recherche', raison: null, note: '' });
  }

  /* Une offre refusée, un vendeur qui se retire, un client qui renonce : il
     n'existait aucun moyen de défaire une transaction ouverte par erreur. */
  async function abandonnerTransaction() {
    if (!transaction) return;
    if (!confirm("Abandonner cette transaction ?\n\nL'offre, les contre-offres et les dates saisies sont effacées. Le bien repasse en « visité », et si le dossier est encore ouvert la recherche reprend.")) return;
    await flushTx();
    setSaving(true);
    const bienId = transaction.bien_id;
    if (!(await verifie('L’abandon de la transaction', supabase.from('transactions').delete().eq('id', transaction.id).select('id'), { ligne: true }))) { setSaving(false); load(); return; }
    if (bienId) await verifie('Le bien repassé « visité »', supabase.from('biens').update({ badge_retour: 'visite' }).eq('id', bienId));
    /* « offre_ecrite » est un ancien statut : plus aucun menu ne le propose,
       mais d'anciens dossiers le portent encore en base. */
    const st = client.statut as string;
    if (st === 'actif' || st === 'offre_ecrite') {
      if (st === 'offre_ecrite') {
        await verifie('Le statut du client', supabase.from('clients').update({ statut: 'actif' }).eq('id', client.id));
        const { data } = await supabase.from('clients').select('*').eq('id', client.id).maybeSingle();
        if (data) setClient(data as Client);
      }
      await veilleTx(true, 'Transaction abandonnée — la recherche repart.');
    }
    await addJournal(client.id, 'etape_transaction', '❌ Transaction abandonnée', undefined, undefined, { rechercheId });
    setTransaction(null); setTxData({}); setVueEtape(null);
    setSaving(false); refresh(); load();
  }

  async function ajouterContreOffre() {
    if (!transaction) return;
    const m = lireMontant(coForm.montant);
    /* Le formulaire lisait les champs avec document.getElementById et ne
       vérifiait rien : un clic à vide ajoutait une contre-offre « NaN € ». */
    if (!m) { alert('Indiquez le montant de la contre-offre.'); return; }
    const liste = [...((transaction.contre_offres as any[]) || []),
      { partie: coForm.partie, montant: m, date: coForm.date || jourParis() }];
    if (!(await verifie('La contre-offre', supabase.from('transactions').update({ contre_offres: liste }).eq('id', transaction.id).select('id'), { ligne: true }))) return;
    /* La balle est dans l'autre camp : on pré-sélectionne l'autre partie. */
    setCoForm({ partie: coForm.partie === 'vendeur' ? 'acheteur' : 'vendeur', montant: '', date: '' });
    load();
  }

  async function supprimerContreOffre(i: number) {
    if (!transaction) return;
    const liste = ((transaction.contre_offres as any[]) || []).filter((_, k) => k !== i);
    await verifie('La suppression de la contre-offre', supabase.from('transactions').update({ contre_offres: liste }).eq('id', transaction.id).select('id'), { ligne: true });
    load();
  }

    const jours = Math.floor((Date.now() - new Date(client.created_at).getTime()) / 86400000);
  const joursMandat = cr.mandat_date_expiration ? joursRestants(cr.mandat_date_expiration) : null;

  // Timeline fusionnée (Historique + Journal)
  // On exclut du journal les types qui font doublon avec les communications (envois)
  const COMM_JOURNAL_TYPES = ['mail_envoye', 'envoi_bien', 'visite_effectuee'];
  const suiviComms = envois.map(e => ({ kind: 'comm' as const, ts: e.created_at, data: e }));
  /* Le journal était lu sur le client seul : les recherches d'un même client
     se mélangeaient. Une ligne sans recherche (le contact, le statut, les
     anciennes lignes) reste visible partout ; une ligne d'une autre recherche
     ne l'est plus que sur demande. */
  const autreRecherche = (j: { recherche_id?: string | null }) => recherches.length > 1 && !!j.recherche_id && j.recherche_id !== rechercheId;
  /* « Toutes les recherches » vaut pour la recherche où on l'a demandé :
     changer de recherche revient à la vue simple. */
  const suiviToutes = !!rechercheId && suiviToutesPour === rechercheId;
  const nbAutresRecherches = journal.filter(j => !COMM_JOURNAL_TYPES.includes(j.type) && autreRecherche(j) && j.id !== ligneVisee).length;
  const suiviEvents = journal
    .filter(j => !COMM_JOURNAL_TYPES.includes(j.type))
    .filter(j => suiviToutes || !autreRecherche(j) || j.id === ligneVisee)
    .map(j => ({ kind: 'event' as const, ts: j.created_at, data: j }));
  // Groupes de filtres du Suivi (alignés sur les types de la modale "Ajouter une action")
  const COMM_EVENT_TYPES = ['email_libre', 'envoi_externe'];
  /* « relance_manuelle » n'est plus dans cette liste : les quelques anciennes
     lignes de ce type retombent dans « Système ». Une relance ne mérite plus
     son propre filtre — elle s'affiche maintenant sous l'action qui l'a créée. */
  const MANUEL_OU_COMM = ['appel', 'rdv', 'note', 'message_client', 'demande_rappel', 'point_auto_reponse', 'mandat', ...COMM_EVENT_TYPES];
  const evType = (types: string[]) => suiviEvents.filter(it => types.includes(it.data.type));
  const suiviGroupes: Record<string, { label: string; items: any[] }> = {
    appel:          { label: '📞 Appels',         items: evType(['appel']) },
    rdv:            { label: '🤝 RDV',            items: evType(['rdv']) },
    note:           { label: '📝 Notes',          items: evType(['note']) },
    message:        { label: '💬 Messages & rappels', items: evType(['message_client', 'demande_rappel', 'point_auto_reponse']) },
    communications: { label: '✉️ Communications', items: [...suiviComms, ...evType(COMM_EVENT_TYPES)] },
    /* Le mandat a son filtre : proposé, signé, rétracté, questions — des
       informations qui comptent, pas du bruit « Système ». */
    mandat:         { label: '📋 Mandat',         items: evType(['mandat']) },
    systeme:        { label: '🔄 Système',        items: suiviEvents.filter(it => !MANUEL_OU_COMM.includes(it.data.type)) },
  };
  const suiviItems = (
    suiviFiltre === 'tout'
      ? [...suiviComms, ...suiviEvents]
      : (suiviGroupes[suiviFiltre]?.items || [])
  ).slice().sort((a: any, b: any) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const suiviCount = suiviComms.length + suiviEvents.length;

  const enSelection = biens.filter((b: any) => (b.etape || 'selection') === 'selection');
  const presentes  = biens.filter((b: any) => b.etape === 'presente');

  const TABS = [
    { id: 'veille',      icone: 'loupe',      nom: 'Veille',    compte: veilleCount, dore: true },
    { id: 'selection',   icone: 'liste',      nom: 'Sélection', compte: enSelection.length },
    { id: 'presentes',   icone: 'envoi',      nom: 'Présentés', compte: presentes.length },
    /* Les visites annulées ne comptent pas : l'onglet annoncerait 3 visites
       pour n'en montrer qu'une. */
    { id: 'visites',     icone: 'calendrier', nom: 'Visites',   compte: visites.filter(v => v.statut === 'a_venir' || v.statut === 'effectuee').length },
    { id: 'transaction', icone: 'mallette',   nom: transaction && transaction.etape_actuelle === 'finalise' ? 'Transaction \u2713' : 'Transaction', compte: null },
  ];


  const BADGES: Record<string, { label: string; color: string; bg: string }> = {
    propose:          { label: '📋 Proposé',         color: '#64748b', bg: '#f8fafc' },
    interesse:        { label: '👍 Intéressé',        color: '#3b82f6', bg: '#eff6ff' },
    souhaite_visiter: { label: '👀 Souhaite visiter', color: '#8b5cf6', bg: '#f5f3ff' },
    visite:           { label: '✅ Visité',            color: '#10b981', bg: '#ecfdf5' },
    offre_faite:      { label: '🟡 Offre faite',      color: '#f59e0b', bg: '#fffbeb' },
    refuse:           { label: '❌ Refusé',            color: '#ef4444', bg: '#fef2f2' },
  };


  /* Les relances en attente de ce client, pour l'étiquette de l'entête. */
  const chargerRelances = useCallback(async () => {
    const { data } = await supabase.from('relances')
      .select('id, date_echeance, note, recherche_id')
      .eq('client_id', client.id).eq('statut', 'en_attente')
      .order('date_echeance', { ascending: true });
    setRelancesAtt(data || []);
  }, [client.id]);

  useEffect(() => { chargerRelances(); delaiRelance().then(setDelaiJours); }, [chargerRelances]);
  /* V3.85 — « Reporter » sur une relance « À venir » du Suivi. */
  const reporterDepuisSuivi = async (id: string, jour: string) => {
    const ok = await reporterRelance(id, jour);
    if (ok) { chargerRelances(); signalerMaj(); }
    return ok;
  };

  const etiquetteRelance = (() => {
    const r = relancesAtt[0];
    if (!r) return null;
    const auj = new Date(); auj.setHours(12, 0, 0, 0);
    const d = new Date(r.date_echeance); d.setHours(12, 0, 0, 0);
    const j = Math.round((d.getTime() - auj.getTime()) / 86400000);
    if (j < 0) return { label: `Relance en retard de ${-j}j`, note: r.note || '', couleur: '#b91c1c', fond: '#fef2f2', trait: '#fecaca' };
    if (j === 0) return { label: "Relance aujourd'hui", note: r.note || '', couleur: '#b45309', fond: '#fffbeb', trait: '#fde68a' };
    return { label: `Relance dans ${j}j`, note: r.note || '', couleur: '#64748b', fond: '#f8fafc', trait: '#e3e8f0' };
  })();

  const AVIS_CR: Record<string, { label: string; color: string; bg: string }> = {
    tres_interesse: { label: '🔥 Très intéressé', color: '#c2410c', bg: '#fff7ed' },
    interesse:      { label: '👍 Intéressé',      color: '#15803d', bg: '#f0fdf4' },
    a_voir:         { label: '🤔 À revoir',        color: '#7c3aed', bg: '#f5f3ff' },
    pas_interesse:  { label: '👎 Pas intéressé',   color: '#b91c1c', bg: '#fef2f2' },
    elimine:        { label: '❌ Éliminé',          color: '#991b1b', bg: '#fef2f2' },
  };

  /* « Appartement · 4 p. et + · Neuilly, Boulogne · jusqu'à 1 250 000 € » */
  const resumeRecherche = [
    cr.type_bien ? String(cr.type_bien).split(',').map(x => x.trim()).join(', ') : '',
    cr.nb_pieces_min ? `${cr.nb_pieces_min} p. et +` : '',
    cr.surface_min ? `${cr.surface_min} m² et +` : '',
    cr.secteurs?.length ? grouperVilles(cr.secteurs) : '',
    cr.budget_max ? `jusqu’à ${budgetLisible(cr.budget_max)}` : '',
  ].filter(Boolean).join(' · ');

  /* Le rapprochement a son onglet (V3.32) : il prenait trop de place dans la
     Vue d'ensemble. En haut, de quoi le lancer, avec ce que vos mandats
     donnent déjà ; puis ces mandats, un par un ; puis ceux déjà faits. */
  const rapprochements = journal
    .filter(j => j.type === 'rapprochement' && j.recherche_id === rechercheId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const dernierRappro = rapprochements[0];
  const jourRappro = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  const bandeauRappro = !rechercheActive ? null : (
    <section className={styles.rappro} aria-label={`Des biens pour ${client.prenom}`}>
      <svg className={styles.rapproIllu} width="150" height="76" viewBox="0 0 150 76" aria-hidden="true">
        <rect width="150" height="76" rx="14" fill="#fbf6e9" />
        <path className={styles.rapproTrait} d="M40 38 C 62 28, 78 20, 96 20" fill="none" stroke="#c9a84c" strokeWidth="1.6" />
        <path className={styles.rapproTrait} d="M40 38 C 62 48, 78 56, 96 56" fill="none" stroke="#c9a84c" strokeWidth="1.6" />
        <circle className={styles.rapproOnde} cx="36" cy="38" r="19" fill="none" stroke="#c9a84c" strokeWidth="2" />
        <circle cx="36" cy="38" r="19" fill="#2e4166" />
        <foreignObject x="19" y="21" width="34" height="34"><AvatarContact c={client as never} teinte={{ bg: '#2e4166', fg: '#e8c96a' }} taille={34} /></foreignObject>
        <g className={styles.rapproFlotte1}><rect x="94" y="8" width="44" height="24" rx="8" fill="#fff" stroke="#e3e8f0" /><path d="M108 22l6-5 6 5M110 21v5h8v-5" fill="none" stroke="#34496e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></g>
        <g className={styles.rapproFlotte2}><rect x="94" y="44" width="44" height="24" rx="8" fill="#fff" stroke="#e3e8f0" /><circle cx="114" cy="55" r="4.2" fill="none" stroke="#a07c28" strokeWidth="1.6" /><path d="M117.2 58.2l2.8 2.8" stroke="#a07c28" strokeWidth="1.6" strokeLinecap="round" /></g>
      </svg>
      <div className={styles.rapproTx}>
        <div className={styles.rapproTitre}>
          <h2>{`Des biens pour ${client.prenom}`}</h2>
          {!!mandatsOk?.n && <span className={styles.rapproNouveau}><i />{mandatsOk.n > 1 ? `${mandatsOk.n} mandats` : '1 mandat'}</span>}
        </div>
        <p>{mandatsOk?.n
          ? <><b>{`${mandatsOk.n > 1 ? `${mandatsOk.n} de vos mandats lui correspondent` : '1 de vos mandats lui correspond'}, jusqu’à ${mandatsOk.meilleure} %`}</b>{' · à comparer aussi : les biens de vos veilles'}</>
          : 'Comparez sa recherche avec vos mandats en cours et les biens trouvés par vos veilles pour vos autres clients.'}</p>
        {dernierRappro && <small className={styles.rapproDernier}>{`Dernier le ${jourRappro(dernierRappro.created_at)} · ${dernierRappro.metadata?.n ?? 0} bien${(dernierRappro.metadata?.n ?? 0) > 1 ? 's' : ''} trouvé${(dernierRappro.metadata?.n ?? 0) > 1 ? 's' : ''}`}</small>}
      </div>
      <button type="button" className={styles.rapproCta} onClick={() => setRappro(true)}>
        <Icone nom="etoile" taille={17} epaisseur={2.2} />{dernierRappro ? 'Refaire un rapprochement' : 'Faire un rapprochement'}
      </button>
    </section>
  );

  const ETAPES_LABELS: Record<string, string> = {
    offre: '1 — Offre', negociation: '2 — Négociation',
    offre_acceptee: '3 — Offre acceptée', compromis: '4 — Compromis', acte: '5 — Acte',
    finalise: 'Dossier finalisé',
  };
  /* « finalise » n'est pas dans l'ordre des étapes : sans ce cas particulier,
     la fenêtre de confirmation annonçait un retour vers « 1 — Offre ». */
  const etapePrecTx = !transaction ? 'offre'
    : transaction.etape_actuelle === 'finalise' ? 'acte'
    : ORDRE_ETAPES[Math.max(0, ORDRE_ETAPES.indexOf(transaction.etape_actuelle) - 1)];

  return (
    <div className={styles.page}>

      <div className={styles.pageHeader}>
        <div className={styles.fil} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className={styles.backBtn} onClick={onBack} aria-label={retourVers === 'relances' ? 'Retour aux relances' : 'Retour aux contacts'}>
            <span className={styles.surBureau}>{retourVers === 'relances' ? '← Relances' : '← Contacts'}</span>
            <span className={styles.surMobile}><Icone nom="retour" taille={19} epaisseur={2.1} /></span>
          </button>
          <span className={styles.filSep} style={{ color: '#94a3b8' }}>/</span>
          <span className={styles.filNom} style={{ fontWeight: 600, color: 'var(--emilio)', fontSize: 14 }}>{nomFoyer(client)}</span>
          {etiquetteRelance && (
            <span className={styles.filRelance} title={etiquetteRelance.note} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
              borderRadius: 99, fontSize: 12, fontWeight: 700,
              color: etiquetteRelance.couleur, background: etiquetteRelance.fond,
              border: `1px solid ${etiquetteRelance.trait}`,
            }}>🔔 {etiquetteRelance.label}</span>
          )}
        </div>
        {/* Sur téléphone, les quatre gestes deviennent une rangée de boutons
            à pictogramme, tous visibles sans défiler. */}
        <div className={styles.actionsFiche} style={{ display: 'flex', gap: 8 }}>
          {/* V3.87 — Un seul bouton (Alexandre : « Envoyer, envoyer quoi ? et
              Mail fait doublon ») : « Envoyer à Camille » ouvre le choix, un
              mail, des biens, un compte rendu de visite. */}
          <button className={`${styles.btn} ${styles.actionFiche}`} onClick={() => setShowEnvoi(true)} style={{ background: '#fef9c3', border: '1px solid #fde68a', color: '#854d0e', fontWeight: 700 }}>
            <span className={styles.surBureau}>{`📤 ${client.prenom && client.prenom.length <= 14 ? `Envoyer à ${client.prenom}` : 'Lui envoyer'}`}</span>
            <span className={styles.surMobile}><Icone nom="envoi" taille={20} epaisseur={1.9} /><span>Envoyer</span></span>
          </button>
          {/* V3.87 : « Relance J+5 » est parti (Alexandre : « ça ne sert à rien,
              on pose déjà la prochaine relance en notant l'action dans le Suivi »). */}
          <button className={`${styles.btn} ${styles.actionFiche}`} onClick={() => nouvelleAction()}>
            <span className={styles.surBureau}>+ Action</span>
            <span className={styles.surMobile}><Icone nom="note" taille={20} epaisseur={1.9} /><span>Action</span></span>
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary} ${styles.actionFiche}`} onClick={() => setShowBien(true)}>
            <span className={styles.surBureau}>+ Ajouter un bien</span>
            <span className={styles.surMobile}><Icone nom="maison" taille={20} epaisseur={1.9} /><span>Ajouter un bien</span></span>
          </button>
          {/* Effacer une personne ne se met pas à côté des actions du quotidien :
              discret, gris, et rouge seulement quand la souris s'y arrête. */}
          <button className={styles.actionSuppr} aria-label="Supprimer ce client" onClick={() => { setSupprNom(''); ouvrirSuppressionClient(); }}
            title="Supprimer définitivement ce client et tout son dossier"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 15, padding: '0 6px', alignSelf: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#dc2626')}
            onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
            <span className={styles.surBureau}>🗑️</span>
            <span className={styles.surMobile}><Icone nom="corbeille" taille={19} epaisseur={1.8} /></span>
          </button>
        </div>
      </div>

      {/* V3.73 : un acheteur archivé le dit tout en haut, avec la sortie. */}
      {estArchive(client) && (
        <div className={styles.archiveBandeau}>
          <span>Ce contact est archivé : il n’apparaît plus dans la liste des contacts, seulement dans « Archivés ».</span>
          <button type="button" onClick={() => void basculerArchive()}>Sortir des archives</button>
        </div>
      )}

      {/* ══ L'EN-TÊTE (V3.29) : qui, où en est son dossier, comment le joindre ══
          Le bloc bleu ne grandit jamais : les coordonnées tiennent dans un
          panneau qui se déplie par-dessus les onglets, et la situation est
          descendue dans « Vue d'ensemble ». Les onglets sont posés à cheval
          sur son bord bas. */}
      {(() => {
        const st = client.statut as string;
        const dossierClos = st === 'bien_trouve' || st === 'perdu';
        const teinte = st === 'actif' ? '#34d399' : st === 'prospect' ? '#a78bfa' : st === 'suspendu' || st === 'offre_ecrite' ? '#fbbf24' : st === 'bien_trouve' ? '#60a5fa' : '#f87171';
        void dossierClos;
        /* À qui est chaque numéro : seulement dans un couple. « Madame » et
           « Monsieur » quand les civilités diffèrent, sinon le prénom. */
        const j2 = client.couple ? conjointDe(client.conjoint) : null;
        const civ1 = (client as unknown as { civilite?: string | null }).civilite || '';
        const civ2 = j2?.civilite || '';
        const qui1 = j2 ? (civ1 && civ2 && civ1 !== civ2 ? civ1 : client.prenom || civ1 || 'Personne 1') : undefined;
        const qui2 = j2 ? (civ1 && civ2 && civ1 !== civ2 ? civ2 : j2.prenom || civ2 || 'Personne 2') : undefined;
        const coords: Coord[] = [
          ...(client.telephones || []).filter(Boolean).map(t => ({ k: 'tel' as const, val: t, qui: qui1 })),
          ...(j2?.telephone ? [{ k: 'tel' as const, val: j2.telephone, qui: qui2 }] : []),
          ...(client.emails || []).filter(Boolean).map(e => ({ k: 'mail' as const, val: e, qui: qui1 })),
          ...(j2?.email ? [{ k: 'mail' as const, val: j2.email, qui: qui2 }] : []),
          ...(client.adresse ? [{ k: 'adresse' as const, val: client.adresse }] : []),
        ];
        const aCarte = !!(client.adresse || (client as unknown as { bien_actuel_adresse?: string | null }).bien_actuel_adresse);
        const piedCarte = !aCarte ? undefined : <BoutonCarte focus={`c:${client.id}`} onNavigate={onNavigate} />;
        const nbFaites = visites.filter(v => v.statut === 'effectuee').length;
        const nbOffres = biens.filter(b => b.badge_retour === 'offre_faite').length;
        /* Une visite prévue peut être annulée : on ne compte que les
           visites effectuées. La prochaine est dans « À venir ». */
        const jourLong = (x: string) => new Date(String(x).length <= 10 ? `${x}T12:00:00` : x).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
        const aVenir = visites.filter(v => v.statut === 'a_venir' && v.date_visite && String(v.date_visite).slice(0, 10) >= jourParis())
          .sort((a, b) => String(a.date_visite).localeCompare(String(b.date_visite)));
        const faites = visites.filter(v => v.statut === 'effectuee' && v.date_visite).map(v => String(v.date_visite)).sort();
        const aimes = presentes.filter(b => b.badge_retour === 'interesse' || b.badge_retour === 'souhaite_visiter').length;
        const pl = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
        const compteurs = [
          { k: 'selection', ic: 'etoile', n: enSelection.length,
            titre: enSelection.length ? `${enSelection.length} en sélection` : 'Aucune sélection',
            sous: enSelection.length ? 'à lui présenter' : 'pour l’instant' },
          { k: 'presentes', ic: 'envoyer', n: presentes.length,
            titre: presentes.length ? pl(presentes.length, 'présenté', 'présentés') : 'Rien présenté',
            sous: !presentes.length ? 'pour l’instant' : aimes ? `dont ${aimes} qui l’intéresse${aimes > 1 ? 'nt' : ''}` : 'en attente de son avis' },
          { k: 'visites', ic: 'cle', n: nbFaites + aVenir.length,
            titre: nbFaites ? pl(nbFaites, 'visite faite', 'visites faites') : aVenir.length ? pl(aVenir.length, 'visite prévue', 'visites prévues') : 'Aucune visite',
            sous: nbFaites
              ? (aVenir.length ? `+ ${pl(aVenir.length, 'prévue', 'prévues')}, ${aVenir.length > 1 ? 'la prochaine ' : ''}le ${jourLong(aVenir[0].date_visite)}` : `la dernière le ${jourLong(faites[faites.length - 1] || '')}`)
              : aVenir.length ? `${aVenir.length > 1 ? 'la prochaine ' : ''}le ${jourLong(aVenir[0].date_visite)}` : 'pour l’instant' },
          { k: 'transaction', ic: 'euro', n: nbOffres,
            titre: nbOffres ? pl(nbOffres, 'offre', 'offres') : 'Aucune offre',
            sous: !nbOffres ? 'pour l’instant' : transaction ? 'transaction ouverte' : 'faite, à suivre' },
        ];
        const espaceLe = (rechercheActive as unknown as { espace_ouvert_le?: string | null } | null)?.espace_ouvert_le;
        /* « Son espace » (V3.33) : au pied des coordonnées tant qu'elles tiennent
           sans dépliage — c'est une façon de le joindre, et le panneau crème
           n'a plus de vide en bas. Sinon, dans la ligne sous les tuiles. */
        const espaceEnPied = coords.length <= 3;
        const boutonEspace = (cls: string) => (
          <button type="button" className={cls} onClick={() => setVue('espace')}>
            <span className={espaceLe ? styles.teteEspaceOn : styles.teteEspaceOff} />
            <b>Son espace</b>
            <span suppressHydrationWarning>{espaceLe ? ` · ouvert ${ilYA(espaceLe)}` : ' · pas encore ouvert'}</span>
          </button>
        );
        return (
          <div className={styles.teteZone}>
            <div className={styles.tete}>
              <span aria-hidden className={styles.teteFond}><span className={styles.teteHalo1} /><span className={styles.teteHalo2} /></span>
              <div className={styles.teteG}>
                <div className={styles.teteQui}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <AvatarContact c={client as never} teinte={{ bg: '', fg: '#e0c36e' }} className={styles.teteAvatar} libre />
                    <span className={styles.teteEtat} style={{ background: teinte }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div className="fc-id-nom" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 24, color: 'white', letterSpacing: -0.6, lineHeight: 1.15 }}>
                        {nomFoyer(client)}
                      </div>
                      {/* Le menu natif s'ouvrait en blanc brut sur le bandeau sombre.
                          Celui-ci nomme chaque état et dit ce qu'il veut dire. */}
                      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <button onClick={(ev) => {
                          if (menuStatut) { setMenuStatut(null); return; }
                          const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                          setMenuStatut({ x: Math.max(12, Math.min(r.left, window.innerWidth - 300)), y: r.bottom + 8 });
                        }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px 5px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(255,255,255,.16)', background: menuStatut ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.82)', outline: 'none', transition: 'background .15s' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: teinte, flexShrink: 0 }} />
                          {`${ETATS_CLIENT.find(x => x.cle === st)?.nom || st}${st === 'suspendu' && lireSuspension(client) ? ` jusqu'au ${jourLisible(lireSuspension(client)!.jusqu_au)}` : ''}`}
                          <span style={{ fontSize: 8, color: 'rgba(255,255,255,.5)' }}>▼</span>
                        </button>
                        {menuStatut && (
                          <Portail>
                            <div onClick={() => setMenuStatut(null)} style={{ position: 'fixed', inset: 0, zIndex: 190 }} />
                            <div className="emilio-menu" style={{ position: 'fixed', left: menuStatut.x, top: menuStatut.y, zIndex: 191, width: 286, background: 'white', border: '1px solid #e3e8f0', borderRadius: 15, boxShadow: '0 3px 8px rgba(15,22,35,.06), 0 18px 44px rgba(15,22,35,.2)', overflow: 'hidden' }}>
                              <div style={{ padding: '10px 15px 9px', borderBottom: '1px solid #f1f5f9', background: '#fbfcfe' }}>
                                <span style={{ fontSize: 10, fontWeight: 800, color: '#a3b0c2', textTransform: 'uppercase', letterSpacing: 1.1 }}>État du dossier</span>
                              </div>
                              {ETATS_CLIENT.map(e => {
                                const courant = e.cle === st;
                                return (
                                  <button key={e.cle} onClick={() => {
                                    setMenuStatut(null);
                                    if (e.cle === 'suspendu') {
                                      const s = lireSuspension(client);
                                      setSuspendre(s ? { choix: 'date', date: s.jusqu_au } : { choix: 'sans', date: '' });
                                    } else changeStatut(e.cle);
                                  }}
                                    style={{ display: 'flex', alignItems: 'flex-start', gap: 11, width: '100%', textAlign: 'left', padding: '10px 15px', border: 'none', borderBottom: '1px solid #f4f7fb', background: courant ? '#f8fafc' : 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: e.point, flexShrink: 0, marginTop: 5, boxShadow: courant ? `0 0 0 3px ${e.point}26` : 'none' }} />
                                    <span style={{ flexGrow: 1, minWidth: 0 }}>
                                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: courant ? 800 : 700, color: 'var(--emilio)' }}>{e.nom}</span>
                                      <span style={{ display: 'block', fontSize: 11.5, color: '#94a3b8', marginTop: 1, lineHeight: 1.35 }}>{e.quand}</span>
                                    </span>
                                    {courant && <span style={{ color: '#10b981', fontSize: 13, flexShrink: 0, marginTop: 3 }}>✓</span>}
                                  </button>
                                );
                              })}

                              {/* Ce ne sont pas des états, ce sont des gestes : ils se détachent. */}
                              <div style={{ padding: '9px 15px 7px', background: '#fbfcfe', borderTop: '1px solid #eef2f7' }}>
                                <span style={{ fontSize: 10, fontWeight: 800, color: '#a3b0c2', textTransform: 'uppercase', letterSpacing: 1.1 }}>Actions</span>
                              </div>
                              {dossierClos ? (
                                <button onClick={() => { setMenuStatut(null); rouvrirDossier(); }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '11px 15px', border: 'none', background: '#f0fdf4', cursor: 'pointer', fontFamily: 'inherit', color: '#0f7a4f', fontWeight: 700, fontSize: 13 }}>
                                  ↩️ Rouvrir le dossier
                                </button>
                              ) : (
                                <>
                                  {/* Il y avait deux portes vers la même pièce : cette
                                      « offre écrite », et « Créer une transaction » dans
                                      l'onglet. La première ouvrait un formulaire à part et
                                      posait au client un statut « offre_ecrite » qui n'existe
                                      plus dans ce menu — il disparaissait du filtre « Actifs ».
                                      Une seule porte, maintenant. */}
                                  <button onClick={() => {
                                    setMenuStatut(null); setTab('transaction');
                                    if (!transaction && biensPourTx().length > 0) setShowChoixTx('creer');
                                  }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '11px 15px', border: 'none', borderBottom: '1px solid #f4f7fb', background: 'white', cursor: 'pointer', fontFamily: 'inherit', color: '#a9822f', fontWeight: 700, fontSize: 13 }}>
                                    💼 {transaction ? 'Voir la transaction' : 'Ouvrir une transaction'}
                                  </button>
                                  <button onClick={() => { setMenuStatut(null); setShowCloture(true); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '11px 15px', border: 'none', background: '#fdfaf1', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--emilio)', fontWeight: 700, fontSize: 13 }}>
                                    🏁 Clôturer la recherche
                                  </button>
                                </>
                              )}
                              {/* V3.73 : l'archive, comme pour les autres contacts. */}
                              <button onClick={() => { setMenuStatut(null); void basculerArchive(); }}
                                style={{ display: 'flex', alignItems: 'flex-start', gap: 9, width: '100%', textAlign: 'left', padding: '11px 15px', border: 'none', borderTop: '1px solid #f4f7fb', background: 'white', cursor: 'pointer', fontFamily: 'inherit', color: '#475569', fontWeight: 700, fontSize: 13 }}>
                                <span>🗄️</span>
                                <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                  <span>{estArchive(client) ? 'Sortir des archives' : 'Archiver le contact'}</span>
                                  <span style={{ fontSize: 11.5, fontWeight: 500, color: '#94a3b8' }}>{estArchive(client) ? 'Il revient dans la liste des contacts' : 'Retrouvable ensuite dans « Archivés »'}</span>
                                </span>
                              </button>
                            </div>
                          </Portail>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                      {/* Ses types de contact : acheteur, et peut-être vendeur, propriétaire… */}
                      <TypesEnLigne client={client} sombre onMaj={t => { if (!t.includes('acheteur')) onNavigate('fiche', { ...client, types: t }); }} />
                      {/* Il achète pour une société (V3.31) : dit ici, détaillé dans la Vue d'ensemble. */}
                      {(() => {
                        const st = lireStructure(lirePro((client as unknown as { pro?: unknown }).pro).structure);
                        if (!st && societeOuverte) return null;
                        return st ? (
                          <button type="button" className={styles.teteSoc} onClick={() => setVue('ensemble')}>
                            <Icone nom="immeuble" taille={13} epaisseur={2} /><span>{'Achète pour '}<b>{st.denomination || 'une société'}</b>{st.qualite ? ` · ${st.qualite}` : ''}</span>
                          </button>
                        ) : (
                          <button type="button" className={`${styles.teteSoc} ${styles.teteSocVide}`} onClick={() => { setCleSoc(k => k + 1); setSocieteOuverte(true); setVue('ensemble'); }}>
                            <Icone nom="immeuble" taille={13} epaisseur={2} /><span>Pour une société (SCI…) ?</span><b>Ajouter</b>
                          </button>
                        );
                      })()}
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,.42)', fontWeight: 500, letterSpacing: .2 }}>
                        {client.reference}
                      </span>
                      {libelleSource((client as unknown as { source?: string }).source, (client as unknown as { source_detail?: string }).source_detail) && (
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', fontWeight: 500 }}>
                          {'Source : '}<b style={{ color: '#e2c979', fontWeight: 700 }}>{libelleSource((client as unknown as { source?: string }).source, (client as unknown as { source_detail?: string }).source_detail)}</b>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Où en est son dossier (V3.33) : des tuiles sur toute la largeur,
                    comme pour un vendeur (src/components/shared/Tuiles.tsx) ; à
                    zéro, rien à ouvrir. Puis une ligne : depuis quand, son espace. */}
                <Tuiles label="Où en est son dossier" grandit>
                  {compteurs.map(t => <Tuile key={t.k} ic={t.ic} titre={t.titre} sous={t.sous} vide={!t.n} onClic={() => setTab(t.k)} />)}
                </Tuiles>
                <LigneTuiles>
                  <Horloge fort={jours <= 0 ? 'Suivi depuis aujourd’hui' : `Suivi depuis ${dureeSuivi(jours)}`}
                    doux={` · depuis le ${new Date(client.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: new Date(client.created_at).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })}`} />
                  {!espaceEnPied && boutonEspace(styles.teteEspace)}
                </LigneTuiles>
              </div>
              <Coordonnees coords={coords} onModifier={() => { setCf(cfDe(client)); setShowContact(true); }}
                pied={espaceEnPied ? <div className={styles.coPiedLigne}>{piedCarte}{boutonEspace(styles.coEspace)}</div> : piedCarte} />
              {/* V3.84 — Ses biens, sur toute la largeur du bandeau : s'il en a
                  dans la rubrique Biens ; sinon, s'il vend ou est propriétaire,
                  « Créer son bien ». Un acheteur seul n'a rien de plus ici. */}
              {sesBiens && (sesBiens.length > 0 || typesDe(client).some(t => t === 'vendeur' || t === 'proprietaire') || reventePossible(client)) && (
                <div className={styles.teteBiens}>
                  <span className={styles.teteBiensT}>
                    <b>{sesBiens.length > 1 ? 'Ses biens' : 'Son bien'}</b>
                    {sesBiens.length > 1 && <em>{sesBiens.length}</em>}
                    {sesArchives > 0 && <small>{`+ ${sesArchives} archivé${sesArchives > 1 ? 's' : ''}`}</small>}
                  </span>
                  <BiensHero biens={sesBiens} vente={venteBiens}
                    onBien={(id, onglet) => { if (onglet) demanderOngletBien(id, onglet); onNavigate('biens', { bien: id }); }}
                    onCreerBien={() => { demanderNouveauBien(client.id); onNavigate('biens'); }} />
                </div>
              )}
            </div>
            <div className={`${styles.ongletsTete} fc-onglets`}>
              <BarreOnglets<VueFiche> label="Rubriques du contact" actif={vue} onChoisir={setVue}
                onglets={[
                  { k: 'ensemble', l: 'Vue d’ensemble', ic: <Icone nom="oeil" taille={15} epaisseur={2} /> },
                  { k: 'recherche', l: recherches.length > 1 ? 'Ses recherches' : 'Sa recherche', n: recherches.length > 1 ? recherches.length : undefined, ic: <Icone nom="loupe" taille={15} epaisseur={2} /> },
                  /* Le rapprochement (V3.32) : pour un acheteur, dès qu'il a une recherche. */
                  ...(rechercheActive ? [{ k: 'rapprochement' as VueFiche, l: 'Rapprochement', n: mandatsOk?.n || undefined, ic: <Icone nom="etoile" taille={15} epaisseur={2} /> }] : []),
                  { k: 'espace', l: 'Son espace', ic: <Icone nom="mobile" taille={15} epaisseur={2} /> },
                  { k: 'documents', l: 'Documents', n: nbDocs || undefined, ic: <Icone nom="doc" taille={15} epaisseur={2} /> },
                  { k: 'suivi', l: 'Suivi', n: suiviCount || undefined, ic: <Icone nom="horloge" taille={15} epaisseur={2} /> },
                ]} />
            </div>
          </div>
        );
      })()}
      <div className={styles.contentWrap}>
        {/* ONGLETS en haut */}
      <style>{`
        @keyframes emilioPanneau { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes emilioMenu { from { opacity: 0; transform: translateY(-6px) scale(.985); } to { opacity: 1; transform: none; } }
        .emilio-menu { animation: emilioMenu .16s cubic-bezier(.22,.8,.3,1) both; transform-origin: top left; }
        .emilio-panneau { animation: emilioPanneau .3s cubic-bezier(.2,.9,.3,1) both; }
        @keyframes ficheTabIn { from { opacity: 0; transform: translateY(7px) } to { opacity: 1; transform: none } }
        /* Le panneau prolonge la barre d'onglets : même fond, bordure continue,
           pas de coupure. On doit sentir qu'on est « dans » l'onglet choisi. */
        .fiche-tab { animation: ficheTabIn .3s cubic-bezier(.22,.9,.3,1) both; min-height: 240px;
          background: #f7f9fc; border: 1px solid #e3e8f0; border-top: none;
          border-radius: 0 0 16px 16px; padding: 16px; }
        @media (max-width: 720px) { .fiche-tab { padding: 12px; } }

        /* Les onglets arrivaient collés aux critères, sans rien pour dire qu'on
           changeait de sujet. Ce bandeau sombre le dit d'un seul contraste. */
        /* Discrets par défaut : le suivi se lit d'abord, il se corrige ensuite. */
        .suivi-actions { opacity: 0; transition: opacity .16s ease; }
        /* L'action d'où vient la relance, quand on arrive depuis la page Relances. */
        @keyframes suiviLueur {
          0% { background: rgba(201,168,76,0); box-shadow: 0 0 0 0 rgba(201,168,76,0); }
          15% { background: #fff6dd; box-shadow: 0 0 0 6px #fff6dd; }
          75% { background: #fff6dd; box-shadow: 0 0 0 6px #fff6dd; }
          100% { background: rgba(255,246,221,0); box-shadow: 0 0 0 6px rgba(255,246,221,0); }
        }
        .suivi-surligne { border-radius: 12px; animation: suiviLueur 5.5s ease both; }
        .suivi-ligne:hover .suivi-actions, .suivi-actions:focus-within { opacity: 1; }
        @media (hover: none) { .suivi-actions { opacity: 1; } }

        .fiche-suivi { margin-top: 22px; padding: 13px 14px 0;
          background: linear-gradient(105deg, #3d5878 0%, #4d6f95 100%);
          border-radius: 16px 16px 0 0; }
        .fiche-suivi-tete { display: flex; align-items: baseline; gap: 10px;
          flex-wrap: wrap; padding: 0 4px 11px; }
        .fiche-suivi-tete b { font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 12px; font-weight: 800; color: #e0c479;
          text-transform: uppercase; letter-spacing: 1.1px; }
        .fiche-suivi-tete i { font-style: normal; font-size: 11.5px; color: rgba(255,255,255,.55); }
        /* Remettre le suivi à zéro se décide en regardant le suivi : le bouton
           est donc ici, au bout de son en-tête, et nulle part ailleurs. */
        .fiche-suivi-reinit { margin-left: auto; display: inline-flex; align-items: center; gap: 6px;
          background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18);
          border-radius: 99px; padding: 5px 13px; cursor: pointer;
          font-family: 'DM Sans', sans-serif; font-size: 11.5px; font-weight: 700;
          color: rgba(255,255,255,.72); transition: background .14s, color .14s, border-color .14s; }
        .fiche-suivi-reinit:hover { background: #dc2626; border-color: #dc2626; color: #fff; }
        .fiche-suivi-rappro { margin-left: auto; display: inline-flex; align-items: center; gap: 6px;
          background: #c9a84c; border: 1px solid #c9a84c; border-radius: 99px; padding: 5px 13px; cursor: pointer;
          font-family: 'DM Sans', sans-serif; font-size: 11.5px; font-weight: 800; color: #1a2332;
          transition: background .14s, transform .14s; }
        .fiche-suivi-rappro:hover { background: #d8b85c; transform: translateY(-1px); }
        .fiche-suivi-rappro + .fiche-suivi-reinit { margin-left: 0; }

        /* ═══════════ La transaction ═══════════
           Cinq étapes empilées à la verticale, chacune avec son formulaire
           déplié : il fallait défiler pour savoir où on en était. Un rail en
           haut, les chiffres juste dessous, une seule étape ouverte. */

        .tx-bien { display: flex; align-items: center; gap: 12px; margin-bottom: 18px;
          background: #fff; border: 1px solid #e8edf5; border-radius: 14px; padding: 10px 14px; }
        .tx-photo { width: 46px; height: 46px; border-radius: 11px; background: #e2e8f0; flex-shrink: 0;
          display: inline-flex; align-items: center; justify-content: center; font-size: 20px; overflow: hidden; }
        .tx-photo img { width: 100%; height: 100%; object-fit: cover; }
        .tx-sur { display: block; font-size: 10px; font-weight: 800; color: #94a3b8;
          text-transform: uppercase; letter-spacing: .9px; }
        .tx-titre { display: block; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700;
          font-size: 14.5px; color: var(--emilio); margin-top: 2px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tx-detail { display: block; font-size: 12.5px; color: #64748b; }

        .tx-rail { display: flex; align-items: flex-start; margin: 0 0 18px; }
        .tx-pas { flex: 1 1 0; min-width: 0; background: none; border: none; padding: 0;
          font-family: inherit; display: flex; flex-direction: column; align-items: center;
          gap: 7px; cursor: pointer; }
        .tx-pas:disabled { cursor: default; }
        .tx-fil { display: flex; align-items: center; width: 100%; }
        .tx-fil i { flex: 1; height: 2px; background: #e3e8f0; transition: background .35s ease; }
        .tx-fil i.on { background: #c9a84c; }
        .tx-fil i.vide { background: transparent; }
        .tx-rond { width: 36px; height: 36px; flex-shrink: 0; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 15px; font-weight: 800; background: #fff; border: 2px solid #e3e8f0; color: #b0bec5;
          transition: transform .22s cubic-bezier(.3,1.5,.5,1), box-shadow .22s, background .3s, border-color .3s, color .3s; }
        .tx-pas[data-etat="fait"] .tx-rond { background: #c9a84c; border-color: #c9a84c; color: var(--emilio); }
        .tx-pas[data-etat="encours"] .tx-rond { background: var(--emilio); border-color: var(--emilio); color: #fff; }
        .tx-pas[data-vue="true"] .tx-rond { transform: scale(1.14); box-shadow: 0 0 0 5px rgba(201,168,76,.2); }
        .tx-pas:not(:disabled):hover .tx-rond { transform: scale(1.09); }
        .tx-nom { font-size: 11.5px; font-weight: 700; color: #a8b3c4; text-align: center;
          line-height: 1.25; padding: 0 3px; transition: color .25s; }
        .tx-pas[data-etat="fait"] .tx-nom { color: #64748b; }
        .tx-pas[data-etat="encours"] .tx-nom, .tx-pas[data-vue="true"] .tx-nom { color: var(--emilio); font-weight: 800; }

        .tx-chiffres { display: flex; flex-wrap: wrap; gap: 9px; margin-bottom: 16px; }
        .tx-chiffre { flex: 1 1 145px; background: #fff; border: 1px solid #e8edf5;
          border-radius: 12px; padding: 9px 13px; }
        .tx-chiffre b { display: block; font-size: 9.5px; font-weight: 800; color: #94a3b8;
          text-transform: uppercase; letter-spacing: .8px; }
        .tx-chiffre strong { display: block; font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 17px; font-weight: 800; letter-spacing: -.3px; margin-top: 1px; }
        .tx-chiffre i { font-style: normal; font-size: 11.5px; color: #94a3b8; }

        @keyframes txPanneau { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .tx-panneau { animation: txPanneau .28s cubic-bezier(.22,.9,.3,1) both;
          background: #fff; border: 1px solid #e8edf5; border-radius: 16px; overflow: hidden; }

        .tx-tete { display: flex; align-items: center; gap: 11px; padding: 13px 16px;
          border-bottom: 1px solid #f1f5f9; background: #f8fafc; }
        .tx-tete[data-encours="true"] { background: #fdfaf1; border-bottom-color: #f0e4c6; }
        .tx-tete-nom { display: block; font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 800; font-size: 16px; color: var(--emilio); letter-spacing: -.2px; }
        .tx-tete-quoi { display: block; font-size: 12px; color: #8593a8; margin-top: 1px; }
        .tx-franchie { flex-shrink: 0; font-size: 11px; font-weight: 800; color: #a9822f;
          background: #fff; border: 1px solid #ecdcb4; border-radius: 99px; padding: 3px 10px; }

        .tx-corps { padding: 16px; display: flex; flex-direction: column; gap: 13px; }
        .tx-note { background: #f8fafc; border: 1px solid #eef2f7; border-radius: 10px;
          padding: 9px 13px; font-size: 12.5px; color: #55647a; line-height: 1.55; }
        .tx-ajout { background: #f8fafc; border: 1px dashed #d9e2ee; border-radius: 12px;
          padding: 12px 13px; display: flex; flex-direction: column; gap: 7px; }

        .tx-co { display: flex; align-items: center; gap: 10px; padding: 8px 12px;
          border-radius: 11px; border: 1px solid #e8edf5; background: #fff; font-size: 13.5px; }
        .tx-co[data-partie="acheteur"] { border-color: #dbe7fa; background: #f7fbff; }
        .tx-co[data-partie="vendeur"] { border-color: #fbe0e0; background: #fffafa; }
        .tx-co-qui { font-size: 12px; font-weight: 700; color: #55647a; flex-shrink: 0; }
        .tx-co b { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: 14.5px; color: var(--emilio); }
        .tx-co-x { background: none; border: none; cursor: pointer; color: #cbd5e1;
          font-size: 13px; padding: 2px 4px; line-height: 1; transition: color .15s; }
        .tx-co-x:hover { color: #ef4444; }

        .tx-alerte { border-radius: 10px; padding: 10px 13px; font-size: 12.5px; line-height: 1.55;
          background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
        .tx-alerte[data-ton="calme"] { background: #f8fafc; border-color: #e8edf5; color: #55647a; }
        .tx-alerte[data-ton="vert"] { background: #ecfdf5; border-color: #bbf7d0; color: #15803d; }
        .tx-alerte[data-ton="veille"] { background: #eef4fb; border-color: #d6e3f5; color: #2d5c8f; }

        .tx-pied { display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
          padding: 12px 16px; border-top: 1px solid #f1f5f9; background: #fbfcfe; }
        .tx-abandon { background: none; border: none; padding: 0; cursor: pointer;
          font-family: 'DM Sans', sans-serif; font-size: 12.5px; color: #a8b3c4; text-decoration: underline; }
        .tx-abandon:hover { color: #ef4444; }
        .tx-cloture { background: #10b981; color: #fff; border: none; border-radius: 10px;
          padding: 10px 20px; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700;
          font-size: 13.5px; cursor: pointer; transition: background .15s, transform .12s; }
        .tx-cloture:hover { background: #0ea271; transform: translateY(-1px); }
        .tx-cloture:disabled { opacity: .55; cursor: not-allowed; transform: none; }

        @media (max-width: 640px) {
          .tx-rond { width: 30px; height: 30px; font-size: 12.5px; }
          .tx-nom { font-size: 10px; }
          .tx-chiffre { flex-basis: 100%; }
        }
      `}</style>

        <StylesEmilio />

        <CorpsOnglet k={vue} ordre={ORDRE_VUES}>
        {vue === 'ensemble' && (
          <div className={styles.ens}>
            {/* À venir : la prochaine visite. La relance n'est plus répétée
                ici (V3.32) : elle est déjà dans le bandeau, et dans le Suivi. */}
            {(() => {
              const prochaine = visites
                .filter(v => v.statut === 'a_venir' && v.date_visite && String(v.date_visite).slice(0, 10) >= jourParis())
                .sort((x, y) => `${x.date_visite}${x.heure || ''}`.localeCompare(`${y.date_visite}${y.heure || ''}`))[0];
              if (!prochaine) return null;
              const bienV = prochaine ? biens.find(b => b.id === prochaine.bien_id) : null;
              const jourV = prochaine ? new Date(`${String(prochaine.date_visite).slice(0, 10)}T12:00:00`) : null;
              const libJour = jourV ? jourV.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
              return (
                <div className={styles.aVenir}>
                  {prochaine && (
                    <button type="button" className={styles.aVenirL} onClick={() => setTab('visites')}>
                      <span className={styles.aVenirIc}><Icone nom="calendrier" taille={16} epaisseur={2} /></span>
                      <span><b>{`Visite prévue ${libJour}${prochaine.heure ? ` à ${String(prochaine.heure).slice(0, 5).replace(':', ' h ')}` : ''}`}</b>{bienV?.titre ? ` · ${bienV.titre}` : ''}</span>
                    </button>
                  )}
                </div>
              );
            })()}
            {/* Elle arrive en glissant quand on clique « Ajouter » (V3.32). */}
            <Depliant ouvert={!!lireStructure(lirePro((client as unknown as { pro?: unknown }).pro).structure) || societeOuverte} ecart={16}>
              <BlocSociete key={cleSoc} client={client as never} notes={(client as unknown as { notes?: string | null }).notes}
                ouvrir={societeOuverte} onFermer={() => setSocieteOuverte(false)} onFiche={cl => onNavigate('fiche', cl)}
                onEnregistrer={async st => {
                  const pro = { ...lirePro((client as unknown as { pro?: unknown }).pro), structure: st || undefined };
                  const ok = await verifie('La société', supabase.from('clients').update({ pro }).eq('id', client.id).select('id'), { ligne: true });
                  if (ok) setClient(c0 => ({ ...c0, pro } as unknown as Client));
                  return ok;
                }} />
            </Depliant>
            <div className={styles.ensCols}>
              <div className={styles.ensCol}>
                {/* Ce qu'Alexandre a noté sur lui (V3.23). */}
                <CarteASavoir prenom={client.prenom || ''} texte={(client as unknown as { notes?: string | null }).notes}
                  onEnregistrer={async t => {
                    const ok = await verifie('Les infos sur le client', supabase.from('clients').update({ notes: t || null }).eq('id', client.id).select('id'), { ligne: true });
                    if (ok) setClient(c0 => ({ ...c0, notes: t || null } as Client));
                    return ok;
                  }} />
              </div>
              <div className={styles.ensCol}>
                {/* Sa situation : descendue du bloc bleu (V3.29), où elle
                    empiétait sur l'en-tête ; à droite depuis la V3.71, à la
                    place de « Sa recherche en bref » (Alexandre : « on a déjà
                    l'onglet Sa recherche »). Toujours là : sans rien de
                    renseigné, elle invite à le faire. */}
                {(() => {
                  const occ = client as any;
                  const vide = !occ.statut_occupation && !occ.bien_actuel_a_vendre;
                  const aVendre = !!occ.bien_actuel_a_vendre;
                  const labelStatut = ({ proprietaire: 'Propriétaire', locataire: 'Locataire', heberge: 'Hébergé', autre: 'Autre' } as any)[occ.statut_occupation] || occ.statut_occupation;
                  const champs: [string, React.ReactNode][] = [];
                  if (occ.statut_occupation) champs.push(['Statut', labelStatut]);
                  if (aVendre && occ.bien_actuel_type) champs.push(['Bien à revendre', `${occ.bien_actuel_type}${occ.bien_actuel_surface ? ` · ${occ.bien_actuel_surface} m²` : ''}`]);
                  if (aVendre && occ.bien_actuel_valeur) champs.push(['Valeur estimée', <b key="v" style={{ color: '#a9822f' }}>{`${occ.bien_actuel_valeur.toLocaleString('fr-FR')} €`}</b>]);
                  if (aVendre) champs.push(['Adresse du bien', occ.bien_actuel_adresse || 'Même adresse que le contact']);
                  return (
                    <div className={styles.carteEns}>
                      <div className={styles.carteEnsT}>
                        <span className={styles.carteEnsIc}><Icone nom="maison" taille={15} epaisseur={2} /></span>
                        <b>Sa situation</b>
                        <button type="button" onClick={() => { setCf(cfDe(client)); setShowContact(true); }}>{vide ? 'Renseigner' : 'Modifier'}</button>
                      </div>
                      {vide ? <p className={styles.situNotes}>{`Pas encore renseignée : propriétaire ou locataire, et revente possible après l’achat ou non.`}</p> : (
                        <div className={styles.situGrille}>
                          {champs.map(([l, v]) => (
                            <div key={l} className={styles.situChamp}><small>{l}</small><span>{v}</span></div>
                          ))}
                        </div>
                      )}
                      {aVendre && <span className={styles.situVente}><Icone nom="etiquette" taille={14} />{'Revente possible après l’achat'}</span>}
                      {aVendre && occ.bien_actuel_notes && <p className={styles.situNotes}>{occ.bien_actuel_notes}</p>}
                    </div>
                  );
                })()}
                {/* « Ses biens » n'est plus ici : il est dans le bandeau bleu (V3.84). */}
              </div>
            </div>
          </div>
        )}

        {vue === 'rapprochement' && (
          <div className={styles.ens}>
            {!rechercheActive ? <div className={styles.carteEns}><p className={styles.situNotes}>Le rapprochement part d’une recherche : ouvre-lui en une d’abord.</p></div> : (
              <>
                {bandeauRappro}
                <div className={styles.ensCols}>
                  <div className={styles.ensCol}>
                    <div className={styles.carteEns}>
                      <div className={styles.carteEnsT}>
                        <span className={styles.carteEnsIc}><Icone nom="maison" taille={15} epaisseur={2} /></span>
                        <b>Vos mandats qui lui correspondent</b>
                        {!!mandatsOk?.liste.length && (
                          <button type="button" onClick={() => { setRapproDepart({ source: 'mandats', cocher: mandatsOk.liste.map(m => m.id) }); setRappro(true); }}>Les lui proposer</button>
                        )}
                      </div>
                      {mandatsOk === null ? <p className={styles.situNotes}>Recherche dans vos mandats…</p> : mandatsOk.liste.length ? (
                        <div className={styles.rapproMandats}>
                          {mandatsOk.liste.map(m => (
                            <button key={m.id} type="button" className={styles.rapproMandat} onClick={() => onNavigate('biens', { bien: m.id })}>
                              <span className={styles.rapproMandatIc}><Icone nom="maison" taille={15} epaisseur={2} /></span>
                              <span className={styles.rapproMandatTx}><b>{m.titre}</b>{m.ville ? <small>{m.ville}</small> : null}</span>
                              <span className={styles.rapproNote}>{`${m.note} %`}</span>
                            </button>
                          ))}
                        </div>
                      ) : <p className={styles.situNotes}>{`Aucun de vos mandats en cours ne lui correspond assez (70 % de ses critères) pour l’instant. Le rapprochement cherche aussi dans les biens de vos veilles.`}</p>}
                    </div>
                  </div>
                  <div className={styles.ensCol}>
                    <div className={styles.carteEns}>
                      <div className={styles.carteEnsT}>
                        <span className={styles.carteEnsIc}><Icone nom="horloge" taille={15} epaisseur={2} /></span>
                        <b>Les rapprochements faits</b>
                        {rapprochements.length > 0 && <i className={styles.rapproCompte}>{rapprochements.length}</i>}
                      </div>
                      {rapprochements.length ? (
                        <div className={styles.derniers}>
                          {rapprochements.slice(0, 8).map(j => (
                            <div key={j.id} className={styles.dernier}>
                              <span className={styles.dernierQuand}>{jourRappro(j.created_at)}</span>
                              <span className={styles.rapproFait}><b>{`${j.metadata?.n ?? 0} bien${(j.metadata?.n ?? 0) > 1 ? 's' : ''} trouvé${(j.metadata?.n ?? 0) > 1 ? 's' : ''}`}</b>{j.description ? <small>{j.description}</small> : null}</span>
                            </div>
                          ))}
                        </div>
                      ) : <p className={styles.situNotes}>{`Aucun pour l’instant. Le premier compare la recherche de ${client.prenom || 'ce client'} avec vos mandats en cours et les biens trouvés par vos veilles.`}</p>}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {vue === 'espace' && (
          <div className={styles.ens}>
            {rechercheActive
              ? <LienEspace recherche={rechercheActive} client={client} />
              : <div className={styles.carteEns}><p className={styles.situNotes}>Son espace s’ouvre avec sa première recherche.</p></div>}
            {rechercheActive && (
              <div className={styles.carteEns}>
                <div className={styles.carteEnsT}>
                  <span className={styles.carteEnsIc}><Icone nom="envoyer" taille={15} epaisseur={2} /></span>
                  <b>{dejaAccueilli ? 'Prévenir de cette nouvelle recherche' : 'Le mail de bienvenue'}</b>
                </div>
                <p className={styles.situNotes}>{rechercheActive.bienvenue_envoye_le
                  ? `Envoyé le ${new Date(rechercheActive.bienvenue_envoye_le).toLocaleDateString('fr-FR')}.`
                  : dejaAccueilli
                    ? 'Elle a déjà son espace : ce mail lui dit que cette recherche s’y trouve aussi.'
                    : 'Son lien d’espace, et comment l’installer sur son téléphone pour recevoir les biens en notification.'}</p>
                {!rechercheActive.bienvenue_envoye_le && (
                  <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} style={{ alignSelf: 'flex-start' }} onClick={envoyerBienvenue} disabled={envoiBienvenue}>
                    {envoiBienvenue ? 'Envoi…' : dejaAccueilli ? 'Prévenir le client' : 'Envoyer le mail de bienvenue'}
                  </button>
                )}
                {aSonLien && (
                  <>
                    <p className={styles.situNotes} style={{ marginTop: 4 }}>Il ne retrouve plus son lien, ou dit ne pas l’avoir reçu ? Renvoie-le-lui : un mail court, avec le même lien.</p>
                    <button type="button" className={styles.btn} style={{ alignSelf: 'flex-start' }} onClick={renvoyerLien} disabled={envoiLien}>
                      {envoiLien ? 'Envoi…' : lienRenvoye ? '✓ Lien renvoyé' : '🔗 Renvoyer le lien'}
                    </button>
                  </>
                )}
              </div>
            )}
            {/* Le mail « Où en est votre recherche ? » (V3.17), sorti du bloc
                des critères : c'est un mail automatique, il vit avec l'espace. */}
            {client.id && <PointAuto clientId={client.id} integre />}
          </div>
        )}

        {vue === 'documents' && (
          <div className={styles.ens}>
            <DocumentsDuClient clientId={client.id} prenom={client.prenom} onNavigate={onNavigate} ouvert />
          </div>
        )}

        {vue === 'recherche' && (
          <>
        {/* LES CRITÈRES — sur toute la largeur depuis que le mandat est remonté */}
        <div className={styles.infoRow}>
          {/* coin supérieur gauche carré : c'est là que vient se poser le sélecteur */}
          <div className={styles.infoCard}>
            {/* Un seul en-tête. Le nom de la recherche EST le titre du bloc :
                plus rien ne flotte au-dessus, on voit que l'un commande l'autre. */}
            <div className={styles.critEntete}>
              <span className={styles.critFilet} />
              <span style={{ minWidth: 0 }}>
                <span className={styles.critSur}>
                  {recherches.length === 0 ? 'Aucune recherche' : recherches.length > 1 ? 'Recherche active' : 'Recherche principale'} · critères
                </span>
                <span className={styles.critLigne}>
                  <button className={styles.critNom} onClick={(ev) => {
                    if (posRecherche) { setPosRecherche(null); return; }
                    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                    setPosRecherche({ x: Math.max(12, Math.min(r.left, window.innerWidth - 292)), y: r.bottom + 7 });
                  }}>
                    {rechercheActive?.nom || 'Aucune recherche — en ouvrir une'}
                    <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>▾</span>
                  </button>
                  {rechercheActive && (
                    <button className={styles.critRenommer} onClick={() => renommerRecherche()}>Renommer</button>
                  )}
                  {rechercheActive && rechercheActive.active === false && (
                    <span className={styles.critPause} title="La veille ne cherche plus sur cette recherche">⏸️ Veille en pause</span>
                  )}
                </span>
              </span>

              <span style={{ flexGrow: 1 }} />

              {/* Le mandat quitte l'ivoire — qui appartient aux critères — pour
                  l'ardoise : c'est une information de dossier, pas de recherche. */}
              <button className={styles.critMandat} onClick={ouvrirMandat} title="Modifier le mandat"
                style={retracte ? { position: 'relative', borderColor: '#fecaca', background: '#fef2f2' } : { position: 'relative' }}>
                {retracte && !retracte.vu && (
                  <span aria-label="Nouveau" style={{ position: 'absolute', top: -7, right: -7, minWidth: 20, height: 20, borderRadius: 10, background: '#dc2626', color: '#fff', fontSize: 11.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px #fff' }}>1</span>
                )}
                <b style={retracte ? { color: '#991b1b' } : undefined}>📋 Mandat{cr.mandat_date_signature || cr.mandat_date_expiration ? '' : ' de recherche'}{cr.mandat_numero ? ` n° ${cr.mandat_numero}` : docMandat?.numero ? ` n° ${docMandat.numero}` : ''}</b>
                {retracte ? (
                  <>
                    <span style={{ color: '#991b1b' }}>{`${retracte.numero ? `n° ${retracte.numero} ` : ''}rétracté par le client${retracte.retracte_le ? ` le ${new Date(retracte.retracte_le).toLocaleDateString('fr-FR')}` : ''}`}</span>
                    <i style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>↩️ Rétracté</i>
                  </>
                ) : cr.mandat_date_signature || cr.mandat_date_expiration ? (
                  <>
                    <span>
                      {cr.mandat_date_signature ? new Date(cr.mandat_date_signature).toLocaleDateString('fr-FR') : 'Signature non datée'}
                      {cr.mandat_duree ? ` · ${cr.mandat_duree} mois` : ''}
                      {cr.mandat_honoraires ? ` · ${cr.mandat_honoraires}` : ''}
                    </span>
                    {joursMandat !== null && (
                      <i style={joursMandat > 15 ? undefined : joursMandat >= 0
                        ? { background: '#fffbeb', borderColor: '#fde68a', color: '#b45309' }
                        : { background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>
                        {joursMandat > 1 ? `${joursMandat} j restants` : joursMandat === 1 ? 'Dernier jour demain' : joursMandat === 0 ? 'Dernier jour' : '⚠️ Expiré'}
                      </i>
                    )}
                  </>
                ) : (
                  docMandat ? (
                    <>
                      <span>{docMandat.statut === 'pret'
                        ? (docMandat.signature ? 'envoyé, en attente de signature' : 'prêt, à faire signer')
                        : 'en préparation dans Documents'}</span>
                      <i style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#b45309' }}>{docMandat.statut === 'pret' ? 'À signer' : 'En préparation'}</i>
                    </>
                  ) : cr.mandat_propose_le ? (
                    <>
                      <span>proposé, en attente de signature</span>
                      <i style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#b45309' }}>À signer</i>
                    </>
                  ) : (
                    <>
                      <span>non renseigné</span>
                      <i>Remplir</i>
                    </>
                  )
                )}
              </button>

              <span className={styles.critOutils} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button className={styles.editBtn} onClick={ouvrirHistorique}
                  title="Ce que le client a changé ou demandé depuis son espace"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                    color: histoNonVus ? 'var(--emilio)' : undefined, fontWeight: histoNonVus ? 700 : 600 }}>
                  🕑 Historique client
                  {histoNonVus > 0 && (
                    <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                      background: '#ef4444', color: 'white', fontSize: 10.5, fontWeight: 800,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 0 0 3px rgba(239,68,68,.16)' }}>{histoNonVus}</span>
                  )}
                </button>
                {/* Le mail de mise en route. Il part une fois, à l'ouverture de
                    la recherche : c'est lui qui fait poser l'espace sur l'écran
                    d'accueil du client, et donc qui décide s'il recevra les
                    biens en notification ou s'il les découvrira trois jours
                    plus tard dans sa boîte mail.

                    Sur une DEUXIÈME recherche, le client a déjà son espace et
                    son application : le bouton ne lui renvoie pas un lien, il
                    lui annonce simplement que la nouvelle recherche est ouverte
                    au même endroit. */}
                <button className={styles.editBtn} onClick={envoyerBienvenue}
                  disabled={!!rechercheActive?.bienvenue_envoye_le || envoiBienvenue}
                  title={rechercheActive?.bienvenue_envoye_le
                    ? `Déjà envoyé le ${new Date(rechercheActive.bienvenue_envoye_le).toLocaleDateString('fr-FR')}. S’il ne l’a pas reçu : « Renvoyer le lien », juste à côté.`
                    : dejaAccueilli
                      ? 'Prévenir le client que cette nouvelle recherche est ouverte dans son espace'
                      : 'Envoyer au client son lien d’espace et l’inviter à l’installer sur son téléphone'}
                  style={rechercheActive?.bienvenue_envoye_le
                    ? { opacity: .45, cursor: 'default' }
                    : undefined}>
                  {envoiBienvenue ? '⏳ Envoi…'
                    : rechercheActive?.bienvenue_envoye_le
                      ? (dejaAccueilli ? '✓ Client prévenu' : '✓ Bienvenue envoyée')
                      : (dejaAccueilli ? '✉️ Prévenir le client' : '👋 Mail de bienvenue')}
                </button>
                {/* V3.110 : à côté, une fois le lien reçu, de quoi le renvoyer. */}
                {aSonLien && (
                  <button className={styles.editBtn} onClick={renvoyerLien} disabled={envoiLien}
                    title="Le client ne trouve plus son lien : lui renvoyer un mail court, avec le même lien">
                    {envoiLien ? '⏳ Envoi…' : lienRenvoye ? '✓ Lien renvoyé' : '🔗 Renvoyer le lien'}
                  </button>
                )}
                <button className={styles.editBtn} onClick={() => ouvrirCriteres()}>✏️ Modifier</button>
              </span>
            </div>

            {posRecherche && (
              <Portail>
                <div onClick={() => setPosRecherche(null)} style={{ position: 'fixed', inset: 0, zIndex: 190 }} />
                <div className="emilio-menu" style={{ position: 'fixed', left: posRecherche.x, top: posRecherche.y, zIndex: 191, width: 280, background: 'white', border: '1px solid #e3e8f0', borderRadius: 14, boxShadow: '0 3px 8px rgba(15,22,35,.06), 0 18px 44px rgba(15,22,35,.2)', overflow: 'hidden' }}>
                  {recherches.map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f4f7fb', background: r.id === rechercheId ? '#f8fafc' : 'white' }}>
                      <button onClick={() => { setRechercheId(r.id); setPosRecherche(null); setTab('presentes'); }} style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', padding: '11px 15px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <span style={{ fontSize: 14, fontWeight: r.id === rechercheId ? 800 : 600, color: 'var(--emilio)' }}>{r.nom}</span>
                        {r.id === rechercheId && <span style={{ color: '#10b981', fontSize: 13 }}>✓</span>}
                      </button>
                      {/* La corbeille est là même sur la dernière recherche :
                          l'espace du client ne meurt plus avec elle. */}
                      <button title="Supprimer cette recherche" onClick={() => { setPosRecherche(null); supprimerRecherche(r); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 14, padding: '0 14px', alignSelf: 'stretch' }} onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>🗑️</button>
                    </div>
                  ))}
                  <button onClick={() => { setPosRecherche(null); creerRecherche(); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', background: '#fbfcfe', cursor: 'pointer', fontFamily: 'inherit', color: '#2d5c8f', fontWeight: 700, fontSize: 13.5 }}>+ Nouvelle recherche</button>
                </div>
              </Portail>
            )}

            <div className={styles.infoCardBody}>
              {(cr.type_bien || cr.budget_min || cr.surface_min || cr.nb_pieces_min || cr.secteurs?.length || cr.dpe_max || cr.parking || cr.balcon || cr.terrasse || cr.jardin || cr.cave || cr.ascenseur || cr.cuisine_type || cr.etage_max_sans_ascenseur || Object.keys(cr.exigences || {}).length) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Le bandeau : le client et son enveloppe */}
                  <div className="fc-bandeau" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderRadius: 14, padding: '15px 18px', color: 'var(--emilio)', background: '#fdfaf1', border: '1px solid #ecdcb4' }}>
                    {cr.type_bien && <span style={CRIT_CHIP_FORT}>🏡 {cr.type_bien}</span>}
                    {cr.urgence && <span style={CRIT_CHIP}>⏱️ {texteChoix(URGENCES, cr.urgence)}</span>}
                    {cr.financement && <span style={CRIT_CHIP}>💳 {texteChoix(FINANCEMENTS, cr.financement)}</span>}
                    {cr.apport != null && <span style={CRIT_CHIP}>💰 Apport {cr.apport.toLocaleString('fr-FR')} €</span>}
                    <span style={{ flexGrow: 1 }} />
                    <span className="fc-budget" style={{ textAlign: 'right' }}>
                      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, color: '#b09a63', textTransform: 'uppercase', letterSpacing: 1.1 }}>Budget</span>
                      <span style={{ display: 'block', fontSize: 25, fontWeight: 800, color: '#a9822f', letterSpacing: -0.6, marginTop: 2 }}>
                        {cr.budget_min && cr.budget_max ? fourchetteBudget(cr.budget_min, cr.budget_max)
                          : cr.budget_max ? `Jusqu'à ${budgetLisible(cr.budget_max)}`
                            : cr.budget_min ? `À partir de ${budgetLisible(cr.budget_min)}`
                              : 'À préciser'}
                      </span>
                    </span>
                  </div>

                  <button type="button" className="fc-crit-bascule" onClick={() => setCritsOuverts(v => !v)}
                    aria-expanded={critsOuverts}>
                    <span>{critsOuverts ? 'Masquer le détail des critères' : 'Voir le détail des critères'}</span>
                    <span className="fc-crit-chevron" data-ouvert={critsOuverts ? 'true' : 'false'}><Icone nom="chevron" taille={15} epaisseur={2.2} /></span>
                  </button>

                  <div className="fc-crit-detail" data-ouvert={critsOuverts ? 'true' : 'false'} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Trois familles. Une colonne sans aucun critère renseigné
                      ne s'affiche pas — une case vide en dirait moins que rien. */}
                  {(() => {
                    const ordinal = (n: number) => n === 0 ? 'RDC' : n === 1 ? '1er' : `${n}e`;

                    const logement: LigneC[] = [];
                    if (cr.surface_min || cr.surface_max) logement.push({ lib: 'Surface', val: cr.surface_min && cr.surface_max ? `${cr.surface_min}–${cr.surface_max} m²` : cr.surface_max ? `${cr.surface_max} m² maximum` : <>{cr.surface_min} m²<Mini /></> });
                    if (cr.nb_pieces_min || cr.nb_pieces_max) logement.push({ lib: 'Pièces', val: cr.nb_pieces_min && cr.nb_pieces_max ? `${cr.nb_pieces_min}–${cr.nb_pieces_max}` : cr.nb_pieces_max ? `${cr.nb_pieces_max} maximum` : <>{cr.nb_pieces_min}<Mini /></> });
                    if (cr.chambres_min) logement.push({ lib: 'Chambres', val: <>{cr.chambres_min}<Mini fort /></>, fort: true });
                    if (cr.surface_sejour_min) logement.push({ lib: 'Séjour', val: <>{cr.surface_sejour_min} m²<Mini /></> });
                    if (texteEtats(cr.etat_souhaite)) logement.push({ lib: 'État', val: <span style={{ fontSize: 13.5 }}>{texteEtats(cr.etat_souhaite)}</span> });

                    const immeuble: LigneC[] = [];
                    if (cr.etage_min || cr.etage_max) immeuble.push({ lib: 'Étage', val: cr.etage_min && cr.etage_max ? `${ordinal(cr.etage_min)} – ${ordinal(cr.etage_max)}` : cr.etage_max ? `jusqu'au ${ordinal(cr.etage_max || 0)}` : `${ordinal(cr.etage_min || 0)} et plus` });
                    if (cr.rdc_exclu) immeuble.push({ lib: 'Rez-de-chaussée', val: <span style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 99, padding: '2px 9px', fontSize: 11.5, fontWeight: 700, color: '#b91c1c' }}>exclu</span> });
                    if (cr.dernier_etage) immeuble.push({ lib: 'Dernier étage', val: <span style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 99, padding: '2px 9px', fontSize: 11.5, fontWeight: 700, color: '#6d28d9' }}>recherché</span> });
                    if (cr.etage_max_sans_ascenseur) immeuble.push({ lib: 'Sans ascenseur', val: <span style={{ fontSize: 13.5 }}>{ordinal(cr.etage_max_sans_ascenseur || 0)} maximum</span> });
                    if (cr.annee_construction_min) immeuble.push({ lib: 'Construit après', val: cr.annee_construction_min });
                    if (cr.dpe_max) immeuble.push({ lib: 'DPE', val: <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 7, background: 'var(--emilio-fond)', color: '#fff', fontSize: 12.5, fontWeight: 800 }}>{cr.dpe_max}</span> });
                    if (cr.exposition_souhaitee) immeuble.push({ lib: 'Exposition', val: <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{cr.exposition_souhaitee.split(',').map((x: string) => x.trim()).filter(Boolean).map((x: string) => (
                      <span key={x} style={{ background: '#ecfdf5', color: '#0f766e', border: '1px solid #99f6e4', borderRadius: 20, padding: '2px 9px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>{ICONE_EXPO[x] || '🧭'} {x}</span>
                    ))}</span> });

                    const arrets = cr.transport_arrets || [];
                    const aTransport = arrets.length > 0 || !!cr.transport_minutes;

                    const ICO = (d: React.ReactNode, c: string) => (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
                    );

                    /* V3.104 — Tout en cartes, rangées selon ce qui est rempli. Alexandre :
                       « on voit la case du logement qui prend l'entièreté de l'écran » (la
                       surface à gauche, le métrage tout à droite), et « critères souhaités et
                       critères indispensables, comme ça on voit les choses à côté ». Les
                       rangées se font plus bas ; au téléphone, une colonne (crm-mobile.css,
                       .fc-familles). Les précisions restent dessous, sur toute la largeur. */
                    const ex = (cr.exigences || {}) as Record<string, string>;
                    const EQUIP: [string, string][] = [['parking','🅿️ Parking'],['balcon','🌿 Balcon'],['terrasse','☀️ Terrasse'],['jardin','🌳 Jardin'],['cave','📦 Cave'],['ascenseur','🛗 Ascenseur'],['gardien','👮 Gardien'],['interphone','🔔 Interphone'],['digicode','🔢 Digicode']];
                    const equip: { cle: string; texte: string; fort: boolean }[] = [];
                    EQUIP.forEach(([k, l]) => { if ((cr as any)[k] || ex[k]) equip.push({ cle: k, texte: l, fort: ex[k] === 'indispensable' }); });
                    if (ex.exterieur) equip.push({ cle: 'exterieur', texte: `🌤️ Extérieur${cr.exterieur_surface_min ? ` de ${cr.exterieur_surface_min} m² mini` : ''}`, fort: ex.exterieur === 'indispensable' });
                    if (cr.cuisine_type) equip.push({ cle: 'cuisine', texte: `${cr.cuisine_type === 'ouverte' ? '🍽️' : '🚪'} Cuisine ${cr.cuisine_type === 'ouverte' ? 'ouverte' : 'séparée'}`, fort: ex.cuisine === 'indispensable' });
                    const indispensables = equip.filter(e => e.fort), souhaites = equip.filter(e => !e.fort);

                    const ENTETE: React.CSSProperties = { padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 };
                    const TITRE = (couleur: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 800, color: couleur, textTransform: 'uppercase', letterSpacing: 0.9, whiteSpace: 'nowrap' });
                    const NOTE = (couleur: string): React.CSSProperties => ({ marginLeft: 'auto', minWidth: 0, fontSize: 11, fontWeight: 600, color: couleur, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
                    const PUCE_FORTE: React.CSSProperties = { background: 'var(--emilio-fond)', color: '#f2dfa6', border: '1px solid #c9a84c', padding: '4px 12px', borderRadius: 20, fontSize: 13.5, fontWeight: 700 };
                    const PUCE: React.CSSProperties = { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '4px 12px', borderRadius: 20, fontSize: 13.5, fontWeight: 600 };

                    const familles: React.ReactNode[] = [];
                    if (logement.length) familles.push(<FamilleCrit key="logement" titre="Le logement" couleur="#2d5c8f" fond="#eff4fb" trait="#d6e3f5" lignes={logement}
                      ico={ICO(<><path d="M3 21h18" /><path d="M5 21V9.5L12 4l7 5.5V21" /><path d="M10 21v-6h4v6" /></>, '#2d5c8f')} />);
                    if (immeuble.length) familles.push(<FamilleCrit key="immeuble" titre="L'immeuble" couleur="#6d28d9" fond="#f5f3ff" trait="#ddd6fe" lignes={immeuble}
                      ico={ICO(<><path d="M4 21V4h9v17" /><path d="M13 10h7v11" /><path d="M7 8h2" /><path d="M7 12h2" /><path d="M7 16h2" /></>, '#6d28d9')} />);
                    if (aTransport) familles.push(
                          <div key="transports" style={{ border: '1px solid #cbf0d8', borderRadius: 14, overflow: 'hidden' }}>
                            <div style={{ background: '#f0fdf4', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                              {ICO(<><path d="M7.5 4h9a3 3 0 0 1 3 3v6.5a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" /><path d="M4.5 10h15" /><path d="M8.5 16.5 6.5 20" /><path d="M15.5 16.5l2 3.5" /></>, '#15803d')}
                              <span style={{ fontSize: 11, fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: 0.9 }}>Les transports</span>
                            </div>
                            <div style={{ padding: '11px 14px 13px' }}>
                              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 10 }}>Temps de marche accepté :</div>
                              {arrets.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                                  {arrets.map((a: any, k: number) => (
                                    <div key={(a.nom || '') + k} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                                      <span style={{ flexShrink: 0, width: 46, height: 46, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #86e0a8', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                                        <span style={{ fontSize: 16, fontWeight: 800, color: '#15803d' }}>{a.minutes || cr.transport_minutes || 10}</span>
                                        <span style={{ fontSize: 8, fontWeight: 800, color: '#4f9d6b', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 }}>min</span>
                                      </span>
                                      <span style={{ flexGrow: 1, minWidth: 0 }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                          {(a.lignes || []).slice(0, 4).map((l: string) => <PastilleArret key={l} id={l} t={22} />)}
                                          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--emilio)' }}>{a.nom}</span>
                                        </span>
                                        <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 3 }}>à pied{a.ville ? ` · ${a.ville}` : ''}</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                                  <span style={{ flexShrink: 0, width: 46, height: 46, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #86e0a8', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                                    <span style={{ fontSize: 16, fontWeight: 800, color: '#15803d' }}>{cr.transport_minutes}</span>
                                    <span style={{ fontSize: 8, fontWeight: 800, color: '#4f9d6b', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 }}>min</span>
                                  </span>
                                  <span style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: 'var(--emilio)' }}>à pied maximum</span>
                                    <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 3 }}>d'un transport en commun</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                    );
                    const carteSecteurs = cr.secteurs?.length > 0 ? (
                      <div key="secteurs" style={{ border: '1px solid #efe2bf', borderRadius: 14, overflow: 'hidden' }}>
                        <div style={{ ...ENTETE, background: '#fbf6e9' }}>
                          {ICO(<><path d="M12 21.5S19 15 19 10a7 7 0 1 0-14 0c0 5 7 11.5 7 11.5z" /><circle cx="12" cy="10" r="2.6" /></>, '#a07c28')}
                          <span style={TITRE('#a07c28')}>Secteurs recherchés</span>
                        </div>
                        <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                          <SecteursListe secteurs={cr.secteurs} />
                        </div>
                      </div>
                    ) : null;
                    const carteIndispensables = indispensables.length ? (
                      <div key="indispensables" style={{ border: '1px solid #c9a84c', borderRadius: 14, overflow: 'hidden' }}>
                        <div style={{ ...ENTETE, background: 'var(--emilio-fond)' }}>
                          {ICO(<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />, '#e8c96a')}
                          <span style={TITRE('#f2dfa6')}>Indispensables</span>
                          <span style={NOTE('rgba(242,223,166,.62)')} title="Un bien qui ne les a pas n’est pas envoyé">sinon, pas d’envoi</span>
                        </div>
                        <div style={{ padding: '12px 14px 14px', display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                          {indispensables.map(e => <span key={e.cle} style={PUCE_FORTE}>{e.texte}</span>)}
                        </div>
                      </div>
                    ) : null;
                    const carteSouhaites = souhaites.length ? (
                      <div key="souhaites" style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
                        <div style={{ ...ENTETE, background: '#f8fafc' }}>
                          {ICO(<><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.2 2.4 2.4 4.6-4.9" /></>, '#16a34a')}
                          <span style={TITRE('#475569')}>Souhaités</span>
                          <span style={NOTE('#94a3b8')}>un plus</span>
                        </div>
                        <div style={{ padding: '12px 14px 14px', display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                          {souhaites.map(e => <span key={e.cle} style={PUCE}>{e.texte}</span>)}
                        </div>
                      </div>
                    ) : null;
                    /* Les rangées. Les familles en haut ; dessous, les souhaités, les
                       indispensables et les secteurs, au bout à droite (Alexandre : « mettre
                       le secteur à la fin, à droite, quand tout est rempli »). Trois
                       cartes ou moins : une seule rangée. Jamais une carte seule sur sa
                       rangée quand l'autre peut en céder une : un logement seul garde les
                       secteurs à côté de lui, des secteurs seuls dessous prennent les
                       transports avec eux (2 + 2). */
                    const dessous = [carteSouhaites, carteIndispensables, carteSecteurs].filter(Boolean) as React.ReactNode[];
                    const tout = [...familles, ...dessous];
                    if (!tout.length) return null;
                    let rangees: React.ReactNode[][];
                    if (tout.length <= 3) rangees = [tout];
                    else {
                      const haut = [...familles], bas = [...dessous];
                      if (haut.length === 1) haut.push(bas.pop()!);
                      if (bas.length === 1) bas.unshift(haut.pop()!);
                      rangees = [haut, bas];
                    }

                    return (
                      <>
                        {rangees.map((r, k) => (
                          <div key={k} className="fc-familles" style={{ display: 'grid', gridTemplateColumns: `repeat(${r.length}, minmax(0, 1fr))`, gap: 12 }}>
                            {r}
                          </div>
                        ))}
                      </>
                    );
                  })()}

                  {/* Notes */}
                  {cr.notes && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 14px', borderLeft: '4px solid #c9a84c' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>💬 Précisions sur la recherche</div>
                      <div style={{ fontSize: 14, color: 'var(--emilio)', lineHeight: 1.6 }}>{cr.notes}</div>
                    </div>
                  )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>Aucun critère défini</span>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => ouvrirCriteres()}>+ Définir</button>
                </div>
              )}
            </div>
            {/* Le mail « Où en est votre recherche ? » : quand il partira, ce que
                le client a répondu, et l'interrupteur pour l'exclure. Dans le
                bloc de la recherche, en pied (V3.17) : plus de blanc entre les deux. */}
          </div>

        </div>



        <div className="fiche-suivi">
          <div className="fiche-suivi-tete">
            <b>Où en est la recherche</b>
            <i>de la veille à la transaction</i>
            {rechercheActive && (
              <button type="button" className="fiche-suivi-rappro" onClick={() => setRappro(true)}
                title="Chercher des biens pour ce client dans vos mandats et vos veilles">
                <Icone nom="etoile" taille={13} epaisseur={2.2} />{' '}Faire un rapprochement
              </button>
            )}
            {rechercheActive && (
              <button type="button" className="fiche-suivi-reinit" onClick={ouvrirReinit}
                title="Effacer tout le suivi et repartir sur une veille neuve">
                ♻️ Réinitialiser le suivi
              </button>
            )}
          </div>
          <Onglets items={TABS} actif={tab} onChange={setTab} sombre />
        </div>

        <div key={`${rechercheId}-${tab}`} className="fiche-tab">

        {/* TAB BIENS */}
        {tab === 'biens' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {biens.length === 0 ? (
              <div className={styles.emptyTab}><div style={{ fontSize: 40, marginBottom: 12 }}>🏠</div><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 17, color: 'var(--emilio)', marginBottom: 6 }}>Aucun bien proposé</div><div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 18 }}>Collez une URL d'annonce SeLoger, LeBonCoin, PAP...</div><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowBien(true)}>+ Ajouter un bien par URL</button></div>
            ) : biens.map(b => {
              const badge = BADGES[b.badge_retour] || BADGES.propose;
              const visitesBien = visites
                .filter(v => v.bien_id === b.id && v.statut === 'effectuee')
                .sort((a, c) => (c.date_visite || '').localeCompare(a.date_visite || ''));
              const cr = visitesBien[0];
              const avis = cr?.avis_client ? AVIS_CR[cr.avis_client] : null;
              return (
                <div key={b.id} className={styles.bienCard}>
                  <div className={styles.bienPhoto}>{b.photos?.[0] ? <img src={b.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🏠'}</div>
                  <div className={styles.bienBody}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 5 }}>
                      <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--emilio)' }}>{b.titre || `${b.type_bien||'Bien'} — ${b.ville||'—'}`}</div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 17, color: '#c9a84c' }}>{b.prix_acquereur ? `${b.prix_acquereur.toLocaleString('fr-FR')}€` : '—'}</div>
                        {b.prix_vendeur && b.commission_val && (
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                            {b.prix_vendeur.toLocaleString('fr-FR')}€ + {b.commission_type === 'pourcentage' ? `${b.commission_val}%` : `${b.commission_val.toLocaleString('fr-FR')}€`}{' '}commission
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#64748b', marginBottom: 10, flexWrap: 'wrap' }}>
                      {b.surface && <span>📐 {b.surface}m²</span>}{b.nb_pieces && <span>🚪 {b.nb_pieces}P</span>}{b.etage && <span>🏢 {b.etage}ème</span>}{b.parking && <span>🅿️</span>}{b.dpe && <span>🌿 {b.dpe}</span>}{b.ville && <span>📍 {b.ville}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select value={b.badge_retour} onChange={e => changeBadge(b.id, e.target.value)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, border: `1px solid ${badge.color}30`, background: badge.bg, color: badge.color, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {Object.entries(BADGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      {b.source_portail && <span style={{ fontSize: 12, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>{b.source_portail}</span>}
                      {b.url && <a href={b.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none' }}>🔗 Annonce</a>}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button onClick={() => openFicheBien(b.id)} style={{ fontSize: 12, background: '#f8fafc', color: 'var(--emilio)', border: '1px solid #e2e8f0', padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>✏️ Détail</button>
                        <button onClick={() => openEnvoiBien(b.id)} style={{ fontSize: 12, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a', padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>📤 Envoyer</button>
                        <button onClick={() => planifierVisite(b.id)} style={{ fontSize: 12, background: '#f5f3ff', color: '#8b5cf6', border: '1px solid #ddd6fe', padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>📅 Visite</button>
                        {b.pdf_statut === 'pret' && b.pdf_url ? (
                          <a href={b.pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, background: 'var(--emilio-fond)', color: 'white', border: '1px solid var(--emilio)', padding: '4px 12px', borderRadius: 20, fontWeight: 600, textDecoration: 'none' }}>📄 Fiche client</a>
                        ) : b.pdf_statut === 'demande' ? (
                          <span style={{ fontSize: 12, background: '#fdfaf1', color: '#a17d2c', border: '1px solid #ecdcb4', padding: '4px 12px', borderRadius: 20, fontWeight: 600 }}>⏳ Fiche en attente</span>
                        ) : (
                          <button onClick={() => demanderPdf(b.id)} style={{ fontSize: 12, background: '#f8fafc', color: 'var(--emilio)', border: '1px solid #e2e8f0', padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>📄 Demander une fiche soignée</button>
                        )}
                      </div>
                    </div>
                    {cr && (
                      <div style={{ marginTop: 12, background: '#f6faf7', border: '1px solid #d6ebdd', borderRadius: 12, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: cr.commentaire ? 8 : 0, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: '#10b981' }}>📋 Compte-rendu de visite</span>
                            {cr.date_visite && <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(cr.date_visite).toLocaleDateString('fr-FR')}</span>}
                            {visitesBien.length > 1 && <span style={{ fontSize: 11, color: '#94a3b8' }}>{`· ${visitesBien.length} visites faites`}</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {cr.note_etoiles > 0 && <span style={{ fontSize: 13 }}>{'⭐'.repeat(cr.note_etoiles)}<span style={{ fontSize: 11, color: '#94a3b8' }}> {cr.note_etoiles}/5</span></span>}
                            {avis && <span style={{ fontSize: 12, fontWeight: 700, color: avis.color, background: avis.bg, border: `1px solid ${avis.color}25`, padding: '3px 10px', borderRadius: 20 }}>{avis.label}</span>}
                          </div>
                        </div>
                        {cr.commentaire && <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.55 }}>{cr.commentaire}</div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB VISITES — les mêmes rubriques que « Vos visites » dans son espace */}
        {tab === 'visites' && (
          <OngletVisites visites={visites} biens={biens} prenom={client.prenom || ''}
            masques={((rechercheActive as any)?.appris_masques as string[] | null) || []}
            rechercheId={rechercheId}
            onCompteRendu={(v: any) => setCrVisite(v)} onAnnuler={annulerVisite}
            onRecharger={load} onMasques={loadRecherches} />
        )}

        {/* ═══ TAB TRANSACTION ═══ */}
        {tab === 'transaction' && (
          !transaction
            ? (() => {
                /* L'ancien écran disait quoi faire ailleurs. Celui-ci le fait.
                   V3.50 : les mandats de l'agence visités ne se proposent pas
                   ici — ils se suivent sur la fiche du bien. */
                const visites_ = biensPourTx();
                const agence = biensVisites().filter(b => b.bien_vente_id);
                return (
                  <div className={styles.emptyTab} style={{ padding: '46px 24px' }}>
                    <div style={{ fontSize: 40, marginBottom: 14 }}>💼</div>
                    <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 18, color: 'var(--emilio)', marginBottom: 6 }}>
                      Aucune transaction en cours
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 20, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55 }}>
                      {visites_.length > 0
                        ? `Une transaction suit un bien de l'offre jusqu'à l'acte. ${visites_.length} bien${visites_.length > 1 ? 's ont' : ' a'} été visité${visites_.length > 1 ? 's' : ''} — c'est parmi ${visites_.length > 1 ? 'eux' : 'lui'} que ça se joue.`
                        : agence.length > 0
                          ? `Une transaction suit un bien de l'offre jusqu'à l'acte. ${agence.length > 1 ? 'Les biens qu’il a visités sont des mandats de l’agence' : 'Le bien qu’il a visité est un mandat de l’agence'} : tout se passe sur la fiche du bien.`
                          : "Une transaction suit un bien de l'offre jusqu'à l'acte. Planifiez d'abord une visite : on n'écrit pas une offre sur un bien que le client n'a pas vu."}
                    </div>
                    {agence.length > 0 && (
                      <div style={{ maxWidth: 560, margin: '0 auto 6px' }}>
                        {agence.map(b => (
                          <CarteMandatAgence key={b.id} titre={b.titre || b.ville || null}
                            onOuvrir={() => onNavigate('biens', { bien: b.bien_vente_id })} />
                        ))}
                      </div>
                    )}
                    {visites_.length > 0 && (
                      <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving} onClick={() => setShowChoixTx('creer')}>
                        + Créer une transaction
                      </button>
                    )}
                  </div>
                );
              })()
            : (() => {
                const tx: any = { ...transaction, ...txData };
                const bienTx = biens.find(b => b.id === tx.bien_id);
                const fini = tx.etape_actuelle === 'finalise';
                const idxCourant = fini ? ETAPES_TX.length : ORDRE_ETAPES.indexOf(tx.etape_actuelle);

                /* On regarde l'étape en cours par défaut. Le rail permet de
                   revenir voir — et corriger — une étape franchie, sans rien
                   défaire : c'est une lecture, pas un retour en arrière. */
                const vue = (vueEtape && ORDRE_ETAPES.indexOf(vueEtape) <= idxCourant)
                  ? vueEtape : (fini ? null : tx.etape_actuelle);
                const eVue = ETAPES_TX.find(x => x.cle === vue);
                const enCours = !!vue && vue === tx.etape_actuelle;

                const co: any[] = Array.isArray(tx.contre_offres) ? tx.contre_offres : [];
                const derniere = co.length ? co[co.length - 1] : null;
                const offre = lireMontant(tx.offre_montant);
                const prixFinal = lireMontant(tx.prix_final);
                const hono = lireMontant(tx.honoraires_ht);
                const ecart = (prixFinal !== null && offre !== null) ? prixFinal - offre : null;
                const sruJ = tx.sru_date_fin
                  ? Math.ceil((new Date(`${tx.sru_date_fin}T23:59:59`).getTime() - Date.now()) / 86400000)
                  : null;
                const eur = (n: number) => `${n.toLocaleString('fr-FR')} €`;
                const jourFr = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR');

                /* Les chiffres du dossier, toujours sous les yeux : avant, il
                   fallait déplier chaque étape pour retrouver le montant de
                   l'offre ou le prix retenu. */
                const chiffres: any[] = [];
                if (offre !== null) chiffres.push({ k: 'Offre initiale', v: eur(offre), d: tx.offre_date ? jourFr(tx.offre_date) : null, c: '#a9822f' });
                if (derniere) {
                  const m = lireMontant(derniere.montant);
                  chiffres.push({ k: 'Dernière contre-offre', v: m !== null ? eur(m) : '—', d: derniere.partie === 'acheteur' ? 'de votre client' : 'du vendeur', c: '#2d5c8f' });
                }
                if (prixFinal !== null) chiffres.push({ k: 'Prix retenu', v: eur(prixFinal), d: ecart !== null ? `${ecart > 0 ? '+' : ''}${eur(ecart)} vs offre` : null, c: '#15803d' });
                if (hono !== null) chiffres.push({ k: 'Honoraires', v: `${eur(hono)} HT`, d: `${eur(Math.round(hono * 1.2 * 100) / 100)} TTC`, c: 'var(--emilio)' });

                const SUIVANT: Record<string, { label: string; vers: string }> = {
                  offre:          { label: '→ Passer en négociation', vers: 'negociation' },
                  negociation:    { label: '✓ Offre acceptée',        vers: 'offre_acceptee' },
                  offre_acceptee: { label: '→ Passer au compromis',   vers: 'compromis' },
                  compromis:      { label: "→ Passer à l'acte",       vers: 'acte' },
                };

                return (
                  <div>
                    {/* ── Le bien dont il est question ── */}
                    {bienTx ? (
                      <div className="tx-bien">
                        <span className="tx-photo">
                          {bienTx.photos?.[0] ? <img src={bienTx.photos[0]} alt="" /> : '🏠'}
                        </span>
                        <span style={{ flexGrow: 1, minWidth: 0 }}>
                          <span className="tx-sur">Bien de la transaction</span>
                          <span className="tx-titre">{bienTx.titre || `${bienTx.type_bien || 'Bien'} — ${bienTx.ville || '—'}`}</span>
                          <span className="tx-detail">{[bienTx.surface && `${bienTx.surface} m²`, bienTx.nb_pieces && `${bienTx.nb_pieces}P`, bienTx.ville].filter(Boolean).join(' · ') || '—'}</span>
                        </span>
                        {bienTx.prix_acquereur ? (
                          <span style={{ textAlign: 'right', flexShrink: 0 }}>
                            <span className="tx-sur">Prix affiché</span>
                            <span style={{ display: 'block', fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 17, color: '#a9822f' }}>
                              {eur(bienTx.prix_acquereur)}
                            </span>
                          </span>
                        ) : null}
                        {tx.etape_actuelle === 'offre' && biensPourTx().some(b => b.id !== tx.bien_id) && (
                          <button className={styles.btn} style={{ fontSize: 12, flexShrink: 0 }}
                            onClick={() => setShowChoixTx('changer')}>Changer de bien</button>
                        )}
                      </div>
                    ) : (
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
                        ⚠️ Aucun bien associé à cette transaction.
                        {biensPourTx().length > 0 && (
                          <button className={styles.btn} style={{ marginLeft: 10, fontSize: 12 }}
                            onClick={() => setShowChoixTx('changer')}>Choisir un bien</button>
                        )}
                      </div>
                    )}
                    {/* V3.50 : une transaction ouverte avant sur un mandat de
                        l'agence reste visible ; la vente, elle, se suit sur la
                        fiche du bien (et n'y compte qu'une fois). */}
                    {bienTx?.bien_vente_id && (
                      <CarteMandatAgence onOuvrir={() => onNavigate('biens', { bien: bienTx.bien_vente_id })} />
                    )}

                    {/* ── Le rail : où on en est, et où on peut revenir ── */}
                    <div className="tx-rail">
                      {ETAPES_TX.map((e, i) => {
                        const fait = i < idxCourant;
                        const ici = i === idxCourant && !fini;
                        const etat = fait ? 'fait' : ici ? 'encours' : 'avenir';
                        return (
                          <button key={e.cle} type="button" className="tx-pas"
                            data-etat={etat} data-vue={e.cle === vue ? 'true' : 'false'}
                            disabled={i > idxCourant}
                            title={i > idxCourant ? 'Étape pas encore atteinte' : e.quoi}
                            onClick={() => setVueEtape(e.cle)}>
                            <span className="tx-fil">
                              <i className={i === 0 ? 'vide' : (i <= idxCourant ? 'on' : '')} />
                              <span className="tx-rond">{fait ? '✓' : e.icone}</span>
                              <i className={i === ETAPES_TX.length - 1 ? 'vide' : (i < idxCourant ? 'on' : '')} />
                            </span>
                            <span className="tx-nom">{e.nom}</span>
                          </button>
                        );
                      })}
                    </div>

                    {chiffres.length > 0 && (
                      <div className="tx-chiffres">
                        {chiffres.map((c, i) => (
                          <span key={i} className="tx-chiffre">
                            <b>{c.k}</b>
                            <strong style={{ color: c.c }}>{c.v}</strong>
                            {c.d ? <i>{c.d}</i> : null}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* ── Le dossier est clos ── */}
                    {fini ? (
                      <div className="tx-panneau" style={{ background: 'linear-gradient(140deg, #ecfdf5, #f0fdf4)', border: '1px solid #bbf7d0', borderRadius: 16, padding: '28px 22px', textAlign: 'center' }}>
                        <div style={{ fontSize: 42, marginBottom: 8 }}>🎉</div>
                        <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 19, color: '#15803d' }}>
                          Acte signé — dossier clos
                        </div>
                        <div style={{ fontSize: 13, color: '#4d7c5f', marginTop: 6, lineHeight: 1.55, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
                          La veille est arrêtée sur cette recherche et les relances en attente ont été soldées.
                          {tx.acte_date_prevue ? ` Acte du ${jourFr(tx.acte_date_prevue)}.` : ''}
                        </div>
                        {/* V3.50 : une vente sans honoraires ne compte pas dans le CA — on le dit ici. */}
                        {!(hono !== null && hono > 0) && (
                          <div style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', marginTop: 12, lineHeight: 1.5, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
                            {'Les honoraires ne sont pas renseignés : cette vente ne compte pas dans ton chiffre d’affaires. Ajoute-les dans « Revoir le dossier ».'}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 9, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
                          <button className={styles.btn} onClick={() => setVueEtape('acte')}>Revoir le dossier</button>
                          <button className={styles.btn} onClick={reculerEtape}>↩️ Rouvrir la transaction</button>
                        </div>
                      </div>
                    ) : null}

                    {/* ── L'étape regardée ── */}
                    {eVue && (
                      <div key={eVue.cle} className="tx-panneau">
                        <div className="tx-tete" data-encours={enCours ? 'true' : 'false'}>
                          <span style={{ fontSize: 21 }}>{eVue.icone}</span>
                          <span style={{ minWidth: 0 }}>
                            <span className="tx-tete-nom">{eVue.nom}</span>
                            <span className="tx-tete-quoi">{eVue.quoi}</span>
                          </span>
                          <span style={{ flexGrow: 1 }} />
                          {!enCours && <span className="tx-franchie">✓ Étape franchie</span>}
                        </div>

                        <div className="tx-corps">
                          {eVue.cle === 'offre' && (
                            <>
                              <div className={styles.formRow}>
                                <div>
                                  <label className={styles.lbl}>Montant de l'offre €</label>
                                  <input className={styles.inp} type="text" inputMode="decimal" placeholder="Ex : 350 000"
                                    defaultValue={champMontant(transaction.offre_montant)} onBlur={remettreEnForme}
                                    onChange={e => saveTxField('offre_montant', lireMontant(e.target.value))} />
                                </div>
                                <div>
                                  <label className={styles.lbl}>Date de l'offre</label>
                                  <input className={styles.inp} type="date" defaultValue={transaction.offre_date || ''}
                                    onChange={e => saveTxField('offre_date', e.target.value || null)} />
                                </div>
                              </div>
                              {bienTx?.prix_acquereur && offre !== null && (
                                <div className="tx-note">
                                  {offre === bienTx.prix_acquereur
                                    ? "L'offre est au prix affiché."
                                    : `${eur(Math.abs(bienTx.prix_acquereur - offre))} ${offre < bienTx.prix_acquereur ? 'sous' : 'au-dessus du'} prix affiché — soit ${Math.abs(Math.round((offre - bienTx.prix_acquereur) / bienTx.prix_acquereur * 1000) / 10)} %.`}
                                </div>
                              )}
                            </>
                          )}

                          {eVue.cle === 'negociation' && (
                            <>
                              {co.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                  {co.map((c: any, i: number) => {
                                    const m = lireMontant(c.montant);
                                    const acheteur = c.partie === 'acheteur';
                                    return (
                                      <div key={i} className="tx-co" data-partie={c.partie}>
                                        <span className="tx-co-qui">{acheteur ? '🏠 Votre client' : '🏢 Le vendeur'}</span>
                                        <b>{m !== null ? eur(m) : '—'}</b>
                                        <span style={{ color: '#94a3b8', fontSize: 12.5 }}>{c.date ? jourFr(c.date) : ''}</span>
                                        <span style={{ flexGrow: 1 }} />
                                        <button className="tx-co-x" title="Supprimer cette contre-offre"
                                          onClick={() => supprimerContreOffre(i)}>✕</button>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="tx-note">Aucune contre-offre pour l'instant. Notez-les au fur et à mesure : c'est l'historique du bras de fer.</div>
                              )}

                              {enCours && (
                                <div className="tx-ajout">
                                  <label className={styles.lbl}>Ajouter une contre-offre</label>
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <select className={styles.inp} style={{ width: 150, flexShrink: 0 }}
                                      value={coForm.partie} onChange={e => setCoForm(f => ({ ...f, partie: e.target.value }))}>
                                      <option value="vendeur">🏢 Le vendeur</option>
                                      <option value="acheteur">🏠 Votre client</option>
                                    </select>
                                    <input className={styles.inp} type="text" inputMode="decimal" placeholder="Montant €" style={{ flex: '1 1 130px' }}
                                      value={coForm.montant} onChange={e => setCoForm(f => ({ ...f, montant: e.target.value }))}
                                      onKeyDown={e => { if (e.key === 'Enter') ajouterContreOffre(); }} />
                                    <input className={styles.inp} type="date" style={{ width: 160, flexShrink: 0 }}
                                      value={coForm.date} onChange={e => setCoForm(f => ({ ...f, date: e.target.value }))} />
                                    <button className={styles.btn} disabled={!lireMontant(coForm.montant)}
                                      onClick={ajouterContreOffre}>+ Ajouter</button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}

                          {eVue.cle === 'offre_acceptee' && (
                            <>
                              <div>
                                <label className={styles.lbl}>Prix final accepté €</label>
                                <input className={styles.inp} type="text" inputMode="decimal" placeholder="Ex : 345 000"
                                  key={`pf-${transaction.prix_final ?? ''}`}
                                  defaultValue={champMontant(transaction.prix_final)} onBlur={remettreEnForme}
                                  onChange={e => saveTxField('prix_final', lireMontant(e.target.value))} />
                              </div>
                              {enCours && derniere && lireMontant(derniere.montant) !== null && lireMontant(derniere.montant) !== prixFinal && (
                                <button className={styles.btn} style={{ alignSelf: 'flex-start', fontSize: 12.5 }}
                                  onClick={async () => { const m = lireMontant(derniere.montant); saveTxField('prix_final', m); await flushTx(); load(); }}>
                                  Reprendre la dernière contre-offre ({eur(lireMontant(derniere.montant) as number)})
                                </button>
                              )}
                              {ecart !== null && (
                                <div className="tx-note">
                                  {ecart === 0 ? "Le prix retenu est celui de l'offre initiale."
                                    : `${eur(Math.abs(ecart))} ${ecart > 0 ? 'de plus' : 'de moins'} que l'offre initiale.`}
                                </div>
                              )}
                            </>
                          )}

                          {eVue.cle === 'compromis' && (
                            <>
                              <div className={styles.formRow}>
                                <div>
                                  <label className={styles.lbl}>Date du compromis</label>
                                  <input className={styles.inp} type="date" defaultValue={transaction.compromis_date || ''}
                                    onChange={e => {
                                      const j = e.target.value;
                                      saveTxField('compromis_date', j || null);
                                      saveTxField('sru_date_fin', j ? finSRU(j) : null);
                                    }} />
                                </div>
                                <div>
                                  <label className={styles.lbl}>Notaire</label>
                                  <input className={styles.inp} placeholder="Me Dupont…" defaultValue={transaction.compromis_notaire || ''}
                                    onChange={e => saveTxField('compromis_notaire', e.target.value || null)} />
                                </div>
                              </div>
                              <div className={styles.formRow}>
                                <div>
                                  <label className={styles.lbl}>Montant du prêt €</label>
                                  <input className={styles.inp} type="text" inputMode="decimal" defaultValue={champMontant(transaction.pret_montant)} onBlur={remettreEnForme}
                                    onChange={e => saveTxField('pret_montant', lireMontant(e.target.value))} />
                                </div>
                                <div>
                                  <label className={styles.lbl}>Apport €</label>
                                  <input className={styles.inp} type="text" inputMode="decimal" defaultValue={champMontant(transaction.pret_apport)} onBlur={remettreEnForme}
                                    onChange={e => saveTxField('pret_apport', lireMontant(e.target.value))} />
                                </div>
                              </div>
                              {tx.sru_date_fin && (
                                <div className="tx-alerte" data-ton={sruJ !== null && sruJ > 0 ? 'ambre' : 'calme'}>
                                  ⏰ Rétractation SRU possible jusqu'au <b>{jourFr(tx.sru_date_fin)}</b>
                                  {sruJ !== null && (sruJ > 0 ? ` — encore ${sruJ} jour${sruJ > 1 ? 's' : ''}.` : ' — le délai est passé.')}
                                </div>
                              )}
                              {enCours && rechercheActive?.active === false && (
                                <div className="tx-alerte" data-ton="veille">
                                  ⏸️ La veille est en pause sur cette recherche depuis le compromis. Elle reprendra si vous revenez à l'étape précédente.
                                </div>
                              )}
                            </>
                          )}

                          {eVue.cle === 'acte' && (
                            <>
                              <div className={styles.formRow}>
                                <div>
                                  <label className={styles.lbl}>Date de l'acte</label>
                                  <input className={styles.inp} type="date" defaultValue={transaction.acte_date_prevue || ''}
                                    onChange={e => saveTxField('acte_date_prevue', e.target.value || null)} />
                                </div>
                                <div>
                                  <label className={styles.lbl}>Honoraires HT €</label>
                                  {/* V3.50 : un champ texte lu par lireMontant — « 8 333,33 »
                                      devenait 833 333 € (et rien du tout sous Firefox ou Safari). */}
                                  <input className={styles.inp} type="text" inputMode="decimal" placeholder="Ex : 8 333,33"
                                    defaultValue={champMontant(transaction.honoraires_ht)} onBlur={remettreEnForme}
                                    onChange={e => {
                                      const n = lireMontant(e.target.value);
                                      saveTxField('honoraires_ht', n);
                                      saveTxField('honoraires_ttc', n === null ? null : Math.round(n * 1.2 * 100) / 100);
                                    }} />
                                </div>
                              </div>
                              {hono !== null && (
                                <div className="tx-alerte" data-ton="vert">
                                  💰 Honoraires TTC : <b>{eur(Math.round(hono * 1.2 * 100) / 100)}</b>
                                </div>
                              )}
                              {enCours && (
                                <div className="tx-note">
                                  {/* V3.50 : un client à plusieurs recherches n'est clos que si plus rien ne tourne. */}
                                  {recherches.some(r => r.id !== rechercheId && r.active !== false)
                                    ? 'Clôturer ici, c’est fermer cette recherche : sa veille s’arrête et ses relances sont soldées. Ses autres recherches continuent.'
                                    : 'Clôturer ici, c’est fermer le dossier : le client passe en « Bien trouvé », la veille s’arrête et les relances en attente sont soldées.'}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        <div className="tx-pied">
                          {enCours ? (
                            <>
                              <button className="tx-abandon" onClick={abandonnerTransaction}>Abandonner la transaction</button>
                              <span style={{ flexGrow: 1 }} />
                              {ORDRE_ETAPES.indexOf(eVue.cle) > 0 && (
                                <button className={styles.btn} onClick={reculerEtape}>← Étape précédente</button>
                              )}
                              {eVue.cle === 'acte' ? (
                                <button className="tx-cloture" disabled={saving} onClick={finaliserTransaction}>
                                  🎉 Acte signé — clôturer
                                </button>
                              ) : (
                                <button className={`${styles.btn} ${styles.btnPrimary}`}
                                  onClick={() => avancerEtape(SUIVANT[eVue.cle].vers)}>
                                  {SUIVANT[eVue.cle].label}
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: 12.5, color: '#8593a8' }}>Vous consultez une étape déjà franchie — les corrections restent possibles.</span>
                              <span style={{ flexGrow: 1 }} />
                              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setVueEtape(null)}>
                                Revenir à l'étape en cours →
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
        )}

        {/* TAB SÉLECTION */}
        {tab === 'selection' && (
          <div key="p-selection" className="emilio-panneau"><OngletBiens
            clientId={client.id} rechercheId={rechercheId} client={client} mode="selection"
            onChange={() => { load(); chargerVeilleCount(); }}
            onMail={async (id) => { await load(); openEnvoiBien(id); }}
            onMailGroupe={async (ids) => { await load(); openEnvoiMulti(ids); }}
            rafraichir={versionBiens}
            onFiche={(id) => openFicheBien(id)}
            onVisite={(id) => planifierVisite(id)}
          /></div>
        )}

        {/* TAB PRÉSENTÉS */}
        {tab === 'presentes' && (
          <div key="p-presentes" className="emilio-panneau"><OngletBiens
            clientId={client.id} rechercheId={rechercheId} client={client} mode="presentes"
            onChange={() => { load(); chargerVeilleCount(); }}
            onMail={async (id) => { await load(); openEnvoiBien(id); }}
            rafraichir={versionBiens}
            onFiche={(id) => openFicheBien(id)}
            onVisite={(id) => planifierVisite(id)}
          /></div>
        )}

        {/* TAB VEILLE */}
        {tab === 'veille' && (
          <div key="p-veille" className="emilio-panneau">
            <OngletVeille
              clientId={client.id}
              rechercheId={rechercheId}
              onChange={() => { load(); chargerVeilleCount(); }}
            />
          </div>
        )}

        </div>
          </>
        )}

        {/* TAB SUIVI (fusion Historique + Journal) — en frise depuis la V3.23 :
            le rendu vit dans FriseSuivi, les données restent préparées ici. */}
        {vue === 'suivi' && (
          <div className={`${styles.card} fc-suivi-carte`} style={{ padding: 22 }}>
            {/* « À venir », en haut de la frise : les relances en attente de CETTE
                recherche, et celles du client qui n'en ont pas. */}
            <FriseSuivi
              items={suiviItems}
              filtre={suiviFiltre}
              comptes={{ tout: suiviCount, ...Object.fromEntries(Object.entries(suiviGroupes).map(([k, g]) => [k, g.items.length])) }}
              onFiltre={setSuiviFiltre}
              enPlus={nbAutresRecherches > 0 ? (
                <button type="button" onClick={() => setSuiviToutesPour(suiviToutes ? null : rechercheId)}
                  title={suiviToutes ? 'Ne montrer que cette recherche' : 'Montrer aussi ce qui a été noté sur ses autres recherches'}
                  style={{ height: 34, padding: '0 13px', borderRadius: 99, border: '1px dashed #c9a84c', background: suiviToutes ? '#fbf6e9' : 'white', color: '#8a6d22', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {suiviToutes ? 'Cette recherche seulement' : `+ ${nbAutresRecherches} d’une autre recherche`}
                </button>
              ) : null}
              aVenir={relancesAtt.filter(r => suiviToutes || !r.recherche_id || r.recherche_id === rechercheId)}
              relancesAtt={relancesAtt}
              biens={biens}
              nomAutreRecherche={(j) => (autreRecherche(j) ? (recherches.find(r => r.id === j.recherche_id)?.nom || 'Une autre recherche') : null)}
              surligne={surligne}
              modifiable={(j) => TYPES_MODIFIABLES.has(j.type)}
              onModifier={modifierAction}
              onSupprimer={supprimerAction}
              onAjouter={() => nouvelleAction()}
              onAppel={() => nouvelleAction('appel')}
              onReporter={reporterDepuisSuivi}
            />
          </div>
        )}
        </CorpsOnglet>

      {showContact && (
        <Portail>
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>📞 Modifier le contact</h2><button className={styles.modalClose} onClick={() => setShowContact(false)}>✕</button></div>
            <div className={styles.modalBody}>
              {/* Une personne ou un couple : la personne 2 signe le mandat avec son propre lien. */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                {([['Monsieur', 'Monsieur'], ['Madame', 'Madame'], ['couple', 'Un couple']] as const).map(([k, lib]) => {
                  const on = k === 'couple' ? cf.couple : !cf.couple && cf.civilite === k;
                  return (
                    <button type="button" key={k} onClick={() => setCf(f => (k === 'couple' ? { ...f, couple: true } : { ...f, couple: false, civilite: k }))}
                      style={{ padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${on ? 'var(--emilio)' : '#e2e8f0'}`, background: on ? '#f8fafc' : '#fff', color: on ? 'var(--emilio)' : '#64748b' }}>
                      {lib}
                    </button>
                  );
                })}
              </div>
              {/* Un couple : chaque personne dans son cadre, avec son e-mail et
                  son téléphone. La personne 1 reçoit les mails et a l'espace. */}
              {cf.couple ? (
                <div style={{ border: '1px solid #e3e8f0', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, margin: '6px 0 0' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: '#a9822f' }}>Personne 1 · contact principal</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['Monsieur', 'Madame'] as const).map(c => (
                      <button type="button" key={c} onClick={() => setCf(f => ({ ...f, civilite: c }))}
                        style={{ padding: '5px 11px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${cf.civilite === c ? 'var(--emilio)' : '#e2e8f0'}`, background: cf.civilite === c ? '#f8fafc' : '#fff', color: cf.civilite === c ? 'var(--emilio)' : '#8593a8' }}>{c}</button>
                    ))}
                  </div>
                  <div className={styles.formRow}><div><label className={styles.lbl}>Prénom</label><input className={styles.inp} value={cf.prenom} onChange={e => setCf(f => ({ ...f, prenom: e.target.value }))} /></div><div><label className={styles.lbl}>Nom</label><input className={styles.inp} value={cf.nom} onChange={e => setCf(f => ({ ...f, nom: e.target.value }))} /></div></div>
                  <div className={styles.formRow}>
                    <ListeCoordonnees genre="mail" etiquette="E-mails" valeurs={cf.emails} onChange={v => setCf(f => ({ ...f, emails: v }))} classeEtiquette={styles.lbl} classeChamp={styles.inp} />
                    <ListeCoordonnees genre="tel" etiquette="Téléphones" valeurs={cf.tels} onChange={v => setCf(f => ({ ...f, tels: v }))} classeEtiquette={styles.lbl} classeChamp={styles.inp} />
                  </div>
                </div>
              ) : (
                <div className={styles.formRow}><div><label className={styles.lbl}>Prénom</label><input className={styles.inp} value={cf.prenom} onChange={e => setCf(f => ({ ...f, prenom: e.target.value }))} /></div><div><label className={styles.lbl}>Nom</label><input className={styles.inp} value={cf.nom} onChange={e => setCf(f => ({ ...f, nom: e.target.value }))} /></div></div>
              )}
              {cf.couple && (
                <div style={{ border: '1px solid #e3e8f0', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, margin: '6px 0' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: '#a9822f' }}>Personne 2</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['Monsieur', 'Madame'] as const).map(c => (
                      <button type="button" key={c} onClick={() => setCf(f => ({ ...f, c2_civilite: c }))}
                        style={{ padding: '5px 11px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${cf.c2_civilite === c ? 'var(--emilio)' : '#e2e8f0'}`, background: cf.c2_civilite === c ? '#f8fafc' : '#fff', color: cf.c2_civilite === c ? 'var(--emilio)' : '#8593a8' }}>{c}</button>
                    ))}
                  </div>
                  <div className={styles.formRow}><div><label className={styles.lbl}>Prénom</label><input className={styles.inp} value={cf.c2_prenom} onChange={e => setCf(f => ({ ...f, c2_prenom: e.target.value }))} /></div><div><label className={styles.lbl}>Nom</label><input className={styles.inp} value={cf.c2_nom} onChange={e => setCf(f => ({ ...f, c2_nom: e.target.value }))} /></div></div>
                  <div className={styles.formRow}><div><label className={styles.lbl}>Email</label><input className={styles.inp} type="email" value={cf.c2_email} onChange={e => setCf(f => ({ ...f, c2_email: e.target.value }))} /></div><div><label className={styles.lbl}>Téléphone</label><input className={styles.inp} value={cf.c2_tel} onChange={e => setCf(f => ({ ...f, c2_tel: e.target.value }))}  /></div></div>
                </div>
              )}
              <ChampAdresseAuto etiquette="Adresse" valeur={cf.adresse} onChange={v => setCf(f => ({ ...f, adresse: v }))} />
              {/* Tous ses e-mails et tous ses numéros (V3.89) : le premier est le principal. */}
              {!cf.couple && (
                <div className={styles.formRow}>
                  <ListeCoordonnees genre="mail" etiquette="E-mails" valeurs={cf.emails} onChange={v => setCf(f => ({ ...f, emails: v }))} classeEtiquette={styles.lbl} classeChamp={styles.inp} />
                  <ListeCoordonnees genre="tel" etiquette="Téléphones" valeurs={cf.tels} onChange={v => setCf(f => ({ ...f, tels: v }))} classeEtiquette={styles.lbl} classeChamp={styles.inp} />
                </div>
              )}

              {/* Situation actuelle (propriétaire / locataire) */}
              <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 8, paddingTop: 12 }}>
                <label className={styles.lbl}>🏠 Situation actuelle</label>
                <select className={styles.inp} value={cf.statut_occupation} onChange={e => setCf(f => ({ ...f, statut_occupation: e.target.value }))}>
                  <option value="">— Non renseigné —</option>
                  <option value="proprietaire">Propriétaire</option>
                  <option value="locataire">Locataire</option>
                  <option value="heberge">Hébergé</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              {/* Revente possible après l'achat — interrupteur indépendant du statut */}
              <button type="button" onClick={() => setCf(f => ({ ...f, bien_actuel_a_vendre: !f.bien_actuel_a_vendre }))} style={{ marginTop: 10, padding: '8px 14px', borderRadius: 20, border: `1px solid ${cf.bien_actuel_a_vendre ? '#ea580c' : '#e2e8f0'}`, background: cf.bien_actuel_a_vendre ? '#fff7ed' : 'white', color: cf.bien_actuel_a_vendre ? '#ea580c' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{cf.bien_actuel_a_vendre ? '✓ ' : ''}🏷️ Revente possible après l&apos;achat (mandat vendeur potentiel)</button>
              {cf.bien_actuel_a_vendre && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 14, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className={styles.formRow}>
                    <div><label className={styles.lbl}>Type de bien</label><input className={styles.inp} value={cf.bien_actuel_type} onChange={e => setCf(f => ({ ...f, bien_actuel_type: e.target.value }))} /></div>
                    <div><label className={styles.lbl}>Surface (m²)</label><input className={styles.inp} type="number" value={cf.bien_actuel_surface} onChange={e => setCf(f => ({ ...f, bien_actuel_surface: e.target.value }))} /></div>
                  </div>
                  <div><label className={styles.lbl}>Valeur estimée (€)</label><input className={styles.inp} type="number" value={cf.bien_actuel_valeur} onChange={e => setCf(f => ({ ...f, bien_actuel_valeur: e.target.value }))} /></div>
                  <button type="button" onClick={() => setCf(f => ({ ...f, bien_actuel_meme_adresse: !f.bien_actuel_meme_adresse }))} style={{ alignSelf: 'flex-start', padding: '7px 13px', borderRadius: 20, border: `1px solid ${cf.bien_actuel_meme_adresse ? '#0ea5e9' : '#e2e8f0'}`, background: cf.bien_actuel_meme_adresse ? '#f0f9ff' : 'white', color: cf.bien_actuel_meme_adresse ? '#0ea5e9' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{cf.bien_actuel_meme_adresse ? '✓ ' : ''}📍 Bien à la même adresse que le contact</button>
                  {!cf.bien_actuel_meme_adresse && (
                    <ChampAdresseAuto etiquette="Adresse du bien à revendre" valeur={cf.bien_actuel_adresse} onChange={v => setCf(f => ({ ...f, bien_actuel_adresse: v }))} />
                  )}
                  <div><label className={styles.lbl}>Précisions sur le bien à revendre</label><textarea className={styles.inp} rows={2} value={cf.bien_actuel_notes} onChange={e => setCf(f => ({ ...f, bien_actuel_notes: e.target.value }))} /></div>
                </div>
              )}
              <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 8, paddingTop: 12 }}>
                <label className={styles.lbl}>{'D’où vient ce contact ? · facultatif'}</label>
                <ChoixSource source={cf.source} detail={cf.source_detail} onChange={(so, de) => setCf(f => ({ ...f, source: so, source_detail: de }))} />
              </div>
            </div>
            <div className={styles.modalFooter}><button className={styles.btn} onClick={() => setShowContact(false)}>Annuler</button><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveContact} disabled={saving}>{saving ? '...' : '✓ Sauvegarder'}</button></div>
          </div>
        </div>
        </Portail>
      )}

      {showHisto && (
        <Portail>
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: 620 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>🕑 Historique client</h2>
              <button className={styles.modalClose} onClick={() => setShowHisto(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: -4 }}>
                Ce que {client.prenom || 'le client'}{' '}a changé ou demandé depuis son espace.
              </div>
              {histoEvts.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13.5, padding: '26px 0' }}>
                  Rien pour l&apos;instant — il n&apos;a encore rien modifié ni écrit.
                </div>
              ) : histoEvts.map(ev => {
                const msg = ev.type === 'message';
                const neuf = new Date(ev.created_at).getTime() > vuLe;
                const d = new Date(ev.created_at);
                /* Le détail avant → après est dans le journal, écrit dans la
                   même seconde : on prend la ligne la plus proche dans le temps. */
                let diff: ChangementCrit[] | null = null;
                if (!msg) {
                  let ecart = 60_000;
                  for (const j of journal) {
                    if (j.type !== 'criteres_modifies' || !Array.isArray(j.metadata?.changements)) continue;
                    if (j.recherche_id && ev.recherche_id && j.recherche_id !== ev.recherche_id) continue;
                    const e = Math.abs(new Date(j.created_at).getTime() - d.getTime());
                    if (e < ecart) { ecart = e; diff = j.metadata.changements; }
                  }
                  /* Les zéros écrits tout seuls avant le 24 septembre (apport 0 €,
                     étages « rez-de-chaussée ») ne sont pas des choix du client :
                     ni leur arrivée ni leur départ ne s'affichent. */
                  if (diff) diff = diff.filter(c => !estBruitCritere(c));
                }
                return (
                  <div key={ev.id} style={{
                    display: 'flex', gap: 11, padding: '11px 13px', borderRadius: 12,
                    border: `1px solid ${neuf ? '#fed7aa' : '#e3e8f0'}`,
                    background: neuf ? '#fffaf3' : 'white',
                  }}>
                    <span style={{ fontSize: 17, lineHeight: 1.2 }}>{msg ? '💬' : '🎯'}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 13.5, color: 'var(--emilio)' }}>
                          {msg ? 'Il vous a écrit' : 'Il a modifié ses critères'}
                        </b>
                        {diff && diff.length > 0 && <span style={{ fontSize: 12, color: '#64748b' }}>{`· ${diff.length} changement${diff.length > 1 ? 's' : ''}`}</span>}
                        {neuf && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: '#c2410c', background: '#ffedd5', borderRadius: 6, padding: '2px 6px' }}>Nouveau</span>}
                        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {diff && diff.length === 0 ? (
                        <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 4 }}>{'Il a revalidé ses critères sans rien changer.'}</div>
                      ) : diff ? <DiffCriteres changements={diff} /> : ev.detail && (
                        <div style={{ fontSize: 13, color: '#475569', marginTop: 4, lineHeight: 1.55, overflowWrap: 'anywhere' }}>
                          {/* Avant le 24 septembre, seul le dossier complet était noté, pas ce qui avait bougé. */}
                          {!msg && /^type :|budget|m² min/.test(ev.detail) && (
                            <span style={{ display: 'block', fontSize: 11.5, color: '#94a3b8', marginBottom: 2 }}>Ses critères après modification (ancien format, sans le détail avant → après) :</span>
                          )}
                          {ev.detail}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={`${styles.modalFooter} ${styles.critNav}`}>
              <button className={styles.btn} onClick={() => { setShowHisto(false); ouvrirCriteres(8); }}
                title="La note est la vôtre : c'est vous qui la réécrivez pour lui">✏️ Modifier ma note</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowHisto(false)}>Fermer</button>
            </div>
          </div>
        </div>
        </Portail>
      )}

      {showCriteres && (() => {
        const etapesCrit = etapesCriteres(crit, setCrit);
        const nbE = etapesCrit.length;
        const iE = Math.min(Math.max(etapeCrit, 0), nbE - 1);
        const allerE = (n: number) => { setSensCrit(n > iE ? 1 : -1); setEtapeCrit(Math.max(0, Math.min(nbE - 1, n))); };
        const cls = (...v: (string | false | undefined)[]) => v.filter(Boolean).join(' ');
        return (
        <Portail>
        <div className={styles.overlay}>
          <div className={`${styles.modal} ${styles.critFenetre}`} style={{ maxWidth: 900 }}>
            <div className={`${styles.modalHeader} ${styles.critTete}`}>
              <h2 className={styles.modalTitle}>🎯 Critères de recherche</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BasculeCriteres mode={modeCrit} onMode={changerModeCrit} />
                <button className={styles.modalClose} onClick={() => setShowCriteres(false)}>✕</button>
              </div>
            </div>

            {modeCrit === 'etapes' && <FriseCriteres etapes={etapesCrit} i={iE} onAller={allerE} />}

            <div className={cls(styles.modalBody, modeCrit === 'etapes' && styles.critCorps)}>
              <CorpsCriteres etapes={etapesCrit} mode={modeCrit} i={iE} sens={sensCrit} />
            </div>

            {modeCrit === 'tout' ? (
              <div className={styles.modalFooter}>
                <button className={styles.btn} onClick={() => setShowCriteres(false)}>Annuler</button>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveCriteres} disabled={saving}>{saving ? '...' : '✓ Sauvegarder'}</button>
              </div>
            ) : (
              <div className={`${styles.modalFooter} ${styles.critNav}`}>
                <button className={styles.btn} onClick={() => (iE === 0 ? setShowCriteres(false) : allerE(iE - 1))}>{iE === 0 ? 'Annuler' : '← Précédent'}</button>
                <div className={styles.critNavD}>
                  {iE < nbE - 1 && (
                    <button className={styles.btn} onClick={saveCriteres} disabled={saving} title="Enregistre les critères et ferme la pop-up">{saving ? '...' : 'Enregistrer et fermer'}</button>
                  )}
                  {iE < nbE - 1
                    ? <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => allerE(iE + 1)}>Suivant →</button>
                    : <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveCriteres} disabled={saving}>{saving ? '...' : '✓ Sauvegarder'}</button>}
                </div>
              </div>
            )}
          </div>
        </div>
        </Portail>
        );
      })()}

      {showChoixTx && (
        <Portail>
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowChoixTx(null); }}>
          <div className={styles.modal} style={{ maxWidth: 560 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{showChoixTx === 'creer' ? '💼 Créer une transaction' : '💼 Changer de bien'}</h2>
              <button className={styles.modalClose} onClick={() => setShowChoixTx(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 11, padding: '11px 14px', fontSize: 12.5, color: '#55647a', lineHeight: 1.55 }}>
                Sur quel bien porte cette transaction&nbsp;? Seuls les biens <b>visités</b>{' '}par le client
                sont proposés — c'est là que se joue une offre.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {biensPourTx().map(b => {
                  const vs = visites.filter(v => v.bien_id === b.id && (v.statut === 'a_venir' || v.statut === 'effectuee'));
                  const faite = vs.find(v => v.statut === 'effectuee');
                  const derniere = faite || vs[0];
                  const actif = transaction?.bien_id === b.id;
                  return (
                    <button type="button" key={b.id} onClick={() => choisirBienTx(b.id)} disabled={actif || saving}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12,
                        border: `1.5px solid ${actif ? '#c9a84c' : '#e3e8f0'}`, background: actif ? '#faf6ee' : 'white',
                        cursor: actif ? 'default' : 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all .14s' }}>
                      <span style={{ width: 52, height: 52, borderRadius: 10, background: '#e2e8f0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, overflow: 'hidden', flexShrink: 0 }}>
                        {b.photos?.[0] ? <img src={b.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🏠'}
                      </span>
                      <span style={{ flexGrow: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: 'var(--emilio)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {b.titre || `${b.type_bien || 'Bien'} — ${b.ville || '—'}`}
                        </span>
                        <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          {[b.surface && `${b.surface} m²`, b.nb_pieces && `${b.nb_pieces}P`, b.ville].filter(Boolean).join(' · ') || '—'}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 11.5, fontWeight: 700,
                          borderRadius: 99, padding: '2px 9px',
                          background: faite ? '#ecfdf5' : '#f5f3ff', border: `1px solid ${faite ? '#bbf7d0' : '#ddd6fe'}`,
                          color: faite ? '#15803d' : '#6d28d9' }}>
                          {faite ? '✅ Visité' : '📅 Visite prévue'}
                          {derniere?.date_visite ? ` · ${new Date(derniere.date_visite).toLocaleDateString('fr-FR')}` : ''}
                        </span>
                      </span>
                      {b.prix_acquereur ? (
                        <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 15, color: '#a9822f', flexShrink: 0 }}>
                          {b.prix_acquereur.toLocaleString('fr-FR')} €
                        </span>
                      ) : null}
                      {actif && <span style={{ fontSize: 11, fontWeight: 800, color: '#a9822f', flexShrink: 0 }}>en cours</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowChoixTx(null)}>Annuler</button>
            </div>
          </div>
        </div>
        </Portail>
      )}

      {showCloture && (
        <Portail>
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: 520 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>🏁 Clôturer la recherche</h2><button className={styles.modalClose} onClick={() => setShowCloture(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 11, padding: '11px 14px', fontSize: 12.5, color: '#55647a', lineHeight: 1.55 }}>
                {'La veille s’arrête sur ce dossier, ses relances d’acheteur sont soldées, ses visites à venir annulées, et le motif reste au journal. Tout est réversible : « Rouvrir le dossier » dans le menu d’état.'}
              </div>
              {/* V3.50 : trouvé avec nous et une transaction ouverte = un acte signé. */}
              {cloture.motif === 'trouve_avec_moi' && transaction && transaction.etape_actuelle !== 'finalise' && (
                <div style={{ background: '#fdfaf1', border: '1px solid #ecdcb4', borderRadius: 11, padding: '11px 14px', fontSize: 12.5, color: '#7a5d1c', lineHeight: 1.55 }}>
                  {'Une transaction est en cours : elle passera « Acte signé », pour que la vente compte dans ton chiffre d’affaires. Tu confirmeras la date de l’acte juste après.'}
                </div>
              )}
              <div>
                <label className={styles.lbl}>Pourquoi la recherche s'arrête</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {MOTIFS_CLOTURE.map(m => {
                    const actif = cloture.motif === m.cle;
                    return (
                      <button type="button" key={m.cle} onClick={() => setCloture(f => ({ ...f, motif: m.cle }))}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 13px', borderRadius: 11, border: `1.5px solid ${actif ? '#c9a84c' : '#e3e8f0'}`, background: actif ? '#faf6ee' : 'white', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                        <span style={{ flexShrink: 0, width: 16, height: 16, borderRadius: '50%', border: `2px solid ${actif ? '#c9a84c' : '#cbd5e1'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                          {actif && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c9a84c' }} />}
                        </span>
                        <span style={{ flexGrow: 1, minWidth: 0 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.point, flexShrink: 0 }} />
                            <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--emilio)' }}>{m.nom}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.7, borderRadius: 99, padding: '1px 8px', color: m.statut === 'bien_trouve' ? '#1d4ed8' : '#b91c1c', background: m.statut === 'bien_trouve' ? '#eff6ff' : '#fef2f2' }}>
                              {m.statut === 'bien_trouve' ? 'Bien trouvé' : 'Perdu'}
                            </span>
                          </span>
                          <span style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{m.quoi}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className={styles.lbl}>Note <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optionnelle)</span></label>
                <textarea className={styles.inp} rows={3} value={cloture.note}
                  onChange={e => setCloture(f => ({ ...f, note: e.target.value }))}
                  placeholder="Ce qu'il a acheté, avec qui, ce qui a manqué…" />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowCloture(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={cloturerDossier} disabled={saving}>{saving ? '...' : '🏁 Clôturer'}</button>
            </div>
          </div>
        </div>
        </Portail>
      )}

      {/* ═══ MODAL ACTE SIGNÉ (V3.50) ═══
          La date de la signature, à confirmer : c'est elle qui range la vente
          dans le chiffre d'affaires du mois. Sans honoraires, on prévient. */}
      {acte && (() => {
        const bienActe = biens.find(b => b.id === acte.tx.bien_id);
        const nomActe = bienActe ? (bienActe.titre || bienActe.ville || '') : '';
        const htActe = honorairesHT(acte.tx);
        const sansHono = !(htActe > 0);
        return (
          <Portail>
          <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget && !saving) setActe(null); }}>
            <div className={styles.modal} style={{ maxWidth: 480 }}>
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>🎉 Acte signé</h2>
                {!saving && <button className={styles.modalClose} onClick={() => setActe(null)}>✕</button>}
              </div>
              <div className={styles.modalBody}>
                {acte.portee === 'dossier' && (
                  <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 11, padding: '11px 14px', fontSize: 12.5, color: '#55647a', lineHeight: 1.55 }}>
                    {`La transaction${nomActe ? ` sur « ${nomActe} »` : ''} passe « Acte signé » : la vente compte dans ton chiffre d’affaires, puis le dossier se clôture.`}
                  </div>
                )}
                <div>
                  <label className={styles.lbl}>Date de signature de l&apos;acte</label>
                  <input className={styles.inp} type="date" value={acte.date} max={jourParis()}
                    onChange={e => { const d = e.target.value; setActe(a => (a ? { ...a, date: d } : a)); }} />
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 5, lineHeight: 1.5 }}>
                    {'C’est cette date qui range la vente dans le chiffre d’affaires du mois.'}
                  </div>
                </div>
                {sansHono ? (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 11, padding: '11px 14px', fontSize: 13, color: '#92400e', lineHeight: 1.55 }}>
                    {'Les honoraires ne sont pas renseignés : cette vente ne comptera pas dans ton chiffre d’affaires. Tu pourras les ajouter ensuite dans l’onglet Transaction.'}
                  </div>
                ) : (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 11, padding: '11px 14px', fontSize: 13, color: '#15803d', lineHeight: 1.55 }}>
                    {`Honoraires : ${ecrireMontant(htActe)} HT.`}
                  </div>
                )}
              </div>
              <div className={styles.modalFooter}>
                <button className={styles.btn} disabled={saving} onClick={() => setActe(null)}>Annuler</button>
                <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving || !acte.date} onClick={confirmerActe}>
                  {saving ? '…' : sansHono ? 'Continuer sans honoraires' : '🎉 Clôturer'}
                </button>
              </div>
            </div>
          </div>
          </Portail>
        );
      })()}

      {suspendre && (
        <Portail>
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: 480 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>⏸️ Suspendre le dossier</h2><button className={styles.modalClose} onClick={() => setSuspendre(null)}>✕</button></div>
            <div className={styles.modalBody}>
              <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 11, padding: '11px 14px', fontSize: 12.5, color: '#55647a', lineHeight: 1.55 }}>
                La veille s'arrête sur ses recherches. Avec une date de reprise, ce jour-là le dossier repasse tout seul en « Actif », la veille repart et une relance vous rappelle d'appeler le client.
              </div>
              <div>
                <label className={styles.lbl}>Date de reprise <span style={{ fontWeight: 400, color: '#94a3b8' }}>(facultative)</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {([
                    { k: 'sans', l: 'Sans date' },
                    { k: '1', l: 'Dans 1 mois' },
                    { k: '3', l: 'Dans 3 mois' },
                    { k: '6', l: 'Dans 6 mois' },
                    { k: 'date', l: 'Choisir une date' },
                  ] as const).map(o => {
                    const actif = suspendre.choix === o.k;
                    return (
                      <button type="button" key={o.k} onClick={() => setSuspendre(v => v && ({ ...v, choix: o.k }))}
                        style={{ padding: '8px 13px', borderRadius: 99, border: `1.5px solid ${actif ? '#c9a84c' : '#e3e8f0'}`, background: actif ? '#faf6ee' : 'white', color: actif ? '#8a6a1f' : '#55647a', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {o.l}
                      </button>
                    );
                  })}
                </div>
              </div>
              {suspendre.choix === 'date' && (
                <div>
                  <ChoixDate valeur={suspendre.date} min={jourParis(new Date(Date.now() + 86_400_000))}
                    onChange={v => setSuspendre(x => x && ({ ...x, date: v }))} placeholder="Choisir le jour de reprise" />
                </div>
              )}
              <div style={{ fontSize: 13, color: 'var(--emilio)', fontWeight: 600 }}>
                {(() => {
                  const j = suspendre.choix === 'sans' ? '' : suspendre.choix === 'date' ? suspendre.date : dansMois(Number(suspendre.choix));
                  if (suspendre.choix === 'date' && !j) return 'Choisissez le jour de reprise.';
                  return j
                    ? `Reprise le ${jourLisible(j)} : le dossier repassera en «\u00a0Actif\u00a0» ce jour-là.`
                    : 'Sans date : le dossier reste suspendu jusqu\u2019à ce que vous le repassiez en «\u00a0Actif\u00a0».';
                })()}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setSuspendre(null)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={confirmerSuspension} disabled={saving}>
                {saving ? '...' : client.statut === 'suspendu' ? 'Enregistrer' : '⏸️ Suspendre'}
              </button>
            </div>
          </div>
        </div>
        </Portail>
      )}

      {showMandat && (
        <Portail>
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: 560 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>📋 Mandat de recherche</h2><button className={styles.modalClose} onClick={() => setShowMandat(false)}>✕</button></div>
            <div className={styles.modalBody}>
              {/* Le mandat signé en ligne depuis l'espace client, et « Faire
                  signer le mandat ». La saisie manuelle reste dessous, pour un
                  mandat signé ailleurs. */}
              <MandatEnLigne recherche={cr} client={client}
                onMaj={(d) => setRecherches(rs => rs.map(r => r.id === d.id ? (d as Recherche) : r))}
                onClient={(c) => setClient(c as Client)}
                onAvenant={() => { setShowMandat(false); onNavigate('documents', { avenantRecherche: cr.id }); }} />
              <div><label className={styles.lbl}>Date de signature</label><input className={styles.inp} type="date" value={mandat.date_signature} onChange={e => setMandat(f => ({ ...f, date_signature: e.target.value }))} /></div>
              <div className={styles.formRow}>
                <div><label className={styles.lbl}>Durée</label><select className={styles.inp} value={mandat.duree} onChange={e => setMandat(f => ({ ...f, duree: e.target.value }))}><option value="1">1 mois</option><option value="2">2 mois</option><option value="3">3 mois</option><option value="6">6 mois</option><option value="12">12 mois</option></select></div>
                <div><label className={styles.lbl}>Date expiration (auto ou manuelle)</label><input className={styles.inp} type="date" value={mandat.date_expiration} onChange={e => setMandat(f => ({ ...f, date_expiration: e.target.value }))} /></div>
              </div>
              <div><label className={styles.lbl}>Honoraires convenus</label><input className={styles.inp} value={mandat.honoraires} onChange={e => setMandat(f => ({ ...f, honoraires: e.target.value }))} placeholder="2,5% TTC ou 5 000€ TTC" /></div>
              {mandat.date_signature && mandat.duree && !mandat.date_expiration && <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#1d4ed8' }}>💡 Expiration calculée : {ajouterMois(String(mandat.date_signature).slice(0, 10), parseInt(mandat.duree)).split('-').reverse().join('/')}</div>}
            </div>
            <div className={styles.modalFooter} style={{ justifyContent: 'space-between' }}>
              {cr.mandat_date_signature || cr.mandat_date_expiration ? (
                <button className={styles.btn} onClick={supprimerMandat} disabled={saving}
                  style={{ color: '#b91c1c', borderColor: '#fecaca', background: '#fff' }}>🗑️ Supprimer le mandat</button>
              ) : <span />}
              <span style={{ display: 'flex', gap: 8 }}>
                <button className={styles.btn} onClick={() => setShowMandat(false)}>Annuler</button>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveMandat} disabled={saving}>{saving ? '...' : '✓ Sauvegarder'}</button>
              </span>
            </div>
          </div>
        </div>
        </Portail>
      )}

      {showBien && (
        <Portail>
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: 720 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>🏠 Ajouter un bien</h2><button className={styles.modalClose} onClick={() => { setShowBien(false); setBienForm(null); setUrl(''); setTexteAnnonce(''); setPhotosInput(''); setBienMode('url'); }}>✕</button></div>
            <div className={styles.modalBody}>

              {/* Sélecteur mode */}
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
                {(['url', 'texte'] as const).map(m => (
                  <button key={m} onClick={() => { setBienMode(m); setBienForm(null); }}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: bienMode === m ? 'white' : 'transparent', color: bienMode === m ? 'var(--emilio)' : '#64748b', fontWeight: bienMode === m ? 700 : 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', boxShadow: bienMode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}>
                    {m === 'url' ? '🔗 Par URL' : '📋 Coller le texte'}
                  </button>
                ))}
              </div>

              {/* MODE URL */}
              {bienMode === 'url' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div><label className={styles.lbl}>URL de l'annonce</label><div style={{ display: 'flex', gap: 8 }}><input className={styles.inp} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.seloger.com/annonces/..." style={{ flex: 1 }} onKeyDown={e => e.key === 'Enter' && extract()} /><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={extract} disabled={extracting||!url}>{extracting ? '⏳...' : '🔍 Extraire'}</button></div><div style={{ fontSize: 12, color: '#94a3b8', marginTop: 5 }}>SeLoger, LeBonCoin, PAP, Bien'ici, Logic-Immo, Jinka, Orpi, Century 21...</div></div>
                  {bienForm !== null && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ background: bienForm._reason === 'seloger_blocked' ? '#fffbeb' : bienForm.titre ? '#ecfdf5' : '#f8fafc', border: `1px solid ${bienForm._reason === 'seloger_blocked' ? '#fde68a' : bienForm.titre ? '#a7f3d0' : '#e2e8f0'}`, borderRadius: 10, padding: '9px 13px', fontSize: 13, color: bienForm._reason === 'seloger_blocked' ? '#92400e' : bienForm.titre ? '#065f46' : '#64748b' }}>
                        {bienForm._reason === 'seloger_blocked' ? "⚠️ SeLoger bloque l'extraction — complétez manuellement" : bienForm.titre ? '✅ Informations extraites — vérifiez et complétez' : 'ℹ️ Remplissez manuellement'}
                      </div>
                      <BienFormFields bienForm={bienForm} setBienForm={setBienForm} prixAcq={prixAcq} styles={styles} />
                    </div>
                  )}
                </div>
              )}

              {/* MODE TEXTE */}
              {bienMode === 'texte' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#1d4ed8' }}>
                    💡 <strong>Comment faire :</strong> Sur la page de l'annonce, sélectionne tout (Ctrl+A), copie (Ctrl+C), colle ici (Ctrl+V). Le système extrait automatiquement toutes les infos.
                  </div>
                  <div><label className={styles.lbl}>Lien de l'annonce <span style={{fontWeight:400,color:'#94a3b8'}}>(optionnel)</span></label><input className={styles.inp} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." /></div>
                  <div><label className={styles.lbl}>Texte copié de l'annonce</label><textarea className={styles.inp} rows={8} value={texteAnnonce} onChange={e => setTexteAnnonce(e.target.value)} placeholder="Ctrl+A sur la page → Ctrl+C → coller ici..." style={{ fontFamily: 'inherit', fontSize: 12 }} /></div>
                  <div>
                    <label className={styles.lbl}>Photos <span style={{fontWeight:400,color:'#94a3b8'}}>(clic droit sur chaque photo → "Copier l'adresse" → une URL par ligne)</span></label>
                    <textarea className={styles.inp} rows={3} value={photosInput} onChange={e => setPhotosInput(e.target.value)} placeholder="https://cdn.seloger.com/photo1.jpg" style={{ fontFamily: 'monospace', fontSize: 11 }} />
                    {photosInput && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        {photosInput.split('\n').map((u: string) => u.trim()).filter((u: string) => u.startsWith('http')).slice(0, 6).map((u: string, i: number) => (
                          <img key={i} src={u} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #e3e8f0' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ))}
                      </div>
                    )}
                  </div>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={parseTexte} disabled={extracting || texteAnnonce.trim().length < 30}>{extracting ? '⏳ Analyse en cours...' : '🤖 Analyser et remplir les champs'}</button>
                  {bienForm !== null && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '9px 13px', fontSize: 13, color: '#065f46' }}>{bienForm._method === 'claude' ? '🤖 Analysé par IA — vérifiez et ajustez' : '✅ Informations extraites — vérifiez et ajustez'}</div>
                      <BienFormFields bienForm={bienForm} setBienForm={setBienForm} prixAcq={prixAcq} styles={styles} />
                      {bienForm.photos?.length > 0 && (
                        <div><label className={styles.lbl}>Photos ({bienForm.photos.length})</label>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {bienForm.photos.map((p: string, i: number) => (
                              <div key={i} style={{ position: 'relative' }}>
                                <img src={p} alt="" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 8, border: '1px solid #e3e8f0' }} onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }} />
                                <button onClick={() => setBienForm((f: any) => ({ ...f, photos: f.photos.filter((_: string, j: number) => j !== i) }))} style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', fontSize: 10, cursor: 'pointer' }}>✕</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
            <div className={styles.modalFooter}><button className={styles.btn} onClick={() => { setShowBien(false); setBienForm(null); setUrl(''); setTexteAnnonce(''); setPhotosInput(''); setBienMode('url'); }}>Annuler</button>{bienForm !== null && <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveBien} disabled={saving}>{saving ? '...' : '✓ Ajouter ce bien'}</button>}</div>
          </div>
        </div>
        </Portail>
      )}

      </div>

      {/* ═══ LE RAPPROCHEMENT (V3.29) ═══ */}
      {rappro && rechercheActive && (
        <Rapprochement client={client} recherche={rechercheActive as unknown as Record<string, unknown>} resume={resumeRecherche}
          depart={rapproDepart}
          onFermer={() => { setRappro(false); setRapproDepart(null); load(); }}
          onFicheBien={(id) => { setRappro(false); setRapproDepart(null); onNavigate('biens', { bien: id }); }}
          onFini={async (quoi, ids) => {
            setRappro(false);
            setRapproDepart(null);
            await load();
            setVersionBiens(v => v + 1);
            if (quoi === 'mail') openEnvoiMulti(ids);
            else setTab('selection');
          }} />
      )}

      {/* Le petit message après l'enregistrement des critères (V3.29). */}
      {toastRappro && !rappro && (
        <div role="status" className={styles.toastRappro}>
          <span className={styles.toastRapproIc}><Icone nom="etoile" taille={16} epaisseur={2.2} /></span>
          <div className={styles.toastRapproTx}>
            <b>{toastRappro.titre}</b>
            <span>{toastRappro.texte}</span>
            <button type="button" onClick={() => { setRapproDepart({ source: 'mandats', cocher: toastRappro.ids }); setToastRappro(null); setRappro(true); }}>Voir</button>
          </div>
          <button type="button" className={styles.toastRapproX} aria-label="Fermer" onClick={() => setToastRappro(null)}><Icone nom="fermer" taille={13} epaisseur={2.4} /></button>
        </div>
      )}

      {/* ═══ MODAL CONFIRM ÉTAPE PRÉCÉDENTE ═══ */}
      {showConfirmEtape && transaction && (
        <Portail>
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowConfirmEtape(false); }}>
          <div className={styles.modal} style={{ maxWidth: 440 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>← Retour à l'étape précédente</h2>
              <button className={styles.modalClose} onClick={() => setShowConfirmEtape(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
                Revenir à l'étape <strong style={{ color: 'var(--emilio)' }}>« {ETAPES_LABELS[etapePrecTx]} »</strong> ?
              </p>
              <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#55647a', lineHeight: 1.55 }}>
                Rien n'est effacé : les montants et les dates déjà saisis restent en place.
              </div>
              {transaction.etape_actuelle === 'compromis' && (
                <div style={{ background: '#eef4fb', border: '1px solid #d6e3f5', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#2d5c8f', lineHeight: 1.55 }}>
                  🔍 La veille, mise en pause à la signature du compromis, <b>repartira</b>{' '}sur cette recherche.
                </div>
              )}
              {transaction.etape_actuelle === 'finalise' && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e', lineHeight: 1.55 }}>
                  ⚠️ Le dossier était clos : il repasse en <b>« Actif »</b>. La veille, elle, reste en pause — vous êtes toujours à l'acte.
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowConfirmEtape(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={doReculerEtape}>← Confirmer le retour</button>
            </div>
          </div>
        </div>
        </Portail>
      )}

      {/* ═══ MODAL SUPPRIMER LE CLIENT ═══ */}
      {showSupprClient && (
        <Portail>
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget && !supprEnCours) setShowSupprClient(false); }}>
          <div className={styles.modal} style={{ maxWidth: 540 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle} style={{ color: '#dc2626' }}>🗑️ Supprimer {client.prenom} {client.nom}</h2>
              {!supprEnCours && <button className={styles.modalClose} onClick={() => setShowSupprClient(false)}>✕</button>}
            </div>
            <div className={styles.modalBody} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 14, color: 'var(--emilio)', margin: 0, lineHeight: 1.6 }}>
                La fiche et <b>tout ce qu&apos;il y a dessous</b>{' '}disparaissent de la base. Il n&apos;y a
                pas de corbeille : une fois parti, rien ne se récupère.
              </p>

              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 15px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Ce qui part avec lui
                </div>
                {!supprStats ? (
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>Calcul en cours…</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: 'var(--emilio)', lineHeight: 1.85 }}>
                    <li>La fiche du client, ses coordonnées et ses notes</li>
                    <li><b>{supprStats.recherches}</b> recherche{supprStats.recherches > 1 ? 's' : ''}, avec leurs critères et leur mandat</li>
                    <li><b>{supprStats.biens}</b> bien{supprStats.biens > 1 ? 's' : ''} et <b>{supprStats.propositions}</b> proposition{supprStats.propositions > 1 ? 's' : ''} de veille, photos comprises</li>
                    <li><b>{supprStats.visites}</b> visite{supprStats.visites > 1 ? 's' : ''}, <b>{supprStats.envois}</b> envoi{supprStats.envois > 1 ? 's' : ''}, les transactions et les relances</li>
                    <li><b>{supprStats.passages}</b> passage{supprStats.passages > 1 ? 's' : ''} de veille et les <b>{supprStats.lues}</b> annonces lues</li>
                    <li>Tout l&apos;historique du dossier : appels, mails, notes, comptes rendus</li>
                    <li><b>Son espace client</b> : le lien cesse immédiatement de fonctionner</li>
                  </ul>
                )}
              </div>

              <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
                Si le dossier est simplement terminé, passe plutôt son statut à
                « bien trouvé » ou « perdu » : tu gardes l&apos;historique, et il sort des
                dossiers actifs.
              </p>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 8 }}>
                  Écris <b style={{ color: '#dc2626', textTransform: 'none', letterSpacing: 0 }}>{client.prenom} {client.nom}</b>{' '}pour confirmer
                </label>
                <input value={supprNom} onChange={e => setSupprNom(e.target.value)} disabled={supprEnCours}
                  placeholder={`${client.prenom} ${client.nom}`} autoFocus
                  style={{ width: '100%', background: '#fff7f7', border: '1.5px solid #fecaca', borderRadius: 9, padding: '10px 13px', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} disabled={supprEnCours} onClick={() => setShowSupprClient(false)}>Annuler</button>
              <button onClick={doSupprimerClient}
                disabled={supprEnCours || !supprStats || supprNom.trim().toLowerCase() !== `${client.prenom} ${client.nom}`.trim().toLowerCase()}
                style={{
                  background: '#dc2626', color: 'white', border: 'none', borderRadius: 10, padding: '8px 18px',
                  fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  cursor: supprEnCours ? 'default' : 'pointer',
                  opacity: supprEnCours || !supprStats || supprNom.trim().toLowerCase() !== `${client.prenom} ${client.nom}`.trim().toLowerCase() ? 0.45 : 1,
                }}>
                {supprEnCours ? '⏳ Suppression…' : '🗑️ Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
        </Portail>
      )}

      {/* ═══ MODAL RÉINITIALISER LE SUIVI ═══ */}
      {showReinit && (
        <Portail>
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget && !reinitEnCours) setShowReinit(false); }}>
          <div className={styles.modal} style={{ maxWidth: 520 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle} style={{ color: '#dc2626' }}>♻️ Réinitialiser le suivi</h2>
              {!reinitEnCours && <button className={styles.modalClose} onClick={() => setShowReinit(false)}>✕</button>}
            </div>
            <div className={styles.modalBody} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 14, color: 'var(--emilio)', margin: 0, lineHeight: 1.6 }}>
                Tout le travail fait sur <b>{rechercheActive?.nom || 'cette recherche'}</b>{' '}sera effacé.
                {/* V3.50 : la veille suit l'état du client. */}
                {client.statut === 'actif'
                  ? ' La recherche repart comme si tu venais de la créer, et la prochaine veille rouvrira tout le marché.'
                  : ' La recherche repart comme si tu venais de la créer. La veille reprendra quand le dossier repassera « Actif ».'}
              </p>

              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 15px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Ce qui sera supprimé définitivement
                </div>
                {!reinitStats ? (
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>Calcul en cours…</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: 'var(--emilio)', lineHeight: 1.85 }}>
                    <li><b>{reinitStats.propositions}</b> proposition{reinitStats.propositions > 1 ? 's' : ''} de veille, y compris les écartées et leurs motifs</li>
                    <li><b>{reinitStats.biens}</b> bien{reinitStats.biens > 1 ? 's' : ''} en sélection ou présentés{reinitStats.presentes > 0 ? ` (dont ${reinitStats.presentes} déjà envoyé${reinitStats.presentes > 1 ? 's' : ''} au client)` : ''}, avec leurs photos</li>
                    <li><b>{reinitStats.visites}</b> visite{reinitStats.visites > 1 ? 's' : ''} et leurs comptes rendus</li>
                    <li><b>{reinitStats.envois}</b> envoi{reinitStats.envois > 1 ? 's' : ''}{reinitStats.txOuverte ? ', la transaction en cours' : ''} et les relances</li>
                    <li><b>{reinitStats.passages}</b> passage{reinitStats.passages > 1 ? 's' : ''} de veille — le compteur « {reinitStats.lues} annonces lues » de l&apos;espace client revient à zéro</li>
                  </ul>
                )}
              </div>

              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '12px 15px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Ce qui ne bouge pas
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: 'var(--emilio)', lineHeight: 1.85 }}>
                  {/* V3.50 : une vente signée ne s'efface pas (chiffre d'affaires). */}
                  {reinitStats?.venteGardee && (
                    <li>{`La vente signée sur « ${reinitStats.venteGardee} », avec son bien : elle reste dans ton chiffre d’affaires`}</li>
                  )}
                  <li>Les critères, les précisions libres et le mandat</li>
                  <li>Le lien de l&apos;espace client — il continue de fonctionner, le client y trouvera une page vide</li>
                  <li>L&apos;historique du client : appels, notes, changements de critères</li>
                </ul>
              </div>

              <p style={{ fontSize: 12.5, color: '#94a3b8', margin: 0 }}>
                Cette action est irréversible. Rien ne se récupère après coup.
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} disabled={reinitEnCours} onClick={() => setShowReinit(false)}>Annuler</button>
              <button onClick={doReinit} disabled={reinitEnCours || !reinitStats}
                style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: reinitEnCours ? 'default' : 'pointer', fontFamily: 'inherit', opacity: reinitEnCours || !reinitStats ? 0.6 : 1 }}>
                {reinitEnCours ? '⏳ Remise à zéro…' : '♻️ Tout effacer et repartir à zéro'}
              </button>
            </div>
          </div>
        </div>
        </Portail>
      )}

      {/* ═══ MODAL CONFIRM DELETE BIEN ═══ */}
      {showConfirmDeleteBien && (
        <Portail>
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowConfirmDeleteBien(false); }}>
          <div className={styles.modal} style={{ maxWidth: 420 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle} style={{ color: '#ef4444' }}>🗑️ Supprimer ce bien</h2>
              <button className={styles.modalClose} onClick={() => setShowConfirmDeleteBien(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Cette action est irréversible. Le bien et toutes ses photos seront définitivement supprimés.</p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowConfirmDeleteBien(false)}>Annuler</button>
              <button onClick={doDeleteBien} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>🗑️ Supprimer définitivement</button>
            </div>
          </div>
        </div>
        </Portail>
      )}

      {/* ═══ MODAL CONFIRM VISITE DOUBLON ═══ */}
      {showConfirmVisite && (
        <Portail>
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowConfirmVisite(null); }}>
          <div className={styles.modal} style={{ maxWidth: 420 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>📅 Visite déjà planifiée</h2>
              <button className={styles.modalClose} onClick={() => setShowConfirmVisite(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Une visite est déjà planifiée pour ce bien. Voulez-vous la remplacer par une nouvelle ?</p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowConfirmVisite(null)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={doRemplacerVisite}>Remplacer la visite</button>
            </div>
          </div>
        </div>
        </Portail>
      )}

      {showMail && <FenetreMail contact={client as unknown as ContactMail} rechercheId={rechercheId || null} onFermer={() => setShowMail(false)} onEnvoye={() => { void load(); }} />}

      {/* ═══ MODAL ENVOI ═══ */}
      {showEnvoi && (() => {
        /* V3.87 — Envoyer à Camille : trois choix clairs. « Présentation des
           services » ne faisait rien (« V2 ») : il est parti ; « Mail libre »
           et le bouton « Mail » n'en font plus qu'un. */
        const nbBiens = biens.filter(b => b.badge_retour !== 'refuse').length;
        const nbVisites = visites.filter(v => v.statut === 'effectuee').length;
        const CHOIX: { k: string; ic: string; lib: string; sous: string; ok: boolean; go: () => void }[] = [
          { k: 'mail', ic: 'mail', lib: 'Un mail', sous: 'Écrire un message, son adresse déjà mise. Avec ou sans pièce jointe.', ok: true, go: () => setShowMail(true) },
          { k: 'biens', ic: 'maison', lib: 'Des biens', sous: nbBiens ? `${nbBiens > 1 ? `${nbBiens} biens` : '1 bien'} dans sa fiche : tu choisis lesquels, photos, prix et lien.` : 'Aucun bien dans sa fiche : ajoute-en depuis « Rapprochement » ou « + Ajouter un bien ».', ok: nbBiens > 0, go: () => openEnvoiMulti() },
          { k: 'visites', ic: 'calendrier', lib: 'Un compte rendu de visite', sous: nbVisites ? `${nbVisites > 1 ? `${nbVisites} visites faites` : '1 visite faite'} : il part depuis l’onglet Visites.` : 'Aucune visite faite pour l’instant.', ok: nbVisites > 0, go: () => setTab('visites') },
        ];
        return (
          <Portail>
          <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowEnvoi(false); }}>
            <div className={styles.modal} style={{ maxWidth: 560 }}>
              <div className={styles.modalHeader}>
                <div>
                  <h2 className={styles.modalTitle}>{`Envoyer à ${client.prenom || 'ce client'}`}</h2>
                  <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>Que veux-tu lui envoyer ?</div>
                </div>
                <button className={styles.modalClose} onClick={() => setShowEnvoi(false)}>✕</button>
              </div>
              <div className={styles.modalBody} style={{ gap: 10 }}>
                {CHOIX.map(x => (
                  <button key={x.k} type="button" disabled={!x.ok} className="fc-envoi-choix"
                    onClick={() => { setShowEnvoi(false); x.go(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 16px', borderRadius: 14, border: `1.5px solid ${x.ok ? '#e3e8f0' : '#eef1f6'}`, background: x.ok ? 'white' : '#fafbfc', cursor: x.ok ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left', opacity: x.ok ? 1 : 0.62, transition: 'border-color .15s, background .15s, box-shadow .15s' }}>
                    <span style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: x.ok ? 'var(--emilio-fond)' : '#eef2f7', color: x.ok ? '#e8c96a' : '#94a3b8' }}>
                      <Icone nom={x.ic} taille={20} epaisseur={1.9} />
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                      <b style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 15, fontWeight: 800, color: 'var(--emilio)' }}>{x.lib}</b>
                      <span style={{ fontSize: 12.5, lineHeight: 1.45, color: '#64748b' }}>{x.sous}</span>
                    </span>
                    {x.ok && <span style={{ color: '#a07c28', display: 'flex', flexShrink: 0, transform: 'rotate(-90deg)' }}><Icone nom="chevron" taille={18} epaisseur={2.2} /></span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
          </Portail>
        );
      })()}

      {/* ═══ MODAL FICHE BIEN ═══ */}
      {showFicheBien && editBienForm && (
        <Portail>
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowFicheBien(false); }}>
          <div className={styles.modal} style={{ maxWidth: 720 }}>

            {/* Header */}
            <div className={`${styles.modalHeader} fc-fb-tete`} style={{ background: 'var(--emilio-fond)', borderRadius: '20px 20px 0 0', borderBottom: 'none', padding: '20px 24px' }}>
              <div>
                <h2 style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 17, color: 'white', margin: 0 }}>
                  {editBienForm.type_bien || '🏠'} — {editBienForm.titre?.substring(0, 45) || 'Détail du bien'}
                </h2>
                {(editBienForm.ville || editBienForm.prix_vendeur) && (
                  <div style={{ marginTop: 4, display: 'flex', gap: 12, alignItems: 'center' }}>
                    {editBienForm.ville && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>📍 {editBienForm.ville}{editBienForm.code_postal ? ` (${editBienForm.code_postal})` : ''}</span>}
                    {/* V3.50 : un mandat de l'agence montre son prix affiché, pas le net vendeur. */}
                    {(editBienForm.bien_vente_id ? editBienForm.prix_acquereur : editBienForm.prix_vendeur) && <span style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c' }}>{parseFloat(editBienForm.bien_vente_id ? editBienForm.prix_acquereur : editBienForm.prix_vendeur).toLocaleString('fr-FR')}€</span>}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => deleteBien(ficheBienId)}
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  🗑️ Supprimer
                </button>
                <button onClick={() => setShowFicheBien(false)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>

            <div className={styles.modalBody}>

              {/* ── PHOTOS ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <label className={styles.lbl} style={{ marginBottom: 0 }}>Photos ({editBienForm.photos?.length || 0})</label>
                  {editBienForm.photos?.length > 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>🖱️ Glisser-déposer pour réordonner · ✕ supprimer · 1ère = couverture</span>}
                </div>

                {editBienForm.photos?.length > 0 ? (
                  <div className="fc-photos" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
                    {editBienForm.photos.map((p: string, i: number) => (
                      <div
                        key={i}
                        draggable
                        onDragStart={() => { dragIdxRef.current = i; }}
                        onDragOver={e => { e.preventDefault(); setDragOverIdx(i); }}
                        onDragLeave={() => setDragOverIdx(null)}
                        onDrop={e => {
                          e.preventDefault();
                          const from = dragIdxRef.current;
                          if (from === i || from === -1) { setDragOverIdx(null); return; }
                          const arr = [...editBienForm.photos];
                          const [removed] = arr.splice(from, 1);
                          arr.splice(i, 0, removed);
                          setEditBienForm((f: any) => ({ ...f, photos: arr }));
                          dragIdxRef.current = -1;
                          setDragOverIdx(null);
                        }}
                        onDragEnd={() => { dragIdxRef.current = -1; setDragOverIdx(null); }}
                        style={{
                          position: 'relative', borderRadius: 12, overflow: 'hidden',
                          aspectRatio: '4/3', background: '#f1f5f9', cursor: 'grab',
                          border: dragOverIdx === i ? '2px solid #c9a84c' : '2px solid transparent',
                          transform: dragOverIdx === i ? 'scale(1.03)' : 'scale(1)',
                          transition: 'transform 0.15s, border 0.15s',
                          boxShadow: dragOverIdx === i ? '0 8px 24px rgba(201,168,76,0.25)' : '0 1px 3px rgba(0,0,0,0.08)',
                        }}>
                        <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} onError={e => { (e.target as HTMLImageElement).parentElement!.style.opacity = '0.3'; }} />
                        {/* Badge couverture */}
                        {i === 0 && (
                          <span style={{ position: 'absolute', bottom: 7, left: 7, background: 'linear-gradient(135deg,#c9a84c,#e8c96a)', color: 'var(--emilio)', fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 8, letterSpacing: 0.8, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>⭐ COUVERTURE</span>
                        )}
                        {/* Indicateur drag */}
                        <div style={{ position: 'absolute', top: 7, left: 7, background: 'rgba(0,0,0,0.4)', color: 'white', fontSize: 10, padding: '2px 6px', borderRadius: 6, opacity: 0.8 }}>⠿ {i+1}</div>
                        {/* Bouton supprimer */}
                        <button
                          onClick={e => { e.stopPropagation(); setEditBienForm((f: any) => ({ ...f, photos: f.photos.filter((_: string, j: number) => j !== i) })); }}
                          style={{ position: 'absolute', top: 5, right: 5, width: 26, height: 26, borderRadius: 8, background: 'rgba(239,68,68,0.9)', border: 'none', color: 'white', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>✕</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ background: '#f8fafc', border: '2px dashed #e3e8f0', borderRadius: 12, padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
                    <div style={{ fontWeight: 600 }}>Aucune photo</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Ajoutez des URLs ci-dessous</div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className={styles.inp}
                    value={newPhotoUrl}
                    onChange={e => setNewPhotoUrl(e.target.value)}
                    placeholder="Coller l'URL d'une photo (clic droit → Copier l'adresse de l'image)"
                    style={{ flex: 1, fontSize: 12 }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newPhotoUrl.trim().startsWith('http')) {
                        setEditBienForm((f: any) => ({ ...f, photos: [...(f.photos || []), newPhotoUrl.trim()] }));
                        setNewPhotoUrl('');
                      }
                    }}
                  />
                  <button
                    className={styles.btn}
                    onClick={() => {
                      if (newPhotoUrl.trim().startsWith('http')) {
                        setEditBienForm((f: any) => ({ ...f, photos: [...(f.photos || []), newPhotoUrl.trim()] }));
                        setNewPhotoUrl('');
                      }
                    }}>+ Ajouter</button>
                </div>
              </div>

              {/* ── INFOS BIEN ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Groupe localisation */}
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, border: '1px solid #e3e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>📍 Localisation & Identification</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className={styles.lbl}>Titre</label>
                  <input className={styles.inp} value={editBienForm.titre||''} onChange={e => setEditBienForm((f: any) => ({ ...f, titre: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>Type</label>
                  <select className={styles.inp} value={editBienForm.type_bien||'Appartement'} onChange={e => setEditBienForm((f: any) => ({ ...f, type_bien: e.target.value }))}>
                    {['Appartement','Maison','Loft','Studio','Duplex','Villa','Terrain'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={styles.lbl}>Source / Portail</label>
                  <input className={styles.inp} value={editBienForm.source_portail||''} onChange={e => setEditBienForm((f: any) => ({ ...f, source_portail: e.target.value }))} placeholder="SeLoger, LeBonCoin..." />
                </div>
                <div>
                  <label className={styles.lbl}>Ville</label>
                  <input className={styles.inp} value={editBienForm.ville||''} onChange={e => setEditBienForm((f: any) => ({ ...f, ville: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>Code postal</label>
                  <input className={styles.inp} value={editBienForm.code_postal||''} onChange={e => setEditBienForm((f: any) => ({ ...f, code_postal: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className={styles.lbl}>URL de l'annonce</label>
                  <input className={styles.inp} value={editBienForm.url||''} onChange={e => setEditBienForm((f: any) => ({ ...f, url: e.target.value }))} placeholder="https://..." />
                </div>
                </div>
              </div>

              {/* Groupe caractéristiques */}
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, border: '1px solid #e3e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>📐 Caractéristiques</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className={styles.lbl}>Surface m²</label>
                  <input className={styles.inp} type="number" value={editBienForm.surface||''} onChange={e => setEditBienForm((f: any) => ({ ...f, surface: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>Pièces</label>
                  <input className={styles.inp} type="number" value={editBienForm.nb_pieces||''} onChange={e => setEditBienForm((f: any) => ({ ...f, nb_pieces: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>Chambres</label>
                  <input className={styles.inp} type="number" value={editBienForm.nb_chambres||''} onChange={e => setEditBienForm((f: any) => ({ ...f, nb_chambres: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>Étage</label>
                  <input className={styles.inp} type="number" value={editBienForm.etage||''} onChange={e => setEditBienForm((f: any) => ({ ...f, etage: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>DPE</label>
                  <select className={styles.inp} value={editBienForm.dpe||''} onChange={e => setEditBienForm((f: any) => ({ ...f, dpe: e.target.value }))}>
                    <option value="">—</option>
                    {['A','B','C','D','E','F','G'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--emilio)' }}>
                    <input type="checkbox" checked={editBienForm.parking||false} onChange={e => setEditBienForm((f: any) => ({ ...f, parking: e.target.checked }))} style={{ accentColor: '#34496e', width: 16, height: 16 }} />
                    🅿️ Parking / Garage inclus
                  </label>
                </div>
                </div>
              </div>

              {/* Groupe prix — V3.50 : un mandat de l'agence garde le prix de sa
                  fiche (honoraires de l'agence compris) ; il ne se recalcule pas ici. */}
              {editBienForm.bien_vente_id ? (
                <div style={{ background: '#fffbeb', borderRadius: 12, padding: 14, border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>💰 Prix</div>
                  <div style={{ background: 'white', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>Prix affiché</span>
                    <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 18, color: '#c9a84c' }}>
                      {editBienForm.prix_acquereur ? ecrireMontant(Number(editBienForm.prix_acquereur)) : '—'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#92400e', marginTop: 8, lineHeight: 1.5 }}>
                    {'Ce bien est un mandat de l’agence : son prix et les honoraires de l’agence se changent sur la fiche du bien.'}
                  </div>
                </div>
              ) : (
              <div style={{ background: '#fffbeb', borderRadius: 12, padding: 14, border: '1px solid #fde68a' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>💰 Prix & Commission</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className={styles.lbl}>Prix vendeur €</label>
                  <input className={styles.inp} type="number" value={editBienForm.prix_vendeur||''} onChange={e => setEditBienForm((f: any) => ({ ...f, prix_vendeur: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>Commission</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select className={styles.inp} style={{ width: 72 }} value={editBienForm.commission_type} onChange={e => setEditBienForm((f: any) => ({ ...f, commission_type: e.target.value }))}>
                      <option value="pourcentage">%</option>
                      <option value="montant">€</option>
                    </select>
                    <input className={styles.inp} type="number" value={editBienForm.commission_val||''} onChange={e => setEditBienForm((f: any) => ({ ...f, commission_val: e.target.value }))} />
                  </div>
                </div>
                {editBienForm.prix_vendeur && editBienForm.commission_val && (
                  <div style={{ gridColumn: '1/-1', background: 'white', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>Prix acquéreur estimé</span>
                    <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 18, color: '#c9a84c' }}>
                      {(editBienForm.commission_type === 'pourcentage'
                        ? Math.round((parseFloat(editBienForm.prix_vendeur)||0) * (1 + (parseFloat(editBienForm.commission_val)||0) / 100))
                        : (parseFloat(editBienForm.prix_vendeur)||0) + (parseFloat(editBienForm.commission_val)||0)
                      ).toLocaleString('fr-FR')}€
                    </span>
                  </div>
                )}
                </div>
              </div>
              )}

              {/* Groupe agence */}
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, border: '1px solid #e3e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>🏢 Agence</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className={styles.lbl}>Nom de l'agence</label>
                  <input className={styles.inp} value={editBienForm.agence_nom||''} onChange={e => setEditBienForm((f: any) => ({ ...f, agence_nom: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>Tél. agence</label>
                  <input className={styles.inp} value={editBienForm.agence_tel||''} onChange={e => setEditBienForm((f: any) => ({ ...f, agence_tel: e.target.value }))} />
                </div>
                </div>
              </div>

              {/* Description */}
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, border: '1px solid #e3e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>📝 Description</div>
                  <button
                    onClick={reformulerDescription}
                    disabled={reformuling || !editBienForm?.description}
                    style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit', opacity: reformuling ? 0.6 : 1 }}>
                    {reformuling ? '⏳ Reformulation...' : '✨ Reformuler avec IA'}
                  </button>
                </div>
                <textarea className={styles.inp} rows={5} value={editBienForm.description||''} onChange={e => setEditBienForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="Description du bien..." style={{ background: 'white' }} />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>💡 Le bouton IA reformule en style chasseur immo professionnel (nécessite la clé Anthropic)</div>
              </div>

              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowFicheBien(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveFicheBien} disabled={saving}>
                {saving ? '⏳ Sauvegarde...' : '✓ Sauvegarder les modifications'}
              </button>
            </div>
          </div>
        </div>
        </Portail>
      )}

      {showEnvoiBien && (
        <Portail>
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowEnvoiBien(false); }}>
          <div className={styles.modal} style={{ maxWidth: 680 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {envoiMode === 'unique' && '📤 Envoyer ce bien au client'}
                {envoiMode === 'multi' && '📤 Envoyer une sélection de biens'}
                {envoiMode === 'libre' && '✉️ Envoyer un mail libre'}
              </h2>
              <button className={styles.modalClose} onClick={() => setShowEnvoiBien(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>

              {/* MODE UNIQUE : aperçu du bien */}
              {envoiMode === 'unique' && (() => {
                const b = biens.find(x => x.id === envoiBienId);
                return b ? (
                  <div style={{ background: '#faf6ee', border: '1px solid #e3e8f0', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 10, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, overflow: 'hidden', flexShrink: 0 }}>
                      {b.photos?.[0] ? <img src={b.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🏠'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--emilio)' }}>{b.titre || `${b.type_bien||'Bien'} — ${b.ville||'—'}`}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{[b.surface && `${b.surface}m²`, b.nb_pieces && `${b.nb_pieces}P`, b.ville].filter(Boolean).join(' · ')}</div>
                    </div>
                    {b.prix_acquereur && <div style={{ fontWeight: 800, fontSize: 16, color: '#c9a84c' }}>{b.prix_acquereur.toLocaleString('fr-FR')}€</div>}
                  </div>
                ) : null;
              })()}

              {/* MODE MULTI : checkboxes pour sélection */}
              {envoiMode === 'multi' && (
                <div>
                  <label className={styles.lbl}>Biens à inclure dans le mail <span style={{ fontWeight: 400, color: '#94a3b8' }}>({envoiBienIds.length}/{biensDuMail.length})</span></label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <button type="button" onClick={() => setEnvoiBienIds(biensDuMail.map(b => b.id))} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}>Tout sélectionner</button>
                    <button type="button" onClick={() => setEnvoiBienIds([])} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}>Tout désélectionner</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto', border: '1px solid #e3e8f0', borderRadius: 10, padding: 8, background: '#fafbfc' }}>
                    {biensDuMail.map(b => {
                      const checked = envoiBienIds.includes(b.id);
                      return (
                        <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${checked ? '#c9a84c' : '#e3e8f0'}`, background: checked ? '#faf6ee' : 'white', cursor: 'pointer', transition: 'all 0.12s' }}>
                          <input type="checkbox" checked={checked} onChange={e => { if (e.target.checked) setEnvoiBienIds(prev => [...prev, b.id]); else setEnvoiBienIds(prev => prev.filter(id => id !== b.id)); }} style={{ accentColor: '#34496e', width: 16, height: 16, flexShrink: 0 }} />
                          <div style={{ width: 38, height: 38, borderRadius: 6, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, overflow: 'hidden', flexShrink: 0 }}>
                            {b.photos?.[0] ? <img src={b.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🏠'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--emilio)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.titre || `${b.type_bien||'Bien'} — ${b.ville||'—'}`}</div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{[b.surface && `${b.surface}m²`, b.nb_pieces && `${b.nb_pieces}P`, b.ville].filter(Boolean).join(' · ')}</div>
                          </div>
                          {b.prix_acquereur && <div style={{ fontWeight: 700, fontSize: 13, color: '#c9a84c', flexShrink: 0 }}>{b.prix_acquereur.toLocaleString('fr-FR')}€</div>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div><label className={styles.lbl}>Destinataire(s) <span style={{ fontWeight: 400, color: '#94a3b8' }}>(séparés par virgule)</span></label>
                <input className={styles.inp} value={envoiForm.destinataires} onChange={e => setEnvoiForm(f => ({ ...f, destinataires: e.target.value }))} placeholder="email@client.fr" />
              </div>
              <div><label className={styles.lbl}>Objet</label>
                <input className={styles.inp} value={envoiForm.objet} onChange={e => setEnvoiForm(f => ({ ...f, objet: e.target.value }))} />
              </div>
              <div><label className={styles.lbl}>Corps du message</label>
                <textarea className={styles.inp} rows={8} value={envoiForm.corps} onChange={e => setEnvoiForm(f => ({ ...f, corps: e.target.value }))} style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }} />
              </div>

              {envoiMode !== 'libre' && envoiBienIds.length > 0 && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1e40af' }}>
                  {envoiBienIds.length > BIENS_PAR_MAIL
                    ? `ℹ️ Le mail montrera ${BIENS_PAR_MAIL} biens en détail (ceux que tu as ajoutés toi-même, puis les mieux notés par la veille), puis un bouton « Découvrir les ${envoiBienIds.length - BIENS_PAR_MAIL} autres » qui ouvre son espace sur ses nouveaux biens.`
                    : `ℹ️ Le mail inclura ${envoiBienIds.length} bien${envoiBienIds.length > 1 ? 's' : ''} avec un bouton « Consulter le bien » vers la fiche complète.`}
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowEnvoiBien(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveEnvoiBien} disabled={envoiSending || !envoiForm.destinataires || (envoiMode !== 'libre' && envoiBienIds.length === 0)}>
                {envoiSending ? '⏳ Envoi...' : `📤 Envoyer${envoiMode === 'multi' && envoiBienIds.length > 0 ? ` (${envoiBienIds.length} biens)` : ''}`}
              </button>
            </div>
          </div>
        </div>
        </Portail>
      )}

      {/* ═══ MODAL PLANIFIER VISITE ═══ */}
      {showPlanVisite && (
        <Portail>
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowPlanVisite(false); }}>
          <div className={styles.modal} style={{ maxWidth: 500 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>📅 Planifier une visite</h2><button className={styles.modalClose} onClick={() => setShowPlanVisite(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div>
                <label className={styles.lbl}>
                  {planVisteForm.bien_ids.length > 1 ? `${planVisteForm.bien_ids.length} biens à visiter` : 'Bien à visiter'}
                </label>
                {/* Le bien d'où l'on vient est déjà choisi : on l'affiche, on ne
                    redemande pas de le sélectionner dans une liste. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {planVisteForm.bien_ids.map(id => {
                    const b = biens.find(x => x.id === id);
                    if (!b) return null;
                    return (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, border: '2px solid var(--emilio)', background: '#f8fafc' }}>
                        {b.photos?.[0]
                          ? <img src={b.photos[0]} alt="" style={{ width: 52, height: 52, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 52, height: 52, borderRadius: 9, background: '#eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🏠</div>}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--emilio)' }}>{b.titre || `${b.type_bien||'Bien'} — ${b.ville||'—'}`}</div>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            {[b.surface ? `${b.surface} m²` : '', b.nb_pieces ? `${b.nb_pieces}P` : '', b.ville || ''].filter(Boolean).join(' · ')}
                            {b.prix_acquereur ? ` · ${Number(b.prix_acquereur).toLocaleString('fr-FR')} €` : ''}
                          </div>
                        </div>
                        {planVisteForm.bien_ids.length > 1 && (
                          <button onClick={() => setPlanVisiteForm(f => ({ ...f, bien_ids: f.bien_ids.filter(x => x !== id) }))}
                            title="Retirer de cette visite"
                            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 17, cursor: 'pointer', padding: 4, lineHeight: 1 }}>✕</button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Plusieurs biens sur le même créneau : on enchaîne les visites
                    dans la même après-midi, c'est le cas courant. */}
                {(() => {
                  const dispo = biens.filter(b =>
                    !planVisteForm.bien_ids.includes(b.id) && b.badge_retour !== 'refuse');
                  if (!dispo.length) return null;
                  if (!ajoutVisite) {
                    return (
                      <button onClick={() => setAjoutVisite(true)}
                        style={{ marginTop: 10, width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px dashed #cbd5e1', background: 'white', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        ＋ Ajouter un autre bien à cette visite
                      </button>
                    );
                  }
                  return (
                    <div style={{ marginTop: 10, border: '1px solid #e3e8f0', borderRadius: 12, padding: 10, background: '#fbfcfe' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .6, marginBottom: 8 }}>À ajouter au même créneau</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                        {dispo.map(b => (
                          <button key={b.id}
                            onClick={() => { setPlanVisiteForm(f => ({ ...f, bien_ids: [...f.bien_ids, b.id] })); setAjoutVisite(false); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, border: '1px solid #e3e8f0', background: 'white', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
                            {b.photos?.[0]
                              ? <img src={b.photos[0]} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                              : <div style={{ width: 40, height: 40, borderRadius: 8, background: '#eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🏠</div>}
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: 'block', fontWeight: 700, fontSize: 13, color: 'var(--emilio)' }}>{b.titre || `${b.type_bien||'Bien'} — ${b.ville||'—'}`}</span>
                              <span style={{ display: 'block', fontSize: 11.5, color: '#64748b', marginTop: 1 }}>
                                {[b.surface ? `${b.surface} m²` : '', b.ville || '', (b.etape === 'presente' ? 'présenté' : 'en sélection')].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setAjoutVisite(false)}
                        style={{ marginTop: 8, background: 'none', border: 'none', color: '#64748b', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Annuler</button>
                    </div>
                  );
                })()}
              </div>
              <div className={styles.formRow}>
                <div><label className={styles.lbl}>Date de la visite</label><input className={styles.inp} type="date" value={planVisteForm.date} onChange={e => setPlanVisiteForm(f => ({ ...f, date: e.target.value }))} /></div>
                <div><label className={styles.lbl}>Heure</label><input className={styles.inp} type="time" value={planVisteForm.heure} onChange={e => setPlanVisiteForm(f => ({ ...f, heure: e.target.value }))} /></div>
              </div>
              <div><label className={styles.lbl}>Contact agence / vendeur</label><input className={styles.inp} value={planVisteForm.contact} onChange={e => setPlanVisiteForm(f => ({ ...f, contact: e.target.value }))} placeholder="Nom, téléphone, email..." /></div>
              <div><label className={styles.lbl}>Notes préparatoires</label><textarea className={styles.inp} rows={2} value={planVisteForm.notes} onChange={e => setPlanVisiteForm(f => ({ ...f, notes: e.target.value }))} placeholder="Points à vérifier, documents à apporter..." /></div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowPlanVisite(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={savePlanVisite} disabled={!planVisteForm.bien_ids.length}>
                📅 {planVisteForm.bien_ids.length > 1 ? `Confirmer les ${planVisteForm.bien_ids.length} visites` : 'Confirmer la visite'}
              </button>
            </div>
          </div>
        </div>
        </Portail>
      )}

      {/* ═══ COMPTE RENDU DE VISITE ═══ */}
      {crVisite && (() => {
        const b = biens.find(y => y.id === crVisite.bien_id);
        const d = crVisite.date_visite ? new Date(`${String(crVisite.date_visite).slice(0, 10)}T12:00:00`) : null;
        const sous = [d && !isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '', crVisite.heure ? `à ${String(crVisite.heure).slice(0, 5)}` : ''].filter(Boolean).join(' ');
        return (
          <CompteRenduVisite visite={crVisite} titre={b?.titre || b?.ville || 'Bien'} sous={sous}
            prenom={client.prenom || ''} onFermer={() => setCrVisite(null)} onValider={saveCompteRendu} />
        );
      })()}

      {showAction && (
        <Portail>
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: 720 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>{actionEdit ? '✏️ Modifier l\'action' : appelDirect ? '📞 Noter un appel' : '+ Ajouter une action'}</h2><button className={styles.modalClose} onClick={fermerAction}>✕</button></div>
            <div className={styles.modalBody}>
              {/* Le rendez-vous se prend dans l'agenda : ce bouton y mène, la
                  fenêtre « Nouveau rendez-vous » ouverte et ce dossier choisi. */}
              {!actionEdit && !appelDirect && rechercheActive && (
                <button type="button" className="fc-rdv-agenda"
                  onClick={() => { demanderRendezVous(rechercheActive.id); fermerAction(); onNavigate('agenda'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 16px', borderRadius: 14, border: '1.5px solid #ecdcae', background: 'linear-gradient(135deg, #fffaf0 0%, #fbf1d8 100%)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'var(--emilio)' }}>
                  <span style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--emilio-fond)', color: '#c9a84c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icone nom="calendrier" taille={21} epaisseur={2} />
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                    <b style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 15.5, fontWeight: 800 }}>Créer un rendez-vous</b>
                    <span style={{ fontSize: 12.5, color: '#5b6678', lineHeight: 1.45 }}>{`Visite, rendez-vous, appel ou signature, dans l’agenda. ${client.prenom || 'Le client'} est déjà choisi.`}</span>
                  </span>
                  <span style={{ color: '#8a6a1f', display: 'flex', flexShrink: 0 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></span>
                </button>
              )}
              {!actionEdit && !appelDirect && rechercheActive && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                  <span style={{ flex: 1, height: 1, background: '#eef1f6' }} /><span>ou noter une action</span><span style={{ flex: 1, height: 1, background: '#eef1f6' }} />
                </div>
              )}
              <div>
                <label className={styles.lbl}>Type d'action</label>
                <div className="fc-types-action" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  {[{v:'appel',l:'📞 Appel passé'},{v:'rdv',l:'🤝 RDV physique'},{v:'note',l:'📝 Note libre'},{v:'relance_manuelle',l:'🔔 Relance manuelle'},{v:'envoi_externe',l:'📤 Envoi externe'},{v:'email_libre',l:'✉️ Email envoyé'}].map(o => (<button key={o.v} onClick={() => setActionF(f => ({ ...f, type: o.v, titre: titreAuto(f.titre) ? o.l.split(' ').slice(1).join(' ') : f.titre }))} style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${actionF.type === o.v ? 'var(--emilio)' : '#e2e8f0'}`, background: actionF.type === o.v ? 'var(--emilio)' : 'white', color: actionF.type === o.v ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.12s' }}>{o.l}</button>))}
                </div>
              </div>
              {actionF.type === 'appel' && (() => {
                /* Un clic au lieu de taper « messagerie » dans le titre. « A
                   répondu » envoie droit aux notes ; les autres n'en demandent
                   pas : une relance, et « Ajouter au journal ». */
                const choisir = (x: typeof ISSUES_APPEL[number]) => {
                  const deja = actionF.titre.trim() === x.titre;
                  setActionF(f => ({ ...f, titre: deja ? 'Appel passé' : x.titre }));
                  if (!deja && x.k === 'repondu') setTimeout(() => notesAction.current?.focus(), 30);
                };
                return (
                  <div>
                    <label className={styles.lbl}>Comment ça s&apos;est passé ?</label>
                    <div className="fc-issues" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 8 }}>
                      {ISSUES_APPEL.map(x => {
                        const on = actionF.titre.trim() === x.titre;
                        return (
                          <button type="button" key={x.k} onClick={() => choisir(x)} aria-pressed={on}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 8px', borderRadius: 11, border: `1.5px solid ${on ? x.c : '#e3e8f0'}`, background: on ? x.bg : 'white', color: on ? x.c : '#52607a', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all .12s' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: x.c, flexShrink: 0 }} />{x.lib}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              <div><label className={styles.lbl}>Titre <span style={{fontWeight:400,color:'#94a3b8'}}>(optionnel)</span></label><input className={styles.inp} value={actionF.titre} onChange={e => setActionF(f => ({ ...f, titre: e.target.value }))} placeholder="Ex: Appel de suivi, RDV agence..." /></div>
              <div><label className={styles.lbl}>Notes / Détails</label><textarea ref={notesAction} className={styles.inp} rows={4} value={actionF.description} onChange={e => setActionF(f => ({ ...f, description: e.target.value }))}
                placeholder={actionF.type === 'appel' && (actionF.titre === 'Appel — messagerie' || actionF.titre === 'Appel — pas de réponse') ? 'Facultatif — ex. : message laissé, rappeler après 18 h' : 'Ce dont on a discuté, ce qui a été convenu...'} /></div>
              {!actionEdit && (
                <CloreRelances relances={relancesAtt} cochees={aClore} onChange={setAClore} nouvelle={!!actionF.relance} />
              )}
              {(() => {
                /* Une date, et rien d'autre : le reste — qui, pourquoi — est déjà
                   au-dessus. Les raccourcis évitent de compter les jours de tête.
                   En modification, le champ porte la date de la relance existante :
                   la changer la déplace, la vider la supprime. */
                const jourPlus = (j: number) => {
                  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + j);
                  return d.toISOString().split('T')[0];
                };
                const RACCOURCIS: [string, number][] = [['Demain', 1], ['Dans 3 j', 3], [`Dans ${delaiJours} j`, delaiJours], ['Dans 15 j', 15], ['Dans 1 mois', 30]];
                const pose = !!actionF.relance;
                return (
                  <div style={{ background: pose ? '#fffbf4' : '#fbfcfe', border: `1px solid ${pose ? '#ecdcb4' : '#eef2f7'}`, borderRadius: 12, padding: '12px 14px' }}>
                    <label className={styles.lbl} style={{ marginBottom: 8 }}>
                      🔔 Prochaine relance <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optionnel)</span>
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 9 }}>
                      <button type="button" onClick={() => setActionF(f => ({ ...f, relance: '' }))}
                        style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${!pose ? '#94a3b8' : '#e3e8f0'}`, background: !pose ? '#f1f4f8' : 'white', color: !pose ? 'var(--emilio)' : '#64748b', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Aucune
                      </button>
                      {RACCOURCIS.map(([lib, j]) => {
                        const d = jourPlus(j);
                        const actif = actionF.relance === d;
                        return (
                          <button type="button" key={lib} onClick={() => setActionF(f => ({ ...f, relance: actif ? '' : d }))}
                            style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${actif ? '#c9a84c' : '#e3e8f0'}`, background: actif ? 'var(--emilio)' : 'white', color: actif ? '#f2dfa6' : '#64748b', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {lib}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                      <ChoixDate valeur={actionF.relance} min={new Date().toISOString().split('T')[0]}
                        placeholder="Choisir une autre date"
                        onChange={(v) => setActionF(f => ({ ...f, relance: v }))} />
                    </div>
                    <div style={{ fontSize: 11.5, color: pose ? '#a9822f' : '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                      {pose
                        ? (actionRelanceId
                          ? `Relance déplacée au ${new Date(`${actionF.relance}T12:00:00`).toLocaleDateString('fr-FR')} — videz le champ pour la supprimer.`
                          : `Elle apparaîtra dans « Relances » — à venir jusqu'au ${new Date(`${actionF.relance}T12:00:00`).toLocaleDateString('fr-FR')}, à faire ensuite.`)
                        : (actionRelanceId
                          ? 'La relance rattachée sera supprimée.'
                          : 'Laissez vide si rien n\'est à rappeler.')}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                /* Une action se rattache à ce que le client a vu : seuls les biens
                   déjà présentés sont proposés ici. Photo, prix et statut, pour
                   reconnaître le bien sans avoir à lire une ligne de texte brut. */
                const proposes = biens.filter(b => b.etape === 'presente');
                if (proposes.length === 0) return null;
                const aucun = !actionF.bien_id;
                return (
                  <div>
                    <label className={styles.lbl}>🏠 Concerne un bien <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optionnel · {proposes.length} présenté{proposes.length > 1 ? 's' : ''})</span></label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 252, overflowY: 'auto', border: '1px solid #e3e8f0', borderRadius: 10, padding: 8, background: '#fafbfc' }}>

                      <button type="button" onClick={() => setActionF(f => ({ ...f, bien_id: '' }))}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, border: `1.5px solid ${aucun ? '#c9a84c' : '#e3e8f0'}`, background: aucun ? '#faf6ee' : 'white', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.12s' }}>
                        <span style={{ flexShrink: 0, width: 16, height: 16, borderRadius: '50%', border: `2px solid ${aucun ? '#c9a84c' : '#cbd5e1'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          {aucun && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c9a84c' }} />}
                        </span>
                        <span style={{ width: 38, height: 38, borderRadius: 6, background: '#eef2f7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>💬</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 600, fontSize: 13, color: 'var(--emilio)' }}>Aucun bien en particulier</span>
                          <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Suivi général du dossier</span>
                        </span>
                      </button>

                      {proposes.map(b => {
                        const actif = actionF.bien_id === b.id;
                        const badge = BADGES[b.badge_retour] || BADGES.propose;
                        return (
                          <button type="button" key={b.id} onClick={() => setActionF(f => ({ ...f, bien_id: b.id }))}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${actif ? '#c9a84c' : '#e3e8f0'}`, background: actif ? '#faf6ee' : 'white', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.12s' }}>
                            <span style={{ flexShrink: 0, width: 16, height: 16, borderRadius: '50%', border: `2px solid ${actif ? '#c9a84c' : '#cbd5e1'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              {actif && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c9a84c' }} />}
                            </span>
                            <span style={{ width: 38, height: 38, borderRadius: 6, background: '#e2e8f0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, overflow: 'hidden', flexShrink: 0 }}>
                              {b.photos?.[0] ? <img src={b.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🏠'}
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: 'block', fontWeight: 600, fontSize: 13, color: 'var(--emilio)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.titre || `${b.type_bien || 'Bien'} — ${b.ville || '—'}`}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                <span style={{ fontSize: 11, color: '#64748b' }}>{[b.surface && `${b.surface} m²`, b.nb_pieces && `${b.nb_pieces}P`, b.ville].filter(Boolean).join(' · ') || '—'}</span>
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: badge.color, background: badge.bg, border: `1px solid ${badge.color}2e`, borderRadius: 20, padding: '1px 7px', whiteSpace: 'nowrap' }}>{badge.label}</span>
                              </span>
                            </span>
                            {b.prix_acquereur ? <span style={{ fontWeight: 700, fontSize: 13, color: '#c9a84c', flexShrink: 0 }}>{b.prix_acquereur.toLocaleString('fr-FR')} €</span> : null}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>💡 Ex : « Appel — visite non aboutie » rattaché au bien concerné, pour un meilleur suivi.</div>
                  </div>
                );
              })()}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={fermerAction}>Annuler</button>
              {/* Une seule chaîne : le bouton est en flex, deux morceaux s'y
                  mettaient côte à côte en deux colonnes sur téléphone. */}
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveAction}>
                {actionEdit ? '✓ Enregistrer'
                  : actionF.relance ? `✓ Ajouter au journal · relance le ${new Date(`${actionF.relance}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                  : '✓ Ajouter au journal'}
              </button>
            </div>
          </div>
        </div>
        </Portail>
      )}
    </div>
  );
}
