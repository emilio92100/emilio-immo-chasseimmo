import { CHAMPS_ANNONCE, nettoyerLecture, completerParRegex } from '@/lib/lecture-annonce';

/* ═══ La lecture d'une annonce par son lien (V3.197) ═══════════════════════
   Sortie de api/extract-bien pour servir à deux endroits :
     - « Ajouter un bien › lien » dans le CRM (api/extract-bien, derrière le
       code d'accès) ;
     - le lien pour les agences (api/agences/lire), public : la page y est
       téléchargée par `pagePublique` (src/lib/page-publique.ts), qui refuse
       toute adresse interne.
   `lireAnnonce(url)` télécharge la page et la lit ; `lireHtml(html, url)`
   lit une page déjà téléchargée. Serveur seulement. */

export type Lecture = { bien: Record<string, unknown> | null; partial?: boolean; reason?: string; error?: string };

const AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];
export const ENTETES_NAVIGATEUR = (agent: string) => ({
  'User-Agent': agent,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  'Referer': 'https://www.google.fr/',
});

/** La page, telle qu'un navigateur la reçoit (deux navigateurs essayés).
    Vide quand le site refuse ou ne répond pas. */
export async function telechargerPage(url: string): Promise<string> {
  for (const agent of AGENTS) {
    try {
      const res = await fetch(url, { headers: ENTETES_NAVIGATEUR(agent), redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const text = await res.text();
        if (text.length > 3000 && !text.includes('cf-browser-verification')) return text;
      }
    } catch { continue; }
  }
  return '';
}
export const AGENTS_NAVIGATEUR = AGENTS;

/** Lit une page déjà téléchargée : l'IA d'abord, les motifs ensuite. */
export async function lireHtml(html: string, url: string): Promise<Lecture> {
  const portail = detectPortail(url);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const bien = await extractWithClaude(html, url, portail, apiKey);
      if (bien && (bien.prix_vendeur || bien.surface || bien.ville)) {
        return { bien, partial: false };
      }
    } catch { /* fallback regex */ }
  }
  const bien = extractBienRegex(html, url, portail);
  const isPartial = !bien.surface && !bien.prix_vendeur && !bien.nb_pieces;
  if (isPartial && portail === 'SeLoger') {
    return { bien, partial: true, reason: 'seloger_blocked' };
  }
  return { bien, partial: isPartial };
}

/** Télécharge et lit. `telecharger` : la façon d'aller chercher la page
    (par défaut `telechargerPage` ; `pagePublique` pour une adresse donnée
    par un inconnu). */
export async function lireAnnonce(url: string, telecharger: (u: string) => Promise<string> = telechargerPage): Promise<Lecture> {
  const portail = detectPortail(url);
  const html = await telecharger(url);
  if (html) return lireHtml(html, url);
  return { bien: extractFromUrl(url, portail), partial: true, reason: 'fetch_failed' };
}

/* ═══ La page, ramenée à ce qui décrit le bien (V3.186) ════════════════
   Avant : 2 000 caractères de JSON-LD, 2 000 du début de `__NEXT_DATA__`
   (souvent des réglages du site, pas l'annonce) et 3 000 de texte (souvent
   le menu) — l'IA ne voyait ni l'étage, ni le DPE, ni les charges.
   Maintenant : le JSON-LD entier, les données de la page triées pour garder
   l'annonce elle-même, et le texte visible pris à partir du titre. */

const ENTITES: Record<string, string> = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', icirc: 'î', ucirc: 'û', ugrave: 'ù', euro: '€', sup2: '²', rsquo: '’', laquo: '«', raquo: '»' };
const decoder = (t: string) => t
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITES[n.toLowerCase()] ?? m);

/** Le texte que lit un visiteur : sans scripts, styles, menus ni pied de page. */
function texteVisible(html: string): string {
  return decoder(html
    .replace(/<head[\s\S]*?<\/head>/i, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|footer|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|section|article|tr|dd|dt)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t  ]+/g, ' ')
    .replace(/ *\n[\s\n]*/g, '\n')
    .trim();
}

