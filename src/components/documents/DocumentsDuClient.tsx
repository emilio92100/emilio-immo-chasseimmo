'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { STATUTS, jourLong, modele, modeSignature, type Categorie, type Statut } from '@/lib/actes';
import { Ic } from './ApercuActe';
import BlocRepliable from './BlocRepliable';
import NouveauDocument from './NouveauDocument';
import Depliant from '@/components/shared/Depliant';
import SuiviSignature, { lireSuivis, type Proposition, type SigEspace, type Suivi } from './SuiviSignature';
import { libStatut, lienFichier, nomFichier, type DocumentRow, type MandatRecherche } from './outils';
import s from './Documents.module.css';

/* ═══ « Ses documents », sur la fiche d'un client (V3.17, rangés en V3.32) ═
   Tout ce qui est rattaché à ce client : les documents de la rubrique
   (mandats, avenants, offres, bons de visite, courriers), quel que soit le
   mode de signature — à la main, en ligne, sur place —, ses mandats de
   recherche signés depuis son espace, et celui qui lui est proposé.

   Rangés par état (V3.32, Alexandre : « qu'on voie signature en cours, qu'on
   puisse déplier et voir qui a signé… et quand tout le monde a signé, mes
   documents signés, et qu'on voie le document signé ») :
   En attente de signature (chacun avec son suivi dépliable, SuiviSignature)
   · En préparation · Signés (avec « PDF signé ») · les annulés, repliés.
   Un clic ouvre le document dans Documents. `DocsParEtat` sert aussi à
   l'onglet Documents d'un bien. */

/* Le statut, bien visible : les mêmes couleurs que la liste, en gras, avec
   son dessin — brouillon, à faire signer, signé, annulé. */
const PICTO_STATUT: Record<string, string> = { brouillon: 'crayon', pret: 'plume', signe: 'check', annule: 'croix' };
export function Pastille({ statut, courrier = false, enSignature = false }: { statut: Statut; courrier?: boolean; enSignature?: boolean }) {
  const e = STATUTS[statut] || STATUTS.brouillon;
  /* Partie en signature (V3.32) : elle n'est plus « à faire signer ». */
  if (enSignature && statut === 'pret') return <span className={`${s.statut} ${s.statutFort} ${s.tSignature}`}><Ic n="horloge" t={13} e={2.4} />En signature</span>;
  return <span className={`${s.statut} ${s.statutFort} ${s['t_' + e.ton]}`}><Ic n={PICTO_STATUT[statut] || 'crayon'} t={13} e={2.6} />{libStatut(statut, courrier)}</span>;
}

const CAT_IC: Record<string, string> = { mandats_vente: 'maison', mandats_recherche: 'loupe', offres: 'euro', bons_visite: 'calendrier', courriers: 'boucle', delegations: 'accord' };
const SIGNES_VISIBLES = 4;

export type ElementDoc = {
  cle: string; categorie: Categorie; statut: Statut; titre: string; sous: string; date: string; courrier: boolean;
  /* Ce qu'on ouvre dans Documents (null : rien à ouvrir, la proposition). */
  ouvrir: string | null;
  /* L'exemplaire signé : un document de la rubrique, ou un mandat en ligne. */
  signe?: { chemin: string; nom?: string; mandat?: boolean };
  /* V3.32 : son numéro, et le mandat auquel il se rattache (un avenant, un
     courrier de reconduction, une délégation) : rangé sous lui. */
  numero?: string | null; rattache?: string | null; enfant?: boolean;
};
const RATTACHES = ['avenant_vente', 'avenant_recherche', 'courrier_reconduction', 'delegation'];

/* Le mandat, puis ce qui s'y rattache, dans l'ordre où c'est venu : le
   récapitulatif de ce qui a été signé (V3.32). */
function enChaine(l: ElementDoc[]): ElementDoc[] {
  const out: ElementDoc[] = [];
  const pris = new Set<string>();
  const parents = new Set(l.filter(x => !x.rattache && x.numero).map(x => String(x.numero)));
  for (const el of l) {
    if (pris.has(el.cle) || (el.rattache && parents.has(el.rattache))) continue;
    out.push(el); pris.add(el.cle);
    if (!el.rattache && el.numero) {
      for (const c of l.filter(c => c.rattache === String(el.numero)).sort((p, q) => p.date.localeCompare(q.date))) {
        if (!pris.has(c.cle)) { out.push({ ...c, enfant: true }); pris.add(c.cle); }
      }
    }
  }
  return out;
}

