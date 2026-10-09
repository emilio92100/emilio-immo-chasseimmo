/* ═══ LE MOUVEMENT DU CRM (V3.152) — style « C · Depuis le bouton » ══════════

   Ce qu'Alexandre a choisi sur la maquette des quatre styles : chaque fenêtre,
   pop-up ou menu SORT DU BOUTON qu'on vient de toucher, et Y RETOURNE quand on
   la ferme (×, clic à côté, Échap, validation). Les onglets font tomber leur
   contenu en cascade ; les écrans arrivent en fondu. Rien de brutal.

   ── Pourquoi un mécanisme global ──
   Le CRM compte une quarantaine de fenêtres écrites de dix façons différentes
   (portails ou non, voile et fenêtre imbriqués ou côte à côte, feuilles plein
   écran au téléphone…). Les reprendre une par une aurait été long et fragile.
   Ce fichier les reconnaît toutes au moment où elles apparaissent, sans
   qu'aucune n'ait à le demander :

   1. L'ORIGINE. Un écouteur (phase de capture) retient le dernier élément
      touché ou cliqué — le bouton, pas le texte dedans — et le centre de son
      rectangle. C'est de là que la fenêtre sortira.

   2. L'ENTRÉE. Un MutationObserver sur <body> regarde les nœuds ajoutés
      (la racine de chaque arbre ajouté et ses enfants sur deux niveaux, pas
      plus : une page entière qui arrive n'est pas une fenêtre). Au début de
      l'image suivante (requestAnimationFrame, avant qu'elle soit peinte) :
      · un élément `position: fixed` qui couvre au moins 85 % de l'écran est
        un VOILE. Translucide, il s'allume en fondu (260 ms) et sa fenêtre — le
        plus grand enfant qui ne couvre pas l'écran, ou à défaut un frère
        ajouté en même temps — grandit depuis le bouton : `scale` .12 → 1,
        opaque dès 35 %, 430 ms, cubic-bezier(.2,.85,.25,1). Opaque (éditeur,
        visionneuse, feuille du téléphone), c'est lui qui grandit. Transparent
        et sans fenêtre dedans, c'est un attrape-clic : on n'y touche pas ;
      · un petit élément posé (absolute ou fixed), avec une ombre ou un rôle
        menu / listbox / dialog, apparu moins de 600 ms après un appui et à
        côté du bouton, est un MENU : il pousse depuis le bouton, de .7 à 1,
        en 260 ms.
      On anime les propriétés `scale` et `opacity` (pas `transform`) : les
      composants qui centrent ou placent leur fenêtre avec `transform` ne sont
      pas dérangés. Le point d'origine (`transform-origin`) est le centre du
      bouton exprimé dans le repère de la fenêtre, translation comprise. Les
      animations CSS d'entrée propres aux composants sont menées à leur fin
      d'un coup (finish) : une seule entrée, la même partout.

   3. LA SORTIE, sans toucher aux composants. React retire une fenêtre par
      `parent.removeChild(nœud)`. `Node.prototype.removeChild` (et
      `Element.prototype.remove`) sont enveloppés une fois pour toutes : si le
      nœud retiré est un voile ou un menu reconnu à l'entrée — ou une
      enveloppe vide qui en contient un —, il reste en place le temps de sa
      sortie, inerte (`inert`, `pointer-events: none` : les clics passent à
      ce qui est dessous), le focus rendu ; il rentre dans le bouton (s'il
      est encore à l'écran, sinon vers le point retenu, sinon vers le centre)
      — 340 ms, cubic-bezier(.55,0,.7,.3), opaque jusqu'à 55 % ; le voile
      s'éteint en 320 ms —, puis il est vraiment retiré. React n'en sait rien
      et n'en souffre pas : il ne réutilise jamais un nœud qu'il a supprimé.
      Un gros arbre (une page entière qui contiendrait une fenêtre) part tout
      de suite, sans attendre.
      Une fenêtre remplacée par la même à la même place (un composant qui
      remonte sa fenêtre en cours de route) est échangée sans animation.

   4. LES ONGLETS. `<Cascade cle={onglet}>` (src/components/shared/
      Cascade.tsx) : quand la clé change, l'ancien contenu s'efface en
      130 ms, posé par-dessus, puis les blocs du nouveau tombent de 12 px, un
      par un (75 ms d'écart, 340 ms, cubic-bezier(.16,1,.3,1)) — seulement
      ceux qui sont à l'écran. Rien n'attend : le nouveau contenu est
      utilisable tout de suite.

   ── Se retirer du mouvement ──
   `data-emi-anim="non"` sur un élément l'exclut, lui et tout ce qu'il
   contient : ni entrée, ni sortie retardée. À poser sur ce qui anime déjà sa
   propre sortie (la pile « Le mail est-il arrivé ? », SuiviRemises.tsx) ou
   qui ne doit jamais attendre (la carte et ses repères, FondCarte.tsx).
   `prefers-reduced-motion: reduce` coupe tout. Un navigateur sans
   `element.animate` ou sans la propriété CSS `scale` garde les animations
   CSS d'avant (la classe `emi-mvt` sur <html> dit que ce mécanisme est
   actif ; les animations de secours s'écrivent `html:not(.emi-mvt) …`).

   ── Pour un composant qui animait sa propre sortie ──
   `mouvementActif()` : vrai quand ce mécanisme tourne. La fenêtre peut alors
   se fermer tout de suite, la sortie est jouée ici (OrganiserVisite,
   FenetreAction, la fenêtre de l'agenda, celle des demandes du site). */

