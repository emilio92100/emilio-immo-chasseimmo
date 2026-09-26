/**
 * Le point automatique — « Où en est votre recherche ? »
 *
 * Quand un dossier actif ne bouge plus depuis un certain temps (45 jours par
 * défaut), un mail part tout seul au client. Il lui rappelle sa recherche et
 * lui propose quatre réponses : je cherche toujours, mes critères ont changé,
 * j'ai trouvé, j'ai mis en pause ou arrêté. Chaque bouton ouvre son espace
 * sur la bonne fenêtre, et sa réponse arrive dans le CRM comme n'importe
 * quelle réaction du client.
 *
 * Ce fichier ne dépend ni du navigateur ni du serveur : on lui passe un
 * client Supabase. La route d'envoi quotidienne (/api/point-auto/envoi) et
 * celle du CRM (/api/point-auto) s'en servent toutes les deux, pour que
 * « qui recevrait le mail » et « qui le reçoit » soient calculés pareil.
 *
 * ── Ce qui compte comme un mouvement ──
 *   ✓ tout ce qui s'écrit dans le suivi du client (journal) : un appel, une
 *     note, un mail, un changement de critères, un bien ajouté, une visite,
 *     un changement de statut… et les réactions du client lui-même (avis
 *     sur un bien, message, demande de rappel, réponse à ce mail) ;
 *   ✓ un bien envoyé (biens.envoye_le) et l'avis du client sur un bien
 *     (biens.retour_le) ;
 *   ✗ le client qui ouvre simplement son espace : ça s'écrit dans
 *     espace_evenements, pas dans le journal — et c'est voulu. Quelqu'un qui
 *     ouvre son espace et n'y trouve rien doit quand même recevoir le mail.
 *   ✗ le mail automatique lui-même (type « point_auto »), sinon il se
 *     remettrait à zéro tout seul.
 *
 * ── Quand le mail part ──
 *   Échéance = la plus récente de ces trois dates + le délai :
 *   dernier mouvement, dernier mail automatique, création du dossier.
 *   Donc : un mail 45 jours après le dernier mouvement ; sans réponse, le
 *   suivant 45 jours plus tard ; au moindre mouvement, le compteur repart.
 *
 * ── Les réglages (table `parametres`, couples clé / valeur) ──
 *   point_auto_actif   'oui' | 'non'   — 'non' tant qu'Alexandre ne l'a pas allumé
 *   point_auto_delai   '30' | '45' | '60'
 *   point_auto_exclus  liste JSON d'identifiants de clients à ne jamais relancer
 *   Rien de nouveau dans la base : aucune migration à lancer.
 */

import { lienEspace } from '@/lib/jeton';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Base = any;

export const CLE_ACTIF = 'point_auto_actif';
export const CLE_DELAI = 'point_auto_delai';
export const CLE_EXCLUS = 'point_auto_exclus';

export const DELAIS = [30, 45, 60] as const;
export const DELAI_DEFAUT = 45;

/** Le mail envoyé : écrit dans le journal, il ne compte pas comme un mouvement. */
export const TYPE_ENVOI = 'point_auto';
/** « Je cherche toujours » : une réaction du client, elle compte. */
export const TYPE_REPONSE = 'point_auto_reponse';

/** Les réponses du client qui disent qu'il a réagi à un mail automatique. */
const TYPES_REACTION = [
  TYPE_REPONSE, 'retour_client', 'message_client', 'demande_rappel',
  'criteres_modifies', 'fin_recherche', 'partage_client',
];

/** Au-delà, on s'arrête pour la journée : un réglage raté ne doit pas écrire à toute la base. */
export const PLAFOND_PAR_JOUR = 30;

export type Reglages = { actif: boolean; delai: number; exclus: string[] };

