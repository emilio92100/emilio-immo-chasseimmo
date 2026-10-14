/* ═══ Le fil d'une offre, côté serveur (V3.189) ═════════════════════════════

   Ce que chaque étape d'une offre écrit autour d'elle — les relances, le
   bien, la transaction, les mails — et ce que l'espace du client en lit.
   Serveur uniquement (clé service). Voir src/lib/offres.ts pour le fil
   lui-même (états, mots, historique).

   ⚠️ N'importe pas src/lib/signature-documents.ts : c'est lui qui appelle
   ce fichier (classer → offreSigneeParTous).
   ════════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  lireSuivi, etatDeOffre, filDuBien, offreCourante, totalOffre, prixOffre, envoisOffre, finOffre, totalContre, contreDepassee,
  historiqueFil, visiblePourClient, rangVisible, brouillonCrmVivant, TETES_OFFRE, ENCOURS,
  type DocOffre, type SuiviOffre, type ReponseVendeur, type OffreEspace, type SaisieOffre,
} from './offres';
import { signatairesEspace, COLONNES_SIGNATAIRES, type LigneSignataire, type FicheEspace } from './documents-espace';
import { lirePersonnes, num, txt, type Donnees } from './actes/commun';
import { envoyerMail, echappe, ALERTES, CRM } from './mandat-serveur';
import { enveloppeMail, MAIL } from './mail-charte';
import { lienEspace } from './jeton';
import { alerteMailActive } from './alertes';

const EUR = (x: number) => `${Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} €`;
const jourParis = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);
const JOUR = (iso: string) => {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }) : '';
};
const COLONNES_DOC = 'id, modele, statut, donnees, created_at, signe_le, envois, signature, bien_id, client_id, recherche_id, titre';

/* ── Lire ── */

export async function lireOffre(sb: SupabaseClient, id: string): Promise<DocOffre | null> {
  const { data, error } = await sb.from('documents').select(COLONNES_DOC).eq('id', id).eq('modele', 'offre_achat').maybeSingle();
  if (error) throw new Error('L’offre n’a pas pu être lue : ' + error.message);
  return (data as DocOffre | null) || null;
}
/** Le fil de ce client sur ce bien. */
export async function lireFil(sb: SupabaseClient, clientId: string, bienId: string): Promise<DocOffre[]> {
  const { data, error } = await sb.from('documents').select(COLONNES_DOC)
    .eq('modele', 'offre_achat').eq('client_id', clientId).eq('bien_id', bienId).neq('statut', 'annule');
  if (error) throw new Error('Les offres de ce bien n’ont pas pu être lues : ' + error.message);
  return filDuBien((data || []) as DocOffre[], bienId);
}
async function titreDuBien(sb: SupabaseClient, bienId: string | null | undefined): Promise<string> {
  if (!bienId) return 'un bien';
  const { data } = await sb.from('biens').select('titre, ville, type_bien').eq('id', bienId).maybeSingle();
  const b = data as { titre?: string | null; ville?: string | null; type_bien?: string | null } | null;
  return b?.titre || [b?.type_bien, b?.ville].filter(Boolean).join(' — ') || 'un bien';
}

/* ── Écrire le suivi ──
   Lu puis réécrit, seulement `donnees.suivi` : le texte de l'offre ne
   bouge pas, et `updated_at` (quand le texte a changé) non plus. */
export async function majSuivi(sb: SupabaseClient, id: string, fn: (s: SuiviOffre) => SuiviOffre): Promise<string | null> {
  const { data, error } = await sb.from('documents').select('donnees').eq('id', id).maybeSingle();
  if (error || !data) return error?.message || 'offre introuvable';
  const d = ((data as { donnees?: Donnees | null }).donnees || {}) as Donnees;
  const brut = d.suivi && typeof d.suivi === 'object' ? d.suivi as Record<string, unknown> : {};
  const suivi = { ...brut, ...fn(lireSuivi(d)) };
  const { error: e2 } = await sb.from('documents').update({ donnees: { ...d, suivi } }).eq('id', id);
  return e2 ? e2.message : null;
}

