'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import EnteteRubrique from '@/components/shared/EnteteRubrique';
import {
  NATURES, OBS_A_LA_MAIN, SOURCES, TYPES_MANDAT, TYPES_OBS, etatLigne, inscrire, lireDepart, observer, quandRegistre, toutLire, verifier,
  type Depart, type LigneRegistre, type Nature, type ObsRegistre, type Probleme, type TypeObs,
} from '@/lib/registre';
import { pdfRegistre } from '@/lib/registre-pdf';
import { Croix, Ic } from './ApercuActe';
import { identiteDuJour, montrerPdf } from './outils';
import r from './Registre.module.css';

/* ═══ Documents › Registre des mandats (V3.18) ═══════════════════════════
   Avant : l'écran de démarrage (le numéro qui suit l'ancien registre).
   Après : l'état du registre (vérifié à chaque ouverture), les mandats dans
   l'ordre avec leurs observations, et ce qu'on peut y ajouter : un mandat
   signé hors du CRM (« Inscrire à la main »), une observation. Rien ne s'y
   modifie ni ne s'efface. Voir src/lib/registre.ts. */

const PICTO_REGISTRE = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v16H6.5A1.5 1.5 0 0 0 5 20.5z" /><path d="M5 20.5A1.5 1.5 0 0 0 6.5 22H19v-3" /><path d="M9 7.5h6" /><path d="M9 11h6" />
  </svg>
);

/* Le plus grand numéro que le CRM connaît déjà (documents, recherches,
   mandats signés en ligne) : de quoi proposer le point de départ. */
async function plusGrandConnu(): Promise<{ n: number; ou: string } | null> {
  const [a, b, c, r] = await Promise.all([
    supabase.from('documents').select('numero, titre').in('modele', ['mandat_vente', 'mandat_recherche']).not('numero', 'is', null).limit(1000),
    supabase.from('recherches').select('mandat_numero, nom').not('mandat_numero', 'is', null).limit(1000),
    supabase.from('mandats_signatures').select('numero').limit(1000),
    /* Les numéros d'avance, réservés dans l'ancien registre pour les
       clients qui signent seuls : déjà pris là-bas. */
    supabase.from('parametres').select('valeur').eq('cle', 'mandat_numeros_reserve').maybeSingle(),
  ]);
  let best: { n: number; ou: string } | null = null;
  const voir = (v: unknown, ou: string) => {
    const n = Number(String(v || '').replace(/\D/g, ''));
    if (Number.isFinite(n) && n > 0 && n < 10_000_000 && (!best || n > best.n)) best = { n, ou };
  };
  for (const x of (a.data || []) as { numero: string; titre: string | null }[]) voir(x.numero, x.titre || 'un document');
  for (const x of (b.data || []) as { mandat_numero: string; nom: string | null }[]) voir(x.mandat_numero, `la recherche « ${x.nom || '…'} »`);
  for (const x of (c.data || []) as { numero: string }[]) voir(x.numero, 'un mandat signé en ligne');
  for (const x of String((r.data as { valeur?: string } | null)?.valeur || '').split(/[\s,;]+/)) voir(x, 'ta réserve de numéros');
  return best;
}

