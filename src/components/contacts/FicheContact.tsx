'use client';
import { useEffect, useState } from 'react';
import AvatarContact from './AvatarContact';
import Depliant from '@/components/shared/Depliant';
import { supabase, addJournal, type Client } from '@/lib/supabase';
import { conjointDe, nomFoyer } from '@/lib/foyer';
import { jetonEspace } from '@/lib/jeton';
import {
  aUnBien, colonneContactAbsente, estAcheteur, estArchive, estPro, ligneContact, lirePro, lireStructure, structurePropre, typeDe, typesDe,
  type InfosPro, type TypeContact,
} from '@/lib/contacts';
import { Ic } from '@/components/documents/ApercuActe';
import FicheClient, { Coordonnees, type Coord } from '@/components/fiche/FicheClient';
import { BiensDuContact, ChampsPro, ChoixTypes, TypesEnLigne } from './ChampsContact';
import DocumentsDuClient from '@/components/documents/DocumentsDuClient';
import FriseSuivi from '@/components/fiche/FriseSuivi';
import { colonneSourceAbsente, libelleSource, MESSAGE_SQL_SOURCE } from '@/lib/sources';
import FenetreAction, { supprimerActionContact } from './FenetreAction';
import CarteASavoir from './CarteASavoir';
import BlocSociete from './BlocSociete';
import BoutonCarte from '@/components/carte/BoutonCarte';
import ChoixSource from './ChoixSource';
import { avantMandat, etapeDe, lirePhotos, titreBien } from '@/lib/biens-vente';
import { euros } from '@/lib/mandat';
import { demanderNouveauBien, demanderOngletBien } from '@/lib/intentions';
import { Horloge, LigneTuiles, Tuile, Tuiles } from '@/components/shared/Tuiles';
import { libelleVisites } from '@/lib/visites';
import c from './Contacts.module.css';

/* ═══ La fiche d'un contact qui n'est pas acheteur ═════════════════════════
   Un vendeur, un propriétaire, un notaire, un confrère, un gardien, un
   partenaire n'ont ni recherche, ni veille, ni espace : leur fiche dit qui
   ils sont, comment les joindre, ce qui est propre à leur métier, leurs biens
   (rubrique Biens) et tes notes. « Il cherche aussi à acheter » lui ouvre une
   recherche : il passe alors sur la fiche d'acheteur, complète.

   FicheSelonType choisit : un acheteur a la fiche d'acheteur (FicheClient),
   les autres celle-ci. */

type Nav = (page: string, data?: unknown) => void;

export default function FicheSelonType({ client, onBack, onNavigate }: { client: Client; onBack: () => void; onNavigate: Nav }) {
  /* La recherche de la barre du haut n'envoie qu'une partie de la fiche : on
     relit la ligne entière avant de choisir. */
  const partiel = !client.created_at;
  const [plein, setPlein] = useState<Client | null>(null);
  useEffect(() => {
    if (!partiel) return;
    let vivant = true;
    supabase.from('clients').select('*').eq('id', client.id).maybeSingle().then(({ data }) => { if (vivant && data) setPlein(data as Client); });
    return () => { vivant = false; };
  }, [client.id, partiel]);
  const x = partiel ? (plein?.id === client.id ? plein : null) : client;
  if (!x) return <div style={{ padding: '40px 24px', color: '#64748b', fontSize: 14 }}>Chargement de la fiche…</div>;
  return estAcheteur(x)
    ? <FicheClient client={x} onBack={onBack} onNavigate={onNavigate} />
    : <FicheContact key={x.id} client={x} onBack={onBack} onNavigate={onNavigate} />;
}

/* Un vendeur, un propriétaire peuvent être un couple (src/lib/foyer.ts) :
   la personne 2 a son nom, son e-mail, son téléphone. */
type Form = {
  types: TypeContact[]; civilite: string; prenom: string; nom: string;
  tel1: string; tel2: string; email1: string; email2: string; adresse: string; pro: InfosPro;
  couple: boolean; c2_civilite: string; c2_prenom: string; c2_nom: string; c2_email: string; c2_tel: string;
  source: string; source_detail: string;
};
/* D'où vient le contact (V3.23, outils/sql/source-contact.sql). */
type AvecSource = { source?: string | null; source_detail?: string | null };
const formDe = (x: Client): Form => {
  const j = conjointDe(x.conjoint);
  return {
    types: typesDe(x), civilite: x.civilite || '', prenom: x.prenom || '', nom: x.nom || '',
    tel1: x.telephones?.[0] || '', tel2: x.telephones?.[1] || '', email1: x.emails?.[0] || '', email2: x.emails?.[1] || '',
    adresse: x.adresse || '', pro: lirePro(x.pro),
    couple: !!x.couple, c2_civilite: j?.civilite || '', c2_prenom: j?.prenom || '', c2_nom: j?.nom || '', c2_email: j?.email || '', c2_tel: j?.telephone || '',
    source: (x as AvecSource).source || '', source_detail: (x as AvecSource).source_detail || '',
  };
};

function Li({ ic, l, v }: { ic: string; l: string; v?: string | null }) {
  if (!v) return null;
  return <div className={c.li}><span><i className={c.liIc}><Ic n={ic} t={14} /></i>{l}</span><b>{v}</b></div>;
}

/* ═══ Le bandeau d'un contact qui n'est pas acheteur (V3.32) ═════════════
   Alexandre : « pour l'acheteur tout est dans le bloc bleu ; pour un vendeur,
   un propriétaire, c'est assez vide ». Comme pour l'acheteur, sous le nom :
   ses chiffres et depuis quand on le suit. Un vendeur ou un propriétaire :
   ses biens, ceux en vente, les visites et les offres sur eux, puis chacun
   de ses biens en une ligne (étape, prix), un clic l'ouvre. Les autres
   (notaire, confrère, gardien…) : les échanges, les relances, le dernier
   échange et la prochaine relance. La société reste à droite du nom ; son
   détail, juste sous le bandeau — comme pour l'acheteur. Au niveau du
   module (AGENTS.md §2.4). */
