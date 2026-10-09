/* ══ Les documents de la rubrique Documents, vus depuis l'espace acheteur ═══

   Ce que le CRM dit d'un document (préparé, envoyé, signé), l'espace le
   redit au client, sans rien inventer. Ici :

     · les TYPES que la page (/espace/[token]) passe aux cartes de l'espace
       (SignatureMandat.tsx), en `import type` ;
     · `pourEspaceAcheteur` (V3.56) : LA règle qui dit quels documents
       l'espace acheteur montre. Le CRM s'en sert aussi (vuDansEspace, le
       rappel « Exemplaire signé à déposer ») : les deux disent la même
       chose. Fonction pure, sans base : le navigateur peut l'importer ;
     · `signatairesEspace` : qui signe un document, où il en est, et lequel
       est le client lui-même. ⚠️ Un couple reçoit un seul document avec un
       lien PAR PERSONNE, et le code part sur l'adresse de chacun. Le client
       se reconnaît à SES adresses (fiche, `emails`) ; son conjoint, à la
       sienne (`conjoint.email`). On ne donne jamais au client, comme bouton
       principal, le lien de quelqu'un d'autre : Paul ne doit pas tomber sur
       « Bonjour Claire » avec un code parti chez elle ;
     · `lireDocumentsEspace` : ses documents à l'accueil (« Un document vous
       attend », « Vos documents signés ») ;
     · `retracteEnLigne` (V3.56) : un mandat de recherche signé en ligne
       auquel le client a renoncé depuis son espace. Fonction pure, sans
       base : le CRM s'en sert aussi pour dire « Rétracté ».

   Une ligne de `documents_signataires` se lit TOUJOURS par son statut
   (attendu · invite · signe · annule), jamais par son jeton : une signature
   arrêtée peut garder ses jetons. Serveur uniquement pour la lecture (clé
   service) ; une table ou une colonne absente se lit comme « rien ».
   ════════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { modele } from './actes';
import { finValiditeOffre } from './actes/offre-achat';
import { biensDuBon } from './actes/bon-visite';

/* ── Les documents que l'espace acheteur montre (V3.56) ──
   L'espace est celui de l'ACHETEUR : il y retrouve ses documents d'acheteur
   rattachés à sa fiche — mandat de recherche et ses avenants, offre
   d'achat, bon de visite. Jamais un document de vendeur (mandat de vente,
   son avenant : il n'y a pas d'espace vendeur, et un client qui vend et
   achète ne doit pas voir son mandat de vente ici), ni un document entre
   professionnels (`interne` : la délégation), ni un courrier (sa « preuve
   d'envoi » n'est pas un document signé). Une seule règle, pour l'espace
   (lireDocumentsEspace, /api/espace/document) et pour le CRM (vuDansEspace). */
const CATEGORIES_ACHETEUR = ['mandats_recherche', 'offres', 'bons_visite'];
export function pourEspaceAcheteur(modeleId: unknown): boolean {
  const m = typeof modeleId === 'string' ? modele(modeleId) : null;
  return !!m && !m.interne && !m.courrier && CATEGORIES_ACHETEUR.includes(m.categorie);
}

/* ── Les types partagés avec l'espace ── */

/** Où en est un signataire : signé ; son lien est parti et vaut encore ;
    son lien a expiré ; il signera sur l'écran d'Alexandre. */
export type EtatSignataire = 'signe' | 'a_signer' | 'expire' | 'sur_place';
/** Un signataire d'un document, tel que l'espace le montre. `qui` : le
    client lui-même ('vous'), quelqu'un dont l'adresse est sur sa fiche
    (son conjoint, le plus souvent : 'proche'), ou un autre. `lien` : sa page
    de signature, seulement pour 'vous' et 'proche', et seulement si elle
    vaut encore (le code part toujours sur l'adresse de la personne). */
