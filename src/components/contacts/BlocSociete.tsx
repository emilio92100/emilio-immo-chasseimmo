'use client';
import { useEffect, useState } from 'react';
import { Ic } from '@/components/documents/ApercuActe';
import { FORMES_SOCIETE, ROLES_SOCIETE, lireStructure, type Associe, type Structure } from '@/lib/contacts';
import { lireClients } from '@/components/biens/ChampsBien';
import type { ClientMini } from '@/components/biens/outils';
import c from './Contacts.module.css';

/* ═══ « Sa société » (V3.30) ════════════════════════════════════════════════
   Christine DESNOULEZ est l'interlocutrice d'une vente, mais c'est la SCI
   AVIENA qui vend : huit associés, deux gérants. Tout cela vivait dans
   « À savoir », en un long texte. Choix d'Alexandre : la personne reste un
   contact, et sa fiche porte la société qu'elle représente — son nom, sa
   forme, son RCS, son siège, son rôle à elle, et les associés avec leur
   téléphone et leur e-mail (clients.pro.structure : pas de SQL).

   Un associé qui a déjà sa fiche dans les contacts (même e-mail ou même
   téléphone) se reconnaît tout seul : « Sa fiche » l'ouvre.
   « Reprendre ce qui est noté » lit « À savoir » et pré-remplit le
   formulaire (le nom de la société, le RCS, le siège, les lignes « – Nom
   (gérante) : 06… · mail ») : on vérifie, puis on enregistre. */

