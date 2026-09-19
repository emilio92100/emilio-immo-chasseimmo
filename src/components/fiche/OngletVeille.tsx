'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase, addJournal } from '@/lib/supabase';
import { Dpe, Chip, BoutonLien, GRILLE_CARTE, CARTE, Galerie, ModaleScore, StylesEmilio } from './ParcoursBien';

/**
 * Onglet Veille — les biens trouvés par la veille, en attente d'arbitrage.
 *   Retenir → passe dans l'onglet Sélection
 *   Écarter → sort de la liste, avec un motif relu par la veille suivante
 */

const NAVY = '#1a2332';
const OR = '#c9a84c';
const BORD = '#e3e8f0';

interface Props { clientId: string; rechercheId: string; onChange?: () => void; }

export default function OngletVeille({ clientId, rechercheId, onChange }: Props) {
  const [props_, setProps] = useState<any[]>([]);
  const [ecartees, setEcartees] = useState<any[]>([]);
  const [passage, setPassage] = useState<any>(null);
  const [chargement, setChargement] = useState(true);
  const [voirEcartees, setVoirEcartees] = useState(false);
  const [ecartEnCours, setEcartEnCours] = useState<string | null>(null);
  const [motif, setMotif] = useState('');
  const [enTraitement, setEnTraitement] = useState<string | null>(null);
  const [volet, setVolet] = useState<Record<string, 'detail' | null>>({});
  const [scoreOuvert, setScoreOuvert] = useState<any>(null);

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
    setProps(nouv.data || []);
    setEcartees(ecart.data || []);
    setPassage(pass.data || null);
    setChargement(false);
  }, [rechercheId]);

  useEffect(() => { charger(); }, [charger]);

  async function retenir(p: any) {
    if (enTraitement) return;
    setEnTraitement(p.id);
    if (p.url) {
      const { data: deja } = await supabase.from('biens').select('id').eq('recherche_id', rechercheId).eq('url', p.url).maybeSingle();
      if (deja) {
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
      etape: 'selection', yanport_id: p.yanport_id || null, est_particulier: p.est_particulier || false,
    }).select().single();

    if (error || !bien) { alert("Impossible d'ajouter ce bien : " + (error?.message || '')); setEnTraitement(null); return; }
    await supabase.from('veille_propositions').update({ statut: 'retenu', bien_id: bien.id, decide_le: new Date().toISOString() }).eq('id', p.id);
    await supabase.from('journal').insert({
      client_id: clientId, bien_id: bien.id, recherche_id: rechercheId,
      type: 'veille_trouve', titre: `Trouvé par la veille${p.score ? ` · score ${p.score}/100` : ''}`,
      description: p.points_forts?.join(' · ') || null, metadata: {},
    });
    await addJournal(clientId, 'bien_ajoute', `Retenu depuis la veille — ${p.titre || p.ville || ''}`, p.url || '');
    setEnTraitement(null); charger(); onChange?.();
  }

  async function ecarter(p: any) {
    if (enTraitement) return;
    setEnTraitement(p.id);
    await supabase.from('veille_propositions').update({
      statut: 'ecarte', motif_ecart: motif.trim() || null, decide_le: new Date().toISOString(),
    }).eq('id', p.id);
    setEcartEnCours(null); setMotif(''); setEnTraitement(null); charger(); onChange?.();
  }

  async function restaurer(p: any) {
    await supabase.from('veille_propositions').update({ statut: 'nouveau', motif_ecart: null, decide_le: null }).eq('id', p.id);
    charger(); onChange?.();
  }

  const euros = (n: any) => (n == null ? '—' : Number(n).toLocaleString('fr-FR') + ' €');

  const duree = (d: string | null) => {
    if (!d) return null;
    const m = Math.round((Date.now() - new Date(d).getTime()) / 2.628e9);
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
    return memeJour ? `aujourd'hui à ${h}` : `le ${d.toLocaleDateString('fr-FR')} à ${h}`;
  };

  if (chargement) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Chargement de la veille…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <StylesEmilio />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 19, fontWeight: 800, color: NAVY, letterSpacing: -0.3 }}>
            {props_.length === 0 ? 'Aucun bien à valider' : `${props_.length} bien${props_.length > 1 ? 's' : ''} à valider`}
          </span>
          {passage?.termine_le && (
            <span style={{ fontSize: 13, color: '#94a3b8' }}>
              dernière veille {quandPassage()}
              {passage.nb_lues ? ` · ${passage.nb_lues} annonces lues` : ''}
              {passage.nb_ecartees ? `, ${passage.nb_ecartees} écartées` : ''}
            </span>
          )}
        </div>
        {ecartees.length > 0 && (
          <BoutonLien onClick={() => setVoirEcartees(v => !v)} actif={voirEcartees}>
            {voirEcartees ? 'Masquer les écartées' : `${ecartees.length} écartée${ecartees.length > 1 ? 's' : ''}`}
          </BoutonLien>
        )}
      </div>

      {props_.length === 0 && !voirEcartees && (
        <div style={{ ...CARTE, padding: '48px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 12 }}>🔎</div>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: 5, fontSize: 15.5 }}>Rien de nouveau pour l&apos;instant</div>
          <div style={{ color: '#94a3b8', fontSize: 13.5 }}>
            {passage?.termine_le ? "La dernière veille n'a rien trouvé qui corresponde." : "La veille n'a pas encore tourné sur cette recherche."}
          </div>
        </div>
      )}

      {props_.map((p) => {
        const photos: string[] = p.photos || [];
        const v = volet[p.id] || null;
        const enEcart = ecartEnCours === p.id;
        const baisse = p.prix_initial && p.prix ? p.prix_initial - p.prix : 0;
        const baissePct = p.prix_initial && p.prix ? Math.round((baisse / p.prix_initial) * 100) : 0;
        const fort = (p.score || 0) >= 85;

        return (
          <div key={p.id} className="emi-carte" style={{ ...CARTE, opacity: enTraitement === p.id ? 0.45 : 1 }}>
            <div style={GRILLE_CARTE}>

              <Galerie photos={photos} hauteur={196} coin={<>
                {p.score != null && (
                  <button type="button" onClick={() => setScoreOuvert(p)} title="Comment ce score est calculé"
                    style={{
                      position: 'absolute', top: 10, left: 10, zIndex: 3,
                      background: fort ? OR : 'rgba(15,23,42,.8)', color: 'white',
                      borderRadius: 9, padding: '5px 9px', fontSize: 12, fontWeight: 800,
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 5,
                      boxShadow: '0 3px 10px rgba(15,23,42,.3)',
                    }}>
                    {p.score}<span style={{ opacity: .65, fontWeight: 600 }}>/100</span>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,.75)', fontSize: 9.5, lineHeight: '11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>i</span>
                  </button>
                )}
                {p.est_particulier && (
                  <span style={{ position: 'absolute', top: 10, right: 10, zIndex: 3, background: '#10b981', color: 'white', borderRadius: 7, padding: '3px 9px', fontSize: 11, fontWeight: 800 }}>Particulier</span>
                )}
              </>} />

              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 17.5, fontWeight: 800, color: NAVY, lineHeight: 1.3 }}>
                      {p.titre || `${p.type_bien || 'Bien'} — ${p.ville || ''}`}
                    </div>
                    {(p.adresse_probable || p.situation) && (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 5, fontSize: 13, color: '#64748b', flexWrap: 'wrap' }}>
                        <span style={{ color: '#94a3b8' }}>◉</span>
                        <span>{p.adresse_probable}{p.adresse_probable && p.situation ? ' — ' : ''}{p.situation}</span>
                        {p.adresse_probable && <span style={{ fontSize: 11, color: '#cbd5e1', fontStyle: 'italic' }}>adresse probable</span>}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 23, fontWeight: 800, color: OR, letterSpacing: -0.6, lineHeight: 1.1 }}>{euros(p.prix)}</div>
                    {p.prix && p.surface && (
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                        {Math.round(p.prix / Number(p.surface)).toLocaleString('fr-FR')} €/m²
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13.5, color: '#475569' }}>
                  {p.surface && <span style={{ fontWeight: 800, color: NAVY, fontSize: 14.5 }}>{p.surface} m²</span>}
                  {p.nb_pieces ? <><Sep />{p.nb_pieces} pièces</> : null}
                  {p.nb_chambres ? <><Sep />{p.nb_chambres} chambres</> : null}
                  {p.surface_sejour ? <><Sep />séjour {p.surface_sejour} m²</> : null}
                  {p.etage != null ? <><Sep />{p.etage === 0 ? 'RDC' : `${p.etage}ᵉ étage`}{p.etage_total ? `/${p.etage_total}` : ''}</> : null}
                  {p.annee_construction ? <><Sep />immeuble {p.annee_construction}</> : null}
                  {p.nb_lots ? <><Sep />{p.nb_lots} lots</> : null}
                  <Dpe lettre={p.dpe} />
                  <Dpe lettre={p.ges} label="GES" />
                </div>

                {(p.date_publication || p.nb_agences || p.prix_initial) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#f7f9fc', border: `1px solid ${BORD}`, borderRadius: 11, padding: '8px 12px' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Marché</span>
                    {p.date_publication && <Chip>en ligne depuis {duree(p.date_publication)}</Chip>}
                    {baisse > 0 && <Chip ton={baissePct >= 8 ? 'vert' : 'neutre'}>− {baisse.toLocaleString('fr-FR')} € ({baissePct} %)</Chip>}
                    {p.nb_baisses ? <Chip>{p.nb_baisses} baisses</Chip> : null}
                    {p.nb_agences ? <Chip ton={p.nb_agences >= 3 ? 'vert' : 'neutre'}>{p.nb_agences} agence{p.nb_agences > 1 ? 's' : ''}</Chip> : null}
                    {p.agence && <Chip>{p.agence}</Chip>}
                  </div>
                )}

                {!!p.points_forts?.length && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                    <span style={{ color: '#16a34a', fontWeight: 800, fontSize: 14, lineHeight: 1.5 }}>✓</span>
                    <span style={{ fontSize: 13.5, color: '#15803d', fontWeight: 600, lineHeight: 1.6 }}>{p.points_forts.join(' · ')}</span>
                  </div>
                )}
                {!!p.points_attention?.length && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                    <span style={{ color: '#d97706', fontWeight: 800, fontSize: 14, lineHeight: 1.5 }}>!</span>
                    <span style={{ fontSize: 13.5, color: '#92400e', fontWeight: 600, lineHeight: 1.6 }}>{p.points_attention.join(' · ')}</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 4, alignItems: 'center' }}>
                  {p.terrasse && <Chip ton="or">Terrasse{p.surface_exterieur ? ` ${p.surface_exterieur} m²` : ''}</Chip>}
                  {p.balcon && <Chip>Balcon</Chip>}
                  {p.jardin && <Chip>Jardin</Chip>}
                  {p.parking && <Chip>{p.nb_parking > 1 ? `${p.nb_parking} parkings` : 'Parking'}</Chip>}
                  {p.ascenseur && <Chip>Ascenseur</Chip>}
                  {p.cave && <Chip>Cave</Chip>}
                  {p.exposition && <Chip>Exposé {p.exposition}</Chip>}
                  {p.portail && <Chip>{p.portail}</Chip>}
                  {p.description && (
                    <BoutonLien onClick={() => setVolet(s => ({ ...s, [p.id]: v === 'detail' ? null : 'detail' }))} actif={v === 'detail'}>
                      {v === 'detail' ? 'Masquer le descriptif' : 'Lire le descriptif'}
                    </BoutonLien>
                  )}
                </div>
              </div>

              <div style={{ borderLeft: `1px solid ${BORD}`, background: '#fbfcfe', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                <a href={p.url} target="_blank" rel="noopener noreferrer" style={btn(NAVY, 'white')}>Voir l&apos;annonce</a>
                <button type="button" onClick={() => retenir(p)} disabled={!!enTraitement} style={btn(OR, 'white')}>✓&nbsp; Retenir</button>
                <button type="button" onClick={() => { setEcartEnCours(enEcart ? null : p.id); setMotif(''); }} disabled={!!enTraitement}
                  style={btn(enEcart ? '#eef2f7' : 'white', enEcart ? NAVY : '#64748b', BORD)}>✕&nbsp; Écarter</button>
              </div>
            </div>

            {v === 'detail' && p.description && (
              <div style={{ borderTop: `1px solid ${BORD}`, background: '#fbfcfe', padding: '16px 20px', fontSize: 13.5, color: '#334155', lineHeight: 1.75, whiteSpace: 'pre-line' }}>
                {p.description}
              </div>
            )}

            {enEcart && (
              <div style={{ borderTop: `1px solid ${BORD}`, background: '#fffbeb', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <label htmlFor={`m-${p.id}`} style={{ fontSize: 10.5, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.9 }}>Pourquoi l&apos;écarter ?</label>
                <input id={`m-${p.id}`} type="text" value={motif} autoFocus
                  onChange={e => setMotif(e.target.value)} onKeyDown={e => e.key === 'Enter' && ecarter(p)}
                  placeholder="Ex : trop de travaux, boulevard passant, immeuble en brique…"
                  style={{ flexGrow: 1, minWidth: 240, border: '1px solid #fde68a', borderRadius: 9, padding: '9px 13px', fontSize: 13.5, color: NAVY, fontFamily: 'inherit', background: 'white', outline: 'none' }} />
                <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>Relu par les prochaines veilles</span>
                <button type="button" onClick={() => ecarter(p)}
                  style={{ background: NAVY, color: 'white', border: 'none', borderRadius: 9, padding: '9px 20px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Confirmer</button>
              </div>
            )}
          </div>
        );
      })}

      {scoreOuvert && <ModaleScore p={scoreOuvert} onFerme={() => setScoreOuvert(null)} />}

      {voirEcartees && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 6 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Annonces écartées</div>
          {ecartees.map(p => (
            <div key={p.id} style={{ background: '#f8fafc', border: `1px solid ${BORD}`, borderRadius: 12, padding: '11px 15px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#64748b', flexGrow: 1, minWidth: 180 }}>{p.titre || p.ville}</span>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>{euros(p.prix)}</span>
              {p.motif_ecart && <Chip ton="ambre">{p.motif_ecart}</Chip>}
              <BoutonLien href={p.url}>Voir</BoutonLien>
              <BoutonLien onClick={() => restaurer(p)}>Remettre</BoutonLien>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Sep() { return <span style={{ color: '#dbe3ec' }}>·</span>; }

function btn(bg: string, fg: string, bd?: string): React.CSSProperties {
  return {
    background: bg, color: fg, border: bd ? `1px solid ${bd}` : 'none', borderRadius: 10,
    padding: '11px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '100%', boxSizing: 'border-box',
  };
}
