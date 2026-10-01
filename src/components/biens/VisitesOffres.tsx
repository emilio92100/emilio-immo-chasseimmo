'use client';
/* ═══ L'onglet « Visites et offres » d'un bien, refait (V3.32) ═══════════
   Alexandre : « on ne comprend pas cette catégorie ». Les visites à gauche,
   les offres à droite, deux petits « + » : rien ne disait comment l'une
   mène à l'autre. Désormais, de haut en bas :
   1. l'en-tête : où l'on en est en quatre chiffres, et les deux gestes —
      « Organiser une visite », « Enregistrer une offre » ;
   2. vide, le chemin en trois étapes (visite, compte rendu, offre) ;
   3. « À faire » : les comptes rendus en retard, les offres qui attendent la
      réponse du vendeur, l'offre acceptée en route vers le compromis ;
   4. « Les prochaines visites » ;
   5. « L'historique » : visites et offres mêlées, par date, en frise.
   Les cartes d'action restent celles de la V3.29 (CarteVisiteB,
   CarteOffreB, dans OngletsBien.tsx) ; la frise est ici.
   V3.45 : trois rubriques repliables, dans l'ordre d'une vente — les
   visites, les offres (une carte par acquéreur, toute la largeur, avec sa
   négociation), l'historique. */
import { useState, type ReactNode } from 'react';
import { euros } from '@/lib/mandat';
import { ISSUES } from '@/lib/visites';
import { echangesDe, montantActuel, type SuiviVente } from '@/lib/biens-vente';
import { Ic } from '@/components/documents/ApercuActe';
import Depliant from '@/components/shared/Depliant';
import { PastillePli } from '@/components/shared/Pli';
import { CarteOffreB, CarteVisiteB, dateAn, type ActionsOffre, type VisiteCarte } from './OngletsBien';
import x from './VisitesOffres.module.css';

const NBSP = ' ';
const jourMidi = (iso: string) => new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
const pct = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')}${NBSP}%`;
const ouverte = (o: SuiviVente) => !o.statut || o.statut === 'en_attente' || o.statut === 'contre';

export type ActionsVisite = { onCR: () => void; onAnnuler: () => void; onDoc: () => void; onFiche?: () => void; onOffre?: () => void };
export type { ActionsOffre };

const PUCE_OFFRE: Record<string, { l: string; fond: string; c: string }> = {
  en_attente: { l: 'En attente de réponse', fond: '#fbf6e9', c: '#7a5d1c' },
  contre: { l: 'Contre-offre', fond: '#eff6ff', c: '#1d4ed8' },
  acceptee: { l: 'Acceptée', fond: '#dcfce7', c: '#15803d' },
  refusee: { l: 'Refusée', fond: '#f1f5f9', c: '#475569' },
  retiree: { l: 'Retirée', fond: '#f1f5f9', c: '#475569' },
};

