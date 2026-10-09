import { createClient } from '@supabase/supabase-js';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { after } from 'next/server';
import EspaceClient from '@/components/espace/EspaceClient';
import { ouvrirEspace, clientDuJeton, nommerRecherche, resumerRecherche } from '@/lib/espace';
import EspaceEnPreparation from './preparation';
import { jetonEspace, HOTE_ESPACE } from '@/lib/jeton';
import { etatMandat, finRetractationPour, rechercheDepuis, masquerEmail, type Mandant, type Societe } from '@/lib/mandat';
import { lireReserve, mandatDocumentEnRoute, mandatDocumentSigne, mandatDocumentRetracte, renonciationDocument, memeNumero, signeSansNumero } from '@/lib/mandat-serveur';
import { maintenantParis, visitePasseeParis, issueDe, apprisDe } from '@/lib/visites';
import { lireDocumentsEspace, fichierDe, modeDoc, type DocEspace, type MandatDocEspace } from '@/lib/documents-espace';
import { ecritServeur } from '@/lib/ecritures';
import { prixDuBien } from '@/lib/honoraires-bien';

/**
 * Espace acheteur — /espace/<token>
 *
 * Aucun compte, aucun mot de passe : le lien EST l'identification.
 *
 * ⚠️ Le lien appartient au CLIENT, pas à la recherche (voir src/lib/espace.ts).
 * Un client qui a deux recherches n'a qu'un seul lien, une seule application
 * sur son téléphone, et un sélecteur en haut de son espace pour passer de
 * l'une à l'autre. Les liens envoyés avant ce changement pointaient sur une
 * recherche : ils marchent toujours, et retombent sur le lien permanent.
 *
 * Cette page est publique (voir src/proxy.ts). Tout ce qu'elle lit passe
 * par le serveur : le navigateur du client ne reçoit que ce qui le regarde.
 */

export const dynamic = 'force-dynamic';

/* Un composant serveur (async), rendu une fois par requête : l'heure du
   moment (Date.now) y est voulue. La règle « purity » du compilateur React
   vise les composants du navigateur ; elle ne lisait pas cette page jusqu'à
   la V3.55 (un bloc try qu'elle ne savait pas analyser). */
/* eslint-disable react-hooks/purity */

function base() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, cle);
}

/* Le trajet jusqu'à la station, pour la note de correspondance.
   La veille décrit la situation d'un bien en toutes lettres (« À 6 min à
   pied du métro Boulogne – Jean Jaurès (ligne 10), au pied des Passages »).
   On n'en envoie au navigateur que deux faits : le nombre de minutes à pied,
   et l'arrêt du client qu'elle cite, s'il y en a un. Le texte lui-même
   reste ici. */
const sansAccents = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
function trajetDe(situation: string | null | undefined, arrets: { nom?: string }[]) {
  if (!situation) return null;
  const m = String(situation).match(/(\d{1,2})\s*min(?:utes?)?\.?\s*(?:environ\s*)?(?:à|a)\s*pied/i);
  if (!m) return null;
  const minutes = Number(m[1]);
  if (!isFinite(minutes) || minutes <= 0) return null;
  const texte = sansAccents(String(situation));
  const arret = (arrets || []).find(a => a?.nom && sansAccents(a.nom).length > 3 && texte.includes(sansAccents(a.nom)));
  return { minutes, arret: arret?.nom || null };
}

const ETAT = (b: { vu_le?: string | null; badge_retour?: string | null }) => {
  if (!b.vu_le) return 'neuf';
  if (!b.badge_retour || b.badge_retour === 'propose') return 'vu';
  return 'avis';
};

