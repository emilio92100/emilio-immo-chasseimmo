'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AvatarContact from '@/components/contacts/AvatarContact';
import { supabase } from '@/lib/supabase';
import { avantMandat, etapeDe, type BienVente } from '@/lib/biens-vente';
import { adresseVente } from '@/lib/adresse-vente';
import { poserVisites } from '@/lib/planifier-visite';
import { signalerMaj } from '@/lib/intentions';
import { lireClients } from '@/components/biens/ChampsBien';
import { creneauxPris, nomClient, visiteAcheteur, visiteExterne, type ClientMini, type CreneauPris } from '@/components/biens/outils';
import { ChoixQuand } from './PageAgenda';
import o from './OrganiserVisite.module.css';

/* ═══ « Organiser une visite », depuis la page Visites (V3.146) ═══════════
   Alexandre : « un bouton dans la partie bleue… je souhaite organiser une
   visite ; ça me demande le nom de la personne, ou si elle est hors CRM, et
   de choisir un bien par le nom du propriétaire ou par le prix ». Une seule
   fenêtre, en trois temps : qui visite, quel bien, quand.

   Les écritures sont celles qui existent déjà, rien de neuf :
   - un bien de l'agence avec un acheteur suivi : visiteAcheteur (le bien
     entre dans son dossier, la visite va dans `visites`, son Suivi la note) ;
   - un bien de l'agence avec quelqu'un hors du CRM : visiteExterne (une ligne
     dans le suivi du bien, le rendez-vous dans l'agenda) ;
   - un bien trouvé ailleurs, déjà dans le dossier de l'acheteur :
     poserVisites, comme la fiche du client.
   Un bien « À suivre » ou « En estimation » se visite aussi (Alexandre :
   « laisser le choix ») ; vendu, retiré, en pause ou archivé, il n'est pas
   proposé. Sous compromis : seulement pour une offre de secours, on le
   demande. */

type Recherche = { id: string; client_id: string; nom: string | null; active: boolean | null; created_at: string | null };
type BienAgence = {
  id: string; titre: string | null; adresse: string | null; code_postal: string | null; ville: string | null; prix: number | null;
  reference: string | null; etape: string; photo: string | null; client_id: string | null; proprietaires?: unknown;
};
type BienDossier = {
  id: string; titre: string | null; ville: string | null; quartier: string | null; adresse: string | null; photos: string[] | null;
  etape: string | null; agence_nom: string | null; prix_acquereur: number | null; prix_vendeur: number | null; bien_vente_id: string | null;
};
/* Un bien proposé : de l'agence, ou du dossier de l'acheteur. */
type Choix = { cle: string; genre: 'agence'; b: BienAgence } | { cle: string; genre: 'dossier'; b: BienDossier };

const ETAPES_VISITABLES = ['a_suivre', 'estimation', 'mandat', 'offre', 'compromis'];
const DUREES = [{ v: 30, lib: '30 min' }, { v: 45, lib: '45 min' }, { v: 60, lib: '1 h' }, { v: 90, lib: '1 h 30' }];
const sansAccent = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const chiffres = (t: string) => t.replace(/\D/g, '');
/* Les montants en entier, comme partout dans le CRM : « 1 500 000 € ». */
const prixEnEntier = (n: number | null | undefined) => (n ? `${Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, '\u00a0')}\u00a0€` : '');
const aujourdhui = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const heureMaintenant = () => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
/* « 18 h », « 18 h 30 ». */
const hFr = (d: Date) => `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`.replace(' h 00', ' h');
/* L'heure pleine suivante, entre 9 h et 19 h. */
const heureProposee = () => {
  const h = Number(heureMaintenant().slice(0, 2)) + 1;
  return `${String(Math.min(19, Math.max(9, h))).padStart(2, '0')}:00`;
};

/* « 649 », « 649 000 », « Durand », « Sygrie », « EMI-V-2026-329 » : chaque
   mot doit se trouver quelque part ; un nombre d'au moins trois chiffres se
   cherche aussi dans le prix (même règle que l'agenda). */
function trouve(champs: (string | null | undefined)[], prix: number | null | undefined, q: string): boolean {
  const t = sansAccent(q.trim());
  if (t.length < 2) return false;
  const texte = sansAccent(champs.filter(Boolean).join(' '));
  if (t.split(/\s+/).filter(Boolean).every(m => texte.includes(m))) return true;
  const c = chiffres(q);
  return c.length >= 3 && !!prix && String(Math.round(prix)).includes(c);
}

