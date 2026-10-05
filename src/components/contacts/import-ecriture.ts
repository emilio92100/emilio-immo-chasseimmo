/* ═══ Importer depuis ImmoFacile : l'écriture (V3.61) ═══════════════════════
   Ce qui part en base au clic sur « Importer », et rien avant. Depuis le
   navigateur, avec la session d'Alexandre, exactement comme une création à
   la main :
     · le contact : la même ligne que « Nouveau contact » (Clients.tsx) —
       référence, lien d'espace (jetonEspace), types, source, et les mêmes
       replis quand une colonne du SQL manque ;
     · sa recherche : les colonnes de colonnesCriteres, comme Clients.tsx ;
     · un projet de vente : « Revente possible (mandat vendeur potentiel) »
       coché, avec son bien, et le rappel noté posé sur lui (Relances) ;
     · sa fiche bien « À suivre », seulement si Alexandre la demande dans
       les corrections (il a vu le logement) : creerBien (rubrique Biens)
       relié à lui, et le rappel par la relance « recontacter » de
       l'estimation (poserRelanceEstimation), gardée dans le bien ;
     · une ligne au Suivi : « Fiche reprise d'ImmoFacile le … », avec
       `metadata.source = 'import_immofacile'` et le numéro du lot ;
     · V3.70, quand le fichier porte les colonnes « Prochain contact » et
       « Historique des relances » (relevées dans ImmoFacile, qui ne les
       exporte pas) : une relance à la date du prochain contact, et une
       ligne du Suivi par action, à sa date d'origine
       (`metadata.source = 'immofacile_historique'`).
   Un contact déjà dans le CRM n'est pas recréé : on complète sa fiche
   (`completer`, src/lib/import-immofacile.ts), relue juste avant d'écrire —
   deux lignes du fichier qui tombent sur la même fiche (lui, puis sa
   conjointe) ne s'écrasent pas.

   Les acheteurs arrivent en « À qualifier » par défaut : statut `prospect`
   et recherche arrêtée (`active: false`). Ni la veille (statut « actif » ET
   recherche en marche), ni le point automatique (statut « actif »), ni les
   alertes de rapprochement (recherche en marche) ne les voient. « Actifs » :
   statut `actif`, recherche en marche, comme une fiche saisie « Actif » —
   sauf ceux que l'écran garde à qualifier (`actif: false` : « À vérifier »,
   un refus des e-mails dans ImmoFacile).

   Le type « Vendeur » n'est posé qu'une fois son bien « À suivre » créé :
   un bien qui échoue ne laisse pas un vendeur sans bien.

   Chaque écriture est lue : un échec est noté sur le contact (`soucis` ou
   `echec`) et l'écran les liste à la fin. Un contact qui échoue n'arrête pas
   les suivants. */

import { supabase, genererReference, addJournal } from '@/lib/supabase';
import { jetonEspace } from '@/lib/jeton';
import { toutLire } from '@/lib/registre';
import { colonneContactAbsente, typesDe } from '@/lib/contacts';
import { colonneSourceAbsente, libelleSource } from '@/lib/sources';
import { titreBien } from '@/lib/biens-vente';
import { colonnesCriteres } from '@/components/shared/CriteresRecherche';
import { ajouterSuivi, creerBien, donneesProprio, majBien, marquerVendeur, poserDansBien, poserRelanceEstimation, type ClientMini } from '@/components/biens/outils';
import { NOTE_TRI } from '@/lib/relances';
import { aujourdhuiYmd, completer, dateFr, type ClientCRM, type Doublon, type Plan, type PlanRecherche } from '@/lib/import-immofacile';

export type Mode = 'qualifier' | 'actifs';

/* Ce qu'il faut savoir du CRM avant d'importer : ses contacts (doublons),
   qui a déjà une recherche, qui a déjà un bien en cours (un bien vendu,
   retiré ou archivé n'empêche pas un nouveau projet), les références. */
