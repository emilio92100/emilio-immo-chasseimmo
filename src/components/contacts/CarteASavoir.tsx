'use client';
import { useEffect, useMemo, useState } from 'react';
import { Ic } from '@/components/documents/ApercuActe';
import NoteRiche from '@/components/shared/NoteRiche';
import c from './Contacts.module.css';

/* ═══ « À savoir sur… » ═══════════════════════════════════════════════════
   La note libre d'un contact (`clients.notes`) : ce qu'il a raconté, son
   projet, ce qu'il ne faut pas oublier. Elle se tape à la création (« À
   savoir sur lui ») et se lit ici, en haut de sa fiche — d'acheteur comme
   de gardien ou de notaire. Avant (V3.22), celle d'un acheteur était
   enregistrée mais ne s'affichait nulle part.

   Ce n'est pas « Précisions » de la recherche (ce qu'il cherche, visible
   dans son espace) : ceci n'est lu que par Alexandre.
   Vide : un lien discret pour en ajouter une. `onEnregistrer` rend false si
   l'écriture a échoué (le message rouge est déjà affiché) : on reste alors
   en modification, le texte tapé n'est pas perdu.
   V3.30 : le texte se range en blocs (un par paragraphe, « Libellé : » en
   titre), les e-mails et téléphones deviennent des liens, et au-delà d'une
   certaine hauteur il se replie (NoteRiche). */

export default function CarteASavoir({ prenom, texte, onEnregistrer }: {
  prenom: string; texte: string | null | undefined; onEnregistrer: (t: string) => Promise<boolean>;
}) {
  const sections = useMemo(() => [{ texte: (texte || '').trim() }], [texte]);
  const [edit, setEdit] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  useEffect(() => { setEdit(null); }, [texte]);
  const qui = prenom || 'ce contact';
  const t = (texte || '').trim();

  async function enregistrer() {
    if (edit === null) return;
    setOccupe(true);
    const ok = await onEnregistrer(edit.trim());
    setOccupe(false);
    if (ok) setEdit(null);
  }

  if (edit === null && !t) {
    return (
      <button type="button" className={c.asvVide} onClick={() => setEdit('')}>
        <span className={c.asvIc}><Ic n="crayon" t={15} /></span>
        <span>{`Noter une info sur ${qui}`}<em>{' · pour vous seul'}</em></span>
      </button>
    );
  }
  return (
    <section className={c.asv}>
      <span className={c.asvIc}><Ic n="crayon" t={16} /></span>
      <div className={c.asvCorps}>
        <div className={c.asvTete}>
          <b>{`À savoir sur ${qui}`}</b>
          <span>pour vous seul</span>
          {edit === null && <button type="button" className={c.asvModif} onClick={() => setEdit(t)}>Modifier</button>}
        </div>
        {edit === null ? (
          <div className={c.asvNote}><NoteRiche sections={sections} hauteur={260} /></div>
        ) : (
          <>
            <textarea className={c.notes} value={edit} autoFocus onChange={e => setEdit(e.target.value)}
              style={{ marginTop: 8, minHeight: Math.min(420, 96 + Math.floor(edit.length / 90) * 22) }} />
            <div className={c.asvAide}>Une ligne vide sépare deux blocs ; « Libellé : » en début de paragraphe lui donne son titre ; « – » en début de ligne fait une liste.</div>
            <div className={c.asvBoutons}>
              <button type="button" className={c.btn} disabled={occupe} onClick={() => setEdit(null)}>Annuler</button>
              <button type="button" className={`${c.btn} ${c.btnOr}`} disabled={occupe} onClick={enregistrer}>
                <Ic n="check" t={14} e={2.6} />{occupe ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
