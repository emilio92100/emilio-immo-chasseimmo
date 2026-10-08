import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { avantMandat, type BienVente } from '@/lib/biens-vente';
import { lireParcours, texteParcours } from '@/lib/parcours';
import { apprisDe } from '@/lib/visites';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Le rapprochement intelligent (V3.122).
 *
 * Alexandre : « le rapprochement, il peut être aussi fiable que la veille ?
 * Qu'il lise tout ce qu'il y a dans les précisions de la recherche, les
 * comptes rendus de visite, les points négatifs… et le bien, ses critères,
 * ses commentaires. Un matching plus précis, avec les mêmes règles ».
 *
 *   POST { paires: [{ bien_id, recherche_id }] (12 au plus), forcer? }
 *        (ou { bien_id, recherche_ids } : un bien et ses acheteurs)
 *        →  { ok, avis: { [bien_id]: { [recherche_id]: { v, r, le, cle } } }, relues, modele, avertissement }
 *
 * V3.123 (Alexandre : « que le rapprochement soit visible partout… que cette
 * fonctionnalité soit fonctionnelle partout ») : des couples bien × recherche,
 * pour l'onglet Rapprochement d'un bien, « Envoyer » depuis la liste des biens
 * et le rapprochement de la fiche d'un acheteur (ses mandats).
 *
 * La note de correspondance (lib/correspondance.ts) fait le premier tri, en
 * chiffres. Ici, l'IA de Claude relit, pour chaque recherche retenue :
 * ses critères et ses indispensables, ses précisions, « Son parcours »
 * (lib/parcours.ts), ce que ses visites ont appris, ses comptes rendus, ce
 * qu'il a dit des biens qu'on lui a montrés, les annonces écartées avec leur
 * motif ; et la fiche du bien, jusqu'à sa visite sur place. Elle rend un avis
 * par recherche : « oui », « à voir », « non », avec une phrase.
 *
 * Rien de nominatif ne part : ni nom, ni adresse exacte, ni téléphone, ni
 * propriétaire. Les avis sont gardés sur le bien (`biens_vente.rapprochement_ia`,
 * outils/sql/parcours-rapprochement-ia.sql) avec l'empreinte de ce qui a été
 * lu : relancer ne relit que les recherches (ou le bien) qui ont bougé.
 *
 * V3.125 (Alexandre : « il faut que les résultats soient bien présentés…
 * qu'on comprenne ce que dit l'outil, les plus, les moins, le score
 * potentiel aussi de chaque personne mis à côté ») : chaque avis porte aussi
 * ses plus (`p`), ses moins (`m`) et une note de potentiel sur 100 (`s`).
 * L'empreinte change de version : les avis d'avant, sans note, se relisent
 * une fois.
 *
 * Protégée par le code d'accès, comme le reste du CRM (src/proxy.ts).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* Par appel : de quoi répondre en moins d'une minute (la limite de Vercel).
   L'onglet enchaîne les appels quand il y en a plus. */
const MAX = 12;
const MODELES = ['claude-sonnet-5-5', 'claude-haiku-4-5-20251001'];
const ko = (erreur: string, status = 400) => NextResponse.json({ ok: false, erreur }, { status });

/* `s` : la note de potentiel (0 à 100) ; `p`, `m` : les plus, les moins (V3.125). */
type Avis = { v: 'oui' | 'a_voir' | 'non'; r: string; le: string; cle: string; s?: number; p?: string[]; m?: string[] };
/* La version de ce qui est demandé : la changer fait relire les avis gardés. */
const VERSION = 'v2';

/* La forme de la réponse, imposée à l'IA (V3.124 ; plus, moins, note : V3.125). */
const OUTIL = {
  name: 'rendre_avis',
  description: 'Rend un avis pour chaque couple bien × recherche à juger.',
  input_schema: {
    type: 'object',
    properties: {
      avis: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            bien: { type: 'string', description: 'L’id exact du bien' },
            recherche: { type: 'string', description: 'L’id exact de la recherche' },
            verdict: { type: 'string', enum: ['oui', 'a_voir', 'non'] },
            score: { type: 'integer', minimum: 0, maximum: 100, description: 'Ses chances d’être intéressé, sur 100' },
            raison: { type: 'string', description: 'Une phrase de 140 caractères au plus, qui cite le fait précis' },
            plus: { type: 'array', items: { type: 'string' }, description: 'De 0 à 3 points forts pour lui, 6 mots au plus chacun' },
            moins: { type: 'array', items: { type: 'string' }, description: 'De 0 à 3 points faibles ou à vérifier, 6 mots au plus chacun' },
          },
          required: ['bien', 'recherche', 'verdict', 'score', 'raison', 'plus', 'moins'],
        },
      },
    },
    required: ['avis'],
  },
};

