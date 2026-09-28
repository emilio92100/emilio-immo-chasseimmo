'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Map as CarteML, Marker, GeoJSONSource } from 'maplibre-gl';
import { supabase } from '@/lib/supabase';
import FondCarte, { type MapLibre } from './FondCarte';
import {
  adresseUtile, assezPrecis, cleAdresse, composerAdresse, garderPositions, geocoder, lienItineraire,
  placerAdresses, CENTRE, type Position,
} from '@/lib/carte';
import { TYPES_CONTACT, estArchive, estPro, lirePro, typeDe, typesDe } from '@/lib/contacts';
import { etapeDe, nomProprio, type Donnees } from '@/lib/biens-vente';
import { nomFoyer } from '@/lib/foyer';
import { signalerEchec } from '@/lib/ecritures';
import { Ic } from '@/components/documents/ApercuActe';
import AvatarContact, { type Teinte } from '@/components/contacts/AvatarContact';
import { createRoot, type Root } from 'react-dom/client';
import { Icone } from '@/components/fiche/ParcoursBien';
import { signalerFicheOuverte } from '@/components/layout/FichesOuvertes';
import s from './Carte.module.css';

/* ═══ La rubrique Carte du CRM (V3.26) ═════════════════════════════════════
   Les contacts et les biens, là où ils sont. Deux panneaux posés sur la
   carte, qui se replient chacun d'une flèche pour la laisser prendre tout
   l'écran : à gauche les filtres (qui voir), à droite « Dans cette zone »
   (la liste suit la carte quand on la déplace). Un repère touché ouvre sa
   carte de visite : ouvrir la fiche, l'itinéraire, appeler.

   Sur téléphone : la recherche et les filtres en haut, en une bande qui
   défile ; en bas, les fiches de la zone, qu'on fait glisser du doigt — la
   carte suit la fiche, et la liste suit la carte.

   Seuls les contacts et les biens dont l'adresse est connue y figurent : le
   ⓘ le rappelle d'une phrase (pas de liste de ceux qui manquent, V3.28).

   On y arrive aussi d'une fiche (« Voir sur la carte ») : la carte s'ouvre
   sur le contact ou le bien, sa carte de visite ouverte. */

type Genre = 'contact' | 'bien';
type Point = {
  id: string;           // « c:<id> », « c:<id>:bien » (le bien qu'il possède), « b:<id> »
  genre: Genre;
  perso?: boolean;      // le bien d'un propriétaire, pas son domicile
  ref: string;          // l'id du contact ou du bien
  cats: string[];
  couleur: string;
  fond: string;
  /* L'avatar : la teinte du statut pour un acheteur (comme dans Mes
     contacts), celle du type pour les autres. */
  teinte?: Teinte;
  titre: string;
  sous: string;
  etiquette: string;
  adresse: string;
  cle: string;
  exact?: { lat: number; lng: number };
  photo?: string | null;
  prix?: number | null;
  tel?: string | null;
  client?: Record<string, unknown>;
  proprio?: string;
};
type Place = Point & { lat: number; lng: number };

/* Les filtres, dans l'ordre des panneaux. Les vendus et les retirés sont
   éteints d'office : ils encombreraient la carte de ce qui ne se travaille
   plus. */
/* `ic` : l'icône de la pastille (V3.28), la même que dans le menu et les
   fiches quand elle existe. */
type Cat = { k: string; lib: string; c: string; ic: string; etapes?: string[]; eteint?: boolean };
/* Le petit message du bas de la carte : une phrase, ou un titre et une phrase. */
type Msg = string | { titre?: string; texte: string };
const CATS_CONTACTS: Cat[] = [
  ...(['acheteur', 'vendeur', 'proprietaire'] as const).map(k => ({ k, lib: typeDe(k).pluriel, c: typeDe(k).c, ic: typeDe(k).ic })),
  { k: 'vente_possible', lib: 'Reventes possibles', c: '#a07c28', ic: 'maison' },
  ...(['notaire', 'confrere', 'gardien', 'partenaire'] as const).map(k => ({ k, lib: typeDe(k).pluriel, c: typeDe(k).c, ic: typeDe(k).ic })),
];
const CATS_BIENS: Cat[] = [
  { k: 'b:a_suivre', lib: 'À suivre', c: etapeDe('a_suivre').c, ic: 'oeil', etapes: ['a_suivre'] },
  { k: 'b:estimation', lib: 'Estimations', c: etapeDe('estimation').c, ic: 'euro', etapes: ['estimation'] },
  { k: 'b:mandat', lib: 'Mandats en cours', c: etapeDe('mandat').c, ic: 'panneau', etapes: ['mandat'] },
  { k: 'b:offre', lib: 'Sous offre ou compromis', c: etapeDe('offre').c, ic: 'accord', etapes: ['offre', 'compromis'] },
  { k: 'b:suspendu', lib: 'En pause', c: etapeDe('suspendu').c, ic: 'pause', etapes: ['suspendu'] },
  { k: 'b:vendu', lib: 'Vendus', c: etapeDe('vendu').c, ic: 'cle', etapes: ['vendu'], eteint: true },
  { k: 'b:retire', lib: 'Retirés', c: etapeDe('retire').c, ic: 'croix', etapes: ['retire'], eteint: true },
];
const TOUTES = [...CATS_CONTACTS, ...CATS_BIENS];
const actifsParDefaut = () => Object.fromEntries(TOUTES.map(c => [c.k, !c.eteint]));

/* Les teintes du statut d'un acheteur : les mêmes que la liste des contacts. */
const TEINTE_STATUT: Record<string, Teinte> = {
  prospect: { bg: '#f5f3ff', fg: '#6d28d9', trait: '#ddd6fe' },
  actif: { bg: '#ecfdf5', fg: '#0f7a4f', trait: '#a7e8c6' },
  suspendu: { bg: '#fffbeb', fg: '#b45309', trait: '#fde68a' },
  bien_trouve: { bg: '#eff6ff', fg: '#1d4ed8', trait: '#bcd4fb' },
  perdu: { bg: '#fef2f2', fg: '#b91c1c', trait: '#fecaca' },
};
const EUR = (n?: number | null) => (n ? `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} €` : '');
const normer = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const CLE_RETOUR = 'carte.retour';
const rue = (a: string) => a.replace(/,?\s*\d{5}\b.*$/, '').trim() || a;
/* Où tombe le repère choisi : un peu plus bas que le milieu sur ordinateur
   (sa carte de visite s'ouvre au-dessus), un peu plus haut sur téléphone
   (les fiches du bas le cacheraient). */
/* Téléphone : le centre utile est entre la recherche (en haut) et la bande
   des fiches (en bas), presque au milieu de l'écran depuis qu'elle est fine. */
const DECALAGE = (tel: boolean, o?: { filtres: boolean; liste: boolean }): [number, number] =>
  (tel ? [0, 8] : [Math.round(((o?.filtres ? 410 : 0) - (o?.liste ? 350 : 0)) / 2), 120]);
const lire = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrire = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sans mémoire, tant pis */ } };

