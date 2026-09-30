/* ═══ Les demandes du site emilio-immo.com (V3.34) ════════════════════════
   Les formulaires du site (estimation, accompagnement acheteur, info sur un
   bien, contact) déposent leurs demandes dans la table `contact_submissions`
   de la base du CRM (outils/sql/demandes-site.sql). La clé publique du site
   ne peut que déposer ; le CRM connecté lit et range.

   Le site écrit une partie des réponses dans des colonnes (budget, type,
   secteur, délai) et le reste dans le message, une ligne « Clé : valeur »
   par réponse (« Financement: pret_obtenu », « Étage : 3 / 6 »…). On relit
   ces lignes ici pour les présenter en rubriques, et on traduit les codes
   des listes du site en mots (« pret_obtenu » → « Prêt obtenu »).

   Isomorphe : aucune dépendance au navigateur. */

import type { TypeContact } from '@/lib/contacts';

export type DemandeSite = {
  id: string;
  form_type: string;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  budget: string | null;
  property_type: string | null;
  desired_location: string | null;
  desired_surface: string | null;
  timeline: string | null;
  property_ref: string | null;
  property_title: string | null;
  is_called: boolean;
  admin_notes: string | null;
  created_at: string;
  statut: string;
  statut_le: string | null;
  a_rappeler_le: string | null;
  archive: boolean;
  archive_le: string | null;
  client_id: string | null;
};

export const TABLE_DEMANDES = 'contact_submissions';

/* L'adresse publique d'un bien du site (la page /biens/<id> du site). */
export const SITE_PUBLIC = 'https://www.emilio-immo.com';

/* ── Les catégories : une par formulaire du site ───────────────────────── */
export type CategorieDemande = 'estimation' | 'mandat_recherche' | 'rappel_bien' | 'contact';

export const CATEGORIES: {
  k: CategorieDemande; lib: string; court: string; pluriel: string;
  ic: string; c: string; fond: string; trait: string;
  /* Le type de contact qu'on propose à « Créer le contact ». */
  type: TypeContact | null;
}[] = [
  { k: 'estimation', lib: 'Estimation', court: 'Estimation', pluriel: 'Estimations', ic: 'euro', c: '#a07c28', fond: '#fbf6e9', trait: '#ecdcb0', type: 'vendeur' },
  { k: 'mandat_recherche', lib: 'Accompagnement acheteur', court: 'Acheteur', pluriel: 'Accompagnements', ic: 'loupe', c: '#0f7a4f', fond: '#ecfdf5', trait: '#bfe8d3', type: 'acheteur' },
  { k: 'rappel_bien', lib: 'Info sur un bien', court: 'Info bien', pluriel: 'Infos sur un bien', ic: 'maison', c: '#2f5fb3', fond: '#eef4ff', trait: '#c9daf8', type: 'acheteur' },
  { k: 'contact', lib: 'Demande générale', court: 'Message', pluriel: 'Messages', ic: 'bulle', c: '#34496e', fond: '#eef2f8', trait: '#d3dcea', type: null },
];
/* Un type inconnu (un futur formulaire) se range avec les demandes générales. */
export const categorieDe = (k: string | null | undefined) => CATEGORIES.find(c => c.k === k) || CATEGORIES[3];
export const cleCategorie = (d: Pick<DemandeSite, 'form_type'>): CategorieDemande => categorieDe(d.form_type).k;

/* ── Les statuts ───────────────────────────────────────────────────────── */
export type StatutDemande = 'nouveau' | 'en_cours' | 'traite';

export const STATUTS: { k: StatutDemande; lib: string; pluriel: string; c: string; fond: string; trait: string; ic: string }[] = [
  { k: 'nouveau', lib: 'Nouvelle', pluriel: 'Nouvelles', c: '#dc2626', fond: '#fef2f2', trait: '#fecaca', ic: 'etincelle' },
  { k: 'en_cours', lib: 'En cours', pluriel: 'En cours', c: '#2563eb', fond: '#eff6ff', trait: '#bfdbfe', ic: 'horloge' },
  { k: 'traite', lib: 'Traitée', pluriel: 'Traitées', c: '#0f7a4f', fond: '#ecfdf5', trait: '#a7f3d0', ic: 'check' },
];
export const statutDe = (k: string | null | undefined) => STATUTS.find(s => s.k === k) || STATUTS[0];

