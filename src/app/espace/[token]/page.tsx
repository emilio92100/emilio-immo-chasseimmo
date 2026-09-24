import { createClient } from '@supabase/supabase-js';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { after } from 'next/server';
import EspaceClient from '@/components/espace/EspaceClient';
import { ouvrirEspace, clientDuJeton, nommerRecherche, resumerRecherche } from '@/lib/espace';
import EspaceEnPreparation from './preparation';
import { jetonEspace, HOTE_ESPACE } from '@/lib/jeton';
import { etatMandat, finRetractation, rechercheDepuis, type Mandant } from '@/lib/mandat';
import { lireReserve } from '@/lib/mandat-serveur';

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
    await supabase.from('recherches').update({ token_espace: jetonRecherche }).eq('id', recherche.id);
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
    supabase.from('clients').select('emails, telephones, adresse').eq('id', client.id).maybeSingle(),
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
       une visite faite                      → « Visite effectuée » + son compte rendu */
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const toutesVisites = visitesRes.data || [];

  const prevueParBien = new Map<string, { date: string; heure: string | null }>();
  toutesVisites
    .filter((v) => v.statut === 'a_venir' && v.date_visite && String(v.date_visite).slice(0, 10) >= aujourdhui)
    .forEach((v) => {
      if (!v.bien_id || prevueParBien.has(v.bien_id)) return;   // la plus proche d'abord
      prevueParBien.set(v.bien_id, { date: v.date_visite, heure: v.heure || null });
    });

  const faiteParBien = new Map<string, { date: string | null; commentaire: string | null; etoiles: number | null }>();
  toutesVisites
    .filter((v) => v.statut === 'effectuee')
    .forEach((v) => {
      if (!v.bien_id) return;                                    // la dernière l'emporte
      faiteParBien.set(v.bien_id, {
        date: v.date_visite || null,
        commentaire: v.commentaire || null,
        etoiles: v.note_etoiles || null,
      });
    });

  const biens = (biensRes.data || []).map((b) => ({
    id: b.id,
    titre: b.titre || `${b.type_bien || 'Bien'} — ${b.ville || ''}`,
    secteur: [b.quartier || b.adresse_probable, b.ville].filter(Boolean).join(', ') || b.ville || '',
    /* Pour la note de correspondance : la ville et le quartier du bien, et
       son temps à pied jusqu'à la station (voir trajetDe). */
    ville: b.ville || null, quartier: b.quartier || null,
    trajet: trajetDe(b.situation, recherche.transport_arrets || []),
    prix: b.prix_acquereur || b.prix_vendeur,
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
  }));

  /* Une visite sans date ne sert à rien à l'écran, et une visite passée depuis
     plus d'un jour non plus : le compte rendu prend le relais côté CRM. */
  const hier = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const visites = toutesVisites
    .filter((v) => v.statut === 'a_venir' && v.date_visite && String(v.date_visite).slice(0, 10) >= hier)
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
         « fin_recherche » au journal. Rien ne se clôture pour autant (c'est
         volontaire, voir /api/espace/[action]) : on arrête simplement de lui
         afficher « en cours » alors qu'il vient de dire le contraire.

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
  if (etatM === 'sans_numero' && reserve.approuveLe && reserve.numeros.length) etatM = 'a_signer';
  const coord = coordRes.data || null;
  const prefill: Mandant = derniereSig && derniereSig.statut === 'en_cours' && derniereSig.mandant
    ? derniereSig.mandant as Mandant
    : {
      civilite: '', prenom: client?.prenom || '', nom: client?.nom || '',
      naissanceDate: '', naissanceLieu: '', adresse: coord?.adresse || '',
      email: (Array.isArray(coord?.emails) ? coord!.emails[0] : '') || '',
      telephone: (Array.isArray(coord?.telephones) ? coord!.telephones[0] : '') || '',
    };
  const mandat = {
    etat: etatM,
    numero: (recherche.mandat_numero as string | null) || (derniereSig?.statut === 'en_cours' ? derniereSig.numero : null) || null,
    propose: !!recherche.mandat_propose_le && etatM === 'a_signer',
    signe: etatM === 'valide' && derniereSig?.statut === 'signe' && derniereSig.signe_le
      ? { le: derniereSig.signe_le as string, numero: derniereSig.numero as string,
          fin: finRetractation(derniereSig.signe_le).toISOString(), execution: derniereSig.execution_immediate ?? null }
      : null,
    expiration: (recherche.mandat_date_expiration as string | null) || null,
    recherche: rechercheDepuis(recherche),
    mandant: prefill,
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
      await supabase.from('recherches')
        .update({ espace_ouvert_le: new Date().toISOString() })
        .eq('id', recherche.id);

      const { data: derniere } = await supabase.from('espace_evenements')
        .select('created_at').eq('recherche_id', recherche.id).eq('type', 'ouverture')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();

      const recent = derniere && Date.now() - new Date(derniere.created_at).getTime() < 30 * 60 * 1000;
      if (!recent) {
        await supabase.from('espace_evenements').insert({
          recherche_id: recherche.id, client_id: recherche.client_id,
          type: 'ouverture', detail: null,
        });
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
      mandat={mandat}
    />
  );
}