/* Les morceaux de données d'une page sans intérêt pour décrire le bien. */
const BRUIT = /^(url|urls|href|link|links|image|images|img|photo|photos|picture|pictures|thumb|thumbnail|thumbnails|tracking|tracker|analytics|xiti|gtm|datalayer|cookie|cookies|consent|i18n|translations?|locale|messages|config|configuration|features?|flags?|experiments?|seo|breadcrumbs?|footer|header|menu|navigation|ads?_?list|similar\w*|recommend\w*|related\w*|buildid|runtimeconfig|assetprefix|scripts?|styles?|css|svg|icon|icons|logo|avatar)$/i;

/** L'objet qui ressemble le plus à une annonce : un long texte, un prix,
    des caractéristiques. Les autres annonces de la page (« similaires »)
    n'y entrent pas. */
function annonceDans(racine: unknown): unknown {
  let meilleur: unknown = null, note = 0;
  const vus = new Set<unknown>();
  const visiter = (o: unknown, prof: number) => {
    if (!o || typeof o !== 'object' || vus.has(o) || prof > 14) return;
    vus.add(o);
    if (Array.isArray(o)) { o.slice(0, 200).forEach(x => visiter(x, prof + 1)); return; }
    const r = o as Record<string, unknown>;
    const cles = Object.keys(r);
    let n = 0;
    if (cles.some(k => /^(body|description|desc|text|texte)$/i.test(k) && typeof r[k] === 'string' && (r[k] as string).length > 120)) n += 3;
    if (cles.some(k => /price|prix/i.test(k))) n += 2;
    if (cles.some(k => /^(attributes|characteristics|caracteristiques|features|criteria|criteres)$/i.test(k))) n += 2;
    if (cles.some(k => /surface|square|area|rooms|pieces|bedrooms|chambres/i.test(k))) n += 1;
    if (cles.some(k => /^(subject|title|titre|name)$/i.test(k))) n += 1;
    if (cles.some(k => /location|address|adresse|city|ville|zipcode|postal/i.test(k))) n += 1;
    if (n > note) { note = n; meilleur = o; }
    for (const k of cles) if (!BRUIT.test(k)) visiter(r[k], prof + 1);
  };
  visiter(racine, 0);
  return note >= 5 ? meilleur : racine;
}

/** Une ligne « chemin : valeur » par donnée utile, jusqu'à `max` caractères. */
function lignesDonnees(o: unknown, max: number): string {
  const lignes: string[] = [];
  let taille = 0;
  const pousser = (l: string) => { if (taille + l.length > max) return false; lignes.push(l); taille += l.length + 1; return true; };
  const vus = new Set<unknown>();
  const visiter = (x: unknown, chemin: string[], prof: number): boolean => {
    if (taille >= max || prof > 12) return taille < max;
    if (x === null || x === undefined || x === '') return true;
    if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') {
      const v = String(x).trim();
      if (!v || /^https?:\/\//i.test(v) || /^[0-9a-f-]{24,}$/i.test(v) || v.length > 6000) return true;
      return pousser(`${chemin.slice(-3).join('.')} : ${v.replace(/\s+/g, ' ')}`) || taille < max;
    }
    if (typeof x !== 'object' || vus.has(x)) return true;
    vus.add(x);
    /* Une caractéristique : « Surface habitable : 82 m² » sur une ligne. */
    if (!Array.isArray(x)) {
      const r = x as Record<string, unknown>;
      const lib = r.key_label ?? r.label ?? r.libelle;
      const val = r.value_label ?? r.values_label ?? r.value ?? r.valeur;
      if (typeof lib === 'string' && lib.trim() && ['string', 'number', 'boolean'].includes(typeof val) && Object.keys(r).length <= 8) {
        return pousser(`${lib.trim()} : ${String(val).replace(/\s+/g, ' ').trim()}`) || taille < max;
      }
    }
    if (Array.isArray(x)) {
      for (let i = 0; i < Math.min(x.length, 80); i++) if (!visiter(x[i], [...chemin, String(i)], prof + 1)) return false;
      return true;
    }
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      if (BRUIT.test(k) || k.startsWith('@context') || /^(id|_id|uuid|hash|token|key_id|list_id)$/i.test(k)) continue;
      if (!visiter(v, [...chemin, k], prof + 1)) return false;
    }
    return true;
  };
  visiter(o, [], 0);
  return lignes.join('\n');
}

