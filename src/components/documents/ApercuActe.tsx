'use client';
import { Fragment } from 'react';
import { ICONES, type Icone, type Partie, type Resume } from '@/lib/mandat';
import type { Garde } from '@/lib/actes';
import { PICTOS } from './pictos';
import s from './Documents.module.css';

/* ═══ L'aperçu « papier » d'un document ═══════════════════════════════════
   Les mêmes blocs que le PDF, dessinés de la même façon : la page de garde
   marine au logo blanc, le résumé en cartes, puis chaque partie avec ses
   rubriques à icône, ses encadrés, ses fiches et ses cadres de signature.
   Ce qui manque encore (« …… », « à compléter ») est surligné : on voit
   d'un coup d'œil ce qu'il reste à remplir.

   V3.46 : chaque passage porte `data-bloc`, chaque rubrique son rang
   (`data-si`, toutes parties confondues) : l'éditeur retrouve, au clic, la
   question qui l'a écrit (versQuestion.ts). Une carte du résumé porte son
   titre (`data-titre`). */

export function Ic({ n, t = 18, e = 1.9 }: { n: string; t?: number; e?: number }) {
  const traces: readonly string[] = PICTOS[n] || ICONES[n as Icone] || [];
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={e}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      {traces.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export function Croix({ t = 16 }: { t?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      <path d="M6.5 6.5l11 11" /><path d="M17.5 6.5l-11 11" />
    </svg>
  );
}

/* Le texte, avec ses trous surlignés. Un « … » collé à un mot (« deux… »)
   est un texte raccourci, pas un trou : il reste tel quel. */
function T({ x }: { x: string }) {
  const morceaux = x.split(/(…+|[àÀ] compléter)/);
  if (morceaux.length === 1) return <>{x}</>;
  return (
    <>
      {morceaux.map((m, i) => (i % 2 === 1 && !(m.charAt(0) === '…' && /[\p{L}\d]$/u.test(morceaux[i - 1]))
        ? <mark key={i} className={s.trou}>{m}</mark>
        : <Fragment key={i}>{m}</Fragment>))}
    </>
  );
}

function Blocs({ partie, base }: { partie: Partie; base: number }) {
  return (
    <>
      {partie.sections.map((sec, j) => (
        <div key={j} data-sec={sec.titre || undefined} data-si={base + j}>
          {sec.titre && (sec.ic
            ? <div className={s.secIc}><span className={s.ic}><Ic n={sec.ic} t={15} /></span><span>{sec.titre}</span></div>
            : <div className={s.secI}><span>{sec.titre}</span></div>)}
          {sec.blocs.map((b, k) => {
            if (b.t === 'p') return <p key={k} data-bloc="" className={b.g ? s.enc : b.petit ? s.petit : undefined}><T x={b.x} /></p>;
            if (b.t === 'l') return <ul key={k}>{b.items.map((x, n) => <li key={n} data-bloc=""><T x={x} /></li>)}</ul>;
            if (b.t === 'coches') return (
              <div key={k} className={s.coches}>
                {b.items.map((x, n) => <div key={n} data-bloc=""><span className={s.k}><Ic n="check" t={11} e={2.6} /></span><span><T x={x} /></span></div>)}
              </div>
            );
            if (b.t === 'etapes') return (
              <ol key={k} className={s.etapes}>
                {b.items.map((e, n) => (
                  <li key={n} data-bloc=""><span className={s.n}>{String(n + 1).padStart(2, '0')}</span><span><b>{e.titre}</b><span className={s.x}><T x={e.x} /></span></span></li>
                ))}
              </ol>
            );
            if (b.t === 'fiches') return (
              <div key={k} className={s.fiches}>
                {b.items.map((f, n) => (
                  <div key={n} data-bloc="" className={`${s.fiche} ${f.large ? s.ficheLarge : ''}`}>
                    <div className={s.ficheT}><span className={s.ic}><Ic n={f.ic} t={14} /></span><b><T x={f.titre} /></b></div>
                    {f.lignes.map((l, q) => <p key={q}><T x={l} /></p>)}
                    {f.note && <p className={s.fNote}>{f.note}</p>}
                    {f.pied && <p className={s.fPied}>{f.pied}</p>}
                  </div>
                ))}
              </div>
            );
            if (b.t === 'case') return <p key={k} data-bloc="" className={s.caseP}><span className={`${s.bx} ${b.coche ? s.bxOn : ''}`} /><span><T x={b.x} /></span></p>;
            if (b.t === 'sigs') return (
              <div key={k}>
                <div className={s.sigs}>
                  {b.cases.map((c, n) => (
                    <div key={n} data-bloc="" className={s.sigc}>
                      <span>{c.qui}</span>
                      <b><T x={c.nom} /></b>
                      {c.lignes.map((l, q) => <i key={q}><T x={l} /></i>)}
                      <div className={s.zone}>{b.electronique ? (c.agence ? 'Signé à l’envoi, avec l’heure' : b.sansCode ? 'Signé sur place, dans ce cadre, au stylet, sans code' : 'Signature électronique : code reçu par e-mail, trait tracé à l’écran') : 'Date et signature'}</div>
                    </div>
                  ))}
                </div>
                {b.mention && <p data-bloc="" className={s.mention}>{b.mention}</p>}
              </div>
            );
            return null;
          })}
        </div>
      ))}
    </>
  );
}

export default function ApercuActe({ parties, garde, pour, resume, projet = true, pied, cliquable = false }: {
  parties: Partie[];
  garde: Garde;
  pour: string;
  resume: Resume;
  projet?: boolean;
  /* La ligne de l'agence, en bas (raison sociale, carte). */
  pied?: string;
  /* Les passages répondent au survol (l'éditeur les ouvre au clic). */
  cliquable?: boolean;
}) {
  /* Le rang de la première rubrique de chaque partie. */
  const bases = parties.reduce<number[]>((l, p, i) => [...l, i ? l[i - 1] + parties[i - 1].sections.length : 0], []);
  return (
    <article className={`${s.papier} ${cliquable ? s.papierClic : ''}`} aria-label="Aperçu du document"
      title={cliquable ? 'Clique sur un passage pour aller à sa question' : undefined}>
      {garde.lettre ? (
        /* Un courrier : l'en-tête de l'agence, sans page de garde. */
        <div className={s.papLettre} data-bloc="">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_high_resolution.png" alt="Emilio Immobilier" />
          {projet && <span className={s.projet}>PROJET</span>}
        </div>
      ) : (
        <>
          <div className={s.papGarde} data-bloc="">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo_high_resolution_white.png" alt="Emilio Immobilier" />
            {projet && <span className={s.projet}>PROJET</span>}
            <div className={s.filet} />
            <h2>{garde.titre}</h2>
            <div className={s.sous}>{garde.sous}</div>
            <div className={s.etiq}><T x={garde.etiquette} /></div>
          </div>
          <div className={s.papPour} data-bloc="">
            <span>{garde.pour || 'ÉTABLI POUR'}</span>
            <b><T x={pour} /></b>
          </div>
        </>
      )}
      {!garde.lettre && resume.length > 0 && (
        <div className={s.papResume}>
          {resume.map(r => (
            <div key={r.titre} data-bloc="" data-titre={r.titre}>
              <span>{r.titre}</span>
              <b><T x={r.valeur} /></b>
              <i><T x={r.detail} /></i>
            </div>
          ))}
        </div>
      )}
      <div className={s.papCorps}>
        {parties.map((p, i) => (
          <section key={i} className={s.partie} data-si={bases[i]}>
            {i > 0 && <div className={s.saut} style={{ marginTop: 0, marginBottom: 22 }}><span>{`Nouvelle page · partie ${i + 1}`}</span></div>}
            <div className={s.partieT} data-bloc="">
              <span className={s.ic}><Ic n={p.ic} t={19} /></span>
              <div>
                {!garde.lettre && <div className={s.partieN}>{`Partie ${i + 1}`}</div>}
                <h3><T x={p.titre} /></h3>
                {p.sous && <div className={s.s}>{p.sous}</div>}
              </div>
            </div>
            <Blocs partie={p} base={bases[i]} />
          </section>
        ))}
      </div>
      {pied && <div className={s.papPied}>{pied}</div>}
    </article>
  );
}
