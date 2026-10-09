'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { euros } from '@/lib/mandat';
import { jourLong, lirePersonnes, num, txt, type Donnees } from '@/lib/actes';
import { CLES_MAIL, signatureDe } from '@/lib/mail-variables';
import { Croix, Ic } from './ApercuActe';
import { envoyerOffre, lienFichier, nomFichier, type DocumentRow } from './outils';
import { quandPrecis } from './EnvoiProjet';
import s from './Documents.module.css';

/* ═══ « Envoyer l'offre à l'agence » (V3.145) ═════════════════════════════
   L'offre d'achat est signée : elle part à l'agence du vendeur — ou au
   vendeur lui-même, s'il vend seul. Le fichier signé tel qu'il est rangé
   (scellé avec son certificat, ou le scan d'une offre signée à la main), en
   pièce jointe, et rien d'autre : les honoraires d'Alexandre ne sont pas
   dans l'offre (src/lib/actes/offre-achat.ts), l'agence ne les voit pas.
   L'envoi est noté dans le document, dans le Suivi du client et dans celui
   du confrère s'il est dans le CRM (/api/documents, action « offre »). */

const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function objetOffre(d: Donnees) {
  const lieu = [txt(d, 'adresse'), txt(d, 'ville')].filter(Boolean).join(', ');
  return `Offre d’achat${lieu ? ` · ${lieu}` : ''}`;
}

export function messageOffre(d: Donnees, signature: string) {
  const lieu = [txt(d, 'adresse'), txt(d, 'ville')].filter(Boolean).join(', ');
  const pl = lirePersonnes(d.acquereurs).length > 1;
  const prix = num(d, 'prix');
  const jusquau = txt(d, 'validite')
    ? `${jourLong(txt(d, 'validite'))}${txt(d, 'validiteHeure') ? ` à ${txt(d, 'validiteHeure').replace(':', ' h ')}` : ''}`
    : '';
  const prixTxt = prix ? `, au prix de ${euros(prix)}${d.forme === 'fai' ? ', frais d’agence inclus' : ''}` : '';
  return `Bonjour,\n\nJe vous transmets ci-joint l’offre d’achat signée de ${pl ? 'mes clients' : 'mon client'} pour le bien${lieu ? ` situé ${lieu}` : ''}${prixTxt}.\n\n${jusquau ? `Elle est valable jusqu’au ${jusquau}. ` : ''}Merci de la présenter au vendeur et de me faire part de sa réponse${jusquau ? ' avant cette date' : ''}.\n\n${signature}`;
}

/* Les offres déjà envoyées de ce document. */
const offresEnvoyees = (row: DocumentRow) => (Array.isArray(row.envois) ? row.envois : []).filter(e => e.offre);

