'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { delaiRelance, echeanceDans } from '@/lib/relances';
import styles from './Page.module.css';

export default function PageRelances({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [relances, setRelances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  /* Reporter posait une date toute faite sans rien demander : on ne voyait pas
     ce qui s'était passé, d'où l'impression que ça ne marchait pas. On choisit
     désormais la date, et la ligne se range sous nos yeux. */
  const [report, setReport] = useState<{ id: string; date: string } | null>(null);

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

  /* Le report part toujours d'aujourd'hui, jamais de l'ancienne échéance :
     une relance en retard de dix jours doit revenir dans le délai normal. */
  async function ouvrirReport(id: string) {
    if (report?.id === id) { setReport(null); return; }
    const j = await delaiRelance();
    setReport({ id, date: echeanceDans(j).split('T')[0] });
  }

  async function reporter(id: string, jour: string) {
    if (!jour) return;
    await supabase.from('relances')
      .update({ date_echeance: new Date(`${jour}T12:00:00`).toISOString() }).eq('id', id);
    setReport(null);
    fetch();
  }

  /* Deux catégories seulement, parce qu'il n'y a que deux questions : qu'est-ce
     que je dois faire maintenant, et qu'est-ce qui m'attend. Le retard reste
     visible ligne par ligne, en rouge. */
  const today = new Date().toISOString().split('T')[0];
  const aFaire = relances.filter(r => r.date_echeance.split('T')[0] <= today);
  const avenir = relances.filter(r => r.date_echeance.split('T')[0] > today);
  const retard = relances.filter(r => r.date_echeance.split('T')[0] < today);

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

  const jourPlus = (j: number) => {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + j);
    return d.toISOString().split('T')[0];
  };

  const Row = ({ r }: { r: any }) => {
    const tag = getTag(r);
    const client = r.clients;
    const ouvert = report?.id === r.id;
    return (
      <>
      <div className={styles.listRow}>
        <div className={styles.urgBar} style={{ background: tag.color }} />
        <div style={{ flex: 1 }}>
          <div className={styles.name}>{client ? `${client.prenom} ${client.nom}` : '—'}</div>
          <div className={styles.detail}>
            {r.note || (r.type === 'manuelle' ? 'Relance manuelle' : 'Relance')}
            <span style={{ color: '#a3b0c2' }}>{' · '}prévue le {new Date(r.date_echeance).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span>
          </div>
        </div>
        <span className={`${styles.badge} ${tag.cls}`}>{tag.label}</span>
        <div className={styles.btnRow}>
          {client && <button className={styles.btn} onClick={() => onNavigate('fiche', client)}>Voir fiche</button>}
          <button className={styles.btn} onClick={() => ouvrirReport(r.id)}
            style={ouvert ? { borderColor: '#c9a84c', background: '#fdfaf1', color: '#a9822f' } : undefined}>
            Reporter
          </button>
          <button className={`${styles.btn} ${styles.btnDark}`} onClick={() => cloturer(r.id)}>✓ Clôturer</button>
        </div>
      </div>

      {ouvert && report && (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          padding: '12px 16px 14px 20px', background: '#fdfaf1', borderBottom: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#a9822f', textTransform: 'uppercase', letterSpacing: 0.9, marginRight: 4 }}>
            Reporter au
          </span>
          {([['Demain', 1], ['Dans 3 j', 3], ['Dans 7 j', 7], ['Dans 15 j', 15], ['Dans 1 mois', 30]] as [string, number][]).map(([lib, j]) => {
            const d = jourPlus(j);
            const actif = report.date === d;
            return (
              <button key={lib} onClick={() => setReport({ id: r.id, date: d })}
                style={{ padding: '5px 12px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12.5, fontWeight: 700,
                  border: `1px solid ${actif ? '#c9a84c' : '#e3d3ab'}`,
                  background: actif ? '#1a2332' : 'white', color: actif ? '#f2dfa6' : '#6b6045' }}>
                {lib}
              </button>
            );
          })}
          <input type="date" value={report.date} min={jourPlus(0)}
            onChange={e => setReport({ id: r.id, date: e.target.value })}
            style={{ border: '1px solid #e3d3ab', borderRadius: 9, padding: '5px 10px',
              fontFamily: 'inherit', fontSize: 12.5, color: '#1a2332', background: 'white', outline: 'none' }} />
          <span style={{ flexGrow: 1 }} />
          <button onClick={() => setReport(null)}
            style={{ background: 'none', border: 'none', color: '#a08c60', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Annuler
          </button>
          <button onClick={() => reporter(r.id, report.date)}
            style={{ background: '#1a2332', color: 'white', border: 'none', borderRadius: 9,
              padding: '7px 15px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Reporter au {new Date(`${report.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </button>
        </div>
      )}
      </>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Relances</h1>
          <p className={styles.sub}>
            {aFaire.length} à faire{retard.length > 0 ? ` · dont ${retard.length} en retard` : ''}
            {avenir.length > 0 ? ` · ${avenir.length} à venir` : ''}
          </p>
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
          {aFaire.length > 0 && (
            <>
              <div className={styles.sectionLabel} style={{ background: '#ef4444' }}>🔴 À faire — {aFaire.length}{retard.length > 0 ? ` · dont ${retard.length} en retard` : ''}</div>
              <div className={styles.card}>{aFaire.map(r => <Row key={r.id} r={r} />)}</div>
            </>
          )}
          {avenir.length > 0 && (
            <>
              <div className={styles.sectionLabel} style={{ background: '#f59e0b', marginTop: aFaire.length > 0 ? 8 : 0 }}>🟡 À venir — {avenir.length}</div>
              <div className={styles.card}>{avenir.map(r => <Row key={r.id} r={r} />)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
