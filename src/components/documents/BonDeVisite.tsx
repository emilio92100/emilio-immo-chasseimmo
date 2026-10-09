'use client';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { signalerEchec } from '@/lib/ecritures';
import { conjointDe } from '@/lib/foyer';
import { contexteDocument, personneDepuisClient, type BienVente } from '@/lib/biens-vente';
import { modele, PERSONNE_VIDE, type Contexte, type Donnees, type Personne } from '@/lib/actes';
import { biensDuBon, MAX_AUTRES_BIENS } from '@/lib/actes/bon-visite';
import { colonnesListe, identiteDuJour } from './outils';
import { Croix, Ic } from './ApercuActe';
import s from './Documents.module.css';

/* ═══ Le bon de visite d'une visite, en un clic (V3.154) ═══════════════════
   Alexandre : « un bouton Bon de visite depuis la visite, qui reprend les
   coordonnées de l'acheteur et le bien, puisque tout est déjà dans le CRM ;
   et s'il y a plusieurs biens, les mettre tous sur le bon ». Depuis la page
   Visites, l'onglet Visites d'un acheteur et la fiche d'un bien en vente :

     1. un bon porte déjà cette visite (son `visiteId`, sur le premier bien
        ou dans `autresBiens`) : il s'ouvre — on n'en fait pas un second ;
     2. l'acheteur a d'autres visites ce jour-là, pas encore sur un bon : on
        demande une fois s'il faut les y mettre (ChoixMemeJour, cochées
        d'avance) ;
     3. le brouillon est créé, puis l'éditeur s'ouvre : le rôle de l'agence
        (ses propres biens en vente : pour le vendeur, comme depuis la fiche
        du bien ; dès qu'un bien est celui d'un autre : pour l'acquéreur, son
        mandat de recherche couvre tous les biens), les visiteurs (le client, et son
        conjoint quand sa fiche est un couple — src/lib/foyer.ts), chaque
        bien (adresse, description, prix de l'annonce, référence, agence du
        vendeur), la date et l'heure de chaque visite.

   Seules des colonnes déjà lues ailleurs dans le CRM : rien n'est deviné
   (AGENTS.md §6). Au niveau du module (AGENTS.md §2.4) ; la fenêtre est
   posée sur <body> et s'anime toute seule (§2.8). */

/* Une visite, telle que chaque écran la connaît. `cle` : l'identifiant de
   la ligne de `visites`, ou « s-<id> » pour une visite hors CRM (notée sur
   le bien, table biens_vente_suivi). */
export type VisiteBon = {
  cle: string; ymd: string; heure: string;
  /* La copie du bien chez l'acheteur (table biens), le bien en vente de l'agence. */
  bienId: string | null; bienVenteId: string | null;
  /* Pour la liste de la fenêtre : le bien, et où. */
  titre: string; lieu: string;
};
export type DepartBon = {
  visite: VisiteBon;
  clientId: string | null; rechercheId: string | null;
  /* Son prénom, pour la question (« Julie a aussi 2 autres visites… »). */
  qui: string;
  /* Hors CRM, sans fiche : le nom noté et son téléphone. */
  visiteur?: Personne | null;
  /* Le bien en vente déjà à l'écran (sa fiche) : pas besoin de le relire. */
  bienVente?: BienVente | null;
};
/* Une autre visite du même jour ; `surUnBon` : un bon la porte déjà. */
export type AutreVisite = VisiteBon & { surUnBon: boolean };

type DocBon = { id: string; statut: string; bien_id: string | null; client_id: string | null; created_at: string; donnees: Donnees | null };
type CopieBien = NonNullable<Contexte['bien']> & { bien_vente_id?: string | null };
type ClientBon = { id: string; prenom?: string | null; nom?: string | null; civilite?: string | null; couple?: boolean | null; conjoint?: unknown; adresse?: string | null; emails?: string[] | null; telephones?: string[] | null };

