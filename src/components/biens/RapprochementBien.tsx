'use client';
/* ═══ Le rapprochement d'un bien (V3.112) ═══════════════════════════════════
   L'onglet « Rapprochement » de la fiche d'un bien (il s'appelait
   « Acheteurs »). Alexandre : « je ne comprends pas… je n'avais même pas fait
   attention à "parmi vos neuf recherches actives"… il faut mieux présenter,
   mieux expliquer… que je comprenne quoi faire, si j'ai oublié ».

   De haut en bas (maquettes A et B, validées en mélange) :
   · une phrase qui dit ce que fait l'onglet, « Comment on les trouve » à
     déplier, et les trois gestes : regarde, coche, « Envoyer… » ;
   · le tri de ta base : N recherches ouvertes, une barre proportionnelle,
     quatre cases qui s'additionnent (outils.ts, triBien) ;
   · une rubrique par case : Ils correspondent, En partie, À compléter. Sur
     chaque acheteur, ses critères cochés ou barrés ;
   · « Pas montrés », en carrés par raison, les plus proches en tête, « Lui
     envoyer quand même » ;
   · le pied : combien de cochés, « Un autre client… », « Envoyer… ».

   Les prospects correspondent comme les actifs (V3.112) : leur statut
   s'affiche à côté du nom. Avant le mandat, l'envoi est ouvert (V3.111). */

import { useMemo, useState } from 'react';
import { Ic } from '@/components/documents/ApercuActe';
import { euros } from '@/lib/mandat';
import type { BienVente } from '@/lib/biens-vente';
import type { LigneCorr } from '@/lib/correspondance';
import { Avatar, Illu, Note, ecart, etat, mailDe, sansEspaces, telDe, type ModeAcheteurs } from './AcheteursBien';
import {
  RAISONS_CACHE, STATUT_ACHETEUR, acheteurChoisi, nomClient,
  type Acheteur, type Cache, type Copie, type RaisonCache, type TriBien,
} from './outils';
import r from './RapprochementBien.module.css';

const presente = (c: Copie | null) => !!c && c.etape !== 'selection';
const pl = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);
const ICONE_CACHE: Record<RaisonCache, string> = {
  secteur: 'lieu', type: 'maison', budget: 'euro', surface: 'regle', chambres: 'lit', indispensable: 'cadenas', loin: 'cible', peu: 'info',
};
const COULEURS = { bons: '#16a34a', partiels: '#c9a84c', incomplets: '#3b82f6', caches: '#cbd5e1' };

/* Les critères principaux d'abord (budget, secteur, surface, chambres), puis ce qui coince. */
function critsDe(x: Acheteur): LigneCorr[] {
  const principaux = ['Budget', 'Secteur', 'Surface', 'Chambres'];
  const l = x.corr.lignes;
  const tete = principaux.map(p => l.find(y => y.lib === p)).filter((y): y is LigneCorr => !!y);
  const reste = l.filter(y => !principaux.includes(y.lib) && y.etat !== 'oui');
  return [...tete, ...reste].slice(0, 5);
}
function Etat({ e }: { e: LigneCorr['etat'] }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={e === 'oui' ? 'm5 12.5 4.5 4.5L19 7.5' : e === 'presque' ? 'M6 12h12' : 'M7 7l10 10M17 7 7 17'} />
    </svg>
  );
}

