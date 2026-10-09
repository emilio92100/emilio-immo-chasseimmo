'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { IDENTITE_DEFAUT } from '@/lib/agence';
import { modele, pdfDocument, txt, type CaseSignature, type Donnees, type Modele } from '@/lib/actes';
import { CLES_MAIL, signatureDe } from '@/lib/mail-variables';
import { heureParis } from '@/lib/mandat';
import { retracteEnLigne } from '@/lib/documents-espace';
import { Croix, Ic } from './ApercuActe';
import {
  envoyerProjet, identiteDuJour, montrerPdf, quand,
  type DestProjet, type DocumentRow, type EnvoiProjet, type MandatRecherche,
} from './outils';
import s from './Documents.module.css';

/* ═══ Le projet d'un document, en relecture (V3.40) ═══════════════════════
   Un brouillon part à qui l'on choisit, avant toute signature : le PDF
   marqué « PROJET NON SIGNÉ » (le même que « Aperçu PDF »), en pièce
   jointe, un mail par personne. Rien n'est figé, rien n'est à annuler : on
   corrige le brouillon et on renvoie. Chaque envoi est noté dans le
   document (`envois`), et la fiche du document le montre dans son
   historique. Deux portes : la fiche du document (Documents › le
   brouillon) et la barre de l'éditeur, à côté de « Aperçu PDF ». */

const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* « Mandat simple · SCI AVIENA » → « Projet-Mandat-simple-SCI-AVIENA.pdf ».
   Le même calcul que la route /api/documents (action « projet »). */
export const nomProjet = (titre: string) => `Projet-${(titre || 'Document').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[’']/g, '-').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'Document'}.pdf`;

/* « Mandat de vente » → « de mandat de vente » ; « Offre d’achat » → « d’offre d’achat ». */
function deLe(titre: string) {
  const t = titre.charAt(0).toLowerCase() + titre.slice(1);
  return /^[aeiouyàâéèêh]/i.test(t) ? `d’${t}` : `de ${t}`;
}
const lieuDe = (d: Donnees) => [txt(d, 'adresse'), txt(d, 'ville')].filter(Boolean).join(', ');

export function objetProjet(m: Modele, d: Donnees) {
  const lieu = lieuDe(d);
  return `Projet ${deLe(m.titre)}${lieu ? ` · ${lieu}` : ''}`;
}
export function messageProjet(m: Modele, d: Donnees, signature: string) {
  const lieu = lieuDe(d);
  const pour = lieu ? (m.id === 'mandat_vente' ? ` pour votre bien du ${lieu}` : ` pour le bien du ${lieu}`) : '';
  return `Bonjour {{prénom}},\n\nJe vous envoie ci-joint le projet ${deLe(m.titre)}${pour}.\n\nCe n’est pas encore la version à signer : prenez le temps de le relire, et dites-moi si quelque chose doit être modifié ou complété. Je vous enverrai ensuite la version définitive pour la signature.\n\n${signature}`;
}