/* ── Les relances ──
   Reconnues à leur début (TETES_OFFRE) et au titre du bien : une seule
   ouverte à la fois pour un même geste sur un même bien. */
const echappeLike = (t: string) => t.replace(/[\\%_]/g, c => '\\' + c);
export async function solderRelancesOffre(sb: SupabaseClient, clientId: string | null | undefined, titre: string, tetes: string[]): Promise<string | null> {
  if (!clientId) return null;
  for (const tete of tetes) {
    const { error } = await sb.from('relances').update({ statut: 'cloturee' })
      .eq('client_id', clientId).eq('statut', 'en_attente').ilike('note', `${tete} — ${echappeLike(titre)}%`);
    if (error) return error.message;
  }
  return null;
}
async function poserRelanceOffre(sb: SupabaseClient, o: { clientId: string; rechercheId: string | null; tete: string; titre: string; detail?: string; echeance?: Date }): Promise<string | null> {
  const pb = await solderRelancesOffre(sb, o.clientId, o.titre, [o.tete]);
  if (pb) return pb;
  const { error } = await sb.from('relances').insert({
    client_id: o.clientId, recherche_id: o.rechercheId, type: 'rappel_client', statut: 'en_attente',
    date_echeance: (o.echeance || new Date()).toISOString(),
    note: `${o.tete} — ${o.titre}${o.detail ? ` · ${o.detail}` : ''}`.slice(0, 600),
  });
  return error ? error.message : null;
}
/* Les relances « Veut faire une offre — <bien> » nées de son avis après la
   visite : l'offre est là (comme solderRelancesRetourVisite côté CRM). */
async function solderVeutOffrir(sb: SupabaseClient, clientId: string, titre: string): Promise<string | null> {
  const { error } = await sb.from('relances').update({ statut: 'cloturee' })
    .eq('client_id', clientId).eq('type', 'rappel_client').eq('statut', 'en_attente').ilike('note', `Veut faire une offre — ${echappeLike(titre)}%`);
  return error ? error.message : null;
}

async function journal(sb: SupabaseClient, l: { client_id: string; recherche_id?: string | null; bien_id?: string | null; type: string; titre: string; description?: string | null; metadata?: Record<string, unknown> }) {
  const { error } = await sb.from('journal').insert(l);
  if (!error) return;
  /* Un type que la base refuse (liste fermée) : gardé sous « statut_change ». */
  if ((error as { code?: string }).code === '23514' && l.type !== 'statut_change') {
    const { error: e2 } = await sb.from('journal').insert({ ...l, type: 'statut_change', metadata: { ...(l.metadata || {}), type_voulu: l.type } });
    if (e2) console.error('[offres] journal', e2.message);
    return;
  }
  console.error('[offres] journal', error.message);
}

/* Le bien dans Présentés : « Offre faite » tant qu'une offre court, et de
   nouveau « Visité » quand elle s'arrête sans accord. */
async function badgeBien(sb: SupabaseClient, bienId: string | null | undefined, badge: 'offre_faite' | 'visite') {
  if (!bienId) return;
  const q = sb.from('biens').update({ badge_retour: badge }).eq('id', bienId);
  const { error } = badge === 'visite' ? await q.eq('badge_retour', 'offre_faite') : await q;
  if (error) console.error('[offres] badge du bien', error.message);
}

/* ── Les étapes ── */

/** L'offre part en signature (lancée du CRM) : elle prend la suite de la
    précédente, et « Offre à relire » a sa réponse. */
export async function offrePartieEnSignature(sb: SupabaseClient, doc: { id: string; donnees: Donnees | null; client_id: string | null; bien_id: string | null }): Promise<string | null> {
  const s = lireSuivi(doc.donnees);
  const pbs: string[] = [];
  if (s.precedente) {
    const pb = await majSuivi(sb, s.precedente, x => (x.remplacee_le ? x : { ...x, remplacee_le: new Date().toISOString() }));
    if (pb) pbs.push('l’offre précédente : ' + pb);
  }
  const titre = await titreDuBien(sb, doc.bien_id);
  const pb = await solderRelancesOffre(sb, doc.client_id, titre, [TETES_OFFRE.relire, TETES_OFFRE.contre]);
  if (pb) pbs.push('relances : ' + pb);
  return pbs.length ? pbs.join(' ; ') : null;
}

