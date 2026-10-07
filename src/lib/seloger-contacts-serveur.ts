import { createHmac, timingSafeEqual } from 'node:crypto';
import type { BienVente } from '@/lib/biens-vente';
import { TABLE_DEMANDES } from '@/lib/demandes-site';
import { baseServeur } from '@/lib/flux-site-serveur';
import { accesAviv, appelAviv, erreurDe, garderJson, lireJson, type Acces } from '@/lib/seloger-serveur';
import { indexerBiens, ligneDuLead, type LeadAviv, type LigneDemande } from '@/lib/seloger-contacts';

/* ═══ La relève des demandes SeLoger, Logic-Immo, Belles Demeures (V3.100) ══
   L'API « Seeker Leads » v1 d'AVIV : `GET /leads?minDate&maxDate` (en
   secondes, sept jours au plus par appel, cent demandes par page). Mêmes
   codes que l'envoi des annonces, son propre jeton (lib/seloger-serveur.ts).

   Qui la déclenche :
     · le CRM ouvert, toutes les 5 minutes (components/layout/EnvoiPortails.tsx) ;
     · le cron de Vercel, chaque matin ;
     · AVIV lui-même, dès qu'une demande arrive, si l'abonnement (webhook)
       est en place : il appelle /api/seloger/contacts avec notre clé, et
       on relève les deux derniers jours. On ne lit pas ce qu'il envoie : la
       relève est la seule source, l'appel n'est qu'un signal.

   Ce qu'on retient (bucket `mandats`, diffusion/seloger-contacts-<env>.json) :
   jusqu'où on a relevé. On repart deux heures avant, et `lead_id` (unique
   en base, outils/sql/demandes-portails.sql) empêche tout doublon.

   La première relève remonte 30 jours : ce qui a plus de deux jours arrive
   « Traitée » — ImmoFacile et les mails de SeLoger l'ont déjà apporté. */

const JOUR = 86_400;
const FENETRE = 7 * JOUR - 60;         // « Max period length is 7 days »
const PREMIERE = 30 * JOUR;
const RECOUVREMENT = 2 * 3600;
const BUDGET_MS = 40_000;
const PAS_AVANT_MS = 60_000;           // plusieurs onglets ouverts : une relève par minute

type EtatContacts = { jusqua: number; le: string; recus: number; ajoutes: number; erreur?: string | null };
const fichierEtat = (e: string) => `diffusion/seloger-contacts-${e}.json`;

export type ResultatContacts = {
  ok: boolean; env: string; erreur?: string;
  attente?: 'codes' | 'sql'; recent?: boolean;
  recus: number; ajoutes: number; depuis?: string; jusqua?: string;
};

/* Ce qui manque en base (outils/sql/demandes-portails.sql pas encore passé). */
const sqlAbsent = (m: string) =>
  /(lead_id|source)/i.test(m) && /(column|schema cache|could not find)/i.test(m) || /no unique or exclusion constraint/i.test(m);
export const MESSAGE_SQL_CONTACTS = 'Les demandes des portails ne peuvent pas être rangées : passez outils/sql/demandes-portails.sql dans Supabase.';

/* ── Lire les demandes d'une période (toutes les pages) ────────────────── */
async function lireLeads(sb: ReturnType<typeof baseServeur>, a: Acces, de: number, a_: number, fin: number): Promise<{ leads: LeadAviv[]; erreur?: string; coupe?: boolean }> {
  const leads: LeadAviv[] = [];
  for (let debut = de; debut < a_; debut += FENETRE) {
    const jusqua = Math.min(a_, debut + FENETRE);
    let start = '';
    for (let page = 0; page < 30; page++) {
      if (Date.now() > fin) return { leads, coupe: true };
      const q = new URLSearchParams({ minDate: String(debut), maxDate: String(jusqua), limit: '100' });
      if (start) q.set('start', start);
      const r = await appelAviv(sb, a, 'GET', `/leads?${q}`);
      if (r.status === 404) break;                    // aucune demande sur la période
      if (r.status !== 200 && r.status !== 206) return { leads, erreur: `SeLoger : ${erreurDe(r)}` };
      const items = (Array.isArray(r.json?.items) ? r.json!.items : []) as LeadAviv[];
      leads.push(...items.filter(x => x?.metadata?.leadId));
      const suivant = String((r.json?.links as { next?: string } | undefined)?.next || '');
      const s = /[?&]start=([^&]+)/.exec(suivant)?.[1];
      if (!items.length || (!s && r.status === 200)) break;
      const prochain = s ? decodeURIComponent(s) : String(items[items.length - 1]?.metadata?.leadId || '');
      if (!prochain || prochain === start) break;
      start = prochain;
    }
  }
  return { leads };
}

