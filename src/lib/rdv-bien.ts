import { supabase } from '@/lib/supabase';
import { signalerEchec, verifie } from '@/lib/ecritures';

/* ═══ Les rendez-vous de l'agenda liés à un bien en vente (V3.50) ═════════
   Deux sortes de rendez-vous de l'agenda (table `rendez_vous`) parlent d'un
   bien de l'agence, par `details.bien_vente_id` :
   - une visite hors CRM (quelqu'un qui a appelé sur une annonce) : le bien
     la garde aussi dans son suivi (`biens_vente_suivi`, type « visite »,
     `donnees.rdv_id` = le rendez-vous, sa date et son heure dans `le`) ;
   - le rendez-vous d'estimation : le bien garde sa date dans ses réponses
     (`donnees.rdvEstimation` « AAAA-MM-JJ », `rdvEstimationHeure` « HH:MM »,
     `rdvEstimationRdv` = le rendez-vous).

   Avant, annuler ou déplacer l'un d'eux depuis l'agenda ne touchait que
   l'agenda : la fiche du bien montrait encore la visite « à venir » (et la
   comptait au moment de la vente), ou l'ancienne date d'estimation.
   Ici, le côté du bien suit. Jamais bloquant : le rendez-vous est déjà
   enregistré, un échec se voit (message rouge) et se rattrape sur la fiche
   du bien. */

export type RdvBien = { id: string; type: string; details?: Record<string, unknown> | null };

/* Le bien de l'agence derrière un rendez-vous, ou null. */
export function bienDuRdv(r: { details?: Record<string, unknown> | null }): string | null {
  const b = r.details?.bien_vente_id;
  return typeof b === 'string' && b ? b : null;
}

/* Un rendez-vous dont seuls la date, l'heure, la durée et les notes se
   changent depuis l'agenda : son `details` (le visiteur, son téléphone, le
   bien) ne doit jamais être réécrit. Une visite rangée dans `rendez_vous`
   est toujours une visite hors CRM (les visites d'acheteurs suivis vivent
   dans `visites`). */
export function rdvLieAuBien(r: { type: string; details?: Record<string, unknown> | null }): boolean {
  return !!bienDuRdv(r) || r.type === 'visite';
}

type LigneSuivi = { id: string; statut: string | null; le: string | null; donnees: Record<string, unknown> | null };

/* La ligne du suivi du bien qui porte ce rendez-vous (visite hors CRM). */
async function ligneVisite(r: RdvBien): Promise<LigneSuivi | null> {
  let q = supabase.from('biens_vente_suivi').select('id, statut, le, donnees')
    .eq('type', 'visite').eq('donnees->>rdv_id', r.id);
  const b = bienDuRdv(r);
  if (b) q = q.eq('bien_id', b);
  const { data, error } = await q.limit(1);
  if (error) { signalerEchec('La visite sur la fiche du bien', error.message); return null; }
  return ((data || []) as LigneSuivi[])[0] || null;
}

/* Les réponses du bien, relues en base juste avant d'écrire : seules les
   clés touchées ici changent, les autres restent comme elles y sont (une
   tablette ou une signature en ligne a pu écrire entre-temps). `change`
   modifie la copie et rend false s'il n'y a rien à écrire. */
async function majDonneesBien(bienId: string, quoi: string, change: (d: Record<string, unknown>) => boolean): Promise<boolean> {
  const { data, error } = await supabase.from('biens_vente').select('donnees').eq('id', bienId).maybeSingle();
  if (error) { signalerEchec(quoi, error.message); return false; }
  if (!data) return true; /* le bien n'existe plus : rien à suivre */
  const d = { ...(((data as { donnees?: Record<string, unknown> | null }).donnees) || {}) };
  if (!change(d)) return true;
  return verifie(quoi, supabase.from('biens_vente').update({ donnees: d }).eq('id', bienId).select('id'), { ligne: true });
}

/* L'estimation de ce bien est-elle bien CE rendez-vous ? Celui qu'il
   désigne, ou, faute de lien (posé avant la V3.50), celui du même jour. Un
   autre rendez-vous calé depuis n'est jamais touché. */
function estCeRdv(d: Record<string, unknown>, rdvId: string, jour: string): boolean {
  const lien = d.rdvEstimationRdv;
  if (typeof lien === 'string' && lien) return lien === rdvId;
  return !!jour && d.rdvEstimation === jour;
}

/* Annulé depuis l'agenda : la visite hors CRM passe « annulée » sur la fiche
   du bien (seulement si elle était encore à venir), l'estimation quitte ses
   réponses. `jour` : le jour du rendez-vous (« AAAA-MM-JJ »). */
export async function annulerCoteBien(r: RdvBien, jour: string): Promise<void> {
  try {
    const bien = bienDuRdv(r);
    if (r.type === 'visite') {
      const l = await ligneVisite(r);
      if (!l || l.statut !== 'a_venir') return;
      await verifie('L’annulation de la visite sur la fiche du bien',
        supabase.from('biens_vente_suivi').update({ statut: 'annulee' }).eq('id', l.id).select('id'), { ligne: true });
      return;
    }
    if (r.type === 'estimation' && bien) {
      await majDonneesBien(bien, 'Le rendez-vous d’estimation sur la fiche du bien', d => {
        if (!estCeRdv(d, r.id, jour)) return false;
        delete d.rdvEstimation; delete d.rdvEstimationHeure; delete d.rdvEstimationRdv;
        return true;
      });
    }
  } catch (e) {
    signalerEchec('La fiche du bien', (e as Error)?.message || '');
  }
}

