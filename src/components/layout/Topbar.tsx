'use client';
import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import AvatarContact, { teinteDe } from '@/components/contacts/AvatarContact';
import { supabase } from '@/lib/supabase';
import { toutLire } from '@/lib/registre';
import styles from './Topbar.module.css';
import { EVT_MAJ, demanderNouveauClient, demanderNouveauRdv } from '@/lib/intentions';
import { compterRelancesDues } from '@/lib/relances';
import { Icone } from '@/components/fiche/ParcoursBien';
import { estAcheteur, lirePro, lireStructure, typeDe, typesDe } from '@/lib/contacts';
import { conjointDe } from '@/lib/foyer';
import { etapeDe, titreBien, villeAffichee, type Donnees } from '@/lib/biens-vente';
import { euros } from '@/lib/mandat';
import { Ic } from '@/components/documents/ApercuActe';

/* V3.86 — Ses biens, sous son nom, dans les résultats (Alexandre : « quand je
   cherche un nom en haut, s'il a des biens, que je puisse cliquer directement
   sur le bien ; aujourd'hui je clique sur le client, puis sur l'appartement »).
   Les biens de la rubrique Biens (pas archivés), lus avec le fichier des
   contacts ; trois au plus sous chaque contact. */
type BienRecherche = { id: string; client_id: string | null; etape: string; archive: boolean | null; titre: string | null; type_bien: string | null; ville: string | null; code_postal: string | null; surface: number | null; nb_pieces: number | null; prix: number | null; photo: string | null };
const BIENS_MAX = 3;
const titreDe = (b: BienRecherche) => b.titre || titreBien({ typeBien: b.type_bien || undefined, pieces: b.nb_pieces ?? undefined, surface: b.surface ?? undefined } as unknown as Donnees) || 'Son bien';

/* Minuscules, sans accents ni ponctuation : « Rue de l'Église » → « rue de l eglise ». */
function sansAccent(t: string) {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9@.+]+/g, ' ').trim();
}
const chiffres = (t: string) => t.replace(/\D/g, '');

/* V3.80 : dans les résultats, les lettres tapées ressortent en gras
   (« dup » → <b>Dup</b>ont), accents et majuscules ignorés. */
