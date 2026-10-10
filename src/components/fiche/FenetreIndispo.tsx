'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MOTIFS_INDISPO, marquerIndispo, type MotifIndispo } from '@/lib/biens-indispo';
import f from './FenetreIndispo.module.css';

/* ═══ « Ce bien n'est plus disponible » (V3.164) ═══════════════════════════
   La fenêtre, la même partout : l'onglet Présentés, « Planifier une visite »
   (la fiche et la page Visites). Le motif, puis un mot pour l'acheteur — il
   le lit dans son espace, sur le bien. Au niveau du module (AGENTS.md §2.4) ;
   posée sur <body>, elle s'anime toute seule (§2.8). */
export default function FenetreIndispo({ bien, clientId, rechercheId, prenom, onFermer, onFait }: {
  bien: { id: string; titre?: string | null; ville?: string | null; badge_retour?: string | null };
  clientId: string; rechercheId?: string | null; prenom?: string | null;
  onFermer: () => void; onFait: () => void;
}) {
  const [motif, setMotif] = useState<MotifIndispo>('vendu');
  const [note, setNote] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const qui = (prenom || '').trim() || 'l’acheteur';
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !envoi) onFermer(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [envoi, onFermer]);
  async function valider() {
    if (envoi) return;
    setEnvoi(true);
    const ok = await marquerIndispo({ bien, clientId, rechercheId, motif, note });
    setEnvoi(false);
    if (ok) onFait();
  }
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className={f.voile} onClick={e => { if (e.target === e.currentTarget && !envoi) onFermer(); }}>
      <div className={f.fenetre} role="dialog" aria-modal="true" aria-label="Ce bien n’est plus disponible">
        <div className={f.tete}>
          <span className={f.ic} aria-hidden="true">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <h2>Ce bien n’est plus disponible</h2>
            <p>{bien.titre || bien.ville || 'Bien présenté'}</p>
          </div>
          <button type="button" className={f.fermer} onClick={onFermer} aria-label="Fermer" disabled={envoi}>×</button>
        </div>
        <div className={f.corps}>
          <div className={f.lib}>Pourquoi ?</div>
          <div className={f.motifs} role="radiogroup" aria-label="Pourquoi il n’est plus disponible">
            {MOTIFS_INDISPO.map(m => (
              <button key={m.k} type="button" role="radio" aria-checked={motif === m.k} className={`${f.motif} ${motif === m.k ? f.motifOn : ''}`}
                onClick={() => setMotif(m.k)}>{m.l}</button>
            ))}
          </div>
          <label className={f.lib} htmlFor="indispo-note">{`Un mot pour ${qui}`}<small>{' · il le lira dans son espace, sur le bien'}</small></label>
          <textarea id="indispo-note" className={f.note} rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={600}
            placeholder="Ex : il a été vendu la semaine dernière. Je continue de chercher dans le même secteur." />
          <div className={f.aide}>
            {`Il passe dans « Plus disponible », chez toi et dans l’espace de ${qui}. S’il revient à la vente, « Remettre disponible » le replace dans ses biens présentés.`}
          </div>
        </div>
        <div className={f.pied}>
          <button type="button" className={f.btn} onClick={onFermer} disabled={envoi}>Annuler</button>
          <button type="button" className={`${f.btn} ${f.btnFort}`} onClick={() => { void valider(); }} disabled={envoi}>
            {envoi ? 'Enregistrement…' : 'Marquer plus disponible'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