/** Signée par tous (appelé par classer) : la relance « à envoyer », le bien
    passe « Offre faite », la précédente est remplacée. */
export async function offreSigneeParTous(sb: SupabaseClient, doc: { id: string; donnees: Donnees | null; client_id: string | null; recherche_id: string | null; bien_id: string | null }): Promise<string | null> {
  if (!doc.client_id) return null;
  const pbs: string[] = [];
  const s = lireSuivi(doc.donnees);
  /* Close (sans suite) ou remplacée entre-temps : elle ne repart pas. */
  if (s.close || s.remplacee_le) return null;
  if (s.precedente) {
    const pb = await majSuivi(sb, s.precedente, x => (x.remplacee_le ? x : { ...x, remplacee_le: new Date().toISOString() }));
    if (pb) pbs.push('l’offre précédente : ' + pb);
  }
  const titre = await titreDuBien(sb, doc.bien_id);
  const total = totalOffre(doc.donnees);
  const pb1 = await solderRelancesOffre(sb, doc.client_id, titre, [TETES_OFFRE.relire, TETES_OFFRE.contre]);
  if (pb1) pbs.push(pb1);
  const pb2 = await poserRelanceOffre(sb, {
    clientId: doc.client_id, rechercheId: doc.recherche_id, tete: TETES_OFFRE.envoyer, titre,
    detail: total ? `${EUR(total)} frais d’agence compris${prixOffre(doc.donnees) !== total ? ` (${EUR(prixOffre(doc.donnees) || 0)} pour le vendeur)` : ''}` : undefined,
  });
  if (pb2) pbs.push('relance « à envoyer » : ' + pb2);
  const pb3 = await solderVeutOffrir(sb, doc.client_id, titre);
  if (pb3) pbs.push(pb3);
  await badgeBien(sb, doc.bien_id, 'offre_faite');
  /* Le mail « Signé par tous » (alerte document_signe, signature-documents.ts)
     prévient déjà Alexandre, le PDF joint : pas de second mail ici. */
  return pbs.length ? pbs.join(' ; ') : null;
}

/** Envoyée à l'agence : « à envoyer » a sa réponse ; une relance pour la
    veille de la fin de validité (« relancer l'agence »). */
export async function offreEnvoyee(sb: SupabaseClient, doc: { id: string; donnees: Donnees | null; client_id: string | null; recherche_id: string | null; bien_id: string | null }): Promise<string | null> {
  if (!doc.client_id) return null;
  const pbs: string[] = [];
  const titre = await titreDuBien(sb, doc.bien_id);
  const pb = await solderRelancesOffre(sb, doc.client_id, titre, [TETES_OFFRE.envoyer]);
  if (pb) pbs.push(pb);
  const fin = finOffre(doc.donnees);
  const s = lireSuivi(doc.donnees);
  if (fin && !s.reponse) {
    /* La veille au matin ; pour une offre qui finit demain ou avant : maintenant. */
    const veille = new Date(fin.getTime() - 86_400_000);
    veille.setUTCHours(7, 0, 0, 0);
    const pb2 = await poserRelanceOffre(sb, {
      clientId: doc.client_id, rechercheId: doc.recherche_id, tete: TETES_OFFRE.reponse, titre,
      detail: `valable jusqu’au ${JOUR(fin.toISOString())} : relancer l’agence si elle n’a pas répondu`,
      echeance: veille.getTime() > Date.now() ? veille : new Date(),
    });
    if (pb2) pbs.push(pb2);
  }
  await badgeBien(sb, doc.bien_id, 'offre_faite');
  return pbs.length ? pbs.join(' ; ') : null;
}

/* ── La réponse du vendeur (notée par Alexandre) ── */

