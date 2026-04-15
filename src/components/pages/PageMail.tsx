'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Page.module.css';

export default function PageMail({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any[]>([]);
  const [objet, setObjet] = useState('Nouvelle sélection de biens — Emilio Immobilier');
  const [corps, setCorps] = useState(`Bonjour {{prénom}},

Suite à notre échange, je vous transmets une sélection de biens correspondant à vos critères.

N'hésitez pas à me contacter pour organiser une visite.

Cordialement,
Alexandre ROGELET
Emilio Immobilier
06 58 95 76 32`);
  const [sms, setSms] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.from('clients').select('id, prenom, nom, emails, reference').in('statut', ['actif', 'prospect']).then(({ data }) => setClients(data || []));
  }, []);

  const filtered = clients.filter(c =>
    !selected.find(s => s.id === c.id) &&
    (search === '' || `${c.prenom} ${c.nom}`.toLowerCase().includes(search.toLowerCase()))
  );

  const addClient = (c: any) => { setSelected([...selected, c]); setSearch(''); };
  const removeClient = (id: string) => setSelected(selected.filter(s => s.id !== id));

  async function handleSend() {
    if (selected.length === 0) { alert('Ajoutez au moins un destinataire'); return; }
    if (!objet) { alert('L\'objet est obligatoire'); return; }
    setSending(true);
    for (const client of selected) {
      await supabase.from('envois').insert({
        client_id: client.id,
        type: 'mail_libre',
        objet,
        corps: corps.replace('{{prénom}}', client.prenom),
        destinataires: client.emails || [],
        sms_envoye: sms,
      });
      await supabase.from('journal').insert({
        client_id: client.id,
        type: 'mail_envoye',
        titre: 'Mail envoyé',
        description: `Objet : ${objet}`,
      });
    }
    setSending(false);
    setSent(true);
    setTimeout(() => { setSent(false); setSelected([]); setObjet(''); setCorps(''); }, 3000);
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
          <div className={styles.emptyTitle}>Mail envoyé avec succès !</div>
          <div className={styles.emptySub}>Le mail a été tracé dans le journal de chaque client</div>
        </div>
      ) : (
        <div className={styles.formWrap}>
          <div className={styles.card} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* DESTINATAIRES */}
            <div className={styles.formGroup} style={{ margin: 0 }}>
              <label className={styles.label}>Destinataire(s)</label>
              <div className={styles.tagsInput}>
                {selected.map(c => (
                  <span key={c.id} className={styles.tag}>
                    {c.prenom} {c.nom}
                    <span onClick={() => removeClient(c.id)} style={{ marginLeft: 6, cursor: 'pointer', opacity: 0.7 }}>✕</span>
                  </span>
                ))}
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un client..."
                />
              </div>
              {search && filtered.length > 0 && (
                <div style={{ background: 'white', border: '1px solid #e3e8f0', borderRadius: 10, marginTop: 4, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  {filtered.slice(0, 5).map(c => (
                    <div key={c.id} onClick={() => addClient(c)}
                      style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #f8fafc' }}
                      onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseOut={e => (e.currentTarget.style.background = 'white')}>
                      {c.prenom} {c.nom} <span style={{ color: '#94a3b8', fontSize: 12 }}>{c.reference}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* OBJET */}
            <div className={styles.formGroup} style={{ margin: 0 }}>
              <label className={styles.label}>Objet</label>
              <input className={styles.input} value={objet} onChange={e => setObjet(e.target.value)} placeholder="Objet du mail" />
            </div>

            {/* CORPS */}
            <div className={styles.formGroup} style={{ margin: 0 }}>
              <label className={styles.label}>Message <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— utilisez {'{{prénom}}'} pour personnaliser</span></label>
              <textarea className={styles.textarea} rows={10} value={corps} onChange={e => setCorps(e.target.value)} />
            </div>

            {/* FOOTER */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#4a5568', cursor: 'pointer' }}>
                <input type="checkbox" checked={sms} onChange={e => setSms(e.target.checked)} style={{ accentColor: '#1a2332' }} />
                Envoyer aussi un SMS de notification
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className={styles.btn} onClick={() => { setSelected([]); setObjet(''); }}>Annuler</button>
                <button className={`${styles.btn} ${styles.btnDark}`} onClick={handleSend} disabled={sending}>
                  {sending ? 'Envoi...' : `✈️ Envoyer${selected.length > 0 ? ` (${selected.length})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
