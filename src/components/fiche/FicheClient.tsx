'use client';
import { useState, useEffect } from 'react';
import { supabase, addJournal } from '@/lib/supabase';
import type { Client } from '@/lib/supabase';
import styles from './FicheClient.module.css';

const QUARTIERS: Record<string, { ville: string; quartiers: string[] }> = {
  '75001': { ville: 'Paris 1er', quartiers: ['Saint-Germain-l\'Auxerrois','Les Halles','Palais Royal','Place Vendôme'] },
  '75006': { ville: 'Paris 6ème', quartiers: ['Saint-Germain-des-Prés','Luxembourg','Vavin','Notre-Dame-des-Champs','Saint-Sulpice'] },
  '75007': { ville: 'Paris 7ème', quartiers: ['Saint-Thomas-d\'Aquin','Invalides','École Militaire','Gros-Caillou','Tour Eiffel'] },
  '75008': { ville: 'Paris 8ème', quartiers: ['Champs-Élysées','Faubourg du Roule','Madeleine','Europe'] },
  '75015': { ville: 'Paris 15ème', quartiers: ['Grenelle','Javel','Saint-Lambert','Necker','Beaugrenelle','Convention','Commerce','Falguière','Brancion'] },
  '75016': { ville: 'Paris 16ème', quartiers: ['Auteuil','Muette','Porte Dauphine','Chaillot','Victor Hugo','Trocadéro'] },
  '75017': { ville: 'Paris 17ème', quartiers: ['Ternes','Plaine de Monceau','Batignolles','Epinettes'] },
  '92100': { ville: 'Boulogne-Billancourt', quartiers: ['Parchamp-Albert Kahn','Silly-Gallieni','Renault-Billancourt','Point-du-Jour','Vaillant-Marcel Sembat','Jean-Jaurès-Reine'] },
  '92200': { ville: 'Neuilly-sur-Seine', quartiers: ['Neuilly Centre','Bagatelle','Roule','Pont de Neuilly'] },
  '92300': { ville: 'Levallois-Perret', quartiers: ['Centre Levallois','Pont de Levallois','Victor Hugo'] },
  '92400': { ville: 'Courbevoie', quartiers: ['Becon','La Défense','Centre Courbevoie'] },
  '92500': { ville: 'Rueil-Malmaison', quartiers: ['Centre Rueil','Jonchères','Buzenval'] },
  '92600': { ville: 'Asnières-sur-Seine', quartiers: ['Centre Asnières','Bords de Seine'] },
  '92800': { ville: 'Puteaux', quartiers: ['Centre Puteaux','La Défense','Île de Puteaux'] },
};

interface Props { client: Client; onBack: () => void; onNavigate: (page: string, data?: unknown) => void; }