export async function noterReponse(sb: SupabaseClient, doc: DocOffre, r: ReponseVendeur): Promise<{ avertissements: string[] }> {
  const avertissements: string[] = [];
  const pb = await majSuivi(sb, doc.id, s => ({ ...s, reponse: r, close: null }));
  if (pb) throw new Error('La réponse n’a pas pu être enregistrée : ' + pb);
  const d = doc.donnees || {};
  const titre = await titreDuBien(sb, doc.bien_id);
  const total = totalOffre(d), prix = prixOffre(d);
  if (doc.client_id) {
    const pbR = await solderRelancesOffre(sb, doc.client_id, titre, [TETES_OFFRE.reponse, TETES_OFFRE.envoyer, TETES_OFFRE.contre]);
    if (pbR) avertissements.push('relances : ' + pbR);
    if (r.statut === 'contre' && r.montant) {
      /* Elle doit répondre : un œil dessus dans deux jours (ou à sa date limite). */
      const dans2 = new Date(Date.now() + 2 * 86_400_000); dans2.setUTCHours(7, 0, 0, 0);
      const limite = r.limite ? new Date(`${r.limite}T07:00:00Z`) : null;
      const pbC = await poserRelanceOffre(sb, {
        clientId: doc.client_id, rechercheId: doc.recherche_id || null, tete: TETES_OFFRE.contre, titre,
        detail: `le vendeur propose ${EUR(r.montant)}, soit ${EUR(totalContre(d, r.montant))} pour elle : sa réponse ?`,
        echeance: limite && limite.getTime() < dans2.getTime() ? (limite.getTime() > Date.now() ? limite : new Date()) : dans2,
      });
      if (pbC) avertissements.push('relance : ' + pbC);
    }
    const ligne = r.statut === 'contre' && r.montant
      ? { titre: `↩️ Contre-proposition du vendeur — ${titre}`, description: `${EUR(r.montant)} pour le vendeur, soit ${EUR(totalContre(d, r.montant))} pour le client, frais d’agence compris${r.limite ? ` · valable jusqu’au ${JOUR(r.limite)}` : ''}${r.note ? `\n${r.note}` : ''}` }
      : r.statut === 'acceptee'
        ? { titre: `🤝 Offre acceptée — ${titre}`, description: `${total ? `${EUR(total)} frais d’agence compris` : ''}${prix && prix !== total ? ` · ${EUR(prix)} pour le vendeur` : ''}${r.note ? `\n${r.note}` : ''}` }
        : { titre: `✕ Offre refusée par le vendeur — ${titre}`, description: r.note || null };
    await journal(sb, { client_id: doc.client_id, recherche_id: doc.recherche_id, bien_id: doc.bien_id, type: 'offre_faite', ...ligne, metadata: { document_id: doc.id, reponse: r.statut } });
  }
  if (r.statut === 'refusee') await badgeBien(sb, doc.bien_id, 'visite');
  if (r.statut === 'acceptee') {
    const pbT = await transactionDepuisOffre(sb, { ...doc, donnees: d });
    if (pbT) avertissements.push(pbT);
  }
  const pbM = await mailClientReponse(sb, { ...doc, donnees: d }, r, titre);
  if (pbM) avertissements.push(pbM);
  return { avertissements };
}

