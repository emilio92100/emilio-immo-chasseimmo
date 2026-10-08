'use client';
/* ═══ Le rapprochement, depuis la fiche d'un acheteur (V3.29) ═══════════
   Trois temps, dans une seule fenêtre :
   1. où chercher (mes mandats, les veilles des autres clients, les deux ;
      pour les veilles, depuis quand) ;
   2. ça cherche (une petite animation, le temps de comparer) ;
   3. les biens trouvés, à 50 % et plus, avec leur note. Un aperçu simple
      pour chacun ; on coche, puis « Mettre en sélection » ou « Envoyer par
      mail » (le mail d'envoi habituel de la fiche, rien de nouveau).
   Le calcul est dans src/lib/rapprochement.ts.

   V3.112 (Alexandre : « la vue acheteur, je n'arrive pas à comprendre… dès
   que j'arrive dans Rapprochement, qu'on comprenne bien avec une petite
   explication ») :
   · l'onglet montre GuideRapprochement (en bas de ce fichier) : ce que fait
     le rapprochement, les trois temps, « Où chercher ? » (deux cases à
     cocher, mandats et veilles, avec leur nombre), le dernier rapprochement,
     « Seulement les nouveautés » ou « Tout revoir », puis « Lancer » — la
     fenêtre s'ouvre directement sur la recherche ;
   · « Seulement les nouveautés » : les biens déjà montrés par un rapprochement
     précédent (`vus`, notés au Suivi) sont repliés à part, « Déjà vus » ;
   · le pied dit ce que fait chaque bouton : « Le mettre dans sa sélection »
     (rien ne part), « Le mettre dans son espace » (V3.116 : présenté sans
     mail) ou « Le lui envoyer par mail » (il passe dans Présentés).

   V3.125 (Alexandre : « le même procédé… depuis la fiche d'un acheteur dans
   rapprochement ») : « Lancer » fait le premier tri PUIS la relecture de ses
   biens en vente (RapprochementIA.tsx), les étapes à l'écran ; les résultats
   n'arrivent qu'ensuite. Tes biens en vente sont rangés par avis — Oui, À
   voir, puis Non replié — avec leur note de potentiel, leurs plus et leurs
   moins ; les annonces des veilles (déjà lues par la veille) suivent, à
   part, avec leur note de critères. Rien n'est coché d'office : « Cocher
   les oui ». */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icone } from './ParcoursBien';
import {
  compterSources, rapprocher, poserEnSelection, presenterDansEspace, noterRapprochement, PERIODES,
  type LigneRappro, type SourceRappro, type PeriodeVeille, type Trouve,
} from '@/lib/rapprochement';
import { SEUIL_CORRESPOND, suiteEnvoi } from '@/components/biens/outils';
import { supabase } from '@/lib/supabase';
import { AvecScore, AvisDetail, IconeAvis, MOT_IA, Progression, analyserIA, compareIA, dateRappro, type AvisIA, type AvisParBien } from '@/components/biens/RapprochementIA';
import s from './Rapprochement.module.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ligne = Record<string, any>;

const EUR = (n: number | null | undefined) => (n ? `${n.toLocaleString('fr-FR')} €` : '');
const C = 113.1; // périmètre du cercle de la note (r = 18)

/* Ce qui ne colle pas, en une ligne ; sinon « Tout correspond ». */
function ecart(t: Trouve): { texte: string; ok: boolean } {
  const l = t.corr.lignes.find(x => x.etat === 'non') || t.corr.lignes.find(x => x.etat === 'presque');
  if (!l) return { texte: `Tout correspond : ${t.corr.lignes.slice(0, 4).map(x => x.lib.toLowerCase()).join(', ')}`, ok: true };
  return { texte: `${l.lib} : ${l.valeur}, demandé ${l.demande}`, ok: false };
}
const ancien = (t: Trouve) => !!t.le && Date.now() - new Date(t.le).getTime() > 60 * 86400000;
const jourCourt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');

function Note({ n }: { n: number }) {
  const coul = n >= 85 ? '#16a34a' : n >= SEUIL_CORRESPOND ? '#c9a84c' : '#94a3b8';
  return (
    <svg className={s.note} width="48" height="48" viewBox="0 0 48 48" role="img" aria-label={`${n} pour cent`}>
      <circle cx="24" cy="24" r="18" fill="none" stroke="#eef1f6" strokeWidth="4.5" />
      <circle cx="24" cy="24" r="18" fill="none" stroke={coul} strokeWidth="4.5" strokeLinecap="round"
        strokeDasharray={`${(C * n / 100).toFixed(1)} ${C}`} transform="rotate(-90 24 24)" />
      <text x="24" y="28.5" textAnchor="middle" fill="#1a2332" style={{ font: "800 12.5px 'Plus Jakarta Sans', sans-serif" }}>{n}</text>
    </svg>
  );
}

function Photo({ t, grande }: { t: Trouve; grande?: boolean }) {
  const [ko, setKo] = useState(false);
  return (
    <span className={grande ? s.photoG : s.photo}>
      {t.photo && !ko
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={t.photo} alt="" onError={() => setKo(true)} />
        : <Icone nom="maison" taille={grande ? 34 : 22} epaisseur={1.8} />}
    </span>
  );
}

function Source({ t }: { t: Trouve }) {
  return t.source === 'mandat'
    ? <span className={`${s.src} ${s.srcMandat}`}><Icone nom="etiquette" taille={12} epaisseur={2.2} />Ton mandat</span>
    : <span className={`${s.src} ${s.srcVeille}`} title={t.pour ? `Trouvé par la veille de ${t.pour}` : undefined}>
      <Icone nom="loupe" taille={12} epaisseur={2.2} />{`Veille${t.pour ? ` · ${t.pour.split(' ')[0]}` : ''}${t.le ? ` · ${jourCourt(t.le)}` : ''}`}
    </span>;
}

export type DepartRappro = { source: SourceRappro; cocher?: string[]; periode?: PeriodeVeille; nouveautes?: boolean };
const jourLong = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '');
const pl = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);

