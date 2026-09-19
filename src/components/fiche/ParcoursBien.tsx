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
  const [pct, setPct] = useState<string>(
    bien.commission_type === 'pourcentage' && bien.commission_val ? String(bien.commission_val) : '3'
  );
  const [visible, setVisible] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [copie, setCopie] = useState(false);

  useEffect(() => { const t = setTimeout(() => setVisible(true), 10); return () => clearTimeout(t); }, []);

  const base = Number(bien.prix_vendeur) || 0;
  const taux = parseFloat(pct.replace(',', '.')) || 0;
  const honoraires = Math.round(base * (taux / 100));
  const total = base + honoraires;

  async function marquerEnvoye(canal: string) {
    setEnvoi(true);
    await supabase.from('biens').update({
      etape: 'presente',
      envoye_le: new Date().toISOString(),
      canal_envoi: canal,
      commission_type: 'pourcentage',
      commission_val: taux,
      prix_acquereur: total,
      badge_retour: 'propose',
    }).eq('id', bien.id);
    await supabase.from('journal').insert({
      client_id: clientId, bien_id: bien.id, recherche_id: bien.recherche_id,
      type: 'envoi_bien',
      titre: `Envoyé au client (${canal === 'mail' ? 'mail' : canal === 'whatsapp' ? 'WhatsApp' : 'lien'})`,
      description: `Prix présenté ${total.toLocaleString('fr-FR')} € (dont ${honoraires.toLocaleString('fr-FR')} € d'honoraires de chasse)`,
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
    setTimeout(onFerme, 700);
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
        background: 'white', border: `1px solid ${BORD}`, borderRadius: 14, padding: '14px 16px',
        cursor: 'pointer', fontFamily: 'inherit', transition: 'all .14s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = teinte; e.currentTarget.style.transform = 'translateX(3px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORD; e.currentTarget.style.transform = 'none'; }}>
      <span style={{ fontSize: 22, lineHeight: 1 }}>{icone}</span>
      <span style={{ flexGrow: 1 }}>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: NAVY }}>{titre}</span>
        <span style={{ display: 'block', fontSize: 12.5, color: '#94a3b8', marginTop: 2 }}>{sous}</span>
      </span>
      <span style={{ color: '#cbd5e1', fontSize: 18 }}>›</span>
    </button>
  );

  return (
    <div onClick={onFerme}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        opacity: visible ? 1 : 0, transition: 'opacity .18s ease',
      }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 20, width: '100%', maxWidth: 520,
          boxShadow: '0 24px 64px rgba(15,23,42,.28)', overflow: 'hidden',
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(14px) scale(.97)',
          transition: 'transform .22s cubic-bezier(.2,.9,.3,1)',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}>

        <div style={{ background: NAVY, padding: '18px 22px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: OR, textTransform: 'uppercase', letterSpacing: .9 }}>
            Envoyer à {client?.prenom || 'votre client'}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'white', marginTop: 4 }}>
            {bien.titre || `${bien.type_bien || 'Bien'} — ${bien.ville || ''}`}
          </div>
        </div>

        {/* commission */}
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${BORD}`, background: '#fbfcfe' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5, color: '#475569', marginBottom: 9 }}>
            <span>Prix de l&apos;annonce</span>
            <span style={{ fontWeight: 700, color: NAVY }}>{base.toLocaleString('fr-FR')} €</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 11 }}>
            <label htmlFor="pct" style={{ fontSize: 13.5, color: '#475569' }}>Tes honoraires de chasse</label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input id="pct" type="number" step="0.1" min="0" value={pct} onChange={(e) => setPct(e.target.value)}
                style={{ width: 68, border: `1px solid ${BORD}`, borderRadius: 9, padding: '7px 10px', fontSize: 14, fontWeight: 700, color: NAVY, fontFamily: 'inherit', textAlign: 'right', outline: 'none' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#64748b' }}>%</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: NAVY, minWidth: 92, textAlign: 'right' }}>
                + {honoraires.toLocaleString('fr-FR')} €
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 11, borderTop: `1px solid ${BORD}` }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .8 }}>Prix présenté</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: OR, letterSpacing: -.4 }}>{total.toLocaleString('fr-FR')} €</span>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 5, textAlign: 'right' }}>tout compris, honoraires inclus</div>
        </div>

        {/* canaux */}
        <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {canal('✉️', 'Par mail', 'Ouvre ta fenêtre d’envoi habituelle', viaMail, '#3b82f6')}
          {canal('💬', 'WhatsApp', 'Message pré-rempli avec le lien', viaWhatsapp, '#25d366')}
          {canal('🔗', copie ? 'Lien copié ✓' : 'Copier le lien', bien.pdf_url ? 'Le PDF client' : 'La fiche du bien', viaLien, OR)}
        </div>

        <div style={{ padding: '12px 22px', borderTop: `1px solid ${BORD}`, background: '#fbfcfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