type Point = { x: number; y: number };
type Appui = { el: Element | null; p: Point; r: { l: number; t: number; r: number; b: number }; t: number };
type Genre = 'fenetre' | 'menu';
type Fiche = {
  genre: Genre;
  /* Le fond qui s'allume (null : feuille opaque ou menu). */
  voile: HTMLElement | null;
  /* Ce qui grandit depuis le bouton (null : un voile seul). */
  panneau: HTMLElement | null;
  appui: Appui | null;
  ne: number;
  entree: Animation[];
};
type Sortie = { el: HTMLElement; parent: Node; fiche: Fiche | null; enveloppe: boolean };

/* Les valeurs de la maquette (STYLES.C). */
const OUVRIR = { voile: 260, fenetre: 430, depart: 0.12, opaque: 0.35, courbe: 'cubic-bezier(.2,.85,.25,1)' };
const FERMER = { fenetre: 340, voile: 320, voileRetard: 30, tenue: 0.55, courbe: 'cubic-bezier(.55,0,.7,.3)' };
const MENU = { ouvrir: 260, fermer: 180, depart: 0.7, delaiAppui: 600, distance: 80 };
const ONGLET = { sortie: 130, duree: 340, pas: 75, chute: 12, courbe: 'cubic-bezier(.16,1,.3,1)' };
/* Au-delà, l'appui est trop vieux pour être l'origine d'une fenêtre (une
   fenêtre qui s'ouvre après une lecture réseau reste dans ce délai). */
const APPUI_VALABLE = 4000;
const PLEIN = 0.85;

const ATTR_VOILE = 'data-emi-voile';
const ATTR_MENU = 'data-emi-menu';
const ATTR_CASCADE = 'data-emi-cascade';
const SANS = '[data-emi-anim="non"]';
/* Les balises qui peuvent porter une fenêtre ou un menu. */
const BALISES = new Set(['DIV', 'SECTION', 'ASIDE', 'DIALOG', 'FORM', 'NAV', 'UL', 'OL', 'ARTICLE', 'HEADER', 'SPAN', 'MENU', 'MAIN', 'FOOTER']);
const SANS_BOITE = new Set(['STYLE', 'SCRIPT', 'TEMPLATE', 'LINK', 'META', 'NOSCRIPT', 'BR']);

/* L'état partagé. Gardé sur `window` : un rechargement à chaud du module
   (développement) ne doit pas envelopper removeChild une seconde fois. */
type Etat = {
  actif: boolean;
  demarre: number;
  appui: Appui | null;
  fiches: WeakMap<HTMLElement, Fiche>;
  /* Ceux qui jouent déjà leur sortie (un second retrait les ôte pour de bon). */
  sortants: WeakSet<HTMLElement>;
  ajoutes: Set<HTMLElement>;
  sorties: Sortie[];
  image: number;
  secours: number;
  sortieOnglet: number;
  /* Les contenus d'onglet qui s'effacent, posés par-dessus (voir cascader). */
  fondus: { el: HTMLElement; parent: HTMLElement }[];
  positionsPrises: WeakMap<HTMLElement, { n: number; avant: string }>;
  observateur: MutationObserver | null;
  removeChild: typeof Node.prototype.removeChild;
  remove: typeof Element.prototype.remove;
  enveloppe: boolean;
};

function etat(): Etat {
  const w = window as unknown as { __emiMouvement?: Etat };
  if (!w.__emiMouvement) {
    w.__emiMouvement = {
      actif: false, demarre: 0, appui: null, fiches: new WeakMap(), sortants: new WeakSet(), ajoutes: new Set(), sorties: [],
      image: 0, secours: 0, sortieOnglet: -1e9, fondus: [], positionsPrises: new WeakMap(), observateur: null,
      removeChild: Node.prototype.removeChild, remove: Element.prototype.remove, enveloppe: false,
    };
  }
  return w.__emiMouvement;
}

/* ── Ce que sait faire le navigateur ─────────────────────────────────── */

