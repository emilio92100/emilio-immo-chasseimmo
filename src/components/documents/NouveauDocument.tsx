'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MODELES, modele, type Contexte } from '@/lib/actes';
import { Croix, Ic } from './ApercuActe';
import { colonnesListe, identiteDuJour, tableAbsente, type DocumentRow } from './outils';
import s from './Documents.module.css';

/* ═══ Nouveau document ════════════════════════════════════════════════════
   1. Le modèle (mandat de vente, offre d'achat, bon de visite).
   2. Pour qui : un client du CRM et, s'il y a lieu, l'un de ses biens —
      nom, adresse, bien, prix, date de visite se remplissent seuls. Ou
      rien : on part d'un document vierge.
   Puis le brouillon est créé et l'éditeur s'ouvre. */

type ClientMini = { id: string; prenom: string; nom: string; adresse?: string | null; emails?: string[] | null; telephones?: string[] | null };
type BienMini = NonNullable<Contexte['bien']> & { recherche_id?: string | null; prix_vendeur?: number | null };

const sansAccent = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function NouveauDocument({ modeleId, onFermer, onCree }: {
  modeleId?: string | null;
  onFermer: () => void;
  onCree: (d: DocumentRow) => void;
}) {
  const [choix, setChoix] = useState<string>(modeleId || '');
  const [etape, setEtape] = useState<1 | 2>(modeleId ? 2 : 1);
  const [clients, setClients] = useState<ClientMini[] | null>(null);
  const [cherche, setCherche] = useState('');
  const [client, setClient] = useState<ClientMini | null>(null);
  const [biens, setBiens] = useState<BienMini[] | null>(null);
  const [bien, setBien] = useState<BienMini | null>(null);
  const [erreur, setErreur] = useState('');
  const [travail, setTravail] = useState(false);
  const m = choix ? modele(choix) : null;

  /* Les clients, une fois, pour chercher sans attendre. */
  useEffect(() => {
    if (etape !== 2 || clients) return;
    supabase.from('clients').select('id, prenom, nom, adresse, emails, telephones').order('created_at', { ascending: false }).limit(1000)
      .then(({ data, error }) => {
        if (error) { setErreur('Les clients n’ont pas pu être lus : ' + error.message); setClients([]); return; }
        setClients((data || []) as ClientMini[]);
      });
  }, [etape, clients]);

  /* Les biens du client choisi. */
  useEffect(() => {
    setBien(null); setBiens(null);
    if (!client) return;
    supabase.from('biens')
      .select('id, titre, adresse, code_postal, ville, quartier, type_bien, surface, nb_pieces, etage, prix_acquereur, prix_vendeur, agence_nom, recherche_id')
      .eq('client_id', client.id).order('created_at', { ascending: false }).limit(60)
      .then(({ data, error }) => {
        if (error) { setErreur('Ses biens n’ont pas pu être lus : ' + error.message); setBiens([]); return; }
        setBiens((data || []) as BienMini[]);
      });
  }, [client]);

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
      const identite = await identiteDuJour();
      let visite: Contexte['visite'] = null;
      if (bien && m.id === 'bon_visite') {
        const { data, error } = await supabase.from('visites').select('date_visite, heure')
          .eq('bien_id', bien.id).neq('statut', 'annulee').order('date_visite', { ascending: false }).limit(1);
        if (error) throw new Error('La visite n’a pas pu être lue : ' + error.message);
        visite = data?.[0] || null;
      }
      const donnees = m.defaut({ identite, client, bien, visite });
      const { data, error } = await supabase.from('documents').insert({
        modele: m.id, categorie: m.categorie, statut: 'brouillon', donnees, ...colonnesListe(m, donnees),
        client_id: client?.id || null, bien_id: bien?.id || null, recherche_id: bien?.recherche_id || null,
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
            <h3>{etape === 1 ? 'Nouveau document' : m ? `${m.titre} : pour qui ?` : 'Pour qui ?'}</h3>
            <p>{etape === 1
              ? 'Choisis le modèle. Tout reste modifiable ensuite, et l’aperçu suit chaque réponse.'
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
            <div className={s.champLigne}>
              <label htmlFor="nd-client">Le client</label>
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

            {client && (
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
            {erreur && <div className={s.erreur}>{erreur}</div>}
          </div>
        )}

        <div className={s.fenPied}>
          {etape === 2 && !modeleId && <button type="button" className={s.btn} disabled={travail} onClick={() => setEtape(1)}>Changer de modèle</button>}
          {etape === 2 && (
            <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={travail} onClick={creer}>
              {travail ? 'Création…' : client ? 'Créer le document' : 'Créer un document vierge'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
