'use client';
import { useCallback, useEffect, useState } from 'react';
import { modeSignature, modele, type CaseSignature } from '@/lib/actes';
import { IDENTITE_DEFAUT } from '@/lib/agence';
import { dateCourte, dateLongue, heureParis } from '@/lib/mandat';
import { finValiditeOffre } from '@/lib/actes/offre-achat';
import { Croix, Ic } from './ApercuActe';
import {
  appelSignature, lienFichier, lireSignataires, nomFichier, nomSignataire, tableSignaturesAbsente,
  type DocumentRow, type SignataireRow,
} from './outils';
import s from './Documents.module.css';

/* ═══ La signature en ligne ou sur place, dans la fiche d'un document ══════
   Un document « À faire signer » dont l'éditeur dit « En ligne » ou « Sur
   place » : on confirme les adresses e-mail, puis l'agence signe et, en
   ligne, chacun reçoit son lien ; sur place, l'écran passe en mode
   signature (SignatureSurPlace). Ensuite : qui a signé, qui on attend,
   renvoyer un lien, corriger une adresse, arrêter. Tout ce qui écrit passe
   par /api/documents/signature (voir src/lib/signature-documents.ts). */

const quandCourt = (iso: string) => `${dateCourte(iso)} à ${heureParis(iso)}`;

