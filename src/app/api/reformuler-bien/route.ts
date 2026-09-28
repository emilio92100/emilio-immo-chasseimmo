import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { description } = await req.json();
    if (!description || description.trim().length < 20) {
      return NextResponse.json({ description: null, error: 'Description trop courte' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ description: null, error: 'no_key' });
    }

    /* La longueur suit ce que l'annonce apprend, pas le nombre de lignes du
       confrère : court quand il y a peu, une synthèse plus ample quand
       l'annonce est riche. Et jamais sa voix ni son plan. */
    const prompt = `Tu es un chasseur immobilier professionnel. Présente ce bien à un acquéreur à partir de la description d'annonce ci-dessous. Tu n'es pas l'auteur de l'annonce : ton texte ne doit jamais donner l'impression de la relire.

RÈGLES STRICTES :
- Supprime TOUTE mention d'agence, de confrère, de cabinet, de mandataire et leur nom (ex. "Hosman vous propose", "L'agence X", "Votre conseiller Y", "Coldwell...", "Century 21..."). Aucun nom de société ne doit rester.
- Supprime aussi : numéros de téléphone, emails, sites web, références d'annonce.
- Ne réécris PAS le montant du prix, ni les honoraires, ni la commission (ils sont gérés ailleurs dans la fiche).
- En revanche, CONSERVE fidèlement le statut "compris dans le prix" / "inclus" OU "en sus" / "en supplément" / "en option" d'un élément (cave, parking, box, lot, mobilier...) — mais UNIQUEMENT s'il est écrit noir sur blanc dans l'annonce d'origine.
- Rattache CHAQUE statut à l'élément EXACT concerné. Ne transfère JAMAIS le statut d'un élément à un autre et ne le déduis jamais : si seul le parking est indiqué "en sus", n'écris RIEN sur le statut de la cave (ni "comprise", ni "en sus").
- Si l'annonce ne précise pas si un élément est compris ou en sus, n'en dis rien.
- Supprime les formules commerciales creuses ("coup de cœur assuré", "à visiter sans tarder", "ne tardez pas", "rare sur le secteur"...).
- Ton sobre, valorisant, factuel, orienté acquéreur. Pas de superlatifs excessifs.
- Reste strictement fidèle aux informations données : n'invente rien, ne déduis rien. Si une information n'est pas explicitement écrite, ne l'écris pas.
- Ne répète pas inutilement les chiffres (surface, nombre de pièces) déjà affichés ailleurs dans la fiche.

LA LONGUEUR SUIT L'INFORMATION, PAS L'ANNONCE :
- Compte ce que l'annonce apprend vraiment sur le bien, pas son nombre de lignes : une annonce longue peut ne dire que peu de choses.
- Annonce pauvre (quelques faits) : 2 à 4 phrases, en un ou deux paragraphes. Ne gonfle jamais : aucune phrase pour meubler, aucune généralité que l'annonce ne donne pas.
- Annonce moyenne : deux ou trois paragraphes courts.
- Annonce riche (distribution pièce par pièce, état, travaux, immeuble, environnement) : trois ou quatre paragraphes, 250 mots au plus. Synthétise : regroupe, garde ce qui aide l'acquéreur à se projeter ou à décider, laisse le reste. Ne reprends jamais tout.

UN AUTRE AUTEUR, UN AUTRE PLAN :
- Range les faits dans cet ordre, en ne gardant que les paragraphes qui ont de la matière : 1) l'essentiel : ce qu'est le bien, sa place dans l'immeuble (étage, ascenseur, exposition, vue), ce qui le distingue ; 2) la vie dedans : pièce de vie, cuisine, chambres, salle d'eau, rangements ; 3) l'état et le reste : état, travaux, chauffage, extérieur, cave, parking ; 4) autour : l'immeuble, la copropriété, les transports, les commerces, les écoles, seulement si l'annonce en parle.
- Tes mots, pas les siens : aucune phrase reprise, aucune tournure reconnaissable, jamais plus de trois ou quatre mots d'affilée identiques à l'annonce, sauf noms propres (rue, station, école) et termes techniques.
- Pas la voix d'une agence : ni "nous vous proposons", ni "venez découvrir", ni "notre exclusivité". Le texte décrit le bien, il ne le vend pas.
- Paragraphes séparés par une ligne vide. Pas de liste à puces. Pas de titre. Pas de markdown.

Réponds UNIQUEMENT avec le texte reformulé, sans guillemets, sans préambule.

Description originale :
${String(description).substring(0, 8000)}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      return NextResponse.json({ description: null, error: `api_${response.status}` });
    }

    const data = await response.json();
    let texte = (data.content?.[0]?.text || '').trim();
    // Retire d'éventuels guillemets entourants
    texte = texte.replace(/^["«»\s]+|["«»\s]+$/g, '').trim();
    if (!texte) return NextResponse.json({ description: null, error: 'empty' });

    return NextResponse.json({ description: texte });

  } catch (e: unknown) {
    return NextResponse.json({ description: null, error: (e as Error).message });
  }
}
