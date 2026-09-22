'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Client, Relance } from '@/lib/supabase';
import styles from './Dashboard.module.css';

export default function Dashboard({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [relances, setRelances] = useState<Relance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    const [{ data: c }, { data: r }] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('relances').select('*').eq('statut', 'en_attente').order('date_echeance', { ascending: true }),
    ]);
    setClients(c || []);
    setRelances(r || []);
    setLoading(false);
  }

  const actifs    = clients.filter(c => c.statut === 'actif').length;
  const prospects = clients.filter(c => c.statut === 'prospect').length;
  const today     = new Date().toISOString().split('T')[0];

  /* Deux familles, et elles ne veulent pas dire la même chose :
       « à faire »  → l'échéance est arrivée ou dépassée, ça appelle un geste
       « à venir »  → c'est calé pour plus tard, il n'y a rien à faire
     Le compteur rouge ne comptait pas ça : il additionnait tout ce qui était
     en attente en base, donc une relance prévue dans six jours faisait
     clignoter le dashboard pour rien. La barre de gauche et celle du haut,
     elles, n'ont jamais compté que les relances dues. */
  const relanceRetard     = relances.filter(r => r.date_echeance.split('T')[0] < today);
  const relanceAujourdhui = relances.filter(r => r.date_echeance.split('T')[0] === today);
  const relanceAvenir     = relances.filter(r => r.date_echeance.split('T')[0] > today);
  const relanceAfaire     = [...relanceRetard, ...relanceAujourdhui];

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  /* Une ligne de relance. L'étiquette de droite dit toujours la même chose que
     le groupe dans lequel la ligne se trouve : rouge quand c'est dû, ambre
     quand c'est pour plus tard. */
  const LigneRelance = ({ r }: { r: Relance }) => {
    const dateR = r.date_echeance.split('T')[0];
    const enRetard = dateR < today;
    const cejour = dateR === today;
    const jours = Math.abs(Math.round((new Date(dateR).getTime() - new Date(today).getTime()) / 86400000));
    const cli = clients.find(c => c.id === r.client_id);
    return (
      <div className={styles.listRow} onClick={() => { if (cli) onNavigate('fiche', cli); }}>
        <div className={styles.urgBar} style={{ background: enRetard || cejour ? '#ef4444' : '#f59e0b' }} />
        <div className={styles.listInfo}>
          <div className={styles.listName}>{cli ? `${cli.prenom} ${cli.nom}` : `Client #${r.client_id.slice(0, 8)}`}</div>
          <div className={styles.listDetail}>{r.note || (r.type === 'manuelle' ? 'Relance manuelle' : 'Sans réponse du client')}</div>
        </div>
        <span className={`${styles.badge} ${enRetard || cejour ? styles.badgeRed : styles.badgeAmber}`}>
          {enRetard ? `${jours}j de retard` : cejour ? "Aujourd'hui" : jours === 1 ? 'Demain' : `Dans ${jours}j`}
        </span>
      </div>
    );
  };

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
      Chargement...
    </div>
  );

  return (
    <div className={styles.dashboard}>

      {/* WELCOME BANNER */}
      <div className={styles.welcomeBanner}>
        <div className={styles.welcomeLeft}>
          <p className={styles.welcomeDate}>{dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}</p>
          <h1 className={styles.welcomeTitle}>Bonjour, Alexandre 👋</h1>
          <p className={styles.welcomeSub}>
            {relanceAfaire.length > 0
              ? <>Vous avez <strong style={{color:'#fca5a5'}}>{relanceAfaire.length} relance{relanceAfaire.length > 1 ? 's' : ''} à faire</strong>{relanceAvenir.length > 0 ? <> et {relanceAvenir.length} à venir</> : null} — bonne journée ! 🌟</>
              : relanceAvenir.length > 0
                ? <>Rien à relancer aujourd&apos;hui — {relanceAvenir.length} relance{relanceAvenir.length > 1 ? 's' : ''} plus tard dans la semaine. ☀️</>
                : <>Aucune relance à faire — bonne journée ! ☀️</>
            }
          </p>
        </div>
        <div className={styles.welcomeRight} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className={styles.mailBtn} onClick={() => onNavigate('mail')}>✉️ Nouveau mail</button>
          <button onClick={() => onNavigate('clients')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#c9a84c', color: '#1a2332', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>+ Nouveau client</button>
        </div>
      </div>

      {/* DIVIDER */}
      <div className={styles.sectionDivider}><span>Vue d'ensemble</span></div>

      {/* STATS */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard} onClick={() => onNavigate('clients')}>
          <div className={styles.statTop}>
            <div className={`${styles.statIcon} ${styles.iconSlate}`}>👥</div>
            {prospects > 0 && <span className={`${styles.statBadge} ${styles.badgePurple}`}>{prospects} prospect{prospects > 1 ? 's' : ''}</span>}
          </div>
          <div className={styles.statVal}>{actifs}</div>
          <div className={styles.statLabel}>Clients actifs</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <div className={`${styles.statIcon} ${styles.iconGold}`}>📄</div>
          </div>
          <div className={styles.statVal}>0</div>
          <div className={styles.statLabel}>Sélections ce mois</div>
        </div>

        <div className={styles.statCard} onClick={() => onNavigate('visites')}>
          <div className={styles.statTop}>
            <div className={`${styles.statIcon} ${styles.iconBlue}`}>📅</div>
          </div>
          <div className={styles.statVal}>0</div>
          <div className={styles.statLabel}>Visites effectuées</div>
        </div>

        <div className={`${styles.statCard} ${styles.statDark}`}>
          <div className={styles.statTop}>
            <div className={`${styles.statIcon} ${styles.iconDark}`}>💰</div>
            <span className={`${styles.statBadge} ${styles.badgeGoldDark}`}>HT</span>
          </div>
          <div className={`${styles.statVal} ${styles.statValWhite}`}>0€</div>
          <div className={`${styles.statLabel} ${styles.statLabelDark}`}>CA mois en cours</div>
        </div>
      </div>

      {/* MAIN ROW */}
      <div className={styles.mainRow}>

        {/* RELANCES */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              🔔 Relances
              {relanceAfaire.length > 0 && (
                <span className={`${styles.pastille} ${styles.pastilleRouge}`} title="À faire maintenant">{relanceAfaire.length}</span>
              )}
              {relanceAvenir.length > 0 && (
                <span className={`${styles.pastille} ${styles.pastilleAmbre}`} title="Calées pour plus tard">{relanceAvenir.length}</span>
              )}
            </div>
            {relances.length > 0 && <button className={styles.cardLink} onClick={() => onNavigate('relances')}>Voir toutes →</button>}
          </div>
          {relances.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
              ✅ Aucune relance en attente
            </div>
          ) : (
            <div>
              {relanceAfaire.length > 0 && (
                <>
                  <div className={styles.groupeLabel} style={{ color: '#ef4444' }}>
                    <span className={styles.groupePoint} style={{ background: '#ef4444' }} />
                    À faire {relanceRetard.length > 0 ? `— dont ${relanceRetard.length} en retard` : ''}
                  </div>
                  {relanceAfaire.slice(0, 3).map(r => <LigneRelance key={r.id} r={r} />)}
                </>
              )}
              {relanceAvenir.length > 0 && (
                <>
                  <div className={styles.groupeLabel} style={{ color: '#b45309', borderTop: relanceAfaire.length > 0 ? '1px solid #f1f5f9' : undefined }}>
                    <span className={styles.groupePoint} style={{ background: '#f59e0b' }} />
                    À venir — rien à faire pour l&apos;instant
                  </div>
                  {relanceAvenir.slice(0, relanceAfaire.length > 0 ? 2 : 4).map(r => <LigneRelance key={r.id} r={r} />)}
                </>
              )}
            </div>
          )}
        </div>

        {/* TRANSACTIONS */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>🏠 Transactions en cours</div>
          </div>
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
            Aucune transaction en cours
          </div>
        </div>

        {/* RIGHT COL */}
        <div className={styles.rightCol}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>📅 Visites à venir</div>
              <button className={styles.cardLink} onClick={() => onNavigate('visites')}>Tout →</button>
            </div>
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
              Aucune visite planifiée
            </div>
          </div>

          <div className={styles.card} style={{ flex: 1 }}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>🕐 Activité récente</div>
            </div>
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
              {clients.length === 0
                ? 'Créez votre premier client pour commencer'
                : 'Aucune activité récente'
              }
            </div>
          </div>

          {clients.length === 0 && (
            <div style={{ background: 'linear-gradient(135deg, #1a2332, #243044)', borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>🚀 Pour commencer</div>
              <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 13, color: 'white', marginBottom: 4 }}>Créez votre premier client</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Ajoutez vos acheteurs et commencez la chasse !</div>
              <button
                onClick={() => onNavigate('clients')}
                style={{ width: '100%', background: '#c9a84c', color: '#1a2332', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
              >
                + Nouveau client
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
