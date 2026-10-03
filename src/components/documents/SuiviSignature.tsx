'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { heureParis } from '@/lib/mandat';
import { HOTE_ESPACE } from '@/lib/jeton';
import Depliant from '@/components/shared/Depliant';
import { PastillePli } from '@/components/shared/Pli';
import { Ic } from './ApercuActe';
import { appelSignature, nomSignataire, pagePerimee, type DocumentRow, type SignataireRow } from './outils';
import s from './Documents.module.css';

/* ═══ Où en est la signature : qui a signé, qui on attend (V3.32) ═════════
   Alexandre : « quand le mandat attend une signature, qu'on voie signature
   en cours, qu'on puisse déplier et voir qui a signé, qui n'a pas signé ».
   Une ligne dit l'essentiel (« Signature en ligne · 1 sur 2 · on attend
   Pierre ») avec un point par signataire ; elle se déplie sur chacun : signé
   quand, lien envoyé, ouvert ou pas, rappels, lien expiré — et ce qu'on peut
   faire pour lui (renvoyer le lien, corriger son adresse, copier le lien).

   Trois sortes de signatures, lues ici et montrées pareil :
   - un document de la rubrique, signé en ligne ou sur place
     (`documents_signataires`) ;
   - le mandat de recherche signé dans l'espace (`mandats_signatures`) et
     ceux qui signent avec lui (`mandats_cosignataires`) ;
   - le mandat PROPOSÉ dans l'espace, pas encore commencé
     (`recherches.mandat_propose_le`), et ses rappels automatiques.
   Même composant sur la fiche d'un contact et dans l'onglet Documents d'un bien. */

export type EtatSig = 'signe' | 'attente' | 'expire' | 'surplace' | 'decline' | 'agence';
export type LigneSuivi = {
  id: string; nom: string; role: string; email: string; etat: EtatSig; texte: string;
  geste?:
    | { sorte: 'doc'; docId: string; sigId: string; attendu: boolean }
    | { sorte: 'co'; coId: string; expire: boolean; lien: string }
    | { sorte: 'proposition'; clientId: string; rechercheId: string };
};
export type Suivi = {
  mode: 'en_ligne' | 'sur_place' | 'espace';
  titre: string; sous: string; signes: number; total: number; lignes: LigneSuivi[];
};

/* Ce que la liste sait d'un mandat signé dans l'espace. */
export type SigEspace = {
  id: string; numero: string | null; statut: string; signe_le: string | null; code_envoye_le?: string | null;
  mandant: { prenom?: string; nom?: string; email?: string } | null;
};
/* Le mandat proposé dans l'espace, pas encore commencé. */
export type Proposition = { rechercheId: string; clientId: string; proposeLe: string; numero: string | null; nom: string; email: string; rappels: string[] };

type CoRow = {
  id: string; signature_id: string; rang: number; statut: string; jeton: string | null;
  personne: { prenom?: string; nom?: string; email?: string } | null;
  invite_le: string | null; ouvert_le: string | null; lien_expire_le: string | null; relances: number;
  signe_le: string | null; decline_le: string | null;
};

/* « 29 septembre à 16 h 05 » (l'année seulement si ce n'est pas celle-ci). */
const leJour = (iso: string) => {
  const d = new Date(iso);
  const an = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', ...(an ? { year: 'numeric' } : {}), timeZone: 'Europe/Paris' });
};
const quand = (iso: string) => `${leJour(iso)} à ${heureParis(iso)}`;
const nomDe = (p: { prenom?: string; nom?: string } | null | undefined, repli = '') => `${p?.prenom || ''} ${p?.nom || ''}`.trim() || repli;
/* « Paul », « Paul et Claire », « Paul, Claire et Marc » ; au-delà de trois
   (V3.58 : une SCI de huit associés), « Paul, Claire et 6 autres » : la liste
   complète est dans le dépliant. */
