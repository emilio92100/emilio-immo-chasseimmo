import { createHash } from 'node:crypto';
import type { BienVente } from '@/lib/biens-vente';
import { baseServeur, positionsBiens } from '@/lib/flux-site-serveur';
import { lotSeLoger, SELOGER_LOGICIEL, SELOGER_VERSION_LOGICIEL, type LotSeLoger, type Portail } from '@/lib/seloger';

/* ═══ L'envoi à SeLoger (V3.98) ═════════════════════════════════════════════
   L'API « Aviv Classified » v4 d'AVIV (SeLoger, Logic-Immo, Belles
   Demeures) : une annonce créée (POST), modifiée (PUT) ou retirée (DELETE)
   à chaque changement, au lieu d'un fichier complet comme chez Jinka.

   L'accès (OAuth 2.0, « client_credentials ») : un jeton valable 24 heures,
   demandé avec les codes de l'agence, et GARDÉ pendant toute sa durée —
   AVIV le vérifie pendant la recette, et en fait une condition pour la
   production. Il est rangé dans le bucket privé `mandats`.

   Les codes sont dans Vercel, jamais dans ce dépôt :
     SELOGER_CLIENT_ID, SELOGER_CLIENT_SECRET ;
     facultatifs : SELOGER_ENV (« sandbox » tant que la recette n'est pas
     passée, puis « production »), SELOGER_INTERMEDIAIRE (le code de
     l'agence chez SeLoger), SELOGER_AUDIENCE et SELOGER_SCOPE (si AVIV en
     donne d'autres que ceux par défaut).

   Ce qu'on retient de chaque annonce (bucket `mandats`,
   diffusion/seloger-<env>.json) : son numéro chez SeLoger (`classifiedId`)
   et l'empreinte de ce qu'on lui a envoyé. Une annonce n'est renvoyée que
   si elle a changé ; un bien qui ne doit plus y être est retiré. */

const BUCKET = 'mandats';
const AUTH = 'https://auth.api.aviv-group.com/oauth/token';
const BUDGET_MS = 45_000;

type Env = 'sandbox' | 'production';
const envSeLoger = (): Env => (process.env.SELOGER_ENV?.trim().toLowerCase() === 'production' ? 'production' : 'sandbox');
const baseApi = (e: Env) => (e === 'production' ? 'https://api.aviv-group.com/caas/v4' : 'https://api.aviv-group.com/sandbox/caas/v4');

/* V3.100 : deux API d'AVIV, mêmes codes, chacune son jeton (son « audience »).
   « annonces » : l'envoi des annonces (Aviv Classified v4) ;
   « contacts » : les demandes des acquéreurs (Seeker Leads v1,
   lib/seloger-contacts-serveur.ts). SELOGER_CONTACTS_ENV, s'il est mis, règle
   les contacts à part (sinon, ils suivent SELOGER_ENV). */
export type ApiAviv = 'annonces' | 'contacts';
const envContacts = (): Env => {
  const v = process.env.SELOGER_CONTACTS_ENV?.trim().toLowerCase();
  return v === 'production' ? 'production' : v === 'sandbox' ? 'sandbox' : envSeLoger();
};
const baseContacts = (e: Env) => (e === 'production' ? 'https://api.aviv-group.com/seeker-leads/v1' : 'https://api.aviv-group.com/sandbox/seeker-leads/v1');

function acces(api: ApiAviv = 'annonces', envForce?: Env) {
  const id = process.env.SELOGER_CLIENT_ID?.trim();
  const secret = process.env.SELOGER_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;
  const env = envForce || (api === 'contacts' ? envContacts() : envSeLoger());
  const base = api === 'contacts' ? baseContacts(env) : baseApi(env);
  return {
    id, secret, env, api,
    base,
    audience: (api === 'annonces' ? process.env.SELOGER_AUDIENCE?.trim() : '') || base,
    intermediaire: process.env.SELOGER_INTERMEDIAIRE?.trim() || 'RC-621209',
    scope: (api === 'annonces' ? process.env.SELOGER_SCOPE?.trim() : '') || '',
  };
}
export type Acces = NonNullable<ReturnType<typeof acces>>;
export const accesAviv = acces;

/* « Logiciel/version outil/version système/version », sans « / » ni espace
   à l'intérieur d'une partie : sans lui, le pare-feu d'AVIV refuse. */
