/* ═══ Reprendre les biens d'ImmoFacile (V3.79) ════════════════════════════════
   ImmoFacile n'exporte pas ses biens. Ils ont été lus fiche par fiche dans
   ImmoFacile (onglets Description, Pièces, Images, Vendeur, Historique) et
   rangés dans un fichier JSON : `{ biens: [{ ref, champs, pieces, photos,
   cree, maj, histo }] }`, où `champs` est la liste des cases de la fiche,
   `[onglet, code, libellé, valeur]` (« tab1 », « C_34 », « Surface »,
   « 74.03 »).

   Ce fichier-ci est isomorphe et ne touche pas la base : il lit le fichier
   et prépare, bien par bien, ce que l'import écrira (ImportBiensIF.tsx).
     · les cases du CRM, chacune à sa place (la table plus bas) ;
     · ce qui n'a pas de case, ou dont la valeur ne correspond à aucun choix
       du CRM : recopié tel quel dans un bloc « Repris d'ImmoFacile » des
       notes du bien (rien n'est perdu, rien n'est deviné) ;
     · l'étape proposée, d'après le statut d'ImmoFacile, le mandat et le
       vendeur (Alexandre, 5 octobre : un « Suspendu » selon son mandat — échu
       ou vendeur archivé : retiré ; encore valable : en pause ; pas de
       mandat : estimation ; un « Mandat en cours » dont le vendeur est
       archivé : retiré) — l'aperçu laisse la changer bien par bien ;
     · les fiches au nom de ROGELET (Alexandre lui-même) : des « Annonces
       type », sans vendeur ni mandat ;
     · le vendeur, retrouvé parmi les contacts du CRM par le téléphone, puis
       l'e-mail, puis le nom ;
     · les photos (leur adresse chez ImmoFacile : le serveur du CRM les copie
       au moment d'importer) ;
     · l'historique, une ligne du suivi du bien par action. */

import { indexerCRM, finTel, beauNom, beauTel, dateImmo, nomNet, secteurDe, telBidon, net, type ClientCRM, type IndexCRM } from '@/lib/import-immofacile';
import type { Donnees, EtapeVente } from '@/lib/biens-vente';

/* ── Le fichier ─────────────────────────────────────────────────────────── */
export type ChampIF = [string, string, string, string];
export type PieceIF = { niveau?: string; piece?: string; surface?: string; exposition?: string; commentaires?: string };
export type BienIF = { ref: string; champs: ChampIF[]; pieces?: PieceIF[]; photos?: string[]; cree?: string; maj?: string; histo?: string };

const sansAccentsIF = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const O = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {});
const S = (x: unknown) => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');

/* Le fichier : `{ biens: [...] }`, une liste, ou `{ "74": {...}, … }`. */
export function lireFichierBiens(texte: string): BienIF[] {
  let j: unknown;
  try { j = JSON.parse(texte); } catch { throw new Error('Ce fichier n’est pas un export des biens d’ImmoFacile (JSON illisible).'); }
  const o = O(j);
  const brut: unknown[] = Array.isArray(j) ? j : Array.isArray(o.biens) ? o.biens as unknown[]
    : Object.entries(o).filter(([, v]) => Array.isArray(O(v).champs)).map(([k, v]) => ({ ref: k, ...O(v) }));
  const out: BienIF[] = [];
  for (const x of brut) {
    const b = O(x);
    const champs = (Array.isArray(b.champs) ? b.champs : []).filter((c): c is unknown[] => Array.isArray(c) && c.length >= 4)
      .map(c => [S(c[0]), S(c[1]), S(c[2]), S(c[3])] as ChampIF);
    const ref = S(b.ref) || (champs.find(c => c[1] === 'products_model')?.[3] ?? '');
    if (!ref || !champs.length) continue;
    out.push({
      ref: ref.trim(), champs,
      pieces: (Array.isArray(b.pieces) ? b.pieces : []).map(p => { const q = O(p); return { niveau: S(q.niveau), piece: S(q.piece), surface: S(q.surface), exposition: S(q.exposition), commentaires: S(q.commentaires) }; }),
      photos: (Array.isArray(b.photos) ? b.photos : []).map(S).filter(Boolean),
      cree: S(b.cree), maj: S(b.maj), histo: S(b.histo),
    });
  }
  if (!out.length) throw new Error('Aucun bien dans ce fichier : est-ce bien l’export des biens d’ImmoFacile ?');
  return out;
}

/* ── Lire une fiche ─────────────────────────────────────────────────────── */
type Lecteur = { v: (code: string) => string; n: (code: string) => number | null; oui: (code: string) => boolean | null; utilise: Set<string> };
function lecteur(b: BienIF): Lecteur {
  const m = new Map<string, string>();
  for (const [, code, , val] of b.champs) if (!m.has(code) || (!m.get(code) && val)) m.set(code, val);
  const utilise = new Set<string>();
  const v = (code: string) => { utilise.add(code); return net(m.get(code) || ''); };
  const n = (code: string) => {
    const t = v(code).replace(/\s/g, '').replace(',', '.');
    if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
    const x = Number(t);
    return Number.isFinite(x) ? x : null;
  };
  const oui = (code: string) => { const t = sansAccentsIF(v(code)).toLowerCase(); return t === 'oui' ? true : t === 'non' ? false : null; };
  return { v, n, oui, utilise };
}
const cle = (s: string) => sansAccentsIF(s).toLowerCase().replace(/\s+/g, ' ').trim();

/* Le texte d'une annonce : du HTML parfois (<br>, &eacute;). */
export function texteNet(s: string): string {
  const ent: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '’', nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', icirc: 'î', iuml: 'ï', euml: 'ë', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', hellip: '…', euro: '€', sup2: '²', deg: '°', oelig: 'œ' };
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p[^>]*>/gi, '\n\n').replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(Number(d)))
    .replace(/&([a-z0-9]+);/gi, (m0, k: string) => ent[k.toLowerCase()] ?? m0)
    .replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* « BOULOGNE BILLANCOURT » → « Boulogne-Billancourt » ; Paris reste Paris. */
