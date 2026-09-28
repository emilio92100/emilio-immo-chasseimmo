'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { STATUTS, jourLong, modele, type Categorie, type Statut } from '@/lib/actes';
import { Ic } from './ApercuActe';
import { libStatut, lienFichier, nomFichier, type DocumentRow, type MandatRecherche } from './outils';
import s from './Documents.module.css';

/* ═══ « Ses documents », sur la fiche d'un client (V3.17) ════════════════
   Tout ce qui est rattaché à ce client, du plus récent au plus ancien :
   les documents de la rubrique (mandats, avenants, offres, bons de visite,
   courriers), quel que soit le mode de signature — à la main, en ligne,
   sur place — et ses mandats de recherche signés depuis son espace.
   Un clic ouvre le document dans Documents ; « Signé » ouvre l'exemplaire
   signé. Lecture seule : tout se fait dans la rubrique. */

/* Le statut, bien visible : les mêmes couleurs que la liste, en gras, avec
   son dessin — brouillon, à faire signer, signé, annulé. */
const PICTO_STATUT: Record<string, string> = { brouillon: 'crayon', pret: 'plume', signe: 'check', annule: 'croix' };
export function Pastille({ statut, courrier = false }: { statut: Statut; courrier?: boolean }) {
  const e = STATUTS[statut] || STATUTS.brouillon;
  return <span className={`${s.statut} ${s.statutFort} ${s['t_' + e.ton]}`}><Ic n={PICTO_STATUT[statut] || 'crayon'} t={13} e={2.6} />{libStatut(statut, courrier)}</span>;
}

const CAT_IC: Record<string, string> = { mandats_vente: 'maison', mandats_recherche: 'loupe', offres: 'euro', bons_visite: 'calendrier', courriers: 'boucle' };
const VISIBLES = 5;

type Element = {
  cle: string; categorie: Categorie; statut: Statut; titre: string; sous: string; date: string; courrier: boolean;
  /* L'exemplaire signé : un document de la rubrique, ou un mandat en ligne. */
  signe?: { chemin: string; nom?: string; mandat?: boolean };
};

const jour = (iso?: string | null) => (iso ? jourLong(iso.slice(0, 10)) : '');

function depuisDoc(d: DocumentRow): Element {
  const courrier = !!modele(d.modele)?.courrier;
  const sig = d.signature as { mode?: string } | null | undefined;
  /* La pastille dit l'état ; la ligne dit quand, et comment. */
  const comment = sig?.mode === 'en_ligne' ? 'en ligne' : sig?.mode === 'sur_place' ? 'sur place' : 'à la main';
  const quand = d.statut === 'signe' ? `Le ${jour(d.signe_le)}${courrier ? '' : `, ${comment}`}`
    : d.statut === 'annule' ? (d.annule_le ? `Le ${jour(d.annule_le)}` : '')
      : d.statut === 'pret' ? (sig?.mode ? `Signature ${sig.mode === 'en_ligne' ? 'en ligne' : 'sur place'} en cours` : `Finalisé le ${jour(d.finalise_le)}`)
        : `Modifié le ${jour(d.updated_at)}`;
  return {
    cle: d.id, categorie: d.categorie, statut: d.statut, courrier,
    titre: d.titre || 'Document sans titre',
    sous: [d.numero ? `N° ${d.numero}` : '', quand].filter(Boolean).join(' · '),
    date: d.signe_le || d.annule_le || d.finalise_le || d.updated_at,
    signe: d.statut === 'signe' && d.signe_chemin ? { chemin: d.signe_chemin, nom: nomFichier(d, d.signature ? '-signe' : '') } : undefined,
  };
}

function depuisMandat(x: MandatRecherche): Element {
  const statut: Statut = x.retracte_le ? 'annule' : x.statut === 'signe' || x.statut === 'partiel' ? 'signe' : 'pret';
  return {
    cle: 'r-' + x.id, categorie: 'mandats_recherche', statut, courrier: false,
    titre: 'Mandat de recherche',
    sous: [x.numero ? `N° ${x.numero}` : '',
      x.retracte_le ? `Rétracté le ${jour(x.retracte_le)}` : x.signe_le ? `Le ${jour(x.signe_le)}, en ligne depuis son espace` : 'Signature en cours dans son espace',
      x.statut === 'partiel' ? 'une signature attendue' : ''].filter(Boolean).join(' · '),
    date: x.retracte_le || x.signe_le || x.created_at,
    signe: statut === 'signe' && x.pdf_chemin ? { chemin: x.pdf_chemin, mandat: true } : undefined,
  };
}