const UA = `${SELOGER_LOGICIEL}/${SELOGER_VERSION_LOGICIEL} Node/${(process.versions?.node || '20').replace(/[^\w.-]/g, '')} Linux/Vercel`;

/* ── Ce qu'on garde ────────────────────────────────────────────────────── */
export type AnnonceGardee = { classifiedId: string; empreinte: string; le: string; bienId: string; reference: string | null; portails: Portail[] };
export type EtatSeLoger = {
  annonces: Record<string, AnnonceGardee>;
  dernier?: { le: string; crees: number; modifies: number; retires: number; erreurs: string[] };
};
const fichierEtat = (e: Env) => `diffusion/seloger-${e}.json`;
/* Le jeton des annonces garde son nom d'avant la V3.100 ; celui des contacts a le sien. */
const fichierJeton = (e: Env, api: ApiAviv = 'annonces') => (api === 'annonces' ? `diffusion/seloger-jeton-${e}.json` : `diffusion/seloger-jeton-${api}-${e}.json`);

export async function lireJson<T>(sb: ReturnType<typeof baseServeur>, chemin: string): Promise<T | null> {
  const { data, error } = await sb.storage.from(BUCKET).download(chemin);
  if (error || !data) return null;
  try { return JSON.parse(await data.text()) as T; } catch { return null; }
}
export async function garderJson(sb: ReturnType<typeof baseServeur>, chemin: string, x: unknown, quoi: string) {
  const { error } = await sb.storage.from(BUCKET).upload(chemin, Buffer.from(JSON.stringify(x)), { upsert: true, contentType: 'application/json' });
  if (error) console.error(`[seloger] ${quoi} non gardé :`, error.message);
}
export async function lireEtatSeLoger(sb = baseServeur()): Promise<EtatSeLoger> {
  return (await lireJson<EtatSeLoger>(sb, fichierEtat(envSeLoger()))) || { annonces: {} };
}

/* ── Le jeton (24 heures, gardé) ───────────────────────────────────────── */
/* AVIV compte les demandes de jeton : on n'en redemande jamais un tant que
   le précédent vit. Et un refus est retenu 30 minutes — sinon chaque onglet
   du CRM ouvert le redemanderait toutes les 5 minutes —, sauf envoi forcé
   à la main. */
type Jeton = { audience: string; jeton: string; expire: number; le?: number };
type Refus = { audience: string; echec: number; message: string };
/* Un jeton par audience (annonces, contacts ; test ou production). */
const enMemoire = new Map<string, Jeton>();
const ATTENTE_REFUS = 30 * 60_000;

