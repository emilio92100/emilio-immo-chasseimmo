'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { signalerEchec, verifie, verifieTout } from '@/lib/ecritures';
import { delaiRelance } from '@/lib/relances';
import ChoixDate from '@/components/shared/ChoixDate';
import { ISSUES_APPEL } from '@/components/fiche/FriseSuivi';
import { Ic } from '@/components/documents/ApercuActe';
import c from './Contacts.module.css';

/* ═══ Noter une action sur un contact qui n'est pas acheteur (V3.23) ════════
   La même fenêtre que « Ajouter une action » de la fiche d'un acheteur
   (FicheClient), pour un gardien, un notaire, un confrère, un propriétaire… :
   le type, les issues d'un appel en un clic (a répondu, messagerie…), le
   titre, les notes, la relance, et « Ajouter au journal ».

   Pas de recherche ici : la ligne du journal et la relance portent
   `recherche_id: null` (le journal est lu sur `client_id`, AGENTS.md §3.1 ;
   la page Relances lit toutes les relances en attente, avec le client).
   Même règle qu'ailleurs : la relance est créée d'abord, son identifiant va
   dans la ligne du journal, et les deux partent ensemble à la suppression.

   V3.74 — « Traiter » une relance depuis la page Relances (Alexandre : « on
   reste sur la page, un petit pop-up : qu'est-ce qui s'est passé suite à
   l'appel »). La même fenêtre, avec en haut le rappel de la relance et le
   téléphone du client (un clic pour appeler), la recherche de la relance
   (`rechercheId` : la ligne et la prochaine relance restent sur sa
   recherche), et pour le tri d'après l'import, « Il reste » ou « Il ne reste
   pas » (onFait dit s'il faut l'archiver). */

const TYPES: { v: string; l: string; ic: string }[] = [
  { v: 'appel', l: 'Appel passé', ic: 'telephone' },
  { v: 'rdv', l: 'RDV physique', ic: 'groupe' },
  { v: 'note', l: 'Note libre', ic: 'crayon' },
  { v: 'email_libre', l: 'Email envoyé', ic: 'mail' },
  { v: 'envoi_externe', l: 'Envoi externe', ic: 'envoyer' },
];
const TITRES_TYPE: Record<string, string> = { appel: 'Appel passé', rdv: 'RDV physique', note: 'Note', email_libre: 'Email envoyé', envoi_externe: 'Envoi externe', relance_manuelle: 'Relance manuelle' };
const TITRES_AUTO = new Set<string>([...Object.values(TITRES_TYPE), 'Note libre', ...ISSUES_APPEL.map(x => x.titre)]);
const titreAuto = (t: string) => !t.trim() || TITRES_AUTO.has(t.trim());

const jourPlus = (j: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + j); return d.toISOString().split('T')[0]; };
const jourDe = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/* Le téléphone ou l'ordinateur réglé sur « réduire les animations ». */
const sansMouvement = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* Supprimer une ligne du suivi d'un contact, et sa relance si elle attend encore. */
export async function supprimerActionContact(j: { id: string; titre: string; metadata?: { relance_id?: string } | null }, clientId: string): Promise<boolean> {
  const rid = j.metadata?.relance_id;
  let quand = '';
  if (rid) {
    const { data } = await supabase.from('relances').select('date_echeance, statut').eq('id', rid).maybeSingle();
    if (data && data.statut === 'en_attente') quand = new Date(data.date_echeance).toLocaleDateString('fr-FR');
  }
  if (!confirm(`Supprimer « ${j.titre} » du suivi ?\n\nCette ligne disparaît définitivement de l'historique.` + (quand ? `\nLa relance prévue le ${quand} est supprimée avec elle.` : ''))) return false;
  if (rid) {
    if (quand) await verifie('La suppression de la relance', supabase.from('relances').delete().eq('id', rid).eq('statut', 'en_attente'));
    await verifie('La suppression de l’action', supabase.from('journal').delete().eq('client_id', clientId).eq('metadata->>relance_id', rid));
  }
  return verifie('La suppression de l’action', supabase.from('journal').delete().eq('id', j.id).select('id'), { ligne: !rid });
}

