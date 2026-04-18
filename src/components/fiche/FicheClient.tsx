'use client';
import { useState, useEffect, useRef } from 'react';
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

const ORDRE_ETAPES = ['offre','negociation','offre_acceptee','compromis','acte'];

interface Props { client: Client; onBack: () => void; onNavigate: (page: string, data?: unknown) => void; }

function BienFormFields({ bienForm, setBienForm, prixAcq, styles }: { bienForm: any; setBienForm: any; prixAcq: number; styles: any }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div style={{ gridColumn: '1/-1' }}><label className={styles.lbl}>Titre</label><input className={styles.inp} value={bienForm.titre||''} onChange={e => setBienForm((f: any) => ({ ...f, titre: e.target.value }))} /></div>
      <div><label className={styles.lbl}>Type</label><select className={styles.inp} value={bienForm.type_bien||'Appartement'} onChange={e => setBienForm((f: any) => ({ ...f, type_bien: e.target.value }))}><option>Appartement</option><option>Maison</option><option>Loft</option><option>Studio</option><option>Duplex</option><option>Villa</option></select></div>
      <div><label className={styles.lbl}>Source</label><input className={styles.inp} value={bienForm.source_portail||''} onChange={e => setBienForm((f: any) => ({ ...f, source_portail: e.target.value }))} placeholder="SeLoger..." /></div>
      <div><label className={styles.lbl}>Ville</label><input className={styles.inp} value={bienForm.ville||''} onChange={e => setBienForm((f: any) => ({ ...f, ville: e.target.value }))} /></div>
      <div><label className={styles.lbl}>Code postal</label><input className={styles.inp} value={bienForm.code_postal||''} onChange={e => setBienForm((f: any) => ({ ...f, code_postal: e.target.value }))} /></div>
      <div><label className={styles.lbl}>Surface m²</label><input className={styles.inp} type="number" value={bienForm.surface||''} onChange={e => setBienForm((f: any) => ({ ...f, surface: e.target.value }))} /></div>
      <div><label className={styles.lbl}>Pièces</label><input className={styles.inp} type="number" value={bienForm.nb_pieces||''} onChange={e => setBienForm((f: any) => ({ ...f, nb_pieces: e.target.value }))} /></div>
      <div><label className={styles.lbl}>Chambres</label><input className={styles.inp} type="number" value={bienForm.nb_chambres||''} onChange={e => setBienForm((f: any) => ({ ...f, nb_chambres: e.target.value }))} /></div>
      <div><label className={styles.lbl}>Étage</label><input className={styles.inp} type="number" value={bienForm.etage||''} onChange={e => setBienForm((f: any) => ({ ...f, etage: e.target.value }))} /></div>
      <div><label className={styles.lbl}>DPE</label><input className={styles.inp} value={bienForm.dpe||''} onChange={e => setBienForm((f: any) => ({ ...f, dpe: e.target.value }))} placeholder="A B C..." /></div>
      <div><label className={styles.lbl}>Prix vendeur €</label><input className={styles.inp} type="number" value={bienForm.prix_vendeur||''} onChange={e => setBienForm((f: any) => ({ ...f, prix_vendeur: e.target.value }))} /></div>
      <div><label className={styles.lbl}>Commission</label><div style={{ display: 'flex', gap: 6 }}><select className={styles.inp} style={{ width: 80 }} value={bienForm.commission_type} onChange={e => setBienForm((f: any) => ({ ...f, commission_type: e.target.value }))}><option value="pourcentage">%</option><option value="montant">€</option></select><input className={styles.inp} type="number" value={bienForm.commission_val||''} onChange={e => setBienForm((f: any) => ({ ...f, commission_val: e.target.value }))} /></div></div>
      <div><label className={styles.lbl}>Prix acquéreur</label><div className={styles.inp} style={{ background: '#fef9c3', color: '#854d0e', fontWeight: 700 }}>{prixAcq ? `${prixAcq.toLocaleString('fr-FR')}€` : '—'}</div></div>
      <div><label className={styles.lbl}>Agence</label><input className={styles.inp} value={bienForm.agence_nom||''} onChange={e => setBienForm((f: any) => ({ ...f, agence_nom: e.target.value }))} /></div>
      <div><label className={styles.lbl}>Tél. agence</label><input className={styles.inp} value={bienForm.agence_tel||''} onChange={e => setBienForm((f: any) => ({ ...f, agence_tel: e.target.value }))} /></div>
      <div style={{ gridColumn: '1/-1' }}><label className={styles.lbl}>Description</label><textarea className={styles.inp} rows={3} value={bienForm.description||''} onChange={e => setBienForm((f: any) => ({ ...f, description: e.target.value }))} /></div>
    </div>
  );
}

