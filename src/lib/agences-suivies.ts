/* ═══ Les agences, retrouvées par leur numéro (V3.191) ══════════════════
   Alexandre : « je vais devoir appeler plusieurs agences pour un seul
   client, et m'occuper d'autres clients. Si une agence me rappelle un jour
   plus tard, comment retrouver l'annonce en un seul clic ? Je connaîtrai
   juste le numéro de l'agence ».

   Le numéro d'une agence est déjà dans le CRM, à trois endroits :
   - sur le bien (`biens.agence_tel`, relevé par la veille ou par « Ajouter
     un bien », reporté depuis « Noter un appel ») ;
   - sur une proposition de la veille pas encore triée
     (`veille_propositions.agence_tel`) ;
   - dans le suivi avec l'agence (`suivis_agence.contact.tel`), avec le nom
     de la personne au bout du fil.

   Ce fichier les rassemble, bien par bien, et les retrouve par un bout de
   numéro, le nom de l'agence ou celui de la personne. Il sert à la
   recherche du haut (Topbar) et à Ringover, qui demande au CRM qui appelle
   (lib/ringover-serveur.ts). Il lit avec le client Supabase qu'on lui
   donne : la session d'Alexandre dans le navigateur, la clé de service sur
   le serveur. Il n'écrit rien. */

import type { SupabaseClient } from '@supabase/supabase-js';

export type OngletSuivi = 'veille' | 'selection' | 'presentes';

export type BienSuivi = {
  /** le bien (`biens`), ou la proposition de la veille (`veille_propositions`) */
  id: string;
  client_id: string;
  recherche_id: string | null;
  onglet: OngletSuivi;
  titre: string;
  ville: string;
  prix: number | null;
  /** l'agence (ou le vendeur) : la dernière notée dans le suivi, sinon celle de l'annonce */
  agence: string;
  /** les personnes notées dans « Noter un appel » */
  interlocuteurs: string[];
  /** tous les noms connus (annonce, suivi, personnes) : ce qu'on cherche */
  noms: string[];
  /** les numéros, écrits comme en France : « 0146424242 » */
  tels: string[];
  /** ce que le client en a dit (Présentés) */
  retour: string | null;
  /** la dernière ligne du suivi avec l'agence */
  dernier: { le: string; appel: boolean; reponse: string | null } | null;
  /** pour ranger : la dernière chose faite sur ce bien */
  le: string;
};

export const ONGLETS: Record<OngletSuivi, string> = { veille: 'Veille', selection: 'Sélection', presentes: 'Présentés' };
const RETOURS: Record<string, string> = {
  propose: 'En attente de son retour', interesse: 'Ça lui plaît', souhaite_visiter: 'Veut visiter', visite: 'Visité',
  offre_faite: 'Offre faite', refuse: 'Pas pour lui', indispo: 'Plus disponible',
};
const REPONSES: Record<string, string> = { repondu: 'a répondu', message: 'message laissé', sans_reponse: 'pas de réponse' };

/** « Appel le 15 oct. : a répondu », « Note le 15 oct. ». */
export function texteDernier(d: BienSuivi['dernier']): string {
  if (!d) return '';
  const x = new Date(d.le);
  const jour = isNaN(x.getTime()) ? '' : ` le ${x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })}`;
  return d.appel ? `Appel${jour}${d.reponse ? ` : ${d.reponse}` : ''}` : `Note${jour}`;
}

/** Où le bien se trouve dans sa fiche, et ce qu'il en a dit : « Présentés · Ça lui plaît ». */
export function ouEnEst(b: BienSuivi): string {
  return [ONGLETS[b.onglet], b.onglet === 'presentes' && b.retour ? RETOURS[b.retour] || '' : ''].filter(Boolean).join(' · ');
}

/* ── Les numéros ── */

/** Un numéro écrit comme en France : « +33 1 46… », « 0033 1… », « 33146… » → « 0146… ». */
export function telNational(t: string): string {
  const brut = String(t || '').trim();
  const d = brut.replace(/\D/g, '');
  if (d.startsWith('0033')) return '0' + d.slice(4);
  if (/^\+33/.test(brut) || (d.startsWith('33') && d.length === 11)) return '0' + d.slice(2);
  return d;
}

