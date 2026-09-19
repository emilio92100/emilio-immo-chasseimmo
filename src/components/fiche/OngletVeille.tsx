'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase, addJournal } from '@/lib/supabase';

/**
 * Onglet Veille de la fiche client.
 *
 *  - Retenir → le bien passe dans la table `biens` (onglet Biens)
 *  - Écarter → il sort de la liste, avec un motif relu par la veille suivante
 *
 * Chaque carte affiche, quand la veille les a trouvées, les données de marché :
 * durée de mise en ligne, baisse depuis le prix d'origine, nombre d'agences.
 */

interface Props {
  clientId: string;
  rechercheId: string;
  onChange?: () => void;
}

type P = {
  id: string; url: string; portail: string | null; date_annonce: string | null;
  titre: string | null; type_bien: string | null; ville: string | null;
  code_postal: string | null; quartier: string | null; adresse: string | null;
  adresse_probable: string | null; situation: string | null; agence: string | null;
  date_publication: string | null; prix_initial: number | null;
  nb_baisses: number | null; nb_agences: number | null;
  prix: number | null; surface: number | null; nb_pieces: number | null;
  nb_chambres: number | null; surface_sejour: number | null;
  etage: number | null; etage_total: number | null; annee_construction: number | null;
  nb_lots: number | null; dpe: string | null; ges: string | null;
  terrasse: boolean; balcon: boolean; jardin: boolean; parking: boolean;
  nb_parking: number | null; ascenseur: boolean; cave: boolean; gardien: boolean;
  surface_exterieur: number | null; exposition: string | null;
  description: string | null; photos: string[] | null;
  points_forts: string[] | null; points_attention: string[] | null;
  score: number | null; statut: string; motif_ecart: string | null; created_at: string;
};

const NAVY = '#1a2332';
const OR = '#c9a84c';
const BORD = '#e3e8f0';

/* ── petits blocs réutilisables ─────────────────────────────── */

