/* ═══ Lire une annonce : les champs demandés à l'IA, et ce qu'on rattrape ═══
   V3.186. Alexandre : « la lecture par le lien, plus poussée… comme si
   c'était une veille ». Le lien (api/extract-bien) ne demandait que quatorze
   champs ; le texte copié (api/parse-texte-bien) en demandait une
   quarantaine. Les deux lisent désormais la MÊME liste, d'ici : l'étage et le
   nombre d'étages, l'année, l'exposition, le DPE et le GES avec leurs
   valeurs, le chauffage, les charges, la taxe foncière, l'état, les
   équipements, le séjour, et la situation (transports, environnement).

   Rien ici ne lit ni n'écrit la base : le serveur seulement (les deux
   routes), jamais le navigateur. */

import { CHAUFFAGE_MODES, CHAUFFAGE_ENERGIES, CHAUFFAGE_EMETTEURS, versListe } from '@/lib/chauffage';

/** La forme de la réponse demandée à l'IA, champ par champ. */
export const CHAMPS_ANNONCE = `{
  "titre": "titre court descriptif (max 80 chars)",
  "type_bien": "Appartement|Maison|Studio|Loft|Duplex|Villa|Terrain|Autre",
  "ville": "nom de la ville",
  "code_postal": "code postal 5 chiffres",
  "quartier": "nom du quartier si mentionné, sinon null",
  "adresse": "rue/adresse si mentionnée, sinon null",
  "situation": "les transports et l'environnement que l'annonce cite, en une phrase courte : stations (métro, RER, tram, bus) avec le temps à pied s'il est écrit, commerces, écoles, parc, calme ou animation. Ex. : 'Métro Marcel Sembat à 4 min à pied, commerces au pied de l'immeuble'. Seulement ce qui est écrit, sinon null",
  "surface": "surface en m² (nombre, sans unité)",
  "surface_sejour": "surface du séjour ou de la pièce de vie en m² si elle est donnée (nombre), sinon null",
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
  "chauffage": "Collectif ou Individuel, sinon null",
  "source_energie": "l'énergie du chauffage : Gaz, Électrique, Pompe à chaleur, Fioul, Bois, Réseau urbain ou Solaire, sinon null",
  "chauffage_emetteurs": "ce qui diffuse la chaleur : Radiateurs, Plancher chauffant, Plafond chauffant, Convecteurs, Air pulsé ou Poêle, sinon null",
  "prix_vendeur": "le PRIX PRINCIPAL affiché en gros dans l'annonce (le prix de vente annoncé, généralement FAI). TOUJOURS prendre CE prix affiché en grand. NE JAMAIS utiliser le prix 'hors honoraires' / 'net vendeur' / 'hors frais d'agence', même si une ventilation honoraires (prix net + commission) est détaillée plus bas dans l'annonce. Entier, sans espaces ni virgules.",
  "charges_trimestrielles": "charges de copropriété en € par trimestre (entier ; une charge annuelle se divise par 4, une mensuelle se multiplie par 3)",
  "taxe_fonciere": "taxe foncière annuelle en € (entier)",
  "etat_general": "état (neuf, refait, à rafraîchir, à rénover, entretenu...)",
  "agence_nom": "nom de l'agence ou 'Particulier' si propriétaire",
  "agence_tel": "téléphone si visible",
  "description": "description COMPLÈTE du bien (texte du vendeur, garde TOUT le détail)",
  "parking": "true si le bien a un parking, une place, un box ou un garage",
  "balcon": "true si le bien a un balcon",
  "terrasse": "true si le bien a une terrasse",
  "jardin": "true si le bien a un jardin",
  "cave": "true si le bien a une cave",
  "ascenseur": "true si l'immeuble a un ascenseur (« sans ascenseur » = false)",
  "gardien": "true si l'immeuble a un gardien ou une gardienne",
  "cuisine_equipee": "true si la cuisine est équipée",
  "climatisation": "true si le bien est climatisé",
  "traversant": "true si le bien est traversant",
  "surface_balcon": "surface du balcon en m² si précisée (nombre)",
  "surface_terrasse": "surface de la terrasse en m² si précisée (nombre)"
}`;

const entier = (v: unknown) => (typeof v === 'string' ? parseInt(v.replace(/[\s  ]/g, '')) : v);
const decimal = (v: unknown) => (typeof v === 'string' ? parseFloat(v.replace(/[\s  ]/g, '').replace(',', '.')) : v);
const lettre = (v: unknown) => (v ? String(v).toUpperCase().trim().charAt(0) || null : null);
/** « true », « oui » : une case cochée. */
const vrai = (v: unknown) => v === true || /^(true|oui|yes|1)$/i.test(String(v ?? '').trim());

