'use client';
import React, { Fragment } from 'react';
import styles from '@/components/fiche/FicheClient.module.css';
import SecteurPicker from '@/components/shared/SecteurPicker';
import ArretPicker from '@/components/shared/ArretPicker';
import type { Arret } from '@/lib/arrets';

/* ═══ Les critères de recherche, une bonne fois ═══════════════════════════
   Ce formulaire vivait dans la fiche client. La création d'un client en
   avait un second, plus pauvre, qui dérivait à chaque retouche. Il n'y en a
   plus qu'un : les neuf étapes, les deux affichages, les mêmes libellés. */

/* Un critère n'est pas seulement « coché / pas coché » : il peut être
   indifférent, simplement souhaité, ou carrément indispensable.
   Un clic fait avancer d'un cran, et le troisième clic revient à zéro. */
export type Niveau = '' | 'souhaite' | 'indispensable';
const CYCLE: Niveau[] = ['', 'souhaite', 'indispensable'];

export const PastilleExigence = ({ ico, libelle, niveau, onChange }: {
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
export const LegendeNiveaux = () => (
  <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
    <span>Cliquez une fois = <b style={{ color: '#10b981' }}>souhaité</b></span>
    <span>deux fois = <b style={{ color: '#9a7d2e' }}>indispensable</b></span>
    <span>trois fois = indifférent</span>
  </div>
);

/* Listes de choix, chacune avec son icône. Mêmes clés et mêmes intitulés
   que l'espace acheteur : le client et le chasseur lisent la même chose. */
export const ETATS: [string, string, string][] = [
  ['a_renover', 'À rénover', '🔨'], ['travaux_legers', 'Travaux légers', '🧰'],
  ['bon_etat', 'Bon état', '✨'], ['refait_neuf', 'Refait à neuf', '💎'],
];
export const FINANCEMENTS: [string, string, string][] = [
  ['cash', 'Cash', '💵'], ['pret_valide', 'Prêt validé', '✅'],
  ['pret_en_cours', 'Prêt en cours', '⏳'], ['a_monter', 'Prêt à monter', '📝'],
  ['pret_relais', 'Prêt relais', '🔁'],
  ['mixte_cash_pret', 'Mixte · cash + prêt', '🔀'],
  ['mixte_cash_relais', 'Mixte · cash + prêt relais', '🔀'],
  ['mixte_pret_relais', 'Mixte · prêt + prêt relais', '🔀'],
];
export const URGENCES: [string, string, string][] = [
  ['immediate', 'Immédiate', '🔥'], ['3_mois', 'Sous 3 mois', '⏱️'],
  ['6_mois', 'Sous 6 mois', '📆'], ['annee', "Dans l'année", '🗓️'],
];
export const CUISINES: [string, string, string][] = [
  ['', 'Indifférent', '🤷'], ['ouverte', 'Ouverte sur le séjour', '🍽️'], ['separee', 'Séparée', '🚪'],
];
/* Retrouve « 💵 Cash » à partir de la valeur enregistrée. */
export const texteChoix = (table: [string, string, string][], v?: string | null) => {
  const l = table.find(x => x[0] === v);
  return l ? `${l[2]} ${l[1]}` : (v || null);
};

/* Une ligne de pastilles à choix unique — remplace les anciens menus déroulants. */
export const ChoixIco = ({ table, valeur, onChange, couleur = '#1a2332' }: {
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
export const EXPOSITIONS = [
  { k: 'sud', l: 'Sud', i: '☀️' }, { k: 'est', l: 'Est', i: '🌅' },
  { k: 'ouest', l: 'Ouest', i: '🌇' }, { k: 'nord', l: 'Nord', i: '❄️' },
  { k: 'traversant', l: 'Traversant', i: '↔️' },
];
export const ICONE_EXPO: Record<string, string> = Object.fromEntries(EXPOSITIONS.map(e => [e.k, e.i]));

/* Types de biens proposés dans les critères. Les valeurs déjà enregistrées
   qui ne sont plus dans cette liste restent affichées, pour rester modifiables. */
export const TYPES_BIEN = [
  { t: 'Appartement', i: '🏢' }, { t: 'Maison', i: '🏡' }, { t: 'Loft', i: '🏗️' },
  { t: 'Duplex', i: '🪜' }, { t: 'Terrain', i: '🌱' }, { t: 'Autre', i: '✳️' },
];


/* En-tête de section dans la pop-up « Critères de recherche ». */
export const SectionCrit = ({ ico, titre, note }: { ico: string; titre: string; note?: string }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '8px 0 -4px',
    paddingBottom: 9, borderBottom: '1px solid #e3e8f0' }}>
    <span style={{ fontSize: 16, lineHeight: 1 }}>{ico}</span>
    <span style={{ fontSize: 13.5, fontWeight: 800, color: '#1a2332', letterSpacing: 0.2 }}>{titre}</span>
    {note ? <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{note}</span> : null}
  </div>
);


/* La forme du formulaire. `exigences` porte le niveau de chaque critère —
   souhaité, indispensable — et les anciennes colonnes booléennes suivent. */
export type CritForm = {
  exigences: Record<string, Niveau>;
  etage_max_sans_ascenseur: string; cuisine_type: string; exterieur_surface_min: string;
  types_bien: string[]; budget_min: string; budget_max: string;
  surface_min: string; surface_max: string; nb_pieces_min: string; nb_pieces_max: string;
  chambres_min: string; secteurs: string[]; transport_minutes: string;
  transport_lignes: string[]; transport_arrets: Arret[]; notes: string;
  parking: boolean; balcon: boolean; terrasse: boolean; jardin: boolean; cave: boolean;
  ascenseur: boolean; gardien: boolean; interphone: boolean; digicode: boolean;
  rdc_exclu: boolean; dernier_etage: boolean;
  etage_min: string; etage_max: string; dpe_max: string; annee_min: string;
  etat_souhaite: string; exposition_souhaitee: string; surface_sejour_min: string;
  urgence: string; financement: string; apport: string;
};

export const CRIT_VIDE: CritForm = {
  exigences: {}, etage_max_sans_ascenseur: '', cuisine_type: '', exterieur_surface_min: '',
  types_bien: [], budget_min: '', budget_max: '', surface_min: '', surface_max: '',
  nb_pieces_min: '', nb_pieces_max: '', chambres_min: '', secteurs: [],
  transport_minutes: '', transport_lignes: [], transport_arrets: [], notes: '',
  parking: false, balcon: false, terrasse: false, jardin: false, cave: false,
  ascenseur: false, gardien: false, interphone: false, digicode: false,
  rdc_exclu: false, dernier_etage: false, etage_min: '', etage_max: '', dpe_max: '',
  annee_min: '', etat_souhaite: '', exposition_souhaitee: '', surface_sejour_min: '',
  urgence: '', financement: '', apport: '',
};

export type EtapeCrit = { id: string; ico: string; titre: string; note?: string; sous: string; contenu: React.ReactNode };
export type SetCrit = (maj: (f: CritForm) => CritForm) => void;

/* Les neuf catégories : affichées à la suite (mode « tout ») ou une par une. */
export function etapesCriteres(crit: CritForm, setCrit: SetCrit): EtapeCrit[] {
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
        return etapesCrit;
}

const cls = (...v: (string | false | undefined)[]) => v.filter(Boolean).join(' ');

/* ═══ Le rendu ═══════════════════════════════════════════════════════════
   Deux affichages pour la même matière : tout déroulé quand on relit un
   dossier, étape par étape quand on remplit au téléphone. */
export function BasculeCriteres({ mode, onMode }: { mode: ModeCrit; onMode: (m: ModeCrit) => void }) {
  return (
    <div className={styles.critBasc}>
      <button type="button" className={cls(styles.critBascBtn, mode === 'tout' && styles.critBascOn)}
        onClick={() => onMode('tout')}>☰ Tout afficher</button>
      <button type="button" className={cls(styles.critBascBtn, mode === 'etapes' && styles.critBascOn)}
        onClick={() => onMode('etapes')}>✨ Étape par étape</button>
    </div>
  );
}

export function FriseCriteres({ etapes, i, onAller }: { etapes: EtapeCrit[]; i: number; onAller: (n: number) => void }) {
  return (
    <div className={styles.critFrise}>
      {etapes.map((sE, k) => (
        <Fragment key={sE.id}>
          {k > 0 && <span className={cls(styles.critTrait, k <= i && styles.critTraitFait)} />}
          <button type="button" title={sE.titre} aria-label={sE.titre} onClick={() => onAller(k)}
            className={cls(styles.critPuce, k === i && styles.critPuceOn, k < i && styles.critPuceFait)}>
            <span className={styles.critPuceIco}>{sE.ico}</span>
            <span className={styles.critPuceTxt}>{sE.titre}</span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}

export function CorpsCriteres({ etapes, mode, i, sens }: { etapes: EtapeCrit[]; mode: ModeCrit; i: number; sens: 1 | -1 }) {
  if (mode === 'tout') {
    return (<>
      {etapes.map(sE => (
        <Fragment key={sE.id}>
          <SectionCrit ico={sE.ico} titre={sE.titre} note={sE.note} />
          {sE.contenu}
        </Fragment>
      ))}
    </>);
  }
  const e = etapes[Math.min(Math.max(i, 0), etapes.length - 1)];
  return (
    <div key={e.id} className={cls(styles.critPanneau, sens === 1 ? styles.critAvant : styles.critArriere)}>
      <div className={styles.critEnTete}>
        <div className={styles.critEnTeteIco}>{e.ico}</div>
        <div>
          <div className={styles.critEnTeteT}>{e.titre}</div>
          <div className={styles.critEnTeteS}>{e.sous}</div>
        </div>
        <div className={styles.critCompteur}>Étape {i + 1} / {etapes.length}</div>
      </div>
      {e.contenu}
    </div>
  );
}

export type ModeCrit = 'tout' | 'etapes';

/* Les classes viennent de la feuille de la fiche : l'écran qui accueille ce
   formulaire en a besoin pour son enveloppe (défilement, panneaux). */
export const classesCrit = styles;

/* Le choix d'affichage est une habitude de travail, pas une donnée du
   dossier : il se retient d'un écran à l'autre et d'une session à l'autre. */
export function lireModeCrit(): ModeCrit {
  try {
    const m = localStorage.getItem('emilio_mode_criteres');
    return m === 'etapes' ? 'etapes' : 'tout';
  } catch { return 'tout'; }
}
export function ecrireModeCrit(m: ModeCrit) {
  try { localStorage.setItem('emilio_mode_criteres', m); } catch { /* stockage indisponible */ }
}
