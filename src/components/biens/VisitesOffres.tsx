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
   CarteOffreB, dans OngletsBien.tsx) ; la frise est ici. */
import { useState, type ReactNode } from 'react';
import { euros } from '@/lib/mandat';
import { ISSUES } from '@/lib/visites';
import type { SuiviVente } from '@/lib/biens-vente';
import { Ic } from '@/components/documents/ApercuActe';
import { CarteOffreB, CarteVisiteB, type VisiteCarte } from './OngletsBien';
import x from './VisitesOffres.module.css';

const NBSP = ' ';
const jourMidi = (iso: string) => new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
const pct = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')}${NBSP}%`;
const ouverte = (o: SuiviVente) => !o.statut || o.statut === 'en_attente' || o.statut === 'contre';

export type ActionsVisite = { onCR: () => void; onAnnuler: () => void; onDoc: () => void; onFiche?: () => void; onOffre?: () => void };
export type ActionsOffre = { onStatut: (st: string) => void; onContre: () => void; onDoc: () => void; onPiece?: () => void };

const PUCE_OFFRE: Record<string, { l: string; fond: string; c: string }> = {
  en_attente: { l: 'En attente de réponse', fond: '#fbf6e9', c: '#7a5d1c' },
  contre: { l: 'Contre-offre', fond: '#eff6ff', c: '#1d4ed8' },
  acceptee: { l: 'Acceptée', fond: '#dcfce7', c: '#15803d' },
  refusee: { l: 'Refusée', fond: '#f1f5f9', c: '#475569' },
  retiree: { l: 'Retirée', fond: '#f1f5f9', c: '#475569' },
};

