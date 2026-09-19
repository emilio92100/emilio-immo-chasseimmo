'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Deux briques partagées par les onglets Sélection et Présentés :
 *
 *  <Frise bienId />            la chronologie d'un bien
 *  <ModaleObservation ... />   la fenêtre pour noter le retour du client
 *
 * Tout ce qui est écrit ici est relu par la veille au passage suivant.
 */

const NAVY = '#1a2332';
const OR = '#c9a84c';
const BORD = '#e3e8f0';


/* ══ Briques visuelles partagées ═══════════════════════════════ */

const DPE_COULEURS: Record<string, { bg: string; fg: string }> = {
  A: { bg: '#319834', fg: '#ffffff' },
  B: { bg: '#4ab84a', fg: '#ffffff' },
  C: { bg: '#a8d84a', fg: '#1a2332' },
  D: { bg: '#f7e017', fg: '#1a2332' },
  E: { bg: '#f5b912', fg: '#1a2332' },
  F: { bg: '#ee8235', fg: '#ffffff' },
  G: { bg: '#e2231a', fg: '#ffffff' },
};

export function Dpe({ lettre, label = 'DPE' }: { lettre?: string | null; label?: string }) {
  if (!lettre) return null;
  const L = String(lettre).toUpperCase().slice(0, 1);
  const c = DPE_COULEURS[L];
  if (!c) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f7f9fc', border: `1px solid ${BORD}`, borderRadius: 7, padding: '2px 8px 2px 4px', fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>
      <span style={{ background: c.bg, color: c.fg, borderRadius: 5, width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{L}</span>
      {label}
    </span>
  );
}

export function Chip({ children, ton = 'neutre' }: { children: React.ReactNode; ton?: 'neutre' | 'vert' | 'or' | 'ambre' | 'violet' }) {
  const t = {
    neutre: { bg: '#f7f9fc', fg: '#475569', bd: BORD },
    vert: { bg: '#f0fdf4', fg: '#15803d', bd: '#bbf7d0' },
    or: { bg: '#fdfaf1', fg: '#a17d2c', bd: '#ecdcb4' },
    ambre: { bg: '#fffbeb', fg: '#92400e', bd: '#fde68a' },
    violet: { bg: '#f5f3ff', fg: '#7c3aed', bd: '#ddd6fe' },
  }[ton];
  return (
    <span style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</span>
  );
}

/** Petit bouton discret en forme de bloc (Annonce d'origine, Détail, Parcours…). */
export function BoutonLien({ children, onClick, href, actif }: { children: React.ReactNode; onClick?: () => void; href?: string; actif?: boolean }) {
  const st: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: actif ? '#1a2332' : '#f7f9fc',
    color: actif ? 'white' : '#475569',
    border: `1px solid ${actif ? '#1a2332' : BORD}`,
    borderRadius: 9, padding: '6px 12px', fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', transition: 'all .14s',
  };
  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer" style={st}
      onMouseEnter={e => { e.currentTarget.style.background = '#eef2f7'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#f7f9fc'; }}>{children}</a>;
  }
  return <button type="button" onClick={onClick} style={st}
    onMouseEnter={e => { if (!actif) e.currentTarget.style.background = '#eef2f7'; }}
    onMouseLeave={e => { if (!actif) e.currentTarget.style.background = '#f7f9fc'; }}>{children}</button>;
}

/** Grille à trois colonnes : photo · contenu · actions. minmax(0,1fr) évite le débordement. */
export const GRILLE_CARTE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '244px minmax(0, 1fr) 186px',
  alignItems: 'stretch',
};

export const CARTE: React.CSSProperties = {
  background: 'white',
  border: `1px solid ${BORD}`,
  borderRadius: 18,
  overflow: 'hidden',
  boxShadow: '0 1px 2px rgba(16,24,40,.04), 0 8px 24px -16px rgba(16,24,40,.18)',
};

/* ══ Chronologie ═══════════════════════════════════════════════ */

