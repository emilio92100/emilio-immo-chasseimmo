import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_BADGE, badgeValide } from '@/lib/badge';
import { dateValide, lireLecture, type DemandeLecture, type Lecture } from '@/lib/import-immofacile';

/* ═══ Importer depuis ImmoFacile : lire les commentaires (V3.61) ════════════
   L'écran d'import (components/contacts/ImportImmoFacile.tsx) a déjà lu les
   colonnes. Il envoie ici, par petits lots, le texte libre de chaque contact
   (« Précision 1 », « Commentaires ») — sans nom, ni téléphone, ni e-mail —
   et reçoit ce que Claude y a lu : la recherche décrite dans le commentaire,
   les critères en plus, son bien, un projet de vente et la date du rappel,
   ce qui va dans « À savoir ».

   Rien n'est écrit en base ici. Route du CRM : derrière le badge (proxy.ts),
   vérifié une seconde fois ci-dessous, parce qu'elle consomme la clé Claude.
   Jamais de donnée personnelle dans les journaux du serveur : seulement le
   code de l'erreur. Même modèle et même clé que parse-texte-bien et
   reformuler-bien. Toute réponse est nettoyée par `lireLecture`
   (src/lib/import-immofacile.ts) : nombres bornés, listes fermées.

   Une réponse coupée (trop longue) n'est pas perdue en entier : les
   contacts complets sont gardés, l'écran relit les autres par deux. Une clé
   rendue deux fois (le texte d'un contact qui parlerait d'un autre) : les
   deux lectures tombent. Les e-mails et téléphones lus ne sont gardés par
   l'écran que s'ils sont écrits dans le texte de CE contact (`planifier`). */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODELE = 'claude-haiku-4-5-20251001';
/* Au plus 8 contacts par appel (l'écran en envoie 6) : la réponse doit
   tenir dans le délai d'une route Vercel. */
const PAR_APPEL = 8;

