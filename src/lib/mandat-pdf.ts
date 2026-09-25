/* ══ Le PDF du mandat signé, et son certificat ══════════════════════════════

   Deux fichiers sortent d'ici, au moment exact de la signature :

     1. le MANDAT SEUL — le texte de src/lib/mandat.ts, mis en page. C'est de
        lui qu'on prend l'empreinte SHA-256 : on le garde tel quel dans le
        dossier privé, pour pouvoir la recalculer un jour devant n'importe qui ;
     2. le MANDAT SIGNÉ — le même, suivi d'une dernière page : le certificat de
        signature, avec le tampon rond bleu marine (« 3 ter » validé par
        Alexandre), le déroulé minute par minute et les preuves techniques.
        C'est celui que reçoivent le client et Alexandre.

   L'habillage est celui d'Emilio : le bleu du logo, l'or en filet, le logo en
   tête de chaque page, une page de garde qui résume le mandat en quatre cases.
   Un document administratif, mais qu'on a plaisir à recevoir.

   Côté serveur à la signature (pdf-lib) ; côté navigateur pour l'aperçu
   « projet non signé » du CRM (chargé à la demande). Polices standard du PDF : aucune police à
   embarquer, mais elles ne connaissent que le jeu de caractères « WinAnsi »
   — d'où `propre()`, qui remplace ce qu'elles ne savent pas dessiner.
   ════════════════════════════════════════════════════════════════════════ */

import {
  PDFDocument, StandardFonts, rgb, degrees, LineCapStyle, LineJoinStyle, pushGraphicsState, popGraphicsState, setLineJoin,
  type PDFFont, type PDFPage, type PDFImage, type RGB,
} from 'pdf-lib';
import {
  AGENCE, SIGNATAIRE, ICONES, type Partie, type Bloc, type Fiche, type Icone, type Resume, dateLongue, heureParis, dateCourte,
} from './mandat';
import { LOGO_MARINE, LOGO_BLANC } from './mandat-logo';

const A4 = { l: 595.28, h: 841.89 };
const MARGE = { g: 58, d: 58, h: 92, b: 66 };
const LARGEUR = A4.l - MARGE.g - MARGE.d;

/* La palette Emilio */
const BLEU = rgb(27 / 255, 54 / 255, 93 / 255);          // #1b365d, le bleu du logo
const MARINE = rgb(26 / 255, 35 / 255, 50 / 255);        // #1a2332, le texte
const OR = rgb(201 / 255, 168 / 255, 76 / 255);          // #c9a84c
const OR_FONCE = rgb(160 / 255, 124 / 255, 40 / 255);    // l'or lisible en petit sur blanc
const GRIS = rgb(100 / 255, 116 / 255, 139 / 255);       // #64748b
const GRIS_CLAIR = rgb(152 / 255, 164 / 255, 182 / 255);
const FILET = rgb(227 / 255, 232 / 255, 240 / 255);      // #e3e8f0
const FOND = rgb(246 / 255, 248 / 255, 251 / 255);       // #f6f8fb
const BLEU_PALE = rgb(219 / 255, 227 / 255, 238 / 255);  // le texte doux sur le bleu
const ENCRE = rgb(31 / 255, 58 / 255, 107 / 255);        // #1f3a6b, le tampon
const VERT = rgb(22 / 255, 101 / 255, 52 / 255);
const VERT_FOND = rgb(240 / 255, 253 / 255, 244 / 255);
const VERT_TRAIT = rgb(187 / 255, 247 / 255, 208 / 255);
const BLANC = rgb(1, 1, 1);
const OR_PALE = rgb(250 / 255, 245 / 255, 230 / 255);  // le fond des pastilles d'icône
const OR_TRAIT = rgb(236 / 255, 222 / 255, 182 / 255);
const BLEU_FOND = rgb(238 / 255, 243 / 255, 249 / 255); // les encadrés
const BRIQUE = rgb(185 / 255, 28 / 255, 28 / 255);      // « non signé »
const BRIQUE_FOND = rgb(254 / 255, 242 / 255, 242 / 255);
const BRIQUE_TRAIT = rgb(252 / 255, 202 / 255, 202 / 255);

/* Les polices standard du PDF ne savent dessiner que le jeu WinAnsi : tout
   le latin-1, plus les guillemets courbes, le tiret long, l'euro, « œ »…
   Le reste (espace fine, étoile, coche) est remplacé plutôt que de faire
   échouer le document entier. */
const WINANSI_EN_PLUS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function propre(t: string): string {
  return String(t)
    .replace(/[   ]/g, ' ')
    .replace(/[‐‑]/g, '-')
    .replace(/[★✓✔]/g, '')
    .split('')
    .map(c => {
      const k = c.charCodeAt(0);
      if (c === '\n') return ' ';
      if ((k >= 32 && k <= 126) || (k >= 160 && k <= 255)) return c;
      return WINANSI_EN_PLUS.includes(c) ? c : '?';
    })
    .join('');
}

/* ⚠️ La largeur d'un mot se mesure lettre par lettre. widthOfTextAtSize
   applique le crénage (« AT », « T. »…), mais drawText, lui, ne l'applique
   pas : le mot dessiné est plus large que le mot mesuré, et le mot suivant
   vient se coller dessus (« MANDATAIREde »). */
const LARGEURS = new WeakMap<PDFFont, Map<string, number>>();
function lg(police: PDFFont, s: string, taille: number, espacement = 0): number {
  let m = LARGEURS.get(police);
  if (!m) { m = new Map(); LARGEURS.set(police, m); }
  let t = 0, n = 0;
  for (const c of s) {
    let w = m.get(c);
    if (w === undefined) { w = police.widthOfTextAtSize(c, 1); m.set(c, w); }
    t += w; n++;
  }
  return t * taille + espacement * Math.max(0, n - 1);
}

type Kit = { r: PDFFont; g: PDFFont; i: PDFFont; serif: PDFFont; serifI: PDFFont; logo: PDFImage; logoBlanc: PDFImage };

/* Du base64 aux octets, sans Buffer : ce fichier sert aussi dans le
   navigateur (l'aperçu du CRM). */
const octets = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

async function kit(doc: PDFDocument): Promise<Kit> {
  return {
    r: await doc.embedFont(StandardFonts.Helvetica),
    g: await doc.embedFont(StandardFonts.HelveticaBold),
    i: await doc.embedFont(StandardFonts.HelveticaOblique),
    serif: await doc.embedFont(StandardFonts.TimesRomanBold),
    serifI: await doc.embedFont(StandardFonts.TimesRomanItalic),
    logo: await doc.embedPng(octets(LOGO_MARINE)),
    logoBlanc: await doc.embedPng(octets(LOGO_BLANC)),
  };
}

/* Du texte espacé (les petites capitales d'étiquette), lettre par lettre. */
function espace(p: PDFPage, t: string, x: number, y: number, taille: number, police: PDFFont, couleur: RGB, esp: number) {
  let xx = x;
  for (const c of propre(t)) {
    p.drawText(c, { x: xx, y, size: taille, font: police, color: couleur });
    xx += lg(police, c, taille) + esp;
  }
}

/* ── Couper un texte en lignes (l'espace insécable ne coupe jamais) ── */
function couper(texte: string, police: PDFFont, taille: number, largeur: number): string[][] {
  const mots = propre(texte).split(' ').filter(m => m.length > 0);
  const lignes: string[][] = [];
  let courante: string[] = [];
  let l = 0;
  const esp = lg(police, ' ', taille);
  for (const m of mots) {
    const w = lg(police, m, taille);
    if (courante.length && l + esp + w > largeur) {
      lignes.push(courante); courante = [m]; l = w;
    } else {
      l = courante.length ? l + esp + w : w;
      courante.push(m);
    }
  }
  if (courante.length) lignes.push(courante);
  return lignes;
}