export default function FicheClient({ client: init, onBack }: Props) {
  const [client, setClient] = useState<Client>(init);
  const [tab, setTab] = useState('biens');
  const [biens, setBiens] = useState<any[]>([]);
  const [visites, setVisites] = useState<any[]>([]);
  const [transaction, setTransaction] = useState<any>(null);
  const [envois, setEnvois] = useState<any[]>([]);
  const [journal, setJournal] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [showContact, setShowContact] = useState(false);
  const [showCriteres, setShowCriteres] = useState(false);
  const [showMandat, setShowMandat] = useState(false);
  const [showBien, setShowBien] = useState(false);
  const [showAction, setShowAction] = useState(false);

  const [cf, setCf] = useState({ prenom: client.prenom, nom: client.nom, adresse: client.adresse||'', email1: client.emails?.[0]||'', email2: client.emails?.[1]||'', tel1: client.telephones?.[0]||'', tel2: client.telephones?.[1]||'' });
  const [crit, setCrit] = useState({ types_bien: (client.type_bien ? client.type_bien.split(',').map((t:string)=>t.trim()).filter(Boolean) : []) as string[], budget_min: client.budget_min?.toString()||'', budget_max: client.budget_max?.toString()||'', surface_min: client.surface_min?.toString()||'', surface_max: client.surface_max?.toString()||'', nb_pieces_min: client.nb_pieces_min?.toString()||'', nb_pieces_max: client.nb_pieces_max?.toString()||'', chambres_min: client.chambres_min?.toString()||'', secteurs: client.secteurs||[], notes: client.notes||'', parking: client.parking||false, balcon: client.balcon||false, terrasse: client.terrasse||false, jardin: client.jardin||false, cave: client.cave||false, ascenseur: client.ascenseur||false, gardien: client.gardien||false, interphone: (client as any).interphone||false, digicode: (client as any).digicode||false, rdc_exclu: client.rdc_exclu||false, dernier_etage: client.dernier_etage||false, etage_min: client.etage_min?.toString()||'', dpe_max: client.dpe_max||'', annee_min: client.annee_construction_min?.toString()||'' });
  const [secteurVilleActive, setSecteurVilleActive] = useState<{cp:string,ville:string}|null>(null);
  const [mandat, setMandat] = useState({ date_signature: client.mandat_date_signature||'', duree: client.mandat_duree?.toString()||'3', honoraires: client.mandat_honoraires||'3,5% TTC', date_expiration: client.mandat_date_expiration||'' });
  const [actionF, setActionF] = useState({ type: 'note', titre: '', description: '' });
  const [url, setUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [bienForm, setBienForm] = useState<any>(null);
  const [bienMode, setBienMode] = useState<'url'|'texte'>('url');
  const [texteAnnonce, setTexteAnnonce] = useState('');
  const [photosInput, setPhotosInput] = useState('');
  const [cpQ, setCpQ] = useState('');
  const [cpSug, setCpSug] = useState<any[]>([]);
  const [selCP, setSelCP] = useState('');
  const [txData, setTxData] = useState<any>({});
  const [showOffreEcrite, setShowOffreEcrite] = useState(false);
  const [showPlanVisite, setShowPlanVisite] = useState(false);
  const [showFicheBien, setShowFicheBien] = useState(false);
  const [showEnvoi, setShowEnvoi] = useState(false);
  const [showConfirmEtape, setShowConfirmEtape] = useState(false);
  const [showConfirmDeleteBien, setShowConfirmDeleteBien] = useState(false);
  const [showConfirmVisite, setShowConfirmVisite] = useState<string|null>(null);
  const [pendingBienId, setPendingBienId] = useState('');
  const [ficheBienId, setFicheBienId] = useState('');
  const [editBienForm, setEditBienForm] = useState<any>(null);
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [reformuling, setReformuling] = useState(false);
  const [dragOverIdx, setDragOverIdx] = useState<number|null>(null);
  const dragIdxRef = useRef(-1);
  const [showEnvoiBien, setShowEnvoiBien] = useState(false);
  const [envoiBienId, setEnvoiBienId] = useState('');
  const [envoiForm, setEnvoiForm] = useState({ destinataires: '', objet: '', corps: '', sms: false });
  const [envoiSending, setEnvoiSending] = useState(false);
  const [showCompteRendu, setShowCompteRendu] = useState(false);
  const [planVisteForm, setPlanVisiteForm] = useState({ bien_id: '', date: '', heure: '', contact: '', notes: '' });
  const [crForm, setCrForm] = useState({ visite_id: '', etoiles: 0, commentaire: '', avis_client: '' });
  const [offreForm, setOffreForm] = useState({ bien_id: '', montant: '', date: '', notes: '' });

  useEffect(() => { load(); }, [client.id]);
  useEffect(() => { if (transaction) setTxData(transaction); }, [transaction]);

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
      secteurs: crit.secteurs, notes: crit.notes || null,
      parking: crit.parking, cave: crit.cave, balcon: crit.balcon,
      terrasse: crit.terrasse, jardin: crit.jardin, ascenseur: crit.ascenseur,
      gardien: crit.gardien, interphone: (crit as any).interphone || false,
      digicode: (crit as any).digicode || false,
      rdc_exclu: crit.rdc_exclu, dernier_etage: crit.dernier_etage,
      etage_min: crit.etage_min ? parseInt(crit.etage_min) : null,
      dpe_max: crit.dpe_max || null,
      annee_construction_min: crit.annee_min ? parseInt(crit.annee_min) : null,
    }).eq('id', client.id).select().single();
    if (data) {
      setClient(data as Client);
      // Construire un diff détaillé
      const changes: string[] = [];
      const prev = client;
      const newTypes = crit.types_bien.join(', ');
      if ((prev.type_bien||'') !== newTypes) changes.push(`Type : "${prev.type_bien||'—'}" → "${newTypes||'—'}"`);
      if ((prev.budget_min||0) !== (parseInt(crit.budget_min)||0)) changes.push(`Budget min : ${(prev.budget_min||0).toLocaleString('fr-FR')}€ → ${(parseInt(crit.budget_min)||0).toLocaleString('fr-FR')}€`);
      if ((prev.budget_max||0) !== (parseInt(crit.budget_max)||0)) changes.push(`Budget max : ${(prev.budget_max||0).toLocaleString('fr-FR')}€ → ${(parseInt(crit.budget_max)||0).toLocaleString('fr-FR')}€`);
      if ((prev.surface_min||0) !== (parseInt(crit.surface_min)||0)) changes.push(`Surface min : ${prev.surface_min||'—'}m² → ${crit.surface_min||'—'}m²`);
      if ((prev.nb_pieces_min||0) !== (parseInt(crit.nb_pieces_min)||0)) changes.push(`Pièces min : ${prev.nb_pieces_min||'—'} → ${crit.nb_pieces_min||'—'}`);
      if ((prev.chambres_min||0) !== (parseInt(crit.chambres_min)||0)) changes.push(`Chambres min : ${prev.chambres_min||'—'} → ${crit.chambres_min||'—'}`);
      if ((prev.dpe_max||'') !== (crit.dpe_max||'')) changes.push(`DPE max : ${prev.dpe_max||'—'} → ${crit.dpe_max||'—'}`);
      if ((prev.etage_min||0) !== (parseInt(crit.etage_min)||0)) changes.push(`Étage min : ${prev.etage_min||'—'} → ${crit.etage_min||'—'}`);
      if ((prev.annee_construction_min||0) !== (parseInt(crit.annee_min)||0)) changes.push(`Année min : ${prev.annee_construction_min||'—'} → ${crit.annee_min||'—'}`);
      const equipKeys: [string, string][] = [['parking','Parking'],['balcon','Balcon'],['terrasse','Terrasse'],['jardin','Jardin'],['cave','Cave'],['ascenseur','Ascenseur'],['gardien','Gardien']];
      equipKeys.forEach(([k, l]) => { if ((prev as any)[k] !== (crit as any)[k]) changes.push(`${l} : ${(prev as any)[k] ? '✅' : '❌'} → ${(crit as any)[k] ? '✅' : '❌'}`); });
      if (JSON.stringify(prev.secteurs||[]) !== JSON.stringify(crit.secteurs)) {
        const added = crit.secteurs.filter(s => !(prev.secteurs||[]).includes(s));
        const removed = (prev.secteurs||[]).filter(s => !crit.secteurs.includes(s));
        if (added.length) changes.push(`Secteurs ajoutés : ${added.join(', ')}`);
        if (removed.length) changes.push(`Secteurs supprimés : ${removed.join(', ')}`);
      }
      if ((prev.notes||'') !== (crit.notes||'')) changes.push(`Notes modifiées`);
      const desc = changes.length > 0 ? changes.join(' · ') : 'Aucun changement détecté';
      await addJournal(client.id, 'criteres_modifies', '🎯 Critères mis à jour', desc);
    }
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
    if (statut === 'offre_ecrite') {
      if (biens.length === 0) { alert('Ajoutez d\'abord des biens à la fiche avant de créer une offre écrite.'); return; }
      setOffreForm({ bien_id: biens[0]?.id || '', montant: '', date: new Date().toISOString().split('T')[0], notes: '' });
      setShowOffreEcrite(true);
      return;
    }
    const { data } = await supabase.from('clients').update({ statut }).eq('id', client.id).select().single();
    if (data) { setClient(data as Client); await addJournal(client.id, 'statut_change', `Statut → ${statut}`); }
  }

  async function saveOffreEcrite() {
    if (!offreForm.bien_id || !offreForm.montant) { alert('Sélectionnez un bien et indiquez le montant de l\'offre.'); return; }
    setSaving(true);
    // Mettre à jour le statut client
    const { data: clientData } = await supabase.from('clients').update({ statut: 'offre_ecrite' }).eq('id', client.id).select().single();
    if (clientData) setClient(clientData as Client);
    // Créer ou mettre à jour la transaction
    if (!transaction) {
      await supabase.from('transactions').insert({ client_id: client.id, bien_id: offreForm.bien_id, etape_actuelle: 'offre', offre_montant: parseInt(offreForm.montant), offre_date: offreForm.date });
    } else {
      await supabase.from('transactions').update({ etape_actuelle: 'offre', offre_montant: parseInt(offreForm.montant), offre_date: offreForm.date, bien_id: offreForm.bien_id }).eq('id', transaction.id);
    }
    // Badge sur le bien
    await supabase.from('biens').update({ badge_retour: 'offre_faite' }).eq('id', offreForm.bien_id);
    // Journal
    const bien = biens.find(b => b.id === offreForm.bien_id);
    const desc = `Montant : ${parseInt(offreForm.montant).toLocaleString('fr-FR')}€ · Bien : ${bien?.titre || bien?.ville || '—'}${offreForm.notes ? ' · ' + offreForm.notes : ''}`;
    await addJournal(client.id, 'offre_ecrite', '✍️ Offre écrite créée', desc);
    setSaving(false); setShowOffreEcrite(false); load();
  }

  async function changeChaleur(chaleur: string) {
    const { data } = await supabase.from('clients').update({ chaleur }).eq('id', client.id).select().single();
    if (data) setClient(data as Client);
  }

  async function parseTexte() {
    const texte = texteAnnonce.trim();
    if (texte.length < 30) {
      alert('Veuillez coller le texte de l\'annonce (au moins quelques lignes).');
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch('/api/parse-texte-bien', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texte, url }),
      });
      if (!res.ok) {
        alert(`Erreur serveur : ${res.status}. Vérifiez que le fichier parse-texte-bien/route.ts est bien déployé.`);
        setExtracting(false);
        return;
      }
      const data = await res.json();
      if (data.error) {
        alert(`Erreur : ${data.error}`);
        setExtracting(false);
        return;
      }
      if (data.bien) {
        const photosManual = photosInput.split('\n').map((s: string) => s.trim()).filter((s: string) => s.startsWith('http'));
        setBienForm({
          ...data.bien,
          url: url || '',
          commission_type: 'pourcentage',
          commission_val: '',
          photos: photosManual.length > 0 ? photosManual : (data.bien.photos || []),
          source_portail: data.bien.source_portail || 'Autre',
          _method: data.method,
        });
      } else {
        alert('Impossible d\'extraire les informations. Essayez de coller plus de texte.');
      }
    } catch (e: any) {
      alert(`Erreur réseau : ${e.message}`);
    }
    setExtracting(false);
  }

  async function extract() {
    if (!url) return;
    setExtracting(true);
    try {
      const res = await fetch('/api/extract-bien', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (data.bien) { setBienForm({ ...data.bien, url, commission_type: 'pourcentage', commission_val: '', _partial: data.partial, _reason: data.reason }); }
      else { setBienForm({ url, titre: '', prix_vendeur: '', surface: '', nb_pieces: '', ville: '', description: '', commission_type: 'pourcentage', commission_val: '' }); }
    } catch { setBienForm({ url, titre: '', prix_vendeur: '', surface: '', nb_pieces: '', ville: '', description: '', commission_type: 'pourcentage', commission_val: '' }); }
    setExtracting(false);
  }

  const prixAcq = bienForm ? (bienForm.commission_type === 'pourcentage' ? Math.round((parseFloat(bienForm.prix_vendeur)||0) * (1 + (parseFloat(bienForm.commission_val)||0) / 100)) : (parseFloat(bienForm.prix_vendeur)||0) + (parseFloat(bienForm.commission_val)||0)) : 0;

  async function saveBien() {
    if (!bienForm) return;
    setSaving(true);
    // Vérifier doublon URL seulement si une URL est fournie
    if (bienForm.url && bienForm.url.trim()) {
      const { data: ex } = await supabase.from('biens').select('id').eq('client_id', client.id).eq('url', bienForm.url.trim()).maybeSingle();
      if (ex) { alert('Ce bien (même URL) est déjà dans la liste !'); setSaving(false); return; }
    }
    // Générer un ID temporaire pour le dossier storage
    const tempId = crypto.randomUUID();
    // Uploader les photos vers Supabase Storage
    const photosStockees = await uploadPhotosToStorage(bienForm.photos || [], tempId);
    const { data: bienInsere } = await supabase.from('biens').insert({ client_id: client.id, url: bienForm.url||null, titre: bienForm.titre, ville: bienForm.ville, code_postal: bienForm.code_postal, type_bien: bienForm.type_bien, surface: parseFloat(bienForm.surface)||null, nb_pieces: parseInt(bienForm.nb_pieces)||null, nb_chambres: parseInt(bienForm.nb_chambres)||null, etage: parseInt(bienForm.etage)||null, parking: bienForm.parking||false, dpe: bienForm.dpe, description: bienForm.description, prix_vendeur: parseFloat(bienForm.prix_vendeur)||null, commission_type: bienForm.commission_type, commission_val: parseFloat(bienForm.commission_val)||null, prix_acquereur: prixAcq||null, photos: photosStockees, source_portail: bienForm.source_portail, agence_nom: bienForm.agence_nom, badge_retour: 'propose' }).select().single();
    await addJournal(client.id, 'bien_ajoute', `🏠 Bien ajouté — ${bienForm.titre||bienForm.ville||''}`, bienForm.url||'');
    setSaving(false); setShowBien(false); setUrl(''); setBienForm(null); setTexteAnnonce(''); setPhotosInput(''); setBienMode('url'); load();
  }

  async function changeBadge(bienId: string, badge: string) {
    await supabase.from('biens').update({ badge_retour: badge }).eq('id', bienId);
    if (badge === 'offre_faite' && !transaction) { await supabase.from('transactions').insert({ client_id: client.id, bien_id: bienId, etape_actuelle: 'offre' }); await addJournal(client.id, 'offre_faite', 'Offre faite — Transaction ouverte'); }
    load();
  }

  async function planifierVisite(bienId: string) {
    // Vérifier si une visite à venir existe déjà pour ce bien
    const existante = visites.find(v => v.bien_id === bienId && v.statut === 'a_venir');
    if (existante) {
      setShowConfirmVisite(existante.id);
    setPendingBienId(bienId);
    return;
    }
    setPlanVisiteForm({ bien_id: bienId, date: '', heure: '', contact: '', notes: '' });
    setShowPlanVisite(true);
  }

  async function doRemplacerVisite() {
    const visiteId = showConfirmVisite;
    const bienId = pendingBienId;
    if (visiteId) await supabase.from('visites').delete().eq('id', visiteId);
    setShowConfirmVisite(null);
    await load();
    setPlanVisiteForm({ bien_id: bienId, date: '', heure: '', contact: '', notes: '' });
    setShowPlanVisite(true);
  }

  async function uploadPhotosToStorage(photos: string[], bienId: string): Promise<string[]> {
    if (!photos || photos.length === 0) return [];
    try {
      const res = await fetch('/api/upload-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos, bien_id: bienId }),
      });
      if (!res.ok) return photos; // fallback
      const data = await res.json();
      return data.urls?.length > 0 ? data.urls : photos;
    } catch {
      return photos; // fallback : garder URLs originales
    }
  }

  async function reformulerDescription() {
    if (!editBienForm?.description) { alert('Aucune description à reformuler.'); return; }
    setReformuling(true);
    try {
      const res = await fetch('/api/parse-texte-bien', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texte: `Reformule cette description de bien immobilier en langage professionnel de chasseur immobilier. 
Sois concis, valorisant, orienté acquéreur. Max 5 phrases percutantes. Pas de liste à puces. 
Ne répète pas les chiffres (surface, pièces) déjà dans les caractéristiques.
Description originale : ${editBienForm.description}`,
          url: '',
        }),
      });
      const data = await res.json();
      // On utilise la description retournée par Claude
      if (data.bien?.description) {
        setEditBienForm((f: any) => ({ ...f, description: data.bien.description }));
      } else {
        // Fallback : appel direct sans passer par parse-texte-bien
        alert('Reformulation indisponible — clé Anthropic non configurée.');
      }
    } catch { alert('Erreur lors de la reformulation.'); }
    setReformuling(false);
  }

  function openFicheBien(bienId: string) {
    const b = biens.find(x => x.id === bienId);
    if (!b) return;
    setFicheBienId(bienId);
    setEditBienForm({ ...b, commission_val: b.commission_val || 3.5, commission_type: b.commission_type || 'pourcentage' });
    setNewPhotoUrl('');
    setShowFicheBien(true);
  }

  async function saveFicheBien() {
    if (!editBienForm) return;
    setSaving(true);
    // Uploader les nouvelles photos (celles qui ne sont pas encore dans Supabase Storage)
    const photosAUploader = (editBienForm.photos || []).filter((p: string) => !p.includes('supabase.co/storage'));
    const photosDejaStockees = (editBienForm.photos || []).filter((p: string) => p.includes('supabase.co/storage'));
    let photosFinales = editBienForm.photos || [];
    if (photosAUploader.length > 0) {
      const urlsUploadees = await uploadPhotosToStorage(photosAUploader, ficheBienId);
      // Reconstruire dans le bon ordre
      photosFinales = (editBienForm.photos || []).map((p: string) => {
        if (p.includes('supabase.co/storage')) return p;
        const idx = photosAUploader.indexOf(p);
        return idx >= 0 ? urlsUploadees[idx] : p;
      });
    }
    const prixAcqEdit = editBienForm.commission_type === 'pourcentage'
      ? Math.round((parseFloat(editBienForm.prix_vendeur)||0) * (1 + (parseFloat(editBienForm.commission_val)||0) / 100))
      : (parseFloat(editBienForm.prix_vendeur)||0) + (parseFloat(editBienForm.commission_val)||0);
    await supabase.from('biens').update({ photos: photosFinales,
      titre: editBienForm.titre, ville: editBienForm.ville, code_postal: editBienForm.code_postal,
      type_bien: editBienForm.type_bien, surface: parseFloat(editBienForm.surface)||null,
      nb_pieces: parseInt(editBienForm.nb_pieces)||null, etage: parseInt(editBienForm.etage)||null,
      parking: editBienForm.parking||false, dpe: editBienForm.dpe,
      description: editBienForm.description, prix_vendeur: parseFloat(editBienForm.prix_vendeur)||null,
      commission_type: editBienForm.commission_type, commission_val: parseFloat(editBienForm.commission_val)||null,
      prix_acquereur: prixAcqEdit||null,
      source_portail: editBienForm.source_portail, agence_nom: editBienForm.agence_nom,
      agence_tel: editBienForm.agence_tel, url: editBienForm.url||null,
    }).eq('id', ficheBienId);
    await addJournal(client.id, 'bien_modifie', `🏠 Bien modifié — ${editBienForm.titre||editBienForm.ville||''}`);
    setSaving(false); setShowFicheBien(false); load();
  }

  async function deleteBien(bienId: string) {
    setPendingBienId(bienId); setShowConfirmDeleteBien(true);
  }

  async function doDeleteBien() {
    const bienId = pendingBienId;
    setShowConfirmDeleteBien(false);
    // Récupérer les photos stockées dans Supabase Storage pour les supprimer
    const bien = biens.find(b => b.id === bienId);
    if (bien?.photos?.length > 0) {
      const photosStorage = bien.photos.filter((p: string) => p.includes('supabase.co/storage'));
      if (photosStorage.length > 0) {
        // Extraire les chemins relatifs depuis les URLs publiques
        const paths = photosStorage.map((url: string) => {
          const match = url.match(/photos-biens\/(.+)$/);
          return match ? match[1] : null;
        }).filter(Boolean) as string[];
        if (paths.length > 0) {
          await supabase.storage.from('photos-biens').remove(paths);
        }
      }
    }
    await supabase.from('biens').delete().eq('id', bienId);
    await addJournal(client.id, 'bien_supprime', `🗑️ Bien supprimé — ${bien?.titre || bien?.ville || ''}`);
    setShowFicheBien(false); load();
  }

  function openEnvoiBien(bienId: string) {
    const b = biens.find(x => x.id === bienId);
    const emails = client.emails?.filter(Boolean) || [];
    const titre = b?.titre || `${b?.type_bien||'Bien'} — ${b?.ville||''}`;
    setEnvoiBienId(bienId);
    setEnvoiForm({
      destinataires: emails.join(', '),
      objet: `Proposition immobilière — ${titre}`,
      corps: `Bonjour ${client.prenom},

Veuillez trouver ci-joint la fiche détaillée du bien suivant :

📍 ${titre}${b?.surface ? `
📐 Surface : ${b.surface}m²` : ''}${b?.nb_pieces ? `
🚪 ${b.nb_pieces} pièces` : ''}${b?.prix_acquereur ? `
💰 Prix : ${b.prix_acquereur.toLocaleString('fr-FR')}€` : ''}

N'hésitez pas à me contacter pour plus d'informations ou pour organiser une visite.

Cordialement,
Alexandre ROGELET
Emilio Immobilier`,
      sms: false,
    });
    setShowEnvoiBien(true);
  }

  async function saveEnvoiBien() {
    if (!envoiForm.destinataires) { alert('Indiquez un destinataire.'); return; }
    setEnvoiSending(true);
    const b = biens.find(x => x.id === envoiBienId);
    // Sauvegarder l'envoi en base
    await supabase.from('envois').insert({
      client_id: client.id, type: 'selection_biens',
      objet: envoiForm.objet,
      corps: envoiForm.corps,
      destinataires: envoiForm.destinataires.split(',').map((s: string) => s.trim()).filter(Boolean),
      biens_ids: [envoiBienId],
      sms_envoye: envoiForm.sms,
    });
    await addJournal(client.id, 'envoi_bien', `📤 Bien envoyé — ${b?.titre || b?.ville || ''}`, `Destinataires : ${envoiForm.destinataires}`);
    setEnvoiSending(false); setShowEnvoiBien(false); load();
    alert('Envoi enregistré ! (Intégration Mailjet à configurer dans Paramètres pour envoi réel)');
  }

  async function savePlanVisite() {
    const { bien_id, date, heure, contact, notes } = planVisteForm;
    if (!bien_id) return;
    await supabase.from('visites').insert({ client_id: client.id, bien_id, statut: 'a_venir', date_visite: date || null, heure: heure || null, contact_agence: contact || null, commentaire: notes || null });
    await supabase.from('biens').update({ badge_retour: 'souhaite_visiter' }).eq('id', bien_id);
    const bien = biens.find(b => b.id === bien_id);
    const desc = [date ? `Le ${new Date(date).toLocaleDateString('fr-FR')}` : '', heure ? `à ${heure}` : '', contact ? `· Contact : ${contact}` : ''].filter(Boolean).join(' ');
    await addJournal(client.id, 'visite_planifiee', `📅 Visite planifiée — ${bien?.titre || bien?.ville || ''}`, desc);
    setShowPlanVisite(false); load();
  }

  async function marquerEffectuee(visiteId: string, bienId: string) {
    setCrForm({ visite_id: visiteId, etoiles: 0, commentaire: '', avis_client: '' });
    setShowCompteRendu(true);
    // pré-sélectionner le bien pour le compte-rendu
    const _ = bienId;
  }

  async function saveCompteRendu() {
    const { visite_id, etoiles, commentaire, avis_client } = crForm;
    await supabase.from('visites').update({ statut: 'effectuee', note_etoiles: etoiles, commentaire, avis_client }).eq('id', visite_id);
    const v = visites.find(x => x.id === visite_id);
    const b = biens.find(x => x.id === v?.bien_id);
    await supabase.from('biens').update({ badge_retour: 'visite' }).eq('id', v?.bien_id);
    const etoilesStr = etoiles > 0 ? ' · ' + '⭐'.repeat(etoiles) : '';
    const desc = [commentaire ? `Avis : "${commentaire}"` : '', avis_client ? `Retour client : "${avis_client}"` : ''].filter(Boolean).join(' · ');
    await addJournal(client.id, 'visite_effectuee', `✅ Visite effectuée${etoilesStr} — ${b?.titre || b?.ville || ''}`, desc || undefined);
    setShowCompteRendu(false); load();
  }

  async function saveAction() {
    const typeLabels: Record<string, string> = { appel: 'Appel passé', rdv: 'RDV physique', note: 'Note', relance_manuelle: 'Relance manuelle', envoi_externe: 'Envoi externe', email_libre: 'Email envoyé' };
    const titre = actionF.titre.trim() || typeLabels[actionF.type] || 'Action';
    await addJournal(client.id, actionF.type, titre, actionF.description);
    setShowAction(false); setActionF({ type: 'note', titre: '', description: '' }); load();
  }

  async function saveTxField(field: string, value: any) {
    setTxData((prev: any) => ({ ...prev, [field]: value }));
    await supabase.from('transactions').update({ [field]: value }).eq('id', transaction.id);
  }

  async function avancerEtape(prochaine: string, label: string) {
    await supabase.from('transactions').update({ etape_actuelle: prochaine }).eq('id', transaction.id);
    await addJournal(client.id, prochaine, label);
    load();
  }

  async function reculerEtape() {
    setShowConfirmEtape(true);
  }

  async function doReculerEtape() {
    const idx = ORDRE_ETAPES.indexOf(transaction.etape_actuelle);
    if (idx <= 0) return;
    const precedente = ORDRE_ETAPES[idx - 1];
    await supabase.from('transactions').update({ etape_actuelle: precedente }).eq('id', transaction.id);
    await addJournal(client.id, 'retour_etape', `Retour → ${ETAPES_LABELS[precedente]}`);
    setShowConfirmEtape(false); load();
  }

  const jours = Math.floor((Date.now() - new Date(client.created_at).getTime()) / 86400000);
  const joursMandat = client.mandat_date_expiration ? Math.floor((new Date(client.mandat_date_expiration).getTime() - Date.now()) / 86400000) : null;

  const TABS = [
    { id: 'biens', label: `🏠 Biens (${biens.length})` },
    { id: 'visites', label: `📅 Visites (${visites.length})` },
    { id: 'transaction', label: transaction ? `📋 Transaction${transaction.etape_actuelle === 'finalise' ? ' ✅' : ''}` : '📋 Transaction' },
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

  const ETAPES_LABELS: Record<string, string> = {
    offre: '1 — Offre', negociation: '2 — Négociation',
    offre_acceptee: '3 — Offre acceptée', compromis: '4 — Compromis', acte: '5 — Acte'
  };

  return (
    <div className={styles.page}>

      <div className={styles.pageHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className={styles.backBtn} onClick={onBack}>← Clients</button>
          <span style={{ color: '#94a3b8' }}>/</span>
          <span style={{ fontWeight: 600, color: '#1a2332', fontSize: 14 }}>{client.prenom} {client.nom}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={styles.btn} onClick={() => setShowEnvoi(true)} style={{ background: '#fef9c3', border: '1px solid #fde68a', color: '#854d0e', fontWeight: 700 }}>📤 Envoyer</button>
          <button className={styles.btn} onClick={async () => { const date = new Date(); date.setDate(date.getDate() + 5); await supabase.from('relances').insert({ client_id: client.id, date_relance: date.toISOString().split('T')[0], motif: 'Relance manuelle', statut: 'a_faire' }); await addJournal(client.id, 'relance_manuelle', '🔔 Relance créée pour J+5'); load(); alert('Relance créée pour dans 5 jours !'); }}>🔔 Relance J+5</button>
          <button className={styles.btn} onClick={() => setShowAction(true)}>+ Action</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowBien(true)}>+ Ajouter un bien</button>
        </div>
      </div>

      <div className={styles.identiteBar}>
        {/* Avatar + Nom + Contact inline */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flex: 1 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: (client.statut as string) === 'actif' ? '#ecfdf5' : (client.statut as string) === 'prospect' ? '#f5f3ff' : (client.statut as string) === 'suspendu' ? '#fffbeb' : (client.statut as string) === 'offre_ecrite' ? '#fffbeb' : (client.statut as string) === 'bien_trouve' ? '#eff6ff' : '#fef2f2', border: `3px solid ${(client.statut as string) === 'actif' ? '#10b981' : (client.statut as string) === 'prospect' ? '#8b5cf6' : (client.statut as string) === 'suspendu' ? '#f59e0b' : (client.statut as string) === 'offre_ecrite' ? '#f59e0b' : (client.statut as string) === 'bien_trouve' ? '#3b82f6' : '#ef4444'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#1a2332', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{client.prenom[0]}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <div className={styles.clientName}>{client.prenom} {client.nom}</div>
              <div style={{ position: 'relative' }}>
                <select value={client.statut} onChange={e => changeStatut(e.target.value)} style={{ padding: '5px 28px 5px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid #e2e8f0', background: (client.statut as string) === 'prospect' ? '#f5f3ff' : (client.statut as string) === 'actif' ? '#ecfdf5' : (client.statut as string) === 'suspendu' ? '#fffbeb' : (client.statut as string) === 'offre_ecrite' ? '#fffbeb' : (client.statut as string) === 'bien_trouve' ? '#eff6ff' : '#fef2f2', color: (client.statut as string) === 'prospect' ? '#8b5cf6' : (client.statut as string) === 'actif' ? '#10b981' : (client.statut as string) === 'suspendu' ? '#f59e0b' : (client.statut as string) === 'offre_ecrite' ? '#f59e0b' : (client.statut as string) === 'bien_trouve' ? '#3b82f6' : '#ef4444', appearance: 'none', WebkitAppearance: 'none', outline: 'none' }}>
                  <option value="prospect">🟣 Prospect</option><option value="actif">🟢 Actif</option><option value="suspendu">⏸️ Suspendu</option><option value="offre_ecrite">✍️ Offre écrite</option><option value="bien_trouve">✅ Bien trouvé</option><option value="perdu">🔴 Perdu</option>
                </select>
                <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 9 }}>▼</span>
              </div>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{client.reference} · {jours}j de suivi</span>
              <button onClick={() => { setCf({ prenom: client.prenom, nom: client.nom, adresse: client.adresse||'', email1: client.emails?.[0]||'', email2: client.emails?.[1]||'', tel1: client.telephones?.[0]||'', tel2: client.telephones?.[1]||'' }); setShowContact(true); }} style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>✏️ Modifier</button>
            </div>
            {/* Infos contact inline */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              {client.telephones?.filter(Boolean).map(t => <a key={t} href={`tel:${t}`} style={{ fontSize: 14, color: '#1a2332', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>📞 {t}</a>)}
              {client.emails?.filter(Boolean).map(e => <a key={e} href={`mailto:${e}`} style={{ fontSize: 14, color: '#3b82f6', fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>✉️ {e}</a>)}
              {client.adresse && <span style={{ fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>📍 {client.adresse}</span>}
              {!client.telephones?.length && !client.emails?.length && <span style={{ fontSize: 12, color: '#94a3b8' }}>Aucun contact renseigné</span>}
            </div>
          </div>
        </div>
        {/* KPIs */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {[{val: biens.length, l:'Biens présentés',c:'#1a2332'},{val: visites.filter(v=>v.statut==='effectuee').length,l:'Visites effectuées',c:'#1a2332'},{val: biens.filter(b=>b.badge_retour==='offre_faite').length,l:'Offre(s)',c:'#c9a84c'},{val:`${jours}j`,l:'Suivi',c:'#1a2332'}].map((s, i) => (
            <div key={i} className={styles.syntheseItem}>
              <div className={styles.syntheseVal} style={{ color: s.c }}>{s.val}</div>
              <div className={styles.syntheseLabel}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.contentWrap}>

        {/* INFOS CLIENT (Contact + Critères + Mandat) - en bas */}
        <div className={styles.infoRow}>
          <div className={styles.infoCard} style={{ flex: 2 }}>
            <div className={styles.infoCardHeader}>🎯 Critères de recherche <button className={styles.editBtn} onClick={() => { setCrit({ types_bien: (client.type_bien ? client.type_bien.split(',').map((t:string)=>t.trim()).filter(Boolean) : []) as string[], budget_min: client.budget_min?.toString()||'', budget_max: client.budget_max?.toString()||'', surface_min: client.surface_min?.toString()||'', surface_max: client.surface_max?.toString()||'', nb_pieces_min: client.nb_pieces_min?.toString()||'', nb_pieces_max: client.nb_pieces_max?.toString()||'', chambres_min: client.chambres_min?.toString()||'', secteurs: client.secteurs||[], notes: client.notes||'', parking: client.parking||false, balcon: client.balcon||false, terrasse: client.terrasse||false, jardin: client.jardin||false, cave: client.cave||false, ascenseur: client.ascenseur||false, gardien: client.gardien||false, interphone: (client as any).interphone||false, digicode: (client as any).digicode||false, rdc_exclu: client.rdc_exclu||false, dernier_etage: client.dernier_etage||false, etage_min: client.etage_min?.toString()||'', dpe_max: client.dpe_max||'', annee_min: client.annee_construction_min?.toString()||'' }); setShowCriteres(true); }}>✏️ Modifier</button></div>
            <div className={styles.infoCardBody}>
              {(client.type_bien || client.budget_min || client.surface_min || client.nb_pieces_min || client.secteurs?.length || client.dpe_max || client.parking || client.balcon || client.terrasse || client.jardin || client.cave || client.ascenseur) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Type seul sur sa ligne */}
                  {client.type_bien && (
                    <div style={{ paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Type</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a2332' }}>{client.type_bien}</div>
                    </div>
                  )}
                  {/* Autres critères chiffrés */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
                    {client.budget_min && <div><div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Budget</div><div style={{ fontSize: 15, fontWeight: 700, color: '#c9a84c' }}>{client.budget_max ? `${(client.budget_min/1000).toFixed(0)}–${(client.budget_max/1000).toFixed(0)}k€` : `min ${(client.budget_min/1000).toFixed(0)}k€`}</div></div>}
                    {client.surface_min && <div><div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Surface</div><div style={{ fontSize: 15, fontWeight: 700, color: '#1a2332' }}>{client.surface_max ? `${client.surface_min}–${client.surface_max}m²` : `min ${client.surface_min}m²`}</div></div>}
                    {client.nb_pieces_min && <div><div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Pièces</div><div style={{ fontSize: 15, fontWeight: 700, color: '#1a2332' }}>{client.nb_pieces_max ? `${client.nb_pieces_min}–${client.nb_pieces_max}P` : `min ${client.nb_pieces_min}P`}</div></div>}
                    {client.chambres_min && <div><div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Chambres</div><div style={{ fontSize: 15, fontWeight: 700, color: '#1a2332' }}>{`min ${client.chambres_min}`}</div></div>}
                    {client.dpe_max && <div><div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>DPE max</div><div style={{ fontSize: 15, fontWeight: 800, color: '#1a2332', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0 6px' }}>{client.dpe_max}</div></div>}
                    {(client.etage_min || client.rdc_exclu || client.dernier_etage) && <div><div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Étage</div><div style={{ fontSize: 15, fontWeight: 600, color: '#1a2332' }}>{[client.etage_min ? `min ${client.etage_min}` : '', client.rdc_exclu ? '🚫 RDC exclu' : '', client.dernier_etage ? '🏙️ Dernier' : ''].filter(Boolean).join(' · ')}</div></div>}
                    {client.annee_construction_min && <div><div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Année min</div><div style={{ fontSize: 15, fontWeight: 700, color: '#1a2332' }}>{client.annee_construction_min}</div></div>}
                  </div>
                  {/* Ligne 2 : Équipements */}
                  {(client.parking || client.balcon || client.terrasse || client.jardin || client.cave || client.ascenseur || client.gardien || (client as any).interphone || (client as any).digicode) && (
                    <div style={{ paddingBottom: client.secteurs?.length ? 8 : 0, borderBottom: client.secteurs?.length ? '1px solid #f1f5f9' : 'none' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Critères importants</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {[['parking','🅿️ Parking'],['balcon','🌿 Balcon'],['terrasse','☀️ Terrasse'],['jardin','🌳 Jardin'],['cave','📦 Cave'],['ascenseur','🛗 Ascenseur'],['gardien','👮 Gardien'],['interphone','🔔 Interphone'],['digicode','🔢 Digicode']].filter(([k]) => (client as any)[k]).map(([k,l]) => (
                          <span key={k} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '4px 12px', borderRadius: 20, fontSize: 14, fontWeight: 600 }}>{l}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Ligne 3 : Secteurs */}
                  {client.secteurs?.length > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Secteurs recherchés</div>
                  )}
                  {client.secteurs?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {(() => {
                        const bv: Record<string, string[]> = {};
                        client.secteurs.forEach((s:string) => {
                          const m = s.match(/^(.+?)\s*\((.+?)\)$/);
                          if (m) { const q=m[1].trim(),v=m[2].trim(); if(!bv[v])bv[v]=[]; bv[v].push(q); }
                          else { if(!bv[s])bv[s]=[]; }
                        });
                        return Object.entries(bv).map(([ville, qs]) => (
                          <div key={ville} style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#1a2332' }}>📍 {ville}</span>
                            {qs.length > 0 && qs.map(q => <span key={q} className={styles.secteurTag}>{q}</span>)}
                            {qs.length === 0 && <span className={styles.secteurTag}>Toute la ville</span>}
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                  {/* Notes */}
                  {client.notes && <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', paddingTop: 4, borderTop: '1px solid #f1f5f9' }}>{client.notes}</div>}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>Aucun critère défini</span>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowCriteres(true)}>+ Définir</button>
                </div>
              )}
            </div>
          </div>

          <div style={{ background: '#1a2332', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#c9a84c' }}>📋 Mandat</span>
              <button onClick={() => { setMandat({ date_signature: client.mandat_date_signature||'', duree: client.mandat_duree?.toString()||'3', honoraires: client.mandat_honoraires||'3,5% TTC', date_expiration: client.mandat_date_expiration||'' }); setShowMandat(true); }} style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>✏️</button>
            </div>
            {client.mandat_date_signature ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div><div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1 }}>Signé</div><div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{new Date(client.mandat_date_signature).toLocaleDateString('fr-FR')}</div></div>
                  <div><div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1 }}>Durée</div><div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{client.mandat_duree ? `${client.mandat_duree} mois` : '—'}</div></div>
                  <div><div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1 }}>Honoraires</div><div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{client.mandat_honoraires||'—'}</div></div>
                </div>
                {joursMandat !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: 15, fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, color: joursMandat < 15 ? '#fca5a5' : 'white' }}>{joursMandat > 0 ? `${joursMandat} jours restants` : 'Expiré'}</div>
                    <span style={{ fontSize: 10, background: joursMandat > 15 ? 'rgba(201,168,76,0.15)' : 'rgba(239,68,68,0.2)', color: joursMandat > 15 ? '#c9a84c' : '#fca5a5', border: `1px solid ${joursMandat > 15 ? 'rgba(201,168,76,0.2)' : 'rgba(239,68,68,0.3)'}`, padding: '3px 8px', borderRadius: 8, fontWeight: 700 }}>{joursMandat > 0 ? 'Actif' : '⚠️ Expiré'}</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginBottom: 8 }}>Non renseigné</div>
                <button onClick={() => setShowMandat(true)} style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Compléter</button>
              </div>
            )}
          </div>
        </div>

        {/* ONGLETS en haut */}
        <div className={styles.tabs}>
          {TABS.map(t => <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>



        {/* TAB BIENS */}
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
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 17, color: '#c9a84c' }}>{b.prix_acquereur ? `${b.prix_acquereur.toLocaleString('fr-FR')}€` : '—'}</div>
                        {b.prix_vendeur && b.commission_val && (
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                            {b.prix_vendeur.toLocaleString('fr-FR')}€ + {b.commission_type === 'pourcentage' ? `${b.commission_val}%` : `${b.commission_val.toLocaleString('fr-FR')}€`} commission
                          </div>
                        )}
                      </div>
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
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button onClick={() => openFicheBien(b.id)} style={{ fontSize: 12, background: '#f8fafc', color: '#1a2332', border: '1px solid #e2e8f0', padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>✏️ Détail</button>
                        <button onClick={() => openEnvoiBien(b.id)} style={{ fontSize: 12, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a', padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>📤 Envoyer</button>
                        <button onClick={() => planifierVisite(b.id)} style={{ fontSize: 12, background: '#f5f3ff', color: '#8b5cf6', border: '1px solid #ddd6fe', padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>📅 Visite</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB VISITES */}
        {tab === 'visites' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {visites.length === 0 && <div className={styles.emptyTab}><div style={{ fontSize: 32, marginBottom: 10 }}>📅</div><div style={{ fontWeight: 700, color: '#1a2332' }}>Aucune visite</div><div style={{ color: '#94a3b8', fontSize: 13 }}>Planifiez depuis l'onglet Biens</div></div>}

            {/* Section À venir */}
            {visites.filter(v => v.statut === 'a_venir').length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }}></span>
                  À venir — {visites.filter(v => v.statut === 'a_venir').length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {visites.filter(v => v.statut === 'a_venir').map(v => {
                    const b = biens.find(x => x.id === v.bien_id);
                    return (
                      <div key={v.id} className={styles.card} style={{ padding: 18, borderLeft: '3px solid #3b82f6' }}>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                          <div style={{ background: '#1a2332', borderRadius: 12, padding: '7px 11px', textAlign: 'center', minWidth: 50, flexShrink: 0 }}>
                            {v.date_visite ? <><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 20, color: 'white', lineHeight: 1 }}>{new Date(v.date_visite).getDate()}</div><div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>{new Date(v.date_visite).toLocaleDateString('fr-FR', { month: 'short' })}</div></> : <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 20 }}>—</div>}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#1a2332' }}>{b?.titre || b?.ville || 'Bien non renseigné'}</div>
                            {v.heure && <div style={{ fontSize: 14, color: '#c9a84c', fontWeight: 600, marginTop: 3 }}>{v.heure}</div>}
                            {v.contact_agence && <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>📞 {v.contact_agence}</div>}
                            {v.commentaire && <div style={{ fontSize: 13, color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '7px 11px', marginTop: 8 }}>📝 {v.commentaire}</div>}
                          </div>
                          <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, fontWeight: 600, background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', flexShrink: 0 }}>📅 À venir</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f8fafc', flexWrap: 'wrap' }}>
                          <input type="date" defaultValue={v.date_visite?.split('T')[0]} className={styles.inp} style={{ flex: 1, minWidth: 140 }} onChange={async e => { await supabase.from('visites').update({ date_visite: e.target.value }).eq('id', v.id); load(); }} />
                          <input type="time" defaultValue={v.heure} className={styles.inp} style={{ width: 110 }} onChange={async e => { await supabase.from('visites').update({ heure: e.target.value }).eq('id', v.id); }} />
                          <input className={styles.inp} placeholder="Contact agence" defaultValue={v.contact_agence} style={{ flex: 1, minWidth: 140 }} onChange={async e => { await supabase.from('visites').update({ contact_agence: e.target.value }).eq('id', v.id); }} />
                          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => marquerEffectuee(v.id, v.bien_id)}>✓ Effectuée</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Section Effectuées */}
            {visites.filter(v => v.statut === 'effectuee').length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                  Effectuées — {visites.filter(v => v.statut === 'effectuee').length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {visites.filter(v => v.statut === 'effectuee').map(v => {
                    const b = biens.find(x => x.id === v.bien_id);
                    return (
                      <div key={v.id} className={styles.card} style={{ padding: 18, borderLeft: '3px solid #10b981' }}>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                          <div style={{ background: '#ecfdf5', borderRadius: 12, padding: '7px 11px', textAlign: 'center', minWidth: 50, flexShrink: 0 }}>
                            {v.date_visite ? <><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 20, color: '#065f46', lineHeight: 1 }}>{new Date(v.date_visite).getDate()}</div><div style={{ fontSize: 9, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: 1 }}>{new Date(v.date_visite).toLocaleDateString('fr-FR', { month: 'short' })}</div></> : <div style={{ color: '#94a3b8', fontSize: 20 }}>—</div>}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#1a2332' }}>{b?.titre || b?.ville || 'Bien non renseigné'}</div>
                            {v.heure && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>🕐 {v.heure}</div>}
                            {v.contact_agence && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>📞 {v.contact_agence}</div>}
                            {/* Avis client */}
                            {v.avis_client && (
                              <div style={{ marginTop: 8 }}>
                                <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 700, background: v.avis_client === 'tres_interesse' ? '#fef9c3' : v.avis_client === 'interesse' ? '#eff6ff' : v.avis_client === 'elimine' ? '#fef2f2' : v.avis_client === 'pas_interesse' ? '#fef2f2' : '#f8fafc', color: v.avis_client === 'tres_interesse' ? '#854d0e' : v.avis_client === 'interesse' ? '#1d4ed8' : (v.avis_client === 'elimine' || v.avis_client === 'pas_interesse') ? '#ef4444' : '#64748b' }}>
                                  {v.avis_client === 'tres_interesse' ? '🔥 Très intéressé' : v.avis_client === 'interesse' ? '👍 Intéressé' : v.avis_client === 'a_voir' ? '🤔 À revoir' : v.avis_client === 'pas_interesse' ? '👎 Pas intéressé' : '❌ Éliminé'}
                                </span>
                              </div>
                            )}
                            {/* Note étoiles */}
                            {v.note_etoiles > 0 && <div style={{ marginTop: 6, fontSize: 16 }}>{'⭐'.repeat(v.note_etoiles)} <span style={{ fontSize: 12, color: '#94a3b8' }}>{v.note_etoiles}/5</span></div>}
                            {/* Compte-rendu */}
                            {v.commentaire && (
                              <div style={{ fontSize: 13, color: '#1a2332', background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginTop: 10, borderLeft: '3px solid #10b981' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Compte-rendu</div>
                                {v.commentaire}
                              </div>
                            )}
                          </div>
                          <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, fontWeight: 600, background: '#ecfdf5', color: '#10b981', border: '1px solid #bbf7d0', flexShrink: 0 }}>✅ Effectuée</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB TRANSACTION - refonte complète */}
        {tab === 'transaction' && (
          !transaction
            ? <div className={styles.emptyTab}><div style={{ fontSize: 36, marginBottom: 12 }}>📋</div><div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 17, color: '#1a2332', marginBottom: 6 }}>Aucune transaction</div><div style={{ color: '#94a3b8', fontSize: 14 }}>Posez le badge "Offre faite" sur un bien pour démarrer</div></div>
            : <div className={styles.card} style={{ padding: 24 }}>

                {/* Bien concerné */}
                {(() => { const bienTx = biens.find(b => b.id === transaction.bien_id); return bienTx ? (
                  <div style={{ background: '#f8fafc', border: '1px solid #e3e8f0', borderRadius: 12, padding: '10px 14px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                      {bienTx.photos?.[0] ? <img src={bienTx.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} /> : '🏠'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Bien concerné par la transaction</div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2332' }}>{bienTx.titre || `${bienTx.type_bien||'Bien'} — ${bienTx.ville||'—'}`}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{[bienTx.surface && `${bienTx.surface}m²`, bienTx.nb_pieces && `${bienTx.nb_pieces}P`, bienTx.ville].filter(Boolean).join(' · ')}</div>
                    </div>
                    {bienTx.prix_acquereur && <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 16, color: '#c9a84c', flexShrink: 0 }}>{bienTx.prix_acquereur.toLocaleString('fr-FR')}€</div>}
                    {transaction.etape_actuelle === 'offre' && biens.length > 1 && (
                      <select onChange={async e => { await supabase.from('transactions').update({ bien_id: e.target.value }).eq('id', transaction.id); load(); }} value={transaction.bien_id} className={styles.inp} style={{ fontSize: 12, width: 'auto', maxWidth: 160 }}>
                        {biens.map(b => <option key={b.id} value={b.id}>{b.titre || `${b.type_bien} — ${b.ville||'—'}`}</option>)}
                      </select>
                    )}
                  </div>
                ) : (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#92400e' }}>
                    ⚠️ Aucun bien associé à cette transaction.
                    {biens.length > 0 && <select onChange={async e => { await supabase.from('transactions').update({ bien_id: e.target.value }).eq('id', transaction.id); load(); }} className={styles.inp} style={{ marginLeft: 10, fontSize: 12, width: 'auto' }}>
                      <option value="">Choisir un bien...</option>
                      {biens.map(b => <option key={b.id} value={b.id}>{b.titre || `${b.type_bien} — ${b.ville||'—'}`}</option>)}
                    </select>}
                  </div>
                ); })()}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Étape en cours</div>
                    <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 20, color: '#1a2332' }}>
                      {transaction.etape_actuelle === 'finalise' ? '🎉 Dossier finalisé !' : ETAPES_LABELS[transaction.etape_actuelle]}
                    </div>
                  </div>
                  {transaction.etape_actuelle !== 'offre' && transaction.etape_actuelle !== 'finalise' && (
                    <button onClick={reculerEtape} className={styles.btn} style={{ fontSize: 12 }}>← Étape précédente</button>
                  )}
                </div>

                {ORDRE_ETAPES.map((etapeId, i) => {
                  const idx = ORDRE_ETAPES.indexOf(transaction.etape_actuelle);
                  const done = i < idx;
                  const cur = etapeId === transaction.etape_actuelle && transaction.etape_actuelle !== 'finalise';

                  return (
                    <div key={etapeId} style={{ display: 'flex', gap: 16, marginBottom: cur ? 0 : 16 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: done ? '#c9a84c' : cur ? '#1a2332' : '#f1f5f9', color: done ? '#1a2332' : cur ? 'white' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, boxShadow: cur ? '0 0 0 4px rgba(26,35,50,0.08)' : 'none' }}>
                          {done ? '✓' : i + 1}
                        </div>
                        {i < ORDRE_ETAPES.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 16, background: done ? '#c9a84c' : '#e3e8f0', marginTop: 4, marginBottom: 4, borderRadius: 1 }} />}
                      </div>

                      <div style={{ flex: 1, paddingTop: 6, paddingBottom: cur ? 20 : 0 }}>
                        <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 14, color: done ? '#64748b' : cur ? '#1a2332' : '#b0bec5', marginBottom: done || cur ? 6 : 0 }}>
                          {ETAPES_LABELS[etapeId]}
                        </div>

                        {done && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {etapeId === 'offre' && transaction.offre_montant && (
                              <span style={{ fontSize: 12, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>💰 {transaction.offre_montant.toLocaleString('fr-FR')}€{transaction.offre_date ? ` · ${new Date(transaction.offre_date).toLocaleDateString('fr-FR')}` : ''}</span>
                            )}
                            {etapeId === 'offre_acceptee' && transaction.prix_final && (
                              <span style={{ fontSize: 12, background: '#ecfdf5', color: '#16a34a', border: '1px solid #bbf7d0', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>✅ Prix final : {transaction.prix_final.toLocaleString('fr-FR')}€</span>
                            )}
                            {etapeId === 'compromis' && transaction.compromis_date && (
                              <span style={{ fontSize: 12, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>📋 {new Date(transaction.compromis_date).toLocaleDateString('fr-FR')}{transaction.compromis_notaire ? ` · ${transaction.compromis_notaire}` : ''}</span>
                            )}
                            {etapeId === 'negociation' && transaction.contre_offres?.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {(transaction.contre_offres as any[]).map((co: any, i: number) => (
                                  <span key={i} style={{ fontSize: 12, background: co.partie === 'acheteur' ? '#eff6ff' : '#fef2f2', color: co.partie === 'acheteur' ? '#1d4ed8' : '#dc2626', border: `1px solid ${co.partie === 'acheteur' ? '#bfdbfe' : '#fecaca'}`, padding: '3px 10px', borderRadius: 20, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    {co.partie === 'acheteur' ? '🏠 Acheteur' : '🏢 Vendeur'} · {parseInt(co.montant).toLocaleString('fr-FR')}€{co.date ? ` · ${new Date(co.date).toLocaleDateString('fr-FR')}` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {cur && (
                          <div style={{ background: '#f8fafc', borderRadius: 14, padding: 18, marginTop: 8, border: '1px solid #e3e8f0' }}>
                            {etapeId === 'offre' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div className={styles.formRow}>
                                  <div><label className={styles.lbl}>Montant offre €</label><input className={styles.inp} type="number" defaultValue={transaction.offre_montant} placeholder="Ex: 350 000" onChange={e => saveTxField('offre_montant', parseInt(e.target.value))} /></div>
                                  <div><label className={styles.lbl}>Date de l'offre</label><input className={styles.inp} type="date" defaultValue={transaction.offre_date} onChange={e => saveTxField('offre_date', e.target.value)} /></div>
                                </div>
                                <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ alignSelf: 'flex-end' }} onClick={() => avancerEtape('negociation', 'Passage en négociation')}>→ Passer en négociation</button>
                              </div>
                            )}
                            {etapeId === 'negociation' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <label className={styles.lbl}>Ajouter une contre-offre</label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  <select className={styles.inp} id="cop" style={{ width: 130 }}><option value="vendeur">Vendeur</option><option value="acheteur">Acheteur</option></select>
                                  <input className={styles.inp} type="number" id="com" placeholder="Montant €" style={{ flex: 1 }} />
                                  <input className={styles.inp} type="date" id="cod" style={{ width: 160 }} />
                                  <button className={styles.btn} onClick={async () => { const p = (document.getElementById('cop') as HTMLSelectElement).value; const m = (document.getElementById('com') as HTMLInputElement).value; const d = (document.getElementById('cod') as HTMLInputElement).value; await supabase.from('transactions').update({ contre_offres: [...(transaction.contre_offres||[]), {partie:p,montant:m,date:d}] }).eq('id', transaction.id); load(); }}>+ Ajouter</button>
                                </div>
                                {(transaction.contre_offres||[]).map((co: any, i: number) => (
                                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'center', background: 'white', padding: '8px 12px', borderRadius: 10, border: '1px solid #e3e8f0' }}>
                                    <span style={{ padding: '2px 10px', borderRadius: 20, fontWeight: 700, background: co.partie === 'vendeur' ? '#fef2f2' : '#f0fdf4', color: co.partie === 'vendeur' ? '#ef4444' : '#10b981' }}>{co.partie}</span>
                                    <span style={{ fontWeight: 600 }}>{parseInt(co.montant).toLocaleString('fr-FR')}€</span>
                                    <span style={{ color: '#94a3b8' }}>{co.date}</span>
                                  </div>
                                ))}
                                <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ alignSelf: 'flex-end' }} onClick={() => avancerEtape('offre_acceptee', 'Offre acceptée')}>✓ Offre acceptée →</button>
                              </div>
                            )}
                            {etapeId === 'offre_acceptee' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div><label className={styles.lbl}>Prix final accepté €</label><input className={styles.inp} type="number" defaultValue={transaction.prix_final} placeholder="Ex: 345 000" onChange={e => saveTxField('prix_final', parseInt(e.target.value))} /></div>
                                <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ alignSelf: 'flex-end' }} onClick={() => avancerEtape('compromis', 'Passage au compromis')}>→ Passer au compromis</button>
                              </div>
                            )}
                            {etapeId === 'compromis' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div className={styles.formRow}>
                                  <div><label className={styles.lbl}>Date compromis</label><input className={styles.inp} type="date" defaultValue={transaction.compromis_date} onChange={e => { saveTxField('compromis_date', e.target.value); saveTxField('sru_date_fin', new Date(new Date(e.target.value).getTime() + 10*86400000).toISOString().split('T')[0]); }} /></div>
                                  <div><label className={styles.lbl}>Notaire</label><input className={styles.inp} defaultValue={transaction.compromis_notaire} placeholder="Me Dupont..." onChange={e => saveTxField('compromis_notaire', e.target.value)} /></div>
                                </div>
                                <div className={styles.formRow}>
                                  <div><label className={styles.lbl}>Montant prêt €</label><input className={styles.inp} type="number" defaultValue={transaction.pret_montant} onChange={e => saveTxField('pret_montant', parseInt(e.target.value))} /></div>
                                  <div><label className={styles.lbl}>Apport €</label><input className={styles.inp} type="number" defaultValue={transaction.pret_apport} onChange={e => saveTxField('pret_apport', parseInt(e.target.value))} /></div>
                                </div>
                                {transaction.sru_date_fin && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e' }}>⏰ SRU : rétractation possible jusqu'au {new Date(transaction.sru_date_fin).toLocaleDateString('fr-FR')}</div>}
                                <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ alignSelf: 'flex-end' }} onClick={() => avancerEtape('acte', 'Passage à l\'acte')}>→ Passer à l'acte</button>
                              </div>
                            )}
                            {etapeId === 'acte' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div className={styles.formRow}>
                                  <div><label className={styles.lbl}>Date acte prévue</label><input className={styles.inp} type="date" defaultValue={transaction.acte_date_prevue} onChange={e => saveTxField('acte_date_prevue', e.target.value)} /></div>
                                  <div><label className={styles.lbl}>Honoraires HT €</label><input className={styles.inp} type="number" defaultValue={transaction.honoraires_ht} onChange={e => { saveTxField('honoraires_ht', parseInt(e.target.value)); saveTxField('honoraires_ttc', Math.round(parseInt(e.target.value)*1.2)); }} /></div>
                                </div>
                                {transaction.honoraires_ht && <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#16a34a', fontWeight: 600 }}>💰 Honoraires TTC : {Math.round((txData.honoraires_ht||transaction.honoraires_ht) * 1.2).toLocaleString('fr-FR')}€</div>}
                                <button style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: 10, padding: '12px 24px', fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 14, cursor: 'pointer', alignSelf: 'flex-end' }} onClick={async () => { await supabase.from('clients').update({ statut: 'bien_trouve' }).eq('id', client.id); await supabase.from('transactions').update({ etape_actuelle: 'finalise' }).eq('id', transaction.id); await addJournal(client.id, 'dossier_finalise', '🎉 Bien trouvé !'); refresh(); load(); }}>🎉 Clôturer — Bien trouvé !</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {transaction.etape_actuelle === 'finalise' && (
                  <div style={{ background: 'linear-gradient(135deg, #ecfdf5, #f0fdf4)', border: '1px solid #bbf7d0', borderRadius: 14, padding: 20, textAlign: 'center', marginTop: 8 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
                    <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 18, color: '#16a34a' }}>Dossier finalisé !</div>
                    {transaction.honoraires_ht && <div style={{ fontSize: 15, color: '#16a34a', marginTop: 6, fontWeight: 600 }}>Honoraires HT : {transaction.honoraires_ht.toLocaleString('fr-FR')}€</div>}
                    {transaction.acte_date_prevue && <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Acte prévu le {new Date(transaction.acte_date_prevue).toLocaleDateString('fr-FR')}</div>}
                  </div>
                )}
              </div>
        )}

        {/* TAB HISTORIQUE */}
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

        {/* TAB JOURNAL */}
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

      {showCriteres && (
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: 740 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>🎯 Critères de recherche</h2><button className={styles.modalClose} onClick={() => setShowCriteres(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div>
                <label className={styles.lbl}>Type(s) de bien <span style={{fontWeight:400,textTransform:'none',letterSpacing:0,color:'#94a3b8'}}>(plusieurs choix possibles)</span></label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['Appartement','Maison','Loft','Duplex','Studio','Villa','Terrain','Autre'].map(t => { const sel = crit.types_bien.includes(t); return <button key={t} onClick={() => setCrit(f => ({ ...f, types_bien: sel ? f.types_bien.filter(x=>x!==t) : [...f.types_bien, t] }))} style={{ padding: '7px 16px', borderRadius: 20, border: `1px solid ${sel ? '#1a2332' : '#e2e8f0'}`, background: sel ? '#1a2332' : 'white', color: sel ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>{t}</button>; })}
                </div>
              </div>
              <div>
                <label className={styles.lbl}>Budget</label>
                <div className={styles.formRow}>
                  <div><label className={styles.lbl}>Minimum €</label><input className={styles.inp} type="number" value={crit.budget_min} onChange={e => setCrit(f => ({ ...f, budget_min: e.target.value }))} placeholder="300 000" /></div>
                  <div><label className={styles.lbl}>Maximum €</label><input className={styles.inp} type="number" value={crit.budget_max} onChange={e => setCrit(f => ({ ...f, budget_max: e.target.value }))} placeholder="450 000" /></div>
                </div>
              </div>
              <div className={styles.formRow}>
                <div><label className={styles.lbl}>Surface m²</label><div style={{display:'flex',gap:6}}><input className={styles.inp} type="number" value={crit.surface_min} onChange={e=>setCrit(f=>({...f,surface_min:e.target.value}))} placeholder="Min" /><input className={styles.inp} type="number" value={crit.surface_max} onChange={e=>setCrit(f=>({...f,surface_max:e.target.value}))} placeholder="Max" /></div></div>
                <div><label className={styles.lbl}>Pièces</label><div style={{display:'flex',gap:6}}><input className={styles.inp} type="number" value={crit.nb_pieces_min} onChange={e=>setCrit(f=>({...f,nb_pieces_min:e.target.value}))} placeholder="Min" /><input className={styles.inp} type="number" value={crit.nb_pieces_max} onChange={e=>setCrit(f=>({...f,nb_pieces_max:e.target.value}))} placeholder="Max" /></div></div>
              </div>
              <div className={styles.formRow}>
                <div><label className={styles.lbl}>Chambres minimum</label><input className={styles.inp} type="number" value={crit.chambres_min} onChange={e=>setCrit(f=>({...f,chambres_min:e.target.value}))} placeholder="Ex: 2" /></div>
                <div><label className={styles.lbl}>Année construction min</label><input className={styles.inp} type="number" value={crit.annee_min} onChange={e=>setCrit(f=>({...f,annee_min:e.target.value}))} placeholder="Ex: 1990" /></div>
              </div>
              <div>
                <label className={styles.lbl}>Étage</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[{k:'rdc_exclu',l:'🚫 Exclure RDC'},{k:'dernier_etage',l:'🏙️ Dernier étage'}].map(o => (<button key={o.k} onClick={() => setCrit(f=>({...f,[o.k]:!(f as any)[o.k]}))} style={{ padding: '7px 14px', borderRadius: 20, border: `1px solid ${(crit as any)[o.k] ? '#1a2332' : '#e2e8f0'}`, background: (crit as any)[o.k] ? '#1a2332' : 'white', color: (crit as any)[o.k] ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>{o.l}</button>))}
                  <div style={{display:'flex',alignItems:'center',gap:6}}><label className={styles.lbl} style={{marginBottom:0}}>Étage min :</label><input className={styles.inp} type="number" value={crit.etage_min} onChange={e=>setCrit(f=>({...f,etage_min:e.target.value}))} placeholder="Ex: 2" style={{width:80}} /></div>
                </div>
              </div>
              <div>
                <label className={styles.lbl}>Équipements souhaités</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[{k:'parking',l:'🅿️ Parking'},{k:'cave',l:'📦 Cave'},{k:'balcon',l:'🌿 Balcon'},{k:'terrasse',l:'☀️ Terrasse'},{k:'jardin',l:'🌳 Jardin'},{k:'ascenseur',l:'🛗 Ascenseur'},{k:'gardien',l:'👮 Gardien'},{k:'interphone',l:'🔔 Interphone'},{k:'digicode',l:'🔢 Digicode'}].map(o => (<button key={o.k} onClick={() => setCrit(f=>({...f,[o.k]:!(f as any)[o.k]}))} style={{ padding: '7px 14px', borderRadius: 20, border: `1px solid ${(crit as any)[o.k] ? '#10b981' : '#e2e8f0'}`, background: (crit as any)[o.k] ? '#ecfdf5' : 'white', color: (crit as any)[o.k] ? '#10b981' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>{o.l}</button>))}
                </div>
              </div>
              <div>
                <label className={styles.lbl}>DPE maximum accepté</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['A','B','C','D','E','F','G'].map(d => (<button key={d} onClick={() => setCrit(f=>({...f,dpe_max:f.dpe_max===d?'':d}))} style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${crit.dpe_max===d ? '#1a2332' : '#e2e8f0'}`, background: crit.dpe_max===d ? '#1a2332' : 'white', color: crit.dpe_max===d ? 'white' : '#64748b', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{d}</button>))}
                </div>
              </div>
              <div>
                <label className={styles.lbl}>Secteurs / Quartiers</label>
                <div style={{ position: 'relative' }}>
                  <input className={styles.inp} value={cpQ} onChange={e => searchCP(e.target.value)} placeholder="Tapez un code postal ou une ville (ex: 92100, Neuilly...)" />
                  {cpSug.length > 0 && (
                    <div className={styles.suggestions}>
                      {cpSug.map((s, i) => (<div key={i} className={styles.suggItem} onClick={() => { const info = QUARTIERS[s.cp]; if (info?.quartiers) { setSecteurVilleActive({cp: s.cp, ville: info.ville}); } else { setSecteurVilleActive({cp: s.cp, ville: s.ville}); } setCpSug([]); setCpQ(''); }}><strong>{s.cp}</strong> — {s.ville}{QUARTIERS[s.cp] ? ' 📍 quartiers disponibles' : ''}</div>))}
                    </div>
                  )}
                </div>
                {secteurVilleActive && (
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, marginTop: 8, border: '1px solid #e3e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a2332' }}>📍 {secteurVilleActive.ville} ({secteurVilleActive.cp})</div>
                      <button onClick={() => setSecteurVilleActive(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>Fermer ✕</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      <button onClick={() => addSecteur(secteurVilleActive.cp, secteurVilleActive.ville)} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 20, border: '1px solid #1a2332', background: '#1a2332', color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>✓ Toute la ville</button>
                      {QUARTIERS[secteurVilleActive.cp]?.quartiers.map(q => { const label = `${q} (${secteurVilleActive.ville})`; const already = crit.secteurs.includes(label); return (<button key={q} onClick={() => already ? setCrit(f=>({...f,secteurs:f.secteurs.filter(x=>x!==label)})) : addSecteur(secteurVilleActive.cp, secteurVilleActive.ville, q)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20, border: `1px solid ${already ? '#10b981' : '#e2e8f0'}`, background: already ? '#ecfdf5' : 'white', color: already ? '#10b981' : '#64748b', cursor: 'pointer', fontFamily: 'inherit', fontWeight: already ? 600 : 400, transition: 'all 0.12s' }}>{already ? '✓ ' : ''}{q}</button>); })}
                      {!QUARTIERS[secteurVilleActive.cp] && <div style={{fontSize:12,color:'#94a3b8',fontStyle:'italic'}}>Aucun quartier prédéfini — la ville entière sera ajoutée</div>}
                    </div>
                    <div style={{fontSize:11,color:'#94a3b8'}}>💡 Vous pouvez sélectionner plusieurs quartiers puis chercher une autre ville</div>
                  </div>
                )}
                {crit.secteurs.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {crit.secteurs.map(s => (<span key={s} className={styles.secteurTag}>{s} <span onClick={() => setCrit(f=>({...f,secteurs:f.secteurs.filter(x=>x!==s)}))} style={{ cursor: 'pointer', marginLeft: 5, opacity: 0.6 }}>✕</span></span>))}
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <input className={styles.inp} placeholder="Ou saisir un secteur libre (ex: Triangle d'Or, Proche RER...)" onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) { const v = (e.target as HTMLInputElement).value.trim(); if (!crit.secteurs.includes(v)) setCrit(f=>({...f,secteurs:[...f.secteurs,v]})); (e.target as HTMLInputElement).value = ''; } }} />
                  <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>Appuyez sur Entrée pour ajouter un secteur personnalisé</div>
                </div>
              </div>
              <div><label className={styles.lbl}>Notes libres</label><textarea className={styles.inp} rows={3} value={crit.notes} onChange={e => setCrit(f=>({...f,notes:e.target.value}))} placeholder="Particularités, préférences, exclusions, quartiers à éviter..." /></div>
            </div>
            <div className={styles.modalFooter}><button className={styles.btn} onClick={() => setShowCriteres(false)}>Annuler</button><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveCriteres} disabled={saving}>{saving ? '...' : '✓ Sauvegarder'}</button></div>
          </div>
        </div>
      )}

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

      {showBien && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) { setShowBien(false); setBienForm(null); setUrl(''); setTexteAnnonce(''); setPhotosInput(''); setBienMode('url'); }}}>
          <div className={styles.modal} style={{ maxWidth: 720 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>🏠 Ajouter un bien</h2><button className={styles.modalClose} onClick={() => { setShowBien(false); setBienForm(null); setUrl(''); setTexteAnnonce(''); setPhotosInput(''); setBienMode('url'); }}>✕</button></div>
            <div className={styles.modalBody}>

              {/* Sélecteur mode */}
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
                {(['url', 'texte'] as const).map(m => (
                  <button key={m} onClick={() => { setBienMode(m); setBienForm(null); }}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: bienMode === m ? 'white' : 'transparent', color: bienMode === m ? '#1a2332' : '#64748b', fontWeight: bienMode === m ? 700 : 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', boxShadow: bienMode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}>
                    {m === 'url' ? '🔗 Par URL' : '📋 Coller le texte'}
                  </button>
                ))}
              </div>

              {/* MODE URL */}
              {bienMode === 'url' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div><label className={styles.lbl}>URL de l'annonce</label><div style={{ display: 'flex', gap: 8 }}><input className={styles.inp} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.seloger.com/annonces/..." style={{ flex: 1 }} onKeyDown={e => e.key === 'Enter' && extract()} /><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={extract} disabled={extracting||!url}>{extracting ? '⏳...' : '🔍 Extraire'}</button></div><div style={{ fontSize: 12, color: '#94a3b8', marginTop: 5 }}>SeLoger, LeBonCoin, PAP, Bien'ici, Logic-Immo, Jinka, Orpi, Century 21...</div></div>
                  {bienForm !== null && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ background: bienForm._reason === 'seloger_blocked' ? '#fffbeb' : bienForm.titre ? '#ecfdf5' : '#f8fafc', border: `1px solid ${bienForm._reason === 'seloger_blocked' ? '#fde68a' : bienForm.titre ? '#a7f3d0' : '#e2e8f0'}`, borderRadius: 10, padding: '9px 13px', fontSize: 13, color: bienForm._reason === 'seloger_blocked' ? '#92400e' : bienForm.titre ? '#065f46' : '#64748b' }}>
                        {bienForm._reason === 'seloger_blocked' ? "⚠️ SeLoger bloque l'extraction — complétez manuellement" : bienForm.titre ? '✅ Informations extraites — vérifiez et complétez' : 'ℹ️ Remplissez manuellement'}
                      </div>
                      <BienFormFields bienForm={bienForm} setBienForm={setBienForm} prixAcq={prixAcq} styles={styles} />
                    </div>
                  )}
                </div>
              )}

              {/* MODE TEXTE */}
              {bienMode === 'texte' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#1d4ed8' }}>
                    💡 <strong>Comment faire :</strong> Sur la page de l'annonce, sélectionne tout (Ctrl+A), copie (Ctrl+C), colle ici (Ctrl+V). Le système extrait automatiquement toutes les infos.
                  </div>
                  <div><label className={styles.lbl}>Lien de l'annonce <span style={{fontWeight:400,color:'#94a3b8'}}>(optionnel)</span></label><input className={styles.inp} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." /></div>
                  <div><label className={styles.lbl}>Texte copié de l'annonce</label><textarea className={styles.inp} rows={8} value={texteAnnonce} onChange={e => setTexteAnnonce(e.target.value)} placeholder="Ctrl+A sur la page → Ctrl+C → coller ici..." style={{ fontFamily: 'inherit', fontSize: 12 }} /></div>
                  <div>
                    <label className={styles.lbl}>Photos <span style={{fontWeight:400,color:'#94a3b8'}}>(clic droit sur chaque photo → "Copier l'adresse" → une URL par ligne)</span></label>
                    <textarea className={styles.inp} rows={3} value={photosInput} onChange={e => setPhotosInput(e.target.value)} placeholder="https://cdn.seloger.com/photo1.jpg" style={{ fontFamily: 'monospace', fontSize: 11 }} />
                    {photosInput && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        {photosInput.split('\n').map((u: string) => u.trim()).filter((u: string) => u.startsWith('http')).slice(0, 6).map((u: string, i: number) => (
                          <img key={i} src={u} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #e3e8f0' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ))}
                      </div>
                    )}
                  </div>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={parseTexte} disabled={extracting || texteAnnonce.trim().length < 30}>{extracting ? '⏳ Analyse en cours...' : '🤖 Analyser et remplir les champs'}</button>
                  {bienForm !== null && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '9px 13px', fontSize: 13, color: '#065f46' }}>{bienForm._method === 'claude' ? '🤖 Analysé par IA — vérifiez et ajustez' : '✅ Informations extraites — vérifiez et ajustez'}</div>
                      <BienFormFields bienForm={bienForm} setBienForm={setBienForm} prixAcq={prixAcq} styles={styles} />
                      {bienForm.photos?.length > 0 && (
                        <div><label className={styles.lbl}>Photos ({bienForm.photos.length})</label>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {bienForm.photos.map((p: string, i: number) => (
                              <div key={i} style={{ position: 'relative' }}>
                                <img src={p} alt="" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 8, border: '1px solid #e3e8f0' }} onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }} />
                                <button onClick={() => setBienForm((f: any) => ({ ...f, photos: f.photos.filter((_: string, j: number) => j !== i) }))} style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', fontSize: 10, cursor: 'pointer' }}>✕</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
            <div className={styles.modalFooter}><button className={styles.btn} onClick={() => { setShowBien(false); setBienForm(null); setUrl(''); setTexteAnnonce(''); setPhotosInput(''); setBienMode('url'); }}>Annuler</button>{bienForm !== null && <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveBien} disabled={saving}>{saving ? '...' : '✓ Ajouter ce bien'}</button>}</div>
          </div>
        </div>
      )}

      </div>

      {/* ═══ MODAL CONFIRM ÉTAPE PRÉCÉDENTE ═══ */}
      {showConfirmEtape && transaction && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowConfirmEtape(false); }}>
          <div className={styles.modal} style={{ maxWidth: 440 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>← Retour à l'étape précédente</h2>
              <button className={styles.modalClose} onClick={() => setShowConfirmEtape(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
                Voulez-vous vraiment revenir à l'étape <strong style={{ color: '#1a2332' }}>"{ETAPES_LABELS[ORDRE_ETAPES[Math.max(0, ORDRE_ETAPES.indexOf(transaction.etape_actuelle) - 1)]]}"</strong> ?
              </p>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e' }}>
                ⚠️ Les données saisies pour l'étape actuelle seront conservées mais l'étape sera marquée comme non finalisée.
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowConfirmEtape(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={doReculerEtape}>← Confirmer le retour</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL CONFIRM DELETE BIEN ═══ */}
      {showConfirmDeleteBien && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowConfirmDeleteBien(false); }}>
          <div className={styles.modal} style={{ maxWidth: 420 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle} style={{ color: '#ef4444' }}>🗑️ Supprimer ce bien</h2>
              <button className={styles.modalClose} onClick={() => setShowConfirmDeleteBien(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Cette action est irréversible. Le bien et toutes ses photos seront définitivement supprimés.</p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowConfirmDeleteBien(false)}>Annuler</button>
              <button onClick={doDeleteBien} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>🗑️ Supprimer définitivement</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL CONFIRM VISITE DOUBLON ═══ */}
      {showConfirmVisite && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowConfirmVisite(null); }}>
          <div className={styles.modal} style={{ maxWidth: 420 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>📅 Visite déjà planifiée</h2>
              <button className={styles.modalClose} onClick={() => setShowConfirmVisite(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Une visite est déjà planifiée pour ce bien. Voulez-vous la remplacer par une nouvelle ?</p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowConfirmVisite(null)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={doRemplacerVisite}>Remplacer la visite</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL ENVOI ═══ */}
      {showEnvoi && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowEnvoi(false); }}>
          <div className={styles.modal} style={{ maxWidth: 520 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>📤 Envoyer à {client.prenom}</h2>
              <button className={styles.modalClose} onClick={() => setShowEnvoi(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Que souhaitez-vous envoyer à ce client ?</p>
              {[
                { icon: '📄', label: 'Sélection de biens', sub: `${biens.length} bien${biens.length !== 1 ? 's' : ''} dans la fiche`, action: () => { setShowEnvoi(false); if (biens.length === 0) { alert("Ajoutez d'abord des biens."); return; } alert('Génération PDF en cours de développement.'); }, primary: true },
                { icon: '🤝', label: 'Présentation des services', sub: 'Plaquette Emilio Immobilier', action: () => { setShowEnvoi(false); alert('PDF Présentation — V2'); }, primary: false },
                { icon: '📋', label: 'Compte-rendu de visites', sub: `${visites.filter(v=>v.statut==='effectuee').length} visite(s) effectuée(s)`, action: () => { setShowEnvoi(false); if (!visites.filter(v=>v.statut==='effectuee').length) { alert('Aucune visite effectuée.'); return; } setTab('visites'); }, primary: false },
                { icon: '✉️', label: 'Mail libre', sub: 'Rédiger un message personnalisé', action: () => { setShowEnvoi(false); setEnvoiForm({ destinataires: (client.emails||[]).join(', '), objet: '', corps: `Bonjour ${client.prenom},\n\nCordialement,\nAlexandre ROGELET\nEmilio Immobilier`, sms: false }); setEnvoiBienId(''); setShowEnvoiBien(true); }, primary: false },
              ].map((btn, i) => (
                <button key={i} onClick={btn.action} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, border: btn.primary ? '2px solid #1a2332' : '1px solid #e3e8f0', background: btn.primary ? '#1a2332' : 'white', cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left', transition: 'all 0.15s' }}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{btn.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: btn.primary ? 'white' : '#1a2332' }}>{btn.label}</div>
                    <div style={{ fontSize: 12, color: btn.primary ? 'rgba(255,255,255,0.5)' : '#94a3b8', marginTop: 2 }}>{btn.sub}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: btn.primary ? 'rgba(255,255,255,0.4)' : '#cbd5e1', fontSize: 18 }}>›</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL FICHE BIEN ═══ */}
      {showFicheBien && editBienForm && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowFicheBien(false); }}>
          <div className={styles.modal} style={{ maxWidth: 720 }}>

            {/* Header */}
            <div className={styles.modalHeader} style={{ background: 'linear-gradient(135deg, #1a2332 0%, #243044 100%)', borderRadius: '20px 20px 0 0', borderBottom: 'none', padding: '20px 24px' }}>
              <div>
                <h2 style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 17, color: 'white', margin: 0 }}>
                  {editBienForm.type_bien || '🏠'} — {editBienForm.titre?.substring(0, 45) || 'Détail du bien'}
                </h2>
                {(editBienForm.ville || editBienForm.prix_vendeur) && (
                  <div style={{ marginTop: 4, display: 'flex', gap: 12, alignItems: 'center' }}>
                    {editBienForm.ville && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>📍 {editBienForm.ville}{editBienForm.code_postal ? ` (${editBienForm.code_postal})` : ''}</span>}
                    {editBienForm.prix_vendeur && <span style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c' }}>{parseFloat(editBienForm.prix_vendeur).toLocaleString('fr-FR')}€</span>}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => deleteBien(ficheBienId)}
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  🗑️ Supprimer
                </button>
                <button onClick={() => setShowFicheBien(false)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>

            <div className={styles.modalBody}>

              {/* ── PHOTOS ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <label className={styles.lbl} style={{ marginBottom: 0 }}>Photos ({editBienForm.photos?.length || 0})</label>
                  {editBienForm.photos?.length > 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>🖱️ Glisser-déposer pour réordonner · ✕ supprimer · 1ère = couverture</span>}
                </div>

                {editBienForm.photos?.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
                    {editBienForm.photos.map((p: string, i: number) => (
                      <div
                        key={i}
                        draggable
                        onDragStart={() => { dragIdxRef.current = i; }}
                        onDragOver={e => { e.preventDefault(); setDragOverIdx(i); }}
                        onDragLeave={() => setDragOverIdx(null)}
                        onDrop={e => {
                          e.preventDefault();
                          const from = dragIdxRef.current;
                          if (from === i || from === -1) { setDragOverIdx(null); return; }
                          const arr = [...editBienForm.photos];
                          const [removed] = arr.splice(from, 1);
                          arr.splice(i, 0, removed);
                          setEditBienForm((f: any) => ({ ...f, photos: arr }));
                          dragIdxRef.current = -1;
                          setDragOverIdx(null);
                        }}
                        onDragEnd={() => { dragIdxRef.current = -1; setDragOverIdx(null); }}
                        style={{
                          position: 'relative', borderRadius: 12, overflow: 'hidden',
                          aspectRatio: '4/3', background: '#f1f5f9', cursor: 'grab',
                          border: dragOverIdx === i ? '2px solid #c9a84c' : '2px solid transparent',
                          transform: dragOverIdx === i ? 'scale(1.03)' : 'scale(1)',
                          transition: 'transform 0.15s, border 0.15s',
                          boxShadow: dragOverIdx === i ? '0 8px 24px rgba(201,168,76,0.25)' : '0 1px 3px rgba(0,0,0,0.08)',
                        }}>
                        <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} onError={e => { (e.target as HTMLImageElement).parentElement!.style.opacity = '0.3'; }} />
                        {/* Badge couverture */}
                        {i === 0 && (
                          <span style={{ position: 'absolute', bottom: 7, left: 7, background: 'linear-gradient(135deg,#c9a84c,#e8c96a)', color: '#1a2332', fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 8, letterSpacing: 0.8, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>⭐ COUVERTURE</span>
                        )}
                        {/* Indicateur drag */}
                        <div style={{ position: 'absolute', top: 7, left: 7, background: 'rgba(0,0,0,0.4)', color: 'white', fontSize: 10, padding: '2px 6px', borderRadius: 6, opacity: 0.8 }}>⠿ {i+1}</div>
                        {/* Bouton supprimer */}
                        <button
                          onClick={e => { e.stopPropagation(); setEditBienForm((f: any) => ({ ...f, photos: f.photos.filter((_: string, j: number) => j !== i) })); }}
                          style={{ position: 'absolute', top: 5, right: 5, width: 26, height: 26, borderRadius: 8, background: 'rgba(239,68,68,0.9)', border: 'none', color: 'white', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>✕</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ background: '#f8fafc', border: '2px dashed #e3e8f0', borderRadius: 12, padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
                    <div style={{ fontWeight: 600 }}>Aucune photo</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Ajoutez des URLs ci-dessous</div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className={styles.inp}
                    value={newPhotoUrl}
                    onChange={e => setNewPhotoUrl(e.target.value)}
                    placeholder="Coller l'URL d'une photo (clic droit → Copier l'adresse de l'image)"
                    style={{ flex: 1, fontSize: 12 }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newPhotoUrl.trim().startsWith('http')) {
                        setEditBienForm((f: any) => ({ ...f, photos: [...(f.photos || []), newPhotoUrl.trim()] }));
                        setNewPhotoUrl('');
                      }
                    }}
                  />
                  <button
                    className={styles.btn}
                    onClick={() => {
                      if (newPhotoUrl.trim().startsWith('http')) {
                        setEditBienForm((f: any) => ({ ...f, photos: [...(f.photos || []), newPhotoUrl.trim()] }));
                        setNewPhotoUrl('');
                      }
                    }}>+ Ajouter</button>
                </div>
              </div>

              {/* ── INFOS BIEN ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Groupe localisation */}
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, border: '1px solid #e3e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>📍 Localisation & Identification</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className={styles.lbl}>Titre</label>
                  <input className={styles.inp} value={editBienForm.titre||''} onChange={e => setEditBienForm((f: any) => ({ ...f, titre: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>Type</label>
                  <select className={styles.inp} value={editBienForm.type_bien||'Appartement'} onChange={e => setEditBienForm((f: any) => ({ ...f, type_bien: e.target.value }))}>
                    {['Appartement','Maison','Loft','Studio','Duplex','Villa','Terrain'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={styles.lbl}>Source / Portail</label>
                  <input className={styles.inp} value={editBienForm.source_portail||''} onChange={e => setEditBienForm((f: any) => ({ ...f, source_portail: e.target.value }))} placeholder="SeLoger, LeBonCoin..." />
                </div>
                <div>
                  <label className={styles.lbl}>Ville</label>
                  <input className={styles.inp} value={editBienForm.ville||''} onChange={e => setEditBienForm((f: any) => ({ ...f, ville: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>Code postal</label>
                  <input className={styles.inp} value={editBienForm.code_postal||''} onChange={e => setEditBienForm((f: any) => ({ ...f, code_postal: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className={styles.lbl}>URL de l'annonce</label>
                  <input className={styles.inp} value={editBienForm.url||''} onChange={e => setEditBienForm((f: any) => ({ ...f, url: e.target.value }))} placeholder="https://..." />
                </div>
                </div>
              </div>

              {/* Groupe caractéristiques */}
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, border: '1px solid #e3e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>📐 Caractéristiques</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className={styles.lbl}>Surface m²</label>
                  <input className={styles.inp} type="number" value={editBienForm.surface||''} onChange={e => setEditBienForm((f: any) => ({ ...f, surface: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>Pièces</label>
                  <input className={styles.inp} type="number" value={editBienForm.nb_pieces||''} onChange={e => setEditBienForm((f: any) => ({ ...f, nb_pieces: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>Chambres</label>
                  <input className={styles.inp} type="number" value={editBienForm.nb_chambres||''} onChange={e => setEditBienForm((f: any) => ({ ...f, nb_chambres: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>Étage</label>
                  <input className={styles.inp} type="number" value={editBienForm.etage||''} onChange={e => setEditBienForm((f: any) => ({ ...f, etage: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>DPE</label>
                  <select className={styles.inp} value={editBienForm.dpe||''} onChange={e => setEditBienForm((f: any) => ({ ...f, dpe: e.target.value }))}>
                    <option value="">—</option>
                    {['A','B','C','D','E','F','G'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1a2332' }}>
                    <input type="checkbox" checked={editBienForm.parking||false} onChange={e => setEditBienForm((f: any) => ({ ...f, parking: e.target.checked }))} style={{ accentColor: '#1a2332', width: 16, height: 16 }} />
                    🅿️ Parking / Garage inclus
                  </label>
                </div>
                </div>
              </div>

              {/* Groupe prix */}
              <div style={{ background: '#fffbeb', borderRadius: 12, padding: 14, border: '1px solid #fde68a' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>💰 Prix & Commission</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className={styles.lbl}>Prix vendeur €</label>
                  <input className={styles.inp} type="number" value={editBienForm.prix_vendeur||''} onChange={e => setEditBienForm((f: any) => ({ ...f, prix_vendeur: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>Commission</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select className={styles.inp} style={{ width: 72 }} value={editBienForm.commission_type} onChange={e => setEditBienForm((f: any) => ({ ...f, commission_type: e.target.value }))}>
                      <option value="pourcentage">%</option>
                      <option value="montant">€</option>
                    </select>
                    <input className={styles.inp} type="number" value={editBienForm.commission_val||''} onChange={e => setEditBienForm((f: any) => ({ ...f, commission_val: e.target.value }))} />
                  </div>
                </div>
                {editBienForm.prix_vendeur && editBienForm.commission_val && (
                  <div style={{ gridColumn: '1/-1', background: 'white', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>Prix acquéreur estimé</span>
                    <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 18, color: '#c9a84c' }}>
                      {(editBienForm.commission_type === 'pourcentage'
                        ? Math.round((parseFloat(editBienForm.prix_vendeur)||0) * (1 + (parseFloat(editBienForm.commission_val)||0) / 100))
                        : (parseFloat(editBienForm.prix_vendeur)||0) + (parseFloat(editBienForm.commission_val)||0)
                      ).toLocaleString('fr-FR')}€
                    </span>
                  </div>
                )}
                </div>
              </div>

              {/* Groupe agence */}
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, border: '1px solid #e3e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>🏢 Agence</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className={styles.lbl}>Nom de l'agence</label>
                  <input className={styles.inp} value={editBienForm.agence_nom||''} onChange={e => setEditBienForm((f: any) => ({ ...f, agence_nom: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.lbl}>Tél. agence</label>
                  <input className={styles.inp} value={editBienForm.agence_tel||''} onChange={e => setEditBienForm((f: any) => ({ ...f, agence_tel: e.target.value }))} />
                </div>
                </div>
              </div>

              {/* Description */}
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, border: '1px solid #e3e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>📝 Description</div>
                  <button
                    onClick={reformulerDescription}
                    disabled={reformuling || !editBienForm?.description}
                    style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit', opacity: reformuling ? 0.6 : 1 }}>
                    {reformuling ? '⏳ Reformulation...' : '✨ Reformuler avec IA'}
                  </button>
                </div>
                <textarea className={styles.inp} rows={5} value={editBienForm.description||''} onChange={e => setEditBienForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="Description du bien..." style={{ background: 'white' }} />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>💡 Le bouton IA reformule en style chasseur immo professionnel (nécessite la clé Anthropic)</div>
              </div>

              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowFicheBien(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveFicheBien} disabled={saving}>
                {saving ? '⏳ Sauvegarde...' : '✓ Sauvegarder les modifications'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEnvoiBien && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowEnvoiBien(false); }}>
          <div className={styles.modal} style={{ maxWidth: 600 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>📤 Envoyer ce bien au client</h2>
              <button className={styles.modalClose} onClick={() => setShowEnvoiBien(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {/* Aperçu du bien */}
              {(() => { const b = biens.find(x => x.id === envoiBienId); return b ? (
                <div style={{ background: '#f8fafc', border: '1px solid #e3e8f0', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 10, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, overflow: 'hidden', flexShrink: 0 }}>
                    {b.photos?.[0] ? <img src={b.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🏠'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2332' }}>{b.titre || `${b.type_bien||'Bien'} — ${b.ville||'—'}`}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{[b.surface && `${b.surface}m²`, b.nb_pieces && `${b.nb_pieces}P`, b.ville].filter(Boolean).join(' · ')}</div>
                  </div>
                  {b.prix_acquereur && <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 16, color: '#c9a84c' }}>{b.prix_acquereur.toLocaleString('fr-FR')}€</div>}
                  {/* PDF simulé */}
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 10px', textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 20 }}>📄</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>PDF joint</div>
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>Fiche bien</div>
                  </div>
                </div>
              ) : null; })()}

              <div><label className={styles.lbl}>Destinataire(s) <span style={{ fontWeight: 400, color: '#94a3b8' }}>(séparés par virgule)</span></label>
                <input className={styles.inp} value={envoiForm.destinataires} onChange={e => setEnvoiForm(f => ({ ...f, destinataires: e.target.value }))} placeholder="email@client.fr" />
              </div>
              <div><label className={styles.lbl}>Objet</label>
                <input className={styles.inp} value={envoiForm.objet} onChange={e => setEnvoiForm(f => ({ ...f, objet: e.target.value }))} />
              </div>
              <div><label className={styles.lbl}>Corps du message</label>
                <textarea className={styles.inp} rows={8} value={envoiForm.corps} onChange={e => setEnvoiForm(f => ({ ...f, corps: e.target.value }))} style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', padding: '10px 14px', borderRadius: 10, border: '1px solid #e3e8f0' }}>
                <input type="checkbox" id="sms_envoi" checked={envoiForm.sms} onChange={e => setEnvoiForm(f => ({ ...f, sms: e.target.checked }))} style={{ accentColor: '#1a2332', width: 16, height: 16 }} />
                <label htmlFor="sms_envoi" style={{ fontSize: 13, fontWeight: 600, color: '#1a2332', cursor: 'pointer' }}>📱 Envoyer aussi un SMS de notification</label>
                {client.telephones?.[0] && <span style={{ fontSize: 12, color: '#94a3b8' }}>→ {client.telephones[0]}</span>}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowEnvoiBien(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveEnvoiBien} disabled={envoiSending || !envoiForm.destinataires}>{envoiSending ? '⏳ Envoi...' : '📤 Envoyer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL PLANIFIER VISITE ═══ */}
      {showPlanVisite && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowPlanVisite(false); }}>
          <div className={styles.modal} style={{ maxWidth: 500 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>📅 Planifier une visite</h2><button className={styles.modalClose} onClick={() => setShowPlanVisite(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div>
                <label className={styles.lbl}>Bien à visiter</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {biens.map(b => (
                    <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: `2px solid ${planVisteForm.bien_id === b.id ? '#1a2332' : '#e3e8f0'}`, background: planVisteForm.bien_id === b.id ? '#f8fafc' : 'white', cursor: 'pointer' }}>
                      <input type="radio" name="bien_visite" value={b.id} checked={planVisteForm.bien_id === b.id} onChange={() => setPlanVisiteForm(f => ({ ...f, bien_id: b.id }))} style={{ accentColor: '#1a2332' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2332' }}>{b.titre || `${b.type_bien||'Bien'} — ${b.ville||'—'}`}</div>
                        {b.surface && <span style={{ fontSize: 12, color: '#64748b' }}>{b.surface}m²{b.nb_pieces ? ` · ${b.nb_pieces}P` : ''}{b.ville ? ` · ${b.ville}` : ''}</span>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.formRow}>
                <div><label className={styles.lbl}>Date de la visite</label><input className={styles.inp} type="date" value={planVisteForm.date} onChange={e => setPlanVisiteForm(f => ({ ...f, date: e.target.value }))} /></div>
                <div><label className={styles.lbl}>Heure</label><input className={styles.inp} type="time" value={planVisteForm.heure} onChange={e => setPlanVisiteForm(f => ({ ...f, heure: e.target.value }))} /></div>
              </div>
              <div><label className={styles.lbl}>Contact agence / vendeur</label><input className={styles.inp} value={planVisteForm.contact} onChange={e => setPlanVisiteForm(f => ({ ...f, contact: e.target.value }))} placeholder="Nom, téléphone, email..." /></div>
              <div><label className={styles.lbl}>Notes préparatoires</label><textarea className={styles.inp} rows={2} value={planVisteForm.notes} onChange={e => setPlanVisiteForm(f => ({ ...f, notes: e.target.value }))} placeholder="Points à vérifier, documents à apporter..." /></div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowPlanVisite(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={savePlanVisite} disabled={!planVisteForm.bien_id}>📅 Confirmer la visite</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL COMPTE-RENDU VISITE ═══ */}
      {showCompteRendu && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowCompteRendu(false); }}>
          <div className={styles.modal} style={{ maxWidth: 520 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>✅ Compte-rendu de visite</h2><button className={styles.modalClose} onClick={() => setShowCompteRendu(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div>
                <label className={styles.lbl}>Note globale</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setCrForm(f => ({ ...f, etoiles: f.etoiles === n ? 0 : n }))}
                      style={{ width: 44, height: 44, borderRadius: 12, border: `2px solid ${crForm.etoiles >= n ? '#c9a84c' : '#e2e8f0'}`, background: crForm.etoiles >= n ? '#fef9c3' : 'white', fontSize: 22, cursor: 'pointer', transition: 'all 0.12s' }}>
                      ⭐
                    </button>
                  ))}
                  {crForm.etoiles > 0 && <span style={{ alignSelf: 'center', fontSize: 13, color: '#64748b', fontWeight: 600 }}>{crForm.etoiles}/5</span>}
                </div>
              </div>
              <div>
                <label className={styles.lbl}>Avis du client sur ce bien</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[{v:'tres_interesse', l:'🔥 Très intéressé'}, {v:'interesse', l:'👍 Intéressé'}, {v:'a_voir', l:'🤔 À revoir'}, {v:'pas_interesse', l:'👎 Pas intéressé'}, {v:'elimine', l:'❌ Éliminé'}].map(o => (
                    <button key={o.v} onClick={() => setCrForm(f => ({ ...f, avis_client: f.avis_client === o.v ? '' : o.v }))}
                      style={{ padding: '8px 10px', borderRadius: 10, border: `1px solid ${crForm.avis_client === o.v ? '#1a2332' : '#e2e8f0'}`, background: crForm.avis_client === o.v ? '#1a2332' : 'white', color: crForm.avis_client === o.v ? 'white' : '#64748b', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>{o.l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className={styles.lbl}>Commentaires / Observations</label>
                <textarea className={styles.inp} rows={4} value={crForm.commentaire} onChange={e => setCrForm(f => ({ ...f, commentaire: e.target.value }))} placeholder="Points positifs, négatifs, questions posées, éléments à vérifier..." />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowCompteRendu(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveCompteRendu}>✅ Valider le compte-rendu</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL OFFRE ÉCRITE ═══ */}
      {showOffreEcrite && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowOffreEcrite(false); }}>
          <div className={styles.modal} style={{ maxWidth: 580 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>✍️ Créer une offre écrite</h2>
              <button className={styles.modalClose} onClick={() => setShowOffreEcrite(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 4 }}>
                ✍️ Cette action va passer le statut client en "Offre écrite" et créer / mettre à jour la transaction.
              </div>
              <div>
                <label className={styles.lbl}>Bien concerné par l'offre</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {biens.map(b => (
                    <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: `2px solid ${offreForm.bien_id === b.id ? '#1a2332' : '#e3e8f0'}`, background: offreForm.bien_id === b.id ? '#f8fafc' : 'white', cursor: 'pointer' }}>
                      <input type="radio" name="bien_offre" value={b.id} checked={offreForm.bien_id === b.id} onChange={() => setOffreForm(f => ({ ...f, bien_id: b.id }))} style={{ accentColor: '#1a2332' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2332' }}>{b.titre || `${b.type_bien||'Bien'} — ${b.ville||'—'}`}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{b.prix_acquereur ? `Prix acquéreur : ${b.prix_acquereur.toLocaleString('fr-FR')}€` : ''}{b.surface ? ` · ${b.surface}m²` : ''}{b.ville ? ` · ${b.ville}` : ''}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.formRow}>
                <div><label className={styles.lbl}>Montant de l'offre €</label><input className={styles.inp} type="number" value={offreForm.montant} onChange={e => setOffreForm(f => ({ ...f, montant: e.target.value }))} placeholder="Ex : 345 000" /></div>
                <div><label className={styles.lbl}>Date de l'offre</label><input className={styles.inp} type="date" value={offreForm.date} onChange={e => setOffreForm(f => ({ ...f, date: e.target.value }))} /></div>
              </div>
              <div><label className={styles.lbl}>Notes / Conditions particulières</label><textarea className={styles.inp} rows={3} value={offreForm.notes} onChange={e => setOffreForm(f => ({ ...f, notes: e.target.value }))} placeholder="Conditions suspensives, délai de réponse attendu..." /></div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btn} onClick={() => setShowOffreEcrite(false)}>Annuler</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveOffreEcrite} disabled={saving || !offreForm.bien_id || !offreForm.montant}>{saving ? '...' : '✍️ Créer l\'offre écrite'}</button>
            </div>
          </div>
        </div>
      )}

      {showAction && (
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: 500 }}>
            <div className={styles.modalHeader}><h2 className={styles.modalTitle}>+ Ajouter une action</h2><button className={styles.modalClose} onClick={() => setShowAction(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div>
                <label className={styles.lbl}>Type d'action</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[{v:'appel',l:'📞 Appel passé'},{v:'rdv',l:'🤝 RDV physique'},{v:'note',l:'📝 Note libre'},{v:'relance_manuelle',l:'🔔 Relance manuelle'},{v:'envoi_externe',l:'📤 Envoi externe'},{v:'email_libre',l:'✉️ Email envoyé'}].map(o => (<button key={o.v} onClick={() => setActionF(f => ({ ...f, type: o.v, titre: f.titre || o.l.split(' ').slice(1).join(' ') }))} style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${actionF.type === o.v ? '#1a2332' : '#e2e8f0'}`, background: actionF.type === o.v ? '#1a2332' : 'white', color: actionF.type === o.v ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.12s' }}>{o.l}</button>))}
                </div>
              </div>
              <div><label className={styles.lbl}>Titre <span style={{fontWeight:400,color:'#94a3b8'}}>(optionnel)</span></label><input className={styles.inp} value={actionF.titre} onChange={e => setActionF(f => ({ ...f, titre: e.target.value }))} placeholder="Ex: Appel de suivi, RDV agence..." /></div>
              <div><label className={styles.lbl}>Notes / Détails</label><textarea className={styles.inp} rows={4} value={actionF.description} onChange={e => setActionF(f => ({ ...f, description: e.target.value }))} placeholder="Ce dont on a discuté, ce qui a été convenu..." /></div>
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