const COLS_DOC = 'id, statut, bien_id, client_id, created_at, donnees';
/* Les colonnes du bien d'un acheteur, celles que « Nouveau document » lit déjà. */
const COLS_BIEN = 'id, titre, adresse, code_postal, ville, quartier, type_bien, surface, nb_pieces, etage, prix_acquereur, prix_vendeur, agence_nom, recherche_id, commission_type, commission_val, bien_vente_id, est_particulier';
const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/* Ce bon porte-t-il cette visite ? Par son identifiant de visite ; un bien
   sans identifiant (un bon d'avant la V3.154, un bien saisi à la main) : par
   le bien et le jour. */
function porte(doc: DocBon, v: VisiteBon): boolean {
  return biensDuBon(doc.donnees || {}).some((b, i) => {
    if (b.visiteId) return b.visiteId === v.cle;
    if (b.dateVisite.slice(0, 10) !== v.ymd) return false;
    const copie = b.bienId || (i === 0 ? doc.bien_id || '' : '');
    return (!!v.bienVenteId && b.bienVenteId === v.bienVenteId) || (!!v.bienId && copie === v.bienId);
  });
}

/* Parmi des bons déjà lus, ceux qui peuvent porter ses visites (la même
   règle que bonsPour, sans relire la base). */
function candidats(docs: DocBon[], o: DepartBon): DocBon[] {
  if (o.clientId) return docs.filter(x => x.client_id === o.clientId);
  const bv = o.visite.bienVenteId;
  if (!bv) return [];
  const nom = sansAccent(o.visiteur?.nom || '');
  return docs.filter(x => {
    if (x.client_id) return false;
    const bs = biensDuBon(x.donnees || {});
    if (!bs.some(b => b.bienVenteId === bv)) return false;
    if (bs.some(b => b.visiteId)) return true;
    const vs = Array.isArray(x.donnees?.visiteurs) ? x.donnees!.visiteurs as { nom?: unknown }[] : [];
    return !!nom && vs.some(p => sansAccent(String(p?.nom || '')) === nom);
  });
}

/* Les bons qui peuvent porter ses visites : ceux de sa fiche ; hors CRM,
   ceux du bien, au nom du visiteur. Les annulés ne comptent pas. */
async function bonsPour(o: DepartBon): Promise<DocBon[]> {
  if (o.clientId) {
    const { data, error } = await supabase.from('documents').select(COLS_DOC).eq('modele', 'bon_visite').eq('client_id', o.clientId)
      .neq('statut', 'annule').order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error('Ses bons de visite n’ont pas pu être lus : ' + error.message);
    return (data || []) as DocBon[];
  }
  if (!o.visite.bienVenteId) return [];
  const { data, error } = await supabase.from('documents').select(COLS_DOC).eq('modele', 'bon_visite').eq('donnees->>bienVenteId', o.visite.bienVenteId)
    .neq('statut', 'annule').order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error('Les bons de visite du bien n’ont pas pu être lus : ' + error.message);
  const nom = sansAccent(o.visiteur?.nom || '');
  return ((data || []) as DocBon[]).filter(x => {
    if (x.client_id) return false;
    if (biensDuBon(x.donnees || {}).some(b => b.visiteId)) return true;
    const vs = Array.isArray(x.donnees?.visiteurs) ? x.donnees!.visiteurs as { nom?: unknown }[] : [];
    return !!nom && vs.some(p => sansAccent(String(p?.nom || '')) === nom);
  });
}

/* Ses autres visites ce jour-là (pas annulées), dans l'ordre des heures.
   Seulement les visites d'un acheteur suivi (table visites). */
