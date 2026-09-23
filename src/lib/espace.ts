/**
 * Ouvrir l'espace d'un client à partir d'un lien.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────
 *
 * Le lien de l'espace était posé sur la recherche. Un client avec deux
 * recherches recevait donc deux liens et installait deux applications pour
 * un seul dossier. Depuis la migration `migration-espace-client.sql`, le
 * lien qu'on envoie est rangé sur le CLIENT : un seul, définitif, quel que
 * soit le nombre de recherches ouvertes ensuite.
 *
 * ── Les deux sortes de jetons ────────────────────────────────────────
 *
 *   clients.token_espace      le lien public. C'est celui qu'Alexandre
 *                             copie, celui du mail de bienvenue, celui que
 *                             le téléphone enregistre sur l'écran d'accueil.
 *
 *   recherches.token_espace   l'adresse interne d'une recherche. Elle ne
 *                             s'envoie plus, mais elle reste valable : tous
 *                             les liens déjà partis continuent d'ouvrir le
 *                             bon dossier. C'est aussi ce que l'espace
 *                             présente aux routes /api/espace/ pour dire
 *                             « voilà la recherche dont je parle ».
 *
 * Les deux entrent par la même porte : `ouvrirEspace` accepte l'un ou
 * l'autre et rend toujours la même chose — le client, toutes ses recherches
 * visibles, et celle qu'il faut afficher.
 */

/* Le client Supabase est passé par l'appelant : côté serveur il est créé
   avec la clé de service, et ce fichier n'a pas à en décider. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Base = any;

export type RechercheEspace = {
  id: string;
  client_id: string;
  nom: string | null;
  token_espace: string | null;
  espace_actif: boolean | null;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [colonne: string]: any;
};

export type ClientEspace = {
  id: string;
  prenom: string | null;
  nom: string | null;
  reference: string | null;
  token_espace: string | null;
  created_at: string | null;
};

export type Espace = {
  client: ClientEspace;
  /** Toutes les recherches visibles du client, la plus ancienne d'abord. */
  recherches: RechercheEspace[];
  /** Celle qu'on affiche. Toujours présente dans `recherches`. */
  recherche: RechercheEspace;
  /** Sa position dans la liste, à partir de 1 — le « 1 sur 2 » de l'écran. */
  rang: number;
  /** Les biens présentés et pas encore ouverts, par recherche. */
  nonLus: Record<string, number>;
  /** Le lien permanent du client, s'il en a un. */
  jetonClient: string | null;
  /** Vrai quand le lien utilisé est l'ancienne adresse d'une recherche. */
  ancienLien: boolean;
};

/* Même plancher qu'ailleurs : les anciens jetons font 64 caractères, les
   nouveaux « dupont-k3n8vq2fab » une vingtaine. Douze écarte les adresses
   fantaisistes sans refuser un client dont le nom est court. */
export function jetonPlausible(token?: string | null): boolean {
  return !!token && token.length >= 12 && token.length <= 128;
}

/**
 * Du lien au dossier.
 *
 * @param token    ce qu'il y a dans l'adresse (jeton de client ou de recherche)
 * @param voulue   l'identifiant d'une recherche précise (le `?r=` de l'adresse,
 *                 ou ce que l'espace envoie quand le client a basculé)
 *
 * Rend `null` dès que quelque chose ne va pas — lien inconnu, client sans
 * aucune recherche visible. L'appelant décide quoi en faire : la page
 * affiche « ce lien n'est plus actif », les routes répondent 401.
 */
