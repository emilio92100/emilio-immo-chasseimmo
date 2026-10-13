/* ═══ Les annonces envoyées par le client depuis son espace (V3.184) ═══════
   Une seule source pour l'espace (page.tsx, EspaceClient), la route qui les
   reçoit (/api/espace/annonce) et le CRM (onglet Veille, Sélection,
   Présentés). Rien ici ne lit la base : des outils purs, sans Supabase.

   Le client colle un lien, ou prend une photo (une affiche en vitrine, un
   panneau « À vendre »), dit ce qui lui plaît et laisse un mot. Alexandre la
   regarde dans l'onglet Veille : il l'écarte avec un mot que le client lit,
   ou il remplit la fiche et elle part en Sélection. Envoyée, elle arrive
   chez lui dans « Ça lui plaît » (outils/sql/annonces-client.sql). */

/* « Ce qui vous plaît » : des mots qui valent pour une maison comme pour un
   appartement (« le jardin » ne disait rien d'un 3 pièces). */
export const AIMES = ['Le quartier', 'Les volumes', 'La lumière', 'L’extérieur', 'Le prix', 'Le charme'];

export const PHOTOS_MAX = 4;

/* Le lien tel qu'il est gardé : https:// ajouté s'il manque, sans ce qui
   suit le # ni les paramètres de suivi (utm_…, fbclid…). Deux envois du
   même lien se reconnaissent ainsi, même copiés de deux façons. Rien qui
   ressemble à une adresse de site : null. */
export function lienPropre(brut: unknown): string | null {
  if (typeof brut !== 'string') return null;
  let s = brut.trim().replace(/\s+/g, '');
  if (!s || s.length > 2000) return null;
  /* Un lien partagé depuis une application arrive parfois au milieu d'un
     texte (« Regarde cette annonce https://… ») : on garde le lien. */
  const dedans = /https?:\/\/\S+/i.exec(brut.trim());
  if (dedans && dedans.index > 0) s = dedans[0];
  if (!/^https?:\/\//i.test(s)) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(s)) return null;
    s = 'https://' + s;
  }
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!u.hostname.includes('.') || u.username || u.password) return null;
  u.hash = '';
  for (const k of Array.from(u.searchParams.keys())) {
    if (/^(utm_|fbclid$|gclid$|mc_|xtor$|at_)/i.test(k)) u.searchParams.delete(k);
  }
  u.hostname = u.hostname.toLowerCase();
  return u.toString();
}