const CONSIGNES = `Tu aides Alexandre, agent immobilier et chasseur d'appartements à Paris et dans les Hauts-de-Seine, à reprendre les fiches clients de son ancien logiciel (ImmoFacile) dans son nouveau CRM.

Pour chaque contact tu reçois : son statut dans ImmoFacile (« Propriétaire » = il possède un logement ; « Demandeur » = il cherche à acheter), les critères déjà remplis dans les colonnes, les « précisions » de sa recherche, et le commentaire libre d'Alexandre (notes datées, prises au téléphone, très abrégées ; parfois suivies du message que le contact a laissé sur un portail).

Tu lis ces textes et tu rends ce qu'ils disent. Tu n'inventes rien : une information absente reste null, false ou une liste vide.

Abréviations d'Alexandre : « 3P » = 3 pièces ; « 2ch » = 2 chambres ; « K » = milliers d'euros (« 1 100K » = 1 100 000, « 950K » = 950 000) ; « HFN » = hors frais de notaire (c'est le budget) ; « RDC » = rez-de-chaussée ; « asc » = ascenseur ; « ext » = extérieur ; « SDB » = salle de bains ; « MB » = Marcel Sembat (quartier de Boulogne) ; « Vente après avoir trouvé » = il vendra son logement après avoir acheté ; « AC3 OK » = consentement enregistré dans ImmoFacile (à ignorer) ; « DVF » = prix de vente publics.

Sépare toujours trois choses :
- CE QU'IL CHERCHE (son achat) → "recherche" ;
- CE QU'IL POSSÈDE (son logement actuel : « Propriétaire d'un 3P 75 m² ») → "bien", jamais dans "recherche" ;
- l'annonce sur laquelle il a appelé (« Demande info sur … », « ref: 241799031 depuis Belles Demeures ») : ni sa recherche ni son bien → une phrase de "aSavoir".

Réponds UNIQUEMENT par un objet JSON valide, sans texte ni balise autour :
{"contacts":[ un objet par contact reçu, avec sa "cle" recopiée à l'identique ]}

Toutes les listes sont des tableaux JSON, même avec un seul élément, jamais une chaîne : "precisions": ["Box fermé pour trois voitures.", "Quartier calme."], "aSavoir": ["…", "…"], "secteurs": ["Boulogne-Billancourt"].

Chaque objet :
{
"cle": "la clé reçue",
"recherche": null s'il ne cherche pas à acheter, sinon {
  "types": un tableau parmi ["Appartement","Maison","Loft","Duplex","Terrain","Autre"],
  "budgetMin": euros ou null, "budgetMax": euros ou null,
  "surfaceMin": m² ou null, "surfaceMax": m² ou null, "piecesMin": nombre ou null, "piecesMax": nombre ou null, "chambresMin": nombre ou null,
  "secteurs": un tableau des communes ou arrondissements, écrits en entier (« Boulogne-Billancourt », « Paris 15e », « Issy-les-Moulineaux ») ; les quartiers et les rues vont dans "precisions",
  "equipements": [{"cle": "parking"|"cave"|"balcon"|"terrasse"|"jardin"|"gardien"|"interphone"|"digicode"|"exterieur"|"ascenseur", "niveau": "souhaite"|"indispensable"}] ; « obligatoire », « impératif », « indispensable », un mot écrit en MAJUSCULES pour insister = "indispensable" ; « de préférence », « idéalement », « + » = "souhaite" ; un box ou un garage = "parking" ; « balcon ou terrasse » = "exterieur" ; jamais un équipement qu'il refuse,
  "rdcExclu": true s'il ne veut pas de rez-de-chaussée, "dernierEtage": true s'il veut le dernier étage,
  "etageMin": nombre ou null (« à partir du 1er » = 1), "etageMax": nombre ou null,
  "etageMaxSansAscenseur": l'étage le plus haut accepté sans ascenseur, ou null (« 3e sans asc pas bloquant » = 3),
  "cuisine": "ouverte"|"separee"|null (« cuisine indépendante » = "separee" ; « pas de préférence » = null), "cuisineNiveau": "souhaite"|"indispensable"|null,
  "exposition": un tableau des orientations SOUHAITÉES parmi ["sud","est","ouest","nord","traversant"] (un refus, « pas de ouest », va dans "precisions"),
  "etat": un tableau des états acceptés parmi ["a_renover","travaux_legers","bon_etat","refait_neuf"] ; rien s'il ne dit rien ; « travaux ok », « avec travaux why not » = les quatre ; « sans travaux » = ["bon_etat","refait_neuf"],
  "sejourMin": m² du séjour ou null, "exterieurMin": m² d'extérieur minimum ou null, "anneeMin": année de construction minimum ou null,
  "financement": "cash"|"pret_valide"|"pret_en_cours"|"a_monter"|"pret_relais"|"mixte_cash_pret"|"mixte_cash_relais"|"mixte_pret_relais"|null,
  "urgence": "immediate"|"3_mois"|"6_mois"|"annee"|null,
  "precisions": un tableau de phrases courtes sur ce qu'il cherche et qui n'ont pas de case ci-dessus : quartier, rues à éviter, vue, calme, vis-à-vis, proximité d'une école, du métro ou des commerces, « pas au dernier étage », « RDC accepté s'il y a un extérieur », « deux salles d'eau idéalement ». Une nuance sur un chiffre s'écrit toujours en phrase, même si le chiffre est déjà dans les colonnes : « 3ch (3ème peut être petite) » → « Trois chambres, la troisième peut être petite. » Écrites proprement, sans abréviation, sans « il » ni « vous » : le client pourra les lire. Exemple : « Box fermé pour trois voitures, ou places de stationnement équivalentes. » Jamais rien sur son logement actuel, sa vente, son financement ni sa vie privée.
},
"location": une phrase s'il cherche aussi (ou seulement) à louer, sinon null,
"proprietaire": true si le texte dit qu'il possède un logement,
"bien": null, ou son logement actuel {
  "type": "appartement"|"maison"|"duplex"|"studio"|"loft"|"terrain"|"local"|"parking"|"immeuble"|"autre"|null,
  "surface": m² ou null, "pieces": nombre ou null, "chambres": nombre ou null, "etage": nombre ou null (RDC = 0),
  "adresse": numéro et rue s'ils sont écrits, sinon null, "codePostal": 5 chiffres ou null, "ville": ou null,
  "valeur": le prix qu'il en espère, ou l'estimation citée, en euros, ou null,
  "resume": une ligne (« appartement de 3 pièces, 75 m², dernier étage, balcon »),
  "notes": ce qui sert pour le vendre : état, travaux faits, année et prix d'achat, en une ou deux phrases
},
"vente": {
  "projet": "aucun" | "apres_achat" (il vendra son logement après avoir acheté) | "projet" (un vrai projet de vente : estimation demandée ou prévue, « projet de vente à venir », « rappeler pour estimation ») | "ailleurs" (déjà en vente avec une autre agence) | "vendu" (déjà vendu, ou sous compromis),
  "aSuivre": true seulement si Alexandre doit suivre ce projet de vente (cas "projet", ou "apres_achat" avec une estimation à faire),
  "rappel": {"date": "AAAA-MM-JJ" si une date précise de rappel est écrite, sinon null, "mois": 1 à 12 si un mois est cité (« rappeler en septembre » = 9 ; deux mois, « septembre/octobre » = le dernier, 10), sinon null, "annee": l'année si elle est écrite ou se déduit de la date de la note, sinon null, "texte": la consigne, courte, ou null}
},
"aSavoir": un tableau de phrases courtes, pour Alexandre seul, sur la personne et son histoire : comment il est arrivé (annonce, panneau, portail), sa situation, ses délais, son financement, ce qui a été fait ou promis, avec les dates. Une idée par phrase, sans abréviation, dans l'ordre des dates. Pas les critères de recherche déjà rendus plus haut, pas les formules de politesse des messages de portail,
"emails": un tableau des adresses e-mail écrites dans le texte (pas celles d'une agence), "telephones": un tableau des numéros écrits dans le texte
}

Pour le rappel, prends la consigne la PLUS RÉCENTE. Une date relative (« demain », « dans 1 an », « semaine pro ») se calcule à partir de la date de la note où elle est écrite.`;

