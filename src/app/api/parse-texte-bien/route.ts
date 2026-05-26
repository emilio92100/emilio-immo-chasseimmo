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
        if (bien) {
          // Complète avec regex pour les champs souvent oubliés
          const enriched = enrichWithRegex(bien, texte);
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
{
  "titre": "titre court descriptif (max 80 chars)",
  "type_bien": "Appartement|Maison|Studio|Loft|Duplex|Villa|Terrain|Autre",
  "ville": "nom de la ville",
  "code_postal": "code postal 5 chiffres",
  "quartier": "nom du quartier si mentionné, sinon null",
  "adresse": "rue/adresse si mentionnée, sinon null",
  "surface": "surface en m² (nombre, sans unité)",
  "nb_pieces": "nombre de pièces (entier)",
  "nb_chambres": "nombre de chambres (entier)",
  "nb_salles_bain": "nombre de salles de bain ou d'eau (entier)",
  "nb_wc": "nombre de WC/toilettes (entier)",
  "etage": "étage du logement (0 = RDC, nombre)",
  "etage_total": "nombre total d'étages du bâtiment (nombre)",
  "annee_construction": "année de construction (entier 4 chiffres)",
  "exposition": "ex: 'sud', 'nord-sud', 'est-ouest', sinon null",
  "dpe": "lettre DPE : A, B, C, D, E, F ou G",
  "dpe_conso": "consommation DPE en kWh/m².an (entier)",
  "ges": "lettre GES : A, B, C, D, E, F ou G",
  "ges_emissions": "émissions GES en kg CO₂/m².an (entier)",
  "chauffage": "type de chauffage (central, individuel, électrique...)",
  "source_energie": "source d'énergie (gaz, électrique, fioul, pompe à chaleur...)",
  "prix_vendeur": "prix de vente en € (entier, sans espaces ni virgules)",
  "charges_trimestrielles": "charges de copropriété en € par trimestre (entier)",
  "taxe_fonciere": "taxe foncière annuelle en € (entier)",
  "etat_general": "état (neuf, refait, à rafraîchir, à rénover, entretenu...)",
  "agence_nom": "nom de l'agence ou 'Particulier' si propriétaire",
  "agence_tel": "téléphone si visible",
  "description": "description COMPLÈTE du bien (texte du vendeur, garde TOUT le détail)",
  "parking": "true si parking/garage/box mentionné",
  "balcon": "true si balcon mentionné",
  "terrasse": "true si terrasse mentionnée",
  "jardin": "true si jardin mentionné",
  "cave": "true si cave mentionnée",
  "ascenseur": "true si ascenseur mentionné",
  "gardien": "true si gardien/gardienne mentionné",
  "cuisine_equipee": "true si cuisine équipée mentionnée",
  "climatisation": "true si climatisation mentionnée",
  "traversant": "true si traversant mentionné",
  "surface_balcon": "surface du balcon en m² si précisée (nombre)",
  "surface_terrasse": "surface de la terrasse en m² si précisée (nombre)"
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
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok) return null;
  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]+\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]);

  // Nettoyage des types
  return {
    ...parsed,
    surface: typeof parsed.surface === 'string' ? parseFloat(parsed.surface) : parsed.surface,
    prix_vendeur: typeof parsed.prix_vendeur === 'string' ? parseInt(parsed.prix_vendeur) : parsed.prix_vendeur,
    nb_pieces: typeof parsed.nb_pieces === 'string' ? parseInt(parsed.nb_pieces) : parsed.nb_pieces,
    nb_chambres: typeof parsed.nb_chambres === 'string' ? parseInt(parsed.nb_chambres) : parsed.nb_chambres,
    nb_salles_bain: typeof parsed.nb_salles_bain === 'string' ? parseInt(parsed.nb_salles_bain) : parsed.nb_salles_bain,
    nb_wc: typeof parsed.nb_wc === 'string' ? parseInt(parsed.nb_wc) : parsed.nb_wc,
    etage: typeof parsed.etage === 'string' ? parseInt(parsed.etage) : parsed.etage,
    etage_total: typeof parsed.etage_total === 'string' ? parseInt(parsed.etage_total) : parsed.etage_total,
    annee_construction: typeof parsed.annee_construction === 'string' ? parseInt(parsed.annee_construction) : parsed.annee_construction,
    dpe_conso: typeof parsed.dpe_conso === 'string' ? parseInt(parsed.dpe_conso) : parsed.dpe_conso,
    ges_emissions: typeof parsed.ges_emissions === 'string' ? parseInt(parsed.ges_emissions) : parsed.ges_emissions,
    charges_trimestrielles: typeof parsed.charges_trimestrielles === 'string' ? parseInt(parsed.charges_trimestrielles) : parsed.charges_trimestrielles,
    taxe_fonciere: typeof parsed.taxe_fonciere === 'string' ? parseInt(parsed.taxe_fonciere) : parsed.taxe_fonciere,
    surface_balcon: typeof parsed.surface_balcon === 'string' ? parseFloat(parsed.surface_balcon) : parsed.surface_balcon,
    surface_terrasse: typeof parsed.surface_terrasse === 'string' ? parseFloat(parsed.surface_terrasse) : parsed.surface_terrasse,
    dpe: parsed.dpe ? String(parsed.dpe).toUpperCase().charAt(0) : null,
    ges: parsed.ges ? String(parsed.ges).toUpperCase().charAt(0) : null,
  };
}