/* ── Le démarrage ── */
function Demarrage({ onDemarre }: { onDemarre: () => void }) {
  const [dernier, setDernier] = useState('');
  const [reprise, setReprise] = useState('');
  const [touche, setTouche] = useState(false);
  const [note, setNote] = useState(false);
  const [forcer, setForcer] = useState(false);
  const [connu, setConnu] = useState<{ n: number; ou: string } | null>(null);
  const [travail, setTravail] = useState(false);
  const [erreur, setErreur] = useState('');
  useEffect(() => { plusGrandConnu().then(setConnu).catch(() => setConnu(null)); }, []);
  const n = Number(dernier.replace(/\D/g, ''));
  const valide = dernier.trim() !== '' && Number.isFinite(n) && n >= 0;
  const premier = valide ? n + 1 : null;
  /* Un départ qui retombe sur des numéros que le CRM connaît déjà : deux
     mandats pourraient porter le même. */
  const conflit = !!(connu && premier && premier <= connu.n);
  const texteReprise = touche ? reprise : (valide ? `Suite du registre ImmoFacile, dont le dernier numéro utilisé est le ${n}.` : '');

  async function demarrer() {
    if (!premier) return;
    if (!confirm(`Démarrer le registre au n° ${premier} ?\n\nC’est définitif : le point de départ ne se change plus, et chaque mandat prendra ensuite son numéro ici, dans l’ordre.`)) return;
    setTravail(true); setErreur('');
    const { error } = await supabase.rpc('registre_demarrer', { p_premier: premier, p_reprise: texteReprise || null });
    setTravail(false);
    if (error) { setErreur(/does not exist|Could not find/i.test(error.message) ? 'Le registre n’existe pas encore dans la base : lance d’abord le fichier outils/sql/registre-mandats.sql dans Supabase.' : error.message); return; }
    onDemarre();
  }

  return (
    <section className={r.depart}>
      <div className={r.departHaut}>
        <span className={r.departSur}>Registre des mandats</span>
        <h2>Ton registre, tenu par le CRM</h2>
        <p>{'Le même registre qu’aujourd’hui, sans rien à recopier : c’est toi qui choisis quand il démarre.'}</p>
        <div className={r.points}>
          <div className={r.point}><span className={r.pointIc}><Ic n="livre" t={17} /></span><span>{'Chaque mandat prend son numéro ici, dans l’ordre, au moment où il est figé : en finalisant un mandat dans Documents, ou quand un acheteur demande son code pour signer seul dans son espace. Le numéro est sur le mandat avant la signature.'}</span></div>
          <div className={r.point}><span className={r.pointIc}><Ic n="cadenas" t={17} /></span><span>{'Une ligne inscrite ne se modifie plus et ne s’efface plus, même par la base. Ce qui arrive ensuite (signé, sans suite, avenant, fin) s’ajoute en observation.'}</span></div>
          <div className={r.point}><span className={r.pointIc}><Ic n="bouclier" t={17} /></span><span>{'Chaque ligne porte une empreinte liée à la précédente : la moindre retouche se voit. Le 1er de chaque mois, une archive PDF datée part dans ta boîte mail.'}</span></div>
        </div>
      </div>
      <div className={r.departForm}>
        <h3>Le point de départ</h3>
        <label className={r.champ}>
          <span>Le dernier numéro utilisé dans ton registre actuel</span>
          <input className={r.input} inputMode="numeric" value={dernier} onChange={e => setDernier(e.target.value)} placeholder="ex. 4329" />
          {connu && <small>{`Le plus grand numéro que le CRM connaît : ${connu.n} (${connu.ou}).`} <button type="button" className={r.suggestion} onClick={() => setDernier(String(connu.n))}>Reprendre ce numéro</button></small>}
        </label>
        {premier && (
          <div className={r.premier}><b>{premier}</b><span>{'Le premier mandat inscrit dans le CRM portera ce numéro, et les suivants se suivront sans trou.'}</span></div>
        )}
        <label className={r.champ}>
          <span>La mention de reprise, imprimée en tête du registre</span>
          <textarea className={r.input} rows={2} value={texteReprise} onChange={e => { setTouche(true); setReprise(e.target.value); }} placeholder="Suite du registre ImmoFacile, dont le dernier numéro utilisé est le …" />
        </label>
        <label className={r.coche}>
          <input type="checkbox" checked={note} onChange={e => setNote(e.target.checked)} />
          <span>{valide ? `J’ai exporté (ou imprimé) mon registre actuel, arrêté au n° ${n}, et je le garde avec mes mandats.` : 'J’ai exporté (ou imprimé) mon registre actuel, arrêté à son dernier numéro, et je le garde avec mes mandats.'}</span>
        </label>
        {conflit && connu && (
          <div className={`${r.message} ${r.messageKo}`}>
            <b>{`Le CRM connaît déjà le n° ${connu.n}`}</b>
            <div>{`(${connu.ou}). En démarrant au n° ${premier}, deux mandats pourraient porter le même numéro. Vérifie le dernier numéro de ton registre actuel.`}</div>
            <label className={r.coche} style={{ marginTop: 8 }}>
              <input type="checkbox" checked={forcer} onChange={e => setForcer(e.target.checked)} />
              <span>{`Je confirme : les numéros à partir du ${premier} n’ont jamais servi dans mon registre actuel.`}</span>
            </label>
          </div>
        )}
        {erreur && <div className={`${r.message} ${r.messageKo}`}>{erreur}</div>}
        <div><button type="button" className={`${r.btn} ${r.btnOr}`} disabled={!premier || !note || travail || (conflit && !forcer)} onClick={demarrer}><Ic n="check" t={15} e={2.4} />{travail ? 'Démarrage…' : 'Démarrer le registre'}</button></div>
        <div className={r.note}>{'À faire valider par ton avocat ou ta chambre (FNAIM, SNPI…) avant la première utilisation. Garde ton ancien registre et tes mandats 10 ans.'}</div>
      </div>
    </section>
  );
}

