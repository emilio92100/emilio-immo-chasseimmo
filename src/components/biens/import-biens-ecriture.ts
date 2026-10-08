/* ═══ Importer les biens d'ImmoFacile : l'écriture (V3.79) ═══════════════════
   Ce qui part en base au clic sur « Importer », et rien avant. Depuis le
   navigateur, avec la session d'Alexandre, comme une création à la main.
   Pour chaque bien coché dans l'aperçu (src/lib/import-biens-immofacile.ts
   prépare tout) :
     · son propriétaire : le contact retrouvé dans le CRM ; sinon, si
       l'aperçu le demande, un contact créé (« Vendeur ») ; une annonce type
       n'en a pas ;
     · la fiche : une nouvelle (référence EMI-V-…, l'étape choisie, la date
       de création d'ImmoFacile), ou — le même bien du même vendeur déjà dans
       le CRM (un « À suivre » de la reprise des contacts) — la fiche
       existante, complétée seulement là où elle est vide ;
     · ses photos, copiées chez nous par le serveur
       (/api/biens-vente/photos-immofacile), dans l'ordre d'ImmoFacile ;
     · son historique : une ligne « Repris d'ImmoFacile », une ligne d'étape,
       puis une note par action d'ImmoFacile, à sa date ;
     · son contact : Vendeur si le bien est en vente, Propriétaire sinon (V3.137).
   Chaque écriture est lue ; un bien qui échoue n'arrête pas les suivants,
   et le compte rendu dit ce qui a manqué. Un bien déjà importé (sa
   référence ImmoFacile est dans une fiche) n'est jamais recréé. */

import { supabase, genererReference } from '@/lib/supabase';
import { jetonEspace } from '@/lib/jeton';
import { toutLire } from '@/lib/registre';
import { colonnesBien, lirePhotos, referenceSuivante, type BienVente, type Donnees, type EtapeVente, type Photo } from '@/lib/biens-vente';
import { completerDonnees, type BienCRM, type PlanBien } from '@/lib/import-biens-immofacile';
import { sourceDepuis, type ClientCRM } from '@/lib/import-immofacile';
import { colonneSourceAbsente } from '@/lib/sources';
import { ETAPES_EN_VENTE } from '@/lib/contacts';
import { donneesProprio, marquerVendeur, noterProprioRelie, type ClientMini } from './outils';

export type EtatCRMBiens = { clients: ClientCRM[]; biens: BienCRM[]; references: (string | null)[] };

export async function lireCRMBiens(): Promise<EtatCRMBiens> {
  const [cl, bv] = await Promise.all([
    toutLire<ClientCRM>((de, a) => supabase.from('clients').select('*').order('id').range(de, a)),
    toutLire<BienCRM>((de, a) => supabase.from('biens_vente').select('id, reference, etape, archive, client_id, titre, donnees').order('id').range(de, a)),
  ]);
  if (cl.erreur) throw new Error(`Les contacts du CRM n’ont pas pu être lus (${cl.erreur}) : sans eux, impossible de relier les vendeurs. Recharge la page, puis réessaie.`);
  if (bv.erreur) throw new Error(`Les biens du CRM n’ont pas pu être lus (${bv.erreur}) : sans eux, impossible d’éviter les doublons. Recharge la page, puis réessaie.`);
  return { clients: cl.data, biens: bv.data, references: bv.data.map(x => x.reference) };
}

export type ChoixBien = { importer: boolean; etape: EtapeVente; archive: boolean; creerVendeur: boolean };
export type ResultatBien = {
  ref: string; titre: string;
  fait: 'cree' | 'complete' | null; id: string | null; reference: string | null;
  photos: number; photosPrevues: number; suivi: number; vendeur: 'relie' | 'cree' | null;
  soucis: string[]; echec: string | null;
};

const EN_COURS: EtapeVente[] = ['a_suivre', 'estimation', 'mandat', 'suspendu', 'offre', 'compromis'];
const midi = (ymd: string) => `${ymd}T12:00:00.000Z`;
const msg = (e: unknown) => (e as Error)?.message || 'erreur inconnue';

