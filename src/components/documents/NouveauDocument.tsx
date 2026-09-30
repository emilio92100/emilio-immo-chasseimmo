'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toutLire } from '@/lib/registre';
import { MODELES, modele, type Contexte } from '@/lib/actes';
import { depuisConfrere, type ContactConfrere } from '@/lib/actes/delegation';
import { ligneContact, lirePro, typesDe } from '@/lib/contacts';
import { Croix, Ic } from './ApercuActe';
import { etapeDe, type BienVente } from '@/lib/biens-vente';
import { jourParis } from '@/lib/mandat';
import { creerDocument } from '@/components/biens/outils';
import { conseilMandat, mandatRechercheEnCours, mandatVenteEnCours, phraseMandat, type MandatEnCours } from '@/lib/coherence';
import { cleRecherche, colonnesListe, identiteDuJour, mandatsPour, preparerDepuis, tableAbsente, type DocumentRow, type MandatChoix } from './outils';
import s from './Documents.module.css';

/* ═══ Nouveau document ════════════════════════════════════════════════════
   1. Le modèle.
   2. Pour qui : un client du CRM et, selon le modèle, l'un de ses biens
      (mandat de vente, offre, bon de visite) ou l'une de ses recherches
      (mandat de recherche) — tout ce que le CRM sait se remplit seul.
      Ou rien : on part d'un document vierge.
      Un avenant ou un courrier part d'un mandat : on le cherche d'abord,
      parmi tous (un nom, un numéro, une adresse), et le client vient avec.
   Puis le brouillon est créé et l'éditeur s'ouvre. */

type ClientMini = { id: string; prenom: string; nom: string; adresse?: string | null; emails?: string[] | null; telephones?: string[] | null };
type BienMini = NonNullable<Contexte['bien']> & { recherche_id?: string | null; prix_vendeur?: number | null };
type RechercheMini = Record<string, unknown> & { id: string; nom?: string | null; active?: boolean | null; mandat_date_signature?: string | null; mandat_date_expiration?: string | null };

const sansAccent = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/* « Mandataire IAD · Agence du Parc », sous le nom d'un confrère. */
const ligneConfrere = (c: ContactConfrere) => ligneContact({ types: ['confrere'], pro: c.pro }) || 'Confrère';

