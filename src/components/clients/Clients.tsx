'use client';
import { useState, useEffect } from 'react';
import { supabase, genererReference, addJournal } from '@/lib/supabase';
import type { Client, StatutClient } from '@/lib/supabase';
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
  prenom: '', nom: '', adresse: '',
  email1: '', email2: '', tel1: '', tel2: '',
  statut: 'prospect' as StatutClient, chaleur: 'tiede',
  type_bien: 'Appartement',
  budget_min: '', budget_max: '',
  surface_min: '', surface_max: '',
  nb_pieces_min: '', nb_pieces_max: '',
  secteurs: '',
  mandat_date_signature: '', mandat_duree: '3', mandat_honoraires: '3,5% TTC',
  notes: '',
};

export default function Clients({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState('tous');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(initForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      const secteurs = form.secteurs.split(',').map(s => s.trim()).filter(Boolean);

      const { data, error: err } = await supabase.from('clients').insert({
        reference, prenom: form.prenom, nom: form.nom,
        adresse: form.adresse || null,
        emails, telephones, statut: form.statut, chaleur: form.chaleur,
        type_bien: form.type_bien || null,
        budget_min: form.budget_min ? parseInt(form.budget_min) : null,
        budget_max: form.budget_max ? parseInt(form.budget_max) : null,
        surface_min: form.surface_min ? parseInt(form.surface_min) : null,
        surface_max: form.surface_max ? parseInt(form.surface_max) : null,
        nb_pieces_min: form.nb_pieces_min ? parseInt(form.nb_pieces_min) : null,
        nb_pieces_max: form.nb_pieces_max ? parseInt(form.nb_pieces_max) : null,
        secteurs,
        mandat_date_signature: form.mandat_date_signature || null,
        mandat_duree: form.mandat_duree ? parseInt(form.mandat_duree) : null,
        mandat_honoraires: form.mandat_honoraires || null,
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
        <button className={styles.btnPrimary} onClick={() => setShowModal(true)}>+ Nouveau client</button>
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

      {/* MODAL NOUVEAU CLIENT */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Nouveau client</h2>
              <button className={styles.modalClose} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} className={styles.modalBody}>

              {error && <div className={styles.errorBox}>{error}</div>}

              <div className={styles.formSection}>IDENTITÉ</div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Prénom *</label>
                  <input className={styles.input} value={form.prenom} onChange={e => setForm({...form, prenom: e.target.value})} placeholder="Sophie" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Nom *</label>
                  <input className={styles.input} value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} placeholder="Martin" />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Adresse</label>
                <input className={styles.input} value={form.adresse} onChange={e => setForm({...form, adresse: e.target.value})} placeholder="12 rue de la Paix, Paris 2ème" />
              </div>

              <div className={styles.formSection}>CONTACT</div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Email principal</label>
                  <input className={styles.input} type="email" value={form.email1} onChange={e => setForm({...form, email1: e.target.value})} placeholder="sophie@gmail.com" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Email secondaire</label>
                  <input className={styles.input} type="email" value={form.email2} onChange={e => setForm({...form, email2: e.target.value})} placeholder="s.martin@work.fr" />
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Téléphone principal</label>
                  <input className={styles.input} value={form.tel1} onChange={e => setForm({...form, tel1: e.target.value})} placeholder="06 12 34 56 78" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Téléphone secondaire</label>
                  <input className={styles.input} value={form.tel2} onChange={e => setForm({...form, tel2: e.target.value})} placeholder="06 98 76 54 32" />
                </div>
              </div>

              <div className={styles.formSection}>STATUT & CHALEUR</div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Statut</label>
                  <select className={styles.input} value={form.statut} onChange={e => setForm({...form, statut: e.target.value as StatutClient})}>
                    <option value="prospect">🟣 Prospect</option>
                    <option value="actif">🟢 Actif</option>
                    <option value="suspendu">⏸️ Suspendu</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Chaleur client</label>
                  <select className={styles.input} value={form.chaleur} onChange={e => setForm({...form, chaleur: e.target.value})}>
                    {CHALEURS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              <div className={styles.formSection}>CRITÈRES DE RECHERCHE</div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Type de bien</label>
                  <select className={styles.input} value={form.type_bien} onChange={e => setForm({...form, type_bien: e.target.value})}>
                    <option>Appartement</option>
                    <option>Maison</option>
                    <option>Loft</option>
                    <option>Duplex</option>
                    <option>Studio</option>
                    <option>Autre</option>
                  </select>
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Budget min (€)</label>
                  <input className={styles.input} type="number" value={form.budget_min} onChange={e => setForm({...form, budget_min: e.target.value})} placeholder="300000" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Budget max (€)</label>
                  <input className={styles.input} type="number" value={form.budget_max} onChange={e => setForm({...form, budget_max: e.target.value})} placeholder="420000" />
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Surface min (m²)</label>
                  <input className={styles.input} type="number" value={form.surface_min} onChange={e => setForm({...form, surface_min: e.target.value})} placeholder="60" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Surface max (m²)</label>
                  <input className={styles.input} type="number" value={form.surface_max} onChange={e => setForm({...form, surface_max: e.target.value})} placeholder="85" />
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Pièces min</label>
                  <input className={styles.input} type="number" value={form.nb_pieces_min} onChange={e => setForm({...form, nb_pieces_min: e.target.value})} placeholder="3" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Pièces max</label>
                  <input className={styles.input} type="number" value={form.nb_pieces_max} onChange={e => setForm({...form, nb_pieces_max: e.target.value})} placeholder="4" />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Secteurs recherchés (séparés par virgule)</label>
                <input className={styles.input} value={form.secteurs} onChange={e => setForm({...form, secteurs: e.target.value})} placeholder="Boulogne-Billancourt, Paris 16ème, Neuilly" />
              </div>

              <div className={styles.formSection}>MANDAT DE RECHERCHE</div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Date de signature</label>
                  <input className={styles.input} type="date" value={form.mandat_date_signature} onChange={e => setForm({...form, mandat_date_signature: e.target.value})} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Durée (mois)</label>
                  <input className={styles.input} type="number" value={form.mandat_duree} onChange={e => setForm({...form, mandat_duree: e.target.value})} placeholder="3" />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Honoraires convenus</label>
                <input className={styles.input} value={form.mandat_honoraires} onChange={e => setForm({...form, mandat_honoraires: e.target.value})} placeholder="3,5% TTC" />
              </div>

              <div className={styles.formSection}>NOTES</div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Notes libres</label>
                <textarea className={styles.textarea} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Contexte, situation, particularités..." rows={3} />
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className={styles.btnPrimary} disabled={saving}>
                  {saving ? 'Création...' : 'Créer le dossier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
