'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { modele, demandeExpresse } from '@/lib/actes';
import { IDENTITE_DEFAUT } from '@/lib/agence';
import { heureParis, masquerEmail } from '@/lib/mandat';
import { TexteMandat, PadSignature, CSS_MANDAT, RappelSignataire } from '@/components/espace/SignatureMandat';
import { Croix, Ic } from './ApercuActe';
import { appelSignature, lireSignataires, nomSignataire, type DocumentRow, type SignataireRow } from './outils';

/* ═══ Signer sur place ══════════════════════════════════════════════════════
   L'écran d'Alexandre (ordinateur, tablette, téléphone pour un bon de
   visite) passe en mode signature : chacun son tour relit l'essentiel,
   reçoit un code sur SA propre adresse e-mail, coche la case et signe au
   doigt dans un grand cadre. Quand plus personne n'est attendu, la
   finalisation se déroule sous ses yeux, étape par étape — chaque étape est
   un vrai appel au serveur (vérifier, assembler, sceller, envoyer, ranger),
   rythmé pour qu'on ait le temps de la lire (une quinzaine de secondes en
   tout). Puis « Signature finalisée ».

   Le texte est dans des chaînes (AGENTS.md §2.1). Les styles sont ceux de la
   page de signature en ligne, rangés sous .sp pour ne rien changer au CRM. */

