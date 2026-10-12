'use client';
/* ═══ Les questions d'un document, en fil (V3.177) ═══════════════════════
   Alexandre, devant la maquette B2 : « j'aime bien le menu foncé sur la
   gauche, avec les évaluations ». Et avant : « je n'aime pas les modules,
   les blocs tout seuls (la durée : rien à droite), les blocs facultatifs
   dépliés d'office ; plutôt des questions : Oui, ça s'affiche ; Non, rien
   n'est déplié ».

   · À gauche (ordinateur), `MenuRubriques` : les étapes en bleu foncé, leur
     dessin, « Complet » ou « 2 à compléter » ; sous celle qui est ouverte,
     ses questions, chacune avec son état — un clic y descend.
   · Au centre, `EtapeFil` : les questions numérotées (2.1, 2.2…), reliées
     par un fil. Chacune a sa bulle (son dessin) : bleue quand c'est bon,
     orangée quand une réponse obligatoire manque, en pointillés quand elle
     est facultative. Les titres d'une étape deviennent de petits
     intertitres. Les petites saisies qui se suivent (« Fait à », « Le »)
     se rangent sur une ligne ; `avec` dessine l'adresse avec son code
     postal et sa ville ; `question` fait d'une info facultative un Oui /
     Non (« Non » la vide).

   Les réponses, les clés et le texte du document ne changent pas : seule la
   façon de poser les questions change. */
import type { ReactNode } from 'react';
import type { Champ, ChampSimple, Donnees, Etape, Repere } from '@/lib/actes';
import { Ic } from './ApercuActe';
import { ChampActe, IC_TYPE, estVide, manquesEtape } from './ChampsActe';
import s from './Documents.module.css';
import b from '@/components/biens/Biens.module.css';

type Maj = (cle: string, v: unknown) => void;

export type ItemFil =
  | { k: 'section'; cle: string; lib: string }
  | { k: 'guide'; cle: string; c: Champ }
  | { k: 'q'; cle: string; c: Champ; avec: ChampSimple[] }
  | { k: 'rangee'; cle: string; champs: ChampSimple[] };

const SIMPLES = new Set(['texte', 'zone', 'date', 'heure', 'nombre', 'euros']);
const PETITS = new Set(['texte', 'date', 'heure', 'nombre', 'euros']);
const estSimple = (c: Champ): c is ChampSimple => SIMPLES.has(c.t);
/* Une petite saisie, qui peut partager sa ligne. */
const petit = (c: Champ): c is ChampSimple => PETITS.has(c.t) && !('large' in c && c.large) && !('question' in c && c.question) && !('avec' in c && c.avec?.length)
  && !('rapides' in c && c.rapides?.length);

/* Les questions d'une étape, telles que le fil les pose. */
export function itemsFil(champs: Champ[], d: Donnees): ItemFil[] {
  const vu = (c: Champ) => !c.si || c.si(d);
  /* Les saisies dessinées avec une autre (`avec`) ne font pas une question à part. */
  const prises = new Set<string>();
  for (const c of champs) if (c.t !== 'titre' && c.t !== 'guide' && vu(c) && c.avec) for (const k of c.avec) prises.add(k);
  const out: ItemFil[] = [];
  let tampon: ChampSimple[] = [];
  /* Une suite de petites saisies : une ligne jusqu'à trois ; quatre font
     deux lignes de deux (« Fait à » reste avec « Le »). */
  const vider = () => {
    const n = tampon.length;
    const tailles = n <= 3 ? [n] : n === 4 ? [2, 2] : n === 5 ? [3, 2] : Array.from({ length: Math.ceil(n / 3) }, (_, i) => Math.min(3, n - i * 3));
    let i = 0;
    for (const t of tailles) {
      const l = tampon.slice(i, i + t);
      i += t;
      if (l.length === 1) out.push({ k: 'q', cle: l[0].cle, c: l[0], avec: [] });
      else if (l.length) out.push({ k: 'rangee', cle: l[0].cle, champs: l });
    }
    tampon = [];
  };
  for (const c of champs) {
    if (!vu(c) || prises.has(c.cle)) continue;
    if (c.t === 'titre') { vider(); out.push({ k: 'section', cle: c.cle, lib: c.lib }); continue; }
    if (c.t === 'guide') { vider(); if (c.points(d).length) out.push({ k: 'guide', cle: c.cle, c }); continue; }
    if (petit(c)) { tampon.push(c); continue; }
    vider();
    const avec = (c.avec || []).map(k => champs.find(x => x.cle === k)).filter((x): x is ChampSimple => !!x && estSimple(x) && vu(x));
    out.push({ k: 'q', cle: c.cle, c, avec });
  }
  vider();
  /* Un intertitre sans question après lui (avant le suivant) disparaît. */
  return out.filter((it, i) => {
    if (it.k !== 'section') return true;
    for (let j = i + 1; j < out.length && out[j].k !== 'section'; j++) if (out[j].k === 'q' || out[j].k === 'rangee') return true;
    return false;
  });
}