export default async function PageEspace({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const requete = await searchParams;
  /* `?r=` dit quelle recherche afficher : c'est ce que pose le sélecteur
     quand le client bascule, et ce que portent les liens des notifications. */
  const voulue = typeof requete.r === 'string' ? requete.r : null;

  const supabase = base();

  /* Le lien peut être celui du client (le cas normal) ou l'ancienne adresse
     d'une recherche. Les deux entrent par la même porte. */
  const espace = await ouvrirEspace(supabase, token, voulue);

  /* Rien à afficher. Reste à savoir pourquoi, parce que ce n'est pas le même
     écran : un lien inconnu n'a rien à dire, alors qu'un client bien réel
     entre deux recherches mérite qu'on le lui explique plutôt que de lui
     annoncer que son lien est mort. */
  if (!espace) {
    const proprietaire = await clientDuJeton(supabase, token);
    if (!proprietaire) notFound();
    return <EspaceEnPreparation prenom={proprietaire.prenom} />;
  }

  const { client, recherche, recherches, rang, nonLus, jetonClient, ancienLien } = espace;

  /* Un lien d'avant la bascule : on le fait converger vers le lien permanent
     du client, en gardant la recherche qu'il visait et le reste de l'adresse.
     Le téléphone du client en profite pour mettre à jour son raccourci. */
  if (ancienLien && jetonClient && jetonClient !== token) {
    const entetes = await headers();
    const hote = (entetes.get('host') || '').toLowerCase().split(':')[0];
    const suite = new URLSearchParams();
    for (const [cle, valeur] of Object.entries(requete)) {
      if (typeof valeur === 'string') suite.set(cle, valeur);
    }
    suite.set('r', recherche.id);
    redirect(`${hote === HOTE_ESPACE ? '' : '/espace'}/${jetonClient}?${suite.toString()}`);
  }

  /* Les routes /api/espace/ reconnaissent une recherche à son propre jeton :
     c'est lui qu'on donnera à l'espace pour ses écritures. Une recherche qui
     n'en aurait pas (un cas qui ne devrait pas exister) en reçoit un ici,
     plutôt que de laisser le client devant des boutons qui ne répondent pas. */
  let jetonRecherche = (recherche.token_espace as string | null) || null;
  if (!jetonRecherche) {
    jetonRecherche = jetonEspace(client.prenom, client.nom);
    await ecritServeur('Le jeton de la recherche', supabase.from('recherches').update({ token_espace: jetonRecherche }).eq('id', recherche.id));
  }

  const [biensRes, passagesRes, totalRes, visitesRes, finRes, coordRes, signRes, reserve] = await Promise.all([
    supabase.from('biens').select('*').eq('recherche_id', recherche.id).eq('etape', 'presente')
      .order('envoye_le', { ascending: false, nullsFirst: false }),
    /* Les derniers passages : le tout premier dit « la dernière recherche »,
       les autres servent à « jour après jour ». Soixante suffisent largement
       pour couvrir sept jours, même avec plusieurs dépôts par jour. */
    supabase.from('veille_passages').select('*').eq('recherche_id', recherche.id)
      .order('termine_le', { ascending: false, nullsFirst: false }).limit(60),
    /* Tous les passages du dossier, pour le total d'annonces lues. On ne tire
       qu'une colonne d'entiers : même après des années, c'est quelques kilo-octets. */
    supabase.from('veille_passages').select('nb_lues, nb_proposees, nb_ecartees').eq('recherche_id', recherche.id),
    /* Toutes les visites du dossier. Celles à venir ouvrent l'espace ; celles
       qui sont faites portent le compte rendu, et c'est elles qui font passer
       un bien de « visite à venir » à « visite effectuée » à l'écran. */
    supabase.from('visites').select('*').eq('recherche_id', recherche.id)
      .in('statut', ['a_venir', 'effectuee']).order('date_visite', { ascending: true }),
    /* La dernière fois que le client a déclaré lui-même que c'était fini.
       Voir `enCours` plus bas. */
    supabase.from('journal').select('created_at')
      .eq('recherche_id', recherche.id).eq('type', 'fin_recherche')
      .order('created_at', { ascending: false }).limit(1),
    /* Pour le mandat : ses coordonnées (pré-remplies à la signature), sa
       dernière signature, et la réserve de numéros d'Alexandre. Avant que le
       SQL soit passé, la table n'existe pas : la lecture échoue sans bruit,
       et l'espace se comporte comme avant. */
    /* Toute la fiche : la civilité et le conjoint (fiche « couple ») n'existent
       qu'une fois le SQL de la signature à plusieurs lancé. */
    supabase.from('clients').select('*').eq('id', client.id).maybeSingle(),
    supabase.from('mandats_signatures').select('*').eq('recherche_id', recherche.id)
      .order('created_at', { ascending: false }).limit(1),
    lireReserve(supabase),
  ]);
  const tous = totalRes.data || [];
  const totalLues = tous.reduce((t, x) => t + (x.nb_lues || 0), 0);
  const totalRetenues = tous.reduce((t, x) => t + (x.nb_proposees || 0), 0);
  const totalEcartees = tous.reduce((t, x) => t + (x.nb_ecartees || 0), 0);
  const nbPassages = tous.length;

  /* Ce que le CRM sait des visites, rangé par bien. Le statut d'un bien à
     l'écran ne se devine plus du badge : il vient d'ici, donc il est toujours
     d'accord avec l'agenda d'Alexandre.
       une visite calée et pas encore passée → « Visite à venir »
       une visite faite, ou dont l'heure est passée
                                             → « Visite effectuée » + son compte rendu,
                                               dès qu'Alexandre l'a écrit */
  const toutesVisites = visitesRes.data || [];

  /* Une visite dont l'heure est passée a eu lieu, même si Alexandre n'a pas
     encore écrit son compte rendu. Avant, elle sortait de « Visite à venir »
     sans entrer dans « Visités » : le bien retombait dans « Je veux visiter »,
     comme si personne ne l'avait vu, et la visite disparaissait de l'espace.
     L'heure de référence est celle de Paris : le serveur, lui, tourne en UTC.
     Sans heure, la visite compte jusqu'au soir (23 h 59), comme dans le CRM. */
  const maintenant = maintenantParis();
  const estPassee = (v: { date_visite?: string | null; heure?: string | null }) => visitePasseeParis(v, maintenant);

  const prevueParBien = new Map<string, { date: string; heure: string | null }>();
  toutesVisites
    .filter((v) => v.statut === 'a_venir' && v.date_visite && !estPassee(v))
    .forEach((v) => {
      if (!v.bien_id || prevueParBien.has(v.bien_id)) return;   // la plus proche d'abord
      prevueParBien.set(v.bien_id, { date: v.date_visite, heure: v.heure || null });
    });

  /* Faite = marquée « effectuée » dans le CRM, ou calée à une heure déjà
     passée. Dans le second cas, le compte rendu n'est pas encore écrit : la
     fiche du client dit simplement que son conseiller lui fait un retour. */
  const faiteParBien = new Map<string, { date: string | null; commentaire: string | null; etoiles: number | null }>();
  toutesVisites
    .filter((v) => v.statut === 'effectuee' || (v.statut === 'a_venir' && estPassee(v)))
    .forEach((v) => {
      if (!v.bien_id) return;                                    // la dernière l'emporte
      const faite = v.statut === 'effectuee';
      faiteParBien.set(v.bien_id, {
        date: v.date_visite || null,
        commentaire: faite ? v.commentaire || null : null,
        etoiles: faite ? v.note_etoiles || null : null,
      });
    });

  /* Un bien de l'agence sous compromis, vendu ou retiré de la vente (V3.47) :
     l'espace le dit, au lieu de le montrer encore comme disponible. Pour
     celui qui l'achète, c'est « Votre achat » : l'offre retenue au dernier
     compromis porte sa recherche (à défaut, pour un compromis d'avant, la
     seule offre acceptée du bien). Une autre offre acceptée puis tombée ne
     compte pas. */
  const idsVente = Array.from(new Set((biensRes.data || []).map((b) => b.bien_vente_id).filter(Boolean))) as string[];
  const venteParBien = new Map<string, { etat: 'compromis' | 'vendu' | 'retire' | 'pause'; vous: boolean }>();
  /* V3.48 : où en est SON offre sur un bien de l'agence (acceptée, refusée,
     retirée, compromis tombé) — l'espace ne disait que « Offre envoyée ». */
  const offreParBien = new Map<string, { statut: string; tombe: boolean }>();
  const chargesAnParVente = new Map<string, number>();
  if (idsVente.length) {
    const [ventes, compromis, offres] = await Promise.all([
      supabase.from('biens_vente').select('id, etape, donnees').in('id', idsVente),
      supabase.from('biens_vente_suivi').select('bien_id, le, donnees').in('bien_id', idsVente).eq('type', 'etape').eq('statut', 'compromis'),
      supabase.from('biens_vente_suivi').select('id, bien_id, client_id, recherche_id, statut, le, donnees').in('bien_id', idsVente).eq('type', 'offre'),
    ]);
    const dernier = new Map<string, { le: string; offre: string | null }>();
    for (const c of (compromis.data || []) as { bien_id: string; le: string; donnees: Record<string, unknown> | null }[]) {
      const o = c.donnees?.offre;
      const avant = dernier.get(c.bien_id);
      if (!avant || c.le > avant.le) dernier.set(c.bien_id, { le: c.le, offre: typeof o === 'string' && o ? o : null });
    }
    const lesOffres = (offres.data || []) as { id: string; bien_id: string; client_id: string | null; recherche_id: string | null; statut: string | null; le: string; donnees: Record<string, unknown> | null }[];
    /* La sienne : faite pour cette recherche, ou par lui (une autre de ses recherches). */
    const sienne = (o: { client_id: string | null; recherche_id: string | null }) => o.recherche_id === recherche.id || (!!o.client_id && o.client_id === client.id);
    const estAMoi = (bienId: string) => {
      const c = dernier.get(bienId);
      const retenue = c?.offre ? lesOffres.find((o) => o.id === c.offre) : null;
      if (retenue) return sienne(retenue);
      const acceptees = lesOffres.filter((o) => o.bien_id === bienId && o.statut === 'acceptee');
      return acceptees.length === 1 && sienne(acceptees[0]);
    };
    for (const v of (ventes.data || []) as { id: string; etape: string; donnees?: Record<string, unknown> | null }[]) {
      /* V3.133 : les charges annuelles saisies dans le CRM (la copie n'a que le trimestre). */
      const an = Number(v.donnees?.chargesAn);
      if (an > 0) chargesAnParVente.set(v.id, an);
      if (v.etape === 'compromis' || v.etape === 'vendu') venteParBien.set(v.id, { etat: v.etape, vous: estAMoi(v.id) });
      else if (v.etape === 'retire') venteParBien.set(v.id, { etat: 'retire', vous: false });
      else if (v.etape === 'suspendu') venteParBien.set(v.id, { etat: 'pause', vous: false });
    }
    for (const o of lesOffres.filter(sienne).sort((x, y) => String(x.le).localeCompare(String(y.le)))) {
      offreParBien.set(o.bien_id, { statut: o.statut || 'en_attente', tombe: !!o.donnees?.compromisTombe });
    }
  }
  /* V3.48 : un bien vendu à un autre, ou retiré de la vente, ne montre plus de
     visite à venir (le CRM propose de les annuler ; celles d'avant restent
     masquées ici). Sous compromis, une visite reste : une contre-visite, un
     acheteur de secours. */
  const copiesIndispo = new Set((biensRes.data || []).filter((b) => {
    const v = b.bien_vente_id ? venteParBien.get(b.bien_vente_id) : null;
    return !!v && !v.vous && (v.etat === 'vendu' || v.etat === 'retire');
  }).map((b) => b.id as string));
  for (const id of copiesIndispo) prevueParBien.delete(id);

  const biens = (biensRes.data || []).map((b) => ({
    id: b.id,
    titre: b.titre || `${b.type_bien || 'Bien'} — ${b.ville || ''}`,
    secteur: [b.quartier || b.adresse_probable, b.ville].filter(Boolean).join(', ') || b.ville || '',
    /* Pour la note de correspondance : la ville et le quartier du bien, et
       son temps à pied jusqu'à la station (voir trajetDe). */
    ville: b.ville || null, quartier: b.quartier || null,
    trajet: trajetDe(b.situation, recherche.transport_arrets || []),
    /* V3.145 : le prix de l'annonce ; `hono`, ce qui s'y ajoute quand ses
       honoraires ne sont pas partagés (0 en inter-cabinet). */
    prix: prixDuBien(b).demande, hono: prixDuBien(b).hono,
    surface: b.surface, pieces: b.nb_pieces, chambres: b.nb_chambres,
    etage: b.etage, etageTotal: b.etage_total, expo: b.exposition,
    dpe: b.dpe, ges: b.ges, annee: b.annee_construction,
    description: b.description, photos: b.photos || [],
    /* Le plan, rangé à part des photos : il a sa rubrique sur la fiche. */
    plans: Array.isArray(b.plans) ? b.plans.filter(Boolean) : [],
    terrasse: b.terrasse, balcon: b.balcon, jardin: b.jardin, parking: b.parking,
    ascenseur: b.ascenseur, cave: b.cave,
    /* La requête lit déjà toutes les colonnes : ces champs-là existaient en
       base et n'arrivaient simplement jamais jusqu'à l'écran du client. */
    sejour: b.surface_sejour, exterieur: b.surface_exterieur,
    surfaceTerrasse: b.surface_terrasse, surfaceBalcon: b.surface_balcon,
    nbParking: b.nb_parking, gardien: b.gardien, cuisineEquipee: b.cuisine_equipee,
    clim: b.climatisation, traversant: b.traversant,
    charges: b.charges_trimestrielles, taxe: b.taxe_fonciere,
    chargesComprises: b.charges_comprises || null,
    chargesAn: (b.bien_vente_id && chargesAnParVente.get(b.bien_vente_id)) || null,
    chauffage: b.chauffage, lots: b.nb_lots,
    pdfUrl: b.pdf_statut === 'pret' ? b.pdf_url : null,
    envoyeLe: b.envoye_le, vuLe: b.vu_le,
    avis: b.badge_retour, commentaire: b.retour_client, retourLe: b.retour_le,
    /* 'conseiller' quand Alexandre a saisi le retour à la place du client,
       après un appel. Le client ne doit pas lire « votre commentaire »
       sous une phrase qu'il n'a pas écrite. */
    retourPar: b.retour_par || 'client',
    visitePrevue: prevueParBien.get(b.id) || null,
    visiteFaite: faiteParBien.get(b.id) || null,
    etat: ETAT(b),
    vente: (b.bien_vente_id && venteParBien.get(b.bien_vente_id)) || null,
    offre: (b.bien_vente_id && offreParBien.get(b.bien_vente_id)) || null,
    /* V3.114 : un bien de l'agence. Le visiter ne demande jamais de mandat
       de recherche (visiteBloquee, /api/espace/retour). */
    agence: !!b.bien_vente_id,
  }));

  /* Les rendez-vous à venir, et eux seuls. Une visite passée n'est plus « votre
     prochaine visite » : son bien est rangé dans « Visités » (voir faiteParBien),
     et la section « Déjà visités » de l'onglet Visites le montre. */
  const visites = toutesVisites
    .filter((v) => v.statut === 'a_venir' && v.date_visite && !estPassee(v) && !copiesIndispo.has(v.bien_id))
    .map((v) => {
      const b = (biensRes.data || []).find((x) => x.id === v.bien_id);
      return {
        id: v.id,
        date: v.date_visite as string,
        heure: (v.heure as string) || null,
        titre: b?.titre || `${b?.type_bien || 'Bien'} — ${b?.ville || ''}`,
        adresse: [b?.adresse || b?.adresse_probable || b?.quartier, b?.ville].filter(Boolean).join(', '),
        /* La photo du bien : un rappel de visite sans image ne dit pas lequel. */
        photo: (b?.photos || [])[0] || null,
        bienId: v.bien_id as string | null,
      };
    });

  /* ─── « Vos visites » : chaque visite, où elle en est, et son issue ───
     Une visite passée (faite, ou calée à une heure déjà passée) attend
     l'avis du client tant que personne n'a posé d'issue. Le compte rendu
     d'Alexandre n'arrive qu'une fois la visite marquée « effectuée ». */
  const idsBiens = new Set((biensRes.data || []).map((b) => b.id));
  const vivantes = toutesVisites.filter((v) => v.bien_id && idsBiens.has(v.bien_id)
    && !(copiesIndispo.has(v.bien_id) && v.statut === 'a_venir' && !estPassee(v)));
  const mesVisites = vivantes.map((v) => {
    const issue = issueDe(v);
    return {
      id: v.id as string, bienId: v.bien_id as string,
      date: (v.date_visite as string) || null, heure: (v.heure as string) || null,
      passee: v.statut === 'effectuee' || estPassee(v),
      issue,
      issuePar: issue ? (v.issue_par === 'client' && v.avis_client_le ? 'client' as const : 'conseiller' as const) : null,
      motifs: Array.isArray(v.motifs) ? (v.motifs as string[]) : [],
      mot: (v.mot_client as string) || null,
      prix: (v.prix_envisage as number) || null,
      compteRendu: v.statut === 'effectuee' ? ((v.commentaire as string) || null) : null,
      etoiles: v.statut === 'effectuee' ? ((v.note_etoiles as number) || null) : null,
      issueLe: (v.avis_client_le as string) || (v.issue_le as string) || null,
      revisite: vivantes.some((x) => x.id !== v.id && x.bien_id === v.bien_id && String(x.date_visite || '') < String(v.date_visite || '')),
    };
  });
  /* Les trois raisons qui reviennent le plus dans ses visites non abouties,
     sans celles qu'Alexandre a retirées : la phrase de « Pas retenus ». */
  const apprisClient = apprisDe(toutesVisites, recherche.appris_masques || []).eviter.slice(0, 3).map((x) => x.t);

  const passages = passagesRes.data || [];
  const dernier = passages[0] || null;

  /* ─── « Jour après jour » : une barre par JOURNÉE, pas par dépôt ───
     Avant, chaque ligne de veille_passages faisait une barre : deux dépôts le
     même jour donnaient deux barres, étiquetées toutes deux « M », et le
     client lisait « 6 jours » là où il n'y en avait que deux. On range donc
     les passages par jour (heure de Paris), on additionne les annonces lues,
     et on montre toujours les sept derniers jours, aujourd'hui compris — un
     jour sans recherche reste visible, à zéro. */
  const jourParis = (d: Date) => new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  const parJour = new Map<string, number>();
  for (const p of passages) {
    if (!p.termine_le) continue;
    const k = jourParis(new Date(p.termine_le));
    parJour.set(k, (parJour.get(k) || 0) + (p.nb_lues || 0));
  }
  /* Les sept jours se comptent à partir d'aujourd'hui à Paris, par le
     calendrier (midi UTC comme point d'appui : aucun changement d'heure ne
     peut faire sauter ou doubler un jour). */
  const aujParis = jourParis(new Date());
  const semaine = Array.from({ length: 7 }, (_, i) => {
    const k = new Date(Date.parse(aujParis + 'T12:00:00Z') - (6 - i) * 86_400_000).toISOString().slice(0, 10);
    return { quand: k, lues: parJour.get(k) || 0 };
  });

  /* ─── « Recherche en cours », la pastille verte de l'accueil ───
     Elle s'éteint de deux façons, et il n'y en a pas de troisième :

       · Alexandre met la veille en pause depuis le CRM → `active` passe à
         false. C'est la vérité du dossier, elle prime sur tout.
       · Le client déclare lui-même que c'est terminé → une ligne
         « fin_recherche » au journal. Depuis le 27 septembre 2026, le dossier
         change aussi de rubrique et la veille s'arrête (`active` à false,
         voir /api/espace/[action]) ; la relance reste, Alexandre l'appelle
         pour confirmer. La ligne du journal suffit de toute façon à ne plus
         lui afficher « en cours » alors qu'il vient de dire le contraire.

     La déclaration du client tient jusqu'à ce qu'Alexandre reprenne la main
     sur la recherche — rouvrir le dossier, relancer la veille, modifier les
     critères : tous ces gestes touchent `updated_at`. La pastille se rallume
     alors d'elle-même, sans qu'il ait à y penser.

     On compare des dates, pas des chaînes : Postgres écrit « +00:00 » là où
     JavaScript écrit « Z », et deux écritures du même instant ne se classent
     pas dans le bon ordre caractère par caractère. */
  const quand = (v: unknown) => {
    const t = v ? Date.parse(String(v)) : NaN;
    return Number.isNaN(t) ? null : t;
  };
  const declareeLe = quand((finRes.data || [])[0]?.created_at);
  const reprisLe = quand(recherche.updated_at);
  const declaree = declareeLe !== null && (reprisLe === null || declareeLe > reprisLe);
  const enCours = recherche.active !== false && !declaree;

  /* ─── Le mandat de recherche ───
     'valide' : signé et pas expiré ; 'a_signer' : un numéro est prêt (sur la
     recherche, ou dans la réserve d'Alexandre) ; 'sans_numero' : rien. */
  const derniereSig = (signRes.data || [])[0] || null;
  let etatM = etatMandat({
    mandat_date_signature: recherche.mandat_date_signature, mandat_date_expiration: recherche.mandat_date_expiration,
    mandat_numero: recherche.mandat_numero,
  });
  if (etatM === 'sans_numero' && signeSansNumero(reserve, recherche.mandat_propose_le)) etatM = 'a_signer';
  const coord = coordRes.data || null;
  /* Qui il est, pour reconnaître SA ligne parmi les signataires d'un document
     (ses adresses ; celle de son conjoint est à part) : voir
     src/lib/documents-espace.ts. */
  const fiche = coord || { prenom: client?.prenom, nom: client?.nom };
  /* Un mandat de recherche préparé dans Documents, pas encore signé (V3.32) :
     on ne lui propose pas en plus celui de l'espace — ce serait un second
     mandat. Il signe celui-là, avec SON lien ; sa demande de visite attend —
     sauf s'il l'a déjà signé et qu'on attend quelqu'un d'autre (V3.55). */
  const enRoute = etatM !== 'valide' ? await mandatDocumentEnRoute(supabase, recherche.id as string, fiche) : null;
  if (enRoute) etatM = 'sans_numero';
  const prefill: Mandant = derniereSig && derniereSig.statut === 'en_cours' && derniereSig.mandant
    ? derniereSig.mandant as Mandant
    : {
      civilite: coord?.civilite === 'Madame' || coord?.civilite === 'Monsieur' ? coord.civilite : '',
      prenom: client?.prenom || '', nom: client?.nom || '',
      naissanceDate: '', naissanceLieu: '', adresse: coord?.adresse || '',
      email: (Array.isArray(coord?.emails) ? coord!.emails[0] : '') || '',
      telephone: (Array.isArray(coord?.telephones) ? coord!.telephones[0] : '') || '',
    };

  /* Signer à plusieurs : ceux qu'il a déjà indiqués (ligne en cours), ceux
     qu'on attend ou qui ont signé (ligne signée), ou — s'il n'a encore rien
     commencé — le conjoint de sa fiche « couple ». La table n'existe qu'une
     fois le SQL lancé : sans elle, la lecture échoue sans bruit. */
  type LigneCo = { id: string; statut: string; personne: Mandant; invite_le: string | null; signe_le: string | null; lien_expire_le: string | null };
  let cosSig: LigneCo[] = [];
  if (derniereSig?.id) {
    const { data: cosRes } = await supabase.from('mandats_cosignataires')
      .select('id, rang, statut, personne, invite_le, signe_le, lien_expire_le').eq('signature_id', derniereSig.id).order('rang');
    cosSig = (cosRes || []) as LigneCo[];
  }
  const enCoursSig = derniereSig?.statut === 'en_cours';
  const conjointFiche = coord?.couple && coord?.conjoint && typeof coord.conjoint === 'object' ? coord.conjoint as Partial<Mandant> : null;
  const prefillCos: Mandant[] = enCoursSig
    ? cosSig.filter(c => c.statut === 'prevu').map(c => c.personne)
    : conjointFiche && etatM !== 'valide'
      ? [{
        civilite: conjointFiche.civilite === 'Madame' || conjointFiche.civilite === 'Monsieur' ? conjointFiche.civilite : '',
        prenom: String(conjointFiche.prenom || ''), nom: String(conjointFiche.nom || ''),
        naissanceDate: String(conjointFiche.naissanceDate || ''), naissanceLieu: String(conjointFiche.naissanceLieu || ''),
        adresse: prefill.adresse, email: String(conjointFiche.email || ''), telephone: String(conjointFiche.telephone || ''),
      }]
      : [];
  const signeOuPartiel = derniereSig && (derniereSig.statut === 'signe' || derniereSig.statut === 'partiel') && derniereSig.signe_le;
  const membres = signeOuPartiel ? cosSig.filter(c => c.statut !== 'prevu') : [];

  /* ─── Le mandat de recherche de la rubrique Documents (V3.55) ───
     Ce que « Mon mandat de recherche » en dit, état par état : en
     préparation, prêt (à signer à la main, sur place, ou parti en ligne),
     signé. En route : celui de mandatDocumentEnRoute. Signé : le dernier
     signé pour cette recherche, quand c'est bien LUI le mandat en cours —
     même numéro que la recherche, ou plus récent que celui signé dans
     l'espace.
     Et ses documents pour l'accueil : ceux qui attendent SA signature (sa
     ligne, reconnue à ses adresses), ceux qu'il a signés et qui attendent
     quelqu'un d'autre, et tous ceux qui sont signés et dont l'exemplaire est
     déposé — en ligne, sur place ou à la main (lireDocumentsEspace). Avant
     le SQL, les lectures échouent sans bruit : rien ne s'affiche. */
  let docSigne: Awaited<ReturnType<typeof mandatDocumentSigne>> = null;
  let docRetracte: Awaited<ReturnType<typeof mandatDocumentRetracte>> = null;
  let documents: DocEspace[] = [];
  try {
    [docSigne, docRetracte, documents] = await Promise.all([
      /* V3.56 : celui qui porte le numéro de la recherche, s'il y en a plusieurs. */
      etatM === 'valide' ? mandatDocumentSigne(supabase, recherche.id as string, recherche.mandat_numero as string | null) : Promise.resolve(null),
      /* V3.56 : sans mandat en cours, celui auquel il a renoncé en ligne. */
      etatM !== 'valide' && !enRoute ? mandatDocumentRetracte(supabase, recherche.id as string) : Promise.resolve(null),
      lireDocumentsEspace(supabase, client.id as string, fiche),
    ]);
  } catch { /* une lecture des documents ratée ne doit jamais empêcher l'espace de s'afficher */ }
  let documentMandat: MandatDocEspace | null = null;
  if (enRoute) {
    documentMandat = {
      id: enRoute.id, statut: enRoute.statut, mode: enRoute.mode, lance: enRoute.lance, numero: enRoute.numero,
      vous: enRoute.vous, lien: enRoute.lien, signataires: enRoute.signataires, le: null, fichier: null,
    };
  } else if (docSigne) {
    const numeroRecherche = recherche.mandat_numero as string | null;
    const courant = numeroRecherche && docSigne.numero
      ? memeNumero(numeroRecherche, docSigne.numero)
      : !signeOuPartiel || Date.parse(docSigne.signe_le) >= Date.parse(derniereSig.signe_le as string);
    /* V3.56 : signé en ligne par lui, il peut y renoncer d'ici pendant son
       délai de rétractation, compté comme pour le mandat signé dans l'espace.
       Le sien seulement (rangé sur sa fiche), et seulement tant que le délai
       court. Une lecture ratée : pas de lien. */
    let renoncer: MandatDocEspace['renoncer'] = null;
    if (courant && docSigne.client_id === client.id) {
      try {
        const r = await renonciationDocument(supabase, docSigne, fiche);
        if (r && Date.now() < r.fin.getTime()) renoncer = { fin: r.fin.toISOString() };
      } catch { /* sans lien de renonciation : il peut toujours écrire à Alexandre */ }
    }
    if (courant) documentMandat = {
      id: docSigne.id, statut: 'signe', mode: modeDoc(docSigne.donnees, docSigne.signature), lance: !!docSigne.signature,
      numero: docSigne.numero, vous: null, lien: null, signataires: [], le: docSigne.signe_le,
      /* Le PDF se télécharge par /api/espace/document, qui ne sert que les
         documents de ce client : un mandat rangé sans client n'en a pas. */
      fichier: docSigne.client_id === client.id ? fichierDe(docSigne.signe_chemin) : null,
      renoncer,
    };
  } else if (docRetracte && docRetracte.client_id === client.id) {
    /* V3.56 : il a renoncé en ligne à son mandat de la rubrique Documents.
       « Mon mandat de recherche » le dit, avec l'exemplaire signé, tant que
       rien de plus récent n'est venu : un mandat commencé ou signé dans
       l'espace, une nouvelle proposition d'Alexandre. */
    const renonceLe = Date.parse(docRetracte.retracte_le);
    const apres = (v: unknown) => typeof v === 'string' && Date.parse(v) > renonceLe;
    if (!apres(derniereSig?.created_at) && !apres(recherche.mandat_propose_le)) documentMandat = {
      id: docRetracte.id, statut: 'retracte', mode: 'en_ligne', lance: true, numero: docRetracte.numero,
      vous: null, lien: null, signataires: [], le: docRetracte.signe_le,
      fichier: fichierDe(docRetracte.signe_chemin), renoncer: null, retracteLe: docRetracte.retracte_le,
    };
  }
  /* Son délai de rétractation : 14 jours après sa signature, prolongés si un
     co-signataire signe pendant qu'ils courent. */
  const signesCos = membres.filter(c => c.statut === 'signe' || c.statut === 'retracte').map(c => c.signe_le);
  const mandat = {
    etat: etatM,
    numero: (recherche.mandat_numero as string | null) || (derniereSig?.statut === 'en_cours' ? derniereSig.numero : null) || null,
    propose: !!recherche.mandat_propose_le && etatM === 'a_signer',
    signe: etatM === 'valide' && signeOuPartiel
      ? { le: derniereSig.signe_le as string, numero: derniereSig.numero as string,
          fin: finRetractationPour(derniereSig.signe_le, signesCos).toISOString(), execution: derniereSig.execution_immediate ?? null }
      : null,
    expiration: (recherche.mandat_date_expiration as string | null) || null,
    recherche: rechercheDepuis(recherche),
    mandant: prefill,
    /* Un code envoyé il y a moins d'un quart d'heure, pas encore utilisé : la
       page a pu être fermée pendant que le client le cherchait. */
    code: etatM === 'a_signer' && derniereSig?.statut === 'en_cours' && derniereSig.code_envoye_le
      && Date.now() - Date.parse(derniereSig.code_envoye_le as string) < 15 * 60_000
      && (derniereSig.mandant as Mandant | null)?.email
      ? { le: derniereSig.code_envoye_le as string, email: masquerEmail((derniereSig.mandant as Mandant).email) }
      : null,
    prefillCos,
    societe: enCoursSig ? (derniereSig?.societe as Societe | null) || null : null,
    cos: membres.map(c => ({
      id: c.id, prenom: c.personne?.prenom || '', nom: c.personne?.nom || '', email: c.personne?.email || '',
      statut: c.statut, invite: c.invite_le, signe: c.signe_le, expire: c.lien_expire_le,
    })),
    /* `lien` : SON lien, et lui seul bloque une demande de visite. */
    enRoute: enRoute ? { lien: enRoute.lien } : null,
    document: documentMandat,
  };

  const jours = client?.created_at
    ? Math.max(1, Math.round((Date.now() - new Date(client.created_at).getTime()) / 86400000))
    : null;

  /* ─── on note le passage, sans spammer le journal ───
     Ces trois requêtes intéressent Alexandre, pas le client : elles tournent
     après l'envoi de la page (after), et non plus avant. Le client gagne
     l'aller-retour ; le journal est écrit exactement pareil. */
  after(async () => {
    try {
      await ecritServeur('L’ouverture de l’espace', supabase.from('recherches')
        .update({ espace_ouvert_le: new Date().toISOString() })
        .eq('id', recherche.id));

      const { data: derniere } = await supabase.from('espace_evenements')
        .select('created_at').eq('recherche_id', recherche.id).eq('type', 'ouverture')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();

      const recent = derniere && Date.now() - new Date(derniere.created_at).getTime() < 30 * 60 * 1000;
      if (!recent) {
        await ecritServeur('L’événement « ouverture »', supabase.from('espace_evenements').insert({
          recherche_id: recherche.id, client_id: recherche.client_id,
          type: 'ouverture', detail: null,
        }));
      }
    } catch { /* le journal ne doit jamais empêcher la page de s'afficher */ }
  });

  return (
    <EspaceClient
      /* Ce que l'espace présente aux routes /api/espace/ : le jeton de la
         recherche affichée, pas celui du client. C'est lui qui dit « voilà
         de quelle recherche je parle » quand le client donne son avis. */
      token={jetonRecherche}
      client={{ prenom: client?.prenom || '', nom: client?.nom || '', reference: client?.reference || '', jours }}
      /* Le sélecteur. Une seule recherche → l'espace n'affiche rien. */
      recherches={recherches.map((r, i) => ({
        id: r.id,
        nom: nommerRecherche(r, i + 1),
        resume: resumerRecherche(r),
        nonLus: nonLus[r.id] || 0,
      }))}
      rechercheId={recherche.id}
      rang={rang}
      enCours={enCours}
      criteres={{
        budgetMin: recherche.budget_min, budgetMax: recherche.budget_max,
        surfaceMin: recherche.surface_min, surfaceMax: recherche.surface_max ?? null,
        surfaceSejourMin: recherche.surface_sejour_min ?? null,
        piecesMin: recherche.nb_pieces_min, piecesMax: recherche.nb_pieces_max ?? null,
        chambresMin: recherche.chambres_min, secteurs: recherche.secteurs || [],
        typeBien: recherche.type_bien,
        typesBien: recherche.type_bien
          ? String(recherche.type_bien).split(',').map((x: string) => x.trim()).filter(Boolean)
          : [],
        etatSouhaite: recherche.etat_souhaite ?? null,
        anneeMin: recherche.annee_construction_min ?? null,
        etageMin: recherche.etage_min ?? null, etageMax: recherche.etage_max ?? null,
        rdcExclu: !!recherche.rdc_exclu, dernierEtage: !!recherche.dernier_etage,
        etageMaxSansAscenseur: recherche.etage_max_sans_ascenseur ?? null,
        exposition: recherche.exposition_souhaitee || '',
        exigences: recherche.exigences || {},
        cuisineType: recherche.cuisine_type ?? null,
        exterieurSurfaceMin: recherche.exterieur_surface_min ?? null,
        dpeMax: recherche.dpe_max ?? null,
        apport: recherche.apport ?? null,
        financement: recherche.financement ?? null,
        urgence: recherche.urgence ?? null,
        transportMinutes: recherche.transport_minutes ?? null,
        transportLignes: recherche.transport_lignes || [],
        transportArrets: recherche.transport_arrets || [],
        equip: [
          recherche.terrasse && 'Terrasse', recherche.balcon && 'Balcon', recherche.jardin && 'Jardin',
          recherche.parking && 'Parking', recherche.ascenseur && 'Ascenseur', recherche.cave && 'Cave',
          recherche.gardien && 'Gardien',
        ].filter(Boolean) as string[],
        notes: recherche.notes || '',
      }}
      biens={biens}
      passage={dernier ? {
        quand: dernier.termine_le, lues: dernier.nb_lues, proposees: dernier.nb_proposees,
        ecartees: dernier.nb_ecartees, totalLues, totalRetenues, totalEcartees, nbPassages,
      } : null}
      semaine={semaine}
      visites={visites}
      mandat={{ ...mandat, documents }}
      mesVisites={mesVisites}
      apprisClient={apprisClient}
    />
  );
}
