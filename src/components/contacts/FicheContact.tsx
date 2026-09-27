'use client';
import { useEffect, useState } from 'react';
import { supabase, addJournal, type Client } from '@/lib/supabase';
import { conjointDe, nomFoyer } from '@/lib/foyer';
import { jetonEspace } from '@/lib/jeton';
import {
  colonneContactAbsente, estAcheteur, estArchive, estPro, ligneContact, lirePro, typeDe, typesDe,
  type InfosPro, type TypeContact,
} from '@/lib/contacts';
import { Ic } from '@/components/documents/ApercuActe';
import FicheClient from '@/components/fiche/FicheClient';
import { BiensDuContact, ChampsPro, ChoixTypes, TypesEnLigne } from './ChampsContact';
import c from './Contacts.module.css';

/* ═══ La fiche d'un contact qui n'est pas acheteur ═════════════════════════
   Un vendeur, un propriétaire, un notaire, un confrère, un gardien, un
   partenaire n'ont ni recherche, ni veille, ni espace : leur fiche dit qui
   ils sont, comment les joindre, ce qui est propre à leur métier, leurs biens
   (rubrique Biens) et tes notes. « Il cherche aussi à acheter » lui ouvre une
   recherche : il passe alors sur la fiche d'acheteur, complète.

   FicheSelonType choisit : un acheteur a la fiche d'acheteur (FicheClient),
   les autres celle-ci. */

type Nav = (page: string, data?: unknown) => void;

export default function FicheSelonType({ client, onBack, onNavigate }: { client: Client; onBack: () => void; onNavigate: Nav }) {
  /* La recherche de la barre du haut n'envoie qu'une partie de la fiche : on
     relit la ligne entière avant de choisir. */
  const partiel = !client.created_at;
  const [plein, setPlein] = useState<Client | null>(null);
  useEffect(() => {
    if (!partiel) return;
    let vivant = true;
    supabase.from('clients').select('*').eq('id', client.id).maybeSingle().then(({ data }) => { if (vivant && data) setPlein(data as Client); });
    return () => { vivant = false; };
  }, [client.id, partiel]);
  const x = partiel ? (plein?.id === client.id ? plein : null) : client;
  if (!x) return <div style={{ padding: '40px 24px', color: '#64748b', fontSize: 14 }}>Chargement de la fiche…</div>;
  return estAcheteur(x)
    ? <FicheClient client={x} onBack={onBack} onNavigate={onNavigate} />
    : <FicheContact key={x.id} client={x} onBack={onBack} onNavigate={onNavigate} />;
}

/* Un vendeur, un propriétaire peuvent être un couple (src/lib/foyer.ts) :
   la personne 2 a son nom, son e-mail, son téléphone. */
type Form = {
  types: TypeContact[]; civilite: string; prenom: string; nom: string;
  tel1: string; tel2: string; email1: string; email2: string; adresse: string; pro: InfosPro;
  couple: boolean; c2_civilite: string; c2_prenom: string; c2_nom: string; c2_email: string; c2_tel: string;
};
const formDe = (x: Client): Form => {
  const j = conjointDe(x.conjoint);
  return {
    types: typesDe(x), civilite: x.civilite || '', prenom: x.prenom || '', nom: x.nom || '',
    tel1: x.telephones?.[0] || '', tel2: x.telephones?.[1] || '', email1: x.emails?.[0] || '', email2: x.emails?.[1] || '',
    adresse: x.adresse || '', pro: lirePro(x.pro),
    couple: !!x.couple, c2_civilite: j?.civilite || '', c2_prenom: j?.prenom || '', c2_nom: j?.nom || '', c2_email: j?.email || '', c2_tel: j?.telephone || '',
  };
};

function Li({ ic, l, v }: { ic: string; l: string; v?: string | null }) {
  if (!v) return null;
  return <div className={c.li}><span><i className={c.liIc}><Ic n={ic} t={14} /></i>{l}</span><b>{v}</b></div>;
}

