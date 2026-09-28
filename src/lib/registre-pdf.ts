/* ═══ Le registre des mandats, en PDF (V3.18) ═════════════════════════════
   Ce qu'on montre à un contrôle, et la photo datée qui part chaque mois par
   e-mail (voir src/lib/registre-archive.ts). Chaque mandat dans l'ordre :
   son numéro, sa date d'inscription, sa nature, ses mandants, son objet, ses
   observations, et le début de son empreinte ; en tête, le départ du
   registre et le résultat de la vérification. Navigateur et serveur. */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { LOGO_MARINE } from './mandat-logo';
import type { IdentiteAgence } from './agence';
import { etatLigne, NATURES, TYPES_MANDAT, TYPES_OBS, SOURCES, quandRegistre, type Depart, type LigneRegistre, type ObsRegistre, type Probleme, type TypeObs } from './registre';

const BLEU = rgb(52 / 255, 73 / 255, 110 / 255);
const MARINE = rgb(46 / 255, 65 / 255, 102 / 255);
const OR = rgb(201 / 255, 168 / 255, 76 / 255);
const GRIS = rgb(100 / 255, 116 / 255, 139 / 255);
const FILET = rgb(227 / 255, 232 / 255, 240 / 255);
const FOND = rgb(246 / 255, 248 / 255, 251 / 255);
const VERT = rgb(22 / 255, 101 / 255, 52 / 255);
const ROUGE = rgb(185 / 255, 28 / 255, 28 / 255);

/* Les polices standard ne savent dessiner que le jeu WinAnsi. */
const WINANSI_EN_PLUS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function propre(t: string): string {
  return String(t).replace(/[   ]/g, ' ').replace(/[‐‑]/g, '-').split('')
    .map(c => { const k = c.charCodeAt(0); if (c === '\n') return ' '; if ((k >= 32 && k <= 126) || (k >= 160 && k <= 255)) return c; return WINANSI_EN_PLUS.includes(c) ? c : '?'; })
    .join('');
}
function couper(texte: string, police: PDFFont, taille: number, largeur: number): string[] {
  const mots = propre(texte).split(/\s+/).filter(Boolean);
  const lignes: string[] = [];
  let l = '';
  for (const m of mots) {
    const essai = l ? `${l} ${m}` : m;
    if (police.widthOfTextAtSize(essai, taille) <= largeur) { l = essai; continue; }
    if (l) lignes.push(l);
    l = m;
  }
  if (l) lignes.push(l);
  return lignes.length ? lignes : [''];
}
const octets = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

