/* ═══ Le PDF d'une agence, lu dans SON navigateur (V3.202) ════════════════
   Alexandre : « quand il met son PDF, est-ce qu'il y a une animation, comme
   quand il met un lien, "PDF lu" avec les renseignements ? ». Maquette 15
   du canevas « Le lien pour les agences » : « Lecture du PDF… », puis
   « PDF lu · 3 pièces · 52 m² · 265 000 € », ou « PDF reçu » quand rien
   d'écrit ne se lit (une plaquette faite d'images).

   Gratuit et instantané : pdf.js (Mozilla) ouvre le PDF ici, dessine sa
   première page (l'image de la carte, côté CRM) et sort son texte, où l'on
   cherche le prix, la surface, les pièces et les chambres. La vraie lecture
   (l'IA) se fait ensuite sur le serveur (src/lib/pdf-agence-serveur.ts).

   ⚠️ Le « worker » de pdf.js est copié dans public/pdfjs/ sous le numéro de
   version exact du paquet (pdfjs-dist, épinglé dans package.json) : en
   changeant de version, recopier node_modules/pdfjs-dist/legacy/build/
   pdf.worker.min.mjs en public/pdfjs/pdf.worker-<version>.min.js. Un worker
   absent ne casse rien : le PDF part quand même, en « PDF reçu ». (Un nom en
   .js et pas .mjs : src/proxy.ts laisse passer les .js sans le code d'accès.) */

export type InfosPdf = { prix: number | null; surface: number | null; pieces: number | null; chambres: number | null };
export type LecturePdf = { pages: number | null; apercu: string | null; texte: string; infos: InfosPdf; protege?: boolean };

const SANS_INFO: InfosPdf = { prix: null, surface: null, pieces: null, chambres: null };
export const aDesInfos = (i: InfosPdf) => !!(i.prix || i.surface || i.pieces || i.chambres);

/* ── Ce que dit le texte (pur, testable) ── */
const ESPACES = /[\s\u00a0\u202f]/g;
const avant = (t: string, i: number, n: number) => t.slice(Math.max(0, i - n), i).toLowerCase();

export function infosDuTexte(brut: string): InfosPdf {
  const t = brut.replace(/[\u00a0\u202f]/g, ' ');

  /* Le prix : le montant d'un bien (30 000 € à 30 M€), pas les honoraires,
     les charges, la taxe ni le net vendeur. Près du mot « prix » d'abord ;
     sinon le plus grand (le prix honoraires inclus). */
  const prix: { n: number; pres: boolean }[] = [];
  for (const m of t.matchAll(/(\d{1,3}(?:[ .]\d{3})+|\d{5,8})(?:,\d{1,2})?\s*(?:€|euros?\b|eur\b)/gi)) {
    const n = Number(m[1].replace(/[ .]/g, ''));
    const i = m.index ?? 0;
    const a = avant(t, i, 45);
    if (!(n >= 30_000 && n <= 30_000_000)) continue;
    if (/honoraires|charges|taxe|frais|loyer|net vendeur|hors honoraires|dépôt|depot|travaux|mensualit/.test(avant(t, i, 30))) continue;
    prix.push({ n, pres: /prix/.test(a) });
  }
  const prixP = prix.filter(x => x.pres);
  const prixF = (prixP.length ? prixP : prix).reduce<number | null>((m, x) => (m === null || x.n > m ? x.n : m), null);

  /* La surface : celle du bien, pas d'une pièce, du terrain ou d'un extérieur. */
  const surfaces: { n: number; pres: boolean }[] = [];
  for (const m of t.matchAll(/(\d{1,4}(?:[,.]\d{1,2})?)\s*(?:m²|m2\b|m\s?²|mètres?\s+carrés|metres?\s+carres)/gi)) {
    const n = Number(m[1].replace(',', '.'));
    const i = m.index ?? 0;
    if (!(n >= 8 && n <= 1500)) continue;
    const a = avant(t, i, 28);
    if (/terrain|jardin|parcelle|terrasse|balcon|cave|séjour|sejour|salon|chambre|cuisine|parking|box|garage|bureau|dressing|salle|entrée|entree|loggia|cour/.test(a)) continue;
    surfaces.push({ n, pres: /surface|habitable|carrez|superficie/.test(avant(t, i, 45)) });
  }
  const surfP = surfaces.filter(x => x.pres);
  const surface = (surfP.length ? surfP : surfaces).reduce<number | null>((m, x) => (m === null || x.n > m ? x.n : m), null);

  /* Les pièces : « 3 pièces », sinon « T3 » / « F3 ». Les chambres : « 2 chambres ». */
  const p1 = /\b(\d{1,2})\s*pi[eè]ces?\b/i.exec(t);
  const p2 = /\b[TF]\s?(\d{1,2})\b/.exec(t);
  const pieces = Number(p1?.[1] || p2?.[1]) || null;
  const c = /\b(\d{1,2})\s*chambres?\b/i.exec(t);
  const chambres = Number(c?.[1]) || null;

  return {
    prix: prixF,
    surface: surface ? Math.round(surface * 100) / 100 : null,
    pieces: pieces && pieces <= 30 ? pieces : null,
    chambres: chambres && chambres <= 20 ? chambres : null,
  };
}

