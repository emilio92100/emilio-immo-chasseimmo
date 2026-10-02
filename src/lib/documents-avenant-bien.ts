/* ═══ L'avenant au mandat de vente, signé : la fiche du bien suit (V3.50) ══
   Un mandat de vente signé fait passer son bien « En vente » avec son prix,
   ses honoraires et sa fin (mandat-bien.ts, mandatSigneSurBien). Son avenant,
   lui, ne touchait à rien : une baisse de prix ou une prolongation signée
   laissait la fiche à l'ancien prix (et les acheteurs qui l'avaient reçu
   avec), et la liste pouvait annoncer la fin d'un mandat prolongé.

   Ici, ce qu'un avenant signé change sur la fiche : le prix
   (`nouveauPrix`), les honoraires (`charge2`, `honoMode2`, `taux2`,
   `forfait2`, posés sous les clés que lit argentBien), la fin du mandat
   (`finNouvelle` → `mandatFin`). Seules ces clés sont posées sur la fiche
   relue juste avant ; le reste de ses réponses ne bouge pas. Le prix suit
   chez les acheteurs qui ont reçu le bien et dans le texte des annonces,
   comme « Changer le prix » (FenPrix). Une ligne dans l'historique du bien.

   Signé à la main (navigateur) ou en ligne (serveur, clé de service) : le
   client Supabase est reçu. Rend un message si quelque chose n'a pas pu
   suivre, sinon null. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { liste, num, txt, type Donnees } from '@/lib/actes';
import { euros } from '@/lib/mandat';
import { lireMontant } from '@/lib/montant';
import { argentBien, colonnesBien, type BienVente } from '@/lib/biens-vente';
import { bienDuMandat, prixChezAcheteurs } from '@/lib/mandat-bien';

export type DocAvenant = { id: string; modele: string; numero: string | null; donnees: Donnees | null };

/* Les étapes où le mandat court : un bien estimé, retiré ou vendu ne bouge pas. */
const EN_COURS = ['mandat', 'suspendu', 'offre', 'compromis'];

type Changements = { prix: number | null; hono: Donnees | null; fin: string | null; illisible: string[] };

/* Ce que l'avenant dit, relu prudemment. Un prix ou des honoraires qu'on ne
   sait pas lire : on ne touche ni à l'un ni aux autres (ils vont ensemble),
   seule la fin est reportée, et le message le dit. */
export function changementsAvenant(a: Donnees): Changements {
  const objets = liste(a, 'objets');
  const illisible: string[] = [];
  let prix: number | null = null;
  if (objets.includes('prix')) {
    const p = lireMontant(a.nouveauPrix);
    if (p && p > 0) prix = p; else illisible.push('le nouveau prix');
  }
  let hono: Donnees | null = null;
  if (objets.includes('honoraires')) {
    const forfait = a.honoMode2 === 'forfait';
    const charge = a.charge2 === 'vendeur' ? 'vendeur' : a.charge2 === 'acquereur' ? 'acquereur' : null;
    const f = forfait ? lireMontant(a.forfait2) : null;
    const t = forfait ? null : num(a, 'taux2');
    const lisible = !!charge && (forfait ? !!f && f > 0 : t !== null && t >= 0 && t <= 30);
    if (lisible) hono = { charge, honoMode: forfait ? 'forfait' : 'taux', ...(forfait ? { forfait: f, taux: null } : { taux: t, forfait: null }) };
    else illisible.push('les nouveaux honoraires');
  }
  if (illisible.length) { prix = null; hono = null; }
  let fin: string | null = null;
  if (objets.includes('duree')) {
    const f = txt(a, 'finNouvelle');
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) fin = f;
  }
  return { prix, hono, fin, illisible };
}

/* Le bien de l'avenant : celui qu'il porte (préparé depuis la fiche, ou
   repris de son mandat), sinon celui de son mandat, retrouvé par le numéro. */
