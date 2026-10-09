'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Page.module.css';
import Cascade from '@/components/shared/Cascade';
import ParamPointAuto from './ParamPointAuto';
import ParamAlertes from './ParamAlertes';
import ParamAgence from './ParamAgence';
import { signatureDe, texteModele, VARIABLES_MAIL } from '@/lib/mail-variables';

const CODE: React.CSSProperties = { background: '#f8fafc', padding: '1px 6px', borderRadius: 4 };

/* Les rubriques qui s'enregistrent seules, avec leur propre bouton ou à
   chaque clic, ou qui n'ont rien à enregistrer (Sécurité) : le
   « Sauvegarder tout » n'y est pas affiché. */
const AUTONOMES = ['agence', 'point', 'alertes', 'securite'];

export default function PageParametres() {
  const [params, setParams] = useState<Record<string, string>>({});
  /* Seules les clés modifiées sur cette page repartent : réécrire toutes les
     valeurs lues à l'ouverture écrasait ce qui avait changé entre-temps
     (l'identité de l'agence, la réserve de numéros de mandat…). */
  const [modifiees, setModifiees] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState('agence');

  useEffect(() => {
    supabase.from('parametres').select('cle, valeur').then(({ data }) => {
      const p: Record<string, string> = {};
      (data || []).forEach((r: any) => { p[r.cle] = r.valeur || ''; });
      /* V3.151 : un modèle aux « \n » écrits en toutes lettres s'affiche avec
         ses vrais retours à la ligne ; l'enregistrer le corrige en base. */
      for (const k of ['template_email_corps', 'template_email_objet', 'signature_email']) if (p[k]) p[k] = texteModele(p[k]);
      setParams(p);
    });
  }, []);

  const set = (k: string, v: string) => {
    setParams(prev => ({ ...prev, [k]: v }));
    setModifiees(prev => new Set(prev).add(k));
  };

  async function save() {
    const cles = Array.from(modifiees);
    if (!cles.length) { setSaved(true); setTimeout(() => setSaved(false), 2500); return; }
    setSaving(true);
    const le = new Date().toISOString();
    const { error } = await supabase.from('parametres')
      .upsert(cles.map(cle => ({ cle, valeur: params[cle] ?? '', updated_at: le })), { onConflict: 'cle' });
    setSaving(false);
    if (error) { alert("Les paramètres n'ont pas pu être enregistrés.\n\n" + error.message); return; }
    setModifiees(new Set()); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const sections = [
    { id: 'agence', label: '🏢 Agence', icon: '🏢' },
    { id: 'emails', label: '✉️ Templates email', icon: '✉️' },
    { id: 'relances', label: '🔔 Relances', icon: '🔔' },
    { id: 'point', label: '📨 Point automatique', icon: '📨' },
    { id: 'alertes', label: '🔔 Alertes mail', icon: '🔔' },
    { id: 'securite', label: '🔒 Sécurité', icon: '🔒' },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Paramètres</h1>
          <p className={styles.sub}>Configuration de votre outil Emilio Immobilier</p>
        </div>
        {!AUTONOMES.includes(activeSection) && (
          <button
            className={`${styles.btn} ${styles.btnDark}`}
            onClick={save} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving ? '⏳ Sauvegarde...' : saved ? '✅ Sauvegardé !' : '💾 Sauvegarder tout'}
          </button>
        )}
      </div>

      <div className={styles.paramGrille} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20 }}>
        {/* NAV SECTIONS */}
        <div className={styles.paramNav} style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-defile="">
          {sections.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} aria-pressed={activeSection === s.id}
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 10, border: 'none', background: activeSection === s.id ? 'var(--emilio)' : 'white', color: activeSection === s.id ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.12s', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: 2 }}>
              {s.icon} {s.label.split(' ').slice(1).join(' ')}
            </button>
          ))}
        </div>

        {/* CONTENT — V3.152 : une autre rubrique arrive en cascade. */}
        <Cascade cle={activeSection}>
          {/* AGENCE — l'identité que les documents impriment */}
          {activeSection === 'agence' && <ParamAgence />}

          {/* TEMPLATES EMAIL */}
          {activeSection === 'emails' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 24 }}>
                <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--emilio)', marginBottom: 6 }}>✉️ Tes coordonnées dans les mails</div>
                <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 18, lineHeight: 1.5 }}>{'Ce qui signe tes mails. L’identité de l’agence imprimée sur les documents est dans la rubrique Agence.'}</div>
                <div className={styles.param2} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div><label className={styles.label}>Nom de l'agence</label><input className={styles.input} value={params.agence_nom||''} onChange={e=>set('agence_nom',e.target.value)} /></div>
                  <div><label className={styles.label}>Email professionnel</label><input className={styles.input} type="email" value={params.conseiller_email||''} onChange={e=>set('conseiller_email',e.target.value)} /></div>
                  <div><label className={styles.label}>Prénom conseiller</label><input className={styles.input} value={params.conseiller_prenom||''} onChange={e=>set('conseiller_prenom',e.target.value)} /></div>
                  <div><label className={styles.label}>Nom conseiller</label><input className={styles.input} value={params.conseiller_nom||''} onChange={e=>set('conseiller_nom',e.target.value)} /></div>
                  <div><label className={styles.label}>Téléphone</label><input className={styles.input} value={params.conseiller_telephone||''} onChange={e=>set('conseiller_telephone',e.target.value)} /></div>
                  <div><label className={styles.label}>Site web (optionnel)</label><input className={styles.input} value={params.site_web||''} onChange={e=>set('site_web',e.target.value)} placeholder="https://..." /></div>
                </div>
                <div style={{ marginTop: 16, padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e3e8f0' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--emilio)', marginBottom: 4 }}>📋 Signature automatique</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{'Placée à la fin de chaque mail que tu écris depuis le CRM (Nouveau mail, envoi de biens) : tu peux la retoucher avant d’envoyer.'}</div>
                  <textarea className={styles.input} rows={4} value={params.signature_email || signatureDe(params)}
                    onChange={e=>set('signature_email',e.target.value)} />
                </div>
              </div>
              <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 24 }}>
                <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--emilio)', marginBottom: 6 }}>✉️ Templates email</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20, lineHeight: 1.6 }}>
                  {'Variables, remplacées pour chaque client : '}
                  {VARIABLES_MAIL.map((v, i) => <span key={v}>{i > 0 ? ' ' : ''}<code style={CODE}>{v}</code></span>)}
                  {' — la dernière donne ton prénom et ton nom, ci-dessus.'}
                </div>

                {/* « Email de relance J+5 » est parti : aucun mail de relance ne
                    part tout seul, le modèle n'était lu par personne. Une
                    relance est une tâche pour toi (rubrique Relances). */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--emilio)', marginBottom: 4, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>📄 Sélection de biens</div>
                  <div style={{ fontSize: 12, color: '#64748b', margin: '8px 0 12px', lineHeight: 1.5 }}>{'Pré-remplit « Envoyer la sélection » sur la fiche d’un client. Laissé vide, le texte habituel.'}</div>
                  <div><label className={styles.label}>Objet</label><input className={styles.input} value={params.template_email_objet||''} onChange={e=>set('template_email_objet',e.target.value)} placeholder="Vide : « Sélection de biens — Vos recherches immobilières »" /></div>
                  <div style={{marginTop:10}}><label className={styles.label}>Corps</label><textarea className={styles.input} rows={6} value={params.template_email_corps||''} onChange={e=>set('template_email_corps',e.target.value)} placeholder={'Vide : le texte habituel, qui commence par « Bonjour {{prénom}}, suite à votre projet de recherche… »'} /></div>
                </div>
              </div>
            </div>
          )}

          {/* RELANCES — la carte « SMS Mailjet » est partie (V3.20) : elle
              demandait les clés Mailjet, gardées en clair dans la base, pour un
              envoi de SMS qui n'a jamais été branché. */}
          {activeSection === 'relances' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 24 }}>
                <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--emilio)', marginBottom: 6 }}>🔔 Relances automatiques</div>
                <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>{'Après chaque envoi de biens, une relance se programme d’office à ce délai. Elle se clôt toute seule si le client répond avant.'}</div>
                <div>
                  <label className={styles.label}>Délai de la relance après un envoi</label>
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

          {/* POINT AUTOMATIQUE — « Où en est votre recherche ? » */}
          {activeSection === 'point' && <ParamPointAuto />}

          {/* ALERTES MAIL — les mails « Emilio · CRM » qu'Alexandre reçoit */}
          {activeSection === 'alertes' && <ParamAlertes />}

          {/* SÉCURITÉ */}
          {activeSection === 'securite' && (
            <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 24 }}>
              <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--emilio)', marginBottom: 16 }}>🔒 Sécurité & Accès</div>
              {/* L'identifiant et le « nouveau mot de passe » sont partis
                  (V3.20) : ils s'écrivaient en clair dans la base, et ne
                  changeaient rien — la connexion passe par Supabase. */}
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                {'La connexion au CRM passe par ton compte Supabase : l’adresse et le mot de passe que tu tapes sur la page de connexion. Le mot de passe se gère dans Supabase (Authentication › Users), plus ici.'}
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
        </Cascade>
      </div>
    </div>
  );
}
