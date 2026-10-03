'use client';

/* ══ Signer un document de la rubrique Documents (/signer/<jeton>) ═════════

   Un vendeur, un acquéreur, un conjoint : Alexandre lui a envoyé un
   document à signer en ligne (mandat de vente, avenant, offre d'achat…).
   Pas d'espace, pas de compte : ce lien est sa porte, et il ne montre que
   ce document.

     accueil → l'essentiel (1/2) → son code et sa signature (2/2) → c'est fait

   Les pièces viennent de SignatureMandat.tsx (le texte, la signature au
   doigt, les styles) : ce qu'il lit est ce que le PDF imprimera.

   ⚠️ AGENTS.md §2.1 : pas de texte JSX qui commence par une espace et passe
   à la ligne. Ici, les phrases sont sur une ligne ou dans une chaîne.
   ════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { dateLongue, heureParis, type Partie, type Resume } from '@/lib/mandat';
import type { IdentiteAgence } from '@/lib/agence';
import { Ic, TexteMandat, PadSignature, ERREURS, CSS_MANDAT } from '@/components/espace/SignatureMandat';
import { CSS_SIGNER } from './SignatureCosignataire';

export type DonneesSignerDoc = {
  jeton: string;
  /* V3.50 : « offre_expiree » (une offre d'achat passée sa date de
     validité), « indisponible » (la page n'a pas pu tout lire). */
  etat: 'invite' | 'expire' | 'signe' | 'annule' | 'fin' | 'introuvable' | 'offre_expiree' | 'indisponible' | 'termine';
  /* « Avenant n° 1 au mandat n° 4412 » (en-tête), « l’avenant n° 1 au mandat
     de recherche n° 4412 » (dans les phrases), « de l’avenant… » / « du
     mandat… » (V3.56 : « la signature du mandat », jamais « de le mandat »),
     « l’avenant ». Un lien qui ne sert plus ne reçoit que le genre du
     document (« le mandat de recherche »), sans en-tête. */
  entete: string; le: string; du: string; court: string;
  moi: { prenom: string; nom: string; email: string };
  role: string;
  /* Les autres signataires : où ils en sont. */
  autres: { nom: string; signe: boolean }[];
  parties: Partie[];
  cadres: { etats: Record<string, string | null>; moi: string };
  resume: Resume;
  accepter: string;
  /* Commencer sans attendre les 14 jours : la case à part qu'il coche
     lui-même (article L221-25). Null : rien à demander. */
  expresse: string | null;
  identite: IdentiteAgence;
  code: { le: string; email: string } | null;
  signeLe: string | null;
  complet: boolean;
  expire: string | null;
  /* Le document ouvre 14 jours de rétractation (un mandat signé hors de
     l'agence ou à distance ; jamais un avenant, une offre, un bon de visite). */
  retractation: boolean;
  tel: string;
  /* Son espace acheteur, quand c'est le client du document (V3.32). */
  espace?: string | null;
  /* La fin de validité d'une offre d'achat passée (V3.50). */
  finValidite?: string | null;
  /* V3.57, « termine » : signé par lui, puis le document a pris fin — le
     jour où il a pris fin (renonciation, annulation), et si c'est un mandat. */
  finLe?: string | null;
  mandat?: boolean;
};

