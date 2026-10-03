'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { aujourdhui, modele } from '@/lib/actes';
import { jourParis } from '@/lib/mandat';
import { Croix, Ic } from './ApercuActe';
import { CHANGE_ENTRE_TEMPS, apresSignature, deposer, vuDansEspace, type DocumentRow } from './outils';
import s from './Documents.module.css';

/* ═══ « Le document est signé » : la date, et l'exemplaire signé ═══════════
   Un document signé à la main (imprimé, signé, scanné) : Alexandre dit qu'il
   est signé, et dépose le scan ou la photo de l'exemplaire signé par tout le
   monde. Déjà signé sans exemplaire : la même fenêtre le dépose plus tard
   (`signe_chemin`). Un courrier : « Il est envoyé », avec sa preuve d'envoi.

   V3.55 (Alexandre : « si c'est fait à l'écrit, son espace doit être à jour ;
   c'est à moi de joindre le PDF signé, et il me faut un petit avertissement
   pour ne pas l'oublier ») : l'exemplaire est demandé clairement ; pour un
   document que le client retrouve dans son espace (vuDansEspace), la fenêtre
   le dit, et « signé sans l'exemplaire » prévient qu'il ne le verra pas.
   Sortie de PageDocuments pour servir aussi sur la fiche d'un client et sur
   celle d'un bien. */