/** Les numéros écrits dans un texte (« 01 46 42 42 42 / 06 12 34 56 78 »). */
export function numerosDans(t: unknown): string[] {
  const s = String(t ?? '').replace(/\(0\)/g, '');
  const out: string[] = [];
  for (const m of s.matchAll(/(?:\+|00)?\d(?:[ .\- ]?\d){7,13}/g)) {
    const n = telNational(m[0]);
    if (n.length >= 9 && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Les 9 derniers chiffres : la même ligne, quelle que soit son écriture. */
const fin9 = (t: string) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; };

/* ── Lire ── */

type Ligne = Record<string, unknown>;
const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

async function parPages(lire: (de: number, a: number) => PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>): Promise<{ data: Ligne[]; erreur: string | null }> {
  const data: Ligne[] = [];
  for (let de = 0; de < 30_000; de += 1000) {
    const { data: lot, error } = await lire(de, de + 999);
    if (error) return { data, erreur: error.message || 'lecture' };
    data.push(...((lot || []) as Ligne[]));
    if (!lot || lot.length < 1000) break;
  }
  return { data, erreur: null };
}

/** Les biens de toutes les recherches, avec leur agence, ses numéros et le
    dernier appel. Une lecture qui échoue (une table pas encore créée) n'empêche
    pas les autres. */
export async function lireBiensSuivis(sb: SupabaseClient): Promise<BienSuivi[]> {
  const [biens, veille, suivis] = await Promise.all([
    parPages((de, a) => sb.from('biens')
      .select('id, client_id, recherche_id, etape, titre, ville, prix_acquereur, prix_vendeur, agence_nom, agence_tel, badge_retour, created_at')
      .order('id').range(de, a)),
    (async () => {
      const r = await parPages((de, a) => sb.from('veille_propositions')
        .select('id, client_id, recherche_id, titre, ville, prix, agence, agence_tel, created_at')
        .eq('statut', 'nouveau').order('id').range(de, a));
      /* `agence_tel` vient d'outils/sql/veille-agence-tel.sql : sans lui, le nom seul. */
      if (r.erreur && /agence_tel/i.test(r.erreur)) {
        return parPages((de, a) => sb.from('veille_propositions')
          .select('id, client_id, recherche_id, titre, ville, prix, agence, created_at')
          .eq('statut', 'nouveau').order('id').range(de, a));
      }
      return r;
    })(),
    parPages((de, a) => sb.from('suivis_agence')
      .select('bien_id, contact, genre, reponse, created_at')
      .order('created_at', { ascending: false }).range(de, a)),
  ]);

  /* Le suivi de chaque bien, le plus récent d'abord. */
  const parBien = new Map<string, Ligne[]>();
  for (const s of suivis.data) {
    const k = String(s.bien_id || '');
    if (k) (parBien.get(k) || parBien.set(k, []).get(k)!).push(s);
  }

  const out: BienSuivi[] = [];
  for (const b of biens.data) {
    if (!b.client_id) continue;
    const lignes = parBien.get(String(b.id)) || [];
    const tels = numerosDans(b.agence_tel);
    const interlocuteurs: string[] = [];
    /* Comme le bloc « Mon suivi avec l'agence » : le dernier contact noté
       d'abord, puis l'agence de l'annonce. */
    let agence = '';
    const noms: string[] = [];
    const ajouter = (l: string[], t: string) => { if (t && !l.some(x => x.toLowerCase() === t.toLowerCase())) l.push(t); };
    for (const l of lignes) {
      const c = (l.contact && typeof l.contact === 'object' ? l.contact : {}) as Ligne;
      for (const n of numerosDans(c.tel)) if (!tels.includes(n)) tels.push(n);
      ajouter(interlocuteurs, texte(c.interlocuteur));
      const nom = texte(c.nom);
      if (nom && !agence) agence = nom;
      ajouter(noms, nom);
    }
    ajouter(noms, texte(b.agence_nom));
    if (!agence) agence = texte(b.agence_nom);
    for (const x of interlocuteurs) ajouter(noms, x);
    if (!tels.length && !noms.length) continue;
    const d = lignes[0];
    const dernier = d ? { le: String(d.created_at || ''), appel: d.genre === 'appel', reponse: REPONSES[String(d.reponse)] || null } : null;
    out.push({
      id: String(b.id), client_id: String(b.client_id), recherche_id: (b.recherche_id as string) || null,
      onglet: b.etape === 'presente' ? 'presentes' : 'selection',
      titre: texte(b.titre), ville: texte(b.ville),
      prix: Number(b.prix_acquereur) || Number(b.prix_vendeur) || null,
      agence, interlocuteurs, noms, tels, retour: (b.badge_retour as string) || null, dernier,
      le: dernier?.le || String(b.created_at || ''),
    });
  }
  for (const p of veille.data) {
    if (!p.client_id) continue;
    const tels = numerosDans(p.agence_tel);
    const agence = texte(p.agence);
    if (!tels.length && !agence) continue;
    out.push({
      id: String(p.id), client_id: String(p.client_id), recherche_id: (p.recherche_id as string) || null,
      onglet: 'veille', titre: texte(p.titre), ville: texte(p.ville), prix: Number(p.prix) || null,
      agence, interlocuteurs: [], noms: agence ? [agence] : [], tels, retour: null, dernier: null, le: String(p.created_at || ''),
    });
  }
  return out;
}

/* ── Chercher ── */

/** Minuscules, sans accents ni ponctuation. */
export const plat = (t: string) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Ce qui a été tapé ressemble à un numéro (« 01 46 42 », « +33 1 46… »). */
export const estUnNumero = (saisie: string) => /^[\d\s.+()\-]+$/.test(String(saisie || '').trim()) && String(saisie).replace(/\D/g, '').length >= 4;

/* Le plus récent d'abord : l'agence qui rappelle est le plus souvent celle
   qu'on vient d'appeler. Ceux qui ont un suivi passent devant. */
const ranger = (l: BienSuivi[]) => [...l].sort((a, b) => Number(!!b.dernier) - Number(!!a.dernier) || b.le.localeCompare(a.le));

/** Un bout de numéro, tapé dans la recherche du haut. */
export function parBoutDeNumero(liste: BienSuivi[], saisie: string): BienSuivi[] {
  const q = telNational(saisie);
  if (q.length < 4) return [];
  return ranger(liste.filter(b => b.tels.some(t => t.includes(q))));
}

/** Le numéro qui appelle (Ringover) : les 9 derniers chiffres, à l'identique. */
export function parNumero(liste: BienSuivi[], numero: string): BienSuivi[] {
  const k = fin9(numero);
  if (!k) return [];
  return ranger(liste.filter(b => b.tels.some(t => fin9(t) === k)));
}

/** Le nom de l'agence ou de la personne (« laforet », « orpi vanves », « durand »).
    Au moins un mot doit être dans le nom : une ville ou une rue seule ne sort
    pas les annonces (choix d'Alexandre, 26 septembre : elles noieraient les
    contacts). */
export function parNom(liste: BienSuivi[], mots: string[]): BienSuivi[] {
  const ms = mots.map(plat).filter(m => m.length >= 2);
  if (!ms.length) return [];
  return ranger(liste.filter(b => {
    const nom = plat(b.noms.join(' '));
    if (!nom || !ms.some(m => nom.includes(m))) return false;
    const tout = `${nom} ${plat(b.ville)}`;
    return ms.every(m => tout.includes(m));
  }));
}

/** L'adresse qui ouvre la fiche du client, au bon onglet, ce bien ouvert. */
export function lienFiche(base: string, b: BienSuivi): string {
  const p = new URLSearchParams({ page: 'fiche', client: b.client_id, onglet: b.onglet, bien: b.id });
  if (b.recherche_id) p.set('recherche', b.recherche_id);
  return `${base}/?${p.toString()}`;
}