/** « Sans suite » : dit par le client depuis son espace, ou par Alexandre. */
export async function fermerSansSuite(sb: SupabaseClient, doc: DocOffre, par: 'client' | 'conseiller'): Promise<string | null> {
  const pb = await majSuivi(sb, doc.id, s => ({ ...s, close: { le: new Date().toISOString(), par } }));
  if (pb) return pb;
  const titre = await titreDuBien(sb, doc.bien_id);
  if (doc.client_id) {
    await solderRelancesOffre(sb, doc.client_id, titre, Object.values(TETES_OFFRE));
    await journal(sb, {
      client_id: doc.client_id, recherche_id: doc.recherche_id, bien_id: doc.bien_id, type: 'offre_faite',
      titre: `⏹️ Offre sans suite — ${titre}`,
      description: par === 'client' ? 'Le client ne donne pas suite, depuis son espace.' : 'Noté depuis le CRM.',
      metadata: { document_id: doc.id, sans_suite: par },
    });
  }
  await badgeBien(sb, doc.bien_id, 'visite');
  if (par === 'client' && doc.client_id && await alerteMailActive(sb, 'offre_espace')) {
    const nom = await nomClient(sb, doc.client_id);
    const lien = `${CRM()}/?page=fiche&client=${encodeURIComponent(doc.client_id)}`;
    const e = await envoyerMail({
      a: ALERTES(), deLaPartDe: 'crm', sujet: `⏹️ ${nom} ne donne pas suite à son offre · ${titre}`,
      texte: `${nom} ne donne pas suite à son offre pour « ${titre} », depuis son espace.\n\nOuvrir sa fiche : ${lien}`,
      html: enveloppeMail({ titre: `${echappe(nom)} ne donne pas suite`, mention: 'CRM', corps: `<p style="margin:0 0 14px">${echappe(nom)} ne donne pas suite à son offre pour « ${echappe(titre)} », depuis son espace.</p>${boutonMail(lien, 'Ouvrir sa fiche')}` }),
    });
    if (e) console.error('[offres] alerte sans suite', e);
  }
  return null;
}

async function nomClient(sb: SupabaseClient, clientId: string): Promise<string> {
  const { data } = await sb.from('clients').select('prenom, nom').eq('id', clientId).maybeSingle();
  const c = data as { prenom?: string | null; nom?: string | null } | null;
  return `${c?.prenom || ''} ${c?.nom || ''}`.trim() || 'Le client';
}

/* ── La transaction, quand le vendeur accepte ──
   Alexandre : « s'il est accepté, l'onglet Transaction s'ouvre tout seul ».
   À l'étape « Offre acceptée », avec la 1re offre, les contre-offres de
   chaque côté (prix pour le vendeur) et le prix arrêté. Une transaction
   déjà ouverte sur ce bien (créée à la main) est complétée ; ouverte sur
   un AUTRE bien de la même recherche, on n'y touche pas (on le dit). */
