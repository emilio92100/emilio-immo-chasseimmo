/* ═══ La diffusion des annonces (V3.91) ════════════════════════════════════
   Où part l'annonce d'un bien : le site emilio-immo.com, SeLoger (qui la met
   aussi sur Logic-Immo, sans rien à faire de plus), Belles Demeures, Jinka.

   Alexandre (6 octobre) : un bien est diffusé aux étapes « En vente »,
   « Sous offre », « Sous compromis » et « Annonce type » ; un bouton sur
   chaque bien, « Diffusion en cours / Non diffusé », pour garder la main ;
   à chaque mandat, il coche les supports (Belles Demeures seulement pour
   les biens qu'il choisit ; certains biens vont sur le site seul).

   Rangé dans `biens_vente.donnees.diffusion` : aucun SQL. Absent, le bien
   n'est pas encore réglé : la fiche dit « À régler » et propose les
   supports par défaut. En pause, rien ne part, et les choix sont gardés
   pour la reprise.

   Tant que les passerelles du CRM ne sont pas branchées, ce sont des
   réglages : les portails partent encore d'ImmoFacile (context.md §7).
   Les envois (le site, Jinka, SeLoger) liront `diffuseSur`, et rien d'autre.

   V3.96 (Alexandre : « on laisse en diffusion comme si c'était en vente »,
   pour un bien retiré ou vendu qu'il garde en vitrine) : un bien peut être
   diffusé quand même hors des étapes de vente, à sa demande. Le réglage
   retient l'étape où il a été pris (`horsEtape`) et s'arrête tout seul si
   l'étape change : un bien vendu ensuite quitte le site comme les autres.

   Isomorphe : le CRM, le serveur et les bancs d'essai le lisent. */

import type { Donnees } from '@/lib/actes';
import { etapeDe, type BienVente, type EtapeVente } from '@/lib/biens-vente';

export type Support = 'site' | 'seloger' | 'bd' | 'jinka';

export const SUPPORTS: { k: Support; lib: string; court: string; sous: string; c: string; fond: string }[] = [
  { k: 'site', lib: 'Mon site', court: 'Site', sous: 'emilio-immo.com', c: '#22497c', fond: '#eef3fa' },
  { k: 'seloger', lib: 'SeLoger', court: 'SL', sous: 'Et Logic-Immo, automatiquement', c: '#b4233c', fond: '#fdf0f2' },
  { k: 'bd', lib: 'Belles Demeures', court: 'BD', sous: 'Pour les biens que tu choisis', c: '#5b2d6e', fond: '#f5eef8' },
  { k: 'jinka', lib: 'Jinka', court: 'JK', sous: 'L’appli qui regroupe les annonces', c: '#0e7490', fond: '#ecfeff' },
];
export const supportDe = (k: Support) => SUPPORTS.find(x => x.k === k)!;

/* Les étapes où un bien part sur ses supports. « En pause » garde les choix
   sans rien diffuser ; avant le mandat, vendu ou retiré, il n'y a rien à
   régler. */
export const ETAPES_DIFFUSEES: EtapeVente[] = ['mandat', 'offre', 'compromis', 'annonce_type'];
const ETAPES_REGLABLES: EtapeVente[] = [...ETAPES_DIFFUSEES, 'suspendu'];
export const etapeDiffusee = (e: string | null | undefined) => ETAPES_DIFFUSEES.includes(e as EtapeVente);

/* Ce qu'on propose quand rien n'est encore réglé : tout, sauf Belles
   Demeures, qu'Alexandre réserve à certains biens. */
export const SUPPORTS_DEFAUT: Record<Support, boolean> = { site: true, seloger: true, bd: false, jinka: true };

export type Diffusion = {
  /* Le bouton « Diffusion en cours / Non diffusé ». */
  actif: boolean;
  supports: Record<Support, boolean>;
  /* Quand le réglage a changé (ISO). */
  le?: string;
  /* V3.96 : diffusé quand même à cette étape (retiré, vendu, estimation…). */
  horsEtape?: EtapeVente;
};