/* Un vendeur absent du CRM : un contact, comme « Nouveau contact ». */
async function creerVendeur(p: PlanBien, etape: EtapeVente, crm: EtatCRMBiens): Promise<ClientCRM> {
  const v = p.vendeur!;
  const reference = await genererReference();
  /* V3.137 : Vendeur seulement si le bien est en vente (mandat, sous offre,
     sous compromis) ; Propriétaire sinon. */
  const types = etape === 'vendu' ? ['vendeur_signe'] : ETAPES_EN_VENTE.includes(etape) ? ['vendeur'] : ['proprietaire'];
  const ligne: Record<string, unknown> = {
    reference, prenom: v.prenom || '', nom: v.nom || '', token_espace: jetonEspace(v.prenom, v.nom),
    adresse: v.adresse || null, emails: v.emails, telephones: v.telephones, statut: 'prospect', est_vendeur: false,
    notes: `Repris d’ImmoFacile : vendeur du bien n° ${p.ref}.${v.commentaires ? `\n${v.commentaires}` : ''}`,
    types, pro: {},
    /* Un bien retiré : son vendeur va dans « Archivés », comme au tri des vendeurs. */
    ...(etape === 'retire' ? { archive: true } : {}),
  };
  const src = sourceDepuis(v.origine);
  const essai = (x: Record<string, unknown>) => supabase.from('clients').insert(x).select().single();
  let r = await essai({ ...ligne, ...(v.civilite ? { civilite: v.civilite } : {}), ...(src ? { source: src.k, source_detail: src.detail || null } : {}) });
  /* Les colonnes d'un SQL pas encore passé : on recommence sans elles. */
  if (r.error && (/civilite/i.test(r.error.message) || colonneSourceAbsente(r.error.message))) r = await essai(ligne);
  if (r.error || !r.data) throw new Error(r.error?.message || 'la base n’a rien renvoyé');
  const c = r.data as ClientCRM;
  crm.clients.push(c);
  return c;
}