/* « 30 sept. à 18 h 40 » (l'année seulement si ce n'est pas la même). */
export function quandPrecis(iso: string) {
  const d = new Date(iso);
  const an = (x: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric' }).format(x);
  const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', ...(an(d) !== an(new Date()) ? { year: 'numeric' } : {}) }).format(d);
  return `${jour} à ${heureParis(d)}`;
}
/* Une date posée à la main (« Signé le… ») est un jour, pas une heure. */
const jourSeul = (iso: string) => /T12:00:00(\.0+)?(Z|\+00:00)$/.test(iso);
const quandJour = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

/* « Christine Martin », « Christine Martin et Paul Martin », « Christine
   Martin, Paul Martin et 3 autres ». */
function lesNoms(a: { email: string; nom: string }[], max = 2) {
  const n = a.map(x => x.nom || x.email);
  if (n.length <= max + 1) return n.length > 1 ? `${n.slice(0, -1).join(', ')} et ${n[n.length - 1]}` : n[0] || '';
  return `${n.slice(0, max).join(', ')} et ${n.length - max} autres`;
}

/* Le plus récent des envois d'un document. */
function leDernier(row: Pick<DocumentRow, 'envois'>): EnvoiProjet | null {
  /* V3.145 : une offre envoyée à l'agence n'est pas un projet. */
  const l = (Array.isArray(row.envois) ? row.envois : []).filter(e => !e.offre);
  return l.reduce<EnvoiProjet | null>((m, e) => (!m || Date.parse(e.le) > Date.parse(m.le) ? e : m), null);
}
/* Le brouillon a changé après cet envoi (l'enregistrement qui le précède
   immédiatement ne compte pas). */
const changeDepuis = (row: Pick<DocumentRow, 'updated_at'>, e: EnvoiProjet) => !!row.updated_at && Date.parse(row.updated_at) > Date.parse(e.le) + 1000;

/* Le dernier envoi, en une ligne courte (sous le titre de l'éditeur) ; le
   détail est dans l'infobulle. */
export function dernierEnvoi(row: DocumentRow): { court: string; long: string; modifie: boolean } | null {
  const e = leDernier(row);
  if (!e) return null;
  const q = quand(e.le);
  const qui = e.a.length === 1 ? e.a[0].nom || e.a[0].email : `${e.a.length} personnes`;
  return { court: `Projet envoyé ${/^\d/.test(q) ? `le ${q}` : q}`, long: `Projet envoyé le ${quandPrecis(e.le)} à ${qui}`, modifie: changeDepuis(row, e) };
}

/* ── L'historique d'un document : ce qui lui est arrivé, du plus récent au
      plus ancien. Un mandat de recherche signé en ligne a le sien, plus court. ── */
type Evt = { cle: string; le: string; ic: string; ton: 'gris' | 'or' | 'vert' | 'rouge' | 'bleu'; t: string; detail?: string; ko?: string; jour?: boolean };

export function evenementsDocument(d?: DocumentRow | null, x?: MandatRecherche | null, courrier = false): Evt[] {
  const l: Evt[] = [];
  if (d) {
    l.push({ cle: 'cree', le: d.created_at, ic: 'plus', ton: 'gris', t: 'Créé' });
    (Array.isArray(d.envois) ? d.envois : []).forEach((e: EnvoiProjet, i) => {
      l.push({
        cle: `p${i}`, le: e.le, ic: 'envoyer', ton: 'or', t: `${e.offre ? 'Offre envoyée' : 'Projet envoyé'} à ${e.a.length > 1 ? `${e.a.length} personnes` : e.a[0]?.nom || e.a[0]?.email || 'un contact'}`,
        detail: e.a.length > 1 ? lesNoms(e.a, 6) : e.a[0]?.nom ? e.a[0].email : undefined,
        ko: e.echecs?.length ? `Pas parti à ${e.echecs.join(', ')}` : undefined,
      });
    });
    if (d.finalise_le) l.push({ cle: 'fin', le: d.finalise_le, ic: 'check', ton: 'bleu', t: courrier ? 'Finalisé, prêt à envoyer' : 'Finalisé, prêt à signer' });
    if (d.signature?.lance_le) l.push({ cle: 'sig', le: d.signature.lance_le, ic: d.signature.mode === 'en_ligne' ? 'mail' : 'tablette', ton: 'bleu', t: d.signature.mode === 'en_ligne' ? 'Liens de signature envoyés' : 'Signature sur place lancée' });
    if (d.signe_le) l.push({ cle: 'signe', le: d.signe_le, ic: 'check', ton: 'vert', t: courrier ? 'Envoyé' : 'Signé', jour: jourSeul(d.signe_le) });
    /* V3.56 : rétracté en ligne par le client, depuis son espace. */
    const retracte = retracteEnLigne(d);
    if (retracte) l.push({ cle: 'annule', le: retracte, ic: 'croix', ton: 'rouge', t: 'Rétracté en ligne par le client', detail: 'Depuis son espace, pendant son délai de rétractation' });
    else if (d.annule_le) l.push({ cle: 'annule', le: d.annule_le, ic: 'croix', ton: 'rouge', t: 'Annulé' });
  }
  if (x) {
    l.push({ cle: 'cree', le: x.created_at, ic: 'plus', ton: 'gris', t: 'Préparé' });
    if (x.signe_le) l.push({ cle: 'signe', le: x.signe_le, ic: 'check', ton: 'vert', t: x.statut === 'partiel' ? 'Signé en ligne (une signature attendue)' : 'Signé en ligne' });
    if (x.retracte_le) l.push({ cle: 'retracte', le: x.retracte_le, ic: 'croix', ton: 'rouge', t: 'Rétracté' });
  }
  return l.sort((a, b) => Date.parse(b.le) - Date.parse(a.le));
}

export function CarteHistorique({ evts }: { evts: Evt[] }) {
  if (!evts.length) return null;
  return (
    <div className={s.carte}>
      <div className={s.carteT}>Historique</div>
      <ol className={s.histo}>
        {evts.map(e => (
          <li key={e.cle}>
            <span className={s.histoPt} data-ton={e.ton}>{e.ic === 'croix' ? <Croix t={11} /> : <Ic n={e.ic} t={12} e={e.ic === 'check' ? 3 : 2} />}</span>
            <span className={s.histoTx}>
              <b>{e.t}</b>
              <time dateTime={e.le}>{e.jour ? `le ${quandJour(e.le)}` : quandPrecis(e.le)}</time>
              {e.detail && <i>{e.detail}</i>}
              {e.ko && <i className={s.histoKo}>{e.ko}</i>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── Les personnes à qui le proposer ── */
type Propose = { cle: string; nom: string; prenom: string; famille: string; role: string; email: string };

/* Les signataires du document (l'agence mise à part), avec l'adresse saisie
   dans le document ; puis la fiche client, si son adresse n'y est pas déjà.
   Une adresse ne figure qu'une fois (une gérante qui est aussi associée). */
function proposes(m: Modele | null, doc: DocumentRow, d: Donnees, fiche: { prenom: string; nom: string; email: string } | null): Propose[] {
  const cases: CaseSignature[] = m?.cases ? m.cases(d, doc.identite || IDENTITE_DEFAUT).filter(c => !c.agence) : [];
  const out: Propose[] = [];
  for (const c of cases) {
    const p = c.personne;
    const prenom = (p?.prenom || '').trim(), famille = (p?.nom || '').trim();
    const nomP = `${prenom} ${famille}`.trim();
    const email = (p?.email || '').trim().toLowerCase();
    const deja = email ? out.find(y => y.email === email) : undefined;
    if (deja) { deja.role = `${deja.role}, ${c.qui.toLowerCase()}`; continue; }
    /* Le rôle : « Associée », « Le conjoint »… et, pour qui signe au nom
       d'une société, « Signe pour SCI … ». */
    const role = c.cle === 'sci' ? `Signe pour ${c.nom}` : nomP && famille && !c.nom.toLowerCase().includes(famille.toLowerCase()) ? `${c.qui} · ${c.nom}` : c.qui;
    out.push({ cle: c.cle, nom: nomP || c.nom, prenom, famille, role, email });
  }
  if (fiche?.email && !out.some(y => y.email === fiche.email)) {
    out.push({ cle: 'fiche', nom: `${fiche.prenom} ${fiche.nom}`.trim() || fiche.email, prenom: fiche.prenom, famille: fiche.nom, role: 'Fiche client', email: fiche.email });
  }
  return out;
}

/* ── La fenêtre ── */
export function FenetreProjet({ doc, donnees, avant, onFermer, onEnvoye }: {
  doc: DocumentRow;
  /* Les réponses à l'écran (l'éditeur), si elles sont plus fraîches que la ligne. */
  donnees?: Donnees;
  /* Avant d'envoyer : l'éditeur enregistre ce qui ne l'est pas encore. */
  avant?: () => Promise<boolean>;
  onFermer: () => void;
  onEnvoye: (r: { row: DocumentRow | null; message: string; ok: boolean }) => void;
}) {
  const m = modele(doc.modele);
  const d = donnees || doc.donnees || {};
  const [fiche, setFiche] = useState<{ prenom: string; nom: string; email: string } | null>(null);
  const liste = useMemo(() => proposes(m, doc, d, fiche), [m, doc, d, fiche]);
  const [choix, setChoix] = useState<string[] | null>(null);
  const [mails, setMails] = useState<Record<string, string>>({});
  const [autre, setAutre] = useState('');
  const [objet, setObjet] = useState(() => (m ? objetProjet(m, d) : 'Projet'));
  const [signature, setSignature] = useState(() => signatureDe({}));
  const [texte, setTexte] = useState<string | null>(null);
  const [en, setEn] = useState('');
  const [erreur, setErreur] = useState('');
  const [manque, setManque] = useState<string[]>([]);

  /* La signature des mails (Paramètres), et la fiche client du document. */
  useEffect(() => {
    let vivant = true;
    supabase.from('parametres').select('cle, valeur').in('cle', CLES_MAIL).then(({ data }) => {
      if (vivant && data) setSignature(signatureDe(Object.fromEntries(data.map((r: { cle: string; valeur: string | null }) => [r.cle, r.valeur || '']))));
    });
    if (doc.client_id) {
      supabase.from('clients').select('prenom, nom, emails').eq('id', doc.client_id).maybeSingle().then(({ data }) => {
        const c = data as { prenom?: string | null; nom?: string | null; emails?: string[] | null } | null;
        const email = String(c?.emails?.[0] || '').trim().toLowerCase();
        if (vivant && c && email) setFiche({ prenom: (c.prenom || '').trim(), nom: (c.nom || '').trim(), email });
      });
    }
    return () => { vivant = false; };
  }, [doc.client_id]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !en) { e.stopPropagation(); onFermer(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [en, onFermer]);

  /* Personne n'est coché d'office, sauf quand le document n'a qu'un
     signataire (la fiche client, arrivée après, n'y change rien). */
  const signataires = liste.filter(p => p.cle !== 'fiche');
  const coches = choix ?? (signataires.length === 1 ? [signataires[0].cle] : []);
  const basculer = (cle: string) => { setChoix(coches.includes(cle) ? coches.filter(y => y !== cle) : [...coches, cle]); setManque([]); setErreur(''); };
  const tousCoches = liste.length > 0 && liste.every(p => coches.includes(p.cle));
  const autres = autre.split(/[\s,;]+/).map(y => y.trim().toLowerCase()).filter(Boolean);
  const autresOk = autres.filter(y => MAIL.test(y));
  const choisis = liste.filter(p => coches.includes(p.cle));
  const mailDe = (p: Propose) => (p.email || mails[p.cle] || '').trim().toLowerCase();
  const tous: DestProjet[] = [
    ...choisis.map(p => ({ email: mailDe(p), nom: p.nom, prenom: p.prenom, famille: p.famille })),
    ...autresOk.filter(y => !choisis.some(p => mailDe(p) === y)).map(y => ({ email: y, nom: '', prenom: '', famille: '' })),
  ];
  const message = texte ?? (m ? messageProjet(m, d, signature) : '');
  const fichier = nomProjet(doc.titre || m?.titre || 'Document');
  const dernier = leDernier(doc);

  async function voir() {
    if (!m) return;
    const onglet = window.open('', '_blank');
    setEn('apercu'); setErreur('');
    try {
      const identite = await identiteDuJour().catch(() => doc.identite || IDENTITE_DEFAUT);
      montrerPdf(onglet, await pdfDocument(m, d, identite, { projet: true }));
    } catch (e) {
      onglet?.close();
      setErreur('Le PDF n’a pas pu être préparé : ' + (e as Error).message);
    }
    setEn('');
  }

  async function envoyer() {
    const sansMail = choisis.filter(p => !MAIL.test(mailDe(p)));
    if (sansMail.length) { setManque(sansMail.map(p => p.cle)); setErreur(sansMail.length > 1 ? 'Il manque des adresses e-mail.' : `Il manque l’adresse e-mail de ${sansMail[0].nom}.`); return; }
    if (autres.length > autresOk.length) { setErreur(`Cette adresse ne semble pas complète : ${autres.filter(y => !MAIL.test(y)).join(', ')}`); return; }
    if (!tous.length) { setErreur('Coche au moins une personne, ou tape une adresse.'); return; }
    if (!objet.trim() || !message.trim()) { setErreur('L’objet et le message ne peuvent pas être vides.'); return; }
    setEn('envoi'); setErreur('');
    try {
      if (avant && !(await avant())) throw new Error('La dernière modification du document n’est pas enregistrée. Réessaie dans un instant.');
      const r = await envoyerProjet({ id: doc.id, destinataires: tous, sujet: objet.trim(), message: message.trim() });
      const qui = r.envoyes.length > 1 ? `${r.envoyes.length} personnes` : tous.find(x => x.email === r.envoyes[0])?.nom || r.envoyes[0];
      onEnvoye({
        row: r.row, ok: !r.avertissements.length,
        message: `Projet envoyé à ${qui}. Le document reste en brouillon : tu peux encore le modifier et renvoyer une nouvelle version.${r.avertissements.length ? ` ${r.avertissements.join(' · ')}` : ''}`,
      });
    } catch (e) {
      setErreur((e as Error).message);
      setEn('');
    }
  }

  const bouton = tous.length === 1 ? `Envoyer à ${tous[0].prenom || tous[0].nom || tous[0].email}` : tous.length > 1 ? `Envoyer à ${tous.length} personnes` : 'Envoyer';

  return (
    <div className={s.fenetre} onClick={e => { if (e.target === e.currentTarget && !en) onFermer(); }}>
      <div className={s.fenetreIn} role="dialog" aria-modal="true" aria-label="Envoyer le projet">
        <div className={s.fenTete}>
          <div style={{ flex: '1 1 auto' }}>
            <h3>Envoyer le projet</h3>
            <p>{'Pour une relecture, avant toute signature : le PDF part marqué « Projet non signé ». Le document reste un brouillon, rien n’est à annuler pour le corriger.'}</p>
          </div>
          <button type="button" className={s.panFermer} aria-label="Fermer" onClick={onFermer} disabled={!!en}><Croix /></button>
        </div>

        <div className={s.fenCorps}>
          {dernier && (
            <div className={s.note}>{`Déjà envoyé le ${quandPrecis(dernier.le)} à ${lesNoms(dernier.a)}.${changeDepuis(doc, dernier) ? ' Le document a changé depuis.' : ''}`}</div>
          )}

          <div className={s.zone}>
            <div className={s.zoneT}>
              <span>{`À qui${coches.length ? ` · ${tous.length} choisi${tous.length > 1 ? 's' : ''}` : ''}`}</span>
              {liste.length > 1 && <button type="button" className={s.btnLien} onClick={() => setChoix(tousCoches ? [] : liste.map(p => p.cle))}>{tousCoches ? 'Tout décocher' : 'Tout cocher'}</button>}
            </div>
            {liste.length > 0 && (
              <div className={s.dests}>
                {liste.map(p => {
                  const on = coches.includes(p.cle);
                  return (
                    <div key={p.cle}>
                      <button type="button" className={s.dest} aria-pressed={on} onClick={() => basculer(p.cle)}>
                        <span className={s.destCoche}><Ic n="check" t={11} e={3.2} /></span>
                        <span className={s.destTx}>
                          <b>{p.nom}</b>
                          <small className={p.email ? undefined : s.destSans}>{`${p.role} · ${p.email || 'pas d’adresse dans le document'}`}</small>
                        </span>
                      </button>
                      {on && !p.email && (
                        <input type="email" inputMode="email" autoComplete="off" autoFocus aria-label={`Adresse e-mail de ${p.nom}`}
                          className={`${s.input} ${s.destMail} ${manque.includes(p.cle) ? s.inputManque : ''}`} placeholder="adresse@exemple.fr"
                          value={mails[p.cle] || ''} onChange={e => { const v = e.target.value; setMails(x => ({ ...x, [p.cle]: v })); setManque([]); }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className={s.champLigne}>
              <label htmlFor="pj-autre">{liste.length ? 'Ou une autre adresse' : 'Adresse e-mail'}</label>
              <input id="pj-autre" type="text" inputMode="email" autoComplete="off" className={s.input} placeholder="notaire@etude.fr"
                value={autre} onChange={e => { setAutre(e.target.value); setErreur(''); }} />
              <i className={s.chAide}>{liste.length ? 'Plusieurs ? Sépare-les par une virgule.' : 'Aucune adresse dans le document : tape-la ici. Plusieurs ? Sépare-les par une virgule.'}</i>
            </div>
          </div>

          <div className={s.pj}>
            <Ic n="doc" t={16} />
            <span><b>{fichier}</b>{' · marqué « Projet non signé » sur chaque page. '}<button type="button" className={s.btnLien} disabled={!!en} onClick={voir}>{en === 'apercu' ? 'Préparation…' : 'Le voir'}</button></span>
          </div>

          <div className={s.champLigne}>
            <label htmlFor="pj-objet">Objet</label>
            <input id="pj-objet" className={s.input} value={objet} onChange={e => setObjet(e.target.value)} />
          </div>
          <div className={s.champLigne}>
            <div className={s.labelLien}>
              <label htmlFor="pj-texte">Message</label>
              {texte !== null && <button type="button" className={s.btnLien} onClick={() => setTexte(null)}>Revenir au message proposé</button>}
            </div>
            <textarea id="pj-texte" className={s.input} rows={11} value={message} onChange={e => setTexte(e.target.value)} />
            <i className={s.chAide}>{'{{prénom}} est remplacé par le prénom de chacun : un mail par personne, personne ne voit l’adresse des autres.'}</i>
          </div>
          {erreur && <div className={s.erreur}>{erreur}</div>}
        </div>

        <div className={s.fenPied}>
          <button type="button" className={s.btn} disabled={!!en} onClick={onFermer}>Annuler</button>
          <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={!!en || (!tous.length && !choisis.length)} onClick={envoyer}>
            <Ic n="envoyer" t={15} />{en === 'envoi' ? 'Envoi…' : bouton}
          </button>
        </div>
      </div>
    </div>
  );
}
