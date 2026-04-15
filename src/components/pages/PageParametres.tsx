'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Page.module.css';

export default function PageParametres() {
  const [params, setParams] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from('parametres').select('cle, valeur').then(({ data }) => {
      const p: Record<string, string> = {};
      (data || []).forEach((r: any) => { p[r.cle] = r.valeur || ''; });
      setParams(p);
    });
  }, []);

  const set = (k: string, v: string) => setParams(prev => ({ ...prev, [k]: v }));

  async function save() {
    setSaving(true);
    for (const [cle, valeur] of Object.entries(params)) {
      await supabase.from('parametres').upsert({ cle, valeur, updated_at: new Date().toISOString() }, { onConflict: 'cle' });
    }
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Paramètres</h1>
          <p className={styles.sub}>Configuration de votre outil</p>
        </div>
        <button className={`${styles.btn} ${styles.btnDark}`} onClick={save} disabled={saving}>
          {saving ? 'Sauvegarde...' : saved ? '✅ Sauvegardé !' : '💾 Sauvegarder'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 900 }}>
        {/* AGENCE */}
        <div className={styles.paramCard}>
          <div className={styles.paramTitle}>🏢 Informations agence</div>
          <div className={styles.paramGrid}>
            <div><label className={styles.label}>Nom agence</label><input className={styles.input} value={params.agence_nom || ''} onChange={e => set('agence_nom', e.target.value)} /></div>
            <div><label className={styles.label}>Conseiller prénom</label><input className={styles.input} value={params.conseiller_prenom || ''} onChange={e => set('conseiller_prenom', e.target.value)} /></div>
            <div><label className={styles.label}>Conseiller nom</label><input className={styles.input} value={params.conseiller_nom || ''} onChange={e => set('conseiller_nom', e.target.value)} /></div>
            <div><label className={styles.label}>Téléphone</label><input className={styles.input} value={params.conseiller_telephone || ''} onChange={e => set('conseiller_telephone', e.target.value)} /></div>
          </div>
          <div style={{ marginTop: 14 }}><label className={styles.label}>Email</label><input className={styles.input} value={params.conseiller_email || ''} onChange={e => set('conseiller_email', e.target.value)} /></div>
        </div>

        {/* RELANCES & SMS */}
        <div className={styles.paramCard}>
          <div className={styles.paramTitle}>🔔 Relances & SMS</div>
          <div style={{ marginBottom: 14 }}>
            <label className={styles.label}>Délai relance par défaut (jours)</label>
            <select className={styles.input} value={params.delai_relance_jours || '5'} onChange={e => set('delai_relance_jours', e.target.value)}>
              <option value="3">J+3</option>
              <option value="5">J+5 (défaut)</option>
              <option value="7">J+7</option>
              <option value="10">J+10</option>
            </select>
          </div>
          <div>
            <label className={styles.label}>Template SMS <span style={{ color: '#94a3b8', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>160 car. max</span></label>
            <textarea className={styles.textarea} rows={3} value={params.template_sms || ''} onChange={e => set('template_sms', e.target.value)} />
          </div>
        </div>

        {/* EMAIL TEMPLATE */}
        <div className={styles.paramCard} style={{ gridColumn: '1 / -1' }}>
          <div className={styles.paramTitle}>✉️ Template email</div>
          <div style={{ marginBottom: 14 }}>
            <label className={styles.label}>Objet par défaut</label>
            <input className={styles.input} value={params.template_email_objet || ''} onChange={e => set('template_email_objet', e.target.value)} />
          </div>
          <div>
            <label className={styles.label}>Corps par défaut</label>
            <textarea className={styles.textarea} rows={6} value={params.template_email_corps || ''} onChange={e => set('template_email_corps', e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}