/* ── La frise ──
   Les mandats se lisent comme une frise, de haut en bas : chaque numéro est
   une pastille posée sur un trait continu, sa carte à côté. Au bout du
   trait, le départ du registre ; à l'autre bout, le prochain numéro. */
const moisDe = (iso: string) => {
  const t = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'long', year: 'numeric' }).format(new Date(iso));
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const moisCourt = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'short', year: 'numeric' }).format(new Date(iso));
const jourCourt = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' }).format(new Date(iso));

function LigneR({ l, obs, i, onObserver, onDocument, onClient }: {
  l: LigneRegistre; obs: ObsRegistre[]; i: number; onObserver: () => void; onDocument?: () => void; onClient?: () => void;
}) {
  const et = etatLigne(obs);
  return (
    <article className={r.jalon} style={{ ['--i' as string]: Math.min(i, 12) }}>
      <div className={r.jalonG}>
        <span className={`${r.puce} ${r['p_' + et.ton] || ''}`}><small>N°</small>{l.numero}</span>
        <span className={r.puceJour}>{jourCourt(l.inscrit_le)}</span>
      </div>
      <div className={r.carte}>
        <div className={r.carteHaut}>
          <span className={r.nature}>{`${NATURES[l.nature]}${l.type_mandat ? ` ${TYPES_MANDAT[l.type_mandat] || l.type_mandat}` : ''}`}</span>
          <span className={`${r.pill} ${r['t_' + et.ton] || ''}`}><Ic n={et.cle === 'reserve' ? 'horloge' : TYPES_OBS[et.cle as TypeObs]?.ic || 'check'} t={12} e={2.4} />{et.l}</span>
        </div>
        <div className={r.mandants}>{l.mandants}</div>
        <div className={r.objet}>{l.objet}</div>
        {obs.length > 0 && (
          <div className={r.obs}>
            {obs.map(o => {
              const t = TYPES_OBS[o.type as TypeObs];
              return (
                <div key={o.id} className={`${r.ob} ${r['o_' + (t?.ton || 'bleu')] || ''}`}>
                  <span className={r.obIc}><Ic n={t?.ic || 'bulle'} t={11} e={2.2} /></span>
                  <span title={`Noté au registre le ${quandRegistre(o.le)}`}><b>{t?.l || o.type}</b>{` — ${o.texte} `}<i className={r.obLe}>{`· ${jourCourt(o.le)}`}</i></span>
                </div>
              );
            })}
          </div>
        )}
        <div className={r.pied}>
          <span className={r.inscrit}>{`Inscrit le ${quandRegistre(l.inscrit_le)} · ${SOURCES[l.source] || l.source}`}<span className={r.empreinte} title={`Empreinte SHA-256 : ${l.empreinte}`}>{` · #${l.empreinte.slice(0, 10)}`}</span></span>
          <span className={r.actions}>
            <button type="button" className={r.btnLien} onClick={onObserver}><Ic n="plus" t={13} e={2.4} />Observation</button>
            {onDocument && <button type="button" className={r.btnLien} onClick={onDocument}><Ic n="doc" t={13} />Document</button>}
            {onClient && <button type="button" className={r.btnLien} onClick={onClient}><Ic n="personne" t={13} />Fiche client</button>}
          </span>
        </div>
      </div>
    </article>
  );
}