export type EtatCRM = {
  clients: ClientCRM[];
  avecRecherche: Set<string>;
  avecBien: Set<string>;
  referencesBiens: (string | null)[];
};
export async function lireCRM(): Promise<EtatCRM> {
  const [cl, re, bv] = await Promise.all([
    toutLire<ClientCRM>((de, a) => supabase.from('clients').select('*').order('id').range(de, a)),
    toutLire<{ client_id: string }>((de, a) => supabase.from('recherches').select('client_id').order('id').range(de, a)),
    toutLire<{ client_id: string | null; reference: string | null; etape: string | null; archive: boolean | null }>((de, a) => supabase.from('biens_vente').select('client_id, reference, etape, archive').order('id').range(de, a)),
  ]);
  if (cl.erreur) throw new Error(`Les contacts du CRM n’ont pas pu être lus (${cl.erreur}) : sans eux, impossible de repérer ceux qui y sont déjà. Recharge la page, puis réessaie.`);
  if (re.erreur) throw new Error(`Les recherches du CRM n’ont pas pu être lues (${re.erreur}). Recharge la page, puis réessaie.`);
  if (bv.erreur) throw new Error(`Les biens du CRM n’ont pas pu être lus (${bv.erreur}). Recharge la page, puis réessaie.`);
  return {
    clients: cl.data,
    avecRecherche: new Set(re.data.map(x => x.client_id)),
    avecBien: new Set(bv.data.filter(x => x.archive !== true && x.etape !== 'vendu' && x.etape !== 'retire').map(x => x.client_id).filter((x): x is string => !!x)),
    referencesBiens: bv.data.map(x => x.reference),
  };
}

export type Resultat = {
  cle: string; nom: string;
  clientId: string | null;
  /* Créé, complété, ou rien (échec). */
  fait: 'cree' | 'complete' | null;
  recherches: number; bien: boolean; rappel: boolean;
  /* Enregistré, mais une partie a manqué. */
  soucis: string[];
  /* Pas enregistré du tout. */
  echec: string | null;
  /* Son bloc « Repris d'ImmoFacile » a été ajouté à « À savoir ». */
  notes?: boolean;
  /* V3.70 : les lignes de son historique ImmoFacile écrites dans son Suivi,
     et la relance posée à son prochain contact. */
  historique?: number;
  relanceIF?: boolean;
};

type Identite = { cle: string; prenom: string; nom: string; civilite: 'Monsieur' | 'Madame' | ''; nomAffiche: string };

/* Une écriture, sa réponse lue : le message de la base, ou ''. */
async function lire(requete: PromiseLike<{ error: { message: string } | null }>): Promise<string> {
  try { const { error } = await requete; return error ? error.message : ''; }
  catch (e) { return (e as Error)?.message || 'erreur inconnue'; }
}

/* La recherche, comme Clients.tsx : nom, adresse interne, en marche ou non. */
async function creerRecherche(clientId: string, id: Identite, r: PlanRecherche, active: boolean): Promise<string> {
  return lire(supabase.from('recherches').insert({
    client_id: clientId, nom: r.nom,
    token_espace: jetonEspace(id.prenom, id.nom),
    active,
    ...colonnesCriteres(r.crit),
    sans_mandat: false,
  }));
}

