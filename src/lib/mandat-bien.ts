/* ═══ Le mandat de vente et la fiche du bien (V3.42) ═══════════════════════
   Alexandre (30 septembre) : « quand j'annule un mandat, il y a toujours les
   informations du mandat sur les fiches ». Le mandat vivait à deux endroits
   qui ne se parlaient pas : le document (rubrique Documents) et ce qui est
   noté sur le bien (étape, n°, type, dates, prix : `biens_vente` et ses
   `donnees`). Signer ou annuler l'un laissait l'autre tel quel.

   Ici, les gestes qui les relient, écrits une fois pour le navigateur (la
   session d'Alexandre) et pour le serveur (clé de service : la signature en
   ligne ou sur place se termine côté serveur) :
   - signé dans Documents : la fiche passe « En vente » avec le n°, le type,
     la date, la fin, le prix et les honoraires du mandat (mandatSigneSurBien) ;
   - noté par erreur (un test, le mauvais bien) : le mandat s'efface de la
     fiche, le bien revient à l'estimation, l'historique le dit
     (retirerMandatDuBien) ;
   - annulé ou supprimé dans Documents : la fiche en dépend-elle encore ?
     (bienConcerne) — la rubrique Documents propose alors quoi en faire.

   Ce fichier est isomorphe : il ne lit la base que par le client reçu. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { num, plusMois, txt, type Donnees } from '@/lib/actes';
import { colonnesBien, prixCopie, type BienVente, type EtapeVente, type SuiviVente } from '@/lib/biens-vente';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOM_TYPE: Record<string, string> = { simple: 'simple', semi: 'semi-exclusif', exclusif: 'exclusif' };

/* Ce qu'il faut savoir d'un document de mandat. */
export type DocMandat = { id: string; modele: string; numero: string | null; donnees: Donnees | null };

/* Les champs du mandat notés sur la fiche : ils partent ensemble. */
const CHAMPS_MANDAT = ['mandatType', 'mandatNumero', 'mandatDate', 'mandatFin', 'mandatFichier'];

/* La fin du mandat, telle que la fiche la montre (« jusqu'au », « fin dans
   8 jours ») : la dernière date possible. Un mandat qui se prolonge par
   périodes court jusqu'à sa limite totale, exclusif compris (V3.43 : la
   V3.42 prenait la première période pour un exclusif, et la liste disait
   « Exclusivité terminée » en rouge au bout de trois mois, alors qu'il
   courait encore). Les échéances intermédiaires (le courrier de l'article
   L215-1) restent dans Documents. */
export function finDuMandat(d: Donnees, jour: string): string {
  const duree = num(d, 'duree') ?? 3;
  const mois = d.dureeMode === 'prorogation' ? Math.max(duree, num(d, 'dureeMax') ?? 12) : duree;
  return plusMois(jour, mois);
}

/* Le bien d'un mandat : celui dont il porte l'identifiant (préparé depuis la
   fiche), sinon celui qui l'a rattaché (biens_vente.document_id). */
export async function bienDuMandat(sb: SupabaseClient, doc: DocMandat): Promise<BienVente | null> {
  const id = typeof doc.donnees?.bienVenteId === 'string' && UUID.test(doc.donnees.bienVenteId) ? doc.donnees.bienVenteId : '';
  if (id) {
    const { data, error } = await sb.from('biens_vente').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error('Le bien du mandat n’a pas pu être lu : ' + error.message);
    if (data) return data as BienVente;
  }
  const { data, error } = await sb.from('biens_vente').select('*').eq('document_id', doc.id).limit(1);
  if (error) throw new Error('Le bien du mandat n’a pas pu être lu : ' + error.message);
  return ((data || [])[0] as BienVente | undefined) || null;
}

/* Le prix suit chez les acheteurs qui ont reçu le bien (comme
   repercuterPrix, biens/outils.ts). Rend un message, ou null. Exporté en
   V3.50 pour l'avenant signé (documents-avenant-bien.ts). */
/* V3.113 : `etapes` — l'étape du bien avant et après. Avant le mandat, les
   copies n'ont pas de prix (prixCopie) : signé, le prix leur arrive ;
   retiré (retour à l'estimation), il en repart. */
export async function prixChezAcheteurs(sb: SupabaseClient, bienId: string, avant: Donnees, apres: Donnees, etapes: { avant?: string | null; apres?: string | null } = {}): Promise<string | null> {
  const p = prixCopie(apres, etapes.apres);
  if (JSON.stringify(prixCopie(avant, etapes.avant)) === JSON.stringify(p)) return null;
  const { error } = await sb.from('biens').update(p).eq('bien_vente_id', bienId);
  return error && !/bien_vente_id/.test(error.message) ? 'le nouveau prix chez les acheteurs qui ont reçu le bien : ' + error.message : null;
}

/* ── Signé dans Documents ────────────────────────────────────────────────
   À la main (la rubrique Documents), en ligne ou sur place (le serveur).
   Le bien passe « En vente » s'il n'y était pas (ou s'il y était sans mandat
   signé noté) ; sous offre, en pause, sous compromis, il garde son étape et
   reçoit les informations du mandat, avec une note dans l'historique. Un
   bien vendu n'est pas touché. `jour` : la date de signature (aaaa-mm-jj).
   Rend un message si quelque chose n'a pas pu s'écrire, sinon null. */
