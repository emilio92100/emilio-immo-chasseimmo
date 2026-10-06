'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toutLire } from '@/lib/registre';
import type { Client, Relance } from '@/lib/supabase';
import styles from './Dashboard.module.css';
import { demanderNouveauClient, demanderNouveauMail, demanderNouveauRdv, demanderOuvertureFiche, ouvertureDepuisRelance, demanderNouveauBien } from '@/lib/intentions';
import { estAcheteur, estArchive } from '@/lib/contacts';
import { estTri } from '@/lib/relances';
import { jourParis } from '@/lib/mandat';
import { honorairesEncaisses, honorairesPrevus, moisDe, moisCourant, eurosRonds, type Encaisse } from '@/lib/activite';
import { maintenantParis, visitePasseeParis } from '@/lib/visites';

/* Les étapes d'une transaction, dans l'ordre de la fiche client. */
const ETAPES_TX: { cle: string; nom: string }[] = [
  { cle: 'offre', nom: 'Offre' }, { cle: 'negociation', nom: 'Négociation' },
  { cle: 'offre_acceptee', nom: 'Offre acceptée' }, { cle: 'compromis', nom: 'Compromis' }, { cle: 'acte', nom: 'Acte' },
];
type Tx = {
  id: string; client_id: string | null; recherche_id: string | null; bien_id: string | null; etape_actuelle: string;
  prix_final?: number | string | null; offre_montant?: number | string | null; acte_date_prevue?: string | null;
};
type VisiteAVenir = { id: string; client_id: string | null; recherche_id: string | null; date_visite: string; heure: string | null; biens: { titre: string | null; ville: string | null } | null };
type LigneJournal = { id: string; client_id: string | null; recherche_id: string | null; bien_id?: string | null; type: string | null; titre: string | null; created_at: string };

/* Le fil du journal, sans ses doublons : un envoi de biens écrit une ligne
   par bien en plus de la ligne du mail, et le mail de bienvenue est noté par
   le serveur et par la fiche. On garde la ligne qui résume. */
function sansDoublons(l: LigneJournal[]): LigneJournal[] {
  const vus: LigneJournal[] = [];
  for (const j of l) {
    if (j.type === 'envoi_bien' && j.bien_id && /^(Envoyé|Renvoyé) au client · mail/.test(j.titre || '')) continue;
    const t = new Date(j.created_at).getTime();
    if (vus.some(v => v.client_id === j.client_id && (v.titre || '') === (j.titre || '') && Math.abs(new Date(v.created_at).getTime() - t) < 5 * 60000)) continue;
    vus.push(j);
  }
  return vus;
}

const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/* « il y a 5 min », « hier à 14 h 10 », « le 12 sept. » */
function ilYa(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
  /* V3.50 : aujourd'hui et hier à l'heure de Paris. */
  const ecart = Math.round((Date.parse(`${jourParis()}T12:00:00Z`) - Date.parse(`${jourParis(d)}T12:00:00Z`)) / 86400000);
  if (ecart === 0) return `aujourd’hui à ${h}`;
  if (ecart === 1) return `hier à ${h}`;
  return `le ${d.getDate()} ${MOIS_COURT[d.getMonth()]}`;
}

/* La couleur du point, selon ce qui s'est passé. */
function teinteJournal(type: string): string {
  if (/mail|envoi/.test(type)) return '#c9a84c';
  if (/visite|rdv/.test(type)) return '#3b82f6';
  if (/offre|transaction|finalise|mandat/.test(type)) return '#10b981';
  if (/message|rappel/.test(type)) return '#8b5cf6';
  return '#94a3b8';
}

