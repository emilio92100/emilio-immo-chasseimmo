'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';

/**
 * Briques partagées par les onglets Veille, Sélection et Présentés.
 *
 *  <Modale>             fenêtre en plein écran, rendue hors du conteneur
 *  <Galerie>            photos avec fondu entre les vues
 *  <Frise>              chronologie d'un bien
 *  <ModaleObservation>  retour du client
 *  <ModaleEnvoi>        honoraires + canal d'envoi
 *  <ModaleScore>        explication du score de correspondance
 */

export const NAVY = '#1a2332';
export const OR = '#c9a84c';
export const BORD = '#e3e8f0';

/* ══ Styles globaux, injectés une seule fois ═══════════════════ */

export function StylesEmilio() {
  return (
    <style>{`
      @keyframes emiVoile { from { opacity: 0 } to { opacity: 1 } }
      @keyframes emiPanneau { from { opacity: 0; transform: translateY(14px) scale(.975) } to { opacity: 1; transform: none } }
      @keyframes emiEntree { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
      @keyframes emiPouls { 0%,100% { opacity:.4; transform:scale(.75) } 50% { opacity:1; transform:scale(1.2) } }
      .emi-voile { animation: emiVoile .2s ease both }
      .emi-fenetre { animation: emiPanneau .3s cubic-bezier(.16,1,.3,1) both }
      .emi-panneau { animation: emiEntree .32s cubic-bezier(.16,1,.3,1) both }
      .emi-panneau > * { animation: emiEntree .38s cubic-bezier(.16,1,.3,1) both }
      .emi-pouls { width:7px; height:7px; border-radius:50%; background:${OR}; display:inline-block; animation: emiPouls 1.9s ease-in-out infinite }
      .emi-carte { transition: box-shadow .22s ease, transform .22s ease }
      .emi-carte:hover { box-shadow: 0 2px 4px rgba(16,24,40,.05), 0 18px 40px -22px rgba(16,24,40,.35) }
      .emi-nav { opacity: 0; transition: opacity .2s ease }
      .emi-galerie:hover .emi-nav { opacity: 1 }
      .emi-onglet { position:relative; display:inline-flex; align-items:center; gap:8px; background:transparent; border:none;
        border-radius:11px; padding:10px 15px; font-size:13.5px; font-weight:600; color:#64748b; cursor:pointer;
        font-family:inherit; white-space:nowrap; transition: color .2s ease, background .2s ease, transform .2s ease }
      .emi-onglet:hover { color:${NAVY}; background:#eef2f7; transform: translateY(-1px) }
      .emi-onglet[data-actif="true"] { color:#fff; background:${NAVY}; font-weight:800; box-shadow: 0 6px 18px -8px rgba(26,35,50,.85) }
      .emi-compteur { background:rgba(148,163,184,.18); color:#64748b; border-radius:20px; padding:1px 8px; font-size:11.5px; font-weight:800; transition: all .2s ease }
      .emi-onglet[data-actif="true"] .emi-compteur { background:rgba(255,255,255,.16); color:#fff }
      .emi-onglet .emi-compteur.dore { background:${OR}; color:#fff }
    `}</style>
  );
}

/* ══ Fenêtre ═══════════════════════════════════════════════════ */

