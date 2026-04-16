import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ bien: null, error: 'URL requise' });

    const portail = detectPortail(url);

    const agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
    ];

    let html = '';
    for (const agent of agents) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Referer': 'https://www.google.fr/',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'cross-site',
            'Upgrade-Insecure-Requests': '1',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        });

        if (res.ok) {
          const text = await res.text();
          if (text.length > 3000 && !text.includes('captcha') && !text.includes('cf-browser-verification')) {
            html = text;
            break;
          }
        }
      } catch { continue; }
    }

    if (!html) {
      return NextResponse.json({ bien: extractFromUrl(url, portail), partial: true, reason: 'fetch_failed' });
    }

    const bien = extractBien(html, url, portail);

    // Si on a très peu d'infos (probablement bloqué), signaler
    const isPartial = !bien.surface && !bien.prix_vendeur && !bien.nb_pieces;
    if (isPartial && portail === 'SeLoger') {
      return NextResponse.json({ bien, partial: true, reason: 'seloger_blocked' });
    }

    return NextResponse.json({ bien, partial: isPartial });

  } catch (e: any) {
    return NextResponse.json({ bien: null, error: e.message });
  }
}

function detectPortail(url: string): string {
  if (url.includes('seloger.com')) return 'SeLoger';
  if (url.includes('leboncoin.fr')) return 'LeBonCoin';
  if (url.includes('pap.fr')) return 'PAP';
  if (url.includes('bienici.com')) return "Bien'ici";
  if (url.includes('logic-immo.com')) return 'Logic-Immo';
  if (url.includes('jinka.fr')) return 'Jinka';
  if (url.includes('orpi.com')) return 'Orpi';
  if (url.includes('century21.fr')) return 'Century 21';
  if (url.includes('laforet.com')) return 'Laforêt';
  if (url.includes('era.fr')) return 'ERA';
  if (url.includes('guy-hoquet.com')) return 'Guy Hoquet';
  if (url.includes('fnaim.fr')) return 'FNAIM';
  return 'Autre';
}

function extractFromUrl(url: string, portail: string) {
  const urlLower = url.toLowerCase();
  let type_bien = 'Appartement';
  if (urlLower.includes('maison') || urlLower.includes('villa')) type_bien = 'Maison';
  else if (urlLower.includes('studio')) type_bien = 'Studio';
  else if (urlLower.includes('loft')) type_bien = 'Loft';
  let ville = '';
  const villes = ['paris','boulogne-billancourt','boulogne','neuilly','levallois','courbevoie','issy','clichy','asnieres','rueil','puteaux','suresnes','vanves','montrouge','clamart','meudon','saint-cloud','nanterre','colombes'];
  for (const v of villes) { if (urlLower.includes(v)) { ville = v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, '-'); break; } }
  return { titre: `${type_bien}${ville ? ` — ${ville}` : ''} (à compléter)`, type_bien, ville, source_portail: portail, surface: null, nb_pieces: null, etage: null, parking: false, dpe: '', prix_vendeur: null, description: '', photos: [], agence_nom: '', code_postal: '', adresse: '' };
}

