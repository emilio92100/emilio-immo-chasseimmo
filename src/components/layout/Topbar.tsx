'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Topbar.module.css';

export default function Topbar({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [relancesCount, setRelancesCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Compteur relances réel
  useEffect(() => {
    supabase.from('relances').select('*', { count: 'exact', head: true }).eq('statut', 'en_attente')
      .then(({ count }) => setRelancesCount(count || 0));
  }, []);

  // Fermer si clic extérieur
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Recherche avec debounce
  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      const q = query.trim().toLowerCase();
      const { data } = await supabase
        .from('clients')
        .select('id, prenom, nom, reference, emails, telephones, statut, type_bien, budget_min, budget_max, secteurs')
        .or(`prenom.ilike.%${q}%,nom.ilike.%${q}%,reference.ilike.%${q}%`)
        .limit(8);
      setResults(data || []);
      setOpen(true);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const statutColor: Record<string, string> = {
    prospect: '#8b5cf6', actif: '#10b981', suspendu: '#f59e0b',
    bien_trouve: '#3b82f6', perdu: '#ef4444',
  };

  function selectClient(client: any) {
    setQuery('');
    setResults([]);
    setOpen(false);
    onNavigate('fiche', client);
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.searchWrap} ref={ref}>
        <span className={styles.searchIco}>🔍</span>
        <input
          type="text"
          placeholder="Rechercher un client, référence EMI..."
          className={styles.searchInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
        />
        {query && <button onClick={() => { setQuery(''); setResults([]); setOpen(false); }} className={styles.clearBtn}>✕</button>}
        {!query && <span className={styles.searchHint}>⌘K</span>}

        {/* DROPDOWN RÉSULTATS */}
        {open && (
          <div className={styles.searchDropdown}>
            {loading ? (
              <div className={styles.searchEmpty}>Recherche...</div>
            ) : results.length === 0 ? (
              <div className={styles.searchEmpty}>Aucun résultat pour « {query} »</div>
            ) : (
              <>
                <div className={styles.searchSection}>Clients</div>
                {results.map(c => (
                  <div key={c.id} className={styles.searchItem} onClick={() => selectClient(c)}>
                    <div className={styles.searchAv}>{c.prenom[0]}{c.nom[0]}</div>
                    <div className={styles.searchInfo}>
                      <div className={styles.searchName}>{c.prenom} {c.nom}</div>
                      <div className={styles.searchMeta}>
                        {c.reference}
                        {c.type_bien && ` · ${c.type_bien}`}
                        {c.budget_max && ` · ${(c.budget_max/1000).toFixed(0)}k€`}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${statutColor[c.statut]}15`, color: statutColor[c.statut], fontWeight: 600, border: `1px solid ${statutColor[c.statut]}30` }}>
                      {c.statut === 'prospect' ? '🟣' : c.statut === 'actif' ? '🟢' : c.statut === 'suspendu' ? '⏸️' : c.statut === 'bien_trouve' ? '✅' : '🔴'} {c.statut}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <div className={styles.spacer} />

      {relancesCount > 0 && (
        <button className={`${styles.alertBtn} pulse`} onClick={() => onNavigate('relances')}>
          <span>🔔</span>
          <span>{relancesCount} relance{relancesCount > 1 ? 's' : ''}</span>
        </button>
      )}
      <button className={styles.btn} onClick={() => onNavigate('mail')}>✉️ Nouveau mail</button>
      <button className={`${styles.btn} ${styles.btnDark}`} onClick={() => onNavigate('clients')}>+ Nouveau client</button>
    </header>
  );
}