async function memeJour(o: DepartBon): Promise<VisiteBon[]> {
  const v = o.visite;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.ymd);
  if (!o.clientId || v.cle.startsWith('s-') || !m) return [];
  const lendemain = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1)).toISOString().slice(0, 10);
  const { data, error } = await supabase.from('visites').select('id, bien_id, statut, date_visite, heure, biens(titre, ville, quartier, bien_vente_id)')
    .eq('client_id', o.clientId).gte('date_visite', v.ymd).lt('date_visite', lendemain).neq('statut', 'annulee');
  if (error) throw new Error('Ses autres visites du jour n’ont pas pu être lues : ' + error.message);
  type Ligne = { id: string; bien_id: string | null; statut: string; date_visite: string | null; heure: string | null; biens?: { titre?: string | null; ville?: string | null; quartier?: string | null; bien_vente_id?: string | null } | null };
  return ((data || []) as unknown as Ligne[])
    .filter(x => x.id !== v.cle && x.statut !== 'annulee' && String(x.date_visite || '').slice(0, 10) === v.ymd)
    .map(x => ({
      cle: x.id, ymd: v.ymd, heure: x.heure ? String(x.heure).slice(0, 5) : '',
      bienId: x.bien_id, bienVenteId: x.biens?.bien_vente_id || null,
      titre: x.biens?.titre || x.biens?.ville || 'Bien', lieu: [x.biens?.quartier, x.biens?.ville].filter(Boolean).join(', '),
    }))
    .sort((a, b) => (a.heure || '99').localeCompare(b.heure || '99'));
}

/* Ouvrir le bon de cette visite, demander pour les autres du jour, ou le
   créer tout de suite. */
export async function preparerBon(o: DepartBon): Promise<{ ouvrir: string } | { choix: AutreVisite[] }> {
  const [docs, autres] = await Promise.all([bonsPour(o), memeJour(o)]);
  const deja = docs.find(x => porte(x, o.visite));
  if (deja) return { ouvrir: deja.id };
  const choix = autres.map(a => ({ ...a, surUnBon: docs.some(x => porte(x, a)) }));
  /* Toutes déjà sur un bon : rien à demander. */
  if (choix.some(a => !a.surUnBon)) return { choix };
  return { ouvrir: await creerBonDeVisite(o, []) };
}

/* ── Ce que le CRM sait déjà ── */
async function lireClient(id: string | null): Promise<ClientBon | null> {
  if (!id) return null;
  let r = await supabase.from('clients').select('id, prenom, nom, civilite, couple, conjoint, adresse, emails, telephones').eq('id', id).maybeSingle();
  /* Avant le SQL des couples (outils/sql/signature-plusieurs.sql), ces colonnes n'existent pas. */
  if (r.error && /civilite|couple|conjoint/.test(r.error.message)) r = await supabase.from('clients').select('id, prenom, nom, adresse, emails, telephones').eq('id', id).maybeSingle();
  if (r.error) throw new Error('Sa fiche n’a pas pu être lue : ' + r.error.message);
  return (r.data as ClientBon | null) || null;
}

/* Les visiteurs : le client, et son conjoint quand sa fiche est un couple
   (même foyer : même adresse). Hors CRM : le nom noté. */
function visiteursDe(c: ClientBon | null, libre?: Personne | null): Personne[] {
  if (!c) return [libre || { ...PERSONNE_VIDE }];
  const p = personneDepuisClient(c);
  const j = c.couple ? conjointDe(c.conjoint) : null;
  if (!j) return [p];
  return [p, {
    ...PERSONNE_VIDE, civilite: j.civilite === 'Madame' || j.civilite === 'Monsieur' ? j.civilite : '',
    prenom: j.prenom || '', nom: j.nom || '', naissanceDate: j.naissanceDate || '', naissanceLieu: j.naissanceLieu || '',
    adresse: c.adresse || '', email: j.email || '', telephone: j.telephone || '',
  }];
}

/* Les biens des visites : la copie chez l'acheteur, et le bien en vente de
   l'agence quand c'en est un (son adresse, son prix et sa référence sont là). */
