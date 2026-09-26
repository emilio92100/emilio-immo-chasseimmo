'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import {
  ISSUES, RAISONS, AIME, issueDe, AVIS_HERITE, badgeApresVisite, resumeIssue, type Issue,
} from '@/lib/visites';

/* ═══ Le compte rendu de visite ═══════════════════════════════════════════
   Une seule fenêtre, ouverte depuis la fiche client (onglet Visites) et depuis
   la page Visites. Elle part de ce que le client a déjà dit dans son espace :
   Alexandre complète ou corrige, il ne ressaisit pas.

   L'écriture est ici aussi (enregistrerCompteRendu) : les deux écrans
   écrivent exactement la même chose, avec le dossier (recherche_id) partout. */

export type ValeursCR = {
  issue: Issue | null; motifs: string[]; aime: string[];
  etoiles: number; commentaire: string; retenir: boolean;
};

const NAVY = '#1a2332', OR = '#c9a84c', GRIS = '#64748b', CLAIR = '#94a3b8', BORD = '#e3e8f0';
const JAK = "'Plus Jakarta Sans', system-ui, sans-serif";

const QUESTION: Record<Issue, string> = {
  non: 'Ce qui n’a pas convenu',
  reflexion: 'Ce qui le fait hésiter',
  revoir: 'Pourquoi le revoir',
  offre: '',
};
const SOUS_ISSUE: Record<Issue, string> = {
  offre: 'Il veut se positionner',
  revoir: 'Une 2e visite à caler',
  reflexion: 'Il prend le temps',
  non: 'Et on retient pourquoi',
};

const euros = (n: number) => `${Number(n).toLocaleString('fr-FR')} €`;
const quandCourt = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};

/* ─── L'écriture, commune aux deux écrans ─── */
export async function enregistrerCompteRendu(
  v: any, x: ValeursCR,
  ctx: { clientId: string; rechercheId?: string | null; bienTitre: string; badgeActuel?: string | null },
): Promise<string | null> {
  const avant = issueDe(v);
  /* L'issue reste « la sienne » si Alexandre garde ce que le client a dit. */
  const garde = !!v.avis_client_le && x.issue === v.issue && v.issue_par === 'client';
  const { error } = await supabase.from('visites').update({
    statut: 'effectuee',
    note_etoiles: x.etoiles || 0,
    commentaire: x.commentaire || '',
    avis_client: x.issue ? AVIS_HERITE[x.issue] : '',
    issue: x.issue,
    motifs: x.issue ? x.motifs : [],
    aime: x.aime,
    retenir: x.retenir,
    issue_par: x.issue ? (garde ? 'client' : 'conseiller') : null,
    issue_le: x.issue ? (x.issue === avant && v.issue_le ? v.issue_le : new Date().toISOString()) : null,
  }).eq('id', v.id);
  if (error) return error.message;

  if (v.bien_id) {
    const { error: eB } = await supabase.from('biens')
      .update({ badge_retour: badgeApresVisite(x.issue, ctx.badgeActuel) }).eq('id', v.bien_id);
    if (eB) console.error('[compte rendu] bien', eB.message);
  }
  const etoiles = x.etoiles > 0 ? '⭐'.repeat(x.etoiles) : '';
  const corps = [
    x.issue ? `Issue : ${resumeIssue(x.issue, x.motifs)}` : '',
    x.aime.length ? `Il a aimé : ${x.aime.join(', ')}` : '',
    etoiles ? `Note : ${etoiles}` : '',
    x.commentaire || '',
  ].filter(Boolean).join(' | ');
  const { error: eE } = await supabase.from('envois').insert({
    client_id: ctx.clientId,
    ...(ctx.rechercheId ? { recherche_id: ctx.rechercheId } : {}),
    type: 'compte_rendu_visite',
    objet: `Visite — ${ctx.bienTitre}`,
    corps, destinataires: [], sms_envoye: false,
  });
  if (eE) console.error('[compte rendu] envoi', eE.message);
  const { error: eJ } = await supabase.from('journal').insert({
    client_id: ctx.clientId,
    ...(ctx.rechercheId ? { recherche_id: ctx.rechercheId } : {}),
    ...(v.bien_id ? { bien_id: v.bien_id } : {}),
    type: 'visite_effectuee',
    titre: `✅ Visite effectuée${x.issue ? ` · ${ISSUES[x.issue].crm}` : ''}${etoiles ? ` · ${etoiles}` : ''} — ${ctx.bienTitre}`,
    description: x.commentaire || null,
    metadata: { visite_id: v.id, issue: x.issue, motifs: x.motifs, aime: x.aime },
  });
  if (eJ) console.error('[compte rendu] journal', eJ.message);
  return null;
}

function Pastille({ on, children, onClick, ton }: { on: boolean; children: React.ReactNode; onClick: () => void; ton?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="crv-pas"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 99, border: `1px solid ${on ? (ton || NAVY) : '#dfe5ee'}`, background: on ? (ton || NAVY) : 'white', color: on ? 'white' : '#475569', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
      {on && <span aria-hidden="true">✓</span>}{children}
    </button>
  );
}

