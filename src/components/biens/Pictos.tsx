/* ═══ Les pictos dessinés (V3.108) ══════════════════════════════════════
   Alexandre, sur l'éditeur d'un bien : « les icônes, la cuisine, l'état
   général, chauffage et eau chaude, est-ce qu'on peut les faire plus jolis,
   avec des icônes qu'on comprenne mieux ; il n'y a pas de charme ». Il a
   choisi la maquette « des vignettes dessinées » : chaque choix porte un
   petit dessin, trait marine et couleurs douces.

   Un dessin (`Dessin`) se pose dans une grille de 48 : jusqu'à cinq formes
   pleines (f, a, b, c, d, chacune avec sa couleur), puis le trait marine (t)
   et un trait de couleur (s) — vapeur, coche, vagues. `eo` : remplissage
   « pair-impair », pour une lettre évidée (le P du parking).

   Tout est calculé une fois, au chargement du module. */

export type Dessin = {
  f?: string; cf?: string; a?: string; ca?: string; b?: string; cb?: string; c?: string; cc?: string; d?: string; cd?: string;
  t?: string; s?: string; cs?: string; eo?: boolean;
};
const MARINE = '#23324d';

function fabriquer(): Record<string, Dessin> {
  const R = (x: number, y: number, w: number, h: number, r = 0): string => {
    if (!r) return `M${x} ${y}h${w}v${h}h${-w}z`;
    return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
  };
  const C = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
  const W = (x: number, y: number) => `M${x} ${y}c-1.2-1.2 1.2-2.4 0-3.6s1.2-2.4 0-3.6`;
  const WD = (x: number, y: number) => `M${x} ${y}c-1.2 1.2 1.2 2.4 0 3.6s1.2 2.4 0 3.6`;
  const P = (o: Dessin): Dessin => o;
  const etoile = (x: number, y: number, r: number) => `M${x} ${y - r}c${r * .13} ${r * .66} ${r * .34} ${r * .87} ${r} ${r}c${-r * .66} ${r * .13} ${-r * .87} ${r * .34} ${-r} ${r}c${-r * .13} ${-r * .66} ${-r * .34} ${-r * .87} ${-r} ${-r}c${r * .66} ${-r * .13} ${r * .87} ${-r * .34} ${r} ${-r}z`;
  /* Une forme dessinée en coordonnées absolues (base au point 24,43), recalée et mise à l'échelle. */
  const ech = (d: string, cx: number, by: number, k: number) => { let i = 0; return d.replace(/-?\d*\.?\d+/g, n => { const v = +n; const r = (i++ % 2 === 0) ? cx + (v - 24) * k : by + (v - 43) * k; return String(+r.toFixed(2)); }); };
  const FLAMME = 'M24 43C17 43 12.5 38.5 12.5 32C12.5 25.5 17 22.5 18.5 17C20 20 21.5 21.5 23 22C22.5 15.5 25.5 9.5 30 5.5C29.5 11 31.5 14 33.5 17.5C35.5 21 35.5 25 35.5 32C35.5 38.5 31 43 24 43Z';
  const FLAMME_IN = 'M24 43C20.4 43 18 40.6 18 37.4C18 33.6 21 32 22.6 28C24.2 30.6 30 33 30 37.4C30 40.6 27.6 43 24 43Z';
  const flamme = (cx: number, by: number, k: number) => ech(FLAMME, cx, by, k);
  const flammeIn = (cx: number, by: number, k: number) => ech(FLAMME_IN, cx, by, k);
  const maison = 'M8 22 24 9l16 13v19H8z';
  const immeuble = R(12, 5, 24, 37, 2);
  const fenetresImm = 'M17 10h4v4h-4zM27 10h4v4h-4zM17 17h4v4h-4zM27 17h4v4h-4z';
  const goutte = (cx: number, ty: number, k: number) => {
    const s = (n: number) => +(n * k).toFixed(2);
    return `M${cx} ${ty}c${s(-3)} ${s(4.2)} ${s(-4.6)} ${s(6.5)} ${s(-4.6)} ${s(8.8)}a${s(4.6)} ${s(4.6)} 0 0 0 ${s(9.2)} 0c0 ${s(-2.3)} ${s(-1.6)} ${s(-4.6)} ${s(-4.6)} ${s(-8.8)}z`;
  };
  const volet = 'M5 6h32v8H5z';
  const lames = R(7, 14, 28, 19, 0);

  const c = {
    peche: '#FFDDBD', orange: '#F4A261', corail: '#FFD3C4', rouge: '#EF6F5E', jaune: '#F7CB4D', or: '#EFC659', orPale: '#FBE8AE',
    eau: '#D7E9FB', bleu: '#6AAEEF', ciel: '#DCEEFC', vert: '#CDEED9', vertFonce: '#2F9E62', sauge: '#A9D6B9',
    bois: '#E6B585', boisFonce: '#B47A44', acier: '#DDE4ED', alu: '#C3CDD9', metal: '#8995A6', gris: '#A3B1C6', blanc: '#FFFFFF', lavande: '#D8E3F6', bleuMoyen: '#8EB2E2',
  };

  /* Une petite maison : toit en pointe, murs. */
  const M = (x: number, y: number, w: number, h: number) => `M${x} ${y + h * .42}L${x + w / 2} ${y}L${x + w} ${y + h * .42}V${y + h}H${x}z`;
  /* Une étoile à cinq branches. */
  const star = (cx: number, cy: number, r: number) => { let d = ''; for (let i = 0; i < 10; i++) { const a = Math.PI / 5 * i - Math.PI / 2; const rr = i % 2 ? r * .45 : r; d += `${i ? 'L' : 'M'}${+(cx + rr * Math.cos(a)).toFixed(2)} ${+(cy + rr * Math.sin(a)).toFixed(2)}`; } return d + 'z'; };
  /* L'aiguille d'une boussole vers un cap (degrés, 0 = nord). */
  const aiguille = (deg: number) => { const a = deg * Math.PI / 180, sx = Math.sin(a), cy = -Math.cos(a); const px = -cy, py = sx; const f = (x: number, y: number) => `${+(x).toFixed(2)} ${+(y).toFixed(2)}`; return `M${f(24 + 15 * sx, 24 + 15 * cy)}L${f(24 + 4.5 * px, 24 + 4.5 * py)}L${f(24 - 6 * sx, 24 - 6 * cy)}L${f(24 - 4.5 * px, 24 - 4.5 * py)}z`; };
  const coeurP = 'M24 41C18 36 6 29 6 18.5 6 13 10 9 15 9c4 0 7 2.5 9 6 2-3.5 5-6 9-6 5 0 9 4 9 9.5C42 29 30 36 24 41z';
  const papier = 'M11 5h18l8 8v30H11z';
  const pli = 'M29 5v8h8';
  const boussole = { f: C(24, 24, 18), cf: '#EEF4FB', t: C(24, 24, 18) + 'M24 6v4M24 38v4M6 24h4M38 24h4' };
  return {
    /* ---- Les parties ---- */
    canape: P({ f: 'M10 14a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v9H10z', cf: c.lavande, a: R(5, 20, 8, 15, 3) + R(35, 20, 8, 15, 3) + R(12, 26, 24, 9, 2), ca: c.bleuMoyen,
      t: 'M10 14a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v9H10z' + R(5, 20, 8, 15, 3) + R(35, 20, 8, 15, 3) + R(12, 26, 24, 9, 2) + 'M9 35v4M39 35v4M24 26v9' }),
    rouleau: P({ f: 'M10 17h12v8a2 2 0 0 1-4 0v-1a2 2 0 0 0-4 0v5a2 2 0 0 1-4 0z', cf: '#9FDBB8', a: R(10, 6, 26, 10, 3), ca: c.or, b: R(21, 25, 6, 17, 3), cb: c.orange,
      t: R(10, 6, 26, 10, 3) + 'M36 11h4v8H24v6' + R(21, 25, 6, 17, 3) }),
    casserole: P({ f: 'M11 22h26v11a7 7 0 0 1-7 7H18a7 7 0 0 1-7-7z', cf: c.peche, a: 'M9 22c0-4 6.7-7 15-7s15 3 15 7z', ca: c.orange,
      t: 'M11 22h26v11a7 7 0 0 1-7 7H18a7 7 0 0 1-7-7zM9 22c0-4 6.7-7 15-7s15 3 15 7zM22 15v-2.5h4V15M11 27H6.5M37 27h4.5', s: 'M17 10c-1.4-1.4 1.4-2.8 0-4.2M31 10c-1.4-1.4 1.4-2.8 0-4.2', cs: c.gris }),
    radiateur: P({ f: R(9, 16, 6, 22, 3) + R(17, 16, 6, 22, 3) + R(25, 16, 6, 22, 3) + R(33, 16, 6, 22, 3), cf: c.corail,
      t: R(9, 16, 6, 22, 3) + R(17, 16, 6, 22, 3) + R(25, 16, 6, 22, 3) + R(33, 16, 6, 22, 3) + 'M15 21h2M23 21h2M31 21h2M15 33h2M23 33h2M31 33h2M12 38v4M36 38v4',
      s: W(16, 12) + W(24, 12) + W(32, 12), cs: c.rouge }),
    robinet: P({ f: 'M5 13h21a9 9 0 0 1 9 9v3h-7v-3a2 2 0 0 0-2-2H5z', cf: c.acier, a: R(11, 6, 12, 4, 2), ca: c.rouge, b: goutte(31.5, 30, 1), cb: c.bleu,
      t: 'M5 13h21a9 9 0 0 1 9 9v3h-7v-3a2 2 0 0 0-2-2H5zM5 10v13M17 10v3' + R(11, 6, 12, 4, 2) + goutte(31.5, 30, 1) }),
    fenetreVolets: P({ f: R(16, 8, 16, 31, 1), cf: c.ciel, a: R(5, 8, 9, 31, 1.5) + R(34, 8, 9, 31, 1.5), ca: c.sauge,
      t: R(16, 8, 16, 31, 1) + 'M24 8v31M16 23h16' + R(5, 8, 9, 31, 1.5) + R(34, 8, 9, 31, 1.5) + 'M5 18.5h9M5 28.5h9M34 18.5h9M34 28.5h9M3 43h42', s: 'M19 13l3-3M19 18l5-5', cs: c.blanc }),
    etincelles: P({ f: etoile(36, 34, 7), cf: c.orPale, a: etoile(21, 18, 13), ca: c.or, b: C(10.5, 38.5, 2.5), cb: c.orPale,
      t: etoile(21, 18, 13) + etoile(36, 34, 7) }),
    /* ---- Les questions ---- */
    four: P({ f: R(9, 7, 30, 34, 4), cf: c.peche, a: R(13, 23, 22, 13, 2), ca: '#FFC08E',
      t: R(9, 7, 30, 34, 4) + 'M9 17h30' + C(15.5, 12, 1.6) + C(21.5, 12, 1.6) + 'M28 12h6M17 20.5h14' + R(13, 23, 22, 13, 2) }),
    flamme: P({ a: flamme(24, 43, 1), ca: c.orange, b: flammeIn(24, 43, 1), cb: c.jaune, t: flamme(24, 43, 1) }),
    vitrage: P({ f: R(9, 7, 30, 34, 3), cf: c.ciel, t: R(9, 7, 30, 34, 3) + 'M24 7v34M9 24h30', s: 'M13 15l5-5M13 20l3-3', cs: c.blanc }),
    voletRoulant: P({ f: lames, cf: '#E6EBF2', a: volet, ca: c.alu, b: R(7, 33, 28, 9, 0), cb: c.ciel,
      t: volet + 'M7 14v28h28V14M7 19h28M7 24h28M7 29h28M7 33h28M21 33v9' }),
    cadreBois: P({ f: R(8, 6, 32, 36, 4), cf: c.bois, a: R(14, 12, 20, 24, 1.5), ca: c.ciel, s: 'M11 13v22M37 13v22', cs: c.boisFonce,
      t: R(8, 6, 32, 36, 4) + R(14, 12, 20, 24, 1.5) + 'M24 12v24' }),
    /* ---- Les choix : l'état ---- */
    marteau: P({ a: R(11, 7, 24, 10, 3), ca: c.alu, b: R(21.5, 17, 5, 25, 2.5), cb: c.bois, t: R(11, 7, 24, 10, 3) + R(21.5, 17, 5, 25, 2.5) + 'M31 7v10', s: 'M39 22l3 3M40 30h3', cs: c.orange }),
    pouce: P({ f: maison, cf: c.vert, t: maison, s: 'M16.5 29l5 5 10-11', cs: c.vertFonce }),
    neuf: P({ f: maison, cf: c.orPale, a: etoile(39, 10, 6), ca: c.or, b: etoile(9, 9, 3.5), cb: c.or, t: maison + 'M20.5 41v-9h7v9' + etoile(39, 10, 6) }),
    /* ---- Les choix : la cuisine ---- */
    porte: P({ f: R(14, 5, 20, 37, 2), cf: c.bois, b: C(30.5, 24.5, 1.8), cb: c.or, t: R(14, 5, 20, 37, 2) + R(17.5, 9, 10, 12, 1) + R(17.5, 26, 10, 12, 1) + C(30.5, 24.5, 1.8) + 'M8 42h32' }),
    verriere: P({ f: R(6, 27, 36, 15, 0), cf: c.peche, a: R(6, 6, 36, 21, 0), ca: c.ciel, t: R(6, 6, 36, 36, 2) + 'M6 27h36M15 6v21M24 6v21M33 6v21M6 16.5h36', s: 'M9 12l3-3M27 12l3-3', cs: c.blanc }),
    bar: P({ f: R(8, 21, 32, 10, 0), cf: c.peche, a: R(5, 15, 38, 6, 2), ca: c.orange, b: R(10, 33, 10, 3.5, 1.75) + R(28, 33, 10, 3.5, 1.75), cb: c.bleuMoyen,
      t: R(5, 15, 38, 6, 2) + 'M8 21v10h32V21' + R(10, 33, 10, 3.5, 1.75) + R(28, 33, 10, 3.5, 1.75) + 'M15 36.5V43M33 36.5V43M24 4v5', s: 'M19.5 12.5h9l-2-3.5h-5z', cs: c.or }),
    kitchenette: P({ f: R(10, 19, 28, 22, 3), cf: c.peche, a: R(8, 14, 32, 5, 2), ca: c.alu,
      t: R(10, 19, 28, 22, 3) + R(8, 14, 32, 5, 2) + 'M10 26h28M19 30.5h10M18 41v2M30 41v2', s: 'M18 10c-1.2-1.2 1.2-2.4 0-3.6M30 10c-1.2-1.2 1.2-2.4 0-3.6', cs: c.orange }),
    sansCuisine: P({ f: 'M15 21h18v9a5 5 0 0 1-5 5h-8a5 5 0 0 1-5-5z', cf: '#EEF1F5', t: C(24, 24, 17) + 'M15 21h18v9a5 5 0 0 1-5 5h-8a5 5 0 0 1-5-5z', s: 'M12 36 36 12', cs: c.rouge }),
    placards: P({ f: R(8, 12, 32, 29, 3), cf: c.peche, a: R(6, 7, 36, 5, 2), ca: c.orange, t: R(8, 12, 32, 29, 3) + R(6, 7, 36, 5, 2) + 'M24 12v29M20.5 23v6M27.5 23v6' }),
    vide: P({ f: R(9, 9, 30, 30, 4), cf: '#EEF1F5', t: R(9, 9, 30, 30, 4), s: 'M18 18l12 12M30 18 18 30', cs: '#8D99AB' }),
    /* ---- Les choix : le chauffage ---- */
    maisonFeu: P({ f: maison, cf: c.corail, a: flamme(24, 38, .62), ca: c.orange, t: maison + flamme(24, 38, .62) }),
    immeubleFeu: P({ f: immeuble, cf: c.acier, a: flamme(24, 39.5, .42), ca: c.orange, t: immeuble + fenetresImm + flamme(24, 39.5, .42) }),
    gaz: P({ a: flamme(24, 43, 1), ca: '#5E9DEB', b: flammeIn(24, 43, 1), cb: '#C9E0FC', t: flamme(24, 43, 1) }),
    eclair: P({ a: 'M27 4 11 27h11l-3 17 18-24H26z', ca: c.jaune, t: 'M27 4 11 27h11l-3 17 18-24H26z' }),
    pac: P({ f: R(5, 11, 38, 26, 3), cf: '#E6EBF2', a: C(19, 24, 8.5), ca: c.ciel,
      t: R(5, 11, 38, 26, 3) + C(19, 24, 8.5) + C(19, 24, 1.6) + 'M19 22.4v-5.4M20.4 24.8l4.6 2.8M17.6 24.8 13 27.6M33 17h5M33 21h5M33 25h5M33 29h5M10 37v4M38 37v4' }),
    fioul: P({ a: 'M24 5C17 15 12.5 21.5 12.5 29a11.5 11.5 0 0 0 23 0C35.5 21.5 31 15 24 5z', ca: '#8A7354', t: 'M24 5C17 15 12.5 21.5 12.5 29a11.5 11.5 0 0 0 23 0C35.5 21.5 31 15 24 5z', s: 'M18.5 30a6 6 0 0 0 4.5 5', cs: '#E9DCC7' }),
    buches: P({ f: C(15, 33, 8) + C(33, 33, 8) + C(24, 18.5, 8), cf: c.bois, a: C(15, 33, 3.5) + C(33, 33, 3.5) + C(24, 18.5, 3.5), ca: '#F6DDBB', t: C(15, 33, 8) + C(33, 33, 8) + C(24, 18.5, 8) + C(15, 33, 3.5) + C(33, 33, 3.5) + C(24, 18.5, 3.5) }),
    usine: P({ f: 'M5 42V25l10 6v-6l10 6v-6l10 6V12h7v30z', cf: c.acier, t: 'M5 42V25l10 6v-6l10 6v-6l10 6V12h7v30zM11 36h3M21 36h3', s: 'M38.5 8c-1.4-1.4 1.4-2.8 0-4.2', cs: c.gris }),
    sol: P({ f: R(5, 33, 38, 8, 2), cf: c.bois, t: R(5, 33, 38, 8, 2) + 'M14 33v8M27 33v8M37 33v8', s: W(14, 28) + W(24, 28) + W(34, 28), cs: c.rouge }),
    convecteur: P({ f: R(6, 11, 36, 23, 3), cf: '#EEF1F5', b: C(36, 28.5, 1.8), cb: c.rouge, t: R(6, 11, 36, 23, 3) + 'M11 17h26M11 21h26M11 25h17M12 34v5M36 34v5' }),
    poele: P({ f: R(11, 19, 26, 20, 4), cf: '#5B6678', a: R(16, 24, 16, 10, 2), ca: c.jaune, b: flamme(24, 34, .42), cb: c.orange, t: R(11, 19, 26, 20, 4) + R(16, 24, 16, 10, 2) + 'M21 19V5h6v14M15 39v4M33 39v4' }),
    plafond: P({ f: R(5, 6, 38, 7, 2), cf: c.acier, t: R(5, 6, 38, 7, 2), s: WD(14, 18) + WD(24, 18) + WD(34, 18), cs: c.rouge }),
    air: P({ f: R(6, 7, 36, 15, 3), cf: c.acier, t: R(6, 7, 36, 15, 3) + 'M11 12h26M11 17h26', s: 'M14 27c3 2 3 6 0 9M24 27c3 2 3 6 0 9M34 27c3 2 3 6 0 9', cs: c.bleu }),
    /* ---- L'eau chaude ---- */
    ballon: P({ f: R(13, 5, 22, 34, 8), cf: c.acier, a: C(24, 16, 4), ca: c.rouge, t: R(13, 5, 22, 34, 8) + C(24, 16, 4) + 'M19 39v4M29 39v4M13 27h22' }),
    immeubleEau: P({ f: R(8, 5, 24, 37, 2), cf: c.acier, a: goutte(36, 24, 1.15), ca: c.bleu, t: R(8, 5, 24, 37, 2) + 'M13 10h4v4h-4zM23 10h4v4h-4zM13 18h4v4h-4zM23 18h4v4h-4zM13 26h4v4h-4zM17 42v-6h6v6' + goutte(36, 24, 1.15) }),
    /* ---- Le vitrage ---- */
    vitre1: P({ f: R(13, 6, 22, 36, 4), cf: '#E6EBF2', a: R(16, 9, 16, 30, 2), ca: '#F2F8FE', t: R(13, 6, 22, 36, 4), s: 'M24 9v30', cs: c.bleu }),
    vitre2: P({ f: R(13, 6, 22, 36, 4), cf: '#E6EBF2', a: R(16, 9, 16, 30, 2), ca: '#F2F8FE', t: R(13, 6, 22, 36, 4), s: 'M20 9v30M28 9v30', cs: c.bleu }),
    vitre3: P({ f: R(13, 6, 22, 36, 4), cf: '#E6EBF2', a: R(16, 9, 16, 30, 2), ca: '#F2F8FE', t: R(13, 6, 22, 36, 4), s: 'M19 9v30M24 9v30M29 9v30', cs: c.bleu }),
    /* ---- Les matières ---- */
    bois: P({ f: R(8, 8, 32, 32, 7), cf: c.bois, t: R(8, 8, 32, 32, 7), s: 'M15 13c3.5 3.5 3.5 8 0 11.5s-3.5 8 0 11.5M24 12c-2.5 4-2.5 8 0 12s2.5 8 0 12M33 13c3.5 3.5 3.5 8 0 11.5s-3.5 8 0 11.5', cs: c.boisFonce }),
    pvc: P({ f: R(8, 8, 32, 32, 7), cf: c.blanc, t: R(8, 8, 32, 32, 7), s: 'M15 33 33 15M21 36 36 21', cs: '#DCE2EA' }),
    alu: P({ f: R(8, 8, 32, 32, 7), cf: c.alu, t: R(8, 8, 32, 32, 7), s: 'M14 30 30 14M19 35 35 19', cs: '#EEF2F7' }),
    metal: P({ f: R(8, 8, 32, 32, 7), cf: c.metal, t: R(8, 8, 32, 32, 7), s: 'M14 30 30 14M19 35 35 19', cs: '#B7C0CC' }),
    boisAlu: P({ f: 'M24 8v32h-9a7 7 0 0 1-7-7V15a7 7 0 0 1 7-7z', cf: c.bois, a: 'M24 8h9a7 7 0 0 1 7 7v18a7 7 0 0 1-7 7h-9z', ca: c.alu, t: R(8, 8, 32, 32, 7) + 'M24 8v32', s: 'M14 14c3 3 3 7 0 10s-3 7 0 10', cs: c.boisFonce }),
    /* ---- Les volets ---- */
    voletElec: P({ f: lames, cf: '#E6EBF2', a: volet, ca: c.alu, b: 'M42 17l-6 9h4.5l-1.5 7 6-9h-4.5z', cb: c.jaune,
      t: volet + 'M7 14v28h28V14M7 19h28M7 24h28M7 29h28M7 33h28M21 33v9M42 17l-6 9h4.5l-1.5 7 6-9h-4.5z' }),
    voletManuel: P({ f: lames, cf: '#E6EBF2', a: volet, ca: c.alu, b: R(40.5, 30, 4, 6, 1.5), cb: c.orange,
      t: volet + 'M7 14v28h28V14M7 19h28M7 24h28M7 29h28M7 33h28M21 33v9M37 10h5.5v20' + R(40.5, 30, 4, 6, 1.5) }),
    battants: P({ f: R(16, 8, 16, 31, 1), cf: c.ciel, a: R(5, 8, 9, 31, 1.5) + R(34, 8, 9, 31, 1.5), ca: c.sauge,
      t: R(16, 8, 16, 31, 1) + 'M24 8v31M16 23h16' + R(5, 8, 9, 31, 1.5) + R(34, 8, 9, 31, 1.5) + 'M5 18.5h9M5 28.5h9M34 18.5h9M34 28.5h9' }),
    pliants: P({ f: 'M6 8l8 3v30l-8-3zM22 8l8 3v30l-8-3z', cf: c.sauge, a: 'M14 11l8-3v30l-8 3zM30 11l8-3v30l-8 3z', ca: '#C9E6D3',
      t: 'M6 8l8 3 8-3 8 3 8-3v30l-8 3-8-3-8 3-8-3zM14 11v30M22 8v30M30 11v30' }),
    persiennes: P({ f: R(9, 6, 14, 36, 1.5) + R(25, 6, 14, 36, 1.5), cf: c.sauge,
      t: R(9, 6, 14, 36, 1.5) + R(25, 6, 14, 36, 1.5) + 'M9 12h14M9 18h14M9 24h14M9 30h14M9 36h14M25 12h14M25 18h14M25 24h14M25 30h14M25 36h14' }),
    sansVolets: P({ f: R(11, 7, 26, 34, 2), cf: c.ciel, t: R(11, 7, 26, 34, 2) + 'M24 7v34M11 24h26M7 44h34', s: 'M15 15l5-5M15 20l3-3', cs: c.blanc }),
    /* ---- Ce qu'il a ---- */
    parquet: P({ f: R(6, 6, 36, 36, 4), cf: c.bois, t: R(6, 6, 36, 36, 4) + 'M6 18h36M6 30h36M18 6v12M32 18v12M14 30v12M30 30v12' }),
    moulures: P({ f: R(7, 7, 34, 34, 2), cf: c.orPale, t: R(7, 7, 34, 34, 2) + R(13, 13, 22, 22, 1) + 'M7 7l6 6M41 7l-6 6M7 41l6-6M41 41l-6-6', s: C(24, 24, 3), cs: c.or }),
    cheminee: P({ f: 'M6 12h36v6h-3v24H9V18H6z', cf: c.corail, a: R(15, 25, 18, 17, 0), ca: '#5B6678', b: flamme(24, 41, .5), cb: c.orange, t: 'M6 12h36v6h-3v24H9V18H6zM9 18h30M15 42V25h18v17' + flamme(24, 41, .5) }),
    soleil: P({ a: C(24, 24, 8), ca: c.jaune, t: C(24, 24, 8), s: 'M24 5v5M24 38v5M5 24h5M38 24h5M10.6 10.6l3.5 3.5M33.9 33.9l3.5 3.5M37.4 10.6l-3.5 3.5M14.1 33.9l-3.5 3.5', cs: c.orange }),
    /* ---- Les étapes ---- */
    personne: P({ f: C(24, 15, 7.5), cf: c.peche, a: 'M9 42c0-8.5 6.7-14 15-14s15 5.5 15 14z', ca: c.bleuMoyen, t: C(24, 15, 7.5) + 'M9 42c0-8.5 6.7-14 15-14s15 5.5 15 14z' }),
    maison: P({ f: 'M10 22h28v20H10z', cf: c.orPale, a: 'M5 24 24 7l19 17z', ca: '#EE9A7E', b: R(20, 30, 8, 12, 1), cb: c.bois, c: R(29.5, 27, 6, 6, 1), cc: c.ciel, t: 'M10 22v20h28V22M5 24 24 7l19 17zM33 15V9h4v9.5' + R(20, 30, 8, 12, 1) + R(29.5, 27, 6, 6, 1) }),
    arbre: P({ a: 'M14 31a7 7 0 0 1-3.5-13A12 12 0 0 1 33.5 14a7.5 7.5 0 0 1 4.5 13.5A6.5 6.5 0 0 1 33 31z', ca: '#9AD3A6', b: R(21.5, 30, 5, 12, 2), cb: c.bois, t: 'M14 31a7 7 0 0 1-3.5-13A12 12 0 0 1 33.5 14a7.5 7.5 0 0 1 4.5 13.5A6.5 6.5 0 0 1 33 31zM21.5 31v11M26.5 31v11M8 42h32', s: 'M17 15a7 7 0 0 1 5-4', cs: '#E8F6EA' }),
    plan: P({ f: R(6, 6, 36, 36, 3), cf: '#F6F1E6', a: R(6, 6, 18, 16, 0), ca: c.ciel, b: R(26, 24, 16, 18, 0), cb: c.vert, t: R(6, 6, 36, 36, 3) + 'M6 22h12M24 22h18M24 6v10M24 24v18', s: 'M18 22a6 6 0 0 1 6-6M24 30a6 6 0 0 1-6-6', cs: c.boisFonce }),
    dpe: P({ f: R(7, 8, 18, 8, 2.5), cf: '#4FB06B', a: R(7, 20, 26, 8, 2.5), ca: '#F2D34B', b: R(7, 32, 34, 8, 2.5), cb: '#EE7A55', t: R(7, 8, 18, 8, 2.5) + R(7, 20, 26, 8, 2.5) + R(7, 32, 34, 8, 2.5) }),
    immeuble: P({ f: R(9, 5, 30, 38, 2), cf: c.acier, a: 'M13 10h5v5h-5zM21.5 10h5v5h-5zM30 10h5v5h-5zM13 18h5v5h-5zM21.5 18h5v5h-5zM30 18h5v5h-5zM13 26h5v5h-5zM30 26h5v5h-5z', ca: c.ciel, b: R(20, 33, 8, 10, 1), cb: c.bois, t: R(9, 5, 30, 38, 2) + 'M13 10h5v5h-5zM21.5 10h5v5h-5zM30 10h5v5h-5zM13 18h5v5h-5zM21.5 18h5v5h-5zM30 18h5v5h-5zM13 26h5v5h-5zM30 26h5v5h-5z' + R(20, 33, 8, 10, 1) }),
    appart: P({ f: R(9, 5, 30, 38, 2), cf: c.acier, a: 'M13 10h5v5h-5zM21.5 10h5v5h-5zM30 10h5v5h-5zM13 18h5v5h-5zM30 18h5v5h-5zM13 26h5v5h-5zM21.5 26h5v5h-5zM30 26h5v5h-5z', ca: c.ciel, b: 'M21.5 18h5v5h-5z', cb: c.jaune, c: R(20, 33, 8, 10, 1), cc: c.bois, t: R(9, 5, 30, 38, 2) + 'M13 10h5v5h-5zM21.5 10h5v5h-5zM30 10h5v5h-5zM13 18h5v5h-5zM21.5 18h5v5h-5zM30 18h5v5h-5zM13 26h5v5h-5zM21.5 26h5v5h-5zM30 26h5v5h-5z' + R(20, 33, 8, 10, 1) }),
    loupe: P({ a: C(20, 20, 12), ca: c.ciel, b: 'M28 31.5l3.5-3.5 10 10a2.5 2.5 0 0 1-3.5 3.5z', cb: c.bois, t: C(20, 20, 12) + 'M28 31.5l3.5-3.5 10 10a2.5 2.5 0 0 1-3.5 3.5zM29 29l-1.5-1.5', s: 'M13 17a8 8 0 0 1 5-5', cs: c.blanc }),
    etiquette: P({ f: 'M7 23V10a3 3 0 0 1 3-3h13l19 19-16 16z', cf: c.or, b: C(14.5, 14.5, 3), cb: c.blanc, t: 'M7 23V10a3 3 0 0 1 3-3h13l19 19-16 16z' + C(14.5, 14.5, 3), s: 'M30.5 22.5a4.6 4.6 0 1 0 0 7.2M22.5 25h6M22.5 28h6', cs: '#7A5A14' }),
    cle: P({ f: C(15, 17, 9), cf: c.or, b: C(15, 17, 3.2), cb: c.blanc, a: 'M20.5 24.5l3-3 17.5 17.5-3 3z', ca: c.or, t: C(15, 17, 9) + C(15, 17, 3.2) + 'M20.5 24.5l3-3 17.5 17.5-3 3zM31 35l3-3M35 39l3-3' }),
    megaphone: P({ a: 'M8 19h7l17-10v30L15 29H8a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z', ca: '#F28B6B', b: 'M15 29l3 11h5l-2-11z', cb: c.peche, t: 'M8 19h7l17-10v30L15 29H8a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM15 19v10M15 29l3 11h5l-2-11', s: 'M37 18c2 2.5 2 9.5 0 12M41 14c4 4.5 4 15.5 0 20', cs: c.orange }),
    appareil: P({ f: R(5, 13, 38, 27, 5), cf: c.acier, a: C(24, 27, 8.5), ca: c.ciel, b: C(24, 27, 4), cb: c.bleu, c: 'M17 13l3-5h8l3 5z', cc: '#C3CDD9', t: R(5, 13, 38, 27, 5) + C(24, 27, 8.5) + C(24, 27, 4) + 'M17 13l3-5h8l3 5M35 18h3', s: 'M20 24a4.5 4.5 0 0 1 3-2.5', cs: c.blanc }),
    /* ---- Les parties ---- */
    cartons: P({ f: R(5, 22, 20, 20, 1.5), cf: '#EBC89A', a: R(21, 12, 22, 30, 1.5), ca: c.bois, t: R(5, 22, 20, 20, 1.5) + R(21, 12, 22, 30, 1.5) + 'M15 22v7M32 12v8M11 35h8M27 35h10' }),
    pin: P({ a: 'M24 44S11 31.5 11 20.5a13 13 0 0 1 26 0C37 31.5 24 44 24 44z', ca: '#EE8268', b: C(24, 20, 5), cb: c.blanc, t: 'M24 44S11 31.5 11 20.5a13 13 0 0 1 26 0C37 31.5 24 44 24 44z' + C(24, 20, 5) }),
    metre: P({ f: C(18, 22, 13), cf: c.jaune, a: 'M24 31h19v7H24z', ca: c.orPale, b: C(18, 22, 4.5), cb: c.acier, t: C(18, 22, 13) + C(18, 22, 4.5) + 'M24 31h19v7H24zM28 31v3M32 31v3M36 31v3M40 31v3' }),
    carte: P({ f: 'M5 10l12-4 14 4 12-4v32l-12 4-14-4-12 4z', cf: '#DDF0E3', a: 'M17 6v32l14 4V10z', ca: '#C8E8D2', b: 'M33 26s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z', cb: '#EE8268', t: 'M5 10l12-4 14 4 12-4v32l-12 4-14-4-12 4zM17 6v32M31 10v32M33 26s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z', s: 'M9 30c3-3 5 1 8-2', cs: c.bleu }),
    pieces: P({ f: R(6, 32, 20, 6, 3) + R(6, 25, 20, 6, 3) + R(6, 18, 20, 6, 3), cf: c.or, a: C(32, 27, 11), ca: c.jaune, t: R(6, 32, 20, 6, 3) + R(6, 25, 20, 6, 3) + R(6, 18, 20, 6, 3) + C(32, 27, 11), s: 'M36.5 22.5a5.5 5.5 0 1 0 0 9M27 25.6h6.5M27 28.4h6.5', cs: '#7A5A14' }),
    facture: P({ f: papier, cf: c.blanc, a: pli, ca: c.acier, b: 'M27 22l-5 8h4l-1 6 5-8h-4z', cb: c.jaune, t: papier + pli + 'M16 14h8M16 19h6M27 22l-5 8h4l-1 6 5-8h-4z' }),
    doc: P({ f: papier, cf: c.blanc, a: pli, ca: c.acier, t: papier + pli + 'M16 18h16M16 23h16M16 28h16M16 33h10' }),
    cadenas: P({ a: R(11, 21, 26, 21, 4), ca: c.or, b: C(24, 30, 2.6) + 'M23 31.5h2l.8 5h-3.6z', cb: '#23324D', t: R(11, 21, 26, 21, 4) + 'M16 21v-6a8 8 0 0 1 16 0v6' }),
    jauge: P({ f: 'M6 34a18 18 0 0 1 36 0z', cf: c.orPale, a: 'M6 34a18 18 0 0 1 5.3-12.7L24 34z', ca: '#9FDBB8', b: 'M36.7 21.3A18 18 0 0 1 42 34H24z', cb: '#F5B7A6', t: 'M6 34a18 18 0 0 1 36 0zM24 34l8-11' + C(24, 34, 3) }),
    contrat: P({ f: 'M8 5h20l6 6v31H8z', cf: c.blanc, a: 'M30 36l11-11 3.5 3.5-11 11-5 1.5z', ca: c.or, t: 'M8 5h20l6 6v31H8zM28 5v6h6M13 15h14M13 20h14M13 25h10M30 36l11-11 3.5 3.5-11 11-5 1.5z', s: 'M13 34c2-2 3 1 5-1', cs: c.bleu }),
    telephone: P({ f: R(13, 4, 22, 40, 5), cf: c.lavande, a: R(16, 9, 16, 27, 2), ca: c.ciel, t: R(13, 4, 22, 40, 5) + R(16, 9, 16, 27, 2) + 'M22 40h4' }),
    /* ---- Oui, non, à moitié ---- */
    oui: P({ f: C(24, 24, 17), cf: c.vert, t: C(24, 24, 17), s: 'M16 24.5l5.5 5.5L32 19', cs: c.vertFonce }),
    non: P({ f: C(24, 24, 17), cf: '#EEF1F5', t: C(24, 24, 17), s: 'M18 18l12 12M30 18 18 30', cs: '#8D99AB' }),
    moitie: P({ f: C(24, 24, 17), cf: '#EEF1F5', a: 'M24 7a17 17 0 0 0 0 34z', ca: c.vert, t: C(24, 24, 17) + 'M24 7v34' }),
    points: P({ f: C(24, 24, 17), cf: '#EEF1F5', b: C(16, 24, 2.6) + C(24, 24, 2.6) + C(32, 24, 2.6), cb: '#23324D', t: C(24, 24, 17) }),
    /* ---- Le propriétaire ---- */
    couple: P({ f: C(14.5, 19, 5.5) + C(33.5, 17, 6), cf: c.peche, a: 'M4.5 41c0-6.5 4.3-10.5 10-10.5S24.5 34.5 24.5 41z', ca: c.bleuMoyen, b: 'M23.5 41c0-7 4.5-11.5 10-11.5S43.5 34 43.5 41z', cb: '#F2A38E', t: C(14.5, 19, 5.5) + C(33.5, 17, 6) + 'M4.5 41c0-6.5 4.3-10.5 10-10.5S24.5 34.5 24.5 41zM23.5 41c0-7 4.5-11.5 10-11.5S43.5 34 43.5 41z' }),
    groupe: P({ f: C(10, 23, 4.5) + C(24, 18, 5) + C(38, 23, 4.5), cf: c.peche, a: 'M3 41c0-5.5 3-9 7-9s7 3.5 7 9z', ca: c.bleuMoyen, b: 'M16 41c0-6.5 3.6-11 8-11s8 4.5 8 11z', cb: '#F2A38E', c: 'M31 41c0-5.5 3-9 7-9s7 3.5 7 9z', cc: c.sauge, t: C(10, 23, 4.5) + C(24, 18, 5) + C(38, 23, 4.5) + 'M3 41c0-5.5 3-9 7-9s7 3.5 7 9zM16 41c0-6.5 3.6-11 8-11s8 4.5 8 11zM31 41c0-5.5 3-9 7-9s7 3.5 7 9z' }),
    mallette: P({ f: R(5, 15, 38, 26, 4), cf: c.bois, a: R(5, 24, 38, 5, 0), ca: '#D49A62', b: R(20.5, 22, 7, 9, 1.5), cb: c.or, t: R(5, 15, 38, 26, 4) + 'M18 15v-4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M5 24h38M5 29h38' + R(20.5, 22, 7, 9, 1.5) }),
    plusGrand: P({ f: M(5, 24, 13, 15), cf: c.vert, a: M(20, 9, 23, 31), ca: '#9FDBB8', t: M(5, 24, 13, 15) + M(20, 9, 23, 31) + 'M28 40v-9h7v9', s: 'M6 18l8-8M9.5 10H14v4.5', cs: c.vertFonce }),
    plusPetit: P({ f: M(5, 9, 23, 31), cf: c.lavande, a: M(30, 24, 13, 15), ca: c.bleuMoyen, t: M(5, 9, 23, 31) + M(30, 24, 13, 15) + 'M13 40v-9h7v9', s: 'M33 10l8 8M41 13.5V18h-4.5', cs: '#2D5C8F' }),
    valise: P({ f: R(7, 14, 34, 27, 5), cf: '#F5B7A6', a: R(15, 14, 4, 27, 0) + R(29, 14, 4, 27, 0), ca: '#E8907A', b: C(24, 27, 3), cb: c.jaune, t: R(7, 14, 34, 27, 5) + 'M18 14v-4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M15 14v27M19 14v27M29 14v27M33 14v27M14 41v2.5M34 41v2.5' }),
    succession: P({ f: papier, cf: c.blanc, a: pli, ca: c.acier, b: C(30, 34, 5), cb: '#E2665A', t: papier + pli + 'M16 17h14M16 22h14M16 27h8' + C(30, 34, 5), s: 'M27 38.5l-2 5.5M33 38.5l2 5.5', cs: '#E2665A' }),
    separation: P({ a: coeurP, ca: '#F5A497', t: coeurP, s: 'M24 15l-3.5 7.5 5 4-4 6.5 2.5 8', cs: c.blanc }),
    courbe: P({ f: R(6, 6, 36, 36, 5), cf: '#EEF1F5', a: R(11, 29, 6, 8, 1) + R(21, 23, 6, 14, 1) + R(31, 17, 6, 20, 1), ca: '#9FDBB8', t: R(6, 6, 36, 36, 5) + R(11, 29, 6, 8, 1) + R(21, 23, 6, 14, 1) + R(31, 17, 6, 20, 1), s: 'M10 23l9-6 8 3 11-9M32 11h6v6', cs: c.vertFonce }),
    cal3: P({ f: R(7, 9, 34, 32, 4), cf: c.blanc, a: 'M11 9h26a4 4 0 0 1 4 4v5H7v-5a4 4 0 0 1 4-4z', ca: '#EE8268', b: R(12, 23, 6, 5, 1.2) + R(21, 23, 6, 5, 1.2) + R(30, 23, 6, 5, 1.2), cb: c.or, t: R(7, 9, 34, 32, 4) + 'M7 18h34M16 5v8M32 5v8' + R(12, 23, 6, 5, 1.2) + R(21, 23, 6, 5, 1.2) + R(30, 23, 6, 5, 1.2) + R(12, 31, 6, 5, 1.2) + R(21, 31, 6, 5, 1.2) + R(30, 31, 6, 5, 1.2) }),
    cal6: P({ f: R(7, 9, 34, 32, 4), cf: c.blanc, a: 'M11 9h26a4 4 0 0 1 4 4v5H7v-5a4 4 0 0 1 4-4z', ca: '#EE8268', b: R(12, 23, 6, 5, 1.2) + R(21, 23, 6, 5, 1.2) + R(30, 23, 6, 5, 1.2) + R(12, 31, 6, 5, 1.2) + R(21, 31, 6, 5, 1.2) + R(30, 31, 6, 5, 1.2), cb: c.or, t: R(7, 9, 34, 32, 4) + 'M7 18h34M16 5v8M32 5v8' + R(12, 23, 6, 5, 1.2) + R(21, 23, 6, 5, 1.2) + R(30, 23, 6, 5, 1.2) + R(12, 31, 6, 5, 1.2) + R(21, 31, 6, 5, 1.2) + R(30, 31, 6, 5, 1.2) }),
    sablier: P({ f: 'M15 6h18c0 8-6 12-9 18 3 6 9 10 9 18H15c0-8 6-12 9-18-3-6-9-10-9-18z', cf: c.ciel, a: 'M18 39h12c-1-4.5-4-6.5-6-8.5-2 2-5 4-6 8.5zM19 12h10c-1 3-3 4.5-5 6.5-2-2-4-3.5-5-6.5z', ca: c.jaune, t: 'M15 6h18c0 8-6 12-9 18 3 6 9 10 9 18H15c0-8 6-12 9-18-3-6-9-10-9-18zM11 6h26M11 42h26' }),
    bulles: P({ f: 'M19 7h19a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5h-2v6l-6-6H19a5 5 0 0 1-5-5v-9a5 5 0 0 1 5-5z', cf: c.ciel, a: 'M10 18h16a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H17l-6 6v-6h-1a5 5 0 0 1-5-5v-8a5 5 0 0 1 5-5z', ca: c.orPale, t: 'M19 7h19a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5h-2v6l-6-6M10 18h16a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H17l-6 6v-6h-1a5 5 0 0 1-5-5v-8a5 5 0 0 1 5-5z', s: 'M12 27h.1M18 27h.1M24 27h.1', cs: '#23324D' }),
    ecran: P({ f: R(9, 8, 30, 22, 3), cf: '#E6EBF2', a: R(12, 11, 24, 16, 1.5), ca: c.ciel, b: 'M19 25v-5.5l5-4 5 4V25z', cb: c.orPale, c: 'M5 34h38l-3 5H8z', cc: c.acier, t: R(9, 8, 30, 22, 3) + R(12, 11, 24, 16, 1.5) + 'M19 25v-5.5l5-4 5 4V25zM5 34h38l-3 5H8zM9 30v4M39 30v4' }),
    enveloppe: P({ f: R(6, 11, 36, 26, 3), cf: c.orPale, b: R(33, 14, 6, 7, 1), cb: '#EE8268', t: R(6, 11, 36, 26, 3) + 'M7 13l17 13 17-13' + R(33, 14, 6, 7, 1) }),
    globe: P({ f: C(24, 24, 17), cf: c.ciel, a: 'M14 13c4-1 7 1 6 5s-4 4-3 7 4 4 2 8-6 1-8-4-1-14 3-16zM30 9c-1 3 0 6 3 7s5 4 4 8-3 6-1 9', ca: '#9FDBB8', t: C(24, 24, 17) + 'M7 24h34M24 7c-6 5-6 29 0 34M24 7c6 5 6 29 0 34' }),
    etoile5: P({ a: star(24, 25, 18), ca: c.jaune, t: star(24, 25, 18) }),
    /* ---- Le bien ---- */
    duplex: P({ f: R(7, 7, 34, 35, 3), cf: c.orPale, a: R(28, 12, 8, 8, 1) + R(28, 30, 8, 7, 1), ca: c.ciel, t: R(7, 7, 34, 35, 3) + 'M7 25h20' + R(28, 12, 8, 8, 1) + R(28, 30, 8, 7, 1), s: 'M11 42v-4h4v-4h4v-4h4v-5h4', cs: c.boisFonce }),
    terrain: P({ f: 'M4 31c8-4 14-4 20-1s12 3 20-1v13H4z', cf: '#BFE6CB', a: C(33, 16, 7.5), ca: '#9AD3A6', b: R(31.5, 22, 3, 9, 1), cb: c.bois, t: 'M4 31c8-4 14-4 20-1s12 3 20-1M4 42h40' + C(33, 16, 7.5) + 'M33 23.5v7M8 32v-9M14 30.5v-9M7 25h8M7 28h8' }),
    vitrine: P({ f: R(8, 21, 32, 21, 0), cf: c.blanc, a: 'M6 14h36l-3 7H9z', ca: '#EE8268', b: R(12, 25, 13, 13, 1), cb: c.ciel, c: R(29, 25, 7, 17, 1), cc: c.bois, t: 'M8 21v21h32V21M6 14h36l-3 7H9zM6 14V8h36v6' + R(12, 25, 13, 13, 1) + R(29, 25, 7, 17, 1) + 'M4 42h40', s: 'M15 14l-1 7M24 14v7M33 14l1 7', cs: c.blanc }),
    parking: P({ eo: true, a: R(9, 6, 30, 36, 7), ca: '#5E8FD8', b: 'M18 13h8.5a7.5 7.5 0 0 1 0 15H23v7.5h-5zM23 18v5h3.4a2.5 2.5 0 0 0 0-5z', cb: c.blanc, t: R(9, 6, 30, 36, 7) }),
    etoiles1: P({ a: star(24, 25, 16), ca: c.jaune, t: star(24, 25, 16) }),
    etoiles2: P({ a: star(15, 27, 11) + star(34, 21, 11), ca: c.jaune, t: star(15, 27, 11) + star(34, 21, 11) }),
    etoiles3: P({ a: star(10, 29, 8.5) + star(24, 19, 9.5) + star(38, 29, 8.5), ca: c.jaune, t: star(10, 29, 8.5) + star(24, 19, 9.5) + star(38, 29, 8.5) }),
    couronne: P({ f: 'M7 35 5 15l10 8 9-14 9 14 10-8-2 20z', cf: c.jaune, a: R(8, 35, 32, 7, 2), ca: c.or, b: C(24, 29, 2.8) + C(14, 30, 2) + C(34, 30, 2), cb: '#E2665A', t: 'M7 35 5 15l10 8 9-14 9 14 10-8-2 20z' + R(8, 35, 32, 7, 2) }),
    moyen: P({ f: M(8, 9, 32, 33), cf: '#FDE7C4', t: M(8, 9, 32, 33), s: 'M17 31h14', cs: c.orange }),
    maison1: P({ f: M(12, 8, 24, 34), cf: c.vert, a: R(21, 33, 6, 9, 1), ca: c.bois, t: M(12, 8, 24, 34) + R(21, 33, 6, 9, 1) + 'M6 42h36' }),
    maisons2: P({ f: M(3, 12, 21, 30), cf: c.vert, a: M(24, 12, 21, 30), ca: '#9FDBB8', b: R(10.5, 34, 6, 8, 1) + R(31.5, 34, 6, 8, 1), cb: c.bois, t: M(3, 12, 21, 30) + M(24, 12, 21, 30) + R(10.5, 34, 6, 8, 1) + R(31.5, 34, 6, 8, 1) }),
    maisons3: P({ f: M(2, 16, 15, 26) + M(31, 16, 15, 26), cf: c.vert, a: M(16.5, 16, 15, 26), ca: '#9FDBB8', b: R(7, 36, 5, 6, 1) + R(21.5, 36, 5, 6, 1) + R(36, 36, 5, 6, 1), cb: c.bois, t: M(2, 16, 15, 26) + M(16.5, 16, 15, 26) + M(31, 16, 15, 26) + R(7, 36, 5, 6, 1) + R(21.5, 36, 5, 6, 1) + R(36, 36, 5, 6, 1) }),
    egout: P({ f: C(24, 24, 17), cf: '#B7C0CC', a: C(24, 24, 12.5), ca: '#CBD3DE', t: C(24, 24, 17) + C(24, 24, 12.5) + 'M14 18h20M12 24h24M14 30h20' }),
    fosse: P({ f: R(4, 14, 40, 30, 0), cf: '#EADFCB', a: 'M10 28a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z', ca: c.acier, t: 'M10 28a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6zM17 13v9M31 13v9M14 12h6M28 12h6', s: 'M4 13h40', cs: c.vertFonce }),
    microStation: P({ f: R(4, 14, 40, 30, 0), cf: '#EADFCB', a: 'M10 28a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z', ca: c.ciel, b: C(18, 32, 2.2) + C(25, 34, 2.6) + C(31, 29, 2), cb: c.blanc, t: 'M10 28a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6zM17 13v9M31 13v9M14 12h6M28 12h6' + C(18, 32, 2.2) + C(25, 34, 2.6) + C(31, 29, 2), s: 'M4 13h40', cs: c.vertFonce }),
    ascenseur: P({ f: R(10, 5, 28, 38, 3), cf: c.acier, a: R(14, 15, 9.5, 28, 0) + R(24.5, 15, 9.5, 28, 0), ca: c.ciel, t: R(10, 5, 28, 38, 3) + 'M10 12h28' + R(14, 15, 9.5, 28, 0) + R(24.5, 15, 9.5, 28, 0), s: 'M18.5 10l2.5-2.5 2.5 2.5M26.5 7.5l2.5 2.5 2.5-2.5', cs: c.orange }),
    gardien: P({ f: C(24, 19, 7), cf: c.peche, a: 'M15.5 14.5a8.5 8.5 0 0 1 17 0zM13 14.5h22v3H13z', ca: '#34496E', b: 'M9 42c0-8 6.7-13 15-13s15 5 15 13z', cb: c.bleuMoyen, t: C(24, 19, 7) + 'M15.5 14.5a8.5 8.5 0 0 1 17 0M13 14.5h22v3H13zM9 42c0-8 6.7-13 15-13s15 5 15 13z', s: 'M29 35h4', cs: c.or }),
    digicode: P({ f: R(11, 4, 26, 40, 4), cf: c.acier, a: R(15, 9, 18, 6, 1.5), ca: '#9FDBB8', b: R(15, 19, 4.5, 4, 1) + R(21.75, 19, 4.5, 4, 1) + R(28.5, 19, 4.5, 4, 1) + R(15, 26, 4.5, 4, 1) + R(21.75, 26, 4.5, 4, 1) + R(28.5, 26, 4.5, 4, 1) + R(15, 33, 4.5, 4, 1) + R(21.75, 33, 4.5, 4, 1) + R(28.5, 33, 4.5, 4, 1), cb: c.blanc, t: R(11, 4, 26, 40, 4) + R(15, 9, 18, 6, 1.5) + R(15, 19, 4.5, 4, 1) + R(21.75, 19, 4.5, 4, 1) + R(28.5, 19, 4.5, 4, 1) + R(15, 26, 4.5, 4, 1) + R(21.75, 26, 4.5, 4, 1) + R(28.5, 26, 4.5, 4, 1) + R(15, 33, 4.5, 4, 1) + R(21.75, 33, 4.5, 4, 1) + R(28.5, 33, 4.5, 4, 1) }),
    interphone: P({ f: R(12, 4, 24, 40, 5), cf: c.acier, a: R(16, 9, 16, 12, 2), ca: '#C3CDD9', b: R(16, 26, 16, 5, 1.5) + R(16, 34, 16, 5, 1.5), cb: c.blanc, t: R(12, 4, 24, 40, 5) + R(16, 9, 16, 12, 2) + 'M19 13h10M19 17h10' + R(16, 26, 16, 5, 1.5) + R(16, 34, 16, 5, 1.5), s: 'M29 28.5h.1M29 36.5h.1', cs: c.vertFonce }),
    velo: P({ f: C(12, 31, 8) + C(36, 31, 8), cf: '#EEF1F5', t: C(12, 31, 8) + C(36, 31, 8), s: 'M12 31l7-12h11l6 12M19 19l7 12h-14M26 31l5-12M17 14h5M30 19l-1-6h4', cs: '#E2665A' }),
    wifi: P({ f: C(24, 26, 19), cf: '#EEF4FB', b: C(24, 36, 3), cb: '#23324D', t: 'M9 22a21 21 0 0 1 30 0M14 27.5a14 14 0 0 1 20 0M19 32.5a7 7 0 0 1 10 0' }),
    /* ---- L'extérieur ---- */
    balcon: P({ f: R(14, 5, 20, 26, 1), cf: c.ciel, a: R(4, 40, 40, 4, 1), ca: c.acier, b: C(9, 26, 4.5), cb: '#9AD3A6', t: R(14, 5, 20, 26, 1) + 'M24 5v26M6 30h36M9 30v10M15 30v10M21 30v10M27 30v10M33 30v10M39 30v10' + R(4, 40, 40, 4, 1) + C(9, 26, 4.5) }),
    parasol: P({ a: 'M6 22a18 13 0 0 1 36 0c-3 3-6 3-9 0-3 3-6 3-9 0-3 3-6 3-9 0-3 3-6 3-9 0z', ca: '#EE8268', b: R(13, 32, 22, 4, 2), cb: c.bois, t: 'M6 22a18 13 0 0 1 36 0c-3 3-6 3-9 0-3 3-6 3-9 0-3 3-6 3-9 0-3 3-6 3-9 0zM24 9v24' + R(13, 32, 22, 4, 2) + 'M16 36v6M32 36v6', s: 'M15 11c2 3 2 7 0 11M33 11c-2 3-2 7 0 11', cs: c.blanc }),
    loggia: P({ f: R(5, 5, 38, 38, 2), cf: c.acier, a: 'M14 43V22a10 10 0 0 1 20 0v21z', ca: '#C9D7E8', t: R(5, 5, 38, 38, 2) + 'M14 43V22a10 10 0 0 1 20 0v21M14 34h20M19 34v9M24 34v9M29 34v9' }),
    cave: P({ a: 'M28 43V27c0-4 3-5 3-9v-9h4v9c0 4 3 5 3 9v16z', ca: '#6E9157', b: 'M11 43V26c0-4 3-5 3-9v-10h4v10c0 4 3 5 3 9v17z', cb: '#9B4456', c: R(12.5, 30, 7, 7, 1) + R(29.5, 31, 7, 6, 1), cc: c.orPale, t: 'M28 43V27c0-4 3-5 3-9v-9h4v9c0 4 3 5 3 9v16zM11 43V26c0-4 3-5 3-9v-10h4v10c0 4 3 5 3 9v17z' + R(12.5, 30, 7, 7, 1) + R(29.5, 31, 7, 6, 1) }),
    box: P({ f: R(6, 9, 36, 33, 3), cf: c.acier, a: R(11, 16, 26, 26, 0), ca: '#C3CDD9', t: R(6, 9, 36, 33, 3) + 'M11 42V16h26v26M11 21h26M11 26h26M11 31h26M11 36h26' }),
    voiture: P({ a: 'M6 32v-5l4-9a4 4 0 0 1 3.7-2.5h20.6a4 4 0 0 1 3.7 2.5l4 9v5a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z', ca: c.bleu, f: 'M12.5 25l3-7h17l3 7z', cf: c.ciel, b: C(14, 35, 4) + C(34, 35, 4), cb: '#23324D', c: R(7.5, 27.5, 4, 2.5, 1) + R(36.5, 27.5, 4, 2.5, 1), cc: c.jaune, t: 'M6 32v-5l4-9a4 4 0 0 1 3.7-2.5h20.6a4 4 0 0 1 3.7 2.5l4 9v5a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3zM12.5 25l3-7h17l3 7z' }),
    piscine: P({ f: R(5, 19, 38, 22, 5), cf: '#86C8F1', t: R(5, 19, 38, 22, 5) + 'M32 6v17M39 6v17M32 11h7M32 16h7', s: 'M10 27c2.5-2 5-2 7.5 0s5 2 7.5 0 5-2 7.5 0M10 33c2.5-2 5-2 7.5 0s5 2 7.5 0 5-2 7.5 0', cs: c.blanc }),
    veranda: P({ f: R(4, 10, 12, 32, 0), cf: c.orPale, a: 'M16 19l27-7v30H16z', ca: c.ciel, t: 'M4 42V10h12v32M16 19l27-7v30H16M25 17v25M34 14.5V42M16 31h27M2 42h44' }),
    grenier: P({ f: R(9, 30, 30, 12, 0), cf: c.orPale, a: 'M4 31 24 8l20 23z', ca: '#EE9A7E', b: C(24, 22, 4.5), cb: c.ciel, t: 'M9 31v11h30V31M4 31 24 8l20 23z' + C(24, 22, 4.5) + 'M24 17.5v9M19.5 22h9' }),
    escalierBas: P({ f: R(5, 5, 38, 38, 6), cf: '#EEF1F5', a: 'M9 15h8v7h7v7h7v7h8v5H9z', ca: c.acier, t: R(5, 5, 38, 38, 6) + 'M9 15h8v7h7v7h7v7h8', s: 'M34 9v14M29 18l5 5 5-5', cs: '#2D5C8F' }),
    abri: P({ a: 'M3 14h42v5H3z', ca: '#C3CDD9', b: 'M11 37v-4l3-6.5a3 3 0 0 1 2.7-1.8h14.6a3 3 0 0 1 2.7 1.8l3 6.5v4a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2z', cb: c.bleu, c: C(17, 39.5, 3) + C(31, 39.5, 3), cc: '#23324D', t: 'M3 14h42v5H3zM7 19v24M41 19v24M11 37v-4l3-6.5a3 3 0 0 1 2.7-1.8h14.6a3 3 0 0 1 2.7 1.8l3 6.5v4a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2zM15.5 31l2-4.3h12.9l2 4.3z' }),
    dirN: P({ ...boussole, a: aiguille(0), ca: '#EE8268', b: C(24, 24, 2.2), cb: '#23324D', t: boussole.t + aiguille(0) }),
    dirNE: P({ ...boussole, a: aiguille(45), ca: '#EE8268', b: C(24, 24, 2.2), cb: '#23324D', t: boussole.t + aiguille(45) }),
    dirE: P({ ...boussole, a: aiguille(90), ca: '#EE8268', b: C(24, 24, 2.2), cb: '#23324D', t: boussole.t + aiguille(90) }),
    dirSE: P({ ...boussole, a: aiguille(135), ca: '#EE8268', b: C(24, 24, 2.2), cb: '#23324D', t: boussole.t + aiguille(135) }),
    dirS: P({ ...boussole, a: aiguille(180), ca: '#EE8268', b: C(24, 24, 2.2), cb: '#23324D', t: boussole.t + aiguille(180) }),
    dirSO: P({ ...boussole, a: aiguille(225), ca: '#EE8268', b: C(24, 24, 2.2), cb: '#23324D', t: boussole.t + aiguille(225) }),
    dirO: P({ ...boussole, a: aiguille(270), ca: '#EE8268', b: C(24, 24, 2.2), cb: '#23324D', t: boussole.t + aiguille(270) }),
    dirNO: P({ ...boussole, a: aiguille(315), ca: '#EE8268', b: C(24, 24, 2.2), cb: '#23324D', t: boussole.t + aiguille(315) }),
    traversant: P({ f: R(10, 12, 28, 26, 2), cf: c.orPale, a: R(10, 19, 4, 12, 0) + R(34, 19, 4, 12, 0), ca: c.ciel, t: R(10, 12, 28, 26, 2), s: 'M5 25h38M37 20l5 5-5 5M11 20l-5 5 5 5', cs: '#2D5C8F' }),
    horizon: P({ f: 'M4 34c6-6 12-8 18-5s12 3 22-5v18H4z', cf: '#9FDBB8', a: C(31, 18, 6.5), ca: c.jaune, t: 'M4 34c6-6 12-8 18-5s12 3 22-5M4 42h40' + C(31, 18, 6.5), s: 'M31 6v2.5M41 10l-2 2M43 19h-2.5M21 10l2 2', cs: c.orange }),
    cour: P({ f: 'M4 8h11v34H4zM33 8h11v34H33z', cf: c.acier, a: R(15, 17, 18, 25, 0), ca: '#C9D7E8', b: C(24, 36, 4), cb: '#9AD3A6', t: 'M4 8h11v34H4zM33 8h11v34H33zM15 42V17h18v25M8 13h3M8 19h3M8 25h3M37 13h3M37 19h3M37 25h3M20 22h3M25 22h3' + C(24, 36, 4) }),
    rue: P({ f: R(4, 33, 40, 9, 0), cf: '#B7C0CC', a: R(6, 11, 11, 22, 0) + R(19, 17, 10, 16, 0) + R(31, 8, 11, 25, 0), ca: c.acier, t: R(4, 33, 40, 9, 0) + R(6, 11, 11, 22, 0) + R(19, 17, 10, 16, 0) + R(31, 8, 11, 25, 0) + 'M9 16h5M9 22h5M22 22h4M34 13h5M34 19h5M34 25h5', s: 'M8 37.5h5M18 37.5h5M28 37.5h5M38 37.5h4', cs: c.blanc }),
    monument: P({ f: R(9, 38, 30, 5, 1) + R(11, 22, 26, 4, 1), cf: c.acier, a: 'M14 22a10 10 0 0 1 20 0z', ca: c.orPale, t: R(9, 38, 30, 5, 1) + R(11, 22, 26, 4, 1) + 'M14 22a10 10 0 0 1 20 0M14.5 26v12M19.5 26v12M24 26v12M28.5 26v12M33.5 26v12M24 12V6' }),
    visLoin: P({ f: 'M4 36c8-3 16-3 24 0s12 2 16 0v6H4z', cf: '#9FDBB8', a: R(31, 22, 9, 14, 1), ca: c.acier, b: C(13, 26, 5.5), cb: '#9AD3A6', t: R(31, 22, 9, 14, 1) + 'M34 26h3M34 30h3M4 42h40' + C(13, 26, 5.5) + 'M13 31.5V38' }),
    visDirect: P({ f: R(4, 6, 15, 37, 1) + R(29, 6, 15, 37, 1), cf: c.acier, a: 'M14 11h5v5h-5zM14 20h5v5h-5zM14 29h5v5h-5zM29 11h5v5h-5zM29 20h5v5h-5zM29 29h5v5h-5z', ca: c.ciel, t: R(4, 6, 15, 37, 1) + R(29, 6, 15, 37, 1) + 'M14 11h5v5h-5zM14 20h5v5h-5zM14 29h5v5h-5zM29 11h5v5h-5zM29 20h5v5h-5zM29 29h5v5h-5z', s: 'M21.5 22.5h5', cs: '#EE8268' }),
    docVide: P({ f: papier, cf: c.blanc, a: pli, ca: c.acier, t: papier + pli }),
    /* ---- Prix, mandat, occupation ---- */
    pourcent: P({ f: C(24, 24, 17), cf: c.orPale, t: C(24, 24, 17) + 'M16 32l16-16' + C(17, 17, 3.2) + C(31, 31, 3.2) }),
    euroPiece: P({ f: C(24, 24, 17), cf: c.jaune, a: C(24, 24, 12.5), ca: c.or, t: C(24, 24, 17) + C(24, 24, 12.5), s: 'M29 18.5a7 7 0 1 0 0 11M16.5 22.5h8.5M16.5 26h8.5', cs: '#7A5A14' }),
    docs2: P({ f: 'M15 3h17l7 7v27H15z', cf: '#E6EBF2', a: 'M9 10h17l7 7v27H9z', ca: c.blanc, t: 'M15 3h17l7 7v27h-6M9 10h17l7 7v27H9zM26 10v7h7M14 24h14M14 29h14M14 34h9' }),
    medaille: P({ f: 'M16 27l-5 15 6-2 3 6 5-14zM32 27l5 15-6-2-3 6-5-14z', cf: '#E2665A', a: C(24, 19, 12), ca: c.or, b: star(24, 19, 7), cb: c.jaune, t: 'M16 27l-5 15 6-2 3 6 5-14M32 27l5 15-6-2-3 6-5-14' + C(24, 19, 12) + star(24, 19, 7) }),
    porteOuverte: P({ f: R(11, 5, 26, 38, 1), cf: '#E6EBF2', a: R(14, 8, 20, 35, 0), ca: '#FFF6DD', b: 'M14 8l11 4v34l-11-3z', cb: c.bois, t: R(11, 5, 26, 38, 1) + 'M14 43V8h20v35M14 8l11 4v34l-11-3' + C(22, 28, 1.3) }),
    occupe: P({ f: maison, cf: c.orPale, a: 'M16 41c0-4.5 3.6-8 8-8s8 3.5 8 8z', ca: c.bleuMoyen, b: C(24, 27, 4.2), cb: c.peche, t: maison + 'M16 41c0-4.5 3.6-8 8-8s8 3.5 8 8z' + C(24, 27, 4.2) }),
    bail: P({ f: papier, cf: c.blanc, a: pli, ca: c.acier, b: C(30, 32, 5), cb: c.or, t: papier + pli + 'M16 16h12M16 21h12M16 26h7' + C(30, 32, 5) + 'M33.5 35.5l6 6M37 39l2-2', s: '', cs: 'none' }),
    bouclier: P({ a: 'M24 5l15 6v11c0 10-6.5 17-15 21C15.5 39 9 32 9 22V11z', ca: c.bleuMoyen, t: 'M24 5l15 6v11c0 10-6.5 17-15 21C15.5 39 9 32 9 22V11z', s: 'M17 23.5l5 5 9-10', cs: c.blanc }),
    badge: P({ f: R(7, 11, 34, 26, 4), cf: c.lavande, a: R(11, 16, 10, 12, 1.5), ca: c.blanc, b: R(11, 31, 7, 3, 1), cb: c.or, t: R(7, 11, 34, 26, 4) + R(11, 16, 10, 12, 1.5) + 'M25 19h11M25 24h8', s: 'M14 21.5h.1', cs: '#23324D' }),
    gauche: P({ f: R(6, 6, 36, 36, 9), cf: '#EEF1F5', a: 'M10 24l12-10v6h16v8H22v6z', ca: c.bleu, t: R(6, 6, 36, 36, 9) + 'M10 24l12-10v6h16v8H22v6z' }),
    droite: P({ f: R(6, 6, 36, 36, 9), cf: '#EEF1F5', a: 'M38 24 26 14v6H10v8h16v6z', ca: c.bleu, t: R(6, 6, 36, 36, 9) + 'M38 24 26 14v6H10v8h16v6z' }),
    face: P({ f: R(6, 6, 36, 36, 9), cf: '#EEF1F5', a: 'M24 10l10 12h-6v16h-8V22h-6z', ca: c.bleu, t: R(6, 6, 36, 36, 9) + 'M24 10l10 12h-6v16h-8V22h-6z' }),
    escalier: P({ f: R(6, 6, 36, 36, 9), cf: '#EEF1F5', a: 'M10 38v-6h7v-6h7v-6h7v-6h7v24z', ca: c.orPale, t: R(6, 6, 36, 36, 9) + 'M10 38v-6h7v-6h7v-6h7v-6h7v24z' }),
    degat: P({ a: goutte(24, 5, 2.55), ca: c.bleu, t: goutte(24, 5, 2.55), s: 'M24 20l-3 6 4.5 3.5-3 6', cs: c.blanc }),
    robinetFroid: P({ f: 'M5 13h21a9 9 0 0 1 9 9v3h-7v-3a2 2 0 0 0-2-2H5z', cf: c.acier, a: R(11, 6, 12, 4, 2), ca: c.bleu, b: goutte(31.5, 30, 1), cb: c.bleu, t: 'M5 13h21a9 9 0 0 1 9 9v3h-7v-3a2 2 0 0 0-2-2H5zM5 10v13M17 10v3' + R(11, 6, 12, 4, 2) + goutte(31.5, 30, 1) }),
    lune: P({ a: 'M30 7a17 17 0 1 0 11 29A14 14 0 0 1 30 7z', ca: '#FBE3A0', b: star(36, 13, 3.5) + star(41, 23, 2.5), cb: c.jaune, t: 'M30 7a17 17 0 1 0 11 29A14 14 0 0 1 30 7z' }),
    dernierEtage: P({ f: R(12, 12, 24, 31, 1), cf: c.acier, a: R(12, 12, 24, 9, 1), ca: c.jaune, t: R(12, 12, 24, 31, 1) + 'M12 21h24M9 12 24 4l15 8M17 26h4M27 26h4M17 33h4M27 33h4' }),
    alarme: P({ a: 'M24 6a3 3 0 0 1 3 3v1.5c5 1.5 8 6 8 11v8l4 5H9l4-5v-8c0-5 3-9.5 8-11V9a3 3 0 0 1 3-3z', ca: c.jaune, b: C(24, 39.5, 3.5), cb: c.or, t: 'M24 6a3 3 0 0 1 3 3v1.5c5 1.5 8 6 8 11v8l4 5H9l4-5v-8c0-5 3-9.5 8-11V9a3 3 0 0 1 3-3z' + C(24, 39.5, 3.5), s: 'M6 14c1-3 3-5 5-6.5M42 14c-1-3-3-5-5-6.5', cs: '#E2665A' }),
    pmr: P({ a: R(6, 6, 36, 36, 8), ca: '#5E8FD8', b: C(23, 12.5, 3), cb: c.blanc, t: R(6, 6, 36, 36, 8), s: 'M23 17v10h8l3 8M17 25a8 8 0 1 0 11.5 9', cs: c.blanc }),
    solaire: P({ a: 'M5 31l8-17h29l-8 17z', ca: '#3E6FB0', b: C(9, 9, 4), cb: c.jaune, t: 'M5 31l8-17h29l-8 17zM20 31v10M30 31v10M15 41h20', s: 'M9 22.5h29M18.5 14l-4 17M28 14l-4 17', cs: c.blanc }),
  };
}
const DESSINS = fabriquer();
export const aUnDessin = (n: string | null | undefined): n is string => !!n && !!DESSINS[n];