export type SignataireEspace = {
  prenom: string; nom: string;
  qui: 'vous' | 'proche' | 'autre';
  etat: EtatSignataire;
  le: string | null;
  expire: string | null;
  lien: string | null;
};
export type FichierSigne = 'pdf' | 'image';
export type ModeDoc = 'papier' | 'en_ligne' | 'sur_place';

/** Un document à l'accueil de l'espace.
    · 'a_signer' : il doit le signer, `lien` est SON lien ;
    · 'attente'  : il l'a signé (`le`), on attend quelqu'un d'autre ;
    · 'expire'   : son lien a expiré sans signature ;
    · 'signe'    : signé par tous, l'exemplaire signé est déposé (`fichier`). */
export type DocEspace = {
  id: string; titre: string;
  etat: 'a_signer' | 'attente' | 'expire' | 'signe';
  lien?: string;
  le?: string | null;
  signataires?: SignataireEspace[];
  fichier?: FichierSigne;
  /** Un mandat de recherche : les cartes le disent avec ses mots. */
  mandat?: boolean;
  /** Le mandat signé dans l'espace lui-même (pas un document de la rubrique
      Documents) : il se télécharge par /api/espace/mandat. */
  espace?: boolean;
  /** V3.56 : une offre d'achat passée sa date de validité, pas signée par
      tous ('expire') : elle ne peut plus être signée — pas de nouveau lien
      à promettre. */
  offreExpiree?: boolean;
  /** V3.55 : un bon de visite signé — la visite (date ISO « AAAA-MM-JJ »,
      heure) et le logement visité, pour la liste « Mes bons de visite ». */
  visite?: { date: string | null; heure: string; adresse: string; ville: string; bien: string };
};

/** Le mandat de recherche de la rubrique Documents, pour « Mon mandat de
    recherche » : en préparation, prêt, parti en signature, ou signé ; ou,
    V3.56, celui auquel il vient de renoncer en ligne ('retracte'). */
export type MandatDocEspace = {
  id: string;
  statut: 'brouillon' | 'pret' | 'signe' | 'retracte';
  mode: ModeDoc;
  /** La signature en ligne ou sur place est lancée (`documents.signature`). */
  lance: boolean;
  numero: string | null;
  /** Sa propre ligne de signature ; null : aucune à l'une de ses adresses. */
  vous: EtatSignataire | null;
  /** Son lien à lui, quand il doit signer et qu'il vaut encore. */
  lien: string | null;
  signataires: SignataireEspace[];
  /** Signé (par tous) le. */
  le: string | null;
  /** L'exemplaire signé, quand Alexandre l'a déposé (ou qu'il est scellé). */
  fichier: FichierSigne | null;
  /** V3.56 : signé en ligne par lui, il peut y renoncer depuis son espace
      jusqu'à `fin` (14 jours, comptés comme pour le mandat signé dans
      l'espace : finRetractationPour). La page ne l'envoie que tant que le
      délai court. Absent : pas de renonciation en ligne (signé à la main ou
      sur place, pas par lui, ou délai passé). */
  renoncer?: { fin: string } | null;
  /** V3.56 : il y a renoncé en ligne, ce jour-là ('retracte'). */
  retracteLe?: string | null;
};

/* ── Lire une ligne de signataire ── */

export const COLONNES_SIGNATAIRES = 'document_id, rang, nom, statut, jeton, personne, lien_expire_le, signe_le';
export type LigneSignataire = {
  document_id: string; rang?: number | null; nom?: string | null; statut: string; jeton: string | null;
  personne: { prenom?: unknown; nom?: unknown; email?: unknown } | null;
  lien_expire_le: string | null; signe_le?: string | null;
};
/** Ce qu'il faut de la fiche du client pour le reconnaître. Une simple liste
    d'adresses vaut « ses adresses à lui » (pas de conjoint). */
export type FicheEspace = { prenom?: unknown; nom?: unknown; emails?: unknown; conjoint?: unknown } | string[];