const plein = (v: unknown) => v !== null && v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length);
function garder(o: Record<string, unknown>, cles: string[]): Record<string, unknown> {
  const x: Record<string, unknown> = {};
  for (const k of cles) if (plein(o[k])) x[k] = o[k];
  return x;
}
const court = (t: unknown, n: number) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/* La fiche du bien, ce qu'une visite en dirait : ni adresse exacte, ni
   propriétaire, ni code, ni mandat. */
const CLES_BIEN = [
  'typeBien', 'surface', 'carrez', 'pieces', 'chambres', 'sejour', 'sdb', 'salleseau', 'wc', 'etage', 'etages', 'niveaux', 'immeuble', 'accesAscenseur',
  'annee', 'constructionType', 'standing', 'style', 'etat', 'etatCommuns', 'etatExterieur', 'cuisine', 'cuisineEquip', 'chauffageMode', 'chauffageEnergie',
  'vitrage', 'volets', 'annexes', 'surfBalcon', 'surfTerrasse', 'surfJardin', 'surfLoggia', 'surfCave', 'nbParking', 'stationnement', 'expo', 'vue', 'visAVis',
  'situation', 'proxMetro', 'proxBus', 'proxRer', 'proxTram', 'proxEcole', 'proxCommerces', 'dpe', 'ges', 'chargesAn', 'taxeFonciere', 'lots',
  'travaux', 'travauxVotes', 'coproAVenir', 'equipements', 'interieurNote', 'exterieurNote', 'visiteAtouts', 'visiteDefauts', 'quartier', 'ville', 'cp',
];
function bienPourIA(b: BienVente): Record<string, unknown> {
  const d = (b.donnees || {}) as Record<string, unknown>;
  const x = garder(d, CLES_BIEN);
  if (!x.ville && b.ville) x.ville = b.ville;
  if (!x.cp && b.code_postal) x.cp = b.code_postal;
  const prix = b.prix ?? (typeof d.prix === 'number' ? d.prix : null);
  if (avantMandat(b.etape)) {
    if (d.estimBasse || d.estimHaute) x.estimation = [d.estimBasse, d.estimHaute].filter(Boolean).join(' à ');
  } else if (prix) x.prix = prix;
  if (Array.isArray(d.detailPieces)) {
    x.pieces_detail = (d.detailPieces as Record<string, unknown>[]).slice(0, 20)
      .map(p => [p.nom, p.surface ? `${p.surface} m²` : '', p.niveau, court(p.note, 120)].filter(Boolean).join(' · ')).filter(Boolean);
  }
  const texte = court(d.annonceTexte, 2500);
  if (texte) x.description = texte;
  return x;
}