const PUCES: Record<string, { c: string; l: string }> = {
  veille_trouve: { c: '#94a3b8', l: 'Trouvé par la veille' },
  bien_ajoute: { c: '#3b82f6', l: 'Retenu' },
  pdf_pret: { c: OR, l: 'PDF client prêt' },
  envoi_bien: { c: OR, l: 'Envoyé au client' },
  retour_client: { c: '#10b981', l: 'Retour du client' },
  visite: { c: '#8b5cf6', l: 'Visite' },
  compte_rendu_visite: { c: '#8b5cf6', l: 'Compte-rendu de visite' },
  offre_faite: { c: '#ef4444', l: 'Offre' },
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
    const depuisVisites = (v.data || []).map((x: any) => ({
      id: 'v-' + x.id,
      type: x.statut === 'effectuee' ? 'compte_rendu_visite' : 'visite',
      titre: x.statut === 'effectuee'
        ? `Visite effectuée${x.note_etoiles ? ' · ' + '⭐'.repeat(x.note_etoiles) : ''}`
        : 'Visite planifiée',
      description: x.commentaire || null,
      created_at: x.date_visite || x.created_at,
    }));
    const tout = [...(j.data || []), ...depuisVisites]
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setLignes(tout);
    setChargement(false);
  }, [bienId]);

  useEffect(() => { charger(); }, [charger, rafraichir]);

  if (chargement) {
    return <div style={{ padding: '14px 0', color: '#94a3b8', fontSize: 13 }}>Chargement…</div>;
  }
  if (lignes.length === 0) {
    return <div style={{ padding: '14px 0', color: '#94a3b8', fontSize: 13 }}>Aucune étape enregistrée pour l&apos;instant.</div>;
  }

  return (
    <div style={{ position: 'relative', paddingLeft: 20, marginTop: 4 }}>
      <div style={{ position: 'absolute', left: 5, top: 8, bottom: 8, width: 2, background: BORD, borderRadius: 2 }} />
      {lignes.map((l) => {
        const p = PUCES[l.type] || { c: '#cbd5e1', l: l.type };
        const d = new Date(l.created_at);
        return (
          <div key={l.id} style={{ position: 'relative', paddingBottom: 14 }}>
            <span style={{ position: 'absolute', left: -19, top: 4, width: 12, height: 12, borderRadius: '50%', background: p.c, border: '2px solid white', boxShadow: `0 0 0 2px ${p.c}30` }} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, minWidth: 92 }}>
                {d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} · {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>{l.titre || p.l}</span>
            </div>
            {l.description && (
              <div style={{ fontSize: 13, color: '#475569', marginTop: 3, lineHeight: 1.55, fontStyle: 'italic' }}>
                « {l.description} »
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ══ Fenêtre d'observation ═════════════════════════════════════ */

const AVIS = [
  { id: 'interesse', label: 'Ça lui plaît', icone: '👍', couleur: '#10b981', fond: '#ecfdf5', bordure: '#a7f3d0', badge: 'interesse' },
  { id: 'souhaite_visiter', label: 'Il veut visiter', icone: '👀', couleur: '#8b5cf6', fond: '#f5f3ff', bordure: '#ddd6fe', badge: 'souhaite_visiter' },
  { id: 'refuse', label: 'Pas pour lui', icone: '👎', couleur: '#ef4444', fond: '#fef2f2', bordure: '#fecaca', badge: 'refuse' },
];

const SUGGESTIONS: Record<string, string[]> = {
  interesse: ['La terrasse lui plaît', 'Bon rapport surface/prix', 'Le quartier lui convient'],
  souhaite_visiter: ['Veut visiter rapidement', 'Disponible en fin de semaine'],
  refuse: ['Trop sombre', 'Séjour trop petit', 'Trop de travaux', 'Rue trop passante', 'Pas d’extérieur', 'Hors budget'],
};

export function ModaleObservation({
  bien, clientId, onFerme, onEnregistre,
}: {
  bien: any; clientId: string; onFerme: () => void; onEnregistre: () => void;
}) {
  const [avis, setAvis] = useState<string | null>(null);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => { const t = setTimeout(() => setVisible(true), 10); return () => clearTimeout(t); }, []);

  const choisi = AVIS.find((a) => a.id === avis);

  async function enregistrer() {
    if (!avis || envoi) return;
    setEnvoi(true);
    const a = AVIS.find((x) => x.id === avis)!;
    await supabase.from('biens').update({
      badge_retour: a.badge,
      retour_client: texte.trim() || a.label,
      retour_le: new Date().toISOString(),
    }).eq('id', bien.id);
    await supabase.from('journal').insert({
      client_id: clientId,
      bien_id: bien.id,
      recherche_id: bien.recherche_id,
      type: 'retour_client',
      titre: `${a.icone} ${a.label}`,
      description: texte.trim() || null,
      metadata: {},
    });
    setEnvoi(false);
    onEnregistre();
    onFerme();
  }

  return (
    <div
      onClick={onFerme}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        opacity: visible ? 1 : 0, transition: 'opacity .18s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 20, width: '100%', maxWidth: 520,
          boxShadow: '0 24px 64px rgba(15,23,42,.28)', overflow: 'hidden',
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(14px) scale(.97)',
          transition: 'transform .22s cubic-bezier(.2,.9,.3,1)',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${BORD}` }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .9 }}>
            Retour du client
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: NAVY, marginTop: 4 }}>
            {bien.titre || `${bien.type_bien || 'Bien'} — ${bien.ville || ''}`}
          </div>
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {AVIS.map((a) => {
              const actif = avis === a.id;
              return (
                <button key={a.id} type="button" onClick={() => setAvis(a.id)}
                  style={{
                    flex: 1, background: actif ? a.fond : '#fbfcfe',
                    border: `2px solid ${actif ? a.couleur : BORD}`, borderRadius: 14,
                    padding: '16px 8px', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                    transform: actif ? 'translateY(-2px)' : 'none',
                    boxShadow: actif ? `0 6px 16px ${a.couleur}22` : 'none',
                    transition: 'all .16s ease',
                  }}>
                  <span style={{ fontSize: 26, lineHeight: 1 }}>{a.icone}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: actif ? a.couleur : '#64748b' }}>{a.label}</span>
                </button>
              );
            })}
          </div>

          {choisi && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(SUGGESTIONS[choisi.id] || []).map((s) => (
                  <button key={s} type="button" onClick={() => setTexte(s)}
                    style={{
                      background: texte === s ? choisi.fond : '#f7f9fc',
                      border: `1px solid ${texte === s ? choisi.bordure : BORD}`,
                      color: texte === s ? choisi.couleur : '#64748b',
                      borderRadius: 20, padding: '5px 12px', fontSize: 12.5, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                    }}>{s}</button>
                ))}
              </div>
              <textarea
                value={texte} onChange={(e) => setTexte(e.target.value)} autoFocus rows={3}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enregistrer(); }}
                placeholder="Ses mots à lui, si tu veux les garder…"
                style={{
                  border: `1px solid ${BORD}`, borderRadius: 12, padding: '11px 13px',
                  fontSize: 14, color: NAVY, fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                }}
              />
              <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13 }}>🔎</span>
                Ce que tu écris ici, la veille le relit demain matin pour affiner la recherche.
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '14px 22px', borderTop: `1px solid ${BORD}`, background: '#fbfcfe', display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
          <button type="button" onClick={onFerme}
            style={{ background: 'white', border: `1px solid ${BORD}`, color: '#64748b', borderRadius: 10, padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Annuler
          </button>
          <button type="button" onClick={enregistrer} disabled={!avis || envoi}
            style={{
              background: avis ? NAVY : '#cbd5e1', color: 'white', border: 'none', borderRadius: 10,
              padding: '10px 22px', fontSize: 13.5, fontWeight: 700,
              cursor: avis ? 'pointer' : 'default', fontFamily: 'inherit', transition: 'background .15s',
            }}>
            {envoi ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══ Fenêtre d'envoi ═══════════════════════════════════════════ */

export function ModaleEnvoi({
  bien, clientId, client, onFerme, onEnvoye, onMail,
}: {
  bien: any; clientId: string; client: any;
  onFerme: () => void; onEnvoye: () => void; onMail: (bienId: string) => void;
}) {
  const [type, setType] = useState<'pourcentage' | 'fixe'>(
    bien.commission_type === 'fixe' ? 'fixe' : 'pourcentage'
  );
  const [valeur, setValeur] = useState<string>(
    bien.commission_val ? String(bien.commission_val) : (bien.commission_type === 'fixe' ? '25000' : '3')
  );
  const [visible, setVisible] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [copie, setCopie] = useState(false);

  useEffect(() => { const t = setTimeout(() => setVisible(true), 10); return () => clearTimeout(t); }, []);

  const base = Number(bien.prix_vendeur) || 0;
  const v = parseFloat(String(valeur).replace(',', '.')) || 0;
  const honoraires = type === 'pourcentage' ? Math.round(base * (v / 100)) : Math.round(v);
  const total = base + honoraires;
  const pctEquivalent = base > 0 ? ((honoraires / base) * 100) : 0;

  async function marquerEnvoye(canal: string) {
    setEnvoi(true);
    await supabase.from('biens').update({
      etape: 'presente',
      envoye_le: new Date().toISOString(),
      canal_envoi: canal,
      commission_type: type,
      commission_val: v,
      prix_acquereur: total,
      badge_retour: 'propose',
    }).eq('id', bien.id);
    await supabase.from('journal').insert({
      client_id: clientId, bien_id: bien.id, recherche_id: bien.recherche_id,
      type: 'envoi_bien',
      titre: `Envoyé au client · ${canal === 'mail' ? 'mail' : canal === 'whatsapp' ? 'WhatsApp' : 'lien'}`,
      description: `Prix présenté ${total.toLocaleString('fr-FR')} € — dont ${honoraires.toLocaleString('fr-FR')} € d'honoraires de chasse`,
      metadata: {},
    });
    setEnvoi(false);
    onEnvoye();
  }

  const lien = bien.pdf_url || (typeof window !== 'undefined' ? `${window.location.origin}/bien/${bien.id}` : '');

  async function viaWhatsapp() {
    const txt = `Bonjour ${client?.prenom || ''}, voici un bien qui correspond à votre recherche :\n\n${bien.titre || ''}\n${bien.surface ? bien.surface + ' m²' : ''}${bien.nb_pieces ? ' · ' + bien.nb_pieces + ' pièces' : ''}\nPrix : ${total.toLocaleString('fr-FR')} € tout compris\n\n${lien}`;
    await marquerEnvoye('whatsapp');
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
    onFerme();
  }
  async function viaLien() {
    try { await navigator.clipboard.writeText(lien); setCopie(true); } catch { /* ignore */ }
    await marquerEnvoye('lien');
    setTimeout(onFerme, 800);
  }
  async function viaMail() {
    await marquerEnvoye('mail');
    onFerme();
    onMail(bien.id);
  }

  const canal = (icone: string, titre: string, sous: string, action: () => void, teinte: string) => (
    <button type="button" onClick={action} disabled={envoi}
      style={{
        display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left',
        background: 'white', border: `1.5px solid ${BORD}`, borderRadius: 14, padding: '13px 15px',
        cursor: envoi ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'all .15s',
      }}
      onMouseEnter={(e) => { if (!envoi) { e.currentTarget.style.borderColor = teinte; e.currentTarget.style.background = '#fbfcfe'; } }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORD; e.currentTarget.style.background = 'white'; }}>
      <span style={{ width: 38, height: 38, borderRadius: 11, background: `${teinte}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0 }}>{icone}</span>
      <span style={{ flexGrow: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: NAVY }}>{titre}</span>
        <span style={{ display: 'block', fontSize: 12.5, color: '#94a3b8', marginTop: 1 }}>{sous}</span>
      </span>
      <span style={{ color: '#cbd5e1', fontSize: 19, flexShrink: 0 }}>›</span>
    </button>
  );

  const ongletType = (id: 'pourcentage' | 'fixe', label: string) => {
    const actif = type === id;
    return (
      <button type="button" onClick={() => { setType(id); setValeur(id === 'pourcentage' ? '3' : '25000'); }}
        style={{
          flex: 1, background: actif ? 'white' : 'transparent',
          color: actif ? NAVY : '#94a3b8', border: 'none', borderRadius: 8,
          padding: '7px 0', fontSize: 13, fontWeight: actif ? 800 : 600,
          cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: actif ? '0 1px 3px rgba(16,24,40,.12)' : 'none', transition: 'all .14s',
        }}>{label}</button>
    );
  };

  return (
    <div onClick={onFerme}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(2px)', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto',
        opacity: visible ? 1 : 0, transition: 'opacity .2s ease',
      }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 22, width: '100%', maxWidth: 540,
          boxShadow: '0 28px 70px rgba(15,23,42,.32)', overflow: 'hidden',
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(.96)',
          transition: 'transform .26s cubic-bezier(.2,.9,.3,1)',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}>

        <div style={{ background: NAVY, padding: '20px 24px', display: 'flex', gap: 14, alignItems: 'center' }}>
          {bien.photos?.[0] && (
            <img src={bien.photos[0]} alt="" style={{ width: 54, height: 54, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
          )}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5, color: '#64748b', marginBottom: 13 }}>
            <span>Prix de l&apos;annonce</span>
            <span style={{ fontWeight: 700, color: NAVY, fontSize: 15 }}>{base.toLocaleString('fr-FR')} €</span>
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .9, marginBottom: 8 }}>
            Tes honoraires de chasse
          </div>

          <div style={{ display: 'flex', gap: 11, alignItems: 'center', marginBottom: 13 }}>
            <div style={{ display: 'flex', background: '#eef2f7', borderRadius: 10, padding: 3, width: 168, flexShrink: 0 }}>
              {ongletType('pourcentage', '% du prix')}
              {ongletType('fixe', 'Montant fixe')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexGrow: 1 }}>
              <input type="number" step={type === 'pourcentage' ? '0.1' : '500'} min="0"
                value={valeur} onChange={(e) => setValeur(e.target.value)}
                style={{
                  width: '100%', border: `1.5px solid ${BORD}`, borderRadius: 10, padding: '9px 12px',
                  fontSize: 15, fontWeight: 700, color: NAVY, fontFamily: 'inherit', textAlign: 'right', outline: 'none',
                }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#64748b', width: 16 }}>
                {type === 'pourcentage' ? '%' : '€'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5, color: '#64748b', marginBottom: 12 }}>
            <span>Soit</span>
            <span style={{ fontWeight: 700, color: NAVY }}>
              + {honoraires.toLocaleString('fr-FR')} €
              {type === 'fixe' && base > 0 && (
                <span style={{ color: '#94a3b8', fontWeight: 500, fontSize: 12.5 }}> ({pctEquivalent.toFixed(1)} %)</span>
              )}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 13, borderTop: `2px solid ${BORD}` }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: .8 }}>Prix présenté</span>
            <span style={{ fontSize: 25, fontWeight: 800, color: OR, letterSpacing: -.6 }}>{total.toLocaleString('fr-FR')} €</span>
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
          <button type="button" onClick={onFerme}
            style={{ background: 'white', border: `1px solid ${BORD}`, color: '#64748b', borderRadius: 10, padding: '9px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
