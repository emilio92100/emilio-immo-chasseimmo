'use client';

/* ═══ Plusieurs biens cochés : les envoyer, changer leur étape (V3.89) ═════
   Alexandre : « sur la liste des biens, envoyer, sélection, changer de
   statut… un petit bouton de trois points ». La barre de la sélection
   (PageBiens) a trois gestes : « Envoyer à des acheteurs », « Changer
   d'étape », « ⋯ » (archiver, supprimer). Ce fichier porte les deux
   premiers.

   · FenEnvoiLot : les acheteurs à qui ces biens correspondent (la même note
     que l'onglet « Acheteurs » d'un bien et que leur espace), regroupés par
     acheteur : « Correspond à 2 biens sur 3 ». On coche, puis :
       – « Mettre en sélection » : les biens entrent dans leur dossier, rien
         ne part (mettreEnSelection) ;
       – « Dans leur espace » : ils y arrivent tout de suite ; une seule
         relance et une seule notification par acheteur (suiteEnvoi) ;
       – « Par mail… » : un mail par acheteur, à son prénom, avec ses biens,
         relu avant de partir (envoyerParMail, le chemin du mail de sa fiche).
     Chacun reçoit les biens qui lui correspondent (70 % et plus, ou dès
     50 % si on coche « en partie ») et qu'il n'a pas déjà reçus.
     V3.111 (Alexandre : « on ne peut pas choisir un client… il n'y a rien
     qui explique ») : en haut, « Cherche un client par son nom » — n'importe
     quel client qui a une recherche ouverte, même si la note ne le propose
     pas. Lui reçoit TOUS les biens cochés (sauf le sien), sans seuil : c'est
     Alexandre qui choisit. Les biens à suivre ou en estimation partent aussi
     (« même quand c'est en estimation »), avec une ligne qui le rappelle ;
     seuls ceux en pause, vendus ou retirés restent de côté.
   · Changer d'étape : les mêmes passages que le menu d'étape de la fiche,
     ceux qui ne demandent qu'une raison (FenRaison) — À suivre, Estimation,
     En pause, Retiré. Un bien qui demande une décision (une offre en cours,
     des visites prévues, un rendez-vous d'estimation, une estimation déjà
     faite) est laissé de côté, avec sa raison : c'est sur sa fiche qu'on la
     prend. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ic } from '@/components/documents/ApercuActe';
import { supabase } from '@/lib/supabase';
import { euros } from '@/lib/mandat';
import { CLES_MAIL, conseillerDe, dejaSigne, signatureDe, texteModele } from '@/lib/mail-variables';
import { visitePasseeParis } from '@/lib/visites';
import { avantMandat, etapeDe, lirePhotos, titreBien, villeAffichee, type BienVente, type EtapeVente } from '@/lib/biens-vente';
import { signalerEchec } from '@/lib/ecritures';
import { REMISE_SUIVIE, attendreRemises, remisesDe, suivreRemises } from '@/lib/remise-client';
import { CaseLigne } from '@/components/shared/Selection';
import AvatarContact from '@/components/contacts/AvatarContact';
import { Illu, modeAcheteurs, teinte } from './AcheteursBien';
import { AvecScore, AvisDetail, IconeAvis, MOT_IA, Progression, analyserIA, compareIA, type AvisIA, type AvisParBien } from './RapprochementIA';
import { RAISONS_ETAPE, avantRdv } from './FenetresBien';
import {
  SEUIL_CORRESPOND, SEUIL_LISTE, acheteurChoisi, acheteursTries, changerEtape, estPasPourLui, rechercheOuverte, recherchesRappro, cloreRelancesEstimation, envoyerDansEspace, envoyerParMail, estimationMiseDeCote,
  instantPasse, mettreEnSelection, nomClient, solderDemandesDuBien, suiteEnvoi, type Acheteur, type ClientMini, type Copie, type ListeBiens, type RechercheMini,
} from './outils';
import l from './LotBiens.module.css';

const aujourdhui = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/* « Paris 16e · 4 p. » : un bien en quelques mots, pour une pastille. */
export function bienCourt(b: BienVente): string {
  const d = b.donnees || {};
  const ville = villeAffichee(b.ville, b.code_postal) || String(d.ville || '');
  const p = b.nb_pieces || Number(d.pieces) || 0;
  return [ville || b.titre || titreBien(d), p ? `${p} p.` : ''].filter(Boolean).join(' · ') || b.reference || 'Bien';
}

const presente = (c: Copie | null) => !!c && c.etape !== 'selection';
const mailDe = (a: Acheteur) => (a.client.emails || []).find(x => !!x && x.includes('@')) || '';

type Item = { bien: BienVente; acheteur: Acheteur };
/* `manuel` : un client choisi par son nom (V3.111), pas proposé par la note. */
type Ligne = { cle: string; acheteur: Acheteur; items: Item[]; manuel?: boolean };
type Quoi = 'selection' | 'espace' | 'mail';

/* Ce que cet acheteur recevrait. Sélection : ce qui n'est pas encore dans
   son dossier ; espace et mail : ce qu'il n'a pas encore reçu. Un client
   choisi à la main reçoit tout, sans seuil. Proposé par le rapprochement
   (V3.125) : les biens qu'il ne dit pas « non » (sans avis : 70 % et plus) ;
   que des « non » : tout, c'est Alexandre qui l'a coché. */
type AvisDe = (bienId: string, rechId: string) => AvisIA | null;
const pasNon = (x: Ligne, i: Item, avisDe: AvisDe) => { const a = avisDe(i.bien.id, x.cle); return a ? a.v !== 'non' : i.acheteur.corr.note >= SEUIL_CORRESPOND; };
function aEnvoyer(x: Ligne, quoi: Quoi, avisDe: AvisDe): Item[] {
  const libre = (i: Item) => (quoi === 'selection' ? !i.acheteur.copie : !presente(i.acheteur.copie));
  if (x.manuel) return x.items.filter(libre);
  const retenus = x.items.filter(i => pasNon(x, i, avisDe));
  return (retenus.length ? retenus : x.items).filter(libre);
}
/* Le meilleur avis d'une ligne, pour la ranger : Oui, À voir (ou pas relu), Non. */
function meilleurAvis(x: Ligne, avisDe: AvisDe): AvisIA | null {
  return x.items.map(i => avisDe(i.bien.id, x.cle)).filter((a): a is AvisIA => !!a).sort(compareIA)[0] || null;
}
const pause = (ms: number) => new Promise(ok => setTimeout(ok, ms));

/* La recherche d'un client par son nom : sans accents ni majuscules. */
const plat = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const STATUT_COURT: Record<string, string> = { prospect: 'Prospect', suspendu: 'En pause', bien_trouve: 'Bien trouvé', perdu: 'Perdu', offre_ecrite: 'Offre écrite' };
/* « Recherche principale · jusqu'à 650 000 € » : de quoi reconnaître une recherche. */
function recherchePhrase(r: RechercheMini, plusieurs: boolean): string {
  const nom = String(r.nom || '').trim();
  return [plusieurs || nom ? nom || 'Une recherche' : '', r.type_bien ? String(r.type_bien) : '', r.budget_max ? `jusqu’à ${euros(r.budget_max)}` : 'sans budget'].filter(Boolean).join(' · ');
}

/* Un pourcentage, ou rien quand la note ne se calcule pas (client choisi à la main). */
const pct = (n: number) => (n >= 0 ? `${n} %` : '');

/* Le texte du mail : le modèle « Sélection de biens » des Paramètres s'il est
   rempli, sinon un texte qui convient à un bien comme à plusieurs. Les
   variables ({{prénom}}…) restent : /api/send-mail les remplace pour chacun. */
function mailParDefaut(p: Record<string, string>): { objet: string; corps: string } {
  const sig = signatureDe(p);
  /* V3.151 : ses « \n » écrits en toutes lettres redeviennent des retours à
     la ligne, et la signature n'est pas ajoutée une seconde fois. */
  const modele = texteModele(p.template_email_corps || '').trim();
  const objet = texteModele(p.template_email_objet || '').trim() || 'Sélection de biens — Vos recherches immobilières';
  if (modele) return { objet, corps: dejaSigne(modele, sig, conseillerDe(p)) ? modele : `${modele.trimEnd()}\n\n${sig}` };
  return {
    objet,
    corps: `Bonjour {{prénom}},

Suite à votre projet de recherche, je vous présente ci-dessous ce qui pourrait répondre à vos critères.

Vous trouverez le détail de chaque bien, avec un bouton pour consulter sa fiche complète.

N'hésitez pas à me solliciter pour organiser une visite, à m'appeler si vous avez la moindre question, ou à me faire un retour afin d'affiner votre recherche.

${sig}`,
  };
}

/* ══ ENVOYER À DES ACHETEURS ═════════════════════════════════════════════
   V3.121 (Alexandre : « ça sélectionne déjà les personnes dont la recherche
   est similaire : si on a 20 personnes, il y en aura 20 de présélectionnées.
   Il faudrait plutôt ne rien mettre… soit l'envoyer à un client, taper le
   nom, soit l'envoyer par un mail simple… ou un petit bouton
   rapprochement ») : la fenêtre s'ouvre vide, rien de coché.
     · « Un client ou une adresse e-mail » : un client du CRM (l'envoi se
       note dans son Suivi), ou une adresse inconnue du CRM — quelqu'un
       rencontré dans la rue — qui reçoit un simple mail : la photo, les
       infos et un bouton vers la page du bien sur le site (route
       biens-vente, action « presenter »). Un client sans recherche ouverte
       peut aussi le recevoir ainsi.
     · « Lancer le rapprochement » : la note de correspondance passe sur les
       recherches ouvertes (un court temps de calcul, à l'écran), puis les
       acheteurs qui correspondent s'affichent — toujours sans rien cocher.
   V3.125 (Alexandre : « le même procédé depuis la fonction envoyer à des
   acheteurs ») : le bouton fait le premier tri PUIS la relecture de chaque
   dossier (RapprochementIA.tsx), les étapes à l'écran ; les acheteurs
   arrivent ensuite, rangés par avis — Oui, À voir, puis Non replié — avec
   leur note de potentiel, leurs plus et leurs moins. Plus de case « en
   partie » : tout ce qui passe le premier tri (50 % et plus) est relu. Un
   acheteur coché reçoit les biens que le rapprochement ne dit pas « non » ;
   s'il ne dit que des « non », c'est Alexandre qui tranche : tout part. */
