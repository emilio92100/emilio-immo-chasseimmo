'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ic } from '@/components/documents/ApercuActe';
import d from '@/components/documents/Documents.module.css';
import st from './ImportImmoFacile.module.css';
import { partieAleatoire } from '@/lib/jeton';
import { typesDe } from '@/lib/contacts';
import {
  aujourdhuiYmd, chercherDoublon, CHOIX_VIDE, completer, dateFr, demandeLecture, indexerCRM, libelleOrigine, lireFichier, lireLecture, planifier, regrouper,
  type Choix, type ClientCRM, type Completion, type Contact, type DemandeLecture, type Doublon, type EtatLecture, type FichierLu, type Lecture, type Plan,
} from '@/lib/import-immofacile';
import { completerFiche, importerNouveau, lireCRM, type EtatCRM, type Mode, type Resultat } from './import-ecriture';

/* ═══ « Importer depuis ImmoFacile » (V3.61) ═══════════════════════════════
   Alexandre quitte ImmoFacile : il exporte sa liste de contacts (un ou
   plusieurs .csv) et la dépose ici. Quatre temps, comme la maquette validée :
     1. choisir le fichier ;
     2. l'aperçu : une ligne par contact, ce qui sera créé, de quoi corriger
        (rôles, critères en trop, bien « À suivre », ne pas importer) — rien
        n'est écrit ;
     3. l'écriture, contact par contact ;
     4. c'est fait : le bilan, ce qui a manqué, « Voir les contacts importés ».
   Les colonnes sont lues ici (src/lib/import-immofacile.ts) ; le texte libre
   par Claude, en arrière-plan, par lots (/api/import-immofacile) ;
   l'écriture : ./import-ecriture.ts. */

const PAR_LOT = 6;
const EN_PARALLELE = 3;
/* Un lot qui revient incomplet : les manquants sont relus par deux. */
const PAR_REPRISE = 2;

type Rangee = {
  c: Contact; plan: Plan; choix: Choix; etat: EtatLecture;
  /* Le doublon retenu (null si « ce n'est pas la même personne »), et celui trouvé. */
  doublon: Doublon | null; trouve: Doublon | null;
  /* Créé à part : un homonyme du CRM, choisi par l'import ou par Alexandre. */
  nouveau: boolean;
  completion: Completion | null;
  /* Ce qui mérite un coup d'œil : le plan, plus ce que le CRM a montré. */
  verif: string[];
  /* « Actifs » choisi, et rien à vérifier : un acheteur arrive « Actif ». */
  actif: boolean;
  /* Une fiche bien peut être créée (pas déjà un bien en cours dans le CRM). */
  bienPossible: boolean;
  nom: string; initiales: string;
};

function nomAffiche(c: Contact): string {
  return [c.genre, c.prenom, c.nom].filter(Boolean).join(' ') || c.raisonSociale || 'Sans nom';
}
const nomCRM = (x: ClientCRM) => [x.prenom, x.nom].filter(Boolean).join(' ') || 'Sans nom';

/* Une ligne de l'aperçu : ce qui sera fait pour ce contact. La même pour
   l'aperçu et pour « Réessayer » (relu sur le CRM du moment). */
function rangeeDe(c: Contact, o: { choix: Choix; etat: EtatLecture; lecture: Lecture | null; trouve: Doublon | null; crm: EtatCRM; aujourdhui: string; mode: Mode }): Rangee {
  const plan = planifier(c, o.lecture, o.etat, o.choix, o.aujourdhui);
  const t = o.trouve;
  const nouveau = !!t && (o.choix.nouveau ?? t.conflit);
  const doublon = t && !nouveau ? t : null;
  const nom = nomAffiche(c);
  const completion = doublon ? completer(plan, doublon.client, {
    aRecherche: o.crm.avecRecherche.has(doublon.client.id), aBien: o.crm.avecBien.has(doublon.client.id), typesActuels: typesDe(doublon.client),
    doublon, nomImmo: nom,
  }) : null;
  const verif = doublon ? plan.aVerifier.filter(x => !plan.verifFiche.includes(x)) : [...plan.aVerifier];
  if (t?.conflit && nouveau && o.choix.nouveau === null) verif.push(`Même nom que « ${nomCRM(t.client)} » dans ton CRM, mais d’autres coordonnées : une fiche à part est créée.`);
  if (doublon?.autreNom) verif.push(`Même ${doublon.raison} que « ${nomCRM(doublon.client)} » dans ton CRM, sous un autre nom : sa fiche est complétée, sans y recopier ses coordonnées.`);
  const actif = o.mode === 'actifs' && !plan.force && verif.length === 0;
  const initiales = `${(c.prenom || '')[0] || ''}${(c.nom || '')[0] || ''}`.toUpperCase() || '·';
  const bienPossible = !doublon || !o.crm.avecBien.has(doublon.client.id);
  return { c, plan, choix: o.choix, etat: o.etat, doublon, trouve: t, nouveau, completion, verif, actif, bienPossible, nom, initiales };
}
const extrait = (t: string, n: number) => (t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t);
const pluriel = (n: number, un: string, des: string) => `${n} ${n > 1 ? des : un}`;

/* ── Les petits morceaux, au niveau du module (AGENTS.md §2.4) ── */

function Role({ r, on, onClick }: { r: 'proprietaire' | 'acheteur'; on?: boolean; onClick?: () => void }) {
  const ic = r === 'proprietaire' ? 'maison' : 'cible';
  const lib = r === 'proprietaire' ? 'Propriétaire' : 'Acheteur';
  const cls = `${st.role} ${r === 'proprietaire' ? st.proprio : st.acheteur}`;
  if (onClick) return <button type="button" className={cls} aria-pressed={!!on} onClick={onClick}><Ic n={ic} t={12} />{lib}</button>;
  return <span className={cls}><Ic n={ic} t={12} />{lib}</span>;
}

function Bascule({ on, rouge, onClick, children }: { on: boolean; rouge?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`${st.bascule}${rouge ? ` ${st.basculeRouge}` : ''}`} aria-pressed={on} onClick={onClick}>
      <i aria-hidden="true">{on && <Ic n="check" t={11} e={3} />}</i>
      <span>{children}</span>
    </button>
  );
}

function Fermer({ onClick }: { onClick: () => void }) {
  return <button type="button" className={st.x} aria-label="Fermer" onClick={onClick}><Ic n="croix" t={16} e={2.4} /></button>;
}

