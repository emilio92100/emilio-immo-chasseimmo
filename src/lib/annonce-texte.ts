/* ═══ Le texte d'une annonce, aéré en paragraphes (V3.80) ═══════════════════
   Alexandre : « les textes repris d'ImmoFacile s'affichent en bordel, un seul
   bloc ; est-ce qu'on peut tout modifier d'un seul trait ? ». ImmoFacile
   rendait souvent l'annonce en un seul paragraphe de 2 000 caractères.

   `aererTexte` le découpe sans rien réécrire : les phrases restent les
   mêmes, dans le même ordre, seulement regroupées en paragraphes d'environ
   trois cents caractères ; les mentions de la fin (prix et honoraires,
   copropriété, DPE, Géorisques) forment le dernier paragraphe. Un texte déjà
   en paragraphes, ou fait de lignes courtes, ne bouge pas. Aucun mot n'est
   ajouté ni retiré : seules les espaces entre deux phrases deviennent des
   sauts de ligne. */

/* Au-delà, une ligne est un bloc à découper. */
const LIGNE_LONGUE = 420;
/* La taille visée d'un paragraphe. */
const CIBLE = 300;
/* Un paragraphe plus court que ça, à la fin, rejoint le précédent. */
const MINI = 110;

/* Une phrase de mentions légales (elles ferment l'annonce). */
const LEGAL = /honoraires|g[ée]orisques|\bDPE\b|\bGES\b|kWh|CO2|CO₂|d[ée]penses annuelles|consommation [ée]nerg[ée]tique|proc[ée]dure|\blots?\b|charges annuelles|copropri[ée]t[ée] de|loi carrez|^prix\s*:|bar[èe]me|mandat n°|carte professionnelle|rcp|garantie financi[èe]re/i;

/* Les phrases d'une ligne : coupées après . ! ? … suivis d'une espace et
   d'une majuscule, d'un chiffre ou d'un guillemet. « M. Dupont », « 3 p. »
   ou « env. 80 m² » ne coupent pas (minuscule ou abréviation courte). */
function phrases(t: string): string[] {
  const out: string[] = [];
  const re = /([.!?…]+["»)]?)(\s+)(?=[A-ZÀ-ÖØ-ÞŒ0-9«"(])/gu;
  let debut = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const fin = m.index + m[1].length;
    const avant = t.slice(debut, fin);
    /* « M. », « Mme. », « St. », une initiale : pas une fin de phrase. */
    if (/(?:^|\s)(?:M|Mme|Mlle|Me|Dr|St|Ste|av|bd|env|ex|cf|p|n°|[A-Z])\.$/u.test(avant)) continue;
    out.push(avant.trim());
    debut = fin + m[2].length;
  }
  const reste = t.slice(debut).trim();
  if (reste) out.push(reste);
  return out.filter(Boolean);
}

/* Une ligne longue → ses paragraphes. */
function decouper(ligne: string): string[] {
  const ph = phrases(ligne);
  if (ph.length < 2) return [ligne];
  /* Les mentions : la suite de phrases légales qui termine le texte. */
  let i = ph.length;
  while (i > 0 && LEGAL.test(ph[i - 1])) i -= 1;
  /* Tout le texte « légal » : rien à regrouper à part. */
  if (i === 0) i = ph.length;
  const corps = ph.slice(0, i), legal = ph.slice(i);
  const paras: string[][] = [];
  let cours: string[] = [];
  let n = 0;
  for (const p of corps) {
    cours.push(p);
    n += p.length + 1;
    if (n >= CIBLE) { paras.push(cours); cours = []; n = 0; }
  }
  if (cours.length) {
    const court = cours.join(' ').length < MINI;
    if (court && paras.length) paras[paras.length - 1].push(...cours);
    else paras.push(cours);
  }
  const out = paras.map(x => x.join(' '));
  if (legal.length) out.push(legal.join(' '));
  return out;
}

export function aererTexte(t: string): string {
  const net = t.replace(/\r\n?/g, '\n').replace(/[ \t ]+\n/g, '\n').trim();
  if (!net) return net;
  const out: string[] = [];
  for (const bloc of net.split(/\n\s*\n/)) {
    const lignes = bloc.split('\n');
    if (lignes.every(l => l.length <= LIGNE_LONGUE)) { out.push(bloc.trim()); continue; }
    let tampon: string[] = [];
    const vider = () => { if (tampon.length) { out.push(tampon.join('\n')); tampon = []; } };
    for (const l of lignes) {
      if (l.length <= LIGNE_LONGUE) { tampon.push(l.trim()); continue; }
      vider();
      out.push(...decouper(l.trim()));
    }
    vider();
  }
  return out.filter(Boolean).join('\n\n');
}

/* Un texte d'un seul bloc, qu'il vaut la peine d'aérer : long, sans ligne
   vide, et que le découpage change vraiment. */
export const texteEnBloc = (t: string): boolean => t.length > 400 && !/\n\s*\n/.test(t.trim()) && aererTexte(t) !== t.trim();

/* Les paragraphes d'un texte, pour l'afficher (une ligne vide les sépare ;
   un simple retour à la ligne reste un retour à la ligne). */
export const paragraphes = (t: string): string[] => t.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
