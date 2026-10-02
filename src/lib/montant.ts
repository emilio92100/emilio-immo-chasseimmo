/* ═══ Un montant tapé au clavier (V3.50) ═══════════════════════════════════
   Une seule lecture pour tous les champs d'argent du CRM. Avant, chaque écran
   avait la sienne, et elles ne lisaient pas pareil :
   - « 8 333,33 » dans les honoraires d'une transaction devenait 833 333 €
     (les chiffres seuls étaient gardés : la virgule disparaissait) ;
   - « 850.000 » devenait 850 € dans la fiche d'un bien.

   Ce qu'on accepte, et ce qu'on en lit :
     « 8 333,33 »  « 8333,33 »  « 8333.33 »     → 8333,33
     « 42 500 € »  « 42.500 »   « 42 500,00 »   → 42500
     « 1.250.000 » « 1 250 000 »                → 1250000
     « 850k »      « 850 k€ »   « 1,2M »        → 850000 / 1200000
   Vide ou illisible → null, jamais NaN. Arrondi au centime. */
export function lireMontant(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (v === null || v === undefined) return null;
  let t = String(v).toLowerCase().replace(/[\s  €]|eur(os?)?/g, '');
  if (!t) return null;
  let mult = 1;
  if (/^[\d.,-]+k$/.test(t)) { mult = 1000; t = t.slice(0, -1); }
  else if (/^[\d.,-]+m$/.test(t)) { mult = 1000000; t = t.slice(0, -1); }
  if (!/^-?[\d.,]+$/.test(t)) return null;
  /* Des points tous les trois chiffres : des milliers, à la française. */
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '');
  /* Des virgules tous les trois chiffres, avec un point décimal : à l'anglaise. */
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) && mult === 1) t = t.replace(/,/g, '');
  t = t.replace(',', '.');
  if ((t.match(/\./g) || []).length > 1) return null;
  const n = Number(t) * mult;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/* « 8 333,33 € » — l'écriture française, sans les espaces insécables qui
   cassent l'affichage de certains polices. */
export function ecrireMontant(n: number | null | undefined, unite = ' €'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n).replace(/[  ]/g, ' ') + unite;
}
