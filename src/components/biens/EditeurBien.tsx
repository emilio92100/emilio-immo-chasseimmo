'use client';
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { euros } from '@/lib/mandat';
import { num, txt } from '@/lib/actes';
import {
  argentBien, avantMandat, colonnesBien, controleAnnonce, etapeDe, etapesDuBien, lirePieces, lirePhotos, m2, pourcent, titreBien,
  type BienVente, type ChampBien as TChamp, type Donnees, type EtapeBien, type SuiviVente,
} from '@/lib/biens-vente';
import { Croix, Ic } from '@/components/documents/ApercuActe';
import { ChampBien, habitable, manquesBien, proprioOuvert } from './ChampsBien';
import CarteBien from './CarteBien';
import FilEtapes from '@/components/documents/FilEtapes';
import { bienVide, enregistrerBien, supprimerBien } from './outils';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';

/* ═══ L'éditeur d'un bien ═════════════════════════════════════════════════
   Plein écran, comme celui des documents : à gauche les questions, étape
   par étape ou tout sur une page, rangées en blocs ; à droite la carte du
   bien telle qu'elle paraîtra dans la liste, ses chiffres et ce qui manque
   à l'annonce. Au téléphone, deux onglets : Questions / Aperçu.

   Les étapes suivent l'étape de vente : tout ce qui décrit le bien se
   remplit dès « à suivre » (V3.15), les indications de visite (clés,
   codes) aussi depuis la V3.16 ; seuls l'estimation et le prix attendent
   l'étape « estimation ». Ouvert sur une
   étape qui n'existe pas encore, l'éditeur dit pourquoi.

   Tout s'enregistre seul, 0,8 s après la dernière frappe. */

type Enreg = 'ok' | 'attente' | 'encours' | { erreur: string };

/* Les questions d'une étape, en blocs : un bloc par titre de section. Les
   pièces, les photos, le dossier ont déjà leurs propres cartes : pas de cadre. */
const SANS_CADRE = ['pieces', 'photos', 'dossier'];
type Groupe = { titre: Extract<TChamp, { t: 'titre' }> | null; champs: TChamp[] };
function groupes(champs: TChamp[], d: Donnees): Groupe[] {
  const out: Groupe[] = [];
  for (const c of champs) {
    /* Un titre masqué (« L'immeuble » pour une maison) ne coupe pas : ses
       questions restent sous le titre d'avant (« La construction »). */
    if (c.t === 'titre') { if (!c.si || c.si(d)) out.push({ titre: c, champs: [] }); continue; }
    if (!out.length) out.push({ titre: null, champs: [] });
    out[out.length - 1].champs.push(c);
  }
  const vu = (c: TChamp) => !c.si || c.si(d);
  return out.filter(g => (!g.titre || vu(g.titre)) && g.champs.some(vu));
}

/* `anime` : en « étape par étape », l'étape qui arrive glisse en place,
   ses blocs l'un après l'autre (V3.16). */
