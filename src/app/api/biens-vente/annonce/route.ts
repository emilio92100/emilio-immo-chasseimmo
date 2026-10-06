import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/* ═══ Reformuler l'annonce d'un bien à vendre (V3.79) ════════════════════════
   Alexandre : « un bouton Reformuler l'annonce, autant de fois que je veux ;
   ça reprend tous les éléments de la fiche du bien et ça me génère une
   présentation du logement », et « minimum 2 100 caractères, pour que ce soit
   bien référencé ».

   Le navigateur envoie les faits de la fiche (faitsAnnonce, src/lib/
   biens-vente.ts : jamais le propriétaire, l'adresse exacte, les codes ni les
   notes), le texte et le titre actuels, et un numéro de version (chaque clic
   en demande une autre). L'IA écrit la présentation et un titre, rien
   d'autre : le prix, les honoraires, la copropriété, le DPE et Géorisques
   sont ajoutés ensuite par le CRM, depuis la fiche (mentionsAnnonce).

   Protégée par le code d'accès, comme le reste du CRM (src/proxy.ts).
     POST { faits, texte?, titre?, version? }  →  { ok, titre, texte } | { ok: false, erreur } */

const MIN = 2100;
const MODELES = ['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'];

const ko = (erreur: string, status = 200) => NextResponse.json({ ok: false, erreur }, { status });
const court = (x: unknown, n: number) => (typeof x === 'string' ? x.slice(0, n) : '');

function consigne(faits: string, texte: string, titre: string, version: number, plusLong: boolean): string {
  return `Tu rédiges le texte d'une annonce de vente immobilière pour une agence, destiné aux portails (SeLoger, Leboncoin, Bien'ici) et au site de l'agence. Il doit donner envie de visiter et être bien référencé.

LES FAITS — la fiche du bien, seule source de vérité :
${faits || '(fiche presque vide)'}
${texte ? `
LE TEXTE ACTUEL DE L'ANNONCE — il peut apporter des précisions absentes de la fiche ; ses phrases sur le prix, les honoraires, les charges, le DPE, la copropriété ou Géorisques ne sont pas à reprendre :
${texte}
` : ''}${titre ? `
LE TITRE ACTUEL : ${titre}
` : ''}
RÈGLES STRICTES :
- N'écris que des faits donnés ci-dessus. N'invente rien, ne déduis rien (pas de « lumineux » si ce n'est pas écrit, pas de distance ni de station qui ne sont pas données).
- Longueur : entre 2 200 et 2 900 caractères, espaces compris. ${plusLong ? 'Ta version précédente était trop courte : développe davantage chaque partie, sans rien inventer.' : 'Développe chaque partie pour atteindre cette longueur, sans remplissage creux.'}
- Cinq à sept paragraphes, séparés par une ligne vide, dans cet ordre quand la matière existe : 1) l'accroche : le type de bien, la ville et le quartier, la surface, l'étage et ce qui le distingue ; 2) la pièce de vie et la cuisine ; 3) la partie nuit, les salles d'eau et les rangements ; 4) l'état, les prestations, le chauffage, les fenêtres ; 5) l'extérieur et les annexes (balcon, terrasse, cave, parking) ; 6) l'immeuble ; 7) le quartier, les commerces, les écoles et les transports, et la disponibilité.
- Référencement : reprends naturellement, deux ou trois fois dans le texte, le type de bien, le nombre de pièces, la ville et le quartier, et les atouts recherchés (balcon, terrasse, parking, ascenseur…) — sans bourrage.
- Ton chaleureux mais précis, phrases simples. Pas de formules creuses (« coup de cœur », « rare », « à saisir », « ne tardez pas », « idéalement situé » sans fait derrière). Pas de majuscules d'insistance, pas d'émoji, pas de markdown, pas de liste à puces, pas de titre dans le texte.
- N'écris jamais : le prix, les honoraires, les charges, la taxe foncière, les valeurs du DPE et du GES, le nombre de lots, les procédures, Géorisques (le CRM les ajoute après ton texte), ni l'adresse exacte, un nom de personne, un code, un téléphone, un nom d'agence.
- C'est la version n° ${version} : propose une rédaction nettement différente d'une version précédente (autre accroche, autres tournures, autre façon d'enchaîner).
- Le titre : 70 caractères au plus — le type de bien, le nombre de pièces, la ville ou le quartier et l'atout principal. Sans prix.

Réponds UNIQUEMENT avec un objet JSON, sans rien autour : {"titre": "...", "texte": "..."}. Dans "texte", les paragraphes sont séparés par \\n\\n.`;
}

async function demander(cle: string, prompt: string, modeles = MODELES, delai = 42000): Promise<{ titre: string; texte: string } | { erreur: string }> {
  let derniere = '';
  const fin = Date.now() + delai;
  for (const model of modeles) {
    const reste = fin - Date.now();
    if (reste < 8000) break;
    let r: Response;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': cle, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 2500, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(reste),
      });
    } catch (e) { derniere = (e as Error).message || 'réseau'; continue; }
    /* Un modèle refusé (inconnu, surchargé) : le suivant. */
    if (!r.ok) { derniere = `api_${r.status}`; continue; }
    const j = await r.json().catch(() => null) as { content?: { text?: string }[] } | null;
    const brut = (j?.content?.[0]?.text || '').trim();
    const m = brut.match(/\{[\s\S]*\}/);
    if (!m) { derniere = 'réponse illisible'; continue; }
    try {
      const o = JSON.parse(m[0]) as { titre?: unknown; texte?: unknown };
      const texte = typeof o.texte === 'string' ? o.texte.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim() : '';
      const titre = typeof o.titre === 'string' ? o.titre.replace(/\s+/g, ' ').trim().slice(0, 90) : '';
      if (texte) return { titre, texte };
      derniere = 'texte vide';
    } catch { derniere = 'réponse illisible'; }
  }
  return { erreur: derniere || 'aucune réponse' };
}

export async function POST(req: NextRequest) {
  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) return ko('La clé de l’IA n’est pas posée sur le serveur.');
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return ko('Requête illisible', 400); }
  const faits = court(body.faits, 6000).trim();
  const texte = court(body.texte, 8000).trim();
  const titre = court(body.titre, 200).trim();
  const version = Math.max(1, Math.min(99, Math.round(Number(body.version) || 1)));
  if (faits.length < 20 && texte.length < 80) return ko('La fiche est presque vide : renseigne d’abord le bien (type, ville, surfaces, pièces…).');

  const debut = Date.now();
  let r = await demander(cle, consigne(faits, texte, titre, version, false));
  /* Trop court : une seconde demande, plus longue, au modèle rapide et
     seulement s'il reste le temps (la route a 60 secondes en tout). */
  if ('texte' in r && r.texte.length < MIN - 200 && Date.now() - debut < 28000) {
    const r2 = await demander(cle, consigne(faits, texte, titre, version, true), MODELES.slice(-1), 26000);
    if ('texte' in r2 && r2.texte.length > r.texte.length) r = r2;
  }
  if ('erreur' in r) return ko(`L’IA n’a pas pu écrire l’annonce (${r.erreur}). Réessaie dans un instant.`);
  return NextResponse.json({ ok: true, titre: r.titre, texte: r.texte });
}