function possible(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (typeof Element.prototype.animate !== 'function') return false;
  if (typeof CSS === 'undefined' || !CSS.supports('scale', '1') || !CSS.supports('translate', '1px')) return false;
  return true;
}
function sobre(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Vrai quand les fenêtres reçoivent leur entrée et leur sortie d'ici. */
export function mouvementActif(): boolean {
  return typeof window !== 'undefined' && etat().actif;
}

/* ── Petits outils ───────────────────────────────────────────────────── */

const maintenant = () => performance.now();
const exclu = (el: Element) => !!el.closest(SANS);

/* L'opacité du fond : rgba(…, a), color(… / a), transparent, ou une image
   (un dégradé : un écran dessiné, donc opaque). */
function fond(cs: CSSStyleDeclaration): number {
  if (cs.backgroundImage && cs.backgroundImage !== 'none') return 1;
  const c = (cs.backgroundColor || '').trim();
  if (!c || c === 'transparent') return 0;
  const barre = c.match(/\/\s*([\d.]+)(%?)\s*\)$/);
  if (barre) return parseFloat(barre[1]) / (barre[2] ? 100 : 1);
  const m = c.match(/^rgba\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(',');
    return p.length >= 4 ? parseFloat(p[3]) : 1;
  }
  return 1;
}
function couvre(r: DOMRect): boolean {
  return r.width >= window.innerWidth * PLEIN && r.height >= window.innerHeight * PLEIN;
}
function visible(r: DOMRect): boolean {
  return r.width > 1 && r.height > 1 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}
function centre(): Point { return { x: window.innerWidth / 2, y: window.innerHeight / 2 }; }

/* Mène à leur fin les animations CSS d'entrée d'un élément (pas celles de
   ses enfants) : la nôtre les remplace. Une animation sans fin (un pouls)
   est laissée. */
function finirCss(el: Element) {
  for (const a of el.getAnimations()) {
    const cible = (a.effect as KeyframeEffect | null)?.target;
    if (cible !== el || !('animationName' in a)) continue;
    const t = a.effect?.getComputedTiming();
    if (!t || t.iterations === Infinity) continue;
    try { a.finish(); } catch { /* déjà finie */ }
  }
}

/* Le point d'origine dans le repère de l'élément : le centre du bouton moins
   le coin de sa boîte AVANT transformation. Une simple translation (un
   centrage par translate(-50%, -50%), une feuille poussée vers le bas) est
   retirée du rectangle mesuré. */
function origineDans(el: HTMLElement, p: Point): string {
  const r = el.getBoundingClientRect();
  let tx = 0, ty = 0;
  const t = getComputedStyle(el).transform;
  if (t && t !== 'none') {
    try {
      const m = new DOMMatrixReadOnly(t);
      if (m.is2D && Math.abs(m.a - 1) < 1e-3 && Math.abs(m.d - 1) < 1e-3 && Math.abs(m.b) < 1e-3 && Math.abs(m.c) < 1e-3) { tx = m.e; ty = m.f; }
    } catch { /* matrice illisible : on garde le rectangle tel quel */ }
  }
  return `${Math.round(p.x - (r.left - tx))}px ${Math.round(p.y - (r.top - ty))}px`;
}

/* D'où sort la fenêtre : le bouton touché, s'il est encore là et à l'écran ;
   sinon l'endroit où il était ; sinon le centre de l'écran. */
function pointDe(a: Appui | null, recent = true): Point {
  if (!a || (recent && maintenant() - a.t > APPUI_VALABLE)) return centre();
  const el = a.el;
  if (el && el.isConnected) {
    const r = el.getBoundingClientRect();
    if (visible(r)) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return a.p;
}

function nombre(v: string, defaut: number): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : defaut;
}

/* ── 1. L'origine : le dernier bouton touché ─────────────────────────── */

const CLIQUABLE = 'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="option"], summary, label, select, input, textarea, [tabindex]';

function noterAppui(e: Event) {
  const cible = e.target;
  if (!(cible instanceof Element)) return;
  const el = cible.closest(CLIQUABLE) || cible;
  const r = el.getBoundingClientRect();
  etat().appui = { el, p: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, r: { l: r.left, t: r.top, r: r.right, b: r.bottom }, t: maintenant() };
}

/* ── 2. L'entrée ─────────────────────────────────────────────────────── */

function planifier() {
  const s = etat();
  if (s.image) return;
  s.image = requestAnimationFrame(traiter);
  /* Onglet en arrière-plan : pas d'image, donc pas d'animation — mais les
     sorties doivent quand même finir. */
  if (!s.secours) s.secours = window.setTimeout(traiter, 120);
}

