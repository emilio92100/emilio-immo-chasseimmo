/* ═══ Les types de contact ════════════════════════════════════════════════
   Un contact du CRM n'est plus forcément un acheteur. Il porte un ou
   plusieurs types (colonne `clients.types`, voir outils/sql/types-contact.sql) :
   acheteur, vendeur, propriétaire, notaire, confrère ou agence, gardien,
   partenaire. Ce qui est propre à chaque type vit dans `clients.pro`.

   « Acheteur non filtré » n'est pas un type : c'est un acheteur dont la
   recherche n'a pas encore de critères. Il se calcule.

   Avant le SQL, la colonne n'existe pas : tout contact est un acheteur,
   comme avant. Ce fichier est isomorphe (CRM et bancs d'essai). */

export type TypeContact = 'acheteur' | 'vendeur' | 'proprietaire' | 'notaire' | 'confrere' | 'gardien' | 'partenaire';

export const TYPES_CONTACT: { k: TypeContact; lib: string; pluriel: string; ic: string; c: string; fond: string; aide: string }[] = [
  { k: 'acheteur', lib: 'Acheteur', pluriel: 'Acheteurs', ic: 'cible', c: '#0f7a4f', fond: '#ecfdf5', aide: 'Il cherche à acheter : sa recherche, son espace, la veille.' },
  { k: 'vendeur', lib: 'Vendeur', pluriel: 'Vendeurs', ic: 'etiquette', c: '#a07c28', fond: '#fbf6e9', aide: 'Il vend un bien : estimation, mandat, dans la rubrique Biens.' },
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
/* Les contacts « particuliers » (on les suit pour un achat ou une vente)
   par opposition aux professionnels. */
export const PARTICULIERS: TypeContact[] = ['acheteur', 'vendeur', 'proprietaire'];
export const estPro = (types: TypeContact[]) => !types.some(t => PARTICULIERS.includes(t));

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
export type InfosPro = {
  agence?: string; statutPro?: 'salarie' | 'mandataire' | 'independant' | ''; reseau?: string; adresseAgence?: string; siteWeb?: string;
  etude?: string; adresseEtude?: string; clerc?: string; clercTel?: string;
  immeuble?: string; horaires?: string; acces?: string;
  metier?: string; societe?: string;
};
export const lirePro = (x: unknown): InfosPro => (x && typeof x === 'object' && !Array.isArray(x) ? x as InfosPro : {});
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
  return '';
}
function villeDe(adr?: string) {
  if (!adr) return '';
  const m = adr.match(/\d{5}\s+(.+)$/);
  return m ? m[1].trim() : '';
}
