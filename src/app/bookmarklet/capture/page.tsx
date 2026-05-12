'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase, addJournal } from '@/lib/supabase';
import type { Client } from '@/lib/supabase';

export default function CapturePage() {
  const [step, setStep] = useState<'waiting' | 'extracting' | 'choose' | 'saving' | 'done' | 'error'>('waiting');
  const [error, setError] = useState('');
  const [bien, setBien] = useState<any>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [commission, setCommission] = useState({ type: 'pourcentage', val: '' });

  // Charger les clients
  useEffect(() => {
    supabase
      .from('clients')
      .select('*')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setClients(data as Client[]);
          setFilteredClients(data as Client[]);
        }
      });
  }, []);

  // Filtrer les clients selon la recherche
  useEffect(() => {
    if (!search) {
      setFilteredClients(clients);
      return;
    }
    const q = search.toLowerCase();
    setFilteredClients(
      clients.filter(
        (c) =>
          `${c.prenom} ${c.nom}`.toLowerCase().includes(q) ||
          c.reference?.toLowerCase().includes(q) ||
          c.emails?.some((e) => e.toLowerCase().includes(q))
      )
    );
  }, [search, clients]);

  // Recevoir le HTML du bookmarklet via postMessage
  const handleMessage = useCallback(async (event: MessageEvent) => {
    if (event.data?.type !== 'EMILIO_HTML') return;
    if (event.origin !== window.location.origin) return;

    setStep('extracting');
    try {
      const res = await fetch('/api/bien-from-bookmarklet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: event.data.html,
          url: event.data.url,
          title: event.data.title,
        }),
      });
      const data = await res.json();
      if (data.bien) {
        setBien(data.bien);
        setStep('choose');
      } else {
        setError(data.error || 'Extraction échouée');
        setStep('error');
      }
    } catch (e: any) {
      setError(e.message || 'Erreur réseau');
      setStep('error');
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Calcul prix acquéreur
  const prixAcq = bien
    ? commission.type === 'pourcentage'
      ? Math.round((parseFloat(bien.prix_vendeur) || 0) * (1 + (parseFloat(commission.val) || 0) / 100))
      : (parseFloat(bien.prix_vendeur) || 0) + (parseFloat(commission.val) || 0)
    : 0;

  async function saveBien() {
    if (!selectedClient || !bien) return;
    setStep('saving');

    // Vérifier doublon URL
    if (bien.url) {
      const { data: ex } = await supabase
        .from('biens')
        .select('id')
        .eq('client_id', selectedClient.id)
        .eq('url', bien.url)
        .maybeSingle();
      if (ex) {
        setError('Ce bien (même URL) est déjà dans la fiche de ce client.');
        setStep('error');
        return;
      }
    }

    const { data: bienInsere, error: insertErr } = await supabase
      .from('biens')
      .insert({
        client_id: selectedClient.id,
        url: bien.url || null,
        titre: bien.titre,
        ville: bien.ville,
        code_postal: bien.code_postal,
        type_bien: bien.type_bien,
        surface: parseFloat(bien.surface) || null,
        nb_pieces: parseInt(bien.nb_pieces) || null,
        nb_chambres: parseInt(bien.nb_chambres) || null,
        etage: parseInt(bien.etage) || null,
        parking: bien.parking || false,
        dpe: bien.dpe,
        description: bien.description,
        prix_vendeur: parseFloat(bien.prix_vendeur) || null,
        commission_type: commission.type,
        commission_val: parseFloat(commission.val) || null,
        prix_acquereur: prixAcq || null,
        photos: bien.photos || [],
        source_portail: bien.source_portail,
        agence_nom: bien.agence_nom,
        badge_retour: 'propose',
      })
      .select()
      .single();

    if (insertErr || !bienInsere) {
      setError('Erreur enregistrement : ' + (insertErr?.message || 'inconnue'));
      setStep('error');
      return;
    }

    await addJournal(
      selectedClient.id,
      'bien_ajoute',
      `🏠 Bien ajouté — ${bien.titre || bien.ville || ''}`,
      bien.url || ''
    );

    setStep('done');
  }

  // ─── RENDER ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: 24, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 22, color: '#1a2332', marginBottom: 18 }}>
          📥 Capture en cours
        </h1>

        {step === 'waiting' && (
          <Card>
            <Spinner />
            <div style={{ marginTop: 14, color: '#64748b' }}>En attente du contenu de la page...</div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
              Si rien ne se passe après 5 secondes, ferme cette fenêtre et clique à nouveau sur le favori.
            </div>
          </Card>
        )}

        {step === 'extracting' && (
          <Card>
            <Spinner />
            <div style={{ marginTop: 14, color: '#64748b' }}>Extraction des informations du bien...</div>
          </Card>
        )}

        {step === 'choose' && bien && (
          <>
            {/* Aperçu du bien extrait */}
            <Card>
              <div style={{ display: 'flex', gap: 14 }}>
                {bien.photos?.[0] && (
                  <img
                    src={bien.photos[0]}
                    alt=""
                    style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 16, color: '#1a2332', marginBottom: 6 }}>
                    {bien.titre || 'Bien sans titre'}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
                    {[bien.surface && `${bien.surface}m²`, bien.nb_pieces && `${bien.nb_pieces}P`, bien.etage && `${bien.etage}e`, bien.dpe && `DPE ${bien.dpe}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
                    📍 {bien.ville} {bien.code_postal}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#c9a84c' }}>
                    {bien.prix_vendeur ? `${parseInt(bien.prix_vendeur).toLocaleString('fr-FR')} €` : '— €'}
                  </div>
                </div>
              </div>
            </Card>

            {/* Commission */}
            <Card>
              <Label>Commission acquéreur</Label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={commission.type}
                  onChange={(e) => setCommission({ ...commission, type: e.target.value })}
                  style={{ ...inpStyle, width: 80 }}
                >
                  <option value="pourcentage">%</option>
                  <option value="montant">€</option>
                </select>
                <input
                  type="number"
                  value={commission.val}
                  onChange={(e) => setCommission({ ...commission, val: e.target.value })}
                  style={inpStyle}
                  placeholder="Ex: 4"
                />
                {prixAcq > 0 && (
                  <div style={{ ...inpStyle, background: '#fef9c3', color: '#854d0e', fontWeight: 700, minWidth: 120, display: 'flex', alignItems: 'center' }}>
                    {prixAcq.toLocaleString('fr-FR')}€
                  </div>
                )}
              </div>
            </Card>

            {/* Sélection client */}
            <Card>
              <Label>Choisir le client</Label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Rechercher par nom, référence ou email..."
                style={inpStyle}
                autoFocus
              />
              <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: 10, border: '1px solid #e3e8f0', borderRadius: 10 }}>
                {filteredClients.length === 0 && (
                  <div style={{ padding: 16, color: '#94a3b8', textAlign: 'center', fontSize: 14 }}>Aucun client trouvé</div>
                )}
                {filteredClients.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClient(c)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      padding: 12,
                      border: 'none',
                      borderBottom: '1px solid #f1f5f9',
                      background: selectedClient?.id === c.id ? '#fef9c3' : 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: '#1a2332',
                        color: '#c9a84c',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: 14,
                        flexShrink: 0,
                      }}
                    >
                      {c.prenom?.[0]}
                      {c.nom?.[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#1a2332', fontSize: 14 }}>
                        {c.prenom} {c.nom}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.reference}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            {/* Bouton valider */}
            <button
              onClick={saveBien}
              disabled={!selectedClient}
              style={{
                width: '100%',
                padding: 14,
                background: selectedClient ? '#1a2332' : '#cbd5e1',
                color: selectedClient ? '#c9a84c' : 'white',
                border: 'none',
                borderRadius: 12,
                fontWeight: 800,
                fontSize: 15,
                cursor: selectedClient ? 'pointer' : 'not-allowed',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                marginTop: 8,
              }}
            >
              ✅ Ajouter à {selectedClient ? `${selectedClient.prenom} ${selectedClient.nom}` : 'la fiche...'}
            </button>
          </>
        )}

        {step === 'saving' && (
          <Card>
            <Spinner />
            <div style={{ marginTop: 14, color: '#64748b' }}>Enregistrement...</div>
          </Card>
        )}

        {step === 'done' && (
          <Card>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 18, color: '#1a2332', marginBottom: 8 }}>
              Bien ajouté à la fiche de {selectedClient?.prenom} {selectedClient?.nom}
            </div>
            <div style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>Tu peux fermer cette fenêtre.</div>
            <button
              onClick={() => window.close()}
              style={{
                padding: '10px 24px',
                background: '#1a2332',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Fermer
            </button>
          </Card>
        )}

        {step === 'error' && (
          <Card>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 18, color: '#1a2332', marginBottom: 8 }}>
              Erreur
            </div>
            <div style={{ color: '#dc2626', fontSize: 14, marginBottom: 20 }}>{error}</div>
            <button
              onClick={() => window.close()}
              style={{
                padding: '10px 24px',
                background: '#1a2332',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Fermer
            </button>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── COMPOSANTS UTILITAIRES ─────────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'white',
        borderRadius: 14,
        border: '1px solid #e3e8f0',
        padding: 20,
        marginBottom: 14,
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
        textAlign: 'left',
      }}
    >
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        margin: '0 auto',
        border: '3px solid #e3e8f0',
        borderTopColor: '#c9a84c',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const inpStyle: React.CSSProperties = {
  width: '100%',
  background: '#f8fafc',
  border: '1.5px solid #e3e8f0',
  borderRadius: 9,
  padding: '9px 12px',
  fontSize: 13,
  color: '#1a2332',
  fontFamily: "'DM Sans', sans-serif",
  outline: 'none',
};
