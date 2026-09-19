'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase, addJournal } from '@/lib/supabase';
import {
  Chip, BoutonLien, CARTE, Vignettes, Specs, BandeauMarche, ModaleScore,
  StylesEmilio, Icone, Action, NAVY, OR, BORD,
} from './ParcoursBien';

/**
 * Onglet Veille — les biens trouvés par la veille, en attente d'arbitrage.
 *   Retenir → passe dans l'onglet Sélection
 *   Écarter → sort de la liste, avec un motif relu par la veille suivante
 */

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
  const [descriptif, setDescriptif] = useState<Record<string, boolean>>({});
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
      adresse_probable: p.adresse_probable || null, situation: p.situation || null,
      type_bien: p.type_bien, surface: p.surface, nb_pieces: p.nb_pieces, nb_chambres: p.nb_chambres,
      surface_sejour: p.surface_sejour || null, surface_exterieur: p.surface_exterieur || null,
      etage: p.etage, etage_total: p.etage_total, annee_construction: p.annee_construction,
      exposition: p.exposition || null, dpe: p.dpe || null, ges: p.ges || null,
      parking: p.parking || false, nb_parking: p.nb_parking || null,
      balcon: p.balcon || false, terrasse: p.terrasse || false,
      jardin: p.jardin || false, cave: p.cave || false, ascenseur: p.ascenseur || false,
      gardien: p.gardien || false, description: p.description, prix_vendeur: p.prix,
      commission_type: 'pourcentage', commission_val: null, prix_acquereur: p.prix,
      nb_lots: p.nb_lots, photos: p.photos || [],
      source_portail: p.portail || 'Veille', agence_nom: p.agence || null, badge_retour: 'propose',
      etape: 'selection', yanport_id: p.yanport_id || null, est_particulier: p.est_particulier || false,
      // infos marché — elles suivent le bien dans la Sélection
      date_publication: p.date_publication || null, prix_initial: p.prix_initial || null,
      nb_baisses: p.nb_baisses || null, nb_agences: p.nb_agences || null,
      historique_prix: p.historique_prix || [], date_derniere_baisse: p.date_derniere_baisse || null,
      score: p.score ?? null, points_forts: p.points_forts || null, points_attention: p.points_attention || null,
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
        const enEcart = ecartEnCours === p.id;
        const fort = (p.score || 0) >= 85;
        const ouvertDesc = !!descriptif[p.id];
        const atouts: React.ReactNode[] = [];
        if (p.terrasse && !p.surface_exterieur) atouts.push(<Chip key="t" ton="or">Terrasse</Chip>);
        if (p.balcon && !p.surface_exterieur) atouts.push(<Chip key="b">Balcon</Chip>);
        if (p.jardin && !p.surface_exterieur) atouts.push(<Chip key="j">Jardin</Chip>);
        if (p.parking) atouts.push(<Chip key="p">{p.nb_parking > 1 ? `${p.nb_parking} parkings` : 'Parking'}</Chip>);
        if (p.ascenseur) atouts.push(<Chip key="a">Ascenseur</Chip>);
        if (p.cave) atouts.push(<Chip key="c">Cave</Chip>);
        if (p.gardien) atouts.push(<Chip key="g">Gardien</Chip>);
        if (p.exposition) atouts.push(<Chip key="e">Exposé {p.exposition}</Chip>);

        return (
          <div key={p.id} className="emi-carte" style={{ ...CARTE, opacity: enTraitement === p.id ? 0.45 : 1 }}>

            {/* ── le bandeau de photos ─────────────────────── */}
            <Vignettes photos={p.photos || []}
              coinGauche={p.est_particulier
                ? <span style={{ background: '#10b981', color: 'white', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 800, boxShadow: '0 4px 12px -4px rgba(16,185,129,.9)' }}>Particulier</span>
                : undefined} />

            {/* ── titre, adresse, prix ─────────────────────── */}
            <div style={{ padding: '15px 18px 0', display: 'flex', gap: 18, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 220, flex: '1 1 320px' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: NAVY, lineHeight: 1.3, letterSpacing: -.2 }}>
                  {p.titre || `${p.type_bien || 'Bien'} — ${p.ville || ''}`}
                </div>
                {(p.adresse_probable || p.situation || p.quartier || p.ville) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 13.5, color: '#64748b', flexWrap: 'wrap' }}>
                    <span style={{ color: '#a9b6c8', display: 'flex' }}><Icone nom="lieu" taille={15} /></span>
                    <span style={{ fontWeight: 600 }}>
                      {p.adresse_probable || p.quartier || p.ville}
                      {p.situation ? ` — ${p.situation}` : ''}
                    </span>
                    {p.adresse_probable && (
                      <span style={{ fontSize: 10.5, color: '#a9b6c8', border: `1px solid ${BORD}`, borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>
                        adresse probable
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7, flexShrink: 0 }}>
                {p.score != null && (
                  <button type="button" onClick={() => setScoreOuvert(p)} title="Comment ce score est calculé"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: fort ? '#fdfaf1' : '#f7f9fc', color: fort ? '#a17d2c' : '#64748b',
                      border: `1px solid ${fort ? '#ecdcb4' : BORD}`, borderRadius: 20,
                      padding: '4px 10px 4px 11px', fontSize: 12, fontWeight: 800,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    {p.score}<span style={{ opacity: .6, fontWeight: 600 }}>/100</span>
                    <span style={{ opacity: .7, display: 'flex' }}><Icone nom="info" taille={13} epaisseur={2} /></span>
                  </button>
                )}
                <div style={{ fontSize: 25, fontWeight: 800, color: OR, letterSpacing: -.8, lineHeight: 1 }}>{euros(p.prix)}</div>
                {p.prix && p.surface && (
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                    {Math.round(p.prix / Number(p.surface)).toLocaleString('fr-FR')} €/m²
                  </div>
                )}
              </div>
            </div>

            {/* ── caractéristiques + marché ────────────────── */}
            <div style={{ padding: '13px 18px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              <Specs p={p} />
              <BandeauMarche p={p} />

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

              {(atouts.length > 0 || p.description) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {atouts}
                  {p.description && (
                    <BoutonLien onClick={() => setDescriptif(s => ({ ...s, [p.id]: !ouvertDesc }))} actif={ouvertDesc}>
                      {ouvertDesc ? 'Masquer le descriptif' : 'Lire le descriptif'}
                    </BoutonLien>
                  )}
                </div>
              )}

              {p.description && (
                <div className="emi-volet" data-ouvert={ouvertDesc}>
                  <div>
                    <div style={{ background: '#fbfcfe', border: `1px solid ${BORD}`, borderRadius: 12, padding: '13px 15px', fontSize: 13.5, color: '#334155', lineHeight: 1.75, whiteSpace: 'pre-line' }}>
                      {p.description}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── pied de carte : les actions ──────────────── */}
            <div style={{
              borderTop: `1px solid ${BORD}`, background: '#fbfcfe', padding: '11px 18px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 12, color: '#9aa8bd', fontWeight: 600 }}>
                {p.type_bien || 'Bien'}{p.code_postal ? ` · ${p.code_postal}` : ''}{p.portail ? ` · repéré sur ${p.portail}` : ''}
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {p.url && <Action href={p.url} ton="neutre">↗&nbsp; Voir l&apos;annonce</Action>}
                <Action onClick={() => { setEcartEnCours(enEcart ? null : p.id); setMotif(''); }} disabled={!!enTraitement} ton="neutre">
                  ✕&nbsp; Écarter
                </Action>
                <Action onClick={() => retenir(p)} disabled={!!enTraitement} ton="or">✓&nbsp; Retenir</Action>
              </div>
            </div>

            {enEcart && (
              <div style={{ borderTop: `1px solid ${BORD}`, background: '#fffbeb', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