export async function transactionDepuisOffre(sb: SupabaseClient, doc: DocOffre): Promise<string | null> {
  if (!doc.client_id || !doc.recherche_id || !doc.bien_id) return null;
  let fil: DocOffre[];
  try { fil = await lireFil(sb, doc.client_id, doc.bien_id); } catch (e) { return (e as Error).message; }
  const pas: { partie: 'acheteur' | 'vendeur'; montant: number; date: string }[] = [];
  for (const x of fil) {
    const e = etatDeOffre(x);
    if (e === 'brouillon' || e === 'a_relire' || e === 'a_finaliser') continue;
    const p = prixOffre(x.donnees);
    if (p) pas.push({ partie: 'acheteur', montant: p, date: (x.signe_le || x.created_at).slice(0, 10) });
    const r = lireSuivi(x.donnees).reponse;
    if (r?.statut === 'contre' && r.montant) pas.push({ partie: 'vendeur', montant: r.montant, date: r.le.slice(0, 10) });
  }
  const prixFinal = prixOffre(doc.donnees);
  const premiere = pas[0];
  const { data: txs, error } = await sb.from('transactions').select('id, bien_id, etape_actuelle, offre_montant, offre_date, contre_offres').eq('recherche_id', doc.recherche_id);
  if (error) return 'la transaction n’a pas pu être lue : ' + error.message;
  const ouvertes = ((txs || []) as { id: string; bien_id: string | null; etape_actuelle: string | null; offre_montant: unknown; offre_date: unknown; contre_offres: unknown }[])
    .filter(t => t.etape_actuelle !== 'finalise');
  const autre = ouvertes.find(t => t.bien_id && t.bien_id !== doc.bien_id);
  if (autre) return 'une transaction est déjà ouverte sur un autre bien de cette recherche : l’onglet Transaction n’a pas été rempli';
  const titre = await titreDuBien(sb, doc.bien_id);
  const meme = ouvertes.find(t => t.bien_id === doc.bien_id) || ouvertes.find(t => !t.bien_id);
  if (meme) {
    const maj: Record<string, unknown> = { bien_id: doc.bien_id, prix_final: prixFinal };
    if (!meme.etape_actuelle || meme.etape_actuelle === 'offre' || meme.etape_actuelle === 'negociation') maj.etape_actuelle = 'offre_acceptee';
    if (!meme.offre_montant && premiere) { maj.offre_montant = premiere.montant; maj.offre_date = premiere.date; }
    if (!(Array.isArray(meme.contre_offres) && meme.contre_offres.length) && pas.length > 1) maj.contre_offres = pas.slice(1);
    const { error: e2 } = await sb.from('transactions').update(maj).eq('id', meme.id);
    if (e2) return 'la transaction : ' + e2.message;
  } else {
    const ligne = {
      client_id: doc.client_id, recherche_id: doc.recherche_id, bien_id: doc.bien_id, etape_actuelle: 'offre_acceptee',
      prix_final: prixFinal, offre_montant: premiere?.montant ?? null, offre_date: premiere?.date ?? null, contre_offres: pas.slice(1),
    };
    let { error: e3 } = await sb.from('transactions').insert(ligne);
    /* Une colonne inconnue (base plus ancienne) : l'essentiel d'abord. */
    if (e3 && /column|schema cache/i.test(e3.message)) {
      ({ error: e3 } = await sb.from('transactions').insert({ client_id: doc.client_id, recherche_id: doc.recherche_id, bien_id: doc.bien_id, etape_actuelle: 'offre_acceptee' }));
    }
    if (e3) return 'la transaction : ' + e3.message;
    await journal(sb, { client_id: doc.client_id, recherche_id: doc.recherche_id, bien_id: doc.bien_id, type: 'offre_faite', titre: `💼 Transaction ouverte — ${titre}`, description: 'Ouverte toute seule à l’acceptation de son offre, à l’étape « Offre acceptée ».', metadata: { document_id: doc.id } });
  }
  return null;
}

/* ── Le mail au client quand le vendeur répond ──
   Un seul mail par réponse (Alexandre : « pas 40 mails »). Au nom
   d'Alexandre, des mots simples ; l'acceptation, en fête. */
