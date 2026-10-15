import type { SupabaseClient } from '@supabase/supabase-js';
import { garder, court, memoireRecherches, dossierRecherche } from '@/lib/dossier-recherche';
import type { Analyse, VerdictAnalyse } from '@/lib/analyse-bien';

/* ═══ L'analyse d'un bien pour une recherche, côté serveur (V3.197) ═══════
   Sortie de api/analyse-bien (V3.186) pour servir à deux endroits :
     - les annonces que le client envoie (le CRM appelle api/analyse-bien) ;
     - les biens proposés par une agence par son lien (api/agences/proposer
       l'appelle directement, juste après l'envoi : Alexandre trouve le bien
       déjà noté dans sa Veille).
   La consigne change seulement par qui a proposé le bien (le client lui-même,
   ou un confrère) ; les règles de la veille sont les mêmes. Serveur
   seulement : la clé de l'IA ne quitte jamais le serveur. */

export type Source = 'client' | 'agence';
export type ResultatAnalyse =
  | { ok: true; analyse: Analyse; modele: string; photos: number }
  | { ok: false; erreur: string; status: number };

const MODELES = ['claude-sonnet-5-5', 'claude-haiku-4-5-20251001'];
const PHOTOS_MAX = 5;

const OUTIL = {
  name: 'rendre_analyse',
  description: 'Rend l’analyse du bien pour cette recherche, avec les règles de la veille.',
  input_schema: {
    type: 'object',
    properties: {
      score: { type: 'integer', minimum: 0, maximum: 100, description: 'La note sur 100, selon les tranches de la veille' },
      verdict: { type: 'string', enum: ['priorite', 'appeler', 'reserve', 'ecarter'], description: 'Il suit la note : 85+ priorite, 70–84 appeler, 50–69 reserve, sous 50 ecarter' },
      appreciation: { type: 'string', description: 'Une seule phrase qui tranche, pour Alexandre (260 caractères au plus)' },
      points_forts: { type: 'array', items: { type: 'string' }, description: 'De 0 à 4 atouts pour CE client, une idée par ligne, le plus décisif d’abord' },
      points_attention: { type: 'array', items: { type: 'string' }, description: 'De 0 à 4 points d’attention, le plus décisif d’abord ; ce qui bloque ou doit être tranché commence par « ⚠️ »' },
    },
    required: ['score', 'verdict', 'appreciation', 'points_forts', 'points_attention'],
  },
};

/* La fiche du bien telle que l'IA la lit : les faits, sans l'agence ni
   son téléphone. Les cases à cocher ne partent que cochées (une case vide
   veut dire « l'annonce n'en parle pas »). */
const CLES_BIEN = [
  'titre', 'type_bien', 'ville', 'code_postal', 'quartier', 'situation', 'surface', 'surface_sejour', 'nb_pieces', 'nb_chambres',
  'nb_salles_bain', 'nb_wc', 'etage', 'etage_total', 'annee_construction', 'exposition', 'dpe', 'dpe_conso', 'ges', 'ges_emissions',
  'chauffage', 'source_energie', 'chauffage_emetteurs', 'surface_balcon', 'surface_terrasse', 'etat_general',
  'charges_trimestrielles', 'charges_comprises', 'taxe_fonciere',
];
const CASES: Record<string, string> = {
  parking: 'parking', balcon: 'balcon', terrasse: 'terrasse', jardin: 'jardin', cave: 'cave', ascenseur: 'ascenseur',
  gardien: 'gardien', cuisine_equipee: 'cuisine équipée', climatisation: 'climatisation', traversant: 'traversant',
};
function bienPourIA(b: Record<string, unknown>): Record<string, unknown> {
  const x = garder(b, CLES_BIEN);
  /* `etage` 0 (rez-de-chaussée) est une vraie valeur : garder() le laisserait. */
  if (b.etage === 0 || b.etage === '0') x.etage = 0;
  const prix = Number(b.prix_acquereur) || Number(b.prix_vendeur) || null;
  if (prix) x.prix_affiche = prix;
  const eq = Object.keys(CASES).filter(k => b[k] === true).map(k => CASES[k]);
  x.equipements_dits_dans_l_annonce = eq.length ? eq : 'aucun';
  if (b.agence_nom && /particulier/i.test(String(b.agence_nom))) x.vendu_par = 'un particulier';
  const d = court(b.description, 4500);
  if (d) x.description = d;
  return x;
}

