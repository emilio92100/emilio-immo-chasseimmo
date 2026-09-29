'use client';
/* ═══ Le rapprochement, depuis la fiche d'un acheteur (V3.29) ═══════════
   Trois temps, dans une seule fenêtre :
   1. où chercher (mes mandats, les veilles des autres clients, les deux ;
      pour les veilles, depuis quand) ;
   2. ça cherche (une petite animation, le temps de comparer) ;
   3. les biens trouvés, à 50 % et plus, avec leur note. Un aperçu simple
      pour chacun ; on coche, puis « Mettre en sélection » ou « Envoyer par
      mail » (le mail d'envoi habituel de la fiche, rien de nouveau).
   Le calcul est dans src/lib/rapprochement.ts. */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icone } from './ParcoursBien';
import {
  compterSources, rapprocher, poserEnSelection, noterRapprochement, PERIODES,
  type SourceRappro, type PeriodeVeille, type Trouve,
} from '@/lib/rapprochement';
import { SEUIL_CORRESPOND } from '@/components/biens/outils';
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
    ? <span className={`${s.src} ${s.srcMandat}`}><Icone nom="etiquette" taille={12} epaisseur={2.2} />Votre mandat</span>
    : <span className={`${s.src} ${s.srcVeille}`} title={t.pour ? `Trouvé par la veille de ${t.pour}` : undefined}>
      <Icone nom="loupe" taille={12} epaisseur={2.2} />{`Veille${t.pour ? ` · ${t.pour.split(' ')[0]}` : ''}${t.le ? ` · ${jourCourt(t.le)}` : ''}`}
    </span>;
}

