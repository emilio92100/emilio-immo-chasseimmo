'use client';
import { useState, useEffect } from 'react';
import { supabase, genererReference, addJournal } from '@/lib/supabase';
import type { Client, StatutClient } from '@/lib/supabase';
import SecteurPicker from '@/components/shared/SecteurPicker';
import styles from './Clients.module.css';

const STATUTS = [
  { key: 'tous',        label: 'Tous',       color: '' },
  { key: 'prospect',    label: 'Prospects',  color: '#8b5cf6' },
  { key: 'actif',       label: 'Actifs',     color: '#10b981' },
  { key: 'suspendu',    label: 'Suspendus',  color: '#f59e0b' },
  { key: 'bien_trouve', label: 'Finalisés',  color: '#3b82f6' },
  { key: 'perdu',       label: 'Perdus',     color: '#ef4444' },
];

const CHALEURS = [
  { key: 'tres_chaud', label: '🔥 Très chaud' },
  { key: 'interesse',  label: '👍 Intéressé' },
  { key: 'tiede',      label: '😐 Tiède' },
  { key: 'froid',      label: '❄️ Froid' },
];

const statutBadge: Record<string, { label: string; color: string; bg: string }> = {
  prospect:    { label: '● Prospect',   color: '#8b5cf6', bg: '#f5f3ff' },
  actif:       { label: '● Actif',      color: '#10b981', bg: '#ecfdf5' },
  suspendu:    { label: '⏸ Suspendu',   color: '#f59e0b', bg: '#fffbeb' },
  bien_trouve: { label: '✓ Finalisé',   color: '#3b82f6', bg: '#eff6ff' },
  perdu:       { label: '✗ Perdu',      color: '#ef4444', bg: '#fef2f2' },
};

const initForm = {
  prenom: '', nom: '',
  adresse_rue: '', adresse_cp: '', adresse_ville: '',
  email1: '', email2: '', tel1: '', tel2: '',
  statut: 'prospect' as StatutClient, chaleur: 'tiede',
  type_bien: 'Appartement',
  budget_min: '', budget_max: '',
  surface_min: '', surface_max: '',
  nb_pieces_min: '', nb_pieces_max: '',
  chambres_min: '',
  secteurs: [] as string[],
  etage_min: '', etage_max: '',
  rdc_exclu: false, dernier_etage: false,
  dpe_max: '', annee_min: '',
  parking: false, cave: false, balcon: false, terrasse: false,
  jardin: false, ascenseur: false, gardien: false,
  etat_souhaite: '', exposition: [] as string[], surface_sejour_min: '',
  urgence: '', financement: '', apport: '',
  sans_mandat: false,
  mandat_date_signature: '', mandat_duree: '3', mandat_honoraires: '3,5% TTC',
  notes: '',
};

// Carte de section pour le formulaire en étapes
function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fafbfd', border: '1px solid #eef1f6', borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#1a2332', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 14 }}>{titre}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  );
}