/* La date, en pavé : le jour, le mois. */
function Jour({ iso }: { iso: string }) {
  const d = jourMidi(iso);
  const ok = !isNaN(d.getTime());
  return (
    <span className={x.jour} aria-hidden="true">
      <b>{ok ? d.getDate() : '?'}</b>
      <small>{ok ? d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') : ''}</small>
    </span>
  );
}

type Evt = { cle: string; tri: string; genre: 'visite' | 'offre'; v?: VisiteCarte; o?: SuiviVente };

export function OngletVisitesOffres({ visites, offres, prix, compromis, onVisite, onOffre, actVisite, actOffre, encart }: {
  visites: VisiteCarte[]; offres: SuiviVente[]; prix: number | null; compromis: boolean;
  onVisite: () => void; onOffre: () => void;
  actVisite: (cle: string) => ActionsVisite | null; actOffre: (o: SuiviVente) => ActionsOffre;
  /* Un mot d'étape (« plus aucune offre en cours », « une offre est acceptée ») */
  encart?: ReactNode;
}) {
  const [filtre, setFiltre] = useState<'tout' | 'visite' | 'offre'>('tout');
  const annulee = (v: VisiteCarte) => v.statut === 'annulee';
  const crAFaire = (v: VisiteCarte) => v.passee && !annulee(v) && !v.issue && v.statut !== 'faite';
  const faites = visites.filter(v => v.passee && !annulee(v));
  const avenir = visites.filter(v => !v.passee && !annulee(v)).sort((p, q) => `${p.ymd}${p.heure}`.localeCompare(`${q.ymd}${q.heure}`));
  const aFaireV = visites.filter(crAFaire);
  const enCours = offres.filter(ouverte);
  const accepteeSansCompromis = compromis ? [] : offres.filter(o => o.statut === 'acceptee');
  const aFaireO = [...enCours, ...accepteeSansCompromis];
  const meilleure = enCours.reduce((m, o) => Math.max(m, o.montant || 0), 0);

  /* L'historique : ce qui n'est plus « à faire » ni « à venir ». */
  const dejaHaut = new Set([...aFaireV.map(v => v.cle), ...avenir.map(v => v.cle), ...aFaireO.map(o => 'o-' + o.id)]);
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
          <div className={x.gestes}>
            <button type="button" className={x.gesteVisite} onClick={onVisite}><Ic n="calendrier" t={17} />Organiser une visite</button>
            <button type="button" className={x.gesteOffre} onClick={onOffre}><Ic n="euro" t={17} />Enregistrer une offre</button>
          </div>
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

      {(aFaireV.length > 0 || aFaireO.length > 0 || avenir.length > 0) && (
      <div className={x.enCours} data-deux={(aFaireV.length > 0 || aFaireO.length > 0) && avenir.length > 0 ? 'oui' : 'non'}>
      {/* ── À faire ── */}
      {(aFaireV.length > 0 || aFaireO.length > 0) && (
        <section className={x.bloc}>
          <div className={x.blocT}><h3>À faire</h3><i>{aFaireV.length + aFaireO.length}</i></div>
          <div className={x.grille}>
            {aFaireO.map(o => {
              const a = actOffre(o);
              return <CarteOffreB key={o.id} o={o} prix={prix} compromis={compromis} onStatut={a.onStatut} onContre={a.onContre} onDoc={a.onDoc} onPiece={a.onPiece} />;
            })}
            {aFaireV.map(v => {
              const a = actVisite(v.cle);
              return a ? <CarteVisiteB key={v.cle} v={v} onCR={a.onCR} onAnnuler={a.onAnnuler} onDoc={a.onDoc} onFiche={a.onFiche} /> : null;
            })}
          </div>
        </section>
      )}

      {/* ── Les prochaines visites ── */}
      {avenir.length > 0 && (
        <section className={x.bloc}>
          <div className={x.blocT}><h3>Les prochaines visites</h3><i>{avenir.length}</i></div>
          <div className={x.grille}>
            {avenir.map((v, i) => {
              const a = actVisite(v.cle);
              return a ? <CarteVisiteB key={v.cle} v={v} prochaine={i === 0} onCR={a.onCR} onAnnuler={a.onAnnuler} onDoc={a.onDoc} onFiche={a.onFiche} /> : null;
            })}
          </div>
        </section>
      )}
      </div>
      )}

      {/* ── L'historique, en frise ── */}
      {evts.length > 0 && (
        <section className={x.bloc}>
          <div className={x.blocT}>
            <h3>L’historique</h3>
            <div className={x.seg} role="group" aria-label="Que montrer">
              <button type="button" aria-pressed={filtre === 'tout'} onClick={() => setFiltre('tout')}>Tout<i>{evts.length}</i></button>
              <button type="button" aria-pressed={filtre === 'visite'} onClick={() => setFiltre('visite')}>Visites<i>{evts.filter(e => e.genre === 'visite').length}</i></button>
              <button type="button" aria-pressed={filtre === 'offre'} onClick={() => setFiltre('offre')}>Offres<i>{evts.filter(e => e.genre === 'offre').length}</i></button>
            </div>
          </div>
          {montres.length === 0 ? <p className={x.vide}>{filtre === 'visite' ? 'Aucune visite passée pour l’instant.' : 'Aucune offre passée pour l’instant.'}</p> : (
            <ol className={x.frise}>
              {montres.map(e => (e.v ? <LigneVisite key={e.cle} v={e.v} a={actVisite(e.v.cle)} /> : e.o ? <LigneOffre key={e.cle} o={e.o} prix={prix} a={actOffre(e.o)} /> : null))}
            </ol>
          )}
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
  const p = PUCE_OFFRE[st] || PUCE_OFFRE.en_attente;
  const ecart = o.montant && prix ? ((o.montant - prix) / prix) * 100 : null;
  const fin = d.financement === 'comptant' ? 'comptant' : d.financement === 'relais' ? 'prêt relais' : d.financement === 'pret' ? 'avec un prêt' : '';
  return (
    <li className={x.ligne} data-genre="offre" data-statut={st}>
      <Jour iso={o.le} />
      <span className={x.point}><Ic n={st === 'acceptee' ? 'check' : 'euro'} t={14} /></span>
      <div className={x.carte}>
        <div className={x.carteT}>
          <b>{`Offre de ${euros(o.montant || 0)}`}</b>
          <span className={x.puce} style={{ background: p.fond, color: p.c }}>{st === 'contre' && typeof d.contre === 'number' ? `Contre-offre à ${euros(d.contre)}` : p.l}</span>
          {ecart !== null && <span className={x.ecart}>{Math.abs(ecart) < 0.05 ? 'au prix' : ecart < 0 ? `${pct(ecart).replace('-', '−')} du prix` : `+${pct(ecart)}`}</span>}
        </div>
        <p className={x.qui}>{[o.qui || 'Un acquéreur', fin, typeof d.conditions === 'string' ? d.conditions : ''].filter(Boolean).join(' · ')}</p>
        {o.commentaire && <p className={x.citation}>{o.commentaire}</p>}
        <div className={x.acts}>
          <button type="button" onClick={a.onDoc}><Ic n="plume" t={13} />L’offre écrite</button>
          {a.onPiece && <button type="button" onClick={a.onPiece}><Ic n="trombone" t={13} />L’offre signée</button>}
          {st !== 'acceptee' && <button type="button" onClick={() => a.onStatut('en_attente')}>Remettre en attente</button>}
        </div>
      </div>
    </li>
  );
}