/* Ce que l'écran envoie, borné : rien d'autre ne part chez Claude. */
function demandesDe(corps: unknown): { aujourdhui: string; demandes: DemandeLecture[] } {
  const o = (corps && typeof corps === 'object' ? corps : {}) as Record<string, unknown>;
  const t = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
  const aujourdhui = dateValide(o.aujourdhui) ? o.aujourdhui : new Date().toISOString().slice(0, 10);
  const demandes = (Array.isArray(o.contacts) ? o.contacts : []).slice(0, PAR_APPEL).map(x => {
    const d = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    return {
      cle: t(d.cle, 200), statut: t(d.statut, 60), creeLe: dateValide(d.creeLe) ? d.creeLe : null,
      criteres: t(d.criteres, 800),
      precisions: (Array.isArray(d.precisions) ? d.precisions : []).slice(0, 3).map(p => t(p, 2000)).filter(Boolean),
      commentaire: t(d.commentaire, 6000),
    };
  }).filter(d => d.cle && (d.commentaire || d.precisions.length));
  return { aujourdhui, demandes };
}

/* Le JSON de la réponse, même entouré de ```json … ```. */
function json(texte: string): unknown {
  const a = texte.indexOf('{'), b = texte.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(texte.slice(a, b + 1)); } catch { return null; }
}

/* Les objets du tableau "contacts". Si la réponse est coupée ou mal fermée,
   ceux qui sont complets, un par un. */
function contactsDe(texte: string): unknown[] {
  const brut = json(texte) as { contacts?: unknown[] } | null;
  if (Array.isArray(brut?.contacts)) return brut.contacts;
  const i = texte.indexOf('[', Math.max(0, texte.indexOf('"contacts"')));
  if (i < 0) return [];
  const out: unknown[] = [];
  let prof = 0, debut = -1, chaine = false, echap = false;
  for (let k = i + 1; k < texte.length; k++) {
    const ch = texte[k];
    if (chaine) {
      if (echap) echap = false;
      else if (ch === '\\') echap = true;
      else if (ch === '"') chaine = false;
      continue;
    }
    if (ch === '"') chaine = true;
    else if (ch === '{') { if (prof === 0) debut = k; prof++; }
    else if (ch === '}') {
      prof--;
      if (prof < 0) break;
      if (prof === 0 && debut >= 0) {
        try { out.push(JSON.parse(texte.slice(debut, k + 1))); } catch { /* objet illisible : laissé de côté */ }
        debut = -1;
      }
    } else if (ch === ']' && prof === 0) break;
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!(await badgeValide(req.cookies.get(COOKIE_BADGE)?.value))) {
    return NextResponse.json({ lectures: [], erreur: 'non_autorise' }, { status: 401 });
  }
  let corps: unknown = null;
  try { corps = await req.json(); } catch { return NextResponse.json({ lectures: [], erreur: 'demande_illisible' }, { status: 400 }); }
  const { aujourdhui, demandes } = demandesDe(corps);
  if (!demandes.length) return NextResponse.json({ lectures: [] });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ lectures: [], erreur: 'cle_absente' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODELE,
        max_tokens: 8000,
        system: CONSIGNES,
        messages: [{ role: 'user', content: `Aujourd'hui : ${aujourdhui}.\n\nContacts :\n${JSON.stringify(demandes, null, 1)}` }],
      }),
      signal: AbortSignal.timeout(55000),
    });
    if (!response.ok) {
      console.error(`[import-immofacile] Claude a répondu ${response.status}`);
      return NextResponse.json({ lectures: [], erreur: `api_${response.status}` });
    }
    const data = await response.json() as { content?: { type?: string; text?: string }[]; stop_reason?: string };
    const texte = (data.content || []).map(c => c.text || '').join('');
    const liste = contactsDe(texte);
    const cleDe = (y: unknown) => (y && typeof y === 'object' ? (y as Record<string, unknown>).cle : undefined);
    const lectures: Lecture[] = [];
    for (const d of demandes) {
      const x = liste.filter(y => cleDe(y) === d.cle);
      const l = x.length === 1 ? lireLecture(x[0], d.cle) : null;
      if (l) lectures.push(l);
    }
    if (lectures.length < demandes.length) console.error(`[import-immofacile] ${demandes.length - lectures.length} lecture(s) manquante(s) sur ${demandes.length}${data.stop_reason === 'max_tokens' ? ' (réponse coupée)' : ''}`);
    return NextResponse.json({ lectures });
  } catch (e) {
    console.error(`[import-immofacile] lecture impossible : ${(e as Error)?.name || 'erreur'}`);
    return NextResponse.json({ lectures: [], erreur: 'lecture' });
  }
}
