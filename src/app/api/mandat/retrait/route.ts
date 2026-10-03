import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { envoyerMail, gabarit, echappe } from '@/lib/mandat-serveur';

/**
 * « Retirer la proposition » du mandat de recherche (fiche › Mandat de
 * recherche) : le client est prévenu par e-mail (V3.64).
 *
 * Alexandre : « ce n'est pas à moi de les avertir ». La V3.63 le faisait pour
 * tous les documents de la rubrique Documents ; le mandat proposé dans
 * l'espace client passait à côté : le retrait ne disait rien au client, qui
 * l'apprenait en rouvrant son espace.
 *
 *   POST { rechercheId, signatureId? }
 *
 * Le retrait lui-même est écrit par la fiche (MandatEnLigne.tsx, `retirer`) ;
 * cette route ne fait qu'écrire au client, une fois la proposition retirée.
 * Elle le vérifie : tant que `mandat_propose_le` est rempli, elle refuse.
 * Protégée par le code d'accès, comme le reste du CRM (src/proxy.ts).
 *
 * Qui : les adresses de sa fiche (celles qui ont reçu « Votre mandat de
 * recherche est prêt »), et celle saisie pour signer s'il avait commencé
 * (`signatureId`, sa ligne passée « abandonne ») : un conjoint, une autre
 * adresse. Un e-mail par adresse.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TEL = '06 58 95 76 32';
const ko = (erreur: string, status = 400) => NextResponse.json({ ok: false, erreur }, { status });

/* Le mail, au nom d'Alexandre : court, simple, rien à faire. */
function mailRetrait(prenom: string, commence: boolean) {
  const bonjour = `Bonjour${prenom ? ` ${prenom}` : ''},`;
  const p1 = 'Je retire pour le moment la proposition de mandat de recherche que je vous avais faite.';
  const p2 = commence
    ? 'La signature que vous aviez commencée est donc arrêtée : le code reçu par e-mail ne fonctionne plus. Vous n’avez rien à faire de votre côté.'
    : 'Vous n’avez rien à faire de votre côté.';
  const p3 = 'S’il faut en signer un plus tard, je vous le dirai.';
  const p4 = `Une question ? Répondez simplement à ce message, ou appelez-moi au ${TEL}.`;
  return {
    sujet: 'À propos de votre mandat de recherche',
    texte: `${bonjour}\n\n${p1}\n\n${p2} ${p3}\n\n${p4}\n\nAlexandre Rogelet\nEmilio Immobilier`,
    html: gabarit('Votre mandat de recherche', `<p>${echappe(bonjour)}</p>
      <p>${echappe(p1)}</p>
      <p>${echappe(p2)} ${echappe(p3)}</p>
      <p>${echappe(p4)}</p>
      <p>Alexandre Rogelet<br/>Emilio Immobilier</p>`),
  };
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return ko('Variables Supabase manquantes', 500);
  const sb = createClient(url, cle, { auth: { persistSession: false } });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return ko('Requête illisible'); }
  const rechercheId = String(body.rechercheId || '');
  const signatureId = body.signatureId ? String(body.signatureId) : '';
  if (!UUID.test(rechercheId)) return ko('Recherche inconnue');
  if (signatureId && !UUID.test(signatureId)) return ko('Signature inconnue');

  try {
    const { data: r, error: eR } = await sb.from('recherches').select('id, client_id, mandat_propose_le').eq('id', rechercheId).maybeSingle();
    if (eR) return ko(eR.message, 500);
    if (!r) return ko('Recherche introuvable', 404);
    if (r.mandat_propose_le) return ko('La proposition est toujours en place : rien à annoncer.', 409);
    const { data: c, error: eC } = await sb.from('clients').select('id, prenom, emails').eq('id', r.client_id).maybeSingle();
    if (eC) return ko(eC.message, 500);
    if (!c) return ko('Client introuvable', 404);

    /* Sa signature commencée, arrêtée par le retrait : l'adresse qu'il a
       donnée pour signer, et le mail le dit. */
    let commence = false;
    let mandant: { prenom?: string; email?: string } | null = null;
    if (signatureId) {
      const { data: s, error: eS } = await sb.from('mandats_signatures').select('id, recherche_id, statut, mandant').eq('id', signatureId).maybeSingle();
      if (eS) return ko(eS.message, 500);
      if (s && s.recherche_id === rechercheId && s.statut === 'abandonne') {
        commence = true;
        mandant = (s.mandant as { prenom?: string; email?: string } | null) || null;
      }
    }

    const vus = new Set<string>();
    const a: { email: string; prenom: string }[] = [];
    const ajouter = (email: unknown, prenom: unknown) => {
      const e = String(email || '').trim();
      if (!EMAIL.test(e) || vus.has(e.toLowerCase())) return;
      vus.add(e.toLowerCase());
      a.push({ email: e, prenom: String(prenom || '').trim() });
    };
    for (const e of Array.isArray(c.emails) ? c.emails : []) ajouter(e, c.prenom);
    if (mandant) ajouter(mandant.email, mandant.prenom || c.prenom);
    if (!a.length) return NextResponse.json({ ok: true, prevenus: [], echecs: [], aucun: true });

    const prevenus: string[] = [], echecs: string[] = [];
    for (const x of a) {
      const m = mailRetrait(x.prenom, commence);
      const e = await envoyerMail({ a: x.email, nomA: x.prenom || undefined, sujet: m.sujet, texte: m.texte, html: m.html });
      if (e) echecs.push(`${x.email} : ${e}`); else prevenus.push(x.email);
    }
    return NextResponse.json({ ok: true, prevenus, echecs });
  } catch (e) {
    console.error('[mandat/retrait]', e);
    return ko((e as Error).message || 'Erreur inattendue', 500);
  }
}