async function lireBiens(vs: VisiteBon[], deja?: BienVente | null) {
  const ids = [...new Set(vs.map(v => v.bienId).filter((x): x is string => !!x))];
  const copies: Record<string, CopieBien> = {};
  if (ids.length) {
    const { data, error } = await supabase.from('biens').select(COLS_BIEN).in('id', ids);
    if (error) throw new Error('Les biens visités n’ont pas pu être lus : ' + error.message);
    for (const b of (data || []) as unknown as CopieBien[]) copies[b.id] = b;
  }
  const ventes: Record<string, BienVente> = deja ? { [deja.id]: deja } : {};
  const idsV = [...new Set(vs.map(v => v.bienVenteId || (v.bienId ? copies[v.bienId]?.bien_vente_id : null)).filter((x): x is string => !!x && !ventes[x]))];
  if (idsV.length) {
    const { data, error } = await supabase.from('biens_vente').select('*').in('id', idsV);
    if (error) throw new Error('Les biens de l’agence n’ont pas pu être lus : ' + error.message);
    for (const b of (data || []) as BienVente[]) ventes[b.id] = b;
  }
  return { copies, ventes };
}

/* Créer le brouillon : la visite d'où l'on part, puis celles retenues. */
export async function creerBonDeVisite(o: DepartBon, autres: VisiteBon[]): Promise<string> {
  const m = modele('bon_visite');
  if (!m) throw new Error('Le modèle du bon de visite est introuvable.');
  const toutes = [o.visite, ...autres.slice(0, MAX_AUTRES_BIENS)];
  const [identite, client, { copies, ventes }] = await Promise.all([identiteDuJour(), lireClient(o.clientId), lireBiens(toutes, o.bienVente)]);
  const lignes = toutes.map(v => {
    const copie = v.bienId ? copies[v.bienId] || null : null;
    const bv = ventes[v.bienVenteId || copie?.bien_vente_id || ''] || null;
    /* Un bien de l'agence : sa fiche de vente (son adresse complète, le prix
       de son annonce) ; sinon le bien tel que l'acheteur l'a dans son dossier. */
    const bien: Contexte['bien'] = bv ? { ...contexteDocument(bv), id: copie?.id || '', bien_vente_id: bv.id } : copie;
    const x = m.defaut({ identite, client: null, bien, visite: { date_visite: v.ymd || null, heure: v.heure || null } });
    return {
      adresse: x.adresse, ville: x.ville, description: x.description, prix: x.prix, reference: bv?.reference || '',
      agenceVendeur: bv ? '' : x.agenceVendeur, dateVisite: x.dateVisite, heure: x.heure,
      bienId: v.bienId || '', bienVenteId: bv?.id || v.bienVenteId || '', visiteId: v.cle,
    };
  });
  const [premier, ...suite] = lignes;
  const base = m.defaut({ identite, client: null, bien: null, visite: null });
  const donnees: Donnees = {
    ...base,
    /* Comme depuis la fiche du bien : ses propres biens en vente, l'agence
       intervient pour le vendeur. Un seul bien d'une autre agence ou d'un
       particulier sur le bon : pour l'acquéreur — l'engagement « pas
       d'achat en direct » ne vaut que pour les biens dont elle a le mandat. */
    role: lignes.every(l => l.bienVenteId) ? 'vendeur' : 'acquereur',
    visiteurs: visiteursDe(client, o.visiteur),
    ...premier,
    autresBiens: suite,
  };
  const { data, error } = await supabase.from('documents').insert({
    modele: m.id, categorie: m.categorie, statut: 'brouillon', donnees, ...colonnesListe(m, donnees),
    client_id: o.clientId || null, bien_id: o.visite.bienId || null, recherche_id: o.rechercheId || null,
  }).select('id').single();
  if (error || !data) throw new Error('Le bon de visite n’a pas pu être créé : ' + (error?.message || 'rien n’est revenu'));
  return (data as { id: string }).id;
}

/* ── Le geste, pour chaque écran ──
   `lancer` : le bouton « Bon de visite » d'une visite. `enCours` : la clé de
   la visite qui se prépare (son bouton dit « Préparation… »). `fenetre` : la
   question du même jour, à poser dans l'écran. Un échec s'affiche en rouge
   (Avertissements), ou là où l'écran le veut (`onErreur`). */