async function bienDeLAvenant(sb: SupabaseClient, doc: DocAvenant): Promise<BienVente | null> {
  const a = doc.donnees || {};
  const id = typeof a.bienVenteId === 'string' ? a.bienVenteId : '';
  if (id) {
    const b = await bienDuMandat(sb, { id: doc.id, modele: doc.modele, numero: null, donnees: { bienVenteId: id } });
    if (b) return b;
  }
  const numero = txt(a, 'mandatNumero');
  if (!numero) return null;
  const { data, error } = await sb.from('documents').select('id, modele, numero, donnees')
    .eq('modele', 'mandat_vente').eq('numero', numero).neq('statut', 'annule').limit(1);
  if (error) throw new Error('Le mandat de l’avenant n’a pas pu être lu : ' + error.message);
  const m = (data || [])[0] as DocAvenant | undefined;
  return m ? bienDuMandat(sb, m) : null;
}

const memeHono = (bd: Donnees, h: Donnees) => (bd.charge === 'vendeur' ? 'vendeur' : 'acquereur') === h.charge
  && (bd.honoMode === 'forfait' ? 'forfait' : 'taux') === h.honoMode
  && (h.honoMode === 'forfait' ? lireMontant(bd.forfait) === h.forfait : num(bd, 'taux') === h.taux);

const jourFr = (ymd: string) => ymd.split('-').reverse().join('/');

/* Le prix dans le texte des annonces des acheteurs (comme majPrixDansAnnonces,
   biens/outils.ts, qui ne marche que dans le navigateur). */
async function prixDansAnnonces(sb: SupabaseClient, bienId: string, vieux: string, neuf: string): Promise<string | null> {
  if (!vieux || vieux === neuf) return null;
  const { data, error } = await sb.from('biens').select('id, description').eq('bien_vente_id', bienId);
  if (error) return /bien_vente_id/.test(error.message) ? null : 'le prix dans l’annonce des acheteurs : ' + error.message;
  for (const c of (data || []) as { id: string; description: string | null }[]) {
    if (!c.description || !c.description.includes(vieux)) continue;
    const r = await sb.from('biens').update({ description: c.description.split(vieux).join(neuf) }).eq('id', c.id);
    if (r.error) return 'le prix dans l’annonce des acheteurs : ' + r.error.message;
  }
  return null;
}

