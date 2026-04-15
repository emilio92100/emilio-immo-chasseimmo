'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Page.module.css';

export default function PageParametres() {
  const [params, setParams] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState('agence');

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

  const sections = [
    { id: 'agence', label: '🏢 Agence', icon: '🏢' },
    { id: 'emails', label: '✉️ Templates email', icon: '✉️' },
    { id: 'sms', label: '📱 SMS & Relances', icon: '📱' },
    { id: 'securite', label: '🔒 Sécurité', icon: '🔒' },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Paramètres</h1>
          <p className={styles.sub}>Configuration de votre outil Emilio Immobilier</p>
        </div>
        <button
          className={`${styles.btn} ${styles.btnDark}`}
          onClick={save} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {saving ? '⏳ Sauvegarde...' : saved ? '✅ Sauvegardé !' : '💾 Sauvegarder tout'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20 }}>
        {/* NAV SECTIONS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sections.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 10, border: 'none', background: activeSection === s.id ? '#1a2332' : 'white', color: activeSection === s.id ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.12s', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: 2 }}>
              {s.icon} {s.label.split(' ').slice(1).join(' ')}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <div>
          {/* AGENCE */}
          {activeSection === 'agence' && (
            <div className={styles.card} style={{ padding: 24 }}>
              <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 16, color: '#1a2332', marginBottom: 20 }}>🏢 Informations agence</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div><label className={styles.label}>Nom de l'agence</label><input className={styles.input} value={params.agence_nom||''} onChange={e=>set('agence_nom',e.target.value)} /></div>
                <div><label className={styles.label}>Email professionnel</label><input className={styles.input} type="email" value={params.conseiller_email||''} onChange={e=>set('conseiller_email',e.target.value)} /></div>
                <div><label className={styles.label}>Prénom conseiller</label><input className={styles.input} value={params.conseiller_prenom||''} onChange={e=>set('conseiller_prenom',e.target.value)} /></div>
                <div><label className={styles.label}>Nom conseiller</label><input className={styles.input} value={params.conseiller_nom||''} onChange={e=>set('conseiller_nom',e.target.value)} /></div>
                <div><label className={styles.label}>Téléphone</label><input className={styles.input} value={params.conseiller_telephone||''} onChange={e=>set('conseiller_telephone',e.target.value)} /></div>
                <div><label className={styles.label}>Site web (optionnel)</label><input className={styles.input} value={params.site_web||''} onChange={e=>set('site_web',e.target.value)} placeholder="https://..." /></div>
              </div>
              <div style={{ marginTop: 16, padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e3e8f0' }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1a2332', marginBottom: 4 }}>📋 Signature automatique</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Ajoutée automatiquement à la fin de chaque email envoyé</div>
                <textarea className={styles.input} rows={4} value={params.signature_email||`Cordialement,\n${params.conseiller_prenom||'Alexandre'} ${params.conseiller_nom||'ROGELET'}\n${params.agence_nom||'Emilio Immobilier'}\n${params.conseiller_telephone||'06 58 95 76 32'}`}
                  onChange={e=>set('signature_email',e.target.value)} />
              </div>
            </div>
          )}

          {/* TEMPLATES EMAIL */}
          {activeSection === 'emails' && (
            <div className={styles.card} style={{ padding: 24 }}>
              <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 16, color: '#1a2332', marginBottom: 6 }}>✉️ Templates email</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>Variables disponibles : <code style={{background:'#f8fafc',padding:'1px 6px',borderRadius:4}}>{'{{prenom}}'}</code> <code style={{background:'#f8fafc',padding:'1px 6px',borderRadius:4}}>{'{{nom}}'}</code> <code style={{background:'#f8fafc',padding:'1px 6px',borderRadius:4}}>{'{{reference}}'}</code></div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2332', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>📄 Sélection de biens</div>
                  <div><label className={styles.label}>Objet</label><input className={styles.input} value={params.template_email_objet||''} onChange={e=>set('template_email_objet',e.target.value)} /></div>
                  <div style={{marginTop:10}}><label className={styles.label}>Corps</label><textarea className={styles.input} rows={6} value={params.template_email_corps||''} onChange={e=>set('template_email_corps',e.target.value)} /></div>
                </div>

                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2332', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>🔔 Email de relance J+5</div>
                  <div><label className={styles.label}>Objet relance</label><input className={styles.input} value={params.template_relance_objet||`Avez-vous eu le temps de consulter ma sélection ?`} onChange={e=>set('template_relance_objet',e.target.value)} /></div>
                  <div style={{marginTop:10}}><label className={styles.label}>Corps relance</label><textarea className={styles.input} rows={5} value={params.template_relance_corps||`Bonjour {{prenom}},\n\nJe me permets de revenir vers vous suite à ma sélection de biens.\nAvez-vous eu le temps de la consulter ?\n\nJe suis disponible pour en discuter ou organiser des visites.\n\nCordialement,\n{{conseiller}}`} onChange={e=>set('template_relance_corps',e.target.value)} /></div>
                </div>
              </div>
            </div>
          )}

          {/* SMS & RELANCES */}
          {activeSection === 'sms' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className={styles.card} style={{ padding: 24 }}>
                <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 16, color: '#1a2332', marginBottom: 16 }}>📱 SMS Mailjet</div>
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 16 }}>
                  💡 Pour activer l'envoi SMS, renseignez vos clés Mailjet dans les paramètres ci-dessous.
                  Coût : 0,04€ par SMS.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div><label className={styles.label}>Clé API Mailjet</label><input className={styles.input} type="password" value={params.mailjet_api_key||''} onChange={e=>set('mailjet_api_key',e.target.value)} placeholder="Votre clé API publique Mailjet" /></div>
                  <div><label className={styles.label}>Clé secrète Mailjet</label><input className={styles.input} type="password" value={params.mailjet_secret_key||''} onChange={e=>set('mailjet_secret_key',e.target.value)} placeholder="Votre clé secrète Mailjet" /></div>
                  <div><label className={styles.label}>Nom expéditeur SMS <span style={{fontWeight:400,color:'#94a3b8'}}>(11 car. max, sans espace)</span></label><input className={styles.input} value={params.sms_sender||'EmilioImmo'} onChange={e=>set('sms_sender',e.target.value)} maxLength={11} placeholder="EmilioImmo" /></div>
                  <div>
                    <label className={styles.label}>Template SMS sélection <span style={{fontWeight:400,color:'#94a3b8'}}>(160 car. max)</span></label>
                    <textarea className={styles.input} rows={3} value={params.template_sms||''} onChange={e=>set('template_sms',e.target.value)} />
                    <div style={{fontSize:11,color:'#94a3b8',marginTop:3}}>{(params.template_sms||'').length}/160 caractères</div>
                  </div>
                </div>
              </div>

              <div className={styles.card} style={{ padding: 24 }}>
                <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 16, color: '#1a2332', marginBottom: 16 }}>🔔 Relances automatiques</div>
                <div>
                  <label className={styles.label}>Délai relance après envoi PDF</label>
                  <select className={styles.input} value={params.delai_relance_jours||'5'} onChange={e=>set('delai_relance_jours',e.target.value)}>
                    <option value="3">J+3 (3 jours après envoi)</option>
                    <option value="5">J+5 (défaut recommandé)</option>
                    <option value="7">J+7</option>
                    <option value="10">J+10</option>
                    <option value="14">J+14</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* SÉCURITÉ */}
          {activeSection === 'securite' && (
            <div className={styles.card} style={{ padding: 24 }}>
              <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 16, color: '#1a2332', marginBottom: 16 }}>🔒 Sécurité & Accès</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div><label className={styles.label}>Identifiant de connexion</label><input className={styles.input} value={params.login||'alexandre.rogelet'} onChange={e=>set('login',e.target.value)} /></div>
                <div><label className={styles.label}>Nouveau mot de passe</label><input className={styles.input} type="password" placeholder="Laisser vide pour ne pas changer" onChange={e=>set('nouveau_mdp',e.target.value)} /></div>
              </div>
              <div style={{ marginTop: 20, padding: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#166534', marginBottom: 6 }}>✅ À propos de la sécurité</div>
                <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.6 }}>
                  • Vos données sont stockées sur Supabase (chiffrement AES-256)<br/>
                  • Connexion HTTPS uniquement<br/>
                  • Hébergé sur Vercel (infrastructure sécurisée)<br/>
                  • Aucune donnée partagée avec des tiers
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