export function reglagesDepuis(lignes: { cle: string; valeur: string | null }[] | null | undefined): Reglages {
  const p: Record<string, string> = {};
  (lignes || []).forEach((l) => { p[l.cle] = l.valeur || ''; });
  const d = parseInt(p[CLE_DELAI] || '', 10);
  let exclus: string[] = [];
  try {
    const brut = JSON.parse(p[CLE_EXCLUS] || '[]');
    if (Array.isArray(brut)) exclus = brut.filter((x) => typeof x === 'string');
  } catch { exclus = []; }
  return {
    actif: p[CLE_ACTIF] === 'oui',
    delai: (DELAIS as readonly number[]).includes(d) ? d : DELAI_DEFAUT,
    exclus,
  };
}

export async function lireReglages(sb: Base): Promise<Reglages> {
  const { data, error } = await sb.from('parametres').select('cle, valeur')
    .in('cle', [CLE_ACTIF, CLE_DELAI, CLE_EXCLUS]);
  if (error) throw new Error('Lecture des réglages impossible : ' + error.message);
  return reglagesDepuis(data);
}

/** La date à partir de laquelle le mail part, si rien ne bouge d'ici là. */
export function echeance(o: { dernierMouvement?: string | null; dernierEnvoi?: string | null; creeLe?: string | null; delai: number }): Date {
  const t = [o.dernierMouvement, o.dernierEnvoi, o.creeLe]
    .filter(Boolean)
    .map((x) => new Date(String(x)).getTime())
    .filter((x) => !Number.isNaN(x));
  const ref = t.length ? Math.max(...t) : Date.now();
  return new Date(ref + o.delai * 86_400_000);
}

const plusRecent = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : (new Date(a) > new Date(b) ? a : b);

export type Envoi = { le: string; reponse: string | null; reponduLe: string | null };

export type Candidat = {
  clientId: string;
  prenom: string;
  nom: string;
  email: string | null;
  statut: string;
  revente: boolean;
  tokenClient: string | null;
  recherche: any | null;
  dernierMouvement: string | null;
  dernierEnvoi: string | null;
  echeance: string;
  /** Rien ne bloque et l'échéance est passée : le mail partira au prochain envoi. */
  du: boolean;
  /** Pourquoi le mail ne part pas pour ce client (vide s'il peut partir). */
  empechement: string | null;
  /** Alexandre a choisi de ne jamais lui envoyer ce mail. */
  exclu: boolean;
  historique: Envoi[];
};

/* Ce que le client a répondu après un envoi : sa première réaction dans les
   trente jours qui suivent. Au-delà, ce n'est plus une réponse au mail. */
function libelleReaction(type: string, titre: string): string {
  if (type === TYPE_REPONSE) return '« Je cherche toujours »';
  if (type === 'criteres_modifies') return 'critères modifiés';
  if (type === 'demande_rappel') return 'demande de rappel';
  if (type === 'message_client') return 'message';
  if (type === 'retour_client') return 'avis sur un bien';
  if (type === 'fin_recherche') {
    if (/trouvé son bien avec nous/.test(titre)) return '« J’ai trouvé, grâce à vous »';
    if (/trouvé son bien/.test(titre)) return '« J’ai trouvé par un autre biais »';
    if (/pause/.test(titre)) return '« Je mets ma recherche en pause »';
    if (/arrête/.test(titre)) return '« J’arrête ma recherche »';
    return 'fin de recherche';
  }
  if (type === 'partage_client') return 'a partagé un bien';
  return 'réaction';
}

/**
 * Pour chaque client visé : son dernier mouvement, son dernier mail, la date
 * du prochain, et ce qui empêcherait l'envoi.
 *
 * Sans `clientId`, on prend tous les dossiers actifs (c'est ce que fait
 * l'envoi quotidien). Avec, on calcule pour ce seul client, quel que soit
 * son statut — c'est ce qu'affiche sa fiche.
 */
