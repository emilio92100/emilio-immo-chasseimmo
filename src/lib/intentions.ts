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

/* « Envoyer un mail », de n'importe quel écran (V3.87) : la fenêtre de
   rédaction s'ouvre par-dessus l'écran en cours (NouveauMailPartout, montée
   dans AppLayout), au lieu d'aller sur la page « Nouveau mail ». */
export const EVT_NOUVEAU_MAIL = 'emilio:nouveau-mail';
export function demanderNouveauMail() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT_NOUVEAU_MAIL));
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
  onglet: 'suivi' | 'presentes' | 'selection' | 'visites' | 'transaction';
  filtre?: 'tout' | 'appel' | 'rdv' | 'note' | 'message' | 'communications' | 'systeme';
  relanceId?: string;
  rechercheId?: string | null;
  /* V3.29 : depuis la fiche d'un bien, ouvrir le mail d'envoi habituel sur
     ces biens de son dossier ; depuis une alerte, lancer le rapprochement
     (ces mandats déjà cochés). */
  envoi?: string[];
  rappro?: { source: 'mandats' | 'veilles' | 'deux'; cocher?: string[] };
  /* V3.129 : le bien à amener à l'écran (Visites › « Voir sur sa fiche »). */
  bienId?: string;
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

/* « Créer son bien » depuis la fiche d'un contact vendeur ou propriétaire :
   la rubrique Biens s'ouvre sur « Nouveau bien », le propriétaire déjà relié.
   Rangé dans la session le temps de changer d'écran, consommé une fois. */
const CLE_BIEN = 'emi-nouveau-bien';

export const EVT_NOUVEAU_BIEN = 'emilio:nouveau-bien';

/* Sans propriétaire (le « + » du téléphone) : la fenêtre s'ouvre, on le
   choisira dans la fiche. Si la rubrique est déjà affichée, l'événement la
   réveille. */
export function demanderNouveauBien(clientId = '') {
  try { window.sessionStorage.setItem(CLE_BIEN, clientId || '-'); } catch { /* la rubrique s'ouvrira sans propriétaire choisi */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT_NOUVEAU_BIEN));
}

/* null : rien de demandé ; '' : un nouveau bien sans propriétaire. */
export function prendreNouveauBien(): string | null {
  try {
    const id = window.sessionStorage.getItem(CLE_BIEN);
    if (id) window.sessionStorage.removeItem(CLE_BIEN);
    return id === '-' ? '' : id;
  } catch { return null; }
}

/* ── La vue d'une rubrique (V3.24) ───────────────────────────────────
   « Mes vendeurs », « Mes estimations » : le menu de gauche ouvre Contacts
   ou Biens sur une catégorie, et allume l'entrée de la catégorie affichée,
   même quand on l'a choisie dans la page. La vue est dans l'adresse (un
   rechargement y revient) et dans la session (revenir d'une fiche retrouve
   la liste telle qu'on l'a laissée). */
export const EVT_VUE = 'emilio:vue';

export function annoncerVue(page: string, vue: string) {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(`vue.${page}`, vue); } catch { /* sans mémoire, on revient sur « Tous » */ }
  const p = new URLSearchParams(window.location.search);
  if (p.get('page') === page && p.get('vue') !== vue) {
    p.set('vue', vue);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${p.toString()}`);
  }
  window.dispatchEvent(new CustomEvent(EVT_VUE, { detail: { page, vue } }));
}

/* Le menu demande une autre catégorie à la page déjà affichée (« Mes
   vendeurs » alors qu'on est sur Contacts) : elle change sur place, sans
   recharger la liste ni remonter tout l'écran (V3.25), et la page revient
   doucement en haut. */
export const EVT_DEMANDE_VUE = 'emilio:demande-vue';

export function demanderVue(page: string, vue: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVT_DEMANDE_VUE, { detail: { page, vue } }));
  document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  document.querySelector('.crm-app > div')?.scrollTo({ top: 0, behavior: 'smooth' });
}

/* La vue à l'ouverture de la rubrique : celle de l'adresse (le menu vient de
   la demander), sinon la dernière de la session. */
export function vueDemandee(page: string): string | null {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  if (p.get('page') === page && p.get('vue')) return p.get('vue');
  try { return window.sessionStorage.getItem(`vue.${page}`); } catch { return null; }
}

/* ── Ouvrir la fiche d'un bien sur un onglet (V3.29) ─────────────────
   « Voir les acheteurs » depuis une alerte : la fiche du bien s'ouvre sur
   l'onglet Acheteurs. Rangé dans la session, valable une minute, lu une
   fois par la fiche de ce bien-là. */
const CLE_ONGLET_BIEN = 'emi-onglet-bien';

export function demanderOngletBien(bienId: string, onglet: string) {
  try { window.sessionStorage.setItem(CLE_ONGLET_BIEN, JSON.stringify({ bienId, onglet, ts: Date.now() })); } catch { /* la fiche s'ouvrira sur la Vue d'ensemble */ }
}

/* Lue sans être effacée (le mode strict appelle deux fois les
   initialisations) : la fiche l'efface une fois montée. */
export function lireOngletBien(bienId: string): string | null {
  try {
    const brut = window.sessionStorage.getItem(CLE_ONGLET_BIEN);
    if (!brut) return null;
    const o = JSON.parse(brut) as { bienId?: string; onglet?: string; ts?: number };
    if (o.bienId !== bienId || !o.ts || Date.now() - o.ts > 60000) return null;
    return o.onglet || null;
  } catch { return null; }
}

export function oublierOngletBien() {
  try { window.sessionStorage.removeItem(CLE_ONGLET_BIEN); } catch { /* rien à faire */ }
}