type Ecran = 'accueil' | 'resume' | 'lecture' | 'email' | 'signer' | 'merci' | 'finalisation' | 'fini';
type Etape = { cle: 'verifier' | 'assembler' | 'sceller' | 'envoyer' | 'classer'; t: string; en: string };
const ETAPES: Etape[] = [
  { cle: 'verifier', t: 'Vérification des signatures et des codes', en: 'Chaque signature est rapprochée de son code à usage unique…' },
  { cle: 'assembler', t: 'Assemblage du document signé', en: 'Les signatures tracées prennent place dans leurs cadres…' },
  { cle: 'sceller', t: 'Scellement et certificat de signature', en: 'Calcul de l’empreinte, rédaction du certificat…' },
  { cle: 'envoyer', t: 'Envoi des exemplaires par e-mail', en: 'Chaque signataire reçoit le sien, avec le certificat…' },
  { cle: 'classer', t: 'Classement dans le dossier', en: 'Le document signé rejoint le dossier du client…' },
];
const PAS_MIN = 3200;
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function SignatureSurPlace({ doc, onFermer, finaliser = false }: {
  doc: DocumentRow;
  onFermer: (maj?: Partial<DocumentRow>) => void;
  /* Tout le monde a déjà signé : on va droit à la finalisation. */
  finaliser?: boolean;
}) {
  const m = modele(doc.modele)!;
  const d = doc.donnees;
  const identite = doc.identite || IDENTITE_DEFAUT;
  const parties = useMemo(() => m.rediger(d, identite), [m, d, identite]);
  const resume = useMemo(() => m.resume(d), [m, d]);
  /* V3.145 : le rappel pour celui qui signe (pas l'agence) : une offre, son total frais d'agence compris. */
  const rappel = useMemo(() => (m.rappel ? m.rappel(d) : null), [m, d]);
  const accepterDe = (cle: string) => (m.accepter ? m.accepter(d, cle) : 'J’ai lu le document en entier et je l’accepte.');
  const [sigs, setSigs] = useState<SignataireRow[] | null>(null);
  const [ecran, setEcran] = useState<Ecran>(finaliser ? 'finalisation' : 'accueil');
  const [courant, setCourant] = useState<string>('');
  const [email, setEmail] = useState('');
  const [emailMasque, setEmailMasque] = useState('');
  const [codeDe, setCodeDe] = useState('');
  const [code, setCode] = useState('');
  const [lu, setLu] = useState(false);
  const [expres, setExpres] = useState(false);
  const [pad, setPad] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [attente, setAttente] = useState(0);
  const [erreur, setErreur] = useState('');
  const [avancement, setAvancement] = useState<{ fait: number; details: string[]; erreur: string }>({ fait: 0, details: [], erreur: '' });
  const [fin, setFin] = useState<{ espace: boolean; a: string[] } | null>(null);
  const haut = useRef<HTMLDivElement>(null);
  const lance = useRef(false);

  useEffect(() => {
    lireSignataires(doc.id).then(setSigs).catch(e => setErreur('Les signataires n’ont pas pu être lus : ' + (e as Error).message));
  }, [doc.id]);
  useEffect(() => { haut.current?.scrollTo({ top: 0 }); }, [ecran, courant]);
  useEffect(() => {
    if (attente <= 0) return;
    const t = setTimeout(() => setAttente(a => a - 1), 1000);
    return () => clearTimeout(t);
  }, [attente]);
  /* Le fond ne défile pas sous l'écran de signature. */
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = avant; };
  }, []);

  const s = sigs?.find(x => x.id === courant) || null;
  const aSigner = (sigs || []).filter(x => x.statut === 'attendu');
  const enLigne = (sigs || []).filter(x => x.statut === 'invite');
  const etats = useMemo(() => {
    const o: Record<string, string | null> = {};
    for (const x of sigs || []) o[x.cle] = x.statut === 'signe' ? x.signe_le : null;
    if (doc.signature?.agence_le) o.agence = doc.signature.agence_le;
    return o;
  }, [sigs, doc.signature]);
  const prenom = s ? (s.personne.prenom || nomSignataire(s)) : '';

  function commencer(x: SignataireRow) {
    setCourant(x.id); setEmail(x.personne.email); setEmailMasque(''); setCodeDe(''); setCode(''); setLu(false); setExpres(false); setErreur('');
    setEcran('resume');
  }
  async function demanderCode() {
    if (!s) return;
    setEnvoi(true); setErreur('');
    try {
      const r = await appelSignature<{ email: string; signataire: SignataireRow }>({ action: 'code', id: doc.id, sig: s.id, email: email.trim() });
      setSigs(l => (l || []).map(x => (x.id === s.id ? { ...x, personne: { ...x.personne, email: r.signataire.personne.email } } : x)));
      setEmailMasque(r.email); setCodeDe(new Date().toISOString()); setCode(''); setAttente(45); setEcran('signer');
    } catch (e) { setErreur((e as Error).message); }
    setEnvoi(false);
  }
  async function signer(griffe: string) {
    if (!s) return;
    setEnvoi(true); setErreur('');
    try {
      const [r] = await Promise.all([
        appelSignature<{ signeLe: string; restants: { id: string; nom: string; mode: string }[] }>({ action: 'signer', id: doc.id, sig: s.id, code, griffe, accepte: true, demande: expres }),
        pause(1400),
      ]);
      setSigs(l => (l || []).map(x => (x.id === s.id ? { ...x, statut: 'signe', signe_le: r.signeLe } : x)));
      setPad(false); setEnvoi(false);
      setEcran(r.restants.length ? 'merci' : 'finalisation');
    } catch (e) {
      setPad(false); setEnvoi(false);
      setErreur((e as Error).message);
    }
  }
  async function plusTard(x: SignataireRow) {
    if (!confirm(`${nomSignataire(x)} signera plus tard ?\n\nSon lien personnel part à ${x.personne.email} : il signera de chez lui, avec son code. Le document sera finalisé à sa signature.`)) return;
    setEnvoi(true); setErreur('');
    try {
      await appelSignature({ action: 'renvoyer', id: doc.id, sig: x.id });
      const l = (sigs || []).map(y => (y.id === x.id ? { ...y, statut: 'invite' as const, mode: 'en_ligne' as const } : y));
      setSigs(l);
      if (!l.some(y => y.statut === 'attendu')) setEcran(l.some(y => y.statut === 'invite') ? 'accueil' : 'finalisation');
    } catch (e) { setErreur((e as Error).message); }
    setEnvoi(false);
  }

  /* ── La finalisation, étape par étape ── */
  async function derouler(depuis = 0) {
    const details: string[] = avancement.details.slice(0, depuis);
    setAvancement({ fait: depuis, details: [...details], erreur: '' });
    let espace = false, a: string[] = [];
    for (let i = depuis; i < ETAPES.length; i++) {
      const e = ETAPES[i];
      const debut = Date.now();
      try {
        const r = await appelSignature<Record<string, unknown>>({ action: 'finaliser', id: doc.id, etape: e.cle });
        const n = Number(r.n || 0), pages = Number(r.pages || 0), emp = String(r.empreinte || '');
        const detail = e.cle === 'verifier' ? (r.deja ? 'Déjà vérifié' : `${n} signature${n > 1 ? 's' : ''}, chacune avec son code à usage unique`)
          : e.cle === 'assembler' ? (r.deja ? 'Déjà assemblé' : `${pages} pages, avec les signatures tracées`)
          : e.cle === 'sceller' ? (emp ? `Empreinte SHA-256 · ${emp.slice(0, 10)}…${emp.slice(-6)}` : 'Scellé')
          : e.cle === 'envoyer' ? (Array.isArray(r.a) && r.a.length ? `À ${(r.a as string[]).map(masquerEmail).join(', ')}` : 'Exemplaires envoyés')
          : r.recherche ? 'Rangé dans Documents ; sa recherche est à jour' : 'Rangé dans Documents';
        if (e.cle === 'classer') espace = !!r.espace;
        if (e.cle === 'envoyer' && Array.isArray(r.a)) a = r.a as string[];
        details.push(detail);
        await pause(Math.max(0, PAS_MIN - (Date.now() - debut)));
        setAvancement({ fait: i + 1, details: [...details], erreur: '' });
      } catch (x) {
        setAvancement(av => ({ ...av, fait: i, erreur: (x as Error).message }));
        return;
      }
    }
    await pause(900);
    setFin({ espace, a });
    setEcran('fini');
  }
  useEffect(() => {
    if (ecran === 'finalisation' && !lance.current && sigs) { lance.current = true; void derouler(0); }
  }, [ecran, sigs]); // eslint-disable-line react-hooks/exhaustive-deps

  function quitter() {
    if (ecran === 'finalisation' && avancement.fait < ETAPES.length && !avancement.erreur) return;
    const enCours = ecran === 'email' || ecran === 'signer';
    if (enCours && !confirm('Quitter l’écran de signature ?\n\nLes signatures déjà faites sont gardées ; tu pourras reprendre depuis la fiche du document.')) return;
    onFermer(ecran === 'fini' ? { statut: 'signe' } : undefined);
  }

  const bande = (
    <div className="sp-band">
      <span className="m">EMILIO IMMOBILIER</span>
      <span className="n">{ecran === 'fini' ? 'Signature finalisée' : 'Signature sur place'}</span>
      {!(ecran === 'finalisation' && !avancement.erreur) && (
        <button type="button" className="sp-quitter" onClick={quitter} aria-label="Quitter"><Croix t={15} /><span>{ecran === 'fini' ? 'Terminer' : 'Quitter'}</span></button>
      )}
    </div>
  );
  const page = (contenu: React.ReactNode, large = false) => (
    <div className="sp" role="dialog" aria-modal="true" aria-label="Signature sur place">
      <style>{CSS_SP + CSS_MANDAT}</style>
      {bande}
      <div className="sp-defile" ref={haut}>
        <div className={'sp-carte' + (large ? ' large' : '')}>{contenu}</div>
      </div>
    </div>
  );

  if (!sigs) return page(<div className="mdt-corps"><p className="mdt-p">{erreur || 'Chargement…'}</p></div>);
  /* Un écran propre à un signataire, sans signataire choisi : l'accueil. */
  const vue: Ecran = !s && ecran !== 'finalisation' && ecran !== 'fini' ? 'accueil' : ecran;

  /* ── L'accueil : qui signe, qui a signé ── */
  if (vue === 'accueil') {
    const prochain = aSigner[0];
    return page(
      <div className="mdt-corps">
        <div className="sp-titre">
          <span className="sp-sceau"><Ic n="tablette" t={26} /></span>
          <div>
            <h2>Signature sur place</h2>
            <p>{m.entete(d)}</p>
          </div>
        </div>
        <p className="mdt-p">{'Chacun signe à son tour sur cet écran : il relit l’essentiel, reçoit un code sur sa propre adresse e-mail, coche la case, puis signe au doigt.'}</p>
        <div className="sp-qui">
          {sigs.map(x => (
            <div key={x.id} className="sp-sig" data-etat={x.statut}>
              <span className="pt"><Ic n={x.statut === 'signe' ? 'check' : x.statut === 'invite' ? 'mail' : 'plume'} t={16} e={x.statut === 'signe' ? 3 : 1.9} /></span>
              <span className="tx">
                <b>{nomSignataire(x)}</b>
                <i>{x.statut === 'signe' ? `${x.role} · a signé à ${heureParis(x.signe_le!)}` : x.statut === 'invite' ? `${x.role} · signera avec son lien, reçu par e-mail` : x.role}</i>
              </span>
              {x.statut === 'attendu' && <button type="button" className="btn fant sp-petit" onClick={() => commencer(x)}>C’est moi</button>}
            </div>
          ))}
        </div>
        {erreur && <div className="mdt-erreur">{erreur}</div>}
        {prochain
          ? <button type="button" className="btn or mdt-plein" onClick={() => commencer(prochain)}>{`Commencer : ${nomSignataire(prochain)}`}</button>
          : enLigne.length
            ? <p className="mdt-p petit">{`On attend la signature en ligne de ${enLigne.map(nomSignataire).join(' et ')}. Le document sera finalisé tout seul à sa signature.`}</p>
            : <button type="button" className="btn or mdt-plein" onClick={() => setEcran('finalisation')}>Finaliser la signature</button>}
      </div>,
    );
  }

  /* ── À vous : l'essentiel ── */
  if (vue === 'resume' && s) return page(
    <div className="mdt-corps">
      <div className="mdt-invite"><span className="de">{s.role}</span><span className="att">{`À vous, ${prenom}`}</span></div>
      <h3>{`Relisez l’essentiel, ${prenom}`}</h3>
      <div className="mdt-lignes">
        {resume.map(r => (
          <div key={r.titre} className="mdt-ligne"><div className="t">{r.titre}</div><div className="v">{r.valeur}</div>{r.detail && r.detail !== '—' && <div className="d">{r.detail}</div>}</div>
        ))}
      </div>
      {s.cle !== 'agence' && <RappelSignataire r={rappel} />}
      <button type="button" className="btn fant mdt-plein" onClick={() => setEcran('lecture')}><Ic n="doc" t={16} /><span>Lire le document en entier</span></button>
      <button type="button" className="btn or mdt-plein" onClick={() => setEcran('email')}>Continuer</button>
      <button type="button" className="mdt-relire" onClick={() => setEcran('accueil')}>Ce n’est pas moi</button>
    </div>,
  );

  if (vue === 'lecture' && s) return page(
    <div className="mdt-corps">
      <p className="mdt-p petit">{'C’est exactement ce texte que vous signez. Vous en recevrez un exemplaire signé par e-mail.'}</p>
      <TexteMandat parties={parties} identite={identite} cadres={{ etats, moi: s.cle }} bandeau={`${m.titre} · en attente de votre signature`} />
      <button type="button" className="btn or mdt-plein" onClick={() => setEcran('resume')}>J’ai lu, je reviens</button>
    </div>, true,
  );

  /* ── Son adresse, son code ── */
  if (vue === 'email' && s) return page(
    <div className="mdt-corps">
      <div className="mdt-invite"><span className="de">{s.role}</span><span className="att">{`À vous, ${prenom}`}</span></div>
      <h3>Votre code de signature</h3>
      <p className="mdt-p">{'Un code à 6 chiffres part sur votre adresse e-mail. Vérifiez-la : c’est elle qui vous identifie, et vous y recevrez votre exemplaire signé.'}</p>
      <label className="mdt-ch">
        <span className="l">Votre adresse e-mail</span>
        <input type="email" inputMode="email" autoComplete="off" value={email} onChange={e => { setEmail(e.target.value); setErreur(''); }} />
      </label>
      {erreur && <div className="mdt-erreur">{erreur}</div>}
      <button type="button" className="btn or mdt-plein" disabled={envoi} onClick={() => { void demanderCode(); }}>{envoi ? 'Envoi du code…' : 'Recevoir mon code'}</button>
      <button type="button" className="mdt-relire" disabled={envoi} onClick={() => { void plusTard(s); }}>{`${prenom} signera plus tard, avec son lien`}</button>
    </div>,
  );

  if (vue === 'signer' && s) {
    const expresse = demandeExpresse(m, d, s.cle);
    const pret = lu && (!expresse || expres) && code.length === 6;
    return page(
      <div className="mdt-corps">
        <div className="mdt-invite"><span className="de">{s.role}</span><span className="att">{`À vous, ${prenom}`}</span></div>
        <h3>{`Signer : ${m.titre.toLowerCase()}`}</h3>
        <button type="button" className="mdt-coche" data-on={lu ? '1' : undefined} onClick={() => setLu(x => !x)}>
          <span className="bx">{lu && <Ic n="check" t={14} e={3} />}</span>
          <span>{accepterDe(s.cle)}</span>
        </button>
        {expresse && (
          <>
            <button type="button" className="mdt-coche" data-on={expres ? '1' : undefined} onClick={() => setExpres(x => !x)}>
              <span className="bx">{expres && <Ic n="check" t={14} e={3} />}</span>
              <span>{expresse}</span>
            </button>
            <p className="mdt-p petit">{'Vous préférez que la mission attende la fin des 14 jours ? Ne signez pas : dites-le à Alexandre, il modifiera ce point du document.'}</p>
          </>
        )}
        <div className="mdt-q">Votre code</div>
        <p className="mdt-p petit">{`Envoyé à ${emailMasque} à ${heureParis(codeDe || new Date())}. Ouvrez votre messagerie sur votre téléphone ; pensez aux indésirables. Il est valable 15 minutes.`}</p>
        <input className="mdt-code" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          placeholder="• • • • • •" aria-label="Code à 6 chiffres"
          onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErreur(''); }} />
        <button type="button" className="mdt-relire" disabled={attente > 0 || envoi} onClick={() => { void demanderCode(); }}>
          {attente > 0 ? `Renvoyer le code (${attente} s)` : 'Renvoyer le code'}
        </button>
        {erreur && <div className="mdt-erreur">{erreur}</div>}
        <button type="button" className="btn or mdt-plein" disabled={!pret || envoi} onClick={() => { setErreur(''); setPad(true); }}>
          <Ic n="plume" t={16} /><span>Signer</span>
        </button>
        {pad && <PadSignature nom={nomSignataire(s)} envoi={envoi} onAnnuler={() => setPad(false)} onValider={png => { void signer(png); }} />}
      </div>,
    );
  }

  /* ── Merci, au suivant ── */
  if (vue === 'merci' && s) {
    const suivant = aSigner[0];
    return page(
      <div className="mdt-corps mdt-fini">
        <div className="mdt-ok"><Ic n="check" t={34} e={3} /></div>
        <h3>{`Merci ${prenom}, c’est signé`}</h3>
        <p className="mdt-p">{suivant
          ? `Votre signature est enregistrée. Passez maintenant l’écran à ${nomSignataire(suivant)}.`
          : `Votre signature est enregistrée. On attend encore la signature en ligne de ${enLigne.map(nomSignataire).join(' et ')}.`}</p>
        {suivant && <button type="button" className="btn or mdt-plein" onClick={() => commencer(suivant)}>{`C’est ${suivant.personne.prenom || nomSignataire(suivant)}`}</button>}
        {suivant && <button type="button" className="mdt-relire" disabled={envoi} onClick={() => { void plusTard(suivant); }}>{`${suivant.personne.prenom || nomSignataire(suivant)} signera plus tard, avec son lien`}</button>}
        {!suivant && <button type="button" className="btn fant mdt-plein" onClick={() => onFermer()}>Revenir au CRM</button>}
        {erreur && <div className="mdt-erreur">{erreur}</div>}
      </div>,
    );
  }

  /* ── La finalisation, sous ses yeux ── */
  if (vue === 'finalisation') {
    const pc = Math.round((avancement.fait / ETAPES.length) * 100);
    return page(
      <div className="mdt-corps">
        <div className="sp-titre">
          <span className="sp-sceau tourne"><Ic n="bouclier" t={26} /></span>
          <div>
            <h2>Finalisation</h2>
            <p>{m.entete(d)}</p>
          </div>
        </div>
        <div className="sp-barre" aria-label={`${pc} %`}><i style={{ width: `${Math.max(4, pc)}%` }} /></div>
        <ol className="sp-etapes">
          {ETAPES.map((e, i) => {
            const etat = i < avancement.fait ? 'fait' : i === avancement.fait ? (avancement.erreur ? 'erreur' : 'encours') : 'attente';
            return (
              <li key={e.cle} data-etat={etat}>
                <span className="pt">{etat === 'fait' ? <Ic n="check" t={15} e={3} /> : etat === 'encours' ? <span className="rond" /> : etat === 'erreur' ? <Croix t={13} /> : <span className="n">{i + 1}</span>}</span>
                <span className="tx">
                  <b>{e.t}</b>
                  <i>{etat === 'fait' ? avancement.details[i] : etat === 'encours' ? e.en : etat === 'erreur' ? avancement.erreur : ''}</i>
                </span>
              </li>
            );
          })}
        </ol>
        {avancement.erreur && (
          <>
            <button type="button" className="btn or mdt-plein" onClick={() => { void derouler(avancement.fait); }}>Réessayer</button>
            <button type="button" className="mdt-relire" onClick={() => onFermer()}>Revenir au CRM (les signatures sont gardées)</button>
          </>
        )}
      </div>,
    );
  }

  /* ── C'est fini ── */
  return page(
    <div className="mdt-corps mdt-fini">
      <div className="mdt-ok"><Ic n="check" t={34} e={3} /></div>
      <div className="mdt-sur-c">Signé par tous · scellé</div>
      <h3>Signature finalisée</h3>
      <p className="mdt-p">{'Tout le monde a signé. Chacun reçoit son exemplaire par e-mail, avec son certificat de signature.'}</p>
      {fin?.espace && <p className="mdt-p">{'Vous retrouverez aussi votre exemplaire dans votre espace Emilio, avec vos autres documents.'}</p>}
      <div className="mdt-confiance">
        <span><Ic n="cadenas" t={15} /><span>Un code par signataire</span></span>
        <span><Ic n="bouclier" t={15} /><span>Document scellé et horodaté</span></span>
        <span><Ic n="mail" t={15} /><span>Un exemplaire à chacun</span></span>
      </div>
      <button type="button" className="btn or mdt-plein" onClick={() => onFermer({ statut: 'signe' })}>Terminer</button>
    </div>,
  );
}