function observer(liste: MutationRecord[]) {
  const s = etat();
  if (!s.actif) return;
  for (const m of liste) {
    m.addedNodes.forEach(n => { if (n instanceof HTMLElement) s.ajoutes.add(n); });
  }
  if (s.ajoutes.size) planifier();
}

/* Les éléments où chercher une fenêtre : la racine ajoutée et ses enfants
   sur deux niveaux, rien de plus profond. */
function aRegarder(racine: HTMLElement): HTMLElement[] {
  const l: HTMLElement[] = [];
  let niveau: HTMLElement[] = [racine];
  for (let p = 0; p < 3 && niveau.length; p++) {
    const suivant: HTMLElement[] = [];
    for (const el of niveau) {
      if (BALISES.has(el.tagName)) l.push(el);
      if (p < 2) for (const c of Array.from(el.children)) if (c instanceof HTMLElement && !SANS_BOITE.has(c.tagName)) suivant.push(c);
    }
    niveau = suivant.length > 60 ? [] : suivant;
  }
  return l;
}

/* La fenêtre d'un voile : son plus grand enfant qui ne couvre pas l'écran.
   Un enfant plein écran transparent n'est qu'un cadre : on regarde dedans ;
   plein écran et opaque, c'est la fenêtre elle-même (feuille du téléphone). */
function fenetreDe(voile: HTMLElement): HTMLElement | null {
  let mieux: HTMLElement | null = null;
  let aire = 0;
  const voir = (el: Element, prof: number) => {
    for (const c of Array.from(el.children)) {
      if (!(c instanceof HTMLElement) || SANS_BOITE.has(c.tagName)) continue;
      const cs = getComputedStyle(c);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (cs.display === 'contents') { if (prof < 3) voir(c, prof + 1); continue; }
      const r = c.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (couvre(r) && fond(cs) < 0.9) { if (prof < 3) voir(c, prof + 1); continue; }
      const a = r.width * r.height;
      if (a > aire) { aire = a; mieux = c; }
    }
  };
  voir(voile, 1);
  return mieux && aire >= 120 * 60 ? mieux : null;
}

/* Une fenêtre posée à côté de son voile (deux éléments fixes frères, ajoutés
   ensemble) : la plus grande. */
function fenetreSoeur(voile: HTMLElement, ajoutes: Set<HTMLElement>): HTMLElement | null {
  const p = voile.parentElement;
  if (!p) return null;
  let mieux: HTMLElement | null = null;
  let aire = 0;
  for (const c of Array.from(p.children)) {
    if (c === voile || !(c instanceof HTMLElement) || !ajoutes.has(c)) continue;
    const cs = getComputedStyle(c);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
    const r = c.getBoundingClientRect();
    if (!visible(r) || couvre(r)) continue;
    const a = r.width * r.height;
    if (a > aire) { aire = a; mieux = c; }
  }
  return mieux && aire >= 120 * 60 ? mieux : null;
}

function estMenu(el: HTMLElement, cs: CSSStyleDeclaration, r: DOMRect, a: Appui | null): boolean {
  if (!a || maintenant() - a.t > MENU.delaiAppui) return false;
  if (cs.position !== 'absolute' && cs.position !== 'fixed') return false;
  if (r.width < 40 || r.height < 24 || !visible(r) || couvre(r)) return false;
  const role = el.getAttribute('role');
  if (role === 'status' || role === 'alert' || role === 'tooltip' || el.hasAttribute('aria-live')) return false;
  if (cs.pointerEvents === 'none' || cs.visibility === 'hidden') return false;
  /* Transparent sans animation : une bulle cachée en attente de survol. Un
     menu qui entre par sa propre animation CSS part, lui, de 0. */
  if (nombre(cs.opacity, 1) === 0 && !el.getAnimations().length) return false;
  const deRole = role === 'menu' || role === 'listbox' || role === 'dialog';
  if (!deRole && (!cs.boxShadow || cs.boxShadow === 'none')) return false;
  if (a.el && (a.el.contains(el) || el.contains(a.el))) return false;
  /* À côté du bouton : un menu s'ouvre contre lui, une notification au
     loin n'en est pas un. */
  const dx = Math.max(0, a.r.l - r.right, r.left - a.r.r);
  const dy = Math.max(0, a.r.t - r.bottom, r.top - a.r.b);
  if (Math.max(dx, dy) > (deRole ? MENU.distance * 2 : MENU.distance)) return false;
  /* Un menu est petit : un écran entier qui arrive n'en est pas un. */
  return el.getElementsByTagName('*').length <= 400;
}