/* ── Les contacts et les biens, devenus des points à placer ── */
function pointsDesContacts(clients: Record<string, unknown>[]): { points: Point[]; sansAdresse: { c: Record<string, unknown>; cats: string[] }[] } {
  const points: Point[] = [];
  const sansAdresse: { c: Record<string, unknown>; cats: string[] }[] = [];
  for (const c of clients) {
    if (estArchive(c)) continue;
    const t = typesDe(c);
    const p = lirePro(c.pro);
    const cats: string[] = [...t];
    if (c.statut_occupation === 'proprietaire' && !cats.includes('proprietaire')) cats.push('proprietaire');
    if (c.bien_actuel_a_vendre) cats.push('vente_possible');
    const perso = typeof c.adresse === 'string' ? c.adresse : '';
    const adrPro = t.includes('notaire') ? p.adresseEtude : t.includes('confrere') ? p.adresseAgence : t.includes('gardien') ? p.immeuble : '';
    /* Un professionnel se trouve à son étude, à son agence, à son
       immeuble ; un particulier, chez lui. */
    const adresse = (estPro(t) ? (adresseUtile(adrPro) ? adrPro : perso) : (adresseUtile(perso) ? perso : adrPro || '')) || '';
    const tel = Array.isArray(c.telephones) ? String(c.telephones.find(Boolean) || '') || null : null;
    const nom = nomFoyer(c as never) || 'Contact';
    const principal = TYPES_CONTACT.find(x => cats.includes(x.k)) || typeDe('acheteur');
    const teinte: Teinte = t.includes('acheteur')
      ? TEINTE_STATUT[String(c.statut || 'actif')] || TEINTE_STATUT.actif
      : { bg: principal.fond, fg: principal.c };
    const bienAilleurs = typeof c.bien_actuel_adresse === 'string' && adresseUtile(c.bien_actuel_adresse)
      && cleAdresse(c.bien_actuel_adresse) !== cleAdresse(adresse) ? c.bien_actuel_adresse : '';
    let catsPrincipal = cats;
    if (bienAilleurs) {
      const duBien = cats.filter(k => k === 'proprietaire' || k === 'vente_possible');
      if (!duBien.length) duBien.push('proprietaire');
      points.push({
        id: `c:${c.id}:bien`, genre: 'contact', perso: true, ref: String(c.id), cats: duBien,
        couleur: c.bien_actuel_a_vendre ? '#a07c28' : typeDe('proprietaire').c, fond: c.bien_actuel_a_vendre ? '#fbf6e9' : typeDe('proprietaire').fond,
        titre: nom, sous: `${c.bien_actuel_a_vendre ? 'Son bien, à revendre' : 'Son bien'} · ${rue(bienAilleurs)}`,
        etiquette: c.bien_actuel_a_vendre ? 'Revente possible' : 'Son bien', adresse: bienAilleurs, cle: cleAdresse(bienAilleurs), tel, client: c,
      });
      catsPrincipal = cats.filter(k => k !== 'vente_possible' && (k !== 'proprietaire' || t.includes('proprietaire')));
      if (!catsPrincipal.length) catsPrincipal = ['proprietaire'];
    }
    if (!adresseUtile(adresse)) { if (!bienAilleurs) sansAdresse.push({ c, cats: catsPrincipal }); continue; }
    points.push({
      id: `c:${c.id}`, genre: 'contact', ref: String(c.id), cats: catsPrincipal,
      couleur: principal.c, fond: principal.fond, teinte, titre: nom,
      sous: `${t.map(k => typeDe(k).lib).join(', ')} · ${rue(adresse)}`,
      etiquette: t.map(k => typeDe(k).lib).join(' · '), adresse, cle: cleAdresse(adresse), tel, client: c,
    });
  }
  return { points, sansAdresse };
}

type LigneBien = {
  id: string; etape: string; archive: boolean; client_id: string | null; titre: string | null;
  adresse: string | null; code_postal: string | null; ville: string | null; prix: number | null; photo: string | null;
  gps: { lat?: number; lon?: number } | null; proprietaires: unknown; qui: unknown; sciNom: unknown;
};
function pointsDesBiens(biens: LigneBien[], clients: Map<string, Record<string, unknown>>): { points: Point[]; sansAdresse: { b: LigneBien; cats: string[] }[] } {
  const points: Point[] = [];
  const sansAdresse: { b: LigneBien; cats: string[] }[] = [];
  for (const b of biens) {
    if (b.archive) continue;
    const e = etapeDe(b.etape);
    const cat = CATS_BIENS.find(c => c.etapes?.includes(e.k))?.k || 'b:a_suivre';
    const adresse = composerAdresse(b.adresse, b.code_postal, b.ville);
    const exact = b.gps && typeof b.gps.lat === 'number' && typeof b.gps.lon === 'number' ? { lat: b.gps.lat, lng: b.gps.lon } : undefined;
    if (!exact && !adresseUtile(b.adresse)) { sansAdresse.push({ b, cats: [cat] }); continue; }
    const cl = b.client_id ? clients.get(b.client_id) : undefined;
    const proprio = (cl ? nomFoyer(cl as never) : '') || nomProprio({ proprietaires: b.proprietaires, qui: b.qui, sciNom: b.sciNom } as Donnees);
    points.push({
      id: `b:${b.id}`, genre: 'bien', ref: b.id, cats: [cat], couleur: e.c, fond: `${e.c}18`,
      titre: b.titre || 'Bien', sous: `${e.court}${b.adresse ? ` · ${rue(b.adresse)}` : ''}`, etiquette: e.lib,
      adresse, cle: cleAdresse(adresse), exact, photo: b.photo, prix: b.prix, proprio,
      tel: cl && Array.isArray(cl.telephones) ? String(cl.telephones.find(Boolean) || '') || null : null,
    });
  }
  return { points, sansAdresse };
}

/* ── Les repères, en DOM : MapLibre les pose et les déplace lui-même ── */
const SVG_MAISON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/></svg>';
const SVG_CLE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3.5"/><path d="M16.5 7l3 3"/></svg>';
/* Les avatars dessinés dans les repères, à démonter quand le repère part. */
const RACINES = new WeakMap<HTMLElement, Root>();
function retirerRepere(r: Marker) {
  const b = r.getElement().firstElementChild as HTMLElement | null;
  const racine = b ? RACINES.get(b) : undefined;
  r.remove();
  if (racine) setTimeout(() => racine.unmount(), 0);
}
/* Le repère lui-même est un bouton posé DANS une enveloppe : MapLibre place
   l'enveloppe en la déplaçant (transform), le bouton peut grossir au survol
   sans jamais la faire sauter. */
function envelopper(b: HTMLElement, id?: string): HTMLElement {
  const env = document.createElement('div');
  env.className = s.env;
  if (id) env.dataset.id = id;
  env.appendChild(b);
  return env;
}
function elementPoint(p: Point): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `${s.rep} ${p.genre === 'bien' ? s.repBien : p.perso ? s.repPerso : s.repContact}`;
  el.style.setProperty('--c', p.couleur);
  el.setAttribute('aria-label', `${p.titre} — ${p.sous}`);
  if (p.genre === 'bien') el.innerHTML = `<span>${SVG_MAISON}</span>`;
  else if (p.perso) el.innerHTML = `<span>${SVG_CLE}</span>`;
  else {
    /* Le même petit personnage que dans Mes contacts (une mallette pour un
       professionnel, deux pour un couple), dessiné par React dans le repère. */
    const t = p.teinte || { bg: p.fond, fg: p.couleur };
    el.style.setProperty('--c', t.fg);
    const racine = createRoot(el);
    racine.render(<AvatarContact c={(p.client || {}) as never} teinte={t} taille={33} />);
    RACINES.set(el, racine);
  }
  return envelopper(el, p.id);
}
function elementAmas(n: number): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = s.amas;
  const d = n < 10 ? 34 : n < 30 ? 40 : n < 100 ? 48 : 56;
  el.style.width = el.style.height = `${d}px`;
  el.setAttribute('aria-label', `${n} repères : zoomer`);
  const b = document.createElement('b');
  b.textContent = String(n);
  el.appendChild(b);
  return envelopper(el);
}

