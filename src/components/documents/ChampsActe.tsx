'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { enLettres } from '@/lib/mandat';
import { PERSONNE_VIDE, type Champ, type Donnees, type Personne } from '@/lib/actes';
import { Croix, Ic } from './ApercuActe';
import s from './Documents.module.css';

/* ═══ Les champs de l'éditeur ═════════════════════════════════════════════
   Tous déclarés au niveau du module : un composant défini dans le rendu
   d'un autre se remonte à chaque frappe, et le champ perd le focus
   (AGENTS.md §2.4). */

type Maj = (cle: string, v: unknown) => void;

export const estVide = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);

/* ── Les nombres : on tape librement, la mise en forme vient en sortant ── */
const lireNombre = (t: string): number | null => {
  const x = t.replace(/[\s\u00a0\u202f€%]/g, '').replace(',', '.');
  if (!x) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const nombreDe = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? lireNombre(v) : null;
const ecrireNombre = (n: number | null, euros: boolean) =>
  n === null ? '' : euros
    ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n).replace(/[\u202f\u00a0]/g, ' ')
    : String(n).replace('.', ',');

function ChampNombre({ id, euros, unite, v, onChange, off, manque }: {
  id: string; euros: boolean; unite?: string; v: unknown; onChange: (n: number | null) => void; off: boolean; manque: boolean;
}) {
  const n = nombreDe(v);
  const [texte, setTexte] = useState(ecrireNombre(n, euros));
  const [dedans, setDedans] = useState(false);
  useEffect(() => { if (!dedans) setTexte(ecrireNombre(nombreDe(v), euros)); }, [v, dedans, euros]);
  const u = unite || (euros ? '€' : '');
  return (
    <>
      <div className={s.unite}>
        <input id={id} className={`${s.input} ${manque ? s.inputManque : ''}`} inputMode="decimal" autoComplete="off" disabled={off}
          value={texte} onFocus={() => setDedans(true)} onBlur={() => setDedans(false)}
          onChange={e => { setTexte(e.target.value); onChange(lireNombre(e.target.value)); }}
          style={u ? { paddingRight: Math.min(150, 22 + u.length * 7.2) } : undefined} />
        {u && <span>{u}</span>}
      </div>
      {euros && n !== null && n >= 1 && Number.isInteger(n) && <span className={s.lettres}>{`${enLettres(n)} euros`}</span>}
    </>
  );
}

