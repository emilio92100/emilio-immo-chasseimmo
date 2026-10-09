'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { modeSignature, modele, surPlaceSansCode, type CaseSignature } from '@/lib/actes';
import { IDENTITE_DEFAUT } from '@/lib/agence';
import { dateCourte, dateLongue, heureParis } from '@/lib/mandat';
import { finValiditeOffre } from '@/lib/actes/offre-achat';
import { Croix, Ic } from './ApercuActe';
import FenetreConfirmer from './FenetreConfirmer';
import {
  appelSignature, lienFichier, lireSignataires, nomFichier, nomSignataire, pagePerimee, tableSignaturesAbsente,
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

/* « Paul Martin » et « paul  MARTIN » : la même personne. */
const memeNom = (a: { prenom?: string; nom?: string } | undefined, b: { prenom?: string; nom?: string } | undefined) => {
  const n = (p: typeof a) => `${p?.prenom || ''} ${p?.nom || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return !!n(a) && n(a) === n(b);
};

/* V3.56-V3.57 : l'adresse d'une ligne de signataire est-elle une
   correction de l'agence, et de quelle adresse du document ? Rend cette
   adresse d'origine (en minuscules), sinon null. `lignes` : celles du même
   cadre et de la même personne, de la plus récente à la plus ancienne ; `i` :
   celle qu'on regarde. Lu dans le déroulé de chaque ligne :
     · « … (adresse corrigée par l’agence, au lieu de A) » au lancement
       (V3.57 : une correction reprise par la fenêtre d'envoi le note) ;
     · « Adresse e-mail corrigée par l’agence : B (au lieu de A ; …) »
       pendant un lancement (« Corriger l'e-mail ») ;
     · sinon, l'adresse du lancement, « Lien personnel envoyé à A ».
   Et la chaîne : une ligne partie à B, où B était la correction d'un
   lancement plus ancien, remonte jusqu'à l'adresse du document. Ainsi A→B,
   arrêt, relance, arrêt, relance garde B ; et B→C au deuxième lancement
   garde C. */
type LigneCorrigee = { personne: { email?: string } | null; deroule?: { t: string; x: string }[] | null };
function origineCorrigee(lignes: LigneCorrigee[], i: number, profondeur = 0): string | null {
  if (profondeur > 20 || !lignes[i]) return null;
  const d = Array.isArray(lignes[i].deroule) ? lignes[i].deroule! : [];
  const texte = (e: { x?: unknown } | null | undefined) => String(e?.x || '');
  /* 1. Au lancement, une correction reprise. */
  const marque = d.map(e => /\(adresse corrigée par l’agence, au lieu de ([^\s)]+)\)/.exec(texte(e))?.[1]).find(Boolean);
  if (marque) return marque.trim().toLowerCase();
  /* 2. L'adresse de départ de ce lancement. */
  const k = d.findIndex(e => /^Adresse e-mail corrigée par l’agence : /.test(texte(e)));
  const auLieu = k >= 0 ? /\(au lieu de ([^\s;)]+)/.exec(texte(d[k]))?.[1] : undefined;
  const lien = (k >= 0 ? d.slice(0, k) : d).map(e => /^Lien personnel envoyé à (\S+)/.exec(texte(e))?.[1]).find(Boolean);
  const depart = String(auLieu || lien || '').trim().toLowerCase();
  if (!depart) return null;
  /* 3. Ce départ était-il la correction d'un lancement plus ancien ? */
  for (let j = i + 1; j < lignes.length; j++) {
    if (String(lignes[j].personne?.email || '').trim().toLowerCase() !== depart) continue;
    const o = origineCorrigee(lignes, j, profondeur + 1);
    if (o) return o;
  }
  /* 4. Corrigée par l'agence pendant ce lancement : depuis son départ. */
  return k >= 0 ? depart : null;
}

/* ── Les adresses, avant d'envoyer ── */
export function FenetreLancer({ doc, onFermer, onLance, onPerime }: {
  doc: DocumentRow; onFermer: () => void;
  onLance: (x: { signataires: SignataireRow[]; signature: DocumentRow['signature']; echecs: string[] }) => void;
  /* V3.55 : la page n'était plus à jour (déjà lancée ailleurs, document
     changé) : la fiche se relit et dit pourquoi. */
  onPerime?: (message: string) => void;
}) {
  const m = modele(doc.modele);
  const mode = modeSignature(doc.donnees);
  /* V3.154 : le bon de visite sur place se signe sans code ; l'adresse ne
     sert qu'à recevoir son exemplaire, et peut rester vide. */
  const sansCode = surPlaceSansCode(doc.modele, doc.donnees);
  const cases: CaseSignature[] = m?.cases ? m.cases(doc.donnees, doc.identite || IDENTITE_DEFAUT).filter(c => !c.agence) : [];
  const [mails, setMails] = useState<Record<string, string>>(() => Object.fromEntries(cases.map(c => [c.cle, c.personne?.email || ''])));
  /* V3.55 : une adresse corrigée pendant une signature arrêtée depuis
     (« Corriger l'e-mail ») est reprise, plutôt que celle du document : le
     texte signé ne change pas, seul l'envoi va à la bonne adresse. Pour la
     même personne (même nom), et tant qu'Alexandre n'a pas touché au champ.
     V3.56 : seulement une VRAIE correction de l'agence (« Corriger
     l'e-mail », écrite dans le déroulé de sa ligne), et seulement si le
     document dit encore l'adresse à laquelle ce lancement était parti. Le
     document corrigé depuis dans l'éditeur (paul@gmial.com devenu
     paul@gmail.com) : c'est lui qui fait foi, l'ancienne faute ne revient
     pas. */
  const [repris, setRepris] = useState<Record<string, boolean>>({});
  const touche = useRef<Record<string, boolean>>({});
  useEffect(() => {
    let vivant = true;
    (async () => {
      const { data, error } = await supabase.from('documents_signataires').select('cle, personne, deroule, created_at')
        .eq('document_id', doc.id).order('created_at', { ascending: false }).limit(60);
      /* Illisible : on garde les adresses du document. */
      if (!vivant || error || !data?.length) return;
      const lignes = data as { cle: string; personne: { prenom?: string; nom?: string; email?: string } | null; deroule?: { t: string; x: string }[] | null }[];
      const plus: Record<string, string> = {};
      for (const c of cases) {
        /* Ses lignes à lui (même cadre, même nom), la plus récente d'abord. */
        const siennes = lignes.filter(x => x.cle === c.cle && memeNom(x.personne || undefined, c.personne));
        const e = String(siennes[0]?.personne?.email || '').trim();
        const duDoc = String(c.personne?.email || '').trim().toLowerCase();
        if (!siennes.length || !e || e.toLowerCase() === duDoc) continue;
        if (origineCorrigee(siennes, 0) === duDoc) plus[c.cle] = e;
      }
      if (!Object.keys(plus).length) return;
      const libres = Object.keys(plus).filter(k => !touche.current[k]);
      setMails(x => ({ ...x, ...Object.fromEntries(libres.map(k => [k, plus[k]])) }));
      setRepris(Object.fromEntries(libres.map(k => [k, true])));
    })();
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [travail, setTravail] = useState(false);
  const [erreur, setErreur] = useState('');
  /* V3.50 : une offre d'achat, ses liens ne valent pas au-delà de sa validité. */
  const [maintenant] = useState(() => Date.now());
  const finOffre = doc.modele === 'offre_achat' ? finValiditeOffre(doc.donnees) : null;
  const offreAvant15 = !!finOffre && finOffre.getTime() < maintenant + 15 * 86_400_000;

  async function lancer() {
    const manque: Record<string, string> = {};
    cases.forEach(c => {
      const v = (mails[c.cle] || '').trim();
      if (sansCode && !v) return;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) manque[c.cle] = sansCode ? 'Une adresse e-mail valide, ou rien' : 'Une adresse e-mail valide';
    });
    if (Object.keys(manque).length) { setChamps(manque); return; }
    setTravail(true); setErreur('');
    try {
      const r = await appelSignature<{ signataires: SignataireRow[]; signature: DocumentRow['signature']; echecs: string[] }>({
        /* `repris` (V3.57) : l'adresse est la correction reprise ; le
           serveur le note sur la ligne, pour la relance suivante. */
        action: 'lancer', id: doc.id, signataires: cases.map(c => ({ cle: c.cle, email: mails[c.cle].trim(), repris: !!repris[c.cle] })),
      });
      onLance(r);
    } catch (e) {
      const x = e as Error & { plus?: { champs?: Record<string, string> } };
      if (pagePerimee(e) && onPerime) { onPerime(x.message); return; }
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
              : sansCode
                ? 'Chacun signera à son tour sur cet écran, dans son cadre, au stylet : pas de code. L’adresse e-mail sert seulement à lui envoyer son exemplaire signé ; sans adresse, tu le gardes dans le CRM.'
                : 'Chacun signera à son tour sur cet écran, avec un code reçu sur sa propre adresse e-mail. Vérifie les adresses : il pourra encore corriger la sienne au moment de signer.'}</p>
          </div>
          <button type="button" className={s.panFermer} aria-label="Fermer" onClick={onFermer} disabled={travail}><Croix /></button>
        </div>
        <div className={s.fenCorps}>
          {cases.map(c => (
            <div key={c.cle} className={s.champLigne}>
              <label htmlFor={`sg-${c.cle}`}>{`${c.qui} · ${c.nom}`}</label>
              <input id={`sg-${c.cle}`} type="email" inputMode="email" autoComplete="off" className={`${s.input} ${champs[c.cle] ? s.inputManque : ''}`}
                value={mails[c.cle] || ''} placeholder={sansCode ? 'Facultative : adresse@exemple.fr' : 'adresse@exemple.fr'}
                onChange={e => { const v = e.target.value; setMails(x => ({ ...x, [c.cle]: v })); setChamps(x => ({ ...x, [c.cle]: '' })); touche.current[c.cle] = true; setRepris(x => ({ ...x, [c.cle]: false })); }} />
              {champs[c.cle] && <i className={s.chAide} style={{ color: '#b45309' }}>{champs[c.cle]}</i>}
              {!champs[c.cle] && repris[c.cle] && <i className={s.chAide}>{`Reprise de ta correction lors du dernier envoi${c.personne?.email ? ` (le document dit ${c.personne.email})` : ''}.`}</i>}
            </div>
          ))}
          <ul className={s.liste2}>
            <li><span className={`${s.k} ${s.kOr}`}><Ic n="plume" t={12} /></span><span>{`L’agence signe en ${mode === 'en_ligne' ? 'envoyant' : 'lançant la signature'} : ta signature est posée dans son cadre, avec l’heure.`}</span></li>
            {mode === 'en_ligne' && <li><span className={`${s.k} ${s.kOr}`}><Ic n="horloge" t={12} /></span><span>{finOffre && offreAvant15
              ? `Les liens valent jusqu’au ${dateLongue(finOffre)} à ${heureParis(finOffre)}, la fin de validité de l’offre : après, elle ne peut plus être signée. Un rappel part à 2 jours si l’offre vaut encore ; tu es prévenu si quelqu’un n’a pas signé à temps.`
              : 'Les liens valent 15 jours. Un rappel part à 2 jours, puis un dernier à 7 jours ; tu es prévenu si quelqu’un n’a pas signé à temps.'}</span></li>}
            <li><span className={`${s.k} ${s.kVert}`}><Ic n="check" t={12} e={3} /></span><span>{sansCode
              ? 'Signé par tous, le document est scellé avec son certificat, envoyé à ceux qui ont une adresse, et rangé ici.'
              : 'Signé par tous, le document est scellé avec son certificat, envoyé à chacun, et rangé ici tout seul.'}</span></li>
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
  /* V3.154 : le bon de visite sur place, sans code. */
  const sansCode = surPlaceSansCode(doc.modele, doc.donnees);
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

  /* V3.55 : le serveur dit que la page n'est plus à jour (lancée ou arrêtée
     ailleurs, signé entre-temps) : le document se relit, la fiche montre où
     il en est vraiment. */
  const relire = useCallback(async () => {
    const { data, error } = await supabase.from('documents').select('*').eq('id', doc.id).maybeSingle();
    if (error) { setErreur(e => `${e ? `${e} ` : ''}Le document n’a pas pu être relu : ${error.message}`); return; }
    if (data) onMaj(data as DocumentRow);
    await charger();
  }, [doc.id, onMaj, charger]);

  /* V3.58 — Alexandre : « pas encore ouvert, est-ce que c'est vraiment à
     jour ? ». Le panneau lisait les signataires une seule fois, à son
     ouverture. Il se relit maintenant tout seul pendant une signature en
     ligne : toutes les 30 secondes tant qu'il est à l'écran, et quand on
     revient sur l'onglet. */
  useEffect(() => {
    if (doc.statut !== 'pret' || doc.signature?.mode !== 'en_ligne') return;
    const maj = () => { if (document.visibilityState === 'visible') void relire(); };
    const t = window.setInterval(maj, 30_000);
    window.addEventListener('focus', maj);
    document.addEventListener('visibilitychange', maj);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', maj);
      document.removeEventListener('visibilitychange', maj);
    };
  }, [doc.statut, doc.signature?.mode, relire]);

  async function action(cle: string, body: Record<string, unknown>, ok: string) {
    setTravail(cle); setErreur(''); setInfo('');
    try { await appelSignature({ ...body, id: doc.id }); setInfo(ok); await charger(); }
    catch (e) { setErreur((e as Error).message); if (pagePerimee(e)) await relire(); }
    setTravail('');
  }
  /* V3.61 : la fenêtre qui dit ce qui va se passer (FenetreConfirmer), et
     les signataires prévenus par e-mail (case cochée d'office). */
  const [fenArret, setFenArret] = useState(false);
  async function arreter(prevenir: boolean) {
    setTravail('arreter'); setErreur(''); setInfo('');
    try {
      const r = await appelSignature<{ prevenus?: string[]; echecs?: string[] }>({ action: 'annuler', id: doc.id, prevenir });
      setFenArret(false);
      const p = r.prevenus || [], ech = r.echecs || [];
      setInfo(`Signature arrêtée : les liens ne fonctionnent plus.${p.length ? ` ${p.join(', ')} ${p.length > 1 ? 'ont été prévenus' : 'a été prévenu'} par e-mail.` : ''}`);
      if (ech.length) setErreur(`Un e-mail n’est pas parti : ${ech.join(' ; ')}. Préviens-le toi-même.`);
      onMaj({ ...doc, signature: null });
    } catch (e) { setFenArret(false); setErreur((e as Error).message); if (pagePerimee(e)) await relire(); }
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
                : sansCode
                  ? <><b>Signature sur place</b>{' · sur cet écran, chacun signe dans son cadre, au stylet, sans code.'}</>
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
                : `Lien envoyé le ${quandCourt(x.invite_le!)} · ${x.ouvert_le ? `ouvert le ${quandCourt(x.ouvert_le)}` : 'pas encore ouvert'}${x.relances === 1 ? ' · rappel envoyé' : x.relances === 2 ? ' · dernier rappel envoyé' : ''}`;
              return (
                <div key={x.id} className={s.sigLigne}>
                  <span className={`${s.sigPt} ${x.statut === 'signe' ? s.kVert : expire ? s.kRouge : s.kOr}`}><Ic n={x.statut === 'signe' ? 'check' : x.statut === 'attendu' ? 'tablette' : 'horloge'} t={13} e={x.statut === 'signe' ? 3 : 2} /></span>
                  <span className={s.sigTx}>
                    <b>{nomSignataire(x)}</b>
                    <i>{`${x.role} · ${x.personne.email || 'pas d’e-mail'}`}</i>
                    <i style={{ color: x.statut === 'signe' ? '#15803d' : expire ? '#b91c1c' : undefined }}>{etat}</i>
                    {doc.statut === 'pret' && x.statut !== 'signe' && (
                      <span className={s.sigActions}>
                        {x.statut === 'invite' && <button type="button" className={s.btnLien} disabled={!!travail} onClick={() => action(x.id, { action: 'renvoyer', sig: x.id }, `Lien renvoyé à ${x.personne.email}.`)}>{travail === x.id ? 'Envoi…' : 'Renvoyer le lien'}</button>}
                        {x.statut === 'attendu' && !!x.personne.email && <button type="button" className={s.btnLien} disabled={!!travail} onClick={() => action(x.id, { action: 'renvoyer', sig: x.id }, `${nomSignataire(x)} signera avec son lien : il vient de partir à ${x.personne.email}.`)}>{travail === x.id ? 'Envoi…' : 'Il signera plus tard, par lien'}</button>}
                        <button type="button" className={s.btnLien} disabled={!!travail} onClick={() => setCorrige(corrige?.id === x.id ? null : { id: x.id, email: x.personne.email })}>{x.personne.email ? 'Corriger l’e-mail' : 'Lui envoyer un lien'}</button>
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
          {/* V3.57 : la version complète est partie à chacun : plus d'arrêt
              (« finaliser » range le document). */}
          {doc.statut === 'pret' && !doc.signature?.envoi_le && !doc.signature?.envoye_le && (
            <button type="button" className={s.btnLien} style={{ alignSelf: 'flex-start', color: '#b91c1c' }} disabled={!!travail} onClick={() => setFenArret(true)}>
              {travail === 'arreter' ? 'Arrêt…' : 'Arrêter la signature'}
            </button>
          )}
        </div>
      )}

      {fenArret && (() => {
        const liste = sigs || [];
        const signes = liste.filter(x => x.statut === 'signe');
        const invites = liste.filter(x => x.statut === 'invite');
        const surPlace = liste.filter(x => x.statut === 'attendu');
        const aPrevenir = liste.filter(x => (x.statut === 'invite' || x.statut === 'signe') && !!x.personne.email);
        const noms = signes.map(nomSignataire).join(', ');
        const pl = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);
        return (
          <FenetreConfirmer ic="pause" ton="or" titre="Arrêter la signature ?" bouton="Arrêter la signature"
            intro={`${doc.titre || modele(doc.modele)?.titre || 'Ce document'}${doc.numero ? ` · n° ${doc.numero}` : ''}`}
            option={aPrevenir.length ? { libelle: `Prévenir ${aPrevenir.length > 1 ? `les ${aPrevenir.length} signataires` : nomSignataire(aPrevenir[0])} par e-mail`, aide: 'Ceux qui ont reçu leur lien ou qui ont déjà signé.', defaut: true } : undefined}
            points={coche => [
              ...(invites.length || signes.length ? [{ ic: 'croix', t: `${invites.length + signes.length > 1 ? 'Les liens envoyés ne fonctionnent plus' : 'Le lien envoyé ne fonctionne plus'} : qui ouvre le sien lit qu’Alexandre a arrêté la signature, et ne voit plus le document.` }] : []),
              ...(surPlace.length ? [{ ic: 'tablette', t: `Plus personne ne peut signer sur ton écran (${surPlace.map(nomSignataire).join(', ')}).` }] : []),
              ...(signes.length ? [{ ic: 'retour', ton: 'alerte' as const, t: `${noms} ${pl(signes.length, 'a', 'ont')} déjà signé : ${pl(signes.length, 'cette signature ne compte plus', 'ces signatures ne comptent plus')}. Il faudra re-signer à la relance.` }] : []),
              ...(aPrevenir.length
                ? [coche
                  ? { ic: 'mail', ton: 'ok' as const, t: `${pl(aPrevenir.length, 'Il reçoit', 'Chacun reçoit')} un e-mail : la signature est interrompue, rien à faire pour l’instant, un nouveau lien suivra si le document doit être signé.` }
                  : { ic: 'mail', ton: 'alerte' as const, t: 'Personne n’est prévenu par e-mail : à toi de les avertir.' }]
                : []),
              { ic: 'doc', t: `Le document reste dans Documents, « À faire signer »${doc.numero ? `, avec son n° ${doc.numero}` : ''}. Rien n’est perdu.` },
            ]}
            ensuite={[
              { ic: 'crayon', t: 'Pour corriger quelque chose : « Ouvrir », puis « Modifier » (il repasse en brouillon). Corrige, puis « Finaliser ».' },
              { ic: 'envoyer', t: 'Puis relance la signature : de nouveaux liens partent à tous, et la signature de l’agence se repose toute seule.' },
            ]}
            conseil="Ce document ne doit plus jamais être signé ? Utilise plutôt « Annuler le document » : il passe « Annulé » et tout le monde est prévenu."
            onFermer={() => setFenArret(false)} onConfirmer={coche => arreter(coche)} />
        );
      })()}

      {lancer && (
        <FenetreLancer doc={doc} onFermer={() => setLancer(false)}
          onPerime={msg => { setLancer(false); setInfo(''); setErreur(msg); void relire(); }}
          onLance={r => {
            setLancer(false);
            setSigs(r.signataires.sort((a, b) => a.rang - b.rang));
            onMaj({ ...doc, signature: r.signature });
            if (r.echecs.length) setErreur(`Lancée, mais un lien n’est pas parti : ${r.echecs.join(' ; ')}. Renvoie-le depuis la liste.`);
            else if (mode === 'en_ligne') setInfo('C’est parti : chacun a reçu son lien. Tu recevras un seul mail, quand tout le monde aura signé.');
            if (mode === 'sur_place') onSurPlace();
          }} />
      )}
    </>
  );
}
