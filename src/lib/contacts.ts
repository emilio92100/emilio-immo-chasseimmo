/* ═══ Les types de contact ════════════════════════════════════════════════
   Un contact du CRM n'est plus forcément un acheteur. Il porte un ou
   plusieurs types (colonne `clients.types`, voir outils/sql/types-contact.sql) :
   acheteur, vendeur, propriétaire, notaire, confrère ou agence, gardien,
   partenaire. Ce qui est propre à chaque type vit dans `clients.pro`.

   « Acheteur non filtré » n'est pas un type : c'est un acheteur dont la
   recherche n'a pas encore de critères. Il se calcule.

   Avant le SQL, la colonne n'existe pas : tout contact est un acheteur,
   comme avant. Ce fichier est isomorphe (CRM et bancs d'essai). */

export type TypeContact = 'acheteur' | 'vendeur' | 'vendeur_signe' | 'proprietaire' | 'notaire' | 'confrere' | 'gardien' | 'partenaire';

export const TYPES_CONTACT: { k: TypeContact; lib: string; pluriel: string; ic: string; c: string; fond: string; aide: string }[] = [
  { k: 'acheteur', lib: 'Acheteur', pluriel: 'Acheteurs', ic: 'cible', c: '#0f7a4f', fond: '#ecfdf5', aide: 'Il cherche à acheter : sa recherche, son espace, la veille.' },
  { k: 'vendeur', lib: 'Vendeur', pluriel: 'Vendeurs', ic: 'etiquette', c: '#a07c28', fond: '#fbf6e9', aide: 'Il vend un bien : estimation, mandat, dans la rubrique Biens.' },
  /* V3.47 : sa vente est signée chez le notaire. Il quitte les vendeurs en
     cours, sans être archivé : un ancien client, une recommandation, un
     prochain projet. Proposé dans « La vente est signée ». */
  { k: 'vendeur_signe', lib: 'Vendeur signé', pluriel: 'Vendeurs signés', ic: 'check', c: '#15803d', fond: '#f0fdf4', aide: 'Sa vente est signée : un ancien client, pour une recommandation ou un prochain projet.' },
  { k: 'proprietaire', lib: 'Propriétaire', pluriel: 'Propriétaires', ic: 'cle', c: '#b45309', fond: '#fff7ed', aide: 'Il possède un bien sans le vendre pour l’instant : un vendeur de demain.' },
  { k: 'notaire', lib: 'Notaire', pluriel: 'Notaires', ic: 'balance', c: '#34496e', fond: '#eef2f8', aide: 'Son étude, son clerc : pour les compromis et les actes.' },
  { k: 'confrere', lib: 'Confrère ou agence', pluriel: 'Confrères', ic: 'agence', c: '#7c3aed', fond: '#f5f3ff', aide: 'Un agent, un mandataire, une agence : pour les biens partagés.' },
  { k: 'gardien', lib: 'Gardien', pluriel: 'Gardiens', ic: 'immeuble', c: '#0e7490', fond: '#ecfeff', aide: 'Le gardien d’un immeuble : ses horaires, les clés, les infos.' },
  { k: 'partenaire', lib: 'Partenaire', pluriel: 'Partenaires', ic: 'outil', c: '#475569', fond: '#f1f5f9', aide: 'Courtier, diagnostiqueur, artisan, syndic, avocat…' },
];
export const typeDe = (k: string) => TYPES_CONTACT.find(t => t.k === k) || TYPES_CONTACT[0];
/* L'erreur d'une base où le SQL des types n'est pas encore passé. */
export const colonneContactAbsente = (m: string) => /(types|pro|archive).*(column|schema cache)|column .*(types|pro|archive)|could not find the '(types|pro|archive)'/i.test(m);