/* Un bloc de texte simple (non justifié) à une position donnée ; rend le y final. */
function texteLibre(p: PDFPage, t: string, x: number, y: number, largeur: number, taille: number, police: PDFFont, couleur: RGB, pas = taille * 1.35) {
  for (const m of couper(t, police, taille, largeur)) {
    p.drawText(m.join(' '), { x, y, size: taille, font: police, color: couleur });
    y -= pas;
  }
  return y;
}

/* ══ Les petits outils de dessin ════════════════════════════════════════ */

/* Un rectangle aux coins arrondis (x, y : le coin bas-gauche, comme pdf-lib). */
function rond(p: PDFPage, x: number, y: number, w: number, h: number, r: number,
  o: { color: RGB; borderColor?: RGB; borderWidth?: number }) {
  const k = 0.5523 * r;
  const d = `M ${r} 0 H ${w - r} C ${w - r + k} 0 ${w} ${r - k} ${w} ${r} V ${h - r} C ${w} ${h - r + k} ${w - r + k} ${h} ${w - r} ${h} `
    + `H ${r} C ${r - k} ${h} 0 ${h - r + k} 0 ${h - r} V ${r} C 0 ${r - k} ${r - k} 0 ${r} 0 Z`;
  p.drawSvgPath(d, { x, y: y + h, color: o.color, borderColor: o.borderColor, borderWidth: o.borderColor ? o.borderWidth ?? 0.7 : undefined });
}

/* Une icône de src/lib/mandat.ts (ICONES), au trait, bouts arrondis.
   x, yHaut : son coin haut-gauche. */
function icone(p: PDFPage, nom: Icone, x: number, yHaut: number, taille: number, couleur: RGB, trait = 1.8) {
  const s = taille / 24;
  p.pushOperators(pushGraphicsState(), setLineJoin(LineJoinStyle.Round));
  for (const d of ICONES[nom]) {
    p.drawSvgPath(d, { x, y: yHaut, scale: s, borderColor: couleur, borderWidth: trait / s, borderLineCap: LineCapStyle.Round });
  }
  p.pushOperators(popGraphicsState());
}

/* Une pastille « NON SIGNÉ » / « SIGNÉ ». Rend sa largeur. */
function pastille(p: PDFPage, k: Kit, texte: string, x: number, y: number, ton: 'rouge' | 'vert') {
  const t = propre(texte), taille = 7.2, esp = 1.2;
  const w = lg(k.g, t, taille, esp) + 18;
  rond(p, x, y, w, 16, 8, ton === 'rouge'
    ? { color: BRIQUE_FOND, borderColor: BRIQUE_TRAIT, borderWidth: 0.8 }
    : { color: VERT_FOND, borderColor: VERT_TRAIT, borderWidth: 0.8 });
  espace(p, t, x + 9, y + 5.2, taille, k.g, ton === 'rouge' ? BRIQUE : VERT, esp);
  return w;
}

/* Une ligne justifiée (la dernière d'un paragraphe ne l'est pas). */
function ligneJustifiee(p: PDFPage, mots: string[], x: number, y: number, largeur: number,
  police: PDFFont, taille: number, couleur: RGB, justifier: boolean) {
  if (!justifier || mots.length < 2) {
    p.drawText(mots.join(' '), { x, y, size: taille, font: police, color: couleur });
    return;
  }
  const esp = lg(police, ' ', taille);
  const plein = mots.reduce((t, m) => t + lg(police, m, taille), 0);
  const trou = (largeur - plein) / (mots.length - 1);
  let xx = x;
  for (const m of mots) {
    p.drawText(m, { x: xx, y, size: taille, font: police, color: couleur });
    xx += lg(police, m, taille) + (trou > esp * 3 ? esp : trou);
  }
}

/* ══ Le mandat seul ═════════════════════════════════════════════════════ */

export type SignaturePdf = {
  mandantNom: string;
  le: string;               // ISO, l'instant de la signature
  email: string;
  /* Quand Alexandre a signé l'OFFRE de mandat pour l'agence : son clic
     « Proposer au client », ou l'approbation du mandat type pour la
     réserve de numéros. Le client signe ensuite pour l'accepter. */
  agenceLe: string | null;
};

export type OptionsPdf = {
  numero: string;
  mandantNom: string;
  resume: Resume;
  sig: SignaturePdf | null;
  /* Un APERÇU pour Alexandre, avant toute signature : filigrane « PROJET ·
     NON SIGNÉ » sur chaque page, « Non signé » dans les deux cadres, et pas
     de signature manuscrite. */
  projet?: boolean;
  /* Le nombre de pages du document final (mandat + certificat), pour que le
     pied dise « 3 / 12 » partout. */
  pagesEnTout?: (n: number) => number;
  /* La signature manuscrite d'Alexandre (PNG, fond transparent), lue dans le
     dossier privé : jamais dans le code, le dépôt est public. */
  signatureAgence?: Uint8Array | null;
};

/* Les tailles du texte courant : lisibles à l'écran d'un téléphone comme
   imprimées. */
const CORPS = 10;
const CORPS_PAS = 1.5;

class Plume {
  doc: PDFDocument; k: Kit; griffe: PDFImage | null; projet: boolean;
  page!: PDFPage; y = 0;
  /* Où écrire « certificat en page N », une fois qu'on sait N. */
  renvoi: { page: PDFPage; y: number } | null = null;
  constructor(doc: PDFDocument, k: Kit, griffe: PDFImage | null, projet: boolean) {
    this.doc = doc; this.k = k; this.griffe = griffe; this.projet = projet;
  }

  nouvellePage() {
    this.page = this.doc.addPage([A4.l, A4.h]);
    this.y = A4.h - MARGE.h;
  }
  /* Assez de place pour `h` points ? Sinon, page suivante. */
  place(h: number) { if (this.y - h < MARGE.b) this.nouvellePage(); }

  paragraphe(texte: string, o: { gras?: boolean; taille?: number; retrait?: number; couleur?: RGB; apres?: number } = {}) {
    const taille = o.taille ?? CORPS;
    const police = o.gras ? this.k.g : this.k.r;
    const couleur = o.couleur ?? (o.gras ? BLEU : MARINE);
    const retrait = o.retrait ?? 0;
    const largeur = LARGEUR - retrait;
    const pas = taille * CORPS_PAS;
    const lignes = couper(texte, police, taille, largeur);
    lignes.forEach((mots, i) => {
      this.place(pas);
      ligneJustifiee(this.page, mots, MARGE.g + retrait, this.y - taille, largeur, police, taille, couleur, i < lignes.length - 1);
      this.y -= pas;
    });
    this.y -= o.apres ?? 6;
  }

  /* Une phrase qui engage : un encadré bleu très pâle, un filet d'or à
     gauche, le texte en gras bleu. */
  encadre(texte: string) {
    const taille = 9.8, pad = 11, barre = 3;
    const largeur = LARGEUR - barre - pad * 2;
    const pas = taille * 1.48;
    const lignes = couper(texte, this.k.g, taille, largeur);
    const h = pad * 2 + (lignes.length - 1) * pas + taille;
    if (h > A4.h - MARGE.h - MARGE.b - 40) { this.paragraphe(texte, { gras: true }); return; }
    this.place(h + 10);
    const yb = this.y - h;
    rond(this.page, MARGE.g, yb, LARGEUR, h, 5, { color: BLEU_FOND });
    this.page.drawRectangle({ x: MARGE.g, y: yb, width: barre, height: h, color: OR });
    let base = this.y - pad - taille + 1.2;
    lignes.forEach((mots) => {
      /* Au fer à gauche : justifié, un encadré en capitales se troue. */
      this.page.drawText(mots.join(' '), { x: MARGE.g + barre + pad, y: base, size: taille, font: this.k.g, color: BLEU });
      base -= pas;
    });
    this.y = yb - 10;
  }