/* Le bien « À suivre » et son rappel. */
async function creerASuivre(proprio: ClientMini, p: Plan, crm: EtatCRM, soucis: string[]): Promise<{ bien: boolean; rappel: boolean }> {
  if (!p.aSuivre) return { bien: false, rappel: false };
  const d = { ...donneesProprio(proprio), ...p.aSuivre.donnees };
  let id = '', reference: string | null = null;
  try {
    const b = await creerBien(crm.referencesBiens, 'a_suivre', d);
    id = b.id; reference = b.reference;
    crm.referencesBiens.push(b.reference);
    crm.avecBien.add(proprio.id);
  } catch (e) {
    soucis.push(`son bien « À suivre » n’a pas été créé (${(e as Error).message})`);
    return { bien: false, rappel: false };
  }
  const titre = d.typeBien ? titreBien(d) : null;
  if (titre) {
    try { await majBien(id, { titre }); }
    catch (e) { soucis.push(`le titre de son bien n’a pas été posé (${(e as Error).message})`); }
  }
  let rappel = false;
  /* L'aperçu a pu être ouvert la veille : un rappel « aujourd'hui » (en
     retard) devenu d'hier serait refusé. */
  const le = p.aSuivre.rappel && p.aSuivre.rappel < aujourdhuiYmd() ? aujourdhuiYmd() : p.aSuivre.rappel;
  if (le) {
    const rid = await poserRelanceEstimation({ client_id: proprio.id, titre, reference, donnees: d }, 'reprise', le);
    if (rid) {
      rappel = true;
      try { await poserDansBien(id, { relanceReprise: rid }); }
      catch (e) { soucis.push(`le lien entre son bien et son rappel n’a pas été gardé (${(e as Error).message})`); }
    } else soucis.push(`le rappel du ${dateFr(le)} n’a pas été posé`);
  }
  try {
    await ajouterSuivi({ bien_id: id, type: 'note', commentaire: `Repris d’ImmoFacile.${le ? ` À recontacter le ${dateFr(le)}${p.aSuivre.retard ? ` (en retard, ${p.aSuivre.retard})` : ''}.` : ''}` });
  } catch (e) { soucis.push(`l’historique de son bien n’a pas été écrit (${(e as Error).message})`); }
  /* Un bien dans la rubrique Biens : son propriétaire est « vendeur », comme
     quand on le crée depuis Biens (PageBiens). Seulement maintenant. */
  if (!(await marquerVendeur(proprio.id))) soucis.push('son type « Vendeur » n’a pas été posé');
  else {
    let m = '';
    try {
      const rep = await supabase.from('clients').update({ est_vendeur: true }).eq('id', proprio.id).select('id');
      m = rep.error ? rep.error.message : (rep.data || []).length ? '' : 'aucune ligne modifiée';
    } catch (e) { m = (e as Error)?.message || 'erreur inconnue'; }
    if (m) soucis.push(`la case « vendeur » de sa fiche n’a pas été cochée (${m})`);
  }
  return { bien: true, rappel };
}

/* Le rappel de son projet de vente, sur lui (Relances), quand il n'a pas de
   fiche bien : comme la relance « recontacter » d'une estimation, sans bien.
   V3.70 : ou son prochain contact noté dans ImmoFacile, avec son dernier
   échange en note. Un rappel de l'un ou de l'autre déjà en attente (un
   réimport) n'est pas doublé. */
const NOTE_VENTE = 'Projet de vente — recontacter ';
const NOTE_PROCHAIN = 'Prochain contact repris d’ImmoFacile — ';
/* V3.73 : le tri d'après l'import. « Dernier appel » : le bloc « Tri à
   faire » de Relances (NOTE_TRI) ; « À relancer » : une relance ordinaire. */
const NOTE_RELANCE_TRI = 'Relance proposée au tri de l’import — ';
async function poserRappelVente(clientId: string, nom: string, p: Plan, soucis: string[]): Promise<boolean> {
  const r = p.rappel;
  if (!r) return false;
  const le = r.date < aujourdhuiYmd() ? aujourdhuiYmd() : r.date;
  for (const debut of [NOTE_VENTE, NOTE_PROCHAIN, NOTE_TRI, NOTE_RELANCE_TRI]) {
    try {
      const deja = await supabase.from('relances').select('id').eq('client_id', clientId).eq('statut', 'en_attente').like('note', `${debut}%`).limit(1);
      if (!deja.error && (deja.data || []).length) return false;
    } catch { /* la vérification a échoué : on pose le rappel quand même */ }
  }
  const qui = nom || 'le contact';
  const suite = `${r.texte ? ` · ${r.texte.charAt(0).toUpperCase()}${r.texte.slice(1)}` : ''}${r.retard ? ` (en retard, ${r.retard})` : ''}`;
  const note = r.tri === 'dernier' ? `${NOTE_TRI}${qui}${suite}`
    : r.tri === 'relancer' ? `${NOTE_RELANCE_TRI}${qui}${suite}`
    : r.immofacile
    ? `${NOTE_PROCHAIN}${nom || 'le contact'}${r.texte ? ` · ${r.texte.charAt(0).toUpperCase()}${r.texte.slice(1)}` : ''}${r.retard ? ` (en retard, ${r.retard})` : ''}`
    : `${NOTE_VENTE}${nom || 'le propriétaire'}${r.texte ? ` · ${r.texte}` : ''}${r.retard ? ` (en retard, ${r.retard})` : ''}`;
  const m = await lire(supabase.from('relances').insert({
    client_id: clientId, type: 'manuelle', statut: 'en_attente', date_echeance: new Date(`${le}T09:00:00`).toISOString(), note,
  }));
  if (m) { soucis.push(r.tri === 'dernier' ? `son dernier appel du ${dateFr(le)} (tri) n’a pas été posé (${m})` : r.immofacile || r.tri ? `sa relance du ${dateFr(le)} n’a pas été posée (${m})` : `le rappel du ${dateFr(le)} pour sa vente n’a pas été posé (${m})`); return false; }
  return true;
}