/* Les deux bouts de la frise. */
function Prochain({ n }: { n: number }) {
  return (
    <div className={`${r.jalon} ${r.jalonBout}`}>
      <div className={r.jalonG}><span className={`${r.puce} ${r.puceProchain}`}><small>N°</small>{n}</span></div>
      <div className={r.bout}><b>Prochain numéro</b><span>{'Pris par le prochain mandat finalisé dans Documents, ou signé par un acheteur dans son espace.'}</span></div>
    </div>
  );
}
function Depart({ d }: { d: Depart }) {
  return (
    <div className={`${r.jalon} ${r.jalonBout}`}>
      <div className={r.jalonG}><span className={r.puceDepart}><Ic n="drapeau" t={16} e={2} /></span></div>
      <div className={r.bout}><b>{`Départ du registre, au n° ${d.premier_numero}`}</b><span>{`Le ${quandRegistre(d.demarre_le)}${d.reprise ? ` · ${d.reprise}` : ''}`}</span></div>
    </div>
  );
}

/* ── Inscrire un mandat à la main (signé hors du CRM) ── */
function FenInscrire({ prochain, onFermer, onInscrit }: { prochain: number; onFermer: () => void; onInscrit: (l: LigneRegistre) => void }) {
  const [nature, setNature] = useState<Nature>('vente');
  const [type, setType] = useState('simple');
  const [mandants, setMandants] = useState('');
  const [objet, setObjet] = useState('');
  const [travail, setTravail] = useState(false);
  const [erreur, setErreur] = useState('');
  const [fait, setFait] = useState<LigneRegistre | null>(null);
  async function valider() {
    if (!mandants.trim() || !objet.trim()) { setErreur('Les mandants et l’objet du mandat sont obligatoires.'); return; }
    if (!confirm('Inscrire ce mandat au registre ?\n\nLe numéro est donné tout de suite et la ligne ne pourra plus être effacée.')) return;
    setTravail(true); setErreur('');
    try {
      const l = await inscrire(supabase, { nature, type_mandat: type, mandants: mandants.trim(), objet: objet.trim(), source: 'main' });
      setFait(l); onInscrit(l);
    } catch (e) { setErreur((e as Error).message); }
    setTravail(false);
  }
  return (
    <div className={r.fenetre} onClick={e => { if (e.target === e.currentTarget && !travail) onFermer(); }}>
      <div className={r.fenetreIn} role="dialog" aria-modal="true" aria-label="Inscrire un mandat à la main">
        <div className={r.fenTete}>
          <div style={{ flex: '1 1 auto' }}>
            <h3>{fait ? 'Mandat inscrit' : 'Inscrire un mandat à la main'}</h3>
            <p>{fait ? 'Reporte ce numéro sur le mandat avant de le faire signer.' : 'Un mandat préparé hors des Documents du CRM (papier, autre outil). Les mandats faits dans Documents ou signés dans l’espace s’inscrivent seuls.'}</p>
          </div>
          <button type="button" className={r.btnLien} aria-label="Fermer" onClick={onFermer} disabled={travail}><Croix /></button>
        </div>
        <div className={r.fenCorps}>
          {fait ? (
            <div className={r.grand}><small>Numéro du registre</small><b>{fait.numero}</b></div>
          ) : (
            <>
              <div className={r.champ}><span>Nature</span>
                <div className={r.choix}>
                  {(['vente', 'recherche'] as Nature[]).map(x => <button key={x} type="button" aria-pressed={nature === x} onClick={() => setNature(x)}><Ic n={x === 'vente' ? 'maison' : 'loupe'} t={14} />{NATURES[x]}</button>)}
                </div>
              </div>
              <div className={r.champ}><span>Type</span>
                <div className={r.choix}>
                  {(nature === 'vente' ? ['simple', 'semi', 'exclusif'] : ['simple', 'exclusif']).map(x => <button key={x} type="button" aria-pressed={type === x} onClick={() => setType(x)}><Ic n={x === 'simple' ? 'ouvert' : x === 'semi' ? 'bouclier' : 'cadenas'} t={14} />{TYPES_MANDAT[x]}</button>)}
                </div>
              </div>
              <label className={r.champ}><span>Les mandants (noms et adresses)</span>
                <textarea className={r.input} rows={2} value={mandants} onChange={e => setMandants(e.target.value)} placeholder="Monsieur Paul MARTIN, 3 rue de la Paix, 75002 Paris" />
              </label>
              <label className={r.champ}><span>{nature === 'vente' ? 'Le bien à vendre' : 'Le bien recherché'}</span>
                <textarea className={r.input} rows={2} value={objet} onChange={e => setObjet(e.target.value)} placeholder={nature === 'vente' ? '12 rue des Lilas, 92100 Boulogne · appartement de 4 pièces · prix 685 000 €' : 'Appartement de 3 pièces, Paris 16e, jusqu’à 800 000 €'} />
              </label>
              <div className={r.premier}><b>{prochain}</b><span>{'Le numéro qu’il prendra, sauf si un autre mandat est inscrit avant.'}</span></div>
            </>
          )}
          {erreur && <div className={`${r.message} ${r.messageKo}`}>{erreur}</div>}
        </div>
        <div className={r.fenPied}>
          {fait
            ? <button type="button" className={`${r.btn} ${r.btnBleu}`} onClick={onFermer}>Fermer</button>
            : <>
                <button type="button" className={r.btn} onClick={onFermer} disabled={travail}>Annuler</button>
                <button type="button" className={`${r.btn} ${r.btnOr}`} onClick={valider} disabled={travail}><Ic n="livre" t={15} />{travail ? 'Inscription…' : 'Inscrire au registre'}</button>
              </>}
        </div>
      </div>
    </div>
  );
}