export async function pdfRegistre(o: {
  depart: Depart; lignes: LigneRegistre[]; obs: ObsRegistre[]; problemes: Probleme[]; identite: IdentiteAgence; editeLe: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(propre(`Registre des mandats — ${o.identite.nom}`));
  doc.setCreationDate(new Date(o.editeLe));
  const r = await doc.embedFont(StandardFonts.Helvetica);
  const g = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(octets(LOGO_MARINE));
  const L = 595.28, H = 841.89, M = 42, larg = L - 2 * M;
  let page: PDFPage = doc.addPage([L, H]);
  let y = H - M;
  const texte = (p: PDFPage, t: string, x: number, yy: number, taille: number, police: PDFFont, couleur = MARINE) =>
    p.drawText(propre(t), { x, y: yy, size: taille, font: police, color: couleur });
  const nouvellePage = () => { page = doc.addPage([L, H]); y = H - M; };
  const place = (h: number) => { if (y - h < M + 24) nouvellePage(); };

  /* ── L'en-tête ── */
  const lh = 34, lw = (logo.width / logo.height) * lh;
  page.drawImage(logo, { x: M, y: y - lh, width: lw, height: lh });
  texte(page, 'REGISTRE DES MANDATS', M + lw + 16, y - 12, 9, g, OR);
  texte(page, 'Transactions sur immeubles et fonds de commerce', M + lw + 16, y - 27, 13, g, MARINE);
  y -= lh + 16;
  const id = o.identite;
  const entete = [
    `${id.nom} · ${id.societe}${id.forme ? `, ${id.forme}` : ''}${id.siege ? ` · ${id.siege}` : ''}${id.rcs ? ` · ${id.rcs}` : ''}`,
    `Carte professionnelle n° ${id.carte}${id.carteDelivree ? `, délivrée par ${id.carteDelivree}` : ''}`,
    `Tenu sous forme électronique (article 72 du décret n° 72-678 du 20 juillet 1972 ; articles 1366 et suivants du Code civil).`,
    `Démarré le ${quandRegistre(o.depart.demarre_le)}, au n° ${o.depart.premier_numero}${o.depart.reprise ? ` · ${o.depart.reprise}` : ''}.`,
    `Édité le ${quandRegistre(o.editeLe)} · ${o.lignes.length} mandat${o.lignes.length > 1 ? 's' : ''} inscrit${o.lignes.length > 1 ? 's' : ''}${o.lignes.length ? `, du n° ${o.lignes[0].numero} au n° ${o.lignes[o.lignes.length - 1].numero}` : ''}.`,
  ];
  for (const t of entete) for (const l of couper(t, r, 8.5, larg)) { texte(page, l, M, y, 8.5, r, GRIS); y -= 12; }
  y -= 4;
  /* La vérification : verte, ou chaque problème en rouge. */
  const ok = o.problemes.length === 0;
  const lignesVerif = ok
    ? [`Vérification : intact. Les numéros se suivent sans trou et chaque empreinte correspond à son contenu et à la précédente.`]
    : [`Vérification : ${o.problemes.length} anomalie${o.problemes.length > 1 ? 's' : ''}.`, ...o.problemes.map(p => `${p.numero ? `N° ${p.numero} : ` : ''}${p.probleme}`)];
  const hv = lignesVerif.reduce((t, x) => t + couper(x, g, 8.5, larg - 20).length * 12, 0) + 12;
  page.drawRectangle({ x: M, y: y - hv, width: larg, height: hv, color: ok ? rgb(240 / 255, 253 / 255, 244 / 255) : rgb(254 / 255, 242 / 255, 242 / 255), borderColor: ok ? rgb(187 / 255, 247 / 255, 208 / 255) : rgb(252 / 255, 202 / 255, 202 / 255), borderWidth: 0.8 });
  let yv = y - 14;
  for (const t of lignesVerif) for (const l of couper(t, g, 8.5, larg - 20)) { texte(page, l, M + 10, yv, 8.5, g, ok ? VERT : ROUGE); yv -= 12; }
  y -= hv + 16;

  /* ── Les mandats ── */
  const parLigne = new Map<string, ObsRegistre[]>();
  for (const x of o.obs) parLigne.set(x.registre_id, [...(parLigne.get(x.registre_id) || []), x]);
  for (const l of o.lignes) {
    const obs = (parLigne.get(l.id) || []).sort((a, b) => a.rang - b.rang);
    const et = etatLigne(obs);
    const titre = `${NATURES[l.nature]}${l.type_mandat ? ` ${TYPES_MANDAT[l.type_mandat] || l.type_mandat}` : ''}`;
    const lm = couper(`Mandants : ${l.mandants}`, r, 8.5, larg - 76);
    const lo = couper(`Objet : ${l.objet}`, r, 8.5, larg - 76);
    const lobs = obs.flatMap(x => couper(`${quandRegistre(x.le, false)} · ${TYPES_OBS[x.type as TypeObs]?.l || x.type} · ${x.texte}`, r, 8, larg - 88));
    const h = 20 + (lm.length + lo.length) * 11.5 + (lobs.length ? 8 + lobs.length * 10.5 : 0) + 18;
    place(h);
    page.drawRectangle({ x: M, y: y - h, width: larg, height: h, color: FOND, borderColor: FILET, borderWidth: 0.8 });
    page.drawRectangle({ x: M, y: y - h, width: 3, height: h, color: OR });
    /* Le numéro, en grand, à gauche. */
    texte(page, 'N°', M + 12, y - 16, 7.5, g, GRIS);
    texte(page, String(l.numero), M + 12, y - 32, 15, g, BLEU);
    const x0 = M + 66;
    texte(page, titre, x0, y - 15, 10, g, MARINE);
    const etTexte = `${et.l}${et.le ? ` le ${quandRegistre(et.le, false)}` : ''}`;
    const we = g.widthOfTextAtSize(propre(etTexte), 8);
    texte(page, etTexte, M + larg - 10 - we, y - 15, 8, g, et.ton === 'vert' ? VERT : et.ton === 'rouge' ? ROUGE : GRIS);
    texte(page, `Inscrit le ${quandRegistre(l.inscrit_le)} · ${SOURCES[l.source] || l.source}`, x0, y - 27, 7.5, r, GRIS);
    let yy = y - 40;
    for (const t of [...lm, ...lo]) { texte(page, t, x0, yy, 8.5, r, MARINE); yy -= 11.5; }
    if (lobs.length) {
      yy -= 2;
      page.drawLine({ start: { x: x0, y: yy + 7 }, end: { x: M + larg - 10, y: yy + 7 }, thickness: 0.5, color: FILET });
      yy -= 4;
      for (const t of lobs) { texte(page, t, x0 + 8, yy, 8, r, BLEU); yy -= 10.5; }
    }
    texte(page, `Empreinte ${l.empreinte.slice(0, 32)}…`, x0, y - h + 7, 6.5, r, GRIS);
    y -= h + 8;
  }
  if (!o.lignes.length) { texte(page, 'Aucun mandat inscrit pour l’instant.', M, y - 10, 10, r, GRIS); }

  /* ── Le pied de chaque page ── */
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    texte(p, `${o.identite.nom} · Registre des mandats · édité le ${quandRegistre(o.editeLe, false)}`, M, 22, 7, r, GRIS);
    const t = `Page ${i + 1} / ${pages.length}`;
    texte(p, t, L - M - r.widthOfTextAtSize(t, 7), 22, 7, r, GRIS);
  });
  return doc.save();
}