function entrer(f: Fiche) {
  const p = pointDe(f.appui);
  if (f.voile) {
    finirCss(f.voile);
    if (f.voile !== f.panneau) f.entree.push(f.voile.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OUVRIR.voile, easing: 'ease' }));
  }
  const el = f.panneau;
  if (!el) return;
  if (el !== f.voile) finirCss(el);
  const o = origineDans(el, p);
  if (f.genre === 'fenetre') {
    f.entree.push(el.animate([
      { scale: String(OUVRIR.depart), opacity: 0, transformOrigin: o },
      { opacity: 1, offset: OUVRIR.opaque, transformOrigin: o },
      { scale: '1', opacity: 1, transformOrigin: o },
    ], { duration: OUVRIR.fenetre, easing: OUVRIR.courbe }));
  } else {
    f.entree.push(el.animate([
      { scale: String(MENU.depart), opacity: 0, transformOrigin: o },
      { opacity: 1, offset: 0.5, transformOrigin: o },
      { scale: '1', opacity: 1, transformOrigin: o },
    ], { duration: MENU.ouvrir, easing: OUVRIR.courbe }));
  }
}

function marquer(el: HTMLElement, f: Fiche, attr: string) {
  el.setAttribute(attr, '');
  etat().fiches.set(el, f);
}

/* Les nœuds ajoutés pendant l'image : fenêtres d'abord, menus ensuite.
   `reprises` : les fenêtres qui en remplacent une autre à l'identique — pas
   d'entrée, et l'origine de celle qu'elles remplacent. */
function reconnaitre(ajoutes: Set<HTMLElement>, reprises: Map<HTMLElement, Appui | null>) {
  const s = etat();
  const a = s.appui && maintenant() - s.appui.t <= APPUI_VALABLE ? s.appui : null;
  const pris = new Set<HTMLElement>();
  const dans = (el: HTMLElement) => { for (const x of pris) if (x.contains(el)) return true; return false; };
  /* Les portails (posés sur <body>) d'abord : c'est là que vivent presque
     toutes les fenêtres. Un budget borne le travail d'une image où une
     longue liste vient d'arriver. */
  const racines = [...ajoutes].filter(el => el.isConnected && !exclu(el))
    .sort((x, y) => Number(y.parentNode === document.body) - Number(x.parentNode === document.body));
  const menus: { el: HTMLElement; reprise: Appui | null | undefined }[] = [];
  let budget = 700;

  for (const racine of racines) {
    if (budget <= 0) break;
    for (const el of aRegarder(racine)) {
      if (--budget < 0) break;
      if (dans(el) || s.fiches.has(el) || (el !== racine && el.matches(SANS))) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      const pos = cs.position;
      if (pos !== 'fixed' && pos !== 'absolute') continue;
      const reprise = reprises.has(el) ? reprises.get(el) : reprises.has(racine) ? reprises.get(racine) : undefined;
      const r = el.getBoundingClientRect();
      if (pos === 'fixed' && couvre(r)) {
        const opacite = fond(cs);
        const flou = !!cs.backdropFilter && cs.backdropFilter !== 'none';
        let voile: HTMLElement | null = el;
        let panneau: HTMLElement | null;
        if (opacite >= 0.9) { voile = null; panneau = el; }
        else {
          panneau = fenetreDe(el) || (opacite > 0 || flou ? fenetreSoeur(el, ajoutes) : null);
          /* Transparent et vide : un attrape-clic sous un menu. Son menu
             est reconnu à part. */
          if (!panneau && opacite === 0 && !flou) continue;
        }
        const f: Fiche = { genre: 'fenetre', voile, panneau, appui: reprise !== undefined ? reprise : a, ne: maintenant(), entree: [] };
        if (voile) marquer(voile, f, ATTR_VOILE);
        if (panneau && panneau !== voile && !(voile && voile.contains(panneau))) marquer(panneau, f, ATTR_VOILE);
        pris.add(el);
        if (panneau) pris.add(panneau);
        if (reprise === undefined) entrer(f);
        continue;
      }
      menus.push({ el, reprise });
    }
  }
  for (const { el, reprise } of menus) {
    if (dans(el) || !el.isConnected) continue;
    if (reprise === undefined && !estMenu(el, getComputedStyle(el), el.getBoundingClientRect(), s.appui)) continue;
    const f: Fiche = { genre: 'menu', voile: null, panneau: el, appui: reprise !== undefined ? reprise : s.appui, ne: maintenant(), entree: [] };
    marquer(el, f, ATTR_MENU);
    pris.add(el);
    if (reprise === undefined) entrer(f);
  }
}

/* ── 3. La sortie ────────────────────────────────────────────────────── */

function retirerVraiment(parent: Node, el: HTMLElement) {
  const s = etat();
  s.fiches.delete(el);
  if (el.parentNode === parent) s.removeChild.call(parent, el);
}

function figer(el: HTMLElement) {
  el.style.pointerEvents = 'none';
  try { el.inert = true; } catch { /* navigateur ancien : pointer-events suffit */ }
  const actif = document.activeElement;
  if (actif instanceof HTMLElement && el.contains(actif)) actif.blur();
}

