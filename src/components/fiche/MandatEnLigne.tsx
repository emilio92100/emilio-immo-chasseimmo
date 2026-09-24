'use client';

/* ══ Le mandat en ligne, dans la fenêtre « Mandat de recherche » du CRM ═══════

   Trois choses, de haut en bas :

   1. L'ÉTAT de la signature en ligne de cette recherche : signé (avec le PDF),
      en cours (le client a demandé son code), ou rétracté.
   2. « FAIRE SIGNER LE MANDAT » : Alexandre choisit le type, le taux de ses
      honoraires (2,5 % par défaut, moins s'il consent une remise — jamais
      plus, c'est son barème), colle le numéro réservé dans ImmoFacile (ou
      prend le suivant de sa réserve), et propose. Son clic vaut signature de
      l'offre pour l'agence (la date est gardée). Le client voit aussitôt
      « Votre mandat est prêt » dans son espace ; « Envoyer par e-mail » lui
      envoie le lien direct (…?mandat=1). « Aperçu » montre le PDF exact,
      filigrané « PROJET · NON SIGNÉ ».
   3. LA RÉSERVE DE NUMÉROS, pour les clients qui signent seuls au clic « Je
      souhaite le visiter » : quelques numéros réservés d'avance dans
      ImmoFacile, plus l'approbation du mandat type (la signature de l'agence
      pour ces mandats-là). Et la signature manuscrite posée sur les PDF.

   ⚠️ Un seul registre des mandats pour toute l'agence, celui d'ImmoFacile :
   pas de numérotation « maison » (Cass. 1re civ., 10 décembre 2014).
   ════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from 'react';
import { supabase, addJournal } from '@/lib/supabase';
import { lienEspace } from '@/lib/jeton';
import {
  HONORAIRES_TAUX, tauxDe, tauxTexte, prixMaximum, honorairesPour, euros, rechercheDepuis, redigerMandat, resumeMandat,
} from '@/lib/mandat';

const CLE_RESERVE = 'mandat_numeros_reserve';
const CLE_APPROBATION = 'mandat_modele_approuve_le';
const SIGNATURE = 'agence/signature.png';

type Sig = {
  id: string; numero: string; statut: string; signe_le: string | null; retracte_le: string | null;
  pdf_chemin: string | null; execution_immediate: boolean | null; code_envoye_le: string | null;
  mandant: { prenom?: string; nom?: string; email?: string } | null;
};

const quand = (iso: string) => new Date(iso).toLocaleString('fr-FR', {
  timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).replace(' ', ' à ');
const numeros = (v: string) => v.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
/* « 2,5 » → 2.5 ; NaN si ce n'est pas un nombre. */
const lireTaux = (v: string) => { const n = parseFloat(String(v).replace(',', '.').replace('%', '').trim()); return Number.isFinite(n) ? n : NaN; };
const ecrireTaux = (n: number) => String(n).replace('.', ',');

const boite = (fond: string, trait: string, encre: string): React.CSSProperties => ({
  background: fond, border: `1px solid ${trait}`, color: encre, borderRadius: 12, padding: '12px 14px', fontSize: 13, lineHeight: 1.55,
});
const titreBloc: React.CSSProperties = { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 800, color: '#94a3b8', margin: '4px 0 8px' };
const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: '1px solid #e2e8f0',
  background: '#fff', color: '#1a2332', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
};
const btnOr: React.CSSProperties = { ...btn, background: '#c9a84c', borderColor: '#c9a84c', color: '#1a2332' };
const champ: React.CSSProperties = {
  width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', color: '#1a2332',
};