/* ── Ajouter une observation ── */
function FenObserver({ l, onFermer, onFait }: { l: LigneRegistre; onFermer: () => void; onFait: () => void }) {
  const [type, setType] = useState<TypeObs>('note');
  const [texte, setTexte] = useState('');
  const [travail, setTravail] = useState(false);
  const [erreur, setErreur] = useState('');
  async function valider() {
    if (!texte.trim()) { setErreur('Écris ce qui s’est passé : la date, et un mot d’explication.'); return; }
    if (!confirm('Ajouter cette observation au registre ?\n\nElle ne pourra plus être modifiée ni effacée.')) return;
    setTravail(true); setErreur('');
    const pb = await observer(supabase, { registre_id: l.id, type, texte: texte.trim() });
    setTravail(false);
    if (pb) { setErreur(pb); return; }
    onFait();
  }
  const aide: Partial<Record<TypeObs, string>> = {
    signe: 'Ex : signé à l’agence le 2 octobre 2026.', sans_suite: 'Ex : le vendeur a renoncé avant de signer.',
    fin: 'Ex : résilié par lettre recommandée du 5 novembre 2026, fin le 20 novembre.', vente: 'Ex : acte authentique signé le 12 janvier 2027 chez Me Durand.',
    annule: 'Ex : mandat annulé d’un commun accord le …', delegation: 'Ex : délégué à l’Agence du Parc (SARL Parc Immobilier) le 3 octobre 2026, jusqu’au 3 janvier 2027.',
    note: 'Toute autre information utile.',
  };
  return (
    <div className={r.fenetre} onClick={e => { if (e.target === e.currentTarget && !travail) onFermer(); }}>
      <div className={r.fenetreIn} role="dialog" aria-modal="true" aria-label="Ajouter une observation">
        <div className={r.fenTete}>
          <div style={{ flex: '1 1 auto' }}>
            <h3>{`Observation sur le n° ${l.numero}`}</h3>
            <p>{l.mandants}</p>
          </div>
          <button type="button" className={r.btnLien} aria-label="Fermer" onClick={onFermer} disabled={travail}><Croix /></button>
        </div>
        <div className={r.fenCorps}>
          <div className={r.choix}>
            {OBS_A_LA_MAIN.map(x => <button key={x} type="button" aria-pressed={type === x} onClick={() => setType(x)}><Ic n={TYPES_OBS[x].ic} t={14} />{TYPES_OBS[x].l}</button>)}
          </div>
          <label className={r.champ}><span>Ce qui s’est passé</span>
            <textarea className={r.input} rows={3} value={texte} onChange={e => setTexte(e.target.value)} placeholder={aide[type]} />
          </label>
          {erreur && <div className={`${r.message} ${r.messageKo}`}>{erreur}</div>}
        </div>
        <div className={r.fenPied}>
          <button type="button" className={r.btn} onClick={onFermer} disabled={travail}>Annuler</button>
          <button type="button" className={`${r.btn} ${r.btnOr}`} onClick={valider} disabled={travail}><Ic n="plus" t={15} e={2.4} />{travail ? 'Ajout…' : 'Ajouter au registre'}</button>
        </div>
      </div>
    </div>
  );
}

