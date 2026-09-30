/* La boîte de réception des demandes du site (V3.34) : le menu de gauche et
   l'en-tête de la rubrique. Même trait que les autres pictogrammes. */
export default function PictoBoite({ taille = 22, epaisseur = 1.9 }: { taille?: number; epaisseur?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={epaisseur}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      <path d="M3.5 13.5 6 5.6A2 2 0 0 1 7.9 4.2h8.2A2 2 0 0 1 18 5.6l2.5 7.9" />
      <path d="M3.5 13.5V18a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-4.5h-4.8l-1.3 2.3h-4.8L8.3 13.5z" />
    </svg>
  );
}