/* Le dessin. Petit (moins de 30 px), le trait s'épaissit un peu pour rester lisible. */
export function Picto({ n, t = 40, className }: { n: string; t?: number; className?: string }) {
  const p = DESSINS[n];
  if (!p) return null;
  const e = t < 30 ? 2.6 : 2.2;
  const r = p.eo ? 'evenodd' : undefined;
  return (
    <svg className={className} width={t} height={t} viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {p.f && <path d={p.f} fill={p.cf} fillRule={r} />}
      {p.a && <path d={p.a} fill={p.ca} fillRule={r} />}
      {p.b && <path d={p.b} fill={p.cb} fillRule={r} />}
      {p.c && <path d={p.c} fill={p.cc} fillRule={r} />}
      {p.d && <path d={p.d} fill={p.cd} fillRule={r} />}
      {p.t && <path d={p.t} stroke={MARINE} strokeWidth={e} />}
      {p.s && <path d={p.s} stroke={p.cs} strokeWidth={e} />}
    </svg>
  );
}

/* Le dessin de chaque partie du formulaire (ETAPES_BIEN). */
export const PICTO_ETAPE: Record<string, string> = {
  proprio: 'personne', bien: 'maison', interieur: 'canape', exterieur: 'arbre', pieces: 'plan', energie: 'dpe',
  copro: 'immeuble', observations: 'loupe', prix: 'etiquette', pratique: 'cle', annonce: 'megaphone', photos: 'appareil',
};

