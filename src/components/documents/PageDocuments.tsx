'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { toutLire } from '@/lib/registre';
import EnteteRubrique from '@/components/shared/EnteteRubrique';
import { CATEGORIES, MODELES, aujourdhui, jourLong, modele, electronique, type Categorie, type Donnees, type Statut } from '@/lib/actes';
import { Croix, Ic } from './ApercuActe';
import EditeurDocument from './EditeurDocument';
import { conseilMandat, mandatRechercheEnCours, mandatVenteEnCours, phraseMandat } from '@/lib/coherence';
import NouveauDocument from './NouveauDocument';
import { BlocSignature } from './SignatureEnLigne';
import SignatureSurPlace from './SignatureSurPlace';
import { CarteHistorique, FenetreProjet, evenementsDocument } from './EnvoiProjet';
import { Pastille } from './DocumentsDuClient';
import { RAISONS_FIN, noterAnnulation, quandRegistre, registreAbsent, type RaisonFin } from '@/lib/registre';
import { retracteEnLigne } from '@/lib/documents-espace';
import { jourParis } from '@/lib/mandat';
import { bienConcerne, bienDuMandat } from '@/lib/mandat-bien';
import type { BienVente } from '@/lib/biens-vente';
import SuiteMandatBien from './SuiteMandatBien';
import SuiviSignature, { lireSuivis, type Suivi } from './SuiviSignature';
import { BarreOnglets, CorpsOnglet } from '@/components/shared/OngletsGlissants';
import FenetreSigne from './FenetreSigne';
import {
  CHANGE_ENTRE_TEMPS, apresAnnulation, appelSignature, avenantsDuMandat, avenantSuivant, colonnesListe, etatMandatEnLigne, exemplaireManquant, identiteDuJour, libStatut, lienFichier,
  mandatDepuis, nomFichier, preparerDepuis, quand, rappelExemplaire, retirerFichiers, tableAbsente,
  type DocumentRow, type MandatRecherche,
} from './outils';
import s from './Documents.module.css';

/* ═══ Documents juridiques ════════════════════════════════════════════════
   La rubrique : les modèles pour en créer un, puis tous les documents,
   filtrés par état (en haut) et par sorte (les pastilles). Un clic ouvre
   sa fiche, à droite, avec ce qu'on peut en faire selon son état.

   Les mandats de recherche en ligne vivent dans la fiche client (ils se
   signent depuis l'espace acheteur) : ils figurent ici aussi, en lecture,
   à côté des mandats de recherche signés sur papier. */

type Item = {
  cle: string;
  categorie: Categorie;
  statut: Statut;
  titre: string;
  sous: string;
  badge: string | null;
  date: string;
  doc?: DocumentRow;
  mandat?: MandatRecherche;
  /* Un courrier : « À envoyer », « Envoyé ». */
  courrier?: boolean;
  /* V3.50 : un mandat en ligne signé par une partie seulement : « En
     signature », comme sur la fiche client. V3.55 : aussi un document dont
     les liens sont partis. */
  enSignature?: boolean;
  /* V3.55 : signé à la main, son exemplaire signé pas encore déposé : la
     phrase du rappel. */
  aDeposer?: string;
};

const CAT_IC: Record<string, string> = { mandats_vente: 'maison', mandats_recherche: 'loupe', offres: 'euro', bons_visite: 'calendrier', courriers: 'boucle', delegations: 'accord' };

/* ═══ La liste rangée (V3.60) ═══════════════════════════════════════════
   Alexandre : « un onglet Signatures en cours, où tout se met quand une
   signature ou des signataires sont en attente ; puis dans Mandats de vente,
   Mandats de recherche… une sous-catégorie : brouillon, signature en cours,
   signé, que ce soit bien précisé et joli » ; « quand on passe d'un onglet à
   l'autre, c'est un peu brut : de la fluidité ».
   Une barre d'onglets qui glisse (OngletsGlissants, comme les fiches) :
   Signatures en cours · Tous · une par sorte. Dans « Tous » et
   dans chaque sorte, une seconde barre plus légère : Tous · Signature en
   cours · Brouillons · Signés · Annulés. Sur « Tous », les documents sont
   rangés en groupes titrés ; ailleurs, la liste seule. Les tuiles d'état du
   bandeau sont parties : elles faisaient la même chose que cette barre. */
type Vue = 'encours' | 'tout' | Categorie;
type Etat = 'encours' | 'brouillon' | 'signe' | 'annule';
type SousVue = 'tout' | Etat;
const ORDRE_ETATS: Etat[] = ['encours', 'brouillon', 'signe', 'annule'];
const VUES: Vue[] = ['encours', 'tout', ...CATEGORIES.map(c => c.id)];
const SOUS_VUES: SousVue[] = ['tout', ...ORDRE_ETATS];
const IC_ETAT: Record<SousVue, string> = { tout: 'liste', encours: 'plume', brouillon: 'crayon', signe: 'check', annule: 'croix' };
/* « À faire signer » et « en signature » sont un même état : la signature
   n'est pas finie. Un courrier, lui, est « à envoyer ». */
const etatDe = (it: Item): Etat => (it.statut === 'pret' ? 'encours' : it.statut);
function libEtat(k: SousVue, courriers: boolean): string {
  if (k === 'tout') return 'Tous';
  if (k === 'encours') return courriers ? 'À envoyer' : 'Signature en cours';
  if (k === 'brouillon') return 'Brouillons';
  if (k === 'signe') return courriers ? 'Envoyés' : 'Signés';
  return 'Annulés';
}

/* Le titre d'un groupe de la liste : un point de couleur, le nom, le nombre,
   et une phrase discrète. */
function TeteGroupe({ g, titre, n, aide }: { g: string; titre: string; n: number; aide?: string }) {
  return (
    <div className={s.grT} data-g={g}>
      <b>{titre}</b>
      <i>{n}</i>
      {aide && <small>{aide}</small>}
    </div>
  );
}

function itemDoc(d: DocumentRow): Item {
  /* V3.56 : un mandat auquel le client a renoncé en ligne, depuis son espace :
     « Annulé », et la ligne dit « rétracté » (comme un mandat signé en ligne
     dans l'espace puis rétracté). */
  const retracte = retracteEnLigne(d);
  const qr = retracte ? quand(retracte) : '';
  return {
    cle: d.id, categorie: d.categorie, statut: d.statut, titre: d.titre || 'Document sans titre',
    sous: [d.sous_titre, d.numero ? `N° ${d.numero}` : '',
      d.statut === 'pret' && d.signature ? (d.signature.mode === 'en_ligne' ? 'signature en ligne en cours' : 'signature sur place en cours') : '',
      retracte ? `rétracté en ligne par le client ${/^\d/.test(qr) ? `le ${qr}` : qr}` : ''].filter(Boolean).join(' · '),
    badge: d.badge, date: retracte || d.signe_le || d.finalise_le || d.updated_at, doc: d, courrier: !!modele(d.modele)?.courrier,
    /* V3.55 : les liens sont partis, ce n'est plus « à faire signer » (comme
       sur la fiche d'un client ou d'un bien). */
    enSignature: d.statut === 'pret' && !!d.signature,
    aDeposer: exemplaireManquant(d) ? rappelExemplaire(d) : undefined,
  };
}
function itemMandat(x: MandatRecherche, noms: Record<string, string>): Item {
  const nom = [x.mandant?.prenom, x.mandant?.nom].filter(Boolean).join(' ') || (x.client_id ? noms[x.client_id] : '') || 'Client';
  /* V3.50 : signé par une partie seulement, il attend encore une signature
     (il passait « Signé » ici, « En attente de signature » sur la fiche). */
  const statut = etatMandatEnLigne(x);
  return {
    cle: 'r-' + x.id, categorie: 'mandats_recherche', statut,
    titre: `Mandat de recherche · ${nom}`,
    sous: [x.numero ? `N° ${x.numero}` : '', x.statut === 'partiel' ? 'en ligne, une signature attendue' : x.statut === 'en_cours' ? 'en ligne, signature en cours' : 'signé en ligne'].filter(Boolean).join(' · '),
    badge: 'En ligne', date: x.retracte_le || x.signe_le || x.created_at, mandat: x,
    enSignature: !x.retracte_le && (x.statut === 'partiel' || x.statut === 'en_cours'),
  };
}