export default function FicheClient({ client: init, onBack }: Props) {
  const [client, setClient] = useState<Client>(init);
  const [tab, setTab] = useState('biens');
  const [biens, setBiens] = useState<any[]>([]);
  const [visites, setVisites] = useState<any[]>([]);
  const [transaction, setTransaction] = useState<any>(null);
  const [envois, setEnvois] = useState<any[]>([]);
  const [journal, setJournal] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // Modals
  const [showContact, setShowContact] = useState(false);
  const [showCriteres, setShowCriteres] = useState(false);
  const [showMandat, setShowMandat] = useState(false);
  const [showBien, setShowBien] = useState(false);
  const [showAction, setShowAction] = useState(false);

  // Forms
  const [cf, setCf] = useState({ prenom: client.prenom, nom: client.nom, adresse: client.adresse||'', email1: client.emails?.[0]||'', email2: client.emails?.[1]||'', tel1: client.telephones?.[0]||'', tel2: client.telephones?.[1]||'' });
  const [crit, setCrit] = useState({ types_bien: (client.type_bien ? client.type_bien.split(',').map((t:string)=>t.trim()).filter(Boolean) : []) as string[], budget_min: client.budget_min?.toString()||'', budget_max: client.budget_max?.toString()||'', surface_min: client.surface_min?.toString()||'', surface_max: client.surface_max?.toString()||'', nb_pieces_min: client.nb_pieces_min?.toString()||'', nb_pieces_max: client.nb_pieces_max?.toString()||'', chambres_min: client.chambres_min?.toString()||'', secteurs: client.secteurs||[], notes: client.notes||'', parking: client.parking||false, balcon: client.balcon||false, terrasse: client.terrasse||false, jardin: client.jardin||false, cave: client.cave||false, ascenseur: client.ascenseur||false, gardien: client.gardien||false, interphone: (client as any).interphone||false, digicode: (client as any).digicode||false, rdc_exclu: client.rdc_exclu||false, dernier_etage: client.dernier_etage||false, etage_min: client.etage_min?.toString()||'', dpe_max: client.dpe_max||'', annee_min: client.annee_construction_min?.toString()||'' });
  const [secteurVilleActive, setSecteurVilleActive] = useState<{cp:string,ville:string}|null>(null);
  const [mandat, setMandat] = useState({ date_signature: client.mandat_date_signature||'', duree: client.mandat_duree?.toString()||'3', honoraires: client.mandat_honoraires||'3,5% TTC', date_expiration: client.mandat_date_expiration||'' });
  const [actionF, setActionF] = useState({ type: 'note', titre: '', description: '' });

  // Bien
  const [url, setUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [bienForm, setBienForm] = useState<any>(null);

  // Secteurs
  const [cpQ, setCpQ] = useState('');
  const [cpSug, setCpSug] = useState<any[]>([]);
  const [selCP, setSelCP] = useState('');

  useEffect(() => { load(); }, [client.id]);

  async function load() {
    const [{ data: b }, { data: v }, { data: t }, { data: e }, { data: j }] = await Promise.all([
      supabase.from('biens').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
      supabase.from('visites').select('*').eq('client_id', client.id).order('date_visite'),
      supabase.from('transactions').select('*').eq('client_id', client.id).maybeSingle(),
      supabase.from('envois').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
      supabase.from('journal').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
    ]);
    setBiens(b||[]); setVisites(v||[]); setTransaction(t); setEnvois(e||[]); setJournal(j||[]);
  }

  async function refresh() {
    const { data } = await supabase.from('clients').select('*').eq('id', client.id).single();
    if (data) setClient(data as Client);
  }

  async function searchCP(q: string) {
    setCpQ(q);
    if (q.length < 2) { setCpSug([]); return; }
    const local = Object.entries(QUARTIERS).filter(([cp, info]) => cp.includes(q) || info.ville.toLowerCase().includes(q.toLowerCase())).map(([cp, info]) => ({ cp, ville: info.ville }));
    if (local.length > 0) { setCpSug(local.slice(0, 6)); return; }
    try {
      const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,codesPostaux&boost=population&limit=8`);
      const data = await r.json();
      setCpSug(data.flatMap((d: any) => d.codesPostaux.map((cp: string) => ({ cp, ville: d.nom }))).slice(0, 6));
    } catch { setCpSug([]); }
  }

  function addSecteur(cp: string, ville: string, quartier?: string) {
    const label = quartier ? `${quartier} (${ville})` : `${ville} (${cp})`;
    if (!crit.secteurs.includes(label)) setCrit(f => ({ ...f, secteurs: [...f.secteurs, label] }));
    setCpQ(''); setCpSug([]); setSelCP('');
  }

  async function saveContact() {
    setSaving(true);
    const { data } = await supabase.from('clients').update({ prenom: cf.prenom, nom: cf.nom, adresse: cf.adresse||null, emails: [cf.email1, cf.email2].filter(Boolean), telephones: [cf.tel1, cf.tel2].filter(Boolean) }).eq('id', client.id).select().single();
    if (data) { setClient(data as Client); await addJournal(client.id, 'fiche_modifiee', 'Contact mis à jour'); }
    setSaving(false); setShowContact(false);
  }

  async function saveCriteres() {
    setSaving(true);
    const { data } = await supabase.from('clients').update({
      type_bien: crit.types_bien.length > 0 ? crit.types_bien.join(', ') : null,
      budget_min: crit.budget_min ? parseInt(crit.budget_min) : null,
      budget_max: crit.budget_max ? parseInt(crit.budget_max) : null,
      surface_min: crit.surface_min ? parseInt(crit.surface_min) : null,
      surface_max: crit.surface_max ? parseInt(crit.surface_max) : null,
      nb_pieces_min: crit.nb_pieces_min ? parseInt(crit.nb_pieces_min) : null,
      nb_pieces_max: crit.nb_pieces_max ? parseInt(crit.nb_pieces_max) : null,
      chambres_min: crit.chambres_min ? parseInt(crit.chambres_min) : null,
      secteurs: crit.secteurs,
      notes: crit.notes || null,
      // Équipements
      parking: crit.parking,
      cave: crit.cave,
      balcon: crit.balcon,
      terrasse: crit.terrasse,
      jardin: crit.jardin,
      ascenseur: crit.ascenseur,
      gardien: crit.gardien,
      interphone: (crit as any).interphone || false,
      digicode: (crit as any).digicode || false,
      // Étage
      rdc_exclu: crit.rdc_exclu,
      dernier_etage: crit.dernier_etage,
      etage_min: crit.etage_min ? parseInt(crit.etage_min) : null,
      // DPE + année
      dpe_max: crit.dpe_max || null,
      annee_construction_min: crit.annee_min ? parseInt(crit.annee_min) : null,
    }).eq('id', client.id).select().single();
    if (data) { setClient(data as Client); await addJournal(client.id, 'criteres_modifies', 'Critères mis à jour'); }
    setSaving(false); setShowCriteres(false);
  }

  async function saveMandat() {
    setSaving(true);
    let exp = mandat.date_expiration;
    if (mandat.date_signature && mandat.duree && !exp) { const d = new Date(mandat.date_signature); d.setMonth(d.getMonth() + parseInt(mandat.duree)); exp = d.toISOString().split('T')[0]; }
    const { data } = await supabase.from('clients').update({ mandat_date_signature: mandat.date_signature||null, mandat_duree: mandat.duree ? parseInt(mandat.duree) : null, mandat_honoraires: mandat.honoraires||null, mandat_date_expiration: exp||null }).eq('id', client.id).select().single();
    if (data) { setClient(data as Client); await addJournal(client.id, 'mandat_modifie', 'Mandat mis à jour'); }
    setSaving(false); setShowMandat(false);
  }

  async function changeStatut(statut: string) {
    const { data } = await supabase.from('clients').update({ statut }).eq('id', client.id).select().single();
    if (data) { setClient(data as Client); await addJournal(client.id, 'statut_change', `Statut → ${statut}`); }
  }

  async function changeChaleur(chaleur: string) {
    const { data } = await supabase.from('clients').update({ chaleur }).eq('id', client.id).select().single();
    if (data) setClient(data as Client);
  }

  async function extract() {
    if (!url) return;
    setExtracting(true);
    try {
      const res = await fetch('/api/extract-bien', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (data.bien) {
        setBienForm({ ...data.bien, url, commission_type: 'pourcentage', commission_val: 3.5, _partial: data.partial, _reason: data.reason });
      } else {
        setBienForm({ url, titre: '', prix_vendeur: '', surface: '', nb_pieces: '', ville: '', description: '', commission_type: 'pourcentage', commission_val: 3.5 });
      }
    } catch { setBienForm({ url, titre: '', prix_vendeur: '', surface: '', nb_pieces: '', ville: '', description: '', commission_type: 'pourcentage', commission_val: 3.5 }); }
    setExtracting(false);
  }

  const prixAcq = bienForm ? (bienForm.commission_type === 'pourcentage' ? Math.round((parseFloat(bienForm.prix_vendeur)||0) * (1 + (parseFloat(bienForm.commission_val)||0) / 100)) : (parseFloat(bienForm.prix_vendeur)||0) + (parseFloat(bienForm.commission_val)||0)) : 0;

  async function saveBien() {
    if (!bienForm) return;
    setSaving(true);
    const { data: ex } = await supabase.from('biens').select('id').eq('client_id', client.id).eq('url', bienForm.url).maybeSingle();
    if (ex) { alert('Ce bien est déjà dans la liste !'); setSaving(false); return; }
    await supabase.from('biens').insert({ client_id: client.id, url: bienForm.url, titre: bienForm.titre, ville: bienForm.ville, code_postal: bienForm.code_postal, type_bien: bienForm.type_bien, surface: parseFloat(bienForm.surface)||null, nb_pieces: parseInt(bienForm.nb_pieces)||null, etage: parseInt(bienForm.etage)||null, parking: bienForm.parking||false, dpe: bienForm.dpe, description: bienForm.description, prix_vendeur: parseFloat(bienForm.prix_vendeur)||null, commission_type: bienForm.commission_type, commission_val: parseFloat(bienForm.commission_val)||null, prix_acquereur: prixAcq||null, photos: bienForm.photos||[], source_portail: bienForm.source_portail, agence_nom: bienForm.agence_nom, badge_retour: 'propose' });
    await addJournal(client.id, 'bien_ajoute', `Bien ajouté — ${bienForm.titre||bienForm.ville||''}`, bienForm.url);
    setSaving(false); setShowBien(false); setUrl(''); setBienForm(null); load();
  }

  async function changeBadge(bienId: string, badge: string) {
    await supabase.from('biens').update({ badge_retour: badge }).eq('id', bienId);
    if (badge === 'offre_faite' && !transaction) { await supabase.from('transactions').insert({ client_id: client.id, bien_id: bienId, etape_actuelle: 'offre' }); await addJournal(client.id, 'offre_faite', 'Offre faite — Transaction ouverte'); }
    load();
  }

  async function planifierVisite(bienId: string) {
    await supabase.from('visites').insert({ client_id: client.id, bien_id: bienId, statut: 'a_venir' });
    await supabase.from('biens').update({ badge_retour: 'souhaite_visiter' }).eq('id', bienId);
    await addJournal(client.id, 'visite_planifiee', 'Visite planifiée');
    load();
  }

  async function saveAction() {
    const typeLabels: Record<string, string> = { appel: 'Appel passé', rdv: 'RDV physique', note: 'Note', relance_manuelle: 'Relance manuelle', envoi_externe: 'Envoi externe', email_libre: 'Email envoyé' };
    const titre = actionF.titre.trim() || typeLabels[actionF.type] || 'Action';
    await addJournal(client.id, actionF.type, titre, actionF.description);
    setShowAction(false); setActionF({ type: 'note', titre: '', description: '' }); load();
  }

  const jours = Math.floor((Date.now() - new Date(client.created_at).getTime()) / 86400000);
  const joursMandat = client.mandat_date_expiration ? Math.floor((new Date(client.mandat_date_expiration).getTime() - Date.now()) / 86400000) : null;

  const TABS = [
    { id: 'biens', label: `🏠 Biens (${biens.length})` },
    { id: 'visites', label: `📅 Visites (${visites.filter(v => v.statut === 'effectuee').length})` },
    { id: 'transaction', label: '📋 Transaction' },
    { id: 'historique', label: `📄 Historique (${envois.length})` },
    { id: 'journal', label: `📓 Journal (${journal.length})` },
  ];

  const BADGES: Record<string, { label: string; color: string; bg: string }> = {
    propose:          { label: '📋 Proposé',         color: '#64748b', bg: '#f8fafc' },
    interesse:        { label: '👍 Intéressé',        color: '#3b82f6', bg: '#eff6ff' },
    souhaite_visiter: { label: '👀 Souhaite visiter', color: '#8b5cf6', bg: '#f5f3ff' },
    visite:           { label: '✅ Visité',            color: '#10b981', bg: '#ecfdf5' },
    offre_faite:      { label: '🟡 Offre faite',      color: '#f59e0b', bg: '#fffbeb' },
    refuse:           { label: '❌ Refusé',            color: '#ef4444', bg: '#fef2f2' },
  };

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <div className={styles.pageHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className={styles.backBtn} onClick={onBack}>← Clients</button>
          <span style={{ color: '#94a3b8' }}>/</span>
          <span style={{ fontWeight: 600, color: '#1a2332', fontSize: 14 }}>{client.prenom} {client.nom}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={styles.btn} onClick={() => setShowAction(true)}>+ Action</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowBien(true)}>+ Ajouter un bien</button>
        </div>
      </div>

      {/* IDENTITÉ */}
      <div className={styles.identiteBar}>
        <div className={styles.avatarWrap}>
          <div className={styles.avatar}>{client.prenom[0]}{client.nom[0]}</div>
          <div>
            <div className={styles.clientName}>{client.prenom} {client.nom}</div>
            <div className={styles.clientMeta}>{client.reference} · Suivi depuis {jours} jour{jours > 1 ? 's' : ''} · Créé le {new Date(client.created_at).toLocaleDateString('fr-FR')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* STATUT DROPDOWN */}
          <div style={{ position: 'relative' }}>
            <select
              value={client.statut}
              onChange={e => changeStatut(e.target.value)}
              style={{
                padding: '7px 32px 7px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', border: '1px solid #e2e8f0',
                background: (client.statut as string) === 'prospect' ? '#f5f3ff' : (client.statut as string) === 'actif' ? '#ecfdf5' : (client.statut as string) === 'suspendu' ? '#fffbeb' : (client.statut as string) === 'offre_ecrite' ? '#fffbeb' : (client.statut as string) === 'bien_trouve' ? '#eff6ff' : '#fef2f2',
                color: (client.statut as string) === 'prospect' ? '#8b5cf6' : (client.statut as string) === 'actif' ? '#10b981' : (client.statut as string) === 'suspendu' ? '#f59e0b' : (client.statut as string) === 'offre_ecrite' ? '#f59e0b' : (client.statut as string) === 'bien_trouve' ? '#3b82f6' : '#ef4444',
                appearance: 'none', WebkitAppearance: 'none', outline: 'none',
              }}>
              <option value="prospect">🟣 Prospect</option>
              <option value="actif">🟢 Actif</option>
              <option value="suspendu">⏸️ Suspendu</option>
              <option value="offre_ecrite">✍️ Offre écrite</option>
              <option value="bien_trouve">✅ Bien trouvé</option>
              <option value="perdu">🔴 Perdu</option>
            </select>
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 10 }}>▼</span>
          </div>
          <div style={{ width: 1, height: 24, background: '#e2e8f0', margin: '0 2px' }} />
          {[{k:'tres_chaud',l:'🔥'},{k:'interesse',l:'👍'},{k:'tiede',l:'😐'},{k:'froid',l:'❄️'}].map(c => (
            <button key={c.k} onClick={() => changeChaleur(c.k)} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${client.chaleur === c.k ? '#c9a84c' : '#e2e8f0'}`, background: client.chaleur === c.k ? '#fef9c3' : '#f8fafc', cursor: 'pointer', fontSize: 18, transition: 'all 0.15s' }}>{c.l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[{val: biens.length, l:'Biens présentés',c:'#1a2332'},{val: visites.filter(v=>v.statut==='effectuee').length,l:'Visites effectuées',c:'#1a2332'},{val: biens.filter(b=>b.badge_retour==='offre_faite').length,l:'Offre(s)',c:'#c9a84c'},{val:`${jours}j`,l:'Suivi',c:'#1a2332'}].map((s, i) => (
            <div key={i} className={styles.syntheseItem}>
              <div className={styles.syntheseVal} style={{ color: s.c }}>{s.val}</div>
              <div className={styles.syntheseLabel}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CONTENU */}
      <div className={styles.contentWrap}>

        {/* ROW INFO */}
        <div className={styles.infoRow}>
          {/* CONTACT */}
          <div className={styles.infoCard}>
            <div className={styles.infoCardHeader}>📞 Contact <button className={styles.editBtn} onClick={() => { setCf({ prenom: client.prenom, nom: client.nom, adresse: client.adresse||'', email1: client.emails?.[0]||'', email2: client.emails?.[1]||'', tel1: client.telephones?.[0]||'', tel2: client.telephones?.[1]||'' }); setShowContact(true); }}>✏️ Modifier</button></div>
            <div className={styles.infoCardBody}>
              {client.telephones?.filter(Boolean).map(t => <div key={t} className={styles.contactLine}><span className={styles.contactIcon}>📞</span><span>{t}</span></div>)}
              {client.emails?.filter(Boolean).map(e => <div key={e} className={styles.contactLine}><span className={styles.contactIcon}>✉️</span><span>{e}</span></div>)}
              {client.adresse && <div className={styles.contactLine}><span className={styles.contactIcon}>📍</span><span>{client.adresse}</span></div>}
              {!client.telephones?.length && !client.emails?.length && !client.adresse && <div style={{ color: '#94a3b8', fontSize: 13 }}>Non renseigné</div>}
            </div>
          </div>

          {/* CRITÈRES */}
          <div className={styles.infoCard} style={{ flex: 2 }}>
            <div className={styles.infoCardHeader}>🎯 Critères de recherche <button className={styles.editBtn} onClick={() => { setCrit({ types_bien: (client.type_bien ? client.type_bien.split(',').map((t:string)=>t.trim()).filter(Boolean) : []) as string[], budget_min: client.budget_min?.toString()||'', budget_max: client.budget_max?.toString()||'', surface_min: client.surface_min?.toString()||'', surface_max: client.surface_max?.toString()||'', nb_pieces_min: client.nb_pieces_min?.toString()||'', nb_pieces_max: client.nb_pieces_max?.toString()||'', chambres_min: client.chambres_min?.toString()||'', secteurs: client.secteurs||[], notes: client.notes||'', parking: client.parking||false, balcon: client.balcon||false, terrasse: client.terrasse||false, jardin: client.jardin||false, cave: client.cave||false, ascenseur: client.ascenseur||false, gardien: client.gardien||false, interphone: (client as any).interphone||false, digicode: (client as any).digicode||false, rdc_exclu: client.rdc_exclu||false, dernier_etage: client.dernier_etage||false, etage_min: client.etage_min?.toString()||'', dpe_max: client.dpe_max||'', annee_min: client.annee_construction_min?.toString()||'' }); setShowCriteres(true); }}>✏️ Modifier</button></div>
            <div className={styles.infoCardBody}>
              {(client.type_bien || client.budget_min || client.surface_min || client.nb_pieces_min || client.secteurs?.length || client.dpe_max || client.parking || client.balcon || client.terrasse || client.jardin || client.cave || client.ascenseur) ? (
                <div className={styles.criteresGrid}>
                  {client.type_bien && <div className={styles.critItem}><div className={styles.critLabel}>Type</div><div className={styles.critVal}>{client.type_bien}</div></div>}
                  {client.budget_min && <div className={styles.critItem}><div className={styles.critLabel}>Budget</div><div className={styles.critVal}>{(client.budget_min/1000).toFixed(0)}–{((client.budget_max||0)/1000).toFixed(0)}k€</div></div>}
                  {client.surface_min && <div className={styles.critItem}><div className={styles.critLabel}>Surface</div><div className={styles.critVal}>{client.surface_min}{client.surface_max ? `–${client.surface_max}` : '+'}m²</div></div>}
                  {client.nb_pieces_min && <div className={styles.critItem}><div className={styles.critLabel}>Pièces</div><div className={styles.critVal}>{client.nb_pieces_min}{client.nb_pieces_max ? `–${client.nb_pieces_max}` : '+'}P</div></div>}
                  {client.chambres_min && <div className={styles.critItem}><div className={styles.critLabel}>Chambres min</div><div className={styles.critVal}>{client.chambres_min}</div></div>}
                  {client.dpe_max && <div className={styles.critItem}><div className={styles.critLabel}>DPE max</div><div className={styles.critVal}>{client.dpe_max}</div></div>}
                  {client.etage_min && <div className={styles.critItem}><div className={styles.critLabel}>Étage min</div><div className={styles.critVal}>{client.etage_min}</div></div>}
                  {(client.parking || client.balcon || client.terrasse || client.jardin || client.cave || client.ascenseur || client.gardien || (client as any).interphone || (client as any).digicode) && (
                    <div className={styles.critItem} style={{ gridColumn: '1/-1' }}>
                      <div className={styles.critLabel}>Équipements</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
                        {client.parking && <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>🅿️ Parking</span>}
                        {client.balcon && <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>🌿 Balcon</span>}
                        {client.terrasse && <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>☀️ Terrasse</span>}
                        {client.jardin && <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>🌳 Jardin</span>}
                        {client.cave && <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>📦 Cave</span>}
                        {client.ascenseur && <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>🛗 Ascenseur</span>}
                        {client.gardien && <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>👮 Gardien</span>}
                        {(client as any).interphone && <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>🔔 Interphone</span>}
                        {(client as any).digicode && <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>🔢 Digicode</span>}
                      </div>
                    </div>
                  )}
                  {client.rdc_exclu && <div className={styles.critItem}><div className={styles.critLabel}>Étage</div><div className={styles.critVal} style={{fontSize:12}}>🚫 RDC exclu{client.dernier_etage ? ' · 🏙️ Dernier ét.' : ''}</div></div>}
                  {client.annee_construction_min && <div className={styles.critItem}><div className={styles.critLabel}>Année min</div><div className={styles.critVal}>{client.annee_construction_min}</div></div>}
                  {client.secteurs?.length > 0 && <div className={styles.critItem} style={{ gridColumn: '1/-1' }}><div className={styles.critLabel}>Secteurs</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>{client.secteurs.map(s => <span key={s} className={styles.secteurTag}>{s}</span>)}</div></div>}
                  {client.notes && <div className={styles.critItem} style={{ gridColumn: '1/-1' }}><div className={styles.critLabel}>Notes</div><div style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic' }}>{client.notes}</div></div>}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>Aucun critère défini</span>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowCriteres(true)}>+ Définir</button>
                </div>
              )}
            </div>
          </div>

          {/* MANDAT */}
          <div className={styles.infoCard} style={{ background: '#1a2332', minWidth: 210 }}>
            <div className={styles.infoCardHeader} style={{ borderBottomColor: 'rgba(255,255,255,0.08)' }}>
              <span style={{ color: '#c9a84c' }}>📋 Mandat</span>
              <button className={styles.editBtn} style={{ color: 'rgba(255,255,255,0.5)' }} onClick={() => { setMandat({ date_signature: client.mandat_date_signature||'', duree: client.mandat_duree?.toString()||'3', honoraires: client.mandat_honoraires||'3,5% TTC', date_expiration: client.mandat_date_expiration||'' }); setShowMandat(true); }}>✏️</button>
            </div>
            <div className={styles.infoCardBody}>
              {client.mandat_date_signature ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[{l:'Signature',v:new Date(client.mandat_date_signature).toLocaleDateString('fr-FR')},{l:'Durée',v:client.mandat_duree ? `${client.mandat_duree} mois` : '—'},{l:'Honoraires',v:client.mandat_honoraires||'—'}].map(r => (
                    <div key={r.l}><div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 1 }}>{r.l}</div><div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{r.v}</div></div>
                  ))}
                  {joursMandat !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginTop: 2 }}>
                      <div><div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 1 }}>Expiration</div><div style={{ fontSize: 22, fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, color: joursMandat < 15 ? '#fca5a5' : 'white' }}>{joursMandat}j</div></div>
                      <span style={{ fontSize: 10, background: joursMandat > 15 ? 'rgba(201,168,76,0.15)' : 'rgba(239,68,68,0.2)', color: joursMandat > 15 ? '#c9a84c' : '#fca5a5', border: `1px solid ${joursMandat > 15 ? 'rgba(201,168,76,0.2)' : 'rgba(239,68,68,0.3)'}`, padding: '4px 10px', borderRadius: 8, fontWeight: 700 }}>{joursMandat > 0 ? 'Actif' : '⚠️ Expiré'}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginBottom: 10 }}>Non renseigné</div>
                  <button onClick={() => setShowMandat(true)} style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Compléter</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BOUTONS D'ENVOI */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e3e8f0', padding: '14px 18px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 13, color: '#1a2332', marginRight: 4 }}>📤 Envoyer :</div>

          {/* SÉLECTION DE BIENS */}
          <button
            onClick={() => {
              if (biens.length === 0) { alert('Ajoutez d’abord des biens à la fiche de ce client.'); return; }
              setTab('biens');
              alert('Fonctionnalité PDF en cours de développement. Les biens seront inclus dans la sélection.');
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 10, border: '1px solid #1a2332', background: '#1a2332', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
            onMouseOver={e => (e.currentTarget.style.background = '#243044')}
            onMouseOut={e => (e.currentTarget.style.background = '#1a2332')}>
            📄 Sélection de biens
          </button>

          {/* PRÉSENTATION SERVICES */}
          <button
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
            onClick={() => alert('PDF Présentation des services — à configurer dans Paramètres (V2)')}
            onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
            onMouseOut={e => (e.currentTarget.style.background = 'white')}>
            🤝 Présentation services
          </button>

          {/* COMPTE-RENDU VISITES */}
          <button
            onClick={() => {
              if (visites.filter(v => v.statut === 'effectuee').length === 0) { alert('Aucune visite effectuée à inclure dans le compte-rendu.'); return; }
              setTab('visites');
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
            onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
            onMouseOut={e => (e.currentTarget.style.background = 'white')}>
            📋 Compte-rendu visites
          </button>

          {/* MAIL LIBRE */}
          <button
            onClick={() => setTab('journal')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', marginLeft: 'auto' }}
            onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
            onMouseOut={e => (e.currentTarget.style.background = 'white')}>
            ✉️ Mail libre
          </button>
        </div>
        <div className={styles.tabs}>
          {TABS.map(t => <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>

        {/* BIENS */}
        {tab === 'biens' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {biens.length === 0 ? (
              <div className={styles.emptyTab}><div style={{ fontSize: 40, marginBottom: 12 }}>🏠</div><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 17, color: '#1a2332', marginBottom: 6 }}>Aucun bien proposé</div><div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 18 }}>Collez une URL d'annonce SeLoger, LeBonCoin, PAP...</div><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowBien(true)}>+ Ajouter un bien par URL</button></div>
            ) : biens.map(b => {
              const badge = BADGES[b.badge_retour] || BADGES.propose;
              return (
                <div key={b.id} className={styles.bienCard}>
                  <div className={styles.bienPhoto}>{b.photos?.[0] ? <img src={b.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🏠'}</div>
                  <div className={styles.bienBody}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 5 }}>
                      <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 15, color: '#1a2332' }}>{b.titre || `${b.type_bien||'Bien'} — ${b.ville||'—'}`}</div>
                      <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 18, color: '#c9a84c', flexShrink: 0 }}>{b.prix_acquereur ? `${b.prix_acquereur.toLocaleString('fr-FR')}€` : '—'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#64748b', marginBottom: 10, flexWrap: 'wrap' }}>
                      {b.surface && <span>📐 {b.surface}m²</span>}{b.nb_pieces && <span>🚪 {b.nb_pieces}P</span>}{b.etage && <span>🏢 {b.etage}ème</span>}{b.parking && <span>🅿️</span>}{b.dpe && <span>🌿 {b.dpe}</span>}{b.ville && <span>📍 {b.ville}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select value={b.badge_retour} onChange={e => changeBadge(b.id, e.target.value)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, border: `1px solid ${badge.color}30`, background: badge.bg, color: badge.color, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {Object.entries(BADGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      {b.source_portail && <span style={{ fontSize: 12, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>{b.source_portail}</span>}
                      {b.url && <a href={b.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none' }}>🔗 Annonce</a>}
                      <button onClick={() => planifierVisite(b.id)} style={{ fontSize: 12, marginLeft: 'auto', background: '#f5f3ff', color: '#8b5cf6', border: '1px solid #ddd6fe', padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>📅 Planifier visite</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VISITES */}
        {tab === 'visites' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visites.length === 0 ? <div className={styles.emptyTab}><div style={{ fontSize: 32, marginBottom: 10 }}>📅</div><div style={{ fontWeight: 700, color: '#1a2332' }}>Aucune visite</div><div style={{ color: '#94a3b8', fontSize: 13 }}>Planifiez depuis l'onglet Biens</div></div>
            : visites.map(v => {
              const b = biens.find(x => x.id === v.bien_id);
              return (
                <div key={v.id} className={styles.card} style={{ padding: 18 }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div style={{ background: v.statut === 'effectuee' ? '#e2e8f0' : '#1a2332', borderRadius: 12, padding: '7px 11px', textAlign: 'center', minWidth: 50, flexShrink: 0 }}>
                      {v.date_visite ? <><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 20, color: v.statut === 'effectuee' ? '#1a2332' : 'white', lineHeight: 1 }}>{new Date(v.date_visite).getDate()}</div><div style={{ fontSize: 9, color: v.statut === 'effectuee' ? '#94a3b8' : 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>{new Date(v.date_visite).toLocaleDateString('fr-FR', { month: 'short' })}</div></> : <div style={{ color: 'rgba(255,255,255,0.4)' }}>—</div>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#1a2332' }}>{b?.titre || b?.ville || 'Bien non renseigné'}</div>
                      {v.heure && <div style={{ fontSize: 14, color: '#c9a84c', fontWeight: 600, marginTop: 3 }}>{v.heure}</div>}
                      {v.contact_agence && <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>Contact : {v.contact_agence}</div>}
                      {v.statut === 'effectuee' && v.note_etoiles && <div style={{ marginTop: 6, fontSize: 16 }}>{'⭐'.repeat(v.note_etoiles)}</div>}
                      {v.commentaire && <div style={{ fontSize: 13, color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '7px 11px', marginTop: 8, borderLeft: '3px solid #c9a84c' }}>{v.commentaire}</div>}
                    </div>
                    <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 600, background: v.statut === 'a_venir' ? '#eff6ff' : '#ecfdf5', color: v.statut === 'a_venir' ? '#3b82f6' : '#10b981', border: '1px solid currentColor', opacity: 0.8 }}>
                      {v.statut === 'a_venir' ? '📅 À venir' : '✅ Effectuée'}
                    </span>
                  </div>
                  {v.statut === 'a_venir' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f8fafc', flexWrap: 'wrap' }}>
                      <input type="date" defaultValue={v.date_visite?.split('T')[0]} className={styles.inp} style={{ flex: 1, minWidth: 140 }} onChange={async e => { await supabase.from('visites').update({ date_visite: e.target.value }).eq('id', v.id); load(); }} />
                      <input type="time" defaultValue={v.heure} className={styles.inp} style={{ width: 110 }} onChange={async e => { await supabase.from('visites').update({ heure: e.target.value }).eq('id', v.id); }} />
                      <input className={styles.inp} placeholder="Contact agence" defaultValue={v.contact_agence} style={{ flex: 1, minWidth: 140 }} onChange={async e => { await supabase.from('visites').update({ contact_agence: e.target.value }).eq('id', v.id); }} />
                      <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={async () => { await supabase.from('visites').update({ statut: 'effectuee' }).eq('id', v.id); await supabase.from('biens').update({ badge_retour: 'visite' }).eq('id', v.bien_id); await addJournal(client.id, 'visite_effectuee', 'Visite effectuée', b?.titre||''); load(); }}>✓ Effectuée</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* TRANSACTION */}
        {tab === 'transaction' && (
          !transaction ? <div className={styles.emptyTab}><div style={{ fontSize: 36, marginBottom: 12 }}>📋</div><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 17, color: '#1a2332', marginBottom: 6 }}>Aucune transaction</div><div style={{ color: '#94a3b8', fontSize: 14 }}>Posez le badge "Offre faite" sur un bien pour démarrer</div></div>
          : <div className={styles.card} style={{ padding: 24 }}>
            <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 17, color: '#1a2332', marginBottom: 20 }}>Étape : <span style={{ color: '#c9a84c' }}>{transaction.etape_actuelle}</span></div>
            {[{id:'offre',l:'1 — Offre'},{id:'negociation',l:'2 — Négociation'},{id:'offre_acceptee',l:'3 — Offre acceptée'},{id:'compromis',l:'4 — Compromis'},{id:'acte',l:'5 — Acte'}].map((e, i) => {
              const ordre = ['offre','negociation','offre_acceptee','compromis','acte'];
              const done = ordre.indexOf(e.id) < ordre.indexOf(transaction.etape_actuelle);
              const cur = e.id === transaction.etape_actuelle;
              return (
                <div key={e.id} style={{ display: 'flex', gap: 14, paddingBottom: 18 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 9, background: done ? '#c9a84c' : cur ? '#1a2332' : '#e2e8f0', color: done ? '#1a2332' : cur ? 'white' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, boxShadow: cur ? '0 0 0 4px rgba(26,35,50,0.1)' : 'none', flexShrink: 0 }}>{done ? '✓' : i+1}</div>
                    {i < 4 && <div style={{ width: 1, flex: 1, background: done ? '#c9a84c' : '#e2e8f0', marginTop: 4 }} />}
                  </div>
                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 14, color: cur ? '#1a2332' : done ? '#64748b' : '#94a3b8', marginBottom: cur ? 10 : 0 }}>{e.l}</div>
                    {cur && (
                      <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14 }}>
                        {e.id === 'offre' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><input className={styles.inp} type="number" placeholder="Montant €" defaultValue={transaction.offre_montant} style={{ flex: 1 }} onChange={x => supabase.from('transactions').update({ offre_montant: parseInt(x.target.value) }).eq('id', transaction.id)} /><input className={styles.inp} type="date" defaultValue={transaction.offre_date} style={{ width: 160 }} onChange={x => supabase.from('transactions').update({ offre_date: x.target.value }).eq('id', transaction.id)} /><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={async () => { await supabase.from('transactions').update({ etape_actuelle: 'negociation' }).eq('id', transaction.id); await addJournal(client.id, 'negociation', 'Négociation'); load(); }}>→ Négociation</button></div>}
                        {e.id === 'negociation' && <div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}><select className={styles.inp} id="cop" style={{ width: 120 }}><option value="vendeur">Vendeur</option><option value="acheteur">Acheteur</option></select><input className={styles.inp} type="number" id="com" placeholder="Montant €" style={{ flex: 1 }} /><input className={styles.inp} type="date" id="cod" style={{ width: 160 }} /><button className={styles.btn} onClick={async () => { const p = (document.getElementById('cop') as HTMLSelectElement).value; const m = (document.getElementById('com') as HTMLInputElement).value; const d = (document.getElementById('cod') as HTMLInputElement).value; await supabase.from('transactions').update({ contre_offres: [...(transaction.contre_offres||[]), {partie:p,montant:m,date:d}] }).eq('id', transaction.id); load(); }}>+ Contre-offre</button></div>{(transaction.contre_offres||[]).map((co: any, i: number) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 5 }}><span style={{ padding: '2px 10px', borderRadius: 20, fontWeight: 700, background: co.partie === 'vendeur' ? '#fef2f2' : '#f0fdf4', color: co.partie === 'vendeur' ? '#ef4444' : '#10b981' }}>{co.partie}</span><span style={{ fontWeight: 600 }}>{parseInt(co.montant).toLocaleString('fr-FR')}€</span><span style={{ color: '#94a3b8' }}>{co.date}</span></div>)}<button className={`${styles.btn} ${styles.btnPrimary}`} style={{ width: '100%', marginTop: 10 }} onClick={async () => { await supabase.from('transactions').update({ etape_actuelle: 'offre_acceptee' }).eq('id', transaction.id); load(); }}>✓ Offre acceptée</button></div>}
                        {e.id === 'offre_acceptee' && <div style={{ display: 'flex', gap: 8 }}><input className={styles.inp} type="number" placeholder="Prix final €" style={{ flex: 1 }} onChange={x => supabase.from('transactions').update({ prix_final: parseInt(x.target.value) }).eq('id', transaction.id)} /><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={async () => { await supabase.from('transactions').update({ etape_actuelle: 'compromis' }).eq('id', transaction.id); load(); }}>→ Compromis</button></div>}
                        {e.id === 'compromis' && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><div style={{ display: 'flex', gap: 8 }}><div style={{ flex: 1 }}><label className={styles.lbl}>Date compromis</label><input className={styles.inp} type="date" onChange={x => supabase.from('transactions').update({ compromis_date: x.target.value, sru_date_fin: new Date(new Date(x.target.value).getTime() + 10*86400000).toISOString().split('T')[0] }).eq('id', transaction.id)} /></div><div style={{ flex: 1 }}><label className={styles.lbl}>Notaire</label><input className={styles.inp} onChange={x => supabase.from('transactions').update({ compromis_notaire: x.target.value }).eq('id', transaction.id)} /></div></div><div style={{ display: 'flex', gap: 8 }}><div style={{ flex: 1 }}><label className={styles.lbl}>Prêt €</label><input className={styles.inp} type="number" onChange={x => supabase.from('transactions').update({ pret_montant: parseInt(x.target.value) }).eq('id', transaction.id)} /></div><div style={{ flex: 1 }}><label className={styles.lbl}>Apport €</label><input className={styles.inp} type="number" onChange={x => supabase.from('transactions').update({ pret_apport: parseInt(x.target.value) }).eq('id', transaction.id)} /></div></div><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={async () => { await supabase.from('transactions').update({ etape_actuelle: 'acte' }).eq('id', transaction.id); load(); }}>→ Acte</button></div>}
                        {e.id === 'acte' && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><div style={{ display: 'flex', gap: 8 }}><div style={{ flex: 1 }}><label className={styles.lbl}>Date prévue</label><input className={styles.inp} type="date" onChange={x => supabase.from('transactions').update({ acte_date_prevue: x.target.value }).eq('id', transaction.id)} /></div><div style={{ flex: 1 }}><label className={styles.lbl}>Honoraires HT €</label><input className={styles.inp} type="number" onChange={x => supabase.from('transactions').update({ honoraires_ht: parseInt(x.target.value), honoraires_ttc: Math.round(parseInt(x.target.value)*1.2) }).eq('id', transaction.id)} /></div></div><button style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 14, cursor: 'pointer' }} onClick={async () => { await supabase.from('clients').update({ statut: 'bien_trouve' }).eq('id', client.id); await supabase.from('transactions').update({ etape_actuelle: 'finalise' }).eq('id', transaction.id); await addJournal(client.id, 'dossier_finalise', '🎉 Bien trouvé !'); refresh(); load(); }}>🎉 Clôturer — Bien trouvé !</button></div>}
                      </div>
                    )}
                    {done && e.id === 'offre' && transaction.offre_montant && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{transaction.offre_montant.toLocaleString('fr-FR')}€</div>}
                    {done && e.id === 'offre_acceptee' && transaction.prix_final && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Prix final : {transaction.prix_final.toLocaleString('fr-FR')}€</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* HISTORIQUE */}
        {tab === 'historique' && (
          <div className={styles.card}>
            {envois.length === 0 ? <div className={styles.emptyTab}><div style={{ fontSize: 32, marginBottom: 10 }}>📄</div><div style={{ fontWeight: 700, color: '#1a2332' }}>Aucun envoi</div></div>
            : envois.map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid #f8fafc' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{e.type === 'selection_biens' ? '📄' : '✉️'}</div>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14, color: '#1a2332' }}>{e.objet || e.type}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{e.destinataires?.join(', ')}</div></div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: 13, fontWeight: 600 }}>{new Date(e.created_at).toLocaleDateString('fr-FR')}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>{e.sms_envoye ? '✉️ + 📱' : '✉️'}</div></div>
              </div>
            ))}
          </div>
        )}

        {/* JOURNAL */}
        {tab === 'journal' && (
          <div className={styles.card} style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowAction(true)}>+ Ajouter une action</button></div>
            {journal.length === 0 ? <div className={styles.emptyTab}><div style={{ fontSize: 32, marginBottom: 10 }}>📓</div><div style={{ fontWeight: 700, color: '#1a2332' }}>Journal vide</div></div>
            : journal.map((j, i) => (
              <div key={j.id} style={{ display: 'flex', gap: 14, paddingBottom: 18 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: '#f8fafc', border: '1px solid #e3e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                    {j.type === 'bien_ajoute' ? '🏠' : j.type === 'visite_effectuee' ? '📅' : j.type === 'dossier_finalise' ? '🎉' : j.type === 'creation' ? '✨' : j.type === 'criteres_modifies' ? '🎯' : j.type === 'mandat_modifie' ? '📋' : '📝'}
                  </div>
                  {i < journal.length - 1 && <div style={{ width: 1, flex: 1, background: '#f1f5f9', marginTop: 4 }} />}
                </div>
                <div style={{ flex: 1, paddingTop: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1a2332' }}>{j.titre}</div>
                  {j.description && <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>{j.description}</div>}
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{new Date(j.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ MODAL CONTACT ═══ */}
      {showContact && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowContact(false); }}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>📞 Modifier le contact</h2><button className={styles.modalClose} onClick={() => setShowContact(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div className={styles.formRow}><div><label className={styles.lbl}>Prénom</label><input className={styles.inp} value={cf.prenom} onChange={e => setCf(f => ({ ...f, prenom: e.target.value }))} /></div><div><label className={styles.lbl}>Nom</label><input className={styles.inp} value={cf.nom} onChange={e => setCf(f => ({ ...f, nom: e.target.value }))} /></div></div>
              <div><label className={styles.lbl}>Adresse</label><input className={styles.inp} value={cf.adresse} onChange={e => setCf(f => ({ ...f, adresse: e.target.value }))} /></div>
              <div className={styles.formRow}><div><label className={styles.lbl}>Email principal</label><input className={styles.inp} type="email" value={cf.email1} onChange={e => setCf(f => ({ ...f, email1: e.target.value }))} /></div><div><label className={styles.lbl}>Email secondaire</label><input className={styles.inp} type="email" value={cf.email2} onChange={e => setCf(f => ({ ...f, email2: e.target.value }))} /></div></div>
              <div className={styles.formRow}><div><label className={styles.lbl}>Tél. principal</label><input className={styles.inp} value={cf.tel1} onChange={e => setCf(f => ({ ...f, tel1: e.target.value }))} /></div><div><label className={styles.lbl}>Tél. secondaire</label><input className={styles.inp} value={cf.tel2} onChange={e => setCf(f => ({ ...f, tel2: e.target.value }))} /></div></div>
            </div>
            <div className={styles.modalFooter}><button className={styles.btn} onClick={() => setShowContact(false)}>Annuler</button><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveContact} disabled={saving}>{saving ? '...' : '✓ Sauvegarder'}</button></div>
          </div>
        </div>
      )}

      {/* ═══ MODAL CRITÈRES ═══ */}
      {showCriteres && (
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: 740 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>🎯 Critères de recherche</h2><button className={styles.modalClose} onClick={() => setShowCriteres(false)}>✕</button></div>
            <div className={styles.modalBody}>

              {/* TYPES — multi-sélection */}
              <div>
                <label className={styles.lbl}>Type(s) de bien <span style={{fontWeight:400,textTransform:'none',letterSpacing:0,color:'#94a3b8'}}>(plusieurs choix possibles)</span></label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['Appartement','Maison','Loft','Duplex','Studio','Villa','Terrain','Autre'].map(t => {
                    const sel = crit.types_bien.includes(t);
                    return <button key={t} onClick={() => setCrit(f => ({ ...f, types_bien: sel ? f.types_bien.filter(x=>x!==t) : [...f.types_bien, t] }))}
                      style={{ padding: '7px 16px', borderRadius: 20, border: `1px solid ${sel ? '#1a2332' : '#e2e8f0'}`, background: sel ? '#1a2332' : 'white', color: sel ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>{t}</button>;
                  })}
                </div>
              </div>

              {/* BUDGET */}
              <div>
                <label className={styles.lbl}>Budget</label>
                <div className={styles.formRow}>
                  <div><label className={styles.lbl}>Minimum €</label><input className={styles.inp} type="number" value={crit.budget_min} onChange={e => setCrit(f => ({ ...f, budget_min: e.target.value }))} placeholder="300 000" /></div>
                  <div><label className={styles.lbl}>Maximum €</label><input className={styles.inp} type="number" value={crit.budget_max} onChange={e => setCrit(f => ({ ...f, budget_max: e.target.value }))} placeholder="450 000" /></div>
                </div>
              </div>

              {/* SURFACE + PIÈCES + CHAMBRES */}
              <div className={styles.formRow}>
                <div><label className={styles.lbl}>Surface m²</label><div style={{display:'flex',gap:6}}><input className={styles.inp} type="number" value={crit.surface_min} onChange={e=>setCrit(f=>({...f,surface_min:e.target.value}))} placeholder="Min" /><input className={styles.inp} type="number" value={crit.surface_max} onChange={e=>setCrit(f=>({...f,surface_max:e.target.value}))} placeholder="Max" /></div></div>
                <div><label className={styles.lbl}>Pièces</label><div style={{display:'flex',gap:6}}><input className={styles.inp} type="number" value={crit.nb_pieces_min} onChange={e=>setCrit(f=>({...f,nb_pieces_min:e.target.value}))} placeholder="Min" /><input className={styles.inp} type="number" value={crit.nb_pieces_max} onChange={e=>setCrit(f=>({...f,nb_pieces_max:e.target.value}))} placeholder="Max" /></div></div>
              </div>
              <div className={styles.formRow}>
                <div><label className={styles.lbl}>Chambres minimum</label><input className={styles.inp} type="number" value={crit.chambres_min} onChange={e=>setCrit(f=>({...f,chambres_min:e.target.value}))} placeholder="Ex: 2" /></div>
                <div><label className={styles.lbl}>Année de construction min</label><input className={styles.inp} type="number" value={crit.annee_min} onChange={e=>setCrit(f=>({...f,annee_min:e.target.value}))} placeholder="Ex: 1990" /></div>
              </div>

              {/* ÉTAGE */}
              <div>
                <label className={styles.lbl}>Étage</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[{k:'rdc_exclu',l:'🚫 Exclure RDC'},{k:'dernier_etage',l:'🏙️ Dernier étage'}].map(o => (
                    <button key={o.k} onClick={() => setCrit(f=>({...f,[o.k]:!(f as any)[o.k]}))}
                      style={{ padding: '7px 14px', borderRadius: 20, border: `1px solid ${(crit as any)[o.k] ? '#1a2332' : '#e2e8f0'}`, background: (crit as any)[o.k] ? '#1a2332' : 'white', color: (crit as any)[o.k] ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>{o.l}</button>
                  ))}
                  <div style={{display:'flex',alignItems:'center',gap:6}}><label className={styles.lbl} style={{marginBottom:0}}>Étage min :</label><input className={styles.inp} type="number" value={crit.etage_min} onChange={e=>setCrit(f=>({...f,etage_min:e.target.value}))} placeholder="Ex: 2" style={{width:80}} /></div>
                </div>
              </div>

              {/* OPTIONS */}
              <div>
                <label className={styles.lbl}>Équipements souhaités</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[{k:'parking',l:'🅿️ Parking'},{k:'cave',l:'📦 Cave'},{k:'balcon',l:'🌿 Balcon'},{k:'terrasse',l:'☀️ Terrasse'},{k:'jardin',l:'🌳 Jardin'},{k:'ascenseur',l:'🛗 Ascenseur'},{k:'gardien',l:'👮 Gardien'},{k:'interphone',l:'🔔 Interphone'},{k:'digicode',l:'🔢 Digicode'}].map(o => (
                    <button key={o.k} onClick={() => setCrit(f=>({...f,[o.k]:!(f as any)[o.k]}))}
                      style={{ padding: '7px 14px', borderRadius: 20, border: `1px solid ${(crit as any)[o.k] ? '#10b981' : '#e2e8f0'}`, background: (crit as any)[o.k] ? '#ecfdf5' : 'white', color: (crit as any)[o.k] ? '#10b981' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>{o.l}</button>
                  ))}
                </div>
              </div>

              {/* DPE */}
              <div>
                <label className={styles.lbl}>DPE maximum accepté</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['A','B','C','D','E','F','G'].map(d => (
                    <button key={d} onClick={() => setCrit(f=>({...f,dpe_max:f.dpe_max===d?'':d}))}
                      style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${crit.dpe_max===d ? '#1a2332' : '#e2e8f0'}`, background: crit.dpe_max===d ? '#1a2332' : 'white', color: crit.dpe_max===d ? 'white' : '#64748b', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{d}</button>
                  ))}
                </div>
              </div>

              {/* SECTEURS améliorés */}
              <div>
                <label className={styles.lbl}>Secteurs / Quartiers</label>
                <div style={{ position: 'relative' }}>
                  <input className={styles.inp} value={cpQ} onChange={e => searchCP(e.target.value)} placeholder="Tapez un code postal ou une ville (ex: 92100, Neuilly...)" />
                  {cpSug.length > 0 && (
                    <div className={styles.suggestions}>
                      {cpSug.map((s, i) => (
                        <div key={i} className={styles.suggItem} onClick={() => {
                          const info = QUARTIERS[s.cp];
                          if (info?.quartiers) {
                            setSecteurVilleActive({cp: s.cp, ville: info.ville});
                          } else {
                            setSecteurVilleActive({cp: s.cp, ville: s.ville});
                          }
                          setCpSug([]);
                          setCpQ('');
                        }}>
                          <strong>{s.cp}</strong> — {s.ville}
                          {QUARTIERS[s.cp] ? ' 📍 quartiers disponibles' : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quartiers de la ville active — reste affiché jusqu'à changement */}
                {secteurVilleActive && (
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, marginTop: 8, border: '1px solid #e3e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1a2332' }}>📍 {secteurVilleActive.ville} ({secteurVilleActive.cp})</div>
                      <button onClick={() => setSecteurVilleActive(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>Fermer ✕</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      <button onClick={() => addSecteur(secteurVilleActive.cp, secteurVilleActive.ville)}
                        style={{ fontSize: 12, padding: '5px 14px', borderRadius: 20, border: '1px solid #1a2332', background: '#1a2332', color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                        ✓ Toute la ville
                      </button>
                      {QUARTIERS[secteurVilleActive.cp]?.quartiers.map(q => {
                        const label = `${q} (${secteurVilleActive.ville})`;
                        const already = crit.secteurs.includes(label);
                        return (
                          <button key={q} onClick={() => already ? setCrit(f=>({...f,secteurs:f.secteurs.filter(x=>x!==label)})) : addSecteur(secteurVilleActive.cp, secteurVilleActive.ville, q)}
                            style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20, border: `1px solid ${already ? '#10b981' : '#e2e8f0'}`, background: already ? '#ecfdf5' : 'white', color: already ? '#10b981' : '#64748b', cursor: 'pointer', fontFamily: 'inherit', fontWeight: already ? 600 : 400, transition: 'all 0.12s' }}>
                            {already ? '✓ ' : ''}{q}
                          </button>
                        );
                      })}
                      {!QUARTIERS[secteurVilleActive.cp] && (
                        <div style={{fontSize:12,color:'#94a3b8',fontStyle:'italic'}}>Aucun quartier prédéfini — la ville entière sera ajoutée</div>
                      )}
                    </div>
                    <div style={{fontSize:11,color:'#94a3b8'}}>💡 Vous pouvez sélectionner plusieurs quartiers puis chercher une autre ville</div>
                  </div>
                )}

                {/* Secteurs sélectionnés */}
                {crit.secteurs.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {crit.secteurs.map(s => (
                      <span key={s} className={styles.secteurTag}>
                        {s} <span onClick={() => setCrit(f=>({...f,secteurs:f.secteurs.filter(x=>x!==s)}))} style={{ cursor: 'pointer', marginLeft: 5, opacity: 0.6 }}>✕</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Saisie libre */}
                <div style={{ marginTop: 10 }}>
                  <input className={styles.inp} placeholder="Ou saisir un secteur libre (ex: Triangle d'Or, Proche RER...)"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                        const v = (e.target as HTMLInputElement).value.trim();
                        if (!crit.secteurs.includes(v)) setCrit(f=>({...f,secteurs:[...f.secteurs,v]}));
                        (e.target as HTMLInputElement).value = '';
                      }
                    }} />
                  <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>Appuyez sur Entrée pour ajouter un secteur personnalisé</div>
                </div>
              </div>

              {/* NOTES */}
              <div><label className={styles.lbl}>Notes libres</label><textarea className={styles.inp} rows={3} value={crit.notes} onChange={e => setCrit(f=>({...f,notes:e.target.value}))} placeholder="Particularités, préférences, exclusions, quartiers à éviter..." /></div>
            </div>
            <div className={styles.modalFooter}><button className={styles.btn} onClick={() => setShowCriteres(false)}>Annuler</button><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveCriteres} disabled={saving}>{saving ? '...' : '✓ Sauvegarder'}</button></div>
          </div>
        </div>
      )}

      {/* ═══ MODAL MANDAT ═══ */}
      {showMandat && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowMandat(false); }}>
          <div className={styles.modal} style={{ maxWidth: 500 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>📋 Mandat de recherche</h2><button className={styles.modalClose} onClick={() => setShowMandat(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div><label className={styles.lbl}>Date de signature</label><input className={styles.inp} type="date" value={mandat.date_signature} onChange={e => setMandat(f => ({ ...f, date_signature: e.target.value }))} /></div>
              <div className={styles.formRow}>
                <div><label className={styles.lbl}>Durée</label><select className={styles.inp} value={mandat.duree} onChange={e => setMandat(f => ({ ...f, duree: e.target.value }))}><option value="1">1 mois</option><option value="2">2 mois</option><option value="3">3 mois</option><option value="6">6 mois</option><option value="12">12 mois</option></select></div>
                <div><label className={styles.lbl}>Date expiration (auto ou manuelle)</label><input className={styles.inp} type="date" value={mandat.date_expiration} onChange={e => setMandat(f => ({ ...f, date_expiration: e.target.value }))} /></div>
              </div>
              <div><label className={styles.lbl}>Honoraires convenus</label><input className={styles.inp} value={mandat.honoraires} onChange={e => setMandat(f => ({ ...f, honoraires: e.target.value }))} placeholder="3,5% TTC ou 5 000€ TTC" /></div>
              {mandat.date_signature && mandat.duree && !mandat.date_expiration && <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#1d4ed8' }}>💡 Expiration calculée : {new Date(new Date(mandat.date_signature).setMonth(new Date(mandat.date_signature).getMonth() + parseInt(mandat.duree))).toLocaleDateString('fr-FR')}</div>}
            </div>
            <div className={styles.modalFooter}><button className={styles.btn} onClick={() => setShowMandat(false)}>Annuler</button><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveMandat} disabled={saving}>{saving ? '...' : '✓ Sauvegarder'}</button></div>
          </div>
        </div>
      )}

      {/* ═══ MODAL AJOUTER BIEN ═══ */}
      {showBien && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) { setShowBien(false); setBienForm(null); setUrl(''); }}}>
          <div className={styles.modal} style={{ maxWidth: 720 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>🏠 Ajouter un bien</h2><button className={styles.modalClose} onClick={() => { setShowBien(false); setBienForm(null); setUrl(''); }}>✕</button></div>
            <div className={styles.modalBody}>
              <div><label className={styles.lbl}>URL de l'annonce</label><div style={{ display: 'flex', gap: 8 }}><input className={styles.inp} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.seloger.com/annonces/..." style={{ flex: 1 }} onKeyDown={e => e.key === 'Enter' && extract()} /><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={extract} disabled={extracting||!url}>{extracting ? '⏳...' : '🔍 Extraire'}</button></div><div style={{ fontSize: 12, color: '#94a3b8', marginTop: 5 }}>SeLoger, LeBonCoin, PAP, Bien'ici, Logic-Immo, Jinka, Orpi, Century 21...</div></div>
              {bienForm !== null && <>
                <div style={{ background: bienForm._reason === 'seloger_blocked' ? '#fffbeb' : bienForm.titre ? '#ecfdf5' : '#f8fafc', border: `1px solid ${bienForm._reason === 'seloger_blocked' ? '#fde68a' : bienForm.titre ? '#a7f3d0' : '#e2e8f0'}`, borderRadius: 10, padding: '9px 13px', fontSize: 13, color: bienForm._reason === 'seloger_blocked' ? '#92400e' : bienForm.titre ? '#065f46' : '#64748b' }}>
                  {bienForm._reason === 'seloger_blocked' ? '⚠️ SeLoger bloque l’extraction automatique — complétez manuellement les informations' : bienForm.titre ? '✅ Informations extraites — vérifiez et complétez' : 'ℹ️ Remplissez manuellement'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1/-1' }}><label className={styles.lbl}>Titre</label><input className={styles.inp} value={bienForm.titre||''} onChange={e => setBienForm((f: any) => ({ ...f, titre: e.target.value }))} /></div>
                  <div><label className={styles.lbl}>Type</label><select className={styles.inp} value={bienForm.type_bien||'Appartement'} onChange={e => setBienForm((f: any) => ({ ...f, type_bien: e.target.value }))}><option>Appartement</option><option>Maison</option><option>Loft</option><option>Studio</option><option>Duplex</option></select></div>
                  <div><label className={styles.lbl}>Source</label><input className={styles.inp} value={bienForm.source_portail||''} onChange={e => setBienForm((f: any) => ({ ...f, source_portail: e.target.value }))} placeholder="SeLoger..." /></div>
                  <div><label className={styles.lbl}>Ville</label><input className={styles.inp} value={bienForm.ville||''} onChange={e => setBienForm((f: any) => ({ ...f, ville: e.target.value }))} /></div>
                  <div><label className={styles.lbl}>Code postal</label><input className={styles.inp} value={bienForm.code_postal||''} onChange={e => setBienForm((f: any) => ({ ...f, code_postal: e.target.value }))} /></div>
                  <div><label className={styles.lbl}>Surface m²</label><input className={styles.inp} type="number" value={bienForm.surface||''} onChange={e => setBienForm((f: any) => ({ ...f, surface: e.target.value }))} /></div>
                  <div><label className={styles.lbl}>Pièces</label><input className={styles.inp} type="number" value={bienForm.nb_pieces||''} onChange={e => setBienForm((f: any) => ({ ...f, nb_pieces: e.target.value }))} /></div>
                  <div><label className={styles.lbl}>Étage</label><input className={styles.inp} type="number" value={bienForm.etage||''} onChange={e => setBienForm((f: any) => ({ ...f, etage: e.target.value }))} /></div>
                  <div><label className={styles.lbl}>DPE</label><input className={styles.inp} value={bienForm.dpe||''} onChange={e => setBienForm((f: any) => ({ ...f, dpe: e.target.value }))} placeholder="A B C..." /></div>
                  <div><label className={styles.lbl}>Prix vendeur €</label><input className={styles.inp} type="number" value={bienForm.prix_vendeur||''} onChange={e => setBienForm((f: any) => ({ ...f, prix_vendeur: e.target.value }))} /></div>
                  <div><label className={styles.lbl}>Commission</label><div style={{ display: 'flex', gap: 6 }}><select className={styles.inp} style={{ width: 80 }} value={bienForm.commission_type} onChange={e => setBienForm((f: any) => ({ ...f, commission_type: e.target.value }))}><option value="pourcentage">%</option><option value="montant">€</option></select><input className={styles.inp} type="number" value={bienForm.commission_val||''} onChange={e => setBienForm((f: any) => ({ ...f, commission_val: e.target.value }))} /></div></div>
                  <div><label className={styles.lbl}>Prix acquéreur</label><div className={styles.inp} style={{ background: '#fef9c3', color: '#854d0e', fontWeight: 700 }}>{prixAcq ? `${prixAcq.toLocaleString('fr-FR')}€` : '—'}</div></div>
                  <div><label className={styles.lbl}>Agence</label><input className={styles.inp} value={bienForm.agence_nom||''} onChange={e => setBienForm((f: any) => ({ ...f, agence_nom: e.target.value }))} /></div>
                  <div><label className={styles.lbl}>Tél. agence</label><input className={styles.inp} value={bienForm.agence_tel||''} onChange={e => setBienForm((f: any) => ({ ...f, agence_tel: e.target.value }))} /></div>
                  <div style={{ gridColumn: '1/-1' }}><label className={styles.lbl}>Description</label><textarea className={styles.inp} rows={3} value={bienForm.description||''} onChange={e => setBienForm((f: any) => ({ ...f, description: e.target.value }))} /></div>
                </div>
              </>}
            </div>
            <div className={styles.modalFooter}><button className={styles.btn} onClick={() => { setShowBien(false); setBienForm(null); setUrl(''); }}>Annuler</button>{bienForm !== null && <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveBien} disabled={saving}>{saving ? '...' : '✓ Ajouter ce bien'}</button>}</div>
          </div>
        </div>
      )}

      {/* ═══ MODAL ACTION ═══ */}
      {showAction && (
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: 500 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>+ Ajouter une action</h2><button className={styles.modalClose} onClick={() => setShowAction(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div>
                <label className={styles.lbl}>Type d'action</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[{v:'appel',l:'📞 Appel passé'},{v:'rdv',l:'🤝 RDV physique'},{v:'note',l:'📝 Note libre'},{v:'relance_manuelle',l:'🔔 Relance manuelle'},{v:'envoi_externe',l:'📤 Envoi externe'},{v:'email_libre',l:'✉️ Email envoyé'}].map(o => (
                    <button key={o.v} onClick={() => setActionF(f => ({ ...f, type: o.v, titre: f.titre || o.l.split(' ').slice(1).join(' ') }))}
                      style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${actionF.type === o.v ? '#1a2332' : '#e2e8f0'}`, background: actionF.type === o.v ? '#1a2332' : 'white', color: actionF.type === o.v ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.12s' }}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={styles.lbl}>Titre <span style={{fontWeight:400,color:'#94a3b8'}}>(optionnel — pré-rempli selon le type)</span></label>
                <input className={styles.inp} value={actionF.titre} onChange={e => setActionF(f => ({ ...f, titre: e.target.value }))} placeholder="Ex: Appel de suivi, RDV agence..." />
              </div>
              <div>
                <label className={styles.lbl}>Notes / Détails</label>
                <textarea className={styles.inp} rows={4} value={actionF.description} onChange={e => setActionF(f => ({ ...f, description: e.target.value }))} placeholder="Ce dont on a discuté, ce qui a été convenu..." />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowAction(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveAction}>✓ Ajouter au journal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
