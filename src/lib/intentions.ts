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

/* « Créer un rendez-vous » depuis la fiche d'un client : l'agenda s'ouvre sur
   sa fenêtre « Nouveau rendez-vous », ce dossier déjà choisi. Rangé dans la
   session du navigateur, pour tenir le changement d'écran ; consommé une
   seule fois par l'agenda. */
const CLE_RDV = 'emi-rdv';

export function demanderRendezVous(rechercheId: string) {
  try { window.sessionStorage.setItem(CLE_RDV, rechercheId); } catch { /* l'agenda s'ouvrira sans dossier choisi */ }
}

/* « Nouveau rendez-vous » depuis n'importe quel écran : la barre du haut, le
   tableau de bord, le « + » du téléphone. La fenêtre (celle de l'agenda) est
   posée une fois pour toutes dans AppLayout et s'ouvre sur cet événement ;
   une fois le rendez-vous enregistré, l'agenda s'il est affiché se recharge. */
export const EVT_NOUVEAU_RDV = 'emilio:nouveau-rdv';
export const EVT_RDV_ENREGISTRE = 'emilio:rdv-enregistre';

export function demanderNouveauRdv() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT_NOUVEAU_RDV));
}

export function prendreDemandeRendezVous(): string | null {
  try {
    const id = window.sessionStorage.getItem(CLE_RDV);
    if (id) window.sessionStorage.removeItem(CLE_RDV);
    return id;
  } catch { return null; }
}

/* ── Ouvrir une fiche au bon endroit ─────────────────────────────────
   « Voir fiche » depuis une relance ouvrait toujours la fiche sur les biens
   présentés. On dit maintenant à la fiche OÙ arriver : l'onglet, le filtre du
   Suivi, et la relance dont on vient (la fiche retrouve l'action qui l'a
   créée et la surligne). Rangé dans la session du navigateur le temps de
   changer d'écran, valable une minute, lu par la fiche de ce client-là. */
export type OuvertureFiche = {
  clientId: string;
  onglet: 'suivi' | 'presentes' | 'selection' | 'visites';
  filtre?: 'tout' | 'appel' | 'rdv' | 'note' | 'message' | 'communications' | 'systeme';
  relanceId?: string;
  rechercheId?: string | null;
};
const CLE_FICHE = 'emi-fiche';

export function demanderOuvertureFiche(o: OuvertureFiche) {
  try { window.sessionStorage.setItem(CLE_FICHE, JSON.stringify({ ...o, ts: Date.now() })); } catch { /* la fiche s'ouvrira normalement */ }
}

/* Lue sans être effacée : la fiche l'efface elle-même une fois montée
   (le mode strict de React appelle deux fois les initialisations). */
export function lireOuvertureFiche(clientId: string): OuvertureFiche | null {
  try {
    const brut = window.sessionStorage.getItem(CLE_FICHE);
    if (!brut) return null;
    const o = JSON.parse(brut) as OuvertureFiche & { ts?: number };
    if (o.clientId !== clientId || !o.ts || Date.now() - o.ts > 60000) return null;
    return o;
  } catch { return null; }
}

export function oublierOuvertureFiche() {
  try { window.sessionStorage.removeItem(CLE_FICHE); } catch { /* rien à faire */ }
}

/* D'où vient une relance, et donc où ouvrir la fiche :
   - « auto » : des biens présentés sans réponse → l'onglet Présentés ;
   - un message ou une demande de rappel du client → Suivi › Messages ;
   - une relance posée avec une action (appel, note, rendez-vous…) → Suivi,
     sur le filtre de cette action, la ligne surlignée. */
export function ouvertureDepuisRelance(r: { id: string; type?: string | null; client_id: string; recherche_id?: string | null; note?: string | null }, typeAction?: string | null): OuvertureFiche {
  const base = { clientId: r.client_id, rechercheId: r.recherche_id || null, relanceId: r.id };
  if (r.type === 'auto') return { ...base, onglet: 'presentes' };
  /* « Veut visiter », posé depuis son espace : le bien est dans Présentés,
     dans le groupe « Il veut visiter ». */
  if (String(r.note || '').startsWith('Veut visiter')) return { ...base, onglet: 'presentes' };
  /* Sa réponse après une visite (offre, revoir, il réfléchit) : la visite
     est dans l'onglet Visites, avec ses raisons. */
  if (/^(Veut faire une offre|Veut revoir|Il réfléchit)/.test(String(r.note || ''))) return { ...base, onglet: 'visites' };
  if (r.type === 'message_client' || r.type === 'rappel_client') return { ...base, onglet: 'suivi', filtre: 'message' };
  return { ...base, onglet: 'suivi', filtre: filtreDuSuivi(typeAction) };
}

/* Le filtre du Suivi qui montre une ligne de journal de ce type. */
export function filtreDuSuivi(type?: string | null): NonNullable<OuvertureFiche['filtre']> {
  if (type === 'appel' || type === 'rdv' || type === 'note') return type;
  if (type === 'message_client' || type === 'demande_rappel') return 'message';
  if (type === 'email_libre' || type === 'envoi_externe') return 'communications';
  return 'tout';
}