function extractText(html: string, patterns: RegExp[]): string {
  for (const p of patterns) { const m = html.match(p); if (m?.[1]) return m[1].trim().replace(/\\\\u[\dA-F]{4}/gi, c => String.fromCharCode(parseInt(c.replace(/\\\\u/i, ''), 16))).replace(/\\\\n/g, ' ').replace(/\\\\"/g, '"').substring(0, 500); }
  return '';
}

function extractNumber(html: string, patterns: RegExp[]): number | null {
  for (const p of patterns) { const m = html.match(p); if (m?.[1]) { const n = parseFloat(m[1].replace(/[\\s\\u00a0]/g, '').replace(',', '.')); if (!isNaN(n) && n > 0) return n; } }
  return null;
}

function extractPhotos(html: string): string[] {
  const found = new Set<string>();

  // SeLoger / sites modernes : JSON dans les scripts
  const jsonPhotoPatterns = [
    /"photos?"\s*:\s*\[([^\]]{50,})\]/gi,
    /"images?"\s*:\s*\[([^\]]{50,})\]/gi,
    /"media"\s*:\s*\[([^\]]{100,})\]/gi,
    /"slideshow"\s*:\s*\[([^\]]{50,})\]/gi,
    /"gallery"\s*:\s*\[([^\]]{50,})\]/gi,
  ];

  for (const pat of jsonPhotoPatterns) {
    const matches = [...html.matchAll(pat)];
    for (const m of matches) {
      const urlMatches = m[1].match(/https?:\/\/[^"' \s\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^"' \s\\]*)?/gi);
      if (urlMatches) urlMatches.forEach(u => { if (!u.includes('logo') && !u.includes('icon') && !u.includes('avatar') && u.length < 500) found.add(u); });
    }
  }

  // URLs directes dans le HTML
  const directMatches = [...html.matchAll(/https?:\/\/[^"' \s<>\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^"' \s<>\\]*)?/gi)];
  for (const m of directMatches) {
    const u = m[0];
    if (!u.includes('logo') && !u.includes('icon') && !u.includes('avatar') && !u.includes('sprite') && !u.includes('thumb_small') && u.length < 400) {
      found.add(u);
    }
  }

  // SeLoger spécifique : cdn-medias.seloger.com
  const sl = [...html.matchAll(/cdn-medias\.seloger\.com\/[^"' \s\\]+/gi)];
  sl.forEach(m => found.add('https://' + m[0].replace(/['"\\].*/,'')));

  // LeBonCoin : img.leboncoin.fr
  const lbc = [...html.matchAll(/img\.leboncoin\.fr\/[^"' \s\\]+/gi)];
  lbc.forEach(m => found.add('https://' + m[0].replace(/['"\\].*/,'')));

  // Filtrer les photos trop petites (thumbnails) et garder max 12 photos uniques
  const photos = [...found].filter(u => {
    const lower = u.toLowerCase();
    return !lower.includes('_xs') && !lower.includes('_tn') && !lower.includes('36x24') && !lower.includes('thumbnail') && !lower.includes('placeholder');
  });

  return photos.slice(0, 12);
}

function extractBien(html: string, url: string, portail: string) {
  // ── Titre ──
  const titre = extractText(html, [
    // JSON-LD
    /"name"\s*:\s*"([^"]{10,200})"/,
    // SeLoger : title de l'annonce
    /class="[^"]*Criterias[^"]*"[^>]*>([^<]{10,100})</i,
    /<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]{5,150})/i,
    /<h1[^>]*>([^<]{5,150})<\/h1>/i,
    /<title[^>]*>([^<|–\-]{10,120})/i,
  ]).replace(/\s+/g, ' ').trim();

  // ── Prix ──
  const prix = extractNumber(html, [
    // JSON
    /"price"\s*:\s*(\d{4,9})/,
    /"Prix"\s*:\s*"?(\d{4,9})/i,
    /"listPrice"\s*:\s*(\d{4,9})/,
    /"estimatedPrice"\s*:\s*(\d{4,9})/,
    // Texte
    /(\d[\d\s]{3,9})\s*€/,
    /€\s*(\d[\d\s]{3,9})/,
  ]);

  // ── Surface ──
  const surface = extractNumber(html, [
    /"surface"\s*:\s*(\d+(?:[.,]\d+)?)/i,
    /"squareMeters"\s*:\s*(\d+)/,
    /"livingArea"\s*:\s*(\d+)/,
    /"area"\s*:\s*(\d+)/,
    /(\d+(?:[.,]\d+)?)\s*m[²2]\b/i,
  ]);

  // ── Pièces ──
  const pieces = extractNumber(html, [
    /"rooms"\s*:\s*(\d+)/,
    /"nbPieces"\s*:\s*(\d+)/i,
    /"roomsNumber"\s*:\s*(\d+)/,
    /(\d+)\s*pi[èe]ce/i,
    /(\d+)\s*p\b(?!rix|arking|etit|lan)/i,
  ]);

  // ── Chambres ──
  const chambres = extractNumber(html, [
    /"bedrooms"\s*:\s*(\d+)/,
    /"nbChambres"\s*:\s*(\d+)/i,
    /"bedroomsNumber"\s*:\s*(\d+)/,
    /(\d+)\s*chambre/i,
  ]);

  // ── Ville ──
  const ville = extractText(html, [
    /"addressLocality"\s*:\s*"([^"]+)"/,
    /"city"\s*:\s*"([^"]{2,50})"/,
    /"ville"\s*:\s*"([^"]{2,50})"/i,
    /"locality"\s*:\s*"([^"]+)"/,
    /"cityLabel"\s*:\s*"([^"]+)"/,
  ]);

  // ── Code postal ──
  const cp = extractText(html, [
    /"postalCode"\s*:\s*"(\d{5})"/,
    /"zipCode"\s*:\s*"(\d{5})"/,
    /(\d{5})\s+[A-Z][a-z]/,
  ]);

  // ── Étage ──
  const etage = extractNumber(html, [
    /"floor"\s*:\s*(\d+)/,
    /"floorNumber"\s*:\s*(\d+)/,
    /(\d+)(?:er|ème|e)\s+[eé]tage/i,
    /[eé]tage\s*:\s*(\d+)/i,
  ]);

  // ── DPE ──
  const dpe = extractText(html, [
    /"dpe"\s*:\s*"([A-G])"/i,
    /"energyClass"\s*:\s*"([A-G])"/,
    /"energyValue"\s*:\s*"([A-G])"/,
    /DPE[^A-Z]*([A-G])\b/i,
    /classe\s+[eé]nergie\s*:?\s*([A-G])/i,
    /"energy"\s*:\s*"([A-G])"/,
  ]);

  // ── Agence ──
  const agence = extractText(html, [
    /"agencyName"\s*:\s*"([^"]{2,80})"/,
    /"agency"[^}]*"name"\s*:\s*"([^"]{2,80})"/,
    /"advertiserName"\s*:\s*"([^"]{2,80})"/,
    /"seller"[^}]*"name"\s*:\s*"([^"]{2,80})"/,
  ]);

  // ── Description ──
  const description = extractText(html, [
    /"description"\s*:\s*"([^"]{50,2000})"/,
    /<meta[^>]+name="description"[^>]+content="([^"]{30,500})"/i,
    /class="[^"]*description[^"]*"[^>]*>\s*<[^>]+>([^<]{50,})/i,
  ]).replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 800);

  // ── Parking ──
  const parking = /parking|garage|stationnement|box\b/i.test(html);

  // ── Type ──
  let type_bien = 'Appartement';
  const htmlLower = html.toLowerCase();
  if (/\bmaison\b/.test(htmlLower) || /\bvilla\b/.test(htmlLower)) type_bien = 'Maison';
  else if (/\bloft\b/.test(htmlLower) || /\batelier\b/.test(htmlLower)) type_bien = 'Loft';
  else if (/\bstudio\b/.test(htmlLower)) type_bien = 'Studio';
  else if (/\bduplex\b/.test(htmlLower)) type_bien = 'Duplex';

  // ── Photos ──
  const photos = extractPhotos(html);

  return {
    titre: titre || `${type_bien}${ville ? ` — ${ville}` : ''}`,
    type_bien, ville: ville || '', code_postal: cp || '',
    surface: surface || null,
    nb_pieces: pieces ? Math.round(pieces) : null,
    nb_chambres: chambres ? Math.round(chambres) : null,
    etage: etage ? Math.round(etage) : null,
    parking, dpe: dpe || '',
    prix_vendeur: prix || null,
    description: description || '',
    photos,
    source_portail: portail,
    agence_nom: agence || '',
    adresse: '',
  };
}
