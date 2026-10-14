/* ═══ Le fil d'une offre d'achat (V3.189) ═══════════════════════════════════

   Alexandre : « que tout soit bien synchronisé, qu'il y ait un historique ;
   s'il y a une autre contre-proposition, que ça reparte là-dessus ».

   Une offre = un document de la rubrique Documents (modèle `offre_achat`),
   rattaché au client et au bien (`documents.client_id`, `bien_id`). Les
   offres successives d'un même client sur un même bien forment un FIL :
   1re offre → contre-proposition du vendeur → 2e offre → acceptée.

   Ce qui n'est pas dans le texte de l'offre vit dans `donnees.suivi`
   (jamais imprimé, jamais signé) :
     · origine   'espace' (préparée par le client) ou 'crm' ;
     · choix     ce que le client a demandé : 'relire' (« Faire relire par
                 mon conseiller ») ou 'signer' (il signe seul) ;
     · precedente  l'offre qu'elle remplace dans le fil ;
     · reponse   la réponse du vendeur, notée par Alexandre : acceptée,
                 refusée, ou contre-proposition (`montant` = le prix pour le
                 vendeur, `limite` = jusqu'à quand elle vaut) ;
     · remplacee_le  une offre suivante l'a remplacée ;
     · close     « sans suite » — dit par le client depuis son espace, ou par
                 Alexandre depuis le CRM.

   L'état se LIT (etatDeOffre) : du statut du document, de ses envois à
   l'agence (`documents.envois`, `offre: true`), de sa date de validité et
   du suivi. Rien n'est recopié ailleurs : le CRM et l'espace lisent la même
   chose, au même endroit, et ne peuvent pas se contredire.

   Navigateur et serveur : aucune lecture de base ici.
   ════════════════════════════════════════════════════════════════════════ */

import { finValiditeOffre, honorairesOffre, honorairesSurPrix } from './actes/offre-achat';
import type { Donnees } from './actes/commun';

export type ReponseVendeur = {
  statut: 'acceptee' | 'refusee' | 'contre';
  /** Contre-proposition : le prix pour le vendeur (honoraires de son agence compris). */
  montant?: number | null;
  /** Quand Alexandre l'a notée. */
  le: string;
  /** Contre-proposition : valable jusqu'au (AAAA-MM-JJ), si l'agence l'a dit. */
  limite?: string | null;
  /** Un mot pour lui seul (jamais montré au client). */
  note?: string | null;
};

export type SuiviOffre = {
  origine?: 'espace' | 'crm';
  choix?: 'relire' | 'signer';
  precedente?: string | null;
  /** Née d'une contre-proposition acceptée (« Accepter » dans l'espace, « Elle accepte » dans le CRM). */
  depuisContre?: boolean;
  reponse?: ReponseVendeur | null;
  remplacee_le?: string | null;
  close?: { le: string; par: 'client' | 'conseiller' } | null;
};

/** Une ligne de `documents`, ce qu'il en faut ici. */
export type DocOffre = {
  id: string; statut: string; donnees: Donnees | null; created_at: string;
  signe_le?: string | null; envois?: unknown; signature?: unknown;
  bien_id?: string | null; client_id?: string | null; recherche_id?: string | null; titre?: string | null;
};

export type EtatOffre =
  | 'brouillon'      // préparée dans le CRM, pas encore envoyée en signature
  | 'a_relire'       // préparée par le client, à relire par Alexandre
  | 'a_finaliser'    // finalisée dans le CRM, signature pas encore lancée
  | 'en_signature'   // liens partis, on attend une signature
  | 'signee'         // signée par tous, pas encore envoyée à l'agence
  | 'envoyee'        // envoyée à l'agence, pas de réponse
  | 'contre'         // le vendeur fait une contre-proposition
  | 'acceptee' | 'refusee'
  | 'echue'          // passée sa date de validité sans réponse
  | 'sans_suite'     // close sans suite
  | 'remplacee'      // une offre suivante l'a remplacée
  | 'annulee';

