'use client';
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { euros } from '@/lib/mandat';
import { num } from '@/lib/actes';
import {
  ETAPES_BIEN, argentBien, colonnesBien, controleAnnonce, lirePieces, lirePhotos, m2, pourcent, titreBien,
  type BienVente, type Donnees, type EtapeBien, type SuiviVente,
} from '@/lib/biens-vente';
import { Croix, Ic } from '@/components/documents/ApercuActe';
import { ChampBien, habitable, manquesBien } from './ChampsBien';
import CarteBien from './CarteBien';
import { bienVide, changerEtape, enregistrerBien, supprimerBien } from './outils';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';

/* ═══ L'éditeur d'un bien en vente ═══════════════════════════════════════
   Plein écran, comme celui des documents : à gauche les questions, étape
   par étape ou tout sur une page ; à droite la carte du bien telle qu'elle
   paraîtra dans la liste, ses chiffres et ce qui manque à l'annonce. Au
   téléphone, deux onglets : Questions / Aperçu.

   Tout s'enregistre seul, 0,8 s après la dernière frappe. */

type Enreg = 'ok' | 'attente' | 'encours' | { erreur: string };

function BlocEtape({ e, i, d, maj, bienId }: { e: EtapeBien; i: number; d: Donnees; maj: (cle: string, v: unknown) => void; bienId: string }) {
  return (
    <section className={s.etape} data-etape={e.id}>
      <div className={s.etapeTete}>
        <span className={s.etapeIc}><Ic n={e.ic} t={20} /></span>
        <div>
          <div className={s.etapeN}>{`Étape ${i + 1} sur ${ETAPES_BIEN.length}`}</div>
          <h2 className={s.etapeT}>{e.titre}</h2>
          <p className={s.etapeS}>{e.sous}</p>
        </div>
      </div>
      <div className={s.grille}>
        {e.champs.map(c => <Fragment key={c.cle}><ChampBien c={c} d={d} maj={maj} off={false} bienId={bienId} /></Fragment>)}
      </div>
    </section>
  );
}

