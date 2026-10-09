'use client';

/* ══ La page du co-signataire (/signer/<jeton>) ══════════════════════════════

   Le conjoint, ou un co-acquéreur, que le premier signataire a ajouté en
   signant. Il n'a pas d'espace : cette page est sa seule porte, et elle ne
   montre que le mandat. Même parcours que dans l'espace, en plus court :

     accueil → récapitulatif (1/3) → ses informations (2/3) → code et
     signature (3/3) → c'est fait

   Les pièces viennent de SignatureMandat.tsx (le texte du mandat, les champs,
   la signature au doigt, les styles) : ce qu'il lit est exactement ce que
   le premier a lu, et ce que le PDF imprimera.

   ⚠️ Règle du dépôt (AGENTS.md §2.1) : pas de texte JSX qui commence par une
   espace et passe à la ligne. Ici, les phrases sont sur une ligne ou dans une
   chaîne.
   ════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  redigerMandat, resumeMandat, validerMandant, titreMandat, dateLongue, heureParis, RETRACTATION_JOURS,
  type Mandant, type Recherche,
} from '@/lib/mandat';
import { BlocAdresse, BlocNaissance, manquesAdresse } from '@/components/espace/ChampsLieu';
import type { IdentiteAgence } from '@/lib/agence';
import {
  Ic, TexteMandat, Champ, ChampDate, PadSignature, couperAdresse, joindreAdresse, ERREURS, CSS_MANDAT, type Adresse,
} from '@/components/espace/SignatureMandat';

export type DonneesSigner = {
  jeton: string;
  etat: 'invite' | 'expire' | 'signe' | 'decline' | 'annule' | 'retracte' | 'fin' | 'introuvable';
  numero: string;
  /** Ses informations, telles que le premier signataire les a saisies (ou lui, corrigées). */
  moi: Mandant;
  /** Le premier signataire, et quand il a signé. */
  premier: Mandant;
  premierLe: string;
  /** Tous les co-signataires, dans l'ordre du mandat ; `rang` : sa place parmi eux. */
  membres: Mandant[];
  rang: number;
  /** Les dates de signature de chaque mandant (le premier, puis les co-signataires). */
  signes: (string | null)[];
  recherche: Recherche;
  identite: IdentiteAgence;
  execution: boolean | null;
  /** Un code parti il y a moins d'un quart d'heure : on le remet devant la case. */
  code: { le: string; email: string } | null;
  signeLe: string | null;
  fin: string | null;
  complet: boolean;
  expire: string | null;
  tel: string;
};

type Reponse = Record<string, unknown> & { ok?: boolean; error?: string };
const avantLe = (iso: string) => Date.now() < Date.parse(iso);