function boutonMail(lien: string, texte: string) {
  return `<a href="${echappe(lien)}" style="display:inline-block;margin-top:6px;background:${MAIL.or};color:#13243D;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:800">${echappe(texte)}</a>`;
}
async function mailClientReponse(sb: SupabaseClient, doc: DocOffre, r: ReponseVendeur, titre: string): Promise<string | null> {
  if (!doc.client_id) return null;
  const { data: c } = await sb.from('clients').select('prenom, emails, token_espace').eq('id', doc.client_id).maybeSingle();
  const cl = c as { prenom?: string | null; emails?: string[] | null; token_espace?: string | null } | null;
  const a = (cl?.emails || []).find(e => /@/.test(String(e || '')));
  if (!a) return 'le client n’a pas d’adresse e-mail : il n’a pas été prévenu par mail';
  const d = doc.donnees || {};
  const base = lienEspace(cl?.token_espace || null, process.env.NEXT_PUBLIC_SITE_URL || 'https://emilio-immo-chasseimmo.vercel.app');
  const lien = base ? `${base}${base.includes('?') ? '&' : '?'}${doc.recherche_id ? `r=${encodeURIComponent(doc.recherche_id)}&` : ''}bien=${encodeURIComponent(doc.bien_id || '')}` : '';
  const prenom = (cl?.prenom || '').trim();
  const bonjour = `Bonjour${prenom ? ` ${prenom}` : ''},`;
  const total = totalOffre(d);
  let sujet = '', titreMail = '', paras: string[] = [], bouton = 'Ouvrir mon espace';
  if (r.statut === 'contre' && r.montant) {
    const tc = totalContre(d, r.montant);
    sujet = 'Le vendeur a répondu à votre offre';
    titreMail = 'Le vendeur a répondu à votre offre';
    paras = [
      bonjour,
      `Le vendeur a répondu à votre offre pour « ${titre} » : il propose ${EUR(tc)}, frais d’agence compris${r.limite ? `, jusqu’au ${JOUR(r.limite)}` : ''}.`,
      'Depuis votre espace, vous pouvez accepter, faire une nouvelle offre ou ne pas donner suite. Je reste disponible si vous voulez en parler.',
    ];
    bouton = 'Voir la réponse du vendeur';
  } else if (r.statut === 'acceptee') {
    sujet = '🎉 Félicitations, votre offre est acceptée !';
    titreMail = '🎉 Félicitations, votre offre est acceptée !';
    paras = [
      `${bonjour.replace(/,$/, '')}, félicitations !`,
      `Le vendeur a accepté votre offre${total ? ` de ${EUR(total)}, frais d’agence compris,` : ''} pour « ${titre} ». C’est une très belle nouvelle.`,
      'Je vous appelle très vite pour organiser la suite, à commencer par le compromis chez le notaire.',
    ];
  } else {
    sujet = 'Réponse du vendeur à votre offre';
    titreMail = 'Réponse du vendeur à votre offre';
    paras = [
      bonjour,
      `Le vendeur n’a pas retenu votre offre pour « ${titre} ».`,
      'Si vous le souhaitez, vous pouvez en faire une nouvelle depuis votre espace, ou on en parle ensemble. La recherche continue de toute façon.',
    ];
  }
  const signature = 'Alexandre Rogelet — Emilio Immobilier';
  const texte = `${paras.join('\n\n')}${lien ? `\n\n${bouton} : ${lien}` : ''}\n\n${signature}`;
  const corps = `${paras.map(p => `<p style="margin:0 0 14px">${echappe(p)}</p>`).join('')}${lien ? boutonMail(lien, bouton) : ''}<p style="margin:18px 0 0">${echappe(signature)}</p>`;
  const e = await envoyerMail({ a, nomA: prenom || undefined, sujet, texte, html: enveloppeMail({ titre: echappe(titreMail), corps }) });
  return e ? `le mail au client n’est pas parti (${e})` : null;
}

/* ── L'alerte à Alexandre : une offre à relire ── */
export async function alerteOffreARelire(sb: SupabaseClient, doc: { id: string; client_id: string; bien_id: string | null; donnees: Donnees }, titre: string, il = 'Il'): Promise<void> {
  if (!(await alerteMailActive(sb, 'offre_espace'))) return;
  const nom = await nomClient(sb, doc.client_id);
  const total = totalOffre(doc.donnees);
  const lien = `${CRM()}/?page=fiche&client=${encodeURIComponent(doc.client_id)}`;
  const quoi = total ? `${EUR(total)} frais d’agence compris` : 'son offre';
  const e = await envoyerMail({
    a: ALERTES(), deLaPartDe: 'crm',
    sujet: `💶 ${nom} a préparé une offre à relire · ${total ? EUR(total) : titre}`,
    texte: `${nom} a préparé son offre depuis son espace pour « ${titre} » : ${quoi}. ${il} te la confie pour relecture.\n\nRelis-la dans Documents, puis envoie-la pour signature.\n\nOuvrir sa fiche : ${lien}`,
    html: enveloppeMail({
      titre: `💶 ${echappe(nom)} a préparé une offre à relire`, mention: 'CRM',
      corps: `<p style="margin:0 0 10px">Depuis son espace, pour « ${echappe(titre)} » :</p><p style="margin:0 0 14px;font-size:17px;font-weight:800;color:#13243D">${echappe(quoi)}</p><p style="margin:0 0 14px">Relis-la dans Documents, puis envoie-la pour signature. Une relance t’attend en tête de tes Relances.</p>${boutonMail(lien, 'Ouvrir sa fiche')}`,
    }),
  });
  if (e) console.error('[offres] alerte à relire', e);
}

/* ── Ce que l'espace du client lit ── */


