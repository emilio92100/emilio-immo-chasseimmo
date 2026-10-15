'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { signalerEchec, verifie } from '@/lib/ecritures';
import { signalerMaj } from '@/lib/intentions';
import { lireIndispo, marquerIndispo } from '@/lib/biens-indispo';
import {
  AVEC, DISPOS, REPONSES, SQL_CLIENT, cleDuJour, colonnesClientAbsentes, contactDu, contactEnLigne, corrigerAdresse, creneauDeLaVisite, creneauxOuverts, etatSuivi, quandNote, texteCreneau,
  type Creneau, type LigneSuivi, type VisiteCalee,
} from '@/lib/suivi-agence';
import { appelsMontres, phraseAppel } from '@/lib/suivi-client';
import { ChoixDateHeure, ChoixJour } from '@/components/pages/PageAgenda';
import { Icone } from './ParcoursBien';
import s from './SuiviAgence.module.css';

/* ═══ « Mon suivi avec l'agence », sous chaque bien présenté (V3.182) ═════
   Alexandre : « savoir qui je dois contacter, le compte rendu de ce qui a été
   dit avec l'agence qui a le mandat ou le propriétaire, les créneaux […] que
   ça se déplie, que ce soit bien rangé ». Maquettes validées le 13 octobre
   (canvas « Suivi des demandes de visite »).

   Replié : une ligne — où l'on en est, le début de la dernière note.
   Déplié : le contact (appeler, écrire), une note rapide, l'historique. Chaque
   appel noté (« Noter un appel ») peut porter les créneaux donnés par
   l'agence : « Valider ce créneau » ouvre « Planifier une visite », rempli.
   Interne : ce qui a été dit n'arrive jamais dans l'espace du client.

   V3.193 — Alexandre : « que le client voie que je travaille dessus ».
   Chaque appel peut s'y montrer en ÉTAPE neutre (« Alexandre a laissé un
   message au vendeur », src/lib/suivi-client.ts), avec un mot de lui s'il en
   écrit un ; les notes rapides restent à lui. Un appel et une note se
   modifient (« je suis obligé de la supprimer et de la réécrire »).
   Tout est déclaré au niveau du module (AGENTS.md §2.4). */

