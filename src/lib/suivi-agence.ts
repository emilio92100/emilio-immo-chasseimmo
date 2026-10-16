import { supabase } from '@/lib/supabase';
import { verifie } from '@/lib/ecritures';

/* ═══ Le suivi avec l'agence, sous chaque bien présenté (V3.182) ═══════════
   Alexandre : « un truc interne pour moi : qui je dois contacter, le compte
   rendu de ce qui a été dit avec l'agence qui a le mandat ou le propriétaire,
   les créneaux ». Une ligne de `suivis_agence` par note rapide ou par appel
   (outils/sql/suivis-agence.sql). Interne : l'espace du client ne la lit
   jamais. Le bloc est dans src/components/fiche/SuiviAgence.tsx. */

export type Creneau = { date: string; heure: string };
export type ContactSuivi = { nom?: string; interlocuteur?: string; tel?: string; email?: string };
export type LigneSuivi = {
  id: string; bien_id: string; recherche_id: string | null; client_id: string | null;
  genre: 'note' | 'appel';
  avec: 'agence' | 'proprietaire' | 'autre' | null;
  contact: ContactSuivi;
  reponse: 'repondu' | 'message' | 'sans_reponse' | null;
  dispo: 'disponible' | 'sous_offre' | 'vendu' | null;
  texte: string | null;
  creneaux: Creneau[];
  ensuite: 'attente' | 'rappeler' | null;
  rappel_le: string | null;
  relance_id: string | null;
  /** V3.193 — la case « Lui montrer l'étape » ; `null` : la colonne n'existe
      pas encore (outils/sql/suivis-agence-client.sql pas passé). */
  montrer: boolean | null;
  /** V3.193 — « Un mot pour … », lu par le client sur le bien. */
  mot_client: string | null;
  created_at: string;
};
export type VisiteCalee = { date_visite: string; heure: string | null };
export type Suivis = {
  /** La table n'existe pas encore : le SQL n'a pas été passé. */
  absent: boolean;
  parBien: Record<string, LigneSuivi[]>;
  /** La prochaine visite à venir de chaque bien. */
  visites: Record<string, VisiteCalee>;
};

export const SUIVIS_VIDES: Suivis = { absent: false, parBien: {}, visites: {} };

const tableAbsente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || (/suivis_agence/.test(e.message || '') && /exist|schema cache/i.test(e.message || '')));

const texteOuNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
function lire(x: any): LigneSuivi {
  const c = x?.contact && typeof x.contact === 'object' ? x.contact : {};
  return {
    id: String(x.id), bien_id: String(x.bien_id), recherche_id: x.recherche_id || null, client_id: x.client_id || null,
    genre: x.genre === 'appel' ? 'appel' : 'note',
    avec: ['agence', 'proprietaire', 'autre'].includes(x.avec) ? x.avec : null,
    contact: { nom: texteOuNull(c.nom) || undefined, interlocuteur: texteOuNull(c.interlocuteur) || undefined, tel: texteOuNull(c.tel) || undefined, email: texteOuNull(c.email) || undefined },
    reponse: ['repondu', 'message', 'sans_reponse'].includes(x.reponse) ? x.reponse : null,
    dispo: ['disponible', 'sous_offre', 'vendu'].includes(x.dispo) ? x.dispo : null,
    texte: texteOuNull(x.texte),
    creneaux: (Array.isArray(x.creneaux) ? x.creneaux : [])
      .filter((k: any) => k && /^\d{4}-\d{2}-\d{2}$/.test(String(k.date)) && /^\d{1,2}:\d{2}$/.test(String(k.heure)))
      .map((k: any) => ({ date: String(k.date), heure: String(k.heure) })),
    ensuite: x.ensuite === 'attente' || x.ensuite === 'rappeler' ? x.ensuite : null,
    rappel_le: x.rappel_le || null,
    relance_id: x.relance_id || null,
    montrer: x && 'montrer' in x ? x.montrer !== false : null,
    mot_client: texteOuNull(x.mot_client),
    created_at: String(x.created_at || ''),
  };
}

/** Les notes et les appels de ces biens, du plus récent au plus ancien, et leurs visites à venir. */
export async function chargerSuivis(bienIds: string[]): Promise<Suivis> {
  if (!bienIds.length) return SUIVIS_VIDES;
  const [s, v] = await Promise.all([
    supabase.from('suivis_agence').select('*').in('bien_id', bienIds).order('created_at', { ascending: false }),
    supabase.from('visites').select('bien_id, date_visite, heure').in('bien_id', bienIds).eq('statut', 'a_venir').order('date_visite', { ascending: true }),
  ]);
  const visites: Record<string, VisiteCalee> = {};
  (v.data || []).forEach((x: any) => { if (x.bien_id && !visites[x.bien_id]) visites[x.bien_id] = { date_visite: x.date_visite, heure: x.heure || null }; });
  if (s.error) return { absent: tableAbsente(s.error), parBien: {}, visites };
  const parBien: Record<string, LigneSuivi[]> = {};
  (s.data || []).forEach((x: any) => { const l = lire(x); (parBien[l.bien_id] ||= []).push(l); });
  return { absent: false, parBien, visites };
}