function saisieDe(d: Donnees | null | undefined): SaisieOffre | null {
  if (!d) return null;
  const pers = lirePersonnes(d.acquereurs).map(p => ({
    civilite: p.civilite, prenom: p.prenom, nom: p.nom, naissanceDate: p.naissanceDate, naissanceLieu: p.naissanceLieu,
    adresse: p.adresse, email: p.email, telephone: p.telephone,
  }));
  return {
    acquereurs: pers, apport: num(d, 'apport'), pret: d.pret === 'oui' ? 'oui' : d.pret === 'non' ? 'non' : null,
    pretMontant: num(d, 'pretMontant'), pretDuree: num(d, 'pretDuree'), pretTaux: num(d, 'pretTaux'),
    conditions: Array.isArray(d.conditions) ? (d.conditions as unknown[]).map(String) : [],
    venteBien: txt(d, 'venteBien'), conditionAutre: txt(d, 'conditionAutre'), notaire: txt(d, 'notaire'),
  };
}

/** Bien par bien, l'offre du moment telle que l'espace la montre. Ne lève jamais. */
export async function offresPourEspace(sb: SupabaseClient, clientId: string, bienIds: string[], fiche: FicheEspace | null | undefined): Promise<Record<string, OffreEspace>> {
  const out: Record<string, OffreEspace> = {};
  if (!bienIds.length) return out;
  try {
    const { data, error } = await sb.from('documents').select(COLONNES_DOC)
      .eq('modele', 'offre_achat').eq('client_id', clientId).in('bien_id', bienIds.slice(0, 300)).neq('statut', 'annule');
    if (error || !data?.length) return out;
    const docs = data as DocOffre[];
    const enSignature = docs.filter(x => x.statut === 'pret' && x.signature).map(x => x.id);
    let lignes: LigneSignataire[] = [];
    if (enSignature.length) {
      const { data: l, error: eL } = await sb.from('documents_signataires').select(COLONNES_SIGNATAIRES).in('document_id', enSignature);
      if (!eL && l) lignes = l as LigneSignataire[];
    }
    const maintenant = Date.now();
    for (const bienId of bienIds) {
      const fil = filDuBien(docs, bienId);
      if (!fil.length) continue;
      const visibles = fil.filter(visiblePourClient);
      const courant = offreCourante(visibles, maintenant);
      if (!courant) continue;
      /* Une offre plus récente se prépare chez son conseiller (pas encore partie en signature). */
      const enPreparation = fil.some(x => x.created_at > courant.created_at && !visiblePourClient(x) && brouillonCrmVivant(x, maintenant));
      const d = courant.donnees || {};
      const s = lireSuivi(d);
      const etat = etatDeOffre(courant, maintenant);
      const sigs = courant.statut === 'pret' && courant.signature ? signatairesEspace(lignes.filter(l => l.document_id === courant.id), fiche) : [];
      const moi = sigs.find(x => x.qui === 'vous');
      const fin = finOffre(d);
      const env = envoisOffre(courant);
      const r = s.reponse;
      out[bienId] = {
        id: courant.id, etat, enPreparation, rang: rangVisible(fil, courant) || 1,
        total: totalOffre(d), prix: prixOffre(d), prixAffiche: num(d, 'prixAffiche'),
        fin: fin ? fin.toISOString() : null, envoyeLe: env.length ? env[env.length - 1].le : null,
        lien: moi && moi.etat === 'a_signer' ? moi.lien : null,
        vousSigne: moi?.etat === 'signe', attendus: sigs.filter(x => x.qui !== 'vous' && x.etat !== 'signe').map(x => x.prenom || x.nom).filter(Boolean),
        contre: r?.statut === 'contre' && r.montant ? { prix: r.montant, total: totalContre(d, r.montant), limite: r.limite || null, depassee: contreDepassee(r, maintenant), le: r.le } : null,
        reponseLe: r?.le || null,
        historique: historiqueFil(visibles, { client: true, maintenant }),
        saisie: saisieDe(d),
      };
    }
  } catch (e) {
    console.error('[offres] espace', e instanceof Error ? e.message : e);
  }
  return out;
}

export { ENCOURS };