const prenoms = (l: LigneSuivi[]) => {
  const n = l.map(x => x.nom);
  if (n.length > 3) return `${n.slice(0, 2).join(', ')} et ${n.length - 2} autres`;
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} et ${n[n.length - 1]}` : n[0] || '';
};
const rappel = (n: number) => (n === 1 ? ' · rappel envoyé' : n >= 2 ? ' · dernier rappel envoyé' : '');

/* La phrase du dessous : qui on attend, ou ce qu'il reste à faire. */
function sousTitre(lignes: LigneSuivi[], fin: string): string {
  const expires = lignes.filter(x => x.etat === 'expire');
  const attendus = lignes.filter(x => x.etat === 'attente' || x.etat === 'surplace');
  if (expires.length) return `Lien expiré pour ${prenoms(expires)} : renvoie-${expires.length > 1 ? 'les' : 'le'}`;
  if (attendus.length) return `On attend ${prenoms(attendus)}`;
  return fin;
}

/* ── Lire les suivis d'une liste, en trois requêtes au plus ── */
export async function lireSuivis(o: { docs?: DocumentRow[]; mandats?: SigEspace[]; propositions?: Proposition[] }): Promise<Record<string, Suivi>> {
  const out: Record<string, Suivi> = {};
  const maintenant = Date.now();

  /* 1. Les documents partis en signature (en ligne ou sur place). */
  const docs = (o.docs || []).filter(d => d.statut === 'pret' && d.signature);
  if (docs.length) {
    const { data, error } = await supabase.from('documents_signataires').select('*').in('document_id', docs.map(d => d.id)).neq('statut', 'annule').order('rang');
    if (error) throw new Error('Les signataires n’ont pas pu être lus : ' + error.message);
    const tous = (data || []) as SignataireRow[];
    for (const d of docs) {
      const sigs = tous.filter(x => x.document_id === d.id);
      const lignes: LigneSuivi[] = sigs.map(x => {
        const expire = x.statut === 'invite' && !!x.lien_expire_le && Date.parse(x.lien_expire_le) < maintenant;
        const etat: EtatSig = x.statut === 'signe' ? 'signe' : x.statut === 'attendu' ? 'surplace' : expire ? 'expire' : 'attente';
        const texte = etat === 'signe' ? `Signé le ${quand(x.signe_le!)}${x.mode === 'sur_place' ? ', sur place' : ', en ligne'}`
          : etat === 'surplace' ? 'Signera sur place, sur ton écran'
          : etat === 'expire' ? `Lien expiré le ${leJour(x.lien_expire_le!)}`
          : `Lien envoyé le ${x.invite_le ? quand(x.invite_le) : '—'} · ${x.ouvert_le ? `ouvert le ${quand(x.ouvert_le)}` : 'pas encore ouvert'}${rappel(x.relances)}`;
        return {
          id: x.id, nom: nomSignataire(x), role: x.role || 'Signataire', email: x.personne?.email || '', etat, texte,
          geste: etat === 'signe' ? undefined : { sorte: 'doc', docId: d.id, sigId: x.id, attendu: x.statut === 'attendu' },
        };
      });
      const signes = lignes.filter(x => x.etat === 'signe').length;
      const agence: LigneSuivi[] = d.signature?.agence_le
        ? [{ id: 'agence-' + d.id, nom: 'L’agence', role: 'Emilio Immobilier', email: '', etat: 'agence', texte: `Signé le ${quand(d.signature.agence_le)}, au lancement` }]
        : [];
      const mode = d.signature?.mode === 'sur_place' ? 'sur_place' : 'en_ligne';
      out[d.id] = {
        mode, signes, total: lignes.length, lignes: [...lignes, ...agence],
        titre: `Signature ${mode === 'sur_place' ? 'sur place' : 'en ligne'} · ${signes} sur ${lignes.length}`,
        sous: sousTitre(lignes, mode === 'sur_place' ? 'Tout le monde a signé : finalise-le dans Documents' : 'Tout le monde a signé : le document se range tout seul'),
      };
    }
  }

  /* 2. Le mandat de recherche signé (ou commencé) dans l'espace. */
  const mandats = (o.mandats || []).filter(m => m.statut === 'partiel' || m.statut === 'en_cours');
  if (mandats.length) {
    const partiels = mandats.filter(m => m.statut === 'partiel').map(m => m.id);
    const { data } = partiels.length
      ? await supabase.from('mandats_cosignataires').select('*').in('signature_id', partiels).neq('statut', 'prevu').order('rang')
      : { data: [] as CoRow[] };
    const cos = (data || []) as CoRow[];
    for (const m of mandats) {
      const nomP = nomDe(m.mandant, 'Le client');
      if (m.statut === 'en_cours') {
        const l: LigneSuivi = {
          id: 'mandant-' + m.id, nom: nomP, role: 'Le mandant', email: m.mandant?.email || '', etat: 'attente',
          texte: m.code_envoye_le ? `A demandé son code le ${quand(m.code_envoye_le)} : pas encore signé` : 'A commencé dans son espace : pas encore signé',
        };
        out['r-' + m.id] = { mode: 'espace', signes: 0, total: 1, lignes: [l], titre: 'Signature en cours dans son espace', sous: l.texte };
        continue;
      }
      const siens = cos.filter(c => c.signature_id === m.id);
      const lignes: LigneSuivi[] = [
        { id: 'mandant-' + m.id, nom: nomP, role: 'Le mandant', email: m.mandant?.email || '', etat: 'signe', texte: m.signe_le ? `Signé le ${quand(m.signe_le)}, dans son espace` : 'Signé dans son espace' },
        ...siens.map((c): LigneSuivi => {
          const expire = c.statut === 'invite' && !!c.lien_expire_le && Date.parse(c.lien_expire_le) < maintenant;
          const etat: EtatSig = c.statut === 'signe' ? 'signe' : c.statut === 'decline' || c.statut === 'annule' || c.statut === 'retracte' ? 'decline' : expire ? 'expire' : 'attente';
          const texte = etat === 'signe' ? `Signé le ${c.signe_le ? quand(c.signe_le) : '—'}, avec son lien`
            : c.statut === 'decline' ? 'A indiqué ne pas être concerné'
            : c.statut === 'annule' ? 'Invitation close : le mandat continue sans lui'
            : c.statut === 'retracte' ? 'A renoncé au mandat'
            : etat === 'expire' ? `Lien expiré le ${leJour(c.lien_expire_le!)}`
            : `Lien envoyé le ${c.invite_le ? quand(c.invite_le) : '—'} · ${c.ouvert_le ? `ouvert le ${quand(c.ouvert_le)}` : 'pas encore ouvert'}${rappel(c.relances)}`;
          return {
            id: c.id, nom: nomDe(c.personne, 'Co-signataire'), role: 'Signe avec lui', email: c.personne?.email || '', etat, texte,
            geste: etat === 'attente' || etat === 'expire' ? { sorte: 'co', coId: c.id, expire: etat === 'expire', lien: c.jeton ? `https://${HOTE_ESPACE}/signer/${c.jeton}` : '' } : undefined,
          };
        }),
      ];
      const comptes = lignes.filter(x => x.etat !== 'decline');
      const signes = comptes.filter(x => x.etat === 'signe').length;
      out['r-' + m.id] = {
        mode: 'espace', signes, total: comptes.length, lignes,
        titre: `Mandat signé en ligne · ${signes} sur ${comptes.length}`,
        sous: sousTitre(lignes, 'Tout le monde a signé'),
      };
    }
  }

  /* 3. Le mandat proposé dans l'espace, pas encore commencé. */
  for (const p of o.propositions || []) {
    const r = p.rappels.length;
    const l: LigneSuivi = {
      id: 'prop-' + p.rechercheId, nom: p.nom, role: 'Le mandant', email: p.email, etat: 'attente',
      texte: `Proposé le ${leJour(p.proposeLe)} · pas encore signé${r ? ` · ${r === 1 ? 'un rappel parti' : `${r} rappels partis`} (le dernier le ${leJour(p.rappels[0])})` : ''}`,
      geste: { sorte: 'proposition', clientId: p.clientId, rechercheId: p.rechercheId },
    };
    out['p-' + p.rechercheId] = {
      mode: 'espace', signes: 0, total: 1, lignes: [l],
      titre: 'Proposé dans son espace · pas encore signé',
      sous: r ? `${r === 1 ? 'Un rappel automatique est parti' : 'Deux rappels automatiques sont partis'} : un coup de fil peut aider` : 'Un rappel part tout seul 2 jours après, puis à 7 jours',
    };
  }
  return out;
}