/* V3.193 : les deux colonnes de ce que le client voit. Avant le SQL, une
   écriture qui les porte échoue : on la refait sans elles, et on le dit. */
export const SQL_CLIENT = 'outils/sql/suivis-agence-client.sql';
export const colonnesClientAbsentes = (e: { message?: string } | null | undefined) =>
  !!e && /montrer|mot_client/i.test(e.message || '') && /(column|colonne|schema cache)/i.test(e.message || '');

/* ── Les mots ── */
export const AVEC: { k: 'agence' | 'proprietaire' | 'autre'; l: string; ic: string }[] = [
  { k: 'agence', l: 'L’agence', ic: 'immeuble' },
  { k: 'proprietaire', l: 'Le propriétaire', ic: 'cle' },
  { k: 'autre', l: 'Autre', ic: 'clients' },
];
export const REPONSES: { k: 'repondu' | 'message' | 'sans_reponse'; l: string; ic: string }[] = [
  { k: 'repondu', l: 'A répondu', ic: 'tel' },
  { k: 'message', l: 'Message laissé', ic: 'note' },
  { k: 'sans_reponse', l: 'Pas de réponse', ic: 'fermer' },
];
export const DISPOS: { k: 'disponible' | 'sous_offre' | 'vendu'; l: string; ic: string }[] = [
  { k: 'disponible', l: 'Toujours disponible', ic: 'coche' },
  { k: 'sous_offre', l: 'Sous offre', ic: 'euro' },
  { k: 'vendu', l: 'Vendu', ic: 'cadenas' },
];

const pad = (n: number) => String(n).padStart(2, '0');
export const cleDuJour = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const JOURS_C = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const heureCourte = (h: string) => { const [hh, mm] = h.split(':').map(Number); return `${hh} h${mm ? ` ${pad(mm)}` : ''}`; };
/** « Jeu. 16 oct. · 18 h » */
export function texteCreneau(c: Creneau) {
  const [y, m, j] = c.date.split('-').map(Number);
  const d = new Date(y, m - 1, j);
  return `${JOURS_C[d.getDay()]} ${j} ${MOIS_C[m - 1]} · ${heureCourte(c.heure)}`;
}
/** « Aujourd'hui, 14 h 20 », « Hier, 17 h 05 », « Lun. 12 oct., 9 h » */
export function quandNote(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const h = `${d.getHours()} h${d.getMinutes() ? ` ${pad(d.getMinutes())}` : ''}`;
  const jours = Math.round((new Date(cleDuJour()).getTime() - new Date(cleDuJour(d)).getTime()) / 86400000);
  if (jours === 0) return `Aujourd’hui, ${h}`;
  if (jours === 1) return `Hier, ${h}`;
  return `${JOURS_C[d.getDay()]} ${d.getDate()} ${MOIS_C[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}, ${h}`;
}

/** Le contact du bien : le dernier noté, complété par la fiche du bien. */
export function contactDu(b: any, lignes: LigneSuivi[]): ContactSuivi & { avec: 'agence' | 'proprietaire' | 'autre' } {
  const dernier = lignes.find(l => l.contact.nom || l.contact.tel || l.contact.interlocuteur || l.contact.email);
  const avec = dernier?.avec || (b?.est_particulier ? 'proprietaire' : 'agence');
  const c = dernier?.contact || {};
  return {
    avec,
    nom: c.nom || (avec === 'agence' ? texteOuNull(b?.agence_nom) || undefined : avec === 'proprietaire' ? texteOuNull(b?.agence_nom) || undefined : undefined),
    /* V3.203 : la personne et le mail notés sur la fiche du bien (« Détail du bien », partie Agence). */
    interlocuteur: c.interlocuteur || (avec === 'agence' ? texteOuNull(b?.agence_interlocuteur) || undefined : undefined),
    tel: c.tel || texteOuNull(b?.agence_tel) || undefined,
    email: c.email || texteOuNull(b?.agence_email) || undefined,
  };
}