const adresse = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
/* Un prénom en mots : « Paul-Henri », « paul  henri » → ['paul', 'henri']. */
const motsPrenom = (t: unknown) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
/* V3.57 : deux prénoms s'accordent-ils ? 2 : le même ; 1 : le même premier
   prénom (« Paul » sur la fiche, « Paul Henri » sur le mandat) ; 0 : non, ou
   l'un des deux est inconnu. */
const accordPrenom = (a: string[], b: string[]) => (!a.length || !b.length ? 0 : a.join(' ') === b.join(' ') ? 2 : a[0] === b[0] ? 1 : 0);

/** Le mode de signature choisi dans le document : celui de la signature
    lancée d'abord, sinon la réponse de l'éditeur (à la main par défaut). */
export function modeDoc(donnees: unknown, signature: unknown): ModeDoc {
  const lance = signature && typeof signature === 'object' ? (signature as { mode?: unknown }).mode : null;
  if (lance === 'en_ligne' || lance === 'sur_place') return lance;
  const d = donnees && typeof donnees === 'object' ? (donnees as { signature?: unknown }).signature : null;
  return d === 'en_ligne' || d === 'sur_place' ? d : 'papier';
}

/** Un exemplaire signé déposé à la main peut être une photo : le fichier
    garde son extension (documents/<id>/signe-….jpg). */
export function fichierDe(chemin: unknown): FichierSigne | null {
  if (typeof chemin !== 'string' || !chemin) return null;
  return /\.(jpe?g|png|heic|webp)$/i.test(chemin) ? 'image' : 'pdf';
}

/* Les lignes qui comptent : ni annulées (signature arrêtée, signataire
   remplacé), dans l'ordre des cadres. */
const lignesActives = <T extends LigneSignataire>(lignes: T[]): T[] => lignes
  .filter(l => l.statut === 'attendu' || l.statut === 'invite' || l.statut === 'signe')
  .sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));

/** SA ligne parmi les signataires d'un document : celle à l'une de SES
    adresses ; si l'adresse est aussi celle du conjoint (une adresse
    commune), le prénom tranche. Aucune : null. La même règle sert à
    l'affichage (signatairesEspace) et à la renonciation en ligne (V3.56) :
    on ne renonce jamais avec la signature de quelqu'un d'autre.
    V3.56 : dans le doute, ce n'est pas la sienne. Une adresse commune avec
    le conjoint ne compte que si le prénom de la ligne est le sien (et pas
    aussi celui du conjoint) ; une ligne au prénom du conjoint n'est jamais
    la sienne, même à l'une de ses adresses. Avant, une ligne de Claire à
    l'adresse commune, avec un prénom vide ou différent sur la fiche,
    devenait celle de Paul quand la sienne partait à une autre adresse.
    V3.57 : le prénom s'accorde aussi par son premier mot (« Paul Henri » sur
    le mandat, « Paul » sur la fiche), mais la ligne n'est la sienne que si
    elle s'accorde MIEUX à son prénom qu'à celui du conjoint : à égalité
    (deux « Marie… »), on ne tranche pas. */
export function laSienne<T extends LigneSignataire>(lignes: T[], fiche: FicheEspace | null | undefined): T | null {
  const f = Array.isArray(fiche) ? null : fiche || null;
  const siennes = (Array.isArray(fiche) ? fiche : Array.isArray(f?.emails) ? (f!.emails as unknown[]) : []).map(adresse).filter(e => e.includes('@'));
  const cj = f?.conjoint && typeof f.conjoint === 'object' ? (f.conjoint as { email?: unknown; prenom?: unknown }) : null;
  const adresseCj = adresse(cj?.email);
  const prenomClient = motsPrenom(f?.prenom);
  const prenomCj = motsPrenom(cj?.prenom);
  /* Lui : la meilleure ligne à l'une de ses adresses. */
  const note = (l: LigneSignataire): number => {
    const e = adresse(l.personne?.email);
    if (!e || !siennes.includes(e)) return 0;
    const p = motsPrenom(l.personne?.prenom);
    const aLui = accordPrenom(p, prenomClient), auConjoint = accordPrenom(p, prenomCj);
    /* L'adresse commune : seul son prénom à lui la lui donne. */
    if (adresseCj && e === adresseCj) return aLui > auConjoint ? 3 : 0;
    /* Le prénom du conjoint, à une adresse de sa fiche : la ligne du conjoint. */
    if (auConjoint > aLui) return 0;
    return aLui > 0 ? 3 : 2;
  };
  let moi: T | null = null, meilleure = 0;
  for (const l of lignesActives(lignes)) { const n = note(l); if (n > meilleure) { moi = l; meilleure = n; } }
  return moi;
}