function Surligne({ texte, mots }: { texte: string; mots: string[] }) {
  const lettres = Array.from(texte);
  const plie = lettres.map(ch => ch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const plat = plie.join('');
  if (plat.length !== lettres.length || !mots.length) return <>{texte}</>;
  const on = new Array<boolean>(lettres.length).fill(false);
  for (const m of mots) {
    if (m.length < 2) continue;
    let i = plat.indexOf(m);
    while (i >= 0) { for (let k = i; k < i + m.length; k++) on[k] = true; i = plat.indexOf(m, i + m.length); }
  }
  const morceaux: { t: string; on: boolean }[] = [];
  lettres.forEach((ch, i) => {
    const der = morceaux[morceaux.length - 1];
    if (der && der.on === on[i]) der.t += ch; else morceaux.push({ t: ch, on: on[i] });
  });
  return <>{morceaux.map((x, i) => (x.on ? <b key={i} className={styles.searchTrouve}>{x.t}</b> : <span key={i}>{x.t}</span>))}</>;
}

/* Chaque mot doit se trouver dans la fiche du client. Un mot fait de chiffres
   se cherche aussi dans les téléphones sans espaces (« 06 10 26 » trouve
   0610261657). On dit à côté du nom ce qui a été trouvé, quand ce n'est pas
   le nom lui-même : l'adresse, le bien actuel, le mail, le téléphone. */
function chercher(ix: { clients: any[] }, mots: string[]) {
  if (!mots.length) return [];
  const contient = (champ: string, m: string) => champ.includes(m) || (/^\d{2,}$/.test(m) && chiffres(champ).includes(m));
  const clients = ix.clients.map((c: any) => {
    /* V3.50 : comme la page Contacts, on cherche aussi la personne 2 d'un
       couple (son nom, son mail, son téléphone) et ce qui est propre au
       métier : l'étude d'un notaire, l'agence d'un confrère, la société… */
    const j = c.couple ? conjointDe(c.conjoint) : null;
    const p = lirePro(c.pro);
    const mails: string[] = [...(c.emails || []), j?.email].filter(Boolean);
    const tels: string[] = [...(c.telephones || []), j?.telephone].filter(Boolean);
    const metier = [p.etude, p.agence, p.reseau, p.societe, p.metier, p.immeuble, lireStructure(p.structure)?.denomination].filter((x): x is string => typeof x === 'string' && !!x.trim());
    const champs: [string, string][] = [
      ['nom', sansAccent(`${c.prenom || ''} ${c.nom || ''} ${c.reference || ''}`)],
      ['conjoint', sansAccent(j ? `${j.prenom || ''} ${j.nom || ''}` : '')],
      ['pro', sansAccent(metier.join(' '))],
      ['adresse', sansAccent(c.adresse || '')],
      ['bien', sansAccent(c.bien_actuel_adresse || '')],
      ['mail', sansAccent(mails.join(' '))],
      ['tel', tels.join(' ')],
    ];
    const tout = champs.map(x => x[1]).join(' ');
    if (!mots.every(m => contient(tout, m))) return null;
    let raison = '';
    if (!mots.every(m => contient(champs[0][1], m))) {
      const trouve = champs.slice(1).find(([, v]) => mots.some(m => contient(v, m)));
      if (trouve?.[0] === 'conjoint') raison = `👥 ${`${j?.prenom || ''} ${j?.nom || ''}`.trim()}`;
      else if (trouve?.[0] === 'pro') raison = `🏢 ${metier.find(x => mots.some(m => contient(sansAccent(x), m))) || metier[0] || ''}`;
      else if (trouve?.[0] === 'adresse') raison = `📍 ${c.adresse}`;
      else if (trouve?.[0] === 'bien') raison = `📍 ${c.bien_actuel_adresse}`;
      else if (trouve?.[0] === 'mail') raison = `✉️ ${mails.find((e: string) => mots.some(m => sansAccent(e).includes(m))) || ''}`;
      else if (trouve?.[0] === 'tel') raison = `📞 ${tels.find((t: string) => mots.some(m => chiffres(t).includes(chiffres(m)) && chiffres(m).length > 1)) || ''}`;
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
  /* La recherche dont les résultats sont affichés (V3.80) : tant que ce
     qui est tapé n'est pas encore cherché, la petite roue tourne. */
  const [cherchee, setCherchee] = useState('');
  const [open, setOpen] = useState(false);
  const [relancesCount, setRelancesCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);

  /* V3.50 : le « ⌘K » affiché ne faisait rien. Cmd+K (Mac) ou Ctrl+K
     (Windows) met maintenant le curseur dans la recherche, de n'importe quel
     écran. Le rappel dit la bonne touche selon l'ordinateur. */
  const raccourci = useSyncExternalStore(() => () => {}, () => (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K'), () => '⌘K');
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      /* Déjà pris ailleurs (Ctrl + K = « Ajouter un lien » dans Nouveau mail). */
      if (e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        champ.current?.focus();
        champ.current?.select();
      }
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, []);

  /* Comme la barre latérale : on n'annonce que les relances dues, en retard
     ou du jour. Celles à venir attendent sagement dans leur page. */
  useEffect(() => {
    /* V3.73 : sans les relances du tri d'après l'import (compterRelancesDues). */
    const compter = () => { compterRelancesDues().then(setRelancesCount).catch(() => {}); };
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
  const index = useRef<{ le: number; clients: any[]; biens: Record<string, BienRecherche[]> } | null>(null);
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
      /* Avec les types de contact (V3.14) ; avant leur SQL, sans eux. */
      /* Par pages de 1 000 (V3.43) : au-delà, Supabase s'arrête sans rien dire,
         et la recherche ne trouvait plus les derniers contacts. */
      const lire = (cols: string) => toutLire<Record<string, unknown>>((de, a) => supabase.from('clients').select(cols).order('id').range(de, a));
      let c = await lire('id, prenom, nom, reference, statut, adresse, bien_actuel_adresse, emails, telephones, types, pro, civilite, couple, conjoint');
      if (c.erreur) c = await lire('id, prenom, nom, reference, statut, adresse, bien_actuel_adresse, emails, telephones');
      if (c.erreur) { chargement.current = null; return; }
      /* Les biens (V3.86) : s'ils ne se lisent pas, la recherche des contacts marche quand même. */
      const b = await toutLire<BienRecherche>((de, a) => supabase.from('biens_vente').select('id, client_id, etape, archive, titre, type_bien, ville, code_postal, surface, nb_pieces, prix, photo').order('id').range(de, a));
      const biens: Record<string, BienRecherche[]> = {};
      for (const x of b.erreur ? [] : b.data || []) {
        if (!x.client_id || x.archive) continue;
        (biens[x.client_id] ||= []).push(x);
      }
      index.current = { le: Date.now(), clients: c.data || [], biens };
      chargement.current = null;
    })();
    return chargement.current;
  }

  useEffect(() => {
    if (!query.trim()) { setResults([]); setCherchee(''); setOpen(false); return; }
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
      setCherchee(query);
      setOpen(true);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  /* « offre_ecrite » est un ancien statut (§6.16) : encore présent sur des
     fiches, il n'avait ni couleur ni libellé ici, et la pastille s'affichait
     sans fond, avec « offre_ecrite » écrit tel quel. */
  const statutColor: Record<string, string> = {
    prospect: '#8b5cf6', actif: '#10b981', suspendu: '#f59e0b',
    bien_trouve: '#3b82f6', perdu: '#ef4444', offre_ecrite: '#f59e0b',
  };
  const STATUT_LIB: Record<string, string> = {
    prospect: '🟣 prospect', actif: '🟢 actif', suspendu: '⏸️ suspendu',
    bien_trouve: '✅ bien trouvé', perdu: '🔴 perdu', offre_ecrite: '✍️ offre écrite',
  };

  function selectClient(client: any) {
    setQuery('');
    setCherchee('');
    setResults([]);
    setOpen(false);
    onNavigate('fiche', client);
  }
  function selectBien(id: string) {
    setQuery('');
    setCherchee('');
    setResults([]);
    setOpen(false);
    onNavigate('biens', { bien: id });
  }
  const lesClients = results.filter(r => r.genre === 'client');
  const attente = !!query.trim() && (loading || cherchee !== query);
  const motsTapes = sansAccent(cherchee).split(/[\s,;]+/).filter(Boolean);

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
      <div className={`${styles.searchWrap} ${attente ? styles.searchAttente : ''}`} ref={ref}>
        <span className={styles.searchIco}>🔍</span>
        <span className={styles.searchPicto}><Icone nom="loupe" taille={17} epaisseur={2} /></span>
        {/* V3.80 (Alexandre : « un petit système de loading ») : la roue
            remplace la loupe le temps de chercher. */}
        <span className={styles.searchRoue} aria-hidden="true" />
        <input
          ref={champ}
          type="text"
          enterKeyHint="search"
          placeholder="Rechercher un contact, référence EMI..."
          className={styles.searchInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
        />
        {query && <button onClick={() => { setQuery(''); setResults([]); setCherchee(''); setOpen(false); }} className={styles.clearBtn} aria-label="Effacer la recherche">✕</button>}
        {!query && <span className={styles.searchHint} title={`${raccourci === '⌘K' ? 'Cmd' : 'Ctrl'} + K pour chercher depuis n’importe quel écran`}>{raccourci}</span>}

        {/* DROPDOWN RÉSULTATS */}
        {/* La liste s'ouvre en douceur ; pendant une nouvelle recherche, les
            résultats d'avant pâlissent au lieu de disparaître, puis les
            nouveaux arrivent l'un après l'autre (V3.80). */}
        {(open || (attente && !results.length && query.trim().length > 1)) && (
          <div className={`${styles.searchDropdown} ${attente && results.length ? styles.searchPale : ''}`}>
            {attente && !results.length ? (
              <div className={styles.searchSquelette} aria-busy="true" aria-label="Recherche en cours">
                {[0, 1, 2].map(i => (
                  <div key={i} className={styles.searchSqL} style={{ animationDelay: `${i * 50}ms` }}>
                    <span className="sq-rond" style={{ width: 36, height: 36, borderRadius: 10 }} />
                    <span className="sq-txt"><span className="sq-barre" style={{ width: `${46 - i * 8}%` }} /><span className="sq-barre sq-fine" style={{ width: '28%' }} /></span>
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className={`${styles.searchEmpty} ${styles.searchApparait}`}>{`Aucun contact ne correspond à « ${cherchee.trim()} ».`}</div>
            ) : (
              <div key={cherchee} className={styles.searchListe}>
                {lesClients.length > 0 && <div className={styles.searchSection}>{`Contacts · ${lesClients.length}`}</div>}
                {lesClients.map(({ c, raison }, i) => {
                  const sesBiens = index.current?.biens[c.id] || [];
                  return (
                  <div key={c.id} className={styles.searchBloc}>
                  <div className={styles.searchItem} onClick={() => selectClient(c)} style={{ animationDelay: `${Math.min(i, 8) * 28}ms` }}>
                    <AvatarContact c={c} teinte={teinteDe(c)} className={styles.searchAv} libre />
                    <div className={styles.searchInfo}>
                      <div className={styles.searchName}><Surligne texte={`${c.prenom || ''} ${c.nom || ''}`.trim()} mots={motsTapes} /></div>
                      <div className={styles.searchMeta}>{c.reference}</div>
                      {/* Ce qui a été trouvé, quand ce n'est pas le nom : sur sa
                          propre ligne, pour qu'une adresse se lise en entier. */}
                      {raison && <div className={styles.searchRaison}>{raison}</div>}
                    </div>
                    {estAcheteur(c) ? (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${statutColor[c.statut] || '#94a3b8'}15`, color: statutColor[c.statut] || '#64748b', fontWeight: 600, border: `1px solid ${statutColor[c.statut] || '#94a3b8'}30`, whiteSpace: 'nowrap' }}>
                        {STATUT_LIB[c.statut] || c.statut}
                      </span>
                    ) : (
                      /* Un vendeur, un notaire… : son type, pas un statut d'acheteur. */
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: typeDe(typesDe(c)[0]).fond, color: typeDe(typesDe(c)[0]).c, fontWeight: 700 }}>
                        {typeDe(typesDe(c)[0]).lib}
                      </span>
                    )}
                  </div>
                  {sesBiens.length > 0 && (
                    <div className={styles.searchBiens} style={{ animationDelay: `${Math.min(i, 8) * 28 + 40}ms` }}>
                      {sesBiens.slice(0, BIENS_MAX).map(b => {
                        const e = etapeDe(b.etape);
                        const lieu = villeAffichee(b.ville, b.code_postal);
                        return (
                          <button key={b.id} type="button" className={styles.searchBien} onClick={() => selectBien(b.id)} title="Ouvrir la fiche du bien">
                            <span className={styles.searchBienPh}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {b.photo ? <img src={b.photo} alt="" /> : <Ic n="maison" t={14} />}
                            </span>
                            <span className={styles.searchBienTx}>
                              <b>{titreDe(b)}</b>
                              <small><i style={{ background: e.c }} /><span>{[e.lib, lieu, b.prix ? euros(b.prix) : ''].filter(Boolean).join(' · ')}</span></small>
                            </span>
                            <span className={styles.searchBienVa}><Ic n="droite" t={13} e={2.3} /></span>
                          </button>
                        );
                      })}
                      {sesBiens.length > BIENS_MAX && (
                        <button type="button" className={styles.searchBienPlus} onClick={() => selectClient(c)}>{`+ ${sesBiens.length - BIENS_MAX} autre${sesBiens.length - BIENS_MAX > 1 ? 's' : ''} : voir sa fiche`}</button>
                      )}
                    </div>
                  )}
                  </div>
                  );
                })}
              </div>
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
        onClick={() => { demanderNouveauClient(); onNavigate('clients'); }}>+ Nouveau contact</button>
    </header>
  );
}