const SITES: [RegExp, string][] = [
  [/(^|\.)leboncoin\.fr$/, 'Leboncoin'],
  [/(^|\.)seloger\.com$/, 'SeLoger'],
  [/(^|\.)bienici\.com$/, 'Bien’ici'],
  [/(^|\.)pap\.fr$/, 'PAP'],
  [/(^|\.)logic-immo\.com$/, 'Logic-Immo'],
  [/(^|\.)jinka\.fr$/, 'Jinka'],
  [/(^|\.)lefigaro\.fr$/, 'Figaro Immobilier'],
  [/(^|\.)bellesdemeures\.com$/, 'Belles Demeures'],
  [/(^|\.)meilleursagents\.com$/, 'MeilleursAgents'],
  [/(^|\.)orpi\.com$/, 'Orpi'],
  [/(^|\.)century21\.fr$/, 'Century 21'],
  [/(^|\.)laforet\.com$/, 'Laforêt'],
  [/(^|\.)guy-hoquet\.com$/, 'Guy Hoquet'],
  [/(^|\.)era\.fr$/, 'ERA'],
  [/(^|\.)stephaneplazaimmobilier\.com$/, 'Stéphane Plaza Immobilier'],
  [/(^|\.)immonot\.com$/, 'Immonot'],
  [/(^|\.)paruvendu\.fr$/, 'ParuVendu'],
  [/(^|\.)avendrealouer\.fr$/, 'AVendreALouer'],
  [/(^|\.)ouestfrance-immo\.com$/, 'Ouest-France Immo'],
  [/(^|\.)green-acres\.fr$/, 'Green-Acres'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
];

/* Le site d'un lien : son nom quand on le connaît (`connu`), sinon son
   adresse sans « www. » (« agence-dupont.fr »). */
export function siteDe(url: string | null | undefined): { nom: string; connu: boolean } | null {
  if (!url) return null;
  let h = '';
  try { h = new URL(url).hostname.toLowerCase(); } catch { return null; }
  const s = SITES.find(([re]) => re.test(h));
  if (s) return { nom: s[1], connu: true };
  return { nom: h.replace(/^www\d?\./, ''), connu: false };
}

/* Son titre tant qu'Alexandre n'a pas rempli la fiche. */
export function titreAnnonce(a: { url?: string | null; photos?: string[] | null }): string {
  const site = siteDe(a.url);
  if (site) return site.connu ? `Annonce ${site.nom}` : `Annonce sur ${site.nom}`;
  const n = (a.photos || []).length;
  return n > 1 ? `Vos ${n} photos` : 'Votre photo';
}

/* La table n'existe pas encore (SQL pas passé) : on se tait, l'espace et le
   CRM marchent comme avant. */
export function tableAbsente(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === '42P01' || e.code === 'PGRST205'
    || (/annonces_client/.test(e.message || '') && /exist|schema cache/i.test(e.message || ''));
}

/* ── Ce que l'espace du client reçoit d'une annonce ──
   `bienId` : seulement quand le bien est dans son espace (présenté). Retenue
   mais pas encore envoyée, la fiche d'Alexandre n'est pas à lui. */
export type AnnonceEspace = {
  id: string;
  url: string | null;
  site: string | null;
  photos: string[];
  aime: string[];
  mot: string | null;
  statut: 'nouveau' | 'retenu' | 'ecarte';
  reponse: string | null;
  avis: string | null;
  le: string;
  decideLe: string | null;
  bienId: string | null;
  titre: string;
  photo: string | null;
};

type LigneAnnonce = {
  id: string; url?: string | null; portail?: string | null; photos?: string[] | null; aime?: string[] | null;
  mot?: string | null; statut?: string | null; reponse?: string | null; avis?: string | null;
  created_at: string; decide_le?: string | null; bien_id?: string | null;
};

export function annoncePourEspace(a: LigneAnnonce, bien?: { titre?: string | null; photos?: string[] | null; etape?: string | null } | null): AnnonceEspace {
  const presente = !!bien && bien.etape === 'presente';
  const statut = a.statut === 'retenu' || a.statut === 'ecarte' ? a.statut : 'nouveau';
  const photos = Array.isArray(a.photos) ? a.photos.filter(Boolean) : [];
  return {
    id: a.id,
    url: a.url || null,
    site: siteDe(a.url)?.nom || null,
    photos,
    aime: Array.isArray(a.aime) ? a.aime.filter(Boolean) : [],
    mot: a.mot || null,
    statut,
    reponse: statut === 'ecarte' ? a.reponse || null : null,
    avis: statut === 'retenu' ? a.avis || null : null,
    le: a.created_at,
    decideLe: a.decide_le || null,
    bienId: presente && a.bien_id ? a.bien_id : null,
    titre: (presente && bien?.titre) || titreAnnonce(a),
    photo: (presente && (bien?.photos || []).find(Boolean)) || photos[0] || null,
  };
}

/* Où elle en est, dit au client. `ton` : la couleur de la pastille. */
export function etatAnnonce(a: Pick<AnnonceEspace, 'statut' | 'bienId'>): { lib: string; ton: 'or' | 'vert' | 'gris' } {
  if (a.statut === 'ecarte') return { lib: 'Alexandre vous a répondu', ton: 'gris' };
  if (a.statut === 'retenu') return a.bienId
    ? { lib: 'Retenue : dans vos biens', ton: 'vert' }
    : { lib: 'Retenue : il prépare la fiche', ton: 'vert' };
  return { lib: 'Alexandre la regarde', ton: 'or' };
}