export default function Dashboard({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [relances, setRelances] = useState<Relance[]>([]);
  const [loading, setLoading] = useState(true);
  /* Les quatre chiffres et les trois cartes affichaient des zéros et des
     blocs vides codés en dur (§6.8). Ils lisent maintenant les dossiers. */
  const [chiffres, setChiffres] = useState({ presentes: 0, visitesFaites: 0 });
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [titresBiens, setTitresBiens] = useState<Record<string, string>>({});
  const [aVenir, setAVenir] = useState<VisiteAVenir[]>([]);
  const [activite, setActivite] = useState<LigneJournal[]>([]);
  /* V3.50 : null = le chiffre d'affaires n'a pas pu être lu. Avant, une
     lecture ratée (session expirée) affichait « 0 € » comme si de rien
     n'était. */
  const [encaisse, setEncaisse] = useState<Encaisse[] | null>([]);
  /* Ce qui est attendu : les compromis signés, acte pas encore passé.
     null si la lecture a échoué (la ligne ne s'affiche pas). */
  const [prevu, setPrevu] = useState<Encaisse[] | null>([]);

  async function fetchData() {
    const maintenant = new Date();
    /* V3.50 : « aujourd'hui » à l'heure de Paris, comme partout. */
    const jour = jourParis(maintenant);
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
    const debutMoisJour = jour.slice(0, 8) + '01';
    const [{ data: c }, { data: r }, tx, pres, faites, venir, jr, ca, ap] = await Promise.all([
      /* Tous les contacts, par pages de 1 000 (V3.43 : au-delà, les compteurs étaient faux). */
      toutLire<Client>((de, a) => supabase.from('clients').select('*').order('created_at', { ascending: false }).order('id').range(de, a)),
      supabase.from('relances').select('*').eq('statut', 'en_attente').order('date_echeance', { ascending: true }),
      supabase.from('transactions').select('*').neq('etape_actuelle', 'finalise'),
      /* Les biens déposés dans l'espace d'un client ce mois-ci, par mail ou
         par lien : c'est ce qu'il a reçu, sélection par sélection. */
      supabase.from('biens').select('id', { count: 'exact', head: true }).eq('etape', 'presente').gte('envoye_le', debutMois.toISOString()),
      supabase.from('visites').select('id', { count: 'exact', head: true }).eq('statut', 'effectuee').gte('date_visite', debutMoisJour).lte('date_visite', `${jour}T23:59:59`),
      /* Quelques-unes de plus que les cinq affichées : celles de ce matin
         déjà passées sont retirées juste après. */
      supabase.from('visites').select('id, client_id, recherche_id, date_visite, heure, biens(titre, ville)')
        .eq('statut', 'a_venir').gte('date_visite', jour).order('date_visite').order('heure').limit(12),
      supabase.from('journal').select('id, client_id, recherche_id, bien_id, type, titre, created_at').order('created_at', { ascending: false }).limit(25),
      honorairesEncaisses().catch((e: Error) => { console.error('[tableau de bord] chiffre d’affaires', e?.message); return null; }),
      honorairesPrevus().catch((e: Error) => { console.error('[tableau de bord] honoraires à venir', e?.message); return null; }),
    ]);
    const tous = (c || []) as Client[];
    setClients(tous);
    /* V3.73 : les relances du tri d'après l'import restent dans leur bloc de la page Relances. */
    setRelances(((r || []) as Relance[]).filter(x => !estTri(x.note)));
    setChiffres({ presentes: pres.count || 0, visitesFaites: faites.count || 0 });
    /* V3.50 : sans les transactions d'un client perdu ou archivé : le dossier
       est clos, la transaction ne court plus. Un client « bien trouvé » et
       une recherche à l'arrêt restent : la fiche arrête la veille dès le
       compromis signé, c'est justement là que l'acte se prépare. */
    const clos = new Set(tous.filter(x => x.statut === 'perdu' || estArchive(x)).map(x => x.id));
    const enCours = ((tx.data || []) as Tx[])
      .filter(t => !(t.client_id && clos.has(t.client_id)))
      .sort((a, b) => ETAPES_TX.findIndex(e => e.cle === b.etape_actuelle) - ETAPES_TX.findIndex(e => e.cle === a.etape_actuelle));
    setTransactions(enCours);
    /* V3.50 : une visite de ce matin dont l'heure est passée attend son
       compte rendu, elle n'est plus « à venir » (même règle que le menu et
       la page Visites). */
    const mParis = maintenantParis(maintenant);
    setAVenir(((venir.data || []) as unknown as VisiteAVenir[]).filter(v => !visitePasseeParis(v, mParis)).slice(0, 5));
    setActivite(sansDoublons((jr.data || []) as LigneJournal[]).slice(0, 7));
    setEncaisse(ca);
    setPrevu(ap);
    setLoading(false);
    /* Le bien de chaque transaction, pour dire sur quoi elle porte. */
    const ids = enCours.map(t => t.bien_id).filter((x): x is string => !!x);
    if (ids.length) {
      const { data: bs } = await supabase.from('biens').select('id, titre, ville').in('id', ids);
      setTitresBiens(Object.fromEntries((bs || []).map((b: { id: string; titre: string | null; ville: string | null }) => [b.id, b.titre || b.ville || 'Bien'])));
    }
  }
  useEffect(() => { fetchData(); }, []);

  const nomDe = (id: string | null) => {
    const cl = clients.find(x => x.id === id);
    return cl ? `${cl.prenom} ${cl.nom}`.trim() : 'Client';
  };
  const ouvrir = (clientId: string | null, onglet: 'suivi' | 'visites' | 'transaction', rechercheId?: string | null) => {
    const cl = clients.find(x => x.id === clientId);
    if (!cl) return;
    demanderOuvertureFiche({ clientId: cl.id, onglet, rechercheId: rechercheId || null });
    onNavigate('fiche', cl);
  };
  const mois = moisCourant();
  const caMois = (encaisse || []).filter(e => moisDe(e.quand) === mois);
  const totalMois = caMois.reduce((t, e) => t + e.ht, 0);
  const totalPrevu = (prevu || []).reduce((t, e) => t + e.ht, 0);

  /* Des acheteurs : un notaire ou un vendeur n'est ni actif ni prospect. */
  const actifs    = clients.filter(c => estAcheteur(c) && !estArchive(c) && c.statut === 'actif').length;
  const prospects = clients.filter(c => estAcheteur(c) && c.statut === 'prospect').length;
  const today     = jourParis();

  /* Deux familles, et elles ne veulent pas dire la même chose :
       « à faire »  → l'échéance est arrivée ou dépassée, ça appelle un geste
       « à venir »  → c'est calé pour plus tard, il n'y a rien à faire
     Le compteur rouge ne comptait pas ça : il additionnait tout ce qui était
     en attente en base, donc une relance prévue dans six jours faisait
     clignoter le dashboard pour rien. La barre de gauche et celle du haut,
     elles, n'ont jamais compté que les relances dues. */
  /* V3.50 : le jour d'une échéance se lit à l'heure de Paris. Prise sur
     l'heure UTC enregistrée, une demande arrivée à 0 h 30 tombait la veille :
     « 1j de retard » ici, « Aujourd'hui » dans la page Relances. */
  const jourDe = (r: Relance) => {
    const d = new Date(r.date_echeance);
    return isNaN(d.getTime()) ? String(r.date_echeance || '').slice(0, 10) : jourParis(d);
  };
  const relanceRetard     = relances.filter(r => jourDe(r) < today);
  const relanceAujourdhui = relances.filter(r => jourDe(r) === today);
  /* V3.50 : « à venir », ce sont les trois prochains jours (Alexandre : « J+3
     max »). Au-delà, elles restent dans la page Relances, sans encombrer
     l'accueil. */
  const dansTroisJours = (() => { const x = new Date(`${today}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 3); return x.toISOString().slice(0, 10); })();
  const relanceAvenir     = relances.filter(r => { const j = jourDe(r); return j > today && j <= dansTroisJours; });
  const relancePlusTard   = relances.filter(r => jourDe(r) > dansTroisJours);
  const relanceAfaire     = [...relanceRetard, ...relanceAujourdhui];

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  /* Une ligne de relance. L'étiquette de droite dit toujours la même chose que
     le groupe dans lequel la ligne se trouve : rouge quand c'est dû, ambre
     quand c'est pour plus tard. */
  const LigneRelance = ({ r }: { r: Relance }) => {
    const dateR = jourDe(r);
    const enRetard = dateR < today;
    const cejour = dateR === today;
    const jours = Math.abs(Math.round((new Date(dateR).getTime() - new Date(today).getTime()) / 86400000));
    const cli = clients.find(c => c.id === r.client_id);
    return (
      <div className={styles.listRow} onClick={() => {
        if (!cli) return;
        /* La fiche s'ouvre là où la relance a du sens : Présentés, ou le Suivi
           sur l'action qui l'a créée (voir src/lib/intentions.ts). */
        demanderOuvertureFiche(ouvertureDepuisRelance(r as Relance & { recherche_id?: string | null }));
        onNavigate('fiche', cli);
      }}>
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
                ? <>Rien à relancer aujourd&apos;hui — {relanceAvenir.length} relance{relanceAvenir.length > 1 ? 's' : ''} dans les 3 prochains jours. ☀️</>
                : <>Aucune relance à faire — bonne journée ! ☀️</>
            }
          </p>
        </div>
        <div className={styles.welcomeRight} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className={styles.mailBtn} onClick={demanderNouveauMail}>✉️ <span className={styles.motLong}>Envoyer un mail</span><span className={styles.motCourt}>Mail</span></button>
          <button className={styles.mailBtn} onClick={demanderNouveauRdv}>📅 <span className={styles.motLong}>Nouveau RDV</span><span className={styles.motCourt}>RDV</span></button>
          <button className={styles.mailBtn} onClick={() => { demanderNouveauBien(); onNavigate('biens'); }}>🏡 <span className={styles.motLong}>Nouveau bien</span><span className={styles.motCourt}>Bien</span></button>
          {/* Comme celui de la barre du haut : il ouvre directement le formulaire. */}
          <button className={styles.nouveauBtn} onClick={() => { demanderNouveauClient(); onNavigate('clients'); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#c9a84c', color: 'var(--emilio)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>+ <span className={styles.motLong}>Nouveau contact</span><span className={styles.motCourt}>Contact</span></button>
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
          <div className={styles.statVal}>{chiffres.presentes}</div>
          <div className={styles.statLabel}>Biens présentés ce mois</div>
        </div>

        <div className={styles.statCard} onClick={() => onNavigate('visites')}>
          <div className={styles.statTop}>
            <div className={`${styles.statIcon} ${styles.iconBlue}`}>📅</div>
          </div>
          <div className={styles.statVal}>{chiffres.visitesFaites}</div>
          <div className={styles.statLabel}>Visites faites ce mois</div>
        </div>

        <div className={`${styles.statCard} ${styles.statDark}`} onClick={() => onNavigate('activite')}>
          <div className={styles.statTop}>
            <div className={`${styles.statIcon} ${styles.iconDark}`}>💰</div>
            <span className={`${styles.statBadge} ${styles.badgeGoldDark}`}>HT</span>
          </div>
          {/* V3.50 : une lecture ratée se dit (« — »), au lieu d'un « 0 € »
              qui faisait croire à un mois sans vente. */}
          <div className={`${styles.statVal} ${styles.statValWhite}`}>{encaisse === null ? '—' : eurosRonds(totalMois)}</div>
          <div className={`${styles.statLabel} ${styles.statLabelDark}`}>CA HT du mois en cours</div>
          {encaisse === null
            ? <div className={styles.statSub}>Chiffre d’affaires indisponible : recharge la page</div>
            : caMois.length > 0 && <div className={styles.statSub}>{caMois.length > 1 ? `${caMois.length} actes signés` : '1 acte signé'}</div>}
          {/* Ce qui arrive : les compromis signés, l'acte pas encore passé. */}
          {prevu && prevu.length > 0 && (
            <div className={`${styles.statLabel} ${styles.statLabelDark}`} style={{ marginTop: 4 }}>
              {`À venir : ${eurosRonds(totalPrevu)} HT (${prevu.length > 1 ? `${prevu.length} compromis signés` : '1 compromis signé'})`}
            </div>
          )}
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
                <span className={`${styles.pastille} ${styles.pastilleAmbre}`} title="Dans les 3 prochains jours">{relanceAvenir.length}</span>
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
                    Dans les 3 prochains jours — rien à faire pour l&apos;instant
                  </div>
                  {relanceAvenir.slice(0, relanceAfaire.length > 0 ? 2 : 4).map(r => <LigneRelance key={r.id} r={r} />)}
                </>
              )}
              {relanceAfaire.length === 0 && relanceAvenir.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                  {`✅ Rien à faire ni de prévu dans les 3 prochains jours${relancePlusTard.length ? ` · ${relancePlusTard.length} plus tard, dans « Voir toutes »` : ''}`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* TRANSACTIONS */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>🏠 Transactions en cours
              {transactions.length > 0 && <span className={`${styles.pastille} ${styles.pastilleAmbre}`}>{transactions.length}</span>}
            </div>
          </div>
          {transactions.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
              Aucune transaction en cours
            </div>
          ) : (
            <div className={styles.txList}>
              {transactions.slice(0, 4).map(t => {
                const i = ETAPES_TX.findIndex(e => e.cle === t.etape_actuelle);
                const prix = Number(t.prix_final) || Number(t.offre_montant) || 0;
                const quoi = [(t.bien_id && titresBiens[t.bien_id]) || '', i >= 0 ? ETAPES_TX[i].nom : ''].filter(Boolean).join(' · ');
                return (
                  <div key={t.id} className={styles.txItem} onClick={() => ouvrir(t.client_id, 'transaction', t.recherche_id)}>
                    <div className={styles.txTop}>
                      <span className={styles.txName}>{nomDe(t.client_id)}</span>
                      {prix > 0 && <span className={styles.txPrice}>{eurosRonds(prix)}</span>}
                    </div>
                    <div className={styles.txSub}>{quoi || 'Transaction'}</div>
                    <div className={styles.progBar}>
                      {ETAPES_TX.map((e, k) => <div key={e.cle} className={`${styles.progStep} ${k < i ? styles.done : k === i ? styles.active : ''}`} />)}
                    </div>
                    {t.acte_date_prevue && <div className={styles.txHint}>{`Acte prévu le ${new Date(`${String(t.acte_date_prevue).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR')}`}</div>}
                  </div>
                );
              })}
              {transactions.length > 4 && <div className={styles.txHint} style={{ textAlign: 'center' }}>{`Et ${transactions.length - 4} autre${transactions.length - 4 > 1 ? 's' : ''}, sur la fiche de chaque client.`}</div>}
            </div>
          )}
        </div>

        {/* RIGHT COL */}
        <div className={styles.rightCol}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>📅 Visites à venir</div>
              <button className={styles.cardLink} onClick={() => onNavigate('visites')}>Tout →</button>
            </div>
            {aVenir.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                Aucune visite planifiée
              </div>
            ) : (
              <div className={styles.visiteList}>
                {aVenir.map((v, k) => {
                  const d = new Date(`${String(v.date_visite).slice(0, 10)}T12:00:00`);
                  const lieu = v.biens?.titre || v.biens?.ville || '';
                  return (
                    <div key={v.id} className={styles.visiteRow} onClick={() => ouvrir(v.client_id, 'visites', v.recherche_id)}>
                      <div className={`${styles.vdate} ${k === 0 ? styles.vdateDark : styles.vdateLight}`}>
                        <div className={styles.vday}>{d.getDate()}</div>
                        <div className={styles.vmon}>{MOIS_COURT[d.getMonth()]}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className={styles.vname}>{nomDe(v.client_id)}</div>
                        {lieu && <div className={styles.vlieu} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lieu}</div>}
                      </div>
                      {v.heure && <div className={styles.vheure}>{String(v.heure).slice(0, 5).replace(':', ' h ')}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={styles.card} style={{ flex: 1 }}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>🕐 Activité récente</div>
            </div>
            {activite.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                {clients.length === 0
                  ? 'Créez votre premier client pour commencer'
                  : 'Aucune activité récente'
                }
              </div>
            ) : (
              <div className={styles.actList}>
                {activite.map(j => (
                  <div key={j.id} className={styles.actRow} style={{ cursor: 'pointer' }} onClick={() => ouvrir(j.client_id, 'suivi', j.recherche_id)}>
                    <span className={styles.actDot} style={{ background: teinteJournal(String(j.type || '')) }} />
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.actText}><strong>{nomDe(j.client_id)}</strong>{` · ${j.titre || ''}`}</div>
                      <div className={styles.actTime}>{ilYa(j.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {clients.length === 0 && (
            <div style={{ background: 'var(--emilio-fond)', borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>🚀 Pour commencer</div>
              <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 13, color: 'white', marginBottom: 4 }}>Créez votre premier contact</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Ajoutez vos acheteurs et commencez la chasse !</div>
              <button
                onClick={() => onNavigate('clients')}
                style={{ width: '100%', background: '#c9a84c', color: 'var(--emilio)', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
              >
                + Nouveau contact
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
