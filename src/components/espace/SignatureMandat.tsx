'use client';

/* ══ Le mandat de recherche, dans l'espace client ═══════════════════════════

   Trois morceaux, tous branchés sur /api/espace/mandat :

     · <SignatureMandat>   le parcours de signature, en plein écran : une page
                           d'accueil sans chiffres, le récapitulatif (où la
                           rémunération apparaît, comme la loi le veut), les
                           coordonnées, puis le code reçu par e-mail ;
     · <CarteMonMandat>    la rubrique « Mon mandat » de « Ma recherche » :
                           le PDF signé, et le lien discret « Renoncer au
                           mandat » pendant les 14 jours ; ou, préparé dans
                           la rubrique Documents du CRM, où il en est
                           (V3.55 : src/lib/documents-espace.ts) — signé en
                           ligne par lui, le même lien (V3.56) ;
     · <CartePret>         la carte de l'accueil quand Alexandre a préparé le
                           mandat (« Faire signer le mandat » dans le CRM) ;
     · <CarteDocuments>    ses documents à l'accueil : à signer, signés par
                           lui et en attente d'un autre, signés.

   Le texte affiché par « Lire le mandat complet » vient de src/lib/mandat.ts,
   exactement comme celui du PDF : ce qu'il lit est ce qu'il signe.

   ⚠️ Règle du dépôt (AGENTS.md §2.1) : pas de texte JSX qui commence par une
   espace et passe à la ligne. Ici, les phrases sont sur une ligne ou dans une
   chaîne.
   ════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resumeMandat, redigerMandat, validerMandant, validerPersonne, validerSociete, sirenLisible, titreMandat, dateLongue, dateCourte, versionMandat, heureParis,
  RETRACTATION_JOURS, COSIGNATAIRES_MAX, FORMES_SOCIETE, QUALITES_SOCIETE, ICONES,
  type Mandant, type Recherche, type Partie, type Icone, type Societe,
} from '@/lib/mandat';
import { IDENTITE_DEFAUT, lireIdentite, type IdentiteAgence } from '@/lib/agence';
import { chercherSocietes, qualiteDe, type SocieteTrouvee } from '@/lib/entreprises';
/* Des types seulement : rien de ce fichier serveur ne part dans le navigateur. */
import type { DocEspace, MandatDocEspace, SignataireEspace } from '@/lib/documents-espace';

export type MandatEspace = {
  etat: 'valide' | 'a_signer' | 'sans_numero';
  numero: string | null;
  /** Alexandre l'a préparé : la carte « prêt à signer » s'affiche à l'accueil. */
  propose: boolean;
  /** Le mandat signé en ligne, s'il y en a un. */
  signe: { le: string; numero: string; fin: string; execution: boolean | null } | null;
  expiration: string | null;
  recherche: Recherche;
  mandant: Mandant;
  /** Un code est parti il y a moins d'un quart d'heure et n'a pas servi :
      le client revient de sa messagerie, on le remet devant la case du code. */
  code?: { le: string; email: string } | null;
  /** Pré-remplissage : ceux qu'il avait déjà indiqués pour signer avec lui
      (ou le conjoint d'une fiche « couple »), et sa société. */
  prefillCos?: Mandant[];
  societe?: Societe | null;
  /** Signé à plusieurs : où en sont les autres signataires. */
  cos?: CoEspace[];
  /** Ses documents signés en ligne (avenant, offre…) : à signer, ou signés. */
  documents?: DocEspace[];
  /** Un mandat de recherche préparé par Alexandre dans le CRM (V3.32), pas
      encore signé : c'est lui qu'il signe, avec SON lien (null tant qu'il
      n'en a pas un valable à lui, ou une fois qu'il a signé). Le mandat de
      l'espace n'est alors pas proposé. */
  enRoute?: { lien: string | null } | null;
  /** Ce même mandat de la rubrique Documents, état par état, pour « Mon
      mandat de recherche » ; ou, signé, celui qui est en cours (V3.55). */
  document?: MandatDocEspace | null;
};
export type { DocEspace, MandatDocEspace, SignataireEspace } from '@/lib/documents-espace';

/* Un co-signataire vu depuis l'espace du premier : il l'a saisi lui-même,
   son adresse s'affiche donc en entier. */
export type CoEspace = {
  id: string; prenom: string; nom: string; email: string;
  statut: string;                 // invite · signe · decline · annule · retracte
  invite: string | null; signe: string | null; expire: string | null;
};
const SOCIETE_VIDE: Societe = { denomination: '', forme: 'SCI', siren: '', rcsVille: '', siege: '', qualite: 'Gérant' };
const PERSONNE_VIDE: Mandant = { civilite: '', prenom: '', nom: '', naissanceDate: '', naissanceLieu: '', adresse: '', email: '', telephone: '' };
/* « Claire », « Claire et Marc », « Claire, Marc et Léa ». */
export const prenoms = (l: { prenom: string }[]) => l.map(x => x.prenom).join(', ').replace(/, ([^,]*)$/, ' et $1');

type Envoyer = (route: string, corps: Record<string, unknown>) => Promise<any>;