const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/* V3.139 : un numéro, quelle que soit son écriture (« 06 62 86… »,
   « +33 6 62… », « 0033 6… ») : ses chiffres, en commençant par le 0. */
const chiffresTel = (t: string) => {
  const d = t.replace(/\D/g, '');
  if (d.startsWith('0033')) return '0' + d.slice(4);
  if (/^\s*\+33/.test(t) || (d.startsWith('33') && d.length === 11)) return '0' + d.slice(2);
  return d;
};
/* Une saisie faite seulement de chiffres (et d'espaces, points, tirets, « + ») : un téléphone. */
const SAISIE_TEL = /^[\d\s.+()-]+$/;
/* Quelqu'un qui reçoit le bien par simple mail : hors du CRM, ou un contact sans recherche ouverte. */
type Libre = { email: string; prenom?: string; nom?: string; clientId?: string };

/* Le texte pour quelqu'un hors du CRM (pas de « votre projet de recherche »). */
function mailLibre(p: Record<string, string>, plusieurs: boolean): { objet: string; corps: string } {
  return {
    objet: plusieurs ? 'Des biens qui pourraient vous intéresser' : 'Un bien qui pourrait vous intéresser',
    corps: `Bonjour {{prénom}},

Suite à notre échange, je vous transmets ${plusieurs ? 'ces biens qui pourraient' : 'ce bien qui pourrait'} vous intéresser. Vous trouverez ci-dessous ${plusieurs ? 'leurs photos et leurs' : 'sa photo et ses'} principales informations.

Je reste à votre disposition pour organiser une visite ou répondre à vos questions.

${signatureDe(p)}`,
  };
}

/* ══ V3.148 — la fenêtre revue (Alexandre : « quand je sélectionne quelqu'un,
   je ne peux pas le désélectionner… que ça rajoute une ligne, qu'on puisse
   en ajouter, et un bouton croix… un aperçu de ce qui va être vraiment
   envoyé au client… dès qu'on appuie envoyer, un spinner avec une belle
   animation, et fiche envoyée à… avec les noms »).
     · Ceux qui reçoivent sont en lignes sous la recherche, chacun avec sa
       croix : un client choisi par son nom, une adresse par simple mail, un
       acheteur coché dans le rapprochement. Un nom déjà pris se retire aussi
       d'un clic dans les résultats. (Un prospect choisi n'apparaissait nulle
       part : sa recherche était cherchée dans `liste.recherches`, qui n'a pas
       les recherches en attente ; il restait « Ajouté », grisé.)
     · « Envoyer par mail » mène au mail tel que le client le recevra (le même
       HTML que l'envoi, rendu par le serveur sans rien envoyer), à côté du
       texte qu'on peut toujours modifier : l'aperçu suit la frappe. Sur
       téléphone, deux onglets.
     · Pendant l'envoi : l'avion dans son anneau, chaque nom avec son état ;
       puis la coche et « Fiche envoyée à » avec les noms. */
type Dest = { cle: string; genre: 'crm'; ligne: Ligne; source: 'manuel' | 'rappro' } | { cle: string; genre: 'libre'; libre: Libre };
type Apercu = { html: string; objet: string; a: string[] };
type EtatEnvoi = 'attente' | 'en' | 'ok' | 'ko';
type Envoi = { quoi: Quoi; gens: { cle: string; nom: string; crm: boolean; etat: EtatEnvoi; erreur?: string; attente?: boolean }[]; fini: boolean; biens: number };
const nomLibre = (x: Libre) => [x.prenom, x.nom].filter(Boolean).join(' ') || x.email;
const nomDest = (d: Dest) => (d.genre === 'libre' ? nomLibre(d.libre) : nomClient(d.ligne.acheteur.client));
/* Assez longtemps à l'écran pour que l'animation se voie, même quand tout part en un éclair. */
const ENVOI_MIN_MS = 1100;

/* Le mail dans un cadre inerte (ni script ni lien qui s'ouvre), à sa hauteur
   réelle : on le fait défiler avec la fenêtre. Comme le rappel de visite. */