const n = (v: unknown): number | null => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(/\s/g, '').replace(',', '.')) : NaN;
  return Number.isFinite(x) ? x : null;
};

export function lireSuivi(d: Donnees | null | undefined): SuiviOffre {
  const s = d && typeof d === 'object' ? (d as Record<string, unknown>).suivi : null;
  if (!s || typeof s !== 'object') return {};
  const o = s as Record<string, unknown>;
  const r = o.reponse && typeof o.reponse === 'object' ? o.reponse as Record<string, unknown> : null;
  const c = o.close && typeof o.close === 'object' ? o.close as Record<string, unknown> : null;
  return {
    origine: o.origine === 'espace' ? 'espace' : o.origine === 'crm' ? 'crm' : undefined,
    choix: o.choix === 'relire' ? 'relire' : o.choix === 'signer' ? 'signer' : undefined,
    precedente: typeof o.precedente === 'string' ? o.precedente : null,
    depuisContre: o.depuisContre === true,
    reponse: r && (r.statut === 'acceptee' || r.statut === 'refusee' || r.statut === 'contre') && typeof r.le === 'string'
      ? { statut: r.statut, montant: n(r.montant), le: r.le, limite: typeof r.limite === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.limite) ? r.limite : null, note: typeof r.note === 'string' ? r.note : null }
      : null,
    remplacee_le: typeof o.remplacee_le === 'string' ? o.remplacee_le : null,
    close: c && typeof c.le === 'string' ? { le: c.le, par: c.par === 'client' ? 'client' : 'conseiller' } : null,
  };
}

/** Ses envois à l'agence (`documents.envois` marqués `offre`), du plus ancien au plus récent. */
export type EnvoiOffreLu = { le: string; a: string[] };
export function envoisOffre(doc: Pick<DocOffre, 'envois'>): EnvoiOffreLu[] {
  const l = Array.isArray(doc.envois) ? doc.envois : [];
  return l.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && (e as { offre?: unknown }).offre === true && typeof (e as { le?: unknown }).le === 'string')
    .map(e => ({ le: e.le as string, a: (Array.isArray(e.a) ? e.a : []).map(x => String((x as { email?: unknown })?.email || '')).filter(Boolean) }))
    .sort((a, b) => a.le.localeCompare(b.le));
}

/** La fin de validité, et si elle est passée. */
export function finOffre(d: Donnees | null | undefined): Date | null {
  return d ? finValiditeOffre(d) : null;
}

export function etatDeOffre(doc: DocOffre, maintenant = Date.now()): EtatOffre {
  if (doc.statut === 'annule') return 'annulee';
  const d = doc.donnees || {};
  const s = lireSuivi(d);
  if (s.remplacee_le) return 'remplacee';
  if (s.close) return 'sans_suite';
  if (s.reponse) return s.reponse.statut;
  const fin = finOffre(d);
  const passee = !!fin && fin.getTime() <= maintenant;
  if (doc.statut === 'brouillon') return s.origine === 'espace' ? 'a_relire' : 'brouillon';
  if (doc.statut === 'pret') {
    if (doc.signature) return passee ? 'echue' : 'en_signature';
    /* Relue et finalisée par Alexandre : il reste à lancer la signature. */
    return 'a_finaliser';
  }
  if (doc.statut === 'signe') {
    if (passee) return 'echue';
    return envoisOffre(doc).length ? 'envoyee' : 'signee';
  }
  return 'brouillon';
}

/** Une offre qui attend encore quelque chose (de lui, d'elle ou du vendeur). */
export const ENCOURS: EtatOffre[] = ['brouillon', 'a_relire', 'a_finaliser', 'en_signature', 'signee', 'envoyee', 'contre'];
/** Le fil s'est arrêté sans accord : une nouvelle offre peut partir. */
export const FINIES: EtatOffre[] = ['refusee', 'echue', 'sans_suite'];