/** Un mandat de recherche de la rubrique Documents auquel le client a
    renoncé en ligne, depuis son espace (V3.56) : l'instant de sa
    renonciation, sinon null. Le serveur l'écrit dans les réponses du
    document (`donnees.retracte_le`, `donnees.retracte_en_ligne`), avec le
    statut « annule ». */
export function retracteEnLigne(d: { statut?: unknown; donnees?: unknown } | null | undefined): string | null {
  if (!d || d.statut !== 'annule' || !d.donnees || typeof d.donnees !== 'object') return null;
  const x = d.donnees as { retracte_le?: unknown; retracte_en_ligne?: unknown };
  return x.retracte_en_ligne === true && typeof x.retracte_le === 'string' && x.retracte_le ? x.retracte_le : null;
}

/** Qui signe ce document, dans l'ordre des cadres, et lequel est le client
    (laSienne). Les lignes annulées ne comptent pas. */
export function signatairesEspace(lignes: LigneSignataire[], fiche: FicheEspace | null | undefined, maintenant = Date.now()): SignataireEspace[] {
  const f = Array.isArray(fiche) ? null : fiche || null;
  const siennes = (Array.isArray(fiche) ? fiche : Array.isArray(f?.emails) ? (f!.emails as unknown[]) : []).map(adresse).filter(e => e.includes('@'));
  const cj = f?.conjoint && typeof f.conjoint === 'object' ? (f.conjoint as { email?: unknown; prenom?: unknown }) : null;
  const adresseCj = adresse(cj?.email);
  const actives = lignesActives(lignes);
  const moi = laSienne(lignes, fiche);

  return actives.map((l): SignataireEspace => {
    const e = adresse(l.personne?.email);
    const qui: SignataireEspace['qui'] = l === moi ? 'vous' : e && (siennes.includes(e) || e === adresseCj) ? 'proche' : 'autre';
    const vaut = !l.lien_expire_le || Date.parse(l.lien_expire_le) > maintenant;
    const etat: EtatSignataire = l.statut === 'signe' ? 'signe' : l.statut === 'attendu' ? 'sur_place' : vaut ? 'a_signer' : 'expire';
    const prenom = typeof l.personne?.prenom === 'string' ? l.personne.prenom.trim() : '';
    const nom = typeof l.personne?.nom === 'string' ? l.personne.nom.trim() : '';
    return {
      prenom: prenom || (!nom ? String(l.nom || '').trim() : ''), nom,
      qui, etat,
      le: l.statut === 'signe' ? l.signe_le || null : null,
      expire: l.statut === 'invite' ? l.lien_expire_le : null,
      lien: qui !== 'autre' && etat === 'a_signer' && l.jeton ? `/signer/${l.jeton}` : null,
    };
  });
}

/** Ce qu'un document en signature demande au client lui-même — rien quand
    il n'a pas de ligne à lui, ou qu'il signera sur place. */
export function pourVous(sigs: SignataireEspace[]): Pick<DocEspace, 'etat' | 'lien' | 'le'> | null {
  const v = sigs.find(s => s.qui === 'vous');
  if (!v) return null;
  if (v.etat === 'a_signer' && v.lien) return { etat: 'a_signer', lien: v.lien };
  if (v.etat === 'expire') return { etat: 'expire' };
  if (v.etat === 'signe' && sigs.some(s => s.etat !== 'signe')) return { etat: 'attente', le: v.le };
  return null;
}