function Ico({ n, t = 16 }: { n: string; t?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      {n === 'cal' && <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M12 13.5v4M10 15.5h4" /></>}
      {n === 'croix' && <path d="M6 6l12 12M18 6 6 18" />}
      {n === 'loupe' && <><circle cx="10.8" cy="10.8" r="7" /><path d="m20.5 20.5-4.7-4.7" /></>}
      {n === 'maison' && <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>}
      {n === 'personne' && <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>}
      {n === 'check' && <path d="M5 12.5l4.2 4.2L19 7" />}
      {n === 'info' && <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.6v.4" /></>}
      {n === 'horloge' && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
      {n === 'tel' && <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />}
      {n === 'pin' && <><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>}
    </svg>
  );
}

/* Une étape de la fenêtre : son numéro (une coche quand elle est remplie). */
function Etape({ n, titre, fait, children }: { n: number; titre: string; fait: boolean; children: React.ReactNode }) {
  return (
    <section className={o.etape} data-fait={fait ? 'oui' : 'non'} style={{ animationDelay: `${60 + n * 70}ms` }}>
      <div className={o.etapeT}>
        <span className={o.num} aria-hidden="true">{fait ? <Ico n="check" t={14} /> : n}</span>
        <h3>{titre}</h3>
      </div>
      {children}
    </section>
  );
}

export default function OrganiserVisite({ onFermer, onFait }: { onFermer: () => void; onFait: (texte: string, passee: boolean) => void }) {
  /* ── Qui visite ── */
  const [mode, setMode] = useState<'crm' | 'libre'>('crm');
  const [clients, setClients] = useState<ClientMini[] | null>(null);
  const [recherches, setRecherches] = useState<Recherche[]>([]);
  const [qClient, setQClient] = useState('');
  const [client, setClient] = useState<ClientMini | null>(null);
  const [rechercheId, setRechercheId] = useState('');
  const [libreNom, setLibreNom] = useState('');
  const [libreTel, setLibreTel] = useState('');
  /* ── Quel bien ── */
  const [agence, setAgence] = useState<BienAgence[] | null>(null);
  const [dossier, setDossier] = useState<BienDossier[]>([]);
  const [qBien, setQBien] = useState('');
  const [bien, setBien] = useState<Choix | null>(null);
  /* ── Quand ── */
  const [date, setDate] = useState(aujourdhui());
  const [heure, setHeure] = useState(heureProposee());
  const [duree, setDuree] = useState(45);
  const [note, setNote] = useState('');
  const [pris, setPris] = useState<CreneauPris[]>([]);
  /* ── La fenêtre ── */
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [fini, setFini] = useState('');
  const [sortie, setSortie] = useState(false);
  const corps = useRef<HTMLDivElement | null>(null);

  /* Fermer en douceur : la fenêtre redescend, puis disparaît. */
  const fermer = () => {
    if (envoi || sortie) return;
    setSortie(true);
    window.setTimeout(onFermer, 190);
  };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  });
  /* La page derrière ne défile plus tant que la fenêtre est ouverte. */
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = avant; };
  }, []);

  /* Tout ce qu'il faut, lu une fois à l'ouverture. Une lecture qui échoue le
     dit, sans fermer la fenêtre. */
  useEffect(() => {
    let vivant = true;
    lireClients().then(l => { if (vivant) setClients(l); }).catch(e => { if (vivant) { setClients([]); setErreur((e as Error).message); } });
    supabase.from('recherches').select('id, client_id, nom, active, created_at').order('created_at', { ascending: false }).limit(5000)
      .then(({ data, error }) => { if (vivant && !error) setRecherches((data || []) as Recherche[]); });
    (async () => {
      const { data, error } = await supabase.from('biens_vente')
        .select('id, titre, adresse, code_postal, ville, prix, reference, etape, photo, client_id, archive, proprietaires:donnees->proprietaires')
        .in('etape', ETAPES_VISITABLES).eq('archive', false).order('updated_at', { ascending: false }).limit(1000);
      if (!vivant) return;
      if (error) { setAgence([]); setErreur('Les biens de l’agence n’ont pas pu être lus : ' + error.message); return; }
      setAgence((data || []) as unknown as BienAgence[]);
    })();
    return () => { vivant = false; };
  }, []);

  /* Les biens du dossier de l'acheteur choisi (sélection et présentés),
     ceux trouvés ailleurs : un bien de l'agence y est déjà par la liste de
     l'agence. */
  useEffect(() => {
    setDossier([]);
    if (mode !== 'crm' || !rechercheId) return;
    let vivant = true;
    supabase.from('biens').select('id, titre, ville, quartier, adresse, photos, etape, agence_nom, prix_acquereur, prix_vendeur, bien_vente_id')
      .eq('recherche_id', rechercheId).in('etape', ['selection', 'presente'])
      .then(({ data }) => { if (vivant) setDossier(((data || []) as BienDossier[]).filter(b => !b.bien_vente_id)); });
    return () => { vivant = false; };
  }, [mode, rechercheId]);

  /* Le créneau déjà pris : un avertissement, jamais un refus. */
  useEffect(() => {
    let vivant = true;
    const t = window.setTimeout(() => {
      creneauxPris(date, heure, duree).then(l => { if (vivant) setPris(l); }).catch(() => { if (vivant) setPris([]); });
    }, 300);
    return () => { vivant = false; window.clearTimeout(t); };
  }, [date, heure, duree]);

  const nomsClients = useMemo(() => Object.fromEntries((clients || []).map(c => [c.id, nomClient(c)])), [clients]);
  const recherchesDe = (id: string) => {
    const l = recherches.filter(r => r.client_id === id);
    return [...l.filter(r => r.active !== false), ...l.filter(r => r.active === false)];
  };

  /* Les clients trouvés : par le nom, le prénom ou le téléphone. */
  const clientsTrouves = useMemo(() => {
    const t = sansAccent(qClient.trim());
    if (t.length < 2 || !clients) return [];
    const tel = chiffres(qClient);
    return clients.filter(c => {
      if (sansAccent(`${c.prenom || ''} ${c.nom || ''} ${c.nom || ''} ${c.prenom || ''}`).includes(t)) return true;
      return tel.length >= 4 && (c.telephones || []).some(x => chiffres(String(x || '')).includes(tel));
    }).slice(0, 6);
  }, [qClient, clients]);

  const proprioDe = (b: BienAgence) => {
    if (b.client_id && nomsClients[b.client_id]) return nomsClients[b.client_id];
    const p0 = Array.isArray(b.proprietaires) ? (b.proprietaires[0] as { prenom?: string; nom?: string } | undefined) : undefined;
    return `${p0?.prenom || ''} ${p0?.nom || ''}`.trim();
  };

  /* Les biens trouvés. Sans rien taper : ceux de son dossier, puis les biens
     en vente les plus récents — de quoi choisir sans chercher. */
  const biensTrouves: Choix[] = useMemo(() => {
    const t = qBien.trim();
    const deLAgence = (agence || []).filter(b => t.length >= 2
      ? trouve([b.titre, b.adresse, b.code_postal, b.ville, b.reference, proprioDe(b)], b.prix, t)
      : b.etape === 'mandat');
    const duDossier = dossier.filter(b => t.length >= 2
      ? trouve([b.titre, b.ville, b.quartier, b.adresse, b.agence_nom], b.prix_acquereur || b.prix_vendeur, t)
      : true);
    return [
      ...duDossier.map(b => ({ cle: 'd-' + b.id, genre: 'dossier' as const, b })),
      ...deLAgence.map(b => ({ cle: 'a-' + b.id, genre: 'agence' as const, b })),
    ].slice(0, t.length >= 2 ? 8 : 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qBien, agence, dossier, nomsClients]);

  const rechClient = client ? recherchesDe(client.id) : [];
  const quiOk = mode === 'crm' ? !!client && !!rechercheId : !!libreNom.trim();
  const passe = !!date && (date < aujourdhui() || (date === aujourdhui() && heure.slice(0, 5) < heureMaintenant()));
  const pret = quiOk && !!bien && !!date && !!heure && !envoi;
  const nomVisiteur = mode === 'crm' ? (client ? nomClient(client) : '') : libreNom.trim();

  function choisirClient(c: ClientMini) {
    setClient(c); setErreur('');
    const r = recherchesDe(c.id);
    setRechercheId(r[0]?.id || '');
    /* Un bien du dossier d'un autre ne reste pas choisi. */
    if (bien?.genre === 'dossier') setBien(null);
  }
  function changerMode(m: 'crm' | 'libre') {
    if (m === mode) return;
    setMode(m); setErreur('');
    if (bien?.genre === 'dossier') setBien(null);
  }

  async function enregistrer() {
    if (!pret || !bien) return;
    if (mode === 'crm' && client && !rechercheId) { setErreur(`${nomClient(client)} n’a pas de recherche : note la visite « hors du CRM », ou ouvre-lui une recherche depuis sa fiche.`); return; }
    if (bien.genre === 'agence' && bien.b.etape === 'compromis'
      && !window.confirm(`« ${bien.b.titre || bien.b.ville || 'Ce bien'} » est sous compromis : la visite ne sert qu’à une offre de secours.\n\nLa planifier quand même ?`)) return;
    setEnvoi(true); setErreur('');
    const creneau = { date, heure, duree, commentaire: note.trim() };
    try {
      if (bien.genre === 'agence') {
        const { data, error } = await supabase.from('biens_vente').select('*').eq('id', bien.b.id).maybeSingle();
        if (error || !data) throw new Error('Le bien n’a pas pu être relu' + (error ? ` : ${error.message}` : '.'));
        const bv = data as BienVente;
        if (mode === 'crm' && client) await visiteAcheteur(bv, client.id, rechercheId, creneau);
        else await visiteExterne(bv, libreNom.trim(), libreTel.trim(), creneau, true);
      } else if (client) {
        const ok = await poserVisites({
          clientId: client.id, rechercheId, biens: [{ id: bien.b.id, titre: bien.b.titre, ville: bien.b.ville, bien_vente_id: null }],
          revus: [], date, heure, contact: bien.b.agence_nom || '', notes: note.trim(), duree,
        });
        if (!ok) { setEnvoi(false); return; }
      }
      signalerMaj();
      const quand = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      const texte = `Visite planifiée avec ${nomVisiteur} ${quand} à ${heure.replace(':', ' h ').replace(/ h 00$/, ' h')}.`;
      setFini(texte);
      corps.current?.scrollTo({ top: 0 });
      window.setTimeout(() => onFait(texte, passe), 1500);
    } catch (e) {
      setErreur((e as Error).message);
      setEnvoi(false);
    }
  }

  if (typeof document === 'undefined') return null;
  const titreBien = (c: Choix) => (c.genre === 'agence' ? c.b.titre || c.b.ville : c.b.titre || c.b.ville) || 'Bien';
  const photoBien = (c: Choix) => (c.genre === 'agence' ? c.b.photo : c.b.photos?.[0]) || null;
  const sousBien = (c: Choix) => {
    if (c.genre === 'agence') {
      const p = proprioDe(c.b);
      const prix = c.b.prix ? `${avantMandat(c.b.etape) ? 'prix conseillé ' : ''}${prixEnEntier(c.b.prix)}` : '';
      return [prix, p ? `Propriétaire : ${p}` : '', adresseVente(c.b)].filter(Boolean).join(' · ');
    }
    return [prixEnEntier(c.b.prix_acquereur || c.b.prix_vendeur), [c.b.quartier, c.b.ville].filter(Boolean).join(', '), c.b.agence_nom || ''].filter(Boolean).join(' · ');
  };
  const pastille = (c: Choix) => {
    if (c.genre === 'dossier') return { lib: c.b.etape === 'presente' ? 'Dans son dossier' : 'En sélection', c: '#2563eb' };
    const e = etapeDe(c.b.etape);
    return { lib: e.court, c: e.c };
  };
  const vignette = (c: Choix, grand?: boolean) => {
    const ph = photoBien(c);
    return ph
      ? <img src={ph} alt="" className={`${o.photo} ${grand ? o.photoG : ''}`} onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
      : <span className={`${o.photo} ${grand ? o.photoG : ''} ${o.photoVide}`}><Ico n="maison" t={grand ? 22 : 18} /></span>;
  };

  return createPortal(
    <div className={`${o.voile} ${sortie ? o.sort : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) fermer(); }}>
      <div className={o.fenetre} role="dialog" aria-modal="true" aria-label="Organiser une visite">
        <header className={o.tete}>
          <span className={o.lueur} aria-hidden="true" />
          <span className={o.teteIc}><Ico n="cal" t={21} /></span>
          <div className={o.teteTx}>
            <h2>Organiser une visite</h2>
            <p>{'Un acheteur suivi ou quelqu’un hors du CRM, sur un bien de l’agence ou de son dossier.'}</p>
          </div>
          <button type="button" className={o.fermer} onClick={fermer} aria-label="Fermer" disabled={envoi && !fini}><Ico n="croix" t={16} /></button>
        </header>

        {fini ? (
          <div className={o.bravo} role="status">
            <span className={o.bravoRond}><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path className={o.trace} d="M5 12.5l4.2 4.2L19 7" /></svg></span>
            <b>{'C’est noté'}</b>
            <span>{fini}</span>
            <small>{passe ? 'Elle attend son compte rendu, dans « Compte rendu à faire ».' : 'Elle est dans « À venir » et dans l’agenda.'}</small>
          </div>
        ) : (
          <div className={o.corps} ref={corps}>
            {/* 1. Qui visite */}
            <Etape n={1} titre="Qui visite ?" fait={quiOk}>
              <div className={o.bascule} role="radiogroup" aria-label="Qui visite">
                <span className={o.curseur} data-cote={mode} aria-hidden="true" />
                <button type="button" role="radio" aria-checked={mode === 'crm'} onClick={() => changerMode('crm')}>Un acheteur suivi</button>
                <button type="button" role="radio" aria-checked={mode === 'libre'} onClick={() => changerMode('libre')}>Hors du CRM</button>
              </div>

              {mode === 'crm' ? (
                client ? (
                  <div className={o.retenu} key={client.id}>
                    <AvatarContact c={client} teinte={{ bg: '#eef2f8', fg: '#34496e' }} taille={40} />
                    <span className={o.retenuTx}>
                      <b>{nomClient(client)}</b>
                      <small>{rechClient.length ? `${rechClient.length > 1 ? `${rechClient.length} recherches` : `Recherche : ${rechClient[0].nom || 'en cours'}`}` : 'Aucune recherche'}</small>
                    </span>
                    <button type="button" className={o.changer} onClick={() => { setClient(null); setRechercheId(''); setQClient(''); if (bien?.genre === 'dossier') setBien(null); }}>Changer</button>
                  </div>
                ) : (
                  <>
                    <label className={o.cherche}>
                      <Ico n="loupe" />
                      <input autoFocus value={qClient} onChange={e => setQClient(e.target.value)} placeholder="Nom, prénom ou téléphone…" aria-label="Chercher un client du CRM" />
                    </label>
                    {qClient.trim().length >= 2 && (
                      <div className={o.liste}>
                        {clients === null && <div className={o.vide}>Chargement des contacts…</div>}
                        {clients && clientsTrouves.length === 0 && <div className={o.vide}>{'Personne à ce nom. Hors du CRM ? Choisis « Hors du CRM » juste au-dessus.'}</div>}
                        {clientsTrouves.map((c, i) => {
                          const r = recherchesDe(c.id);
                          return (
                            <button key={c.id} type="button" className={o.ligne} style={{ animationDelay: `${i * 35}ms` }} onClick={() => choisirClient(c)}>
                              <AvatarContact c={c} teinte={{ bg: '#eef2f8', fg: '#34496e' }} taille={34} />
                              <span className={o.ligneTx}>
                                <b>{nomClient(c)}</b>
                                <small>{r.length ? `Recherche : ${r[0].nom || 'en cours'}${r.length > 1 ? ` (+${r.length - 1})` : ''}` : 'Aucune recherche'}{(c.telephones || [])[0] ? ` · ${(c.telephones || [])[0]}` : ''}</small>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )
              ) : (
                <div className={o.deux}>
                  <label className={o.champ}><span>Son nom</span><input autoFocus value={libreNom} onChange={e => setLibreNom(e.target.value)} placeholder="Ex : Couple Nguyen (SeLoger)" /></label>
                  <label className={o.champ}><span>Son téléphone</span><input value={libreTel} onChange={e => setLibreTel(e.target.value)} inputMode="tel" placeholder="Facultatif" /></label>
                </div>
              )}

              {mode === 'crm' && client && rechClient.length > 1 && (
                <div className={o.pills} role="radiogroup" aria-label="Pour quelle recherche">
                  {rechClient.map(r => (
                    <button key={r.id} type="button" role="radio" aria-checked={r.id === rechercheId} className={o.pill} onClick={() => { setRechercheId(r.id); if (bien?.genre === 'dossier') setBien(null); }}>
                      {r.nom || 'Recherche'}{r.active === false ? ' · en attente' : ''}
                    </button>
                  ))}
                </div>
              )}
              {mode === 'crm' && client && rechClient.length === 0 && (
                <div className={`${o.info} ${o.infoOr}`}><Ico n="info" t={15} /><span>{`${nomClient(client)} n’a pas de recherche : ouvre-lui une recherche depuis sa fiche, ou note la visite « Hors du CRM ».`}</span></div>
              )}
            </Etape>

            {/* 2. Quel bien */}
            <Etape n={2} titre="Quel bien ?" fait={!!bien}>
              {bien ? (
                <>
                  <div className={o.retenu} key={bien.cle}>
                    {vignette(bien, true)}
                    <span className={o.retenuTx}>
                      <b>{titreBien(bien)}</b>
                      <small>{sousBien(bien)}</small>
                    </span>
                    <button type="button" className={o.changer} onClick={() => setBien(null)}>Changer</button>
                  </div>
                  {bien.genre === 'agence' && avantMandat(bien.b.etape) && (
                    <div className={o.info}><Ico n="info" t={15} /><span>{`Pas encore sous mandat (${etapeDe(bien.b.etape).lib.toLowerCase()}) : la visite se planifie quand même.${mode === 'crm' ? ' Dans son espace, le bien apparaît sans prix.' : ''}`}</span></div>
                  )}
                  {bien.genre === 'agence' && bien.b.etape === 'compromis' && (
                    <div className={`${o.info} ${o.infoOr}`}><Ico n="info" t={15} /><span>{'Sous compromis : une visite ne sert plus qu’à une offre de secours.'}</span></div>
                  )}
                </>
              ) : (
                <>
                  <label className={o.cherche}>
                    <Ico n="loupe" />
                    <input value={qBien} onChange={e => setQBien(e.target.value)} placeholder="Propriétaire, prix, adresse, référence…" aria-label="Chercher un bien" />
                  </label>
                  <div className={o.liste}>
                    {agence === null && <div className={o.vide}>Chargement des biens…</div>}
                    {agence !== null && biensTrouves.length === 0 && (
                      <div className={o.vide}>{qBien.trim().length >= 2 ? 'Aucun bien ne correspond. Essaie le nom du propriétaire, le prix ou la rue.' : 'Tape le nom du propriétaire, le prix ou l’adresse.'}</div>
                    )}
                    {qBien.trim().length < 2 && biensTrouves.length > 0 && <div className={o.sur}>{dossier.length ? 'Son dossier, puis tes biens en vente' : 'Tes biens en vente'}</div>}
                    {biensTrouves.map((c, i) => {
                      const p = pastille(c);
                      return (
                        <button key={c.cle} type="button" className={o.ligne} style={{ animationDelay: `${i * 35}ms` }} onClick={() => setBien(c)}>
                          {vignette(c)}
                          <span className={o.ligneTx}>
                            <b>{titreBien(c)}</b>
                            <small className={o.deuxL}>{sousBien(c)}</small>
                          </span>
                          <span className={o.pastille} style={{ color: p.c, background: `${p.c}14`, borderColor: `${p.c}38` }}>{p.lib}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </Etape>

            {/* 3. Quand */}
            <Etape n={3} titre="Quand ?" fait={!!date && !!heure}>
              <ChoixQuand date={date} heure={heure} duree={duree} onDate={setDate} onHeure={setHeure} onDuree={setDuree} durees={DUREES} />
              {(passe || pris.length > 0) && (
                <div className={`${o.info} ${o.infoOr}`}>
                  <Ico n="horloge" t={15} />
                  <span>
                    {passe && 'Cette date est passée : la visite arrivera en « compte rendu à faire ». '}
                    {pris.length > 0 && `Ce créneau est déjà pris : ${pris.map(x => `${x.titre}, de ${hFr(x.debut)} à ${hFr(x.fin)}`).join(' ; ')}.`}
                  </span>
                </div>
              )}
              <label className={o.champ}><span>Note (facultatif)</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="Ex : vient avec son père ; deuxième visite" /></label>
            </Etape>

            {erreur && <div className={o.erreur} role="alert">{erreur}</div>}
          </div>
        )}

        {!fini && (
          <footer className={o.pied}>
            <span className={o.resume}>
              {nomVisiteur && bien ? `${nomVisiteur} · ${titreBien(bien)}` : 'Choisis qui visite et le bien.'}
            </span>
            <button type="button" className={o.btn} onClick={fermer} disabled={envoi}>Annuler</button>
            <button type="button" className={`${o.btn} ${o.btnOr}`} onClick={() => { void enregistrer(); }} disabled={!pret}>
              <Ico n="cal" t={16} /><span>{envoi ? 'Enregistrement…' : 'Planifier la visite'}</span>
            </button>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