async function jeton(sb: ReturnType<typeof baseServeur>, a: Acces, o: { neuf?: boolean; forcer?: boolean } = {}): Promise<string> {
  const valable = (j: Jeton | null) => !!j && !!j.jeton && j.audience === a.audience && j.expire - Date.now() > 10 * 60_000;
  const memo = enMemoire.get(a.audience) || null;
  if (!o.neuf && valable(memo)) return memo!.jeton;
  const garde = await lireJson<Jeton & Partial<Refus>>(sb, fichierJeton(a.env, a.api));
  if (!o.neuf && valable(garde as Jeton)) { enMemoire.set(a.audience, garde as Jeton); return garde!.jeton; }
  if (!o.forcer && garde?.echec && garde.audience === a.audience && Date.now() - garde.echec < ATTENTE_REFUS) {
    throw new Error(`${garde.message} — nouvel essai automatique dans ${Math.ceil((ATTENTE_REFUS - (Date.now() - garde.echec)) / 60_000)} min`);
  }
  const r = await fetch(AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
    body: JSON.stringify({
      client_id: a.id, client_secret: a.secret, grant_type: 'client_credentials',
      audience: a.audience, intermediary_id: a.intermediaire,
      ...(a.scope ? { scope: a.scope } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const t = await r.text();
  let j: { access_token?: string; expires_in?: number; error?: string; error_description?: string } = {};
  try { j = JSON.parse(t); } catch { /* réponse illisible */ }
  if (!r.ok || !j.access_token) {
    const message = `accès refusé par SeLoger (${r.status}${j.error ? ` ${j.error}` : ''}${j.error_description ? ` : ${j.error_description}` : ''})`;
    enMemoire.delete(a.audience);
    await garderJson(sb, fichierJeton(a.env, a.api), { audience: a.audience, echec: Date.now(), message } satisfies Refus, 'Le refus');
    throw new Error(message);
  }
  const nouveau: Jeton = { audience: a.audience, jeton: j.access_token, expire: Date.now() + (Number(j.expires_in) || 86_400) * 1000, le: Date.now() };
  enMemoire.set(a.audience, nouveau);
  await garderJson(sb, fichierJeton(a.env, a.api), nouveau, 'Le jeton');
  return nouveau.jeton;
}

/* ── Un appel à l'API ──────────────────────────────────────────────────── */
export type Reponse = { status: number; json: Record<string, unknown> | null; trace: string | null };

export async function appelAviv(sb: ReturnType<typeof baseServeur>, a: Acces, methode: string, chemin: string, corps?: unknown, forcer = false): Promise<Reponse> {
  const une = async (j: string) => {
    const r = await fetch(`${a.base}${chemin}`, {
      method: methode,
      headers: { Authorization: `Bearer ${j}`, 'User-Agent': UA, Accept: 'application/json', ...(corps ? { 'Content-Type': 'application/json' } : {}) },
      body: corps ? JSON.stringify(corps) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const t = await r.text();
    let json: Record<string, unknown> | null = null;
    try { json = t ? JSON.parse(t) : null; } catch { /* corps vide ou illisible */ }
    return { status: r.status, json, trace: r.headers.get('traceparent') };
  };
  const r = await une(await jeton(sb, a, { forcer }));
  /* Un jeton refusé (révoqué, codes changés) : un seul nouvel essai, et
     seulement s'il a plus de 10 minutes — un jeton tout neuf refusé, c'est
     un réglage à revoir, pas un jeton à redemander.
     V3.100 : de même pour « 403 Bad Scope » : un jeton pris AVANT qu'AVIV
     ouvre un droit (les contacts, le 8 octobre) ne le porte pas, et il vaut
     24 heures ; il faut en demander un neuf pour avoir le droit. */
  const vieux = enMemoire.get(a.audience);
  const texte = [r.json?.title, r.json?.detail, r.json?.message].filter(x => typeof x === 'string').join(' ');
  const droitManquant = r.status === 403 && /scope/i.test(texte);
  if ((r.status === 401 || droitManquant) && vieux?.le && Date.now() - vieux.le > 10 * 60_000) return une(await jeton(sb, a, { neuf: true, forcer }));
  return r;
}

/* L'erreur telle qu'AVIV la décrit (RFC 7807), en une ligne. */
export function erreurDe(r: Reponse): string {
  const j = r.json || {};
  const details = Array.isArray(j.errors)
    ? (j.errors as { name?: string; reason?: string }[]).slice(0, 4).map(e => `${e.name || ''} ${e.reason || ''}`.trim()).join(' ; ')
    : '';
  const titre = [j.title, j.detail].filter(x => typeof x === 'string' && x).join(' : ');
  return `${r.status}${titre ? ` ${titre}` : ''}${details ? ` (${details})` : ''}${r.trace ? ` [${r.trace}]` : ''}`;
}
const dejaLa = (r: Reponse) => {
  if (r.status !== 400) return null;
  const j = r.json || {};
  if (!/duplicated classified/i.test(String(j.title || '')) && !/Duplicated-Classifieds/i.test(String(j.type || ''))) return null;
  const m = String(j.detail || '').match(/classifiedId:\s*([0-9a-f-]{30,40})/i);
  return m ? m[1] : null;
};

/* ── Le lot du moment, à partir de la base ─────────────────────────────── */
export async function preparerSeLoger(sb = baseServeur()): Promise<LotSeLoger & { empreintes: Map<string, string> }> {
  const { data, error } = await sb.from('biens_vente').select('*').eq('archive', false).not('donnees->diffusion', 'is', null);
  if (error) throw new Error(error.message);
  const biens = (data || []) as BienVente[];
  const gps = await positionsBiens(sb, biens);
  const lot = lotSeLoger(biens, gps);
  const empreintes = new Map(lot.annonces.map(x => [x.id, createHash('sha256').update(JSON.stringify(x.annonce)).digest('hex')]));
  return { ...lot, empreintes };
}

/* Une annonce supprimée chez SeLoger ? (V3.100)
   Son dernier état qui compte, du plus récent au plus ancien, en sautant ce
   qui est en cours (RECEIVING, RECEIVED, …ING) et les échecs (…_FAILED, un
   PUT refusé sur une annonce supprimée) : DELETED = elle n'existe plus. */
async function supprimee(sb: ReturnType<typeof baseServeur>, a: Acces, cid: string, forcer: boolean): Promise<boolean> {
  try {
    const rep = await appelAviv(sb, a, 'GET', `/classifieds/${encodeURIComponent(cid)}/statuses?limit=15`, undefined, forcer);
    if (rep.status === 404) return true;
    if (rep.status !== 200) return false;
    const items = ((Array.isArray(rep.json?.items) ? rep.json!.items : []) as { status?: string; statusDate?: string }[])
      .sort((x, y) => String(y.statusDate || '').localeCompare(String(x.statusDate || '')));
    const fin = items.find(x => { const st = String(x.status || ''); return st && !/^RECEIV/.test(st) && !/ING$/.test(st) && !/_FAILED$/.test(st); });
    return fin?.status === 'DELETED';
  } catch { return false; }
}

/* ── L'envoi ───────────────────────────────────────────────────────────── */
export type ResultatSeLoger = {
  ok: boolean; erreur?: string; env: Env;
  attente?: 'codes'; inchange?: boolean; partiel?: boolean;
  annonces: number; crees: number; modifies: number; retires: number;
  erreurs: string[]; avertissements: string[];
};

export async function deposerSeLoger(o: { forcer?: boolean } = {}): Promise<ResultatSeLoger> {
  const debut = Date.now();
  const sb = baseServeur();
  const env = envSeLoger();
  const vide = { env, crees: 0, modifies: 0, retires: 0, erreurs: [] as string[] };
  let lot: Awaited<ReturnType<typeof preparerSeLoger>>;
  try { lot = await preparerSeLoger(sb); } catch (e) {
    return { ok: false, erreur: `Les biens n’ont pas pu être lus (${(e as Error).message}).`, annonces: 0, avertissements: [], ...vide };
  }
  const base = { annonces: lot.annonces.length, avertissements: lot.avertissements };
  const a = acces();
  if (!a) return { ok: true, attente: 'codes', ...base, ...vide };

  const etat = await lireEtatSeLoger(sb);
  const actuels = new Set(lot.annonces.map(x => x.id));
  const aEnvoyer = lot.annonces.filter(x => o.forcer || etat.annonces[x.id]?.empreinte !== lot.empreintes.get(x.id));
  const aRetirer = Object.keys(etat.annonces).filter(id => !actuels.has(id));
  if (!aEnvoyer.length && !aRetirer.length) return { ok: true, inchange: true, ...base, ...vide };

  const r = { ...vide };
  const f = !!o.forcer;
  let partiel = false;
  try {
    for (const x of aEnvoyer) {
      if (Date.now() - debut > BUDGET_MS) { partiel = true; break; }
      const nom = x.reference || x.id;
      const garde = etat.annonces[x.id];
      let rep: Reponse;
      let cid = garde?.classifiedId || '';
      let cree = false;
      /* V3.100 (8 octobre) : l'annonce gardée a pu être SUPPRIMÉE chez SeLoger —
         celles qu'on avait reprises d'ImmoFacile (« Duplicated classified ») ont
         été effacées quand sa diffusion a été coupée. Un PUT sur une annonce
         supprimée est accepté (202) mais ne la remet jamais en ligne : on en
         crée une nouvelle. */
      if (cid && await supprimee(sb, a, cid, f)) cid = '';
      if (cid) {
        rep = await appelAviv(sb, a, 'PUT', `/classifieds/${encodeURIComponent(cid)}`, x.annonce, f);
        /* Effacée de leur côté : on la recrée. */
        if (rep.status === 404) { cid = ''; rep = await appelAviv(sb, a, 'POST', '/classifieds', x.annonce, f); cree = true; }
      } else {
        rep = await appelAviv(sb, a, 'POST', '/classifieds', x.annonce, f);
        cree = true;
        /* Déjà chez eux sous le même identifiant : on la met à jour. */
        const existant = dejaLa(rep);
        if (existant && existant === garde?.classifiedId) {
          /* SeLoger renvoie vers l'annonce supprimée : on ne la « met pas à jour »
             dans le vide, on le dit. */
          r.erreurs.push(`${nom} : SeLoger garde l’ancienne annonce supprimée (${existant}) sous cet identifiant — à signaler à SeLoger`);
          continue;
        }
        if (existant) { cid = existant; rep = await appelAviv(sb, a, 'PUT', `/classifieds/${encodeURIComponent(cid)}`, x.annonce, f); cree = false; }
      }
      if (rep.status >= 200 && rep.status < 300) {
        const id = typeof rep.json?.classifiedId === 'string' ? rep.json.classifiedId : cid;
        etat.annonces[x.id] = { classifiedId: id, empreinte: lot.empreintes.get(x.id)!, le: new Date().toISOString(), bienId: x.bienId, reference: x.reference, portails: x.portails };
        if (cree) r.crees++; else r.modifies++;
      } else {
        r.erreurs.push(`${nom} : ${erreurDe(rep)}`);
      }
    }
    for (const id of aRetirer) {
      if (Date.now() - debut > BUDGET_MS) { partiel = true; break; }
      const g = etat.annonces[id];
      const rep = await appelAviv(sb, a, 'DELETE', `/classifieds/${encodeURIComponent(g.classifiedId)}`, undefined, f);
      /* Déjà supprimée chez SeLoger (refus d'un DELETE sur une annonce effacée) :
         c'est fait aussi. */
      const partie = (rep.status >= 200 && rep.status < 300) || rep.status === 404 || await supprimee(sb, a, g.classifiedId, f);
      if (partie) { delete etat.annonces[id]; r.retires++; }
      else r.erreurs.push(`${g.reference || id} (retrait) : ${erreurDe(rep)}`);
    }
  } catch (e) {
    r.erreurs.push((e as Error).message);
  }
  etat.dernier = { le: new Date().toISOString(), crees: r.crees, modifies: r.modifies, retires: r.retires, erreurs: r.erreurs.slice(0, 20) };
  await garderJson(sb, fichierEtat(env), etat, 'L’état SeLoger');
  return { ok: !r.erreurs.length, ...(r.erreurs.length ? { erreur: r.erreurs[0] } : {}), ...(partiel ? { partiel } : {}), ...base, ...r };
}

/* ── Où en sont les annonces chez SeLoger ──────────────────────────────── */
/* Où en est chaque annonce (reçue, comparée, créée, photos refusées…),
   pour la recette et pour le CRM. Un appel par annonce : à la demande.
   `historique` : les derniers statuts, du plus récent au plus ancien. */
type Statut = { status?: string; subStatus?: string; subStatusDetails?: string; message?: string; statusDate?: string; mediaStatuses?: { status?: string }[] };
export type StatutAnnonce = {
  id: string; reference: string | null; classifiedId: string; statut: string; message: string; le: string;
  photos: number; photosEnErreur: number; historique: { statut: string; le: string }[];
};
export async function statutsSeLoger(): Promise<{ ok: boolean; erreur?: string; env: Env; annonces: StatutAnnonce[] }> {
  const sb = baseServeur();
  const env = envSeLoger();
  const a = acces();
  if (!a) return { ok: true, env, annonces: [] };
  const etat = await lireEtatSeLoger(sb);
  const out: StatutAnnonce[] = [];
  const nom = (it?: Statut) => [it?.status, it?.subStatus].filter(Boolean).join(' · ') || 'inconnu';
  try {
    for (const [id, g] of Object.entries(etat.annonces)) {
      const rep = await appelAviv(sb, a, 'GET', `/classifieds/${encodeURIComponent(g.classifiedId)}/statuses?limit=15`);
      const items = ((Array.isArray(rep.json?.items) ? rep.json!.items : []) as Statut[])
        .sort((x, y) => String(y.statusDate || '').localeCompare(String(x.statusDate || '')));
      const it = items[0];
      /* Les photos : le dernier statut qui en parle. */
      const media = items.find(x => Array.isArray(x.mediaStatuses) && x.mediaStatuses.length)?.mediaStatuses || [];
      out.push({
        id, reference: g.reference, classifiedId: g.classifiedId,
        statut: rep.status === 200 ? nom(it) : `erreur ${rep.status}`,
        message: rep.status === 200 ? it?.message || it?.subStatusDetails || '' : erreurDe(rep),
        le: it?.statusDate || '',
        photos: media.length,
        photosEnErreur: media.filter(m => /FAILED/.test(String(m.status || ''))).length,
        historique: items.map(x => ({ statut: nom(x), le: x.statusDate || '' })),
      });
    }
  } catch (e) {
    return { ok: false, erreur: (e as Error).message, env, annonces: out };
  }
  return { ok: true, env, annonces: out };
}

export const codesSeLoger = () => !!acces();
export const environnementSeLoger = envSeLoger;
export const environnementContacts = envContacts;