/* ── Les codes des listes du site, en mots ─────────────────────────────── */
const TYPES_BIEN: Record<string, string> = {
  appartement: 'Appartement', maison: 'Maison', terrain: 'Terrain', commerce: 'Local commercial', immeuble: 'Immeuble',
};
const DELAIS: Record<string, string> = {
  urgent: 'Urgent (moins d’un mois)', '1-3mois': '1 à 3 mois', '3-6mois': '3 à 6 mois', '6mois+': 'Plus de 6 mois',
};
const FINANCEMENTS: Record<string, string> = {
  pret_obtenu: 'Prêt obtenu', pret_en_cours: 'Prêt en cours', comptant: 'Achat comptant', non_commence: 'Pas encore commencé',
};
const PIECES: Record<string, string> = {
  '1': 'Studio / 1 pièce', '2': '2 pièces', '3': '3 pièces', '4': '4 pièces', '5+': '5 pièces et plus',
};
const ETAGES: Record<string, string> = {
  rdc: 'Rez-de-chaussée', tout_sauf_rdc: 'Tout sauf le rez-de-chaussée', etage_bas: 'Étage bas (1 à 3)',
  etage_haut: 'Étage élevé (4 et plus)', dernier: 'Dernier étage',
};
const EXTERIEURS: Record<string, string> = { balcon: 'Balcon', terrasse: 'Terrasse', jardin: 'Jardin' };
const PRIORITES: Record<string, string> = {
  calme: 'Calme', commerces: 'Proche des commerces', ecoles: 'Proche des écoles', luminosite: 'Luminosité',
  parking: 'Parking, stationnement', standing: 'Standing de l’immeuble', transports: 'Proche des transports',
  travaux: 'Pas de travaux', vue: 'Vue dégagée',
};

const majuscule = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const traduire = (table: Record<string, string>, v: string | null | undefined) => {
  const t = String(v ?? '').trim();
  if (!t) return '';
  return table[t.toLowerCase()] || majuscule(t.replace(/_/g, ' '));
};
export const typeBien = (v: string | null | undefined) => traduire(TYPES_BIEN, v);
export const delai = (v: string | null | undefined) => traduire(DELAIS, v);

/* Un montant en entier, avec ses séparateurs (« 1 500 000 € »), jamais
   abrégé. Le site laisse la saisie libre : « 350000 - 400000 », « 1 100 000 »,
   « 480k »… Chaque nombre est remis en forme, le reste est gardé tel quel. */
export function montant(v: string | null | undefined): string {
  const t = String(v ?? '').trim();
  if (!t) return '';
  const parties = t.split(/\s*[-–à]\s*(?=\d)|\s+-\s+/);
  const joli = parties.map(p => {
    const brut = p.replace(/[\s  .€]/g, '').replace(/eur(os?)?$/i, '');
    const k = /^(\d+(?:[.,]\d+)?)k$/i.exec(brut);
    const n = k ? Math.round(parseFloat(k[1].replace(',', '.')) * 1000) : /^\d+$/.test(brut) ? Number(brut) : NaN;
    return Number.isFinite(n) && n > 0 ? `${n.toLocaleString('fr-FR').replace(/[\u202f\s]/g, '\u00a0')}\u00a0€` : p.trim();
  });
  return joli.join(' – ');
}

/* Une surface : « 65 » → « 65 m² », « 30-35 » → « 30 à 35 m² ». */
const surface = (v: string | null | undefined) => {
  const t = String(v ?? '').trim();
  if (!t) return '';
  if (/m²|m2/i.test(t)) return t.replace(/m2/i, 'm²');
  if (/^\d+([.,]\d+)?$/.test(t)) return `${t}\u00a0m²`;
  const f = /^(\d+)\s*[-–à]\s*(\d+)$/.exec(t);
  return f ? `${f[1]} à ${f[2]}\u00a0m²` : t;
};