  /* L'ouverture d'une partie : une pastille bleue à icône, « PARTIE 2 » en
     or, le titre, sa ligne d'explication en italique, un filet d'or. */
  titrePartie(n: number, partie: Partie) {
    this.place(120);
    const s = 42, x = MARGE.g, haut = this.y + 6;
    rond(this.page, x, haut - s, s, s, 11, { color: BLEU });
    icone(this.page, partie.ic, x + 10, haut - 10, 22, BLANC, 1.7);
    const tx = x + s + 16, tw = LARGEUR - s - 16;
    espace(this.page, `PARTIE ${n}`, tx, haut - 9, 7.8, this.k.g, OR_FONCE, 1.6);
    let base = haut - 31;
    const lignes = couper(partie.titre, this.k.g, 18.5, tw);
    lignes.forEach((m, i) => {
      this.page.drawText(m.join(' '), { x: tx, y: base, size: 18.5, font: this.k.g, color: BLEU });
      if (i < lignes.length - 1) base -= 22;
    });
    if (partie.sous) {
      base -= 19;
      this.page.drawText(propre(partie.sous), { x: tx, y: base, size: 12, font: this.k.serifI, color: GRIS });
    }
    const bas = Math.min(haut - s, base - 8);
    this.page.drawRectangle({ x: MARGE.g, y: bas - 14, width: 42, height: 2.2, color: OR });
    this.page.drawLine({ start: { x: MARGE.g + 48, y: bas - 12.9 }, end: { x: MARGE.g + LARGEUR, y: bas - 12.9 }, thickness: 0.6, color: FILET });
    this.y = bas - 34;
  }

  /* Une rubrique : sa pastille d'or à icône, son titre, son numéro à droite. */
  titreSection(n: number, t: string, ic: Icone, suite = 34) {
    /* Un titre ne reste jamais seul en bas de page : il emmène le début de
       ce qui le suit. */
    this.place(40 + suite);
    this.y -= 8;
    const c = 24, x = MARGE.g, haut = this.y;
    rond(this.page, x, haut - c, c, c, 7, { color: OR_PALE, borderColor: OR_TRAIT, borderWidth: 0.6 });
    icone(this.page, ic, x + 5, haut - 5, 14, OR_FONCE, 1.9);
    this.page.drawText(propre(t), { x: x + c + 10, y: haut - 16.5, size: 12.5, font: this.k.g, color: BLEU });
    const num = String(n).padStart(2, '0');
    this.page.drawText(num, { x: MARGE.g + LARGEUR - lg(this.k.g, num, 9), y: haut - 16, size: 9, font: this.k.g, color: OR });
    this.page.drawLine({ start: { x: x + c + 10, y: haut - c - 3 }, end: { x: MARGE.g + LARGEUR, y: haut - c - 3 }, thickness: 0.6, color: FILET });
    this.y = haut - c - 15;
  }

  /* « Article L215-1 », dans l'annexe. */
  petitTitre(t: string) {
    this.place(20 + 30);
    this.y -= 3;
    espace(this.page, propre(t.toUpperCase()), MARGE.g, this.y - 9, 8.2, this.k.g, BLEU, 1.2);
    this.page.drawRectangle({ x: MARGE.g, y: this.y - 15, width: 22, height: 1.6, color: OR });
    this.y -= 22;
  }

  /* « Entre les soussignés », « Il a été convenu… » : une ligne centrée,
     encadrée de deux filets d'or. */
  intertitre(t: string) {
    this.place(34 + 40);
    this.y -= 8;
    const s = propre(t.toUpperCase());
    const w = lg(this.k.g, s, 9.5, 1.4);
    const x = MARGE.g + (LARGEUR - w) / 2;
    espace(this.page, s, x, this.y - 9, 9.5, this.k.g, BLEU, 1.4);
    this.page.drawLine({ start: { x: MARGE.g, y: this.y - 5.5 }, end: { x: x - 12, y: this.y - 5.5 }, thickness: 0.6, color: OR });
    this.page.drawLine({ start: { x: x + w + 12, y: this.y - 5.5 }, end: { x: MARGE.g + LARGEUR, y: this.y - 5.5 }, thickness: 0.6, color: OR });
    this.y -= 26;
  }

  liste(items: string[]) {
    for (const it of items) {
      this.place(16);
      /* Un petit losange d'or en guise de puce. */
      const cx = MARGE.g + 8, cy = this.y - 6.6, r = 2.4;
      this.page.drawSvgPath(`M ${cx} ${-(cy + r)} L ${cx + r} ${-cy} L ${cx} ${-(cy - r)} L ${cx - r} ${-cy} Z`, { x: 0, y: 0, color: OR });
      this.paragraphe(it, { retrait: 18, apres: 3.5 });
    }
    this.y -= 3;
  }

  /* Nos engagements : deux colonnes, une pastille d'or cochée devant
     chacun. */
  coches(items: string[]) {
    const gap = 16, w = (LARGEUR - gap) / 2, taille = 9.5, pas = 13.6, ind = 22;
    for (let i = 0; i < items.length; i += 2) {
      const paire = items.slice(i, i + 2);
      const ls = paire.map(t => couper(t, this.k.r, taille, w - ind));
      const h = Math.max(...ls.map(l => l.length)) * pas;
      this.place(h + 8);
      paire.forEach((_, j) => {
        const x = MARGE.g + j * (w + gap);
        this.page.drawCircle({ x: x + 7.5, y: this.y - 6.4, size: 7.5, color: OR });
        icone(this.page, 'check', x + 2.5, this.y - 1.4, 10, BLANC, 2.4);
        ls[j].forEach((m, k) => this.page.drawText(m.join(' '),
          { x: x + ind, y: this.y - taille + 0.3 - k * pas, size: taille, font: this.k.r, color: MARINE }));
      });
      this.y -= h + 9;
    }
    this.y -= 4;
  }

  /* La mission, étape par étape : un numéro dans une pastille d'or, le nom
     de l'étape en gras, ce qui est fait dessous. Une seule colonne, un
     filet entre deux étapes. */
  etapes(items: { titre: string; x: string }[]) {
    const ind = 36, taille = 9.6, pas = 13.8;
    items.forEach((e, i) => {
      const ls = couper(e.x, this.k.r, taille, LARGEUR - ind);
      const h = 16 + ls.length * pas;
      this.place(h + 10);
      const haut = this.y;
      const num = String(i + 1).padStart(2, '0');
      rond(this.page, MARGE.g, haut - 22, 25, 22, 6, { color: OR_PALE, borderColor: OR_TRAIT, borderWidth: 0.6 });
      this.page.drawText(num, { x: MARGE.g + 12.5 - lg(this.k.g, num, 9.5) / 2, y: haut - 14.6, size: 9.5, font: this.k.g, color: OR_FONCE });
      this.page.drawText(propre(e.titre), { x: MARGE.g + ind, y: haut - 10.5, size: 10.6, font: this.k.g, color: BLEU });
      ls.forEach((m, k) => this.page.drawText(m.join(' '),
        { x: MARGE.g + ind, y: haut - 25 - k * pas, size: taille, font: this.k.r, color: MARINE }));
      if (i < items.length - 1) {
        this.page.drawLine({ start: { x: MARGE.g + ind, y: haut - h - 3 }, end: { x: MARGE.g + LARGEUR, y: haut - h - 3 }, thickness: 0.5, color: FILET });
      }
      this.y = haut - h - 11;
    });
    this.y -= 2;
  }