export default function NouveauDocument({ modeleId, clientId, confrereId, onFermer, onCree, onOuvrir }: {
  modeleId?: string | null;
  /* Venu de la fiche d'un client : il est choisi d'avance (on peut changer). */
  clientId?: string | null;
  /* Une délégation venue de la fiche d'un confrère : lui aussi (V3.19). */
  confrereId?: string | null;
  onFermer: () => void;
  onCree: (d: DocumentRow) => void;
  /* Ouvrir un document existant (« d-<id> ») ou un mandat signé en ligne
     (« r-<id> ») : le mandat déjà en cours (V3.32). */
  onOuvrir?: (cle: string) => void;
}) {
  const [recherches, setRecherches] = useState<RechercheMini[] | null>(null);
  const [recherche, setRecherche] = useState<RechercheMini | null>(null);
  const [mandats, setMandats] = useState<{ modele: string; liste: MandatChoix[] } | null>(null);
  const [mandat, setMandat] = useState<MandatChoix | null>(null);
  const [sansMandat, setSansMandat] = useState(false);
  const [chercheM, setChercheM] = useState('');
  const [choix, setChoix] = useState<string>(modeleId || '');
  const [etape, setEtape] = useState<1 | 2>(modeleId ? 2 : 1);
  const [clients, setClients] = useState<ClientMini[] | null>(null);
  const [cherche, setCherche] = useState('');
  const [client, setClient] = useState<ClientMini | null>(null);
  const [biens, setBiens] = useState<BienMini[] | null>(null);
  const [bien, setBien] = useState<BienMini | null>(null);
  /* Un mandat de vente part d'un bien que le client VEND (la rubrique
     Biens), pas des biens trouvés pour lui comme acheteur (V3.17). */
  const [enVente, setEnVente] = useState<BienVente[] | null>(null);
  const [bienVente, setBienVente] = useState<BienVente | null>(null);
  const [erreur, setErreur] = useState('');
  const [travail, setTravail] = useState(false);
  const m = choix ? modele(choix) : null;
  /* Une délégation : le confrère, pris dans tes contacts (V3.19). Facultatif :
     sinon, tout se saisit dans la délégation. */
  const pourDeleguer = m?.id === 'delegation';
  const [confreres, setConfreres] = useState<ContactConfrere[] | null>(null);
  const [confrere, setConfrere] = useState<ContactConfrere | null>(null);
  const [sansConfrere, setSansConfrere] = useState(false);
  const [chercheC, setChercheC] = useState('');
  useEffect(() => {
    if (etape !== 2 || !pourDeleguer || confreres) return;
    toutLire<Record<string, unknown>>((de, a) => supabase.from('clients').select('id, civilite, prenom, nom, emails, telephones, types, pro, archive').order('created_at', { ascending: false }).order('id').range(de, a))
      .then(({ data, erreur: error }) => {
        /* Les types de contact pas encore installés : pas de choix, on saisit. */
        if (error) { setConfreres([]); return; }
        const l = ((data || []) as (ContactConfrere & { types?: unknown; archive?: unknown })[])
          .filter(x => typesDe(x).includes('confrere') && (x.archive !== true || x.id === confrereId));
        setConfreres(l);
        if (confrereId) setConfrere(c => c || l.find(x => x.id === confrereId) || null);
      });
  }, [etape, pourDeleguer, confreres, confrereId]);
  const trouvesC = useMemo(() => {
    if (!confreres) return [];
    const q = sansAccent(chercheC.trim());
    return (q ? confreres.filter(x => sansAccent(`${x.prenom || ''} ${x.nom || ''} ${lirePro(x.pro).agence || ''} ${lirePro(x.pro).reseau || ''}`).includes(q)) : confreres).slice(0, 8);
  }, [confreres, chercheC]);

  /* Les clients, une fois, pour chercher sans attendre. */
  useEffect(() => {
    if (etape !== 2 || clients) return;
    toutLire<Record<string, unknown>>((de, a) => supabase.from('clients').select('id, prenom, nom, adresse, emails, telephones').order('created_at', { ascending: false }).order('id').range(de, a))
      .then(({ data, erreur: error }) => {
        if (error) { setErreur('Les clients n’ont pas pu être lus : ' + error); setClients([]); return; }
        const l = (data || []) as ClientMini[];
        setClients(l);
        if (clientId) setClient(c => c || l.find(x => x.id === clientId) || null);
      });
  }, [etape, clients, clientId]);

  const lien = m?.lien || 'bien';

  /* Ses recherches (mandat de recherche) : la plus récente active d'abord. */
  useEffect(() => {
    setRecherche(null); setRecherches(null);
    if (!client || lien !== 'recherche') return;
    supabase.from('recherches')
      .select('id, nom, active, type_bien, nb_pieces_min, chambres_min, surface_min, secteurs, budget_max, mandat_taux, mandat_forfait, mandat_numero, mandat_date_signature, mandat_date_expiration')
      .eq('client_id', client.id).order('created_at', { ascending: false }).limit(20)
      .then(({ data, error }) => {
        if (error) { setErreur('Ses recherches n’ont pas pu être lues : ' + error.message); setRecherches([]); return; }
        const l = (data || []) as RechercheMini[];
        setRecherches(l);
        setRecherche(l.find(r => r.active !== false) || l[0] || null);
      });
  }, [client, lien]);

  /* Tous les mandats d'où ce modèle peut partir (avenant, courrier) : les
     documents, et pour un avenant de recherche les mandats signés en ligne. */
  useEffect(() => {
    if (etape !== 2 || lien !== 'mandat' || !m?.deriver || mandats?.modele === m.id) return;
    let vivant = true;
    mandatsPour(m)
      .then(l => {
        if (!vivant) return;
        setMandats({ modele: m.id, liste: l });
        /* Venu de « Faire un avenant » : le mandat en cours, déjà choisi. */
        const voulu = mandatVoulu.current ? l.find(y => y.cle === mandatVoulu.current) : null;
        mandatVoulu.current = null;
        if (voulu) setMandat(voulu);
      })
      .catch(e => { if (vivant) { setErreur((e as Error).message); setMandats({ modele: m.id, liste: [] }); } });
    return () => { vivant = false; };
  }, [etape, lien, m, mandats?.modele]);
  const listeM = mandats?.modele === m?.id ? mandats?.liste || null : null;
  const trouvesM = useMemo(() => {
    if (!listeM) return [];
    const q = sansAccent(chercheM.trim());
    return (q ? listeM.filter(x => cleRecherche(x).includes(q)) : listeM).slice(0, 8);
  }, [listeM, chercheM]);

  const pourVendre = m?.id === 'mandat_vente';
  /* Les biens qu'il vend, pour un mandat de vente. */
  useEffect(() => {
    setBienVente(null); setEnVente(null);
    if (!client || !pourVendre) return;
    supabase.from('biens_vente').select('*').eq('client_id', client.id).order('updated_at', { ascending: false }).limit(30)
      .then(({ data, error }) => {
        if (error) { setErreur('Ses biens en vente n’ont pas pu être lus : ' + error.message); setEnVente([]); return; }
        const l = ((data || []) as BienVente[]).filter(x => !x.archive);
        setEnVente(l);
        setBienVente(l[0] || null);
      });
  }, [client, pourVendre]);

  /* Les biens du client choisi (côté acheteur : offre, bon de visite). */
  useEffect(() => {
    setBien(null); setBiens(null);
    if (!client || lien !== 'bien' || pourVendre) return;
    supabase.from('biens')
      .select('id, titre, adresse, code_postal, ville, quartier, type_bien, surface, nb_pieces, etage, prix_acquereur, prix_vendeur, agence_nom, recherche_id')
      .eq('client_id', client.id).order('created_at', { ascending: false }).limit(60)
      .then(({ data, error }) => {
        if (error) { setErreur('Ses biens n’ont pas pu être lus : ' + error.message); setBiens([]); return; }
        setBiens((data || []) as BienMini[]);
      });
  }, [client, lien, pourVendre]);

  /* Un seul mandat en cours (V3.32, src/lib/coherence.ts) : un mandat de
     vente pour ce bien, un mandat de recherche pour cette recherche. S'il y
     en a déjà un, on ne crée pas : on propose de le reprendre, de faire un
     avenant, ou de l'annuler d'abord. */
  const [verif, setVerif] = useState<{ cle: string; x: MandatEnCours | null } | null>(null);
  const aVerifier = pourVendre && bienVente ? `v-${bienVente.id}` : m?.id === 'mandat_recherche' && recherche ? `r-${recherche.id}` : '';
  const bloque = aVerifier && verif?.cle === aVerifier ? verif.x : null;
  const verifie = !!aVerifier && verif?.cle !== aVerifier;
  useEffect(() => {
    if (!aVerifier) return;
    let vivant = true;
    const p = aVerifier.startsWith('v-') && bienVente ? mandatVenteEnCours(bienVente) : mandatRechercheEnCours(aVerifier.slice(2));
    p.then(x => { if (vivant) setVerif({ cle: aVerifier, x }); })
      .catch(e => { if (vivant) { setErreur((e as Error).message); setVerif({ cle: aVerifier, x: null }); } });
    return () => { vivant = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aVerifier]);
  /* L'avenant au mandat en cours : le même geste, sur le bon modèle ; le
     mandat se choisit tout seul quand la liste arrive. */
  const mandatVoulu = useRef<string | null>(null);
  function versAvenant(x: MandatEnCours) {
    setMandat(null); setSansMandat(false); setChercheM('');
    mandatVoulu.current = x.cle;
    setChoix(x.sorte === 'vente' ? 'avenant_vente' : 'avenant_recherche');
    setEtape(2);
  }

  const trouves = useMemo(() => {
    if (!clients) return [];
    const q = sansAccent(cherche.trim());
    const l = q ? clients.filter(c => sansAccent(`${c.prenom} ${c.nom} ${c.nom} ${c.prenom}`).includes(q)) : clients;
    return l.slice(0, 8);
  }, [clients, cherche]);

  async function creer() {
    if (!m) return;
    setTravail(true); setErreur('');
    try {
      /* Un bien en vente choisi : le même mandat prérempli que depuis sa
         fiche (propriétaires, prix, honoraires), relié au bien. */
      if (pourVendre && bienVente) {
        const id = await creerDocument(bienVente, { modele: 'mandat_vente', clientId: client?.id });
        const { data, error } = await supabase.from('documents').select('*').eq('id', id).single();
        if (error || !data) throw new Error('Le mandat est créé, mais il n’a pas pu être ouvert : ' + (error?.message || 'introuvable') + '. Il est dans la liste des documents.');
        onCree(data as DocumentRow);
        return;
      }
      const identite = await identiteDuJour();
      let visite: Contexte['visite'] = null;
      if (bien && m.id === 'bon_visite') {
        const { data, error } = await supabase.from('visites').select('date_visite, heure')
          .eq('bien_id', bien.id).neq('statut', 'annulee').order('date_visite', { ascending: false }).limit(1);
        if (error) throw new Error('La visite n’a pas pu être lue : ' + error.message);
        visite = data?.[0] || null;
      }
      const avecMandat = lien === 'mandat' && !!mandat;
      let donnees = avecMandat
        ? await preparerDepuis(m, mandat!, identite)
        : m.defaut({ identite, client, bien, visite, recherche });
      if (pourDeleguer && confrere) donnees = { ...donnees, ...depuisConfrere(confrere) };
      const { data, error } = await supabase.from('documents').insert({
        modele: m.id, categorie: m.categorie, statut: 'brouillon', donnees, ...colonnesListe(m, donnees),
        client_id: (avecMandat ? mandat!.client_id : null) || client?.id || null,
        bien_id: bien?.id || (avecMandat ? mandat!.bien_id : null) || null,
        recherche_id: recherche?.id || bien?.recherche_id || (avecMandat ? mandat!.recherche_id : null) || null,
      }).select().single();
      if (error) {
        throw new Error(tableAbsente(error.message)
          ? 'La table des documents n’existe pas encore : passe d’abord outils/sql/documents.sql dans Supabase.'
          : 'Le document n’a pas pu être créé : ' + error.message);
      }
      onCree(data as DocumentRow);
    } catch (e) {
      setErreur((e as Error).message);
      setTravail(false);
    }
  }

  return (
    <div className={s.fenetre} onClick={e => { if (e.target === e.currentTarget && !travail) onFermer(); }}>
      <div className={s.fenetreIn} role="dialog" aria-modal="true" aria-label="Nouveau document">
        <div className={s.fenTete}>
          {m && etape === 2 && <span className={s.modeleIc}><Ic n={m.ic} t={19} /></span>}
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h3>{etape === 1 ? 'Nouveau document' : m ? `${m.titre} : ${lien === 'mandat' ? 'sur quel mandat ?' : 'pour qui ?'}` : 'Pour qui ?'}</h3>
            <p>{etape === 1
              ? 'Choisis le modèle. Tout reste modifiable ensuite, et l’aperçu suit chaque réponse.'
              : m?.lien === 'recherche'
                ? 'Choisis le client puis sa recherche : son nom, son adresse, le bien recherché et ton taux se remplissent tout seuls.'
                : m?.lien === 'mandat'
                  ? 'Cherche le mandat par un nom, un numéro ou une adresse : les signataires, le numéro, les dates et le client sont repris tels quels.'
                  : 'Choisis un client pour que son nom, son adresse et le bien se remplissent tout seuls. Sinon, pars d’un document vierge.'}</p>
          </div>
          <button type="button" className={s.panFermer} aria-label="Fermer" onClick={onFermer} disabled={travail}><Croix /></button>
        </div>

        {etape === 1 && (
          <div className={s.fenCorps}>
            {MODELES.map(x => (
              <button key={x.id} type="button" className={`${s.choix} ${choix === x.id ? s.choixOn : ''}`}
                onClick={() => { setChoix(x.id); setEtape(2); }}>
                <span className={s.modeleIc}><Ic n={x.ic} t={19} /></span>
                <span><b>{x.titre}</b><small>{x.description}</small></span>
              </button>
            ))}
          </div>
        )}

        {etape === 2 && m && (
          <div className={s.fenCorps}>
            {lien === 'mandat' && (
              <div className={s.champLigne}>
                <label htmlFor="nd-mandat">Le mandat</label>
                {mandat ? (
                  <div className={`${s.resultat} ${s.resultatOn}`} style={{ border: '1px solid #ecdcb0', borderRadius: 12 }}>
                    <Ic n={mandat.enLigne ? 'ecran' : 'doc'} t={16} />
                    <span className={s.resDeux}><b>{mandat.titre}</b><i>{[mandat.numero ? `N° ${mandat.numero}` : '', mandat.sous].filter(Boolean).join(' · ')}</i></span>
                    <button type="button" className={s.btnLien} onClick={() => setMandat(null)}>Changer</button>
                  </div>
                ) : sansMandat ? (
                  <div className={`${s.resultat} ${s.resultatOn}`} style={{ border: '1px solid #ecdcb0', borderRadius: 12 }}>
                    <Ic n="plume" t={16} /><span>Sans mandat : tu saisiras tout</span>
                    <button type="button" className={s.btnLien} style={{ marginLeft: 'auto' }} onClick={() => setSansMandat(false)}>Changer</button>
                  </div>
                ) : (
                  <>
                    <input id="nd-mandat" className={s.cherche} placeholder="Un nom, un numéro, une adresse…" value={chercheM}
                      onChange={e => setChercheM(e.target.value)} autoComplete="off" autoFocus />
                    {listeM === null ? <div className={s.chAide}>Chargement des mandats…</div> : (
                      <div className={s.resultats}>
                        {trouvesM.map(x => (
                          <button key={x.cle} type="button" className={s.resultat} onClick={() => setMandat(x)}>
                            <Ic n={x.enLigne ? 'ecran' : 'doc'} t={16} />
                            <span className={s.resDeux}><b>{x.titre}</b><i>{x.sous || '—'}</i></span>
                            {x.numero ? <small>{`n° ${x.numero}`}</small> : null}
                          </button>
                        ))}
                        {trouvesM.length === 0 && <div className={s.resultat} style={{ cursor: 'default', color: '#64748b' }}>{listeM.length ? 'Aucun mandat ne correspond.' : 'Aucun mandat signé pour l’instant.'}</div>}
                        <button type="button" className={s.resultat} onClick={() => setSansMandat(true)}>
                          <Ic n="plume" t={16} /><span>Aucun mandat : je saisirai tout</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {pourDeleguer && (
              <div className={s.champLigne}>
                <label htmlFor="nd-confrere">Le confrère</label>
                {confrere ? (
                  <div className={`${s.resultat} ${s.resultatOn}`} style={{ border: '1px solid #ecdcb0', borderRadius: 12 }}>
                    <Ic n="agence" t={16} />
                    <span className={s.resDeux}><b>{`${confrere.prenom || ''} ${confrere.nom || ''}`.trim() || 'Confrère'}</b><i>{ligneConfrere(confrere)}</i></span>
                    <button type="button" className={s.btnLien} onClick={() => setConfrere(null)}>Changer</button>
                  </div>
                ) : sansConfrere ? (
                  <div className={`${s.resultat} ${s.resultatOn}`} style={{ border: '1px solid #ecdcb0', borderRadius: 12 }}>
                    <Ic n="plume" t={16} /><span>Pas dans mes contacts : je le saisirai</span>
                    <button type="button" className={s.btnLien} style={{ marginLeft: 'auto' }} onClick={() => setSansConfrere(false)}>Changer</button>
                  </div>
                ) : (
                  <>
                    <input id="nd-confrere" className={s.cherche} placeholder="Un nom, une agence, un réseau…" value={chercheC}
                      onChange={e => setChercheC(e.target.value)} autoComplete="off" />
                    {confreres === null ? <div className={s.chAide}>Chargement de tes confrères…</div> : (
                      <div className={s.resultats}>
                        {trouvesC.map(x => (
                          <button key={x.id} type="button" className={s.resultat} onClick={() => setConfrere(x)}>
                            <Ic n="agence" t={16} />
                            <span className={s.resDeux}><b>{`${x.prenom || ''} ${x.nom || ''}`.trim() || 'Confrère'}</b><i>{ligneConfrere(x)}</i></span>
                          </button>
                        ))}
                        {trouvesC.length === 0 && <div className={s.resultat} style={{ cursor: 'default', color: '#64748b' }}>{confreres.length ? 'Aucun confrère ne correspond.' : 'Aucun confrère dans tes contacts pour l’instant.'}</div>}
                        <button type="button" className={s.resultat} onClick={() => setSansConfrere(true)}>
                          <Ic n="plume" t={16} /><span>Pas dans mes contacts : je le saisirai</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
                <div className={s.chAide}>{confrere
                  ? (lirePro(confrere.pro).juridique?.le
                    ? 'Tout ce que sa fiche et sa dernière délégation savent de lui se remplit : coordonnées, société, carte, garanties.'
                    : 'Son agence et ses coordonnées se remplissent depuis sa fiche. Sa société, sa carte et ses garanties seront gardées sur sa fiche pour la prochaine fois.')
                  : 'Choisis-le dans tes contacts : ses coordonnées se remplissent toutes seules.'}</div>
              </div>
            )}

            {lien === 'mandat' && mandat?.client_id ? (
              <div className={s.chAide}>{`Le client est repris du mandat${mandat.client ? ` : ${mandat.client}` : ''}. Le document sera rangé sur sa fiche${m.interne ? ', sans jamais apparaître dans son espace' : ''}.`}</div>
            ) : (lien !== 'mandat' || mandat || sansMandat) && (
            <div className={s.champLigne}>
              <label htmlFor="nd-client">{lien === 'mandat' ? 'Le client (pour ranger le document sur sa fiche)' : 'Le client'}</label>
              {client ? (
                <div className={`${s.resultat} ${s.resultatOn}`} style={{ border: '1px solid #ecdcb0', borderRadius: 12 }}>
                  <Ic n="personne" t={16} />
                  <b>{`${client.prenom} ${client.nom}`}</b>
                  <button type="button" className={s.btnLien} style={{ marginLeft: 'auto' }} onClick={() => setClient(null)}>Changer</button>
                </div>
              ) : (
                <>
                  <input id="nd-client" className={s.cherche} placeholder="Chercher un client par son nom…" value={cherche}
                    onChange={e => setCherche(e.target.value)} autoComplete="off" autoFocus />
                  {clients === null
                    ? <div className={s.chAide}>Chargement des clients…</div>
                    : trouves.length > 0 && (
                      <div className={s.resultats}>
                        {trouves.map(c => (
                          <button key={c.id} type="button" className={s.resultat} onClick={() => setClient(c)}>
                            <Ic n="personne" t={16} /><span>{`${c.prenom} ${c.nom}`}</span>
                            {c.adresse && <small>{c.adresse.slice(0, 40)}</small>}
                          </button>
                        ))}
                      </div>
                    )}
                </>
              )}
            </div>
            )}

            {client && lien === 'recherche' && (
              <div className={s.champLigne}>
                <label>Sa recherche</label>
                {recherches === null ? <div className={s.chAide}>Chargement de ses recherches…</div>
                  : recherches.length === 0 ? <div className={s.chAide}>Aucune recherche sur sa fiche : tu décriras le bien recherché dans le document.</div>
                    : (
                      <div className={s.resultats}>
                        {recherches.map(r => {
                          const valide = !!r.mandat_date_signature && (!r.mandat_date_expiration || String(r.mandat_date_expiration).slice(0, 10) >= jourParis());
                          return (
                            <button key={r.id} type="button" className={`${s.resultat} ${recherche?.id === r.id ? s.resultatOn : ''}`} onClick={() => setRecherche(r)}>
                              <Ic n="loupe" t={16} />
                              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nom || 'Recherche'}</span>
                              <small>{valide ? 'mandat déjà signé' : r.active === false ? 'close' : 'en cours'}</small>
                            </button>
                          );
                        })}
                      </div>
                    )}
              </div>
            )}

            {client && pourVendre && (
              <div className={s.champLigne}>
                <label>Le bien qu’il vend</label>
                {enVente === null ? <div className={s.chAide}>Chargement de ses biens en vente…</div>
                  : (
                    <div className={s.resultats}>
                      {enVente.map(x => (
                        <button key={x.id} type="button" className={`${s.resultat} ${bienVente?.id === x.id ? s.resultatOn : ''}`} onClick={() => setBienVente(x)}>
                          <Ic n="maison" t={16} />
                          <span className={s.resDeux}>
                            <b>{x.titre || [x.adresse, x.ville].filter(Boolean).join(', ') || 'Bien sans titre'}</b>
                            <i>{[x.adresse, x.ville].filter(Boolean).join(', ') || etapeDe(x.etape).lib}</i>
                          </span>
                          <small>{etapeDe(x.etape).court}</small>
                        </button>
                      ))}
                      <button type="button" className={`${s.resultat} ${!bienVente ? s.resultatOn : ''}`} onClick={() => setBienVente(null)}>
                        <Ic n="doc" t={16} /><span>{enVente.length ? 'Aucun de ceux-là, je saisirai le bien' : 'Aucun bien en vente sur sa fiche : je saisirai le bien'}</span>
                      </button>
                    </div>
                  )}
                <div className={s.chAide}>{enVente && enVente.length
                  ? 'Ses biens de la rubrique « Biens » : le mandat reprend les propriétaires, l’adresse, le prix et les honoraires.'
                  : 'Astuce : crée d’abord le bien dans « Biens » ; son mandat se prépare alors tout seul, depuis sa fiche.'}</div>
              </div>
            )}

            {client && lien === 'bien' && !pourVendre && (
              <div className={s.champLigne}>
                <label>Le bien</label>
                {biens === null ? <div className={s.chAide}>Chargement de ses biens…</div>
                  : biens.length === 0 ? <div className={s.chAide}>Aucun bien sur sa fiche : tu saisiras l’adresse dans le document.</div>
                    : (
                      <div className={s.resultats}>
                        <button type="button" className={`${s.resultat} ${!bien ? s.resultatOn : ''}`} onClick={() => setBien(null)}>
                          <Ic n="doc" t={16} /><span>Aucun, je saisirai le bien</span>
                        </button>
                        {biens.map(b => (
                          <button key={b.id} type="button" className={`${s.resultat} ${bien?.id === b.id ? s.resultatOn : ''}`} onClick={() => setBien(b)}>
                            <Ic n="maison" t={16} />
                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.titre || [b.adresse, b.ville].filter(Boolean).join(', ') || 'Bien sans titre'}</span>
                            {b.prix_acquereur ? <small>{`${new Intl.NumberFormat('fr-FR').format(b.prix_acquereur).replace(/[\u202f\u00a0]/g, ' ')} €`}</small> : null}
                          </button>
                        ))}
                      </div>
                    )}
              </div>
            )}
            {bloque && (
              <div className={s.bloqueMandat} role="alert">
                <span className={s.bloqueIc}><Ic n="info" t={18} /></span>
                <div className={s.bloqueTx}>
                  <b>{phraseMandat(bloque)}</b>
                  <span>{conseilMandat(bloque)}</span>
                  <div className={s.bloqueBtns}>
                    {bloque.etat !== 'signe' && bloque.cle && onOuvrir && <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={() => onOuvrir(bloque.cle!)}>Reprendre ce mandat</button>}
                    {bloque.etat === 'signe' && <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={() => versAvenant(bloque)}>Faire un avenant</button>}
                    {bloque.etat === 'signe' && bloque.cle && onOuvrir && <button type="button" className={s.btn} onClick={() => onOuvrir(bloque.cle!)}>Voir le mandat en cours</button>}
                  </div>
                </div>
              </div>
            )}
            {erreur && <div className={s.erreur}>{erreur}</div>}
          </div>
        )}

        <div className={s.fenPied}>
          {etape === 2 && !modeleId && <button type="button" className={s.btn} disabled={travail} onClick={() => setEtape(1)}>Changer de modèle</button>}
          {etape === 2 && (
            <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={travail || verifie || !!bloque || (lien === 'mandat' && !mandat && !sansMandat)} onClick={creer}>
              {travail ? 'Préparation…' : verifie ? 'Vérification…' : bloque ? 'Déjà un mandat en cours' : lien === 'mandat' && !mandat && !sansMandat ? 'Choisis un mandat' : lien === 'mandat' && mandat ? `Préparer ${m?.courrier ? 'le courrier' : m?.id === 'delegation' ? 'la délégation' : 'l’avenant'}` : client ? 'Créer le document' : 'Créer un document vierge'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