type BienHero = { id: string; etape: string; titre: string | null; prix: number | null; photo?: string | null; donnees?: Record<string, unknown> | null };
const ECHANGES = ['appel', 'rdv', 'rdv_planifie', 'note', 'email_libre', 'envoi_externe', 'mail_envoye'];
const LIB_ECHANGE: Record<string, string> = { appel: 'Appel', rdv: 'Rendez-vous', rdv_planifie: 'Rendez-vous', note: 'Note', email_libre: 'E-mail', envoi_externe: 'Envoi', mail_envoye: 'E-mail' };
function dureeSuivi(j: number): string {
  if (j <= 0) return 'aujourd’hui';
  if (j === 1) return '1 jour';
  if (j < 45) return `${j} jours`;
  const mois = Math.round(j / 30.44);
  if (mois < 12) return `${mois} mois`;
  const ans = Math.floor(mois / 12), reste = mois % 12;
  return `${ans} an${ans > 1 ? 's' : ''}${reste ? ` et ${reste} mois` : ''}`;
}
const jourCourt = (iso: string) => new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
/* Les visites et les offres sur ses biens (V3.33) : le nombre, ce qui se
   dit en dessous (« dont 1 à venir », « en attente de réponse »), et bien
   par bien pour ouvrir le bon. */
type ActiviteVente = {
  /* Faites (la date est passée) et prévues : jamais « 3 visites » tout court (V3.33). */
  faites: number; prevues: number; derniereVisite: string | null; prochaineVisite: string | null;
  offres: number; enAttente: number; acceptee: number;
  parBien: Record<string, { f: number; p: number; o: number }>;
};
const VENTE_VIDE: ActiviteVente = { faites: 0, prevues: 0, derniereVisite: null, prochaineVisite: null, offres: 0, enAttente: 0, acceptee: 0, parBien: {} };
const pl = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/* Le bandeau (V3.33) : les tuiles (src/components/shared/Tuiles.tsx), puis
   une ligne discrète. Les biens d'un vendeur ont leur propre rang, sur toute
   la largeur du bandeau (BiensHero) : la colonne de gauche reste à la
   hauteur des coordonnées, et rien ne reste vide à droite ni en bas. */
function ActiviteHero({ proprio, biens, vente, journal, relances, creeLe, onBien, onSuivi }: {
  proprio: boolean; biens: BienHero[] | null; vente: ActiviteVente;
  journal: { type: string; created_at: string }[]; relances: { date_echeance: string; note: string | null }[];
  creeLe: string | null | undefined; onBien: (id: string, onglet?: string) => void; onSuivi: () => void;
}) {
  /* L'heure de l'affichage, lue une fois (un rendu reste pur). */
  const [maintenant] = useState(() => Date.now());
  const jours = creeLe ? Math.max(0, Math.floor((maintenant - Date.parse(creeLe)) / 86_400_000)) : null;
  const echanges = journal.filter(j => ECHANGES.includes(j.type));
  const dernier = echanges[0];
  const prochaine = relances[0];
  const liste = biens || [];
  const enVente = liste.filter(b => ['mandat', 'offre', 'compromis', 'suspendu'].includes(b.etape)).length;
  const versListe = () => document.getElementById('biens-hero')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  /* Un seul bien concerné : on l'ouvre, sur « Visites et offres » s'il a
     cet onglet (après le mandat) ; plusieurs : le rang de ses biens. */
  const ouvrirSur = (cle: 'v' | 'o') => {
    const concernes = liste.filter(b => (cle === 'v' ? (vente.parBien[b.id]?.f || 0) + (vente.parBien[b.id]?.p || 0) : vente.parBien[b.id]?.o || 0) > 0);
    if (concernes.length === 1) onBien(concernes[0].id, avantMandat(concernes[0].etape) ? undefined : 'visites');
    else versListe();
  };
  const sousBiens = !liste.length ? 'pas encore de bien'
    : liste.length === 1 ? etapeDe(liste[0].etape).lib
    : enVente === liste.length ? 'tous en vente'
    : enVente ? `dont ${enVente} en vente` : 'aucun en vente pour l’instant';
  const nbVisites = vente.faites + vente.prevues;
  const titreVisites = vente.faites ? pl(vente.faites, 'visite faite', 'visites faites') : vente.prevues ? pl(vente.prevues, 'visite prévue', 'visites prévues') : 'Aucune visite';
  const jourProchaine = vente.prochaineVisite ? jourCourt(vente.prochaineVisite) : '';
  const sousVisites = !nbVisites ? 'pour l’instant'
    : vente.faites && vente.prevues ? `+ ${pl(vente.prevues, 'prévue', 'prévues')}${jourProchaine ? `, ${vente.prevues > 1 ? 'la prochaine ' : ''}le ${jourProchaine}` : ''}`
    : vente.prevues ? (jourProchaine ? `${vente.prevues > 1 ? 'la prochaine ' : ''}le ${jourProchaine}` : 'à venir')
    : vente.derniereVisite ? `la dernière le ${jourCourt(vente.derniereVisite)}` : 'déjà faites';
  const sousOffres = !vente.offres ? 'pour l’instant'
    : vente.acceptee ? (vente.offres === 1 ? 'acceptée' : `dont ${vente.acceptee} acceptée${vente.acceptee > 1 ? 's' : ''}`)
    : vente.enAttente ? (vente.offres === 1 ? 'en attente de réponse' : `dont ${vente.enAttente} en attente`)
    : 'aucune en attente';
  return (
    <div className={c.activite}>
      {proprio ? (
        <Tuiles label="Son activité" grandit>
          <Tuile ic="maison" titre={liste.length ? pl(liste.length, 'bien', 'biens') : 'Aucun bien'} sous={sousBiens} vide={!liste.length}
            onClic={liste.length === 1 ? () => onBien(liste[0].id) : versListe} />
          <Tuile ic="cle" titre={titreVisites} sous={sousVisites} vide={!nbVisites} onClic={() => ouvrirSur('v')} />
          <Tuile ic="euro" titre={vente.offres ? pl(vente.offres, 'offre', 'offres') : 'Aucune offre'} sous={sousOffres} vide={!vente.offres} onClic={() => ouvrirSur('o')} />
        </Tuiles>
      ) : (
        <Tuiles label="Son activité" grandit>
          <Tuile ic="bulle" titre={echanges.length ? pl(echanges.length, 'échange', 'échanges') : 'Aucun échange'}
            sous={dernier ? `le dernier : ${(LIB_ECHANGE[dernier.type] || 'échange').toLowerCase()}, le ${jourCourt(dernier.created_at)}` : 'noté pour l’instant'} vide={!echanges.length} onClic={onSuivi} />
          <Tuile ic="calendrier" titre={relances.length ? pl(relances.length, 'relance à venir', 'relances à venir') : 'Aucune relance'}
            sous={prochaine ? `la prochaine le ${jourCourt(prochaine.date_echeance)}${prochaine.note ? ` · ${prochaine.note}` : ''}` : 'prévue pour l’instant'} vide={!relances.length} onClic={onSuivi} />
        </Tuiles>
      )}
      {/* Depuis quand on le suit : une ligne discrète, plus une tuile de plus. */}
      {jours !== null && (
        <LigneTuiles><Horloge fort={jours <= 0 ? 'Suivi depuis aujourd’hui' : `Suivi depuis ${dureeSuivi(jours)}`} doux={` · fiche créée le ${jourCourt(String(creeLe))}`} /></LigneTuiles>
      )}
    </div>
  );
}

