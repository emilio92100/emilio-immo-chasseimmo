import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { texte, url } = await req.json();
    if (!texte || texte.trim().length < 30) {
      return NextResponse.json({ bien: null, error: 'Texte trop court' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const bien = await parseWithClaude(texte, url || '', apiKey);
        if (bien) return NextResponse.json({ bien, method: 'claude' });
      } catch { /* fallback */ }
    }

    const bien = parseTexteRegex(texte, url || '');
    return NextResponse.json({ bien, method: 'regex' });

  } catch (e: any) {
    return NextResponse.json({ bien: null, error: e.message });
  }
}

async function parseWithClaude(texte: string, url: string, apiKey: string) {
  const prompt = `Tu es un expert immobilier. Analyse ce texte d'annonce immobilière et extrait les informations structurées.
Réponds UNIQUEMENT avec un JSON valide, sans markdown ni texte autour.

${url ? `URL de l'annonce : ${url}` : ''}

Texte de l'annonce :
${texte.substring(0, 8000)}

Réponds avec ce JSON exact (null si non trouvé, ne jamais inventer) :
{
  "titre": "titre court descriptif du bien",
  "type_bien": "Appartement|Maison|Studio|Loft|Duplex|Villa|Terrain|Autre",
  "ville": "nom de la ville",
  "code_postal": "code postal 5 chiffres",
  "adresse": "adresse si mentionnée sinon null",
  "surface": null,
  "nb_pieces": null,
  "nb_chambres": null,
  "etage": null,
  "parking": false,
  "dpe": null,
  "prix_vendeur": null,
  "agence_nom": null,
  "agence_tel": null,
  "description": "description complète du bien",
  "balcon": false,
  "terrasse": false,
  "cave": false,
  "ascenseur": false
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
  return JSON.parse(jsonMatch[0]);
}

function parseTexteRegex(texte: string, _url: string) {
  const t = texte;
  const prixMatch = t.match(/(\d[\d\s]{3,9})\s*€/) || t.match(/prix\s*:?\s*(\d[\d\s]{2,9})/i);
  const prix = prixMatch ? parseInt(prixMatch[1].replace(/\s/g, '')) : null;
  const surfMatch = t.match(/(\d+(?:[,.]\d+)?)\s*m[²2]/i);
  const surface = surfMatch ? parseFloat(surfMatch[1].replace(',', '.')) : null;
  const piecesMatch = t.match(/(\d+)\s*pi[èe]ces?/i);
  const pieces = piecesMatch ? parseInt(piecesMatch[1]) : null;
  const chamMatch = t.match(/(\d+)\s*chambres?/i);
  const chambres = chamMatch ? parseInt(chamMatch[1]) : null;
  const etageMatch = t.match(/(\d+)(?:er|ème|e)?\s+[eé]tage/i);
  const etage = etageMatch ? parseInt(etageMatch[1]) : null;
  const cpMatch = t.match(/(\d{5})\s+([A-ZÀ-Ü][a-zà-ü\s-]{2,30})/);
  const cp = cpMatch?.[1] || '';
  const ville = cpMatch?.[2]?.trim() || '';
  const dpeMatch = t.match(/DPE\s*:?\s*([A-G])\b/i);
  const dpe = dpeMatch?.[1]?.toUpperCase() || '';
  let type_bien = 'Appartement';
  if (/\bmaison\b|\bvilla\b/i.test(t)) type_bien = 'Maison';
  else if (/\bstudio\b/i.test(t)) type_bien = 'Studio';
  else if (/\bloft\b/i.test(t)) type_bien = 'Loft';
  else if (/\bduplex\b/i.test(t)) type_bien = 'Duplex';
  return {
    titre: `${type_bien}${ville ? ` — ${ville}` : ''}`,
    type_bien, ville, code_postal: cp, adresse: '',
    surface: surface || null, nb_pieces: pieces || null,
    nb_chambres: chambres || null, etage: etage || null,
    parking: /parking|garage/i.test(t),
    dpe, prix_vendeur: prix || null,
    agence_nom: '', agence_tel: '',
    description: t.replace(/\s+/g, ' ').trim().substring(0, 500),
    balcon: /balcon/i.test(t), terrasse: /terrasse/i.test(t),
    cave: /cave/i.test(t), ascenseur: /ascenseur/i.test(t),
    photos: [],
  };
}