const champsDe = (it: ItemFil): Champ[] => (it.k === 'q' ? [it.c, ...it.avec] : it.k === 'rangee' ? it.champs : []);
const libCourt = (t: string) => t.replace(/\s*[?…]$/, '');

/* L'état d'une question : bonne, une réponse obligatoire manque, ou facultative et vide. */
export type EtatFil = 'ok' | 'manque' | 'fac';
export function etatItem(it: ItemFil, d: Donnees): EtatFil {
  const cs = champsDe(it);
  if (manquesEtape(cs, d) > 0) return 'manque';
  if (cs.some(c => !estVide(d[c.cle]))) return 'ok';
  return cs.every(c => !('requis' in c && c.requis)) ? 'fac' : 'ok';
}
/* Son nom dans le menu de gauche. */
export function libItem(it: ItemFil): string {
  if (it.k === 'q') return libCourt('lib' in it.c ? it.c.lib : '');
  if (it.k === 'rangee') return it.champs.map(c => libCourt(c.lib)).join(' · ');
  return '';
}
/* Facultative : une question Oui / Non, ou une saisie que rien n'oblige. */
const facultatif = (it: ItemFil) => {
  const cs = champsDe(it);
  if (it.k === 'q' && 'question' in it.c && it.c.question) return true;
  return cs.length > 0 && cs.every(c => estSimple(c) && !c.requis);
};