const CONSIGNE_CLIENT = `Tu fais la veille d'Alexandre Rogelet, chasseur immobilier à Paris et dans les Hauts-de-Seine (Emilio Immobilier). Son client a envoyé lui-même cette annonce depuis son espace ; Alexandre l'a mise en fiche. Juge-la EXACTEMENT comme la veille juge une annonce qu'elle trouve, par rapport à TOUTE la recherche de ce client.

Ce que tu lis :
- LA RECHERCHE : ses critères ; ses « exigences » (le niveau « souhaite » ou « indispensable » de parking, cave, balcon, terrasse, jardin, ascenseur, gardien, extérieur, cuisine) ; ses notes (les précisions libres, qui valent souvent plus que les cases, et disent son projet : résidence principale par défaut) ; « son_parcours » ; ce que ses visites ont appris ; ses comptes rendus ; ce qu'il a dit des biens montrés (ses refus d'abord : chaque motif de refus devient un critère) ; les annonces écartées et leur motif. « secteurs » écrit « Quartier (Ville) » veut dire ces quartiers-là seulement ; « arrets » donne la station et le temps à pied qu'il accepte.
- LE BIEN : la fiche, sa description, et ses photos quand il y en a.
- CE QUE LE CLIENT EN A DIT en l'envoyant : son mot, ce qui lui plaît.

Les règles de la veille :
1. Les curseurs, un peu au-delà se discute :
   - Budget : le prix affiché (honoraires d'agence compris) jusqu'à 10 % au-dessus du budget maximum passe, avec l'écart chiffré en point d'attention (« 6 % au-dessus de son budget »). Au-delà de 10 %, ça bloque. Les honoraires d'Alexandre, les frais de notaire et les travaux n'entrent jamais dans la note.
   - Surface : jusqu'à 5 % sous la surface minimum passe, avec l'écart en point d'attention (« 76 m² pour 80 demandés, −5 % »). Au-delà, ça bloque.
   - Étage minimum : un de moins se discute.
   - Le temps à pied jusqu'à SA station : quelques minutes de plus se discutent (pour 5 demandées, 10 au plus ; pour 10, 13 à 15 c'est déjà loin), au-delà ça bloque ; plus c'est près, mieux c'est. Une autre station ne la remplace pas. Tu ne calcules aucune distance : seulement ce qui est écrit (situation, description) ; inconnu, c'est un point à vérifier.
2. Les seuils durs, qui ne se franchissent pas : le nombre de chambres (on compte en chambres, jamais en pièces ; une pièce close avec fenêtre de 9 m² ou plus compte comme chambre ; une chambre à créer reste un potentiel, jamais comptée ; plus de pièces que de chambres est un atout), la surface du séjour minimum, l'année de construction minimum, l'étage maximum sans ascenseur, le DPE maximum, le rez-de-chaussée exclu, le dernier étage demandé, la surface minimum d'extérieur.
3. Les choix, sur lesquels on ne transige pas : le type de bien ; le secteur (hors de ses quartiers mais à moins du temps demandé de sa station : recevable, avec le point d'attention « Hors de ses quartiers, retenu parce qu'à X min de sa station ») ; l'exposition dite fermement ; la cuisine ouverte ou fermée posée comme condition ; tout ce qui est « indispensable ».
4. Un seul « indispensable » qui manque parmi les neuf équipements, sur un bien bon par ailleurs, ne fait pas écarter le bien : verdict « reserve », note de 50 à 69, et le manque en PREMIER point d'attention, qui commence par « ⚠️ » (« ⚠️ Pas de parking : l'annonce n'en parle pas, alors que c'est indispensable pour lui »). Deux indispensables qui manquent : « ecarter ». Même traitement « reserve » pour un doute de travaux (une chambre à créer, une cuisine à refermer) et pour un accès PMR non précisé.
5. Une information absente n'est ni un bonus ni un malus : c'est un point d'attention écrit comme une vérification (« Exposition non précisée, à vérifier auprès de l'agence »). Mais parking, cave, balcon, terrasse, jardin, ascenseur et gardien sont des arguments de vente : le silence vaut probablement absence. Un extérieur ne compte comme acquis que si une photo le montre ou si sa surface est donnée.
6. Ses refus, ses comptes rendus de visite et ce qu'il a dit des biens montrés pèsent plus que les cases : un bien qui reproduit exactement ce qu'il a refusé descend fortement.
7. Pour une résidence principale, un bien vendu occupé (loué), une nue-propriété ou un viager ne passent pas.
8. Les photos disent l'état quand le texte se tait : papiers peints d'époque, cuisine et salle de bains d'origine, moquette = un rafraîchissement complet (point d'attention, et note en baisse s'il veut du rénové). Un gros ravalement voté ou fait est un atout.
9. N'invente rien : ne t'appuie que sur ce qui est écrit ou visible.

La note sur 100 :
- 85 à 100 : aucun écart (tous les seuils, choix et indispensables ; pas un curseur dépassé). On monte avec les « souhaite » présents et les atouts ; 95 et plus : rien à redire.
- 70 à 84 : un accroc qui se dit en une phrase (un curseur dépassé, un « souhaite » absent) ; plus l'écart approche la borne, plus la note est basse.
- 50 à 69 : deux accrocs ou plus, ou un seul à la borne sur un critère qu'il a répété ; et les biens « reserve » du point 4.
- Sous 50 : le bien ne passe pas (un seuil dur ou un choix franchi, le budget au-delà de 10 %, deux indispensables absents, un refus récent reproduit).
Le verdict suit la note : « priorite » (85+), « appeler » (70 à 84), « reserve » (50 à 69), « ecarter » (sous 50).

Ce que tu écris :
- « appreciation » : UNE phrase qui tranche, écrite pour Alexandre (le client ne la lit jamais) : pourquoi ce bien colle ou non à CE client, puis ce qui coince, avec le chiffre. Elle ne recopie pas les points.
- « points_forts » : de 0 à 4, une idée par ligne, le plus décisif d'abord, chacun se suffit à lui-même (« Trois chambres pour trois demandées, plus un bureau », « À 4 min à pied de Jean-Jaurès, sa station »). Le jugement, pas la fiche recopiée.
- « points_attention » : de 0 à 4, le plus décisif d'abord. Ce qui bloque ou doit être tranché avant d'appeler commence par « ⚠️ » ; les simples vérifications, sans préfixe.
- Le test de cohérence : la note, le verdict et les points racontent la même chose. Un 78 sans point d'attention est faux, un 92 avec trois aussi, une « priorite » avec un « ⚠️ » aussi.

Il l'a envoyée lui-même : c'est un signal (elle lui plaît), à dire dans un atout quand elle colle à sa recherche, en citant ce qu'il en a dit. Ça ne change aucune règle. Si elle contredit franchement ses critères (un seuil dur, son secteur, son budget au-delà de 10 %), ne la sauve pas : note basse, et dis dans l'appréciation que sa recherche bouge peut-être (« Il l'a envoyée alors qu'elle n'a que 2 chambres pour 3 demandées : à lui demander si sa recherche a changé »).

Écris en français simple, sans abréviation. Réponds avec l'outil « rendre_analyse ».`;