/* Le dessin de chaque bloc d'une partie (les titres : « La cuisine »…). */
export const PICTO_BLOC: Record<string, string> = {
  't-projet': 'cartons', 't-adresse': 'pin', 't-surf': 'metre', 't-pieces': 'plan', 't-terrain': 'terrain', 't-imm': 'immeuble',
  't-constr': 'maison', 't-prox': 'carte', 't-etat': 'rouleau', 't-cuis': 'casserole', 't-chauf': 'radiateur', 't-fen': 'fenetreVolets',
  't-equip': 'etincelles', 't-vue': 'horizon', 't-copro': 'immeuble', 't-fin': 'pieces', 't-cout': 'facture', 't-obs-log': 'marteau',
  't-obs-copro': 'doc', 't-obs-notes': 'cadenas', 't-estim': 'jauge', 't-prix': 'etiquette', 't-mandat': 'contrat', 't-occup': 'porteOuverte',
  't-cles': 'cle', 't-acces': 'carte', 't-contact': 'telephone',
};

/* La pastille douce derrière le dessin d'une partie ou d'un bloc. */
const TEINTES: Record<string, string> = {
  personne: '#EEF2F8', maison: '#FBF4E6', canape: '#EEF3FB', arbre: '#ECF8F0', plan: '#F4F1EA', dpe: '#FFF6E5', immeuble: '#EEF3F8',
  loupe: '#F1EEFB', etiquette: '#FBF4E1', cle: '#FBF4E1', megaphone: '#FDEDEA', appareil: '#EEF0FB', cartons: '#FBF2E6', pin: '#FDEEEA',
  metre: '#FDF7E1', carte: '#ECF8F0', terrain: '#ECF8F0', rouleau: '#EAF7EF', casserole: '#FFF2E4', radiateur: '#FFEFE9',
  fenetreVolets: '#E9F4FD', etincelles: '#FDF5DF', horizon: '#ECF8F0', pieces: '#FDF7E1', facture: '#F4F6FA', marteau: '#F1F4F9',
  doc: '#F4F6FA', cadenas: '#FBF4E1', jauge: '#FBF4E1', contrat: '#F4F6FA', porteOuverte: '#FBF4E6', telephone: '#EEF3FB',
};
export const teinte = (n: string) => TEINTES[n] || '#F1F4F9';