/* Les photos, par paquets de 12 (une minute au plus par appel du serveur). */
async function copierPhotos(id: string, urls: string[]): Promise<{ photos: Photo[]; rates: number }> {
  const photos: Photo[] = [];
  let rates = 0;
  for (let i = 0; i < urls.length; i += 12) {
    const lot = urls.slice(i, i + 12);
    try {
      const r = await fetch('/api/biens-vente/photos-immofacile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, urls: lot }) });
      const j = await r.json().catch(() => null) as { ok?: boolean; photos?: ({ url: string; chemin: string } | null)[] } | null;
      if (!j?.ok || !Array.isArray(j.photos)) { rates += lot.length; continue; }
      for (const p of j.photos) { if (p) photos.push({ url: p.url, chemin: p.chemin, legende: '' }); else rates++; }
    } catch { rates += lot.length; }
  }
  return { photos, rates };
}

export async function importerBien(p: PlanBien, c: ChoixBien, crm: EtatCRMBiens, existant: BienCRM | null): Promise<ResultatBien> {
  const res: ResultatBien = { ref: p.ref, titre: p.titre, fait: null, id: null, reference: null, photos: 0, photosPrevues: p.photos.length, suivi: 0, vendeur: null, soucis: [], echec: null };
  const annonceType = c.etape === 'annonce_type';

  /* 1. Le propriétaire. */
  let client: ClientCRM | null = annonceType ? null : p.trouve?.client || null;
  if (client) res.vendeur = 'relie';
  else if (!annonceType && c.creerVendeur && p.vendeur) {
    try { client = await creerVendeur(p, c.etape, crm); res.vendeur = 'cree'; }
    catch (e) { res.soucis.push(`le contact du vendeur n’a pas été créé (${msg(e)}) : le bien est importé sans propriétaire`); }
  }

  /* 2. La fiche. */
  const maintenant = new Date().toISOString();
  let d: Donnees = { ...p.donnees, importIF: { le: maintenant.slice(0, 10), statut: p.statutLib } };
  if (client) Object.assign(d, donneesProprio(client as unknown as ClientMini));
  if (annonceType) { delete d.mandatNumero; delete d.mandatType; delete d.mandatDate; delete d.mandatFin; }
  let bien: BienVente;
  try {
    if (existant) {
      d = completerDonnees(existant.donnees || {}, d);
      const { data, error } = await supabase.from('biens_vente').update({
        donnees: d, ...colonnesBien(d), etape: c.etape, etape_le: maintenant, archive: c.archive, updated_at: maintenant,
        ...(c.etape === 'vendu' ? { vendu_le: p.venduLe || maintenant.slice(0, 10) } : {}),
      }).eq('id', existant.id).select().single();
      if (error || !data) throw new Error(error?.message || 'la fiche n’a pas été relue');
      bien = data as BienVente;
      res.fait = 'complete';
    } else {
      const reference = referenceSuivante(crm.references);
      crm.references.push(reference);
      const enVente = ['mandat', 'offre', 'compromis', 'vendu', 'suspendu'].includes(c.etape);
      const ligne: Record<string, unknown> = {
        reference, etape: c.etape, etape_le: maintenant, ...colonnesBien(d), donnees: d, archive: c.archive,
        ...(enVente ? { en_vente_le: typeof d.mandatDate === 'string' && d.mandatDate ? midi(d.mandatDate) : maintenant } : {}),
        ...(c.etape === 'vendu' ? { vendu_le: p.venduLe || maintenant.slice(0, 10) } : {}),
      };
      const essai = (x: Record<string, unknown>) => supabase.from('biens_vente').insert(x).select().single();
      /* La date de création d'ImmoFacile ; refusée, celle du jour. */
      let r = await essai(p.cree ? { ...ligne, created_at: midi(p.cree) } : ligne);
      if (r.error && p.cree) r = await essai(ligne);
      if (r.error || !r.data) throw new Error(r.error?.message || 'la base n’a rien renvoyé');
      bien = r.data as BienVente;
      res.fait = 'cree';
    }
  } catch (e) { res.echec = msg(e); return res; }
  res.id = bien.id;
  res.reference = bien.reference;
  crm.biens.push({ id: bien.id, reference: bien.reference, etape: bien.etape, archive: bien.archive, client_id: bien.client_id, titre: bien.titre, donnees: bien.donnees });

  /* 3. Les photos (pas sur une fiche qui en a déjà). */
  if (p.photos.length && !lirePhotos(d.photos).length) {
    const { photos, rates } = await copierPhotos(bien.id, p.photos);
    res.photos = photos.length;
    if (rates) res.soucis.push(`${rates} photo${rates > 1 ? 's' : ''} sur ${p.photos.length} n’${rates > 1 ? 'ont' : 'a'} pas pu être copiée${rates > 1 ? 's' : ''}`);
    if (photos.length) {
      const dd = { ...d, photos };
      const { error } = await supabase.from('biens_vente').update({ donnees: dd, ...colonnesBien(dd), updated_at: new Date().toISOString() }).eq('id', bien.id);
      if (error) { res.soucis.push(`les photos sont copiées mais pas rangées dans la fiche (${error.message})`); res.photos = 0; }
      else d = dd;
    }
  }

  /* 4. L'historique. */
  const lignes: Record<string, unknown>[] = [
    { bien_id: bien.id, type: 'note', le: maintenant, commentaire: `Repris d’ImmoFacile (n° ${p.ref}, statut « ${p.statutLib} »).`, donnees: { source: 'immofacile', ref: p.ref } },
    ...(res.fait === 'cree' || (existant && existant.etape !== c.etape) ? [{ bien_id: bien.id, type: 'etape', statut: c.etape, le: maintenant, donnees: { de: existant ? existant.etape : 'creation', depuis: 'immofacile' } }] : []),
    ...p.histo.map(h => ({
      bien_id: bien.id, type: 'note', le: midi(h.date), qui: h.qui || null,
      commentaire: `${h.quoi}${h.client ? ` · ${h.client}` : ''}`, donnees: { source: 'immofacile', ref: p.ref },
    })),
  ];
  {
    const { data, error } = await supabase.from('biens_vente_suivi').insert(lignes).select('id');
    if (error) res.soucis.push(`son historique n’a pas été écrit (${error.message})`);
    else res.suivi = (data || []).length;
  }

  /* 5. Le contact : son type suit le bien (V3.137 : Vendeur en vente,
     Propriétaire sinon) ; une ligne dans son Suivi. */
  if (client && EN_COURS.includes(c.etape)) {
    if (!(await marquerVendeur(client.id))) res.soucis.push('son type de contact n’a pas été mis à jour');
    try { await noterProprioRelie(bien, client.id, false); } catch (e) { res.soucis.push(`la ligne dans le Suivi du vendeur n’a pas été écrite (${msg(e)})`); }
  }
  return res;
}
