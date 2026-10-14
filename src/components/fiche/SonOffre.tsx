'use client';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { signalerEchec, verifie } from '@/lib/ecritures';
import { signalerMaj } from '@/lib/intentions';
import { modele, aujourdhui, type Donnees } from '@/lib/actes';
import { VALIDITE_JOURS, honorairesSurPrix } from '@/lib/actes/offre-achat';
import {
  etatDeOffre, offreCourante, filsParBien, historiqueFil, resumeCrm, lireSuivi, envoisOffre, finOffre, totalContre, totalOffre, prixOffre,
  contreDepassee, rangOffre, rangVisible, ETATS_CRM, type DocOffre, type Ton,
} from '@/lib/offres';
import { colonnesListe, repondreOffre, sansSuiteOffre, supprimerBrouillon, type DocumentRow } from '@/components/documents/outils';
import { FenetreOffre } from '@/components/documents/EnvoiOffre';
import { ChoixJour } from '@/components/pages/PageAgenda';
import { cleDuJour } from '@/lib/suivi-agence';
import { Icone } from './ParcoursBien';
import s from './SuiviAgence.module.css';
import o from './SonOffre.module.css';

/* ═══ « Son offre », sous la visite du bien (V3.189) ═══════════════════════
   Alexandre : « la visite du bien aura un petit bloc son offre, avec la
   fonction déplier, replier », « tout l'historique de la négociation », et
   « que tout soit bien synchronisé ». Le même dessin que « Mon suivi avec
   l'agence » (SuiviAgence.tsx), dans l'onglet Visites et dans Présentés.

   Replié : une ligne — où en est son offre, et le geste du moment.
   Déplié : les montants (son total, ce qui part au vendeur, tes honoraires),
   la contre-proposition s'il y en a une, les gestes, puis l'historique du
   fil, la plus récente en haut.

   Tout se lit au même endroit que l'espace du client (src/lib/offres.ts) :
   les deux ne peuvent pas se contredire. Rien de ce bloc n'est montré au
   client tel quel (ni ses honoraires, ni ta note). */

const EUR = (x: number) => `${Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} €`;
const JOUR = (iso: string) => {
  const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }) : '';
};
const JOURL = (iso: string) => {
  const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }) : '';
};
const dans = (j: number) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(Date.now() + j * 86_400_000));
const TONS: Record<Ton, { c: string; bg: string }> = {
  or: { c: '#8F3F00', bg: '#FFF1E6' }, bleu: { c: '#1F4E8C', bg: '#eaf1fb' }, vert: { c: '#0E6B43', bg: '#E7F6EE' },
  rouge: { c: '#b91c1c', bg: '#fef2f2' }, violet: { c: '#5B21B6', bg: '#f3efff' }, gris: { c: '#475569', bg: '#EEF0F3' },
};
const PUCES: Record<Ton, string> = { or: '#E68B23', bleu: '#22497D', vert: '#15803d', rouge: '#dc2626', violet: '#5B21B6', gris: '#b7c3d4' };

/* « Elle », « Il », « Ils » : la fiche du client. */
export function pronoms(c: { civilite?: string | null; couple?: boolean | null }) {
  if (c.couple) return { il: 'ils', Il: 'Ils', accepte: 'Ils acceptent', pour: 'eux' };
  if (c.civilite === 'Madame') return { il: 'elle', Il: 'Elle', accepte: 'Elle accepte', pour: 'elle' };
  return { il: 'il', Il: 'Il', accepte: 'Il accepte', pour: 'lui' };
}

/* ── Ses offres, bien par bien ──
   Lues une fois pour la liste (Visites, Présentés) : `fil(bienId)` rend le
   fil d'un bien, du plus ancien au plus récent. Une offre arrivée à échéance
   sans réponse remet le bien « Visité » (Alexandre : « s'il n'y a pas de
   réponse, ça repasse en visite effectuée ») : le badge se range ici, à la
   lecture — personne n'a de geste à faire. */
