'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Topbar.module.css';
import { EVT_MAJ, demanderNouveauClient, demanderNouveauRdv } from '@/lib/intentions';
import { Icone } from '@/components/fiche/ParcoursBien';

/* Minuscules, sans accents ni ponctuation : « Rue de l'Église » → « rue de l eglise ». */
function sansAccent(t: string) {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9@.+]+/g, ' ').trim();
}
const chiffres = (t: string) => t.replace(/\D/g, '');

/* Chaque mot doit se trouver dans la fiche du client. Un mot fait de chiffres
   se cherche aussi dans les téléphones sans espaces (« 06 10 26 » trouve
   0610261657). On dit à côté du nom ce qui a été trouvé, quand ce n'est pas
   le nom lui-même : l'adresse, le bien actuel, le mail, le téléphone. */
function chercher(ix: { clients: any[] }, mots: string[]) {
  if (!mots.length) return [];
  const contient = (champ: string, m: string) => champ.includes(m) || (/^\d{2,}$/.test(m) && chiffres(champ).includes(m));
  const clients = ix.clients.map((c: any) => {
    const champs: [string, string][] = [
      ['nom', sansAccent(`${c.prenom || ''} ${c.nom || ''} ${c.reference || ''}`)],
      ['adresse', sansAccent(c.adresse || '')],
      ['bien', sansAccent(c.bien_actuel_adresse || '')],
      ['mail', sansAccent((c.emails || []).join(' '))],
      ['tel', (c.telephones || []).join(' ')],
    ];
    const tout = champs.map(x => x[1]).join(' ');
    if (!mots.every(m => contient(tout, m))) return null;
    let raison = '';
    if (!mots.every(m => contient(champs[0][1], m))) {
      const trouve = champs.slice(1).find(([, v]) => mots.some(m => contient(v, m)));
      if (trouve?.[0] === 'adresse') raison = `📍 ${c.adresse}`;
      else if (trouve?.[0] === 'bien') raison = `📍 ${c.bien_actuel_adresse}`;
      else if (trouve?.[0] === 'mail') raison = `✉️ ${(c.emails || []).find((e: string) => mots.some(m => sansAccent(e).includes(m))) || ''}`;
      else if (trouve?.[0] === 'tel') raison = `📞 ${(c.telephones || []).find((t: string) => mots.some(m => chiffres(t).includes(chiffres(m)) && chiffres(m).length > 1)) || ''}`;
    }
    return { genre: 'client', c, raison };
  }).filter(Boolean).slice(0, 8) as any[];
  return clients;
}

/* Sur téléphone, la barre du haut garde l'essentiel : le menu ☰ à gauche, la
   recherche au milieu, la cloche des relances à droite. « Nouveau mail » et
   « Nouveau client » passent dans le tiroir et dans la barre du bas. */
