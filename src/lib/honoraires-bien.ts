/* ══ Les honoraires d'Alexandre sur un bien de chasse (V3.145) ══════════════

   Alexandre, 9 octobre : « tous les biens de l'espace au même prix que
   SeLoger ; si on n'arrive pas à faire un inter-cabinet, on rajoute notre
   commission, et il le voit ». Trois cas, choisis quand il présente le bien
   (et modifiables ensuite) :

     · inter        une autre agence vend le bien et partage ses honoraires :
                    le client ne paie que le prix de l'annonce. Par défaut.
     · sans         une agence qui ne partage pas : ses honoraires s'ajoutent.
     · particulier  le propriétaire vend seul : ils s'ajoutent toujours
                    (coché d'office quand la veille dit « particulier »).

   Rien de neuf dans la base pour le client : `prix_vendeur` est le prix de
   l'annonce, `prix_acquereur` ce prix plus ses honoraires (égal au prix de
   l'annonce en inter-cabinet), `commission_type` / `commission_val` le taux
   ou le forfait, `est_particulier` le vendeur. Seul le partage d'un
   inter-cabinet (les honoraires de l'agence, sa part), pour lui seul, va
   dans une colonne neuve : `biens.inter` (outils/sql/biens-inter.sql).

   Un mandat de l'agence (copie portant `bien_vente_id`) n'est pas concerné :
   son prix est celui de la fiche, honoraires de l'agence compris (V3.50).

   Pur, sans dépendance : servi au CRM, à l'espace, aux pages et aux mails. */

export type TypeHono = 'pourcentage' | 'fixe';
export type CasHono = 'inter' | 'sans' | 'particulier';
export type HonoMandat = { type: TypeHono; val: number; texte: string };
/* Le partage d'un inter-cabinet : les honoraires de l'agence du vendeur (en
   % du prix de l'annonce, ou en euros) et la part d'Alexandre (en %). */
export type Partage = { agenceType: TypeHono; agenceVal: number | null; part: number | null };

type BienPrix = {
  prix_vendeur?: number | string | null; prix_acquereur?: number | string | null;
  bien_vente_id?: string | null; est_particulier?: boolean | null;
  commission_type?: string | null; commission_val?: number | string | null;
  inter?: unknown;
};

const nb = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export function montantHonoraires(base: number, type: TypeHono, valeur: string | number): number {
  const v = nb(valeur);
  return type === 'pourcentage' ? Math.round(base * (v / 100)) : Math.round(v);
}

/* ── Ce que le client voit ──
   `demande` : le prix de l'annonce. `hono` : ce qui s'y ajoute (0 en
   inter-cabinet, et pour un mandat de l'agence). `total` : ce qu'il paiera,
   frais d'agence compris, hors frais de notaire. */
export function prixDuBien(b: BienPrix | null | undefined): { demande: number | null; hono: number; total: number | null; agence: boolean } {
  if (!b) return { demande: null, hono: 0, total: null, agence: false };
  const vendeur = nb(b.prix_vendeur), acq = nb(b.prix_acquereur);
  if (b.bien_vente_id) {
    const p = acq || vendeur || null;
    return { demande: p, hono: 0, total: p, agence: true };
  }
  const demande = vendeur || acq || null;
  const hono = vendeur > 0 && acq > vendeur ? Math.round(acq - vendeur) : 0;
  return { demande, hono, total: demande ? demande + hono : null, agence: false };
}

/* ── Le cas d'un bien ──
   Des honoraires s'ajoutent : particulier ou agence sans inter, selon le
   vendeur. Rien ne s'ajoute : inter-cabinet — sauf un bien de particulier
   jamais réglé (la veille l'a dit, et rien n'a encore été fixé). */
export function casDuBien(b: BienPrix | null | undefined): CasHono {
  if (!b) return 'inter';
  if (prixDuBien(b).hono > 0 || nb(b.commission_val) > 0) return b.est_particulier ? 'particulier' : 'sans';
  return b.est_particulier ? 'particulier' : 'inter';
}

export function partageDe(b: BienPrix | null | undefined): Partage | null {
  const x = b?.inter;
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const agenceVal = nb(o.agenceVal) || null, part = nb(o.part) || null;
  if (!agenceVal && !part) return null;
  return { agenceType: o.agenceType === 'fixe' ? 'fixe' : 'pourcentage', agenceVal, part };
}

/* Ce qu'il touchera en inter-cabinet : sa part des honoraires de l'agence.
   Null tant que les deux ne sont pas connus. */
export function gainInter(prixAnnonce: number | null, p: Partage | null): { agence: number; gain: number } | null {
  if (!p || !p.agenceVal || !p.part) return null;
  const agence = p.agenceType === 'fixe' ? Math.round(p.agenceVal) : Math.round((prixAnnonce || 0) * p.agenceVal / 100);
  if (!agence) return null;
  return { agence, gain: Math.round(agence * p.part / 100) };
}

/* ── Le mandat de recherche ──
   Les honoraires du mandat en cours, s'il y en a un et qu'on sait les lire
   (recherches.mandat_honoraires : « 2,5 % TTC », « 15 000 € TTC », « 15k »). */
export function honorairesDuMandat(r: Record<string, unknown> | null | undefined): HonoMandat | null {
  if (!r || r.sans_mandat) return null;
  if (!r.mandat_date_signature && !r.mandat_date_expiration) return null;
  if (r.mandat_date_expiration) {
    const fin = new Date(String(r.mandat_date_expiration));
    if (!isNaN(fin.getTime()) && fin.getTime() + 86400000 < Date.now()) return null;   // expiré
  }
  const texte = String(r.mandat_honoraires || '').trim();
  if (!texte) return null;
  const serre = texte.replace(/[\s\u00a0\u202f]/g, '');
  const pct = serre.match(/(\d+(?:[.,]\d+)?)%/);
  if (pct) {
    const v = parseFloat(pct[1].replace(',', '.'));
    return v > 0 && v < 30 ? { type: 'pourcentage', val: v, texte } : null;
  }
  const milliers = serre.match(/(\d+(?:[.,]\d+)?)k/i);
  if (milliers) {
    const v = Math.round(parseFloat(milliers[1].replace(',', '.')) * 1000);
    return v > 0 ? { type: 'fixe', val: v, texte } : null;
  }
  const euros = serre.match(/(\d[\d.]*(?:,\d{1,2})?)(?:€|eur)/i) || serre.match(/^(\d[\d.]*(?:,\d{1,2})?)/);
  if (euros) {
    /* « 5.000 » est un millier, « 3.5 » une décimale. */
    const brut = euros[1];
    const v = /^\d+\.\d{1,2}$/.test(brut) ? parseFloat(brut) : parseFloat(brut.replace(/\./g, '').replace(',', '.'));
    if (v >= 100) return { type: 'fixe', val: Math.round(v), texte };
    if (v > 0 && v < 30) return { type: 'pourcentage', val: v, texte };
  }
  return null;
}

/* Le plus qu'il peut prendre sur un prix donné : ce que le client a signé.
   La loi Hoguet interdit d'aller au-delà ; en dessous, c'est un geste. */
export function plafondMandat(m: HonoMandat | null, prix: number): number | null {
  if (!m || !(prix > 0)) return null;
  return m.type === 'pourcentage' ? Math.round(prix * m.val / 100) : Math.round(m.val);
}

/* La colonne du partage manque : le SQL n'est pas encore passé. */
export const colonneInterAbsente = (m: string) => /\binter\b/i.test(m) && /schema cache|does not exist|Could not find/i.test(m);