const lireJson = (t: string): unknown => { try { return JSON.parse(decoder(t.trim())); } catch { try { return JSON.parse(t.trim()); } catch { return null; } } };

function contextePage(html: string, url: string): string {
  const title = decoder(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim();
  const meta = (nom: string) => decoder(html.match(new RegExp(`<meta[^>]+(?:name|property)="${nom}"[^>]+content="([^"]+)"`, 'i'))?.[1] || '').trim();
  const h1 = decoder((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

  /* Le JSON-LD : déjà la fiche du bien, sur beaucoup de sites. */
  const jsonLd = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => lireJson(m[1])).filter(Boolean);
  const ld = jsonLd.length ? lignesDonnees(jsonLd, 5000) : '';

  /* Les données de la page (Next, Leboncoin…) : l'annonce seulement. */
  const blocs = [
    ...html.matchAll(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi),
    ...html.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ].map(m => lireJson(m[1])).filter(Boolean);
  const donnees = blocs.length ? lignesDonnees(annonceDans(blocs), 9000) : '';

  /* Le texte visible, à partir du titre (le menu passe avant). */
  const texte = texteVisible(html);
  let depart = 0;
  const repere = h1 && h1.length > 8 ? texte.indexOf(h1.slice(0, 40)) : -1;
  if (repere > 0) depart = Math.max(0, repere - 200);
  else { const m = texte.search(/\d[\d\s]*\s?m[²2]/); if (m > 1500) depart = m - 1500; }

  return [
    `PAGE : ${url}`,
    title && `TITRE DE LA PAGE : ${title}`,
    h1 && h1 !== title && `TITRE DE L'ANNONCE : ${h1}`,
    meta('description') && `RÉSUMÉ : ${meta('description')}`,
    meta('og:description') && meta('og:description') !== meta('description') && `RÉSUMÉ (partage) : ${meta('og:description')}`,
    ld && `DONNÉES STRUCTURÉES :\n${ld}`,
    donnees && `DONNÉES DE LA PAGE :\n${donnees}`,
    `TEXTE DE LA PAGE :\n${texte.slice(depart, depart + 9000)}`,
  ].filter(Boolean).join('\n\n');
}

async function extractWithClaude(html: string, url: string, portail: string, apiKey: string): Promise<Record<string, unknown> | null> {
  const context = contextePage(html, url).slice(0, 26000);

  const prompt = `Tu es un expert immobilier. Voici une annonce immobilière lue sur ${portail} (${url}) : les données de la page et son texte. Extrais TOUTES les informations du bien, comme le ferait un chasseur qui lit l'annonce en entier (le bloc des caractéristiques ET le texte de l'annonce).

Réponds UNIQUEMENT avec un JSON valide, sans markdown ni texte autour. Ne JAMAIS inventer une valeur — mettre null si non trouvée. Les données d'autres annonces (« annonces similaires ») ne comptent pas : seulement CE bien.

${context}

Réponds avec ce JSON exact :
${CHAMPS_ANNONCE}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3500,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(40000),
  });

  if (!response.ok) return null;
  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  // Parser le JSON
  const jsonMatch = text.match(/\{[\s\S]+\}/);
  if (!jsonMatch) return null;
  const parsed = nettoyerLecture(JSON.parse(jsonMatch[0]));
  /* Ce que l'IA a laissé vide, rattrapé dans la description (les mêmes
     règles que le texte copié). */
  completerParRegex(parsed, String(parsed.description || ''));

  // Extraire les photos directement depuis le HTML (Claude ne peut pas les voir)
  const photos = extractPhotos(html);

  return {
    ...parsed,
    source_portail: portail,
    adresse: parsed.adresse || '',
    photos,
  };
}

export function detectPortail(url: string): string {
  if (url.includes('seloger.com')) return 'SeLoger';
  if (url.includes('leboncoin.fr')) return 'LeBonCoin';
  if (url.includes('pap.fr')) return 'PAP';
  if (url.includes('bienici.com')) return "Bien'ici";
  if (url.includes('logic-immo.com')) return 'Logic-Immo';
  if (url.includes('jinka.fr')) return 'Jinka';
  if (url.includes('orpi.com')) return 'Orpi';
  if (url.includes('century21.fr')) return 'Century 21';
  if (url.includes('laforet.com')) return 'Laforêt';
  if (url.includes('bellesdemeures.com')) return 'Belles Demeures';
  if (url.includes('era.fr')) return 'ERA';
  if (url.includes('guy-hoquet.com')) return 'Guy Hoquet';
  if (url.includes('fnaim.fr')) return 'FNAIM';
  return 'Autre';
}

export function extractFromUrl(url: string, portail: string) {
  const u = url.toLowerCase();
  let type_bien = 'Appartement';
  if (u.includes('maison') || u.includes('villa')) type_bien = 'Maison';
  else if (u.includes('studio')) type_bien = 'Studio';
  else if (u.includes('loft')) type_bien = 'Loft';
  let ville = '';
  ['paris','boulogne','neuilly','levallois','courbevoie','issy','clichy','rueil','puteaux','suresnes'].forEach(v => { if (u.includes(v)) ville = v.charAt(0).toUpperCase() + v.slice(1); });
  return { titre: `${type_bien}${ville ? ` — ${ville}` : ''} (à compléter)`, type_bien, ville, source_portail: portail, surface: null, nb_pieces: null, etage: null, parking: false, dpe: '', prix_vendeur: null, description: '', photos: [], agence_nom: '', code_postal: '', adresse: '' };
}

/* Les photos de l'annonce, trouvées dans la page.

   V3.185 : une annonce Leboncoin donnait douze fois la MÊME photo. La page
   répète la première photo en plusieurs tailles (aperçu des réseaux, image
   préchargée, vignettes : …/images/ab/cd/x.jpg?rule=ad-large, ?rule=ad-thumb…)
   avant la liste complète, et on gardait les douze premières adresses. Une
   photo = une seule adresse désormais : les tailles d'une même image
   (même chemin, ou taille écrite dans le chemin) n'en font qu'une, et on
   garde la plus grande. Les adresses écrites dans du JSON (\u002F, \/) sont
   relues aussi : c'est souvent là qu'est la liste complète. */
function extractPhotos(html: string): string[] {
  const h = html.replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  const vues: string[] = [];
  const urlPat = /https?:\/\/[^"' \s<>\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^"' \s<>\\]*)?/gi;
  for (const m of h.matchAll(urlPat)) vues.push(m[0]);
  // SeLoger CDN spécifique
  for (const m of h.matchAll(/cdn-medias\.seloger\.com\/[^"' \s\\<>]+/gi)) vues.push('https://' + m[0]);
  // LeBonCoin
  for (const m of h.matchAll(/img\.leboncoin\.fr\/[^"' \s\\<>]+/gi)) vues.push('https://' + m[0]);

  const garder = (u: string) => {
    const l = u.toLowerCase();
    return u.length < 400 && !l.includes('logo') && !l.includes('icon') && !l.includes('avatar') && !l.includes('sprite')
      && !l.includes('_xs') && !l.includes('_tn');
  };
  /* La même image, quelle que soit sa taille : le site et le chemin, sans
     les morceaux qui disent la taille (« /crop/590x330/ », « -800x600 »). */
  const cle = (u: string) => {
    try {
      const x = new URL(u);
      const chemin = x.pathname
        .replace(/\/(?:s\/)?(?:crop|resize|width|height|fit|rs|thumb|thumbs)\/\d+(?:x\d+)?(?=\/)/gi, '')
        .replace(/\/\d{2,4}x\d{2,4}(?=\/)/g, '')
        .replace(/[-_](?:\d{2,4}x\d{2,4}|thumb|small|medium|large|big)(?=\.\w+$)/i, '');
      return (x.hostname.replace(/^www\./, '') + chemin).toLowerCase();
    } catch { return u; }
  };
  /* La plus grande des tailles d'une même image. */
  const taille = (u: string) => (/large|1200|1600|1920|2048|full|original|\bhd\b|xl/i.test(u) ? 3
    : /thumb|small|mini|250x|200x|150x|100x|ad-image-mini/i.test(u) ? 0 : 1);

  const parCle = new Map<string, string>();
  for (const u of vues) {
    if (!garder(u)) continue;
    const k = cle(u);
    const deja = parCle.get(k);
    if (!deja) parCle.set(k, u);
    else if (taille(u) > taille(deja)) parCle.set(k, u);
  }
  return [...parCle.values()].slice(0, 20);
}

function extractText(html: string, patterns: RegExp[]): string {
  for (const p of patterns) { const m = html.match(p); if (m?.[1]) return m[1].trim().replace(/\\u[\dA-F]{4}/gi, c => String.fromCharCode(parseInt(c.replace(/\\u/i,''),16))).replace(/\\n/g,' ').replace(/\\"/g,'"').substring(0,500); }
  return '';
}

function extractNumber(html: string, patterns: RegExp[]): number | null {
  for (const p of patterns) { const m = html.match(p); if (m?.[1]) { const n = parseFloat(m[1].replace(/[\s\u00a0]/g,'').replace(',','.')); if (!isNaN(n) && n > 0) return n; } }
  return null;
}

function extractBienRegex(html: string, url: string, portail: string) {
  const titre = extractText(html, [/"name"\s*:\s*"([^"]{10,200})"/, /<h1[^>]*>([^<]{5,150})<\/h1>/i, /<title[^>]*>([^<|–\-]{10,120})/i]).replace(/\s+/g,' ').trim();
  const prix = extractNumber(html, [/"price"\s*:\s*(\d{4,9})/, /(\d[\d\s]{3,9})\s*€/]);
  const surface = extractNumber(html, [/"surface"\s*:\s*(\d+(?:[.,]\d+)?)/i, /(\d+(?:[.,]\d+)?)\s*m[²2]\b/i]);
  const pieces = extractNumber(html, [/"rooms"\s*:\s*(\d+)/, /"nbPieces"\s*:\s*(\d+)/i, /(\d+)\s*pi[èe]ce/i]);
  const chambres = extractNumber(html, [/"bedrooms"\s*:\s*(\d+)/, /(\d+)\s*chambre/i]);
  const ville = extractText(html, [/"addressLocality"\s*:\s*"([^"]+)"/, /"city"\s*:\s*"([^"]{2,50})"/]);
  const cp = extractText(html, [/"postalCode"\s*:\s*"(\d{5})"/, /(\d{5})\s+[A-Z][a-z]/]);
  const etage = extractNumber(html, [/"floor"\s*:\s*(\d+)/, /(\d+)(?:er|ème|e)\s+[eé]tage/i]);
  const dpe = extractText(html, [/"dpe"\s*:\s*"([A-G])"/i, /"energyClass"\s*:\s*"([A-G])"/, /DPE[^A-Z]*([A-G])\b/i]);
  const agence = extractText(html, [/"agencyName"\s*:\s*"([^"]{2,80})"/, /"advertiserName"\s*:\s*"([^"]{2,80})"/]);
  const description = extractText(html, [/"description"\s*:\s*"([^"]{50,2000})"/, /<meta[^>]+name="description"[^>]+content="([^"]{30,500})"/i]).replace(/\\n/g,' ').replace(/\s+/g,' ').trim().substring(0,800);
  const parking = /parking|garage|stationnement/i.test(html);
  let type_bien = 'Appartement';
  if (/\bmaison\b/.test(html.toLowerCase()) || /\bvilla\b/.test(html.toLowerCase())) type_bien = 'Maison';
  else if (/\bloft\b/.test(html.toLowerCase())) type_bien = 'Loft';
  else if (/\bstudio\b/.test(html.toLowerCase())) type_bien = 'Studio';
  else if (/\bduplex\b/.test(html.toLowerCase())) type_bien = 'Duplex';
  return { titre: titre || `${type_bien}${ville ? ` — ${ville}` : ''}`, type_bien, ville: ville||'', code_postal: cp||'', surface: surface||null, nb_pieces: pieces ? Math.round(pieces) : null, nb_chambres: chambres ? Math.round(chambres) : null, etage: etage ? Math.round(etage) : null, parking, dpe: dpe||'', prix_vendeur: prix||null, description: description||'', photos: extractPhotos(html), source_portail: portail, agence_nom: agence||'', adresse: '' };
}
