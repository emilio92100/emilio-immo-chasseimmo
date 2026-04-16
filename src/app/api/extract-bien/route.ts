import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ bien: null, error: 'URL requise' });

    const portail = detectPortail(url);

    // ── Fetch HTML ──────────────────────────────────────────────────────────
    const agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    ];

    let html = '';
    for (const agent of agents) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
            'Referer': 'https://www.google.fr/',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          const text = await res.text();
          if (text.length > 3000 && !text.includes('cf-browser-verification')) {
            html = text;
            break;
          }
        }
      } catch { continue; }
    }

    // ── Si on a le HTML, essayer Claude d'abord puis fallback regex ──────────
    if (html) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        try {
          const bien = await extractWithClaude(html, url, portail, apiKey);
          if (bien && (bien.prix_vendeur || bien.surface || bien.ville)) {
            return NextResponse.json({ bien, partial: false });
          }
        } catch { /* fallback regex */ }
      }
      const bien = extractBienRegex(html, url, portail);
      const isPartial = !bien.surface && !bien.prix_vendeur && !bien.nb_pieces;
      if (isPartial && portail === 'SeLoger') {
        return NextResponse.json({ bien, partial: true, reason: 'seloger_blocked' });
      }
      return NextResponse.json({ bien, partial: isPartial });
    }

    return NextResponse.json({ bien: extractFromUrl(url, portail), partial: true, reason: 'fetch_failed' });

  } catch (e: any) {
    return NextResponse.json({ bien: null, error: e.message });
  }
}

async function extractWithClaude(html: string, url: string, portail: string, apiKey: string) {
  // Extraire uniquement les JSON-LD + scripts utiles + texte visible (éviter de saturer le contexte)
  const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const scriptNextMatches = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  const metaDesc = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1] || '';
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '';

  // Texte brut nettoyé (max 3000 chars)
  const textContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 3000);

  const context = [
    jsonLdMatches.join('\n').substring(0, 2000),
    scriptNextMatches?.[1]?.substring(0, 2000) || '',
    `TITLE: ${title}`,
    `META: ${metaDesc}`,
    `TEXT: ${textContent}`,
  ].filter(Boolean).join('\n\n').substring(0, 6000);

  const prompt = `Tu es un extracteur de données immobilières. Extrais les informations de cette annonce immobilière et réponds UNIQUEMENT avec un JSON valide (pas de markdown, pas de texte autour).

Annonce depuis ${portail} : ${url}

Données disponibles :
${context}

Réponds avec ce JSON exact (null si non trouvé) :
{
  "titre": "...",
  "type_bien": "Appartement|Maison|Studio|Loft|Duplex|Villa",
  "ville": "...",
  "code_postal": "...",
  "surface": number|null,
  "nb_pieces": number|null,
  "nb_chambres": number|null,
  "etage": number|null,
  "parking": boolean,
  "dpe": "A|B|C|D|E|F|G"|null,
  "prix_vendeur": number|null,
  "description": "...",
  "agence_nom": "...",
  "photos": ["url1", "url2"]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) return null;
  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  // Parser le JSON
  const jsonMatch = text.match(/\{[\s\S]+\}/);
  if (!jsonMatch) return null;
  const parsed = JSON.parse(jsonMatch[0]);

  // Extraire les photos directement depuis le HTML (Claude ne peut pas les voir)
  const photos = extractPhotos(html);

  return {
    ...parsed,
    source_portail: portail,
    adresse: '',
    photos: photos.length > 0 ? photos : (parsed.photos || []),
  };
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
  if (url.includes('bellesdemeures.com')) return 'Belles Demeures';
  if (url.includes('era.fr')) return 'ERA';
  if (url.includes('guy-hoquet.com')) return 'Guy Hoquet';
  if (url.includes('fnaim.fr')) return 'FNAIM';
  return 'Autre';
}

function extractFromUrl(url: string, portail: string) {
  const u = url.toLowerCase();
  let type_bien = 'Appartement';
  if (u.includes('maison') || u.includes('villa')) type_bien = 'Maison';
  else if (u.includes('studio')) type_bien = 'Studio';
  else if (u.includes('loft')) type_bien = 'Loft';
  let ville = '';
  ['paris','boulogne','neuilly','levallois','courbevoie','issy','clichy','rueil','puteaux','suresnes'].forEach(v => { if (u.includes(v)) ville = v.charAt(0).toUpperCase() + v.slice(1); });
  return { titre: `${type_bien}${ville ? ` — ${ville}` : ''} (à compléter)`, type_bien, ville, source_portail: portail, surface: null, nb_pieces: null, etage: null, parking: false, dpe: '', prix_vendeur: null, description: '', photos: [], agence_nom: '', code_postal: '', adresse: '' };
}

function extractPhotos(html: string): string[] {
  const found = new Set<string>();
  const urlPat = /https?:\/\/[^"' \s<>\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^"' \s<>\\]*)?/gi;
  const all = [...html.matchAll(urlPat)].map(m => m[0]);
  for (const u of all) {
    const l = u.toLowerCase();
    if (!l.includes('logo') && !l.includes('icon') && !l.includes('avatar') && !l.includes('sprite') && !l.includes('_xs') && !l.includes('_tn') && u.length < 400) {
      found.add(u);
    }
  }
  // SeLoger CDN spécifique
  const sl = [...html.matchAll(/cdn-medias\.seloger\.com\/[^"' \s\\]+/gi)];
  sl.forEach(m => found.add('https://' + m[0].replace(/["'\\].*/,'')));
  // LeBonCoin
  const lbc = [...html.matchAll(/img\.leboncoin\.fr\/[^"' \s\\]+/gi)];
  lbc.forEach(m => found.add('https://' + m[0].replace(/["'\\].*/,'')));
  return [...found].slice(0, 12);
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