export function useBonDeVisite(o: { onOuvrir: (id: string) => void; onErreur?: (m: string) => void }) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const [choix, setChoix] = useState<{ depart: DepartBon; autres: AutreVisite[] } | null>(null);
  const dire = (e: unknown) => {
    const t = (e as Error)?.message || 'erreur inconnue';
    if (o.onErreur) o.onErreur(t); else signalerEchec('Le bon de visite', t);
  };
  async function lancer(depart: DepartBon) {
    if (enCours) return;
    setEnCours(depart.visite.cle);
    try {
      const r = await preparerBon(depart);
      if ('ouvrir' in r) o.onOuvrir(r.ouvrir);
      else setChoix({ depart, autres: r.choix });
    } catch (e) { dire(e); }
    setEnCours(null);
  }
  const fenetre = choix ? (
    <ChoixMemeJour depart={choix.depart} autres={choix.autres} onFermer={() => setChoix(null)}
      onCreer={async retenues => {
        const id = await creerBonDeVisite(choix.depart, retenues);
        setChoix(null);
        o.onOuvrir(id);
      }} />
  ) : null;
  return { lancer, enCours, fenetre };
}

/* ── Où en est le bon d'une visite (V3.154) ──
   Alexandre : « garder toujours le mot Bon de visite, et entre parenthèses
   à finir, à signer, ou signé, en vert ». Le bouton de chaque visite le dit :
   « Bon de visite (à finir) » pour un brouillon, « (à signer) » pour un bon
   prêt ou envoyé, « (signé) » quand tout le monde a signé. Rien entre
   parenthèses : pas encore de bon pour cette visite. */
export type EtatBon = 'brouillon' | 'pret' | 'signe';
const RANG_ETAT: Record<EtatBon, number> = { brouillon: 1, pret: 2, signe: 3 };
export const ETAT_BON: Record<EtatBon, { t: string; c: string }> = {
  brouillon: { t: 'à finir', c: '#64748b' },
  pret: { t: 'à signer', c: '#2563eb' },
  signe: { t: 'signé', c: '#15803d' },
};
/* Les bons de visite (pas les annulés), lus une fois à l'ouverture de
   l'écran ; rend `etat(depart)`. Deux bons sur la même visite : le plus
   avancé l'emporte. Une lecture ratée : les boutons restent « Bon de
   visite », sans parenthèse (le clic, lui, relit tout). */
export function useEtatsBons(): (o: DepartBon) => EtatBon | null {
  const [docs, setDocs] = useState<DocBon[]>([]);
  useEffect(() => {
    let vivant = true;
    supabase.from('documents').select(COLS_DOC).eq('modele', 'bon_visite').neq('statut', 'annule')
      .order('created_at', { ascending: false }).limit(1000)
      .then(({ data, error }) => {
        if (!vivant) return;
        if (error) { console.error('[bons de visite] lecture', error.message); return; }
        setDocs((data || []) as DocBon[]);
      });
    return () => { vivant = false; };
  }, []);
  return useCallback((o: DepartBon) => {
    let mieux: EtatBon | null = null;
    for (const x of candidats(docs, o)) {
      const e = x.statut as EtatBon;
      if (!(e in RANG_ETAT) || !porte(x, o.visite)) continue;
      if (!mieux || RANG_ETAT[e] > RANG_ETAT[mieux]) mieux = e;
    }
    return mieux;
  }, [docs]);
}
/* Le texte du bouton, le même sur tous les écrans. */
export function LibelleBon({ etat, enCours }: { etat?: EtatBon | null; enCours?: boolean }) {
  if (enCours) return <span>Préparation…</span>;
  const e = etat ? ETAT_BON[etat] : null;
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {'Bon de visite'}
      {e && <small style={{ color: e.c, fontWeight: 800, fontSize: '.9em', marginLeft: 4 }}>{`(${e.t})`}</small>}
    </span>
  );
}

