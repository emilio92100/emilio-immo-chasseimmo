/* ═══ Le flux XML d'ImmoFacile, lu une dernière fois (V3.92) ═══════════════
   ImmoFacile publie ses biens en cours dans un flux XML (c'est lui que lit
   aujourd'hui le site emilio-immo.com). Avant de le couper, le CRM y reprend
   ce qui ne se retrouve nulle part ailleurs :

     · le numéro de chaque bien chez ImmoFacile (AFF_ID, ex. 55334496). C'est
       l'adresse de sa page sur le site (/biens/55334496) et l'identifiant que
       Jinka connaît (champ 175 du POLIRIS) : le garder, c'est ne casser aucun
       lien et ne créer aucun doublon ;
     · sa position (LATITUDE, LONGITUDE), quand la fiche n'en a pas ;
     · un premier réglage de la diffusion (lib/diffusion.ts) : sur le site,
       puisqu'il y est ; sur Jinka et SeLoger s'il est dans la liste que Jinka
       a envoyée le 28 septembre (les deux biens « site seulement » d'Alexandre
       n'y sont pas) ; jamais Belles Demeures, qu'il coche lui-même.

   Ici, rien que du texte : lire le flux, rapprocher ses biens de ceux du CRM.
   La route /api/diffusion/reprise fait le reste. Isomorphe. */

export const FLUX_IMMOFACILE = 'https://clients.immo-facile.com/office12/emilie_immob/cache/export.xml';

/* Les 16 annonces en ligne chez Jinka le 28 septembre 2026, par leur
   identifiant technique (champ 175) — la pièce jointe de Rémi Bruder. Ce sont
   les numéros ImmoFacile des biens. */
export const ANNONCES_JINKA = new Set([
  '56527064', '57099049', '56937758', '58747369', '50173826', '59702167', '60463536', '60505597',
  '51261068', '49323480', '55334496', '61063077', '61076424', '58445258', '61542765', '61563130',
]);

export type AnnonceIF = {
  affId: string; affNum: string; numMandat: string;
  prix: number | null; cp: string; ville: string; surface: number | null; pieces: number | null;
  lat: number | null; lng: number | null; titre: string;
};

const sansCdata = (t: string) => t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
function balise(xml: string, nom: string): string {
  const m = xml.match(new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>`, 'i'));
  return m ? sansCdata(m[1]) : '';
}
function section(xml: string, nom: string): string {
  const m = xml.match(new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>`, 'i'));
  return m ? m[1] : '';
}
const nombre = (t: string): number | null => {
  const x = Number(t.replace(/\s/g, '').replace(',', '.'));
  return t && Number.isFinite(x) ? x : null;
};

/* Les biens du flux. Le type du bien est une section (<APPARTEMENT>,
   <MAISON>…) : on y lit la surface et les pièces, où qu'elles soient. */
export function lireFluxImmoFacile(xml: string): AnnonceIF[] {
  const out: AnnonceIF[] = [];
  const re = /<bien(?:\s[^>]*)?>([\s\S]*?)<\/bien>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const info = section(b, 'info_generales');
    const vente = section(b, 'vente');
    const loc = section(b, 'localisation');
    const affId = balise(info, 'aff_id');
    if (!affId) continue;
    const surface = nombre(balise(b, 'surface_habitable')) ?? nombre(balise(b, 'surface'));
    const lat = nombre(balise(loc, 'latitude')), lng = nombre(balise(loc, 'longitude'));
    out.push({
      affId, affNum: balise(info, 'aff_num'), numMandat: balise(vente, 'num_mandat'),
      prix: nombre(balise(vente, 'prix')), cp: balise(loc, 'code_postal'), ville: balise(loc, 'ville'),
      surface, pieces: nombre(balise(b, 'nbre_pieces')),
      lat: lat && lng ? lat : null, lng: lat && lng ? lng : null,
      titre: balise(section(b, 'intitule'), 'fr'),
    });
  }
  return out;
}

/* ── Rapprocher un bien du flux d'un bien du CRM ──────────────────────────
   D'abord par la référence ImmoFacile gardée à l'import (`refImmofacile`,
   le numéro court du bien : AFF_NUM), puis par le numéro de mandat, enfin
   par le code postal, le prix (à 1 % près) et la surface (à 2 m² près). Un
   bien du CRM n'est pris qu'une fois. */
export type BienARapprocher = {
  id: string; reference: string | null; code_postal: string | null; prix: number | null; surface: number | null;
  mandat_numero: string | null; donnees: Record<string, unknown> | null;
};
export type Rapprochement = { annonce: AnnonceIF; bienId: string; par: 'reference' | 'mandat' | 'prix' };

const S = (x: unknown) => (typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : '');
const N = (x: unknown) => { const n = typeof x === 'number' ? x : Number(S(x).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };

export function rapprocher(annonces: AnnonceIF[], biens: BienARapprocher[]): { liens: Rapprochement[]; seules: AnnonceIF[] } {
  const pris = new Set<string>();
  const liens: Rapprochement[] = [];
  const seules: AnnonceIF[] = [];
  const libres = () => biens.filter(b => !pris.has(b.id));
  for (const a of annonces) {
    const d = (b: BienARapprocher) => b.donnees || {};
    let b = libres().find(x => S(d(x).idImmofacile) === a.affId);
    let par: Rapprochement['par'] = 'reference';
    if (!b && a.affNum) b = libres().find(x => S(d(x).refImmofacile) === a.affNum);
    if (!b && a.numMandat) { b = libres().find(x => S(x.mandat_numero || d(x).mandatNumero) === a.numMandat); par = 'mandat'; }
    if (!b && a.prix && a.cp) {
      par = 'prix';
      b = libres().find(x => {
        const cp = S(x.code_postal || d(x).cp), prix = N(x.prix ?? d(x).prix), surf = N(x.surface ?? d(x).surface);
        return cp === a.cp && !!prix && Math.abs(prix - a.prix!) <= a.prix! * 0.01
          && (!a.surface || !surf || Math.abs(surf - a.surface) <= 2);
      });
    }
    if (b) { pris.add(b.id); liens.push({ annonce: a, bienId: b.id, par }); }
    else seules.push(a);
  }
  return { liens, seules };
}