export async function calculerCandidats(sb: Base, reglages: Reglages, opts: { clientId?: string; maintenant?: Date } = {}): Promise<Candidat[]> {
  const maintenant = opts.maintenant || new Date();

  let q = sb.from('clients')
    .select('id, prenom, nom, emails, statut, created_at, statut_occupation, bien_actuel_a_vendre, token_espace');
  q = opts.clientId ? q.eq('id', opts.clientId) : q.eq('statut', 'actif');
  const { data: clients, error } = await q;
  if (error) throw new Error('Lecture des clients impossible : ' + error.message);
  if (!clients?.length) return [];

  const ids = clients.map((c: any) => c.id);
  const { data: recherches, error: errR } = await sb.from('recherches').select('*')
    .in('client_id', ids).order('created_at', { ascending: true });
  if (errR) throw new Error('Lecture des recherches impossible : ' + errR.message);

  const sortie: Candidat[] = [];
  for (const c of clients as any[]) {
    /* Une requête par client plutôt qu'une grande : le journal d'une agence
       dépasse vite le millier de lignes que Supabase rend d'un coup. */
    const [mv, env, bi] = await Promise.all([
      sb.from('journal').select('created_at').eq('client_id', c.id).neq('type', TYPE_ENVOI)
        .order('created_at', { ascending: false }).limit(1),
      sb.from('journal').select('created_at').eq('client_id', c.id).eq('type', TYPE_ENVOI)
        .order('created_at', { ascending: false }).limit(6),
      sb.from('biens').select('envoye_le, retour_le').eq('client_id', c.id),
    ]);
    if (mv.error) throw new Error('Lecture du suivi impossible : ' + mv.error.message);
    if (env.error) throw new Error('Lecture des envois impossible : ' + env.error.message);
    if (bi.error) throw new Error('Lecture des biens impossible : ' + bi.error.message);

    let dernierMouvement: string | null = mv.data?.[0]?.created_at || null;
    for (const b of (bi.data || []) as any[]) {
      dernierMouvement = plusRecent(dernierMouvement, b.envoye_le || null);
      dernierMouvement = plusRecent(dernierMouvement, b.retour_le || null);
    }
    const envois: string[] = (env.data || []).map((e: any) => e.created_at);
    const dernierEnvoi = envois[0] || null;

    const rechs = (recherches || []).filter((r: any) => r.client_id === c.id);
    const recherche = rechs.find((r: any) => r.active && r.espace_actif !== false)
      || rechs.find((r: any) => r.espace_actif !== false) || null;

    const email = (Array.isArray(c.emails) ? c.emails : []).map((e: string) => String(e || '').trim()).find((e: string) => /.+@.+\..+/.test(e)) || null;

    let empechement: string | null = null;
    if (c.statut !== 'actif') empechement = 'Le mail ne part que pour les dossiers actifs.';
    else if (reglages.exclus.includes(c.id)) empechement = 'Tu as choisi de ne jamais lui envoyer ce mail.';
    else if (!email) empechement = 'Pas d’adresse mail sur sa fiche.';
    else if (!recherche) empechement = 'Pas de recherche en cours.';
    else if (!c.token_espace) empechement = 'Son espace n’a pas encore de lien : ouvre sa fiche une fois pour le créer.';

    const ech = echeance({ dernierMouvement, dernierEnvoi, creeLe: c.created_at, delai: reglages.delai });

    /* L'historique des envois, avec la première réaction qui a suivi chacun. */
    const historique: Envoi[] = [];
    for (let i = 0; i < envois.length; i++) {
      const le = envois[i];
      const jusqua = new Date(Math.min(new Date(le).getTime() + 30 * 86_400_000,
        i > 0 ? new Date(envois[i - 1]).getTime() : Number.MAX_SAFE_INTEGER)).toISOString();
      const { data: rep } = await sb.from('journal').select('type, titre, created_at')
        .eq('client_id', c.id).in('type', TYPES_REACTION)
        .gt('created_at', le).lt('created_at', jusqua)
        .order('created_at', { ascending: true }).limit(1);
      const r = rep?.[0];
      historique.push({ le, reponse: r ? libelleReaction(r.type, r.titre || '') : null, reponduLe: r?.created_at || null });
    }

    sortie.push({
      clientId: c.id, prenom: c.prenom || '', nom: c.nom || '', email, statut: c.statut,
      revente: !!c.bien_actuel_a_vendre, tokenClient: c.token_espace || null,
      recherche, dernierMouvement, dernierEnvoi,
      echeance: ech.toISOString(),
      du: !empechement && ech.getTime() <= maintenant.getTime(),
      empechement, exclu: reglages.exclus.includes(c.id), historique,
    });
  }
  return sortie;
}