export default function PageCarte({ onNavigate, onMenu }: {
  onNavigate: (page: string, data?: unknown) => void;
  /* Téléphone : la barre du haut du CRM est masquée sur la carte, le menu
     s'ouvre depuis la recherche de la carte (V3.28). */
  onMenu?: () => void;
}) {
  const [tel, setTel] = useState(false);
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [sansAdresse, setSansAdresse] = useState<{ id: string; nom: string; genre: Genre; raison: string; cats: string[] }[]>([]);
  const positions = useRef(new Map<string, Position | null>());
  const [posV, setPosV] = useState(0);
  const [progres, setProgres] = useState<{ fait: number; total: number } | null>(null);
  const [tableAbsente, setTableAbsente] = useState(false);
  const [actifs, setActifs] = useState<Record<string, boolean>>(actifsParDefaut);
  const [recherche, setRecherche] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [zone, setZone] = useState<string[]>([]);
  const [ouverts, setOuverts] = useState({ filtres: true, liste: true });
  /* « Qui est sur la carte ? » : une phrase derrière le ⓘ, au téléphone
     comme sur ordinateur (V3.28). */
  const [voirSans, setVoirSans] = useState(false);
  /* Téléphone (V3.28) : les filtres rangés sous deux boutons, « Contacts » et
     « Biens » ; un seul panneau ouvert à la fois. */
  const [pliTel, setPliTel] = useState<null | 'contacts' | 'biens'>(null);
  /* Le petit message du bas : une phrase, ou un titre et une phrase. */
  const [message, setMessage] = useState<Msg | null>(null);
  const [cartePrete, setCartePrete] = useState(false);
  /* Toutes les adresses ont été cherchées (ou lues dans la mémoire). */
  const [fini, setFini] = useState(false);

  const carte = useRef<CarteML | null>(null);
  const ml = useRef<MapLibre | null>(null);
  const reperes = useRef(new Map<string, Marker>());
  const fiche = useRef<HTMLDivElement>(null);
  const carrousel = useRef<HTMLDivElement>(null);
  const parCarrousel = useRef(false);
  const focus = useRef<string | null>(null);
  const cadre = useRef(false);
  /* Le repère à rallumer au retour d'une fiche (voir quitterPour). */
  const retourSel = useRef<string | null>(null);
  const monPoint = useRef<Marker | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  /* La carte prend exactement la hauteur qui reste : sous la barre du haut,
     au-dessus des onglets du téléphone et de la bande des fiches ouvertes
     quand elle est là. Rien ne défile, c'est la carte qu'on déplace. */
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const main = el.closest('main') as HTMLElement | null;
    const maj = () => {
      const telephone = window.matchMedia('(max-width: 900px)').matches;
      const defile = telephone ? (main?.parentElement as HTMLElement | null) : main;
      const haut = el.getBoundingClientRect().top + (defile?.scrollTop || 0);
      if (telephone || !main) {
        const pb = main && telephone ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
        el.style.height = `${Math.max(360, Math.round(window.innerHeight - haut - pb))}px`;
        return;
      }
      /* Ordinateur (V3.28) : jusqu'au bas de la zone qui défile, et non de la
         fenêtre — la barre des fiches ouvertes, posée dessous, mangeait le
         bas de la carte et son bouton « − ». */
      el.style.height = `${Math.max(360, Math.round(main.getBoundingClientRect().bottom - haut))}px`;
    };
    maj();
    const t = setTimeout(maj, 480); // après l'entrée de l'écran, qui le fait glisser
    /* Et à la fin de ce glissement, quelle que soit sa durée : mesurée pendant,
       la carte dépassait du bas de l'écran de la hauteur du décalage. */
    const finGlissement = (e: AnimationEvent) => { if ((e.target as Element)?.contains?.(el)) maj(); };
    document.addEventListener('animationend', finGlissement);
    window.addEventListener('resize', maj);
    const mo = main ? new MutationObserver(maj) : null;
    if (main) mo?.observe(main, { attributes: true, attributeFilter: ['class'] });
    /* La barre des fiches ouvertes apparaît, disparaît : la zone change de hauteur. */
    const ro = main ? new ResizeObserver(maj) : null;
    if (main) ro?.observe(main);
    return () => { clearTimeout(t); document.removeEventListener('animationend', finGlissement); window.removeEventListener('resize', maj); mo?.disconnect(); ro?.disconnect(); };
  }, [tel]);

  /* Téléphone ou ordinateur ; les filtres et les panneaux d'une visite à
     l'autre ; le contact ou le bien demandé par une fiche. */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const maj = () => setTel(mq.matches);
    maj();
    mq.addEventListener('change', maj);
    try {
      const f = JSON.parse(lire('carte.filtres') || 'null');
      if (f && typeof f === 'object') setActifs(a => ({ ...a, ...f }));
      const o = JSON.parse(lire('carte.panneaux') || 'null');
      if (o && typeof o === 'object') setOuverts(x => ({ ...x, ...o }));
    } catch { /* mémoire illisible : les réglages d'origine */ }
    focus.current = new URLSearchParams(window.location.search).get('focus');
    /* De retour d'une fiche ouverte depuis la carte (le bloc « Carte » de la
       barre du bas) : le repère choisi et la recherche d'alors. La vue, elle,
       est déjà dans carte.vue. */
    try {
      const r = JSON.parse(sessionStorage.getItem(CLE_RETOUR) || 'null');
      sessionStorage.removeItem(CLE_RETOUR);
      if (r && typeof r === 'object' && !focus.current) {
        if (typeof r.sel === 'string') retourSel.current = r.sel;
        if (typeof r.recherche === 'string') setRecherche(r.recherche);
      }
    } catch { /* sans mémoire : la carte s'ouvre sur sa dernière vue */ }
    return () => mq.removeEventListener('change', maj);
  }, []);
  const basculerCat = (k: string) => setActifs(a => { const n = { ...a, [k]: !a[k] }; ecrire('carte.filtres', JSON.stringify(n)); return n; });
  const toutSection = (cats: Cat[], v: boolean) => setActifs(a => {
    const n = { ...a, ...Object.fromEntries(cats.map(c => [c.k, v])) };
    ecrire('carte.filtres', JSON.stringify(n));
    return n;
  });
  const basculerPanneau = (k: 'filtres' | 'liste') => setOuverts(o => { const n = { ...o, [k]: !o[k] }; ecrire('carte.panneaux', JSON.stringify(n)); return n; });

  /* ── Les données, puis leurs positions ── */
  useEffect(() => {
    let vivant = true;
    const arret = new AbortController();
    (async () => {
      const [cl, bv] = await Promise.all([
        supabase.from('clients').select('*'),
        supabase.from('biens_vente').select('id, etape, archive, client_id, titre, adresse, code_postal, ville, prix, photo, gps:donnees->gps, proprietaires:donnees->proprietaires, qui:donnees->qui, sciNom:donnees->sciNom'),
      ]);
      if (!vivant) return;
      if (cl.error) { setErreur(`Les contacts n’ont pas pu être lus : ${cl.error.message}`); setCharge(false); return; }
      const clients = (cl.data || []) as Record<string, unknown>[];
      const parId = new Map(clients.map(c => [String(c.id), c]));
      const pc = pointsDesContacts(clients);
      /* Sans la table des biens en vente (SQL pas encore passé), la carte
         montre les contacts, sans rien dire de plus. */
      const pb = bv.error ? { points: [], sansAdresse: [] } : pointsDesBiens((bv.data || []) as unknown as LigneBien[], parId);
      const tous = [...pb.points, ...pc.points];
      setPoints(tous);
      setSansAdresse([
        ...pc.sansAdresse.map(({ c, cats }) => ({ id: `c:${c.id}`, nom: nomFoyer(c as never) || 'Contact', genre: 'contact' as Genre, raison: 'pas d’adresse', cats })),
        ...pb.sansAdresse.map(({ b, cats }) => ({ id: `b:${b.id}`, nom: b.titre || 'Bien', genre: 'bien' as Genre, raison: 'pas d’adresse', cats })),
      ]);
      setCharge(false);
      /* Rafraîchir l'écran par vagues, pas à chaque adresse trouvée. */
      let minuterie: ReturnType<typeof setTimeout> | null = null;
      const bientot = () => { if (!minuterie) minuterie = setTimeout(() => { minuterie = null; if (vivant) setPosV(v => v + 1); }, 250); };
      const res = await placerAdresses(supabase, tous.filter(p => !p.exact).map(p => p.adresse), {
        signal: arret.signal,
        surPosition: (k, p) => { positions.current.set(k, p); bientot(); },
        surMemoireLue: n => { if (vivant) { setPosV(v => v + 1); if (n) setProgres({ fait: 0, total: n }); } },
        surProgres: (fait, total) => { if (vivant && total) setProgres(fait >= total ? null : { fait, total }); },
      });
      if (!vivant) return;
      setProgres(null);
      setPosV(v => v + 1);
      setFini(true);
      setTableAbsente(res.tableAbsente);
      if (!res.tableAbsente && res.aEcrire.length) {
        const e = await garderPositions(supabase, res.aEcrire);
        if (e) signalerEchec('La position des adresses', e);
      }
    })();
    return () => { vivant = false; arret.abort(); };
  }, []);

  /* Les points placés : l'adresse trouvée au numéro, à la rue, ou au
     lieu-dit. La ville seule ne place rien. */
  const places = useMemo<Place[]>(() => {
    const l: Place[] = [];
    for (const p of points) {
      if (p.exact) { l.push({ ...p, ...p.exact }); continue; }
      const pos = positions.current.get(p.cle);
      if (assezPrecis(pos)) l.push({ ...p, lat: pos.lat, lng: pos.lng });
    }
    /* Plusieurs repères à la même adresse (un gardien et un habitant de
       l'immeuble, un bien et son propriétaire) : on les écarte en petite
       couronne, sinon un seul se verrait. */
    const memes = new Map<string, Place[]>();
    for (const p of l) { const k = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`; memes.set(k, [...(memes.get(k) || []), p]); }
    for (const g of memes.values()) {
      if (g.length < 2) continue;
      g.forEach((p, i) => {
        const a = (i / g.length) * Math.PI * 2 - Math.PI / 2;
        p.lat += (Math.sin(a) * 18) / 111_320;
        p.lng += (Math.cos(a) * 18) / (111_320 * Math.cos((p.lat * Math.PI) / 180));
      });
    }
    return l;
    // posV : les positions arrivent par vagues.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, posV]);
  const parId = useMemo(() => new Map(places.map(p => [p.id, p])), [places]);

  const q = normer(recherche.trim());
  const visibles = useMemo(() => places.filter(p => p.cats.some(k => actifs[k])
    && (!q || normer(`${p.titre} ${p.sous} ${p.adresse} ${p.etiquette}`).includes(q))), [places, actifs, q]);
  const nbCat = useMemo(() => {
    const n: Record<string, number> = {};
    for (const p of places) for (const k of p.cats) n[k] = (n[k] || 0) + 1;
    return n;
  }, [places]);
  /* Ce que le CRM contient, placé ou non (V3.28) : un filtre s'affiche dès
     que sa catégorie existe, même si aucun n'a d'adresse — il montre alors
     « 0 », en pâle, et un appui dit pourquoi. Avant, les mandats sans
     adresse faisaient disparaître toute la section « Biens ». */
  const nbCrm = useMemo(() => {
    const n: Record<string, number> = {};
    for (const p of points) for (const k of p.cats) n[k] = (n[k] || 0) + 1;
    for (const x of sansAdresse) for (const k of x.cats) n[k] = (n[k] || 0) + 1;
    return n;
  }, [points, sansAdresse]);

  /* ── La carte ── */
  const visiblesRef = useRef(visibles);
  visiblesRef.current = visibles;
  const parIdRef = useRef(parId);
  parIdRef.current = parId;
  const telRef = useRef(tel);
  telRef.current = tel;
  const selRef = useRef(sel);
  selRef.current = sel;
  const ouvertsRef = useRef(ouverts);
  ouvertsRef.current = ouverts;

  const calculerZone = useCallback(() => {
    const m = carte.current;
    if (!m) return;
    const b = m.getBounds();
    const l = visiblesRef.current.filter(p => b.contains([p.lng, p.lat]));
    l.sort((a, z) => (a.genre === z.genre ? a.titre.localeCompare(z.titre, 'fr') : a.genre === 'bien' ? -1 : 1));
    setZone(l.map(p => p.id));
  }, []);

  const choisir = useCallback((id: string | null, o: { voler?: boolean; zoom?: number } = {}) => {
    setSel(id);
    const m = carte.current;
    const p = id ? parIdRef.current.get(id) : null;
    if (!m || !p || !o.voler) return;
    const z = Math.max(m.getZoom(), o.zoom ?? 15.6);
    m.flyTo({ center: [p.lng, p.lat], zoom: z, duration: 1000, essential: true, offset: DECALAGE(telRef.current, ouvertsRef.current) });
  }, []);

  const majReperes = useCallback(() => {
    const m = carte.current, lib = ml.current;
    if (!m || !lib || !m.getSource('pts') || !m.isSourceLoaded('pts')) return;
    const vus = new Set<string>();
    for (const f of m.querySourceFeatures('pts')) {
      const pr = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; id?: string };
      const cle = pr.cluster ? `k${pr.cluster_id}` : String(pr.id);
      if (vus.has(cle)) continue;
      vus.add(cle);
      if (reperes.current.has(cle)) continue;
      const xy = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
      let el: HTMLElement;
      if (pr.cluster) {
        el = elementAmas(pr.point_count || 0);
        const idAmas = pr.cluster_id!;
        el.addEventListener('click', ev => {
          ev.stopPropagation();
          (m.getSource('pts') as GeoJSONSource).getClusterExpansionZoom(idAmas)
            .then(z => m.easeTo({ center: xy, zoom: Math.min(z + 0.4, 17), duration: 650 }))
            .catch(() => m.easeTo({ center: xy, zoom: m.getZoom() + 2, duration: 650 }));
        });
      } else {
        const p = parIdRef.current.get(String(pr.id));
        if (!p) continue;
        el = elementPoint(p);
        if (p.id === selRef.current) { el.firstElementChild?.classList.add(s.repSel); el.style.zIndex = '5'; }
        el.addEventListener('click', ev => { ev.stopPropagation(); choisir(p.id); });
        el.addEventListener('mouseenter', () => setSurvol(p.id));
        el.addEventListener('mouseleave', () => setSurvol(x => (x === p.id ? null : x)));
      }
      const r = new lib.Marker({ element: el, anchor: pr.cluster ? 'center' : el.firstElementChild?.classList.contains(s.repBien) ? 'bottom' : 'center' })
        .setLngLat(xy).addTo(m);
      reperes.current.set(cle, r);
    }
    for (const [k, r] of reperes.current) if (!vus.has(k)) { retirerRepere(r); reperes.current.delete(k); }
  }, [choisir]);

  const surPrete = useCallback((m: CarteML, lib: MapLibre) => {
    carte.current = m;
    ml.current = lib;
    m.addSource('pts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 46, clusterMaxZoom: 14 });
    /* Une couche invisible : MapLibre ne calcule les amas que d'une source
       affichée. Les repères eux-mêmes sont du HTML, posés par-dessus. */
    m.addLayer({ id: 'pts-ancre', type: 'circle', source: 'pts', paint: { 'circle-radius': 1, 'circle-opacity': 0 } });
    let attente = 0;
    const planifier = () => { if (!attente) attente = requestAnimationFrame(() => { attente = 0; majReperes(); }); };
    m.on('render', planifier);
    m.on('moveend', () => {
      if (parCarrousel.current) { parCarrousel.current = false; return; }
      calculerZone();
      const c = m.getCenter();
      ecrire('carte.vue', JSON.stringify({ c: [c.lng, c.lat], z: m.getZoom() }));
    });
    m.on('click', () => { setSel(null); setPliTel(null); });
    setCartePrete(true);
    return () => { cancelAnimationFrame(attente); for (const r of reperes.current.values()) retirerRepere(r); reperes.current.clear(); carte.current = null; };
  }, [majReperes, calculerZone]);

  /* Les repères suivent les filtres, la recherche et les positions. */
  useEffect(() => {
    const m = carte.current;
    const src = m?.getSource('pts') as GeoJSONSource | undefined;
    if (!m || !src) return;
    /* Les amas se recalculent : on retire les leurs ; les repères des
       points restent en place (pas de clignement quand une adresse arrive). */
    for (const [k, r] of reperes.current) if (k.startsWith('k')) { r.remove(); reperes.current.delete(k); }
    src.setData({
      type: 'FeatureCollection',
      features: visibles.map(p => ({ type: 'Feature', properties: { id: p.id }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })),
    });
    calculerZone();
  }, [visibles, cartePrete, calculerZone]);

  /* Le premier cadrage : la fiche demandée, sinon la dernière vue, sinon
     tout ce qui est placé. Une seule fois. */
  useEffect(() => {
    const m = carte.current;
    if (!m || cadre.current || charge) return;
    const f = focus.current;
    if (f) {
      const p = parId.get(f) || parId.get(`${f}:bien`);
      if (p) {
        cadre.current = true;
        m.jumpTo({ center: [p.lng, p.lat], zoom: 13.2 });
        setTimeout(() => {
          m.flyTo({ center: [p.lng, p.lat], zoom: 16.2, duration: 1500, essential: true, offset: DECALAGE(tel, ouverts) });
          m.once('moveend', () => setSel(p.id));
        }, 250);
        return;
      }
      if (!fini) return; // les positions arrivent encore
      cadre.current = true;
      setMessage('Cette fiche n’a pas d’adresse que la carte sache placer : complète-la pour la voir ici.');
      return;
    }
    const v = (() => { try { return JSON.parse(lire('carte.vue') || 'null'); } catch { return null; } })();
    if (v && Array.isArray(v.c) && typeof v.z === 'number') { cadre.current = true; m.jumpTo({ center: v.c, zoom: v.z }); calculerZone(); return; }
    /* Tout voir : une fois toutes les adresses placées, pas sur les trois
       premières arrivées. */
    if (!fini || !places.length || !ml.current) return;
    cadre.current = true;
    const b = new ml.current.LngLatBounds();
    for (const p of places) b.extend([p.lng, p.lat]);
    m.fitBounds(b, { padding: tel ? { top: 130, bottom: 110, left: 44, right: 44 } : { top: 80, bottom: 60, left: ouverts.filtres ? 420 : 80, right: ouverts.liste ? 360 : 80 }, maxZoom: 15, duration: 900 });
  }, [cartePrete, charge, places, parId, fini, tel, ouverts, calculerZone]);

  /* Au retour d'une fiche : le repère d'où l'on était parti se rallume, dès
     que sa position est connue (la mémoire des adresses la donne vite). */
  useEffect(() => {
    const id = retourSel.current;
    if (!id || !cadre.current) return;
    if (parId.has(id)) { retourSel.current = null; setSel(id); }
    else if (fini) retourSel.current = null;
  }, [parId, fini, cartePrete, charge]);

  /* Le repère choisi et celui qu'on survole s'allument. */
  useEffect(() => {
    for (const r of reperes.current.values()) {
      const env = r.getElement();
      const id = env.dataset.id;
      const b = env.firstElementChild;
      if (!id || !b) continue;
      b.classList.toggle(s.repSel, id === sel);
      b.classList.toggle(s.repSurvol, id === survol && id !== sel);
      env.style.zIndex = id === sel ? '5' : id === survol ? '4' : '';
    }
  });

  /* La carte de visite suit son repère quand la carte bouge (ordinateur). */
  useEffect(() => {
    const m = carte.current;
    const p = sel ? parId.get(sel) : null;
    if (!m || !p || tel) return;
    const placer = () => {
      const el = fiche.current;
      if (!el) return;
      const xy = m.project([p.lng, p.lat]);
      const haut = el.offsetHeight + 40;
      el.style.left = `${xy.x}px`;
      el.style.top = `${xy.y}px`;
      el.classList.toggle(s.ficheDessous, xy.y < haut);
    };
    placer();
    m.on('move', placer);
    return () => { m.off('move', placer); };
  }, [sel, parId, tel]);

  /* Téléphone : la fiche choisie vient au milieu de la bande du bas. */
  useEffect(() => {
    if (!tel || !sel) return;
    const el = carrousel.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(sel)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [sel, tel, zone]);

  /* Téléphone : on fait glisser les fiches, la carte suit. */
  const finGlisse = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surGlisse = () => {
    if (finGlisse.current) clearTimeout(finGlisse.current);
    finGlisse.current = setTimeout(() => {
      const c = carrousel.current, m = carte.current;
      if (!c || !m) return;
      const milieu = c.scrollLeft + c.clientWidth / 2;
      let meilleur: HTMLElement | null = null, d = Infinity;
      for (const el of Array.from(c.querySelectorAll<HTMLElement>('[data-id]'))) {
        const x = el.offsetLeft + el.offsetWidth / 2;
        if (Math.abs(x - milieu) < d) { d = Math.abs(x - milieu); meilleur = el; }
      }
      const id = meilleur?.dataset.id;
      if (!id || id === sel) return;
      const p = parId.get(id);
      setSel(id);
      if (p) { parCarrousel.current = true; m.easeTo({ center: [p.lng, p.lat], duration: 650, offset: DECALAGE(true) }); }
    }, 140);
  };

  /* Autour de moi : là où est le téléphone (ou l'ordinateur). */
  const autourDeMoi = () => {
    if (!navigator.geolocation) { setMessage('Ce navigateur ne sait pas donner ta position.'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      const m = carte.current, lib = ml.current;
      if (!m || !lib) return;
      const xy: [number, number] = [pos.coords.longitude, pos.coords.latitude];
      if (!monPoint.current) {
        const el = document.createElement('div');
        el.className = s.moi;
        monPoint.current = new lib.Marker({ element: el }).setLngLat(xy).addTo(m);
      } else monPoint.current.setLngLat(xy);
      m.flyTo({ center: xy, zoom: 15.5, duration: 1100 });
    }, () => setMessage('La position n’a pas été donnée : autorise-la dans le navigateur pour t’en servir.'), { enableHighAccuracy: true, timeout: 10000 });
  };
  const toutVoir = () => {
    const m = carte.current, lib = ml.current;
    if (!m || !lib || !visibles.length) return;
    const b = new lib.LngLatBounds();
    for (const p of visibles) b.extend([p.lng, p.lat]);
    m.fitBounds(b, { padding: tel ? { top: 130, bottom: 110, left: 44, right: 44 } : { top: 80, bottom: 60, left: ouverts.filtres ? 420 : 80, right: ouverts.liste ? 360 : 80 }, maxZoom: 15.5, duration: 900 });
  };

  /* Une adresse tapée dans la recherche, qui ne correspond à personne : on y va. */
  const [cherche, setCherche] = useState(false);
  const allerA = async () => {
    const t = recherche.trim();
    if (t.length < 4) return;
    setCherche(true);
    try {
      const p = await geocoder(t);
      if (!p) { setMessage(`« ${t} » : adresse introuvable.`); return; }
      setRecherche('');
      carte.current?.flyTo({ center: [p.lng, p.lat], zoom: p.precision === 'municipality' ? 13 : 16, duration: 1200 });
    } catch { setMessage('La recherche d’adresse ne répond pas pour l’instant.'); }
    finally { setCherche(false); }
  };

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), typeof message === 'string' ? 6000 : 9000);
    return () => clearTimeout(t);
  }, [message]);
  const basculerInfo = () => { setPliTel(null); setVoirSans(v => !v); };

  /* Ouvrir une fiche depuis la carte : la carte prend place dans la barre
     des fiches ouvertes, et un clic sur ce bloc la rouvre là où on l'a
     laissée — même vue, même repère choisi, même recherche. */
  const quitterPour = (suite: () => void) => {
    const m = carte.current;
    if (m) { const c = m.getCenter(); ecrire('carte.vue', JSON.stringify({ c: [c.lng, c.lat], z: m.getZoom() })); }
    try { sessionStorage.setItem(CLE_RETOUR, JSON.stringify({ sel, recherche })); } catch { /* sans mémoire */ }
    const p = sel ? parId.get(sel) : null;
    signalerFicheOuverte({ k: 'carte', id: 'carte', titre: 'Carte', sous: p ? `près de ${rue(p.adresse)}` : undefined });
    suite();
  };
  const ouvrirFiche = (p: Point) => quitterPour(() => {
    if (p.genre === 'bien') onNavigate('biens', { bien: p.ref });
    else if (p.client) onNavigate('fiche', p.client);
  });

  const pSel = sel ? parId.get(sel) || null : null;
  /* La première position de la carte de visite, avant que la carte bouge. */
  const positionFiche = (p: Place): React.CSSProperties => {
    const xy = carte.current?.project([p.lng, p.lat]);
    return xy ? { left: xy.x, top: xy.y } : {};
  };
  const listeIds = q ? visibles.map(p => p.id) : zone;
  const liste = listeIds.map(id => parId.get(id)).filter((p): p is Place => !!p);
  const nbPlaces = new Set(places.map(p => p.ref)).size;

  /* ── Les morceaux de l'écran ── */
  const puces = (cats: Cat[]) => cats.filter(c => (nbCrm[c.k] || 0) > 0).map(c => {
    /* Des biens ou des contacts de ce type existent, mais aucun n'a d'adresse
       que la carte sache placer : la pastille le dit, et l'appui explique. */
    const vide = fini && !nbCat[c.k];
    return (
      <button key={c.k} type="button" className={`${s.puce} ${actifs[c.k] && !vide ? s.puceOn : ''} ${vide ? s.puceVide : ''}`}
        onClick={() => {
          if (!vide) { basculerCat(c.k); return; }
          setMessage({ titre: `${c.lib} : 0 sur la carte`, texte: 'Leur adresse manque, ou n’a pas été trouvée. Complète leur fiche pour les voir ici.' });
        }}
        aria-pressed={!!actifs[c.k] && !vide} style={{ '--c': c.c } as React.CSSProperties}>
        <span className={s.puceIc}><Ic n={c.ic} t={12} e={2.2} /></span>{c.lib}<b>{nbCat[c.k] || 0}</b>
      </button>
    );
  });
  /* Qui est sur la carte : une phrase, au ⓘ (V3.28). Avant, un bloc avec
     le nombre et la liste de ceux qui manquent restait affiché sous les
     filtres de l'ordinateur — Alexandre n'en voyait pas l'intérêt. */
  const rappelAdresses = (
    <div className={s.rappel}>
      <span className={s.rappelIc}><Icone nom="info" taille={15} epaisseur={2} /></span>
      <p className={s.rappelTxt}>Seuls les contacts et les biens dont l’adresse est connue sont sur la carte.</p>
      <button type="button" className={s.rappelFermer} onClick={() => setVoirSans(false)} aria-label="Fermer">×</button>
      {tableAbsente && <small className={s.sql}>Les adresses sont recherchées à chaque ouverture tant que le fichier outils/sql/carte.sql n’a pas été passé dans Supabase.</small>}
    </div>
  );

  const carteDeVisite = (p: Place, compacte = false) => {
    const itineraire = lienItineraire(p.lat, p.lng);
    return (
      <>
        {p.genre === 'bien' && !compacte && (
          <div className={s.ficheImg} style={p.photo ? { backgroundImage: `url(${p.photo})` } : undefined}>
            {!p.photo && <Ic n="photo" t={24} />}
            <span className={s.ficheTag} style={{ '--c': p.couleur } as React.CSSProperties}><i />{p.etiquette}</span>
          </div>
        )}
        <div className={s.ficheCorps}>
          {p.genre === 'contact' ? (
            <div className={s.ficheQui}>
              <AvatarContact c={(p.client || {}) as never} teinte={p.teinte || { bg: p.fond, fg: p.couleur }} taille={compacte ? 38 : 42} />
              <div>
                <b>{p.titre}</b>
                <span className={s.ficheTypes} style={{ '--c': p.couleur } as React.CSSProperties}>{p.etiquette}</span>
              </div>
            </div>
          ) : (
            <>
              {compacte && <span className={s.ficheTag2} style={{ '--c': p.couleur } as React.CSSProperties}><i />{p.etiquette}</span>}
              <b className={s.ficheTitre}>{p.titre}</b>
              {!!p.prix && <span className={s.fichePrix}>{EUR(p.prix)}</span>}
            </>
          )}
          <span className={s.ficheLigne}><Ic n="lieu" t={13} /><span>{p.perso ? `Son bien : ${p.adresse}` : p.adresse}</span></span>
          {/* Le contact possède un bien ailleurs : on y va d'un clic, et retour. */}
          {p.genre === 'contact' && !compacte && (() => {
            const autre = parId.get(p.perso ? p.id.replace(/:bien$/, '') : `${p.id}:bien`);
            return autre ? (
              <button type="button" className={s.ficheSaut} onClick={() => choisir(autre.id, { voler: true })}>
                <Ic n={p.perso ? 'personne' : 'cle'} t={13} /><span>{p.perso ? 'Voir son domicile' : `Voir son bien · ${rue(autre.adresse)}`}</span>
              </button>
            ) : null;
          })()}
          {p.genre === 'bien' && p.proprio && <span className={s.ficheLigne}><Ic n="personne" t={13} /><span>{p.proprio}</span></span>}
          <div className={s.ficheBoutons}>
            <button type="button" className={s.btnPlein} onClick={() => ouvrirFiche(p)}>Ouvrir la fiche</button>
            <a className={s.btn} href={itineraire} target="_blank" rel="noopener noreferrer">Itinéraire</a>
            {tel && p.tel && <a className={s.btn} href={`tel:${p.tel.replace(/\s/g, '')}`} aria-label={`Appeler ${p.titre}`}><Ic n="telephone" t={15} /></a>}
          </div>
        </div>
      </>
    );
  };

  const ligne = (p: Place) => (
    <li key={p.id}>
      <button type="button" className={`${s.ligne} ${sel === p.id ? s.ligneSel : ''}`}
        onClick={() => choisir(p.id, { voler: true })} onMouseEnter={() => setSurvol(p.id)} onMouseLeave={() => setSurvol(null)}>
        {p.genre === 'bien'
          ? <span className={s.ligneIc} style={{ '--c': p.couleur } as React.CSSProperties}><Ic n="maison" t={15} e={2.1} /></span>
          : p.perso
            ? <span className={s.ligneIc} style={{ '--c': p.couleur } as React.CSSProperties}><Ic n="cle" t={14} e={2.1} /></span>
            : <AvatarContact c={(p.client || {}) as never} teinte={p.teinte || { bg: p.fond, fg: p.couleur }} taille={32} />}
        <span className={s.ligneTxt}><b>{p.titre}</b><small>{p.sous}</small></span>
      </button>
    </li>
  );

  return (
    <div ref={pageRef} className={`${s.page} ${tel ? s.pageTel : ''}`}>
      <FondCarte className={s.fond} surPrete={surPrete} mention={tel ? 'sous-filtres' : 'bas-gauche'}
        centre={CENTRE} zoom={12.6} surErreur={m => setErreur(m)} />

      {progres && (
        <div className={s.progres} role="status">
          <span className={s.progresRond} />
          {`Placement des adresses… ${progres.fait} / ${progres.total}`}
        </div>
      )}
      {message && (() => {
        const m = typeof message === 'string' ? { texte: message } as Exclude<Msg, string> : message;
        return (
          <div className={s.message} role="status" key={m.texte + (m.titre || '')}>
            <span className={s.messageIc}><Icone nom="info" taille={15} epaisseur={2.1} /></span>
            <span className={s.messageTxt}>
              {m.titre && <b>{m.titre}</b>}
              <span>{m.texte}</span>
            </span>
            <button type="button" className={s.messageFermer} onClick={() => setMessage(null)} aria-label="Fermer">×</button>
          </div>
        );
      })()}

      {!tel ? (
        <>
          {/* ── À gauche : les filtres ── */}
          {ouverts.filtres ? (
            <section className={`${s.panneau} ${s.panneauFiltres}`} aria-label="Filtres de la carte">
              <div className={s.tete}>
                <span className={s.teteIc}><Ic n="carte" t={18} /></span>
                <div className={s.teteTxt}>
                  <h1>Carte</h1>
                  <span>{charge ? 'Chargement…' : `${nbPlaces} adresse${nbPlaces > 1 ? 's' : ''} sur la carte`}</span>
                </div>
                {!charge && (
                  <button type="button" className={`${s.replier} ${voirSans ? s.replierOn : ''}`} aria-expanded={voirSans}
                    onClick={basculerInfo} aria-label="Qui est sur la carte" title="Qui est sur la carte ?">
                    <Icone nom="info" taille={16} epaisseur={2} />
                  </button>
                )}
                <button type="button" className={s.replier} onClick={() => basculerPanneau('filtres')} aria-label="Replier les filtres" title="Replier">
                  <Ic n="gauche" t={16} e={2.2} />
                </button>
              </div>
              {voirSans && !charge && <div className={s.infoPc}>{rappelAdresses}</div>}
              {charge ? (
                <div className={s.squelettes}>{[0, 1, 2, 3, 4].map(i => <span key={i} className="sq-barre" style={{ width: `${60 + (i * 17) % 40}%` }} />)}</div>
              ) : erreur ? <div className={s.erreur}>{erreur}</div> : (
                <>
                  {CATS_CONTACTS.some(c => nbCrm[c.k]) && <div className={s.section}>
                    <div className={s.sectionTete}><span>Contacts</span>
                      <button type="button" onClick={() => toutSection(CATS_CONTACTS, !CATS_CONTACTS.every(c => !nbCat[c.k] || actifs[c.k]))}>
                        {CATS_CONTACTS.every(c => !nbCat[c.k] || actifs[c.k]) ? 'Aucun' : 'Tous'}
                      </button>
                    </div>
                    <div className={s.puces}>{puces(CATS_CONTACTS)}</div>
                  </div>}
                  {CATS_BIENS.some(c => nbCrm[c.k]) && <div className={s.section}>
                    <div className={s.sectionTete}><span>Biens</span>
                      <button type="button" onClick={() => toutSection(CATS_BIENS, !CATS_BIENS.every(c => !nbCat[c.k] || actifs[c.k]))}>
                        {CATS_BIENS.every(c => !nbCat[c.k] || actifs[c.k]) ? 'Aucun' : 'Tous'}
                      </button>
                    </div>
                    <div className={s.puces}>{puces(CATS_BIENS)}</div>
                  </div>}
                  {!places.length && !progres && <p className={s.vide}>Aucune adresse à placer pour l’instant.</p>}
                </>
              )}
            </section>
          ) : (
            <button type="button" className={s.pastille} onClick={() => basculerPanneau('filtres')} aria-label="Ouvrir les filtres">
              <Ic n="carte" t={16} /><span>Filtres</span>
              <b>{TOUTES.filter(c => nbCat[c.k] && actifs[c.k]).length}</b>
            </button>
          )}

          {/* ── À droite : la zone affichée ── */}
          {ouverts.liste ? (
            <section className={`${s.panneau} ${s.panneauListe}`} aria-label="Dans cette zone">
              <div className={s.listeTete}>
                <h2>{q ? 'Résultats' : 'Dans cette zone'}<span>{liste.length}</span></h2>
                <button type="button" className={s.replier} onClick={() => basculerPanneau('liste')} aria-label="Replier la liste" title="Replier">
                  <Ic n="droite" t={16} e={2.2} />
                </button>
              </div>
              <label className={s.cherche}>
                <Ic n="loupe" t={15} />
                <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Un nom, une adresse, une ville…"
                  onKeyDown={e => { if (e.key === 'Enter' && q && !visibles.length) allerA(); }} />
                {recherche && <button type="button" onClick={() => setRecherche('')} aria-label="Effacer">×</button>}
              </label>
              <ul className={s.liste}>
                {liste.slice(0, 200).map(ligne)}
              </ul>
              {!liste.length && (
                <div className={s.listeVide}>
                  {q ? (recherche.trim().length >= 4
                    ? <button type="button" className={s.allerA} onClick={allerA} disabled={cherche}><Ic n="lieu" t={14} />{cherche ? 'Recherche…' : `Aller à « ${recherche.trim()} »`}</button>
                    : 'Personne ne correspond.')
                    : charge ? 'Chargement…' : 'Rien dans cette zone : déplace la carte ou dézoome.'}
                </div>
              )}
              <div className={s.listePied}><Ic n="lieu" t={13} />Déplace ou zoome : la liste suit la carte.</div>
            </section>
          ) : (
            <button type="button" className={s.onglet} onClick={() => basculerPanneau('liste')} aria-label="Ouvrir la liste de la zone">
              <Ic n="liste" t={16} /><b>{liste.length}</b>
            </button>
          )}

          {/* La carte de visite, accrochée à son repère. */}
          {pSel && (
            <div ref={fiche} className={s.fiche} key={pSel.id} role="dialog" aria-label={pSel.titre} style={positionFiche(pSel)}>
              <button type="button" className={s.ficheFermer} onClick={() => setSel(null)} aria-label="Fermer">×</button>
              {carteDeVisite(pSel)}
            </div>
          )}

          <div className={s.outils}>
            <button type="button" onClick={autourDeMoi} title="Autour de moi" aria-label="Autour de moi"><Ic n="boussole" t={17} /></button>
            <button type="button" onClick={toutVoir} title="Tout voir" aria-label="Tout voir"><Ic n="globe" t={17} /></button>
            <span />
            <button type="button" onClick={() => carte.current?.zoomIn()} aria-label="Zoomer"><Icone nom="plus" taille={17} epaisseur={2.1} /></button>
            <button type="button" onClick={() => carte.current?.zoomOut()} aria-label="Dézoomer"><Icone nom="moins" taille={17} epaisseur={2.1} /></button>
          </div>
        </>
      ) : (
        <>
          {/* ── Téléphone : en haut, la recherche et les filtres ── */}
          <div className={s.hautTel}>
            {/* La barre du haut du CRM est masquée ici : le menu s'ouvre d'ici. */}
            <div className={s.rangTel}>
              {onMenu && (
                <button type="button" className={s.menuTel} onClick={onMenu} aria-label="Ouvrir le menu">
                  <Icone nom="menu" taille={20} epaisseur={2} />
                </button>
              )}
              <label className={`${s.cherche} ${s.chercheTel}`}>
                <Ic n="loupe" t={15} />
                <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Un nom, une adresse…"
                  enterKeyHint="search" onKeyDown={e => { if (e.key === 'Enter' && q && !visibles.length) allerA(); }} />
                {recherche && <button type="button" onClick={() => setRecherche('')} aria-label="Effacer">×</button>}
              </label>
              {/* Qui est sur la carte, et qui n'y est pas : un appui (V3.28). */}
              <button type="button" className={`${s.infoTel} ${voirSans ? s.infoTelOn : ''}`} onClick={basculerInfo}
                aria-expanded={voirSans} aria-label="Qui est sur la carte">
                <Icone nom="info" taille={19} epaisseur={1.9} />
              </button>
            </div>
            {/* Deux boutons plutôt qu'une bande à faire défiler : chacun
                déplie ses filtres, rangés sur plusieurs lignes. */}
            <div className={s.groupesTel}>
              {([['contacts', 'Mes contacts', 'groupe', CATS_CONTACTS], ['biens', 'Mes biens', 'maison', CATS_BIENS]] as const)
                .filter(([, , , cats]) => cats.some(c => nbCrm[c.k]))
                .map(([k, lib, ico]) => {
                  const n = visibles.filter(p => (k === 'biens') === (p.genre === 'bien')).length;
                  return (
                    <button key={k} type="button" className={`${s.groupeTel} ${k === 'biens' ? s.groupeBiens : ''} ${pliTel === k ? s.groupeTelOn : ''}`}
                      aria-expanded={pliTel === k} onClick={() => { setVoirSans(false); setPliTel(x => (x === k ? null : k)); }}>
                      <span className={s.groupeIc}><Ic n={ico} t={17} e={2} /></span>
                      <span className={s.groupeLib}>{lib}<small>{`${n} sur la carte`}</small></span>
                      <span className={s.groupeCv}><Icone nom="chevron" taille={14} epaisseur={2.1} /></span>
                    </button>
                  );
                })}
            </div>
            {pliTel && (() => {
              const cats = pliTel === 'contacts' ? CATS_CONTACTS : CATS_BIENS;
              const tous = cats.every(c => !nbCat[c.k] || actifs[c.k]);
              return (
                <div className={s.pliTel} key={pliTel}>
                  <div className={s.sectionTete}>
                    <span>{pliTel === 'contacts' ? 'Quels contacts voir' : 'Quels biens voir'}</span>
                    <button type="button" onClick={() => toutSection(cats, !tous)}>{tous ? 'Aucun' : 'Tous'}</button>
                  </div>
                  <div className={s.puces}>{puces(cats)}</div>
                </div>
              );
            })()}
            {voirSans && <div className={s.sansTel}>{rappelAdresses}</div>}
          </div>

          <div className={s.outilsTel}>
            <button type="button" onClick={autourDeMoi} aria-label="Autour de moi"><Ic n="boussole" t={18} /></button>
            <button type="button" onClick={toutVoir} aria-label="Tout voir"><Ic n="globe" t={18} /></button>
          </div>

          {/* ── En bas : les fiches de la zone, qu'on fait glisser ── */}
          <div className={s.basTel}>
            {liste.length ? (
              <div className={s.carrousel} ref={carrousel} onScroll={surGlisse}>
                {/* Des fiches d'une ligne (V3.28) : qui ou quoi, son étiquette et
                    sa rue ; à droite, appeler (ou l'itinéraire) et la fiche. La
                    carte garde presque tout l'écran. */}
                {liste.slice(0, 60).map(p => (
                  <div key={p.id} data-id={p.id} className={`${s.carteTel} ${sel === p.id ? s.carteTelSel : ''}`}
                    style={{ '--c': p.couleur } as React.CSSProperties}
                    onClick={() => { if (sel !== p.id) choisir(p.id, { voler: true }); }}>
                    {p.genre === 'bien'
                      ? <span className={s.telVign} style={p.photo ? { backgroundImage: `url(${p.photo})` } : undefined}>{!p.photo && <Ic n="maison" t={17} e={2.1} />}</span>
                      : p.perso
                        ? <span className={`${s.telVign} ${s.telVignCle}`}><Ic n="cle" t={16} e={2.1} /></span>
                        : <AvatarContact c={(p.client || {}) as never} teinte={p.teinte || { bg: p.fond, fg: p.couleur }} taille={40} />}
                    <span className={s.telTxt}>
                      <b>{p.titre}</b>
                      <span><i>{p.genre === 'bien' && p.prix ? EUR(p.prix) : p.etiquette}</i>{` · ${rue(p.adresse)}`}</span>
                    </span>
                    <span className={s.telAct}>
                      {p.tel
                        ? <a href={`tel:${p.tel.replace(/\s/g, '')}`} aria-label={`Appeler ${p.titre}`} onClick={e => e.stopPropagation()}><Icone nom="tel" taille={16} epaisseur={1.9} /></a>
                        : <a href={lienItineraire(p.lat, p.lng)} target="_blank" rel="noopener noreferrer" aria-label="Itinéraire" onClick={e => e.stopPropagation()}><Icone nom="envoyer" taille={16} epaisseur={1.9} /></a>}
                      <button type="button" className={s.telFiche} aria-label={`Ouvrir la fiche de ${p.titre}`}
                        onClick={e => { e.stopPropagation(); ouvrirFiche(p); }}><Ic n="droite" t={17} e={2.3} /></button>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={s.videTel}>{charge ? 'Chargement…' : q
                ? (recherche.trim().length >= 4 ? <button type="button" className={s.allerA} onClick={allerA} disabled={cherche}><Ic n="lieu" t={14} />{cherche ? 'Recherche…' : `Aller à « ${recherche.trim()} »`}</button> : 'Personne ne correspond.')
                : 'Rien dans cette zone : déplace la carte.'}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
