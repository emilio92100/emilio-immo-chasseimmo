/* ═══ « Envoyer ce bien » : qui reçoit quoi, et le lien suivi (V3.152) ═══════
   Alexandre : seul un client ACTIF reçoit le bien dans son espace. Tous les
   autres — un prospect, un acheteur en pause, perdu ou qui a trouvé, un
   contact sans recherche, une adresse hors du CRM — reçoivent un simple mail
   avec un bouton « Voir le bien » vers la page publique du bien
   (/bien/<id>), sans un mot sur l'espace.

   Ce lien-là est personnel : /bien/<id>?d=<code>. Le code, tiré au hasard
   pour chaque mail, est rangé dans la ligne « envoi » de l'historique du bien
   (`biens_vente_suivi.donnees.codes`, avec à qui il est parti). Quand la page
   s'ouvre avec ce code, elle le dit au serveur (/bien/<id>/vue) : une fois par
   jour et par code, la date s'ajoute à `donnees.vues`, et une ligne
   « 👀 A ouvert la fiche du bien » va dans le Suivi du contact s'il est au CRM.
   Rien de neuf dans la base : deux clés d'un jsonb qui existe déjà.

   Ce fichier ne touche pas à la base : il sert au navigateur comme au serveur. */

import { lienBienPublic, partieAleatoire } from '@/lib/jeton';

/** Le statut d'un client qui reçoit le bien dans son espace. « offre_ecrite »
    est l'ancien statut, compté comme actif (src/lib/supabase.ts). */
export const recoitSonEspace = (statut: unknown) => statut === 'actif' || statut === 'offre_ecrite';

/** Le paramètre du lien suivi : /bien/<id>?d=<code>. */
export const PARAM_SUIVI = 'd';
/** Dix caractères de l'alphabet des liens d'espace (ni l, ni i, ni o, ni 0, ni 1). */
export const codeSuivi = () => partieAleatoire(10);
export const CODE_SUIVI = /^[a-z2-9]{6,24}$/;

/** Le bouton « Voir le bien » d'un simple mail : la page publique, avec le
    code de ce mail s'il y en a un (l'aperçu n'en a pas). */
export function lienBienSuivi(id: string, code?: string | null): string {
  const lien = lienBienPublic(id);
  return code && CODE_SUIVI.test(code) ? `${lien}?${PARAM_SUIVI}=${code}` : lien;
}

/** À qui un code est parti (une entrée de `donnees.codes`). */
export type DestSuivi = { email: string; nom?: string; client_id?: string | null; recherche_id?: string | null };

const objet = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const dates = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !isNaN(Date.parse(x))) : []);

/** « 2026-10-09 » : le jour à Paris, pour ne noter qu'une ouverture par jour. */
export function jourParis(d: Date | string): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
}

/** La personne à qui ce code est parti, ou null s'il n'est pas de ce mail. */
export function destDuCode(donnees: unknown, code: string): DestSuivi | null {
  const x = objet(objet(objet(donnees).codes)[code]);
  return typeof x.email === 'string' && x.email ? (x as DestSuivi) : null;
}

/** Une ouverture de plus pour ce code. Rend les nouvelles `donnees`, ou null
    quand elle est déjà notée ce jour-là (ou que le code n'est pas d'ici). On
    garde les trente dernières. */
export const VUES_MAX = 30;
export function avecVue(donnees: unknown, code: string, quand: Date): { donnees: Record<string, unknown>; avant: string[] } | null {
  const d = objet(donnees);
  if (!destDuCode(d, code)) return null;
  const vues = objet(d.vues);
  const avant = dates(vues[code]);
  const jour = jourParis(quand);
  if (avant.some(x => jourParis(x) === jour)) return null;
  return { donnees: { ...d, vues: { ...vues, [code]: [...avant, quand.toISOString()].slice(-VUES_MAX) } }, avant };
}

/** Les ouvertures d'une ligne « envoi », personne par personne (l'historique du bien). */
export function vuesDe(donnees: unknown): { code: string; dest: DestSuivi; le: string[] }[] {
  const d = objet(donnees);
  const vues = objet(d.vues);
  return Object.keys(vues).map(code => ({ code, dest: destDuCode(d, code), le: dates(vues[code]) }))
    .filter((x): x is { code: string; dest: DestSuivi; le: string[] } => !!x.dest && x.le.length > 0);
}