/* ── Les biens, pour relier chaque demande à son annonce ───────────────── */
async function indexDesBiens(sb: ReturnType<typeof baseServeur>) {
  const { data, error } = await sb.from('biens_vente').select('id, reference, donnees, titre, ville, archive');
  if (error) console.error('[seloger-contacts] biens', error.message);
  return indexerBiens((data || []) as Pick<BienVente, 'id' | 'reference' | 'donnees' | 'titre' | 'ville' | 'archive'>[]);
}

/* ── Ranger dans « Demandes Internet » ─────────────────────────────────── */
async function ranger(sb: ReturnType<typeof baseServeur>, lignes: LigneDemande[]): Promise<{ ajoutes: number; erreur?: string; sql?: boolean }> {
  let ajoutes = 0;
  for (let i = 0; i < lignes.length; i += 50) {
    const { data, error } = await sb.from(TABLE_DEMANDES)
      .upsert(lignes.slice(i, i + 50), { onConflict: 'lead_id', ignoreDuplicates: true })
      .select('id');
    if (error) {
      console.error('[seloger-contacts] rangement', error.message);
      return sqlAbsent(error.message) ? { ajoutes, erreur: MESSAGE_SQL_CONTACTS, sql: true } : { ajoutes, erreur: `Les demandes n’ont pas été rangées (${error.message}).` };
    }
    ajoutes += (data || []).length;
  }
  return { ajoutes };
}

/* ── La relève ─────────────────────────────────────────────────────────── */
export async function releverContacts(o: { forcer?: boolean; heures?: number } = {}): Promise<ResultatContacts> {
  const debut = Date.now();
  const a = accesAviv('contacts');
  if (!a) return { ok: true, env: 'sandbox', attente: 'codes', recus: 0, ajoutes: 0 };
  const sb = baseServeur();
  const etat = await lireJson<EtatContacts>(sb, fichierEtat(a.env));
  if (!o.forcer && etat?.le && Date.now() - new Date(etat.le).getTime() < PAS_AVANT_MS) {
    return { ok: !etat.erreur, env: a.env, recent: true, recus: 0, ajoutes: 0, ...(etat.erreur ? { erreur: etat.erreur } : {}) };
  }

  const maintenant = Math.floor(Date.now() / 1000);
  const premiere = !etat?.jusqua;
  const de = o.heures ? maintenant - o.heures * 3600
    : premiere ? maintenant - PREMIERE
      : Math.max(etat!.jusqua - RECOUVREMENT, maintenant - PREMIERE);

  let leads: LeadAviv[] = [], erreur: string | undefined, coupe = false;
  try {
    ({ leads, erreur, coupe = false } = await lireLeads(sb, a, de, maintenant, debut + BUDGET_MS));
  } catch (e) { erreur = (e as Error).message; }

  let ajoutes = 0, sql = false;
  if (leads.length) {
    const index = await indexDesBiens(sb);
    const vus = new Set<string>();
    const lignes = leads
      .filter(l => !vus.has(String(l.metadata.leadId)) && !!vus.add(String(l.metadata.leadId)))
      .map(l => ligneDuLead(l, index, premiere ? { traiteeAvant: Date.now() - 2 * JOUR * 1000 } : {}));
    const r = await ranger(sb, lignes);
    ajoutes = r.ajoutes;
    if (r.erreur) { erreur = erreur ? `${erreur} ; ${r.erreur}` : r.erreur; sql = !!r.sql; }
  }

  /* On n'avance que si tout est rangé : sinon, la prochaine relève reprend. */
  const avance = !erreur && !coupe && !o.heures;
  const nouvel: EtatContacts = {
    jusqua: avance ? maintenant : etat?.jusqua || 0,
    le: new Date().toISOString(), recus: leads.length, ajoutes, erreur: erreur || null,
  };
  if (avance || erreur || !etat) await garderJson(sb, fichierEtat(a.env), nouvel, 'L’état des contacts SeLoger');
  return {
    ok: !erreur, env: a.env, ...(erreur ? { erreur } : {}), ...(sql ? { attente: 'sql' as const } : {}),
    recus: leads.length, ajoutes,
    depuis: new Date(de * 1000).toISOString(), jusqua: new Date(maintenant * 1000).toISOString(),
  };
}