  /* Les fiches : deux par ligne (ou une, `large`), toutes de la même
     hauteur sur une ligne. */
  fiches(items: Fiche[]) {
    const gap = 12, demi = (LARGEUR - gap) / 2;
    const rangs: Fiche[][] = [];
    let cour: Fiche[] = [];
    for (const f of items) {
      if (f.large) { if (cour.length) rangs.push(cour); cour = []; rangs.push([f]); }
      else { cour.push(f); if (cour.length === 2) { rangs.push(cour); cour = []; } }
    }
    if (cour.length) rangs.push(cour);
    this.y -= 2;
    for (const r of rangs) {
      const w = r[0].large ? LARGEUR : demi;
      const mes = r.map(f => this.mesurerFiche(f, w));
      const h = Math.max(...mes.map(m => m.h));
      this.place(h + gap);
      r.forEach((f, i) => this.dessinerFiche(f, mes[i], MARGE.g + i * (demi + gap), this.y, w, h));
      this.y -= h + gap;
    }
    this.y -= 2;
  }

  /* À peu près la hauteur du début d'un bloc : un titre ne part jamais
     sans lui (un encadré entier, trois lignes d'un paragraphe…). */
  hauteurDebut(b: Bloc | undefined): number {
    if (!b) return 0;
    if (b.t === 'p' && b.g) return couper(b.x, this.k.g, 9.8, LARGEUR - 25).length * 14.5 + 22;
    if (b.t === 'p') return Math.min(3, couper(b.x, this.k.r, CORPS, LARGEUR).length) * CORPS * CORPS_PAS;
    if (b.t === 'fiches') return this.hauteurPremierRang(b.items);
    if (b.t === 'coches') return 60;
    if (b.t === 'etapes') return 60;
    if (b.t === 'sig') return 150;
    return 40;
  }

  /* La hauteur de la première ligne de fiches : un titre ne part jamais
     sans elle. */
  hauteurPremierRang(items: Fiche[]) {
    const demi = (LARGEUR - 12) / 2;
    if (!items.length) return 0;
    if (items[0].large) return this.mesurerFiche(items[0], LARGEUR).h;
    const r = items[1] && !items[1].large ? [items[0], items[1]] : [items[0]];
    return Math.max(...r.map(f => this.mesurerFiche(f, demi).h));
  }

  mesurerFiche(f: Fiche, w: number) {
    const pad = 13, chip = 26, T = 9.2, PAS = 12.9;
    const titre = couper(f.titre, this.k.g, 10.8, w - pad * 2 - chip - 10);
    const hTitre = Math.max(chip, titre.length * 13.5 + 4);
    const lignes = f.lignes.map(l => couper(l, this.k.r, T, w - pad * 2));
    const note = f.note ? couper(f.note, this.k.g, T, w - pad * 2 - 10) : [];
    const pied = f.pied ? couper(f.pied, this.k.i, 8.6, w - pad * 2) : [];
    let h = pad + hTitre + 10;
    lignes.forEach((l, i) => { h += l.length * PAS + (i < lignes.length - 1 ? 5 : 0); });
    if (note.length) h += 9 + note.length * PAS;
    if (pied.length) h += 14 + pied.length * 11.5;
    h += pad - (PAS - T) + 2;
    return { h, titre, lignes, note, pied, pad, chip, T, PAS };
  }

  /* Le pied (« Ci-après le MANDANT… ») se cale en bas de la fiche : deux
     fiches côte à côte finissent à la même hauteur. */
  dessinerFiche(f: Fiche, m: ReturnType<Plume['mesurerFiche']>, x: number, haut: number, w: number, h: number) {
    const p = this.page;
    rond(p, x, haut - h, w, h, 9, { color: FOND, borderColor: FILET, borderWidth: 0.8 });
    const cx = x + m.pad, cy = haut - m.pad;
    rond(p, cx, cy - m.chip, m.chip, m.chip, 7.5, { color: OR_PALE, borderColor: OR_TRAIT, borderWidth: 0.6 });
    icone(p, f.ic, cx + 5.5, cy - 5.5, 15, OR_FONCE, 1.9);
    const tx = cx + m.chip + 10;
    const hTitre = Math.max(m.chip, m.titre.length * 13.5 + 4);
    let yt = cy - (hTitre - m.titre.length * 13.5) / 2 - 10.8 + 1;
    m.titre.forEach(l => { p.drawText(l.join(' '), { x: tx, y: yt, size: 10.8, font: this.k.g, color: BLEU }); yt -= 13.5; });
    let y = cy - hTitre - 10 - m.T + 1;
    m.lignes.forEach((l, i) => {
      l.forEach(mots => { p.drawText(mots.join(' '), { x: cx, y, size: m.T, font: this.k.r, color: MARINE }); y -= m.PAS; });
      if (i < m.lignes.length - 1) y -= 5;
    });
    if (m.note.length) {
      y -= 9;
      const hn = (m.note.length - 1) * m.PAS + m.T + 4;
      p.drawRectangle({ x: cx, y: y - hn + m.T + 2, width: 2.2, height: hn, color: OR });
      m.note.forEach(mots => { p.drawText(mots.join(' '), { x: cx + 10, y, size: m.T, font: this.k.g, color: BLEU }); y -= m.PAS; });
    }
    if (m.pied.length) {
      let yp = haut - h + m.pad + 1 + (m.pied.length - 1) * 11.5;
      p.drawLine({ start: { x: cx, y: yp + 13 }, end: { x: x + w - m.pad, y: yp + 13 }, thickness: 0.5, color: FILET });
      m.pied.forEach(mots => { p.drawText(mots.join(' '), { x: cx, y: yp, size: 8.6, font: this.k.i, color: GRIS }); yp -= 11.5; });
    }
  }

  caseACocher(texte: string, coche: boolean) {
    this.place(32);
    const x = MARGE.g + 1, y = this.y - 12;
    if (coche) {
      rond(this.page, x, y, 11.5, 11.5, 2.5, { color: BLEU });
      this.page.drawSvgPath(`M ${x + 2.6} ${-(y + 5.9)} L ${x + 4.9} ${-(y + 3.3)} L ${x + 9.1} ${-(y + 8.6)}`,
        { x: 0, y: 0, borderColor: BLANC, borderWidth: 1.6 });
    } else {
      rond(this.page, x, y, 11.5, 11.5, 2.5, { color: BLANC, borderColor: BLEU, borderWidth: 1 });
    }
    this.paragraphe(texte, { gras: true, retrait: 22, apres: 8, taille: 9.6, couleur: coche ? BLEU : GRIS });
  }