const jour = (iso?: string | null) => (iso ? jourLong(iso.slice(0, 10)) : '');

export function depuisDoc(d: DocumentRow): ElementDoc {
  const courrier = !!modele(d.modele)?.courrier;
  const sig = d.signature as { mode?: string } | null | undefined;
  /* La pastille dit l'état ; la ligne dit quand, et comment. */
  const comment = sig?.mode === 'en_ligne' ? 'en ligne' : sig?.mode === 'sur_place' ? 'sur place' : 'à la main';
  const prevu = modeSignature(d.donnees || {});
  const quand = d.statut === 'signe' ? `Le ${jour(d.signe_le)}${courrier ? '' : `, ${comment}`}`
    : d.statut === 'annule' ? (d.annule_le ? `Le ${jour(d.annule_le)}` : '')
      : d.statut === 'pret' ? (sig?.mode ? `Envoyé le ${jour((d.signature as { lance_le?: string } | null)?.lance_le || d.finalise_le)}`
        : courrier ? `Finalisé le ${jour(d.finalise_le)}`
          : prevu === 'papier' ? `À faire signer à la main · finalisé le ${jour(d.finalise_le)}`
            : `Prêt : ${prevu === 'en_ligne' ? 'les liens de signature ne sont pas encore partis' : 'à faire signer sur place'}`)
        : `Modifié le ${jour(d.updated_at)}`;
  return {
    cle: d.id, ouvrir: d.id, categorie: d.categorie, statut: d.statut, courrier,
    titre: d.titre || 'Document sans titre',
    sous: [d.numero ? `N° ${d.numero}` : RATTACHES.includes(d.modele) && d.donnees?.mandatNumero ? `${d.modele === 'delegation' ? 'Mandat' : 'Au mandat'} n° ${String(d.donnees.mandatNumero)}` : '', quand].filter(Boolean).join(' · '),
    date: d.signe_le || d.annule_le || d.finalise_le || d.updated_at,
    signe: d.statut === 'signe' && d.signe_chemin ? { chemin: d.signe_chemin, nom: nomFichier(d, d.signature ? '-signe' : '') } : undefined,
    numero: d.numero,
    rattache: RATTACHES.includes(d.modele) && d.donnees?.mandatNumero ? String(d.donnees.mandatNumero) : null,
  };
}

function depuisMandat(x: MandatRecherche): ElementDoc {
  const statut: Statut = x.retracte_le ? 'annule' : x.statut === 'signe' || x.statut === 'partiel' ? (x.statut === 'partiel' ? 'pret' : 'signe') : 'pret';
  return {
    cle: 'r-' + x.id, ouvrir: 'r-' + x.id, categorie: 'mandats_recherche', statut, courrier: false,
    titre: 'Mandat de recherche',
    sous: [x.numero ? `N° ${x.numero}` : '',
      x.retracte_le ? `Rétracté le ${jour(x.retracte_le)}` : x.signe_le ? `Signé le ${jour(x.signe_le)}, dans son espace` : 'Signature en cours dans son espace'].filter(Boolean).join(' · '),
    date: x.retracte_le || x.signe_le || x.created_at,
    signe: x.statut === 'signe' && !x.retracte_le && x.pdf_chemin ? { chemin: x.pdf_chemin, mandat: true } : undefined,
    numero: x.numero,
  };
}

function depuisProposition(p: Proposition): ElementDoc {
  return {
    cle: 'p-' + p.rechercheId, ouvrir: null, categorie: 'mandats_recherche', statut: 'pret', courrier: false,
    titre: 'Mandat de recherche',
    sous: [p.numero ? `N° ${p.numero}` : '', `Proposé dans son espace le ${jour(p.proposeLe)}`].filter(Boolean).join(' · '),
    date: p.proposeLe,
  };
}

