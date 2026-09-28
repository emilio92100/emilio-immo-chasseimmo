'use client';
import { Fragment } from 'react';
import s from './FriseSuivi.module.css';

/* ═══ Le suivi du dossier, en frise ═══════════════════════════════════════
   Avant : une liste de lignes grises, la même petite icône « 📝 » pour un
   appel, une note ou un rendez-vous, et un trait de 1 px qu'on ne voyait
   pas. Il fallait lire chaque ligne pour savoir ce qui s'était passé.

   Maintenant, un trait qui descend du futur vers le passé :
     · en haut, « À venir » : les relances en attente, la plus lointaine en
       premier, celle en retard (en rouge) juste au-dessus d'« Aujourd'hui » ;
     · puis l'histoire, mois par mois. Ce qu'Alexandre a fait lui-même
       (appel, rendez-vous, note, message du client, envoi, mandat) est une
       carte, avec l'icône de sa couleur ; ce que le CRM a noté tout seul
       (statut, bien ajouté, dossier créé…) une ligne discrète, pour que le
       travail se voie avant le bruit.
   Un appel noté avec un des raccourcis de « Ajouter une action » (a répondu,
   messagerie, pas de réponse) porte sa pastille : on voit d'un coup d'œil
   qui a décroché. Les données restent préparées dans FicheClient. */

export type LigneSuivi = { kind: 'comm' | 'event'; ts: string; data: any };
export type RelanceAVenir = { id: string; date_echeance: string; note: string | null; recherche_id?: string | null };

/* ── Les issues d'un appel : un clic dans la fenêtre « Ajouter une action »
   écrit le titre, la frise le relit pour poser la pastille. ── */
export const ISSUES_APPEL = [
  { k: 'repondu', lib: 'A répondu', titre: 'Appel — a répondu', c: '#15803d', bg: '#ecfdf3', bord: '#bbf0cf' },
  { k: 'messagerie', lib: 'Messagerie', titre: 'Appel — messagerie', c: '#8a6a1f', bg: '#fdf6e3', bord: '#efdcae' },
  { k: 'sans', lib: 'Pas de réponse', titre: 'Appel — pas de réponse', c: '#b4531f', bg: '#fff3eb', bord: '#f8d3bb' },
  { k: 'recu', lib: 'Appel reçu', titre: 'Appel reçu', c: '#2d5c8f', bg: '#eaf2fb', bord: '#c9dcf1' },
] as const;
export const issueAppel = (titre?: string | null) => ISSUES_APPEL.find(x => x.titre === (titre || '').trim()) || null;

/* ── Les familles, leur couleur et leur icône ── */
type Famille = { ic: string; c: string; bg: string; carte: boolean };
const FAMILLES: Record<string, Famille> = {
  appel:    { ic: 'tel',      c: '#2d5c8f', bg: '#e9f1fb', carte: true },
  rdv:      { ic: 'gens',     c: '#a07c28', bg: '#fbf4e2', carte: true },
  note:     { ic: 'note',     c: '#475569', bg: '#eef2f7', carte: true },
  message:  { ic: 'bulle',    c: '#6d4fa3', bg: '#f2edfa', carte: true },
  comm:     { ic: 'mail',     c: '#0f766e', bg: '#e5f4f1', carte: true },
  mandat:   { ic: 'mandat',   c: '#2e4166', bg: '#e8eef8', carte: true },
  visite:   { ic: 'calendrier', c: '#15803d', bg: '#eaf7ef', carte: false },
  affaire:  { ic: 'euro',     c: '#a07c28', bg: '#fbf4e2', carte: false },
  systeme:  { ic: 'point',    c: '#94a3b8', bg: '#f1f4f8', carte: false },
};
const ICONE_SYSTEME: Record<string, string> = {
  statut_change: 'tourne', bien_ajoute: 'maison', bien_modifie: 'maison', bien_supprime: 'corbeille',
  creation: 'etincelle', recherche_creee: 'etincelle', recherche_renommee: 'crayon', recherche_reinitialisee: 'tourne',
  recherche_supprimee: 'corbeille', retour_etape: 'retour', relance_manuelle: 'cloche', contact: 'crayon',
};
function familleDe(it: LigneSuivi): string {
  if (it.kind === 'comm') return it.data?.type === 'compte_rendu_visite' ? 'visite' : 'comm';
  const t = it.data?.type as string;
  if (t === 'appel') return 'appel';
  if (t === 'rdv' || t === 'rdv_planifie') return 'rdv';
  if (t === 'note') return 'note';
  if (t === 'message_client' || t === 'demande_rappel' || t === 'point_auto_reponse') return 'message';
  if (t === 'email_libre' || t === 'envoi_externe' || t === 'mail_envoye' || t === 'envoi_bien') return 'comm';
  if (t === 'mandat') return 'mandat';
  if (t === 'visite_planifiee' || t === 'visite_effectuee') return 'visite';
  if (t === 'offre_ecrite' || t === 'offre_faite' || t === 'etape_transaction' || t === 'dossier_finalise') return 'affaire';
  return 'systeme';
}