/* La date, en pavé : le jour, le mois, l'année (V3.45). */
function Jour({ iso }: { iso: string }) {
  const d = jourMidi(iso);
  const ok = !isNaN(d.getTime());
  return (
    <span className={x.jour} aria-hidden="true">
      <b>{ok ? d.getDate() : '?'}</b>
      <small>{ok ? d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') : ''}</small>
      {ok && <em>{d.getFullYear()}</em>}
    </span>
  );
}

/* Une rubrique, repliable sur une ligne (V3.45) : le titre, le nombre, le
   « Voir / Replier » juste à côté (V3.33), et ce qu'elle contient en bref. */
function Rubrique({ titre, n, resume, ouvert, onClick }: { titre: string; n: number; resume?: string; ouvert: boolean; onClick: () => void }) {
  return (
    <button type="button" className={x.rubrique} data-ouvert={ouvert ? 'oui' : 'non'} aria-expanded={ouvert} onClick={onClick}>
      <h3>{titre}</h3>
      <i>{n}</i>
      <PastillePli ouvert={ouvert} voir="Déplier" replier="Replier" />
      {resume && <span className={x.rubriqueR}>{resume}</span>}
    </button>
  );
}
const CLE_PLIS = 'emilio.visitesOffres.plis';
const lirePlis = (): Record<string, boolean> => {
  try { const v = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(CLE_PLIS) || '{}') : {}; return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};
const garderPlis = (v: Record<string, boolean>) => { try { localStorage.setItem(CLE_PLIS, JSON.stringify(v)); } catch { /* rien à garder */ } };

type Evt = { cle: string; tri: string; genre: 'visite' | 'offre'; v?: VisiteCarte; o?: SuiviVente };

export function OngletVisitesOffres({ visites, offres, prix, compromis, onVisite, onOffre, actVisite, actOffre, encart }: {
  visites: VisiteCarte[]; offres: SuiviVente[]; prix: number | null; compromis: boolean;
  /* V3.48 : absents quand l'étape ne le permet plus (vendu, retiré, avant le mandat). */
  onVisite?: () => void; onOffre?: () => void;
  actVisite: (cle: string) => ActionsVisite | null; actOffre: (o: SuiviVente) => ActionsOffre;
  /* Un mot d'étape (« plus aucune offre en cours », « une offre est acceptée ») */
  encart?: ReactNode;
}) {
  const [filtre, setFiltre] = useState<'tout' | 'visite' | 'offre'>('tout');
  /* V3.45 : chaque rubrique se replie sur une ligne (gardé dans ce navigateur),
     et chaque offre aussi — pour rester sur ce qu'on traite. */
  const [plis, setPlis] = useState<Record<string, boolean>>(lirePlis);
  const ouvert = (k: string) => !plis[k];
  const basculer = (k: string) => setPlis(p => { const n = { ...p, [k]: !p[k] }; garderPlis(n); return n; });
  const [offresRepliees, setOffresRepliees] = useState<string[]>([]);
  const plierOffre = (id: string) => setOffresRepliees(l => (l.includes(id) ? l.filter(y => y !== id) : [...l, id]));
  const annulee = (v: VisiteCarte) => v.statut === 'annulee';
  const crAFaire = (v: VisiteCarte) => v.passee && !annulee(v) && !v.issue && v.statut !== 'faite';
  const faites = visites.filter(v => v.passee && !annulee(v));
  const avenir = visites.filter(v => !v.passee && !annulee(v)).sort((p, q) => `${p.ymd}${p.heure}`.localeCompare(`${q.ymd}${q.heure}`));
  const aFaireV = visites.filter(crAFaire);
  const enCours = offres.filter(ouverte);
  const accepteeSansCompromis = compromis ? [] : offres.filter(o => o.statut === 'acceptee');
  const aFaireO = [...enCours, ...accepteeSansCompromis];
  /* V3.45 : l'offre du compromis reste en haut, avec ses dates et la suite
     (« La vente est signée »), au lieu de filer dans l'historique sans bouton. */
  const actions = new Map(offres.map(o => [o.id, actOffre(o)] as const));
  const vente = compromis ? offres.filter(o => o.statut === 'acceptee' && actions.get(o.id)?.compromis) : [];
  /* La meilleure : la dernière proposition de chaque acquéreur, pas une contre-offre du vendeur. */
  const meilleure = enCours.reduce((m, o) => Math.max(m, [...echangesDe(o)].reverse().find(e => e.par === 'acquereur')?.montant || 0), 0);

  /* L'historique : ce qui n'est plus « à faire » ni « à venir ». */
  const dejaHaut = new Set([...aFaireV.map(v => v.cle), ...avenir.map(v => v.cle), ...aFaireO.map(o => 'o-' + o.id), ...vente.map(o => 'o-' + o.id)]);
  const evts: Evt[] = [
    ...visites.filter(v => !dejaHaut.has(v.cle)).map(v => ({ cle: v.cle, tri: `${v.ymd}${v.heure}`, genre: 'visite' as const, v })),
    ...offres.filter(o => !dejaHaut.has('o-' + o.id)).map(o => ({ cle: 'o-' + o.id, tri: o.le.slice(0, 16).replace('T', ''), genre: 'offre' as const, o })),
  ].sort((p, q) => q.tri.localeCompare(p.tri));
  const montres = evts.filter(e => filtre === 'tout' || e.genre === filtre);
  const rien = !visites.length && !offres.length;

  const chiffres = [
    { n: faites.length, l: `visite${faites.length > 1 ? 's' : ''} faite${faites.length > 1 ? 's' : ''}` },
    { n: avenir.length, l: 'à venir' },
    { n: aFaireV.length, l: `compte${aFaireV.length > 1 ? 's' : ''} rendu${aFaireV.length > 1 ? 's' : ''} à faire`, alerte: aFaireV.length > 0 },
    { n: enCours.length, l: `offre${enCours.length > 1 ? 's' : ''} en cours`, sous: meilleure ? `la meilleure : ${euros(meilleure)}` : '' },
  ];

  return (
    <div className={x.page}>
      {/* ── L'en-tête : les chiffres, et les deux gestes ── */}
      <section className={x.tete}>
        <div className={x.teteHaut}>
          <div className={x.teteTx}>
            <h2>Visites et offres</h2>
            <p>Chaque visite, son compte rendu, puis les offres et la réponse du vendeur : tout ce qui mène au compromis.</p>
          </div>
          {(onVisite || onOffre) && (
            <div className={x.gestes}>
              {onVisite && <button type="button" className={x.gesteVisite} onClick={onVisite}><Ic n="calendrier" t={17} />Organiser une visite</button>}
              {onOffre && <button type="button" className={x.gesteOffre} onClick={onOffre}><Ic n="euro" t={17} />Enregistrer une offre</button>}
            </div>
          )}
        </div>
        {!rien && (
          <div className={x.chiffres}>
            {chiffres.map(c => (
              <div key={c.l} className={x.chiffre} data-alerte={c.alerte ? 'oui' : 'non'}>
                <b>{c.n}</b><span>{c.l}</span>{c.sous && <small>{c.sous}</small>}
              </div>
            ))}
          </div>
        )}
      </section>

      {encart && <div className={x.encart}>{encart}</div>}

      {/* ── Vide : le chemin, en trois étapes (les boutons sont en haut) ── */}
      {rien && (
        <section className={x.bloc} aria-label="Comment ça se passe">
          <div className={x.blocT}><h3>Comment ça se passe</h3></div>
          <div className={x.chemin}>
            {[
              { ic: 'calendrier', t: 'Organiser une visite', p: 'Avec un acheteur suivi : elle va dans son dossier et dans l’agenda. Ou avec quelqu’un hors du CRM.' },
              { ic: 'bulle', t: 'Le compte rendu', p: 'Après la visite : ce qu’il en a pensé, ses étoiles, et la suite — il veut faire une offre, revoir le bien, il réfléchit.' },
              { ic: 'euro', t: 'L’offre, puis la réponse', p: 'Le montant, le financement, le délai. Le vendeur accepte, refuse ou fait une contre-offre ; acceptée, on va vers le compromis.' },
            ].map((e, i) => (
              <div key={e.t} className={x.etape}>
                <span className={x.etapeN}>{i + 1}</span>
                <span className={x.etapeIc} data-i={i}><Ic n={e.ic} t={18} /></span>
                <b>{e.t}</b>
                <p>{e.p}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Les visites (en haut : une visite, puis une offre) ── */}
      {(aFaireV.length > 0 || avenir.length > 0) && (
        <section className={x.bloc}>
          <Rubrique titre="Les visites" n={aFaireV.length + avenir.length} ouvert={ouvert('visites')} onClick={() => basculer('visites')}
            resume={[
              avenir.length ? `${avenir.length} à venir` : '',
              aFaireV.length ? `${aFaireV.length} compte${aFaireV.length > 1 ? 's' : ''} rendu${aFaireV.length > 1 ? 's' : ''} à faire` : '',
              avenir[0] ? `prochaine le ${dateAn(avenir[0].ymd)}${avenir[0].heure ? ` à ${avenir[0].heure.slice(0, 5).replace(':', ' h ')}` : ''}, ${avenir[0].qui}` : '',
            ].filter(Boolean).join(' · ')} />
          <Depliant ouvert={ouvert('visites')} ecart={10}>
            <div className={x.enCours} data-deux={aFaireV.length > 0 && avenir.length > 0 ? 'oui' : 'non'}>
              {aFaireV.length > 0 && (
                <div className={x.sousBloc}>
                  <h4>{aFaireV.length > 1 ? 'Comptes rendus à faire' : 'Compte rendu à faire'}</h4>
                  <div className={x.grille}>
                    {aFaireV.map(v => {
                      const a = actVisite(v.cle);
                      return a ? <CarteVisiteB key={v.cle} v={v} onCR={a.onCR} onAnnuler={a.onAnnuler} onDoc={a.onDoc} onFiche={a.onFiche} /> : null;
                    })}
                  </div>
                </div>
              )}
              {avenir.length > 0 && (
                <div className={x.sousBloc}>
                  <h4>Les prochaines visites</h4>
                  <div className={x.grille}>
                    {avenir.map((v, i) => {
                      const a = actVisite(v.cle);
                      return a ? <CarteVisiteB key={v.cle} v={v} prochaine={i === 0} onCR={a.onCR} onAnnuler={a.onAnnuler} onDoc={a.onDoc} onFiche={a.onFiche} /> : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          </Depliant>
        </section>
      )}

      {/* ── Les offres (V3.45) : une carte par acquéreur, toute la largeur ;
          d'abord celle de la vente (compromis, vendu), puis celles en cours.
          Chacune se replie sur une ligne. ── */}
      {(vente.length > 0 || aFaireO.length > 0) && (
        <section className={x.bloc}>
          <Rubrique titre={vente.length && !aFaireO.length ? 'La vente' : vente.length ? 'La vente et les offres' : aFaireO.length > 1 ? 'Les offres en cours' : 'L’offre en cours'}
            n={vente.length + aFaireO.length} ouvert={ouvert('offres')} onClick={() => basculer('offres')}
            resume={[enCours.length ? `${enCours.length} en attente de réponse` : '', meilleure ? `la meilleure : ${euros(meilleure)}` : '', accepteeSansCompromis.length ? 'une offre acceptée' : '', vente.length ? (vente.some(o => actions.get(o.id)?.compromis?.venduLe) ? 'vendu' : 'sous compromis') : ''].filter(Boolean).join(' · ')} />
          <Depliant ouvert={ouvert('offres')} ecart={10}>
            <div className={x.offres}>
              {[...vente, ...aFaireO].map(o => (
                <CarteOffreB key={o.id} o={o} prix={prix} a={actions.get(o.id)!} replie={offresRepliees.includes(o.id)} onPli={() => plierOffre(o.id)} />
              ))}
            </div>
          </Depliant>
        </section>
      )}

      {/* ── L'historique, en frise ── */}
      {evts.length > 0 && (
        <section className={x.bloc}>
          <div className={x.histoT}>
            <Rubrique titre="L’historique" n={evts.length} ouvert={ouvert('histo')} onClick={() => basculer('histo')}
              resume={[evts.filter(e => e.genre === 'visite').length ? `${evts.filter(e => e.genre === 'visite').length} visite${evts.filter(e => e.genre === 'visite').length > 1 ? 's' : ''}` : '', evts.filter(e => e.genre === 'offre').length ? `${evts.filter(e => e.genre === 'offre').length} offre${evts.filter(e => e.genre === 'offre').length > 1 ? 's' : ''} close${evts.filter(e => e.genre === 'offre').length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')} />
            {ouvert('histo') && (
              <div className={x.seg} role="group" aria-label="Que montrer">
                <button type="button" aria-pressed={filtre === 'tout'} onClick={() => setFiltre('tout')}>Tout<i>{evts.length}</i></button>
                <button type="button" aria-pressed={filtre === 'visite'} onClick={() => setFiltre('visite')}>Visites<i>{evts.filter(e => e.genre === 'visite').length}</i></button>
                <button type="button" aria-pressed={filtre === 'offre'} onClick={() => setFiltre('offre')}>Offres<i>{evts.filter(e => e.genre === 'offre').length}</i></button>
              </div>
            )}
          </div>
          <Depliant ouvert={ouvert('histo')} ecart={10}>
            {montres.length === 0 ? <p className={x.vide}>{filtre === 'visite' ? 'Aucune visite passée pour l’instant.' : 'Aucune offre passée pour l’instant.'}</p> : (
              <ol className={x.frise}>
                {montres.map(e => (e.v ? <LigneVisite key={e.cle} v={e.v} a={actVisite(e.v.cle)} /> : e.o ? <LigneOffre key={e.cle} o={e.o} prix={prix} a={actions.get(e.o.id)!} /> : null))}
              </ol>
            )}
          </Depliant>
        </section>
      )}
    </div>
  );
}

/* Une visite passée, dans la frise. */
function LigneVisite({ v, a }: { v: VisiteCarte; a: ActionsVisite | null }) {
  const iss = v.issue ? ISSUES[v.issue] : null;
  const annulee = v.statut === 'annulee';
  return (
    <li className={x.ligne} data-genre="visite" data-annulee={annulee ? 'oui' : 'non'}>
      <Jour iso={v.ymd} />
      <span className={x.point}><Ic n={annulee ? 'croix' : 'cle'} t={14} /></span>
      <div className={x.carte}>
        <div className={x.carteT}>
          <b>{annulee ? `Visite annulée · ${v.qui}` : `Visite de ${v.qui}`}</b>
          {v.heure && !annulee && <span className={x.heure}>{v.heure.slice(0, 5).replace(':', ' h ')}</span>}
          {iss && <span className={x.puce} style={{ background: iss.fond, color: iss.couleur }}>{iss.crm}</span>}
          {!!v.etoiles && <span className={x.etoiles} aria-label={`${v.etoiles} étoiles sur 5`}>{'★'.repeat(v.etoiles)}{'☆'.repeat(Math.max(0, 5 - v.etoiles))}</span>}
          <span className={x.source}>{v.source === 'crm' ? 'Acheteur suivi' : 'Hors CRM'}</span>
        </div>
        {v.commentaire && <p className={x.citation}>{`« ${v.commentaire} »`}</p>}
        {a && !annulee && (
          <div className={x.acts}>
            {v.issue === 'offre' && a.onOffre && <button type="button" className={x.actOr} onClick={a.onOffre}><Ic n="euro" t={13} />Enregistrer son offre</button>}
            <button type="button" onClick={a.onCR}>Le compte rendu</button>
            <button type="button" onClick={a.onDoc}><Ic n="plume" t={13} />Bon de visite</button>
            {a.onFiche && <button type="button" onClick={a.onFiche}><Ic n="personne" t={13} />Sa fiche</button>}
          </div>
        )}
      </div>
    </li>
  );
}

/* Une offre close (refusée, retirée, ou acceptée et suivie du compromis). */
function LigneOffre({ o, prix, a }: { o: SuiviVente; prix: number | null; a: ActionsOffre }) {
  const d = (o.donnees || {}) as Record<string, unknown>;
  const st = o.statut || 'en_attente';
  /* V3.47 : l'offre d'un compromis tombé (compromisTombe). */
  const p = st === 'retiree' && d.compromisTombe ? { ...PUCE_OFFRE.retiree, l: 'Compromis tombé' } : PUCE_OFFRE[st] || PUCE_OFFRE.en_attente;
  const actuel = montantActuel(o);
  const ecart = actuel && prix ? ((actuel - prix) / prix) * 100 : null;
  const fin = d.financement === 'comptant' ? 'comptant' : d.financement === 'relais' ? 'prêt relais' : d.financement === 'pret' ? 'avec un prêt' : '';
  const reponse = typeof d.reponse_le === 'string' && d.reponse_le ? dateAn(d.reponse_le) : '';
  const ech = echangesDe(o);
  const negociation = ech.length > 1 ? `${ech.length - 1} contre-proposition${ech.length > 2 ? 's' : ''} (${ech.map(e => euros(e.montant)).join(' → ')})` : '';
  return (
    <li className={x.ligne} data-genre="offre" data-statut={st}>
      <Jour iso={o.le} />
      <span className={x.point}><Ic n={st === 'acceptee' ? 'check' : 'euro'} t={14} /></span>
      <div className={x.carte}>
        <div className={x.carteT}>
          <b>{`Offre de ${euros(actuel)}`}</b>
          <span className={x.puce} style={{ background: p.fond, color: p.c }}>{p.l}</span>
          {ecart !== null && <span className={x.ecart}>{Math.abs(ecart) < 0.05 ? 'au prix' : ecart < 0 ? `${pct(ecart).replace('-', '−')} du prix` : `+${pct(ecart)}`}</span>}
        </div>
        <p className={x.qui}>{[o.qui || 'Un acquéreur', fin, typeof d.conditions === 'string' ? d.conditions : '', `reçue le ${dateAn(o.le)}`, reponse && st !== 'en_attente' ? `réponse le ${reponse}` : ''].filter(Boolean).join(' · ')}</p>
        {negociation && <p className={x.qui}>{negociation}</p>}
        {o.commentaire && <p className={x.citation}>{o.commentaire}</p>}
        {(a.doc || a.onPiece || st !== 'acceptee') && (
          <div className={x.acts}>
            {a.doc && <button type="button" onClick={a.doc.onOuvrir}><Ic n="plume" t={13} />{a.doc.etat === 'signe' ? 'L’offre signée' : 'L’offre écrite'}</button>}
            {a.onPiece && <button type="button" onClick={a.onPiece}><Ic n="trombone" t={13} />L’offre signée jointe</button>}
            {st !== 'acceptee' && a.onReponse && <button type="button" onClick={() => a.onReponse?.({ k: 'rouvrir' })}>Remettre en cours</button>}
          </div>
        )}
      </div>
    </li>
  );
}