type Reponse = Record<string, unknown> & { ok?: boolean; error?: string };
const ERR: Record<string, string> = {
  ...ERREURS, demande: 'Cochez aussi la case « Je demande que l’Agence commence… » pour signer.',
  lecture: 'Votre signature n’a pas pu être vérifiée pour l’instant. Réessayez dans un instant.',
  deja: 'Vous avez déjà signé ce document : rechargez la page.',
};
const Maj = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/* « Claire », « Claire et Marc », « Claire, Marc et Léa » (V3.57). */
const enListe = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}` : l[0] || '');

export default function SignatureDocument({ d }: { d: DonneesSignerDoc }) {
  const envoyer = async (etape: string, corps: Record<string, unknown> = {}): Promise<Reponse | null> => {
    try {
      const r = await fetch('/api/signer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jeton: d.jeton, etape, ...corps }) });
      return await r.json();
    } catch { return null; }
  };
  const [etat, setEtat] = useState(d.etat);
  const [etape, setEtape] = useState<'accueil' | 'recap' | 'lecture' | 'signer' | 'fini'>(d.code ? 'signer' : 'accueil');
  const [retour, setRetour] = useState<'recap' | 'signer'>('recap');
  const [lu, setLu] = useState(false);
  const [expres, setExpres] = useState(false);
  const [code, setCode] = useState('');
  const [emailMasque, setEmailMasque] = useState(d.code?.email || d.moi.email);
  const [codeDe, setCodeDe] = useState(d.code?.le || '');
  const [demande, setDemande] = useState(!!d.code);
  const [attente, setAttente] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [pad, setPad] = useState(false);
  const [erreur, setErreur] = useState('');
  const [fin, setFin] = useState<{ complet: boolean; signeLe: string; attendus: string[] } | null>(null);
  const [finOffre, setFinOffre] = useState(d.finValidite || '');
  /* V3.50 : l'offre a passé sa date de validité pendant qu'il lisait. */
  const offreFinie = (r: Reponse | null) => {
    if (r?.error !== 'offre_expiree') return false;
    if (typeof r.fin === 'string') setFinOffre(r.fin);
    setEtat('offre_expiree');
    return true;
  };
  /* V3.55 : la page était ouverte quand Alexandre a arrêté la signature
     (« arrete »), ou quand un nouveau lien a remplacé celui-ci (« lien
     invalide ») : elle le dit, au lieu de « réessayez dans un instant ». */
  const plusOuvert = (r: Reponse | null) => {
    if (r?.error === 'arrete' || r?.error === 'etat') { setPad(false); setEtat('annule'); return true; }
    if (r?.error === 'lien invalide') { setPad(false); setEtat('introuvable'); return true; }
    return false;
  };

  useEffect(() => { void envoyer('afficher'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo({ top: 0 }); }, [etape, etat]);
  useEffect(() => {
    if (attente <= 0) return;
    const t = setTimeout(() => setAttente(a => a - 1), 1000);
    return () => clearTimeout(t);
  }, [attente]);

  const prenom = d.moi.prenom || d.moi.nom;
  const demanderCode = async () => {
    setEnvoi(true); setErreur('');
    const r = await envoyer('code');
    setEnvoi(false);
    if (r?.ok) { setEmailMasque(String(r.email || '')); setCodeDe(''); setCode(''); setAttente(45); setDemande(true); }
    else if (offreFinie(r) || plusOuvert(r)) return;
    else if (r?.error === 'lien_expire') setEtat('expire');
    else setErreur(ERR[r?.error || ''] || 'Le code n’a pas pu être envoyé. Réessayez dans un instant.');
  };
  const signer = async (griffe: string) => {
    setEnvoi(true); setErreur('');
    const [r] = await Promise.all([
      envoyer('signer', { code, accepte: true, griffe, demande: !!d.expresse && expres }),
      new Promise(ok => setTimeout(ok, 1600)),
    ]);
    setPad(false); setEnvoi(false);
    if (r?.ok) {
      setFin({ complet: !!r.complet, signeLe: String(r.signeLe || new Date().toISOString()), attendus: Array.isArray(r.attendus) ? r.attendus as string[] : [] });
      setEtape('fini'); return;
    }
    if (r?.error === 'code' && typeof r.restants === 'number') {
      setErreur(r.restants > 0 ? `Ce code ne correspond pas. Encore ${r.restants} essai${r.restants > 1 ? 's' : ''}.` : ERR.trop);
    } else if (offreFinie(r) || plusOuvert(r)) return;
    else if (r?.error === 'lien_expire') setEtat('expire');
    else setErreur(ERR[r?.error || ''] || 'La signature n’a pas abouti. Réessayez dans un instant.');
  };
  const telecharger = async () => {
    const w = window.open('', '_blank');
    const r = await envoyer('pdf');
    if (r?.ok && r.url) { if (w) w.location.href = String(r.url); else window.location.href = String(r.url); }
    else { w?.close(); setErreur('Le document n’est pas encore prêt : vous le recevez aussi par e-mail.'); }
  };

  const cadre = (contenu: React.ReactNode) => (
    <div className="sgn-page">
      <style>{CSS_SIGNER + CSS_MANDAT + CSS_DOC}</style>
      <div className="sgn-band">
        <span className="m">EMILIO IMMOBILIER</span>
        {d.entete && <span className="n">{d.entete}</span>}
      </div>
      <div className="sgn-f">{contenu}</div>
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

  if (etat === 'introuvable') return message('info', 'Ce lien ne mène plus nulle part', 'Il a peut-être été remplacé par un plus récent : regardez le dernier e-mail reçu, ou appelez Alexandre.');
  if (etat === 'indisponible') return message('info', 'La page n’a pas pu s’afficher', 'Elle n’a pas pu se charger complètement. Réessayez dans quelques minutes, ou appelez Alexandre.');
  if (etat === 'offre_expiree') return message('horloge', 'Cette offre n’est plus valable', finOffre
    ? `Cette offre n’est plus valable depuis le ${dateLongue(finOffre)} à ${heureParis(finOffre)} : elle ne peut plus être signée. Contactez Emilio Immobilier.`
    : 'Cette offre n’est plus valable : elle ne peut plus être signée. Contactez Emilio Immobilier.');
  if (etat === 'expire') return message('horloge', 'Ce lien a expiré', 'Pour votre sécurité, un lien de signature n’est valable que quinze jours. Appelez Alexandre : il vous en enverra un nouveau.');
  /* V3.57 : il l'a signé, puis le document a pris fin. */
  if (etat === 'termine') return message('info',
    /* La date ne se coupe pas (« 2026 » seul sur sa ligne en 390 px). */
    `${d.mandat ? 'Ce mandat a pris fin' : 'Ce document a été annulé'}${d.finLe ? ` le ${dateLongue(d.finLe).replace(/ /g, '\u00a0')}` : ''}`,
    `${d.signeLe ? `Vous l’avez signé le ${dateLongue(d.signeLe)}. ` : ''}Votre exemplaire signé reste à votre disposition.`,
    <>
      <button type="button" className="btn fant mdt-plein" onClick={() => { void telecharger(); }}><Ic n="doc" t={16} /><span>Télécharger mon exemplaire signé</span></button>
      {erreur && <div className="mdt-erreur">{erreur}</div>}
    </>);
  if (etat === 'annule' || etat === 'fin') return message('info', `${Maj(d.court)} ne vous attend plus`, `Alexandre a arrêté la signature en ligne ${d.du}. S’il faut encore signer, il vous enverra un nouveau lien.`);

  /* ── Il a signé ── */
  if (etat === 'signe' || etape === 'fini') {
    const signeLe = fin?.signeLe || d.signeLe || new Date().toISOString();
    const complet = fin ? fin.complet : d.complet;
    const attendus = fin ? fin.attendus : d.autres.filter(x => !x.signe).map(x => x.nom);
    return cadre(
      <div className="mdt">
        <div className="mdt-corps mdt-fini">
          <div className="mdt-ok"><Ic n="check" t={34} /></div>
          <div className="mdt-sur-c">{complet ? 'Signé par tous · scellé' : 'Votre signature est enregistrée'}</div>
          <h3>{etape === 'fini' ? `Merci ${prenom}, c’est signé` : `Vous avez signé le ${dateLongue(signeLe)}`}</h3>
          <p className="mdt-p">{complet
            ? `${Maj(d.le)} est signé par tous. Chacun en reçoit l’exemplaire complet par e-mail, avec son certificat de signature.`
            : `Votre exemplaire vient de vous être envoyé par e-mail. Vous recevrez la version complète dès que ${attendus.length ? `${enListe(attendus)} ${attendus.length > 1 ? 'auront' : 'aura'}` : 'les autres signataires auront'} signé.`}</p>
          <button type="button" className="btn fant mdt-plein" onClick={() => { void telecharger(); }}><Ic n="doc" t={16} /><span>Télécharger le document signé</span></button>
          {d.espace && <a className="btn or mdt-plein" href={d.espace}>Revenir à mon espace</a>}
          {d.retractation && <p className="mdt-mention">{'Le document rappelle votre délai de rétractation de 14 jours et la façon de l’exercer : le formulaire joint, ou un simple e-mail à l’agence.'}</p>}
          {erreur && <div className="mdt-erreur">{erreur}</div>}
        </div>
      </div>,
    );
  }

  const tete = (sur: string) => (
    <div className="mdt-tete">
      <div className="mdt-tete-g">
        {etape !== 'accueil' && (
          <button type="button" className="mdt-rond" aria-label="Retour"
            onClick={() => setEtape(etape === 'lecture' ? retour : etape === 'signer' ? 'recap' : 'accueil')}>
            <Ic n="chevron" t={16} />
          </button>
        )}
        <span className="mdt-sur">{sur}</span>
      </div>
    </div>
  );
  const pas = etape === 'recap' ? 1 : etape === 'signer' ? 2 : 0;
  const barre = pas > 0 ? (
    <div className="mdt-pas" aria-label={`Étape ${pas} sur 2`}>{[1, 2].map(i => <i key={i} data-on={i <= pas ? '1' : undefined} />)}</div>
  ) : null;

  /* ── L'accueil ── */
  if (etape === 'accueil') return cadre(
    <div className="mdt">
      <div className="mdt-corps mdt-accueil">
        <div className="mdt-sceau"><Ic n="plume" t={28} /></div>
        <div className="mdt-invite"><span className="de">{`Bonjour ${prenom}`}</span><span className="att">Votre signature est attendue</span></div>
        <h3>{`Alexandre Rogelet vous adresse ${d.le}`}</h3>
        <p className="mdt-p">{'Relisez-le en entier, puis signez-le en ligne avec un code reçu sur votre adresse e-mail.'}</p>
        <div className="mdt-puces">
          <span><span className="k"><Ic n="check" t={14} /></span><span><b>Relisez le document</b>{' en entier, tel qu’il sera signé.'}</span></span>
          <span><span className="k"><Ic n="check" t={14} /></span><span>{'Signez avec un code à usage unique, quand vous êtes prêt.'}</span></span>
          <span><span className="k"><Ic n="check" t={14} /></span><span>{'Recevez votre exemplaire signé par e-mail, avec son certificat.'}</span></span>
          {d.retractation && <span><span className="k"><Ic n="check" t={14} /></span><span>{'14 jours pour changer d’avis, comme le document le prévoit.'}</span></span>}
        </div>
        {d.autres.length > 0 && (
          <div className="sd-qui">
            {d.autres.map((x, i) => (
              <span key={i}><Ic n={x.signe ? 'check' : 'horloge'} t={14} /><span>{x.signe ? `${x.nom} a signé` : `${x.nom} signe aussi, avec son propre lien`}</span></span>
            ))}
          </div>
        )}
        <button type="button" className="btn or mdt-plein" onClick={() => setEtape('recap')}>Commencer</button>
      </div>
    </div>,
  );

  /* ── Le texte complet ── */
  if (etape === 'lecture') return cadre(
    <div className="mdt">
      {tete('Le document, en entier')}
      <div className="mdt-corps">
        <p className="mdt-p petit">{'C’est exactement ce texte que vous signez. Vous recevrez le document signé, en PDF, par e-mail.'}</p>
        <TexteMandat parties={d.parties} identite={d.identite} cadres={d.cadres} bandeau={`${Maj(d.court)} · en attente de votre signature`} />
        <button type="button" className="btn or mdt-plein" onClick={() => setEtape(retour)}>J’ai lu, je reviens</button>
      </div>
    </div>,
  );

  /* ── 1. L'essentiel ── */
  if (etape === 'recap') return cadre(
    <div className="mdt">
      {tete('Étape 1 sur 2')}{barre}
      <div className="mdt-corps">
        <h3>L’essentiel</h3>
        <div className="mdt-lignes">
          {d.resume.map(r => (
            <div key={r.titre} className="mdt-ligne"><div className="t">{r.titre}</div><div className="v">{r.valeur}</div>{r.detail && r.detail !== '—' && <div className="d">{r.detail}</div>}</div>
          ))}
          <div className="mdt-ligne">
            <div className="t">Vous signez</div>
            <div className="v">{`${d.moi.prenom} ${d.moi.nom}`.trim()}</div>
            <div className="d">{d.role.toLowerCase()}</div>
          </div>
          <div className="mdt-ligne">
            <div className="t">Votre conseiller</div>
            <div className="v">{`${d.identite.signataireNom} · ${d.identite.nom}`}</div>
            <div className="d">{`carte professionnelle ${d.identite.carte}`}</div>
          </div>
        </div>
        <button type="button" className="btn fant mdt-plein" onClick={() => { setRetour('recap'); setEtape('lecture'); }}><Ic n="doc" t={16} /><span>Lire le document en entier</span></button>
        <button type="button" className="btn or mdt-plein" onClick={() => setEtape('signer')}>Continuer</button>
      </div>
    </div>,
  );

  /* ── 2. Le code et la signature ── */
  const pret = lu && (!d.expresse || expres) && code.length === 6;
  return cadre(
    <div className="mdt">
      {tete('Étape 2 sur 2')}{barre}
      <div className="mdt-corps">
        <h3>{`Signer ${d.court}`}</h3>
        <p className="mdt-p">{d.entete}</p>
        {!demande ? (
          <>
            <p className="mdt-p petit">{`Votre code à 6 chiffres sera envoyé à ${emailMasque}. Il est valable 15 minutes.`}</p>
            {erreur && <div className="mdt-erreur">{erreur}</div>}
            <button type="button" className="btn or mdt-plein" disabled={envoi} onClick={() => { void demanderCode(); }}>{envoi ? 'Envoi du code…' : 'Recevoir mon code par e-mail'}</button>
            <button type="button" className="mdt-relire" onClick={() => { setRetour('signer'); setEtape('lecture'); }}>Relire le document</button>
          </>
        ) : (
          <>
            <button type="button" className="mdt-coche" data-on={lu ? '1' : undefined} onClick={() => setLu(x => !x)}>
              <span className="bx">{lu && <Ic n="check" t={14} />}</span>
              <span>{d.accepter}</span>
            </button>
            {d.expresse && (
              <>
                <button type="button" className="mdt-coche" data-on={expres ? '1' : undefined} onClick={() => setExpres(x => !x)}>
                  <span className="bx">{expres && <Ic n="check" t={14} />}</span>
                  <span>{d.expresse}</span>
                </button>
                <p className="mdt-p petit">{'Vous préférez que la mission attende la fin des 14 jours ? Ne signez pas tout de suite : appelez Alexandre, il modifiera ce point du document.'}</p>
              </>
            )}
            <button type="button" className="mdt-relire" onClick={() => { setRetour('signer'); setEtape('lecture'); }}>Le relire</button>
            <div className="mdt-q">Votre code</div>
            <p className="mdt-p petit">{codeDe
              ? `Votre code à 6 chiffres vous a été envoyé à ${emailMasque} à ${heureParis(codeDe)} : saisissez-le ici. Il est valable 15 minutes ; passé ce délai, demandez-en un nouveau.`
              : `Un code à 6 chiffres vient de vous être envoyé à ${emailMasque}. Pensez à regarder dans les indésirables. Vous pouvez quitter cette page pour aller le chercher : elle vous attend.`}</p>
            <input className="mdt-code" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              placeholder="• • • • • •" aria-label="Code à 6 chiffres"
              onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErreur(''); }} />
            <button type="button" className="mdt-relire" disabled={attente > 0 || envoi} onClick={() => { void demanderCode(); }}>
              {attente > 0 ? `Renvoyer le code (${attente} s)` : 'Renvoyer le code'}
            </button>
            {erreur && <div className="mdt-erreur">{erreur}</div>}
            <button type="button" className="btn or mdt-plein" disabled={!pret || envoi} onClick={() => { setErreur(''); setPad(true); }}>
              <Ic n="plume" t={16} /><span>{envoi ? 'Signature en cours…' : `Signer ${d.court}`}</span>
            </button>
          </>
        )}
        {pad && <PadSignature nom={`${d.moi.prenom} ${d.moi.nom}`.trim()} envoi={envoi} onAnnuler={() => setPad(false)} onValider={png => { void signer(png); }} />}
        <div className="mdt-confiance">
          <span><Ic n="cadenas" t={15} /><span>Code personnel, à usage unique</span></span>
          <span><Ic n="bouclier" t={15} /><span>Document scellé et horodaté</span></span>
          <span><Ic n="doc" t={15} /><span>Votre exemplaire par e-mail</span></span>
        </div>
        <p className="mdt-mention">{`En signant, vous acceptez ${d.le}. Vous en recevez un exemplaire par e-mail, avec son certificat de signature.`}</p>
      </div>
    </div>,
  );
}

/* La liste « qui signe aussi », sous l'accueil. */
export const CSS_DOC = `
.sd-qui{display:flex; flex-direction:column; gap:6px; width:100%; max-width:440px; margin:4px auto 0; padding:10px 14px; border-radius:14px; background:var(--fond); border:1px solid var(--trait)}
.sd-qui > span{display:flex; gap:8px; align-items:center; font-size:13px; color:var(--plume)}
.sd-qui svg{flex:0 0 auto; color:var(--or-fonce)}
.sgn-band .n{min-width:0; overflow:hidden; text-overflow:ellipsis}
`;
