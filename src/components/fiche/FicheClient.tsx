'use client';
import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { supabase, addJournal } from '@/lib/supabase';
import { programmerRelance, delaiRelance, echeanceDans } from '@/lib/relances';
import type { Client, Recherche } from '@/lib/supabase';
import styles from './FicheClient.module.css';
import SecteurPicker from '@/components/shared/SecteurPicker';
import ArretPicker, { PastilleArret } from '@/components/shared/ArretPicker';
import ChoixDate from '@/components/shared/ChoixDate';
import type { Arret } from '@/lib/arrets';

/* Un critère n'est pas seulement « coché / pas coché » : il peut être
   indifférent, simplement souhaité, ou carrément indispensable.
   Un clic fait avancer d'un cran, et le troisième clic revient à zéro. */
export type Niveau = '' | 'souhaite' | 'indispensable';
const CYCLE: Niveau[] = ['', 'souhaite', 'indispensable'];

const PastilleExigence = ({ ico, libelle, niveau, onChange }: {
  ico: string; libelle: string; niveau: Niveau; onChange: (n: Niveau) => void;
}) => {
  const indisp = niveau === 'indispensable';
  const souh = niveau === 'souhaite';
  return (
    <button type="button"
      onClick={() => onChange(CYCLE[(CYCLE.indexOf(niveau) + 1) % CYCLE.length])}
      title="Un clic : souhaité — deux clics : indispensable — trois clics : indifférent"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 20,
        border: `1px solid ${indisp ? '#c9a84c' : souh ? '#10b981' : '#e2e8f0'}`,
        background: indisp ? '#1a2332' : souh ? '#ecfdf5' : 'white',
        color: indisp ? '#f2dfa6' : souh ? '#10b981' : '#64748b',
        fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.14s',
      }}>
      <span>{ico}</span><span>{libelle}</span>
      {indisp ? <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, background: '#c9a84c', color: '#1a2332', borderRadius: 6, padding: '2px 5px' }}>INDISPENSABLE</span>
        : souh ? <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: '#10b981' }}>SOUHAITÉ</span> : null}
    </button>
  );
};

/* Légende expliquant les trois niveaux, à placer sous une série de pastilles. */
const LegendeNiveaux = () => (
  <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
    <span>Cliquez une fois = <b style={{ color: '#10b981' }}>souhaité</b></span>
    <span>deux fois = <b style={{ color: '#9a7d2e' }}>indispensable</b></span>
    <span>trois fois = indifférent</span>
  </div>
);

/* Listes de choix, chacune avec son icône. Mêmes clés et mêmes intitulés
   que l'espace acheteur : le client et le chasseur lisent la même chose. */
const ETATS: [string, string, string][] = [
  ['a_renover', 'À rénover', '🔨'], ['travaux_legers', 'Travaux légers', '🧰'],
  ['bon_etat', 'Bon état', '✨'], ['refait_neuf', 'Refait à neuf', '💎'],
];
const FINANCEMENTS: [string, string, string][] = [
  ['cash', 'Cash', '💵'], ['pret_valide', 'Prêt validé', '✅'],
  ['pret_en_cours', 'Prêt en cours', '⏳'], ['a_monter', 'Prêt à monter', '📝'],
  ['pret_relais', 'Prêt relais', '🔁'],
  ['mixte_cash_pret', 'Mixte · cash + prêt', '🔀'],
  ['mixte_cash_relais', 'Mixte · cash + prêt relais', '🔀'],
  ['mixte_pret_relais', 'Mixte · prêt + prêt relais', '🔀'],
];
const URGENCES: [string, string, string][] = [
  ['immediate', 'Immédiate', '🔥'], ['3_mois', 'Sous 3 mois', '⏱️'],
  ['6_mois', 'Sous 6 mois', '📆'], ['annee', "Dans l'année", '🗓️'],
];
const CUISINES: [string, string, string][] = [
  ['', 'Indifférent', '🤷'], ['ouverte', 'Ouverte sur le séjour', '🍽️'], ['separee', 'Séparée', '🚪'],
];
/* Retrouve « 💵 Cash » à partir de la valeur enregistrée. */
const texteChoix = (table: [string, string, string][], v?: string | null) => {
  const l = table.find(x => x[0] === v);
  return l ? `${l[2]} ${l[1]}` : (v || null);
};

/* Une ligne de pastilles à choix unique — remplace les anciens menus déroulants. */
const ChoixIco = ({ table, valeur, onChange, couleur = '#1a2332' }: {
  table: [string, string, string][]; valeur: string; onChange: (v: string) => void; couleur?: string;
}) => (
  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
    {table.map(([k, l, i]) => {
      const actif = valeur === k;
      return (
        <button type="button" key={k || 'vide'} onClick={() => onChange(actif ? '' : k)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 20,
            border: `1px solid ${actif ? couleur : '#e2e8f0'}`, background: actif ? couleur : 'white',
            color: actif ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            fontFamily: 'inherit', transition: 'all 0.12s',
          }}>
          <span style={{ fontSize: 14 }}>{i}</span>{l}
        </button>
      );
    })}
  </div>
);

/* Orientations, avec leur icône : on lit la ligne d'un coup d'œil. */
const EXPOSITIONS = [
  { k: 'sud', l: 'Sud', i: '☀️' }, { k: 'est', l: 'Est', i: '🌅' },
  { k: 'ouest', l: 'Ouest', i: '🌇' }, { k: 'nord', l: 'Nord', i: '❄️' },
  { k: 'traversant', l: 'Traversant', i: '↔️' },
];
const ICONE_EXPO: Record<string, string> = Object.fromEntries(EXPOSITIONS.map(e => [e.k, e.i]));

/* Types de biens proposés dans les critères. Les valeurs déjà enregistrées
   qui ne sont plus dans cette liste restent affichées, pour rester modifiables. */
const TYPES_BIEN = [
  { t: 'Appartement', i: '🏢' }, { t: 'Maison', i: '🏡' }, { t: 'Loft', i: '🏗️' },
  { t: 'Duplex', i: '🪜' }, { t: 'Terrain', i: '🌱' }, { t: 'Autre', i: '✳️' },
];

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
  fontSize: 14.5, fontWeight: 800, color: '#1a2332',
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
  { cle: 'etat_souhaite', nom: 'État' },
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
            <span style={{ fontSize: 15, fontWeight: 800, color: l.fort ? '#a9822f' : '#1a2332' }}>{l.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* En-tête de section dans la pop-up « Critères de recherche ». */
const SectionCrit = ({ ico, titre, note }: { ico: string; titre: string; note?: string }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '8px 0 -4px',
    paddingBottom: 9, borderBottom: '1px solid #e3e8f0' }}>
    <span style={{ fontSize: 16, lineHeight: 1 }}>{ico}</span>
    <span style={{ fontSize: 13.5, fontWeight: 800, color: '#1a2332', letterSpacing: 0.2 }}>{titre}</span>
    {note ? <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{note}</span> : null}
  </div>
);


import OngletVeille from './OngletVeille';
import OngletBiens from './OngletBiens';
import { Onglets, StylesEmilio, Icone, LienEspace } from './ParcoursBien';

const lienEntete: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600,
  color: 'rgba(255,255,255,.88)', textDecoration: 'none', fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const ORDRE_ETAPES = ['offre','negociation','offre_acceptee','compromis','acte'];