export default function MandatEnLigne({ recherche, client, onMaj }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recherche: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMaj: (r: any) => void;
}) {
  const [sig, setSig] = useState<Sig | null>(null);
  const [numero, setNumero] = useState<string>(recherche?.mandat_numero || '');
  const [reserve, setReserve] = useState('');
  const [approuveLe, setApprouveLe] = useState<string | null>(null);
  const [approuve, setApprouve] = useState(false);
  const [aSignature, setASignature] = useState<boolean | null>(null);
  const [travail, setTravail] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [copie, setCopie] = useState(false);
  const [voirReserve, setVoirReserve] = useState(false);
  const [taux, setTaux] = useState<string>(ecrireTaux(tauxDe(recherche?.mandat_taux)));

  const charger = useCallback(async () => {
    if (!recherche?.id) return;
    const [s, p, f] = await Promise.all([
      supabase.from('mandats_signatures')
        .select('id, numero, statut, signe_le, retracte_le, pdf_chemin, execution_immediate, code_envoye_le, mandant')
        .eq('recherche_id', recherche.id).order('created_at', { ascending: false }).limit(1),
      supabase.from('parametres').select('cle, valeur').in('cle', [CLE_RESERVE, CLE_APPROBATION]),
      supabase.storage.from('mandats').list('agence'),
    ]);
    setSig(!s.error && s.data?.length ? (s.data[0] as Sig) : null);
    if (!p.error && p.data) {
      setReserve(numeros(p.data.find(x => x.cle === CLE_RESERVE)?.valeur || '').join(', '));
      const a = p.data.find(x => x.cle === CLE_APPROBATION)?.valeur || null;
      setApprouveLe(a || null); setApprouve(!!a);
    }
    setASignature(f.error ? null : !!f.data?.some(x => x.name === 'signature.png'));
  }, [recherche?.id]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { setNumero(recherche?.mandat_numero || ''); }, [recherche?.mandat_numero]);
  useEffect(() => { setTaux(ecrireTaux(tauxDe(recherche?.mandat_taux))); }, [recherche?.mandat_taux]);

  /* Le lien direct : il ouvre l'espace sur CETTE recherche (r=), et le
     mandat par-dessus. */
  const lien = client?.token_espace ? `${lienEspace(client.token_espace)}?r=${encodeURIComponent(recherche.id)}&mandat=1` : '';
  const tauxN = lireTaux(taux);
  const tauxOk = tauxN > 0 && tauxN <= HONORAIRES_TAUX;
  const tauxEnregistre = tauxDe(recherche?.mandat_taux);
  const budget = typeof recherche?.budget_max === 'number' ? recherche.budget_max : null;
  const pmax = tauxOk ? prixMaximum(budget, tauxN) : null;
  const premierDeLaReserve = numeros(reserve)[0] || '';
  const valide = !!recherche?.mandat_date_signature
    && (!recherche?.mandat_date_expiration || String(recherche.mandat_date_expiration).slice(0, 10) >= new Date().toISOString().slice(0, 10));
  const signeEnLigne = sig?.statut === 'signe';

  /* ── Proposer le mandat au client ── */
  async function proposer() {
    const n = numero.trim();
    if (!n) { setMsg({ t: 'Colle d’abord le numéro réservé dans ImmoFacile, ou prends le suivant de ta réserve.', ok: false }); return; }
    if (!tauxOk) { setMsg({ t: `Le taux doit être compris entre 0 et ${ecrireTaux(HONORAIRES_TAUX)} % : ton barème affiché est un maximum.`, ok: false }); return; }
    /* La colonne du taux vient d'un SQL à lancer une fois. Sans elle, on ne
       peut proposer que le taux du barème. */
    const colonne = recherche && Object.prototype.hasOwnProperty.call(recherche, 'mandat_taux');
    if (!colonne && tauxN !== HONORAIRES_TAUX) {
      setMsg({ t: 'Pour proposer un autre taux, lance d’abord la ligne SQL « mandat_taux » dans Supabase.', ok: false }); return;
    }
    setTravail('proposer'); setMsg(null);
    const le = new Date().toISOString();
    const { data, error } = await supabase.from('recherches')
      .update({ mandat_numero: n, mandat_type: 'simple', mandat_propose_le: le, updated_at: le, ...(colonne ? { mandat_taux: tauxN } : {}) })
      .eq('id', recherche.id).select().single();
    if (error) { setTravail(''); setMsg({ t: 'Le mandat n’a pas pu être proposé : ' + error.message, ok: false }); return; }
    /* Un numéro pris dans la réserve en sort : il ne servira jamais deux fois. */
    const liste = numeros(reserve);
    let avertir = '';
    if (liste.includes(n)) {
      const reste = liste.filter(x => x !== n);
      const { error: eR } = await supabase.from('parametres')
        .upsert([{ cle: CLE_RESERVE, valeur: reste.join(', '), updated_at: le }], { onConflict: 'cle' });
      if (eR) avertir = ` ⚠️ Le n° ${n} n’a pas pu être retiré de ta réserve (${eR.message}) : retire-le à la main.`;
      else setReserve(reste.join(', '));
    }
    setTravail('');
    onMaj(data);
    await addJournal(client.id, 'mandat', `📋 Mandat proposé à la signature (n° ${n})`, `Mandat de recherche simple · honoraires ${tauxTexte(tauxN)} · le client le voit dans son espace`);
    setMsg({ t: `C’est prêt : ${client.prenom || 'le client'} voit « Votre mandat est prêt » dans son espace, à ${tauxTexte(tauxN)}. Envoie-lui le mail pour qu’il le sache.${avertir}`, ok: !avertir });
  }

  /* Le mail « Votre mandat de recherche est prêt », avec le lien direct. */
  async function envoyerMail() {
    const emails: string[] = Array.isArray(client?.emails) ? client.emails.filter((e: string) => e && e.includes('@')) : [];
    if (!emails.length) { setMsg({ t: 'Ce client n’a pas d’adresse e-mail dans sa fiche.', ok: false }); return; }
    if (!confirm(`Envoyer le mandat à signer à ${emails.join(', ')} ?\n\nHonoraires : ${tauxTexte(tauxEnregistre)}`)) return;
    setTravail('mail'); setMsg(null);
    try {
      const r = await fetch('/api/send-mail', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'mandat', client_ids: [client.id], recherche_id: recherche.id, objet: 'Votre mandat de recherche est prêt', corps: '' }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error || j?.results?.[0]?.error || `erreur ${r.status}`);
      setMsg({ t: `Mail envoyé à ${emails.join(', ')}.`, ok: true });
    } catch (e) {
      setMsg({ t: 'Le mail n’est pas parti : ' + (e as Error).message, ok: false });
    }
    setTravail('');
  }

  /* L'aperçu : le PDF exact que le client signera, au taux saisi, avec le
     filigrane « PROJET · NON SIGNÉ ». Fabriqué ici, dans le navigateur. */
  async function apercu() {
    if (!tauxOk) { setMsg({ t: 'Corrige d’abord le taux.', ok: false }); return; }
    const w = window.open('', '_blank');
    setTravail('apercu');
    try {
      const { pdfMandat } = await import('@/lib/mandat-pdf');
      const r = rechercheDepuis({ ...recherche, mandat_taux: tauxN });
      const nom = `${client?.prenom || ''} ${client?.nom || ''}`.trim();
      const parties = redigerMandat({ numero: numero.trim() || '…', mandant: null, recherche: r, executionImmediate: null });
      const octets = await pdfMandat(parties, { numero: numero.trim() || '…', mandantNom: nom, resume: resumeMandat(r), sig: null, projet: true });
      const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: 'application/pdf' }));
      if (w) w.location.href = url; else window.location.href = url;
    } catch (e) {
      w?.close();
      setMsg({ t: 'L’aperçu n’a pas pu être fabriqué : ' + (e as Error).message, ok: false });
    }
    setTravail('');
  }

  async function retirer() {
    if (!confirm('Retirer la proposition de mandat ?\n\nLe numéro est libéré sur cette fiche : pense à le marquer « clos sans suite » dans ImmoFacile.')) return;
    setTravail('retirer');
    const { data, error } = await supabase.from('recherches')
      .update({ mandat_numero: null, mandat_propose_le: null, updated_at: new Date().toISOString() })
      .eq('id', recherche.id).select().single();
    setTravail('');
    if (error) { setMsg({ t: 'Impossible de retirer la proposition : ' + error.message, ok: false }); return; }
    onMaj(data); setNumero('');
    await addJournal(client.id, 'mandat', '📋 Proposition de mandat retirée');
    setMsg({ t: 'Proposition retirée.', ok: true });
  }

  async function copier() {
    try { await navigator.clipboard.writeText(lien); setCopie(true); setTimeout(() => setCopie(false), 1800); }
    catch { window.prompt('Copie ce lien :', lien); }
  }

  async function voirPdf() {
    if (!sig?.pdf_chemin) return;
    const w = window.open('', '_blank');
    const { data, error } = await supabase.storage.from('mandats').createSignedUrl(sig.pdf_chemin, 300);
    if (error || !data?.signedUrl) { w?.close(); setMsg({ t: 'Le PDF n’a pas pu être ouvert : ' + (error?.message || 'lien indisponible'), ok: false }); return; }
    if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  }

  /* ── La réserve de numéros et l'approbation du mandat type ── */
  async function enregistrerReserve() {
    setTravail('reserve'); setMsg(null);
    const liste = numeros(reserve);
    const maintenant = new Date().toISOString();
    const nouvelleApprobation = approuve ? (approuveLe || maintenant) : '';
    const { error } = await supabase.from('parametres').upsert([
      { cle: CLE_RESERVE, valeur: liste.join(', '), updated_at: maintenant },
      { cle: CLE_APPROBATION, valeur: nouvelleApprobation, updated_at: maintenant },
    ], { onConflict: 'cle' });
    setTravail('');
    if (error) { setMsg({ t: 'La réserve n’a pas pu être enregistrée : ' + error.message, ok: false }); return; }
    setApprouveLe(nouvelleApprobation || null);
    setReserve(liste.join(', '));
    setMsg({ t: approuve
      ? `Réserve enregistrée : ${liste.length} numéro${liste.length > 1 ? 's' : ''} d’avance.`
      : 'Réserve enregistrée, mais sans ton approbation du mandat type : les clients ne pourront pas signer seuls.', ok: approuve });
  }

  async function deposerSignature(f: File | undefined) {
    if (!f) return;
    if (f.type !== 'image/png') { setMsg({ t: 'La signature doit être une image PNG (fond transparent).', ok: false }); return; }
    setTravail('signature');
    const { error } = await supabase.storage.from('mandats').upload(SIGNATURE, f, { upsert: true, contentType: 'image/png' });
    setTravail('');
    if (error) { setMsg({ t: 'La signature n’a pas pu être déposée : ' + error.message, ok: false }); return; }
    setASignature(true);
    setMsg({ t: 'Signature déposée : elle apparaîtra sur les prochains mandats signés.', ok: true });
  }

  const reste = numeros(reserve).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 1 — L'état de la signature en ligne */}
      {signeEnLigne && sig && (
        <div style={boite('#f0fdf4', '#bbf7d0', '#166534')}>
          <b>{`✍️ Signé en ligne par ${sig.mandant?.prenom || ''} ${sig.mandant?.nom || ''}`.trim()}</b>
          <div>{`N° ${sig.numero} · le ${sig.signe_le ? quand(sig.signe_le) : '—'}`}</div>
          <div style={{ color: '#15803d' }}>{sig.execution_immediate ? 'Il a demandé que la recherche commence tout de suite.' : 'Il préfère attendre la fin de ses 14 jours de rétractation.'}</div>
          <button type="button" style={{ ...btn, marginTop: 10 }} onClick={voirPdf}>📄 Voir le mandat signé</button>
        </div>
      )}
      {sig?.statut === 'retracte' && (
        <div style={boite('#fef2f2', '#fecaca', '#991b1b')}>
          <b>{`↩️ Mandat n° ${sig.numero} rétracté`}</b>
          <div>{`Le client a renoncé en ligne le ${sig.retracte_le ? quand(sig.retracte_le) : '—'}. Note-le dans le registre ImmoFacile.`}</div>
          {sig.pdf_chemin && <button type="button" style={{ ...btn, marginTop: 10 }} onClick={voirPdf}>📄 Voir le mandat signé</button>}
        </div>
      )}
      {sig?.statut === 'en_cours' && !valide && (
        <div style={boite('#fffbeb', '#fde68a', '#92400e')}>
          <b>{`⏳ Signature en cours · n° ${sig.numero}`}</b>
          <div>{sig.code_envoye_le ? `Code envoyé le ${quand(sig.code_envoye_le)} à ${sig.mandant?.email || 'son adresse'}. Il n’a pas encore signé.` : 'Il a commencé mais n’a pas encore signé.'}</div>
        </div>
      )}

      {/* 2 — Faire signer le mandat */}
      {!valide && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
          <div style={titreBloc}>Faire signer le mandat</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <span style={{ ...btn, borderColor: '#c9a84c', background: '#fdfaf1', cursor: 'default' }}>✓ Simple</span>
            <span style={{ ...btn, color: '#94a3b8', cursor: 'not-allowed' }} title="Bientôt : il faut d’abord reprendre ton modèle exclusif">Exclusif · bientôt</span>
          </div>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Honoraires (TTC, à la charge de l’acquéreur)</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 5, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: 96 }}>
              <input style={{ ...champ, boxSizing: 'border-box', paddingRight: 26, border: `1px solid ${tauxOk ? '#e2e8f0' : '#fca5a5'}` }} value={taux} inputMode="decimal"
                onChange={e => setTaux(e.target.value)} aria-label="Taux des honoraires" />
              <span style={{ position: 'absolute', right: 10, top: 9, color: '#94a3b8', fontWeight: 700 }}>%</span>
            </div>
            {[2.5, 2, 1.5].map(t => (
              <button key={t} type="button" onClick={() => setTaux(ecrireTaux(t))}
                style={{ ...btn, padding: '7px 11px', border: `1px solid ${tauxN === t ? '#c9a84c' : '#e2e8f0'}`, background: tauxN === t ? '#fdfaf1' : '#fff' }}>
                {`${ecrireTaux(t)} %${t === HONORAIRES_TAUX ? ' · barème' : ''}`}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: tauxOk ? '#475569' : '#b91c1c', marginTop: 6, lineHeight: 1.5 }}>
            {!tauxOk
              ? `Entre 0 et ${ecrireTaux(HONORAIRES_TAUX)} % : ton barème affiché est un maximum.`
              : pmax && budget
                ? `Budget ${euros(budget)} → prix maximum ${euros(pmax)} hors honoraires, soit ${euros(honorairesPour(pmax, tauxN) || 0)} d’honoraires.${tauxN < HONORAIRES_TAUX ? ' Le mandat mentionnera la remise sur ton barème.' : ''}`
                : `${tauxTexte(tauxN)} du prix d’achat.${tauxN < HONORAIRES_TAUX ? ' Le mandat mentionnera la remise sur ton barème.' : ''}`}
          </div>
          {recherche?.mandat_propose_le && tauxOk && tauxN !== tauxEnregistre && (
            <div style={{ ...boite('#fffbeb', '#fde68a', '#92400e'), marginTop: 8 }}>{`Le client voit encore ${tauxTexte(tauxEnregistre)} : clique « Mettre à jour », puis renvoie-lui le mail.`}</div>
          )}
          <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginTop: 12 }}>N° réservé dans le registre ImmoFacile</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
            <input style={{ ...champ, maxWidth: 160 }} value={numero} onChange={e => setNumero(e.target.value)} placeholder="ex. 997" inputMode="numeric" />
            <button type="button" style={btnOr} disabled={travail === 'proposer' || !tauxOk} onClick={proposer}>
              {travail === 'proposer' ? '…' : recherche?.mandat_propose_le ? 'Mettre à jour' : 'Proposer au client'}
            </button>
          </div>
          {premierDeLaReserve && premierDeLaReserve !== numero.trim() && !recherche?.mandat_propose_le && (
            <button type="button" onClick={() => setNumero(premierDeLaReserve)}
              style={{ background: 'none', border: 'none', padding: '6px 0 0', color: '#a07c28', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, fontFamily: 'inherit' }}>
              {`Prendre le n° ${premierDeLaReserve} de ma réserve`}
            </button>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" style={btn} disabled={travail === 'apercu' || !tauxOk} onClick={apercu}>
              {travail === 'apercu' ? 'Préparation…' : '👁 Aperçu du mandat (PDF)'}
            </button>
          </div>
          {recherche?.mandat_propose_le && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#475569', lineHeight: 1.55 }}>
              {`Proposé le ${quand(recherche.mandat_propose_le)} — ton clic vaut signature de l’offre pour l’agence.`}
              {lien && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <code style={{ fontSize: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 8px', wordBreak: 'break-all' }}>{lien}</code>
                  <button type="button" style={btn} onClick={copier}>{copie ? '✓ Copié' : '🔗 Copier le lien'}</button>
                  <button type="button" style={btnOr} disabled={travail === 'mail'} onClick={envoyerMail}>{travail === 'mail' ? 'Envoi…' : '✉️ Envoyer par e-mail'}</button>
                </div>
              )}
              <button type="button" style={{ ...btn, marginTop: 8, color: '#b91c1c', borderColor: '#fecaca' }} disabled={travail === 'retirer'} onClick={retirer}>Retirer la proposition</button>
            </div>
          )}
        </div>
      )}

      {/* 3 — La réserve de numéros, la signature manuscrite */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
        <button type="button" onClick={() => setVoirReserve(v => !v)}
          style={{ ...titreBloc, background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', width: '100%', justifyContent: 'space-between' }}>
          <span>Pour les clients qui signent seuls</span>
          <span style={{ color: reste > 2 && approuveLe ? '#15803d' : '#b45309' }}>
            {approuveLe ? `${reste} numéro${reste > 1 ? 's' : ''} d’avance` : 'non activé'} {voirReserve ? '▴' : '▾'}
          </span>
        </button>
        {voirReserve && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.55 }}>
              Réserve quelques numéros dans ImmoFacile et colle-les ici. Un client qui clique « Je souhaite le visiter » sans mandat préparé prend le premier libre, signe tout de suite, et tu reçois un mail pour reporter le nom dans le registre.
            </div>
            <input style={champ} value={reserve} onChange={e => setReserve(e.target.value)} placeholder="ex. 997, 998, 999" />
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#1a2332', lineHeight: 1.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={approuve} onChange={e => setApprouve(e.target.checked)} style={{ marginTop: 3 }} />
              <span>J’approuve le mandat de recherche simple type et je signe l’offre au nom d’Emilio Immobilier pour ces numéros.{approuveLe ? ` (approuvé le ${quand(approuveLe)})` : ''}</span>
            </label>
            <div><button type="button" style={btnOr} disabled={travail === 'reserve'} onClick={enregistrerReserve}>{travail === 'reserve' ? '…' : 'Enregistrer la réserve'}</button></div>
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10, fontSize: 13, color: '#475569', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span>{aSignature === null ? 'Ta signature manuscrite : état inconnu.' : aSignature ? '✓ Ta signature manuscrite est déposée (dossier privé).' : 'Ta signature manuscrite n’est pas encore déposée.'}</span>
              <label style={{ ...btn, cursor: 'pointer' }}>
                {travail === 'signature' ? '…' : aSignature ? 'Remplacer' : 'Déposer (PNG)'}
                <input type="file" accept="image/png" style={{ display: 'none' }} onChange={e => deposerSignature(e.target.files?.[0])} />
              </label>
            </div>
          </div>
        )}
      </div>

      {msg && <div style={boite(msg.ok ? '#f0fdf4' : '#fef2f2', msg.ok ? '#bbf7d0' : '#fecaca', msg.ok ? '#166534' : '#991b1b')}>{msg.t}</div>}
      {!valide && <div style={{ ...titreBloc, marginTop: 6 }}>Ou saisir un mandat signé ailleurs</div>}
    </div>
  );
}