/* ══ Le mail ════════════════════════════════════════════════════════════ */

const BLEU = '#1a2332';
const DORE = '#c9a84c';

const echappe = (t: unknown) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const euros = (n: number) => n.toLocaleString('fr-FR').replace(/ /g, ' ') + ' €';

const ETATS: Record<string, string> = {
  a_renover: 'à rénover', travaux_legers: 'travaux légers', bon_etat: 'bon état', refait_neuf: 'refait à neuf',
};
const EQUIPEMENTS: Record<string, string> = {
  parking: 'Parking', cave: 'Cave', balcon: 'Balcon', terrasse: 'Terrasse', jardin: 'Jardin',
  gardien: 'Gardien', interphone: 'Interphone', digicode: 'Digicode', ascenseur: 'Ascenseur',
  exterieur: 'Un extérieur',
};
const EXPOS: Record<string, string> = { sud: 'sud', est: 'est', ouest: 'ouest', nord: 'nord', traversant: 'traversant' };

const joindre = (l: string[], dernier = ' ou ') =>
  l.length <= 1 ? (l[0] || '') : `${l.slice(0, -1).join(', ')}${dernier}${l[l.length - 1]}`;

export type Ligne = { cle: string; valeur: string; sous?: string };
export type Resume = { lignes: Ligne[]; points: { texte: string; fort: boolean }[]; depuis: string | null };

