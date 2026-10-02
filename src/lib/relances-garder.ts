/* Sans dépendance : lu par le CRM et par les routes du serveur. */
/* V3.50 — Ce qu'une clôture de dossier ne ferme jamais d'office : les rappels
   d'un compromis en cours (« Compromis <bien> : … », posés sans recherche
   sur l'acquéreur : prêt, rétractation, acte — ils se ferment à l'acte ou
   quand le compromis tombe) et les rappels de l'agenda (« Rendez-vous : … » ;
   ceux des visites se ferment avec la visite annulée). */
export function relanceAGarder(note: string | null | undefined): boolean {
  const n = String(note || '');
  return n.startsWith('Compromis ') || n.startsWith('Rendez-vous :');
}
