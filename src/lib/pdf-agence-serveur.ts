import type { SupabaseClient } from '@supabase/supabase-js';
import { BUCKET_PDF, PDF_MAX, type PdfAgence } from '@/lib/agences-lien';
import { CHAMPS_ANNONCE, completerParRegex, nettoyerLecture } from '@/lib/lecture-annonce';
import { ficheNette } from '@/lib/agences-serveur';
import { analyserPourRecherche } from '@/lib/analyse-bien-serveur';
import { ecritServeur } from '@/lib/ecritures';

/* ═══ Le PDF déposé par une agence, côté serveur (V3.202) ═════════════════
   Alexandre : « est-ce qu'il y a possibilité qu'il mette un PDF ? Est-ce que
   le CRM arrive à lire les PDF pour que ça parte en veille ? ».

   - Le PDF va tout droit du navigateur de l'agence au dossier PRIVÉ
     `agences-pdf` (un lien d'envoi signé, api/agences/pdf : Vercel ne
     laisse pas passer plus de 4,5 Mo par requête). Chemin :
     <recherche>/<uuid>.pdf. Gardé, même quand le bien est écarté
     (choix d'Alexandre, 16 octobre).
   - La lecture : le PDF est lu par l'IA (ta clé Anthropic) comme une page
     d'annonce — prix, surface, pièces, chambres, étage, ville, DPE,
     charges, description (les mêmes champs que lecture-annonce.ts). Si le
     PDF ne s'ouvre pas pour elle, le texte que la page a tiré du PDF sert.
   - Puis l'analyse habituelle pour la recherche (analyse-bien-serveur.ts).
   Le CRM ouvre le PDF par un lien de quelques minutes (api/lien-agences/pdf). */

const MODELES = ['claude-haiku-4-5-20251001', 'claude-sonnet-5-5'];

/** Un chemin que le serveur a lui-même donné pour cette recherche. */
export const cheminPdfValide = (rid: string, c: unknown): c is string =>
  typeof c === 'string' && c.startsWith(`${rid}/`) && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i.test(c);

/** Le PDF est bien arrivé, et pas trop lourd : sa taille, sinon `null`. */
export async function pdfDepose(sb: SupabaseClient, rid: string, chemin: string): Promise<number | null> {
  const nom = chemin.slice(rid.length + 1);
  const { data, error } = await sb.storage.from(BUCKET_PDF).list(rid, { search: nom, limit: 5 });
  if (error) { console.error('[pdf agence] vérification', error.message); return null; }
  const f = (data || []).find(x => x.name === nom);
  const taille = Number((f?.metadata as { size?: number } | undefined)?.size) || 0;
  return f && taille > 0 && taille <= PDF_MAX ? taille : null;
}

const CONSIGNE = `Tu lis la plaquette (ou la fiche) PDF d'un bien immobilier qu'une agence propose à un chasseur immobilier. Extrais TOUTES les informations du bien.

Réponds UNIQUEMENT avec un JSON valide, sans markdown ni texte autour. Ne JAMAIS inventer une valeur — mettre null si non trouvée. Si le PDF présente plusieurs biens, ne garde que le premier.

Réponds avec ce JSON exact :
${CHAMPS_ANNONCE}`;

async function appeler(contenu: unknown[], apiKey: string): Promise<Record<string, unknown> | null> {
  for (const model of MODELES) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 3500, messages: [{ role: 'user', content: contenu }] }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if ((r.status === 404 || r.status === 400) && /model/i.test(t)) continue;
      console.error('[pdf agence] lecture', r.status, t.slice(0, 200));
      return null;
    }
    const data = await r.json().catch(() => null) as { content?: { text?: string }[] } | null;
    const texte = (data?.content || []).map(c => c.text || '').join('');
    const m = texte.match(/\{[\s\S]+\}/);
    if (!m) return null;
    try { return nettoyerLecture(JSON.parse(m[0]) as Record<string, unknown>); } catch { return null; }
  }
  return null;
}