/* L'aperçu : la carte, les chiffres, l'annonce. */
function Apercu({ bien, d, suivi, nbAcheteurs, nbVisites, nbOffres }: { bien: BienVente; d: Donnees; suivi: SuiviVente[]; nbAcheteurs: number; nbVisites: number; nbOffres: number }) {
  const pseudo: BienVente = { ...bien, donnees: d, ...colonnesBien(d) };
  const a = argentBien(d);
  const surf = num(d, 'carrez') || num(d, 'surface');
  const ctrl = controleAnnonce(d);
  const pieces = lirePieces(d.detailPieces);
  const total = pieces.filter(p => habitable(p)).reduce((t, p) => t + (p.surface || 0), 0);
  const charges = num(d, 'chargesAn');
  return (
    <div className={b.apercu}>
      <div className={s.edApercuT}><span>La carte dans la liste</span></div>
      <CarteBien bien={pseudo} suivi={suivi} nbAcheteurs={nbAcheteurs} nbVisites={nbVisites} nbOffres={nbOffres} />
      <div className={b.bloc}>
        <div className={b.blocT}><span className={b.blocIc}><Ic n="euro" t={15} /></span><h3>Les chiffres</h3></div>
        <div className={b.lignes}>
          <div className={b.li}><span>Prix affiché</span><b>{a.prix ? euros(a.prix) : '—'}</b></div>
          <div className={b.li}><span>{a.acq ? 'Honoraires (acquéreur)' : 'Honoraires (vendeur)'}</span><b>{a.hono !== null ? `${euros(a.hono)}${a.taux ? ` · ${pourcent(a.taux)}` : ''}` : '—'}</b></div>
          <div className={b.li}><span>Net vendeur</span><b>{a.net ? euros(a.net) : '—'}</b></div>
          <div className={b.li}><span>Prix au m²</span><b>{a.prix && surf ? euros(a.prix / surf) : '—'}</b></div>
          {charges ? <div className={b.li}><span>Charges de copropriété</span><b>{`${euros(charges / 12)} / mois`}</b></div> : null}
          {num(d, 'taxeFonciere') ? <div className={b.li}><span>Taxe foncière</span><b>{`${euros(num(d, 'taxeFonciere') as number)} / an`}</b></div> : null}
        </div>
      </div>
      <div className={b.bloc}>
        <div className={b.blocT}><span className={b.blocIc}><Ic n="megaphone" t={15} /></span><h3>L’annonce</h3></div>
        <ul className={b.controle} style={{ border: 'none', padding: 0, background: 'none' }}>
          {ctrl.map(x => (
            <li key={x.l}>
              <span className={`${s.k} ${x.ok ? s.kVert : s.kRouge}`} style={{ width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {x.ok ? <Ic n="check" t={11} e={3} /> : <Croix t={11} />}
              </span>
              <span>{x.l}</span>
            </li>
          ))}
        </ul>
      </div>
      {pieces.length > 0 && (
        <div className={b.bloc}>
          <div className={b.blocT}><span className={b.blocIc}><Ic n="plan" t={15} /></span><h3>{`Les pièces · ${pieces.length}`}</h3></div>
          <div className={b.tags}>{pieces.map(p => <span key={p.id} className={b.tag}>{`${p.nom || '…'}${p.surface ? ` · ${m2(p.surface)}` : ''}`}</span>)}</div>
          {total > 0 && <div className={b.pied}>{`Pièces à vivre : ${m2(total)}`}</div>}
        </div>
      )}
    </div>
  );
}

export default function EditeurBien({ bien, etapeDepart, nouveau = false, suivi, nbAcheteurs, nbVisites = 0, nbOffres = 0, onMaj, onFermer }: {
  bien: BienVente;
  etapeDepart?: string;
  nouveau?: boolean;
  suivi: SuiviVente[];
  nbAcheteurs: number;
  nbVisites?: number;
  nbOffres?: number;
  onMaj: (b: BienVente) => void;
  /* null : le bien, créé puis laissé vide, a été supprimé. */
  onFermer: (b: BienVente | null) => void;
}) {
  const [row, setRow] = useState<BienVente>(bien);
  const [d, setD] = useState<Donnees>(() => ({ ...(bien.donnees || {}) }));
  const [etape, setEtape] = useState(() => Math.max(0, ETAPES_BIEN.findIndex(e => e.id === etapeDepart)));
  const [vue, setVue] = useState<'form' | 'apercu'>('form');
  const [mode, setMode] = useState<'etapes' | 'tout'>(() => {
    try { return localStorage.getItem('biens.mode') === 'tout' ? 'tout' : 'etapes'; } catch { return 'etapes'; }
  });
  const choisirMode = (x: 'etapes' | 'tout') => {
    setMode(x);
    try { localStorage.setItem('biens.mode', x); } catch { /* sans mémoire, tant pis */ }
  };
  const [enreg, setEnreg] = useState<Enreg>('ok');
  const [fin, setFin] = useState(false);
  const [travail, setTravail] = useState(false);
  const [erreurFin, setErreurFin] = useState('');
  const formRef = useRef<HTMLDivElement>(null);

  /* ── L'enregistrement automatique ── */
  const dernier = useRef<Donnees>(d);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVol = useRef<Promise<boolean> | null>(null);
  const aEnregistrer = useRef(false);

  const enregistrer = useCallback(async (): Promise<boolean> => {
    if (enVol.current) await enVol.current;
    if (!aEnregistrer.current) return true;
    aEnregistrer.current = false;
    const donnees = dernier.current;
    setEnreg('encours');
    const p = (async () => {
      try {
        const r = await enregistrerBien(row.id, donnees);
        setRow(r); onMaj(r);
        setEnreg(aEnregistrer.current ? 'attente' : 'ok');
        return true;
      } catch (e) {
        aEnregistrer.current = true;
        setEnreg({ erreur: (e as Error).message });
        return false;
      }
    })();
    enVol.current = p;
    const ok = await p;
    enVol.current = null;
    return ok;
  }, [row.id, onMaj]);

  const maj = useCallback((cle: string, v: unknown) => {
    setD(prev => {
      const n = { ...prev, [cle]: typeof v === 'function' ? (v as (avant: unknown) => unknown)(prev[cle]) : v };
      dernier.current = n;
      return n;
    });
    aEnregistrer.current = true;
    setEnreg('attente');
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => { enregistrer(); }, 800);
  }, [enregistrer]);

  useEffect(() => {
    const avant = (e: BeforeUnloadEvent) => { if (aEnregistrer.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', avant);
    return () => window.removeEventListener('beforeunload', avant);
  }, []);
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);

  /* Échap ferme, comme une fenêtre (sauf quand une fenêtre est ouverte). */
  const fermerRef = useRef<() => void>(() => {});
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !fin) fermerRef.current(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [fin]);

  async function vider(): Promise<boolean> {
    if (minuterie.current) clearTimeout(minuterie.current);
    if (!aEnregistrer.current) return true;
    return enregistrer();
  }

  async function fermer() {
    const ok = await vider();
    if (nouveau && bienVide(dernier.current)) {
      try { await supprimerBien({ ...row, donnees: dernier.current }); onFermer(null); return; } catch { /* on le garde */ }
    }
    if (!ok && !confirm('La dernière modification n’a pas pu être enregistrée.\n\nFermer quand même ?')) return;
    onFermer(row);
  }
  fermerRef.current = () => { void fermer(); };

  async function terminer() {
    const ok = await vider();
    if (!ok) return;
    if (nouveau && bienVide(dernier.current)) { await fermer(); return; }
    if (nouveau && row.etape === 'estimation') { setFin(true); return; }
    onFermer(row);
  }

  async function finir(etapeChoisie: 'estimation' | 'mandat') {
    setErreurFin('');
    if (etapeChoisie === 'estimation') { onFermer(row); return; }
    setTravail(true);
    try {
      const { bien: r } = await changerEtape(row, 'mandat', { infos: { depuis: 'creation' } });
      onMaj(r);
      onFermer(r);
    } catch (e) { setErreurFin((e as Error).message); setTravail(false); }
  }

  const dd = useDeferredValue(d);
  const manquesParEtape = useMemo(() => ETAPES_BIEN.map(e => manquesBien(e.champs, d)), [d]);

  const suivreDefilement = useCallback(() => {
    if (mode !== 'tout' || !formRef.current) return;
    const zone = formRef.current;
    const haut = zone.getBoundingClientRect().top + 140;
    const blocs = Array.from(zone.querySelectorAll<HTMLElement>('[data-etape]'));
    let i = 0;
    blocs.forEach((x, k) => { if (x.getBoundingClientRect().top <= haut) i = k; });
    if (zone.scrollTop + zone.clientHeight >= zone.scrollHeight - 4) i = blocs.length - 1;
    setEtape(i);
  }, [mode]);

  /* Ouvert sur une étape précise (« Modifier » d'un bloc de la fiche), en
     mode « tout sur une page » : on y descend. */
  useEffect(() => {
    if (mode !== 'tout' || !etapeDepart) return;
    const t = setTimeout(() => {
      const zone = formRef.current;
      const x = zone?.querySelector<HTMLElement>(`[data-etape="${etapeDepart}"]`);
      if (zone && x) zone.scrollTo({ top: x.getBoundingClientRect().top - zone.getBoundingClientRect().top + zone.scrollTop - 12 });
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aller = (i: number) => {
    const k = Math.max(0, Math.min(ETAPES_BIEN.length - 1, i));
    setEtape(k);
    setVue('form');
    if (mode === 'tout') {
      requestAnimationFrame(() => {
        const zone = formRef.current;
        const x = zone?.querySelector<HTMLElement>(`[data-etape="${ETAPES_BIEN[k].id}"]`);
        if (zone && x) zone.scrollTo({ top: x.getBoundingClientRect().top - zone.getBoundingClientRect().top + zone.scrollTop - 12, behavior: 'smooth' });
      });
    } else formRef.current?.scrollTo({ top: 0 });
  };

  const texteEnreg = enreg === 'ok' ? 'Enregistré'
    : enreg === 'attente' ? 'Modifications en attente…'
      : enreg === 'encours' ? 'Enregistrement…'
        : `Non enregistré : ${enreg.erreur}`;
  const nbPhotos = lirePhotos(d.photos).length;

  return (
    <div className={s.ed} role="dialog" aria-modal="true" aria-label={titreBien(d)}>
      <div className={s.edBarre}>
        <button type="button" className={s.edRetour} onClick={fermer}><Ic n="retour" t={16} /><span>{nouveau ? 'Biens en vente' : 'La fiche'}</span></button>
        <div className={s.edTitre}>
          <b>{nouveau && !d.typeBien ? 'Nouveau bien' : titreBien(d)}</b>
          <div className={s.edEtat}>
            {row.reference && <span className={`${s.statut} ${s.t_gris}`}>{row.reference}</span>}
            <span className={typeof enreg === 'object' ? s.ko : enreg === 'ok' ? s.ok : undefined}>{texteEnreg}</span>
          </div>
        </div>
        <div className={s.edBoutons}>
          <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={terminer}><Ic n="check" t={15} e={2.4} />{nouveau ? 'Terminer' : 'Fermer'}</button>
        </div>
      </div>

      <nav className={s.edPas} aria-label="Étapes">
        {ETAPES_BIEN.map((e, i) => {
          const n = manquesParEtape[i];
          const rempli = e.id === 'photos' ? nbPhotos > 0 : e.id === 'pieces' ? lirePieces(d.detailPieces).length > 0 : true;
          const ok = n === 0 && rempli;
          return (
            <button key={e.id} type="button" className={`${s.pas} ${i === etape ? s.pasOn : ''} ${ok ? s.pasOk : ''}`}
              aria-current={i === etape ? 'step' : undefined} onClick={() => aller(i)}>
              <span className={s.pasN}>{ok && i !== etape ? <Ic n="check" t={12} e={3} /> : i + 1}</span>
              <span>{e.titre}</span>
              {n > 0 && <span className={s.pasManque} title={`${n} information${n > 1 ? 's' : ''} à compléter`}>{n}</span>}
            </button>
          );
        })}
        <div className={s.modes} role="group" aria-label="Affichage des questions">
          <button type="button" aria-pressed={mode === 'etapes'} onClick={() => choisirMode('etapes')} title="Une étape à la fois">
            <Ic n="lignes" t={14} /><span>Étape par étape</span>
          </button>
          <button type="button" aria-pressed={mode === 'tout'} onClick={() => choisirMode('tout')} title="Toutes les questions à la suite, en blocs">
            <Ic n="doc" t={14} /><span>Tout sur une page</span>
          </button>
        </div>
      </nav>

      <div className={s.edOnglets} role="group" aria-label="Affichage">
        <button type="button" aria-pressed={vue === 'form'} onClick={() => setVue('form')}><Ic n="plume" t={15} />Questions</button>
        <button type="button" aria-pressed={vue === 'apercu'} onClick={() => setVue('apercu')}><Ic n="oeil" t={15} />Aperçu</button>
      </div>

      <div className={s.edCorps} data-vue={vue}>
        <div className={s.edForm} ref={formRef} onScroll={mode === 'tout' ? suivreDefilement : undefined}>
          <div className={s.edFormIn}>
            {mode === 'tout'
              ? ETAPES_BIEN.map((e, i) => <BlocEtape key={e.id} e={e} i={i} d={d} maj={maj} bienId={row.id} />)
              : <BlocEtape e={ETAPES_BIEN[etape]} i={etape} d={d} maj={maj} bienId={row.id} />}
            <div className={s.suite}>
              {mode === 'etapes' && etape > 0 ? <button type="button" className={s.btn} onClick={() => aller(etape - 1)}><Ic n="retour" t={15} />{ETAPES_BIEN[etape - 1].titre}</button> : <span />}
              {mode === 'etapes' && etape < ETAPES_BIEN.length - 1
                ? <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={() => aller(etape + 1)}>{`Étape suivante : ${ETAPES_BIEN[etape + 1].titre}`}</button>
                : <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={terminer}><Ic n="check" t={15} e={2.4} />{nouveau ? 'Terminer' : 'Fermer'}</button>}
            </div>
          </div>
        </div>
        <div className={s.edApercu}>
          <Apercu bien={row} d={dd} suivi={suivi} nbAcheteurs={nbAcheteurs} nbVisites={nbVisites} nbOffres={nbOffres} />
        </div>
      </div>

      <div className={s.edPied}>
        {mode === 'etapes' && <button type="button" className={s.btn} disabled={etape === 0} onClick={() => aller(etape - 1)}><Ic n="retour" t={15} />Précédent</button>}
        {mode === 'etapes' && etape < ETAPES_BIEN.length - 1
          ? <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={() => aller(etape + 1)}>Suivant</button>
          : <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={terminer}>{nouveau ? 'Terminer' : 'Fermer'}</button>}
      </div>

      {fin && (
        <div className={s.fenetre} onClick={e => { if (e.target === e.currentTarget && !travail) setFin(false); }}>
          <div className={s.fenetreIn} role="dialog" aria-modal="true" aria-label="Où en est ce bien ?">
            <div className={s.fenTete}>
              <div style={{ flex: '1 1 auto' }}>
                <h3>Où en est ce bien ?</h3>
                <p>Il est enregistré. Il se range dans la liste selon son étape : tu la changeras ensuite depuis sa fiche.</p>
              </div>
              <button type="button" className={s.panFermer} aria-label="Fermer" disabled={travail} onClick={() => setFin(false)}><Croix /></button>
            </div>
            <div className={s.fenCorps}>
              <button type="button" className={s.choix} disabled={travail} onClick={() => finir('estimation')}>
                <span className={s.modeleIc} style={{ width: 38, height: 38 }}><Ic n="regle" t={18} /></span>
                <span><b>À l’estimation</b><small>Le mandat n’est pas encore signé : rendez-vous, avis de valeur.</small></span>
              </button>
              <button type="button" className={s.choix} disabled={travail} onClick={() => finir('mandat')}>
                <span className={s.modeleIc} style={{ width: 38, height: 38 }}><Ic n="plume" t={18} /></span>
                <span><b>Le mandat est signé : il est en vente</b><small>Il passe « En vente » et les acheteurs qui correspondent s’affichent sur sa fiche.</small></span>
              </button>
              {erreurFin && <div className={s.erreur}>{erreurFin}</div>}
            </div>
            <div className={s.fenPied} />
          </div>
        </div>
      )}
    </div>
  );
}