/** Le prix pour le vendeur, et son total frais d'agence compris. */
export const prixOffre = (d: Donnees | null | undefined) => (d ? n((d as Record<string, unknown>).prix) : null);
export function totalOffre(d: Donnees | null | undefined): number | null {
  const p = prixOffre(d);
  return p && d ? p + honorairesOffre(d) : null;
}
/** Une contre-proposition (le prix pour le vendeur) en « frais d'agence compris » pour lui :
    ses honoraires entiers, comme sur l'offre (taux ou forfait du bien). */
export function totalContre(d: Donnees | null | undefined, montant: number): number {
  return montant + (d ? honorairesSurPrix(d, montant) : 0);
}
/** Une contre-proposition dont la date limite est passée (à minuit, heure de Paris). */
export function contreDepassee(r: ReponseVendeur | null | undefined, maintenant = Date.now()): boolean {
  if (!r || r.statut !== 'contre' || !r.limite) return false;
  const fin = finValiditeOffre({ validite: r.limite });
  return !!fin && fin.getTime() < maintenant;
}

/* ── Le fil ── */

/** Les offres de ce client sur ce bien, de la plus ancienne à la plus récente.
    Les offres annulées n'en font pas partie. */
export function filDuBien(docs: DocOffre[], bienId: string): DocOffre[] {
  return docs.filter(x => x.bien_id === bienId && x.statut !== 'annule')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}
/** L'offre du moment : la plus récente qui n'a pas été remplacée. Si toutes
    l'ont été (la suivante supprimée après coup), la plus récente : le fil ne
    disparaît jamais. */
export function offreCourante(fil: DocOffre[], maintenant = Date.now()): DocOffre | null {
  for (let i = fil.length - 1; i >= 0; i--) {
    if (etatDeOffre(fil[i], maintenant) !== 'remplacee') return fil[i];
  }
  return fil.length ? fil[fil.length - 1] : null;
}

/** Ce que le client voit d'une offre : celles qu'il a préparées, et celles
    parties en signature. Un brouillon du CRM reste chez Alexandre. */
export const visiblePourClient = (x: DocOffre) => lireSuivi(x.donnees).origine === 'espace' || x.statut === 'signe' || (x.statut === 'pret' && !!x.signature);

/** Un brouillon du CRM qui compte encore : récent (trois semaines) et pas
    passé sa date de validité. Un vieux brouillon oublié ne bloque pas le
    client (« Votre conseiller prépare déjà votre nouvelle offre »). */
export function brouillonCrmVivant(x: DocOffre, maintenant = Date.now()): boolean {
  if (visiblePourClient(x)) return false;
  if (!(x.statut === 'brouillon' || (x.statut === 'pret' && !x.signature))) return false;
  if (maintenant - Date.parse(x.created_at) > 21 * 86_400_000) return false;
  const fin = finOffre(x.donnees);
  return !fin || fin.getTime() > maintenant;
}

/** Sa place parmi les offres que le client voit (1 pour la 1re) — la même
    numérotation dans le CRM et dans l'espace. 0 : un brouillon du CRM. */
export function rangVisible(fil: DocOffre[], doc: DocOffre): number {
  if (!visiblePourClient(doc)) return 0;
  return fil.filter(visiblePourClient).findIndex(x => x.id === doc.id) + 1;
}
/** Les biens qui ont un fil, et leur fil. */
export function filsParBien(docs: DocOffre[]): Map<string, DocOffre[]> {
  const m = new Map<string, DocOffre[]>();
  for (const x of docs) {
    if (!x.bien_id || x.statut === 'annule') continue;
    m.set(x.bien_id, [...(m.get(x.bien_id) || []), x]);
  }
  for (const [k, l] of m) m.set(k, l.sort((a, b) => a.created_at.localeCompare(b.created_at)));
  return m;
}

/* ── Les mots ── */