interface Props { client: Client; onBack: () => void; onNavigate: (page: string, data?: unknown) => void; }

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
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
        <div style={{ gridColumn: '3/5' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
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
        <div style={{ gridColumn: '2/-1' }}>
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

export default function FicheClient({ client: init, onBack }: Props) {
  const [client, setClient] = useState<Client>(init);
  const [recherches, setRecherches] = useState<Recherche[]>([]);
  const [rechercheId, setRechercheId] = useState<string>('');
  const rechercheActive = recherches.find(r => r.id === rechercheId) || null;
  const cr = rechercheActive || ({ secteurs: [] } as unknown as Recherche);
  const [tab, setTab] = useState('presentes');   // c'est là qu'on regarde en premier : ce que le client a reçu
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
  const [suiviFiltre, setSuiviFiltre] = useState('appel');
  const [biens, setBiens] = useState<any[]>([]);
  const [visites, setVisites] = useState<any[]>([]);
  const [transaction, setTransaction] = useState<any>(null);
  const [envois, setEnvois] = useState<any[]>([]);
  const [journal, setJournal] = useState<any[]>([]);
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
  const [modeCrit, setModeCrit] = useState<'tout' | 'etapes'>('tout');
  const [etapeCrit, setEtapeCrit] = useState(0);
  const [sensCrit, setSensCrit] = useState<1 | -1>(1);
  useEffect(() => { try { const m = localStorage.getItem('emilio_mode_criteres'); if (m === 'etapes' || m === 'tout') setModeCrit(m); } catch { /* stockage indisponible */ } }, []);
  const changerModeCrit = (m: 'tout' | 'etapes') => { setModeCrit(m); setEtapeCrit(0); setSensCrit(1); try { localStorage.setItem('emilio_mode_criteres', m); } catch { /* stockage indisponible */ } };
  const ouvrirCriteres = (etape = 0) => { setEtapeCrit(etape); setSensCrit(1); setShowCriteres(true); };
  const [showMandat, setShowMandat] = useState(false);
  /* Le menu se posait dans la carte d'en-tête, qui rogne ce qui dépasse : il
     était coupé en deux. Il s'ouvre maintenant par-dessus la page, à l'aplomb
     du bouton — d'où la position retenue ici. */
  const [menuStatut, setMenuStatut] = useState<{ x: number; y: number } | null>(null);
  /* La carte des critères rogne ce qui dépasse : le menu des recherches se
     pose donc par-dessus la page, à l'aplomb du bouton. */
  const [posRecherche, setPosRecherche] = useState<{ x: number; y: number } | null>(null);
  const [showCloture, setShowCloture] = useState(false);
  const [cloture, setCloture] = useState({ motif: 'trouve_avec_moi', note: '' });
  const [showBien, setShowBien] = useState(false);
  const [relancesAtt, setRelancesAtt] = useState<{ date_echeance: string; note: string | null }[]>([]);
  const [delaiJours, setDelaiJours] = useState(5);
  const [showAction, setShowAction] = useState(false);

  const [cf, setCf] = useState({ prenom: client.prenom, nom: client.nom, adresse: client.adresse||'', email1: client.emails?.[0]||'', email2: client.emails?.[1]||'', tel1: client.telephones?.[0]||'', tel2: client.telephones?.[1]||'', statut_occupation: (client as any).statut_occupation||'', bien_actuel_type: (client as any).bien_actuel_type||'', bien_actuel_surface: (client as any).bien_actuel_surface?.toString()||'', bien_actuel_valeur: (client as any).bien_actuel_valeur?.toString()||'', bien_actuel_a_vendre: (client as any).bien_actuel_a_vendre||false, bien_actuel_notes: (client as any).bien_actuel_notes||'', bien_actuel_adresse: (client as any).bien_actuel_adresse||'', bien_actuel_meme_adresse: !(client as any).bien_actuel_adresse });
  const [crit, setCrit] = useState({ exigences: {} as Record<string, Niveau>, etage_max_sans_ascenseur: '', cuisine_type: '', exterieur_surface_min: '', types_bien: [] as string[], budget_min: '', budget_max: '', surface_min: '', surface_max: '', nb_pieces_min: '', nb_pieces_max: '', chambres_min: '', secteurs: [] as string[], transport_minutes: '', transport_lignes: [] as string[], transport_arrets: [] as Arret[], notes: '', parking: false, balcon: false, terrasse: false, jardin: false, cave: false, ascenseur: false, gardien: false, interphone: false, digicode: false, rdc_exclu: false, dernier_etage: false, etage_min: '', etage_max: '', dpe_max: '', annee_min: '', etat_souhaite: '', exposition_souhaitee: '', surface_sejour_min: '', urgence: '', financement: '', apport: '' });
  const [mandat, setMandat] = useState({ date_signature: '', duree: '3', honoraires: '3,5% TTC', date_expiration: '' });
  const [actionF, setActionF] = useState({ type: 'note', titre: '', description: '', bien_id: '', relance: '' });
  /* Modifier une ligne du suivi : on rouvre le même formulaire, en mémorisant
     laquelle. Vide = on en crée une nouvelle. */
  const [actionEdit, setActionEdit] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [bienForm, setBienForm] = useState<any>(null);
  const [bienMode, setBienMode] = useState<'url'|'texte'>('url');
  const [texteAnnonce, setTexteAnnonce] = useState('');
  const [photosInput, setPhotosInput] = useState('');
  const [txData, setTxData] = useState<any>({});
  const [showOffreEcrite, setShowOffreEcrite] = useState(false);
  const [showPlanVisite, setShowPlanVisite] = useState(false);
  const [showFicheBien, setShowFicheBien] = useState(false);
  const [showEnvoi, setShowEnvoi] = useState(false);
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
  const [envoiMode, setEnvoiMode] = useState<'unique' | 'multi' | 'libre'>('unique');
  const [envoiForm, setEnvoiForm] = useState({ destinataires: '', objet: '', corps: '', sms: false });
  const [envoiSending, setEnvoiSending] = useState(false);
  const [showCompteRendu, setShowCompteRendu] = useState(false);
  /* Une visite se planifie souvent pour plusieurs biens d'affilée : on garde
     une liste, pas un bien unique. La table `visites` n'ayant qu'une colonne
     `bien_id`, on écrit une ligne par bien, toutes sur le même créneau. */
  const [planVisteForm, setPlanVisiteForm] = useState<{ bien_ids: string[]; date: string; heure: string; contact: string; notes: string }>({ bien_ids: [], date: '', heure: '', contact: '', notes: '' });
  const [ajoutVisite, setAjoutVisite] = useState(false);
  const [crForm, setCrForm] = useState({ visite_id: '', etoiles: 0, commentaire: '', avis_client: '' });
  const [offreForm, setOffreForm] = useState({ bien_id: '', montant: '', date: '', notes: '' });

  useEffect(() => { loadRecherches(); }, [client.id]);
  useEffect(() => { if (rechercheId) load(); }, [rechercheId]);
  useEffect(() => { if (transaction) setTxData(transaction); }, [transaction]);

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
      honoraires: r.mandat_honoraires || '3,5% TTC', date_expiration: r.mandat_date_expiration || '',
    });
  }, [rechercheId, recherches]);

  async function loadRecherches() {
    const { data } = await supabase.from('recherches').select('*').eq('client_id', client.id).order('created_at', { ascending: true });
    const list = (data || []) as Recherche[];
    setRecherches(list);
    // garder la recherche active si elle existe encore, sinon la première
    setRechercheId(prev => (prev && list.some(r => r.id === prev)) ? prev : (list[0]?.id || ''));
  }

  async function creerRecherche() {
    const nom = prompt('Nom de la nouvelle recherche ?', `Recherche ${recherches.length + 1}`);
    if (nom === null) return;
    const { data } = await supabase.from('recherches').insert({
      client_id: client.id,
      nom: nom.trim() || `Recherche ${recherches.length + 1}`,
      active: true,
      secteurs: [],
    }).select().single();
    if (data) {
      setRecherches(rs => [...rs, data as Recherche]);
      setRechercheId((data as Recherche).id);
      setTab('selection');
      await addJournal(client.id, 'recherche_creee', `🔍 Nouvelle recherche — ${(data as Recherche).nom}`);
    }
  }

  async function renommerRecherche() {
    if (!rechercheActive) return;
    const nom = prompt('Renommer la recherche :', rechercheActive.nom);
    if (nom === null || !nom.trim()) return;
    const ancien = rechercheActive.nom;
    const { data } = await supabase.from('recherches').update({ nom: nom.trim() }).eq('id', rechercheActive.id).select().single();
    if (data) {
      setRecherches(rs => rs.map(r => r.id === rechercheActive.id ? (data as Recherche) : r));
      await addJournal(client.id, 'recherche_renommee', `🔍 Recherche renommée — ${ancien} → ${nom.trim()}`);
    }
  }

  async function supprimerRecherche(r: Recherche) {
    if (recherches.length <= 1) { alert('Impossible de supprimer la seule recherche du client.'); return; }
    const ok = confirm(`Supprimer la recherche « ${r.nom} » ?\n\n⚠️ Tous les biens, visites et envois rattachés à CETTE recherche seront également supprimés définitivement. Cette action est irréversible.`);
    if (!ok) return;
    const { error } = await supabase.from('recherches').delete().eq('id', r.id);
    if (error) { alert('Erreur : ' + error.message); return; }
    const reste = recherches.filter(x => x.id !== r.id);
    setRecherches(reste);
    if (rechercheId === r.id) { setRechercheId(reste[0]?.id || ''); setTab('selection'); }
    setPosRecherche(null);
  }

  async function load() {
    const [{ data: b }, { data: v }, { data: t }, { data: e }, { data: j }, { data: h }] = await Promise.all([
      supabase.from('biens').select('*').eq('recherche_id', rechercheId).order('created_at', { ascending: false }),
      supabase.from('visites').select('*').eq('recherche_id', rechercheId).order('date_visite'),
      supabase.from('transactions').select('*').eq('recherche_id', rechercheId).maybeSingle(),
      supabase.from('envois').select('*').eq('recherche_id', rechercheId).order('created_at', { ascending: false }),
      supabase.from('journal').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
      supabase.from('espace_evenements').select('*').eq('recherche_id', rechercheId)
        .in('type', ['criteres', 'message']).order('created_at', { ascending: false }).limit(40),
    ]);
    setBiens(b||[]); setVisites(v||[]); setTransaction(t); setEnvois(e||[]); setJournal(j||[]);
    setHistoEvts(h||[]);
  }

  async function refresh() {
    const { data } = await supabase.from('clients').select('*').eq('id', client.id).single();
    if (data) setClient(data as Client);
  }


  async function saveContact() {
    setSaving(true);
    // Détecter les vrais changements avant de logger
    const newEmails = [cf.email1, cf.email2].filter(Boolean);
    const newTels = [cf.tel1, cf.tel2].filter(Boolean);
    const changes: string[] = [];
    if ((client.prenom||'') !== cf.prenom) changes.push(`Prénom : "${client.prenom||'—'}" → "${cf.prenom||'—'}"`);
    if ((client.nom||'') !== cf.nom) changes.push(`Nom : "${client.nom||'—'}" → "${cf.nom||'—'}"`);
    if ((client.adresse||'') !== (cf.adresse||'')) changes.push(`Adresse mise à jour`);
    if (JSON.stringify(client.emails||[]) !== JSON.stringify(newEmails)) changes.push(`Email modifié`);
    if (JSON.stringify(client.telephones||[]) !== JSON.stringify(newTels)) changes.push(`Téléphone modifié`);
    if (((client as any).statut_occupation||'') !== cf.statut_occupation) changes.push(`Situation actuelle modifiée`);

    const { data } = await supabase.from('clients').update({
      prenom: cf.prenom, nom: cf.nom, adresse: cf.adresse||null, emails: newEmails, telephones: newTels,
      statut_occupation: cf.statut_occupation||null,
      bien_actuel_a_vendre: cf.bien_actuel_a_vendre,
      bien_actuel_type: cf.bien_actuel_a_vendre ? (cf.bien_actuel_type||null) : null,
      bien_actuel_surface: cf.bien_actuel_a_vendre && cf.bien_actuel_surface ? parseInt(cf.bien_actuel_surface) : null,
      bien_actuel_valeur: cf.bien_actuel_a_vendre && cf.bien_actuel_valeur ? parseInt(cf.bien_actuel_valeur) : null,
      bien_actuel_adresse: cf.bien_actuel_a_vendre && !cf.bien_actuel_meme_adresse ? (cf.bien_actuel_adresse||null) : null,
      bien_actuel_notes: cf.bien_actuel_a_vendre ? (cf.bien_actuel_notes||null) : null,
    }).eq('id', client.id).select().single();
    if (data) {
      setClient(data as Client);
    }
    setSaving(false); setShowContact(false);
  }

  async function saveCriteres() {
    if (!rechercheId) return;
    setSaving(true);
    const avant = recherches.find(r => r.id === rechercheId) as unknown as Record<string, unknown> | undefined;
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
    }).eq('id', rechercheId).select().single();
    if (error) {
      /* Sans message, un échec ressemble à « ça n'a pas voulu s'afficher ».
         Le cas le plus courant : une colonne pas encore créée dans Supabase. */
      setSaving(false);
      alert(`Les critères n'ont pas pu être enregistrés.\n\n${error.message}\n\nSi le message parle d'une colonne inconnue, c'est la migration SQL qui n'a pas encore été passée.`);
      return;
    }
    if (data) {
      setRecherches(rs => rs.map(r => r.id === rechercheId ? (data as Recherche) : r));
      const change = resumeChangements(avant, data as unknown as Record<string, unknown>);
      if (change) {
        await addJournal(client.id, 'criteres_modifies', '🎯 Critères modifiés', change);
        load();
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
    if (mandat.date_signature && mandat.duree && !exp) { const d = new Date(mandat.date_signature); d.setMonth(d.getMonth() + parseInt(mandat.duree)); exp = d.toISOString().split('T')[0]; }
    if (!mandat.date_signature && !mandat.date_expiration) exp = '';

    const avaitMandat = !!(recherches.find(r => r.id === rechercheId) as any)?.mandat_date_signature;
    const { data } = await supabase.from('recherches').update({ mandat_date_signature: mandat.date_signature||null, mandat_duree: mandat.duree ? parseInt(mandat.duree) : null, mandat_honoraires: mandat.honoraires||null, mandat_date_expiration: exp||null, sans_mandat: !mandat.date_signature && !exp, updated_at: new Date().toISOString() }).eq('id', rechercheId).select().single();
    if (data) {
      setRecherches(rs => rs.map(r => r.id === rechercheId ? (data as Recherche) : r));
      const detail = [
        mandat.date_signature ? `signé le ${new Date(mandat.date_signature).toLocaleDateString('fr-FR')}` : null,
        mandat.duree ? `${mandat.duree} mois` : null,
        mandat.honoraires || null,
        exp ? `jusqu'au ${new Date(exp).toLocaleDateString('fr-FR')}` : null,
      ].filter(Boolean).join(' · ');
      await addJournal(client.id, 'mandat', avaitMandat ? '📋 Mandat mis à jour' : '📋 Mandat enregistré', detail || undefined);
      load();
    }
    setSaving(false); setShowMandat(false);
  }

  /* Supprimer le mandat : il n'y avait aucun moyen de le faire, et un dossier
     sans mandat restait marqué « expiré » partout, jusque dans la liste. */
  async function supprimerMandat() {
    if (!rechercheId) return;
    if (!confirm('Supprimer le mandat de recherche de ce dossier ?\n\nLes dates, la durée et les honoraires seront effacés. Le dossier sera marqué « sans mandat ».')) return;
    setSaving(true);
    const { data } = await supabase.from('recherches').update({
      mandat_date_signature: null, mandat_duree: null, mandat_honoraires: null,
      mandat_date_expiration: null, sans_mandat: true,
      updated_at: new Date().toISOString(),
    }).eq('id', rechercheId).select().single();
    if (data) {
      setRecherches(rs => rs.map(r => r.id === rechercheId ? (data as Recherche) : r));
      setMandat({ date_signature: '', duree: '3', honoraires: '3,5% TTC', date_expiration: '' });
      await addJournal(client.id, 'mandat', '📋 Mandat supprimé');
      load();
    }
    setSaving(false); setShowMandat(false);
  }

  /* Clôturer : le statut change, la veille s'arrête (c'est le drapeau
     « active » que je lis pour savoir sur quoi chercher), et les relances en
     attente sont soldées — inutile de relancer quelqu'un qui a acheté. */
  async function cloturerDossier() {
    const m = MOTIFS_CLOTURE.find(x => x.cle === cloture.motif);
    if (!m) return;
    setSaving(true);
    const raison = cloture.note.trim() ? `${m.nom} — ${cloture.note.trim()}` : m.nom;
    await supabase.from('clients').update({ statut: m.statut, raison_perte: raison }).eq('id', client.id);
    await supabase.from('recherches').update({ active: false }).eq('client_id', client.id);
    await supabase.from('relances').update({ statut: 'cloturee' })
      .eq('client_id', client.id).eq('statut', 'en_attente');
    await addJournal(client.id, 'dossier_finalise', `🏁 Recherche clôturée — ${m.nom}`, cloture.note.trim() || undefined);
    const { data } = await supabase.from('clients').select('*').eq('id', client.id).maybeSingle();
    if (data) setClient(data as Client);
    setSaving(false); setShowCloture(false); setCloture({ motif: 'trouve_avec_moi', note: '' });
    load();
  }

  async function rouvrirDossier() {
    if (!confirm('Rouvrir ce dossier ?\n\nLe statut repasse à « Actif » et la veille reprend sur cette recherche.')) return;
    setSaving(true);
    await supabase.from('clients').update({ statut: 'actif', raison_perte: null }).eq('id', client.id);
    if (rechercheId) await supabase.from('recherches').update({ active: true }).eq('id', rechercheId);
    await addJournal(client.id, 'statut_change', '↩️ Dossier rouvert — la veille reprend');
    const { data } = await supabase.from('clients').select('*').eq('id', client.id).maybeSingle();
    if (data) setClient(data as Client);
    setSaving(false); load();
  }

  async function changeStatut(statut: string) {
    if (statut === 'offre_ecrite') {
      if (biens.length === 0) { alert('Ajoutez d\'abord des biens à la fiche avant de créer une offre écrite.'); return; }
      setOffreForm({ bien_id: biens[0]?.id || '', montant: '', date: new Date().toISOString().split('T')[0], notes: '' });
      setShowOffreEcrite(true);
      return;
    }
    // Anti-doublon : ne rien faire si le statut est déjà le même
    if (client.statut === statut) return;
    const { data } = await supabase.from('clients').update({ statut }).eq('id', client.id).select().single();
    if (!data) return;
    setClient(data as Client);

    /* Le statut et la veille marchaient chacun de leur côté : la veille lit le
       drapeau « active » de la recherche, que rien ne touchait. Un dossier
       suspendu restait donc cherché tous les jours. Les deux vont désormais
       ensemble — seul « Actif » fait chercher. */
    const chercher = statut === 'actif';
    if (chercher) {
      if (rechercheId) await supabase.from('recherches').update({ active: true }).eq('id', rechercheId);
    } else {
      await supabase.from('recherches').update({ active: false }).eq('client_id', client.id);
    }
    const nom = ETATS_CLIENT.find(x => x.cle === statut)?.nom || statut;
    await addJournal(client.id, 'statut_change', `Statut → ${nom}`,
      chercher ? 'La veille reprend sur cette recherche.' : 'La veille est arrêtée sur ce dossier.');
    load();
  }

  async function saveOffreEcrite() {
    if (!offreForm.bien_id || !offreForm.montant) { alert('Sélectionnez un bien et indiquez le montant de l\'offre.'); return; }
    setSaving(true);
    // Mettre à jour le statut client
    const { data: clientData } = await supabase.from('clients').update({ statut: 'offre_ecrite' }).eq('id', client.id).select().single();
    if (clientData) setClient(clientData as Client);
    // Créer ou mettre à jour la transaction
    if (!transaction) {
      await supabase.from('transactions').insert({ client_id: client.id, recherche_id: rechercheId, bien_id: offreForm.bien_id, etape_actuelle: 'offre', offre_montant: parseInt(offreForm.montant), offre_date: offreForm.date });
    } else {
      await supabase.from('transactions').update({ etape_actuelle: 'offre', offre_montant: parseInt(offreForm.montant), offre_date: offreForm.date, bien_id: offreForm.bien_id }).eq('id', transaction.id);
    }
    // Badge sur le bien
    await supabase.from('biens').update({ badge_retour: 'offre_faite' }).eq('id', offreForm.bien_id);
    // Journal
    const bien = biens.find(b => b.id === offreForm.bien_id);
    const desc = `Montant : ${parseInt(offreForm.montant).toLocaleString('fr-FR')}€ · Bien : ${bien?.titre || bien?.ville || '—'}${offreForm.notes ? ' · ' + offreForm.notes : ''}`;
    await addJournal(client.id, 'offre_ecrite', '✍️ Offre écrite créée', desc);
    setSaving(false); setShowOffreEcrite(false); load();
  }

  async function changeChaleur(chaleur: string) {
    const { data } = await supabase.from('clients').update({ chaleur }).eq('id', client.id).select().single();
    if (data) setClient(data as Client);
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
      recherche_id: rechercheId,
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
    await addJournal(client.id, 'bien_ajoute', `🏠 Bien ajouté — ${bienForm.titre||bienForm.ville||''}`, bienForm.url||'');
    setSaving(false); setShowBien(false); setUrl(''); setBienForm(null); setTexteAnnonce(''); setPhotosInput(''); setBienMode('url'); load();
  }

  async function demanderPdf(bienId: string) {
    await supabase.from('biens').update({
      pdf_statut: 'demande',
      pdf_demande_le: new Date().toISOString(),
      pdf_url: null,
      pdf_message: null,
    }).eq('id', bienId);
    load();
  }

  async function changeBadge(bienId: string, badge: string) {
    await supabase.from('biens').update({ badge_retour: badge }).eq('id', bienId);
    if (badge === 'offre_faite' && !transaction) { await supabase.from('transactions').insert({ client_id: client.id, recherche_id: rechercheId, bien_id: bienId, etape_actuelle: 'offre' }); await addJournal(client.id, 'offre_faite', 'Offre faite — Transaction ouverte'); }
    load();
  }

  async function planifierVisite(bienId: string) {
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
    if (visiteId) await supabase.from('visites').delete().eq('id', visiteId);
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
        return idx >= 0 ? urlsUploadees[idx] : p;
      });
    }
    const prixAcqEdit = editBienForm.commission_type === 'pourcentage'
      ? Math.round((parseFloat(editBienForm.prix_vendeur)||0) * (1 + (parseFloat(editBienForm.commission_val)||0) / 100))
      : (parseFloat(editBienForm.prix_vendeur)||0) + (parseFloat(editBienForm.commission_val)||0);
    await supabase.from('biens').update({
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
      prix_vendeur: parseFloat(editBienForm.prix_vendeur)||null,
      commission_type: editBienForm.commission_type,
      commission_val: parseFloat(editBienForm.commission_val)||null,
      prix_acquereur: prixAcqEdit||null,
      charges_trimestrielles: parseInt(editBienForm.charges_trimestrielles)||null,
      taxe_fonciere: parseInt(editBienForm.taxe_fonciere)||null,
      source_portail: editBienForm.source_portail,
      agence_nom: editBienForm.agence_nom,
      agence_tel: editBienForm.agence_tel,
      url: editBienForm.url||null,
    }).eq('id', ficheBienId);
    await addJournal(client.id, 'bien_modifie', `🏠 Bien modifié — ${editBienForm.titre||editBienForm.ville||''}`);
    setSaving(false); setShowFicheBien(false); load();
  }

  async function deleteBien(bienId: string) {
    setPendingBienId(bienId); setShowConfirmDeleteBien(true);
  }

  async function doDeleteBien() {
    const bienId = pendingBienId;
    setShowConfirmDeleteBien(false);
    // Récupérer les photos stockées dans Supabase Storage pour les supprimer
    const bien = biens.find(b => b.id === bienId);
    if (bien?.photos?.length > 0) {
      const photosStorage = bien.photos.filter((p: string) => p.includes('supabase.co/storage'));
      if (photosStorage.length > 0) {
        // Extraire les chemins relatifs depuis les URLs publiques
        const paths = photosStorage.map((url: string) => {
          const match = url.match(/photos-biens\/(.+)$/);
          return match ? match[1] : null;
        }).filter(Boolean) as string[];
        if (paths.length > 0) {
          await supabase.storage.from('photos-biens').remove(paths);
        }
      }
    }
    await supabase.from('biens').delete().eq('id', bienId);
    await addJournal(client.id, 'bien_supprime', `🗑️ Bien supprimé — ${bien?.titre || bien?.ville || ''}`);
    setShowFicheBien(false); load();
  }

  function openEnvoiBien(bienId: string) {
    const b = biens.find(x => x.id === bienId);
    const emails = client.emails?.filter(Boolean) || [];
    const titre = b?.titre || `${b?.type_bien||'Bien'} — ${b?.ville||''}`;
    setEnvoiBienId(bienId);
    setEnvoiBienIds([bienId]);
    setEnvoiMode('unique');
    setEnvoiForm({
      destinataires: emails.join(', '),
      objet: `Proposition immobilière — ${titre}`,
      corps: `Bonjour ${client.prenom},

Suite à votre projet de recherche, je suis heureux de vous présenter un bien susceptible de répondre à vos critères.

Vous trouverez ci-dessous l'aperçu et le bouton pour consulter la fiche complète.

N'hésitez pas à me solliciter pour organiser une visite, à m'appeler si vous avez la moindre question, ou à me faire un retour afin d'affiner votre recherche si certains points ne vous conviennent pas.

Cordialement,
Alexandre ROGELET
Emilio Immobilier
06 58 95 76 32`,
      sms: false,
    });
    setShowEnvoiBien(true);
  }

  function openEnvoiMulti() {
    const emails = client.emails?.filter(Boolean) || [];
    // Pré-sélectionne tous les biens non refusés
    const biensActifs = biens.filter(b => b.badge_retour !== 'refuse');
    setEnvoiBienIds(biensActifs.map(b => b.id));
    setEnvoiBienId('');
    setEnvoiMode('multi');
    setEnvoiForm({
      destinataires: emails.join(', '),
      objet: `Sélection de biens — Vos recherches immobilières`,
      corps: `Bonjour ${client.prenom},

Suite à votre projet de recherche, je suis heureux de vous présenter une sélection de biens susceptibles de répondre à vos critères.

Vous trouverez le détail de chacun ci-dessous, avec un bouton pour consulter la fiche complète.

N'hésitez pas à me solliciter pour organiser une visite, à m'appeler si vous avez des questions, ou à me faire un retour afin d'affiner votre recherche si certains biens ne vous conviennent pas.

Cordialement,
Alexandre ROGELET
Emilio Immobilier
06 58 95 76 32`,
      sms: false,
    });
    setShowEnvoiBien(true);
  }

  function openEnvoiLibre() {
    const emails = client.emails?.filter(Boolean) || [];
    setEnvoiBienIds([]);
    setEnvoiBienId('');
    setEnvoiMode('libre');
    setEnvoiForm({
      destinataires: emails.join(', '),
      objet: '',
      corps: `Bonjour ${client.prenom},

Cordialement,
Alexandre ROGELET
Emilio Immobilier
06 58 95 76 32`,
      sms: false,
    });
    setShowEnvoiBien(true);
  }

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

      /* C'est ici, et seulement ici, qu'un bien devient « Présenté » : le mail
         est parti pour de bon. Ouvrir la fenêtre puis annuler ne laisse plus
         rien derrière. Un bien déjà présenté qu'on renvoie garde l'avis du
         client — on ne remet pas son badge à zéro. */
      if (envoiMode !== 'libre' && envoiBienIds.length > 0) {
        const quand = new Date().toISOString();
        for (const id of envoiBienIds) {
          const b = biens.find(x => x.id === id);
          const neuf = b?.etape !== 'presente';
          await supabase.from('biens').update({
            etape: 'presente', envoye_le: quand, canal_envoi: 'mail',
            ...(neuf ? { badge_retour: 'propose' } : {}),
          }).eq('id', id);
          const prix = Number(b?.prix_acquereur) || Number(b?.prix_vendeur) || 0;
          const hono = prix - (Number(b?.prix_vendeur) || 0);
          await supabase.from('journal').insert({
            client_id: client.id, bien_id: id, recherche_id: rechercheId, type: 'envoi_bien',
            titre: neuf ? 'Envoyé au client · mail' : 'Renvoyé au client · mail',
            description: prix
              ? `Prix présenté ${prix.toLocaleString('fr-FR')} €${hono > 0 ? ` — dont ${hono.toLocaleString('fr-FR')} € d'honoraires de chasse` : ''}`
              : null,
            metadata: {},
          });
        }
        /* L'envoi vient de partir : la relance est programmée d'office. Elle
           se clôturera toute seule si le client répond avant l'échéance. */
        await programmerRelance(client.id, rechercheId, envoiBienIds.length);
      }

      setEnvoiSending(false);
      setShowEnvoiBien(false);
      chargerRelances();
      load();
      alert('✅ Mail envoyé avec succès !');
    } catch (e) {
      alert(`Erreur réseau : ${(e as Error).message}`);
      setEnvoiSending(false);
    }
  }

  async function savePlanVisite() {
    const { bien_ids, date, heure, contact, notes } = planVisteForm;
    if (!bien_ids.length) return;
    /* Une ligne de visite par bien, toutes sur le même créneau : la table n'a
       qu'un `bien_id`, et l'agenda comme les comptes rendus raisonnent bien
       par bien. Ce qui est commun — date, heure, contact — est recopié. */
    await supabase.from('visites').insert(bien_ids.map(bien_id => ({
      client_id: client.id, recherche_id: rechercheId, bien_id, statut: 'a_venir',
      date_visite: date || null, heure: heure || null,
      contact_agence: contact || null, commentaire: notes || null,
    })));
    await supabase.from('biens').update({ badge_retour: 'souhaite_visiter' }).in('id', bien_ids);
    const noms = bien_ids
      .map(id => biens.find(b => b.id === id))
      .map(b => b?.titre || b?.ville || 'Bien')
      .join(' · ');
    const desc = [date ? `Le ${new Date(date).toLocaleDateString('fr-FR')}` : '', heure ? `à ${heure}` : '', contact ? `· Contact : ${contact}` : ''].filter(Boolean).join(' ');
    await addJournal(client.id, 'visite_planifiee',
      bien_ids.length > 1 ? `📅 Visite planifiée — ${bien_ids.length} biens : ${noms}` : `📅 Visite planifiée — ${noms}`,
      desc);
    setShowPlanVisite(false); load();
  }

  async function marquerEffectuee(visiteId: string, bienId: string) {
    setCrForm({ visite_id: visiteId, etoiles: 0, commentaire: '', avis_client: '' });
    setShowCompteRendu(true);
    // pré-sélectionner le bien pour le compte-rendu
    const _ = bienId;
  }

  async function saveCompteRendu() {
    const { visite_id, etoiles, commentaire, avis_client } = crForm;
    if (!visite_id) { alert('Erreur : visite non identifiée'); return; }
    const { error } = await supabase.from('visites').update({
      statut: 'effectuee',
      note_etoiles: etoiles || 0,
      commentaire: commentaire || '',
      avis_client: avis_client || '',
    }).eq('id', visite_id);
    if (error) { alert('Erreur : ' + error.message); return; }
    const v = visites.find(x => x.id === visite_id);
    const b = biens.find(x => x.id === v?.bien_id);
    if (v?.bien_id) await supabase.from('biens').update({ badge_retour: 'visite' }).eq('id', v.bien_id);
    const AVIS: Record<string,string> = { tres_interesse:'🔥 Très intéressé', interesse:'👍 Intéressé', a_voir:'🤔 À revoir', pas_interesse:'👎 Pas intéressé', elimine:'❌ Éliminé' };
    const etoilesStr = etoiles > 0 ? '⭐'.repeat(etoiles) : '';
    const corpsLines = [avis_client ? `Avis : ${AVIS[avis_client]||avis_client}` : '', etoilesStr ? `Note : ${etoilesStr}` : '', commentaire || ''].filter(Boolean);
    await supabase.from('envois').insert({
      client_id: client.id,
      recherche_id: rechercheId,
      type: 'compte_rendu_visite',
      objet: `Visite — ${b?.titre || b?.ville || 'Bien'}`,
      corps: corpsLines.join(' | '),
      destinataires: [],
      sms_envoye: false,
    });
    await addJournal(client.id, 'visite_effectuee', `✅ Visite effectuée${etoilesStr ? ' · '+etoilesStr : ''} — ${b?.titre || b?.ville || ''}`, commentaire || undefined);
    setShowCompteRendu(false);
    await load();
  }

  async function saveAction() {
    const typeLabels: Record<string, string> = { appel: 'Appel passé', rdv: 'RDV physique', note: 'Note', relance_manuelle: 'Relance manuelle', envoi_externe: 'Envoi externe', email_libre: 'Email envoyé' };
    const titre = actionF.titre.trim() || typeLabels[actionF.type] || 'Action';
    const noteRelance = [titre, actionF.description.trim()].filter(Boolean).join(' — ').slice(0, 300);

    if (actionEdit) {
      await supabase.from('journal').update({
        type: actionF.type, titre,
        description: actionF.description || null,
        bien_id: actionF.bien_id || null,
      }).eq('id', actionEdit);
      /* Si une relance est née de cette action et qu'elle attend toujours, son
         intitulé suit la correction : sinon la page Relances continuerait
         d'afficher l'ancienne faute de frappe. */
      const liee = journal.find(x => x.id === actionEdit)?.metadata?.relance_id;
      if (liee) await supabase.from('relances').update({ note: noteRelance }).eq('id', liee).eq('statut', 'en_attente');
      setShowAction(false); setActionEdit(null);
      setActionF({ type: 'note', titre: '', description: '', bien_id: '', relance: '' });
      load();
      return;
    }

    /* Le geste manquant : noter, au moment où on note l'appel, la date à
       laquelle il faudra rappeler. On crée la relance d'abord, pour garder son
       identifiant dans la ligne du suivi — c'est ce lien qui permettra, plus
       tard, de supprimer les deux ensemble. */
    let relanceId: string | null = null;
    if (actionF.relance) {
      const { data: rel } = await supabase.from('relances').insert({
        client_id: client.id,
        recherche_id: rechercheId,
        type: 'manuelle',
        statut: 'en_attente',
        date_echeance: new Date(`${actionF.relance}T12:00:00`).toISOString(),
        note: noteRelance,
      }).select('id').single();
      relanceId = rel?.id || null;
    }

    await supabase.from('journal').insert({
      client_id: client.id,
      recherche_id: rechercheId,
      type: actionF.type,
      titre,
      description: actionF.description || null,
      bien_id: actionF.bien_id || null,
      metadata: relanceId ? { relance_id: relanceId } : {},
    });

    if (actionF.relance) {
      await supabase.from('journal').insert({
        client_id: client.id, recherche_id: rechercheId, type: 'relance_manuelle',
        titre: `🔔 Relance prévue le ${new Date(`${actionF.relance}T12:00:00`).toLocaleDateString('fr-FR')}`,
        description: titre, metadata: relanceId ? { relance_id: relanceId } : {},
      });
    }

    setShowAction(false); setActionF({ type: 'note', titre: '', description: '', bien_id: '', relance: '' }); load();
  }

  /* Seules les lignes que tu as saisies toi-même se modifient. Un « Bien
     ajouté » ou un « Statut → Actif » raconte ce qui s'est passé : le
     réécrire fausserait l'histoire du dossier. */
  const TYPES_MODIFIABLES = new Set(['appel', 'rdv', 'note', 'relance_manuelle', 'envoi_externe', 'email_libre']);

  function modifierAction(j: any) {
    setActionEdit(j.id);
    setActionF({
      type: j.type || 'note',
      titre: j.titre || '',
      description: j.description || '',
      bien_id: j.bien_id || '',
      relance: '',
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

    if (quand) await supabase.from('relances').delete().eq('id', relanceId!).eq('statut', 'en_attente');
    await supabase.from('journal').delete().eq('id', j.id);
    load();
  }

  async function saveTxField(field: string, value: any) {
    setTxData((prev: any) => ({ ...prev, [field]: value }));
    await supabase.from('transactions').update({ [field]: value }).eq('id', transaction.id);
  }

  async function avancerEtape(prochaine: string, label: string) {
    await supabase.from('transactions').update({ etape_actuelle: prochaine }).eq('id', transaction.id);
    await addJournal(client.id, prochaine, label);
    load();
  }

  async function reculerEtape() {
    setShowConfirmEtape(true);
  }

  async function doReculerEtape() {
    const idx = ORDRE_ETAPES.indexOf(transaction.etape_actuelle);
    if (idx <= 0) return;
    const precedente = ORDRE_ETAPES[idx - 1];
    await supabase.from('transactions').update({ etape_actuelle: precedente }).eq('id', transaction.id);
    await addJournal(client.id, 'retour_etape', `Retour → ${ETAPES_LABELS[precedente]}`);
    setShowConfirmEtape(false); load();
  }

  const jours = Math.floor((Date.now() - new Date(client.created_at).getTime()) / 86400000);
  const joursMandat = cr.mandat_date_expiration ? Math.floor((new Date(cr.mandat_date_expiration).getTime() - Date.now()) / 86400000) : null;

  // Timeline fusionnée (Historique + Journal)
  // On exclut du journal les types qui font doublon avec les communications (envois)
  const COMM_JOURNAL_TYPES = ['mail_envoye', 'envoi_bien', 'visite_effectuee'];
  const suiviComms = envois.map(e => ({ kind: 'comm' as const, ts: e.created_at, data: e }));
  const suiviEvents = journal
    .filter(j => !COMM_JOURNAL_TYPES.includes(j.type))
    .map(j => ({ kind: 'event' as const, ts: j.created_at, data: j }));
  // Groupes de filtres du Suivi (alignés sur les types de la modale "Ajouter une action")
  const COMM_EVENT_TYPES = ['email_libre', 'envoi_externe'];
  const MANUEL_OU_COMM = ['appel', 'rdv', 'note', 'relance_manuelle', 'message_client', 'demande_rappel', ...COMM_EVENT_TYPES];
  const evType = (types: string[]) => suiviEvents.filter(it => types.includes(it.data.type));
  const suiviGroupes: Record<string, { label: string; items: any[] }> = {
    appel:          { label: '📞 Appels',         items: evType(['appel']) },
    rdv:            { label: '🤝 RDV',            items: evType(['rdv']) },
    note:           { label: '📝 Notes',          items: evType(['note']) },
    relance:        { label: '🔔 Relances',       items: evType(['relance_manuelle']) },
    message:        { label: '💬 Messages & rappels', items: evType(['message_client', 'demande_rappel']) },
    communications: { label: '✉️ Communications', items: [...suiviComms, ...evType(COMM_EVENT_TYPES)] },
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
    { id: 'visites',     icone: 'calendrier', nom: 'Visites',   compte: visites.length },
    { id: 'transaction', icone: 'mallette',   nom: transaction && transaction.etape_actuelle === 'finalise' ? 'Transaction \u2713' : 'Transaction', compte: null },
    { id: 'suivi',       icone: 'dossier',    nom: 'Suivi',     compte: suiviCount },
  ];


  const BADGES: Record<string, { label: string; color: string; bg: string }> = {
    propose:          { label: '📋 Proposé',         color: '#64748b', bg: '#f8fafc' },
    interesse:        { label: '👍 Intéressé',        color: '#3b82f6', bg: '#eff6ff' },
    souhaite_visiter: { label: '👀 Souhaite visiter', color: '#8b5cf6', bg: '#f5f3ff' },
    visite:           { label: '✅ Visité',            color: '#10b981', bg: '#ecfdf5' },
    offre_faite:      { label: '🟡 Offre faite',      color: '#f59e0b', bg: '#fffbeb' },
    refuse:           { label: '❌ Refusé',            color: '#ef4444', bg: '#fef2f2' },
  };

  /* La fiche n'affichait jamais la table `relances` : l'étiquette qu'on y
     voyait était une ligne de journal. Clôturer une relance ailleurs ne
     changeait donc rien ici, et une relance en retard n'apparaissait sur
     aucun dossier. */
  async function creerRelanceManuelle() {
    const jours = await delaiRelance();
    const { error } = await supabase.from('relances').insert({
      client_id: client.id, recherche_id: rechercheId, type: 'manuelle',
      statut: 'en_attente', date_echeance: echeanceDans(jours), note: 'Relance manuelle',
    });
    if (error) { alert(`La relance n'a pas pu être créée.\n\n${error.message}`); return; }
    await addJournal(client.id, 'relance_manuelle', `🔔 Relance créée pour J+${jours}`);
    chargerRelances();
    load();
    alert(`Relance créée pour dans ${jours} jours.`);
  }

  /* Les relances en attente de ce client, pour l'étiquette de l'entête. */
  const chargerRelances = useCallback(async () => {
    const { data } = await supabase.from('relances')
      .select('date_echeance, note')
      .eq('client_id', client.id).eq('statut', 'en_attente')
      .order('date_echeance', { ascending: true });
    setRelancesAtt(data || []);
  }, [client.id]);

  useEffect(() => { chargerRelances(); delaiRelance().then(setDelaiJours); }, [chargerRelances]);

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

  const ETAPES_LABELS: Record<string, string> = {
    offre: '1 — Offre', negociation: '2 — Négociation',
    offre_acceptee: '3 — Offre acceptée', compromis: '4 — Compromis', acte: '5 — Acte'
  };

  return (
    <div className={styles.page}>

      <div className={styles.pageHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className={styles.backBtn} onClick={onBack}>← Clients</button>
          <span style={{ color: '#94a3b8' }}>/</span>
          <span style={{ fontWeight: 600, color: '#1a2332', fontSize: 14 }}>{client.prenom} {client.nom}</span>
          {etiquetteRelance && (
            <span title={etiquetteRelance.note} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
              borderRadius: 99, fontSize: 12, fontWeight: 700,
              color: etiquetteRelance.couleur, background: etiquetteRelance.fond,
              border: `1px solid ${etiquetteRelance.trait}`,
            }}>🔔 {etiquetteRelance.label}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={styles.btn} onClick={() => setShowEnvoi(true)} style={{ background: '#fef9c3', border: '1px solid #fde68a', color: '#854d0e', fontWeight: 700 }}>📤 Envoyer</button>
          <button className={styles.btn} onClick={creerRelanceManuelle}>🔔 Relance J+{delaiJours}</button>
          <button className={styles.btn} onClick={() => setShowAction(true)}>+ Action</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowBien(true)}>+ Ajouter un bien</button>
        </div>
      </div>

      {/* ══ IDENTITÉ + SITUATION — deux blocs qui s'emboîtent ══════════ */}
      {(() => {
        const occ = client as any;
        const aSituation = !!(occ.statut_occupation || occ.bien_actuel_a_vendre);
        const aVendre = !!occ.bien_actuel_a_vendre;
        const labelStatut = ({ proprietaire: 'Propriétaire', locataire: 'Locataire', heberge: 'Hébergé', autre: 'Autre' } as any)[occ.statut_occupation] || occ.statut_occupation;
        const st = client.statut as string;
        const dossierClos = st === 'bien_trouve' || st === 'perdu';
        const teinte = st === 'actif' ? '#34d399' : st === 'prospect' ? '#a78bfa' : st === 'suspendu' || st === 'offre_ecrite' ? '#fbbf24' : st === 'bien_trouve' ? '#60a5fa' : '#f87171';
        const tels = (client.telephones || []).filter(Boolean);
        const mails = (client.emails || []).filter(Boolean);

        const kpis = [
          { val: presentes.length, l: 'Propositions', or: false },
          { val: visites.filter(v => v.statut === 'effectuee').length, l: 'Visites', or: false },
          { val: biens.filter(b => b.badge_retour === 'offre_faite').length, l: 'Offres', or: true },
          { val: jours, l: 'Jours de suivi', or: false },
        ];

        const Champ = ({ lib, val, premier }: { lib: string; val: React.ReactNode; premier?: boolean }) => (
          <div style={{ padding: premier ? '2px 26px 2px 0' : '2px 26px', borderLeft: premier ? 'none' : '1px solid #edf1f6' }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: '#a9b6c8', textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 4 }}>{lib}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a2332', letterSpacing: -0.1 }}>{val}</div>
          </div>
        );

        return (
          <div style={{ background: '#f8fafc', padding: '16px 24px 0' }}>

            {/* le bloc identité */}
            <div style={{
              position: 'relative', borderRadius: 22, overflow: 'hidden',
              background: 'linear-gradient(152deg, #3a5178 0%, #27395a 52%, #2e4166 100%)',
              border: '1px solid rgba(201,168,76,.2)',
              boxShadow: '0 24px 50px -30px rgba(30,45,75,.75)',
              padding: aSituation ? '24px 28px 40px' : '24px 28px 26px',
            }}>
              <span aria-hidden style={{ position: 'absolute', top: -140, right: -90, width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,168,76,.22), transparent 64%)', pointerEvents: 'none' }} />
              <span aria-hidden style={{ position: 'absolute', bottom: -160, left: -60, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(125,185,255,.12), transparent 66%)', pointerEvents: 'none' }} />

              <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 26, flexWrap: 'wrap' }}>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 17, flex: '1 1 420px', minWidth: 0 }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 58, height: 58, borderRadius: '50%',
                      background: 'linear-gradient(145deg, rgba(255,255,255,.1), rgba(255,255,255,.02))',
                      border: '1px solid rgba(201,168,76,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 23, fontWeight: 800, color: '#c9a84c', fontFamily: "'Plus Jakarta Sans',sans-serif", letterSpacing: .5,
                    }}>{client.prenom[0]}{client.nom?.[0] || ''}</div>
                    <span style={{ position: 'absolute', right: 1, bottom: 1, width: 13, height: 13, borderRadius: '50%', background: teinte, border: '2.5px solid #2b3f63' }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 24, color: 'white', letterSpacing: -0.6, lineHeight: 1.15 }}>
                        {client.prenom} {client.nom}
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
                          {ETATS_CLIENT.find(x => x.cle === st)?.nom || st}
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
                                  <button key={e.cle} onClick={() => { setMenuStatut(null); changeStatut(e.cle); }}
                                    style={{ display: 'flex', alignItems: 'flex-start', gap: 11, width: '100%', textAlign: 'left', padding: '10px 15px', border: 'none', borderBottom: '1px solid #f4f7fb', background: courant ? '#f8fafc' : 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: e.point, flexShrink: 0, marginTop: 5, boxShadow: courant ? `0 0 0 3px ${e.point}26` : 'none' }} />
                                    <span style={{ flexGrow: 1, minWidth: 0 }}>
                                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: courant ? 800 : 700, color: '#1a2332' }}>{e.nom}</span>
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
                                  <button onClick={() => { setMenuStatut(null); setShowOffreEcrite(false); changeStatut('offre_ecrite'); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '11px 15px', border: 'none', borderBottom: '1px solid #f4f7fb', background: 'white', cursor: 'pointer', fontFamily: 'inherit', color: '#a9822f', fontWeight: 700, fontSize: 13 }}>
                                    ✍️ Créer une offre écrite
                                  </button>
                                  <button onClick={() => { setMenuStatut(null); setShowCloture(true); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '11px 15px', border: 'none', background: '#fdfaf1', cursor: 'pointer', fontFamily: 'inherit', color: '#1a2332', fontWeight: 700, fontSize: 13 }}>
                                    🏁 Clôturer la recherche
                                  </button>
                                </>
                              )}
                            </div>
                          </Portail>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,.38)', fontWeight: 500, letterSpacing: .2 }}>
                        {client.reference} · suivi depuis {jours}{' '}jours
                      </span>
                      <button onClick={() => { setCf({ prenom: client.prenom, nom: client.nom, adresse: client.adresse||'', email1: client.emails?.[0]||'', email2: client.emails?.[1]||'', tel1: client.telephones?.[0]||'', tel2: client.telephones?.[1]||'', statut_occupation: (client as any).statut_occupation||'', bien_actuel_type: (client as any).bien_actuel_type||'', bien_actuel_surface: (client as any).bien_actuel_surface?.toString()||'', bien_actuel_valeur: (client as any).bien_actuel_valeur?.toString()||'', bien_actuel_a_vendre: (client as any).bien_actuel_a_vendre||false, bien_actuel_notes: (client as any).bien_actuel_notes||'', bien_actuel_adresse: (client as any).bien_actuel_adresse||'', bien_actuel_meme_adresse: !(client as any).bien_actuel_adresse }); setShowContact(true); }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.42)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <Icone nom="crayon" taille={12} />{' '}Modifier
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 20, rowGap: 9, alignItems: 'center', marginTop: 14 }}>
                      {tels.map((t) => (
                        <a key={t} href={`tel:${t}`} style={lienEntete}>
                          <Icone nom="tel" taille={14} /> {t}
                        </a>
                      ))}
                      {mails.map((e) => (
                        <a key={e} href={`mailto:${e}`} style={{ ...lienEntete, color: '#c9a84c' }}>
                          <Icone nom="mail" taille={14} /> {e}
                        </a>
                      ))}
                      {client.adresse && (
                        <span style={{ ...lienEntete, color: 'rgba(255,255,255,.55)' }}>
                          <Icone nom="lieu" taille={14} /> {client.adresse}
                        </span>
                      )}
                      {!tels.length && !mails.length && <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,.35)' }}>Aucun contact renseigné</span>}
                    </div>
                  </div>
                </div>

                {/* les compteurs, un seul panneau divisé */}
                <div style={{ display: 'flex', background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, overflow: 'hidden', flexShrink: 0 }}>
                  {kpis.map((s, i) => (
                    <div key={s.l} style={{ padding: '13px 21px', textAlign: 'center', minWidth: 78, borderLeft: i ? '1px solid rgba(255,255,255,.08)' : 'none' }}>
                      <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 24, lineHeight: 1, letterSpacing: -.8, color: s.or && s.val ? '#c9a84c' : s.val ? 'white' : 'rgba(255,255,255,.3)' }}>{s.val}</div>
                      <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.42)', marginTop: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .9 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* la situation actuelle, posée à cheval sur le bloc du dessus */}
            {aSituation && (
              <div style={{ position: 'relative', margin: '-22px 20px 0', background: 'white', border: '1px solid #e3e8f0', borderRadius: 16, padding: '18px 22px 15px', boxShadow: '0 20px 40px -30px rgba(16,24,40,.8)' }}>
                <span style={{ position: 'absolute', top: -10, left: 22, background: 'linear-gradient(135deg,#3a5178,#27395a)', color: '#e2c979', borderRadius: 20, padding: '4px 14px', fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, border: '1px solid rgba(201,168,76,.3)', boxShadow: '0 8px 18px -10px rgba(16,24,40,.9)' }}>
                  Situation actuelle
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', rowGap: 12 }}>
                  {occ.statut_occupation && <Champ lib="Statut" val={labelStatut} premier />}
                  {aVendre && occ.bien_actuel_type && <Champ lib="Bien à vendre" val={`${occ.bien_actuel_type}${occ.bien_actuel_surface ? ` · ${occ.bien_actuel_surface} m²` : ''}`} premier={!occ.statut_occupation} />}
                  {aVendre && occ.bien_actuel_valeur && <Champ lib="Valeur estimée" val={<span style={{ color: '#c9a84c', fontWeight: 800 }}>{occ.bien_actuel_valeur.toLocaleString('fr-FR')} €</span>} />}
                  {aVendre && <Champ lib="Adresse du bien" val={occ.bien_actuel_adresse ? occ.bien_actuel_adresse : 'Même adresse que le contact'} />}
                  {aVendre && (
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fffaf3', color: '#b45309', border: '1px solid #f3dcb8', padding: '7px 14px', borderRadius: 11, fontSize: 12.5, fontWeight: 700 }}>
                      <Icone nom="etiquette" taille={14} />{' '}Mandat de vente potentiel
                    </span>
                  )}
                </div>
                {aVendre && occ.bien_actuel_notes && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: '#a9b6c8', textTransform: 'uppercase', letterSpacing: 1.1, marginRight: 8 }}>Précisions</span>
                    {occ.bien_actuel_notes}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}
      <div className={styles.contentWrap}>
        {/* LE LIEN DE L'ESPACE CLIENT, tout en haut */}
        {rechercheActive && (
          <div style={{ marginBottom: 16 }}>
            <LienEspace recherche={rechercheActive} client={client} />
          </div>
        )}

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
                  {recherches.length > 1 ? 'Recherche active' : 'Recherche principale'} · critères
                </span>
                <span className={styles.critLigne}>
                  <button className={styles.critNom} onClick={(ev) => {
                    if (posRecherche) { setPosRecherche(null); return; }
                    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                    setPosRecherche({ x: Math.max(12, Math.min(r.left, window.innerWidth - 292)), y: r.bottom + 7 });
                  }}>
                    {rechercheActive?.nom || '—'}
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
              <button className={styles.critMandat} onClick={() => setShowMandat(true)} title="Modifier le mandat">
                <b>📋 Mandat{cr.mandat_date_signature || cr.mandat_date_expiration ? '' : ' de recherche'}</b>
                {cr.mandat_date_signature || cr.mandat_date_expiration ? (
                  <>
                    <span>
                      {cr.mandat_date_signature ? new Date(cr.mandat_date_signature).toLocaleDateString('fr-FR') : 'Signature non datée'}
                      {cr.mandat_duree ? ` · ${cr.mandat_duree} mois` : ''}
                      {cr.mandat_honoraires ? ` · ${cr.mandat_honoraires}` : ''}
                    </span>
                    {joursMandat !== null && (
                      <i style={joursMandat > 15 ? undefined : joursMandat > 0
                        ? { background: '#fffbeb', borderColor: '#fde68a', color: '#b45309' }
                        : { background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>
                        {joursMandat > 0 ? `${joursMandat} j restants` : '⚠️ Expiré'}
                      </i>
                    )}
                  </>
                ) : (
                  <>
                    <span>non renseigné</span>
                    <i>Remplir</i>
                  </>
                )}
              </button>

              <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button className={styles.editBtn} onClick={ouvrirHistorique}
                  title="Ce que le client a changé ou demandé depuis son espace"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                    color: histoNonVus ? '#1a2332' : undefined, fontWeight: histoNonVus ? 700 : 600 }}>
                  🕑 Historique client
                  {histoNonVus > 0 && (
                    <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                      background: '#ef4444', color: 'white', fontSize: 10.5, fontWeight: 800,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 0 0 3px rgba(239,68,68,.16)' }}>{histoNonVus}</span>
                  )}
                </button>
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
                        <span style={{ fontSize: 14, fontWeight: r.id === rechercheId ? 800 : 600, color: '#1a2332' }}>{r.nom}</span>
                        {r.id === rechercheId && <span style={{ color: '#10b981', fontSize: 13 }}>✓</span>}
                      </button>
                      {recherches.length > 1 && (
                        <button title="Supprimer cette recherche" onClick={() => { setPosRecherche(null); supprimerRecherche(r); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 14, padding: '0 14px', alignSelf: 'stretch' }} onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>🗑️</button>
                      )}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderRadius: 14, padding: '15px 18px', color: '#1a2332', background: '#fdfaf1', border: '1px solid #ecdcb4' }}>
                    {cr.type_bien && <span style={CRIT_CHIP_FORT}>🏡 {cr.type_bien}</span>}
                    {cr.urgence && <span style={CRIT_CHIP}>⏱️ {texteChoix(URGENCES, cr.urgence)}</span>}
                    {cr.financement && <span style={CRIT_CHIP}>💳 {texteChoix(FINANCEMENTS, cr.financement)}</span>}
                    {cr.apport != null && <span style={CRIT_CHIP}>💰 Apport {cr.apport.toLocaleString('fr-FR')} €</span>}
                    <span style={{ flexGrow: 1 }} />
                    <span style={{ textAlign: 'right' }}>
                      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, color: '#b09a63', textTransform: 'uppercase', letterSpacing: 1.1 }}>Budget</span>
                      <span style={{ display: 'block', fontSize: 25, fontWeight: 800, color: '#a9822f', letterSpacing: -0.6, marginTop: 2 }}>
                        {cr.budget_min && cr.budget_max ? `${(cr.budget_min / 1000).toFixed(0)}–${(cr.budget_max / 1000).toFixed(0)} k€`
                          : cr.budget_max ? `Jusqu'à ${(cr.budget_max / 1000).toFixed(0)} k€`
                            : cr.budget_min ? `À partir de ${(cr.budget_min / 1000).toFixed(0)} k€`
                              : 'À préciser'}
                      </span>
                    </span>
                  </div>

                  {/* Trois familles. Une colonne sans aucun critère renseigné
                      ne s'affiche pas — une case vide en dirait moins que rien. */}
                  {(() => {
                    const ordinal = (n: number) => n === 0 ? 'RDC' : n === 1 ? '1er' : `${n}e`;

                    const logement: LigneC[] = [];
                    if (cr.surface_min || cr.surface_max) logement.push({ lib: 'Surface', val: cr.surface_min && cr.surface_max ? `${cr.surface_min}–${cr.surface_max} m²` : cr.surface_max ? `${cr.surface_max} m² maximum` : <>{cr.surface_min} m²<Mini /></> });
                    if (cr.nb_pieces_min || cr.nb_pieces_max) logement.push({ lib: 'Pièces', val: cr.nb_pieces_min && cr.nb_pieces_max ? `${cr.nb_pieces_min}–${cr.nb_pieces_max}` : cr.nb_pieces_max ? `${cr.nb_pieces_max} maximum` : <>{cr.nb_pieces_min}<Mini /></> });
                    if (cr.chambres_min) logement.push({ lib: 'Chambres', val: <>{cr.chambres_min}<Mini fort /></>, fort: true });
                    if (cr.surface_sejour_min) logement.push({ lib: 'Séjour', val: <>{cr.surface_sejour_min} m²<Mini /></> });
                    if (cr.etat_souhaite) logement.push({ lib: 'État', val: <span style={{ fontSize: 13.5 }}>{texteChoix(ETATS, cr.etat_souhaite)}</span> });

                    const immeuble: LigneC[] = [];
                    if (cr.etage_min || cr.etage_max) immeuble.push({ lib: 'Étage', val: cr.etage_min && cr.etage_max ? `${ordinal(cr.etage_min)} – ${ordinal(cr.etage_max)}` : cr.etage_max ? `jusqu'au ${ordinal(cr.etage_max || 0)}` : `${ordinal(cr.etage_min || 0)} et plus` });
                    if (cr.rdc_exclu) immeuble.push({ lib: 'Rez-de-chaussée', val: <span style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 99, padding: '2px 9px', fontSize: 11.5, fontWeight: 700, color: '#b91c1c' }}>exclu</span> });
                    if (cr.dernier_etage) immeuble.push({ lib: 'Dernier étage', val: <span style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 99, padding: '2px 9px', fontSize: 11.5, fontWeight: 700, color: '#6d28d9' }}>recherché</span> });
                    if (cr.etage_max_sans_ascenseur) immeuble.push({ lib: 'Sans ascenseur', val: <span style={{ fontSize: 13.5 }}>{ordinal(cr.etage_max_sans_ascenseur || 0)} maximum</span> });
                    if (cr.annee_construction_min) immeuble.push({ lib: 'Construit après', val: cr.annee_construction_min });
                    if (cr.dpe_max) immeuble.push({ lib: 'DPE', val: <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 7, background: '#1a2332', color: '#fff', fontSize: 12.5, fontWeight: 800 }}>{cr.dpe_max}</span> });
                    if (cr.exposition_souhaitee) immeuble.push({ lib: 'Exposition', val: <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{cr.exposition_souhaitee.split(',').map((x: string) => x.trim()).filter(Boolean).map((x: string) => (
                      <span key={x} style={{ background: '#ecfdf5', color: '#0f766e', border: '1px solid #99f6e4', borderRadius: 20, padding: '2px 9px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>{ICONE_EXPO[x] || '🧭'} {x}</span>
                    ))}</span> });

                    const arrets = cr.transport_arrets || [];
                    const aTransport = arrets.length > 0 || !!cr.transport_minutes;

                    const ICO = (d: React.ReactNode, c: string) => (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
                    );

                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${[logement.length, immeuble.length, aTransport ? 1 : 0].filter(Boolean).length || 1}, minmax(0, 1fr))`, gap: 12 }}>
                        <FamilleCrit titre="Le logement" couleur="#2d5c8f" fond="#eff4fb" trait="#d6e3f5" lignes={logement}
                          ico={ICO(<><path d="M3 21h18" /><path d="M5 21V9.5L12 4l7 5.5V21" /><path d="M10 21v-6h4v6" /></>, '#2d5c8f')} />
                        <FamilleCrit titre="L'immeuble" couleur="#6d28d9" fond="#f5f3ff" trait="#ddd6fe" lignes={immeuble}
                          ico={ICO(<><path d="M4 21V4h9v17" /><path d="M13 10h7v11" /><path d="M7 8h2" /><path d="M7 12h2" /><path d="M7 16h2" /></>, '#6d28d9')} />
                        {aTransport && (
                          <div style={{ border: '1px solid #cbf0d8', borderRadius: 14, overflow: 'hidden' }}>
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
                                          <span style={{ fontSize: 14, fontWeight: 800, color: '#1a2332' }}>{a.nom}</span>
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
                                    <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: '#1a2332' }}>à pied maximum</span>
                                    <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 3 }}>d'un transport en commun</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Ligne 2 : Équipements */}
                  {(() => {
                    /* Le chasseur distingue « souhaité » et « indispensable » : le doré
                       signale ce sans quoi un bien n'a pas à être présenté. */
                    const ex = (cr.exigences || {}) as Record<string, string>;
                    const base: [string, string][] = [['parking','🅿️ Parking'],['balcon','🌿 Balcon'],['terrasse','☀️ Terrasse'],['jardin','🌳 Jardin'],['cave','📦 Cave'],['ascenseur','🛗 Ascenseur'],['gardien','👮 Gardien'],['interphone','🔔 Interphone'],['digicode','🔢 Digicode']];
                    const lignes: { cle: string; texte: string; fort: boolean }[] = [];
                    base.forEach(([k, l]) => { if ((cr as any)[k] || ex[k]) lignes.push({ cle: k, texte: l, fort: ex[k] === 'indispensable' }); });
                    if (ex.exterieur) lignes.push({ cle: 'exterieur', texte: `🌤️ Extérieur${cr.exterieur_surface_min ? ` de ${cr.exterieur_surface_min} m² mini` : ''}`, fort: ex.exterieur === 'indispensable' });
                    if (cr.cuisine_type) lignes.push({ cle: 'cuisine', texte: `${cr.cuisine_type === 'ouverte' ? '🍽️' : '🚪'} Cuisine ${cr.cuisine_type === 'ouverte' ? 'ouverte' : 'séparée'}`, fort: ex.cuisine === 'indispensable' });
                    if (lignes.length === 0) return null;
                    const duDore = lignes.some(l => l.fort);
                    return (
                      <div style={{ paddingBottom: cr.secteurs?.length ? 8 : 0, borderBottom: cr.secteurs?.length ? '1px solid #f1f5f9' : 'none' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Critères importants</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {lignes.map(l => (
                            <span key={l.cle} style={l.fort
                              ? { background: '#1a2332', color: '#f2dfa6', border: '1px solid #c9a84c', padding: '4px 12px', borderRadius: 20, fontSize: 14, fontWeight: 700 }
                              : { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '4px 12px', borderRadius: 20, fontSize: 14, fontWeight: 600 }}>{l.texte}</span>
                          ))}
                        </div>
                        {duDore && <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 6 }}>En doré : <b style={{ color: '#9a7d2e' }}>indispensable</b> — un bien qui ne l&apos;a pas ne part pas.</div>}
                      </div>
                    );
                  })()}
                  {/* Ligne 3 : Secteurs */}
                  {cr.secteurs?.length > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Secteurs recherchés</div>
                  )}
                  {cr.secteurs?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {(() => {
                        const bv: Record<string, string[]> = {};
                        cr.secteurs.forEach((s:string) => {
                          const m = s.match(/^(.+?)\s*\((.+?)\)$/);
                          if (m) { const q=m[1].trim(),v=m[2].trim(); if(!bv[v])bv[v]=[]; bv[v].push(q); }
                          else { if(!bv[s])bv[s]=[]; }
                        });
                        return Object.entries(bv).map(([ville, qs]) => (
                          <div key={ville} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
                            <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 9, background: '#eff4fb', border: '1px solid #d6e3f5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#3b6ea8' }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M12 21.5S19 15 19 10a7 7 0 1 0-14 0c0 5 7 11.5 7 11.5z" /><circle cx="12" cy="10" r="2.6" /></svg>
                            </span>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#1a2332', minWidth: 'max-content' }}>{ville}</span>
                            {qs.length > 0 && qs.map(q => <span key={q} className={styles.secteurTag}>{q}</span>)}
                            {qs.length === 0 && <span className={styles.secteurTag}>Toute la ville</span>}
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                  {/* Notes */}
                  {cr.notes && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 14px', borderLeft: '4px solid #c9a84c' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>💬 Précisions sur la recherche</div>
                      <div style={{ fontSize: 14, color: '#1a2332', lineHeight: 1.6 }}>{cr.notes}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>Aucun critère défini</span>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => ouvrirCriteres()}>+ Définir</button>
                </div>
              )}
            </div>
          </div>

        </div>


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
      `}</style>

        <StylesEmilio />
        <div className="fiche-suivi">
          <div className="fiche-suivi-tete">
            <b>Le suivi du dossier</b>
            <i>ce qui a été fait pour ce client</i>
          </div>
          <Onglets items={TABS} actif={tab} onChange={setTab} sombre />
        </div>

        <div key={`${rechercheId}-${tab}`} className="fiche-tab">

        {/* TAB BIENS */}
        {tab === 'biens' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {biens.length === 0 ? (
              <div className={styles.emptyTab}><div style={{ fontSize: 40, marginBottom: 12 }}>🏠</div><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 17, color: '#1a2332', marginBottom: 6 }}>Aucun bien proposé</div><div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 18 }}>Collez une URL d'annonce SeLoger, LeBonCoin, PAP...</div><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowBien(true)}>+ Ajouter un bien par URL</button></div>
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
                      <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 15, color: '#1a2332' }}>{b.titre || `${b.type_bien||'Bien'} — ${b.ville||'—'}`}</div>
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
                        <button onClick={() => openFicheBien(b.id)} style={{ fontSize: 12, background: '#f8fafc', color: '#1a2332', border: '1px solid #e2e8f0', padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>✏️ Détail</button>
                        <button onClick={() => openEnvoiBien(b.id)} style={{ fontSize: 12, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a', padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>📤 Envoyer</button>
                        <button onClick={() => planifierVisite(b.id)} style={{ fontSize: 12, background: '#f5f3ff', color: '#8b5cf6', border: '1px solid #ddd6fe', padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>📅 Visite</button>
                        {b.pdf_statut === 'pret' && b.pdf_url ? (
                          <a href={b.pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, background: '#1a2332', color: 'white', border: '1px solid #1a2332', padding: '4px 12px', borderRadius: 20, fontWeight: 600, textDecoration: 'none' }}>📄 Fiche client</a>
                        ) : b.pdf_statut === 'demande' ? (
                          <span style={{ fontSize: 12, background: '#fdfaf1', color: '#a17d2c', border: '1px solid #ecdcb4', padding: '4px 12px', borderRadius: 20, fontWeight: 600 }}>⏳ Fiche en attente</span>
                        ) : (
                          <button onClick={() => demanderPdf(b.id)} style={{ fontSize: 12, background: '#f8fafc', color: '#1a2332', border: '1px solid #e2e8f0', padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>📄 Demander une fiche soignée</button>
                        )}
                      </div>
                    </div>
                    {cr && (
                      <div style={{ marginTop: 12, background: '#f6faf7', border: '1px solid #d6ebdd', borderRadius: 12, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: cr.commentaire ? 8 : 0, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: '#10b981' }}>📋 Compte-rendu de visite</span>
                            {cr.date_visite && <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(cr.date_visite).toLocaleDateString('fr-FR')}</span>}
                            {visitesBien.length > 1 && <span style={{ fontSize: 11, color: '#94a3b8' }}>· {visitesBien.length} visites</span>}
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

        {/* TAB VISITES */}
        {tab === 'visites' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {visites.length === 0 && <div className={styles.emptyTab}><div style={{ fontSize: 32, marginBottom: 10 }}>📅</div><div style={{ fontWeight: 700, color: '#1a2332' }}>Aucune visite</div><div style={{ color: '#94a3b8', fontSize: 13 }}>Planifiez depuis l'onglet Biens</div></div>}

            {/* Section À venir */}
            {visites.filter(v => v.statut === 'a_venir').length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }}></span>
                  À venir — {visites.filter(v => v.statut === 'a_venir').length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {visites.filter(v => v.statut === 'a_venir').map(v => {
                    const b = biens.find(x => x.id === v.bien_id);
                    return (
                      <div key={v.id} className={styles.card} style={{ padding: 18, borderLeft: '3px solid #3b82f6' }}>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                          <div style={{ background: '#1a2332', borderRadius: 12, padding: '7px 11px', textAlign: 'center', minWidth: 50, flexShrink: 0 }}>
                            {v.date_visite ? <><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 20, color: 'white', lineHeight: 1 }}>{new Date(v.date_visite).getDate()}</div><div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>{new Date(v.date_visite).toLocaleDateString('fr-FR', { month: 'short' })}</div></> : <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 20 }}>—</div>}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#1a2332' }}>{b?.titre || b?.ville || 'Bien non renseigné'}</div>
                            {v.heure && <div style={{ fontSize: 14, color: '#c9a84c', fontWeight: 600, marginTop: 3 }}>{v.heure}</div>}
                            {v.contact_agence && <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>📞 {v.contact_agence}</div>}
                            {v.commentaire && <div style={{ fontSize: 13, color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '7px 11px', marginTop: 8 }}>📝 {v.commentaire}</div>}
                          </div>
                          <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, fontWeight: 600, background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', flexShrink: 0 }}>📅 À venir</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f8fafc', flexWrap: 'wrap' }}>
                          <input type="date" defaultValue={v.date_visite?.split('T')[0]} className={styles.inp} style={{ flex: 1, minWidth: 140 }} onChange={async e => { await supabase.from('visites').update({ date_visite: e.target.value }).eq('id', v.id); load(); }} />
                          <input type="time" defaultValue={v.heure} className={styles.inp} style={{ width: 110 }} onChange={async e => { await supabase.from('visites').update({ heure: e.target.value }).eq('id', v.id); }} />
                          <input className={styles.inp} placeholder="Contact agence" defaultValue={v.contact_agence} style={{ flex: 1, minWidth: 140 }} onChange={async e => { await supabase.from('visites').update({ contact_agence: e.target.value }).eq('id', v.id); }} />
                          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => marquerEffectuee(v.id, v.bien_id)}>✓ Effectuée</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Section Effectuées */}
            {visites.filter(v => v.statut === 'effectuee').length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                  Effectuées — {visites.filter(v => v.statut === 'effectuee').length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {visites.filter(v => v.statut === 'effectuee').map(v => {
                    const b = biens.find(x => x.id === v.bien_id);
                    return (
                      <div key={v.id} className={styles.card} style={{ padding: 18, borderLeft: '3px solid #10b981' }}>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                          <div style={{ background: '#ecfdf5', borderRadius: 12, padding: '7px 11px', textAlign: 'center', minWidth: 50, flexShrink: 0 }}>
                            {v.date_visite ? <><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 20, color: '#065f46', lineHeight: 1 }}>{new Date(v.date_visite).getDate()}</div><div style={{ fontSize: 9, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: 1 }}>{new Date(v.date_visite).toLocaleDateString('fr-FR', { month: 'short' })}</div></> : <div style={{ color: '#94a3b8', fontSize: 20 }}>—</div>}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#1a2332' }}>{b?.titre || b?.ville || 'Bien non renseigné'}</div>
                            {v.heure && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>🕐 {v.heure}</div>}
                            {v.contact_agence && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>📞 {v.contact_agence}</div>}
                            {/* Avis client */}
                            {v.avis_client && (
                              <div style={{ marginTop: 8 }}>
                                <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 700, background: v.avis_client === 'tres_interesse' ? '#fef9c3' : v.avis_client === 'interesse' ? '#eff6ff' : v.avis_client === 'elimine' ? '#fef2f2' : v.avis_client === 'pas_interesse' ? '#fef2f2' : '#f8fafc', color: v.avis_client === 'tres_interesse' ? '#854d0e' : v.avis_client === 'interesse' ? '#1d4ed8' : (v.avis_client === 'elimine' || v.avis_client === 'pas_interesse') ? '#ef4444' : '#64748b' }}>
                                  {v.avis_client === 'tres_interesse' ? '🔥 Très intéressé' : v.avis_client === 'interesse' ? '👍 Intéressé' : v.avis_client === 'a_voir' ? '🤔 À revoir' : v.avis_client === 'pas_interesse' ? '👎 Pas intéressé' : '❌ Éliminé'}
                                </span>
                              </div>
                            )}
                            {/* Note étoiles */}
                            {v.note_etoiles > 0 && <div style={{ marginTop: 6, fontSize: 16 }}>{'⭐'.repeat(v.note_etoiles)} <span style={{ fontSize: 12, color: '#94a3b8' }}>{v.note_etoiles}/5</span></div>}
                            {/* Compte-rendu */}
                            {v.commentaire && (
                              <div style={{ fontSize: 13, color: '#1a2332', background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginTop: 10, borderLeft: '3px solid #10b981' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Compte-rendu</div>
                                {v.commentaire}
                              </div>
                            )}
                          </div>
                          <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, fontWeight: 600, background: '#ecfdf5', color: '#10b981', border: '1px solid #bbf7d0', flexShrink: 0 }}>✅ Effectuée</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB TRANSACTION - refonte complète */}
        {tab === 'transaction' && (
          !transaction
            ? <div className={styles.emptyTab}><div style={{ fontSize: 36, marginBottom: 12 }}>📋</div><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 17, color: '#1a2332', marginBottom: 6 }}>Aucune transaction</div><div style={{ color: '#94a3b8', fontSize: 14 }}>Posez le badge "Offre faite" sur un bien pour démarrer</div></div>
            : <div className={styles.card} style={{ padding: 24 }}>

                {/* Bien concerné */}
                {(() => { const bienTx = biens.find(b => b.id === transaction.bien_id); return bienTx ? (
                  <div style={{ background: '#f8fafc', border: '1px solid #e3e8f0', borderRadius: 12, padding: '10px 14px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                      {bienTx.photos?.[0] ? <img src={bienTx.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} /> : '🏠'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Bien concerné par la transaction</div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2332' }}>{bienTx.titre || `${bienTx.type_bien||'Bien'} — ${bienTx.ville||'—'}`}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{[bienTx.surface && `${bienTx.surface}m²`, bienTx.nb_pieces && `${bienTx.nb_pieces}P`, bienTx.ville].filter(Boolean).join(' · ')}</div>
                    </div>
                    {bienTx.prix_acquereur && <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 16, color: '#c9a84c', flexShrink: 0 }}>{bienTx.prix_acquereur.toLocaleString('fr-FR')}€</div>}
                    {transaction.etape_actuelle === 'offre' && biens.length > 1 && (
                      <select onChange={async e => { await supabase.from('transactions').update({ bien_id: e.target.value }).eq('id', transaction.id); load(); }} value={transaction.bien_id} className={styles.inp} style={{ fontSize: 12, width: 'auto', maxWidth: 160 }}>
                        {biens.map(b => <option key={b.id} value={b.id}>{b.titre || `${b.type_bien} — ${b.ville||'—'}`}</option>)}
                      </select>
                    )}
                  </div>
                ) : (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#92400e' }}>
                    ⚠️ Aucun bien associé à cette transaction.
                    {biens.length > 0 && <select onChange={async e => { await supabase.from('transactions').update({ bien_id: e.target.value }).eq('id', transaction.id); load(); }} className={styles.inp} style={{ marginLeft: 10, fontSize: 12, width: 'auto' }}>
                      <option value="">Choisir un bien...</option>
                      {biens.map(b => <option key={b.id} value={b.id}>{b.titre || `${b.type_bien} — ${b.ville||'—'}`}</option>)}
                    </select>}
                  </div>
                ); })()}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Étape en cours</div>
                    <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 20, color: '#1a2332' }}>
                      {transaction.etape_actuelle === 'finalise' ? '🎉 Dossier finalisé !' : ETAPES_LABELS[transaction.etape_actuelle]}
                    </div>
                  </div>
                  {transaction.etape_actuelle !== 'offre' && transaction.etape_actuelle !== 'finalise' && (
                    <button onClick={reculerEtape} className={styles.btn} style={{ fontSize: 12 }}>← Étape précédente</button>
                  )}
                </div>

                {ORDRE_ETAPES.map((etapeId, i) => {
                  const idx = ORDRE_ETAPES.indexOf(transaction.etape_actuelle);
                  const done = i < idx;
                  const cur = etapeId === transaction.etape_actuelle && transaction.etape_actuelle !== 'finalise';

                  return (
                    <div key={etapeId} style={{ display: 'flex', gap: 16, marginBottom: cur ? 0 : 16 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: done ? '#c9a84c' : cur ? '#1a2332' : '#f1f5f9', color: done ? '#1a2332' : cur ? 'white' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, boxShadow: cur ? '0 0 0 4px rgba(26,35,50,0.08)' : 'none' }}>
                          {done ? '✓' : i + 1}
                        </div>
                        {i < ORDRE_ETAPES.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 16, background: done ? '#c9a84c' : '#e3e8f0', marginTop: 4, marginBottom: 4, borderRadius: 1 }} />}
                      </div>

                      <div style={{ flex: 1, paddingTop: 6, paddingBottom: cur ? 20 : 0 }}>
                        <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 14, color: done ? '#64748b' : cur ? '#1a2332' : '#b0bec5', marginBottom: done || cur ? 6 : 0 }}>
                          {ETAPES_LABELS[etapeId]}
                        </div>

                        {done && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {etapeId === 'offre' && transaction.offre_montant && (
                              <span style={{ fontSize: 12, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>💰 {transaction.offre_montant.toLocaleString('fr-FR')}€{transaction.offre_date ? ` · ${new Date(transaction.offre_date).toLocaleDateString('fr-FR')}` : ''}</span>
                            )}
                            {etapeId === 'offre_acceptee' && transaction.prix_final && (
                              <span style={{ fontSize: 12, background: '#ecfdf5', color: '#16a34a', border: '1px solid #bbf7d0', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>✅ Prix final : {transaction.prix_final.toLocaleString('fr-FR')}€</span>
                            )}
                            {etapeId === 'compromis' && transaction.compromis_date && (
                              <span style={{ fontSize: 12, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>📋 {new Date(transaction.compromis_date).toLocaleDateString('fr-FR')}{transaction.compromis_notaire ? ` · ${transaction.compromis_notaire}` : ''}</span>
                            )}
                            {etapeId === 'negociation' && transaction.contre_offres?.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {(transaction.contre_offres as any[]).map((co: any, i: number) => (
                                  <span key={i} style={{ fontSize: 12, background: co.partie === 'acheteur' ? '#eff6ff' : '#fef2f2', color: co.partie === 'acheteur' ? '#1d4ed8' : '#dc2626', border: `1px solid ${co.partie === 'acheteur' ? '#bfdbfe' : '#fecaca'}`, padding: '3px 10px', borderRadius: 20, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    {co.partie === 'acheteur' ? '🏠 Acheteur' : '🏢 Vendeur'} · {parseInt(co.montant).toLocaleString('fr-FR')}€{co.date ? ` · ${new Date(co.date).toLocaleDateString('fr-FR')}` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {cur && (
                          <div style={{ background: '#f8fafc', borderRadius: 14, padding: 18, marginTop: 8, border: '1px solid #e3e8f0' }}>
                            {etapeId === 'offre' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div className={styles.formRow}>
                                  <div><label className={styles.lbl}>Montant offre €</label><input className={styles.inp} type="number" defaultValue={transaction.offre_montant} placeholder="Ex: 350 000" onChange={e => saveTxField('offre_montant', parseInt(e.target.value))} /></div>
                                  <div><label className={styles.lbl}>Date de l'offre</label><input className={styles.inp} type="date" defaultValue={transaction.offre_date} onChange={e => saveTxField('offre_date', e.target.value)} /></div>
                                </div>
                                <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ alignSelf: 'flex-end' }} onClick={() => avancerEtape('negociation', 'Passage en négociation')}>→ Passer en négociation</button>
                              </div>
                            )}
                            {etapeId === 'negociation' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <label className={styles.lbl}>Ajouter une contre-offre</label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  <select className={styles.inp} id="cop" style={{ width: 130 }}><option value="vendeur">Vendeur</option><option value="acheteur">Acheteur</option></select>
                                  <input className={styles.inp} type="number" id="com" placeholder="Montant €" style={{ flex: 1 }} />
                                  <input className={styles.inp} type="date" id="cod" style={{ width: 160 }} />
                                  <button className={styles.btn} onClick={async () => { const p = (document.getElementById('cop') as HTMLSelectElement).value; const m = (document.getElementById('com') as HTMLInputElement).value; const d = (document.getElementById('cod') as HTMLInputElement).value; await supabase.from('transactions').update({ contre_offres: [...(transaction.contre_offres||[]), {partie:p,montant:m,date:d}] }).eq('id', transaction.id); load(); }}>+ Ajouter</button>
                                </div>
                                {(transaction.contre_offres||[]).map((co: any, i: number) => (
                                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'center', background: 'white', padding: '8px 12px', borderRadius: 10, border: '1px solid #e3e8f0' }}>
                                    <span style={{ padding: '2px 10px', borderRadius: 20, fontWeight: 700, background: co.partie === 'vendeur' ? '#fef2f2' : '#f0fdf4', color: co.partie === 'vendeur' ? '#ef4444' : '#10b981' }}>{co.partie}</span>
                                    <span style={{ fontWeight: 600 }}>{parseInt(co.montant).toLocaleString('fr-FR')}€</span>
                                    <span style={{ color: '#94a3b8' }}>{co.date}</span>
                                  </div>
                                ))}
                                <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ alignSelf: 'flex-end' }} onClick={() => avancerEtape('offre_acceptee', 'Offre acceptée')}>✓ Offre acceptée →</button>
                              </div>
                            )}
                            {etapeId === 'offre_acceptee' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div><label className={styles.lbl}>Prix final accepté €</label><input className={styles.inp} type="number" defaultValue={transaction.prix_final} placeholder="Ex: 345 000" onChange={e => saveTxField('prix_final', parseInt(e.target.value))} /></div>
                                <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ alignSelf: 'flex-end' }} onClick={() => avancerEtape('compromis', 'Passage au compromis')}>→ Passer au compromis</button>
                              </div>
                            )}
                            {etapeId === 'compromis' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div className={styles.formRow}>
                                  <div><label className={styles.lbl}>Date compromis</label><input className={styles.inp} type="date" defaultValue={transaction.compromis_date} onChange={e => { saveTxField('compromis_date', e.target.value); saveTxField('sru_date_fin', new Date(new Date(e.target.value).getTime() + 10*86400000).toISOString().split('T')[0]); }} /></div>
                                  <div><label className={styles.lbl}>Notaire</label><input className={styles.inp} defaultValue={transaction.compromis_notaire} placeholder="Me Dupont..." onChange={e => saveTxField('compromis_notaire', e.target.value)} /></div>
                                </div>
                                <div className={styles.formRow}>
                                  <div><label className={styles.lbl}>Montant prêt €</label><input className={styles.inp} type="number" defaultValue={transaction.pret_montant} onChange={e => saveTxField('pret_montant', parseInt(e.target.value))} /></div>
                                  <div><label className={styles.lbl}>Apport €</label><input className={styles.inp} type="number" defaultValue={transaction.pret_apport} onChange={e => saveTxField('pret_apport', parseInt(e.target.value))} /></div>
                                </div>
                                {transaction.sru_date_fin && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e' }}>⏰ SRU : rétractation possible jusqu'au {new Date(transaction.sru_date_fin).toLocaleDateString('fr-FR')}</div>}
                                <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ alignSelf: 'flex-end' }} onClick={() => avancerEtape('acte', 'Passage à l\'acte')}>→ Passer à l'acte</button>
                              </div>
                            )}
                            {etapeId === 'acte' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div className={styles.formRow}>
                                  <div><label className={styles.lbl}>Date acte prévue</label><input className={styles.inp} type="date" defaultValue={transaction.acte_date_prevue} onChange={e => saveTxField('acte_date_prevue', e.target.value)} /></div>
                                  <div><label className={styles.lbl}>Honoraires HT €</label><input className={styles.inp} type="number" defaultValue={transaction.honoraires_ht} onChange={e => { saveTxField('honoraires_ht', parseInt(e.target.value)); saveTxField('honoraires_ttc', Math.round(parseInt(e.target.value)*1.2)); }} /></div>
                                </div>
                                {transaction.honoraires_ht && <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#16a34a', fontWeight: 600 }}>💰 Honoraires TTC : {Math.round((txData.honoraires_ht||transaction.honoraires_ht) * 1.2).toLocaleString('fr-FR')}€</div>}
                                <button style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: 10, padding: '12px 24px', fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 14, cursor: 'pointer', alignSelf: 'flex-end' }} onClick={async () => { await supabase.from('clients').update({ statut: 'bien_trouve' }).eq('id', client.id); await supabase.from('transactions').update({ etape_actuelle: 'finalise' }).eq('id', transaction.id); await addJournal(client.id, 'dossier_finalise', '🎉 Bien trouvé !'); refresh(); load(); }}>🎉 Clôturer — Bien trouvé !</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {transaction.etape_actuelle === 'finalise' && (
                  <div style={{ background: 'linear-gradient(135deg, #ecfdf5, #f0fdf4)', border: '1px solid #bbf7d0', borderRadius: 14, padding: 20, textAlign: 'center', marginTop: 8 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
                    <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 18, color: '#16a34a' }}>Dossier finalisé !</div>
                    {transaction.honoraires_ht && <div style={{ fontSize: 15, color: '#16a34a', marginTop: 6, fontWeight: 600 }}>Honoraires HT : {transaction.honoraires_ht.toLocaleString('fr-FR')}€</div>}
                    {transaction.acte_date_prevue && <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Acte prévu le {new Date(transaction.acte_date_prevue).toLocaleDateString('fr-FR')}</div>}
                  </div>
                )}
              </div>
        )}

        {/* TAB SÉLECTION */}
        {tab === 'selection' && (
          <div key="p-selection" className="emilio-panneau"><OngletBiens
            clientId={client.id} rechercheId={rechercheId} client={client} mode="selection"
            onChange={() => { load(); chargerVeilleCount(); }}
            onMail={(id) => openEnvoiBien(id)}
            onFiche={(id) => openFicheBien(id)}
            onVisite={(id) => planifierVisite(id)}
          /></div>
        )}

        {/* TAB PRÉSENTÉS */}
        {tab === 'presentes' && (
          <div key="p-presentes" className="emilio-panneau"><OngletBiens
            clientId={client.id} rechercheId={rechercheId} client={client} mode="presentes"
            onChange={() => { load(); chargerVeilleCount(); }}
            onMail={(id) => openEnvoiBien(id)}
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

        {/* TAB SUIVI (fusion Historique + Journal) */}
        {tab === 'suivi' && (
          <div className={styles.card} style={{ padding: 22 }}>

            {/* Barre de filtres + ajouter une action */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { id: 'tout', label: 'Tout', count: suiviCount },
                  { id: 'appel', label: suiviGroupes.appel.label, count: suiviGroupes.appel.items.length },
                  { id: 'rdv', label: suiviGroupes.rdv.label, count: suiviGroupes.rdv.items.length },
                  { id: 'note', label: suiviGroupes.note.label, count: suiviGroupes.note.items.length },
                  { id: 'relance', label: suiviGroupes.relance.label, count: suiviGroupes.relance.items.length },
                  { id: 'communications', label: suiviGroupes.communications.label, count: suiviGroupes.communications.items.length },
                  { id: 'systeme', label: suiviGroupes.systeme.label, count: suiviGroupes.systeme.items.length },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setSuiviFiltre(f.id)}
                    style={{ padding: '7px 14px', borderRadius: 20, border: '1px solid', borderColor: suiviFiltre === f.id ? '#1a2332' : '#e3e8f0', background: suiviFiltre === f.id ? '#1a2332' : 'white', color: suiviFiltre === f.id ? 'white' : '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                  >
                    {f.label}{f.count ? ` (${f.count})` : ''}
                  </button>
                ))}
              </div>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowAction(true)}>+ Ajouter une action</button>
            </div>

            {suiviItems.length === 0 ? (
              <div className={styles.emptyTab}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🗂️</div>
                <div style={{ fontWeight: 700, color: '#1a2332' }}>Rien à afficher</div>
                {suiviFiltre !== 'tout' && <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Aucun élément dans « {suiviGroupes[suiviFiltre]?.label} ». Clique sur « Tout » pour l'historique complet.</div>}
              </div>
            ) : suiviItems.map((it, i) => {
              const last = i === suiviItems.length - 1;
              if (it.kind === 'comm') {
                const e = it.data;
                const isCR = e.type === 'compte_rendu_visite';
                const icon = isCR ? '📋' : e.type === 'selection_biens' ? '📄' : '✉️';
                const bg = isCR ? '#f0fdf4' : '#fef9c3';
                const parts = isCR && e.corps ? e.corps.split(' | ') : [];
                return (
                  <div key={`c-${e.id}`} style={{ display: 'flex', gap: 14, paddingBottom: 18 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 9, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{icon}</div>
                      {!last && <div style={{ width: 1, flex: 1, background: '#f1f5f9', marginTop: 4 }} />}
                    </div>
                    <div style={{ flex: 1, paddingTop: 2 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2332' }}>{e.objet || e.type}</div>
                      {isCR && parts.length > 0 && <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, marginTop: 3 }}>{parts.slice(0, 2).join(' · ')}</div>}
                      {isCR && parts.length > 2 && <div style={{ fontSize: 13, color: '#64748b', background: '#f0fdf4', borderRadius: 8, padding: '6px 10px', marginTop: 6, borderLeft: '3px solid #10b981' }}>{parts[2]}</div>}
                      {!isCR && e.destinataires?.length > 0 && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{e.destinataires.join(', ')}</div>}
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{new Date(e.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                );
              }
              const j = it.data;
              const evIcon = j.type === 'bien_ajoute' ? '🏠' : j.type === 'visite_planifiee' ? '📅' : j.type === 'dossier_finalise' ? '🎉' : j.type === 'creation' ? '✨' : (j.type === 'offre_ecrite' || j.type === 'offre_faite') ? '✍️' : j.type === 'statut_change' ? '🔄' : j.type === 'bien_supprime' ? '🗑️' : j.type === 'relance_manuelle' ? '🔔' : j.type === 'retour_etape' ? '↩️' : '📝';
              return (
                <div key={`e-${j.id}`} className="suivi-ligne" style={{ display: 'flex', gap: 14, paddingBottom: 18 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 9, background: '#f8fafc', border: '1px solid #e3e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{evIcon}</div>
                    {!last && <div style={{ width: 1, flex: 1, background: '#f1f5f9', marginTop: 4 }} />}
                  </div>
                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flexGrow: 1, minWidth: 0, fontWeight: 600, fontSize: 14, color: '#1a2332' }}>{j.titre}</div>
                      {TYPES_MODIFIABLES.has(j.type) && (
                        <span className="suivi-actions" style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
                          <button onClick={() => modifierAction(j)} title="Modifier cette ligne"
                            style={{ border: '1px solid #e3e8f0', background: 'white', borderRadius: 8, padding: '3px 9px', fontSize: 11.5, fontWeight: 700, color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
                            ✏️ Modifier
                          </button>
                          <button onClick={() => supprimerAction(j)} title="Supprimer cette ligne"
                            style={{ border: '1px solid #e3e8f0', background: 'white', borderRadius: 8, padding: '3px 9px', fontSize: 11.5, fontWeight: 700, color: '#b91c1c', cursor: 'pointer', fontFamily: 'inherit' }}>
                            🗑️
                          </button>
                        </span>
                      )}
                    </div>
                    {j.description && <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>{j.description}</div>}
                    {j.bien_id && (() => { const b = biens.find(x => x.id === j.bien_id); return b ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '3px 10px', borderRadius: 8, background: '#faf6ee', border: '1px solid #e8dcc0', fontSize: 12, color: '#92702a', fontWeight: 600 }}>🏠 {b.titre || `${b.type_bien||'Bien'} — ${b.ville||''}`}</div>
                    ) : null; })()}
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{new Date(j.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>

      {showContact && (
        <Portail>
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>📞 Modifier le contact</h2><button className={styles.modalClose} onClick={() => setShowContact(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div className={styles.formRow}><div><label className={styles.lbl}>Prénom</label><input className={styles.inp} value={cf.prenom} onChange={e => setCf(f => ({ ...f, prenom: e.target.value }))} /></div><div><label className={styles.lbl}>Nom</label><input className={styles.inp} value={cf.nom} onChange={e => setCf(f => ({ ...f, nom: e.target.value }))} /></div></div>
              <div><label className={styles.lbl}>Adresse</label><input className={styles.inp} value={cf.adresse} onChange={e => setCf(f => ({ ...f, adresse: e.target.value }))} /></div>
              <div className={styles.formRow}><div><label className={styles.lbl}>Email principal</label><input className={styles.inp} type="email" value={cf.email1} onChange={e => setCf(f => ({ ...f, email1: e.target.value }))} /></div><div><label className={styles.lbl}>Email secondaire</label><input className={styles.inp} type="email" value={cf.email2} onChange={e => setCf(f => ({ ...f, email2: e.target.value }))} /></div></div>
              <div className={styles.formRow}><div><label className={styles.lbl}>Tél. principal</label><input className={styles.inp} value={cf.tel1} onChange={e => setCf(f => ({ ...f, tel1: e.target.value }))} /></div><div><label className={styles.lbl}>Tél. secondaire</label><input className={styles.inp} value={cf.tel2} onChange={e => setCf(f => ({ ...f, tel2: e.target.value }))} /></div></div>

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
              {/* Bien à vendre — interrupteur indépendant du statut */}
              <button type="button" onClick={() => setCf(f => ({ ...f, bien_actuel_a_vendre: !f.bien_actuel_a_vendre }))} style={{ marginTop: 10, padding: '8px 14px', borderRadius: 20, border: `1px solid ${cf.bien_actuel_a_vendre ? '#ea580c' : '#e2e8f0'}`, background: cf.bien_actuel_a_vendre ? '#fff7ed' : 'white', color: cf.bien_actuel_a_vendre ? '#ea580c' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{cf.bien_actuel_a_vendre ? '✓ ' : ''}🏷️ Projet de vente / bien à vendre (mandat potentiel)</button>
              {cf.bien_actuel_a_vendre && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 14, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className={styles.formRow}>
                    <div><label className={styles.lbl}>Type de bien</label><input className={styles.inp} value={cf.bien_actuel_type} onChange={e => setCf(f => ({ ...f, bien_actuel_type: e.target.value }))} placeholder="Appartement 3P" /></div>
                    <div><label className={styles.lbl}>Surface (m²)</label><input className={styles.inp} type="number" value={cf.bien_actuel_surface} onChange={e => setCf(f => ({ ...f, bien_actuel_surface: e.target.value }))} placeholder="65" /></div>
                  </div>
                  <div><label className={styles.lbl}>Valeur estimée (€)</label><input className={styles.inp} type="number" value={cf.bien_actuel_valeur} onChange={e => setCf(f => ({ ...f, bien_actuel_valeur: e.target.value }))} placeholder="450000" /></div>
                  <button type="button" onClick={() => setCf(f => ({ ...f, bien_actuel_meme_adresse: !f.bien_actuel_meme_adresse }))} style={{ alignSelf: 'flex-start', padding: '7px 13px', borderRadius: 20, border: `1px solid ${cf.bien_actuel_meme_adresse ? '#0ea5e9' : '#e2e8f0'}`, background: cf.bien_actuel_meme_adresse ? '#f0f9ff' : 'white', color: cf.bien_actuel_meme_adresse ? '#0ea5e9' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{cf.bien_actuel_meme_adresse ? '✓ ' : ''}📍 Bien à la même adresse que le contact</button>
                  {!cf.bien_actuel_meme_adresse && (
                    <div><label className={styles.lbl}>Adresse du bien à vendre</label><input className={styles.inp} value={cf.bien_actuel_adresse} onChange={e => setCf(f => ({ ...f, bien_actuel_adresse: e.target.value }))} placeholder="12 rue de la Paix, 75002 Paris" /></div>
                  )}
                  <div><label className={styles.lbl}>Précisions sur le bien à vendre</label><textarea className={styles.inp} rows={2} value={cf.bien_actuel_notes} onChange={e => setCf(f => ({ ...f, bien_actuel_notes: e.target.value }))} placeholder="État, étage, contexte de vente..." /></div>
                </div>
              )}
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
                return (
                  <div key={ev.id} style={{
                    display: 'flex', gap: 11, padding: '11px 13px', borderRadius: 12,
                    border: `1px solid ${neuf ? '#fed7aa' : '#e3e8f0'}`,
                    background: neuf ? '#fffaf3' : 'white',
                  }}>
                    <span style={{ fontSize: 17, lineHeight: 1.2 }}>{msg ? '💬' : '🎯'}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 13.5, color: '#1a2332' }}>
                          {msg ? 'Il vous a écrit' : 'Il a modifié ses critères'}
                        </b>
                        {neuf && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: '#c2410c', background: '#ffedd5', borderRadius: 6, padding: '2px 6px' }}>Nouveau</span>}
                        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {ev.detail && (
                        <div style={{ fontSize: 13, color: '#475569', marginTop: 4, lineHeight: 1.55, overflowWrap: 'anywhere' }}>{ev.detail}</div>
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
        /* Lecture / écriture du niveau d'exigence d'un critère.
           Les anciennes colonnes booléennes restent tenues à jour : tout ce qui
           n'est pas « indifférent » vaut true, comme avant. */
        const niv = (k: string): Niveau => (crit.exigences?.[k] as Niveau) || '';
        const setNiv = (k: string, n: Niveau) => setCrit(f => {
          const ex = { ...(f.exigences || {}) };
          if (n) ex[k] = n; else delete ex[k];
          const maj: Record<string, unknown> = { exigences: ex };
          if (k in f) maj[k] = !!n;
          return { ...f, ...maj } as typeof f;
        });
        /* Les neuf catégories : affichées à la suite (mode « tout ») ou une par une (mode « étapes »). */
        const etapesCrit: { id: string; ico: string; titre: string; note?: string; sous: string; contenu: React.ReactNode }[] = [
          {
            id: 'bien', ico: '🏠', titre: 'LE BIEN', note: 'plusieurs choix possibles',
            sous: 'Quel type de bien, dans quel état',
            contenu: (<>
              <div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[...TYPES_BIEN, ...crit.types_bien.filter(t => !TYPES_BIEN.some(o => o.t === t)).map(t => ({ t, i: '✳️' }))].map(o => { const sel = crit.types_bien.includes(o.t); return <button key={o.t} onClick={() => setCrit(f => ({ ...f, types_bien: sel ? f.types_bien.filter(x=>x!==o.t) : [...f.types_bien, o.t] }))} style={{ padding: '7px 15px', borderRadius: 20, border: `1px solid ${sel ? '#1a2332' : '#e2e8f0'}`, background: sel ? '#1a2332' : 'white', color: sel ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>{o.i} {o.t}</button>; })}
                </div>
              </div>
              <div className={styles.formRow}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className={styles.lbl}>État souhaité</label>
                  <ChoixIco table={ETATS} valeur={crit.etat_souhaite} onChange={v => setCrit(f => ({ ...f, etat_souhaite: v }))} />
                </div>
                <div><label className={styles.lbl}>📅 Année de construction min</label><input className={styles.inp} type="number" value={crit.annee_min} onChange={e=>setCrit(f=>({...f,annee_min:e.target.value}))} /></div>
              </div>
            </>),
          },
          {
            id: 'surfaces', ico: '📐', titre: 'SURFACES & VOLUMES', note: undefined,
            sous: 'Surface, pièces et chambres',
            contenu: (<>
              <div className={styles.formRow}>
                <div><label className={styles.lbl}>Surface m²</label><div style={{display:'flex',gap:6}}><input className={styles.inp} type="number" value={crit.surface_min} onChange={e=>setCrit(f=>({...f,surface_min:e.target.value}))} placeholder="Min" /><input className={styles.inp} type="number" value={crit.surface_max} onChange={e=>setCrit(f=>({...f,surface_max:e.target.value}))} placeholder="Max" /></div></div>
                <div><label className={styles.lbl}>Surface séjour min m²</label><input className={styles.inp} type="number" value={crit.surface_sejour_min} onChange={e=>setCrit(f=>({...f,surface_sejour_min:e.target.value}))} /></div>
              </div>
              <div className={styles.formRow}>
                <div><label className={styles.lbl}>Pièces</label><div style={{display:'flex',gap:6}}><input className={styles.inp} type="number" value={crit.nb_pieces_min} onChange={e=>setCrit(f=>({...f,nb_pieces_min:e.target.value}))} placeholder="Min" /><input className={styles.inp} type="number" value={crit.nb_pieces_max} onChange={e=>setCrit(f=>({...f,nb_pieces_max:e.target.value}))} placeholder="Max" /></div></div>
                <div><label className={styles.lbl}>Chambres min</label><input className={styles.inp} type="number" value={crit.chambres_min} onChange={e=>setCrit(f=>({...f,chambres_min:e.target.value}))} /></div>
              </div>
            </>),
          },
          {
            id: 'etage', ico: '🏢', titre: 'ÉTAGE & EXPOSITION', note: 'ascenseur compris',
            sous: 'Niveau dans l\'immeuble, ascenseur et orientation',
            contenu: (<>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {[{k:'rdc_exclu',l:'🚫 Exclure RDC'},{k:'dernier_etage',l:'🏙️ Dernier étage'}].map(o => (<button key={o.k} onClick={() => setCrit(f=>({...f,[o.k]:!(f as any)[o.k]}))} style={{ padding: '7px 14px', borderRadius: 20, border: `1px solid ${(crit as any)[o.k] ? '#1a2332' : '#e2e8f0'}`, background: (crit as any)[o.k] ? '#1a2332' : 'white', color: (crit as any)[o.k] ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>{o.l}</button>))}
                <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:13,color:'#64748b',fontWeight:600}}>Étage min</span><input className={styles.inp} type="number" value={crit.etage_min} onChange={e=>setCrit(f=>({...f,etage_min:e.target.value}))} style={{width:80}} /></div>
                <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:13,color:'#64748b',fontWeight:600}}>Étage max</span><input className={styles.inp} type="number" value={crit.etage_max} onChange={e=>setCrit(f=>({...f,etage_max:e.target.value}))} style={{width:80}} /></div>
              </div>

              {/* Ascenseur : indispensable, ou bien « je monte jusqu'au Xe sans ». */}
              <div style={{ background: '#f8fafc', border: '1px solid #e3e8f0', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <PastilleExigence ico="🛗" libelle="Ascenseur" niveau={niv('ascenseur')} onChange={n => setNiv('ascenseur', n)} />
                  {niv('ascenseur') !== 'indispensable' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Sans ascenseur, jusqu&apos;au</span>
                      <input className={styles.inp} type="number" min={0} max={12} value={crit.etage_max_sans_ascenseur} onChange={e => setCrit(f => ({ ...f, etage_max_sans_ascenseur: e.target.value }))} style={{ width: 72 }} />
                      <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>e étage</span>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {niv('ascenseur') === 'indispensable'
                    ? 'Tout bien sans ascenseur est écarté, quel que soit l\u2019étage.'
                    : crit.etage_max_sans_ascenseur
                      ? `Sans ascenseur, on ne propose rien au-dessus du ${crit.etage_max_sans_ascenseur}e étage.`
                      : 'Laissez vide si l\u2019étage sans ascenseur n\u2019est pas un problème.'}
                </div>
              </div>

              <div>
                <label className={styles.lbl}>Exposition souhaitée <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 12 }}>(plusieurs possibles)</span></label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {EXPOSITIONS.map(o => {
                    const sel = crit.exposition_souhaitee.split(',').map(x=>x.trim()).filter(Boolean);
                    const active = sel.includes(o.k);
                    return (
                      <button type="button" key={o.k} onClick={() => { const next = active ? sel.filter(x=>x!==o.k) : [...sel, o.k]; setCrit(f=>({...f,exposition_souhaitee: next.join(', ')})); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 20, border: `1px solid ${active ? '#10b981' : '#e2e8f0'}`, background: active ? '#ecfdf5' : 'white', color: active ? '#10b981' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}><span style={{ fontSize: 14 }}>{o.i}</span> {o.l}</button>
                    );
                  })}
                </div>
              </div>
            </>),
          },
          {
            id: 'equipements', ico: '✨', titre: 'ÉQUIPEMENTS', note: 'souhaité ou indispensable',
            sous: 'Ce qui ferait plaisir, et ce sans quoi c\'est non',
            contenu: (<>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[{k:'parking',ico:'🅿️',l:'Parking'},{k:'cave',ico:'📦',l:'Cave'},{k:'balcon',ico:'🌿',l:'Balcon'},{k:'terrasse',ico:'☀️',l:'Terrasse'},{k:'jardin',ico:'🌳',l:'Jardin'},{k:'gardien',ico:'👮',l:'Gardien'},{k:'interphone',ico:'🔔',l:'Interphone'},{k:'digicode',ico:'🔢',l:'Digicode'}].map(o => (
                  <PastilleExigence key={o.k} ico={o.ico} libelle={o.l} niveau={niv(o.k)} onChange={n => setNiv(o.k, n)} />
                ))}
              </div>
              <LegendeNiveaux />

              {/* Extérieur : au-delà du simple balcon/terrasse coché, sa taille compte. */}
              <div style={{ background: '#f8fafc', border: '1px solid #e3e8f0', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <PastilleExigence ico="🌤️" libelle="Un extérieur" niveau={niv('exterieur')} onChange={n => setNiv('exterieur', n)} />
                  {niv('exterieur') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>D&apos;au moins</span>
                      <input className={styles.inp} type="number" min={1} value={crit.exterieur_surface_min} onChange={e => setCrit(f => ({ ...f, exterieur_surface_min: e.target.value }))} style={{ width: 76 }} />
                      <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>m²</span>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {!niv('exterieur') ? 'Balcon, terrasse, loggia ou jardin — peu importe lequel.'
                    : crit.exterieur_surface_min ? `Un extérieur de moins de ${crit.exterieur_surface_min} m² ne compte pas.`
                    : 'Laissez vide si la taille importe peu.'}
                </div>
              </div>

              {/* Cuisine : ouverte ou séparée, et à quel point c'est ferme. */}
              <div style={{ background: '#f8fafc', border: '1px solid #e3e8f0', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#64748b', fontWeight: 700 }}>🍳 Cuisine</span>
                  {CUISINES.map(([v, l, i]) => {
                    const actif = crit.cuisine_type === v;
                    return <button type="button" key={v || 'ind'} onClick={() => setCrit(f => ({ ...f, cuisine_type: v }))} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 20, border: `1px solid ${actif ? '#1a2332' : '#e2e8f0'}`, background: actif ? '#1a2332' : 'white', color: actif ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}><span style={{ fontSize: 14 }}>{i}</span>{l}</button>;
                  })}
                </div>
                {crit.cuisine_type && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {[{v:'souhaite' as Niveau,l:'Simple préférence'},{v:'indispensable' as Niveau,l:'Indispensable'}].map(o => {
                      const actif = niv('cuisine') === o.v;
                      return <button type="button" key={o.v} onClick={() => setNiv('cuisine', actif ? '' : o.v)} style={{ padding: '6px 12px', borderRadius: 20, border: `1px solid ${actif ? (o.v === 'indispensable' ? '#c9a84c' : '#10b981') : '#e2e8f0'}`, background: actif ? (o.v === 'indispensable' ? '#fdf9ef' : '#ecfdf5') : 'white', color: actif ? (o.v === 'indispensable' ? '#9a7d2e' : '#10b981') : '#94a3b8', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{actif ? '✓ ' : ''}{o.l}</button>;
                    })}
                  </div>
                )}
              </div>
            </>),
          },
          {
            id: 'energie', ico: '⚡', titre: 'PERFORMANCE ÉNERGÉTIQUE', note: 'la plus mauvaise lettre acceptée',
            sous: 'La plus mauvaise lettre acceptée',
            contenu: (<>
              <div style={{ display: 'flex', gap: 6 }}>
                {['A','B','C','D','E','F','G'].map(d => {
                  const lettres = ['A','B','C','D','E','F','G'];
                  const passe = crit.dpe_max ? lettres.indexOf(d) <= lettres.indexOf(crit.dpe_max) : false;
                  const choisi = crit.dpe_max === d;
                  return (<button key={d} onClick={() => setCrit(f=>({...f,dpe_max:f.dpe_max===d?'':d}))} style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${choisi ? '#1a2332' : passe ? '#bbf7d0' : '#e2e8f0'}`, background: choisi ? '#1a2332' : passe ? '#f0fdf4' : 'white', color: choisi ? 'white' : passe ? '#15803d' : '#64748b', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{d}</button>);
                })}
              </div>
              {crit.dpe_max ? (() => {
                const lettres = ['A','B','C','D','E','F','G'];
                const i = lettres.indexOf(crit.dpe_max);
                const ok = lettres.slice(0, i + 1).join(' '); const ko = lettres.slice(i + 1).join(' ');
                return <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
                  Vous gardez <b style={{ color: '#15803d' }}>{ok}</b>
                  {ko ? <> · vous écartez <b style={{ color: '#dc2626' }}>{ko}</b></> : null}
                </div>;
              })() : <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 2 }}>Aucune exigence — toutes les lettres passent.</div>}
            </>),
          },
          {
            id: 'lieu', ico: '📍', titre: 'OÙ CHERCHER', note: 'ville puis quartiers',
            sous: 'Villes puis quartiers',
            contenu: (<>
              <SecteurPicker secteurs={crit.secteurs} onChange={(next) => setCrit(f => ({ ...f, secteurs: next }))} />
            </>),
          },
          {
            id: 'transports', ico: '🚇', titre: 'TRANSPORTS', note: 'cherchez un arrêt, puis réglez le temps à pied',
            sous: 'Arrêts souhaités et temps à pied',
            contenu: (<>
              <ArretPicker
                arrets={crit.transport_arrets}
                onChange={(v) => setCrit(f => ({ ...f, transport_arrets: v }))}
                minutesDefaut={crit.transport_minutes ? parseInt(crit.transport_minutes) : 10} />
            </>),
          },
          {
            id: 'budget', ico: '💶', titre: 'BUDGET', note: undefined,
            sous: 'Enveloppe, apport et financement',
            contenu: (<>
              <div className={styles.formRow}>
                <div><label className={styles.lbl}>Minimum €</label><input className={styles.inp} type="number" value={crit.budget_min} onChange={e => setCrit(f => ({ ...f, budget_min: e.target.value }))} /></div>
                <div><label className={styles.lbl}>Maximum €</label><input className={styles.inp} type="number" value={crit.budget_max} onChange={e => setCrit(f => ({ ...f, budget_max: e.target.value }))} /></div>
              </div>
              <div className={styles.formRow}>
                <div><label className={styles.lbl}>Apport €</label><input className={styles.inp} type="number" value={crit.apport} onChange={e=>setCrit(f=>({...f,apport:e.target.value}))} /></div>
              </div>
              <div>
                <label className={styles.lbl}>Financement</label>
                <ChoixIco table={FINANCEMENTS} valeur={crit.financement} onChange={v => setCrit(f => ({ ...f, financement: v }))} couleur="#0f766e" />
              </div>
            </>),
          },
          {
            id: 'contexte', ico: '🗒️', titre: 'CONTEXTE DU PROJET', note: undefined,
            sous: 'Urgence et notes pour le client',
            contenu: (<>
              <div>
                <label className={styles.lbl}>Urgence du projet</label>
                <ChoixIco table={URGENCES} valeur={crit.urgence} onChange={v => setCrit(f => ({ ...f, urgence: v }))} couleur="#b45309" />
              </div>
              <div><label className={styles.lbl}>Notes libres <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 12 }}>— visibles par le client dans son espace</span></label><textarea className={styles.inp} rows={3} value={crit.notes} onChange={e => setCrit(f=>({...f,notes:e.target.value}))} placeholder="Particularités, préférences, exclusions, quartiers à éviter..." /></div>
            </>),
          },
        ];
        const nbE = etapesCrit.length;
        const iE = Math.min(Math.max(etapeCrit, 0), nbE - 1);
        const eC = etapesCrit[iE];
        const allerE = (n: number) => { setSensCrit(n > iE ? 1 : -1); setEtapeCrit(Math.max(0, Math.min(nbE - 1, n))); };
        const cls = (...v: (string | false | undefined)[]) => v.filter(Boolean).join(' ');
        return (
        <Portail>
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: 900 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>🎯 Critères de recherche</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={styles.critBasc}>
                  <button type="button" className={cls(styles.critBascBtn, modeCrit === 'tout' && styles.critBascOn)} onClick={() => changerModeCrit('tout')}>☰ Tout afficher</button>
                  <button type="button" className={cls(styles.critBascBtn, modeCrit === 'etapes' && styles.critBascOn)} onClick={() => changerModeCrit('etapes')}>✨ Étape par étape</button>
                </div>
                <button className={styles.modalClose} onClick={() => setShowCriteres(false)}>✕</button>
              </div>
            </div>

            {modeCrit === 'etapes' && (
              <div className={styles.critFrise}>
                {etapesCrit.map((sE, k) => (
                  <Fragment key={sE.id}>
                    {k > 0 && <span className={cls(styles.critTrait, k <= iE && styles.critTraitFait)} />}
                    <button type="button" title={sE.titre} aria-label={sE.titre} onClick={() => allerE(k)}
                      className={cls(styles.critPuce, k === iE && styles.critPuceOn, k < iE && styles.critPuceFait)}>
                      <span className={styles.critPuceIco}>{sE.ico}</span>
                      <span className={styles.critPuceTxt}>{sE.titre}</span>
                    </button>
                  </Fragment>
                ))}
              </div>
            )}

            <div className={cls(styles.modalBody, modeCrit === 'etapes' && styles.critCorps)}>
              {modeCrit === 'tout' ? etapesCrit.map(sE => (
                <Fragment key={sE.id}>
                  <SectionCrit ico={sE.ico} titre={sE.titre} note={sE.note} />
                  {sE.contenu}
                </Fragment>
              )) : (
                <div key={eC.id} className={cls(styles.critPanneau, sensCrit === 1 ? styles.critAvant : styles.critArriere)}>
                  <div className={styles.critEnTete}>
                    <div className={styles.critEnTeteIco}>{eC.ico}</div>
                    <div>
                      <div className={styles.critEnTeteT}>{eC.titre}</div>
                      <div className={styles.critEnTeteS}>{eC.sous}</div>
                    </div>
                    <div className={styles.critCompteur}>Étape {iE + 1} / {nbE}</div>
                  </div>
                  {eC.contenu}
                </div>
              )}
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

      {showCloture && (
        <Portail>
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: 520 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>🏁 Clôturer la recherche</h2><button className={styles.modalClose} onClick={() => setShowCloture(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 11, padding: '11px 14px', fontSize: 12.5, color: '#55647a', lineHeight: 1.55 }}>
                La veille s'arrête sur ce dossier, les relances en attente sont soldées, et le motif reste au journal. Tout est réversible : « Rouvrir le dossier » dans le menu d'état.
              </div>
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
                            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#1a2332' }}>{m.nom}</span>
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

      {showMandat && (
        <Portail>
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: 500 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>📋 Mandat de recherche</h2><button className={styles.modalClose} onClick={() => setShowMandat(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div><label className={styles.lbl}>Date de signature</label><input className={styles.inp} type="date" value={mandat.date_signature} onChange={e => setMandat(f => ({ ...f, date_signature: e.target.value }))} /></div>
              <div className={styles.formRow}>
                <div><label className={styles.lbl}>Durée</label><select className={styles.inp} value={mandat.duree} onChange={e => setMandat(f => ({ ...f, duree: e.target.value }))}><option value="1">1 mois</option><option value="2">2 mois</option><option value="3">3 mois</option><option value="6">6 mois</option><option value="12">12 mois</option></select></div>
                <div><label className={styles.lbl}>Date expiration (auto ou manuelle)</label><input className={styles.inp} type="date" value={mandat.date_expiration} onChange={e => setMandat(f => ({ ...f, date_expiration: e.target.value }))} /></div>
              </div>
              <div><label className={styles.lbl}>Honoraires convenus</label><input className={styles.inp} value={mandat.honoraires} onChange={e => setMandat(f => ({ ...f, honoraires: e.target.value }))} placeholder="3,5% TTC ou 5 000€ TTC" /></div>
              {mandat.date_signature && mandat.duree && !mandat.date_expiration && <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#1d4ed8' }}>💡 Expiration calculée : {new Date(new Date(mandat.date_signature).setMonth(new Date(mandat.date_signature).getMonth() + parseInt(mandat.duree))).toLocaleDateString('fr-FR')}</div>}
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
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: bienMode === m ? 'white' : 'transparent', color: bienMode === m ? '#1a2332' : '#64748b', fontWeight: bienMode === m ? 700 : 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', boxShadow: bienMode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}>
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
                Voulez-vous vraiment revenir à l'étape <strong style={{ color: '#1a2332' }}>"{ETAPES_LABELS[ORDRE_ETAPES[Math.max(0, ORDRE_ETAPES.indexOf(transaction.etape_actuelle) - 1)]]}"</strong> ?
              </p>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e' }}>
                ⚠️ Les données saisies pour l'étape actuelle seront conservées mais l'étape sera marquée comme non finalisée.
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowConfirmEtape(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={doReculerEtape}>← Confirmer le retour</button>
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

      {/* ═══ MODAL ENVOI ═══ */}
      {showEnvoi && (
        <Portail>
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowEnvoi(false); }}>
          <div className={styles.modal} style={{ maxWidth: 520 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>📤 Envoyer à {client.prenom}</h2>
              <button className={styles.modalClose} onClick={() => setShowEnvoi(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Que souhaitez-vous envoyer à ce client ?</p>
              {[
                { icon: '📄', label: 'Sélection de biens', sub: `${biens.filter(b => b.badge_retour !== 'refuse').length} bien${biens.filter(b => b.badge_retour !== 'refuse').length !== 1 ? 's' : ''} actif${biens.filter(b => b.badge_retour !== 'refuse').length !== 1 ? 's' : ''} dans la fiche`, action: () => { setShowEnvoi(false); if (biens.filter(b => b.badge_retour !== 'refuse').length === 0) { alert("Ajoutez d'abord des biens à la fiche."); return; } openEnvoiMulti(); }, primary: true },
                { icon: '🤝', label: 'Présentation des services', sub: 'Plaquette Emilio Immobilier', action: () => { setShowEnvoi(false); alert('PDF Présentation — V2'); }, primary: false },
                { icon: '📋', label: 'Compte-rendu de visites', sub: `${visites.filter(v=>v.statut==='effectuee').length} visite(s) effectuée(s)`, action: () => { setShowEnvoi(false); if (!visites.filter(v=>v.statut==='effectuee').length) { alert('Aucune visite effectuée.'); return; } setTab('visites'); }, primary: false },
                { icon: '✉️', label: 'Mail libre', sub: 'Rédiger un message personnalisé sans bien', action: () => { setShowEnvoi(false); openEnvoiLibre(); }, primary: false },
              ].map((btn, i) => (
                <button key={i} onClick={btn.action} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, border: btn.primary ? '2px solid #1a2332' : '1px solid #e3e8f0', background: btn.primary ? '#1a2332' : 'white', cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left', transition: 'all 0.15s' }}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{btn.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: btn.primary ? 'white' : '#1a2332' }}>{btn.label}</div>
                    <div style={{ fontSize: 12, color: btn.primary ? 'rgba(255,255,255,0.5)' : '#94a3b8', marginTop: 2 }}>{btn.sub}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: btn.primary ? 'rgba(255,255,255,0.4)' : '#cbd5e1', fontSize: 18 }}>›</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        </Portail>
      )}

      {/* ═══ MODAL FICHE BIEN ═══ */}
      {showFicheBien && editBienForm && (
        <Portail>
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowFicheBien(false); }}>
          <div className={styles.modal} style={{ maxWidth: 720 }}>

            {/* Header */}
            <div className={styles.modalHeader} style={{ background: 'linear-gradient(135deg, #1a2332 0%, #243044 100%)', borderRadius: '20px 20px 0 0', borderBottom: 'none', padding: '20px 24px' }}>
              <div>
                <h2 style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 17, color: 'white', margin: 0 }}>
                  {editBienForm.type_bien || '🏠'} — {editBienForm.titre?.substring(0, 45) || 'Détail du bien'}
                </h2>
                {(editBienForm.ville || editBienForm.prix_vendeur) && (
                  <div style={{ marginTop: 4, display: 'flex', gap: 12, alignItems: 'center' }}>
                    {editBienForm.ville && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>📍 {editBienForm.ville}{editBienForm.code_postal ? ` (${editBienForm.code_postal})` : ''}</span>}
                    {editBienForm.prix_vendeur && <span style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c' }}>{parseFloat(editBienForm.prix_vendeur).toLocaleString('fr-FR')}€</span>}
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
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
                          <span style={{ position: 'absolute', bottom: 7, left: 7, background: 'linear-gradient(135deg,#c9a84c,#e8c96a)', color: '#1a2332', fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 8, letterSpacing: 0.8, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>⭐ COUVERTURE</span>
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
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1a2332' }}>
                    <input type="checkbox" checked={editBienForm.parking||false} onChange={e => setEditBienForm((f: any) => ({ ...f, parking: e.target.checked }))} style={{ accentColor: '#1a2332', width: 16, height: 16 }} />
                    🅿️ Parking / Garage inclus
                  </label>
                </div>
                </div>
              </div>

              {/* Groupe prix */}
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
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2332' }}>{b.titre || `${b.type_bien||'Bien'} — ${b.ville||'—'}`}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{[b.surface && `${b.surface}m²`, b.nb_pieces && `${b.nb_pieces}P`, b.ville].filter(Boolean).join(' · ')}</div>
                    </div>
                    {b.prix_acquereur && <div style={{ fontWeight: 800, fontSize: 16, color: '#c9a84c' }}>{b.prix_acquereur.toLocaleString('fr-FR')}€</div>}
                  </div>
                ) : null;
              })()}

              {/* MODE MULTI : checkboxes pour sélection */}
              {envoiMode === 'multi' && (
                <div>
                  <label className={styles.lbl}>Biens à inclure dans le mail <span style={{ fontWeight: 400, color: '#94a3b8' }}>({envoiBienIds.length}/{biens.filter(b => b.badge_retour !== 'refuse').length})</span></label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <button type="button" onClick={() => setEnvoiBienIds(biens.filter(b => b.badge_retour !== 'refuse').map(b => b.id))} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}>Tout sélectionner</button>
                    <button type="button" onClick={() => setEnvoiBienIds([])} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}>Tout désélectionner</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto', border: '1px solid #e3e8f0', borderRadius: 10, padding: 8, background: '#fafbfc' }}>
                    {biens.filter(b => b.badge_retour !== 'refuse').map(b => {
                      const checked = envoiBienIds.includes(b.id);
                      return (
                        <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${checked ? '#c9a84c' : '#e3e8f0'}`, background: checked ? '#faf6ee' : 'white', cursor: 'pointer', transition: 'all 0.12s' }}>
                          <input type="checkbox" checked={checked} onChange={e => { if (e.target.checked) setEnvoiBienIds(prev => [...prev, b.id]); else setEnvoiBienIds(prev => prev.filter(id => id !== b.id)); }} style={{ accentColor: '#1a2332', width: 16, height: 16, flexShrink: 0 }} />
                          <div style={{ width: 38, height: 38, borderRadius: 6, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, overflow: 'hidden', flexShrink: 0 }}>
                            {b.photos?.[0] ? <img src={b.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🏠'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#1a2332', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.titre || `${b.type_bien||'Bien'} — ${b.ville||'—'}`}</div>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', padding: '10px 14px', borderRadius: 10, border: '1px solid #e3e8f0' }}>
                <input type="checkbox" id="sms_envoi" checked={envoiForm.sms} onChange={e => setEnvoiForm(f => ({ ...f, sms: e.target.checked }))} style={{ accentColor: '#1a2332', width: 16, height: 16 }} />
                <label htmlFor="sms_envoi" style={{ fontSize: 13, fontWeight: 600, color: '#1a2332', cursor: 'pointer' }}>📱 Envoyer aussi un SMS de notification</label>
                {client.telephones?.[0] && <span style={{ fontSize: 12, color: '#94a3b8' }}>→ {client.telephones[0]}</span>}
              </div>

              {envoiMode !== 'libre' && envoiBienIds.length > 0 && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1e40af' }}>
                  ℹ️ Le mail inclura {envoiBienIds.length} bien{envoiBienIds.length > 1 ? 's' : ''} avec un bouton &quot;Consulter le bien&quot; vers la fiche complète.
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
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, border: '2px solid #1a2332', background: '#f8fafc' }}>
                        {b.photos?.[0]
                          ? <img src={b.photos[0]} alt="" style={{ width: 52, height: 52, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 52, height: 52, borderRadius: 9, background: '#eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🏠</div>}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1a2332' }}>{b.titre || `${b.type_bien||'Bien'} — ${b.ville||'—'}`}</div>
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
                              <span style={{ display: 'block', fontWeight: 700, fontSize: 13, color: '#1a2332' }}>{b.titre || `${b.type_bien||'Bien'} — ${b.ville||'—'}`}</span>
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

      {/* ═══ MODAL COMPTE-RENDU VISITE ═══ */}
      {showCompteRendu && (
        <Portail>
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowCompteRendu(false); }}>
          <div className={styles.modal} style={{ maxWidth: 520 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>✅ Compte-rendu de visite</h2><button className={styles.modalClose} onClick={() => setShowCompteRendu(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div>
                <label className={styles.lbl}>Note globale</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setCrForm(f => ({ ...f, etoiles: f.etoiles === n ? 0 : n }))}
                      style={{ width: 44, height: 44, borderRadius: 12, border: `2px solid ${crForm.etoiles >= n ? '#c9a84c' : '#e2e8f0'}`, background: crForm.etoiles >= n ? '#fef9c3' : 'white', fontSize: 22, cursor: 'pointer', transition: 'all 0.12s' }}>
                      ⭐
                    </button>
                  ))}
                  {crForm.etoiles > 0 && <span style={{ alignSelf: 'center', fontSize: 13, color: '#64748b', fontWeight: 600 }}>{crForm.etoiles}/5</span>}
                </div>
              </div>
              <div>
                <label className={styles.lbl}>Avis du client sur ce bien</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[{v:'tres_interesse', l:'🔥 Très intéressé'}, {v:'interesse', l:'👍 Intéressé'}, {v:'a_voir', l:'🤔 À revoir'}, {v:'pas_interesse', l:'👎 Pas intéressé'}, {v:'elimine', l:'❌ Éliminé'}].map(o => (
                    <button key={o.v} onClick={() => setCrForm(f => ({ ...f, avis_client: f.avis_client === o.v ? '' : o.v }))}
                      style={{ padding: '8px 10px', borderRadius: 10, border: `1px solid ${crForm.avis_client === o.v ? '#1a2332' : '#e2e8f0'}`, background: crForm.avis_client === o.v ? '#1a2332' : 'white', color: crForm.avis_client === o.v ? 'white' : '#64748b', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>{o.l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className={styles.lbl}>Commentaires / Observations</label>
                <textarea className={styles.inp} rows={4} value={crForm.commentaire} onChange={e => setCrForm(f => ({ ...f, commentaire: e.target.value }))} placeholder="Points positifs, négatifs, questions posées, éléments à vérifier..." />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowCompteRendu(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveCompteRendu}>✅ Valider le compte-rendu</button>
            </div>
          </div>
        </div>
        </Portail>
      )}

      {/* ═══ MODAL OFFRE ÉCRITE ═══ */}
      {showOffreEcrite && (
        <Portail>
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowOffreEcrite(false); }}>
          <div className={styles.modal} style={{ maxWidth: 580 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>✍️ Créer une offre écrite</h2>
              <button className={styles.modalClose} onClick={() => setShowOffreEcrite(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 4 }}>
                ✍️ Cette action va passer le statut client en "Offre écrite" et créer / mettre à jour la transaction.
              </div>
              <div>
                <label className={styles.lbl}>Bien concerné par l'offre</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {biens.map(b => (
                    <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: `2px solid ${offreForm.bien_id === b.id ? '#1a2332' : '#e3e8f0'}`, background: offreForm.bien_id === b.id ? '#f8fafc' : 'white', cursor: 'pointer' }}>
                      <input type="radio" name="bien_offre" value={b.id} checked={offreForm.bien_id === b.id} onChange={() => setOffreForm(f => ({ ...f, bien_id: b.id }))} style={{ accentColor: '#1a2332' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2332' }}>{b.titre || `${b.type_bien||'Bien'} — ${b.ville||'—'}`}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{b.prix_acquereur ? `Prix acquéreur : ${b.prix_acquereur.toLocaleString('fr-FR')}€` : ''}{b.surface ? ` · ${b.surface}m²` : ''}{b.ville ? ` · ${b.ville}` : ''}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.formRow}>
                <div><label className={styles.lbl}>Montant de l'offre €</label><input className={styles.inp} type="number" value={offreForm.montant} onChange={e => setOffreForm(f => ({ ...f, montant: e.target.value }))} placeholder="Ex : 345 000" /></div>
                <div><label className={styles.lbl}>Date de l'offre</label><input className={styles.inp} type="date" value={offreForm.date} onChange={e => setOffreForm(f => ({ ...f, date: e.target.value }))} /></div>
              </div>
              <div><label className={styles.lbl}>Notes / Conditions particulières</label><textarea className={styles.inp} rows={3} value={offreForm.notes} onChange={e => setOffreForm(f => ({ ...f, notes: e.target.value }))} placeholder="Conditions suspensives, délai de réponse attendu..." /></div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowOffreEcrite(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveOffreEcrite} disabled={saving || !offreForm.bien_id || !offreForm.montant}>{saving ? '...' : '✍️ Créer l\'offre écrite'}</button>
            </div>
          </div>
        </div>
        </Portail>
      )}

      {showAction && (
        <Portail>
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: 500 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>{actionEdit ? '✏️ Modifier l\'action' : '+ Ajouter une action'}</h2><button className={styles.modalClose} onClick={() => { setShowAction(false); setActionEdit(null); }}>✕</button></div>
            <div className={styles.modalBody}>
              <div>
                <label className={styles.lbl}>Type d'action</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[{v:'appel',l:'📞 Appel passé'},{v:'rdv',l:'🤝 RDV physique'},{v:'note',l:'📝 Note libre'},{v:'relance_manuelle',l:'🔔 Relance manuelle'},{v:'envoi_externe',l:'📤 Envoi externe'},{v:'email_libre',l:'✉️ Email envoyé'}].map(o => (<button key={o.v} onClick={() => setActionF(f => ({ ...f, type: o.v, titre: f.titre || o.l.split(' ').slice(1).join(' ') }))} style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${actionF.type === o.v ? '#1a2332' : '#e2e8f0'}`, background: actionF.type === o.v ? '#1a2332' : 'white', color: actionF.type === o.v ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.12s' }}>{o.l}</button>))}
                </div>
              </div>
              <div><label className={styles.lbl}>Titre <span style={{fontWeight:400,color:'#94a3b8'}}>(optionnel)</span></label><input className={styles.inp} value={actionF.titre} onChange={e => setActionF(f => ({ ...f, titre: e.target.value }))} placeholder="Ex: Appel de suivi, RDV agence..." /></div>
              <div><label className={styles.lbl}>Notes / Détails</label><textarea className={styles.inp} rows={4} value={actionF.description} onChange={e => setActionF(f => ({ ...f, description: e.target.value }))} placeholder="Ce dont on a discuté, ce qui a été convenu..." /></div>
              {!actionEdit && (() => {
                /* Une date, et rien d'autre : le reste — qui, pourquoi — est déjà
                   au-dessus. Les raccourcis évitent de compter les jours de tête.
                   En modification on ne le montre pas : la relance a sa propre
                   page, on ne la recrée pas en corrigeant une faute de frappe. */
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
                      {RACCOURCIS.map(([lib, j]) => {
                        const d = jourPlus(j);
                        const actif = actionF.relance === d;
                        return (
                          <button type="button" key={lib} onClick={() => setActionF(f => ({ ...f, relance: actif ? '' : d }))}
                            style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${actif ? '#c9a84c' : '#e3e8f0'}`, background: actif ? '#1a2332' : 'white', color: actif ? '#f2dfa6' : '#64748b', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
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
                        ? `Elle apparaîtra dans « Relances » — à venir jusqu'au ${new Date(`${actionF.relance}T12:00:00`).toLocaleDateString('fr-FR')}, à faire ensuite.`
                        : 'Laissez vide si rien n\'est à rappeler.'}
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
                          <span style={{ display: 'block', fontWeight: 600, fontSize: 13, color: '#1a2332' }}>Aucun bien en particulier</span>
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
                              <span style={{ display: 'block', fontWeight: 600, fontSize: 13, color: '#1a2332', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.titre || `${b.type_bien || 'Bien'} — ${b.ville || '—'}`}</span>
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
              <button className={styles.btn} onClick={() => { setShowAction(false); setActionEdit(null); }}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveAction}>{actionEdit ? '✓ Enregistrer' : '✓ Ajouter au journal'}</button>
            </div>
          </div>
        </div>
        </Portail>
      )}
    </div>
  );
}