export async function ouvrirEspace(
  supabase: Base,
  token: string,
  voulue?: string | null,
): Promise<Espace | null> {
  if (!jetonPlausible(token)) return null;

  /* ── 1. de quel client parle-t-on ? ──
     Le jeton du client d'abord : c'est le cas normal, et c'est aussi ce qui
     évite de se renvoyer soi-même quand la reprise lui a donné le jeton de
     sa première recherche (les deux valeurs sont alors identiques). */
  const { data: parClient } = await supabase
    .from('clients')
    .select('id, prenom, nom, reference, token_espace, created_at')
    .eq('token_espace', token)
    .maybeSingle();

  let client: ClientEspace | null = parClient || null;
  let ancienLien = false;
  let origine: string | null = null;

  if (!client) {
    /* ── un lien envoyé avant la bascule ──
       Il pointe sur une recherche. On remonte au client, et on se souvient
       de la recherche : c'est elle qu'il s'attend à voir s'ouvrir. */
    const { data: parRecherche } = await supabase
      .from('recherches')
      .select('id, client_id, clients(id, prenom, nom, reference, token_espace, created_at)')
      .eq('token_espace', token)
      .maybeSingle();

    if (!parRecherche) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client = ((parRecherche as any).clients as ClientEspace) || null;
    if (!client) return null;
    ancienLien = true;
    origine = parRecherche.id as string;
  }

  /* ── 2. toutes ses recherches ──
     On ne filtre PAS sur `active` : cette colonne dit laquelle est mise en
     avant dans le CRM, pas lesquelles le client a le droit de voir. Seul
     `espace_actif = false` cache une recherche — c'est son rôle. */
  const { data: brutes } = await supabase
    .from('recherches')
    .select('*')
    .eq('client_id', client.id)
    .order('created_at', { ascending: true });

  const recherches = ((brutes || []) as RechercheEspace[])
    .filter((r) => r.espace_actif !== false);

  if (recherches.length === 0) return null;

  /* ── 3. où est le nouveau ? ──
     Une seule requête pour toutes les recherches : elle sert au compteur du
     sélecteur (« 3 nouveaux ») et à choisir laquelle ouvrir par défaut. */
  const ids = recherches.map((r) => r.id);
  const { data: apercu } = await supabase
    .from('biens')
    .select('recherche_id, vu_le, envoye_le')
    .in('recherche_id', ids)
    .eq('etape', 'presente');

  const nonLus: Record<string, number> = {};
  const dernierEnvoi: Record<string, number> = {};
  for (const id of ids) { nonLus[id] = 0; dernierEnvoi[id] = 0; }

  for (const b of (apercu || []) as { recherche_id: string; vu_le: string | null; envoye_le: string | null }[]) {
    if (!b.vu_le) nonLus[b.recherche_id] = (nonLus[b.recherche_id] || 0) + 1;
    const t = b.envoye_le ? new Date(b.envoye_le).getTime() : 0;
    if (t > (dernierEnvoi[b.recherche_id] || 0)) dernierEnvoi[b.recherche_id] = t;
  }

  /* ── 4. laquelle on affiche ──
       a) celle qu'on demande explicitement (bascule du client, `?r=`, lien
          d'une notification) ;
       b) sinon, celle dont le lien a servi à entrer ;
       c) sinon, celle où il a du nouveau — et à défaut la plus récemment
          alimentée. Le client qui rouvre son application tombe donc sur ce
          qu'il n'a pas encore lu, sans avoir à chercher. */
  let recherche =
    (voulue && recherches.find((r) => r.id === voulue)) ||
    (origine && recherches.find((r) => r.id === origine)) ||
    null;

  if (!recherche) {
    recherche = recherches.slice().sort((a, b) => {
      const na = nonLus[a.id] > 0 ? 1 : 0;
      const nb = nonLus[b.id] > 0 ? 1 : 0;
      if (na !== nb) return nb - na;
      if (dernierEnvoi[b.id] !== dernierEnvoi[a.id]) return dernierEnvoi[b.id] - dernierEnvoi[a.id];
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })[0];
  }

  return {
    client,
    recherches,
    recherche,
    rang: recherches.findIndex((r) => r.id === recherche!.id) + 1,
    nonLus,
    jetonClient: client.token_espace || null,
    ancienLien,
  };
}

/**
 * À qui appartient ce lien, sans rien charger d'autre.
 *
 * Sert quand `ouvrirEspace` a rendu `null` : on ne sait pas encore si le lien
 * est inconnu — une adresse recopiée de travers — ou s'il appartient bien à
 * un client qui n'a simplement plus de recherche ouverte. Les deux méritent
 * un écran différent : « ce lien n'est plus actif » d'un côté, « votre
 * recherche est en préparation » de l'autre.
 */
export async function clientDuJeton(supabase: Base, token: string): Promise<ClientEspace | null> {
  if (!jetonPlausible(token)) return null;

  const { data } = await supabase
    .from('clients')
    .select('id, prenom, nom, reference, token_espace, created_at')
    .eq('token_espace', token)
    .maybeSingle();
  if (data) return data as ClientEspace;

  const { data: parRecherche } = await supabase
    .from('recherches')
    .select('clients(id, prenom, nom, reference, token_espace, created_at)')
    .eq('token_espace', token)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((parRecherche as any)?.clients as ClientEspace) || null;
}

/**
 * Ce que l'espace affiche dans son sélecteur.
 *
 * Le nom d'une recherche est saisi par Alexandre (« Recherche principale »,
 * « Investissement Levallois ») : il est fait pour le CRM, pas forcément
 * pour le client. On le garde s'il dit quelque chose, et on retombe sinon
 * sur les critères — le type de bien et le premier secteur suffisent à
 * reconnaître de quelle recherche on parle.
 */
export function nommerRecherche(r: RechercheEspace, rang: number): string {
  const secteur = (r.secteurs || [])[0] || '';
  const type = String(r.type_bien || '').split(',')[0].trim();
  const depuisCriteres = [type, secteur].filter(Boolean).join(' · ');

  const nom = String(r.nom || '').trim();
  const fade = !nom || /^recherche\s*(principale|\d+)?$/i.test(nom);

  if (fade && depuisCriteres) return depuisCriteres;
  if (nom) return nom;
  return depuisCriteres || `Recherche ${rang}`;
}

/** « 3 pièces · jusqu'à 720 000 € » — la ligne sous le nom, dans le sélecteur. */
export function resumerRecherche(r: RechercheEspace): string {
  const bouts: string[] = [];
  if (r.nb_pieces_min) bouts.push(`${r.nb_pieces_min} pièce${r.nb_pieces_min > 1 ? 's' : ''} et plus`);
  else if (r.surface_min) bouts.push(`à partir de ${r.surface_min} m²`);
  if (r.budget_max) bouts.push(`jusqu'à ${Number(r.budget_max).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} €`);
  const secteurs = (r.secteurs || []) as string[];
  if (!bouts.length && secteurs.length) bouts.push(secteurs.slice(0, 2).join(', '));
  return bouts.join(' · ');
}