/* Son historique d'ImmoFacile (V3.70) : une ligne du Suivi par action, à
   sa date d'origine (midi, heure de Paris), comme s'il l'avait notée ce
   jour-là. Les lignes déjà reprises (même jour, même titre, même texte : un
   réimport) ne sont pas doublées. Rend le nombre de lignes écrites. */
const SOURCE_HISTORIQUE = 'immofacile_historique';
async function ecrireHistorique(clientId: string, p: Plan, lot: string, soucis: string[]): Promise<number> {
  if (!p.historique.length) return 0;
  const cle = (jour: string, titre: string, texte: string | null) => `${jour}|${titre}|${texte || ''}`;
  const deja = new Set<string>();
  try {
    const rep = await supabase.from('journal').select('created_at, titre, description').eq('client_id', clientId).eq('metadata->>source', SOURCE_HISTORIQUE);
    for (const x of (rep.data || []) as { created_at: string; titre: string; description: string | null }[]) deja.add(cle(aujourdhuiYmd(new Date(x.created_at)), x.titre, x.description));
  } catch { /* la vérification a échoué : on écrit quand même */ }
  const nouvelles = p.historique.filter(h => !deja.has(cle(h.date, h.titre, h.texte || null)));
  if (!nouvelles.length) return 0;
  const lignes = nouvelles.map(h => ({
    client_id: clientId, type: h.type, titre: h.titre, description: h.texte || null,
    metadata: { source: SOURCE_HISTORIQUE, lot, date_immofacile: h.date },
    created_at: new Date(`${h.date}T12:00:00`).toISOString(),
  }));
  let ecrites: { created_at: string }[] = [];
  try {
    const rep = await supabase.from('journal').insert(lignes).select('created_at');
    if (rep.error) { soucis.push(`son historique d’ImmoFacile n’a pas été écrit dans son Suivi (${rep.error.message})`); return 0; }
    ecrites = (rep.data || []) as { created_at: string }[];
  } catch (e) { soucis.push(`son historique d’ImmoFacile n’a pas été écrit dans son Suivi (${(e as Error)?.message || 'erreur inconnue'})`); return 0; }
  /* La base a mis la date du jour à la place de la sienne : les lignes sont
     là, mais toutes datées d'aujourd'hui. Alexandre doit le savoir. */
  const jours = new Set(ecrites.map(x => aujourdhuiYmd(new Date(x.created_at))));
  if (ecrites.length && !nouvelles.some(h => jours.has(h.date))) soucis.push('son historique est dans son Suivi, mais daté d’aujourd’hui et pas de ses dates d’ImmoFacile');
  return ecrites.length || lignes.length;
}

