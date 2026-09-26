import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  lireReglages, calculerCandidats, mailPoint, envoyerMailjet,
  TYPE_ENVOI, PLAFOND_PAR_JOUR,
} from '@/lib/point-auto';

/**
 * L'envoi quotidien du point automatique — « Où en est votre recherche ? ».
 *
 * Appelée chaque matin par Vercel (voir vercel.json, « crons »). Elle est
 * publique dans src/proxy.ts, parce que Vercel n'a pas le cookie du CRM :
 * c'est la variable CRON_SECRET qui fait la serrure. Vercel l'envoie de
 * lui-même dans l'en-tête Authorization quand elle existe dans le projet.
 * Sans elle, rien ne part — c'est voulu.
 *
 * Deux interrupteurs doivent être ouverts pour qu'un mail parte :
 *   1. CRON_SECRET existe sur Vercel (l'envoi est branché) ;
 *   2. « Point automatique » est activé dans les Paramètres du CRM.
 *
 * La règle elle-même (qui, quand) est dans src/lib/point-auto.ts.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://emilio-immo-chasseimmo.vercel.app';
const CRM = process.env.NEXT_PUBLIC_CRM_URL || 'https://crm.emilio-immo.com';

function base() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

const echappe = (t: unknown) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'non autorisé' }, { status: 401 });
  }

  try {
    const sb = base();
    const reglages = await lireReglages(sb);
    if (!reglages.actif) return NextResponse.json({ ok: true, envoyes: 0, raison: 'désactivé dans les Paramètres' });

    const candidats = await calculerCandidats(sb, reglages);
    const dus = candidats.filter((c) => c.du).slice(0, PLAFOND_PAR_JOUR);

    const partis: { nom: string; id: string; revente: boolean }[] = [];
    const rates: { nom: string; erreur: string }[] = [];

    for (const c of dus) {
      const nom = `${c.prenom} ${c.nom}`.trim();
      const m = mailPoint({ prenom: c.prenom, recherche: c.recherche, tokenClient: c.tokenClient!, site: SITE });
      const r = await envoyerMailjet({ a: c.email!, nom, sujet: m.sujet, html: m.html, texte: m.texte, id: `point-${c.clientId}-${Date.now()}` });
      if (!r.ok) { rates.push({ nom, erreur: r.erreur || 'échec' }); continue; }

      /* Écrit seulement après l'accusé de Mailjet : c'est cette ligne qui
         empêche un deuxième mail le lendemain. */
      const { error } = await sb.from('journal').insert({
        client_id: c.clientId, recherche_id: c.recherche?.id || null,
        type: TYPE_ENVOI,
        titre: '📨 Mail « Où en est votre recherche ? » envoyé automatiquement',
        description: c.dernierMouvement
          ? `Aucun mouvement sur le dossier depuis le ${new Date(c.dernierMouvement).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}.`
          : 'Aucun mouvement sur le dossier depuis sa création.',
        metadata: { delai: reglages.delai },
      });
      if (error) rates.push({ nom, erreur: 'mail parti, mais pas noté dans le suivi : ' + error.message });
      partis.push({ nom, id: c.clientId, revente: c.revente });
    }

    /* Un mot à Alexandre, seulement s'il s'est passé quelque chose. */
    if (partis.length || rates.length) {
      const lignes = partis.map((p) =>
        `<li style="margin:0 0 6px;"><a href="${CRM}/?page=fiche&client=${encodeURIComponent(p.id)}" style="color:#1a2332;font-weight:700;">${echappe(p.nom)}</a>${p.revente ? ' <span style="color:#9a7d2e;font-weight:700;">· revente possible</span>' : ''}</li>`).join('');
      const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2f3c52">
  <div style="background:#1a2332;padding:18px 22px;border-radius:14px 14px 0 0">
    <div style="color:#c9a84c;font-weight:700;letter-spacing:2px;font-size:11px">EMILIO · CRM</div>
    <div style="color:#ffffff;font-weight:800;font-size:18px;margin-top:6px">Point automatique du jour</div>
  </div>
  <div style="border:1px solid #e3e8f0;border-top:none;border-radius:0 0 14px 14px;padding:18px 22px;font-size:14px;line-height:1.6">
    ${partis.length ? `<p style="margin:0 0 10px;">Le mail « Où en est votre recherche ? » est parti chez ${partis.length} client${partis.length > 1 ? 's' : ''} dont le dossier ne bougeait plus :</p><ul style="margin:0 0 12px;padding-left:18px;">${lignes}</ul><p style="margin:0;color:#64748b;font-size:13px;">Leurs réponses arriveront dans tes Relances et dans leur suivi.</p>` : ''}
    ${rates.length ? `<p style="margin:14px 0 0;color:#b91c1c;">Pas parti : ${rates.map((x) => `${echappe(x.nom)} (${echappe(x.erreur)})`).join(', ')}.</p>` : ''}
  </div>
</div>`;
      await envoyerMailjet({
        a: process.env.ALERTES_EMAIL || process.env.MAILJET_FROM_EMAIL || 'arogelet@emilio-immo.com',
        sujet: `📨 Point automatique : ${partis.length} mail${partis.length > 1 ? 's' : ''} envoyé${partis.length > 1 ? 's' : ''}`,
        html, texte: `${partis.map((p) => p.nom).join(', ')}${rates.length ? `\nPas parti : ${rates.map((x) => x.nom).join(', ')}` : ''}`,
        id: `point-recap-${Date.now()}`, deNom: 'Emilio · CRM',
      });
    }

    return NextResponse.json({ ok: true, envoyes: partis.length, rates, restants: Math.max(0, candidats.filter((c) => c.du).length - dus.length) });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'erreur' }, { status: 500 });
  }
}