const BORNES: Record<VerdictAnalyse, [number, number]> = { priorite: [85, 100], appeler: [70, 84], reserve: [50, 69], ecarter: [0, 49] };
const verdictDeNote = (n: number): VerdictAnalyse => (n >= 85 ? 'priorite' : n >= 70 ? 'appeler' : n >= 50 ? 'reserve' : 'ecarter');
const BLOQUANT = /^\s*(⚠️|⚠|!!|à\s*écarter|a\s*ecarter)/i;

/** La réponse de l'IA, remise d'aplomb : la note suit le verdict, et un
    point « ⚠️ » ne laisse jamais passer une priorité (le test de cohérence). */
function remettreDAplomb(x: Record<string, unknown>): Analyse {
  const liste = (l: unknown) => (Array.isArray(l) ? l : []).map(t => court(t, 240)).filter(Boolean).slice(0, 4);
  const points_forts = liste(x.points_forts);
  const points_attention = liste(x.points_attention);
  const brut = Math.round(Number(x.score));
  let score = Number.isFinite(brut) ? Math.min(100, Math.max(0, brut)) : NaN;
  let verdict = String(x.verdict || '') as VerdictAnalyse;
  if (!BORNES[verdict]) verdict = Number.isFinite(score) ? verdictDeNote(score) : 'reserve';
  if (!Number.isFinite(score)) score = Math.round((BORNES[verdict][0] + BORNES[verdict][1]) / 2);
  if (points_attention.some(p => BLOQUANT.test(p)) && (verdict === 'priorite' || verdict === 'appeler')) verdict = 'reserve';
  const [mi, ma] = BORNES[verdict];
  score = Math.min(ma, Math.max(mi, score));
  return { score, verdict, appreciation: court(x.appreciation, 400), points_forts, points_attention };
}