const EUR = (x: number) => `${Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} €`;
const JOUR = (iso: string) => {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }) : '';
};
export const rangOffre = (i: number) => (i === 0 ? '1re offre' : `${i + 1}e offre`);

export type Ton = 'gris' | 'bleu' | 'or' | 'vert' | 'rouge' | 'violet';
/** Pour Alexandre (CRM). */
export const ETATS_CRM: Record<EtatOffre, { l: string; ton: Ton }> = {
  brouillon: { l: 'Brouillon', ton: 'gris' },
  a_relire: { l: 'À relire', ton: 'or' },
  a_finaliser: { l: 'À envoyer pour signature', ton: 'bleu' },
  en_signature: { l: 'En signature', ton: 'bleu' },
  signee: { l: 'Signée, à envoyer', ton: 'or' },
  envoyee: { l: 'Envoyée à l’agence', ton: 'bleu' },
  contre: { l: 'Contre-proposition', ton: 'violet' },
  acceptee: { l: 'Acceptée', ton: 'vert' },
  refusee: { l: 'Refusée', ton: 'rouge' },
  echue: { l: 'Arrivée à échéance', ton: 'gris' },
  sans_suite: { l: 'Sans suite', ton: 'gris' },
  remplacee: { l: 'Remplacée', ton: 'gris' },
  annulee: { l: 'Annulée', ton: 'gris' },
};
/** Pour le client (espace). Aucun mot de métier. */
export const ETATS_CLIENT: Record<EtatOffre, { l: string; ton: Ton }> = {
  brouillon: { l: 'Offre en préparation', ton: 'or' },
  a_relire: { l: 'Chez votre conseiller', ton: 'or' },
  a_finaliser: { l: 'Offre en préparation', ton: 'or' },
  en_signature: { l: 'À signer', ton: 'or' },
  signee: { l: 'Offre signée', ton: 'bleu' },
  envoyee: { l: 'Offre envoyée', ton: 'bleu' },
  contre: { l: 'Réponse du vendeur', ton: 'violet' },
  acceptee: { l: 'Offre acceptée', ton: 'vert' },
  refusee: { l: 'Offre non retenue', ton: 'rouge' },
  echue: { l: 'Offre arrivée à échéance', ton: 'gris' },
  sans_suite: { l: 'Offre sans suite', ton: 'gris' },
  remplacee: { l: 'Remplacée', ton: 'gris' },
  annulee: { l: 'Annulée', ton: 'gris' },
};

/** Un moment du fil, pour l'historique (CRM et espace). */
export type Moment = { le: string; t: string; ton: Ton; offre: string };

/** L'historique d'un fil, du plus ancien au plus récent. `client` : les mots
    de l'espace (ni adresse de l'agence, ni honoraires détaillés, ni mot
    interne d'Alexandre) ; sinon ceux du CRM. Les brouillons du CRM ne
    comptent pas pour le client. */
/** Pour le CRM : « pour elle », « elle accepte » (la fiche du client). */
export type PronomsCrm = { pour: string; accepte: string };
const NEUTRE: PronomsCrm = { pour: 'le client', accepte: 'le client accepte' };

