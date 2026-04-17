'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Page.module.css';

const SIGNATURE = `Cordialement,
Alexandre ROGELET
Emilio Immobilier
06 58 95 76 32`;

const MESSAGES_PRE = [
  { label: '📅 Proposition de visite', corps: `Bonjour {{prénom}},\n\nSuite à notre échange, je souhaiterais vous proposer une visite du bien qui correspond à vos critères.\n\nSeriez-vous disponible prochainement ? Je reste à votre disposition pour organiser cela dans les meilleurs délais.\n\n` + SIGNATURE },
  { label: '🔄 Suivi de recherche', corps: `Bonjour {{prénom}},\n\nJe vous contacte pour faire un point sur votre recherche immobilière. J'ai plusieurs biens en cours d'analyse qui pourraient correspondre à vos critères.\n\nPuis-je vous appeler dans la semaine pour en discuter ?\n\n` + SIGNATURE },
  { label: '📋 Compte-rendu d\'activité', corps: `Bonjour {{prénom}},\n\nJe souhaitais vous faire un bilan de nos recherches en cours. Nous avons analysé plusieurs biens sur vos secteurs prioritaires et je travaille activement à vous trouver la perle rare.\n\nN'hésitez pas à me faire part de vos remarques ou nouvelles priorités.\n\n` + SIGNATURE },
  { label: '✅ Confirmation de rendez-vous', corps: `Bonjour {{prénom}},\n\nJe vous confirme notre rendez-vous. N'oubliez pas de vous munir de vos documents (pièce d'identité, justificatifs de revenus) si vous souhaitez avancer rapidement sur un bien.\n\nÀ très bientôt !\n\n` + SIGNATURE },
  { label: '💌 Message personnalisé', corps: `Bonjour {{prénom}},\n\n` + SIGNATURE },
];

