/* ═══ Ringover : qui appelle ? (V3.141) ═══════════════════════════════════

   Alexandre : « quand quelqu'un m'appelle sur Ringover, savoir s'il est
   connu, qu'il fasse le lien avec mon CRM, avec tous les numéros que je
   mets ».

   C'est le webhook « Contact Call » de Ringover (Développeur › Webhooks) : à
   chaque appel, entrant ou sortant, Ringover demande à notre adresse
   (/api/ringover/contact) qui est ce numéro. On répond avec le nom, une
   ligne sous le nom (« Acheteur · Vendeur », « Étude Durand · Boulogne »),
   quelques lignes en plus (sa recherche, son bien et son étape) et le lien
   de sa fiche dans le CRM. Ringover l'affiche dans son application, même si
   le contact n'y a jamais été enregistré. Un numéro inconnu : 404, Ringover
   affiche le numéro, comme avant.

   Le numéro se compare sur ses 9 derniers chiffres : « 06 62 86 32 06 »,
   « +33 6 62 86 32 06 » et « 33662863206 » (ce que Ringover envoie) sont le
   même. Tous les numéros de la fiche comptent, et celui de la personne 2
   d'un couple (`conjoint.telephone`, voir lib/foyer.ts).

   La serrure : Ringover signe chaque appel (en-tête
   X-Ringover-Webhook-Signature, un JWT HS512) avec la clé affichée dans sa
   partie « Contact Call ». Cette clé vit dans Vercel, RINGOVER_CLE_CONTACT ;
   sans elle, tout est refusé : l'adresse est publique (src/proxy.ts), et
   sans serrure n'importe qui pourrait demander à qui est un numéro.
   ════════════════════════════════════════════════════════════════════════ */

import { createHmac, timingSafeEqual } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { typesDe, typeDe, ligneContact } from '@/lib/contacts';
import { conjointDe } from '@/lib/foyer';
import { etapeDe, titreBien, type Donnees } from '@/lib/biens-vente';
import { euros } from '@/lib/mandat';
import { lireBiensSuivis, parNumero, lienFiche, ouEnEst, texteDernier, type BienSuivi } from '@/lib/agences-suivies';

export const crmUrl = () => (process.env.NEXT_PUBLIC_CRM_URL || 'https://crm.emilio-immo.com').replace(/\/+$/, '');

/* ── Le numéro : ses 9 derniers chiffres (rien en dessous de 9) ── */
export function cleNumero(t: unknown): string {
  const d = String(t ?? '').replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : '';
}

/* ── La signature de Ringover : un JWT HS512, signé avec la clé ── */
const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
export function signatureValide(jeton: string | null | undefined, cle: string | null | undefined): boolean {
  const j = String(jeton || '').replace(/^Bearer\s+/i, '').trim();
  const k = String(cle || '').trim();
  if (!j || !k) return false;
  const [h, p, s] = j.split('.');
  if (!h || !p || !s) return false;
  try {
    const entete = JSON.parse(b64url(h).toString('utf8')) as { alg?: string };
    if (entete.alg !== 'HS512') return false;
  } catch { return false; }
  const attendu = createHmac('sha512', k).update(`${h}.${p}`).digest();
  const recu = b64url(s);
  if (recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) return false;
  /* Un jeton daté et périmé (une minute de marge) : refusé. */
  try {
    const charge = JSON.parse(b64url(p).toString('utf8')) as { exp?: unknown };
    if (typeof charge.exp === 'number' && charge.exp * 1000 < Date.now() - 60_000) return false;
  } catch { /* pas de charge lisible : la signature suffit */ }
  return true;
}

/* ── Les contacts, gardés une minute entre deux appels ── */
type ClientLu = {
  id: string; prenom: string | null; nom: string | null; telephones: string[] | null;
  couple?: boolean | null; conjoint?: unknown; types?: unknown; pro?: unknown; archive?: boolean | null; adresse?: string | null;
};
const COLS = 'id, prenom, nom, telephones, couple, conjoint, types, pro, archive, adresse';
const COLS_SIMPLES = 'id, prenom, nom, telephones, types, pro, archive, adresse';
let cache: { le: number; liste: ClientLu[] } | null = null;