type AvecTypes = { types?: unknown; pro?: unknown; archive?: unknown };
/* Les types d'un contact. Sans la colonne (avant le SQL) ou vide : acheteur. */
export function typesDe(c: AvecTypes | null | undefined): TypeContact[] {
  const l = Array.isArray(c?.types) ? (c!.types as unknown[]).filter((x): x is TypeContact => typeof x === 'string' && TYPES_CONTACT.some(t => t.k === x)) : [];
  return l.length ? TYPES_CONTACT.map(t => t.k).filter(k => l.includes(k)) : ['acheteur'];
}
export const estAcheteur = (c: AvecTypes | null | undefined) => typesDe(c).includes('acheteur');
export const estArchive = (c: AvecTypes | null | undefined) => c?.archive === true;
/* V3.50 : à qui parlent les automatismes d'achat (point automatique, alertes
   de rapprochement) : un acheteur, pas archivé. Sans la colonne des types
   (avant le SQL) ou vide, un contact reste un acheteur, comme avant. */
export const acheteurEnCours = (c: AvecTypes | null | undefined) => estAcheteur(c) && !estArchive(c);
/* Les contacts « particuliers » (on les suit pour un achat ou une vente)
   par opposition aux professionnels. */
export const PARTICULIERS: TypeContact[] = ['acheteur', 'vendeur', 'vendeur_signe', 'proprietaire'];
/* Vend, a vendu ou possède un bien : ses biens, sa société s'affichent (V3.47). */
export const aUnBien = (t: TypeContact[]) => t.includes('vendeur') || t.includes('vendeur_signe') || t.includes('proprietaire');
export const estPro = (types: TypeContact[]) => !types.some(t => PARTICULIERS.includes(t));
/* V3.50 : « Revente possible » (bien_actuel_a_vendre). Un vendeur signé a
   vendu : la case, restée cochée d'avant sa vente, ne veut plus rien dire. */
export const reventePossible = (c: (AvecTypes & { bien_actuel_a_vendre?: unknown }) | null | undefined) =>
  !!c?.bien_actuel_a_vendre && !typesDe(c).includes('vendeur_signe');

/* Un acheteur « non filtré » : sa recherche n'a encore aucun critère. On lit
   les colonnes fusionnées sur le contact par la liste (la recherche
   d'affichage), ou celles de la recherche elle-même. */
export function sansCriteres(x: object | null | undefined): boolean {
  if (!x) return true;
  const r = x as Record<string, unknown>;
  const vide = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0) || v === 0;
  return ['type_bien', 'budget_min', 'budget_max', 'surface_min', 'surface_max', 'nb_pieces_min', 'nb_pieces_max', 'secteurs', 'chambres_min'].every(k => vide(r[k]));
}

/* ── Ce qui est propre à chaque type (clients.pro) ── */
/* Un confrère : ce que la délégation de mandat imprime sur lui (V3.19).
   Écrit sur sa fiche à chaque délégation finalisée, repris à la suivante. */
export type Juridique = {
  societe?: string; forme?: string; capital?: string; siege?: string; rcs?: string;
  carte?: string; cci?: string; fonds?: 'garantie' | 'aucun'; garant?: string; rcp?: string; qualite?: string;
  /* La date de la délégation d'où ça vient (AAAA-MM-JJ). */
  le?: string;
};
/* La société qu'un contact représente (V3.30) : une SCI qui vend, dont il
   est associé ou gérant. Rangée dans sa fiche (clients.pro, pas de SQL),
   avec ses associés — chacun avec son rôle, son téléphone et son e-mail. */
