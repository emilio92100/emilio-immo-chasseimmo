'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase, addJournal } from '@/lib/supabase';
import type { Client } from '@/lib/supabase';
import styles from './FicheClient.module.css';

const QUARTIERS: Record<string, { ville: string; quartiers: string[] }> = {
  '75001': { ville: 'Paris 1er', quartiers: ['Saint-Germain-l\'Auxerrois','Les Halles','Palais Royal','Place Vendôme'] },
  '75002': { ville: 'Paris 2ème', quartiers: ['Gaillon','Vivienne','Mail','Bonne-Nouvelle'] },
  '75003': { ville: 'Paris 3ème', quartiers: ['Arts et Métiers','Archives','Saint-Avoye','Enfants Rouges'] },
  '75004': { ville: 'Paris 4ème', quartiers: ['Saint-Merri','Saint-Gervais','Arsenal','Notre-Dame','Marais'] },
  '75005': { ville: 'Paris 5ème', quartiers: ['Saint-Victor','Jardin des Plantes','Val de Grâce','Sorbonne'] },
  '75006': { ville: 'Paris 6ème', quartiers: ['Saint-Germain-des-Prés','Luxembourg','Vavin','Notre-Dame-des-Champs','Bon Marché','Saint-Sulpice'] },
  '75007': { ville: 'Paris 7ème', quartiers: ['Saint-Thomas-d\'Aquin','Invalides','École Militaire','Gros-Caillou','Tour Eiffel'] },
  '75008': { ville: 'Paris 8ème', quartiers: ['Champs-Élysées','Faubourg du Roule','Madeleine','Europe'] },
  '75009': { ville: 'Paris 9ème', quartiers: ['Saint-Georges','Chaussée-d\'Antin','Faubourg Montmartre','Rochechouart'] },
  '75010': { ville: 'Paris 10ème', quartiers: ['Saint-Vincent-de-Paul','Porte Saint-Denis','Porte Saint-Martin','Hôpital Saint-Louis'] },
  '75011': { ville: 'Paris 11ème', quartiers: ['Folie-Méricourt','Saint-Ambroise','Roquette','Sainte-Marguerite','Bastille','Nation'] },
  '75012': { ville: 'Paris 12ème', quartiers: ['Bel-Air','Picpus','Bercy','Quinze-Vingts'] },
  '75013': { ville: 'Paris 13ème', quartiers: ['Salpêtrière','Gare','Maison-Blanche','Croulebarbe'] },
  '75014': { ville: 'Paris 14ème', quartiers: ['Montrouge','Parc de Montsouris','Petit-Montrouge','Plaisance'] },
  '75015': { ville: 'Paris 15ème', quartiers: ['Grenelle','Javel','Saint-Lambert','Necker','Beaugrenelle','Convention','Commerce','Falguière','Brancion'] },
  '75016': { ville: 'Paris 16ème', quartiers: ['Auteuil','Muette','Porte Dauphine','Chaillot','Victor Hugo','Trocadéro'] },
  '75017': { ville: 'Paris 17ème', quartiers: ['Ternes','Plaine de Monceau','Batignolles','Epinettes'] },
  '75018': { ville: 'Paris 18ème', quartiers: ['Grandes Carrières','Clignancourt','Goutte d\'Or','Montmartre'] },
  '75019': { ville: 'Paris 19ème', quartiers: ['La Villette','Pont de Flandre','Amérique','Combat'] },
  '75020': { ville: 'Paris 20ème', quartiers: ['Belleville','Saint-Fargeau','Père Lachaise','Charonne'] },
  '92100': { ville: 'Boulogne-Billancourt', quartiers: ['Parchamp-Albert Kahn','Silly-Gallieni','Renault-Billancourt','Point-du-Jour','Vaillant-Marcel Sembat','Jean-Jaurès-Reine','Château-Les-Princes-Marmottan'] },
  '92200': { ville: 'Neuilly-sur-Seine', quartiers: ['Neuilly Centre','Bagatelle','Roule','Pont de Neuilly'] },
  '92110': { ville: 'Clichy', quartiers: ['Centre Clichy','Bac d\'Asnières','Victor Hugo'] },
  '92120': { ville: 'Montrouge', quartiers: ['Centre Montrouge','Bagneux','Gabriel Péri'] },
  '92130': { ville: 'Issy-les-Moulineaux', quartiers: ['Centre Issy','Fort d\'Issy','Corbehem'] },
  '92140': { ville: 'Clamart', quartiers: ['Centre Clamart','Trivaux','Gare'] },
  '92150': { ville: 'Suresnes', quartiers: ['Centre Suresnes','Mont Valérien','Plateau'] },
  '92160': { ville: 'Antony', quartiers: ['Centre Antony','Croix de Berny','Noyer Doré'] },
  '92170': { ville: 'Vanves', quartiers: ['Centre Vanves','Plateau','Corentin Celton'] },
  '92190': { ville: 'Meudon', quartiers: ['Meudon Centre','Bellevue','La Forêt'] },
  '92210': { ville: 'Saint-Cloud', quartiers: ['Montretout','Jardins','Clos du Moustier'] },
  '92220': { ville: 'Bagneux', quartiers: ['Centre Bagneux','Danube','République'] },
  '92230': { ville: 'Gennevilliers', quartiers: ['Centre','Luth','Grésillons'] },
  '92240': { ville: 'Malakoff', quartiers: ['Centre Malakoff','Haut Malakoff'] },
  '92250': { ville: 'La Garenne-Colombes', quartiers: ['Centre','Quartier du Marché'] },
  '92260': { ville: 'Fontenay-aux-Roses', quartiers: ['Centre','Blagis'] },
  '92270': { ville: 'Bois-Colombes', quartiers: ['Centre','Charlebourg'] },
  '92290': { ville: 'Châtenay-Malabry', quartiers: ['Centre','La Croix de Berny','Butte Rouge'] },
  '92300': { ville: 'Levallois-Perret', quartiers: ['Centre Levallois','Pont de Levallois','Victor Hugo'] },
  '92310': { ville: 'Sèvres', quartiers: ['Centre Sèvres','Brancas','Brimborion'] },
  '92320': { ville: 'Châtillon', quartiers: ['Centre Châtillon','Châtillon Nord'] },
  '92330': { ville: 'Sceaux', quartiers: ['Centre Sceaux','Robinson'] },
  '92340': { ville: 'Bourg-la-Reine', quartiers: ['Centre','Croix de Berny'] },
  '92350': { ville: 'Le Plessis-Robinson', quartiers: ['Centre','Cœur de Ville'] },
  '92360': { ville: 'Meudon-la-Forêt', quartiers: ['Forêt','Trivaux'] },
  '92370': { ville: 'Chaville', quartiers: ['Centre Chaville','Viroflay'] },
  '92380': { ville: 'Garches', quartiers: ['Centre Garches','Saint-Cloud'] },
  '92390': { ville: 'Villeneuve-la-Garenne', quartiers: ['Centre','Les Grésillons'] },
  '92400': { ville: 'Courbevoie', quartiers: ['Becon','La Défense','Faubourg de l\'Arche','Centre Courbevoie'] },
  '92410': { ville: 'Ville-d\'Avray', quartiers: ['Centre','Étangs de Corot'] },
  '92420': { ville: 'Vaucresson', quartiers: ['Centre Vaucresson'] },
  '92430': { ville: 'Marnes-la-Coquette', quartiers: ['Centre'] },
  '92500': { ville: 'Rueil-Malmaison', quartiers: ['Centre Rueil','Jonchères','Mont-Valérien','Buzenval'] },
  '92600': { ville: 'Asnières-sur-Seine', quartiers: ['Centre Asnières','Bords de Seine','Quartier des Agnettes'] },
  '92700': { ville: 'Colombes', quartiers: ['Centre Colombes','Le Plateau','La Garenne'] },
  '92800': { ville: 'Puteaux', quartiers: ['Centre Puteaux','La Défense','Île de Puteaux'] },
};