const CLES_RECHERCHE = [
  'type_bien', 'budget_min', 'budget_max', 'surface_min', 'surface_max', 'surface_sejour_min', 'nb_pieces_min', 'nb_pieces_max', 'chambres_min',
  'secteurs', 'transport_minutes', 'etage_min', 'etage_max', 'etage_max_sans_ascenseur', 'rdc_exclu', 'dernier_etage', 'exposition_souhaitee',
  'etat_souhaite', 'annee_construction_min', 'dpe_max', 'cuisine_type', 'exterieur_surface_min', 'exigences', 'parking', 'cave', 'balcon',
  'terrasse', 'jardin', 'ascenseur', 'gardien', 'urgence', 'notes',
];

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!url || !cle) return ko('Variables Supabase manquantes', 500);
  if (!apiKey) return ko('La clé de la relecture (ANTHROPIC_API_KEY) manque dans Vercel', 500);
  const sb = createClient(url, cle, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return ko('Requête illisible'); }
  /* Les couples à juger. Un bien et ses acheteurs (l'onglet Rapprochement),
     plusieurs biens et leurs acheteurs (« Envoyer » depuis la liste), un
     acheteur et des mandats (le rapprochement de sa fiche) : toujours des
     couples bien × recherche. */
  const brutes: { b: string; r: string }[] = Array.isArray(body.paires)
    ? (body.paires as Record<string, unknown>[]).map(x => ({ b: String(x?.bien_id || ''), r: String(x?.recherche_id || '') }))
    : (Array.isArray(body.recherche_ids) ? body.recherche_ids : []).map(r => ({ b: String(body.bien_id || ''), r: String(r) }));
  const paires = brutes.filter((x, i, l) => UUID.test(x.b) && UUID.test(x.r) && l.findIndex(y => y.b === x.b && y.r === x.r) === i).slice(0, MAX);
  if (!paires.length) return ko('Rien à relire');
  const idsB = [...new Set(paires.map(x => x.b))];
  const ids = [...new Set(paires.map(x => x.r))];

  try {
    const [{ data: lusB, error: eB }, { data: rs, error: eR }, { data: vs }, { data: cs }, { data: ps }] = await Promise.all([
      sb.from('biens_vente').select('*').in('id', idsB),
      sb.from('recherches').select('*').in('id', ids),
      sb.from('visites').select('recherche_id, statut, issue, avis_client, motifs, aime, retenir, commentaire, mot_client, date_visite').in('recherche_id', ids).neq('statut', 'annulee').order('date_visite', { ascending: false }),
      sb.from('biens').select('recherche_id, titre, ville, badge_retour, retour_client, retour_le').in('recherche_id', ids).not('retour_client', 'is', null).order('retour_le', { ascending: false }),
      sb.from('veille_propositions').select('recherche_id, motif_ecart').in('recherche_id', ids).eq('statut', 'ecarte').not('motif_ecart', 'is', null).limit(300),
    ]);
    if (eB) return ko(eB.message, 500);
    if (eR) return ko(eR.message, 500);

    type BienIA = BienVente & { rapprochement_ia?: Record<string, Avis> | null };
    const biens = new Map(((lusB || []) as BienIA[]).map(b => [b.id, { b, x: bienPourIA(b) }]));

    /* Chaque recherche, ce qu'on sait d'elle, sans rien de nominatif. */
    const dossiers = new Map(((rs || []) as Record<string, unknown>[]).map(r => {
      const rid = String(r.id);
      const visites = ((vs || []) as Record<string, unknown>[]).filter(v => v.recherche_id === rid);
      const appris = apprisDe(visites as Parameters<typeof apprisDe>[0], (r.appris_masques as string[] | null) || []);
      const x: Record<string, unknown> = garder(r, CLES_RECHERCHE);
      if (Array.isArray(r.transport_arrets) && r.transport_arrets.length) {
        x.arrets = (r.transport_arrets as { nom?: string; minutes?: number }[]).map(a => `${a.nom || ''}${a.minutes ? ` (${a.minutes} min à pied)` : ''}`);
      }
      const parcours = texteParcours(lireParcours(r.parcours));
      if (parcours) x.son_parcours = parcours;
      if (appris.eviter.length) x.ses_visites_refusees_pour = appris.eviter.slice(0, 8).map(a => `${a.t}${a.n > 1 ? ` (${a.n} fois)` : ''}`);
      if (appris.aime.length) x.ses_visites_lui_ont_plu_pour = appris.aime.slice(0, 8).map(a => `${a.t}${a.n > 1 ? ` (${a.n} fois)` : ''}`);
      const crs = visites.map(v => [court(v.commentaire, 300), court(v.mot_client, 200)].filter(Boolean).join(' — ')).filter(Boolean).slice(0, 6);
      if (crs.length) x.comptes_rendus = crs;
      const retours = ((cs || []) as Record<string, unknown>[]).filter(c => c.recherche_id === rid).slice(0, 8)
        .map(c => `${court(c.titre || c.ville, 60)} : ${court(c.retour_client, 220)}${c.badge_retour === 'refuse' ? ' (pas pour lui)' : ''}`);
      if (retours.length) x.ce_quil_a_dit_des_biens_montres = retours;
      const ecarts = [...new Set(((ps || []) as Record<string, unknown>[]).filter(p => p.recherche_id === rid).map(p => court(p.motif_ecart, 140)).filter(Boolean))].slice(0, 10);
      if (ecarts.length) x.annonces_ecartees_pour = ecarts;
      return [rid, x] as const;
    }));

    /* L'empreinte de chaque couple : ce que l'IA a lu du bien et de la
       recherche. Déjà relu, rien n'a bougé : on garde l'avis. */
    const forcer = body.forcer === true;
    const couples = paires.filter(p => biens.has(p.b) && dossiers.has(p.r)).map(p => ({
      ...p, empreinte: createHash('sha256').update(VERSION + JSON.stringify(biens.get(p.b)!.x) + JSON.stringify(dossiers.get(p.r))).digest('hex').slice(0, 16),
    }));
    const cacheDe = (b: string) => { const c = biens.get(b)?.b.rapprochement_ia; return (c && typeof c === 'object' ? c : {}) as Record<string, Avis>; };
    const aLire = couples.filter(c => forcer || cacheDe(c.b)[c.r]?.cle !== c.empreinte);
    const avis: Record<string, Record<string, Avis>> = {};
    const poser = (b: string, r: string, a: Avis) => { (avis[b] ||= {})[r] = a; };
    for (const c of couples) if (!aLire.includes(c) && cacheDe(c.b)[c.r]) poser(c.b, c.r, cacheDe(c.b)[c.r]);

    let modele = '';
    if (aLire.length) {
      const consigne = `Tu aides Alexandre, chasseur immobilier à Paris et dans les Hauts-de-Seine, à décider à quels acheteurs de sa base proposer ses biens.

Un premier tri en chiffres a déjà retenu ces couples bien × acheteur (budget, secteur, type, surface, chambres). Ton rôle : tout relire, comme le ferait Alexandre, et repérer ce que les chiffres ne voient pas.

Lis pour chaque recherche : ses critères et ses « exigences » (indispensable = bloquant), ses notes, « son_parcours » (ce qui ne lui a pas convenu, surtout ce qui « revient souvent », et ce qui lui a plu), ce que ses visites ont appris, ses comptes rendus, ce qu'il a dit des biens montrés, les annonces écartées et leur motif. Et pour chaque bien : toute la fiche, sa description, sa visite sur place (visiteAtouts, visiteDefauts), l'immeuble, l'étage et l'ascenseur, l'exposition, la vue, le vis-à-vis, l'état, les travaux.

Règles :
- « non » : un point bloquant, ou exactement ce qu'il refuse souvent (ex. il cherche un accès PMR et l'immeuble ancien n'a qu'un petit ascenseur ; il a refusé trois biens pour le vis-à-vis et celui-ci est sur cour face à un immeuble).
- « a_voir » : ça peut lui plaire mais un point est à vérifier ou à discuter avec lui (une information manque sur le bien, un critère est juste à la limite).
- « oui » : rien ne s'y oppose, et de préférence le bien a ce qui lui a plu.
- Budget : la même règle que la veille. Jusqu'à environ 7 % au-dessus de son budget, c'est négociable (900 000 € → jusqu'à 960 000 €) : ce n'est pas une raison de dire « non ». Au-delà de 10 %, « non » sauf s'il a dit être souple.
- Une information absente de la fiche n'est jamais un « non » : c'est « a_voir », et tu dis quoi vérifier.
- N'invente rien : ne t'appuie que sur ce qui est écrit.

Pour chaque couple, Alexandre lit d'un coup d'œil :
- « raison » : une phrase (140 caractères au plus), en français simple, qui résume ton avis et cite le fait précis. Exemples : « Cherche un accès PMR : immeuble de 1932 au petit ascenseur. », « Lumineux et traversant, ce qu'il a aimé ; le budget passe. », « Exposition non renseignée : il a refusé deux biens trop sombres. »
- « plus » : de 0 à 3 points forts POUR CET ACHETEUR, 6 mots au plus chacun, du plus fort au moins fort. Ce qui colle à ce qu'il cherche ou à ce qui lui a plu : « Traversant et lumineux », « 3e étage avec ascenseur », « Dans son secteur », « Budget respecté ».
- « moins » : de 0 à 3 points faibles ou à vérifier, 6 mots au plus chacun, le plus gênant d'abord : « Pas de balcon », « 6 % au-dessus du budget », « Exposition non renseignée ». Rien de gênant : une liste vide.
- « score » : ses chances d'être intéressé, sur 100, selon tout ce que tu as lu. Cohérent avec le verdict : « oui » de 70 à 100, « a_voir » de 40 à 69, « non » de 0 à 39. Deux « oui » ne se valent pas : départage-les.

Ne répète pas la phrase dans les plus et les moins : ils la complètent.

Réponds avec l'outil « rendre_avis » : un avis par couple, avec leurs id exacts.`;
      const bLus = [...new Set(aLire.map(c => c.b))], rLus = [...new Set(aLire.map(c => c.r))];
      const contenu = `LES BIENS :\n${bLus.map(b => JSON.stringify({ id: b, ...biens.get(b)!.x })).join('\n')}\n\nLES RECHERCHES :\n${rLus.map(r => JSON.stringify({ id: r, ...dossiers.get(r) })).join('\n')}\n\nLES COUPLES À JUGER :\n${aLire.map(c => JSON.stringify({ bien: c.b, recherche: c.r })).join('\n')}`;

      let reponse: Response | null = null;
      for (const m of MODELES) {
        reponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          /* V3.124 (« La réponse de l'IA est illisible ») : un tableau écrit à la
             main se cassait sur un guillemet dans une phrase ou une réponse
             coupée. L'outil impose la forme : l'API rend un objet, jamais
             du texte à relire. */
          body: JSON.stringify({
            model: m, max_tokens: Math.min(8000, 800 + aLire.length * 340), system: consigne,
            tools: [OUTIL], tool_choice: { type: 'tool', name: OUTIL.name },
            messages: [{ role: 'user', content: contenu }],
          }),
          signal: AbortSignal.timeout(50_000),
        });
        modele = m;
        /* Un modèle que la clé ne connaît pas : le suivant. */
        if (reponse.status === 404 || reponse.status === 400) { const t = await reponse.text().catch(() => ''); if (/model/i.test(t)) continue; return ko(`La relecture a été refusée (${reponse.status}) : ${t.slice(0, 200)}`, 502); }
        break;
      }
      if (!reponse || !reponse.ok) return ko(`La relecture n’a pas répondu (${reponse?.status || 'aucune réponse'})`, 502);
      const data = await reponse.json() as { stop_reason?: string; content?: { type?: string; text?: string; input?: { avis?: unknown } }[] };
      type Lu = { bien?: unknown; recherche?: unknown; id?: unknown; verdict?: unknown; raison?: unknown; score?: unknown; plus?: unknown; moins?: unknown };
      let lus: Lu[] = [];
      const outil = (data.content || []).find(c => c.type === 'tool_use');
      if (outil && Array.isArray(outil.input?.avis)) lus = outil.input!.avis as Lu[];
      else {
        /* Sans l'outil (un modèle qui l'ignore) : le tableau dans le texte. */
        const brut = (data.content || []).map(c => c.text || '').join('').trim();
        const json = brut.slice(Math.max(0, brut.indexOf('[')), brut.lastIndexOf(']') + 1);
        try { lus = JSON.parse(json); } catch {
          console.error('[rapprochement-ia] réponse illisible', data.stop_reason, brut.slice(0, 600));
          return ko(data.stop_reason === 'max_tokens' ? 'La relecture a été coupée : relance, elle reprendra là où elle en est.' : 'La relecture a rendu une réponse illisible : relance.', 502);
        }
      }
      const le = new Date().toISOString();
      for (const x of Array.isArray(lus) ? lus : []) {
        const r = String(x.recherche ?? x.id ?? '');
        const c = aLire.find(y => y.r === r && (y.b === String(x.bien ?? '') || (!x.bien && bLus.length === 1)));
        const v = String(x.verdict);
        if (!c || !['oui', 'a_voir', 'non'].includes(v)) continue;
        /* La note suit le verdict, même si l'IA s'en écarte un peu. */
        const borne: Record<string, [number, number]> = { oui: [70, 100], a_voir: [40, 69], non: [0, 39] };
        const brut = Number(x.score);
        const [mi, ma] = borne[v];
        const s = Number.isFinite(brut) ? Math.min(ma, Math.max(mi, Math.round(brut))) : Math.round((mi + ma) / 2);
        const liste = (l: unknown) => (Array.isArray(l) ? l : []).map(t => court(t, 60)).filter(Boolean).slice(0, 3);
        poser(c.b, c.r, { v: v as Avis['v'], r: court(x.raison, 220), le, cle: c.empreinte, s, p: liste(x.plus), m: liste(x.moins) });
      }
    }

    /* Gardés sur chaque bien. La colonne pas encore créée : on le dit, sans
       perdre la réponse. V3.125 : les relectures partent à plusieurs en même
       temps ; on relit la colonne juste avant d'écrire, pour ne pas effacer
       ce qu'une autre vient d'y mettre. */
    let avertissement = '';
    for (const b of [...new Set(aLire.map(c => c.b))]) {
      const { data: frais } = await sb.from('biens_vente').select('rapprochement_ia').eq('id', b).maybeSingle();
      const avant = (frais as { rapprochement_ia?: unknown } | null)?.rapprochement_ia;
      const base = avant && typeof avant === 'object' ? (avant as Record<string, Avis>) : cacheDe(b);
      const { error: eC } = await sb.from('biens_vente').update({ rapprochement_ia: { ...base, ...(avis[b] || {}) } }).eq('id', b);
      if (eC && !avertissement) avertissement = /rapprochement_ia/i.test(eC.message)
        ? 'Les avis ne sont pas gardés : passe outils/sql/parcours-rapprochement-ia.sql dans Supabase.'
        : `Les avis ne sont pas gardés : ${eC.message}`;
    }
    return NextResponse.json({ ok: true, avis, relues: aLire.length, modele, avertissement });
  } catch (e) {
    const m = (e as Error).name === 'TimeoutError' ? 'La relecture a mis trop de temps : relance, elle reprendra là où elle en est.' : ((e as Error).message || 'Erreur');
    return ko(m, 500);
  }
}