export async function mandatSigneSurBien(sb: SupabaseClient, doc: DocMandat, jour: string): Promise<string | null> {
  if (doc.modele !== 'mandat_vente') return null;
  let b: BienVente | null;
  try { b = await bienDuMandat(sb, doc); } catch (e) { return (e as Error).message; }
  if (!b || b.etape === 'vendu') return null;
  const dm = doc.donnees || {};
  const bd = b.donnees || {};
  const type = dm.type === 'semi' || dm.type === 'exclusif' ? dm.type : 'simple';
  const numero = (doc.numero || txt(dm, 'numero')).trim();
  const fin = finDuMandat(dm, jour);
  const prix = num(dm, 'prix');
  const passe = ['a_suivre', 'estimation', 'retire'].includes(b.etape) || (b.etape === 'mandat' && !txt(bd, 'mandatDate'));
  /* Déjà noté (un second passage) : rien à refaire. */
  if (!passe && txt(bd, 'mandatDate') === jour && txt(bd, 'mandatNumero') === numero) return null;
  const avantVente = b.etape === 'a_suivre' || b.etape === 'estimation' || (b.etape === 'retire' && !b.en_vente_le);
  const conseille = num(bd, 'prixConseille') ?? (avantVente ? num(bd, 'prix') : null);
  const forfait = dm.honoMode === 'forfait';
  const d: Donnees = {
    ...bd, mandatType: type, mandatNumero: numero, mandatDate: jour, mandatFin: fin,
    ...(prix ? { prix } : {}),
    charge: dm.charge === 'vendeur' ? 'vendeur' : 'acquereur', honoMode: forfait ? 'forfait' : 'taux',
    ...(forfait ? { forfait: num(dm, 'forfait') } : { taux: num(dm, 'taux') }),
    ...(conseille ? { prixConseille: conseille } : {}),
  };
  const maintenant = new Date().toISOString();
  const { error } = await sb.from('biens_vente').update({
    donnees: d, ...colonnesBien(d), document_id: doc.id, updated_at: maintenant,
    ...(passe ? { etape: 'mandat', etape_le: maintenant, ...(b.en_vente_le ? {} : { en_vente_le: maintenant }) } : {}),
  }).eq('id', b.id);
  if (error) return `Le mandat est signé, mais la fiche du bien n’a pas pu suivre : ${error.message}. Passe le bien « En vente » depuis sa fiche.`;
  const infos = { type, numero, date: jour, fin, ...(prix ? { prix } : {}), source: 'documents', document: doc.id };
  const jourFr = jour.split('-').reverse().join('/');
  const { error: e2 } = await sb.from('biens_vente_suivi').insert(passe
    ? { bien_id: b.id, type: 'etape', statut: 'mandat', le: maintenant, donnees: { de: b.etape, ...infos } }
    : { bien_id: b.id, type: 'note', le: maintenant, donnees: infos,
      commentaire: `Mandat ${NOM_TYPE[type]}${numero ? ` n° ${numero}` : ''} signé le ${jourFr}, noté depuis Documents.` });
  /* V3.50 : le mandat est signé, les relances de l'estimation (« faire le
     point » après l'avis, « recontacter ») n'ont plus d'objet. */
  let eRel: string | null = null;
  const relances = ['relanceAvis', 'relanceReprise'].map(k => txt(bd, k)).filter(Boolean);
  if (relances.length) {
    const r = await sb.from('relances').update({ statut: 'cloturee' }).in('id', relances).eq('statut', 'en_attente');
    if (r.error) eRel = 'les relances de l’estimation : ' + r.error.message;
  }
  const pbs = [e2 ? 'la ligne de l’historique : ' + e2.message : null, await prixChezAcheteurs(sb, b.id, bd, d, { avant: b.etape, apres: passe ? 'mandat' : b.etape }), eRel].filter(Boolean);
  return pbs.length ? `Le mandat est signé et noté sur la fiche du bien, mais ${pbs.join(' ; ')}.` : null;
}

/* ── Retirer un mandat de la fiche ───────────────────────────────────────
   Noté par erreur (un test, le mauvais bien) ou annulé dans Documents : le
   n°, le type, les dates et le scan joint quittent la fiche, le bien
   revient à l'étape choisie, et l'historique le dit (une ligne d'étape
   marquée `annule`). Le prix peut revenir au prix conseillé à l'estimation ;
   les honoraires notés avec le mandat peuvent partir aussi. */