/* Un confrère propose le bien : même règles, autre présentation, et sa
   parole n'est pas celle du client. */
const remplacer = (t: string, a: string, b: string) => {
  if (!t.includes(a)) throw new Error(`consigne de l’analyse : « ${a.slice(0, 40)} » introuvable`);
  return t.replace(a, b);
};
const CONSIGNE_AGENCE = [
  ['Son client a envoyé lui-même cette annonce depuis son espace ; Alexandre l\'a mise en fiche. Juge-la EXACTEMENT',
    'Une agence (un confrère) propose ce bien pour ce client, par le lien qu\'Alexandre lui a donné ; la fiche a été lue sur son annonce. Juge-le EXACTEMENT'],
  ['- CE QUE LE CLIENT EN A DIT en l\'envoyant : son mot, ce qui lui plaît.',
    '- CE QUE L\'AGENCE EN A DIT en le proposant : son mot (exclusivité, disponibilité, visite possible…), et l\'adresse quand elle la donne.'],
  ['Il l\'a envoyée lui-même : c\'est un signal (elle lui plaît), à dire dans un atout quand elle colle à sa recherche, en citant ce qu\'il en a dit. Ça ne change aucune règle. Si elle contredit franchement ses critères (un seuil dur, son secteur, son budget au-delà de 10 %), ne la sauve pas : note basse, et dis dans l\'appréciation que sa recherche bouge peut-être (« Il l\'a envoyée alors qu\'elle n\'a que 2 chambres pour 3 demandées : à lui demander si sa recherche a changé »).',
    'C\'est une agence qui le propose, pas le client : ce n\'est pas un signal de sa part. Ne crois pas l\'agence sur parole quand elle vante le bien : seuls les faits de l\'annonce comptent. Ce qu\'elle dit dans son mot (exclusivité, pas encore en ligne, visite possible, prix discutable) peut devenir un atout ou un point à vérifier.'],
].reduce((t, [a, b]) => remplacer(t, a, b), CONSIGNE_CLIENT);

/** L'analyse du bien pour la recherche `rid`. `dit` : ce que le client (ou
    l'agence) en a dit en l'envoyant. Ne jette jamais. */