/** « 9:30 », « 09:30:00 » → « 09:30 » : l'heure d'un créneau et celle d'une visite se comparent. */
export function heureNette(h: unknown): string {
  const [a, b] = String(h || '').split(':');
  return a ? `${a.padStart(2, '0')}:${String(b || '00').slice(0, 2).padStart(2, '0')}` : '';
}
/** Ce créneau est celui de la visite calée. */
export function creneauDeLaVisite(c: Creneau, v: VisiteCalee | undefined): boolean {
  return !!v && String(v.date_visite || '').slice(0, 10) === c.date && heureNette(v.heure) === heureNette(c.heure);
}

/* ── L'adresse exacte (V3.192) ──
   Alexandre : « où est-ce que je valide l'adresse exacte, si l'adresse sortie
   de la veille n'est pas bonne ? Et qu'elle se mette à jour aussi dans la
   proposition de la veille ». Le bien prend l'adresse ; la proposition de la
   veille dont il vient aussi (la veille s'en sert pour le reconnaître quand
   il revient sous un autre lien). Rend false si le bien n'a pas pu la prendre. */
export async function corrigerAdresse(bienId: string, adresse: string): Promise<boolean> {
  const a = adresse.trim();
  if (!a) return true;
  const ok = await verifie('L’adresse du bien', supabase.from('biens').update({ adresse: a }).eq('id', bienId).select('id'), { ligne: true });
  if (ok) await reporterAdresseVeille(bienId, a);
  return ok;
}
/** La même adresse sur la proposition de la veille d'où vient le bien (s'il en vient). */
export async function reporterAdresseVeille(bienId: string, adresse: string | null) {
  await verifie('L’adresse dans la proposition de la veille', supabase.from('veille_propositions').update({ adresse: adresse || null }).eq('bien_id', bienId).select('id'));
}

/** Le contact en une ligne, pour la visite (« Contact agence / vendeur »). */
export const contactEnLigne = (c: ContactSuivi) => [c.nom, c.interlocuteur, c.tel, c.email].filter(Boolean).join(' · ');

/** Les créneaux encore à venir du dernier appel qui en a donné. */
export function creneauxOuverts(lignes: LigneSuivi[]): { ligne: string; creneaux: Creneau[] } | null {
  const l = lignes.find(x => x.creneaux.length > 0);
  if (!l) return null;
  const auj = cleDuJour();
  const c = l.creneaux.filter(k => k.date >= auj);
  return c.length ? { ligne: l.id, creneaux: c } : null;
}

export type EtatSuivi = { k: string; l: string; c: string; bg: string };
/** Où l'on en est : l'étiquette du bloc. */
export function etatSuivi(lignes: LigneSuivi[], visite: VisiteCalee | undefined, veutVisiter: boolean): EtatSuivi {
  if (visite) {
    /* V3.187 : la base rend la date avec l'heure (« 2026-10-15T00:00:00+00:00 ») :
       sans le slice, le jour valait NaN (« Visite calée le jeu. NaN oct. »). */
    const [y, m, j] = String(visite.date_visite).slice(0, 10).split('-').map(Number);
    const d = new Date(y, (m || 1) - 1, j || 1);
    const h = visite.heure ? ` à ${heureCourte(String(visite.heure).slice(0, 5))}` : '';
    return { k: 'calee', l: `Visite calée le ${JOURS_C[d.getDay()].toLowerCase()} ${j} ${MOIS_C[(m || 1) - 1]}${h}`, c: '#0E6B43', bg: '#E7F6EE' };
  }
  const appel = lignes.find(l => l.genre === 'appel');
  if (!lignes.length) return veutVisiter
    ? { k: 'appeler', l: 'À appeler', c: '#8F3F00', bg: '#FFF1E6' }
    : { k: 'vide', l: 'Pas encore commencé', c: '#64748B', bg: '#F1F5F9' };
  if (!appel) return { k: 'encours', l: 'En cours', c: '#1F4E8C', bg: '#EAF1FB' };
  if (appel.dispo === 'vendu') return { k: 'vendu', l: 'Plus disponible', c: '#475569', bg: '#EEF0F3' };
  if (creneauxOuverts(lignes)) return { k: 'creneaux', l: 'Créneaux reçus', c: '#4C1D95', bg: '#F1EBFF' };
  if (appel.ensuite === 'rappeler' || appel.reponse === 'message' || appel.reponse === 'sans_reponse') {
    const quand = appel.rappel_le ? ` le ${texteCreneau({ date: appel.rappel_le, heure: '00:00' }).split(' · ')[0].toLowerCase()}` : '';
    return { k: 'rappeler', l: `À rappeler${quand}`, c: '#8F3F00', bg: '#FFF1E6' };
  }
  return { k: 'attente', l: 'En attente de l’agence', c: '#1F4E8C', bg: '#EAF1FB' };
}
