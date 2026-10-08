/* V3.134 — sans dépendance : lu par l'agenda, la fenêtre du rappel de visite
   et la route /api/send-mail (côté serveur). */

/* L'adresse complète d'un bien de l'agence (« 58 Avenue de la Sygrie, 92140
   Clamart »). Le bien copié dans le dossier d'un acheteur ne porte que sa
   ville : son adresse exacte reste sur le bien en vente. */
export function adresseVente(v: { adresse?: string | null; code_postal?: string | null; ville?: string | null } | null | undefined): string {
  if (!v) return '';
  const rue = String(v.adresse || '').trim();
  const cpVille = [v.code_postal, v.ville].map(x => String(x || '').trim()).filter(Boolean).join(' ');
  if (!rue) return cpVille;
  const ville = String(v.ville || '').trim().toLowerCase();
  if (!cpVille || (ville && rue.toLowerCase().includes(ville))) return rue;
  return `${rue}, ${cpVille}`;
}
