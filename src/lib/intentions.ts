/* Un geste demandé depuis un écran, exécuté par un autre.
   « + Nouveau client » vit dans la barre du haut ; le formulaire vit dans la
   liste des clients. Le bouton dépose ici son intention, la liste la ramasse
   en arrivant — et si elle est déjà affichée, l'événement la réveille. */

export const intentions = { nouveauClient: false };

export const EVT_MAJ = 'emilio:maj';
export const EVT_NOUVEAU_CLIENT = 'emilio:nouveau-client';

export function demanderNouveauClient() {
  intentions.nouveauClient = true;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT_NOUVEAU_CLIENT));
}

/* À consommer une seule fois : sans ça, revenir sur la liste rouvrirait le
   formulaire tout seul. */
export function prendreIntentionNouveauClient(): boolean {
  const oui = intentions.nouveauClient;
  intentions.nouveauClient = false;
  return oui;
}

/* Les compteurs de la barre de gauche ne se recalculaient qu'en changeant de
   page. Chaque écran qui touche aux relances ou aux dossiers le signale. */
export function signalerMaj() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT_MAJ));
}
