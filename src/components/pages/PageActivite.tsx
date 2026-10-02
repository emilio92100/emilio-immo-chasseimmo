'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { estAcheteur } from '@/lib/contacts';
import { honorairesEncaisses, honorairesPrevus, moisDe, moisCourant, eurosRonds, type Encaisse } from '@/lib/activite';
import styles from './Page.module.css';

/* « Mon activité » (V3.20) :
   · le CA n'est plus `0 €` en dur : il se lit dans les transactions clôturées
     et les biens vendus (src/lib/activite.ts) ;
   · « Envois réalisés » ne compte plus les comptes rendus de visite, rangés
     dans la même table mais jamais envoyés à personne (§6.9) ;
   · « Clients » ne compte que les acheteurs : depuis la V3.14, un notaire ou
     un confrère est aussi un contact. */
export default function PageActivite() {
  const [stats, setStats] = useState({ clients: 0, actifs: 0, visites: 0, envois: 0, finalises: 0 });
  const [encaisse, setEncaisse] = useState<Encaisse[]>([]);
  /* V3.50 : une lecture ratée (session expirée…) affichait « 0 € » comme si de
     rien n'était. On le dit. Et ce qui est attendu : les compromis signés. */
  const [erreurCA, setErreurCA] = useState(false);
  const [prevu, setPrevu] = useState<Encaisse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function lire() {
      /* Page par page : une requête s'arrête à 1 000 lignes. */
      type Ligne = { statut: string; types?: string[] | null };
      const lireTout = async (cols: string) => {
        const tout: Ligne[] = [];
        for (let de = 0; ; de += 1000) {
          const { data, error } = await supabase.from('clients').select(cols).order('id').range(de, de + 999);
          if (error) return { data: null, error };
          tout.push(...((data || []) as unknown as Ligne[]));
          if (!data || data.length < 1000) return { data: tout, error: null };
        }
      };
      let cl = await lireTout('id, statut, types');
      if (cl.error) cl = await lireTout('id, statut');
      const [{ count: vis }, { count: env }, ca, avenir] = await Promise.all([
        supabase.from('visites').select('*', { count: 'exact', head: true }).eq('statut', 'effectuee'),
        supabase.from('envois').select('*', { count: 'exact', head: true }).neq('type', 'compte_rendu_visite'),
        honorairesEncaisses().then(l => ({ ok: true, l }), () => ({ ok: false, l: [] as Encaisse[] })),
        honorairesPrevus().catch(() => [] as Encaisse[]),
      ]);
      const acheteurs = (cl.data || []).filter(c => estAcheteur(c));
      setStats({
        clients: acheteurs.length,
        actifs: acheteurs.filter(c => c.statut === 'actif').length,
        visites: vis || 0,
        envois: env || 0,
        finalises: acheteurs.filter(c => c.statut === 'bien_trouve').length,
      });
      setEncaisse(ca.l);
      setErreurCA(!ca.ok);
      setPrevu(avenir);
      setLoading(false);
    }
    lire();
  }, []);

  const total = encaisse.reduce((t, e) => t + e.ht, 0);
  /* L'année à l'heure de Paris, comme les mois du chiffre d'affaires. */
  const annee = moisCourant().slice(0, 4);
  const aVenir = prevu.reduce((t, e) => t + e.ht, 0);
  const cetteAnnee = encaisse.filter(e => moisDe(e.quand).startsWith(annee)).reduce((t, e) => t + e.ht, 0);
  const chasse = encaisse.filter(e => e.source === 'chasse').reduce((t, e) => t + e.ht, 0);
  const vente = total - chasse;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Mon activité</h1>
          <p className={styles.sub}>Statistiques depuis le lancement</p>
        </div>
      </div>
      {loading ? (
        <div className={styles.empty}><div className={styles.emptySub}>Chargement...</div></div>
      ) : (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div style={{ fontSize: 28 }}>👥</div>
            <div className={styles.statVal}>{stats.clients}</div>
            <div className={styles.statLabel}>Clients acheteurs</div>
          </div>
          <div className={styles.statCard}>
            <div style={{ fontSize: 28 }}>🟢</div>
            <div className={styles.statVal}>{stats.actifs}</div>
            <div className={styles.statLabel}>Clients actifs</div>
          </div>
          <div className={styles.statCard}>
            <div style={{ fontSize: 28 }}>📅</div>
            <div className={styles.statVal}>{stats.visites}</div>
            <div className={styles.statLabel}>Visites effectuées</div>
          </div>
          <div className={styles.statCard}>
            <div style={{ fontSize: 28 }}>📄</div>
            <div className={styles.statVal}>{stats.envois}</div>
            <div className={styles.statLabel}>Mails envoyés aux clients</div>
          </div>
          <div className={styles.statCard}>
            <div style={{ fontSize: 28 }}>✅</div>
            <div className={styles.statVal}>{stats.finalises}</div>
            <div className={styles.statLabel}>Dossiers finalisés</div>
          </div>
          <div className={styles.statCard} style={{ background: 'var(--emilio-fond)', borderColor: 'var(--emilio)' }}>
            <div style={{ fontSize: 28 }}>💰</div>
            {erreurCA ? (
              <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.88)', lineHeight: 1.5, margin: '6px 0 4px' }}>
                {'Le chiffre d’affaires n’a pas pu être lu. Recharge la page.'}
              </div>
            ) : (
              <div className={styles.statVal} style={{ color: '#c9a84c' }}>{`${eurosRonds(total)} HT`}</div>
            )}
            <div className={styles.statLabel} style={{ color: 'rgba(255,255,255,0.6)' }}>CA total HT</div>
            {!erreurCA && total > 0 && (
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginTop: 6, lineHeight: 1.5 }}>
                {`Dont ${eurosRonds(cetteAnnee)} HT en ${annee}`}<br />
                {`Chasse ${eurosRonds(chasse)} HT · Vente ${eurosRonds(vente)} HT`}
              </div>
            )}
            {/* V3.50 : ce qui est attendu, discret, sous le réalisé. */}
            {prevu.length > 0 && aVenir > 0 && (
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginTop: 6, lineHeight: 1.5 }}>
                {`À venir : ${eurosRonds(aVenir)} HT · ${prevu.length} compromis signé${prevu.length > 1 ? 's' : ''}`}
              </div>
            )}
          </div>
        </div>
      )}
      <p style={{ fontSize: 12, color: '#94a3b8', margin: '14px 2px 0', lineHeight: 1.6, maxWidth: 720 }}>
        {'Le CA additionne les honoraires HT saisis à l’étape « Acte » des transactions clôturées, et les honoraires encaissés des biens passés « Vendu » (ramenés en HT). Un honoraire non saisi ne compte pas. « À venir » : les honoraires des compromis signés dont l’acte n’est pas encore passé.'}
      </p>
    </div>
  );
}
