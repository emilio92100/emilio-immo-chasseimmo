import { NextRequest, NextResponse } from 'next/server';
import { base } from '@/lib/agences-serveur';
import { codeValide, lienAvecCode, resumePourAgence, tableAgencesAbsente } from '@/lib/agences-lien';
import { mailLienAgence } from '@/lib/mail-agence';
import { envoyerMail } from '@/lib/mandat-serveur';
import { avecRemises } from '@/lib/remise-mail';

/**
 * Le joli mail du lien pour les agences (V3.198, maquettes 7 et 8).
 *
 *   POST { recherche_id, email, agence?, interlocuteur?, code? } → { ok } | { ok: false, error }
 *
 * V3.202 : `code`, celui de cette personne (src/lib/agences-lien.ts), va au
 * bout du lien : la page de l'agence remplit ses coordonnées.
 *
 * Envoyé au nom d'Alexandre, comme ses autres mails (Mailjet, src/lib/
 * mandat-serveur.ts) ; la remise est suivie (« Bien arrivé », remise-mail).
 * Le CRM note l'envoi ensuite (src/lib/lien-agences-envois.ts).
 *
 * ⚠️ Route du CRM, protégée par le code d'accès (src/proxy.ts) : elle n'est
 * PAS sous /api/agences/, qui est ouvert aux agences.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const mailValide = (m: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m) && m.length <= 160;
const uuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function POST(req: NextRequest) { return avecRemises(() => envoyer(req)); }

async function envoyer(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const rid = String(body?.recherche_id || '');
    const email = String(body?.email || '').trim();
    const interlocuteur = String(body?.interlocuteur || '').trim().slice(0, 120) || null;
    const agence = String(body?.agence || '').trim().slice(0, 120) || null;
    const code = codeValide(body?.code) ? body.code : null;
    if (!uuid(rid)) return NextResponse.json({ ok: false, error: 'La recherche manque.' }, { status: 400 });
    if (!mailValide(email)) return NextResponse.json({ ok: false, error: 'Cette adresse mail ne semble pas valide.' }, { status: 400 });

    const sb = base();
    const { data: r, error } = await sb.from('recherches').select('*').eq('id', rid).maybeSingle();
    if (error) {
      return NextResponse.json({ ok: false, error: tableAgencesAbsente(error) ? 'Le SQL du lien pour les agences n’est pas passé.' : error.message }, { status: 500 });
    }
    const jeton = (r as Record<string, unknown> | null)?.token_agences;
    if (!r || typeof jeton !== 'string' || !jeton) return NextResponse.json({ ok: false, error: 'Le lien de cette recherche n’existe pas (ou il a été coupé).' }, { status: 409 });

    const m = mailLienAgence({ lien: lienAvecCode(jeton, code), interlocuteur, resume: resumePourAgence(r as Record<string, unknown>) });
    const erreur = await envoyerMail({ a: email, nomA: interlocuteur || agence || undefined, sujet: m.sujet, texte: m.texte, html: m.html, deLaPartDe: 'alexandre' });
    if (erreur) return NextResponse.json({ ok: false, error: `Le mail n’est pas parti : ${erreur}` }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[lien-agences/mail]', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: 'Le mail n’est pas parti.' }, { status: 500 });
  }
}