export default function Rapprochement({ client, recherche, resume, onFermer, onFini, onFicheBien }: {
  client: Ligne; recherche: Ligne; resume: string;
  onFermer: () => void;
  /* Les biens sont posés dans son dossier : la fiche recharge, puis ouvre la
     Sélection ou le mail d'envoi habituel sur ces biens-là. */
  onFini: (quoi: 'selection' | 'mail', ids: string[]) => void;
  onFicheBien?: (bienVenteId: string) => void;
}) {
  const prenom = client.prenom || 'ce client';
  const [etape, setEtape] = useState<'choix' | 'cherche' | 'resultats'>('choix');
  const [source, setSource] = useState<SourceRappro>('deux');
  const [periode, setPeriode] = useState<PeriodeVeille>(90);
  const [comptes, setComptes] = useState<{ mandats: number; veilles: Record<number, number> } | null>(null);
  const [res, setRes] = useState<{ trouves: Trouve[]; compares: number; dejaLa: number } | null>(null);
  const [erreur, setErreur] = useState('');
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [filtre, setFiltre] = useState<'tout' | 'mandat' | 'veille'>('tout');
  const [apercu, setApercu] = useState<Trouve | null>(null);
  const [pose, setPose] = useState<'' | 'selection' | 'mail'>('');

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

  const nbVeilles = comptes?.veilles[periode] ?? null;
  const aComparer = comptes ? (source === 'mandats' ? comptes.mandats : source === 'veilles' ? (nbVeilles || 0) : comptes.mandats + (nbVeilles || 0)) : null;

  async function lancer() {
    setErreur(''); setEtape('cherche'); setChoisis(new Set()); setFiltre('tout');
    const debut = Date.now();
    try {
      const r = await rapprocher(recherche, client.id, source, periode);
      /* L'animation se voit au moins un instant : un résultat instantané
         laissait croire que rien n'avait été cherché. */
      const reste = 1400 - (Date.now() - debut);
      if (reste > 0) await new Promise(ok => setTimeout(ok, reste));
      setRes(r);
      /* Les « correspondent » sont cochés d'office : c'est eux qu'on garde le plus souvent. */
      setChoisis(new Set(r.trouves.filter(t => t.corr.note >= SEUIL_CORRESPOND).map(t => t.cle)));
      setEtape('resultats');
      noterRapprochement(client.id, recherche.id, r.trouves.length, source, periode);
    } catch (e) {
      setErreur((e as Error).message);
      setEtape('choix');
    }
  }

  async function poser(quoi: 'selection' | 'mail') {
    if (!res || !choisis.size || pose) return;
    setPose(quoi);
    const ids: string[] = [], erreurs: string[] = [];
    for (const t of res.trouves.filter(x => choisis.has(x.cle))) {
      try { ids.push(await poserEnSelection(t, client.id, recherche.id)); } catch (e) { erreurs.push((e as Error).message); }
    }
    setPose('');
    if (erreurs.length) alert(`${erreurs.length} bien${erreurs.length > 1 ? 's' : ''} n’${erreurs.length > 1 ? 'ont' : 'a'} pas pu être ajouté${erreurs.length > 1 ? 's' : ''} :\n\n${erreurs.join('\n')}`);
    if (ids.length) onFini(quoi, ids);
  }

  const basculer = (cle: string) => setChoisis(c => { const n = new Set(c); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  const liste = useMemo(() => (res?.trouves || []).filter(t => filtre === 'tout' || t.source === filtre), [res, filtre]);
  const bons = liste.filter(t => t.corr.note >= SEUIL_CORRESPOND);
  const partiels = liste.filter(t => t.corr.note < SEUIL_CORRESPOND);
  const nbM = res?.trouves.filter(t => t.source === 'mandat').length || 0;
  const nbV = res?.trouves.filter(t => t.source === 'veille').length || 0;

  const ligne = (t: Trouve, i: number) => {
    const on = choisis.has(t.cle);
    const e = ecart(t);
    return (
      <div key={t.cle} className={`${s.ligne} ${on ? s.ligneOn : ''}`} style={{ animationDelay: `${Math.min(i, 8) * 0.05}s` }}>
        <button type="button" className={`${s.coche} ${on ? s.cocheOn : ''}`} aria-pressed={on} aria-label={on ? 'Retirer ce bien du choix' : 'Choisir ce bien'} onClick={() => basculer(t.cle)}>
          <Icone nom="coche" taille={14} epaisseur={3.2} />
        </button>
        <button type="button" className={s.ligneCorps} onClick={() => setApercu(t)}>
          <Photo t={t} />
          <Note n={t.corr.note} />
          <span className={s.ligneTx}>
            <b>{t.titre}</b>
            {t.lieu && <span>{t.lieu}</span>}
            <span className={e.ok ? s.ecartOk : s.ecartKo}>{e.texte}</span>
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
                <h2>{res.trouves.length ? `${res.trouves.length} bien${res.trouves.length > 1 ? 's' : ''} pour ${prenom}` : `Rien pour ${prenom} cette fois`}</h2>
                <p>{[
                  source !== 'veilles' ? `${nbM} de vos mandats` : '',
                  source !== 'mandats' ? `${nbV} bien${nbV > 1 ? 's' : ''} de vos veilles` : '',
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
              <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={lancer} disabled={aComparer === 0}>
                <Icone nom="etoile" taille={17} epaisseur={2.2} />Lancer le rapprochement
              </button>
            </div>
          </>
        )}

        {etape === 'cherche' && (
          <div className={s.cherche} role="status">
            <span className={s.sourire} aria-hidden="true">
              <svg viewBox="0 0 120 120" width="120" height="120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#f1e6c6" strokeWidth="6" />
                <circle className={s.anneau} cx="60" cy="60" r="52" fill="none" stroke="#c9a84c" strokeWidth="6" strokeLinecap="round" strokeDasharray="90 237" />
                <circle cx="60" cy="60" r="36" fill="#2e4166" />
                <circle className={s.oeilG} cx="48" cy="54" r="4" fill="#e8c96a" />
                <circle className={s.oeilD} cx="72" cy="54" r="4" fill="#e8c96a" />
                <path d="M46 68 Q60 80 74 68" fill="none" stroke="#e8c96a" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </span>
            <b>{`Je compare ${aComparer ?? ''} biens avec les critères de ${prenom}…`}</b>
            <span className={s.points}><i /><i /><i /></span>
          </div>
        )}

        {etape === 'resultats' && res && (
          <>
            {res.trouves.length > 0 && (
              <div className={s.filtres}>
                <button type="button" className={filtre === 'tout' ? s.puceOn : s.puce} onClick={() => setFiltre('tout')}>Tous <b>{res.trouves.length}</b></button>
                {source !== 'veilles' && <button type="button" className={filtre === 'mandat' ? s.puceOn : s.puce} onClick={() => setFiltre('mandat')}><Icone nom="etiquette" taille={13} epaisseur={2.2} />Mes mandats <b>{nbM}</b></button>}
                {source !== 'mandats' && <button type="button" className={filtre === 'veille' ? s.puceOn : s.puce} onClick={() => setFiltre('veille')}><Icone nom="loupe" taille={13} epaisseur={2.2} />Veilles <b>{nbV}</b></button>}
                <span className={s.filtresD}>La meilleure note d’abord</span>
              </div>
            )}
            <div className={s.liste}>
              {res.trouves.length === 0 ? (
                <div className={s.vide}>
                  <span className={s.videIc}><Icone nom="loupe" taille={26} epaisseur={2} /></span>
                  <b>{`Aucun bien à 50 % et plus sur ${res.compares} comparé${res.compares > 1 ? 's' : ''}.`}</b>
                  <span>{source === 'mandats' ? 'Essayez aussi les veilles : les biens trouvés pour vos autres clients.' : 'Essayez une période plus longue, ou revenez quand de nouveaux biens seront arrivés.'}</span>
                  <button type="button" className={s.btn} onClick={() => setEtape('choix')}>Changer de recherche</button>
                </div>
              ) : (
                <>
                  {bons.length > 0 && <span className={s.sur}>Correspondent · 70 % et plus</span>}
                  {bons.map(ligne)}
                  {partiels.length > 0 && <span className={s.sur} style={{ marginTop: bons.length ? 10 : 0 }}>En partie · 50 à 69 %</span>}
                  {partiels.map((t, i) => ligne(t, bons.length + i))}
                </>
              )}
            </div>
            {res.trouves.length > 0 && (
              <div className={s.pied}>
                <span className={s.piedN}><b>{choisis.size}</b>{choisis.size > 1 ? ' biens choisis' : ' bien choisi'}</span>
                <button type="button" className={s.btn} onClick={() => poser('selection')} disabled={!choisis.size || !!pose}>
                  <Icone nom="liste" taille={16} epaisseur={2.1} />{pose === 'selection' ? 'Ajout…' : 'Mettre en sélection'}
                </button>
                <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={() => poser('mail')} disabled={!choisis.size || !!pose}>
                  <Icone nom="envoyer" taille={16} epaisseur={2.1} />{pose === 'mail' ? 'Préparation…' : 'Envoyer par mail…'}
                </button>
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