/* ── Les adresses, avant d'envoyer ── */
export function FenetreLancer({ doc, onFermer, onLance }: {
  doc: DocumentRow; onFermer: () => void;
  onLance: (x: { signataires: SignataireRow[]; signature: DocumentRow['signature']; echecs: string[] }) => void;
}) {
  const m = modele(doc.modele);
  const mode = modeSignature(doc.donnees);
  const cases: CaseSignature[] = m?.cases ? m.cases(doc.donnees, doc.identite || IDENTITE_DEFAUT).filter(c => !c.agence) : [];
  const [mails, setMails] = useState<Record<string, string>>(() => Object.fromEntries(cases.map(c => [c.cle, c.personne?.email || ''])));
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [travail, setTravail] = useState(false);
  const [erreur, setErreur] = useState('');
  /* V3.50 : une offre d'achat, ses liens ne valent pas au-delà de sa validité. */
  const [maintenant] = useState(() => Date.now());
  const finOffre = doc.modele === 'offre_achat' ? finValiditeOffre(doc.donnees) : null;
  const offreAvant15 = !!finOffre && finOffre.getTime() < maintenant + 15 * 86_400_000;

  async function lancer() {
    const manque: Record<string, string> = {};
    cases.forEach(c => { if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((mails[c.cle] || '').trim())) manque[c.cle] = 'Une adresse e-mail valide'; });
    if (Object.keys(manque).length) { setChamps(manque); return; }
    setTravail(true); setErreur('');
    try {
      const r = await appelSignature<{ signataires: SignataireRow[]; signature: DocumentRow['signature']; echecs: string[] }>({
        action: 'lancer', id: doc.id, signataires: cases.map(c => ({ cle: c.cle, email: mails[c.cle].trim() })),
      });
      onLance(r);
    } catch (e) {
      const x = e as Error & { plus?: { champs?: Record<string, string> } };
      if (x.plus?.champs) setChamps(x.plus.champs);
      setErreur(x.message);
      setTravail(false);
    }
  }

  return (
    <div className={s.fenetre} onClick={e => { if (e.target === e.currentTarget && !travail) onFermer(); }}>
      <div className={s.fenetreIn} role="dialog" aria-modal="true" aria-label={mode === 'en_ligne' ? 'Envoyer les liens de signature' : 'Signer sur place'}>
        <div className={s.fenTete}>
          <div style={{ flex: '1 1 auto' }}>
            <h3>{mode === 'en_ligne' ? 'Envoyer les liens de signature' : 'Signer sur place'}</h3>
            <p>{mode === 'en_ligne'
              ? 'Chacun reçoit son lien personnel à son adresse e-mail, et signe avec un code qu’il y reçoit. Vérifie les adresses : c’est elles qui les identifient.'
              : 'Chacun signera à son tour sur cet écran, avec un code reçu sur sa propre adresse e-mail. Vérifie les adresses : il pourra encore corriger la sienne au moment de signer.'}</p>
          </div>
          <button type="button" className={s.panFermer} aria-label="Fermer" onClick={onFermer} disabled={travail}><Croix /></button>
        </div>
        <div className={s.fenCorps}>
          {cases.map(c => (
            <div key={c.cle} className={s.champLigne}>
              <label htmlFor={`sg-${c.cle}`}>{`${c.qui} · ${c.nom}`}</label>
              <input id={`sg-${c.cle}`} type="email" inputMode="email" autoComplete="off" className={`${s.input} ${champs[c.cle] ? s.inputManque : ''}`}
                value={mails[c.cle] || ''} placeholder="adresse@exemple.fr"
                onChange={e => { const v = e.target.value; setMails(x => ({ ...x, [c.cle]: v })); setChamps(x => ({ ...x, [c.cle]: '' })); }} />
              {champs[c.cle] && <i className={s.chAide} style={{ color: '#b45309' }}>{champs[c.cle]}</i>}
            </div>
          ))}
          <ul className={s.liste2}>
            <li><span className={`${s.k} ${s.kOr}`}><Ic n="plume" t={12} /></span><span>{`L’agence signe en ${mode === 'en_ligne' ? 'envoyant' : 'lançant la signature'} : ta signature est posée dans son cadre, avec l’heure.`}</span></li>
            {mode === 'en_ligne' && <li><span className={`${s.k} ${s.kOr}`}><Ic n="horloge" t={12} /></span><span>{finOffre && offreAvant15
              ? `Les liens valent jusqu’au ${dateLongue(finOffre)} à ${heureParis(finOffre)}, la fin de validité de l’offre : après, elle ne peut plus être signée. Un rappel part à 2 jours si l’offre vaut encore ; tu es prévenu si quelqu’un n’a pas signé à temps.`
              : 'Les liens valent 15 jours. Un rappel part à 2 jours, puis un dernier à 7 jours ; tu es prévenu si quelqu’un n’a pas signé à temps.'}</span></li>}
            <li><span className={`${s.k} ${s.kVert}`}><Ic n="check" t={12} e={3} /></span><span>{'Signé par tous, le document est scellé avec son certificat, envoyé à chacun, et rangé ici tout seul.'}</span></li>
          </ul>
          {erreur && <div className={s.erreur}>{erreur}</div>}
        </div>
        <div className={s.fenPied}>
          <button type="button" className={s.btn} disabled={travail} onClick={onFermer}>Pas encore</button>
          <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={travail} onClick={lancer}>
            <Ic n={mode === 'en_ligne' ? 'mail' : 'tablette'} t={15} />{travail ? 'Un instant…' : mode === 'en_ligne' ? 'Envoyer les liens' : 'Commencer la signature'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Dans la fiche du document ── */
export function BlocSignature({ doc, onMaj, onSurPlace }: {
  doc: DocumentRow;
  onMaj: (d: DocumentRow) => void;
  /* Ouvre l'écran de signature sur place (au début, ou à la finalisation). */
  onSurPlace: (o?: { finaliser?: boolean }) => void;
}) {
  const mode = modeSignature(doc.donnees);
  const [sigs, setSigs] = useState<SignataireRow[] | null>(null);
  /* L'heure de l'ouverture du panneau : un lien expiré se voit à la relecture. */
  const [maintenant] = useState(() => Date.now());
  const [absente, setAbsente] = useState(false);
  const [lancer, setLancer] = useState(false);
  const [travail, setTravail] = useState('');
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [corrige, setCorrige] = useState<{ id: string; email: string } | null>(null);

  const lire = useCallback(() => (doc.signature ? lireSignataires(doc.id) : Promise.resolve([] as SignataireRow[])), [doc.id, doc.signature]);
  const echec = useCallback((e: unknown) => {
    if (tableSignaturesAbsente((e as Error).message)) setAbsente(true); else setErreur('Les signataires n’ont pas pu être lus : ' + (e as Error).message);
    setSigs([]);
  }, []);
  const charger = useCallback(async () => {
    try { setSigs(await lire()); setAbsente(false); } catch (e) { echec(e); }
  }, [lire, echec]);
  useEffect(() => { lire().then(l => { setSigs(l); setAbsente(false); }, echec); }, [lire, echec]);

  async function action(cle: string, body: Record<string, unknown>, ok: string) {
    setTravail(cle); setErreur(''); setInfo('');
    try { await appelSignature({ ...body, id: doc.id }); setInfo(ok); await charger(); }
    catch (e) { setErreur((e as Error).message); }
    setTravail('');
  }
  async function arreter() {
    const signes = (sigs || []).filter(x => x.statut === 'signe').length;
    if (!confirm(`Arrêter la signature ${mode === 'en_ligne' ? 'en ligne' : 'sur place'} ?\n\nLes liens ne fonctionneront plus${signes ? `, et les ${signes > 1 ? `${signes} signatures déjà faites ne comptent plus` : 'signature déjà faite ne compte plus'}` : ''}. Le document redevient « à faire signer » : tu pourras la relancer.`)) return;
    setTravail('arreter'); setErreur('');
    try {
      await appelSignature({ action: 'annuler', id: doc.id });
      onMaj({ ...doc, signature: null });
    } catch (e) { setErreur((e as Error).message); }
    setTravail('');
  }
  async function ouvrir(chemin: string | null | undefined) {
    if (!chemin) return;
    const onglet = window.open('', '_blank');
    try { const url = await lienFichier(chemin, nomFichier(doc)); if (onglet) onglet.location.href = url; else window.location.href = url; }
    catch (e) { onglet?.close(); setErreur('Le fichier n’a pas pu être ouvert : ' + (e as Error).message); }
  }

  const lance = !!doc.signature;
  const attendus = (sigs || []).filter(x => x.statut === 'attendu' || x.statut === 'invite');
  const surPlaceAttendus = attendus.filter(x => x.statut === 'attendu');
  const tousSignes = lance && sigs !== null && sigs.length > 0 && !attendus.length;

  if (absente) return (
    <div className={s.erreur}>
      <b>Une étape avant de signer en ligne</b>
      {'La signature en ligne n’est pas encore installée. Ouvre Supabase › SQL Editor, colle le contenu du fichier '}<code>outils/sql/signature-documents.sql</code>{', lance-le, puis recharge la page.'}
    </div>
  );

  return (
    <>
      {erreur && <div className={s.erreur}>{erreur}</div>}
      {info && <div className={s.note}>{info}</div>}
      <div className={s.actions}>
        {!lance && (
          <>
            <div className={s.modeSig}>
              <Ic n={mode === 'en_ligne' ? 'mail' : 'tablette'} t={18} />
              <span>{mode === 'en_ligne'
                ? <><b>Signature en ligne</b>{' · chacun reçoit son lien par e-mail et signe avec un code.'}</>
                : <><b>Signature sur place</b>{' · sur cet écran, chacun à son tour, avec un code reçu sur son e-mail.'}</>}</span>
            </div>
            <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={() => setLancer(true)}>
              <Ic n={mode === 'en_ligne' ? 'mail' : 'tablette'} t={16} /><span>{mode === 'en_ligne' ? 'Envoyer les liens de signature' : 'Signer sur place'}</span>
            </button>
            <button type="button" className={s.btn} onClick={() => ouvrir(doc.pdf_chemin)}><Ic n="doc" t={16} /><span>Le PDF à relire</span><small>avant signature</small></button>
          </>
        )}
        {lance && tousSignes && doc.statut === 'pret' && (
          <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={() => onSurPlace({ finaliser: true })}>
            <Ic n="check" t={16} e={2.4} /><span>Tout le monde a signé : finaliser</span><small>sceller, envoyer, ranger</small>
          </button>
        )}
        {lance && surPlaceAttendus.length > 0 && (
          <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={() => onSurPlace()}>
            <Ic n="tablette" t={16} /><span>{attendus.length < (sigs || []).length ? 'Reprendre la signature sur place' : 'Ouvrir l’écran de signature'}</span>
          </button>
        )}
        {lance && doc.signature?.scelle_chemin && doc.statut === 'pret' && (
          <button type="button" className={s.btn} onClick={() => ouvrir(doc.signature?.scelle_chemin)}><Ic n="doc" t={16} /><span>La version signée du moment</span><small>scellée</small></button>
        )}
      </div>

      {lance && (
        <div className={s.carte}>
          <div className={s.carteT}>{doc.statut === 'signe' ? 'Signé par' : 'Les signatures'}</div>
          {sigs === null && <i className={s.chAide}>Chargement…</i>}
          <div className={s.sigListe}>
            {(sigs || []).map(x => {
              const expire = x.statut === 'invite' && !!x.lien_expire_le && Date.parse(x.lien_expire_le) < maintenant;
              const etat = x.statut === 'signe' ? `Signé le ${quandCourt(x.signe_le!)}${x.mode === 'sur_place' ? ', sur place' : ''}`
                : x.statut === 'attendu' ? 'Signera sur place, sur cet écran'
                : expire ? `Lien expiré le ${dateCourte(x.lien_expire_le!)} : renvoie-lui un lien`
                : `Lien envoyé le ${quandCourt(x.invite_le!)} · ${x.ouvert_le ? `ouvert le ${dateCourte(x.ouvert_le)}` : 'pas encore ouvert'}${x.relances === 1 ? ' · rappel envoyé' : x.relances === 2 ? ' · dernier rappel envoyé' : ''}`;
              return (
                <div key={x.id} className={s.sigLigne}>
                  <span className={`${s.sigPt} ${x.statut === 'signe' ? s.kVert : expire ? s.kRouge : s.kOr}`}><Ic n={x.statut === 'signe' ? 'check' : x.statut === 'attendu' ? 'tablette' : 'horloge'} t={13} e={x.statut === 'signe' ? 3 : 2} /></span>
                  <span className={s.sigTx}>
                    <b>{nomSignataire(x)}</b>
                    <i>{`${x.role} · ${x.personne.email}`}</i>
                    <i style={{ color: x.statut === 'signe' ? '#15803d' : expire ? '#b91c1c' : undefined }}>{etat}</i>
                    {doc.statut === 'pret' && x.statut !== 'signe' && (
                      <span className={s.sigActions}>
                        {x.statut === 'invite' && <button type="button" className={s.btnLien} disabled={!!travail} onClick={() => action(x.id, { action: 'renvoyer', sig: x.id }, `Lien renvoyé à ${x.personne.email}.`)}>{travail === x.id ? 'Envoi…' : 'Renvoyer le lien'}</button>}
                        {x.statut === 'attendu' && <button type="button" className={s.btnLien} disabled={!!travail} onClick={() => action(x.id, { action: 'renvoyer', sig: x.id }, `${nomSignataire(x)} signera avec son lien : il vient de partir à ${x.personne.email}.`)}>{travail === x.id ? 'Envoi…' : 'Il signera plus tard, par lien'}</button>}
                        <button type="button" className={s.btnLien} disabled={!!travail} onClick={() => setCorrige(corrige?.id === x.id ? null : { id: x.id, email: x.personne.email })}>Corriger l’e-mail</button>
                      </span>
                    )}
                    {corrige?.id === x.id && (
                      <span className={s.sigMail}>
                        <input type="email" className={s.input} value={corrige.email} aria-label={`Nouvelle adresse de ${nomSignataire(x)}`}
                          onChange={e => setCorrige({ id: x.id, email: e.target.value })} />
                        <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={!!travail}
                          onClick={async () => { await action(x.id, { action: 'renvoyer', sig: x.id, email: corrige.email.trim() }, `Adresse corrigée : un nouveau lien est parti à ${corrige.email.trim()}. L’ancien ne fonctionne plus.`); setCorrige(null); }}>Envoyer</button>
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          {doc.statut === 'pret' && (
            <button type="button" className={s.btnLien} style={{ alignSelf: 'flex-start', color: '#b91c1c' }} disabled={!!travail} onClick={arreter}>
              {travail === 'arreter' ? 'Arrêt…' : 'Arrêter la signature'}
            </button>
          )}
        </div>
      )}

      {lancer && (
        <FenetreLancer doc={doc} onFermer={() => setLancer(false)}
          onLance={r => {
            setLancer(false);
            setSigs(r.signataires.sort((a, b) => a.rang - b.rang));
            onMaj({ ...doc, signature: r.signature });
            if (r.echecs.length) setErreur(`Lancée, mais un lien n’est pas parti : ${r.echecs.join(' ; ')}. Renvoie-le depuis la liste.`);
            else if (mode === 'en_ligne') setInfo('C’est parti : chacun a reçu son lien. Tu es prévenu à chaque signature.');
            if (mode === 'sur_place') onSurPlace();
          }} />
      )}
    </>
  );
}