function Ligne({ it, on, onClick }: { it: Item; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`${s.ligne} ${on ? s.ligneOn : ''}`} onClick={onClick}>
      <span className={s.ligneIc}><Ic n={CAT_IC[it.categorie] || 'doc'} t={18} /></span>
      <span className={s.ligneTxt}>
        <span className={s.ligneT}>
          <b>{it.titre}</b>
          {it.badge && <span className={s.type}>{it.badge}</span>}
        </span>
        <span className={s.ligneS}>{it.sous || '—'}</span>
        {it.aDeposer && <span className={s.ligneDepot}><Ic n="trombone" t={12} /><span>{it.aDeposer}</span></span>}
        <span className={s.ligneMobile} style={{ display: 'none', marginTop: 6, gap: 8, alignItems: 'center' }}>
          <Pastille statut={it.statut} courrier={it.courrier} enSignature={it.enSignature} /><span style={{ fontSize: 11.5, color: '#94a3b8' }}>{quand(it.date)}</span>
        </span>
      </span>
      <span className={s.ligneMeta}>
        <Pastille statut={it.statut} courrier={it.courrier} enSignature={it.enSignature} />
        <span>{quand(it.date)}</span>
      </span>
    </button>
  );
}

/* ── « Marquer annulé » un mandat signé : pourquoi il s'arrête (V3.50) ──
   Le registre des mandats notait toujours « Annulé », même pour une
   rétractation ou une fin de mandat. On le demande, et le registre note
   Rétracté, Fin du mandat ou Annulé. */
