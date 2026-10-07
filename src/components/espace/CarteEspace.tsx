'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as CarteML, Marker, GeoJSONSource } from 'maplibre-gl';
import FondCarte, { type MapLibre } from '@/components/carte/FondCarte';
import { cercle, lienItineraire, CENTRE } from '@/lib/carte';
import s from './CarteEspace.module.css';

/* ═══ Les biens sur la carte, dans l'espace acheteur (V3.27) ═══════════════
   Chaque bien est une petite zone de deux ou trois rues, à la couleur de son
   avis, avec son prix : l'adresse exacte n'arrive qu'avec la visite calée
   (voir /api/espace/carte, qui fabrique les zones sur le serveur).

   Téléphone : un bandeau bleu Emilio d'une ligne, les filtres par avis, la
   carte en entier, et en bas les biens de la zone qu'on fait glisser. La
   carte suit la fiche qu'on fait glisser ; la bande suit la carte qu'on
   déplace ou qu'on zoome.
   Ordinateur : la carte, et à côté la liste des biens de la zone. */

export type CatEspace = 'interesse' | 'visite' | 'a_visiter' | 'attente' | 'refuse';
export type BienCarte = {
  id: string; titre: string; prix: number | null; photo: string | null;
  surface: number | null; pieces: number | null; lieu: string;
  cat: CatEspace;
  /* Ce que dit la pastille : « Ça me plaît », « Nouveau », « Visite jeu. 10 h »… */
  etiquette: string;
};
/* Les mêmes mots que « Consultés » ; les couleurs de ses cadres. */
export const CATS_ESPACE: { id: CatEspace; lib: string; c: string }[] = [
  { id: 'interesse', lib: 'Ça me plaît', c: '#16a34a' },
  { id: 'visite', lib: 'Visités', c: '#22497D' },
  { id: 'a_visiter', lib: 'À visiter', c: '#7c3aed' },
  { id: 'attente', lib: 'En attente', c: '#E68B23' },
  { id: 'refuse', lib: 'Pas pour moi', c: '#b3837e' },
];
const COULEUR = Object.fromEntries(CATS_ESPACE.map(c => [c.id, c.c])) as Record<CatEspace, string>;

type Zone = { id: string; lng: number; lat: number; r: number; niveau: string; exact?: boolean };
type Place = BienCarte & { z: Zone };

const EUR = (n?: number | null) => (n == null ? '' : n.toLocaleString('fr-FR').replace(/[  ]/g, ' ') + ' €');
/* Le prix court des étiquettes (V3.28) : « 995 k€ », « 1,25 M€ ». Plus de
   place sur la carte ; le prix entier est sur la fiche, en bas. */
const PRIX_COURT = (n?: number | null) => {
  if (!n) return '';
  if (n >= 1e6) return `${(Math.round(n / 1e4) / 100).toLocaleString('fr-FR')} M€`;
  if (n >= 1e3) return `${(Math.round(n / 100) / 10).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} k€`;
  return EUR(n);
};
const CLE_VU = 'emilio_carte_vu';
/* Sous ce zoom, les étiquettes de prix se replient en simples points. */
const ZOOM_PRIX = 12.9;