/** La recherche, en quatre lignes et quelques pastilles : de quoi s'y retrouver, pas tout le dossier. */
export function resumeRecherche(r: any): Resume {
  const lignes: Ligne[] = [];

  // Le bien
  const types = String(r?.type_bien || '').split(',').map((x) => x.trim()).filter(Boolean);
  const tete: string[] = [];
  if (types.length) tete.push(joindre(types));
  if (r?.nb_pieces_min && r?.nb_pieces_max && r.nb_pieces_min !== r.nb_pieces_max) tete.push(`${r.nb_pieces_min} à ${r.nb_pieces_max} pièces`);
  else if (r?.nb_pieces_min) tete.push(`${r.nb_pieces_min} pièces`);
  let bien = tete.join(' · ');
  if (r?.chambres_min) bien += `${bien ? ' dont ' : ''}${r.chambres_min} chambre${r.chambres_min > 1 ? 's' : ''}${bien ? '' : ' minimum'}`;
  const sousBien: string[] = [];
  if (r?.surface_min && r?.surface_max) sousBien.push(`${r.surface_min} à ${r.surface_max} m²`);
  else if (r?.surface_min) sousBien.push(`${r.surface_min} m² minimum`);
  else if (r?.surface_max) sousBien.push(`jusqu'à ${r.surface_max} m²`);
  const etats = String(r?.etat_souhaite || '').split(',').map((x) => ETATS[x.trim()]).filter(Boolean);
  if (etats.length) sousBien.push(`état : ${joindre(etats)}`);
  if (bien || sousBien.length) lignes.push({ cle: 'Le bien', valeur: bien || sousBien.shift() || '', sous: sousBien.join(' · ') || undefined });

  // Où
  const secteurs: string[] = Array.isArray(r?.secteurs) ? r.secteurs : [];
  if (secteurs.length) {
    const villes: string[] = []; const quartiers: string[] = [];
    secteurs.forEach((s) => {
      const m = String(s).match(/^(.+?)\s*\((.+?)\)$/);
      const ville = m ? m[2].trim() : String(s).trim();
      if (!villes.includes(ville)) villes.push(ville);
      if (m) quartiers.push(m[1].trim());
    });
    lignes.push({ cle: 'Où', valeur: villes.join(' · '), sous: quartiers.length ? quartiers.join(' · ') : undefined });
  }

  // Budget
  if (r?.budget_min && r?.budget_max) lignes.push({ cle: 'Budget', valeur: `De ${euros(r.budget_min)} à ${euros(r.budget_max)}` });
  else if (r?.budget_max) lignes.push({ cle: 'Budget', valeur: `Jusqu'à ${euros(r.budget_max)}` });
  else if (r?.budget_min) lignes.push({ cle: 'Budget', valeur: `À partir de ${euros(r.budget_min)}` });

  // Ce qui compte
  const points: { texte: string; fort: boolean }[] = [];
  const ex: Record<string, string> = (r?.exigences && typeof r.exigences === 'object') ? r.exigences : {};
  Object.entries(ex).filter(([, n]) => n === 'indispensable').forEach(([k]) => {
    if (k === 'cuisine') { if (r?.cuisine_type) points.push({ texte: `Cuisine ${r.cuisine_type === 'ouverte' ? 'ouverte' : 'séparée'} indispensable`, fort: true }); return; }
    if (EQUIPEMENTS[k]) points.push({ texte: `${EQUIPEMENTS[k]} indispensable`, fort: true });
  });
  Object.entries(ex).filter(([, n]) => n === 'souhaite').forEach(([k]) => {
    if (k === 'cuisine') { if (r?.cuisine_type) points.push({ texte: `Cuisine ${r.cuisine_type === 'ouverte' ? 'ouverte' : 'séparée'}`, fort: false }); return; }
    if (EQUIPEMENTS[k]) points.push({ texte: EQUIPEMENTS[k], fort: false });
  });
  if (r?.annee_construction_min) points.push({ texte: `Immeuble après ${r.annee_construction_min}`, fort: false });
  if (r?.rdc_exclu) points.push({ texte: 'Pas de rez-de-chaussée', fort: false });
  if (r?.dernier_etage) points.push({ texte: 'Dernier étage', fort: false });
  if (r?.surface_sejour_min) points.push({ texte: `Séjour de ${r.surface_sejour_min} m² minimum`, fort: false });
  if (r?.dpe_max) points.push({ texte: `DPE jusqu'à ${r.dpe_max}`, fort: false });
  const expo = String(r?.exposition_souhaitee || '').split(',').map((x) => EXPOS[x.trim()]).filter(Boolean);
  if (expo.length) points.push({ texte: `Exposition ${joindre(expo)}`, fort: false });

  const depuis = r?.created_at
    ? new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
    : null;
  return { lignes, points: points.slice(0, 7), depuis };
}

export type Reponse = 'toujours' | 'criteres' | 'trouve' | 'pause';

/* Les liens n'agissent pas au simple clic : ils ouvrent l'espace sur la bonne
   question, et c'est le client qui répond. Les messageries et les antivirus
   ouvrent les liens des mails pour les vérifier — un lien qui enregistrerait
   « je cherche toujours » en arrivant répondrait à la place du client. */
export function lienReponse(tokenClient: string, rechercheId: string, reponse: Reponse, site: string): string {
  return `${lienEspace(tokenClient, site)}?r=${encodeURIComponent(rechercheId)}&point=${reponse}`;
}