  signatures(sig: SignaturePdf | null, mandantNom: string) {
    const signe = !!sig && !this.projet;
    const w = (LARGEUR - 14) / 2;
    /* Le texte de la case d'Alexandre reste dans une colonne étroite quand
       sa signature manuscrite occupe la droite ; sinon, toute la largeur. */
    const etroit = this.griffe && signe ? 118 : w - 28;
    const cases = [
      { qui: 'LE MANDANT', nom: sig ? sig.mandantNom : (mandantNom || 'Le mandant'), largeur: w - 28, lignes: signe && sig
        ? [`Signé électroniquement le ${dateCourte(sig.le)} à ${heureParis(sig.le)} (heure de Paris), par code à usage unique reçu par e-mail.`]
        : ['Signature électronique depuis son espace personnel, par code à usage unique reçu par e-mail.'] },
      { qui: 'LE MANDATAIRE', nom: AGENCE.nom, largeur: etroit, lignes: [
        `Représentée par ${SIGNATAIRE.nom}, ${SIGNATAIRE.qualite}.`,
        signe && sig ? (sig.agenceLe ? `Offre signée le ${dateCourte(sig.agenceLe)}.` : 'Signé électroniquement.') : 'Signature apposée au moment où le mandant signe.'] },
    ].map(c => ({ ...c, noms: couper(c.nom, this.k.g, 11.5, c.largeur), txt: c.lignes.flatMap(l => couper(l, this.k.r, 8.5, c.largeur)) }));
    const h = Math.max(132, ...cases.map(c => 39 + c.noms.length * 14 + 3 + c.txt.length * 12 + 34));
    this.place(h + 30);
    const y = this.y - h - 4;
    cases.forEach((c, i) => {
      const x = MARGE.g + i * (w + 14);
      rond(this.page, x, y, w, h, 9, { color: FOND, borderColor: FILET, borderWidth: 0.8 });
      this.page.drawRectangle({ x: x + 10, y: y + h - 2.4, width: w - 20, height: 2.4, color: OR });
      espace(this.page, c.qui, x + 14, y + h - 21, 7.5, this.k.g, OR_FONCE, 1.3);
      let yy = y + h - 39;
      c.noms.forEach(m => { this.page.drawText(m.join(' '), { x: x + 14, y: yy, size: 11.5, font: this.k.g, color: BLEU }); yy -= 14; });
      yy -= 3;
      c.txt.forEach(m => { this.page.drawText(m.join(' '), { x: x + 14, y: yy, size: 8.5, font: this.k.r, color: GRIS }); yy -= 12; });
      pastille(this.page, this.k, signe ? 'SIGNÉ' : 'NON SIGNÉ', x + 14, y + 13, signe ? 'vert' : 'rouge');
    });
    /* La signature d'Alexandre, à droite de sa case, qui déborde un peu
       comme une vraie signature posée à la main. Jamais sur un projet. */
    if (this.griffe && signe) {
      const gh = 88, gw = (this.griffe.width / this.griffe.height) * gh;
      this.page.drawImage(this.griffe, { x: MARGE.g + LARGEUR - gw - 12, y: y + 10, width: gw, height: gh, opacity: 0.95 });
    }
    this.renvoi = { page: this.page, y: y - 18 };
    this.y = y - 30;
  }
}

/* Le filigrane des aperçus : « PROJET · NON SIGNÉ » en travers de la page. */
function filigrane(p: PDFPage, k: Kit) {
  const t = propre('PROJET · NON SIGNÉ'), s = 54, a = (34 * Math.PI) / 180;
  const w = lg(k.g, t, s);
  const x = A4.l / 2 - (w / 2) * Math.cos(a) + (s * 0.35) * Math.sin(a);
  const y = A4.h / 2 - (w / 2) * Math.sin(a) - (s * 0.35) * Math.cos(a);
  p.drawText(t, { x, y, size: s, font: k.g, color: BRIQUE, opacity: 0.075, rotate: degrees(34) });
}

/* L'en-tête et le pied des pages intérieures (pas de la page de garde). */
function habiller(doc: PDFDocument, k: Kit, numero: string, total: number, projet: boolean) {
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    if (projet) filigrane(p, k);
    if (i === 0) return;
    /* En-tête : le logo à gauche, le numéro du mandat à droite, un filet. */
    const lh = 21, lw = (k.logo.width / k.logo.height) * lh;
    p.drawImage(k.logo, { x: MARGE.g, y: A4.h - 30 - lh, width: lw, height: lh });
    const droite = propre(`${projet ? 'PROJET NON SIGNÉ · ' : ''}Mandat de recherche n° ${numero}`);
    p.drawText(droite, { x: A4.l - MARGE.d - lg(k.r, droite, 8), y: A4.h - 44, size: 8, font: k.r, color: projet ? BRIQUE : GRIS });
    p.drawLine({ start: { x: MARGE.g, y: A4.h - 60 }, end: { x: A4.l - MARGE.d, y: A4.h - 60 }, thickness: 0.6, color: FILET });
    p.drawRectangle({ x: MARGE.g, y: A4.h - 60.9, width: 34, height: 1.8, color: OR });
    /* Pied : l'agence à gauche, la page à droite. */
    p.drawLine({ start: { x: MARGE.g, y: 44 }, end: { x: A4.l - MARGE.d, y: 44 }, thickness: 0.6, color: FILET });
    p.drawText(propre(`Emilio Immobilier · ${AGENCE.societe}, SAS · carte professionnelle ${AGENCE.carte}`), { x: MARGE.g, y: 30, size: 7.3, font: k.r, color: GRIS_CLAIR });
    const pg = `${i + 1} / ${total}`;
    p.drawText(pg, { x: A4.l - MARGE.d - lg(k.g, pg, 8), y: 30, size: 8, font: k.g, color: OR_FONCE });
  });
}

/* ── La page de garde, posée en tête une fois le reste mis en page (le
   sommaire connaît alors la page de chaque partie) ── */
function pageDeGarde(doc: PDFDocument, k: Kit, o: OptionsPdf, sommaire: { t: string; page: number }[]) {
  const p = doc.insertPage(0, [A4.l, A4.h]);
  /* Le bandeau bleu, sur toute la largeur. */
  const hb = 318;
  p.drawRectangle({ x: 0, y: A4.h - hb, width: A4.l, height: hb, color: BLEU });
  p.drawRectangle({ x: 0, y: A4.h - hb - 3, width: A4.l, height: 3, color: OR });
  const lw = 178, lh = (k.logoBlanc.height / k.logoBlanc.width) * lw;
  p.drawImage(k.logoBlanc, { x: MARGE.g, y: A4.h - 58 - lh, width: lw, height: lh });

  let y = A4.h - 190;
  p.drawRectangle({ x: MARGE.g, y: y + 20, width: 38, height: 2, color: OR });
  p.drawText('Mandat de recherche', { x: MARGE.g, y: y - 12, size: 30, font: k.g, color: BLANC });
  p.drawText(propre('simple, d’un bien à acquérir'), { x: MARGE.g, y: y - 40, size: 17, font: k.serifI, color: BLEU_PALE });
  espace(p, propre(`MANDAT NON EXCLUSIF · N° ${o.numero}`), MARGE.g, y - 76, 8.5, k.g, OR, 1.8);

  /* Pour qui, et quand. */
  y = A4.h - hb - 52;
  espace(p, 'ÉTABLI POUR', MARGE.g, y, 7.5, k.g, OR_FONCE, 1.5);
  p.drawText(propre(o.mandantNom || '—'), { x: MARGE.g, y: y - 24, size: 20, font: k.g, color: BLEU });
  if (o.projet) {
    pastille(p, k, 'PROJET NON SIGNÉ', MARGE.g, y - 50, 'rouge');
    p.drawText(propre(`aperçu du ${dateLongue(new Date())}`), { x: MARGE.g + 118, y: y - 45, size: 9.5, font: k.r, color: GRIS });
  } else {
    p.drawText(propre(o.sig ? `Signé électroniquement le ${dateLongue(o.sig.le)}` : 'Proposé à la signature électronique'),
      { x: MARGE.g, y: y - 42, size: 10, font: k.r, color: GRIS });
  }

  /* L'essentiel, en quatre cases, chacune avec son icône. */
  y -= 70;
  const gw = (LARGEUR - 12) / 2, gh = 80;
  const ics: Icone[] = ['maison', 'etiquette', 'euro', 'calendrier'];
  o.resume.forEach((c, i) => {
    const x = MARGE.g + (i % 2) * (gw + 12);
    const yy = y - Math.floor(i / 2) * (gh + 12) - gh;
    rond(p, x, yy, gw, gh, 9, { color: FOND, borderColor: FILET, borderWidth: 0.8 });
    p.drawRectangle({ x: x + 10, y: yy + gh - 2.2, width: gw - 20, height: 2.2, color: OR });
    icone(p, ics[i] || 'info', x + gw - 30, yy + gh - 14, 16, OR, 1.8);
    espace(p, c.titre.toUpperCase(), x + 13, yy + gh - 20, 7.2, k.g, OR_FONCE, 1.2);
    let ly = yy + gh - 37;
    const lignes = couper(c.valeur, k.g, 10.8, gw - 26).slice(0, 2);
    lignes.forEach(m => { p.drawText(m.join(' '), { x: x + 13, y: ly, size: 10.8, font: k.g, color: BLEU }); ly -= 13.5; });
    texteLibre(p, c.detail, x + 13, ly - 2, gw - 26, 8.3, k.r, GRIS, 10.5);
  });

  /* Le sommaire, avec la page de chaque partie. */
  y -= 2 * (gh + 12) + 26;
  espace(p, 'CE DOCUMENT CONTIENT', MARGE.g, y, 7.5, k.g, OR_FONCE, 1.5);
  y -= 20;
  sommaire.forEach((s, i) => {
    p.drawText(String(i + 1).padStart(2, '0'), { x: MARGE.g, y, size: 10, font: k.g, color: OR });
    p.drawText(propre(s.t), { x: MARGE.g + 24, y, size: 10.5, font: k.r, color: MARINE });
    const pg = `page ${s.page}`;
    p.drawText(pg, { x: MARGE.g + LARGEUR - lg(k.r, pg, 9), y, size: 9, font: k.r, color: GRIS });
    p.drawLine({ start: { x: MARGE.g + 24 + lg(k.r, propre(s.t), 10.5) + 8, y: y + 2.5 }, end: { x: MARGE.g + LARGEUR - lg(k.r, pg, 9) - 8, y: y + 2.5 },
      thickness: 0.6, color: FILET, dashArray: [1.2, 2.6] });
    y -= 18;
  });

  /* L'agence, en bas. */
  p.drawLine({ start: { x: MARGE.g, y: 72 }, end: { x: A4.l - MARGE.d, y: 72 }, thickness: 0.6, color: FILET });
  p.drawText('EMILIO IMMOBILIER', { x: MARGE.g, y: 54, size: 8.5, font: k.g, color: BLEU });
  p.drawText(propre(`${AGENCE.adresse}, ${AGENCE.cp} ${AGENCE.ville} · ${AGENCE.tel} · ${AGENCE.mail} · ${AGENCE.site}`),
    { x: MARGE.g, y: 41, size: 8, font: k.r, color: GRIS });
}