export default function CarteEspace({ token, biens, focus, ville, onOuvrir, onListe, titre = 'Vos biens', sansFiltres = false, vide }: {
  token: string;
  biens: BienCarte[];
  /* « Vos biens » (tout) ou « Vos nouveautés » (V3.28). */
  titre?: string;
  /* Les nouveautés n'ont qu'une couleur (elles attendent un avis) : pas de filtres. */
  sansFiltres?: boolean;
  /* Ce qu'on dit quand il ne reste plus rien à montrer. */
  vide?: string;
  /* Le bien d'où l'on vient (« Voir sur la carte » sur sa fiche). */
  focus: string | null;
  ville: string;
  onOuvrir: (id: string) => void;
  onListe: () => void;
}) {
  const [tel, setTel] = useState(false);
  const [zones, setZones] = useState<Map<string, Zone> | null>(null);
  const [sans, setSans] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<'tout' | CatEspace>('tout');
  const [sel, setSel] = useState<string | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [dansVue, setDansVue] = useState<string[]>([]);
  const [cartePrete, setCartePrete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /* Le bandeau « N biens ne sont pas sur la carte », fermé par le client. */
  const [horsFerme, setHorsFerme] = useState(false);

  const carte = useRef<CarteML | null>(null);
  const ml = useRef<MapLibre | null>(null);
  const reperes = useRef(new Map<string, Marker>());
  const racine = useRef<HTMLDivElement>(null);
  const bande = useRef<HTMLDivElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const cadre = useRef(false);
  const parBande = useRef(false);
  /* Les repères qui s'en vont (un filtre les écarte) : ils brillent, tremblent
     et s'éteignent avant d'être retirés (V3.28). id → minuterie. */
  const sortants = useRef(new Map<string, number>());
  const avant = useRef<Place[]>([]);
  const minuteriesZones = useRef<number[]>([]);

  /* ── Les zones, fabriquées par le serveur ── */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const maj = () => setTel(mq.matches);
    maj();
    mq.addEventListener('change', maj);
    return () => mq.removeEventListener('change', maj);
  }, []);
  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`/api/espace/carte?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        const j = await r.json();
        if (!vivant) return;
        if (!r.ok || !j?.ok) { setErreur('La carte ne répond pas pour l’instant. Réessayez dans un moment.'); setZones(new Map()); return; }
        setZones(new Map((j.zones as Zone[]).map(z => [z.id, z])));
        setSans(j.sans || []);
      } catch {
        if (vivant) { setErreur('La carte ne répond pas pour l’instant. Réessayez dans un moment.'); setZones(new Map()); }
      }
    })();
    return () => { vivant = false; };
  }, [token]);

  /* Une fois, la première fois : ce que sont ces cercles. */
  useEffect(() => {
    try {
      if (localStorage.getItem(CLE_VU)) return;
      localStorage.setItem(CLE_VU, '1');
    } catch { /* stockage refusé : on le dit quand même */ }
    setMessage('Chaque bien est dans une petite zone de quelques rues : l’adresse exacte vous est donnée avec la visite.');
  }, []);
  useEffect(() => { if (!message) return; const t = setTimeout(() => setMessage(null), 7000); return () => clearTimeout(t); }, [message]);

  const places = useMemo<Place[]>(() => {
    if (!zones) return [];
    const l: Place[] = [];
    for (const b of biens) { const z = zones.get(b.id); if (z) l.push({ ...b, z }); }
    return l;
  }, [biens, zones]);
  const parId = useMemo(() => new Map(places.map(p => [p.id, p])), [places]);
  const visibles = useMemo(() => places.filter(p => filtre === 'tout' || p.cat === filtre), [places, filtre]);
  const nb = useMemo(() => {
    const n: Record<string, number> = {};
    for (const p of places) n[p.cat] = (n[p.cat] || 0) + 1;
    return n;
  }, [places]);
  /* Les biens sans zone (secteur trop imprécis), selon le filtre choisi :
     le bandeau du haut de la carte les compte (V3.28). */
  const horsCarte = useMemo(() => biens.filter(b => sans.includes(b.id) && (filtre === 'tout' || b.cat === filtre)), [biens, sans, filtre]);

  /* Les refs que lisent les écouteurs de la carte. */
  const visiblesRef = useRef(visibles); visiblesRef.current = visibles;
  const parIdRef = useRef(parId); parIdRef.current = parId;
  const telRef = useRef(tel); telRef.current = tel;
  const selRef = useRef(sel); selRef.current = sel;

  /* Téléphone : le centre utile est entre le bandeau et la bande des fiches. */
  const decalage = (): [number, number] => (telRef.current ? [0, -52] : [0, 0]);

  const calculerVue = useCallback(() => {
    const m = carte.current;
    if (!m) return;
    const b = m.getBounds();
    const l = visiblesRef.current.filter(p => b.contains([p.z.lng, p.z.lat]));
    /* D'ouest en est : faire glisser vers la gauche, c'est aller vers l'est. */
    l.sort((a, z) => a.z.lng - z.z.lng);
    setDansVue(l.map(p => p.id));
  }, []);

  const choisir = useCallback((id: string | null, voler = false) => {
    setSel(id);
    const m = carte.current;
    const p = id ? parIdRef.current.get(id) : null;
    if (!m || !p || !voler) return;
    m.flyTo({ center: [p.z.lng, p.z.lat], zoom: Math.max(m.getZoom(), p.z.exact ? 15.8 : 14.8), duration: 900, essential: true, offset: decalage() });
  }, []);

  const surPrete = useCallback((m: CarteML, lib: MapLibre) => {
    carte.current = m;
    ml.current = lib;
    m.addSource('zones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({
      id: 'zones-f', type: 'fill', source: 'zones',
      paint: { 'fill-color': ['get', 'c'], 'fill-opacity': ['case', ['==', ['get', 'sel'], 1], 0.34, ['==', ['get', 'survol'], 1], 0.28, 0.17] },
    });
    m.addLayer({
      id: 'zones-l', type: 'line', source: 'zones',
      paint: { 'line-color': ['get', 'c'], 'line-width': ['case', ['==', ['get', 'sel'], 1], 2.4, 1.5], 'line-opacity': 0.8 },
    });
    /* Les zones qui s'en vont : une lueur à leur couleur, qui scintille puis
       s'éteint (l'opacité de la couche s'anime, pas celle de chaque zone). */
    m.addSource('zones-sortie', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({ id: 'zones-sortie-f', type: 'fill', source: 'zones-sortie', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0 } });
    m.addLayer({ id: 'zones-sortie-l', type: 'line', source: 'zones-sortie', paint: { 'line-color': ['get', 'c'], 'line-width': 4, 'line-blur': 2.5, 'line-opacity': 0 } });
    const zoom = () => racine.current?.classList.toggle(s.loin, m.getZoom() < ZOOM_PRIX);
    zoom();
    m.on('zoom', zoom);
    m.on('moveend', () => {
      if (parBande.current) { parBande.current = false; return; }
      calculerVue();
    });
    /* Toucher la zone choisit le bien, comme toucher son prix (V3.28). Quand
       des zones se chevauchent, celle dont le centre est le plus près. */
    m.on('click', e => {
      let id: string | null = null, dmin = Infinity;
      for (const f of m.queryRenderedFeatures(e.point, { layers: ['zones-f'] })) {
        const p = parIdRef.current.get(String(f.properties?.id));
        if (!p) continue;
        const q = m.project([p.z.lng, p.z.lat]);
        const d = (q.x - e.point.x) ** 2 + (q.y - e.point.y) ** 2;
        if (d < dmin) { dmin = d; id = p.id; }
      }
      if (id) choisir(id, true); else setSel(null);
    });
    m.on('mousemove', 'zones-f', e => {
      m.getCanvas().style.cursor = 'pointer';
      const id = e.features?.[0]?.properties?.id;
      if (id) setSurvol(String(id));
    });
    m.on('mouseleave', 'zones-f', () => { m.getCanvas().style.cursor = ''; setSurvol(null); });
    setCartePrete(true);
    return () => {
      for (const t of sortants.current.values()) window.clearTimeout(t);
      sortants.current.clear();
      for (const t of minuteriesZones.current) window.clearTimeout(t);
      for (const r of reperes.current.values()) r.remove();
      reperes.current.clear(); carte.current = null;
    };
  }, [calculerVue, choisir]);

  /* Les zones et leurs étiquettes suivent le filtre, le choix et le survol. */
  useEffect(() => {
    const m = carte.current, lib = ml.current;
    const src = m?.getSource('zones') as GeoJSONSource | undefined;
    if (!m || !lib || !src) return;
    src.setData({
      type: 'FeatureCollection',
      features: visibles.filter(p => !p.z.exact).map(p => ({
        type: 'Feature',
        properties: { id: p.id, c: COULEUR[p.cat], sel: p.id === sel ? 1 : 0, survol: p.id === survol ? 1 : 0 },
        geometry: { type: 'Polygon', coordinates: [cercle(p.z.lng, p.z.lat, p.z.r)] },
      })),
    });
    const vus = new Set(visibles.map(p => p.id));
    /* Un filtre écarte des biens : leur étiquette s'illumine, tremble, lance
       quelques étincelles et s'éteint, puis on la retire (V3.28). */
    for (const [id, r] of reperes.current) {
      if (vus.has(id) || sortants.current.has(id)) continue;
      const el = r.getElement();
      el.classList.remove(s.envSel, s.envSurvol);
      el.classList.add(s.sort);
      const c = parIdRef.current.get(id);
      const et = document.createElement('span');
      et.className = s.etinc;
      if (c) et.style.setProperty('--c', COULEUR[c.cat]);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        const d = 24 + (i % 3) * 7;
        const pt = document.createElement('i');
        if (i % 2) pt.className = s.etoile;
        pt.style.setProperty('--dx', `${Math.round(Math.cos(a) * d)}px`);
        pt.style.setProperty('--dy', `${Math.round(Math.sin(a) * d)}px`);
        pt.style.animationDelay = `${160 + (i % 4) * 40}ms`;
        et.append(pt);
      }
      el.append(et);
      sortants.current.set(id, window.setTimeout(() => {
        r.remove(); reperes.current.delete(id); sortants.current.delete(id);
      }, 1000));
    }
    /* Les zones de ces biens : une lueur qui scintille deux fois, puis s'éteint. */
    const partants = avant.current.filter(p => !vus.has(p.id) && !p.z.exact);
    avant.current = visibles;
    const srcSortie = m.getSource('zones-sortie') as GeoJSONSource | undefined;
    if (partants.length && srcSortie && m.getLayer('zones-sortie-f')) {
      for (const t of minuteriesZones.current) window.clearTimeout(t);
      srcSortie.setData({
        type: 'FeatureCollection',
        features: partants.map(p => ({ type: 'Feature', properties: { c: COULEUR[p.cat] }, geometry: { type: 'Polygon', coordinates: [cercle(p.z.lng, p.z.lat, p.z.r)] } })),
      });
      const lueur = (f: number, l: number, ms: number) => {
        if (!carte.current?.getLayer('zones-sortie-f')) return;
        m.setPaintProperty('zones-sortie-f', 'fill-opacity-transition', { duration: ms, delay: 0 });
        m.setPaintProperty('zones-sortie-l', 'line-opacity-transition', { duration: ms, delay: 0 });
        m.setPaintProperty('zones-sortie-f', 'fill-opacity', f);
        m.setPaintProperty('zones-sortie-l', 'line-opacity', l);
      };
      const etapes: [number, number, number, number][] = [[0, 0.42, 1, 0], [170, 0.16, 0.5, 150], [330, 0.4, 1, 150], [490, 0.14, 0.45, 150], [650, 0, 0, 380]];
      minuteriesZones.current = etapes.map(([t, f, l, ms]) => window.setTimeout(() => lueur(f, l, ms), t));
      minuteriesZones.current.push(window.setTimeout(() => {
        (carte.current?.getSource('zones-sortie') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
      }, 1100));
    }
    for (const p of visibles) {
      let r = reperes.current.get(p.id);
      /* Revenu avant la fin de sa sortie (filtre changé vite) : on le garde. */
      const t = sortants.current.get(p.id);
      if (r && t !== undefined) {
        window.clearTimeout(t);
        sortants.current.delete(p.id);
        const el = r.getElement();
        el.classList.remove(s.sort);
        el.querySelector(`.${s.etinc}`)?.remove();
      }
      if (!r) {
        const env = document.createElement('div');
        env.className = s.env;
        env.dataset.id = p.id;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `${s.pastille} ${p.z.exact ? s.pastilleVisite : ''}`;
        b.style.setProperty('--c', COULEUR[p.cat]);
        b.setAttribute('aria-label', `${p.titre}${p.prix ? `, ${EUR(p.prix)}` : ''}`);
        const pt = document.createElement('i');
        const t = document.createElement('b');
        t.textContent = p.z.exact ? p.etiquette : (PRIX_COURT(p.prix) || p.titre);
        b.append(pt, t);
        env.append(b);
        if (p.z.exact) { const d = document.createElement('span'); d.className = s.point; env.append(d); }
        b.addEventListener('click', ev => { ev.stopPropagation(); choisir(p.id, true); });
        b.addEventListener('mouseenter', () => setSurvol(p.id));
        b.addEventListener('mouseleave', () => setSurvol(x => (x === p.id ? null : x)));
        /* Le prix se pose au milieu de sa zone (V3.28 : au bord haut, on
           touchait la zone et rien ne s'ouvrait) ; celui d'une visite, sur
           le point exact. */
        r = new lib.Marker({ element: env, anchor: p.z.exact ? 'bottom' : 'center' }).setLngLat([p.z.lng, p.z.lat]).addTo(m);
        reperes.current.set(p.id, r);
      }
      const env = r.getElement();
      env.classList.toggle(s.envSel, p.id === sel);
      env.classList.toggle(s.envSurvol, p.id === survol && p.id !== sel);
    }
  }, [visibles, sel, survol, cartePrete, choisir]);

  /* Le premier cadrage : le bien d'où l'on vient, sinon tous les biens. */
  useEffect(() => {
    const m = carte.current, lib = ml.current;
    if (!m || !lib || !zones || cadre.current) return;
    cadre.current = true;
    const p = focus ? parId.get(focus) : null;
    if (p) {
      m.jumpTo({ center: [p.z.lng, p.z.lat], zoom: 12.4 });
      setTimeout(() => {
        m.flyTo({ center: [p.z.lng, p.z.lat], zoom: p.z.exact ? 15.8 : 15, duration: 1400, essential: true, offset: decalage() });
        m.once('moveend', () => setSel(p.id));
      }, 200);
      return;
    }
    if (focus && sans.includes(focus)) setMessage('Ce bien n’a pas encore d’adresse assez précise pour la carte. Les autres y sont.');
    if (!places.length) { calculerVue(); return; }
    const b = new lib.LngLatBounds();
    for (const x of places) b.extend([x.z.lng, x.z.lat]);
    m.fitBounds(b, { padding: tel ? { top: 56, bottom: 200, left: 56, right: 56 } : { top: 96, bottom: 60, left: 70, right: 70 }, maxZoom: 15, duration: 0 });
    calculerVue();
  }, [cartePrete, zones, places, parId, focus, sans, tel, calculerVue]);

  /* Un filtre change : la liste de la zone suit. */
  useEffect(() => { calculerVue(); }, [visibles, calculerVue]);
  /* Un bien choisi qui sort du filtre n'est plus choisi. */
  useEffect(() => { if (sel && !visibles.some(p => p.id === sel)) setSel(null); }, [visibles, sel]);

  /* Le bien choisi vient au milieu de la bande (téléphone) ou en vue dans
     la liste (ordinateur). */
  useEffect(() => {
    if (!sel) return;
    const boite = tel ? bande.current : liste.current;
    const el = boite?.querySelector<HTMLElement>(`[data-id="${CSS.escape(sel)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [sel, tel, dansVue]);

  /* Téléphone : on fait glisser les fiches, la carte suit. */
  const finGlisse = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surGlisse = () => {
    if (finGlisse.current) clearTimeout(finGlisse.current);
    finGlisse.current = setTimeout(() => {
      const c = bande.current, m = carte.current;
      if (!c || !m) return;
      const milieu = c.scrollLeft + c.clientWidth / 2;
      let meilleur: HTMLElement | null = null, d = Infinity;
      for (const el of Array.from(c.querySelectorAll<HTMLElement>('[data-id]'))) {
        const x = el.offsetLeft + el.offsetWidth / 2;
        if (Math.abs(x - milieu) < d) { d = Math.abs(x - milieu); meilleur = el; }
      }
      const id = meilleur?.dataset.id;
      if (!id || id === selRef.current) return;
      const p = parIdRef.current.get(id);
      setSel(id);
      if (p) { parBande.current = true; m.easeTo({ center: [p.z.lng, p.z.lat], duration: 700, offset: decalage() }); }
    }, 130);
  };

  const toutVoir = () => {
    const m = carte.current, lib = ml.current;
    if (!m || !lib || !visibles.length) return;
    const b = new lib.LngLatBounds();
    for (const p of visibles) b.extend([p.z.lng, p.z.lat]);
    m.fitBounds(b, { padding: tel ? { top: 56, bottom: 200, left: 56, right: 56 } : { top: 96, bottom: 60, left: 70, right: 70 }, maxZoom: 15, duration: 900 });
  };

  const vue = dansVue.map(id => parId.get(id)).filter((p): p is Place => !!p);
  const charge = zones === null;

  /* ── Les morceaux ── */
  const bascule = (
    <div className={s.bascule} role="group" aria-label="Affichage">
      <button type="button" onClick={onListe}><Pic d={LISTE} />Liste</button>
      <button type="button" className={s.basculeOn} aria-pressed="true"><Pic d={CARTE} />Carte</button>
    </div>
  );
  const puces = (
    <div className={s.puces}>
      <button type="button" className={`${s.puce} ${filtre === 'tout' ? s.puceOn : ''}`} onClick={() => setFiltre('tout')}>
        Tous<b>{places.length}</b>
      </button>
      {CATS_ESPACE.filter(c => nb[c.id]).map(c => (
        <button key={c.id} type="button" className={`${s.puce} ${filtre === c.id ? s.puceOn : ''}`}
          style={{ '--c': c.c } as React.CSSProperties} onClick={() => setFiltre(f => (f === c.id ? 'tout' : c.id))}>
          <i />{c.lib}<b>{nb[c.id]}</b>
        </button>
      ))}
    </div>
  );
  /* Ordinateur (V3.28) : les filtres posés sur la carte, en une seule barre
     où un trait fin sépare chaque choix ; le choix actif prend la couleur de
     sa catégorie (« Tous », le bleu de l'espace). */
  const filtresPc = (
    <div className={s.filtresPc} role="group" aria-label="Filtrer les biens">
      <button type="button" className={`${s.fp} ${filtre === 'tout' ? s.fpOn : ''}`} aria-pressed={filtre === 'tout'}
        onClick={() => setFiltre('tout')}>
        Tous<b>{places.length}</b>
      </button>
      {CATS_ESPACE.filter(c => nb[c.id]).map(c => (
        <button key={c.id} type="button" className={`${s.fp} ${filtre === c.id ? s.fpOn : ''}`} aria-pressed={filtre === c.id}
          style={{ '--c': c.c } as React.CSSProperties} onClick={() => setFiltre(f => (f === c.id ? 'tout' : c.id))}>
          <i />{c.lib}<b>{nb[c.id]}</b>
        </button>
      ))}
    </div>
  );
  const carteBien = (p: Place, compacte: boolean) => {
    const choisi = sel === p.id;
    return (
      <div key={p.id} data-id={p.id} role="button" tabIndex={0}
        className={`${compacte ? s.fb : s.fl} ${choisi ? s.choisi : ''}`}
        style={{ '--c': COULEUR[p.cat] } as React.CSSProperties}
        onClick={() => (choisi ? onOuvrir(p.id) : choisir(p.id, true))}
        onKeyDown={e => { if (e.key === 'Enter') (choisi ? onOuvrir(p.id) : choisir(p.id, true)); }}
        onMouseEnter={() => setSurvol(p.id)} onMouseLeave={() => setSurvol(null)}>
        <div className={s.photo} style={p.photo ? { backgroundImage: `url(${p.photo})` } : undefined}>
          {!p.photo && <Pic d={PHOTO} t={20} />}
        </div>
        <div className={s.corps}>
          <span className={s.etiq}><i />{p.etiquette}</span>
          <b className={s.titre}>{p.titre}</b>
          <span className={s.prixL}>
            {p.prix ? <b>{EUR(p.prix)}</b> : null}
            {!compacte && <span>{p.lieu}</span>}
          </span>
          {/* Sur téléphone, le bouton est toujours là : la carte ne change pas
              de hauteur quand on la choisit. */}
          {(choisi || compacte) && (
            <span className={s.actions}>
              <button type="button" className={s.voir} onClick={e => { e.stopPropagation(); onOuvrir(p.id); }}>Voir le bien</button>
              {p.z.exact && (
                <a className={s.itin} href={lienItineraire(p.z.lat, p.z.lng)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>Itinéraire</a>
              )}
            </span>
          )}
        </div>
      </div>
    );
  };
  /* Posé en haut de la carte, juste sous les filtres (V3.28). Avant, une
     petite ligne sous la liste de l'ordinateur, trop discrète, et rien du
     tout au téléphone. Jamais un emplacement au hasard : le client le
     prendrait pour le vrai. */
  const nbHors = horsCarte.length;
  const alerteHors = nbHors > 0 && places.length > 0 && !horsFerme && !charge ? (
    <div className={s.hors} role="note">
      <span className={s.horsIc}><Pic d={ATTENTION} t={15} /></span>
      <div className={s.horsTxt}>
        <b>{nbHors === 1 ? '1 bien n’est pas sur la carte' : `${nbHors} biens ne sont pas sur la carte`}</b>
        <span>
          {nbHors === 1 ? 'Son secteur n’est pas encore assez précis pour le placer.' : 'Leur secteur n’est pas encore assez précis pour les placer.'}
          {' '}
          <button type="button" onClick={() => (nbHors === 1 ? onOuvrir(horsCarte[0].id) : onListe())}>
            {nbHors === 1 ? 'Voir le bien' : 'Les voir dans la liste'}
          </button>
        </span>
      </div>
      <button type="button" className={s.horsFermer} onClick={() => setHorsFerme(true)} aria-label="Fermer">×</button>
    </div>
  ) : null;
  const rienIci = (
    <div className={s.rien}>
      {charge ? 'Placement de vos biens…' : places.length ? 'Aucun bien dans cette partie de la carte.'
        : !biens.length && vide ? vide : 'Vos biens n’ont pas encore d’adresse assez précise pour la carte.'}
      {!charge && visibles.length > 0 && <button type="button" onClick={toutVoir}>Tout voir</button>}
    </div>
  );

  return (
    <div ref={racine} className={`${s.racine} ${tel ? s.tel : s.pc}`}>
      {tel ? (
        <div className={s.bandeau}>
          <div className={s.ligne1}>
            {/* Le titre en petit, à côté de la ville : une ligne de gagnée pour la carte. */}
            <span className={s.titreT}><b>{titre}</b>{ville && <span>{` · ${ville}`}</span>}</span>
            {bascule}
          </div>
          {!sansFiltres && puces}
        </div>
      ) : (
        <div className={s.tetePc}>
          <div>
            <h2>{`${titre} sur la carte`}</h2>
            <p>{ville ? `${ville} · ` : ''}chaque bien dans une petite zone&nbsp;; l’adresse exacte vient avec la visite.</p>
          </div>
          {bascule}
        </div>
      )}

      <div className={s.corpsCarte}>
        <div className={`${s.cadre} ${!tel && !sansFiltres ? s.avecFiltres : ''}`}>
          {!tel && !sansFiltres && filtresPc}
          <FondCarte className={s.fond} surPrete={surPrete} centre={CENTRE} zoom={12.6}
            mention={tel ? 'haut-droite' : 'bas-gauche'} surErreur={m => setErreur(m)} />
          {charge && <div className={s.charge} role="status"><span />Placement de vos biens…</div>}
          {message && (
            <div className={s.message} role="status">
              <span>{message}</span>
              <button type="button" onClick={() => setMessage(null)} aria-label="Fermer">×</button>
            </div>
          )}
          {erreur && !message && <div className={s.message} role="alert"><span>{erreur}</span></div>}
          <div className={s.outils}>
            <button type="button" onClick={toutVoir} aria-label="Voir tous les biens" title="Tout voir"><Pic d={CADRE} t={18} /></button>
            {!tel && <>
              <button type="button" onClick={() => carte.current?.zoomIn()} aria-label="Zoomer"><Pic d={PLUS} t={18} /></button>
              <button type="button" onClick={() => carte.current?.zoomOut()} aria-label="Dézoomer"><Pic d={MOINS} t={18} /></button>
            </>}
          </div>
          {/* En haut de la carte, juste sous les filtres ; pas en même temps
              que le message, qui prend la même place. */}
          {!message && !erreur && alerteHors}
          {tel && (
            <div className={s.bas}>
              {vue.length ? (
                <div className={s.bande} ref={bande} onScroll={surGlisse}>
                  {vue.slice(0, 40).map(p => carteBien(p, true))}
                </div>
              ) : rienIci}
            </div>
          )}
        </div>

        {!tel && (
          <aside className={s.cote} aria-label="Les biens de cette zone">
            <div className={s.coteTete}>
              <b>Dans cette zone</b><span>{vue.length}</span>
              <button type="button" onClick={toutVoir}>Tout voir</button>
            </div>
            <div className={s.coteListe} ref={liste}>
              {vue.length ? vue.map(p => carteBien(p, false)) : rienIci}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/* Les pictos de la carte, au trait comme ceux de l'espace. */
const LISTE = ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'];
const CARTE = ['M3 6l6-2.5 6 2.5 6-2.5v14.5l-6 2.5-6-2.5-6 2.5z', 'M9 3.5v14.5', 'M15 6v14.5'];
const CADRE = ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'];
const PLUS = ['M12 5v14', 'M5 12h14'];
const MOINS = ['M5 12h14'];
const ATTENTION = ['M12 4l8.5 15h-17z', 'M12 10v4', 'M12 16.8h.01'];
const PHOTO = ['M3.5 7.5h3l1.6-2.2h7.8l1.6 2.2h3v11h-17z', 'M12 16.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z'];
function Pic({ d, t = 15 }: { d: string[]; t?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block', flex: '0 0 auto' }}>
      {d.map((x, i) => <path key={i} d={x} />)}
    </svg>
  );
}
