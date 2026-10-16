/* ═══ Ce que le client voit de ton suivi avec l'agence (V3.193) ═══════════
   Alexandre : « que le client voie que je travaille dessus : un bien où
   j'attends une réponse, un retour, une messagerie du collègue ». Maquettes
   (canvas « Son suivi visible par le client ») : il a pris A + B — les
   ÉTAPES, déduites de tes appels notés, et un MOT de toi quand tu le
   décides. Jamais ce qui a été dit, ni l'agence, ni son numéro, ni
   l'adresse : l'agence s'appelle « le vendeur », et les notes rapides
   restent à toi.

   Chaque appel noté porte `montrer` (la case « Lui montrer l'étape ») et
   `mot_client` (« Un mot pour … ») — outils/sql/suivis-agence-client.sql.

   Pur : rien n'est lu ni écrit ici. La même phrase sert à l'aperçu dans
   « Noter un appel » (CRM) et à l'espace du client (le serveur). */

export type CreneauC = { date: string; heure: string; fin?: string };
export type AppelVisible = {
  id?: string; genre?: string | null; reponse?: string | null; dispo?: string | null;
  creneaux?: CreneauC[] | null; ensuite?: string | null; rappel_le?: string | null;
  mot_client?: string | null; montrer?: boolean | null; created_at?: string | null;
};
/** `ancien` : un appel d'avant les trois derniers — replié chez le client,
    « Voir les N échanges plus anciens » le déplie (V3.194). */
export type EtapeClient = { t: string; sous?: string; le?: string; etat: 'fait' | 'encours' | 'avenir'; mot?: string; ancien?: boolean };
export type SuiviClient = { etapes: EtapeClient[]; calee: boolean };

/** Les appels visibles d'emblée ; les plus anciens se déplient. */
export const APPELS_VISIBLES = 3;

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « 2026-10-17 » → « sam. 17 oct. » */
function jour(cle: string): string {
  const [y, m, j] = String(cle || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !j) return '';
  const d = new Date(y, m - 1, j);
  return `${JOURS[d.getDay()]} ${j} ${MOIS[m - 1]}`;
}
const heure = (h?: string | null) => {
  const [a, b] = String(h || '').split(':');
  if (!a) return '';
  return `${Number(a)} h${b && b !== '00' ? ` ${b.slice(0, 2)}` : ''}`;
};
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** La phrase d'un appel, telle que le client la lit. `null` : rien à lui
    montrer (un bien vendu passe par « Plus disponible », pas par ici). */
export function phraseAppel(l: AppelVisible): { t: string; sous: string } | null {
  if (l.dispo === 'vendu') return null;
  const creneaux = (l.creneaux || []).filter(c => c && c.date >= aujourdhui());
  if (l.reponse === 'message') return { t: 'Alexandre a laissé un message au vendeur', sous: 'Il attend son retour.' };
  if (l.reponse === 'sans_reponse') return { t: 'Alexandre a appelé le vendeur', sous: 'Pas de réponse pour l’instant : il le rappelle.' };
  if (creneaux.length) return { t: 'Le vendeur a proposé des créneaux', sous: 'Alexandre organise la visite.' };
  if (l.ensuite === 'rappeler' && l.rappel_le) {
    const j = jour(l.rappel_le);
    return { t: 'Alexandre a parlé au vendeur', sous: j ? `Il le rappelle ${j.replace(/\.$/, '')}.` : 'Il le rappelle.' };
  }
  if (l.ensuite === 'attente') return { t: 'Alexandre a parlé au vendeur', sous: 'Il attend son retour.' };
  if (l.dispo === 'disponible') return { t: 'Alexandre a parlé au vendeur', sous: 'Le bien est toujours disponible.' };
  return { t: 'Alexandre a parlé au vendeur', sous: '' };
}

/** Les appels que le client voit : montrés et avec une phrase, du plus
    ancien au plus récent. Tous, depuis la V3.194 (les plus anciens repliés
    chez lui). Le CRM s'en sert pour marquer « Visible par … ». */
export function appelsMontres(appels: AppelVisible[]): { a: AppelVisible; p: { t: string; sous: string } }[] {
  return appels
    .filter(a => (a.genre || 'appel') === 'appel' && a.montrer !== false)
    .map(a => ({ a, p: phraseAppel(a) }))
    .filter((x): x is { a: AppelVisible; p: { t: string; sous: string } } => !!x.p)
    .sort((x, y) => String(x.a.created_at || '').localeCompare(String(y.a.created_at || '')));
}

/** Les étapes d'un bien, pour son espace. `null` : rien à montrer (aucun
    appel montré). */
export function suiviPourClient(appels: AppelVisible[], o: {
  avis?: string | null; retourLe?: string | null; visite?: { date: string; heure?: string | null } | null;
}): SuiviClient | null {
  const vus = appelsMontres(appels);
  /* Sans appel montré, rien : une visite calée a déjà son bloc sur la fiche. */
  if (!vus.length) return null;
  const etapes: EtapeClient[] = [];
  if (o.avis === 'souhaite_visiter') etapes.push({ t: 'Vous voulez le visiter', le: o.retourLe || undefined, etat: 'fait' });
  else if (o.avis === 'interesse') etapes.push({ t: 'Ce bien vous plaît', le: o.retourLe || undefined, etat: 'fait' });
  vus.forEach(({ a, p }, i) => {
    const dernier = i === vus.length - 1 && !o.visite;
    const mot = String(a.mot_client || '').trim();
    const ancien = i < vus.length - APPELS_VISIBLES;
    etapes.push({ t: p.t, sous: dernier ? p.sous || undefined : undefined, le: a.created_at || undefined, etat: dernier ? 'encours' : 'fait', ...(mot ? { mot } : {}), ...(ancien ? { ancien } : {}) });
  });
  if (o.visite) {
    const quand = [jour(o.visite.date), o.visite.heure ? `à ${heure(o.visite.heure)}` : ''].filter(Boolean).join(' ');
    etapes.push({ t: 'La visite est calée', sous: quand ? `${quand.charAt(0).toUpperCase()}${quand.slice(1)}.` : undefined, etat: 'fait' });
  } else {
    etapes.push({ t: 'La visite est calée', sous: 'Elle s’ajoutera ici et dans « Vos visites ».', etat: 'avenir' });
  }
  return { etapes, calee: !!o.visite };
}
