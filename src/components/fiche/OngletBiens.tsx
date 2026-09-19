'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Frise, ModaleObservation, ModaleEnvoi, Dpe, Chip, BoutonLien, GRILLE_CARTE, CARTE } from './ParcoursBien';

/**
 * Deux onglets pour un seul composant :
 *
 *   mode="selection" → ce que tu as retenu, pas encore envoyé
 *   mode="presentes" → ce que le client a reçu
 */

const NAVY = '#1a2332';
const OR = '#c9a84c';
const BORD = '#e3e8f0';

const RETOURS: Record<string, { l: string; c: string; bg: string; bd: string; i: string }> = {
  propose: { l: 'En attente de retour', c: '#64748b', bg: '#f7f9fc', bd: BORD, i: '⏳' },
  interesse: { l: 'Ça lui plaît', c: '#059669', bg: '#ecfdf5', bd: '#a7f3d0', i: '👍' },
  souhaite_visiter: { l: 'Veut visiter', c: '#7c3aed', bg: '#f5f3ff', bd: '#ddd6fe', i: '👀' },
  visite: { l: 'Visité', c: '#7c3aed', bg: '#f5f3ff', bd: '#ddd6fe', i: '🔑' },
  offre_faite: { l: 'Offre faite', c: '#b45309', bg: '#fffbeb', bd: '#fde68a', i: '✍️' },
  refuse: { l: 'Pas pour lui', c: '#dc2626', bg: '#fef2f2', bd: '#fecaca', i: '👎' },
};

interface Props {
  clientId: string;
  rechercheId: string;
  client: any;
  mode: 'selection' | 'presentes';
  onChange?: () => void;
  onMail: (bienId: string) => void;
  onFiche: (bienId: string) => void;
  onVisite: (bienId: string) => void;
}