/* Les étiquettes sous la recherche d'une ligne. */
function Etiquettes({ r }: { r: Rangee }) {
  const p = r.plan;
  return (
    <>
      {p.tiree && <em className={st.tagOr}><Ic n="bulle" t={11} /><span>Tirée de son commentaire</span></em>}
      {p.aSuivre && <em className={p.aSuivre.retard ? st.tagOr : st.tagBleu}><Ic n="maison" t={11} /><span>{`Fiche bien « À suivre » : ${p.aSuivre.resume} · ${p.aSuivre.rappelTexte}`}</span></em>}
      {!p.aSuivre && p.projetVente && <em className={p.rappel?.retard ? st.tagOr : st.tagBleu}><Ic n="etiquette" t={11} /><span>{`${p.bienActuel.aVendre ? 'Mandat vendeur potentiel' : 'Projet de vente'}${p.rappel ? ` · ${p.rappel.rappelTexte}` : ''}`}</span></em>}
      {p.location && !p.locationSeule && <em className={st.tagBleu}><Ic n="cle" t={11} /><span>Cherche aussi à louer : noté dans « À savoir »</span></em>}
      {r.etat === 'echec' && <em className={st.tagRouge}><Ic n="info" t={11} /><span>Lecture du texte impossible : vérifie</span></em>}
      {r.etat === 'passee' && <em className={st.tagRouge}><Ic n="info" t={11} /><span>Commentaire pas lu : colonnes seulement</span></em>}
      {r.etat === 'attente' && <em className={st.tagBleu}><Ic n="horloge" t={11} /><span>Lecture du commentaire…</span></em>}
      {r.verif.filter(x => !/^Lecture/.test(x)).map(x => <em key={x} className={st.tagRouge}><Ic n="info" t={11} /><span>{x}</span></em>)}
    </>
  );
}

function LigneApercu({ r, ouvert, fermant, edition, mode, aujourdhui, onOuvrir, onEdition, onChoix }: {
  r: Rangee; ouvert: boolean; edition: boolean; mode: Mode; aujourdhui: string;
  /* Elle se replie : le détail reste le temps de l'animation. */
  fermant: boolean;
  onOuvrir: () => void; onEdition: () => void; onChoix: (x: Partial<Choix>) => void;
}) {
  const p = r.plan;
  const rech = p.recherches[0];
  const cls = [st.ligne, r.doublon ? st.doublon : '', r.choix.exclu ? st.exclu : '', p.tiree && !r.doublon && !r.choix.exclu ? st.orange : '', ouvert ? st.ouvert : ''].filter(Boolean).join(' ');
  const origine = r.c.origines.map(libelleOrigine).filter(Boolean)[0] || '';
  return (
    <div className={cls}>
      <button type="button" className={st.ligneTete} onClick={onOuvrir} aria-expanded={ouvert}>
        <span className={st.av}>{r.initiales}</span>
        <span className={st.qui}>
          <b>{r.nom}</b>
          <small>
            {r.c.telephones.length > 0 && <Ic n="telephone" t={12} />}
            {r.c.emails.length > 0 && <Ic n="mail" t={12} />}
            <span>{`ImmoFacile : ${r.c.statuts.join(' et ') || 'sans statut'}${origine ? ` · ${origine}` : ''}`}</span>
          </small>
        </span>
        <span className={st.roles}>
          {r.choix.exclu ? <span className={`${st.role} ${st.gris}`}>Pas importé</span>
            : r.doublon ? <span className={`${st.role} ${st.gris}`}>Pas recréé</span>
              : <>{p.roles.proprietaire && <Role r="proprietaire" />}{p.roles.acheteur && <Role r="acheteur" />}</>}
        </span>
        <span className={st.rech}>
          {r.choix.exclu ? <span className={st.pale}>Laissé de côté : rien ne sera écrit pour lui.</span>
            : r.doublon ? (
              <>
                <span className={st.pale}>{`Déjà dans ton CRM : ${nomCRM(r.doublon.client)} (même ${r.doublon.raison}${r.doublon.conjoint ? ', en personne 2' : ''})`}</span>
                <span className={st.pale}>{r.completion?.rien ? 'Rien à compléter sur sa fiche.' : `On complète : ${r.completion?.lignes.join(', ')}.`}</span>
                {r.verif.map(x => <em key={x} className={st.tagRouge}><Ic n="info" t={11} /><span>{x}</span></em>)}
              </>
            ) : rech ? (
              <>
                <b>{rech.titre}</b>
                <span>{rech.ligne}</span>
                <Etiquettes r={r} />
              </>
            ) : (
              <>
                <span className={st.pale}>Pas de recherche</span>
                <Etiquettes r={r} />
              </>
            )}
        </span>
        <span className={st.chev}><Ic n="bas" t={14} e={2.4} /></span>
      </button>
      {/* V3.62 (« trop brut ») : le détail se déplie et se replie en douceur. */}
      {(ouvert || fermant) && (
        <div className={`${st.deplie}${ouvert ? ` ${st.deplieOuvert}` : ''}`}>
          <div className={st.deplieIn}><Detail r={r} edition={edition} mode={mode} aujourdhui={aujourdhui} onEdition={onEdition} onChoix={onChoix} /></div>
        </div>
      )}
    </div>
  );
}

