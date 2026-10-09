'use client';
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { IDENTITE_DEFAUT, type IdentiteAgence } from '@/lib/agence';
import { STATUTS, modele, pdfDocument, electronique, modeSignature, surPlaceSansCode, versEtape, type Champ, type Donnees, type Etape, type Repere } from '@/lib/actes';
import ApercuActe, { Croix, Ic } from './ApercuActe';
import FenetreConfirmer from './FenetreConfirmer';
import { ChampActe, ContexteActe, manquesEtape } from './ChampsActe';
import FilEtapes from './FilEtapes';
import { chercherQuestion, type Cible } from './versQuestion';
import { FenetreProjet, dernierEnvoi } from './EnvoiProjet';
import { lireDepart, prochainNumero, type Depart } from '@/lib/registre';
import {
  SIGNATURE_OUVERTE, appelSignature, colonnesListe, finaliser, identiteDuJour, lienFichier, ligneRegistreDe, montrerPdf, nomFichier, quand, signatureOuverte,
  supprimerBrouillon, tableSignaturesAbsente, type DocumentRow,
} from './outils';
import s from './Documents.module.css';
import b from '@/components/biens/Biens.module.css';

/* ═══ L'éditeur d'un document ═════════════════════════════════════════════
   Plein écran. À gauche les questions, étape par étape ; à droite le
   document tel qu'il sera imprimé, qui se réécrit à chaque réponse. Au
   téléphone, deux onglets : Questions / Aperçu.

   Tout s'enregistre seul, 0,8 s après la dernière frappe. « Finaliser »
   vérifie ce qui manque, fige le PDF avec l'identité de l'agence du jour,
   et passe le document « À faire signer ». Un document finalisé ne se
   modifie plus : on le repasse en brouillon (tant qu'il n'est pas signé).

   V3.46 : un clic sur un passage de l'aperçu ouvre la question qui l'a
   écrit (versQuestion.ts) ; une barre entre les deux colonnes se tire pour
   donner plus de place à l'une ou à l'autre ; l'aperçu se masque (les
   questions prennent toute la largeur, et la saisie va plus vite : le
   texte n'est plus réécrit à chaque frappe). Les deux réglages sont
   retenus dans ce navigateur. */

/* La part des questions dans la largeur, quand l'aperçu est là. */
const PART_DEFAUT = 0.5;
/* Chaque colonne garde au moins 340 px (la barre en prend 12). */
function bornesPart(largeur: number): [number, number] {
  const l = Math.max(largeur, 1);
  return [Math.max(0.22, 346 / l), Math.min(0.8, 1 - 346 / l)];
}

type Enreg = 'ok' | 'attente' | 'encours' | { erreur: string };

/* Le registre des mandats démarré (V3.18) : le numéro n'est plus à saisir,
   la finalisation le prend dans le registre. La question devient un encadré
   qui le dit. */
type EtatRegistre = { depart: Depart; prochain: number; ligne: number | null };
function champNumeroRegistre(reg: EtatRegistre): Champ {
  return {
    t: 'guide', cle: 'g-numero',
    titre: () => (reg.ligne ? `N° ${reg.ligne} au registre des mandats` : 'Le n° du registre : donné en finalisant'),
    points: d => (reg.ligne
      ? [{ ic: 'livre', x: 'Ce mandat est déjà inscrit au registre : il garde son numéro, même finalisé à nouveau.' }]
      : [
        { ic: 'livre', x: `Le registre le donnera au moment de finaliser, avant toute signature : ce sera le ${reg.prochain}, sauf si un autre mandat est finalisé avant.` },
        ...(typeof d.numero === 'string' && d.numero.trim() ? [{ ic: 'info', x: `Le numéro saisi auparavant (${d.numero.trim()}) sera remplacé.` }] : []),
      ]),
  };
}

/* Les questions d'une étape, en blocs : un bloc par titre (V3.18, comme
   l'éditeur des biens). Un titre masqué ne coupe pas : ses questions restent
   sous le titre d'avant. */
type Groupe = { titre: Extract<Champ, { t: 'titre' }> | null; champs: Champ[] };
function groupes(champs: Champ[], d: Donnees): Groupe[] {
  const out: Groupe[] = [];
  for (const c of champs) {
    if (c.t === 'titre') { if (!c.si || c.si(d)) out.push({ titre: c, champs: [] }); continue; }
    if (!out.length) out.push({ titre: null, champs: [] });
    out[out.length - 1].champs.push(c);
  }
  const vu = (c: Champ) => !c.si || c.si(d);
  return out.filter(g => g.champs.some(vu));
}

/* Une étape : son en-tête (dessin, « Étape 3 sur 8 », la jauge), puis ses
   blocs de questions, chaque question dans sa carte ; les repères suivent la
   question qu'ils commentent. `anime` : en « étape par étape », elle glisse
   en place. */
function BlocEtape({ e, i, n, d, maj, off, reperes, anime = false }: {
  e: Etape; i: number; n: number; d: Donnees; maj: (cle: string, v: unknown) => void; off: boolean; reperes: Repere[]; anime?: boolean;
}) {
  const gs = groupes(e.champs, d);
  const placees = gs.some(g => g.champs.some(c => c.cle === e.reperesApres));
  return (
    <section className={`${s.etape} ${b.etape} ${anime ? b.etapeEntre : ''}`} data-etape={e.id}>
      <div className={s.etapeTete}>
        <span className={`${s.etapeIc} ${b.etapeIcVif}`}>{e.ic ? <Ic n={e.ic} t={22} /> : i + 1}</span>
        <div className={b.etapeTeteTxt}>
          <div className={s.etapeN}>{`Étape ${i + 1} sur ${n}`}</div>
          <h2 className={s.etapeT}>{e.titre}</h2>
          <p className={s.etapeS}>{e.sous}</p>
          {anime && <span className={b.etapeJauge} aria-hidden="true"><i style={{ width: `${Math.round(((i + 1) / n) * 100)}%` }} /></span>}
        </div>
      </div>
      {gs.map((g, k) => (
        <div key={g.titre?.cle || `g${k}`} className={b.sect}>
          {g.titre && (
            <div className={b.sectT}>
              <span className={b.sectIc}><Ic n={g.titre.ic || 'plus'} t={16} /></span>
              <div><b>{g.titre.lib}</b>{g.titre.aide && <small>{g.titre.aide}</small>}</div>
            </div>
          )}
          <div className={s.grille}>
            {g.champs.map(c => (
              <Fragment key={c.cle}>
                <ChampActe c={c} d={d} maj={maj} off={off} bloc sansLib={(c.t === 'personnes' || c.t === 'groupes') && !!g.titre && g.titre.lib === c.lib} />
                {c.cle === e.reperesApres && <Reperes l={reperes} />}
              </Fragment>
            ))}
          </div>
        </div>
      ))}
      {!placees && <Reperes l={reperes} />}
    </section>
  );
}