/* Une fenêtre ou un menu reconnus, dans une enveloppe sans boîte, sur deux
   niveaux au plus (un conteneur de portail, un div autour d'un fragment). */
function marquesDans(el: HTMLElement): HTMLElement[] {
  const s = etat();
  const l: HTMLElement[] = [];
  for (const c of Array.from(el.children)) {
    if (c instanceof HTMLElement && s.fiches.has(c)) l.push(c);
    else for (const d of Array.from(c.children)) if (d instanceof HTMLElement && s.fiches.has(d)) l.push(d);
  }
  return l;
}

/* Le nœud que React retire : faut-il le garder le temps d'une sortie ?
   Appelé pendant la validation de React : on décide, on fige, et
   l'animation part au début de l'image suivante. */
function retenir(parent: Node, el: HTMLElement): boolean {
  const s = etat();
  if (!s.actif || el.parentNode !== parent || document.visibilityState === 'hidden') return false;
  /* Déjà en train de sortir, et qu'on retire encore : il part tout de suite. */
  if (s.sortants.has(el)) return false;
  if (el.hasAttribute(ATTR_CASCADE)) return sortieOnglet(parent, el);
  const f = s.fiches.get(el);
  if (f) {
    if (exclu(el)) return false;
    figer(el);
    s.sortants.add(el);
    s.sorties.push({ el, parent, fiche: f, enveloppe: false });
    planifier();
    return true;
  }
  /* Une enveloppe sans boîte autour d'une fenêtre : elle attend que sa
     fenêtre soit sortie. Une page entière, elle, part tout de suite. */
  const n = el.childElementCount;
  if (n === 0 || n > 3) return false;
  if (!marquesDans(el).length) return false;
  const r = el.getBoundingClientRect();
  if (r.width * r.height > 4 && getComputedStyle(el).display !== 'contents') return false;
  figer(el);
  s.sortants.add(el);
  s.sorties.push({ el, parent, fiche: null, enveloppe: true });
  planifier();
  return true;
}

function sortir(x: Sortie) {
  const s = etat();
  const fin = () => retirerVraiment(x.parent, x.el);
  const anims: Animation[] = [];
  const jouer = (el: HTMLElement, f: Fiche) => {
    const cible = f.panneau && (f.panneau === el || el.contains(f.panneau)) ? f.panneau : null;
    const voile = f.voile && f.voile === el ? f.voile : null;
    /* Elle part d'où elle en est : une fenêtre fermée pendant son entrée ne
       saute pas. */
    const v0 = voile ? nombre(getComputedStyle(voile).opacity, 1) : 1;
    const csP = cible ? getComputedStyle(cible) : null;
    const s0 = csP ? nombre(csP.scale, 1) : 1;
    const o0 = csP ? nombre(csP.opacity, 1) : 1;
    f.entree = f.entree.filter(a => {
      const t = (a.effect as KeyframeEffect | null)?.target;
      if (t !== voile && t !== cible) return true;
      a.cancel();
      return false;
    });
    if (voile && voile !== cible) {
      anims.push(voile.animate([{ opacity: v0 }, { opacity: 0 }], { duration: FERMER.voile, delay: FERMER.voileRetard, easing: 'ease', fill: 'forwards' }));
    }
    if (cible) {
      const o = origineDans(cible, pointDe(f.appui, false));
      const menu = f.genre === 'menu';
      anims.push(cible.animate([
        { scale: String(s0), opacity: o0, transformOrigin: o },
        { opacity: o0, offset: menu ? 0.3 : FERMER.tenue, transformOrigin: o },
        { scale: String(menu ? MENU.depart : OUVRIR.depart), opacity: 0, transformOrigin: o },
      ], { duration: menu ? MENU.fermer : FERMER.fenetre, easing: FERMER.courbe, fill: 'forwards' }));
    }
  };
  if (x.enveloppe) {
    /* Ce qui sort déjà de lui-même n'est pas rejoué : l'enveloppe attend
       seulement la fin. */
    for (const el of marquesDans(x.el)) {
      const f = s.fiches.get(el);
      if (f && !s.sortants.has(el)) { s.sortants.add(el); jouer(el, f); }
    }
  } else if (x.fiche) jouer(x.el, x.fiche);
  const plusLong = Math.max(FERMER.fenetre, FERMER.voile + FERMER.voileRetard);
  if (!anims.length && !x.enveloppe) { fin(); return; }
  let fait = false;
  const une = () => { if (!fait) { fait = true; fin(); } };
  if (anims.length) Promise.all(anims.map(a => a.finished)).then(une, une);
  window.setTimeout(une, anims.length ? plusLong + 250 : plusLong + 20);
}