/* Les styles de la page de signature en ligne, rangés sous .sp : rien ne
   déborde sur le CRM. */
const CSS_SP = `
.sp{position:fixed; inset:0; z-index:960; display:flex; flex-direction:column; background:#eef1f6;
  --encre:#2e4166; --or:#c9a84c; --or-fonce:#a9822f; --fond:#f4f6fa; --carte:#fff; --trait:#e3e8f0; --trait-fort:#cfd7e3;
  --plume:#64748b; --plume-clair:#98a4b6; --vert:#15803d; --vert-fond:#f0fdf4; --vert-trait:#bbf7d0;
  --brique:#dc2626; --brique-fond:#fef2f2; --brique-trait:#fecaca; --or-fond:#fdfaf1; --or-trait:#ecdcb4;
  --ombre:0 1px 2px rgba(16,24,40,.04), 0 10px 26px -20px rgba(16,24,40,.3);
  font-family:'DM Sans','Plus Jakarta Sans',system-ui,-apple-system,sans-serif; font-size:15px; line-height:1.55; color:var(--encre); -webkit-font-smoothing:antialiased}
.sp *{box-sizing:border-box}
.sp h2,.sp h3{font-family:'Plus Jakarta Sans',system-ui,sans-serif; letter-spacing:-.4px}
.sp button{font-family:inherit; cursor:pointer; color:inherit; border:none; background:none}
.sp .btn{display:inline-flex; align-items:center; justify-content:center; gap:8px; border-radius:14px; padding:16px 20px;
  font-family:'Plus Jakarta Sans',sans-serif; font-size:15px; font-weight:800; border:1px solid transparent; width:100%; text-decoration:none}
.sp .btn.or{background:var(--or); color:#fff; box-shadow:0 12px 24px -12px var(--or)}
.sp .btn.or:disabled{opacity:.5; box-shadow:none}
.sp .btn.fant{background:var(--carte); color:var(--encre); border-color:var(--trait-fort)}
.sp .btn.sp-petit{width:auto; padding:9px 14px; font-size:13px; border-radius:11px; flex:0 0 auto}
.sp .mdt-relire{color:var(--or-fonce)}
.sp .mdt-relire:disabled{color:var(--plume-clair)}
.sp .mdt-fini .mdt-relire{align-self:center}
.sp .mdt-invite{display:flex; flex-direction:column; align-items:center; gap:2px; margin:2px auto 0}
.sp .mdt-invite .de{font-size:12.5px; color:var(--plume); font-weight:600}
.sp .mdt-invite .att{margin-top:6px; display:inline-flex; padding:4px 11px; border-radius:99px; background:var(--or-fond); border:1px solid var(--or-trait);
  color:var(--or-fonce); font-size:10.5px; letter-spacing:1.1px; text-transform:uppercase; font-weight:800}
.sp-band{display:flex; align-items:center; gap:12px; padding:12px 16px; background:linear-gradient(152deg,#3a5178 0%,#2e4166 100%); flex:0 0 auto}
.sp-band .m{font-family:'Plus Jakarta Sans',sans-serif; font-size:11px; font-weight:800; letter-spacing:2.2px; color:var(--or); white-space:nowrap}
.sp-band .n{font-size:10px; letter-spacing:1.3px; color:rgba(255,255,255,.6); text-transform:uppercase; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.sp-quitter{margin-left:auto; display:inline-flex; align-items:center; gap:6px; padding:7px 11px; border-radius:10px; border:1px solid rgba(255,255,255,.22) !important; color:#fff !important; font-size:12.5px; font-weight:700}
.sp-defile{flex:1 1 auto; overflow-y:auto; -webkit-overflow-scrolling:touch}
.sp-carte{background:var(--carte); min-height:100%}
@media(min-width:640px){ .sp-carte{width:min(640px,94vw); margin:28px auto 40px; border-radius:24px; min-height:0; box-shadow:0 2px 4px rgba(16,24,40,.05), 0 20px 44px -24px rgba(16,24,40,.5)} .sp-carte.large{width:min(820px,94vw)} }
.sp-titre{display:flex; gap:14px; align-items:center}
.sp-titre h2{margin:0; font-size:23px; color:#2e4166}
.sp-titre p{margin:2px 0 0; font-size:13.5px; color:var(--plume)}
.sp-sceau{flex:0 0 auto; width:54px; height:54px; border-radius:16px; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(152deg,#3a5178 0%,#2e4166 100%); color:var(--or); box-shadow:0 12px 24px -14px #2e4166}
.sp-sceau.tourne svg{animation:sp-pulse 1.6s ease-in-out infinite}
@keyframes sp-pulse{0%,100%{transform:scale(1)} 50%{transform:scale(.88)}}
.sp-qui{display:flex; flex-direction:column; gap:8px}
.sp-sig{display:flex; align-items:center; gap:12px; padding:13px 14px; border-radius:16px; border:1px solid var(--trait); background:var(--fond)}
.sp-sig .pt{flex:0 0 auto; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--or-fond); color:var(--or-fonce); border:1px solid var(--or-trait)}
.sp-sig[data-etat="signe"] .pt{background:var(--vert-fond); color:var(--vert); border-color:var(--vert-trait)}
.sp-sig .tx{flex:1 1 auto; min-width:0; display:flex; flex-direction:column}
.sp-sig .tx b{font-size:15px; color:#2e4166}
.sp-sig .tx i{font-style:normal; font-size:12.5px; color:var(--plume)}
.sp-barre{height:8px; border-radius:99px; background:var(--fond); border:1px solid var(--trait); overflow:hidden}
.sp-barre i{display:block; height:100%; border-radius:99px; background:linear-gradient(90deg,#c9a84c,#e8c96a); transition:width .8s ease}
.sp-etapes{list-style:none; margin:4px 0 0; padding:0; display:flex; flex-direction:column; gap:4px}
.sp-etapes li{display:flex; gap:13px; align-items:flex-start; padding:11px 4px; border-bottom:1px dashed var(--trait)}
.sp-etapes li:last-child{border-bottom:none}
.sp-etapes .pt{flex:0 0 auto; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--fond); color:var(--plume-clair); border:1px solid var(--trait); font-size:12.5px; font-weight:800}
.sp-etapes li[data-etat="fait"] .pt{background:var(--vert-fond); color:var(--vert); border-color:var(--vert-trait)}
.sp-etapes li[data-etat="encours"] .pt{background:var(--or-fond); border-color:var(--or-trait)}
.sp-etapes li[data-etat="erreur"] .pt{background:var(--brique-fond); color:var(--brique); border-color:var(--brique-trait)}
.sp-etapes .rond{width:15px; height:15px; border-radius:50%; border:2.5px solid var(--or-trait); border-top-color:var(--or); animation:sp-tour .8s linear infinite}
@keyframes sp-tour{to{transform:rotate(360deg)}}
.sp-etapes .tx{display:flex; flex-direction:column; gap:1px; min-width:0; padding-top:4px}
.sp-etapes .tx b{font-size:14.5px; color:var(--plume-clair); font-weight:700}
.sp-etapes li[data-etat="fait"] .tx b, .sp-etapes li[data-etat="encours"] .tx b{color:#2e4166}
.sp-etapes .tx i{font-style:normal; font-size:12.5px; color:var(--plume); overflow-wrap:anywhere}
.sp-etapes li[data-etat="erreur"] .tx i{color:var(--brique)}
.sp .mdt-pad-in{max-width:880px}
.sp .mdt-pad-zone{height:clamp(240px, 46vh, 440px)}
`;
