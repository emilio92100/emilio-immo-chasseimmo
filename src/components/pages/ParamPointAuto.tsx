'use client';
import { useEffect, useState, useCallback } from 'react';
import styles from './Page.module.css';

/* ═══ Paramètres · Point automatique ══════════════════════════════════════
   Le réglage général du mail « Où en est votre recherche ? » (la règle est
   dans src/lib/point-auto.ts). Chaque changement s'enregistre tout de suite,
   par /api/point-auto : pas besoin du bouton « Sauvegarder tout », et ce
   bouton-là ne touche pas à ces réglages (voir PageParametres). */

type Candidat = {
  clientId: string; prenom: string; nom: string; statut: string;
  echeance: string; du: boolean; empechement: string | null; exclu: boolean;
  dernierMouvement: string | null; rechercheNom: string | null;
};
type Etat = {
  reglages: { actif: boolean; delai: number; exclus: string[] };
  branche: { cron: boolean; mailjet: boolean };
  candidats: Candidat[];
};

const DELAIS = [30, 45, 60];
const jour = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

function Interrupteur({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} disabled={disabled}
      style={{ width: 44, height: 25, borderRadius: 99, border: 'none', cursor: disabled ? 'wait' : 'pointer', position: 'relative', background: on ? '#10b981' : '#cbd5e1', transition: 'background .15s', flexShrink: 0, padding: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 22 : 3, width: 19, height: 19, borderRadius: '50%', background: 'white', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
    </button>
  );
}

const RUBRIQUE: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 };
const LIGNE: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '16px 0', borderTop: '1px solid #f1f5f9' };