// Complète les champs souvent ratés par l'IA avec regex
function enrichWithRegex(bien: Record<string, unknown>, texte: string) {
  const t = texte;

  // DPE : "DPE : E" ou "E\nConsommation"
  if (!bien.dpe) {
    const dpeMatch = t.match(/(?:DPE|diagnostic de performance.{0,30})[^\w]*([A-G])\b/i);
    if (dpeMatch) bien.dpe = dpeMatch[1].toUpperCase();
  }

  // GES
  if (!bien.ges) {
    const gesMatch = t.match(/(?:GES|gaz à effet de serre|émissions)[^\w]*([A-G])\b/i);
    if (gesMatch) bien.ges = gesMatch[1].toUpperCase();
  }

  // Conso DPE : "292 kWh/m²" ou "292 kWh"
  if (!bien.dpe_conso) {
    const consoMatch = t.match(/(\d{2,4})\s*kWh\/m[²2]/i);
    if (consoMatch) bien.dpe_conso = parseInt(consoMatch[1]);
  }

  // Émissions GES : "64 kg CO" ou "64 kgCO"
  if (!bien.ges_emissions) {
    const emisMatch = t.match(/(\d{1,4})\s*kg\s*CO/i);
    if (emisMatch) bien.ges_emissions = parseInt(emisMatch[1]);
  }

  // Exposition
  if (!bien.exposition) {
    const expoMatch = t.match(/exposition\s*:?\s*([a-zA-Zé\-\/\s]{3,30})/i);
    if (expoMatch) bien.exposition = expoMatch[1].trim().split(/[\n\.]/)[0].trim();
  }

  // Charges trimestrielles
  if (!bien.charges_trimestrielles) {
    const chMatch = t.match(/charges\s+trimestrielles?\s*:?\s*(?:environ\s+)?(\d{2,5})/i)
                 || t.match(/charges\s*:?\s*(?:environ\s+)?(\d{2,5})\s*€?\s*\/?\s*tri/i);
    if (chMatch) bien.charges_trimestrielles = parseInt(chMatch[1]);
  }

  // Taxe foncière
  if (!bien.taxe_fonciere) {
    const tfMatch = t.match(/taxe\s+fonci[èe]re\s*(?:\d{4})?\s*:?\s*(\d{3,6})/i);
    if (tfMatch) bien.taxe_fonciere = parseInt(tfMatch[1]);
  }

  // Année construction
  if (!bien.annee_construction) {
    const anneeMatch = t.match(/(?:construit|construction|ann[ée]e)\s*(?:en\s+)?(\d{4})/i);
    if (anneeMatch) {
      const annee = parseInt(anneeMatch[1]);
      if (annee >= 1800 && annee <= 2030) bien.annee_construction = annee;
    }
  }

  // Étage X/Y : "2ème étage/3 étages" ou "étage 2/3" ou "2/6"
  if (!bien.etage_total) {
    const etMatch = t.match(/(\d+)[ee][rm]?e?\s*[ée]tage\s*\/\s*(\d+)\s*[ée]tages?/i)
                 || t.match(/[ée]tage\s+(\d+)\s*\/\s*(\d+)/i);
    if (etMatch) {
      if (!bien.etage) bien.etage = parseInt(etMatch[1]);
      bien.etage_total = parseInt(etMatch[2]);
    }
  }

  // RDC
  if (bien.etage === null || bien.etage === undefined) {
    if (/\brez[\s-]de[\s-]chauss[ée]e\b|\bRDC\b/i.test(t)) bien.etage = 0;
  }

  // Chauffage
  if (!bien.chauffage) {
    if (/chauffage\s+central/i.test(t)) bien.chauffage = 'Central';
    else if (/chauffage\s+individuel/i.test(t)) bien.chauffage = 'Individuel';
    else if (/chauffage\s+collectif/i.test(t)) bien.chauffage = 'Collectif';
    else if (/chauffage\s+[ée]lectrique/i.test(t)) bien.chauffage = 'Électrique';
  }

  // Source énergie
  if (!bien.source_energie) {
    if (/pompe\s+[àa]\s+chaleur|PAC\b/i.test(t)) bien.source_energie = 'Pompe à chaleur';
    else if (/\bgaz\b/i.test(t)) bien.source_energie = 'Gaz';
    else if (/[ée]lectrique/i.test(t)) bien.source_energie = 'Électrique';
    else if (/fioul/i.test(t)) bien.source_energie = 'Fioul';
  }

  // Booleans manqués
  bien.balcon = bien.balcon || /\bbalcon\b/i.test(t);
  bien.terrasse = bien.terrasse || /\bterrasse\b/i.test(t);
  bien.cave = bien.cave || /\bcave\b/i.test(t);
  bien.ascenseur = bien.ascenseur || /\bascenseur\b/i.test(t);
  bien.jardin = bien.jardin || /\bjardin\b/i.test(t);
  bien.gardien = bien.gardien || /gardien(?:ne)?\b/i.test(t);
  bien.cuisine_equipee = bien.cuisine_equipee || /cuisine\s+[ée]quip[ée]e/i.test(t);
  bien.climatisation = bien.climatisation || /climatisation|climatis[ée]/i.test(t);
  bien.traversant = bien.traversant || /\btraversant\b/i.test(t);
  bien.parking = bien.parking || /\b(parking|garage|box)\b/i.test(t);

  // État général
  if (!bien.etat_general) {
    if (/aucun.{0,15}travaux|tr[èe]s\s+bon\s+[ée]tat/i.test(t)) bien.etat_general = 'Bon état';
    else if (/r[ée]nov[ée]/i.test(t)) bien.etat_general = 'Rénové';
    else if (/[àa]\s+rafra[îi]chir/i.test(t)) bien.etat_general = 'À rafraîchir';
    else if (/[àa]\s+r[ée]nover/i.test(t)) bien.etat_general = 'À rénover';
    else if (/neuf/i.test(t)) bien.etat_general = 'Neuf';
    else if (/entretenu/i.test(t)) bien.etat_general = 'Entretenu';
  }

  return bien;
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

  return enrichWithRegex(bien, t);
}