export default function DocumentsDuClient({ clientId, prenom, onNavigate }: {
  clientId: string; prenom?: string; onNavigate: (page: string, data?: unknown) => void;
}) {
  const [liste, setListe] = useState<Element[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [tout, setTout] = useState(false);
  const [ouvre, setOuvre] = useState('');

  useEffect(() => {
    let vivant = true;
    (async () => {
      const [a, b] = await Promise.all([
        supabase.from('documents').select('*').eq('client_id', clientId).order('updated_at', { ascending: false }).limit(100),
        supabase.from('mandats_signatures').select('id, numero, statut, signe_le, retracte_le, pdf_chemin, client_id, recherche_id, mandant, created_at')
          .eq('client_id', clientId).order('created_at', { ascending: false }).limit(30),
      ]);
      if (!vivant) return;
      /* La table des documents absente (SQL pas encore passé) : pas de bloc. */
      if (a.error) { setErreur(a.error.message); setListe([]); return; }
      const docs = ((a.data || []) as DocumentRow[]).map(depuisDoc);
      const mandats = b.error ? [] : ((b.data || []) as MandatRecherche[])
        .filter(x => x.statut === 'signe' || x.statut === 'partiel' || x.retracte_le || x.statut === 'en_cours').map(depuisMandat);
      setListe([...docs, ...mandats].sort((p, q) => q.date.localeCompare(p.date)));
    })();
    return () => { vivant = false; };
  }, [clientId]);

  async function ouvrirSigne(el: Element) {
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
      if (onglet) onglet.location.href = url; else window.location.href = url;
    } catch (e) {
      onglet?.close();
      alert('L’exemplaire signé n’a pas pu être ouvert.\n\n' + (e as Error).message);
    }
    setOuvre('');
  }

  if (!liste || (erreur && !liste.length)) return null;
  const signes = liste.filter(x => x.statut === 'signe').length;
  const aSigner = liste.filter(x => x.statut === 'pret').length;
  const montres = tout ? liste : liste.slice(0, VISIBLES);

  return (
    <section className={s.dcBloc}>
      <div className={s.dcTete}>
        <span className={s.dcIc}><Ic n="doc" t={15} /></span>
        <h3>{'Ses documents'}<i>{liste.length ? ` · ${liste.length}` : ''}</i></h3>
        <button type="button" className={s.dcLien} onClick={() => onNavigate('documents', { nouveau: clientId })}>+ Nouveau document</button>
      </div>
      {liste.length > 0 && (signes > 0 || aSigner > 0) && (
        <div className={s.dcCompte}>
          {signes > 0 && <span className={s.dcOk}><Ic n="check" t={12} e={2.8} />{`${signes} signé${signes > 1 ? 's' : ''}`}</span>}
          {aSigner > 0 && <span className={s.dcAttente}><Ic n="plume" t={12} e={2.4} />{`${aSigner} à faire signer ou à envoyer`}</span>}
        </div>
      )}
      {liste.length ? (
        <div className={s.dcListe}>
          {montres.map(el => (
            <div key={el.cle} className={s.dcLigne}>
              <button type="button" className={s.dcOuvrir} onClick={() => onNavigate('documents', { ouvrir: el.cle })} title="Ouvrir dans Documents">
                <span className={`${s.dcCat} ${s['dcCat_' + el.categorie] || ''}`}><Ic n={CAT_IC[el.categorie] || 'doc'} t={15} /></span>
                <span className={s.dcTexte}><b>{el.titre}</b><small>{el.sous}</small></span>
                <Pastille statut={el.statut} courrier={el.courrier} />
              </button>
              {el.signe && (
                <button type="button" className={s.dcSigne} disabled={ouvre === el.cle} onClick={() => ouvrirSigne(el)} title={el.courrier ? 'La preuve d’envoi' : 'L’exemplaire signé'}>
                  <Ic n="doc" t={14} /><span>{ouvre === el.cle ? 'Ouverture…' : el.courrier ? 'Preuve' : 'PDF signé'}</span>
                </button>
              )}
            </div>
          ))}
          {liste.length > VISIBLES && (
            <button type="button" className={s.dcPlus} onClick={() => setTout(t => !t)}>
              {tout ? 'Afficher moins' : `Voir les ${liste.length - VISIBLES} autre${liste.length - VISIBLES > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      ) : (
        <div className={s.dcVide}>{`Aucun document pour ${prenom || 'ce client'} pour l’instant. Un mandat, un avenant, un bon de visite ou une offre rattaché à lui apparaîtra ici, avec son exemplaire signé.`}</div>
      )}
    </section>
  );
}