export default function Rapprochement({ client, recherche, resume, onFermer, onFini, onFicheBien, depart, vus, dernierLe }: {
  client: Ligne; recherche: Ligne; resume: string;
  onFermer: () => void;
  /* Les biens sont posés dans son dossier : la fiche recharge, puis ouvre la
     Sélection ou le mail d'envoi habituel sur ces biens-là. */
  onFini: (quoi: 'selection' | 'espace' | 'mail', ids: string[]) => void;
  onFicheBien?: (bienVenteId: string) => void;
  /* Ouvert depuis une alerte (« un acheteur arrive ») : la recherche part
     tout de suite, sur cette source, et ces mandats sont déjà cochés. */
  depart?: DepartRappro | null;
  /* V3.112 : les biens déjà montrés par les rapprochements précédents, et le jour du dernier. */
  vus?: string[]; dernierLe?: string | null;
}) {
  const prenom = client.prenom || 'ce client';
  const [etape, setEtape] = useState<'choix' | 'cherche' | 'resultats'>('choix');
  const [source, setSource] = useState<SourceRappro>(depart?.source || 'deux');
  const [periode, setPeriode] = useState<PeriodeVeille>(depart?.periode ?? 90);
  const nouveautes = !!depart?.nouveautes && !!vus?.length;
  const vusSet = useMemo(() => new Set(vus || []), [vus]);
  const [voirAnciens, setVoirAnciens] = useState(false);
  const [comptes, setComptes] = useState<{ mandats: number; veilles: Record<number, number> } | null>(null);
  const [res, setRes] = useState<{ trouves: Trouve[]; compares: number; dejaLa: number } | null>(null);
  const [erreur, setErreur] = useState('');
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [filtre, setFiltre] = useState<'tout' | 'mandat' | 'veille'>('tout');
  const [apercu, setApercu] = useState<Trouve | null>(null);
  const [pose, setPose] = useState<'' | 'selection' | 'espace' | 'mail'>('');
  /* V3.123 → V3.125 — La relecture de ses mandats (les biens des veilles ont
     déjà été lus par la veille), pendant la recherche : les résultats
     n'arrivent qu'une fois relus. */
  const [ia, setIa] = useState<AvisParBien>({});
  const [phase, setPhase] = useState<'tri' | 'relit' | 'fin'>('tri');
  const [iaEtat, setIaEtat] = useState<{ fait: number; total: number; erreur: string; info: string; manquent: number; trouves: number; mandats: number }>({ fait: 0, total: 0, erreur: '', info: '', manquent: 0, trouves: 0, mandats: 0 });
  const [voirNon, setVoirNon] = useState(false);
  const [pasPour, setPasPour] = useState(0);
  const avisDe = (t: Trouve) => (t.vente ? ia[t.vente.id]?.[String(recherche.id)] || null : null);

  useEffect(() => {
    let vivant = true;
    compterSources(recherche.id, client.id).then(c => { if (vivant) setComptes(c); }).catch(() => { if (vivant) setComptes({ mandats: 0, veilles: {} }); });
    return () => { vivant = false; };
  }, [recherche.id, client.id]);

  /* Échap ferme l'aperçu, puis la fenêtre. */
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (apercu) setApercu(null); else if (!pose) onFermer(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [apercu, pose, onFermer]);

  /* Depuis une alerte : on cherche tout de suite, une seule fois. */
  const parti = useRef(false);
  useEffect(() => {
    if (!depart || parti.current) return;
    parti.current = true;
    void lancer(depart.source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depart]);

  const nbVeilles = comptes?.veilles[periode] ?? null;
  const aComparer = comptes ? (source === 'mandats' ? comptes.mandats : source === 'veilles' ? (nbVeilles || 0) : comptes.mandats + (nbVeilles || 0)) : null;

  async function lancer(src: SourceRappro = source) {
    setErreur(''); setEtape('cherche'); setChoisis(new Set()); setFiltre('tout'); setPhase('tri'); setIa({}); setVoirNon(false);
    setIaEtat({ fait: 0, total: 0, erreur: '', info: '', manquent: 0, trouves: 0, mandats: 0 });
    const debut = Date.now();
    try {
      const r0 = await rapprocher(recherche, client.id, src, periode);
      /* V3.126 : les biens où Alexandre l'a écarté (« Pas pour lui », depuis
         la fiche du bien) ne remontent pas. Une lecture qui échoue n'empêche rien. */
      const { data: pas } = await supabase.from('biens_vente_suivi').select('bien_id').eq('recherche_id', String(recherche.id)).eq('type', 'note').contains('donnees', { pasPourLui: true });
      const ecartesB = new Set(((pas || []) as { bien_id: string }[]).map(x => x.bien_id));
      const r = { ...r0, trouves: r0.trouves.filter(t => !(t.vente && ecartesB.has(t.vente.id))) };
      setPasPour(r0.trouves.length - r.trouves.length);
      /* L'animation se voit au moins un instant : un résultat instantané
         laissait croire que rien n'avait été cherché. */
      const reste = 1400 - (Date.now() - debut);
      if (reste > 0) await new Promise(ok => setTimeout(ok, reste));
      /* La relecture de ses mandats parmi les nouveaux résultats, 24 au plus. */
      const neufs = r.trouves.filter(t => !nouveautes || !vusSet.has(t.cle));
      const paires = neufs.filter(t => t.vente).slice(0, 24).map(t => ({ b: t.vente!.id, r: String(recherche.id) }));
      setIaEtat(e => ({ ...e, total: paires.length, trouves: neufs.length, mandats: paires.length }));
      setPhase('relit');
      let lus: AvisParBien = {};
      if (paires.length) {
        const x = await analyserIA(paires, (avis, fait) => { lus = avis; setIa(avis); setIaEtat(e => ({ ...e, fait })); });
        setIaEtat(e => ({ ...e, erreur: x.erreur, info: x.info, manquent: x.manquent }));
      } else await new Promise(ok => setTimeout(ok, 500));
      setPhase('fin');
      await new Promise(ok => setTimeout(ok, 350));
      setRes(r);
      /* V3.125 : rien de coché d'office, sauf les mandats d'une alerte (« un acheteur arrive »). */
      const aCocher = new Set((depart?.cocher || []).map(id => `m-${id}`));
      setChoisis(new Set(r.trouves.filter(t => aCocher.has(t.cle)).map(t => t.cle)));
      setEtape('resultats');
      /* V3.126 : ce qui a été proposé, gardé avec la ligne du Suivi. */
      const lignes: LigneRappro[] = neufs.slice(0, 40).map(t => {
        const a = t.vente ? lus[t.vente.id]?.[String(recherche.id)] : undefined;
        return {
          cle: t.cle, src: t.source, titre: t.titre, lieu: t.lieu || undefined, prix: t.prix, photo: t.photo, n: t.corr.note,
          ...(t.vente ? { bien: t.vente.id } : { url: t.url }),
          ...(a ? { v: a.v, s: a.s, t: a.r, p: a.p || [], m: a.m || [] } : {}),
        };
      });
      noterRapprochement(client.id, recherche.id, r.trouves.length, src, periode, r.trouves.map(t => t.cle), lignes);
    } catch (e) {
      setErreur((e as Error).message);
      setEtape('choix');
    }
  }

  async function poser(quoi: 'selection' | 'espace' | 'mail') {
    if (!res || !choisis.size || pose) return;
    setPose(quoi);
    const ids: string[] = [], erreurs: string[] = [];
    for (const t of res.trouves.filter(x => choisis.has(x.cle))) {
      try { ids.push(await poserEnSelection(t, client.id, recherche.id)); } catch (e) { erreurs.push((e as Error).message); }
    }
    /* V3.116 : dans son espace, sans mail — présentés, une relance, sa notification. */
    if (quoi === 'espace' && ids.length) {
      const r = await presenterDansEspace(ids, String(client.id), String(recherche.id));
      erreurs.push(...r.erreurs);
      if (r.n) await suiteEnvoi(String(client.id), String(recherche.id), r.n);
    }
    setPose('');
    if (erreurs.length) alert(`${erreurs.length} bien${erreurs.length > 1 ? 's' : ''} n’${erreurs.length > 1 ? 'ont' : 'a'} pas pu être ajouté${erreurs.length > 1 ? 's' : ''} :\n\n${erreurs.join('\n')}`);
    if (ids.length) onFini(quoi, ids);
  }

  const basculer = (cle: string) => setChoisis(c => { const n = new Set(c); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  /* « Seulement les nouveautés » : ce qui a déjà été montré est replié à part. */
  const nouveaux = useMemo(() => (res?.trouves || []).filter(t => !nouveautes || !vusSet.has(t.cle)), [res, nouveautes, vusSet]);
  const anciens = useMemo(() => (nouveautes ? (res?.trouves || []).filter(t => vusSet.has(t.cle)) : []), [res, nouveautes, vusSet]);
  const liste = useMemo(() => nouveaux.filter(t => filtre === 'tout' || t.source === filtre), [nouveaux, filtre]);
  /* V3.125 : ses mandats relus, rangés par avis (puis la note de potentiel) ;
     ceux qui n'ont pas pu l'être vont avec « À voir ». Les veilles à part. */
  const relus = liste.filter(t => t.source === 'mandat').map((t, k) => ({ t, k, a: avisDe(t) })).sort((p, q) => compareIA(p.a, q.a) || p.k - q.k);
  const groupeDe = (a: AvisIA | null): AvisIA['v'] => (a ? a.v : 'a_voir');
  const veillesL = liste.filter(t => t.source !== 'mandat');
  const ouiPossibles = relus.filter(y => groupeDe(y.a) === 'oui').map(y => y.t.cle);
  const tousOui = ouiPossibles.length > 0 && ouiPossibles.every(k => choisis.has(k));
  const nbM = nouveaux.filter(t => t.source === 'mandat').length;
  const nbV = nouveaux.filter(t => t.source === 'veille').length;

  const ligne = (t: Trouve, i: number) => {
    const on = choisis.has(t.cle);
    const e = ecart(t);
    const av = avisDe(t);
    return (
      <div key={t.cle} className={`${s.ligne} ${on ? s.ligneOn : ''}`} style={{ animationDelay: `${Math.min(i, 8) * 0.05}s` }}>
        <button type="button" className={`${s.coche} ${on ? s.cocheOn : ''}`} aria-pressed={on} aria-label={on ? 'Retirer ce bien du choix' : 'Choisir ce bien'} onClick={() => basculer(t.cle)}>
          <Icone nom="coche" taille={14} epaisseur={3.2} />
        </button>
        <button type="button" className={s.ligneCorps} onClick={() => setApercu(t)}>
          {/* V3.125 : la note juste sous la photo — de potentiel quand le bien a été relu, sinon de critères. */}
          {av && typeof av.s === 'number'
            ? <AvecScore s={av.s} v={av.v} forme="carre"><Photo t={t} /></AvecScore>
            : <AvecScore s={t.corr.note} v={null} forme="carre" legende="critères"><Photo t={t} /></AvecScore>}
          <span className={s.ligneTx}>
            <b>{t.titre}</b>
            {t.lieu && <span>{t.lieu}</span>}
            {av ? (
              <>
                <AvisDetail avis={av} sansMot />
              </>
            ) : <span className={e.ok ? s.ecartOk : s.ecartKo}>{e.texte}</span>}
          </span>
          <span className={s.ligneD}>
            <b>{EUR(t.prix) || 'Prix non indiqué'}</b>
            <Source t={t} />
            {ancien(t) && <span className={s.vieux}>À vérifier : annonce ancienne</span>}
          </span>
        </button>
        <button type="button" className={s.oeil} aria-label="Voir ce bien" title="Voir ce bien" onClick={() => setApercu(t)}>
          <Icone nom="oeil" taille={18} epaisseur={2} />
        </button>
      </div>
    );
  };

  const fenetre = (
    <div className={s.voile} onMouseDown={e => { if (e.target === e.currentTarget && !pose) onFermer(); }}>
      <div className={`${s.fenetre} ${etape === 'resultats' ? s.fenetreLarge : ''}`} role="dialog" aria-modal="true" aria-label={`Rapprochement pour ${prenom}`}>
        <div className={s.tete}>
          <span className={s.teteIc}><Icone nom="etoile" taille={21} epaisseur={2} /></span>
          <div className={s.teteTx}>
            {etape === 'resultats' && res ? (
              <>
                <h2>{nouveautes
                  ? (nouveaux.length ? `${nouveaux.length} ${pl(nouveaux.length, 'nouveau bien', 'nouveaux biens')} pour ${prenom}` : `Rien de nouveau pour ${prenom}`)
                  : (res.trouves.length ? `${res.trouves.length} bien${res.trouves.length > 1 ? 's' : ''} pour ${prenom}` : `Rien pour ${prenom} cette fois`)}</h2>
                <p>{[
                  nouveautes && dernierLe ? `depuis le ${jourLong(dernierLe)}` : '',
                  source !== 'veilles' ? `${nbM} de tes mandats` : '',
                  source !== 'mandats' ? `${nbV} bien${nbV > 1 ? 's' : ''} de tes veilles` : '',
                  anciens.length ? `${anciens.length} déjà ${pl(anciens.length, 'vu, replié', 'vus, repliés')}` : '',
                  res.dejaLa ? `${res.dejaLa} déjà dans son dossier, mis de côté` : '',
                ].filter(Boolean).join(' · ')}</p>
              </>
            ) : (
              <>
                <h2>{`Faire un rapprochement pour ${prenom}`}</h2>
                <p>{resume}</p>
              </>
            )}
          </div>
          {etape === 'resultats' && <button type="button" className={s.btnLeger} onClick={() => setEtape('choix')}>Refaire</button>}
          <button type="button" className={s.fermer} aria-label="Fermer" onClick={onFermer} disabled={!!pose}><Icone nom="fermer" taille={16} epaisseur={2.2} /></button>
        </div>

        {etape === 'choix' && (
          <>
            <div className={s.corps}>
              <span className={s.sur}>Où chercher ?</span>
              <div className={s.choix3}>
                {([
                  { k: 'mandats', ic: 'etiquette', t: 'Mes mandats en cours', d: 'Les biens que vous vendez.', n: comptes ? `${comptes.mandats} bien${comptes.mandats > 1 ? 's' : ''}` : '…' },
                  { k: 'veilles', ic: 'loupe', t: 'Les biens de mes veilles', d: 'Ceux trouvés pour vos autres clients.', n: nbVeilles == null ? '…' : `${nbVeilles} bien${nbVeilles > 1 ? 's' : ''}` },
                  { k: 'deux', ic: 'etoile', t: 'Les deux', d: 'Vos mandats d’abord, puis les veilles.', n: aComparer == null ? '…' : `${aComparer} bien${aComparer > 1 ? 's' : ''} à comparer` },
                ] as const).map(c => (
                  <button key={c.k} type="button" className={`${s.choix} ${source === c.k ? s.choixOn : ''}`} aria-pressed={source === c.k} onClick={() => setSource(c.k)}>
                    {source === c.k && <span className={s.choixCoche}><Icone nom="coche" taille={13} epaisseur={3} /></span>}
                    <span className={s.choixIc}><Icone nom={c.ic} taille={20} epaisseur={2} /></span>
                    <b>{c.t}</b>
                    <span className={s.choixD}>{c.d}</span>
                    <span className={s.choixN}>{c.n}</span>
                  </button>
                ))}
              </div>
              {source !== 'mandats' && (
                <div className={s.periode}>
                  <div>
                    <b>Biens de veille trouvés depuis</b>
                    <p>Plus c’est ancien, plus l’annonce risque d’être vendue : vérifiez son lien avant de l’envoyer.</p>
                  </div>
                  <div className={s.seg} role="group" aria-label="Période">
                    {PERIODES.map(p => (
                      <button key={p.k} type="button" className={periode === p.k ? s.segOn : ''} aria-pressed={periode === p.k} onClick={() => setPeriode(p.k)}>{p.l}</button>
                    ))}
                  </div>
                </div>
              )}
              <p className={s.info}><Icone nom="info" taille={16} epaisseur={2} /><span>{`Seuls les biens qui respectent au moins la moitié de ses critères sont montrés. Ceux déjà dans son dossier (sélection ou présentés) sont mis de côté.`}</span></p>
              {erreur && <p className={s.erreur}>{erreur}</p>}
            </div>
            <div className={s.pied}>
              <button type="button" className={s.btn} onClick={onFermer}>Annuler</button>
              <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={() => lancer()} disabled={aComparer === 0}>
                <Icone nom="etoile" taille={17} epaisseur={2.2} />Lancer le rapprochement
              </button>
            </div>
          </>
        )}

        {etape === 'cherche' && (
          <div className={s.cherche}>
            <Progression titre={`Rapprochement pour ${prenom}…`} etapes={[
              { t: 'Le premier tri', etat: phase === 'tri' ? 'en' : 'fait',
                d: phase === 'tri'
                  ? (aComparer != null ? `Je compare ${aComparer} bien${aComparer > 1 ? 's' : ''} avec les critères de ${prenom}…` : `Je compare tes biens avec les critères de ${prenom}…`)
                  : `${iaEtat.trouves} bien${iaEtat.trouves > 1 ? 's' : ''} à 50 % et plus, dont ${iaEtat.mandats} de tes biens en vente.` },
              { t: 'La relecture de tes biens en vente', etat: phase === 'tri' ? 'attente' : phase === 'relit' && iaEtat.total ? 'en' : 'fait', fait: iaEtat.fait, total: iaEtat.total,
                d: phase === 'tri' ? `Ses indispensables, son parcours, ses comptes rendus de visite, face à chaque fiche.`
                  : !iaEtat.total ? 'Rien à relire : les annonces des veilles ont déjà été lues par la veille.'
                    : phase === 'relit' ? `${Math.min(iaEtat.fait, iaEtat.total)} sur ${iaEtat.total} relu${iaEtat.total > 1 ? 's' : ''}…` : `${iaEtat.total} relu${iaEtat.total > 1 ? 's' : ''}.` },
              { t: 'Le classement', etat: phase === 'fin' ? 'en' : 'attente', d: 'Oui, à voir, non : les meilleures chances d’abord.' },
            ]} />
          </div>
        )}

        {etape === 'resultats' && res && (
          <>
            {nouveaux.length > 0 && (
              <div className={s.filtres}>
                <button type="button" className={filtre === 'tout' ? s.puceOn : s.puce} onClick={() => setFiltre('tout')}>Tous <b>{nouveaux.length}</b></button>
                {source !== 'veilles' && <button type="button" className={filtre === 'mandat' ? s.puceOn : s.puce} onClick={() => setFiltre('mandat')}><Icone nom="etiquette" taille={13} epaisseur={2.2} />Mes mandats <b>{nbM}</b></button>}
                {source !== 'mandats' && <button type="button" className={filtre === 'veille' ? s.puceOn : s.puce} onClick={() => setFiltre('veille')}><Icone nom="loupe" taille={13} epaisseur={2.2} />Veilles <b>{nbV}</b></button>}
                {ouiPossibles.length > 0 && (
                  <button type="button" className={s.cocherOui} onClick={() => setChoisis(c => { const n = new Set(c); for (const k of ouiPossibles) { if (tousOui) n.delete(k); else n.add(k); } return n; })}>
                    <Icone nom="coche" taille={13} epaisseur={2.8} />{tousOui ? 'Décocher les oui' : `Cocher les oui (${ouiPossibles.length})`}
                  </button>
                )}
                <span className={s.filtresD}>Rien n’est coché d’office</span>
              </div>
            )}
            <div className={s.liste}>
              {iaEtat.manquent > 0 && (
                <p className={s.alerte}><Icone nom="info" taille={15} epaisseur={2} /><span>{`${iaEtat.manquent} de tes biens n’${iaEtat.manquent > 1 ? 'ont' : 'a'} pas pu être relu${iaEtat.manquent > 1 ? 's' : ''}${iaEtat.erreur ? ` (${iaEtat.erreur})` : ''} : « Refaire » le relira.`}</span></p>
              )}
              {iaEtat.info && <p className={s.alerte}><Icone nom="info" taille={15} epaisseur={2} /><span>{iaEtat.info}</span></p>}
              {pasPour > 0 && <p className={s.info}><Icone nom="info" taille={16} epaisseur={2} /><span>{`${pasPour > 1 ? `${pasPour} de tes biens ne remontent pas` : '1 de tes biens ne remonte pas'} : tu as écarté ${prenom} depuis ${pasPour > 1 ? 'leur fiche' : 'sa fiche'} (« Pas pour lui »).`}</span></p>}
              {nouveaux.length === 0 && anciens.length > 0 ? (
                <div className={s.vide}>
                  <span className={s.videIc}><Icone nom="loupe" taille={26} epaisseur={2} /></span>
                  <b>{`Rien de nouveau depuis le ${jourLong(dernierLe)}.`}</b>
                  <span>{`Les ${anciens.length} ${pl(anciens.length, 'bien déjà vu est replié', 'biens déjà vus sont repliés')} juste en dessous.`}</span>
                </div>
              ) : res.trouves.length === 0 ? (
                <div className={s.vide}>
                  <span className={s.videIc}><Icone nom="loupe" taille={26} epaisseur={2} /></span>
                  <b>{`Aucun bien à 50 % et plus sur ${res.compares} comparé${res.compares > 1 ? 's' : ''}.`}</b>
                  <span>{source === 'mandats' ? 'Essayez aussi les veilles : les biens trouvés pour vos autres clients.' : 'Essayez une période plus longue, ou revenez quand de nouveaux biens seront arrivés.'}</span>
                  <button type="button" className={s.btn} onClick={() => setEtape('choix')}>Changer de recherche</button>
                </div>
              ) : (
                <>
                  {relus.length > 0 && <span className={s.sur}>{`Tes biens en vente · relus pour ${prenom}`}</span>}
                  {(['oui', 'a_voir', 'non'] as const).map(v => {
                    const l = relus.filter(y => groupeDe(y.a) === v);
                    if (!l.length) return null;
                    const replie = v === 'non' && !voirNon;
                    const tete = (
                      <>
                        <IconeAvis v={v} t={22} />
                        <b>{MOT_IA[v]}</b>
                        <strong>{l.length}</strong>
                        <span>{v === 'oui' ? `Ils peuvent plaire à ${prenom}.` : v === 'a_voir' ? 'Un point à vérifier avec lui.' : 'Le rapprochement les écarte.'}</span>
                      </>
                    );
                    return (
                      <div key={v} className={s.groupe}>
                        {v === 'non'
                          ? <button type="button" className={`${s.groupeT} ${s.groupeBtn}`} aria-expanded={!replie} onClick={() => setVoirNon(o => !o)}>{tete}<em>{replie ? 'Voir pourquoi' : 'Replier'}</em></button>
                          : <div className={s.groupeT}>{tete}</div>}
                        {!replie && l.map((y, i) => ligne(y.t, i))}
                      </div>
                    );
                  })}
                  {veillesL.length > 0 && <span className={s.sur} style={{ marginTop: relus.length ? 12 : 0 }}>{'Les annonces de tes veilles · la note de leurs critères'}</span>}
                  {veillesL.map((t, i) => ligne(t, i))}
                </>
              )}
              {anciens.length > 0 && (
                <>
                  <button type="button" className={s.anciens} aria-expanded={voirAnciens} onClick={() => setVoirAnciens(v => !v)}>
                    <span className={voirAnciens ? s.chevOuvert : s.chev}><Icone nom="chevron" taille={16} epaisseur={2.2} /></span>
                    <b>{`Déjà ${pl(anciens.length, 'vu', 'vus')}${dernierLe ? ` le ${jourLong(dernierLe)}` : ''}, pas ${pl(anciens.length, 'retenu', 'retenus')} · ${anciens.length}`}</b>
                    <span>{voirAnciens ? 'Replier' : 'Repliés pour ne pas te les remontrer. Un clic pour les revoir.'}</span>
                  </button>
                  {voirAnciens && anciens.map((t, i) => ligne(t, i))}
                </>
              )}
            </div>
            {res.trouves.length > 0 && (
              <div className={s.piedChoix}>
                <div className={s.piedChoixT}>
                  <span className={s.piedN}><b>{choisis.size}</b>{choisis.size > 1 ? ' biens cochés' : ' bien coché'}</span>
                  <span className={s.piedQ}>{`Que faire ${pl(choisis.size, 'du bien coché', 'des biens cochés')} ? Dans tous les cas, son Suivi le note.`}</span>
                </div>
                <div className={s.opts}>
                  <button type="button" className={s.opt} onClick={() => poser('selection')} disabled={!choisis.size || !!pose}>
                    <span className={s.optIc}><Icone nom="liste" taille={19} epaisseur={2.1} /></span>
                    <span className={s.optTx}>
                      <b><span className={s.optLong}>{pose === 'selection' ? 'Ajout…' : choisis.size > 1 ? 'Les mettre dans sa sélection' : 'Le mettre dans sa sélection'}</span><span className={s.optCourt}>{pose === 'selection' ? 'Ajout…' : 'Sélection'}<i>{'rien ne part'}</i></span></b>
                      <small>{`Onglet Sélection de ${prenom}. Rien ne part : tu l’enverras plus tard, quand tu voudras.`}</small>
                    </span>
                  </button>
                  <button type="button" className={s.opt} onClick={() => poser('espace')} disabled={!choisis.size || !!pose}>
                    <span className={s.optIc}><Icone nom="maison" taille={19} epaisseur={2.1} /></span>
                    <span className={s.optTx}>
                      <b><span className={s.optLong}>{pose === 'espace' ? 'Présentation…' : choisis.size > 1 ? 'Les mettre dans son espace' : 'Le mettre dans son espace'}</span><span className={s.optCourt}>{pose === 'espace' ? 'Présentation…' : 'Son espace'}<i>{'sans mail'}</i></span></b>
                      <small>{`Sans mail : le bien passe dans Présentés et ${prenom} le voit dans son espace. Son téléphone le prévient s’il a accepté les alertes.`}</small>
                    </span>
                  </button>
                  <button type="button" className={`${s.opt} ${s.optOr}`} onClick={() => poser('mail')} disabled={!choisis.size || !!pose}>
                    <span className={s.optIc}><Icone nom="envoyer" taille={19} epaisseur={2.1} /></span>
                    <span className={s.optTx}>
                      <b><span className={s.optLong}>{pose === 'mail' ? 'Préparation…' : choisis.size > 1 ? 'Les lui envoyer par mail' : 'Le lui envoyer par mail'}</span><span className={s.optCourt}>{pose === 'mail' ? 'Préparation…' : 'Par mail'}<i>{'tu le relis'}</i></span></b>
                      <small>{`Le mail habituel s’ouvre, tu le relis, il part. Le bien passe dans Présentés, et ${prenom} le voit dans son espace.`}</small>
                    </span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {apercu && (
        <div className={s.voileApercu} onMouseDown={e => { if (e.target === e.currentTarget) setApercu(null); }}>
          <div className={s.apercu} role="dialog" aria-modal="true" aria-label={apercu.titre}>
            <button type="button" className={s.fermerA} aria-label="Fermer l’aperçu" onClick={() => setApercu(null)}><Icone nom="fermer" taille={16} epaisseur={2.2} /></button>
            <Photo t={apercu} grande />
            {apercu.photos.length > 1 && (
              <div className={s.vignettes}>
                {apercu.photos.slice(1, 5).map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u + i} src={u} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ))}
              </div>
            )}
            <div className={s.apercuCorps}>
              <div className={s.apercuTete}>
                <div>
                  <h3>{apercu.titre}</h3>
                  {apercu.lieu && <p>{apercu.lieu}</p>}
                </div>
                <Note n={apercu.corr.note} />
              </div>
              <div className={s.apercuPrix}>
                <b>{EUR(apercu.prix) || 'Prix non indiqué'}</b>
                <Source t={apercu} />
              </div>
              {avisDe(apercu) && (
                <div className={s.apercuAvis}>
                  <span className={s.sur}>{`Ce qu’en dit le rapprochement${typeof avisDe(apercu)!.s === 'number' ? ` · ${avisDe(apercu)!.s} sur 100` : ''}`}</span>
                  <AvisDetail avis={avisDe(apercu)!} />
                </div>
              )}
              <div className={s.faits}>
                {apercu.surface ? <span>{`${apercu.surface} m²`}</span> : null}
                {apercu.pieces ? <span>{`${apercu.pieces} pièce${apercu.pieces > 1 ? 's' : ''}`}</span> : null}
                {apercu.chambres ? <span>{`${apercu.chambres} chambre${apercu.chambres > 1 ? 's' : ''}`}</span> : null}
              </div>
              <span className={s.sur}>{`Face à ses critères`}</span>
              <div className={s.crit}>
                {apercu.corr.lignes.map((l, i) => (
                  <div key={l.lib + i} className={s.critL} data-etat={l.etat}>
                    <span className={s.critIc}><Icone nom={l.etat === 'oui' ? 'coche' : l.etat === 'presque' ? 'moins' : 'fermer'} taille={12} epaisseur={3} /></span>
                    <span className={s.critLib}>{l.lib}</span>
                    <span className={s.critV}>{l.valeur}</span>
                    <span className={s.critD}>{l.demande}</span>
                  </div>
                ))}
              </div>
              {ancien(apercu) && <p className={s.vieuxA}>{`Trouvé le ${jourCourt(apercu.le)} : l’annonce est peut-être déjà vendue. Ouvrez-la avant de l’envoyer.`}</p>}
            </div>
            <div className={s.apercuPied}>
              {apercu.url && <a className={s.btn} href={apercu.url} target="_blank" rel="noopener noreferrer"><Icone nom="lien" taille={15} epaisseur={2.1} />Voir l’annonce</a>}
              {apercu.source === 'mandat' && apercu.vente && onFicheBien && (
                <button type="button" className={s.btn} onClick={() => onFicheBien(apercu.vente!.id)}><Icone nom="maison" taille={15} epaisseur={2.1} />Fiche du bien</button>
              )}
              <span style={{ flexGrow: 1 }} />
              <button type="button" className={`${s.btn} ${choisis.has(apercu.cle) ? '' : s.btnOr}`} onClick={() => basculer(apercu.cle)}>
                <Icone nom={choisis.has(apercu.cle) ? 'fermer' : 'coche'} taille={15} epaisseur={2.4} />{choisis.has(apercu.cle) ? 'Retirer du choix' : 'Choisir ce bien'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(fenetre, document.body);
}

/* ══ L'onglet Rapprochement d'un acheteur : le guide (V3.112) ═══════════════
   Maquette C : ce que fait le rapprochement, en trois temps, puis « Où
   chercher ? » (deux cases à cocher : ses mandats, les veilles), le dernier
   rapprochement, « Seulement les nouveautés » ou « Tout revoir », et
   « Lancer le rapprochement » — la fenêtre s'ouvre sur la recherche. */
export function GuideRapprochement({ client, recherche, illu, dernier, onLancer }: {
  client: Ligne; recherche: Ligne;
  /* L'illustration de la fiche (l'acheteur et ses biens). */
  illu?: ReactNode;
  dernier: { le: string; n: number } | null;
  onLancer: (o: DepartRappro) => void;
}) {
  const prenom = client.prenom || 'ce client';
  const [mandats, setMandats] = useState(true);
  const [veilles, setVeilles] = useState(true);
  const [periode, setPeriode] = useState<PeriodeVeille>(90);
  const [nouveautes, setNouveautes] = useState(true);
  const [comptes, setComptes] = useState<{ mandats: number; veilles: Record<number, number> } | null>(null);
  useEffect(() => {
    let vivant = true;
    compterSources(String(recherche.id), String(client.id)).then(c => { if (vivant) setComptes(c); }).catch(() => { if (vivant) setComptes({ mandats: 0, veilles: {} }); });
    return () => { vivant = false; };
  }, [recherche.id, client.id]);
  const nbV = comptes ? comptes.veilles[periode] ?? 0 : null;
  const source: SourceRappro = mandats && veilles ? 'deux' : mandats ? 'mandats' : 'veilles';
  const rien = !mandats && !veilles;

  return (
    <section className={s.guide} aria-label={`Rapprochement pour ${prenom}`}>
      <div className={s.guideTete}>
        {illu}
        <div className={s.guideTx}>
          <h2>{`Quels biens de ta base pourraient plaire à ${prenom} ?`}</h2>
          <p>{'On compare sa recherche avec '}<b>{'les biens que tu vends'}</b>{' et avec '}<b>{'les annonces que tes veilles ont trouvées pour tes autres clients'}</b>{'. Puis le rapprochement relit en détail tes biens en vente face à tout son dossier : pour chacun, un avis, une note de potentiel sur 100, ses plus et ses moins.'}</p>
        </div>
      </div>
      <ol className={s.temps}>
        <li><i>1</i><span><b>{'Coche où chercher'}</b>{' : tes mandats, tes veilles, ou les deux'}</span></li>
        <li><i>2</i><span><b>{'Lance le rapprochement'}</b>{' : il trie, puis relit tes biens en vente'}</span></li>
        <li><i>3</i><span><b>{'Coche ceux qui lui iraient'}</b>{' : dans sa sélection, ou par mail'}</span></li>
      </ol>

      <div className={s.ou}>
        <div className={s.ouT}><i>1</i><h3>{'Où chercher ?'}</h3><span>{'Coche l’un, l’autre, ou les deux.'}</span></div>
        <div className={s.sources}>
          <label className={`${s.source} ${mandats ? s.sourceOn : ''}`}>
            <input type="checkbox" checked={mandats} onChange={e => setMandats(e.target.checked)} />
            <span className={s.sourceIc}><Icone nom="maison" taille={18} epaisseur={2} /></span>
            <span className={s.sourceTx}>
              <span className={s.sourceL1}><b>{'Mes biens en vente'}</b><strong>{comptes ? comptes.mandats : '…'}</strong></span>
              <small>{'Tes mandats à l’étape « En vente ». Ni les estimations, ni les biens déjà sous offre ou sous compromis.'}</small>
            </span>
          </label>
          <label className={`${s.source} ${veilles ? s.sourceOn : ''}`}>
            <input type="checkbox" checked={veilles} onChange={e => setVeilles(e.target.checked)} />
            <span className={s.sourceIc}><Icone nom="loupe" taille={18} epaisseur={2} /></span>
            <span className={s.sourceTx}>
              <span className={s.sourceL1}><b>{'Les annonces de mes veilles'}</b><strong>{nbV == null ? '…' : nbV}</strong></span>
              <small>{`Trouvées pour tes autres clients, hors celles que tu as écartées. Celles de ${prenom} sont déjà dans sa Veille.`}</small>
              <span className={s.periodes} role="group" aria-label="Trouvées depuis">
                {PERIODES.map(x => (
                  <button key={x.k} type="button" className={periode === x.k ? s.periodeOn : ''} aria-pressed={periode === x.k}
                    onClick={e => { e.preventDefault(); setPeriode(x.k); setVeilles(true); }}>{x.l}</button>
                ))}
              </span>
            </span>
          </label>
        </div>
        <div className={s.lancer}>
          <span className={s.dernier}>
            <Icone nom="horloge" taille={16} epaisseur={2} />
            {dernier
              ? <span><b>{`Dernier rapprochement le ${jourLong(dernier.le)}`}</b>{` : ${dernier.n} ${pl(dernier.n, 'bien trouvé', 'biens trouvés')}.`}</span>
              : <span>{`Aucun rapprochement encore pour ${prenom}.`}</span>}
          </span>
          {dernier && (
            <span className={s.radios} role="radiogroup" aria-label="Quoi montrer">
              <label><input type="radio" name="rappro-quoi" checked={nouveautes} onChange={() => setNouveautes(true)} />{'Seulement les nouveautés'}</label>
              <label><input type="radio" name="rappro-quoi" checked={!nouveautes} onChange={() => setNouveautes(false)} />{'Tout revoir'}</label>
            </span>
          )}
          <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={rien} onClick={() => onLancer({ source, periode, nouveautes: !!dernier && nouveautes })}>
            <Icone nom="loupe" taille={17} epaisseur={2.2} />{'Lancer le rapprochement'}
          </button>
        </div>
        {rien && <p className={s.info}><Icone nom="info" taille={16} epaisseur={2} /><span>{'Coche au moins une des deux cases.'}</span></p>}
      </div>
    </section>
  );
}

/* ══ Les rapprochements faits, datés et dépliables (V3.126) ══════════════════
   Alexandre : « je clique et je vois ce qui a été fait ». Chaque ligne du
   Suivi « Rapprochement » garde ce qui a été proposé ce jour-là
   (`metadata.lignes`, noterRapprochement) : le plus récent est déplié, les
   autres se déplient d'un clic. Les lignes d'avant la V3.126 n'ont que leur
   nombre de biens. */
type LigneJournal = { id: string; created_at: string; description?: string | null; metadata?: Record<string, unknown> | null };
const lignesDe = (j: LigneJournal): LigneRappro[] => (Array.isArray(j.metadata?.lignes) ? (j.metadata!.lignes as LigneRappro[]).filter(l => l && typeof l.cle === 'string') : []);
export function RapprochementsFaits({ liste, prenom, onBien }: { liste: LigneJournal[]; prenom: string; onBien?: (bienVenteId: string) => void }) {
  const [ouverts, setOuverts] = useState<string[] | null>(null);
  const premier = liste.find(j => lignesDe(j).length)?.id;
  const estOuvert = (id: string) => (ouverts === null ? id === premier : ouverts.includes(id));
  const basculer = (id: string) => setOuverts(o => { const base = o ?? (premier ? [premier] : []); return base.includes(id) ? base.filter(x => x !== id) : [...base, id]; });
  if (!liste.length) return null;
  const ligneBien = (l: LigneRappro) => {
    const corps = (
      <>
        <span className={s.rfNote} data-v={l.v || 'aucun'} title={l.v ? `Potentiel : ${l.s ?? '?'} sur 100` : `${l.n} % de ses critères`}>
          {l.v && typeof l.s === 'number' ? l.s : `${l.n} %`}
        </span>
        <span className={s.rfTx}>
          <b>{l.titre}</b>
          <small>{[l.lieu, l.prix ? EUR(l.prix) : '', l.src === 'veille' ? 'annonce d’une veille' : ''].filter(Boolean).join(' · ')}</small>
          {l.v && l.t ? <AvisDetail avis={{ v: l.v, r: l.t, s: l.s, p: l.p, m: l.m }} compact={true} sansMot={true} /> : null}
        </span>
      </>
    );
    if (l.bien && onBien) return <button key={l.cle} type="button" className={s.rfBien} onClick={() => onBien(l.bien!)}>{corps}</button>;
    if (l.url) return <a key={l.cle} className={s.rfBien} href={l.url} target="_blank" rel="noopener noreferrer">{corps}</a>;
    return <div key={l.cle} className={s.rfBien}>{corps}</div>;
  };
  return (
    <div className={s.rf}>
      {liste.map(j => {
        const l = lignesDe(j);
        const n = Number(j.metadata?.n ?? 0);
        const ouvert = l.length > 0 && estOuvert(j.id);
        const relus = l.filter(x => x.v).sort((p, q) => compareIA({ v: p.v!, r: '', s: p.s }, { v: q.v!, r: '', s: q.s }));
        const autres = l.filter(x => !x.v);
        const c = (v: AvisIA['v']) => relus.filter(x => x.v === v).length;
        return (
          <div key={j.id} className={`${s.rfLigne} ${ouvert ? s.rfOuvert : ''}`}>
            <button type="button" className={s.rfT} aria-expanded={ouvert} disabled={!l.length} onClick={() => basculer(j.id)}>
              <span className={s.rfIc}><Icone nom="etoile" taille={14} epaisseur={2} /></span>
              <span className={s.rfTitre}>
                <b>{`Rapprochement du ${dateRappro(j.created_at)}`}</b>
                <small>{[`${n} bien${n > 1 ? 's' : ''} trouvé${n > 1 ? 's' : ''}`, relus.length ? `${c('oui')} oui · ${c('a_voir')} à voir · ${c('non')} non` : '', !l.length ? 'le détail n’était pas encore gardé' : ''].filter(Boolean).join(' · ')}</small>
              </span>
              {l.length > 0 && <span className={s.rfChev}><Icone nom="chevron" taille={15} epaisseur={2.2} /></span>}
            </button>
            {ouvert && (
              <div className={s.rfC}>
                {(['oui', 'a_voir', 'non'] as const).map(v => {
                  const g = relus.filter(x => x.v === v);
                  if (!g.length) return null;
                  return (
                    <div key={v} className={s.rfGroupe}>
                      <span className={s.rfGroupeT}><IconeAvis v={v} t={18} /><b>{MOT_IA[v]}</b><i>{g.length}</i></span>
                      {g.map(ligneBien)}
                    </div>
                  );
                })}
                {autres.length > 0 && (
                  <div className={s.rfGroupe}>
                    <span className={s.rfGroupeT}><b>{relus.length ? 'Les autres biens' : `Les biens proposés à ${prenom}`}</b><i>{autres.length}</i></span>
                    {autres.map(ligneBien)}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