/* ── Des icônes à nous : ce fichier ne dépend pas de celui de l'espace ── */
const TRACES: Record<string, string[]> = {
  check: ['M5 12.5l4.2 4.2L19 7'],
  croix: ['M6 6l12 12', 'M18 6L6 18'],
  bouclier: ['M12 3l7 3v5.5c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6z', 'M8.8 12.2l2.2 2.2 4.4-4.6'],
  doc: ['M7 3h7l4 4v14H7z', 'M14 3v4h4', 'M10 12h5', 'M10 16h5'],
  chevron: ['M15 5l-7 7 7 7'],
  tel: ['M6.2 3h3.1l1.5 3.9-2 1.3a13.4 13.4 0 0 0 6.9 6.9l1.3-2 3.9 1.5v3.1a1.9 1.9 0 0 1-2.1 1.9A17.6 17.6 0 0 1 3.1 5.1 1.9 1.9 0 0 1 5 3z'],
  mail: ['M4 6h16v12H4z', 'M4 7l8 6 8-6'],
  plume: ['M4 20l4-1 10-10-3-3L5 16z', 'M13 6l3 3'],
  horloge: ['M12 7v5l3 2', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'],
  plus: ['M12 5v14', 'M5 12h14'],
  groupe: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5', 'M16 4.3a3.5 3.5 0 0 1 0 6.4', 'M18 14.8c1.9.7 3.2 2.5 3.5 5.2'],
  societe: ['M4 21V5l8-2v18', 'M12 8l8 2.5V21', 'M7.5 8h1.5', 'M7.5 12h1.5', 'M7.5 16h1.5', 'M15.5 13h1.5', 'M15.5 17h1.5', 'M2 21h20'],
  trombone: ['M20 11.5l-8.2 8.2a5 5 0 0 1-7-7L13 4.5a3.4 3.4 0 0 1 4.8 4.8l-8.1 8.2a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4'],
  /* V3.55 : « Mes bons de visite » — voir, télécharger, déplier. */
  oeil: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z'],
  telecharger: ['M12 4v11', 'M7.5 10.5 12 15l4.5-4.5', 'M5 19.5h14'],
  deplier: ['m6.5 9.5 5.5 5.5 5.5-5.5'],
  cle: ['M8.5 15.5a4 4 0 1 1 0-8 4 4 0 0 1 0 8z', 'M12 11.5h8.5', 'M17.5 11.5v3', 'M20.5 11.5v2.2'],
};
export function Ic({ n, t = 18 }: { n: string; t?: number }) {
  const traces: readonly string[] = TRACES[n] || ICONES[n as Icone] || [];
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {traces.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/* ── Le texte complet du mandat, tel qu'il sera signé ──
   Les mêmes blocs que le PDF, dessinés de la même façon : fiches à icône,
   encadrés pour ce qui engage, engagements cochés, annexe en petit.
   Tant qu'il n'est pas signé, il le dit : un bandeau en tête, et « Non
   signé » à côté de chacune des deux parties, l'agence comprise. La
   signature d'Alexandre n'apparaît que sur le PDF, une fois le code saisi. */
export function TexteMandat({ parties, identite, moi = 0, signes = [], bandeau, cadres }: {
  parties: Partie[]; identite: IdentiteAgence;
  /* À plusieurs : qui lit (son cadre dit « vous »), et qui a déjà signé. */
  moi?: number; signes?: (string | null)[];
  /* Le bandeau du haut, quand ce n'est plus un simple projet. */
  bandeau?: string;
  /* Un document de la rubrique Documents signé électroniquement : quand
     chaque cadre a été signé (par sa clé), et celui du lecteur. */
  cadres?: { etats: Record<string, string | null>; moi?: string };
}) {
  return (
    <div className="mdt-texte">
      <div className="mdt-projet"><Ic n="doc" t={15} /><span>{bandeau || 'Projet de mandat · non signé'}</span></div>
      {parties.map((p, i) => (
        <section key={i} className="mdt-partie">
          <div className="mdt-partie-t">
            <span className="ic"><Ic n={p.ic} t={19} /></span>
            <div>
              <div className="mdt-partie-n">{`Partie ${i + 1}`}</div>
              <h4>{p.titre}</h4>
              {p.sous && <div className="mdt-partie-s">{p.sous}</div>}
            </div>
          </div>
          {p.sections.map((s, j) => (
            <div key={j} className="mdt-sec">
              {s.titre && (s.ic
                ? <div className="mdt-sec-t"><span className="ic"><Ic n={s.ic} t={14} /></span><span>{s.titre}</span></div>
                : <div className="mdt-sec-i">{s.titre}</div>)}
              {s.blocs.map((b, k) => {
                if (b.t === 'p') return <p key={k} className={b.g ? 'mdt-enc' : b.petit ? 'petit' : undefined}>{b.x}</p>;
                if (b.t === 'l') return <ul key={k}>{b.items.map((x, n) => <li key={n}>{x}</li>)}</ul>;
                if (b.t === 'coches') return (
                  <div key={k} className="mdt-coches">
                    {b.items.map((x, n) => <div key={n}><span className="k"><Ic n="check" t={12} /></span><span>{x}</span></div>)}
                  </div>
                );
                if (b.t === 'etapes') return (
                  <ol key={k} className="mdt-etapes">
                    {b.items.map((e, n) => (
                      <li key={n}><span className="n">{String(n + 1).padStart(2, '0')}</span><span><b>{e.titre}</b><span className="x">{e.x}</span></span></li>
                    ))}
                  </ol>
                );
                if (b.t === 'fiches') return (
                  <div key={k} className="mdt-fiches">
                    {b.items.map((f, n) => (
                      <div key={n} className={'mdt-fiche' + (f.large ? ' large' : '')}>
                        <div className="mdt-fiche-t"><span className="ic"><Ic n={f.ic} t={15} /></span><b>{f.titre}</b></div>
                        {f.lignes.map((l, q) => <p key={q}>{l}</p>)}
                        {f.note && <p className="note">{f.note}</p>}
                        {f.pied && <p className="pied">{f.pied}</p>}
                      </div>
                    ))}
                  </div>
                );
                if (b.t === 'case') return <p key={k} className="mdt-case"><span className="bx" data-on={b.coche ? '1' : undefined} />{b.x}</p>;
                if (b.t === 'sigs') return (
                  <div key={k}>
                    {b.mention && <p className="petit">{b.mention}</p>}
                    <div className="mdt-sigs">
                      {b.cases.map((c, n) => {
                        const le = c.cle ? cadres?.etats[c.cle] || null : null;
                        const vous = !!c.cle && c.cle === cadres?.moi;
                        return (
                          <div key={n} className="mdt-sigc">
                            <div className="q">{c.qui}</div>
                            <div className="n">{vous ? `${c.nom} · vous` : c.nom}</div>
                            {le ? <span className="mdt-ns ok">{`Signé le ${dateCourte(le)}`}</span> : <span className="mdt-ns">Non signé</span>}
                            <div className="s">{c.agence
                              ? le ? 'L’agence a signé en adressant le document.' : 'L’agence signe en adressant le document.'
                              : vous ? 'Vous signez avec le code reçu sur votre e-mail.' : le ? 'Signé avec son code personnel.' : 'Signe avec son propre code.'}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
                if (b.t === 'sig' && b.noms && b.noms.length > 1) return (
                  <div key={k} className="mdt-sigs">
                    {b.noms.map((nom, n) => {
                      const le = signes[n] || null;
                      return (
                        <div key={n} className="mdt-sigc">
                          <div className="q">{`Mandant ${n + 1}`}</div>
                          <div className="n">{n === moi ? `${nom} · vous` : nom}</div>
                          {le ? <span className="mdt-ns ok">{`Signé le ${dateCourte(le)}`}</span> : <span className="mdt-ns">Non signé</span>}
                          <div className="s">{n === moi ? 'Vous signez à l’étape 3, avec le code reçu par e-mail.' : le ? 'Signé avec son code personnel.' : 'Signe avec son propre lien et son propre code.'}</div>
                        </div>
                      );
                    })}
                    <div className="mdt-sigc">
                      <div className="q">Le mandataire</div>
                      <div className="n">{`${identite.nom.toUpperCase()} · ${identite.signataireNom}`}</div>
                      {signes[0] ? <span className="mdt-ns ok">Signé</span> : <span className="mdt-ns">Non signé</span>}
                      <div className="s">{signes[0] ? 'Sa signature a été apposée quand le premier mandant a signé.' : 'Sa signature est apposée sur le document au moment où le premier mandant signe.'}</div>
                    </div>
                  </div>
                );
                return (
                  <div key={k} className="mdt-sigs">
                    <div className="mdt-sigc">
                      <div className="q">Le mandant</div>
                      <div className="n">Vous</div>
                      <span className="mdt-ns">Non signé</span>
                      <div className="s">Vous signez à l’étape 3, avec le code reçu par e-mail.</div>
                    </div>
                    <div className="mdt-sigc">
                      <div className="q">Le mandataire</div>
                      <div className="n">{`${identite.nom.toUpperCase()} · ${identite.signataireNom}`}</div>
                      <span className="mdt-ns">Non signé</span>
                      <div className="s">Sa signature est apposée sur le document au moment où vous signez.</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/* ── Un champ du formulaire (au niveau du module : sinon il se remonte à
   chaque frappe et le clavier se referme — AGENTS.md §2.4) ── */
export function Champ({ lib, val, onChange, err, type = 'text', mode, auto, placeholder, lecture }: {
  lib: string; val: string; onChange: (v: string) => void; err?: string; type?: string;
  mode?: 'text' | 'email' | 'tel' | 'numeric'; auto?: string; placeholder?: string;
  /* Affiché, pas modifiable (V3.43 : l'adresse du co-signataire). */
  lecture?: boolean;
}) {
  return (
    <label className={'mdt-ch' + (err ? ' err' : '')}>
      <span className="l">{lib}</span>
      <input type={type} value={val} onChange={e => onChange(e.target.value)} inputMode={mode}
        autoComplete={auto} placeholder={placeholder} readOnly={lecture}
        style={lecture ? { background: '#F5F8FC', color: '#46566B' } : undefined} />
      {err && <span className="e">{err}</span>}
    </label>
  );
}

/* ── La date de naissance, tapée au clavier ──
   Un calendrier est pénible pour une date de 1962 : on tape les chiffres,
   les barres se posent toutes seules (12031985 → 12/03/1985). La fiche
   garde le format AAAA-MM-JJ ; tant que la date n'est pas complète et
   réelle, c'est le texte brut qui remonte, et la vérification le refuse. */
const isoVersFr = (v: string) => { const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return d ? `${d[3]}/${d[2]}/${d[1]}` : ''; };
function frVersIso(t: string): string {
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (!d) return '';
  const j = Number(d[1]), m = Number(d[2]), a = Number(d[3]);
  const x = new Date(Date.UTC(a, m - 1, j));
  return x.getUTCFullYear() === a && x.getUTCMonth() === m - 1 && x.getUTCDate() === j ? `${d[3]}-${d[2]}-${d[1]}` : '';
}
export function ChampDate({ lib, val, onChange, err }: { lib: string; val: string; onChange: (v: string) => void; err?: string }) {
  const [t, setT] = useState(() => isoVersFr(val) || (/^\d{4}-/.test(val) ? '' : val));
  useEffect(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(val) && frVersIso(t) !== val) setT(isoVersFr(val));
  }, [val]); // eslint-disable-line react-hooks/exhaustive-deps
  const saisir = (brut: string) => {
    /* Le remplissage automatique du navigateur arrive parfois en AAAA-MM-JJ. */
    if (/^\d{4}-\d{2}-\d{2}$/.test(brut.trim())) { setT(isoVersFr(brut.trim())); onChange(brut.trim()); return; }
    const c = brut.replace(/\D/g, '').slice(0, 8);
    const f = c.length > 4 ? `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}` : c.length > 2 ? `${c.slice(0, 2)}/${c.slice(2)}` : c;
    setT(f); onChange(frVersIso(f) || f);
  };
  return (
    <label className={'mdt-ch' + (err ? ' err' : '')}>
      <span className="l">{lib}</span>
      <input type="text" inputMode="numeric" autoComplete="bday" placeholder="JJ/MM/AAAA" maxLength={10}
        value={t} onChange={e => saisir(e.target.value)} />
      {err && <span className="e">{err}</span>}
    </label>
  );
}

/* ── L'adresse en trois cases ──
   Rue, code postal, ville : plus simple à remplir, et rien ne manque sur
   le mandat. Le mandat garde une seule ligne, « 18 avenue Victor Hugo,
   92100 Boulogne-Billancourt » ; une adresse déjà connue est redécoupée. */
export type Adresse = { rue: string; cp: string; ville: string };
export function couperAdresse(a: string): Adresse {
  const t = (a || '').trim();
  const d = /^(.*?)[,\s]+(\d{5})\s+(.+)$/.exec(t);
  return d ? { rue: d[1].trim(), cp: d[2], ville: d[3].trim() } : { rue: t, cp: '', ville: '' };
}
export const joindreAdresse = (x: Adresse) => [x.rue.trim(), [x.cp.trim(), x.ville.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');

/* ── La signature à la main ──
   Le dernier geste : le client a tapé son code, il appuie sur « Signer mon
   mandat », un cadre blanc s'ouvre et il signe au doigt (ou à la souris).
   « Valider et signer » envoie le code ET le tracé : le serveur vérifie le
   code, pose la signature dans la case du mandant du PDF, puis scelle. Le
   tracé n'ajoute rien à la valeur juridique (c'est le code qui identifie),
   mais le client sait qu'il signe. Au niveau du module (AGENTS.md §2.4). */
export function PadSignature({ nom, envoi, onAnnuler, onValider }: {
  nom: string; envoi: boolean; onAnnuler: () => void; onValider: (png: string) => void;
}) {
  const toile = useRef<HTMLCanvasElement>(null);
  const dernier = useRef<{ x: number; y: number } | null>(null);
  const boite = useRef({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const longueur = useRef(0);
  const [assez, setAssez] = useState(false);
  const [vide, setVide] = useState(true);

  const preparer = useCallback(() => {
    const c = toile.current; if (!c) return;
    const r = c.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr));
    const x = c.getContext('2d'); if (!x) return;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#13243D'; x.fillStyle = '#13243D'; x.lineWidth = 2.6;
    boite.current = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    longueur.current = 0; dernier.current = null; setAssez(false); setVide(true);
  }, []);
  useEffect(() => {
    preparer();
    /* Le téléphone qui pivote change la taille du cadre : on repart d'une page blanche. */
    window.addEventListener('resize', preparer);
    return () => window.removeEventListener('resize', preparer);
  }, [preparer]);

  const ou = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const etendre = (p: { x: number; y: number }) => {
    const b = boite.current;
    b.x0 = Math.min(b.x0, p.x); b.y0 = Math.min(b.y0, p.y); b.x1 = Math.max(b.x1, p.x); b.y1 = Math.max(b.y1, p.y);
  };
  const poser = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (envoi) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sans effet */ }
    const p = ou(e), x = e.currentTarget.getContext('2d');
    if (x) { x.beginPath(); x.arc(p.x, p.y, 1.3, 0, Math.PI * 2); x.fill(); }
    dernier.current = p; etendre(p); setVide(false);
  };
  const tracer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = dernier.current, x = e.currentTarget.getContext('2d');
    if (!a || !x) return;
    e.preventDefault();
    /* Tous les points que l'écran a vus depuis le dernier dessin : un trait
       rapide reste une courbe, pas une ligne brisée. */
    const evs = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
    const r = e.currentTarget.getBoundingClientRect();
    const pts = (evs.length ? evs : [e.nativeEvent]).map(v => ({ x: v.clientX - r.left, y: v.clientY - r.top }));
    let prec = a;
    x.beginPath(); x.moveTo(prec.x, prec.y);
    for (const p of pts) { x.lineTo(p.x, p.y); longueur.current += Math.hypot(p.x - prec.x, p.y - prec.y); etendre(p); prec = p; }
    x.stroke();
    dernier.current = prec;
    if (longueur.current > 80) setAssez(true);
  };
  const lever = () => { dernier.current = null; };

  const valider = () => {
    const c = toile.current; if (!c) return;
    const r = c.getBoundingClientRect(), dpr = c.width / (r.width || 1), b = boite.current, m = 8;
    const x0 = Math.max(0, (b.x0 - m) * dpr), y0 = Math.max(0, (b.y0 - m) * dpr);
    const x1 = Math.min(c.width, (b.x1 + m) * dpr), y1 = Math.min(c.height, (b.y1 + m) * dpr);
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), k = Math.min(1, 900 / w);
    const o = document.createElement('canvas');
    o.width = Math.max(1, Math.round(w * k)); o.height = Math.max(1, Math.round(h * k));
    o.getContext('2d')?.drawImage(c, x0, y0, w, h, 0, 0, o.width, o.height);
    onValider(o.toDataURL('image/png'));
  };

  return (
    <div className="mdt-pad" role="dialog" aria-modal="true" aria-label="Votre signature">
      <div className="mdt-pad-in">
        <div className="mdt-pad-t">
          <b>Dernière étape : votre signature</b>
          <button type="button" className="mdt-rond" aria-label="Annuler" disabled={envoi} onClick={onAnnuler}><Ic n="croix" t={14} /></button>
        </div>
        <p className="mdt-p">Pour finaliser, signez dans le cadre avec votre doigt (ou votre souris), comme sur papier.</p>
        <div className="mdt-pad-zone">
          <canvas ref={toile} onPointerDown={poser} onPointerMove={tracer} onPointerUp={lever} onPointerCancel={lever} />
          <span className="ligne" />
          <span className="x">×</span>
          {vide && <span className="aide">Signez ici</span>}
          <span className="nom">{nom}</span>
        </div>
        <div className="mdt-pad-b">
          <button type="button" className="btn fant" disabled={envoi || vide} onClick={preparer}>Effacer</button>
          <button type="button" className="btn or" disabled={!assez || envoi} onClick={valider}><Ic n="plume" t={16} /><span>Valider et signer</span></button>
        </div>
        {envoi && (
          <div className="mdt-pad-attente" role="status">
            <span className="tour" />
            <b>Signature en cours…</b>
            <span>Nous scellons votre mandat.</span>
          </div>
        )}
      </div>
    </div>
  );
}

export const ERREURS: Record<string, string> = {
  code: 'Ce code ne correspond pas.',
  quota: 'Vous avez demandé beaucoup de codes d’affilée : réessayez dans une heure, ou appelez Alexandre.',
  kbis: 'Le Kbis n’a pas pu être lu : un PDF ou une photo de 3 Mo au plus. Vous pouvez aussi continuer sans.',
  email: 'Cette adresse e-mail ne semble pas juste.',
  email_pris: 'Cette adresse est déjà celle d’un autre signataire : chacun signe avec la sienne.',
  aucun: 'Cette action n’est plus possible : rechargez la page.',
  expire: 'Ce code a expiré : demandez-en un nouveau.',
  trop: 'Trop d’essais : demandez un nouveau code.',
  recommencer: 'Demandez un nouveau code pour signer.',
  attendre: 'Un code vient de partir : attendez quelques secondes avant d’en redemander un.',
  numero: 'Votre conseiller finalise votre dossier : il revient vers vous très vite pour la signature.',
  change: 'Votre mandat vient d’être mis à jour par Alexandre. Relisez le récapitulatif, puis demandez votre code.',
  mail: 'Le code n’a pas pu être envoyé. Vérifiez votre adresse e-mail, puis réessayez.',
  stockage: 'La signature n’a pas pu être enregistrée. Réessayez dans un instant.',
  enregistrement: 'La signature n’a pas pu être enregistrée. Réessayez dans un instant.',
  deja: 'Votre mandat est déjà signé.',
  document: 'Alexandre vous a déjà préparé votre mandat de recherche : inutile d’en signer un second ici. Revenez à votre espace pour voir où il en est.',
  /* V3.56 : Alexandre a retiré la proposition pendant qu'il signait. */
  retire: 'Ce mandat n’est plus à signer pour le moment : Alexandre revient vers vous très vite.',
};

/* « document » (V3.32) : Alexandre lui a préparé son mandat dans le CRM, le
   serveur refuse celui de l'espace. Ce qu'on lui dit dépend de ce qu'il a à
   faire (V3.55) : le signer avec SON lien, rien (il l'a déjà signé), ou
   attendre qu'Alexandre revienne vers lui. Jamais « c'est celui-là qu'il
   faut signer » sans lui donner de quoi le signer. */
type RefusDocument = { lien: string | null; signe: boolean };
const refusDocument = (r: { lien?: unknown; signe?: unknown } | null | undefined): RefusDocument => ({
  lien: typeof r?.lien === 'string' && r.lien.startsWith('/signer/') ? r.lien : null,
  signe: r?.signe === true,
});

/* ── Son conjoint, un co-acquéreur : la fiche qu'il remplit pour lui ──
   Au niveau du module (AGENTS.md §2.4). « Même adresse que moi » est coché
   d'office : c'est le cas le plus courant, et trois cases de moins. */
function FormPersonne({ p, meme, champs, nouveau, onP, onMeme, onEnregistrer, onAnnuler, onRetirer }: {
  p: Mandant; meme: boolean; champs: Record<string, string>; nouveau: boolean;
  onP: (p: Mandant) => void; onMeme: (b: boolean) => void; onEnregistrer: () => void; onAnnuler: () => void; onRetirer: () => void;
}) {
  const [adr, setAdr] = useState<Adresse>(() => couperAdresse(p.adresse));
  const maj = (k: keyof Mandant) => (v: string) => onP({ ...p, [k]: v });
  const majAdr = (k: keyof Adresse) => (v: string) => { const x = { ...adr, [k]: v }; setAdr(x); onP({ ...p, adresse: joindreAdresse(x) }); };
  const qui = p.prenom.trim() || (p.civilite === 'Madame' ? 'elle' : p.civilite === 'Monsieur' ? 'lui' : 'cette personne');
  return (
    <div className="mdt-perso">
      <div className="mdt-perso-t">
        <span className="n">Votre co-acquéreur</span>
        {!nouveau && <button type="button" className="mdt-qui-a" onClick={onRetirer}>Retirer</button>}
      </div>
      <div className={'mdt-civ' + (champs.civilite ? ' err' : '')}>
        {(['Madame', 'Monsieur'] as const).map(c => (
          <button key={c} type="button" data-on={p.civilite === c ? '1' : undefined} onClick={() => onP({ ...p, civilite: c })}>{c}</button>
        ))}
      </div>
      {champs.civilite && <div className="mdt-err-l">{champs.civilite}</div>}
      <div className="mdt-deux">
        <Champ lib="Prénom" val={p.prenom} onChange={maj('prenom')} err={champs.prenom} auto="off" />
        <Champ lib="Nom" val={p.nom} onChange={maj('nom')} err={champs.nom} auto="off" />
      </div>
      <div className="mdt-deux">
        <ChampDate lib="Date de naissance" val={p.naissanceDate} onChange={maj('naissanceDate')} err={champs.naissanceDate} />
        <Champ lib="Lieu de naissance" val={p.naissanceLieu} onChange={maj('naissanceLieu')} err={champs.naissanceLieu} placeholder="Ville (département)" />
      </div>
      <Champ lib="Son e-mail — son lien de signature arrive ici" val={p.email} onChange={maj('email')} err={champs.email} type="email" mode="email" auto="off" />
      <Champ lib="Son téléphone (facultatif)" val={p.telephone} onChange={maj('telephone')} err={champs.telephone} type="tel" mode="tel" auto="off" />
      <button type="button" className="mdt-coche mdt-leger" data-on={meme ? '1' : undefined} onClick={() => onMeme(!meme)}>
        <span className="bx">{meme && <Ic n="check" t={14} />}</span><span>Même adresse que moi</span>
      </button>
      {champs.meme && <div className="mdt-err-l">{champs.meme}</div>}
      {!meme && (
        <>
          <Champ lib="Son adresse" val={adr.rue} onChange={majAdr('rue')} err={champs.adresse} placeholder="Numéro et rue" auto="off" />
          <div className="mdt-cpv">
            <Champ lib="Code postal" val={adr.cp} onChange={majAdr('cp')} mode="numeric" auto="off" />
            <Champ lib="Ville" val={adr.ville} onChange={majAdr('ville')} auto="off" />
          </div>
        </>
      )}
      <div className="mdt-info"><Ic n="mail" t={16} /><span>{`${qui.charAt(0).toUpperCase() + qui.slice(1)} recevra son propre lien dès que vous aurez signé : relire le mandat, vérifier ses informations, signer avec son propre code.`}</span></div>
      <div className="mdt-perso-b">
        <button type="button" className="btn fant" onClick={onAnnuler}>Annuler</button>
        <button type="button" className="btn or" onClick={onEnregistrer}>Enregistrer</button>
      </div>
    </div>
  );
}

/* ── Sa société ──
   Il la cherche dans le registre public (nom ou SIREN) et la choisit : on
   remplit tout pour lui (src/lib/entreprises.ts). Les champs restent
   modifiables — le greffe, surtout, quand on ne peut pas le déduire. */
function FormSociete({ s, champs, civilite, prenom, nom, kbis, kbisErr, onS, onKbis }: {
  s: Societe; champs: Record<string, string>; civilite: string; prenom: string; nom: string; kbis: { nom: string } | null; kbisErr: string;
  onS: (s: Societe) => void; onKbis: (f: File | null) => void;
}) {
  const maj = (k: keyof Societe) => (v: string) => onS({ ...s, [k]: v });
  const f = civilite === 'Madame';
  const fem: Record<string, string> = { 'Gérant': 'Gérante', 'Président': 'Présidente', 'Directeur général': 'Directrice générale', 'Associé habilité': 'Associée habilitée' };
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SocieteTrouvee[]>([]);
  const [etat, setEtat] = useState<'' | 'cherche' | 'vide' | 'erreur'>('');
  const [repris, setRepris] = useState(false);
  const court = q.trim().replace(/\s/g, '').length < 3;
  useEffect(() => {
    const t = q.trim();
    if (t.replace(/\s/g, '').length < 3) return;
    const c = new AbortController();
    const minuteur = setTimeout(async () => {
      setEtat('cherche');
      try {
        const r = await chercherSocietes(t, c.signal);
        setRes(r); setEtat(r.length ? '' : 'vide');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') { setRes([]); setEtat('erreur'); }
      }
    }, 350);
    return () => { clearTimeout(minuteur); c.abort(); };
  }, [q]);
  const choisir = (x: SocieteTrouvee) => {
    onS({
      denomination: x.denomination, forme: (FORMES_SOCIETE as readonly string[]).includes(x.forme) ? x.forme : 'Autre',
      siren: sirenLisible(x.siren), rcsVille: x.rcsVille || s.rcsVille, siege: x.siege, qualite: qualiteDe(x, prenom, nom) || s.qualite,
    });
    setQ(''); setRes([]); setEtat(''); setRepris(true);
  };
  return (
    <div className="mdt-perso">
      <div className="mdt-perso-t"><span className="n">Votre société</span></div>
      <div className="mdt-soc-q">
        <Champ lib="Retrouvez-la : son nom ou son SIREN" val={q} onChange={v => setQ(v)} placeholder="SCI Les Tilleuls, ou 732 829 320" auto="off" />
        {!court && etat === 'cherche' && <div className="mdt-soc-e">Recherche…</div>}
        {!court && etat === 'vide' && <div className="mdt-soc-e">{'Aucune société active ne correspond : vérifiez l’orthographe, ou remplissez les cases ci-dessous.'}</div>}
        {!court && etat === 'erreur' && <div className="mdt-soc-e">{'La recherche ne répond pas pour le moment : remplissez les cases ci-dessous.'}</div>}
        {!court && res.length > 0 && (
          <div className="mdt-soc-l" role="listbox">
            {res.map(x => (
              <button key={x.siren} type="button" role="option" aria-selected={false} onClick={() => choisir(x)}>
                <b>{x.denomination}</b>
                <span>{[x.forme !== 'Autre' ? x.forme : '', `SIREN ${sirenLisible(x.siren)}`, x.commune].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {repris && <div className="mdt-info"><Ic n="check" t={16} /><span>{'Repris du registre national des entreprises. Vérifiez chaque case, et complétez la ville du greffe si elle manque.'}</span></div>}
      <Champ lib="Nom de la société" val={s.denomination} onChange={maj('denomination')} err={champs.denomination} placeholder="SCI Les Tilleuls" auto="organization" />
      <label className={'mdt-ch' + (champs.forme ? ' err' : '')}>
        <span className="l">Forme</span>
        <select className="mdt-sel" value={s.forme} onChange={e => maj('forme')(e.target.value)}>
          {FORMES_SOCIETE.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        {champs.forme && <span className="e">{champs.forme}</span>}
      </label>
      <div className="mdt-deux">
        <Champ lib="N° SIREN" val={s.siren} onChange={v => maj('siren')(v.replace(/[^\d ]/g, '').slice(0, 11))} err={champs.siren} mode="numeric" placeholder="9 chiffres" auto="off" />
        <Champ lib="Ville du greffe (RCS)" val={s.rcsVille} onChange={maj('rcsVille')} err={champs.rcsVille} placeholder="Nanterre" auto="off" />
      </div>
      <Champ lib="Adresse du siège" val={s.siege} onChange={maj('siege')} err={champs.siege} placeholder="Numéro, rue, code postal et ville" auto="off" />
      <label className={'mdt-ch' + (champs.qualite ? ' err' : '')}>
        <span className="l">Vous la représentez en tant que</span>
        <select className="mdt-sel" value={s.qualite} onChange={e => maj('qualite')(e.target.value)}>
          {QUALITES_SOCIETE.map(x => <option key={x} value={x}>{f ? fem[x] || x : x}</option>)}
        </select>
        {champs.qualite && <span className="e">{champs.qualite}</span>}
      </label>
      <label className="mdt-depot">
        <Ic n="trombone" t={20} />
        <span><b>{kbis ? kbis.nom : 'Joindre le Kbis'}</b><span>{kbis ? 'Touchez pour le remplacer' : 'PDF ou photo · facultatif'}</span></span>
        <input type="file" accept="application/pdf,image/*" onChange={e => onKbis(e.target.files?.[0] || null)} />
      </label>
      {kbisErr && <div className="mdt-err-l">{kbisErr}</div>}
      <div className="mdt-info"><Ic n="info" t={16} /><span>{'Votre société n’est pas encore créée ? Choisissez « En mon nom » : le mandat vous engage aussi pour la société que vous créerez.'}</span></div>
    </div>
  );
}

/* Le Kbis : un PDF tel quel (3 Mo au plus), une photo réduite à 1 800 px. */
async function lireKbisFichier(f: File): Promise<string> {
  const lire = (b: Blob) => new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = ko; r.readAsDataURL(b); });
  if (f.type === 'application/pdf') { if (f.size > 3_000_000) throw new Error('lourd'); return lire(f); }
  if (!f.type.startsWith('image/')) throw new Error('format');
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const k = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
    const d = c.toDataURL('image/jpeg', 0.82);
    if (d.length > 4_000_000) throw new Error('lourd');
    return d;
  } finally { URL.revokeObjectURL(url); }
}
const initiales = (x: { prenom: string; nom: string }) => `${x.prenom.trim().charAt(0)}${x.nom.trim().charAt(0)}`.toUpperCase() || '·';

/* ══ Le parcours de signature ═══════════════════════════════════════════ */

export default function SignatureMandat({ mandat, raison, envoyer, onFermer, onSigne, tel, bienId }: {
  mandat: MandatEspace;
  /** 'visite' : il vient d'appuyer sur « Je souhaite le visiter ». */
  raison: 'visite' | 'libre';
  /** Le bien qu'il voulait visiter : Alexandre le voit s'il demande à être rappelé. */
  bienId?: string;
  envoyer: Envoyer;
  onFermer: () => void;
  /** Appelé une fois signé : l'espace se met à jour, la demande de visite part. */
  onSigne: (r: { numero: string; signeLe: string; finRetractation: string; execution: boolean; attente?: CoEspace[] }) => Promise<void> | void;
  tel: string;
}) {
  /* Un code déjà envoyé et encore valable : on reprend là où il en était. */
  const [etape, setEtape] = useState<'accueil' | 'recap' | 'lecture' | 'coord' | 'signer' | 'fini'>(mandat.code ? 'signer' : 'accueil');
  const [retourLecture, setRetourLecture] = useState<'recap' | 'signer'>('recap');
  const [m, setM] = useState<Mandant>(mandat.mandant);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [adr, setAdr] = useState<Adresse>(() => couperAdresse(mandat.mandant.adresse));
  const majAdr = (k: keyof Adresse) => (v: string) => {
    const x = { ...adr, [k]: k === 'cp' ? v.replace(/[^0-9A-Za-z -]/g, '').slice(0, 10) : v };
    setAdr(x); setM(o => ({ ...o, adresse: joindreAdresse(x) }));
    setChamps(c => ({ ...c, adresse: '', [k]: '' }));
  };
  const [numero, setNumero] = useState<string | null>(mandat.numero);
  const [emailMasque, setEmailMasque] = useState(mandat.code?.email || '');
  /* Vrai dès qu'un code est parti (ou l'était déjà) : « J'ai déjà mon code ». */
  const [codeParti, setCodeParti] = useState(!!mandat.code);
  /* L'heure du code repris : « envoyé à 14 h 08 ». Effacée dès qu'un nouveau part. */
  const [codeDe, setCodeDe] = useState(mandat.code?.le || '');
  const [lu, setLu] = useState(false);
  /* « Ces informations sont exactes et sont les miennes » : le mandat est
     établi à son nom, il doit le certifier avant de recevoir son code. */
  const [certifie, setCertifie] = useState(false);
  /* Le cadre de la signature à la main, ouvert par « Signer mon mandat ». */
  const [pad, setPad] = useState(false);
  const [execution, setExecution] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [attente, setAttente] = useState(0);
  const [fin, setFin] = useState<{ numero: string; finRetractation: string; execution: boolean; signeLe?: string } | null>(null);
  /* La recherche telle que le mandat la décrit, taux compris. Elle part de
     la page, et se remet à jour si Alexandre change le taux entre-temps. */
  const [rech, setRech] = useState<Recherche>(mandat.recherche);
  /* L'identité de l'agence (Paramètres › Agence), celle que le PDF
     imprimera : elle arrive avec l'ouverture du parcours. */
  const [identite, setIdentite] = useState<IdentiteAgence>(IDENTITE_DEFAUT);
  const [avis, setAvis] = useState('');
  const [question, setQuestion] = useState<'' | 'envoi' | 'ok'>('');
  /* À plusieurs, ou via une société (étape 2). Signer seul, en son nom,
     reste la voie par défaut. */
  const [achat, setAchat] = useState<'nom' | 'societe'>(mandat.societe ? 'societe' : 'nom');
  const [soc, setSoc] = useState<Societe>(mandat.societe || SOCIETE_VIDE);
  const [champsSoc, setChampsSoc] = useState<Record<string, string>>({});
  const [kbis, setKbis] = useState<{ nom: string; data: string } | null>(null);
  const [kbisErr, setKbisErr] = useState('');
  const [cos, setCos] = useState<Mandant[]>(mandat.prefillCos || []);
  const [memes, setMemes] = useState<boolean[]>(() => (mandat.prefillCos || []).map(c => !c.adresse || c.adresse === mandat.mandant.adresse));
  const [edite, setEdite] = useState<number | null>(null);
  const [brouillon, setBrouillon] = useState<Mandant>(PERSONNE_VIDE);
  const [memeB, setMemeB] = useState(true);
  const [champsCo, setChampsCo] = useState<Record<string, string>>({});
  /* Après sa signature : ceux qu'on attend encore. */
  const [enAttente, setEnAttente] = useState<CoEspace[]>([]);
  /* Le serveur refuse : son mandat l'attend dans le CRM (voir RefusDocument). */
  const [docRefus, setDocRefus] = useState<RefusDocument | null>(null);
  const haut = useRef<HTMLDivElement>(null);
  const refuser = (r: { lien?: unknown; signe?: unknown } | null | undefined) => {
    setDocRefus(refusDocument(r)); setErreur(''); setPad(false); setEtape('accueil');
  };

  /* On note l'ouverture : c'est la première ligne du déroulé du certificat.
     La réponse porte la version du jour du mandat. */
  useEffect(() => {
    let vivant = true;
    envoyer('mandat', { etape: 'afficher' }).then(r => {
      if (!vivant) return;
      /* Alexandre lui a préparé son mandat dans le CRM (V3.32) : pas celui-ci. */
      if (r?.error === 'document') { setDocRefus(refusDocument(r)); setEtape('accueil'); }
      if (r?.recherche) setRech(r.recherche);
      if (r?.identite) setIdentite(lireIdentite(r.identite));
    });
    return () => { vivant = false; };
  }, [envoyer]);
  /* Pendant la signature, l'espace ne se recharge pas tout seul au retour
     (voir EspaceClient) : le client part chercher son code dans sa
     messagerie, il doit retrouver l'écran tel qu'il l'a laissé. */
  useEffect(() => {
    try { document.documentElement.dataset.saisie = 'mandat'; } catch { /* sans effet */ }
    return () => { try { delete document.documentElement.dataset.saisie; } catch { /* sans effet */ } };
  }, []);
  /* Chaque étape repart en haut de l'écran. */
  useEffect(() => { haut.current?.closest('.feuille')?.scrollTo({ top: 0 }); }, [etape]);
  /* Le compte à rebours de « Renvoyer le code ». */
  useEffect(() => {
    if (attente <= 0) return;
    const t = setTimeout(() => setAttente(a => a - 1), 1000);
    return () => clearTimeout(t);
  }, [attente]);

  const resume = useMemo(() => resumeMandat(rech), [rech]);
  const avecQui = useMemo(() => (achat === 'nom' ? cos.map((c, i) => (memes[i] ? { ...c, adresse: m.adresse } : c)) : []), [achat, cos, memes, m.adresse]);
  const parties = useMemo(() => {
    const complet = etape === 'lecture' && retourLecture === 'signer';
    return redigerMandat({
      numero: numero || '…', mandant: complet ? m : null,
      recherche: rech, executionImmediate: null,
      ...(complet ? { cosignataires: avecQui, societe: achat === 'societe' ? soc : null } : {}),
    }, identite);
  }, [numero, m, etape, retourLecture, rech, identite, avecQui, achat, soc]);

  /* Le mandat a changé sous ses yeux (Alexandre a mis à jour le taux) :
     il relit le récapitulatif, et redemande un code. */
  const relire = (r: { recherche?: Recherche }) => {
    if (r.recherche) setRech(r.recherche);
    setAvis(ERREURS.change); setErreur(''); setLu(false); setCode('');
    setEtape('recap');
  };

  const poserQuestion = async () => {
    setQuestion('envoi');
    const r = await envoyer('mandat', { etape: 'question', bienId });
    setQuestion(r?.ok ? 'ok' : '');
    if (!r?.ok) setErreur('Votre demande n’est pas partie. Vous pouvez appeler Alexandre directement.');
  };
  const aide = (
    <div className="mdt-aide">
      {question === 'ok'
        ? <span className="ok"><Ic n="check" t={14} /><span>C’est noté&nbsp;: Alexandre vous rappelle très vite.</span></span>
        : (
          <>
            <button type="button" className="mdt-lien" disabled={question === 'envoi'} onClick={poserQuestion}>
              <Ic n="tel" t={14} /><span>{question === 'envoi' ? 'Envoi…' : 'Une question sur le mandat ? Être rappelé'}</span>
            </button>
            <a className="mdt-lien fin" href={'tel:' + tel.replace(/\s/g, '')}>{`ou appeler le ${tel}`}</a>
          </>
        )}
    </div>
  );

  const pas = etape === 'recap' || etape === 'lecture' ? 1 : etape === 'coord' ? 2 : etape === 'signer' ? 3 : 0;
  const maj = (k: keyof Mandant) => (v: string) => { setM(x => ({ ...x, [k]: v })); setChamps(c => ({ ...c, [k]: '' })); };

  /* ── Ses co-signataires : ajouter, modifier, retirer ── */
  const ouvrirCo = (i: number, champsInit: Record<string, string> = {}) => {
    setEdite(i); setBrouillon(cos[i] || PERSONNE_VIDE); setMemeB(i < memes.length ? memes[i] : true); setChampsCo(champsInit); setErreur('');
  };
  const ajouterCo = () => { setEdite(cos.length); setBrouillon(PERSONNE_VIDE); setMemeB(true); setChampsCo({}); setErreur(''); };
  const enregistrerCo = () => {
    if (edite === null) return;
    if (memeB && m.adresse.trim().length < 8) { setChampsCo({ meme: 'Complétez d’abord votre adresse, plus haut.' }); return; }
    const pris = [m.email, ...cos.filter((_, j) => j !== edite).map(c => c.email)];
    const v = validerPersonne({ ...brouillon, adresse: memeB ? m.adresse : brouillon.adresse }, pris);
    if (!v.ok) { setChampsCo(v.champs); return; }
    const l = [...cos]; l[edite] = v.mandant; setCos(l);
    const mm = [...memes]; mm[edite] = memeB; setMemes(mm);
    setEdite(null); setChampsCo({});
  };
  const retirerCo = (i: number) => {
    setCos(cos.filter((_, j) => j !== i)); setMemes(memes.filter((_, j) => j !== i)); setEdite(null); setChampsCo({});
  };
  const choisirKbis = async (f: File | null) => {
    setKbisErr('');
    if (!f) return;
    try { setKbis({ nom: f.name, data: await lireKbisFichier(f) }); }
    catch { setKbis(null); setKbisErr(ERREURS.kbis); }
  };

  /* Ce qui part avec chaque demande de code : lui, et ceux qui signent avec
     lui (ou sa société). Le renvoi du code repart avec la même chose, sinon
     le serveur oublierait ses co-signataires. */
  const corps = (mm: Mandant) => ({
    etape: 'code', mandant: mm, version: versionMandat(rech),
    cosignataires: achat === 'nom' ? cos.map((c, i) => (memes[i] ? { ...c, adresse: mm.adresse } : c)) : [],
    societe: achat === 'societe' ? soc : null,
  });

  const demanderCode = async () => {
    const v = validerMandant(m);
    /* Les trois cases de l'adresse, chacune la sienne. */
    const manque: Record<string, string> = {};
    if (adr.rue.trim().length < 3) manque.rue = 'Numéro et rue';
    if (!/^[0-9A-Za-z -]{4,10}$/.test(adr.cp.trim())) manque.cp = 'Code postal';
    if (adr.ville.trim().length < 2) manque.ville = 'Ville';
    if (!certifie) manque.certifie = 'Cochez cette case pour recevoir votre code.';
    if (!v.ok || Object.keys(manque).length) { setChamps({ ...(v.ok ? {} : v.champs), ...manque, ...(Object.keys(manque).length ? { adresse: '' } : {}) }); return; }
    if (edite !== null) { setErreur(`Enregistrez d’abord les informations de ${brouillon.prenom.trim() || 'votre co-acquéreur'} (ou annulez).`); return; }
    const c0 = corps(v.mandant);
    if (achat === 'nom') {
      for (let i = 0; i < c0.cosignataires.length; i++) {
        const vc = validerPersonne(c0.cosignataires[i], [v.mandant.email, ...c0.cosignataires.filter((_, j) => j !== i).map(c => c.email)]);
        if (!vc.ok) { ouvrirCo(i, vc.champs); setErreur(`Complétez les informations de ${c0.cosignataires[i].prenom || 'votre co-acquéreur'}.`); return; }
      }
    } else {
      const vs = validerSociete(soc);
      if (!vs.ok) { setChampsSoc(vs.champs); setErreur('Complétez les informations de votre société.'); return; }
    }
    setEnvoi(true); setErreur('');
    const r = await envoyer('mandat', { ...c0, certifie: true, ...(achat === 'societe' && kbis ? { kbis: kbis.data } : {}) });
    setEnvoi(false);
    if (r?.ok) {
      setNumero(r.numero); setEmailMasque(r.email); setCode(''); setAttente(45); setAvis(''); setCodeParti(true); setCodeDe('');
      setEtape('signer');
    } else if (r?.error === 'change') {
      relire(r);
    } else if (r?.error === 'document') {
      refuser(r);
    } else if (r?.error === 'coordonnees' && r.champs) {
      if (typeof r.co === 'number') { ouvrirCo(r.co, r.champs); setErreur('Vérifiez les informations de votre co-acquéreur.'); }
      else if (r.societe) { setChampsSoc(r.champs); setErreur('Vérifiez les informations de votre société.'); }
      else setChamps(r.champs);
    } else {
      setErreur(ERREURS[r?.error] || 'Une erreur est survenue. Réessayez dans un instant.');
    }
  };

  const renvoyer = async () => {
    setErreur('');
    const r = await envoyer('mandat', corps(m));
    if (r?.ok) { setEmailMasque(r.email); setCode(''); setAttente(45); setCodeParti(true); setCodeDe(''); }
    else if (r?.error === 'change') relire(r);
    else if (r?.error === 'document') refuser(r);
    else setErreur(ERREURS[r?.error] || 'Le code n’a pas pu être renvoyé.');
  };

  const signer = async (griffe: string) => {
    if (!lu || execution === null || code.length !== 6) return;
    setEnvoi(true); setErreur('');
    /* Quelques secondes de « Signature en cours… », même si le serveur va
       plus vite : le client voit que quelque chose de sérieux se passe. */
    const [r] = await Promise.all([
      envoyer('mandat', { etape: 'signer', code, execution, accepte: true, griffe }),
      new Promise(ok => setTimeout(ok, 1600)),
    ]);
    setPad(false);
    if (r?.ok) {
      const att: CoEspace[] = Array.isArray(r.attente)
        ? r.attente.map((x: { id: string; prenom: string; nom: string; email: string }) => ({
          id: x.id, prenom: x.prenom, nom: x.nom, email: x.email, statut: 'invite', invite: r.signeLe || new Date().toISOString(), signe: null, expire: null,
        })) : [];
      setEnAttente(att);
      const res = { numero: r.numero, signeLe: r.signeLe || new Date().toISOString(), finRetractation: r.finRetractation, execution: r.execution ?? execution, ...(att.length ? { attente: att } : {}) };
      try { await onSigne(res); } catch { /* la signature est faite : la suite ne doit pas la cacher */ }
      setFin(res);
      setEnvoi(false);
      setEtape('fini');
      return;
    }
    setEnvoi(false);
    if (r?.error === 'change') { relire(r); return; }
    if (r?.error === 'document') { refuser(r); return; }
    if (r?.error === 'code' && typeof r.restants === 'number') {
      setErreur(r.restants > 0 ? `Ce code ne correspond pas. Encore ${r.restants} essai${r.restants > 1 ? 's' : ''}.` : ERREURS.trop);
    } else setErreur(ERREURS[r?.error] || 'La signature n’a pas abouti. Réessayez dans un instant.');
  };

  const telecharger = async () => {
    /* La fenêtre s'ouvre tout de suite, au toucher : un navigateur refuse
       d'ouvrir une fenêtre après une attente réseau. */
    const w = window.open('', '_blank');
    const r = await envoyer('mandat', { etape: 'pdf' });
    if (r?.ok && r.url) { if (w) w.location.href = r.url; else window.location.href = r.url; }
    else { w?.close(); setErreur('Le document n’est pas encore prêt : vous le recevez aussi par e-mail.'); }
  };

  const tete = (sur: string) => (
    <div className="mdt-tete" ref={haut}>
      <div className="mdt-tete-g">
        {etape === 'coord' || etape === 'signer' || etape === 'lecture' ? (
          <button type="button" className="mdt-rond" aria-label="Retour"
            onClick={() => setEtape(etape === 'lecture' ? retourLecture : etape === 'signer' ? 'coord' : 'recap')}>
            <Ic n="chevron" t={16} />
          </button>
        ) : null}
        <span className="mdt-sur">{sur}</span>
      </div>
      {/* Pendant la lecture du mandat, pas de croix : on la prenait pour un
          retour, et elle fermait toute la signature. Seule la flèche reste. */}
      {etape !== 'lecture' && <button type="button" className="mdt-rond" aria-label="Fermer" onClick={onFermer}><Ic n="croix" t={14} /></button>}
    </div>
  );
  const barre = pas > 0 && etape !== 'lecture' ? (
    <div className="mdt-pas" aria-label={`Étape ${pas} sur 3`}>
      {[1, 2, 3].map(i => <i key={i} data-on={i <= pas ? '1' : undefined} />)}
    </div>
  ) : null;

  /* ── Son mandat l'attend dans le CRM : pas de second mandat ici ── */
  if (docRefus) {
    return (
      <div className="mdt">
        {tete(raison === 'visite' ? 'Avant la visite' : 'Votre mandat de recherche')}
        <div className="mdt-corps mdt-accueil">
          <div className="mdt-sceau"><Ic n="bouclier" t={30} /></div>
          <h3>{docRefus.signe ? 'Vous avez déjà signé votre mandat' : docRefus.lien ? 'Votre mandat de recherche vous attend' : 'Alexandre prépare votre mandat'}</h3>
          <p className="mdt-p">{docRefus.signe
            ? 'Alexandre vous l’avait préparé, et vous l’avez signé. Il n’y a rien d’autre à signer ici.'
            : docRefus.lien
              ? 'Alexandre vous l’a préparé et envoyé\u00a0: c’est celui-là qu’il faut signer, pas un second. Vous le relisez en entier, puis vous le signez avec un code reçu par e-mail.'
              : 'Il vous l’a préparé lui-même : inutile d’en signer un ici. Il revient vers vous pour la signature.'}</p>
          {docRefus.lien && !docRefus.signe && <a className="btn or mdt-plein" href={docRefus.lien}>Lire et signer mon mandat</a>}
          <button type="button" className={docRefus.lien && !docRefus.signe ? 'btn lien mdt-plein' : 'btn or mdt-plein'} onClick={onFermer}>Revenir à mon espace</button>
        </div>
      </div>
    );
  }

  /* ── 0. L'accueil : aucun chiffre, aucune somme ── */
  if (etape === 'accueil') {
    return (
      <div className="mdt">
        {tete(raison === 'visite' ? 'Avant la visite' : 'Votre mandat de recherche')}
        <div className="mdt-corps mdt-accueil">
          <div className="mdt-sceau"><Ic n="bouclier" t={30} /></div>
          <h3>{raison === 'visite' ? 'Visitez avec un conseiller de votre côté' : 'Confirmez votre recherche avec Alexandre'}</h3>
          <p className="mdt-p">{raison === 'visite'
            ? 'Pour organiser cette visite et vous accompagner jusqu’au bout, Alexandre vous propose de confirmer votre recherche avec lui. C’est votre mandat de recherche.'
            : 'Alexandre vous propose de confirmer votre recherche avec lui. C’est votre mandat de recherche : il l’engage à vos côtés, jusqu’au bout.'}</p>
          <div className="mdt-puces">
            <span><span className="k"><Ic n="check" t={14} /></span><span><b>Une seule signature</b>, valable pour tous les biens qu’il vous présentera&nbsp;: ensuite, plus rien à signer pour visiter.</span></span>
            <span><span className="k"><Ic n="check" t={14} /></span><span>Il travaille pour vous, pas pour le vendeur.</span></span>
            <span><span className="k"><Ic n="check" t={14} /></span><span>Avant toute offre, il vérifie le dossier&nbsp;: copropriété, charges, travaux à venir.</span></span>
            <span><span className="k"><Ic n="check" t={14} /></span><span>Il vous ouvre aussi les biens qui ne sont pas sur les portails.</span></span>
            <span><span className="k"><Ic n="check" t={14} /></span><span>Il reste à vos côtés jusqu’à la signature chez le notaire.</span></span>
          </div>
          <button type="button" className="btn or mdt-plein" onClick={() => setEtape('recap')}>
            {raison === 'visite' ? 'Confirmer ma recherche · 2 min' : 'Commencer · 2 min'}
          </button>
          {aide}
          {erreur && <div className="mdt-erreur">{erreur}</div>}
        </div>
      </div>
    );
  }

  /* ── Le texte complet ── */
  if (etape === 'lecture') {
    return (
      <div className="mdt">
        {tete('Votre mandat, en entier')}
        <div className="mdt-corps">
          <p className="mdt-p petit">{'C’est exactement ce texte que vous signez. Vous recevrez le document signé, en PDF, par e-mail.'}</p>
          <TexteMandat parties={parties} identite={identite} />
          <button type="button" className="btn or mdt-plein" onClick={() => setEtape(retourLecture)}>J’ai lu, je reviens</button>
        </div>
      </div>
    );
  }

  /* ── 1. Le récapitulatif ── */
  if (etape === 'recap') {
    return (
      <div className="mdt">
        {tete('Étape 1 sur 3')}
        {barre}
        <div className="mdt-corps">
          <h3>Votre recherche, en clair</h3>
          {avis && <div className="mdt-maj">{avis}</div>}
          <div className="mdt-lignes">
            {resume.map(r => (
              <div key={r.titre} className="mdt-ligne">
                <div className="t">{r.titre}</div>
                <div className="v">{r.valeur}</div>
                <div className="d">{r.detail}</div>
              </div>
            ))}
            <div className="mdt-ligne">
              <div className="t">Votre conseiller</div>
              <div className="v">{`${identite.signataireNom} · ${identite.nom}`}</div>
              <div className="d">{`carte professionnelle ${identite.carte}`}</div>
            </div>
            <div className="mdt-ligne">
              <div className="t">Le mandat</div>
              <div className="v">{numero ? `Mandat de recherche simple · n° ${numero}` : 'Mandat de recherche simple'}</div>
              <div className="d">{numero ? 'non exclusif : vous restez libre de chercher de votre côté' : 'non exclusif · son numéro s’affiche à l’étape 3'}</div>
            </div>
          </div>
          <button type="button" className="btn fant mdt-plein" onClick={() => { setRetourLecture('recap'); setEtape('lecture'); }}>
            <Ic n="doc" t={16} /><span>Lire le mandat complet</span>
          </button>
          <button type="button" className="btn or mdt-plein" onClick={() => setEtape('coord')}>Continuer</button>
          {aide}
          {erreur && <div className="mdt-erreur">{erreur}</div>}
        </div>
      </div>
    );
  }

  /* ── 2. Ses coordonnées ── */
  if (etape === 'coord') {
    return (
      <div className="mdt">
        {tete('Étape 2 sur 3')}
        {barre}
        <div className="mdt-corps">
          <h3>C’est bien vous&nbsp;?</h3>
          <p className="mdt-p">Ces informations figurent sur le mandat. Complétez ce qui manque, corrigez si besoin.</p>
          <div className={'mdt-civ' + (champs.civilite ? ' err' : '')}>
            {(['Madame', 'Monsieur'] as const).map(c => (
              <button key={c} type="button" data-on={m.civilite === c ? '1' : undefined} onClick={() => maj('civilite')(c)}>{c}</button>
            ))}
          </div>
          {champs.civilite && <div className="mdt-err-l">{champs.civilite}</div>}
          <div className="mdt-deux">
            <Champ lib="Prénom" val={m.prenom} onChange={maj('prenom')} err={champs.prenom} auto="given-name" />
            <Champ lib="Nom" val={m.nom} onChange={maj('nom')} err={champs.nom} auto="family-name" />
          </div>
          <div className="mdt-deux">
            <ChampDate lib="Date de naissance" val={m.naissanceDate} onChange={maj('naissanceDate')} err={champs.naissanceDate} />
            <Champ lib="Lieu de naissance" val={m.naissanceLieu} onChange={maj('naissanceLieu')} err={champs.naissanceLieu} placeholder="Ville (département)" />
          </div>
          <Champ lib="Adresse" val={adr.rue} onChange={majAdr('rue')} err={champs.rue || champs.adresse} auto="address-line1" placeholder="Numéro et rue" />
          <div className="mdt-cpv">
            <Champ lib="Code postal" val={adr.cp} onChange={majAdr('cp')} err={champs.cp} mode="numeric" auto="postal-code" />
            <Champ lib="Ville" val={adr.ville} onChange={majAdr('ville')} err={champs.ville} auto="address-level2" />
          </div>
          <Champ lib="E-mail — votre code arrive ici" val={m.email} onChange={maj('email')} err={champs.email} type="email" mode="email" auto="email" />
          <Champ lib="Téléphone" val={m.telephone} onChange={maj('telephone')} err={champs.telephone} type="tel" mode="tel" auto="tel" />

          <div className="mdt-q2">Vous achetez</div>
          <div className="mdt-seg">
            <button type="button" data-on={achat === 'nom' ? '1' : undefined} onClick={() => { setAchat('nom'); setErreur(''); }}><Ic n="personne" t={17} /><span>En mon nom</span></button>
            <button type="button" data-on={achat === 'societe' ? '1' : undefined} onClick={() => { setAchat('societe'); setEdite(null); setErreur(''); }}><Ic n="societe" t={17} /><span>Via une société</span></button>
          </div>
          {achat === 'societe' ? (
            <FormSociete s={soc} champs={champsSoc} civilite={m.civilite} prenom={m.prenom} nom={m.nom} kbis={kbis} kbisErr={kbisErr}
              onS={x => { setSoc(x); setChampsSoc({}); }} onKbis={f => { void choisirKbis(f); }} />
          ) : (
            <>
              <div className="mdt-q2">Qui signe le mandat&nbsp;?</div>
              <div className="mdt-qui">
                <div className="mdt-qui-l">
                  <span className="mdt-av">{initiales(m)}</span>
                  <span className="mdt-qui-tx"><b>{`${m.prenom} ${m.nom}`.trim() || 'Vous'}</b><span>Vous · vous signez maintenant</span></span>
                </div>
                {cos.map((c, i) => (i === edite ? null : (
                  <div key={i} className="mdt-qui-l">
                    <span className="mdt-av b">{initiales(c)}</span>
                    <span className="mdt-qui-tx"><b>{`${c.prenom} ${c.nom}`.trim()}</b><span>{`${c.email || 'e-mail à compléter'} · signera ensuite`}</span></span>
                    <button type="button" className="mdt-qui-a" onClick={() => ouvrirCo(i)}>Modifier</button>
                  </div>
                )))}
              </div>
              {edite !== null && (
                <FormPersonne key={edite} p={brouillon} meme={memeB} champs={champsCo} nouveau={edite >= cos.length}
                  onP={x => { setBrouillon(x); setChampsCo({}); }} onMeme={setMemeB}
                  onEnregistrer={enregistrerCo} onAnnuler={() => { setEdite(null); setChampsCo({}); }} onRetirer={() => retirerCo(edite)} />
              )}
              {edite === null && cos.length < COSIGNATAIRES_MAX && (
                <button type="button" className="mdt-ajout" onClick={ajouterCo}>
                  <Ic n="plus" t={17} /><span>{cos.length ? 'Ajouter une autre personne' : 'Ajouter mon conjoint ou un co\u2011acquéreur'}</span>
                </button>
              )}
              {edite === null && !cos.length && (
                <div className="mdt-rappel">
                  <Ic n="info" t={19} />
                  <div>
                    <b>{m.civilite === 'Madame' ? 'Vous signez seule' : 'Vous signez seul'}</b>
                    <p>{'Votre signature vous engage personnellement, même si vous achetez à deux ou via une société : votre engagement de ne pas acheter sans Alexandre un bien qu’il vous a présenté vaut aussi pour la personne avec qui vous achetez, et pour votre société.'}</p>
                    <p>{'Vous préférez qu’elle signe aussi ? Ajoutez-la ci-dessus : elle recevra son propre lien.'}</p>
                  </div>
                </div>
              )}
              {edite === null && cos.length > 0 && (
                <div className="mdt-info"><Ic n="groupe" t={16} /><span>{`Vous signez en premier. Le mandat sera complet quand ${prenoms(cos)} ${cos.length > 1 ? 'auront' : 'aura'} signé à ${cos.length > 1 ? 'leur' : 'son'} tour ; vous serez prévenu${m.civilite === 'Madame' ? 'e' : ''} par e-mail.`}</span></div>
              )}
            </>
          )}
          {erreur && <div className="mdt-erreur">{erreur}</div>}
          <button type="button" className={'mdt-coche' + (champs.certifie ? ' err' : '')} data-on={certifie ? '1' : undefined}
            onClick={() => { setCertifie(x => !x); setChamps(c => ({ ...c, certifie: '' })); }}>
            <span className="bx">{certifie && <Ic n="check" t={14} />}</span>
            <span>{achat === 'societe'
              ? `Je certifie que les informations que j’ai renseignées sont exactes et complètes, et que je suis habilité${m.civilite === 'Madame' ? 'e' : ''} à engager ${soc.denomination.trim() || 'la société'}. Ma signature m’engage aussi personnellement.`
              : cos.length
                ? `Je certifie que les informations que j’ai renseignées, pour moi et pour ${prenoms(cos)}, sont exactes et complètes.`
                : 'Je certifie que les informations que j’ai renseignées sont exactes et complètes. Je signe ce mandat moi-même, et ma signature m’engage même si j’achète à plusieurs.'}</span>
          </button>
          {champs.certifie && <div className="mdt-err-l">{champs.certifie}</div>}
          <button type="button" className="btn or mdt-plein" disabled={envoi} onClick={demanderCode}>
            {envoi ? 'Envoi du code…' : codeParti ? 'Recevoir un nouveau code' : 'Recevoir mon code par e-mail'}
          </button>
          {codeParti && (
            <button type="button" className="btn fant mdt-plein" onClick={() => { setErreur(''); setEtape('signer'); }}>J’ai déjà mon code</button>
          )}
        </div>
      </div>
    );
  }

  /* ── 3. La signature ── */
  if (etape === 'signer') {
    const pret = lu && execution !== null && code.length === 6;
    return (
      <div className="mdt">
        {tete('Étape 3 sur 3')}
        {barre}
        <div className="mdt-corps">
          <h3>Signer mon mandat</h3>
          <p className="mdt-p">{numero ? titreMandat(numero) : 'Mandat de recherche'}</p>
          {achat === 'nom' && cos.length > 0 && (
            <div className="mdt-info"><Ic n="groupe" t={16} /><span>{`Vous signez en premier. ${prenoms(cos)} ${cos.length > 1 ? 'recevront ensuite chacun leur' : 'recevra ensuite son'} propre lien pour signer à ${cos.length > 1 ? 'leur' : 'son'} tour.`}</span></div>
          )}
          {achat === 'societe' && soc.denomination.trim() && (
            <div className="mdt-info"><Ic n="societe" t={16} /><span>{`Vous signez pour ${soc.denomination.trim()}, et en votre nom.`}</span></div>
          )}

          <button type="button" className="mdt-coche" data-on={lu ? '1' : undefined} onClick={() => setLu(x => !x)}>
            <span className="bx">{lu && <Ic n="check" t={14} />}</span>
            <span>J’ai lu mon mandat de recherche et je l’accepte.</span>
          </button>
          <button type="button" className="mdt-relire" onClick={() => { setRetourLecture('signer'); setEtape('lecture'); }}>Le relire</button>

          <div className="mdt-q">Quand la recherche commence-t-elle&nbsp;?</div>
          <div className="mdt-choix2">
          <button type="button" className="mdt-choix" data-on={execution === true ? '1' : undefined} onClick={() => setExecution(true)}>
            <span className="rd" />
            <span><b>Tout de suite</b><span className="s">{`Je demande que la recherche commence sans attendre la fin de mon délai de rétractation, pour pouvoir visiter dès maintenant. Je garde mes ${RETRACTATION_JOURS} jours pour changer d’avis.`}</span></span>
          </button>
          <button type="button" className="mdt-choix" data-on={execution === false ? '1' : undefined} onClick={() => setExecution(false)}>
            <span className="rd" />
            <span><b>{`Dans ${RETRACTATION_JOURS} jours`}</b><span className="s">La recherche et les visites commenceront à la fin de mon délai de rétractation.</span></span>
          </button>
          </div>

          <div className="mdt-q">Votre code</div>
          <p className="mdt-p petit">{codeDe
            ? `Votre code à 6 chiffres vous a été envoyé à ${emailMasque} à ${heureParis(codeDe)} : saisissez-le ici. Il est valable 15 minutes ; passé ce délai, demandez-en un nouveau.`
            : `Un code à 6 chiffres vient de vous être envoyé à ${emailMasque}. Pensez à regarder dans les indésirables. Vous pouvez quitter cette page pour aller le chercher : elle vous attend.`}</p>
          <input className="mdt-code" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            placeholder="• • • • • •" aria-label="Code à 6 chiffres"
            onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErreur(''); }} />
          <button type="button" className="mdt-relire" disabled={attente > 0} onClick={renvoyer}>
            {attente > 0 ? `Renvoyer le code (${attente} s)` : 'Renvoyer le code'}
          </button>

          {erreur && <div className="mdt-erreur">{erreur}</div>}
          <button type="button" className="btn or mdt-plein" disabled={!pret || envoi} onClick={() => { setErreur(''); setPad(true); }}>
            <Ic n="plume" t={16} /><span>{envoi ? 'Signature en cours…' : 'Signer mon mandat'}</span>
          </button>
          {pad && (
            <PadSignature nom={`${m.prenom} ${m.nom}`.trim()} envoi={envoi}
              onAnnuler={() => setPad(false)} onValider={png => { void signer(png); }} />
          )}
          <div className="mdt-confiance">
            <span><Ic n="cadenas" t={15} /><span>Code personnel, à usage unique</span></span>
            <span><Ic n="bouclier" t={15} /><span>Document scellé et horodaté</span></span>
            <span><Ic n="retour" t={15} /><span>{`${RETRACTATION_JOURS} jours pour changer d’avis`}</span></span>
          </div>
          <p className="mdt-mention">{achat === 'nom' && cos.length
            ? `En signant, vous acceptez votre mandat de recherche non exclusif : il vous engage dès maintenant, et il sera complet quand ${prenoms(cos)} l’${cos.length > 1 ? 'auront' : 'aura'} signé. Vous en recevez un exemplaire par e-mail, et vous pouvez y renoncer pendant ${RETRACTATION_JOURS} jours après votre signature, prolongés si un autre signataire signe entre-temps.`
            : `En signant, vous acceptez votre mandat de recherche non exclusif. Vous en recevez un exemplaire par e-mail, et vous pouvez y renoncer pendant ${RETRACTATION_JOURS} jours depuis votre espace.`}</p>
        </div>
      </div>
    );
  }

  /* ── 4. C'est signé ── */
  const attendre = fin && !fin.execution;
  const phraseVisite = raison === 'visite'
    ? (attendre
      ? `Votre demande de visite est partie. Comme vous avez choisi d’attendre vos ${RETRACTATION_JOURS} jours, Alexandre vous proposera un créneau à partir du ${dateLongue(fin!.finRetractation)}.`
      : 'Votre demande de visite est partie avec vos disponibilités. Alexandre vous propose un créneau très vite.')
    : 'Alexandre est prévenu. Vous pouvez maintenant demander vos visites en un geste, depuis chaque bien.';

  /* Signé à plusieurs : sa signature est faite, on attend les autres. Pas
     de rond qui tourne : qui a signé, qui on attend, et quoi faire si le
     mail n'arrive pas. */
  if (enAttente.length) {
    const n = enAttente.length;
    return (
      <div className="mdt">
        <div className="mdt-corps mdt-fini">
          <div className="mdt-ok"><Ic n="check" t={34} /></div>
          <div className="mdt-sur-c">Votre signature est enregistrée</div>
          <h3>{`Merci ${m.prenom}, c’est signé de votre côté`}</h3>
          <p className="mdt-p">{`${prenoms(enAttente)} ${n > 1 ? 'viennent' : 'vient'} de recevoir ${n > 1 ? 'leur' : 'son'} lien par e-mail. Dès que ${prenoms(enAttente)} ${n > 1 ? 'auront' : 'aura'} signé, vous recevrez le mandat complet, en PDF.`}</p>
          <div className="mdt-sgn">
            <div className="mdt-sgn-l"><span className="pt ok"><Ic n="check" t={16} /></span><span><b>{`${m.prenom} ${m.nom}`}</b><span className="s">{`Signé aujourd’hui à ${heureParis(fin?.signeLe || new Date())}`}</span></span></div>
            {enAttente.map(c => (
              <div key={c.id} className="mdt-sgn-l"><span className="pt att"><Ic n="horloge" t={16} /></span><span><b>{`${c.prenom} ${c.nom}`}</b><span className="s">{`Lien envoyé à ${c.email} · en attente`}</span></span></div>
            ))}
          </div>
          <p className="mdt-p petit">{`${phraseVisite} Si ${n > 1 ? 'un lien n’arrive pas' : `${enAttente[0].prenom} ne reçoit pas son lien`}, vous pourrez le renvoyer depuis « Ma recherche ».`}</p>
          {erreur && <div className="mdt-erreur">{erreur}</div>}
          <button type="button" className="btn or mdt-plein" onClick={onFermer}>Revenir à mon espace</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mdt">
      <div className="mdt-corps mdt-fini">
        <div className="mdt-ok"><Ic n="check" t={34} /></div>
        <div className="mdt-sur-c">Mandat signé et scellé</div>
        <h3>{`Merci ${m.prenom}, c’est fait`}</h3>
        <p className="mdt-p">{phraseVisite}</p>
        <button type="button" className="btn fant mdt-plein" onClick={telecharger}><Ic n="doc" t={16} /><span>Télécharger mon mandat signé</span></button>
        <div className="mdt-confiance fini">
          <span><Ic n="check" t={15} /><span>Signé par vous et par Emilio Immobilier</span></span>
          <span><Ic n="mail" t={15} /><span>Exemplaire complet envoyé par e-mail</span></span>
          <span><Ic n="etoile" t={15} /><span>Alexandre travaille désormais pour vous&nbsp;: biens hors marché, dossiers vérifiés, négociation</span></span>
        </div>
        <p className="mdt-p petit">Vous le retrouvez à tout moment dans «&nbsp;Ma recherche&nbsp;».</p>
        {erreur && <div className="mdt-erreur">{erreur}</div>}
        <button type="button" className="btn or mdt-plein" onClick={onFermer}>Revenir à mon espace</button>
      </div>
    </div>
  );
}

/* ══ Les documents de la rubrique Documents, vus d'ici (V3.55) ══════════
   Qui signe et où il en est (src/lib/documents-espace.ts). Le client y est
   « vous » ; son conjoint (son adresse est sur la fiche) peut ouvrir SA page
   depuis ici — le code part sur l'adresse de la personne, jamais ailleurs.
   Au niveau du module (AGENTS.md §2.4). */
const nomSignataire = (s: SignataireEspace) => `${s.prenom} ${s.nom}`.trim() || 'Un signataire';
const prenomSignataire = (s: SignataireEspace) => s.prenom || s.nom || 'un signataire';
/* « signé le 6 octobre 2026 », « à signer »… V3.56 : un lien expiré ne
   promet rien (Alexandre est prévenu par ses relances du matin ; un nouveau
   lien n'est pas automatique, et une offre passée ne se signe plus). */
function etatCourt(s: SignataireEspace, offreExpiree = false): string {
  if (s.etat === 'signe') return s.le ? `signé le ${dateLongue(s.le)}` : 'signé';
  if (offreExpiree) return 'pas signé à temps';
  if (s.etat === 'sur_place') return 'à signer avec Alexandre';
  if (s.etat === 'expire') return 'lien expiré, Alexandre est prévenu';
  return 'à signer';
}
const enAttenteDe = (sigs: SignataireEspace[]) => prenoms(sigs.filter(s => s.etat !== 'signe' && s.qui !== 'vous').map(s => ({ prenom: prenomSignataire(s) })));

/* Le texte de « Mon mandat de recherche » pour un mandat de Documents pas
   encore signé par tous. `lien` : le sien, valable. */
function texteMandatDocument(doc: MandatDocEspace | null, lien: string | null): string {
  const envoye = 'Alexandre vous l’a envoyé à signer. Vous le relisez en entier, puis vous le signez avec un code reçu par e-mail.';
  if (lien) return envoye;
  if (!doc) return 'Alexandre vous l’a préparé. Il revient vers vous pour la signature.';
  /* V3.56 : « sur papier » et « prochain rendez-vous » ne se séparent pas
     (un « papier. » seul sur sa ligne en 390 px). */
  const avec = (qui: string) => (doc.mode === 'sur_place' ? `Vous le signerez avec ${qui}, à votre prochain\u00a0rendez-vous.` : `Vous le signerez avec ${qui}, sur\u00a0papier.`);
  if (doc.statut === 'brouillon') {
    return doc.mode === 'en_ligne'
      ? 'Alexandre le prépare pour vous. Vous le recevrez par e-mail, pour le signer en ligne avec un code.'
      : `Alexandre le prépare pour vous. ${avec('lui')}`;
  }
  if (doc.vous === 'signe') {
    const moi = doc.signataires.find(s => s.qui === 'vous');
    const quand = moi?.le ? ` le ${dateLongue(moi.le)}` : '';
    const autres = enAttenteDe(doc.signataires);
    return autres
      ? `Vous l’avez signé${quand}. Il attend encore la signature de ${autres}. Vous pouvez déjà demander des visites.`
      : `Vous l’avez signé${quand}. Alexandre le finalise : vous recevrez l’exemplaire complet par e-mail.`;
  }
  if (doc.vous === 'expire') return 'Le lien pour le signer a expiré. Alexandre en est prévenu : il revient vers vous.';
  if (doc.mode === 'papier') return `Il est prêt. ${avec('Alexandre')}`;
  if (doc.mode === 'sur_place' && doc.vous !== 'a_signer') return `Il est prêt. ${avec('Alexandre')}`;
  /* En ligne, signature pas encore lancée, ou arrêtée : pas de fausse précision. */
  if (!doc.lance) return 'Il est prêt. Alexandre revient vers vous pour la signature.';
  /* Parti, mais aucune ligne à l'une de ses adresses. */
  return 'Alexandre vous l’a envoyé à signer par e-mail.';
}

/* Les signataires, une ligne chacun (comme ceux du mandat signé ici). */
function ListeSignataires({ sigs }: { sigs: SignataireEspace[] }) {
  return (
    <div className="mdt-sgn">
      {sigs.map((s, i) => {
        const e = etatCourt(s);
        return (
          <div key={i} className="mdt-sgn-bloc">
            <div className="mdt-sgn-l">
              <span className={'pt ' + (s.etat === 'signe' ? 'ok' : 'att')}><Ic n={s.etat === 'signe' ? 'check' : 'horloge'} t={16} /></span>
              <span><b>{nomSignataire(s)}</b><span className="s">{s.qui === 'vous' ? `Vous · ${e}` : e.charAt(0).toUpperCase() + e.slice(1)}</span></span>
            </div>
            {s.qui === 'proche' && s.lien && (
              <div className="mdt-sgn-a"><a className="mdt-relire" href={s.lien}><PeutSigner s={s} /></a></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* « Claire peut signer ici, avec le code reçu sur son e-mail » — V3.56 :
   « son e-mail » ne se coupe pas au trait d'union (« son e- / mail » en
   390 px). DM Sans n'a pas le trait d'union insécable : un <span> qui ne
   se coupe pas, et qui reprend tout de son lien (`.mdt-pret-tx span`, la
   règle des phrases de carte, l'aurait mis en gris). */
const SANS_COUPURE: React.CSSProperties = { whiteSpace: 'nowrap', font: 'inherit', color: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit' };
function PeutSigner({ s }: { s: SignataireEspace }) {
  return <>{`${prenomSignataire(s)} peut signer ici, avec le code reçu sur `}<span style={SANS_COUPURE}>son e-mail</span></>;
}

/* La page de signature d'un proche (son conjoint), en lien discret sous la
   carte de l'accueil. */
function LiensProches({ sigs }: { sigs?: SignataireEspace[] }) {
  const l = (sigs || []).filter(s => s.qui === 'proche' && s.lien);
  if (!l.length) return null;
  return <>{l.map((s, i) => <a key={i} className="mdt-pret-a" href={s.lien || undefined}><PeutSigner s={s} /></a>)}</>;
}

/* L'exemplaire signé d'un de ses documents : un lien de deux minutes. La
   fenêtre s'ouvre tout de suite, au toucher (un navigateur refuse d'ouvrir
   une fenêtre après une attente réseau). */
async function ouvrirDocument(envoyer: Envoyer, id: string, voir = false): Promise<boolean> {
  const w = window.open('', '_blank');
  const r = await envoyer('document', voir ? { id, voir: true } : { id });
  if (r?.ok && r.url) { (w || window).location.assign(String(r.url)); return true; }
  w?.close();
  return false;
}

/* ══ « Mon mandat », dans « Ma recherche » ══════════════════════════════ */

export function CarteMonMandat({ mandat, envoyer, onSigner, onRenoncer }: {
  mandat: MandatEspace; envoyer: Envoyer; onSigner: () => void; onRenoncer: () => void;
}) {
  const [erreur, setErreur] = useState('');
  const doc = mandat.document || null;
  const tete = <div className="mdt-carte-t"><span className="ic"><Ic n="bouclier" t={17} /></span><span>Mon mandat de recherche</span></div>;

  /* Préparé par Alexandre dans le CRM (V3.32), pas encore signé par tous :
     chaque état dit ce qui est vrai (V3.55) — à signer avec SON lien, à
     signer avec Alexandre (papier, sur place), lien expiré, signé par lui et
     en attente d'un autre… Jamais « vous le recevrez très vite par e-mail »
     pour un mandat qui se signe sur papier. */
  if (mandat.etat !== 'valide' && ((doc && doc.statut !== 'signe' && doc.statut !== 'retracte') || mandat.enRoute)) {
    const lien = doc?.vous === 'signe' ? null : mandat.enRoute?.lien || doc?.lien || null;
    const sigs = doc?.signataires || [];
    return (
      <section className="mdt-carte">
        {tete}
        <p className="mdt-carte-p">{texteMandatDocument(doc, lien)}</p>
        {(sigs.length > 1 || doc?.vous === 'signe') && <ListeSignataires sigs={sigs} />}
        {lien && <a className="btn or" href={lien}><Ic n="plume" t={16} /><span>Signer mon mandat</span></a>}
      </section>
    );
  }

  /* Signé dans la rubrique Documents — à la main, en ligne ou sur place —,
     et c'est lui le mandat en cours. L'exemplaire signé se télécharge dès
     qu'il existe : scellé, ou le scan déposé par Alexandre. */
  if (mandat.etat === 'valide' && doc?.statut === 'signe') {
    const ouvrir = async () => {
      setErreur('');
      if (!(await ouvrirDocument(envoyer, doc.id))) setErreur('Le document n’a pas pu être ouvert. Réessayez dans un instant.');
    };
    /* V3.56 : signé en ligne par lui, la même renonciation que le mandat
       signé ici. La page ne l'envoie que pendant son délai de rétractation ;
       une page restée ouverte au-delà, le serveur répond « délai passé ». */
    const finR = doc.renoncer?.fin || null;
    return (
      <section className="mdt-carte">
        {tete}
        <p className="mdt-carte-p">{doc.numero
          ? <><b>{`N° ${doc.numero}`}</b>{doc.le ? ` · signé le ${dateLongue(doc.le)}` : ' · signé'}</>
          : doc.le ? `Signé le ${dateLongue(doc.le)}` : 'Votre mandat de recherche est signé.'}</p>
        {mandat.expiration && <p className="mdt-carte-s">{`Valable jusqu’au ${dateLongue(mandat.expiration + 'T12:00:00Z')} au plus tard.`}</p>}
        {doc.fichier && (
          <button type="button" className="btn fant" onClick={() => { void ouvrir(); }}>
            <Ic n="doc" t={16} /><span>{doc.fichier === 'image' ? 'Télécharger mon mandat signé' : 'Télécharger mon mandat (PDF)'}</span>
          </button>
        )}
        {erreur && <div className="mdt-erreur">{erreur}</div>}
        {/* Comme pour le mandat signé ici : un simple lien en bas de la carte. */}
        {finR && (
          <button type="button" className="mdt-renoncer" onClick={onRenoncer}>{`Renoncer au mandat (possible jusqu’au ${dateLongue(finR)})`}</button>
        )}
      </section>
    );
  }

  /* V3.56 : il a renoncé en ligne à son mandat de la rubrique Documents. On
     le lui dit, simplement, et son exemplaire signé reste à portée de main. */
  if (mandat.etat !== 'valide' && doc?.statut === 'retracte') {
    const ouvrir = async () => {
      setErreur('');
      if (!(await ouvrirDocument(envoyer, doc.id))) setErreur('Le document n’a pas pu être ouvert. Réessayez dans un instant.');
    };
    const quoi = `votre mandat de recherche${doc.numero ? ` n° ${doc.numero}` : ''}`;
    return (
      <section className="mdt-carte">
        {tete}
        <p className="mdt-carte-p">{doc.retracteLe
          ? `Vous avez renoncé à ${quoi} le ${dateLongue(doc.retracteLe)}. Il a pris fin, sans aucun frais.`
          : `Vous avez renoncé à ${quoi}. Il a pris fin, sans aucun frais.`}</p>
        {doc.fichier && (
          <button type="button" className="btn fant" onClick={() => { void ouvrir(); }}>
            <Ic n="doc" t={16} /><span>{doc.fichier === 'image' ? 'Télécharger le mandat signé' : 'Télécharger le mandat (PDF)'}</span>
          </button>
        )}
        {erreur && <div className="mdt-erreur">{erreur}</div>}
      </section>
    );
  }

  if (mandat.etat === 'sans_numero') return null;
  const telecharger = async () => {
    const w = window.open('', '_blank');
    const r = await envoyer('mandat', { etape: 'pdf' });
    if (r?.ok && r.url) { if (w) w.location.href = r.url; else window.location.href = r.url; }
    else { w?.close(); setErreur('Le document est momentanément indisponible : vous l’avez aussi reçu par e-mail.'); }
  };

  if (mandat.etat === 'valide') {
    const s = mandat.signe;
    const peutRenoncer = s && Date.now() < Date.parse(s.fin);
    const cos = mandat.cos || [];
    const attendus = cos.filter(c => c.statut === 'invite').length;
    return (
      <section className="mdt-carte">
        <div className="mdt-carte-t"><span className="ic"><Ic n="bouclier" t={17} /></span><span>Mon mandat de recherche</span></div>
        {s ? (
          <>
            <p className="mdt-carte-p"><b>{`N° ${s.numero}`}</b>{attendus
              ? ` · ${cos.length + 1 - attendus} signature${cos.length - attendus > 0 ? 's' : ''} sur ${cos.length + 1}`
              : ` · signé le ${dateLongue(s.le)}`}</p>
            {cos.length > 0 && <SuiviCos moi={mandat.mandant} le={s.le} cos={cos} envoyer={envoyer} />}
            {mandat.expiration && <p className="mdt-carte-s">{`Valable jusqu’au ${dateLongue(mandat.expiration + 'T12:00:00Z')} au plus tard.`}</p>}
            <button type="button" className="btn fant" onClick={telecharger}><Ic n="doc" t={16} /><span>Télécharger mon mandat (PDF)</span></button>
            {erreur && <div className="mdt-erreur">{erreur}</div>}
            {/* La renonciation en ligne : obligatoire, et donc bien là, mais
                sans bouton ni couleur — un simple lien en bas de la carte. */}
            {peutRenoncer && (
              <button type="button" className="mdt-renoncer" onClick={onRenoncer}>{`Renoncer au mandat (possible jusqu’au ${dateLongue(s.fin)})`}</button>
            )}
          </>
        ) : (
          <p className="mdt-carte-p">{mandat.expiration ? `Votre mandat de recherche est actif jusqu’au ${dateLongue(mandat.expiration + 'T12:00:00Z')}.` : 'Votre mandat de recherche est actif.'}</p>
        )}
      </section>
    );
  }

  return (
    <section className="mdt-carte">
      <div className="mdt-carte-t"><span className="ic"><Ic n="bouclier" t={17} /></span><span>Mon mandat de recherche</span></div>
      <p className="mdt-carte-p">Il vous sera proposé à votre première demande de visite. Vous pouvez aussi le signer dès maintenant&nbsp;: deux minutes, avec un code reçu par e-mail.</p>
      <button type="button" className="btn fant" onClick={onSigner}><Ic n="plume" t={16} /><span>Signer mon mandat</span></button>
    </section>
  );
}

/* ── Qui a signé, qui on attend ──
   Dans « Mon mandat » : une ligne par signataire. Pour celui qu'on attend,
   « Renvoyer le lien » et « Corriger son e-mail » (un lien neuf part, l'ancien
   ne marche plus). Au niveau du module (AGENTS.md §2.4). */
const etatCo = (c: CoEspace): string => {
  if (c.statut === 'signe') return c.signe ? `Signé le ${dateLongue(c.signe)} à ${heureParis(c.signe)}` : 'Signé';
  if (c.statut === 'decline') return 'A indiqué ne pas être concerné par cet achat';
  if (c.statut === 'annule') return 'N’a pas signé : le mandat continue sans cette signature';
  if (c.statut === 'retracte') return 'A renoncé au mandat';
  if (c.expire && Date.parse(c.expire) < Date.now()) return `Son lien a expiré : renvoyez-le (${c.email})`;
  return `${c.invite ? `Lien envoyé le ${dateLongue(c.invite)}` : 'Lien envoyé'} à ${c.email} · pas encore signé`;
};
function SuiviCos({ moi, le, cos, envoyer }: { moi: Mandant; le: string; cos: CoEspace[]; envoyer: Envoyer }) {
  const [liste, setListe] = useState(cos);
  const [corrige, setCorrige] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [envoi, setEnvoi] = useState('');
  const [msg, setMsg] = useState<{ id: string; t: string; ok: boolean } | null>(null);
  useEffect(() => { setListe(cos); }, [cos]);
  const relancer = async (c: CoEspace) => {
    setEnvoi(c.id); setMsg(null);
    const r = await envoyer('mandat', { etape: 'relancer', coId: c.id });
    setEnvoi('');
    if (r?.ok) {
      setListe(l => l.map(x => (x.id === c.id ? { ...x, expire: r.expire || x.expire } : x)));
      setMsg({ id: c.id, ok: true, t: `C’est reparti : ${c.prenom} reçoit à nouveau son lien.` });
    } else setMsg({ id: c.id, ok: false, t: r?.error === 'attendre' ? 'Le lien vient de partir : attendez un quart d’heure avant de le renvoyer.' : ERREURS[r?.error] || 'Le lien n’a pas pu être renvoyé. Réessayez dans un instant.' });
  };
  const corriger = async (c: CoEspace) => {
    setEnvoi(c.id); setMsg(null);
    const r = await envoyer('mandat', { etape: 'corriger', coId: c.id, email });
    setEnvoi('');
    if (r?.ok) {
      const e = email.trim().toLowerCase();
      setListe(l => l.map(x => (x.id === c.id ? { ...x, email: e, invite: new Date().toISOString(), expire: r.expire || x.expire } : x)));
      setCorrige(null);
      setMsg({ id: c.id, ok: true, t: `Un nouveau lien est parti à ${e}. L’ancien ne fonctionne plus.` });
    } else setMsg({ id: c.id, ok: false, t: ERREURS[r?.error] || 'L’adresse n’a pas pu être corrigée. Réessayez dans un instant.' });
  };
  return (
    <div className="mdt-sgn">
      <div className="mdt-sgn-l"><span className="pt ok"><Ic n="check" t={16} /></span><span><b>{`${moi.prenom} ${moi.nom}`}</b><span className="s">{`Vous · signé le ${dateLongue(le)} à ${heureParis(le)}`}</span></span></div>
      {liste.map(c => (
        <div key={c.id} className="mdt-sgn-bloc">
          <div className="mdt-sgn-l">
            <span className={'pt ' + (c.statut === 'signe' ? 'ok' : c.statut === 'invite' ? 'att' : 'non')}><Ic n={c.statut === 'signe' ? 'check' : c.statut === 'invite' ? 'horloge' : 'croix'} t={16} /></span>
            <span><b>{`${c.prenom} ${c.nom}`}</b><span className="s">{etatCo(c)}</span></span>
          </div>
          {c.statut === 'invite' && (corrige === c.id ? (
            <div className="mdt-sgn-f">
              <Champ lib={`Nouvelle adresse e-mail de ${c.prenom}`} val={email} onChange={setEmail} type="email" mode="email" auto="off" />
              <div className="mdt-sgn-a">
                <button type="button" className="btn or" disabled={envoi === c.id} onClick={() => { void corriger(c); }}>{envoi === c.id ? 'Envoi…' : 'Envoyer le lien à cette adresse'}</button>
                <button type="button" className="mdt-relire" onClick={() => setCorrige(null)}>Annuler</button>
              </div>
            </div>
          ) : (
            <div className="mdt-sgn-a">
              <button type="button" className="btn fant" disabled={envoi === c.id} onClick={() => { void relancer(c); }}>
                <Ic n="mail" t={16} /><span>{envoi === c.id ? 'Envoi…' : `Renvoyer le lien à ${c.prenom}`}</span>
              </button>
              <button type="button" className="mdt-relire" onClick={() => { setCorrige(c.id); setEmail(c.email); setMsg(null); }}>Corriger son e-mail</button>
            </div>
          ))}
          {msg?.id === c.id && <div className={msg.ok ? 'mdt-ok-l' : 'mdt-err-l'}>{msg.t}</div>}
        </div>
      ))}
      {liste.some(c => c.statut === 'invite') && (
        <p className="mdt-carte-s">{'Un rappel part tout seul 2 jours puis 7 jours après l’envoi du lien.'}</p>
      )}
    </div>
  );
}

/* ══ L'accueil, pendant qu'on attend une signature ══════════════════════ */

export function CarteAttente({ mandat, onVoir }: { mandat: MandatEspace; onVoir: () => void }) {
  const att = (mandat.cos || []).filter(c => c.statut === 'invite');
  if (!att.length || !mandat.signe) return null;
  return (
    <section className="mdt-pret">
      <div className="mdt-pret-ic"><Ic n="horloge" t={20} /></div>
      <div className="mdt-pret-tx">
        <b>{`Votre mandat attend la signature de ${prenoms(att)}`}</b>
        <span>{`Vous l’avez signé le ${dateLongue(mandat.signe.le)}. Il sera complet dès que ${prenoms(att)} ${att.length > 1 ? 'auront' : 'aura'} signé.`}</span>
      </div>
      <button type="button" className="btn fant" onClick={onVoir}>Voir</button>
    </section>
  );
}

/* ══ Ses documents : ceux qui l'attendent, ceux qui sont signés ═══════════
   Un mandat, un avenant, une offre d'achat… de la rubrique Documents du CRM
   (V3.55 : src/lib/documents-espace.ts).
     · à signer : SON lien personnel (le même que dans son e-mail) ;
     · signé par lui, en attente d'un autre : qui a signé, qui on attend ;
     · son lien a expiré : Alexandre est prévenu (relances du matin) et
       revient vers lui — V3.56 : sans promettre de nouveau lien ; une offre
       d'achat passée sa date de validité ne se signe plus, on le dit ;
     · signés : l'exemplaire signé, à télécharger — scellé, ou le scan
       qu'Alexandre a déposé pour un document signé à la main. Le mandat
       signé ici, dans l'espace, les rejoint une fois complet : tous ses
       documents signés au même endroit. */
/* ── Un bon de visite signé (V3.55) ──
   La visite (date, heure), le logement visité, et deux petits boutons :
   « Voir » l'ouvre dans le navigateur, « Télécharger » l'enregistre. Au
   niveau du module (AGENTS.md §2.4). */
const quandVisite = (x: DocEspace) => {
  const t = x.visite?.date ? Date.parse(`${x.visite.date}T12:00:00Z`) : x.le ? Date.parse(x.le) : NaN;
  return Number.isFinite(t) ? t : 0;
};
const jourVisite = (x: DocEspace) => (x.visite?.date ? dateLongue(`${x.visite.date}T12:00:00Z`) : x.le ? dateLongue(x.le) : '');
function dernierBon(bons: DocEspace[]): string {
  const j = jourVisite(bons[0]);
  return `${bons.length} visites${j ? ` · la dernière le ${j}` : ''}`;
}
function LigneBon({ x, seul, onVoir, onTelecharger }: { x: DocEspace; seul?: boolean; onVoir: () => void; onTelecharger: () => void }) {
  const v = x.visite;
  const jour = jourVisite(x);
  const heure = v?.heure && /^\d{1,2}:\d{2}/.test(v.heure) ? ` à ${v.heure.slice(0, 5).replace(':', '\u00a0h\u00a0').replace(/\u00a0h\u00a000$/, '\u00a0h')}` : '';
  const lieu = [v?.adresse, v?.ville].filter(Boolean).join(', ');
  const bien = v?.bien ? v.bien.charAt(0).toUpperCase() + v.bien.slice(1) : '';
  return (
    <div className={`mdt-bon${seul ? ' seul' : ''}`}>
      {seul && <span className="ic"><Ic n="cle" t={17} /></span>}
      <div className="tx">
        <b>{seul ? `Bon de visite${jour ? ` du ${jour}` : ''}` : jour ? `${jour}${heure}` : 'Visite'}</b>
        {lieu && <span>{lieu}</span>}
        {bien && <small>{bien}</small>}
      </div>
      <div className="mdt-bon-act">
        <button type="button" onClick={onVoir}><Ic n="oeil" t={15} /><em>Voir</em></button>
        <button type="button" onClick={onTelecharger}><Ic n="telecharger" t={15} /><em>Télécharger</em></button>
      </div>
    </div>
  );
}

export function CarteDocuments({ documents, mandat, envoyer, onVoirMandat }: {
  documents: DocEspace[]; mandat?: MandatEspace; envoyer: Envoyer;
  /** « Voir » : « Mon mandat de recherche », dans « Ma recherche ». */
  onVoirMandat?: () => void;
}) {
  const [erreur, setErreur] = useState('');
  const [bonsOuverts, setBonsOuverts] = useState(false);
  const aSigner = documents.filter(x => x.etat === 'a_signer');
  const attente = documents.filter(x => x.etat === 'attente');
  const expires = documents.filter(x => x.etat === 'expire');
  /* Le mandat signé dans l'espace, une fois que tout le monde l'a signé — et
     tant que c'est lui le mandat en cours (pas un mandat de Documents signé
     depuis). */
  const s = mandat?.etat === 'valide' && mandat.document?.statut !== 'signe' ? mandat.signe : null;
  const ici: DocEspace[] = s && !(mandat?.cos || []).some(c => c.statut === 'invite')
    ? [{ id: 'mandat-espace', titre: `Mandat de recherche n° ${s.numero}`, etat: 'signe', le: s.le, fichier: 'pdf', mandat: true, espace: true }]
    : [];
  const quand = (x: DocEspace) => { const t = x.le ? Date.parse(x.le) : NaN; return Number.isFinite(t) ? t : 0; };
  /* V3.56 : « n° 1024 » ne se coupe pas (« n° » seul en bout de ligne en 390 px). */
  const titre = (x: DocEspace) => x.titre.replace(/n° /g, 'n°\u00a0');
  const tous = [...ici, ...documents.filter(x => x.etat === 'signe')].sort((a, b) => quand(b) - quand(a));
  /* V3.55 : les bons de visite à part, du plus récent au plus ancien (la
     date de la visite d'abord) ; à partir de deux, ils se rangent dans
     « Mes bons de visite », qui se déplie. */
  const bons = tous.filter(x => x.visite).sort((a, b) => quandVisite(b) - quandVisite(a));
  const signes = tous.filter(x => !x.visite);
  if (!aSigner.length && !attente.length && !expires.length && !tous.length) return null;

  const telecharger = async (x: DocEspace) => {
    setErreur('');
    if (x.espace) {
      const w = window.open('', '_blank');
      const r = await envoyer('mandat', { etape: 'pdf' });
      if (r?.ok && r.url) { (w || window).location.assign(String(r.url)); return; }
      w?.close();
    } else if (await ouvrirDocument(envoyer, x.id)) return;
    setErreur('Le document n’a pas pu être ouvert. Réessayez dans un instant.');
  };
  const bon = async (x: DocEspace, voir: boolean) => {
    setErreur('');
    if (!(await ouvrirDocument(envoyer, x.id, voir))) setErreur('Le bon de visite n’a pas pu être ouvert. Réessayez dans un instant.');
  };
  return (
    <>
      {aSigner.map(x => (
        <section key={x.id} className="mdt-pret">
          <div className="mdt-pret-ic"><Ic n="plume" t={20} /></div>
          <div className="mdt-pret-tx">
            <b>{`Un document vous attend : ${titre(x)}`}</b>
            <span>{'Alexandre vous l’a envoyé à signer : vous le relisez en entier, puis vous le signez avec un code reçu par e-mail.'}</span>
            <LiensProches sigs={x.signataires} />
          </div>
          <a className="btn or" href={x.lien}>Le signer</a>
        </section>
      ))}
      {attente.map(x => (
        <section key={x.id} className="mdt-pret mdt-pret-att">
          <div className="mdt-pret-ic"><Ic n="horloge" t={20} /></div>
          <div className="mdt-pret-tx">
            <b>{x.mandat ? `Votre mandat de recherche attend la signature de ${enAttenteDe(x.signataires || [])}` : `${titre(x)} attend la signature de ${enAttenteDe(x.signataires || [])}`}</b>
            <span>{x.le ? `Vous l’avez signé le ${dateLongue(x.le)}.` : 'Vous l’avez signé.'}</span>
            <div className="mdt-pret-qui">
              {(x.signataires || []).map((g, i) => (
                <div key={i}><i aria-hidden="true" className={g.etat === 'signe' ? 'ok' : undefined} /><em>{`${nomSignataire(g)}${g.qui === 'vous' ? ' (vous)' : ''} · ${etatCourt(g)}`}</em></div>
              ))}
            </div>
            <LiensProches sigs={x.signataires} />
          </div>
          {x.mandat && onVoirMandat && <button type="button" className="btn fant" onClick={onVoirMandat}>Voir</button>}
        </section>
      ))}
      {expires.map(x => (
        <section key={x.id} className="mdt-pret">
          <div className="mdt-pret-ic"><Ic n="horloge" t={20} /></div>
          <div className="mdt-pret-tx">
            <b>{x.offreExpiree ? `Cette offre n’est plus valable\u00a0: ${titre(x)}` : x.mandat ? 'Le lien pour signer votre mandat a expiré' : `Le lien pour signer a expiré\u00a0: ${titre(x)}`}</b>
            <span>{x.offreExpiree
              ? 'Sa date de validité est passée\u00a0: elle ne peut plus être signée. Alexandre revient vers vous.'
              : 'Alexandre en est prévenu\u00a0: il revient vers vous.'}</span>
            {x.offreExpiree && (x.signataires || []).length > 1 && (
              <div className="mdt-pret-qui">
                {(x.signataires || []).map((g, i) => (
                  <div key={i}><i aria-hidden="true" className={g.etat === 'signe' ? 'ok' : undefined} /><em>{`${nomSignataire(g)}${g.qui === 'vous' ? ' (vous)' : ''} · ${etatCourt(g, true)}`}</em></div>
                ))}
              </div>
            )}
          </div>
        </section>
      ))}
      {tous.length > 0 && (
        <section className="mdt-docs">
          <b className="t">Vos documents signés</b>
          {signes.map(x => (
            <button key={x.id} type="button" className="mdt-doc" onClick={() => { void telecharger(x); }}>
              <span className="ic"><Ic n="doc" t={17} /></span>
              <span className="tx"><b>{titre(x)}</b>{x.le && <span>{`Signé le ${dateLongue(x.le)}`}</span>}</span>
              <span className="go">{x.fichier === 'image' ? 'Ouvrir' : 'PDF'}</span>
            </button>
          ))}
          {bons.length === 1 && <LigneBon x={bons[0]} seul onVoir={() => { void bon(bons[0], true); }} onTelecharger={() => { void bon(bons[0], false); }} />}
          {bons.length > 1 && (
            <div className={`mdt-bons${bonsOuverts ? ' ouvert' : ''}`}>
              <button type="button" className="mdt-bons-tete" aria-expanded={bonsOuverts} onClick={() => setBonsOuverts(o => !o)}>
                <span className="ic"><Ic n="cle" t={17} /></span>
                <span className="tx">
                  <b>Mes bons de visite<i>{bons.length}</i></b>
                  <span>{dernierBon(bons)}</span>
                </span>
                <span className="chev"><Ic n="deplier" t={18} /></span>
              </button>
              {bonsOuverts && (
                <div className="mdt-bons-liste">
                  {bons.map(x => <LigneBon key={x.id} x={x} onVoir={() => { void bon(x, true); }} onTelecharger={() => { void bon(x, false); }} />)}
                </div>
              )}
            </div>
          )}
          {erreur && <div className="mdt-erreur">{erreur}</div>}
        </section>
      )}
    </>
  );
}

/* ══ La carte de l'accueil, quand Alexandre l'a préparé ═════════════════ */

export function CartePret({ onSigner }: { onSigner: () => void }) {
  return (
    <section className="mdt-pret">
      <div className="mdt-pret-ic"><Ic n="plume" t={20} /></div>
      <div className="mdt-pret-tx">
        <b>Votre mandat de recherche est prêt</b>
        <span>Alexandre l’a préparé pour vous. Deux minutes suffisent pour le signer.</span>
      </div>
      <button type="button" className="btn or" onClick={onSigner}>Le signer</button>
    </section>
  );
}

/* ══ Avant la visite : le mandat qu'Alexandre lui a envoyé (V3.32) ═══════
   Il veut visiter, et son mandat de recherche l'attend (préparé dans le
   CRM, envoyé par e-mail). Pas de second mandat : on l'emmène signer
   celui-là. Sa demande de visite est gardée et part à son retour. */
export function AvantVisiteDocument({ lien, onFermer }: { lien: string; onFermer: () => void }) {
  return (
    <div className="mdt">
      <div className="mdt-tete">
        <div className="mdt-tete-g"><span className="mdt-sur">Avant la visite</span></div>
        <button type="button" className="mdt-rond" aria-label="Fermer" onClick={onFermer}><Ic n="croix" t={14} /></button>
      </div>
      <div className="mdt-corps mdt-accueil">
        <div className="mdt-sceau"><Ic n="bouclier" t={30} /></div>
        <h3>Votre mandat de recherche vous attend</h3>
        <p className="mdt-p">{'Pour organiser cette visite, Alexandre vous a envoyé votre mandat de recherche. Il se relit en entier et se signe en deux minutes, avec un code reçu par e-mail.'}</p>
        <div className="mdt-puces">
          <span><span className="k"><Ic n="check" t={14} /></span><span><b>Une seule signature</b>, valable pour tous les biens qu’il vous présentera.</span></span>
          <span><span className="k"><Ic n="check" t={14} /></span><span>Votre demande de visite est gardée&nbsp;: elle part dès votre retour dans votre espace, une fois signé.</span></span>
        </div>
        <a className="btn or mdt-plein" href={lien}>Lire et signer mon mandat</a>
        <button type="button" className="btn lien mdt-plein" onClick={onFermer}>Plus tard</button>
      </div>
    </div>
  );
}

/* ══ La renonciation, avec sa confirmation ══════════════════════════════ */

/* V3.56 : le mandat de la rubrique Documents auquel il peut renoncer d'ici,
   quand c'est lui que « Mon mandat de recherche » montre (il passe avant
   celui signé dans l'espace, comme dans la carte). Sinon null : c'est le
   mandat signé ici. */
export function mandatARenoncer(m: MandatEspace): MandatDocEspace | null {
  const d = m.document;
  return m.etat === 'valide' && d?.statut === 'signe' && d.renoncer ? d : null;
}

export function Renonciation({ mandat, envoyer, onFermer, onFait }: {
  mandat: MandatEspace; envoyer: Envoyer; onFermer: () => void;
  /* V3.57 : `accuse` — son accusé de réception est parti par e-mail ;
     `deja` — c'était déjà fait (un second clic, une page restée ouverte). */
  onFait: (r: { accuse: boolean; deja: boolean }) => void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const doc = mandatARenoncer(mandat);
  /* Le numéro et la fin du délai : du mandat de Documents, ou de celui signé ici. */
  const cible = doc
    ? { numero: doc.numero, fin: doc.renoncer?.fin || null }
    : mandat.signe ? { numero: mandat.signe.numero, fin: mandat.signe.fin } : null;
  const confirmer = async () => {
    setEnvoi(true); setErreur('');
    const r = await envoyer('mandat', { etape: 'renoncer', confirme: true, ...(doc ? { document: doc.id } : {}) });
    setEnvoi(false);
    if (r?.ok) onFait({ accuse: r.accuse !== false && r.deja !== true, deja: r.deja === true });
    else setErreur(r?.error === 'delai' ? 'Le délai de rétractation est passé : parlez-en à Alexandre.'
      : r?.error === 'aucun' && doc ? ERREURS.aucun
        : 'La renonciation n’a pas pu être enregistrée. Réessayez dans un instant.');
  };
  return (
    <>
      <div className="tete-f">
        <div><div className="sur">Mon mandat</div><h3>Renoncer au mandat</h3></div>
        <button className="fermer" onClick={onFermer} aria-label="Fermer"><Ic n="croix" t={14} /></button>
      </div>
      <div className="corps-f">
        <p className="mdt-p" style={{ textAlign: 'left' }}>{cible?.fin
          ? `Vous pouvez renoncer à votre mandat de recherche${cible.numero ? ` n° ${cible.numero}` : ''} jusqu’au ${dateLongue(cible.fin)}. Il prend fin tout de suite, sans aucun frais, et vous recevez un accusé de réception par e-mail.`
          : 'Votre mandat prend fin tout de suite, sans aucun frais.'}</p>
        {erreur && <div className="mdt-erreur">{erreur}</div>}
        <button type="button" className="btn mdt-plein mdt-brique" disabled={envoi} onClick={confirmer}>
          {envoi ? 'Enregistrement…' : 'Confirmer ma renonciation'}
        </button>
        <button type="button" className="btn lien mdt-plein" onClick={onFermer}>Garder mon mandat</button>
      </div>
    </>
  );
}

/* ══ Les styles ═════════════════════════════════════════════════════════
   Posés sur les variables de l'espace (--encre, --or, --trait…). */
export const CSS_MANDAT = `
.mdt{min-height:100%; display:flex; flex-direction:column}
.mdt-tete{display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 18px 6px;
  position:sticky; top:0; background:var(--carte); z-index:2}
.mdt-tete-g{display:flex; align-items:center; gap:10px; min-width:0}
.mdt-sur{font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--or-fonce); font-weight:800}
.mdt-rond{width:34px; height:34px; border-radius:50%; background:var(--fond); border:1px solid var(--trait);
  color:var(--plume); display:flex; align-items:center; justify-content:center; flex:0 0 auto}
.mdt-pas{display:grid; grid-template-columns:repeat(3,1fr); gap:6px; padding:4px 20px 0}
.mdt-pas i{height:4px; border-radius:99px; background:var(--trait); transition:background .3s}
.mdt-pas i[data-on]{background:var(--or)}
.mdt-corps{padding:14px 20px 8px; display:flex; flex-direction:column; gap:12px}
.mdt-corps h3{margin:6px 0 0; font-size:23px; font-weight:800; line-height:1.2; color:var(--encre)}
.mdt-p{margin:0; color:var(--plume); font-size:14.5px; line-height:1.65}
.mdt-p.petit{font-size:13px; line-height:1.55}
.mdt-plein{width:100%}
.mdt-plein svg{flex:0 0 auto}
.btn:disabled{opacity:.45; cursor:default; box-shadow:none}

.mdt-accueil{text-align:center; align-items:center; padding-top:4px; flex:1; justify-content:center; padding-bottom:28px}
.mdt-accueil .mdt-p{max-width:420px}
.mdt-sceau{width:68px; height:68px; border-radius:50%; margin:8px auto 2px; display:flex; align-items:center;
  justify-content:center; color:var(--or-fonce); background:var(--or-fond); border:1px solid var(--or-trait)}
.mdt-puces{display:flex; flex-direction:column; gap:10px; text-align:left; width:100%; max-width:440px;
  margin-top:6px; padding:16px; border-radius:18px; background:var(--fond); border:1px solid var(--trait)}
.mdt-puces > span{display:flex; gap:10px; align-items:flex-start; font-size:14px; line-height:1.5; color:var(--encre)}
.mdt-puces .k{flex:0 0 auto; width:22px; height:22px; border-radius:50%; display:flex; align-items:center;
  justify-content:center; background:var(--or); color:#fff; margin-top:1px}
.mdt-rassure{font-size:12.5px; color:var(--plume); font-weight:600}
.mdt-accueil .btn.or{max-width:440px}
.mdt-lien{display:inline-flex; align-items:center; gap:7px; color:var(--plume); font-size:13.5px; font-weight:700;
  text-decoration:none; padding:6px 8px; background:none; border:none; font-family:inherit; cursor:pointer}
.mdt-lien:disabled{opacity:.6}
.mdt-lien.fin{font-size:12.5px; font-weight:600; color:var(--plume-clair); padding-top:0}
.mdt-aide{display:flex; flex-direction:column; align-items:center; gap:0; text-align:center; align-self:center}
.mdt-aide .ok{display:inline-flex; align-items:center; gap:7px; color:var(--vert); font-size:13.5px; font-weight:700; padding:6px 8px}
.mdt-maj{padding:11px 13px; border-radius:12px; background:var(--or-fond); border:1px solid var(--or-trait);
  color:var(--encre); font-size:13.5px; line-height:1.5; font-weight:600}

.mdt-lignes{display:flex; flex-direction:column; border:1px solid var(--trait); border-radius:18px; overflow:hidden}
.mdt-ligne{padding:13px 16px; border-top:1px solid var(--trait); background:var(--carte)}
.mdt-ligne:first-child{border-top:none}
.mdt-ligne .t{font-size:10.5px; letter-spacing:1.3px; text-transform:uppercase; font-weight:800; color:var(--or-fonce)}
.mdt-ligne .v{margin-top:4px; font-size:15px; font-weight:800; color:var(--encre); line-height:1.35}
.mdt-ligne .d{margin-top:2px; font-size:12.5px; color:var(--plume)}

.mdt-civ{display:grid; grid-template-columns:1fr 1fr; gap:8px}
.mdt-civ button{padding:12px; border-radius:14px; border:1.5px solid var(--trait); background:var(--carte);
  font-weight:700; color:var(--plume)}
.mdt-civ button[data-on]{border-color:var(--or); background:var(--or-fond); color:var(--encre)}
.mdt-civ.err button{border-color:var(--brique-trait)}
.mdt-deux{display:grid; grid-template-columns:1fr 1fr; gap:10px}
.mdt-cpv{display:grid; grid-template-columns:minmax(0,120px) 1fr; gap:10px; align-items:start}
@media(max-width:420px){ .mdt-deux{grid-template-columns:1fr} }
.mdt-ch{display:flex; flex-direction:column; gap:5px; min-width:0}
.mdt-ch .l{font-size:12px; font-weight:700; color:var(--plume)}
.mdt-ch input{width:100%; min-width:0; border:1.5px solid var(--trait); border-radius:13px; padding:12px 13px;
  font:inherit; font-size:15px; color:var(--encre); background:#fff; outline:none; -webkit-appearance:none; appearance:none}
.mdt-ch input:focus{border-color:var(--or)}
.mdt-ch.err{margin-top:0}   /* la classe globale .err de l'espace pousse de 8 px : les colonnes se décalaient */
.mdt-ch.err input{border-color:var(--brique)}
.mdt-ch .e, .mdt-err-l{font-size:12px; color:var(--brique); font-weight:600}
.mdt-erreur{padding:11px 13px; border-radius:12px; background:var(--brique-fond); border:1px solid var(--brique-trait);
  color:var(--brique); font-size:13.5px; line-height:1.5; font-weight:600}

.mdt-coche{display:flex; align-items:flex-start; gap:12px; text-align:left; padding:14px; border-radius:16px;
  border:1.5px solid var(--trait); background:var(--carte); font-size:14.5px; font-weight:700; color:var(--encre); line-height:1.45}
.mdt-coche .bx{flex:0 0 auto; width:24px; height:24px; border-radius:7px; border:1.8px solid var(--trait-fort);
  display:flex; align-items:center; justify-content:center; color:#fff; background:#fff}
.mdt-coche[data-on]{border-color:var(--or); background:var(--or-fond)}
.mdt-coche[data-on] .bx{background:var(--or); border-color:var(--or)}
.mdt-coche.err{border-color:var(--brique); margin-top:0}
.mdt-relire{align-self:flex-start; margin-top:-4px; font-size:13px; font-weight:700; color:var(--or-fonce);
  text-decoration:underline; text-underline-offset:3px; padding:2px 0}
.mdt-relire:disabled{color:var(--plume-clair); text-decoration:none}
.mdt-q{margin-top:6px; font-size:11px; letter-spacing:1.3px; text-transform:uppercase; font-weight:800; color:var(--plume)}
.mdt-choix{display:flex; gap:12px; align-items:flex-start; text-align:left; padding:14px; border-radius:16px;
  border:1.5px solid var(--trait); background:var(--carte); color:var(--encre)}
.mdt-choix b{display:block; font-size:15px}
.mdt-choix .s{display:block; margin-top:3px; font-size:13px; line-height:1.5; color:var(--plume)}
.mdt-choix .rd{flex:0 0 auto; width:22px; height:22px; border-radius:50%; border:1.8px solid var(--trait-fort);
  margin-top:1px; background:#fff}
.mdt-choix[data-on]{border-color:var(--or); background:var(--or-fond)}
.mdt-choix[data-on] .rd{border:6.5px solid var(--or)}
.mdt-code{width:100%; text-align:center; font:inherit; font-size:28px; font-weight:800; letter-spacing:12px;
  padding:14px 10px 14px 22px; border-radius:16px; border:1.5px solid var(--trait-fort); color:var(--encre);
  outline:none; background:#fff; font-variant-numeric:tabular-nums}
.mdt-code:focus{border-color:var(--or)}
.mdt-mention{margin:0; font-size:11.5px; line-height:1.55; color:var(--plume-clair); text-align:center}

.mdt-fini{text-align:center; align-items:center; justify-content:center; min-height:70vh; padding-top:30px}
.mdt-fini .mdt-p{max-width:400px}
.mdt-ok{width:78px; height:78px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  background:var(--vert); color:#fff; box-shadow:0 16px 34px -16px var(--vert); animation:mdtOk .5s cubic-bezier(.16,1,.3,1) both}
@keyframes mdtOk{from{transform:scale(.5); opacity:0} to{transform:none; opacity:1}}
.mdt-pad{position:fixed; inset:0; z-index:1000; background:rgba(19,36,61,.55); display:flex; align-items:flex-end; justify-content:center}
.mdt-pad-in{position:relative; background:#fff; width:100%; max-width:640px; border-radius:22px 22px 0 0;
  padding:16px 16px calc(18px + env(safe-area-inset-bottom, 0px)); display:flex; flex-direction:column; gap:10px}
@media(min-width:700px){ .mdt-pad{align-items:center} .mdt-pad-in{border-radius:22px; padding:22px 24px} }
.mdt-pad-t{display:flex; align-items:center; justify-content:space-between}
.mdt-pad-t b{font-size:18px; color:var(--encre)}
.mdt-pad-zone{position:relative; height:clamp(200px, 36vh, 300px); border:1.5px dashed var(--or-trait); border-radius:16px; background:#fff; overflow:hidden}
.mdt-pad-zone canvas{position:absolute; inset:0; width:100%; height:100%; touch-action:none; cursor:crosshair; z-index:2}
.mdt-pad-zone .ligne{position:absolute; left:20px; right:20px; bottom:46px; border-bottom:1.5px solid var(--trait); pointer-events:none}
.mdt-pad-zone .x{position:absolute; left:20px; bottom:50px; font-size:20px; color:var(--plume); pointer-events:none}
.mdt-pad-zone .aide{position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:15px; color:var(--plume); opacity:.55; pointer-events:none}
.mdt-pad-zone .nom{position:absolute; left:20px; bottom:18px; font-size:12px; color:var(--plume); pointer-events:none}
.mdt-pad-b{display:grid; grid-template-columns:auto 1fr; gap:10px}
.mdt-pad-b .btn{display:flex; align-items:center; justify-content:center; gap:8px}
.mdt-pad-attente{position:absolute; inset:0; z-index:3; background:rgba(255,255,255,.95); border-radius:inherit; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:8px; text-align:center}
.mdt-pad-attente b{font-size:17px; color:var(--encre)}
.mdt-pad-attente span:last-child{font-size:13.5px; color:var(--plume)}
.mdt-pad-attente .tour{width:42px; height:42px; border-radius:50%; border:3px solid var(--or-fond); border-top-color:var(--or); animation:mdtTour .9s linear infinite}
@keyframes mdtTour{to{transform:rotate(360deg)}}
.mdt-sur-c{font-size:10.5px; letter-spacing:1.5px; text-transform:uppercase; font-weight:800; color:var(--vert)}
.mdt-fini .btn{max-width:400px}

.mdt-texte{border:1px solid var(--trait); border-radius:18px; padding:4px 14px 16px; background:var(--fond); container-type:inline-size}
.mdt-partie{padding-top:16px}
.mdt-partie + .mdt-partie{border-top:1px solid var(--trait); margin-top:16px}
.mdt-partie-t{display:flex; gap:12px; align-items:flex-start}
.mdt-partie-t .ic{flex:0 0 auto; width:40px; height:40px; border-radius:12px; background:var(--marque); color:#fff;
  display:flex; align-items:center; justify-content:center}
.mdt-partie-n{font-size:10px; letter-spacing:1.5px; text-transform:uppercase; font-weight:800; color:var(--or-fonce)}
.mdt-partie h4{margin:2px 0 0; font-size:17px; line-height:1.3; color:var(--encre)}
.mdt-partie-s{margin-top:2px; font-family:Georgia, 'Times New Roman', serif; font-style:italic; font-size:13px; color:var(--plume)}
.mdt-sec-t{display:flex; align-items:center; gap:9px; margin-top:16px; padding-bottom:7px; border-bottom:1px solid var(--trait);
  font-size:14.5px; font-weight:800; color:var(--encre)}
.mdt-sec-t .ic{flex:0 0 auto; width:26px; height:26px; border-radius:8px; background:var(--or-fond); border:1px solid var(--or-trait);
  color:var(--or-fonce); display:flex; align-items:center; justify-content:center}
.mdt-sec-i{margin-top:16px; font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; font-weight:800; color:var(--encre)}
.mdt-texte p{margin:8px 0 0; font-size:13.5px; line-height:1.62; color:var(--encre2)}
.mdt-texte p.petit{font-size:12.5px; line-height:1.55}
.mdt-texte p.mdt-enc{padding:10px 12px; border-radius:10px; background:var(--carte); border-left:3px solid var(--or);
  font-weight:700; color:var(--encre); font-size:13.5px}
.mdt-texte ul{margin:6px 0 0; padding-left:18px}
.mdt-texte li{font-size:13.5px; line-height:1.55; color:var(--encre2); margin-top:4px}
.mdt-coches{display:grid; grid-template-columns:1fr; gap:8px; margin-top:10px}
@container (min-width:620px){ .mdt-coches{grid-template-columns:1fr 1fr} }
.mdt-coches > div{display:flex; gap:9px; align-items:flex-start; font-size:13.5px; line-height:1.5; color:var(--encre)}
.mdt-coches .k{flex:0 0 auto; width:20px; height:20px; border-radius:50%; background:var(--or); color:#fff;
  display:flex; align-items:center; justify-content:center; margin-top:1px}
.mdt-etapes{list-style:none; margin:10px 0 0; padding:0}
.mdt-etapes > li{display:flex; gap:12px; align-items:flex-start; padding:10px 0; border-top:1px solid var(--trait); margin:0}
.mdt-etapes > li:first-child{border-top:none; padding-top:2px}
.mdt-etapes .n{flex:0 0 auto; width:30px; height:26px; border-radius:8px; background:var(--or-fond); border:1px solid var(--or-trait);
  color:var(--or-fonce, #A95808); font-weight:800; font-size:12px; display:flex; align-items:center; justify-content:center; margin-top:1px}
.mdt-etapes b{display:block; font-size:14px; color:var(--encre)}
.mdt-etapes .x{display:block; font-size:13.5px; line-height:1.55; color:var(--encre2); margin-top:2px}
.mdt-fiches{display:grid; grid-template-columns:1fr; gap:10px; margin-top:12px}
@container (min-width:620px){ .mdt-fiches{grid-template-columns:1fr 1fr} .mdt-fiche.large{grid-column:1 / -1} }
.mdt-fiche{padding:13px 14px; border-radius:14px; background:var(--carte); border:1px solid var(--trait); min-width:0}
.mdt-fiche-t{display:flex; align-items:center; gap:9px; margin-bottom:2px}
.mdt-fiche-t .ic{flex:0 0 auto; width:28px; height:28px; border-radius:9px; background:var(--or-fond); border:1px solid var(--or-trait);
  color:var(--or-fonce); display:flex; align-items:center; justify-content:center}
.mdt-fiche-t b{font-size:14px; color:var(--encre); line-height:1.3}
.mdt-texte .mdt-fiche p{font-size:13px; line-height:1.55; margin-top:7px; overflow-wrap:anywhere}
.mdt-texte .mdt-fiche p.note{padding-left:9px; border-left:2px solid var(--or); font-weight:700; color:var(--encre)}
.mdt-texte .mdt-fiche p.pied{font-style:italic; font-size:12px; color:var(--plume); border-top:1px solid var(--trait); padding-top:7px}
.mdt-case{display:flex; gap:9px}
.mdt-case .bx{flex:0 0 auto; width:14px; height:14px; border:1.5px solid var(--plume); border-radius:3px; margin-top:3px}
.mdt-case .bx[data-on]{background:var(--or); border-color:var(--or)}
.mdt-projet{display:flex; align-items:center; justify-content:center; gap:8px; margin:12px 0 2px; padding:9px 12px;
  border-radius:12px; border:1.5px dashed var(--or-trait); background:var(--or-fond); color:var(--or-fonce);
  font-size:11px; letter-spacing:1.3px; text-transform:uppercase; font-weight:800}
.mdt-sigs{display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px}
@media(max-width:420px){ .mdt-sigs{grid-template-columns:1fr} }
.mdt-sigc{padding:12px; border-radius:14px; background:var(--carte); border:1px solid var(--trait); border-top:3px solid var(--or);
  display:flex; flex-direction:column; gap:5px; align-items:flex-start}
.mdt-sigc .q{font-size:10px; letter-spacing:1.3px; text-transform:uppercase; font-weight:800; color:var(--or-fonce)}
.mdt-sigc .n{font-size:13.5px; font-weight:800; color:var(--encre); line-height:1.35}
.mdt-sigc .s{font-size:12px; line-height:1.5; color:var(--plume)}
.mdt-ns{display:inline-flex; align-items:center; padding:3px 9px; border-radius:99px; background:var(--brique-fond);
  border:1px solid var(--brique-trait); color:var(--brique); font-size:10.5px; letter-spacing:1px; text-transform:uppercase; font-weight:800}

.mdt-carte{margin-top:18px; padding:16px; border-radius:18px; background:var(--carte); border:1px solid var(--trait);
  box-shadow:var(--ombre); display:flex; flex-direction:column; gap:10px}
.mdt-carte-t{display:flex; align-items:center; gap:10px; font-weight:800; font-size:15px; color:var(--encre)}
.mdt-carte-t .ic{width:32px; height:32px; border-radius:10px; display:flex; align-items:center; justify-content:center;
  background:var(--or-fond); color:var(--or-fonce); border:1px solid var(--or-trait); flex:0 0 auto}
.mdt-carte-p{margin:0; font-size:14px; line-height:1.55; color:var(--encre)}
.mdt-carte-s{margin:-4px 0 0; font-size:12.5px; color:var(--plume)}
.mdt-carte .btn{align-self:flex-start}
.mdt-renoncer{align-self:flex-start; margin-top:4px; font-size:11.5px; color:var(--plume-clair); text-decoration:underline;
  text-underline-offset:3px; padding:2px 0}

.mdt-pret{display:flex; align-items:center; gap:12px; margin:14px 0 0; padding:14px 16px; border-radius:18px;
  background:var(--or-fond); border:1px solid var(--or-trait)}
.mdt-pret-ic{width:40px; height:40px; border-radius:12px; flex:0 0 auto; display:flex; align-items:center;
  justify-content:center; background:var(--or); color:#fff}
.mdt-pret-tx{flex:1; min-width:0; display:flex; flex-direction:column; gap:2px}
.mdt-pret-tx b{font-size:14.5px; color:var(--encre)}
.mdt-pret-tx span{font-size:12.5px; color:var(--plume); line-height:1.45}
/* width:auto : le .btn de l'espace prend toute la largeur, et sur tablette ou
   ordinateur il écrasait le texte de la carte en une colonne d'un mot (V3.55). */
.mdt-pret .btn{flex:0 0 auto; width:auto; padding:10px 16px}
.mdt-docs{display:flex; flex-direction:column; gap:8px; margin:14px 0 0; padding:14px 16px; border-radius:18px; background:var(--carte); border:1px solid var(--trait)}
.mdt-docs .t{font-size:10.5px; letter-spacing:1.3px; text-transform:uppercase; font-weight:800; color:var(--or-fonce)}
.mdt-doc{display:flex; align-items:center; gap:12px; width:100%; padding:10px 12px; border-radius:14px; border:1px solid var(--trait) !important; background:var(--fond) !important; text-align:left}
.mdt-doc .ic{flex:0 0 auto; width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:var(--or-fond); color:var(--or-fonce)}
.mdt-doc .tx{flex:1; min-width:0; display:flex; flex-direction:column}
.mdt-doc .tx b{font-size:14px; color:var(--encre)}
.mdt-doc .tx span{font-size:12px; color:var(--plume)}
.mdt-doc .go{flex:0 0 auto; font-size:11px; font-weight:800; letter-spacing:1px; color:var(--or-fonce)}
/* V3.55 : les bons de visite — un seul : une ligne ; plusieurs : « Mes bons
   de visite », qui se déplie (une ligne par visite, la plus récente en haut). */
.mdt-bons{border-radius:14px; border:1px solid var(--trait); background:var(--fond); overflow:hidden}
.mdt-bons-tete{display:flex; align-items:center; gap:12px; width:100%; padding:10px 12px; border:none !important; background:transparent !important; text-align:left; cursor:pointer}
.mdt-bons-tete .ic, .mdt-bon .ic{flex:0 0 auto; width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:var(--or-fond); color:var(--or-fonce)}
.mdt-bons-tete .tx{flex:1; min-width:0; display:flex; flex-direction:column}
.mdt-bons-tete .tx b{display:flex; align-items:center; gap:8px; font-size:14px; color:var(--encre)}
.mdt-bons-tete .tx b i{font-style:normal; min-width:20px; height:20px; padding:0 6px; border-radius:99px; display:inline-flex; align-items:center; justify-content:center; background:var(--or-fond); color:var(--or-fonce); font-size:11.5px; font-weight:800}
.mdt-bons-tete .tx > span{font-size:12px; color:var(--plume)}
.mdt-bons-tete .chev{flex:0 0 auto; display:flex; color:var(--plume); transition:transform .18s ease}
.mdt-bons.ouvert .mdt-bons-tete .chev{transform:rotate(180deg)}
.mdt-bons-liste{display:flex; flex-direction:column; border-top:1px solid var(--trait)}
.mdt-bon{display:flex; align-items:center; gap:12px; padding:10px 12px}
.mdt-bons-liste .mdt-bon + .mdt-bon{border-top:1px solid var(--trait)}
.mdt-bon.seul{border-radius:14px; border:1px solid var(--trait); background:var(--fond)}
.mdt-bon .tx{flex:1; min-width:0; display:flex; flex-direction:column; gap:1px}
.mdt-bon .tx b{font-size:13.5px; color:var(--encre)}
.mdt-bon .tx > span{font-size:12.5px; color:var(--encre2); overflow-wrap:anywhere}
.mdt-bon .tx small{font-size:12px; color:var(--plume)}
.mdt-bon .mdt-bon-act{flex:0 0 auto; display:flex; gap:6px}
.mdt-bon .mdt-bon-act button{display:inline-flex; align-items:center; gap:5px; height:32px; padding:0 10px; border-radius:9px; border:1px solid var(--trait) !important; background:var(--carte) !important; color:var(--or-fonce); font-size:12px; font-weight:800; cursor:pointer}
.mdt-bon .mdt-bon-act button em{font-style:normal}
@media(max-width:480px){
  .mdt-bon{flex-wrap:wrap}
  .mdt-bon .mdt-bon-act{flex:1 1 100%}
  .mdt-bon.seul .act{padding-left:46px}
  .mdt-bon .mdt-bon-act button{flex:1 1 0; justify-content:center; height:36px}
}
@media(max-width:420px){ .mdt-pret{flex-wrap:wrap} .mdt-pret .btn{width:100%} }
/* Un document de la rubrique Documents signé par lui, en attente d'un autre :
   qui a signé, qui on attend (un point par personne), et la page de son
   conjoint en lien discret. Pas de <span> ici : .mdt-pret-tx span les prendrait. */
.mdt-pret-qui{display:flex; flex-direction:column; gap:3px; margin-top:5px}
.mdt-pret-qui > div{display:flex; align-items:center; gap:8px; min-width:0}
.mdt-pret-qui i{flex:0 0 auto; width:8px; height:8px; border-radius:50%; background:var(--or)}
.mdt-pret-qui i.ok{background:var(--vert)}
.mdt-pret-qui em{font-style:normal; font-size:12.5px; line-height:1.4; color:var(--encre2); min-width:0; overflow-wrap:anywhere}
.mdt-pret-a{align-self:flex-start; margin-top:5px; font-size:12.5px; font-weight:700; line-height:1.4; color:var(--or-fonce);
  text-decoration:underline; text-underline-offset:3px}

.mdt-brique{background:var(--brique); color:#fff; margin-top:14px}

.mdt-choix2{display:flex; flex-direction:column; gap:10px}
.mdt-confiance{display:flex; flex-wrap:wrap; justify-content:center; gap:6px 14px; padding:10px 12px; border-radius:14px;
  background:var(--fond); border:1px solid var(--trait)}
.mdt-confiance > span{display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:var(--plume)}
.mdt-confiance > span > svg{color:var(--or-fonce); flex:0 0 auto}
.mdt-confiance.fini{flex-direction:column; align-items:flex-start; gap:9px; width:100%; max-width:400px; text-align:left;
  background:var(--vert-fond, #f0fdf4); border-color:var(--vert-trait, #bbf7d0)}
.mdt-confiance.fini > span{font-size:13px; color:var(--encre)}
.mdt-confiance.fini > span > svg{color:var(--vert)}

/* ── Signer à plusieurs, ou via une société ── */
.mdt-q2{margin-top:10px; font-size:11px; letter-spacing:1.3px; text-transform:uppercase; font-weight:800; color:var(--plume)}
.mdt-seg{display:grid; grid-template-columns:1fr 1fr; gap:8px}
.mdt-seg button{display:flex; align-items:center; justify-content:center; gap:8px; padding:12px 10px; border-radius:14px;
  border:1.5px solid var(--trait); background:var(--carte); font-weight:700; color:var(--plume); font-size:14px}
.mdt-seg button[data-on]{border-color:var(--or); background:var(--or-fond); color:var(--encre)}
.mdt-seg button svg{flex:0 0 auto; color:var(--or-fonce)}
.mdt-qui{display:flex; flex-direction:column; border:1px solid var(--trait); border-radius:16px; overflow:hidden}
.mdt-qui-l{display:flex; align-items:center; gap:12px; padding:12px 14px; border-top:1px solid var(--trait); background:var(--carte)}
.mdt-qui-l:first-child{border-top:none}
.mdt-av{flex:0 0 auto; width:38px; height:38px; border-radius:50%; background:var(--marque); color:var(--or-clair);
  font-weight:800; font-size:13px; display:flex; align-items:center; justify-content:center; letter-spacing:.5px}
.mdt-av.b{background:var(--or-fond); color:var(--or-fonce); border:1px solid var(--or-trait)}
.mdt-qui-tx{flex:1; min-width:0; display:flex; flex-direction:column; gap:1px}
.mdt-qui-tx b{font-size:14.5px; color:var(--encre); line-height:1.3}
.mdt-qui-tx span{font-size:12.5px; color:var(--plume); line-height:1.45; overflow-wrap:anywhere}
.mdt-qui-a{flex:0 0 auto; font-size:12.5px; font-weight:700; color:var(--or-fonce); text-decoration:underline; text-underline-offset:3px; padding:4px 0}
.mdt-ajout{display:flex; align-items:center; justify-content:center; gap:8px; padding:13px; border-radius:14px;
  border:1.5px dashed var(--or-trait); background:var(--carte); color:var(--or-fonce); font-weight:800; font-size:14px; width:100%}
.mdt-ajout svg{flex:0 0 auto}
.mdt-rappel{display:flex; gap:12px; align-items:flex-start; padding:14px; border-radius:16px; background:var(--fond);
  border:1px solid var(--trait); border-left:4px solid var(--or)}
.mdt-rappel > svg{flex:0 0 auto; color:var(--or-fonce); margin-top:2px}
.mdt-rappel b{display:block; font-size:14.5px; color:var(--encre)}
.mdt-rappel p{margin:5px 0 0; font-size:13.5px; line-height:1.55; color:var(--encre2)}
.mdt-perso{border:1.5px solid var(--or-trait); border-radius:18px; padding:14px; display:flex; flex-direction:column; gap:10px; background:var(--carte)}
.mdt-perso-t{display:flex; align-items:center; justify-content:space-between; gap:10px}
.mdt-perso-t .n{font-size:10.5px; letter-spacing:1.3px; text-transform:uppercase; font-weight:800; color:var(--or-fonce)}
/* ⚠️ pas « .mini » : l'espace a déjà une classe .mini (height:34px). */
.mdt-coche.mdt-leger{padding:11px 12px; font-size:13.5px; border-radius:14px}
.mdt-coche.mdt-leger .bx{width:22px; height:22px}
.mdt-info{display:flex; gap:10px; align-items:flex-start; font-size:13px; line-height:1.55; color:var(--encre2);
  padding:11px 13px; border-radius:12px; background:var(--fond); border:1px solid var(--trait)}
.mdt-info > svg{flex:0 0 auto; color:var(--or-fonce); margin-top:1px}
.mdt-perso-b{display:grid; grid-template-columns:1fr 1fr; gap:8px}
.mdt-perso-b .btn{padding:11px 12px; font-size:14px}
.mdt-depot{position:relative; display:flex; align-items:center; gap:12px; padding:13px 14px; border-radius:14px; border:1.5px dashed var(--trait-fort);
  background:var(--fond); color:var(--plume); text-align:left; width:100%; cursor:pointer}
.mdt-depot > svg{flex:0 0 auto; color:var(--or-fonce)}
.mdt-depot b{display:block; font-size:14px; color:var(--encre); overflow-wrap:anywhere}
.mdt-depot span span{display:block; font-size:12.5px}
.mdt-depot input{position:absolute; inset:0; opacity:0; cursor:pointer; width:100%}
.mdt-soc-q{position:relative; display:flex; flex-direction:column; gap:6px}
.mdt-soc-e{font-size:12.5px; color:var(--plume); line-height:1.5}
.mdt-soc-l{display:flex; flex-direction:column; border:1.5px solid var(--or-trait); border-radius:14px; overflow:hidden; background:#fff;
  box-shadow:0 14px 30px -18px rgba(19,36,61,.45)}
.mdt-soc-l button{display:flex; flex-direction:column; align-items:flex-start; gap:2px; padding:11px 13px; text-align:left; border-top:1px solid var(--trait)}
.mdt-soc-l button:first-child{border-top:none}
.mdt-soc-l button:hover, .mdt-soc-l button:focus-visible{background:var(--or-fond)}
.mdt-soc-l b{font-size:14px; color:var(--encre)}
.mdt-soc-l span{font-size:12.5px; color:var(--plume)}
.mdt-sel{width:100%; border:1.5px solid var(--trait); border-radius:13px; padding:12px 13px; font:inherit; font-size:15px;
  color:var(--encre); background:#fff; -webkit-appearance:none; appearance:none}
.mdt-ch.err .mdt-sel{border-color:var(--brique)}
.mdt-sgn{display:flex; flex-direction:column; gap:8px; width:100%; max-width:440px}
.mdt-carte .mdt-sgn{max-width:none}
.mdt-sgn-l{display:flex; gap:12px; align-items:center; padding:12px 14px; border-radius:14px; border:1px solid var(--trait);
  background:var(--carte); text-align:left}
.mdt-sgn-l > span:last-child{min-width:0}
.mdt-sgn .pt{flex:0 0 auto; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center}
.mdt-sgn .pt.ok{background:var(--vert); color:#fff}
.mdt-sgn .pt.att{background:var(--or-fond); color:var(--or-fonce); border:1px solid var(--or-trait)}
.mdt-sgn .pt.non{background:var(--fond); color:var(--plume); border:1px solid var(--trait)}
.mdt-sgn b{display:block; font-size:14px; color:var(--encre)}
.mdt-sgn span.s{display:block; font-size:12.5px; color:var(--plume); line-height:1.45; overflow-wrap:anywhere}
.mdt-sgn-bloc{display:flex; flex-direction:column; gap:6px}
.mdt-sgn-a{display:flex; flex-wrap:wrap; align-items:center; gap:6px 14px; padding:0 2px}
.mdt-sgn-a .btn{width:auto; padding:10px 14px; font-size:13.5px}
.mdt-carte .mdt-sgn-a .btn{align-self:auto}
.mdt-sgn-f{display:flex; flex-direction:column; gap:8px}
.mdt-sgn .mdt-relire{margin-top:0}
.mdt-ok-l{font-size:12.5px; color:var(--vert); font-weight:700}
.mdt-ns.ok{background:var(--vert-fond); border-color:var(--vert-trait); color:var(--vert)}
.mdt-pret .btn.fant{width:auto}
/* « Voir », sous la liste des signataires : sur téléphone, sur sa propre ligne. */
@media(max-width:420px){ .mdt-pret.mdt-pret-att .btn.fant{width:100%} }
@media(min-width:640px){ .mdt-perso-b{max-width:420px} }

/* Téléphone : plus serré, pour que chaque étape tienne sans trop défiler. */
@media(max-width:639px){
  .mdt-corps{padding:10px 16px 8px; gap:10px}
  .mdt-tete{padding:12px 16px 4px}
  .mdt-pas{padding:4px 16px 0}
  .mdt-corps h3{font-size:21px}
  .mdt-sceau{width:54px; height:54px; margin-top:2px}
  .mdt-p{font-size:14px; line-height:1.58}
  .mdt-puces{padding:13px 14px; gap:8px}
  .mdt-puces > span{font-size:13.5px}
  .mdt-ligne{padding:11px 14px}
  .mdt-coche, .mdt-choix{padding:12px}
  .mdt-texte{padding:2px 11px 14px}
}
/* Ordinateur : une fenêtre plus large, des cases côte à côte. */
@media(min-width:640px){
  .feuille.mandat{width:min(780px, 94vw)}
  .mdt-tete{padding:18px 30px 6px}
  .mdt-pas{padding:4px 30px 0}
  .mdt-corps{padding:16px 30px 12px; gap:14px}
  .mdt-accueil .mdt-p{max-width:580px}
  .mdt-accueil .mdt-puces{max-width:640px; display:grid; grid-template-columns:1fr 1fr; gap:12px 20px}
  .mdt-accueil .btn.or{max-width:420px}
  .mdt-lignes{display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--trait)}
  .mdt-ligne{border-top:none}
  .mdt-choix2{flex-direction:row}
  .mdt-choix2 > .mdt-choix{flex:1 1 0}
  .mdt-code{max-width:360px; align-self:center}
  .mdt-corps > .btn.mdt-plein{max-width:520px; align-self:center}
  .mdt-fini .btn{max-width:420px}
}
`;