/* Les repères d'une étape : le calcul, et ce qui mérite un second regard. */
function Reperes({ l }: { l: Repere[] }) {
  if (!l.length) return null;
  return (
    <div className={`${s.reperes} ${s.large}`} aria-label="Repères">
      {l.map((r, i) => (
        <div key={i} className={`${s.repere} ${r.ton === 'alerte' ? s.repereAlerte : r.ton === 'ok' ? s.repereOk : ''}`}>
          <span>{r.l}</span><b>{r.v}</b>
        </div>
      ))}
    </div>
  );
}

export default function EditeurDocument({ doc, onFermer, onMaj, onFinalise, retourLib, onSupprime }: {
  doc: DocumentRow;
  onFermer: () => void;
  onMaj: (d: DocumentRow) => void;
  /* Finalisé pour une signature en ligne ou sur place : la fiche du
     document prend le relais (envoyer les liens, signer sur place). */
  onFinalise?: (d: DocumentRow) => void;
  /* V3.157 : le bouton retour dit d'où l'on vient (« Visites ») ;
     « Documents » sinon. */
  retourLib?: string;
  /* V3.157 : le brouillon supprimé depuis l'éditeur — il se ferme. */
  onSupprime?: (id: string) => void | Promise<void>;
}) {
  const m = modele(doc.modele);
  const [row, setRow] = useState<DocumentRow>(doc);
  /* V3.145 : ce qui se déduit des réponses (Modele.deduire), dès l'ouverture —
     une offre d'avant n'avait que son prix, son total s'en déduit. */
  const [d, setD] = useState<Donnees>(() => {
    const x = { ...(doc.donnees || {}) };
    return m?.deduire ? m.deduire(x, '') : x;
  });
  const [etape, setEtape] = useState(0);
  const [vue, setVue] = useState<'form' | 'apercu'>('form');
  /* Étape par étape, ou tout sur une page : le choix est retenu (dans ce
     navigateur) d'un document à l'autre. */
  const [mode, setMode] = useState<'etapes' | 'tout'>(() => {
    try { return localStorage.getItem('documents.mode') === 'tout' ? 'tout' : 'etapes'; } catch { return 'etapes'; }
  });
  const choisirMode = (x: 'etapes' | 'tout') => {
    setMode(x);
    try { localStorage.setItem('documents.mode', x); } catch { /* sans mémoire, tant pis */ }
  };
  const [enreg, setEnreg] = useState<Enreg>('ok');
  const [identite, setIdentite] = useState<IdentiteAgence>(doc.identite || IDENTITE_DEFAUT);
  const [erreurIdentite, setErreurIdentite] = useState('');
  const [fin, setFin] = useState(false);
  /* « Envoyer ce projet » (V3.40) : le brouillon part en relecture. */
  const [projet, setProjet] = useState(false);
  const [travail, setTravail] = useState('');
  const [message, setMessage] = useState<{ t: string; ok: boolean } | null>(null);
  /* V3.55 : un brouillon resté avec une signature en ligne ouverte (repassé
     en brouillon depuis une page pas à jour, avant la V3.55) : on le dit, et
     on propose de l'arrêter avant de finaliser. */
  const [ancienneSignature, setAncienneSignature] = useState(doc.statut === 'brouillon' && !!doc.signature);
  /* V3.61 : avant de le repasser en brouillon, la fenêtre qui dit ce qui va
     se passer (FenetreConfirmer). */
  const [fenModif, setFenModif] = useState(false);
  /* V3.157 — Alexandre : « directement depuis le document, le bouton
     Supprimer le brouillon : ça supprime, et ça se ferme ». La même
     fenêtre que depuis sa fiche (le n° du registre lu avant de l'ouvrir). */
  const [fenSuppr, setFenSuppr] = useState<{ ligne: number | null } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const apercuRef = useRef<HTMLDivElement>(null);
  const corpsRef = useRef<HTMLDivElement>(null);
  const off = row.statut !== 'brouillon';
  /* V3.157 : ce que les questions peuvent savoir du document (son client). */
  const contexteActe = useMemo(() => ({ clientId: row.client_id || null }), [row.client_id]);

  /* ── La largeur des deux colonnes, et l'aperçu masqué (V3.46) ── */
  const [part, setPart] = useState<number>(() => {
    try { const x = Number(localStorage.getItem('documents.partage')); return x >= 0.2 && x <= 0.8 ? x : PART_DEFAUT; } catch { return PART_DEFAUT; }
  });
  const [cache, setCache] = useState<boolean>(() => {
    try { return localStorage.getItem('documents.apercu') === 'cache'; } catch { return false; }
  });
  const garderPart = (x: number) => {
    setPart(x);
    try { localStorage.setItem('documents.partage', x.toFixed(3)); } catch { /* sans mémoire, tant pis */ }
  };
  const montrerApercu = (oui: boolean) => {
    setCache(!oui);
    try { localStorage.setItem('documents.apercu', oui ? 'montre' : 'cache'); } catch { /* sans mémoire, tant pis */ }
  };
  /* Au téléphone, l'onglet « Aperçu » le montre toujours. */
  const voirApercu = !cache || vue === 'apercu';
  /* Après un clic dans l'aperçu, il ne doit pas se déplacer tout seul
     pendant que les questions défilent jusqu'à la bonne. */
  const calme = useRef(0);

  /* Le registre des mandats (V3.18) : démarré, il donne le numéro. */
  /* `regLu` : l'état du registre est connu (démarré ou non) ; tant qu'il ne
     l'est pas, ou s'il n'a pas pu être lu, un mandat ne se finalise pas —
     sinon il prendrait un numéro hors du registre. Relu à chaque retour en
     brouillon (« Modifier » un mandat finalisé). */
  const [reg, setReg] = useState<EtatRegistre | null>(null);
  /* L'état lu vaut pour ce document dans cet état-là (`cle`) : repassé en
     brouillon, il est à relire. */
  const cleReg = `${row.id}:${row.statut}`;
  const [regLu, setRegLu] = useState<{ cle: string; ok: boolean; erreur?: string }>({ cle: '', ok: false });
  const regPret = !m?.registre || row.statut !== 'brouillon' || (regLu.cle === cleReg && regLu.ok);
  useEffect(() => {
    if (!m?.registre || row.statut !== 'brouillon') return;
    let vivant = true;
    (async () => {
      const { depart, erreur } = await lireDepart(supabase);
      if (!vivant) return;
      if (erreur) { setReg(null); setRegLu({ cle: cleReg, ok: false, erreur }); return; }
      if (!depart) { setReg(null); setRegLu({ cle: cleReg, ok: true }); return; }
      const [prochain, l] = await Promise.all([
        prochainNumero(supabase, depart),
        supabase.from('registre_mandats').select('numero').eq('document_id', row.id).order('numero').limit(1).maybeSingle(),
      ]);
      if (!vivant) return;
      if (l.error) { setRegLu({ cle: cleReg, ok: false, erreur: l.error.message }); return; }
      setReg({ depart, prochain, ligne: l.data ? Number((l.data as { numero: number }).numero) : null });
      setRegLu({ cle: cleReg, ok: true });
    })();
    return () => { vivant = false; };
  }, [m, row.id, row.statut, cleReg]);

  /* L'identité de l'agence du jour, pour l'aperçu. Un document figé garde
     la sienne. */
  useEffect(() => {
    if (doc.identite && doc.statut !== 'brouillon') return;
    identiteDuJour().then(setIdentite).catch(e => setErreurIdentite((e as Error).message));
  }, [doc.identite, doc.statut]);

  /* ── L'enregistrement automatique ── */
  const dernier = useRef<Donnees>(d);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVol = useRef<Promise<boolean> | null>(null);
  const aEnregistrer = useRef(false);
  /* La raison du dernier enregistrement raté (V3.50 : la finalisation la dit). */
  const erreurEnreg = useRef('');

  const enregistrer = useCallback(async (): Promise<boolean> => {
    if (!m) return false;
    if (enVol.current) await enVol.current;
    if (!aEnregistrer.current) return true;
    aEnregistrer.current = false;
    const donnees = dernier.current;
    setEnreg('encours');
    const p = (async () => {
      const { data, error } = await supabase.from('documents').update({
        donnees, ...colonnesListe(m, donnees), updated_at: new Date().toISOString(),
      }).eq('id', row.id).eq('statut', 'brouillon').select().maybeSingle();
      if (error || !data) {
        aEnregistrer.current = true;
        erreurEnreg.current = error ? error.message : 'Le document n’est plus un brouillon : il a été finalisé ou envoyé ailleurs. Recharge la page.';
        setEnreg({ erreur: erreurEnreg.current });
        return false;
      }
      setRow(data as DocumentRow);
      onMaj(data as DocumentRow);
      setEnreg(aEnregistrer.current ? 'attente' : 'ok');
      return true;
    })();
    enVol.current = p;
    const ok = await p;
    enVol.current = null;
    return ok;
  }, [m, row.id, onMaj]);

  const maj = useCallback((cle: string, v: unknown) => {
    if (off) return;
    setD(prev => {
      let n: Donnees = { ...prev, [cle]: v };
      if (m?.deduire) n = m.deduire(n, cle);
      dernier.current = n;
      return n;
    });
    aEnregistrer.current = true;
    setEnreg('attente');
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => { enregistrer(); }, 800);
  }, [off, enregistrer, m]);

  /* Quitter la page avec une saisie pas encore partie : le navigateur prévient. */
  useEffect(() => {
    const avant = (e: BeforeUnloadEvent) => { if (aEnregistrer.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', avant);
    return () => window.removeEventListener('beforeunload', avant);
  }, []);
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);

  async function fermer() {
    if (minuterie.current) clearTimeout(minuterie.current);
    if (aEnregistrer.current) {
      const ok = await enregistrer();
      if (!ok && !confirm('La dernière modification n’a pas pu être enregistrée.\n\nFermer quand même ?')) return;
    }
    onFermer();
  }

  /* V3.157 : supprimer le brouillon depuis l'éditeur (outils.ts, comme sa fiche). */
  async function demanderSuppression() {
    try { setFenSuppr({ ligne: await ligneRegistreDe(row) }); }
    catch (e) { setMessage({ t: (e as Error).message, ok: false }); }
  }
  async function supprimer(ligne: number | null) {
    setFenSuppr(null);
    /* Plus rien à enregistrer : il part. */
    if (minuterie.current) clearTimeout(minuterie.current);
    aEnregistrer.current = false;
    setTravail('supprimer');
    try {
      await supprimerBrouillon(row, ligne);
      await onSupprime?.(row.id);
    } catch (e) {
      setMessage({ t: 'La suppression a échoué : ' + (e as Error).message, ok: false });
      setTravail('');
    }
  }

  /* ── Le texte, recalculé à chaque réponse (sans ralentir la frappe) ── */
  const dd = useDeferredValue(d);
  const rendu = useMemo(() => {
    if (!m || !voirApercu) return null;
    try {
      return { parties: m.rediger(dd, identite), garde: m.garde(dd), pour: m.pour(dd), resume: m.resume(dd), erreur: '' };
    } catch (e) {
      return { parties: [], garde: m.garde({}), pour: '', resume: [], erreur: (e as Error).message };
    }
  }, [m, dd, identite, voirApercu]);

  /* L'aperçu suit l'étape : il montre la rubrique dont on parle. */
  /* Les étapes telles qu'on les montre (le numéro remplacé quand le
     registre le donne), et les réponses telles qu'on les contrôle (le
     numéro compté comme présent). */
  const etapes = useMemo(() => (!m ? [] : !reg ? m.etapes
    : m.etapes.map(e => ({ ...e, champs: e.champs.map(c => (c.cle === 'numero' ? champNumeroRegistre(reg) : c)) }))), [m, reg]);
  const dm = useMemo<Donnees>(() => (reg ? { ...d, numero: String(reg.ligne ?? reg.prochain) } : d), [reg, d]);
  const vers = versEtape(etapes[etape], dm);
  useEffect(() => {
    const zone = apercuRef.current;
    if (!zone || Date.now() < calme.current) return;
    /* La première étape montre la page de garde : c'est le haut du document. */
    if (etape === 0 || !vers) { zone.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const t = setTimeout(() => {
      const cible = zone.querySelector<HTMLElement>(`[data-sec="${vers.replace(/"/g, '\\"')}"]`);
      if (!cible) return;
      /* Sur l'ordinateur, l'en-tête de l'aperçu reste collé en haut : la
         rubrique s'arrête juste dessous. */
      const tete = zone.querySelector<HTMLElement>(`.${s.edApercuT}`);
      const dessous = tete && getComputedStyle(tete).position === 'sticky' ? tete.offsetHeight : 0;
      const haut = cible.getBoundingClientRect().top - zone.getBoundingClientRect().top + zone.scrollTop - 16 - dessous;
      zone.scrollTo({ top: Math.max(0, haut), behavior: 'smooth' });
    }, 60);
    return () => clearTimeout(t);
  }, [vers, vue, etape, cache]);

  const manquesParEtape = useMemo(() => etapes.map(e => manquesEtape(e.champs, dm)), [etapes, dm]);
  const reperesParEtape: Repere[][] = useMemo(() => (m ? etapes.map(e => (m.reperes ? m.reperes(dm, e.id) : [])) : []), [m, etapes, dm]);

  /* Tout sur une page : l'étape « en cours » est celle qu'on lit — le fil
     d'étapes et l'aperçu la suivent pendant qu'on fait défiler. */
  const suivreDefilement = useCallback(() => {
    if (mode !== 'tout' || !formRef.current) return;
    const zone = formRef.current;
    const haut = zone.getBoundingClientRect().top + 140;
    const blocs = Array.from(zone.querySelectorAll<HTMLElement>('[data-etape]'));
    let i = 0;
    blocs.forEach((b, k) => { if (b.getBoundingClientRect().top <= haut) i = k; });
    if (zone.scrollTop + zone.clientHeight >= zone.scrollHeight - 4) i = blocs.length - 1;
    setEtape(i);
  }, [mode]);

  if (!m) {
    return (
      <div className={s.ed}>
        <div className={s.edBarre}>
          <button type="button" className={s.edRetour} onClick={onFermer}><Ic n="retour" t={16} /><span>{retourLib || 'Documents'}</span></button>
        </div>
        <div className={s.edForm}><div className={s.erreur}>{`Modèle inconnu : « ${doc.modele} ». Ce document ne peut pas être ouvert ici.`}</div></div>
      </div>
    );
  }

  const aller = (i: number) => {
    const k = Math.max(0, Math.min(etapes.length - 1, i));
    setEtape(k);
    setVue('form');
    if (mode === 'tout') {
      requestAnimationFrame(() => {
        const zone = formRef.current;
        const b = zone?.querySelector<HTMLElement>(`[data-etape="${etapes[k].id}"]`);
        if (zone && b) zone.scrollTo({ top: b.getBoundingClientRect().top - zone.getBoundingClientRect().top + zone.scrollTop - 12, behavior: 'smooth' });
      });
    } else formRef.current?.scrollTo({ top: 0 });
  };

  /* ── De l'aperçu à la question (V3.46) ──
     L'étape s'ouvre, les questions défilent jusqu'à la bonne, qui
     s'allume un instant ; à la souris, le curseur s'y pose. */
  const viser = (c: Cible) => {
    const k = Math.max(0, Math.min(etapes.length - 1, c.etape));
    calme.current = Date.now() + 1600;
    setEtape(k);
    setVue('form');
    const id = etapes[k].id;
    let essais = 0;
    const chercher = () => {
      const zone = formRef.current;
      const bloc = zone?.querySelector<HTMLElement>(`[data-etape="${id}"]`);
      if (!zone || !bloc) { if (essais++ < 8) requestAnimationFrame(chercher); return; }
      const champ = c.cle ? bloc.querySelector<HTMLElement>(`[data-cle="${c.cle}"]`) : null;
      /* La saisie exacte : la case d'une personne, d'un lot, ou le champ seul. */
      let saisie: HTMLElement | null = null;
      if (champ && c.sous) {
        saisie = document.getElementById(`${c.cle}-${c.sous.i}-${c.sous.k}`);
        if (!saisie) {
          /* Un lot : sa ligne, puis la case de la colonne. */
          const def = etapes[k].champs.find(x => x.cle === c.cle);
          const col = def && def.t === 'lignes' ? def.colonnes.findIndex(x => x.cle === c.sous!.k) : -1;
          const lot = champ.querySelectorAll<HTMLElement>(`.${s.lot}`)[c.sous.i];
          saisie = (lot && col >= 0 ? lot.querySelectorAll<HTMLInputElement>('input')[col] : null) || null;
        }
      } else if (champ && c.cle) saisie = document.getElementById(`ch-${c.cle}`);
      /* Ce qu'on montre : la carte de la personne ou le lot, sinon la question. */
      const cadre = (saisie?.closest<HTMLElement>(`.${s.perso}, .${s.lot}`)) || champ || bloc;
      const marge = champ ? Math.min(140, zone.clientHeight * 0.22) : 12;
      const haut = cadre.getBoundingClientRect().top - zone.getBoundingClientRect().top + zone.scrollTop - marge;
      zone.scrollTo({ top: Math.max(0, haut), behavior: 'smooth' });
      if (champ || cadre !== bloc) {
        cadre.classList.remove(s.vise);
        void cadre.offsetWidth;
        cadre.classList.add(s.vise);
        setTimeout(() => cadre.classList.remove(s.vise), 1900);
      }
      if (saisie && !off && window.matchMedia('(pointer: fine)').matches) {
        (saisie as HTMLInputElement).focus({ preventScroll: true });
      }
    };
    requestAnimationFrame(chercher);
  };
  const rubriques = rendu ? rendu.parties.flatMap(p => p.sections.map(x => x.titre || '')) : [];
  const cliquerApercu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !rendu) return;
    /* Un mot sélectionné à la souris : on lit, on ne part pas. */
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return;
    const el = e.target as HTMLElement;
    if (el.closest('button, a, input, textarea')) return;
    const bloc = el.closest<HTMLElement>('[data-bloc]');
    if (!bloc) return;
    /* Le texte du passage, ses morceaux séparés (un résumé, une fiche). */
    const morceaux: string[] = [];
    const parcours = document.createTreeWalker(bloc, NodeFilter.SHOW_TEXT);
    for (let n = parcours.nextNode(); n; n = parcours.nextNode()) if (n.textContent?.trim()) morceaux.push(n.textContent);
    const sec = bloc.closest<HTMLElement>('[data-si]');
    const ou = sec ? Number(sec.dataset.si) : -1;
    viser(chercherQuestion(etapes, dm, morceaux.join(' '), rubriques, Number.isFinite(ou) ? ou : -1, bloc.dataset.titre));
  };

  /* ── La barre entre les deux colonnes ── */
  const tirerBarre = (e: React.PointerEvent<HTMLDivElement>) => {
    const corps = corpsRef.current;
    if (!corps || e.button !== 0) return;
    e.preventDefault();
    const barre = e.currentTarget;
    barre.setPointerCapture(e.pointerId);
    const r = corps.getBoundingClientRect();
    const [min, max] = bornesPart(r.width);
    let x = part;
    corps.dataset.tire = '1';
    const bouger = (ev: PointerEvent) => {
      x = Math.max(min, Math.min(max, (ev.clientX - r.left) / r.width));
      corps.style.setProperty('--part', `${(x * 100).toFixed(2)}%`);
    };
    const finir = () => {
      barre.removeEventListener('pointermove', bouger);
      barre.removeEventListener('pointerup', finir);
      barre.removeEventListener('pointercancel', finir);
      delete corps.dataset.tire;
      garderPart(x);
    };
    barre.addEventListener('pointermove', bouger);
    barre.addEventListener('pointerup', finir);
    barre.addEventListener('pointercancel', finir);
  };
  const toucheBarre = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const [min, max] = bornesPart(corpsRef.current?.getBoundingClientRect().width || 1200);
    const pas = e.shiftKey ? 0.1 : 0.04;
    const x = e.key === 'ArrowLeft' ? part - pas : e.key === 'ArrowRight' ? part + pas : e.key === 'Home' ? min : e.key === 'End' ? max : null;
    if (x === null) return;
    e.preventDefault();
    garderPart(Math.max(min, Math.min(max, x)));
  };

  /* ── Les actions ── */
  async function apercuPdf() {
    const onglet = window.open('', '_blank');
    setTravail('apercu');
    try {
      if (row.statut !== 'brouillon' && row.pdf_chemin) {
        const url = await lienFichier(row.pdf_chemin);
        if (onglet) onglet.location.href = url; else window.location.href = url;
      } else {
        montrerPdf(onglet, await pdfDocument(m!, d, identite, { projet: true }));
      }
    } catch (e) {
      onglet?.close();
      setMessage({ t: 'Le PDF n’a pas pu être préparé : ' + (e as Error).message, ok: false });
    }
    setTravail('');
  }

  async function lancerFinalisation() {
    /* Signé en ligne ou sur place : pas de PDF à imprimer, la fiche du
       document s'ouvre sur l'envoi des liens (ou la signature sur place). */
    if (!regPret) {
      setMessage({ t: regLu.cle === cleReg && regLu.erreur ? `Le registre des mandats n’a pas pu être lu (${regLu.erreur}) : réessaie dans un instant.` : 'Le registre des mandats se lit encore : réessaie dans un instant.', ok: false });
      return;
    }
    const elec = electronique(d) && !!onFinalise;
    const onglet = elec ? null : window.open('', '_blank');
    setTravail('finaliser');
    setMessage(null);
    try {
      /* V3.50 : la dernière saisie d'abord (et celle en cours d'envoi) ; si
         elle ne passe pas, on ne finalise pas (avant, on finalisait quand
         même, par-dessus un document parfois déjà parti en signature). */
      if (minuterie.current) clearTimeout(minuterie.current);
      if (!(await enregistrer())) {
        const pourquoi = erreurEnreg.current || 'la dernière modification n’a pas pu être enregistrée.';
        throw new Error(`Le document n’est pas finalisé : ${pourquoi.charAt(0).toLowerCase()}${pourquoi.slice(1)}`);
      }
      const r = await finaliser(row, m!, d, { registre: !!reg });
      setRow(r); onMaj(r);
      /* Le numéro donné par le registre est dans le document : l'écran le montre. */
      if (r.donnees) { dernier.current = r.donnees; setD(r.donnees); }
      if (r.identite) setIdentite(r.identite);
      setFin(false);
      if (elec) { setTravail(''); onFinalise!(r); return; }
      setMessage({ t: m?.courrier ? 'Courrier finalisé : le PDF est prêt à signer et à envoyer.' : 'Document finalisé : le PDF est prêt à imprimer et à faire signer.', ok: true });
      const url = await lienFichier(r.pdf_chemin || '', nomFichier(r));
      if (onglet) onglet.location.href = url; else window.location.href = url;
    } catch (e) {
      onglet?.close();
      if ((e as Error).message === SIGNATURE_OUVERTE) {
        /* L'encadré du haut le dit, avec son bouton. */
        setAncienneSignature(true); setFin(false);
        formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      } else setMessage({ t: (e as Error).message, ok: false });
    }
    setTravail('');
  }

  /* V3.55 : l'ancienne signature restée ouverte sur un brouillon se ferme
     (le serveur l'accepte sur un brouillon), puis on peut finaliser. */
  async function arreterAncienneSignature() {
    if (!confirm('Arrêter l’ancienne signature en ligne ?\n\nSes liens ne fonctionneront plus, et les signatures déjà faites ne comptent plus. Personne n’est prévenu par e-mail : si quelqu’un a déjà signé, dis-le-lui.')) return;
    setTravail('ancienne'); setMessage(null);
    try {
      await appelSignature({ action: 'annuler', id: row.id });
      const { data, error } = await supabase.from('documents').select('*').eq('id', row.id).maybeSingle();
      if (error) throw new Error('La signature est arrêtée, mais le document n’a pas pu être relu : ' + error.message);
      if (data) { setRow(data as DocumentRow); onMaj(data as DocumentRow); }
      setAncienneSignature(false);
      setMessage({ t: 'Ancienne signature arrêtée : ses liens ne fonctionnent plus. Tu peux finaliser.', ok: true });
    } catch (e) {
      setMessage({ t: (e as Error).message, ok: false });
    }
    setTravail('');
  }

  /* V3.55 : la page peut ne plus être à jour (ouverte depuis le matin, la
     signature lancée depuis le téléphone). Le serveur ne repasse en
     brouillon qu'un document sans signature lancée : sinon, la page se
     relit et le dit. Avant, seule la copie de l'onglet était regardée, et
     les anciens liens remarchaient sur le texte modifié. */
  const LANCEE = 'La signature est lancée : arrête-la d’abord (Arrêter la signature, dans la fiche du document), puis repasse-le en brouillon.';
  /* V3.61 : `confirme` : la fenêtre « Repasser en brouillon » a été validée. */
  async function repasserBrouillon(confirme = false) {
    const relire = async () => {
      const { data: frais } = await supabase.from('documents').select('*').eq('id', row.id).maybeSingle();
      if (frais) { setRow(frais as DocumentRow); onMaj(frais as DocumentRow); }
      return frais as DocumentRow | null;
    };
    if (row.signature) {
      /* La copie de l'onglet dit « lancée » : peut-être arrêtée depuis. */
      setTravail('brouillon');
      const frais = await relire();
      setTravail('');
      setMessage(frais && frais.statut !== 'pret' ? { t: 'Ce document a changé d’état entre-temps : voici où il en est.', ok: false }
        : frais && !frais.signature ? { t: 'La signature a été arrêtée entre-temps : tu peux maintenant le repasser en brouillon.', ok: true }
        : { t: LANCEE, ok: false });
      return;
    }
    if (!confirme) { setFenModif(true); return; }
    setFenModif(false);
    setTravail('brouillon');
    try {
      /* Des signataires encore ouverts : lancée ailleurs (la réponse
         ci-dessus), ou une signature arrêtée à moitié (le document vidé, ses
         lignes pas fermées) : on finit de la fermer, puis on continue. */
      if (await signatureOuverte(row.id)) {
        const frais = await relire();
        if (!frais || frais.statut !== 'pret' || frais.signature) { setMessage({ t: frais?.signature ? LANCEE : 'Impossible de le repasser en brouillon : il a changé d’état entre-temps.', ok: false }); setTravail(''); return; }
        await appelSignature({ action: 'annuler', id: row.id });
      }
      const maj = { statut: 'brouillon', finalise_le: null, pdf_chemin: null, updated_at: new Date().toISOString() };
      let r = await supabase.from('documents').update(maj).eq('id', row.id).eq('statut', 'pret').is('signature', null).select().maybeSingle();
      /* La colonne de la signature n'existe pas encore (SQL pas passé) : rien n'a pu être lancé. */
      if (r.error && tableSignaturesAbsente(r.error.message)) r = await supabase.from('documents').update(maj).eq('id', row.id).eq('statut', 'pret').select().maybeSingle();
      if (r.error) throw new Error(r.error.message);
      if (!r.data) {
        const frais = await relire();
        setMessage({ t: frais?.statut === 'pret' && frais.signature ? LANCEE : 'Impossible de le repasser en brouillon : il a changé d’état entre-temps.', ok: false });
        setTravail(''); return;
      }
      setRow(r.data as DocumentRow); onMaj(r.data as DocumentRow);
      setMessage(null);
    } catch (e) {
      setMessage({ t: 'Impossible de le repasser en brouillon : ' + (e as Error).message, ok: false });
    }
    setTravail('');
  }

  /* Avant d'envoyer le projet : ce qui est à l'écran doit être enregistré,
     le serveur fabrique le PDF depuis la base. */
  async function avantProjet(): Promise<boolean> {
    if (minuterie.current) clearTimeout(minuterie.current);
    return aEnregistrer.current ? enregistrer() : true;
  }

  const manques = m.manques(dm);
  const envoye = row.statut === 'brouillon' ? dernierEnvoi(row) : null;
  const alertes = m.reperes ? etapes.flatMap(e => m.reperes!(dm, e.id).filter(r => r.ton === 'alerte').map(r => ({ ...r, etape: e.titre }))) : [];
  const etat = STATUTS[row.statut] || STATUTS.brouillon;

  const texteEnreg = off
    ? (row.statut === 'pret' && row.finalise_le ? `Figé ${quand(row.finalise_le)}` : row.statut === 'signe' && row.signe_le ? `${m.courrier ? 'Envoyé' : 'Signé'} ${quand(row.signe_le)}` : '')
    : enreg === 'ok' ? `Enregistré ${quand(row.updated_at)}`
      : enreg === 'attente' ? 'Modifications en attente…'
        : enreg === 'encours' ? 'Enregistrement…'
          : `Non enregistré : ${enreg.erreur}`;

  return (
    <ContexteActe.Provider value={contexteActe}>
    <div className={s.ed} role="dialog" aria-modal="true" aria-label={row.titre || m.titre}>
      {/* ── La barre du haut ── */}
      <div className={s.edBarre}>
        <button type="button" className={s.edRetour} onClick={fermer}><Ic n="retour" t={16} /><span>{retourLib || 'Documents'}</span></button>
        <div className={s.edTitre}>
          <b>{m.titreDoc(d)}</b>
          <div className={s.edEtat}>
            <span className={`${s.statut} ${s.statutFort} ${s['t_' + etat.ton]}`}>{etat.l}</span>
            <span className={typeof enreg === 'object' ? s.ko : enreg === 'ok' ? s.ok : undefined}>{texteEnreg}</span>
            {envoye && (
              <span className={s.edEnvoye} title={envoye.modifie ? `${envoye.long}. Le document a changé depuis.` : envoye.long}>
                <Ic n="envoyer" t={12} /><span>{envoye.court}{envoye.modifie && <em>{' · modifié depuis'}</em>}</span>
              </span>
            )}
          </div>
        </div>
        <div className={`${s.modes} ${b.modesBarre}`} role="group" aria-label="Affichage des questions">
          <button type="button" aria-pressed={mode === 'etapes'} onClick={() => choisirMode('etapes')} title="Une étape à la fois">
            <Ic n="lignes" t={14} /><span>Étape par étape</span>
          </button>
          <button type="button" aria-pressed={mode === 'tout'} onClick={() => choisirMode('tout')} title="Toutes les questions à la suite, en blocs">
            <Ic n="doc" t={14} /><span>Tout sur une page</span>
          </button>
        </div>
        <div className={s.edBoutons}>
          <button type="button" className={`${s.btn} ${s.btnMasque}`} disabled={travail === 'apercu'} onClick={apercuPdf}>
            <Ic n="doc" t={15} />{row.statut === 'brouillon' ? (travail === 'apercu' ? 'Préparation…' : 'Aperçu PDF') : 'Le PDF'}
          </button>
          {row.statut === 'brouillon' && !m.courrier && (
            <button type="button" className={`${s.btn} ${s.btnCourt}`} onClick={() => setProjet(true)} title="Envoyer ce projet pour relecture, sans signature" aria-label="Envoyer ce projet">
              <Ic n="envoyer" t={15} /><span>Envoyer ce projet</span>
            </button>
          )}
          {row.statut === 'brouillon' && (
            <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={() => setFin(true)}><Ic n="check" t={15} e={2.4} />Finaliser</button>
          )}
          {row.statut === 'brouillon' && onSupprime && (
            <button type="button" className={`${s.btn} ${s.btnDanger} ${s.btnCourt}`} disabled={travail === 'supprimer'} onClick={() => { void demanderSuppression(); }}
              title="Supprimer ce brouillon" aria-label="Supprimer le brouillon">
              <Ic n="corbeille" t={15} /><span>{travail === 'supprimer' ? 'Suppression…' : 'Supprimer'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Le fil des étapes : le dessin de chacune, une coche verte quand
          elle est complète (V3.18, comme l'éditeur des biens) ── */}
      <FilEtapes actif={etape}>
        {etapes.map((e, i) => {
          const n = manquesParEtape[i];
          const ok = n === 0;
          return (
            <button key={e.id} type="button" className={`${s.pas} ${b.pas} ${i === etape ? s.pasOn : ''} ${ok ? s.pasOk : ''}`}
              aria-current={i === etape ? 'step' : undefined} title={e.titre} onClick={() => aller(i)}>
              <span className={`${s.pasN} ${b.pasIc}`}>{e.ic ? <Ic n={e.ic} t={15} /> : i + 1}{ok && i !== etape && <i className={b.pasCoche}><Ic n="check" t={8} e={3.6} /></i>}</span>
              <span>{e.court || e.titre}</span>
              {n > 0 && <span className={s.pasManque} title={`${n} information${n > 1 ? 's' : ''} à compléter`}>{n}</span>}
            </button>
          );
        })}
      </FilEtapes>

      {/* ── Téléphone : Questions / Aperçu ── */}
      <div className={s.edOnglets} role="group" aria-label="Affichage">
        <button type="button" aria-pressed={vue === 'form'} onClick={() => setVue('form')}><Ic n="plume" t={15} />Questions</button>
        <button type="button" aria-pressed={vue === 'apercu'} onClick={() => setVue('apercu')}><Ic n="doc" t={15} />Aperçu</button>
      </div>

      <div className={`${s.edCorps} ${s.edCorpsDoc}`} data-vue={vue} data-apercu={cache ? 'cache' : undefined} ref={corpsRef}
        style={{ ['--part' as string]: `${(part * 100).toFixed(2)}%` } as React.CSSProperties}>
        {/* ── Les questions ── */}
        <div className={s.edForm} ref={formRef} onScroll={mode === 'tout' ? suivreDefilement : undefined}>
          <div className={`${s.edFormIn} ${b.edFormIn} ${s.saisieVive} ${s.saisieDoc}`}>
            {row.statut === 'pret' && !row.signature && (
              <div className={s.lecture}>
                <span>{`Document figé ${quand(row.finalise_le)} : c’est ce PDF qu’on ${m.courrier ? 'envoie' : 'fait signer'}. Pour changer quelque chose, repasse-le en brouillon.`}</span>
                <button type="button" className={s.btn} disabled={travail === 'brouillon'} onClick={() => { void repasserBrouillon(); }}><Ic n="plume" t={14} />Modifier</button>
              </div>
            )}
            {/* V3.61 : en signature, il ne se modifie pas : on dit comment faire. */}
            {row.statut === 'pret' && row.signature && (
              <div className={s.lecture}>
                <span>{`Signature ${row.signature.mode === 'sur_place' ? 'sur place' : 'en ligne'} en cours : le document ne se modifie pas pendant qu’on le signe. Pour le corriger, ferme cette page, clique « Arrêter la signature » dans sa fiche, puis reviens ici et « Modifier ».`}</span>
              </div>
            )}
            {(row.statut === 'signe' || row.statut === 'annule') && (
              <div className={s.lecture}><span>{row.statut === 'signe' ? `${m.courrier ? 'Courrier envoyé' : 'Document signé'} : il ne se modifie plus. Pour une nouvelle version, duplique-le depuis la liste.` : 'Document annulé : consultation seulement.'}</span></div>
            )}
            {ancienneSignature && row.statut === 'brouillon' && (
              <div className={s.erreur}>
                <b>Une ancienne signature en ligne est encore ouverte</b>
                {'Ce document a été repassé en brouillon pendant sa signature. Arrête-la avant de le finaliser : sinon ses anciens liens remarcheraient sur le nouveau texte.'}
                <div style={{ marginTop: 10 }}>
                  <button type="button" className={s.btn} disabled={travail === 'ancienne'} onClick={() => { void arreterAncienneSignature(); }}>{travail === 'ancienne' ? 'Arrêt…' : 'Arrêter l’ancienne signature'}</button>
                </div>
              </div>
            )}
            {message && <div className={message.ok ? s.note : s.erreur}>{message.t}</div>}
            {erreurIdentite && <div className={s.erreur}>{`${erreurIdentite} L’aperçu utilise l’identité par défaut ; la finalisation la relira.`}</div>}

            {mode === 'tout'
              ? etapes.map((e, i) => <BlocEtape key={e.id} e={e} i={i} n={etapes.length} d={d} maj={maj} off={off} reperes={reperesParEtape[i] || []} />)
              : <BlocEtape key={etapes[etape].id} e={etapes[etape]} i={etape} n={etapes.length} d={d} maj={maj} off={off} reperes={reperesParEtape[etape] || []} anime />}

            <div className={s.suite}>
              {mode === 'etapes' && etape > 0 ? <button type="button" className={s.btn} onClick={() => aller(etape - 1)}><Ic n="retour" t={15} />{etapes[etape - 1].court || etapes[etape - 1].titre}</button> : <span />}
              {mode === 'etapes' && etape < etapes.length - 1
                ? <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={() => aller(etape + 1)}>{`Étape suivante : ${etapes[etape + 1].court || etapes[etape + 1].titre}`}</button>
                : row.statut === 'brouillon' && <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={() => setFin(true)}><Ic n="check" t={15} e={2.4} />Vérifier et finaliser</button>}
            </div>
          </div>
        </div>

        {/* ── La barre à tirer entre les deux (V3.46) ── */}
        {!cache && (
          <div className={s.edSep} role="separator" aria-orientation="vertical" aria-label="Largeur des questions et de l’aperçu"
            aria-valuemin={20} aria-valuemax={80} aria-valuenow={Math.round(part * 100)} tabIndex={0}
            title="Tirer pour donner plus de place aux questions ou à l’aperçu (double-clic : moitié-moitié)"
            onPointerDown={tirerBarre} onKeyDown={toucheBarre} onDoubleClick={() => garderPart(PART_DEFAUT)}>
            <span aria-hidden="true" />
          </div>
        )}
        {cache && (
          <div className={s.edRail}>
            <button type="button" onClick={() => montrerApercu(true)} title="Afficher l’aperçu du document">
              <Ic n="oeil" t={16} /><span>Afficher l’aperçu</span>
            </button>
          </div>
        )}

        {/* ── Le document : un clic sur un passage ouvre sa question ── */}
        {voirApercu && (
          <div className={s.edApercu} ref={apercuRef} onClick={cliquerApercu}>
            <div className={s.edApercuT}>
              <span>{off ? 'Le document figé' : 'Aperçu en direct'}</span>
              <span className={s.edApercuQui}>{m.signataires}</span>
              <button type="button" className={s.edMasquer} onClick={() => montrerApercu(false)} title="Masquer l’aperçu : les questions prennent toute la largeur">
                <Ic n="oeilBarre" t={14} /><span>Masquer</span>
              </button>
            </div>
            {rendu && (rendu.erreur
              ? <div className={s.erreur}>{`L’aperçu n’a pas pu être rédigé : ${rendu.erreur}`}</div>
              : <ApercuActe parties={rendu.parties} garde={rendu.garde} pour={rendu.pour} resume={rendu.resume} projet={row.statut === 'brouillon'} cliquable
                  pied={`${identite.nom} · ${identite.societe}, ${identite.forme} · carte professionnelle ${identite.carte}`} />)}
          </div>
        )}
      </div>

      {/* ── Téléphone : précédent / suivant sous le pouce ── */}
      <div className={s.edPied}>
        {mode === 'etapes' && <button type="button" className={s.btn} disabled={etape === 0} onClick={() => aller(etape - 1)}><Ic n="retour" t={15} />Précédent</button>}
        {mode === 'etapes' && etape < etapes.length - 1
          ? <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={() => aller(etape + 1)}>Suivant</button>
          : row.statut === 'brouillon'
            ? <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={() => setFin(true)}>Finaliser</button>
            : <button type="button" className={s.btn} onClick={apercuPdf}>Le PDF</button>}
      </div>

      {/* ── Le projet, en relecture (V3.40) ── */}
      {projet && (
        <FenetreProjet doc={row} donnees={d} avant={avantProjet} onFermer={() => setProjet(false)}
          onEnvoye={r => {
            setProjet(false);
            if (r.row) { setRow(r.row); onMaj(r.row); }
            setMessage({ t: r.message, ok: r.ok });
            formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          }} />
      )}

      {/* ── La finalisation ── */}
      {fin && (
        <div className={s.fenetre} onClick={e => { if (e.target === e.currentTarget && !travail) setFin(false); }}>
          <div className={s.fenetreIn} role="dialog" aria-modal="true" aria-label="Finaliser le document">
            <div className={s.fenTete}>
              <div style={{ flex: '1 1 auto' }}>
                <h3>{manques.length ? 'Il manque encore quelque chose' : 'Finaliser le document'}</h3>
                <p>{manques.length
                  ? 'Un document incomplet ne se finalise pas : complète ces points, l’aperçu les surligne en jaune.'
                  : m.courrier
                    ? 'Le PDF est figé avec l’identité de ton agence d’aujourd’hui, et le courrier passe « À envoyer ». Tant qu’il n’est pas envoyé, tu peux encore le repasser en brouillon.'
                    : electronique(d)
                      ? `Le texte est figé avec l’identité de ton agence d’aujourd’hui, et le document passe « À faire signer ». ${modeSignature(d) === 'en_ligne' ? 'Tu enverras ensuite les liens de signature depuis sa fiche.' : 'Tu lanceras ensuite la signature sur place depuis sa fiche.'}`
                      : 'Le PDF est figé avec l’identité de ton agence d’aujourd’hui, et le document passe « À faire signer ». Tant qu’il n’est pas signé, tu peux encore le repasser en brouillon.'}</p>
              </div>
              <button type="button" className={s.panFermer} aria-label="Fermer" onClick={() => setFin(false)} disabled={!!travail}><Croix /></button>
            </div>
            <div className={s.fenCorps}>
              {manques.length > 0 && (
                <ul className={s.liste2}>
                  {manques.map(x => <li key={x}><span className={`${s.k} ${s.kRouge}`}><Croix t={12} /></span><span>{x}</span></li>)}
                </ul>
              )}
              {!manques.length && (
                <ul className={s.liste2}>
                  <li><span className={`${s.k} ${s.kVert}`}><Ic n="check" t={12} e={3} /></span><span>{`Toutes les informations obligatoires sont remplies.`}</span></li>
                  {m.numero && <li><span className={`${s.k} ${s.kVert}`}><Ic n={reg ? 'livre' : 'check'} t={12} e={reg ? 2 : 3} /></span><span>{reg
                    ? (reg.ligne ? `Registre des mandats : il garde son n° ${reg.ligne}.` : `Registre des mandats : le numéro est pris maintenant, avant toute signature (ce sera le ${reg.prochain}), et imprimé sur le mandat.`)
                    : `Numéro du registre : ${String(d.numero || '')}. Il sera vérifié : un numéro ne sert qu’une fois.`}</span></li>}
                  <li><span className={`${s.k} ${s.kOr}`}><Ic n="plume" t={12} /></span><span>{m.courrier ? m.signataires + '.' : `À signer : ${m.signataires.charAt(0).toLowerCase()}${m.signataires.slice(1)}.`}</span></li>
                  {!m.courrier && <li><span className={`${s.k} ${s.kOr}`}><Ic n={modeSignature(d) === 'en_ligne' ? 'mail' : modeSignature(d) === 'sur_place' ? 'tablette' : 'doc'} t={12} /></span><span>{modeSignature(d) === 'en_ligne' ? 'Signature en ligne : chacun avec son lien et un code reçu par e-mail.' : modeSignature(d) === 'sur_place' ? (surPlaceSansCode(m.id, d) ? 'Signature sur place, sur ton écran : chacun signe dans son cadre, au stylet, sans code.' : 'Signature sur place, sur ton écran : chacun à son tour, avec un code reçu sur son e-mail.') : 'Signature à la main : le PDF s’ouvre, prêt à imprimer.'}</span></li>}
                </ul>
              )}
              {!manques.length && alertes.length > 0 && (
                <div className={s.reperes}>
                  {alertes.map((r, i) => <div key={i} className={`${s.repere} ${s.repereAlerte}`}><span>{`${r.etape} · ${r.l}`}</span><b>{r.v}</b></div>)}
                </div>
              )}
              {message && !message.ok && <div className={s.erreur}>{message.t}</div>}
            </div>
            <div className={s.fenPied}>
              <button type="button" className={s.btn} disabled={!!travail} onClick={() => setFin(false)}>{manques.length ? 'Compléter' : 'Pas encore'}</button>
              {!manques.length && (
                <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={!!travail} onClick={lancerFinalisation}>
                  <Ic n="check" t={15} e={2.4} />{travail === 'finaliser' ? 'Finalisation…' : electronique(d) && onFinalise ? (modeSignature(d) === 'en_ligne' ? 'Finaliser, puis envoyer les liens' : 'Finaliser, puis signer sur place') : 'Finaliser et ouvrir le PDF'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {fenSuppr && (
        <FenetreConfirmer ic="corbeille" ton="danger" titre="Supprimer ce brouillon ?" bouton="Supprimer le brouillon"
          intro={row.titre || m.titre}
          points={[
            { ic: 'croix', ton: 'alerte', t: 'Le brouillon disparaît pour de bon, avec toutes ses réponses. Ça ne se rattrape pas.' },
            ...(fenSuppr.ligne ? [{ ic: 'liste', t: `Il a déjà le n° ${fenSuppr.ligne} au registre des mandats : cette ligne reste, notée « sans suite ».` }] : []),
            ...(row.modele === 'mandat_vente' ? [{ ic: 'maison', t: 'Si la fiche du bien était passée « En vente » avec lui, on te demandera juste après ce qu’elle devient.' }] : []),
          ]}
          conseil="Tu hésites ? Garde-le : un brouillon n’engage à rien et ne compte nulle part tant qu’il n’est pas finalisé."
          onFermer={() => setFenSuppr(null)} onConfirmer={() => { void supprimer(fenSuppr.ligne); }} />
      )}
      {fenModif && (
        <FenetreConfirmer ic="crayon" titre="Repasser en brouillon pour le modifier ?" bouton="Repasser en brouillon"
          intro={`${row.titre || m.titre}${row.numero ? ` · n° ${row.numero}` : ''}`}
          points={[
            { ic: 'crayon', t: 'Le document repasse en brouillon : tu peux tout corriger, question par question.' },
            { ic: 'doc', ton: 'alerte', t: `Le PDF figé n’est plus proposé. S’il a déjà été imprimé ou envoyé en projet, ne fais pas ${m.courrier ? 'envoyer' : 'signer'} l’ancien exemplaire.` },
            ...(m.registre && row.numero ? [{ ic: 'liste', t: `Il garde son n° ${row.numero}. Le registre des mandats notera « Corrigé avant signature », avec ce qui change.` }] : []),
          ]}
          ensuite={[
            { ic: 'check', t: 'Corrige, puis « Finaliser » : un nouveau PDF est figé, avec l’identité de l’agence du jour.' },
            { ic: m.courrier ? 'envoyer' : 'plume', t: m.courrier ? 'Puis envoie-le comme prévu.' : 'Puis fais-le signer comme prévu : à la main, en ligne ou sur place.' },
          ]}
          onFermer={() => setFenModif(false)} onConfirmer={() => repasserBrouillon(true)} />
      )}
    </div>
    </ContexteActe.Provider>
  );
}
