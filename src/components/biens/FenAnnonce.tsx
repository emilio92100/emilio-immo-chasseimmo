'use client';

/* ═══ Modifier l'annonce, dans une fenêtre (V3.80) ══════════════════════════
   Alexandre : « quand on fait Modifier l'annonce, ça renvoie sur la fiche ;
   est-ce qu'on pourrait pas plutôt mettre un petit pop-up qui reprend
   l'annonce, dans lequel on modifie, et qui indique les caractères ou les
   mentions ». Le titre, le texte, sa longueur (2 100 caractères au moins),
   les mentions obligatoires, et trois outils : aérer en paragraphes,
   reformuler avec l'IA, ajouter les mentions à la fin. Rien n'est écrit
   dans la fiche avant « Enregistrer ». */

import { useState } from 'react';
import { LONGUEUR_ANNONCE } from '@/lib/biens-vente';
import { aererTexte, texteEnBloc } from '@/lib/annonce-texte';
import { Ic } from '@/components/documents/ApercuActe';
import { Fenetre } from './FenetresBien';
import s from '@/components/documents/Documents.module.css';
import a from './FenAnnonce.module.css';

const fr = (n: number) => n.toLocaleString('fr-FR');

export default function FenAnnonce({ titre: titre0, texte: texte0, mentions, mentionsTexte, onReformuler, onEnregistrer, onFiche, onFermer }: {
  titre: string; texte: string;
  mentions: { ok: boolean; l: string; aide?: string }[];
  /* Les mentions telles qu'elles s'écrivent dans l'annonce (mentionsAnnonce). */
  mentionsTexte?: string;
  onReformuler?: (brouillon: { titre: string; texte: string }) => Promise<{ titre: string; texte: string }>;
  onEnregistrer: (titre: string, texte: string) => void;
  /* Compléter la fiche (une mention manque : le prix, le DPE…). */
  onFiche?: () => void;
  onFermer: () => void;
}) {
  const [titre, setTitre] = useState(titre0);
  const [texte, setTexte] = useState(texte0);
  const [ecrit, setEcrit] = useState(false);
  const [erreur, setErreur] = useState('');
  /* La version d'avant un outil (IA, paragraphes, mentions) : un clic la remet. */
  const [avant, setAvant] = useState<{ titre: string; texte: string; quoi: string } | null>(null);
  const [quitter, setQuitter] = useState(false);
  const [copie, setCopie] = useState(false);
  const modifie = titre !== titre0 || texte !== texte0;
  const n = texte.length;
  const assez = n >= LONGUEUR_ANNONCE;
  const manque = mentions.filter(x => !x.ok);
  const enBloc = texteEnBloc(texte);
  /* Déjà là : les mentions du CRM, ou celles qu'ImmoFacile avait écrites
     (elles finissent toujours par Géorisques). */
  const mentionsDedans = !!mentionsTexte && (texte.includes(mentionsTexte.split('\n')[0]) || /g[ée]orisques/i.test(texte));

  const outil = (quoi: string, t: string, x: string) => { setAvant({ titre, texte, quoi }); setTitre(t); setTexte(x); setErreur(''); };
  const reformuler = async () => {
    if (!onReformuler || ecrit) return;
    setEcrit(true); setErreur('');
    try {
      const r = await onReformuler({ titre, texte });
      outil('L’IA a écrit une nouvelle version.', r.titre, r.texte);
    } catch (e) { setErreur((e as Error).message); }
    finally { setEcrit(false); }
  };
  const fermer = () => {
    if (ecrit) return;
    if (modifie && !quitter) { setQuitter(true); return; }
    onFermer();
  };

  return (
    <Fenetre sur="Le texte de l’annonce" couleur="#c9a84c" titre="Modifier l’annonce" large occupe={ecrit} onFermer={fermer}
      pied={quitter ? (
        <div className={a.quitter}>
          <span>Les changements ne sont pas enregistrés.</span>
          <button type="button" className={s.btn} onClick={() => setQuitter(false)}>Continuer</button>
          <button type="button" className={s.btn} onClick={onFermer}>Fermer sans enregistrer</button>
        </div>
      ) : (
        <>
          <button type="button" className={s.btn} onClick={fermer} disabled={ecrit}>Annuler</button>
          <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={ecrit || !modifie} onClick={() => { onEnregistrer(titre.trim(), texte.trim()); onFermer(); }}>Enregistrer</button>
        </>
      )}>
      <div className={a.corps}>
        <label className={a.champ}>
          <span>Titre de l’annonce</span>
          <input className={s.input} value={titre} onChange={e => { setTitre(e.target.value); setQuitter(false); }} placeholder="Ex. : Appartement familial lumineux avec balcon" maxLength={140} />
        </label>

        <div className={a.outils}>
          {onReformuler && (
            <button type="button" className={`${a.outil} ${a.outilIa}`} onClick={reformuler} disabled={ecrit} aria-busy={ecrit}>
              {ecrit ? <span className={a.roue} aria-hidden="true" /> : <Ic n="etincelle" t={14} e={2.1} />}
              {ecrit ? 'L’IA écrit…' : texte ? 'Reformuler avec l’IA' : 'Rédiger avec l’IA'}
            </button>
          )}
          {enBloc && (
            <button type="button" className={a.outil} disabled={ecrit} onClick={() => outil('Le texte est aéré en paragraphes.', titre, aererTexte(texte))}>
              <Ic n="lignes" t={14} e={2.1} />Aérer en paragraphes
            </button>
          )}
          {mentionsTexte && texte && !mentionsDedans && (
            <button type="button" className={a.outil} disabled={ecrit} onClick={() => outil('Les mentions obligatoires sont ajoutées à la fin.', titre, `${texte.trim()}\n\n${mentionsTexte}`)}>
              <Ic n="plus" t={14} e={2.3} />Ajouter les mentions à la fin
            </button>
          )}
          <span className={a.vide} />
          {texte && (
            <button type="button" className={a.outil} onClick={() => { navigator.clipboard?.writeText(titre ? `${titre}\n\n${texte}` : texte).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1600); }).catch(() => {}); }}>
              <Ic n={copie ? 'check' : 'copier'} t={14} />{copie ? 'Copié' : 'Copier'}
            </button>
          )}
        </div>

        {(erreur || avant) && (
          <div className={erreur ? s.erreur : a.info} role="status">
            {erreur || avant?.quoi}
            {!erreur && avant && (
              <button type="button" onClick={() => { setTitre(avant.titre); setTexte(avant.texte); setAvant(null); }}>
                <Ic n="retour" t={13} />Revenir au texte d’avant
              </button>
            )}
          </div>
        )}

        <textarea className={`${s.input} ${a.texte} ${ecrit ? a.texteEcrit : ''}`} value={texte} disabled={ecrit} spellCheck
          onChange={e => { setTexte(e.target.value); setQuitter(false); }}
          placeholder="Le texte de l’annonce, tel qu’il partira sur les portails. Une ligne vide entre deux paragraphes." />

        <div className={a.longueur} data-ok={assez ? 'oui' : 'non'}>
          <span className={a.barre}><i style={{ width: `${Math.min(100, (n / LONGUEUR_ANNONCE) * 100)}%` }} /></span>
          <span>{assez ? `${fr(n)} caractères · les ${fr(LONGUEUR_ANNONCE)} sont atteints` : `${fr(n)} caractères · encore ${fr(LONGUEUR_ANNONCE - n)} pour atteindre ${fr(LONGUEUR_ANNONCE)}`}</span>
        </div>

        {mentions.length > 0 && (
          <div className={a.mentions}>
            <div className={a.mentionsT}>
              <b>Mentions obligatoires</b>
              <span data-ok={manque.length ? 'non' : 'oui'}>{`${mentions.length - manque.length} sur ${mentions.length}`}</span>
              {manque.length > 0 && onFiche && <button type="button" className={a.lien} onClick={onFiche}>Compléter la fiche</button>}
            </div>
            <ul>
              {mentions.map(x => (
                <li key={x.l} data-ok={x.ok ? 'oui' : 'non'} title={x.aide}><span><Ic n={x.ok ? 'check' : 'croix'} t={11} e={3} /></span>{x.l}</li>
              ))}
            </ul>
            {manque.length > 0 && <p className={a.mentionsNote}>Elles se remplissent depuis la fiche du bien (prix, honoraires, DPE, copropriété), puis « Ajouter les mentions à la fin » les écrit dans le texte.</p>}
          </div>
        )}
      </div>
    </Fenetre>
  );
}