const VIDE: Structure = { denomination: '', forme: 'SCI', rcs: '', siege: '', qualite: '', associes: [] };
const idNeuf = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const chiffres = (t: string) => t.replace(/\D/g, '').replace(/^33/, '0');
const capitale = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/* Ce qu'« À savoir » dit déjà de la société : une lecture de bonne volonté. */
export function structureDepuisNotes(notes: string, soi: { prenom?: string | null; nom?: string | null; emails?: string[] | null }): Structure | null {
  const t = (notes || '').replace(/\r\n?/g, '\n');
  if (!t.trim()) return null;
  const s: Structure = { ...VIDE, associes: [] };
  const m = t.match(/\b(SCI|SARL|SASU|SAS|SA|SNC|EURL)\s+([A-ZÀ-Ý0-9][A-Za-zÀ-ÿ0-9'’& -]{1,40}?)(?=\s*[:,.()\n]|\s+(?:dont|est|au|qui)\b)/);
  if (m) { s.denomination = `${m[1]} ${m[2].trim()}`; s.forme = m[1] === 'SASU' ? 'SAS' : m[1] === 'EURL' ? 'SARL' : m[1]; }
  const rcs = t.match(/RCS\s+([A-Za-zÀ-ÿ' -]+?)\s+(\d{3}\s?\d{3}\s?\d{3})/);
  if (rcs) s.rcs = `RCS ${rcs[1].trim()} ${rcs[2]}`;
  const siege = t.match(/si[eè]ge(?:\s+social)?\s*:?\s+([^.(\n;]+)/i);
  if (siege) s.siege = siege[1].trim().replace(/,$/, '');
  const qual = t.match(/dont (?:elle|il) est (?:l[ae] )?(associée?|gérante?|présidente?)/i);
  if (qual) s.qualite = capitale(qual[1].toLowerCase());
  if (/interlocut/i.test(t)) s.qualite = [s.qualite, 'interlocut' + (/interlocutrice/i.test(t) ? 'rice' : 'eur') + ' pour la vente'].filter(Boolean).join(', ');
  s.qualite = capitale(s.qualite);
  /* Les associés : les lignes de liste qui portent un téléphone ou un e-mail. */
  for (const brut of t.split('\n')) {
    const l = brut.trim();
    if (!/^[-–—•·*]\s+/.test(l)) continue;
    const corps = l.replace(/^[-–—•·*]\s+/, '');
    const email = corps.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] || '';
    const tel = corps.match(/(?:\+33\s?|0)[1-9](?:[\s.]?\d{2}){4}/)?.[0] || '';
    if (!email && !tel) continue;
    const nom = corps.split(/\s*[(:]\s*/)[0].replace(/\s+/g, ' ').trim();
    const par = corps.match(/\(([^)]*)\)/)?.[1] || '';
    const role = /g[ée]rante/i.test(par) ? 'Gérante' : /g[ée]rant/i.test(par) ? 'Gérant' : /associée/i.test(par) ? 'Associée' : /associ/i.test(par) ? 'Associé' : /pr[ée]sident/i.test(par) ? 'Président' : '';
    if (nom) s.associes.push({ id: idNeuf(), nom, role, tel, email });
  }
  /* Son rôle à lui, s'il est dans la liste et qu'on ne l'a pas déjà. */
  const moi = s.associes.find(a => (soi.emails || []).some(e => e && e.toLowerCase() === a.email.toLowerCase()) || (soi.nom && a.nom.toLowerCase().includes(soi.nom.toLowerCase())));
  if (moi?.role && !s.qualite) s.qualite = moi.role;
  return s.denomination || s.associes.length ? s : null;
}

export default function BlocSociete({ client, notes, onEnregistrer, onFiche }: {
  client: { id: string; prenom?: string | null; nom?: string | null; emails?: string[] | null; telephones?: string[] | null; pro?: unknown };
  notes: string | null | undefined;
  onEnregistrer: (s: Structure | null) => Promise<boolean>;
  onFiche: (c: ClientMini) => void;
}) {
  const pro = (client.pro && typeof client.pro === 'object' ? client.pro : {}) as Record<string, unknown>;
  const st = lireStructure(pro.structure);
  const [edit, setEdit] = useState<Structure | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [contacts, setContacts] = useState<ClientMini[]>([]);
  const [tous, setTous] = useState(false);
  useEffect(() => {
    if (!st?.associes.length) return;
    let vivant = true;
    lireClients().then(l => { if (vivant) setContacts(l); }).catch(() => { /* sans la liste, pas de « Sa fiche » */ });
    return () => { vivant = false; };
  }, [st?.associes.length]);
  const suggestion = !st && notes ? structureDepuisNotes(notes, client) : null;

  /* Un associé qui a sa fiche : même e-mail, ou même téléphone. */
  const ficheDe = (a: Associe) => contacts.find(x => (a.email && (x.emails || []).some(e => e && e.toLowerCase() === a.email.toLowerCase()))
    || (a.tel && (x.telephones || []).some(t => t && chiffres(t) === chiffres(a.tel))));
  const estSoi = (a: Associe) => (a.email && (client.emails || []).some(e => e && e.toLowerCase() === a.email.toLowerCase()))
    || (a.tel && (client.telephones || []).some(t => t && chiffres(t) === chiffres(a.tel)));

  async function enregistrer() {
    if (!edit) return;
    const net: Structure = {
      ...edit, denomination: edit.denomination.trim(), rcs: edit.rcs.trim(), siege: edit.siege.trim(), qualite: edit.qualite.trim(),
      associes: edit.associes.map(a => ({ ...a, nom: a.nom.trim(), tel: a.tel.trim(), email: a.email.trim().toLowerCase() })).filter(a => a.nom || a.tel || a.email),
    };
    setOccupe(true);
    const ok = await onEnregistrer(net.denomination || net.associes.length ? net : null);
    setOccupe(false);
    if (ok) setEdit(null);
  }
  const majA = (id: string, patch: Partial<Associe>) => setEdit(e => (e ? { ...e, associes: e.associes.map(a => (a.id === id ? { ...a, ...patch } : a)) } : e));

  if (edit) {
    return (
      <section className={`${c.bloc} ${c.socBloc}`}>
        <div className={c.blocT}><span className={c.blocIc}><Ic n="immeuble" t={15} /></span><h3>Sa société</h3></div>
        {suggestion && !edit.denomination && !edit.associes.length && (
          <button type="button" className={c.socReprendre} onClick={() => setEdit(suggestion)}>
            <Ic n="copier" t={15} />
            <span><b>Reprendre ce qui est noté dans « À savoir »</b><small>{[suggestion.denomination, suggestion.associes.length ? `${suggestion.associes.length} associé${suggestion.associes.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')} : tu vérifies avant d’enregistrer.</small></span>
          </button>
        )}
        <div className={c.g2}>
          <label className={c.ch}><span>Nom de la société</span><input className={c.in} value={edit.denomination} placeholder="SCI AVIENA" onChange={e => setEdit({ ...edit, denomination: e.target.value })} /></label>
          <div className={c.ch}>
            <span>Forme</span>
            <div className={c.pills}>{FORMES_SOCIETE.map(f => <button key={f} type="button" className={`${c.pill} ${edit.forme === f ? c.pillOn : ''}`} onClick={() => setEdit({ ...edit, forme: f })}>{f}</button>)}</div>
          </div>
          <label className={c.ch}><span>RCS ou SIREN</span><input className={c.in} value={edit.rcs} placeholder="RCS Paris 442 484 721" onChange={e => setEdit({ ...edit, rcs: e.target.value })} /></label>
          <label className={c.ch}><span>Siège</span><input className={c.in} value={edit.siege} placeholder="5 villa Flore, 75016 Paris" onChange={e => setEdit({ ...edit, siege: e.target.value })} /></label>
        </div>
        <label className={c.ch}>
          <span>{`Son rôle, à ${client.prenom || 'lui'}`}</span>
          <input className={c.in} value={edit.qualite} list="roles-societe" placeholder="Associée, interlocutrice pour la vente" onChange={e => setEdit({ ...edit, qualite: e.target.value })} />
          <datalist id="roles-societe">{ROLES_SOCIETE.map(r => <option key={r} value={r} />)}</datalist>
        </label>
        <div className={c.socAssT}>{`Les associés${edit.associes.length ? ` · ${edit.associes.length}` : ''}`}</div>
        {edit.associes.map(a => (
          <div key={a.id} className={c.socEdit}>
            <input className={c.in} value={a.nom} placeholder="Nom" aria-label="Nom de l’associé" onChange={e => majA(a.id, { nom: e.target.value })} />
            <input className={c.in} value={a.role} placeholder="Rôle" list="roles-societe" aria-label="Rôle" onChange={e => majA(a.id, { role: e.target.value })} />
            <input className={c.in} value={a.tel} placeholder="Téléphone" type="tel" aria-label="Téléphone" onChange={e => majA(a.id, { tel: e.target.value })} />
            <input className={c.in} value={a.email} placeholder="E-mail" type="email" aria-label="E-mail" onChange={e => majA(a.id, { email: e.target.value })} />
            <button type="button" className={c.socSuppr} aria-label={`Retirer ${a.nom || 'cet associé'}`} onClick={() => setEdit({ ...edit, associes: edit.associes.filter(y => y.id !== a.id) })}><Ic n="croix" t={13} e={2.4} /></button>
          </div>
        ))}
        <button type="button" className={c.lien} style={{ alignSelf: 'flex-start' }} onClick={() => setEdit({ ...edit, associes: [...edit.associes, { id: idNeuf(), nom: '', role: '', tel: '', email: '' }] })}>+ Ajouter un associé</button>
        <div className={c.asvBoutons}>
          {st && <button type="button" className={`${c.btn} ${c.btnDanger}`} style={{ marginRight: 'auto' }} disabled={occupe} onClick={async () => { if (confirm('Retirer la société de cette fiche ?')) { setOccupe(true); if (await onEnregistrer(null)) setEdit(null); setOccupe(false); } }}>Retirer la société</button>}
          <button type="button" className={c.btn} disabled={occupe} onClick={() => setEdit(null)}>Annuler</button>
          <button type="button" className={`${c.btn} ${c.btnOr}`} disabled={occupe} onClick={enregistrer}><Ic n="check" t={14} e={2.6} />{occupe ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </section>
    );
  }

  if (!st) {
    return (
      <button type="button" className={c.asvVide} onClick={() => setEdit(suggestion || { ...VIDE, associes: [] })}>
        <span className={c.asvIc}><Ic n="immeuble" t={15} /></span>
        <span>{`${client.prenom || 'Ce contact'} représente une société (SCI…) ?`}<em>{suggestion?.denomination ? ` · ${suggestion.denomination} est nommée dans « À savoir »` : ' · sa forme, ses associés'}</em></span>
      </button>
    );
  }

  return (
    <section className={`${c.bloc} ${c.socBloc}`}>
      <div className={c.blocT}>
        <span className={c.blocIc}><Ic n="immeuble" t={15} /></span>
        <h3>Sa société</h3>
        <button type="button" className={c.lien} onClick={() => setEdit({ ...st, associes: st.associes.map(a => ({ ...a })) })}>Modifier</button>
      </div>
      <div className={c.socTete}>
        <span className={c.socAv}>{(st.denomination.replace(/^(SCI|SARL|SAS|SA|SNC)\s+/i, '')[0] || 'S').toUpperCase()}</span>
        <div>
          <b>{st.denomination || 'Société sans nom'}{st.forme && !st.denomination.toUpperCase().startsWith(st.forme) && <em>{st.forme}</em>}</b>
          <small>{[st.qualite && `${client.prenom || 'Son rôle'} : ${st.qualite.charAt(0).toLowerCase()}${st.qualite.slice(1)}`, st.rcs].filter(Boolean).join(' · ')}</small>
          {st.siege && <small>{`Siège : ${st.siege}`}</small>}
        </div>
      </div>
      {st.associes.length > 0 && (
        <>
          <div className={c.socAssT}>{`Les associés · ${st.associes.length}`}</div>
          <div className={c.socListe}>
            {/* Les gérants d'abord ; au-delà de quatre, « Voir les N ». */}
            {[...st.associes].sort((p, q) => Number(/g[ée]rant|pr[ée]sident/i.test(q.role)) - Number(/g[ée]rant|pr[ée]sident/i.test(p.role))).slice(0, tous ? undefined : 4).map(a => {
              const soi = estSoi(a);
              const fiche = soi ? null : ficheDe(a);
              const gerant = /g[ée]rant|pr[ée]sident/i.test(a.role);
              return (
                <div key={a.id} className={c.socL} data-gerant={gerant ? 'oui' : 'non'}>
                  <span className={c.socInit}>{a.nom.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'}</span>
                  <div className={c.socNom}>
                    <b>{a.nom || 'Sans nom'}</b>
                    <span>
                      {a.role && <i className={gerant ? c.socRoleG : c.socRole}>{a.role}</i>}
                      {soi && <i className={c.socSoi}>C’est sa fiche</i>}
                    </span>
                  </div>
                  <div className={c.socJoindre}>
                    {a.tel && <a href={`tel:${a.tel.replace(/[\s.]/g, '')}`} title={a.tel}><Ic n="telephone" t={13} /><span>{a.tel}</span></a>}
                    {a.email && <a href={`mailto:${a.email}`} title={a.email}><Ic n="mail" t={13} /><span>{a.email}</span></a>}
                  </div>
                  {fiche && <button type="button" className={c.socFiche} onClick={() => onFiche(fiche)}><Ic n="personne" t={13} />Sa fiche</button>}
                </div>
              );
            })}
          </div>
          {st.associes.length > 4 && (
            <button type="button" className={c.socPlus} onClick={() => setTous(t => !t)}>{tous ? 'Replier la liste' : `Voir les ${st.associes.length} associés`}</button>
          )}
        </>
      )}
    </section>
  );
}
