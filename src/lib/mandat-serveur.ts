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
import { etatMandat, horsMandat, rechercheDepuis, DUREE, type EtatMandat, type Contenu } from './mandat';
import { alerteMailActive } from './alertes';

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
  /* L'expéditeur affiché : Alexandre (par défaut), le CRM (ses alertes), ou
     l'agence seule (le mail du code : un nom neutre, qu'on reconnaît). */
  pj?: PieceJointe[]; deLaPartDe?: 'alexandre' | 'crm' | 'agence'; repondreA?: string;
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
          From: { Email: FROM_EMAIL, Name: o.deLaPartDe === 'crm' ? 'Emilio · CRM' : o.deLaPartDe === 'agence' ? 'Emilio Immobilier' : FROM_NAME },
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

/* ══ Le client élargit sa recherche au-delà de son mandat signé ══════════
   Appelé quand il enregistre ses critères depuis son espace. On compare au
   mandat signé en ligne (son contenu figé) la recherche d'avant et celle
   d'après : seul un écart NOUVEAU prévient Alexandre — historique, relance
   du jour, mail. Un mandat saisi à la main n'a pas de contenu figé : rien à
   comparer. Ne lève jamais : une alerte ratée ne doit pas bloquer
   l'enregistrement des critères. */
export async function alerteHorsMandat(sb: SupabaseClient, o: {
  rechercheId: string; clientId: string; avant: Record<string, unknown>; apres: Record<string, unknown>;
}): Promise<void> {
  const { data: sig, error } = await sb.from('mandats_signatures')
    .select('numero, signe_le, contenu').eq('recherche_id', o.rechercheId).eq('statut', 'signe')
    .order('signe_le', { ascending: false }).limit(1).maybeSingle();
  if (error || !sig?.contenu || !sig.signe_le) return;
  if (Date.parse(sig.signe_le) + DUREE.total * 86_400_000 < Date.now()) return;
  const contenu = sig.contenu as Contenu;
  if (!contenu.recherche) return;
  const avant = horsMandat(contenu, rechercheDepuis(o.avant));
  const neufs = horsMandat(contenu, rechercheDepuis(o.apres)).filter(e => !avant.includes(e));
  if (!neufs.length) return;

  const { data: client } = await sb.from('clients').select('prenom, nom').eq('id', o.clientId).maybeSingle();
  const nom = client ? `${client.prenom || ''} ${client.nom || ''}`.trim() || 'Un client' : 'Un client';
  const signeLe = new Date(sig.signe_le).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  const lienCrm = `${CRM()}/?page=fiche&client=${encodeURIComponent(o.clientId)}`;
  const quoi = neufs.map(e => `⚠️ ${e}`).join('\n');

  const { error: eJ } = await sb.from('journal').insert({
    client_id: o.clientId, recherche_id: o.rechercheId, type: 'mandat',
    titre: '⚠️ Sa recherche dépasse son mandat signé',
    description: `Mandat n° ${sig.numero} signé le ${signeLe}. Il vient de modifier ses critères :\n${quoi}`,
    metadata: { numero: sig.numero, ecarts: neufs },
  });
  if (eJ) console.error('[mandat] alerte hors mandat, journal', eJ.message);
  /* Colonnes réelles de la table : date_echeance / note / statut. */
  const { error: eR } = await sb.from('relances').insert({
    client_id: o.clientId, recherche_id: o.rechercheId,
    type: 'rappel_client', statut: 'en_attente', date_echeance: new Date().toISOString(),
    note: `À rappeler : sa recherche dépasse son mandat n° ${sig.numero} (${neufs.join(' · ')}). Voir s'il faut un nouveau mandat.`.slice(0, 600),
  });
  if (eR) console.error('[mandat] alerte hors mandat, relance', eR.message);
  /* Coupé dans Paramètres → Alertes mail : la relance du jour suffit. */
  if (!(await alerteMailActive(sb, 'mandat_depasse'))) return;
  const eM = await envoyerMail({
    a: ALERTES(), deLaPartDe: 'crm',
    sujet: `⚠️ ${nom} : sa recherche dépasse son mandat (n° ${sig.numero})`,
    texte: `${nom} vient de modifier ses critères depuis son espace. Son mandat n° ${sig.numero}, signé le ${signeLe}, ne couvre peut-être plus toute sa recherche :\n${quoi}\n\nAppelle-le : s'il vise vraiment plus haut ou ailleurs, il lui faudra un nouveau mandat.\n\n${lienCrm}`,
    html: gabarit(`${nom} : sa recherche dépasse son mandat`, `<p><b>${echappe(nom)}</b> vient de modifier ses critères depuis son espace. Son mandat <b>n° ${echappe(String(sig.numero))}</b>, signé le ${signeLe}, ne couvre peut-être plus toute sa recherche :</p>
      ${neufs.map(e => `<p style="color:#b45309">⚠️ ${echappe(e)}</p>`).join('')}
      <p>Appelle-le : s’il vise vraiment plus haut ou ailleurs, il lui faudra un nouveau mandat.</p>
      <a href="${lienCrm}" style="display:inline-block;margin-top:8px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800">Ouvrir sa fiche</a>`),
  });
  if (eM) console.error('[mandat] alerte hors mandat, mail', eM);
}