/* ── L'affichage : la ligne, puis le détail qui se déplie ── */
export default function SuiviSignature({ suivi, onFait, ouvertAuDebut = false }: {
  suivi: Suivi;
  /* Après un geste (lien renvoyé, adresse corrigée) : relire. */
  onFait?: () => void;
  ouvertAuDebut?: boolean;
}) {
  const [ouvert, setOuvert] = useState(ouvertAuDebut);
  const [travail, setTravail] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [corrige, setCorrige] = useState<{ id: string; email: string } | null>(null);
  const personnes = suivi.lignes.filter(x => x.etat !== 'agence');
  const alerte = personnes.some(x => x.etat === 'expire');

  async function geste(l: LigneSuivi, email?: string) {
    const g = l.geste;
    if (!g) return;
    setTravail(l.id); setMsg(null);
    try {
      if (g.sorte === 'doc') {
        await appelSignature({ action: 'renvoyer', id: g.docId, sig: g.sigId, ...(email ? { email } : {}) });
        setMsg({ ok: true, t: email ? `Adresse corrigée : un nouveau lien est parti à ${email}. L’ancien ne fonctionne plus.` : g.attendu ? `${l.nom} signera avec son lien : il vient de partir à ${l.email}.` : `Lien renvoyé à ${l.email}.` });
      } else if (g.sorte === 'co') {
        const r = await fetch('/api/mandat/cosignataire', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: g.expire ? 'relancer' : 'renvoyer', coId: g.coId }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.ok) throw new Error(j?.erreur || `erreur ${r.status}`);
        setMsg({ ok: true, t: `Lien ${g.expire ? 'neuf ' : ''}envoyé à ${l.nom}.` });
      } else {
        if (!confirm(`Renvoyer à ${l.email || 'son adresse'} le mail « Votre mandat de recherche est prêt » ?`)) { setTravail(''); return; }
        const r = await fetch('/api/send-mail', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'mandat', client_ids: [g.clientId], recherche_id: g.rechercheId, objet: 'Votre mandat de recherche est prêt', corps: '' }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.success) throw new Error(j?.error || j?.results?.[0]?.error || `erreur ${r.status}`);
        setMsg({ ok: true, t: `Mail renvoyé à ${l.email || 'son adresse'}.` });
      }
      setCorrige(null);
      onFait?.();
    } catch (e) {
      setMsg({ ok: false, t: (e as Error).message });
      /* V3.55 : la liste n'était plus à jour (signé, arrêté ailleurs) : elle se relit. */
      if (pagePerimee(e)) onFait?.();
    }
    setTravail('');
  }
  async function copier(lien: string, nom: string) {
    try { await navigator.clipboard.writeText(lien); setMsg({ ok: true, t: `Lien de ${nom} copié : tu peux le lui envoyer par SMS.` }); }
    catch { window.prompt('Copie ce lien :', lien); }
  }

  return (
    <div className={s.suivi} data-alerte={alerte ? 'oui' : undefined}>
      <button type="button" className={s.suiviTete} aria-expanded={ouvert} onClick={() => setOuvert(v => !v)}>
        <span className={s.suiviPoints} aria-hidden="true">
          {personnes.map(x => <i key={x.id} data-etat={x.etat} />)}
        </span>
        <span className={s.suiviTx}>
          <b>{suivi.titre}</b>
          <small>{suivi.sous}</small>
        </span>
        {/* À côté du titre, pas tout à droite (V3.33). */}
        <PastillePli ouvert={ouvert} voir="Qui a signé ?" replier="Masquer" className={s.suiviVoir} />
      </button>
      <Depliant ouvert={ouvert}>
        <div className={s.suiviListe}>
          {suivi.lignes.map(l => (
            <div key={l.id} className={s.suiviLigne} data-etat={l.etat}>
              <span className={s.suiviPt}><Ic n={l.etat === 'signe' || l.etat === 'agence' ? 'check' : l.etat === 'surplace' ? 'tablette' : l.etat === 'decline' ? 'croix' : 'horloge'} t={13} e={l.etat === 'signe' || l.etat === 'agence' ? 3 : 2.2} /></span>
              <span className={s.suiviQui}>
                <b>{l.nom}</b>
                <i>{[l.role, l.email].filter(Boolean).join(' · ')}</i>
                <em>{l.texte}</em>
                {l.geste && (
                  <span className={s.sigActions}>
                    {l.geste.sorte === 'doc' && (
                      <>
                        <button type="button" className={s.btnLien} disabled={!!travail} onClick={() => { void geste(l); }}>
                          {travail === l.id ? 'Envoi…' : l.geste.attendu ? 'Il signera plus tard, par lien' : 'Renvoyer le lien'}
                        </button>
                        <button type="button" className={s.btnLien} disabled={!!travail} onClick={() => setCorrige(corrige?.id === l.id ? null : { id: l.id, email: l.email })}>Corriger l’e-mail</button>
                      </>
                    )}
                    {l.geste.sorte === 'co' && (
                      <>
                        <button type="button" className={s.btnLien} disabled={!!travail} onClick={() => { void geste(l); }}>
                          {travail === l.id ? 'Envoi…' : l.geste.expire ? 'Envoyer un lien neuf' : 'Renvoyer le lien'}
                        </button>
                        {!l.geste.expire && l.geste.lien && <button type="button" className={s.btnLien} onClick={() => { const g = l.geste as { lien: string }; void copier(g.lien, l.nom); }}>Copier son lien</button>}
                      </>
                    )}
                    {l.geste.sorte === 'proposition' && (
                      <button type="button" className={s.btnLien} disabled={!!travail} onClick={() => { void geste(l); }}>{travail === l.id ? 'Envoi…' : 'Lui renvoyer le mail'}</button>
                    )}
                  </span>
                )}
                {corrige?.id === l.id && (
                  <span className={s.sigMail}>
                    <input type="email" className={s.input} value={corrige.email} aria-label={`Nouvelle adresse de ${l.nom}`}
                      onChange={e => setCorrige({ id: l.id, email: e.target.value })} />
                    <button type="button" className={`${s.btn} ${s.btnNavy}`} disabled={!!travail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(corrige.email.trim())}
                      onClick={() => { void geste(l, corrige.email.trim()); }}>Envoyer</button>
                  </span>
                )}
              </span>
            </div>
          ))}
          {msg && <div className={msg.ok ? s.note : s.erreur}>{msg.t}</div>}
        </div>
      </Depliant>
    </div>
  );
}