export function lireDiffusion(d: Donnees | null | undefined): Diffusion | null {
  const x = d?.diffusion;
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const s = (o.supports && typeof o.supports === 'object' && !Array.isArray(o.supports) ? o.supports : {}) as Record<string, unknown>;
  return {
    actif: o.actif !== false,
    supports: { site: s.site === true, seloger: s.seloger === true, bd: s.bd === true, jinka: s.jinka === true },
    ...(typeof o.le === 'string' && o.le ? { le: o.le } : {}),
    ...(typeof o.horsEtape === 'string' && o.horsEtape ? { horsEtape: o.horsEtape as EtapeVente } : {}),
  };
}

export const nouvelleDiffusion = (actif: boolean, supports: Record<Support, boolean>, horsEtape?: EtapeVente | null): Diffusion =>
  ({ actif, supports: { ...supports }, le: new Date().toISOString(), ...(horsEtape ? { horsEtape } : {}) });

/* Une étape où rien ne part d'office, mais où Alexandre peut tout de même
   diffuser (V3.96) : tout sauf les étapes de vente et la pause. */
export const etapeHorsVente = (e: string | null | undefined) => !!e && !ETAPES_REGLABLES.includes(e as EtapeVente);

export const supportsCoches = (s: Record<Support, boolean>): Support[] => SUPPORTS.filter(x => s[x.k]).map(x => x.k);

/* « Mon site, SeLoger et Jinka ». */
export function nomsSupports(l: Support[]): string {
  const noms = l.map(k => supportDe(k).lib);
  return noms.length <= 1 ? noms.join('') : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}

/* ── Où en est un bien ─────────────────────────────────────────────────────
   `ton` : on (il part), off (coupé à la main, ou rien de coché), pause (la
   vente est en pause), regler (étape diffusée, rien encore choisi).
   `concerne` : le bouton du bandeau et la pastille de la liste ne se
   montrent que là. */
export type TonDiffusion = 'on' | 'off' | 'pause' | 'regler';
export type EtatDiffusion = {
  concerne: boolean; regle: boolean; enLigne: boolean; ton: TonDiffusion;
  supports: Support[]; lib: string; detail: string;
};

export function etatDiffusion(b: Pick<BienVente, 'etape' | 'archive' | 'donnees'>): EtatDiffusion {
  const r = lireDiffusion(b.donnees);
  const supports = r ? supportsCoches(r.supports) : [];
  /* V3.96 : diffusé quand même, à l'étape où il a été réglé. */
  if (!b.archive && r && r.actif && r.horsEtape === b.etape && etapeHorsVente(b.etape) && supports.length) {
    return { concerne: true, regle: true, supports, enLigne: true, ton: 'on', lib: 'Diffusé', detail: `Sur ${nomsSupports(supports)}, à ta demande, bien que le bien soit « ${etapeDe(b.etape).lib} ».` };
  }
  const concerne = !b.archive && ETAPES_REGLABLES.includes(b.etape);
  const base = { concerne, regle: !!r, supports };
  if (!concerne) return { ...base, enLigne: false, ton: 'off', lib: 'Non diffusé', detail: b.archive ? 'Le bien est archivé.' : 'Rien à diffuser à cette étape.' };
  if (b.etape === 'suspendu') return { ...base, enLigne: false, ton: 'pause', lib: 'Non diffusé', detail: 'La vente est en pause : rien ne part. Tes choix sont gardés pour la reprise.' };
  if (!r) return { ...base, enLigne: false, ton: 'regler', lib: 'À régler', detail: 'Choisis où part l’annonce.' };
  if (!r.actif) return { ...base, enLigne: false, ton: 'off', lib: 'Non diffusé', detail: 'Coupé à la main : l’annonce ne part nulle part.' };
  if (!supports.length) return { ...base, enLigne: false, ton: 'off', lib: 'Non diffusé', detail: 'Aucun support coché.' };
  return { ...base, enLigne: true, ton: 'on', lib: 'Diffusé', detail: `Sur ${nomsSupports(supports)}.` };
}

/* La seule question que poseront les envois : ce bien part-il sur ce support ? */
export function diffuseSur(b: Pick<BienVente, 'etape' | 'archive' | 'donnees'>, support: Support): boolean {
  const e = etatDiffusion(b);
  return e.enLigne && e.supports.includes(support);
}