export function Modale({ children, onFerme, largeur = 560 }: { children: React.ReactNode; onFerme: () => void; largeur?: number }) {
  const [monte, setMonte] = useState(false);
  useEffect(() => {
    setMonte(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFerme(); };
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [onFerme]);

  if (!monte) return null;

  return createPortal(
    <div className="emi-voile" onClick={onFerme}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(12,18,30,.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, overflowY: 'auto',
      }}>
      <div className="emi-fenetre" onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 22, width: '100%', maxWidth: largeur,
          boxShadow: '0 32px 80px rgba(12,18,30,.4)', overflow: 'hidden',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", margin: 'auto',
        }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

/* ══ Briques visuelles ═════════════════════════════════════════ */

const DPE_COULEURS: Record<string, { bg: string; fg: string }> = {
  A: { bg: '#319834', fg: '#fff' }, B: { bg: '#4ab84a', fg: '#fff' },
  C: { bg: '#a8d84a', fg: NAVY }, D: { bg: '#f7e017', fg: NAVY },
  E: { bg: '#f5b912', fg: NAVY }, F: { bg: '#ee8235', fg: '#fff' },
  G: { bg: '#e2231a', fg: '#fff' },
};

export function Dpe({ lettre, label = 'DPE' }: { lettre?: string | null; label?: string }) {
  if (!lettre) return null;
  const L = String(lettre).toUpperCase().slice(0, 1);
  const c = DPE_COULEURS[L];
  if (!c) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f7f9fc', border: `1px solid ${BORD}`, borderRadius: 7, padding: '2px 7px 2px 3px', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>
      <span style={{ background: c.bg, color: c.fg, borderRadius: 5, width: 17, height: 17, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800 }}>{L}</span>
      {label}
    </span>
  );
}

export function Chip({ children, ton = 'neutre' }: { children: React.ReactNode; ton?: 'neutre' | 'vert' | 'or' | 'ambre' | 'violet' }) {
  const t = {
    neutre: { bg: '#f7f9fc', fg: '#64748b', bd: BORD },
    vert: { bg: '#f0fdf4', fg: '#15803d', bd: '#bbf7d0' },
    or: { bg: '#fdfaf1', fg: '#a17d2c', bd: '#ecdcb4' },
    ambre: { bg: '#fffbeb', fg: '#92400e', bd: '#fde68a' },
    violet: { bg: '#f5f3ff', fg: '#7c3aed', bd: '#ddd6fe' },
  }[ton];
  return <span style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, padding: '3px 9px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</span>;
}

export function BoutonLien({ children, onClick, href, actif }: { children: React.ReactNode; onClick?: () => void; href?: string; actif?: boolean }) {
  const st: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: actif ? NAVY : '#f7f9fc', color: actif ? 'white' : '#475569',
    border: `1px solid ${actif ? NAVY : BORD}`, borderRadius: 9, padding: '5px 11px',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    textDecoration: 'none', transition: 'all .16s ease',
  };
  const surv = (e: any, entre: boolean) => { if (!actif) e.currentTarget.style.background = entre ? '#eef2f7' : '#f7f9fc'; };
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" style={st} onMouseEnter={e => surv(e, true)} onMouseLeave={e => surv(e, false)}>{children}</a>;
  return <button type="button" onClick={onClick} style={st} onMouseEnter={e => surv(e, true)} onMouseLeave={e => surv(e, false)}>{children}</button>;
}

export const CARTE: React.CSSProperties = {
  background: 'white', border: `1px solid ${BORD}`, borderRadius: 16, overflow: 'hidden',
  boxShadow: '0 1px 2px rgba(16,24,40,.04), 0 10px 26px -20px rgba(16,24,40,.28)',
};

export const GRILLE_CARTE: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '196px minmax(0, 1fr) 172px', alignItems: 'stretch',
};

/* ══ Galerie avec fondu ════════════════════════════════════════ */

export function Galerie({ photos, hauteur = 168, coin }: { photos: string[]; hauteur?: number; coin?: React.ReactNode }) {
  const [idx, setIdx] = useState(0);
  const total = photos.length;
  const aller = (d: number) => setIdx((i) => (i + d + total) % total);

  return (
    <div className="emi-galerie" style={{ position: 'relative', background: '#e8edf3', minHeight: hauteur, overflow: 'hidden' }}>
      {photos.map((u, i) => (
        <img key={u + i} src={u} alt=""
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            opacity: i === idx ? 1 : 0, transition: 'opacity .38s cubic-bezier(.4,0,.2,1)',
            transform: i === idx ? 'scale(1)' : 'scale(1.015)',
          }}
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
      ))}
      {total > 1 && (
        <>
          <button type="button" aria-label="Photo précédente" className="emi-nav" onClick={() => aller(-1)} style={nav('left')}>‹</button>
          <button type="button" aria-label="Photo suivante" className="emi-nav" onClick={() => aller(1)} style={nav('right')}>›</button>
          <div style={{ position: 'absolute', bottom: 9, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4 }}>
            {photos.slice(0, 10).map((_, i) => (
              <span key={i} style={{
                width: i === idx ? 14 : 5, height: 5, borderRadius: 3,
                background: i === idx ? 'white' : 'rgba(255,255,255,.55)',
                transition: 'width .3s cubic-bezier(.16,1,.3,1), background .3s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,.35)',
              }} />
            ))}
          </div>
        </>
      )}
      {coin}
    </div>
  );
}