export function mailPoint(o: { prenom: string; recherche: any; tokenClient: string; site: string }): { sujet: string; html: string; texte: string } {
  const { recherche, tokenClient, site } = o;
  const prenom = echappe(o.prenom || '');
  const res = resumeRecherche(recherche);
  const lien = (x: Reponse) => lienReponse(tokenClient, recherche.id, x, site);

  const lignesHtml = res.lignes.map((l) => `
            <tr><td style="padding:11px 16px;border-top:1px solid #eef1f6;vertical-align:top;width:104px;font-size:12px;font-weight:700;color:#94a3b8;">${echappe(l.cle)}</td>
                <td style="padding:11px 16px 11px 0;border-top:1px solid #eef1f6;vertical-align:top;font-size:14.5px;font-weight:700;color:${BLEU};line-height:1.45;">${echappe(l.valeur)}${l.sous ? `<div style="font-size:12.5px;font-weight:500;color:#64748b;margin-top:3px;">${echappe(l.sous)}</div>` : ''}</td></tr>`).join('');
  const pointsHtml = res.points.length ? `
            <tr><td style="padding:11px 16px;border-top:1px solid #eef1f6;vertical-align:top;width:104px;font-size:12px;font-weight:700;color:#94a3b8;">Ce qui compte</td>
                <td style="padding:9px 16px 7px 0;border-top:1px solid #eef1f6;vertical-align:top;">${res.points.map((p) => `<span style="display:inline-block;margin:0 5px 5px 0;padding:3px 10px;border-radius:99px;font-size:12.5px;font-weight:700;${p.fort ? `background:#fdf8ea;border:1px solid #e7d6a3;color:#7a611b;` : `background:#ffffff;border:1px solid #e3e8f0;color:#334155;`}">${echappe(p.texte)}</span>`).join('')}</td></tr>` : '';

  const bouton = (x: Reponse, texte: string, style: string) => `
          <tr><td style="padding:0 0 9px;"><a href="${echappe(lien(x))}" style="display:block;text-align:center;text-decoration:none;border-radius:12px;padding:14px 12px;font-size:15px;font-weight:700;${style}">${texte}</a></td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Où en est votre recherche ?</title>
<style>
  @media only screen and (max-width:600px) {
    .sheet { width:100% !important; }
    .cadre { padding:0 !important; }
    .carte { border-radius:0 !important; border-left:0 !important; border-right:0 !important; }
    .bord  { padding-left:18px !important; padding-right:18px !important; }
    .pied-nom, .pied-tel { display:block !important; width:100% !important; text-align:left !important; }
    .pied-tel { padding-top:12px !important; font-size:17px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#e7e1d4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e7e1d4;">
    <tr><td align="center" class="cadre" style="padding:26px 12px;">
      <table role="presentation" width="600" class="sheet carte" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e3d8c4;border-radius:18px;overflow:hidden;">

        <tr><td class="bord" style="background:${BLEU};border-bottom:3px solid ${DORE};padding:20px 28px;">
          <table role="presentation" width="100%"><tr>
            <td><img src="${site}/logo_high_resolution_white.png" alt="Emilio Immobilier" height="34" style="height:34px;width:auto;display:block;border:0;" /></td>
            <td align="right" style="font-size:10px;color:${DORE};letter-spacing:2.5px;font-weight:600;">VOTRE RECHERCHE</td>
          </tr></table>
        </td></tr>

        <tr><td class="bord" style="padding:26px 28px 6px;font-size:14.5px;color:#3a4a5f;line-height:1.7;">
          <p style="margin:0 0 14px;">Bonjour ${prenom},</p>
          <p style="margin:0 0 18px;">Cela fait quelques semaines que nous n'avons pas fait le point ensemble. Voici la recherche que nous menons pour vous aujourd'hui&nbsp;:</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e6ebf2;border-radius:14px;border-collapse:separate;overflow:hidden;">
            <tr><td colspan="2" style="background:#f4f7fb;padding:11px 16px;">
              <table role="presentation" width="100%"><tr>
                <td style="font-size:11px;font-weight:800;letter-spacing:1px;color:#1f3f75;">VOTRE RECHERCHE AUJOURD'HUI</td>
                ${res.depuis ? `<td align="right" style="font-size:11.5px;color:#94a3b8;font-weight:600;">depuis le ${echappe(res.depuis)}</td>` : ''}
              </tr></table>
            </td></tr>${lignesHtml}${pointsHtml}
          </table>

          <p style="margin:20px 0 12px;">Est-ce toujours d'actualité&nbsp;? Un clic suffit pour me le dire&nbsp;:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${
            bouton('toujours', 'Je cherche toujours', `background:${BLEU};color:#ffffff;border:1.5px solid ${BLEU};`)
          }${
            bouton('criteres', 'Mes critères ont changé', `background:#ffffff;color:${BLEU};border:1.5px solid ${BLEU};`)
          }${
            bouton('trouve', 'J’ai trouvé mon bien', `background:${DORE};color:${BLEU};border:1.5px solid ${DORE};`)
          }${
            bouton('pause', 'J’ai mis ma recherche en pause ou arrêtée', `background:#ffffff;color:#64748b;border:1.5px solid #d5dde8;`)
          }
          </table>
          <p style="margin:10px 0 22px;">Bonne journée,<br />Alexandre</p>
        </td></tr>

        <tr><td class="bord" style="background:${BLEU};padding:20px 28px;">
          <table role="presentation" width="100%"><tr>
            <td class="pied-nom">
              <div style="font-size:14px;font-weight:700;color:#ffffff;">Alexandre Rogelet</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:3px;">Recherche immobilière sur mesure · Paris &amp; Hauts-de-Seine</div>
            </td>
            <td align="right" class="pied-tel" style="color:${DORE};font-size:15px;font-weight:700;white-space:nowrap;">06 58 95 76 32</td>
          </tr></table>
        </td></tr>
      </table>

      <table role="presentation" width="600" class="sheet" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td class="bord" align="center" style="padding:16px 28px 6px;">
          <div style="font-size:11.5px;color:#9aa6ba;line-height:1.7;">
            Vous recevez ce message parce que votre recherche est en cours avec Emilio Immobilier.<br />Chaque bouton ouvre votre espace personnel, au bon endroit.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texte = [
    `Bonjour ${o.prenom || ''},`,
    '',
    'Cela fait quelques semaines que nous n’avons pas fait le point ensemble. Voici la recherche que nous menons pour vous aujourd’hui :',
    '',
    ...res.lignes.map((l) => `${l.cle} : ${l.valeur}${l.sous ? ` (${l.sous})` : ''}`),
    ...(res.points.length ? [`Ce qui compte : ${res.points.map((p) => p.texte).join(', ')}`] : []),
    '',
    'Est-ce toujours d’actualité ? Un clic suffit pour me le dire :',
    `Je cherche toujours : ${lien('toujours')}`,
    `Mes critères ont changé : ${lien('criteres')}`,
    `J’ai trouvé mon bien : ${lien('trouve')}`,
    `J’ai mis ma recherche en pause ou arrêtée : ${lien('pause')}`,
    '',
    'Bonne journée,',
    'Alexandre Rogelet · Emilio Immobilier · 06 58 95 76 32',
  ].join('\n');

  return { sujet: 'Où en est votre recherche ?', html, texte };
}