/* ── Ce que contiendrait la relève, sans rien ranger (le CRM, derrière le badge) ── */
export async function apercuContacts(o: { jours?: number; env?: 'sandbox' | 'production' } = {}) {
  const a = accesAviv('contacts', o.env);
  if (!a) return { ok: true, attente: 'codes' as const, lignes: [] as LigneDemande[] };
  const sb = baseServeur();
  const maintenant = Math.floor(Date.now() / 1000);
  const jours = Math.min(Math.max(o.jours || 7, 1), 30);
  /* Un accès refusé (jeton) lève une erreur : on la rend, au lieu d'un 500 muet. */
  let r: Awaited<ReturnType<typeof lireLeads>>;
  try { r = await lireLeads(sb, a, maintenant - jours * JOUR, maintenant, Date.now() + BUDGET_MS); }
  catch (e) { return { ok: false, env: a.env, erreur: (e as Error).message, recus: 0, lignes: [] as LigneDemande[] }; }
  const index = r.leads.length ? await indexDesBiens(sb) : new Map();
  return { ok: !r.erreur, env: a.env, ...(r.erreur ? { erreur: r.erreur } : {}), recus: r.leads.length, lignes: r.leads.map(l => ligneDuLead(l, index)) };
}

export async function etatContacts() {
  const a = accesAviv('contacts');
  if (!a) return { codes: false, env: null, dernier: null };
  return { codes: true, env: a.env, dernier: await lireJson<EtatContacts>(baseServeur(), fichierEtat(a.env)) };
}

/* ── L'abonnement (webhook) ────────────────────────────────────────────────
   La clé qu'AVIV nous renverra se déduit de CRON_SECRET : rien de plus à
   mettre dans Vercel, et elle ne figure nulle part dans ce dépôt. */
export function cleWebhook(): string | null {
  const s = process.env.CRON_SECRET?.trim();
  return s ? createHmac('sha256', s).update('seloger-contacts').digest('hex').slice(0, 40) : null;
}
export function cleValide(donnee: string | null | undefined): boolean {
  const k = cleWebhook();
  const d = String(donnee || '').replace(/^(Bearer|ApiKey)\s+/i, '').trim();
  if (!k || !d || d.length !== k.length) return false;
  return timingSafeEqual(Buffer.from(d), Buffer.from(k));
}
const adresseWebhook = (k: string) => `${(process.env.NEXT_PUBLIC_CRM_URL || 'https://crm.emilio-immo.com').replace(/\/+$/, '')}/api/seloger/contacts?cle=${k}`;
type Abonnement = { subscriptionId?: string; url?: string; status?: string; createdAt?: string; updatedAt?: string };
const cacher = (u?: string) => String(u || '').replace(/([?&]cle=)[^&]+/, '$1…');

export async function abonnements() {
  const a = accesAviv('contacts');
  if (!a) return { ok: true, attente: 'codes' as const, abonnements: [] as Abonnement[] };
  let r: Awaited<ReturnType<typeof appelAviv>>;
  try { r = await appelAviv(baseServeur(), a, 'GET', '/webhook/subscriptions'); }
  catch (e) { return { ok: false, env: a.env, erreur: (e as Error).message, abonnements: [] as Abonnement[] }; }
  if (r.status !== 200) return { ok: false, env: a.env, erreur: `SeLoger : ${erreurDe(r)}`, abonnements: [] as Abonnement[] };
  const items = (Array.isArray(r.json?.items) ? r.json!.items : []) as Abonnement[];
  return { ok: true, env: a.env, abonnements: items.map(x => ({ ...x, url: cacher(x.url) })) };
}

/* S'abonner, une fois : si l'adresse est déjà là, on la remet active. */
export async function abonner() {
  try { return await abonnerVraiment(); }
  catch (e) { return { ok: false, erreur: (e as Error).message }; }
}
async function abonnerVraiment() {
  const a = accesAviv('contacts');
  const k = cleWebhook();
  if (!a || !k) return { ok: false, erreur: !a ? 'codes SeLoger absents' : 'CRON_SECRET absent' };
  const sb = baseServeur();
  const url = adresseWebhook(k);
  const liste = await appelAviv(sb, a, 'GET', '/webhook/subscriptions');
  if (liste.status !== 200) return { ok: false, env: a.env, erreur: `SeLoger : ${erreurDe(liste)}` };
  const deja = ((Array.isArray(liste.json?.items) ? liste.json!.items : []) as Abonnement[]).find(x => x.url === url);
  const r = deja?.subscriptionId
    ? await appelAviv(sb, a, 'PUT', `/webhook/subscriptions/${encodeURIComponent(deja.subscriptionId)}`, { apiKey: k, status: 'ACTIVE' })
    : await appelAviv(sb, a, 'POST', '/webhook/subscriptions', { url, apiKey: k, status: 'ACTIVE' });
  if (r.status < 200 || r.status >= 300) return { ok: false, env: a.env, erreur: `SeLoger : ${erreurDe(r)}` };
  return { ok: true, env: a.env, abonnement: { ...(r.json || {}), url: cacher(url) } };
}