export async function pdfMandat(parties: Partie[], o: OptionsPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(propre(`${o.projet ? 'Projet non signé — ' : ''}Mandat de recherche n° ${o.numero}`));
  doc.setAuthor('Emilio Immobilier');
  doc.setCreator('Emilio Immobilier');
  doc.setProducer('Emilio Immobilier');
  /* Une date fixe (celle de la signature) : le même mandat donne le même
     fichier, donc la même empreinte. */
  if (o.sig) { doc.setCreationDate(new Date(o.sig.le)); doc.setModificationDate(new Date(o.sig.le)); }
  const k = await kit(doc);

  let griffe: PDFImage | null = null;
  if (!o.projet && o.signatureAgence && o.signatureAgence.length) {
    try { griffe = await doc.embedPng(o.signatureAgence); } catch { griffe = null; /* un fichier illisible ne bloque pas la signature */ }
  }
  const pl = new Plume(doc, k, griffe, !!o.projet);
  const debuts: number[] = [];
  parties.forEach((partie, ip) => {
    /* Les parties s'enchaînent, sans page à moitié vide entre elles. */
    const s0 = partie.sections[0], b0 = s0?.blocs[0];
    const suite = 130 + (s0?.titre ? 40 : 0) + (b0?.t === 'fiches' ? pl.hauteurPremierRang(b0.items) : 70);
    /* Le formulaire ne se coupe jamais : il ne suit que s'il a presque une
       page entière devant lui. */
    const formulaire = /rétractation/i.test(partie.court);
    const seule = ip === 0 || pl.y - (formulaire ? 500 : suite) < MARGE.b;
    if (seule) pl.nouvellePage(); else pl.y -= 30;
    debuts.push(doc.getPageCount());            // sa page, une fois la garde posée devant
    pl.titrePartie(ip + 1, partie);
    let n = 0;
    for (const s of partie.sections) {
      /* « Date et signatures » ne se sépare pas de ses cadres. */
      if (s.blocs.some(b => b.t === 'sig')) pl.place(310);
      if (s.titre && s.blocs[0]?.t === 'fiches') pl.place(44 + pl.hauteurPremierRang(s.blocs[0].items));
      if (s.titre) {
        if (s.ic) pl.titreSection(++n, s.titre, s.ic, pl.hauteurDebut(s.blocs[0]));
        else if (/^(Entre les soussignés|Il a été convenu)/i.test(s.titre)) pl.intertitre(s.titre);
        else pl.petitTitre(s.titre);
      }
      for (const b of s.blocs) dessinerBloc(pl, b, o);
      pl.y -= 4;
    }
  });

  const pagesMandat = doc.getPageCount() + 1;   // avec la page de garde
  const sommaire = parties.map((pt, i) => ({ t: pt.court, page: debuts[i] + 1 }));
  if (o.sig && !o.projet) sommaire.push({ t: 'Certificat de signature électronique', page: pagesMandat + 1 });
  pageDeGarde(doc, k, o, sommaire);

  /* Sous les signatures, le renvoi vers le certificat, maintenant qu'on
     connaît sa page. */
  if (pl.renvoi && o.sig && !o.projet) {
    const t = propre(`Mandat signé par les deux parties et scellé : le certificat de signature électronique, page ${pagesMandat + 1}, en atteste.`);
    pl.renvoi.page.drawText(t, { x: MARGE.g + (LARGEUR - lg(k.i, t, 8.6)) / 2, y: pl.renvoi.y, size: 8.6, font: k.i, color: VERT });
  }

  habiller(doc, k, o.numero, o.pagesEnTout ? o.pagesEnTout(doc.getPageCount()) : doc.getPageCount(), !!o.projet);
  return doc.save({ useObjectStreams: false });
}

function dessinerBloc(pl: Plume, b: Bloc, o: OptionsPdf) {
  if (b.t === 'p') {
    if (b.g) pl.encadre(b.x);
    else if (b.petit) pl.paragraphe(b.x, { taille: 8.7, apres: 4 });
    else pl.paragraphe(b.x);
  }
  else if (b.t === 'l') pl.liste(b.items);
  else if (b.t === 'coches') pl.coches(b.items);
  else if (b.t === 'etapes') pl.etapes(b.items);
  else if (b.t === 'fiches') pl.fiches(b.items);
  else if (b.t === 'case') pl.caseACocher(b.x, b.coche);
  else if (b.t === 'sig') pl.signatures(o.sig, o.mandantNom);
}

/* ══ Le tampon rond, bleu marine ════════════════════════════════════════
   Le dessin « 3 ter » de la maquette, refait trait pour trait : trois
   cercles, EMILIO IMMOBILIER en haut, ★ SIGNATURE ÉLECTRONIQUE ★ en bas,
   et au centre MANDAT DE RECHERCHE / SIGNÉ / la date et l'heure / le numéro.
   Légèrement penché, avec un grain d'encre : on l'a posé à la main. */

