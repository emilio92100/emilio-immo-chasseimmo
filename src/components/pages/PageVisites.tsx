'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Page.module.css';

export default function PageVisites({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [visites, setVisites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetch(); }, []);

  async function fetch() {
    setLoading(true);
    const { data } = await supabase
      .from('visites')
      .select('*, clients(prenom, nom, reference), biens(titre, adresse, ville)')
      .order('date_visite', { ascending: true });
    setVisites(data || []);
    setLoading(false);
  }

  async function marquerEffectuee(id: string) {
    await supabase.from('visites').update({ statut: 'effectuee' }).eq('id', id);
    fetch();
  }

  async function annuler(id: string) {
    await supabase.from('visites').update({ statut: 'annulee' }).eq('id', id);
    fetch();
  }

  const aVenir    = visites.filter(v => v.statut === 'a_venir');
  const effectuee = visites.filter(v => v.statut === 'effectuee');

  const formatDate = (d: string) => {
    const date = new Date(d);
    return {
      day: date.getDate(),
      mon: date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
    };
  };

  const VisiteRow = ({ v, showActions }: { v: any; showActions: boolean }) => {
    const date = v.date_visite ? formatDate(v.date_visite) : null;
    const client = v.clients;
    const bien = v.biens;
    return (
      <div className={styles.visiteCard} style={{ marginBottom: 8 }}>
        {date ? (
          <div className={styles.vDate}>
            <div className={styles.vDay}>{date.day}</div>
            <div className={styles.vMon}>{date.mon}</div>
          </div>
        ) : (
          <div className={styles.vDate} style={{ background: '#e2e8f0' }}>
            <div className={styles.vDay} style={{ color: '#64748b' }}>—</div>
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div className={styles.name}>{client ? `${client.prenom} ${client.nom}` : '—'}</div>
          <div className={styles.detail}>{bien?.titre || bien?.adresse || 'Bien non précisé'} {bien?.ville ? `· ${bien.ville}` : ''}</div>
          {v.heure && <div style={{ fontSize: 13, color: '#c9a84c', fontWeight: 600, marginTop: 2 }}>{v.heure}</div>}
          {v.contact_agence && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Contact : {v.contact_agence} {v.tel_agence ? `· ${v.tel_agence}` : ''}</div>}
        </div>
        {v.note_etoiles && <div style={{ fontSize: 18 }}>{'⭐'.repeat(v.note_etoiles)}</div>}
        {showActions && (
          <div className={styles.btnRow}>
            <button className={styles.btn} onClick={() => annuler(v.id)}>Annuler</button>
            <button className={`${styles.btn} ${styles.btnDark}`} onClick={() => marquerEffectuee(v.id)}>✓ Effectuée</button>
          </div>
        )}
        {!showActions && v.commentaire && (
          <div style={{ maxWidth: 300, fontSize: 12, color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '6px 10px', borderLeft: '3px solid #c9a84c' }}>
            {v.commentaire}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Visites</h1>
          <p className={styles.sub}>{aVenir.length} à venir · {effectuee.length} effectuée{effectuee.length > 1 ? 's' : ''}</p>
        </div>
      </div>

      {loading ? (
        <div className={styles.empty}><div className={styles.emptySub}>Chargement...</div></div>
      ) : visites.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📅</div>
          <div className={styles.emptyTitle}>Aucune visite planifiée</div>
          <div className={styles.emptySub}>Les visites s'ajoutent depuis la fiche client, onglet "Biens"</div>
        </div>
      ) : (
        <div>
          {aVenir.length > 0 && (
            <>
              <div className={styles.sectionLabel} style={{ background: '#3b82f6', marginBottom: 10 }}>📅 À venir — {aVenir.length}</div>
              {aVenir.map(v => <VisiteRow key={v.id} v={v} showActions={true} />)}
            </>
          )}
          {effectuee.length > 0 && (
            <>
              <div className={styles.sectionLabel} style={{ background: '#10b981', marginTop: 16, marginBottom: 10 }}>✅ Effectuées — {effectuee.length}</div>
              {effectuee.map(v => <VisiteRow key={v.id} v={v} showActions={false} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
