'use client';

import { useEffect, useRef, useState } from 'react';
import { chercherArret, type Arret } from '@/lib/arrets';
import { ligneDe } from '@/lib/lignes';

/* Pastille d'une ligne — couleurs officielles IDFM, gris neutre pour les bus. */
export function PastilleArret({ id, t = 24 }: { id: string; t?: number }) {
  const g = ligneDe(id);
  const bus = id.startsWith('Bus ');
  const court = g ? g.court : id.replace(/^Bus /, '');
  const rond = g ? (g.mode === 'metro' || g.mode === 'rer') : false;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
      background: g ? g.couleur : (bus ? '#eef1f6' : '#e3e8f0'),
      color: g ? g.texte : '#5a6a80',
      border: g ? 'none' : '1px solid #d8dfe9',
      width: rond ? t : undefined, height: t, minWidth: t,
      borderRadius: rond ? '50%' : Math.round(t / 3),
      fontWeight: 800, lineHeight: 1, fontFamily: 'inherit',
      fontSize: Math.round(t * (court.length > 3 ? 0.34 : court.length > 2 ? 0.38 : 0.46)),
      padding: rond ? 0 : `0 ${Math.round(t / 3.6)}px`,
    }}>{court}</span>
  );
}

/**
 * Cherche un arrêt par son nom, l'ajoute à la liste, et permet de régler
 * pour chacun le temps à pied maximum accepté.
 */
export default function ArretPicker({
  arrets, onChange, minutesDefaut = 10,
}: {
  arrets: Arret[];
  onChange: (v: Arret[]) => void;
  minutesDefaut?: number;
}) {
  const [q, setQ] = useState('');
  const [sug, setSug] = useState<Arret[]>([]);
  const [cherche, setCherche] = useState(false);
  const abort = useRef<AbortController | null>(null);

  /* Tout se joue dans le minuteur : on ne touche pas à l'état pendant l'effet. */
  useEffect(() => {
    const t = q.trim();
    const minuteur = setTimeout(async () => {
      if (t.length < 3) { setSug([]); setCherche(false); return; }
      setCherche(true);
      abort.current?.abort();
      const a = new AbortController();
      abort.current = a;
      setSug(await chercherArret(t, a.signal));
      setCherche(false);
    }, 280);
    return () => clearTimeout(minuteur);
  }, [q]);

  // les arrêts déjà retenus ne sont pas reproposés
  const propositions = sug.filter(x => !arrets.some(y => y.nom === x.nom && y.ville === x.ville));

  const ajouter = (a: Arret) => {
    onChange([...arrets, { ...a, minutes: minutesDefaut }].slice(0, 8));
    setQ(''); setSug([]);
  };
  const retirer = (i: number) => onChange(arrets.filter((_, n) => n !== i));
  const minutes = (i: number, d: number) => onChange(arrets.map((a, n) =>
    n === i ? { ...a, minutes: Math.max(1, Math.min(60, (a.minutes || minutesDefaut) + d)) } : a));

  return (
    <div>
      {arrets.map((a, i) => (
        <div key={a.nom + a.ville + i} style={C.carte}>
          <div style={C.tete}>
            <div style={{ minWidth: 0 }}>
              <div style={C.nom}>{a.nom}</div>
              {a.ville ? <div style={C.ville}>{a.ville}</div> : null}
            </div>
            <button type="button" onClick={() => retirer(i)} style={C.croix} aria-label={`Retirer ${a.nom}`}>✕</button>
          </div>
          <div style={C.lignes}>{a.lignes.map(l => <PastilleArret key={l} id={l} t={24} />)}</div>
          <div style={C.pied}>
            <span style={C.pas}>À moins de</span>
            <button type="button" onClick={() => minutes(i, -1)} style={C.rond} aria-label="Moins une minute">−</button>
            <span style={C.val}>{a.minutes || minutesDefaut} min</span>
            <button type="button" onClick={() => minutes(i, 1)} style={C.rond} aria-label="Plus une minute">+</button>
            <span style={C.pas}>à pied</span>
          </div>
        </div>
      ))}

      <div style={{ position: 'relative' }}>
        <input value={q} onChange={e => setQ(e.target.value)} style={C.champ}
          placeholder="Cherchez un arrêt — ex : Marcel Sembat, Porte de Saint-Cloud…" />
        {(propositions.length > 0 || cherche) && (
          <div style={C.liste}>
            {cherche && propositions.length === 0 && <div style={C.vide}>Recherche…</div>}
            {propositions.map((a, i) => (
              <button type="button" key={a.nom + a.ville + i} onClick={() => ajouter(a)} style={C.item}>
                <span style={{ minWidth: 0, textAlign: 'left' }}>
                  <span style={C.itemNom}>{a.nom}</span>
                  {a.ville ? <span style={C.itemVille}>{a.ville}</span> : null}
                </span>
                <span style={C.itemLignes}>{a.lignes.slice(0, 5).map(l => <PastilleArret key={l} id={l} t={21} />)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={C.aide}>Tapez au moins trois lettres. Métro, RER, tramway, train et bus.</div>
    </div>
  );
}

const C: Record<string, React.CSSProperties> = {
  carte: { background: '#f8fafc', border: '1px solid #e3e8f0', borderRadius: 14, padding: 13, marginBottom: 9 },
  tete: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  nom: { fontSize: 14.5, fontWeight: 800, color: '#1a2332', lineHeight: 1.25 },
  ville: { fontSize: 11.5, color: '#94a3b8', fontWeight: 600, marginTop: 2 },
  croix: { flex: '0 0 auto', width: 26, height: 26, borderRadius: '50%', border: '1px solid #e3e8f0', background: '#fff', color: '#94a3b8', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' },
  lignes: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 },
  pied: { display: 'flex', alignItems: 'center', gap: 7, marginTop: 11, flexWrap: 'wrap' },
  pas: { fontSize: 12.5, color: '#64748b', fontWeight: 600 },
  rond: { width: 26, height: 26, borderRadius: '50%', border: '1px solid #e3e8f0', background: '#fff', color: '#1a2332', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 },
  val: { fontSize: 13.5, fontWeight: 800, color: '#1a2332', minWidth: 52, textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
  champ: { width: '100%', background: '#fff', border: '1.5px solid #e3e8f0', borderRadius: 11, padding: '11px 13px', fontSize: 13.5, color: '#1a2332', fontFamily: 'inherit', outline: 'none' },
  liste: { position: 'absolute', left: 0, right: 0, top: 'calc(100% + 5px)', zIndex: 60, background: '#fff', border: '1px solid #e3e8f0', borderRadius: 13, boxShadow: '0 12px 30px rgba(16,24,40,.14)', overflow: 'hidden' },
  item: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', padding: '10px 13px', background: 'none', border: 0, borderTop: '1px solid #f1f5f9', cursor: 'pointer', fontFamily: 'inherit' },
  itemNom: { display: 'block', fontSize: 13.5, fontWeight: 700, color: '#1a2332' },
  itemVille: { display: 'block', fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 1 },
  itemLignes: { display: 'flex', gap: 4, flex: '0 0 auto' },
  vide: { padding: '11px 13px', fontSize: 12.5, color: '#94a3b8' },
  aide: { fontSize: 11, color: '#94a3b8', marginTop: 6 },
};