interface FicheClientProps {
  client: Client;
  onBack: () => void;
  onNavigate: (page: string, data?: unknown) => void;
}

export default function FicheClient({ client: initialClient, onBack, onNavigate }: FicheClientProps) {
  const [client, setClient] = useState<Client>(initialClient);
  const [activeTab, setActiveTab] = useState('biens');
  const [biens, setBiens] = useState<any[]>([]);
  const [visites, setVisites] = useState<any[]>([]);
  const [transaction, setTransaction] = useState<any>(null);
  const [envois, setEnvois] = useState<any[]>([]);
  const [journal, setJournal] = useState<any[]>([]);
  const [editingCriteres, setEditingCriteres] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [showAddBien, setShowAddBien] = useState(false);
  const [showAddAction, setShowAddAction] = useState(false);
  const [saving, setSaving] = useState(false);
  const [urlBien, setUrlBien] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [bienForm, setBienForm] = useState<any>(null);

  // Critères form
  const [criteresForm, setCriteresForm] = useState({
    type_bien: client.type_bien || '',
    budget_min: client.budget_min?.toString() || '',
    budget_max: client.budget_max?.toString() || '',
    surface_min: client.surface_min?.toString() || '',
    surface_max: client.surface_max?.toString() || '',
    nb_pieces_min: client.nb_pieces_min?.toString() || '',
    nb_pieces_max: client.nb_pieces_max?.toString() || '',
    secteurs: client.secteurs || [],
    notes: client.notes || '',
  });

  // Contact form
  const [contactForm, setContactForm] = useState({
    prenom: client.prenom,
    nom: client.nom,
    adresse: client.adresse || '',
    emails: client.emails || [],
    telephones: client.telephones || [],
    statut: client.statut,
    chaleur: client.chaleur,
    mandat_date_signature: client.mandat_date_signature || '',
    mandat_duree: client.mandat_duree?.toString() || '',
    mandat_honoraires: client.mandat_honoraires || '',
  });

  // Secteur search
  const [cpSearch, setCpSearch] = useState('');
  const [cpSuggestions, setCpSuggestions] = useState<any[]>([]);
  const [selectedSecteur, setSelectedSecteur] = useState('');

  useEffect(() => { fetchAll(); }, [client.id]);

  async function fetchAll() {
    const [{ data: b }, { data: v }, { data: t }, { data: e }, { data: j }] = await Promise.all([
      supabase.from('biens').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
      supabase.from('visites').select('*').eq('client_id', client.id).order('date_visite', { ascending: true }),
      supabase.from('transactions').select('*').eq('client_id', client.id).maybeSingle(),
      supabase.from('envois').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
      supabase.from('journal').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
    ]);
    setBiens(b || []);
    setVisites(v || []);
    setTransaction(t);
    setEnvois(e || []);
    setJournal(j || []);
  }

  // Recherche code postal via geo.api.gouv.fr
  async function searchCP(q: string) {
    setCpSearch(q);
    if (q.length < 2) { setCpSuggestions([]); return; }
    // D'abord chercher dans notre base locale
    const local = Object.entries(QUARTIERS).filter(([cp, info]) =>
      cp.includes(q) || info.ville.toLowerCase().includes(q.toLowerCase())
    ).map(([cp, info]) => ({ cp, ville: info.ville, source: 'local' }));
    if (local.length > 0) { setCpSuggestions(local.slice(0, 6)); return; }
    // Sinon API
    try {
      const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,codesPostaux&boost=population&limit=8`);
      const data = await r.json();
      const sug = data.flatMap((d: any) => d.codesPostaux.map((cp: string) => ({ cp, ville: d.nom, source: 'api' })));
      setCpSuggestions(sug.slice(0, 6));
    } catch { setCpSuggestions([]); }
  }

  function addSecteur(cp: string, ville: string, quartier?: string) {
    const label = quartier ? `${quartier} (${ville})` : `${ville} (${cp})`;
    if (!criteresForm.secteurs.includes(label)) {
      setCriteresForm(f => ({ ...f, secteurs: [...f.secteurs, label] }));
    }
    setCpSearch(''); setCpSuggestions([]); setSelectedSecteur('');
  }

  function removeSecteur(s: string) {
    setCriteresForm(f => ({ ...f, secteurs: f.secteurs.filter(x => x !== s) }));
  }

  // Sauvegarder critères
  async function saveCriteres() {
    setSaving(true);
    const { data } = await supabase.from('clients').update({
      type_bien: criteresForm.type_bien || null,
      budget_min: criteresForm.budget_min ? parseInt(criteresForm.budget_min) : null,
      budget_max: criteresForm.budget_max ? parseInt(criteresForm.budget_max) : null,
      surface_min: criteresForm.surface_min ? parseInt(criteresForm.surface_min) : null,
      surface_max: criteresForm.surface_max ? parseInt(criteresForm.surface_max) : null,
      nb_pieces_min: criteresForm.nb_pieces_min ? parseInt(criteresForm.nb_pieces_min) : null,
      nb_pieces_max: criteresForm.nb_pieces_max ? parseInt(criteresForm.nb_pieces_max) : null,
      secteurs: criteresForm.secteurs,
      notes: criteresForm.notes || null,
    }).eq('id', client.id).select().single();
    if (data) { setClient(data as Client); await addJournal(client.id, 'criteres_modifies', 'Critères de recherche mis à jour'); }
    setSaving(false); setEditingCriteres(false); fetchAll();
  }

  // Sauvegarder contact
  async function saveContact() {
    setSaving(true);
    const { data } = await supabase.from('clients').update({
      prenom: contactForm.prenom, nom: contactForm.nom,
      adresse: contactForm.adresse || null,
      emails: contactForm.emails.filter(Boolean),
      telephones: contactForm.telephones.filter(Boolean),
      statut: contactForm.statut, chaleur: contactForm.chaleur,
      mandat_date_signature: contactForm.mandat_date_signature || null,
      mandat_duree: contactForm.mandat_duree ? parseInt(contactForm.mandat_duree) : null,
      mandat_honoraires: contactForm.mandat_honoraires || null,
    }).eq('id', client.id).select().single();
    if (data) { setClient(data as Client); await addJournal(client.id, 'fiche_modifiee', 'Fiche client mise à jour'); }
    setSaving(false); setEditingContact(false); fetchAll();
  }

  // Changer statut rapide
  async function changeStatut(statut: string) {
    const { data } = await supabase.from('clients').update({ statut }).eq('id', client.id).select().single();
    if (data) { setClient(data as Client); await addJournal(client.id, 'statut_change', `Statut changé → ${statut}`); }
  }

  // Changer chaleur
  async function changeChaleur(chaleur: string) {
    const { data } = await supabase.from('clients').update({ chaleur }).eq('id', client.id).select().single();
    if (data) setClient(data as Client);
  }

  // Extraire bien par URL
  async function extractBien() {
    if (!urlBien) return;
    setExtracting(true);
    try {
      const res = await fetch('/api/extract-bien', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlBien }),
      });
      const data = await res.json();
      if (data.bien) {
        setBienForm({ ...data.bien, url: urlBien, commission_type: 'pourcentage', commission_val: 3.5 });
      } else {
        setBienForm({ url: urlBien, titre: '', prix_vendeur: '', surface: '', nb_pieces: '', ville: '', description: '', commission_type: 'pourcentage', commission_val: 3.5 });
      }
    } catch {
      setBienForm({ url: urlBien, titre: '', prix_vendeur: '', surface: '', nb_pieces: '', ville: '', description: '', commission_type: 'pourcentage', commission_val: 3.5 });
    }
    setExtracting(false);
  }

  // Calculer prix acquéreur
  const prixAcquereur = bienForm ? (
    bienForm.commission_type === 'pourcentage'
      ? Math.round((parseFloat(bienForm.prix_vendeur) || 0) * (1 + (parseFloat(bienForm.commission_val) || 0) / 100))
      : (parseFloat(bienForm.prix_vendeur) || 0) + (parseFloat(bienForm.commission_val) || 0)
  ) : 0;

  // Sauvegarder bien
  async function saveBien() {
    if (!bienForm) return;
    setSaving(true);
    // Vérifier doublon URL
    const { data: existing } = await supabase.from('biens').select('id').eq('client_id', client.id).eq('url', bienForm.url).maybeSingle();
    if (existing) { alert('Ce bien est déjà dans la liste de ce client !'); setSaving(false); return; }

    const { data } = await supabase.from('biens').insert({
      client_id: client.id,
      url: bienForm.url, titre: bienForm.titre, adresse: bienForm.adresse,
      ville: bienForm.ville, code_postal: bienForm.code_postal,
      type_bien: bienForm.type_bien, surface: parseFloat(bienForm.surface) || null,
      nb_pieces: parseInt(bienForm.nb_pieces) || null, nb_chambres: parseInt(bienForm.nb_chambres) || null,
      etage: parseInt(bienForm.etage) || null, parking: bienForm.parking || false,
      dpe: bienForm.dpe, description: bienForm.description,
      prix_vendeur: parseFloat(bienForm.prix_vendeur) || null,
      commission_type: bienForm.commission_type, commission_val: parseFloat(bienForm.commission_val) || null,
      prix_acquereur: prixAcquereur || null,
      photos: bienForm.photos || [], source_portail: bienForm.source_portail,
      agence_nom: bienForm.agence_nom, badge_retour: 'propose',
    }).select().single();

    if (data) {
      await addJournal(client.id, 'bien_ajoute', `Bien ajouté — ${bienForm.titre || bienForm.ville}`, bienForm.url);
    }
    setSaving(false); setShowAddBien(false); setUrlBien(''); setBienForm(null); fetchAll();
  }

  // Changer badge retour bien
  async function changeBadgeBien(bienId: string, badge: string) {
    await supabase.from('biens').update({ badge_retour: badge }).eq('id', bienId);
    if (badge === 'offre_faite' && !transaction) {
      await supabase.from('transactions').insert({ client_id: client.id, bien_id: bienId, etape_actuelle: 'offre' });
      await addJournal(client.id, 'offre_faite', 'Offre faite — Suivi transaction ouvert');
    }
    fetchAll();
  }

  // Planifier visite
  async function planifierVisite(bienId: string) {
    await supabase.from('visites').insert({ client_id: client.id, bien_id: bienId, statut: 'a_venir' });
    await supabase.from('biens').update({ badge_retour: 'souhaite_visiter' }).eq('id', bienId);
    await addJournal(client.id, 'visite_planifiee', 'Visite planifiée');
    fetchAll();
  }

  // Ajouter action manuelle
  const [actionForm, setActionForm] = useState({ type: 'note', titre: '', description: '' });
  async function saveAction() {
    await addJournal(client.id, actionForm.type, actionForm.titre, actionForm.description);
    setShowAddAction(false); setActionForm({ type: 'note', titre: '', description: '' });
    fetchAll();
  }

  const joursSuivi = Math.floor((Date.now() - new Date(client.created_at).getTime()) / 86400000);
  const mandatExpire = client.mandat_date_expiration ? new Date(client.mandat_date_expiration) : null;
  const joursMandat = mandatExpire ? Math.floor((mandatExpire.getTime() - Date.now()) / 86400000) : null;

  const TABS = [
    { id: 'biens', label: `🏠 Biens (${biens.length})` },
    { id: 'visites', label: `📅 Visites (${visites.length})` },
    { id: 'transaction', label: '📋 Transaction' },
    { id: 'historique', label: `📄 Historique (${envois.length})` },
    { id: 'journal', label: `📓 Journal (${journal.length})` },
  ];

  const badgeRetourLabels: Record<string, { label: string; color: string; bg: string }> = {
    propose:         { label: '📋 Proposé',        color: '#64748b', bg: '#f8fafc' },
    interesse:       { label: '👍 Intéressé',       color: '#3b82f6', bg: '#eff6ff' },
    souhaite_visiter:{ label: '👀 Souhaite visiter', color: '#8b5cf6', bg: '#f5f3ff' },
    visite:          { label: '✅ Visité',           color: '#10b981', bg: '#ecfdf5' },
    offre_faite:     { label: '🟡 Offre faite',      color: '#f59e0b', bg: '#fffbeb' },
    refuse:          { label: '❌ Refusé',           color: '#ef4444', bg: '#fef2f2' },
  };

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <div className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className={styles.backBtn} onClick={onBack}>← Clients</button>
          <span style={{ color: '#94a3b8' }}>/</span>
          <span style={{ fontWeight: 600, color: '#1a2332' }}>{client.prenom} {client.nom}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={styles.btn} onClick={() => setShowAddAction(true)}>+ Action</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowAddBien(true)}>+ Ajouter un bien</button>
        </div>
      </div>

      {/* IDENTITÉ */}
      <div className={styles.identite}>
        <div className={styles.identiteLeft}>
          <div className={styles.avatar}>{client.prenom[0]}{client.nom[0]}</div>
          <div>
            <div className={styles.clientName}>{client.prenom} {client.nom}</div>
            <div className={styles.clientRef}>{client.reference} · Suivi depuis {joursSuivi} jours</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {/* STATUT */}
              {['prospect','actif','suspendu'].map(s => (
                <button key={s} onClick={() => changeStatut(s)}
                  className={`${styles.statusBtn} ${client.statut === s ? styles.statusActive : ''}`}
                  style={client.statut === s ? {
                    background: s === 'prospect' ? '#f5f3ff' : s === 'actif' ? '#ecfdf5' : '#fffbeb',
                    color: s === 'prospect' ? '#8b5cf6' : s === 'actif' ? '#10b981' : '#f59e0b',
                    borderColor: s === 'prospect' ? '#ddd6fe' : s === 'actif' ? '#a7f3d0' : '#fde68a',
                  } : {}}>
                  {s === 'prospect' ? '🟣 Prospect' : s === 'actif' ? '🟢 Actif' : '⏸️ Suspendu'}
                </button>
              ))}
              {/* CHALEUR */}
              {[{k:'tres_chaud',l:'🔥'},{k:'interesse',l:'👍'},{k:'tiede',l:'😐'},{k:'froid',l:'❄️'}].map(c => (
                <button key={c.k} onClick={() => changeChaleur(c.k)}
                  className={`${styles.chaleurBtn} ${client.chaleur === c.k ? styles.chaleurActive : ''}`}
                  title={c.k}>{c.l}</button>
              ))}
            </div>
          </div>
        </div>

        {/* SYNTHÈSE */}
        <div className={styles.synthese}>
          <div className={styles.syntheseItem}><div className={styles.syntheseVal}>{biens.length}</div><div className={styles.syntheseLabel}>Biens</div></div>
          <div className={styles.syntheseItem}><div className={styles.syntheseVal}>{visites.filter(v => v.statut === 'effectuee').length}</div><div className={styles.syntheseLabel}>Visites</div></div>
          <div className={styles.syntheseItem}><div className={styles.syntheseVal} style={{ color: '#c9a84c' }}>{biens.filter(b => b.badge_retour === 'offre_faite').length}</div><div className={styles.syntheseLabel}>Offre(s)</div></div>
          <div className={styles.syntheseItem}><div className={styles.syntheseVal}>{joursSuivi}j</div><div className={styles.syntheseLabel}>Suivi</div></div>
        </div>
      </div>

      {/* BODY */}
      <div className={styles.body}>
        {/* SIDEBAR GAUCHE */}
        <div className={styles.sidebar}>

          {/* CRITÈRES */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>🎯 Critères de recherche</span>
              <button className={styles.editBtn} onClick={() => setEditingCriteres(!editingCriteres)}>
                {editingCriteres ? '✕' : '✏️'}
              </button>
            </div>
            {editingCriteres ? (
              <div className={styles.cardBody}>
                <div className={styles.formRow}>
                  <div><label className={styles.lbl}>Type</label>
                    <select className={styles.inp} value={criteresForm.type_bien} onChange={e => setCriteresForm(f => ({ ...f, type_bien: e.target.value }))}>
                      <option value="">—</option>
                      <option>Appartement</option><option>Maison</option><option>Loft</option><option>Duplex</option><option>Studio</option>
                    </select>
                  </div>
                </div>
                <div className={styles.formRow}>
                  <div><label className={styles.lbl}>Budget min €</label><input className={styles.inp} type="number" value={criteresForm.budget_min} onChange={e => setCriteresForm(f => ({ ...f, budget_min: e.target.value }))} /></div>
                  <div><label className={styles.lbl}>Budget max €</label><input className={styles.inp} type="number" value={criteresForm.budget_max} onChange={e => setCriteresForm(f => ({ ...f, budget_max: e.target.value }))} /></div>
                </div>
                <div className={styles.formRow}>
                  <div><label className={styles.lbl}>Surface min m²</label><input className={styles.inp} type="number" value={criteresForm.surface_min} onChange={e => setCriteresForm(f => ({ ...f, surface_min: e.target.value }))} /></div>
                  <div><label className={styles.lbl}>Surface max m²</label><input className={styles.inp} type="number" value={criteresForm.surface_max} onChange={e => setCriteresForm(f => ({ ...f, surface_max: e.target.value }))} /></div>
                </div>
                <div className={styles.formRow}>
                  <div><label className={styles.lbl}>Pièces min</label><input className={styles.inp} type="number" value={criteresForm.nb_pieces_min} onChange={e => setCriteresForm(f => ({ ...f, nb_pieces_min: e.target.value }))} /></div>
                  <div><label className={styles.lbl}>Pièces max</label><input className={styles.inp} type="number" value={criteresForm.nb_pieces_max} onChange={e => setCriteresForm(f => ({ ...f, nb_pieces_max: e.target.value }))} /></div>
                </div>

                {/* SECTEURS avec API */}
                <div>
                  <label className={styles.lbl}>Secteurs</label>
                  <div style={{ position: 'relative' }}>
                    <input className={styles.inp} value={cpSearch} onChange={e => searchCP(e.target.value)} placeholder="Code postal ou ville..." />
                    {cpSuggestions.length > 0 && (
                      <div className={styles.suggestions}>
                        {cpSuggestions.map((s, i) => (
                          <div key={i} className={styles.suggItem} onClick={() => {
                            const info = QUARTIERS[s.cp];
                            if (info?.quartiers) setSelectedSecteur(s.cp);
                            else addSecteur(s.cp, s.ville);
                            setCpSuggestions([]);
                          }}>
                            <strong>{s.cp}</strong> — {s.ville}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedSecteur && QUARTIERS[selectedSecteur] && (
                    <div className={styles.quartiersWrap}>
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Quartiers de {QUARTIERS[selectedSecteur].ville} :</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        <button className={styles.quartierBtn} onClick={() => addSecteur(selectedSecteur, QUARTIERS[selectedSecteur].ville)}>
                          Toute la ville
                        </button>
                        {QUARTIERS[selectedSecteur].quartiers.map(q => (
                          <button key={q} className={styles.quartierBtn} onClick={() => addSecteur(selectedSecteur, QUARTIERS[selectedSecteur].ville, q)}>{q}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {criteresForm.secteurs.map(s => (
                      <span key={s} className={styles.secteurTag}>
                        {s} <span onClick={() => removeSecteur(s)} style={{ cursor: 'pointer', marginLeft: 4, opacity: 0.6 }}>✕</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div><label className={styles.lbl}>Notes</label><textarea className={styles.inp} rows={2} value={criteresForm.notes} onChange={e => setCriteresForm(f => ({ ...f, notes: e.target.value }))} /></div>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveCriteres} disabled={saving} style={{ width: '100%' }}>
                  {saving ? 'Sauvegarde...' : '✓ Sauvegarder'}
                </button>
              </div>
            ) : (
              <div className={styles.cardBody}>
                {client.type_bien && <div className={styles.critRow}><span>Type</span><strong>{client.type_bien}</strong></div>}
                {client.budget_min && <div className={styles.critRow}><span>Budget</span><strong>{(client.budget_min/1000).toFixed(0)}–{((client.budget_max||0)/1000).toFixed(0)}k€</strong></div>}
                {client.surface_min && <div className={styles.critRow}><span>Surface</span><strong>{client.surface_min}–{client.surface_max} m²</strong></div>}
                {client.nb_pieces_min && <div className={styles.critRow}><span>Pièces</span><strong>{client.nb_pieces_min}–{client.nb_pieces_max}P</strong></div>}
                {client.secteurs?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Secteurs</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {client.secteurs.map(s => <span key={s} className={styles.secteurTag}>{s}</span>)}
                    </div>
                  </div>
                )}
                {client.notes && <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '8px 10px', marginTop: 4, fontStyle: 'italic' }}>{client.notes}</div>}
                {!client.type_bien && !client.budget_min && client.secteurs?.length === 0 && (
                  <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>Aucun critère défini — cliquez ✏️</div>
                )}
              </div>
            )}
          </div>

          {/* CONTACT */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>📞 Contact</span>
              <button className={styles.editBtn} onClick={() => setEditingContact(!editingContact)}>{editingContact ? '✕' : '✏️'}</button>
            </div>
            {editingContact ? (
              <div className={styles.cardBody}>
                <div className={styles.formRow}>
                  <div><label className={styles.lbl}>Prénom</label><input className={styles.inp} value={contactForm.prenom} onChange={e => setContactForm(f => ({ ...f, prenom: e.target.value }))} /></div>
                  <div><label className={styles.lbl}>Nom</label><input className={styles.inp} value={contactForm.nom} onChange={e => setContactForm(f => ({ ...f, nom: e.target.value }))} /></div>
                </div>
                <div><label className={styles.lbl}>Adresse</label><input className={styles.inp} value={contactForm.adresse} onChange={e => setContactForm(f => ({ ...f, adresse: e.target.value }))} /></div>
                <div><label className={styles.lbl}>Email 1</label><input className={styles.inp} type="email" value={contactForm.emails[0] || ''} onChange={e => { const em = [...contactForm.emails]; em[0] = e.target.value; setContactForm(f => ({ ...f, emails: em })); }} /></div>
                <div><label className={styles.lbl}>Email 2</label><input className={styles.inp} type="email" value={contactForm.emails[1] || ''} onChange={e => { const em = [...contactForm.emails]; em[1] = e.target.value; setContactForm(f => ({ ...f, emails: em })); }} /></div>
                <div><label className={styles.lbl}>Tél. 1</label><input className={styles.inp} value={contactForm.telephones[0] || ''} onChange={e => { const t = [...contactForm.telephones]; t[0] = e.target.value; setContactForm(f => ({ ...f, telephones: t })); }} /></div>
                <div><label className={styles.lbl}>Tél. 2</label><input className={styles.inp} value={contactForm.telephones[1] || ''} onChange={e => { const t = [...contactForm.telephones]; t[1] = e.target.value; setContactForm(f => ({ ...f, telephones: t })); }} /></div>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveContact} disabled={saving} style={{ width: '100%' }}>{saving ? 'Sauvegarde...' : '✓ Sauvegarder'}</button>
              </div>
            ) : (
              <div className={styles.cardBody}>
                {client.telephones?.map(t => <div key={t} className={styles.contactRow}>📞 <span>{t}</span></div>)}
                {client.emails?.map(e => <div key={e} className={styles.contactRow}>✉️ <span>{e}</span></div>)}
                {client.adresse && <div className={styles.contactRow}>📍 <span>{client.adresse}</span></div>}
              </div>
            )}
          </div>

          {/* MANDAT */}
          <div className={styles.card} style={{ background: '#1a2332' }}>
            <div className={styles.cardHeader} style={{ borderBottomColor: 'rgba(255,255,255,0.07)' }}>
              <span className={styles.cardTitle} style={{ color: '#c9a84c' }}>📋 Mandat de recherche</span>
            </div>
            <div className={styles.cardBody}>
              {client.mandat_date_signature ? (
                <>
                  <div style={{ fontSize: 13, color: 'white', fontWeight: 600 }}>Signé le {new Date(client.mandat_date_signature).toLocaleDateString('fr-FR')}</div>
                  {client.mandat_duree && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Durée : {client.mandat_duree} mois</div>}
                  {client.mandat_honoraires && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Honoraires : {client.mandat_honoraires}</div>}
                  {joursMandat !== null && (
                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 20, color: joursMandat < 15 ? '#fca5a5' : 'white' }}>{joursMandat}j</span>
                      <span style={{ fontSize: 10, background: 'rgba(201,168,76,0.15)', color: '#c9a84c', border: '1px solid rgba(201,168,76,0.2)', padding: '3px 9px', borderRadius: 8, fontWeight: 700 }}>
                        {joursMandat > 0 ? 'Actif' : '⚠️ Expiré'}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
                  Mandat non renseigné<br />
                  <button onClick={() => setEditingContact(true)} style={{ color: '#c9a84c', background: 'none', border: 'none', fontSize: 12, cursor: 'pointer', marginTop: 4 }}>+ Ajouter</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CONTENU PRINCIPAL */}
        <div className={styles.main}>
          {/* TABS */}
          <div className={styles.tabs}>
            {TABS.map(t => (
              <button key={t.id} className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>
            ))}
          </div>

          {/* TAB BIENS */}
          {activeTab === 'biens' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {biens.length === 0 ? (
                <div className={styles.emptyTab}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🏠</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1a2332', marginBottom: 4 }}>Aucun bien proposé</div>
                  <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 14 }}>Collez une URL d'annonce pour commencer</div>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowAddBien(true)}>+ Ajouter un bien par URL</button>
                </div>
              ) : biens.map(b => {
                const badge = badgeRetourLabels[b.badge_retour] || badgeRetourLabels.propose;
                return (
                  <div key={b.id} className={styles.bienCard}>
                    <div className={styles.bienPhoto}>
                      {b.photos?.[0] ? <img src={b.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🏠'}
                    </div>
                    <div className={styles.bienBody}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 14, color: '#1a2332' }}>{b.titre || `${b.type_bien || 'Bien'} — ${b.ville || '—'}`}</div>
                        <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 16, color: '#c9a84c', flexShrink: 0 }}>{b.prix_acquereur ? `${b.prix_acquereur.toLocaleString('fr-FR')}€` : '—'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#64748b', margin: '4px 0 8px' }}>
                        {b.surface && <span>📐 {b.surface}m²</span>}
                        {b.nb_pieces && <span>🚪 {b.nb_pieces}P</span>}
                        {b.etage && <span>🏢 {b.etage}ème</span>}
                        {b.parking && <span>🅿️</span>}
                        {b.dpe && <span>🌿 DPE {b.dpe}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* BADGE RETOUR */}
                        <select value={b.badge_retour} onChange={e => changeBadgeBien(b.id, e.target.value)}
                          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, border: `1px solid ${badge.color}30`, background: badge.bg, color: badge.color, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {Object.entries(badgeRetourLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        {b.source_portail && <span style={{ fontSize: 11, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{b.source_portail}</span>}
                        {b.url && <a href={b.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#3b82f6', textDecoration: 'none' }}>🔗 Voir annonce</a>}
                        <button onClick={() => planifierVisite(b.id)} style={{ fontSize: 11, marginLeft: 'auto', background: '#f5f3ff', color: '#8b5cf6', border: '1px solid #ddd6fe', padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>📅 Planifier visite</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB VISITES */}
          {activeTab === 'visites' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visites.length === 0 ? (
                <div className={styles.emptyTab}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
                  <div style={{ fontWeight: 700, color: '#1a2332' }}>Aucune visite</div>
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>Les visites s'ajoutent depuis l'onglet Biens</div>
                </div>
              ) : visites.map(v => {
                const bien = biens.find(b => b.id === v.bien_id);
                return (
                  <div key={v.id} className={styles.card} style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div className={styles.vdate} style={{ background: v.statut === 'effectuee' ? '#e2e8f0' : '#1a2332' }}>
                        {v.date_visite ? (
                          <>
                            <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 18, color: v.statut === 'effectuee' ? '#1a2332' : 'white', lineHeight: 1 }}>{new Date(v.date_visite).getDate()}</div>
                            <div style={{ fontSize: 9, color: v.statut === 'effectuee' ? '#94a3b8' : 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>{new Date(v.date_visite).toLocaleDateString('fr-FR', { month: 'short' })}</div>
                          </>
                        ) : <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>—</div>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2332' }}>{bien?.titre || bien?.ville || 'Bien non renseigné'}</div>
                        {v.heure && <div style={{ fontSize: 13, color: '#c9a84c', fontWeight: 600, marginTop: 2 }}>{v.heure}</div>}
                        {v.contact_agence && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Contact : {v.contact_agence} {v.tel_agence && `· ${v.tel_agence}`}</div>}
                        {v.statut === 'effectuee' && v.note_etoiles && <div style={{ marginTop: 6 }}>{'⭐'.repeat(v.note_etoiles)}</div>}
                        {v.commentaire && <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '6px 10px', marginTop: 8, borderLeft: '3px solid #c9a84c' }}>{v.commentaire}</div>}
                      </div>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: v.statut === 'a_venir' ? '#eff6ff' : v.statut === 'effectuee' ? '#ecfdf5' : '#f8fafc', color: v.statut === 'a_venir' ? '#3b82f6' : v.statut === 'effectuee' ? '#10b981' : '#64748b', border: `1px solid ${v.statut === 'a_venir' ? '#bfdbfe' : v.statut === 'effectuee' ? '#a7f3d0' : '#e2e8f0'}` }}>
                        {v.statut === 'a_venir' ? '📅 À venir' : v.statut === 'effectuee' ? '✅ Effectuée' : '❌ Annulée'}
                      </span>
                    </div>
                    {v.statut === 'a_venir' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f8fafc' }}>
                        <input type="date" defaultValue={v.date_visite?.split('T')[0]} className={styles.inp} style={{ flex: 1 }}
                          onChange={async e => { await supabase.from('visites').update({ date_visite: e.target.value }).eq('id', v.id); fetchAll(); }} />
                        <input type="time" defaultValue={v.heure} className={styles.inp} style={{ width: 100 }}
                          onChange={async e => { await supabase.from('visites').update({ heure: e.target.value }).eq('id', v.id); fetchAll(); }} />
                        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={async () => {
                          await supabase.from('visites').update({ statut: 'effectuee' }).eq('id', v.id);
                          await supabase.from('biens').update({ badge_retour: 'visite' }).eq('id', v.bien_id);
                          await addJournal(client.id, 'visite_effectuee', 'Visite effectuée');
                          fetchAll();
                        }}>✓ Effectuée</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB TRANSACTION */}
          {activeTab === 'transaction' && (
            <div>
              {!transaction ? (
                <div className={styles.emptyTab}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                  <div style={{ fontWeight: 700, color: '#1a2332', marginBottom: 4 }}>Aucune transaction en cours</div>
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>La transaction s'ouvre automatiquement quand vous posez le badge "Offre faite" sur un bien</div>
                </div>
              ) : (
                <div className={styles.card} style={{ padding: 20 }}>
                  <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 16, color: '#1a2332', marginBottom: 16 }}>
                    Suivi transaction — Étape : <span style={{ color: '#c9a84c' }}>{transaction.etape_actuelle}</span>
                  </div>
                  {/* ÉTAPES */}
                  {[
                    { id: 'offre', label: 'Offre sur le prix', icon: '1' },
                    { id: 'negociation', label: 'Négociation', icon: '2' },
                    { id: 'offre_acceptee', label: 'Offre acceptée', icon: '3' },
                    { id: 'compromis', label: 'Compromis signé', icon: '4' },
                    { id: 'acte', label: 'Acte définitif', icon: '5' },
                  ].map((etape, i) => {
                    const etapes = ['offre','negociation','offre_acceptee','compromis','acte'];
                    const idx = etapes.indexOf(transaction.etape_actuelle);
                    const done = etapes.indexOf(etape.id) < idx;
                    const cur = etape.id === transaction.etape_actuelle;
                    return (
                      <div key={etape.id} style={{ display: 'flex', gap: 12, paddingBottom: 16 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: done ? '#c9a84c' : cur ? '#1a2332' : '#e2e8f0', color: done ? '#1a2332' : cur ? 'white' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, boxShadow: cur ? '0 0 0 4px rgba(26,35,50,0.1)' : 'none', flexShrink: 0 }}>{done ? '✓' : etape.icon}</div>
                          {i < 4 && <div style={{ width: 1, flex: 1, background: done ? '#c9a84c' : '#e2e8f0', marginTop: 4 }} />}
                        </div>
                        <div style={{ flex: 1, paddingTop: 3 }}>
                          <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 13, color: cur ? '#1a2332' : done ? '#64748b' : '#94a3b8', marginBottom: 6 }}>{etape.label}</div>
                          {cur && (
                            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12 }}>
                              {etape.id === 'offre' && (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  <input className={styles.inp} type="number" placeholder="Montant offre €" defaultValue={transaction.offre_montant} style={{ flex: 1 }}
                                    onChange={e => supabase.from('transactions').update({ offre_montant: parseInt(e.target.value) }).eq('id', transaction.id)} />
                                  <input className={styles.inp} type="date" defaultValue={transaction.offre_date} style={{ width: 150 }}
                                    onChange={e => supabase.from('transactions').update({ offre_date: e.target.value }).eq('id', transaction.id)} />
                                  <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={async () => {
                                    await supabase.from('transactions').update({ etape_actuelle: 'negociation' }).eq('id', transaction.id);
                                    await addJournal(client.id, 'negociation', 'Négociation ouverte');
                                    fetchAll();
                                  }}>→ Négociation</button>
                                </div>
                              )}
                              {etape.id === 'negociation' && (
                                <div>
                                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Contre-offres :</div>
                                  {(transaction.contre_offres || []).map((co: any, i: number) => (
                                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, fontSize: 12 }}>
                                      <span style={{ padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: co.partie === 'vendeur' ? '#fef2f2' : '#f0fdf4', color: co.partie === 'vendeur' ? '#ef4444' : '#10b981' }}>{co.partie === 'vendeur' ? 'Vendeur' : 'Acheteur'}</span>
                                      <span style={{ fontWeight: 600 }}>{parseInt(co.montant).toLocaleString('fr-FR')}€</span>
                                      <span style={{ color: '#94a3b8' }}>{co.date}</span>
                                    </div>
                                  ))}
                                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                    <select className={styles.inp} id="co-partie" style={{ width: 110 }}>
                                      <option value="vendeur">Vendeur</option>
                                      <option value="acheteur">Acheteur</option>
                                    </select>
                                    <input className={styles.inp} type="number" id="co-montant" placeholder="Montant €" style={{ flex: 1 }} />
                                    <input className={styles.inp} type="date" id="co-date" style={{ width: 140 }} />
                                    <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={async () => {
                                      const partie = (document.getElementById('co-partie') as HTMLSelectElement).value;
                                      const montant = (document.getElementById('co-montant') as HTMLInputElement).value;
                                      const date = (document.getElementById('co-date') as HTMLInputElement).value;
                                      const newCO = [...(transaction.contre_offres || []), { partie, montant, date }];
                                      await supabase.from('transactions').update({ contre_offres: newCO }).eq('id', transaction.id);
                                      fetchAll();
                                    }}>+ Contre-offre</button>
                                  </div>
                                  <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ marginTop: 10, width: '100%' }} onClick={async () => {
                                    await supabase.from('transactions').update({ etape_actuelle: 'offre_acceptee' }).eq('id', transaction.id);
                                    await addJournal(client.id, 'offre_acceptee', 'Offre acceptée');
                                    fetchAll();
                                  }}>✓ Offre acceptée</button>
                                </div>
                              )}
                              {etape.id === 'offre_acceptee' && (
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <input className={styles.inp} type="number" placeholder="Prix final €" defaultValue={transaction.prix_final} style={{ flex: 1 }}
                                    onChange={e => supabase.from('transactions').update({ prix_final: parseInt(e.target.value) }).eq('id', transaction.id)} />
                                  <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={async () => {
                                    await supabase.from('transactions').update({ etape_actuelle: 'compromis', accord_date: new Date().toISOString().split('T')[0] }).eq('id', transaction.id);
                                    await addJournal(client.id, 'compromis', 'Compromis en cours');
                                    fetchAll();
                                  }}>→ Compromis</button>
                                </div>
                              )}
                              {etape.id === 'compromis' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <div style={{ flex: 1 }}><label className={styles.lbl}>Date compromis</label><input className={styles.inp} type="date" defaultValue={transaction.compromis_date} onChange={e => supabase.from('transactions').update({ compromis_date: e.target.value, sru_date_fin: new Date(new Date(e.target.value).getTime() + 10*86400000).toISOString().split('T')[0] }).eq('id', transaction.id)} /></div>
                                    <div style={{ flex: 1 }}><label className={styles.lbl}>Notaire</label><input className={styles.inp} defaultValue={transaction.compromis_notaire} onChange={e => supabase.from('transactions').update({ compromis_notaire: e.target.value }).eq('id', transaction.id)} /></div>
                                  </div>
                                  {transaction.sru_date_fin && <div style={{ fontSize: 12, color: '#f59e0b', background: '#fffbeb', padding: '6px 10px', borderRadius: 8 }}>⚠️ Délai SRU : {new Date(transaction.sru_date_fin).toLocaleDateString('fr-FR')}</div>}
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <div style={{ flex: 1 }}><label className={styles.lbl}>Montant prêt €</label><input className={styles.inp} type="number" defaultValue={transaction.pret_montant} onChange={e => supabase.from('transactions').update({ pret_montant: parseInt(e.target.value) }).eq('id', transaction.id)} /></div>
                                    <div style={{ flex: 1 }}><label className={styles.lbl}>Apport €</label><input className={styles.inp} type="number" defaultValue={transaction.pret_apport} onChange={e => supabase.from('transactions').update({ pret_apport: parseInt(e.target.value) }).eq('id', transaction.id)} /></div>
                                  </div>
                                  <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={async () => {
                                    await supabase.from('transactions').update({ etape_actuelle: 'acte' }).eq('id', transaction.id);
                                    await addJournal(client.id, 'acte_prevu', 'Acte définitif en cours');
                                    fetchAll();
                                  }}>→ Acte définitif</button>
                                </div>
                              )}
                              {etape.id === 'acte' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <div style={{ flex: 1 }}><label className={styles.lbl}>Date prévue</label><input className={styles.inp} type="date" defaultValue={transaction.acte_date_prevue} onChange={e => supabase.from('transactions').update({ acte_date_prevue: e.target.value }).eq('id', transaction.id)} /></div>
                                    <div style={{ flex: 1 }}><label className={styles.lbl}>Date effective</label><input className={styles.inp} type="date" defaultValue={transaction.acte_date_effective} onChange={e => supabase.from('transactions').update({ acte_date_effective: e.target.value }).eq('id', transaction.id)} /></div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <div style={{ flex: 1 }}><label className={styles.lbl}>Honoraires HT €</label><input className={styles.inp} type="number" defaultValue={transaction.honoraires_ht} onChange={e => supabase.from('transactions').update({ honoraires_ht: parseInt(e.target.value), honoraires_ttc: Math.round(parseInt(e.target.value) * 1.2) }).eq('id', transaction.id)} /></div>
                                    {transaction.honoraires_ht && <div style={{ flex: 1, paddingTop: 22 }}><div className={styles.inp} style={{ background: '#ecfdf5', color: '#10b981', fontWeight: 700 }}>TTC : {Math.round(transaction.honoraires_ht * 1.2).toLocaleString('fr-FR')}€</div></div>}
                                  </div>
                                  <button className={`${styles.btn}`} style={{ background: '#10b981', color: 'white', borderColor: '#10b981', width: '100%' }} onClick={async () => {
                                    await supabase.from('clients').update({ statut: 'bien_trouve' }).eq('id', client.id);
                                    await supabase.from('transactions').update({ etape_actuelle: 'finalise', acte_date_effective: new Date().toISOString().split('T')[0] }).eq('id', transaction.id);
                                    await addJournal(client.id, 'dossier_finalise', '🎉 Dossier finalisé — Bien trouvé !');
                                    const { data } = await supabase.from('clients').select().eq('id', client.id).single();
                                    if (data) setClient(data as Client);
                                    fetchAll();
                                  }}>🎉 Clôturer — Bien trouvé !</button>
                                </div>
                              )}
                            </div>
                          )}
                          {done && etape.id === 'offre' && transaction.offre_montant && <div style={{ fontSize: 12, color: '#64748b' }}>{transaction.offre_montant.toLocaleString('fr-FR')}€ — {transaction.offre_date || '—'}</div>}
                          {done && etape.id === 'offre_acceptee' && transaction.prix_final && <div style={{ fontSize: 12, color: '#64748b' }}>Prix final : {transaction.prix_final.toLocaleString('fr-FR')}€</div>}
                          {done && etape.id === 'compromis' && transaction.compromis_date && <div style={{ fontSize: 12, color: '#64748b' }}>Signé le {new Date(transaction.compromis_date).toLocaleDateString('fr-FR')}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB HISTORIQUE */}
          {activeTab === 'historique' && (
            <div className={styles.card}>
              {envois.length === 0 ? (
                <div className={styles.emptyTab}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
                  <div style={{ fontWeight: 700, color: '#1a2332' }}>Aucun envoi</div>
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>Les PDFs et mails envoyés apparaissent ici</div>
                </div>
              ) : envois.map(e => (
                <div key={e.id} className={styles.histRow}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
                    {e.type === 'selection_biens' ? '📄' : e.type === 'mail_libre' ? '✉️' : '🤝'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1a2332' }}>{e.objet || e.type}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{e.destinataires?.join(', ')}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1a2332' }}>{new Date(e.created_at).toLocaleDateString('fr-FR')}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{e.sms_envoye ? '✉️ + 📱' : '✉️'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB JOURNAL */}
          {activeTab === 'journal' && (
            <div className={styles.card} style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowAddAction(true)}>+ Ajouter une action</button>
              </div>
              {journal.length === 0 ? (
                <div className={styles.emptyTab}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📓</div>
                  <div style={{ fontWeight: 700, color: '#1a2332' }}>Journal vide</div>
                </div>
              ) : journal.map((j, i) => (
                <div key={j.id} style={{ display: 'flex', gap: 12, paddingBottom: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f8fafc', border: '1px solid #e3e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                      {j.type === 'pdf_envoye' ? '📄' : j.type === 'visite_effectuee' ? '📅' : j.type === 'offre_faite' ? '🏠' : j.type === 'dossier_finalise' ? '🎉' : j.type === 'creation' ? '✨' : '📝'}
                    </div>
                    {i < journal.length - 1 && <div style={{ width: 1, flex: 1, background: '#f1f5f9', marginTop: 4 }} />}
                  </div>
                  <div style={{ flex: 1, paddingTop: 3 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1a2332' }}>{j.titre}</div>
                    {j.description && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{j.description}</div>}
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{new Date(j.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL AJOUTER BIEN */}
      {showAddBien && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) { setShowAddBien(false); setBienForm(null); setUrlBien(''); }}}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Ajouter un bien</h2>
              <button className={styles.modalClose} onClick={() => { setShowAddBien(false); setBienForm(null); setUrlBien(''); }}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {/* ÉTAPE 1 — URL */}
              <div style={{ marginBottom: 16 }}>
                <label className={styles.lbl}>URL de l'annonce *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className={styles.inp} value={urlBien} onChange={e => setUrlBien(e.target.value)} placeholder="https://www.seloger.com/annonces/..." style={{ flex: 1 }} />
                  <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={extractBien} disabled={extracting || !urlBien}>
                    {extracting ? '⏳ Extraction...' : '🔍 Extraire'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>SeLoger, LeBonCoin, PAP, Bien'ici, Logic-Immo, Jinka...</div>
              </div>

              {/* FORMULAIRE BIEN */}
              {bienForm !== null && (
                <>
                  <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#065f46', marginBottom: 14 }}>
                    {bienForm.titre ? '✅ Informations extraites — vérifiez et complétez si besoin' : 'ℹ️ Extraction impossible — remplissez manuellement'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ gridColumn: '1 / -1' }}><label className={styles.lbl}>Titre</label><input className={styles.inp} value={bienForm.titre || ''} onChange={e => setBienForm((f: any) => ({ ...f, titre: e.target.value }))} /></div>
                    <div><label className={styles.lbl}>Type</label>
                      <select className={styles.inp} value={bienForm.type_bien || ''} onChange={e => setBienForm((f: any) => ({ ...f, type_bien: e.target.value }))}>
                        <option>Appartement</option><option>Maison</option><option>Loft</option><option>Studio</option>
                      </select>
                    </div>
                    <div><label className={styles.lbl}>Source portail</label><input className={styles.inp} value={bienForm.source_portail || ''} onChange={e => setBienForm((f: any) => ({ ...f, source_portail: e.target.value }))} placeholder="SeLoger, PAP..." /></div>
                    <div><label className={styles.lbl}>Ville</label><input className={styles.inp} value={bienForm.ville || ''} onChange={e => setBienForm((f: any) => ({ ...f, ville: e.target.value }))} /></div>
                    <div><label className={styles.lbl}>Code postal</label><input className={styles.inp} value={bienForm.code_postal || ''} onChange={e => setBienForm((f: any) => ({ ...f, code_postal: e.target.value }))} /></div>
                    <div><label className={styles.lbl}>Surface m²</label><input className={styles.inp} type="number" value={bienForm.surface || ''} onChange={e => setBienForm((f: any) => ({ ...f, surface: e.target.value }))} /></div>
                    <div><label className={styles.lbl}>Pièces</label><input className={styles.inp} type="number" value={bienForm.nb_pieces || ''} onChange={e => setBienForm((f: any) => ({ ...f, nb_pieces: e.target.value }))} /></div>
                    <div><label className={styles.lbl}>Étage</label><input className={styles.inp} type="number" value={bienForm.etage || ''} onChange={e => setBienForm((f: any) => ({ ...f, etage: e.target.value }))} /></div>
                    <div><label className={styles.lbl}>DPE</label><input className={styles.inp} value={bienForm.dpe || ''} onChange={e => setBienForm((f: any) => ({ ...f, dpe: e.target.value }))} placeholder="A, B, C..." /></div>
                    <div><label className={styles.lbl}>Prix vendeur €</label><input className={styles.inp} type="number" value={bienForm.prix_vendeur || ''} onChange={e => setBienForm((f: any) => ({ ...f, prix_vendeur: e.target.value }))} /></div>
                    <div>
                      <label className={styles.lbl}>Commission</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <select className={styles.inp} style={{ width: 80 }} value={bienForm.commission_type} onChange={e => setBienForm((f: any) => ({ ...f, commission_type: e.target.value }))}>
                          <option value="pourcentage">%</option><option value="montant">€</option>
                        </select>
                        <input className={styles.inp} type="number" value={bienForm.commission_val || ''} onChange={e => setBienForm((f: any) => ({ ...f, commission_val: e.target.value }))} />
                      </div>
                    </div>
                    <div><label className={styles.lbl}>Prix acquéreur (auto)</label><div className={styles.inp} style={{ background: '#fef9c3', fontWeight: 700, color: '#854d0e' }}>{prixAcquereur ? `${prixAcquereur.toLocaleString('fr-FR')}€` : '—'}</div></div>
                    <div><label className={styles.lbl}>Agence / Contact</label><input className={styles.inp} value={bienForm.agence_nom || ''} onChange={e => setBienForm((f: any) => ({ ...f, agence_nom: e.target.value }))} /></div>
                    <div style={{ gridColumn: '1 / -1' }}><label className={styles.lbl}>Description</label><textarea className={styles.inp} rows={3} value={bienForm.description || ''} onChange={e => setBienForm((f: any) => ({ ...f, description: e.target.value }))} /></div>
                  </div>
                </>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => { setShowAddBien(false); setBienForm(null); setUrlBien(''); }}>Annuler</button>
              {bienForm !== null && <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveBien} disabled={saving}>{saving ? 'Sauvegarde...' : '✓ Ajouter ce bien'}</button>}
            </div>
          </div>
        </div>
      )}

      {/* MODAL AJOUTER ACTION */}
      {showAddAction && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowAddAction(false); }}>
          <div className={styles.modal} style={{ maxWidth: 480 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Ajouter une action</h2>
              <button className={styles.modalClose} onClick={() => setShowAddAction(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div><label className={styles.lbl}>Type d'action</label>
                <select className={styles.inp} value={actionForm.type} onChange={e => setActionForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="note">📝 Note libre</option>
                  <option value="appel">📞 Appel passé</option>
                  <option value="rdv">🤝 RDV physique</option>
                  <option value="relance_manuelle">🔔 Relance manuelle</option>
                  <option value="envoi_externe">📤 Envoi externe</option>
                </select>
              </div>
              <div><label className={styles.lbl}>Titre</label><input className={styles.inp} value={actionForm.titre} onChange={e => setActionForm(f => ({ ...f, titre: e.target.value }))} placeholder="Ex : Appel de suivi" /></div>
              <div><label className={styles.lbl}>Description / Notes</label><textarea className={styles.inp} rows={3} value={actionForm.description} onChange={e => setActionForm(f => ({ ...f, description: e.target.value }))} /></div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowAddAction(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveAction} disabled={!actionForm.titre}>✓ Ajouter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