export default function Topbar({ onNavigate, onMenu, menuReduit = false, onBasculerMenu }: {
  onNavigate: (page: string, data?: unknown) => void; onMenu?: () => void;
  /* Ordinateur : réduire le menu de gauche à ses icônes, ou le remettre. */
  menuReduit?: boolean; onBasculerMenu?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [relancesCount, setRelancesCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  /* Comme la barre latérale : on n'annonce que les relances dues, en retard
     ou du jour. Celles à venir attendent sagement dans leur page. */
  useEffect(() => {
    const compter = () => {
      const finDuJour = new Date(); finDuJour.setHours(23, 59, 59, 999);
      supabase.from('relances').select('*', { count: 'exact', head: true })
        .eq('statut', 'en_attente').lte('date_echeance', finDuJour.toISOString())
        .then(({ count }) => setRelancesCount(count || 0));
    };
    compter();
    const revoir = () => { if (!document.hidden) compter(); };
    const minuterie = setInterval(revoir, 20000);
    window.addEventListener(EVT_MAJ, compter);
    window.addEventListener('focus', revoir);
    document.addEventListener('visibilitychange', revoir);
    return () => {
      clearInterval(minuterie);
      window.removeEventListener(EVT_MAJ, compter);
      window.removeEventListener('focus', revoir);
      document.removeEventListener('visibilitychange', revoir);
    };
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

  /* ── La recherche du haut ──
     Avant, elle ne cherchait que dans le prénom, le nom et la référence : une
     adresse, un mail ou un téléphone ne trouvaient rien, et « sylvie truchot »
     non plus (aucune colonne ne contient les deux mots à la fois).

     Elle cherche maintenant dans tout ce qui identifie un contact : son nom,
     son prénom, sa référence, son adresse, celle de son bien actuel s'il est
     propriétaire, ses mails, ses téléphones. Sans accents, mot par mot :
     chaque mot tapé doit se retrouver dans la même fiche.

     Elle ne cherche PAS dans les biens proposés aux clients : une rue comme
     « Longchamp » sortirait des dizaines d'annonces et noierait le contact
     qu'on cherche. Choix d'Alexandre, le 26 septembre.

     Le fichier est petit : on le charge une fois, à la première frappe, puis
     on cherche dans le navigateur. Il se recharge quand un écran signale un
     changement (EVT_MAJ) ou au bout de deux minutes. */
  const index = useRef<{ le: number; clients: any[] } | null>(null);
  const chargement = useRef<Promise<void> | null>(null);
  useEffect(() => {
    const perimer = () => { index.current = null; };
    window.addEventListener(EVT_MAJ, perimer);
    return () => window.removeEventListener(EVT_MAJ, perimer);
  }, []);

  async function chargerIndex() {
    if (index.current && Date.now() - index.current.le < 120_000) return;
    if (chargement.current) return chargement.current;
    chargement.current = (async () => {
      const c = await supabase.from('clients').select('id, prenom, nom, reference, statut, adresse, bien_actuel_adresse, emails, telephones');
      if (c.error) { chargement.current = null; return; }
      index.current = { le: Date.now(), clients: c.data || [] };
      chargement.current = null;
    })();
    return chargement.current;
  }

  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      await chargerIndex();
      const mots = sansAccent(query).split(/[\s,;]+/).filter(Boolean);
      if (!index.current) {
        /* Filet : si le fichier n'a pas pu être chargé, l'ancienne recherche
           (nom, prénom, référence), mot échappé pour ne rien casser. */
        const q = mots.join(' ').replace(/[,()"%*]/g, ' ').trim();
        const { data } = await supabase.from('clients').select('id, prenom, nom, reference, statut')
          .or(`prenom.ilike.%${q}%,nom.ilike.%${q}%,reference.ilike.%${q}%`).limit(8);
        setResults((data || []).map((c: any) => ({ genre: 'client', c })));
      } else {
        setResults(chercher(index.current, mots));
      }
      setOpen(true);
      setLoading(false);
    }, 250);
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
  const lesClients = results.filter(r => r.genre === 'client');

  return (
    <header className={styles.topbar}>
      <button type="button" className={styles.menuBtn} onClick={onMenu} aria-label="Ouvrir le menu">
        <Icone nom="menu" taille={21} epaisseur={2} />
      </button>
      {onBasculerMenu && (
        <button type="button" className={`${styles.menuBureau} ${menuReduit ? styles.menuBureauReduit : ''}`} onClick={onBasculerMenu}
          aria-label={menuReduit ? 'Afficher le menu' : 'Réduire le menu'} title={menuReduit ? 'Afficher le menu' : 'Réduire le menu'} aria-pressed={!menuReduit}>
          <Icone nom="menu" taille={19} epaisseur={2} />
        </button>
      )}
      <div className={styles.searchWrap} ref={ref}>
        <span className={styles.searchIco}>🔍</span>
        <span className={styles.searchPicto}><Icone nom="loupe" taille={17} epaisseur={2} /></span>
        <input
          type="text"
          enterKeyHint="search"
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
                {lesClients.length > 0 && <div className={styles.searchSection}>Clients</div>}
                {lesClients.map(({ c, raison }) => (
                  <div key={c.id} className={styles.searchItem} onClick={() => selectClient(c)}>
                    <div className={styles.searchAv}>{(c.prenom || '?')[0]}{(c.nom || '?')[0]}</div>
                    <div className={styles.searchInfo}>
                      <div className={styles.searchName}>{c.prenom} {c.nom}</div>
                      <div className={styles.searchMeta}>{c.reference}</div>
                      {/* Ce qui a été trouvé, quand ce n'est pas le nom : sur sa
                          propre ligne, pour qu'une adresse se lise en entier. */}
                      {raison && <div className={styles.searchRaison}>{raison}</div>}
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
        <button className={`${styles.alertBtn} pulse`} onClick={() => onNavigate('relances')}
          aria-label={`${relancesCount} relance${relancesCount > 1 ? 's' : ''} à faire`}>
          <span className={styles.alertEmoji}>🔔</span>
          <span className={styles.alertPicto}><Icone nom="cloche" taille={19} epaisseur={2} /></span>
          <span>{relancesCount}<span className={styles.alertMot}>{relancesCount > 1 ? ' relances' : ' relance'}</span></span>
        </button>
      )}
      <button className={`${styles.btn} ${styles.btnBureau}`} onClick={() => onNavigate('mail')}>✉️ Nouveau mail</button>
      {/* Un rendez-vous se note d'ici, sans passer par l'agenda : la même
          fenêtre s'ouvre par-dessus l'écran en cours. */}
      <button className={`${styles.btn} ${styles.btnBureau}`} onClick={demanderNouveauRdv}>📅 Nouveau rendez-vous</button>
      {/* Le bouton créait un client… en affichant la liste des clients. Il
          ouvre maintenant le formulaire, depuis n'importe quel écran. */}
      <button className={`${styles.btn} ${styles.btnDark} ${styles.btnBureau}`}
        onClick={() => { demanderNouveauClient(); onNavigate('clients'); }}>+ Nouveau client</button>
    </header>
  );
}
