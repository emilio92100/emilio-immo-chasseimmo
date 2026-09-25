'use client';

/* ══ Le mandat de recherche, dans l'espace client ═══════════════════════════

   Trois morceaux, tous branchés sur /api/espace/mandat :

     · <SignatureMandat>   le parcours de signature, en plein écran : une page
                           d'accueil sans chiffres, le récapitulatif (où la
                           rémunération apparaît, comme la loi le veut), les
                           coordonnées, puis le code reçu par e-mail ;
     · <CarteMonMandat>    la rubrique « Mon mandat » de « Ma recherche » :
                           le PDF signé, et le lien discret « Renoncer au
                           mandat » pendant les 14 jours ;
     · <CartePret>         la carte de l'accueil quand Alexandre a préparé le
                           mandat (« Faire signer le mandat » dans le CRM).

   Le texte affiché par « Lire le mandat complet » vient de src/lib/mandat.ts,
   exactement comme celui du PDF : ce qu'il lit est ce qu'il signe.

   ⚠️ Règle du dépôt (AGENTS.md §2.1) : pas de texte JSX qui commence par une
   espace et passe à la ligne. Ici, les phrases sont sur une ligne ou dans une
   chaîne.
   ════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  resumeMandat, redigerMandat, validerMandant, titreMandat, dateLongue, versionMandat, heureParis, AGENCE, SIGNATAIRE, RETRACTATION_JOURS, ICONES,
  type Mandant, type Recherche, type Partie, type Icone,
} from '@/lib/mandat';

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
};

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
};
function Ic({ n, t = 18 }: { n: string; t?: number }) {
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
function TexteMandat({ parties }: { parties: Partie[] }) {
  return (
    <div className="mdt-texte">
      <div className="mdt-projet"><Ic n="doc" t={15} /><span>Projet de mandat · non signé</span></div>
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
                      <div className="n">{`${AGENCE.nom} · ${SIGNATAIRE.nom}`}</div>
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
function Champ({ lib, val, onChange, err, type = 'text', mode, auto, placeholder }: {
  lib: string; val: string; onChange: (v: string) => void; err?: string; type?: string;
  mode?: 'text' | 'email' | 'tel' | 'numeric'; auto?: string; placeholder?: string;
}) {
  return (
    <label className={'mdt-ch' + (err ? ' err' : '')}>
      <span className="l">{lib}</span>
      <input type={type} value={val} onChange={e => onChange(e.target.value)} inputMode={mode}
        autoComplete={auto} placeholder={placeholder} />
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
function ChampDate({ lib, val, onChange, err }: { lib: string; val: string; onChange: (v: string) => void; err?: string }) {
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
type Adresse = { rue: string; cp: string; ville: string };
function couperAdresse(a: string): Adresse {
  const t = (a || '').trim();
  const d = /^(.*?)[,\s]+(\d{5})\s+(.+)$/.exec(t);
  return d ? { rue: d[1].trim(), cp: d[2], ville: d[3].trim() } : { rue: t, cp: '', ville: '' };
}
const joindreAdresse = (x: Adresse) => [x.rue.trim(), [x.cp.trim(), x.ville.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');

const ERREURS: Record<string, string> = {
  code: 'Ce code ne correspond pas.',
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
};

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
  onSigne: (r: { numero: string; signeLe: string; finRetractation: string; execution: boolean }) => Promise<void> | void;
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
  const [execution, setExecution] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [attente, setAttente] = useState(0);
  const [fin, setFin] = useState<{ numero: string; finRetractation: string; execution: boolean } | null>(null);
  /* La recherche telle que le mandat la décrit, taux compris. Elle part de
     la page, et se remet à jour si Alexandre change le taux entre-temps. */
  const [rech, setRech] = useState<Recherche>(mandat.recherche);
  const [avis, setAvis] = useState('');
  const [question, setQuestion] = useState<'' | 'envoi' | 'ok'>('');
  const haut = useRef<HTMLDivElement>(null);

  /* On note l'ouverture : c'est la première ligne du déroulé du certificat.
     La réponse porte la version du jour du mandat. */
  useEffect(() => {
    let vivant = true;
    envoyer('mandat', { etape: 'afficher' }).then(r => { if (vivant && r?.recherche) setRech(r.recherche); });
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
  const parties = useMemo(() => redigerMandat({
    numero: numero || '…', mandant: etape === 'lecture' && retourLecture === 'signer' ? m : null,
    recherche: rech, executionImmediate: null,
  }), [numero, m, etape, retourLecture, rech]);

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

  const demanderCode = async () => {
    const v = validerMandant(m);
    /* Les trois cases de l'adresse, chacune la sienne. */
    const manque: Record<string, string> = {};
    if (adr.rue.trim().length < 3) manque.rue = 'Numéro et rue';
    if (!/^[0-9A-Za-z -]{4,10}$/.test(adr.cp.trim())) manque.cp = 'Code postal';
    if (adr.ville.trim().length < 2) manque.ville = 'Ville';
    if (!v.ok || Object.keys(manque).length) { setChamps({ ...(v.ok ? {} : v.champs), ...manque, ...(Object.keys(manque).length ? { adresse: '' } : {}) }); return; }
    setEnvoi(true); setErreur('');
    const r = await envoyer('mandat', { etape: 'code', mandant: v.mandant, version: versionMandat(rech) });
    setEnvoi(false);
    if (r?.ok) {
      setNumero(r.numero); setEmailMasque(r.email); setCode(''); setAttente(45); setAvis(''); setCodeParti(true); setCodeDe('');
      setEtape('signer');
    } else if (r?.error === 'change') {
      relire(r);
    } else if (r?.error === 'coordonnees' && r.champs) {
      setChamps(r.champs);
    } else {
      setErreur(ERREURS[r?.error] || 'Une erreur est survenue. Réessayez dans un instant.');
    }
  };

  const renvoyer = async () => {
    setErreur('');
    const r = await envoyer('mandat', { etape: 'code', mandant: m, version: versionMandat(rech) });
    if (r?.ok) { setEmailMasque(r.email); setCode(''); setAttente(45); setCodeParti(true); setCodeDe(''); }
    else if (r?.error === 'change') relire(r);
    else setErreur(ERREURS[r?.error] || 'Le code n’a pas pu être renvoyé.');
  };

  const signer = async () => {
    if (!lu || execution === null || code.length !== 6) return;
    setEnvoi(true); setErreur('');
    const r = await envoyer('mandat', { etape: 'signer', code, execution, accepte: true });
    if (r?.ok) {
      const res = { numero: r.numero, signeLe: r.signeLe || new Date().toISOString(), finRetractation: r.finRetractation, execution: r.execution ?? execution };
      try { await onSigne(res); } catch { /* la signature est faite : la suite ne doit pas la cacher */ }
      setFin(res);
      setEnvoi(false);
      setEtape('fini');
      return;
    }
    setEnvoi(false);
    if (r?.error === 'change') { relire(r); return; }
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
      <button type="button" className="mdt-rond" aria-label="Fermer" onClick={onFermer}><Ic n="croix" t={14} /></button>
    </div>
  );
  const barre = pas > 0 && etape !== 'lecture' ? (
    <div className="mdt-pas" aria-label={`Étape ${pas} sur 3`}>
      {[1, 2, 3].map(i => <i key={i} data-on={i <= pas ? '1' : undefined} />)}
    </div>
  ) : null;

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
            <span><span className="k"><Ic n="check" t={14} /></span><span>Il travaille pour vous, pas pour le vendeur.</span></span>
            <span><span className="k"><Ic n="check" t={14} /></span><span>Avant toute offre, il vérifie le dossier&nbsp;: copropriété, charges, travaux à venir.</span></span>
            <span><span className="k"><Ic n="check" t={14} /></span><span>Il vous ouvre aussi les biens qui ne sont pas sur les portails.</span></span>
            <span><span className="k"><Ic n="check" t={14} /></span><span>Il reste à vos côtés jusqu’à la signature chez le notaire.</span></span>
          </div>
          <div className="mdt-rassure">{`Aucune obligation d’acheter · ${RETRACTATION_JOURS} jours pour changer d’avis`}</div>
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
          <TexteMandat parties={parties} />
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
              <div className="v">{`${SIGNATAIRE.nom} · Emilio Immobilier`}</div>
              <div className="d">{`carte professionnelle ${AGENCE.carte}`}</div>
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
          {erreur && <div className="mdt-erreur">{erreur}</div>}
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

          <button type="button" className="mdt-coche" data-on={lu ? '1' : undefined} onClick={() => setLu(x => !x)}>
            <span className="bx">{lu && <Ic n="check" t={14} />}</span>
            <span>J’ai lu l’information précontractuelle et mon mandat de recherche, et je les accepte.</span>
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
          <button type="button" className="btn or mdt-plein" disabled={!pret || envoi} onClick={signer}>
            <Ic n="plume" t={16} /><span>{envoi ? 'Signature en cours…' : 'Signer mon mandat'}</span>
          </button>
          <div className="mdt-confiance">
            <span><Ic n="cadenas" t={15} /><span>Code personnel, à usage unique</span></span>
            <span><Ic n="bouclier" t={15} /><span>Document scellé et horodaté</span></span>
            <span><Ic n="retour" t={15} /><span>{`${RETRACTATION_JOURS} jours pour changer d’avis`}</span></span>
          </div>
          <p className="mdt-mention">{`En signant, vous acceptez votre mandat de recherche non exclusif. Vous en recevez un exemplaire par e-mail, et vous pouvez y renoncer pendant ${RETRACTATION_JOURS} jours depuis votre espace.`}</p>
        </div>
      </div>
    );
  }

  /* ── 4. C'est signé ── */
  const attendre = fin && !fin.execution;
  return (
    <div className="mdt">
      <div className="mdt-corps mdt-fini">
        <div className="mdt-ok"><Ic n="check" t={34} /></div>
        <div className="mdt-sur-c">Mandat signé et scellé</div>
        <h3>{`Merci ${m.prenom}, c’est fait`}</h3>
        <p className="mdt-p">{raison === 'visite'
          ? (attendre
            ? `Votre demande de visite est partie. Comme vous avez choisi d’attendre vos ${RETRACTATION_JOURS} jours, Alexandre vous proposera un créneau à partir du ${dateLongue(fin!.finRetractation)}.`
            : 'Votre demande de visite est partie avec vos disponibilités. Alexandre vous propose un créneau très vite.')
          : 'Alexandre est prévenu. Vous pouvez maintenant demander vos visites en un geste, depuis chaque bien.'}</p>
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

/* ══ « Mon mandat », dans « Ma recherche » ══════════════════════════════ */

export function CarteMonMandat({ mandat, envoyer, onSigner, onRenoncer }: {
  mandat: MandatEspace; envoyer: Envoyer; onSigner: () => void; onRenoncer: () => void;
}) {
  const [erreur, setErreur] = useState('');
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
    return (
      <section className="mdt-carte">
        <div className="mdt-carte-t"><span className="ic"><Ic n="bouclier" t={17} /></span><span>Mon mandat de recherche</span></div>
        {s ? (
          <>
            <p className="mdt-carte-p"><b>{`N° ${s.numero}`}</b>{` · signé le ${dateLongue(s.le)}`}</p>
            {mandat.expiration && <p className="mdt-carte-s">{`Renouvelé chaque mois, jusqu’au ${dateLongue(mandat.expiration + 'T12:00:00Z')} au plus tard.`}</p>}
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

/* ══ La renonciation, avec sa confirmation ══════════════════════════════ */

export function Renonciation({ mandat, envoyer, onFermer, onFait }: {
  mandat: MandatEspace; envoyer: Envoyer; onFermer: () => void; onFait: () => void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const s = mandat.signe;
  const confirmer = async () => {
    setEnvoi(true); setErreur('');
    const r = await envoyer('mandat', { etape: 'renoncer', confirme: true });
    setEnvoi(false);
    if (r?.ok) onFait();
    else setErreur(r?.error === 'delai' ? 'Le délai de rétractation est passé : parlez-en à Alexandre.' : 'La renonciation n’a pas pu être enregistrée. Réessayez dans un instant.');
  };
  return (
    <>
      <div className="tete-f">
        <div><div className="sur">Mon mandat</div><h3>Renoncer au mandat</h3></div>
        <button className="fermer" onClick={onFermer} aria-label="Fermer"><Ic n="croix" t={14} /></button>
      </div>
      <div className="corps-f">
        <p className="mdt-p" style={{ textAlign: 'left' }}>{s
          ? `Vous pouvez renoncer à votre mandat de recherche n° ${s.numero} jusqu’au ${dateLongue(s.fin)}. Il prend fin tout de suite, sans aucun frais, et vous recevez un accusé de réception par e-mail.`
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

.mdt-accueil{text-align:center; align-items:center; padding-top:4px}
.mdt-accueil .mdt-p{max-width:420px}
.mdt-sceau{width:68px; height:68px; border-radius:50%; margin:8px auto 2px; display:flex; align-items:center;
  justify-content:center; color:var(--or); background:var(--or-fond); border:1px solid var(--or-trait)}
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
.mdt-sur-c{font-size:10.5px; letter-spacing:1.5px; text-transform:uppercase; font-weight:800; color:var(--vert)}
.mdt-fini .btn{max-width:400px}

.mdt-texte{border:1px solid var(--trait); border-radius:18px; padding:4px 14px 16px; background:var(--fond); container-type:inline-size}
.mdt-partie{padding-top:16px}
.mdt-partie + .mdt-partie{border-top:1px solid var(--trait); margin-top:16px}
.mdt-partie-t{display:flex; gap:12px; align-items:flex-start}
.mdt-partie-t .ic{flex:0 0 auto; width:40px; height:40px; border-radius:12px; background:var(--encre); color:#fff;
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
  color:var(--or-fonce, #a07c28); font-weight:800; font-size:12px; display:flex; align-items:center; justify-content:center; margin-top:1px}
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
.mdt-pret .btn{flex:0 0 auto; padding:10px 16px}
@media(max-width:420px){ .mdt-pret{flex-wrap:wrap} .mdt-pret .btn{width:100%} }

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
