'use client';
import { useEffect, useState } from 'react';
import AvatarContact, { type Personne } from '@/components/contacts/AvatarContact';
import { Ic } from '@/components/documents/ApercuActe';
import { FenetreMail, type ContactMail } from '@/components/pages/PageMail';
import type { ClientMini } from './outils';
import b from './Biens.module.css';

/* ═══ Le propriétaire, à cheval sur le haut du bandeau (V3.53) ════════════
   Alexandre : « le propriétaire, il est en bas, c'est un bloc en bas ; qu'on
   voie à qui appartient ce logement, qu'on soit dans Photos, Surfaces… ».
   Une pastille sur tous les onglets, posée à cheval sur le haut du bandeau
   bleu (« qu'il empiète sur le bloc bleu, que ce soit plus visible ») :
   FicheBien la place dans `.proprioCheval`. Un clic l'ouvre : ses
   coordonnées, Appeler, Écrire (la trame de « Nouveau mail », sans quitter
   le bien), Sa fiche. Sans propriétaire, elle propose de le renseigner. */

export function PastilleProprio({ nom, pluriel, personne, societe, pour, sous, tel, mail, onFiche, onRenseigner, onApres }: {
  nom: string; pluriel: boolean;
  /* Sa fiche dans le CRM (null : un nom saisi sans fiche reliée). */
  personne: ClientMini | null;
  societe?: boolean;
  /* Il agit au nom d'une société : laquelle, et son rôle. */
  pour?: { nom: string; role: string } | null;
  sous?: string; tel: string; mail: string;
  onFiche?: () => void; onRenseigner: () => void;
  /* Un mail parti : l'historique du bien se relit. */
  onApres?: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [ecrire, setEcrire] = useState(false);
  useEffect(() => {
    if (!ouvert) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [ouvert]);

  /* Personne n'est renseigné : la pastille mène à l'éditeur. */
  if (!nom) {
    return (
      <div className={b.pProprio}>
        <button type="button" className={`${b.pProprioBtn} ${b.pProprioVide}`} onClick={onRenseigner}>
          <span className={b.pProprioIcVide}><Ic n="personne" t={15} /></span>
          <span className={b.pProprioTx}><small>Propriétaire</small><b>À renseigner</b></span>
          <Ic n="plus" t={14} e={2.4} />
        </button>
      </div>
    );
  }

  const c: Personne = { ...(personne || { prenom: nom }), couple: pluriel } as Personne;
  const brut = tel.replace(/[\s.]+/g, '');
  const role = pour ? (pour.role ? `${pour.role} de ${pour.nom}` : `Pour ${pour.nom}`) : '';
  /* Écrire : depuis le CRM quand sa fiche a une adresse (le mail se range
     dans son Suivi) ; sinon, la messagerie de l'ordinateur. */
  const parCrm = !!personne && !!personne.emails?.some(Boolean);
  return (
    <div className={b.pProprio}>
      <button type="button" className={b.pProprioBtn} aria-haspopup="dialog" aria-expanded={ouvert} onClick={() => setOuvert(o => !o)}>
        <AvatarContact c={c} teinte={{ bg: '', fg: '#a07c28' }} taille={34} societe={societe} />
        <span className={b.pProprioTx}><small>{pluriel ? 'Propriétaires' : 'Propriétaire'}</small><b>{nom}</b></span>
        <Ic n="bas" t={13} e={2.4} />
      </button>
      {ouvert && <div className={b.voileMenu} onClick={() => setOuvert(false)} />}
      {ouvert && (
        <div className={b.pProprioPan} role="dialog" aria-label={`${pluriel ? 'Les propriétaires' : 'Le propriétaire'} : ${nom}`}>
          <div className={b.pProprioQui}>
            <AvatarContact c={c} teinte={{ bg: '', fg: '#a07c28' }} taille={42} societe={societe} />
            <div>
              <b>{nom}</b>
              <small>{role || (pluriel ? 'Propriétaires' : 'Propriétaire')}{sous ? ` · ${sous}` : ''}</small>
            </div>
          </div>
          {(tel || mail) && (
            <div className={b.pProprioCo}>
              {tel && <a href={`tel:${brut}`}><Ic n="telephone" t={14} /><span>{tel}</span></a>}
              {mail && <a href={`mailto:${mail}`}><Ic n="mail" t={14} /><span>{mail}</span></a>}
            </div>
          )}
          {!tel && !mail && <p className={b.pProprioRien}>{'Ni téléphone ni e-mail pour l’instant.'}</p>}
          <div className={b.pProprioBtns}>
            {tel && <a className={b.pProprioAct} href={`tel:${brut}`}><Ic n="telephone" t={14} />Appeler</a>}
            {mail && (parCrm
              ? <button type="button" className={b.pProprioAct} onClick={() => { setOuvert(false); setEcrire(true); }}><Ic n="mail" t={14} />Écrire</button>
              : <a className={b.pProprioAct} href={`mailto:${mail}`}><Ic n="mail" t={14} />Écrire</a>)}
            {onFiche
              ? <button type="button" className={b.pProprioAct} onClick={() => { setOuvert(false); onFiche(); }}><Ic n="personne" t={14} />{pluriel ? 'Leur fiche' : 'Sa fiche'}</button>
              : <button type="button" className={b.pProprioAct} onClick={() => { setOuvert(false); onRenseigner(); }}><Ic n="plus" t={14} e={2.4} />Relier une fiche</button>}
          </div>
        </div>
      )}
      {ecrire && personne && (
        <FenetreMail contact={personne as unknown as ContactMail} onFermer={() => setEcrire(false)} onEnvoye={onApres} />
      )}
    </div>
  );
}