/* ── Un nouveau contact ── */
export async function importerNouveau(id: Identite, p: Plan, o: { actif: boolean; lot: string; crm: EtatCRM }): Promise<Resultat> {
  const res: Resultat = { cle: id.cle, nom: id.nomAffiche, clientId: null, fait: null, recherches: 0, bien: false, rappel: false, soucis: [], echec: null };
  const acheteur = p.types.includes('acheteur');
  /* V3.73 : un « dernier appel » du tri n'est jamais « Actif » : rien ne lui part tout seul.
     V3.77 : un vendeur signé ou archivé non plus. */
  const actif = acheteur && o.actif && !p.force && (!p.tri || p.tri.sorte === 'relancer');
  /* « Vendeur » : avec son bien, une fois celui-ci créé (creerASuivre).
     V3.77 : sauf un vendeur archivé, qui le garde sans bien. */
  const types = p.types.filter(t => t !== 'vendeur' || p.archiver);
  let reference: string;
  try { reference = await genererReference(); }
  catch (e) { res.echec = (e as Error).message; return res; }
  const ba = p.bienActuel;
  const ligne: Record<string, unknown> = {
    reference, prenom: id.prenom || '', nom: id.nom || '',
    token_espace: jetonEspace(id.prenom, id.nom),
    adresse: p.adresse || null,
    emails: p.emails, telephones: p.telephones,
    /* Le statut d'un dossier d'achat : « À qualifier » = prospect. Les autres
       contacts sont créés en prospect, comme à la main. */
    statut: actif ? 'actif' : 'prospect',
    statut_occupation: p.occupation,
    bien_actuel_a_vendre: ba.aVendre,
    bien_actuel_type: ba.aVendre ? ba.type : null,
    bien_actuel_surface: ba.aVendre ? ba.surface : null,
    bien_actuel_valeur: ba.aVendre ? ba.valeur : null,
    bien_actuel_adresse: ba.aVendre ? ba.adresse : null,
    bien_actuel_notes: ba.aVendre ? ba.notes : null,
    notes: p.aSavoir || null,
    est_vendeur: false,
    /* V3.77 : un vendeur « Archivé » au tri arrive dans « Archivés ». */
    ...(p.archiver ? { archive: true } : {}),
  };
  const civ = id.civilite ? { civilite: id.civilite } : {};
  const src = p.source ? { source: p.source.k, source_detail: p.source.detail || null } : {};
  const avec = { types, pro: {} };
  type Rep = { data: unknown; error: { message: string } | null };
  const essai = (x: Record<string, unknown>): PromiseLike<Rep> => supabase.from('clients').insert(x).select().single();
  let r: Rep;
  try {
    /* Les colonnes d'un SQL pas encore passé (civilité, source) : on
       recommence sans elles, comme Clients.tsx. */
    let sansCiv = false, sansSrc = false, sansTypes = false;
    const faire = () => essai({ ...ligne, ...(sansCiv ? {} : civ), ...(sansSrc ? {} : src), ...(sansTypes ? {} : avec) });
    r = await faire();
    for (let i = 0; i < 3 && r.error; i++) {
      if (!sansCiv && id.civilite && /civilite/i.test(r.error.message)) { sansCiv = true; r = await faire(); continue; }
      if (!sansSrc && p.source && colonneSourceAbsente(r.error.message)) { sansSrc = true; r = await faire(); continue; }
      /* Avant le SQL des types, tout contact est un acheteur : on ne peut
         enregistrer que ça. La civilité et la source restent. */
      if (!sansTypes && colonneContactAbsente(r.error.message)) {
        if (types.length === 1 && acheteur) { sansTypes = true; r = await faire(); continue; }
        res.echec = 'pour enregistrer un propriétaire ou un professionnel, lance d’abord outils/sql/types-contact.sql dans Supabase';
        return res;
      }
      break;
    }
    if (sansSrc && !r.error) res.soucis.push('sa source n’a pas été enregistrée : lance outils/sql/source-contact.sql dans Supabase');
    if (sansCiv && !r.error) res.soucis.push('sa civilité n’a pas été enregistrée');
  } catch (e) { res.echec = (e as Error)?.message || 'erreur inconnue'; return res; }
  if (r.error || !r.data) { res.echec = r.error?.message || 'la base n’a rien renvoyé'; return res; }
  const cree = r.data as { id: string; statut?: string };
  res.clientId = cree.id;
  res.fait = 'cree';
  o.crm.clients.push(cree as ClientCRM);

  /* Ses recherches. */
  for (const rech of p.recherches) {
    const m = await creerRecherche(cree.id, id, rech, actif);
    if (m) res.soucis.push(`${p.recherches.length > 1 ? `sa recherche « ${rech.nom} »` : 'sa recherche'} n’a pas été enregistrée (${m}) : ouvre sa fiche et enregistre ses critères`);
    else { res.recherches++; o.crm.avecRecherche.add(cree.id); }
  }

  /* La ligne du Suivi : c'est elle qui retrouve le lot (« Voir les contacts importés »). */
  const libSrc = p.source ? libelleSource(p.source.k, p.source.detail) : '';
  const ok = await addJournal(cree.id, 'creation', p.suivi, `Référence : ${reference}${libSrc ? ` · source : ${libSrc}` : ''}`, { source: 'import_immofacile', lot: o.lot });
  if (!ok) res.soucis.push('la ligne « Fiche reprise d’ImmoFacile » de son Suivi n’a pas été écrite');
  if (p.archiver && !(await addJournal(cree.id, 'statut_change', 'Contact archivé', `Vendeur archivé à l’import d’ImmoFacile${p.tri?.motif ? ` : ${p.tri.motif.charAt(0).toLowerCase()}${p.tri.motif.slice(1)}` : ''}.`, { archive: true, source: 'import_immofacile', lot: o.lot }))) {
    res.soucis.push('il est bien dans « Archivés », mais la ligne « Contact archivé » de son Suivi n’a pas été écrite');
  }
  /* Son historique d'ImmoFacile, chaque action à sa date (V3.70). */
  res.historique = await ecrireHistorique(cree.id, p, o.lot, res.soucis);

  /* Son bien « À suivre ». */
  const proprio: ClientMini = { id: cree.id, prenom: id.prenom, nom: id.nom, statut: cree.statut || null, civilite: id.civilite || null, couple: false, conjoint: null, adresse: p.adresse || null, emails: p.emails, telephones: p.telephones, pro: {} };
  const b = await creerASuivre(proprio, p, o.crm, res.soucis);
  res.bien = b.bien; res.rappel = b.rappel;
  if (p.rappel) {
    res.rappel = await poserRappelVente(cree.id, [id.prenom, id.nom].filter(Boolean).join(' '), p, res.soucis);
    res.relanceIF = res.rappel && (p.rappel.immofacile || !!p.rappel.tri);
  }
  return res;
}