function ChampChoix({ c, v, onChange, off }: { c: Extract<Champ, { t: 'choix' }>; v: unknown; onChange: (x: string) => void; off: boolean }) {
  if (c.tuiles) {
    return (
      <div className={s.tuiles} role="radiogroup" aria-label={c.lib}>
        {c.options.map(o => (
          <button key={o.v} type="button" role="radio" aria-checked={v === o.v} disabled={off}
            className={`${s.tuile} ${o.ic ? s.tuileIc : ''} ${v === o.v ? s.tuileOn : ''}`} onClick={() => onChange(o.v)}>
            {o.ic && <span className={s.tuilePicto}><Ic n={o.ic} t={20} /></span>}
            <span className={s.tuileTxt}>
              <b>{o.l}</b>
              {o.aide && <small>{o.aide}</small>}
            </span>
            {v === o.v && <span className={s.tuileCoche}><Ic n="check" t={11} e={3.2} /></span>}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className={s.pills} role="radiogroup" aria-label={c.lib}>
      {c.options.map(o => (
        <button key={o.v} type="button" role="radio" aria-checked={v === o.v} disabled={off} title={o.aide}
          className={`${s.pill} ${v === o.v ? s.pillOn : ''}`} onClick={() => onChange(o.v)}>{o.ic && <Ic n={o.ic} t={14} />}{o.l}</button>
      ))}
    </div>
  );
}

function ChampCases({ c, v, onChange, off }: { c: Extract<Champ, { t: 'cases' }>; v: unknown; onChange: (x: string[]) => void; off: boolean }) {
  const l = Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  return (
    <div className={s.cases}>
      {c.options.map(o => {
        const on = l.includes(o.v);
        return (
          <button key={o.v} type="button" role="checkbox" aria-checked={on} disabled={off}
            className={`${s.caseB} ${on ? s.caseOn : ''}`}
            onClick={() => onChange(on ? l.filter(x => x !== o.v) : [...l, o.v])}>
            {o.ic && <span className={s.casePicto}><Ic n={o.ic} t={17} /></span>}
            <span className={s.caseTxt}>{o.l}</span>
            <span className={s.bx}>{on && <Ic n="check" t={12} e={3} />}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Une zone de texte libre (une clause, une précision) ── V3.46
   Elle grandit avec le texte, jusqu'à HAUT_ZONE : au-delà, elle défile.
   Dessous, une poignée à tirer (double-clic : retour à la taille d'origine)
   et « Agrandir », qui montre tout le texte d'un coup — ou donne de la
   place pour écrire long. */
const HAUT_ZONE = 260;
type Taille = 'auto' | 'grand' | number;

function ZoneTexte({ id, v, manque, off, exemple, onChange }: {
  id: string; v: string; manque: boolean; off: boolean; exemple?: string; onChange: (x: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [taille, setTaille] = useState<Taille>('auto');
  const ajuster = useCallback(() => {
    const t = ref.current;
    if (!t) return;
    if (typeof taille === 'number') { t.style.height = `${taille}px`; return; }
    const cs = getComputedStyle(t);
    const bords = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    /* Mesurer oblige à replier la zone un instant : la page qui la porte ne
       doit pas sauter pour autant (rien n'est dessiné entre-temps). */
    const gardes: [HTMLElement, number][] = [];
    for (let el = t.parentElement; el; el = el.parentElement) if (el.scrollTop) gardes.push([el, el.scrollTop]);
    const dedans = t.scrollTop;
    t.style.height = 'auto';
    const plein = t.scrollHeight + bords;
    t.style.height = `${taille === 'grand' ? Math.max(plein, Math.min(window.innerHeight * 0.6, 560)) : Math.min(plein, HAUT_ZONE)}px`;
    t.scrollTop = dedans;
    for (const [el, y] of gardes) el.scrollTop = y;
  }, [taille]);
  useLayoutEffect(ajuster, [ajuster, v]);
  /* La colonne s'élargit ou se resserre : le texte se replie autrement. */
  useEffect(() => {
    const t = ref.current;
    if (!t || typeof ResizeObserver === 'undefined') return;
    let large = t.clientWidth;
    const ro = new ResizeObserver(() => { if (t.clientWidth !== large) { large = t.clientWidth; ajuster(); } });
    ro.observe(t);
    return () => ro.disconnect();
  }, [ajuster]);

  const tirer = (e: React.PointerEvent<HTMLSpanElement>) => {
    const t = ref.current;
    if (!t || e.button !== 0) return;
    e.preventDefault();
    const poignee = e.currentTarget;
    poignee.setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    const h0 = t.getBoundingClientRect().height;
    let h = h0;
    const bouger = (ev: PointerEvent) => {
      h = Math.round(Math.max(88, Math.min(window.innerHeight * 0.85, h0 + ev.clientY - y0)));
      t.style.height = `${h}px`;
    };
    const finir = () => {
      poignee.removeEventListener('pointermove', bouger);
      poignee.removeEventListener('pointerup', finir);
      poignee.removeEventListener('pointercancel', finir);
      if (h !== h0) setTaille(h);
    };
    poignee.addEventListener('pointermove', bouger);
    poignee.addEventListener('pointerup', finir);
    poignee.addEventListener('pointercancel', finir);
  };

  const grand = taille !== 'auto';
  return (
    <div className={s.ztCadre}>
      <textarea id={id} ref={ref} className={`${s.input} ${s.ztTexte} ${manque ? s.inputManque : ''}`} disabled={off} rows={3}
        value={v} placeholder={exemple ? `Ex : ${exemple}` : undefined} onChange={e => onChange(e.target.value)} />
      <div className={s.ztBas}>
        <span className={s.ztPoignee} onPointerDown={tirer} onDoubleClick={() => setTaille('auto')} title="Tirer pour agrandir ou réduire" aria-hidden="true" />
        <button type="button" className={s.ztBtn} aria-controls={id} aria-expanded={grand}
          onClick={() => setTaille(grand ? 'auto' : 'grand')}>
          <Ic n={grand ? 'reduire' : 'agrandir'} t={13} /><span>{grand ? 'Réduire' : 'Agrandir'}</span>
        </button>
      </div>
    </div>
  );
}

/* ── Une personne : une carte, ses champs ── */
const lirePersonneBrute = (x: unknown): Personne => ({ ...PERSONNE_VIDE, ...((x && typeof x === 'object' ? x : {}) as Partial<Personne>) });

function CartePersonne({ id, nom, p, complet, off, peutRetirer, onChange, onRetirer }: {
  id: string; nom: string; p: Personne; complet: boolean; off: boolean; peutRetirer: boolean;
  onChange: (k: keyof Personne, v: string) => void; onRetirer: () => void;
}) {
  const champ = (k: keyof Personne, lib: string, o: { type?: string; large?: boolean; ph?: string; requis?: boolean; mode?: 'email' | 'tel' } = {}) => (
    <div className={`${s.ch} ${o.large ? s.large : ''}`}>
      <label className={s.chLib} htmlFor={`${id}-${k}`}>{lib}</label>
      <input id={`${id}-${k}`} className={`${s.input} ${o.requis && !p[k] ? s.inputManque : ''}`} type={o.type || 'text'} disabled={off}
        inputMode={o.mode} autoComplete="off" value={p[k]} placeholder={o.ph} onChange={e => onChange(k, e.target.value)} />
    </div>
  );
  return (
    <div className={s.perso}>
      <div className={s.persoT}>
        <span className={s.ligneIc}><Ic n="personne" t={15} /></span>
        <b>{[nom, [p.prenom, p.nom].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</b>
        {peutRetirer && !off && (
          <button type="button" className={s.retirer} onClick={onRetirer}><Croix t={13} />Retirer</button>
        )}
      </div>
      <div className={s.persoCorps}>
        <div className={`${s.ch} ${s.large}`}>
          <div className={s.pills} role="radiogroup" aria-label="Civilité">
            {(['Madame', 'Monsieur'] as const).map(c => (
              <button key={c} type="button" role="radio" aria-checked={p.civilite === c} disabled={off}
                className={`${s.pill} ${p.civilite === c ? s.pillOn : ''}`} onClick={() => onChange('civilite', c)}>{c}</button>
            ))}
          </div>
        </div>
        {champ('prenom', 'Prénom', { requis: true })}
        {champ('nom', 'Nom', { requis: true })}
        {complet && champ('nomNaissance', 'Nom de naissance', { ph: 'Si différent' })}
        {complet && champ('naissanceDate', 'Date de naissance', { type: 'date', requis: true })}
        {complet && champ('naissanceLieu', 'Lieu de naissance', { ph: 'Ex : Lyon (69)', requis: true })}
        {champ('adresse', 'Adresse', { large: true, ph: 'Numéro, rue, code postal, ville', requis: complet })}
        {champ('email', 'E-mail', { type: 'email', mode: 'email' })}
        {champ('telephone', 'Téléphone', { type: 'tel', mode: 'tel' })}
      </div>
    </div>
  );
}

function ChampPersonnes({ c, d, v, onChange, off }: {
  c: Extract<Champ, { t: 'personnes' }>; d: Donnees; v: unknown; onChange: (x: Personne[]) => void; off: boolean;
}) {
  const b = c.bornes ? c.bornes(d) : { min: c.min, max: c.max };
  const brut = Array.isArray(v) ? (v as unknown[]).map(lirePersonneBrute) : [];
  const n = Math.max(b.min, Math.min(brut.length, b.max), 1);
  const cartes = Array.from({ length: n }, (_, i) => brut[i] || { ...PERSONNE_VIDE });
  return (
    <div className={s.lignesT} style={{ gap: 10 }}>
      {cartes.map((p, i) => (
        <CartePersonne key={i} id={`${c.cle}-${i}`} p={p} complet={typeof c.complet === 'function' ? c.complet(d) : !!c.complet} off={off}
          nom={c.nomCarte ? c.nomCarte(d, i) : n > 1 ? `${c.un} ${i + 1}` : c.un}
          peutRetirer={n > b.min}
          onChange={(k, x) => onChange(cartes.map((q, j) => (j === i ? { ...q, [k]: x } : q)))}
          onRetirer={() => onChange(cartes.filter((_, j) => j !== i))} />
      ))}
      {!off && n < b.max && (
        <button type="button" className={s.ajouter} onClick={() => onChange([...cartes, { ...PERSONNE_VIDE }])}>
          <Ic n="plus" t={15} e={2.4} />{c.ajouter ? c.ajouter(d) : `Ajouter un ${c.un.toLowerCase()}`}
        </button>
      )}
    </div>
  );
}

/* ── Des lignes à colonnes (les lots) ── */
function ChampLignes({ c, d, v, onChange, off }: { c: Extract<Champ, { t: 'lignes' }>; d: Donnees; v: unknown; onChange: (x: Record<string, string>[]) => void; off: boolean }) {
  const l = Array.isArray(v) ? (v as unknown[]).map(x => ((x && typeof x === 'object' ? x : {}) as Record<string, string>)) : [];
  const rangs = l.length ? l : [{}];
  const maj = (i: number, k: string, x: string) => onChange(rangs.map((r, j) => (j === i ? { ...r, [k]: x } : r)));
  return (
    <div className={s.lignesT}>
      {rangs.map((r, i) => (
        <div key={i} className={s.lot}>
          <span className={s.lotIc} aria-hidden="true"><Ic n={c.icone ? c.icone(r) : 'lots'} t={18} /></span>
          {c.colonnes.map((col, k) => {
            /* Une case déjà écrite en entier (« 12/500 ») ne reçoit pas le total commun. */
            const suf = col.suffixe && !(r[col.cle] || '').includes('/') ? col.suffixe(d) : '';
            return (
              <label key={col.cle} className={`${s.lotCh} ${s['lotCh' + k] || ''}`}>
                <span>{col.lib}</span>
                <span className={suf ? s.unite : undefined}>
                  <input className={s.input} disabled={off} inputMode={col.nombre ? 'numeric' : undefined} autoComplete="off"
                    value={r[col.cle] || ''} placeholder={col.exemple} onChange={e => maj(i, col.cle, e.target.value)}
                    style={suf ? { paddingRight: 22 + suf.length * 7.5 } : undefined} />
                  {suf && <span>{suf}</span>}
                </span>
              </label>
            );
          })}
          {!off && rangs.length > 1
            ? <button type="button" className={`${s.retirer} ${s.lotRetirer}`} aria-label={`Retirer le ${c.un.toLowerCase()} ${i + 1}`} onClick={() => onChange(rangs.filter((_, j) => j !== i))}><Croix t={15} /></button>
            : <span className={s.lotRetirer} />}
        </div>
      ))}
      {!off && rangs.length < c.max && (
        <button type="button" className={s.ajouter} onClick={() => onChange([...rangs, {}])}><Ic n="plus" t={15} e={2.4} />{`Ajouter un ${c.un.toLowerCase()}`}</button>
      )}
    </div>
  );
}

/* Le dessin d'une question qui n'en a pas (V3.18, éditeur des documents). */
const IC_TYPE: Record<string, string> = {
  texte: 'plume', zone: 'doc', date: 'calendrier', heure: 'horloge', nombre: 'regle', euros: 'euro',
  choix: 'info', cases: 'check', personnes: 'personne', lignes: 'lots',
};

/* ── Un champ, avec son libellé et son aide ──
   `bloc` (V3.18, l'éditeur des documents) : chaque question devient une
   carte — son dessin en pastille, son titre en gros, la saisie dans le même
   cadre — et prend un dessin par défaut s'il n'en a pas. `sansLib` : le
   libellé est déjà le titre du bloc (« Les vendeurs »). */
export function ChampActe({ c, d, maj, off, bloc = false, sansLib = false }: { c: Champ; d: Donnees; maj: Maj; off: boolean; bloc?: boolean; sansLib?: boolean }) {
  if (c.si && !c.si(d)) return null;
  if (c.t === 'titre') return <div className={s.secT}>{c.ic && <span className={s.secTic}><Ic n={c.ic} t={14} /></span>}{c.lib}</div>;
  if (c.t === 'guide') {
    const pts = c.points(d);
    if (!pts.length) return null;
    return (
      <div className={`${s.guide} ${s.large}`}>
        <div className={s.guideT}><span className={s.guideIc}><Ic n="info" t={15} /></span>{c.titre(d)}</div>
        <ul>
          {pts.map((p, i) => <li key={i}><span className={s.guidePicto}><Ic n={p.ic || 'check'} t={15} /></span><span>{p.x}</span></li>)}
        </ul>
      </div>
    );
  }
  const v = d[c.cle];
  const id = `ch-${c.cle}`;
  const manque = !!c.requis && estVide(v);
  const large = c.large || c.t === 'personnes' || c.t === 'lignes' || c.t === 'cases' || c.t === 'zone'
    || (c.t === 'choix' && (c.tuiles || c.options.length > 3 || c.options.some(o => o.l.length > 24)));
  const ic = c.ic || (bloc ? IC_TYPE[c.t] : '');
  const libelle = (
    <>
      {ic && <span className={s.chIc}><Ic n={ic} t={14} /></span>}
      <span>{c.lib}{c.requis && <em aria-hidden="true">*</em>}</span>
    </>
  );
  const saisie = c.t === 'texte' || c.t === 'zone' || c.t === 'date' || c.t === 'heure' || c.t === 'nombre' || c.t === 'euros';

  let controle: React.ReactNode = null;
  if (c.t === 'texte' || c.t === 'date' || c.t === 'heure') {
    controle = (
      <input id={id} className={`${s.input} ${manque ? s.inputManque : ''}`} disabled={off} autoComplete="off"
        type={c.t === 'date' ? 'date' : c.t === 'heure' ? 'time' : 'text'}
        value={typeof v === 'string' ? v : ''} placeholder={c.exemple ? `Ex : ${c.exemple}` : undefined}
        onChange={e => maj(c.cle, e.target.value)} />
    );
  } else if (c.t === 'zone') {
    controle = <ZoneTexte id={id} v={typeof v === 'string' ? v : ''} manque={manque} off={off} exemple={c.exemple} onChange={x => maj(c.cle, x)} />;
  } else if (c.t === 'nombre' || c.t === 'euros') {
    controle = <ChampNombre id={id} euros={c.t === 'euros'} unite={c.unite} v={v} off={off} manque={manque} onChange={n => maj(c.cle, n)} />;
  } else if (c.t === 'choix') {
    controle = <ChampChoix c={c} v={v} off={off} onChange={x => maj(c.cle, x)} />;
  } else if (c.t === 'cases') {
    controle = <ChampCases c={c} v={v} off={off} onChange={x => maj(c.cle, x)} />;
  } else if (c.t === 'personnes') {
    controle = <ChampPersonnes c={c} d={d} v={v} off={off} onChange={x => maj(c.cle, x)} />;
  } else if (c.t === 'lignes') {
    controle = <ChampLignes c={c} d={d} v={v} off={off} onChange={x => maj(c.cle, x)} />;
  }

  const carte = c.t === 'choix' || c.t === 'cases' || (bloc && c.t !== 'personnes');
  return (
    <div className={`${s.ch} ${large ? s.large : ''} ${carte ? s.chQ : ''} ${bloc && c.t === 'personnes' ? s.chPers : ''}`} data-cle={c.cle}>
      {sansLib ? null : saisie ? <label className={s.chLib} htmlFor={id}>{libelle}</label> : <div className={s.chLib}>{libelle}</div>}
      {controle}
      {c.aide && <div className={s.chAide}>{c.aide}</div>}
    </div>
  );
}

/* Ce qui manque dans une étape : les champs obligatoires vides, et les
   personnes sans nom. Pour la pastille du fil d'étapes. */
export function manquesEtape(champs: Champ[], d: Donnees): number {
  let n = 0;
  for (const c of champs) {
    if (c.t === 'titre' || c.t === 'guide' || (c.si && !c.si(d))) continue;
    if (c.t === 'personnes') {
      const b = c.bornes ? c.bornes(d) : { min: c.min, max: c.max };
      const l = Array.isArray(d[c.cle]) ? (d[c.cle] as unknown[]).map(lirePersonneBrute) : [];
      const nb = Math.max(b.min, Math.min(l.length, b.max), 1);
      const complet = typeof c.complet === 'function' ? c.complet(d) : !!c.complet;
      for (let i = 0; i < nb; i++) {
        const p = l[i] || PERSONNE_VIDE;
        if (!p.nom.trim() || !p.prenom.trim() || (complet && (!p.naissanceDate || !p.naissanceLieu.trim() || !p.adresse.trim()))) n++;
      }
      continue;
    }
    if (c.requis && estVide(d[c.cle])) n++;
  }
  return n;
}