function nav(cote: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', [cote]: 8,
    width: 26, height: 26, borderRadius: '50%', background: 'rgba(15,23,42,.55)', color: 'white',
    border: 'none', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit', zIndex: 2,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, backdropFilter: 'blur(3px)',
  } as React.CSSProperties;
}

/* ══ Chronologie ═══════════════════════════════════════════════ */

const PUCES: Record<string, { c: string; l: string; i: string }> = {
  veille_trouve: { c: '#94a3b8', l: 'Trouvé par la veille', i: '🔎' },
  bien_ajoute: { c: '#3b82f6', l: 'Retenu', i: '📋' },
  envoi_bien: { c: OR, l: 'Envoyé au client', i: '📤' },
  retour_client: { c: '#10b981', l: 'Retour du client', i: '💬' },
  visite: { c: '#8b5cf6', l: 'Visite planifiée', i: '📅' },
  compte_rendu_visite: { c: '#8b5cf6', l: 'Compte-rendu de visite', i: '🔑' },
  offre_faite: { c: '#ef4444', l: 'Offre', i: '✍️' },
};

export function Frise({ bienId, rafraichir }: { bienId: string; rafraichir?: number }) {
  const [lignes, setLignes] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    setChargement(true);
    const [j, v] = await Promise.all([
      supabase.from('journal').select('*').eq('bien_id', bienId).order('created_at', { ascending: false }),
      supabase.from('visites').select('*').eq('bien_id', bienId).order('date_visite', { ascending: false }),
    ]);
    const dv = (v.data || []).map((x: any) => ({
      id: 'v-' + x.id,
      type: x.statut === 'effectuee' ? 'compte_rendu_visite' : 'visite',
      titre: x.statut === 'effectuee' ? `Visite effectuée${x.note_etoiles ? ' · ' + '⭐'.repeat(x.note_etoiles) : ''}` : 'Visite planifiée',
      description: x.commentaire || null,
      created_at: x.date_visite || x.created_at,
    }));
    setLignes([...(j.data || []), ...dv].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    setChargement(false);
  }, [bienId]);

  useEffect(() => { charger(); }, [charger, rafraichir]);

  if (chargement) return <div style={{ padding: '14px 0', color: '#94a3b8', fontSize: 13 }}>Chargement…</div>;
  if (!lignes.length) return <div style={{ padding: '14px 0', color: '#94a3b8', fontSize: 13 }}>Aucune étape enregistrée pour l&apos;instant.</div>;

  return (
    <div style={{ position: 'relative', paddingLeft: 26 }}>
      <div style={{ position: 'absolute', left: 10, top: 10, bottom: 10, width: 2, background: `linear-gradient(${BORD}, ${BORD})`, borderRadius: 2 }} />
      {lignes.map((l, n) => {
        const p = PUCES[l.type] || { c: '#cbd5e1', l: l.type, i: '•' };
        const d = new Date(l.created_at);
        return (
          <div key={l.id} style={{ position: 'relative', paddingBottom: n === lignes.length - 1 ? 2 : 16 }}>
            <span style={{
              position: 'absolute', left: -26, top: 1, width: 22, height: 22, borderRadius: '50%',
              background: 'white', border: `2px solid ${p.c}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 10,
            }}>{p.i}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{l.titre || p.l}</span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })} · {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {l.description && (
              <div style={{ fontSize: 13, color: '#475569', marginTop: 3, lineHeight: 1.6, fontStyle: 'italic' }}>« {l.description} »</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ══ Score ═════════════════════════════════════════════════════ */

export function ModaleScore({ p, onFerme }: { p: any; onFerme: () => void }) {
  const score = p.score ?? 0;
  const teinte = score >= 85 ? '#10b981' : score >= 70 ? OR : '#94a3b8';
  const mention = score >= 85 ? 'Coche tout ce qui compte' : score >= 70 ? 'Mérite un regard' : 'À la limite';

  const Ligne = ({ icone, titre, texte, couleur }: any) => (
    <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: `${couleur}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{icone}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: couleur, marginBottom: 2 }}>{titre}</div>
        <div style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.6 }}>{texte}</div>
      </div>
    </div>
  );

  return (
    <Modale onFerme={onFerme} largeur={520}>
      <div style={{ background: NAVY, padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 66, height: 66, borderRadius: 18, background: teinte, color: 'white',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          boxShadow: `0 8px 22px -8px ${teinte}`,
        }}>
          <span style={{ fontSize: 23, fontWeight: 800, lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: 10, opacity: .8, fontWeight: 700 }}>/ 100</span>
        </div>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: OR, textTransform: 'uppercase', letterSpacing: 1 }}>Score de correspondance</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'white', marginTop: 4 }}>{mention}</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>
            {p.titre || `${p.type_bien || 'Bien'} — ${p.ville || ''}`}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Ligne icone="🎯" titre="La base" couleur="#3b82f6"
          texte="Les critères durs de la recherche : budget, surface, nombre de chambres, secteur. Un bien qui n'en coche pas un ne remonte pas jusqu'ici." />
        {!!p.points_forts?.length && (
          <Ligne icone="✓" titre="Ce qui rapporte des points" couleur="#15803d" texte={p.points_forts.join(' · ')} />
        )}
        {!!p.points_attention?.length && (
          <Ligne icone="!" titre="Ce qui en coûte" couleur="#b45309" texte={p.points_attention.join(' · ')} />
        )}
      </div>

      <div style={{ padding: '16px 24px', background: '#fbfcfe', borderTop: `1px solid ${BORD}` }}>
        <div style={{ display: 'flex', gap: 9, marginBottom: 13 }}>
          {[
            { min: '85+', t: 'Coche tout', c: '#10b981' },
            { min: '70–85', t: 'Un point accroche', c: OR },
            { min: '< 70', t: 'Non proposé', c: '#cbd5e1' },
          ].map(x => (
            <div key={x.min} style={{ flex: 1, textAlign: 'center', background: 'white', border: `1px solid ${score >= 85 && x.min === '85+' || (score >= 70 && score < 85 && x.min === '70–85') ? x.c : BORD}`, borderRadius: 11, padding: '9px 6px' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: x.c }}>{x.min}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{x.t}</div>
            </div>
          ))}
        </div>
        <button type="button" onClick={onFerme}
          style={{ width: '100%', background: NAVY, color: 'white', border: 'none', borderRadius: 11, padding: '11px 0', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Compris
        </button>
      </div>
    </Modale>
  );
}