/* ── pdf.js, chargé à la demande (rien pour qui colle un lien) ── */
type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let charge: Promise<PdfJs> | null = null;
function pdfjs(): Promise<PdfJs> {
  if (!charge) {
    charge = import('pdfjs-dist/legacy/build/pdf.mjs').then(m => {
      m.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker-${m.version}.min.js`;
      return m;
    });
    charge.catch(() => { charge = null; });
  }
  return charge;
}

const PAGES_LUES = 15;
const TEXTE_MAX = 40_000;

/** Ouvre le PDF ici : nombre de pages, image de la première, texte, infos.
    Ne jette jamais : un PDF qui ne s'ouvre pas rend un résultat vide. */
export async function lirePdfIci(f: File, delaiMs = 15_000): Promise<LecturePdf> {
  const vide: LecturePdf = { pages: null, apercu: null, texte: '', infos: SANS_INFO };
  const travail = (async (): Promise<LecturePdf> => {
    const m = await pdfjs();
    const doc = await m.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
    try {
      const pages = doc.numPages || null;
      let apercu: string | null = null;
      try {
        const page = await doc.getPage(1);
        const v1 = page.getViewport({ scale: 1 });
        const k = Math.min(2.5, 900 / Math.max(1, v1.width));
        const vp = page.getViewport({ scale: k });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(vp.width));
        canvas.height = Math.max(1, Math.round(vp.height));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas, viewport: vp }).promise;
          apercu = canvas.toDataURL('image/jpeg', 0.8);
        }
      } catch { /* sans image : la carte gardera son icône */ }
      const bouts: string[] = [];
      let longueur = 0;
      for (let n = 1; n <= Math.min(pages || 1, PAGES_LUES) && longueur < TEXTE_MAX; n++) {
        try {
          const page = await doc.getPage(n);
          const c = await page.getTextContent();
          const t = c.items.map(x => ('str' in x ? `${x.str}${x.hasEOL ? '\n' : ' '}` : '')).join('').replace(/[ \t]+/g, ' ').trim();
          if (t) { bouts.push(t); longueur += t.length; }
        } catch { /* une page illisible : les autres */ }
      }
      const texte = bouts.join('\n\n').slice(0, TEXTE_MAX);
      return { pages, apercu, texte, infos: texte.replace(ESPACES, ' ').trim() ? infosDuTexte(texte) : SANS_INFO };
    } finally {
      void doc.loadingTask.destroy();
    }
  })();
  try {
    return await Promise.race([
      travail,
      new Promise<LecturePdf>(ok => window.setTimeout(() => ok(vide), delaiMs)),
    ]);
  } catch (e) {
    const nom = (e as { name?: string })?.name || '';
    return nom === 'PasswordException' ? { ...vide, protege: true } : vide;
  }
}

/** Un fichier qui se présente comme un PDF. */
export const estPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