export default function ParamPointAuto() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [note, setNote] = useState('');
  const [exemple, setExemple] = useState<'' | 'envoi' | string>('');

  const appeler = useCallback(async (corps: Record<string, unknown>) => {
    const r = await fetch('/api/point-auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    return r.json();
  }, []);

  const charger = useCallback(async () => {
    try {
      const j = await appeler({ mode: 'etat' });
      if (!j.ok) { setErreur(j.error || 'Lecture impossible'); return; }
      setErreur(''); setEtat(j);
    } catch { setErreur('Lecture impossible'); }
  }, [appeler]);

  useEffect(() => { charger(); }, [charger]);

  async function regler(corps: { actif?: boolean; delai?: number }) {
    setEnCours(true);
    try {
      const j = await appeler({ mode: 'reglages', ...corps });
      if (!j.ok) { alert("Le réglage n'a pas pu être enregistré.\n\n" + (j.error || '')); return; }
      setNote('Enregistré'); setTimeout(() => setNote(''), 2000);
      await charger();
    } finally { setEnCours(false); }
  }

  async function envoyerExemple() {
    setExemple('envoi');
    const j = await appeler({ mode: 'exemple' }).catch(() => ({ ok: false }));
    setExemple(j.ok ? `Envoyé à ${j.a}, avec le dossier de ${j.client}.` : `Pas parti : ${j.error || 'erreur'}`);
  }

  if (erreur) return <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 24, color: '#b91c1c', fontSize: 13 }}>Le point automatique n&apos;a pas pu être lu : {erreur}</div>;
  if (!etat) return <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 24, color: '#94a3b8', fontSize: 13 }}>Chargement…</div>;

  const { reglages, branche, candidats } = etat;
  const dus = candidats.filter(c => c.du);
  const aVenir = candidats.filter(c => !c.du && !c.empechement).sort((a, b) => a.echeance.localeCompare(b.echeance));
  const bloques = candidats.filter(c => c.empechement);

  const bandeau = !branche.cron
    ? { t: 'L’envoi automatique n’est pas encore branché sur Vercel', s: 'Il manque la variable CRON_SECRET dans le projet Vercel. Tant qu’elle n’y est pas, aucun mail ne part, même activé.', bg: '#fffbeb', bd: '#fde68a', fg: '#92400e' }
    : !branche.mailjet
      ? { t: 'Mailjet n’est pas configuré', s: 'Les clés Mailjet manquent sur Vercel : aucun mail ne peut partir.', bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b' }
      : reglages.actif
        ? { t: 'Activé', s: 'L’envoi a lieu chaque matin, vers 10 h. Ceux qui sont dus reçoivent le mail à ce moment-là.', bg: '#ecfdf5', bd: '#bbf7d0', fg: '#166534' }
        : { t: 'Désactivé', s: 'Aucun mail ne part. Regarde la liste plus bas avant de l’activer : elle dit exactement qui le recevrait.', bg: '#f8fafc', bd: '#e3e8f0', fg: '#475569' };

  const nomDe = (c: Candidat) => `${c.prenom} ${c.nom}`.trim() || 'Sans nom';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 17, color: '#1a2332' }}>📨 Point automatique</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 1.5, maxWidth: 560 }}>{'Le mail « Où en est votre recherche ? », envoyé tout seul quand un dossier actif ne bouge plus. Le client répond en un clic depuis son espace, et sa réponse arrive dans tes Relances.'}</div>
          </div>
          {note && <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>✓ {note}</span>}
        </div>

        <div style={{ marginTop: 18, background: bandeau.bg, border: `1px solid ${bandeau.bd}`, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: bandeau.fg }}>{bandeau.t}</div>
          <div style={{ fontSize: 12.5, color: bandeau.fg, opacity: .85, marginTop: 3, lineHeight: 1.5 }}>{bandeau.s}</div>
        </div>

        <div style={{ ...LIGNE, marginTop: 18 }}>
          <Interrupteur on={reglages.actif} disabled={enCours} onClick={() => regler({ actif: !reglages.actif })} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1a2332' }}>{reglages.actif ? 'Envoi automatique activé' : 'Activer l’envoi automatique'}</span>
        </div>

        <div style={LIGNE}>
          <span style={{ fontSize: 14, color: '#1a2332', fontWeight: 600 }}>Envoyer après</span>
          <span style={{ display: 'inline-flex', gap: 6 }}>
            {DELAIS.map(d => (
              <button key={d} type="button" disabled={enCours} onClick={() => d !== reglages.delai && regler({ delai: d })}
                style={{ padding: '6px 14px', borderRadius: 99, border: `1px solid ${d === reglages.delai ? '#1a2332' : '#e2e8f0'}`, background: d === reglages.delai ? '#1a2332' : 'white', color: d === reglages.delai ? 'white' : '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                {d} jours
              </button>
            ))}
          </span>
          <span style={{ fontSize: 14, color: '#1a2332', fontWeight: 600 }}>sans mouvement</span>
        </div>

        <div style={LIGNE}>
          <span style={{ fontSize: 14, color: '#1a2332', fontWeight: 600 }}>Qui le reçoit</span>
          <span style={{ fontSize: 13, color: '#475569' }}>Les dossiers <b>Actifs</b>, qui ont une adresse mail et une recherche en cours. Jamais les autres.</span>
        </div>

        <div style={{ ...LIGNE, display: 'block' }}>
          <div style={RUBRIQUE}>Ce qui compte comme un mouvement</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '7px 16px', fontSize: 13, color: '#334155' }}>
            {[
              [true, 'Une note, un appel, un mail dans le suivi'],
              [true, 'Un changement de critères'],
              [true, 'Un bien envoyé'],
              [true, 'Une visite'],
              [true, 'Une réaction du client : avis sur un bien, message, demande de rappel'],
              [false, 'Le client qui ouvre simplement son espace'],
            ].map(([ok, t]) => (
              <span key={String(t)} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <b style={{ color: ok ? '#10b981' : '#ef4444', width: 12, flexShrink: 0 }}>{ok ? '✓' : '✗'}</b><span>{t as string}</span>
              </span>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 12, lineHeight: 1.55 }}>{`Un seul mail par période : sans réponse, le suivant part ${reglages.delai} jours plus tard. Au moindre mouvement, le compteur repart de zéro.`}</div>
        </div>

        <div style={{ ...LIGNE, paddingBottom: 0 }}>
          <button type="button" onClick={envoyerExemple} disabled={exemple === 'envoi'}
            className={`${styles.btn} ${styles.btnDark}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {exemple === 'envoi' ? '⏳ Envoi…' : '✉️ M’envoyer un exemple'}
          </button>
          <span style={{ fontSize: 12.5, color: '#64748b' }}>{exemple && exemple !== 'envoi' ? exemple : 'Le mail tel qu’un client le recevrait, envoyé à ton adresse.'}</span>
        </div>
      </div>

      <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 24 }}>
        <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 15, color: '#1a2332' }}>Qui le recevrait</div>
        <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>{`Calculé maintenant, avec le délai de ${reglages.delai} jours.`}</div>

        <div style={{ marginTop: 16 }}>
          <div style={RUBRIQUE}>{`Au prochain envoi · ${dus.length}`}</div>
          {dus.length === 0
            ? <div style={{ fontSize: 13, color: '#94a3b8' }}>Personne : tous les dossiers actifs ont bougé récemment.</div>
            : dus.map(c => (
              <div key={c.clientId} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '9px 12px', borderRadius: 10, background: '#fdf8ea', border: '1px solid #efe1b6', marginBottom: 6, fontSize: 13.5 }}>
                <b style={{ color: '#1a2332' }}>{nomDe(c)}</b>
                <span style={{ color: '#8a6d1f', fontSize: 12.5 }}>{c.dernierMouvement ? `rien depuis le ${jour(c.dernierMouvement)}` : 'rien depuis la création'}</span>
              </div>
            ))}
        </div>

        {aVenir.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={RUBRIQUE}>{`Plus tard, si rien ne bouge · ${aVenir.length}`}</div>
            {aVenir.map(c => (
              <div key={c.clientId} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '8px 2px', borderBottom: '1px solid #f1f5f9', fontSize: 13.5 }}>
                <span style={{ color: '#1a2332', fontWeight: 600 }}>{nomDe(c)}</span>
                <span style={{ color: '#64748b', fontSize: 12.5 }}>le {jour(c.echeance)}</span>
              </div>
            ))}
          </div>
        )}

        {bloques.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={RUBRIQUE}>{`Ne le recevront pas · ${bloques.length}`}</div>
            {bloques.map(c => (
              <div key={c.clientId} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '8px 2px', borderBottom: '1px solid #f1f5f9', fontSize: 13.5 }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>{nomDe(c)}</span>
                <span style={{ color: '#94a3b8', fontSize: 12.5 }}>{c.empechement}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