function FicheContact({ client: depart, onBack, onNavigate }: { client: Client; onBack: () => void; onNavigate: Nav }) {
  const [x, setX] = useState<Client>(depart);
  const [edit, setEdit] = useState<Form | null>(null);
  const [notes, setNotes] = useState(depart.notes || '');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [journal, setJournal] = useState<{ id: string; titre: string; created_at: string }[]>([]);
  const types = typesDe(x);
  const pro = lirePro(x.pro);
  const principal = typeDe(types[0]);
  const archive = estArchive(x);

  useEffect(() => {
    let vivant = true;
    supabase.from('journal').select('id, titre, created_at').eq('client_id', depart.id).order('created_at', { ascending: false }).limit(8)
      .then(({ data }) => { if (vivant) setJournal((data || []) as { id: string; titre: string; created_at: string }[]); });
    return () => { vivant = false; };
  }, [depart.id]);

  async function ecrire(patch: Record<string, unknown>, quoi: string): Promise<Client | null> {
    setErreur('');
    const { data, error } = await supabase.from('clients').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', x.id).select().single();
    if (error) {
      setErreur(colonneContactAbsente(error.message) ? 'Lance d’abord outils/sql/types-contact.sql dans Supabase : les types de contact n’y sont pas encore.' : `${quoi} : ${error.message}`);
      return null;
    }
    setX(data as Client);
    return data as Client;
  }

  async function enregistrer() {
    if (!edit) return;
    if (!edit.prenom.trim() && !edit.nom.trim()) { setErreur('Écris au moins un prénom ou un nom.'); return; }
    if (!edit.types.length) { setErreur('Choisis au moins un type.'); return; }
    const couple = edit.couple && !estPro(edit.types);
    if (couple && !edit.c2_prenom.trim() && !edit.c2_nom.trim()) { setErreur('Écris au moins le prénom ou le nom de la personne 2.'); return; }
    setOccupe(true);
    /* Les colonnes du couple ne s'écrivent que si elles servent : avant le SQL
       « signature-plusieurs », elles n'existent pas. */
    const foyer = 'couple' in x || couple
      ? {
        couple, conjoint: couple ? {
          ...(conjointDe(x.conjoint) || {}), civilite: edit.c2_civilite, prenom: edit.c2_prenom.trim(), nom: edit.c2_nom.trim(),
          email: edit.c2_email.trim().toLowerCase(), telephone: edit.c2_tel.trim(),
        } : null,
      }
      : {};
    const r = await ecrire({
      types: edit.types, civilite: edit.civilite || null, prenom: edit.prenom.trim(), nom: edit.nom.trim(),
      telephones: [edit.tel1, edit.tel2].map(s => s.trim()).filter(Boolean), emails: [edit.email1, edit.email2].map(s => s.trim().toLowerCase()).filter(Boolean),
      adresse: edit.adresse.trim() || null, pro: edit.pro, ...foyer,
    }, 'La fiche n’a pas pu être enregistrée');
    setOccupe(false);
    if (!r) return;
    setEdit(null);
    /* Devenu acheteur : il passe sur la fiche d'acheteur. */
    if (estAcheteur(r)) onNavigate('fiche', r);
  }

  /* Il cherche aussi à acheter : une recherche vide, et la fiche d'acheteur. */
  async function ouvrirRecherche() {
    setOccupe(true); setErreur('');
    const { error } = await supabase.from('recherches').insert({ client_id: x.id, nom: 'Recherche principale', token_espace: jetonEspace(x.prenom, x.nom), active: true, secteurs: [] });
    if (error) { setErreur('La recherche n’a pas pu être créée : ' + error.message); setOccupe(false); return; }
    const r = await ecrire({ types: ['acheteur', ...types.filter(t => t !== 'acheteur')], statut: 'prospect' }, 'Le type n’a pas pu être changé');
    await addJournal(x.id, 'creation', 'Recherche ouverte', 'Il cherche aussi à acheter');
    setOccupe(false);
    if (r) onNavigate('fiche', r);
  }

  async function supprimer() {
    if (!confirm(`Supprimer ${nomFoyer(x)} de tes contacts ?\n\nC’est définitif. Pour le garder sans le voir, archive-le plutôt.`)) return;
    setOccupe(true);
    const { error } = await supabase.from('clients').delete().eq('id', x.id);
    setOccupe(false);
    if (error) { setErreur('Le contact n’a pas pu être supprimé : ' + error.message + (/foreign key|violates/i.test(error.message) ? ' (il est encore relié à un bien ou à un dossier).' : '')); return; }
    onBack();
  }

  const tels = (x.telephones || []).filter(Boolean), mails = (x.emails || []).filter(Boolean);
  const j2 = x.couple ? conjointDe(x.conjoint) : null;
  const ligne = ligneContact(x);
  const cls = { row: c.g2, group: c.ch, label: '', input: c.in };

  return (
    <div className={c.fiche}>
      <div className={c.barre}>
        <button type="button" className={c.retour} onClick={onBack}><Ic n="retour" t={16} />Contacts</button>
        <div className={c.actions}>
          <button type="button" className={c.btn} onClick={() => { setErreur(''); setEdit(formDe(x)); }}><Ic n="crayon" t={15} />Modifier</button>
          <button type="button" className={`${c.btn} ${c.masquable}`} disabled={occupe} onClick={() => ecrire({ archive: !archive }, 'Le contact n’a pas pu être archivé')}>
            <Ic n="archive" t={15} />{archive ? 'Sortir des archives' : 'Archiver'}
          </button>
          <button type="button" className={`${c.btn} ${c.btnDanger}`} disabled={occupe} onClick={supprimer} aria-label="Supprimer ce contact"><Ic n="corbeille" t={15} /></button>
        </div>
      </div>

      <div className={c.hero}>
        <span className={c.heroAv} style={{ color: '#e0c36e' }}>{`${(x.prenom || x.nom || '?')[0]}${x.prenom && x.nom ? x.nom[0] : ''}`.toUpperCase()}</span>
        <div className={c.heroTxt}>
          <h1 className={c.heroNom}>{nomFoyer(x) || 'Sans nom'}</h1>
          <TypesEnLigne client={x} sombre onMaj={t => { const n = { ...x, types: t } as Client; setX(n); if (t.includes('acheteur')) onNavigate('fiche', n); }} />
          {ligne && <div className={c.heroLigne}>{ligne}</div>}
          <div className={c.heroCoord}>
            {j2 && <em>{x.prenom || 'Personne 1'}</em>}
            {tels.map(t => <a key={t} href={`tel:${t.replace(/\s+/g, '')}`}><Ic n="telephone" t={14} />{t}</a>)}
            {mails.map(m => <a key={m} href={`mailto:${m}`}><Ic n="mail" t={14} />{m}</a>)}
            {!j2 && x.adresse && <span><Ic n="lieu" t={14} />{x.adresse}</span>}
            {!tels.length && !mails.length && !x.adresse && !j2 && <span>Pas encore de coordonnées</span>}
          </div>
          {/* Un couple : les coordonnées de la personne 2, sous son prénom. */}
          {j2 && (
            <div className={c.heroCoord}>
              <em>{j2.prenom || 'Personne 2'}</em>
              {j2.telephone && <a href={`tel:${j2.telephone.replace(/\s+/g, '')}`}><Ic n="telephone" t={14} />{j2.telephone}</a>}
              {j2.email && <a href={`mailto:${j2.email}`}><Ic n="mail" t={14} />{j2.email}</a>}
              {!j2.telephone && !j2.email && <span>Pas encore de coordonnées</span>}
            </div>
          )}
          {j2 && x.adresse && <div className={c.heroCoord}><span><Ic n="lieu" t={14} />{x.adresse}</span></div>}
        </div>
      </div>

      {archive && <div className={c.archiveBandeau}>Ce contact est archivé : il n’apparaît plus dans la liste, seulement dans « Archivés ».</div>}
      {erreur && <div className={c.erreur}>{erreur}</div>}

      <div className={c.deux}>
        <div className={c.col}>
          {types.includes('confrere') && (
            <section className={c.bloc}>
              <div className={c.blocT}><span className={c.blocIc}><Ic n="agence" t={15} /></span><h3>Son agence</h3><button type="button" className={c.lien} onClick={() => setEdit(formDe(x))}>Modifier</button></div>
              <div className={c.lignes}>
                <Li ic="personne" l="Statut" v={pro.statutPro === 'mandataire' ? 'Mandataire' : pro.statutPro === 'independant' ? 'À son compte' : pro.statutPro === 'salarie' ? 'Salarié d’une agence' : ''} />
                <Li ic="agence" l="Agence" v={pro.agence} />
                <Li ic="groupe" l="Réseau" v={pro.reseau} />
                <Li ic="lieu" l="Adresse" v={pro.adresseAgence} />
                <Li ic="globe" l="Site" v={pro.siteWeb} />
              </div>
              {!pro.agence && !pro.statutPro && <div className={c.pied}>Son agence, son statut (salarié, mandataire, à son compte) : « Modifier » pour les noter.</div>}
            </section>
          )}
          {types.includes('notaire') && (
            <section className={c.bloc}>
              <div className={c.blocT}><span className={c.blocIc}><Ic n="balance" t={15} /></span><h3>Son étude</h3><button type="button" className={c.lien} onClick={() => setEdit(formDe(x))}>Modifier</button></div>
              <div className={c.lignes}>
                <Li ic="balance" l="Étude" v={pro.etude} />
                <Li ic="lieu" l="Adresse" v={pro.adresseEtude} />
                <Li ic="personne" l="Clerc ou assistant(e)" v={pro.clerc} />
                <Li ic="telephone" l="Son téléphone" v={pro.clercTel} />
              </div>
              {!pro.etude && !pro.adresseEtude && <div className={c.pied}>L’étude, son adresse, le clerc : « Modifier » pour les noter.</div>}
            </section>
          )}
          {types.includes('gardien') && (
            <section className={c.bloc}>
              <div className={c.blocT}><span className={c.blocIc}><Ic n="immeuble" t={15} /></span><h3>L’immeuble</h3><button type="button" className={c.lien} onClick={() => setEdit(formDe(x))}>Modifier</button></div>
              <div className={c.lignes}>
                <Li ic="immeuble" l="Immeuble" v={pro.immeuble} />
                <Li ic="horloge" l="Horaires de la loge" v={pro.horaires} />
                <Li ic="cle" l="Accès, clés" v={pro.acces} />
              </div>
              {!pro.immeuble && <div className={c.pied}>L’immeuble, les horaires de la loge : « Modifier » pour les noter.</div>}
            </section>
          )}
          {types.includes('partenaire') && (
            <section className={c.bloc}>
              <div className={c.blocT}><span className={c.blocIc}><Ic n="outil" t={15} /></span><h3>Son activité</h3><button type="button" className={c.lien} onClick={() => setEdit(formDe(x))}>Modifier</button></div>
              <div className={c.lignes}>
                <Li ic="outil" l="Métier" v={pro.metier} />
                <Li ic="agence" l="Société" v={pro.societe} />
              </div>
              {!pro.metier && <div className={c.pied}>Son métier, sa société : « Modifier » pour les noter.</div>}
            </section>
          )}
          {(types.includes('vendeur') || types.includes('proprietaire')) && (
            <BiensDuContact clientId={x.id} prenom={x.prenom} onNavigate={onNavigate} toujours />
          )}
          {!estPro(types) || types.includes('vendeur') || types.includes('proprietaire') ? (
            <div className={c.aussi}>
              <span className={c.blocIc} style={{ width: 36, height: 36 }}><Ic n="cible" t={17} /></span>
              <div><b>Il cherche aussi à acheter ?</b>Ouvre-lui une recherche : il passe sur la fiche d’acheteur, avec son espace et la veille.</div>
              <button type="button" className={`${c.btn} ${c.btnOr}`} disabled={occupe} onClick={ouvrirRecherche}>Ouvrir une recherche</button>
            </div>
          ) : null}
        </div>
        <div className={c.col}>
          <section className={c.bloc}>
            <div className={c.blocT}><span className={c.blocIc}><Ic n="cadenas" t={15} /></span><h3>Notes</h3></div>
            <textarea className={c.notes} value={notes} placeholder={`Ce qu’il faut retenir sur ${x.prenom || 'ce contact'} : comment vous vous êtes connus, ce qu’il a dit, ce qu’il ne faut pas oublier…`}
              onChange={e => setNotes(e.target.value)} onBlur={() => { if (notes !== (x.notes || '')) void ecrire({ notes: notes.trim() || null }, 'Les notes n’ont pas pu être enregistrées'); }} />
            <div className={c.pied}>Visibles par toi seul. Enregistrées quand tu cliques ailleurs.</div>
          </section>
          <section className={c.bloc}>
            <div className={c.blocT}><span className={c.blocIc}><Ic n="historique" t={15} /></span><h3>Historique</h3></div>
            {journal.length ? journal.map(j => (
              <div key={j.id} className={c.evt}><span>{j.titre}</span><small>{new Date(j.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</small></div>
            )) : <div className={c.pied}>{`Contact ajouté le ${new Date(x.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.`}</div>}
          </section>
          <div className={c.pied} style={{ textAlign: 'right' }}>{`${principal.lib} · ${x.reference}`}</div>
        </div>
      </div>

      {edit && (
        <div className={c.fen} onClick={e => { if (e.target === e.currentTarget && !occupe) setEdit(null); }}>
          <div className={c.fenIn} role="dialog" aria-modal="true" aria-label="Modifier le contact">
            <div className={c.fenTete}>
              <h3>{`Modifier ${nomFoyer(x) || 'le contact'}`}</h3>
              <button type="button" className={c.btn} onClick={() => setEdit(null)} aria-label="Fermer" disabled={occupe}>✕</button>
            </div>
            <div className={c.fenCorps}>
              <div className={c.groupe}>
                <div className={c.groupeT}>Ce contact est…</div>
                <ChoixTypes v={edit.types} onChange={t => setEdit({ ...edit, types: t })} />
                {edit.types.includes('acheteur') && <div className={c.typesNote}>Acheteur : en enregistrant, sa fiche d’acheteur s’ouvre. Pense à lui ouvrir une recherche (« Il cherche aussi à acheter »).</div>}
              </div>
              <div className={c.groupe}>
                <div className={c.groupeT}>{edit.couple && !estPro(edit.types) ? 'Personne 1 · contact principal' : 'Qui, et comment le joindre'}</div>
                <div className={c.pills}>
                  {['Monsieur', 'Madame'].map(v => <button key={v} type="button" className={`${c.pill} ${edit.civilite === v ? c.pillOn : ''}`} onClick={() => setEdit({ ...edit, civilite: edit.civilite === v ? '' : v })}>{v}</button>)}
                  {/* Un vendeur ou un propriétaire peut être un couple. */}
                  {!estPro(edit.types) && <button type="button" className={`${c.pill} ${edit.couple ? c.pillOn : ''}`} onClick={() => setEdit({ ...edit, couple: !edit.couple })}>{edit.couple ? '✓ Un couple' : '+ Un couple'}</button>}
                </div>
                <div className={c.g2}>
                  <label className={c.ch}><span>Prénom</span><input className={c.in} value={edit.prenom} onChange={e => setEdit({ ...edit, prenom: e.target.value })} /></label>
                  <label className={c.ch}><span>Nom</span><input className={c.in} value={edit.nom} onChange={e => setEdit({ ...edit, nom: e.target.value })} /></label>
                  <label className={c.ch}><span>Téléphone</span><input className={c.in} value={edit.tel1} onChange={e => setEdit({ ...edit, tel1: e.target.value })} /></label>
                  <label className={c.ch}><span>E-mail</span><input className={c.in} type="email" value={edit.email1} onChange={e => setEdit({ ...edit, email1: e.target.value })} /></label>
                  <label className={c.ch}><span>Autre téléphone</span><input className={c.in} value={edit.tel2} onChange={e => setEdit({ ...edit, tel2: e.target.value })} /></label>
                  <label className={c.ch}><span>Autre e-mail</span><input className={c.in} type="email" value={edit.email2} onChange={e => setEdit({ ...edit, email2: e.target.value })} /></label>
                </div>
                <label className={c.ch}><span>Adresse</span><input className={c.in} value={edit.adresse} onChange={e => setEdit({ ...edit, adresse: e.target.value })} /></label>
              </div>
              {edit.couple && !estPro(edit.types) && (
                <div className={c.groupe}>
                  <div className={c.groupeT}>Personne 2</div>
                  <div className={c.pills}>
                    {['Monsieur', 'Madame'].map(v => <button key={v} type="button" className={`${c.pill} ${edit.c2_civilite === v ? c.pillOn : ''}`} onClick={() => setEdit({ ...edit, c2_civilite: edit.c2_civilite === v ? '' : v })}>{v}</button>)}
                  </div>
                  <div className={c.g2}>
                    <label className={c.ch}><span>Prénom</span><input className={c.in} value={edit.c2_prenom} onChange={e => setEdit({ ...edit, c2_prenom: e.target.value })} /></label>
                    <label className={c.ch}><span>Nom</span><input className={c.in} value={edit.c2_nom} onChange={e => setEdit({ ...edit, c2_nom: e.target.value })} /></label>
                    <label className={c.ch}><span>Téléphone</span><input className={c.in} value={edit.c2_tel} onChange={e => setEdit({ ...edit, c2_tel: e.target.value })} /></label>
                    <label className={c.ch}><span>E-mail</span><input className={c.in} type="email" value={edit.c2_email} onChange={e => setEdit({ ...edit, c2_email: e.target.value })} /></label>
                  </div>
                </div>
              )}
              <ChampsPro types={edit.types} pro={edit.pro} onChange={p => setEdit({ ...edit, pro: p })} cls={cls} />
              {erreur && <div className={c.erreur}>{erreur}</div>}
            </div>
            <div className={c.fenPied}>
              <button type="button" className={c.btn} disabled={occupe} onClick={() => setEdit(null)}>Annuler</button>
              <button type="button" className={`${c.btn} ${c.btnOr}`} disabled={occupe} onClick={enregistrer}><Ic n="check" t={15} e={2.4} />{occupe ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