/* Le contenu d'un onglet qu'on quitte : sorti du flux (posé par-dessus, à
   la même place), il s'efface en 130 ms pendant que le nouveau arrive. */
function sortieOnglet(parent: Node, el: HTMLElement): boolean {
  const s = etat();
  if (!(parent instanceof HTMLElement) || exclu(el)) return false;
  const r0 = el.getBoundingClientRect();
  if (!visible(r0) || r0.height < 4) return false;
  /* Le parent devient le repère du contenu posé : il défile avec la page et
     reste coupé par elle (le temps de l'effacement seulement). */
  const prise = s.positionsPrises.get(parent);
  if (prise) prise.n++;
  else if (getComputedStyle(parent).position === 'static') {
    s.positionsPrises.set(parent, { n: 1, avant: parent.style.position });
    parent.style.position = 'relative';
  }
  for (const a of el.getAnimations()) if ((a.effect as KeyframeEffect | null)?.target === el) a.cancel();
  const st = el.style;
  st.transition = 'none';
  st.position = 'absolute'; st.top = '0px'; st.left = '0px'; st.right = 'auto'; st.bottom = 'auto';
  st.width = `${r0.width}px`; st.margin = '0'; st.boxSizing = 'border-box';
  const r1 = el.getBoundingClientRect();
  st.top = `${r0.top - r1.top}px`;
  st.left = `${r0.left - r1.left}px`;
  st.height = `${Math.max(1, Math.min(r0.height, window.innerHeight - r0.top))}px`;
  st.overflow = 'hidden';
  el.setAttribute('aria-hidden', 'true');
  figer(el);
  s.sortants.add(el);
  s.sortieOnglet = maintenant();
  const fondu = { el, parent };
  s.fondus.push(fondu);
  const fin = () => {
    s.fondus = s.fondus.filter(x => x !== fondu);
    retirerVraiment(parent, el);
    const p = s.positionsPrises.get(parent);
    if (p && --p.n <= 0) { parent.style.position = p.avant; s.positionsPrises.delete(parent); }
  };
  const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ONGLET.sortie, easing: 'ease-in', fill: 'forwards' });
  let fait = false;
  const une = () => { if (!fait) { fait = true; fin(); } };
  a.finished.then(une, une);
  window.setTimeout(une, ONGLET.sortie + 200);
  return true;
}

/* ── L'image : sorties et entrées, ensemble ──────────────────────────── */

function traiter() {
  const s = etat();
  if (s.image) cancelAnimationFrame(s.image);
  if (s.secours) clearTimeout(s.secours);
  s.image = 0; s.secours = 0;
  const ajoutes = new Set([...s.ajoutes].filter(el => el.isConnected));
  s.ajoutes.clear();
  const sorties = s.sorties.splice(0);
  if (!s.actif) {
    sorties.forEach(x => retirerVraiment(x.parent, x.el));
    return;
  }
  /* Une fenêtre remplacée par sa jumelle (même parent, même balise, même
     classe) sans nouvel appui ailleurs qu'en elle : c'est le même écran que
     le composant a remonté. L'échange se fait sans animation, et la
     nouvelle rentrera dans le bouton de l'ancienne. */
  const reprises = new Map<HTMLElement, Appui | null>();
  const restent: Sortie[] = [];
  for (const x of sorties) {
    const f = x.fiche;
    if (f && !x.enveloppe) {
      const jumelle = [...ajoutes].find(n => !reprises.has(n) && n.parentNode === x.parent && n.tagName === x.el.tagName && n.className === x.el.className);
      const a = s.appui;
      const sansAutreAppui = !a || a.t < f.ne || (!!a.el && x.el.contains(a.el));
      if (jumelle && sansAutreAppui) {
        f.entree.forEach(an => an.cancel());
        retirerVraiment(x.parent, x.el);
        reprises.set(jumelle, f.appui);
        continue;
      }
    }
    restent.push(x);
  }
  if (ajoutes.size) reconnaitre(ajoutes, reprises);
  restent.forEach(sortir);
}

/* ── 4. Les onglets : la cascade ─────────────────────────────────────── */

function enfantsBlocs(el: Element): HTMLElement[] {
  const l: HTMLElement[] = [];
  for (const c of Array.from(el.children)) {
    if (!(c instanceof HTMLElement) || SANS_BOITE.has(c.tagName) || c.matches(SANS)) continue;
    const cs = getComputedStyle(c);
    if (cs.display === 'none') continue;
    if (cs.display === 'contents') { l.push(...enfantsBlocs(c)); continue; }
    if (cs.display.startsWith('inline') || cs.position === 'absolute' || cs.position === 'fixed') continue;
    const r = c.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    l.push(c);
  }
  return l;
}