/* ── Les filtres : même ordre et mêmes groupes qu'avant (FicheClient) ── */
export const FILTRES_SUIVI: { id: string; lib: string; fam?: string }[] = [
  { id: 'tout', lib: 'Tout' },
  { id: 'appel', lib: 'Appels', fam: 'appel' },
  { id: 'rdv', lib: 'RDV', fam: 'rdv' },
  { id: 'note', lib: 'Notes', fam: 'note' },
  { id: 'message', lib: 'Messages & rappels', fam: 'message' },
  { id: 'communications', lib: 'Communications', fam: 'comm' },
  { id: 'mandat', lib: 'Mandat', fam: 'mandat' },
  { id: 'systeme', lib: 'Système', fam: 'systeme' },
];

/* ── Les icônes, dessinées (pas d'émoji : ils ne rendent pas pareil d'un
   téléphone à l'autre). ── */
const TRAITS: Record<string, string[]> = {
  tel: ['M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z'],
  gens: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'c:9,7,4', 'M22 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
  note: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
  bulle: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'm22 7-9 5.7a2 2 0 0 1-2 0L2 7'],
  mandat: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'm9 15 2 2 4-4'],
  calendrier: ['M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  euro: ['M4 10h12', 'M4 14h9', 'M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2'],
  cloche: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.9 1.9 0 0 0 3.4 0'],
  maison: ['M3 10.5 12 4l9 6.5', 'M5 9.5V20h14V9.5', 'M10 20v-5h4v5'],
  tourne: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
  etincelle: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z'],
  crayon: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  corbeille: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  retour: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  loupe: ['c:11,11,7', 'm21 21-4.3-4.3'],
  bas: ['m6 9 6 6 6-6'],
  point: ['c:12,12,3'],
};
export function IcSuivi({ n, t = 16, e = 2 }: { n: string; t?: number; e?: number }) {
  const tr = TRAITS[n] || TRAITS.point;
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={e} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      {tr.map((d, i) => {
        if (d.startsWith('c:')) { const [cx, cy, r] = d.slice(2).split(','); return <circle key={i} cx={cx} cy={cy} r={r} />; }
        return <path key={i} d={d} />;
      })}
    </svg>
  );
}

/* ── Les dates ── */
const midi = (iso: string) => { const d = new Date(iso); d.setHours(12, 0, 0, 0); return d; };
function joursJusquA(iso: string) {
  const a = new Date(); a.setHours(12, 0, 0, 0);
  return Math.round((midi(iso).getTime() - a.getTime()) / 86400000);
}
function quand(iso: string) {
  const d = new Date(iso);
  const autreAnnee = d.getFullYear() !== new Date().getFullYear();
  const jour = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', ...(autreAnnee ? { year: 'numeric' } : {}) });
  return `${jour} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}
const jourCourt = (iso: string) => midi(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const delai = (j: number) => (j < 0 ? `en retard de ${-j} j` : j === 0 ? 'aujourd’hui' : j === 1 ? 'demain' : `dans ${j} j`);
const moisDe = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

/* Retrouver l'action d'où vient une relance, et la faire briller. */
function montrer(id: string) {
  const el = document.getElementById(`suivi-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('suivi-surligne'); void el.offsetWidth; el.classList.add('suivi-surligne');
}

