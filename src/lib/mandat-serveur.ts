/* ══ Le mandat, côté serveur : numéros, état, envoi des mails ═══════════════

   Serveur uniquement (clé service). Trois choses ici :

   1. La RÉSERVE DE NUMÉROS. Alexandre réserve d'avance quelques numéros dans
      son registre ImmoFacile (le registre unique de l'agence) et les colle dans
      le CRM. Quand un client signe seul, sans mandat préparé, l'espace prend le
      premier libre. Deux lignes de `parametres` :
        · mandat_numeros_reserve     « 1001, 1002, 1003 »
        · mandat_modele_approuve_le  l'instant où Alexandre a approuvé le mandat
                                     type — c'est la signature de l'agence pour
                                     tous les mandats pris sur la réserve.
      Sans approbation, la réserve ne sert pas : personne ne signe à la place
      d'Alexandre.

   2. L'ÉTAT du mandat d'une recherche, tel que l'espace et les routes le
      voient (voir etatMandat() dans src/lib/mandat.ts).

   3. L'envoi des mails (Mailjet), avec pièce jointe.

   Tout est écrit pour marcher AVANT que le SQL soit passé : une colonne ou
   une table absente se lit comme « rien de préparé », jamais comme une panne.
   ════════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { etatMandat, type EtatMandat } from './mandat';

export const CLE_RESERVE = 'mandat_numeros_reserve';
export const CLE_APPROBATION = 'mandat_modele_approuve_le';
export const RESERVE_ALERTE = 2;   // on prévient Alexandre quand il en reste ce nombre

export function lireNumeros(v: string | null | undefined): string[] {
  return String(v || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
}

export async function lireReserve(sb: SupabaseClient): Promise<{ numeros: string[]; approuveLe: string | null; brut: string | null }> {
  const { data, error } = await sb.from('parametres').select('cle, valeur').in('cle', [CLE_RESERVE, CLE_APPROBATION]);
  if (error || !data) return { numeros: [], approuveLe: null, brut: null };
  const brut = (data.find(x => x.cle === CLE_RESERVE)?.valeur as string | null) ?? null;
  const approuveLe = (data.find(x => x.cle === CLE_APPROBATION)?.valeur as string | null) || null;
  return { numeros: lireNumeros(brut), approuveLe, brut };
}

/* Prendre le premier numéro libre de la réserve. On réécrit la liste en
   vérifiant qu'elle n'a pas bougé entre-temps (deux clients qui signent à la
   même seconde ne prennent pas le même numéro) ; trois essais suffisent. */
export async function prendreNumero(sb: SupabaseClient): Promise<{ numero: string; restants: number; approuveLe: string } | null> {
  for (let essai = 0; essai < 3; essai++) {
    const r = await lireReserve(sb);
    if (!r.approuveLe || !r.numeros.length || r.brut === null) return null;
    const [numero, ...reste] = r.numeros;
    const { data, error } = await sb.from('parametres')
      .update({ valeur: reste.join(', '), updated_at: new Date().toISOString() })
      .eq('cle', CLE_RESERVE).eq('valeur', r.brut).select('cle');
    if (!error && data && data.length === 1) return { numero, restants: reste.length, approuveLe: r.approuveLe };
  }
  return null;
}

/* L'état vu par l'espace : un numéro préparé sur la recherche, OU une
   réserve approuvée et non vide, suffisent pour proposer la signature. */
export async function etatServeur(sb: SupabaseClient, recherche: Record<string, unknown>): Promise<EtatMandat> {
  const e = etatMandat(recherche as Parameters<typeof etatMandat>[0]);
  if (e !== 'sans_numero') return e;
  const r = await lireReserve(sb);
  return r.approuveLe && r.numeros.length ? 'a_signer' : 'sans_numero';
}

/* ── Les mails ── */
const FROM_EMAIL = process.env.MAILJET_FROM_EMAIL || 'arogelet@emilio-immo.com';
const FROM_NAME = process.env.MAILJET_FROM_NAME || 'Alexandre ROGELET — Emilio Immobilier';

export const echappe = (t: string) =>
  String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type PieceJointe = { nom: string; type: string; base64: string };

/* Rend null si tout va bien, sinon le message d'erreur. */
export async function envoyerMail(o: {
  a: string; nomA?: string; sujet: string; texte: string; html: string;
  pj?: PieceJointe[]; deLaPartDe?: 'alexandre' | 'crm'; repondreA?: string;
}): Promise<string | null> {
  const apiKey = process.env.MAILJET_API_KEY, apiSecret = process.env.MAILJET_API_SECRET;
  if (!apiKey || !apiSecret) return 'Mailjet non configuré';
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  try {
    const r = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        Messages: [{
          From: { Email: FROM_EMAIL, Name: o.deLaPartDe === 'crm' ? 'Emilio · CRM' : FROM_NAME },
          To: [{ Email: o.a, ...(o.nomA ? { Name: o.nomA } : {}) }],
          ...(o.repondreA ? { ReplyTo: { Email: o.repondreA } } : {}),
          Subject: o.sujet,
          TextPart: o.texte,
          HTMLPart: o.html,
          ...(o.pj?.length ? { Attachments: o.pj.map(p => ({ ContentType: p.type, Filename: p.nom, Base64Content: p.base64 })) } : {}),
          TrackOpens: 'disabled', TrackClicks: 'disabled',
        }],
      }),
    });
    if (!r.ok) return `Mailjet ${r.status}`;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'envoi impossible';
  }
}

/* Le gabarit commun : la bande marine, puis le texte. */
export function gabarit(titre: string, corpsHtml: string, pied = '') {
  return `<div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2f3c52">
  <div style="background:#1a2332;padding:18px 22px;border-radius:14px 14px 0 0">
    <div style="color:#c9a84c;font-weight:700;letter-spacing:2px;font-size:11px">EMILIO IMMOBILIER</div>
    <div style="color:#ffffff;font-weight:800;font-size:18px;margin-top:6px">${echappe(titre)}</div>
  </div>
  <div style="border:1px solid #e3e8f0;border-top:none;border-radius:0 0 14px 14px;padding:20px 22px;font-size:14px;line-height:1.65">
    ${corpsHtml}
    ${pied ? `<div style="margin-top:18px;font-size:12px;color:#94a3b8">${pied}</div>` : ''}
  </div>
</div>`;
}

export const ALERTES = () => process.env.ALERTES_EMAIL || FROM_EMAIL;
export const CRM = () => process.env.NEXT_PUBLIC_CRM_URL || 'https://crm.emilio-immo.com';

/* « iPhone · Safari », « Android · Chrome », « Mac · Chrome »… assez pour le
   certificat, sans prétendre à l'exactitude d'un vrai analyseur. */
export function appareilDe(ua: string): string {
  const u = String(ua || '');
  const os = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android'
    : /Mac OS X/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : /Linux/.test(u) ? 'Linux' : 'Appareil inconnu';
  const nav = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /SamsungBrowser/.test(u) ? 'Samsung Internet'
    : /CriOS|Chrome\//.test(u) ? 'Chrome' : /FxiOS|Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'navigateur inconnu';
  const v = u.match(/Version\/(\d+)/)?.[1] || u.match(/(?:Chrome|CriOS|Firefox|FxiOS|Edg)\/(\d+)/)?.[1];
  return `${os} · ${nav}${v ? ' ' + v : ''}`;
}