export function baseServeur(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

async function lireContacts(sb: SupabaseClient): Promise<ClientLu[]> {
  if (cache && Date.now() - cache.le < 60_000) return cache.liste;
  const liste: ClientLu[] = [];
  let cols = COLS;
  for (let de = 0; de < 50_000; de += 1000) {
    let r = await sb.from('clients').select(cols).range(de, de + 999);
    /* Une base où les colonnes du couple n'existent pas encore. */
    if (r.error && cols === COLS && /couple|conjoint/i.test(r.error.message)) {
      cols = COLS_SIMPLES;
      r = await sb.from('clients').select(cols).range(de, de + 999);
    }
    if (r.error) throw new Error(`Les contacts n’ont pas pu être lus : ${r.error.message}`);
    const lot = (r.data || []) as unknown as ClientLu[];
    liste.push(...lot);
    if (lot.length < 1000) break;
  }
  cache = { le: Date.now(), liste };
  return liste;
}

/* ── Qui a ce numéro ── */
export type Trouve = { c: ClientLu; conjoint: boolean };
export function trouverNumero(liste: ClientLu[], numero: string): Trouve[] {
  const cle = cleNumero(numero);
  if (!cle) return [];
  const out: Trouve[] = [];
  for (const c of liste) {
    if ((c.telephones || []).some(t => cleNumero(t) === cle)) { out.push({ c, conjoint: false }); continue; }
    const j = c.couple ? conjointDe(c.conjoint) : null;
    if (j?.telephone && cleNumero(j.telephone) === cle) out.push({ c, conjoint: true });
  }
  /* Les fiches en cours d'abord, la personne 1 avant la personne 2. */
  return out.sort((a, b) => Number(a.c.archive === true) - Number(b.c.archive === true) || Number(a.conjoint) - Number(b.conjoint));
}

/* ── Ce que Ringover affiche ── */
export type ReponseRingover = {
  uuid: string; firstname: string; lastname: string; company: string; url: string;
  data: Record<string, string>; is_shared: boolean;
};

type RechercheLue = { nom?: string | null; type_bien?: string | null; budget_max?: number | null; nb_pieces_min?: number | null; secteurs?: string[] | null; active?: boolean | null };
type BienLu = { titre?: string | null; etape?: string | null; ville?: string | null; donnees?: Donnees | null; archive?: boolean | null };

const phraseRecherche = (r: RechercheLue) => [
  r.type_bien ? String(r.type_bien).charAt(0).toUpperCase() + String(r.type_bien).slice(1) : '',
  r.nb_pieces_min ? `${r.nb_pieces_min} p. et plus` : '',
  r.budget_max ? `jusqu’à ${euros(r.budget_max)}` : '',
  (r.secteurs || []).filter(Boolean).slice(0, 2).join(', '),
].filter(Boolean).join(' · ') || String(r.nom || '').trim() || 'Recherche ouverte';

/* ═══ V3.191 · Une agence qui appelle ═══════════════════════════════════
   Alexandre : « si une agence me rappelle un jour plus tard, retrouver
   l'annonce en un seul clic ». Un numéro qui n'est pas celui d'un contact
   peut être celui d'une agence qui a un bien d'un de ses clients : le numéro
   relevé sur l'annonce, ou noté dans « Noter un appel »
   (lib/agences-suivies.ts). Ringover affiche alors l'agence, le bien, pour
   qui, où il en est, et le lien ouvre la fiche du client sur ce bien. Rien à
   enregistrer dans Ringover. */
let cacheSuivis: { le: number; liste: BienSuivi[] } | null = null;
async function biensSuivis(sb: SupabaseClient): Promise<BienSuivi[]> {
  if (cacheSuivis && Date.now() - cacheSuivis.le < 60_000) return cacheSuivis.liste;
  const liste = await lireBiensSuivis(sb);
  cacheSuivis = { le: Date.now(), liste };
  return liste;
}
/** Les lignes « Bien », « Bien 2 »… : le bien, pour qui, où il en est. */
function lignesBiens(trouves: BienSuivi[], clients: ClientLu[], max: number): Record<string, string> {
  const nomDe = (id: string) => { const c = clients.find(x => x.id === id); return c ? [c.prenom, c.nom].filter(Boolean).join(' ') : ''; };
  const data: Record<string, string> = {};
  trouves.slice(0, max).forEach((b, i) => {
    const nom = nomDe(b.client_id);
    data[i ? `Bien ${i + 1}` : 'Bien'] = [
      [b.titre || 'Bien', b.ville, b.prix ? euros(b.prix) : ''].filter(Boolean).join(' · '),
      nom ? `pour ${nom}` : '', ouEnEst(b),
    ].filter(Boolean).join(' — ');
  });
  if (trouves.length > max) data['Et aussi'] = `${trouves.length - max} autre${trouves.length - max > 1 ? 's' : ''} bien${trouves.length - max > 1 ? 's' : ''} de vos clients`;
  const d = trouves.find(b => b.dernier)?.dernier;
  if (d) data['Dernier contact'] = texteDernier(d);
  return data;
}

export async function agencePour(numero: string, sb: SupabaseClient = baseServeur()): Promise<ReponseRingover | null> {
  const trouves = parNumero(await biensSuivis(sb), numero);
  if (!trouves.length) return null;
  const clients = await lireContacts(sb);
  const b0 = trouves[0];
  const nom0 = (() => { const c = clients.find(x => x.id === b0.client_id); return c ? [c.prenom, c.nom].filter(Boolean).join(' ') : ''; })();
  const data: Record<string, string> = { Type: 'Agence' };
  if (b0.interlocuteurs.length) data['Contact'] = b0.interlocuteurs.slice(0, 2).join(', ');
  Object.assign(data, lignesBiens(trouves, clients, 3));
  return {
    uuid: b0.id,
    firstname: '',
    lastname: b0.agence || 'Agence',
    company: trouves.length > 1 ? `Agence · ${trouves.length} biens de vos clients` : `Agence · pour ${nom0 || 'un client'}`,
    url: lienFiche(crmUrl(), b0),
    data,
    is_shared: true,
  };
}

export async function reponsePour(numero: string, sb: SupabaseClient = baseServeur()): Promise<ReponseRingover | null> {
  const trouves = trouverNumero(await lireContacts(sb), numero);
  /* V3.191 : pas un contact ? Peut-être une agence. */
  if (!trouves.length) return agencePour(numero, sb);
  const { c, conjoint } = trouves[0];
  const types = typesDe(c);
  const libTypes = types.map(t => typeDe(t).lib).join(' · ');
  const j = conjoint ? conjointDe(c.conjoint) : null;
  const data: Record<string, string> = { Type: libTypes };
  if (conjoint) data['Fiche'] = `Couple avec ${[c.prenom, c.nom].filter(Boolean).join(' ')}`;

  /* Sa recherche (un acheteur) et son bien (un vendeur, un propriétaire) :
     une lecture qui échoue n'empêche pas d'afficher le nom. */
  const [rech, biens] = await Promise.all([
    types.includes('acheteur')
      ? sb.from('recherches').select('nom, type_bien, budget_max, nb_pieces_min, secteurs, active').eq('client_id', c.id).eq('active', true).limit(2)
      : Promise.resolve({ data: [] as RechercheLue[], error: null }),
    types.some(t => t === 'vendeur' || t === 'proprietaire' || t === 'vendeur_signe')
      ? sb.from('biens_vente').select('titre, etape, ville, donnees, archive').eq('client_id', c.id).eq('archive', false).limit(3)
      : Promise.resolve({ data: [] as BienLu[], error: null }),
  ]);
  const r0 = ((rech.data || []) as RechercheLue[])[0];
  if (r0) data['Recherche'] = phraseRecherche(r0);
  ((biens.data || []) as BienLu[]).slice(0, 2).forEach((b, i) => {
    const titre = String(b.titre || '').trim() || titreBien(b.donnees || {});
    data[i ? 'Autre bien' : 'Bien'] = [titre, b.ville, etapeDe(b.etape).court].filter(Boolean).join(' · ');
  });
  if (c.archive === true) data['Attention'] = 'Contact archivé';
  if (trouves.length > 1) {
    data['Aussi à ce numéro'] = trouves.slice(1, 3).map(x => {
      const y = x.conjoint ? conjointDe(x.c.conjoint) : null;
      return [y ? y.prenom : x.c.prenom, y ? y.nom : x.c.nom].filter(Boolean).join(' ');
    }).join(', ');
  }

  /* V3.191 : un contact qui n'est pas acheteur (un confrère enregistré, par
     exemple) et dont le numéro est aussi celui d'une agence qui a un bien de
     vos clients : les biens s'ajoutent, et le lien ouvre le premier. */
  let lienBien = '';
  if (!types.includes('acheteur')) {
    const biensAg = parNumero(await biensSuivis(sb).catch(() => [] as BienSuivi[]), numero);
    if (biensAg.length) {
      Object.assign(data, lignesBiens(biensAg, await lireContacts(sb), 2));
      lienBien = lienFiche(crmUrl(), biensAg[0]);
    }
  }

  const prenom = (j ? j.prenom : c.prenom) || '';
  const nom = (j ? j.nom : c.nom) || '';
  return {
    uuid: c.id,
    firstname: prenom,
    lastname: nom || (prenom ? '' : 'Contact sans nom'),
    company: ligneContact(c) || libTypes,
    url: lienBien || `${crmUrl()}/?page=fiche&client=${encodeURIComponent(c.id)}`,
    data,
    is_shared: true,
  };
}

/* Le numéro de l'autre personne : celui qui appelle (entrant), ou celui
   qu'Alexandre appelle (sortant). */
export function numeroDe(corps: unknown): string {
  const d = (corps && typeof corps === 'object' ? (corps as { data?: unknown }).data : null) as
    { direction?: unknown; from_number?: unknown; to_number?: unknown } | null;
  if (!d) return '';
  return String((d.direction === 'outbound' ? d.to_number : d.from_number) ?? '');
}

/* ═══ V3.143 · « Contact search » : chercher un contact du CRM depuis Ringover ═══
   Alexandre veut appeler un contact du CRM depuis Ringover sans l'y avoir
   enregistré. Quand il tape dans la recherche de Ringover, Ringover nous
   envoie ce qu'il a tapé (`data.query_search`, signé avec la clé de la
   partie « Contact search », RINGOVER_CLE_RECHERCHE) ; on rend les contacts
   qui correspondent, avec leurs numéros (/api/ringover/recherche).

   Un nom (« martin », « paul mar », « étude durand ») : tous les mots doivent
   se trouver dans le prénom, le nom ou la ligne qui dit qui c'est
   (`ligneContact`), sans tenir compte des accents. Des chiffres (« 06 62 »,
   « +33 6 62 ») : un bout de numéro, quelle que soit son écriture. La
   personne 2 d'un couple sort à son nom, avec son numéro. Seulement les
   contacts qui ont un numéro (sans, Ringover ne peut rien en faire) ; les
   fiches en cours d'abord, puis les archivées ; vingt au plus. */
const plat = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/* Un numéro en France commence par 0 : « +33 6 62… », « 0033 6… », « 33662… » → « 0662… ». */
export function numeroNational(t: string): string {
  const brut = String(t || '').trim();
  const d = brut.replace(/\D/g, '');
  if (d.startsWith('0033')) return '0' + d.slice(4);
  if (/^\+33/.test(brut) || (d.startsWith('33') && d.length === 11)) return '0' + d.slice(2);
  return d;
}
/* Le numéro comme Ringover l'écrit : un nombre, l'indicatif devant (33662863206). */
export function numeroRingover(t: string): number | null {
  const brut = String(t || '').trim();
  let d = brut.replace(/\D/g, '');
  if (!d) return null;
  if (!brut.startsWith('+')) {
    if (d.startsWith('00')) d = d.slice(2);
    else if (d.length === 10 && d.startsWith('0')) d = '33' + d.slice(1);
    else if (d.length === 9) d = '33' + d;
  }
  if (d.length < 8 || d.length > 15) return null;
  const n = Number(d);
  return Number.isSafeInteger(n) ? n : null;
}

export type ContactRecherche = {
  firstname: string; lastname: string; company: string; url: string;
  numbers: { number: number; type: string }[];
};

export async function rechercheRingover(q: string, sb: SupabaseClient = baseServeur()): Promise<ContactRecherche[]> {
  const saisie = String(q || '').trim();
  if (!saisie) return [];
  const tel = /^[\d\s.+()-]+$/.test(saisie) ? numeroNational(saisie) : '';
  if (tel && tel.length < 3) return [];
  const mots = tel ? [] : plat(saisie).split(/\s+/).filter(Boolean);
  if (!tel && !mots.length) return [];
  const trouve = (foin: string) => mots.every(m => foin.includes(m));
  /* « mobile » pour un 06 ou un 07, « fixe » sinon (un texte libre pour Ringover). */
  const numeros = (l: string[]) => l.map(t => ({ t, n: numeroRingover(t) })).filter((x): x is { t: string; n: number } => x.n !== null)
    .filter((x, i, a) => a.findIndex(y => y.n === x.n) === i)
    .map(x => ({ number: x.n, type: /^0[67]/.test(numeroNational(x.t)) ? 'mobile' : 'fixe' }));

  const out: (ContactRecherche & { archive: boolean })[] = [];
  for (const c of await lireContacts(sb)) {
    const types = typesDe(c);
    const ligne = ligneContact(c) || types.map(t => typeDe(t).lib).join(' · ');
    const company = [c.archive === true ? 'Archivé' : '', ligne].filter(Boolean).join(' · ');
    const url = `${crmUrl()}/?page=fiche&client=${encodeURIComponent(c.id)}`;
    const tels = (c.telephones || []).filter(Boolean).map(String);
    const ok1 = tel ? tels.some(t => numeroNational(t).includes(tel)) : trouve(plat(`${c.prenom || ''} ${c.nom || ''} ${ligne}`));
    const nums = numeros(tels);
    if (ok1 && nums.length) {
      out.push({ firstname: c.prenom || '', lastname: c.nom || (c.prenom ? '' : 'Contact sans nom'), company, url, numbers: nums, archive: c.archive === true });
    }
    const j = c.couple ? conjointDe(c.conjoint) : null;
    if (j?.telephone) {
      const ok2 = tel ? numeroNational(j.telephone).includes(tel) : trouve(plat(`${j.prenom || ''} ${j.nom || ''} ${c.nom || ''} ${ligne}`));
      const n2 = numeros([j.telephone]);
      if (ok2 && n2.length && !(ok1 && nums.some(x => x.number === n2[0].number))) {
        out.push({ firstname: j.prenom || '', lastname: j.nom || '', company, url, numbers: n2, archive: c.archive === true });
      }
    }
  }
  const nomTri = (x: ContactRecherche) => plat(`${x.lastname} ${x.firstname}`);
  return out
    .sort((a, b) => Number(a.archive) - Number(b.archive) || nomTri(a).localeCompare(nomTri(b), 'fr'))
    .slice(0, 20)
    .map(({ archive: _archive, ...x }) => x);
}