export async function analyserPourRecherche(sb: SupabaseClient, rid: string, bien: Record<string, unknown>,
  o: { source: Source; dit?: Record<string, unknown> }): Promise<ResultatAnalyse> {
  const ko = (erreur: string, status = 400): ResultatAnalyse => ({ ok: false, erreur, status });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return ko('La clé de l’analyse (ANTHROPIC_API_KEY) manque dans Vercel', 500);
  try {
    const [{ data: r, error: eR }, memoire] = await Promise.all([
      sb.from('recherches').select('*').eq('id', rid).maybeSingle(),
      memoireRecherches(sb, [rid]),
    ]);
    if (eR) return ko(eR.message, 500);
    if (!r) return ko('Recherche introuvable', 404);

    const dossier = dossierRecherche(r as Record<string, unknown>, memoire);
    const x = bienPourIA(bien);
    const dit = o.dit && Object.keys(o.dit).length ? o.dit : null;
    const qui = o.source === 'agence' ? 'CE QUE L\'AGENCE EN A DIT EN LE PROPOSANT' : 'CE QUE LE CLIENT EN A DIT EN L\'ENVOYANT';
    const rien = o.source === 'agence' ? 'rien (pas de mot)' : 'rien (ni mot, ni ce qui lui plaît)';

    const photos = (Array.isArray(bien.photos) ? bien.photos : [])
      .map(String).filter(u => /^https:\/\//i.test(u) && u.length < 1000).slice(0, PHOTOS_MAX);
    const texte = `LA RECHERCHE :\n${JSON.stringify(dossier)}\n\nLE BIEN :\n${JSON.stringify(x)}\n\n${qui} :\n${dit ? JSON.stringify(dit) : rien}${photos.length ? `\n\nLES PHOTOS DU BIEN (${photos.length}) suivent.` : '\n\nPas de photo.'}`;
    const consigne = o.source === 'agence' ? CONSIGNE_AGENCE : CONSIGNE_CLIENT;

    const appeler = (modele: string, avecPhotos: boolean) => fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modele, max_tokens: 1800, system: consigne,
        tools: [OUTIL], tool_choice: { type: 'tool', name: OUTIL.name },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: texte },
            ...(avecPhotos ? photos.map(u => ({ type: 'image', source: { type: 'url', url: u } })) : []),
          ],
        }],
      }),
      signal: AbortSignal.timeout(50_000),
    });

    let reponse: Response | null = null;
    let modele = '';
    let photosLues = photos.length > 0;
    for (const m of MODELES) {
      modele = m;
      reponse = await appeler(m, photosLues);
      /* Une photo que l'API n'a pas pu ouvrir : on recommence sans les photos. */
      if (reponse.status === 400 && photosLues) {
        const t = await reponse.clone().text().catch(() => '');
        if (!/model/i.test(t) && /image|url|fetch|download|media|source/i.test(t)) { photosLues = false; reponse = await appeler(m, false); }
      }
      /* Un modèle que la clé ne connaît pas : le suivant. */
      if (reponse.status === 404 || reponse.status === 400) {
        const t = await reponse.text().catch(() => '');
        if (/model/i.test(t)) continue;
        return ko(`L’analyse a été refusée (${reponse.status}) : ${t.slice(0, 200)}`, 502);
      }
      break;
    }
    if (!reponse || !reponse.ok) return ko(`L’analyse n’a pas répondu (${reponse?.status || 'aucune réponse'})`, 502);

    const data = await reponse.json() as { stop_reason?: string; content?: { type?: string; text?: string; input?: Record<string, unknown> }[] };
    const outil = (data.content || []).find(c => c.type === 'tool_use');
    let lu: Record<string, unknown> | null = outil?.input || null;
    if (!lu) {
      /* Sans l'outil (un modèle qui l'ignore) : l'objet dans le texte. */
      const brut = (data.content || []).map(c => c.text || '').join('').trim();
      try { lu = JSON.parse(brut.slice(Math.max(0, brut.indexOf('{')), brut.lastIndexOf('}') + 1)); } catch { lu = null; }
    }
    if (!lu) {
      console.error('[analyse-bien] réponse illisible', data.stop_reason);
      return ko(data.stop_reason === 'max_tokens' ? 'L’analyse a été coupée : relance-la.' : 'L’analyse a rendu une réponse illisible : relance-la.', 502);
    }
    return { ok: true, analyse: remettreDAplomb(lu), modele, photos: photosLues ? photos.length : 0 };
  } catch (e) {
    const m = (e as Error).name === 'TimeoutError' ? 'L’analyse a mis trop de temps : relance-la.' : ((e as Error).message || 'Erreur');
    return ko(m, 500);
  }
}