/* Déplacé depuis l'agenda : la nouvelle date (et l'heure) passe sur la
   fiche du bien. `ancienJour` sert à reconnaître une estimation posée sans
   lien vers son rendez-vous. */
export async function deplacerCoteBien(r: RdvBien, o: { date: string; heure: string; duree: number; ancienJour: string }): Promise<void> {
  try {
    const bien = bienDuRdv(r);
    if (r.type === 'visite') {
      const l = await ligneVisite(r);
      if (!l || l.statut !== 'a_venir') return;
      /* Comme à la création (visiteExterne) : la date et l'heure dans `le`,
         la durée dans `donnees`, le reste de `donnees` gardé tel quel. */
      const le = new Date(`${o.date}T${o.heure || '12:00'}:00`);
      if (isNaN(le.getTime())) return;
      await verifie('La nouvelle date de la visite sur la fiche du bien',
        supabase.from('biens_vente_suivi').update({ le: le.toISOString(), donnees: { ...(l.donnees || {}), duree: o.duree } })
          .eq('id', l.id).select('id'), { ligne: true });
      return;
    }
    if (r.type === 'estimation' && bien) {
      await majDonneesBien(bien, 'La nouvelle date d’estimation sur la fiche du bien', d => {
        if (!estCeRdv(d, r.id, o.ancienJour)) return false;
        d.rdvEstimation = o.date;
        if (o.heure) d.rdvEstimationHeure = o.heure; else delete d.rdvEstimationHeure;
        d.rdvEstimationRdv = r.id;
        return true;
      });
    }
  } catch (e) {
    signalerEchec('La fiche du bien', (e as Error)?.message || '');
  }
}

/* Une estimation créée dans l'agenda avec un bien choisi : le bien reçoit
   sa date, son heure et le lien vers le rendez-vous. */
export async function poserEstimationSurBien(bienId: string, rdvId: string, date: string, heure: string): Promise<boolean> {
  try {
    let ancien = '';
    const ok = await majDonneesBien(bienId, 'Le rendez-vous d’estimation sur la fiche du bien', d => {
      ancien = typeof d.rdvEstimationRdv === 'string' ? d.rdvEstimationRdv : '';
      d.rdvEstimation = date;
      if (heure) d.rdvEstimationHeure = heure; else delete d.rdvEstimationHeure;
      d.rdvEstimationRdv = rdvId;
      return true;
    });
    /* V3.50 : le bien avait déjà un rendez-vous d'estimation dans l'agenda :
       il est remplacé par le nouveau, l'ancien ne reste pas en double. */
    if (ok && ancien && ancien !== rdvId) {
      const { error } = await supabase.from('rendez_vous').update({ statut: 'annule' }).eq('id', ancien);
      if (error) signalerEchec('L’ancien rendez-vous d’estimation (remplacé)', error.message);
    }
    return ok;
  } catch (e) {
    signalerEchec('Le rendez-vous d’estimation sur la fiche du bien', (e as Error)?.message || '');
    return false;
  }
}

/* ── Planifier une visite sur un bien de l'agence (V3.50) ─────────────────
   Une copie du bien dans le dossier d'un acheteur porte `bien_vente_id`.
   Vendu, retiré, suspendu ou archivé : on ne visite plus. Sous compromis :
   seulement pour une offre de secours. Rend, par copie, ce qui l'empêche ou
   ce qu'il faut confirmer ; `erreur` si l'étape n'a pas pu être lue. */
export type EtatVente = { bloque: string[]; secours: string[]; erreur?: string };
export async function etatVenteDesCopies(copies: { titre?: string | null; ville?: string | null; bien_vente_id?: string | null }[]): Promise<EtatVente> {
  const ids = Array.from(new Set(copies.map(c => c.bien_vente_id).filter((x): x is string => !!x)));
  const out: EtatVente = { bloque: [], secours: [] };
  if (!ids.length) return out;
  const { data, error } = await supabase.from('biens_vente').select('id, etape, archive').in('id', ids);
  if (error) return { ...out, erreur: error.message };
  const parId = new Map(((data || []) as { id: string; etape: string | null; archive: boolean | null }[]).map(b => [b.id, b]));
  for (const c of copies) {
    const b = c.bien_vente_id ? parId.get(c.bien_vente_id) : null;
    if (!b) continue;
    const nom = c.titre || c.ville || 'Ce bien';
    if (b.etape === 'vendu') out.bloque.push(`« ${nom} » : ce bien est vendu.`);
    else if (b.archive || b.etape === 'retire' || b.etape === 'suspendu') out.bloque.push(`« ${nom} » : ce bien n’est plus en vente.`);
    else if (b.etape === 'compromis') out.secours.push(nom);
  }
  return out;
}
