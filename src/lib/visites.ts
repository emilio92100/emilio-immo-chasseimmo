/* ═══ L'issue d'une visite ═══════════════════════════════════════════════
   Après chaque visite, une issue : il veut faire une offre, il veut revoir le
   bien, il réfléchit, ou ça n'a pas abouti. Le client la donne depuis son
   espace, ou Alexandre dans son compte rendu ; l'autre côté se met à jour.

   Ce fichier est lu par le CRM (compte rendu, onglet Visites, page Visites),
   par l'espace du client et par l'API qui reçoit son avis. Une raison ajoutée
   ici apparaît partout à la fois, avec le même mot.

   Colonnes (voir outils/sql/visites-issue.sql) :
     visites.issue            offre | revoir | reflexion | non
     visites.issue_par        client | conseiller — qui l'a posée en dernier
     visites.issue_le         quand
     visites.motifs           les raisons cochées (pourquoi non, pourquoi il hésite…)
     visites.aime             ce qui lui a plu (compte rendu seulement)
     visites.mot_client       son mot libre, depuis l'espace
     visites.avis_client_le   quand LUI a répondu (null s'il n'a rien dit)
     visites.prix_envisage    le prix qu'il a en tête pour son offre
     visites.retenir          ses raisons comptent pour la recherche (oui par défaut)
     recherches.appris_masques  les lignes d'« appris » qu'Alexandre a retirées */

export type Issue = 'offre' | 'revoir' | 'reflexion' | 'non';
export const ISSUES_OK: Issue[] = ['offre', 'revoir', 'reflexion', 'non'];
export const estIssue = (x: unknown): x is Issue => typeof x === 'string' && (ISSUES_OK as string[]).includes(x);

/* Les mots, des deux côtés. Le client lit « Pas pour moi », ses propres
   mots, plutôt que « Non aboutie ». Jamais « retenu » côté client : dans son
   espace, ce mot désigne déjà les biens que la recherche a retenus pour lui. */
export const ISSUES: Record<Issue, {
  crm: string; client: string; choix: string; e: string;
  couleur: string; fond: string; trait: string;
}> = {
  offre: { crm: 'Veut faire une offre', client: 'Offre en préparation', choix: 'Je veux faire une offre', e: '💶', couleur: '#a9822f', fond: '#fbf5e6', trait: '#ecdcb4' },
  revoir: { crm: 'À revoir', client: 'À revoir', choix: 'J’aimerais le revoir', e: '👀', couleur: '#2563eb', fond: '#eef4ff', trait: '#bfdbfe' },
  reflexion: { crm: 'En réflexion', client: 'En réflexion', choix: 'J’hésite encore', e: '🤔', couleur: '#475569', fond: '#f1f5f9', trait: '#cbd5e1' },
  non: { crm: 'Non aboutie', client: 'Pas pour moi', choix: 'Pas pour moi', e: '👎', couleur: '#b4532a', fond: '#fdf1ec', trait: '#f5cdb9' },
};

/* Les raisons à cocher, par issue. `i` est l'icône de l'espace client (table
   T d'EspaceClient). Pour « non », ce sont les mêmes mots que le « Pas pour
   moi » d'avant la visite : la recherche les lit de la même façon. */
export const RAISONS: Record<Issue, { i: string; n: string }[]> = {
  non: [
    { i: 'lune', n: 'Trop sombre' },
    { i: 'visavis', n: 'Le vis-à-vis' },
    { i: 'bruit', n: 'Rue trop passante' },
    { i: 'travaux', n: 'Trop de travaux' },
    { i: 'petit', n: 'Trop petit' },
    { i: 'ascenseur', n: 'L’étage' },
    { i: 'lieu', n: 'Le quartier' },
    { i: 'jardin', n: 'Pas d’extérieur' },
    { i: 'cuisine', n: 'La cuisine' },
    { i: 'immeuble', n: 'Les parties communes' },
    { i: 'euro', n: 'Le prix' },
  ],
  reflexion: [
    { i: 'euro', n: 'Le prix' },
    { i: 'travaux', n: 'Des travaux à chiffrer' },
    { i: 'partage', n: 'En parler à un proche' },
    { i: 'loupe', n: 'Le comparer à d’autres' },
    { i: 'aide', n: 'Une question à poser' },
  ],
  revoir: [
    { i: 'soleil', n: 'À un autre moment de la journée' },
    { i: 'partage', n: 'Avec un proche' },
    { i: 'travaux', n: 'Avec un artisan' },
    { i: 'regle', n: 'Pour mesurer' },
    { i: 'cave', n: 'Voir la cave ou les parties communes' },
  ],
  offre: [],
};

/* Ce qui lui a plu : le compte rendu d'Alexandre seulement. */
export const AIME: string[] = [
  'Séjour lumineux', 'Parquet ancien', 'Hauteur sous plafond', 'Cuisine ouverte',
  'Le calme', 'Le quartier', 'L’extérieur', 'Bien entretenu', 'Les rangements',
];