/* ── Un contact déjà dans le CRM : ce qui manque, rien d'autre ──
   Sa fiche est relue ici, juste avant d'écrire, et ce qui manque est
   recalculé sur elle : l'aperçu a pu être fait sur une liste plus ancienne,
   et une autre ligne du fichier vient peut-être de la compléter. */
export async function completerFiche(id: Identite, p: Plan, clientId: string, o: {
  lot: string; crm: EtatCRM;
  /* Le mode « Actifs », et rien qui demande une vérification. */
  actif: boolean;
  doublon: Pick<Doublon, 'conjoint' | 'autreNom' | 'raison'>;
  /* Une autre ligne de ce même import a déjà complété cette fiche. */
  memeLot: boolean;
}): Promise<Resultat> {
  const res: Resultat = { cle: id.cle, nom: id.nomAffiche, clientId, fait: null, recherches: 0, bien: false, rappel: false, soucis: [], echec: null };
  let x: ClientCRM;
  try {
    const rep = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle();
    if (rep.error) { res.echec = `sa fiche n’a pas pu être relue (${rep.error.message})`; return res; }
    if (!rep.data) { res.echec = 'sa fiche n’est plus dans le CRM : relance l’import pour la recréer'; return res; }
    x = rep.data as ClientCRM;
  } catch (e) { res.echec = (e as Error)?.message || 'erreur inconnue'; return res; }
  const c = completer(p, x, {
    aRecherche: o.crm.avecRecherche.has(x.id), aBien: o.crm.avecBien.has(x.id), typesActuels: typesDe(x),
    doublon: o.doublon, memeLot: o.memeLot, nomImmo: id.nomAffiche,
  });
  res.fait = 'complete';
  /* V3.77 : une fiche qui existe déjà n'est jamais archivée par l'import :
     elle sert peut-être ailleurs. Alexandre le décide sur sa fiche. */
  if (p.archiver && x.archive !== true) res.soucis.push('déjà dans ton CRM : sa fiche n’a pas été rangée dans « Archivés », fais-le depuis sa fiche si besoin');
  if (c.rien) return res;
  const patch: Record<string, unknown> = {};
  if (c.emails.length) patch.emails = [...(x.emails || []), ...c.emails];
  if (c.telephones.length) patch.telephones = [...(x.telephones || []), ...c.telephones];
  if (c.adresse) patch.adresse = c.adresse;
  /* Sans le SQL des types (colonne absente de la ligne lue), on n'y touche pas. */
  if (c.typesAjoutes.length && 'types' in x) patch.types = c.types;
  if (c.occupation) patch.statut_occupation = 'proprietaire';
  if (c.bienActuel) {
    const ba = p.bienActuel;
    Object.assign(patch, {
      bien_actuel_a_vendre: true, bien_actuel_type: ba.type, bien_actuel_surface: ba.surface,
      bien_actuel_valeur: ba.valeur, bien_actuel_adresse: ba.adresse, bien_actuel_notes: ba.notes,
    });
  }
  if (c.notes) patch.notes = c.notes;
  if (c.source && 'source' in x) { patch.source = c.source.k; patch.source_detail = c.source.detail || null; }
  if (Object.keys(patch).length) {
    /* Une modification qui DOIT toucher sa ligne : la base fermée refuse
       parfois sans erreur (AGENTS.md §3.2). */
    const maj = async (): Promise<string> => {
      try {
        const rep = await supabase.from('clients').update(patch).eq('id', x.id).select('id');
        if (rep.error) return rep.error.message;
        return (rep.data || []).length ? '' : 'aucune ligne n’a été modifiée. La session a peut-être expiré : recharge la page, puis recommence.';
      } catch (e) { return (e as Error)?.message || 'erreur inconnue'; }
    };
    let m = await maj();
    if (m && colonneSourceAbsente(m) && 'source' in patch) {
      delete patch.source; delete patch.source_detail;
      m = await maj();
      if (!m) res.soucis.push('sa source n’a pas été enregistrée : lance outils/sql/source-contact.sql dans Supabase');
    }
    if (m) { res.fait = null; res.echec = m; return res; }
    res.notes = 'notes' in patch;
  }

  if (c.recherche) {
    /* En marche seulement en « Actifs », pour une fiche déjà « Actif » : en
       « À qualifier », rien ne démarre tout seul. */
    const active = o.actif && x.statut === 'actif' && !p.force && (!p.tri || p.tri.sorte === 'relancer');
    for (const rech of p.recherches) {
      const e = await creerRecherche(x.id, id, rech, active);
      if (e) res.soucis.push(`sa recherche n’a pas été enregistrée (${e})`);
      else { res.recherches++; o.crm.avecRecherche.add(x.id); }
    }
  }
  const ok = await addJournal(x.id, 'contact', p.suivi.replace('Fiche reprise d’ImmoFacile', 'Fiche complétée depuis ImmoFacile'),
    `${c.proche ? `Depuis la fiche ImmoFacile de ${id.nomAffiche}. ` : ''}${c.lignes.length ? `Ajouté : ${c.lignes.join(', ')}.` : ''}`.trim() || undefined,
    { source: 'import_immofacile', lot: o.lot, complete: true });
  if (!ok) res.soucis.push('la ligne « Fiche complétée depuis ImmoFacile » de son Suivi n’a pas été écrite');
  res.historique = await ecrireHistorique(x.id, p, o.lot, res.soucis);

  if (c.aSuivre) {
    const proprio: ClientMini = {
      id: x.id, prenom: x.prenom || '', nom: x.nom || '', statut: x.statut || null, civilite: x.civilite || null, couple: !!x.couple,
      conjoint: x.conjoint, adresse: x.adresse || null, emails: x.emails || [], telephones: x.telephones || [], pro: x.pro,
    };
    const b = await creerASuivre(proprio, p, o.crm, res.soucis);
    res.bien = b.bien; res.rappel = b.rappel;
  }
  if (c.rappel && p.rappel) {
    res.rappel = await poserRappelVente(x.id, [x.prenom, x.nom].filter(Boolean).join(' '), p, res.soucis);
    res.relanceIF = res.rappel && (p.rappel.immofacile || !!p.rappel.tri);
  }
  return res;
}
