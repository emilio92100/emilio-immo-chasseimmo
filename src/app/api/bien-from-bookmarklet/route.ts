import { NextRequest, NextResponse } from 'next/server';

// Configuration CORS pour permettre l'appel depuis n'importe quel site (le bookmarklet)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function POST(req: NextRequest) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { html, url, title } = await req.json();

    if (!html) {
      return NextResponse.json(
        { bien: null, error: 'HTML requis' },
        { status: 400, headers: corsHeaders }
      );
    }

    const portail = detectPortail(url || '');

    // Récupérer les photos directement depuis le HTML
    const photos = extractPhotos(html);

    // Extraire les infos via Claude
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { bien: null, error: 'API key manquante' },
        { status: 500, headers: corsHeaders }
      );
    }

    const bien = await extractWithClaude(html, url || '', title || '', portail, apiKey);

    if (!bien) {
      return NextResponse.json(
        { bien: null, error: 'Extraction échouée' },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        bien: {
          ...bien,
          source_portail: portail,
          photos: photos.length > 0 ? photos : (bien.photos || []),
          url: url || '',
        },
      },
      { headers: corsHeaders }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    return NextResponse.json(
      { bien: null, error: msg },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function extractWithClaude(
  html: string,
  url: string,
  title: string,
  portail: string,
  apiKey: string
) {
  // On nettoie le HTML : on garde uniquement le texte + les JSON-LD utiles
  const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const metaDesc = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1] || '';

  const textContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 8000);

  const context = [
    jsonLdMatches.join('\n').substring(0, 3000),
    `TITLE: ${title}`,
    `META: ${metaDesc}`,
    `TEXT: ${textContent}`,
  ]
    .filter(Boolean)
    .join('\n\n')
    .substring(0, 12000);

  const prompt = `Tu es un extracteur de données immobilières. Extrais les informations de cette annonce et réponds UNIQUEMENT avec un JSON valide (pas de markdown, pas de texte autour).

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
  "agence_tel": "..."
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
  const jsonMatch = text.match(/\{[\s\S]+\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
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
  if (url.includes('bellesdemeures.com')) return 'Belles Demeures';
  if (url.includes('era.fr')) return 'ERA';
  if (url.includes('guy-hoquet.com')) return 'Guy Hoquet';
  if (url.includes('fnaim.fr')) return 'FNAIM';
  return 'Autre';
}

function extractPhotos(html: string): string[] {
  const found = new Set<string>();
  const urlPat = /https?:\/\/[^"' \s<>\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^"' \s<>\\]*)?/gi;
  const all = [...html.matchAll(urlPat)].map((m) => m[0]);
  for (const u of all) {
    const l = u.toLowerCase();
    if (
      !l.includes('logo') &&
      !l.includes('icon') &&
      !l.includes('avatar') &&
      !l.includes('sprite') &&
      !l.includes('_xs') &&
      !l.includes('_tn') &&
      u.length < 400
    ) {
      found.add(u);
    }
  }
  return [...found].slice(0, 12);
}