/* Une ligne : l'ouvrir dans Documents, et son exemplaire signé à côté. */
function Ligne({ el, onOuvrir, ouvre, onSigne, enSignature = false }: { el: ElementDoc; onOuvrir: (cle: string) => void; ouvre: string; onSigne: (el: ElementDoc) => void; enSignature?: boolean }) {
  const dedans = (
    <>
      <span className={`${s.dcCat} ${s['dcCat_' + el.categorie] || ''}`}><Ic n={CAT_IC[el.categorie] || 'doc'} t={15} /></span>
      <span className={s.dcTexte}><b>{el.titre}</b><small>{el.sous}</small></span>
      <Pastille statut={el.statut} courrier={el.courrier} enSignature={enSignature} />
    </>
  );
  return (
    <div className={s.dcLigne} data-enfant={el.enfant ? 'oui' : undefined}>
      {el.ouvrir
        ? <button type="button" className={s.dcOuvrir} onClick={() => onOuvrir(el.ouvrir!)} title="Ouvrir dans Documents">{dedans}</button>
        : <div className={s.dcOuvrir} style={{ cursor: 'default' }}>{dedans}</div>}
      {el.signe && (
        <button type="button" className={s.dcSigne} disabled={ouvre === el.cle} onClick={() => onSigne(el)} title={el.courrier ? 'La preuve d’envoi' : 'L’exemplaire signé'}>
          <Ic n="doc" t={14} /><span>{ouvre === el.cle ? 'Ouverture…' : el.courrier ? 'Preuve' : 'PDF signé'}</span>
        </button>
      )}
    </div>
  );
}

/* ── La liste rangée par état : fiche d'un contact, onglet Documents d'un bien ── */
export function DocsParEtat({ elements, suivis, onOuvrir, onFait }: {
  elements: ElementDoc[]; suivis: Record<string, Suivi>;
  onOuvrir: (cle: string) => void;
  /* Après un geste sur un signataire : relire. */
  onFait?: () => void;
}) {
  const [tout, setTout] = useState(false);
  const [ouvre, setOuvre] = useState('');

  async function ouvrirSigne(el: ElementDoc) {
    if (!el.signe) return;
    const onglet = window.open('', '_blank');
    setOuvre(el.cle);
    try {
      let url: string;
      if (el.signe.mandat) {
        const { data, error } = await supabase.storage.from('mandats').createSignedUrl(el.signe.chemin, 300);
        if (error || !data) throw new Error(error?.message || 'fichier introuvable');
        url = data.signedUrl;
      } else url = await lienFichier(el.signe.chemin, el.signe.nom);
      (onglet || window).location.assign(url);
    } catch (e) {
      onglet?.close();
      alert('L’exemplaire signé n’a pas pu être ouvert.\n\n' + (e as Error).message);
    }
    setOuvre('');
  }

  const attente = enChaine(elements.filter(x => x.statut === 'pret' && !x.courrier));
  const prepa = enChaine(elements.filter(x => x.statut === 'brouillon' || (x.statut === 'pret' && x.courrier)));
  /* Signés : chaque mandat suivi de ses avenants (V3.32). */
  const signes = enChaine(elements.filter(x => x.statut === 'signe'));
  const annules = elements.filter(x => x.statut === 'annule');
  const caches = [...signes.slice(SIGNES_VISIBLES), ...annules];
  const ligne = (el: ElementDoc) => <Ligne key={el.cle} el={el} onOuvrir={onOuvrir} ouvre={ouvre} onSigne={x => { void ouvrirSigne(x); }} enSignature={!!suivis[el.cle]} />;

  return (
    <div className={s.dcListe}>
      {attente.length > 0 && (
        <div className={s.dcGroupe} data-g="attente">
          <div className={s.dcGroupeT}>En attente de signature<span>{attente.length}</span></div>
          {attente.map(el => suivis[el.cle]
            ? <div key={el.cle} className={s.dcCarte}>{ligne(el)}<SuiviSignature suivi={suivis[el.cle]} onFait={onFait} /></div>
            : ligne(el))}
        </div>
      )}
      {prepa.length > 0 && (
        <div className={s.dcGroupe} data-g="prepa">
          <div className={s.dcGroupeT}>En préparation<span>{prepa.length}</span></div>
          {prepa.map(ligne)}
        </div>
      )}
      {signes.length > 0 && (
        <div className={s.dcGroupe} data-g="signes">
          <div className={s.dcGroupeT}>{signes.some(x => x.courrier) ? 'Signés et envoyés' : 'Signés'}<span>{signes.length}</span></div>
          {signes.slice(0, SIGNES_VISIBLES).map(ligne)}
        </div>
      )}
      {/* Les autres glissent à l'ouverture. */}
      {caches.length > 0 && (
        <>
          <Depliant ouvert={tout} ecart={6}>
            <div className={s.dcListe}>
              {signes.slice(SIGNES_VISIBLES).map(ligne)}
              {annules.length > 0 && (
                <div className={s.dcGroupe} data-g="annules">
                  <div className={s.dcGroupeT}>Annulés<span>{annules.length}</span></div>
                  {annules.map(ligne)}
                </div>
              )}
            </div>
          </Depliant>
          <button type="button" className={s.dcPlus} onClick={() => setTout(t => !t)}>
            {tout ? 'Afficher moins' : signes.length > SIGNES_VISIBLES && annules.length
              ? `Voir les ${caches.length} autres (dont ${annules.length} annulé${annules.length > 1 ? 's' : ''})`
              : annules.length ? `Voir ${annules.length > 1 ? `les ${annules.length} annulés` : 'l’annulé'}` : `Voir les ${caches.length} autre${caches.length > 1 ? 's' : ''}`}
          </button>
        </>
      )}
    </div>
  );
}