export function villeDe(ville: string, cp: string): string {
  if (!ville) return '';
  if (/^75\d{3}$/.test(cp) && /^paris/i.test(sansAccentsIF(ville))) return 'Paris';
  const connue = secteurDe(`${cp} ${ville}`);
  if (connue && !/^Paris \d/.test(connue)) return connue;
  const mots = beauNom(ville).split(/\s+/);
  const art = /^(Le|La|Les|L’|L')$/i.test(mots[0]) && mots.length > 1 ? `${mots.shift()} ` : '';
  return art + mots.map((w, i) => (i > 0 && /^(sur|sous|les|lès|en|de|du|des|la|le|aux|au)$/i.test(w) ? w.toLowerCase() : w)).join('-');
}

/* « dd/mm/yyyy » → « yyyy-mm-dd ». */
const date = (s: string) => dateImmo(s) || '';

/* ── Les choix : le mot d'ImmoFacile → la valeur du CRM ──────────────────── */
export function typeBienDe(s: string): string {
  const k = cle(s);
  if (!k) return '';
  if (/duplex|triplex/.test(k)) return 'duplex';
  if (/studio/.test(k)) return 'studio';
  if (/loft|atelier/.test(k)) return 'loft';
  if (/appartement|appart/.test(k)) return 'appartement';
  if (/maison|villa|pavillon|propriete|hotel particulier/.test(k)) return 'maison';
  if (/terrain/.test(k)) return 'terrain';
  if (/parking|box|garage/.test(k)) return 'parking';
  if (/immeuble/.test(k)) return 'immeuble';
  if (/local|bureau|commerce|boutique|fonds/.test(k)) return 'local';
  return 'autre';
}
export function etatDe(s: string): string {
  const k = cle(s);
  if (!k) return '';
  if (/neuf|refait|renove/.test(k)) return 'refait_neuf';
  if (/a renover|travaux importants|gros travaux|a restaurer/.test(k)) return 'a_renover';
  if (/rafraichi|travaux a prevoir|quelques travaux|a moderniser/.test(k)) return 'travaux_legers';
  if (/bon|excellent|parfait|somptueux|luxe|prestige/.test(k)) return 'bon_etat';
  return '';
}
function etatCommunsDe(s: string): string {
  const k = cle(s);
  if (/tres bon|excellent|parfait|neuf/.test(k)) return 'tres_bon';
  if (/bon|correct/.test(k)) return k.includes('correct') ? 'moyen' : 'bon';
  if (/moyen|passable/.test(k)) return 'moyen';
  if (/mauvais|refaire|rafraichir|vetuste/.test(k)) return 'a_refaire';
  return '';
}
function standingDe(s: string): string {
  const k = cle(s);
  if (/prestige|luxe/.test(k)) return 'prestige';
  if (/haut|grand standing|tres bon/.test(k)) return 'haut';
  if (/^bon|bon standing/.test(k)) return 'bon';
  if (/normal|standard|moyen|courant/.test(k)) return 'standard';
  return '';
}
/* « Aluminium Double Vitrage », « Bois double vitrage », « Simple et double vitrage ». */
export function fenetresDe(s: string): { vitrage: string; menuiseries: string; complet: boolean } {
  const k = cle(s);
  const simple = /simple/.test(k), double = /double/.test(k), triple = /triple/.test(k);
  const vitrage = triple ? 'triple' : simple && double ? '' : double ? 'double' : simple ? 'simple' : '';
  const bois = /bois/.test(k), alu = /alu/.test(k), pvc = /pvc/.test(k);
  const menuiseries = bois && alu ? 'boisAlu' : bois && !pvc ? 'bois' : alu && !pvc ? 'alu' : pvc && !bois && !alu ? 'pvc' : '';
  /* « Simple et double », deux matières : une case vide, le mot aux notes. */
  return { vitrage, menuiseries, complet: !!k && (!!vitrage || !(simple || double || triple)) && (!!menuiseries || !(bois || alu || pvc)) };
}
export function voletsMateriauDe(s: string): string {
  const k = cle(s);
  if (/pvc/.test(k)) return 'pvc';
  if (/bois/.test(k)) return 'bois';
  if (/alu/.test(k)) return 'alu';
  if (/metal|fer|acier/.test(k)) return 'metal';
  return '';
}
export function voletsDe(s: string): string {
  const k = cle(s);
  if (!k) return '';
  if (/mixte/.test(k)) return '';
  if (/electri|motoris/.test(k)) return 'electriques';
  if (/roulant/.test(k)) return 'roulants';
  if (/battant/.test(k)) return 'battants';
  if (/pliant/.test(k)) return 'pliants';
  if (/persienne/.test(k)) return 'persiennes';
  if (/aucun|sans|^non$/.test(k)) return 'aucun';
  return '';
}
export function cuisineDe(s: string): { cuisine: string; equip: string } {
  const k = cle(s);
  const cuisine = /semi/.test(k) ? 'semiOuverte' : /independante|separee|fermee/.test(k) ? 'independante' : /americaine|ouverte|us\b/.test(k) ? 'ouverte' : /kitchenette|coin cuisine/.test(k) ? 'kitchenette' : '';
  const equip = /non equipe|vide|\bnue?\b/.test(k) ? 'non' : /equipe/.test(k) ? 'equipee' : /amenage/.test(k) ? 'amenagee' : '';
  return { cuisine, equip };
}
const EXPO: Record<string, string> = { nord: 'N', sud: 'S', est: 'E', ouest: 'O', n: 'N', s: 'S', e: 'E', o: 'O', w: 'O' };
/* « SUD », « EST - SUD », « NORD EST », « NE », « S/O » → N, NE, E, SE, S, SO, O, NO. */
export function expoDe(s: string): string {
  const k = cle(s).replace(/[^a-z]+/g, ' ').trim();
  if (!k) return '';
  if (/traversant/.test(k)) return 'traversant';
  const mots = k.split(' ').map(m => EXPO[m]).filter(Boolean);
  const l = mots.length ? mots : (k.length <= 2 ? k.split('').map(c => EXPO[c]).filter(Boolean) : []);
  if (!l.length) return '';
  const nsv = l.find(x => x === 'N' || x === 'S') || '';
  const eo = l.find(x => x === 'E' || x === 'O') || '';
  const v = `${nsv}${eo}`;
  return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'].includes(v) ? v : '';
}
export function chauffageDe(type: string, meca: string, mode: string): { mode: string; energie: string; emetteurs: string } {
  const t = cle(type), m = cle(meca), e = cle(mode);
  return {
    mode: /collectif/.test(t) ? 'collectif' : /individuel/.test(t) ? 'individuel' : '',
    energie: /gaz/.test(e) ? 'gaz' : /pompe|pac\b|reversible|geotherm/.test(e) ? 'pac' : /electri/.test(e) ? 'electrique' : /fioul|fuel/.test(e) ? 'fioul' : /bois|granule/.test(e) ? 'bois' : /ville|urbain|cpcu/.test(e) ? 'urbain' : '',
    emetteurs: /sol/.test(m) ? 'sol' : /radiateur|radiant/.test(m) ? 'radiateurs' : /convecteur/.test(m) ? 'convecteurs' : /poele/.test(m) ? 'poele' : /plafond/.test(m) ? 'plafond' : /air puls|souffl/.test(m) ? 'air' : '',
  };
}
function stationnementDe(s: string): string {
  const k = cle(s);
  if (/sous[- ]?sol|souterrain/.test(k)) return 'sousSol';
  if (/ferme|box|garage/.test(k)) return 'ferme';
  if (/couvert/.test(k)) return 'couvert';
  if (/exterieur|aerien|plein air|cour/.test(k)) return 'exterieur';
  return '';
}
export function vueDe(s: string): string {
  const k = cle(s);
  if (/seine|monument|tour eiffel/.test(k)) return 'monument';
  if (/jardin|parc|verdure/.test(k)) return 'jardin';
  if (/degage|panoram/.test(k)) return 'degagee';
  if (/cour/.test(k)) return 'cour';
  if (/rue/.test(k)) return 'rue';
  return '';
}
export const mandatTypeDe = (s: string) => { const k = cle(s); return /semi/.test(k) ? 'semi' : /exclusi/.test(k) ? 'exclusif' : /simple/.test(k) ? 'simple' : ''; };
const lettre = (s: string) => { const t = net(s).toUpperCase(); return /^[A-G]$/.test(t) ? t : ''; };

/* Le niveau d'une pièce : « 3 » (son étage), « RDC », « -1 ». Toutes au même
   niveau : rien (le CRM ne le montre que pour un bien sur plusieurs). */
function niveauDe(s: string): string {
  const k = cle(s);
  if (!k) return '';
  if (/rdc|rez/.test(k) || k === '0') return 'Rez-de-chaussée';
  if (/sous|^-/.test(k)) return 'Sous-sol';
  if (/comble/.test(k)) return 'Combles';
  const n = Number(k.replace(/\D/g, ''));
  if (n === 1) return '1er étage';
  if (n >= 2 && n <= 5) return `${n}e étage`;
  return n ? `${n}e étage` : net(s);
}

/* ── L'historique : « 13/02/2023 Alexandre ROGELET Baisse de prix
   [Client concerné : X] Référence : 160 », les plus récentes d'abord ── */
/* « Alexandre ROGELET » → « Alexandre Rogelet » (mot par mot). */
const casse = (s: string) => net(s).split(' ').map(w => (w.length > 1 && w === w.toUpperCase() ? beauNom(w) : w)).join(' ');
export type ActionBienIF = { date: string; qui: string; quoi: string; client: string };
export function lireHistoBien(t: string): ActionBienIF[] {
  const s = net(t);
  if (!s || /pas encore d.historique/i.test(s)) return [];
  const out: ActionBienIF[] = [];
  const re = /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+R[ée]f[ée]rence\s*:\s*\d+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const d = dateImmo(m[1]);
    if (!d) continue;
    let reste = m[2];
    let client = '';
    const c = reste.match(/\s+Client concern[ée]\s*:\s*(.+)$/i);
    if (c) { client = net(c[1]); reste = reste.slice(0, c.index); }
    /* L'auteur : « Prénom NOM » (le nom en capitales, parfois composé). */
    const a = reste.match(/^(\S+(?:\s+[A-ZÀ-Ý][A-ZÀ-Ý'’-]+)+)\s+(.+)$/);
    out.push({ date: d, qui: a ? casse(a[1]) : '', quoi: net(a ? a[2] : reste), client: casse(client) });
  }
  return out;
}

/* ── Le vendeur (onglet Vendeur) ─────────────────────────────────────────── */
export type VendeurIF = {
  civilite: 'Monsieur' | 'Madame' | ''; prenom: string; nom: string;
  telephones: string[]; emails: string[]; adresse: string; origine: string; commentaires: string;
};
function vendeurDe(b: BienIF): VendeurIF | null {
  const t4 = new Map<string, string>();
  for (const [onglet, code, , val] of b.champs) if (onglet === 'tab4' && val && !t4.has(code)) t4.set(code, net(val));
  const g = (k: string) => t4.get(k) || '';
  const nom = g('customers_lastname'), prenom = g('customers_firstname');
  const tels = [g('customers_telephone'), g('customers_telephone_2'), g('customers_telephone_3')].filter(x => finTel(x).length === 9 && !telBidon(x)).map(beauTel);
  const mails = g('customers_email_address').split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  if (!nom && !prenom && !tels.length && !mails.length) return null;
  const gk = cle(g('customers_gender'));
  const adresse = [g('entry_street_address'), [g('entry_postcode'), beauNom(g('entry_city'))].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return {
    civilite: /^(mme|madame|mlle|f)/.test(gk) ? 'Madame' : /^(m|mr|monsieur|h)\b/.test(gk) ? 'Monsieur' : '',
    prenom: beauNom(prenom), nom: beauNom(nom), telephones: [...new Set(tels)], emails: [...new Set(mails)], adresse,
    origine: g('customers_origine'), commentaires: g('customers_comments_2'),
  };
}
/* Les fiches d'Alexandre lui-même : des annonces type (5 octobre). */
export const estAnnonceType = (v: VendeurIF | null) => !!v && /^rogelet$/i.test(sansAccentsIF(v.nom).trim());

/* Le contact du CRM : le téléphone d'abord, puis l'e-mail, puis le nom. */
export type VendeurTrouve = { client: ClientCRM; par: 'téléphone' | 'e-mail' | 'nom' };
export function trouverVendeur(v: VendeurIF | null, idx: IndexCRM): VendeurTrouve | null {
  if (!v) return null;
  for (const t of v.telephones) { const l = idx.tels.get(finTel(t)); if (l?.length) return { client: (l.find(e => !e.conjoint) || l[0]).x, par: 'téléphone' }; }
  for (const m of v.emails) { const l = idx.mails.get(m); if (l?.length) return { client: (l.find(e => !e.conjoint) || l[0]).x, par: 'e-mail' }; }
  if (v.nom && v.prenom) {
    const l = idx.noms.get(nomNet(v.prenom, v.nom)) || idx.noms.get(nomNet(v.nom, v.prenom));
    if (l?.length === 1) return { client: l[0], par: 'nom' };
  }
  return null;
}

/* ── Les photos : leur adresse chez ImmoFacile, dans l'ordre ─────────────── */
export const HOTE_PHOTOS = 'media.immo-facile.com';
export function photosDe(b: BienIF): string[] {
  const out: string[] = [];
  for (const p of b.photos || []) {
    let u = p.trim().replace(/\?.*$/, '').replace(/\.red\.jpg$/i, '');
    if (u.startsWith('/')) u = `https://${HOTE_PHOTOS}${u}`;
    let x: URL;
    try { x = new URL(u); } catch { continue; }
    if (x.hostname !== HOTE_PHOTOS || !/\/catalog\/images\//.test(x.pathname) || !/\.(jpe?g|png|webp)$/i.test(x.pathname)) continue;
    const propre = `https://${HOTE_PHOTOS}${x.pathname}`;
    if (!out.includes(propre)) out.push(propre);
  }
  return out;
}

/* ── Le statut d'ImmoFacile et l'étape proposée ──────────────────────────── */
export const STATUTS_IF: Record<number, string> = { 1: 'Prospection', 2: 'Estimation', 3: 'Mandat en cours', 4: 'Suspendu', 5: 'Sous offre', 7: 'Compromis', 8: 'Vendu / Loué', 10: 'Archivé' };
export type Proposition = { etape: EtapeVente; archive: boolean; raison: string };
export function etapeProposee(o: {
  statut: number; annonceType: boolean; mandat: boolean; echeance: string; vendeurArchive: boolean; aujourdhui: string;
}): Proposition {
  if (o.annonceType) return { etape: 'annonce_type', archive: false, raison: 'Fiche au nom de ROGELET : une annonce type, sans vendeur ni mandat.' };
  const echu = !!o.echeance && o.echeance < o.aujourdhui;
  switch (o.statut) {
    case 1: return { etape: 'a_suivre', archive: false, raison: 'En prospection dans ImmoFacile.' };
    case 2: return { etape: 'estimation', archive: false, raison: 'En estimation dans ImmoFacile.' };
    case 3:
      if (o.vendeurArchive) return { etape: 'retire', archive: false, raison: 'En mandat dans ImmoFacile, mais le vendeur est archivé dans le CRM : il ne vend plus avec toi.' };
      return { etape: 'mandat', archive: false, raison: echu ? 'En mandat dans ImmoFacile. Attention : l’échéance du mandat est passée.' : 'En mandat dans ImmoFacile.' };
    case 4:
      if (!o.mandat) return { etape: 'estimation', archive: false, raison: 'Suspendu dans ImmoFacile, sans mandat : il revient en estimation.' };
      if (echu || o.vendeurArchive) return { etape: 'retire', archive: false, raison: `Suspendu dans ImmoFacile, ${echu ? 'mandat échu' : 'vendeur archivé dans le CRM'} : retiré de la vente.` };
      return { etape: 'suspendu', archive: false, raison: 'Suspendu dans ImmoFacile, mandat encore valable : en pause.' };
    case 5: return { etape: 'offre', archive: false, raison: 'Sous offre dans ImmoFacile.' };
    case 7: return { etape: 'compromis', archive: false, raison: 'Sous compromis dans ImmoFacile.' };
    case 8: return { etape: 'vendu', archive: false, raison: 'Vendu dans ImmoFacile.' };
    case 10: return { etape: 'retire', archive: true, raison: 'Archivé dans ImmoFacile : retiré de la vente, et rangé dans les archives.' };
    default: return { etape: 'estimation', archive: false, raison: 'Statut d’ImmoFacile inconnu.' };
  }
}

/* ── Le plan d'un bien ──────────────────────────────────────────────────── */
export type PlanBien = {
  ref: string;
  statut: number; statutLib: string;
  titre: string; ville: string;
  donnees: Donnees;
  /* Les lignes du bloc « Repris d'ImmoFacile » (aussi dans donnees.notes). */
  repris: string[];
  /* Les cases que le CRM n'a pas pu remplir (le mot d'ImmoFacile ne
     correspond à aucun choix) : pour le compte rendu à blanc. */
  sansCase: string[];
  photos: string[];
  histo: ActionBienIF[];
  vendeur: VendeurIF | null;
  trouve: VendeurTrouve | null;
  proposition: Proposition;
  /* La date de la vente (un « Vendu ») : la dernière action qui en parle. */
  venduLe: string | null;
  cree: string; maj: string;
};

const ent = (n: number | null) => (n === null ? null : Math.round(n));
const fr = (n: number) => String(n).replace('.', ',');

/* Les cases d'ImmoFacile qui ne disent rien du bien (cases à cocher des
   portails, panneau, QR code, prix calculés…) : jamais recopiées. */
const IGNOREES = /^(export_coche|coche_type_bien|selection$|type_panneau_edit|date_panneau_edit|products_ikodz_activate|motif_annulation|manufacturers_id|products_admin_id|products_model|products_status_price|products_prix_de_vente|products_price_net_vendeur|products_Frais|products_price_tfc|products_ComAcq|products_ComVen|products_name|products_description|action_type_filter|situation_|CR_|C_133_|C_(2407|131|1924|2763|1914|2782|218|204|28|57|130|30|1979|2342)$)/;

export function planifierBien(b: BienIF, o: { idx: IndexCRM; aujourdhui: string }): PlanBien {
  const L = lecteur(b);
  const { v, n, oui } = L;
  const d: Donnees = {};
  const repris: string[] = [];
  const sansCase: string[] = [];
  const garde = (lib: string, val: string) => { if (val) repris.push(`${lib} : ${val}`); };
  /* Un mot d'ImmoFacile sans choix du CRM : aux notes, et compté. */
  const nonRange = (lib: string, val: string) => { if (val) { repris.push(`${lib} : ${val}`); sansCase.push(lib); } };

  /* Le statut. */
  const st = v('C_121');
  const statut = Number((st.match(/^(\d+)/) || [])[1] || 0);

  /* Le bien. */
  const typeIF = v('C_27');
  const typeBien = typeBienDe(typeIF);
  if (typeBien) d.typeBien = typeBien;
  if (typeBien === 'autre' && typeIF) garde('Type de bien', typeIF);
  const cp = v('C_52');
  if (v('C_122')) d.adresse = v('C_122');
  if (cp) d.cp = cp;
  const ville = villeDe(v('C_54'), cp);
  if (ville) d.ville = ville;
  if (v('C_123')) d.quartier = v('C_123');
  if (v('C_55')) d.situation = v('C_55');
  const prox: [string, string][] = [['C_108', 'proxCommerces'], ['C_139', 'proxEcole'], ['C_137', 'proxBus'], ['C_138', 'proxMetro'], ['C_161', 'proxRer']];
  for (const [c, k] of prox) { const x = n(c); if (x !== null && x >= 0) d[k] = x; }
  if (n('C_1764') !== null) d.proxTram = n('C_1764');
  if (n('C_140') !== null) { if (d.proxRer === undefined) d.proxRer = n('C_140'); else garde('Accès gare', `${fr(n('C_140') as number)} min`); }

  /* Surfaces et pièces. */
  const surface = n('C_34') ?? n('CR_34');
  if (surface) d.surface = surface;
  if (n('C_2174')) d.carrez = n('C_2174');
  if (n('C_35')) d.sejour = n('C_35');
  const terrain = n('C_36') ?? n('CR_36');
  if (terrain) d.terrain = terrain;
  const pieces = n('C_33') ?? n('CR_33');
  if (pieces !== null) d.pieces = ent(pieces);
  const ch = n('C_38') ?? n('CR_38');
  if (ch !== null) d.chambres = ent(ch);
  if (n('C_43') !== null) d.sdb = ent(n('C_43'));
  if (n('C_44') !== null) d.salleseau = ent(n('C_44'));
  if (n('C_171') !== null) d.wc = ent(n('C_171'));

  /* L'immeuble. */
  const enImm = !['maison', 'terrain'].includes(typeBien);
  const etage = oui('C_1760') ? 0 : n('C_39') ?? n('CR_39');
  if (etage !== null && enImm) d.etage = ent(etage);
  const etages = n('C_100') ?? n('CR_100');
  if (etages !== null) d.etages = ent(etages);
  if (n('C_51')) d.annee = ent(n('C_51'));
  if (n('C_40')) { if (typeBien === 'maison') d.etages = ent(n('C_40')); else d.niveaux = ent(n('C_40')); }
  if (oui('C_2393')) { if (enImm) d.etage = 0; garde('Rez-de-jardin', 'oui'); }
  if (v('C_113')) d.constructionType = v('C_113');
  if (typeBien === 'terrain' && oui('C_175') !== null) d.viabilise = oui('C_175') ? 'oui' : 'non';
  if (typeBien === 'maison' || typeBien === 'terrain') {
    const as = cle(`${v('C_120')} ${v('C_243')}`);
    const a = oui('C_183') || /egout|collectif/.test(as) ? 'collectif' : /a refaire|morte/.test(as) ? 'aRefaire' : /micro/.test(as) ? 'micro' : /fosse/.test(as) ? 'fosse' : '';
    if (a) d.assainissement = a; else if (v('C_120')) nonRange('Assainissement', v('C_120'));
  }
  if (v('C_226')) d.style = v('C_226');
  if (typeBien === 'maison' && v('C_114')) {
    const mk = cle(v('C_114'));
    const mi = /deux|2|double/.test(mk) ? 'deux' : /un|1|seul/.test(mk) ? 'un' : /non|indep/.test(mk) ? 'independante' : '';
    if (mi) d.mitoyennete = mi; else nonRange('Mitoyenneté', v('C_114'));
  }
  const standing = standingDe(v('C_93'));
  if (standing) d.standing = standing; else nonRange('Standing', v('C_93'));
  if (enImm) { const ec = etatCommunsDe(v('C_1736')); if (ec) d.etatCommuns = ec; else nonRange('État des parties communes', v('C_1736')); }
  const imm: string[] = [];
  if (oui('C_41')) imm.push('ascenseur');
  if (oui('C_145')) imm.push('gardien');
  if (oui('C_136')) imm.push('digicode');
  const interphone = oui('C_156'), visiophone = oui('C_213');
  if (interphone || visiophone) imm.push('interphone');
  if (imm.length && enImm) d.immeuble = imm;
  if (v('C_211') && !/ancien/i.test(v('C_211'))) garde('Neuf ou ancien', v('C_211'));

  /* L'intérieur. */
  /* L'état du CRM (« Dans quel état ? ») : l'état intérieur d'ImmoFacile,
     plus souvent rempli, sinon l'état général. « Très bon » y est « Bon
     état » (le CRM partage cette échelle avec les recherches des acheteurs) :
     le mot d'ImmoFacile reste dans les notes. */
  const sourceEtat = v('C_103') ? 'C_103' : 'C_92';
  const etat = etatDe(v(sourceEtat));
  if (etat) d.etat = etat; else nonRange(sourceEtat === 'C_103' ? 'État intérieur' : 'État général', v(sourceEtat));
  if (etat && /tr[eè]s bon|excellent|somptueux/i.test(v(sourceEtat))) garde(sourceEtat === 'C_103' ? 'État intérieur' : 'État général', v(sourceEtat));
  if (sourceEtat === 'C_103' && v('C_92') && etatDe(v('C_92')) !== etat) garde('État général', v('C_92'));
  const ext = etatCommunsDe(v('C_104'));
  if (ext) d.etatExterieur = ext; else nonRange('État extérieur', v('C_104'));
  const cu = cuisineDe(v('C_42'));
  if (cu.cuisine) d.cuisine = cu.cuisine;
  if (cu.equip) d.cuisineEquip = cu.equip;
  if (v('C_42') && !cu.cuisine && !cu.equip) nonRange('Cuisine', v('C_42'));
  const chf = chauffageDe(v('C_45'), v('C_98'), v('C_99'));
  if (chf.mode) d.chauffageMode = chf.mode; else nonRange('Type de chauffage', v('C_45'));
  if (chf.energie) d.chauffageEnergie = chf.energie; else nonRange('Mode de chauffage', v('C_99'));
  if (chf.emetteurs) d.chauffageEmetteurs = chf.emetteurs; else nonRange('Mécanisme de chauffage', v('C_98'));
  /* L'eau chaude suit le chauffage collectif quand ImmoFacile le dit. */
  if (/eau chaude/i.test(v('C_221')) && /collecti/i.test(v('C_221'))) d.eauChaude = 'collective';
  if (v('C_221')) d.interieurNote = `Chauffage : ${v('C_221')}`;
  /* « Chauffage collectif inclus dans les charges » : la case des charges. */
  const inclus: string[] = [];
  if (/(inclus|compris)[^.]*charges/i.test(v('C_221'))) inclus.push('chauffage');
  const fe = fenetresDe(v('C_117'));
  if (fe.vitrage) d.vitrage = fe.vitrage;
  if (fe.menuiseries) d.menuiseries = fe.menuiseries;
  if (v('C_117') && !fe.complet) nonRange('Fenêtres', v('C_117'));
  const vo = voletsDe(v('C_237')), vm = voletsMateriauDe(v('C_237'));
  if (vo) d.volets = vo;
  if (vm && vo !== 'aucun') d.voletsMateriau = vm;
  if (v('C_237') && !vo && !vm) nonRange('Volets', v('C_237'));
  const eq: string[] = [];
  if (oui('C_142')) eq.push('calme');
  if (oui('C_143')) eq.push('lumineux');
  if (oui('C_1754')) eq.push('dernierEtage');
  if (oui('C_112')) eq.push('clim');
  if (oui('C_227')) eq.push('alarme');
  if (fe.vitrage === 'double') eq.push('doubleVitrage');
  if (vo === 'electriques') eq.push('voletsElec');
  if (oui('C_155')) eq.push('sejourDouble');
  if (oui('C_119')) eq.push('cheminee');
  if (oui('C_2760')) eq.push('solaire');
  if (eq.length) d.equipements = eq;

  /* L'extérieur. */
  const ann: string[] = [];
  if ((n('C_46') || 0) > 0) ann.push('balcon');
  if ((n('C_47') || 0) > 0 || (n('C_1937') || 0) > 0) ann.push('terrasse');
  if (oui('C_2166') || (n('C_1996') || 0) > 0) ann.push('jardin');
  if (oui('C_109')) ann.push('sousSol');
  if (oui('C_115')) ann.push('grenier');
  if (oui('C_118')) ann.push('veranda');
  if ((n('C_50') || 0) > 0) ann.push('cave');
  const nbPark = (n('C_49') || 0), nbBox = (n('C_48') || 0) + (n('C_2179') || 0);
  /* Un type de stationnement sans nombre de places : il y a une place. */
  const typeSta = stationnementDe(`${v('C_172_input')} ${v('C_2842')}`);
  if (nbPark > 0 || (typeSta && nbBox === 0)) ann.push('parking');
  if (nbBox > 0) ann.push('box');
  if (ann.length) d.annexes = ann;
  if (n('C_1937')) d.surfTerrasse = n('C_1937');
  if (n('C_1996')) d.surfJardin = n('C_1996');
  if (nbPark + nbBox > 0) d.nbParking = ent(nbPark + nbBox);
  else if (typeSta) d.nbParking = 1;
  if (typeSta) d.stationnement = typeSta;
  else if (nbPark + nbBox > 0) nonRange('Type de stationnement', v('C_172_input'));
  const ex = expoDe(v('C_1728'));
  if (ex) d.expo = ex; else nonRange('Exposition du séjour', v('C_1728'));
  if (v('C_154')) { const vu = vueDe(v('C_154')); if (vu) d.vue = vu; d.exterieurNote = `Vue : ${v('C_154')}`; }
  const vav = oui('C_2408');
  if (vav === false) d.visAVis = 'aucun';

  /* L'énergie. */
  const dpe = lettre(v('C_1831')), ges = lettre(v('C_1832'));
  if (dpe || ges) d.dpeStatut = 'fait';
  else if (/vierge/i.test(v('C_1831'))) d.dpeStatut = 'vierge';
  if (dpe) d.dpe = dpe;
  if (ges) d.ges = ges;
  if (n('C_1944')) d.dpeValeur = n('C_1944');
  if (n('C_1950')) d.gesValeur = n('C_1950');
  if (date(v('C_1850'))) d.dpeDate = date(v('C_1850'));
  if (n('C_2736')) d.coutMin = Math.round(n('C_2736') as number);
  if (n('C_2737')) d.coutMax = Math.round(n('C_2737') as number);
  if (n('C_2753')) d.coutAnnee = ent(n('C_2753'));
  if (v('C_2814')) d.dpeNumero = v('C_2814');

  /* La copropriété, les charges, la taxe. */
  const copro = oui('C_2206');
  if (copro !== null) d.copro = copro ? 'oui' : 'non';
  if (n('C_2207')) d.lots = ent(n('C_2207'));
  if (n('C_2232')) d.lotsHabitation = ent(n('C_2232'));
  const chargesAn = n('C_2208') || ((n('C_1979') || 0) * 12) || null;
  if (chargesAn) d.chargesAn = Math.round(chargesAn);
  if (inclus.length && copro !== false) d.chargesInclus = inclus;
  const proc = v('C_2209_input');
  if (proc) { if (/pas de proc|aucune|neant|^non$/i.test(sansAccentsIF(proc))) d.procedure = 'non'; else { d.procedure = 'oui'; d.procedureNature = v('C_2340') || proc; } }
  if (v('C_165')) d.syndic = v('C_165');
  if (n('C_89')) d.taxeFonciere = Math.round(n('C_89') as number);
  if (v('C_160') && !/^non$/i.test(v('C_160'))) d.travauxVotes = `Travaux de copropriété prévus : ${v('C_160')}`;

  /* L'occupation. */
  const occupe = oui('C_263');
  if (oui('C_68')) { d.occupation = 'loue'; if (n('C_2152')) d.loyer = Math.round(n('C_2152') as number); if (date(v('C_1726'))) d.finBail = date(v('C_1726')); }
  else if (occupe) d.occupation = 'occupe';
  else if (occupe === false) d.occupation = 'libre';

  /* Le prix, les honoraires. */
  const prix = n('products_price') ?? n('C_30');
  const honoAcq = n('C_53') ?? n('products_ComAcq');
  const honoVen = n('C_1929') ?? n('products_ComVen');
  const taux = n('C_1902');
  if (prix) d.prix = Math.round(prix);
  if ((honoAcq || 0) > 0) d.charge = 'acquereur';
  else if ((honoVen || 0) > 0) d.charge = 'vendeur';
  if (d.charge && taux && taux > 0 && taux < 20) { d.honoMode = 'taux'; d.taux = Math.round(taux * 100) / 100; }
  else if (d.charge) { d.honoMode = 'forfait'; d.forfait = Math.round((d.charge === 'acquereur' ? honoAcq : honoVen) as number); }
  const depart = n('C_223');
  if (depart && prix && Math.round(depart) !== Math.round(prix)) garde('Prix de départ', `${Math.round(depart).toLocaleString('fr-FR')} €`);
  if (n('C_1936')) d.estimBasse = Math.round(n('C_1936') as number);
  if (n('C_128')) d.estimHaute = Math.round(n('C_128') as number);
  const estime = n('C_2019');
  if (estime) d.prixConseille = Math.round(estime);
  else if (statut === 2 && prix) d.prixConseille = Math.round(prix);
  const remise = date(v('C_2378')) || date(v('C_1862'));
  if (remise) d.avisEnvoye = remise;
  /* Pourquoi il vend. */
  const cause = cle(v('C_199'));
  const motif = /mutation|demenage/.test(cause) ? 'mutation' : /succession|deces|herit/.test(cause) ? 'succession' : /divorce|separation/.test(cause) ? 'separation'
    : /plus grand|agrandi|naissance|trop petit/.test(cause) ? 'plusGrand' : /plus petit|retraite|trop grand/.test(cause) ? 'plusPetit' : /investis|locatif/.test(cause) ? 'investissement' : /achat|acquisition/.test(cause) ? 'achat' : '';
  if (motif) d.motif = motif; else nonRange('Cause de la vente', v('C_199'));

  /* Le mandat. */
  const num = v('C_26'), mDate = date(v('C_163')), mFin = date(v('C_66'));
  const mType = mandatTypeDe(v('C_124'));
  if (num) d.mandatNumero = num;
  if (mType) d.mandatType = mType;
  if (mDate) d.mandatDate = mDate;
  if (mFin) d.mandatFin = mFin;
  if (date(v('C_2171')) && date(v('C_2171')) !== mDate) garde('Date du premier mandat', v('C_2171'));

  /* Les indications de visite. */
  if (v('C_147')) d.digicode = v('C_147');
  if (v('C_149')) d.creneaux = v('C_149');
  if (v('C_90')) d.disponible = v('C_90');
  if (v('C_153')) { d.cles = 'agence'; d.trousseau = v('C_153'); }
  if (v('C_164')) d.notaire = v('C_164');
  if (v('C_239')) d.travaux = v('C_239');
  if (v('C_1867')) garde('Détail de la cause de la vente', v('C_1867'));
  if (v('C_141')) d.porte = v('C_141');
  if (v('C_152')) d.consignes = v('C_152');
  const contact = v('C_151');
  if (contact) {
    const tel = (contact.match(/(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/) || [])[0] || '';
    const nomC = net(contact.replace(tel, '').replace(/[-–,;:]\s*$/, '').replace(/^\s*[-–,;:]/, ''));
    if (tel) d.contactTel = beauTel(tel);
    if (nomC) d.contactNom = nomC;
  }
  if (v('C_150')) d.contactNom = v('C_150');
  const numeros = [v('C_202') ? `Cave ${v('C_202')}` : '', v('C_203') ? `Parking ${v('C_203')}` : ''].filter(Boolean).join(' · ');
  if (numeros) d.annexesNum = numeros;

  /* L'annonce. */
  const premier = (codes: string[]) => { for (const c of codes) { const t = texteNet(v(c)); if (t) return t; } return ''; };
  const titreAnn = premier(['products_name[4]', 'products_name[1]', 'products_name[5]', 'products_name[6]']);
  const texteAnn = premier(['products_description[4]', 'products_description[1]', 'products_description[5]', 'products_description[6]']);
  if (titreAnn) d.annonceTitre = titreAnn;
  if (texteAnn) d.annonceTexte = texteAnn;

  /* Les observations : « pour toi seul ». */
  garde('Observations', texteNet(v('C_135')));
  garde('Observations générales', texteNet(v('C_284')));
  if (v('products_status')) garde('En ligne sur le site (ImmoFacile)', v('products_status'));

  /* Les pièces. */
  const lp = (b.pieces || []).filter(p => net(p.piece || ''));
  const niveaux = new Set(lp.map(p => net(p.niveau || '')));
  if (lp.length) {
    d.detailPieces = lp.map((p, i) => {
      const s = Number(String(p.surface || '').replace(/\s/g, '').replace(',', '.'));
      return {
        id: `if${i}`, niveau: niveaux.size > 1 ? niveauDe(p.niveau || '') : '', nom: net(p.piece || ''),
        surface: Number.isFinite(s) && s > 0 ? s : null, expo: expoDe(p.exposition || '').replace('traversant', ''), note: net(p.commentaires || ''),
      };
    });
  }

  /* Tout le reste, rempli, que rien n'a lu : recopié avec le libellé
     d'ImmoFacile (« rien n'est perdu »), et compté dans l'aperçu. */
  for (const [onglet, code, lib, val] of b.champs) {
    if ((onglet !== 'tab1' && onglet !== 'entete') || L.utilise.has(code) || IGNOREES.test(code)) continue;
    const t = net(val);
    if (!t || /^(non|0|0[.,]0+)$/i.test(t)) continue;
    L.utilise.add(code);
    nonRange(net(lib).replace(/\s*:$/, '') || code, /^oui$/i.test(t) ? 'oui' : t);
  }

  /* Le vendeur, le CRM. */
  const vendeur = vendeurDe(b);
  const annonceType = estAnnonceType(vendeur);
  const trouve = annonceType ? null : trouverVendeur(vendeur, o.idx);
  if (vendeur && !annonceType) {
    if (vendeur.commentaires) garde('Commentaires sur le vendeur', vendeur.commentaires);
  }
  const proposition = etapeProposee({
    statut, annonceType, mandat: !!(num || mDate), echeance: mFin, vendeurArchive: trouve?.client.archive === true, aujourdhui: o.aujourdhui,
  });

  /* L'historique. */
  const histo = lireHistoBien(b.histo || '');
  const vente = histo.find(h => /vendu|vente|acte/i.test(h.quoi));
  const venduLe = proposition.etape === 'vendu' ? (vente?.date || date(b.maj || '') || date(b.cree || '') || null) : null;
  const aVenir = histo.filter(h => h.date > o.aujourdhui);
  for (const h of aVenir) garde('Action prévue dans ImmoFacile', `${h.quoi} le ${h.date.split('-').reverse().join('/')}`);

  /* Le bloc des notes. */
  d.refImmofacile = b.ref;
  if (repris.length) d.notes = blocRepris(b.ref, st, repris);

  return {
    ref: b.ref, statut, statutLib: STATUTS_IF[statut] || st || 'Sans statut',
    titre: titreAnn, ville, donnees: d, repris, sansCase, photos: photosDe(b),
    histo: histo.filter(h => h.date <= o.aujourdhui), vendeur: annonceType ? null : vendeur, trouve, proposition, venduLe,
    cree: date(b.cree || ''), maj: date(b.maj || ''),
  };
}

export function blocRepris(ref: string, statut: string, lignes: string[]): string {
  return [`Repris d’ImmoFacile (réf. ${ref}${statut ? `, statut « ${statut} »` : ''}) :`, ...lignes.map(l => `· ${l}`)].join('\n');
}

/* Tous les biens du fichier, avec le CRM. */
export function planifierBiens(biens: BienIF[], clients: ClientCRM[], aujourdhui: string): PlanBien[] {
  const idx = indexerCRM(clients);
  return biens.map(b => planifierBien(b, { idx, aujourdhui }));
}

/* ── Un bien déjà dans le CRM ────────────────────────────────────────────── */
export type BienCRM = { id: string; reference: string | null; etape: string; archive: boolean | null; client_id: string | null; titre: string | null; donnees: Donnees | null };
const adresseCle = (s: unknown) => cle(S(s)).replace(/\b(bis|ter)\b/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\b(rue|avenue|av|bd|boulevard|place|pl|allee|quai|chemin|impasse|square|villa|cours|route)\b/g, '').replace(/\s+/g, ' ').trim();
/* Déjà importé (sa référence ImmoFacile), ou le même bien du même vendeur
   (un « À suivre » créé par la reprise des contacts) : on le complète. */
export function dejaLa(p: PlanBien, biens: BienCRM[]): { bien: BienCRM; pourquoi: 'importe' | 'meme' } | null {
  const imp = biens.find(x => S(x.donnees?.refImmofacile) === p.ref);
  if (imp) return { bien: imp, pourquoi: 'importe' };
  const a = adresseCle(p.donnees.adresse);
  if (!a || !p.trouve) return null;
  const meme = biens.find(x => x.client_id === p.trouve!.client.id && !x.donnees?.refImmofacile && adresseCle(x.donnees?.adresse) === a);
  return meme ? { bien: meme, pourquoi: 'meme' } : null;
}

/* Compléter une fiche : seulement les cases vides ; les notes s'ajoutent. */
export function completerDonnees(base: Donnees, neuf: Donnees): Donnees {
  const out: Donnees = { ...base };
  for (const [k, v] of Object.entries(neuf)) {
    if (k === 'notes') continue;
    const b = out[k];
    const vide = b === undefined || b === null || b === '' || (Array.isArray(b) && !b.length);
    if (vide) out[k] = v;
  }
  if (typeof neuf.notes === 'string' && neuf.notes) {
    const avant = typeof base.notes === 'string' ? base.notes.trim() : '';
    out.notes = avant.includes(neuf.notes) ? avant : [avant, neuf.notes].filter(Boolean).join('\n\n');
  }
  return out;
}

/* ── Le compte rendu à blanc (avant d'importer) ──────────────────────────── */
export function resumePlans(l: PlanBien[]) {
  const parEtape: Record<string, number> = {};
  const sansCase: Record<string, number> = {};
  for (const p of l) {
    parEtape[p.proposition.etape] = (parEtape[p.proposition.etape] || 0) + 1;
    for (const s of p.sansCase) sansCase[s] = (sansCase[s] || 0) + 1;
  }
  return {
    n: l.length, parEtape, sansCase,
    vendeurTrouve: l.filter(p => p.trouve).length,
    vendeurAbsent: l.filter(p => p.proposition.etape !== 'annonce_type' && !p.vendeur).length,
    vendeurInconnu: l.filter(p => p.vendeur && !p.trouve).length,
    photos: l.reduce((s, p) => s + p.photos.length, 0),
  };
}
