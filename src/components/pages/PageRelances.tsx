'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { delaiRelance, echeanceDans } from '@/lib/relances';
import styles from './Page.module.css';

export default function PageRelances({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [relances, setRelances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetch(); }, []);

  async function fetch() {
    setLoading(true);
    const { data } = await supabase
      .from('relances')
      /* On rapatrie le client en entier : « Voir fiche » a besoin de l'objet
         complet pour ouvrir la fiche, pas seulement du nom affiché ici. */
      .select('*, clients(*)')
      .eq('statut', 'en_attente')
      .order('date_echeance', { ascending: true });
    setRelances(data || []);
    setLoading(false);
  }

  async function cloturer(id: string) {
    await supabase.from('relances').update({ statut: 'cloturee' }).eq('id', id);
    fetch();
  }

  async function reporter(id: string) {
    /* Le délai vient des Paramètres, comme partout ailleurs : il était codé
       en dur à 5 ici alors que le réglage existait et n'était lu par
       personne. Le report repart d'aujourd'hui, volontairement — une relance
       en retard de dix jours doit revenir dans le délai normal, pas hériter
       de son retard. */
    await supabase.from('relances')
      .update({ date_echeance: echeanceDans(await delaiRelance()) }).eq('id', id);
    fetch();
  }

  const today = new Date().toISOString().split('T')[0];
  const retard   = relances.filter(r => r.date_echeance.split('T')[0] < today);
  const auj      = relances.filter(r => r.date_echeance.split('T')[0] === today);
  const avenir   = relances.filter(r => r.date_echeance.split('T')[0] > today);

  const getTag = (r: any) => {
    const d = r.date_echeance.split('T')[0];
    if (d < today) {
      const j = Math.floor((new Date(today).getTime() - new Date(d).getTime()) / 86400000);
      return { label: `${j}j de retard`, cls: styles.bRed, color: '#ef4444' };
    }
    if (d === today) return { label: "Aujourd'hui", cls: styles.bRed, color: '#ef4444' };
    const j = Math.floor((new Date(d).getTime() - new Date(today).getTime()) / 86400000);
    return { label: `Dans ${j} jour${j > 1 ? 's' : ''}`, cls: styles.bAmber, color: '#f59e0b' };
  };

  const Row = ({ r }: { r: any }) => {
    const tag = getTag(r);
    const client = r.clients;
    return (
      <div className={styles.listRow}>
        <div className={styles.urgBar} style={{ background: tag.color }} />
        <div style={{ flex: 1 }}>
          <div className={styles.name}>{client ? `${client.prenom} ${client.nom}` : '—'}</div>
          <div className={styles.detail}>{r.note || (r.type === 'manuelle' ? 'Relance manuelle' : 'Relance')}</div>
        </div>
        <span className={`${styles.badge} ${tag.cls}`}>{tag.label}</span>
        <div className={styles.btnRow}>
          {client && <button className={styles.btn} onClick={() => onNavigate('fiche', client)}>Voir fiche</button>}
          <button className={styles.btn} onClick={() => reporter(r.id)}>Reporter</button>
          <button className={`${styles.btn} ${styles.btnDark}`} onClick={() => cloturer(r.id)}>✓ Clôturer</button>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Relances</h1>
          <p className={styles.sub}>{relances.length} en attente · {retard.length} en retard</p>
        </div>
      </div>

      {loading ? (
        <div className={styles.empty}><div className={styles.emptySub}>Chargement...</div></div>
      ) : relances.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>✅</div>
          <div className={styles.emptyTitle}>Aucune relance en attente</div>
          <div className={styles.emptySub}>Une relance se programme toute seule dès qu&apos;un bien part chez un client, et se clôture dès qu&apos;il répond.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {retard.length > 0 && (
            <>
              <div className={styles.sectionLabel} style={{ background: '#ef4444' }}>🔴 En retard — {retard.length}</div>
              <div className={styles.card}>{retard.map(r => <Row key={r.id} r={r} />)}</div>
            </>
          )}
          {auj.length > 0 && (
            <>
              <div className={styles.sectionLabel} style={{ background: '#ef4444', marginTop: 8 }}>🔴 Aujourd'hui — {auj.length}</div>
              <div className={styles.card}>{auj.map(r => <Row key={r.id} r={r} />)}</div>
            </>
          )}
          {avenir.length > 0 && (
            <>
              <div className={styles.sectionLabel} style={{ background: '#f59e0b', marginTop: 8 }}>🟡 À venir — {avenir.length}</div>
              <div className={styles.card}>{avenir.map(r => <Row key={r.id} r={r} />)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
