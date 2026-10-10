import { addJournal, supabase } from '@/lib/supabase';
import { signalerEchec, verifie } from '@/lib/ecritures';
import { solderRelancesVisite } from '@/lib/demandes-visite';

/* ═══ « Ce bien n'est plus disponible » (V3.164) ═══════════════════════════
   Alexandre : « depuis Planifier une visite, un bouton Ce bien n'est plus
   disponible, après échange : ça se range dans Plus disponible, et lui, dans
   son espace, il voit la catégorie, avec le commentaire que je mets, comme
   si j'avais commenté sur le bien. Et si finalement il revient à la vente,
   je le remets disponible ».

   Pour un bien trouvé ailleurs (une autre agence, un particulier) : un bien
   de l'agence suit sa propre fiche (vendu, retiré…), l'espace le sait déjà.
   La colonne `biens.indispo` (outils/sql/biens-indispo.sql) :
     { le, motif, note } — `note`, le mot lu par l'acheteur dans son espace.
   Le bien reste « présenté » (son historique), dans le groupe « Plus
   disponible » ; sa demande de visite, s'il en avait une, se solde. */

export type MotifIndispo = 'vendu' | 'compromis' | 'retire' | 'autre';
export type Indispo = { le: string; motif: MotifIndispo; note: string | null };

export const MOTIFS_INDISPO: { k: MotifIndispo; l: string; client: string }[] = [
  { k: 'vendu', l: 'Vendu', client: 'Ce bien a été vendu.' },
  { k: 'compromis', l: 'Sous compromis', client: 'Ce bien est sous compromis de vente.' },
  { k: 'retire', l: 'Retiré de la vente', client: 'Ce bien n’est plus proposé à la vente.' },
  { k: 'autre', l: 'Autre raison', client: 'Ce bien n’est plus disponible.' },
];
export const motifIndispo = (k: string | null | undefined) => MOTIFS_INDISPO.find(m => m.k === k) || MOTIFS_INDISPO[3];

export function lireIndispo(x: unknown): Indispo | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const motif = MOTIFS_INDISPO.some(m => m.k === o.motif) ? o.motif as MotifIndispo : 'autre';
  return { le: typeof o.le === 'string' ? o.le : '', motif, note: typeof o.note === 'string' && o.note.trim() ? o.note.trim() : null };
}

const SQL_ABSENT = 'il faut d’abord passer le fichier outils/sql/biens-indispo.sql dans Supabase (SQL Editor), une seule fois';
const colonneAbsente = (m: string) => /indispo/i.test(m) && /(column|colonne|schema cache)/i.test(m);

type BienIndispo = { id: string; titre?: string | null; ville?: string | null; badge_retour?: string | null };

/* Rend true si c'est enregistré. */
export async function marquerIndispo(o: { bien: BienIndispo; clientId: string; rechercheId?: string | null; motif: MotifIndispo; note: string }): Promise<boolean> {
  const note = o.note.trim().slice(0, 600) || null;
  const valeur: Indispo = { le: new Date().toISOString(), motif: o.motif, note };
  const r = await supabase.from('biens').update({ indispo: valeur }).eq('id', o.bien.id).select('id');
  if (r.error && colonneAbsente(r.error.message)) { signalerEchec('« Plus disponible »', SQL_ABSENT); return false; }
  if (!(await verifie('« Plus disponible »', Promise.resolve(r), { ligne: true }))) return false;
  const nom = o.bien.titre || o.bien.ville || 'Un bien';
  const m = motifIndispo(o.motif);
  await addJournal(o.clientId, 'bien_modifie', `🔒 Plus disponible : ${nom}`,
    [m.l, note ? `Son mot : « ${note} »` : ''].filter(Boolean).join(' · '),
    { indispo: true }, { rechercheId: o.rechercheId || null, bienId: o.bien.id });
  /* Il voulait le visiter : sa demande n'a plus d'objet (la relance « Veut
     visiter » se solde ; la page Visites ne la montre plus, demandes-visite.ts). */
  if (o.bien.badge_retour === 'souhaite_visiter') {
    const e = await solderRelancesVisite(o.clientId, [o.bien.titre]);
    if (e) signalerEchec('La relance « Veut visiter »', e);
  }
  return true;
}

export async function remettreDispo(o: { bien: BienIndispo; clientId: string; rechercheId?: string | null }): Promise<boolean> {
  const r = await supabase.from('biens').update({ indispo: null }).eq('id', o.bien.id).select('id');
  if (r.error && colonneAbsente(r.error.message)) { signalerEchec('« Remettre disponible »', SQL_ABSENT); return false; }
  if (!(await verifie('« Remettre disponible »', Promise.resolve(r), { ligne: true }))) return false;
  await addJournal(o.clientId, 'bien_modifie', `🔓 De nouveau disponible : ${o.bien.titre || o.bien.ville || 'un bien'}`,
    'Il revient dans ses biens présentés, et dans son espace.', { indispo: false }, { rechercheId: o.rechercheId || null, bienId: o.bien.id });
  return true;
}