const IC_RAISON: Record<RaisonFin, string> = { retracte: 'retour', fin: 'drapeau', annule: 'croix' };
function FenetreFinMandat({ vide, onFermer, onChoix }: { vide: boolean; onFermer: () => void; onChoix: (r: RaisonFin) => void }) {
  const [raison, setRaison] = useState<RaisonFin | null>(null);
  return (
    <div className={s.fenetre} onClick={e => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className={s.fenetreIn} role="dialog" aria-modal="true" aria-label="Le mandat s’arrête">
        <div className={s.fenTete}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h3>Le mandat s’arrête : pourquoi ?</h3>
            <p>Le registre des mandats le note tel quel. Une fois noté, ça ne se modifie plus.</p>
          </div>
          <button type="button" className={s.panFermer} aria-label="Fermer" onClick={onFermer}><Croix /></button>
        </div>
        <div className={s.fenCorps}>
          {(Object.keys(RAISONS_FIN) as RaisonFin[]).map(k => (
            <button key={k} type="button" className={`${s.choix} ${raison === k ? s.choixOn : ''}`} aria-pressed={raison === k} onClick={() => setRaison(k)}>
              <span className={`${s.suiteIc} ${raison === k ? s.suiteIcOn : ''}`}><Ic n={IC_RAISON[k]} t={17} /></span>
              <span><b>{RAISONS_FIN[k].l}</b><small>{RAISONS_FIN[k].aide}</small></span>
            </button>
          ))}
          <div className={s.note}>{`Il reste dans la liste, avec ses fichiers, marqué « Annulé ».${vide ? ' Le bloc Mandat de sa recherche sera vidé.' : ''}`}</div>
        </div>
        <div className={s.fenPied}>
          <button type="button" className={s.btn} onClick={onFermer}>Pas maintenant</button>
          <button type="button" className={`${s.btn} ${s.btnDanger}`} disabled={!raison} onClick={() => { if (raison) onChoix(raison); }}><Croix t={15} />Marquer annulé</button>
        </div>
      </div>
    </div>
  );
}

/* ── La fiche d'un document ── */
/* Un mandat de vente annulé ou supprimé dont le bien dépend encore (V3.42). */
type SuiteBien = { bien: BienVente; doc: DocumentRow; etaitSigne: boolean; supprime: boolean };

/* La fiche du bien dépend-elle encore de ce mandat de vente ? Rend de quoi
   ouvrir la question, ou null (pas de bien, bien non concerné, lecture
   impossible : rien ne bloque l'annulation elle-même). */
async function suiteBienDe(d: DocumentRow, etaitSigne: boolean, supprime: boolean): Promise<SuiteBien | null> {
  if (d.modele !== 'mandat_vente') return null;
  try {
    const bien = await bienDuMandat(supabase, d);
    return bien && bienConcerne(bien, d, etaitSigne) ? { bien, doc: d, etaitSigne, supprime } : null;
  } catch { return null; }
}

/* La question avant d'annuler un document (hors mandat signé : sa fenêtre). */
function questionAnnuler(d: DocumentRow, m: ReturnType<typeof modele>): string {
  if (d.statut === 'signe') {
    /* V3.50 : un avenant de recherche signé avait changé la fin du mandat ou
       les honoraires sur la recherche ; l'annuler ne les remet pas. */
    const avenantR = d.modele === 'avenant_recherche' && !!d.recherche_id
      ? '\n\nLa fin du mandat et les honoraires que cet avenant avait changés sur la recherche ne reviennent pas tout seuls : remets-les à la main dans le bloc Mandat de la fiche client, si besoin.'
      : d.modele === 'avenant_vente'
        ? '\n\nLe prix, les honoraires et la fin du mandat que cet avenant avait reportés sur la fiche du bien ne reviennent pas tout seuls : remets-les à la main depuis la fiche du bien, si besoin.'
        : '';
    return `Marquer ce document comme annulé ?\n\nIl reste dans la liste, avec ses fichiers.${m?.surRecherche && m.numero && d.recherche_id ? '\n\nLe bloc Mandat de sa recherche sera vidé.' : ''}${avenantR}`;
  }
  /* V3.50 : la signature en cours s'arrête avec. */
  const enSignature = d.signature
    ? `\n\nLa signature ${d.signature.mode === 'sur_place' ? 'sur place' : 'en ligne'} en cours s’arrête : les liens ne fonctionneront plus. Personne n’est prévenu par e-mail : si quelqu’un a déjà signé, dis-le-lui toi-même.`
    : '';
  return `Annuler ce document ?\n\nIl reste dans la liste, avec son PDF, marqué « Annulé ».${enSignature}`;
}

function Panneau({ it, noms, docs, onFermer, onEditer, onMaj, onSupprime, onDupliquer, onFiche, onDeriver, onSuiteBien }: {
  it: Item;
  noms: Record<string, string>;
  /* Tous les documents : pour retrouver les courriers déjà préparés. */
  docs: DocumentRow[];
  onFermer: () => void;
  onEditer: (d: DocumentRow) => void;
  onMaj: (d: DocumentRow) => void;
  onSupprime: (id: string) => void;
  onDupliquer: (d: DocumentRow) => void;
  onFiche: (clientId: string) => void;
  /* Préparer un document à partir d'un mandat (avenant, courrier) : « d-<id> »
     pour un document, « r-<id> » pour un mandat signé en ligne. */
  onDeriver: (cle: string, modeleId: string, o?: { echeance?: string }) => void;
  /* Un mandat de vente annulé ou supprimé : que devient la fiche du bien ? */
  onSuiteBien: (x: SuiteBien) => void;
}) {
  const [travail, setTravail] = useState('');
  const [erreur, setErreur] = useState('');
  const [signe, setSigne] = useState(false);
  const [surPlace, setSurPlace] = useState<{ finaliser?: boolean } | null>(null);
  /* « Envoyer le projet » (V3.40) : la fenêtre, puis ce qu'elle a fait. */
  const [projet, setProjet] = useState(false);
  const [fait, setFait] = useState<{ t: string; ok: boolean } | null>(null);
  /* « Marquer annulé » un mandat signé : la raison d'abord (V3.50). */
  const [finMandat, setFinMandat] = useState(false);
  const d = it.doc, x = it.mandat;
  const m = d ? modele(d.modele) : null;
  const courrier = !!m?.courrier;
  /* V3.56 : rétracté en ligne par le client (retracteEnLigne). */
  const retracteLe = retracteEnLigne(d);
  /* Signé en ligne ou sur place (et le modèle sait le faire). */
  const elec = !!d && !!m?.cases && electronique(d.donnees);
  const clientId = d?.client_id || x?.client_id || null;
  /* Le courrier de reconduction déjà préparé pour une échéance. */
  const courrierDe = (le: string) => (d ? docs.find(c => c.modele === 'courrier_reconduction' && c.statut !== 'annule'
    && (c.donnees as Record<string, unknown>).sourceId === d.id && (c.donnees as Record<string, unknown>).echeance === le) : undefined);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !signe && !surPlace && !projet && !finMandat) onFermer(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFermer, signe, surPlace, projet, finMandat]);

  /* Relu après la signature sur place : le document a pu passer « Signé ». */
  async function recharger() {
    if (!d) return;
    const { data, error } = await supabase.from('documents').select('*').eq('id', d.id).maybeSingle();
    if (error) { setErreur('Le document n’a pas pu être relu : ' + error.message); return; }
    if (data) onMaj(data as DocumentRow);
  }

  async function ouvrirFichier(chemin: string | null | undefined, nom?: string, recherche = false) {
    if (!chemin) return;
    const onglet = window.open('', '_blank');
    setTravail('fichier'); setErreur('');
    try {
      let url: string;
      if (recherche) {
        const { data, error } = await supabase.storage.from('mandats').createSignedUrl(chemin, 300);
        if (error || !data) throw new Error(error?.message || 'fichier introuvable');
        url = data.signedUrl;
      } else url = await lienFichier(chemin, nom);
      if (onglet) onglet.location.href = url; else window.location.href = url;
    } catch (e) {
      onglet?.close();
      setErreur('Le fichier n’a pas pu être ouvert : ' + (e as Error).message);
    }
    setTravail('');
  }

  /* `question` : null quand la fenêtre de la raison a déjà demandé. */
  async function changer(maj: Record<string, unknown>, question: string | null, o: { raison?: RaisonFin } = {}) {
    if (!d || (question !== null && !confirm(question))) return;
    setTravail('etat'); setErreur('');
    /* V3.50 : relu d'abord. La page ouverte depuis le matin pouvait annuler
       un document signé en ligne entre-temps, et le registre notait « Sans
       suite : jamais signé » juste après « Signé ». */
    const { data: frais, error: eF } = await supabase.from('documents').select('*').eq('id', d.id).maybeSingle();
    if (eF) { setTravail(''); setErreur('Le document n’a pas pu être relu : ' + eF.message); return; }
    const aJour = frais as DocumentRow | null;
    if (!aJour || aJour.statut !== d.statut) { setTravail(''); setErreur(CHANGE_ENTRE_TEMPS); return; }
    /* V3.50 : une signature en ligne ou sur place en cours s'arrête d'abord :
       les liens ne marchent plus, et le Suivi du client le dit. Personne
       n'est prévenu par e-mail. */
    let signatureArretee = false;
    if (maj.statut === 'annule' && aJour.statut === 'pret' && aJour.signature) {
      try { await appelSignature({ action: 'annuler', id: d.id, pourquoi: 'annulation' }); signatureArretee = true; } catch (e) {
        setTravail('');
        setErreur('La signature en cours n’a pas pu être arrêtée, le document n’est pas annulé : ' + (e as Error).message);
        return;
      }
    }
    /* Seulement s'il est toujours dans l'état que la page montre. */
    const { data, error } = await supabase.from('documents').update({ ...maj, updated_at: new Date().toISOString() }).eq('id', d.id).eq('statut', d.statut).select().maybeSingle();
    setTravail('');
    /* La signature a déjà été arrêtée : il faut le savoir pour la relancer. */
    const arretee = signatureArretee ? ' La signature en cours, elle, a bien été arrêtée : relance-la si le document doit rester.' : '';
    if (error) { setErreur('Impossible : ' + error.message + arretee); return; }
    if (!data) { setErreur(CHANGE_ENTRE_TEMPS + arretee); return; }
    /* Un mandat de recherche papier signé puis annulé : le bloc Mandat de
       sa recherche se vide. */
    if (maj.statut === 'annule' && m) {
      const pb = await apresAnnulation(aJour, m, o.raison);
      if (pb) setErreur(pb);
    }
    onMaj(data as DocumentRow);
    /* Un mandat de vente (V3.42) : son bien est-il encore « En vente » avec lui ? */
    if (maj.statut === 'annule') {
      const suite = await suiteBienDe(aJour, aJour.statut === 'signe', false);
      if (suite) onSuiteBien(suite);
    }
  }

  async function supprimer() {
    if (!d) return;
    /* Un mandat qui a déjà son numéro au registre (finalisé, puis repassé en
       brouillon) : la ligne reste, le registre la note « sans suite ». */
    let ligne: number | null = null;
    if (m?.registre) {
      const { data, error } = await supabase.from('registre_mandats').select('numero').eq('document_id', d.id).order('numero').limit(1).maybeSingle();
      if (error && !registreAbsent(error)) { setErreur('Le registre des mandats n’a pas pu être lu : ' + error.message); return; }
      ligne = data ? Number((data as { numero: number }).numero) : null;
    }
    if (!confirm(ligne
      ? `Supprimer ce brouillon ?\n\nIl a déjà le n° ${ligne} au registre des mandats : cette ligne reste, notée « sans suite ».`
      : 'Supprimer ce brouillon ?\n\nIl disparaît pour de bon, avec ses réponses.')) return;
    setTravail('supprimer'); setErreur('');
    try {
      /* V3.43 : relu d'abord. Finalisé ailleurs entre-temps, il n'est plus un
         brouillon : on ne touche à rien (ni registre, ni fichiers). */
      const { data: frais, error: eF } = await supabase.from('documents').select('statut').eq('id', d.id).maybeSingle();
      if (eF) throw new Error(eF.message);
      /* Déjà supprimé ailleurs (un autre onglet) : il quitte la liste, c'est tout. */
      if (!frais) { onSupprime(d.id); return; }
      if ((frais as { statut?: string }).statut !== 'brouillon') throw new Error('ce document n’est plus un brouillon (il a été finalisé entre-temps). Recharge la page.');
      if (ligne) {
        const pb = await noterAnnulation(supabase, {
          modele: d.modele, document_id: d.id, titre: d.titre || m?.titre || 'Mandat', etaitSigne: false,
          quand: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date()),
        });
        if (pb) throw new Error(pb);
      }
      /* La ligne d'abord, les fichiers ensuite (V3.43). */
      const { data: parti, error } = await supabase.from('documents').delete().eq('id', d.id).eq('statut', 'brouillon').select('id');
      if (error) throw new Error(error.message);
      if (!parti?.length) throw new Error('rien n’a été supprimé (la session a peut-être expiré). Recharge la page, puis recommence.');
      try { await retirerFichiers(d.id); } catch (e2) { console.error('[documents] fichiers du brouillon', (e2 as Error).message); }
      /* Un mandat de vente (V3.42) : son bien était-il passé « En vente » avec lui ? */
      const suite = await suiteBienDe(d, false, true);
      onSupprime(d.id);
      if (suite) onSuiteBien(suite);
    } catch (e) {
      setErreur('La suppression a échoué : ' + (e as Error).message);
      setTravail('');
    }
  }

  /* V3.50 : le jour de la signature à l'heure de Paris (signé en ligne la
     nuit, l'heure universelle donnait la veille de la fin notée sur le bien). */
  const echeances = d && m?.echeances && d.statut === 'signe' && d.signe_le ? m.echeances(d.donnees, jourParis(d.signe_le)) : [];
  const auj = aujourdhui();
  const prochaine = echeances.find(e => e.le >= auj);

  return (
    <>
      <div className={s.voile} onClick={onFermer} aria-hidden="true" />
      <aside className={s.panneau} role="dialog" aria-modal="true" aria-label={it.titre}>
        <div className={s.panTete}>
          <span className={s.ligneIc}><Ic n={CAT_IC[it.categorie] || 'doc'} t={18} /></span>
          <div style={{ minWidth: 0 }}>
            <h3>{it.titre}</h3>
            <p>{it.sous || (m ? m.titre : '')}</p>
            <div style={{ marginTop: 8 }}><Pastille statut={it.statut} courrier={courrier} enSignature={it.enSignature} /></div>
          </div>
          <button type="button" className={s.panFermer} aria-label="Fermer" onClick={onFermer}><Croix /></button>
        </div>

        <div className={s.panCorps}>
          {erreur && <div className={s.erreur}>{erreur}</div>}
          {fait && <div className={fait.ok ? s.note : s.erreur}>{fait.t}</div>}
          {/* V3.56 : le client y a renoncé lui-même, en ligne. */}
          {retracteLe && <div className={s.note}>{`↩️ Rétracté : le client a renoncé à ce mandat en ligne, depuis son espace, le ${quandRegistre(retracteLe)} (délai de rétractation).`}</div>}

          {/* ── Ce qu'on peut en faire ── */}
          {d && (
            <div className={s.actions}>
              {d.statut === 'brouillon' && (
                <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={() => onEditer(d)}>
                  <Ic n="plume" t={16} /><span>Reprendre le brouillon</span>
                </button>
              )}
              {d.statut === 'brouillon' && !courrier && (
                <button type="button" className={s.btn} onClick={() => { setFait(null); setProjet(true); }}>
                  <Ic n="envoyer" t={16} /><span>Envoyer le projet</span><small>pour relecture, sans signature</small>
                </button>
              )}
              {d.statut === 'pret' && elec && (
                <BlocSignature doc={d} onMaj={onMaj} onSurPlace={o => setSurPlace(o || {})} />
              )}
              {d.statut === 'pret' && !elec && (
                <>
                  <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={!!travail} onClick={() => ouvrirFichier(d.pdf_chemin, nomFichier(d))}>
                    <Ic n="doc" t={16} /><span>{courrier ? 'Le PDF à signer et envoyer' : 'Le PDF à imprimer et faire signer'}</span>
                  </button>
                  <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={() => setSigne(true)}>
                    <Ic n="check" t={16} e={2.4} /><span>{courrier ? 'Il est envoyé' : 'Il est signé : déposer l’exemplaire'}</span>
                  </button>
                </>
              )}
              {/* V3.55 : signé à la main sans son exemplaire : le rappel, puis le geste. */}
              {it.aDeposer && <div className={s.depotNote}><Ic n="trombone" t={15} /><span>{it.aDeposer}</span></div>}
              {d.statut === 'signe' && (d.signe_chemin
                ? <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={!!travail} onClick={() => ouvrirFichier(d.signe_chemin, d.signature ? nomFichier(d, '-signe') : undefined)}><Ic n="doc" t={16} /><span>{courrier ? 'La preuve d’envoi' : d.signature ? 'L’exemplaire signé et scellé' : 'L’exemplaire signé'}</span>{d.signature && <small>avec son certificat</small>}</button>
                : <button type="button" className={`${s.btn} ${courrier ? '' : s.btnOr}`} onClick={() => setSigne(true)}><Ic n="doc" t={16} /><span>{courrier ? 'Déposer la preuve d’envoi' : 'Déposer l’exemplaire signé'}</span><small>pas encore déposé{courrier ? 'e' : ''}</small></button>)}
              {d.statut === 'signe' && d.modele === 'mandat_vente' && (
                <button type="button" className={s.btn} onClick={() => onDeriver('d-' + d.id, 'avenant_vente')}>
                  <Ic n="plume" t={16} /><span>Préparer un avenant</span><small>prix, honoraires, durée</small>
                </button>
              )}
              {d.statut === 'signe' && d.modele === 'mandat_recherche' && (
                <button type="button" className={s.btn} onClick={() => onDeriver('d-' + d.id, 'avenant_recherche')}>
                  <Ic n="plume" t={16} /><span>Préparer un avenant</span><small>budget, recherche, durée</small>
                </button>
              )}
              {d.statut === 'signe' && (d.modele === 'mandat_vente' || d.modele === 'mandat_recherche') && (
                <button type="button" className={s.btn} onClick={() => onDeriver('d-' + d.id, 'delegation')}>
                  <Ic n="accord" t={16} /><span>Déléguer à un confrère</span><small>délégation de mandat</small>
                </button>
              )}
              {d.statut === 'signe' && d.signature && <BlocSignature doc={d} onMaj={onMaj} onSurPlace={() => {}} />}
              {/* V3.56 : rétracté en ligne, l'exemplaire signé et scellé reste là. */}
              {retracteLe && d.signe_chemin && (
                <button type="button" className={s.btn} disabled={!!travail} onClick={() => ouvrirFichier(d.signe_chemin, nomFichier(d, '-signe'))}><Ic n="doc" t={16} /><span>L’exemplaire signé et scellé</span><small>avant la rétractation</small></button>
              )}
              {(d.statut === 'signe' || d.statut === 'annule') && d.pdf_chemin && (
                <button type="button" className={s.btn} disabled={!!travail} onClick={() => ouvrirFichier(d.pdf_chemin, nomFichier(d))}><Ic n="doc" t={16} /><span>Le PDF d’origine</span></button>
              )}
              {d.statut !== 'brouillon' && (
                <button type="button" className={s.btn} onClick={() => onEditer(d)}><Ic n="loupe" t={16} /><span>{d.statut === 'pret' ? 'Ouvrir (ou le modifier)' : 'Relire le document'}</span></button>
              )}
              <button type="button" className={s.btn} onClick={() => onDupliquer(d)}>
                <Ic n="doc" t={16} /><span>Dupliquer</span><small>nouveau brouillon</small>
              </button>
              {d.statut === 'brouillon' && (
                <button type="button" className={`${s.btn} ${s.btnDanger}`} disabled={!!travail} onClick={supprimer}><Croix t={15} /><span>Supprimer le brouillon</span></button>
              )}
              {(d.statut === 'pret' || d.statut === 'signe') && (
                <button type="button" className={`${s.btn} ${s.btnDanger}`} disabled={!!travail}
                  onClick={() => {
                    /* V3.50 : un mandat signé, la raison d'abord (registre). */
                    if (d.statut === 'signe' && (d.modele === 'mandat_vente' || d.modele === 'mandat_recherche')) { setFinMandat(true); return; }
                    void changer({ statut: 'annule', annule_le: new Date().toISOString() }, questionAnnuler(d, m));
                  }}>
                  <Croix t={15} /><span>{d.statut === 'signe' ? 'Marquer annulé' : 'Annuler le document'}</span>
                </button>
              )}
            </div>
          )}

          {x && (
            <div className={s.actions}>
              {x.pdf_chemin && x.statut === 'signe' && (
                <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={!!travail} onClick={() => ouvrirFichier(x.pdf_chemin, undefined, true)}>
                  <Ic n="doc" t={16} /><span>Le mandat signé</span>
                </button>
              )}
              {(x.statut === 'signe' || x.statut === 'partiel') && !x.retracte_le && (
                <button type="button" className={s.btn} onClick={() => onDeriver('r-' + x.id, 'avenant_recherche')}>
                  <Ic n="plume" t={16} /><span>Préparer un avenant</span><small>budget, recherche, durée</small>
                </button>
              )}
              {(x.statut === 'signe' || x.statut === 'partiel') && !x.retracte_le && (
                <button type="button" className={s.btn} onClick={() => onDeriver('r-' + x.id, 'delegation')}>
                  <Ic n="accord" t={16} /><span>Déléguer à un confrère</span><small>délégation de mandat</small>
                </button>
              )}
              <div className={s.note}>Le mandat de recherche se prépare et se fait signer depuis la fiche du client (bloc Mandat) : il se signe en ligne, dans son espace.</div>
            </div>
          )}

          {clientId && (
            <button type="button" className={s.btn} onClick={() => onFiche(clientId)} style={{ justifyContent: 'flex-start' }}>
              <Ic n="personne" t={16} /><span>{`Fiche client : ${noms[clientId] || 'ouvrir'}`}</span>
            </button>
          )}

          {/* ── Les échéances d'un mandat signé ── */}
          {echeances.length > 0 && (
            <div className={s.carte}>
              <div className={s.carteT}>Les échéances</div>
              {echeances.map((e, i) => {
                const passee = e.le < auj;
                const maintenant = !!e.du && !!e.au && e.du <= auj && auj <= e.au;
                const rate = !!e.au && e.au < auj && !passee;
                const lettre = e.du && e.au && !passee ? courrierDe(e.le) : undefined;
                /* Le courrier se prépare pour la prochaine échéance seulement. */
                const aPreparer = !lettre && !!e.du && !!e.au && e === prochaine;
                return (
                  <div key={i} className={`${s.echeance} ${passee ? s.echeancePassee : ''}`}>
                    <span className={`${s.point} ${e === prochaine ? s.pointOr : ''}`} />
                    <span>
                      <b>{jourLong(e.le)}</b>{` · ${e.quoi}`}
                      {e.du && e.au && <i>{`Écrire au ${m?.categorie === 'mandats_recherche' ? 'client' : 'vendeur'} entre le ${jourLong(e.du)} et le ${jourLong(e.au)}.`}</i>}
                      {maintenant && <i className={s.echeanceMaintenant}>C’est maintenant : envoie-lui le courrier ou l’e-mail.</i>}
                      {rate && !lettre && <i className={s.echeanceRatee}>Délai passé : sans ce courrier, le client pourra arrêter le mandat à tout moment après l’échéance.</i>}
                      {lettre && <button type="button" className={s.btnLien} style={{ marginTop: 6 }} onClick={() => onEditer(lettre)}>{`Courrier : ${libStatut(lettre.statut, true).toLowerCase()}${lettre.signe_le ? ` le ${jourLong(jourParis(lettre.signe_le))}` : ''} · l’ouvrir`}</button>}
                      {aPreparer && <button type="button" className={s.btnLien} style={{ marginTop: 6 }} onClick={() => onDeriver('d-' + d!.id, 'courrier_reconduction', { echeance: e.le })}>Préparer le courrier</button>}
                    </span>
                  </div>
                );
              })}
              <i className={s.chAide}>{`Article L215-1 du Code de la consommation : avant chaque prolongation, le ${m?.categorie === 'mandats_recherche' ? 'client' : 'vendeur'} est prévenu par écrit, au plus tôt trois mois et au plus tard un mois avant.`}</i>
            </div>
          )}

          {/* ── L'historique (V3.40) : créé, projets envoyés, finalisé,
              signé… du plus récent au plus ancien. Les dates y sont toutes ;
              les informations gardent ce qui ne bouge pas. ── */}
          <CarteHistorique evts={evenementsDocument(d, x, courrier)} />

          {/* ── Les informations ── */}
          <div className={s.carte}>
            <div className={s.carteT}>Informations</div>
            <dl className={s.infos}>
              {m && <><dt>Modèle</dt><dd>{m.titre}{d?.badge ? ` · ${d.badge}` : ''}</dd></>}
              {(d?.numero || x?.numero) && <><dt>N° registre</dt><dd>{d?.numero || x?.numero}</dd></>}
              {d?.statut === 'brouillon' && <><dt>Modifié</dt><dd>{quand(d.updated_at)}</dd></>}
              {m && <><dt>{courrier ? 'Signature' : 'Signataires'}</dt><dd>{m.signataires}</dd></>}
            </dl>
          </div>
        </div>
      </aside>
      {signe && d && <FenetreSigne doc={d} onFermer={() => setSigne(false)} onFait={r => { setSigne(false); onMaj(r); }} onRelu={onMaj} />}
      {finMandat && d && <FenetreFinMandat vide={!!(m?.surRecherche && m.numero && d.recherche_id)} onFermer={() => setFinMandat(false)}
        onChoix={r => { setFinMandat(false); void changer({ statut: 'annule', annule_le: new Date().toISOString() }, null, { raison: r }); }} />}
      {projet && d && <FenetreProjet doc={d} onFermer={() => setProjet(false)} onEnvoye={r => { setProjet(false); setFait({ t: r.message, ok: r.ok }); if (r.row) onMaj(r.row); }} />}
      {surPlace && d && <SignatureSurPlace doc={d} finaliser={!!surPlace.finaliser} onFermer={() => { setSurPlace(null); void recharger(); }} />}
    </>
  );
}