/* Un secteur saisi sur plusieurs lignes (« Garches⏎Suresnes ») : une ligne. */
const propre = (v: string | null | undefined) =>
  String(v ?? '').split(/\s*\n\s*/).map(x => x.trim()).filter(Boolean).join(', ').replace(/[ \t]{2,}/g, ' ');

/* ── Le message, relu ligne par ligne ──────────────────────────────────── */
export type Champ = { l: string; v: string };
export type Lecture = {
  champs: Champ[];          // « Clé : valeur », dans l'ordre du message
  atouts: string[];         // « Balcon ✓ », « RDC », « Dernier étage »
  dvf: { texte: string; fourchette: string | null; ventes: string | null } | null;
  libre: string;            // tout ce qui n'est pas une réponse rangée
};

const ATOUT = /^(.+?)\s*✓$/;
const DRAPEAUX = new Set(['RDC', 'Dernier étage']);

export function lireMessage(message: string | null | undefined): Lecture {
  const out: Lecture = { champs: [], atouts: [], dvf: null, libre: '' };
  const libres: string[] = [];
  for (const brute of String(message ?? '').split('\n')) {
    const l = brute.trim();
    if (!l) { if (libres.length && libres[libres.length - 1] !== '') libres.push(''); continue; }
    if (/^→\s*Estimation DVF/i.test(l)) {
      const texte = l.replace(/^→\s*/, '').replace(/^Estimation DVF( auto)?\s*:\s*/i, '');
      const m = /^(.+?)\s*\((\d+)\s*ventes?\)\s*$/.exec(texte);
      out.dvf = { texte, fourchette: m ? m[1] : /\d/.test(texte) ? texte : null, ventes: m ? m[2] : null };
      continue;
    }
    const a = ATOUT.exec(l);
    if (a) { out.atouts.push(a[1]); continue; }
    if (DRAPEAUX.has(l)) { out.atouts.push(l); continue; }
    /* « Clé : valeur » — une clé courte, sans point final, qui ne soit pas
       une phrase (« Voici concrètement notre travail : » reste du texte). */
    const kv = /^([^:]{2,28}?)\s*:\s*(.+)$/.exec(l);
    if (kv && !/[.!?]/.test(kv[1]) && kv[1].split(/\s+/).length <= 4 && !/^https?$/i.test(kv[1])) {
      out.champs.push({ l: kv[1].trim(), v: kv[2].trim() });
      continue;
    }
    libres.push(l);
  }
  out.libre = libres.join('\n').trim();
  return out;
}

const cle = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const trouver = (champs: Champ[], ...noms: string[]) => champs.find(c => noms.includes(cle(c.l)))?.v || '';

/* ── La demande, en rubriques ──────────────────────────────────────────── */
export type Rubrique = { titre: string; ic: string; champs: Champ[]; puces?: string[]; numerotees?: boolean };
export type Presentation = {
  rubriques: Rubrique[];
  dvf: Lecture['dvf'];
  message: string;          // le message du client, s'il en a laissé un
  bien: { titre: string; ref: string; lien: string } | null;
};

/* Les formulaires qui écrivent leurs réponses « Clé : valeur » dans le message. */
const STRUCTURES = new Set<CategorieDemande>(['estimation', 'mandat_recherche']);