/* Garde seulement les raisons connues pour cette issue, sans doublon. */
export function raisonsValides(issue: Issue, l: unknown): string[] {
  if (!Array.isArray(l)) return [];
  const ok = new Set(RAISONS[issue].map(r => r.n));
  return Array.from(new Set(l.filter((x): x is string => typeof x === 'string' && ok.has(x))));
}

/* Les visites d'avant cette colonne n'ont que l'avis du compte rendu
   (tres_interesse, interesse, a_voir, pas_interesse, elimine) : on en déduit
   l'issue, pour que l'historique se range lui aussi. */
export function issueDe(v: { issue?: string | null; avis_client?: string | null; statut?: string | null } | null | undefined): Issue | null {
  if (!v) return null;
  if (estIssue(v.issue)) return v.issue;
  if (v.statut !== 'effectuee') return null;
  switch (v.avis_client) {
    case 'pas_interesse': case 'elimine': return 'non';
    case 'a_voir': return 'revoir';
    case 'interesse': case 'tres_interesse': return 'reflexion';
    default: return null;
  }
}

/* L'ancien champ reste rempli : les écrans et les exports qui le lisent
   encore continuent de dire quelque chose de juste. */
export const AVIS_HERITE: Record<Issue, string> = {
  offre: 'tres_interesse', revoir: 'a_voir', reflexion: 'interesse', non: 'pas_interesse',
};

/* Le badge du bien après une visite. Une transaction ouverte (offre_faite)
   ne se défait jamais d'ici. « non » passe le bien en « refuse » : il sort des
   mails et se range dans « Pas pour lui » de l'onglet Présentés. */
export function badgeApresVisite(issue: Issue | null, badgeActuel: string | null | undefined): string {
  if (badgeActuel === 'offre_faite') return 'offre_faite';
  return issue === 'non' ? 'refuse' : 'visite';
}

/* Une ligne lisible : « Non aboutie · Trop sombre, Le vis-à-vis — son mot ». */
export function resumeIssue(issue: Issue | null, motifs?: string[] | null, mot?: string | null, prix?: number | null): string {
  if (!issue) return '';
  const r = (motifs || []).filter(Boolean);
  return [
    ISSUES[issue].crm,
    prix ? `autour de ${Number(prix).toLocaleString('fr-FR')} €` : '',
    r.length ? r.join(', ') : '',
  ].filter(Boolean).join(' · ') + (mot ? ` — ${mot}` : '');
}

/* ─── Ce que ses visites ont appris ───
   Les raisons des visites non abouties (à éviter) et ce qui lui a plu, avec
   le nombre de visites où c'est revenu. Une visite dont Alexandre a décoché
   « Retenir pour la recherche » ne compte pas ; une ligne qu'il a retirée non
   plus. La recherche relit ce bloc avant chaque passage. */
export type Appris = { eviter: { t: string; n: number }[]; aime: { t: string; n: number }[] };
export function apprisDe(
  visites: { issue?: string | null; avis_client?: string | null; statut?: string | null; motifs?: string[] | null; aime?: string[] | null; retenir?: boolean | null }[],
  masques?: string[] | null,
): Appris {
  const cache = new Set((masques || []).filter(Boolean));
  const eviter = new Map<string, number>(), aime = new Map<string, number>();
  for (const v of visites || []) {
    if (v.statut === 'annulee' || v.retenir === false) continue;
    const issue = issueDe(v);
    if (issue === 'non') for (const m of new Set(v.motifs || [])) if (m && !cache.has(m)) eviter.set(m, (eviter.get(m) || 0) + 1);
    for (const a of new Set(v.aime || [])) if (a && !cache.has(a)) aime.set(a, (aime.get(a) || 0) + 1);
  }
  const trie = (m: Map<string, number>) => Array.from(m, ([t, n]) => ({ t, n }))
    .sort((a, b) => b.n - a.n || a.t.localeCompare(b.t, 'fr'));
  return { eviter: trie(eviter), aime: trie(aime) };
}

/* Une visite dont l'heure est passée (heure locale du navigateur ; sans
   heure, elle compte jusqu'au soir). Même règle que la page Visites. */
export function visitePassee(v: { date_visite?: string | null; heure?: string | null }, maintenant = new Date()): boolean {
  if (!v.date_visite) return false;
  const h = /^\d{2}:\d{2}/.test(String(v.heure || '')) ? String(v.heure).slice(0, 5) : '23:59';
  const d = new Date(`${String(v.date_visite).slice(0, 10)}T${h}:00`);
  return !isNaN(d.getTime()) && d < maintenant;
}

/* Côté serveur (Vercel tourne en UTC) : « maintenant » à l'heure de Paris,
   sous la forme « AAAA-MM-JJ HH:MM », et la même règle de visite passée. */
export function maintenantParis(d = new Date()): string {
  const m = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${m.year}-${m.month}-${m.day} ${m.hour}:${m.minute}`;
}
export function visitePasseeParis(v: { date_visite?: string | null; heure?: string | null }, maintenant = maintenantParis()): boolean {
  if (!v.date_visite) return false;
  const h = /^\d{2}:\d{2}/.test(String(v.heure || '')) ? String(v.heure).slice(0, 5) : '23:59';
  return `${String(v.date_visite).slice(0, 10)} ${h}` < maintenant;
}
