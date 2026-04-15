import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL requise' }, { status: 400 });

    // Fetch la page
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Détection portail
    const portail = detectPortail(url);

    // Extraction par regex/parsing selon portail
    const bien = extractBien(html, url, portail);

    return NextResponse.json({ bien, portail });
  } catch (e: any) {
    // Retourner un formulaire vide plutôt qu'une erreur
    return NextResponse.json({ bien: null, error: e.message });
  }
}

function detectPortail(url: string): string {
  if (url.includes('seloger.com')) return 'SeLoger';
  if (url.includes('leboncoin.fr')) return 'LeBonCoin';
  if (url.includes('pap.fr')) return 'PAP';
  if (url.includes('bienici.com')) return 'Bien\'ici';
  if (url.includes('logic-immo.com')) return 'Logic-Immo';
  if (url.includes('figaro-immo.com')) return 'Figaro Immo';
  if (url.includes('jinka.fr')) return 'Jinka';
  if (url.includes('bellesdemeures.com')) return 'Belle Demeure';
  if (url.includes('lefigaro.fr')) return 'Le Figaro';
  if (url.includes('meilleurs-agents.com')) return 'Meilleurs Agents';
  if (url.includes('orpi.com')) return 'Orpi';
  if (url.includes('era.fr')) return 'ERA';
  if (url.includes('century21.fr')) return 'Century 21';
  if (url.includes('laforet.com')) return 'Laforêt';
  return 'Autre';
}

function extractText(html: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function extractNumber(html: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const num = parseFloat(match[1].replace(/[\s,]/g, '').replace(',', '.'));
      if (!isNaN(num)) return num;
    }
  }
  return null;
}

function extractBien(html: string, url: string, portail: string) {
  // Nettoyer HTML
  const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                   .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                   .replace(/<[^>]+>/g, ' ')
                   .replace(/\s+/g, ' ');

  // TITRE
  const titre = extractText(html, [
    /<title[^>]*>([^<]+)<\/title>/i,
    /<h1[^>]*>([^<]+)<\/h1>/i,
    /"name"\s*:\s*"([^"]+)"/,
    /"headline"\s*:\s*"([^"]+)"/,
  ]).replace(/\s*[\|\-–]\s*.*$/, '').trim();

  // PRIX
  const prix = extractNumber(html, [
    /(\d[\d\s]{2,8})\s*€/,
    /"price"\s*:\s*(\d+)/,
    /"prix"\s*:\s*(\d+)/,
    /price["\s:]+(\d+)/i,
  ]);

  // SURFACE
  const surface = extractNumber(html, [
    /(\d+(?:[.,]\d+)?)\s*m[²2]/i,
    /"surface"\s*:\s*(\d+)/,
    /surface\s*:?\s*(\d+)/i,
    /(\d+)\s*m²/,
  ]);

  // PIÈCES
  const pieces = extractNumber(html, [
    /(\d+)\s*pi[èe]ce/i,
    /"rooms"\s*:\s*(\d+)/,
    /"nbPieces"\s*:\s*(\d+)/,
    /(\d+)\s*p(?:ièces?|ieces?)\b/i,
  ]);

  // CHAMBRES
  const chambres = extractNumber(html, [
    /(\d+)\s*chambre/i,
    /"bedrooms"\s*:\s*(\d+)/,
    /"nbChambres"\s*:\s*(\d+)/,
  ]);

  // VILLE / LOCALISATION
  const ville = extractText(html, [
    /"addressLocality"\s*:\s*"([^"]+)"/,
    /"city"\s*:\s*"([^"]+)"/,
    /"ville"\s*:\s*"([^"]+)"/,
    /ville\s*"?\s*:\s*"?([^",<\n]+)/i,
    /<span[^>]*class="[^"]*city[^"]*"[^>]*>([^<]+)<\/span>/i,
  ]);

  // CODE POSTAL
  const cp = extractText(html, [
    /"postalCode"\s*:\s*"(\d{5})"/,
    /"zipCode"\s*:\s*"(\d{5})"/,
    /(\d{5})\s+(?:Paris|Boulogne|Neuilly|Levallois|Issy|Clichy|Asnières|Courbevoie|Puteaux|Nanterre)/i,
  ]);

  // ETAGE
  const etage = extractNumber(html, [
    /(\d+)(?:er|ème|e)\s+étage/i,
    /"floor"\s*:\s*(\d+)/,
    /étage\s*:?\s*(\d+)/i,
  ]);

  // DPE
  const dpe = extractText(html, [
    /DPE\s*:?\s*([A-G])/i,
    /classe\s+énergie\s*:?\s*([A-G])/i,
    /"dpe"\s*:\s*"([A-G])"/i,
    /"energyClass"\s*:\s*"([A-G])"/,
  ]);

  // PARKING
  const parking = /parking|garage|stationnement/i.test(html);

  // DESCRIPTION
  const description = extractText(html, [
    /"description"\s*:\s*"([^"]{50,500})"/,
    /<meta[^>]+name="description"[^>]+content="([^"]+)"/i,
    /<p[^>]*class="[^"]*description[^"]*"[^>]*>([^<]{50,})<\/p>/i,
  ]).substring(0, 600);

  // PHOTOS
  const photoMatches = html.matchAll(/"url"\s*:\s*"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi);
  const photos = Array.from(new Set(Array.from(photoMatches).map(m => m[1]))).slice(0, 10);

  // AGENCE
  const agence = extractText(html, [
    /"agencyName"\s*:\s*"([^"]+)"/,
    /"agence"\s*:\s*"([^"]+)"/,
    /"agency"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/,
  ]);

  // TYPE
  let type_bien = 'Appartement';
  if (/maison|villa|pavillon/i.test(html)) type_bien = 'Maison';
  else if (/loft|atelier/i.test(html)) type_bien = 'Loft';
  else if (/studio|chambre(?!\s+de\s+bain)/i.test(html)) type_bien = 'Studio';
  else if (/duplex/i.test(html)) type_bien = 'Duplex';

  return {
    titre: titre || `${type_bien}${ville ? ` — ${ville}` : ''}`,
    type_bien,
    ville: ville || '',
    code_postal: cp || '',
    surface: surface || null,
    nb_pieces: pieces ? Math.round(pieces) : null,
    nb_chambres: chambres ? Math.round(chambres) : null,
    etage: etage ? Math.round(etage) : null,
    parking,
    dpe: dpe || '',
    prix_vendeur: prix || null,
    description: description || '',
    photos: photos.filter(p => !p.includes('logo') && !p.includes('icon') && p.length < 300),
    source_portail: portail,
    agence_nom: agence || '',
    adresse: '',
  };
}