export function historiqueFil(fil: DocOffre[], o: { client?: boolean; maintenant?: number; pr?: PronomsCrm } = {}): Moment[] {
  const maintenant = o.maintenant ?? Date.now();
  const pr = o.pr || NEUTRE;
  const out: Moment[] = [];
  const visibles = o.client ? fil.filter(visiblePourClient) : fil;
  visibles.forEach(x => {
    const d = x.donnees || {};
    const s = lireSuivi(d);
    const prix = prixOffre(d), total = totalOffre(d);
    const n = rangVisible(fil, x);
    const rang = n ? rangOffre(n - 1) : 'offre en préparation';
    const qui = s.origine === 'espace' ? (o.client ? 'depuis votre espace' : 'depuis son espace') : '';
    if (total) {
      out.push({
        le: x.created_at, ton: 'or', offre: x.id,
        t: o.client
          ? `${rang.charAt(0).toUpperCase() + rang.slice(1)} : ${EUR(total)}, frais d’agence compris${s.depuisContre ? ' (vous acceptez la proposition du vendeur)' : ''}`
          : `${rang.charAt(0).toUpperCase() + rang.slice(1)}${qui ? ` ${qui}` : ''} : ${EUR(total)} frais d’agence compris${prix && prix !== total ? ` · ${EUR(prix)} pour le vendeur` : ''}${s.depuisContre ? ` · ${pr.accepte} la contre-proposition` : ''}${s.choix === 'relire' ? ' · à relire' : ''}`,
      });
    }
    if (x.statut === 'signe' && x.signe_le) out.push({ le: x.signe_le, ton: 'bleu', offre: x.id, t: o.client ? 'Offre signée' : 'Signée par tous' });
    for (const e of envoisOffre(x)) {
      out.push({ le: e.le, ton: 'bleu', offre: x.id, t: o.client ? 'Transmise au vendeur' : `Envoyée à ${e.a.join(', ') || 'l’agence'}` });
    }
    const r = s.reponse;
    if (r) {
      if (r.statut === 'contre' && r.montant) {
        const tc = totalContre(d, r.montant);
        out.push({
          le: r.le, ton: 'violet', offre: x.id,
          t: o.client
            ? `Le vendeur propose ${EUR(tc)}, frais d’agence compris${r.limite ? ` (jusqu’au ${JOUR(r.limite)})` : ''}`
            : `Contre-proposition : ${EUR(r.montant)} pour le vendeur, soit ${EUR(tc)} pour ${pr.pour} frais d’agence compris${r.limite ? ` · jusqu’au ${JOUR(r.limite)}` : ''}${r.note ? ` · ${r.note}` : ''}`,
        });
      } else if (r.statut === 'acceptee') {
        out.push({ le: r.le, ton: 'vert', offre: x.id, t: o.client ? 'Le vendeur accepte votre offre' : `Acceptée par le vendeur${r.note ? ` · ${r.note}` : ''}` });
      } else if (r.statut === 'refusee') {
        out.push({ le: r.le, ton: 'rouge', offre: x.id, t: o.client ? 'Le vendeur n’a pas retenu l’offre' : `Refusée par le vendeur${r.note ? ` · ${r.note}` : ''}` });
      }
    }
    if (s.close) out.push({ le: s.close.le, ton: 'gris', offre: x.id, t: o.client ? (s.close.par === 'client' ? 'Vous n’avez pas donné suite' : 'Sans suite') : `Sans suite${s.close.par === 'client' ? ', dit depuis son espace' : ''}` });
    const fin = finOffre(d);
    if (!r && !s.close && !s.remplacee_le && fin && fin.getTime() <= maintenant && (x.statut === 'signe' || !!x.signature)) {
      out.push({ le: fin.toISOString(), ton: 'gris', offre: x.id, t: o.client ? 'Arrivée à échéance, sans réponse du vendeur' : 'Arrivée à échéance sans réponse' });
    }
  });
  return out.sort((a, b) => a.le.localeCompare(b.le));
}