/* Ce que la page doit faire en s'ouvrant, venue d'un autre écran. */
/* Venu d'ailleurs : préparer un avenant, ouvrir un document (« r-<id> » :
   un mandat signé en ligne), en créer un pour un client (sa fiche), ou
   descendre à un endroit de la page (le sous-menu Documents, V3.18), ou
   déléguer un mandat à un confrère (sa fiche de contact, V3.19). */
export type IntentionDocuments = { avenantRecherche?: string; ouvrir?: string; nouveau?: string; ancre?: 'creer' | 'liste'; delegation?: string };

export default function PageDocuments({ onNavigate, intention, onIntention }: {
  onNavigate: (page: string, data?: unknown) => void;
  intention?: IntentionDocuments | null;
  onIntention?: () => void;
}) {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [mandats, setMandats] = useState<MandatRecherche[]>([]);
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState('');
  const [absente, setAbsente] = useState(false);
  /* V3.60 : la sorte (ou « Signatures en cours »), puis l'état dans la sorte. */
  const [vue, setVue] = useState<Vue>('tout');
  const [sous, setSous] = useState<SousVue>('tout');
  const choisirVue = (k: Vue) => { setVue(k); setSous('tout'); };
  const [cherche, setCherche] = useState('');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState<{ modele?: string; clientId?: string; confrereId?: string } | null>(null);
  const [edition, setEdition] = useState<DocumentRow | null>(null);
  /* Un mandat de vente annulé ou supprimé : la question de sa fiche (V3.42). */
  const [suiteBien, setSuiteBien] = useState<SuiteBien | null>(null);
  /* V3.58 : qui a signé, qui on attend, sous la ligne de chaque document en
     signature (Alexandre : « dans Documents, je ne vois que En signature »).
     La même ligne dépliable que sur la fiche d'un client ou d'un bien. */
  const [suivis, setSuivis] = useState<Record<string, Suivi>>({});
  const [tourSuivis, setTourSuivis] = useState(0);
  const refCreer = useRef<HTMLElement>(null);
  const refListe = useRef<HTMLDivElement>(null);

  const charger = useCallback(async () => {
    /* Tous, par pages de 1 000 (V3.43 : la liste s'arrêtait à 500 documents
       et 300 mandats en ligne, et ses compteurs avec). */
    const [ra, rb] = await Promise.all([
      toutLire<DocumentRow>((de, x) => supabase.from('documents').select('*').order('updated_at', { ascending: false }).order('id').range(de, x)),
      toutLire<MandatRecherche>((de, x) => supabase.from('mandats_signatures').select('id, numero, statut, signe_le, retracte_le, pdf_chemin, client_id, recherche_id, mandant, created_at')
        .order('created_at', { ascending: false }).order('id').range(de, x)),
    ]);
    const a = { data: ra.data, error: ra.erreur ? { message: ra.erreur } : null };
    const b = { data: rb.data, error: rb.erreur ? { message: rb.erreur } : null };
    if (a.error) {
      if (tableAbsente(a.error.message)) setAbsente(true);
      else setErreur('Les documents n’ont pas pu être lus : ' + a.error.message);
      setDocs([]);
    } else { setDocs((a.data || []) as DocumentRow[]); setAbsente(false); setErreur(''); }
    const ms = b.error ? [] : ((b.data || []) as MandatRecherche[]);
    setMandats(ms);
    const ids = Array.from(new Set([...(a.data || []).map(x => (x as DocumentRow).client_id), ...ms.map(x => x.client_id)].filter((x): x is string => !!x)));
    if (ids.length) {
      /* Par paquets de 150 identifiants (V3.43 : au-delà de 300, des noms
         manquaient ; une liste trop longue ne tient pas dans l'adresse). */
      const paquets: string[][] = [];
      for (let i = 0; i < ids.length; i += 150) paquets.push(ids.slice(i, i + 150));
      const lus = await Promise.all(paquets.map(p => supabase.from('clients').select('id, prenom, nom').in('id', p)));
      setNoms(Object.fromEntries(lus.flatMap(r => r.data || []).map(c => [c.id as string, `${c.prenom || ''} ${c.nom || ''}`.trim()])));
    }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  /* Les suivis : relus quand la liste change, quand on revient sur l'onglet,
     et toutes les minutes tant qu'une signature attend quelqu'un. Une lecture
     ratée laisse la ligne telle quelle (la pastille « En signature » reste). */
  const enCours = useMemo(() => ({
    docs: (docs || []).filter(d => d.statut === 'pret' && !!d.signature),
    mandats: mandats.filter(x => !x.retracte_le && (x.statut === 'partiel' || x.statut === 'en_cours')),
  }), [docs, mandats]);
  useEffect(() => {
    let vivant = true;
    if (!enCours.docs.length && !enCours.mandats.length) { setSuivis({}); return; }
    lireSuivis(enCours).then(l => { if (vivant) setSuivis(l); }, e => console.error('[documents] suivis', (e as Error).message));
    return () => { vivant = false; };
  }, [enCours, tourSuivis]);
  const attente = enCours.docs.length + enCours.mandats.length > 0;
  useEffect(() => {
    if (!attente) return;
    const maj = () => { if (document.visibilityState === 'visible') setTourSuivis(t => t + 1); };
    const t = window.setInterval(maj, 60_000);
    window.addEventListener('focus', maj);
    document.addEventListener('visibilitychange', maj);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', maj);
      document.removeEventListener('visibilitychange', maj);
    };
  }, [attente]);

  const items = useMemo<Item[]>(() => [
    ...(docs || []).map(itemDoc),
    ...mandats.filter(x => x.statut === 'signe' || x.statut === 'partiel' || x.retracte_le || x.statut === 'en_cours').map(x => itemMandat(x, noms)),
  ].sort((p, q) => q.date.localeCompare(p.date)), [docs, mandats, noms]);

  const q = cherche.trim().toLowerCase();
  const cherches = useMemo(() => items.filter(it => !q || `${it.titre} ${it.sous} ${it.badge || ''}`.toLowerCase().includes(q)), [items, q]);
  /* « Signatures en cours » : tout ce qui attend une signature (les liens
     partis, ou prêt à faire signer), hors courriers. */
  const enCoursListe = cherches.filter(it => it.statut === 'pret' && !it.courrier);
  const dansVue = vue === 'encours' ? enCoursListe : cherches.filter(it => vue === 'tout' || it.categorie === vue);
  const nEtat = (k: Etat) => dansVue.filter(it => etatDe(it) === k).length;
  const vueCourriers = vue === 'courriers';
  /* V3.55 : « à faire signer » ne compte plus ceux dont les liens sont partis
     (« en signature »), et les exemplaires signés à déposer se comptent. */
  const aSigner = items.filter(it => it.statut === 'pret' && it.doc && !it.courrier && !it.enSignature).length;
  const enSignature = items.filter(it => it.statut === 'pret' && it.doc && !it.courrier && it.enSignature).length;
  const aEnvoyer = items.filter(it => it.statut === 'pret' && it.courrier).length;
  const aDeposer = items.filter(it => it.aDeposer).length;

  const majDoc = useCallback((r: DocumentRow) => {
    setDocs(l => (l ? (l.some(x => x.id === r.id) ? l.map(x => (x.id === r.id ? r : x)) : [r, ...l]) : [r]));
  }, []);

  async function dupliquer(d: DocumentRow) {
    const m = modele(d.modele);
    if (!m) return;
    /* Un seul mandat en cours (V3.32) : dupliquer un mandat qui court en
       ferait un second. Annulé, il peut servir de base au suivant. */
    if (d.modele === 'mandat_vente' || d.modele === 'mandat_recherche') {
      if (d.statut !== 'annule') {
        alert('Ce mandat est toujours en cours : on ne peut pas en avoir deux.\n\nPour le modifier : un avenant. Pour en refaire un nouveau : annule d’abord celui-ci, puis duplique-le.');
        return;
      }
      try {
        const bienId = typeof d.donnees?.bienVenteId === 'string' ? d.donnees.bienVenteId : '';
        const enCours = d.modele === 'mandat_vente'
          ? bienId ? await mandatVenteEnCours({ id: bienId }) : null
          : d.recherche_id ? await mandatRechercheEnCours(d.recherche_id) : null;
        if (enCours) { alert(`${phraseMandat(enCours)}\n\n${conseilMandat(enCours)}`); return; }
      } catch (e) { alert((e as Error).message); return; }
    }
    /* V3.55 : la copie d'un document en signature n'arrête pas sa signature.
       Lancée à son tour, elle serait refusée tant que l'original attend
       (deux offres du même acquéreur, deux avenants au même mandat…). */
    if (d.statut === 'pret' && d.signature && !confirm('Ce document est en cours de signature.\n\nLa copie sera un nouveau brouillon, à côté : la signature de l’original continue, ses liens marchent toujours. Si la copie doit le remplacer, arrête d’abord la signature de l’original (Arrêter la signature).\n\nDupliquer quand même ?')) return;
    const donnees: Donnees = { ...d.donnees, date: aujourdhui(), ...(m.numero ? { numero: '' } : {}) };
    /* V3.56 : la copie d'un mandat rétracté en ligne ne l'est pas. */
    delete donnees.retracte_le;
    delete donnees.retracte_en_ligne;
    /* V3.50 : un avenant dupliqué prend le numéro qui suit (comme « Préparer
       un avenant ») : la copie d'un « Avenant n° 1 » signé faisait un second
       « Avenant n° 1 » au même mandat, et deux observations au registre. */
    const numeroMandat = typeof donnees.mandatNumero === 'string' ? donnees.mandatNumero.trim() : '';
    if ('avenantNo' in donnees && numeroMandat) {
      try { donnees.avenantNo = avenantSuivant(await avenantsDuMandat(d.modele, numeroMandat)); }
      catch (e) { alert('La copie n’a pas pu être créée.\n\n' + (e as Error).message); return; }
    }
    const { data, error } = await supabase.from('documents').insert({
      modele: d.modele, categorie: d.categorie, statut: 'brouillon', donnees, ...colonnesListe(m, donnees),
      client_id: d.client_id, bien_id: d.bien_id, recherche_id: d.recherche_id,
    }).select().single();
    if (error) { alert('La copie n’a pas pu être créée.\n\n' + error.message); return; }
    majDoc(data as DocumentRow);
    setOuvert(null);
    setEdition(data as DocumentRow);
  }

  /* Un avenant ou un courrier, à partir d'un mandat (« d-<id> » : un
     document ; « r-<id> » : un mandat signé en ligne) : repris, créé en
     brouillon, ouvert. */
  const deriver = useCallback(async (cle: string, modeleId: string, o: { echeance?: string } = {}) => {
    const m = modele(modeleId);
    if (!m?.deriver) return;
    try {
      const [identite, src] = await Promise.all([identiteDuJour(), mandatDepuis(cle)]);
      const donnees = await preparerDepuis(m, src, identite, o);
      const { data, error } = await supabase.from('documents').insert({
        modele: m.id, categorie: m.categorie, statut: 'brouillon', donnees, ...colonnesListe(m, donnees),
        client_id: src.client_id, bien_id: src.bien_id, recherche_id: src.recherche_id,
      }).select().single();
      if (error) throw new Error(error.message);
      majDoc(data as DocumentRow);
      setOuvert(null);
      setEdition(data as DocumentRow);
    } catch (e) {
      alert('Le document n’a pas pu être préparé.\n\n' + (e as Error).message);
    }
  }, [majDoc]);

  /* Venu d'ailleurs (la fiche client : « Préparer un avenant ») : le mandat
     signé de cette recherche, en ligne d'abord, sinon sur papier. */
  const faite = useRef('');
  /* Un document précis (créé depuis la fiche d'un bien en vente) : on
     l'ouvre, dans l'éditeur s'il est encore en brouillon. */
  useEffect(() => {
    const id = intention?.ouvrir;
    if (!id || faite.current === 'o-' + id) return;
    faite.current = 'o-' + id;
    /* Un mandat de recherche signé en ligne : sa fiche, dans la liste. */
    if (id.startsWith('r-')) { onIntention?.(); setOuvert(id); return; }
    (async () => {
      const { data, error } = await supabase.from('documents').select('*').eq('id', id).maybeSingle();
      onIntention?.();
      if (error || !data) { alert('Le document n’a pas pu être ouvert.' + (error ? `\n\n${error.message}` : '')); return; }
      const r = data as DocumentRow;
      majDoc(r);
      if (r.statut === 'brouillon') setEdition(r); else setOuvert(r.id);
    })();
  }, [intention, onIntention, majDoc]);
  /* « Déléguer un mandat » depuis la fiche d'un confrère : il est déjà choisi. */
  useEffect(() => {
    const cid = intention?.delegation;
    if (!cid || faite.current === 'dl-' + cid) return;
    faite.current = 'dl-' + cid;
    onIntention?.();
    setNouveau({ modele: 'delegation', confrereId: cid });
  }, [intention, onIntention]);
  /* « + Nouveau document » depuis la fiche d'un client : il est déjà choisi. */
  useEffect(() => {
    const cid = intention?.nouveau;
    if (!cid || faite.current === 'n-' + cid) return;
    faite.current = 'n-' + cid;
    onIntention?.();
    setNouveau({ clientId: cid });
  }, [intention, onIntention]);
  useEffect(() => {
    const rid = intention?.avenantRecherche;
    if (!rid || faite.current === rid) return;
    faite.current = rid;
    (async () => {
      /* Un avenant déjà en route pour cette recherche : on l'ouvre, plutôt
         que d'en préparer un second. */
      const enCours = await supabase.from('documents').select('*').eq('recherche_id', rid).eq('modele', 'avenant_recherche')
        .in('statut', ['brouillon', 'pret']).order('created_at', { ascending: false }).limit(1);
      const deja = !enCours.error && enCours.data?.length ? (enCours.data[0] as DocumentRow) : null;
      if (deja) {
        onIntention?.();
        majDoc(deja);
        if (deja.statut === 'brouillon') setEdition(deja); else setOuvert(deja.id);
        return;
      }
      const [a, b] = await Promise.all([
        supabase.from('mandats_signatures').select('id').eq('recherche_id', rid).in('statut', ['signe', 'partiel'])
          .order('signe_le', { ascending: false }).limit(1),
        supabase.from('documents').select('id').eq('recherche_id', rid).eq('modele', 'mandat_recherche').eq('statut', 'signe')
          .order('signe_le', { ascending: false }).limit(1),
      ]);
      const cle = a.data?.length ? 'r-' + a.data[0].id : b.data?.length ? 'd-' + b.data[0].id : '';
      onIntention?.();
      /* Pas de mandat signé dans le CRM (saisi à la main, signé ailleurs) :
         la fenêtre « Nouveau document » s'ouvre sur l'avenant, pour le
         retrouver ou tout saisir. */
      if (!cle) { setNouveau({ modele: 'avenant_recherche' }); return; }
      await deriver(cle, 'avenant_recherche');
    })();
  }, [intention, onIntention, deriver, majDoc]);

  /* « Créer un document » ou « Liste des documents », depuis le menu : la
     page s'ouvre en haut (AppLayout la remonte), puis descend à l'endroit
     demandé — la liste, une fois lue, pour que la hauteur soit la bonne. */
  const ancre = intention?.ancre;
  const pret = docs !== null;
  useEffect(() => {
    if (!ancre || (ancre === 'liste' && !pret)) return;
    const t = setTimeout(() => {
      onIntention?.();
      (ancre === 'creer' ? refCreer.current : refListe.current)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => clearTimeout(t);
  }, [ancre, pret, onIntention]);

  async function ficheClient(id: string) {
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
    if (error || !data) { alert('La fiche du client n’a pas pu être ouverte.' + (error ? `\n\n${error.message}` : '')); return; }
    onNavigate('fiche', data);
  }

  const itOuvert = ouvert ? items.find(it => it.cle === ouvert) || null : null;
  const nbCat = (c: string) => cherches.filter(it => it.categorie === c).length;

  return (
    <div className={s.page}>
      <EnteteRubrique titre="Documents juridiques" icone={<Ic n="doc" t={22} />}
        phrase={aSigner + enSignature + aEnvoyer + aDeposer > 0
          ? [aSigner ? `${aSigner} document${aSigner > 1 ? 's' : ''} à faire signer` : '', enSignature ? `${enSignature} en signature` : '',
            aEnvoyer ? `${aEnvoyer} courrier${aEnvoyer > 1 ? 's' : ''} à envoyer` : '',
            aDeposer ? `${aDeposer} exemplaire${aDeposer > 1 ? 's' : ''} signé${aDeposer > 1 ? 's' : ''} à déposer` : ''].filter(Boolean).join(' · ')
          : 'Mandats, avenants, offres d’achat, bons de visite : prêts à imprimer et à signer.'}
        recherche={items.length > 0 ? { valeur: cherche, onChange: setCherche, placeholder: 'Chercher un nom, une adresse, un numéro…', label: 'Chercher un document' } : undefined}
        bouton={absente ? undefined : { lib: 'Nouveau document', onClick: () => setNouveau({}) }}
        label="Filtrer par état" actif="" onChoisir={() => {}} tuiles={[]} />

      {absente && (
        <div className={s.erreur}>
          <b>Une étape avant de commencer</b>
          La table des documents n’existe pas encore. Ouvre Supabase › SQL Editor, colle le contenu du fichier <code>outils/sql/documents.sql</code>, lance-le, puis recharge cette page.
        </div>
      )}
      {erreur && <div className={s.erreur}>{erreur}</div>}

      {/* ── Les modèles ── */}
      {!absente && (
        <section className={`${s.bloc} ${s.ancre}`} ref={refCreer}>
          <div className={s.blocT}><h2>Créer un document</h2><span>Le texte s’écrit à partir de tes réponses</span></div>
          <div className={s.modeles}>
            {MODELES.map(m => (
              <button key={m.id} type="button" className={s.modele} title={m.description} onClick={() => setNouveau({ modele: m.id })}>
                <span className={s.modeleIc}><Ic n={m.ic} t={20} /></span>
                <div>
                  <b>{m.titre}</b>
                  <p>{m.description}</p>
                </div>
                <span className={s.modeleAction}>Créer<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg></span>
              </button>
            ))}
            <div className={`${s.modele} ${s.modeleInfo}`}>
              <span className={s.modeleIc}><Ic n="loupe" t={20} /></span>
              <div>
                <b>Mandat de recherche en ligne</b>
                <p>Simple : il se prépare depuis la fiche du client et se signe dans son espace, seul, à plusieurs ou pour une société. Les mandats signés apparaissent ici, et leurs avenants se préparent d’ici ou depuis la fiche.</p>
                <small className={s.modeleNote}>Depuis la fiche client, signé en ligne</small>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Les documents ── */}
      {!absente && (
        <div className={`${s.blocT} ${s.listeT} ${s.ancre}`} ref={refListe}>
          <h2>Liste des documents</h2>
          <span>{docs === null ? '' : items.length === 0 ? 'Aucun pour l’instant' : `${items.length} document${items.length > 1 ? 's' : ''}`}</span>
        </div>
      )}
      {items.length > 0 && (
        <BarreOnglets<Vue> label="Sortes de documents" className={s.vues} actif={vue} onChoisir={choisirVue}
          onglets={[
            { k: 'encours', l: 'Signatures en cours', n: enCoursListe.length, ic: <Ic n="plume" t={15} /> },
            { k: 'tout', l: 'Tous', n: cherches.length, ic: <Ic n="doc" t={15} /> },
            /* Une sorte sans aucun document n'a pas d'onglet (la barre tient sur
               une ligne) ; elle revient dès qu'elle en a un. */
            ...CATEGORIES.filter(c => vue === c.id || items.some(it => it.categorie === c.id))
              .map(c => ({ k: c.id as Vue, l: c.titre, n: nbCat(c.id), ic: <Ic n={CAT_IC[c.id]} t={15} /> })),
          ]} />
      )}

      {docs === null ? (
        <div className={s.liste}><div className={s.vide}>Chargement…</div></div>
      ) : !absente && (items.length === 0 ? (
        <div className={s.liste}>
          <div className={s.vide}>
            <b>Aucun document pour l’instant</b>
            {'Choisis un modèle ci-dessus : le brouillon s’enregistre tout seul, au fil de la saisie.'}
          </div>
        </div>
      ) : (
        <CorpsOnglet k={vue} ordre={VUES}>
          <div className={s.groupes}>
            {/* L'état dans la sorte : une barre plus légère, sous la première. */}
            {vue !== 'encours' && (
              <BarreOnglets<SousVue> label="Où en sont ces documents" className={s.sousVues} actif={sous} onChoisir={setSous}
                onglets={SOUS_VUES.filter(k => k !== 'annule' || nEtat('annule') > 0 || sous === 'annule').map(k => ({
                  k, l: libEtat(k, vueCourriers), n: k === 'tout' ? dansVue.length : nEtat(k), ic: <Ic n={IC_ETAT[k]} t={14} />,
                }))} />
            )}
            <CorpsOnglet k={vue === 'encours' ? 'tout' : sous} ordre={SOUS_VUES}>
              {(() => {
                const groupes: { g: string; titre: string; aide?: string; liste: Item[] }[] = vue === 'encours'
                  ? [
                    { g: 'attente', titre: 'On attend des signatures', aide: 'les liens sont partis, ou la signature sur place a commencé', liste: dansVue.filter(it => it.enSignature) },
                    { g: 'prets', titre: 'Prêts à faire signer', aide: 'finalisés : les liens à envoyer, ou le papier à faire signer', liste: dansVue.filter(it => !it.enSignature) },
                  ]
                  : sous === 'tout'
                    ? ORDRE_ETATS.map(k => ({ g: k, titre: libEtat(k, vueCourriers), liste: dansVue.filter(it => etatDe(it) === k) }))
                    : [{ g: sous, titre: '', liste: dansVue.filter(it => etatDe(it) === sous) }];
                const pleins = groupes.filter(g => g.liste.length);
                if (!pleins.length) {
                  const sorte = CATEGORIES.find(c => c.id === vue)?.titre.toLowerCase();
                  return (
                    <div className={s.liste}>
                      <div className={s.vide}>
                        <b>{vue === 'encours' ? 'Aucune signature en cours' : 'Rien ici'}</b>
                        {vue === 'encours'
                          ? 'Un document finalisé, ou dont les liens de signature sont partis, arrive ici jusqu’à la dernière signature.'
                          : q ? 'Aucun document ne correspond à cette recherche.'
                            : `Aucun document${sorte ? ` dans « ${sorte} »` : ''}${sous !== 'tout' ? ` : ${libEtat(sous, vueCourriers).toLowerCase()}` : ''}.`}
                      </div>
                    </div>
                  );
                }
                return <div className={s.groupes}>{pleins.map(g => (
                  <div key={g.g} className={s.groupe}>
                    {g.titre && <TeteGroupe g={g.g} titre={g.titre} n={g.liste.length} aide={g.aide} />}
                    <div className={s.liste}>
                      {g.liste.map(it => {
                        const ligne = <Ligne key={it.cle} it={it} on={ouvert === it.cle} onClick={() => setOuvert(it.cle)} />;
                        const suivi = it.enSignature ? suivis[it.cle] : undefined;
                        if (!suivi) return ligne;
                        return (
                          <div key={it.cle} className={`${s.ligneBloc} ${ouvert === it.cle ? s.ligneBlocOn : ''}`}>
                            {ligne}
                            <div className={s.ligneSuivi}><SuiviSignature suivi={suivi} onFait={() => setTourSuivis(t => t + 1)} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}</div>;
              })()}
            </CorpsOnglet>
          </div>
        </CorpsOnglet>
      ))}

      {/* Les fenêtres vivent sur <body> : l'écran qui les contient est animé
          (transform), et un élément fixe s'y retrouverait prisonnier. */}
      {typeof document !== 'undefined' && createPortal(<>
      {itOuvert && (
        <Panneau it={itOuvert} noms={noms} docs={docs || []} onDeriver={deriver} onFermer={() => setOuvert(null)}
          onEditer={d => { setOuvert(null); setEdition(d); }}
          onMaj={majDoc}
          onSupprime={id => { setDocs(l => (l || []).filter(x => x.id !== id)); setOuvert(null); }}
          onDupliquer={dupliquer}
          onFiche={ficheClient} onSuiteBien={setSuiteBien} />
      )}
      {suiteBien && <SuiteMandatBien bien={suiteBien.bien} doc={suiteBien.doc} etaitSigne={suiteBien.etaitSigne} supprime={suiteBien.supprime}
        onFermer={() => setSuiteBien(null)} onFicheBien={id => { setSuiteBien(null); onNavigate('biens', { bien: id }); }} />}
      {nouveau && (
        <NouveauDocument modeleId={nouveau.modele} clientId={nouveau.clientId} confrereId={nouveau.confrereId} onFermer={() => setNouveau(null)}
          onCree={r => { majDoc(r); setNouveau(null); setEdition(r); }}
          onOuvrir={cle => {
            /* Le mandat déjà en cours (V3.32) : un brouillon s'ouvre dans l'éditeur, le reste dans sa fiche. */
            setNouveau(null);
            const id = cle.startsWith('d-') ? cle.slice(2) : cle;
            const d = (docs || []).find(x => x.id === id);
            if (d && d.statut === 'brouillon') setEdition(d); else setOuvert(id);
          }} />
      )}
      {edition && <EditeurDocument doc={edition} onMaj={majDoc} onFermer={() => { setEdition(null); charger(); }}
        onFinalise={r => { majDoc(r); setEdition(null); setOuvert(r.id); }} />}
      </>, document.body)}
    </div>
  );
}