export default function CompteRenduVisite({ visite, titre, sous, prenom, onFermer, onValider }: {
  visite: any; titre: string; sous?: string; prenom?: string;
  onFermer: () => void;
  onValider: (x: ValeursCR) => Promise<string | null>;
}) {
  const depart = issueDe(visite);
  const [issue, setIssue] = useState<Issue | null>(depart);
  const [motifs, setMotifs] = useState<string[]>(Array.isArray(visite?.motifs) ? visite.motifs : []);
  const [aime, setAime] = useState<string[]>(Array.isArray(visite?.aime) ? visite.aime : []);
  const [etoiles, setEtoiles] = useState<number>(visite?.note_etoiles || 0);
  const [commentaire, setCommentaire] = useState<string>(visite?.statut === 'effectuee' ? (visite?.commentaire || '') : '');
  const [retenir, setRetenir] = useState<boolean>(visite?.retenir !== false);
  const [enCours, setEnCours] = useState(false);
  const [pret, setPret] = useState(false);
  useEffect(() => { setPret(true); }, []);

  /* Changer d'issue remet les raisons à zéro : celles de « non » ne veulent
     rien dire pour « il réfléchit ». On retrouve celles du client s'il revient
     sur son issue à lui. */
  const choisir = (i: Issue) => {
    if (i === issue) return;
    setIssue(i);
    setMotifs(i === visite?.issue && Array.isArray(visite?.motifs) ? visite.motifs : []);
  };
  const bascule = (l: string[], set: (x: string[]) => void, n: string) => set(l.includes(n) ? l.filter(x => x !== n) : [...l, n]);

  const qui = prenom || 'Le client';
  const aRepondu = !!visite?.avis_client_le && !!visite?.issue;
  const lesRaisons = issue ? RAISONS[issue] : [];
  const pourRecherche = [...(issue === 'non' ? motifs : []), ...aime];

  async function valider() {
    setEnCours(true);
    const err = await onValider({ issue, motifs: issue ? motifs : [], aime, etoiles, commentaire: commentaire.trim(), retenir });
    setEnCours(false);
    if (err) alert('Le compte rendu n’a pas été enregistré : ' + err);
  }

  if (!pret) return null;
  return createPortal(
    <div className="crv-voile" onClick={e => { if (e.target === e.currentTarget && !enCours) onFermer(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(3px)' }}>
      <style>{`
        .crv-boite{background:#fff;border-radius:18px;width:100%;max-width:800px;max-height:94vh;display:flex;flex-direction:column;box-shadow:0 30px 60px -20px rgba(0,0,0,.45);font-family:inherit}
        .crv-tuiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
        .crv-bas{display:grid;grid-template-columns:170px 1fr;gap:14px}
        .crv-pas:focus-visible,.crv-tuile:focus-visible{outline:2px solid ${OR};outline-offset:2px}
        @media (max-width:640px){
          .crv-voile{align-items:flex-end !important;padding:0 !important}
          .crv-boite{border-radius:18px 18px 0 0;max-height:96vh}
          .crv-tuiles{grid-template-columns:1fr 1fr}
          .crv-bas{grid-template-columns:1fr}
          .crv-indice{display:none}
        }
      `}</style>
      <div className="crv-boite" role="dialog" aria-modal="true" aria-label="Compte rendu de visite">
        <div style={{ padding: '18px 22px 12px', borderBottom: '1px solid #f1f5f9', position: 'relative' }}>
          <button type="button" onClick={onFermer} aria-label="Fermer" disabled={enCours}
            style={{ position: 'absolute', top: 14, right: 16, background: '#f1f5f9', border: 'none', borderRadius: 10, width: 34, height: 34, color: GRIS, fontSize: 16, cursor: 'pointer' }}>✕</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 44 }}>
            <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 11, background: '#fffbeb', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📝</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: JAK, fontSize: 19, fontWeight: 800, color: NAVY }}>Compte rendu de visite</div>
              <div style={{ fontSize: 12.5, color: CLAIR, marginTop: 1 }}>{[titre, sous].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {aRepondu && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '10px 12px', fontSize: 13, color: '#1e3a8a', lineHeight: 1.5 }}>
              <span aria-hidden="true">💬</span>
              <div>
                <b>{`${qui} a déjà répondu dans son espace`}</b>{`, ${quandCourt(visite.avis_client_le)} : ${ISSUES[visite.issue as Issue]?.crm || ''}`}
                {visite.prix_envisage ? `, autour de ${euros(visite.prix_envisage)}` : ''}{'.'}
                {visite.mot_client ? <div style={{ marginTop: 4 }}>{`« ${visite.mot_client} »`}</div> : null}
                <div style={{ marginTop: 4, color: '#3b5b9a' }}>{'Son avis est repris ci-dessous : tu complètes, ou tu corriges.'}</div>
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: GRIS, marginBottom: 8 }}>Et après cette visite ?</div>
            <div className="crv-tuiles">
              {(['offre', 'revoir', 'reflexion', 'non'] as Issue[]).map(i => {
                const x = ISSUES[i], on = issue === i;
                return (
                  <button key={i} type="button" className="crv-tuile" aria-pressed={on} onClick={() => choisir(i)}
                    style={{ position: 'relative', textAlign: 'left', border: `${on ? 2 : 1}px solid ${on ? x.couleur : BORD}`, background: on ? x.fond : 'white', borderRadius: 13, padding: on ? '10px 10px' : '11px 11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {on && <span aria-hidden="true" style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: '50%', background: x.couleur, color: 'white', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
                    <span style={{ fontSize: 18 }} aria-hidden="true">{x.e}</span>
                    <span style={{ display: 'block', fontWeight: 800, fontSize: 13.5, color: NAVY, marginTop: 3 }}>{i === 'non' ? 'Non aboutie' : i === 'offre' ? 'Il fait une offre' : i === 'revoir' ? 'Il veut le revoir' : 'Il réfléchit'}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: GRIS, marginTop: 1 }}>{SOUS_ISSUE[i]}</span>
                  </button>
                );
              })}
            </div>
            {issue === 'offre' && visite?.prix_envisage ? (
              <div style={{ marginTop: 9, fontSize: 13, color: '#8a6a1f', background: '#fdfaf1', border: '1px solid #ecdcb4', borderRadius: 10, padding: '8px 11px' }}>{`Son prix en tête : ${euros(visite.prix_envisage)}. L’offre elle-même se saisit dans l’onglet Transaction.`}</div>
            ) : null}
          </div>

          {issue && lesRaisons.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: GRIS, marginBottom: 8 }}>{QUESTION[issue]}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {lesRaisons.map(r => <Pastille key={r.n} on={motifs.includes(r.n)} ton={ISSUES[issue].couleur} onClick={() => bascule(motifs, setMotifs, r.n)}>{r.n}</Pastille>)}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: GRIS, marginBottom: 8 }}>{issue === 'non' ? 'Ce qui lui a plu quand même' : 'Ce qui lui a plu'}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {AIME.map(a => <Pastille key={a} on={aime.includes(a)} ton="#15803d" onClick={() => bascule(aime, setAime, a)}>{a}</Pastille>)}
            </div>
          </div>

          <div className="crv-bas">
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: GRIS, marginBottom: 6 }}>Ta note</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" aria-label={`${n} sur 5`} onClick={() => setEtoiles(etoiles === n ? 0 : n)}
                    style={{ background: 'none', border: 'none', padding: 2, fontSize: 24, lineHeight: 1, cursor: 'pointer', color: etoiles >= n ? OR : '#dbe2ea' }}>★</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: GRIS, marginBottom: 6 }}>{`Ton compte rendu, lu par ${prenom || 'le client'} dans son espace`}</div>
              <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} rows={4}
                placeholder="Ce que tu retiens de la visite, écrit pour lui : ce qui a plu, ce qui pose question, ce qui reste à vérifier…"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #dfe5ee', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.5, color: NAVY, fontFamily: 'inherit', resize: 'vertical' }} />
            </div>
          </div>

          {pourRecherche.length > 0 && (
            <button type="button" onClick={() => setRetenir(!retenir)} aria-pressed={retenir}
              style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #dfe5ee', borderRadius: 12, padding: '10px 12px', background: 'white', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 13, color: NAVY }}>Retenir pour la recherche</span>
                <span style={{ display: 'block', fontSize: 12, color: GRIS, marginTop: 2 }}>
                  {retenir
                    ? `${pourRecherche.slice(0, 3).map(m => `« ${m} »`).join(', ')}${pourRecherche.length > 3 ? '…' : ''} rejoin${pourRecherche.length > 1 ? 'nent' : 't'} « Ce que ses visites ont appris »`
                    : 'Cette visite ne comptera pas dans « Ce que ses visites ont appris »'}
                </span>
              </span>
              <span aria-hidden="true" style={{ width: 40, height: 23, borderRadius: 99, background: retenir ? '#10b981' : '#cbd5e1', position: 'relative', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 3, left: retenir ? 20 : 3, width: 17, height: 17, borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left .15s' }} />
              </span>
            </button>
          )}
        </div>

        <div style={{ padding: '12px 22px 16px', borderTop: '1px solid #f1f5f9', background: '#fbfcfe', display: 'flex', alignItems: 'center', gap: 10, borderRadius: '0 0 18px 18px' }}>
          <button type="button" onClick={onFermer} disabled={enCours}
            style={{ height: 40, padding: '0 16px', borderRadius: 11, border: `1px solid ${BORD}`, background: 'white', color: NAVY, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
          <span style={{ flexGrow: 1 }} />
          <span className="crv-indice" style={{ fontSize: 12, color: CLAIR, textAlign: 'right' }}>
            {issue ? `${qui} le voit dans son espace : « ${ISSUES[issue].client} »` : 'Sans issue, il pourra encore donner son avis dans son espace'}
          </span>
          <button type="button" onClick={valider} disabled={enCours}
            style={{ height: 40, padding: '0 18px', borderRadius: 11, border: 'none', background: NAVY, color: 'white', fontWeight: 800, fontSize: 13.5, cursor: enCours ? 'wait' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {enCours ? 'Enregistrement…' : '✓ Enregistrer'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
