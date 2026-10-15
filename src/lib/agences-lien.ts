/* ═══ Le lien pour les agences (V3.197) ═══════════════════════════════════
   Alexandre : « quand j'appelle une agence et qu'elle me dit d'aller voir sur
   son site, comment fluidifier pour que je le reçoive en veille, et que je
   puisse écarter ou pas ? ». Maquettes validées le 15 octobre (canevas « Le
   lien pour les agences »).

   Chaque recherche a son lien, le même pour toutes les agences qui
   travaillent pour ce client : espace.emilio-immo.com/proposer/<jeton>
   (recherches.token_agences, outils/sql/lien-agences.sql). L'agence y voit un
   résumé SANS NOM de la recherche, colle le lien de son annonce (lu par le
   serveur) ou ses photos, et le bien arrive dans l'onglet Veille, analysé
   (table propositions_agences). « Couper ce lien » l'efface : la page dit
   poliment que la recherche n'est plus ouverte.

   Rien ici ne lit la base : des outils purs, pour la page, les routes et le CRM. */

export const HOTE_LIEN = 'https://espace.emilio-immo.com';
export const lienAgences = (jeton: string) => `${HOTE_LIEN}/proposer/${jeton}`;

/** Un jeton de 12 caractères, sans caractère ambigu. */
export function jetonAgences(): string {
  const A = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const o = new Uint8Array(12);
  crypto.getRandomValues(o);
  return Array.from(o, x => A[x % A.length]).join('');
}
export const jetonValide = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9]{10,40}$/.test(t);

/** Le message à envoyer à l'agence (SMS ou mail), validé par Alexandre. */
export function messageAgence(jeton: string): string {
  return `Bonjour, c’est Alexandre Rogelet, d’Emilio Immobilier. Comme convenu, voici le lien pour me proposer vos biens pour mon client :\n${lienAgences(jeton)}\nIl suffit d’y coller le lien de votre annonce : elle arrive directement chez moi, je l’étudie et je reviens vers vous. Merci !`;
}

/* ── Ce que l'agence voit de la recherche : rien qui nomme le client ──
   Le type, les pièces ou chambres, la surface, les secteurs, le budget
   maximum (choix d'Alexandre, 15 octobre), et ce qui compte : les
   indispensables, le rez-de-chaussée exclu, le dernier étage. Jamais ses
   précisions libres, ni ses biens déjà vus. */
export type ResumeAgence = { puces: string[]; budget: string | null; important: string[] };

const EQUIP: Record<string, string> = {
  parking: 'Un parking', cave: 'Une cave', balcon: 'Un balcon', terrasse: 'Une terrasse', jardin: 'Un jardin',
  ascenseur: 'Un ascenseur', gardien: 'Un gardien', exterieur: 'Un extérieur (balcon, terrasse ou jardin)', cuisine: 'Une cuisine équipée',
};
const euros = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} €`;
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

export function resumePourAgence(r: Record<string, unknown>): ResumeAgence {
  const puces: string[] = [];
  const types = String(r.type_bien || '').split(',').map(x => x.trim()).filter(Boolean);
  if (types.length) puces.push(types.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ou '));
  const pMin = Number(r.nb_pieces_min) || 0, pMax = Number(r.nb_pieces_max) || 0;
  if (pMin && pMax && pMax > pMin) puces.push(`${pMin} à ${pMax} pièces`);
  else if (pMin) puces.push(`${pluriel(pMin, 'pièce')} et plus`);
  const ch = Number(r.chambres_min) || 0;
  if (ch) puces.push(`${pluriel(ch, 'chambre')} au moins`);
  const sMin = Number(r.surface_min) || 0;
  if (sMin) puces.push(`${sMin} m² et plus`);
  /* « Quartier (Ville) » : la ville seule, les quartiers sans détail. */
  const secteurs = (Array.isArray(r.secteurs) ? r.secteurs : []).map(x => String(x).trim()).filter(Boolean);
  const villes: string[] = [];
  for (const s of secteurs) {
    const v = /\(([^)]+)\)\s*$/.exec(s)?.[1]?.trim() || s;
    if (!villes.includes(v)) villes.push(v);
  }
  if (villes.length) puces.push(villes.slice(0, 5).join(', '));
  const bMax = Number(r.budget_max) || 0;
  const budget = bMax ? `Jusqu’à ${euros(bMax)}` : null;

  const important: string[] = [];
  const ex = r.exigences && typeof r.exigences === 'object' ? (r.exigences as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(ex)) if (v === 'indispensable' && EQUIP[k]) important.push(EQUIP[k]);
  if (r.rdc_exclu) important.push('Pas de rez-de-chaussée');
  if (r.dernier_etage) important.push('Au dernier étage');
  const sext = Number(r.exterieur_surface_min) || 0;
  if (sext && !important.some(x => /extérieur|balcon|terrasse|jardin/i.test(x))) important.push(`Un extérieur de ${sext} m² au moins`);
  return { puces, budget, important: important.slice(0, 5) };
}

/** Un dossier fermé : la page ne prend plus rien. */
export function rechercheFermee(client: { statut?: string | null; archive?: boolean | null } | null): boolean {
  if (!client) return true;
  if (client.archive) return true;
  return ['perdu', 'bien_trouve', 'suspendu'].includes(String(client.statut || '').toLowerCase());
}

/* ── Une proposition, telle que le CRM la lit ── */
export type PropositionAgence = {
  id: string; client_id: string; recherche_id: string;
  url: string | null; portail: string | null; photos: string[] | null;
  adresse: string | null; prix: number | null; surface: number | null; mot: string | null;
  agence: string | null; interlocuteur: string | null; tel: string | null; email: string | null;
  lecture: string | null; fiche: Record<string, any> | null;
  statut: string; bien_id: string | null; decide_le: string | null; created_at: string;
};

export function tableAgencesAbsente(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703'
    || (/propositions_agences|token_agences/.test(e.message || '') && /exist|schema cache|column/i.test(e.message || ''));
}

/** « Agence du Parc · Julien Martin » */
export const quiPropose = (p: Pick<PropositionAgence, 'agence' | 'interlocuteur'>) =>
  [p.agence, p.interlocuteur].map(x => String(x || '').trim()).filter(Boolean).join(' · ') || 'Une agence';