/* ══ L'envoi par Mailjet ══ */

export async function envoyerMailjet(o: { a: string; nom?: string; sujet: string; html: string; texte: string; id: string; deNom?: string }): Promise<{ ok: boolean; erreur?: string }> {
  const cle = process.env.MAILJET_API_KEY, secret = process.env.MAILJET_API_SECRET;
  if (!cle || !secret) return { ok: false, erreur: 'clés Mailjet absentes' };
  const de = process.env.MAILJET_FROM_EMAIL || 'arogelet@emilio-immo.com';
  const deNom = o.deNom || process.env.MAILJET_FROM_NAME || 'Alexandre ROGELET — Emilio Immobilier';
  const auth = Buffer.from(`${cle}:${secret}`).toString('base64');
  try {
    const r = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        Messages: [{
          From: { Email: de, Name: deNom },
          To: [{ Email: o.a, Name: o.nom || undefined }],
          Subject: o.sujet, TextPart: o.texte, HTMLPart: o.html,
          CustomID: o.id,
          TrackOpens: 'disabled', TrackClicks: 'disabled',
        }],
      }),
    });
    const j = await r.json().catch(() => null);
    const statut = j?.Messages?.[0]?.Status;
    if (!r.ok || statut !== 'success') return { ok: false, erreur: `Mailjet a répondu ${r.status}${statut ? ` (${statut})` : ''}` };
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erreur: e instanceof Error ? e.message : 'erreur réseau' };
  }
}