// Style d'une pastille toggle (active/inactive)
function pill(active: boolean, borderActive: string, bgActive: string, colorActive: string): React.CSSProperties {
  return { padding: '7px 14px', borderRadius: 20, border: `1px solid ${active ? borderActive : '#e2e8f0'}`, background: active ? bgActive : 'white', color: active ? colorActive : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' };
}

export default function Clients({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState('tous');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(initForm);
  const [step, setStep] = useState(0);
  const [adrSug, setAdrSug] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function openModal() { setForm(initForm); setStep(0); setError(''); setAdrSug([]); setShowModal(true); }

  // Autocomplétion d'adresse via l'API officielle adresse.data.gouv.fr
  async function searchAdresse(q: string) {
    setForm(f => ({ ...f, adresse_rue: q }));
    if (q.trim().length < 4) { setAdrSug([]); return; }
    try {
      const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5&type=housenumber`);
      const data = await res.json();
      setAdrSug(data.features || []);
    } catch { setAdrSug([]); }
  }
  function pickAdresse(feat: any) {
    const p = feat.properties;
    setForm(f => ({ ...f, adresse_rue: p.name || p.label, adresse_cp: p.postcode || '', adresse_ville: p.city || '' }));
    setAdrSug([]);
  }

  useEffect(() => { fetchClients(); }, []);

  async function fetchClients() {
    setLoading(true);
    const { data } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    setClients(data || []);
    setLoading(false);
  }

  const filtered = clients.filter(c => {
    const matchStatut = filtre === 'tous' || c.statut === filtre;
    const q = search.toLowerCase();
    const matchSearch = !search ||
      c.prenom.toLowerCase().includes(q) ||
      c.nom.toLowerCase().includes(q) ||
      c.reference.toLowerCase().includes(q) ||
      (c.emails || []).some(e => e.toLowerCase().includes(q)) ||
      (c.secteurs || []).some(s => s.toLowerCase().includes(q));
    return matchStatut && matchSearch;
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.prenom || !form.nom) { setError('Prénom et nom obligatoires'); return; }
    setSaving(true); setError('');
    try {
      const reference = await genererReference();
      const emails = [form.email1, form.email2].filter(Boolean);
      const telephones = [form.tel1, form.tel2].filter(Boolean);
      const secteurs = form.secteurs;
      const adresse = [form.adresse_rue, [form.adresse_cp, form.adresse_ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');

      const { data, error: err } = await supabase.from('clients').insert({
        reference, prenom: form.prenom, nom: form.nom,
        adresse: adresse || null,
        emails, telephones, statut: form.statut, chaleur: form.chaleur,
        type_bien: form.type_bien || null,
        budget_min: form.budget_min ? parseInt(form.budget_min) : null,
        budget_max: form.budget_max ? parseInt(form.budget_max) : null,
        surface_min: form.surface_min ? parseInt(form.surface_min) : null,
        surface_max: form.surface_max ? parseInt(form.surface_max) : null,
        nb_pieces_min: form.nb_pieces_min ? parseInt(form.nb_pieces_min) : null,
        nb_pieces_max: form.nb_pieces_max ? parseInt(form.nb_pieces_max) : null,
        chambres_min: form.chambres_min ? parseInt(form.chambres_min) : null,
        secteurs,
        etage_min: form.etage_min ? parseInt(form.etage_min) : null,
        etage_max: form.etage_max ? parseInt(form.etage_max) : null,
        rdc_exclu: form.rdc_exclu, dernier_etage: form.dernier_etage,
        dpe_max: form.dpe_max || null,
        annee_construction_min: form.annee_min ? parseInt(form.annee_min) : null,
        parking: form.parking, cave: form.cave, balcon: form.balcon,
        terrasse: form.terrasse, jardin: form.jardin,
        ascenseur: form.ascenseur, gardien: form.gardien,
        etat_souhaite: form.etat_souhaite || null,
        exposition_souhaitee: form.exposition.length ? form.exposition.join(', ') : null,
        surface_sejour_min: form.surface_sejour_min ? parseInt(form.surface_sejour_min) : null,
        urgence: form.urgence || null,
        financement: form.financement || null,
        apport: form.apport ? parseInt(form.apport) : null,
        mandat_date_signature: form.sans_mandat ? null : (form.mandat_date_signature || null),
        mandat_duree: form.sans_mandat ? null : (form.mandat_duree ? parseInt(form.mandat_duree) : null),
        mandat_honoraires: form.sans_mandat ? null : (form.mandat_honoraires || null),
        notes: form.notes || null,
        est_vendeur: false,
      }).select().single();

      if (err) throw err;
      if (data) {
        await addJournal(data.id, 'creation', 'Dossier créé', `Référence : ${reference}`);
      }
      setShowModal(false);
      setForm(initForm);
      fetchClients();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création');
    }
    setSaving(false);
  }

  const nbParStatut = (s: string) => s === 'tous' ? clients.length : clients.filter(c => c.statut === s).length;

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Mes Clients</h1>
          <p className={styles.sub}>{clients.length} clients · {clients.filter(c => c.statut === 'actif').length} actifs · {clients.filter(c => c.statut === 'prospect').length} prospects</p>
        </div>
        <button className={styles.btnPrimary} onClick={openModal}>+ Nouveau client</button>
      </div>

      {/* FILTRES */}
      <div className={styles.filtres}>
        <div className={styles.filtreGroup}>
          {STATUTS.map(s => (
            <button
              key={s.key}
              className={`${styles.filtreBtn} ${filtre === s.key ? styles.filtreBtnActive : ''}`}
              onClick={() => setFiltre(s.key)}
            >
              {s.label}
              <span className={styles.filtreBadge}>{nbParStatut(s.key)}</span>
            </button>
          ))}
        </div>
        <div className={styles.searchBox}>
          <span>🔍</span>
          <input
            type="text"
            placeholder="Nom, email, secteur, référence..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* LISTE */}
      {loading ? (
        <div className={styles.loading}>Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>👥</div>
          <div className={styles.emptyTitle}>{search || filtre !== 'tous' ? 'Aucun client trouvé' : 'Aucun client pour l\'instant'}</div>
          <div className={styles.emptySub}>{!search && filtre === 'tous' && 'Cliquez sur "+ Nouveau client" pour commencer'}</div>
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map(client => {
            const st = statutBadge[client.statut];
            const initiales = `${client.prenom[0]}${client.nom[0]}`.toUpperCase();
            const joursSuivi = Math.floor((Date.now() - new Date(client.created_at).getTime()) / 86400000);

            const equipements = [client.parking&&'🅿️',client.balcon&&'🌿',client.terrasse&&'☀️',client.jardin&&'🌳',client.cave&&'📦',client.ascenseur&&'🛗'].filter(Boolean);
            return (
              <div
                key={client.id}
                className={styles.clientRow}
                onClick={() => onNavigate('fiche', client)}
              >
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: (client.statut as string) === 'actif' ? '#ecfdf5' : (client.statut as string) === 'prospect' ? '#f5f3ff' : (client.statut as string) === 'suspendu' ? '#fffbeb' : (client.statut as string) === 'bien_trouve' ? '#eff6ff' : '#fef2f2', border: `3px solid ${(client.statut as string) === 'actif' ? '#10b981' : (client.statut as string) === 'prospect' ? '#8b5cf6' : (client.statut as string) === 'suspendu' ? '#f59e0b' : (client.statut as string) === 'bien_trouve' ? '#3b82f6' : '#ef4444'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#1a2332', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                    {client.prenom[0]}
                  </div>
                </div>
                <div className={styles.clientInfo}>
                  {/* Ligne 1 : nom + badges */}
                  <div className={styles.clientTop}>
                    <span className={styles.clientName} style={{ fontSize: 16, fontWeight: 800 }}>{client.prenom} {client.nom}</span>
                    <span className={styles.badge} style={{ color: st.color, background: st.bg, border: `1px solid ${st.color}30` }}>{st.label}</span>
                    <span className={styles.badgeGold}>{client.reference}</span>
                    {client.mandat_date_expiration && (() => { const j = Math.floor((new Date(client.mandat_date_expiration).getTime()-Date.now())/86400000); return j<15 ? <span className={styles.badge} style={{color:'#ef4444',background:'#fef2f2',border:'1px solid #fecaca'}}>⚠️ Mandat {j > 0 ? `${j}j restants` : 'expiré'}</span> : null; })()}
                  </div>
                  {/* Ligne 2 : critères en chips */}
                  {(client.type_bien || client.budget_min || client.surface_min || client.secteurs?.length > 0) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                      {client.type_bien && <span style={{ fontSize: 11, fontWeight: 600, color: '#1a2332', background: '#f1f5f9', padding: '2px 8px', borderRadius: 20, border: '1px solid #e3e8f0' }}>🏠 {client.type_bien}</span>}
                      {client.budget_min && <span style={{ fontSize: 11, fontWeight: 700, color: '#854d0e', background: '#fef9c3', padding: '2px 8px', borderRadius: 20, border: '1px solid #fde68a' }}>💰 {client.budget_max ? `${(client.budget_min/1000).toFixed(0)}–${(client.budget_max/1000).toFixed(0)}k€` : `min ${(client.budget_min/1000).toFixed(0)}k€`}</span>}
                      {client.surface_min && <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', background: '#f8fafc', padding: '2px 8px', borderRadius: 20, border: '1px solid #e3e8f0' }}>📐 {client.surface_max ? `${client.surface_min}–${client.surface_max}m²` : `min ${client.surface_min}m²`}</span>}
                      {client.nb_pieces_min && <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', background: '#f8fafc', padding: '2px 8px', borderRadius: 20, border: '1px solid #e3e8f0' }}>🚪 {client.nb_pieces_max ? `${client.nb_pieces_min}–${client.nb_pieces_max}P` : `min ${client.nb_pieces_min}P`}</span>}
                      {client.dpe_max && <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', background: '#f0fdf4', padding: '2px 8px', borderRadius: 20, border: '1px solid #bbf7d0' }}>🌿 DPE ≤{client.dpe_max}</span>}
                      {equipements.map((e,i) => <span key={i} style={{ fontSize: 11 }}>{e}</span>)}
                    </div>
                  )}
                  {/* Ligne 3 : villes uniquement */}
                  {client.secteurs?.length > 0 && (() => {
                    const villes = [...new Set(client.secteurs.map((s:string) => {
                      const m = s.match(/\((.+?)\)$/);
                      return m ? m[1].trim() : s;
                    }))];
                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                        {villes.slice(0,4).map((v:any) => (
                          <span key={v} style={{ fontSize: 11, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a', padding: '1px 7px', borderRadius: 20, fontWeight: 600 }}>📍 {v}</span>
                        ))}
                        {villes.length > 4 && <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>+{villes.length-4} autres</span>}
                      </div>
                    );
                  })()}
                </div>
                <div className={styles.clientStats}>
                  <div className={styles.stat}><div className={styles.statN}>—</div><div className={styles.statL}>Biens</div></div>
                  <div className={styles.stat}><div className={styles.statN}>—</div><div className={styles.statL}>Visites</div></div>
                  <div className={styles.stat}><div className={styles.statN}>{joursSuivi}j</div><div className={styles.statL}>Suivi</div></div>
                </div>
                <span className={styles.chevron}>›</span>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL NOUVEAU CLIENT — assistant en étapes */}
      {showModal && (() => {
        const STEPS = ['Identité', 'Recherche', 'Profil & mandat'];
        const canNext = step > 0 || (form.prenom.trim() && form.nom.trim());
        const expoOptions = [
          { k: 'sud', l: 'Sud' }, { k: 'est', l: 'Est' }, { k: 'ouest', l: 'Ouest' },
          { k: 'nord', l: 'Nord' }, { k: 'traversant', l: 'Traversant' },
        ];
        const toggleExpo = (k: string) =>
          setForm(f => ({ ...f, exposition: f.exposition.includes(k) ? f.exposition.filter(x => x !== k) : [...f.exposition, k] }));

        return (
          <div className={styles.modalOverlay}>
            <div className={styles.modal} style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>

              {/* En-tête */}
              <div style={{ padding: '22px 26px 0', position: 'relative' }}>
                <button onClick={() => setShowModal(false)} style={{ position: 'absolute', top: 18, right: 18, background: '#f1f5f9', border: 'none', borderRadius: 10, width: 32, height: 32, cursor: 'pointer', color: '#64748b', fontSize: 15 }}>✕</button>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1a2332' }}>Nouveau client</h2>
                <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Mandat de recherche acquéreur</div>

                {/* Stepper */}
                <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                  {STEPS.map((s, i) => (
                    <div key={s} style={{ flex: 1 }}>
                      <div style={{ height: 4, borderRadius: 4, background: i <= step ? '#1a2332' : '#e3e8f0', transition: 'background 0.25s' }} />
                      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6, color: i === step ? '#1a2332' : '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{i + 1}. {s}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Corps défilant */}
              <div style={{ padding: '22px 26px', overflowY: 'auto', flex: 1 }}>
                {error && <div className={styles.errorBox} style={{ marginBottom: 16 }}>{error}</div>}

                {/* ÉTAPE 1 — IDENTITÉ & CONTACT */}
                {step === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <Bloc titre="👤 Identité">
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}><label className={styles.label}>Prénom *</label><input className={styles.input} value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} placeholder="Sophie" /></div>
                        <div className={styles.formGroup}><label className={styles.label}>Nom *</label><input className={styles.input} value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Martin" /></div>
                      </div>
                      <div className={styles.formGroup} style={{ position: 'relative' }}>
                        <label className={styles.label}>Adresse actuelle</label>
                        <input className={styles.input} value={form.adresse_rue} onChange={e => searchAdresse(e.target.value)} placeholder="Commencez à taper : 12 rue de la Paix..." autoComplete="off" />
                        {adrSug.length > 0 && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e3e8f0', borderRadius: 10, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 30, overflow: 'hidden' }}>
                            {adrSug.map((f, i) => (
                              <div key={i} onClick={() => pickAdresse(f)} style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'white')}>{f.properties.label}</div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}><label className={styles.label}>Code postal</label><input className={styles.input} value={form.adresse_cp} onChange={e => setForm({ ...form, adresse_cp: e.target.value })} placeholder="75002" /></div>
                        <div className={styles.formGroup}><label className={styles.label}>Ville</label><input className={styles.input} value={form.adresse_ville} onChange={e => setForm({ ...form, adresse_ville: e.target.value })} placeholder="Paris" /></div>
                      </div>
                    </Bloc>

                    <Bloc titre="📞 Contact">
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}><label className={styles.label}>Email principal</label><input className={styles.input} type="email" value={form.email1} onChange={e => setForm({ ...form, email1: e.target.value })} placeholder="sophie@gmail.com" /></div>
                        <div className={styles.formGroup}><label className={styles.label}>Email secondaire</label><input className={styles.input} type="email" value={form.email2} onChange={e => setForm({ ...form, email2: e.target.value })} placeholder="s.martin@work.fr" /></div>
                      </div>
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}><label className={styles.label}>Téléphone principal</label><input className={styles.input} value={form.tel1} onChange={e => setForm({ ...form, tel1: e.target.value })} placeholder="06 12 34 56 78" /></div>
                        <div className={styles.formGroup}><label className={styles.label}>Téléphone secondaire</label><input className={styles.input} value={form.tel2} onChange={e => setForm({ ...form, tel2: e.target.value })} placeholder="06 98 76 54 32" /></div>
                      </div>
                    </Bloc>

                    <Bloc titre="🔥 Suivi commercial">
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Statut</label>
                          <select className={styles.input} value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value as StatutClient })}>
                            <option value="prospect">🟣 Prospect</option>
                            <option value="actif">🟢 Actif</option>
                            <option value="suspendu">⏸️ Suspendu</option>
                          </select>
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Chaleur client</label>
                          <select className={styles.input} value={form.chaleur} onChange={e => setForm({ ...form, chaleur: e.target.value })}>
                            {CHALEURS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </Bloc>
                  </div>
                )}

                {/* ÉTAPE 2 — CRITÈRES DE RECHERCHE */}
                {step === 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <Bloc titre="🏠 Le bien recherché">
                      <div className={styles.formGroup}>
                        <label className={styles.label}>Type de bien</label>
                        <select className={styles.input} value={form.type_bien} onChange={e => setForm({ ...form, type_bien: e.target.value })}>
                          <option>Appartement</option><option>Maison</option><option>Loft</option><option>Duplex</option><option>Studio</option><option>Hôtel particulier</option><option>Atelier</option><option>Autre</option>
                        </select>
                      </div>
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}><label className={styles.label}>Budget min (€)</label><input className={styles.input} type="number" value={form.budget_min} onChange={e => setForm({ ...form, budget_min: e.target.value })} placeholder="300000" /></div>
                        <div className={styles.formGroup}><label className={styles.label}>Budget max (€)</label><input className={styles.input} type="number" value={form.budget_max} onChange={e => setForm({ ...form, budget_max: e.target.value })} placeholder="420000" /></div>
                      </div>
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}><label className={styles.label}>Surface min (m²)</label><input className={styles.input} type="number" value={form.surface_min} onChange={e => setForm({ ...form, surface_min: e.target.value })} placeholder="60" /></div>
                        <div className={styles.formGroup}><label className={styles.label}>Surface max (m²)</label><input className={styles.input} type="number" value={form.surface_max} onChange={e => setForm({ ...form, surface_max: e.target.value })} placeholder="85" /></div>
                      </div>
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}><label className={styles.label}>Pièces min</label><input className={styles.input} type="number" value={form.nb_pieces_min} onChange={e => setForm({ ...form, nb_pieces_min: e.target.value })} placeholder="3" /></div>
                        <div className={styles.formGroup}><label className={styles.label}>Pièces max</label><input className={styles.input} type="number" value={form.nb_pieces_max} onChange={e => setForm({ ...form, nb_pieces_max: e.target.value })} placeholder="4" /></div>
                      </div>
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}><label className={styles.label}>Chambres min</label><input className={styles.input} type="number" value={form.chambres_min} onChange={e => setForm({ ...form, chambres_min: e.target.value })} placeholder="2" /></div>
                        <div className={styles.formGroup}><label className={styles.label}>Séjour min (m²)</label><input className={styles.input} type="number" value={form.surface_sejour_min} onChange={e => setForm({ ...form, surface_sejour_min: e.target.value })} placeholder="25" /></div>
                      </div>
                    </Bloc>

                    <Bloc titre="📍 Secteurs recherchés">
                      <SecteurPicker secteurs={form.secteurs} onChange={(next) => setForm(f => ({ ...f, secteurs: next }))} />
                    </Bloc>

                    <Bloc titre="🎯 Critères fins">
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}><label className={styles.label}>Étage min</label><input className={styles.input} type="number" value={form.etage_min} onChange={e => setForm({ ...form, etage_min: e.target.value })} placeholder="2" /></div>
                        <div className={styles.formGroup}><label className={styles.label}>Étage max</label><input className={styles.input} type="number" value={form.etage_max} onChange={e => setForm({ ...form, etage_max: e.target.value })} placeholder="5" /></div>
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>Contraintes d'étage</label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {[{ k: 'rdc_exclu', l: '🚫 Exclure RDC' }, { k: 'dernier_etage', l: '🏙️ Dernier étage' }].map(o => (
                            <button type="button" key={o.k} onClick={() => setForm({ ...form, [o.k]: !(form as any)[o.k] })} style={pill((form as any)[o.k], '#1a2332', '#1a2332', 'white')}>{o.l}</button>
                          ))}
                        </div>
                      </div>
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>État souhaité</label>
                          <select className={styles.input} value={form.etat_souhaite} onChange={e => setForm({ ...form, etat_souhaite: e.target.value })}>
                            <option value="">Indifférent</option><option value="a_renover">À rénover</option><option value="travaux_legers">Travaux légers</option><option value="bon_etat">Bon état</option><option value="refait_neuf">Refait à neuf</option>
                          </select>
                        </div>
                        <div className={styles.formGroup}><label className={styles.label}>Année construction min</label><input className={styles.input} type="number" value={form.annee_min} onChange={e => setForm({ ...form, annee_min: e.target.value })} placeholder="1990" /></div>
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>Exposition souhaitée <span style={{ color: '#94a3b8', fontWeight: 400 }}>(plusieurs possibles)</span></label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {expoOptions.map(o => (
                            <button type="button" key={o.k} onClick={() => toggleExpo(o.k)} style={pill(form.exposition.includes(o.k), '#10b981', '#ecfdf5', '#10b981')}>{form.exposition.includes(o.k) ? '✓ ' : ''}{o.l}</button>
                          ))}
                        </div>
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>DPE maximum accepté</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(d => (
                            <button type="button" key={d} onClick={() => setForm({ ...form, dpe_max: form.dpe_max === d ? '' : d })} style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${form.dpe_max === d ? '#1a2332' : '#e2e8f0'}`, background: form.dpe_max === d ? '#1a2332' : 'white', color: form.dpe_max === d ? 'white' : '#64748b', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{d}</button>
                          ))}
                        </div>
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>Équipements souhaités</label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {[{ k: 'parking', l: '🅿️ Parking' }, { k: 'cave', l: '📦 Cave' }, { k: 'balcon', l: '🌿 Balcon' }, { k: 'terrasse', l: '☀️ Terrasse' }, { k: 'jardin', l: '🌳 Jardin' }, { k: 'ascenseur', l: '🛗 Ascenseur' }, { k: 'gardien', l: '👮 Gardien' }].map(o => (
                            <button type="button" key={o.k} onClick={() => setForm({ ...form, [o.k]: !(form as any)[o.k] })} style={pill((form as any)[o.k], '#10b981', '#ecfdf5', '#10b981')}>{o.l}</button>
                          ))}
                        </div>
                      </div>
                    </Bloc>
                  </div>
                )}

                {/* ÉTAPE 3 — PROFIL D'ACHAT, MANDAT, NOTES */}
                {step === 2 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <Bloc titre="💳 Profil d'achat">
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Urgence du projet</label>
                          <select className={styles.input} value={form.urgence} onChange={e => setForm({ ...form, urgence: e.target.value })}>
                            <option value="">Non précisée</option><option value="immediate">Immédiate</option><option value="3_mois">Sous 3 mois</option><option value="6_mois">Sous 6 mois</option><option value="annee">Dans l'année</option>
                          </select>
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Financement</label>
                          <select className={styles.input} value={form.financement} onChange={e => setForm({ ...form, financement: e.target.value })}>
                            <option value="">Non précisé</option><option value="cash">Cash</option><option value="pret_valide">Prêt validé</option><option value="pret_en_cours">Prêt en cours</option><option value="a_monter">À monter</option>
                          </select>
                        </div>
                      </div>
                      <div className={styles.formGroup}><label className={styles.label}>Apport (€)</label><input className={styles.input} type="number" value={form.apport} onChange={e => setForm({ ...form, apport: e.target.value })} placeholder="100000" /></div>
                    </Bloc>

                    <Bloc titre="📋 Mandat de recherche">
                      <button type="button" onClick={() => setForm({ ...form, sans_mandat: !form.sans_mandat })} style={{ ...pill(form.sans_mandat, '#3b82f6', '#eff6ff', '#1e40af'), marginBottom: form.sans_mandat ? 0 : 14 }}>
                        {form.sans_mandat ? '✓ ' : ''}Recherche sans mandat signé
                      </button>
                      {!form.sans_mandat && (
                        <>
                          <div className={styles.formRow}>
                            <div className={styles.formGroup}><label className={styles.label}>Date de signature</label><input className={styles.input} type="date" value={form.mandat_date_signature} onChange={e => setForm({ ...form, mandat_date_signature: e.target.value })} /></div>
                            <div className={styles.formGroup}><label className={styles.label}>Durée (mois)</label><input className={styles.input} type="number" value={form.mandat_duree} onChange={e => setForm({ ...form, mandat_duree: e.target.value })} placeholder="3" /></div>
                          </div>
                          <div className={styles.formGroup}><label className={styles.label}>Honoraires convenus</label><input className={styles.input} value={form.mandat_honoraires} onChange={e => setForm({ ...form, mandat_honoraires: e.target.value })} placeholder="3,5% TTC" /></div>
                        </>
                      )}
                    </Bloc>

                    <Bloc titre="💬 Notes libres">
                      <textarea className={styles.textarea} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Contexte, particularités, exclusions, préférences fines... (l'analyse des biens en tiendra compte)" rows={4} />
                    </Bloc>
                  </div>
                )}
              </div>

              {/* Pied de page navigation */}
              <div style={{ padding: '16px 26px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <button type="button" className={styles.btnSecondary} onClick={() => (step === 0 ? setShowModal(false) : setStep(step - 1))}>
                  {step === 0 ? 'Annuler' : '← Retour'}
                </button>
                {step < 2 ? (
                  <button type="button" className={styles.btnPrimary} disabled={!canNext} style={{ opacity: canNext ? 1 : 0.5 }} onClick={() => { if (!canNext) { setError('Prénom et nom obligatoires'); return; } setError(''); setStep(step + 1); }}>
                    Continuer →
                  </button>
                ) : (
                  <button type="button" className={styles.btnPrimary} disabled={saving} onClick={handleCreate}>
                    {saving ? 'Création...' : '✓ Créer le dossier'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
