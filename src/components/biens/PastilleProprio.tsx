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
   le bien), Sa fiche. Sans propriétaire, elle propose de le renseigner.

   V3.54 : elle remplace la carte « Le propriétaire » de la Vue d'ensemble
   (retirée), dont elle reprend la ligne « Venu par · Notaire ».
   - Une petite croix (« pour dire : si on veut l'enlever ») : elle demande
     confirmation dans le même panneau, puis retire le propriétaire du bien.
   - Un nom saisi sur le bien sans fiche dans les contacts (les biens d'avant
     la V3.30) : le panneau le dit, et « Créer sa fiche » la crée en un clic
     — à la place de « Relier une fiche », qui menait à l'éditeur sans dire
     pourquoi. */

/* « la SCI AVIENA », « Dupont Investissements » */
const laSociete = (n: string) => (/^(sci|sarl|sas|sasu|eurl|sa|snc|société|holding)\b/i.test(n) ? `la ${n}` : n);

export function PastilleProprio({ nom, pluriel, personne, societe, pour, sous, plus, tel, mail, onFiche, onRenseigner, onCreerFiche, onRetirer, onApres }: {
  nom: string; pluriel: boolean;
  /* Sa fiche dans le CRM (null : un nom saisi sans fiche reliée). */
  personne: ClientMini | null;
  societe?: boolean;
  /* Il agit au nom d'une société : laquelle, et son rôle. */
  pour?: { nom: string; role: string } | null;
  sous?: string;
  /* Une ligne de plus : motif, « Venu par », notaire (V3.54). */
  plus?: string;
  tel: string; mail: string;
  onFiche?: () => void; onRenseigner: () => void;
  /* Pas de fiche reliée : la créer (ou relier celle qui existe déjà) depuis
     ce qui est saisi sur le bien. Absent : « Relier une fiche » ouvre
     l'éditeur. */
  onCreerFiche?: () => Promise<void>;
  /* La croix : le bien n'a plus de propriétaire. */
  onRetirer?: () => void;
  /* Un mail parti : l'historique du bien se relit. */
  onApres?: () => void;
}) {
  const [vue, setVue] = useState<'infos' | 'retirer' | null>(null);
  const [ecrire, setEcrire] = useState(false);
  const [occupe, setOccupe] = useState(false);
  useEffect(() => {
    if (!vue) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setVue(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [vue]);

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
  const role = pour ? (pour.role ? `${pour.role} de ${laSociete(pour.nom)}` : `Pour ${laSociete(pour.nom)}`) : '';
  /* Écrire : depuis le CRM quand sa fiche a une adresse (le mail se range
     dans son Suivi) ; sinon, la messagerie de l'ordinateur. */
  const parCrm = !!personne && !!personne.emails?.some(Boolean);
  const creer = async () => {
    if (!onCreerFiche || occupe) return;
    setOccupe(true);
    try { await onCreerFiche(); } finally { setOccupe(false); }
    setVue(null);
  };
  return (
    <div className={b.pProprio}>
      <button type="button" className={`${b.pProprioBtn} ${onRetirer ? b.pProprioAvecX : ''}`} aria-haspopup="dialog" aria-expanded={vue === 'infos'} onClick={() => setVue(x => (x === 'infos' ? null : 'infos'))}>
        <AvatarContact c={c} teinte={{ bg: '', fg: '#a07c28' }} taille={34} societe={societe} />
        <span className={b.pProprioTx}><small>{pluriel ? 'Propriétaires' : 'Propriétaire'}</small><b>{nom}</b></span>
        <Ic n="bas" t={13} e={2.4} />
      </button>
      {onRetirer && (
        <button type="button" className={b.pProprioX} aria-label={`Retirer ${nom} de ce bien`} title="Retirer du bien" aria-expanded={vue === 'retirer'} onClick={() => setVue(x => (x === 'retirer' ? null : 'retirer'))}>
          <Ic n="croix" t={12} e={2.6} />
        </button>
      )}
      {vue && <div className={b.voileMenu} onClick={() => setVue(null)} />}
      {vue === 'retirer' && onRetirer && (
        <div className={b.pProprioPan} role="alertdialog" aria-label={`Retirer ${nom} de ce bien`}>
          <div className={b.pProprioQ}>
            <span className={b.pProprioQIc}><Ic n="croix" t={14} e={2.6} /></span>
            <div>
              <b>{`Retirer ${nom} de ce bien\u00a0?`}</b>
              <small>{personne
                ? `${pluriel ? 'Leur fiche reste' : 'Sa fiche reste'} dans tes contacts. Le bien n’aura plus de propriétaire : tu pourras en indiquer un autre ici.`
                : `${pluriel ? 'Leurs noms et coordonnées' : 'Son nom et ses coordonnées'}, notés sur ce bien seulement, seront effacés. Tu pourras en indiquer un autre ici.`}</small>
            </div>
          </div>
          <div className={b.pProprioBtns}>
            <button type="button" className={`${b.pProprioAct} ${b.pProprioDanger}`} onClick={() => { setVue(null); onRetirer(); }}><Ic n="croix" t={12} e={2.6} />Retirer du bien</button>
            <button type="button" className={b.pProprioAct} onClick={() => setVue(null)}>Annuler</button>
          </div>
        </div>
      )}
      {vue === 'infos' && (
        <div className={b.pProprioPan} role="dialog" aria-label={`${pluriel ? 'Les propriétaires' : 'Le propriétaire'} : ${nom}`}>
          <div className={b.pProprioQui}>
            <AvatarContact c={c} teinte={{ bg: '', fg: '#a07c28' }} taille={42} societe={societe} />
            <div>
              <b>{nom}</b>
              <small>{role || (pluriel ? 'Propriétaires' : 'Propriétaire')}{sous ? ` · ${sous}` : ''}</small>
              {plus && <small className={b.pProprioPlus}>{plus}</small>}
            </div>
          </div>
          {(tel || mail) && (
            <div className={b.pProprioCo}>
              {tel && <a href={`tel:${brut}`}><Ic n="telephone" t={14} /><span>{tel}</span></a>}
              {mail && <a href={`mailto:${mail}`}><Ic n="mail" t={14} /><span>{mail}</span></a>}
            </div>
          )}
          {!tel && !mail && <p className={b.pProprioRien}>{'Ni téléphone ni e-mail pour l’instant.'}</p>}
          {/* V3.54 : « Relier une fiche » ne disait pas pourquoi. */}
          {!personne && <p className={b.pProprioSans}>{`${pluriel ? 'Pas encore de fiche dans tes contacts : leurs coordonnées sont' : 'Pas encore de fiche dans tes contacts : ses coordonnées sont'} notées sur ce bien seulement. Avec une fiche, tu retrouves ${pluriel ? 'leurs' : 'ses'} mails et ${pluriel ? 'leur' : 'son'} historique dans Contacts.`}</p>}
          <div className={b.pProprioBtns}>
            {tel && <a className={b.pProprioAct} href={`tel:${brut}`}><Ic n="telephone" t={14} />Appeler</a>}
            {mail && (parCrm
              ? <button type="button" className={b.pProprioAct} onClick={() => { setVue(null); setEcrire(true); }}><Ic n="mail" t={14} />Écrire</button>
              : <a className={b.pProprioAct} href={`mailto:${mail}`}><Ic n="mail" t={14} />Écrire</a>)}
            {onFiche
              ? <button type="button" className={b.pProprioAct} onClick={() => { setVue(null); onFiche(); }}><Ic n="personne" t={14} />{pluriel ? 'Leur fiche' : 'Sa fiche'}</button>
              : onCreerFiche
                ? <button type="button" className={`${b.pProprioAct} ${b.pProprioOr}`} disabled={occupe} onClick={() => { void creer(); }}><Ic n="plus" t={14} e={2.4} />{occupe ? 'Création…' : 'Créer sa fiche'}</button>
                : <button type="button" className={b.pProprioAct} onClick={() => { setVue(null); onRenseigner(); }}><Ic n="personne" t={14} />Relier une fiche</button>}
          </div>
        </div>
      )}
      {ecrire && personne && (
        <FenetreMail contact={personne as unknown as ContactMail} onFermer={() => setEcrire(false)} onEnvoye={onApres} />
      )}
    </div>
  );
}