/* ── La question du même jour ──
   « Julie a aussi 2 autres visites ce jour-là » : la visite d'où l'on part
   (toujours sur le bon), puis les autres, cochées d'avance — sauf celles
   qu'un bon porte déjà. Six biens au plus sur un bon. */
function ChoixMemeJour({ depart, autres, onFermer, onCreer }: {
  depart: DepartBon; autres: AutreVisite[]; onFermer: () => void; onCreer: (retenues: VisiteBon[]) => Promise<void>;
}) {
  const [coches, setCoches] = useState<string[]>(() => autres.filter(a => !a.surUnBon).slice(0, MAX_AUTRES_BIENS).map(a => a.cle));
  const [travail, setTravail] = useState(false);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !travail) onFermer(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFermer, travail]);

  const n = autres.length;
  const plein = coches.length >= MAX_AUTRES_BIENS;
  const total = 1 + coches.length;
  async function creer() {
    setTravail(true); setErreur('');
    try { await onCreer(autres.filter(a => coches.includes(a.cle))); }
    catch (e) { setErreur((e as Error).message); setTravail(false); }
  }
  const ligne = (v: VisiteBon, o: { on: boolean; fixe?: boolean; tag?: string; off?: boolean; clic?: () => void }) => (
    <button key={v.cle} type="button" role="checkbox" aria-checked={o.on} disabled={o.fixe || o.off || travail}
      className={`${s.mjLigne} ${o.on ? s.mjOn : ''} ${o.fixe ? s.mjFixe : ''}`} onClick={o.clic}>
      <span className={s.mjHeure}>{v.heure || '—'}</span>
      <span className={s.mjTx}><b>{v.titre}</b>{v.lieu && <small>{v.lieu}</small>}</span>
      {o.tag && <span className={s.mjTag}>{o.tag}</span>}
      <span className={s.mjBx}>{o.on && <Ic n="check" t={12} e={3} />}</span>
    </button>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className={s.fenetre} onClick={e => { if (e.target === e.currentTarget && !travail) onFermer(); }}>
      <div className={`${s.fenetreIn} ${s.confIn}`} role="dialog" aria-modal="true" aria-label="Le bon de visite de la journée">
        <div className={s.fenTete}>
          <span className={s.confIc} data-ton="or"><Ic n="calendrier" t={19} /></span>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h3>{`${depart.qui || 'Ce client'} a aussi ${n} autre${n > 1 ? 's' : ''} visite${n > 1 ? 's' : ''} ce jour-là`}</h3>
            <p>{n > 1 ? 'Les mettre sur le même bon ? Tout reste modifiable dans le document.' : 'La mettre sur le même bon ? Tout reste modifiable dans le document.'}</p>
          </div>
          <button type="button" className={s.panFermer} aria-label="Fermer" disabled={travail} onClick={onFermer}><Croix /></button>
        </div>
        <div className={s.fenCorps}>
          <div className={s.mjListe}>
            {ligne(depart.visite, { on: true, fixe: true, tag: 'Ce bien' })}
            {autres.map(a => {
              const on = coches.includes(a.cle);
              return ligne(a, {
                on, tag: a.surUnBon ? 'Déjà sur un bon' : undefined, off: !on && plein,
                clic: () => setCoches(l => (on ? l.filter(x => x !== a.cle) : [...l, a.cle])),
              });
            })}
          </div>
          {plein && n > MAX_AUTRES_BIENS && <div className={s.chAide}>{`Six biens au plus sur un même bon : fais un second bon pour les autres.`}</div>}
          {erreur && <div className={s.erreur}>{erreur}</div>}
        </div>
        <div className={s.fenPied}>
          <button type="button" className={s.btn} disabled={travail} onClick={onFermer}>Annuler</button>
          <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={travail} onClick={() => { void creer(); }}>
            <Ic n="plume" t={15} />{travail ? 'Préparation…' : total > 1 ? `Faire le bon des ${total} biens` : 'Faire le bon de ce bien seul'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