export type RetraitMandat = {
  vers: EtapeVente; prix: 'conseille' | 'garder'; hono: 'garder' | 'effacer'; raison: string;
  /* Le document de mandat annulé qui l'a demandé, s'il y en a un. */
  document?: string | null;
};
export async function retirerMandatDuBien(sb: SupabaseClient, b: BienVente, o: RetraitMandat): Promise<{ bien: BienVente; avertissement: string | null }> {
  const avant = b.donnees || {};
  const d: Donnees = { ...avant };
  const numero = txt(avant, 'mandatNumero') || b.mandat_numero || '';
  for (const k of CHAMPS_MANDAT) delete d[k];
  const conseille = num(avant, 'prixConseille');
  if (o.prix === 'conseille' && conseille) d.prix = conseille;
  delete d.prixConseille;
  if (o.hono === 'effacer') for (const k of ['charge', 'honoMode', 'taux', 'forfait']) delete d[k];
  const maintenant = new Date().toISOString();
  const { data, error } = await sb.from('biens_vente').update({
    etape: o.vers, etape_le: maintenant, updated_at: maintenant, donnees: d, ...colonnesBien(d),
    ...(o.vers === 'retire' ? {} : { en_vente_le: null }),
  }).eq('id', b.id).select().single();
  if (error || !data) throw new Error('Le mandat n’a pas pu être retiré de la fiche : ' + (error?.message || 'rien n’est revenu'));
  const { error: e2 } = await sb.from('biens_vente_suivi').insert({
    bien_id: b.id, type: 'etape', statut: o.vers, le: maintenant, commentaire: o.raison.trim() || null,
    donnees: { de: b.etape, annule: true, ...(numero ? { numero } : {}), ...(o.document ? { document: o.document } : {}) },
  });
  const pbs = [e2 ? 'la ligne de l’historique : ' + e2.message : null, await prixChezAcheteurs(sb, b.id, avant, d, { avant: b.etape, apres: o.vers })].filter(Boolean);
  return { bien: data as BienVente, avertissement: pbs.length ? `Le mandat est retiré de la fiche, mais ${pbs.join(' ; ')}.` : null };
}

/* Le mandat est fini (annulé dans Documents : rétractation, fin du mandat) :
   le bien passe « Retiré », le mandat reste lisible dans son historique. */
export async function terminerMandatDuBien(sb: SupabaseClient, b: BienVente, raison: string): Promise<BienVente> {
  const maintenant = new Date().toISOString();
  const { data, error } = await sb.from('biens_vente').update({ etape: 'retire', etape_le: maintenant, updated_at: maintenant })
    .eq('id', b.id).select().single();
  if (error || !data) throw new Error('Le bien n’a pas pu passer « Retiré » : ' + (error?.message || 'rien n’est revenu'));
  const { error: e2 } = await sb.from('biens_vente_suivi').insert({ bien_id: b.id, type: 'etape', statut: 'retire', le: maintenant, donnees: { de: b.etape, raison } });
  if (e2) throw new Error('Le bien est « Retiré », mais la ligne de l’historique n’a pas pu s’écrire : ' + e2.message);
  return data as BienVente;
}

/* L'étape d'où le bien était parti pour le mandat : là où « Annuler ce
   mandat » le ramène. La dernière entrée en vente qui ne soit pas une
   reprise (après une pause, une offre tombée). Estimation par défaut : un
   bien créé directement en vente n'a pas d'étape d'avant. */
export function etapeAvantMandat(suivi: Pick<SuiviVente, 'type' | 'statut' | 'le' | 'donnees'>[]): EtapeVente {
  const reprise = ['mandat', 'suspendu', 'offre', 'compromis'];
  const l = suivi.filter(x => x.type === 'etape' && x.statut === 'mandat' && !reprise.includes(String((x.donnees || {}).de || '')))
    .sort((p, q) => q.le.localeCompare(p.le))[0];
  const de = l ? String((l.donnees || {}).de || '') : '';
  return de === 'a_suivre' || de === 'retire' ? de : 'estimation';
}
export async function lireEtapeAvantMandat(sb: SupabaseClient, bienId: string): Promise<EtapeVente> {
  const { data, error } = await sb.from('biens_vente_suivi').select('type, statut, le, donnees').eq('bien_id', bienId).eq('type', 'etape').eq('statut', 'mandat')
    .order('le', { ascending: false }).limit(20);
  return error ? 'estimation' : etapeAvantMandat((data || []) as SuiviVente[]);
}

/* ── Annulé ou supprimé dans Documents ───────────────────────────────────
   La fiche du bien dépend-elle de ce mandat ? Oui quand le bien est « En
   vente », en pause, sous offre ou sous compromis (V3.43), et que ce qu'il
   porte vient de ce document : il avait été signé, ou le bien porte son
   numéro, ou aucun mandat signé n'y est noté. Un bien qui porte un AUTRE
   mandat signé (un autre numéro) n'est pas concerné. */
export function bienConcerne(b: BienVente, doc: DocMandat, etaitSigne: boolean): boolean {
  if (!['mandat', 'suspendu', 'offre', 'compromis'].includes(b.etape)) return false;
  const bd = b.donnees || {};
  const signeNote = !!txt(bd, 'mandatDate');
  const n = (txt(bd, 'mandatNumero') || b.mandat_numero || '').trim();
  const dn = (doc.numero || txt(doc.donnees || {}, 'numero')).trim();
  if (signeNote && n && dn && n !== dn) return false;
  return etaitSigne || !signeNote || (!!dn && n === dn);
}