export default function PageMail({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any[]>([]);
  const [objet, setObjet] = useState('');
  const [corps, setCorps] = useState(`Bonjour {{prénom}},\n\n` + SIGNATURE);
  const [sms, setSms] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [showPre, setShowPre] = useState(false);

  useEffect(() => {
    supabase.from('clients').select('id, prenom, nom, emails, telephones, reference')
      .in('statut', ['actif', 'prospect', 'suspendu', 'offre_ecrite', 'bien_trouve'])
      .order('nom')
      .then(({ data }) => setClients(data || []));
  }, []);

  const filtered = clients.filter(c =>
    !selected.find(s => s.id === c.id) &&
    (search === '' || `${c.prenom} ${c.nom} ${c.reference}`.toLowerCase().includes(search.toLowerCase()))
  );

  const addClient = (c: any) => { setSelected(prev => [...prev, c]); setSearch(''); };
  const removeClient = (id: string) => setSelected(prev => prev.filter(s => s.id !== id));

  async function handleSend() {
    if (selected.length === 0) { alert('Ajoutez au moins un destinataire'); return; }
    if (!objet.trim()) { alert("L'objet est obligatoire"); return; }
    setSending(true);
    for (const client of selected) {
      const corpsPersonnalise = corps.replace(/\{\{prénom\}\}/g, client.prenom);
      await supabase.from('envois').insert({
        client_id: client.id,
        type: 'mail_libre',
        objet,
        corps: corpsPersonnalise,
        destinataires: client.emails || [],
        sms_envoye: sms,
      });
      // Journal avec contenu complet du message
      await supabase.from('journal').insert({
        client_id: client.id,
        type: 'mail_envoye',
        titre: `✉️ Mail envoyé — ${objet}`,
        description: `À : ${(client.emails||[]).join(', ')}\n\n${corpsPersonnalise}`,
      });
    }
    setSending(false);
    setSent(true);
    setTimeout(() => { setSent(false); setSelected([]); setObjet(''); setCorps(`Bonjour {{prénom}},\n\n` + SIGNATURE); }, 3000);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Nouveau mail</h1>
          <p className={styles.sub}>Envoyé depuis arogelet@emilio-immo.com via Mailjet</p>
        </div>
      </div>

      {sent ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>✅</div>
          <div className={styles.emptyTitle}>Mail envoyé !</div>
          <div className={styles.emptySub}>Le contenu a été tracé dans le journal de chaque client</div>
        </div>
      ) : (
        <div className={styles.formWrap}>
          <div className={styles.card} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* DESTINATAIRES */}
            <div>
              <label className={styles.label} style={{ display: 'block', marginBottom: 6 }}>DESTINATAIRE(S)</label>
              <div className={styles.tagsInput}>
                {selected.map(c => (
                  <span key={c.id} className={styles.tag}>
                    {c.prenom} {c.nom}
                    <span onClick={() => removeClient(c.id)} style={{ marginLeft: 6, cursor: 'pointer', opacity: 0.6 }}>✕</span>
                  </span>
                ))}
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={selected.length === 0 ? 'Rechercher un client...' : 'Ajouter un autre client...'}
                  style={{ flex: 1, minWidth: 160, border: 'none', outline: 'none', fontSize: 13, background: 'transparent', fontFamily: 'inherit' }}
                />
              </div>
              {search && (
                <div style={{ background: 'white', border: '1px solid #e3e8f0', borderRadius: 10, marginTop: 4, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  {filtered.length === 0
                    ? <div style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8' }}>Aucun client trouvé</div>
                    : filtered.slice(0, 8).map(c => (
                      <div key={c.id} onClick={() => addClient(c)}
                        style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f8fafc', display: 'flex', gap: 8, alignItems: 'center' }}
                        onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseOut={e => (e.currentTarget.style.background = 'white')}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: '#1a2332', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#c9a84c' }}>{c.prenom[0]}{c.nom[0]}</span>
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#1a2332' }}>{c.prenom} {c.nom}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.reference} · {(c.emails||[])[0] || 'Pas d\'email'}</div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>

            {/* OBJET */}
            <div>
              <label className={styles.label} style={{ display: 'block', marginBottom: 6 }}>OBJET</label>
              <input className={styles.input} value={objet} onChange={e => setObjet(e.target.value)} placeholder="Saisissez l'objet du mail..." />
            </div>

            {/* MESSAGE */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label className={styles.label}>MESSAGE <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>— utilisez {'{{prénom}}'} pour personnaliser</span></label>
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowPre(!showPre)} style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    💬 Messages pré-rédigés ▾
                  </button>
                  {showPre && (
                    <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'white', border: '1px solid #e3e8f0', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 280 }}>
                      {MESSAGES_PRE.map((m, i) => (
                        <div key={i} onClick={() => { setCorps(m.corps); setShowPre(false); }}
                          style={{ padding: '12px 16px', cursor: 'pointer', fontSize: 13, borderBottom: i < MESSAGES_PRE.length-1 ? '1px solid #f8fafc' : 'none', fontWeight: 600, color: '#1a2332' }}
                          onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseOut={e => (e.currentTarget.style.background = 'white')}>
                          {m.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <textarea className={styles.textarea} rows={12} value={corps} onChange={e => setCorps(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7 }} />
            </div>

            {/* FOOTER */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4a5568', cursor: 'pointer' }}>
                <input type="checkbox" checked={sms} onChange={e => setSms(e.target.checked)} style={{ accentColor: '#1a2332' }} />
                📱 Envoyer aussi un SMS de notification
                {selected.length > 0 && selected[0].telephones?.[0] && <span style={{ fontSize: 11, color: '#94a3b8' }}>→ {selected[0].telephones[0]}</span>}
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className={styles.btn} onClick={() => { setSelected([]); setObjet(''); setCorps(`Bonjour {{prénom}},\n\n` + SIGNATURE); }}>Annuler</button>
                <button className={`${styles.btn} ${styles.btnDark}`} onClick={handleSend} disabled={sending || selected.length === 0}>
                  {sending ? '⏳ Envoi...' : `✈️ Envoyer${selected.length > 0 ? ` (${selected.length} destinataire${selected.length > 1 ? 's' : ''})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
