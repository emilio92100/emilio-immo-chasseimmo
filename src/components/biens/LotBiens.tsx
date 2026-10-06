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
   · Changer d'étape : les mêmes passages que le menu d'étape de la fiche,
     ceux qui ne demandent qu'une raison (FenRaison) — À suivre, Estimation,
     En pause, Retiré. Un bien qui demande une décision (une offre en cours,
     des visites prévues, un rendez-vous d'estimation, une estimation déjà
     faite) est laissé de côté, avec sa raison : c'est sur sa fiche qu'on la
     prend. */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ic } from '@/components/documents/ApercuActe';
import { supabase } from '@/lib/supabase';
import { euros } from '@/lib/mandat';
import { CLES_MAIL, signatureDe } from '@/lib/mail-variables';
import { visitePasseeParis } from '@/lib/visites';
import { avantMandat, etapeDe, titreBien, villeAffichee, type BienVente, type EtapeVente } from '@/lib/biens-vente';
import { CaseLigne, type Avancement } from '@/components/shared/Selection';
import { Avatar, modeAcheteurs } from './AcheteursBien';
import { RAISONS_ETAPE, avantRdv } from './FenetresBien';
import {
  SEUIL_CORRESPOND, SEUIL_LISTE, acheteursPour, changerEtape, cloreRelancesEstimation, envoyerDansEspace, envoyerParMail, estimationMiseDeCote,
  instantPasse, mettreEnSelection, nomClient, solderDemandesDuBien, suiteEnvoi, type Acheteur, type Copie, type ListeBiens,
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
type Ligne = { cle: string; acheteur: Acheteur; items: Item[] };
type Quoi = 'selection' | 'espace' | 'mail';

/* Ce que cet acheteur recevrait. Sélection : ce qui n'est pas encore dans
   son dossier ; espace et mail : ce qu'il n'a pas encore reçu. */
function aEnvoyer(x: Ligne, quoi: Quoi, partiels: boolean): Item[] {
  const seuil = partiels ? SEUIL_LISTE : SEUIL_CORRESPOND;
  return x.items.filter(i => i.acheteur.corr.note >= seuil && (quoi === 'selection' ? !i.acheteur.copie : !presente(i.acheteur.copie)));
}

/* Le texte du mail : le modèle « Sélection de biens » des Paramètres s'il est
   rempli, sinon un texte qui convient à un bien comme à plusieurs. Les
   variables ({{prénom}}…) restent : /api/send-mail les remplace pour chacun. */
function mailParDefaut(p: Record<string, string>): { objet: string; corps: string } {
  const sig = signatureDe(p);
  const modele = (p.template_email_corps || '').trim();
  const objet = (p.template_email_objet || '').trim() || 'Sélection de biens — Vos recherches immobilières';
  if (modele) return { objet, corps: modele.includes(sig) ? modele : `${modele.trimEnd()}\n\n${sig}` };
  return {
    objet,
    corps: `Bonjour {{prénom}},

Suite à votre projet de recherche, je vous présente ci-dessous ce qui pourrait répondre à vos critères.

Vous trouverez le détail de chaque bien, avec un bouton pour consulter sa fiche complète.

N'hésitez pas à me solliciter pour organiser une visite, à m'appeler si vous avez la moindre question, ou à me faire un retour afin d'affiner votre recherche.

${sig}`,
  };
}

/* ══ ENVOYER À DES ACHETEURS ═════════════════════════════════════════════ */
export function FenEnvoiLot({ biens, liste, nomBien, onFermer, onFait, onFiche }: {
  biens: BienVente[]; liste: ListeBiens; nomBien: (b: BienVente) => string;
  onFermer: () => void;
  /* Quelque chose est parti : la liste se relit (les copies ont changé). */
  onFait: () => void;
  onFiche: (clientId: string) => void;
}) {
  const enVente = useMemo(() => biens.filter(b => modeAcheteurs(b.etape) === 'vente'), [biens]);
  const ecartes = biens.filter(b => !enVente.includes(b)).map(b => {
    const m = modeAcheteurs(b.etape);
    return { nom: nomBien(b), pourquoi: m === 'avant' ? `${etapeDe(b.etape).lib} : l’envoi s’ouvre au mandat.` : m === 'pause' ? 'Vente en pause : l’envoi reprend avec elle.' : 'Il n’est plus en vente.' };
  });
  /* Un acheteur (une recherche) par ligne, et les biens qui lui correspondent. */
  const lignes = useMemo(() => {
    const m = new Map<string, Ligne>();
    for (const b of enVente) {
      const copies = liste.copies.filter(c => c.bien_vente_id === b.id);
      for (const a of acheteursPour(b, liste.recherches, liste.clients, copies)) {
        if (a.corr.note < SEUIL_LISTE) continue;
        const x = m.get(a.recherche.id) || { cle: a.recherche.id, acheteur: a, items: [] };
        x.items.push({ bien: b, acheteur: a });
        m.set(a.recherche.id, x);
      }
    }
    const bons = (x: Ligne) => x.items.filter(i => i.acheteur.corr.note >= SEUIL_CORRESPOND).length;
    const meilleure = (x: Ligne) => Math.max(...x.items.map(i => i.acheteur.corr.note));
    return [...m.values()].sort((p, q) => bons(q) - bons(p) || meilleure(q) - meilleure(p));
  }, [enVente, liste]);

  const [partiels, setPartiels] = useState(false);
  const [choisis, setChoisis] = useState<Set<string>>(() => new Set(lignes.filter(x => aEnvoyer(x, 'mail', false).length).map(x => x.cle)));
  const [etape, setEtape] = useState<'qui' | 'mail'>('qui');
  const [mail, setMail] = useState<{ objet: string; corps: string } | null>(null);
  const [en, setEn] = useState<Quoi | null>(null);
  const [avance, setAvance] = useState<Avancement | null>(null);
  const [bilan, setBilan] = useState('');

  const vues = lignes.filter(x => partiels || x.items.some(i => i.acheteur.corr.note >= SEUIL_CORRESPOND));
  /* Des biens qui ne correspondent qu'en partie (50 à 69 %) : la case pour les ajouter. */
  const aPartiels = lignes.some(x => x.items.some(i => i.acheteur.corr.note < SEUIL_CORRESPOND));
  const coches = vues.filter(x => choisis.has(x.cle));
  const pour = (quoi: Quoi) => coches.filter(x => aEnvoyer(x, quoi, partiels).length);
  const total = (quoi: Quoi) => pour(quoi).reduce((t, x) => t + aEnvoyer(x, quoi, partiels).length, 0);
  const basculer = (k: string) => setChoisis(c => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const possibles = vues.filter(x => aEnvoyer(x, 'selection', partiels).length || aEnvoyer(x, 'mail', partiels).length);
  const tous = possibles.length > 0 && possibles.every(x => choisis.has(x.cle));
  const fini = !!avance && avance.fait + avance.erreurs.length >= avance.total;
  const occupe = !!en && !fini;

  /* Le texte du mail : les réglages des Paramètres, lus une fois. */
  useEffect(() => {
    if (etape !== 'mail' || mail) return;
    let vivant = true;
    supabase.from('parametres').select('cle, valeur').in('cle', CLES_MAIL).then(({ data }) => {
      if (!vivant) return;
      const p = Object.fromEntries(((data || []) as { cle: string; valeur: string | null }[]).map(r => [r.cle, r.valeur || '']));
      setMail(mailParDefaut(p));
    });
    return () => { vivant = false; };
  }, [etape, mail]);

  async function lancer(quoi: Quoi) {
    const cibles = quoi === 'mail' ? pour('mail').filter(x => mailDe(x.acheteur)) : pour(quoi);
    if (!cibles.length) return;
    setEn(quoi); setBilan('');
    const av: Avancement = { fait: 0, total: cibles.length, erreurs: [] };
    setAvance({ ...av });
    let biensPartis = 0;
    for (const x of cibles) {
      const items = aEnvoyer(x, quoi, partiels);
      const nom = nomClient(x.acheteur.client);
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
          biensPartis += await envoyerParMail(items, mail || { objet: '', corps: '' });
        }
        av.fait += 1;
      } catch (e) {
        av.erreurs.push(`${nom} : ${(e as Error).message}`);
      }
      setAvance({ ...av, erreurs: [...av.erreurs] });
    }
    const qui = av.fait > 1 ? `${av.fait} acheteurs` : av.fait ? '1 acheteur' : 'personne';
    setBilan(quoi === 'selection' ? `Dans la sélection de ${qui}. Rien n’est parti : ils ne le voient pas encore.`
      : quoi === 'espace' ? `${biensPartis > 1 ? `${biensPartis} biens envoyés` : '1 bien envoyé'} dans l’espace de ${qui}.`
        : `${av.fait > 1 ? `${av.fait} mails partis` : av.fait ? '1 mail parti' : 'Aucun mail parti'}.`);
    if (av.fait) onFait();
  }

  const titre = enVente.length > 1 || (!enVente.length && biens.length > 1) ? `Envoyer ${enVente.length || biens.length} biens à des acheteurs` : 'Envoyer ce bien à des acheteurs';
  const sansMail = pour('mail').filter(x => !mailDe(x.acheteur));
  const avecMail = pour('mail').filter(x => mailDe(x.acheteur));

  const fen = (
    <div className={l.voile} onMouseDown={e => { if (e.target === e.currentTarget && !occupe) onFermer(); }}>
      <div className={l.fen} role="dialog" aria-modal="true" aria-label={titre}>
        <div className={l.tete}>
          <span className={l.teteIc}><Ic n={etape === 'mail' ? 'mail' : 'envoyer'} t={20} /></span>
          <div className={l.teteTx}>
            <h2>{etape === 'mail' && !avance ? (avecMail.length > 1 ? `${avecMail.length} mails, un par acheteur` : 'Le mail') : titre}</h2>
            <p>{enVente.map(bienCourt).join(' · ') || 'Aucun bien en vente dans la sélection.'}</p>
          </div>
          <button type="button" className={l.fermer} aria-label="Fermer" disabled={occupe} onClick={onFermer}><Ic n="croix" t={15} e={2.3} /></button>
        </div>

        <div className={l.corps}>
          {avance ? (
            <div className={l.avance} role="status">
              <span className={l.avanceBarre}><i style={{ width: `${avance.total ? ((avance.fait + avance.erreurs.length) / avance.total) * 100 : 100}%` }} /></span>
              <b>{fini ? bilan : `${en === 'mail' ? 'Envoi des mails' : en === 'espace' ? 'Envoi dans les espaces' : 'Mise en sélection'}… ${avance.fait + avance.erreurs.length} sur ${avance.total}`}</b>
              {fini && en !== 'selection' && avance.fait > 0 && <span>{'Une relance « sans réponse » est posée pour chacun, et ils sont prévenus sur leur téléphone s’ils l’ont accepté.'}</span>}
              {avance.erreurs.length > 0 && <ul className={l.erreurs}>{avance.erreurs.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            </div>
          ) : etape === 'mail' ? (
            <>
              <label className={l.champ}><span>Objet</span>
                <input className={l.in} value={mail?.objet || ''} disabled={!mail} onChange={e => setMail(m => (m ? { ...m, objet: e.target.value } : m))} />
              </label>
              <label className={l.champ}><span>Le message</span>
                <textarea className={l.in} rows={11} value={mail?.corps || ''} disabled={!mail} placeholder={mail ? '' : 'Chargement du modèle…'} onChange={e => setMail(m => (m ? { ...m, corps: e.target.value } : m))} />
              </label>
              <p className={l.aide}><Ic n="info" t={14} /><span>{'{{prénom}} devient le prénom de chacun. Ses biens s’ajoutent sous le texte, avec leurs photos et un bouton vers leur fiche.'}</span></p>
              <div className={l.dest}>
                <b>{avecMail.length > 1 ? `${avecMail.length} destinataires` : '1 destinataire'}</b>
                <ul>
                  {avecMail.map(x => {
                    const n = aEnvoyer(x, 'mail', partiels).length;
                    return <li key={x.cle}><span>{nomClient(x.acheteur.client)}</span><small>{`${mailDe(x.acheteur)} · ${n > 1 ? `${n} biens` : '1 bien'}`}</small></li>;
                  })}
                </ul>
              </div>
              {sansMail.length > 0 && (
                <div className={l.ignores}>
                  <b>{sansMail.length > 1 ? `${sansMail.length} sans adresse e-mail` : '1 sans adresse e-mail'}</b>
                  <span>{`${sansMail.map(x => nomClient(x.acheteur.client)).join(', ')} : pas d’adresse sur ${sansMail.length > 1 ? 'leur' : 'sa'} fiche. « Dans leur espace » envoie les biens sans mail.`}</span>
                </div>
              )}
            </>
          ) : (
            <>
              {ecartes.length > 0 && (
                <div className={l.ignores}>
                  <b>{ecartes.length > 1 ? `${ecartes.length} biens laissés de côté` : '1 bien laissé de côté'}</b>
                  <ul>{ecartes.map((x, i) => <li key={i}><span>{x.nom}</span><small>{x.pourquoi}</small></li>)}</ul>
                </div>
              )}
              {lignes.length === 0 ? (
                <div className={l.vide}>
                  <span className={l.videIc}><Ic n="groupe" t={24} /></span>
                  <b>{enVente.length ? 'Aucune recherche active ne correspond à ces biens.' : 'Aucun de ces biens n’est en vente.'}</b>
                  <span>{enVente.length ? 'La liste se remplit dès qu’un acheteur est suivi, ou que le prix change.' : 'L’envoi aux acheteurs s’ouvre au mandat.'}</span>
                </div>
              ) : (
                <>
                  <div className={l.barreHaut}>
                    <CaseLigne on={tous} onBasculer={() => setChoisis(tous ? new Set() : new Set(possibles.map(x => x.cle)))} titre={tous ? 'Tout décocher' : 'Tout cocher'} />
                    <span className={l.barreHautTx}><b>{vues.length}</b>{vues.length > 1 ? ' acheteurs correspondent' : ' acheteur correspond'}</span>
                    {aPartiels && (
                      <label className={l.partiels}>
                        <input type="checkbox" checked={partiels} onChange={e => setPartiels(e.target.checked)} />
                        <span>{'Aussi « en partie » (50 à 69 %)'}</span>
                      </label>
                    )}
                  </div>
                  <div className={l.lignes}>
                    {vues.map((x, rang) => {
                      const items = partiels ? x.items : x.items.filter(i => i.acheteur.corr.note >= SEUIL_CORRESPOND);
                      const n = aEnvoyer(x, 'mail', partiels).length;
                      const nSel = aEnvoyer(x, 'selection', partiels).length;
                      const rien = !n && !nSel;
                      const on = choisis.has(x.cle) && !rien;
                      const a = x.acheteur;
                      return (
                        <div key={x.cle} className={l.ligne} data-on={on ? 'oui' : 'non'} data-rien={rien ? 'oui' : undefined} style={{ animationDelay: `${Math.min(rang, 8) * 0.035}s` }}>
                          {rien ? <span className={l.caseVide} title="Il a déjà tous ces biens" /> : <CaseLigne on={on} onBasculer={() => basculer(x.cle)} titre={on ? `Décocher ${nomClient(a.client)}` : `Cocher ${nomClient(a.client)}`} />}
                          <Avatar acheteur={a} />
                          <div className={l.qui}>
                            <div className={l.quiL1}>
                              <button type="button" className={l.nom} onClick={() => onFiche(a.client.id)}>{nomClient(a.client)}</button>
                              {a.recherche.budget_max ? <span className={l.budget}>{`jusqu’à ${euros(a.recherche.budget_max)}`}</span> : null}
                            </div>
                            <div className={l.pastilles}>
                              {items.map(i => (
                                <span key={i.bien.id} className={l.pastille} data-ton={presente(i.acheteur.copie) ? 'deja' : i.acheteur.corr.note >= SEUIL_CORRESPOND ? 'bon' : 'partiel'}
                                  title={presente(i.acheteur.copie) ? 'Il l’a déjà reçu' : i.acheteur.copie ? 'Déjà dans sa sélection, pas encore envoyé' : `Correspond à ${i.acheteur.corr.note} %`}>
                                  <b>{`${i.acheteur.corr.note} %`}</b>{bienCourt(i.bien)}{presente(i.acheteur.copie) ? ' · déjà reçu' : i.acheteur.copie ? ' · en sélection' : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                          <span className={l.combien}>{rien ? 'Déjà reçu' : n ? (n > 1 ? `${n} biens` : '1 bien') : 'En sélection'}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className={l.pied}>
          {avance ? (
            fini
              ? <button type="button" className={`${l.btn} ${l.btnPrim}`} onClick={onFermer}>Fermer</button>
              : <button type="button" className={l.btn} disabled>En cours…</button>
          ) : etape === 'mail' ? (
            <>
              <button type="button" className={l.btn} onClick={() => setEtape('qui')}><Ic n="gauche" t={14} e={2.3} />Retour</button>
              <button type="button" className={`${l.btn} ${l.btnOr}`} disabled={!mail || !mail.objet.trim() || !mail.corps.trim() || !avecMail.length} onClick={() => { void lancer('mail'); }}>
                <Ic n="envoyer" t={15} />{avecMail.length > 1 ? `Envoyer les ${avecMail.length} mails` : 'Envoyer le mail'}
              </button>
            </>
          ) : (
            <>
              <span className={l.piedTx}>{coches.length ? `${coches.length > 1 ? `${coches.length} acheteurs choisis` : '1 acheteur choisi'}` : 'Coche les acheteurs'}</span>
              <button type="button" className={l.btn} disabled={!total('selection')} onClick={() => { void lancer('selection'); }}
                title="Les biens entrent dans leur dossier, à l’étape Sélection. Rien ne part : ils ne les voient pas encore.">
                <Ic n="liste" t={15} />Mettre en sélection
              </button>
              <button type="button" className={l.btn} disabled={!total('espace')} onClick={() => { void lancer('espace'); }}
                title="Ils arrivent tout de suite dans leur espace, avec la note de correspondance. Prévenus sur leur téléphone s’ils l’ont accepté.">
                <Ic n="envoyer" t={15} />Dans leur espace
              </button>
              <button type="button" className={`${l.btn} ${l.btnOr}`} disabled={!total('mail')} onClick={() => setEtape('mail')}
                title="Un mail par acheteur, à son prénom, avec ses biens. Tu relis le texte avant qu’il parte.">
                <Ic n="mail" t={15} />Par mail…
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
