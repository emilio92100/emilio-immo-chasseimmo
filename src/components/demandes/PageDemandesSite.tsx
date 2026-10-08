'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { addJournal, supabase } from '@/lib/supabase';
import { toutLire } from '@/lib/registre';
import { TYPES_CONTACT, colonneContactAbsente, typeDe, typesDe, type TypeContact } from '@/lib/contacts';
import { signalerEchec, verifie } from '@/lib/ecritures';
import { signalerMaj } from '@/lib/intentions';
import EnteteRubrique from '@/components/shared/EnteteRubrique';
import Depliant from '@/components/shared/Depliant';
import ChoixDate, { texteDate } from '@/components/shared/ChoixDate';
import { Croix, Ic } from '@/components/documents/ApercuActe';
import PictoBoite from './PictoBoite';
import { lirePhotos } from '@/lib/biens-vente';
import Clients from '@/components/clients/Clients';
import { FenetreMail, type AdresseMail, type ContactMail } from '@/components/pages/PageMail';
import p from '@/components/pages/Page.module.css';
import s from './DemandesSite.module.css';
import {
  CATEGORIES, STATUTS, TABLE_DEMANDES, categorieDe, cleCategorie, correspond, dateLongue, normer, preRemplissage,
  depuis, emailUtile, fourchetteDvf, initiales, jourIso, joliTel, periode, prenomNom, presenter, rappel, rappelDu, resume, robot,
  statutDe, tableAbsente, telUtile, PORTAILS, provenanceDe,
  type CategorieDemande, type DemandeSite, type PreRemplissage, type Provenance, type StatutDemande,
} from '@/lib/demandes-site';

/* ═══ Demandes Internet (V3.93, avant : Demandes du site, V3.34) ══════════
   Tout ce qui arrive d'Internet, au même endroit : les formulaires
   d'emilio-immo.com (estimations, accompagnements acheteur, questions sur un
   bien, messages), puis, avec la passerelle SeLoger (context.md §7), les
   demandes de SeLoger, Logic-Immo et Belles Demeures.

   - V3.99b : plus de chiffres au-dessus du panneau (ils doublaient Tout /
     Mon site / Portails). Sous la provenance, la période (ce mois-ci, 3 mois,
     12 mois, depuis le début), qui filtre la liste et ses compteurs, le
     nombre de demandes reçues, et « N à traiter » : une seule nouvelle
     s'ouvre, plusieurs s'allument dans la liste.
   - La provenance : Tout / Mon site / Portails, un curseur qui glisse. Mon
     site et Portails ouvrent un tiroir : un formulaire, ou un portail.
   - Le statut (Nouvelles, En cours, Traitées, Archivées, Toutes) ; la
     rubrique s'ouvre toujours sur « Nouvelles », même vide.
   - La liste, par période ; une demande s'ouvre dans une fenêtre, au centre
     sur ordinateur, du bas sur téléphone. Dedans : ses réponses en rubriques
     (src/lib/demandes-site.ts), le statut, une date de rappel, les notes,
     « Créer le contact » (une question, puis la fenêtre Nouveau contact de
     Contacts, remplie, sans quitter la rubrique), archiver, supprimer.

   Une demande reste une demande tant qu'on n'a pas cliqué « Créer le
   contact » : rien n'entre dans Contacts tout seul.

   La table est `contact_submissions` (outils/sql/demandes-site.sql). Le site
   y dépose avec la clé publique, qui ne peut rien lire : c'est le CRM
   connecté qui lit et range. */

type Filtre = 'toutes' | StatutDemande | 'archives' | 'rappels';
type Categorie = 'toutes' | CategorieDemande;
type Teinte = { c: string; fond: string; trait: string };

const teinte = (x: Teinte) => ({ '--c': x.c, '--fond': x.fond, '--trait': x.trait } as CSSProperties);
const MARINE: Teinte = { c: '#34496e', fond: '#eef2f8', trait: '#d3dcea' };

/* V3.127 : « À rappeler » — une date de rappel, pas encore traitée. */
const aRappeler = (d: DemandeSite) => !d.archive && statutDe(d.statut).k !== 'traite' && !!d.a_rappeler_le;
const dansFiltre = (d: DemandeSite, f: Filtre) =>
  f === 'rappels' ? aRappeler(d)
    : f === 'archives' ? d.archive : !d.archive && (f === 'toutes' || statutDe(d.statut).k === f);
const dansCategorie = (d: DemandeSite, c: Categorie) => c === 'toutes' || cleCategorie(d) === c;
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/* ── Demandes Internet (V3.93) ─────────────────────────────────────────────
   Alexandre (6 octobre) : « les chiffres généraux en haut, puis Tout / Mon
   site / Portails, avec un sous-onglet en tiroir » ; « que ce soit joli,
   fluide quand on clique, pas brut » ; « Mon site en bleu, pas en noir ».
   Maquette validée le 6 octobre. Les portails arriveront avec la passerelle
   SeLoger : leurs tuiles sont déjà là, à zéro. */
type Prov = 'tout' | 'site' | 'portails';
type Portail = 'tous' | Provenance;
type Periode = 'mois' | 'trois' | 'an' | 'tout';
/* `court` : au téléphone, les quatre tiennent sur une ligne (V3.99). */
const PERIODES: { k: Periode; lib: string; court: string; phrase: string; jours: number | null }[] = [
  { k: 'mois', lib: 'Ce mois-ci', court: 'Ce mois', phrase: 'ce mois-ci', jours: null },
  { k: 'trois', lib: '3 mois', court: '3 mois', phrase: 'sur 3 mois', jours: 91 },
  { k: 'an', lib: '12 mois', court: '12 mois', phrase: 'sur 12 mois', jours: 365 },
  { k: 'tout', lib: 'Depuis le début', court: 'Tout', phrase: 'depuis le début', jours: null },
];
const BLEU = '#22497c';
/* La ponctuation française ne passe jamais seule à la ligne (V3.127). */
/* « Reçue hier · mer. 7 oct. à 12:00 » : court, pour tenir sur la ligne du
   nom à côté des boutons (la date complète est dans l'infobulle). */