export function RapprochementBien({ bien, tri, mode, copies, onFiche, onAgir, onAutre }: {
  bien: BienVente; tri: TriBien; mode: ModeAcheteurs; copies: Copie[];
  onFiche: (clientId: string) => void;
  /* « Envoyer… » : la fenêtre des trois choix (FenEnvoiAcheteurs). */
  onAgir?: (l: Acheteur[]) => void;
  /* « Un autre client… » : la fenêtre d'envoi avec la recherche par nom (LotBiens). */
  onAutre?: () => void;
}) {
  const peutEnvoyer = (mode === 'vente' || mode === 'avant') && !!onAgir;
  const ce = (() => {
    const t = String(bien.donnees?.typeBien || '');
    return t === 'maison' ? 'cette maison' : t === 'appartement' || t === 'studio' || t === 'duplex' || t === 'loft' ? 'cet appartement' : t === 'terrain' ? 'ce terrain' : 'ce bien';
  })();
  const [aide, setAide] = useState(false);
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [choisis, setChoisis] = useState<string[]>(() => (peutEnvoyer ? tri.bons.filter(x => !x.copie).slice(0, 3).map(x => x.recherche.id) : []));
  const tous = useMemo(() => [...tri.bons, ...tri.partiels, ...tri.incomplets], [tri]);
  const coches = tous.filter(x => choisis.includes(x.recherche.id) && !presente(x.copie));
  const basculer = (id: string) => setChoisis(c => (c.includes(id) ? c.filter(y => y !== id) : [...c, id]));
  const ouvrir = (k: string) => setOuverts(o => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const aller = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /* Les pas montrés, par raison : la plus nombreuse d'abord. */
  const parRaison = useMemo(() => {
    const m = new Map<RaisonCache, Cache[]>();
    for (const c of tri.caches) m.set(c.raison, [...(m.get(c.raison) || []), c]);
    return [...m.entries()].sort((p, q) => q[1].length - p[1].length);
  }, [tri.caches]);

  const cases = [
    { k: 'bons', id: 'rb-bons', l: 'Correspondent', n: tri.bons.length, s: '70 % et plus de leurs critères.', c: COULEURS.bons },
    { k: 'partiels', id: 'rb-partiels', l: 'En partie', n: tri.partiels.length, s: '50 à 69 % : un critère n’est pas tenu.', c: COULEURS.partiels },
    { k: 'incomplets', id: 'rb-incomplets', l: 'À compléter', n: tri.incomplets.length, s: 'Sans budget ou sans secteur : pas de note fiable.', c: COULEURS.incomplets },
    { k: 'caches', id: 'rb-caches', l: 'Pas montrés', n: tri.caches.length, s: 'Trop cher pour eux, autre secteur, autre type…', c: COULEURS.caches },
  ];

  const ligne = (x: Acheteur, i: number) => {
    const deja = presente(x.copie);
    const on = choisis.includes(x.recherche.id) && !deja;
    const e = ecart(x);
    const et = etat(x);
    const tel = telDe(x), mail = mailDe(x);
    const statut = STATUT_ACHETEUR[String(x.client.statut || '')];
    return (
      <div key={x.recherche.id} className={`${r.ligne} ${peutEnvoyer ? r.ligneEnvoi : ''} ${on ? r.ligneOn : ''}`} style={{ animationDelay: `${Math.min(i, 8) * 0.035}s` }}>
        {peutEnvoyer && (
          <button type="button" className={`${r.coche} ${on ? r.cocheOn : ''}`} disabled={deja} aria-pressed={on}
            aria-label={deja ? 'Déjà présenté' : on ? `Décocher ${nomClient(x.client)}` : `Cocher ${nomClient(x.client)}`} title={deja ? 'Il l’a déjà dans son espace' : undefined}
            onClick={() => basculer(x.recherche.id)}>
            <Ic n="check" t={13} e={3.2} />
          </button>
        )}
        <Note n={x.corr.note} gris={!!x.manque.length} />
        <span className={r.av}><Avatar acheteur={x} /></span>
        <div className={r.qui}>
          <div className={r.quiL1}>
            <button type="button" className={r.nom} onClick={() => onFiche(x.client.id)}>{nomClient(x.client)}</button>
            {statut && <span className={r.tag}>{statut}</span>}
            {x.recherche.budget_max ? <span className={r.budget}>{`jusqu’à ${euros(x.recherche.budget_max)}`}</span> : null}
          </div>
          <div className={r.crits}>
            {critsDe(x).map((l, k) => (
              <span key={l.lib + k} className={r.crit} data-etat={l.etat} title={`${l.lib} : ${l.valeur}, demandé ${l.demande}`}><Etat e={l.etat} />{l.lib}</span>
            ))}
          </div>
          {/* « Tout correspond » : les critères cochés le disent déjà. */}
          {!e.ok && <span className={r.ecartKo}>{e.t}</span>}
          {et && <span className={et.ton === 'nouveau' ? r.etatNouveau : r.etat}>{et.ton === 'nouveau' && <i className={r.ping} />}{et.t}</span>}
        </div>
        <div className={r.actions}>
          <div className={r.contacts}>
            {tel && <a className={r.rond} href={`tel:${sansEspaces(tel)}`} aria-label={`Appeler ${nomClient(x.client)}`} title={tel}><Ic n="telephone" t={16} /><span className={r.rondTx}>Appeler</span></a>}
            {tel && <a className={r.rond} href={`sms:${sansEspaces(tel)}`} aria-label={`SMS à ${nomClient(x.client)}`} title="SMS"><Ic n="bulle" t={16} /><span className={r.rondTx}>SMS</span></a>}
            {mail && <a className={`${r.rond} ${r.rondMail}`} href={`mailto:${mail}`} aria-label={`Mail à ${nomClient(x.client)}`} title={mail}><Ic n="mail" t={16} /></a>}
          </div>
          {x.manque.length > 0 && (
            <button type="button" className={r.completer} onClick={() => onFiche(x.client.id)} title="Ouvrir sa fiche pour compléter sa recherche">Compléter sa recherche</button>
          )}
          {peutEnvoyer && (
            <button type="button" className={r.agir} onClick={() => onAgir!([x])}>
              <Ic n="envoyer" t={15} />{deja ? 'Renvoyer…' : 'Envoyer…'}
            </button>
          )}
        </div>
      </div>
    );
  };

  const rubrique = (id: string, cle: string, titre: string, sous: string, couleur: string, l: Acheteur[], depart: number) => {
    if (!l.length) return null;
    const max = 5;
    const tout = ouverts.has(cle);
    const vus = tout ? l : l.slice(0, max);
    return (
      <section id={id} className={r.rubrique} aria-label={titre}>
        <div className={r.rubT}>
          <span className={r.puce} style={{ background: couleur }} />
          <h4>{titre}</h4>
          <b>{l.length}</b>
          <span>{sous}</span>
        </div>
        <div className={r.lignes}>{vus.map((x, i) => ligne(x, depart + i))}</div>
        {l.length > max && (
          <button type="button" className={r.plus} onClick={() => ouvrir(cle)}>{tout ? 'Replier' : `Voir les ${l.length - max} autres`}</button>
        )}
      </section>
    );
  };

  return (
    <div className={r.page}>
      {/* Ce que fait l'onglet, et quoi faire */}
      <section className={r.hero}>
        <div className={r.heroL}>
          <Illu />
          <div className={r.heroTx}>
            <h3>{`Qui, dans ta base, pourrait acheter ${ce} ?`}</h3>
            <p>{`On compare ${ce} avec chaque recherche ouverte de tes acheteurs : actifs, prospects, en pause. La note est la même que celle qu’ils voient dans leur espace.`}</p>
          </div>
          <button type="button" className={r.aideBtn} aria-expanded={aide} onClick={() => setAide(a => !a)}>
            <Ic n="info" t={15} />{aide ? 'Fermer' : 'Comment ça marche ?'}
          </button>
        </div>
        {aide && (
          <div className={r.aide}>
            <ol className={r.aideEtapes}>
              <li><b>{'Tes recherches ouvertes'}</b><span>{'Celles de tes acheteurs en cours, actifs, prospects ou en pause. Ni les archivés, ni ceux qui ont trouvé, ni le propriétaire du bien.'}</span></li>
              <li><b>{'Le même type de bien'}</b><span>{'Une maison n’est pas comparée à une recherche d’appartement.'}</span></li>
              <li><b>{'Une note sur 100'}</b><span>{'Budget, secteur, trajet, surface et chambres comptent double ; un indispensable, triple. Il faut au moins trois critères à comparer.'}</span></li>
              <li><b>{'Écartés d’office'}</b><span>{'Budget dépassé de plus de 10 %, ville hors de leurs secteurs, surface sous 90 % de leur minimum, pas assez de chambres, un indispensable qui manque.'}</span></li>
            </ol>
            <div className={r.legende}>
              <span><i style={{ background: COULEURS.bons }} /><b>{'70 % et plus'}</b>{' correspondent'}</span>
              <span><i style={{ background: COULEURS.partiels }} /><b>{'50 à 69 %'}</b>{' en partie'}</span>
              <span><i style={{ background: COULEURS.caches }} /><b>{'Moins de 50 %'}</b>{' pas montrés'}</span>
            </div>
            <p>{'Tout se recalcule seul : dès qu’un acheteur arrive, qu’un critère ou que le prix change.'}</p>
          </div>
        )}
        {peutEnvoyer ? (
          <ol className={r.etapes}>
            <li><i>1</i><span><b>{'Regarde qui correspond'}</b>{' : les meilleures notes d’abord'}</span></li>
            <li><i>2</i><span><b>{'Coche'}</b>{' ceux à qui le proposer'}</span></li>
            <li><i>3</i><span><b>{'« Envoyer… »'}</b>{' : dans leur sélection (rien ne part), dans leur espace, ou par mail'}</span></li>
          </ol>
        ) : (
          <p className={r.verrou}><Ic n="cadenas" t={14} />{mode === 'pause' ? 'Vente en pause : la liste reste, l’envoi reprend avec elle.' : 'Ce bien n’est plus en vente : la liste reste, en lecture.'}</p>
        )}
        {mode === 'avant' && peutEnvoyer && (
          <p className={r.info}><Ic n="info" t={14} /><span>{`Pas encore sous mandat : tu peux déjà le présenter. Il partira sans prix ; le prix arrivera chez l’acheteur à la signature du mandat.`}</span></p>
        )}
      </section>

      {/* Le tri de ta base */}
      <section className={r.tri} aria-label="Le tri de tes recherches">
        {tri.vide ? (
          <p className={r.triVide}>{'Renseigne au moins le type de bien ou son prix : sans eux, rien à comparer.'}</p>
        ) : tri.total === 0 ? (
          <p className={r.triVide}>{'Aucune recherche ouverte dans ta base pour l’instant : la liste se remplira dès qu’un acheteur sera suivi.'}</p>
        ) : (
          <>
            <div className={r.triT}>
              <b>{tri.total}</b>
              <span>{`${pl(tri.total, 'recherche ouverte', 'recherches ouvertes')} dans ta base, ${pl(tri.total, 'triée', 'triées')} pour ${ce}`}</span>
            </div>
            <div className={r.barre} aria-hidden="true">
              {cases.filter(c => c.n).map(c => <span key={c.k} style={{ flexGrow: c.n, background: c.c }} />)}
            </div>
            <div className={r.cases}>
              {cases.map(c => (
                <button key={c.k} type="button" className={r.case} data-k={c.k} disabled={!c.n} onClick={() => aller(c.id)}>
                  <span className={r.caseL1}><i style={{ background: c.c }} /><b>{c.l}</b><strong>{c.n}</strong></span>
                  <span className={r.caseS}>{c.s}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {rubrique('rb-bons', 'bons', 'Ils correspondent', '70 % et plus de leurs critères : à appeler en premier.', COULEURS.bons, tri.bons, 0)}
      {rubrique('rb-partiels', 'partiels', 'En partie', 'Un critère n’est pas tenu : ça peut se discuter avec eux.', COULEURS.partiels, tri.partiels, tri.bons.length)}
      {rubrique('rb-incomplets', 'incomplets', 'À compléter', 'Leur recherche ne dit pas son budget ou son secteur : complète-la depuis leur fiche.', COULEURS.incomplets, tri.incomplets, 0)}
      {!tri.vide && tri.total > 0 && !tri.bons.length && !tri.partiels.length && !tri.incomplets.length && (
        <div className={r.aucun}>
          <span className={r.aucunIc}><Ic n="groupe" t={24} /></span>
          <b>{`Personne dans ta base ne correspond à ${ce} pour l’instant.`}</b>
          <span>{'Regarde « Pas montrés » ci-dessous : un acheteur juste au-dessus de son budget peut valoir un appel.'}{onAutre && peutEnvoyer ? ' Ou choisis toi-même un client avec « Un autre client… ».' : ''}</span>
        </div>
      )}

      {/* Pas montrés, par raison */}
      {parRaison.length > 0 && (
        <section id="rb-caches" className={r.caches} aria-label="Pas montrés">
          <div className={r.rubT}>
            <span className={r.puce} style={{ background: COULEURS.caches }} />
            <h4>Pas montrés</h4>
            <b>{tri.caches.length}</b>
            <span>{`Ils ont une recherche ouverte, mais ${ce} ne leur va pas. Rangés par raison, les plus proches en tête.`}</span>
          </div>
          <div className={r.carres}>
            {parRaison.map(([raison, l]) => {
              const tout = ouverts.has(`c-${raison}`);
              const vus = tout ? l : l.slice(0, 2);
              return (
                <div key={raison} className={r.carre}>
                  <div className={r.carreT}>
                    <span className={r.carreIc}><Ic n={ICONE_CACHE[raison]} t={17} /></span>
                    <strong>{l.length}</strong>
                  </div>
                  <b className={r.carreL}>{RAISONS_CACHE[raison].lib}</b>
                  <span className={r.carreS}>{RAISONS_CACHE[raison].sous}</span>
                  <div className={`${r.carreGens} ${tout ? r.carreGensTout : ''}`}>
                    {vus.map(c => (
                      <div key={c.recherche.id} className={r.gens}>
                        <span className={r.gensTx}>
                          <button type="button" className={r.gensNom} onClick={() => onFiche(c.client.id)}>{nomClient(c.client)}</button>
                          {c.detail ? <small>{c.detail}</small> : null}
                        </span>
                        {peutEnvoyer && (
                          <button type="button" className={r.gensEnvoi} title="Lui proposer quand même ce bien"
                            onClick={() => onAgir!([{ ...acheteurChoisi(bien, c.recherche, c.client, copies), horsListe: [RAISONS_CACHE[raison].lib.toLowerCase(), c.detail].filter(Boolean).join(', ') }])}>Envoyer</button>
                        )}
                      </div>
                    ))}
                  </div>
                  {l.length > 2 && <button type="button" className={r.carrePlus} onClick={() => ouvrir(`c-${raison}`)}>{tout ? 'Replier' : `Voir les ${l.length}`}</button>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {peutEnvoyer && !tri.vide && (
        <div className={r.pied}>
          <span className={r.piedN}><b>{coches.length}</b>{pl(coches.length, 'acheteur coché', 'acheteurs cochés')}</span>
          <span className={r.piedAide}>{'« Envoyer… » te laisse choisir : dans leur sélection (rien ne part), dans leur espace, ou par mail.'}</span>
          {onAutre && (
            <button type="button" className={r.autre} onClick={onAutre}><Ic n="plus" t={15} e={2.4} />Un autre client…</button>
          )}
          <button type="button" className={r.btnOr} disabled={!coches.length} onClick={() => onAgir!(coches)}>
            <Ic n="envoyer" t={17} />Envoyer…{coches.length > 0 && <b className={r.btnN}>{coches.length}</b>}
          </button>
        </div>
      )}
    </div>
  );
}