export type Associe = { id: string; nom: string; role: string; tel: string; email: string };
export type Structure = {
  denomination: string; forme: string; rcs: string; siege: string;
  /* Son rôle à lui : gérant, associé, interlocuteur pour la vente… */
  qualite: string; associes: Associe[];
};
export const FORMES_SOCIETE = ['SCI', 'SARL', 'SAS', 'SA', 'SNC', 'Autre'];
export const ROLES_SOCIETE = ['Gérant', 'Gérante', 'Associé', 'Associée', 'Président', 'Mandataire'];
export function lireStructure(x: unknown): Structure | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const t = (k: string) => (typeof o[k] === 'string' ? String(o[k]) : '');
  const associes = (Array.isArray(o.associes) ? o.associes : []).map((a, i) => {
    const y = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
    const u = (k: string) => (typeof y[k] === 'string' ? String(y[k]) : '');
    return { id: u('id') || `a${i}`, nom: u('nom'), role: u('role'), tel: u('tel'), email: u('email') };
  }).filter(a => a.nom || a.tel || a.email);
  const s = { denomination: t('denomination'), forme: t('forme'), rcs: t('rcs'), siege: t('siege'), qualite: t('qualite'), associes };
  return s.denomination || s.associes.length ? s : null;
}
export type InfosPro = {
  agence?: string; statutPro?: 'salarie' | 'mandataire' | 'independant' | ''; reseau?: string; adresseAgence?: string; siteWeb?: string;
  etude?: string; adresseEtude?: string; clerc?: string; clercTel?: string;
  immeuble?: string; horaires?: string; acces?: string;
  metier?: string; societe?: string;
  juridique?: Juridique;
  structure?: Structure;
};
export const lirePro = (x: unknown): InfosPro => (x && typeof x === 'object' && !Array.isArray(x) ? x as InfosPro : {});
/* La société saisie dans le formulaire (V3.31) : gardée si elle a un nom ou
   des associés, nettoyée ; sinon retirée (on avait coché « Pour une
   société » sans rien écrire). */
export function structurePropre(p: InfosPro): InfosPro {
  if (p.structure === undefined) return p;
  const st = lireStructure(p.structure);
  const { structure: _, ...reste } = p;
  void _;
  return st ? { ...reste, structure: { ...st, denomination: st.denomination.trim(), qualite: st.qualite.trim() } } : reste;
}
export const STATUTS_PRO: { v: 'salarie' | 'mandataire' | 'independant'; l: string; aide: string }[] = [
  { v: 'salarie', l: 'Salarié d’une agence', aide: 'Il travaille pour une agence' },
  { v: 'mandataire', l: 'Mandataire', aide: 'Réseau : IAD, SAFTI, Capifrance…' },
  { v: 'independant', l: 'À son compte', aide: 'Son agence, sa carte' },
];
export const METIERS = ['Courtier', 'Diagnostiqueur', 'Artisan', 'Architecte', 'Syndic', 'Avocat', 'Banquier', 'Déménageur'];

/* La ligne qui dit qui c'est, sous le nom : « Mandataire IAD · Agence du
   Parc », « Étude Durand · Boulogne », « Gardien · 12 rue de Silly ». */
export function ligneContact(c: AvecTypes & { adresse?: string | null }): string {
  const t = typesDe(c);
  const p = lirePro(c.pro);
  if (t.includes('confrere')) {
    const st = p.statutPro === 'mandataire' ? `Mandataire${p.reseau ? ` ${p.reseau}` : ''}` : p.statutPro === 'independant' ? 'À son compte' : p.statutPro === 'salarie' ? 'Agent immobilier' : '';
    return [st, p.agence].filter(Boolean).join(' · ') || 'Confrère';
  }
  if (t.includes('notaire')) return [p.etude || 'Notaire', villeDe(p.adresseEtude)].filter(Boolean).join(' · ');
  if (t.includes('gardien')) return [`Gardien${p.immeuble ? ` · ${p.immeuble}` : ''}`, p.horaires].filter(Boolean).join(' · ');
  if (t.includes('partenaire')) return [p.metier || 'Partenaire', p.societe].filter(Boolean).join(' · ');
  /* Un vendeur qui représente une société : « Associée · SCI AVIENA » (V3.30). */
  const st = lireStructure(p.structure);
  if (st?.denomination) return [st.qualite, st.denomination].filter(Boolean).join(' · ');
  return '';
}
function villeDe(adr?: string) {
  if (!adr) return '';
  const m = adr.match(/\d{5}\s+(.+)$/);
  return m ? m[1].trim() : '';
}
