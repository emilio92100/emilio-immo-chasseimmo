'use client';

import { useState } from 'react';
import { QUARTIERS, searchCommune, type CpSuggestion } from '@/lib/secteurs';

// Sélecteur de secteurs réutilisable : autocomplétion ville/CP + quartiers prédéfinis + saisie libre.
// `secteurs` = tableau de labels, `onChange` reçoit le nouveau tableau.
export default function SecteurPicker({
  secteurs,
  onChange,
}: {
  secteurs: string[];
  onChange: (next: string[]) => void;
}) {
  const [cpQ, setCpQ] = useState('');
  const [cpSug, setCpSug] = useState<CpSuggestion[]>([]);
  const [villeActive, setVilleActive] = useState<{ cp: string; ville: string } | null>(null);

  async function handleSearch(q: string) {
    setCpQ(q);
    setCpSug(await searchCommune(q));
  }

  function add(cp: string, ville: string, quartier?: string) {
    const label = quartier ? `${quartier} (${ville})` : ville;
    if (!secteurs.includes(label)) onChange([...secteurs, label]);
    setCpQ('');
    setCpSug([]);
  }

  function remove(label: string) {
    onChange(secteurs.filter((x) => x !== label));
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <input
          value={cpQ}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Tapez un code postal ou une ville (ex: 92100, Neuilly...)"
          style={inpStyle}
        />
        {cpSug.length > 0 && (
          <div style={sugBox}>
            {cpSug.map((s, i) => (
              <div
                key={i}
                onClick={() => { setVilleActive({ cp: s.cp, ville: QUARTIERS[s.cp]?.ville || s.ville }); setCpSug([]); setCpQ(''); }}
                style={sugItem}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
              >
                <strong>{s.cp}</strong> — {s.ville}
                {QUARTIERS[s.cp] ? ' 📍 quartiers disponibles' : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      {villeActive && (
        <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, marginTop: 8, border: '1px solid #e3e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a2332' }}>📍 {villeActive.ville} ({villeActive.cp})</div>
            <button type="button" onClick={() => setVilleActive(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>Fermer ✕</button>
          </div>
          <div style={{ fontSize: 12.5, color: '#3730a3', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '7px 11px', marginBottom: 10 }}>
            👆 Cliquez sur <strong>« Toute la ville »</strong> ou sur un ou plusieurs <strong>quartiers</strong> pour les ajouter à la recherche.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            <button type="button" onClick={() => add(villeActive.cp, villeActive.ville)} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 20, border: '1px solid #1a2332', background: '#1a2332', color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>✓ Toute la ville</button>
            {QUARTIERS[villeActive.cp]?.quartiers.map((q) => {
              const label = `${q} (${villeActive.ville})`;
              const already = secteurs.includes(label);
              return (
                <button
                  type="button"
                  key={q}
                  onClick={() => (already ? remove(label) : add(villeActive.cp, villeActive.ville, q))}
                  style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20, border: `1px solid ${already ? '#10b981' : '#e2e8f0'}`, background: already ? '#ecfdf5' : 'white', color: already ? '#10b981' : '#64748b', cursor: 'pointer', fontFamily: 'inherit', fontWeight: already ? 600 : 400, transition: 'all 0.12s' }}
                >
                  {already ? '✓ ' : ''}{q}
                </button>
              );
            })}
            {!QUARTIERS[villeActive.cp] && <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Aucun quartier prédéfini — la ville entière sera ajoutée</div>}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>💡 Sélectionnez plusieurs quartiers puis cherchez une autre ville</div>
        </div>
      )}

      {secteurs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {secteurs.map((s) => (
            <span key={s} style={tag}>
              {s} <span onClick={() => remove(s)} style={{ cursor: 'pointer', marginLeft: 5, opacity: 0.6 }}>✕</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <input
          placeholder="Ou saisir un secteur libre (ex: Triangle d'Or, Proche RER...)"
          onKeyDown={(e) => {
            const v = (e.target as HTMLInputElement).value.trim();
            if (e.key === 'Enter' && v) {
              e.preventDefault();
              if (!secteurs.includes(v)) onChange([...secteurs, v]);
              (e.target as HTMLInputElement).value = '';
            }
          }}
          style={inpStyle}
        />
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Appuyez sur Entrée pour ajouter un secteur personnalisé</div>
      </div>
    </div>
  );
}

const inpStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e3e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
const sugBox: React.CSSProperties = { position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e3e8f0', borderRadius: 10, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 30, overflow: 'hidden' };
const sugItem: React.CSSProperties = { padding: '10px 12px', cursor: 'pointer', fontSize: 14, color: '#1a2332', borderBottom: '1px solid #f1f5f9' };
const tag: React.CSSProperties = { background: '#eef2ff', color: '#3730a3', border: '1px solid #c7d2fe', padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600 };
