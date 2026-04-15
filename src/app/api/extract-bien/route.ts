import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ bien: null, error: 'URL requise' });

    const portail = detectPortail(url);

    // Plusieurs tentatives avec différents User-Agents
    const agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
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
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Upgrade-Insecure-Requests': '1',
          },
          signal: AbortSignal.timeout(12000),
        });

        if (res.ok) {
          const text = await res.text();
          // Vérifier que c'est pas une page de blocage
          if (text.length > 5000 && !text.includes('captcha') && !text.includes('robot') && !text.includes('blocked')) {
            html = text;
            break;
          }
        }
      } catch { continue; }
    }

    // Si SeLoger bloque — extraction depuis l'URL elle-même
    if (!html && portail === 'SeLoger') {
      const bienFromUrl = extractFromUrl(url, portail);
      return NextResponse.json({ bien: bienFromUrl, partial: true, reason: 'seloger_blocked' });
    }

    if (!html) {
      return NextResponse.json({ bien: extractFromUrl(url, portail), partial: true, reason: 'fetch_failed' });
    }

    const bien = extractBien(html, url, portail);
    return NextResponse.json({ bien });

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
  if (url.includes('figaro-immo.com') || url.includes('lefigaro.fr')) return 'Figaro Immo';
  if (url.includes('jinka.fr')) return 'Jinka';
  if (url.includes('bellesdemeures.com')) return 'Belle Demeure';
  if (url.includes('orpi.com')) return 'Orpi';
  if (url.includes('era.fr')) return 'ERA';
  if (url.includes('century21.fr')) return 'Century 21';
  if (url.includes('laforet.com')) return 'Laforêt';
  if (url.includes('guy-hoquet.com')) return 'Guy Hoquet';
  if (url.includes('stephanepiaza.com')) return 'Stéphane Plaza';
  if (url.includes('fnaim.fr')) return 'FNAIM';
  if (url.includes('meilleursagents.com')) return 'Meilleurs Agents';
  return 'Autre';
}

// Extraction depuis l'URL uniquement (fallback)
function extractFromUrl(url: string, portail: string) {
  // Essayer d'extraire ville/type depuis l'URL
  let ville = '';
  let type_bien = 'Appartement';

  const urlLower = url.toLowerCase();
  if (urlLower.includes('maison') || urlLower.includes('villa')) type_bien = 'Maison';
  else if (urlLower.includes('studio')) type_bien = 'Studio';
  else if (urlLower.includes('loft')) type_bien = 'Loft';

  // Villes communes dans les URLs
  const villes = ['paris','boulogne-billancourt','neuilly','levallois','courbevoie','issy','clichy','asnières','rueil','puteaux','suresnes','vanves','montrouge','clamart','meudon','saint-cloud','nanterre','colombes'];
  for (const v of villes) {
    if (urlLower.includes(v)) {
      ville = v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, '-');
      break;
    }
  }

  return {
    titre: `${type_bien}${ville ? ` — ${ville}` : ''} (à compléter)`,
    type_bien, ville, source_portail: portail,
    surface: null, nb_pieces: null, etage: null, parking: false,
    dpe: '', prix_vendeur: null, description: '', photos: [],
    agence_nom: '', code_postal: '', adresse: '',
  };
}

function extractText(html: string, patterns: RegExp[]): string {
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1].trim().substring(0, 500);
  }
  return '';
}

function extractNumber(html: string, patterns: RegExp[]): number | null {
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) {
      const n = parseFloat(m[1].replace(/[\s\u00a0]/g, '').replace(',', '.'));
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return null;
}

function extractBien(html: string, url: string, portail: string) {
  const titre = extractText(html, [
    /<h1[^>]*>([^<]+)<\/h1>/i,
    /"name"\s*:\s*"([^"]{10,200})"/,
    /<title[^>]*>([^<|–-]{10,150})/i,
  ]).replace(/\s+/g, ' ').trim();

  const prix = extractNumber(html, [
    /"price"\s*:\s*(\d+)/,
    /(\d[\d\s]{3,8})\s*€/,
    /"Prix"\s*:\s*"?(\d+)/i,
  ]);

  const surface = extractNumber(html, [
    /"surface"\s*:\s*(\d+(?:[.,]\d+)?)/i,
    /(\d+(?:[.,]\d+)?)\s*m[²2]/i,
    /"squareMeters"\s*:\s*(\d+)/,
  ]);

  const pieces = extractNumber(html, [
    /"rooms"\s*:\s*(\d+)/,
    /"nbPieces"\s*:\s*(\d+)/i,
    /(\d+)\s*pi[èe]ce/i,
  ]);

  const chambres = extractNumber(html, [
    /"bedrooms"\s*:\s*(\d+)/,
    /"nbChambres"\s*:\s*(\d+)/i,
    /(\d+)\s*chambre/i,
  ]);

  const ville = extractText(html, [
    /"addressLocality"\s*:\s*"([^"]+)"/,
    /"city"\s*:\s*"([^"]+)"/,
    /"ville"\s*:\s*"([^"]+)"/i,
  ]);

  const cp = extractText(html, [
    /"postalCode"\s*:\s*"(\d{5})"/,
    /(\d{5})\s+(?:PARIS|Paris|Boulogne|Neuilly|Levallois)/i,
  ]);

  const etage = extractNumber(html, [
    /"floor"\s*:\s*(\d+)/,
    /(\d+)(?:er|ème|e)\s+[eé]tage/i,
  ]);

  const dpe = extractText(html, [
    /"dpe"\s*:\s*"([A-G])"/i,
    /"energyClass"\s*:\s*"([A-G])"/,
    /DPE\s*:?\s*classe\s*([A-G])/i,
    /classe\s+[eé]nergie\s*:?\s*([A-G])/i,
  ]);

  const parking = /parking|garage|stationnement/i.test(html);
  const agence = extractText(html, [
    /"agencyName"\s*:\s*"([^"]+)"/,
    /"agency"[^}]*"name"\s*:\s*"([^"]+)"/,
  ]);

  const description = extractText(html, [
    /"description"\s*:\s*"([^"]{50,800})"/,
    /<meta[^>]+name="description"[^>]+content="([^"]{30,}?)"/i,
  ]).replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();

  const photoMatches = [...html.matchAll(/"url"\s*:\s*"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)" /gi)];
  const photos = [...new Set(photoMatches.map(m => m[1]).filter(p => !p.includes('logo') && !p.includes('icon') && p.length < 400))].slice(0, 12);

  let type_bien = 'Appartement';
  if (/\bmaison\b|villa|pavillon/i.test(html)) type_bien = 'Maison';
  else if (/\bloft\b|atelier/i.test(html)) type_bien = 'Loft';
  else if (/\bstudio\b/i.test(html)) type_bien = 'Studio';
  else if (/\bduplex\b/i.test(html)) type_bien = 'Duplex';

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
    photos: photos,
    source_portail: portail,
    agence_nom: agence || '',
    adresse: '',
  };
}