/* Ses biens, sur toute la largeur du bandeau (V3.33) : côte à côte, à parts
   égales (un seul prend toute la place et dit tout sur une ligne). */
function BiensHero({ biens, vente, onBien, onCreerBien }: {
  biens: BienHero[]; vente: ActiviteVente; onBien: (id: string, onglet?: string) => void; onCreerBien: () => void;
}) {
  if (!biens.length) {
    return (
      <div className={c.biensRang} id="biens-hero">
        <button type="button" className={c.heroBienVide} onClick={onCreerBien}><Ic n="plus" t={14} e={2.4} /><span>Créer son bien : estimation, mandat, tout y est</span></button>
      </div>
    );
  }
  const montres = biens.length > 4 ? biens.slice(0, 3) : biens;
  return (
    <div className={`${c.biensRang} ${biens.length === 1 ? c.biensSeul : ''}`} id="biens-hero">
      {montres.map(b => {
        const e = etapeDe(b.etape);
        const d = (b.donnees || {}) as Record<string, unknown>;
        const photo = b.photo || lirePhotos(d.photos)[0]?.url || '';
        const n = vente.parBien[b.id];
        const activite = [libelleVisites(n?.f || 0, n?.p || 0), n?.o ? pl(n.o, 'offre', 'offres') : ''].filter(Boolean);
        /* Seul, il a la place : ses visites et offres en pastilles à droite.
           Côte à côte, elles suivent l'étape et le prix. */
        const seul = biens.length === 1;
        return (
          <button key={b.id} type="button" className={c.heroBien} onClick={() => onBien(b.id)} title="Ouvrir la fiche du bien">
            <span className={c.heroBienPh}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {photo ? <img src={photo} alt="" /> : <Ic n="maison" t={16} />}
            </span>
            <span className={c.heroBienTx}>
              <b>{b.titre || titreBien(d as Parameters<typeof titreBien>[0]) || 'Son bien'}</b>
              <small><i style={{ background: e.c }} />{`${e.lib}${b.prix ? ` · ${euros(b.prix)}` : ''}${!seul && activite.length ? ` · ${activite.join(' · ')}` : ''}`}</small>
            </span>
            {seul && activite.length > 0 && <span className={c.heroBienAct}>{activite.map(a => <em key={a}>{a}</em>)}</span>}
            <Ic n="droite" t={14} e={2.2} />
          </button>
        );
      })}
      {biens.length > 4 && (
        <button type="button" className={`${c.heroBien} ${c.heroBienPlus}`} onClick={() => document.getElementById('ses-biens')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <span className={c.heroBienTx}><b>{`+ ${biens.length - 3} autres biens`}</b><small>dans « Ses biens », plus bas</small></span>
          <Ic n="bas" t={14} e={2.2} />
        </button>
      )}
    </div>
  );
}

function FicheContact({ client: depart, onBack, onNavigate }: { client: Client; onBack: () => void; onNavigate: Nav }) {
  const [x, setX] = useState<Client>(depart);
  const [edit, setEdit] = useState<Form | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  /* « Sa société » ouverte depuis le bandeau, avant qu'elle soit notée (V3.31). */
  const [societeOuverte, setSocieteOuverte] = useState(false);
  /* Chaque « Ajouter » repart d'un formulaire neuf (le bloc reste monté, V3.32). */
  const [cleSoc, setCleSoc] = useState(0);
  /* Le suivi (V3.23) : tout le journal du contact, et ses relances en attente.
     Un contact qui n'est pas acheteur n'a pas de recherche : tout est sur
     `client_id`, `recherche_id` vide. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [journal, setJournal] = useState<any[]>([]);
  const [relances, setRelances] = useState<{ id: string; date_echeance: string; note: string | null; recherche_id?: string | null }[]>([]);
  const [filtre, setFiltre] = useState('tout');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [action, setAction] = useState<{ edition: any | null; type: 'note' | 'appel' } | null>(null);
  const [tour, setTour] = useState(0);
  const types = typesDe(x);
  const pro = lirePro(x.pro);
  const jur = pro.juridique && typeof pro.juridique === 'object' ? pro.juridique : null;
  const principal = typeDe(types[0]);
  const archive = estArchive(x);
  const proprio = aUnBien(typesDe(x));
  const ouvrirBien = (id: string, onglet?: string) => { if (onglet) demanderOngletBien(id, onglet); onNavigate('biens', { bien: id }); };

  /* Ses biens, et les visites et offres sur eux : le bandeau (V3.32). */
  const [biensH, setBiensH] = useState<BienHero[] | null>(null);
  const [vo, setVo] = useState<ActiviteVente>(VENTE_VIDE);
  useEffect(() => {
    let vivant = true;
    (async () => {
      const { data, error } = await supabase.from('biens_vente').select('*').eq('client_id', depart.id).order('updated_at', { ascending: false });
      if (!vivant) return;
      const l = (error ? [] : data || []) as (BienHero & { archive?: boolean | null })[];
      setBiensH(l.filter(b => !b.archive));
      if (!l.length) return;
      const { data: sv } = await supabase.from('biens_vente_suivi').select('bien_id, type, statut, le').in('bien_id', l.map(b => b.id)).in('type', ['visite', 'offre']);
      if (!vivant) return;
      const rows = (sv || []) as { bien_id: string; type: string; statut: string | null; le: string | null }[];
      const visites = rows.filter(r => r.type === 'visite' && r.statut !== 'annulee');
      const offres = rows.filter(r => r.type === 'offre');
      /* Faite : marquée faite, ou sa date est passée (comme la fiche du bien).
         Prévue : à venir, et pas encore passée. */
      const maintenant = Date.now();
      const passee = (r: { statut: string | null; le: string | null }) => r.statut === 'faite' || (!!r.le && Date.parse(r.le) < maintenant);
      const faites = visites.filter(passee);
      const prevues = visites.filter(r => !passee(r));
      const datesF = faites.filter(r => r.le).map(r => String(r.le)).sort();
      const datesP = prevues.filter(r => r.le).map(r => String(r.le)).sort();
      const parBien: ActiviteVente['parBien'] = {};
      const de = (id: string) => parBien[id] || (parBien[id] = { f: 0, p: 0, o: 0 });
      for (const r of faites) de(r.bien_id).f++;
      for (const r of prevues) de(r.bien_id).p++;
      for (const r of offres) de(r.bien_id).o++;
      setVo({
        faites: faites.length, prevues: prevues.length, derniereVisite: datesF[datesF.length - 1] || null, prochaineVisite: datesP[0] || null,
        offres: offres.length, enAttente: offres.filter(r => r.statut === 'en_attente' || r.statut === 'contre').length, acceptee: offres.filter(r => r.statut === 'acceptee').length,
        parBien,
      });
    })();
    return () => { vivant = false; };
  }, [depart.id]);
  useEffect(() => {
    let vivant = true;
    supabase.from('journal').select('*').eq('client_id', depart.id).order('created_at', { ascending: false })
      .then(({ data }) => { if (vivant) setJournal(data || []); });
    supabase.from('relances').select('id, date_echeance, note, recherche_id').eq('client_id', depart.id).eq('statut', 'en_attente')
      .order('date_echeance', { ascending: true })
      .then(({ data }) => { if (vivant) setRelances(data || []); });
    return () => { vivant = false; };
  }, [depart.id, tour]);
  const recharger = () => setTour(t => t + 1);

  async function ecrire(patch: Record<string, unknown>, quoi: string): Promise<Client | null> {
    setErreur('');
    const { data, error } = await supabase.from('clients').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', x.id).select().single();
    if (error) {
      setErreur(colonneContactAbsente(error.message) ? 'Lance d’abord outils/sql/types-contact.sql dans Supabase : les types de contact n’y sont pas encore.' : `${quoi} : ${error.message}`);
      return null;
    }
    setX(data as Client);
    return data as Client;
  }

  async function enregistrer() {
    if (!edit) return;
    if (!edit.prenom.trim() && !edit.nom.trim()) { setErreur('Écris au moins un prénom ou un nom.'); return; }
    if (!edit.types.length) { setErreur('Choisis au moins un type.'); return; }
    const couple = edit.couple && !estPro(edit.types);
    if (couple && !edit.c2_prenom.trim() && !edit.c2_nom.trim()) { setErreur('Écris au moins le prénom ou le nom de la personne 2.'); return; }
    setOccupe(true);
    /* Les colonnes du couple ne s'écrivent que si elles servent : avant le SQL
       « signature-plusieurs », elles n'existent pas. */
    const foyer = 'couple' in x || couple
      ? {
        couple, conjoint: couple ? {
          ...(conjointDe(x.conjoint) || {}), civilite: edit.c2_civilite, prenom: edit.c2_prenom.trim(), nom: edit.c2_nom.trim(),
          email: edit.c2_email.trim().toLowerCase(), telephone: edit.c2_tel.trim(),
        } : null,
      }
      : {};
    const r = await ecrire({
      types: edit.types, civilite: edit.civilite || null, prenom: edit.prenom.trim(), nom: edit.nom.trim(),
      telephones: [edit.tel1, edit.tel2].map(s => s.trim()).filter(Boolean), emails: [edit.email1, edit.email2].map(s => s.trim().toLowerCase()).filter(Boolean),
      adresse: edit.adresse.trim() || null, pro: structurePropre(edit.pro), ...foyer,
    }, 'La fiche n’a pas pu être enregistrée');
    if (!r) { setOccupe(false); return; }
    /* La source s'écrit à part, et seulement si elle a changé : avant le SQL
       « source-contact », la colonne n'existe pas et le reste doit passer. */
    const avant = x as AvecSource;
    if ((avant.source || '') !== edit.source || (avant.source_detail || '') !== edit.source_detail.trim()) {
      const src = { source: edit.source || null, source_detail: edit.source ? (edit.source_detail.trim() || null) : null };
      const { error: eSrc } = await supabase.from('clients').update(src).eq('id', x.id);
      if (eSrc) { setOccupe(false); setErreur(colonneSourceAbsente(eSrc.message) ? MESSAGE_SQL_SOURCE : `La source : ${eSrc.message}`); return; }
      setX({ ...r, ...src } as Client);
    }
    setOccupe(false);
    setEdit(null);
    /* Devenu acheteur : il passe sur la fiche d'acheteur. */
    if (estAcheteur(r)) onNavigate('fiche', r);
  }

  /* Il cherche aussi à acheter : une recherche vide, et la fiche d'acheteur. */
  async function ouvrirRecherche() {
    setOccupe(true); setErreur('');
    const { error } = await supabase.from('recherches').insert({ client_id: x.id, nom: 'Recherche principale', token_espace: jetonEspace(x.prenom, x.nom), active: true, secteurs: [] });
    if (error) { setErreur('La recherche n’a pas pu être créée : ' + error.message); setOccupe(false); return; }
    const r = await ecrire({ types: ['acheteur', ...types.filter(t => t !== 'acheteur')], statut: 'prospect' }, 'Le type n’a pas pu être changé');
    await addJournal(x.id, 'creation', 'Recherche ouverte', 'Il cherche aussi à acheter');
    setOccupe(false);
    if (r) onNavigate('fiche', r);
  }

  async function supprimer() {
    if (!confirm(`Supprimer ${nomFoyer(x)} de tes contacts ?\n\nC’est définitif. Pour le garder sans le voir, archive-le plutôt.`)) return;
    setOccupe(true);
    const { error } = await supabase.from('clients').delete().eq('id', x.id);
    setOccupe(false);
    if (error) { setErreur('Le contact n’a pas pu être supprimé : ' + error.message + (/foreign key|violates/i.test(error.message) ? ' (il est encore relié à un bien ou à un dossier).' : '')); return; }
    onBack();
  }

  const tels = (x.telephones || []).filter(Boolean), mails = (x.emails || []).filter(Boolean);
  const j2 = x.couple ? conjointDe(x.conjoint) : null;
  /* Les coordonnées dans le panneau crème, à droite, comme sur la fiche d'un
     acheteur (V3.32) : dans un couple, chaque ligne dit à qui elle est. */
  const civ1 = x.civilite || '', civ2 = j2?.civilite || '';
  const qui1 = j2 ? (civ1 && civ2 && civ1 !== civ2 ? civ1 : x.prenom || civ1 || 'Personne 1') : undefined;
  const qui2 = j2 ? (civ1 && civ2 && civ1 !== civ2 ? civ2 : j2.prenom || civ2 || 'Personne 2') : undefined;
  const coords: Coord[] = [
    ...tels.map(t => ({ k: 'tel' as const, val: t, qui: qui1 })),
    ...(j2?.telephone ? [{ k: 'tel' as const, val: j2.telephone, qui: qui2 }] : []),
    ...mails.map(m => ({ k: 'mail' as const, val: m, qui: qui1 })),
    ...(j2?.email ? [{ k: 'mail' as const, val: j2.email, qui: qui2 }] : []),
    ...(x.adresse ? [{ k: 'adresse' as const, val: x.adresse }] : []),
  ];
  const ligne = ligneContact(x);
  /* Une adresse que la carte peut placer : chez lui, son étude, son agence,
     son immeuble, ou le bien qu'il possède. */
  const aUneAdresse = [x.adresse, pro.adresseEtude, pro.adresseAgence, pro.immeuble, (x as unknown as { bien_actuel_adresse?: string | null }).bien_actuel_adresse]
    .some(v => typeof v === 'string' && v.trim().length > 4);
  const cls = { row: c.g2, group: c.ch, label: '', input: c.in };
  /* Sa société (V3.30) : pour un vendeur, un propriétaire, un contact sans
     métier ; pas pour un notaire ou un confrère, qui ont déjà la leur. */
  const structure = lireStructure(pro.structure);
  const peutSociete = !estPro(types) || aUnBien(types);
  /* V3.31 : juste sous le bandeau bleu (et non plus en bas de la fiche),
     dès qu'elle est notée ; sinon « Sa société (SCI…) » dans le bandeau
     l'ouvre là, prête à remplir. */
  const societe = (
    <BlocSociete key={cleSoc} client={x} notes={x.notes} ouvrir={societeOuverte} onFermer={() => setSocieteOuverte(false)}
      onEnregistrer={async st => !!(await ecrire({ pro: { ...pro, structure: st || undefined } }, 'La société n’a pas pu être enregistrée'))}
      onFiche={cl => onNavigate('fiche', cl)} />
  );

  return (
    <div className={c.fiche}>
      <div className={c.barre}>
        <button type="button" className={c.retour} onClick={onBack}><Ic n="retour" t={16} />Contacts</button>
        <div className={c.actions}>
          {types.includes('confrere') && (
            <button type="button" className={`${c.btn} ${c.btnOr}`} onClick={() => onNavigate('documents', { delegation: x.id })}><Ic n="accord" t={15} />Déléguer un mandat</button>
          )}
          <button type="button" className={c.btn} onClick={() => { setErreur(''); setEdit(formDe(x)); }}><Ic n="crayon" t={15} />Modifier</button>
          <button type="button" className={`${c.btn} ${c.masquable}`} disabled={occupe} onClick={() => ecrire({ archive: !archive }, 'Le contact n’a pas pu être archivé')}>
            <Ic n="archive" t={15} />{archive ? 'Sortir des archives' : 'Archiver'}
          </button>
          <button type="button" className={`${c.btn} ${c.btnDanger}`} disabled={occupe} onClick={supprimer} aria-label="Supprimer ce contact"><Ic n="corbeille" t={15} /></button>
        </div>
      </div>

      <div className={`${c.hero} ${c.heroAvecCo}`}>
        <div className={c.heroG}>
        <div className={c.heroQui}>
          <AvatarContact c={x} teinte={{ bg: '', fg: '#e0c36e' }} className={c.heroAv} libre />
          <div className={c.heroTxt}>
            {/* « Il agit pour une société ? » à droite du nom (V3.32) : une ligne de moins. */}
            <div className={c.heroNomL}>
              <h1 className={c.heroNom}>{nomFoyer(x) || 'Sans nom'}</h1>
              {peutSociete && structure && (
                <span className={c.heroSocOk}><Ic n="immeuble" t={13} /><span>{'Pour '}<b>{structure.denomination || 'une société'}</b>{structure.qualite ? ` · ${structure.qualite.split(/[,(]/)[0].trim()}` : ''}</span></span>
              )}
              {peutSociete && !structure && !societeOuverte && (
                <button type="button" className={c.heroSoc} onClick={() => { setCleSoc(k => k + 1); setSocieteOuverte(true); }}>
                  <Ic n="immeuble" t={13} />{`${x.civilite === 'Madame' ? 'Elle' : 'Il'} agit pour une société ?`}<b>Ajouter</b>
                </button>
              )}
            </div>
            <TypesEnLigne client={x} sombre onMaj={t => { const n = { ...x, types: t } as Client; setX(n); if (t.includes('acheteur')) onNavigate('fiche', n); }} />
            {/* La société est déjà dite à droite du nom : la ligne ne la répète pas. */}
            {ligne && !(peutSociete && structure?.denomination && ligne.includes(structure.denomination)) && <div className={c.heroLigne}>{ligne}</div>}
            {libelleSource((x as AvecSource).source, (x as AvecSource).source_detail) && (
              <div className={c.heroSource}><Ic n="drapeau" t={13} /><span>{'Source : '}<b>{libelleSource((x as AvecSource).source, (x as AvecSource).source_detail)}</b></span></div>
            )}
          </div>
        </div>
        <ActiviteHero proprio={proprio} biens={biensH} vente={vo}
          journal={journal} relances={relances} creeLe={x.created_at} onBien={ouvrirBien}
          onSuivi={() => document.getElementById('suivi-contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        </div>
        <Coordonnees coords={coords} onModifier={() => { setErreur(''); setEdit(formDe(x)); }}
          pied={aUneAdresse ? <BoutonCarte focus={`c:${x.id}`} onNavigate={onNavigate} /> : undefined} />
        {proprio && biensH && <BiensHero biens={biensH} vente={vo} onBien={ouvrirBien} onCreerBien={() => { demanderNouveauBien(x.id); onNavigate('biens'); }} />}
      </div>

      {/* Elle arrive en glissant quand on clique « Ajouter » (V3.32). */}
      {peutSociete && <Depliant ouvert={!!structure || societeOuverte} ecart={16}><div className={c.socHaut}>{societe}</div></Depliant>}

      {archive && <div className={c.archiveBandeau}>Ce contact est archivé : il n’apparaît plus dans la liste, seulement dans « Archivés ».</div>}
      {erreur && <div className={c.erreur}>{erreur}</div>}

      {/* V3.30 : « À savoir » en tête, sur toute la largeur, rangé en blocs
          et replié s'il est long ; dessous, les blocs de la fiche en grille.
          Avant, il était seul dans la colonne de droite : un long texte y
          faisait une colonne d'un mètre à côté de blocs courts. */}
      <CarteASavoir prenom={x.prenom || ''} texte={x.notes}
        onEnregistrer={async t => !!(await ecrire({ notes: t || null }, 'Les infos n’ont pas pu être enregistrées'))} />

      <div className={c.blocs}>
          {types.includes('confrere') && (
            <section className={c.bloc}>
              <div className={c.blocT}><span className={c.blocIc}><Ic n="agence" t={15} /></span><h3>Son agence</h3><button type="button" className={c.lien} onClick={() => setEdit(formDe(x))}>Modifier</button></div>
              <div className={c.lignes}>
                <Li ic="personne" l="Statut" v={pro.statutPro === 'mandataire' ? 'Mandataire' : pro.statutPro === 'independant' ? 'À son compte' : pro.statutPro === 'salarie' ? 'Salarié d’une agence' : ''} />
                <Li ic="agence" l="Agence" v={pro.agence} />
                <Li ic="groupe" l="Réseau" v={pro.reseau} />
                <Li ic="lieu" l="Adresse" v={pro.adresseAgence} />
                <Li ic="globe" l="Site" v={pro.siteWeb} />
              </div>
              {!pro.agence && !pro.statutPro && <div className={c.pied}>Son agence, son statut (salarié, mandataire, à son compte) : « Modifier » pour les noter.</div>}
              {/* Ce que sa dernière délégation a gardé (V3.19). */}
              {jur?.le && (
                <>
                  <div className={c.lignes} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #eef1f6' }}>
                    <Li ic="immeuble" l="Société" v={[jur.societe, jur.forme].filter(Boolean).join(', ')} />
                    <Li ic="doc" l="RCS" v={jur.rcs} />
                    <Li ic="carte" l="Carte professionnelle" v={[jur.carte, jur.cci ? `délivrée par ${jur.cci}` : ''].filter(Boolean).join(', ')} />
                    <Li ic="bouclier" l="Garantie financière" v={jur.fonds === 'aucun' ? 'Ne détient aucuns fonds' : jur.garant} />
                    <Li ic="balance" l="Assurance (RCP)" v={jur.rcp} />
                  </div>
                  <div className={c.pied}>{`Repris de sa délégation du ${new Date(jur.le + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}, et remis à jour à chaque délégation finalisée.`}</div>
                </>
              )}
            </section>
          )}
          {/* Ses délégations, et « Déléguer un mandat » (V3.19). */}
          {types.includes('confrere') && <DocumentsDuClient clientId={x.id} prenom={x.prenom} onNavigate={onNavigate} confrere />}
          {types.includes('notaire') && (
            <section className={c.bloc}>
              <div className={c.blocT}><span className={c.blocIc}><Ic n="balance" t={15} /></span><h3>Son étude</h3><button type="button" className={c.lien} onClick={() => setEdit(formDe(x))}>Modifier</button></div>
              <div className={c.lignes}>
                <Li ic="balance" l="Étude" v={pro.etude} />
                <Li ic="lieu" l="Adresse" v={pro.adresseEtude} />
                <Li ic="personne" l="Clerc ou assistant(e)" v={pro.clerc} />
                <Li ic="telephone" l="Son téléphone" v={pro.clercTel} />
              </div>
              {!pro.etude && !pro.adresseEtude && <div className={c.pied}>L’étude, son adresse, le clerc : « Modifier » pour les noter.</div>}
            </section>
          )}
          {types.includes('gardien') && (
            <section className={c.bloc}>
              <div className={c.blocT}><span className={c.blocIc}><Ic n="immeuble" t={15} /></span><h3>L’immeuble</h3><button type="button" className={c.lien} onClick={() => setEdit(formDe(x))}>Modifier</button></div>
              <div className={c.lignes}>
                <Li ic="immeuble" l="Immeuble" v={pro.immeuble} />
                <Li ic="horloge" l="Horaires de la loge" v={pro.horaires} />
                <Li ic="cle" l="Accès, clés" v={pro.acces} />
              </div>
              {!pro.immeuble && <div className={c.pied}>L’immeuble, les horaires de la loge : « Modifier » pour les noter.</div>}
            </section>
          )}
          {types.includes('partenaire') && (
            <section className={c.bloc}>
              <div className={c.blocT}><span className={c.blocIc}><Ic n="outil" t={15} /></span><h3>Son activité</h3><button type="button" className={c.lien} onClick={() => setEdit(formDe(x))}>Modifier</button></div>
              <div className={c.lignes}>
                <Li ic="outil" l="Métier" v={pro.metier} />
                <Li ic="agence" l="Société" v={pro.societe} />
              </div>
              {!pro.metier && <div className={c.pied}>Son métier, sa société : « Modifier » pour les noter.</div>}
            </section>
          )}
          {aUnBien(types) && (
            <div id="ses-biens"><BiensDuContact clientId={x.id} prenom={x.prenom} onNavigate={onNavigate} toujours ouvertAuDebut /></div>
          )}
          {/* Ses documents : mandats, avenants… signés ou en cours (V3.17). */}
          {(!estPro(types) || aUnBien(types)) && (
            <DocumentsDuClient clientId={x.id} prenom={x.prenom} onNavigate={onNavigate} />
          )}
          {!estPro(types) || aUnBien(types) ? (
            <div className={c.aussi}>
              <span className={c.blocIc} style={{ width: 36, height: 36 }}><Ic n="cible" t={17} /></span>
              <div><b>Il cherche aussi à acheter ?</b>Ouvre-lui une recherche : il passe sur la fiche d’acheteur, avec son espace et la veille.</div>
              <button type="button" className={`${c.btn} ${c.btnOr}`} disabled={occupe} onClick={ouvrirRecherche}>Ouvrir une recherche</button>
            </div>
          ) : null}
      </div>
      <div className={c.refPied}>{`${principal.lib} · ${x.reference}`}</div>

      {(() => {
        /* Le suivi (V3.23) : la frise des acheteurs, sans Veille ni Sélection.
           Appels, rendez-vous, notes, envois ; le reste (contact créé, types
           changés…) en lignes discrètes. */
        const GR: Record<string, string[]> = { appel: ['appel'], rdv: ['rdv', 'rdv_planifie'], note: ['note'], communications: ['email_libre', 'envoi_externe', 'mail_envoye'] };
        const manuels = Object.values(GR).flat();
        const items = journal.map(j => ({ kind: 'event' as const, ts: j.created_at as string, data: j }));
        const vus = filtre === 'tout' ? items
          : filtre === 'systeme' ? items.filter(i => !manuels.includes(i.data.type))
            : items.filter(i => (GR[filtre] || []).includes(i.data.type));
        const comptes: Record<string, number> = { tout: items.length, systeme: items.filter(i => !manuels.includes(i.data.type)).length };
        for (const [k, t] of Object.entries(GR)) comptes[k] = items.filter(i => t.includes(i.data.type)).length;
        return (
          <section id="suivi-contact" className={c.suiviBande}>
            <div className={c.suiviTete}><b>Le suivi</b><span>{`tout ce qui s’est passé avec ${x.prenom || 'ce contact'}`}</span></div>
            <div className={c.suiviCorps}>
              <FriseSuivi titre="Historique" filtresVisibles={['tout', 'appel', 'rdv', 'note', 'communications', 'systeme']}
                items={vus} filtre={filtre} comptes={comptes} onFiltre={setFiltre}
                aVenir={relances} relancesAtt={relances} biens={[]} nomAutreRecherche={() => null} surligne={null}
                modifiable={j => ['appel', 'rdv', 'note', 'email_libre', 'envoi_externe', 'relance_manuelle'].includes(j.type)}
                onModifier={j => setAction({ edition: j, type: 'note' })}
                onSupprimer={async j => { if (await supprimerActionContact(j, x.id)) recharger(); }}
                onAjouter={() => setAction({ edition: null, type: 'note' })}
                onAppel={() => setAction({ edition: null, type: 'appel' })} />
            </div>
          </section>
        );
      })()}

      {action && (
        <FenetreAction clientId={x.id} prenom={x.prenom || ''} edition={action.edition} typeInitial={action.type}
          onFermer={() => setAction(null)} onFait={() => { setAction(null); recharger(); }} />
      )}

      {edit && (
        <div className={c.fen} onClick={e => { if (e.target === e.currentTarget && !occupe) setEdit(null); }}>
          <div className={c.fenIn} role="dialog" aria-modal="true" aria-label="Modifier le contact">
            <div className={c.fenTete}>
              <h3>{`Modifier ${nomFoyer(x) || 'le contact'}`}</h3>
              <button type="button" className={c.btn} onClick={() => setEdit(null)} aria-label="Fermer" disabled={occupe}>✕</button>
            </div>
            <div className={c.fenCorps}>
              <div className={c.groupe}>
                <div className={c.groupeT}>Ce contact est…</div>
                <ChoixTypes v={edit.types} onChange={t => setEdit({ ...edit, types: t })} />
                {edit.types.includes('acheteur') && <div className={c.typesNote}>Acheteur : en enregistrant, sa fiche d’acheteur s’ouvre. Pense à lui ouvrir une recherche (« Il cherche aussi à acheter »).</div>}
              </div>
              <div className={c.groupe}>
                <div className={c.groupeT}>{edit.couple && !estPro(edit.types) ? 'Personne 1 · contact principal' : 'Qui, et comment le joindre'}</div>
                <div className={c.pills}>
                  {['Monsieur', 'Madame'].map(v => <button key={v} type="button" className={`${c.pill} ${edit.civilite === v ? c.pillOn : ''}`} onClick={() => setEdit({ ...edit, civilite: edit.civilite === v ? '' : v })}>{v}</button>)}
                  {/* Un vendeur ou un propriétaire peut être un couple. */}
                  {!estPro(edit.types) && <button type="button" className={`${c.pill} ${edit.couple ? c.pillOn : ''}`} onClick={() => setEdit({ ...edit, couple: !edit.couple })}>{edit.couple ? '✓ Un couple' : '+ Un couple'}</button>}
                </div>
                <div className={c.g2}>
                  <label className={c.ch}><span>Prénom</span><input className={c.in} value={edit.prenom} onChange={e => setEdit({ ...edit, prenom: e.target.value })} /></label>
                  <label className={c.ch}><span>Nom</span><input className={c.in} value={edit.nom} onChange={e => setEdit({ ...edit, nom: e.target.value })} /></label>
                  <label className={c.ch}><span>Téléphone</span><input className={c.in} value={edit.tel1} onChange={e => setEdit({ ...edit, tel1: e.target.value })} /></label>
                  <label className={c.ch}><span>E-mail</span><input className={c.in} type="email" value={edit.email1} onChange={e => setEdit({ ...edit, email1: e.target.value })} /></label>
                  <label className={c.ch}><span>Autre téléphone</span><input className={c.in} value={edit.tel2} onChange={e => setEdit({ ...edit, tel2: e.target.value })} /></label>
                  <label className={c.ch}><span>Autre e-mail</span><input className={c.in} type="email" value={edit.email2} onChange={e => setEdit({ ...edit, email2: e.target.value })} /></label>
                </div>
                <label className={c.ch}><span>Adresse</span><input className={c.in} value={edit.adresse} onChange={e => setEdit({ ...edit, adresse: e.target.value })} /></label>
              </div>
              {edit.couple && !estPro(edit.types) && (
                <div className={c.groupe}>
                  <div className={c.groupeT}>Personne 2</div>
                  <div className={c.pills}>
                    {['Monsieur', 'Madame'].map(v => <button key={v} type="button" className={`${c.pill} ${edit.c2_civilite === v ? c.pillOn : ''}`} onClick={() => setEdit({ ...edit, c2_civilite: edit.c2_civilite === v ? '' : v })}>{v}</button>)}
                  </div>
                  <div className={c.g2}>
                    <label className={c.ch}><span>Prénom</span><input className={c.in} value={edit.c2_prenom} onChange={e => setEdit({ ...edit, c2_prenom: e.target.value })} /></label>
                    <label className={c.ch}><span>Nom</span><input className={c.in} value={edit.c2_nom} onChange={e => setEdit({ ...edit, c2_nom: e.target.value })} /></label>
                    <label className={c.ch}><span>Téléphone</span><input className={c.in} value={edit.c2_tel} onChange={e => setEdit({ ...edit, c2_tel: e.target.value })} /></label>
                    <label className={c.ch}><span>E-mail</span><input className={c.in} type="email" value={edit.c2_email} onChange={e => setEdit({ ...edit, c2_email: e.target.value })} /></label>
                  </div>
                </div>
              )}
              <ChampsPro types={edit.types} pro={edit.pro} onChange={p => setEdit({ ...edit, pro: p })} cls={cls} />
              <div className={c.groupe}>
                <div className={c.groupeT}>{'D’où vient ce contact ?'}<em className={c.facult} style={{ textTransform: 'none', letterSpacing: 0 }}>{' · facultatif'}</em></div>
                <ChoixSource source={edit.source} detail={edit.source_detail} onChange={(so, de) => setEdit({ ...edit, source: so, source_detail: de })} />
              </div>
              {erreur && <div className={c.erreur}>{erreur}</div>}
            </div>
            <div className={c.fenPied}>
              <button type="button" className={c.btn} disabled={occupe} onClick={() => setEdit(null)}>Annuler</button>
              <button type="button" className={`${c.btn} ${c.btnOr}`} disabled={occupe} onClick={enregistrer}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