type Filtre = 'tout' | 'reserve' | 'signe' | 'clos';

export default function PageRegistre({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [depart, setDepart] = useState<Depart | null | undefined>(undefined);
  const [absent, setAbsent] = useState(false);
  const [lignes, setLignes] = useState<LigneRegistre[]>([]);
  const [obs, setObs] = useState<ObsRegistre[]>([]);
  const [verif, setVerif] = useState<{ ok: boolean; problemes: Probleme[]; erreur?: string } | null>(null);
  const [erreur, setErreur] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tout');
  const [cherche, setCherche] = useState('');
  const [fen, setFen] = useState<{ k: 'inscrire' } | { k: 'observer'; l: LigneRegistre } | null>(null);
  const [travail, setTravail] = useState('');
  const [message, setMessage] = useState<{ t: string; ok: boolean } | null>(null);
  const [ordre, setOrdre] = useState<'recent' | 'registre'>('recent');

  const charger = useCallback(async () => {
    const d = await lireDepart(supabase);
    setAbsent(d.absent);
    if (d.erreur) setErreur(d.erreur);
    setDepart(d.depart);
    if (!d.depart) return;
    const [a, b] = await Promise.all([
      toutLire<LigneRegistre>((de, jusque) => supabase.from('registre_mandats').select('*').order('numero', { ascending: false }).range(de, jusque)),
      toutLire<ObsRegistre>((de, jusque) => supabase.from('registre_observations').select('*').order('rang').range(de, jusque)),
    ]);
    if (a.erreur || b.erreur) { setErreur('Le registre n’a pas pu être lu : ' + (a.erreur || b.erreur)); return; }
    setErreur('');
    setLignes(a.data);
    setObs(b.data);
    setVerif(await verifier(supabase));
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const parLigne = useMemo(() => {
    const m = new Map<string, ObsRegistre[]>();
    for (const o of obs) m.set(o.registre_id, [...(m.get(o.registre_id) || []), o]);
    return m;
  }, [obs]);
  const etatDe = useCallback((l: LigneRegistre) => etatLigne(parLigne.get(l.id) || []).cle, [parLigne]);
  const q = cherche.trim().toLowerCase();
  const trouvees = lignes.filter(l => !q || `${l.numero} ${l.mandants} ${l.objet}`.toLowerCase().includes(q));
  const compte = (f: Filtre) => trouvees.filter(l => f === 'tout' || (f === 'reserve' ? etatDe(l) === 'reserve' : f === 'signe' ? etatDe(l) === 'signe' : !['reserve', 'signe'].includes(etatDe(l)))).length;
  const visibles = trouvees.filter(l => filtre === 'tout' || (filtre === 'reserve' ? etatDe(l) === 'reserve' : filtre === 'signe' ? etatDe(l) === 'signe' : !['reserve', 'signe'].includes(etatDe(l))));
  const prochain = lignes.length ? lignes[0].numero + 1 : depart?.premier_numero || 1;
  /* La frise entière (départ et prochain numéro aux deux bouts) seulement
     sans filtre ni recherche ; les mandats groupés par mois d'inscription. */
  const complet = !q && filtre === 'tout';
  const groupes = (() => {
    const l = ordre === 'recent' ? visibles : [...visibles].reverse();
    const g: { mois: string; court: string; lignes: { l: LigneRegistre; i: number }[] }[] = [];
    l.forEach((x, i) => {
      const m = moisDe(x.inscrit_le);
      if (!g.length || g[g.length - 1].mois !== m) g.push({ mois: m, court: moisCourt(x.inscrit_le), lignes: [] });
      g[g.length - 1].lignes.push({ l: x, i });
    });
    return g;
  })();

  async function exporter() {
    if (!depart) return;
    const onglet = window.open('', '_blank');
    setTravail('pdf'); setMessage(null);
    try {
      const v = await verifier(supabase);
      const pdf = await pdfRegistre({ depart, lignes: [...lignes].sort((a, b) => a.numero - b.numero), obs, problemes: v.problemes, identite: await identiteDuJour(), editeLe: new Date().toISOString() });
      montrerPdf(onglet, pdf);
    } catch (e) {
      onglet?.close();
      setMessage({ t: 'Le PDF n’a pas pu être préparé : ' + (e as Error).message, ok: false });
    }
    setTravail('');
  }
  async function archiver() {
    setTravail('archive'); setMessage(null);
    try {
      const x = await fetch('/api/registre/archive', { method: 'POST' });
      const j = await x.json().catch(() => ({}));
      if (!x.ok || !j.ok) throw new Error(j.erreur || `erreur ${x.status}`);
      setMessage({ t: j.mail ? `L’archive est rangée, mais le mail n’est pas parti (${j.mail}).` : 'L’archive est partie dans ta boîte mail, et rangée dans le CRM.', ok: !j.mail });
    } catch (e) { setMessage({ t: 'L’archive n’a pas pu être faite : ' + (e as Error).message, ok: false }); }
    setTravail('');
  }
  async function ficheClient(id: string) {
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
    if (error || !data) { alert('La fiche du client n’a pas pu être ouverte.' + (error ? `\n\n${error.message}` : '')); return; }
    onNavigate('fiche', data);
  }

  const entete = (
    <EnteteRubrique titre="Registre des mandats" icone={PICTO_REGISTRE} label="État des mandats"
      phrase={depart ? `Démarré le ${quandRegistre(depart.demarre_le, false)} au n° ${depart.premier_numero} · ${lignes.length === 0 ? 'aucun mandat inscrit' : `${lignes.length} mandat${lignes.length > 1 ? 's' : ''} inscrit${lignes.length > 1 ? 's' : ''}`}` : 'Chaque mandat, dans l’ordre, sans trou ni retouche'}
      recherche={depart ? { valeur: cherche, onChange: setCherche, placeholder: 'Un numéro, un nom, une adresse', label: 'Chercher dans le registre' } : undefined}
      bouton={depart ? { lib: 'Inscrire à la main', onClick: () => setFen({ k: 'inscrire' }) } : undefined}
      tuiles={depart ? [
        { cle: 'tout', lib: 'Tous', n: compte('tout') },
        { cle: 'reserve', lib: 'Pas encore signés', n: compte('reserve'), couleur: '#3b82f6', alerte: true },
        { cle: 'signe', lib: 'Signés', n: compte('signe'), couleur: '#10b981' },
        { cle: 'clos', lib: 'Terminés', n: compte('clos'), couleur: '#94a3b8' },
      ] : []}
      actif={filtre} onChoisir={c => setFiltre(c as Filtre)} />
  );

  if (depart === undefined) return <div className={r.page}>{entete}<div className={r.vide}>Chargement…</div></div>;
  return (
    <div className={r.page}>
      {entete}
      {absent && (
        <div className={`${r.message} ${r.messageKo}`}>{'Une étape avant de commencer : le registre n’existe pas encore dans la base. Ouvre Supabase › SQL Editor, lance le fichier outils/sql/registre-mandats.sql, puis recharge cette page.'}</div>
      )}
      {erreur && <div className={`${r.message} ${r.messageKo}`}>{erreur}</div>}
      {!depart && !absent && <Demarrage onDemarre={charger} />}
      {depart && (
        <>
          <section className={`${r.etat} ${verif && !verif.ok ? r.etatKo : ''}`}>
            <span className={`${r.sceau} ${!verif ? r.sceauAttente : verif.ok ? r.sceauOk : r.sceauKo}`}><Ic n={!verif ? 'horloge' : verif.ok ? 'bouclier' : 'alarme'} t={22} /></span>
            <div className={r.etatTxt}>
              <b>{!verif ? 'Vérification en cours…' : verif.erreur ? 'La vérification n’a pas pu se faire' : verif.ok ? 'Registre intact' : `${verif.problemes.length} anomalie${verif.problemes.length > 1 ? 's' : ''} dans le registre`}</b>
              <span>{!verif ? '' : verif.erreur ? verif.erreur : !verif.ok
                ? verif.problemes.map(p => `${p.numero ? `n° ${p.numero} : ` : ''}${p.probleme}`).join(' · ')
                : lignes.length === 0 ? `Démarré et prêt : le premier mandat prendra le n° ${prochain}.`
                : lignes.length === 1 ? `Vérifié à l’ouverture : le n° ${depart.premier_numero} n’a pas été retouché. Prochain numéro : ${prochain}.`
                : `Vérifié à l’ouverture : les numéros se suivent de ${depart.premier_numero} à ${prochain - 1}, et aucune ligne n’a été retouchée. Prochain numéro : ${prochain}.`}</span>
            </div>
            <div className={r.etatBoutons}>
              <button type="button" className={r.btn} disabled={!!travail} onClick={exporter}><Ic n="doc" t={15} />{travail === 'pdf' ? 'Préparation…' : 'Exporter en PDF'}</button>
              <button type="button" className={r.btn} disabled={!!travail} onClick={archiver}><Ic n="mail" t={15} />{travail === 'archive' ? 'Envoi…' : 'M’envoyer l’archive'}</button>
            </div>
          </section>
          {message && <div className={`${r.message} ${message.ok ? r.messageOk : r.messageKo}`}>{message.t}</div>}
          {lignes.length > 0 && (
            <div className={r.triBar}>
              <span>{q || filtre !== 'tout' ? `${visibles.length} mandat${visibles.length > 1 ? 's' : ''} sur ${lignes.length}` : 'La frise du registre'}</span>
              <div className={r.tri} role="group" aria-label="Ordre">
                <button type="button" aria-pressed={ordre === 'recent'} onClick={() => setOrdre('recent')}>Plus récents en haut</button>
                <button type="button" aria-pressed={ordre === 'registre'} onClick={() => setOrdre('registre')}>Dans l’ordre</button>
              </div>
            </div>
          )}
          {visibles.length === 0 && lignes.length > 0 ? (
            <div className={r.vide}><b>Rien ici</b>Aucun mandat ne correspond à cette recherche.</div>
          ) : (
            <div className={r.frise}>
              {complet && ordre === 'recent' && <Prochain n={prochain} />}
              {complet && ordre === 'registre' && <Depart d={depart} />}
              {groupes.map(g => (
                <Fragment key={g.mois}>
                  <div className={r.mois}><span><em className={r.moisLong}>{g.mois}</em><em className={r.moisCourt}>{g.court}</em></span></div>
                  {g.lignes.map(({ l, i }) => (
                    <LigneR key={l.id} l={l} i={i} obs={parLigne.get(l.id) || []}
                      onObserver={() => setFen({ k: 'observer', l })}
                      onDocument={l.document_id ? () => onNavigate('documents', { ouvrir: l.document_id })
                        : l.signature_id ? () => onNavigate('documents', { ouvrir: 'r-' + l.signature_id }) : undefined}
                      onClient={l.client_id ? () => ficheClient(l.client_id!) : undefined} />
                  ))}
                </Fragment>
              ))}
              {complet && ordre === 'recent' && <Depart d={depart} />}
              {complet && ordre === 'registre' && <Prochain n={prochain} />}
            </div>
          )}
        </>
      )}
      {typeof document !== 'undefined' && fen && createPortal(
        fen.k === 'inscrire'
          ? <FenInscrire prochain={prochain} onFermer={() => setFen(null)} onInscrit={() => { charger(); }} />
          : <FenObserver l={fen.l} onFermer={() => setFen(null)} onFait={() => { setFen(null); charger(); }} />,
        document.body,
      )}
    </div>
  );
}