export function useOffres(clientId: string | null | undefined, biens: { id: string; badge_retour?: string | null }[], tick = 0) {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [lu, setLu] = useState(0);
  const ids = biens.map(b => b.id).filter(Boolean).sort().join(',');
  useEffect(() => {
    if (!clientId || !ids) { setDocs([]); return; }
    let vivant = true;
    supabase.from('documents').select('*').eq('modele', 'offre_achat').eq('client_id', clientId).in('bien_id', ids.split(',').slice(0, 300)).neq('statut', 'annule')
      .then(({ data, error }) => {
        if (!vivant) return;
        if (error) { console.error('[offres] lecture', error.message); return; }
        setDocs((data || []) as DocumentRow[]);
      });
    return () => { vivant = false; };
  }, [clientId, ids, tick, lu]);
  const parBien = filsParBien(docs as unknown as DocOffre[]) as unknown as Map<string, DocumentRow[]>;
  /* Arrivée à échéance : le bien redevient « Visité ». */
  useEffect(() => {
    for (const b of biens) {
      if (b.badge_retour !== 'offre_faite') continue;
      const fil = parBien.get(b.id);
      const c = fil ? offreCourante(fil as unknown as DocOffre[]) : null;
      if (c && etatDeOffre(c) === 'echue') {
        void supabase.from('biens').update({ badge_retour: 'visite' }).eq('id', b.id).eq('badge_retour', 'offre_faite')
          .then(({ error }) => { if (error) console.error('[offres] badge du bien', error.message); });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs]);
  const fil = useCallback((bienId: string) => parBien.get(bienId) || [], [parBien]);
  return { fil, recharger: () => setLu(n => n + 1), docs };
}

const CLE = 'offre.ouverts';
const lireOuverts = (): string[] => { try { const v = JSON.parse(sessionStorage.getItem(CLE) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const garder = (id: string, ouvert: boolean) => {
  try { const l = lireOuverts().filter(x => x !== id); sessionStorage.setItem(CLE, JSON.stringify(ouvert ? [...l, id].slice(-40) : l)); } catch { /* sans mémoire */ }
};
function Chevron({ haut }: { haut?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: haut ? 'rotate(180deg)' : undefined, transition: 'transform .2s ease' }}><path d="m6 9 6 6 6-6" /></svg>
  );
}

export default function SonOffre({ fil, bienId, client, seul, onChange, onDocument, onTransaction }: {
  /** Le fil de ce bien (useOffres), du plus ancien au plus récent. */
  fil: DocumentRow[];
  bienId: string;
  client: { id: string; prenom?: string | null; civilite?: string | null; couple?: boolean | null };
  /** Dans « Voir en grand » : déplié d'office. */
  seul?: boolean;
  onChange: () => void;
  /** Ouvre l'offre dans Documents (`editer` : dans l'éditeur). */
  onDocument: (id: string, o?: { editer?: boolean }) => void;
  onTransaction?: () => void;
}) {
  const [ouvert, setOuvert] = useState(!!seul);
  useEffect(() => { if (!seul && lireOuverts().includes(bienId)) setOuvert(true); }, [bienId, seul]);
  const [fen, setFen] = useState<'' | 'envoi' | 'reponse' | 'sans_suite'>('');
  const [en, setEn] = useState('');
  const [message, setMessage] = useState<{ t: string; ok: boolean } | null>(null);
  const [circuit, setCircuit] = useState(false);
  const p = pronoms(client);
  const prenom = (client.prenom || '').trim() || p.Il;

  const docs = fil as unknown as DocOffre[];
  const courant = offreCourante(docs);
  if (!courant) return null;
  const doc = fil.find(x => x.id === courant.id)!;
  const etat = etatDeOffre(courant);
  const ton = ETATS_CRM[etat];
  const d = (doc.donnees || {}) as Donnees;
  const suivi = lireSuivi(d);
  const r = suivi.reponse;
  /* La même numérotation que dans son espace (un brouillon du CRM n'en a pas). */
  const rang = rangVisible(docs, courant);
  const total = totalOffre(d), prix = prixOffre(d);
  const env = envoisOffre(courant);
  const fin = finOffre(d);
  const histo = historiqueFil(docs, { pr: { pour: p.pour, accepte: p.accepte.toLowerCase() } }).reverse();
  const expiree = etat === 'contre' && contreDepassee(r);
  const basculer = () => setOuvert(x => { if (!seul) garder(bienId, !x); return !x; });

  /* « Elle accepte » (la contre-proposition) ou « Nouvelle offre » : un
     brouillon repris de celle-ci, ouvert dans l'éditeur. Il prend la suite
     du fil dès qu'il part en signature (offrePartieEnSignature). */
  async function nouvelle(accepte: boolean) {
    const m = modele('offre_achat');
    if (!m || en) return;
    const totalC = accepte && r?.montant ? totalContre(d, r.montant) : 0;
    if (!window.confirm(accepte && r?.montant
      ? `Préparer son offre au prix du vendeur : ${EUR(r.montant)} pour le vendeur, soit ${EUR(totalC)} pour ${p.pour}, frais d’agence compris ?\n\nElle s’ouvre dans l’éditeur ; tu l’envoies ensuite pour signature. Dans son espace, ${p.il} voit « Nouvelle offre en préparation ».`
      : `Préparer une nouvelle offre, reprise de celle-ci (sans le prix) ?\n\nElle s’ouvre dans l’éditeur ; tu l’envoies ensuite pour signature.`)) return;
    setEn(accepte ? 'accepte' : 'nouvelle'); setMessage(null);
    try {
      const d0: Donnees = { ...d };
      delete d0.suivi;
      let dn: Donnees = { ...d0, date: aujourdhui(), validite: dans(VALIDITE_JOURS), suivi: { origine: 'crm', precedente: doc.id, ...(accepte ? { depuisContre: true } : {}) } };
      dn = accepte && r?.montant
        ? (m.deduire ? m.deduire({ ...dn, prix: r.montant }, 'prix') : { ...dn, prix: r.montant })
        : { ...dn, total: null, prix: null, saisi: 'total', auPrix: null };
      const { data, error } = await supabase.from('documents').insert({
        modele: m.id, categorie: m.categorie, statut: 'brouillon', donnees: dn, ...colonnesListe(m, dn),
        client_id: doc.client_id, bien_id: doc.bien_id, recherche_id: doc.recherche_id,
      }).select('id').single();
      if (error || !data) { signalerEchec('La nouvelle offre', error?.message || 'aucune ligne écrite'); return; }
      onChange();
      onDocument((data as { id: string }).id, { editer: true });
    } finally { setEn(''); }
  }

  async function supprimer() {
    if (en || !window.confirm('Supprimer ce brouillon d’offre ? L’offre d’avant redevient celle du moment.')) return;
    setEn('supprimer'); setMessage(null);
    try {
      await supprimerBrouillon(doc, null);
      onChange();
    } catch (e) {
      setMessage({ t: 'Le brouillon n’a pas pu être supprimé : ' + (e as Error).message, ok: false });
    } finally { setEn(''); }
  }

  async function sansSuite() {
    setEn('sans_suite'); setMessage(null);
    try {
      await sansSuiteOffre(doc.id);
      setFen(''); onChange(); signalerMaj();
      setMessage({ t: 'Notée sans suite. Le bien redevient « Visité » ; rien n’est parti au client.', ok: true });
    } catch (e) {
      setMessage({ t: (e as Error).message, ok: false });
    } finally { setEn(''); }
  }

  /* Le geste du moment, sur la ligne repliée comme dépliée. */
  const principal = (() => {
    switch (etat) {
      case 'a_relire': return { l: 'Relire l’offre', ic: 'crayon', go: () => onDocument(doc.id, { editer: true }) };
      case 'brouillon': return { l: 'Ouvrir le brouillon', ic: 'crayon', go: () => onDocument(doc.id, { editer: true }) };
      case 'a_finaliser': return { l: 'Envoyer pour signature', ic: 'envoyer', go: () => onDocument(doc.id) };
      case 'signee': return doc.signe_chemin ? { l: 'Envoyer à l’agence', ic: 'envoyer', go: () => setFen('envoi') } : { l: 'Ouvrir l’offre', ic: 'doc', go: () => onDocument(doc.id) };
      case 'envoyee': return { l: 'Réponse du vendeur', ic: 'coche', go: () => setFen('reponse') };
      case 'contre': return expiree
        ? { l: 'Nouvelle offre', ic: 'plus', go: () => { void nouvelle(false); } }
        : { l: p.accepte, ic: 'coche', go: () => { void nouvelle(true); } };
      case 'acceptee': return onTransaction ? { l: 'Ouvrir la transaction', ic: 'mallette', go: onTransaction } : null;
      case 'refusee': case 'echue': case 'sans_suite': return { l: 'Nouvelle offre', ic: 'plus', go: () => { void nouvelle(false); } };
      default: return null;
    }
  })();
  const btnPrincipal = principal ? (
    <button type="button" className={s.btnFort} onClick={principal.go} disabled={!!en}>
      <Icone nom={principal.ic} taille={14} epaisseur={2.2} />{en === 'accepte' || en === 'nouvelle' ? 'Préparation…' : principal.l}
    </button>
  ) : null;

  return (
    <div className={`${s.bloc} ${o.bloc}`} data-seul={seul ? 'oui' : undefined} data-ouvert={ouvert ? 'oui' : undefined} data-ton={ton.ton}>
      <div className={s.ligne}>
        <button type="button" className={s.bascule} onClick={basculer} aria-expanded={ouvert}>
          <span className={s.titre}><Icone nom="euro" taille={15} epaisseur={2.1} /><b>Son offre</b></span>
          <span className={s.etat} style={{ color: TONS[ton.ton].c, background: TONS[ton.ton].bg }}>{ton.l}</span>
          {rang > 1 && <span className={o.rang}>{rangOffre(rang - 1)}</span>}
          <span className={s.extrait}>{resumeCrm(courant, Date.now(), { pour: p.pour, accepte: p.accepte.toLowerCase() })}</span>
        </button>
        <span className={s.actions}>
          {!ouvert && btnPrincipal}
          {!seul && <button type="button" className={s.plier} onClick={basculer} aria-expanded={ouvert}>{ouvert ? 'Replier' : 'Déplier'}<Chevron haut={ouvert} /></button>}
        </span>
      </div>

      {ouvert && (
        <div className={s.corps}>
          {/* Les montants, pour toi seul */}
          {total ? (
            <div className={o.montants}>
              <div><span>{`Son total, frais d’agence compris`}</span><b>{EUR(total)}</b></div>
              <div><span>Proposé au vendeur</span><b>{prix ? EUR(prix) : '—'}</b></div>
              <div><span>Tes honoraires</span><b>{EUR(Math.max(0, total - (prix || 0)))}</b></div>
              {fin && <div><span>{'Valable jusqu’au'}</span><b>{JOUR(fin.toISOString())}</b></div>}
            </div>
          ) : null}

          {etat === 'contre' && r?.montant ? (
            <div className={o.contre}>
              <div className={o.contreT}>{`Contre-proposition du ${JOUR(r.le)}${r.limite ? ` · valable jusqu’au ${JOUR(r.limite)}` : ''}`}</div>
              <div className={o.contreV}>
                <span><b>{EUR(r.montant)}</b>{' pour le vendeur'}</span>
                <span>{`soit ${EUR(totalContre(d, r.montant))} pour ${p.pour}, dont ${EUR(totalContre(d, r.montant) - r.montant)} de tes honoraires`}</span>
              </div>
              {expiree && <div className={o.alerte}>{'Sa date limite est passée : la proposition ne tient plus. Une nouvelle offre, ou « Sans suite ».'}</div>}
              {!expiree && <div className={o.aide}>{`${prenom} l’a reçue par e-mail et dans son espace : ${p.il} peut l’accepter, faire une autre offre ou ne pas donner suite. Tu gardes la main ici, s’${p.il} te répond au téléphone.`}</div>}
            </div>
          ) : null}

          {etat === 'en_signature' && (
            <div className={o.aide}>{'Les liens de signature sont partis. Pour l’arrêter (et la noter sans suite), passe par l’offre dans Documents.'}</div>
          )}
          {etat === 'a_relire' && (
            <div className={o.aide}>{`${prenom} l’a préparée dans son espace et te la confie. Relis-la, puis envoie-la pour signature : ${p.il} signe avec son code.`}</div>
          )}
          {(etat === 'envoyee' || (etat === 'echue' && env.length)) && env.length > 0 && (
            <div className={o.aide}>{`Envoyée le ${JOURL(env[env.length - 1].le)} à ${env[env.length - 1].a.join(', ') || 'l’agence'}${env.length > 1 ? ` (${env.length} envois)` : ''}. Une relance t’attend la veille de la fin de validité.`}</div>
          )}
          {etat === 'acceptee' && (
            <div className={o.aide}>{`Acceptée le ${JOURL(r!.le)}. L’onglet Transaction s’est ouvert à l’étape « Offre acceptée », avec la négociation.`}</div>
          )}

          <div className={o.gestes}>
            {btnPrincipal}
            {etat === 'contre' && !expiree && <button type="button" className={s.btn} onClick={() => { void nouvelle(false); }} disabled={!!en}><Icone nom="plus" taille={14} epaisseur={2.2} />Nouvelle offre</button>}
            {etat === 'envoyee' && doc.signe_chemin && <button type="button" className={s.btn} onClick={() => setFen('envoi')}><Icone nom="envoyer" taille={14} epaisseur={2.1} />Renvoyer</button>}
            {(etat === 'contre' || etat === 'echue') && doc.statut === 'signe' && <button type="button" className={s.btn} onClick={() => setFen('reponse')}><Icone nom="crayon" taille={14} epaisseur={2.1} />{etat === 'contre' ? 'Corriger la réponse' : 'Noter une réponse'}</button>}
            {['a_relire', 'signee', 'envoyee', 'contre'].includes(etat) && (
              <button type="button" className={s.btn} onClick={() => setFen('sans_suite')} disabled={!!en}><Icone nom="fermer" taille={13} epaisseur={2.3} />Sans suite</button>
            )}
            {etat === 'brouillon' && (
              <button type="button" className={s.btn} onClick={() => { void supprimer(); }} disabled={!!en}><Icone nom="corbeille" taille={13} epaisseur={2.1} />{en === 'supprimer' ? 'Suppression…' : 'Supprimer le brouillon'}</button>
            )}
            <button type="button" className={s.lien} onClick={() => onDocument(doc.id)}><Icone nom="doc" taille={14} epaisseur={2.1} />{'Voir l’offre'}</button>
            <button type="button" className={o.q} aria-expanded={circuit} onClick={() => setCircuit(x => !x)}><span className={o.qRond}>?</span>Comment ça marche</button>
          </div>
          {circuit && <Circuit p={p} />}
          {message && <div className={message.ok ? o.ok : o.alerte}>{message.t}</div>}

          {histo.length > 0 && (
            <ol className={s.fil}>
              {histo.map((m, i) => (
                <li key={i} className={s.point}>
                  <span className={s.puce} aria-hidden="true" style={{ background: PUCES[m.ton] }} />
                  <div className={s.pointCorps}>
                    <div className={s.pointTete}><span>{JOUR(m.le)}</span></div>
                    <div className={s.texte}>{m.t}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {fen === 'envoi' && (
        <FenetreOffre doc={doc} adresse={(() => { for (let i = fil.length - 1; i >= 0; i--) { const e = envoisOffre(fil[i] as unknown as DocOffre); if (e.length) return e[e.length - 1].a.join(', '); } return ''; })()} onFermer={() => setFen('')}
          onEnvoye={x => { setFen(''); setMessage({ t: x.message, ok: x.ok }); onChange(); signalerMaj(); }} />
      )}
      {fen === 'reponse' && (
        <FenetreReponse doc={doc} client={client} onFermer={() => setFen('')}
          onFait={t => { setFen(''); setMessage({ t, ok: true }); onChange(); signalerMaj(); }} />
      )}
      {fen === 'sans_suite' && typeof document !== 'undefined' && createPortal(
        <div className={s.voile} onClick={e => { if (e.target === e.currentTarget && !en) setFen(''); }}>
          <div className={s.fenetre} role="dialog" aria-modal="true" aria-label="Sans suite" style={{ width: 'min(480px, 100%)' }}>
            <div className={s.fTete}>
              <span className={s.fIc} aria-hidden="true"><Icone nom="fermer" taille={18} epaisseur={2.2} /></span>
              <div style={{ minWidth: 0 }}><h2>Noter sans suite</h2><p>{`L’offre de ${prenom}${total ? ` · ${EUR(total)}` : ''}`}</p></div>
            </div>
            <div className={s.fCorps}>
              <div className={s.aide}>{`L’offre se ferme : le bien redevient « Visité », les relances de cette offre s’arrêtent. Rien ne part au client ; dans son espace, ${p.il} voit « Offre sans suite » et peut en refaire une.`}</div>
            </div>
            <div className={s.fPied}>
              <span className={s.fNote} />
              <button type="button" className={s.btn} onClick={() => setFen('')} disabled={!!en}>Annuler</button>
              <button type="button" className={s.btnFort} onClick={() => { void sansSuite(); }} disabled={!!en}>{en ? 'Enregistrement…' : 'Noter sans suite'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ═══ Le circuit d'une offre, en clair (« Comment ça marche ») ═══ */
function Circuit({ p }: { p: ReturnType<typeof pronoms> }) {
  const pl = p.il === 'ils';
  const v = (un: string, plusieurs: string) => (pl ? plusieurs : un);
  const seul = p.il === 'elle' ? 'seule' : pl ? 'seuls' : 'seul';
  const etapes: [string, string][] = [
    ['Son offre', `${p.Il} ${v('la prépare', 'la préparent')} dans son espace, sur un bien visité (ou toi, dans Documents). ${p.Il} ${v('la signe', 'la signent')} ${seul} avec un code par e-mail, ou ${v('te la confie', 'te la confient')} : relance « Offre à relire », tu la relis dans l’éditeur, puis tu l’envoies pour signature.`],
    ['Signée', 'Le mail « Signé par tous » arrive, et la relance « Offre signée, à envoyer ». « Envoyer à l’agence » joint l’offre signée — tes honoraires n’y figurent pas — avec une copie cachée pour toi. « Renvoyer » si l’agence ne l’a pas reçue.'],
    ['En attente', 'Une relance t’attend la veille de la fin de validité, pour relancer l’agence. Sans réponse à la date : « Arrivée à échéance », le bien redevient « Visité ».'],
    ['La réponse', `« Réponse du vendeur » : acceptée, refusée ou contre-proposition (son prix pour le vendeur ; tes honoraires s’ajoutent une fois). ${p.Il} ${v('reçoit', 'reçoivent')} un seul e-mail par réponse, et la carte « Votre offre » de son espace se met à jour.`],
    ['Contre-proposition', `${p.Il} ${v('l’accepte', 'l’acceptent')} (une nouvelle offre à ce prix, à signer), ${v('en refait une', 'en refont une')}, ou ${v('ne donne', 'ne donnent')} pas suite — depuis son espace, ou toi pour ${p.pour} : « ${p.accepte} », « Nouvelle offre », « Sans suite ».`],
    ['La fin', 'Acceptée : l’onglet Transaction s’ouvre à « Offre acceptée », avec toute la négociation. Refusée ou sans suite : le bien redevient « Visité », la recherche continue, une nouvelle offre reste possible.'],
  ];
  return (
    <ol className={o.circuit}>
      {etapes.map(([t, x], i) => <li key={t}><span className={o.cN}>{i + 1}</span><span><b>{t}</b>{` — ${x}`}</span></li>)}
    </ol>
  );
}

/* ═══ « Réponse du vendeur » ═══════════════════════════════════════════════
   Acceptée, refusée, ou une contre-proposition : le prix POUR LE VENDEUR
   (honoraires de son agence compris ; net vendeur s'il vend seul) — ses
   honoraires à toi s'ajoutent une fois, sur ce prix, jamais en cascade. */
const REPONSES_V = [
  { k: 'acceptee', l: 'Acceptée', ic: 'coche' },
  { k: 'contre', l: 'Contre-proposition', ic: 'remettre' },
  { k: 'refusee', l: 'Refusée', ic: 'fermer' },
] as const;

function FenetreReponse({ doc, client, onFermer, onFait }: {
  doc: DocumentRow; client: { prenom?: string | null; civilite?: string | null; couple?: boolean | null };
  onFermer: () => void; onFait: (message: string) => void;
}) {
  const d = (doc.donnees || {}) as Donnees;
  const avant = lireSuivi(d).reponse;
  const p = pronoms(client);
  const prenom = (client.prenom || '').trim() || 'Le client';
  const [statut, setStatut] = useState<'acceptee' | 'refusee' | 'contre'>(avant?.statut || 'contre');
  const [montant, setMontant] = useState(avant?.montant ? String(avant.montant) : '');
  const [avecLimite, setAvecLimite] = useState(!!avant?.limite);
  const [limite, setLimite] = useState(avant?.limite || dans(3));
  const [note, setNote] = useState(avant?.note || '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !envoi) { e.stopPropagation(); onFermer(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [envoi, onFermer]);

  const m = Number(montant.replace(/[^\d]/g, '')) || 0;
  const total = totalOffre(d), prix = prixOffre(d);
  const hono = m ? honorairesSurPrix(d, m) : 0;
  const titre = [d.adresse, d.ville].filter(x => typeof x === 'string' && x).join(', ');
  const mail = statut === 'acceptee' ? '« 🎉 Félicitations, votre offre est acceptée ! »'
    : statut === 'contre' ? '« Le vendeur a répondu à votre offre », avec sa proposition et les trois choix'
      : '« Réponse du vendeur à votre offre » : non retenue, la recherche continue';

  async function enregistrer() {
    if (envoi) return;
    if (statut === 'contre' && m < 10_000) { setErreur('Le prix de la contre-proposition, pour le vendeur.'); return; }
    setEnvoi(true); setErreur('');
    try {
      const r = await repondreOffre({ id: doc.id, statut, montant: statut === 'contre' ? m : null, limite: statut === 'contre' && avecLimite ? limite : null, note: note.trim() || null });
      const suite = statut === 'acceptee' ? ' La transaction est ouverte à l’étape « Offre acceptée ».' : statut === 'refusee' ? ' Le bien redevient « Visité ».' : '';
      onFait(`Réponse notée. ${prenom} est ${client.civilite === 'Madame' ? 'prévenue' : 'prévenu'} par e-mail.${suite}${r.avertissements.length ? ` ⚠️ ${r.avertissements.join(' · ')}` : ''}`);
    } catch (e) {
      setErreur((e as Error).message);
      setEnvoi(false);
    }
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className={s.voile} onClick={e => { if (e.target === e.currentTarget && !envoi) onFermer(); }}>
      <div className={s.fenetre} role="dialog" aria-modal="true" aria-label="Réponse du vendeur">
        <div className={s.fTete}>
          <span className={s.fIc} aria-hidden="true"><Icone nom="euro" taille={19} epaisseur={2} /></span>
          <div style={{ minWidth: 0 }}>
            <h2>Réponse du vendeur</h2>
            <p>{[titre, total ? `son offre : ${EUR(total)}` : ''].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" className={s.fFermer} onClick={onFermer} aria-label="Fermer" disabled={envoi}><Icone nom="fermer" taille={16} epaisseur={2.4} /></button>
        </div>
        <div className={s.fCorps}>
          <section className={s.section}>
            <div className={s.lib}><Icone nom="coche" taille={14} epaisseur={2.2} />Le vendeur</div>
            <div className={s.pastilles}>
              {REPONSES_V.map(x => (
                <button key={x.k} type="button" className={s.pastille} aria-pressed={statut === x.k} data-ton={x.k === 'acceptee' ? 'disponible' : x.k === 'refusee' ? 'vendu' : undefined}
                  onClick={() => { setStatut(x.k); setErreur(''); }}>
                  <Icone nom={x.ic} taille={15} epaisseur={2.1} />{x.l}
                </button>
              ))}
            </div>
          </section>

          {statut === 'contre' && (
            <section className={s.section}>
              <div className={s.lib}><Icone nom="euro" taille={14} epaisseur={2.2} />Son prix</div>
              <div className={s.grille}>
                <label className={s.champ}><span>Pour le vendeur</span>
                  <input inputMode="numeric" autoFocus value={montant ? Number(montant.replace(/[^\d]/g, '')).toLocaleString('fr-FR') : ''}
                    onChange={e => { setMontant(e.target.value.replace(/[^\d]/g, '').slice(0, 9)); setErreur(''); }} placeholder="Ex. : 488 000" /></label>
                <div className={o.calc}>
                  <span>{`Pour ${p.pour}, frais d’agence compris`}</span>
                  <b>{m >= 10_000 ? EUR(m + hono) : '—'}</b>
                  <small>{m >= 10_000 ? (hono ? `dont ${EUR(hono)} de tes honoraires, une seule fois` : 'sans honoraires de recherche') : 'tape son prix'}</small>
                </div>
              </div>
              <div className={s.aide}>{`Le prix que l’agence annonce, ses honoraires à elle compris (net vendeur si le propriétaire vend seul). Tes honoraires s’ajoutent une fois, sur ce prix.${prix ? ` Son offre partait à ${EUR(prix)} pour le vendeur.` : ''}`}</div>
              <label className={s.coche}><input type="checkbox" checked={avecLimite} onChange={e => setAvecLimite(e.target.checked)} />{'Sa proposition a une date limite'}</label>
              {avecLimite && <ChoixJour date={limite} onDate={setLimite} min={cleDuJour()} etiquette="Valable jusqu’au" />}
            </section>
          )}

          <section className={s.section}>
            <label className={s.lib} htmlFor="rep-note"><Icone nom="note" taille={14} epaisseur={2.2} />Pour toi (facultatif)</label>
            <textarea id="rep-note" className={s.zone} rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={500}
              placeholder="Ce que l’agence a dit, la marge restante…" />
          </section>
          <div className={o.mail}><Icone nom="mail" taille={15} epaisseur={2.1} /><span>{`${prenom} reçoit un e-mail : ${mail}. Dans son espace, sa carte « Votre offre » se met à jour.${statut === 'acceptee' ? ' L’onglet Transaction s’ouvre à l’étape « Offre acceptée ».' : ''}`}</span></div>
          {avant && <div className={s.aide}>{'Une réponse était déjà notée : elle est remplacée, et un nouvel e-mail part.'}</div>}
          {erreur && <div className={o.alerte}>{erreur}</div>}
        </div>
        <div className={s.fPied}>
          <span className={s.fNote}><Icone nom="cadenas" taille={14} epaisseur={2.1} />{'Ta note reste interne.'}</span>
          <button type="button" className={s.btn} onClick={onFermer} disabled={envoi}>Annuler</button>
          <button type="button" className={s.btnFort} onClick={() => { void enregistrer(); }} disabled={envoi || (statut === 'contre' && m < 10_000)}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
