/* ═══ Le registre des mandats (V3.18) ═════════════════════════════════════
   Article 72 du décret du 20 juillet 1972 : chaque mandat est inscrit, dans
   l'ordre, sous un numéro qui se suit sans trou, reporté sur l'exemplaire du
   mandant AVANT sa signature. Tenu dans le CRM (outils/sql/registre-mandats.sql) :

   · c'est Alexandre qui le démarre (Documents › Registre des mandats), avec
     le numéro qui suit le dernier de son ancien registre ;
   · ensuite, le numéro est pris par la base, sous verrou, au moment où le
     mandat est figé : « Finaliser » dans Documents, ou la demande de code
     d'un acheteur qui signe seul dans son espace ;
   · une ligne ne se modifie ni ne s'efface : ce qui arrive ensuite (signé,
     sans suite, avenant, fin…) s'ajoute en observations ;
   · chaque ligne porte l'empreinte de son contenu et de la précédente :
     registre_verifier() dit si quoi que ce soit a été retouché.

   Les avenants ne prennent pas de numéro : ils s'inscrivent en observation
   sur la ligne de leur mandat, comme les délégations à un confrère (pas de
   ligne à elles : Cass. 1re civ., 3 janvier 1996, n° 93-21281). Les bons
   de visite, offres et courriers ne vont pas au registre.

   Tout marche AVANT que le SQL soit passé : une table absente se lit comme
   « registre pas démarré », et le CRM continue comme avant (numéro saisi à
   la main, réserve de l'espace). Navigateur et serveur. */

import type { SupabaseClient } from '@supabase/supabase-js';

export type Depart = { premier_numero: number; demarre_le: string; reprise: string | null; empreinte: string };
export type Nature = 'vente' | 'recherche';
export type LigneRegistre = {
  id: string; numero: number; inscrit_le: string; nature: Nature; type_mandat: string | null;
  mandants: string; objet: string; source: string;
  client_id: string | null; recherche_id: string | null; bien_vente_id: string | null; document_id: string | null; signature_id: string | null;
  empreinte_prec: string; empreinte: string;
};
export type ObsRegistre = { id: string; rang: number; registre_id: string; le: string; type: string; texte: string; document_id: string | null; empreinte: string };
export type Probleme = { quoi: string; numero: number | null; probleme: string };

/* Ce qu'on inscrit. `mandants` et `objet` sont écrits une fois pour toutes :
   le registre garde ce qui était vrai au jour de l'inscription. */
export type Entree = {
  nature: Nature; type_mandat?: string | null; mandants: string; objet: string; source?: 'document' | 'espace' | 'main';
  client_id?: string | null; recherche_id?: string | null; bien_vente_id?: string | null; document_id?: string | null; signature_id?: string | null;
};

/* Une table ou une fonction absente (SQL pas encore passé) : pas de
   registre, pas d'erreur. Par le code de l'erreur d'abord ; un refus de
   droits ou une panne, eux, restent des erreurs. */
const CODES_ABSENT = ['PGRST202', 'PGRST205', '42P01', '42883'];
export const registreAbsent = (e: { message: string; code?: string } | string) => {
  const x = typeof e === 'string' ? { message: e, code: '' } : e;
  return CODES_ABSENT.includes(x.code || '') || /does not exist|in the schema cache|Could not find the (function|table)/i.test(x.message);
};

/* Le registre est-il démarré ? `absent` : le SQL n'a pas été passé. */
export async function lireDepart(sb: SupabaseClient): Promise<{ depart: Depart | null; absent: boolean; erreur?: string }> {
  const { data, error } = await sb.from('registre_depart').select('premier_numero, demarre_le, reprise, empreinte').eq('id', 1).maybeSingle();
  if (error) return registreAbsent(error) ? { depart: null, absent: true } : { depart: null, absent: false, erreur: error.message };
  return { depart: (data as Depart) || null, absent: false };
}