export default function OngletBiens({ clientId, rechercheId, client, mode, onChange, onMail, onFiche, onVisite }: Props) {
  const [biens, setBiens] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);
  const [frise, setFrise] = useState<string | null>(null);
  const [obs, setObs] = useState<any>(null);
  const [envoi, setEnvoi] = useState<any>(null);
  const [tick, setTick] = useState(0);
  const [photoIdx, setPhotoIdx] = useState<Record<string, number>>({});

  const charger = useCallback(async () => {
    if (!rechercheId) return;
    setChargement(true);
    const { data } = await supabase
      .from('biens')
      .select('*')
      .eq('recherche_id', rechercheId)
      .eq('etape', mode === 'selection' ? 'selection' : 'presente')
      .order(mode === 'selection' ? 'created_at' : 'envoye_le', { ascending: false, nullsFirst: false });
    setBiens(data || []);
    setChargement(false);
  }, [rechercheId, mode]);

  useEffect(() => { charger(); }, [charger, tick]);

  const recharge = () => { setTick(t => t + 1); onChange?.(); };

  async function demanderPdf(bienId: string) {
    await supabase.from('biens').update({
      pdf_statut: 'demande', pdf_demande_le: new Date().toISOString(),
      pdf_url: null, pdf_message: null,
    }).eq('id', bienId);
    recharge();
  }

  async function renvoyerEnSelection(bienId: string) {
    await supabase.from('biens').update({ etape: 'selection', envoye_le: null, canal_envoi: null }).eq('id', bienId);
    recharge();
  }

  const euros = (n: any) => (n == null ? '—' : Number(n).toLocaleString('fr-FR') + ' €');

  if (chargement) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Chargement…</div>;
  }

  if (biens.length === 0) {
    return (
      <div style={{ background: 'white', border: `1px solid ${BORD}`, borderRadius: 16, padding: '44px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>{mode === 'selection' ? '📋' : '📤'}</div>
        <div style={{ fontWeight: 700, color: NAVY, fontSize: 15, marginBottom: 4 }}>
          {mode === 'selection' ? 'Aucun bien en sélection' : 'Rien n’a encore été envoyé'}
        </div>
        <div style={{ color: '#94a3b8', fontSize: 13 }}>
          {mode === 'selection'
            ? 'Retiens un bien depuis l’onglet Veille et il apparaîtra ici.'
            : 'Les biens que tu envoies depuis la Sélection arrivent dans cet onglet.'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>
          {biens.length} bien{biens.length > 1 ? 's' : ''} {mode === 'selection' ? 'en sélection' : 'présenté' + (biens.length > 1 ? 's' : '')}
        </span>
        <span style={{ fontSize: 13, color: '#64748b' }}>
          {mode === 'selection' ? 'Prépare le PDF, fixe tes honoraires, puis envoie.' : 'Note le retour du client sur chacun.'}
        </span>
      </div>

      {biens.map((b) => {
        const photos: string[] = b.photos || [];
        const idx = photoIdx[b.id] || 0;
        const r = RETOURS[b.badge_retour] || RETOURS.propose;
        const ouvert = frise === b.id;
        const honoraires = b.prix_acquereur && b.prix_vendeur ? b.prix_acquereur - b.prix_vendeur : 0;

        return (
          <div key={b.id} style={CARTE}>
            <div style={GRILLE_CARTE}>

              <div style={{ position: 'relative', background: '#e8edf3', minHeight: 190 }}>
                {photos[idx] && (
                  <img src={photos[idx]} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
                )}
                {photos.length > 1 && (
                  <>
                    <button type="button" aria-label="Précédente" onClick={() => setPhotoIdx(v => ({ ...v, [b.id]: (idx - 1 + photos.length) % photos.length }))} style={nav('left')}>‹</button>
                    <button type="button" aria-label="Suivante" onClick={() => setPhotoIdx(v => ({ ...v, [b.id]: (idx + 1) % photos.length }))} style={nav('right')}>›</button>
                    <span style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(15,23,42,.72)', color: 'white', borderRadius: 7, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>{idx + 1} / {photos.length}</span>
                  </>
                )}
              </div>

              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 16.5, fontWeight: 800, color: NAVY, lineHeight: 1.3 }}>
                    {b.titre || `${b.type_bien || 'Bien'} — ${b.ville || ''}`}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 21, fontWeight: 800, color: OR, letterSpacing: -.4 }}>
                      {euros(b.prix_acquereur || b.prix_vendeur)}
                    </div>
                    {honoraires > 0 && (
                      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                        dont {honoraires.toLocaleString('fr-FR')} € d&apos;honoraires
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5, color: '#475569' }}>
                  {b.surface && <span style={{ fontWeight: 800, color: NAVY, fontSize: 14.5 }}>{b.surface} m²</span>}
                  {b.nb_pieces ? <><Sep />{b.nb_pieces} pièces</> : null}
                  {b.nb_chambres ? <><Sep />{b.nb_chambres} chambres</> : null}
                  {b.etage != null ? <><Sep />{b.etage === 0 ? 'RDC' : `${b.etage}ᵉ étage`}</> : null}
                  {b.annee_construction ? <><Sep />immeuble {b.annee_construction}</> : null}
                  <Dpe lettre={b.dpe} />
                  <Dpe lettre={b.ges} label="GES" />
                  {b.est_particulier && <Chip ton="vert">Particulier</Chip>}
                </div>

                {mode === 'presentes' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ background: r.bg, color: r.c, border: `1px solid ${r.bd}`, borderRadius: 20, padding: '5px 13px', fontSize: 13, fontWeight: 700 }}>
                      {r.i} {r.l}
                    </span>
                    {b.envoye_le && (
                      <span style={{ fontSize: 12.5, color: '#94a3b8' }}>
                        envoyé le {new Date(b.envoye_le).toLocaleDateString('fr-FR')}
                        {b.canal_envoi ? ` · ${b.canal_envoi === 'mail' ? 'par mail' : b.canal_envoi === 'whatsapp' ? 'WhatsApp' : 'lien'}` : ''}
                      </span>
                    )}
                  </div>
                )}

                {b.retour_client && (
                  <div style={{ background: r.bg, border: `1px solid ${r.bd}`, borderLeft: `3px solid ${r.c}`, borderRadius: 10, padding: '8px 12px', fontSize: 13.5, color: r.c, fontStyle: 'italic' }}>
                    « {b.retour_client} »
                  </div>
                )}

                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 'auto', paddingTop: 4 }}>
                  {b.url && <BoutonLien href={b.url}>↗&nbsp; Annonce d&apos;origine</BoutonLien>}
                  <BoutonLien onClick={() => onFiche(b.id)}>✎&nbsp; Détail</BoutonLien>
                  <BoutonLien onClick={() => setFrise(ouvert ? null : b.id)} actif={ouvert}>
                    ◷&nbsp; {ouvert ? 'Masquer le parcours' : 'Parcours du bien'}
                  </BoutonLien>
                </div>
              </div>

              <div style={{ borderLeft: `1px solid ${BORD}`, background: '#fbfcfe', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                {mode === 'selection' ? (
                  <>
                    {b.pdf_statut === 'pret' && b.pdf_url ? (
                      <a href={b.pdf_url} target="_blank" rel="noopener noreferrer" style={btn('#f7f9fc', NAVY, BORD)}>📄 Consulter le PDF</a>
                    ) : b.pdf_statut === 'demande' ? (
                      <span style={{ ...btn('#fdfaf1', '#a17d2c', '#ecdcb4'), cursor: 'default' }}>⏳ En fabrication</span>
                    ) : (
                      <button type="button" onClick={() => demanderPdf(b.id)} style={btn('#f7f9fc', NAVY, BORD)}>📄 Préparer le PDF</button>
                    )}
                    <button type="button" onClick={() => setEnvoi(b)} style={btn(OR, 'white')}>📤 Envoyer</button>
                    {b.pdf_message && (
                      <div style={{ fontSize: 11.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 9px', lineHeight: 1.45 }}>
                        {b.pdf_message}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setObs(b)} style={btn(NAVY, 'white')}>💬 Observation</button>
                    <button type="button" onClick={() => onVisite(b.id)} style={btn('#f5f3ff', '#7c3aed', '#ddd6fe')}>📅 Planifier une visite</button>
                    {b.pdf_url && <a href={b.pdf_url} target="_blank" rel="noopener noreferrer" style={btn('#f7f9fc', NAVY, BORD)}>📄 Le PDF</a>}
                    <button type="button" onClick={() => renvoyerEnSelection(b.id)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Remettre en sélection
                    </button>
                  </>
                )}
              </div>
            </div>

            {ouvert && (
              <div style={{ borderTop: `1px solid ${BORD}`, background: '#fbfcfe', padding: '16px 18px 10px' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .9, marginBottom: 8 }}>
                  Parcours du bien
                </div>
                <Frise bienId={b.id} rafraichir={tick} />
              </div>
            )}
          </div>
        );
      })}

      {obs && (
        <ModaleObservation bien={obs} clientId={clientId} onFerme={() => setObs(null)} onEnregistre={recharge} />
      )}
      {envoi && (
        <ModaleEnvoi bien={envoi} clientId={clientId} client={client}
          onFerme={() => setEnvoi(null)} onEnvoye={recharge} onMail={onMail} />
      )}
    </div>
  );
}

function Sep() { return <span style={{ color: '#dbe3ec' }}>·</span>; }

/* styles */
function btn(bg: string, fg: string, bd?: string): React.CSSProperties {
  return {
    background: bg, color: fg, border: bd ? `1px solid ${bd}` : 'none', borderRadius: 10,
    padding: '10px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    width: '100%', boxSizing: 'border-box', textAlign: 'center',
  };
}
const lien: React.CSSProperties = { fontSize: 12.5, color: '#3b82f6', textDecoration: 'none', fontWeight: 600 };
const lienBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#64748b', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 };
function nav(cote: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', [cote]: 6,
    width: 26, height: 26, borderRadius: '50%', background: 'rgba(26,35,50,.6)', color: 'white',
    border: 'none', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  } as React.CSSProperties;
}