/** Le résumé d'une ligne, replié (« Contre-proposition : 480 000 € pour le vendeur »). */
export function resumeCrm(doc: DocOffre, maintenant = Date.now(), pr: PronomsCrm = NEUTRE): string {
  const e = etatDeOffre(doc, maintenant);
  const d = doc.donnees || {};
  const s = lireSuivi(d);
  const total = totalOffre(d);
  const fin = finOffre(d);
  const env = envoisOffre(doc);
  switch (e) {
    case 'a_relire': return `${total ? `${EUR(total)} frais d’agence compris` : 'Son offre'} · préparée dans son espace, à relire puis à envoyer pour signature`;
    case 'brouillon': return `${total ? `${EUR(total)} frais d’agence compris · ` : ''}brouillon dans Documents`;
    case 'a_finaliser': return `${total ? `${EUR(total)} frais d’agence compris · ` : ''}à envoyer pour signature`;
    case 'en_signature': return `${total ? `${EUR(total)} frais d’agence compris · ` : ''}en signature${fin ? `, valable jusqu’au ${JOUR(fin.toISOString())}` : ''}`;
    case 'signee': return `${total ? `${EUR(total)} frais d’agence compris · ` : ''}signée : envoie-la à l’agence`;
    case 'envoyee': return `${total ? `${EUR(total)} · ` : ''}envoyée le ${JOUR(env[env.length - 1].le)}${fin ? ` · réponse attendue avant le ${JOUR(fin.toISOString())}` : ''}`;
    case 'contre': return s.reponse?.montant
      ? `Le vendeur propose ${EUR(s.reponse.montant)} (${EUR(totalContre(d, s.reponse.montant))} pour ${pr.pour}) · ${contreDepassee(s.reponse, maintenant) ? 'proposition expirée' : 'en attente de sa réponse'}`
      : 'Contre-proposition';
    case 'acceptee': return `${total ? `${EUR(total)} frais d’agence compris · ` : ''}acceptée le ${JOUR(s.reponse!.le)}`;
    case 'refusee': return `Refusée le ${JOUR(s.reponse!.le)}`;
    case 'echue': return `Arrivée à échéance${fin ? ` le ${JOUR(fin.toISOString())}` : ''}, sans réponse`;
    case 'sans_suite': return `Sans suite depuis le ${JOUR(s.close!.le)}`;
    default: return '';
  }
}

/* ── Les relances qu'une offre pose (V3.189) ──
   Comme les autres relances nées de l'espace, on les reconnaît à leur
   début (« Offre à relire — <bien> ») : la page Relances les met en tête,
   et leur ouverture va dans l'onglet Visites de la fiche (intentions.ts). */
export const TETES_OFFRE = {
  relire: 'Offre à relire',
  envoyer: 'Offre signée, à envoyer',
  reponse: 'Offre en attente de réponse',
  contre: 'Contre-proposition à suivre',
} as const;
export const estRelanceOffre = (note: unknown) => /^(Offre à relire|Offre signée, à envoyer|Offre en attente de réponse|Contre-proposition à suivre) — /.test(String(note || ''));

/* ── Ce que l'espace du client reçoit, bien par bien (V3.189) ──
   Calculé côté serveur (offresPourEspace, src/lib/offres-serveur.ts) : le
   navigateur ne reçoit que ce qui le regarde — ni l'adresse de l'agence, ni
   le mot interne d'Alexandre. */
export type SaisieOffre = {
  acquereurs: { civilite: string; prenom: string; nom: string; naissanceDate: string; naissanceLieu: string; adresse: string; email: string; telephone: string }[];
  apport: number | null; pret: 'oui' | 'non' | null; pretMontant: number | null; pretDuree: number | null; pretTaux: number | null;
  conditions: string[]; venteBien: string; conditionAutre: string; notaire: string;
};
export type OffreEspace = {
  /** L'offre du moment (son document). */
  id: string;
  etat: EtatOffre;
  /** Une offre suivante se prépare chez son conseiller (« Elle accepte » du CRM). */
  enPreparation: boolean;
  /** 1 pour la 1re offre… */
  rang: number;
  total: number | null; prix: number | null; prixAffiche: number | null;
  /** La fin de validité (ISO). */
  fin: string | null;
  envoyeLe: string | null;
  /** SON lien de signature, quand il doit signer. */
  lien: string | null;
  /** Il a signé ; on attend ces personnes (prénoms). */
  vousSigne: boolean; attendus: string[];
  contre: { prix: number; total: number; limite: string | null; depassee: boolean; le: string } | null;
  reponseLe: string | null;
  historique: Moment[];
  saisie: SaisieOffre | null;
};