export function presenter(d: DemandeSite): Presentation {
  const lu = lireMessage(d.message);
  const c = lu.champs;
  const utilises = new Set<string>();
  const pris = (...noms: string[]) => { noms.forEach(n => utilises.add(n)); return trouver(c, ...noms); };
  const garder = (l: string, v: string): Champ[] => (v ? [{ l, v }] : []);
  const rubriques: Rubrique[] = [];
  let bien: Presentation['bien'] = null;
  const cat = cleCategorie(d);

  if (cat === 'estimation') {
    /* Chaque réponse est prise (et marquée comme rangée) avant d'être
       choisie : une colonne remplie ne doit pas renvoyer la même réponse du
       message dans « Autres réponses ». */
    const r = {
      type: pris('type'), surface: pris('surface'), pieces: pris('pieces'), chambres: pris('chambres'),
      etage: pris('etage'), exposition: pris('exposition'), etat: pris('etat'),
      adresse: pris('adresse'), cp: pris('code postal'), ville: pris('ville'),
      delai: pris('delai projet', 'delai'), raison: pris('raison'),
    };
    const leBien = [
      ...garder('Type', typeBien(d.property_type || r.type)),
      ...garder('Surface', surface(d.desired_surface || r.surface)),
      ...garder('Pièces', r.pieces ? (/^\d+$/.test(r.pieces) ? `${r.pieces} pièce${Number(r.pieces) > 1 ? 's' : ''}` : r.pieces) : ''),
      ...garder('Chambres', r.chambres),
      ...garder('Étage', r.etage),
      ...garder('Exposition', r.exposition),
      ...garder('État', r.etat),
    ];
    if (leBien.length || lu.atouts.length) rubriques.push({ titre: 'Le bien', ic: 'maison', champs: leBien, puces: lu.atouts });
    const ville = [r.cp, r.ville].filter(Boolean).join(' ') || propre(d.desired_location);
    const ou = [...garder('Adresse', r.adresse), ...garder('Ville', r.adresse ? '' : ville)];
    if (ou.length) rubriques.push({ titre: 'Où', ic: 'lieu', champs: ou });
    const projet = [...garder('Délai', delai(d.timeline || r.delai)), ...garder('Raison', r.raison)];
    if (projet.length) rubriques.push({ titre: 'Son projet', ic: 'calendrier', champs: projet });
  }

  if (cat === 'mandat_recherche') {
    const recherche = [
      ...garder('Type de bien', typeBien(d.property_type)),
      ...garder('Budget', montant(d.budget)),
      ...garder('Secteur', propre(d.desired_location)),
      ...garder('Surface', surface(d.desired_surface)),
      ...garder('Pièces', traduire(PIECES, pris('pieces'))),
      ...garder('Étage', traduire(ETAGES, pris('etage'))),
      ...garder('Extérieur', traduire(EXTERIEURS, pris('exterieur'))),
    ];
    if (recherche.length) rubriques.push({ titre: 'Sa recherche', ic: 'loupe', champs: recherche });
    const priorites = ['priorite 1', 'priorite 2', 'priorite 3'].map(k => traduire(PRIORITES, pris(k))).filter(Boolean);
    if (priorites.length) rubriques.push({ titre: 'Ses priorités', ic: 'etoile', champs: [], puces: priorites, numerotees: true });
    const projet = [
      ...garder('Délai', delai(d.timeline)),
      ...garder('Financement', traduire(FINANCEMENTS, pris('financement'))),
    ];
    if (projet.length) rubriques.push({ titre: 'Son projet', ic: 'calendrier', champs: projet });
  }

  if (cat === 'rappel_bien') {
    if (d.property_ref || d.property_title) {
      bien = {
        titre: d.property_title || 'Bien du site',
        ref: d.property_ref || '',
        lien: d.property_ref ? `${SITE_PUBLIC}/biens/${encodeURIComponent(d.property_ref)}` : '',
      };
    }
    /* Le site écrivait parfois le bien dans le message aussi. */
    utilises.add('bien concerne');
  }

  /* Ce que le client a écrit lui-même : la ligne « Message : … », ou le texte
     libre (le formulaire de contact n'a que lui). Les réponses non rangées
     plus haut (un champ qu'un futur formulaire ajouterait) ne se perdent pas :
     elles vont dans « Autres réponses ». */
  /* Le formulaire de contact et la demande sur un bien n'ont qu'un champ
     libre : le message se lit tel que le client l'a écrit, sans chercher
     de « Clé : valeur » dans ses phrases. */
  if (!STRUCTURES.has(cat)) return { rubriques, dvf: null, message: String(d.message || '').trim(), bien };
  const mot = pris('message');
  const restes = c.filter(x => !utilises.has(cle(x.l)));
  if (restes.length) rubriques.push({ titre: 'Autres réponses', ic: 'liste', champs: restes });
  const message = [mot, lu.libre].filter(Boolean).join('\n\n').trim();

  return { rubriques, dvf: lu.dvf, message, bien };
}