/* `jour` : la date de signature de l'avenant (aaaa-mm-jj, heure de Paris). */
export async function avenantSigneSurBien(sb: SupabaseClient, doc: DocAvenant, jour: string): Promise<string | null> {
  if (doc.modele !== 'avenant_vente') return null;
  const a = doc.donnees || {};
  const c = changementsAvenant(a);
  const illisible = c.illisible.length
    ? `L’avenant est signé, mais ${c.illisible.join(' et ')} ${c.illisible.length > 1 ? 'n’ont' : 'n’a'} pas pu être lu${c.illisible.length > 1 ? 's' : ''} : ${c.fin ? 'seule la fin du mandat a été reportée sur la fiche du bien' : 'la fiche du bien n’a pas été changée'}. Change le prix et les honoraires à la main, depuis sa fiche.`
    : null;
  if (!c.prix && !c.hono && !c.fin) return illisible;
  const numero = txt(a, 'mandatNumero');
  const no = num(a, 'avenantNo') || 1;
  const nomAvenant = `Avenant n° ${no}${numero ? ` au mandat n° ${numero}` : ''}`;
  let b0: BienVente | null;
  try { b0 = await bienDeLAvenant(sb, doc); } catch (e) { return [(e as Error).message, illisible].filter(Boolean).join(' '); }
  if (!b0) return illisible;
  /* Lu deux fois au plus : la fiche relue juste avant d'écrire, et écrite
     seulement si personne ne l'a changée entre-temps (updated_at). */
  for (let essai = 0; essai < 2; essai++) {
    let b: BienVente | null = b0;
    if (essai > 0) {
      const { data, error } = await sb.from('biens_vente').select('*').eq('id', b0.id).maybeSingle();
      if (error) return [`L’avenant est signé, mais la fiche du bien n’a pas pu être relue : ${error.message}.`, illisible].filter(Boolean).join(' ');
      b = data as BienVente | null;
    }
    if (!b || !EN_COURS.includes(b.etape)) return illisible;
    const bd = b.donnees || {};
    /* Un autre mandat (un autre numéro) sur la fiche : celui-ci n'y est plus. */
    const surFiche = (txt(bd, 'mandatNumero') || b.mandat_numero || '').trim();
    if (surFiche && numero && surFiche !== numero) return illisible;
    const patch: Donnees = {};
    const ancien = num(bd, 'prix');
    if (c.prix && ancien !== c.prix) patch.prix = c.prix;
    if (c.hono && !memeHono(bd, c.hono)) Object.assign(patch, c.hono);
    if (c.fin && txt(bd, 'mandatFin') !== c.fin) patch.mandatFin = c.fin;
    /* Déjà à jour (« Changer le prix » l'avait fait avant l'avenant) : rien à écrire. */
    if (!Object.keys(patch).length) return illisible;
    const d: Donnees = { ...bd, ...patch };
    const prixChange = 'prix' in patch;
    const vieux = prixChange && ancien ? euros(ancien) : '', neuf = prixChange && c.prix ? euros(c.prix) : '';
    const texte = typeof bd.annonceTexte === 'string' ? bd.annonceTexte : '';
    if (vieux && texte.includes(vieux)) d.annonceTexte = texte.split(vieux).join(neuf);
    const maintenant = new Date().toISOString();
    let q = sb.from('biens_vente').update({ donnees: d, ...colonnesBien(d), updated_at: maintenant }).eq('id', b.id);
    if (b.updated_at) q = q.eq('updated_at', b.updated_at);
    const { data: ecrit, error } = await q.select('id');
    if (error) return [`L’avenant est signé, mais la fiche du bien n’a pas pu suivre : ${error.message}. Change le prix, les honoraires ou la fin du mandat depuis sa fiche.`, illisible].filter(Boolean).join(' ');
    if (!ecrit?.length) continue;
    /* L'historique du bien : « Prix changé » (ou « Honoraires changés »),
       comme « Changer le prix » ; une prolongation seule, une note. */
    const avantA = argentBien(bd), apresA = argentBien(d);
    const honoBouge = 'honoMode' in patch && avantA.hono !== apresA.hono;
    const finTxt = 'mandatFin' in patch && c.fin ? `mandat prolongé jusqu’au ${jourFr(c.fin)}` : '';
    const signe = `${nomAvenant}, signé le ${jourFr(jour)}`;
    const ligne: Record<string, unknown> = prixChange || honoBouge
      ? { bien_id: b.id, type: 'prix', le: maintenant, montant: num(d, 'prix'), commentaire: [signe, finTxt].filter(Boolean).join(' · '),
        donnees: { ancien, ...(honoBouge ? { honoAvant: avantA.hono, honoApres: apresA.hono } : {}), source: 'documents', document: doc.id } }
      : { bien_id: b.id, type: 'note', le: maintenant, commentaire: `${signe} : ${finTxt || 'honoraires mis à jour'} (noté depuis Documents).`,
        donnees: { source: 'documents', document: doc.id } };
    const { error: e2 } = await sb.from('biens_vente_suivi').insert(ligne);
    const pbs = [
      e2 ? 'la ligne de l’historique : ' + e2.message : null,
      await prixChezAcheteurs(sb, b.id, bd, d),
      prixChange ? await prixDansAnnonces(sb, b.id, vieux, neuf) : null,
    ].filter(Boolean);
    return [pbs.length ? `L’avenant est signé et noté sur la fiche du bien, mais ${pbs.join(' ; ')}.` : null, illisible].filter(Boolean).join(' ') || null;
  }
  return [`L’avenant est signé, mais la fiche du bien changeait au même moment : vérifie son prix, ses honoraires et la fin du mandat.`, illisible].filter(Boolean).join(' ');
}