const recueLe = (iso: string, maintenant: number) => {
  const x = new Date(iso);
  const an = x.getFullYear() === new Date(maintenant).getFullYear() ? undefined : 'numeric';
  const quand = `${x.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: an })} à ${x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  const dep = depuis(iso, maintenant);
  return /^(il y a|hier|à l)/.test(dep) ? `Reçue ${dep} · ${quand}` : `Reçue le ${quand}`;
};
const nb = (t: string) => t.replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»').replace(/ ([:;?!])/g, '\u00a0$1');

/* L'objet du mail, selon ce que le client a demandé. */
function sujetMail(d: DemandeSite): string {
  switch (cleCategorie(d)) {
    case 'estimation': return 'Votre demande d’estimation';
    case 'mandat_recherche': return 'Votre recherche immobilière';
    case 'rappel_bien': return d.property_title ? `Votre demande sur le bien « ${d.property_title} »` : 'Votre demande sur un de nos biens';
    default: return 'Votre message sur emilio-immo.com';
  }
}

export default function PageDemandesSite({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [demandes, setDemandes] = useState<DemandeSite[]>([]);
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  /* La rubrique s'ouvre sur « Nouvelles », même quand il n'y en a aucune :
     c'est ce qu'Alexandre veut voir en arrivant. */
  const [filtre, setFiltre] = useState<Filtre>('nouveau');
  const [cat, setCat] = useState<Categorie>('toutes');
  const [prov, setProv] = useState<Prov>('tout');
  const [portail, setPortail] = useState<Portail>('tous');
  /* V3.99b : la période filtre aussi la liste ; elle s'ouvre sur « Depuis le
     début » pour que rien ne soit caché en arrivant. */
  const [per, setPer] = useState<Periode>('tout');
  const [cherche, setCherche] = useState('');
  const [choisie, setChoisie] = useState<string | null>(null);
  /* La fenêtre de la demande se ferme en glissant (V3.93) : `sortie` le
     temps de l'animation. */
  const [sortie, setSortie] = useState(false);
  const [annonce, setAnnonce] = useState<{ texte: string; annuler?: () => void; action?: string; n: number } | null>(null);
  /* « Créer le contact » : d'abord la question (et les contacts qui lui
     ressemblent), puis la fenêtre Nouveau contact, remplie. */
  const [question, setQuestion] = useState<DemandeSite | null>(null);
  const [creation, setCreation] = useState<{ d: DemandeSite; pre: PreRemplissage } | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  /* La liste telle qu'elle est à l'écran, pour revenir en arrière si la base
     refuse une modification. */
  const courantes = useRef<DemandeSite[]>([]);
  courantes.current = demandes;
  const premiere = useRef(true);
  /* Une autre demande s'ouvre en haut de la fenêtre, pas à la hauteur où
     l'on avait laissé la précédente. */
  const cadre = useRef<HTMLDivElement>(null);
  /* « N à traiter » (V3.99) descend jusqu'à la liste ; V3.99b : les
     nouvelles s'y allument un instant (`eclair`). */
  const panneau = useRef<HTMLElement>(null);
  const [eclair, setEclair] = useState(false);
  useEffect(() => { cadre.current?.scrollTo({ top: 0 }); }, [choisie]);

  const charger = useCallback(async () => {
    const { data, erreur: e } = await toutLire<DemandeSite>((de, a) =>
      supabase.from(TABLE_DEMANDES).select('*').order('created_at', { ascending: false }).range(de, a));
    setCharge(false);
    setMaintenant(Date.now());
    if (e) { setErreur(e); return; }
    setErreur(null);
    setDemandes(data);
    if (!premiere.current) return;
    premiere.current = false;
    /* Une demande précise dans l'adresse (?page=demandes&demande=<id>) : on
       l'ouvre, dans la liste qui la contient. */
    const voulue = new URLSearchParams(window.location.search).get('demande');
    const d = voulue ? data.find(x => x.id === voulue) : null;
    if (d) { setChoisie(d.id); setFiltre(d.archive ? 'archives' : 'toutes'); }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  /* Une demande peut arriver pendant qu'on regarde : on relit au retour sur
     l'onglet, et chaque minute. */
  useEffect(() => {
    const revoir = () => { if (!document.hidden) charger(); };
    const minuterie = setInterval(revoir, 60_000);
    window.addEventListener('focus', revoir);
    document.addEventListener('visibilitychange', revoir);
    return () => {
      clearInterval(minuterie);
      window.removeEventListener('focus', revoir);
      document.removeEventListener('visibilitychange', revoir);
    };
  }, [charger]);

  /* L'annonce « Demande archivée — Annuler » s'efface d'elle-même. */
  useEffect(() => {
    if (!annonce) return;
    const t = setTimeout(() => setAnnonce(null), annonce.action ? 9000 : 6000);
    return () => clearTimeout(t);
  }, [annonce]);

  /* La fenêtre se ferme en glissant, et avec Échap. Une autre demande
     ouverte pendant la sortie annule la fermeture. */
  const minuteSortie = useRef<number | null>(null);
  const fermer = useCallback(() => {
    setSortie(true);
    if (minuteSortie.current) window.clearTimeout(minuteSortie.current);
    minuteSortie.current = window.setTimeout(() => { minuteSortie.current = null; setChoisie(null); setSortie(false); }, 190);
  }, []);
  const ouvrir = (id: string) => {
    if (minuteSortie.current) { window.clearTimeout(minuteSortie.current); minuteSortie.current = null; }
    setSortie(false);
    setChoisie(id);
  };
  useEffect(() => {
    if (!choisie || question || creation) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [choisie, question, creation, fermer]);

  /* ── D'où viennent les demandes ── */
  const dansProv = useCallback((d: DemandeSite) => {
    const pv = provenanceDe(d);
    if (prov === 'site') return pv.k === 'site';
    if (prov === 'portails') return pv.portail && (portail === 'tous' || pv.k === portail);
    return true;
  }, [prov, portail]);
  /* Sous « Mon site », le tiroir choisit le formulaire ; ailleurs, les pastilles. */
  const f: Filtre = filtre;
  /* ── La période (V3.99b, Alexandre : « choisir le timing, et avoir
     Nouvelles, En cours, Traitées, Archivées pareil ») : elle filtre la
     liste et ses compteurs, sous la provenance choisie. ── */
  const P = PERIODES.find(x => x.k === per) || PERIODES[0];
  const depuisLe = useMemo(() => {
    const now = new Date(maintenant);
    if (per === 'tout') return 0;
    if (per === 'mois') return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return maintenant - (P.jours || 0) * 86_400_000;
  }, [per, maintenant, P.jours]);
  const dansPer = useCallback((d: DemandeSite) => Date.parse(d.created_at) >= depuisLe, [depuisLe]);
  const trouvees = useMemo(() => demandes.filter(d => correspond(d, cherche)), [demandes, cherche]);
  const dansLaProv = trouvees.filter(d => dansProv(d) && dansPer(d));
  /* « À rappeler » ne regarde pas la période : une demande d'il y a deux
     mois à rappeler demain doit y être. La plus proche date d'abord. */
  const rappelsProv = trouvees.filter(d => dansProv(d) && aRappeler(d)).sort((p2, q) => String(p2.a_rappeler_le).localeCompare(String(q.a_rappeler_le)));
  const visibles = f === 'rappels' ? rappelsProv.filter(d => dansCategorie(d, cat)) : dansLaProv.filter(d => dansFiltre(d, f) && dansCategorie(d, cat));
  const ouverte = demandes.find(d => d.id === choisie) || null;
  /* La liste repart en fondu à chaque changement de filtre (V3.93). */
  const cleListe = `${prov}-${portail}-${f}-${cat}-${cherche ? 'q' : ''}`;

  /* Les groupes de la liste : aujourd'hui, hier, cette semaine… */
  const groupes = useMemo(() => {
    const out: { titre: string; l: DemandeSite[] }[] = [];
    const now = new Date(maintenant);
    for (const d of visibles) {
      const r = f === 'rappels' ? rappel(d.a_rappeler_le, now) : null;
      const t = f === 'rappels' ? (r === 'retard' ? 'En retard' : r === 'jour' ? 'Aujourd’hui' : 'Plus tard') : periode(d.created_at, now);
      const g = out[out.length - 1];
      if (g && g.titre === t) g.l.push(d); else out.push({ titre: t, l: [d] });
    }
    return out;
  }, [visibles, maintenant, f]);

  /* ── La phrase de l'en-tête ── */
  const actives = demandes.filter(d => !d.archive);
  const nbNouvelles = actives.filter(d => statutDe(d.statut).k === 'nouveau').length;
  const nbRappels = actives.filter(d => statutDe(d.statut).k !== 'traite' && rappelDu(d.a_rappeler_le, new Date(maintenant))).length;
  const derniere = demandes[0];
  const phrase = charge ? undefined
    : erreur ? 'Les demandes n’ont pas pu être lues'
    : demandes.length === 0 ? 'Aucune demande reçue pour l’instant'
    : [
      nbNouvelles ? `${pluriel(nbNouvelles, 'nouvelle demande', 'nouvelles demandes')} à traiter` : 'Tout est traité',
      nbRappels ? `${pluriel(nbRappels, 'rappel', 'rappels')} pour aujourd’hui` : '',
      derniere ? `dernière reçue ${depuis(derniere.created_at, maintenant)}` : '',
    ].filter(Boolean).join(' · ');

  const total = demandes.filter(d => dansProv(d) && dansPer(d) && !robot(d)).length;

  /* ── Les compteurs des filtres ── */
  const nbFiltre = (k: Filtre) => (k === 'rappels' ? rappelsProv : dansLaProv).filter(d => dansFiltre(d, k) && dansCategorie(d, cat)).length;
  const nbRappelsDus = rappelsProv.filter(d => rappelDu(d.a_rappeler_le, new Date(maintenant))).length;
  const nbCat = (c: Categorie) => dansLaProv.filter(d => dansFiltre(d, f) && dansCategorie(d, c)).length;
  const ETAPES: { k: Filtre; lib: string; c: string; aide: string }[] = [
    { k: 'nouveau', lib: 'Nouvelles', c: BLEU, aide: 'Pas encore prises en main : comptées en rouge dans le menu.' },
    { k: 'en_cours', lib: 'En cours', c: '#b45309', aide: 'Vous vous en occupez : appelé, message laissé…' },
    { k: 'rappels', lib: 'À rappeler', c: '#c2410c', aide: 'Avec une date de rappel, la plus proche d’abord.' },
    { k: 'traite', lib: 'Traitées', c: '#0f7a4f', aide: 'C’est réglé : réponse donnée, contact créé, ou pas sérieux.' },
  ];
  const robots = visibles.filter(robot);
  const choisirProv = (k: Prov) => { setProv(k); setPortail('tous'); setCat('toutes'); };

  /* ── Les écritures : l'écran change tout de suite, et revient en arrière
     si la base refuse (le message rouge dit pourquoi). ── */
  const modifier = useCallback(async (id: string, champs: Partial<DemandeSite>, quoi: string) => {
    const avant = courantes.current.find(d => d.id === id);
    setDemandes(l => l.map(d => (d.id === id ? { ...d, ...champs } : d)));
    const ok = await verifie(quoi, supabase.from(TABLE_DEMANDES).update(champs).eq('id', id).select('id'), { ligne: true });
    if (!ok && avant) setDemandes(l => l.map(d => (d.id === id ? avant : d)));
    if (ok) signalerMaj();
    return ok;
  }, []);

  const changerStatut = useCallback((d: DemandeSite, k: StatutDemande) =>
    modifier(d.id, { statut: k, statut_le: new Date().toISOString(), is_called: k === 'traite' }, 'Le statut de la demande'), [modifier]);
  const changerRappel = useCallback((d: DemandeSite, v: string) =>
    modifier(d.id, { a_rappeler_le: v || null }, 'La date de rappel'), [modifier]);
  const enregistrerNote = useCallback((d: DemandeSite, t: string) =>
    modifier(d.id, { admin_notes: t.trim() || null }, 'La note'), [modifier]);

  /* Une demande rangée (archivée, remise, supprimée) : la fenêtre se ferme. */
  const archiver = async (d: DemandeSite) => {
    if (!(await modifier(d.id, { archive: true, archive_le: new Date().toISOString() }, 'L’archivage de la demande'))) return;
    fermer();
    setAnnonce({ texte: `Demande de ${prenomNom(d.name).prenom || d.name} archivée`, n: Date.now(), annuler: () => { modifier(d.id, { archive: false, archive_le: null }, 'Le retour de la demande'); } });
  };
  const desarchiver = async (d: DemandeSite) => {
    if (!(await modifier(d.id, { archive: false, archive_le: null }, 'Le retour de la demande'))) return;
    fermer();
    setAnnonce({ texte: 'Demande remise dans la liste', n: Date.now() });
  };

  const supprimer = async (d: DemandeSite, confirme = false) => {
    if (!confirme && !confirm(`Supprimer définitivement la demande de ${d.name || 'ce contact'} ?\n\nElle disparaît de la base. Pour la garder de côté, utilisez plutôt « Archiver ».`)) return;
    if (!(await verifie('La suppression de la demande', supabase.from(TABLE_DEMANDES).delete().eq('id', d.id).select('id'), { ligne: true }))) return;
    setDemandes(l => l.filter(x => x.id !== d.id));
    setChoisie(null);
    signalerMaj();
    setAnnonce({ texte: 'Demande supprimée', n: Date.now() });
  };

  const supprimerRobots = async () => {
    const l = robots;
    if (!l.length) return;
    const noms = l.slice(0, 6).map(x => `· ${x.name || 'sans nom'}`).join('\n') + (l.length > 6 ? '\n…' : '');
    if (!confirm(`Supprimer ${pluriel(l.length, 'demande qui ressemble', 'demandes qui ressemblent')} à un robot ?\n\n${noms}\n\nElles disparaissent de la base.`)) return;
    const ids = l.map(x => x.id);
    if (!(await verifie('La suppression des demandes de robots', supabase.from(TABLE_DEMANDES).delete().in('id', ids).select('id'), { ligne: true }))) return;
    setDemandes(x => x.filter(d => !ids.includes(d.id)));
    if (choisie && ids.includes(choisie)) setChoisie(null);
    signalerMaj();
    setAnnonce({ texte: `${pluriel(ids.length, 'demande supprimée', 'demandes supprimées')}`, n: Date.now() });
  };

  /* « Créer le contact » : la question d'abord. « Oui » ouvre la fenêtre
     Nouveau contact de Contacts, remplie, par-dessus la rubrique ; une fois
     le contact créé, Contacts relie la demande et la passe « Traitée ». */
  const creerContact = (d: DemandeSite) => setQuestion(d);
  const lancerCreation = (d: DemandeSite) => {
    setQuestion(null);
    setCreation({ d, pre: preRemplissage(d) });
  };
  const finCreation = (d: DemandeSite, clientId: string | null) => {
    setCreation(null);
    if (!clientId) return;
    setDemandes(l => l.map(x => (x.id === d.id ? { ...x, client_id: clientId, statut: 'traite', statut_le: new Date().toISOString(), is_called: true } : x)));
    setAnnonce({ texte: `Contact ${prenomNom(d.name).prenom || d.name} créé`, action: 'Voir sa fiche', annuler: () => { ouvrirFiche(clientId); }, n: Date.now() });
  };
  /* Relier la demande à un contact qui existe déjà.
     V3.50 : le contact prend aussi le type qui va avec la demande (une
     estimation → vendeur, un accompagnement ou une question sur un bien →
     acheteur, comme « Créer le contact »), et la demande s'écrit dans son
     Suivi. Avant, seule la demande changeait : rien sur sa fiche. */
  const relier = async (d: DemandeSite, c: ContactProche) => {
    setQuestion(null);
    if (!(await modifier(d.id, { client_id: c.id, statut: 'traite', statut_le: new Date().toISOString(), is_called: true }, 'Le lien avec le contact'))) return;
    const cat = categorieDe(d.form_type);
    let ajoute: TypeContact | null = null;
    if (cat.type) {
      /* Avant le SQL des types, la colonne manque : tout contact est déjà
         acheteur, il n'y a rien à ajouter. */
      const { data: lu, error: eLu } = await supabase.from('clients').select('types').eq('id', c.id).maybeSingle();
      if (eLu && !colonneContactAbsente(eLu.message)) signalerEchec('Le type du contact', eLu.message);
      else if (lu) {
        const avant = typesDe(lu);
        /* Un « Vendeur signé » qui revend redevient « Vendeur » (comme pour un bien). */
        if (!avant.includes(cat.type)) {
          const apres = TYPES_CONTACT.map(t => t.k).filter(k => k === cat.type || (avant.includes(k) && !(cat.type === 'vendeur' && k === 'vendeur_signe')));
          if (await verifie('Le type du contact', supabase.from('clients').update({ types: apres }).eq('id', c.id).select('id'), { ligne: true })) ajoute = cat.type;
        }
      }
    }
    const pre = preRemplissage(d);
    await addJournal(c.id, 'message_client', `Demande du site · ${cat.lib}`,
      `${pre.notes}${ajoute ? `\n\nType ajouté à sa fiche : ${typeDe(ajoute).lib}.` : ''}`, { demande_site: d.id, formulaire: d.form_type });
    signalerMaj();
    setAnnonce({ texte: `Demande reliée à ${[c.prenom, c.nom].filter(Boolean).join(' ') || 'ce contact'}`, action: 'Voir sa fiche', annuler: () => { ouvrirFiche(c.id); }, n: Date.now() });
  };
  const ouvrirFiche = async (id: string) => {
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
    if (error) { signalerEchec('L’ouverture de la fiche', error.message); return; }
    if (!data) { signalerEchec('La fiche du contact', 'ce contact a été supprimé depuis.'); return; }
    onNavigate('fiche', data);
  };
  const voirFiche = (d: DemandeSite) => { if (d.client_id) ouvrirFiche(d.client_id); };

  const fiche = ouverte ? (
    <Fiche key={ouverte.id} d={ouverte} maintenant={maintenant} onFermer={fermer}
      onStatut={changerStatut} onRappel={changerRappel} onNote={enregistrerNote}
      onArchiver={archiver} onDesarchiver={desarchiver} onSupprimer={supprimer}
      onCreerContact={creerContact} onVoirFiche={voirFiche} onVoirBien={id => onNavigate('biens', { bien: id })} />
  ) : null;

  /* Les pastilles du tiroir (V3.129, maquette A) : les formulaires du site,
     ou les portails, puis « Toutes » / « Tous les portails » tout à droite. */
  const COURT_CAT: Record<string, string> = { estimation: 'Estimations', mandat_recherche: 'Acheteurs', rappel_bien: 'Infos bien', contact: 'Messages' };
  const tuilesTiroir = prov === 'site'
    ? [...CATEGORIES.map(c => ({ k: c.k as string, lib: c.pluriel, libCourt: COURT_CAT[c.k] || c.pluriel, c: c.c, ic: c.ic, court: '', tous: false })), { k: 'toutes', lib: 'Toutes', libCourt: 'Toutes', c: BLEU, ic: 'liste', court: '', tous: true }].map(t => {
      const l = dansLaProv.filter(d => !d.archive && (t.k === 'toutes' || cleCategorie(d) === t.k));
      const n = l.filter(d => statutDe(d.statut).k === 'nouveau').length;
      return { ...t, n: l.length, sous: n ? pluriel(n, 'nouvelle', 'nouvelles') : 'Rien de nouveau', vif: n > 0, on: cat === t.k, choisir: () => setCat(t.k as Categorie) };
    })
    : prov === 'portails'
      ? [...PORTAILS.map(x => ({ k: x.k as string, lib: x.lib, libCourt: x.lib, c: x.c, ic: '', court: x.court, tous: false })), { k: 'tous', lib: 'Tous les portails', libCourt: 'Tous', c: BLEU, ic: 'liste', court: '', tous: true }].map(t => {
        const l = demandes.filter(d => !d.archive && provenanceDe(d).portail && (t.k === 'tous' || provenanceDe(d).k === t.k));
        const n = l.filter(d => statutDe(d.statut).k === 'nouveau').length;
        return { ...t, n: l.length, sous: l.length ? (n ? pluriel(n, 'nouvelle', 'nouvelles') : 'Rien de nouveau') : 'Avec la passerelle SeLoger', vif: n > 0, on: portail === t.k, choisir: () => setPortail(t.k as Portail) };
      })
      : [];
  const sansPortails = prov === 'portails' && !demandes.some(d => provenanceDe(d).portail);

  return (
    <div className={p.page}>
      <EnteteRubrique titre="Demandes Internet" icone={<PictoBoite />} phrase={phrase}
        recherche={demandes.length > 0 ? { valeur: cherche, onChange: setCherche, placeholder: 'Nom, téléphone, ville, bien…', label: 'Chercher une demande' } : undefined}
        label="Les demandes" actif="" onChoisir={() => {}} tuiles={[]} />

      <section ref={panneau} className={s.panneau} aria-label="Les demandes">
        {/* V3.129 (Alexandre : « mon site en premier, ensuite portail, ensuite
            tout à droite ») : Mon site · Portails · Tout. */}
        <div className={s.provs} role="tablist" aria-label="Provenance" style={{ ['--i' as string]: String({ site: 0, portails: 1, tout: 2 }[prov]) } as CSSProperties}>
          <span className={s.curseur} aria-hidden="true" />
          {([
            { k: 'site', lib: 'Mon site', sous: 'emilio-immo.com', ic: 'globe', n: trouvees.filter(d => !d.archive && provenanceDe(d).k === 'site').length },
            { k: 'portails', lib: 'Portails', sous: 'SeLoger, Logic-Immo, Belles Demeures', ic: 'immeuble', n: trouvees.filter(d => !d.archive && provenanceDe(d).portail).length },
            { k: 'tout', lib: 'Tout', sous: 'Site et portails', ic: 'boite', n: trouvees.filter(d => !d.archive).length },
          ] as { k: Prov; lib: string; sous: string; ic: string; n: number }[]).map(x => (
            <button key={x.k} type="button" role="tab" aria-selected={prov === x.k} className={`${s.prov} ${prov === x.k ? s.provOn : ''}`} onClick={() => choisirProv(x.k)}>
              <span className={s.provIc}>{x.ic === 'boite' ? <PictoBoite taille={17} epaisseur={2} /> : <Ic n={x.ic} t={17} e={2} />}</span>
              <span className={s.provT}><b>{x.lib}</b><small>{x.sous}</small></span>
              <span className={s.provN}>{x.n}</span>
            </button>
          ))}
        </div>

        <Depliant ouvert={prov !== 'tout'}>
          <div className={s.tiroirProv} style={{ ['--fleche' as string]: prov === 'portails' ? '50%' : '16.7%' } as CSSProperties}>
            <div className={s.tiroirTete}>
              <span>{prov === 'portails' ? 'Portails · un par un' : 'Mon site · par formulaire'}</span>
              <small>{prov === 'portails' ? 'Logic-Immo arrive avec SeLoger' : 'emilio-immo.com'}</small>
            </div>
            {/* Une pastille par formulaire (ou portail) : son icône, son nom, son
                nombre ; un point rouge s'il y a du neuf. « Toutes » à droite. */}
            <div key={prov} className={s.pforms}>
              {tuilesTiroir.flatMap((t, i) => [
                t.tous ? <span key="sep" className={s.pformSep} aria-hidden="true" /> : null,
                <button key={t.k} type="button" aria-pressed={t.on} title={t.sous}
                  className={`${s.pform} ${t.on ? s.pformOn : ''} ${t.tous ? s.pformTous : ''}`}
                  style={{ ...teinte({ c: t.c, fond: '#fff', trait: '#e1e8f2' }), animationDelay: `${i * 40}ms` }} onClick={t.choisir}>
                  <span className={s.pformIc}>{t.court ? t.court : <Ic n={t.ic} t={15} e={2.1} />}</span>
                  <span className={s.pformL}><span className={s.libLong}>{t.lib}</span><span className={s.libCourt}>{t.libCourt}</span></span>
                  <span className={s.pformN}>{t.n}</span>
                  {t.vif && <span className={s.pformNeuf} />}
                </button>,
              ])}
            </div>
          </div>
        </Depliant>

        {/* V3.129 (Alexandre : « les nouvelles, en cours, appelées, traitées…
            je ne comprends pas trop ; ce mois-ci, 3 mois, 12 mois, j'aime pas
            comment il est placé ; bien condensé, une explication pour chaque
            statut ») : quatre étapes, chacune avec son nombre et sa phrase ;
            dessous, en petit, la période (« Reçues… »), puis Toutes et
            Archivées. */}
        {demandes.length > 0 && (
          <div className={s.etapes} role="tablist" aria-label="Où en sont les demandes">
            {ETAPES.map(x => (
              <button key={x.k} type="button" role="tab" aria-selected={f === x.k} className={`${s.etape} ${f === x.k ? s.etapeOn : ''}`}
                style={{ ['--c' as string]: x.c } as CSSProperties}
                onClick={() => { setFiltre(x.k); if (x.k === 'nouveau') { setEclair(true); window.setTimeout(() => setEclair(false), 1900); } }}>
                <span className={s.etapeH}>
                  <b>{((x.k === 'nouveau' && nbFiltre('nouveau') > 0) || (x.k === 'rappels' && nbRappelsDus > 0)) ? <span className={s.pouls} /> : <span className={s.etapePt} />}<span>{x.lib}</span></b>
                  <span className={s.etapeN}>{nbFiltre(x.k)}</span>
                </span>
                <small>{nb(x.aide)}</small>
              </button>
            ))}
          </div>
        )}
        {demandes.length > 0 && (
          <div className={s.periodeLigne}>
            <span className={s.recuesL}><Ic n="calendrier" t={14} e={2} /><span>Reçues</span></span>
            <div className={s.periodes} role="group" aria-label="Période">
              {PERIODES.map(x => (
                <button key={x.k} type="button" aria-pressed={per === x.k} className={`${s.periode} ${per === x.k ? s.periodeOn : ''}`} onClick={() => setPer(x.k)}><span className={s.perLong}>{x.lib}</span><span className={s.perCourt}>{x.court}</span></button>
              ))}
            </div>
            <span className={s.recues}><b>{total}</b>{` demande${total > 1 ? 's' : ''} ${P.phrase}`}</span>
            <span className={s.autresStatuts}>
              <button type="button" aria-pressed={f === 'toutes'} className={`${s.lienStatut} ${f === 'toutes' ? s.lienStatutOn : ''}`} onClick={() => setFiltre('toutes')} title="Tous les statuts, archivées à part">{`Toutes (${nbFiltre('toutes')})`}</button>
              <button type="button" aria-pressed={f === 'archives'} className={`${s.lienStatut} ${f === 'archives' ? s.lienStatutOn : ''}`} onClick={() => setFiltre('archives')} title="Rangées de côté : rien n’est effacé">{`Archivées (${nbFiltre('archives')})`}</button>
            </span>
          </div>
        )}
        {demandes.length > 0 && prov !== 'site' && (cat !== 'toutes' || CATEGORIES.some(c => nbCat(c.k) > 0)) && (
            <div className={s.cats} role="group" aria-label="Filtrer par sorte de demande">
              <button type="button" aria-pressed={cat === 'toutes'} style={teinte(MARINE)}
                className={`${s.cat} ${cat === 'toutes' ? s.catOn : ''}`} onClick={() => setCat('toutes')}>
                <span>Toutes</span>
                <span className={s.catN}>{nbCat('toutes')}</span>
              </button>
              {CATEGORIES.map(c => {
                const n = nbCat(c.k);
                if (!n && cat !== c.k) return null;
                return (
                  <button key={c.k} type="button" aria-pressed={cat === c.k} style={teinte(c)}
                    className={`${s.cat} ${cat === c.k ? s.catOn : ''}`} onClick={() => setCat(cat === c.k ? 'toutes' : c.k)}>
                    <span className={s.catIc}><Ic n={c.ic} t={14} e={2.1} /></span>
                    <span>{c.pluriel}</span>
                    <span className={s.catN}>{n}</span>
                  </button>
                );
              })}
            </div>
        )}

        {charge ? (
          <div className={p.empty}><div className={p.emptySub}>Chargement des demandes…</div></div>
        ) : erreur ? (
          <div className={s.vide}>
            <span className={s.videIc}><PictoBoite taille={26} /></span>
            {tableAbsente(erreur) ? (
              <>
                <div className={s.videTitre}>La table des demandes n’existe pas encore</div>
                <div className={s.videSous}>
                  <span>Lancez </span><code>outils/sql/demandes-site.sql</code><span>{' dans Supabase › SQL Editor, puis rechargez la page.'}</span>
                </div>
              </>
            ) : (
              <>
                <div className={s.videTitre}>Les demandes n’ont pas pu être lues</div>
                <div className={s.videSous}>{erreur}</div>
              </>
            )}
            <button type="button" className={s.btn} onClick={() => { setCharge(true); charger(); }}>Réessayer</button>
          </div>
        ) : demandes.length === 0 ? (
          <div className={s.vide}>
            <span className={s.videIc}><PictoBoite taille={26} /></span>
            <div className={s.videTitre}>Aucune demande pour l’instant</div>
            <div className={s.videSous}>Les estimations, les demandes d’accompagnement, les questions sur un bien et les messages laissés sur emilio-immo.com arriveront ici, puis celles des portails.</div>
          </div>
        ) : (
          <div key={cleListe} className={s.liste}>
            {robots.length > 0 && (
              <div className={s.bandeauRobots}>
                <Ic n="alarme" t={17} />
                <span>{`${pluriel(robots.length, 'demande de cette liste ressemble', 'demandes de cette liste ressemblent')} à un robot : nom ou message faits de lettres au hasard.`}</span>
                <button type="button" className={`${s.lienAction} ${s.lienDanger}`} onClick={supprimerRobots}>
                  {robots.length > 1 ? 'Les supprimer' : 'La supprimer'}
                </button>
              </div>
            )}
            {visibles.length === 0 ? (
              <div className={s.videDoux}>
                <div className={s.videTitre}>{sansPortails ? 'Pas encore de demande des portails' : cherche ? 'Aucune demande trouvée' : f === 'nouveau' ? 'Aucune nouvelle demande' : 'Rien dans cette liste'}</div>
                <div className={s.videSous}>
                  {sansPortails ? 'Les messages, les demandes de la page agence et les appels de SeLoger, Logic-Immo et Belles Demeures arriveront ici dès que la passerelle SeLoger sera branchée.'
                    : cherche ? `Rien ne correspond à « ${cherche} » ici.` : f === 'nouveau' ? 'Toutes les demandes reçues ont été prises en main.' : 'Changez de statut ou de provenance pour en voir d’autres.'}
                </div>
              </div>
            ) : groupes.map(g => (
              <div key={g.titre} className={s.groupe}>
                <div className={s.groupeTitre}><span>{g.titre}</span><i>{g.l.length}</i></div>
                {g.l.map((d, i) => (
                  <CarteDemande key={d.id} d={d} on={d.id === choisie} eclair={eclair} maintenant={maintenant} rang={i} onChoisir={() => ouvrir(d.id)} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {fiche && typeof document !== 'undefined' && createPortal(
        <div className={`${s.voileModale} ${sortie ? s.sortie : ''}`} onClick={e => { if (e.target === e.currentTarget) fermer(); }}>
          <div ref={cadre} className={s.modale} role="dialog" aria-modal="true" aria-label={`Demande de ${ouverte?.name || ''}`}>{fiche}</div>
        </div>,
        document.body,
      )}

      {question && typeof document !== 'undefined' && createPortal(
        <QuestionContact d={question} onNon={() => setQuestion(null)} onOui={() => lancerCreation(question)} onRelier={c => relier(question, c)} />,
        document.body,
      )}

      {/* La fenêtre Nouveau contact de Contacts, seule, remplie avec la demande. */}
      {creation && <Clients key={creation.d.id} onNavigate={onNavigate} fenetre={{ pre: creation.pre, onFin: id => finCreation(creation.d, id) }} />}

      {annonce && typeof document !== 'undefined' && createPortal(
        <div key={annonce.n} className={s.annonce} role="status">
          <span>{annonce.texte}</span>
          {annonce.annuler && <button type="button" onClick={() => { annonce.annuler?.(); setAnnonce(null); }}>{annonce.action || 'Annuler'}</button>}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ── Une demande dans la liste ─────────────────────────────────────────── */
function CarteDemande({ d, on, eclair, maintenant, rang, onChoisir }: {
  d: DemandeSite; on: boolean; eclair?: boolean; maintenant: number; rang: number; onChoisir: () => void;
}) {
  const cat = categorieDe(d.form_type);
  const st = statutDe(d.statut);
  const neuve = !d.archive && st.k === 'nouveau';
  const r = resume(d);
  const dvf = fourchetteDvf(d);
  const bot = robot(d);
  const rap = !d.archive && st.k !== 'traite' ? rappel(d.a_rappeler_le, new Date(maintenant)) : null;
  /* V3.93 : la tuile de gauche dit d'où vient la demande (« Site » en bleu,
     « SL » pour SeLoger…), la pastille dit ce qu'elle demande. */
  const pv = provenanceDe(d);
  return (
    <button type="button" aria-pressed={on} onClick={onChoisir} aria-label={`Ouvrir la demande de ${d.name || 'sans nom'} (${pv.lib}, ${cat.lib})`}
      style={{ ...teinte(cat), ['--pc' as string]: pv.c, animationDelay: `${Math.min(rang, 8) * 35}ms` } as CSSProperties}
      className={`${s.carte} ${on ? s.carteOn : ''} ${neuve ? s.carteNeuve : ''} ${neuve && eclair ? s.carteEclair : ''} ${bot ? s.carteRobot : ''}`}>
      <span className={s.provTuile} title={pv.lib}>
        <span>{pv.court}</span>
        {neuve && <span className={s.pointNeuf} title="Nouvelle demande" />}
      </span>
      <span className={s.ligne1}>
        <span className={s.nom}>{d.name || 'Sans nom'}</span>
        <span className={s.pastille}><Ic n={cat.ic} t={12} e={2.2} /><span>{cat.court}</span></span>
      </span>
      <span className={s.quand}>{depuis(d.created_at, maintenant)}</span>
      <span className={`${s.resume} ${r ? '' : s.resumeVide}`}>{r || 'Pas de message'}</span>
      <span className={s.pied}>
        {d.archive
          ? <span className={`${s.pastille} ${s.pastilleRobot}`}>Archivée</span>
          : !neuve && <span className={s.pastille} style={teinte(st)}><span className={s.pointStatut} /><span>{st.lib}</span></span>}
        {rap && (
          <span className={`${s.pastille} ${rap === 'plus_tard' ? s.pastilleRappel : s.pastilleRappelDu}`}>
            <Ic n="alarme" t={12} e={2.2} />
            <span>{rap === 'jour' ? 'À rappeler aujourd’hui' : rap === 'retard' ? `Rappel en retard (${texteDate(d.a_rappeler_le || '', false)})` : `À rappeler le ${texteDate(d.a_rappeler_le || '', false)}`}</span>
          </span>
        )}
        {dvf && <span className={`${s.pastille} ${s.pastilleDvf}`}><Ic n="euro" t={12} e={2.2} /><span>{dvf}</span></span>}
        {d.client_id && <span className={`${s.pastille} ${s.pastilleContact}`}><Ic n="personne" t={12} e={2.2} /><span>Contact créé</span></span>}
        {bot && <span className={`${s.pastille} ${s.pastilleRobot}`}>Robot ?</span>}
        {telUtile(d.phone) && <span className={s.coord}>{joliTel(d.phone)}</span>}
      </span>
    </button>
  );
}

/* ── La demande ouverte ────────────────────────────────────────────────── */
function Fiche({ d, maintenant, onFermer, onStatut, onRappel, onNote, onArchiver, onDesarchiver, onSupprimer, onCreerContact, onVoirFiche, onVoirBien }: {
  d: DemandeSite;
  maintenant: number;
  onFermer?: () => void;
  onStatut: (d: DemandeSite, k: StatutDemande) => Promise<boolean>;
  onRappel: (d: DemandeSite, v: string) => Promise<boolean>;
  onNote: (d: DemandeSite, t: string) => Promise<boolean>;
  onArchiver: (d: DemandeSite) => void;
  onDesarchiver: (d: DemandeSite) => void;
  onSupprimer: (d: DemandeSite, confirme?: boolean) => void;
  onCreerContact: (d: DemandeSite) => void;
  onVoirFiche: (d: DemandeSite) => void;
  /* V3.127 : la fiche du bien demandé, dans le CRM. */
  onVoirBien?: (bienVenteId: string) => void;
}) {
  const cat = categorieDe(d.form_type);
  const pv = provenanceDe(d);
  const st = statutDe(d.statut);
  const pr = useMemo(() => presenter(d), [d]);
  /* La note se garde en quittant le champ, ou avec « Enregistrer ». La fiche
     est remontée pour chaque demande (key), la note repart donc de la base. */
  const [note, setNote] = useState(d.admin_notes || '');
  const [etatNote, setEtatNote] = useState<'rien' | 'envoi' | 'fait'>('rien');
  const [copie, setCopie] = useState(false);
  const modifiee = note.trim() !== (d.admin_notes || '').trim();

  const garderNote = async () => {
    if (!modifiee || etatNote === 'envoi') return;
    setEtatNote('envoi');
    const ok = await onNote(d, note);
    setEtatNote(ok ? 'fait' : 'rien');
  };

  const tel = telUtile(d.phone) ? joliTel(d.phone) : '';
  const mail = emailUtile(d.email) ? d.email.trim() : '';
  const { prenom } = prenomNom(d.name);
  /* V3.131 (Alexandre : « quand on clique sur Écrire, un pop-up de nouveau
     mail qui reprend le mail… et joindre un fichier ou pas ») : la fenêtre
     « Nouveau mail » du CRM, l'adresse, le bonjour et l'objet déjà mis. Sa
     fiche existe et porte cette adresse : le mail part à son nom de contact,
     et se range dans son Suivi. Avant : un lien mailto, vers la messagerie
     de l'ordinateur. */
  const [ecrire, setEcrire] = useState<{ contact: ContactMail | null; adresse: AdresseMail | null } | null>(null);
  const ouvrirMail = async () => {
    const adresse: AdresseMail = { email: mail, prenom: prenom || undefined, objet: sujetMail(d) };
    if (d.client_id) {
      const { data } = await supabase.from('clients').select('*').eq('id', d.client_id).maybeSingle();
      const c = data as ContactMail | null;
      if (c && (c.emails || []).some(e => String(e).trim().toLowerCase() === mail.toLowerCase())) { setEcrire({ contact: c, adresse: null }); return; }
    }
    setEcrire({ contact: null, adresse });
  };
  const copier = async () => {
    try {
      await navigator.clipboard.writeText([d.name, tel, mail].filter(Boolean).join('\n'));
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch { signalerEchec('La copie', 'le navigateur a refusé l’accès au presse-papiers.'); }
  };
  const bot = robot(d);
  const aujourdhui = jourIso(new Date(maintenant));

  /* V3.127 — La photo du bien demandé (« sur le bien demandé, il faut une
     photo ») : la référence du site est celle du flux (lib/flux-site.ts,
     idSite) — le numéro ImmoFacile, sinon la référence, sinon l'id. */
  const [bienCrm, setBienCrm] = useState<{ id: string; photo: string; prix: number | null } | null>(null);
  useEffect(() => {
    const ref = String(d.property_ref || '').trim();
    if (!ref || !/^[\w-]{1,64}$/.test(ref)) return;
    let vivant = true;
    const ou = [`reference.eq.${ref}`, `donnees->>idImmofacile.eq.${ref}`];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) ou.push(`id.eq.${ref}`);
    supabase.from('biens_vente').select('id, photo, prix, donnees').or(ou.join(',')).limit(1).then(({ data }) => {
      const b = ((data || []) as { id: string; photo?: string | null; prix?: number | null; donnees?: Record<string, unknown> | null }[])[0];
      if (!vivant || !b) return;
      setBienCrm({ id: b.id, photo: b.photo || lirePhotos(b.donnees?.photos)[0]?.url || '', prix: b.prix ?? null });
    });
    return () => { vivant = false; };
  }, [d.property_ref]);

  /* Archiver ou supprimer : d'abord ce qui va se passer, puis « Oui ». */
  const [confirme, setConfirme] = useState<'' | 'archiver' | 'supprimer'>('');
  /* Un changement de statut se voit : « Enregistré » apparaît un instant. */
  const [fait, setFait] = useState(0);
  const choisir = async (k: StatutDemande) => { if (await onStatut(d, k)) setFait(Date.now()); };
  /* Une date de rappel sur une nouvelle demande : elle passe « En cours ». */
  /* V3.129 (Alexandre : « il y a juste marqué enregistré en tout petit…
     il faut un meilleur accompagnement : votre relance est planifiée,
     revenez ici dans deux jours, vous pouvez fermer la page ») : une date
     choisie, le bloc devient « Rappel programmé » et dit la suite. */
  const [rappelVient, setRappelVient] = useState(false);
  const [passeEnCours, setPasseEnCours] = useState(false);
  const [changeDate, setChangeDate] = useState(false);
  const rappeler = async (v: string) => {
    const etaitNouvelle = st.k === 'nouveau';
    if (!(await onRappel(d, v))) return;
    setChangeDate(false);
    if (!v) { setRappelVient(false); setPasseEnCours(false); setFait(Date.now()); return; }
    if (etaitNouvelle) await onStatut(d, 'en_cours');
    setPasseEnCours(etaitNouvelle);
    setRappelVient(true);
  };
  const dateRappel = d.a_rappeler_le ? d.a_rappeler_le.slice(0, 10) : '';
  const jourRappel = dateRappel ? new Date(`${dateRappel}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const etatRappel: '' | 'avenir' | 'jour' | 'retard' = !dateRappel ? '' : dateRappel > aujourdhui ? 'avenir' : dateRappel === aujourdhui ? 'jour' : 'retard';

  /* V3.127 — Alexandre : « que le pop-up soit plus clair, plus lisible…
     qu'est-ce que vous souhaitez faire de cette demande, avec les
     explications : en cours, pourquoi ; traitée, pourquoi ; les
     conséquences ». Chaque choix dit ce qu'il veut dire et ce qu'il change. */
  const CHOIX: Record<StatutDemande, { titre: string; sous: string; suite: string }> = {
    nouveau: { titre: 'Nouvelle', sous: 'Pas encore prise en main', suite: 'Elle reste comptée en rouge dans le menu, pour ne pas l’oublier.' },
    en_cours: { titre: 'En cours', sous: 'Je m’en occupe', suite: 'Appelé, message laissé… Elle sort du compteur rouge et attend dans « En cours ».' },
    traite: { titre: 'Traitée', sous: 'C’est réglé', suite: 'Réponse donnée, contact créé, ou pas sérieux. Elle passe dans « Traitées ».' },
  };

  /* Ce que le client a envoyé : le bien, son message, ses réponses. */
  const leBien = pr.bien ? (() => {
    const b = pr.bien;
    return (
      <div className={`${s.bien} ${s.bienCarte}`}>
        {bienCrm?.photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className={s.bienPhoto} src={bienCrm.photo} alt="" />
          : <span className={s.bienIc}><Ic n="maison" t={19} /></span>}
        <span className={s.bienTx}>
          <span className={s.bienSur}>{'Le bien demandé'}</span>
          <span className={s.bienTitre}>{b.titre}</span>
          <span className={s.bienRef}>{[b.ref ? `Réf. ${b.ref}` : 'Bien du site', bienCrm?.prix ? `${bienCrm.prix.toLocaleString('fr-FR')} €` : ''].filter(Boolean).join(' · ')}</span>
          <span className={s.bienLiens}>
            {bienCrm && onVoirBien && <button type="button" className={s.bienLien} onClick={() => onVoirBien(bienCrm.id)}><Ic n="maison" t={13} e={2.2} /><span>{'Sa fiche'}</span></button>}
            {b.lien && <a className={s.bienLien} href={b.lien} target="_blank" rel="noopener noreferrer"><Ic n="globe" t={13} e={2.2} /><span>{'L’annonce sur le site'}</span></a>}
          </span>
        </span>
      </div>
    );
  })() : null;

  return (
    <article className={s.fiche} style={teinte(cat)}>
      <header className={s.tete}>
        <div className={s.teteHaut}>
          <span className={s.teteEtiq}>
            <span className={s.teteProv} style={{ color: pv.c }}>{pv.lib}</span>
            <span className={s.teteCat}><Ic n={cat.ic} t={14} e={2.1} /><span>{cat.lib}</span></span>
            <span className={s.teteStatut} style={teinte(st)}><span className={s.pointStatut} /><span>{st.lib}</span></span>
          </span>
          {onFermer && (
            <button type="button" className={s.fermer} onClick={onFermer} aria-label="Fermer la demande"><Croix t={16} /></button>
          )}
        </div>
        {/* Le nom, et sur la même ligne : appeler, écrire, copier, la fiche contact
            (V3.127 : « tout doit tenir dans la fenêtre, sans faire défiler »). */}
        <div className={s.identiteLigne}>
          <div className={s.identite}>
            <span className={s.grandAvatar}>{initiales(d.name)}</span>
            <div style={{ minWidth: 0 }}>
              <h2 className={s.grandNom}>{d.name || 'Sans nom'}</h2>
              <div className={s.recue} title={`Reçue le ${dateLongue(d.created_at)}`}>{recueLe(d.created_at, maintenant)}</div>
            </div>
          </div>
          <div className={s.teteActions}>
            {tel && <a className={`${s.btnClair} ${s.btnOr}`} href={`tel:${tel.replace(/\s/g, '')}`}><Ic n="telephone" t={15} e={2.1} /><span>{tel}</span></a>}
            {mail && <button type="button" className={s.btnClair} onClick={() => { void ouvrirMail(); }}><Ic n="mail" t={15} e={2} /><span>Écrire</span></button>}
            {(tel || mail) && (
              <button type="button" className={s.btnClair} onClick={copier}>
                <Ic n={copie ? 'check' : 'copier'} t={15} e={2} /><span>{copie ? 'Copié' : 'Copier'}</span>
              </button>
            )}
            {d.client_id ? (
              <button type="button" className={s.btnFiche} onClick={() => onVoirFiche(d)}>
                <Ic n="personne" t={16} e={2} /><span>Voir sa fiche contact</span><Ic n="droite" t={15} e={2.2} />
              </button>
            ) : (
              <button type="button" className={s.btnFiche} onClick={() => onCreerContact(d)} title="Crée sa fiche avec ce qu’il a envoyé, et passe la demande en « Traitée ».">
                <Ic n="plus" t={16} e={2.4} /><span>Créer la fiche contact</span>
              </button>
            )}
          </div>
        </div>
        {!tel && !mail && <div className={s.sansCoord}>Aucun téléphone ni e-mail utilisable dans cette demande.</div>}
      </header>

      {/* V3.127 — Une grille de rangées à deux cases de même hauteur (Alexandre :
          « il y a trop de blanc à gauche ») : le bien et son message, ses
          réponses, coordonnées et notes, puis la question sur toute la largeur
          (« à la fin, plus bas »). Au téléphone, une colonne : le bien, le
          message, la question, puis le reste. */}
      <div className={`${s.corps2} ${leBien ? '' : s.sansBien}`}>
        {bot && (
          <div className={`${s.robotAvis} ${s.zRobot}`}>
            <Ic n="alarme" t={18} />
            <span>
              <b>Ça ressemble à un robot.</b>{' '}<span>Le nom ou le message sont faits de lettres au hasard.</span>{' '}
              <button type="button" className={`${s.lienAction} ${s.lienDanger}`} onClick={() => setConfirme('supprimer')}>Supprimer cette demande</button>
            </span>
          </div>
        )}

        {leBien && <div className={s.zBien}>{leBien}</div>}

        <section className={`${s.section} ${s.zMessage}`}>
          <div className={s.sectionTitre}><Ic n="bulle" t={14} e={2} /><span>Son message</span></div>
          {pr.message
            ? <p className={`${s.message} ${s.messageGrand}`}>{pr.message}</p>
            : <p className={`${s.message} ${s.messageVide}`}>{'Pas de message : ses réponses sont juste en dessous.'}</p>}
        </section>

        <section className={`${s.decision} ${s.zDecision}`} aria-labelledby={`decision-${d.id}`}>
          <div className={s.decisionTete}>
            <h3 id={`decision-${d.id}`} className={s.decisionT}>{nb('Que souhaitez-vous faire de cette demande ?')}</h3>
            {fait > 0 && <span key={fait} className={s.faitChip}><Ic n="check" t={12} e={2.6} /><span>{'Enregistré'}</span></span>}
          </div>
          <div className={s.choixL} role="radiogroup" aria-label="Où en est cette demande">
            {STATUTS.map(x => {
              const on = st.k === x.k;
              const c = CHOIX[x.k];
              return (
                <button key={x.k} type="button" role="radio" aria-checked={on} style={teinte(x)}
                  className={`${s.choix} ${on ? s.choixOn : ''}`}
                  onClick={() => { if (!on) void choisir(x.k); }}>
                  <span className={s.choixIc}><Ic n={on ? 'check' : x.ic} t={16} e={2.3} /></span>
                  <span className={s.choixTx}>
                    <b>{c.titre}</b>
                    <i>{c.sous}</i>
                    <small>{nb(c.suite)}</small>
                  </span>
                </button>
              );
            })}
          </div>
          {/* À rappeler (V3.127 : « le mettre plus en avant ») : des dates toutes prêtes.
              V3.129 : une date posée, le bloc devient « Rappel programmé ». */}
          {etatRappel && !changeDate ? (
            <div key={dateRappel} className={`${s.rappelFait} ${rappelVient ? s.rappelVient : ''}`} data-etat={etatRappel} role="status">
              <span className={s.rappelFaitIc}><Ic n="alarme" t={20} e={2} /></span>
              <div className={s.rappelFaitTx}>
                <b>{etatRappel === 'avenir' ? `Rappel programmé · ${jourRappel}` : etatRappel === 'jour' ? 'À rappeler aujourd’hui' : `Rappel en retard · prévu le ${jourRappel}`}</b>
                <span>{nb(etatRappel === 'avenir'
                  ? 'Vous pouvez fermer cette fenêtre. Ce jour-là, la demande reviendra dans « À rappeler » et le menu vous le signalera.'
                  : 'C’est le jour : appelez, puis choisissez « En cours » ou « Traitée » juste au-dessus. Ou repoussez la date.')}</span>
                {passeEnCours && <span className={s.rappelStatut}>{'Elle est passée en '}<i>{'En cours'}</i></span>}
                <span className={s.rappelFaitBtns}>
                  <button type="button" className={s.rappelBtn} onClick={() => setChangeDate(true)}><Ic n="calendrier" t={14} e={2} /><span>{etatRappel === 'avenir' ? 'Changer la date' : 'Repousser'}</span></button>
                  <button type="button" className={s.rappelBtn} onClick={() => { void rappeler(''); }}><Croix t={12} /><span>Retirer le rappel</span></button>
                  {onFermer && etatRappel === 'avenir' && <button type="button" className={`${s.rappelBtn} ${s.rappelBtnPlein}`} onClick={onFermer}>Fermer la fenêtre</button>}
                </span>
              </div>
            </div>
          ) : (
          <div className={s.rappelBloc}>
            <span className={s.rappelIc}><Ic n="alarme" t={17} e={2} /></span>
            <div className={s.rappelTx}>
              <b>{changeDate ? 'Choisir une autre date' : d.a_rappeler_le ? `À rappeler le ${texteDate(d.a_rappeler_le, false)}` : 'La rappeler plus tard ?'}</b>
              <small>{nb(st.k === 'nouveau'
                ? 'Elle passe « En cours » ; le jour venu, elle remonte dans « À rappeler ».'
                : 'Le jour venu, elle remonte dans « À rappeler », signalée dans le menu.')}</small>
            </div>
            <div className={s.rappelChoix}>
              {[{ l: 'Demain', j: 1 }, { l: 'Dans 3 jours', j: 3 }, { l: 'Dans une semaine', j: 7 }].map(x => {
                const v = jourIso(new Date(maintenant + x.j * 86_400_000));
                return <button key={x.j} type="button" className={`${s.rappelPuce} ${d.a_rappeler_le?.slice(0, 10) === v ? s.rappelPuceOn : ''}`} onClick={() => { void rappeler(v); }}>{x.l}</button>;
              })}
              <ChoixDate compact valeur={d.a_rappeler_le || ''} min={aujourdhui} placeholder="Autre date" onChange={v => { if (v) void rappeler(v); }} />
              {changeDate
                ? <button type="button" className={s.lienAction} onClick={() => setChangeDate(false)}>Annuler</button>
                : d.a_rappeler_le && <button type="button" className={s.lienAction} onClick={() => { void rappeler(''); }}>Retirer</button>}
            </div>
          </div>
          )}
        </section>

        {(pr.rubriques.length > 0 || (cat.k === 'estimation' && pr.dvf)) && (
          <div className={s.zReponses}>
            {cat.k === 'estimation' && pr.dvf && (
              <div className={`${s.dvf} ${pr.dvf.fourchette ? '' : s.dvfAucune}`}>
                <span className={s.dvfIc}><Ic n="euro" t={19} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className={s.dvfLib}>Estimation DVF montrée sur le site</div>
                  <div className={s.dvfVal}>{pr.dvf.fourchette || 'Non disponible'}</div>
                  <div className={s.dvfSous}>{pr.dvf.ventes ? `D’après ${pluriel(Number(pr.dvf.ventes), 'vente', 'ventes')} autour du bien` : pr.dvf.fourchette ? 'D’après les ventes autour du bien' : 'Pas assez de ventes récentes autour du bien'}</div>
                </div>
              </div>
            )}
            {pr.rubriques.map(r => (
              <section key={r.titre} className={s.section}>
                <div className={s.sectionTitre}><Ic n={r.ic} t={14} e={2} /><span>{r.titre}</span></div>
                {r.champs.length > 0 && (
                  <dl className={s.champs}>
                    {r.champs.map((c, i) => <div key={i} className={s.champ}><dt>{c.l}</dt><dd>{c.v}</dd></div>)}
                  </dl>
                )}
                {!!r.puces?.length && (
                  <div className={s.puces}>
                    {r.puces.map((x, i) => (
                      <span key={i} className={s.puce}>{r.numerotees && <span className={s.puceN}>{i + 1}</span>}<span>{x}</span></span>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        <section className={`${s.section} ${s.zCoord}`}>
          <div className={s.sectionTitre}><Ic n="personne" t={14} e={2} /><span>Coordonnées</span></div>
          <dl className={s.champs}>
            <div className={s.champ}><dt>Téléphone</dt><dd>{d.phone ? joliTel(d.phone) : '—'}</dd></div>
            <div className={s.champ}><dt>E-mail</dt><dd>{d.email ? `${d.email}${mail ? '' : ' (adresse incomplète)'}` : '—'}</dd></div>
          </dl>
        </section>

        <section className={`${s.section} ${s.zNotes}`}>
          <div className={s.sectionTitre}><Ic n="crayon" t={14} e={2} /><span>Mes notes</span><em className={s.titreAide}>{'· visibles par vous seul, jamais par le client'}</em></div>
          <textarea className={s.notes} value={note} onBlur={garderNote}
            onChange={e => { setNote(e.target.value); setEtatNote('rien'); }}
            placeholder="Ce qu’il a dit au téléphone, la suite à donner…" aria-label="Mes notes sur cette demande" />
          {(modifiee || etatNote === 'fait') && <div className={s.notesPied}>
            {etatNote === 'fait' && !modifiee
              ? <span className={s.enregistre}><Ic n="check" t={14} e={2.4} /><span>Note enregistrée</span></span>
              : <span className={s.aide}>{'Enregistrée en quittant le champ'}</span>}
            {modifiee && (
              <button type="button" className={`${s.btn} ${s.btnPetit}`} onClick={garderNote} disabled={etatNote === 'envoi'}>
                {etatNote === 'envoi' ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            )}
          </div>}
        </section>

        {/* Archiver, supprimer : une confirmation qui dit ce qui va se passer
            (Alexandre : « toujours expliquer »). */}
        <div className={`${s.piedFiche} ${s.zActions}`}>
          {confirme ? (
            <div key={confirme} ref={el => { el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }} className={s.confirme} data-k={confirme} role="alertdialog" aria-label={confirme === 'archiver' ? 'Archiver cette demande ?' : 'Supprimer définitivement ?'}>
              <span className={s.confirmeIc}><Ic n={confirme === 'archiver' ? 'archive' : 'corbeille'} t={17} e={2} /></span>
              <span className={s.confirmeTx}>
                <b>{confirme === 'archiver' ? 'Archiver cette demande ?' : 'Supprimer définitivement ?'}</b>
                <small>{nb(confirme === 'archiver'
                  ? 'Elle quitte la liste et va dans « Archivées ». Rien n’est effacé : vous pourrez la remettre quand vous voulez.'
                  : 'Elle disparaît de la base, sans retour possible. Pour la garder de côté, archivez-la plutôt.')}</small>
              </span>
              <span className={s.confirmeBtns}>
                <button type="button" className={`${s.btn} ${s.btnPetit}`} onClick={() => setConfirme('')}>Annuler</button>
                <button type="button" className={`${s.btn} ${s.btnPetit} ${confirme === 'supprimer' ? s.btnDanger : s.btnPlein}`}
                  onClick={() => { const k = confirme; setConfirme(''); if (k === 'archiver') onArchiver(d); else onSupprimer(d, true); }}>
                  {confirme === 'archiver' ? 'Oui, archiver' : 'Oui, supprimer'}
                </button>
              </span>
            </div>
          ) : (
            <>
              {d.archive ? (
                <button type="button" className={`${s.btn} ${s.btnPetit}`} onClick={() => onDesarchiver(d)}>
                  <Ic n="haut" t={15} e={2} /><span>Remettre dans la liste</span>
                </button>
              ) : (
                <button type="button" className={`${s.btn} ${s.btnPetit}`} onClick={() => setConfirme('archiver')}>
                  <Ic n="archive" t={15} e={2} /><span>Archiver</span>
                </button>
              )}
              <span className={s.aide}>{d.archive ? 'Archivée : elle n’apparaît plus dans la liste.' : 'Elle quitte la liste, sans être effacée.'}</span>
              <button type="button" className={`${s.lienAction} ${s.lienDanger} ${s.piedSuppr}`} onClick={() => setConfirme('supprimer')}>Supprimer définitivement</button>
            </>
          )}
        </div>
      </div>
      {ecrire && (
        <FenetreMail contact={ecrire.contact} adresse={ecrire.adresse} objet={sujetMail(d)} onFermer={() => setEcrire(null)}
          /* Un mail envoyé à une nouvelle demande : elle est prise en main. */
          onEnvoye={() => { signalerMaj(); if (st.k === 'nouveau') void choisir('en_cours'); }} />
      )}
    </article>
  );
}

/* ── « Créer la fiche contact ? » ──────────────────────────────────────────
   La question avant la fenêtre Nouveau contact : ce qui sera repris de la
   demande, et les contacts qui lui ressemblent déjà (même e-mail, même
   téléphone, même nom) — pour relier la demande au lieu de créer un double. */
type ContactProche = { id: string; prenom: string; nom: string; reference: string | null; pourquoi: string };
type LigneContact = { id: string; prenom: string | null; nom: string | null; reference: string | null; emails: string[] | null; telephones: string[] | null };

/* Les 9 derniers chiffres : « 06 12… », « +33 6 12… » et « 0612… » se valent. */
const finTel = (t: unknown) => String(t ?? '').replace(/\D/g, '').slice(-9);

function QuestionContact({ d, onNon, onOui, onRelier }: {
  d: DemandeSite; onNon: () => void; onOui: () => void; onRelier: (c: ContactProche) => void;
}) {
  const pre = useMemo(() => preRemplissage(d), [d]);
  const cat = categorieDe(d.form_type);
  const type = pre.types[0] ? typeDe(pre.types[0]) : null;
  const [proches, setProches] = useState<ContactProche[] | null>(null);

  useEffect(() => {
    let vivant = true;
    (async () => {
      const { data, erreur } = await toutLire<LigneContact>((de, a) =>
        supabase.from('clients').select('id, prenom, nom, reference, emails, telephones').order('id').range(de, a));
      if (!vivant) return;
      if (erreur) { setProches([]); return; }
      const mail = pre.email.toLowerCase();
      const tel = finTel(pre.tel);
      const nom = normer(`${pre.prenom} ${pre.nom}`.trim());
      const nomInverse = normer(`${pre.nom} ${pre.prenom}`.trim());
      const out: ContactProche[] = [];
      for (const c of data) {
        const raisons: string[] = [];
        if (mail && (c.emails || []).some(e => String(e).trim().toLowerCase() === mail)) raisons.push('même e-mail');
        if (tel.length === 9 && (c.telephones || []).some(t => finTel(t) === tel)) raisons.push('même téléphone');
        const n = normer(`${c.prenom || ''} ${c.nom || ''}`.trim());
        if (pre.nom && n && (n === nom || n === nomInverse)) raisons.push('même nom');
        if (raisons.length) out.push({ id: c.id, prenom: c.prenom || '', nom: c.nom || '', reference: c.reference, pourquoi: raisons.join(' · ') });
      }
      setProches(out.slice(0, 4));
    })();
    return () => { vivant = false; };
  }, [pre]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onNon(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onNon]);

  const nomComplet = [pre.prenom, pre.nom].filter(Boolean).join(' ') || d.name || 'Sans nom';
  return (
    <>
      <div className={s.voileQuestion} onClick={onNon} aria-hidden="true" />
      <div className={s.question} role="dialog" aria-modal="true" aria-labelledby="question-contact">
        <div className={s.qTete}>
          <span className={s.qIc}><Ic n="personne" t={20} e={2} /></span>
          <div style={{ minWidth: 0 }}>
            <h3 id="question-contact" className={s.qTitre}>Créer la fiche contact ?</h3>
            <p className={s.qSous}>Ce que le client a donné est repris dans la fenêtre Nouveau contact. Vous le vérifiez avant d’enregistrer, et vous restez ici.</p>
          </div>
        </div>

        <div className={s.qApercu} style={teinte(cat)}>
          <span className={s.avatar} style={{ gridRow: 'auto', marginTop: 0 }}>{initiales(d.name)}</span>
          <div style={{ minWidth: 0 }}>
            <div className={s.qNom}>{nomComplet}</div>
            <div className={s.qPuces}>
              {type
                ? <span className={s.pastille} style={teinte({ c: type.c, fond: type.fond, trait: `${type.c}40` })}><span>{type.lib}</span></span>
                : <span className={`${s.pastille} ${s.pastilleRobot}`}>Type à choisir</span>}
              {pre.tel && <span className={`${s.pastille} ${s.pastilleRobot}`}><Ic n="telephone" t={12} e={2.2} /><span>{pre.tel}</span></span>}
              {pre.email && <span className={`${s.pastille} ${s.pastilleRobot}`}><Ic n="mail" t={12} e={2.2} /><span>{pre.email}</span></span>}
            </div>
            <div className={s.qSource}>{`Source : ${pre.origine} · la demande va dans ses notes${pre.criteres ? ', ses critères dans sa recherche' : ''}`}</div>
          </div>
        </div>

        {proches === null ? (
          <div className={s.qCherche}>{'On regarde s’il est déjà dans vos contacts…'}</div>
        ) : proches.length > 0 && (
          <div className={s.qProches}>
            <div className={s.qProchesTitre}><Ic n="alarme" t={15} e={2} /><span>Déjà dans vos contacts ?</span></div>
            {proches.map(c => (
              <div key={c.id} className={s.qProche}>
                <span style={{ minWidth: 0 }}>
                  <b>{[c.prenom, c.nom].filter(Boolean).join(' ') || 'Sans nom'}</b>
                  <i>{[c.reference, c.pourquoi].filter(Boolean).join(' · ')}</i>
                </span>
                <button type="button" className={`${s.btn} ${s.btnPetit}`} onClick={() => onRelier(c)}>Relier la demande</button>
              </div>
            ))}
          </div>
        )}

        <div className={s.qPied}>
          <button type="button" className={s.btn} onClick={onNon}>Annuler</button>
          {/* V3.50 : pas avant d'avoir regardé s'il existe déjà (un clic
              rapide créait un double). */}
          <button type="button" className={`${s.btn} ${s.btnPlein}`} onClick={onOui} disabled={proches === null}>
            <Ic n="plus" t={16} e={2.4} /><span>{proches === null ? 'Vérification…' : proches.length ? 'Créer quand même' : 'Oui, créer le contact'}</span>
          </button>
        </div>
      </div>
    </>
  );
}