/* Un bon de visite signé, pour « Mes bons de visite » : la visite du
   premier bien (sa date range la liste) ; V3.154, un bon à plusieurs biens
   nomme les autres sous le premier (« et 2 autres biens : … »). */
function visiteDuBon(d: Record<string, unknown>): NonNullable<DocEspace['visite']> {
  const [b, ...autres] = biensDuBon(d);
  const lieu = (x: typeof b) => [x.adresse, x.ville].filter(Boolean).join(', ');
  const ou = autres.map(lieu).filter(Boolean).join(' ; ');
  const suite = autres.length ? `et ${autres.length} autre${autres.length > 1 ? 's' : ''} bien${autres.length > 1 ? 's' : ''}${ou ? ` : ${ou}` : ''}` : '';
  return {
    date: /^\d{4}-\d{2}-\d{2}/.test(b.dateVisite) ? b.dateVisite.slice(0, 10) : null, heure: b.heure, adresse: b.adresse, ville: b.ville,
    bien: [b.description, suite].filter(Boolean).join(' · '),
  };
}

/** Ses documents, pour l'accueil de l'espace : ceux qui attendent quelque
    chose de lui (ou d'un proche, une fois qu'il a signé), et ceux qui sont
    signés et dont l'exemplaire est déposé — signés en ligne, sur place ou à
    la main (le scan déposé par Alexandre). Seulement ses documents
    d'acheteur (pourEspaceAcheteur) : ni un document de vendeur, ni un
    document entre professionnels, ni un courrier. Ne lève jamais. */
export async function lireDocumentsEspace(sb: SupabaseClient, clientId: string, fiche: FicheEspace | null | undefined): Promise<DocEspace[]> {
  const out: DocEspace[] = [];
  try {
    const { data, error } = await sb.from('documents').select('*')
      .eq('client_id', clientId).in('statut', ['pret', 'signe']).order('updated_at', { ascending: false }).limit(30);
    if (error || !data) return out;
    type Doc = { id: string; modele: string; statut: string; titre: string | null; donnees: Record<string, unknown> | null; signature: unknown; signe_le: string | null; signe_chemin: string | null };
    const docs = data as Doc[];
    const enCours = docs.filter(x => x.statut === 'pret' && x.signature).map(x => x.id);
    let lignes: LigneSignataire[] = [];
    if (enCours.length) {
      const { data: l, error: eL } = await sb.from('documents_signataires').select(COLONNES_SIGNATAIRES).in('document_id', enCours);
      if (!eL && l) lignes = l as LigneSignataire[];
    }
    for (const x of docs) {
      const m = modele(x.modele);
      if (!m || !pourEspaceAcheteur(x.modele)) continue;
      const titre = m.entete(x.donnees || {});
      const mandat = x.modele === 'mandat_recherche';
      if (x.statut === 'signe') {
        const fichier = fichierDe(x.signe_chemin);
        if (fichier) out.push({ id: x.id, titre, etat: 'signe', le: x.signe_le, fichier, mandat,
          ...(x.modele === 'bon_visite' ? { visite: visiteDuBon(x.donnees || {}) } : {}) });
        continue;
      }
      if (!x.signature) continue;
      const signataires = signatairesEspace(lignes.filter(l => l.document_id === x.id), fiche);
      const e = pourVous(signataires);
      if (!e) continue;
      /* V3.56 : une offre d'achat passée sa date de validité ne se signe
         plus (ni par lui, ni par l'autre acquéreur) : on le lui dit, sans
         promettre de nouveau lien. */
      const fin = x.modele === 'offre_achat' ? finValiditeOffre(x.donnees || {}) : null;
      if (fin && fin.getTime() <= Date.now()) out.push({ id: x.id, titre, mandat, signataires, etat: 'expire', offreExpiree: true });
      else out.push({ id: x.id, titre, mandat, signataires, ...e });
    }
  } catch { /* pas encore installé : rien à montrer */ }
  return out;
}