function BlocEtape({ e, i, n, d, maj, bienId, anime = false }: { e: EtapeBien; i: number; n: number; d: Donnees; maj: (cle: string, v: unknown) => void; bienId: string; anime?: boolean }) {
  const champProprio = e.champs.find(c => c.t === 'proprio') || null;
  const reste = champProprio ? e.champs.filter(c => c !== champProprio) : e.champs;
  const verrou = !!champProprio && !proprioOuvert(d);
  const nouveau = d.proprioNouveau === true && !txt(d, 'clientId');
  return (
    <section className={`${s.etape} ${b.etape} ${anime ? b.etapeEntre : ''}`} data-etape={e.id}>
      <div className={s.etapeTete}>
        <span className={`${s.etapeIc} ${b.etapeIcVif}`}><Ic n={e.ic} t={22} /></span>
        <div className={b.etapeTeteTxt}>
          <div className={s.etapeN}>{`Étape ${i + 1} sur ${n}`}</div>
          <h2 className={s.etapeT}>{e.titre}</h2>
          <p className={s.etapeS}>{e.sous}</p>
          {anime && <span className={b.etapeJauge} aria-hidden="true"><i style={{ width: `${Math.round(((i + 1) / n) * 100)}%` }} /></span>}
        </div>
      </div>
      {/* « Le propriétaire » (V3.29) : d'abord sa fiche client, à part ; la
          suite reste grisée tant qu'elle n'est ni trouvée ni à créer, puis
          s'ouvre sur fond clair pour une fiche nouvelle. */}
      {champProprio && <ChampBien c={champProprio} d={d} maj={maj} off={false} bienId={bienId} />}
      {champProprio && verrou && <div className={b.verrouMot}><Ic n="cadenas" t={14} />La suite s’ouvre dès que sa fiche est choisie, ou à créer.</div>}
      <div className={verrou ? b.suiteVerrou : champProprio && nouveau ? b.suiteNouveau : b.suite} inert={verrou || undefined} aria-disabled={verrou || undefined}>
        {groupes(reste, d).map((g, k) => (
          <div key={g.titre?.cle || k} className={!g.titre && g.champs.every(c => SANS_CADRE.includes(c.t)) ? b.sectNu : b.sect}>
            {g.titre && (
              <div className={b.sectT}>
                <span className={b.sectIc}><Ic n={g.titre.ic || 'plus'} t={16} /></span>
                <div><b>{g.titre.lib}</b>{g.titre.aide && <small>{g.titre.aide}</small>}</div>
              </div>
            )}
            <div className={s.grille}>
              {/* Une même clé peut avoir deux libellés selon le type (« etages » :
                  les niveaux d'une maison, les étages d'un immeuble). */}
              {g.champs.map(c => <Fragment key={`${c.cle}:${"lib" in c ? c.lib : ""}`}><ChampBien c={c} d={d} maj={maj} off={false} bienId={bienId} /></Fragment>)}
            </div>
          </div>
        ))}
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
  const avant = avantMandat(bien.etape);
  return (
    <div className={b.apercu}>
      <div className={s.edApercuT}><span>La carte dans la liste</span></div>
      <CarteBien bien={pseudo} suivi={suivi} nbAcheteurs={nbAcheteurs} nbVisites={nbVisites} nbOffres={nbOffres} />
      {bien.etape !== 'a_suivre' && <div className={b.bloc}>
        <div className={b.blocT}><span className={b.blocIc}><Ic n="euro" t={15} /></span><h3>Les chiffres</h3></div>
        <div className={b.lignes}>
          <div className={b.li}><span>{avant ? 'Prix conseillé' : 'Prix affiché'}</span><b>{a.prix ? euros(a.prix) : '—'}</b></div>
          <div className={b.li}><span>{a.acq ? 'Honoraires (acquéreur)' : 'Honoraires (vendeur)'}</span><b>{a.hono !== null ? `${euros(a.hono)}${a.taux ? ` · ${pourcent(a.taux)}` : ''}` : '—'}</b></div>
          <div className={b.li}><span>Net vendeur</span><b>{a.net ? euros(a.net) : '—'}</b></div>
          <div className={b.li}><span>Prix au m²</span><b>{a.prix && surf ? euros(a.prix / surf) : '—'}</b></div>
          {charges ? <div className={b.li}><span>Charges de copropriété</span><b>{`${euros(charges / 12)} / mois`}</b></div> : null}
          {num(d, 'taxeFonciere') ? <div className={b.li}><span>Taxe foncière</span><b>{`${euros(num(d, 'taxeFonciere') as number)} / an`}</b></div> : null}
        </div>
      </div>}
      {!avant && <div className={b.bloc}>
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
      </div>}
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

const NOTICES: Record<string, { t: string; x: string }> = {
  prix: { t: 'Le prix se donne à l’estimation', x: 'Ce bien est « à suivre » : décris-le autant que tu veux, tout est ouvert. La fourchette et le prix conseillé viendront quand tu le passeras en estimation, avec le bouton d’étape de sa fiche.' },
};
function Notice({ id, onFermer }: { id: string; onFermer: () => void }) {
  const n = NOTICES[id] || { t: 'Cette partie s’ouvrira plus tard', x: 'Elle dépend de l’étape de vente du bien.' };
  return (
    <div className={b.notice} role="status">
      <Ic n="info" t={18} />
      <div><b>{n.t}</b>{n.x}</div>
      <button type="button" onClick={onFermer} aria-label="Fermer">✕</button>
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
  /* Les étapes du formulaire pour cette étape de vente. */
  const ETAPES = useMemo(() => etapesDuBien(row.etape), [row.etape]);
  const [etape, setEtape] = useState(() => Math.max(0, etapesDuBien(bien.etape).findIndex(e => e.id === etapeDepart)));
  /* « Modifier » d'un bloc qui n'est pas encore ouvert à cette étape de
     vente (le prix d'un bien à suivre) : on le dit, au lieu d'ouvrir
     ailleurs sans un mot. */
  const [notice, setNotice] = useState<string | null>(() => (etapeDepart && !etapesDuBien(bien.etape).some(e => e.id === etapeDepart) ? etapeDepart : null));
  const [vue, setVue] = useState<'form' | 'apercu'>('form');
  const [mode, setMode] = useState<'etapes' | 'tout'>(() => {
    try { return localStorage.getItem('biens.mode') === 'tout' ? 'tout' : 'etapes'; } catch { return 'etapes'; }
  });
  const choisirMode = (x: 'etapes' | 'tout') => {
    setMode(x);
    try { localStorage.setItem('biens.mode', x); } catch { /* sans mémoire, tant pis */ }
  };
  const [enreg, setEnreg] = useState<Enreg>('ok');
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

  /* Échap ferme, comme une fenêtre. */
  const fermerRef = useRef<() => void>(() => {});
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fermerRef.current(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

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
    onFermer(row);
  }

  /* Les données vues par les questions : avec l'étape de vente (`_stade`),
     jamais enregistrée, pour effacer ce qui ne sert pas encore. */
  const dv = useMemo(() => ({ ...d, _stade: row.etape }), [d, row.etape]);
  const dd = useDeferredValue(d);
  const manquesParEtape = useMemo(() => ETAPES.map(e => manquesBien(e.champs, dv)), [ETAPES, dv]);

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
    const k = Math.max(0, Math.min(ETAPES.length - 1, i));
    setEtape(k);
    setVue('form');
    if (mode === 'tout') {
      requestAnimationFrame(() => {
        const zone = formRef.current;
        const x = zone?.querySelector<HTMLElement>(`[data-etape="${ETAPES[k].id}"]`);
        if (zone && x) zone.scrollTo({ top: x.getBoundingClientRect().top - zone.getBoundingClientRect().top + zone.scrollTop - 12, behavior: 'smooth' });
      });
    } else formRef.current?.scrollTo({ top: 0 });
  };

  const texteEnreg = enreg === 'ok' ? 'Enregistré'
    : enreg === 'attente' ? 'Modifications en attente…'
      : enreg === 'encours' ? 'Enregistrement…'
        : `Non enregistré : ${enreg.erreur}`;
  const nbPhotos = lirePhotos(d.photos).length;

  const cur = Math.min(etape, ETAPES.length - 1);
  const et = etapeDe(row.etape);
  return (
    <div className={s.ed} role="dialog" aria-modal="true" aria-label={titreBien(d)}>
      <div className={`${s.edBarre} ${b.edBarre}`}>
        <button type="button" className={s.edRetour} onClick={fermer}><Ic n="retour" t={16} /><span>{nouveau ? 'Biens' : 'La fiche'}</span></button>
        <div className={s.edTitre}>
          <b>{nouveau && !d.typeBien ? 'Nouveau bien' : titreBien(d)}</b>
          <div className={s.edEtat}>
            <span className={b.edStade}><span className={b.point} style={{ background: et.c }} />{et.lib}</span>
            {row.reference && <span className={`${s.statut} ${s.t_gris}`}>{row.reference}</span>}
            <span className={typeof enreg === 'object' ? s.ko : enreg === 'ok' ? s.ok : undefined}>{texteEnreg}</span>
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
          <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={terminer}><Ic n="check" t={15} e={2.4} />{nouveau ? 'Terminer' : 'Fermer'}</button>
        </div>
      </div>

      <FilEtapes actif={cur}>
        {ETAPES.map((e, i) => {
          const n = manquesParEtape[i];
          const rempli = e.id === 'photos' ? nbPhotos > 0 : e.id === 'pieces' ? lirePieces(d.detailPieces).length > 0 : true;
          const ok = n === 0 && rempli;
          return (
            <button key={e.id} type="button" className={`${s.pas} ${b.pas} ${i === cur ? s.pasOn : ''} ${ok ? s.pasOk : ''}`}
              aria-current={i === cur ? 'step' : undefined} title={e.titre} onClick={() => aller(i)}>
              {/* Le dessin de l'étape ; faite, une petite coche verte (V3.16). */}
              <span className={`${s.pasN} ${b.pasIc}`}><Ic n={e.ic} t={15} />{ok && i !== cur && <i className={b.pasCoche}><Ic n="check" t={8} e={3.6} /></i>}</span>
              <span>{e.court}</span>
              {n > 0 && <span className={s.pasManque} title={`${n} information${n > 1 ? 's' : ''} à compléter`}>{n}</span>}
            </button>
          );
        })}
      </FilEtapes>

      <div className={s.edOnglets} role="group" aria-label="Affichage">
        <button type="button" aria-pressed={vue === 'form'} onClick={() => setVue('form')}><Ic n="plume" t={15} />Questions</button>
        <button type="button" aria-pressed={vue === 'apercu'} onClick={() => setVue('apercu')}><Ic n="oeil" t={15} />Aperçu</button>
      </div>

      <div className={`${s.edCorps} ${b.edCorps}`} data-vue={vue}>
        <div className={s.edForm} ref={formRef} onScroll={mode === 'tout' ? suivreDefilement : undefined}>
          <div className={`${s.edFormIn} ${b.edFormIn} ${s.saisieVive}`}>
            {notice && <Notice id={notice} onFermer={() => setNotice(null)} />}
            {mode === 'tout'
              ? ETAPES.map((e, i) => <BlocEtape key={e.id} e={e} i={i} n={ETAPES.length} d={dv} maj={maj} bienId={row.id} />)
              : <BlocEtape key={ETAPES[cur].id} e={ETAPES[cur]} i={cur} n={ETAPES.length} d={dv} maj={maj} bienId={row.id} anime />}
            <div className={s.suite}>
              {mode === 'etapes' && cur > 0 ? <button type="button" className={s.btn} onClick={() => aller(cur - 1)}><Ic n="retour" t={15} />{ETAPES[cur - 1].court}</button> : <span />}
              {mode === 'etapes' && cur < ETAPES.length - 1
                ? <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={() => aller(cur + 1)}>{`Étape suivante : ${ETAPES[cur + 1].court}`}</button>
                : <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={terminer}><Ic n="check" t={15} e={2.4} />{nouveau ? 'Terminer' : 'Fermer'}</button>}
            </div>
          </div>
        </div>
        <div className={`${s.edApercu} ${b.edApercu}`}>
          <Apercu bien={row} d={dd} suivi={suivi} nbAcheteurs={nbAcheteurs} nbVisites={nbVisites} nbOffres={nbOffres} />
        </div>
      </div>

      <div className={s.edPied}>
        {mode === 'etapes' && <button type="button" className={s.btn} disabled={cur === 0} onClick={() => aller(cur - 1)}><Ic n="retour" t={15} />Précédent</button>}
        {mode === 'etapes' && cur < ETAPES.length - 1
          ? <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={() => aller(cur + 1)}>Suivant</button>
          : <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={terminer}>{nouveau ? 'Terminer' : 'Fermer'}</button>}
      </div>
    </div>
  );
}