function etoile(p: PDFPage, cx: number, cy: number, r: number, couleur: RGB, opacite: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    /* drawSvgPath retourne l'axe vertical : on écrit donc -y. */
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(-(cy + rr * Math.sin(a))).toFixed(2)}`);
  }
  p.drawSvgPath(`M ${pts.join(' L ')} Z`, { x: 0, y: 0, color: couleur, opacity: opacite, borderWidth: 0 });
}

/* Un texte posé sur un arc de cercle, lettre par lettre. */
function surArc(p: PDFPage, texte: string, o: {
  cx: number; cy: number; r: number; taille: number; police: PDFFont; espacement: number;
  haut: boolean; inclinaison: number; couleur: RGB; opacite: number;
}) {
  const car = texte.split('');
  const larg = car.map(c => (c === '★' ? o.taille * 0.95 : lg(o.police, propre(c) || ' ', o.taille)));
  const total = larg.reduce((t, w) => t + w, 0) + o.espacement * (car.length - 1);
  let a = 0;
  car.forEach((c, i) => {
    const milieu = a + larg[i] / 2;
    const decal = (milieu - total / 2) / o.r;                 // en radians
    const base = o.haut ? Math.PI / 2 - decal : (3 * Math.PI) / 2 + decal;
    const th = base + (o.inclinaison * Math.PI) / 180;
    const bx = o.cx + o.r * Math.cos(th), by = o.cy + o.r * Math.sin(th);
    /* Le sens de lecture le long du cercle, et l'orientation de la lettre. */
    const tx = o.haut ? Math.sin(th) : -Math.sin(th);
    const ty = o.haut ? -Math.cos(th) : Math.cos(th);
    const rot = ((th * 180) / Math.PI) - (o.haut ? 90 : 270);
    if (c === '★') {
      const ux = o.haut ? Math.cos(th) : -Math.cos(th), uy = o.haut ? Math.sin(th) : -Math.sin(th);
      etoile(p, bx + ux * o.taille * 0.36, by + uy * o.taille * 0.36, o.taille * 0.46, o.couleur, o.opacite);
    } else if (c !== ' ') {
      p.drawText(propre(c), {
        x: bx - tx * (larg[i] / 2), y: by - ty * (larg[i] / 2),
        size: o.taille, font: o.police, color: o.couleur, opacity: o.opacite, rotate: degrees(rot),
      });
    }
    a += larg[i] + o.espacement;
  });
}

export function dessinerTampon(p: PDFPage, k: Kit, cx: number, cy: number, diametre: number, t: { quand: string; numero: string }) {
  const u = diametre / 240;                     // la maquette est dessinée sur 240
  const incl = -7;                              // penché vers la droite, comme la maquette
  const op = 0.9;
  const rot = (dx: number, dy: number) => {
    const a = (incl * Math.PI) / 180;
    return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
  };
  p.drawCircle({ x: cx, y: cy, size: 114 * u, borderColor: ENCRE, borderWidth: 5 * u, opacity: 0, borderOpacity: op });
  p.drawCircle({ x: cx, y: cy, size: 106 * u, borderColor: ENCRE, borderWidth: 1.6 * u, opacity: 0, borderOpacity: op });
  p.drawCircle({ x: cx, y: cy, size: 85 * u, borderColor: ENCRE, borderWidth: 1.6 * u, opacity: 0, borderOpacity: op });

  surArc(p, 'EMILIO IMMOBILIER', { cx, cy, r: 92 * u, taille: 13.5 * u, police: k.serif, espacement: 2.4 * u, haut: true, inclinaison: incl, couleur: ENCRE, opacite: op });
  surArc(p, '★ SIGNATURE ÉLECTRONIQUE ★', { cx, cy, r: 100 * u, taille: 10 * u, police: k.serif, espacement: 1.5 * u, haut: false, inclinaison: incl, couleur: ENCRE, opacite: op });

  /* Le centre, en coordonnées de la maquette (y vers le bas, centre 120). */
  const ligneC = (texte: string, yM: number, taille: number, esp: number) => {
    const s = propre(texte);
    const w = lg(k.serif, s, taille * u, esp * u);
    let x = -w / 2;
    for (const c of s) {
      const o = rot(x, -(yM - 120) * u);
      p.drawText(c, { x: o.x, y: o.y, size: taille * u, font: k.serif, color: ENCRE, opacity: op, rotate: degrees(incl) });
      x += lg(k.serif, c, taille * u) + esp * u;
    }
  };
  const trait = (yM: number) => {
    const a = rot(-58 * u, -(yM - 120) * u), b = rot(58 * u, -(yM - 120) * u);
    p.drawLine({ start: a, end: b, thickness: 1.2 * u, color: ENCRE, opacity: op });
  };
  ligneC('MANDAT DE RECHERCHE', 96, 8.4, 1);
  trait(101);
  ligneC('SIGNÉ', 127, 26, 2);
  trait(137);
  ligneC(`le ${dateCourte(t.quand).replace(/\//g, '.')} à ${heureParis(t.quand)}`, 155, 12, 0.6);
  ligneC(`N° ${t.numero}`, 172, 11, 1);

  /* Le grain d'encre : de petits manques blancs, toujours les mêmes pour un
     même numéro (le hasard est tiré du numéro), pour qu'on ne dise pas que
     le certificat change d'une impression à l'autre. */
  let graine = 0;
  for (const c of t.numero + t.quand) graine = (graine * 31 + c.charCodeAt(0)) >>> 0;
  const hasard = () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 4294967296; };
  for (let i = 0; i < 260; i++) {
    const a = hasard() * Math.PI * 2, r = Math.sqrt(hasard()) * 117 * u;
    p.drawCircle({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), size: (0.35 + hasard() * 0.9) * u, color: BLANC, opacity: 0.55 + hasard() * 0.4 });
  }
}

/* ══ Le mandat signé : le mandat + son certificat ═══════════════════════ */

export type Certificat = {
  numero: string;
  mandant: { nom: string; adresse: string; email: string; telephone: string };
  signeLe: string;
  ip: string;
  appareil: string;
  empreinte: string;
  deroule: { t: string; x: string }[];
  executionImmediate: boolean;
  agenceLe: string | null;
};