function CadreMail({ html }: { html: string }) {
  const [haut, setHaut] = useState(520);
  /* Les liens retirés : « Consulter le bien » ouvrirait son espace avec son
     lien à lui, et le CRM noterait qu'il l'a ouvert. */
  const inerte = useMemo(() => html.replace(/\shref="[^"]*"/g, ''), [html]);
  return (
    <iframe title="Le mail reçu par le client" srcDoc={inerte} sandbox="allow-same-origin" className={l.cadreMail} style={{ height: haut }}
      onLoad={e => {
        try {
          const d = (e.currentTarget as HTMLIFrameElement).contentDocument;
          if (d?.body) setHaut(Math.max(320, d.body.scrollHeight + 2));
        } catch { /* sans accès, la hauteur par défaut */ }
      }} />
  );
}

/* La coche qui se dessine, dans son rond vert, et quelques éclats autour. */
function Bravo() {
  return (
    <span className={l.bravo}>
      {Array.from({ length: 12 }, (_, i) => (
        <i key={i} className={l.eclat} style={{ ['--a' as string]: `${i * 30}deg`, ['--d' as string]: `${(i % 3) * 0.05}s` } as React.CSSProperties} />
      ))}
      <span className={l.bravoRond}>
        <svg viewBox="0 0 52 52" width="40" height="40" aria-hidden="true"><path className={l.bravoTrait} d="M14 27.5l8.2 8.2L38.5 19" /></svg>
      </span>
    </span>
  );
}

export function FenEnvoiLot({ biens, liste, nomBien, onFermer, onFait, onFiche }: {
  biens: BienVente[]; liste: ListeBiens; nomBien: (b: BienVente) => string;
  onFermer: () => void;
  /* Quelque chose est parti : la liste se relit (les copies ont changé). */
  onFait: () => void;
  onFiche: (clientId: string) => void;
}) {
  /* En vente, mais aussi à suivre ou en estimation (V3.111) ; en pause, vendu,
     retiré : de côté. */
  const envoyables = useMemo(() => biens.filter(b => ['vente', 'avant'].includes(modeAcheteurs(b.etape))), [biens]);
  const avantMandat = envoyables.filter(b => modeAcheteurs(b.etape) === 'avant');
  const ecartes = biens.filter(b => !envoyables.includes(b)).map(b => ({
    nom: nomBien(b), pourquoi: modeAcheteurs(b.etape) === 'pause' ? 'Vente en pause : l’envoi reprend avec elle.' : 'Il n’est plus en vente.',
  }));
  /* Les clients choisis par leur nom (des recherches), le dernier en tête. */
  const [manuels, setManuels] = useState<string[]>([]);
  const [libres, setLibres] = useState<Libre[]>([]);
  const [q, setQ] = useState('');
  /* Le rapprochement : pas lancé, le premier tri, la relecture, affiché (V3.125). */
  const [rappro, setRappro] = useState<'ferme' | 'tri' | 'relecture' | 'ouvert'>('ferme');
  /* Les avis de cette relecture (RapprochementIA.tsx) : rien avant le clic. */
  const [ia, setIa] = useState<AvisParBien>({});
  const [iaEtat, setIaEtat] = useState<{ fait: number; total: number; erreur: string; info: string; manquent: number }>({ fait: 0, total: 0, erreur: '', info: '', manquent: 0 });
  const avisDe: AvisDe = (bienId, rechId) => ia[bienId]?.[rechId] || null;

  /* Un acheteur (une recherche) par ligne, et les biens qui lui correspondent
     à 50 % et plus (V3.125 : les recherches à compléter aussi, comme dans
     l'onglet Rapprochement d'un bien). */
  const lignes = useMemo(() => {
    /* V3.126 : sans les acheteurs écartés de ce bien (« Pas pour lui »). */
    const pasPour = new Set(liste.suivi.filter(estPasPourLui).map(x => `${x.bien_id}:${x.recherche_id}`));
    const m = new Map<string, Ligne>();
    for (const b of envoyables) {
      const copies = liste.copies.filter(c => c.bien_vente_id === b.id);
      for (const a of acheteursTries(b, recherchesRappro(liste), liste.clients, copies).retenus) {
        if (a.corr.note < SEUIL_LISTE || manuels.includes(a.recherche.id) || pasPour.has(`${b.id}:${a.recherche.id}`)) continue;
        const x = m.get(a.recherche.id) || { cle: a.recherche.id, acheteur: a, items: [] };
        x.items.push({ bien: b, acheteur: a });
        m.set(a.recherche.id, x);
      }
    }
    const meilleure = (x: Ligne) => Math.max(...x.items.map(i => i.acheteur.corr.note));
    return [...m.values()].sort((p, q2) => meilleure(q2) - meilleure(p));
  }, [envoyables, liste, manuels]);

  /* Le bouton : le premier tri (instantané, laissé à l'écran un instant),
     puis la relecture des couples — les meilleures notes d'abord, 48 au plus. */
  async function lancerRappro() {
    if (rappro === 'tri' || rappro === 'relecture') return;
    const paires = lignes.flatMap(x => x.items.map(i => ({ b: i.bien.id, r: x.cle, n: i.acheteur.corr.note })))
      .sort((p, q) => q.n - p.n).slice(0, 48).map(({ b, r }) => ({ b, r }));
    setIaEtat({ fait: 0, total: paires.length, erreur: '', info: '', manquent: 0 });
    setRappro('tri');
    await pause(900);
    if (paires.length) {
      setRappro('relecture');
      const r = await analyserIA(paires, (avis, fait) => { setIa(avis); setIaEtat(e => ({ ...e, fait })); });
      setIaEtat(e => ({ ...e, erreur: r.erreur, info: r.info, manquent: r.manquent }));
      await pause(350);
    }
    setRappro('ouvert');
  }

  /* Ceux qu'Alexandre a choisis : tous les biens, sauf le sien s'il en est le
     propriétaire. V3.148 : parmi TOUTES les recherches que la recherche par
     nom propose, prospects compris (recherchesRappro). */
  const choisisMain = useMemo(() => manuels.map(id => {
    const r = recherchesRappro(liste).find(x => x.id === id);
    const c = r ? liste.clients[r.client_id] : undefined;
    if (!r || !c || !envoyables.length) return null;
    const items = envoyables.filter(b => b.client_id !== c.id).map(b => ({ bien: b, acheteur: acheteurChoisi(b, r, c, liste.copies.filter(y => y.bien_vente_id === b.id)) }));
    return { cle: id, acheteur: items[0]?.acheteur || acheteurChoisi(envoyables[0], r, c, []), items, manuel: true } as Ligne;
  }).filter((x): x is Ligne => !!x), [manuels, liste, envoyables]);

  /* Les clients qui ont une recherche ouverte, pour la recherche par nom. */
  const parClient = useMemo(() => {
    const m = new Map<string, RechercheMini[]>();
    for (const r of recherchesRappro(liste)) {
      if (!rechercheOuverte(r, liste.clients[r.client_id])) continue;
      m.set(r.client_id, [...(m.get(r.client_id) || []), r]);
    }
    return m;
  }, [liste]);
  const nbRecherches = useMemo(() => [...parClient.values()].reduce((t, l) => t + l.length, 0), [parClient]);
  const trouves = useMemo(() => {
    const mots = plat(q.trim()).split(/\s+/).filter(Boolean);
    if (!mots.length) return null;
    /* V3.139 : un numéro de téléphone (trois chiffres au moins). */
    const tel = SAISIE_TEL.test(q.trim()) ? chiffresTel(q.trim()) : '';
    if (tel && tel.length < 3) return null;
    const avec: { r: RechercheMini; c: ClientMini; n: number }[] = [];
    const sans: ClientMini[] = [];
    for (const c of Object.values(liste.clients)) {
      if (tel) {
        if (!(c.telephones || []).some(t => chiffresTel(String(t || '')).includes(tel))) continue;
      } else {
        const foin = plat(`${c.prenom || ''} ${c.nom || ''} ${(c.emails || []).join(' ')}`);
        if (!mots.every(x => foin.includes(x))) continue;
      }
      const rs = parClient.get(c.id) || [];
      if (rs.length) rs.forEach(r => avec.push({ r, c, n: rs.length }));
      else sans.push(c);
    }
    const nom = (c: ClientMini) => plat(nomClient(c));
    avec.sort((a, b) => nom(a.c).localeCompare(nom(b.c), 'fr'));
    sans.sort((a, b) => nom(a).localeCompare(nom(b), 'fr'));
    /* Une adresse e-mail que le CRM ne connaît pas : quelqu'un hors du CRM. */
    const adresse = ADRESSE.test(q.trim()) ? q.trim().toLowerCase() : '';
    const connue = !!adresse && Object.values(liste.clients).some(c => (c.emails || []).some(e => String(e).trim().toLowerCase() === adresse));
    return { avec: avec.slice(0, 6), deplus: Math.max(0, avec.length - 6), sans: sans.slice(0, 3), adresse: connue ? '' : adresse, arobase: q.includes('@'), tel: !!tel };
  }, [q, liste.clients, parClient]);

  /* Rien de coché à l'ouverture (V3.121). */
  const [choisis, setChoisis] = useState<Set<string>>(() => new Set());
  const [etape, setEtape] = useState<'qui' | 'mail'>('qui');
  const [mail, setMail] = useState<{ objet: string; corps: string } | null>(null);
  const [envoi, setEnvoi] = useState<Envoi | null>(null);
  /* Sur téléphone : le mail du client, ou son texte (V3.148). */
  const [vue, setVue] = useState<'apercu' | 'texte'>('apercu');
  const [apercuPour, setApercuPour] = useState('');
  const [apercu, setApercu] = useState<Apercu | { erreur: string } | null>(null);
  const [apercuEn, setApercuEn] = useState(false);
  /* Les lignes qui s'en vont (un instant, le temps de leur sortie). */
  const [sortants, setSortants] = useState<Set<string>>(() => new Set());

  /* Rangés par avis (V3.125) : Oui, À voir (et les pas relus), Non ; dans
     chaque groupe, la meilleure note de potentiel d'abord. */
  const auto = rappro === 'ouvert'
    ? lignes.map((x, k) => ({ x, k, a: meilleurAvis(x, avisDe) })).sort((p, q) => compareIA(p.a, q.a) || p.k - q.k)
    : [];
  const groupeDe = (a: AvisIA | null): AvisIA['v'] => (a ? a.v : 'a_voir');
  const [voirNon, setVoirNon] = useState(false);
  /* Un client choisi par son nom l'est tant qu'il est dans la liste ; un
     acheteur du rapprochement, tant qu'il est coché. */
  const coches = [...choisisMain, ...auto.map(y => y.x).filter(x => choisis.has(x.cle))];
  const pour = (quoi: Quoi) => coches.filter(x => aEnvoyer(x, quoi, avisDe).length);
  const total = (quoi: Quoi) => pour(quoi).reduce((t, x) => t + aEnvoyer(x, quoi, avisDe).length, 0);
  const basculer = (k: string) => setChoisis(c => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const envoyable = (x: Ligne) => aEnvoyer(x, 'selection', avisDe).length > 0 || aEnvoyer(x, 'mail', avisDe).length > 0;
  const ouiPossibles = auto.filter(y => groupeDe(y.a) === 'oui' && envoyable(y.x)).map(y => y.x.cle);
  const tousOui = ouiPossibles.length > 0 && ouiPossibles.every(k => choisis.has(k));
  const occupe = !!envoi && !envoi.fini;

  /* Tous ceux qui recevront : choisis par leur nom, par simple mail, cochés dans le rapprochement. */
  const dests: Dest[] = [
    ...choisisMain.map(x => ({ cle: x.cle, genre: 'crm' as const, ligne: x, source: 'manuel' as const })),
    ...libres.map(x => ({ cle: `@${x.email}`, genre: 'libre' as const, libre: x })),
    ...auto.filter(y => choisis.has(y.x.cle) && envoyable(y.x)).map(y => ({ cle: y.x.cle, genre: 'crm' as const, ligne: y.x, source: 'rappro' as const })),
  ];
  /* Ceux qui recevront le mail : une adresse, et au moins un bien à recevoir. */
  const mailables = dests.filter(d => d.genre === 'libre' || (aEnvoyer(d.ligne, 'mail', avisDe).length > 0 && !!mailDe(d.ligne.acheteur)));
  const sansMail = pour('mail').filter(x => !mailDe(x.acheteur));
  const nbMails = mailables.length;
  const cible = mailables.find(d => d.cle === apercuPour) || mailables[0] || null;

  function prendre(id: string) {
    setManuels(m => [id, ...m.filter(x => x !== id)]);
    setQ('');
  }
  function lacher(id: string) {
    setManuels(m => m.filter(x => x !== id));
  }
  function prendreLibre(x: Libre) {
    setLibres(l => [x, ...l.filter(y => y.email !== x.email)]);
    setQ('');
  }
  const lacherLibre = (email: string) => setLibres(m => m.filter(y => y.email !== email));
  /* La croix : la ligne glisse dehors, puis s'en va pour de bon. */
  function retirer(d: Dest) {
    setSortants(s => new Set(s).add(d.cle));
    window.setTimeout(() => {
      if (d.genre === 'libre') lacherLibre(d.libre.email);
      else if (d.source === 'manuel') lacher(d.cle);
      else setChoisis(c => { const n = new Set(c); n.delete(d.cle); return n; });
      setSortants(s => { const n = new Set(s); n.delete(d.cle); return n; });
    }, 190);
  }

  /* Le texte du mail : les réglages des Paramètres, lus une fois. Personne
     du CRM parmi les destinataires : le texte pour quelqu'un hors du CRM. */
  const seulementLibres = !pour('mail').length && libres.length > 0;
  useEffect(() => {
    if (etape !== 'mail' || mail) return;
    let vivant = true;
    supabase.from('parametres').select('cle, valeur').in('cle', CLES_MAIL).then(({ data }) => {
      if (!vivant) return;
      const p = Object.fromEntries(((data || []) as { cle: string; valeur: string | null }[]).map(r => [r.cle, r.valeur || '']));
      setMail(seulementLibres ? mailLibre(p, envoyables.length > 1) : mailParDefaut(p));
    });
    return () => { vivant = false; };
  }, [etape, mail, seulementLibres, envoyables.length]);

  /* L'aperçu : le mail de cette personne, construit par le serveur comme à
     l'envoi (/api/send-mail pour un client du CRM, « presenter » pour un
     simple mail), sans rien envoyer. */
  async function lireApercu(d: Dest, m: { objet: string; corps: string }): Promise<Apercu | { erreur: string }> {
    const objet = m.objet.trim() || 'Sans objet';
    try {
      if (d.genre === 'libre') {
        const res = await fetch('/api/biens-vente', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'presenter', apercu: true, ids: envoyables.map(b => b.id), destinataires: [d.libre], objet, corps: m.corps }),
        });
        const r = await res.json().catch(() => ({})) as { ok?: boolean; erreur?: string; html?: string; objet?: string; a?: string[] };
        if (!res.ok || !r.ok || typeof r.html !== 'string') return { erreur: r.erreur || `erreur ${res.status}` };
        return { html: r.html, objet: r.objet || objet, a: r.a || [d.libre.email] };
      }
      const a = d.ligne.acheteur;
      const res = await fetch('/api/send-mail', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: [a.client.id], recherche_id: a.recherche.id, mode: 'biens', apercu: true, ventes_ids: aEnvoyer(d.ligne, 'mail', avisDe).map(i => i.bien.id), objet, corps: m.corps }),
      });
      const r = await res.json().catch(() => ({})) as { apercu?: boolean; error?: string; html?: string; objet?: string; destinataires?: string[] };
      if (!res.ok || !r.apercu || typeof r.html !== 'string') return { erreur: r.error || `erreur ${res.status}` };
      return { html: r.html, objet: r.objet || objet, a: Array.isArray(r.destinataires) ? r.destinataires : [] };
    } catch (e) {
      return { erreur: (e as Error).message };
    }
  }
  /* L'aperçu suit la frappe (un court temps après la dernière lettre) ; une
     autre personne choisie, tout de suite. Seule la dernière demande s'affiche. */
  const demande = useRef(0);
  const derniereCible = useRef('');
  const cleCible = cible ? `${cible.cle}|${cible.genre === 'crm' ? aEnvoyer(cible.ligne, 'mail', avisDe).map(i => i.bien.id).join(',') : ''}` : '';
  useEffect(() => {
    if (etape !== 'mail' || !mail || !cible || envoi) return;
    const n = ++demande.current;
    const autre = derniereCible.current !== cleCible;
    derniereCible.current = cleCible;
    setApercuEn(true);
    const t = window.setTimeout(async () => {
      const r = await lireApercu(cible, mail);
      if (n !== demande.current) return;
      setApercu(r);
      setApercuEn(false);
    }, autre ? 0 : 650);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etape, mail?.objet, mail?.corps, cleCible, !!envoi]);

  async function lancer(quoi: Quoi) {
    const cibles = quoi === 'mail' ? pour('mail').filter(x => mailDe(x.acheteur)) : pour(quoi);
    const dehors = quoi === 'mail' ? libres : [];
    if (!cibles.length && !dehors.length) return;
    const debut = Date.now();
    let e: Envoi = {
      quoi, fini: false, biens: 0,
      gens: [
        ...cibles.map(x => ({ cle: x.cle, nom: nomClient(x.acheteur.client), crm: true, etat: 'attente' as EtatEnvoi })),
        ...dehors.map(x => ({ cle: `@${x.email}`, nom: nomLibre(x), crm: false, etat: 'attente' as EtatEnvoi })),
      ],
    };
    setEnvoi(e);
    const maj = (cle: string, etat: EtatEnvoi, erreur?: string, attente?: boolean) => {
      e = { ...e, gens: e.gens.map(g => (g.cle === cle ? { ...g, etat, erreur, attente } : g)) };
      setEnvoi(e);
    };
    let biensPartis = 0;
    for (const x of cibles) {
      const items = aEnvoyer(x, quoi, avisDe);
      const nom = nomClient(x.acheteur.client);
      maj(x.cle, 'en');
      try {
        if (quoi === 'selection') {
          let n = 0;
          for (const i of items) {
            const r = await mettreEnSelection(i.bien, [i.acheteur]);
            if (r.erreurs.length) throw new Error(r.erreurs[0].replace(`${nom} : `, ''));
            n += r.n;
          }
          biensPartis += n;
        } else if (quoi === 'espace') {
          let n = 0;
          for (const i of items) {
            const r = await envoyerDansEspace(i.bien, [i.acheteur], { suite: false });
            if (r.erreurs.length) throw new Error(r.erreurs[0].replace(`${nom} : `, ''));
            n += r.n;
          }
          if (n) await suiteEnvoi(x.acheteur.client.id, x.acheteur.recherche.id, n);
          biensPartis += n;
        } else {
          /* V3.151 : envoyé, puis arrivé dans sa boîte (ou refusé : une erreur). */
          const r = await envoyerParMail(items, mail || { objet: '', corps: '' });
          biensPartis += r.n;
          maj(x.cle, 'ok', undefined, r.enAttente);
          continue;
        }
        maj(x.cle, 'ok');
      } catch (err) {
        maj(x.cle, 'ko', (err as Error).message);
      }
    }
    /* Les personnes hors du CRM (et les contacts sans recherche) : un simple
       mail, la photo et le lien du site (route biens-vente, « presenter »). */
    if (dehors.length) {
      for (const x of dehors) maj(`@${x.email}`, 'en');
      try {
        const res = await fetch('/api/biens-vente', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...REMISE_SUIVIE },
          body: JSON.stringify({ action: 'presenter', ids: envoyables.map(b => b.id), destinataires: dehors, objet: mail?.objet || '', corps: mail?.corps || '' }),
        });
        const r = await res.json().catch(() => ({})) as { ok?: boolean; erreur?: string; envoyes?: string[]; avertissements?: string[] };
        if (!res.ok || !r.ok) throw new Error(r.erreur || `erreur ${res.status}`);
        const partis = new Set(r.envoyes || []);
        for (const x of dehors) if (!partis.has(x.email)) maj(`@${x.email}`, 'ko', 'le mail n’est pas parti');
        if (r.avertissements?.length) signalerEchec('Le mail est parti, mais son suivi', r.avertissements.join(' ; '));
        /* V3.151 : arrivé dans sa boîte, ou refusé par sa messagerie ? */
        const remises = remisesDe(r);
        const etats = remises.length ? await attendreRemises(remises, 20_000) : new Map();
        const attente = remises.filter(m => (etats.get(m.id)?.etat || 'attente') === 'attente');
        if (attente.length) suivreRemises(attente, true);
        for (const x of dehors) {
          if (!partis.has(x.email)) continue;
          const siennes = remises.filter(m => m.email === x.email);
          const refus = siennes.find(m => etats.get(m.id)?.etat === 'refuse');
          if (refus) maj(`@${x.email}`, 'ko', `mail non distribué, ${etats.get(refus.id)?.raison || 'refusé'}`);
          else maj(`@${x.email}`, 'ok', undefined, siennes.some(m => attente.includes(m)));
        }
      } catch (err) {
        for (const x of dehors) maj(`@${x.email}`, 'ko', (err as Error).message);
      }
    }
    const reste = ENVOI_MIN_MS - (Date.now() - debut);
    if (reste > 0) await pause(reste);
    e = { ...e, fini: true, biens: biensPartis };
    setEnvoi(e);
    if (e.gens.some(g => g.etat === 'ok')) onFait();
  }

  /* « Envoyer à quelqu'un d'autre » : la fenêtre repart de zéro (le
     rapprochement déjà fait reste). */
  function recommencer() {
    setEnvoi(null); setEtape('qui'); setManuels([]); setLibres([]); setChoisis(new Set()); setMail(null); setApercu(null); setApercuPour(''); setVue('apercu');
  }

  const titre = envoyables.length > 1 || (!envoyables.length && biens.length > 1) ? `Envoyer ${envoyables.length || biens.length} biens` : 'Envoyer ce bien';
  const photo = envoyables.length === 1 ? (envoyables[0].photo || lirePhotos((envoyables[0].donnees || {}).photos)[0]?.url || '') : '';
  const plusieursBiens = envoyables.length > 1;

  /* Une ligne du rapprochement : sa case, son avis, ses biens. */
  const ligneDe = (x: Ligne, rang: number) => {
    const partent = new Set([...aEnvoyer(x, 'mail', avisDe), ...aEnvoyer(x, 'selection', avisDe)].map(i => i.bien.id));
    const n = aEnvoyer(x, 'mail', avisDe).length;
    const nSel = aEnvoyer(x, 'selection', avisDe).length;
    const rien = !n && !nSel;
    const on = choisis.has(x.cle) && !rien;
    const a = x.acheteur;
    const statut = STATUT_COURT[String(a.client.statut || '')];
    const meilleur = meilleurAvis(x, avisDe);
    /* Un seul bien : l'avis en grand, avec ses plus et ses moins. */
    const seul = x.items.length === 1;
    const avisSeul = seul ? avisDe(x.items[0].bien.id, x.cle) : null;
    return (
      <div key={x.cle} className={`${l.ligne} ${l.ligneRappro}`} data-on={on ? 'oui' : 'non'} data-rien={rien ? 'oui' : undefined} style={{ animationDelay: `${Math.min(rang, 8) * 0.035}s` }}>
        {rien ? <span className={l.caseVide} title="Il a déjà tous ces biens" /> : <CaseLigne on={on} onBasculer={() => basculer(x.cle)} titre={on ? `Décocher ${nomClient(a.client)}` : `Cocher ${nomClient(a.client)}`} />}
        <AvecScore s={meilleur && typeof meilleur.s === 'number' ? meilleur.s : Math.max(...x.items.map(i => i.acheteur.corr.note))} v={meilleur?.v || null} legende={meilleur && typeof meilleur.s === 'number' ? 'potentiel' : 'critères'}>
          <AvatarContact c={a.client} teinte={{ bg: teinte(a.client.id).f, fg: teinte(a.client.id).t }} libre />
        </AvecScore>
        <div className={l.qui}>
          <div className={l.quiL1}>
            <button type="button" className={l.nom} onClick={() => onFiche(a.client.id)}>{nomClient(a.client)}</button>
            {statut && <span className={l.tag}>{statut}</span>}
            {a.recherche.budget_max ? <span className={l.budget}>{`jusqu’à ${euros(a.recherche.budget_max)}`}</span> : null}
          </div>
          {seul ? (
            <>
              {plusieursBiens && <span className={l.itemSeul}>{bienCourt(x.items[0].bien)}</span>}
              {avisSeul ? <AvisDetail avis={avisSeul} sansMot /> : <span className={l.pasRelu}>{'Pas relu : relance le rapprochement pour le relire.'}</span>}
            </>
          ) : (
            <div className={l.items}>
              {x.items.map(i => {
                const av = avisDe(i.bien.id, x.cle);
                const deja = presente(i.acheteur.copie);
                return (
                  <div key={i.bien.id} className={l.item} data-part={partent.has(i.bien.id) || rien ? 'oui' : 'non'}>
                    <span className={l.itemT}>
                      {av && typeof av.s === 'number' ? <b className={l.score} data-v={av.v}>{av.s}</b> : null}
                      <span>{bienCourt(i.bien)}</span>
                      {deja ? <i>{'· déjà reçu'}</i> : i.acheteur.copie ? <i>{'· en sélection'}</i> : !partent.has(i.bien.id) && !rien ? <i>{'· ne part pas'}</i> : null}
                    </span>
                    {av ? <AvisDetail avis={av} compact /> : <span className={l.pasRelu}>{'Pas relu.'}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <span className={l.combien}>{rien ? 'Déjà reçu' : n ? (n > 1 ? `${n} biens` : '1 bien') : 'En sélection'}</span>
      </div>
    );
  };

  /* V3.148 — Une personne qui recevra : sa ligne, et sa croix. */
  const ligneDest = (d: Dest, rang: number) => {
    const croix = (
      <button type="button" className={l.dX} onClick={() => retirer(d)} aria-label={`Retirer ${nomDest(d)}`} title="Le retirer">
        <Ic n="croix" t={13} e={2.5} />
      </button>
    );
    const commun = { className: l.dLigne, 'data-sort': sortants.has(d.cle) ? 'oui' : undefined, style: { animationDelay: `${Math.min(rang, 6) * 0.03}s` } };
    if (d.genre === 'libre') {
      const x = d.libre;
      return (
        <div key={d.cle} {...commun}>
          <span className={l.dMail}><Ic n="mail" t={16} /></span>
          <div className={l.dTx}>
            <span className={l.dL1}>
              {x.clientId
                ? <button type="button" className={l.nom} onClick={() => onFiche(x.clientId!)}>{nomLibre(x)}</button>
                : <b className={l.nomLibre}>{x.email}</b>}
              <span className={l.tag}>{x.clientId ? 'Sans recherche' : 'Hors du CRM'}</span>
            </span>
            <small>{x.clientId ? `${x.email} · par simple mail, noté dans son Suivi` : 'Par simple mail, avec la photo et le lien du bien'}</small>
          </div>
          <span className={l.dCombien}>{plusieursBiens ? `${envoyables.length} biens` : '1 bien'}</span>
          {croix}
        </div>
      );
    }
    const x = d.ligne;
    const a = x.acheteur;
    const n = aEnvoyer(x, 'mail', avisDe).length;
    const nSel = aEnvoyer(x, 'selection', avisDe).length;
    const rien = !n && !nSel;
    const statut = STATUT_COURT[String(a.client.statut || '')];
    const plusieurs = (parClient.get(a.client.id) || []).length > 1;
    const note = x.items.length === 1 ? x.items[0].acheteur.corr.note : -1;
    const sous = !x.items.length ? 'C’est le propriétaire : rien à lui envoyer.'
      : [d.source === 'rappro' ? 'Rapprochement' : '', recherchePhrase(a.recherche, plusieurs), note >= 0 ? `${note} % de sa recherche` : ''].filter(Boolean).join(' · ');
    const tt = teinte(a.client.id);
    return (
      <div key={d.cle} {...commun} data-rien={rien ? 'oui' : undefined}>
        <AvatarContact c={a.client} teinte={{ bg: tt.f, fg: tt.t }} className={l.dAv} libre />
        <div className={l.dTx}>
          <span className={l.dL1}>
            <button type="button" className={l.nom} onClick={() => onFiche(a.client.id)}>{nomClient(a.client)}</button>
            {statut && <span className={l.tag}>{statut}</span>}
          </span>
          <small>{sous}</small>
          {plusieursBiens && x.items.length > 0 && (
            <span className={l.pastilles}>
              {x.items.map(i => {
                const nt = i.acheteur.corr.note;
                const deja = presente(i.acheteur.copie);
                return (
                  <span key={i.bien.id} className={l.pastille} data-ton={deja ? 'deja' : nt >= SEUIL_CORRESPOND ? 'bon' : nt >= SEUIL_LISTE ? 'partiel' : 'libre'}
                    title={deja ? 'Il l’a déjà reçu' : i.acheteur.copie ? 'Déjà dans sa sélection, pas encore envoyé' : nt >= 0 ? `Correspond à ${nt} % de sa recherche` : 'Pas de note : sa recherche ne se compare pas à ce bien'}>
                    {pct(nt) ? <b>{pct(nt)}</b> : null}{bienCourt(i.bien)}{deja ? ' · déjà reçu' : i.acheteur.copie ? ' · en sélection' : ''}
                  </span>
                );
              })}
            </span>
          )}
        </div>
        <span className={l.dCombien} data-rien={rien ? 'oui' : undefined}>{rien ? (x.items.length ? 'Déjà reçu' : 'Son bien') : n ? (n > 1 ? `${n} biens` : '1 bien') : 'En sélection'}</span>
        {croix}
      </div>
    );
  };

  /* L'envoi, puis sa réussite (V3.148). */
  const vueEnvoi = (e: Envoi) => {
    const ok = e.gens.filter(g => g.etat === 'ok');
    const ko = e.gens.filter(g => g.etat === 'ko');
    const faits = ok.length + ko.length;
    /* Une fiche par bien : le pluriel suit le nombre de biens, pas de personnes. */
    const pl = plusieursBiens;
    const reussi = e.fini && ok.length > 0;
    const titreFin = !e.fini ? '' : !ok.length ? 'Rien n’est parti'
      : e.quoi === 'mail' ? (pl ? 'Fiches envoyées à' : 'Fiche envoyée à')
        : e.quoi === 'espace' ? (pl ? 'Biens envoyés dans l’espace de' : 'Bien envoyé dans l’espace de')
          : (pl ? 'Biens mis en sélection pour' : 'Bien mis en sélection pour');
    const titreEn = e.quoi === 'mail' ? (e.gens.length > 1 ? 'Envoi des mails…' : 'Envoi du mail…') : e.quoi === 'espace' ? 'Envoi dans leur espace…' : 'Mise en sélection…';
    const montres = e.fini ? ok : e.gens;
    return (
      <div className={l.envoi} role="status" aria-live="polite" data-fini={e.fini ? 'oui' : undefined}>
        <div className={l.envoiRond}>
          {!e.fini ? (
            <>
              <span className={l.anneau} />
              <span className={l.avion}><Ic n="envoyer" t={30} e={1.8} /></span>
            </>
          ) : reussi ? <Bravo /> : <span className={l.rateRond}><Ic n="croix" t={30} e={2.6} /></span>}
        </div>
        <h3 className={l.envoiT}>{e.fini ? titreFin : titreEn}</h3>
        {!e.fini && <p className={l.envoiSous}>{`${Math.min(faits + 1, e.gens.length)} sur ${e.gens.length}${e.quoi === 'mail' ? ' · chaque mail est vérifié jusqu’à sa boîte de réception' : ''}`}</p>}
        {montres.length > 0 && (
          <ul className={l.gens}>
            {montres.map((g, i) => (
              <li key={g.cle} className={l.gen} data-etat={g.etat} style={{ animationDelay: `${e.fini ? 0.35 + i * 0.07 : i * 0.05}s` }}>
                <span className={l.genPuce}>{g.etat === 'ok' ? <Ic n="check" t={11} e={3.4} /> : g.etat === 'ko' ? <Ic n="croix" t={10} e={3.2} /> : null}</span>
                <b>{g.nom}</b>
              </li>
            ))}
          </ul>
        )}
        {e.fini && reussi && (
          <p className={l.envoiSous}>
            {e.quoi === 'selection' ? 'Rien n’est parti : ils ne le voient pas encore.'
              : [
                e.quoi === 'mail' ? (ok.some(g => g.attente)
                  ? `Parti. ${ok.filter(g => g.attente).map(g => g.nom).join(', ')} : sa messagerie n’a pas encore répondu, un refus s’afficherait en bas de l’écran.`
                  : (ok.length > 1 ? 'Bien arrivé dans la boîte mail de chacun.' : 'Bien arrivé dans sa boîte mail.')) : '',
                e.quoi === 'espace' || ok.some(g => g.crm) ? 'Une relance « sans réponse » est posée pour chacun, et ils sont prévenus sur leur téléphone s’ils l’ont accepté.' : 'Noté dans l’historique du bien.',
              ].filter(Boolean).join(' ')}
          </p>
        )}
        {e.fini && ko.length > 0 && (
          <div className={l.envoiKo}>
            <b>{ok.length ? (ko.length > 1 ? `${ko.length} n’ont pas reçu` : '1 n’a pas reçu') : 'Ce qui a bloqué'}</b>
            <ul>{ko.map(g => <li key={g.cle}><span>{g.nom}</span><small>{g.erreur || 'erreur inconnue'}</small></li>)}</ul>
          </div>
        )}
      </div>
    );
  };

  const apercuOk = apercu && !('erreur' in apercu) ? apercu : null;
  const fen = (
    <div className={l.voile} onMouseDown={e => { if (e.target === e.currentTarget && !occupe && etape === 'qui') onFermer(); }}>
      <div className={l.fen} role="dialog" aria-modal="true" aria-label={titre} data-large={etape === 'mail' && !envoi ? 'oui' : undefined}>
        <div className={l.tete}>
          {photo && etape === 'qui' && !envoi
            // eslint-disable-next-line @next/next/no-img-element
            ? <span className={l.tetePhoto}><img src={photo} alt="" /></span>
            : <span className={l.teteIc}><Ic n={etape === 'mail' ? 'mail' : 'envoyer'} t={20} /></span>}
          <div className={l.teteTx}>
            <h2>{etape === 'mail' && !envoi ? (nbMails > 1 ? `${nbMails} mails, un par personne` : 'Le mail du client') : titre}</h2>
            <p>{envoyables.map(bienCourt).join(' · ') || 'Aucun bien à envoyer dans la sélection.'}</p>
          </div>
          <button type="button" className={l.fermer} aria-label="Fermer" disabled={occupe} onClick={onFermer}><Ic n="croix" t={15} e={2.3} /></button>
        </div>

        <div className={l.corps}>
          {envoi ? vueEnvoi(envoi) : etape === 'mail' ? (
            <div className={l.mailZone} data-vue={vue}>
              <div className={l.onglets} role="tablist" aria-label="Vue">
                <button type="button" role="tab" aria-selected={vue === 'apercu'} onClick={() => setVue('apercu')}><Ic n="oeil" t={15} />{'Le mail du client'}</button>
                <button type="button" role="tab" aria-selected={vue === 'texte'} onClick={() => setVue('texte')}><Ic n="crayon" t={14} />{'Modifier le texte'}</button>
              </div>

              <section className={l.paneTexte}>
                <div className={l.paneT}><b>{'Le message'}</b><span>{nbMails > 1 ? 'Le même pour tous, chacun à son prénom.' : 'Modifie-le : l’aperçu suit.'}</span></div>
                <label className={l.champ}><span>Objet</span>
                  <input className={l.in} value={mail?.objet || ''} disabled={!mail} onChange={e => setMail(m => (m ? { ...m, objet: e.target.value } : m))} />
                </label>
                <label className={l.champ}><span>Le message</span>
                  <textarea className={`${l.in} ${l.inMsg}`} rows={13} value={mail?.corps || ''} disabled={!mail} placeholder={mail ? '' : 'Chargement du modèle…'} onChange={e => setMail(m => (m ? { ...m, corps: e.target.value } : m))} />
                </label>
                <p className={l.aide}><Ic n="info" t={14} /><span>{`{{prénom}} devient le prénom de chacun${libres.length ? ' (rien pour une adresse hors du CRM : « Bonjour, »)' : ''}. ${plusieursBiens ? 'Les biens s’ajoutent' : 'Le bien s’ajoute'} sous le texte, avec ${plusieursBiens ? 'leurs photos' : 'sa photo'} et un bouton vers ${plusieursBiens ? 'leur fiche' : 'sa fiche'}.`}</span></p>
                {sansMail.length > 0 && (
                  <div className={l.ignores}>
                    <b>{sansMail.length > 1 ? `${sansMail.length} sans adresse e-mail` : '1 sans adresse e-mail'}</b>
                    <span>{`${sansMail.map(x => nomClient(x.acheteur.client)).join(', ')} : pas d’adresse sur ${sansMail.length > 1 ? 'leur' : 'sa'} fiche. « Dans leur espace » envoie les biens sans mail.`}</span>
                  </div>
                )}
                <button type="button" className={`${l.btn} ${l.voirMail}`} onClick={() => setVue('apercu')}><Ic n="oeil" t={15} />{'Voir le mail du client'}</button>
              </section>

              <section className={l.paneApercu}>
                <div className={l.paneT}>
                  <b>{nbMails > 1 ? 'Aperçu pour' : `Ce que reçoit ${cible ? nomDest(cible) : 'le client'}`}</b>
                  {nbMails > 1 && <span>{'Chacun reçoit son mail, à son prénom, avec ses biens.'}</span>}
                </div>
                {nbMails > 1 && (
                  <div className={l.pourQui}>
                    {mailables.map(d => (
                      <button key={d.cle} type="button" className={l.pourPill} data-on={d.cle === cible?.cle ? 'oui' : undefined} onClick={() => setApercuPour(d.cle)}>{nomDest(d)}</button>
                    ))}
                  </div>
                )}
                <div className={l.enveloppe} data-maj={apercuEn && apercu ? 'oui' : undefined}>
                  <div className={l.envTete}>
                    <span className={l.envAv}>AR</span>
                    <div className={l.envTx}>
                      <b>{'Alexandre Rogelet · Emilio Immobilier'}</b>
                      <small>{`À : ${apercuOk ? apercuOk.a.join(', ') || '—' : cible ? (cible.genre === 'libre' ? cible.libre.email : mailDe(cible.ligne.acheteur)) : '—'}`}</small>
                    </div>
                    {apercuEn && apercu ? <span className={l.envMaj}><i />{'Mise à jour'}</span> : <span className={l.envQuand}>{'maintenant'}</span>}
                  </div>
                  <div className={l.envObjet}>{apercuOk ? apercuOk.objet : mail?.objet || ' '}</div>
                  {!cible ? (
                    <div className={l.apercuErr}><Ic n="info" t={15} /><span>{'Personne à qui l’envoyer par mail : aucune adresse e-mail, ou rien de nouveau à recevoir.'}</span></div>
                  ) : !apercu ? (
                    <div className={l.squelette} aria-label="Préparation de l’aperçu"><i className={l.sqBande} /><i /><i /><i className={l.sqCourt} /><i className={l.sqPhoto} /><i /><i className={l.sqCourt} /></div>
                  ) : 'erreur' in apercu ? (
                    <div className={l.apercuErr}><Ic n="info" t={15} /><span>{`L’aperçu n’a pas pu être préparé : ${apercu.erreur}`}</span></div>
                  ) : <CadreMail html={apercu.html} />}
                </div>
                <p className={l.aide}><Ic n="check" t={14} e={2.6} /><span>{`Exactement ce que reçoit ${cible ? nomDest(cible) : 'le client'}. Rien n’est parti : le mail part avec « ${nbMails > 1 ? `Envoyer les ${nbMails} mails` : 'Envoyer le mail'} ».`}</span></p>
              </section>
            </div>
          ) : (
            <>
              {ecartes.length > 0 && (
                <div className={l.ignores}>
                  <b>{ecartes.length > 1 ? `${ecartes.length} biens laissés de côté` : '1 bien laissé de côté'}</b>
                  <ul>{ecartes.map((x, i) => <li key={i}><span>{x.nom}</span><small>{x.pourquoi}</small></li>)}</ul>
                </div>
              )}
              {!envoyables.length ? (
                <div className={l.vide}>
                  <span className={l.videIc}><Ic n="groupe" t={24} /></span>
                  <b>{'Aucun de ces biens n’est à envoyer.'}</b>
                  <span>{'Un bien en pause, vendu ou retiré ne part plus chez les acheteurs.'}</span>
                </div>
              ) : (
                <>
                  {avantMandat.length > 0 && (
                    <p className={l.aide}><Ic n="info" t={14} /><span>{`${avantMandat.map(bienCourt).join(', ')} : pas encore sous mandat. ${avantMandat.length > 1 ? 'Ils partent' : 'Il part'} quand même, comme les autres, sans prix : il arrivera chez l’acheteur à la signature du mandat.`}</span></p>
                  )}

                  {/* À qui : un client par son nom, ou une adresse e-mail (V3.121). */}
                  <div className={l.choix}>
                    <label className={l.choixT} htmlFor="lot-client">
                      <b>{'À qui l’envoyer ?'}</b>
                      <span>{'Un client du CRM, par son nom ou son téléphone : l’envoi se note dans son Suivi. Ou l’adresse e-mail de quelqu’un hors du CRM : il reçoit un simple mail, avec la photo et le lien du bien.'}</span>
                    </label>
                    <div className={l.cherche}>
                      <Ic n="loupe" t={16} />
                      <input id="lot-client" className={l.chercheIn} value={q} placeholder="Un nom, un téléphone ou une adresse e-mail" autoComplete="off" spellCheck={false} inputMode="email"
                        onChange={e => setQ(e.target.value)} onKeyDown={e => {
                          if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); }
                          if (e.key === 'Enter' && trouves?.adresse && !trouves.avec.length && !trouves.sans.length && !libres.some(x => x.email === trouves.adresse)) { e.preventDefault(); prendreLibre({ email: trouves.adresse }); }
                        }} />
                      {q && <button type="button" className={l.chercheX} aria-label="Effacer" onClick={() => setQ('')}><Ic n="croix" t={12} e={2.4} /></button>}
                    </div>
                    {trouves && (
                      <div className={l.res}>
                        {trouves.avec.map(({ r, c, n }) => {
                          const pris = manuels.includes(r.id);
                          const proprio = envoyables.every(b => b.client_id === c.id);
                          const statut = STATUT_COURT[String(c.statut || '')];
                          const tt = teinte(c.id);
                          return (
                            <button key={r.id} type="button" className={l.resL} data-pris={pris ? 'oui' : undefined} disabled={proprio} onClick={() => (pris ? lacher(r.id) : prendre(r.id))}
                              title={pris ? 'Déjà dans la liste : un clic le retire' : undefined}>
                              <AvatarContact c={c} teinte={{ bg: tt.f, fg: tt.t }} className={l.resAv} libre />
                              <span className={l.resTx}>
                                <b>{nomClient(c)}{statut ? <i className={l.tag}>{statut}</i> : null}</b>
                                <small>{proprio ? 'C’est le propriétaire de ce bien.' : recherchePhrase(r, n > 1)}</small>
                              </span>
                              {proprio ? null : pris ? (
                                <span className={l.resAct}><span className={l.resPris}><Ic n="check" t={13} e={2.8} />{'Ajouté'}</span><span className={l.resOter}><Ic n="croix" t={12} e={2.6} />{'Retirer'}</span></span>
                              ) : <span className={l.resAct}><Ic n="plus" t={14} e={2.4} />{'Ajouter'}</span>}
                            </button>
                          );
                        })}
                        {trouves.deplus > 0 && <span className={l.resPlus}>{`Et ${trouves.deplus} de plus : précise ${trouves.tel ? 'le numéro' : 'le nom'}.`}</span>}
                        {trouves.sans.map(c => {
                          const adr = ((c.emails || []).find(e => ADRESSE.test(String(e).trim())) || '').trim().toLowerCase();
                          const pris = !!adr && libres.some(x => x.email === adr);
                          return (
                            <div key={c.id} className={l.resSans}>
                              <span className={l.resTx}>
                                <b>{nomClient(c)}</b>
                                <small>{adr ? 'Pas de recherche ouverte : par simple mail, noté dans son Suivi.' : 'Pas de recherche ouverte, et pas d’adresse e-mail sur sa fiche.'}</small>
                              </span>
                              {adr && (
                                <button type="button" className={l.resFiche} data-pris={pris ? 'oui' : undefined} onClick={() => (pris ? lacherLibre(adr) : prendreLibre({ email: adr, prenom: c.prenom || '', nom: c.nom || '', clientId: c.id }))}>
                                  {pris ? <><Ic n="croix" t={11} e={2.6} />{'Retirer'}</> : 'Par simple mail'}
                                </button>
                              )}
                              <button type="button" className={l.resFiche} onClick={() => onFiche(c.id)}>Sa fiche</button>
                            </div>
                          );
                        })}
                        {trouves.adresse && (() => {
                          const pris = libres.some(x => x.email === trouves.adresse);
                          return (
                            <button type="button" className={`${l.resL} ${l.resLibre}`} data-pris={pris ? 'oui' : undefined} onClick={() => (pris ? lacherLibre(trouves.adresse) : prendreLibre({ email: trouves.adresse }))}>
                              <span className={l.resMail}><Ic n="mail" t={16} /></span>
                              <span className={l.resTx}>
                                <b>{trouves.adresse}</b>
                                <small>{'Hors du CRM : un simple mail, avec la photo et le lien du bien.'}</small>
                              </span>
                              {pris
                                ? <span className={l.resAct}><span className={l.resPris}><Ic n="check" t={13} e={2.8} />{'Ajouté'}</span><span className={l.resOter}><Ic n="croix" t={12} e={2.6} />{'Retirer'}</span></span>
                                : <span className={l.resAct}><Ic n="plus" t={14} e={2.4} />{'Ajouter'}</span>}
                            </button>
                          );
                        })()}
                        {!trouves.avec.length && !trouves.sans.length && !trouves.adresse && (
                          <span className={l.resPlus}>{trouves.arobase ? 'Tape l’adresse e-mail en entier.' : trouves.tel ? 'Personne avec ce numéro. Pour quelqu’un hors du CRM, tape son adresse e-mail.' : 'Personne à ce nom. Pour quelqu’un hors du CRM, tape son adresse e-mail.'}</span>
                        )}
                      </div>
                    )}

                    {/* V3.148 : chacun sur sa ligne, avec sa croix. */}
                    {dests.length > 0 && (
                      <div className={l.dests}>
                        <div className={l.destsT}>
                          <b>{dests.length > 1 ? `${dests.length} destinataires` : '1 destinataire'}</b>
                          <span>{'Cherche un autre nom pour en ajouter.'}</span>
                        </div>
                        <div className={l.destsL}>{dests.map((d, i) => ligneDest(d, i))}</div>
                      </div>
                    )}
                  </div>

                  {/* Le rapprochement, seulement si on le demande (V3.121) ;
                      le premier tri puis la relecture (V3.125). */}
                  {rappro === 'tri' || rappro === 'relecture' ? (
                    <Progression etapes={[
                      { t: 'Le premier tri', etat: rappro === 'tri' ? 'en' : 'fait',
                        d: rappro === 'tri' ? `Budget, secteur, type, surface : je compare ${plusieursBiens ? 'ces biens' : 'ce bien'} à tes ${nbRecherches} recherche${nbRecherches > 1 ? 's' : ''} ouverte${nbRecherches > 1 ? 's' : ''}.` : `${lignes.length} acheteur${lignes.length > 1 ? 's passent' : ' passe'} le premier tri, sur ${nbRecherches} recherche${nbRecherches > 1 ? 's' : ''} ouverte${nbRecherches > 1 ? 's' : ''}.` },
                      { t: 'La relecture de chaque dossier', etat: rappro === 'tri' ? 'attente' : 'en', fait: iaEtat.fait, total: iaEtat.total,
                        d: rappro === 'tri' ? 'Indispensables, parcours, comptes rendus de visite, face à la fiche du bien.' : `${Math.min(iaEtat.fait, iaEtat.total)} sur ${iaEtat.total} relu${iaEtat.total > 1 ? 's' : ''}…` },
                      { t: 'Le classement', etat: 'attente', d: 'Oui, à voir, non : les meilleures chances d’abord.' },
                    ]} />
                  ) : rappro === 'ferme' ? (
                    <div className={l.rappro}>
                      <Illu />
                      <span className={l.rapproTx}>
                        <b>{'Qui, dans ta base, pourrait être intéressé ?'}</b>
                        <small>{`Le rapprochement passe en revue tes ${nbRecherches} recherche${nbRecherches > 1 ? 's' : ''} ouverte${nbRecherches > 1 ? 's' : ''}, puis relit en détail celles qui peuvent aller. Pour chacun : un avis, une note de potentiel, ses plus et ses moins. Rien n’est coché : tu choisis ensuite.`}</small>
                      </span>
                      <button type="button" className={`${l.btn} ${l.btnOr} ${l.rapproBtn}`} disabled={!nbRecherches} onClick={() => { void lancerRappro(); }}>
                        <Ic n="cible" t={15} />{'Lancer le rapprochement'}
                      </button>
                    </div>
                  ) : lignes.length === 0 ? (
                    <div className={l.vide}>
                      <span className={l.videIc}><Ic n="groupe" t={24} /></span>
                      <b>{`Personne ne passe le premier tri pour ${plusieursBiens ? 'ces biens' : 'ce bien'}.`}</b>
                      <span>{'Aucune recherche ouverte ne va avec : trop cher pour eux, autre secteur, autre type… Pour l’envoyer à quelqu’un d’autre, cherche-le juste au-dessus.'}</span>
                    </div>
                  ) : (
                    <>
                      <div className={l.sousT}>
                        <b>{'Le rapprochement'}</b>
                        <span>{(() => {
                          const c = (v: AvisIA['v']) => auto.filter(y => groupeDe(y.a) === v).length;
                          return `${c('oui')} oui · ${c('a_voir')} à voir · ${c('non')} non, sur ${nbRecherches} recherche${nbRecherches > 1 ? 's' : ''} ouverte${nbRecherches > 1 ? 's' : ''}. Coche ceux à qui l’envoyer.`;
                        })()}</span>
                      </div>
                      {iaEtat.manquent > 0 && (
                        <div className={l.alerte}>
                          <Ic n="info" t={14} />
                          <span>{`${iaEtat.manquent} ${iaEtat.manquent > 1 ? 'couples n’ont' : 'couple n’a'} pas pu être relu${iaEtat.manquent > 1 ? 's' : ''}${iaEtat.erreur ? ` (${iaEtat.erreur})` : ''}.`}</span>
                          <button type="button" className={l.alerteBtn} onClick={() => { void lancerRappro(); }}>{'Relancer'}</button>
                        </div>
                      )}
                      {iaEtat.info && <p className={l.aide}><Ic n="info" t={14} /><span>{iaEtat.info}</span></p>}
                      {ouiPossibles.length > 0 && (
                        <div className={l.barreHaut}>
                          <button type="button" className={l.cocherOui} onClick={() => setChoisis(c => { const n = new Set(c); for (const k of ouiPossibles) { if (tousOui) n.delete(k); else n.add(k); } return n; })}>
                            <Ic n="check" t={14} e={2.8} />{tousOui ? 'Décocher les oui' : `Cocher les oui (${ouiPossibles.length})`}
                          </button>
                        </div>
                      )}
                      {(['oui', 'a_voir', 'non'] as const).map(v => {
                        const l2 = auto.filter(y => groupeDe(y.a) === v);
                        if (!l2.length) return null;
                        const replie = v === 'non' && !voirNon;
                        const tete = (
                          <>
                            <IconeAvis v={v} t={22} />
                            <b>{MOT_IA[v]}</b>
                            <strong>{l2.length}</strong>
                            <span>{v === 'oui' ? 'Ils peuvent être intéressés.' : v === 'a_voir' ? 'Un point à vérifier avec eux.' : 'Le rapprochement les écarte.'}</span>
                          </>
                        );
                        return (
                          <div key={v} className={l.groupe}>
                            {v === 'non'
                              ? <button type="button" className={`${l.groupeT} ${l.groupeBtn}`} aria-expanded={!replie} onClick={() => setVoirNon(o => !o)}>{tete}<em>{replie ? 'Voir pourquoi' : 'Replier'}</em></button>
                              : <div className={l.groupeT}>{tete}</div>}
                            {!replie && <div className={l.lignes}>{l2.map((y, i) => ligneDe(y.x, i))}</div>}
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className={l.pied}>
          {envoi ? (
            envoi.fini ? (
              <>
                <button type="button" className={l.btn} onClick={recommencer}><Ic n="envoyer" t={14} />{'Envoyer à quelqu’un d’autre'}</button>
                <button type="button" className={`${l.btn} ${l.btnPrim}`} onClick={onFermer}>Fermer</button>
              </>
            ) : <button type="button" className={l.btn} disabled><span className={l.miniRoue} />{'En cours…'}</button>
          ) : etape === 'mail' ? (
            <>
              <button type="button" className={l.btn} onClick={() => setEtape('qui')}><Ic n="gauche" t={14} e={2.3} />Retour</button>
              <button type="button" className={`${l.btn} ${l.btnOr} ${l.btnEnvoi}`} disabled={!mail || !mail.objet.trim() || !mail.corps.trim() || !nbMails} onClick={() => { void lancer('mail'); }}>
                <Ic n="envoyer" t={15} />{nbMails > 1 ? `Envoyer les ${nbMails} mails` : 'Envoyer le mail'}
              </button>
            </>
          ) : (
            <>
              <span className={l.piedTx}>{!envoyables.length ? '' : dests.length ? (dests.length > 1 ? `${dests.length} destinataires choisis` : '1 destinataire choisi') : 'Personne pour l’instant'}</span>
              <button type="button" className={l.btn} disabled={!total('selection')} onClick={() => { void lancer('selection'); }}
                title="Pour les clients du CRM : les biens entrent dans leur dossier, à l’étape Sélection. Rien ne part : ils ne les voient pas encore.">
                <Ic n="liste" t={15} />Mettre en sélection
              </button>
              <button type="button" className={l.btn} disabled={!total('espace')} onClick={() => { void lancer('espace'); }}
                title="Pour les clients du CRM : ils arrivent tout de suite dans leur espace, avec la note de correspondance. Prévenus sur leur téléphone s’ils l’ont accepté.">
                <Ic n="envoyer" t={15} />Dans leur espace
              </button>
              <button type="button" className={`${l.btn} ${l.btnOr}`} disabled={!total('mail') && !libres.length} onClick={() => { setVue('apercu'); setEtape('mail'); }}
                title="Un mail par personne, à son prénom, avec les biens. Tu vois le mail tel qu’il le recevra avant qu’il parte.">
                <Ic n="mail" t={15} />Envoyer par mail
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(fen, document.body);
}

/* ══ CHANGER D'ÉTAPE ════════════════════════════════════════════════════ */
export type CibleEtape = 'a_suivre' | 'estimation' | 'suspendu' | 'retire';
export const CIBLES_ETAPE: { k: CibleEtape; lib: string; sous: string }[] = [
  { k: 'a_suivre', lib: 'À suivre', sous: 'Une estimation mise en attente' },
  { k: 'estimation', lib: 'Estimation', sous: 'Un bien à suivre passe à l’estimation' },
  { k: 'suspendu', lib: 'En pause', sous: 'Une vente mise en pause' },
  { k: 'retire', lib: 'Retiré', sous: 'Le vendeur renonce, le mandat est terminé' },
];
/* D'où chaque étape se rejoint, comme dans le menu d'étape de la fiche. */
const DEPUIS: Record<CibleEtape, EtapeVente[]> = {
  a_suivre: ['estimation'],
  estimation: ['a_suivre', 'retire'],
  suspendu: ['mandat'],
  retire: ['a_suivre', 'estimation', 'mandat', 'suspendu', 'offre'],
};

/* Pourquoi ce bien ne passe pas à cette étape d'ici (null : il passe). */
export function bloqueEtape(b: BienVente, cible: CibleEtape, liste: ListeBiens): string | null {
  const court = etapeDe(cible).court;
  if (b.etape === cible) return `Déjà « ${court} ».`;
  if (b.archive) return 'Archivé : sors-le des archives d’abord.';
  const d = b.donnees || {};
  const jamaisEnVente = !b.en_vente_le && !String(d.mandatDate || '').trim();
  if (!DEPUIS[cible].includes(b.etape) || (cible === 'estimation' && b.etape === 'retire' && !jamaisEnVente)) {
    if (b.etape === 'compromis' && cible === 'retire') return 'Sous compromis : « Le compromis est tombé », depuis sa fiche.';
    if (cible === 'estimation' && (b.etape === 'mandat' || b.etape === 'suspendu')) return 'Un mandat noté : « Le mandat n’est pas encore signé » ou « Annuler ce mandat », depuis sa fiche.';
    if (cible === 'estimation' && b.etape === 'retire') return 'Retiré après une mise en vente : « Remettre en vente », depuis sa fiche.';
    return `« ${etapeDe(b.etape).court} » ne passe pas « ${court} ».`;
  }
  /* Ce qui demande une décision : sur sa fiche. */
  if (cible === 'retire') {
    const offres = liste.suivi.filter(x => x.bien_id === b.id && x.type === 'offre' && (!x.statut || ['acceptee', 'en_attente', 'contre'].includes(String(x.statut))));
    if (offres.length) return `${offres.length > 1 ? `${offres.length} offres en cours` : 'Une offre en cours'} : depuis sa fiche, pour décider ${offres.length > 1 ? 'de ces offres' : 'de l’offre'}.`;
  }
  if (cible === 'retire') {
    const ids = new Set(liste.copies.filter(c => c.bien_vente_id === b.id).map(c => c.id));
    const prevues = liste.suivi.filter(x => x.bien_id === b.id && x.type === 'visite' && x.statut === 'a_venir' && !instantPasse(x.le)).length
      + liste.visites.filter(v => ids.has(v.bien_id) && v.statut === 'a_venir' && (!v.date_visite || !visitePasseeParis(v))).length;
    if (prevues) return `${prevues > 1 ? `${prevues} visites prévues` : 'Une visite prévue'} : depuis sa fiche, pour ${prevues > 1 ? 'les annuler' : 'l’annuler'} ou non.`;
  }
  if ((cible === 'retire' || cible === 'a_suivre') && avantMandat(b.etape)) {
    const r = avantRdv(d);
    if (r.rdvId && r.date && r.date >= aujourdhui()) return 'Un rendez-vous d’estimation est prévu : depuis sa fiche, pour l’annuler ou non.';
  }
  if (cible === 'estimation') {
    const deja = liste.suivi.some(x => x.bien_id === b.id && x.type === 'etape' && x.statut === 'estimation');
    if (deja && (String(d.rdvEstimation || '') || String(d.visiteLe || '') || String(d.avisEnvoye || ''))) return 'Déjà estimé une fois : depuis sa fiche, pour repartir de zéro ou non.';
  }
  return null;
}

/* Le passage, avec ce que la fiche fait derrière (FenRaison, FenEstimation
   sans rendez-vous). ⚠️ Si ces fenêtres changent, changer ici aussi. */
export async function passerEtape(b: BienVente, cible: CibleEtape, raison: string): Promise<BienVente> {
  const infos = raison.trim() ? { raison: raison.trim() } : {};
  if (cible === 'estimation') {
    const { bien: r } = await changerEtape(b, 'estimation', { infos });
    await cloreRelancesEstimation(b, 'reprise');
    return r;
  }
  const { bien: r } = await changerEtape(b, cible, { infos });
  if (cible === 'retire') {
    await solderDemandesDuBien(b);
    await cloreRelancesEstimation(b);
  }
  /* L'estimation mise de côté : la ligne de son Suivi (sans date de reprise
     ici : elle se met depuis sa fiche). */
  if (cible === 'a_suivre' && b.etape === 'estimation') await estimationMiseDeCote(r, raison, '');
  return r;
}

/* La raison, commune aux biens du lot. */
export function RaisonEtape({ cible, v, onChange, off }: { cible: CibleEtape; v: string; onChange: (x: string) => void; off: boolean }) {
  const choix = RAISONS_ETAPE[cible] || [];
  return (
    <div className={l.raison}>
      <span className={l.raisonT}>{'La raison (facultatif, la même pour tous)'}</span>
      {choix.length > 0 && (
        <div className={l.raisonPills}>
          {choix.map(x => <button key={x} type="button" className={l.pill} data-on={v === x ? 'oui' : undefined} disabled={off} onClick={() => onChange(v === x ? '' : x)}>{x}</button>)}
        </div>
      )}
      <input className={l.in} value={v} disabled={off} placeholder="En quelques mots" onChange={e => onChange(e.target.value)} />
    </div>
  );
}
