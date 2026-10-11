/* ═══ « C'est fait » (V3.174) ═══════════════════════════════════════════════
   Le pendant des échecs (src/lib/ecritures.ts) : une petite carte qui glisse
   en haut à droite, une coche qui se dessine, puis s'en va seule. Alexandre :
   « quand on appuie sur Créer, une petite notification à droite : nouveau
   contact notaire créé, avec une petite animation ». Un événement : n'importe
   quel écran l'annonce, `Succes` (posé dans AppLayout) l'affiche. */
export const EVT_SUCCES = 'emi-succes';
export type Succes = { titre: string; detail?: string; ic?: string; le: number };

export function annoncerSucces(x: { titre: string; detail?: string; ic?: string }) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<Succes>(EVT_SUCCES, { detail: { ...x, le: Date.now() } }));
}