export async function pdfSigne(mandat: Uint8Array, c: Certificat): Promise<Uint8Array> {
  const doc = await PDFDocument.load(mandat);
  doc.setModificationDate(new Date(c.signeLe));
  const k = await kit(doc);
  const nbMandat = doc.getPageCount();
  let p = doc.addPage([A4.l, A4.h]);
  const pagesCertif = [p];

  /* Le bandeau bleu, plus court que celui de la page de garde. */
  const hb = 100;
  p.drawRectangle({ x: 0, y: A4.h - hb, width: A4.l, height: hb, color: BLEU });
  p.drawRectangle({ x: 0, y: A4.h - hb - 3, width: A4.l, height: 3, color: OR });
  const lw = 104, lh = (k.logoBlanc.height / k.logoBlanc.width) * lw;
  p.drawImage(k.logoBlanc, { x: MARGE.g, y: A4.h - 28 - lh, width: lw, height: lh });
  const e1 = 'CERTIFICAT DE SIGNATURE';
  espace(p, e1, A4.l - MARGE.d - lg(k.g, e1, 8, 1.6), A4.h - 42, 8, k.g, OR, 1.6);
  const e2 = propre(`Mandat de recherche n° ${c.numero}`);
  p.drawText(e2, { x: A4.l - MARGE.d - lg(k.g, e2, 13), y: A4.h - 62, size: 13, font: k.g, color: BLANC });

  let y = A4.h - hb - 32;
  p.drawText('Certificat de signature électronique', { x: MARGE.g, y, size: 17, font: k.g, color: BLEU });
  p.drawRectangle({ x: MARGE.g, y: y - 11, width: 42, height: 2.2, color: OR });

  /* Le tampon, et l'encadré qui dit tout : signé par les deux parties,
     scellé, conforme. C'est ce que le client doit comprendre d'un coup d'œil. */
  y -= 20;
  const diam = 122;
  const bx = MARGE.g + diam + 20, bw = A4.l - MARGE.d - bx, bh = 138, by = y - bh;
  dessinerTampon(p, k, MARGE.g + diam / 2, by + bh / 2, diam, { quand: c.signeLe, numero: c.numero });
  rond(p, bx, by, bw, bh, 10, { color: VERT_FOND, borderColor: VERT_TRAIT, borderWidth: 1 });
  p.drawCircle({ x: bx + 23, y: by + bh - 23, size: 10, color: VERT });
  icone(p, 'check', bx + 16, by + bh - 16, 14, BLANC, 2.6);
  p.drawText(propre('Mandat signé et scellé'), { x: bx + 42, y: by + bh - 27.5, size: 12.5, font: k.g, color: VERT });
  let yb = texteLibre(p, `Signé par les deux parties. Le client, ${c.mandant.nom}, a signé le ${dateLongue(c.signeLe)} à ${heureParis(c.signeLe, true)} (heure de Paris).`,
    bx + 16, by + bh - 50, bw - 30, 9, k.r, VERT, 12);
  yb -= 4;
  const preuves = [
    'Identité vérifiée par un code à usage unique envoyé par e-mail',
    c.agenceLe ? `Offre de l’agence signée le ${dateCourte(c.agenceLe)} par ${SIGNATAIRE.nom}` : `Mandat signé pour l’agence par ${SIGNATAIRE.nom}`,
    'Document scellé : toute modification serait détectable',
    'Exemplaire complet envoyé au client par e-mail',
  ];
  for (const t of preuves) {
    icone(p, 'check', bx + 15, yb + 8.4, 9.5, VERT, 2.4);
    yb = texteLibre(p, t, bx + 30, yb, bw - 44, 8.6, k.g, VERT, 11.2) - 2.2;
  }
  y = by - 6;

  /* Assez de place ? Sinon, une page de suite : un certificat ne doit
     jamais déborder sur son pied, quelle que soit la longueur du déroulé. */
  const BAS = 62;
  const besoin = (h: number) => {
    if (y - h >= BAS) return;
    p = doc.addPage([A4.l, A4.h]);
    pagesCertif.push(p);
    const lh2 = 20, lw2 = (k.logo.width / k.logo.height) * lh2;
    p.drawImage(k.logo, { x: MARGE.g, y: A4.h - 30 - lh2, width: lw2, height: lh2 });
    const t = propre(`Certificat de signature · mandat n° ${c.numero} (suite)`);
    p.drawText(t, { x: A4.l - MARGE.d - lg(k.r, t, 8), y: A4.h - 44, size: 8, font: k.r, color: GRIS });
    p.drawLine({ start: { x: MARGE.g, y: A4.h - 60 }, end: { x: A4.l - MARGE.d, y: A4.h - 60 }, thickness: 0.6, color: FILET });
    y = A4.h - 80;
  };

  /* Les tableaux : un numéro d'or et un titre bleu, puis libellé / valeur. */
  let n = 0;
  const titre = (t: string) => {
    besoin(44);
    y -= 9;
    p.drawText(String(++n).padStart(2, '0'), { x: MARGE.g, y: y - 10, size: 9.5, font: k.g, color: OR });
    p.drawText(propre(t), { x: MARGE.g + 21, y: y - 10, size: 10.5, font: k.g, color: BLEU });
    y -= 17;
  };
  const ligne = (lib: string, val: string, o: { mono?: boolean; fort?: boolean; gras?: boolean } = {}) => {
    const lw2 = 150;
    const police = o.gras ? k.g : k.r;
    const taille = o.mono ? 7.8 : 8.8;
    const lignes = couper(val, police, taille, LARGEUR - lw2 - 4);
    const h = Math.max(1, lignes.length) * 11 + 6;
    besoin(h);
    p.drawText(propre(lib), { x: MARGE.g, y: y - 12, size: 8.6, font: o.fort ? k.g : k.r, color: o.fort ? BLEU : GRIS });
    lignes.forEach((m, i) => p.drawText(m.join(' '), { x: MARGE.g + lw2, y: y - 12 - i * 11, size: taille, font: police, color: MARINE }));
    y -= h;
    p.drawLine({ start: { x: MARGE.g, y: y + 2 }, end: { x: A4.l - MARGE.d, y: y + 2 }, thickness: 0.5, color: FILET });
  };

  titre('Le document');
  ligne('Document', `Mandat de recherche non exclusif n° ${c.numero} — pages 1 à ${nbMandat}`, { gras: true });
  ligne('Mandant', `${c.mandant.nom} · ${c.mandant.adresse}`);
  ligne('Mandataire', `Emilio Immobilier (${AGENCE.societe}, SAS) · carte professionnelle ${AGENCE.carte}`);
  ligne('Signé pour l’agence', `${SIGNATAIRE.nom}, ${SIGNATAIRE.qualite}${c.agenceLe
    ? ` — offre de mandat signée le ${dateCourte(c.agenceLe)} à ${heureParis(c.agenceLe)}, avant l’acceptation du mandant` : ''}`);
  ligne('Exécution', c.executionImmediate
    ? 'Le mandant a demandé que la mission commence dès la signature, sans attendre la fin du délai de rétractation.'
    : 'Le mandant a choisi que la mission commence à la fin du délai de rétractation de 14 jours.');

  titre('Le signataire');
  ligne('Nom', c.mandant.nom);
  ligne('E-mail vérifié', c.mandant.email);
  ligne('Téléphone déclaré', c.mandant.telephone || '—');

  titre('Le déroulé, minute par minute');
  const hms = (iso: string) => heureParis(iso, true).replace(/\s*h\s*/, ':').replace(/\s*min\s*/, ':').replace(/\s*s$/, '');
  c.deroule.forEach(e => ligne(`${dateCourte(e.t)} · ${hms(e.t)}`, e.x, { fort: true }));

  titre('Les preuves techniques');
  ligne('Adresse IP', c.ip || '—', { mono: true });
  ligne('Appareil', c.appareil || '—');
  ligne(`Empreinte SHA-256 (p. 1 à ${nbMandat})`, c.empreinte, { mono: true });

  const note = `Une copie de ce mandat et de ce certificat a été envoyée au signataire par e-mail le ${dateCourte(c.signeLe)}. Le mandant dispose d’un délai de rétractation de 14 jours à compter du lendemain de la signature ; il peut l’exercer depuis son espace personnel (rubrique « Mon mandat »), par e-mail, ou avec le formulaire joint. L’empreinte ci-dessus est celle du mandat seul (pages 1 à ${nbMandat}), conservé à l’identique par l’agence : recalculer l’empreinte SHA-256 de ce fichier permet de vérifier qu’aucun mot n’a été modifié depuis la signature.`;
  const lignesNote = couper(note, k.r, 7.6, LARGEUR);
  besoin(lignesNote.length * 10.2 + 12);
  y -= 10;
  for (const m of lignesNote) { p.drawText(m.join(' '), { x: MARGE.g, y, size: 7.6, font: k.r, color: GRIS }); y -= 10.2; }

  /* Les pieds, maintenant qu'on sait combien de pages compte le document. */
  const total = doc.getPageCount();
  pagesCertif.forEach((pp, i) => {
    pp.drawLine({ start: { x: MARGE.g, y: 44 }, end: { x: A4.l - MARGE.d, y: 44 }, thickness: 0.6, color: FILET });
    pp.drawText(propre(`Emilio Immobilier · ${AGENCE.societe}, SAS · carte professionnelle ${AGENCE.carte}`), { x: MARGE.g, y: 30, size: 7.3, font: k.r, color: GRIS_CLAIR });
    const pg = `${nbMandat + i + 1} / ${total}`;
    pp.drawText(pg, { x: A4.l - MARGE.d - lg(k.g, pg, 8), y: 30, size: 8, font: k.g, color: OR_FONCE });
  });

  return doc.save({ useObjectStreams: false });
}