function Pastille({ children, ton = 'neutre' }: { children: React.ReactNode; ton?: 'neutre' | 'vert' | 'or' | 'ambre' }) {
  const tons = {
    neutre: { bg: '#f7f9fc', fg: '#475569', bd: BORD },
    vert: { bg: '#f0fdf4', fg: '#15803d', bd: '#bbf7d0' },
    or: { bg: '#fdfaf1', fg: '#a17d2c', bd: '#ecdcb4' },
    ambre: { bg: '#fffbeb', fg: '#92400e', bd: '#fde68a' },
  }[ton];
  return (
    <span style={{ background: tons.bg, color: tons.fg, border: `1px solid ${tons.bd}`, padding: '4px 10px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function Icone({ d, c = '#94a3b8', s = 14 }: { d: string; c?: string; s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

const I = {
  oeil: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z',
  check: 'M20 6 9 17l-5-5',
  croix: 'M18 6 6 18M6 6l12 12',
  horloge: 'M12 7v5l3 2',
  lieu: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z',
  baisse: 'M3 7l7 7 4-4 7 7M17 17h4v-4',
  image: 'm21 15-5-5L5 21',
};

/* ── composant ──────────────────────────────────────────────── */

export default function OngletVeille({ clientId, rechercheId, onChange }: Props) {
  const [props_, setProps] = useState<P[]>([]);
  const [ecartees, setEcartees] = useState<P[]>([]);
  const [passage, setPassage] = useState<any>(null);
  const [chargement, setChargement] = useState(true);
  const [voirEcartees, setVoirEcartees] = useState(false);
  const [ecartEnCours, setEcartEnCours] = useState<string | null>(null);
  const [motif, setMotif] = useState('');
  const [enTraitement, setEnTraitement] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [photoIdx, setPhotoIdx] = useState<Record<string, number>>({});

  const charger = useCallback(async () => {
    if (!rechercheId) return;
    setChargement(true);
    const [nouv, ecart, pass] = await Promise.all([
      supabase.from('veille_propositions').select('*').eq('recherche_id', rechercheId).eq('statut', 'nouveau')
        .order('score', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
      supabase.from('veille_propositions').select('*').eq('recherche_id', rechercheId).eq('statut', 'ecarte')
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('veille_passages').select('*').eq('recherche_id', rechercheId)
        .order('demarre_le', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setProps((nouv.data as P[]) || []);
    setEcartees((ecart.data as P[]) || []);
    setPassage(pass.data || null);
    setChargement(false);
  }, [rechercheId]);

  useEffect(() => { charger(); }, [charger]);

  async function retenir(p: P) {
    if (enTraitement) return;
    setEnTraitement(p.id);
    if (p.url) {
      const { data: deja } = await supabase.from('biens').select('id').eq('recherche_id', rechercheId).eq('url', p.url).maybeSingle();
      if (deja) {
        alert('Ce bien est déjà dans la liste des biens.');
        await supabase.from('veille_propositions').update({ statut: 'retenu', bien_id: deja.id, decide_le: new Date().toISOString() }).eq('id', p.id);
        setEnTraitement(null); charger(); onChange?.(); return;
      }
    }
    const { data: bien, error } = await supabase.from('biens').insert({
      client_id: clientId, recherche_id: rechercheId, url: p.url || null,
      titre: p.titre, ville: p.ville, code_postal: p.code_postal,
      quartier: p.quartier || null, adresse: p.adresse || p.adresse_probable || null,
      type_bien: p.type_bien, surface: p.surface, nb_pieces: p.nb_pieces, nb_chambres: p.nb_chambres,
      etage: p.etage, etage_total: p.etage_total, annee_construction: p.annee_construction,
      exposition: p.exposition || null, dpe: p.dpe || null, ges: p.ges || null,
      parking: p.parking || false, balcon: p.balcon || false, terrasse: p.terrasse || false,
      jardin: p.jardin || false, cave: p.cave || false, ascenseur: p.ascenseur || false,
      gardien: p.gardien || false, description: p.description, prix_vendeur: p.prix,
      commission_type: 'pourcentage', commission_val: null, prix_acquereur: p.prix,
      nb_lots: p.nb_lots, photos: p.photos || [],
      source_portail: p.portail || 'Veille', agence_nom: p.agence || null, badge_retour: 'propose',
    }).select().single();

    if (error || !bien) { alert("Impossible d'ajouter ce bien : " + (error?.message || '')); setEnTraitement(null); return; }
    await supabase.from('veille_propositions').update({ statut: 'retenu', bien_id: bien.id, decide_le: new Date().toISOString() }).eq('id', p.id);
    await addJournal(clientId, 'bien_ajoute', `Bien retenu depuis la veille — ${p.titre || p.ville || ''}`, p.url || '');
    setEnTraitement(null); charger(); onChange?.();
  }

  async function ecarter(p: P) {
    if (enTraitement) return;
    setEnTraitement(p.id);
    await supabase.from('veille_propositions').update({
      statut: 'ecarte', motif_ecart: motif.trim() || null, decide_le: new Date().toISOString(),
    }).eq('id', p.id);
    setEcartEnCours(null); setMotif(''); setEnTraitement(null); charger(); onChange?.();
  }

  async function restaurer(p: P) {
    await supabase.from('veille_propositions').update({ statut: 'nouveau', motif_ecart: null, decide_le: null }).eq('id', p.id);
    charger(); onChange?.();
  }

  const euros = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('fr-FR') + ' €');

  const moisDepuis = (d: string | null) => {
    if (!d) return null;
    const m = Math.round((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 30.4));
    if (m < 1) return "moins d'un mois";
    if (m === 1) return '1 mois';
    if (m < 24) return `${m} mois`;
    return `${Math.floor(m / 12)} ans`;
  };

  const quandPassage = () => {
    if (!passage?.termine_le) return null;
    const d = new Date(passage.termine_le);
    const memeJour = d.toDateString() === new Date().toDateString();
    const h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return memeJour ? `aujourd'hui à ${h}` : `${d.toLocaleDateString('fr-FR')} à ${h}`;
  };

  if (chargement) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Chargement de la veille…</div>;
  }

  /* ── une carte ───────────────────────────────────────────── */
  const Carte = (p: P) => {
    const photos = p.photos || [];
    const idx = photoIdx[p.id] || 0;
    const baisse = p.prix_initial && p.prix ? p.prix_initial - p.prix : 0;
    const baissePct = p.prix_initial && p.prix ? Math.round((baisse / p.prix_initial) * 100) : 0;
    const estOuvert = ouvert === p.id;
    const enEcart = ecartEnCours === p.id;

    return (
      <div key={p.id} style={{
        background: 'white', border: `1px solid ${BORD}`, borderRadius: 16,
        overflow: 'hidden', opacity: enTraitement === p.id ? 0.45 : 1,
        boxShadow: '0 1px 3px rgba(16,24,40,0.04)', transition: 'opacity .15s',
      }}>
        <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', flexWrap: 'wrap' }}>

          {/* photo + navigation */}
          <div style={{ width: 232, minWidth: 232, position: 'relative', background: '#e8edf3', minHeight: 176 }}>
            {photos[idx] ? (
              <img src={photos[idx]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', inset: 0 }}
                onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icone d={I.image} c="#b6c2d1" s={26} />
              </div>
            )}
            {photos.length > 1 && (
              <>
                <button type="button" aria-label="Photo précédente"
                  onClick={() => setPhotoIdx(v => ({ ...v, [p.id]: (idx - 1 + photos.length) % photos.length }))}
                  style={navPhoto('left')}>‹</button>
                <button type="button" aria-label="Photo suivante"
                  onClick={() => setPhotoIdx(v => ({ ...v, [p.id]: (idx + 1) % photos.length }))}
                  style={navPhoto('right')}>›</button>
                <span style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(26,35,50,.82)', color: 'white', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                  {idx + 1} / {photos.length}
                </span>
              </>
            )}
            {p.score != null && (
              <span style={{ position: 'absolute', top: 8, left: 8, background: p.score >= 85 ? OR : 'rgba(26,35,50,.82)', color: 'white', borderRadius: 7, padding: '3px 9px', fontSize: 11, fontWeight: 800 }}>
                {p.score}/100
              </span>
            )}
          </div>

          {/* contenu */}
          <div style={{ flexGrow: 1, minWidth: 300, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 9 }}>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: NAVY, lineHeight: 1.3 }}>
                {p.titre || `${p.type_bien || 'Bien'} — ${p.ville || ''}`}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: OR, letterSpacing: -.4, whiteSpace: 'nowrap' }}>{euros(p.prix)}</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 13.5, color: '#475569' }}>
              <span style={{ fontWeight: 700, color: NAVY }}>
                {[p.surface ? `${p.surface} m²` : null, p.nb_pieces ? `${p.nb_pieces} pièces` : null, p.nb_chambres ? `${p.nb_chambres} ch.` : null]
                  .filter(Boolean).join(' · ')}
              </span>
              {p.prix && p.surface ? <span>{Math.round(p.prix / Number(p.surface)).toLocaleString('fr-FR')} €/m²</span> : null}
              {p.etage != null && <span>{p.etage === 0 ? 'RDC' : `${p.etage}ᵉ étage`}{p.etage_total ? `/${p.etage_total}` : ''}</span>}
              {p.annee_construction && <span>immeuble {p.annee_construction}</span>}
              {p.nb_lots && <span>{p.nb_lots} lots</span>}
              {p.dpe && <span style={{ border: `1px solid ${BORD}`, borderRadius: 5, padding: '0 6px', fontWeight: 800, color: NAVY }}>DPE {p.dpe}</span>}
            </div>

            {(p.adresse_probable || p.situation) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#475569' }}>
                <Icone d={I.lieu} />
                <span>{p.adresse_probable}{p.adresse_probable && p.situation ? ' — ' : ''}{p.situation}</span>
                {p.adresse_probable && <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>adresse probable</span>}
              </div>
            )}

            {/* bandeau marché */}
            {(p.date_publication || p.nb_agences || p.prix_initial) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#f7f9fc', border: `1px solid ${BORD}`, borderRadius: 10, padding: '7px 11px' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .8 }}>Marché</span>
                {p.date_publication && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: NAVY, fontWeight: 600 }}>
                    <Icone d={I.horloge} /> en ligne depuis {moisDepuis(p.date_publication)}
                  </span>
                )}
                {baisse > 0 && (
                  <Pastille ton={baissePct >= 8 ? 'vert' : 'neutre'}>
                    − {baisse.toLocaleString('fr-FR')} € ({baissePct} %) depuis {euros(p.prix_initial)}
                  </Pastille>
                )}
                {p.nb_baisses ? <Pastille>{p.nb_baisses} baisses</Pastille> : null}
                {p.nb_agences ? <Pastille ton={p.nb_agences >= 3 ? 'vert' : 'neutre'}>{p.nb_agences} agences</Pastille> : null}
                {p.agence && <Pastille>{p.agence}</Pastille>}
              </div>
            )}

            {!!p.points_forts?.length && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Icone d={I.check} c="#16a34a" s={15} />
                <span style={{ fontSize: 13.5, color: '#15803d', fontWeight: 600, lineHeight: 1.55 }}>{p.points_forts.join(' · ')}</span>
              </div>
            )}
            {!!p.points_attention?.length && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ color: '#d97706', fontWeight: 800, fontSize: 15, lineHeight: 1, marginTop: 1 }}>!</span>
                <span style={{ fontSize: 13.5, color: '#92400e', fontWeight: 600, lineHeight: 1.55 }}>{p.points_attention.join(' · ')}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 2 }}>
              {p.terrasse && <Pastille ton="or">Terrasse{p.surface_exterieur ? ` ${p.surface_exterieur} m²` : ''}</Pastille>}
              {p.balcon && <Pastille>Balcon</Pastille>}
              {p.jardin && <Pastille>Jardin</Pastille>}
              {p.parking && <Pastille>{p.nb_parking && p.nb_parking > 1 ? `${p.nb_parking} parkings` : 'Parking'}</Pastille>}
              {p.ascenseur && <Pastille>Ascenseur</Pastille>}
              {p.cave && <Pastille>Cave</Pastille>}
              {p.exposition && <Pastille>Exposé {p.exposition}</Pastille>}
              {p.portail && <Pastille>{p.portail}</Pastille>}
            </div>
          </div>

          {/* actions */}
          <div style={{ width: 168, minWidth: 168, borderLeft: `1px solid ${BORD}`, background: '#fbfcfe', padding: 14, display: 'flex', flexDirection: 'column', gap: 7, justifyContent: 'center' }}>
            <a href={p.url} target="_blank" rel="noopener noreferrer" style={btn(NAVY, 'white')}>
              <Icone d={I.oeil} c="white" /> Voir l&apos;annonce
            </a>
            <button type="button" onClick={() => retenir(p)} disabled={!!enTraitement} style={btn(OR, 'white')}>
              <Icone d={I.check} c="white" /> Retenir
            </button>
            <button type="button" onClick={() => { setEcartEnCours(enEcart ? null : p.id); setMotif(''); }} disabled={!!enTraitement}
              style={btn(enEcart ? '#f1f5f9' : 'white', enEcart ? NAVY : '#64748b', BORD)}>
              <Icone d={I.croix} c={enEcart ? NAVY : '#94a3b8'} /> Écarter
            </button>
            {p.description && (
              <button type="button" onClick={() => setOuvert(estOuvert ? null : p.id)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 2 }}>
                {estOuvert ? 'Masquer le détail' : 'Voir le détail'}
              </button>
            )}
          </div>
        </div>

        {estOuvert && p.description && (
          <div style={{ borderTop: `1px solid ${BORD}`, padding: '14px 18px', background: '#fbfcfe', fontSize: 13.5, color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
            {p.description}
          </div>
        )}

        {enEcart && (
          <div style={{ borderTop: `1px solid ${BORD}`, background: '#fffbeb', padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label htmlFor={`m-${p.id}`} style={{ fontSize: 11, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: .8 }}>
              Pourquoi l&apos;écarter ?
            </label>
            <input id={`m-${p.id}`} type="text" value={motif} autoFocus
              onChange={e => setMotif(e.target.value)} onKeyDown={e => e.key === 'Enter' && ecarter(p)}
              placeholder="Ex : trop de travaux, boulevard passant, immeuble en brique…"
              style={{ flexGrow: 1, minWidth: 240, border: '1px solid #fde68a', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: NAVY, fontFamily: 'inherit', background: 'white' }} />
            <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>Relu par les prochaines veilles</span>
            <button type="button" onClick={() => ecarter(p)} style={{ ...btn(NAVY, 'white'), width: 'auto', padding: '9px 18px' }}>Confirmer</button>
          </div>
        )}
      </div>
    );
  };

  /* ── rendu ───────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>
            {props_.length === 0 ? 'Aucun bien à valider' : `${props_.length} bien${props_.length > 1 ? 's' : ''} à valider`}
          </span>
          {passage?.termine_le && (
            <span style={{ fontSize: 13, color: '#64748b' }}>
              Dernière veille {quandPassage()}
              {passage.nb_lues ? ` — ${passage.nb_lues} annonces lues` : ''}
              {passage.nb_ecartees ? `, ${passage.nb_ecartees} écartées` : ''}
            </span>
          )}
        </div>
        {ecartees.length > 0 && (
          <button type="button" onClick={() => setVoirEcartees(v => !v)}
            style={{ background: 'white', border: `1px solid ${BORD}`, borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
            {voirEcartees ? 'Masquer les écartées' : `${ecartees.length} écartée${ecartees.length > 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {props_.length === 0 && !voirEcartees && (
        <div style={{ background: 'white', border: `1px solid ${BORD}`, borderRadius: 16, padding: '44px 20px', textAlign: 'center' }}>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: 5, fontSize: 15 }}>Rien de nouveau pour l&apos;instant</div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>
            {passage?.termine_le ? "La dernière veille n'a rien trouvé qui corresponde." : "La veille n'a pas encore tourné sur cette recherche."}
          </div>
        </div>
      )}

      {props_.map(Carte)}

      {voirEcartees && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .9 }}>Annonces écartées</div>
          {ecartees.map(p => (
            <div key={p.id} style={{ background: '#f8fafc', border: `1px solid ${BORD}`, borderRadius: 11, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#64748b', flexGrow: 1 }}>{p.titre || p.ville}</span>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>{euros(p.prix)}</span>
              {p.motif_ecart && <Pastille ton="ambre">{p.motif_ecart}</Pastille>}
              <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Voir</a>
              <button type="button" onClick={() => restaurer(p)} style={{ background: 'none', border: 'none', color: OR, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Remettre</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── styles ─────────────────────────────────────────────────── */

function btn(bg: string, fg: string, bd?: string): React.CSSProperties {
  return {
    background: bg, color: fg, border: bd ? `1px solid ${bd}` : 'none', borderRadius: 9,
    padding: '10px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    width: '100%', boxSizing: 'border-box',
  };
}

function navPhoto(cote: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', [cote]: 6,
    width: 26, height: 26, borderRadius: '50%', background: 'rgba(26,35,50,.6)', color: 'white',
    border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: '24px', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  } as React.CSSProperties;
}