export type ContexteRelance = { titre: string; texte?: string | null; telephones?: string[] | null };
export default function FenetreAction({ clientId, prenom, edition, typeInitial = 'note', onFermer, onFait, rechercheId = null, contexte, titre: titreImpose, libelleValider, proposerArchive = false }: {
  clientId: string; prenom: string;
  /* Une ligne du journal à modifier, ou null pour en créer une. */
  edition: { id: string; type: string; titre: string; description: string | null; metadata?: { relance_id?: string } | null } | null;
  typeInitial?: 'note' | 'appel';
  onFermer: () => void;
  /* V3.74 : `archiver`, pour le tri d'après l'import (« Il ne reste pas »). */
  onFait: (info?: { archiver: boolean }) => void;
  /* V3.74 — Traiter une relance : sa recherche, son rappel, le titre et le bouton. */
  rechercheId?: string | null;
  contexte?: ContexteRelance;
  titre?: string;
  libelleValider?: string;
  proposerArchive?: boolean;
}) {
  const [f, setF] = useState(() => edition
    ? { type: edition.type || 'note', titre: edition.titre || '', description: edition.description || '', relance: '' }
    : { type: typeInitial, titre: typeInitial === 'appel' ? 'Appel passé' : '', description: '', relance: '' });
  /* La relance de la ligne modifiée : lue en base, pour la déplacer. */
  const [relanceId, setRelanceId] = useState<string | null>(null);
  const [delai, setDelai] = useState(5);
  const [occupe, setOccupe] = useState(false);
  /* Le tri : il reste dans le fichier (null tant qu'on n'a pas choisi), ou non. */
  const [reste, setReste] = useState<boolean | null>(null);
  const notes = useRef<HTMLTextAreaElement>(null);
  /* V3.74 — Rien de brutal : la fenêtre monte (les blocs arrivent l'un après
     l'autre), « Valider » passe au vert avec sa coche, puis elle redescend. */
  const [ouverture, setOuverture] = useState(true);
  const [reussi, setReussi] = useState(false);
  const [sortie, setSortie] = useState(false);
  const bloque = occupe || reussi || sortie;
  useEffect(() => { const t = setTimeout(() => setOuverture(false), 700); return () => clearTimeout(t); }, []);
  /* Les minuteries ne sont pas annulées si la fenêtre disparaît : `onFait`
     doit partir quoi qu'il arrive (la page Relances y clôt la relance). */
  const fermer = () => {
    if (bloque) return;
    if (sansMouvement()) { onFermer(); return; }
    setSortie(true);
    setTimeout(onFermer, 230);
  };
  const finir = (info?: { archiver: boolean }) => {
    if (sansMouvement()) { onFait(info); return; }
    setReussi(true);
    setTimeout(() => { setSortie(true); setTimeout(() => onFait(info), 240); }, 620);
  };
  /* Échap ferme, comme un clic à côté. */
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || bloque) return;
      if (sansMouvement()) { onFermer(); return; }
      setSortie(true);
      setTimeout(onFermer, 230);
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [bloque, onFermer]);

  useEffect(() => {
    delaiRelance().then(setDelai);
    const rid = edition?.metadata?.relance_id;
    if (!rid) return;
    supabase.from('relances').select('date_echeance, statut').eq('id', rid).maybeSingle().then(({ data }) => {
      if (data && data.statut === 'en_attente') { setRelanceId(rid); setF(x => ({ ...x, relance: jourDe(data.date_echeance) })); }
    });
  }, [edition]);

  async function enregistrer() {
    const titre = f.titre.trim() || TITRES_TYPE[f.type] || 'Action';
    const noteRelance = [titre, f.description.trim()].filter(Boolean).join(' — ').slice(0, 300);
    const echeance = f.relance ? new Date(`${f.relance}T12:00:00`).toISOString() : '';
    setOccupe(true);
    try {
      if (edition) {
        if (!(await verifie('L’action', supabase.from('journal').update({ type: f.type, titre, description: f.description || null }).eq('id', edition.id).select('id'), { ligne: true }))) return;
        if (relanceId && f.relance) {
          await verifie('La date de relance', supabase.from('relances').update({ date_echeance: echeance, note: noteRelance }).eq('id', relanceId).eq('statut', 'en_attente'));
        } else if (relanceId && !f.relance) {
          const rid = relanceId, aid = edition.id;
          await verifieTout('Le retrait de la relance', [
            () => supabase.from('relances').delete().eq('id', rid).eq('statut', 'en_attente'),
            () => supabase.from('journal').update({ metadata: {} }).eq('id', aid),
          ]);
        } else if (!relanceId && f.relance) {
          const { data: rel, error } = await supabase.from('relances').insert({
            client_id: clientId, recherche_id: rechercheId, type: 'manuelle', statut: 'en_attente', date_echeance: echeance, note: noteRelance,
          }).select('id').single();
          if (error) signalerEchec('La relance', error.message);
          if (rel?.id) await verifie('Le lien entre l’action et sa relance', supabase.from('journal').update({ metadata: { relance_id: rel.id } }).eq('id', edition.id));
        }
        finir();
        return;
      }
      let rid: string | null = null;
      if (f.relance) {
        const { data: rel, error } = await supabase.from('relances').insert({
          client_id: clientId, recherche_id: rechercheId, type: 'manuelle', statut: 'en_attente', date_echeance: echeance, note: noteRelance,
        }).select('id').single();
        if (error) { signalerEchec('La relance', error.message); return; }
        rid = rel?.id || null;
      }
      const ok = await verifie('L’action', supabase.from('journal').insert({
        client_id: clientId, recherche_id: rechercheId, type: f.type, titre, description: f.description || null,
        metadata: rid ? { relance_id: rid } : {},
      }));
      if (!ok) { if (rid) await verifie('La relance créée avec l’action', supabase.from('relances').delete().eq('id', rid)); return; }
      finir({ archiver: proposerArchive && reste === false });
    } finally {
      setOccupe(false);
    }
  }

  const RACCOURCIS: [string, number][] = [['Demain', 1], ['Dans 3 j', 3], [`Dans ${delai} j`, delai], ['Dans 15 j', 15], ['Dans 1 mois', 30]];
  const pose = !!f.relance;
  const titreFen = titreImpose || (edition ? 'Modifier l’action' : f.type === 'appel' && typeInitial === 'appel' ? 'Noter un appel' : 'Ajouter une action');
  /* Le tri : il faut avoir dit s'il reste, et « il ne reste pas » ne pose pas de relance. */
  const attendTri = proposerArchive && reste === null;
  const telephones = (contexte?.telephones || []).filter(Boolean);

  const fen = (
    <div className={`${c.fen} ${c.fenAnime}`} data-ouverture={ouverture ? '' : undefined} data-sortie={sortie ? '' : undefined}
      onClick={e => { if (e.target === e.currentTarget) fermer(); }}>
      <div className={c.fenIn} style={{ width: 'min(720px, 100%)' }} role="dialog" aria-modal="true" aria-label={titreFen}>
        <div className={c.fenTete}>
          <h3>{`${titreFen}${prenom ? ` · ${prenom}` : ''}`}</h3>
          <button type="button" className={c.btn} onClick={fermer} aria-label="Fermer" disabled={bloque}>✕</button>
        </div>
        <div className={c.fenCorps}>
          {contexte && (
            <div className={c.actContexte}>
              <span className={c.actContexteT}><Ic n="alarme" t={14} />{contexte.titre}</span>
              {contexte.texte && <span className={c.actContexteX}>{contexte.texte}</span>}
              {telephones.length > 0 && (
                <span className={c.actTels}>
                  {telephones.map(t => <a key={t} href={`tel:${t.replace(/[^\d+]/g, '')}`}><Ic n="telephone" t={14} /><span>{t}</span></a>)}
                </span>
              )}
            </div>
          )}

          <div className={c.ch}>
            <span>Type d’action</span>
            <div className={c.actTypes}>
              {TYPES.map(o => (
                <button key={o.v} type="button" className={`${c.actType} ${f.type === o.v ? c.actTypeOn : ''}`}
                  onClick={() => setF(x => ({ ...x, type: o.v, titre: titreAuto(x.titre) ? o.l : x.titre }))}>
                  <Ic n={o.ic} t={15} />{o.l}
                </button>
              ))}
            </div>
          </div>

          {f.type === 'appel' && (
            <div className={`${c.ch} ${c.actApparait}`}>
              <span>Comment ça s’est passé ?</span>
              <div className={c.actIssues}>
                {ISSUES_APPEL.map(x => {
                  const on = f.titre.trim() === x.titre;
                  return (
                    <button key={x.k} type="button" aria-pressed={on} className={c.actIssue}
                      style={on ? { borderColor: x.c, background: x.bg, color: x.c, boxShadow: `0 0 0 3px ${x.bg}` } : undefined}
                      onClick={() => {
                        setF(v => ({ ...v, titre: on ? 'Appel passé' : x.titre }));
                        if (!on && x.k === 'repondu') setTimeout(() => notes.current?.focus(), 30);
                      }}>
                      <i style={{ background: x.c }} />{x.lib}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <label className={c.ch}><span>Titre<em className={c.facult}>{' · facultatif'}</em></span>
            <input className={c.in} value={f.titre} onChange={e => setF({ ...f, titre: e.target.value })} />
          </label>
          <label className={c.ch}><span>Notes, détails</span>
            <textarea ref={notes} className={c.notes} style={{ minHeight: 96 }} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
          </label>

          {proposerArchive && (
            <div className={c.ch}>
              <span>Après cet appel</span>
              <div className={c.actIssues}>
                <button type="button" aria-pressed={reste === true} className={c.actIssue} onClick={() => setReste(true)}
                  style={reste === true ? { borderColor: '#15803d', background: '#ecfdf3', color: '#15803d', boxShadow: '0 0 0 3px #ecfdf3' } : undefined}>
                  <i style={{ background: '#15803d' }} />Il reste
                </button>
                <button type="button" aria-pressed={reste === false} className={c.actIssue} onClick={() => { setReste(false); setF(x => ({ ...x, relance: '' })); }}
                  style={reste === false ? { borderColor: '#475569', background: '#f1f5f9', color: '#334155', boxShadow: '0 0 0 3px #f1f5f9' } : undefined}>
                  <i style={{ background: '#64748b' }} />Il ne reste pas
                </button>
              </div>
              <p key={String(reste)} className={`${c.pied} ${c.actApparait}`} style={{ margin: 0 }}>{reste === false ? 'Il sera archivé : rangé dans « Archivés », ses relances en attente se fermeront.' : reste ? 'Il reste dans ton fichier : pose-lui une prochaine relance si besoin.' : 'Dis s’il reste dans ton fichier, ou s’il faut l’archiver.'}</p>
            </div>
          )}

          {!(proposerArchive && reste === false) && <div className={`${c.actRelance} ${c.actApparait}`} data-pose={pose ? 'oui' : 'non'}>
            <span className={c.actRelanceT}><Ic n="alarme" t={14} />{'Prochaine relance'}<em className={c.facult}>{' · facultatif'}</em></span>
            <div className={c.pills}>
              <button type="button" className={`${c.pill} ${!pose ? c.pillOn : ''}`} onClick={() => setF({ ...f, relance: '' })}>Aucune</button>
              {RACCOURCIS.map(([lib, j]) => {
                const d = jourPlus(j);
                return <button key={lib} type="button" className={`${c.pill} ${f.relance === d ? c.pillOr : ''}`} onClick={() => setF({ ...f, relance: f.relance === d ? '' : d })}>{lib}</button>;
              })}
            </div>
            <ChoixDate valeur={f.relance} min={new Date().toISOString().split('T')[0]} placeholder="Choisir une autre date" onChange={v => setF({ ...f, relance: v })} />
            <span className={c.pied}>{pose ? `Elle apparaîtra dans « Relances » le ${new Date(`${f.relance}T12:00:00`).toLocaleDateString('fr-FR')}.` : 'Laissez « Aucune » si rien n’est à rappeler.'}</span>
          </div>}
        </div>
        <div className={c.fenPied}>
          <button type="button" className={c.btn} disabled={bloque} onClick={fermer}>Annuler</button>
          <button type="button" className={`${c.btn} ${c.btnOr} ${c.actValider} ${reussi ? c.actReussi : ''}`} disabled={bloque || attendTri} onClick={enregistrer} title={attendTri ? 'Dis d’abord s’il reste dans le fichier' : undefined}>
            {reussi ? (
              <>
                <svg className={c.actCoche} width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{edition ? 'Enregistré' : 'Noté dans le suivi'}</span>
              </>
            ) : occupe ? <><span className={c.actTourne} aria-hidden="true" /><span>Enregistrement…</span></> : edition ? '✓ Enregistrer'
              : libelleValider ? (pose ? `${libelleValider} · relance le ${new Date(`${f.relance}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : libelleValider)
              : pose ? `✓ Ajouter au journal · relance le ${new Date(`${f.relance}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                : '✓ Ajouter au journal'}
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(fen, document.body);
}