/* `confrere` (V3.19) : sur la fiche d'un confrère, « Ses délégations » —
   les mandats que tu lui as confiés (`donnees.confrereId`), et « Déléguer
   un mandat ». */
export default function DocumentsDuClient({ clientId, prenom, onNavigate, confrere = false, ouvert = false }: {
  clientId: string; prenom?: string; onNavigate: (page: string, data?: unknown) => void; confrere?: boolean;
  /* Ouvert d'emblée : l'onglet « Documents » de la fiche contact (V3.29). */
  ouvert?: boolean;
}) {
  const [liste, setListe] = useState<ElementDoc[] | null>(null);
  const [suivis, setSuivis] = useState<Record<string, Suivi>>({});
  const [erreur, setErreur] = useState('');
  /* Relire après un geste (lien renvoyé…) : le tour change, tout se relit. */
  const [tour, setTour] = useState(0);
  /* « + Nouveau document » (V3.32) : la fenêtre du choix s'ouvre ici, sur la
     fiche, sans changer de rubrique ; on ne part dans Documents qu'une fois
     le document créé, pour le remplir. */
  const [nouveau, setNouveau] = useState(false);

  useEffect(() => {
    let vivant = true;
    (async () => {
      const [a, b, c] = await Promise.all([
        confrere
          ? supabase.from('documents').select('*').eq('modele', 'delegation').eq('donnees->>confrereId', clientId).order('updated_at', { ascending: false }).limit(100)
          : supabase.from('documents').select('*').eq('client_id', clientId).order('updated_at', { ascending: false }).limit(100),
        confrere
          ? Promise.resolve({ data: [], error: null })
          : supabase.from('mandats_signatures').select('id, numero, statut, signe_le, retracte_le, pdf_chemin, client_id, recherche_id, mandant, code_envoye_le, created_at')
            .eq('client_id', clientId).order('created_at', { ascending: false }).limit(30),
        /* Le mandat proposé dans son espace, pas encore signé (V3.32). Toute
           la ligne : les colonnes du mandat n'existent qu'après leur SQL. */
        confrere
          ? Promise.resolve({ data: [], error: null })
          : supabase.from('recherches').select('*').eq('client_id', clientId),
      ]);
      if (!vivant) return;
      /* La table des documents absente (SQL pas encore passé) : pas de bloc. */
      if (a.error) { setErreur(a.error.message); setListe([]); return; }
      const docsRows = (a.data || []) as DocumentRow[];
      const mandatsRows = b.error ? [] : ((b.data || []) as (MandatRecherche & SigEspace)[])
        .filter(x => x.statut === 'signe' || x.statut === 'partiel' || x.retracte_le || x.statut === 'en_cours');
      const recs = (c.error ? [] : c.data || []) as { id: string; mandat_propose_le?: string | null; mandat_date_signature?: string | null; mandat_numero?: string | null }[];
      const proposees = recs.filter(r => r.mandat_propose_le && !r.mandat_date_signature
        && !mandatsRows.some(m => m.recherche_id === r.id && (m.statut === 'en_cours' || m.statut === 'signe' || m.statut === 'partiel')));
      let propositions: Proposition[] = [];
      if (proposees.length) {
        const [cl, j] = await Promise.all([
          supabase.from('clients').select('prenom, nom, emails').eq('id', clientId).maybeSingle(),
          supabase.from('journal').select('created_at, metadata').eq('client_id', clientId).eq('type', 'mandat').order('created_at', { ascending: false }).limit(60),
        ]);
        if (!vivant) return;
        const qui = cl.data as { prenom?: string | null; nom?: string | null; emails?: string[] | null } | null;
        const lignesJ = (j.error ? [] : j.data || []) as { created_at: string; metadata: { rappelMandat?: string } | null }[];
        propositions = proposees.map(r => ({
          rechercheId: r.id, clientId, proposeLe: String(r.mandat_propose_le), numero: r.mandat_numero || null,
          nom: `${qui?.prenom || ''} ${qui?.nom || ''}`.trim() || prenom || 'Le client',
          email: (Array.isArray(qui?.emails) ? qui!.emails.find(Boolean) : '') || '',
          rappels: lignesJ.filter(x => x.metadata?.rappelMandat === r.mandat_propose_le).map(x => x.created_at),
        }));
      }
      const elements = [...docsRows.map(depuisDoc), ...mandatsRows.map(depuisMandat), ...propositions.map(depuisProposition)]
        .sort((p, q) => q.date.localeCompare(p.date));
      let lus: Record<string, Suivi> = {};
      try { lus = await lireSuivis({ docs: docsRows, mandats: mandatsRows, propositions }); }
      catch (e) { if (vivant) setErreur((e as Error).message); }
      if (!vivant) return;
      setSuivis(lus);
      setListe(elements);
    })();
    return () => { vivant = false; };
  }, [clientId, confrere, prenom, tour]);

  if (!liste || (erreur && !liste.length)) return null;
  const signes = liste.filter(x => x.statut === 'signe').length;
  const aSigner = liste.filter(x => x.statut === 'pret' && !x.courrier).length;

  return (
    <>
    <BlocRepliable ic={confrere ? 'accord' : 'doc'} titre={confrere ? 'Ses délégations' : 'Ses documents'} n={liste.length} ouvertAuDebut={confrere || ouvert}
      resume={liste.length > 0 && (signes > 0 || aSigner > 0) ? (
        <>
          {aSigner > 0 && <span className={s.dcAttente}><Ic n="plume" t={12} e={2.4} />{`${aSigner} en attente de signature`}</span>}
          {signes > 0 && <span className={s.dcOk}><Ic n="check" t={12} e={2.8} />{`${signes} signé${signes > 1 ? 's' : ''}`}</span>}
        </>
      ) : undefined}
      action={confrere
        ? <button type="button" className={s.dcLien} onClick={() => setNouveau(true)}>+ Déléguer<span className={s.rpLong}> un mandat</span></button>
        : <button type="button" className={s.dcLien} onClick={() => setNouveau(true)}>+ Nouveau<span className={s.rpLong}> document</span></button>}>
      {liste.length ? (
        <>
          <DocsParEtat elements={liste} suivis={suivis} onOuvrir={cle => onNavigate('documents', { ouvrir: cle })} onFait={() => setTour(t => t + 1)} />
          {erreur && <div className={s.dcVide}>{erreur}</div>}
        </>
      ) : (
        <div className={s.dcVide}>{confrere
          ? `Aucune délégation à ${prenom || 'ce confrère'} pour l’instant. Confie-lui un de tes mandats signés avec « Déléguer un mandat » : ses coordonnées se remplissent toutes seules.`
          : `Aucun document pour ${prenom || 'ce client'} pour l’instant. Un mandat, un avenant, un bon de visite ou une offre rattaché à lui apparaîtra ici, avec son exemplaire signé.`}</div>
      )}
    </BlocRepliable>
    {/* Hors du bloc : replié, il ne rend pas ses enfants. */}
    {nouveau && typeof document !== 'undefined' && createPortal(
      <NouveauDocument modeleId={confrere ? 'delegation' : undefined} clientId={confrere ? undefined : clientId} confrereId={confrere ? clientId : undefined}
        onFermer={() => setNouveau(false)}
        onCree={r => { setNouveau(false); onNavigate('documents', { ouvrir: r.id }); }}
        onOuvrir={cle => { setNouveau(false); onNavigate('documents', { ouvrir: cle.startsWith('d-') ? cle.slice(2) : cle }); }} />,
      document.body)}
    </>
  );
}