export function FenetreOffre({ doc, onFermer, onEnvoye }: {
  doc: DocumentRow;
  onFermer: () => void;
  onEnvoye: (r: { row: DocumentRow | null; message: string; ok: boolean }) => void;
}) {
  const d = doc.donnees || {};
  const [a, setA] = useState('');
  const [objet, setObjet] = useState(() => objetOffre(d));
  const [signature, setSignature] = useState(() => signatureDe({}));
  const [texte, setTexte] = useState<string | null>(null);
  const [en, setEn] = useState('');
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let vivant = true;
    supabase.from('parametres').select('cle, valeur').in('cle', CLES_MAIL).then(({ data }) => {
      if (vivant && data) setSignature(signatureDe(Object.fromEntries(data.map((r: { cle: string; valeur: string | null }) => [r.cle, r.valeur || '']))));
    });
    return () => { vivant = false; };
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !en) { e.stopPropagation(); onFermer(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [en, onFermer]);

  const adresses = a.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
  const valables = adresses.filter(x => MAIL.test(x));
  const message = texte ?? messageOffre(d, signature);
  /* Le même nom que la pièce jointe (route /api/documents, action « offre »). */
  const ext = ((doc.signe_chemin || '').split('.').pop() || 'pdf').toLowerCase().replace('jpeg', 'jpg');
  const fichier = nomFichier(doc, '-signe').replace(/\.pdf$/, `.${ext}`);
  const deja = offresEnvoyees(doc);
  const dernier = deja.length ? deja[deja.length - 1] : null;

  async function voir() {
    if (!doc.signe_chemin) return;
    const onglet = window.open('', '_blank');
    setEn('apercu'); setErreur('');
    try {
      const url = await lienFichier(doc.signe_chemin);
      if (onglet) onglet.location.href = url; else window.location.href = url;
    } catch (e) {
      onglet?.close();
      setErreur('L’exemplaire signé n’a pas pu être ouvert : ' + (e as Error).message);
    }
    setEn('');
  }

  async function envoyer() {
    if (!valables.length) { setErreur('Tape l’adresse e-mail de l’agence du vendeur (ou du vendeur).'); return; }
    if (valables.length < adresses.length) { setErreur(`Cette adresse ne semble pas complète : ${adresses.filter(x => !MAIL.test(x)).join(', ')}`); return; }
    if (!objet.trim() || !message.trim()) { setErreur('L’objet et le message ne peuvent pas être vides.'); return; }
    setEn('envoi'); setErreur('');
    try {
      const r = await envoyerOffre({ id: doc.id, destinataires: valables, sujet: objet.trim(), message: message.trim() });
      onEnvoye({
        row: r.row, ok: !r.avertissements.length,
        message: `Offre envoyée à ${r.envoyes.join(', ')}.${r.avertissements.length ? ` ${r.avertissements.join(' · ')}` : ''}`,
      });
    } catch (e) {
      setErreur((e as Error).message);
      setEn('');
    }
  }

  return (
    <div className={s.fenetre} onClick={e => { if (e.target === e.currentTarget && !en) onFermer(); }}>
      <div className={s.fenetreIn} role="dialog" aria-modal="true" aria-label="Envoyer l’offre à l’agence">
        <div className={s.fenTete}>
          <div style={{ flex: '1 1 auto' }}>
            <h3>{'Envoyer l’offre à l’agence'}</h3>
            <p>{'L’offre signée part en pièce jointe, et elle seule : tes honoraires n’y sont pas écrits, l’agence ne les voit pas.'}</p>
          </div>
          <button type="button" className={s.panFermer} aria-label="Fermer" onClick={onFermer} disabled={!!en}><Croix /></button>
        </div>

        <div className={s.fenCorps}>
          {dernier && <div className={s.note}>{`Déjà envoyée le ${quandPrecis(dernier.le)} à ${dernier.a.map(x => x.email).join(', ')}.`}</div>}

          <div className={s.champLigne}>
            <label htmlFor="of-a">À</label>
            <input id="of-a" type="text" inputMode="email" autoComplete="off" autoFocus className={s.input} placeholder="agence@exemple.fr"
              value={a} onChange={e => { setA(e.target.value); setErreur(''); }} />
            <i className={s.chAide}>{`L’agence du vendeur${txt(d, 'agenceVendeur') ? ` (${txt(d, 'agenceVendeur')})` : ''}, ou le vendeur s’il vend seul. Plusieurs ? Sépare-les par une virgule.`}</i>
          </div>

          <div className={s.pj}>
            <Ic n="doc" t={16} />
            <span><b>{fichier}</b>{num(d, 'prix') ? ` · ${euros(num(d, 'prix') || 0)}` : ''}{' · '}<button type="button" className={s.btnLien} disabled={!!en} onClick={voir}>{en === 'apercu' ? 'Ouverture…' : 'La voir'}</button></span>
          </div>

          <div className={s.champLigne}>
            <label htmlFor="of-objet">Objet</label>
            <input id="of-objet" className={s.input} value={objet} onChange={e => setObjet(e.target.value)} />
          </div>
          <div className={s.champLigne}>
            <div className={s.labelLien}>
              <label htmlFor="of-texte">Message</label>
              {texte !== null && <button type="button" className={s.btnLien} onClick={() => setTexte(null)}>Revenir au message proposé</button>}
            </div>
            <textarea id="of-texte" className={s.input} rows={10} value={message} onChange={e => setTexte(e.target.value)} />
          </div>
          {erreur && <div className={s.erreur}>{erreur}</div>}
        </div>

        <div className={s.fenPied}>
          <button type="button" className={s.btn} disabled={!!en} onClick={onFermer}>Annuler</button>
          <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={!!en || !valables.length} onClick={envoyer}>
            <Ic n="envoyer" t={15} />{en === 'envoi' ? 'Envoi…' : 'Envoyer l’offre'}
          </button>
        </div>
      </div>
    </div>
  );
}