export default function SignatureCosignataire({ d }: { d: DonneesSigner }) {
  const envoyer = async (etape: string, corps: Record<string, unknown> = {}): Promise<Reponse | null> => {
    try {
      const r = await fetch('/api/signer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jeton: d.jeton, etape, ...corps }) });
      return await r.json();
    } catch { return null; }
  };
  const [etat, setEtat] = useState(d.etat);
  const [etape, setEtape] = useState<'accueil' | 'recap' | 'lecture' | 'coord' | 'signer' | 'fini'>(d.code ? 'signer' : 'accueil');
  const [retour, setRetour] = useState<'recap' | 'signer'>('recap');
  const [m, setM] = useState<Mandant>(d.moi);
  const [adr, setAdr] = useState<Adresse>(() => couperAdresse(d.moi.adresse));
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [certifie, setCertifie] = useState(false);
  const [lu, setLu] = useState(false);
  const [execution, setExecution] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [emailMasque, setEmailMasque] = useState(d.code?.email || '');
  const [codeDe, setCodeDe] = useState(d.code?.le || '');
  const [attente, setAttente] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [pad, setPad] = useState(false);
  const [erreur, setErreur] = useState('');
  const [fin, setFin] = useState<{ complet: boolean; signeLe: string; fin: string | null } | null>(null);
  const [decliner, setDecliner] = useState(false);
  const [renoncer, setRenoncer] = useState(false);
  const haut = useRef<HTMLDivElement>(null);

  useEffect(() => { void envoyer('afficher'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo({ top: 0 }); }, [etape, etat]);
  useEffect(() => {
    if (attente <= 0) return;
    const t = setTimeout(() => setAttente(a => a - 1), 1000);
    return () => clearTimeout(t);
  }, [attente]);

  const f = m.civilite === 'Madame';
  const p = d.premier.prenom;
  const nomP = `${d.premier.prenom} ${d.premier.nom}`;
  const resume = useMemo(() => resumeMandat(d.recherche), [d.recherche]);
  const parties = useMemo(() => redigerMandat({
    numero: d.numero, mandant: d.premier, cosignataires: d.membres.map((x, i) => (i === d.rang ? m : x)),
    recherche: d.recherche, executionImmediate: d.execution, signature: { le: d.premierLe, email: d.premier.email },
  }, d.identite), [d, m]);

  const changeAdr = (x: Adresse) => {
    setAdr(x); setM(o => ({ ...o, adresse: joindreAdresse(x) }));
    setChamps(c => ({ ...c, adresse: '', rue: '', cp: '', ville: '', pays: '' }));
  };
  const maj = (k: keyof Mandant) => (v: string) => { setM(x => ({ ...x, [k]: v })); setChamps(c => ({ ...c, [k]: '' })); };

  const demanderCode = async () => {
    const v = validerMandant(m);
    const manque: Record<string, string> = manquesAdresse(adr);
    if (!certifie) manque.certifie = 'Cochez cette case pour recevoir votre code.';
    if (!v.ok || Object.keys(manque).length) { setChamps({ ...(v.ok ? {} : v.champs), ...manque }); return; }
    setEnvoi(true); setErreur('');
    const r = await envoyer('code', { personne: v.mandant, certifie: true });
    setEnvoi(false);
    if (r?.ok) { setEmailMasque(String(r.email || '')); setCodeDe(''); setCode(''); setAttente(45); setEtape('signer'); }
    else if (r?.error === 'coordonnees' && r.champs) setChamps(r.champs as Record<string, string>);
    else if (r?.error === 'lien_expire') setEtat('expire');
    else if (r?.error === 'etat') setEtat('fin');
    else setErreur(ERREURS[r?.error || ''] || 'Une erreur est survenue. Réessayez dans un instant.');
  };
  const renvoyer = async () => {
    setErreur('');
    const r = await envoyer('code', { personne: m });
    if (r?.ok) { setEmailMasque(String(r.email || '')); setCodeDe(''); setCode(''); setAttente(45); }
    else setErreur(ERREURS[r?.error || ''] || 'Le code n’a pas pu être renvoyé.');
  };
  const signer = async (griffe: string) => {
    setEnvoi(true); setErreur('');
    const [r] = await Promise.all([
      envoyer('signer', { code, accepte: true, execution, griffe }),
      new Promise(ok => setTimeout(ok, 1600)),
    ]);
    setPad(false); setEnvoi(false);
    if (r?.ok) {
      setFin({ complet: !!r.complet, signeLe: String(r.signeLe || new Date().toISOString()), fin: (r.finRetractation as string) || null });
      setEtape('fini'); return;
    }
    if (r?.error === 'code' && typeof r.restants === 'number') {
      setErreur(r.restants > 0 ? `Ce code ne correspond pas. Encore ${r.restants} essai${r.restants > 1 ? 's' : ''}.` : ERREURS.trop);
    } else setErreur(ERREURS[r?.error || ''] || 'La signature n’a pas abouti. Réessayez dans un instant.');
  };
  const telecharger = async () => {
    const w = window.open('', '_blank');
    const r = await envoyer('pdf');
    if (r?.ok && r.url) { if (w) w.location.href = String(r.url); else window.location.href = String(r.url); }
    else { w?.close(); setErreur('Le document n’est pas encore prêt : vous le recevez aussi par e-mail.'); }
  };
  const confirmerDecliner = async () => {
    setEnvoi(true); setErreur('');
    const r = await envoyer('decliner');
    setEnvoi(false);
    if (r?.ok) { setDecliner(false); setEtat('decline'); }
    else setErreur(ERREURS[r?.error || ''] || 'Votre réponse n’a pas pu être enregistrée. Réessayez dans un instant.');
  };
  const confirmerRenoncer = async () => {
    setEnvoi(true); setErreur('');
    const r = await envoyer('renoncer', { confirme: true });
    setEnvoi(false);
    if (r?.ok) { setRenoncer(false); setEtat('retracte'); }
    else setErreur(r?.error === 'delai' ? 'Le délai de rétractation est passé : parlez-en à Alexandre.' : 'La renonciation n’a pas pu être enregistrée. Réessayez dans un instant.');
  };

  const cadre = (contenu: React.ReactNode) => (
    <div className="sgn-page">
      <style>{CSS_SIGNER + CSS_MANDAT}</style>
      <div className="sgn-band">
        <span className="m">EMILIO IMMOBILIER</span>
        {d.numero && <span className="n">{`Mandat n° ${d.numero}`}</span>}
      </div>
      <div className="sgn-f" ref={haut}>{contenu}</div>
    </div>
  );
  const message = (ic: string, titre: string, texte: string, plus?: React.ReactNode) => cadre(
    <div className="mdt">
      <div className="mdt-corps mdt-fini">
        <div className="mdt-sceau"><Ic n={ic} t={28} /></div>
        <h3>{titre}</h3>
        <p className="mdt-p">{texte}</p>
        {plus}
        <a className="btn fant mdt-plein" href={'tel:' + d.tel.replace(/\s/g, '')}><Ic n="tel" t={16} /><span>{`Appeler Alexandre · ${d.tel}`}</span></a>
      </div>
    </div>,
  );

  /* ── Ce que le lien ne permet plus ── */
  if (etat === 'introuvable') return message('info', 'Ce lien ne mène plus nulle part', 'Il a peut-être été remplacé par un plus récent : regardez le dernier e-mail reçu, ou appelez Alexandre.');
  if (etat === 'expire') return message('horloge', 'Ce lien a expiré', `Pour votre sécurité, le lien de signature n’est valable que quinze jours. Demandez à ${p}, ou à Alexandre, de vous en renvoyer un nouveau.`);
  if (etat === 'decline') return message('check', 'C’est noté', `${p} et Alexandre sont prévenus : vous ne signerez pas ce mandat. S’il s’agit d’une erreur, appelez Alexandre, il vous renverra un lien.`);
  if (etat === 'annule') return message('info', 'Ce mandat ne vous attend plus', `Le mandat de recherche de ${p} continue sans votre signature. Si vous souhaitez finalement le signer, appelez Alexandre : il vous enverra un nouveau lien.`);
  if (etat === 'fin') return message('info', 'Ce mandat a pris fin', `${p} a mis fin au mandat de recherche : il n’y a plus rien à signer.`);
  if (etat === 'retracte') return message('retour', 'Votre renonciation est enregistrée', 'Le mandat ne vous engage plus, sans aucun frais. Vous avez reçu un accusé de réception par e-mail.');

  /* ── Il a déjà signé : son exemplaire, et la renonciation pendant 14 jours ── */
  if (etat === 'signe' || etape === 'fini') {
    const signeLe = fin?.signeLe || d.signeLe || new Date().toISOString();
    const complet = fin ? fin.complet : d.complet;
    const limite = fin?.fin || d.fin;
    const peutRenoncer = !!limite && avantLe(limite);
    return cadre(
      <div className="mdt">
        <div className="mdt-corps mdt-fini">
          <div className="mdt-ok"><Ic n="check" t={34} /></div>
          <div className="mdt-sur-c">{complet ? 'Mandat complet · signé et scellé' : 'Votre signature est enregistrée'}</div>
          <h3>{etape === 'fini' ? `Merci ${m.prenom}, c’est fait` : `Vous avez signé le ${dateLongue(signeLe)}`}</h3>
          <p className="mdt-p">{complet
            ? `Le mandat est signé par tous. Chacun en reçoit l’exemplaire complet par e-mail, ${p} comme vous.`
            : 'Votre exemplaire vient de vous être envoyé par e-mail. Vous recevrez la version complète quand tous les signataires auront signé.'}</p>
          <button type="button" className="btn fant mdt-plein" onClick={() => { void telecharger(); }}><Ic n="doc" t={16} /><span>Télécharger le mandat signé</span></button>
          {erreur && <div className="mdt-erreur">{erreur}</div>}
          {peutRenoncer && !renoncer && (
            <button type="button" className="mdt-renoncer" onClick={() => setRenoncer(true)}>{`Renoncer au mandat (possible jusqu’au ${dateLongue(limite!)})`}</button>
          )}
          {renoncer && (
            <div className="mdt-rappel" style={{ textAlign: 'left', width: '100%', maxWidth: 440 }}>
              <Ic n="retour" t={19} />
              <div>
                <b>Renoncer au mandat</b>
                <p>{`Il ne vous engagera plus, sans aucun frais, et vous recevrez un accusé de réception par e-mail. Le mandat continue avec ${p}.`}</p>
                <div className="mdt-sgn-a" style={{ marginTop: 10, padding: 0 }}>
                  <button type="button" className="btn mdt-brique" style={{ marginTop: 0 }} disabled={envoi} onClick={() => { void confirmerRenoncer(); }}>{envoi ? 'Enregistrement…' : 'Confirmer ma renonciation'}</button>
                  <button type="button" className="mdt-relire" onClick={() => setRenoncer(false)}>Garder le mandat</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>,
    );
  }

  const tete = (sur: string) => (
    <div className="mdt-tete">
      <div className="mdt-tete-g">
        {etape !== 'accueil' && (
          <button type="button" className="mdt-rond" aria-label="Retour"
            onClick={() => setEtape(etape === 'lecture' ? retour : etape === 'signer' ? 'coord' : etape === 'coord' ? 'recap' : 'accueil')}>
            <Ic n="chevron" t={16} />
          </button>
        )}
        <span className="mdt-sur">{sur}</span>
      </div>
    </div>
  );
  const pas = etape === 'recap' || etape === 'lecture' ? 1 : etape === 'coord' ? 2 : etape === 'signer' ? 3 : 0;
  const barre = pas > 0 && etape !== 'lecture' ? (
    <div className="mdt-pas" aria-label={`Étape ${pas} sur 3`}>{[1, 2, 3].map(i => <i key={i} data-on={i <= pas ? '1' : undefined} />)}</div>
  ) : null;

  /* ── 0. L'accueil ── */
  if (etape === 'accueil') return cadre(
    <div className="mdt">
      <div className="mdt-corps mdt-accueil">
        <div className="mdt-sceau"><Ic n="plume" t={28} /></div>
        <div className="mdt-invite"><span className="de">{`Bonjour ${m.prenom}`}</span><span className="att">Votre signature est attendue</span></div>
        <h3>{`${p} vous invite à signer votre mandat de recherche`}</h3>
        <p className="mdt-p">{`${nomP} a signé le ${dateLongue(d.premierLe)} le mandat de recherche confié à Alexandre Rogelet, d’Emilio Immobilier, pour votre projet d’achat. ${d.premier.civilite === 'Madame' ? 'Elle' : 'Il'} vous a ${f ? 'indiquée' : 'indiqué'} comme co-acquéreur : le mandat sera complet avec votre signature.`}</p>
        <div className="mdt-puces">
          <span><span className="k"><Ic n="check" t={14} /></span><span><b>Relisez le mandat</b>{` en entier, tel que ${p} l’a signé.`}</span></span>
          <span><span className="k"><Ic n="check" t={14} /></span><span>Vérifiez vos informations, corrigez-les si besoin.</span></span>
          <span><span className="k"><Ic n="check" t={14} /></span><span>{`Signez avec un code reçu par e-mail, quand vous êtes ${f ? 'prête' : 'prêt'}.`}</span></span>
          <span><span className="k"><Ic n="check" t={14} /></span><span>{`${RETRACTATION_JOURS} jours pour changer d’avis, comme ${p}.`}</span></span>
        </div>
        <button type="button" className="btn or mdt-plein" onClick={() => setEtape('recap')}>Commencer · 2 min</button>
        {!decliner && <button type="button" className="mdt-lien fin" onClick={() => setDecliner(true)}>{`Je ne suis pas ${f ? 'concernée' : 'concerné'} par cet achat`}</button>}
        {decliner && (
          <div className="mdt-rappel" style={{ textAlign: 'left', width: '100%', maxWidth: 440 }}>
            <Ic n="info" t={19} />
            <div>
              <b>{`Vous n’êtes pas ${f ? 'concernée' : 'concerné'} ?`}</b>
              <p>{`Vous ne signerez pas ce mandat. ${p} et Alexandre seront prévenus ; le mandat continue avec ${p}.`}</p>
              <div className="mdt-sgn-a" style={{ marginTop: 10, padding: 0 }}>
                <button type="button" className="btn fant" disabled={envoi} onClick={() => { void confirmerDecliner(); }}>{envoi ? 'Envoi…' : 'Confirmer'}</button>
                <button type="button" className="mdt-relire" onClick={() => setDecliner(false)}>Annuler</button>
              </div>
            </div>
          </div>
        )}
        {erreur && <div className="mdt-erreur">{erreur}</div>}
      </div>
    </div>,
  );

  /* ── Le texte complet ── */
  if (etape === 'lecture') return cadre(
    <div className="mdt">
      {tete('Le mandat, en entier')}
      <div className="mdt-corps">
        <p className="mdt-p petit">{'C’est exactement ce texte que vous signez. Vous recevrez le document signé, en PDF, par e-mail.'}</p>
        <TexteMandat parties={parties} identite={d.identite} moi={d.rang + 1} signes={d.signes}
          bandeau={`Signé par ${p} · en attente de votre signature`} />
        <button type="button" className="btn or mdt-plein" onClick={() => setEtape(retour)}>J’ai lu, je reviens</button>
      </div>
    </div>,
  );

  /* ── 1. Le récapitulatif ── */
  if (etape === 'recap') return cadre(
    <div className="mdt">
      {tete('Étape 1 sur 3')}{barre}
      <div className="mdt-corps">
        <h3>Votre recherche, en clair</h3>
        <div className="mdt-lignes">
          {resume.map(r => (
            <div key={r.titre} className="mdt-ligne"><div className="t">{r.titre}</div><div className="v">{r.valeur}</div><div className="d">{r.detail}</div></div>
          ))}
          <div className="mdt-ligne">
            <div className="t">Votre conseiller</div>
            <div className="v">{`${d.identite.signataireNom} · ${d.identite.nom}`}</div>
            <div className="d">{`carte professionnelle ${d.identite.carte}`}</div>
          </div>
          <div className="mdt-ligne">
            <div className="t">Le mandat</div>
            <div className="v">{`Mandat de recherche simple · n° ${d.numero}`}</div>
            <div className="d">{`signé par ${nomP} le ${dateLongue(d.premierLe)}`}</div>
          </div>
        </div>
        <button type="button" className="btn fant mdt-plein" onClick={() => { setRetour('recap'); setEtape('lecture'); }}><Ic n="doc" t={16} /><span>Lire le mandat complet</span></button>
        <button type="button" className="btn or mdt-plein" onClick={() => setEtape('coord')}>Continuer</button>
      </div>
    </div>,
  );

  /* ── 2. Ses informations ── */
  if (etape === 'coord') return cadre(
    <div className="mdt">
      {tete('Étape 2 sur 3')}{barre}
      <div className="mdt-corps">
        <h3>C’est bien vous&nbsp;?</h3>
        <div className="mdt-maj">{`${p} a renseigné ces informations pour vous. Vérifiez-les, et corrigez ce qui ne va pas.`}</div>
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
        <BlocNaissance civilite={m.civilite} val={m.naissanceLieu} onChange={maj('naissanceLieu')} err={champs.naissanceLieu}
          date={<ChampDate lib="Date de naissance" val={m.naissanceDate} onChange={maj('naissanceDate')} err={champs.naissanceDate} />} />
        <BlocAdresse adr={adr} onAdr={changeAdr} champs={champs} />
        {/* V3.43 : le code part à l'adresse qui a reçu ce lien, pas à une
            adresse tapée ici. Une erreur d'adresse se corrige depuis
            l'espace du premier signataire (« Corriger son adresse »). */}
        <Champ lib="E-mail — l’adresse qui a reçu ce lien, votre code arrive ici" val={m.email} onChange={maj('email')} err={champs.email} type="email" mode="email" auto="email" lecture />
        <Champ lib="Téléphone (facultatif)" val={m.telephone} onChange={maj('telephone')} err={champs.telephone} type="tel" mode="tel" auto="tel" />
        {erreur && <div className="mdt-erreur">{erreur}</div>}
        <button type="button" className={'mdt-coche' + (champs.certifie ? ' err' : '')} data-on={certifie ? '1' : undefined}
          onClick={() => { setCertifie(x => !x); setChamps(c => ({ ...c, certifie: '' })); }}>
          <span className="bx">{certifie && <Ic n="check" t={14} />}</span>
          <span>{'Je certifie que les informations que j’ai renseignées sont exactes et complètes, et que c’est bien moi qui signe.'}</span>
        </button>
        {champs.certifie && <div className="mdt-err-l">{champs.certifie}</div>}
        <button type="button" className="btn or mdt-plein" disabled={envoi} onClick={() => { void demanderCode(); }}>{envoi ? 'Envoi du code…' : 'Recevoir mon code par e-mail'}</button>
        <p className="mdt-mention">{'Le code est valable 15 minutes à partir du moment où vous le demandez. Vous pouvez en redemander un à tout moment.'}</p>
      </div>
    </div>,
  );

  /* ── 3. La signature ── */
  const pret = lu && execution !== null && code.length === 6;
  return cadre(
    <div className="mdt">
      {tete('Étape 3 sur 3')}{barre}
      <div className="mdt-corps">
        <h3>Signer le mandat</h3>
        <p className="mdt-p">{titreMandat(d.numero)}</p>
        <div className="mdt-info"><Ic n="horloge" t={16} /><span>{d.execution
          ? `À la demande de ${p}, la recherche a commencé dès sa signature.`
          : `${p} a choisi que la recherche commence à la fin de son délai de rétractation de ${RETRACTATION_JOURS} jours.`}</span></div>
        <button type="button" className="mdt-coche" data-on={lu ? '1' : undefined} onClick={() => setLu(x => !x)}>
          <span className="bx">{lu && <Ic n="check" t={14} />}</span>
          <span>J’ai lu le mandat de recherche et je l’accepte.</span>
        </button>
        <button type="button" className="mdt-relire" onClick={() => { setRetour('signer'); setEtape('lecture'); }}>Le relire</button>
        <div className="mdt-q">Et pour vous, la mission commence…</div>
        <div className="mdt-choix2">
          <button type="button" className="mdt-choix" data-on={execution === true ? '1' : undefined} onClick={() => setExecution(true)}>
            <span className="rd" />
            <span><b>Dès ma signature</b><span className="s">{`Je demande que la mission commence pour moi sans attendre la fin de mon délai de rétractation. Je garde mes ${RETRACTATION_JOURS} jours pour changer d’avis.`}</span></span>
          </button>
          <button type="button" className="mdt-choix" data-on={execution === false ? '1' : undefined} onClick={() => setExecution(false)}>
            <span className="rd" />
            <span><b>{`Dans ${RETRACTATION_JOURS} jours`}</b><span className="s">La mission commencera pour moi à la fin de mon délai de rétractation.</span></span>
          </button>
        </div>
        <div className="mdt-q">Votre code</div>
        <p className="mdt-p petit">{codeDe
          ? `Votre code à 6 chiffres vous a été envoyé à ${emailMasque} à ${heureParis(codeDe)} : saisissez-le ici. Il est valable 15 minutes ; passé ce délai, demandez-en un nouveau.`
          : `Un code à 6 chiffres vient de vous être envoyé à ${emailMasque}. Pensez à regarder dans les indésirables. Vous pouvez quitter cette page pour aller le chercher : elle vous attend.`}</p>
        <input className="mdt-code" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          placeholder="• • • • • •" aria-label="Code à 6 chiffres"
          onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErreur(''); }} />
        <button type="button" className="mdt-relire" disabled={attente > 0} onClick={() => { void renvoyer(); }}>
          {attente > 0 ? `Renvoyer le code (${attente} s)` : 'Renvoyer le code'}
        </button>
        {erreur && <div className="mdt-erreur">{erreur}</div>}
        <button type="button" className="btn or mdt-plein" disabled={!pret || envoi} onClick={() => { setErreur(''); setPad(true); }}>
          <Ic n="plume" t={16} /><span>{envoi ? 'Signature en cours…' : 'Signer le mandat'}</span>
        </button>
        {pad && <PadSignature nom={`${m.prenom} ${m.nom}`.trim()} envoi={envoi} onAnnuler={() => setPad(false)} onValider={png => { void signer(png); }} />}
        <div className="mdt-confiance">
          <span><Ic n="cadenas" t={15} /><span>Code personnel, à usage unique</span></span>
          <span><Ic n="bouclier" t={15} /><span>Document scellé et horodaté</span></span>
          <span><Ic n="retour" t={15} /><span>{`${RETRACTATION_JOURS} jours pour changer d’avis`}</span></span>
        </div>
        <p className="mdt-mention">{`En signant, vous acceptez le mandat de recherche non exclusif, avec ${p}. Vous en recevez un exemplaire par e-mail, et vous pouvez y renoncer pendant ${RETRACTATION_JOURS} jours après votre signature, depuis ce même lien.`}</p>
      </div>
    </div>,
  );
}

/* La page n'est pas dans l'espace : elle apporte ses propres bases (les
   couleurs, la police, les boutons), les mêmes que celles de l'espace. */
export const CSS_SIGNER = `
html, body{ height:auto !important; min-height:100% !important; overflow-x:hidden !important; overflow-y:auto !important }
:root{
  --encre:#1a2332; --encre2:#2a3a52; --or:#c9a84c; --or-fonce:#a9822f;
  --fond:#f4f6fa; --carte:#fff; --trait:#e3e8f0; --trait-fort:#cfd7e3;
  --plume:#64748b; --plume-clair:#98a4b6;
  --vert:#15803d; --vert-fond:#f0fdf4; --vert-trait:#bbf7d0;
  --brique:#dc2626; --brique-fond:#fef2f2; --brique-trait:#fecaca;
  --or-fond:#fdfaf1; --or-trait:#ecdcb4;
  --ombre:0 1px 2px rgba(16,24,40,.04), 0 10px 26px -20px rgba(16,24,40,.3);
  --ombre-f:0 2px 4px rgba(16,24,40,.05), 0 20px 44px -24px rgba(16,24,40,.5);
}
*{box-sizing:border-box}
body{margin:0; background:var(--fond); color:var(--encre);
  font-family:'DM Sans','Plus Jakarta Sans',system-ui,-apple-system,sans-serif; font-size:15px; line-height:1.55; -webkit-font-smoothing:antialiased}
h1,h2,h3,h4{font-family:'Plus Jakarta Sans',system-ui,sans-serif; letter-spacing:-.4px}
button{font-family:inherit; cursor:pointer; color:inherit; border:none; background:none}
:focus-visible{outline:2px solid var(--or); outline-offset:2px; border-radius:8px}
.btn{display:inline-flex; align-items:center; justify-content:center; gap:8px; border-radius:14px;
  padding:15px 20px; font-family:'Plus Jakarta Sans',sans-serif; font-size:14.5px; font-weight:800;
  border:1px solid transparent; width:100%; text-decoration:none}
.btn.or{background:var(--or); color:#fff; box-shadow:0 12px 24px -12px var(--or)}
.btn.fant{background:var(--carte); color:var(--encre); border-color:var(--trait-fort)}
.sgn-page{min-height:100vh; background:var(--fond)}
.sgn-band{display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 18px; background:var(--encre)}
.sgn-band .m{font-family:'Plus Jakarta Sans',sans-serif; font-size:11px; font-weight:800; letter-spacing:2.2px; color:var(--or); white-space:nowrap}
.sgn-band .n{font-size:9.5px; letter-spacing:1.3px; color:rgba(255,255,255,.55); text-transform:uppercase; font-weight:700; text-align:right; white-space:nowrap}
.sgn-f{background:var(--carte); min-height:calc(100vh - 46px); padding-bottom:24px}
.mdt-invite{display:flex; flex-direction:column; align-items:center; gap:2px; margin:2px auto 0}
.mdt-invite .de{font-size:12.5px; color:var(--plume); font-weight:600}
.mdt-invite .att{margin-top:6px; display:inline-flex; padding:4px 11px; border-radius:99px; background:var(--or-fond); border:1px solid var(--or-trait);
  color:var(--or-fonce); font-size:10.5px; letter-spacing:1.1px; text-transform:uppercase; font-weight:800}
@media(min-width:640px){
  .sgn-f{width:min(780px, 94vw); margin:28px auto 40px; border-radius:24px; min-height:0; box-shadow:var(--ombre-f); overflow:hidden}
}
`;