/** Les nombres écrits en texte par l'IA (« 72,5 », « 1 200 ») redeviennent des nombres. */
export function nettoyerLecture(parsed: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...parsed };
  for (const k of ['surface', 'surface_sejour', 'surface_balcon', 'surface_terrasse']) out[k] = decimal(parsed[k]);
  for (const k of ['prix_vendeur', 'nb_pieces', 'nb_chambres', 'nb_salles_bain', 'nb_wc', 'etage', 'etage_total',
    'annee_construction', 'dpe_conso', 'ges_emissions', 'charges_trimestrielles', 'taxe_fonciere']) out[k] = entier(parsed[k]);
  for (const k of Object.keys(out)) if (typeof out[k] === 'number' && !isFinite(out[k] as number)) out[k] = null;
  for (const k of ['parking', 'balcon', 'terrasse', 'jardin', 'cave', 'ascenseur', 'gardien', 'cuisine_equipee', 'climatisation', 'traversant']) out[k] = vrai(parsed[k]);
  out.dpe = lettre(parsed.dpe);
  out.ges = lettre(parsed.ges);
  for (const k of ['quartier', 'adresse', 'situation', 'exposition', 'etat_general', 'agence_tel']) {
    const t = String(parsed[k] ?? '').trim();
    out[k] = t && !/^(null|non précisé|inconnu|n\/a)$/i.test(t) ? t : null;
  }
  return out;
}

/* « sans ascenseur », « pas de cave », « ni balcon » : le mot est là, la
   chose non. Une mention ne compte que si rien ne la nie juste avant. */
const NEGATION = /(?:\bsans|\bpas\s+d[e'’]?|\baucune?|\bni|\bnon|\babsence\s+d[e'’]?)\s*(?:de\s+|d[’']\s*)?(?:la\s+|le\s+|l[’']\s*)?$/i;
export function mentionne(t: string, re: RegExp): boolean {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  for (const m of t.matchAll(g)) {
    const avant = t.slice(Math.max(0, (m.index ?? 0) - 18), m.index ?? 0);
    if (!NEGATION.test(avant)) return true;
  }
  return false;
}

/* Ce que l'IA oublie souvent, rattrapé dans le texte : le DPE et ses valeurs,
   l'exposition, les charges, la taxe, l'année, l'étage, le chauffage, l'état,
   les équipements. Sorti de api/parse-texte-bien (V3.186), à l'identique. */
export function completerParRegex(bien: Record<string, unknown>, texte: string) {
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

  // Chauffage (V3.171 : trois cases — collectif ou individuel, énergie, diffusion)
  if (!bien.chauffage) {
    if (/chauffage[^.\n]{0,30}collectif|collectif[^.\n]{0,15}chauffage/i.test(t)) bien.chauffage = 'Collectif';
    else if (/chauffage[^.\n]{0,30}individuel|individuel[^.\n]{0,15}chauffage/i.test(t)) bien.chauffage = 'Individuel';
    else if (/chauffage\s+central/i.test(t)) bien.chauffage = 'Central';
  }

  // Source énergie
  if (!bien.source_energie) {
    if (/pompe\s+[àa]\s+chaleur|PAC\b/i.test(t)) bien.source_energie = 'Pompe à chaleur';
    else if (/r[ée]seau\s+(?:de\s+)?chaleur|chauffage\s+urbain|\bCPCU\b/i.test(t)) bien.source_energie = 'Réseau urbain';
    else if (/\bgaz\b/i.test(t)) bien.source_energie = 'Gaz';
    else if (/chauffage[^.\n]{0,30}[ée]lectrique|[ée]lectrique[^.\n]{0,15}chauffage/i.test(t)) bien.source_energie = 'Électrique';
    else if (/fioul/i.test(t)) bien.source_energie = 'Fioul';
  }

  // Diffusion
  if (!bien.chauffage_emetteurs) {
    if (/plancher\s+chauffant|chauffage\s+au\s+sol|sol\s+chauffant/i.test(t)) bien.chauffage_emetteurs = 'Plancher chauffant';
    else if (/plafond\s+chauffant|chauffage\s+(?:par\s+le|au)\s+plafond/i.test(t)) bien.chauffage_emetteurs = 'Plafond chauffant';
    else if (/air\s+puls[ée]/i.test(t)) bien.chauffage_emetteurs = 'Air pulsé';
    else if (/convecteur/i.test(t)) bien.chauffage_emetteurs = 'Convecteurs';
    else if (/radiateur/i.test(t)) bien.chauffage_emetteurs = 'Radiateurs';
  }

  // Les mots des menus du CRM (« gaz » → « Gaz »)
  bien.chauffage = versListe(CHAUFFAGE_MODES, bien.chauffage);
  bien.source_energie = versListe(CHAUFFAGE_ENERGIES, bien.source_energie);
  bien.chauffage_emetteurs = versListe(CHAUFFAGE_EMETTEURS, bien.chauffage_emetteurs);

  // Booleans manqués — V3.186 : « sans ascenseur », « pas de cave » ne
  // cochent plus la case (l'étage maximum sans ascenseur est un seuil dur).
  bien.balcon = bien.balcon || mentionne(t, /\bbalcon\b/i);
  bien.terrasse = bien.terrasse || mentionne(t, /\bterrasse\b/i);
  bien.cave = bien.cave || mentionne(t, /\bcave\b/i);
  bien.ascenseur = bien.ascenseur || mentionne(t, /\bascenseur\b/i);
  bien.jardin = bien.jardin || mentionne(t, /\bjardin\b/i);
  bien.gardien = bien.gardien || mentionne(t, /gardien(?:ne)?\b/i);
  bien.cuisine_equipee = bien.cuisine_equipee || mentionne(t, /cuisine\s+[ée]quip[ée]e/i);
  bien.climatisation = bien.climatisation || mentionne(t, /climatisation|climatis[ée]/i);
  bien.traversant = bien.traversant || mentionne(t, /\btraversant\b/i);
  bien.parking = bien.parking || mentionne(t, /\b(parking|garage|box)\b/i);

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