/* ══ Observation ═══════════════════════════════════════════════ */

const AVIS = [
  { id: 'interesse', label: 'Ça lui plaît', icone: '👍', couleur: '#10b981', fond: '#ecfdf5', bordure: '#a7f3d0', badge: 'interesse' },
  { id: 'souhaite_visiter', label: 'Il veut visiter', icone: '👀', couleur: '#8b5cf6', fond: '#f5f3ff', bordure: '#ddd6fe', badge: 'souhaite_visiter' },
  { id: 'refuse', label: 'Pas pour lui', icone: '👎', couleur: '#ef4444', fond: '#fef2f2', bordure: '#fecaca', badge: 'refuse' },
];

const SUGGESTIONS: Record<string, string[]> = {
  interesse: ['La terrasse lui plaît', 'Bon rapport surface/prix', 'Le quartier lui convient'],
  souhaite_visiter: ['Veut visiter rapidement', 'Disponible en fin de semaine'],
  refuse: ['Trop sombre', 'Séjour trop petit', 'Trop de travaux', 'Rue trop passante', "Pas d'extérieur", 'Hors budget'],
};

export function ModaleObservation({ bien, clientId, onFerme, onEnregistre }: { bien: any; clientId: string; onFerme: () => void; onEnregistre: () => void; }) {
  const [avis, setAvis] = useState<string | null>(null);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const choisi = AVIS.find(a => a.id === avis);

  useEffect(() => { if (choisi) ref.current?.focus(); }, [choisi]);

  async function enregistrer() {
    if (!avis || envoi) return;
    setEnvoi(true);
    const a = AVIS.find(x => x.id === avis)!;
    await supabase.from('biens').update({
      badge_retour: a.badge, retour_client: texte.trim() || a.label, retour_le: new Date().toISOString(),
    }).eq('id', bien.id);
    await supabase.from('journal').insert({
      client_id: clientId, bien_id: bien.id, recherche_id: bien.recherche_id,
      type: 'retour_client', titre: `${a.icone} ${a.label}`, description: texte.trim() || null, metadata: {},
    });
    setEnvoi(false); onEnregistre(); onFerme();
  }

  return (
    <Modale onFerme={onFerme} largeur={540}>
      <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${BORD}`, display: 'flex', gap: 14, alignItems: 'center' }}>
        {bien.photos?.[0] && <img src={bien.photos[0]} alt="" style={{ width: 50, height: 50, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Retour du client</div>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: NAVY, marginTop: 3 }}>
            {bien.titre || `${bien.type_bien || 'Bien'} — ${bien.ville || ''}`}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 17 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {AVIS.map(a => {
            const actif = avis === a.id;
            return (
              <button key={a.id} type="button" onClick={() => setAvis(a.id)}
                style={{
                  flex: 1, background: actif ? a.fond : '#fbfcfe',
                  border: `2px solid ${actif ? a.couleur : BORD}`, borderRadius: 15,
                  padding: '17px 8px', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  transform: actif ? 'translateY(-3px)' : 'none',
                  boxShadow: actif ? `0 10px 22px -10px ${a.couleur}` : 'none',
                  transition: 'all .2s cubic-bezier(.16,1,.3,1)',
                }}>
                <span style={{ fontSize: 28, lineHeight: 1 }}>{a.icone}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: actif ? a.couleur : '#64748b' }}>{a.label}</span>
              </button>
            );
          })}
        </div>

        {choisi && (
          <div className="emi-panneau" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(SUGGESTIONS[choisi.id] || []).map(s => (
                <button key={s} type="button" onClick={() => setTexte(s)}
                  style={{
                    background: texte === s ? choisi.fond : '#f7f9fc',
                    border: `1px solid ${texte === s ? choisi.bordure : BORD}`,
                    color: texte === s ? choisi.couleur : '#64748b',
                    borderRadius: 20, padding: '5px 12px', fontSize: 12.5, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                  }}>{s}</button>
              ))}
            </div>
            <textarea ref={ref} value={texte} onChange={e => setTexte(e.target.value)} rows={3}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enregistrer(); }}
              placeholder="Ses mots à lui, si tu veux les garder…"
              style={{ border: `1px solid ${BORD}`, borderRadius: 12, padding: '11px 13px', fontSize: 14, color: NAVY, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
            <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span>🔎</span> La veille relit ça demain matin pour affiner la recherche.
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '14px 24px', borderTop: `1px solid ${BORD}`, background: '#fbfcfe', display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
        <button type="button" onClick={onFerme} style={btnSecondaire}>Annuler</button>
        <button type="button" onClick={enregistrer} disabled={!avis || envoi}
          style={{ ...btnPrincipal, background: avis ? NAVY : '#cbd5e1', cursor: avis ? 'pointer' : 'default' }}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </Modale>
  );
}

/* ══ Envoi ═════════════════════════════════════════════════════ */

export function ModaleEnvoi({ bien, clientId, client, onFerme, onEnvoye, onMail }: {
  bien: any; clientId: string; client: any; onFerme: () => void; onEnvoye: () => void; onMail: (bienId: string) => void;
}) {
  const [type, setType] = useState<'pourcentage' | 'fixe'>(bien.commission_type === 'fixe' ? 'fixe' : 'pourcentage');
  const [valeur, setValeur] = useState<string>(bien.commission_val ? String(bien.commission_val) : (bien.commission_type === 'fixe' ? '25000' : '3'));
  const [envoi, setEnvoi] = useState(false);
  const [copie, setCopie] = useState(false);

  const base = Number(bien.prix_vendeur) || 0;
  const v = parseFloat(String(valeur).replace(',', '.')) || 0;
  const honoraires = type === 'pourcentage' ? Math.round(base * (v / 100)) : Math.round(v);
  const total = base + honoraires;
  const pctEq = base > 0 ? (honoraires / base) * 100 : 0;

  async function marquer(canal: string) {
    setEnvoi(true);
    await supabase.from('biens').update({
      etape: 'presente', envoye_le: new Date().toISOString(), canal_envoi: canal,
      commission_type: type, commission_val: v, prix_acquereur: total, badge_retour: 'propose',
    }).eq('id', bien.id);
    await supabase.from('journal').insert({
      client_id: clientId, bien_id: bien.id, recherche_id: bien.recherche_id, type: 'envoi_bien',
      titre: `Envoyé au client · ${canal === 'mail' ? 'mail' : canal === 'whatsapp' ? 'WhatsApp' : 'lien'}`,
      description: `Prix présenté ${total.toLocaleString('fr-FR')} € — dont ${honoraires.toLocaleString('fr-FR')} € d'honoraires de chasse`,
      metadata: {},
    });
    setEnvoi(false); onEnvoye();
  }

  const lien = bien.pdf_url || (typeof window !== 'undefined' ? `${window.location.origin}/bien/${bien.id}` : '');

  async function viaWhatsapp() {
    const txt = `Bonjour ${client?.prenom || ''}, voici un bien qui correspond à votre recherche :\n\n${bien.titre || ''}\n${bien.surface ? bien.surface + ' m²' : ''}${bien.nb_pieces ? ' · ' + bien.nb_pieces + ' pièces' : ''}\nPrix : ${total.toLocaleString('fr-FR')} € tout compris\n\n${lien}`;
    await marquer('whatsapp');
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
    onFerme();
  }
  async function viaLien() {
    try { await navigator.clipboard.writeText(lien); setCopie(true); } catch { /* ignore */ }
    await marquer('lien'); setTimeout(onFerme, 800);
  }
  async function viaMail() { await marquer('mail'); onFerme(); onMail(bien.id); }

  const canal = (icone: string, titre: string, sous: string, action: () => void, teinte: string) => (
    <button type="button" onClick={action} disabled={envoi}
      style={{
        display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left',
        background: 'white', border: `1.5px solid ${BORD}`, borderRadius: 14, padding: '13px 15px',
        cursor: envoi ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'all .18s cubic-bezier(.16,1,.3,1)',
      }}
      onMouseEnter={e => { if (!envoi) { e.currentTarget.style.borderColor = teinte; e.currentTarget.style.transform = 'translateX(4px)'; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = BORD; e.currentTarget.style.transform = 'none'; }}>
      <span style={{ width: 38, height: 38, borderRadius: 11, background: `${teinte}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0 }}>{icone}</span>
      <span style={{ flexGrow: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: NAVY }}>{titre}</span>
        <span style={{ display: 'block', fontSize: 12.5, color: '#94a3b8', marginTop: 1 }}>{sous}</span>
      </span>
      <span style={{ color: '#cbd5e1', fontSize: 19 }}>›</span>
    </button>
  );

  const bascule = (id: 'pourcentage' | 'fixe', label: string) => {
    const actif = type === id;
    return (
      <button type="button" onClick={() => { setType(id); setValeur(id === 'pourcentage' ? '3' : '25000'); }}
        style={{
          flex: 1, background: actif ? 'white' : 'transparent', color: actif ? NAVY : '#94a3b8',
          border: 'none', borderRadius: 9, padding: '8px 0', fontSize: 13, fontWeight: actif ? 800 : 600,
          cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: actif ? '0 2px 6px rgba(16,24,40,.14)' : 'none', transition: 'all .2s cubic-bezier(.16,1,.3,1)',
        }}>{label}</button>
    );
  };

  return (
    <Modale onFerme={onFerme} largeur={545}>
      <div style={{ background: NAVY, padding: '20px 24px', display: 'flex', gap: 14, alignItems: 'center' }}>
        {bien.photos?.[0] && <img src={bien.photos[0]} alt="" style={{ width: 54, height: 54, borderRadius: 13, objectFit: 'cover', flexShrink: 0 }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: OR, textTransform: 'uppercase', letterSpacing: 1 }}>
            Envoyer à {client?.prenom || 'votre client'}
          </div>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: 'white', marginTop: 3, lineHeight: 1.3 }}>
            {bien.titre || `${bien.type_bien || 'Bien'} — ${bien.ville || ''}`}
          </div>
        </div>
      </div>

      <div style={{ padding: '18px 24px', borderBottom: `1px solid ${BORD}`, background: '#fbfcfe' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5, color: '#64748b', marginBottom: 14 }}>
          <span>Prix de l&apos;annonce</span>
          <span style={{ fontWeight: 700, color: NAVY, fontSize: 15 }}>{base.toLocaleString('fr-FR')} €</span>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 9 }}>
          Tes honoraires de chasse
        </div>

        <div style={{ display: 'flex', gap: 11, alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', background: '#eef2f7', borderRadius: 11, padding: 3, width: 180, flexShrink: 0 }}>
            {bascule('pourcentage', '% du prix')}
            {bascule('fixe', 'Montant fixe')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexGrow: 1 }}>
            <input type="number" step={type === 'pourcentage' ? '0.1' : '500'} min="0" value={valeur}
              onChange={e => setValeur(e.target.value)}
              style={{ width: '100%', border: `1.5px solid ${BORD}`, borderRadius: 11, padding: '10px 13px', fontSize: 15, fontWeight: 700, color: NAVY, fontFamily: 'inherit', textAlign: 'right', outline: 'none' }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#64748b', width: 14 }}>{type === 'pourcentage' ? '%' : '€'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5, color: '#64748b', marginBottom: 13 }}>
          <span>Soit</span>
          <span style={{ fontWeight: 700, color: NAVY }}>
            + {honoraires.toLocaleString('fr-FR')} €
            {type === 'fixe' && base > 0 && <span style={{ color: '#94a3b8', fontWeight: 500, fontSize: 12.5 }}> ({pctEq.toFixed(1)} %)</span>}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, borderTop: `2px solid ${BORD}` }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: .8 }}>Prix présenté</span>
          <span style={{ fontSize: 26, fontWeight: 800, color: OR, letterSpacing: -.6 }}>{total.toLocaleString('fr-FR')} €</span>
        </div>
        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4, textAlign: 'right' }}>tout compris, honoraires de chasse inclus</div>
      </div>

      <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {canal('✉️', 'Par mail', 'Ouvre ta fenêtre d’envoi habituelle', viaMail, '#3b82f6')}
        {canal('💬', 'WhatsApp', 'Message pré-rempli avec le lien', viaWhatsapp, '#25d366')}
        {canal('🔗', copie ? 'Lien copié ✓' : 'Copier le lien', bien.pdf_url ? 'Le PDF client' : 'La fiche du bien', viaLien, OR)}
      </div>

      <div style={{ padding: '13px 24px', borderTop: `1px solid ${BORD}`, background: '#fbfcfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Le bien passera dans « Présentés »</span>
        <button type="button" onClick={onFerme} style={btnSecondaire}>Fermer</button>
      </div>
    </Modale>
  );
}

const btnSecondaire: React.CSSProperties = {
  background: 'white', border: `1px solid ${BORD}`, color: '#64748b', borderRadius: 11,
  padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};
const btnPrincipal: React.CSSProperties = {
  background: NAVY, color: 'white', border: 'none', borderRadius: 11,
  padding: '10px 22px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