type Props = {
  items: LigneSuivi[];
  filtre: string;
  comptes: Record<string, number>;
  onFiltre: (id: string) => void;
  /* Le bouton « + d'une autre recherche », s'il y a lieu (il vit dans FicheClient). */
  enPlus?: React.ReactNode;
  aVenir: RelanceAVenir[];
  relancesAtt: RelanceAVenir[];
  biens: any[];
  nomAutreRecherche: (j: any) => string | null;
  surligne: string | null;
  modifiable: (j: any) => boolean;
  onModifier: (j: any) => void;
  onSupprimer: (j: any) => void;
  onAjouter: () => void;
  onAppel: () => void;
  /* La fiche d'un contact qui n'est pas acheteur (V3.23) : « Historique »,
     et seulement les filtres qui ont un sens pour lui. */
  titre?: string;
  filtresVisibles?: string[];
};

export default function FriseSuivi({ items, filtre, comptes, onFiltre, enPlus, aVenir, relancesAtt, biens, nomAutreRecherche, surligne, modifiable, onModifier, onSupprimer, onAjouter, onAppel, titre: titreFrise = 'Historique du dossier', filtresVisibles }: Props) {
  /* L'action d'où vient chaque relance : pour « Voir l'action ». */
  const actionDe = new Map<string, string>();
  for (const it of items) { const rid = it.kind === 'event' ? it.data?.metadata?.relance_id : null; if (rid) actionDe.set(rid, it.data.id); }
  const futur = filtre === 'tout' ? [...aVenir].sort((a, b) => new Date(b.date_echeance).getTime() - new Date(a.date_echeance).getTime()) : [];

  /* Mois par mois : un repère sur le trait à chaque changement. */
  let moisCourant = '';

  return (
    <div className={s.frise}>
      <div className={s.tete}>
        <div className={s.teteTitre}>
          <b>{titreFrise}</b>
          <span>{`${comptes.tout || 0} élément${(comptes.tout || 0) > 1 ? 's' : ''}`}</span>
        </div>
        <div className={s.teteBoutons}>
          <button type="button" className={s.btnAppel} onClick={onAppel}><IcSuivi n="tel" t={15} />Noter un appel</button>
          <button type="button" className={s.btnAjout} onClick={onAjouter}>+ Ajouter une action</button>
        </div>
      </div>

      <div className={s.filtres}>
        {FILTRES_SUIVI.filter(f => !filtresVisibles || filtresVisibles.includes(f.id)).map(f => {
          const n = comptes[f.id] || 0;
          const fam = f.fam ? FAMILLES[f.fam] : null;
          return (
            <button key={f.id} type="button" className={s.filtre} data-on={filtre === f.id ? 'oui' : 'non'} data-vide={n ? 'non' : 'oui'} onClick={() => onFiltre(f.id)}>
              {fam && <i style={{ background: fam.c }} />}
              {f.lib}
              {n > 0 && <b>{n}</b>}
            </button>
          );
        })}
        {enPlus}
      </div>

      {items.length === 0 && futur.length === 0 ? (
        <div className={s.vide}>
          <span className={s.videIc}><IcSuivi n="note" t={22} e={1.8} /></span>
          <b>Rien à afficher</b>
          {filtre !== 'tout' && <span>{`Aucun élément dans « ${FILTRES_SUIVI.find(f => f.id === filtre)?.lib || filtre} ». « Tout » montre l’historique complet.`}</span>}
        </div>
      ) : (
        <ol className={s.liste}>
          {futur.length > 0 && (
            <li className={s.repere} data-sorte="avenir"><span className={s.repereRond} /><span className={s.repereTexte}>À venir</span></li>
          )}
          {futur.map(r => {
            const j = joursJusquA(r.date_echeance);
            const retard = j < 0;
            const action = actionDe.get(r.id);
            return (
              <li key={`r-${r.id}`} className={s.ligne} data-sorte="avenir">
                <span className={s.noeud} data-bord="oui" style={{ color: retard ? '#be123c' : '#a07c28', background: retard ? '#fff1f2' : '#fdf6e3', borderColor: retard ? '#fbd0d6' : '#efdcae' }}><IcSuivi n="cloche" t={16} /></span>
                <div className={`${s.carte} ${s.carteRelance}`} data-retard={retard ? 'oui' : 'non'}>
                  <div className={s.carteTete}>
                    <span className={s.titre}>{`Relance · ${jourCourt(r.date_echeance)}`}</span>
                    <span className={s.pastille} style={retard ? { color: '#be123c', background: '#fff1f2', borderColor: '#fbd0d6' } : { color: '#8a6a1f', background: '#fff', borderColor: '#efdcae' }}>{delai(j)}</span>
                    {action && <button type="button" className={s.voir} onClick={() => montrer(action)}>Voir l’action<IcSuivi n="bas" t={13} e={2.4} /></button>}
                    <span className={s.actions} aria-hidden="true" data-vide="oui" />
                  </div>
                  {r.note && <p className={s.texte}>{r.note}</p>}
                </div>
              </li>
            );
          })}
          {futur.length > 0 && items.length > 0 && (
            <li className={s.repere} data-sorte="aujourdhui"><span className={s.repereRond} /><span className={s.repereTexte}>Aujourd’hui</span></li>
          )}

          {items.map(it => {
            const m = moisDe(it.ts);
            const nouveauMois = m !== moisCourant;
            moisCourant = m;
            const famK = familleDe(it);
            const fam = FAMILLES[famK];
            const cle = it.kind === 'comm' ? `c-${it.data.id}` : `e-${it.data.id}`;
            const mois = nouveauMois ? (
              <li key={`m-${cle}`} className={s.repere}><span className={s.repereRond} /><span className={s.repereTexte}>{m}</span></li>
            ) : null;

            /* ── Un envoi (sélection de biens, compte rendu de visite…) ── */
            if (it.kind === 'comm') {
              const e = it.data;
              const cr = e.type === 'compte_rendu_visite';
              const parts: string[] = cr && e.corps ? String(e.corps).split(' | ') : [];
              return (<Fragment key={cle}>{mois}
                <li key={cle} className={s.ligne}>
                  <span className={s.noeud} style={{ color: fam.c, background: fam.bg }}><IcSuivi n={cr ? 'calendrier' : 'mail'} t={16} /></span>
                  <div className={s.carte}>
                    <div className={s.carteTete}>
                      <span className={s.titre}>{e.objet || (cr ? 'Compte rendu de visite' : 'Envoi')}</span>
                      <span className={s.heure}>{quand(e.created_at)}</span>
                      <span className={s.actions} aria-hidden="true" data-vide="oui" />
                    </div>
                    {cr && parts.length > 0 && <p className={s.texte} style={{ color: '#15803d', fontWeight: 700 }}>{parts.slice(0, 2).join(' · ')}</p>}
                    {cr && parts.length > 2 && <p className={`${s.texte} ${s.citation}`} style={{ borderColor: '#86d6a8', background: '#f3fbf6' }}>{parts[2]}</p>}
                    {!cr && e.destinataires?.length > 0 && <p className={s.sous}>{`À ${e.destinataires.join(', ')}`}</p>}
                  </div>
                </li>
              </Fragment>);
            }

            /* ── Une ligne du journal ── */
            const j = it.data;
            const autre = nomAutreRecherche(j);
            const issue = j.type === 'appel' ? issueAppel(j.titre) : null;
            const titre = issue && issue.k !== 'recu' ? 'Appel' : j.titre;
            const rid = j.metadata?.relance_id as string | undefined;
            const rel = rid ? relancesAtt.find(x => x.id === rid) : null;
            const b = j.bien_id ? biens.find(x => x.id === j.bien_id) : null;
            const actions = modifiable(j) ? (
              <span className={s.actions}>
                <button type="button" onClick={() => onModifier(j)} title="Modifier" aria-label="Modifier cette ligne"><IcSuivi n="crayon" t={14} /></button>
                <button type="button" onClick={() => onSupprimer(j)} title="Supprimer" aria-label="Supprimer cette ligne" data-rouge="oui"><IcSuivi n="corbeille" t={14} /></button>
              </span>
            ) : null;
            /* Une carte sans crayon garde la même place à droite : les heures
               restent alignées d'une carte à l'autre. */
            const place = actions || <span className={s.actions} aria-hidden="true" data-vide="oui" />;
            /* « Bien ajouté : Duplex… » nomme déjà le bien : pas d'étiquette en plus. */
            const bienVu = b && !(famK === 'systeme');
            const etiquettes = (autre || rel || bienVu) ? (
              <div className={s.etiquettes}>
                {bienVu && <span className={s.etBien}><IcSuivi n="maison" t={13} />{b.titre || `${b.type_bien || 'Bien'} — ${b.ville || ''}`}</span>}
                {rel && (() => {
                  const n = joursJusquA(rel.date_echeance);
                  return <span className={s.etRelance} data-retard={n < 0 ? 'oui' : 'non'}><IcSuivi n="cloche" t={13} />{`Relance le ${midi(rel.date_echeance).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · ${delai(n)}`}</span>;
                })()}
                {autre && <span className={s.etAutre}><IcSuivi n="loupe" t={12} />{autre}</span>}
              </div>
            ) : null;

            if (!fam.carte) {
              /* Ce que le CRM a noté tout seul : une ligne, pas une carte. */
              const ic = famK === 'systeme' ? (ICONE_SYSTEME[j.type] || 'point') : fam.ic;
              return (<Fragment key={cle}>{mois}
                <li key={cle} id={`suivi-${j.id}`} className={`${s.ligne} ${s.discrete} suivi-ligne${surligne === j.id ? ' suivi-surligne' : ''}`} data-famille={famK}>
                  <span className={s.noeudPetit} style={{ color: fam.c, background: fam.bg }}><IcSuivi n={ic} t={12} e={2.2} /></span>
                  <div className={s.discreteCorps}>
                    <div className={s.discreteTete}>
                      <span className={s.discreteTitre}>{j.titre}</span>
                      <span className={s.heure}>{quand(j.created_at)}</span>
                      {actions}
                    </div>
                    {j.description && <p className={s.discreteTexte}>{j.description}</p>}
                    {etiquettes}
                  </div>
                </li>
              </Fragment>);
            }

            return (<Fragment key={cle}>{mois}
              <li key={cle} id={`suivi-${j.id}`} className={`${s.ligne} suivi-ligne${surligne === j.id ? ' suivi-surligne' : ''}`} data-famille={famK}>
                <span className={s.noeud} style={{ color: fam.c, background: fam.bg }}><IcSuivi n={fam.ic} t={16} /></span>
                <div className={s.carte}>
                  <div className={s.carteTete}>
                    <span className={s.titre}>{titre}</span>
                    {issue && issue.k !== 'recu' && <span className={s.pastille} style={{ color: issue.c, background: issue.bg, borderColor: issue.bord }}>{issue.lib}</span>}
                    <span className={s.heure}>{quand(j.created_at)}</span>
                    {place}
                  </div>
                  {j.description && <p className={`${s.texte} ${famK === 'message' ? s.citation : ''}`}>{j.description}</p>}
                  {etiquettes}
                </div>
              </li>
            </Fragment>);
          })}
        </ol>
      )}
    </div>
  );
}