/* Les repères d'une étape : le calcul, et ce qui mérite un second regard. */
export function Reperes({ l }: { l: Repere[] }) {
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

const icDe = (c: Champ) => ('ic' in c && c.ic) || IC_TYPE[c.t] || 'plume';
const courte = (c: Champ) => c.t === 'nombre' || c.t === 'euros' || c.t === 'date' || c.t === 'heure';

/* ── Une question du fil (module : AGENTS.md §2.4) ── */
function QuestionFil({ it, n, d, maj, off, voisins, ouverts, onOuvert }: {
  it: Extract<ItemFil, { k: 'q' }>; n: string; d: Donnees; maj: Maj; off: boolean; voisins: string[];
  ouverts: Record<string, boolean>; onOuvert: (cle: string, oui: boolean) => void;
}) {
  const c = it.c;
  const etat = etatItem(it, d);
  const fac = facultatif(it);
  const question = estSimple(c) && c.question ? c.question : '';
  const ouvert = !question || !estVide(d[c.cle]) || ouverts[c.cle] === true;
  const saisie = <ChampActe c={c} d={d} maj={maj} off={off} voisins={voisins} fil />;
  const titreLib = 'lib' in c ? c.lib : '';
  const titre = question || titreLib;
  /* Une saisie simple sans question : son titre est son étiquette. */
  const etiquette = estSimple(c) && !question;
  return (
    <div className={s.filQ} data-item={it.cle} data-cle={c.cle}>
      <span className={s.filBulle} data-etat={fac && etat !== 'manque' && estVide(d[c.cle]) ? 'fac' : etat} aria-hidden="true"><Ic n={icDe(c)} t={18} /></span>
      <div className={s.filCorps}>
        <span className={s.filN}>
          {n}
          {fac && <span className={s.filTag}>Facultatif</span>}
          {etat === 'manque' && <span className={s.filTag} data-ton="manque">À compléter</span>}
        </span>
        {etiquette
          ? <label className={s.filT} htmlFor={`ch-${c.cle}`}>{titre}{'requis' in c && c.requis && <em aria-hidden="true">*</em>}</label>
          : <h3 className={s.filT}>{titre}</h3>}
        {'aide' in c && c.aide && <p className={s.filAide}>{c.aide}</p>}
        <div className={s.filRep}>
          {question && (
            <div className={s.filOuiNon} role="radiogroup" aria-label={question}>
              <button type="button" role="radio" aria-checked={ouvert} disabled={off} onClick={() => onOuvert(c.cle, true)}>
                <Ic n="check" t={13} e={2.8} />Oui
              </button>
              <button type="button" role="radio" aria-checked={!ouvert} disabled={off}
                onClick={() => { onOuvert(c.cle, false); if (!estVide(d[c.cle])) maj(c.cle, c.t === 'nombre' || c.t === 'euros' ? null : ''); }}>
                <Ic n="croix" t={12} e={2.8} />Non
              </button>
            </div>
          )}
          {question
            ? ouvert && (
              <div className={s.filDepli}>
                <label className={s.filLib} htmlFor={`ch-${c.cle}`}>{titreLib}</label>
                {saisie}
              </div>
            )
            : courte(c) && !('rapides' in c && c.rapides?.length) ? <div className={s.filCourt}>{saisie}</div> : saisie}
          {it.avec.length > 0 && (
            <div className={s.filAvec}>
              {it.avec.map(a => (
                <div key={a.cle}>
                  <label className={s.filLib} htmlFor={`ch-${a.cle}`}>{a.lib}{a.requis && <em aria-hidden="true">*</em>}</label>
                  <ChampActe c={a} d={d} maj={maj} off={off} voisins={voisins} fil />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Des petites saisies sur une ligne (« Fait à », « Le ») ── */
function RangeeFil({ it, n, d, maj, off, voisins }: { it: Extract<ItemFil, { k: 'rangee' }>; n: string; d: Donnees; maj: Maj; off: boolean; voisins: string[] }) {
  const etat = etatItem(it, d);
  const fac = facultatif(it);
  return (
    <div className={s.filQ} data-item={it.cle}>
      <span className={s.filBulle} data-etat={fac && etat !== 'ok' ? 'fac' : etat} aria-hidden="true"><Ic n={icDe(it.champs[0])} t={18} /></span>
      <div className={s.filCorps}>
        <span className={s.filN}>
          {n}
          {fac && <span className={s.filTag}>Facultatif</span>}
          {etat === 'manque' && <span className={s.filTag} data-ton="manque">À compléter</span>}
        </span>
        <div className={s.filRangee}>
          {it.champs.map(c => (
            <div key={c.cle} className={s.filRangeeCh}>
              <label className={s.filLibFort} htmlFor={`ch-${c.cle}`}>{c.lib}{c.requis && <em aria-hidden="true">*</em>}</label>
              <ChampActe c={c} d={d} maj={maj} off={off} voisins={voisins} fil />
              {c.aide && <span className={s.filAideP}>{c.aide}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Une étape : son en-tête, puis le fil de ses questions ── */
export function EtapeFil({ e, i, n, d, maj, off, reperes, anime = false, ouverts, onOuvert }: {
  e: Etape; i: number; n: number; d: Donnees; maj: Maj; off: boolean; reperes: Repere[]; anime?: boolean;
  ouverts: Record<string, boolean>; onOuvert: (cle: string, oui: boolean) => void;
}) {
  const items = itemsFil(e.champs, d);
  const voisins = e.champs.map(c => c.cle);
  const placees = !!e.reperesApres && items.some(it => champsDe(it).some(c => c.cle === e.reperesApres));
  let k = 0;
  const lignes: ReactNode[] = items.map(it => {
    const apres = e.reperesApres && champsDe(it).some(c => c.cle === e.reperesApres) ? <div className={s.filAside}><Reperes l={reperes} /></div> : null;
    if (it.k === 'section') return <div key={it.cle} className={s.filSection}><span>{it.lib}</span></div>;
    if (it.k === 'guide') return <div key={it.cle} className={s.filAside}><ChampActe c={it.c} d={d} maj={maj} off={off} /></div>;
    k += 1;
    const num = `${i + 1}.${k}`;
    return (
      <div key={it.cle} style={{ display: 'contents' }}>
        {it.k === 'q'
          ? <QuestionFil it={it} n={num} d={d} maj={maj} off={off} voisins={voisins} ouverts={ouverts} onOuvert={onOuvert} />
          : <RangeeFil it={it} n={num} d={d} maj={maj} off={off} voisins={voisins} />}
        {apres}
      </div>
    );
  });
  return (
    <section className={`${s.filEtape} ${anime ? b.etapeEntre : ''}`} data-etape={e.id}>
      <div className={s.filTete}>
        <span className={s.filTeteIc}>{e.ic ? <Ic n={e.ic} t={24} /> : i + 1}</span>
        <div className={s.filTeteTx}>
          <span className={s.filTeteN}>{`Étape ${i + 1} sur ${n}`}</span>
          <h2 className={s.filTeteT}>{e.titre}</h2>
          <p className={s.filTeteS}>{e.sous}</p>
        </div>
      </div>
      <div className={s.fil}>{lignes}</div>
      {!placees && reperes.length > 0 && <div className={s.filAside}><Reperes l={reperes} /></div>}
    </section>
  );
}

/* ── À gauche : les rubriques du document, et les questions de celle ouverte ── */
/* Alexandre : « un petit icône sombre ou clair pour switcher entre les deux ;
   et à la fin, Aperçu du document : on ne voit pas le document à droite, si
   on fait Aperçu il s'affiche, et on peut le désactiver ». Les deux choix
   sont retenus dans ce navigateur (EditeurDocument). */
export function MenuRubriques({ etapes, actif, manques, d, type, titre, onAller, onQuestion, clair, onClair, apercu, onApercu }: {
  etapes: Etape[]; actif: number; manques: number[]; d: Donnees; type: string; titre: string;
  onAller: (i: number) => void; onQuestion: (i: number, cle: string) => void;
  clair: boolean; onClair: (clair: boolean) => void; apercu: boolean; onApercu: (oui: boolean) => void;
}) {
  const completes = manques.filter(x => x === 0).length;
  return (
    <nav className={s.rubs} aria-label="Les rubriques du document" data-ton={clair ? 'clair' : undefined}>
      <div className={s.rubsTete}>
        <span className={s.rubsHaut}>
          <span className={s.rubsType}>{type}</span>
          <button type="button" className={s.rubsTon} onClick={() => onClair(!clair)}
            aria-label={clair ? 'Passer le menu en sombre' : 'Passer le menu en clair'} title={clair ? 'Menu sombre' : 'Menu clair'}>
            <Ic n={clair ? 'lune' : 'soleil'} t={15} />
          </button>
        </span>
        <b className={s.rubsTitre}>{titre}</b>
        <span className={s.rubsJauge}>
          <span aria-hidden="true"><i style={{ width: `${Math.round((completes / Math.max(1, etapes.length)) * 100)}%` }} /></span>
          {`${completes} sur ${etapes.length}`}
        </span>
      </div>
      <ol className={s.rubsListe}>
        {etapes.map((e, i) => {
          const nm = manques[i] || 0;
          const on = i === actif;
          return (
            <li key={e.id} className={s.rub} data-on={on ? 'oui' : undefined}>
              <button type="button" className={s.rubB} aria-current={on ? 'step' : undefined} onClick={() => onAller(i)}>
                <span className={s.rubIc}>{e.ic ? <Ic n={e.ic} t={17} /> : i + 1}</span>
                <span className={s.rubTx}>
                  <b>{e.court || e.titre}</b>
                  <small data-etat={nm ? 'manque' : 'ok'}>{nm ? `${nm} à compléter` : 'Complet'}</small>
                </span>
                <span className={s.rubMarque} data-etat={nm ? 'manque' : 'ok'} aria-hidden="true">{nm ? '!' : <Ic n="check" t={11} e={3.4} />}</span>
              </button>
              {on && (
                <ul className={s.rubSous}>
                  {itemsFil(e.champs, d).filter(it => it.k === 'q' || it.k === 'rangee').map(it => {
                    const et = etatItem(it, d);
                    return (
                      <li key={it.cle}>
                        <button type="button" data-etat={et} onClick={() => onQuestion(i, it.cle)}>
                          <span className={s.rubPoint} data-etat={et} aria-hidden="true">{et === 'ok' ? <Ic n="check" t={9} e={4} /> : et === 'manque' ? '!' : null}</span>
                          <span className={s.rubSousL}>{libItem(it)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      <button type="button" role="switch" aria-checked={apercu} className={s.rubsApercu} onClick={() => onApercu(!apercu)}>
        <Ic n={apercu ? 'oeil' : 'oeilBarre'} t={17} />
        <span><b>Aperçu du document</b><small>{apercu ? 'Affiché à droite' : 'Masqué : les questions ont toute la place'}</small></span>
        <i className={s.rubsInter} aria-hidden="true" />
      </button>
    </nav>
  );
}