/* Les blocs qui tombent : les enfants du contenu ; s'il n'y en a qu'un ou
   deux (une section, une grille, des enveloppes), on descend dans le plus
   grand, jusqu'à trouver des cartes. Seulement ceux qui sont à l'écran. */
function aCascader(racine: HTMLElement): HTMLElement[] {
  let l = enfantsBlocs(racine);
  for (let tour = 0; tour < 6 && l.length < 3; tour++) {
    let i = -1, h = 0, sous: HTMLElement[] = [];
    l.forEach((el, k) => {
      const e = enfantsBlocs(el);
      /* Un bloc seul qui n'enveloppe qu'un bloc : on le traverse. */
      if (e.length < 2 && !(l.length === 1 && e.length === 1)) return;
      const hh = el.getBoundingClientRect().height;
      if (hh > h) { h = hh; i = k; sous = e; }
    });
    if (i < 0) break;
    l = [...l.slice(0, i), ...sous, ...l.slice(i + 1)];
  }
  return l.filter(el => visible(el.getBoundingClientRect()));
}

/** Fait tomber le contenu d'un onglet qui vient d'arriver (voir Cascade). */
export function cascader(racine: HTMLElement) {
  const s = etat();
  if (!s.actif || exclu(racine)) return;
  /* L'ancien contenu s'efface d'abord (130 ms), comme sur la maquette. */
  /* L'ancien contenu, posé là où il était, se recale sur le nouveau : ce
     qui est au-dessus a pu changer de hauteur avec l'onglet (l'en-tête d'une
     fiche au téléphone), et il s'effacerait sinon à côté de sa place. */
  const ici = racine.getBoundingClientRect();
  for (const { el, parent } of s.fondus) {
    if (parent !== racine.parentElement || !el.isConnected) continue;
    const r = el.getBoundingClientRect();
    const dy = ici.top - r.top, dx = ici.left - r.left;
    if (Math.abs(dy) < 1 && Math.abs(dx) < 1) continue;
    el.style.top = `${nombre(el.style.top, 0) + dy}px`;
    el.style.left = `${nombre(el.style.left, 0) + dx}px`;
    el.style.height = `${Math.max(1, Math.min(r.height, window.innerHeight - ici.top))}px`;
  }
  const base = maintenant() - s.sortieOnglet < 100 ? ONGLET.sortie - 10 : 0;
  const blocs = aCascader(racine);
  const n = blocs.length;
  /* Une longue liste à l'écran ne met pas une seconde à arriver. */
  const pas = n <= 6 ? ONGLET.pas : Math.max(30, 450 / (n - 1));
  blocs.forEach((el, i) => {
    finirCss(el);
    el.animate([
      { opacity: 0, translate: `0px -${ONGLET.chute}px` },
      { opacity: 1, translate: '0px 0px' },
    ], { duration: ONGLET.duree, delay: base + Math.min(i * pas, 520), easing: ONGLET.courbe, fill: 'backwards' });
  });
}

/* ── Démarrer, arrêter ───────────────────────────────────────────────── */

function envelopper() {
  const s = etat();
  if (s.enveloppe) return;
  s.enveloppe = true;
  const rc = s.removeChild;
  const rm = s.remove;
  Node.prototype.removeChild = function removeChild<T extends Node>(this: Node, enfant: T): T {
    if (etat().actif && enfant instanceof HTMLElement && retenir(this, enfant)) return enfant;
    return rc.call(this, enfant) as T;
  };
  Element.prototype.remove = function remove(this: Element) {
    const p = this.parentNode;
    if (p && etat().actif && this instanceof HTMLElement && retenir(p, this)) return;
    rm.call(this);
  };
}

function allumer(oui: boolean) {
  const s = etat();
  s.actif = oui;
  document.documentElement.classList.toggle('emi-mvt', oui);
  if (oui && !s.observateur) {
    s.observateur = new MutationObserver(observer);
    s.observateur.observe(document.body, { childList: true, subtree: true });
  }
  if (!oui && s.observateur) {
    s.observateur.disconnect();
    s.observateur = null;
    s.ajoutes.clear();
    traiter();
  }
}

/** Monte le mouvement (une fois, dans AppLayout). Rend de quoi l'arrêter. */
export function demarrerMouvement(): () => void {
  if (!possible()) return () => {};
  const s = etat();
  s.demarre++;
  envelopper();
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const regler = () => allumer(s.demarre > 0 && !sobre());
  regler();
  document.addEventListener('pointerdown', noterAppui, true);
  document.addEventListener('click', noterAppui, true);
  mq?.addEventListener?.('change', regler);
  return () => {
    s.demarre = Math.max(0, s.demarre - 1);
    document.removeEventListener('pointerdown', noterAppui, true);
    document.removeEventListener('click', noterAppui, true);
    mq?.removeEventListener?.('change', regler);
    if (!s.demarre) allumer(false);
  };
}
