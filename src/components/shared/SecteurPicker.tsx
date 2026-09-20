'use client';

import { useState } from 'react';
import { QUARTIERS, searchCommune, type CpSuggestion } from '@/lib/secteurs';

/* Sélecteur de secteurs.

   Le format enregistré ne change pas : un tableau de libellés, soit
   « Quartier (Ville) », soit « Ville » seule quand on prend toute la commune.
   Ce qui change ici, c'est l'affichage : au lieu d'une pluie d'étiquettes avec
   des parenthèses, une commune = un bloc, avec ses quartiers dessous. */

type Bloc = { ville: string; cp: string; quartiers: string[]; toute: boolean };

/* Retrouver le code postal d'une ville déjà choisie, pour proposer ses quartiers connus. */
const CP_PAR_VILLE: Record<string, string> = {};
Object.entries(QUARTIERS).forEach(([cp, v]) => { CP_PAR_VILLE[v.ville.toLowerCase()] = cp; });

export default function SecteurPicker({
  secteurs,
  onChange,
}: {
  secteurs: string[];
  onChange: (next: string[]) => void;
}) {
  const [cpQ, setCpQ] = useState('');
  const [cpSug, setCpSug] = useState<CpSuggestion[]>([]);
  const [ouvert, setOuvert] = useState<string | null>(null);   // ville dont le tiroir « quartiers » est ouvert
  const [saisieQ, setSaisieQ] = useState('');
  const [libre, setLibre] = useState('');

  /* ─── Regroupement des libellés en blocs par commune ─── */
  const blocs: Bloc[] = [];
  const autres: string[] = [];
  const index: Record<string, Bloc> = {};
  secteurs.forEach((s) => {
    const m = s.match(/^(.+?)\s*\((.+?)\)$/);
    const ville = m ? m[2].trim() : s.trim();
    const quartier = m ? m[1].trim() : null;
    if (!index[ville]) {
      index[ville] = { ville, cp: CP_PAR_VILLE[ville.toLowerCase()] || '', quartiers: [], toute: false };
      blocs.push(index[ville]);
    }
    if (quartier) index[ville].quartiers.push(quartier);
    else index[ville].toute = true;
  });
  /* Les entrées seules, sans quartier ET sans commune reconnue, sont des secteurs libres. */
  for (let i = blocs.length - 1; i >= 0; i--) {
    const b = blocs[i];
    if (b.toute && b.quartiers.length === 0 && !b.cp) { autres.push(b.ville); blocs.splice(i, 1); }
  }

  async function chercher(q: string) {
    setCpQ(q);
    setCpSug(q.trim().length >= 2 ? await searchCommune(q) : []);
  }

  const maj = (next: string[]) => onChange(next);

  function ajouterVille(ville: string) {
    if (secteurs.some((s) => s === ville || s.endsWith(`(${ville})`))) { setOuvert(ville); return; }
    maj([...secteurs, ville]);
    setOuvert(ville);
  }

  function ajouterQuartier(ville: string, q: string) {
    const label = `${q} (${ville})`;
    if (secteurs.includes(label)) return;
    /* Choisir un quartier précise la recherche : « toute la ville » n'a plus lieu d'être. */
    maj([...secteurs.filter((s) => s !== ville), label]);
  }

  function retirerQuartier(ville: string, q: string) {
    const reste = secteurs.filter((s) => s !== `${q} (${ville})`);
    /* Dernier quartier retiré : on repasse la commune en « toute la ville » plutôt que de la faire disparaître. */
    const encore = reste.some((s) => s === ville || s.endsWith(`(${ville})`));
    maj(encore ? reste : [...reste, ville]);
  }

  function basculerToute(b: Bloc) {
    if (b.toute) return;                                   // déjà toute la ville
    maj([...secteurs.filter((s) => !s.endsWith(`(${b.ville})`)), b.ville]);
  }

  function retirerVille(ville: string) {
    maj(secteurs.filter((s) => s !== ville && !s.endsWith(`(${ville})`)));
    if (ouvert === ville) setOuvert(null);
  }

  return (
    <div>
      {/* ─── Recherche d'une commune ─── */}
      <div style={{ position: 'relative' }}>
        <input
          value={cpQ}
          onChange={(e) => chercher(e.target.value)}
          placeholder="Ajouter une ville ou un code postal…"
          style={inp}
        />
        {cpSug.length > 0 && (
          <div style={sugBox}>
            {cpSug.map((s, i) => (
              <div
                key={i}
                onClick={() => { ajouterVille(QUARTIERS[s.cp]?.ville || s.ville); setCpSug([]); setCpQ(''); setSaisieQ(''); }}
                style={sugItem}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
              >
                <strong>{s.cp}</strong> — {s.ville}
                {QUARTIERS[s.cp] ? <span style={{ color: '#94a3b8', fontSize: 12 }}> · quartiers disponibles</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Un bloc par commune ─── */}
      {blocs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {blocs.map((b) => {
            const connus = (b.cp && QUARTIERS[b.cp]?.quartiers) || [];
            const restants = connus.filter((q) => !b.quartiers.includes(q));
            const tiroir = ouvert === b.ville;
            return (
              <div key={b.ville} style={carte}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15 }}>📍</span>
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: '#1a2332' }}>{b.ville}</span>
                  {b.cp ? <span style={{ fontSize: 11.5, fontWeight: 700, color: '#94a3b8' }}>{b.cp}</span> : null}
                  <button type="button" onClick={() => retirerVille(b.ville)} title={`Retirer ${b.ville}`} style={croix}>✕</button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9, alignItems: 'center' }}>
                  <button type="button" onClick={() => basculerToute(b)} style={b.toute ? pilulePleine : piluleVide}>
                    {b.toute ? '✓ ' : ''}Toute la ville
                  </button>
                  {b.quartiers.map((q) => (
                    <span key={q} style={puceQuartier}>
                      {q}
                      <button type="button" onClick={() => retirerQuartier(b.ville, q)} title="Retirer ce quartier" style={croixPuce}>✕</button>
                    </span>
                  ))}
                  <button type="button" onClick={() => { setOuvert(tiroir ? null : b.ville); setSaisieQ(''); }} style={piluleAjout}>
                    {tiroir ? '− Fermer' : '+ Quartier'}
                  </button>
                </div>

                {tiroir && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #dbe2ec' }}>
                    {restants.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {restants.map((q) => (
                          <button type="button" key={q} onClick={() => ajouterQuartier(b.ville, q)} style={piluleVide}>+ {q}</button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                        {connus.length ? 'Tous les quartiers connus sont déjà dans la liste.' : 'Aucun quartier pré-enregistré pour cette commune — saisissez-le vous-même.'}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={saisieQ}
                        onChange={(e) => setSaisieQ(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && saisieQ.trim()) { e.preventDefault(); ajouterQuartier(b.ville, saisieQ.trim()); setSaisieQ(''); } }}
                        placeholder={`Autre quartier de ${b.ville}…`}
                        style={{ ...inp, flex: 1, padding: '8px 11px', fontSize: 13 }}
                      />
                      <button type="button" onClick={() => { if (saisieQ.trim()) { ajouterQuartier(b.ville, saisieQ.trim()); setSaisieQ(''); } }} style={boutonAjout}>Ajouter</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Secteurs libres, qui ne correspondent à aucune commune ─── */}
      {autres.length > 0 && (
        <div style={{ ...carte, marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Secteurs libres</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {autres.map((s) => (
              <span key={s} style={puceQuartier}>
                {s}
                <button type="button" onClick={() => maj(secteurs.filter((x) => x !== s))} title="Retirer" style={croixPuce}>✕</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ─── Saisie libre ─── */}
      <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
        <input
          value={libre}
          onChange={(e) => setLibre(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && libre.trim()) { e.preventDefault(); if (!secteurs.includes(libre.trim())) maj([...secteurs, libre.trim()]); setLibre(''); } }}
          placeholder="Secteur libre, sans commune (ex : Triangle d'Or, proche RER…)"
          style={{ ...inp, flex: 1 }}
        />
        <button type="button" onClick={() => { const v = libre.trim(); if (v && !secteurs.includes(v)) maj([...secteurs, v]); setLibre(''); }} style={boutonAjout}>Ajouter</button>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e3e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
const sugBox: React.CSSProperties = { position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e3e8f0', borderRadius: 10, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 30, overflow: 'hidden' };
const sugItem: React.CSSProperties = { padding: '10px 12px', cursor: 'pointer', fontSize: 14, color: '#1a2332', borderBottom: '1px solid #f1f5f9' };
const carte: React.CSSProperties = { background: '#f8fafc', border: '1px solid #e3e8f0', borderRadius: 13, padding: '12px 14px' };
const croix: React.CSSProperties = { marginLeft: 'auto', background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', padding: 2 };
const piluleVide: React.CSSProperties = { fontSize: 12.5, padding: '6px 12px', borderRadius: 20, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 };
const pilulePleine: React.CSSProperties = { ...piluleVide, border: '1px solid #1a2332', background: '#1a2332', color: 'white' };
const piluleAjout: React.CSSProperties = { ...piluleVide, borderStyle: 'dashed', color: '#3b82f6', borderColor: '#bfdbfe' };
const puceQuartier: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a', padding: '5px 8px 5px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 700 };
const croixPuce: React.CSSProperties = { background: 'none', border: 'none', color: '#a98a2e', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', padding: 0, lineHeight: 1 };
const boutonAjout: React.CSSProperties = { fontSize: 13, padding: '0 16px', borderRadius: 10, border: 'none', background: '#1a2332', color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, whiteSpace: 'nowrap' };