const CLE_OUVERTS = 'suivi.ouverts';
const lireOuverts = (): string[] => { try { const v = JSON.parse(sessionStorage.getItem(CLE_OUVERTS) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const garderOuvert = (id: string, ouvert: boolean) => {
  try {
    const l = lireOuverts().filter(x => x !== id);
    sessionStorage.setItem(CLE_OUVERTS, JSON.stringify(ouvert ? [...l, id].slice(-40) : l));
  } catch { /* sans mémoire : il se replie au prochain passage */ }
};

function Chevron({ haut }: { haut?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: haut ? 'rotate(180deg)' : undefined, transition: 'transform .2s ease' }}><path d="m6 9 6 6 6-6" /></svg>
  );
}

export default function SuiviAgence({ b, lignes, absent, visite, clientId, rechercheId, veutVisiter, seul, prenom, onChange, onValider, onIndispo, onBiens }: {
  b: any; lignes: LigneSuivi[]; absent: boolean; visite?: VisiteCalee;
  clientId: string; rechercheId: string | null; veutVisiter: boolean;
  /** Le prénom du client, pour « Ce que Didier voit ». */
  prenom?: string | null;
  /** Dans la fenêtre « Voir en grand » : une carte à part, dépliée d'office. */
  seul?: boolean;
  onChange: () => void;
  onValider: (c: Creneau, contact: string) => void;
  onIndispo?: () => void;
  /** V3.193 : le bien vient d'être dit « Plus disponible » depuis l'appel. */
  onBiens?: () => void;
}) {
  const [ouvert, setOuvert] = useState(!!seul);
  useEffect(() => { if (!seul && lireOuverts().includes(b.id)) setOuvert(true); }, [b.id, seul]);
  const [note, setNote] = useState('');
  const [envoi, setEnvoi] = useState(false);
  /* La fenêtre « Noter un appel » : nouvelle, ou sur un appel à modifier. */
  const [appel, setAppel] = useState<{ ligne?: LigneSuivi } | null>(null);
  /* V3.193 : la note rapide en cours de modification, sur place. */
  const [enEdition, setEnEdition] = useState<{ id: string; texte: string } | null>(null);
  const [envoiEd, setEnvoiEd] = useState(false);

  const basculer = () => setOuvert(o => { if (!seul) garderOuvert(b.id, !o); return !o; });
  const etat = etatSuivi(lignes, visite, veutVisiter);
  const contact = contactDu(b, lignes);
  const ouverts = visite ? null : creneauxOuverts(lignes);
  const dernier = lignes[0];
  const extrait = dernier
    ? `${quandNote(dernier.created_at).split(',')[0]} · ${dernier.texte || (dernier.genre === 'appel' ? [REPONSES.find(r => r.k === dernier.reponse)?.l, DISPOS.find(d => d.k === dernier.dispo)?.l].filter(Boolean).join(', ') || 'Appel noté' : '')}`
    : '';
  const derniereDispo = lignes.find(l => l.genre === 'appel' && l.dispo)?.dispo || null;
  const vendu = derniereDispo === 'vendu' && !lireIndispo(b.indispo) && !b.bien_vente_id;
  /* V3.193 : ce que le client voit vraiment — rien pour un bien qu'il voit
     déjà « Plus disponible » (ou un bien de l'agence), et rien avant le SQL. */
  const prenomC = String(prenom || '').trim() || 'le client';
  const clientPret = lignes.some(l => l.montrer !== null);
  const horsSuivi = !!lireIndispo(b.indispo) || !!b.bien_vente_id;
  const montres = new Set(clientPret && !horsSuivi ? appelsMontres(lignes).map(x => x.a.id) : []);

  async function ajouterNote() {
    const t = note.trim();
    if (!t || envoi) return;
    setEnvoi(true);
    const ok = await verifie('La note', supabase.from('suivis_agence').insert({ bien_id: b.id, recherche_id: rechercheId, client_id: clientId, genre: 'note', texte: t }).select('id'), { ligne: true });
    setEnvoi(false);
    if (ok) { setNote(''); onChange(); }
  }
  async function modifierNote() {
    const t = enEdition?.texte.trim() || '';
    if (!enEdition || !t || envoiEd) return;
    setEnvoiEd(true);
    const ok = await verifie('La note modifiée', supabase.from('suivis_agence').update({ texte: t }).eq('id', enEdition.id).select('id'), { ligne: true });
    setEnvoiEd(false);
    if (ok) { setEnEdition(null); onChange(); }
  }
  async function retirer(l: LigneSuivi) {
    if (!window.confirm(l.genre === 'appel' ? 'Retirer cet appel de ton suivi ?' : 'Retirer cette note de ton suivi ?')) return;
    if (await verifie('Le retrait de la note', supabase.from('suivis_agence').delete().eq('id', l.id).select('id'), { ligne: true })) onChange();
  }

  if (absent) {
    return (
      <div className={s.bloc} data-seul={seul ? 'oui' : undefined}>
        <div className={s.ligne}>
          <span className={s.titre}><Icone nom="cadenas" taille={15} epaisseur={2.1} /><b>Mon suivi avec l’agence</b></span>
          <span className={s.etat} style={{ color: '#8F3F00', background: '#FFF1E6' }}>À activer</span>
          <span className={s.extrait} data-vide="oui">{'Un petit SQL à passer dans Supabase : outils/sql/suivis-agence.sql'}</span>
        </div>
      </div>
    );
  }

  const icTete = contact.avec === 'proprietaire' ? 'cle' : contact.avec === 'autre' ? 'clients' : 'immeuble';
  const nomContact = contact.nom || (contact.avec === 'agence' ? 'Agence à renseigner' : contact.avec === 'proprietaire' ? 'Le propriétaire' : 'Contact');

  return (
    <div className={s.bloc} data-seul={seul ? 'oui' : undefined} data-ouvert={ouvert ? 'oui' : undefined}>
      <div className={s.ligne}>
        <button type="button" className={s.bascule} onClick={basculer} aria-expanded={ouvert}>
          <span className={s.titre}><Icone nom="cadenas" taille={15} epaisseur={2.1} /><b>Mon suivi avec l’agence</b></span>
          <span className={s.etat} style={{ color: etat.c, background: etat.bg }}>{etat.l}</span>
          {derniereDispo === 'sous_offre' && etat.k !== 'calee' && <span className={s.etat} style={{ color: '#8F3F00', background: '#FFF1E6' }}>Sous offre</span>}
          {ouvert
            ? <span className={s.extrait} data-vide="oui">{montres.size ? `tes notes restent internes — ${prenomC} ne voit que les étapes marquées` : 'interne — le client ne le voit pas'}</span>
            : <span className={s.extrait} data-vide={extrait ? undefined : 'oui'}>{extrait || (lignes.length ? '' : 'Rien de noté pour l’instant')}</span>}
        </button>
        <span className={s.actions}>
          {(ouvert || !lignes.length) && (
            <button type="button" className={s.btn} onClick={() => setAppel({})}><Icone nom="tel" taille={14} epaisseur={2.1} />Noter un appel</button>
          )}
          {!seul && (
            <button type="button" className={s.plier} onClick={basculer} aria-expanded={ouvert}>{ouvert ? 'Replier' : 'Déplier'}<Chevron haut={ouvert} /></button>
          )}
        </span>
      </div>

      {ouvert && (
        <div className={s.corps}>
          <div className={s.contact}>
            <span className={s.contactIc}><Icone nom={icTete} taille={18} epaisseur={2} /></span>
            <span className={s.contactTx}>
              <b>{contact.interlocuteur ? `${nomContact} · ${contact.interlocuteur}` : nomContact}</b>
              <small>{contact.avec === 'agence' ? 'L’agence qui a le mandat' : contact.avec === 'proprietaire' ? 'Le propriétaire, en direct' : 'Le contact pour ce bien'}{contact.tel || contact.email ? '' : ' · ses coordonnées s’ajoutent avec « Noter un appel »'}</small>
            </span>
            {contact.tel && <a className={s.lienFort} href={`tel:${contact.tel.replace(/[^\d+]/g, '')}`}><Icone nom="tel" taille={14} epaisseur={2.1} />{contact.tel}</a>}
            {contact.email && <a className={s.lien} href={`mailto:${contact.email}`}><Icone nom="mail" taille={14} epaisseur={2.1} />E-mail</a>}
          </div>

          {vendu && onIndispo && (
            <div className={s.alerte}>
              <Icone nom="cadenas" taille={15} epaisseur={2.1} />
              <span>{'D’après ton dernier appel, il est vendu.'}</span>
              <button type="button" className={s.btn} onClick={onIndispo}>Le classer « Plus disponible »</button>
            </div>
          )}

          <div className={s.rapide}>
            <label className={s.rapideChamp}>
              <span className={s.cache}>Note rapide</span>
              <input value={note} onChange={e => setNote(e.target.value)} maxLength={2000}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void ajouterNote(); } }}
                placeholder="Écrire une note rapide…" />
            </label>
            <button type="button" className={s.btnFort} onClick={() => { void ajouterNote(); }} disabled={!note.trim() || envoi}>{envoi ? '…' : 'Ajouter'}</button>
          </div>

          {lignes.length === 0 ? (
            <div className={s.vide}>{'Rien de noté pour l’instant. Après ton appel, « Noter un appel » garde ce qui a été dit et les créneaux proposés.'}</div>
          ) : (
            <ol className={s.fil}>
              {lignes.map(l => {
                const rep = REPONSES.find(r => r.k === l.reponse);
                const dis = DISPOS.find(d => d.k === l.dispo);
                const qui = [l.contact.interlocuteur, l.contact.nom].filter(Boolean);
                const actifs = ouverts && ouverts.ligne === l.id ? ouverts.creneaux : null;
                return (
                  <li key={l.id} className={s.point} data-genre={l.genre}>
                    <span className={s.puce} aria-hidden="true" />
                    <div className={s.pointCorps}>
                      <div className={s.pointTete}>
                        <span>{`${quandNote(l.created_at)} · ${l.genre === 'appel' ? 'Appel' : 'Note'}`}</span>
                        {rep && <span className={s.marque} data-k={rep.k}><Icone nom={rep.ic} taille={12} epaisseur={2.3} />{rep.l}</span>}
                        {dis && <span className={s.marque} data-k={dis.k}><Icone nom={dis.ic} taille={12} epaisseur={2.3} />{dis.l}</span>}
                        {montres.has(l.id) && <span className={s.marque} data-k="client" title={`${prenomC} voit cette étape dans son espace`}><Icone nom="oeil" taille={12} epaisseur={2.3} />{`Visible par ${prenomC}`}</span>}
                        <span className={s.gestes}>
                          {enEdition?.id !== l.id && (
                            <button type="button" className={s.modifier} aria-label={l.genre === 'appel' ? 'Modifier cet appel' : 'Modifier cette note'} title="Modifier"
                              onClick={() => (l.genre === 'appel' ? setAppel({ ligne: l }) : setEnEdition({ id: l.id, texte: l.texte || '' }))}><Icone nom="crayon" taille={13} epaisseur={2} /></button>
                          )}
                          <button type="button" className={s.retirer} onClick={() => { void retirer(l); }} aria-label="Retirer cette ligne" title="Retirer"><Icone nom="corbeille" taille={13} epaisseur={2} /></button>
                        </span>
                      </div>
                      {qui.length > 0 && <div className={s.qui}>{`avec ${qui.length === 2 ? `${qui[0]} (${qui[1]})` : qui[0]}`}</div>}
                      {enEdition?.id === l.id ? (
                        <div className={s.edition}>
                          <label className={s.cache} htmlFor={`note-${l.id}`}>Modifier la note</label>
                          <textarea id={`note-${l.id}`} className={s.zone} rows={3} value={enEdition.texte} maxLength={2000} autoFocus
                            onChange={e => setEnEdition({ id: l.id, texte: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void modifierNote(); } if (e.key === 'Escape') { e.stopPropagation(); setEnEdition(null); } }} />
                          <div className={s.editionPied}>
                            <button type="button" className={s.btn} onClick={() => setEnEdition(null)} disabled={envoiEd}>Annuler</button>
                            <button type="button" className={s.btnFort} onClick={() => { void modifierNote(); }} disabled={envoiEd || !enEdition.texte.trim()}>{envoiEd ? '…' : 'Enregistrer'}</button>
                          </div>
                        </div>
                      ) : l.texte && <div className={s.texte}>{l.texte}</div>}
                      {l.mot_client && (
                        <div className={s.motClient} data-vu={montres.has(l.id) ? 'oui' : undefined}>
                          <Icone nom="oeil" taille={13} epaisseur={2.1} />
                          <span><i>{montres.has(l.id) ? `Pour ${prenomC} : ` : `Pour ${prenomC} (pas montré) : `}</i>{`« ${l.mot_client} »`}</span>
                        </div>
                      )}
                      {l.creneaux.length > 0 && (
                        <div className={s.creneaux}>
                          <span className={s.creneauxLib}>{actifs ? 'Créneaux proposés par l’agence :' : 'Créneaux proposés :'}</span>
                          {(actifs || l.creneaux).map(c => {
                            /* V3.192 : le créneau validé le dit, une coche verte à côté. */
                            const retenu = creneauDeLaVisite(c, visite);
                            return (
                              <span key={`${c.date}-${c.heure}`} className={s.creneau} data-actif={actifs ? 'oui' : undefined} data-retenu={retenu ? 'oui' : undefined}>
                                {texteCreneau(c)}
                                {actifs && <button type="button" className={s.valider} onClick={() => onValider(c, contactEnLigne(contact))}>Valider ce créneau</button>}
                                {retenu && <span className={s.retenu}><Icone nom="coche" taille={12} epaisseur={2.8} />Visite calée</span>}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {l.ensuite === 'rappeler' && l.rappel_le && (
                        <div className={s.rappel}><Icone nom="calendrier" taille={13} epaisseur={2.1} />{`Rappel prévu le ${texteCreneau({ date: l.rappel_le, heure: '00:00' }).split(' · ')[0].toLowerCase()} · il est dans tes Relances`}</div>
                      )}
                      {l.ensuite === 'attente' && <div className={s.rappel}><Icone nom="horloge" taille={13} epaisseur={2.1} />{'Tu attends leur retour'}</div>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {appel && (
        <FenetreAppel b={b} lignes={lignes} ligne={appel.ligne} clientId={clientId} rechercheId={rechercheId} prenom={prenomC} clientPret={clientPret || !lignes.length} horsSuivi={horsSuivi}
          onFermer={() => setAppel(null)}
          onFait={indispo => { setAppel(null); if (!ouvert) basculer(); onChange(); if (indispo) onBiens?.(); }} />
      )}
    </div>
  );
}

/* ═══ La fenêtre « Noter un appel » ═══════════════════════════════════════ */

function Pastille({ on, ic, children, onClick, ton }: { on: boolean; ic: string; children: React.ReactNode; onClick: () => void; ton?: string }) {
  return (
    <button type="button" className={s.pastille} aria-pressed={on} data-ton={ton} onClick={onClick}>
      <Icone nom={ic} taille={15} epaisseur={2.1} />{children}
    </button>
  );
}

const demain = () => { const d = new Date(); d.setDate(d.getDate() + 1); return cleDuJour(d); };

function FenetreAppel({ b, lignes, ligne, clientId, rechercheId, prenom, clientPret, horsSuivi, onFermer, onFait }: {
  b: any; lignes: LigneSuivi[];
  /** V3.193 : l'appel à modifier ; sans lui, un nouvel appel. */
  ligne?: LigneSuivi;
  clientId: string; rechercheId: string | null;
  prenom: string;
  /** Les colonnes de ce que le client voit existent (ou rien ne dit le contraire). */
  clientPret: boolean;
  /** Le client voit déjà ce bien « Plus disponible » (ou c'est un bien de l'agence). */
  horsSuivi: boolean;
  onFermer: () => void;
  /** `indispo` : le bien vient d'être dit « Plus disponible ». */
  onFait: (indispo: boolean) => void;
}) {
  const depart = contactDu(b, lignes);
  const [avec, setAvec] = useState(ligne?.avec || depart.avec);
  const [nom, setNom] = useState(ligne?.contact.nom || depart.nom || '');
  const [interlocuteur, setInterlocuteur] = useState(ligne?.contact.interlocuteur || depart.interlocuteur || '');
  const [tel, setTel] = useState(ligne?.contact.tel || depart.tel || '');
  const [email, setEmail] = useState(ligne?.contact.email || depart.email || '');
  const [garder, setGarder] = useState(true);
  const [reponse, setReponse] = useState<string | null>(ligne ? ligne.reponse : 'repondu');
  const [dispo, setDispo] = useState<string | null>(ligne?.dispo || null);
  const [texte, setTexte] = useState(ligne?.texte || '');
  const [creneaux, setCreneaux] = useState<Creneau[]>(ligne?.creneaux || []);
  const [ajout, setAjout] = useState<Creneau | null>(null);
  const [ensuite, setEnsuite] = useState<string | null>(ligne?.ensuite || null);
  const [rappel, setRappel] = useState(ligne?.rappel_le || demain());
  const [envoi, setEnvoi] = useState(false);
  /* V3.193 : ce que le client voit — l'étape (cochée d'office) et un mot. */
  const [montrer, setMontrer] = useState(ligne ? ligne.montrer !== false : true);
  const [mot, setMot] = useState(ligne?.mot_client || '');
  /* « Vendu » : le dire au client tout de suite (« Plus disponible »). */
  const [direVendu, setDireVendu] = useState(true);
  const [motVendu, setMotVendu] = useState('');
  /* V3.192 : l'adresse exacte, vérifiée au téléphone. Vide tant qu'il n'y a
     que celle, probable, de la veille : elle ne devient exacte que si tu la
     reprends ou l'écris. */
  const adresseFiche = String(b.adresse || '').trim();
  const adresseProbable = adresseFiche ? '' : String(b.adresse_probable || '').trim();
  const [adresse, setAdresse] = useState(adresseFiche);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !envoi) onFermer(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [envoi, onFermer]);

  const titreBien = b.titre || [b.type_bien, b.ville].filter(Boolean).join(' — ') || 'ce bien';
  const surFiche = { nom: String(b.agence_nom || '').trim(), tel: String(b.agence_tel || '').trim() };
  const change = (nom.trim() || tel.trim()) && (nom.trim() !== surFiche.nom || tel.trim() !== surFiche.tel) && avec !== 'autre';
  const rien = !texte.trim() && !creneaux.length && !dispo && !reponse;
  const lieAjout = (c: Creneau) => setCreneaux(l => (l.some(x => x.date === c.date && x.heure === c.heure) ? l : [...l, c].sort((x, y) => `${x.date}${x.heure}`.localeCompare(`${y.date}${y.heure}`))));
  /* L'étape telle que le client la lira (src/lib/suivi-client.ts). */
  const apercu = phraseAppel({ reponse, dispo, creneaux, ensuite, rappel_le: ensuite === 'rappeler' ? rappel : null });
  const vendu = dispo === 'vendu';

  async function enregistrer() {
    if (envoi || rien) return;
    setEnvoi(true);
    try {
      const c = { nom: nom.trim(), interlocuteur: avec === 'agence' ? interlocuteur.trim() : '', tel: tel.trim(), email: email.trim() };
      const contact = Object.fromEntries(Object.entries(c).filter(([, v]) => v));
      /* « Rappeler le… » : une relance dans Relances, comme les autres. Sur
         un appel modifié, la sienne se déplace, ou se clôt s'il n'y a plus à
         rappeler (elle n'est jamais effacée). */
      const quiAppeler = c.interlocuteur || c.nom || (avec === 'proprietaire' ? 'le propriétaire' : 'l’agence');
      const valeursRelance = {
        date_echeance: new Date(`${rappel}T09:00:00`).toISOString(),
        note: `Rappeler ${quiAppeler}${c.tel ? ` (${c.tel})` : ''} pour « ${titreBien} »`,
      };
      let relanceId: string | null = ligne?.relance_id || null;
      let relanceCreee: string | null = null;
      let relanceBouge = false;
      if (ensuite === 'rappeler') {
        let garde = false;
        if (relanceId) {
          const r = await supabase.from('relances').update(valeursRelance).eq('id', relanceId).eq('statut', 'en_attente').select('id');
          if (r.error) { signalerEchec('La relance', r.error.message); return; }
          garde = !!r.data?.length;
          relanceBouge = garde;
          /* Déjà faite (ou retirée) : une nouvelle seulement si la date change. */
          if (!garde && ligne?.ensuite === 'rappeler' && ligne.rappel_le === rappel) garde = true;
        }
        if (!garde) {
          const { data, error } = await supabase.from('relances').insert({
            client_id: clientId, recherche_id: rechercheId, type: 'manuelle', statut: 'en_attente', ...valeursRelance,
          }).select('id').single();
          if (error || !data) { signalerEchec('La relance', error?.message || 'aucune ligne écrite'); return; }
          relanceId = relanceCreee = data.id;
          relanceBouge = true;
        }
      } else if (relanceId) {
        const r = await supabase.from('relances').update({ statut: 'cloturee' }).eq('id', relanceId).eq('statut', 'en_attente').select('id');
        if (r.error) { signalerEchec('La relance de l’appel', r.error.message); return; }
        relanceBouge = !!r.data?.length;
        relanceId = null;
      }

      const valeurs = {
        avec, contact, reponse, dispo, texte: texte.trim() || null, creneaux, ensuite,
        rappel_le: ensuite === 'rappeler' ? rappel : null, relance_id: relanceId,
      };
      const pourClient = { montrer, mot_client: !vendu && montrer ? mot.trim() || null : null };
      const ecrire = (avecClient: boolean) => {
        const v = avecClient ? { ...valeurs, ...pourClient } : valeurs;
        return ligne
          ? supabase.from('suivis_agence').update(v).eq('id', ligne.id).select('id')
          : supabase.from('suivis_agence').insert({ bien_id: b.id, recherche_id: rechercheId, client_id: clientId, genre: 'appel', ...v }).select('id');
      };
      /* Avant le SQL de la V3.193, les deux colonnes n'existent pas : l'appel
         s'enregistre sans elles, et on dit ce qu'il manque. */
      let r = await ecrire(true);
      const sansClient = !!r.error && colonnesClientAbsentes(r.error);
      if (sansClient) r = await ecrire(false);
      const ok = await verifie(ligne ? 'L’appel modifié' : 'L’appel', Promise.resolve(r), { ligne: true });
      if (!ok) {
        if (relanceCreee) await verifie('La relance créée avec l’appel', supabase.from('relances').delete().eq('id', relanceCreee).select('id'));
        return;
      }
      if (sansClient && (pourClient.mot_client || !montrer)) {
        signalerEchec(`Ce que ${prenom} voit`, `l’appel est enregistré, mais pas ton choix pour ${prenom} : il faut d’abord passer le fichier ${SQL_CLIENT} dans Supabase (SQL Editor), une seule fois`);
      }
      if (change && garder) {
        await verifie('Les coordonnées sur la fiche du bien', supabase.from('biens').update({ agence_nom: c.nom || null, agence_tel: c.tel || null }).eq('id', b.id).select('id'), { ligne: true });
      }
      /* V3.192 : l'adresse corrigée va sur le bien et sur sa proposition de la veille. */
      if (adresse.trim() && adresse.trim() !== adresseFiche) await corrigerAdresse(b.id, adresse);
      /* V3.193 : « Vendu », dit au client d'un geste — comme « Plus disponible ». */
      let indispo = false;
      if (vendu && direVendu && !horsSuivi) {
        indispo = await marquerIndispo({ bien: b, clientId, rechercheId, motif: 'vendu', note: motVendu });
      }
      if (relanceBouge) signalerMaj();
      onFait(indispo);
    } finally {
      setEnvoi(false);
    }
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className={s.voile} onClick={e => { if (e.target === e.currentTarget && !envoi) onFermer(); }}>
      <div className={s.fenetre} role="dialog" aria-modal="true" aria-label={ligne ? 'Modifier l’appel' : 'Noter un appel'}>
        <div className={s.fTete}>
          <span className={s.fIc} aria-hidden="true"><Icone nom={ligne ? 'crayon' : 'tel'} taille={19} epaisseur={2} /></span>
          <div style={{ minWidth: 0 }}>
            <h2>{ligne ? 'Modifier l’appel' : 'Noter un appel'}</h2>
            <p>{ligne ? `${quandNote(ligne.created_at)} · ${titreBien}` : titreBien}</p>
          </div>
          <button type="button" className={s.fFermer} onClick={onFermer} aria-label="Fermer" disabled={envoi}><Icone nom="fermer" taille={16} epaisseur={2.4} /></button>
        </div>

        <div className={s.fCorps}>
          <section className={s.section}>
            <div className={s.lib}><Icone nom="clients" taille={14} epaisseur={2.2} />Avec qui</div>
            <div className={s.pastilles}>
              {AVEC.map(a => <Pastille key={a.k} on={avec === a.k} ic={a.ic} onClick={() => setAvec(a.k)}>{a.l}</Pastille>)}
            </div>
            <div className={s.grille}>
              <label className={s.champ}><span>{avec === 'agence' ? 'Agence' : avec === 'proprietaire' ? 'Nom du propriétaire' : 'Nom'}</span>
                <input value={nom} onChange={e => setNom(e.target.value)} placeholder={avec === 'agence' ? 'Nom de l’agence' : 'Nom'} /></label>
              {avec === 'agence' && (
                <label className={s.champ}><span>Interlocuteur</span>
                  <input value={interlocuteur} onChange={e => setInterlocuteur(e.target.value)} placeholder="Mme Durand, négociatrice" /></label>
              )}
              <label className={s.champ}><span>Téléphone</span>
                <input value={tel} onChange={e => setTel(e.target.value)} type="tel" placeholder="01 23 45 67 89" /></label>
              <label className={s.champ}><span>E-mail</span>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="contact@agence.fr" /></label>
            </div>
            {change && (
              <label className={s.coche}><input type="checkbox" checked={garder} onChange={e => setGarder(e.target.checked)} />{'Mettre aussi ce nom et ce téléphone sur la fiche du bien'}</label>
            )}
          </section>

          {/* V3.192 — L'adresse exacte du bien. */}
          <section className={s.section}>
            <label className={s.lib} htmlFor="appel-adresse"><Icone nom="lieu" taille={14} epaisseur={2.2} />L’adresse exacte du bien</label>
            <input id="appel-adresse" className={s.adresse} value={adresse} onChange={e => setAdresse(e.target.value)} maxLength={300}
              placeholder={adresseProbable ? `Probable d’après la veille : ${adresseProbable}` : 'Numéro, rue, ville'} />
            {adresseProbable && !adresse.trim() && (
              <button type="button" className={s.reprendre} onClick={() => setAdresse(adresseProbable)}>
                <Icone nom="coche" taille={13} epaisseur={2.6} />{`C’est la bonne : ${adresseProbable}`}
              </button>
            )}
            <div className={s.aide}>{adresseFiche
              ? 'Corrige-la si l’agence ou le propriétaire t’en donne une autre : elle change sur la fiche du bien et dans la proposition de la veille.'
              : 'Vérifie-la au téléphone. Écrite ici, elle devient l’adresse du bien, et celle de sa proposition dans la veille.'}</div>
          </section>

          <div className={s.deux}>
            <section className={s.section}>
              <div className={s.lib}><Icone nom="tel" taille={14} epaisseur={2.2} />L’appel</div>
              <div className={s.pastilles}>
                {REPONSES.map(r => <Pastille key={r.k} on={reponse === r.k} ic={r.ic} onClick={() => setReponse(x => (x === r.k ? null : r.k))}>{r.l}</Pastille>)}
              </div>
            </section>
            <section className={s.section}>
              <div className={s.lib}><Icone nom="maison" taille={14} epaisseur={2.2} />Le bien</div>
              <div className={s.pastilles}>
                {DISPOS.map(d => <Pastille key={d.k} on={dispo === d.k} ic={d.ic} ton={d.k} onClick={() => setDispo(x => (x === d.k ? null : d.k))}>{d.l}</Pastille>)}
              </div>
            </section>
          </div>

          <section className={s.section}>
            <label className={s.lib} htmlFor="appel-texte"><Icone nom="note" taille={14} epaisseur={2.2} />Ce qui a été dit<span className={s.pourToi}><Icone nom="cadenas" taille={12} epaisseur={2.3} />pour toi seul</span></label>
            <textarea id="appel-texte" className={s.zone} rows={4} value={texte} onChange={e => setTexte(e.target.value)} maxLength={4000}
              placeholder="Offres en cours, contre-visites, chauffage, charges, ce qu’il faut savoir avant la visite…" />
          </section>

          <section className={s.section}>
            <div className={s.lib}><Icone nom="calendrier" taille={14} epaisseur={2.2} />Créneaux proposés par l’agence</div>
            {creneaux.length > 0 && (
              <div className={s.pastilles}>
                {creneaux.map(c => (
                  <span key={`${c.date}-${c.heure}`} className={s.creneauF}>
                    <Icone nom="calendrier" taille={14} epaisseur={2.1} />{texteCreneau(c)}
                    <button type="button" onClick={() => setCreneaux(l => l.filter(x => x !== c))} aria-label={`Retirer le créneau ${texteCreneau(c)}`}><Icone nom="fermer" taille={12} epaisseur={2.6} /></button>
                  </span>
                ))}
              </div>
            )}
            {ajout ? (
              <div className={s.ajout}>
                <ChoixDateHeure date={ajout.date} heure={ajout.heure} ouvrir="date"
                  onDate={k => setAjout(a => (a ? { ...a, date: k } : a))} onHeure={h => setAjout(a => (a ? { ...a, heure: h } : a))} />
                <div className={s.ajoutPied}>
                  <button type="button" className={s.btn} onClick={() => setAjout(null)}>Annuler</button>
                  <button type="button" className={s.btnFort} onClick={() => { lieAjout(ajout); setAjout(null); }}>{`Ajouter · ${texteCreneau(ajout)}`}</button>
                </div>
              </div>
            ) : (
              <button type="button" className={s.ajouter} onClick={() => setAjout({ date: demain(), heure: '18:00' })}><Icone nom="plus" taille={14} epaisseur={2.4} />Ajouter un créneau</button>
            )}
            <div className={s.aide}>{'Ce ne sont que des propositions : rien n’est réservé. Sur la fiche, « Valider ce créneau » ouvre « Planifier une visite », déjà rempli.'}</div>
          </section>

          <section className={s.section}>
            <div className={s.lib}><Icone nom="horloge" taille={14} epaisseur={2.2} />Et ensuite</div>
            <div className={s.pastilles}>
              <Pastille on={ensuite === 'attente'} ic="horloge" onClick={() => setEnsuite(x => (x === 'attente' ? null : 'attente'))}>J’attends leur retour</Pastille>
              <Pastille on={ensuite === 'rappeler'} ic="calendrier" onClick={() => setEnsuite(x => (x === 'rappeler' ? null : 'rappeler'))}>Rappeler le…</Pastille>
            </div>
            {ensuite === 'rappeler' && (
              <div className={s.ajout}>
                <ChoixJour date={rappel} onDate={setRappel} min={cleDuJour()} etiquette="Rappeler le" />
                <div className={s.aide}>{ligne?.relance_id && ligne.ensuite === 'rappeler' ? 'Sa relance se déplace à cette date, dans tes Relances.' : 'Une relance se crée à cette date, dans tes Relances.'}</div>
              </div>
            )}
          </section>

          {/* V3.193 — Ce que le client voit de cet appel. */}
          {horsSuivi ? (
            <div className={s.clientHors}>
              <Icone nom="oeil" taille={14} epaisseur={2.1} />
              <span>{b.bien_vente_id ? `Un bien de l’agence : l’espace de ${prenom} suit déjà sa fiche. Cet appel reste interne.` : `${prenom} voit déjà ce bien « Plus disponible » : cet appel reste interne.`}</span>
            </div>
          ) : vendu ? (
            <section className={s.client} data-ton="vendu">
              <label className={s.clientCoche}>
                <input type="checkbox" checked={direVendu} onChange={e => setDireVendu(e.target.checked)} />
                <span className={s.clientCocheTx}>
                  <b>{`Le dire à ${prenom} : « Plus disponible »`}</b>
                  <small>{`Le bien passe dans « Plus disponibles » de son espace, avec « Ce bien a été vendu. »`}</small>
                </span>
              </label>
              {direVendu && (
                <div className={s.clientMot}>
                  <label htmlFor="appel-mot-vendu">{'Ton mot pour '}{prenom}<i>{' (facultatif)'}</i></label>
                  <textarea id="appel-mot-vendu" className={s.zoneClient} rows={2} value={motVendu} onChange={e => setMotVendu(e.target.value)} maxLength={600}
                    placeholder="Vendu à un autre acquéreur. Je continue de chercher dans le même secteur." />
                </div>
              )}
              {!direVendu && <div className={s.aide}>{`Rien ne change chez ${prenom}. Tu pourras le classer plus tard depuis ton suivi (« Le classer Plus disponible »).`}</div>}
            </section>
          ) : (
            <section className={s.client}>
              <div className={s.clientTete}><Icone nom="oeil" taille={15} epaisseur={2.2} /><span>{`Ce que ${prenom} voit dans son espace`}</span></div>
              {!clientPret && <div className={s.aide}>{`À activer : un petit SQL à passer dans Supabase, ${SQL_CLIENT}. En attendant, ${prenom} ne voit rien.`}</div>}
              <label className={s.clientCoche}>
                <input type="checkbox" checked={montrer} onChange={e => setMontrer(e.target.checked)} />
                <span className={s.clientCocheTx}><b>Lui montrer l’étape</b></span>
              </label>
              {montrer && apercu ? (
                <div className={s.apercu}>
                  <span className={s.apercuPoint} aria-hidden="true" />
                  <span className={s.apercuTx}><b>{apercu.t}</b>{apercu.sous && <small>{apercu.sous}</small>}</span>
                </div>
              ) : null}
              {montrer ? (
                <div className={s.clientMot}>
                  <label htmlFor="appel-mot">{'Un mot pour '}{prenom}<i>{' (facultatif, à lire sur le bien)'}</i></label>
                  <textarea id="appel-mot" className={s.zoneClient} rows={2} value={mot} onChange={e => setMot(e.target.value)} maxLength={600}
                    placeholder="Le propriétaire me rappelle demain avec ses disponibilités. Je vous propose un créneau dès que je l’ai." />
                </div>
              ) : (
                <div className={s.aide}>{`Rien de cet appel n’apparaît chez ${prenom}.`}</div>
              )}
              <span className={s.jamais}><Icone nom="cadenas" taille={13} epaisseur={2.3} />{'Jamais montré : ce qui a été dit, l’agence, son numéro, l’adresse.'}</span>
            </section>
          )}
        </div>

        <div className={s.fPied}>
          <span className={s.fNote}><Icone nom="cadenas" taille={14} epaisseur={2.1} />{'Ce qui a été dit reste interne.'}</span>
          <button type="button" className={s.btn} onClick={onFermer} disabled={envoi}>Annuler</button>
          <button type="button" className={s.btnFort} onClick={() => { void enregistrer(); }} disabled={envoi || rien}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