/* « Dans ImmoFacile » à gauche, « Ce qui sera créé dans ton CRM » à droite. */
function Detail({ r, edition, mode, aujourdhui, onEdition, onChoix }: { r: Rangee; edition: boolean; mode: Mode; aujourdhui: string; onEdition: () => void; onChoix: (x: Partial<Choix>) => void }) {
  const c = r.c, p = r.plan;
  const criteres = c.recherches.map(x => x.resume).filter(Boolean);
  const precisions = c.recherches.map(x => x.precision).filter(Boolean);
  const commentaire = c.commentaires.join('\n');
  const aSavoir = p.aSavoir.split('\n\n').filter(b => !/^Son commentaire dans ImmoFacile|^Précision de sa recherche dans ImmoFacile/.test(b)).join('\n');
  /* Ce qui est recopié tel quel dans « À savoir », en plus des lignes lues. */
  const bruts = [precisions.length ? 'la précision de sa recherche' : '', commentaire ? 'son commentaire' : ''].filter(Boolean).join(' et ');
  const statut = !p.roles.acheteur ? 'Prospect'
    : r.actif ? 'Actif : veille et point automatique'
      : mode !== 'actifs' ? 'Prospect : à qualifier, rien ne part tout seul'
        : c.refus.length ? 'Prospect : refus noté dans ImmoFacile, reste à qualifier' : 'Prospect : à vérifier d’abord, reste à qualifier';
  return (
    <div className={st.detail}>
      <div className={st.col}>
        <div className={st.colT}>Dans ImmoFacile</div>
        <dl>
          <dt>Statut</dt><dd>{c.statuts.join(' et ') || 'Non précisé'}</dd>
          {c.origines.length > 0 && <><dt>Origine</dt><dd>{c.origines.join(', ')}</dd></>}
          <dt>Créée le</dt><dd>{dateFr(c.creeLe) || 'Non précisé'}</dd>
          <dt>Critères</dt><dd>{criteres.length ? criteres.join(' | ') : <span className={st.pale}>Aucun critère rempli</span>}</dd>
          {precisions.length > 0 && <><dt>Précision</dt><dd className={st.cite}>{`« ${extrait(precisions.join(' / '), 420)} »`}</dd></>}
          {commentaire && <><dt>Commentaire</dt><dd className={st.cite}>{`« ${extrait(commentaire, 600)} »`}</dd></>}
          {c.lignes.length > 1 && <><dt>Fichiers</dt><dd>{`${c.lignes.length} lignes regroupées : la même personne`}</dd></>}
        </dl>
      </div>
      <div className={st.fleche}><Ic n="fleche" t={18} e={2.2} /></div>
      <div className={`${st.col} ${st.colCrm}`}>
        {r.doublon && r.completion ? (
          <>
            <div className={st.colT}>Déjà dans ton CRM</div>
            <dl>
              <dt>Sa fiche</dt><dd>{`${nomCRM(r.doublon.client)} · même ${r.doublon.raison}${r.doublon.conjoint ? ' (sa personne 2)' : ''}`}</dd>
              <dt>Ajouté</dt><dd>{r.completion.rien ? <span className={st.pale}>Rien : sa fiche a déjà tout.</span> : (() => { const t = r.completion.lignes.join(', '); return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`; })()}</dd>
              {r.completion.proche && <><dt>Coordonnées</dt><dd className={st.pale}>{`Pas recopiées : celles de ${nomCRM(r.doublon.client)} restent seules sur sa fiche.`}</dd></>}
              {r.completion.recherche && p.recherches[0] && <><dt>Sa recherche</dt><dd><Puces r={r} onChoix={onChoix} /></dd></>}
              {!r.completion.rien && <><dt>Suivi</dt><dd className={st.pale}>{`« ${p.suivi.replace('Fiche reprise d’ImmoFacile', 'Fiche complétée depuis ImmoFacile')} »`}</dd></>}
            </dl>
          </>
        ) : r.choix.exclu ? (
          <>
            <div className={st.colT}>Ce qui sera créé dans ton CRM</div>
            <p className={st.pale}>Rien : tu as choisi de ne pas l’importer.</p>
          </>
        ) : (
          <>
            <div className={st.colT}>Ce qui sera créé dans ton CRM</div>
            <dl>
              <dt>Rôles</dt><dd className={st.roles}>{p.roles.proprietaire && <Role r="proprietaire" />}{p.roles.acheteur && <Role r="acheteur" />}</dd>
              {p.roles.acheteur && <><dt>Statut</dt><dd>{statut}</dd></>}
              {p.recherches.length > 0 && <><dt>Sa recherche</dt><dd><Puces r={r} onChoix={onChoix} /></dd></>}
              {/* Toujours là pour un acheteur : ce que le client lira dans « Précisions sur la recherche ». */}
              {p.recherches.length > 0 && <><dt>Précisions</dt><dd className={p.recherches[0].crit.notes ? st.texte : st.pale}>{p.recherches[0].crit.notes
                || (r.etat === 'attente' ? 'Lecture de son texte en cours…'
                  : precisions.length || commentaire ? 'Rien de repris : sa précision d’ImmoFacile reste, telle quelle, dans « À savoir ».' : 'Aucune')}</dd></>}
              {p.recherches.slice(1).map(x => <Fragment key={x.nom}><dt>{x.nom}</dt><dd>{`${x.titre} · ${x.ligne}`}</dd></Fragment>)}
              {p.roles.proprietaire && <><dt>Son bien</dt><dd>{p.aSuivre
                ? `Fiche bien « À suivre » dans Biens : ${p.aSuivre.resume} · ${p.aSuivre.rappelTexte}`
                : p.bienActuel.aVendre
                  ? `Case « Revente possible après l’achat (mandat vendeur potentiel) » cochée${p.bienActuel.notes ? ` : ${p.bienActuel.notes.replace(/[.\s]+$/, '')}` : ''} · ${p.rappel ? p.rappel.rappelTexte : 'sans date de rappel'}. Pas de fiche bien.`
                  : p.projetVente
                    ? `Projet de vente : son logement et son projet notés dans « À savoir » · ${p.rappel ? p.rappel.rappelTexte : 'sans date de rappel'}. Pas de fiche bien : tu la crées quand tu as vu le logement.`
                    : <span className={st.pale}>Pas de projet de vente</span>}</dd></>}
              <dt>À savoir</dt><dd className={st.texte}>{`${extrait(aSavoir, 700)}${bruts ? `\n+ ${bruts} d’ImmoFacile, en entier` : ''}`}</dd>
              <dt>Suivi</dt><dd className={st.pale}>{`« ${p.suivi} »`}</dd>
            </dl>
          </>
        )}
        <button type="button" className={st.lien} onClick={onEdition}><Ic n="crayon" t={13} />{edition ? 'Fermer les corrections' : 'Modifier avant l’import'}</button>
        {edition && <Edition r={r} aujourdhui={aujourdhui} onChoix={onChoix} />}
      </div>
    </div>
  );
}

/* Les critères : ceux des colonnes, puis ceux lus dans le texte (retirables). */
function Puces({ r, onChoix }: { r: Rangee; onChoix: (x: Partial<Choix>) => void }) {
  const rech = r.plan.recherches[0];
  const basculer = (id: string) => onChoix({ off: r.choix.off.includes(id) ? r.choix.off.filter(x => x !== id) : [...r.choix.off, id] });
  return (
    <>
      <div className={st.crit}>
        {rech.base.map(x => <span key={x.id}><Ic n={x.ic} t={13} /><span>{x.lib}</span></span>)}
      </div>
      {rech.extras.length > 0 && (
        <div className={`${st.crit} ${st.critPlus}`}>
          {rech.extras.map(x => (
            <span key={x.id} className={x.on ? undefined : st.critOff} title={x.long ? x.lib : undefined}>
              <Ic n={x.ic} t={12} e={x.ic === 'check' ? 2.6 : 2} />
              <span>{x.long ? extrait(x.lib, 48) : x.lib}</span>
              <button type="button" onClick={() => basculer(x.id)} aria-label={x.on ? `Retirer « ${x.lib} »` : `Remettre « ${x.lib} »`}>
                <Ic n={x.on ? 'croix' : 'plus'} t={10} e={2.6} />
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function Edition({ r, aujourdhui, onChoix }: { r: Rangee; aujourdhui: string; onChoix: (x: Partial<Choix>) => void }) {
  const p = r.plan;
  return (
    <div className={st.edition}>
      {!r.doublon && !r.choix.exclu && (
        <div className={st.edLigne}>
          <span>Rôles</span>
          <Role r="proprietaire" on={p.roles.proprietaire} onClick={() => onChoix({ proprietaire: !p.roles.proprietaire })} />
          {/* Un acheteur par défaut (rien de reconnu) : un clic le confirme. */}
          <Role r="acheteur" on={p.roles.acheteur && !p.force} onClick={() => onChoix({ acheteur: p.force ? true : !p.roles.acheteur })} />
        </div>
      )}
      {!r.choix.exclu && p.aSuivrePossible && r.bienPossible && (
        <div className={st.edLigne}>
          <span>Son bien</span>
          <Bascule on={!!p.aSuivre} onClick={() => onChoix({ aSuivre: !p.aSuivre })}>Créer aussi sa fiche bien « À suivre » (tu as vu le logement)</Bascule>
        </div>
      )}
      {!r.choix.exclu && (p.aSuivre || p.projetVente) && (
        <label className={st.edLigne}>
          <span>Rappel le</span>
          <input type="date" className={st.date} min={aujourdhui} value={p.aSuivre?.rappel || p.rappel?.date || ''} onChange={e => onChoix({ rappel: e.target.value })} />
        </label>
      )}
      {r.trouve && (
        <Bascule on={r.nouveau} onClick={() => onChoix({ nouveau: !r.nouveau })}>
          {`Ce n’est pas la même personne que la fiche du CRM : créer une fiche à part`}
        </Bascule>
      )}
      <Bascule rouge on={r.choix.exclu} onClick={() => onChoix({ exclu: !r.choix.exclu })}>Ne pas importer ce contact</Bascule>
    </div>
  );
}

type Etape = 'choix' | 'apercu' | 'ecriture' | 'fini';
type Onglet = 'tous' | 'ach' | 'pro' | 'com' | 'dbl' | 'ver' | 'exc';

export default function ImportImmoFacile({ onFermer, onVoir, onImporte }: {
  onFermer: () => void;
  /* « Voir les contacts importés » : les fiches créées ou complétées. */
  onVoir: (ids: string[]) => void;
  /* L'import est fini : la liste des contacts se relit. */
  onImporte: () => void;
}) {
  const [etape, setEtape] = useState<Etape>('choix');
  const [occupe, setOccupe] = useState(false);
  const [sur, setSur] = useState(false);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [fichiers, setFichiers] = useState<string[]>([]);
  const [aujourdhui, setAujourdhui] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [ignorees, setIgnorees] = useState(0);
  const [crm, setCrm] = useState<EtatCRM | null>(null);
  const [lectures, setLectures] = useState<Record<string, Lecture>>({});
  const [etats, setEtats] = useState<Record<string, EtatLecture>>({});
  const [choix, setChoix] = useState<Record<string, Choix>>({});
  const [noteLecture, setNoteLecture] = useState('');
  const [mode, setMode] = useState<Mode>('qualifier');
  const [onglet, setOnglet] = useState<Onglet>('tous');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [edition, setEdition] = useState<string | null>(null);
  /* La ligne qui se replie, le temps de son animation. */
  const [fermant, setFermant] = useState<string | null>(null);
  const repli = useRef<ReturnType<typeof setTimeout> | null>(null);
  function basculer(cle: string) {
    if (ouvert) {
      setFermant(ouvert);
      if (repli.current) clearTimeout(repli.current);
      repli.current = setTimeout(() => setFermant(null), 340);
    }
    setOuvert(o => (o === cle ? null : cle));
    setEdition(null);
  }
  const [avance, setAvance] = useState({ faits: 0, total: 0, nom: '' });
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [erreurFin, setErreurFin] = useState('');
  /* La fenêtre fermée pendant une lecture : les réponses qui arrivent ensuite sont ignorées. */
  const vivant = useRef(true);
  /* « Ne pas attendre » : les lectures encore en route sont ignorées. */
  const arret = useRef(false);
  /* Un double clic sur « Importer » n'importe pas deux fois. */
  const ecrit = useRef(false);
  useEffect(() => {
    vivant.current = true;
    return () => { vivant.current = false; };
  }, []);
  /* Pendant l'écriture, fermer l'onglet ou recharger la page laisserait
     l'import à moitié fait : le navigateur demande confirmation. */
  useEffect(() => {
    if (etape !== 'ecriture') return;
    const retenir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', retenir);
    return () => window.removeEventListener('beforeunload', retenir);
  }, [etape]);

  /* Les doublons, cherchés une fois par fichier (un index du CRM, pas une
     relecture de toute la liste pour chaque contact à chaque correction). */
  const trouves = useMemo(() => {
    if (!crm) return new Map<string, Doublon | null>();
    const idx = indexerCRM(crm.clients);
    return new Map(contacts.map(c => [c.cle, chercherDoublon(c, idx)]));
  }, [contacts, crm]);
  /* Une ligne par contact : ce qui sera fait, recalculé à chaque correction. */
  const rangees: Rangee[] = useMemo(() => {
    if (!crm || !aujourdhui) return [];
    return contacts.map(c => rangeeDe(c, {
      choix: choix[c.cle] || CHOIX_VIDE, etat: etats[c.cle] || 'sans_texte', lecture: lectures[c.cle] || null,
      trouve: trouves.get(c.cle) || null, crm, aujourdhui, mode,
    }));
  }, [contacts, lectures, etats, choix, crm, aujourdhui, trouves, mode]);

  const actives = rangees.filter(r => !r.choix.exclu);
  const aCreer = actives.filter(r => !r.doublon);
  const aCompleter = actives.filter(r => r.doublon && r.completion && !r.completion.rien);
  const nbRecherches = aCreer.reduce((n, r) => n + r.plan.recherches.length, 0) + aCompleter.reduce((n, r) => n + (r.completion?.recherche ? r.plan.recherches.length : 0), 0);
  /* Un projet de vente : la case « mandat vendeur potentiel », ou sa fiche bien si Alexandre l'a demandée. */
  const nbVendeurs = aCreer.filter(r => r.plan.projetVente || r.plan.aSuivre).length
    + aCompleter.filter(r => r.completion && (r.completion.bienActuel || r.completion.aSuivre || r.completion.rappel)).length;
  const nbDeja = actives.filter(r => r.doublon).length;
  const enLecture = Object.values(etats).filter(e => e === 'attente').length;
  const aLire = Object.values(etats).filter(e => e !== 'sans_texte').length;

  const ONGLETS: { k: Onglet; l: string; n: number; cls?: string; toujours?: boolean }[] = [
    { k: 'tous', l: 'Tous', n: rangees.length, toujours: true },
    { k: 'ach', l: 'Acheteurs', n: actives.filter(r => !r.doublon && r.plan.roles.acheteur).length, toujours: true },
    { k: 'pro', l: 'Propriétaires', n: actives.filter(r => !r.doublon && r.plan.roles.proprietaire).length, toujours: true },
    { k: 'com', l: 'Tirées d’un commentaire', n: actives.filter(r => !r.doublon && r.plan.tiree).length, cls: st.oOr, toujours: true },
    { k: 'dbl', l: 'Déjà dans le CRM', n: nbDeja, toujours: true },
    { k: 'ver', l: 'À vérifier', n: actives.filter(r => r.verif.length).length, cls: st.oRouge },
    { k: 'exc', l: 'Pas importés', n: rangees.filter(r => r.choix.exclu).length },
  ];
  const dansOnglet = (r: Rangee) => {
    switch (onglet) {
      case 'ach': return !r.choix.exclu && !r.doublon && r.plan.roles.acheteur;
      case 'pro': return !r.choix.exclu && !r.doublon && r.plan.roles.proprietaire;
      case 'com': return !r.choix.exclu && !r.doublon && r.plan.tiree;
      case 'dbl': return !r.choix.exclu && !!r.doublon;
      case 'ver': return !r.choix.exclu && r.verif.length > 0;
      case 'exc': return r.choix.exclu;
      default: return true;
    }
  };
  const visibles = rangees.filter(dansOnglet);

  function changerChoix(cle: string, x: Partial<Choix>) {
    setChoix(m => ({ ...m, [cle]: { ...(m[cle] || CHOIX_VIDE), ...x } }));
  }

  /* ── 1. Les fichiers ── */
  async function prendre(liste: FileList | null) {
    const tous = Array.from(liste || []);
    if (!tous.length || occupe) return;
    const f = tous.filter(x => x.size > 0);
    const err: string[] = tous.filter(x => x.size === 0).map(x => `« ${x.name} » est vide : refais l’export dans ImmoFacile.`);
    if (!f.length) { setErreurs(err); return; }
    setOccupe(true); setErreurs([]);
    const lus: FichierLu[] = [];
    for (const x of f) {
      if (!/\.csv$/i.test(x.name) && x.type !== 'text/csv') { err.push(`« ${x.name} » n’est pas un fichier .csv : dans ImmoFacile, choisis l’export au format CSV.`); continue; }
      try {
        const r = lireFichier(x.name, new Uint8Array(await x.arrayBuffer()));
        if (r.erreur) err.push(`« ${x.name} » : ${r.erreur}`);
        else if (!r.fiches.length) err.push(`« ${x.name} » ne contient aucun contact.`);
        else lus.push(r);
      } catch (e) { err.push(`« ${x.name} » n’a pas pu être lu (${(e as Error).message}).`); }
    }
    if (!lus.length) { setErreurs(err); setOccupe(false); return; }
    let etat: EtatCRM;
    try { etat = await lireCRM(); }
    catch (e) { setErreurs([...err, (e as Error).message]); setOccupe(false); return; }
    if (!vivant.current) return;
    const g = regrouper(lus);
    const auj = aujourdhuiYmd();
    setCrm(etat); setAujourdhui(auj); setContacts(g.contacts);
    setFichiers(lus.map(x => x.nom)); setIgnorees(lus.reduce((n, x) => n + x.ignorees, 0));
    setErreurs(err); setChoix({}); setLectures({}); setOnglet('tous'); setOuvert(null); setEdition(null);
    arret.current = false;
    setOccupe(false); setEtape('apercu');
    void lireTextes(g.contacts, auj);
  }

  /* ── Le texte libre, lu par Claude, par lots, quelques-uns à la fois ──
     Un lot qui revient incomplet (réponse coupée, erreur passagère) : ses
     manquants sont relus une fois, par deux. */
  async function lireTextes(liste: Contact[], auj: string) {
    const demandes = liste.map(demandeLecture).filter((x): x is DemandeLecture => !!x);
    const avecTexte = new Set(demandes.map(x => x.cle));
    setEtats(Object.fromEntries(liste.map(c => [c.cle, (avecTexte.has(c.cle) ? 'attente' : 'sans_texte') as EtatLecture])));
    setNoteLecture('');
    const lots: DemandeLecture[][] = [];
    for (let i = 0; i < demandes.length; i += PAR_LOT) lots.push(demandes.slice(i, i + PAR_LOT));
    let suivant = 0;
    let note = '';
    const enCours = () => vivant.current && !arret.current;
    const lire = async (lot: DemandeLecture[]): Promise<{ lus: Lecture[]; err: string }> => {
      let err = '';
      let lus: Lecture[] = [];
      try {
        const rep = await fetch('/api/import-immofacile', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aujourdhui: auj, contacts: lot }),
        });
        const j = await rep.json().catch(() => ({})) as { lectures?: unknown[]; erreur?: string };
        if (!rep.ok) err = rep.status === 401 ? 'session' : `http_${rep.status}`;
        /* Seulement les clés demandées dans ce lot, une fois chacune. */
        const demandees = new Set(lot.map(x => x.cle));
        lus = (Array.isArray(j.lectures) ? j.lectures : []).map(x => lireLecture(x)).filter((x): x is Lecture => !!x && demandees.has(x.cle));
        if (j.erreur) err = j.erreur;
      } catch { err = 'reseau'; }
      return { lus, err };
    };
    const travailleur = async () => {
      while (suivant < lots.length && enCours()) {
        const lot = lots[suivant++];
        const r = await lire(lot);
        let { err } = r;
        const par = new Map(r.lus.map(l => [l.cle, l]));
        const manquants = lot.filter(x => !par.has(x.cle));
        if (manquants.length && err !== 'cle_absente' && err !== 'session' && err !== 'non_autorise') {
          for (let i = 0; i < manquants.length && enCours(); i += PAR_REPRISE) {
            const r2 = await lire(manquants.slice(i, i + PAR_REPRISE));
            r2.lus.forEach(l => { if (!par.has(l.cle)) par.set(l.cle, l); });
            err = r2.err || (par.size === lot.length ? '' : err);
          }
        }
        if (!enCours()) return;
        setLectures(m => ({ ...m, ...Object.fromEntries(par) }));
        setEtats(m => ({ ...m, ...Object.fromEntries(lot.map(x => [x.cle, (par.has(x.cle) ? 'ok' : 'echec') as EtatLecture])) }));
        if (par.size < lot.length && !note) {
          note = err === 'cle_absente'
            ? 'La lecture des commentaires n’est pas branchée (clé Claude absente sur le serveur) : seules les colonnes sont reprises. Le commentaire de chacun est gardé en entier dans « À savoir ».'
            : err === 'session' || err === 'non_autorise'
              ? 'Ta session a expiré : les commentaires n’ont pas pu être lus. Recharge la page, puis recommence l’import.'
              : 'Une partie des commentaires n’a pas pu être lue, même au second essai : ces contacts sont marqués « Lecture du texte impossible ». Le reste vient des colonnes, et leur commentaire est gardé en entier dans « À savoir ».';
          setNoteLecture(note);
        }
      }
    };
    await Promise.all(Array.from({ length: EN_PARALLELE }, travailleur));
  }

  /* « Ne pas attendre » : ceux qui n'ont pas encore été lus sont repris avec
     leurs colonnes seulement (et « À vérifier »). */
  function passerLecture() {
    arret.current = true;
    setEtats(m => Object.fromEntries(Object.entries(m).map(([k, e]) => [k, e === 'attente' ? 'passee' : e])) as Record<string, EtatLecture>);
    setNoteLecture('Lecture arrêtée : les contacts pas encore lus sont repris avec leurs colonnes seulement (onglet « À vérifier »). Leur commentaire est gardé en entier dans « À savoir ».');
  }

  /* ── 3. L'écriture ──
     « Réessayer » relit d'abord le CRM : un contact qui a échoué a peut-être
     été enregistré quand même (une coupure après l'écriture), ou complété
     entre-temps. Une fiche du CRM complétée deux fois dans le même import
     (lui, puis sa conjointe) reçoit les deux blocs « À savoir ». */
  async function importer(seulement?: Set<string>) {
    if (!crm || ecrit.current) return;
    ecrit.current = true;
    let etat = crm;
    let lignes = rangees;
    if (seulement) {
      try { etat = await lireCRM(); }
      catch (e) { setErreurFin((e as Error).message); ecrit.current = false; return; }
      const idx = indexerCRM(etat.clients);
      lignes = contacts.filter(c => seulement.has(c.cle)).map(c => {
        let trouve = chercherDoublon(c, idx);
        /* Prévu comme une fiche à part : il le reste, sauf si le CRM le
           montre lui-même (son enregistrement est passé, la réponse s'est
           perdue). Un proche ou un homonyme créé entre-temps ne compte pas. */
        const avant = rangees.find(r => r.c.cle === c.cle);
        if (avant && !avant.doublon && trouve && (trouve.conjoint || trouve.autreNom || trouve.conflit)) trouve = null;
        return rangeeDe(c, {
          choix: choix[c.cle] || CHOIX_VIDE, etat: etats[c.cle] || 'sans_texte', lecture: lectures[c.cle] || null,
          trouve, crm: etat, aujourdhui, mode,
        });
      });
      setCrm(etat);
    }
    setErreurFin('');
    const lot = `${aujourdhui}-${partieAleatoire(6)}`;
    const choisies = lignes.filter(r => !r.choix.exclu && (!seulement || seulement.has(r.c.cle)));
    const aFaire = choisies.filter(r => !r.doublon || (r.completion && !r.completion.rien));
    /* À la reprise, déjà dans le CRM avec tout ce qu'il faut : il compte
       comme fait (il ne disparaît pas du bilan). */
    const dejaLa: Resultat[] = seulement ? choisies.filter(r => r.doublon && (!r.completion || r.completion.rien)).map(r => ({
      cle: r.c.cle, nom: r.nom, clientId: r.doublon?.client.id || null, fait: 'complete' as const, recherches: 0, bien: false, rappel: false, soucis: [], echec: null,
    })) : [];
    if (!aFaire.length && !dejaLa.length) { ecrit.current = false; return; }
    setEtape('ecriture'); setOuvert(null); setEdition(null);
    const deja = seulement ? resultats.filter(x => !seulement.has(x.cle)) : [];
    const out: Resultat[] = [...dejaLa];
    /* Les fiches du CRM déjà complétées pendant cet import. */
    const completees = new Set<string>(deja.filter(x => x.notes && x.clientId).map(x => x.clientId as string));
    for (let i = 0; i < aFaire.length; i++) {
      const r = aFaire[i];
      setAvance({ faits: i, total: aFaire.length, nom: r.nom });
      const id = { cle: r.c.cle, prenom: r.c.prenom, nom: r.c.nom, civilite: r.c.civilite, nomAffiche: r.nom };
      let res: Resultat;
      try {
        if (r.doublon) {
          const cid = r.doublon.client.id;
          res = await completerFiche(id, r.plan, cid, { lot, crm: etat, actif: mode === 'actifs' && r.verif.length === 0, doublon: r.doublon, memeLot: completees.has(cid) });
          /* Seulement si son bloc a été écrit : sinon (déjà repris lors d'un
             import précédent), la ligne suivante ne doit pas ajouter le sien. */
          if (res.notes) completees.add(cid);
        } else res = await importerNouveau(id, r.plan, { actif: r.actif, lot, crm: etat });
      } catch (e) {
        res = { cle: r.c.cle, nom: r.nom, clientId: null, fait: null, recherches: 0, bien: false, rappel: false, soucis: [], echec: (e as Error)?.message || 'erreur inconnue' };
      }
      out.push(res);
    }
    setAvance({ faits: aFaire.length, total: aFaire.length, nom: '' });
    setResultats([...deja, ...out]);
    ecrit.current = false;
    setEtape('fini');
    onImporte();
  }

  const titreFichiers = fichiers.length === 1 ? `Fichier « ${fichiers[0]} »` : `${fichiers.length} fichiers (${fichiers.join(', ')})`;

  /* ═══ 1. Choisir le fichier ═══ */
  const fenChoix = (
    <div className={d.fenetreIn} role="dialog" aria-modal="true" aria-label="Importer depuis ImmoFacile">
      <div className={d.fenTete}>
        <span className={st.icTete}><Ic n="groupe" t={20} /></span>
        <div className={st.teteTxt}>
          <h3>Importer depuis ImmoFacile</h3>
          <p>Tes contacts et leurs recherches, en une fois. Rien n’est enregistré avant ta validation.</p>
        </div>
        <Fermer onClick={onFermer} />
      </div>
      <div className={st.corps}>
        <ol className={st.etapes}>
          <li><b>1</b><span>{'Dans ImmoFacile : la liste des contacts, '}<em>sans filtre</em>{', puis « Exporter ».'}</span></li>
          <li><b>2</b><span>Dépose ici le fichier .csv obtenu (tu peux en mettre plusieurs).</span></li>
          <li><b>3</b><span>Le CRM te montre ce qu’il va créer. Tu valides, c’est fait.</span></li>
        </ol>
        <label className={`${st.depot}${sur ? ` ${st.depotSur}` : ''}${occupe ? ` ${st.depotOccupe}` : ''}`}
          onDragOver={e => { e.preventDefault(); if (!sur) setSur(true); }}
          onDragLeave={() => setSur(false)}
          onDrop={e => { e.preventDefault(); setSur(false); void prendre(e.dataTransfer.files); }}>
          <input type="file" accept=".csv,text/csv" multiple disabled={occupe} onChange={e => { void prendre(e.target.files); e.target.value = ''; }} />
          <span className={st.depotIc}><Ic n={occupe ? 'horloge' : 'telecharger'} t={24} /></span>
          <b>{occupe ? 'Lecture du fichier…' : 'Glisse ton fichier ici'}</b>
          <small>{occupe ? 'et des contacts déjà dans ton CRM' : 'ou clique pour le choisir · .csv exporté d’ImmoFacile'}</small>
        </label>
        {erreurs.length > 0 && <div className={st.erreurs}>{erreurs.map((x, i) => <div key={i} className={st.erreur}>{x}</div>)}</div>}
        <div className={st.regles}>
          <div className={st.colT}>Ce que fera l’import</div>
          <ul>
            <li><Ic n="check" t={13} e={2.6} /><span>{'Une recherche remplie, ou décrite dans le commentaire → '}<b>acheteur</b>{', même si ImmoFacile dit seulement « Propriétaire ».'}</span></li>
            <li><Ic n="check" t={13} e={2.6} /><span>{'« Propriétaire » → '}<b>propriétaire</b>{' ; un projet de vente → un rappel si une date est notée, et s’il achète aussi, la case « mandat vendeur potentiel ». Pas de fiche bien : tu la crées quand tu as vu le logement.'}</span></li>
            <li><Ic n="check" t={13} e={2.6} /><span>Précisions et commentaires lus : balcon, terrasse, étage, ascenseur, travaux… cochés dans sa recherche.</span></li>
            <li><Ic n="check" t={13} e={2.6} /><span>Déjà dans ton CRM (même e-mail, téléphone ou nom) → pas recréé ; ce qui manque sur sa fiche est complété.</span></li>
            <li><Ic n="check" t={13} e={2.6} /><span>{'Les acheteurs arrivent '}<b>à qualifier</b>{' : aucun mail ne part tout seul (veille, point automatique, alertes), sauf si tu choisis « Actifs ».'}</span></li>
          </ul>
        </div>
      </div>
    </div>
  );

  /* ═══ 2. L'aperçu ═══ */
  const nbBouton = aCreer.length;
  const libBouton = enLecture > 0 ? `Lecture des commentaires… ${aLire - enLecture}\u00a0sur\u00a0${aLire}`
    : nbBouton > 0 ? (nbBouton === 1 ? 'Importer le contact' : `Importer les ${nbBouton} contacts`)
      : aCompleter.length > 0 ? `Compléter ${pluriel(aCompleter.length, 'fiche', 'fiches')}` : 'Rien à importer';
  const fenApercu = (
    <div className={d.fenetreIn} style={{ width: 'min(1080px, 100%)' }} role="dialog" aria-modal="true" aria-label="Importer depuis ImmoFacile">
      <div className={d.fenTete}>
        <span className={st.icTete}><Ic n="groupe" t={20} /></span>
        <div className={st.teteTxt}>
          <h3>Importer depuis ImmoFacile</h3>
          <p>{`${titreFichiers} · rien n’est encore enregistré : regarde, corrige si besoin, puis importe.`}</p>
        </div>
        <Fermer onClick={onFermer} />
      </div>
      <div className={st.resume}>
        <div><b>{aCreer.length}</b><span>{aCreer.length > 1 ? 'contacts à créer' : 'contact à créer'}</span></div>
        <div><b>{nbRecherches}</b><span>{nbRecherches > 1 ? 'recherches' : 'recherche'}</span></div>
        <div><b>{nbVendeurs}</b><span>{nbVendeurs > 1 ? 'vendeurs potentiels' : 'vendeur potentiel'}</span></div>
        <div className={st.rGris}><b>{nbDeja}</b><span>déjà dans ton CRM</span></div>
      </div>
      <div className={st.mode}>
        <span className={st.modeT}>Les acheteurs importés arrivent en</span>
        <div className={st.modeBtns}>
          <button type="button" aria-pressed={mode === 'qualifier'} onClick={() => setMode('qualifier')}><b>À qualifier</b><small>rien ne part tout seul</small></button>
          <button type="button" aria-pressed={mode === 'actifs'} onClick={() => setMode('actifs')}><b>Actifs</b><small>veille, point automatique, alertes</small></button>
        </div>
        {mode === 'actifs' && (
          <div className={st.modeAlerte}><Ic n="info" t={14} /><span>{`Ils entrent dans la veille et dans les alertes, et le point automatique pourra leur écrire tout seul s’il est allumé. Sauf ceux de l’onglet « À vérifier » (dont ceux qui ont refusé les e-mails dans ImmoFacile) : ils restent à qualifier.`}</span></div>
        )}
      </div>
      {enLecture > 0 && (
        <div className={st.lecture}>
          <span>{`Lecture des commentaires : ${aLire - enLecture} sur ${aLire}`}</span>
          <div className={st.barre}><i style={{ width: `${Math.round(((aLire - enLecture) / Math.max(1, aLire)) * 100)}%` }} /></div>
          <button type="button" className={`${st.lien} ${st.passer}`} onClick={passerLecture}>Ne pas attendre</button>
        </div>
      )}
      {noteLecture && <div className={st.note}>{noteLecture}</div>}
      {(erreurs.length > 0 || ignorees > 0) && (
        <div className={st.note}>
          {[...erreurs, ...(ignorees > 0 ? [`${pluriel(ignorees, 'ligne laissée', 'lignes laissées')} de côté : l’historique des actions d’ImmoFacile, ou des lignes sans nom ni moyen de contact.`] : [])].join(' ')}
        </div>
      )}
      <div className={st.onglets} role="group" aria-label="Filtrer l’aperçu">
        {ONGLETS.filter(o => o.toujours || o.n > 0 || onglet === o.k).map(o => (
          <button key={o.k} type="button" aria-pressed={onglet === o.k} className={o.cls} onClick={() => setOnglet(o.k)}>{o.l}<i>{o.n}</i></button>
        ))}
      </div>
      <div className={st.liste}>
        {visibles.map(r => (
          <LigneApercu key={r.c.cle} r={r} mode={mode} aujourdhui={aujourdhui} ouvert={ouvert === r.c.cle} fermant={fermant === r.c.cle && ouvert !== r.c.cle} edition={edition === r.c.cle}
            onOuvrir={() => basculer(r.c.cle)}
            onEdition={() => setEdition(x => (x === r.c.cle ? null : r.c.cle))}
            onChoix={x => changerChoix(r.c.cle, x)} />
        ))}
        {visibles.length === 0 && <div className={st.vide}>Personne dans cet onglet.</div>}
      </div>
      <div className={st.pied}>
        <span className={st.pale}><Ic n="info" t={14} /><span>{'Rien n’est encore enregistré. En orange : la recherche vient de son commentaire, jette un œil. Les contacts déjà dans ton CRM ne sont pas recréés : ce qui manque sur leur fiche est complété.'}</span></span>
        <div className={st.piedBtns}>
          <button type="button" className={d.btn} onClick={onFermer}>Annuler</button>
          <button type="button" className={`${d.btn} ${d.btnNavy}`} disabled={enLecture > 0 || (!aCreer.length && !aCompleter.length)} onClick={() => void importer()}>
            <Ic n="check" t={15} e={2.6} />{libBouton}
          </button>
        </div>
      </div>
    </div>
  );

  /* ═══ 3. L'écriture ═══ */
  const fenEcriture = (
    <div className={d.fenetreIn} role="dialog" aria-modal="true" aria-label="Import en cours">
      <div className={st.fait}>
        <span className={`${st.faitIc} ${st.faitIcOr}`}><Ic n="telecharger" t={28} e={2.2} /></span>
        <h3>Import en cours…</h3>
        <p>{`${avance.faits} sur ${avance.total} · ne ferme pas cette fenêtre.`}</p>
        <div className={st.ecriture}><div className={st.barre}><i style={{ width: `${Math.round((avance.faits / Math.max(1, avance.total)) * 100)}%` }} /></div></div>
        <p className={st.pale}>{avance.nom ? `En cours : ${avance.nom}` : ' '}</p>
      </div>
    </div>
  );

  /* ═══ 4. C'est fait ═══ */
  const crees = resultats.filter(x => x.fait === 'cree');
  const completes = resultats.filter(x => x.fait === 'complete');
  const echecs = resultats.filter(x => !x.fait);
  const avecSoucis = resultats.filter(x => x.fait && x.soucis.length);
  const recherchesCreees = resultats.reduce((n, x) => n + x.recherches, 0);
  const biensCrees = resultats.filter(x => x.bien).length;
  const rappels = resultats.filter(x => x.rappel && x.bien).length;
  const rappelsVente = resultats.filter(x => x.rappel && !x.bien).length;
  const ids = resultats.map(x => (x.fait ? x.clientId : null)).filter((x): x is string => !!x);
  const titreFait = crees.length ? `${pluriel(crees.length, 'contact importé', 'contacts importés')}` : completes.length ? `${pluriel(completes.length, 'fiche complétée', 'fiches complétées')}` : 'Rien n’a été importé';
  const fenFait = (
    <div className={d.fenetreIn} role="dialog" aria-modal="true" aria-label="Import terminé">
      <div className={st.fait}>
        <span className={`${st.faitIc}${!crees.length && !completes.length ? ` ${st.faitIcRouge}` : ''}`}><Ic n={crees.length || completes.length ? 'check' : 'croix'} t={30} e={2.6} /></span>
        <h3>{echecs.length ? `${titreFait}, ${echecs.length} pas ${echecs.length > 1 ? 'enregistrés' : 'enregistré'}` : titreFait}</h3>
        {(crees.length > 0 || completes.length > 0) && <p>Ils sont dans ton CRM, comme si tu les avais saisis toi-même.</p>}
        <div className={st.faitL}>
          {recherchesCreees > 0 && <div><Ic n="cible" t={15} /><span><b>{recherchesCreees}</b>{recherchesCreees > 1 ? ' recherches créées' : ' recherche créée'}</span></div>}
          {biensCrees > 0 && <div><Ic n="maison" t={15} /><span><b>{biensCrees}</b>{`${biensCrees > 1 ? ' biens « À suivre »' : ' bien « À suivre »'}${rappels === biensCrees ? ', avec leur rappel' : rappels ? `, dont ${rappels} avec leur rappel` : ''}`}</span></div>}
          {rappelsVente > 0 && <div><Ic n="horloge" t={15} /><span><b>{rappelsVente}</b>{rappelsVente > 1 ? ' rappels posés pour un projet de vente' : ' rappel posé pour un projet de vente'}</span></div>}
          {completes.length > 0 && <div><Ic n="personne" t={15} /><span><b>{completes.length}</b>{completes.length > 1 ? ' contacts déjà présents, complétés' : ' contact déjà présent, complété'}</span></div>}
          {crees.length > 0 && <div><Ic n="info" t={15} /><span>{mode === 'actifs' ? 'Les acheteurs sont « Actifs » : veille, point automatique et alertes. Ceux « à vérifier » sont restés à qualifier.' : 'Les acheteurs sont « Prospect », à qualifier : rien ne part tout seul.'}</span></div>}
        </div>
        {avecSoucis.length > 0 && (
          <div className={st.soucis}>
            <b>Enregistrés, mais à reprendre à la main :</b>
            <ul>{avecSoucis.map(x => <li key={x.cle}>{`${x.nom} : ${x.soucis.join(' ; ')}.`}</li>)}</ul>
          </div>
        )}
        {echecs.length > 0 && (
          <div className={`${st.soucis} ${st.rouge}`}>
            <b>{`${pluriel(echecs.length, 'contact pas enregistré', 'contacts pas enregistrés')} : réessaie.`}</b>
            <ul>{echecs.map(x => <li key={x.cle}>{`${x.nom} : ${x.echec}`}</li>)}</ul>
          </div>
        )}
        {erreurFin && <div className={`${st.soucis} ${st.rouge}`}><b>{erreurFin}</b></div>}
        {(crees.length > 0 || completes.length > 0) && <p className={st.pale}>{[
          crees.length ? `Dans le Suivi ${crees.length > 1 ? 'des contacts créés' : 'du contact créé'} : « Fiche reprise d’ImmoFacile le ${dateFr(aujourdhui)} ».` : '',
          completes.length ? `Dans le Suivi ${completes.length > 1 ? 'des fiches complétées' : 'de la fiche complétée'} : « Fiche complétée depuis ImmoFacile le ${dateFr(aujourdhui)} ».` : '',
        ].filter(Boolean).join(' ')}</p>}
        <div className={st.faitBtns}>
          {echecs.length > 0 && <button type="button" className={d.btn} onClick={() => void importer(new Set(echecs.map(x => x.cle)))}><Ic n="retour" t={15} />{echecs.length > 1 ? `Réessayer ces ${echecs.length} contacts` : 'Réessayer ce contact'}</button>}
          {ids.length > 0
            ? <button type="button" className={`${d.btn} ${d.btnNavy}`} onClick={() => onVoir(ids)}><Ic n="personne" t={15} />Voir les contacts importés</button>
            : <button type="button" className={d.btn} onClick={onFermer}>Fermer</button>}
        </div>
      </div>
    </div>
  );

  const fen = etape === 'choix' ? fenChoix : etape === 'apercu' ? fenApercu : etape === 'ecriture' ? fenEcriture : fenFait;
  /* Sur <body>, comme « Nouveau contact » : la page qui arrive glisse, et une
     fenêtre posée dedans glisserait avec elle. */
  return createPortal(<div className={d.fenetre}>{fen}</div>, document.body);
}
