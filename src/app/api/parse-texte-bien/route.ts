import { NextRequest, NextResponse } from 'next/server';
import { CHAMPS_ANNONCE, nettoyerLecture, completerParRegex } from '@/lib/lecture-annonce';

/* V3.186 : une quarantaine de champs et la description complète prennent
   plus de temps à écrire. */
export const maxDuration = 60;

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
        if (bien) {
          // Complète avec regex pour les champs souvent oubliés (lib/lecture-annonce.ts)
          const enriched = completerParRegex(bien, texte);
          return NextResponse.json({ bien: enriched, method: 'claude' });
        }
      } catch { /* fallback */ }
    }

    const bien = parseTexteRegex(texte, url || '');
    return NextResponse.json({ bien, method: 'regex' });

  } catch (e: unknown) {
    return NextResponse.json({ bien: null, error: (e as Error).message });
  }
}

async function parseWithClaude(texte: string, url: string, apiKey: string) {
  const prompt = `Tu es un expert immobilier. Analyse ce texte d'annonce immobilière copié-collé depuis un portail (SeLoger, Logic-Immo, Bien'ici...) et extrait TOUTES les informations.

Réponds UNIQUEMENT avec un JSON valide, sans markdown ni texte autour. Ne JAMAIS inventer une valeur — mettre null si non trouvée.

${url ? `URL : ${url}` : ''}

Texte :
${texte.substring(0, 12000)}

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
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) return null;
  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]+\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]);

  // Nettoyage des types (V3.186 : lib/lecture-annonce.ts, le même que la lecture par le lien)
  return nettoyerLecture(parsed);
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
  const cpMatch = t.match(/(\d{5})\s+([A-ZÀ-Ü][a-zà-ü\s-]{2,30})/);
  const cp = cpMatch?.[1] || '';
  const ville = cpMatch?.[2]?.trim() || '';
  let type_bien = 'Appartement';
  if (/\bmaison\b|\bvilla\b/i.test(t)) type_bien = 'Maison';
  else if (/\bstudio\b/i.test(t)) type_bien = 'Studio';
  else if (/\bloft\b/i.test(t)) type_bien = 'Loft';
  else if (/\bduplex\b/i.test(t)) type_bien = 'Duplex';

  const bien = {
    titre: `${type_bien}${ville ? ` — ${ville}` : ''}`,
    type_bien, ville, code_postal: cp, adresse: '',
    surface: surface || null,
    nb_pieces: pieces || null,
    nb_chambres: chambres || null,
    prix_vendeur: prix || null,
    agence_nom: '', agence_tel: '',
    description: t.replace(/\s+/g, ' ').trim().substring(0, 2000),
    photos: [],
    parking: false, balcon: false, terrasse: false, cave: false, ascenseur: false,
    jardin: false, gardien: false, cuisine_equipee: false, climatisation: false, traversant: false,
  } as Record<string, unknown>;

  return completerParRegex(bien, t);
}