/* Le dessin de chaque réponse, par question (sa clé) puis par valeur. Une
   question n'a ses vignettes dessinées que si TOUTES ses réponses en ont un :
   sinon, elles gardent le petit dessin au trait (ChampVignettes). */
const ETATS = { tres_bon: 'neuf', bon: 'pouce', moyen: 'moyen', a_refaire: 'rouleau' };
const MATIERES = { bois: 'bois', pvc: 'pvc', alu: 'alu', boisAlu: 'boisAlu', metal: 'metal' };
const CHOIX: Record<string, Record<string, string>> = {
  qui: { personne: 'personne', couple: 'couple', indivision: 'groupe', sci: 'mallette' },
  motif: { plusGrand: 'plusGrand', plusPetit: 'plusPetit', achat: 'cle', mutation: 'valise', succession: 'succession', separation: 'separation', investissement: 'courbe', autre: 'points' },
  delai: { vite: 'eclair', '3mois': 'cal3', '6mois': 'cal6', libre: 'sablier' },
  origine: { recommandation: 'bulles', client: 'etoile5', estimation: 'ecran', boitage: 'enveloppe', portail: 'globe', autre: 'points' },
  typeBien: { appartement: 'appart', maison: 'maison', duplex: 'duplex', studio: 'canape', loft: 'verriere', terrain: 'terrain', local: 'vitrine', parking: 'parking', immeuble: 'immeuble', autre: 'points' },
  constructible: { oui: 'oui', partiel: 'moitie', non: 'non' },
  assainissement: { collectif: 'egout', fosse: 'fosse', micro: 'microStation', aRefaire: 'marteau' },
  mitoyennete: { independante: 'maison1', un: 'maisons2', deux: 'maisons3' },
  standing: { standard: 'etoiles1', bon: 'etoiles2', haut: 'etoiles3', prestige: 'couronne' },
  etatCommuns: ETATS, etatExterieur: ETATS,
  immeuble: { ascenseur: 'ascenseur', gardien: 'gardien', digicode: 'digicode', interphone: 'interphone', velos: 'velo', fibre: 'wifi' },
  etat: { a_renover: 'marteau', travaux_legers: 'rouleau', bon_etat: 'pouce', refait_neuf: 'neuf' },
  cuisine: { independante: 'porte', semiOuverte: 'verriere', ouverte: 'bar', kitchenette: 'kitchenette', aucune: 'sansCuisine' },
  cuisineEquip: { equipee: 'four', amenagee: 'placards', non: 'vide' },
  chauffageMode: { individuel: 'maisonFeu', collectif: 'immeubleFeu' },
  chauffageEnergie: { gaz: 'gaz', electrique: 'eclair', pac: 'pac', fioul: 'fioul', bois: 'buches', urbain: 'usine' },
  chauffageEmetteurs: { radiateurs: 'radiateur', sol: 'sol', convecteurs: 'convecteur', poele: 'poele', plafond: 'plafond', air: 'air' },
  eauChaude: { individuelle: 'ballon', collective: 'immeubleEau' },
  vitrage: { simple: 'vitre1', double: 'vitre2', triple: 'vitre3' },
  menuiseries: MATIERES, voletsMateriau: MATIERES,
  volets: { electriques: 'voletElec', roulants: 'voletManuel', battants: 'battants', pliants: 'pliants', persiennes: 'persiennes', aucun: 'sansVolets' },
  equipements: {
    traversant: 'traversant', lumineux: 'soleil', calme: 'lune', dernierEtage: 'dernierEtage', parquet: 'parquet', moulures: 'moulures', cheminee: 'cheminee',
    placards: 'placards', doubleVitrage: 'vitre2', voletsElec: 'voletElec', clim: 'air', alarme: 'alarme', pmr: 'pmr', meuble: 'canape', solaire: 'solaire', sejourDouble: 'canape',
  },
  annexes: {
    balcon: 'balcon', terrasse: 'parasol', loggia: 'loggia', jardin: 'arbre', cave: 'cave', parking: 'parking', box: 'box', garage: 'voiture', piscine: 'piscine',
    veranda: 'veranda', grenier: 'grenier', sousSol: 'escalierBas',
  },
  stationnement: { sousSol: 'escalierBas', exterieur: 'parking', couvert: 'abri', ferme: 'box' },
  expo: { N: 'dirN', NE: 'dirNE', E: 'dirE', SE: 'dirSE', S: 'dirS', SO: 'dirSO', O: 'dirO', NO: 'dirNO', traversant: 'traversant' },
  vue: { degagee: 'horizon', jardin: 'arbre', cour: 'cour', rue: 'rue', monument: 'monument' },
  visAVis: { aucun: 'horizon', leger: 'visLoin', direct: 'visDirect' },
  dpeStatut: { fait: 'dpe', encours: 'sablier', vierge: 'docVide', non: 'non' },
  chargesInclus: { chauffage: 'radiateur', eauChaude: 'ballon', eauFroide: 'robinetFroid', gardien: 'gardien', ascenseur: 'ascenseur' },
  sinistre: { non: 'oui', oui: 'degat' },
  charge: { acquereur: 'cle', vendeur: 'maison' },
  honoMode: { taux: 'pourcent', forfait: 'euroPiece' },
  mandatType: { simple: 'doc', semi: 'docs2', exclusif: 'medaille' },
  occupation: { libre: 'porteOuverte', occupe: 'occupe', loue: 'bail' },
  cles: { agence: 'vitrine', vendeur: 'personne', gardien: 'gardien', autre: 'pin' },
  accesBas: { gardien: 'gardien', vigile: 'bouclier', interphone: 'interphone', digicode: 'digicode', badge: 'badge', libre: 'porteOuverte' },
  accesAscenseur: { gauche: 'gauche', droite: 'droite', face: 'face', aucun: 'escalier' },
};
/* Oui / Non (viabilisé, copropriété, procédure) : une coche verte, une croix grise. */
export function pictoChoix(cle: string, v: string): string | null {
  const n = CHOIX[cle]?.[v] || (v === 'oui' || v === 'non' ? v : null);
  return aUnDessin(n) ? n : null;
}