/* Tout lire, par pages de 1 000 (le plafond de Supabase par requête). */
export async function toutLire<T>(lire: (de: number, a: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<{ data: T[]; erreur?: string }> {
  const out: T[] = [];
  for (let de = 0; de < 200_000; de += 1000) {
    const { data, error } = await lire(de, de + 999);
    if (error) return { data: out, erreur: error.message };
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return { data: out };
}

/* Le numéro suivant, pour l'annoncer (« le prochain sera le 4331 »). Il
   n'est pris qu'à l'inscription. */
export async function prochainNumero(sb: SupabaseClient, depart: Depart): Promise<number> {
  const { data } = await sb.from('registre_mandats').select('numero').order('numero', { ascending: false }).limit(1).maybeSingle();
  return data ? Number((data as { numero: number }).numero) + 1 : depart.premier_numero;
}

/* Un numéro d'avant le registre (réservé dans l'ancien) : il reste celui
   de son mandat. Les autres viennent du registre. */
export const numeroAncien = (numero: unknown, premier: number | null) => {
  const n = Number(String(numero ?? '').replace(/\D/g, ''));
  return premier !== null && Number.isFinite(n) && n > 0 && n < premier;
};

/* Inscrire : rend la ligne (déjà là pour ce document ou cette signature,
   ou nouvelle). Lève une erreur en mots simples. */
export async function inscrire(sb: SupabaseClient, e: Entree): Promise<LigneRegistre> {
  const { data, error } = await sb.rpc('registre_inscrire', { p: e });
  if (error) throw new Error('Le registre n’a pas pu donner de numéro : ' + error.message);
  const l = (Array.isArray(data) ? data[0] : data) as LigneRegistre | null;
  if (!l?.numero) throw new Error('Le registre n’a pas pu donner de numéro.');
  return l;
}

/* Ajouter une observation, sur la ligne retrouvée par son id, son document,
   sa signature en ligne ou son numéro. Pas de ligne (un mandat d'avant le
   registre) : rien, sans erreur. Rend un message d'erreur, ou null. */
/* `numeroSinon` : si la ligne n'est pas retrouvée par sa signature en
   ligne, par son numéro (un mandat signé dans l'espace dont le numéro vient
   du registre). */
export type Observation = {
  registre_id?: string; document_id_mandat?: string; signature_id?: string; numero?: string | number; numeroSinon?: string | number | null;
  type: TypeObs; texte: string; document_id?: string | null;
};
export async function observer(sb: SupabaseClient, o: Observation): Promise<string | null> {
  const { numeroSinon, ...reste } = o;
  const p = { ...reste, numero: o.numero === undefined ? undefined : String(o.numero) };
  const { data, error } = await sb.rpc('registre_observer', { p });
  if (error) return registreAbsent(error) ? null : 'Le registre des mandats n’a pas pu noter : ' + error.message;
  if (data || numeroSinon === undefined || numeroSinon === null || numeroSinon === '') return null;
  const r2 = await sb.rpc('registre_observer', { p: { type: o.type, texte: o.texte, document_id: o.document_id, numero: String(numeroSinon) } });
  if (r2.error) return registreAbsent(r2.error) ? null : 'Le registre des mandats n’a pas pu noter : ' + r2.error.message;
  return null;
}

export async function verifier(sb: SupabaseClient): Promise<{ ok: boolean; problemes: Probleme[]; erreur?: string }> {
  const { data, error } = await sb.rpc('registre_verifier');
  if (error) return { ok: false, problemes: [], erreur: error.message };
  const l = (data || []) as Probleme[];
  return { ok: l.length === 0, problemes: l };
}

/* ── Les observations ── */
export type TypeObs = 'signe' | 'sans_suite' | 'retracte' | 'annule' | 'avenant' | 'fin' | 'vente' | 'delegation' | 'note';
export const TYPES_OBS: Record<TypeObs, { l: string; ic: string; ton: 'vert' | 'gris' | 'rouge' | 'bleu' | 'or' }> = {
  signe: { l: 'Signé', ic: 'check', ton: 'vert' },
  sans_suite: { l: 'Sans suite', ic: 'croix', ton: 'gris' },
  retracte: { l: 'Rétracté', ic: 'retour', ton: 'rouge' },
  annule: { l: 'Annulé', ic: 'croix', ton: 'rouge' },
  avenant: { l: 'Avenant', ic: 'plume', ton: 'bleu' },
  fin: { l: 'Fin du mandat', ic: 'drapeau', ton: 'gris' },
  vente: { l: 'Vente conclue', ic: 'cle', ton: 'or' },
  delegation: { l: 'Délégation', ic: 'accord', ton: 'bleu' },
  note: { l: 'Observation', ic: 'bulle', ton: 'bleu' },
};
/* Ce qu'on peut ajouter à la main, depuis le registre. */
export const OBS_A_LA_MAIN: TypeObs[] = ['signe', 'sans_suite', 'fin', 'vente', 'annule', 'delegation', 'note'];

/* L'état d'une ligne : la dernière observation qui en décide. */
const DECIDE: TypeObs[] = ['signe', 'sans_suite', 'retracte', 'annule', 'fin', 'vente'];
export type EtatLigne = { cle: 'reserve' | TypeObs; l: string; ton: string; le: string | null };
export function etatLigne(obs: ObsRegistre[]): EtatLigne {
  const d = [...obs].sort((a, b) => a.rang - b.rang).filter(o => DECIDE.includes(o.type as TypeObs)).pop();
  if (!d) return { cle: 'reserve', l: 'Réservé, pas encore signé', ton: 'bleu', le: null };
  const t = TYPES_OBS[d.type as TypeObs];
  return { cle: d.type as TypeObs, l: t.l, ton: t.ton, le: d.le };
}

export const NATURES: Record<Nature, string> = { vente: 'Mandat de vente', recherche: 'Mandat de recherche' };
export const TYPES_MANDAT: Record<string, string> = { simple: 'simple', semi: 'semi-exclusif', exclusif: 'exclusif' };
export const SOURCES: Record<string, string> = { document: 'Documents', espace: 'Signé dans l’espace', main: 'Inscrit à la main' };

/* « 28 septembre 2026 à 14 h 05 », à l'heure de Paris. */
export function quandRegistre(iso: string | null | undefined, heure = true): string {
  if (!iso) return '';
  const d = new Date(iso);
  const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  if (!heure) return jour;
  const h = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(d).replace(':', ' h ');
  return `${jour} à ${h}`;
}

/* ── Ce que les documents écrivent au registre ──
   Un mandat signé : « Signé » sur sa ligne ; annulé : « Sans suite » (ou
   « Annulé » s'il avait été signé). Un avenant signé s'inscrit sur la ligne
   de son mandat, retrouvée par son numéro. Les autres documents : rien.
   Un mandat d'avant le registre n'a pas de ligne : rien non plus. */
const MANDATS = ['mandat_vente', 'mandat_recherche'];
export async function noterSignature(sb: SupabaseClient, o: {
  modele: string; document_id: string; titre: string; mandatNumero?: string; comment: string; quand: string;
}): Promise<string | null> {
  if (MANDATS.includes(o.modele)) {
    return observer(sb, { document_id_mandat: o.document_id, type: 'signe', texte: `Signé ${o.comment}, le ${o.quand}.`, document_id: o.document_id });
  }
  if (o.modele.startsWith('avenant') && o.mandatNumero) {
    return observer(sb, { numero: o.mandatNumero, type: 'avenant', texte: `${o.titre}, signé ${o.comment}, le ${o.quand}.`, document_id: o.document_id });
  }
  /* La délégation à un confrère : pas de numéro à elle, une observation
     sur la ligne de son mandat. */
  if (o.modele === 'delegation' && o.mandatNumero) {
    return observer(sb, { numero: o.mandatNumero, type: 'delegation', texte: `${o.titre}, signée ${o.comment}, le ${o.quand}.`, document_id: o.document_id });
  }
  return null;
}
export async function noterAnnulation(sb: SupabaseClient, o: {
  modele: string; document_id: string; titre: string; mandatNumero?: string; etaitSigne: boolean; quand: string;
}): Promise<string | null> {
  if (MANDATS.includes(o.modele)) {
    return observer(sb, o.etaitSigne
      ? { document_id_mandat: o.document_id, type: 'annule', texte: `Mandat signé puis annulé dans le CRM, le ${o.quand}.`, document_id: o.document_id }
      : { document_id_mandat: o.document_id, type: 'sans_suite', texte: `Jamais signé : document annulé le ${o.quand}. Le numéro reste attaché à ce mandat.`, document_id: o.document_id });
  }
  if ((o.modele.startsWith('avenant') || o.modele === 'delegation') && o.mandatNumero && o.etaitSigne) {
    return observer(sb, { numero: o.mandatNumero, type: 'note', texte: `${o.titre} : ${o.modele === 'delegation' ? 'annulée' : 'annulé'} le ${o.quand}.`, document_id: o.document_id });
  }
  return null;
}