/** La fiche lue dans le PDF (réduite à ce que `biens` connaît), ou `null`. */
export async function lirePdfAgence(sb: SupabaseClient, chemin: string, texte = ''): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('[pdf agence] ANTHROPIC_API_KEY manque'); return null; }
  try {
    const { data: s, error } = await sb.storage.from(BUCKET_PDF).createSignedUrl(chemin, 600);
    if (error) console.error('[pdf agence] lien de lecture', error.message);
    let lu: Record<string, unknown> | null = null;
    if (s?.signedUrl) lu = await appeler([{ type: 'document', source: { type: 'url', url: s.signedUrl } }, { type: 'text', text: CONSIGNE }], apiKey);
    if (!lu && texte.trim().length >= 200) lu = await appeler([{ type: 'text', text: `${CONSIGNE}\n\nLe texte du PDF :\n${texte.slice(0, 20000)}` }], apiKey);
    if (!lu) return null;
    if (texte) lu = completerParRegex(lu, texte);
    return ficheNette(lu);
  } catch (e) {
    console.error('[pdf agence] lecture', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/* Ce qui reste de la proposition quand le PDF complète une annonce lue :
   le PDF ne remplace rien, il ajoute ce qui manque. */
const GARDES = ['photos', 'agence_nom', 'agence_tel', 'url', 'source_portail'];
const utile = (f: Record<string, unknown>) => !!(f.prix_vendeur || f.surface || f.nb_pieces);

/** Lire le PDF d'une proposition, l'enregistrer, puis (si `analyser` et s'il
    reste du temps) l'analyser pour sa recherche. Ne jette jamais. */
export async function lirePdfProposition(sb: SupabaseClient, id: string, o: { texte?: string; analyser: boolean; debut?: number }):
  Promise<{ ok: true; lecture: string } | { ok: false; erreur: string }> {
  try {
    const { data: p, error } = await sb.from('propositions_agences').select('*').eq('id', id).maybeSingle();
    if (error || !p) return { ok: false, erreur: error?.message || 'proposition introuvable' };
    const pdf = (p.pdf || null) as PdfAgence | null;
    if (!pdf?.chemin) return { ok: false, erreur: 'pas de PDF' };
    const avant: Record<string, unknown> = p.fiche && typeof p.fiche === 'object' ? { ...p.fiche } : {};
    const lu = await lirePdfAgence(sb, pdf.chemin, o.texte || '');

    const complement = !!p.url && (p.lecture === 'ok' || p.lecture === 'partielle');
    let fiche: Record<string, unknown> = avant;
    let lecture = String(p.lecture || '');
    if (lu && utile(lu)) {
      if (complement) {
        fiche = { ...avant };
        for (const [k, v] of Object.entries(lu)) if (fiche[k] == null || fiche[k] === '') fiche[k] = v;
      } else {
        fiche = { ...avant, ...lu };
        for (const k of GARDES) if (avant[k] !== undefined) fiche[k] = avant[k];
        lecture = lu.titre ? 'ok' : 'partielle';
      }
    } else if (!complement) {
      lecture = 'pdf_illisible';
    }
    if (!fiche.titre) fiche.titre = avant.titre;
    const ok = await ecritServeur('[pdf agence] la lecture', sb.from('propositions_agences').update({ fiche, lecture }).eq('id', id));
    if (!ok) return { ok: false, erreur: 'la lecture n’a pas été enregistrée' };

    /* L'analyse, s'il reste le temps (la route a 60 s en tout) ; sinon le CRM la propose. */
    const reste = o.debut ? 60_000 - (Date.now() - o.debut) : 60_000;
    if (o.analyser && (lecture === 'ok' || lecture === 'partielle') && reste > 45_000) {
      const dit: Record<string, unknown> = { agence: [p.agence, p.interlocuteur].filter(Boolean).join(' · ') };
      if (p.mot) dit.son_mot = p.mot;
      if (p.adresse) dit.adresse_donnee = p.adresse;
      dit.envoye_en = 'un PDF (plaquette ou fiche du bien)';
      /* La première page du PDF, vue par l'analyse ; elle ne rejoint pas les photos du bien. */
      const photos = [...(Array.isArray(fiche.photos) ? fiche.photos as string[] : []), ...(pdf.apercu ? [pdf.apercu] : [])];
      const a = await analyserPourRecherche(sb, String(p.recherche_id), { ...fiche, photos }, { source: 'agence', dit });
      if (!a.ok) console.error('[pdf agence] analyse', a.erreur);
      else await ecritServeur('[pdf agence] analyse', sb.from('propositions_agences').update({ fiche: { ...fiche, ...a.analyse } }).eq('id', id));
    }
    return { ok: true, lecture };
  } catch (e) {
    console.error('[pdf agence]', e instanceof Error ? e.message : String(e));
    return { ok: false, erreur: 'la lecture a échoué' };
  }
}