/* La ligne de résumé d'une demande, dans la liste. */
export function resume(d: DemandeSite): string {
  const cat = cleCategorie(d);
  const lu = lireMessage(d.message);
  const c = lu.champs;
  if (cat === 'estimation') {
    const adresse = trouver(c, 'adresse');
    const lieu = propre(d.desired_location) || (adresse ? adresse.split(',').slice(-1)[0].trim() : '') || trouver(c, 'ville');
    const pieces = trouver(c, 'pieces');
    return [typeBien(d.property_type || trouver(c, 'type')), pieces ? `${pieces} p.` : '', surface(d.desired_surface || trouver(c, 'surface')), lieu]
      .filter(Boolean).join(' · ');
  }
  if (cat === 'mandat_recherche') {
    return [typeBien(d.property_type), montant(d.budget), propre(d.desired_location), delai(d.timeline)].filter(Boolean).join(' · ');
  }
  if (cat === 'rappel_bien') return d.property_title || 'Un bien du site';
  const texte = String(d.message || '').replace(/\s+/g, ' ').trim();
  return texte.length > 140 ? `${texte.slice(0, 138).trim()}…` : texte;
}

/* La fourchette DVF d'une estimation, pour la liste. */
export const fourchetteDvf = (d: DemandeSite) => (cleCategorie(d) === 'estimation' ? lireMessage(d.message).dvf?.fourchette || null : null);

/* ── Chercher ──────────────────────────────────────────────────────────── */
export const normer = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function correspond(d: DemandeSite, q: string): boolean {
  const s = normer(q.trim());
  if (!s) return true;
  const chiffres = q.replace(/\D/g, '');
  const tout = normer([d.name, d.email, d.phone, d.message, d.desired_location, d.property_title, d.property_ref, d.admin_notes, d.budget, categorieDe(d.form_type).lib].filter(Boolean).join(' '));
  if (tout.includes(s)) return true;
  /* « 06 12 34 » retrouve « 0612345678 ». */
  return chiffres.length >= 4 && String(d.phone || '').replace(/\D/g, '').includes(chiffres);
}

/* ── Le nom ────────────────────────────────────────────────────────────── */
export function prenomNom(nom: string): { prenom: string; nom: string } {
  const mots = String(nom || '').trim().split(/\s+/).filter(Boolean);
  if (mots.length <= 1) return { prenom: mots[0] || '', nom: '' };
  return { prenom: mots[0], nom: mots.slice(1).join(' ') };
}
export const initiales = (nom: string) => {
  const { prenom, nom: n } = prenomNom(nom);
  return ((prenom.charAt(0) || '') + (n.charAt(0) || '')).toUpperCase() || '?';
};

/* Un e-mail vide ou manifestement faux (« a@a ») ne s'affiche pas en lien. */
export const emailUtile = (e: string | null | undefined) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
export const telUtile = (t: string | null | undefined) => String(t || '').replace(/\D/g, '').length >= 8;
/* « 0612345678 » → « 06 12 34 56 78 ». */
export function joliTel(t: string | null | undefined): string {
  const brut = String(t || '').trim();
  const n = brut.replace(/\D/g, '');
  if (n.length === 10 && n.startsWith('0')) return n.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  if (n.length === 11 && n.startsWith('33')) return `+33 ${n.slice(2).replace(/^(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5')}`;
  return brut;
}