export default function FenetreSigne({ doc, onFermer, onFait, onRelu }: {
  doc: DocumentRow; onFermer: () => void; onFait: (d: DocumentRow) => void;
  /* V3.56 : l'enregistrement a été refusé (le document a bougé) : la fiche
     reçoit le document relu, la fenêtre reste ouverte et dit pourquoi. */
  onRelu?: (d: DocumentRow) => void;
}) {
  const dejaSigne = doc.statut === 'signe';
  const m = modele(doc.modele);
  const courrier = !!m?.courrier;
  const espace = !courrier && vuDansEspace(doc);
  const [jour, setJour] = useState(doc.signe_le ? jourParis(doc.signe_le) : aujourdhui());
  const [fichier, setFichier] = useState<File | null>(null);
  const [travail, setTravail] = useState(false);
  const [erreur, setErreur] = useState('');

  async function valider(sansFichier: boolean) {
    if (!sansFichier && !fichier) { setErreur(courrier ? 'Choisis la preuve d’envoi (accusé, capture de l’e-mail envoyé…).' : 'Choisis le scan ou la photo de l’exemplaire signé.'); return; }
    if (sansFichier && !courrier && !confirm(espace
      ? 'Marquer signé sans l’exemplaire signé ?\n\nSans lui, ton client ne pourra pas voir ce document dans son espace. Un rappel reste affiché sur le document tant qu’il n’est pas déposé.\n\nGarde bien l’original papier.'
      : 'Marquer signé sans l’exemplaire signé ?\n\nMieux vaut le garder ici, avec le document : tu pourras le déposer plus tard depuis sa fiche. Garde bien l’original papier.')) return;
    setTravail(true); setErreur('');
    try {
      let chemin = doc.signe_chemin;
      if (fichier) {
        const ext = (fichier.name.split('.').pop() || '').toLowerCase() || (fichier.type === 'application/pdf' ? 'pdf' : 'jpg');
        chemin = await deposer(doc.id, 'signe', fichier, ext);
      }
      /* V3.50 : seulement s'il est toujours dans l'état que la page montre.
         V3.56 : pas encore signé, et seulement s'il n'est pas parti en
         signature en ligne ou sur place entre-temps (une page restée
         ouverte le marquait « signé, papier » pendant que les liens
         couraient), ni refinalisé depuis (un autre texte que celui que la
         page montre). La colonne `signature` n'existe qu'après son SQL. */
      let maj = supabase.from('documents').update({
        statut: 'signe', signe_le: `${jour}T12:00:00Z`, signe_chemin: chemin || null, updated_at: new Date().toISOString(),
      }).eq('id', doc.id).eq('statut', doc.statut);
      if (!dejaSigne) {
        if ('signature' in doc) maj = maj.is('signature', null);
        maj = doc.finalise_le ? maj.eq('finalise_le', doc.finalise_le) : maj.is('finalise_le', null);
      }
      const { data, error } = await maj.select().maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        /* Refusé : on relit le document, la fiche se met à jour, et la
           fenêtre dit pourquoi. */
        const { data: frais } = await supabase.from('documents').select('*').eq('id', doc.id).maybeSingle();
        const f = (frais as DocumentRow | null) || null;
        if (f) onRelu?.(f);
        setErreur(f && f.statut === 'pret' && f.signature
          ? `Rien n’est enregistré : ce document est parti en signature ${f.signature.mode === 'sur_place' ? 'sur place' : 'en ligne'} entre-temps. Il se range tout seul une fois signé par tous ; pour le signer sur papier à la place, arrête d’abord cette signature.`
          : f && f.statut === 'signe'
            ? 'Rien n’est enregistré : ce document a été marqué signé entre-temps. La fiche est à jour.'
            : `Rien n’est enregistré. ${CHANGE_ENTRE_TEMPS}`);
        setTravail(false);
        return;
      }
      /* Un mandat de recherche papier remplit le bloc Mandat de sa recherche
         (une seule fois : à la première signature). */
      if (!dejaSigne && m) {
        const pb = await apresSignature(data as DocumentRow, m, jour);
        if (pb) alert(pb);
      }
      onFait(data as DocumentRow);
    } catch (e) {
      setErreur('L’enregistrement a échoué : ' + (e as Error).message);
      setTravail(false);
    }
  }

  return (
    <div className={s.fenetre} onClick={e => { if (e.target === e.currentTarget && !travail) onFermer(); }}>
      <div className={s.fenetreIn} role="dialog" aria-modal="true" aria-label={courrier ? 'Courrier envoyé' : 'Document signé'}>
        <div className={s.fenTete}>
          <div style={{ flex: '1 1 auto' }}>
            <h3>{courrier ? (dejaSigne ? 'Déposer la preuve d’envoi' : 'Le courrier est envoyé') : dejaSigne ? 'Déposer l’exemplaire signé' : 'Le document est signé'}</h3>
            <p>{courrier
              ? 'Garde la preuve de l’envoi avec le courrier : l’accusé du recommandé, ou une capture de l’e-mail envoyé. Elle est facultative, mais c’est elle qui prouve que le client a été prévenu à temps.'
              : m?.surRecherche && m.numero && doc.recherche_id
                ? 'Dépose le scan ou une photo de l’exemplaire signé par tout le monde. Le bloc Mandat de sa recherche se remplit tout seul : son espace ne lui proposera plus de signer en ligne.'
                : m?.surRecherche && doc.recherche_id
                  ? 'Dépose le scan ou une photo de l’exemplaire signé par tout le monde. S’il change la fin du mandat ou les honoraires, sa recherche se met à jour toute seule.'
                  : doc.modele === 'avenant_vente'
                    ? 'Dépose le scan ou une photo de l’exemplaire signé par tout le monde. S’il change le prix, les honoraires ou la fin du mandat, la fiche du bien se met à jour toute seule.'
                    : 'Dépose le scan ou une photo de l’exemplaire signé par tout le monde : il reste ici, rangé avec le document.'}</p>
          </div>
          <button type="button" className={s.panFermer} aria-label="Fermer" onClick={onFermer} disabled={travail}><Croix /></button>
        </div>
        <div className={s.fenCorps}>
          <div className={s.champLigne}>
            <label htmlFor="sg-jour">{courrier ? 'Envoyé le' : 'Signé le'}</label>
            <input id="sg-jour" type="date" className={s.input} value={jour} max={aujourdhui()} onChange={e => setJour(e.target.value)} />
          </div>
          <label className={s.fichier}>
            <input type="file" accept="application/pdf,image/*" onChange={e => setFichier(e.target.files?.[0] || null)} />
            <span className={s.ligneIc}><Ic n={courrier ? 'doc' : 'trombone'} t={18} /></span>
            <span>{fichier
              ? <><b>{fichier.name}</b>{` · ${Math.max(1, Math.round(fichier.size / 1024))} Ko`}</>
              : courrier ? <><b>Choisir le fichier</b>{' (facultatif)'}</> : <><b>Choisir l’exemplaire signé</b>{' · PDF, scan ou photo'}</>}</span>
          </label>
          {/* V3.55 : ce que l'exemplaire change pour le client. */}
          {espace && (
            <div className={s.depotNote}>
              <Ic n="oeil" t={15} />
              <span>{'Ton client retrouvera ce document dans son espace avec l’exemplaire signé. Sans lui, il ne le voit pas.'}</span>
            </div>
          )}
          {erreur && <div className={s.erreur}>{erreur}</div>}
        </div>
        <div className={s.fenPied}>
          {!dejaSigne && <button type="button" className={s.btnLien} disabled={travail} onClick={() => valider(true)}>{courrier ? 'Envoyé, sans preuve à déposer' : 'Signé, je déposerai l’exemplaire plus tard'}</button>}
          <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={travail} onClick={() => valider(false)}>
            {travail ? 'Enregistrement…' : dejaSigne ? 'Déposer' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