/* ── Les dates ─────────────────────────────────────────────────────────── */
export function depuis(iso: string, maintenant = Date.now()): string {
  const min = Math.max(0, Math.floor((maintenant - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j === 1) return 'hier';
  if (j < 7) return `il y a ${j} jours`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: new Date(iso).getFullYear() === new Date(maintenant).getFullYear() ? undefined : 'numeric' });
}
/* « mardi 9 septembre 2026 à 14:32 » (en minuscules : il suit « Reçue le »). */
export const dateLongue = (iso: string) => {
  const d = new Date(iso);
  const t = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `${t} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};
/* Le groupe d'une demande dans la liste : aujourd'hui, cette semaine… */
export function periode(iso: string, maintenant = new Date()): string {
  const d = new Date(iso);
  const jour = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ecart = Math.round((jour(maintenant) - jour(d)) / 86_400_000);
  if (ecart <= 0) return 'Aujourd’hui';
  if (ecart === 1) return 'Hier';
  if (ecart < 7) return 'Cette semaine';
  if (ecart < 31) return 'Ce mois-ci';
  const t = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return majuscule(t);
}
/* Le jour, au format de la base (AAAA-MM-JJ), à l'heure de l'ordinateur. */
export const jourIso = (x = new Date()) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
/* Une date « à rappeler » : 'retard' (passée), 'jour' (aujourd'hui), 'plus_tard', ou null. */
export function rappel(v: string | null | undefined, maintenant = new Date()): 'retard' | 'jour' | 'plus_tard' | null {
  if (!v) return null;
  const j = jourIso(maintenant), x = v.slice(0, 10);
  return x < j ? 'retard' : x === j ? 'jour' : 'plus_tard';
}
export const rappelDu = (v: string | null | undefined, maintenant = new Date()) => {
  const r = rappel(v, maintenant);
  return r === 'retard' || r === 'jour';
};

/* ── « Créer le contact » depuis une demande ───────────────────────────────
   La fenêtre « Nouveau contact » de Contacts s'ouvre, seule, par-dessus la
   rubrique Demandes du site (prop `fenetre` de Clients), remplie avec ce que
   le client a donné ; une fois le contact créé, la demande lui est reliée et
   passe en « Traitée ». */
export type PreRemplissage = {
  demandeId: string;
  prenom: string; nom: string; email: string; tel: string;
  types: TypeContact[];
  source_detail: string;
  notes: string;
};
export function preRemplissage(d: DemandeSite): PreRemplissage {
  const cat = categorieDe(d.form_type);
  const p = presenter(d);
  const { prenom, nom } = prenomNom(d.name);
  const lignes = [
    `Demande reçue sur le site le ${new Date(d.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} (${cat.lib.toLowerCase()}).`,
    ...p.rubriques.flatMap(r => [...r.champs.map(x => `${x.l} : ${x.v}`), ...(r.puces || []).map((x, i) => (r.numerotees ? `Priorité ${i + 1} : ${x}` : x))]),
    p.bien ? `Bien : ${p.bien.titre}${p.bien.ref ? ` (réf. ${p.bien.ref})` : ''}` : '',
    p.dvf?.fourchette ? `Estimation DVF du site : ${p.dvf.fourchette}` : '',
    p.message ? `Son message : ${p.message}` : '',
  ].filter(Boolean);
  return {
    demandeId: d.id,
    prenom, nom,
    email: emailUtile(d.email) ? d.email.trim().toLowerCase() : '',
    tel: telUtile(d.phone) ? joliTel(d.phone) : '',
    types: cat.type ? [cat.type] : [],
    source_detail: `Formulaire « ${cat.lib} »`,
    notes: lignes.join('\n'),
  };
}

/* L'erreur d'une base où outils/sql/demandes-site.sql n'est pas encore passé. */
export const tableAbsente = (m: string) =>
  /contact_submissions/i.test(m) && /(does not exist|schema cache|could not find|relation)/i.test(m);

/* ── Les robots ────────────────────────────────────────────────────────────
   Des robots remplissent les formulaires avec des lettres au hasard
   (« ncgloKTWasSFnLzKxi »), en nom comme en message. Un mot seul, sans
   espace, fait de lettres dont la casse change sans arrêt : aucun humain
   n'écrit comme ça. On le signale, on ne supprime jamais tout seul. */
export function charabia(t: string | null | undefined): boolean {
  const x = String(t ?? '').trim();
  if (x.length < 8 || /\s/.test(x) || !/^[A-Za-z]+$/.test(x)) return false;
  return (x.match(/[a-z][A-Z]|[A-Z][a-z]/g) || []).length >= 4;
}
export const robot = (d: Pick<DemandeSite, 'name' | 'message'>) => {
  const mots = String(d.name || '').trim().split(/\s+/);
  return mots.some(charabia) || charabia(d.message);
};
